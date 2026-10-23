/* eslint-disable @rushstack/no-new-null -- RPT-005 uses explicit nulls for unavailable numeric feed values. */
/**
 * DEMO-APP-RPT-005-COVERAGE-001 application adapter.
 *
 * Source authority: reporting commit e64961727b7c800189eb0633fdb5ffb7786edc53,
 * reporting/workplan-contribution-coverage.mts.
 *
 * Coverage mathematics and inclusion rules live here, outside React. The Admin
 * page consumes only the resulting summary/detail feed.
 */

export const STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION = 'DEMO-APP-RPT-005-COVERAGE-001' as const;
export const STRATEGIC_CORE_COVERAGE_SOURCE_SHA = 'e64961727b7c800189eb0633fdb5ffb7786edc53' as const;

export const COVERAGE_STATES = [
  'NOT_READY', 'UNDER_ALLOCATED', 'COVERED', 'OVER_ALLOCATED', 'NOT_APPLICABLE'
] as const;
export type CoverageState = typeof COVERAGE_STATES[number];
export type ReportingMembership = 'CORE_CWOP' | 'LONDON_CITIES_CWOP' | 'WOMEN_GIRLS_CWOP' | 'CWSP' | 'EDI_CWOP';
export type CurrentReportingMembership = Exclude<ReportingMembership, 'EDI_CWOP'>;
export type ReportingMembershipLifecycle = 'Current' | 'Future';
export type ContributionMethod = 'Additive' | 'SharedTarget' | 'WeightedDenominator' | 'AccountableOwner' | 'CompletionOversight';
export type WorkplanCoverageRole = 'AccountableOwner' | 'DeliveryLead' | 'Contributor' | 'Oversight' | 'EvidenceProvider';
export type CoverageItemScope = 'StrategicCore' | 'Personal' | 'Behaviour';
export type WorkplanStatus = 'Draft' | 'Submitted' | 'ChangesRequested' | 'ManagerApproved' | 'Locked' | 'Archived';
export type ManagerApprovalStatus = 'Draft' | 'Pending' | 'Approved' | 'Rejected' | 'Superseded';
export type CoverageDisposition = 'APPROVED_INCLUDED' | 'PENDING_DISPLAY_ONLY' | 'DETAIL_ONLY' | 'EXCLUDED';

export interface IReportingMembershipDefinition {
  code: ReportingMembership;
  lifecycle: ReportingMembershipLifecycle;
  configured: boolean;
  approvalStatus: 'Approved' | 'Unconfigured';
  effectiveFrom: string;
  effectiveTo: string;
}

export interface ICoverageIssue {
  code: string;
  severity: 'Error' | 'Warning' | 'Information';
  contributionKey?: string;
  kpiId: string;
  message: string;
}

export interface ICoverageTargets {
  annual: number | null;
  q1: number | null;
  q2: number | null;
  q3: number | null;
  q4: number | null;
}

export interface IStrategicCoreCoverageKpi {
  kpiId: string;
  wording: string;
  pillar: string;
  workstream: string;
  owner?: string;
  performanceYear: number;
  lifecycleStatus: 'Active' | 'Retired';
  coverageMethod: ContributionMethod;
  organisationTargets: ICoverageTargets;
  organisationTargetText?: string;
  unit: string;
  reportingMembership: ReportingMembership[];
  officialActualValue: number | string | null;
  officialActualUnit: string;
  officialActualSourceKey: string;
  officialActualSourceStatus: 'Authoritative' | 'Pending' | 'Unavailable';
}

export interface IWorkplanContributionInput {
  contributionKey: string;
  kpiId: string;
  performanceYear: number;
  itemScope: CoverageItemScope;
  personKey: string;
  personDisplayName: string;
  managerKey: string;
  managerDisplayName: string;
  teamKey: string;
  teamDisplayName: string;
  workplanKey: string;
  workplanStatus: WorkplanStatus;
  managerApprovalStatus: ManagerApprovalStatus;
  role: WorkplanCoverageRole;
  contributionMethod: ContributionMethod | null;
  directContributionEligible: boolean;
  nonOverlapRequired: boolean;
  nonOverlapApproved: boolean;
  contributionTargets: ICoverageTargets;
  unit: string;
  annualCommitment: string;
  q1Commitment: string;
  q2Commitment: string;
  q3Commitment: string;
  q4Commitment: string;
  what100PercentLooksLike: string;
  employeeCompletionPercent: number | null;
  calculatedEmployeeRag: 'Green' | 'Amber' | 'Red' | 'NotRated' | null;
  employeeActualValue: number | string | null;
  employeeActualUnit: string;
  officialActualAggregationPermitted: boolean;
  effectiveFrom: string;
  effectiveTo: string;
  approvalTimestamp: string;
  version: number;
  sourceReference: string;
  auditCreatedAt: string;
  auditCreatedBy: string;
  auditUpdatedAt: string;
  auditUpdatedBy: string;
}

export interface IStrategicCoreCoverageFilter {
  performanceYear?: number;
  pillar?: string;
  workstream?: string;
  teamKey?: string;
  managerKey?: string;
  kpiId?: string;
  reportingMembership?: ReportingMembership;
}

export interface ICoveragePeriodResult {
  organisationTarget: number | null;
  pendingContribution: number;
  approvedContribution: number;
  coveragePercent: number | null;
  gap: number | null;
  surplus: number | null;
  gapOrSurplus: number | null;
  state: CoverageState;
}

