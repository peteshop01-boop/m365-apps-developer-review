import type { IAuthenticatedRequestLedgerChannel } from '../services/persistence/RequestLedgerExpensePort';
import { copyRequestEnvelope, decodeRequest, RequestLedgerExpensePort } from '../services/persistence/RequestLedgerExpensePort';
import { ExpenseEntryAdapter } from '../services/persistence/ExpenseEntryAdapter';
import type { EntryAdmission } from '../services/persistence/ExpenseEntryAdapter';
import { ExpensePersistenceService, matchesPreparedExpense } from '../services/persistence/ExpensePersistenceService';
import { ADMISSION_GATES, browserSha256 } from '../services/persistence/PersistenceContract';
import type { Digest } from '../services/persistence/PersistenceContract';
import { nominalMaster } from '../data/nominals';
import { parseUkDate } from '../domain/expenseRules';
import type { IStoredExpense, StoredReceipt } from '../services/persistence/PersistenceContract';
import { operation, positiveId } from '../services/persistence/PersistenceValidation';
import type { IOperationLedger, IServerPolicy } from './StandardExpenseProcessor';
import { equalBytes } from './StandardExpenseProcessor';
import { createImmutableRequestFile, TEST_SITE } from './SharePointStandardPlans';
import { row } from './SharePointRequestReader';
import { SharePointStandardStore } from './SharePointStandardStore';
import { StandardStoreIO } from './StandardStoreTransport';
import { BrowserRequestTransport } from './BrowserRequestTransport';
import type { IRequestBrowserPlatform, IRequestTransportBinding } from './BrowserRequestTransport';
import type { IStandardStoreSchema } from './SharePointStandardStore';

/** Application connection is the signed-in caller, never the processor's
 * service connection. Real SharePoint ACLs must independently enforce raw
 * access. This source composes only against injected authenticated transport;
 * the production webpart remains Held and provides no activation switch. */
