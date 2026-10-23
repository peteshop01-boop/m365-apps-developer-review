jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import { admitTestCommandV2, reloadBoundJournalV2, TrustedAdmissionInputs, TrustedWireSource } from './TestPilotCommandAdmission';
import { createTestCoreRequest, createTestWorkplanDraftRequest } from './TestPilotCommandWire';
import { serializeEmployeeV2Command } from './EmployeeWorkplanV2CommandTransport';
import { KCF_KPI_036_TEST_LIST_BINDINGS } from './EmployeeWorkplanV2ListBindings';
import { TEST_SCHEMA_VERSION, EffectIntent, SafeBusinessRow, ModelHeader, TestBinding } from '../models/TestPilotContracts';
import { intendedCoreSet, issueEffect, settleEffect } from './TestRuntimeBindings';
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const command = 'fb1f6035-236e-434c-ae05-a78003badd47', key = 'EMP-1|2027', subject = key + '|CoreGold|K1';
function fixture(create = false, present = true): { source: TrustedWireSource; trusted: TrustedAdmissionInputs } {
  const core = { kpiId: 'K1', role: 'Contributor' as const, contributionMethod: 'AdditiveDirect' as const, annualTargetValue: 7.5,
    annualTargetText: 'é 🏏', quarterTargets: ['Q1','Q2','Q3','Q4'].map(quarter => ({ quarter: quarter as 'Q1', targetValue: 1.25 })), displayOrder: 0, activeInWorkplan: true };
  const request = create ? createTestWorkplanDraftRequest(command, 'EMP-1') : createTestCoreRequest(command, 'EMP-1', '4', '"h4"', present ? { presence: 'Present', etag: '"i2"' } : { presence: 'Absent' }, core);
  const outer = JSON.parse(serializeEmployeeV2Command(request, KCF_KPI_036_TEST_LIST_BINDINGS, '2026-09-09T01:00:00Z'));
  const binding: TestBinding = { environment: 'TEST', performanceYear: 2027, schemaVersion: TEST_SCHEMA_VERSION,
    profileListId: 'fb1f6035-236e-434c-ae05-a78003badd47', statusListId: 'cbf5edb8-5d3b-46a5-a5ea-4564fa3ff43c', commandListId: 'cb02da80-d986-4034-a832-41d7b04e56ff', workplansListId: 'cd90f5d6-e067-45db-ab58-2cdc57ea4cb4', workplanItemsListId: '5269ebee-565a-4093-a666-00c98cfc5f68' };
  const header: ModelHeader = { id: 10, etag: '"h4"', workplanKey: key, personKey: 'EMP-1', year: 2027, workplanVersion: 1, rowVersionToken: create ? 0 : 4, transition: 'Ready', access: 'EmployeeEdit', correlation: null };
  const row: SafeBusinessRow = { key: subject, naturalKey: subject, workplanKey: key, personKey: 'EMP-1', year: 2027, category: 'CoreGold', referenceKey: 'K1', active: true, weight: 100, target: 3, BehaviourSelectedSuggestionKeysJ: '[]', BehaviourCustomObjective: '' };
  const other: SafeBusinessRow = { ...row, key: key+'|CoreGold|K2', naturalKey: key+'|CoreGold|K2', referenceKey: 'K2', weight: present ? 50 : 100 };
  if (present) row.weight = 50;
  const personal: SafeBusinessRow = { ...row, key: key+'|LocalPersonal|P1', naturalKey: key+'|LocalPersonal|P1', referenceKey: 'P1', category: 'LocalPersonal', weight: 100 };
  const before = create ? [] : [...(present ? [row] : []), other, personal];
  const intended = create ? [] : intendedCoreSet(before, { ...row, target: 7.5 });
  const state: TrustedAdmissionInputs['state'] = { environment: 'TEST', year: 2027, revision: 1, phase: 'Active', actors: [
    { personKey: 'EMP-1', email: 'employee@example.invalid', active: true, roles: ['Employee'], managerPersonKey: 'MANAGER-1' },
    { personKey: 'MANAGER-1', email: 'manager@example.invalid', active: true, roles: ['Manager'], managerPersonKey: null }] };
  const source: TrustedWireSource = { identity: { listId: binding.commandListId!, itemId: 20, version: '1.0', etag: '"s1"', commandKey: command,
    commandType: request.commandType as 'CreateWorkplanDraft' | 'UpsertCoreContributionV2', actorKey: 'EMP-1', actorEmail: 'employee@example.invalid', year: 2027,
    correlationKey: command, subjectType: create ? 'Workplan' : 'WorkplanItem', subjectKey: request.subjectKey, workplanKey: key, resultKeys: [request.subjectKey] },
    authorEmail: 'employee@example.invalid', editorEmail: 'employee@example.invalid', createdAt: '2026-09-09T01:00:00Z', modifiedAt: '2026-09-09T01:00:00Z', outer };
  const rows = before.map((r, index) => ({ row: r, id: 100+index, etag: r.key === subject ? '"i2"' : '"other"', fullImage: { row: clone(r), historical: 'preserve '+r.key } }));
  const effect = (kind: EffectIntent['kind'], effectKey: string, id: number | null, etag: string | null, beforeImage: string | null, desiredImage: string, reader: string | null = null): EffectIntent =>
    ({ id: command+':'+kind+':'+effectKey, kind, key: effectKey, existingId: id, expectedETag: etag, beforeImage, desiredImage, reader });
  const claimed = { ...header, rowVersionToken: header.rowVersionToken+1, transition: 'InProgress', correlation: command, etag: '"claim"' };
  const intents: EffectIntent[] = [effect('Claim', key, create ? null : header.id, create ? null : header.etag, create ? null : JSON.stringify(header), JSON.stringify(claimed))];
  for (const r of intended.filter(r => r.category === 'CoreGold')) { const old = rows.find(x => x.row.key === r.key);
    intents.push(effect('Canonical', r.key, old?.id ?? null, old?.etag ?? null, old ? JSON.stringify(old.row) : null, JSON.stringify(r)), effect('Grant', r.key, null, null, null, 'employee read', 'EMP-1')); }
  intents.push(effect('Finalise', key, header.id, '"claim"', JSON.stringify(claimed), JSON.stringify({ ...claimed, rowVersionToken: header.rowVersionToken+2, transition: 'Ready' })),
    effect('StatusCreate', 'STATUS-1', null, null, null, 'safe status intent'), effect('StatusGrant', 'STATUS-1', null, null, null, 'self status', 'EMP-1'));
  const trusted: TrustedAdmissionInputs = { binding, trustedBinding: clone(binding), profile: { Title: 'Employee', ProfileKey: 'employee@example.invalid:2027', PersonKey: 'EMP-1', Email: 'employee@example.invalid', Active: true, PerformanceYear: 2027,
    ManagerPersonKey: 'MANAGER-1', ManagerDisplayName: 'Manager', ManagerEmail: 'manager@example.invalid', ManagerMappingValid: true, MappingRevision: 1, SchemaVersion: TEST_SCHEMA_VERSION },
    state, revision: 1, header, matchingHeaderCount: create ? 0 : 1, snapshot: create ? null : { before: header, after: clone(header), pages: [before], complete: true }, rows, referenceKeys: ['K1','K2'], intents, intendedRows: intended,
    grants: { commandKey: command, correlation: command, subjectKey: key, actorKey: 'EMP-1', expectedRevision: 1, state: clone(state), resources: [
      { key, resource: 'Core', workplanKey: key, personKey: 'EMP-1', year: 2027 },
      ...intended.map(r => ({ key: r.key, resource: r.category === 'CoreGold' ? 'Core' as const : 'Personal' as const, workplanKey: key, personKey: 'EMP-1', year: 2027 as const })),
      { key: 'STATUS-1', resource: 'Status', workplanKey: key, personKey: 'EMP-1', year: 2027 }] } };
  return { source, trusted };
}
const run = (f: ReturnType<typeof fixture>) => admitTestCommandV2(f.source, clone(f.source), f.trusted);
describe('M145 factory -> real serializer -> admission -> full bound C1 plan/reload', () => {
  it.each([[true,false], [false,true], [false,false]])('plans and reloads Create=%s item Present=%s without effects', (create,present) => {
    const f = fixture(create,present), before = JSON.stringify(f), b = run(f);
    expect(b.c1Journal.phase).toBe('Planned'); expect(b.c1Journal.effects.every(e => e.disposition === 'Planned' && e.response === null)).toBe(true);
    expect(reloadBoundJournalV2(JSON.stringify(b), b, f.source, clone(f.source), f.trusted)).toEqual(b);
    expect(JSON.stringify(f)).toBe(before); expect(Object.isFrozen(b.fullIntent.effects)).toBe(true);
    const claim = b.c1Journal.effects.find(e => e.kind === 'Claim')!;
    const issued = issueEffect(b.c1Journal, claim.id, create ? null : f.trusted.header, f.trusted.grants);
    expect(issued.effects.find(e => e.id === claim.id)!.disposition).toBe('Issued');
    expect(b.c1Journal.effects[0].disposition).toBe('Planned'); // pure C1 transition only, never an HTTP operation
    if (!create) { expect(b.fullIntent.coreProjection!.annualTargetText).toBe('é 🏏');
      expect(b.fullIntent.effects.filter(e => e.intent.kind === 'Canonical')).toHaveLength(2);
      expect(b.c1Journal.intendedRows.filter(r => r.category === 'CoreGold').map(r => r.weight)).toEqual([50,50]);
      expect(b.c1Journal.intendedRows.find(r => r.category === 'LocalPersonal')).toEqual(f.trusted.rows.find(r => r.row.category === 'LocalPersonal')!.row); }
  });
  it('distinguishes same-header/different-item commands and rejects stale item observations', () => {
    const f = fixture(), first = run(f), w = JSON.parse(f.source.outer.PayloadJSON as string); w.expected.item.etag = '"different"';
    f.source.outer.PayloadJSON = JSON.stringify(w); expect(() => run(f)).toThrow();
    expect(first.admittedExpected.item).toEqual({ presence: 'Present', etag: '"i2"' });
  });
  it.each(['raw','version','author','outer','token','header','presence','incomplete','intent','grant','projection'])('rejects source/authority/expected/full intent mismatch: %s', change => {
    const f = fixture(), b = run(f);
    if (change === 'raw') f.source.outer.PayloadJSON += ' ';
    if (change === 'version') f.source.identity.version = '2.0';
    if (change === 'author') f.source.authorEmail = 'other@example.invalid';
    if (change === 'outer') f.source.outer.PersonKey = 'OTHER';
    if (change === 'token') f.source.outer.ExpectedRowVersionToken = 4;
    if (change === 'header') f.trusted.snapshot!.after = { ...f.trusted.header, etag: '"new"' };
    if (change === 'presence') f.trusted.rows.shift();
    if (change === 'incomplete') f.trusted.snapshot!.complete = false;
    if (change === 'intent') f.trusted.intents.find(e => e.kind === 'Canonical')!.beforeImage = '{}';
    if (change === 'grant') f.trusted.grants.resources[0].personKey = 'OTHER';
    if (change === 'projection') f.trusted.intendedRows[0].target = 999;
    expect(() => reloadBoundJournalV2(JSON.stringify(b), b, f.source, clone(f.source), f.trusted)).toThrow();
    if (change !== 'raw') expect(() => run(f)).toThrow();
  });
  it('rejects second-read mutation and bare/changed-policy/mutated full binding on reload', () => {
    const f = fixture(), b = run(f), second = clone(f.source); second.outer.PayloadJSON += ' ';
    expect(() => admitTestCommandV2(f.source, second, f.trusted)).toThrow();
    const bad = clone(b); bad.fullIntent.effects[0].fullDesiredImage = 'forged';
    expect(() => reloadBoundJournalV2(JSON.stringify(bad), b, f.source, clone(f.source), f.trusted)).toThrow();
    expect(() => reloadBoundJournalV2(JSON.stringify(b.c1Journal), b, f.source, clone(f.source), f.trusted)).toThrow();
    expect(() => reloadBoundJournalV2(JSON.stringify({ ...b, admissionPolicyVersion: 'old' }), b, f.source, clone(f.source), f.trusted)).toThrow();
  });
  it('holds a real C1 unknown predecessor even if a caller merely relabels it Terminal', () => {
    const f = fixture(), b = run(f), claim = b.c1Journal.effects[0];
    const unknown = settleEffect(issueEffect(b.c1Journal, claim.id, f.trusted.header, f.trusted.grants), claim.id, 'Unknown', null);
    f.trusted.predecessor = { journal: unknown, terminalSnapshot: f.trusted.snapshot! }; expect(() => run(f)).toThrow();
    f.trusted.predecessor.journal.phase = 'Terminal'; expect(() => run(f)).toThrow();
  });
});
