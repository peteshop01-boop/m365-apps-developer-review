import type {
  CoreKpiRole,
  IAnnualWorkplan,
  IBehaviourWorkplanItem,
  IPersonalWorkplanItem,
  IProductionPerson
} from './ProductionModels';
import type {
  IQuarterEvidenceReference,
  IQuarterReview,
  IQuarterReviewAuditEvent,
  IQuarterReviewItem,
  QuarterKey,
  RecoveryRoute
} from './QuarterlyModels';
import type {
  BehaviourV2Period,
  BehaviourV2ValueId,
  IBehaviourPeriodCommitmentV2,
  IBehaviourPlanningLevelsV1
} from './BehaviourFrameworkV2Models';

export type EmployeeContributionMethodV2 =
  | 'AdditiveDirect'
  | 'SharedTarget'
  | 'WeightedDenominator'
  | 'AccountableOwner'
  | 'CompletionOversight';

export type EmployeeCoreWeightingModeV2 = 'Equal' | 'Custom';

export type EmployeeV2CommandOutcome = 'Accepted' | 'Rejected' | 'Duplicate' | 'Failed' | 'RecoveryHold';

export type EmployeeV2EmployeeCommandType =
  | 'CreateWorkplanDraft'
  | 'UpdateWorkplanDraft'
  | 'UpsertWorkplanItem'
  | 'DeactivateWorkplanItem'
  | 'UpdateWorkplanDraftV2'
  | 'UpsertCoreContributionV2'
  | 'UpsertPersonalItemV2'
  | 'UpsertBehaviourCommitmentV2'
  | 'SetCoreWeightingV2'
  | 'SubmitWorkplan'
  | 'CreateQuarterDraft'
  | 'UpdateQuarterItem'
  | 'UpdateQuarterItemV2'
  | 'SaveProgressEntry'
  | 'RegisterEvidence'
  | 'SubmitQuarterReview';

export type EmployeeV2ManagerCommandType =
  | 'RequestWorkplanChanges'
  | 'ApproveAndLockWorkplan'
  | 'RequestQuarterChanges'
  | 'SetQuarterManagerReview'
  | 'SetQuarterRAGOverride'
  | 'DecideReforecast'
  | 'ApproveAndLockQuarter'
  | 'CreateWorkplanAmendmentV2';

export type EmployeeV2CommandType = EmployeeV2EmployeeCommandType | EmployeeV2ManagerCommandType;
export type EmployeeV2SubjectType = 'Workplan' | 'WorkplanItem' | 'QuarterReview' | 'QuarterReviewItem' | 'Evidence';

export interface IEmployeeV2WorkplanCommandContext {
  commandKey: string;
  actor: IProductionPerson;
  workplan: IAnnualWorkplan;
}

export interface IEmployeeV2ItemCommandContext extends IEmployeeV2WorkplanCommandContext {
  subjectKey: string;
  expectedItemEtag?: string;
}

export interface IEmployeeV2QuarterCommandContext extends IEmployeeV2WorkplanCommandContext {
  review: IQuarterReview;
  item?: IQuarterReviewItem;
}

export interface IEmployeeQuarterContributionTargetV2 {
  quarter: QuarterKey;
  targetValue?: number;
  targetText?: string;
  commitment?: string;
  successDefinition?: string;
}

export interface IEmployeeCoreContributionInputV2 {
  kpiId: string;
  role: CoreKpiRole;
  contributionMethod: EmployeeContributionMethodV2;
  annualTargetValue?: number;
  annualTargetText?: string;
  quarterTargets: IEmployeeQuarterContributionTargetV2[];
  displayOrder: number;
  activeInWorkplan: boolean;
  sharedTargetRule?: 'VisibleOnly' | 'ApprovedApportionment';
  sharedApportionmentPercent?: number;
  governanceReference?: string;
  denominatorNumerator?: number;
  denominatorValue?: number;
  denominatorUnit?: string;
  denominatorRuleReference?: string;
  denominatorSourceReference?: string;
}

export interface IEmployeePersonalItemInputV2 {
  wording: string;
  description?: string;
  measure: string;
  measureType?: IPersonalWorkplanItem['measureType'];
  scoringDirection?: IPersonalWorkplanItem['scoringDirection'];
  percentageSourceScale?: IPersonalWorkplanItem['percentageSourceScale'];
  baselineValue?: number;
  yearEndTargetValue?: number;
  yearEndTargetText?: string;
  q1TargetValue?: number;
  q1TargetText?: string;
  q2TargetValue?: number;
  q2TargetText?: string;
  q3TargetValue?: number;
  q3TargetText?: string;
  q4TargetValue?: number;
  q4TargetText?: string;
  unitLabel: string;
  personalItemWeight?: number;
  displayOrder: number;
  activeInWorkplan: boolean;
}

export interface IEmployeeBehaviourCommitmentInputV2 {
  behaviourId: BehaviourV2ValueId;
  selectedSuggestionKeys: string[];
  /** Employee-owned text only. Governed wording and provenance are supplied by trusted observation. */
  selections?: Array<{ source: 'Catalogue' | 'Own'; selectionKey: string;
    commitment: string; howWillWeKnow: string }>;
  commitment: string;
  periodCommitments: IBehaviourPeriodCommitmentV2[];
  /** Optional on older v02 rows; no level is inferred when absent. */
  planningLevels?: IBehaviourPlanningLevelsV1;
  displayOrder: number;
  activeInWorkplan: boolean;
}

