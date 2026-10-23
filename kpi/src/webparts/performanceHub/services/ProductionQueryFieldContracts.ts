/**
 * Physical SharePoint field contract for production employee queries.
 *
 * `requiredFields` includes fields used by $select, $filter and $orderby. A
 * missing required field is a real data-foundation error and must fail loudly.
 * `optionalFields` are deliberately excluded from the core employee read path;
 * they may only be introduced through a separately guarded optional read.
 */
export interface IProductionQueryFieldContract {
  listTitle: string;
  requiredFields: readonly string[];
  optionalFields: readonly string[];
}

export const PRODUCTION_QUERY_FIELD_CONTRACTS = {
  people: {
    listTitle: 'KCFKPI_People',
    requiredFields: [
      'Id', 'PersonKey', 'Title', 'Email', 'ManagerPersonKey', 'ManagerEmail',
      'Team', 'JobRole', 'AppRoles', 'Active'
    ],
    optionalFields: ['BehaviourFrameworkVersionV2', 'BehaviourRoleTierV2', 'BehaviourCadenceV2']
  },
  teams: {
    listTitle: 'KCFKPI_Teams',
    requiredFields: [
      'Id', 'TeamKey', 'TeamName', 'TeamLeadPersonKey', 'Active', 'SortOrder'
    ],
    optionalFields: []
  },
  kpiMaster: {
    listTitle: 'KCFKPI_KPIMaster',
    requiredFields: [
      'Id', 'KPIID', 'KPIVersionKey', 'KPIWording', 'Pillar', 'Workstream',
      'StrategyTarget', 'AccountableOwnerEmail', 'OwnerSourceCode',
      'DataQualityFlags', 'AggregationMethod', 'ScoringDirection', 'MetricType',
      'UnitLabel', 'RAGParametersJSON', 'DefinitionStatus', 'IsCurrent'
    ],
    // These organisational/reporting weights are not employee Workplan input.
    // PortfolioWeight exists physically but is unconfigured; the logical model
    // reserves KPIWeightWithinWorkstream, which is not yet a physical field.
    optionalFields: ['PortfolioWeight', 'KPIWeightWithinWorkstream']
  },
  annualTargets: {
    listTitle: 'KCFKPI_AnnualTargets',
    requiredFields: [
      'Id', 'KPIID', 'TargetVersionKey', 'PerformanceYear', 'TargetStatus',
      'IsCurrent', 'YearEndTargetValue', 'YearEndTargetText', 'Q1TargetValue',
      'Q1TargetText', 'Q2TargetValue', 'Q2TargetText', 'Q3TargetValue',
      'Q3TargetText', 'Q4TargetValue', 'Q4TargetText'
    ],
    optionalFields: []
  },
  behaviours: {
    listTitle: 'KCFKPI_Behaviours',
    requiredFields: [
      'Id', 'BehaviourID', 'BehaviourVersionKey', 'Title', 'Description',
      'AssessmentGuidance', 'DefaultWorkplanWeight', 'DisplayOrder', 'Status',
      'IsCurrent'
    ],
    optionalFields: []
  },
  behaviourObjectiveLibrary: {
    listTitle: 'KCFKPI_BehaviourObjectiveLibrary',
    requiredFields: [
      'Id', 'BehaviourObjectiveKey', 'BehaviourKey', 'ObjectiveTitle',
      'ObjectiveDescription', 'SuggestedMeasure', 'SuggestedUnit',
      'SuggestedEvidence', 'Active', 'SortOrder', 'EffectiveFrom', 'EffectiveTo'
    ],
    optionalFields: []
  },
  workplans: {
    listTitle: 'KCFKPI_Workplans',
    requiredFields: [
      'Id', 'WorkplanKey', 'PersonKey', 'EmployeeDisplayName', 'EmployeeEmail',
      'PerformanceYear', 'ManagerPersonKey', 'ManagerDisplayName', 'ManagerEmail',
      'State', 'AccessState', 'TransitionStatus', 'TransitionCorrelationKey',
      'CoreCategoryWeight', 'PersonalCategoryWeight', 'BehaviourCategoryWeight',
      'CategoryWeightingReason',
      'SubmittedAt', 'SubmittedByEmail', 'ManagerDecisionComment', 'ApprovedAt',
      'ApprovedByEmail', 'LockedAt', 'LockedByEmail', 'RowVersionToken'
    ],
    optionalFields: []
  },
  workplanItems: {
    listTitle: 'KCFKPI_WorkplanItems',
    requiredFields: [
      'Id', 'WorkplanItemKey', 'WorkplanItemNaturalKey', 'WorkplanKey',
      'PersonKey', 'PerformanceYear', 'ItemType', 'KPIID', 'KPIVersionKey',
      'TargetVersionKey', 'CoreWorkplanWeight', 'EmployeeKpiRole', 'DisplayOrder',
      'ActiveInWorkplan', 'LocalKPIWording', 'LocalMeasure', 'YearEndTargetValue',
      'YearEndTargetText', 'UnitLabel', 'PersonalItemWeight', 'BehaviourID',
      'BehaviourVersionKey', 'BehaviourItemWeight', 'LocalKPIDescription',
      'LocalMetricType', 'LocalScoringDirection', 'LocalPercentageScale',
      'LocalBaselineValue', 'Q1TargetValue', 'Q1TargetText', 'Q2TargetValue',
      'Q2TargetText', 'Q3TargetValue', 'Q3TargetText', 'Q4TargetValue',
      'Q4TargetText', 'BehaviourObjectiveKey', 'BehaviourObjectiveSource',
      'BehaviourObjectiveTitle', 'BehaviourObjectiveDescription',
      'BehaviourMeasure', 'BehaviourEvidenceDefinition',
      'Q1BehaviourTargetRating', 'Q2BehaviourTargetRating',
      'Q3BehaviourTargetRating', 'Q4BehaviourTargetRating'
    ],
    optionalFields: ['BehaviourFrameworkVersion', 'BehaviourValueTitleSnapshot',
      'BehaviourCorporateValueSnapshot', 'BehaviourRoleTierSnapshot',
      'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot',
      'BehaviourPeriodKeysSnapshotJSON', 'BehaviourRatingLabelsSnapshotJSON',
      'BehaviourCommitmentV2', 'BehaviourPeriodCommitmentsV2JSON',
      'BehaviourV2SelectedSuggestionKeysJSON', 'BehaviourPlanningContractVersion',
      'BehaviourCurrentLevelV2', 'BehaviourTargetLevelV2', 'BehaviourTargetLevelReasonV2',
      'BehaviourV2SelectionSnapshotsJSON', 'BehaviourV2SelectionSnapshotsSHA256',
      'BehaviourV2SelectionSnapshotsUtf8ByteLength']
  },
  quarterReviews: {
    listTitle: 'KCFKPI_QuarterReviews',
    requiredFields: [
      'Id', 'QuarterReviewKey', 'WorkplanKey', 'PersonKey',
      'EmployeeDisplayName', 'EmployeeEmail', 'PerformanceYear', 'Quarter',
      'ManagerPersonKey', 'ManagerDisplayName', 'ManagerEmail', 'State',
      'AccessState', 'TransitionStatus', 'TransitionCorrelationKey',
      'EmployeeSubmissionComment', 'SubmittedAt', 'SubmittedByEmail',
      'ManagerDecisionComment', 'ApprovedAt', 'ApprovedByEmail', 'LockedAt',
      'LockedByEmail', 'RowVersionToken', 'CoreCategoryWeightSnapshot',
      'PersonalCategoryWeightSnapshot', 'BehaviourCategoryWeightSnapshot',
      'WorkplanApprovalCorrelationKey'
    ],
    optionalFields: ['BehaviourFrameworkVersionSnapshot', 'BehaviourRoleTierSnapshot', 'BehaviourCadenceSnapshot']
  },
  quarterReviewItems: {
    listTitle: 'KCFKPI_QuarterReviewItems',
    requiredFields: [
      'Id', 'QuarterReviewItemKey', 'QuarterReviewKey', 'WorkplanItemKey',
      'WorkplanKey', 'PersonKey', 'PerformanceYear', 'Quarter', 'ItemType',
      'KPIID', 'KPIVersionKey', 'TargetVersionKey', 'ItemWordingSnapshot',
      'PillarSnapshot', 'WorkstreamSnapshot', 'OwnerEmailSnapshot',
      'UnitLabelSnapshot', 'QuarterTargetValue', 'QuarterTargetText',
      'EmployeeActualValue', 'EmployeeActualText', 'ProgressPct', 'CalculatedRAG',
      'CalculationRuleVersion', 'StatusUpdate', 'EvidenceCount', 'BTGAction',
      'NextReviewDate', 'QuarterEndForecastValue', 'QuarterEndForecastText',
      'ManagerComment', 'ManagerOverrideRAG', 'OverrideReason', 'OverrideByEmail',
      'OverrideAt', 'FinalRAG', 'ContributionWeightSnapshot', 'ManagerApproved',
      'Locked', 'BTGRoute', 'BTGOwnerPersonKey', 'BTGDueDate', 'BTGStatus',
      'BTGExpectedReturnToGreenDate', 'BTGExpectedReducedOutcome',
      'ReforecastProposedTarget', 'ReforecastProposedDate', 'ReforecastReason',
      'ReforecastApprovalStatus', 'EscalationDependency', 'EscalatedTo',
      'EscalationTargetDecisionDate', 'BehaviourExamples',
      'ManagerBehaviourAssessment', 'ItemDescriptionSnapshot', 'MeasureSnapshot',
      'MetricTypeSnapshot', 'ScoringDirectionSnapshot', 'PercentageScaleSnapshot',
      'BaselineValueSnapshot', 'YearEndTargetValueSnapshot',
      'YearEndTargetTextSnapshot', 'WorkplanItemWeightSnapshot',
      'BehaviourIDSnapshot', 'BehaviourVersionKeySnapshot',
      'BehaviourTitleSnapshot', 'BehaviourDescriptionSnapshot',
      'BehaviourGuidanceSnapshot', 'BehaviourObjectiveKeySnapshot',
      'BehaviourObjectiveTitleSnapshot',
      'BehaviourObjectiveSourceSnapshot', 'BehaviourEvidenceDefSnapshot',
      'BehaviourTargetRating',
      'EmployeeBehaviourRating', 'ManagerBehaviourRating', 'FinalBehaviourRating'
    ],
    optionalFields: ['BehaviourFrameworkVersionSnapshot', 'BehaviourValueTitleSnapshot',
      'BehaviourCorporateValueSnapshot', 'BehaviourRoleTierSnapshot',
      'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot',
      'BehaviourPeriodKeysSnapshotJSON', 'BehaviourPeriodSnapshot',
      'BehaviourRatingLabelsSnapshotJSON', 'EmployeeBehaviourEvidenceV2',
      'EmployeeBehaviourAssessmentV2', 'ManagerBehaviourEvidenceV2',
      'ManagerBehaviourAssessmentV2', 'FinalBehaviourEvidenceV2',
      'FinalBehaviourAssessmentV2',
      'BehaviourAnnualTargetLevelV2', 'BehaviourAnnualTargetJustificationV2',
      'BehaviourAnnualTargetSourceWorkplanItemKeyV2', 'BehaviourAnnualTargetSourceEtagV2',
      'BehaviourAnnualTargetSourceWorkplanVersionV2', 'BehaviourAnnualTargetSourceApprovalKeyV2']
  },
  config: {
    listTitle: 'KCFKPI_Config',
    requiredFields: [
      'Id', 'ConfigKey', 'ValueType', 'TextValue', 'NumberValue', 'BooleanValue',
      'DateValue', 'JSONValue', 'Environment', 'Active', 'ChangeReference', 'Modified', 'Editor'
    ],
    optionalFields: []
  }
} as const satisfies Record<string, IProductionQueryFieldContract>;

