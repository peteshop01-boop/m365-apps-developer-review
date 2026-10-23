import {
  SEC006_RPT005_CONTRACT,
  assertNoRawCoverageFields,
  createSec006BusinessAdminExceptionProjection,
  createSec006CoverageSummaryProjection,
  createSec006ManagerDetailProjection,
  createSec006SystemRecoveryProjection,
  type ISec006ProjectionAuthority,
  type ISec006RawCoverageRow
} from './Sec006CoverageProjections';

const people = Array.from({ length: 12 }, (_, index) => `P${index + 1}`);
const raw = (personKey: string, patch: Partial<ISec006RawCoverageRow> = {}): ISec006RawCoverageRow => ({
  contributionCaseKey: `CASE-${personKey}`, personKey, personDisplayName: `Person ${personKey}`,
  managerPersonKey: Number(personKey.slice(1)) <= 6 ? 'M1' : 'M2',
  teamKey: Number(personKey.slice(1)) <= 6 ? 'TEAM-A' : 'TEAM-B',
  workplanKey: `WP|${personKey}|2027`, workplanItemKey: `WPI|${personKey}|SO1-001`,
  performanceYear: 2027, kpiId: 'SO1-001', kpiWording: 'Real strategic KPI wording',
  pillar: 'Strategic Objective 1', workstream: 'Schools', reportingMemberships: ['CORE_CWOP'],
  contributionMethod: 'AdditiveDirect', employeeKpiRole: 'Contributor', approvalState: 'Approved',
  directContributionEligible: true, additiveApproved: true, nonOverlapRequired: true,
  nonOverlapApproved: true, unitLabel: 'schools', annualContributionTarget: 10,
  q1ContributionTarget: 2, q2ContributionTarget: 3, q3ContributionTarget: 2, q4ContributionTarget: 3,
  employeeActual: 999, sourceVersion: 'RPT-005-SOURCE-v1', technicalCorrelationKey: `TECH-${personKey}`,
  recoveryHold: false, ...patch
});

const authority = (patch: Partial<ISec006ProjectionAuthority> = {}): ISec006ProjectionAuthority => ({
  role: 'Employee', actorPersonKey: 'P1', currentReportPersonKeys: [], activeDelegatedPersonKeys: [],
  exactRecoveryCaseKeys: [], allowedYears: [2027], allowedKpiIds: ['SO1-001', 'SO1-002'],
  organisationCohort: people.map(personKey => ({
    personKey, performanceYear: 2027,
    teamKey: Number(personKey.slice(1)) <= 6 ? 'TEAM-A' : 'TEAM-B',
    managerPersonKey: Number(personKey.slice(1)) <= 6 ? 'M1' : 'M2',
    kpiIds: ['SO1-001', 'SO1-002'], pillars: ['Strategic Objective 1'],
    workstreams: ['Schools'], reportingMemberships: ['CORE_CWOP']
  })),
  sourceVersion: 'RPT-005-SOURCE-v1', scopeVersion: 'SCOPE-v1', trustedUtc: '2026-11-01T12:00:00Z',
  auditCorrelationKey: 'AUDIT-PROJECTION-001', ...patch
});

const filter = { performanceYear: 2027 };