export interface IEmployeeBehaviourPeriodAssessmentInputV2 {
  period: BehaviourV2Period;
  employeeEvidence?: string;
  employeeAssessment?: 1 | 2 | 3;
}

export interface IEmployeeCoreWeightingInputV2 {
  mode: EmployeeCoreWeightingModeV2;
  customWeights?: Array<{ kpiId: string; weight: number }>;
}

export interface IEmployeeWorkplanDraftInputV2 {
  coreCategoryWeight: number;
  personalCategoryWeight: number;
  behaviourCategoryWeight: number;
  categoryWeightReason?: string;
  zeroPersonalProposal?: {
    employeeReason: string;
    coreCategoryWeight: number;
    personalCategoryWeight: 0;
    behaviourCategoryWeight: number;
  };
}

export interface IEmployeeQuarterRecoveryInputV2 {
  route: RecoveryRoute;
  action: string;
  ownerPersonKey: string;
  dueDate: string;
  nextReviewDate: string;
  expectedReturnToGreenDate?: string;
  expectedReducedOutcome?: string;
  proposedRevisedTarget?: string;
  proposedRevisedDate?: string;
  reforecastReason?: string;
  dependencyOrDecision?: string;
  escalatedTo?: string;
  targetDecisionDate?: string;
}

export interface IEmployeeQuarterUpdateInputV2 {
  employeeActualValue?: number;
  employeeActualText?: string;
  employeeUpdate: string;
  contextMitigation?: string;
  forecastValue?: number;
  forecastText?: string;
  employeeBehaviourRating?: IQuarterReviewItem['employeeBehaviourRating'];
  behaviourExamples?: string;
  employeeBehaviourEvidenceV2?: string;
  employeeBehaviourAssessmentV2?: 1 | 2 | 3;
  recovery?: IEmployeeQuarterRecoveryInputV2;
}

export interface IEmployeeEvidenceRegistrationInputV2 {
  fileUniqueId: string;
  description: string;
}

export interface IEmployeeV2CommandReceipt {
  receiptKey: string;
  sourceListId: string;
  sourceItemId: number;
  sourceItemVersion: string;
  commandKey: string;
  commandType: EmployeeV2CommandType;
  subjectType: EmployeeV2SubjectType;
  subjectKey: string;
  personKey: string;
  performanceYear: number;
  quarter?: QuarterKey;
  authenticatedActorEmail: string;
  authenticatedActorPersonKey: string;
  effectiveRole: 'Employee' | 'Manager' | 'DelegatedManager' | 'SystemAdmin';
  processedByEmail: string;
  processedAt: string;
  outcome: EmployeeV2CommandOutcome;
  validationCode: string;
  message: string;
  processedPayloadSha256: string;
  resultKeysJson: string;
  auditKeysJson: string;
  correlationKey: string;
  flowRunReference: string;
}

export interface IEmployeeCoreContributionReadbackV2 {
  id: number;
  etag: string;
  workplanItemKey: string;
  naturalKey: string;
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  kpiId: string;
  kpiVersionKey: string;
  targetVersionKey: string;
  workplanVersion: number;
  employeeKpiRole?: CoreKpiRole;
  contributionMethod?: EmployeeContributionMethodV2;
  contributionUnit?: string;
  annualTargetValue?: number;
  annualTargetText?: string;
  quarterTargets: IEmployeeQuarterContributionTargetV2[];
  sharedTargetRule?: 'VisibleOnly' | 'ApprovedApportionment';
  sharedApportionmentPercent?: number;
  governanceReference?: string;
  denominatorNumerator?: number;
  denominatorValue?: number;
  denominatorUnit?: string;
  denominatorRuleReference?: string;
  denominatorSourceReference?: string;
  coreWorkplanWeight?: number;
  displayOrder: number;
  activeInWorkplan: boolean;
  directContributionEligible: boolean;
  contributionApprovalState?: 'Draft' | 'Pending' | 'Approved' | 'Retired';
  additiveApproved: boolean;
  nonOverlapRequired: boolean;
  nonOverlapApproved: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  approvalReference?: string;
  approvalAt?: string;
  auditReference?: string;
}

export interface IEmployeeWorkplanHeaderReadbackV2 extends IAnnualWorkplan {
  workplanVersion: number;
  coreWeightingMode?: EmployeeCoreWeightingModeV2;
}

export interface IEmployeeWorkplanAuditReadbackV2 {
  auditKey: string;
  eventType: string;
  subjectKey: string;
  actorEmail: string;
  actorRole: string;
  eventAt: string;
  reason?: string;
  beforeJson?: string;
  afterJson?: string;
  correlationKey: string;
  source: string;
  sourceReference?: string;
  success: boolean;
}

export interface IEmployeeWorkplanReadbackV2 {
  workplan: IEmployeeWorkplanHeaderReadbackV2;
  coreItems: IEmployeeCoreContributionReadbackV2[];
  personalItems: IPersonalWorkplanItem[];
  behaviourItems: IBehaviourWorkplanItem[];
  audits: IEmployeeWorkplanAuditReadbackV2[];
}

export interface IEmployeeQuarterReadbackV2 {
  review: IQuarterReview;
  items: IQuarterReviewItem[];
  evidence: IQuarterEvidenceReference[];
  audits: IQuarterReviewAuditEvent[];
}

export interface IEmployeeV2PersistenceResult<TReadback> {
  receipt: IEmployeeV2CommandReceipt;
  readback: TReadback;
  duplicate: boolean;
}
