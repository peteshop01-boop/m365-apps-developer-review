import { nominalMaster } from '../data/nominals';
import { parseAmountPence, parseUkDate } from '../domain/expenseRules';
import { copyBoundedBytes } from '../services/persistence/BoundedBody';
import { creationIdentity } from '../services/persistence/PersistenceContract';
import type { IPreparedExpense, IStoredExpense } from '../services/persistence/PersistenceContract';
import { etag, hash, MAX_RECEIPT_BYTES, own, positiveId, snapshotCommand, snapshotStored } from '../services/persistence/PersistenceValidation';

/** Server-intended orchestration/conformance source. NOT a browser authority,
 * installed flow or Node hosting proposal. No production composition imports it.
 * Store primitives require qualified Standard SharePoint actions and actual ACLs.
 * No Standard SHA256 action is assumed: server replay identity compares canonical
 * fields AND exact bytes; submitted SHA values are client integrity claims only. */
export interface ISealedRequest {
  readonly id: number; readonly authorId: number; readonly editorId: number;
  readonly version: number; readonly etag: string;
  readonly command: IPreparedExpense; readonly clientFingerprint: string;
}
export interface IServerPolicy {
  readonly actorId: number; readonly parentId: number; readonly ownerId: number;
  readonly parentEtag: string; readonly month: string; readonly status: 'Draft' | 'Locked';
  readonly active: boolean; readonly monthOpen: boolean;
  readonly nominals: ReadonlyArray<{ readonly code: string; readonly description: string }>;
  readonly eligibleCodes: readonly string[];
}
export interface IOperationLedger {
  readonly key: string; readonly requestId: number; readonly originatorId: number; readonly parentId: number;
  readonly state: 'Pending' | 'Completed' | 'Rejected'; readonly record?: IStoredExpense;
}
export type ProcessorResult = { readonly state: 'Held' | 'Rejected' | 'Pending'; readonly tenantWriteAllowed: false }
  | { readonly state: 'StorageVerified'; readonly record: IStoredExpense; readonly tenantWriteAllowed: false };

/** These are durable conditional store operations, NOT client permission flags.
 * Unique operation/line/audit keys and parent IF-MATCH must be enforced by the
 * qualified store, including every competing writer. No process-memory lock.
 * Unknown writes throw: orchestrator returns Pending and NEVER blindly retries.
 * No expiration/stealing of a parent reservation during uncertain outcome. */
export interface IStandardProcessorStore {
  readRequest(id: number): Promise<unknown>;
  readPolicy(authorId: number, parentId: number): Promise<{ state: 'Held' } | { state: 'Ready'; policy: IServerPolicy }>;
  findOperation(key: string): Promise<IOperationLedger | undefined>;
  reserveOperation(value: IOperationLedger): Promise<IOperationLedger>; // unique key; conflict => existing exact row
  acquireParent(parentId: number, expectedEtag: string, key: string): Promise<'Acquired' | 'Owned' | 'Busy' | 'Stale'>;
  /** Stale is a protected read, not a network/412 inference. Rejection requires
   * exclusive parent CAS custody and fresh Pending ledger + NO line + no prior
   * ownership by this operation, then conditional terminal ledger update/release.
   * This is an all-writer protocol, NOT a cross-list SharePoint transaction.
   * Busy/unknown/partial writes must return false or throw, never mark Rejected. */
  rejectUnwrittenStale(parentId: number, originalEtag: string, key: string): Promise<boolean>;
  recheckParent(parentId: number, key: string, authorId: number, month: string): Promise<boolean>;
  findLine(key: string): Promise<IStoredExpense | undefined>;
  createLineUnique(key: string, request: ISealedRequest, nominalDescription: string): Promise<IStoredExpense>;
  verifyLineProvenance(record: IStoredExpense, original: ISealedRequest): Promise<boolean>;
  readReceipt(record: IStoredExpense): Promise<Uint8Array | undefined>;
  addReceiptNoOverwrite(record: IStoredExpense, bytes: Uint8Array): Promise<void>;
  readLine(id: number): Promise<unknown>;
  appendAuditUnique(key: string, requestId: number, authorId: number, record: IStoredExpense): Promise<void>;
  completeOperation(key: string, record: IStoredExpense): Promise<void>; // conditional and recoverable, result remains private
  releaseParent(parentId: number, key: string): Promise<void>; // ownership CAS; never wildcard
}

