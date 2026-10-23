import { sec006Sha256 } from './Sec006AutomationProcessor';

export const SEC006_RPT005_CONTRACT = 'KCF-KPI-RPT-005-COVERAGE-001' as const;
export const SEC006_SUPPRESSION_VERSION = 'SEC-006-K5-COMPLEMENT-2' as const;
export const SEC006_MINIMUM_COHORT = 5;

export type Sec006ProjectionRole = 'Employee' | 'Manager' | 'DelegatedManager' | 'BusinessAdmin' | 'SystemAdmin';

interface ISec006ProjectionMetadata {
  contractVersion: typeof SEC006_RPT005_CONTRACT;
  sourceVersion: string;
  generatedAtUtc: string;
  scopeVersion: string;
  suppressionRuleVersion: typeof SEC006_SUPPRESSION_VERSION;
  auditCorrelationKey: string;
}

export interface ISec006RawCoverageRow {
  contributionCaseKey: string;
  personKey: string;
  personDisplayName: string;
  managerPersonKey: string;
  teamKey: string;
  workplanKey: string;
  workplanItemKey: string;
  performanceYear: number;
  kpiId: string;
  kpiWording: string;
  pillar: string;
  workstream: string;
  reportingMemberships: readonly string[];
  contributionMethod: string;
  employeeKpiRole: string;
  approvalState: string;
  directContributionEligible: boolean;
  additiveApproved: boolean;
  nonOverlapRequired: boolean;
  nonOverlapApproved: boolean;
  unitLabel: string;
  annualContributionTarget?: number;
  q1ContributionTarget?: number;
  q2ContributionTarget?: number;
  q3ContributionTarget?: number;
  q4ContributionTarget?: number;
  employeeActual?: number | string;
  exclusionCode?: string;
  exceptionType?: string;
  exceptionOpenedAtUtc?: string;
  sourceVersion: string;
  technicalCorrelationKey: string;
  recoveryHold: boolean;
}

export interface ISec006OfficialActual {
  kpiId: string;
  performanceYear: number;
  value?: number;
  text?: string;
  status: 'Authoritative' | 'Pending' | 'Unavailable';
  independentSourceReference: string;
}

export interface ISec006ProjectionAuthority {
  role: Sec006ProjectionRole;
  actorPersonKey: string;
  currentReportPersonKeys: readonly string[];
  activeDelegatedPersonKeys: readonly string[];
  exactRecoveryCaseKeys: readonly string[];
  allowedYears: readonly number[];
  allowedKpiIds: readonly string[];
  organisationCohort: ReadonlyArray<{
    personKey: string;
    performanceYear: number;
    teamKey: string;
    managerPersonKey: string;
    kpiIds: readonly string[];
    pillars: readonly string[];
    workstreams: readonly string[];
    reportingMemberships: readonly string[];
  }>;
  sourceVersion: string;
  scopeVersion: string;
  trustedUtc: string;
  auditCorrelationKey: string;
}

export interface ISec006ProjectionFilter {
  performanceYear: number;
  kpiId?: string;
  pillar?: string;
  workstream?: string;
  teamKey?: string;
  managerPersonKey?: string;
  reportingMembership?: string;
}

export interface ISec006SuppressedSummaryRow {
  kpiId: string;
  kpiWording: string;
  pillar: string;
  workstream: string;
  performanceYear: number;
  suppressionState: 'VISIBLE' | 'SUPPRESSED_SMALL_COHORT';
  selectedCohortCount?: number;
  complementCohortCount?: number;
  peopleSelectingKpi?: number;
  approvedContributions?: number;
  pendingContributions?: number;
  officialActualValue?: number;
  officialActualText?: string;
  officialActualStatus?: ISec006OfficialActual['status'];
  officialActualSourceIndependent: true;
}

