import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { StandardExpenseProcessor, operationKey, sealedRequest } from './StandardExpenseProcessor';
import type { IOperationLedger, ISealedRequest, IServerPolicy, IStandardProcessorStore } from './StandardExpenseProcessor';
import * as plans from './SharePointStandardPlans';
import { StandardConditionalWriter } from './StandardConditionalWriter';
import { decodeRequest, encodeRequest, RequestLedgerExpensePort } from '../services/persistence/RequestLedgerExpensePort';
import type { IAuthenticatedRequestLedgerChannel } from '../services/persistence/RequestLedgerExpensePort';
import { ExpensePersistenceService } from '../services/persistence/ExpensePersistenceService';
import { ExpenseEntryAdapter } from '../services/persistence/ExpenseEntryAdapter';
import { creationIdentity } from '../services/persistence/PersistenceContract';
import type { ICreateExpense, IPreparedExpense, IStoredExpense } from '../services/persistence/PersistenceContract';
import { nominalMaster } from '../data/nominals';
import { parseAmountPence, parseUkDate } from '../domain/expenseRules';
import { D01ExpenseScreen } from '../webparts/kcfExpensesHub/components/D01ExpenseScreen';

const crypto = jest.requireActual('crypto') as { createHash(name: string): { update(bytes: Uint8Array): { digest(format: string): string } } };
const digest = async (bytes: Uint8Array): Promise<string> => crypto.createHash('sha256').update(bytes).digest('hex');
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
const jpg = new Uint8Array([255, 216, 255, 1, 2]);
const pdf = new TextEncoder().encode('%PDF-1.4\nSynthetic\n%%EOF');
const command = (operationId = 'expense-synthetic-operation-0001', parentEtag = '"3"'): ICreateExpense => ({ operationId, parentId: 101, parentEtag,
  date: '21-10-2026', supplier: 'Synthetic supplier', description: 'Synthetic expense', nominalCode: '00010', amount: '12.34', notes: 'Separate notes', receipt: { kind: 'none', reason: 'Synthetic missing receipt' } });
async function prepared(input: ICreateExpense): Promise<IPreparedExpense> {
  return { ...input, receipt: input.receipt.kind === 'none' ? input.receipt : { ...input.receipt, sha256: await digest(input.receipt.bytes) } };
}

/** Fake protected SharePoint only. Atomic map primitives simulate unique indexed
 * columns and CAS, NOT proof SharePoint was configured. Human identity is stamped
 * by this fake authenticated channel; processor's technical Author is distinct. */