export class SharePointRequestChannel implements IAuthenticatedRequestLedgerChannel {
  private sessionActor: number | undefined;
  private identityInvalid = false;
  public constructor(private readonly caller: StandardStoreIO, private readonly reads: SharePointStandardStore, private readonly requestRoot: string) {
    if (!/^\/sites\/REVIEW-TEST-SITE\/[A-Za-z0-9 _-]+$/.test(requestRoot)) throw new Error('UNQUALIFIED_REQUEST_ROOT');
  }
  private async actor(): Promise<number> {
    const r = await this.caller.execute({ method: 'GET', url: `${TEST_SITE}/_api/web/currentuser?$select=Id`, headers: { Accept: 'application/json;odata=nometadata' }, retry: 'none' });
    if (r.status !== 200) throw new Error('IDENTITY_UNAVAILABLE'); const v = row(r.body, ['Id']);
    if (!positiveId(v.Id)) throw new Error('INVALID_IDENTITY'); return this.pinActor(v.Id);
  }
  private pinActor(actor: number): number {
    if (this.identityInvalid || (this.sessionActor !== undefined && actor !== this.sessionActor)) {
      this.identityInvalid = true; throw new Error('SESSION_IDENTITY_CHANGED');
    }
    this.sessionActor = actor; return actor;
  }
  private assertSession(actor: number): void {
    if (this.identityInvalid || this.sessionActor !== actor) throw new Error('SESSION_IDENTITY_CHANGED');
  }
  private async checkedResult<T>(actor: number, work: Promise<T>): Promise<T> {
    const result = await work;
    await this.ordinaryActor(actor);
    this.assertSession(actor); return result;
  }
  private async ordinaryActor(expected?: number): Promise<number> {
    if (expected !== undefined && !positiveId(expected)) throw new Error('IDENTITY_HELD');
    const r = await this.caller.execute({ method: 'GET', url: `${TEST_SITE}/_api/web/currentuser?$select=Id,IsSiteAdmin`, headers: { Accept: 'application/json;odata=nometadata' }, retry: 'none' });
    if (r.status !== 200) throw new Error('IDENTITY_UNAVAILABLE');
    const value = row(r.body, ['Id', 'IsSiteAdmin']);
    if (!positiveId(value.Id) || value.Id > 2147483647) throw new Error('IDENTITY_HELD');
    if (this.sessionActor !== undefined && this.sessionActor !== value.Id) {
      this.identityInvalid = true; throw new Error('SESSION_IDENTITY_CHANGED');
    }
    if (value.IsSiteAdmin !== false) throw new Error('IDENTITY_HELD');
    const actor = this.pinActor(value.Id);
    if (expected !== undefined && actor !== expected) throw new Error('IDENTITY_HELD'); return actor;
  }
  /** No accumulated receipt array: validate one bounded sealed request at a
   * time, retaining only IDs/keys. Corrupt/folder/unknown rows never get skipped.
   * Complete collection snapshots detect observed changes, not atomicity: the
   * protected processor's parent CAS remains authoritative for competing writes. */
  private async reconciledRequests(actor: number, parentId: number, history: readonly IOperationLedger[]): Promise<boolean> {
    const ids = await this.reads.ownRequestIds(actor), seen = new Set<string>(); let resolved = true;
    for (const requestId of ids) {
      const request = await this.reads.readRequest(requestId);
      if (request.id !== requestId || request.authorId !== actor) throw new Error('REQUEST_BINDING');
      if (request.command.parentId !== parentId) continue;
      const key = `${actor}:${request.command.operationId}`;
      if (seen.has(key)) throw new Error('DUPLICATE_REQUEST_OPERATION'); seen.add(key);
      const op = history.find(v => v.key === key);
      if (!op || op.requestId !== request.id || op.originatorId !== actor || op.parentId !== parentId || op.state === 'Pending') { resolved = false; continue; }
      if (op.state === 'Rejected') { if (!await this.reads.operationReleased(parentId, key)) resolved = false; continue; }
      const current = await this.result(actor, op) as { state: string; record?: IStoredExpense };
      if (current.state !== 'Ready' || !current.record || current.record.operationId !== request.command.operationId ||
          current.record.requestFingerprint !== request.clientFingerprint || !matchesPreparedExpense(request.command, current.record) ||
          current.record.line.nominalDescription !== nominalMaster.find(n => n.code === request.command.nominalCode)?.description) { resolved = false; continue; }
      if (request.command.receipt.kind === 'file') {
        const bytes = await this.reads.readReceipt(current.record);
        if (!bytes || !equalBytes(bytes, request.command.receipt.bytes) ||
            JSON.stringify(await this.result(actor, op)) !== JSON.stringify(current)) resolved = false;
      }
    }
    if (history.some(op => !seen.has(op.key))) resolved = false;
    const afterIds = await this.reads.ownRequestIds(actor), afterHistory = await this.reads.ownHistory(actor, parentId);
    const sorted = (values: readonly IOperationLedger[]): string => JSON.stringify([...values].sort((a, b) => a.key.localeCompare(b.key)));
    return resolved && JSON.stringify(ids) === JSON.stringify(afterIds) && sorted(history) === sorted(afterHistory);
  }
  /** Fixed parent/fixture actor are deployment-owned inputs, never form values.
   * These verified reads do not prove schema, licences or raw tenant ACLs. */
  public async readEntryContext(parentId: number, fixtureActorId: number): Promise<EntryAdmission> {
    const held = (): EntryAdmission => ({ state: 'Held', gates: ADMISSION_GATES });
    const allowed = (p: IServerPolicy): boolean => p.actorId === fixtureActorId && p.ownerId === fixtureActorId && p.parentId === parentId &&
      p.active === true && p.monthOpen === true && p.status === 'Draft' && /^\d{4}-\d{2}$/.test(p.month) &&
      !!parseUkDate(`01-${p.month.slice(5)}-${p.month.slice(0, 4)}`) && p.nominals.length === 195 &&
      new Set(p.nominals.map(n => n.code)).size === 195 && nominalMaster.every(n => p.nominals.some(m => m.code === n.code && m.description === n.description)) &&
      new Set(p.eligibleCodes).size === p.eligibleCodes.length && p.eligibleCodes.every(code => nominalMaster.some(n => n.code === code));
    try {
      if (!positiveId(parentId)) return held();
      const actor = await this.ordinaryActor(fixtureActorId), before = (await this.reads.readPolicy(actor, parentId)).policy;
      if (!allowed(before)) return held();
      const history = await this.reads.ownHistory(actor, parentId), reconciled = await this.reconciledRequests(actor, parentId, history);
      const existingExpenseIds = await this.readOwnSavedIds(parentId);
      const after = (await this.reads.readPolicy(await this.ordinaryActor(fixtureActorId), parentId)).policy;
      if (!allowed(after) || JSON.stringify(before) !== JSON.stringify(after)) return held();
      const free = await this.reads.creationParentAvailable(parentId, after.parentEtag);
      await this.ordinaryActor(actor);
      this.assertSession(actor);
      return { state: 'Ready', context: { parentId, parentEtag: after.parentEtag, month: after.month,
        nominals: nominalMaster.map(n => ({ ...n })), eligibleNominalCodes: [...after.eligibleCodes], existingExpenseIds: [...existingExpenseIds],
        creationClearance: reconciled && free && history.every(op => op.state === 'Completed') ? 'Clear' : 'Unresolved' } };
    } catch { return held(); }
  }
  /** Product-intended entry discovery for ANY approved signed-in staff member.
   * The month selects a period, never an identity or a parent. Re-resolve after
   * existing policy/history checks so a changed roster/Draft cannot leak into
   * a usable context. A missing/ambiguous Draft is held, never auto-created. */
  public async readSignedInEntryContext(month: string): Promise<EntryAdmission> {
    const held = (): EntryAdmission => ({ state: 'Held', gates: ADMISSION_GATES });
    try {
      const actor = await this.ordinaryActor(), parent = await this.reads.resolveOwnDraftParent(actor, month);
      const entry = await this.readEntryContext(parent, actor);
      if (entry.state !== 'Ready' || entry.context.month !== month ||
          await this.reads.resolveOwnDraftParent(await this.ordinaryActor(actor), month) !== parent) return held();
      const policy = (await this.reads.readPolicy(await this.ordinaryActor(actor), parent)).policy;
      if (policy.ownerId !== actor || !policy.active || !policy.monthOpen || policy.status !== 'Draft' ||
          policy.month !== month || policy.parentEtag !== entry.context.parentEtag ||
          JSON.stringify(policy.eligibleCodes) !== JSON.stringify(entry.context.eligibleNominalCodes) ||
          policy.nominals.length !== 195 || new Set(policy.nominals.map(n => n.code)).size !== 195 ||
          nominalMaster.some(n => !policy.nominals.some(m => m.code === n.code && m.description === n.description))) return held();
      await this.ordinaryActor(actor);
      this.assertSession(actor); return entry;
    } catch { return held(); }
  }
  public async createImmutableRequest(op: string, envelope: Uint8Array): Promise<void> {
    const bytes = copyRequestEnvelope(envelope), payload = decodeRequest(bytes);
    if (!operation(op) || payload.command.operationId !== op) throw new Error('INVALID_REQUEST');
    const actor = await this.actor();
    // Per-caller folder must ALREADY exist with qualified create-only rights.
    // This source never creates folders, grants permissions or sets Author.
    const result = await this.caller.execute(createImmutableRequestFile(`${this.requestRoot}/${actor}`, op, bytes));
    this.assertSession(actor);
    if (result.status !== 201 && result.status !== 200) throw new Error('REQUEST_UNCONFIRMED');
    // No automatic retry on 409/lost acknowledgement. Existing service resolves
    // the stable actor-operation ledger and verifies the submitted fingerprint.
  }
  private async result(actor: number, op: IOperationLedger | undefined): Promise<unknown> {
    if (!op) return { state: 'Absent' };
    if (op.originatorId !== actor) return { state: 'Rejected' };
    const policy = await this.reads.readPolicy(actor, op.parentId);
    if (policy.policy.ownerId !== actor || !policy.policy.active) return { state: 'Rejected' };
    if (op.state === 'Pending' || !await this.reads.operationReleased(op.parentId, op.key)) return { state: 'Pending' };
    if (op.state === 'Rejected') return { state: 'Rejected' };
    if (!op.record) return { state: 'Pending' };
    const current = await this.reads.readLine(op.record.line.id);
    if (JSON.stringify(current) !== JSON.stringify(op.record)) return { state: 'Pending' };
    const request = await this.reads.readRequest(op.requestId);
    if (request.authorId !== actor || !await this.reads.verifyLineProvenance(current, request)) return { state: 'Rejected' };
    return { state: 'Ready', record: current };
  }
  public async readOwnOperation(op: string): Promise<unknown> {
    if (!operation(op)) return { state: 'Rejected' }; const actor = await this.actor();
    return this.checkedResult(actor, this.result(actor, await this.reads.findOperation(`${actor}:${op}`)));
  }
  public async readOwnPrevious(parentId: number): Promise<unknown> {
    const actor = await this.actor(), history = await this.reads.ownHistory(actor, parentId);
    const reconciled = await this.reconciledRequests(actor, parentId, history);
    this.assertSession(actor);
    if (!reconciled) return { state: 'Pending' };
    const pending = history.filter(v => v.state === 'Pending'); if (pending.length) return { state: 'Pending' };
    const complete = history.filter(v => v.state === 'Completed');
    // Without a retained operation ID, mixed outcomes cannot identify the last
    // attempt. Never present an older completion over another rejected attempt.
    // Explicit saved-ID reopening remains available through the directory.
    if (history.length === 1 && complete.length === 1) return this.checkedResult(actor, this.result(actor, complete[0]));
    return { state: history.length === 0 ? 'Absent' : complete.length ? 'Pending' : 'Rejected' };
  }
  public async readOwnSavedIds(parentId: number): Promise<readonly number[]> {
    const actor = await this.actor(), history = await this.reads.ownHistory(actor, parentId), ids: number[] = [];
    for (const op of history) if (op.state === 'Completed') {
      const result = await this.result(actor, op) as { state: string; record?: IStoredExpense };
      if (result.state !== 'Ready' || !result.record) throw new Error('HISTORY_UNCONFIRMED'); ids.push(result.record.line.id);
    }
    await this.ordinaryActor(actor);
    this.assertSession(actor); return ids.sort((a, b) => a - b);
  }
  public async readOwnLine(parentId: number, expenseId: number): Promise<unknown> {
    const actor = await this.actor(), line = await this.reads.readLine(expenseId);
    if (line.line.parentId !== parentId || line.line.expenseLineKey !== `D01-${actor}-${line.operationId}`) return { state: 'Rejected' };
    const op = await this.reads.findOperation(`${actor}:${line.operationId}`);
    if (op?.record?.line.id !== expenseId || op.parentId !== parentId) return { state: 'Rejected' };
    return this.checkedResult(actor, this.result(actor, op));
  }
  public async readOwnReceipt(receipt: Extract<StoredReceipt, { kind: 'file' }>): Promise<Uint8Array> {
    const actor = await this.actor(), record = await this.reads.readLine(receipt.expenseId);
    const result = await this.readOwnLine(record.line.parentId, receipt.expenseId) as { state: string; record?: IStoredExpense };
    if (result.state !== 'Ready' || !result.record || JSON.stringify(result.record.receipt) !== JSON.stringify(receipt)) throw new Error('RECEIPT_UNAVAILABLE');
    const bytes = await this.reads.readReceipt(result.record); if (!bytes) throw new Error('RECEIPT_UNAVAILABLE');
    await this.ordinaryActor(actor);
    this.assertSession(actor); return bytes;
  }
}