export type ProductionQueryListKey = keyof typeof PRODUCTION_QUERY_FIELD_CONTRACTS;

export const PRODUCTION_QUERY_LIST_KEYS: readonly ProductionQueryListKey[] = [
  'people', 'teams', 'kpiMaster', 'annualTargets', 'behaviours', 'behaviourObjectiveLibrary', 'workplans',
  'workplanItems', 'quarterReviews', 'quarterReviewItems', 'config'
];

const CONTRACTS_BY_TITLE = new Map<string, IProductionQueryFieldContract>(
  PRODUCTION_QUERY_LIST_KEYS.map(key => {
    const contract: IProductionQueryFieldContract = PRODUCTION_QUERY_FIELD_CONTRACTS[key];
    return [contract.listTitle, contract] as [string, IProductionQueryFieldContract];
  })
);

const fields = (...names: string[]): readonly string[] => names;

function requiredSelect(listKey: ProductionQueryListKey, names: readonly string[]): string {
  const contract = PRODUCTION_QUERY_FIELD_CONTRACTS[listKey];
  const required: readonly string[] = contract.requiredFields;
  const unclassified = names.filter(name => required.indexOf(name) < 0);
  if (unclassified.length) {
    throw new Error(`${contract.listTitle} required select contains unclassified field(s): ${unclassified.join(', ')}.`);
  }
  return names.join(',');
}
function boundedOptionalSelect(listKey: ProductionQueryListKey, names: readonly string[]): string {
  const contract = PRODUCTION_QUERY_FIELD_CONTRACTS[listKey];
  const allowed = new Set<string>([...(contract.requiredFields || []), ...(contract.optionalFields || [])]);
  const unclassified = names.filter(name => !allowed.has(name));
  if (unclassified.length) throw new Error(`${contract.listTitle} optional select contains unclassified field(s): ${unclassified.join(', ')}.`);
  return names.join(',');
}