export interface IStrategicCoreCoverageSummaryRow {
  kpiId: string;
  wording: string;
  pillar: string;
  workstream: string;
  owner?: string;
  organisationTargetText?: string;
  unit: string;
  reportingMembership: ReportingMembership[];
  coverageMethod: ContributionMethod;
  peopleSelectingKpi: number;
  directContributors: number;
  oversightPeople: number;
  accountableOwners: number;
  otherRoles: number;
  annual: ICoveragePeriodResult;
  q1: ICoveragePeriodResult;
  q2: ICoveragePeriodResult;
  q3: ICoveragePeriodResult;
  q4: ICoveragePeriodResult;
  unresolvedContributionCount: number;
  unitMismatchCount: number;
  officialActualValue: number | string | null;
  officialActualUnit: string;
  officialActualSourceKey: string;
  officialActualSourceStatus: 'Authoritative' | 'Pending' | 'Unavailable';
  employeeDeliveryInformationAvailable: boolean;
  officialActualDerivedFromEmployeeActuals: false;
}

export interface IStrategicCoreCoverageDetailRow {
  detailRecordKey: string;
  contributionKey: string;
  kpiId: string;
  personKey: string;
  personDisplayName: string;
  managerKey: string;
  managerDisplayName: string;
  teamKey: string;
  teamDisplayName: string;
  role: WorkplanCoverageRole;
  contributionMethod: ContributionMethod | '';
  workplanStatus: WorkplanStatus;
  managerApprovalStatus: ManagerApprovalStatus;
  allocationDisposition: CoverageDisposition;
  includedInNumericalCoverage: 'YES' | 'NO';
  exclusionReasons: string[];
  annualContribution: number | null;
  q1Contribution: number | null;
  q2Contribution: number | null;
  q3Contribution: number | null;
  q4Contribution: number | null;
  unit: string;
  workplanKey: string;
  performanceYear: number;
  effectiveFrom: string;
  effectiveTo: string;
  approvalTimestamp: string;
  version: number;
  sourceReference: string;
  auditCreatedAt: string;
  auditCreatedBy: string;
  auditUpdatedAt: string;
  auditUpdatedBy: string;
  annualCommitment: string;
  q1Commitment: string;
  q2Commitment: string;
  q3Commitment: string;
  q4Commitment: string;
  what100PercentLooksLike: string;
  employeeCompletionPercent: number | null;
  calculatedEmployeeRag: 'Green' | 'Amber' | 'Red' | 'NotRated' | '';
  employeeActualValue: number | string | null;
  employeeActualUnit: string;
  officialActualAggregationPermitted: boolean;
}

export interface IStrategicCoreCoverageFeed {
  contractVersion: typeof STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION;
  sourceSha: typeof STRATEGIC_CORE_COVERAGE_SOURCE_SHA;
  contractValid: boolean;
  performanceYear: number;
  asOfDate: string;
  filters: IStrategicCoreCoverageFilter;
  summary: IStrategicCoreCoverageSummaryRow[];
  detail: IStrategicCoreCoverageDetailRow[];
  underAllocated: IStrategicCoreCoverageSummaryRow[];
  overAllocated: IStrategicCoreCoverageSummaryRow[];
  unresolvedContributionMethods: IStrategicCoreCoverageDetailRow[];
  unitMismatches: IStrategicCoreCoverageDetailRow[];
  pendingContributions: IStrategicCoreCoverageDetailRow[];
  issues: ICoverageIssue[];
  reportingMembershipState: {
    requested?: ReportingMembership;
    state: 'ACTIVE' | 'FUTURE_UNCONFIGURED' | 'UNKNOWN';
    message: string;
  };
  officialActualSeparation: {
    planningCoverageSource: 'approved Workplan targets';
    officialActualSource: 'authoritative organisation-level KPI data source';
    employeeActualsSummed: false;
    productionActualWritesPerformed: false;
  };
}

export interface IStrategicCoreCoverageSource {
  contractVersion: typeof STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION;
  kpis: readonly IStrategicCoreCoverageKpi[];
  contributions: readonly IWorkplanContributionInput[];
  membershipDefinitions: readonly IReportingMembershipDefinition[];
  performanceYear: number;
  asOfDate: string;
}

const targetKeys: Array<keyof ICoverageTargets> = ['annual', 'q1', 'q2', 'q3', 'q4'];
const round = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;
const normaliseUnit = (value: string): string => value.trim().toLocaleLowerCase('en-GB');
const isEffective = (row: IWorkplanContributionInput, asOfDate: string): boolean =>
  row.effectiveFrom <= asOfDate && row.effectiveTo >= asOfDate;
const isApproved = (row: IWorkplanContributionInput): boolean =>
  (row.workplanStatus === 'ManagerApproved' || row.workplanStatus === 'Locked')
  && row.managerApprovalStatus === 'Approved';
const clean = (value: string): string => value.trim();
const logicalContributionGrain = (row: IWorkplanContributionInput): string =>
  `${clean(row.contributionKey).toLocaleUpperCase('en-GB')}|${row.performanceYear}`;
const validDate = (value: string): boolean => Boolean(clean(value)) && !Number.isNaN(Date.parse(value));
const hasRequiredProvenance = (row: IWorkplanContributionInput): boolean => Boolean(
  clean(row.contributionKey) && clean(row.workplanKey) && Number.isInteger(row.version) && row.version > 0
  && validDate(row.effectiveFrom) && validDate(row.effectiveTo)
  && (row.managerApprovalStatus !== 'Approved' || validDate(row.approvalTimestamp))
  && clean(row.sourceReference) && validDate(row.auditCreatedAt) && clean(row.auditCreatedBy)
  && validDate(row.auditUpdatedAt) && clean(row.auditUpdatedBy)
);
const isExplicitlyHistoric = (row: IWorkplanContributionInput, asOfDate: string): boolean =>
  row.workplanStatus === 'Archived' || row.managerApprovalStatus === 'Superseded'
  || row.managerApprovalStatus === 'Rejected' || row.effectiveTo < asOfDate;

