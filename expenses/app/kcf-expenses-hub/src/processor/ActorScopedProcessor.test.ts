import { ActorScopedProcessorIO, processActorScopedExpense } from './ActorScopedProcessor';
import type { IActorScopePolicy } from './ActorScopedProcessor';
import type { IStandardStoreSchema } from './SharePointStandardStore';
import { StandardStoreIO } from './StandardStoreTransport';
import type { IStandardStoreTransport } from './StandardStoreTransport';
import type { IStoredExpense } from '../services/persistence/PersistenceContract';

// Same HTTP fixture as the Node integration checks, with the actual native
// Heft/Jest module imports above. No emitted WDL/native tenant credit.
interface Fixture {
  p: IActorScopePolicy; schemas: IStandardStoreSchema;
  send: IStandardStoreTransport['send'];
  add(actor: number, kind: string): number;
  tables: Record<string, Record<string, unknown>[]>;
  creates: unknown[]; writes: unknown[]; scopeFlags: Record<string, unknown>;
  rawGet(actor: number, resource: string, id: number, receipt?: boolean): { status: number };
  scopeHooks: { before?: (fixture: Fixture) => void };
}
const source = jest.requireActual('../../flow/actor-scoped-fixture.cjs') as { ScopedTenant: new () => Fixture; receipts: Record<string, Uint8Array> };
const io = (f: Fixture): StandardStoreIO => new StandardStoreIO({ send: f.send.bind(f) });
async function save(f: Fixture, requestId = 501): Promise<IStoredExpense> {
  const result = await processActorScopedExpense(io(f), f.schemas, f.p, requestId);
  expect(result.state).toBe('StorageVerified');
  if (result.state !== 'StorageVerified') throw new Error('SOURCE_TEST_NOT_VERIFIED');
  expect(result.tenantWriteAllowed).toBe(false); return result.record;
}
test('native Jest scoped store cold-reopens the exact PDF and duplicate ID without a second creation', async () => {
  const f = new source.ScopedTenant(), record = await save(f), count = f.creates.length;
  const cold = await ActorScopedProcessorIO.open(io(f), f.schemas, f.p, 501);
  expect(await cold.store().readLine(record.line.id)).toEqual(record);
  expect(Array.from((await cold.store().readReceipt(record))!)).toEqual(Array.from(source.receipts.pdf));
  expect(await save(f)).toEqual(record); expect(f.creates.length).toBe(count);
});
test('native Jest same shared source saves two employees with reciprocal raw request/expense/receipt/ledger/result denial', async () => {
  const f = new source.ScopedTenant(), b = f.add(12, 'jpg'), a = await save(f), other = await save(f, b);
  expect(other.line.id).not.toBe(a.line.id);
  for (const [actor, record, request] of [[11, a, 501], [12, other, b]] as const) {
    const wrong = actor === 11 ? 12 : 11;
    expect(f.rawGet(actor, 'expenses', record.line.id).status).toBe(200);
    expect(f.rawGet(wrong, 'expenses', record.line.id).status).toBe(403);
    expect(f.rawGet(wrong, 'expenses', record.line.id, true).status).toBe(403);
    expect(f.rawGet(wrong, 'requests', request).status).toBe(403);
    for (const n of ['operations', 'results']) {
      const row = f.tables[n].find(r => r.OperationKey === `${actor}:test-operation-0001`)!;
      expect(f.rawGet(wrong, n, row.Id as number).status).toBe(403);
    }
  }
});
test('native Jest invalid destination ACL fails before any ledger or financial write', async () => {
  const f = new source.ScopedTenant(); f.scopeFlags.extraFolderRole = 'results';
  expect((await processActorScopedExpense(io(f), f.schemas, f.p, 501)).state).toBe('Held');
  expect(f.writes).toHaveLength(0); expect(f.tables.expenses).toHaveLength(0);
});
test('native Jest lost acknowledgement is Pending and same operation reconciles the original item', async () => {
  const f = new source.ScopedTenant(); f.scopeFlags.lostAck = 'expenses';
  expect((await processActorScopedExpense(io(f), f.schemas, f.p, 501)).state).toBe('Pending');
  expect(f.tables.expenses).toHaveLength(1);
  const record = await save(f); expect(record.line.id).toBe(f.tables.expenses[0].Id);
  expect(f.tables.expenses).toHaveLength(1);
});
test('native Jest cold recovered output requires the genuine processor native Author', async () => {
  for (const name of ['operations', 'expenses', 'results', 'audit']) {
    const f = new source.ScopedTenant(); await save(f); f.tables[name][0].AuthorId = 88;
    expect((await processActorScopedExpense(io(f), f.schemas, f.p, 501)).state).not.toBe('StorageVerified');
    expect(f.tables.expenses).toHaveLength(1);
  }
});
test('native Jest final saved-child sharing change cannot pass terminal verification', async () => {
  const f = new source.ScopedTenant();
  f.scopeHooks.before = current => {
    if (current.tables.operations[0]?.State === 'Completed' && current.tables.claims[0].D01Reservation === '') current.tables.expenses[0].HasUniqueRoleAssignments = true;
  };
  expect((await processActorScopedExpense(io(f), f.schemas, f.p, 501)).state).not.toBe('StorageVerified');
  expect(f.tables.expenses).toHaveLength(1);
});
test('native Jest expanded root or folder ACL continuation refuses all publication', async () => {
  for (const flag of ['expandedRootAclPaged', 'expandedFolderAclPaged']) {
    const f = new source.ScopedTenant(); f.scopeFlags[flag] = true;
    expect((await processActorScopedExpense(io(f), f.schemas, f.p, 501)).state).toBe('Held'); expect(f.writes).toHaveLength(0);
  }
});
test('native Jest simultaneous same-token A/B saves retain their own returned IDs', async () => {
  const f = new source.ScopedTenant(), request = f.add(12, 'jpg');
  const [a, b] = await Promise.all([save(f), save(f, request)]);
  expect(a.line.id).not.toBe(b.line.id); expect(f.tables.operations).toHaveLength(2); expect(f.tables.expenses).toHaveLength(2);
  expect(f.rawGet(12, 'expenses', a.line.id).status).toBe(403); expect(f.rawGet(11, 'expenses', b.line.id).status).toBe(403);
});
test('native Jest raw fixture permissions follow actual ACLs and cannot fake denial for a bad Read grant', async () => {
  const f = new source.ScopedTenant(), record = await save(f);
  expect(f.rawGet(12, 'expenses', record.line.id).status).toBe(403);
  expect(f.rawGet(88, 'expenses', record.line.id).status).toBe(403);
  f.tables.expenses[0].D01Originator = 12;
  expect(f.rawGet(12, 'expenses', record.line.id).status).toBe(403);
  f.tables.expenses[0].D01Originator = 11; f.scopeFlags.extraFolderRole = 'expenses';
  expect(f.rawGet(88, 'expenses', record.line.id).status).toBe(200);
  expect((await processActorScopedExpense(io(f), f.schemas, f.p, 501)).state).not.toBe('StorageVerified');
});

test('native Jest private audit uses its actual root ACL, including visibility of an unqualified Read grant', async () => {
  const f = new source.ScopedTenant(); await save(f); const id = f.tables.audit[0].Id;
  if (typeof id !== 'number') throw new Error('NATIVE_FAKE_AUDIT_ID_REQUIRED');
  expect(f.rawGet(11, 'audit', id).status).toBe(403); expect(f.rawGet(88, 'audit', id).status).toBe(403);
  expect(f.rawGet(98, 'audit', id).status).toBe(200); expect(f.rawGet(99, 'audit', id).status).toBe(200);
  f.scopeFlags.extraRootRole = 'audit'; expect(f.rawGet(88, 'audit', id).status).toBe(200);
  expect((await processActorScopedExpense(io(f), f.schemas, f.p, 501)).state).not.toBe('StorageVerified');
});