export const PEOPLE_SELECT = requiredSelect('people', fields(
  'Id', 'PersonKey', 'Title', 'Email', 'ManagerPersonKey', 'ManagerEmail', 'Team',
  'JobRole', 'AppRoles', 'Active'
));

export const ADMIN_TEAMS_SELECT = requiredSelect('teams', fields(
  'Id', 'TeamKey', 'TeamName', 'TeamLeadPersonKey', 'Active', 'SortOrder'
));

export const CONFIG_SELECT = requiredSelect('config', fields(
  'Id', 'ConfigKey', 'ValueType', 'TextValue', 'NumberValue', 'BooleanValue',
  'DateValue', 'JSONValue', 'Environment', 'Active', 'ChangeReference'
));

export const KPI_MASTER_COUNT_SELECT = requiredSelect('kpiMaster', fields('Id', 'IsCurrent'));
export const KPI_MASTER_CATALOGUE_SELECT = requiredSelect('kpiMaster', fields(
  'KPIID', 'KPIVersionKey', 'KPIWording', 'Pillar', 'Workstream',
  'StrategyTarget', 'AccountableOwnerEmail', 'OwnerSourceCode',
  'DataQualityFlags', 'AggregationMethod', 'ScoringDirection', 'MetricType',
  'UnitLabel', 'RAGParametersJSON'
));