const conflictingContributionGrains = (
  rows: readonly IWorkplanContributionInput[],
  asOfDate: string
): ReadonlySet<string> => {
  const groups = new Map<string, IWorkplanContributionInput[]>();
  rows.forEach(row => {
    const grain = logicalContributionGrain(row);
    const current = groups.get(grain) || [];
    current.push(row);
    groups.set(grain, current);
  });
  const conflicts = new Set<string>();
  groups.forEach((group, grain) => {
    const live = group.filter(row => !isExplicitlyHistoric(row, asOfDate)
      && row.effectiveFrom <= asOfDate && row.effectiveTo >= asOfDate);
    if (live.length > 1) conflicts.add(grain);
  });
  return conflicts;
};

const isMembershipDefinitionActive = (
  definition: IReportingMembershipDefinition,
  asOfDate: string
): boolean => definition.lifecycle === 'Current' && definition.configured
  && definition.approvalStatus === 'Approved'
  && definition.effectiveFrom <= asOfDate && definition.effectiveTo >= asOfDate;

export const activeReportingMemberships = (
  source: IStrategicCoreCoverageSource
): ReportingMembership[] => source.membershipDefinitions
  .filter(definition => isMembershipDefinitionActive(definition, source.asOfDate))
  .map(definition => definition.code)
  .filter((code, index, all) => all.indexOf(code) === index)
  .sort((left, right) => left.localeCompare(right));

const periodResult = (
  target: number | null,
  pending: number,
  approved: number,
  method: ContributionMethod,
  forceNotReady: boolean
): ICoveragePeriodResult => {
  if (method !== 'Additive') {
    return { organisationTarget: target, pendingContribution: pending, approvedContribution: approved,
      coveragePercent: null, gap: null, surplus: null, gapOrSurplus: null, state: 'NOT_APPLICABLE' };
  }
  if (forceNotReady || target === null || !Number.isFinite(target) || target <= 0) {
    return { organisationTarget: target, pendingContribution: round(pending), approvedContribution: round(approved),
      coveragePercent: null, gap: null, surplus: null, gapOrSurplus: null, state: 'NOT_READY' };
  }
  const difference = round(target - approved);
  return {
    organisationTarget: target,
    pendingContribution: round(pending),
    approvedContribution: round(approved),
    coveragePercent: round((approved / target) * 100),
    gap: difference > 0 ? difference : 0,
    surplus: difference < 0 ? round(-difference) : 0,
    gapOrSurplus: difference,
    state: Math.abs(difference) < 0.000001 ? 'COVERED' : difference > 0 ? 'UNDER_ALLOCATED' : 'OVER_ALLOCATED'
  };
};

const exclusionReasons = (
  row: IWorkplanContributionInput,
  kpi: IStrategicCoreCoverageKpi | undefined,
  requestYear: number,
  asOfDate: string,
  conflictingGrains: ReadonlySet<string>,
  contractValid: boolean
): string[] => {
  const reasons: string[] = [];
  if (!contractValid) reasons.push('CONTRACT_VERSION_MISMATCH');
  if (conflictingGrains.has(logicalContributionGrain(row))) reasons.push('DUPLICATE_CONTRIBUTION_KEY');
  if (!hasRequiredProvenance(row)) reasons.push('PROVENANCE_INCOMPLETE');
  if (row.itemScope !== 'StrategicCore') reasons.push('SCOPE_NOT_STRATEGIC_CORE');
  if (row.performanceYear !== requestYear) reasons.push('WRONG_PERFORMANCE_YEAR');
  if (!kpi || kpi.lifecycleStatus !== 'Active') reasons.push('KPI_NOT_ACTIVE_STRATEGIC_CORE');
  if (!isEffective(row, asOfDate)) reasons.push('OUTSIDE_EFFECTIVE_DATES');
  if (row.contributionMethod === null) reasons.push('CONTRIBUTION_METHOD_MISSING');
  else if (row.contributionMethod !== 'Additive') reasons.push('CONTRIBUTION_METHOD_NOT_ADDITIVE');
  if (kpi && kpi.coverageMethod !== 'Additive') reasons.push('KPI_COVERAGE_METHOD_NOT_ADDITIVE');
  if (!row.directContributionEligible) reasons.push('DIRECT_CONTRIBUTION_NOT_ELIGIBLE');
  if (row.nonOverlapRequired && !row.nonOverlapApproved) reasons.push('NON_OVERLAP_NOT_APPROVED');
  if (kpi && row.contributionMethod === 'Additive' && normaliseUnit(row.unit) !== normaliseUnit(kpi.unit)) {
    reasons.push('UNIT_MISMATCH');
  }
  if (row.contributionMethod === 'Additive' && targetKeys.some(key => row.contributionTargets[key] === null)) {
    reasons.push('CONTRIBUTION_TARGET_MISSING');
  }
  if (row.workplanStatus === 'Archived' || row.managerApprovalStatus === 'Rejected'
    || row.managerApprovalStatus === 'Superseded') reasons.push('WORKPLAN_NOT_ACTIVE');
  else if (!isApproved(row)) reasons.push('WORKPLAN_NOT_APPROVED');
  return reasons;
};

