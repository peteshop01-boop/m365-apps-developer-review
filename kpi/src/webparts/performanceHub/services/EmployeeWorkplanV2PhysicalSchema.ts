import type { EmployeeV2CommandType } from '../models/EmployeeWorkplanV2PersistenceModels';

export interface IEmployeeV2PhysicalAssetContract {
  listTitle: string;
  purpose: string;
  existingAsset: boolean;
  fieldsUsed: readonly string[];
  futureAdditiveFields?: readonly string[];
}

/**
 * Local design contract only. These additive fields are not provisioned by
 * this candidate and must pass a separately authorised schema/runtime gate.
 */
export const EMPLOYEE_V2_BEHAVIOUR_SELECTION_ADDITIVE_FIELDS = [
  'BehaviourSelectedSuggestionKeysJson',
  'BehaviourCustomObjective'
] as const;

export const EMPLOYEE_V2_BEHAVIOUR_FRAMEWORK_FIELDS = [
  'BehaviourFrameworkVersion', 'BehaviourValueTitleSnapshot',
  'BehaviourCorporateValueSnapshot', 'BehaviourRoleTierSnapshot',
  'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot',
  'BehaviourPeriodKeysSnapshotJSON', 'BehaviourRatingLabelsSnapshotJSON',
  'BehaviourCommitmentV2', 'BehaviourPeriodCommitmentsV2JSON',
  'BehaviourPlanningContractVersion', 'BehaviourCurrentLevelV2',
  'BehaviourTargetLevelV2', 'BehaviourTargetLevelReasonV2',
  'BehaviourV2SelectedSuggestionKeysJSON',
  'BehaviourV2SelectionSnapshotsJSON', 'BehaviourV2SelectionSnapshotsSHA256',
  'BehaviourV2SelectionSnapshotsUtf8ByteLength'
] as const;

export const EMPLOYEE_V2_BEHAVIOUR_PERIOD_FIELDS = [
  'BehaviourFrameworkVersionSnapshot', 'BehaviourValueTitleSnapshot',
  'BehaviourCorporateValueSnapshot', 'BehaviourRoleTierSnapshot',
  'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot',
  'BehaviourPeriodKeysSnapshotJSON', 'BehaviourPeriodSnapshot', 'BehaviourRatingLabelsSnapshotJSON',
  'EmployeeBehaviourEvidenceV2', 'EmployeeBehaviourAssessmentV2',
  'ManagerBehaviourEvidenceV2', 'ManagerBehaviourAssessmentV2',
  'FinalBehaviourEvidenceV2', 'FinalBehaviourAssessmentV2'
] as const;

/** Local additive contract only; these columns are not provisioned here. */
export const QUARTER_V2_ANNUAL_TARGET_SNAPSHOT_FIELDS = [
  'BehaviourAnnualTargetLevelV2', 'BehaviourAnnualTargetJustificationV2',
  'BehaviourAnnualTargetSourceWorkplanItemKeyV2', 'BehaviourAnnualTargetSourceEtagV2',
  'BehaviourAnnualTargetSourceWorkplanVersionV2', 'BehaviourAnnualTargetSourceApprovalKeyV2'
] as const;

export const EMPLOYEE_V2_BEHAVIOUR_GOVERNED_ASSETS = Object.freeze([
  {
    listTitle: 'KCFKPI_BehaviourFrameworkSets', purpose: 'Immutable published framework identity and label map.',
    existingAsset: false, fieldsUsed: ['FrameworkVersion', 'Published', 'Immutable', 'RatingLabelsJSON']
  },
  {
    listTitle: 'KCFKPI_BehaviourFrameworkValues', purpose: 'Five versioned Values and one descriptor per governed tier.',
    existingAsset: false, fieldsUsed: ['FrameworkVersion', 'ValueID', 'ValueTitle', 'CorporateValue',
      'ICOfficerDescriptor', 'PeopleManagerDescriptor', 'SeniorLeaderDescriptor']
  },
  {
    listTitle: 'KCFKPI_PersonBehaviourAssignments', purpose: 'Explicit person tier, cadence and framework assignment.',
    existingAsset: false, fieldsUsed: ['PersonKey', 'FrameworkVersion', 'RoleTier', 'Cadence', 'Active']
  }
] as const);

const commonCommandFields = [
  'Title', 'CommandKey', 'CommandType', 'SubjectType', 'SubjectKey', 'PersonKey',
  'PerformanceYear', 'Quarter', 'ExpectedRowVersionToken', 'ExpectedETag',
  'PayloadJSON', 'ClientVersion', 'ClientSubmittedAt', 'ClientCorrelationKey'
] as const;