export const ANNUAL_TARGET_COUNT_SELECT = requiredSelect('annualTargets', fields('Id', 'IsCurrent'));
export const ANNUAL_TARGET_CATALOGUE_SELECT = requiredSelect('annualTargets', fields(
  'KPIID', 'TargetVersionKey', 'YearEndTargetValue', 'YearEndTargetText',
  'Q1TargetValue', 'Q1TargetText', 'Q2TargetValue', 'Q2TargetText',
  'Q3TargetValue', 'Q3TargetText', 'Q4TargetValue', 'Q4TargetText'
));

export const BEHAVIOUR_COUNT_SELECT = requiredSelect('behaviours', fields('Id', 'IsCurrent'));
export const BEHAVIOUR_CATALOGUE_SELECT = requiredSelect('behaviours', fields(
  'BehaviourID', 'BehaviourVersionKey', 'Title', 'Description',
  'AssessmentGuidance', 'DefaultWorkplanWeight', 'DisplayOrder', 'IsCurrent'
));
export const BEHAVIOUR_OBJECTIVE_LIBRARY_SELECT = requiredSelect('behaviourObjectiveLibrary', fields(
  'Id', 'BehaviourObjectiveKey', 'BehaviourKey', 'ObjectiveTitle',
  'ObjectiveDescription', 'SuggestedMeasure', 'SuggestedUnit',
  'SuggestedEvidence', 'Active', 'SortOrder', 'EffectiveFrom', 'EffectiveTo'
));