const held = (): ProcessorResult => ({ state: 'Held', tenantWriteAllowed: false });
const rejected = (): ProcessorResult => ({ state: 'Rejected', tenantWriteAllowed: false });
const pending = (): ProcessorResult => ({ state: 'Pending', tenantWriteAllowed: false });
export const operationKey = (authorId: number, operationId: string): string => `${authorId}:${operationId}`;
export function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  const left = copyBoundedBytes(a, MAX_RECEIPT_BYTES), right = copyBoundedBytes(b, MAX_RECEIPT_BYTES);
  return left.length === right.length && left.every((v, i) => v === right[i]);
}
export function sealedRequest(raw: unknown): ISealedRequest {
  const v = own(raw, ['id', 'authorId', 'editorId', 'version', 'etag', 'command', 'clientFingerprint']);
  if (!positiveId(v.id) || !positiveId(v.authorId) || v.editorId !== v.authorId || v.version !== 1 || !etag(v.etag) || !hash(v.clientFingerprint)) throw new Error('INVALID_REQUEST');
  const p = own(v.command, ['operationId', 'parentId', 'parentEtag', 'date', 'supplier', 'description', 'nominalCode', 'amount', 'notes', 'receipt']);
  const kind = Object.getOwnPropertyDescriptor(p.receipt, 'kind')?.value;
  const r = own(p.receipt, kind === 'none' ? ['kind', 'reason'] : ['kind', 'fileName', 'mediaType', 'bytes', 'sha256']);
  const receipt = kind === 'none' ? { kind: r.kind, reason: r.reason } : { kind: r.kind, fileName: r.fileName, mediaType: r.mediaType, bytes: r.bytes };
  const c = snapshotCommand({ ...p, receipt });
  if (c.receipt.kind === 'file' && !hash(r.sha256)) throw new Error('INVALID_REQUEST');
  const command: IPreparedExpense = { ...c, receipt: c.receipt.kind === 'none' ? c.receipt : { ...c.receipt, sha256: r.sha256 as string } };
  return { id: v.id, authorId: v.authorId, editorId: v.editorId as number, version: 1, etag: v.etag, command, clientFingerprint: v.clientFingerprint };
}
export function sameRequest(a: ISealedRequest, b: ISealedRequest): boolean {
  return a.authorId === b.authorId && a.clientFingerprint === b.clientFingerprint && creationIdentity(a.command) === creationIdentity(b.command) &&
    (a.command.receipt.kind === 'none' ? b.command.receipt.kind === 'none'
      : b.command.receipt.kind === 'file' && equalBytes(a.command.receipt.bytes, b.command.receipt.bytes));
}
function allowed(p: IServerPolicy, r: ISealedRequest): boolean {
  return p.actorId === r.authorId && p.ownerId === r.authorId && p.parentId === r.command.parentId &&
    p.active === true && p.monthOpen === true && p.status === 'Draft' && /^\d{4}-\d{2}$/.test(p.month) &&
    parseUkDate(r.command.date)?.slice(0, 7) === p.month && positiveId(parseAmountPence(r.command.amount)) &&
    p.nominals.length === 195 && new Set(p.nominals.map(n => n.code)).size === 195 &&
    nominalMaster.every(n => p.nominals.some(actual => actual.code === n.code && actual.description === n.description)) &&
    p.eligibleCodes.includes(r.command.nominalCode);
}
function matchesLine(r: ISealedRequest, value: unknown, description: string): IStoredExpense {
  const record = snapshotStored(value), c = r.command, l = record.line;
  if (record.operationId !== c.operationId || record.requestFingerprint !== r.clientFingerprint || l.parentId !== c.parentId ||
    l.expenseLineKey !== `D01-${r.authorId}-${c.operationId}` || l.dateIso !== parseUkDate(c.date) || l.supplier !== c.supplier ||
    l.description !== c.description || l.nominalCode !== c.nominalCode || l.nominalDescription !== description ||
    l.amountPence !== parseAmountPence(c.amount) || l.notes !== c.notes ||
    (c.receipt.kind === 'none' ? record.receipt.kind !== 'none' || record.receipt.reason !== c.receipt.reason
      : record.receipt.kind !== 'file' || record.receipt.fileName !== c.receipt.fileName || record.receipt.mediaType !== c.receipt.mediaType ||
        record.receipt.size !== c.receipt.bytes.length || record.receipt.sha256 !== c.receipt.sha256)) throw new Error('LINE_MISMATCH');
  return record;
}