class FakeStandardStore implements IStandardProcessorStore {
  public requests = new Map<number, ISealedRequest>(); public ledgers = new Map<string, IOperationLedger>();
  public lines = new Map<string, IStoredExpense>(); public files = new Map<number, Uint8Array>(); public audits = new Map<string, string>();
  public lineRequests = new Map<number, number>();
  public requestWrites = 0; public lineWrites = 0; public fileWrites = 0; public auditWrites = 0;
  public ownerId = 11; public parentEtag = '"3"'; public parentLease = ''; public month = '2026-10';
  public status: 'Draft' | 'Locked' = 'Draft'; public active = true; public admitted = true;
  public nominals = nominalMaster; public eligibleCodes = ['00010']; public crash = ''; public runAutomatically = true;
  public processor(): StandardExpenseProcessor { return new StandardExpenseProcessor(this); }
  public policy(actorId: number): IServerPolicy { return { actorId, parentId: 101, ownerId: this.ownerId, parentEtag: this.parentEtag,
    month: this.month, status: this.status, active: this.active, monthOpen: true, nominals: this.nominals, eligibleCodes: this.eligibleCodes }; }
  private fail(stage: string): void { if (this.crash === stage) { this.crash = ''; throw new Error('SENSITIVE_SERVER_DETAIL'); } }
  public async readRequest(id: number): Promise<unknown> { const r = this.requests.get(id); if (!r) throw new Error('NOT_FOUND'); return sealedRequest(r); }
  public async readPolicy(actor: number, _parent: number): Promise<{ state: 'Held' } | { state: 'Ready'; policy: IServerPolicy }> { return this.admitted ? { state: 'Ready', policy: this.policy(actor) } : { state: 'Held' }; }
  public async findOperation(key: string): Promise<IOperationLedger | undefined> { const v = this.ledgers.get(key); return v && clone(v); }
  public async reserveOperation(value: IOperationLedger): Promise<IOperationLedger> {
    if (!this.ledgers.has(value.key)) this.ledgers.set(value.key, clone(value)); this.fail('ledger'); return clone(this.ledgers.get(value.key)!);
  }
  public async acquireParent(_parent: number, expected: string, key: string): Promise<'Acquired' | 'Owned' | 'Busy' | 'Stale'> {
    if (this.parentLease === key) return 'Owned';
    if (this.parentLease) return 'Busy';
    if (this.parentEtag !== expected) return 'Stale';
    this.parentLease = key; this.parentEtag = `"${Number(this.parentEtag.slice(1, -1)) + 1}"`; this.fail('parent'); return 'Acquired';
  }
  public async rejectUnwrittenStale(parent: number, expected: string, key: string): Promise<boolean> {
    const ledger = this.ledgers.get(key);
    if (parent !== 101 || this.parentLease || this.parentEtag === expected || this.lines.has(key) || ledger?.state !== 'Pending') return false;
    this.ledgers.set(key, { ...ledger, state: 'Rejected' }); this.fail('rejection'); return true;
  }
  public async recheckParent(parent: number, key: string, actor: number, month: string): Promise<boolean> {
    return parent === 101 && this.parentLease === key && actor === this.ownerId && month === this.month && this.status === 'Draft';
  }
  public async findLine(key: string): Promise<IStoredExpense | undefined> { const r = this.lines.get(key); return r && clone(r); }
  public async createLineUnique(key: string, request: ISealedRequest, nominalDescription: string): Promise<IStoredExpense> {
    if (this.lines.has(key)) return clone(this.lines.get(key)!);
    const c = request.command, id = 7001 + this.lines.size;
    const record: IStoredExpense = { operationId: c.operationId, requestFingerprint: request.clientFingerprint, etag: '"1"',
      line: { id, parentId: c.parentId, expenseLineKey: `D01-${request.authorId}-${c.operationId}`, dateIso: parseUkDate(c.date)!, supplier: c.supplier,
        description: c.description, nominalCode: c.nominalCode, nominalDescription, amountPence: parseAmountPence(c.amount)!, notes: c.notes, isVoided: false },
      receipt: c.receipt.kind === 'none' ? c.receipt : { kind: 'file', expenseId: id, fileName: c.receipt.fileName, mediaType: c.receipt.mediaType,
        size: c.receipt.bytes.length, sha256: c.receipt.sha256, storage: { kind: 'list-attachment' } } };
    this.lines.set(key, clone(record)); this.lineRequests.set(id, request.id); this.lineWrites++; this.fail('line'); return clone(record);
  }
  public async readReceipt(record: IStoredExpense): Promise<Uint8Array | undefined> { const bytes = this.files.get(record.line.id); return bytes && new Uint8Array(bytes); }
  public async verifyLineProvenance(record: IStoredExpense, original: ISealedRequest): Promise<boolean> {
    const key = operationKey(original.authorId, original.command.operationId);
    return this.lineRequests.get(record.line.id) === original.id && this.lines.get(key)?.line.id === record.line.id && record.line.parentId === original.command.parentId;
  }
  public async addReceiptNoOverwrite(record: IStoredExpense, bytes: Uint8Array): Promise<void> {
    if (this.files.has(record.line.id)) return; this.files.set(record.line.id, new Uint8Array(bytes)); this.fileWrites++; this.fail('receipt');
  }
  public async readLine(id: number): Promise<unknown> { const r = Array.from(this.lines.values()).find(l => l.line.id === id); if (!r) throw new Error('NOT_FOUND'); return clone(r); }
  public async appendAuditUnique(key: string, requestId: number, authorId: number, record: IStoredExpense): Promise<void> {
    const value = JSON.stringify({ requestId, authorId, lineId: record.line.id });
    if (this.audits.has(key) && this.audits.get(key) !== value) throw new Error('AUDIT_CONFLICT');
    if (!this.audits.has(key)) { this.audits.set(key, value); this.auditWrites++; } this.fail('audit');
  }
  public async completeOperation(key: string, record: IStoredExpense): Promise<void> {
    this.ledgers.set(key, { ...this.ledgers.get(key)!, state: 'Completed', record: clone(record) }); this.fail('result');
  }
  public async releaseParent(_parent: number, key: string): Promise<void> {
    if (this.parentLease === key) { this.parentLease = ''; this.parentEtag = `"${Number(this.parentEtag.slice(1, -1)) + 1}"`; }
    this.fail('release');
  }
  public async addRequest(actor: number, c: IPreparedExpense): Promise<number> {
    const id = this.requests.size + 1, clientFingerprint = await digest(new TextEncoder().encode(creationIdentity(c)));
    this.requests.set(id, sealedRequest({ id, authorId: actor, editorId: actor, version: 1, etag: '"1"', command: c, clientFingerprint })); this.requestWrites++; return id;
  }
  public channel(actor: number): IAuthenticatedRequestLedgerChannel {
    const ownLine = (id: number): IStoredExpense => {
      const entry = Array.from(this.ledgers.values()).find(l => l.originatorId === actor && l.record?.line.id === id && l.state === 'Completed');
      if (!entry?.record || actor !== this.ownerId) throw new Error('RAW_DENIED'); return clone(entry.record);
    };
    const result = (l?: IOperationLedger): unknown => !l ? { state: 'Absent' } : l.originatorId !== actor || actor !== this.ownerId ? { state: 'Rejected' }
      : l.state === 'Rejected' ? { state: 'Rejected' }
      : l.state === 'Completed' && !this.parentLease ? { state: 'Ready', record: ownLine(l.record!.line.id) } : { state: 'Pending' };
    return {
      createImmutableRequest: async (op, envelope) => {
        const data = decodeRequest(envelope); if (data.command.operationId !== op) throw new Error('INVALID_REQUEST');
        const id = this.requests.size + 1;
        this.requests.set(id, { id, authorId: actor, editorId: actor, version: 1, etag: '"1"', ...data }); this.requestWrites++;
        if (this.runAutomatically) await this.processor().process(id);
      },
      readOwnOperation: async op => result(this.ledgers.get(operationKey(actor, op))),
      readOwnPrevious: async parent => {
        if (actor !== this.ownerId || parent !== 101) return { state: 'Rejected' };
        const records = Array.from(this.ledgers.values()).filter(l => l.originatorId === actor && l.parentId === parent);
        return records.length === 1 ? result(records[0]) : { state: records.length ? 'Pending' : 'Absent' };
      },
      readOwnLine: async (parent, id) => { const record = ownLine(id); if (record.line.parentId !== parent) throw new Error('RAW_DENIED'); return { state: 'Ready', record }; },
      readOwnReceipt: async receipt => { ownLine(receipt.expenseId); const bytes = this.files.get(receipt.expenseId); if (!bytes) throw new Error('RAW_DENIED'); return new Uint8Array(bytes); }
    };
  }
  public service(actor = 11): ExpensePersistenceService { return new ExpensePersistenceService(new RequestLedgerExpensePort(this.channel(actor), digest), digest); }
}

