import {
  STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION,
  STRATEGIC_CORE_COVERAGE_SOURCE_SHA,
  buildStrategicCoreCoverageUatSource,
  calculateStrategicCoreCoverageFeed,
  reconcileStrategicCoreCoverageUat
} from './StrategicCoreCoverageFeed';

describe('KCF-KPI-025 Strategic Core coverage feed adapter', () => {
  const source = buildStrategicCoreCoverageUatSource();

  it('pins the accepted RPT-005 contract and reporting source', () => {
    const feed = calculateStrategicCoreCoverageFeed(source);
    expect(feed.contractVersion).toBe('KCF-KPI-RPT-005-COVERAGE-001');
    expect(feed.sourceSha).toBe('e64961727b7c800189eb0633fdb5ffb7786edc53');
    expect(STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION).toBe(feed.contractVersion);
    expect(STRATEGIC_CORE_COVERAGE_SOURCE_SHA).toBe(feed.sourceSha);
  });

  it('reconciles the 200-schools, exact and over-allocation scenarios without mismatch', () => {
    const feed = calculateStrategicCoreCoverageFeed(source);
    expect(reconcileStrategicCoreCoverageUat(feed)).toEqual([]);
    const school = feed.summary.filter(row => row.kpiId === 'SC-SCHOOLS-200')[0];
    expect(school.annual).toMatchObject({
      organisationTarget: 200,
      approvedContribution: 70,
      pendingContribution: 20,
      coveragePercent: 35,
      gap: 130,
      surplus: 0,
      state: 'UNDER_ALLOCATED'
    });
    expect(school.q1.approvedContribution).toBe(18);
    expect(school.q2.approvedContribution).toBe(18);
    expect(school.q3.approvedContribution).toBe(16);
    expect(school.q4.approvedContribution).toBe(18);
  });

  it('keeps Oversight and Accountable Owner visible but sums only eligible direct delivery', () => {
    const feed = calculateStrategicCoreCoverageFeed(source, { kpiId: 'SC-SCHOOLS-200' });
    const school = feed.summary[0];
    expect(school.peopleSelectingKpi).toBe(7);
    expect(school.directContributors).toBe(3);
    expect(school.oversightPeople).toBe(1);
    expect(school.accountableOwners).toBe(2);
    expect(feed.detail.filter(row => row.role === 'Oversight')[0]).toMatchObject({
      includedInNumericalCoverage: 'NO',
      contributionMethod: 'CompletionOversight'
    });
    expect(feed.detail.filter(row => row.role === 'AccountableOwner' && row.contributionMethod === 'Additive')[0]
      .includedInNumericalCoverage).toBe('YES');
  });

  it('separates pending contributions and excludes unit mismatch, shared, weighted and unresolved methods', () => {
    const feed = calculateStrategicCoreCoverageFeed(source);
    expect(feed.pendingContributions.map(row => row.contributionKey)).toEqual(['COV-003']);
    expect(feed.unitMismatches.map(row => row.contributionKey)).toEqual(['COV-010']);
    expect(feed.unresolvedContributionMethods.map(row => row.contributionKey)).toEqual(['COV-013']);
    expect(feed.summary.filter(row => row.kpiId === 'SC-SHARED-80')[0].annual.state).toBe('NOT_APPLICABLE');
    expect(feed.summary.filter(row => row.kpiId === 'SC-PERCENT-75')[0].annual.state).toBe('NOT_APPLICABLE');
  });

  it('never includes Personal or Behaviour records and never derives official Actual', () => {
    const feed = calculateStrategicCoreCoverageFeed(source);
    expect(feed.detail.filter(row => ['COV-020', 'COV-021'].indexOf(row.contributionKey) >= 0
      && row.includedInNumericalCoverage === 'YES')).toHaveLength(0);
    expect(feed.officialActualSeparation).toEqual({
      planningCoverageSource: 'approved Workplan targets',
      officialActualSource: 'authoritative organisation-level KPI data source',
      employeeActualsSummed: false,
      productionActualWritesPerformed: false
    });
    const school = feed.summary.filter(row => row.kpiId === 'SC-SCHOOLS-200')[0];
    expect(school).toMatchObject({
      officialActualValue: 72,
      officialActualUnit: 'schools',
      officialActualSourceKey: 'ORG-ACTUAL|SC-SCHOOLS-200|2027|Q1',
      officialActualSourceStatus: 'Authoritative',
      employeeDeliveryInformationAvailable: true,
      officialActualDerivedFromEmployeeActuals: false
    });
  });

  it('uses planning states rather than performance RAG and treats over-allocation as a surplus', () => {
    const feed = calculateStrategicCoreCoverageFeed(source);
    const over = feed.summary.filter(row => row.kpiId === 'SC-OVER-50')[0];
    expect(over.annual).toMatchObject({ state: 'OVER_ALLOCATED', coveragePercent: 120, gap: 0, surplus: 10 });
    expect(feed.summary.map(row => row.annual.state)).toEqual(expect.arrayContaining([
      'NOT_READY', 'UNDER_ALLOCATED', 'COVERED', 'OVER_ALLOCATED', 'NOT_APPLICABLE'
    ]));
    expect(JSON.stringify(feed.summary)).not.toMatch(/Green|Amber|Red/);
  });

  it('applies year, pillar, workstream, KPI and reporting-membership filters before summary output', () => {
    expect(calculateStrategicCoreCoverageFeed(source, { pillar: 'Participation' }).summary.map(row => row.kpiId))
      .toEqual(['SC-SCHOOLS-200']);
    expect(calculateStrategicCoreCoverageFeed(source, { workstream: 'Schools' }).summary.map(row => row.kpiId))
      .toEqual(['SC-SCHOOLS-200']);
    expect(calculateStrategicCoreCoverageFeed(source, { kpiId: 'SC-EXACT-100' }).summary.map(row => row.kpiId))
      .toEqual(['SC-EXACT-100']);
    expect(calculateStrategicCoreCoverageFeed(source, { reportingMembership: 'WOMEN_GIRLS_CWOP' }).summary.map(row => row.kpiId))
      .toEqual(['SC-OVER-50']);
    expect(calculateStrategicCoreCoverageFeed(source, { performanceYear: 2026 }).summary).toEqual([]);
  });

  it('recalculates scoped feed totals for Team and Manager filters outside React', () => {
    const north = calculateStrategicCoreCoverageFeed(source, { kpiId: 'SC-SCHOOLS-200', teamKey: 'TEAM-NORTH' });
    expect(north.summary[0].annual).toMatchObject({ approvedContribution: 55, pendingContribution: 20 });
    expect(north.detail.map(row => row.teamKey).filter((item, index, all) => all.indexOf(item) === index))
      .toEqual(['TEAM-NORTH']);
    const south = calculateStrategicCoreCoverageFeed(source, { kpiId: 'SC-SCHOOLS-200', managerKey: 'M-02' });
    expect(south.summary[0].annual.approvedContribution).toBe(15);
  });

  it('fails zero and missing organisation targets closed as NOT READY', () => {
    const feed = calculateStrategicCoreCoverageFeed(source);
    expect(feed.summary.filter(row => row.kpiId === 'SC-ZERO')[0].annual.state).toBe('NOT_READY');
    expect(feed.summary.filter(row => row.kpiId === 'SC-MISSING-TARGET')[0].annual.state).toBe('NOT_READY');
  });

  it('fails exact and conflicting duplicate contribution grains closed without double counting', () => {
    const original = source.contributions.filter(row => row.contributionKey === 'COV-001')[0];
    const exactDuplicate = { ...original, contributionTargets: { ...original.contributionTargets } };
    const duplicated = { ...source, contributions: source.contributions.concat([exactDuplicate]) };
    const feed = calculateStrategicCoreCoverageFeed(duplicated, { kpiId: 'SC-SCHOOLS-200' });
    const school = feed.summary[0];
    expect(school.annual).toMatchObject({
      approvedContribution: 40,
      pendingContribution: 20,
      coveragePercent: null,
      gap: null,
      state: 'NOT_READY'
    });
    const duplicateRows = feed.detail.filter(row => row.contributionKey === 'COV-001');
    expect(duplicateRows).toHaveLength(2);
    duplicateRows.forEach(row => {
      expect(row.includedInNumericalCoverage).toBe('NO');
      expect(row.exclusionReasons).toContain('DUPLICATE_CONTRIBUTION_KEY');
    });
    expect(feed.issues.filter(issue => issue.code === 'DUPLICATE_CONTRIBUTION_KEY')).toHaveLength(2);

    const conflicting = { ...source, contributions: source.contributions.concat([{
      ...exactDuplicate,
      personKey: 'P-CONFLICT',
      personDisplayName: 'Synthetic conflicting row',
      contributionTargets: { annual: 99, q1: 24, q2: 25, q3: 25, q4: 25 },
      auditUpdatedAt: '2026-10-31T12:01:00Z'
    }]) };
    expect(calculateStrategicCoreCoverageFeed(conflicting, { kpiId: 'SC-SCHOOLS-200' }).summary[0].annual.state)
      .toBe('NOT_READY');
  });

  it('handles pending duplicates, superseded versions and cross-year logical keys deterministically', () => {
    const pending = source.contributions.filter(row => row.contributionKey === 'COV-003')[0];
    const pendingDuplicate = { ...pending, contributionTargets: { ...pending.contributionTargets } };
    const pendingFeed = calculateStrategicCoreCoverageFeed({
      ...source,
      contributions: source.contributions.concat([pendingDuplicate])
    }, { kpiId: 'SC-SCHOOLS-200' });
    expect(pendingFeed.summary[0].annual).toMatchObject({
      approvedContribution: 70,
      pendingContribution: 0,
      coveragePercent: null,
      state: 'NOT_READY'
    });
    expect(pendingFeed.detail.filter(row => row.contributionKey === 'COV-003'
      && row.exclusionReasons.indexOf('DUPLICATE_CONTRIBUTION_KEY') >= 0)).toHaveLength(2);

    const original = source.contributions.filter(row => row.contributionKey === 'COV-001')[0];
    const versionedRows = source.contributions.filter(row => row !== original).concat([
      { ...original, managerApprovalStatus: 'Superseded' as const, workplanStatus: 'Archived' as const,
        effectiveTo: '2026-10-31', approvalTimestamp: '', version: 1, auditUpdatedAt: '2026-10-31T11:00:00Z' },
      { ...original, version: 2, sourceReference: 'SYNTHETIC|COV-001|v2', auditUpdatedAt: '2026-10-31T12:30:00Z' }
    ]);
    const versionedFeed = calculateStrategicCoreCoverageFeed({ ...source, contributions: versionedRows }, { kpiId: 'SC-SCHOOLS-200' });
    expect(versionedFeed.summary[0].annual).toMatchObject({ approvedContribution: 70, coveragePercent: 35 });
    expect(versionedFeed.detail.filter(row => row.contributionKey === 'COV-001'
      && row.exclusionReasons.indexOf('DUPLICATE_CONTRIBUTION_KEY') >= 0)).toHaveLength(0);

    const crossYear = { ...original, performanceYear: 2026, version: 2, sourceReference: 'SYNTHETIC|COV-001|2026|v2' };
    const crossYearFeed = calculateStrategicCoreCoverageFeed({
      ...source,
      contributions: source.contributions.concat([crossYear])
    }, { kpiId: 'SC-SCHOOLS-200' });
    expect(crossYearFeed.summary[0].annual.approvedContribution).toBe(70);
    expect(crossYearFeed.detail.filter(row => row.exclusionReasons.indexOf('DUPLICATE_CONTRIBUTION_KEY') >= 0))
      .toHaveLength(0);
  });

  it('marks approval-state conflicts as duplicates and is independent of input order', () => {
    const original = source.contributions.filter(row => row.contributionKey === 'COV-001')[0];
    const conflict = {
      ...original,
      workplanStatus: 'Submitted' as const,
      managerApprovalStatus: 'Pending' as const,
      approvalTimestamp: '',
      auditUpdatedAt: '2026-10-31T12:10:00Z'
    };
    const forwardSource = { ...source, contributions: source.contributions.concat([conflict]) };
    const reverseSource = { ...source, contributions: forwardSource.contributions.slice().reverse() };
    const forward = calculateStrategicCoreCoverageFeed(forwardSource, { kpiId: 'SC-SCHOOLS-200' });
    const reverse = calculateStrategicCoreCoverageFeed(reverseSource, { kpiId: 'SC-SCHOOLS-200' });
    expect(forward.summary).toEqual(reverse.summary);
    expect(forward.detail).toEqual(reverse.detail);
    expect(forward.summary[0].annual.state).toBe('NOT_READY');
    expect(forward.detail.filter(row => row.contributionKey === 'COV-001'
      && row.exclusionReasons.indexOf('DUPLICATE_CONTRIBUTION_KEY') >= 0)).toHaveLength(2);
  });

  it('does not let a KPI or people filter hide a duplicate key reused on a different KPI', () => {
    const original = source.contributions.filter(row => row.contributionKey === 'COV-001')[0];
    const reused = {
      ...original,
      kpiId: 'SC-EXACT-100',
      personKey: 'P-REUSED',
      personDisplayName: 'Synthetic cross-KPI conflict',
      workplanKey: 'WP|2027|P-REUSED',
      unit: 'sessions',
      contributionTargets: { annual: 10, q1: 2, q2: 3, q3: 2, q4: 3 },
      sourceReference: 'SYNTHETIC|COV-001|CROSS-KPI',
      auditUpdatedAt: '2026-10-31T13:00:00Z'
    };
    const conflicted = { ...source, contributions: source.contributions.concat([reused]) };
    const schools = calculateStrategicCoreCoverageFeed(conflicted, {
      kpiId: 'SC-SCHOOLS-200',
      teamKey: 'TEAM-NORTH'
    });
    const exact = calculateStrategicCoreCoverageFeed(conflicted, { kpiId: 'SC-EXACT-100' });
    expect(schools.summary[0].annual.state).toBe('NOT_READY');
    expect(schools.detail.filter(row => row.contributionKey === 'COV-001')[0].exclusionReasons)
      .toContain('DUPLICATE_CONTRIBUTION_KEY');
    expect(exact.summary[0].annual.state).toBe('NOT_READY');
    expect(exact.detail.filter(row => row.contributionKey === 'COV-001')[0].exclusionReasons)
      .toContain('DUPLICATE_CONTRIBUTION_KEY');
  });

  it('preserves exact signed provenance and fails missing provenance or a contract mismatch closed', () => {
    const feed = calculateStrategicCoreCoverageFeed(source, { kpiId: 'SC-SCHOOLS-200' });
    const row = feed.detail.filter(detail => detail.contributionKey === 'COV-001')[0];
    expect(row).toMatchObject({
      workplanKey: 'WP|2027|P-A',
      performanceYear: 2027,
      effectiveFrom: '2026-11-01',
      effectiveTo: '2027-10-31',
      approvalTimestamp: '2026-10-31T12:00:00Z',
      version: 1,
      sourceReference: 'SYNTHETIC|COV-001|v1',
      auditCreatedAt: '2026-10-01T09:00:00Z',
      auditCreatedBy: 'synthetic.coverage.fixture@example.invalid',
      auditUpdatedAt: '2026-10-31T12:00:00Z',
      auditUpdatedBy: 'synthetic.coverage.fixture@example.invalid',
      officialActualAggregationPermitted: false
    });
    const broken = { ...source, contributions: source.contributions.map(contribution => (
      contribution.contributionKey === 'COV-001' ? { ...contribution, sourceReference: '' } : contribution
    )) };
    const brokenFeed = calculateStrategicCoreCoverageFeed(broken, { kpiId: 'SC-SCHOOLS-200' });
    expect(brokenFeed.summary[0].annual.state).toBe('NOT_READY');
    expect(brokenFeed.detail.filter(detail => detail.contributionKey === 'COV-001')[0].exclusionReasons)
      .toContain('PROVENANCE_INCOMPLETE');

    const mismatch = calculateStrategicCoreCoverageFeed({
      ...source,
      contractVersion: 'WRONG-CONTRACT' as typeof source.contractVersion
    }, { kpiId: 'SC-SCHOOLS-200' });
    expect(mismatch.contractValid).toBe(false);
    expect(mismatch.summary[0].annual.state).toBe('NOT_READY');
    expect(mismatch.issues.map(issue => issue.code)).toContain('CONTRACT_VERSION_MISMATCH');
  });

  it('keeps Future EDI unconfigured with zero mappings until an explicit approved definition exists', () => {
    const future = calculateStrategicCoreCoverageFeed(source, { reportingMembership: 'EDI_CWOP' });
    expect(future.summary).toEqual([]);
    expect(future.detail).toEqual([]);
    expect(future.reportingMembershipState).toMatchObject({ state: 'FUTURE_UNCONFIGURED' });
    expect(source.kpis.some(kpi => kpi.reportingMembership.indexOf('EDI_CWOP') >= 0)).toBe(false);

    const activated = {
      ...source,
      membershipDefinitions: source.membershipDefinitions.map(definition => definition.code === 'EDI_CWOP'
        ? { ...definition, lifecycle: 'Current' as const, configured: true, approvalStatus: 'Approved' as const,
          effectiveFrom: '2026-11-01', effectiveTo: '2027-10-31' }
        : definition),
      kpis: source.kpis.map(kpi => kpi.kpiId === 'SC-EXACT-100'
        ? { ...kpi, reportingMembership: kpi.reportingMembership.concat(['EDI_CWOP' as const]) }
        : kpi)
    };
    const active = calculateStrategicCoreCoverageFeed(activated, { reportingMembership: 'EDI_CWOP' });
    expect(active.reportingMembershipState.state).toBe('ACTIVE');
    expect(active.summary.map(row => row.kpiId)).toEqual(['SC-EXACT-100']);
  });
});