export const WORKPLAN_STATUS_SELECT = requiredSelect('workplans', fields('Id', 'State'));
export const WORKPLAN_SELECT = requiredSelect('workplans', fields(
  'Id', 'WorkplanKey', 'PersonKey', 'EmployeeDisplayName', 'EmployeeEmail',
  'PerformanceYear', 'ManagerPersonKey', 'ManagerDisplayName', 'ManagerEmail',
  'State', 'AccessState', 'TransitionStatus', 'TransitionCorrelationKey',
  'CoreCategoryWeight', 'PersonalCategoryWeight', 'BehaviourCategoryWeight',
  'CategoryWeightingReason',
  'SubmittedAt', 'SubmittedByEmail', 'ManagerDecisionComment', 'ApprovedAt',
  'ApprovedByEmail', 'LockedAt', 'LockedByEmail', 'RowVersionToken'
));

export const CORE_ITEM_SELECT = requiredSelect('workplanItems', fields(
  'Id', 'WorkplanItemKey', 'WorkplanItemNaturalKey', 'WorkplanKey', 'PersonKey',
  'PerformanceYear', 'KPIID', 'KPIVersionKey', 'TargetVersionKey',
  'CoreWorkplanWeight', 'EmployeeKpiRole', 'DisplayOrder', 'ActiveInWorkplan'
));
export const PERSONAL_ITEM_SELECT = requiredSelect('workplanItems', fields(
  'Id', 'WorkplanItemKey', 'WorkplanItemNaturalKey', 'WorkplanKey', 'PersonKey',
  'PerformanceYear', 'LocalKPIWording', 'LocalMeasure', 'YearEndTargetValue',
  'YearEndTargetText', 'UnitLabel', 'PersonalItemWeight', 'LocalKPIDescription',
  'LocalMetricType', 'LocalScoringDirection', 'LocalPercentageScale',
  'LocalBaselineValue', 'Q1TargetValue', 'Q1TargetText', 'Q2TargetValue',
  'Q2TargetText', 'Q3TargetValue', 'Q3TargetText', 'Q4TargetValue',
  'Q4TargetText', 'DisplayOrder',
  'ActiveInWorkplan'
));
export const BEHAVIOUR_ITEM_SELECT = requiredSelect('workplanItems', fields(
  'Id', 'WorkplanItemKey', 'WorkplanItemNaturalKey', 'WorkplanKey', 'PersonKey',
  'PerformanceYear', 'BehaviourID', 'BehaviourVersionKey', 'BehaviourItemWeight',
  'BehaviourObjectiveKey', 'BehaviourObjectiveSource', 'BehaviourObjectiveTitle',
  'BehaviourObjectiveDescription', 'BehaviourMeasure', 'UnitLabel',
  'BehaviourEvidenceDefinition', 'Q1TargetText', 'Q2TargetText', 'Q3TargetText',
  'Q4TargetText', 'Q1BehaviourTargetRating', 'Q2BehaviourTargetRating',
  'Q3BehaviourTargetRating', 'Q4BehaviourTargetRating', 'DisplayOrder',
  'ActiveInWorkplan'
));
export const BEHAVIOUR_V2_ITEM_SELECT = boundedOptionalSelect('workplanItems', fields(
  ...BEHAVIOUR_ITEM_SELECT.split(','),
  'BehaviourFrameworkVersion', 'BehaviourValueTitleSnapshot', 'BehaviourCorporateValueSnapshot',
  'BehaviourRoleTierSnapshot', 'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot',
  'BehaviourPeriodKeysSnapshotJSON', 'BehaviourRatingLabelsSnapshotJSON',
  'BehaviourCommitmentV2', 'BehaviourPeriodCommitmentsV2JSON',
  'BehaviourPlanningContractVersion', 'BehaviourCurrentLevelV2', 'BehaviourTargetLevelV2',
  'BehaviourTargetLevelReasonV2', 'BehaviourV2SelectedSuggestionKeysJSON',
  'BehaviourV2SelectionSnapshotsJSON', 'BehaviourV2SelectionSnapshotsSHA256',
  'BehaviourV2SelectionSnapshotsUtf8ByteLength'
));
export const WORKPLAN_ASSIGNMENT_SELECT = requiredSelect('workplanItems', fields(
  'Id', 'WorkplanItemKey', 'WorkplanKey', 'PersonKey', 'ItemType', 'KPIID',
  'KPIVersionKey', 'TargetVersionKey', 'BehaviourID', 'CoreWorkplanWeight',
  'PersonalItemWeight', 'BehaviourItemWeight', 'ActiveInWorkplan'
));