describe('Standard server-intended processor and actual persistence/request port, fake tenant only', () => {
  it.each([['png', 'image/png', png], ['jpg', 'image/jpeg', jpg], ['pdf', 'application/pdf', pdf]])('creates and cold reopens exact %s bytes via fresh service/port', async (ext, mediaType, bytes) => {
    const t = new FakeStandardStore(); const c = { ...command(), receipt: { kind: 'file' as const, fileName: `r.${ext}`, mediaType: mediaType as string, bytes: bytes as Uint8Array } };
    expect((await t.service().save(c)).state).toBe('ReadbackVerified');
    expect((await t.service().recoverPrevious(101)).state).toBe('ReadbackVerified');
    const receipt = await t.service().openReceipt(101, 7001); expect(receipt.state).toBe('ReceiptBytesVerified');
    if (receipt.state === 'ReceiptBytesVerified') expect(receipt.bytes).toEqual(bytes);
    expect([t.requestWrites, t.lineWrites, t.fileWrites, t.auditWrites]).toEqual([1, 1, 1, 1]);
  });
  it('keeps distinct reason and notes with no fabricated receipt or Category', async () => {
    const t = new FakeStandardStore(); expect((await t.service().save(command())).state).toBe('ReadbackVerified');
    expect(t.lines.values().next().value?.receipt).toEqual(command().receipt); expect(t.fileWrites).toBe(0);
  });
  it.each(['ledger', 'parent', 'line', 'receipt', 'audit', 'result', 'release'])('resumes after crash at %s without duplicate line/file/audit', async stage => {
    const t = new FakeStandardStore(); t.crash = stage;
    const c = { ...command(), receipt: { kind: 'file' as const, fileName: 'r.png', mediaType: 'image/png', bytes: png } };
    await t.service().save(c);
    const fresh = t.service(); const before = await fresh.recoverPrevious(101);
    if (stage !== 'release') expect(before.state).toBe('Pending');
    expect((await t.processor().process(1)).state).toBe('StorageVerified');
    expect((await fresh.recoverPrevious(101)).state).toBe('ReadbackVerified');
    expect([t.requestWrites, t.lineWrites, t.fileWrites, t.auditWrites]).toEqual([1, 1, 1, 1]);
  });
  it('races two processor instances with the same operation and creates once', async () => {
    const t = new FakeStandardStore(); const c = await prepared(command()); const a = await t.addRequest(11, c), b = await t.addRequest(11, c);
    await Promise.all([t.processor().process(a), t.processor().process(b)]);
    expect((await t.processor().process(a)).state).toBe('StorageVerified');
    expect([t.ledgers.size, t.lineWrites, t.auditWrites]).toEqual([1, 1, 1]);
  });
  it('terminally rejects the verified unwritten stale loser of distinct concurrent operations', async () => {
    const t = new FakeStandardStore(); const a = await t.addRequest(11, await prepared(command()));
    const b = await t.addRequest(11, await prepared(command('expense-synthetic-operation-0002')));
    const first = await Promise.all([t.processor().process(a), t.processor().process(b)]);
    expect(first.map(r => r.state).sort()).toEqual(['Pending', 'StorageVerified']);
    expect((await t.processor().process(b)).state).toBe('Rejected');
    expect(t.ledgers.get(operationKey(11, 'expense-synthetic-operation-0002'))?.state).toBe('Rejected');
    expect(await t.channel(11).readOwnOperation('expense-synthetic-operation-0002')).toEqual({ state: 'Rejected' });
    expect(t.lineWrites).toBe(1); expect(t.auditWrites).toBe(1);
  });
  it('uses the original ledger request for line and audit after identical duplicate recovery', async () => {
    const t = new FakeStandardStore(); const c = await prepared(command()); t.crash = 'ledger';
    const a = await t.addRequest(11, c); expect((await t.processor().process(a)).state).toBe('Pending');
    const b = await t.addRequest(11, c); expect((await t.processor().process(b)).state).toBe('StorageVerified');
    const key = operationKey(11, c.operationId);
    expect(t.ledgers.get(key)?.requestId).toBe(a); expect(t.lineRequests.get(7001)).toBe(a);
    expect(JSON.parse(t.audits.get(key)!)).toMatchObject({ requestId: a, authorId: 11, lineId: 7001 });
    expect(t.lineWrites).toBe(1);
  });
  it.each(['busy', 'partial', 'unknown'])('does not terminally reject a %s operation or clear uncertain writes', async variant => {
    const t = new FakeStandardStore(); t.crash = variant === 'partial' ? 'line' : 'ledger';
    const id = await t.addRequest(11, await prepared(command())); await t.processor().process(id);
    const key = operationKey(11, command().operationId);
    if (variant === 'busy') t.parentLease = '11:another-operation-key';
    else if (variant === 'partial') { t.parentLease = ''; t.parentEtag = '"5"'; }
    else { t.parentEtag = '"5"'; t.rejectUnwrittenStale = async () => { throw new Error('private timeout'); }; }
    expect(await t.processor().process(id)).toEqual({ state: 'Pending', tenantWriteAllowed: false });
    expect(t.ledgers.get(key)?.state).toBe('Pending'); expect(t.auditWrites).toBe(0);
    expect(t.lineWrites).toBe(variant === 'partial' ? 1 : 0);
  });
  it('recovers a lost terminal-rejection acknowledgement without creating a line', async () => {
    const t = new FakeStandardStore(); t.crash = 'ledger'; const id = await t.addRequest(11, await prepared(command()));
    await t.processor().process(id); t.parentEtag = '"5"'; t.crash = 'rejection';
    expect((await t.processor().process(id)).state).toBe('Pending');
    expect((await t.processor().process(id)).state).toBe('Rejected');
    expect((await t.service().recoverPrevious(101)).state).toBe('Rejected'); expect(t.lineWrites).toBe(0);
  });
  it.each(['Pending', 'Completed'])('withholds %s result when stored line provenance differs from canonical request', async state => {
    const t = new FakeStandardStore(); if (state === 'Pending') t.crash = 'line';
    await t.service().save(command()); t.lineRequests.set(7001, 999);
    expect((await t.processor().process(1)).state).toBe('Pending'); expect(t.lineWrites).toBe(1);
    expect(t.auditWrites).toBe(state === 'Pending' ? 0 : 1);
  });
  it('rechecks the original request version after acquiring custody during duplicate recovery', async () => {
    const t = new FakeStandardStore(); t.crash = 'ledger'; const c = await prepared(command());
    const a = await t.addRequest(11, c); await t.processor().process(a); const b = await t.addRequest(11, c);
    const acquire = t.acquireParent.bind(t);
    t.acquireParent = async (parent, expected, key) => {
      const custody = await acquire(parent, expected, key); t.requests.set(a, { ...t.requests.get(a)!, etag: '"2"' }); return custody;
    };
    expect((await t.processor().process(b)).state).toBe('Pending'); expect(t.lineWrites).toBe(0);
  });
  it.each(['amount', 'parent', 'bytes'])('rejects operation reuse with changed %s even with a forged unchanged SHA claim', async field => {
    const t = new FakeStandardStore(); const c = await prepared({ ...command(), receipt: { kind: 'file', fileName: 'r.png', mediaType: 'image/png', bytes: png } });
    await t.processor().process(await t.addRequest(11, c));
    const changed = field === 'amount' ? { ...c, amount: '22.34' } : field === 'parent' ? { ...c, parentId: 999 }
      : { ...c, receipt: { ...c.receipt, bytes: new Uint8Array([...Array.from(png.slice(0, -1)), 8]) } as IPreparedExpense['receipt'] };
    expect((await t.processor().process(await t.addRequest(11, changed))).state).toBe('Rejected'); expect(t.lineWrites).toBe(1);
  });
  it('permits two legitimate equal-value expenses with different operation IDs', async () => {
    const t = new FakeStandardStore(); await t.service().save(command());
    expect((await t.service().save(command('expense-synthetic-operation-0002', t.parentEtag))).state).toBe('ReadbackVerified');
    expect(t.lineWrites).toBe(2);
  });
  it.each(['stale', 'month', 'locked', 'inactive', 'nominal', 'master', 'actor', 'held'])('fails closed on %s without expense writes', async variant => {
    const t = new FakeStandardStore(); let c = command();
    if (variant === 'stale') c = { ...c, parentEtag: '"2"' }; if (variant === 'month') t.month = '2026-11';
    if (variant === 'locked') t.status = 'Locked'; if (variant === 'inactive') t.active = false;
    if (variant === 'nominal') t.eligibleCodes = []; if (variant === 'master') t.nominals = nominalMaster.slice(0, 3);
    if (variant === 'held') t.admitted = false;
    expect((await t.processor().process(await t.addRequest(variant === 'actor' ? 22 : 11, await prepared(c)))).state).not.toBe('StorageVerified');
    expect(t.lineWrites).toBe(0);
  });
  it('denies guessed operation/result/raw line/raw receipt to an unrelated actor', async () => {
    const t = new FakeStandardStore(); await t.service().save({ ...command(), receipt: { kind: 'file', fileName: 'r.png', mediaType: 'image/png', bytes: png } });
    expect((await t.service(22).recoverPrevious(101)).state).toBe('Rejected');
    expect(await t.channel(22).readOwnOperation(command().operationId)).toEqual({ state: 'Absent' });
    await expect(t.channel(22).readOwnLine(101, 7001)).rejects.toThrow('RAW_DENIED');
    const record = t.lines.values().next().value!;
    if (record.receipt.kind === 'file') await expect(t.channel(22).readOwnReceipt(record.receipt)).rejects.toThrow('RAW_DENIED');
    expect((await t.service(22).save(command())).state).not.toBe('ReadbackVerified'); expect(t.lineWrites).toBe(1);
  });
  it('keeps a changed owner/month/nominal pending recovery from making more writes', async () => {
    const t = new FakeStandardStore(); t.crash = 'line'; await t.service().save(command()); t.ownerId = 22;
    expect((await t.processor().process(1)).state).toBe('Pending'); expect(t.auditWrites).toBe(0); expect(t.lineWrites).toBe(1);
  });
  it('does not create fake pending state when browser closes before submitting', async () => {
    const t = new FakeStandardStore(); expect((await t.service().recoverPrevious(101)).state).toBe('Pending'); expect(t.ledgers.size).toBe(0); expect(t.requestWrites).toBe(0);
  });
  it('offers cold-session Check previous save and recovers via the actual form without posting', async () => {
    const t = new FakeStandardStore(); t.crash = 'line'; await t.service().save(command());
    const adapter = new ExpenseEntryAdapter(t.service(), async () => ({ state: 'Ready', context: { parentId: 101, parentEtag: t.parentEtag, month: '2026-10', nominals: nominalMaster,
      eligibleNominalCodes: ['00010'], existingExpenseIds: [], creationClearance: 'Unresolved' } }));
    const host = document.createElement('div'); document.body.appendChild(host);
    try {
      await act(async () => { ReactDom.render(<D01ExpenseScreen adapter={adapter} idPrefix="cold" active />, host); });
      const previous = Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Check previous save')!; expect(previous).toBeDefined();
      await act(async () => { Simulate.click(previous); }); expect(host.textContent).toContain('Save outcome pending');
      await t.processor().process(1); await act(async () => { Simulate.click(previous); });
      expect(host.textContent).toContain('Readback verified for expense 7001'); expect(t.requestWrites).toBe(1); expect(t.lineWrites).toBe(1);
    } finally { act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); }
  });
});