const dispositionFor = (row: IWorkplanContributionInput, reasons: readonly string[]): CoverageDisposition => {
  if (reasons.indexOf('SCOPE_NOT_STRATEGIC_CORE') >= 0 || reasons.indexOf('WRONG_PERFORMANCE_YEAR') >= 0
    || reasons.indexOf('KPI_NOT_ACTIVE_STRATEGIC_CORE') >= 0 || reasons.indexOf('OUTSIDE_EFFECTIVE_DATES') >= 0
    || reasons.indexOf('WORKPLAN_NOT_ACTIVE') >= 0) return 'EXCLUDED';
  const structural = reasons.filter(reason => reason !== 'WORKPLAN_NOT_APPROVED');
  if (!structural.length && reasons.indexOf('WORKPLAN_NOT_APPROVED') >= 0
    && (row.managerApprovalStatus === 'Draft' || row.managerApprovalStatus === 'Pending')) return 'PENDING_DISPLAY_ONLY';
  return reasons.length ? 'DETAIL_ONLY' : 'APPROVED_INCLUDED';
};

export const calculateStrategicCoreCoverageFeed = (
  source: IStrategicCoreCoverageSource,
  filters: IStrategicCoreCoverageFilter = {}
): IStrategicCoreCoverageFeed => {
  const request = { ...filters, performanceYear: filters.performanceYear ?? source.performanceYear };
  const contractValid = source.contractVersion === STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION;
  const activeMemberships = activeReportingMemberships(source);
  const requestedDefinition = source.membershipDefinitions.filter(definition => definition.code === request.reportingMembership)[0];
  const requestedMembershipActive = !request.reportingMembership
    || activeMemberships.indexOf(request.reportingMembership) >= 0;
  const reportingMembershipState: IStrategicCoreCoverageFeed['reportingMembershipState'] = request.reportingMembership
    ? requestedMembershipActive
      ? { requested: request.reportingMembership, state: 'ACTIVE', message: 'Approved current reporting membership.' }
      : requestedDefinition?.lifecycle === 'Future'
        ? { requested: request.reportingMembership, state: 'FUTURE_UNCONFIGURED', message: 'Future EDI CWOP — configuration required. Zero current KPI mappings.' }
        : { requested: request.reportingMembership, state: 'UNKNOWN', message: 'Reporting membership is not approved and current.' }
    : { state: 'ACTIVE', message: 'All approved current reporting memberships.' };
  const kpis = source.kpis.filter(kpi => kpi.lifecycleStatus === 'Active'
    && kpi.performanceYear === request.performanceYear
    && (!request.pillar || kpi.pillar === request.pillar)
    && (!request.workstream || kpi.workstream === request.workstream)
    && (!request.kpiId || kpi.kpiId === request.kpiId)
    && requestedMembershipActive
    && (!request.reportingMembership || kpi.reportingMembership.indexOf(request.reportingMembership) >= 0));
  const selectedKpis = new Set(kpis.map(kpi => kpi.kpiId));
  const kpiById = new Map(kpis.map(kpi => [kpi.kpiId, kpi]));
  // ContributionKey is governed across the performance-year input feed, not
  // inside the current UI filter. Team/KPI filters must never hide a conflict.
  const conflictingGrains = conflictingContributionGrains(source.contributions, source.asOfDate);
  const relevant = source.contributions.filter(row => selectedKpis.has(row.kpiId)
    && (!request.teamKey || row.teamKey === request.teamKey)
    && (!request.managerKey || row.managerKey === request.managerKey));
  const detailIdentityCounts = new Map<string, number>();
  const sortedRelevant = relevant.slice().sort((left, right) => {
    const canonicalKey = (row: IWorkplanContributionInput): string => [
      logicalContributionGrain(row), row.version, row.auditCreatedAt, row.auditUpdatedAt, row.personKey,
      row.workplanKey, row.workplanStatus, row.managerApprovalStatus, row.approvalTimestamp,
      row.contributionTargets.annual, row.contributionTargets.q1, row.contributionTargets.q2,
      row.contributionTargets.q3, row.contributionTargets.q4
    ].join('|');
    const leftKey = canonicalKey(left);
    const rightKey = canonicalKey(right);
    return leftKey.localeCompare(rightKey);
  });
  const detailByRow = new Map<IWorkplanContributionInput, IStrategicCoreCoverageDetailRow>();
  const detail = sortedRelevant.map(row => {
    const reasons = exclusionReasons(row, kpiById.get(row.kpiId), request.performanceYear || source.performanceYear,
      source.asOfDate, conflictingGrains, contractValid);
    const disposition = dispositionFor(row, reasons);
    const identityBase = `${logicalContributionGrain(row)}|v${row.version}|${row.auditCreatedAt}|${row.personKey}|${row.workplanKey}`;
    const identityOrdinal = (detailIdentityCounts.get(identityBase) || 0) + 1;
    detailIdentityCounts.set(identityBase, identityOrdinal);
    const projected: IStrategicCoreCoverageDetailRow = {
      detailRecordKey: `${identityBase}|${identityOrdinal}`,
      contributionKey: row.contributionKey, kpiId: row.kpiId, personKey: row.personKey,
      personDisplayName: row.personDisplayName, managerKey: row.managerKey,
      managerDisplayName: row.managerDisplayName, teamKey: row.teamKey, teamDisplayName: row.teamDisplayName,
      role: row.role, contributionMethod: row.contributionMethod === null ? '' as const : row.contributionMethod, workplanStatus: row.workplanStatus,
      managerApprovalStatus: row.managerApprovalStatus, allocationDisposition: disposition,
      includedInNumericalCoverage: disposition === 'APPROVED_INCLUDED' ? 'YES' as const : 'NO' as const,
      exclusionReasons: reasons, annualContribution: row.contributionTargets.annual,
      q1Contribution: row.contributionTargets.q1, q2Contribution: row.contributionTargets.q2,
      q3Contribution: row.contributionTargets.q3, q4Contribution: row.contributionTargets.q4, unit: row.unit,
      workplanKey: row.workplanKey, performanceYear: row.performanceYear,
      effectiveFrom: row.effectiveFrom, effectiveTo: row.effectiveTo,
      approvalTimestamp: row.approvalTimestamp, version: row.version, sourceReference: row.sourceReference,
      auditCreatedAt: row.auditCreatedAt, auditCreatedBy: row.auditCreatedBy,
      auditUpdatedAt: row.auditUpdatedAt, auditUpdatedBy: row.auditUpdatedBy,
      annualCommitment: row.annualCommitment, q1Commitment: row.q1Commitment,
      q2Commitment: row.q2Commitment, q3Commitment: row.q3Commitment, q4Commitment: row.q4Commitment,
      what100PercentLooksLike: row.what100PercentLooksLike,
      employeeCompletionPercent: row.employeeCompletionPercent,
      calculatedEmployeeRag: row.calculatedEmployeeRag || '', employeeActualValue: row.employeeActualValue,
      employeeActualUnit: row.employeeActualUnit,
      officialActualAggregationPermitted: row.officialActualAggregationPermitted
    };
    detailByRow.set(row, projected);
    return projected;
  });
  const summary = kpis.map(kpi => {
    const rows = relevant.filter(row => row.kpiId === kpi.kpiId && row.itemScope === 'StrategicCore'
      && row.performanceYear === request.performanceYear && isEffective(row, source.asOfDate));
    const approved = rows.filter(row => detailByRow.get(row)?.allocationDisposition === 'APPROVED_INCLUDED');
    const pending = rows.filter(row => detailByRow.get(row)?.allocationDisposition === 'PENDING_DISPLAY_ONLY');
    const rowDetails = rows.map(row => detailByRow.get(row)).filter((row): row is IStrategicCoreCoverageDetailRow => Boolean(row));
    const unresolved = rowDetails.filter(row => row.exclusionReasons.indexOf('CONTRIBUTION_METHOD_MISSING') >= 0).length;
    const mismatches = rowDetails.filter(row => row.exclusionReasons.indexOf('UNIT_MISMATCH') >= 0).length;
    const forceNotReady = kpi.coverageMethod === 'Additive' && (!contractValid || !kpi.unit.trim() || unresolved > 0
      || targetKeys.some(key => kpi.organisationTargets[key] === null)
      || rowDetails.some(row => row.exclusionReasons.indexOf('DUPLICATE_CONTRIBUTION_KEY') >= 0
        || row.exclusionReasons.indexOf('PROVENANCE_INCOMPLETE') >= 0));
    const period = (key: keyof ICoverageTargets): ICoveragePeriodResult => periodResult(
      kpi.organisationTargets[key],
      pending.reduce((total, row) => total + (row.contributionTargets[key] || 0), 0),
      approved.reduce((total, row) => total + (row.contributionTargets[key] || 0), 0),
      kpi.coverageMethod,
      forceNotReady
    );
    const unique = (values: string[]): number => values.filter((value, index, all) => all.indexOf(value) === index).length;
    return {
      kpiId: kpi.kpiId, wording: kpi.wording, pillar: kpi.pillar, workstream: kpi.workstream,
      owner: kpi.owner, organisationTargetText: kpi.organisationTargetText,
      unit: kpi.unit, coverageMethod: kpi.coverageMethod,
      peopleSelectingKpi: unique(rows.map(row => row.personKey)),
      directContributors: unique(approved.map(row => row.personKey)),
      oversightPeople: unique(rows.filter(row => row.role === 'Oversight').map(row => row.personKey)),
      accountableOwners: unique(rows.filter(row => row.role === 'AccountableOwner').map(row => row.personKey)),
      otherRoles: unique(rows.filter(row => row.role !== 'Oversight' && row.role !== 'AccountableOwner').map(row => row.personKey)),
      annual: period('annual'), q1: period('q1'), q2: period('q2'), q3: period('q3'), q4: period('q4'),
      unresolvedContributionCount: unresolved, unitMismatchCount: mismatches,
      officialActualValue: kpi.officialActualValue, officialActualUnit: kpi.officialActualUnit,
      officialActualSourceKey: kpi.officialActualSourceKey, officialActualSourceStatus: kpi.officialActualSourceStatus,
      employeeDeliveryInformationAvailable: rows.some(row => row.employeeActualValue !== null),
      officialActualDerivedFromEmployeeActuals: false as const,
      reportingMembership: kpi.reportingMembership.filter(membership => activeMemberships.indexOf(membership) >= 0)
    };
  }).sort((left, right) => left.kpiId.localeCompare(right.kpiId));
  const issues: ICoverageIssue[] = [];
  if (!contractValid) issues.push({
    code: 'CONTRACT_VERSION_MISMATCH', severity: 'Error', kpiId: '*',
    message: 'The supplied source does not match DEMO-APP-RPT-005-COVERAGE-001; coverage is NOT_READY.'
  });
  detail.forEach(row => row.exclusionReasons.forEach(reason => issues.push({
    code: reason,
    severity: reason === 'DUPLICATE_CONTRIBUTION_KEY' || reason === 'PROVENANCE_INCOMPLETE'
      || reason === 'CONTRACT_VERSION_MISMATCH' || reason === 'CONTRIBUTION_METHOD_MISSING'
      || reason === 'CONTRIBUTION_TARGET_MISSING' ? 'Error' : 'Warning',
    contributionKey: row.contributionKey,
    kpiId: row.kpiId,
    message: `${row.contributionKey} is not approved numerical coverage: ${reason}.`
  })));
  return {
    contractVersion: STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION,
    sourceSha: STRATEGIC_CORE_COVERAGE_SOURCE_SHA,
    contractValid,
    performanceYear: source.performanceYear,
    asOfDate: source.asOfDate,
    filters: request,
    summary,
    detail,
    underAllocated: summary.filter(row => row.annual.state === 'UNDER_ALLOCATED'),
    overAllocated: summary.filter(row => row.annual.state === 'OVER_ALLOCATED'),
    unresolvedContributionMethods: detail.filter(row => row.exclusionReasons.indexOf('CONTRIBUTION_METHOD_MISSING') >= 0),
    unitMismatches: detail.filter(row => row.exclusionReasons.indexOf('UNIT_MISMATCH') >= 0),
    pendingContributions: detail.filter(row => row.allocationDisposition === 'PENDING_DISPLAY_ONLY'),
    issues: issues.sort((left, right) => `${left.kpiId}|${left.contributionKey || ''}|${left.code}`
      .localeCompare(`${right.kpiId}|${right.contributionKey || ''}|${right.code}`)),
    reportingMembershipState,
    officialActualSeparation: {
      planningCoverageSource: 'approved Workplan targets',
      officialActualSource: 'authoritative organisation-level KPI data source',
      employeeActualsSummed: false,
      productionActualWritesPerformed: false
    }
  };
};