export class StandardExpenseProcessor {
  public constructor(private readonly store: IStandardProcessorStore) {}
  public async process(requestId: number): Promise<ProcessorResult> {
    if (!positiveId(requestId)) return rejected();
    try {
      // Trigger supplies ID only; identity/payload are freshly fetched from storage.
      const request = sealedRequest(await this.store.readRequest(requestId));
      if (request.id !== requestId) return rejected();
      const admitted = await this.store.readPolicy(request.authorId, request.command.parentId);
      if (admitted.state !== 'Ready') return held();
      const p = admitted.policy;
      const key = operationKey(request.authorId, request.command.operationId);
      let ledger = await this.store.findOperation(key);
      if (!ledger) {
        if (!allowed(p, request)) return rejected();
        // Existing orphan line without its operation is recovery, never permission to create.
        if (await this.store.findLine(key)) return pending();
        if (p.parentEtag !== request.command.parentEtag) return rejected();
        ledger = await this.store.reserveOperation({ key, requestId, originatorId: request.authorId, parentId: p.parentId, state: 'Pending' });
      }
      if (ledger.key !== key || ledger.originatorId !== request.authorId || ledger.parentId !== p.parentId || !positiveId(ledger.requestId)) return rejected();
      const original = sealedRequest(await this.store.readRequest(ledger.requestId));
      if (original.id !== ledger.requestId || !sameRequest(request, original)) return rejected(); // actual bytes, not just client SHA
      // Existing writes never become a fresh-create rejection. Current read
      // authority remains mandatory, but a closed month does not erase a result.
      if (p.ownerId !== request.authorId || p.actorId !== request.authorId || !p.active || p.month !== parseUkDate(request.command.date)?.slice(0, 7)) return pending();
      if (ledger.state === 'Rejected') { await this.store.releaseParent(p.parentId, key); return rejected(); }
      if (ledger.state !== 'Pending' && ledger.state !== 'Completed') return rejected();
      if (ledger.state === 'Completed') {
        if (!ledger.record) return pending();
        const record = matchesLine(original, await this.store.readLine(ledger.record.line.id), ledger.record.line.nominalDescription);
        if (JSON.stringify(record) !== JSON.stringify(ledger.record) || !await this.store.verifyLineProvenance(record, original) ||
            !(await this.receiptMatches(original, record))) return pending();
        await this.store.releaseParent(p.parentId, key); // closes a lost release acknowledgement safely
        return { state: 'StorageVerified', record, tenantWriteAllowed: false };
      }
      if (!allowed(p, request)) return pending();
      const description = p.nominals.find(n => n.code === request.command.nominalCode)!.description;
      const custody = await this.store.acquireParent(p.parentId, original.command.parentEtag, key);
      if (custody === 'Busy') return pending();
      if (custody === 'Stale') return await this.store.rejectUnwrittenStale(p.parentId, original.command.parentEtag, key) ? rejected() : pending();
      if (custody !== 'Acquired' && custody !== 'Owned') return pending();
      // The ledger's original request is canonical even when this invocation was
      // triggered by an identical duplicate file with a different item ID.
      const unchanged = sealedRequest(await this.store.readRequest(original.id));
      if (unchanged.id !== original.id || unchanged.etag !== original.etag || !sameRequest(original, unchanged) ||
        !await this.store.recheckParent(p.parentId, key, original.authorId, p.month)) return pending();
      let line = await this.store.findLine(key);
      if (!line) line = await this.store.createLineUnique(key, original, description);
      let record = matchesLine(original, line, description);
      if (!await this.store.verifyLineProvenance(record, original)) return pending();
      if (original.command.receipt.kind === 'file') {
        const existing = await this.store.readReceipt(record);
        if (existing) { if (!equalBytes(existing, original.command.receipt.bytes)) return pending(); }
        else await this.store.addReceiptNoOverwrite(record, new Uint8Array(original.command.receipt.bytes));
      }
      if (!await this.receiptMatches(original, record) || !await this.store.recheckParent(p.parentId, key, original.authorId, p.month)) return pending();
      const fresh = matchesLine(original, await this.store.readLine(record.line.id), description);
      // SharePoint attachment creation may legitimately advance the item ETag.
      // Only that concurrency token may change; all line/receipt bindings stay exact.
      if (JSON.stringify({ ...fresh, etag: record.etag }) !== JSON.stringify(record) || !await this.store.verifyLineProvenance(fresh, original)) return pending();
      record = fresh;
      await this.store.appendAuditUnique(key, original.id, original.authorId, record);
      await this.store.completeOperation(key, record);
      await this.store.releaseParent(p.parentId, key);
      return { state: 'StorageVerified', record, tenantWriteAllowed: false };
    } catch { return pending(); } // no sensitive server details; uncertain side effects are retained
  }
  private async receiptMatches(request: ISealedRequest, record: IStoredExpense): Promise<boolean> {
    if (request.command.receipt.kind === 'none') return record.receipt.kind === 'none' && record.receipt.reason === request.command.receipt.reason;
    const bytes = await this.store.readReceipt(record);
    return !!bytes && equalBytes(bytes, request.command.receipt.bytes);
  }
}