export const QUARTER_REVIEW_SELECT = requiredSelect('quarterReviews', fields(
  'Id', 'QuarterReviewKey', 'WorkplanKey', 'PersonKey', 'EmployeeDisplayName',
  'EmployeeEmail', 'PerformanceYear', 'Quarter', 'ManagerPersonKey',
  'ManagerDisplayName', 'ManagerEmail', 'State', 'AccessState',
  'TransitionStatus', 'TransitionCorrelationKey', 'EmployeeSubmissionComment',
  'SubmittedAt', 'SubmittedByEmail', 'ManagerDecisionComment', 'ApprovedAt',
  'ApprovedByEmail', 'LockedAt', 'LockedByEmail', 'RowVersionToken',
  'CoreCategoryWeightSnapshot', 'PersonalCategoryWeightSnapshot',
  'BehaviourCategoryWeightSnapshot', 'WorkplanApprovalCorrelationKey'
));

const QUARTER_ITEM_BASE_FIELDS = fields(
  'Id', 'QuarterReviewItemKey', 'QuarterReviewKey', 'WorkplanItemKey',
  'WorkplanKey', 'PersonKey', 'PerformanceYear', 'Quarter', 'ItemType', 'KPIID',
  'KPIVersionKey', 'TargetVersionKey', 'ItemWordingSnapshot', 'PillarSnapshot',
  'WorkstreamSnapshot', 'OwnerEmailSnapshot', 'UnitLabelSnapshot',
  'QuarterTargetValue', 'QuarterTargetText', 'EmployeeActualValue',
  'EmployeeActualText', 'ProgressPct', 'CalculatedRAG', 'CalculationRuleVersion',
  'StatusUpdate', 'EvidenceCount', 'BTGAction', 'NextReviewDate',
  'QuarterEndForecastValue', 'QuarterEndForecastText', 'ManagerComment',
  'ManagerOverrideRAG', 'OverrideReason', 'OverrideByEmail', 'OverrideAt',
  'FinalRAG', 'ContributionWeightSnapshot', 'ManagerApproved', 'Locked',
  'ItemDescriptionSnapshot', 'MeasureSnapshot', 'MetricTypeSnapshot',
  'ScoringDirectionSnapshot', 'PercentageScaleSnapshot', 'BaselineValueSnapshot',
  'YearEndTargetValueSnapshot', 'YearEndTargetTextSnapshot',
  'WorkplanItemWeightSnapshot', 'BehaviourIDSnapshot',
  'BehaviourVersionKeySnapshot', 'BehaviourTitleSnapshot',
  'BehaviourDescriptionSnapshot', 'BehaviourGuidanceSnapshot',
  'BehaviourObjectiveKeySnapshot', 'BehaviourObjectiveTitleSnapshot',
  'BehaviourObjectiveSourceSnapshot',
  'BehaviourEvidenceDefSnapshot', 'BehaviourTargetRating',
  'EmployeeBehaviourRating', 'ManagerBehaviourRating', 'FinalBehaviourRating'
);
const QUARTER_ITEM_RECOVERY_FIELDS = fields(
  'BTGRoute', 'BTGOwnerPersonKey', 'BTGDueDate', 'BTGStatus',
  'BTGExpectedReturnToGreenDate', 'BTGExpectedReducedOutcome',
  'ReforecastProposedTarget', 'ReforecastProposedDate', 'ReforecastReason',
  'ReforecastApprovalStatus', 'EscalationDependency', 'EscalatedTo',
  'EscalationTargetDecisionDate', 'BehaviourExamples',
  'ManagerBehaviourAssessment'
);
export const QUARTER_ITEM_BASE_SELECT = requiredSelect('quarterReviewItems', QUARTER_ITEM_BASE_FIELDS);
/** Only for a separately admitted v02 physical route; legacy queries remain unchanged. */
export const QUARTER_ITEM_BEHAVIOUR_V2_SELECT = boundedOptionalSelect('quarterReviewItems', [
  ...QUARTER_ITEM_BASE_FIELDS,
  'BehaviourFrameworkVersionSnapshot', 'BehaviourValueTitleSnapshot',
  'BehaviourCorporateValueSnapshot', 'BehaviourRoleTierSnapshot',
  'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot',
  'BehaviourPeriodKeysSnapshotJSON', 'BehaviourPeriodSnapshot',
  'BehaviourRatingLabelsSnapshotJSON', 'EmployeeBehaviourEvidenceV2',
  'EmployeeBehaviourAssessmentV2', 'ManagerBehaviourEvidenceV2',
  'ManagerBehaviourAssessmentV2', 'FinalBehaviourEvidenceV2',
  'FinalBehaviourAssessmentV2',
  'BehaviourAnnualTargetLevelV2', 'BehaviourAnnualTargetJustificationV2',
  'BehaviourAnnualTargetSourceWorkplanItemKeyV2', 'BehaviourAnnualTargetSourceEtagV2',
  'BehaviourAnnualTargetSourceWorkplanVersionV2', 'BehaviourAnnualTargetSourceApprovalKeyV2'
]);
export const QUARTER_ITEM_RECOVERY_SELECT = requiredSelect(
  'quarterReviewItems',
  [...QUARTER_ITEM_BASE_FIELDS, ...QUARTER_ITEM_RECOVERY_FIELDS]
);