const targets = (annual: number | null, q1: number | null, q2: number | null, q3: number | null, q4: number | null): ICoverageTargets =>
  ({ annual, q1, q2, q3, q4 });

const syntheticKpi = (
  kpiId: string,
  method: ContributionMethod,
  target: ICoverageTargets,
  unit: string,
  memberships: ReportingMembership[]
): IStrategicCoreCoverageKpi => ({
  kpiId,
  wording: kpiId === 'SC-SCHOOLS-200' ? 'Number of schools engaged through DEMO programmes' : `Synthetic ${kpiId} planning coverage`,
  pillar: kpiId === 'SC-SCHOOLS-200' ? 'Participation' : 'Community',
  workstream: kpiId === 'SC-SCHOOLS-200' ? 'Schools' : 'Delivery',
  performanceYear: 2027,
  lifecycleStatus: 'Active',
  coverageMethod: method,
  organisationTargets: target,
  unit,
  reportingMembership: memberships,
  officialActualValue: kpiId === 'SC-SCHOOLS-200' ? 72 : null,
  officialActualUnit: unit,
  officialActualSourceKey: kpiId === 'SC-SCHOOLS-200' ? 'ORG-ACTUAL|SC-SCHOOLS-200|2027|Q1' : '',
  officialActualSourceStatus: kpiId === 'SC-SCHOOLS-200' ? 'Authoritative' : 'Unavailable'
});