export interface ISec006CoverageSummaryProjection extends ISec006ProjectionMetadata {
  projection: 'CoverageSummaryProjection';
  querySuppressionState: 'VISIBLE' | 'SUPPRESSED_SMALL_COHORT';
  rows: readonly ISec006SuppressedSummaryRow[];
}

export interface ISec006ManagerDetailRow {
  contributionCaseKey: string;
  personKey: string;
  personDisplayName: string;
  kpiId: string;
  performanceYear: number;
  workplanKey: string;
  workplanItemKey: string;
  contributionMethod: string;
  employeeKpiRole: string;
  annualContributionTarget?: number;
  q1ContributionTarget?: number;
  q2ContributionTarget?: number;
  q3ContributionTarget?: number;
  q4ContributionTarget?: number;
  unitLabel: string;
  approvalState: string;
  directContributionEligible: boolean;
  additiveApproved: boolean;
  nonOverlapRequired: boolean;
  nonOverlapApproved: boolean;
  exclusionCode?: string;
  scopeBasis: 'CurrentReport' | 'ActiveDelegation';
  scopeValidAtUtc: string;
  sourceVersion: string;
}

export interface ISec006ManagerDetailProjection extends ISec006ProjectionMetadata {
  projection: 'ManagerCoverageDetailProjection';
  rows: readonly ISec006ManagerDetailRow[];
}

export interface ISec006BusinessAdminExceptionRow {
  exceptionCaseKey: string;
  kpiId: string;
  performanceYear: number;
  exceptionType: string;
  unitLabel: string;
  contributionMethod: string;
  approvalState: string;
  suppressionState: 'VISIBLE' | 'SUPPRESSED_SMALL_COHORT';
  cohortCount?: number;
  ageBand: '0-7 days' | '8-30 days' | '31+ days' | 'Unknown';
  sourceVersion: string;
}

export interface ISec006BusinessAdminExceptionProjection extends ISec006ProjectionMetadata {
  projection: 'BusinessAdminExceptionProjection';
  querySuppressionState: 'VISIBLE' | 'SUPPRESSED_SMALL_COHORT';
  rows: readonly ISec006BusinessAdminExceptionRow[];
}

export interface ISec006SystemRecoveryRow {
  technicalCorrelationKey: string;
  performanceYear: number;
  sourceVersion: string;
  recoveryHold: boolean;
  exactControlCaseGranted: boolean;
}

export interface ISec006SystemRecoveryProjection extends ISec006ProjectionMetadata {
  projection: 'SystemRecoveryProjection';
  rows: readonly ISec006SystemRecoveryRow[];
}

export type Sec006HumanCoverageProjection =
  | ISec006CoverageSummaryProjection
  | ISec006ManagerDetailProjection
  | ISec006BusinessAdminExceptionProjection
  | ISec006SystemRecoveryProjection;

const metadata = (authority: ISec006ProjectionAuthority): ISec006ProjectionMetadata => ({
  contractVersion: SEC006_RPT005_CONTRACT,
  sourceVersion: authority.sourceVersion,
  generatedAtUtc: authority.trustedUtc,
  scopeVersion: authority.scopeVersion,
  suppressionRuleVersion: SEC006_SUPPRESSION_VERSION,
  auditCorrelationKey: authority.auditCorrelationKey
});

const unique = (values: readonly string[]): string[] => values.filter((value, index, all) => all.indexOf(value) === index);

const assertFilter = (filter: ISec006ProjectionFilter, authority: ISec006ProjectionAuthority): void => {
  if (authority.allowedYears.indexOf(filter.performanceYear) < 0) throw new Error('FILTER_YEAR_OUTSIDE_AUTHORISED_SCOPE');
  if (filter.kpiId && authority.allowedKpiIds.indexOf(filter.kpiId) < 0) throw new Error('FILTER_KPI_OUTSIDE_AUTHORISED_SCOPE');
  const cohort = authority.organisationCohort.filter(person => person.performanceYear === filter.performanceYear);
  if (new Set(cohort.map(person => person.personKey)).size !== cohort.length
    || cohort.some(person => !person.personKey || !Array.isArray(person.kpiIds)
      || !Array.isArray(person.pillars) || !Array.isArray(person.workstreams)
      || !Array.isArray(person.reportingMemberships))) {
    throw new Error('PROJECTION_UNIVERSE_INVALID');
  }
};