function selectedFields(select: string): string[] {
  return select.split(',').map(field => field.trim().split('/')[0]).filter(Boolean);
}

function filteredFields(filter: string): string[] {
  const result: string[] = [];
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s+(?:eq|ne|gt|ge|lt|le)\b/g;
  let match = pattern.exec(filter);
  while (match) {
    result.push(match[1]);
    match = pattern.exec(filter);
  }
  return result;
}

function orderedFields(orderBy: string): string[] {
  return orderBy.split(',').map(value => value.trim().split(/\s+/)[0]).filter(Boolean);
}

/**
 * Fail-fast developer guard. It does not hide SharePoint errors: required
 * physical-field failures still reach the caller with the normal support state.
 */
export function assertProductionQueryFields(
  listTitle: string,
  select: string,
  filter: string,
  orderBy: string
): void {
  const contract = CONTRACTS_BY_TITLE.get(listTitle);
  if (!contract) return;
  const requested = Array.from(new Set([
    ...selectedFields(select),
    ...filteredFields(filter),
    ...orderedFields(orderBy)
  ]));
  const optional = requested.filter(field => contract.optionalFields.indexOf(field) >= 0);
  if (optional.length) {
    throw new Error(`${listTitle} optional field(s) cannot be requested through the required employee query path: ${optional.join(', ')}.`);
  }
  const unknown = requested.filter(field => contract.requiredFields.indexOf(field) < 0);
  if (unknown.length) {
    throw new Error(`${listTitle} query contains field(s) outside the approved physical contract: ${unknown.join(', ')}.`);
  }
}