const syntheticContribution = (
  contributionKey: string,
  kpiId: string,
  personKey: string,
  role: WorkplanCoverageRole,
  method: ContributionMethod | null,
  contributionTargets: ICoverageTargets,
  unit: string,
  managerApprovalStatus: ManagerApprovalStatus = 'Approved',
  workplanStatus: WorkplanStatus = 'ManagerApproved',
  overrides: Partial<IWorkplanContributionInput> = {}
): IWorkplanContributionInput => ({
  contributionKey, kpiId, performanceYear: 2027, itemScope: 'StrategicCore', personKey,
  personDisplayName: `Synthetic ${personKey}`, managerKey: personKey <= 'P-C' ? 'M-01' : 'M-02',
  managerDisplayName: personKey <= 'P-C' ? 'Synthetic Manager North' : 'Synthetic Manager South',
  teamKey: personKey <= 'P-C' ? 'TEAM-NORTH' : 'TEAM-SOUTH',
  teamDisplayName: personKey <= 'P-C' ? 'Synthetic North Team' : 'Synthetic South Team',
  workplanKey: `WP|2027|${personKey}`, workplanStatus, managerApprovalStatus, role,
  contributionMethod: method, directContributionEligible: method === 'Additive',
  nonOverlapRequired: method === 'Additive', nonOverlapApproved: method === 'Additive',
  contributionTargets, unit,
  annualCommitment: method === 'CompletionOversight' ? 'Provide governance oversight for the annual delivery plan.' : '',
  q1Commitment: method === 'CompletionOversight' ? 'Confirm Q1 delivery controls.' : '',
  q2Commitment: method === 'CompletionOversight' ? 'Review Q2 delivery evidence.' : '',
  q3Commitment: method === 'CompletionOversight' ? 'Challenge Q3 recovery plans.' : '',
  q4Commitment: method === 'CompletionOversight' ? 'Sign off year-end evidence.' : '',
  what100PercentLooksLike: method === 'CompletionOversight'
    ? 'All four governance reviews completed with documented actions.' : '',
  employeeCompletionPercent: method === 'CompletionOversight' ? 75 : null,
  calculatedEmployeeRag: method === 'CompletionOversight' ? 'Amber' : null,
  employeeActualValue: method === 'Additive' ? Math.round((contributionTargets.q1 || 0) * 0.9) : null,
  employeeActualUnit: method === 'Additive' ? unit : '',
  officialActualAggregationPermitted: false,
  effectiveFrom: '2026-11-01', effectiveTo: '2027-10-31',
  approvalTimestamp: managerApprovalStatus === 'Approved' ? '2026-10-31T12:00:00Z' : '',
  version: 1, sourceReference: `SYNTHETIC|${contributionKey}|v1`,
  auditCreatedAt: '2026-10-01T09:00:00Z', auditCreatedBy: 'synthetic.coverage.fixture@example.invalid',
  auditUpdatedAt: '2026-10-31T12:00:00Z', auditUpdatedBy: 'synthetic.coverage.fixture@example.invalid',
  ...overrides
});