describe('KCF-KPI-027B SEC-006 RPT-005 audience projections', () => {
  it('publishes only the governed aggregate contract and keeps Official Actual independent', () => {
    const projection = createSec006CoverageSummaryProjection(
      people.slice(0, 6).map(personKey => raw(personKey)),
      [{ kpiId: 'SO1-001', performanceYear: 2027, value: 42, status: 'Authoritative', independentSourceReference: 'ORG-ACTUAL-001' }],
      filter,
      authority()
    );
    expect(projection.contractVersion).toBe(SEC006_RPT005_CONTRACT);
    expect(projection.projection).toBe('CoverageSummaryProjection');
    expect(projection.querySuppressionState).toBe('VISIBLE');
    expect(projection.rows[0]).toEqual(expect.objectContaining({
      suppressionState: 'VISIBLE', selectedCohortCount: 6, complementCohortCount: 6,
      approvedContributions: 60, officialActualValue: 42, officialActualSourceIndependent: true
    }));
    expect(JSON.stringify(projection)).not.toContain('999');
    expect(assertNoRawCoverageFields(projection)).toEqual([]);
  });

  it('suppresses both counts and measures when selected cohort is below k=5', () => {
    const projection = createSec006CoverageSummaryProjection(
      people.slice(0, 4).map(personKey => raw(personKey)), [], filter, authority()
    );
    expect(projection.rows).toEqual([]);
    expect(projection.querySuppressionState).toBe('SUPPRESSED_SMALL_COHORT');
  });

  it('suppresses when the complement cohort is below k=5', () => {
    const projection = createSec006CoverageSummaryProjection(
      people.slice(0, 8).map(personKey => raw(personKey)), [], filter,
      authority({ organisationCohort: people.slice(0, 10).map(personKey => ({
        personKey, performanceYear: 2027, teamKey: 'TEAM-A', managerPersonKey: 'M1',
        kpiIds: ['SO1-001', 'SO1-002'], pillars: ['Strategic Objective 1'],
        workstreams: ['Schools'], reportingMemberships: ['CORE_CWOP']
      })) })
    );
    expect(projection.rows).toEqual([]);
  });

  it('reapplies selected and complement suppression after a Team filter', () => {
    const rows = people.slice(0, 10).map(personKey => raw(personKey));
    const projection = createSec006CoverageSummaryProjection(rows, [], {
      performanceYear: 2027, teamKey: 'TEAM-A'
    }, authority());
    expect(projection.rows).toEqual([]);
  });

  it('rejects year and KPI filter tampering outside server authority', () => {
    expect(() => createSec006CoverageSummaryProjection([], [], { performanceYear: 2026 }, authority()))
      .toThrow('FILTER_YEAR_OUTSIDE_AUTHORISED_SCOPE');
    expect(() => createSec006CoverageSummaryProjection([], [], { performanceYear: 2027, kpiId: 'FORGED' }, authority()))
      .toThrow('FILTER_KPI_OUTSIDE_AUTHORISED_SCOPE');
  });

  it('returns a stable suppression marker rather than an inferable empty zero after a valid filter', () => {
    const projection = createSec006CoverageSummaryProjection(
      people.slice(0, 6).map(personKey => raw(personKey)), [],
      { performanceYear: 2027, kpiId: 'SO1-002' }, authority()
    );
    expect(projection.rows).toEqual([]);
    expect(projection.querySuppressionState).toBe('SUPPRESSED_SMALL_COHORT');
  });

  it('limits Manager named detail to current reports and exact active delegations', () => {
    const projection = createSec006ManagerDetailProjection(
      [raw('P1'), raw('P2'), raw('P3')], filter,
      authority({ role: 'Manager', actorPersonKey: 'M1', currentReportPersonKeys: ['P1'], activeDelegatedPersonKeys: ['P2'] })
    );
    expect(projection.rows.map(row => row.personKey)).toEqual(['P1', 'P2']);
    expect(projection.rows.map(row => row.scopeBasis)).toEqual(['CurrentReport', 'ActiveDelegation']);
    expect(JSON.stringify(projection)).not.toContain('employeeActual');
    expect(assertNoRawCoverageFields(projection)).toEqual([]);
  });

  it('denies Manager named projection to other human roles', () => {
    expect(() => createSec006ManagerDetailProjection([raw('P1')], filter, authority({ role: 'BusinessAdmin' })))
      .toThrow('MANAGER_PROJECTION_AUTHORITY_REQUIRED');
  });

  it('gives Business Admin pseudonymous exceptions without named identity', () => {
    const exceptionRows = people.slice(0, 6).map(personKey => raw(personKey, {
      exceptionType: 'UNIT_MISMATCH', exceptionOpenedAtUtc: '2026-10-20T12:00:00Z'
    }));
    const projection = createSec006BusinessAdminExceptionProjection(
      exceptionRows, filter, authority({ role: 'BusinessAdmin', actorPersonKey: 'BA1' })
    );
    expect(projection.rows[0]).toEqual(expect.objectContaining({
      exceptionCaseKey: expect.stringMatching(/^EXC\|[0-9a-f]{24}$/), exceptionType: 'UNIT_MISMATCH',
      cohortCount: 6, ageBand: '8-30 days', suppressionState: 'VISIBLE'
    }));
    expect(JSON.stringify(projection)).not.toMatch(/Person P1|WP\|P1|WPI\|P1|CASE-P1/);
    expect(assertNoRawCoverageFields(projection)).toEqual([]);
  });

  it('suppresses Business Admin exception cohorts and their count after filters', () => {
    const projection = createSec006BusinessAdminExceptionProjection(
      people.slice(0, 4).map(personKey => raw(personKey, { exceptionType: 'UNRESOLVED_METHOD' })),
      filter, authority({ role: 'BusinessAdmin', actorPersonKey: 'BA1' })
    );
    expect(projection.rows).toEqual([]);
  });

  it('gives System Admin technical recovery metadata only', () => {
    const projection = createSec006SystemRecoveryProjection(
      [raw('P1', { recoveryHold: true }), raw('P2')], filter,
      authority({ role: 'SystemAdmin', actorPersonKey: 'SA1', exactRecoveryCaseKeys: ['CASE-P1'] })
    );
    expect(projection.rows).toEqual([
      { technicalCorrelationKey: 'TECH-P1', performanceYear: 2027, sourceVersion: 'RPT-005-SOURCE-v1', recoveryHold: true, exactControlCaseGranted: true },
      { technicalCorrelationKey: 'TECH-P2', performanceYear: 2027, sourceVersion: 'RPT-005-SOURCE-v1', recoveryHold: false, exactControlCaseGranted: false }
    ]);
    expect(JSON.stringify(projection)).not.toMatch(/Person P1|WP\|P1|employeeActual/);
    expect(assertNoRawCoverageFields(projection)).toEqual([]);
  });

  it('does not let raw coverage rows enter an Employee summary response', () => {
    const projection = createSec006CoverageSummaryProjection(
      people.slice(0, 6).map(personKey => raw(personKey)), [], filter, authority()
    );
    const payload = JSON.stringify(projection);
    ['personKey', 'personDisplayName', 'managerPersonKey', 'teamKey', 'workplanKey',
      'workplanItemKey', 'contributionCaseKey', 'employeeActual', 'technicalCorrelationKey']
      .forEach(field => expect(payload).not.toContain(`"${field}"`));
  });
});
