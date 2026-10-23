import { createHeldMileageEntry, MileageEntryAdapter } from './MileageEntryAdapter';
import type { MileageAdmission } from './MileageEntryAdapter';
import type { IMileageDraft } from '../../domain/mileage';
import { FakeMileageProcessor, mileageDraft } from './MileageEntryFixtures.testSupport';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let release!: (value: T) => void; const promise = new Promise<T>(resolve => { release = resolve; }); return { promise, resolve: release };
}
describe('Mileage candidate boundary, synthetic trusted port only', () => {
  it.each(['id', 'requestId'] as const)('R1 same-operation %s remains pinned after first verified read', async key => {
    const t = new FakeMileageProcessor(), a = t.adapter(); expect((await a.save(mileageDraft())).state).toBe('ReadbackVerified');
    (t.record as unknown as Record<string, number>)[key]++; expect((await a.checkSave()).state).toBe('Rejected'); expect(t.submissions).toBe(1);
  });
  it('R1 reopening existing B twice after creation A uses each line own binding', async () => {
    const t = new FakeMileageProcessor(), p = t.port(), context = p.context;
    p.context = async () => { const a = await context(); return a.state === 'Ready' ? { state: 'Ready', context: { ...a.context, existingIds: [801, 802] } } : a; };
    const a = new MileageEntryAdapter(p, () => 'mileage-current-operation-0001'); await a.save(mileageDraft());
    const b = clone(t.record!); (b as { id: number }).id = 802; (b as { requestId: number }).requestId = 902;
    (b.command as { operationId: string }).operationId = 'mileage-another-operation-0002';
    p.read = async (parent, id) => ({ state: 'Ready', record: clone(id === 802 ? b : t.record) });
    expect((await a.reopen(802)).state).toBe('ReadbackVerified'); expect((await a.reopen(802)).state).toBe('ReadbackVerified');
    expect((await a.reopen(801)).state).toBe('ReadbackVerified'); expect((await a.checkSave()).state).toBe('ReadbackVerified'); expect(t.submissions).toBe(1);
  });
  it.each(['actor', 'parent', 'month'] as const)('R1 late load cannot replace %s bound to submitted attempt', async target => {
    const t = new FakeMileageProcessor(), p = t.port(), old = deferred<MileageAdmission>(), submitted = deferred<void>(), finish = deferred<void>();
    const context = p.context, submit = p.submit; let reads = 0;
    p.context = () => ++reads === 1 ? old.promise : context();
    p.submit = async c => { const r = await submit(c); submitted.resolve(); await finish.promise; return r; };
    const a = new MileageEntryAdapter(p, () => 'mileage-race-operation-0001'), load = a.load(), save = a.save(mileageDraft()); await submitted.promise;
    const changed = clone(t.contextValue);
    if (target === 'actor') { (changed as { actorId: number }).actorId = 22; (t.record as unknown as { originatorId: number }).originatorId = 22; }
    if (target === 'parent') { (changed as { parentId: number }).parentId = 202; (t.record!.command as { parentId: number }).parentId = 202; }
    if (target === 'month') { (changed as { month: string }).month = '2026-11'; (t.record!.command.draft as { date: string }).date = '21-11-2026'; }
    old.resolve({ state: 'Ready', context: changed }); await load; finish.resolve(); expect((await save).state).toBe('Rejected'); expect(t.submissions).toBe(1);
  });
  it('R1 cold readback cannot invent rate or self-reconcile amount under an admitted version', async () => {
    const t = new FakeMileageProcessor(); await t.adapter().save(mileageDraft());
    (t.record as unknown as { rate: unknown }).rate = { ...t.record!.rate, ratePerMileGbp: 0.45, rateTenThousandthsGbp: 4500 };
    (t.record as unknown as { amountPence: number }).amountPence = 540; expect((await t.adapter().reopen(801)).state).toBe('Rejected');
  });
  it('historical rate without its independently admitted snapshot fails closed', async () => {
    const t = new FakeMileageProcessor(); await t.adapter().save(mileageDraft());
    t.contextValue = { ...t.contextValue, rates: { ...t.contextValue.rates, snapshotVersion: 'different-current-version' } };
    expect((await t.adapter().reopen(801)).state).toBe('Rejected');
  });
  it.each(['actorId', 'parentId', 'month'] as const)('a displayed session cannot silently change %s before Save', async key => {
    const t = new FakeMileageProcessor(), p = t.port(), context = p.context;
    const a = new MileageEntryAdapter(p); await a.load();
    // Mutate the admitted reader output, not contextValue.actorId: the fake
    // port deliberately stamps its own actor over that stored fixture field.
    p.context = async () => { const admitted = await context(); return admitted.state === 'Ready'
      ? { state: 'Ready', context: { ...admitted.context, [key]: key === 'month' ? '2026-11' : 202 } } : admitted; };
    expect((await a.save(mileageDraft())).state).toBe('Held'); expect(t.submissions).toBe(0);
  });
  it('immutable runtime factory stays held for load, save, previous and reopen', async () => {
    const a = createHeldMileageEntry();
    expect((await a.load()).state).toBe('Held'); expect((await a.save(mileageDraft())).state).toBe('Held');
    expect((await a.checkPreviousSave()).state).toBe('Held'); expect((await a.reopen(801)).state).toBe('Held'); expect(a.hasAttempt).toBe(false);
  });
  it('retains explicit separate legs and four-decimal central rate, whole miles then GBP2dp', async () => {
    const t = new FakeMileageProcessor(), a = t.adapter(), r = await a.save(mileageDraft());
    expect(r.state).toBe('ReadbackVerified');
    if (r.state !== 'ReadbackVerified') throw new Error('No readback');
    expect(r.record.wholeMiles).toBe(12); expect(r.record.amountPence).toBe(148); expect(r.record.rate.rateTenThousandthsGbp).toBe(1234);
    expect(r.record.command.draft).toEqual(mileageDraft()); expect(r.record.command.expectedRateVersion).toBe('synthetic-rate-v7');
    expect(r.tenantWriteAllowed).toBe(false); expect(Object.keys(r.record.command)).not.toContain('actorId');
  });
  it('double click and later same Save submit once and reconcile the original operation', async () => {
    const t = new FakeMileageProcessor(), a = t.adapter(), one = a.save(mileageDraft()), two = a.save({ ...mileageDraft(), purpose: 'Replacement' });
    expect(two).toBe(one); await one; await a.save(mileageDraft()); expect(t.submissions).toBe(1); expect(t.reconciliations).toBe(2);
  });
  it('transport ambiguity retains operation and only reconciles despite changed input', async () => {
    const t = new FakeMileageProcessor(); t.ambiguous = true; const a = t.adapter();
    expect((await a.save(mileageDraft())).state).toBe('Pending'); const op = a.currentOperationId;
    expect((await a.save({ ...mileageDraft(), from: 'Different start' })).state).toBe('Pending');
    expect(a.currentOperationId).toBe(op); expect(a.hasAttempt).toBe(true); expect(t.submissions).toBe(1);
  });
  it('cold close/reopen and previous recovery retain same IDs, rate and explicit journey', async () => {
    const t = new FakeMileageProcessor(); await t.adapter().save(mileageDraft()); const cold = t.adapter();
    expect((await cold.reopen(801)).state).toBe('ReadbackVerified'); expect((await cold.checkPreviousSave()).state).toBe('ReadbackVerified'); expect(t.submissions).toBe(1);
  });
  it('unresolved cold context blocks creation with zero submissions', async () => {
    const t = new FakeMileageProcessor(); t.clearance = 'Unresolved'; expect((await t.adapter().save(mileageDraft())).state).toBe('Held'); expect(t.submissions).toBe(0);
  });
  it('R1 unresolved cold history cannot report an older saved line as the pending Save', async () => {
    const t = new FakeMileageProcessor(); await t.adapter().save(mileageDraft()); t.clearance = 'Unresolved';
    const cold = t.adapter(); expect((await cold.checkPreviousSave()).state).toBe('Pending');
    expect((await cold.reopen(801)).state).toBe('ReadbackVerified'); expect(t.submissions).toBe(1);
  });
  it('refreshes admission immediately before creation; display context is not clearance', async () => {
    const t = new FakeMileageProcessor(), a = t.adapter(); await a.load(); t.clearance = 'Unresolved';
    expect((await a.save(mileageDraft())).state).toBe('Held'); expect(t.submissions).toBe(0);
  });
  it('does not accept wrong actor raw read in the fake processor', async () => {
    const t = new FakeMileageProcessor(); await t.adapter().save(mileageDraft()); expect((await t.adapter(22).reopen(801)).state).toBe('Rejected');
  });
  it('rejects foreign item IDs before raw read', async () => {
    const t = new FakeMileageProcessor(); expect((await t.adapter().reopen(999)).state).toBe('Rejected');
  });
  it.each(['date', 'programme', 'nominalCode', 'from', 'to', 'purpose', 'outwardMiles', 'returnMiles'] as const)('rejects invalid %s without submission', async key => {
    const t = new FakeMileageProcessor(); expect((await t.adapter().save({ ...mileageDraft(), [key]: '' })).state).toBe('Rejected'); expect(t.submissions).toBe(0);
  });
  it.each(['actorId', 'parentId', 'parentEtag', 'amountPence', 'existingId'])('rejects forged form %s', async field => {
    const t = new FakeMileageProcessor(); const d = { ...mileageDraft(), [field]: 12 } as IMileageDraft;
    expect((await t.adapter().save(d)).state).toBe('Rejected'); expect(t.submissions).toBe(0);
  });
  it('wrong month and unapproved programme/nominal pair fail before submit', async () => {
    const t = new FakeMileageProcessor();
    for (const d of [{ ...mileageDraft(), date: '21-11-2026' }, { ...mileageDraft(), nominalCode: '00010' }]) expect((await t.adapter().save(d)).state).toBe('Rejected');
    expect(t.submissions).toBe(0);
  });
  it('no default rate, incomplete/overlapping/gapped rate snapshots reject', async () => {
    for (const rows of [[], [{ Title: 'Inactive', Active: false, EffectiveFrom: '2026-01-01', EffectiveTo: null, RatePerMile: 0.45 }]]) {
      const t = new FakeMileageProcessor(); t.contextValue = { ...t.contextValue, rates: { ...t.contextValue.rates, rows } };
      expect(['Held', 'Rejected']).toContain((await t.adapter().save(mileageDraft())).state); expect(t.submissions).toBe(0);
    }
    const t = new FakeMileageProcessor(); const rows = t.contextValue.rates.rows as unknown[];
    t.contextValue = { ...t.contextValue, rates: { ...t.contextValue.rates, rows: [...rows, ...rows] } };
    expect((await t.adapter().save(mileageDraft())).state).toBe('Rejected'); expect(t.submissions).toBe(0);
  });
  it('one-way keeps zero reverse leg explicit and does not discard entered miles', async () => {
    const t = new FakeMileageProcessor(); expect((await t.adapter().save({ ...mileageDraft(), returnJourney: false })).state).toBe('Rejected');
    const r = await t.adapter().save({ ...mileageDraft(), returnJourney: false, returnMiles: '' }); expect(r.state).toBe('ReadbackVerified');
    expect(t.record?.command.draft.returnJourney).toBe(false); expect(t.record?.command.draft.returnMiles).toBe('');
  });
  it.each(['id', 'requestId', 'originatorId', 'etag', 'programmeName', 'nominalDescription', 'wholeMiles', 'amountPence'] as const)('mismatched stored %s never reports success', async key => {
    const t = new FakeMileageProcessor(), a = t.adapter(); await a.save(mileageDraft());
    (t.record as unknown as Record<string, unknown>)[key] = key === 'id' ? 999 : 'invalid';
    expect((await a.reopen(801)).state).toBe('Rejected');
  });
  it('rejects altered operation/rate/parent/month readback under same item ID', async () => {
    for (const part of ['operationId', 'parentId', 'expectedRateVersion']) {
      const t = new FakeMileageProcessor(), a = t.adapter(); await a.save(mileageDraft());
      const c = t.record!.command as unknown as Record<string, unknown>; c[part] = part === 'parentId' ? 999 : 'different-version-or-operation';
      expect((await a.reopen(801)).state).toBe('Rejected');
    }
  });
  it('input is copied before async context access and receipt/actor getters are not executed', async () => {
    const t = new FakeMileageProcessor(), a = t.adapter(), d = mileageDraft(); const p = a.save(d);
    (d as { purpose: string }).purpose = 'Mutated after click'; await p; expect(t.record?.command.draft.purpose).toBe('Synthetic manual journey');
    let ran = false; const bad = mileageDraft(); Object.defineProperty(bad, 'purpose', { get: () => { ran = true; return 'not allowed'; } });
    expect((await t.adapter().save(bad)).state).toBe('Rejected'); expect(ran).toBe(false);
  });
});