export const buildStrategicCoreCoverageUatSource = (): IStrategicCoreCoverageSource => ({
  contractVersion: STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION,
  performanceYear: 2027,
  asOfDate: '2026-11-01',
  membershipDefinitions: [
    { code: 'CORE_CWOP', lifecycle: 'Current', configured: true, approvalStatus: 'Approved', effectiveFrom: '2026-11-01', effectiveTo: '2027-10-31' },
    { code: 'LONDON_CITIES_CWOP', lifecycle: 'Current', configured: true, approvalStatus: 'Approved', effectiveFrom: '2026-11-01', effectiveTo: '2027-10-31' },
    { code: 'WOMEN_GIRLS_CWOP', lifecycle: 'Current', configured: true, approvalStatus: 'Approved', effectiveFrom: '2026-11-01', effectiveTo: '2027-10-31' },
    { code: 'CWSP', lifecycle: 'Current', configured: true, approvalStatus: 'Approved', effectiveFrom: '2026-11-01', effectiveTo: '2027-10-31' },
    { code: 'EDI_CWOP', lifecycle: 'Future', configured: false, approvalStatus: 'Unconfigured', effectiveFrom: '', effectiveTo: '' }
  ],
  kpis: [
    syntheticKpi('SC-SCHOOLS-200', 'Additive', targets(200, 50, 50, 50, 50), 'schools', ['CORE_CWOP', 'LONDON_CITIES_CWOP']),
    syntheticKpi('SC-EXACT-100', 'Additive', targets(100, 25, 25, 25, 25), 'sessions', ['CORE_CWOP']),
    syntheticKpi('SC-OVER-50', 'Additive', targets(50, 10, 10, 15, 15), 'clubs', ['WOMEN_GIRLS_CWOP']),
    syntheticKpi('SC-UNIT-100', 'Additive', targets(100, 25, 25, 25, 25), 'sessions', ['CORE_CWOP']),
    syntheticKpi('SC-SHARED-80', 'SharedTarget', targets(80, 80, 80, 80, 80), 'percent', ['CWSP']),
    syntheticKpi('SC-PERCENT-75', 'WeightedDenominator', targets(75, 75, 75, 75, 75), 'percent', ['CWSP']),
    syntheticKpi('SC-UNRESOLVED-40', 'Additive', targets(40, 10, 10, 10, 10), 'participants', []),
    syntheticKpi('SC-OVERLAP-30', 'Additive', targets(30, 6, 8, 8, 8), 'participants', ['CORE_CWOP']),
    syntheticKpi('SC-ZERO', 'Additive', targets(0, 0, 0, 0, 0), 'sessions', ['CORE_CWOP']),
    syntheticKpi('SC-MISSING-TARGET', 'Additive', targets(null, null, null, null, null), 'clubs', ['CORE_CWOP'])
  ],
  contributions: [
    syntheticContribution('COV-001', 'SC-SCHOOLS-200', 'P-A', 'DeliveryLead', 'Additive', targets(30, 8, 8, 7, 7), 'schools'),
    syntheticContribution('COV-002', 'SC-SCHOOLS-200', 'P-B', 'Contributor', 'Additive', targets(25, 6, 6, 6, 7), 'schools'),
    syntheticContribution('COV-003', 'SC-SCHOOLS-200', 'P-C', 'Contributor', 'Additive', targets(20, 5, 5, 5, 5), 'schools', 'Pending', 'Submitted'),
    syntheticContribution('COV-004', 'SC-SCHOOLS-200', 'P-D', 'Oversight', 'CompletionOversight', targets(null, null, null, null, null), '', 'Approved', 'ManagerApproved', { directContributionEligible: false, nonOverlapRequired: false, nonOverlapApproved: false }),
    syntheticContribution('COV-005', 'SC-SCHOOLS-200', 'P-E', 'AccountableOwner', 'AccountableOwner', targets(null, null, null, null, null), '', 'Approved', 'ManagerApproved', { directContributionEligible: false, nonOverlapRequired: false, nonOverlapApproved: false }),
    syntheticContribution('COV-006', 'SC-SCHOOLS-200', 'P-F', 'AccountableOwner', 'Additive', targets(15, 4, 4, 3, 4), 'schools'),
    syntheticContribution('COV-007', 'SC-EXACT-100', 'P-G', 'DeliveryLead', 'Additive', targets(60, 15, 15, 15, 15), 'sessions'),
    syntheticContribution('COV-008', 'SC-EXACT-100', 'P-H', 'Contributor', 'Additive', targets(40, 10, 10, 10, 10), 'sessions'),
    syntheticContribution('COV-009', 'SC-OVER-50', 'P-I', 'Contributor', 'Additive', targets(60, 15, 15, 15, 15), 'clubs'),
    syntheticContribution('COV-010', 'SC-UNIT-100', 'P-J', 'Contributor', 'Additive', targets(30, 5, 10, 10, 5), 'schools'),
    syntheticContribution('COV-011', 'SC-SHARED-80', 'P-K', 'DeliveryLead', 'SharedTarget', targets(80, 80, 80, 80, 80), 'percent', 'Approved', 'ManagerApproved', { directContributionEligible: false, nonOverlapRequired: false, nonOverlapApproved: false }),
    syntheticContribution('COV-012', 'SC-PERCENT-75', 'P-L', 'Contributor', 'WeightedDenominator', targets(70, 70, 72, 75, 75), 'percent', 'Approved', 'ManagerApproved', { directContributionEligible: false, nonOverlapRequired: false, nonOverlapApproved: false }),
    syntheticContribution('COV-013', 'SC-UNRESOLVED-40', 'P-M', 'Contributor', null, targets(20, 5, 5, 5, 5), 'participants'),
    syntheticContribution('COV-014', 'SC-OVERLAP-30', 'P-N', 'Contributor', 'Additive', targets(20, 4, 6, 5, 5), 'participants', 'Approved', 'ManagerApproved', { nonOverlapApproved: false }),
    syntheticContribution('COV-015', 'SC-OVERLAP-30', 'P-O', 'Contributor', 'Additive', targets(10, 2, 2, 3, 3), 'participants'),
    syntheticContribution('COV-016', 'SC-ZERO', 'P-P', 'Contributor', 'Additive', targets(0, 0, 0, 0, 0), 'sessions'),
    syntheticContribution('COV-017', 'SC-MISSING-TARGET', 'P-Q', 'Contributor', 'Additive', targets(null, null, null, null, null), 'clubs'),
    syntheticContribution('COV-018', 'SC-SCHOOLS-200', 'P-R', 'Contributor', 'Additive', targets(50, 10, 15, 15, 10), 'schools', 'Approved', 'Archived'),
    syntheticContribution('COV-019', 'SC-SCHOOLS-200', 'P-S', 'Contributor', 'Additive', targets(10, 2, 3, 3, 2), 'schools', 'Approved', 'ManagerApproved', { performanceYear: 2026 }),
    syntheticContribution('COV-020', 'SC-SCHOOLS-200', 'P-T', 'Contributor', 'Additive', targets(10, 2, 3, 3, 2), 'schools', 'Approved', 'ManagerApproved', { itemScope: 'Personal' }),
    syntheticContribution('COV-021', 'SC-SCHOOLS-200', 'P-U', 'EvidenceProvider', 'CompletionOversight', targets(null, null, null, null, null), '', 'Approved', 'ManagerApproved', { itemScope: 'Behaviour', directContributionEligible: false, nonOverlapRequired: false, nonOverlapApproved: false })
  ]
});

