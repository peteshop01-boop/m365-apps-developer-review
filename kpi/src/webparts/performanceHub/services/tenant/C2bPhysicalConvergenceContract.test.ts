import type { IC2bNativePlanningObservations, IC2bNativeSourceObservation }
  from '../EmployeeWorkplanV2C2bNativeAdapter';
import { C2B_CONVERGED_TITLES, C2B_TEST_EXTENSION_TITLES, assertC2bDirectPhysicalFields,
  assertStableC2bPlanningProjection, decodeC2bPhysicalChunks, encodeC2bPhysicalChunks }
  from './C2bPhysicalConvergenceContract';

const row = (value: unknown, maximum: number): Record<string, unknown> => {
  const encoded = encodeC2bPhysicalChunks(value, 'StateChunk', maximum);
  return { StateLength: encoded.stateLength, StateCount: encoded.chunkCount, StateSHA256: encoded.stateSha256,
    ...encoded.fields };
};
const decode = (value: Readonly<Record<string, unknown>>, maximum: number): unknown =>
  decodeC2bPhysicalChunks(value, 'StateChunk', 'StateCount', 'StateLength', 'StateSHA256', maximum);

const source = (presence: 'Present' | 'Absent' = 'Present'): IC2bNativeSourceObservation => ({
  source: { listId: 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d', itemId: 7, itemVersion: '1.0' },
  sourceETag: '"1"', sourceRowVersion: '1', route: 'Employee', authorEmail: 'employee@example.invalid',
  envelope: { binding: { commandType: 'UpsertPersonalItemV2', subjectType: 'WorkplanItem', subjectKey: 'ITEM-1',
    personKey: 'P-1', performanceYear: 2026, workplanKey: 'P-1|2026' }, expected: { item: { presence } },
    payload: {} } as never
});
const planning = (): IC2bNativePlanningObservations => ({ employee: { personKey: 'P-1', managerPersonKey: 'M-1',
  managerEmail: 'manager@example.invalid' }, manager: { personKey: 'M-1', email: 'manager@example.invalid' },
actor: { email: 'employee@example.invalid' }, configuration: { performanceYear: 2026 },
allItems: [{ workplanItemNaturalKey: 'ITEM-0', workplanKey: 'P-1|2026', personKey: 'P-1', performanceYear: 2026,
  etag: '"1"' }], currentAcls: [], controlCases: [] } as unknown as IC2bNativePlanningObservations);

describe('PM11 lossless physical convergence contract', () => {
  it('binds all B01 and isolated identities to exact TEST titles', () => {
    expect(C2B_CONVERGED_TITLES).toEqual({ People: 'KCFKPI_TEST_People',
      EmployeeCommands: 'KCFKPI_TEST_EmployeeCommands', ManagerCommands: 'KCFKPI_TEST_ManagerCommands',
      CommandJournal: 'KCFKPI_TEST_CommandJournal', CommandEffects: 'KCFKPI_TEST_CommandEffects',
      CommandReceipts: 'KCFKPI_TEST_CommandReceipts', Workplans: 'KCFKPI_TEST_Workplans',
      WorkplanItems: 'KCFKPI_TEST_WorkplanItems', Audit: 'KCFKPI_TEST_Audit',
      BehaviourFrameworkSets: 'KCFKPI_BehaviourFrameworkSets',
      BehaviourFrameworkValues: 'KCFKPI_BehaviourFrameworkValues',
      BehaviourFocusCatalogue: 'KCFKPI_BehaviourFocusCatalogue',
      BehaviourCataloguePublications: 'KCFKPI_BehaviourCataloguePublications',
      PersonBehaviourAssignments: 'KCFKPI_PersonBehaviourAssignments',
      BehaviourObjectiveLibrary: 'KCFKPI_BehaviourObjectiveLibrary', ControlCases: 'KCFKPI_TEST_ControlCases',
      TenantProvisioningReceipts: 'KCFKPI_TEST_TenantProvisioningReceipts' });
    expect(C2B_TEST_EXTENSION_TITLES).toEqual({ QuarterReviews: 'KCFKPI_TEST_QuarterReviews',
      QuarterReviewItems: 'KCFKPI_TEST_QuarterReviewItems' });
  });

  it.each([[59992, 1], [59993, 2], [420000, 8], [900000, 16]])
  ('round-trips canonical payloads across %i data code units and %i chunks', (length, chunks) => {
    const value = { v: 'x'.repeat(length) }; const physical = row(value, chunks);
    expect(physical.StateCount).toBe(chunks); expect(decode(physical, chunks)).toEqual(value);
  });

  it('never splits a Unicode surrogate pair at a 60,000-code-unit boundary', () => {
    const value = { v: `${'x'.repeat(59993)}😀tail` }; const encoded = row(value, 2);
    expect(String(encoded.StateChunk01).endsWith('\ud83d')).toBe(false);
    expect(decode(encoded, 2)).toEqual(value);
  });

  it.each([
    ['missing', (v: Record<string, unknown>) => { v.StateChunk01 = null; }],
    ['extra', (v: Record<string, unknown>) => { v.StateCount = 1; v.StateChunk02 = 'x'; }],
    ['order', (v: Record<string, unknown>) => { const a = v.StateChunk01; v.StateChunk01 = v.StateChunk02; v.StateChunk02 = a; }],
    ['count', (v: Record<string, unknown>) => { v.StateCount = 3; }],
    ['length', (v: Record<string, unknown>) => { v.StateLength = Number(v.StateLength) + 1; }],
    ['digest', (v: Record<string, unknown>) => { v.StateSHA256 = 'F'.repeat(64); }],
    ['noncanonical', (v: Record<string, unknown>) => { v.StateChunk01 = '{ "v":"x"}'; v.StateCount = 1;
      v.StateLength = String(v.StateChunk01).length; }]
  ])('rejects %s chunk-state tampering', (_label, attack) => {
    const physical = row({ v: 'x'.repeat(60000) }, 2); attack(physical);
    expect(() => decode(physical, 2)).toThrow(/C2B_PHYSICAL_/);
  });

  it('rejects oversize payloads and unknown direct physical columns', () => {
    expect(() => encodeC2bPhysicalChunks({ v: 'x'.repeat(120000) }, 'StateChunk', 2))
      .toThrow(/C2B_PHYSICAL_CAPACITY_EXCEEDED/);
    expect(() => assertC2bDirectPhysicalFields('Workplans', { WorkplanKey: 'P-1|2026', CanonicalJSON: '{}' }))
      .toThrow(/C2B_DIRECT_FIELD_OUT_OF_CONTRACT/);
    expect(() => assertC2bDirectPhysicalFields('Workplans', { WorkplanKey: 'P-1|2026', Delete: true }))
      .toThrow(/C2B_DIRECT_FIELD_OUT_OF_CONTRACT/);
    expect(() => assertC2bDirectPhysicalFields('Workplans', { WorkplanKey: 'P-1|2026' })).not.toThrow();
  });

  it('admits only a stable, complete, uncrossed in-memory planning projection', () => {
    const first = planning(); const second = planning();
    expect(assertStableC2bPlanningProjection(first, second, source())).toEqual(first);
    const changed = planning(); (changed.allItems[0] as { etag: string }).etag = '"2"';
    expect(() => assertStableC2bPlanningProjection(first, changed, source())).toThrow(/C2B_PLANNING_TOCTOU/);
    const base = planning(); const duplicate = { ...base, allItems: [...base.allItems, { ...base.allItems[0] }] };
    expect(() => assertStableC2bPlanningProjection(duplicate, duplicate, source()))
      .toThrow(/C2B_PLANNING_ITEMS_INVALID/);
    const allocated = { ...planning(), allItems: [], allocatedItemKey: 'ITEM-1' } as IC2bNativePlanningObservations;
    expect(assertStableC2bPlanningProjection(allocated, allocated, source('Absent')).allocatedItemKey).toBe('ITEM-1');
    expect(() => assertStableC2bPlanningProjection({ ...allocated, allocatedItemKey: 'SUBSTITUTED' },
      { ...allocated, allocatedItemKey: 'SUBSTITUTED' }, source('Absent'))).toThrow(/C2B_PLANNING_ALLOCATED_KEY_INVALID/);
  });
});