/** Source composition for a separately qualified deployment. The caller gets
 * only channel methods; its transport refuses every processor/list mutation.
 * Audit storage is processor-only and is not in the browser read allow-list. */
export function composeBrowserRequestChannel(platform: IRequestBrowserPlatform,
  binding: IRequestTransportBinding, schema: IStandardStoreSchema): SharePointRequestChannel {
  const reads = Object.entries(schema.lists).filter(([name]) => name !== 'audit').map(([, id]) => id);
  if (binding.requestListId !== schema.lists.requests || binding.expenseListId !== schema.lists.expenses ||
      reads.some(id => !binding.readListIds.includes(id)) || binding.readListIds.includes(schema.lists.audit)) throw new Error('CHANNEL_BINDING_HELD');
  const io = new StandardStoreIO(new BrowserRequestTransport(platform, binding));
  return new SharePointRequestChannel(io, new SharePointStandardStore(io, schema), binding.requestRoot);
}

/** Actual form/service/channel composition for a separately reviewed fixed
 * fixture binding. The existing web part still constructs only the held path. */
export function createBoundExpenseEntry(channel: SharePointRequestChannel, parentId: number, fixtureActorId: number,
  digest: Digest = browserSha256): ExpenseEntryAdapter {
  if (!positiveId(parentId) || !positiveId(fixtureActorId)) throw new Error('ENTRY_BINDING_HELD');
  return new ExpenseEntryAdapter(new ExpensePersistenceService(new RequestLedgerExpensePort(channel, digest), digest),
    () => channel.readEntryContext(parentId, fixtureActorId));
}

/** Referenced by the SPFx composition, without a fixed claimant or parent.
 * Source integration only: current webpart still constructs the held adapter;
 * multi-user server permissions/processor and A/B native proof remain open. */
export function createStaffExpenseEntry(channel: SharePointRequestChannel, month: () => string,
  digest: Digest = browserSha256): ExpenseEntryAdapter {
  return new ExpenseEntryAdapter(new ExpensePersistenceService(new RequestLedgerExpensePort(channel, digest), digest),
    () => channel.readSignedInEntryContext(month()));
}