const filteredUniverse = (
  authority: ISec006ProjectionAuthority,
  filter: ISec006ProjectionFilter
): string[] => unique(authority.organisationCohort.filter(person => person.performanceYear === filter.performanceYear
  && (!filter.kpiId || person.kpiIds.indexOf(filter.kpiId) >= 0)
  && (!filter.pillar || person.pillars.indexOf(filter.pillar) >= 0)
  && (!filter.workstream || person.workstreams.indexOf(filter.workstream) >= 0)
  && (!filter.teamKey || person.teamKey === filter.teamKey)
  && (!filter.managerPersonKey || person.managerPersonKey === filter.managerPersonKey)
  && (!filter.reportingMembership || person.reportingMemberships.indexOf(filter.reportingMembership) >= 0))
  .map(person => person.personKey));

const applyFilter = (
  rows: readonly ISec006RawCoverageRow[],
  filter: ISec006ProjectionFilter,
  authority: ISec006ProjectionAuthority
): ISec006RawCoverageRow[] => {
  assertFilter(filter, authority);
  const universe = new Set(filteredUniverse(authority, filter));
  return rows.filter(row => universe.has(row.personKey)
    && row.performanceYear === filter.performanceYear
    && authority.allowedKpiIds.indexOf(row.kpiId) >= 0
    && (!filter.kpiId || row.kpiId === filter.kpiId)
    && (!filter.pillar || row.pillar === filter.pillar)
    && (!filter.workstream || row.workstream === filter.workstream)
    && (!filter.teamKey || row.teamKey === filter.teamKey)
    && (!filter.managerPersonKey || row.managerPersonKey === filter.managerPersonKey)
    && (!filter.reportingMembership || row.reportingMemberships.indexOf(filter.reportingMembership) >= 0));
};

const safeAgeBand = (openedAtUtc: string | undefined, nowUtc: string): ISec006BusinessAdminExceptionRow['ageBand'] => {
  if (!openedAtUtc || Number.isNaN(Date.parse(openedAtUtc))) return 'Unknown';
  const days = Math.floor((Date.parse(nowUtc) - Date.parse(openedAtUtc)) / 86400000);
  return days <= 7 ? '0-7 days' : days <= 30 ? '8-30 days' : '31+ days';
};

export const createSec006CoverageSummaryProjection = (
  rawRows: readonly ISec006RawCoverageRow[],
  officialActuals: readonly ISec006OfficialActual[],
  filter: ISec006ProjectionFilter,
  authority: ISec006ProjectionAuthority
): ISec006CoverageSummaryProjection => {
  const filtered = applyFilter(rawRows, filter, authority);
  const kpis = unique(filtered.map(row => row.kpiId));
  const rows = kpis.map(kpiId => {
    const cohortRows = filtered.filter(row => row.kpiId === kpiId);
    const sample = cohortRows[0];
    const selectedPeople = unique(cohortRows.map(row => row.personKey));
    const scopedUniverse = filteredUniverse(authority, filter);
    const complement = scopedUniverse.filter(personKey => selectedPeople.indexOf(personKey) < 0);
    const suppressed = selectedPeople.length < SEC006_MINIMUM_COHORT || complement.length < SEC006_MINIMUM_COHORT;
    const actual = officialActuals.find(value => value.kpiId === kpiId && value.performanceYear === filter.performanceYear);
    const base: ISec006SuppressedSummaryRow = {
      kpiId,
      kpiWording: sample.kpiWording,
      pillar: sample.pillar,
      workstream: sample.workstream,
      performanceYear: filter.performanceYear,
      suppressionState: suppressed ? 'SUPPRESSED_SMALL_COHORT' : 'VISIBLE',
      officialActualSourceIndependent: true
    };
    if (suppressed) return base;
    return {
      ...base,
      selectedCohortCount: selectedPeople.length,
      complementCohortCount: complement.length,
      peopleSelectingKpi: selectedPeople.length,
      approvedContributions: cohortRows.filter(row => row.approvalState === 'Approved' && row.additiveApproved)
        .reduce((sum, row) => sum + (row.annualContributionTarget || 0), 0),
      pendingContributions: cohortRows.filter(row => row.approvalState !== 'Approved')
        .reduce((sum, row) => sum + (row.annualContributionTarget || 0), 0),
      officialActualValue: actual?.value,
      officialActualText: actual?.text,
      officialActualStatus: actual?.status || 'Unavailable'
    };
  });
  const suppressedQuery = rows.length === 0 || rows.some(row => row.suppressionState === 'SUPPRESSED_SMALL_COHORT');
  return {
    ...metadata(authority),
    projection: 'CoverageSummaryProjection',
    querySuppressionState: suppressedQuery ? 'SUPPRESSED_SMALL_COHORT' : 'VISIBLE',
    rows: suppressedQuery ? [] : rows
  };
};

