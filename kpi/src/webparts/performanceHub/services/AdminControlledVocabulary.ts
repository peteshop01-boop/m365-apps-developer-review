import type { KpiDataQualityIssueCode, KpiDataQualityStatus } from './KpiDataQuality';

export const ADMIN_KPI_REMEDIATION_EVENT_TYPE = 'KpiRemediated' as const;

export const ADMIN_PHYSICAL_EVENT_TYPES = Object.freeze([
  'KPIDefinitionChanged',
  'AnnualTargetChanged',
  'WorkplanSubmitted',
  'WorkplanResubmitted',
  'WorkplanApproved',
  'WorkplanChangesRequested',
  'WorkplanLocked',
  'QuarterSubmitted',
  'QuarterChangesRequested',
  'QuarterApproved',
  'QuarterLocked',
  'QuarterReopened',
  'RAGOverridden',
  'ReportingMapChanged',
  'AggregationOverridden',
  'QuarterPublished',
  'AdminConfigChanged',
  'ManagerReassigned'
] as const);

/** Physical audit choices plus the one bounded ADM-003 local controlled event. */
export const ADMIN_CONTROLLED_EVENT_TYPES = Object.freeze([
  ...ADMIN_PHYSICAL_EVENT_TYPES,
  ADMIN_KPI_REMEDIATION_EVENT_TYPE
] as const);

export type AdminControlledEventType = typeof ADMIN_CONTROLLED_EVENT_TYPES[number];

export type AdminControlledKpiIssueType =
  | 'ScoringMetadata'
  | 'TargetConfiguration'
  | 'OwnerResolution'
  | 'OrganisationalWeighting'
  | 'ManagerRelationship'
  | 'TeamConfiguration'
  | 'ReportingReadiness';

export const ADMIN_KPI_CONTROLLED_SOURCE_ISSUE_CODES: readonly KpiDataQualityIssueCode[] = Object.freeze([
  'TBC_SCORING_DIRECTION',
  'TBC_METRIC_TYPE',
  'MISSING_TARGET',
  'MISSING_PERCENTAGE_SOURCE_SCALE',
  'MISSING_LOWER_BASELINE',
  'INVALID_LOWER_CONFIGURATION',
  'MISSING_MILESTONE_MAP',
  'INCOMPLETE_SCORE_CONFIGURATION',
  'INCOMPLETE_TARGET_RANGE_CONFIGURATION',
  'MISSING_UNIT_LABEL',
  'UNKNOWN_OWNER_CODE',
  'MISSING_HISTORIC_TARGET',
  'MISSING_ORGANISATIONAL_WEIGHT'
]);

export const ADMIN_KPI_CONTROLLED_ISSUE_STATUSES: readonly KpiDataQualityStatus[] = Object.freeze([
  'Open', 'ControlDecisionRequired', 'SourceDataRequired', 'IntentionallyTBC'
]);

export const adminKpiIssueTypeForCode = (
  code: KpiDataQualityIssueCode
): AdminControlledKpiIssueType => {
  if (code === 'UNKNOWN_OWNER_CODE') return 'OwnerResolution';
  if (code === 'MISSING_TARGET' || code === 'MISSING_HISTORIC_TARGET') return 'TargetConfiguration';
  if (code === 'MISSING_ORGANISATIONAL_WEIGHT') return 'OrganisationalWeighting';
  if (code === 'MISSING_UNIT_LABEL') return 'ReportingReadiness';
  return 'ScoringMetadata';
};

export const ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE: Readonly<
Partial<Record<AdminControlledKpiIssueType, readonly string[]>>
> = Object.freeze({
  ScoringMetadata: Object.freeze([
    'measureType',
    'direction',
    'aggregationMethod',
    'scoringPolicyApproved',
    'scoringPolicyReference',
    'scoringMetadataIssues'
  ]),
  OwnerResolution: Object.freeze(['owner']),
  ReportingReadiness: Object.freeze(['unit', 'reportingStatus'])
});

/** Exact canonical contract: UTC, millisecond precision and no alternate offset/form. */
export const isCanonicalUtcTimestamp = (value: unknown): value is string => {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};
