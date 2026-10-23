import { nominalMaster } from '../../data/nominals';
import { parseAmountPence, parseUkDate } from '../../domain/expenseRules';
import { ExpensePersistenceService } from './ExpensePersistenceService';
import { creationIdentity, HeldSharePointExpensePort } from './PersistenceContract';
import type { ICreateExpense, IExpensePersistencePort, IStoredExpense, StoredReceipt } from './PersistenceContract';

const { createHash } = jest.requireActual('crypto') as { createHash(name: string): { update(bytes: Uint8Array): { digest(format: string): string } } };
const digest = async (bytes: Uint8Array): Promise<string> => createHash('sha256').update(bytes).digest('hex');
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const draft = (): ICreateExpense => ({ operationId: 'synthetic-operation-001', parentId: 101, parentEtag: '"3"',
  date: '13-10-2026', supplier: 'Synthetic shop', description: 'Synthetic activity', nominalCode: '00010',
  amount: '12.50', notes: 'Distinct optional notes', receipt: { kind: 'none', reason: 'Synthetic lost receipt' } });
const png = (): Uint8Array => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const fileDraft = (): ICreateExpense => ({ ...draft(), receipt: { kind: 'file', fileName: 'receipt.png', mediaType: 'image/png', bytes: png() } });

/** Deterministic server fixture ONLY. This models a protected processor/ledger,
 * not current tenant lists, actual ACLs, licensed flow or durable transaction.
 * Actor belongs to the connection, never command JSON. Survives service disposal. */
class FakeTenant {
  public rows = new Map<number, IStoredExpense>();
  public files = new Map<number, Uint8Array>();
  public ledger = new Map<string, { fingerprint: string; id: number; ready: boolean }>();
  public writes = 0;
  public submissions = 0;
  public parentEtag = '"3"';
  public parentStatus = 'Draft';
  public monthOpen = true;
  public loseAck = false;
  public failUpload = false;
  public nextId = 7001;
  public port(actor: number): IExpensePersistencePort {
    const owner = (): boolean => actor === 11;
    const key = (op: string): string => `${actor}:${op}`;
    const allowed = (id: number): boolean => owner() && this.rows.has(id);
    const ready = (entry: { id: number; ready: boolean } | undefined): unknown => entry
      ? entry.ready ? { state: 'Ready', record: copy(this.rows.get(entry.id)) } : { state: 'Pending' } : { state: 'Absent' };
    return {
      resolve: async op => owner() ? ready(this.ledger.get(key(op))) : { state: 'Rejected' },
      submit: async c => {
        this.submissions++;
        if (!owner()) return { state: 'Rejected' };
        const fingerprint = await digest(new TextEncoder().encode(creationIdentity(c)));
        const receiptHashValid = c.receipt.kind === 'none' || await digest(c.receipt.bytes) === c.receipt.sha256;
        // All asynchronous preparation precedes this fake atomic reservation.
        const prior = this.ledger.get(key(c.operationId));
        if (prior) return prior.fingerprint === fingerprint ? ready(prior) : { state: 'Rejected' };
        const nominal = nominalMaster.find(n => n.code === c.nominalCode);
        const dateIso = parseUkDate(c.date); const amountPence = parseAmountPence(c.amount);
        // All195 are test-eligible ONLY inside this fixture; no live posting policy inferred.
        if (c.parentId !== 101 || c.parentEtag !== this.parentEtag || this.parentStatus !== 'Draft' || !this.monthOpen ||
            !dateIso?.startsWith('2026-10-') || !amountPence || !nominal ||
            (c.receipt.kind === 'none' ? !c.receipt.reason.trim() : !receiptHashValid)) return { state: 'Rejected' };
        const id = this.nextId++;
        const receipt: StoredReceipt = c.receipt.kind === 'none' ? { ...c.receipt } : {
          kind: 'file', expenseId: id, fileName: c.receipt.fileName, mediaType: c.receipt.mediaType,
          size: c.receipt.bytes.length, sha256: c.receipt.sha256, storage: { kind: 'list-attachment' }
        };
        const record: IStoredExpense = { operationId: c.operationId, requestFingerprint: fingerprint, etag: '"1"', receipt, line: {
          id, expenseLineKey: `synthetic-line-${id}`, parentId: c.parentId, dateIso,
          supplier: c.supplier, description: c.description, nominalCode: nominal.code, nominalDescription: nominal.description,
          amountPence, notes: c.notes, isVoided: false
        } };
        // No await between reservation and row creation in this fake server.
        this.rows.set(id, record); this.writes++; this.parentEtag = '"4"';
        const entry = { fingerprint, id, ready: c.receipt.kind === 'none' || !this.failUpload };
        this.ledger.set(key(c.operationId), entry);
        if (c.receipt.kind === 'file' && !this.failUpload) this.files.set(id, new Uint8Array(c.receipt.bytes));
        if (this.loseAck) { this.loseAck = false; throw new Error('synthetic lost acknowledgement'); }
        return ready(entry);
      },
      readExpense: async (parent, id) => parent === 101 && allowed(id) ? { state: 'Ready', record: copy(this.rows.get(id)) } : { state: 'Rejected' },
      readReceipt: async receipt => {
        if (!allowed(receipt.expenseId) || !this.files.has(receipt.expenseId)) throw new Error('synthetic private error');
        return new Uint8Array(this.files.get(receipt.expenseId)!);
      }
    };
  }
}
const service = (tenant: FakeTenant, actor = 11): ExpensePersistenceService => new ExpensePersistenceService(tenant.port(actor), digest);