export const createSec006ManagerDetailProjection = (
  rawRows: readonly ISec006RawCoverageRow[],
  filter: ISec006ProjectionFilter,
  authority: ISec006ProjectionAuthority
): ISec006ManagerDetailProjection => {
  if (authority.role !== 'Manager' && authority.role !== 'DelegatedManager') throw new Error('MANAGER_PROJECTION_AUTHORITY_REQUIRED');
  const current = new Set(authority.currentReportPersonKeys);
  const delegated = new Set(authority.activeDelegatedPersonKeys);
  const rows = applyFilter(rawRows, filter, authority)
    .filter(row => current.has(row.personKey) || delegated.has(row.personKey))
    .map(row => ({
      contributionCaseKey: row.contributionCaseKey,
      personKey: row.personKey,
      personDisplayName: row.personDisplayName,
      kpiId: row.kpiId,
      performanceYear: row.performanceYear,
      workplanKey: row.workplanKey,
      workplanItemKey: row.workplanItemKey,
      contributionMethod: row.contributionMethod,
      employeeKpiRole: row.employeeKpiRole,
      annualContributionTarget: row.annualContributionTarget,
      q1ContributionTarget: row.q1ContributionTarget,
      q2ContributionTarget: row.q2ContributionTarget,
      q3ContributionTarget: row.q3ContributionTarget,
      q4ContributionTarget: row.q4ContributionTarget,
      unitLabel: row.unitLabel,
      approvalState: row.approvalState,
      directContributionEligible: row.directContributionEligible,
      additiveApproved: row.additiveApproved,
      nonOverlapRequired: row.nonOverlapRequired,
      nonOverlapApproved: row.nonOverlapApproved,
      exclusionCode: row.exclusionCode,
      scopeBasis: current.has(row.personKey) ? 'CurrentReport' as const : 'ActiveDelegation' as const,
      scopeValidAtUtc: authority.trustedUtc,
      sourceVersion: row.sourceVersion
    }));
  return { ...metadata(authority), projection: 'ManagerCoverageDetailProjection', rows };
};