describe('Standard-only REST plans and sealed request codec (no HTTP executed)', () => {
  const listId = '401af63f-5e46-4caf-a2cd-7c3b5ddfde6d';
  it('emits one immutable binary request file, reads system actor, no caller Author field', async () => {
    const c = await prepared(command()), fingerprint = await digest(new TextEncoder().encode(creationIdentity(c)));
    const bytes = encodeRequest(c, fingerprint); expect(decodeRequest(bytes)).toEqual({ command: c, clientFingerprint: fingerprint });
    const plan = plans.createImmutableRequestFile('/sites/REVIEW-TEST-SITE/QualifiedRequestFolder', c.operationId, bytes);
    expect(plan.url).toContain('overwrite=false'); expect(plan.retry).toBe('none'); expect(plans.readRequestMetadata(listId, 1).url).toContain('AuthorId,EditorId');
  });
  it('retains exact parent ETag; refuses wildcard, old lifecycle fields and system-author updates', () => {
    expect(plans.reserveParent(listId, 101, '"3"', '11:expense-synthetic-operation-0001', 'ProposedReservationKey').headers['IF-MATCH']).toBe('"3"');
    expect(() => plans.reserveParent(listId, 101, '*', '11:expense-synthetic-operation-0001', 'ProposedReservationKey')).toThrow();
    expect(() => plans.reserveParent(listId, 101, '"3"', '11:expense-synthetic-operation-0001', 'LifecyclePendingEventKey')).toThrow();
    expect(() => plans.conditionalUpdate(listId, 1, '"3"', { AuthorId: 11 })).toThrow();
  });
  it('requires explicit reason/originator and ReceiptRequired semantics, emits no Category or Author', async () => {
    const t = new FakeStandardStore(); const id = await t.addRequest(11, await prepared(command()));
    const bindings = { reason: 'ProposedReason', originator: 'ProposedOriginatorId', requestId: 'ProposedRequestId', canonicalOperation: 'ProposedOperation', receiptManifest: 'ProposedManifest', receiptRequiredForFile: true, receiptRequiredForNoReceipt: false };
    const plan = plans.createExpenseLine(listId, t.requests.get(id)!, nominalMaster[0].description, bindings);
    expect(plan.body).toMatchObject({ ClaimSubmissionRefId: 101, ClaimantNotes: 'Separate notes', ProposedReason: 'Synthetic missing receipt', ProposedOriginatorId: 11 });
    expect(plan.body).not.toHaveProperty('Notes');
    expect(plan.body).not.toHaveProperty('ExpenseCategory'); expect(plan.body).not.toHaveProperty('AuthorId');
    expect(() => plans.createExpenseLine(listId, t.requests.get(id)!, 'name', { ...bindings, reason: 'ExpenseCategory' })).toThrow();
    expect(() => plans.createExpenseLine(listId, t.requests.get(id)!, 'name', { ...bindings, reason: 'ClaimantNotes' })).toThrow();
  });
  it('rejects extra actor input, invalid/oversized envelope and stays held for deployment', async () => {
    const bad = new TextEncoder().encode(JSON.stringify({ schema: 1, command: {}, clientFingerprint: 'a'.repeat(64), actor: 11 }));
    expect(() => decodeRequest(bad)).toThrow(); expect(() => decodeRequest(new Uint8Array())).toThrow();
    expect(() => plans.createImmutableRequestFile('/sites/REVIEW-PROD-SITE/x', command().operationId, bad)).toThrow();
    expect(plans.CURRENT_STANDARD_DEPLOYMENT.tenantWriteAllowed).toBe(false);
  });
  it.each([401, 403, 404, 429, 503])('never treats lookup HTTP%s as absence/create authority', async status => {
    const execute = jest.fn(async () => ({ status, body: { value: [] } }));
    const writer = new StandardConditionalWriter({ execute }); const key = '11:expense-synthetic-operation-0001';
    await expect(writer.createUnique(plans.readUniqueOperation(listId, key), plans.createUniqueOperation(listId, key, 1, 11, 101), 'OperationKey', key)).rejects.toThrow('LOOKUP_UNAVAILABLE');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('reconciles unique collision without a second POST and enforces exact CAS ETag', async () => {
    const key = '11:expense-synthetic-operation-0001'; const row = { Id: 4, OperationKey: key, '@odata.etag': '"1"' };
    const execute = jest.fn().mockResolvedValueOnce({ status: 200, body: { value: [] } }).mockResolvedValueOnce({ status: 409 })
      .mockResolvedValueOnce({ status: 200, body: { value: [row] } }).mockResolvedValueOnce({ status: 412 });
    const writer = new StandardConditionalWriter({ execute });
    expect(await writer.createUnique(plans.readUniqueOperation(listId, key), plans.createUniqueOperation(listId, key, 1, 11, 101), 'OperationKey', key)).toEqual(row);
    expect(await writer.compareAndSwap(listId, 101, '"3"', { ProposedReservationKey: key })).toBe('Conflict');
    expect(execute.mock.calls.filter(c => c[0].method === 'POST')).toHaveLength(2); // one create + one CAS, no replay
    expect(execute.mock.calls[3][0].headers['IF-MATCH']).toBe('"3"');
  });
  it('does not retry a lost POST acknowledgement', async () => {
    const execute = jest.fn().mockResolvedValueOnce({ status: 200, body: { value: [] } }).mockRejectedValueOnce(new Error('lost'));
    const writer = new StandardConditionalWriter({ execute }); const key = '11:expense-synthetic-operation-0001';
    await expect(writer.createUnique(plans.readUniqueOperation(listId, key), plans.createUniqueOperation(listId, key, 1, 11, 101), 'OperationKey', key)).rejects.toThrow();
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