describe('disconnected expense + receipt processor boundary', () => {
  it.each([
    ['ASCII255', 'x'.repeat(255), true], ['ASCII256', 'x'.repeat(256), false],
    ['supplementary255', '\u{1f600}'.repeat(127) + 'x', true], ['supplementary256', '\u{1f600}'.repeat(128), false],
    ['combining255', 'e\u0301'.repeat(127) + 'x', true], ['combining256', 'e\u0301'.repeat(128), false]
  ])('R7 preserves exact %s values across cold readback or rejects before hashing', async (_name, text, accepted) => {
    const t = new FakeTenant(); const hashing = jest.fn(digest);
    const s = new ExpensePersistenceService(t.port(11), hashing);
    const value = { ...draft(), supplier: text as string, description: text as string,
      notes: 'n'.repeat(2000), receipt: { kind: 'none' as const, reason: 'r'.repeat(2000) } };
    const result = await s.save(value);
    expect(result.state).toBe(accepted ? 'ReadbackVerified' : 'Rejected');
    if (accepted) {
      expect(await service(t).reopen(101, 7001)).toEqual(result);
      expect(t.rows.get(7001)?.line.supplier).toBe(text); expect(t.rows.get(7001)?.line.description).toBe(text);
      expect(t.rows.get(7001)?.line.notes).toHaveLength(2000); expect(t.rows.get(7001)?.receipt).toEqual(value.receipt);
    } else { expect(hashing).not.toHaveBeenCalled(); expect(t.submissions).toBe(0); }
  });
  it.each(['supplier', 'description'] as const)('R7 oversized stored %s cannot verify, clear custody or resubmit', async name => {
    const t = new FakeTenant(), value = fileDraft(); await service(t).save(value);
    const row = t.rows.get(7001)!; t.rows.set(7001, { ...row, line: { ...row.line, [name]: 'x'.repeat(256) } });
    expect((await service(t).reopen(101, 7001)).state).toBe('Rejected');
    const port = t.port(11); const s = new ExpensePersistenceService({ ...port, recoverPrevious: async () => ({ state: 'Ready', record: copy(t.rows.get(7001)) }) }, digest);
    expect((await s.recoverPrevious(101)).state).toBe('Pending'); expect((await s.checkSave(value)).state).toBe('Pending');
    expect((await s.save(value)).state).toBe('Pending'); expect(t.submissions).toBe(1);
    expect(t.rows.get(7001)?.line[name]).toHaveLength(256); expect(t.files.get(7001)).toEqual(png());
  });
  it.each(['supplier', 'description'] as const)('R7 rejects over-capacity %s before any submit', async name => {
    const tenant = new FakeTenant(); const value = { ...fileDraft(), [name]: 'x'.repeat(256) };
    expect((await service(tenant).save(value)).state).toBe('Rejected');
    expect(tenant.submissions).toBe(0); expect(tenant.writes).toBe(0); expect(value[name]).toHaveLength(256);
  });
  it('saves then closes service and reopens same raw line with a distinct reason and notes', async () => {
    const tenant = new FakeTenant(); const saved = await service(tenant).save(draft());
    expect(saved.state).toBe('ReadbackVerified');
    const reopened = await service(tenant).reopen(101, 7001);
    expect(reopened).toEqual(saved); expect(tenant.rows.size).toBe(1);
    expect(tenant.rows.get(7001)?.receipt).toEqual(draft().receipt);
    expect(reopened.tenantWriteAllowed).toBe(false);
  });
  it.each([
    ['receipt.png', 'image/png', png()],
    ['receipt.jpg', 'image/jpeg', new Uint8Array([255, 216, 255, 1, 2])],
    ['receipt.pdf', 'application/pdf', new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])]
  ])('reopens same %s bytes and expense after closing the service', async (fileName, mediaType, bytes) => {
    const tenant = new FakeTenant();
    const c = { ...draft(), receipt: { kind: 'file' as const, fileName: fileName as string, mediaType: mediaType as string, bytes: bytes as Uint8Array } };
    expect((await service(tenant).save(c)).state).toBe('ReadbackVerified');
    expect((await service(tenant).reopen(101, 7001)).state).toBe('ReadbackVerified');
    expect(tenant.files.get(7001)).toEqual(bytes); expect(tenant.writes).toBe(1);
  });
  it('coalesces duplicate concurrent clicks and resolves a duplicate after close without new submission', async () => {
    const tenant = new FakeTenant(); const s = service(tenant);
    const results = await Promise.all([s.save(fileDraft()), s.save(fileDraft())]);
    expect(results[0]).toEqual(results[1]); expect(tenant.submissions).toBe(1);
    expect(await service(tenant).save(fileDraft())).toEqual(results[0]); expect(tenant.submissions).toBe(1);
  });
  it('two independent clients rely on server reservation, not browser coalescing', async () => {
    const t = new FakeTenant(); const result = await Promise.all([service(t).save(fileDraft()), service(t).save(fileDraft())]);
    expect(result.map(r => r.state)).toEqual(['ReadbackVerified', 'ReadbackVerified']); expect(t.writes).toBe(1);
  });
  it('rejects changed payload with the same operation ID after close', async () => {
    const tenant = new FakeTenant(); await service(tenant).save(draft());
    const result = await service(tenant).save({ ...draft(), amount: '99.99' });
    expect(result.state).toBe('Rejected'); expect(tenant.writes).toBe(1);
  });
  it('rejects replay with a changed parent ETag even if visible values are unchanged', async () => {
    const t = new FakeTenant(); await service(t).save(draft());
    expect((await service(t).save({ ...draft(), parentEtag: '"4"' })).state).toBe('Rejected'); expect(t.writes).toBe(1);
  });
  it('transport mutation cannot rewrite the verification snapshot', async () => {
    const t = new FakeTenant(); const port = t.port(11);
    const s = new ExpensePersistenceService({ ...port, submit: async c => {
      (c as { amount: string }).amount = '99.99'; return port.submit(c);
    } }, digest);
    expect((await s.save(draft())).state).toBe('Rejected');
  });
  it('reconciles lost acknowledgement without retrying submit', async () => {
    const tenant = new FakeTenant(); tenant.loseAck = true;
    expect((await service(tenant).save(fileDraft())).state).toBe('ReadbackVerified');
    expect(tenant.submissions).toBe(1); expect(tenant.writes).toBe(1);
  });
  it('does not retry an unknown write outcome or expose transport messages', async () => {
    const tenant = new FakeTenant(); const port = tenant.port(11); const submit = jest.fn(async () => { throw new Error('private token'); });
    const s = new ExpensePersistenceService({ ...port, submit }, digest);
    expect(await s.save(draft())).toEqual({ state: 'Pending', code: 'SAVE_UNCONFIRMED', tenantWriteAllowed: false });
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('holds partial receipt upload and subsequent retry without another expense row', async () => {
    const tenant = new FakeTenant(); tenant.failUpload = true;
    expect((await service(tenant).save(fileDraft())).state).toBe('Pending');
    expect((await service(tenant).save(fileDraft())).state).toBe('Pending');
    expect((await service(tenant).reopen(101, 7001)).state).not.toBe('ReadbackVerified');
    expect(tenant.submissions).toBe(1); expect(tenant.rows.size).toBe(1);
  });
  it.each([
    { parentId: 102 }, { parentEtag: '"2"' }, { date: '01-11-2026' }, { nominalCode: '99999' },
    { receipt: { kind: 'none', reason: '' } }, { amount: '0.001' }, { actor: 11 }, { category: 'invented' }
  ])('rejects invalid, forged or stale command %j with zero writes', async change => {
    const tenant = new FakeTenant(); const result = await service(tenant).save({ ...draft(), ...change } as ICreateExpense);
    expect(result.state).toBe('Rejected'); expect(tenant.writes).toBe(0);
  });
  it('server rejects closed month and submitted parent', async () => {
    for (const state of ['month', 'parent']) {
      const t = new FakeTenant(); if (state === 'month') t.monthOpen = false; else t.parentStatus = 'Submitted';
      expect((await service(t).save(draft())).state).toBe('Rejected'); expect(t.writes).toBe(0);
    }
  });
  it('separate unrelated fake identity is denied raw line, raw receipt, resolve and save', async () => {
    const tenant = new FakeTenant(); await service(tenant).save(fileDraft()); const other = tenant.port(22);
    expect(await other.readExpense(101, 7001)).toEqual({ state: 'Rejected' });
    await expect(other.readReceipt(tenant.rows.get(7001)!.receipt as Extract<StoredReceipt, { kind: 'file' }>)).rejects.toThrow();
    expect(await other.resolve(draft().operationId)).toEqual({ state: 'Rejected' });
    expect((await service(tenant, 22).save(draft())).state).toBe('Rejected');
    expect((await service(tenant, 22).reopen(101, 7001)).state).toBe('Rejected'); expect(tenant.rows.size).toBe(1);
  });
  it('retains195 exact nominal pairs and leading zeros without a Category DTO', async () => {
    expect(nominalMaster).toHaveLength(195); const tenant = new FakeTenant(); await service(tenant).save(draft());
    expect(tenant.rows.get(7001)?.line.nominalCode).toBe('00010');
    expect(tenant.rows.get(7001)?.line.nominalDescription).toBe(nominalMaster.find(n => n.code === '00010')?.description);
  });
  it('rejects getters without invoking them or transport', async () => {
    const tenant = new FakeTenant(); const c = draft(); const getter = jest.fn(() => { throw new Error('private'); });
    Object.defineProperty(c, 'parentId', { get: getter });
    expect((await service(tenant).save(c)).state).toBe('Rejected'); expect(getter).not.toHaveBeenCalled(); expect(tenant.submissions).toBe(0);
  });
  it('snapshots receipt bytes before digest await', async () => {
    const tenant = new FakeTenant(); const c = fileDraft(); const s = service(tenant); const pending = s.save(c);
    if (c.receipt.kind === 'file') c.receipt.bytes[8] = 99;
    expect((await pending).state).toBe('ReadbackVerified'); expect(tenant.files.get(7001)?.[8]).toBe(1);
  });
  it('rejects same-name modified receipt bytes on reopen', async () => {
    const tenant = new FakeTenant(); await service(tenant).save(fileDraft()); tenant.files.get(7001)![8] = 99;
    expect((await service(tenant).reopen(101, 7001)).state).toBe('Pending');
  });
  it('rejects a receipt manifest bound to another expense', async () => {
    const tenant = new FakeTenant(); await service(tenant).save(fileDraft()); const r = tenant.rows.get(7001)!;
    tenant.rows.set(7001, { ...r, receipt: { ...r.receipt, expenseId: 7002 } as StoredReceipt });
    expect((await service(tenant).reopen(101, 7001)).state).toBe('Rejected');
  });
  it('detects line changes while receipt downloads', async () => {
    const tenant = new FakeTenant(); await service(tenant).save(fileDraft()); const port = tenant.port(11);
    const s = new ExpensePersistenceService({ ...port, readReceipt: async r => {
      const bytes = await port.readReceipt(r); tenant.rows.set(7001, { ...tenant.rows.get(7001)!, etag: '"2"' }); return bytes;
    } }, digest);
    expect((await s.reopen(101, 7001)).state).toBe('Pending');
  });
  it('held live implementation cannot be enabled by any command flag', async () => {
    const s = new ExpensePersistenceService(new HeldSharePointExpensePort(), digest);
    expect((await s.save(draft())).state).toBe('Held'); expect((await s.reopen(101, 7001)).state).toBe('Held');
    expect((await s.save({ ...draft(), approved: true } as ICreateExpense)).state).toBe('Rejected');
  });
  it('returns the same verified receipt bytes for a contained viewer after close/reopen', async () => {
    const t = new FakeTenant(); await service(t).save(fileDraft());
    const result = await service(t).openReceipt(101, 7001);
    expect(result.state).toBe('ReceiptBytesVerified');
    if (result.state === 'ReceiptBytesVerified') { expect(result.bytes).toEqual(png()); result.bytes[8] = 99; }
    expect(t.files.get(7001)?.[8]).toBe(1);
    expect((await service(t, 22).openReceipt(101, 7001)).state).toBe('Unavailable');
  });
});