export const EMPLOYEE_V2_WORKPLAN_ITEM_FIELDS = [
  'Title', 'WorkplanItemKey', 'WorkplanItemNaturalKey', 'WorkplanKey', 'PersonKey',
  'PerformanceYear', 'ItemType', 'KPIID', 'KPIVersionKey',
  'TargetVersionKey', 'EmployeeKpiRole', 'ContributionMethod', 'UnitLabel',
  'YearEndTargetValue', 'YearEndTargetText', 'Q1TargetValue', 'Q1TargetText',
  'Q2TargetValue', 'Q2TargetText', 'Q3TargetValue', 'Q3TargetText',
  'Q4TargetValue', 'Q4TargetText', 'Q1SuccessDefinition',
  'Q2SuccessDefinition', 'Q3SuccessDefinition', 'Q4SuccessDefinition',
  'SharedTargetRule', 'SharedApportionmentPercent',
  'ContributionGovernanceReference', 'DenominatorNumerator',
  'DenominatorValue', 'DenominatorUnit', 'DenominatorRuleReference',
  'DenominatorSourceReference', 'DirectContributionEligible',
  'ContributionApprovalState', 'AdditiveApproved', 'NonOverlapRequired',
  'NonOverlapApproved', 'ContributionEffectiveFrom',
  'ContributionEffectiveTo', 'ContributionApprovalReference',
  'ContributionApprovedAt', 'ContributionAuditReference', 'WorkplanVersion',
  'ContributionWeight', 'CoreWorkplanWeight', 'LocalKPIWording', 'LocalKPIDescription',
  'LocalMeasure', 'LocalMetricType', 'LocalScoringDirection',
  'LocalPercentageScale', 'LocalBaselineValue', 'PersonalItemWeight',
  'BehaviourID', 'BehaviourVersionKey', 'BehaviourObjectiveSource',
  'BehaviourObjectiveKey', 'BehaviourObjectiveTitle',
  'BehaviourObjectiveDescription', 'BehaviourMeasure',
  'BehaviourEvidenceDefinition', 'Q1BehaviourTargetRating',
  'Q2BehaviourTargetRating', 'Q3BehaviourTargetRating',
  'Q4BehaviourTargetRating', 'BehaviourItemWeight', 'DisplayOrder',
  'ActiveInWorkplan', 'AddedByEmail', 'AddedAt',
  ...EMPLOYEE_V2_BEHAVIOUR_FRAMEWORK_FIELDS
] as const;

export const EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES: readonly EmployeeV2CommandType[] = [
  'CreateWorkplanDraft', 'UpdateWorkplanDraft', 'UpsertWorkplanItem',
  'DeactivateWorkplanItem',
  'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2', 'UpsertPersonalItemV2',
  'UpsertBehaviourCommitmentV2', 'SetCoreWeightingV2', 'SubmitWorkplan',
  'CreateQuarterDraft', 'UpdateQuarterItem', 'UpdateQuarterItemV2',
  'SaveProgressEntry', 'RegisterEvidence', 'SubmitQuarterReview'
];

export const EMPLOYEE_V2_MANAGER_COMMAND_TYPES: readonly EmployeeV2CommandType[] = [
  'RequestWorkplanChanges', 'ApproveAndLockWorkplan', 'RequestQuarterChanges',
  'SetQuarterManagerReview', 'SetQuarterRAGOverride', 'DecideReforecast',
  'ApproveAndLockQuarter', 'CreateWorkplanAmendmentV2'
];

/**
 * Approved physical mapping only. This module performs no provisioning and
 * deliberately retains the existing canonical lists and business keys.
 */
