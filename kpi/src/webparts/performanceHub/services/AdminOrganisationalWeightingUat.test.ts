import type { IAdminUatContext } from '../models/AdminFoundationModels';
import {
  organisationalWeightGroupKey,
  organisationalWeightRecordKey,
  type IOrganisationalWeightRecord
} from './ProductionPolicyStructures';
import type { IOrganisationalWeightExpectation } from './OrganisationalWeightingPolicy';
import {
  buildAdminOrganisationalWeightingExpectations,
  createAdminOrganisationalWeightingReadOnlyState,
  createAdminOrganisationalWeightingUatState,
  getAdminOrganisationalWeightingReadiness,
  listAdminOrganisationalWeightRows,
  parseAdminOrganisationalWeightDraft,
  selectAdminOrganisationalWeightingPeriod,
  setAdminOrganisationalWeightSafeUat,
  type IAdminOrganisationalWeightingUatState
} from './AdminOrganisationalWeightingUat';

const context: IAdminUatContext = {
  actorEmail: 'synthetic.system.admin@example.invalid',
  occurredAt: '2026-08-22T09:30:00.000Z'
};
const asOfDate = '2026-08-22';

const members: IOrganisationalWeightExpectation[] = [
  { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-A', childKey: 'KPI-1', active: true },
  { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-A', childKey: 'KPI-2', active: true },
  { weightLevel: 'WorkstreamWithinPillar', parentKey: 'P-A', childKey: 'WS-A', active: true }
];

const approvedRecord = (
  weightLevel: IOrganisationalWeightRecord['weightLevel'],
  parentKey: string,
  childKey: string,
  weightPercent: number,
  patch: Partial<IOrganisationalWeightRecord> = {}
): IOrganisationalWeightRecord => ({
  organisationalWeightKey: organisationalWeightRecordKey({
    performanceYear: patch.performanceYear ?? 2027,
    weightLevel,
    parentKey,
    childKey,
    version: patch.version ?? 'v01'
  }),
  weightGroupKey: organisationalWeightGroupKey({
    performanceYear: patch.performanceYear ?? 2027,
    weightLevel,
    parentKey,
    version: patch.version ?? 'v01'
  }),
  performanceYear: 2027,
  weightLevel,
  parentKey,
  childKey,
  weightPercent,
  active: true,
  approvalStatus: 'Approved',
  effectiveFrom: '2026-04-01',
  version: 'v01',
  approvalReference: 'CONTROL-TEST',
  source: 'Synthetic test fixture',
  historicSnapshotLocked: false,
  ...patch
});

describe('KCF-KPI-020B organisational weighting safe Admin UAT domain', () => {
  it('derives explicit 109 KPI / 28 Workstream / optional 7 Pillar membership without assigning weights', () => {
    const kpis = Array.from({ length: 109 }, (_unused, index) => ({
      kpiId: 'KPI-' + (index + 1),
      pillar: 'P-' + ((index % 7) + 1),
      workstream: 'WS-' + ((index % 28) + 1),
      active: true
    }));
    const expectations = buildAdminOrganisationalWeightingExpectations(kpis, true);

    expect(expectations.filter(row => row.weightLevel === 'KPIWithinWorkstream')).toHaveLength(109);
    expect(expectations.filter(row => row.weightLevel === 'WorkstreamWithinPillar')).toHaveLength(28);
    expect(expectations.filter(row => row.weightLevel === 'PillarWithinBoard')).toHaveLength(7);
    expect(expectations.some(row => Object.prototype.hasOwnProperty.call(row, 'weightPercent'))).toBe(false);
  });

  it('starts genuinely blank as NOT READY with every active member visible and no equal fill', () => {
    const state = createAdminOrganisationalWeightingUatState(2027, 'v01', asOfDate, members);

    expect(state).toMatchObject({
      mode: 'SafeLocalUat',
      sourceList: 'KCFKPI_OrganisationalWeights',
      persistence: 'BrowserMemoryOnly',
      asOfDate,
      records: []
    });
    expect(listAdminOrganisationalWeightRows(state)).toEqual(members.map(member => ({
      ...member,
      weightPercent: undefined,
      approvalStatus: undefined,
      approvalReference: undefined,
      stored: false
    })));
    expect(getAdminOrganisationalWeightingReadiness(state)).toMatchObject({
      publicationReady: false,
      configurationState: 'NOT READY'
    });
  });

  it('sets and clears only the selected member in browser memory with an audit event', () => {
    const productionReadRecords: IOrganisationalWeightRecord[] = [];
    let state = createAdminOrganisationalWeightingUatState(
      2027, 'v01', asOfDate, members, productionReadRecords
    );

    state = setAdminOrganisationalWeightSafeUat(
      state,
      { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-A', childKey: 'KPI-1' },
      75,
      context
    );
    expect(state.records).toHaveLength(1);
    expect(state.records[0]).toMatchObject({
      performanceYear: 2027,
      version: 'v01',
      weightPercent: 75,
      approvalStatus: 'Draft',
      approvalReference: 'KCF-KPI-020B-UAT-DRAFT',
      source: 'KCF-KPI-020B safe browser-memory Admin UAT'
    });
    expect(listAdminOrganisationalWeightRows(state).map(row => row.weightPercent)).toEqual([75, undefined, undefined]);
    expect(productionReadRecords).toEqual([]);
    expect(state.audit[0]).toMatchObject({
      action: 'WeightSet',
      childKey: 'KPI-1',
      previousWeightPercent: undefined,
      nextWeightPercent: 75,
      actorEmail: context.actorEmail
    });

    state = setAdminOrganisationalWeightSafeUat(
      state,
      { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-A', childKey: 'KPI-1' },
      undefined,
      context
    );
    expect(state.records).toEqual([]);
    expect(state.audit[1].action).toBe('WeightCleared');
    expect(getAdminOrganisationalWeightingReadiness(state).configurationState).toBe('NOT READY');
  });

  it('requires an explicit version before any safe staging action', () => {
    const state = createAdminOrganisationalWeightingUatState(
      2027, 'SELECT-VERSION', asOfDate, members, []
    );
    expect(() => setAdminOrganisationalWeightSafeUat(
      state,
      { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-A', childKey: 'KPI-1' },
      100,
      context
    )).toThrow('Choose an explicit organisational-weighting version');
  });

  it('reports exact 100 active groups READY only when the stored version is approved', () => {
    const records = [
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-1', 40),
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-2', 60),
      approvedRecord('WorkstreamWithinPillar', 'P-A', 'WS-A', 100)
    ];
    const state = createAdminOrganisationalWeightingUatState(2027, 'v01', asOfDate, members, records);
    expect(getAdminOrganisationalWeightingReadiness(state)).toMatchObject({
      publicationReady: true,
      configurationState: 'READY'
    });

    const edited = setAdminOrganisationalWeightSafeUat(
      state,
      { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-A', childKey: 'KPI-1' },
      50,
      context
    );
    const readiness = getAdminOrganisationalWeightingReadiness(edited);
    expect(readiness.configurationState).toBe('NOT READY');
    expect(readiness.workstreamKpiTotals[0]).toMatchObject({ total: 110, exactTotal: false, ready: false });
    expect(edited.records[0].approvalStatus).toBe('Draft');
    expect(records[0]).toMatchObject({ weightPercent: 40, approvalStatus: 'Approved' });
  });

  it('keeps other Performance Years and versions untouched when the Admin selection changes', () => {
    const records = [
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-1', 40),
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-1', 25, {
        performanceYear: 2028, version: 'v02'
      })
    ];
    const initial = createAdminOrganisationalWeightingUatState(2027, 'v01', asOfDate, members, records);
    const selected = selectAdminOrganisationalWeightingPeriod(
      initial, 2028, 'v02', '2027-08-22', members
    );
    const edited = setAdminOrganisationalWeightSafeUat(
      selected,
      { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-A', childKey: 'KPI-1' },
      30,
      context
    );

    expect(edited.records.filter(item => item.performanceYear === 2027)[0].weightPercent).toBe(40);
    expect(edited.records.filter(item => item.performanceYear === 2028)[0]).toMatchObject({
      version: 'v02', weightPercent: 30, approvalStatus: 'Draft'
    });
    expect(edited.asOfDate).toBe('2027-08-22');
  });

  it('supports the optional Pillar-within-Board level without making it mandatory', () => {
    const boardMembers = members.concat([
      { weightLevel: 'PillarWithinBoard', parentKey: 'BOARD', childKey: 'P-A', active: true }
    ] as IOrganisationalWeightExpectation[]);
    const records = [
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-1', 40),
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-2', 60),
      approvedRecord('WorkstreamWithinPillar', 'P-A', 'WS-A', 100),
      approvedRecord('PillarWithinBoard', 'BOARD', 'P-A', 100)
    ];
    expect(getAdminOrganisationalWeightingReadiness(
      createAdminOrganisationalWeightingUatState(2027, 'v01', asOfDate, boardMembers, records)
    ).configurationState).toBe('READY');
  });

  it('rejects unsafe persistence, unknown members, invalid values and locked snapshots', () => {
    const safe = createAdminOrganisationalWeightingUatState(2027, 'v01', asOfDate, members);
    const target = { weightLevel: 'KPIWithinWorkstream' as const, parentKey: 'WS-A', childKey: 'KPI-1' };
    const forged = { ...safe, persistence: 'SharePoint' } as unknown as IAdminOrganisationalWeightingUatState;
    expect(() => setAdminOrganisationalWeightSafeUat(forged, target, 50, context)).toThrow(/safe browser-memory/);
    expect(() => setAdminOrganisationalWeightSafeUat(safe, { ...target, childKey: 'UNKNOWN' }, 50, context)).toThrow(/not a unique active/);
    expect(() => setAdminOrganisationalWeightSafeUat(safe, target, 100.001, context)).toThrow(/no more than two decimal/);

    const locked = createAdminOrganisationalWeightingUatState(2027, 'v01', asOfDate, members, [
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-1', 40, {
        publishedSnapshotKey: 'PUB-2026', historicSnapshotLocked: true
      })
    ]);
    expect(() => setAdminOrganisationalWeightSafeUat(locked, target, 50, context)).toThrow(/cannot be edited/);
  });

  it('parses controlled row drafts without weakening the 0–100 or two-decimal contract', () => {
    ['0', '90', '99.99', '100'].forEach(value => {
      expect(parseAdminOrganisationalWeightDraft(value)).toBe(Number(value));
    });
    ['', 'not-a-number', '-1', '100.001', '100.01', '110'].forEach(value => {
      expect(() => parseAdminOrganisationalWeightDraft(value)).toThrow();
    });
  });

  it('threads explicit effective-date governance through safe, read-only and period-selected state', () => {
    const records = [
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-1', 40),
      approvedRecord('KPIWithinWorkstream', 'WS-A', 'KPI-2', 60),
      approvedRecord('WorkstreamWithinPillar', 'P-A', 'WS-A', 100)
    ];
    const safe = createAdminOrganisationalWeightingUatState(
      2027, 'v01', '2026-03-31', members, records
    );
    expect(safe.asOfDate).toBe('2026-03-31');
    expect(getAdminOrganisationalWeightingReadiness(safe).errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/not effective on 2026-03-31/)
    ]));

    const readOnly = createAdminOrganisationalWeightingReadOnlyState(
      2027, 'v01', '2026-08-22', members, records
    );
    expect(readOnly).toMatchObject({
      mode: 'ProductionReadOnly', persistence: 'ReadOnly', asOfDate: '2026-08-22'
    });
    expect(getAdminOrganisationalWeightingReadiness(readOnly).publicationReady).toBe(true);

    const expiredRecords = records.map(item => ({ ...item, effectiveTo: '2026-08-22' }));
    const expired = createAdminOrganisationalWeightingReadOnlyState(
      2027, 'v01', '2026-08-22T18:30:00.000Z', members, expiredRecords
    );
    expect(getAdminOrganisationalWeightingReadiness(expired).publicationReady).toBe(true);
    const nextPeriod = selectAdminOrganisationalWeightingPeriod(
      expired, 2027, 'v01', '2026-08-23', members
    );
    expect(nextPeriod.asOfDate).toBe('2026-08-23');
    expect(getAdminOrganisationalWeightingReadiness(nextPeriod).publicationReady).toBe(false);
  });

  it('rejects construction or period selection without a valid explicit as-of date', () => {
    expect(() => createAdminOrganisationalWeightingUatState(
      2027, 'v01', '', members
    )).toThrow(/valid as-of date/);
    const safe = createAdminOrganisationalWeightingUatState(2027, 'v01', asOfDate, members);
    expect(() => selectAdminOrganisationalWeightingPeriod(
      safe, 2028, 'v02', 'invalid', members
    )).toThrow(/valid as-of date/);
  });
});