export const reconcileStrategicCoreCoverageUat = (feed: IStrategicCoreCoverageFeed): string[] => {
  const school = feed.summary.filter(row => row.kpiId === 'SC-SCHOOLS-200')[0];
  const exact = feed.summary.filter(row => row.kpiId === 'SC-EXACT-100')[0];
  const over = feed.summary.filter(row => row.kpiId === 'SC-OVER-50')[0];
  const failures: string[] = [];
  const check = (condition: boolean, message: string): void => { if (!condition) failures.push(message); };
  check(feed.contractVersion === STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION, 'Contract version mismatch');
  check(feed.contractValid, 'Source contract must be exact');
  check(school?.annual.organisationTarget === 200, 'Schools organisation target must be 200');
  check(school?.annual.approvedContribution === 70, 'Schools approved contribution must be 70');
  check(school?.annual.pendingContribution === 20, 'Schools pending contribution must be 20');
  check(school?.annual.coveragePercent === 35, 'Schools coverage must be 35%');
  check(school?.annual.gap === 130, 'Schools gap must be 130');
  check(school?.directContributors === 3, 'Schools direct contributors must be 3');
  check(school?.oversightPeople === 1, 'Schools oversight count must be 1');
  check(school?.accountableOwners === 2, 'Schools accountable owners must be 2');
  check(exact?.annual.state === 'COVERED' && exact.annual.coveragePercent === 100, 'Exact scenario must be covered at 100%');
  check(over?.annual.state === 'OVER_ALLOCATED' && over.annual.coveragePercent === 120, 'Over scenario must be 120%');
  check(feed.unitMismatches.length === 1, 'Exactly one unit mismatch is required');
  check(feed.unresolvedContributionMethods.length === 1, 'Exactly one unresolved method is required');
  check(feed.pendingContributions.length === 1, 'Exactly one pending contribution is required');
  check(feed.detail.filter(row => (row.contributionKey === 'COV-020' || row.contributionKey === 'COV-021')
    && row.includedInNumericalCoverage === 'YES').length === 0, 'Personal and Behaviour rows must never enter coverage');
  check(feed.officialActualSeparation.employeeActualsSummed === false, 'Employee Actuals must not be summed');
  check(school?.officialActualValue === 72, 'Schools Official Actual must remain 72');
  check(school?.officialActualSourceKey === 'ORG-ACTUAL|SC-SCHOOLS-200|2027|Q1', 'Official Actual source key mismatch');
  check(school?.officialActualSourceStatus === 'Authoritative', 'Official Actual source status mismatch');
  check(school?.officialActualDerivedFromEmployeeActuals === false, 'Official Actual must not be derived from employee Actuals');
  return failures;
};