export const EMPLOYEE_V2_PHYSICAL_ASSETS: readonly IEmployeeV2PhysicalAssetContract[] = [
  ...EMPLOYEE_V2_BEHAVIOUR_GOVERNED_ASSETS,
  {
    listTitle: 'KCFKPI_Workplans',
    purpose: 'Canonical annual header, category weighting, lifecycle and current version.',
    existingAsset: true,
    fieldsUsed: [
      'WorkplanKey', 'PersonKey', 'PerformanceYear', 'State', 'AccessState',
      'TransitionStatus', 'CoreCategoryWeight', 'PersonalCategoryWeight',
      'BehaviourCategoryWeight', 'CategoryWeightingReason', 'CoreWeightingMode',
      'WorkplanVersion', 'SubmittedAt', 'SubmittedByEmail',
      'ManagerDecisionComment', 'ApprovedAt', 'ApprovedByEmail', 'LockedAt',
      'LockedByEmail', 'RowVersionToken'
    ]
  },
  {
    listTitle: 'KCFKPI_WorkplanItems',
    purpose: 'Canonical Core, Personal and Behaviour definitions and contribution proposals.',
    existingAsset: true,
    fieldsUsed: EMPLOYEE_V2_WORKPLAN_ITEM_FIELDS,
    futureAdditiveFields: EMPLOYEE_V2_BEHAVIOUR_SELECTION_ADDITIVE_FIELDS
  },
  {
    listTitle: 'KCFKPI_QuarterReviews',
    purpose: 'Canonical quarterly lifecycle bound to the approved Workplan snapshot.',
    existingAsset: true,
    fieldsUsed: [
      'QuarterReviewKey', 'WorkplanKey', 'PersonKey', 'PerformanceYear',
      'Quarter', 'State', 'AccessState', 'TransitionStatus',
      'WorkplanApprovalCorrelationKey', 'RowVersionToken',
      'BehaviourFrameworkVersionSnapshot', 'BehaviourRoleTierSnapshot',
      'BehaviourCadenceSnapshot'
    ]
  },
  {
    listTitle: 'KCFKPI_QuarterReviewItems',
    purpose: 'Canonical employee update, calculation, Recovery and manager/final outcome.',
    existingAsset: true,
    fieldsUsed: [
      'QuarterReviewItemKey', 'QuarterReviewKey', 'WorkplanItemKey',
      'EmployeeActualValue', 'EmployeeActualText', 'StatusUpdate',
      'ContextMitigation', 'QuarterEndForecastValue', 'QuarterEndForecastText',
      'EmployeeBehaviourRating', 'BehaviourExamples', 'BTGRoute', 'BTGAction',
      'BTGOwnerPersonKey', 'BTGDueDate', 'NextReviewDate',
      'BTGExpectedReturnToGreenDate', 'BTGExpectedReducedOutcome',
      'ReforecastProposedTarget', 'ReforecastProposedDate', 'ReforecastReason',
      'EscalationDependency', 'EscalatedTo', 'EscalationTargetDecisionDate',
      'ProgressPct', 'CalculatedRAG', 'CalculationRuleVersion',
      'ManagerComment', 'ManagerOverrideRAG', 'OverrideReason',
      'OverrideByEmail', 'OverrideAt', 'FinalRAG', 'FinalBehaviourRating',
      'ManagerApproved', 'Locked', ...EMPLOYEE_V2_BEHAVIOUR_PERIOD_FIELDS,
      ...QUARTER_V2_ANNUAL_TARGET_SNAPSHOT_FIELDS
    ]
  },
  {
    listTitle: 'KCFKPI_Evidence',
    purpose: 'Evidence file/reference metadata linked to the exact quarterly item.',
    existingAsset: true,
    fieldsUsed: [
      'EvidenceKey', 'PersonKey', 'WorkplanKey', 'WorkplanItemKey',
      'QuarterReviewKey', 'QuarterReviewItemKey', 'PerformanceYear', 'Quarter',
      'EvidenceStatus', 'EvidenceDescription', 'FileRef'
    ]
  },
  {
    listTitle: 'KCFKPI_Audit',
    purpose: 'Append-only lifecycle, amendment, zero-Personal and quarterly evidence.',
    existingAsset: true,
    fieldsUsed: [
      'AuditKey', 'EventType', 'SubjectKey', 'PerformanceYear', 'Quarter',
      'ActorEmail', 'ActorRole', 'EventAt', 'Reason', 'BeforeJSON', 'AfterJSON',
      'CorrelationKey', 'Source', 'SourceReference', 'Success'
    ]
  },
  {
    listTitle: 'KCFKPI_EmployeeCommands',
    purpose: 'SEC-002B typed employee command intake; no canonical human write.',
    existingAsset: false,
    fieldsUsed: commonCommandFields
  },
  {
    listTitle: 'KCFKPI_ManagerCommands',
    purpose: 'SEC-002B typed manager/system command intake; no canonical human write.',
    existingAsset: false,
    fieldsUsed: commonCommandFields
  },
  {
    listTitle: 'KCFKPI_CommandReceipts',
    purpose: 'Automation-owned accepted/rejected/idempotent command result and readback evidence.',
    existingAsset: false,
    fieldsUsed: [
      'ReceiptKey', 'SourceListId', 'SourceItemId', 'SourceItemVersion',
      'CommandKey', 'CommandType', 'SubjectType', 'SubjectKey',
      'PersonKey', 'PerformanceYear', 'Quarter', 'AuthenticatedActorEmail',
      'AuthenticatedActorPersonKey', 'EffectiveRole', 'ProcessedByEmail',
      'ProcessedAt', 'Outcome', 'ValidationCode', 'Message',
      'ProcessedPayloadSHA256', 'ResultKeysJSON', 'AuditKeysJSON',
      'CorrelationKey', 'FlowRunReference'
    ]
  }
];

export const EMPLOYEE_V2_CANONICAL_LISTS = EMPLOYEE_V2_PHYSICAL_ASSETS
  .filter(asset => asset.existingAsset)
  .map(asset => asset.listTitle);

export const EMPLOYEE_V2_CONTROL_PLANE_LISTS = EMPLOYEE_V2_PHYSICAL_ASSETS
  .filter(asset => !asset.existingAsset)
  .map(asset => asset.listTitle);

// The complete C2b Journal/Effects field-level contract is isolated from the older asset inventory above.
export {
  C2B_COMMAND_EFFECTS_LIST_CONTRACT,
  C2B_COMMAND_JOURNAL_LIST_CONTRACT,
  C2B_EXISTING_LIST_REMEDIATIONS,
  C2B_SHAREPOINT_PHYSICAL_CONTRACT,
  C2B_SHAREPOINT_PHYSICAL_CONTRACT_VERSION,
  planC2bSharePointProvisioning,
  verifyC2bSharePointPhysicalContract
} from './EmployeeWorkplanV2C2bSharePointSchema';