export const createSec006BusinessAdminExceptionProjection = (
  rawRows: readonly ISec006RawCoverageRow[],
  filter: ISec006ProjectionFilter,
  authority: ISec006ProjectionAuthority
): ISec006BusinessAdminExceptionProjection => {
  if (authority.role !== 'BusinessAdmin') throw new Error('BUSINESS_ADMIN_PROJECTION_AUTHORITY_REQUIRED');
  const filtered = applyFilter(rawRows, filter, authority).filter(row => Boolean(row.exceptionType));
  const grouped = new Map<string, ISec006RawCoverageRow[]>();
  filtered.forEach(row => {
    const key = `${row.kpiId}|${row.exceptionType}|${row.unitLabel}|${row.contributionMethod}|${row.approvalState}`;
    grouped.set(key, [...(grouped.get(key) || []), row]);
  });
  const rows = Array.from(grouped.entries()).map(([key, group]) => {
    const sample = group[0];
    const cohort = unique(group.map(row => row.personKey));
    const complement = filteredUniverse(authority, filter).filter(personKey => cohort.indexOf(personKey) < 0);
    const suppressed = cohort.length < SEC006_MINIMUM_COHORT || complement.length < SEC006_MINIMUM_COHORT;
    return {
      exceptionCaseKey: `EXC|${sec006Sha256(key).slice(0, 24)}`,
      kpiId: sample.kpiId,
      performanceYear: sample.performanceYear,
      exceptionType: sample.exceptionType || 'Unresolved',
      unitLabel: sample.unitLabel,
      contributionMethod: sample.contributionMethod,
      approvalState: sample.approvalState,
      suppressionState: suppressed ? 'SUPPRESSED_SMALL_COHORT' as const : 'VISIBLE' as const,
      cohortCount: suppressed ? undefined : cohort.length,
      ageBand: safeAgeBand(sample.exceptionOpenedAtUtc, authority.trustedUtc),
      sourceVersion: sample.sourceVersion
    };
  });
  const suppressedQuery = rows.length === 0 || rows.some(row => row.suppressionState === 'SUPPRESSED_SMALL_COHORT');
  return {
    ...metadata(authority),
    projection: 'BusinessAdminExceptionProjection',
    querySuppressionState: suppressedQuery ? 'SUPPRESSED_SMALL_COHORT' : 'VISIBLE',
    rows: suppressedQuery ? [] : rows
  };
};

export const createSec006SystemRecoveryProjection = (
  rawRows: readonly ISec006RawCoverageRow[],
  filter: ISec006ProjectionFilter,
  authority: ISec006ProjectionAuthority
): ISec006SystemRecoveryProjection => {
  if (authority.role !== 'SystemAdmin') throw new Error('SYSTEM_ADMIN_PROJECTION_AUTHORITY_REQUIRED');
  const rows = applyFilter(rawRows, filter, authority).map(row => ({
    technicalCorrelationKey: row.technicalCorrelationKey,
    performanceYear: row.performanceYear,
    sourceVersion: row.sourceVersion,
    recoveryHold: row.recoveryHold,
    exactControlCaseGranted: authority.exactRecoveryCaseKeys.indexOf(row.contributionCaseKey) >= 0
  }));
  return { ...metadata(authority), projection: 'SystemRecoveryProjection', rows };
};

export const assertNoRawCoverageFields = (projection: Sec006HumanCoverageProjection): string[] => {
  const forbidden = [
    'managerPersonKey', 'teamKey', 'employeeActual', 'technicalCorrelationKey',
    'personKey', 'personDisplayName', 'workplanKey', 'workplanItemKey', 'contributionCaseKey'
  ];
  const permittedNamedProjection = projection.projection === 'ManagerCoverageDetailProjection';
  const permittedTechnicalProjection = projection.projection === 'SystemRecoveryProjection';
  const errors: string[] = [];
  const rows = projection.rows as unknown as ReadonlyArray<Record<string, unknown>>;
  rows.forEach((row, index) => Object.keys(row).forEach(key => {
    if (permittedNamedProjection && ['personKey', 'personDisplayName', 'workplanKey', 'workplanItemKey', 'contributionCaseKey'].indexOf(key) >= 0) return;
    if (permittedTechnicalProjection && key === 'technicalCorrelationKey') return;
    if (forbidden.indexOf(key) >= 0) errors.push(`FORBIDDEN_FIELD:${projection.projection}:${index}:${key}`);
  }));
  return errors;
};
