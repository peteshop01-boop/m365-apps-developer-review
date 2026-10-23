import {
  organisationalWeightGroupKey,
  organisationalWeightRecordKey,
  type IOrganisationalWeightRecord
} from './ProductionPolicyStructures';
import {
  type IOrganisationalWeightExpectation,
  type IOrganisationalWeightingValidationResult,
  validateOrganisationalWeighting
} from './OrganisationalWeightingPolicy';

const expectedMembers: IOrganisationalWeightExpectation[] = [
  { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-01', childKey: 'SO1-001', active: true },
  { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-01', childKey: 'SO1-002', active: true },
  { weightLevel: 'KPIWithinWorkstream', parentKey: 'WS-02', childKey: 'SO1-016', active: true },
  { weightLevel: 'WorkstreamWithinPillar', parentKey: 'P-01', childKey: 'WS-01', active: true },
  { weightLevel: 'WorkstreamWithinPillar', parentKey: 'P-01', childKey: 'WS-02', active: true }
];

const record = (
  weightLevel: IOrganisationalWeightRecord['weightLevel'],
  parentKey: string,
  childKey: string,
  weightPercent: number | undefined,
  patch: Partial<IOrganisationalWeightRecord> = {}
): IOrganisationalWeightRecord => ({
  organisationalWeightKey: organisationalWeightRecordKey({
    performanceYear: patch.performanceYear ?? 2026,
    weightLevel,
    parentKey,
    childKey,
    version: patch.version ?? 'org-weight-v01'
  }),
  weightGroupKey: organisationalWeightGroupKey({
    performanceYear: patch.performanceYear ?? 2026,
    weightLevel,
    parentKey,
    version: patch.version ?? 'org-weight-v01'
  }),
  performanceYear: 2026,
  weightLevel,
  parentKey,
  childKey,
  weightPercent,
  active: true,
  approvalStatus: 'Approved',
  effectiveFrom: '2026-04-01',
  version: 'org-weight-v01',
  approvalReference: 'CONTROL-ORG-WEIGHT-TEST',
  source: 'CONTROL test fixture',
  historicSnapshotLocked: false,
  ...patch
});

const validRequiredRecords = (): IOrganisationalWeightRecord[] => [
  record('KPIWithinWorkstream', 'WS-01', 'SO1-001', 60),
  record('KPIWithinWorkstream', 'WS-01', 'SO1-002', 40),
  record('KPIWithinWorkstream', 'WS-02', 'SO1-016', 100),
  record('WorkstreamWithinPillar', 'P-01', 'WS-01', 50),
  record('WorkstreamWithinPillar', 'P-01', 'WS-02', 50)
];

const validate = (
  records: readonly IOrganisationalWeightRecord[],
  members: readonly IOrganisationalWeightExpectation[] = expectedMembers
): IOrganisationalWeightingValidationResult => validateOrganisationalWeighting({
  performanceYear: 2026,
  version: 'org-weight-v01',
  asOfDate: '2026-08-22',
  expectedMembers: members,
  records
});

describe('OrganisationalWeightingPolicy canonical active-group validation', () => {
  it('keeps genuinely absent weights NOT READY and never supplies equal weights', () => {
    const result = validate([]);

    expect(result).toMatchObject({ valid: false, publicationReady: false, configurationState: 'NOT READY' });
    expect(result.workstreamKpiTotals).toEqual([
      expect.objectContaining({
        groupKey: 'WS-01', total: 0, memberCount: 2, missingMemberKeys: ['SO1-001', 'SO1-002'],
        invalidMemberKeys: [], complete: false, exactTotal: false, ready: false
      }),
      expect.objectContaining({
        groupKey: 'WS-02', total: 0, memberCount: 1, missingMemberKeys: ['SO1-016'],
        invalidMemberKeys: [], complete: false, exactTotal: false, ready: false
      })
    ]);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/SO1-001 has no active weight/),
      expect.stringMatching(/WS-01 has no active weight/)
    ]));
  });

  it('accepts only approved versioned exact 100% totals at both required levels', () => {
    const result = validate(validRequiredRecords());

    expect(result).toMatchObject({ valid: true, publicationReady: true, configurationState: 'READY' });
    expect(result.workstreamKpiTotals.map(group => group.total)).toEqual([100, 100]);
    expect(result.pillarWorkstreamTotals).toEqual([
      expect.objectContaining({ groupKey: 'P-01', total: 100, memberCount: 2, ready: true })
    ]);
    expect(result.boardPillarTotals).toEqual([]);
  });

  it('validates optional Pillar-within-Board groups only when active membership exists', () => {
    const members = expectedMembers.concat([
      { weightLevel: 'PillarWithinBoard', parentKey: 'BOARD', childKey: 'P-01', active: true },
      { weightLevel: 'PillarWithinBoard', parentKey: 'BOARD', childKey: 'P-02', active: true }
    ] as IOrganisationalWeightExpectation[]);
    const complete = validRequiredRecords().concat([
      record('PillarWithinBoard', 'BOARD', 'P-01', 55),
      record('PillarWithinBoard', 'BOARD', 'P-02', 45)
    ]);

    expect(validate(complete, members).boardPillarTotals).toEqual([
      expect.objectContaining({ groupKey: 'BOARD', total: 100, ready: true })
    ]);
    expect(validate(complete.slice(0, -1), members)).toMatchObject({
      publicationReady: false,
      configurationState: 'NOT READY'
    });
  });

  it('makes missing, invalid, duplicate, non-100 or unapproved active records NOT READY', () => {
    const missingWeight = validRequiredRecords();
    missingWeight[0] = { ...missingWeight[0], weightPercent: undefined };
    expect(validate(missingWeight).workstreamKpiTotals[0]).toEqual(expect.objectContaining({
      total: 40,
      invalidMemberKeys: ['SO1-001'],
      complete: false,
      ready: false
    }));

    const wrongTotal = validRequiredRecords();
    wrongTotal[0] = { ...wrongTotal[0], weightPercent: 59 };
    expect(validate(wrongTotal).errors).toContain(
      'KPIWithinWorkstream group WS-01 active weights total 99%, not 100%.'
    );

    const draft = validRequiredRecords();
    draft[0] = { ...draft[0], approvalStatus: 'Draft', approvalReference: '' };
    expect(validate(draft).errors).toEqual(expect.arrayContaining([expect.stringMatching(/not CONTROL-approved/)]));

    const duplicate = validRequiredRecords().concat([validRequiredRecords()[0]]);
    expect(validate(duplicate).errors).toEqual(expect.arrayContaining([expect.stringMatching(/is duplicated/)]));

    const excessivePrecision = validRequiredRecords();
    excessivePrecision[0] = { ...excessivePrecision[0], weightPercent: 59.999 };
    expect(validate(excessivePrecision).publicationReady).toBe(false);
  });

  it('isolates Performance Year/version and rejects unexpected active hierarchy records', () => {
    const historic: IOrganisationalWeightRecord[] = validRequiredRecords().map(item => ({
      ...item,
      performanceYear: 2025,
      version: 'org-weight-v00',
      organisationalWeightKey: organisationalWeightRecordKey({
        performanceYear: 2025,
        weightLevel: item.weightLevel,
        parentKey: item.parentKey,
        childKey: item.childKey,
        version: 'org-weight-v00'
      }),
      weightGroupKey: organisationalWeightGroupKey({
        performanceYear: 2025,
        weightLevel: item.weightLevel,
        parentKey: item.parentKey,
        version: 'org-weight-v00'
      }),
      weightPercent: 1
    }));
    const result = validate(historic.concat(validRequiredRecords()));
    expect(result.publicationReady).toBe(true);

    const unexpected = validRequiredRecords().concat([
      record('KPIWithinWorkstream', 'WS-01', 'RETIRED-KPI', 0)
    ]);
    expect(validate(unexpected).errors).toEqual(expect.arrayContaining([expect.stringMatching(/not an active hierarchy member/)]));
  });

  it('fails closed when approved versions overlap for the same active member', () => {
    const overlapping = validRequiredRecords().concat(validRequiredRecords().map(item => record(
      item.weightLevel,
      item.parentKey,
      item.childKey,
      item.weightPercent,
      { version: 'org-weight-v02', effectiveFrom: '2026-04-01' }
    )));
    const result = validate(overlapping);

    expect(result.publicationReady).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/overlapping active approved versions org-weight-v01 and org-weight-v02/)
    ]));
  });

  it('fails closed when the chosen approved version is future-dated or expired on the explicit as-of date', () => {
    const future = validRequiredRecords();
    future[0] = { ...future[0], effectiveFrom: '2026-08-23' };
    const futureResult = validate(future);
    expect(futureResult.publicationReady).toBe(false);
    expect(futureResult.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/SO1-001 is not effective on 2026-08-22/)
    ]));

    const expired = validRequiredRecords();
    expired[0] = { ...expired[0], effectiveTo: '2026-08-21' };
    const expiredResult = validate(expired);
    expect(expiredResult.publicationReady).toBe(false);
    expect(expiredResult.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/SO1-001 is not effective on 2026-08-22/)
    ]));
  });

  it('treats effective-date boundaries as inclusive calendar dates and rejects an invalid as-of date', () => {
    const boundary = validRequiredRecords().map(item => ({
      ...item,
      effectiveFrom: '2026-08-22T00:00:00.000Z',
      effectiveTo: '2026-08-22T00:00:00.000Z'
    }));
    expect(validate(boundary).publicationReady).toBe(true);

    const invalid = validateOrganisationalWeighting({
      performanceYear: 2026,
      version: 'org-weight-v01',
      asOfDate: 'not-a-date',
      expectedMembers,
      records: validRequiredRecords()
    });
    expect(invalid).toMatchObject({ publicationReady: false, configurationState: 'NOT READY' });
    expect(invalid.errors).toContain('A valid as-of date is required for organisational weighting.');
  });

  it('requires explicit active membership at both mandatory weighting levels', () => {
    expect(validate([], [])).toMatchObject({ publicationReady: false, configurationState: 'NOT READY' });
    expect(validate([], []).errors).toEqual(expect.arrayContaining([
      'No active KPI-within-Workstream weighting membership is configured.',
      'No active Workstream-within-Pillar weighting membership is configured.'
    ]));
  });

  it('enforces the locked-snapshot policy only when publication validation requests it', () => {
    const result = validateOrganisationalWeighting({
      performanceYear: 2026,
      version: 'org-weight-v01',
      asOfDate: '2026-08-22',
      expectedMembers,
      records: validRequiredRecords(),
      requireLockedPublishedSnapshot: true
    });
    expect(result.publicationReady).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/not locked into the published historic snapshot/)]));
  });
});
