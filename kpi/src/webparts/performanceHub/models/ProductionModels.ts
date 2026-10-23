import type {
  IApprovedMilestonePolicy,
  IApprovedScorePolicy,
  IApprovedTargetRangePolicy,
  IKpiScoringThresholdOverride
} from '../services/ScoringPolicy';
import type { BehaviourObjectiveSource, BehaviourRating } from './BehaviourWorkplanModels';
import type {
  BehaviourV2Cadence,
  BehaviourV2RoleTier,
  IBehaviourAnnualSnapshotV2,
  IBehaviourPlanningLevelsV1
} from './BehaviourFrameworkV2Models';
import type { IBehaviourSelectionSnapshotEnvelopeV2 } from '../services/BehaviourSelectionSnapshotsV2';
import type { IOverallDeliveryWeightConfiguration } from './QuarterlyModels';

export type ProductionSection = 'overview' | 'core' | 'personal' | 'behaviours' | 'quarterly' | 'manager' | 'recovery' | 'reporting' | 'admin' | 'adminReporting' | 'strategicCoverage' | 'dataQuality' | 'behaviourAdmin';

export interface IProductionPerson {
  id: number;
  personKey: string;
  displayName: string;
  email: string;
  managerPersonKey?: string;
  managerEmail?: string;
  team?: string;
  jobRole?: string;
  appRoles: string[];
  active: boolean;
  /** Explicit governed configuration only; never inferred from title, seniority or app role. */
  behaviourRoleTierV2?: BehaviourV2RoleTier;
  behaviourCadenceV2?: BehaviourV2Cadence;
  behaviourFrameworkVersionV2?: string;
}

export type ConfigValueType = 'Text' | 'Number' | 'Boolean' | 'Date' | 'JSON';

export interface IConfigRecord {
  id: number;
  key: string;
  valueType: ConfigValueType;
  textValue?: string;
  numberValue?: number;
  booleanValue?: boolean;
  dateValue?: string;
  jsonValue?: string;
  active: boolean;
}

export interface IProductionConfig {
  performanceYear: string;
  performanceYearStart: string;
  performanceYearEnd: string;
  performanceYearNumber: number;
  quarters: {
    q1: string;
    q2: string;
    q3: string;
    q4: string;
  };
  weights: {
    core: number;
    personal: number;
    behaviours: number;
  };
  rag: {
    greenThreshold: number;
    amberThreshold: number;
  };
  aggregationMethods: string[];
  retentionStatus: string;
}

export interface IReferenceCounts {
  activeKpis: number;
  approvedAnnualTargets: number;
  publishedBehaviours: number;
}

export type WorkplanState = 'Draft' | 'Submitted' | 'ChangesRequested' | 'Approved' | 'Locked' | 'Archived';
export type WorkplanDataLoadState = 'loading' | 'available' | 'notReady' | 'unavailable';
export type CoreKpiRole = 'AccountableOwner' | 'DeliveryLead' | 'Contributor' | 'Oversight' | 'EvidenceProvider';
export type KpiClassificationStatus = 'SourceConfirmed' | 'PilotApproved' | 'UnresolvedTBC';

export interface IAnnualWorkplan {
  id: number;
  etag: string;
  workplanKey: string;
  personKey: string;
  employeeDisplayName: string;
  employeeEmail: string;
  performanceYear: number;
  managerPersonKey?: string;
  managerDisplayName?: string;
  managerEmail?: string;
  state: WorkplanState;
  accessState: string;
  transitionStatus: string;
  transitionCorrelationKey?: string;
  coreCategoryWeight: number;
  personalCategoryWeight: number;
  behaviourCategoryWeight: number;
  /** Governed PD-01 configuration captured with this annual version; absent until supplied by its read contract. */
  overallDeliveryWeightConfiguration?: Readonly<IOverallDeliveryWeightConfiguration>;
  categoryWeightReason?: string;
  submittedAt?: string;
  submittedByEmail?: string;
  managerDecisionComment?: string;
  approvedAt?: string;
  approvedByEmail?: string;
  lockedAt?: string;
  lockedByEmail?: string;
  rowVersionToken: number;
}

export type PersonalMeasureType = 'Count' | 'Number' | 'Percentage' | 'Currency' | 'Rate' | 'Days' | 'Score' | 'Milestone' | 'TextStatus' | 'Other';
export type PersonalScoringDirection = 'HigherIsBetter' | 'LowerIsBetter' | 'TargetRange' | 'Milestone' | 'TBC';

/**
 * Immutable snapshot of one value supplied by governed configuration.
 * Slice 03 deliberately carries the source identity without defining taxonomy values
 * or changing the tenant persistence schema.
 */
export interface IImpactClassificationSelection {
  key: string;
  label: string;
  source: string;
  sourceReference?: string;
  taxonomyId?: string;
  taxonomyVersion?: string;
  taxonomyEtag?: string;
  taxonomyApprovalReference?: 'KCF-KPI-Sponsor-PD-02';
}

export interface IImpactClassification {
  strategicPillar?: Readonly<IImpactClassificationSelection>;
  businessContributionArea?: Readonly<IImpactClassificationSelection>;
}

export interface ICoreKpiCatalogueItem {
  kpiId: string;
  kpiVersionKey: string;
  targetVersionKey: string;
  wording: string;
  pillar: string;
  workstream: string;
  strategyTarget?: string;
  accountableOwnerEmail?: string;
  aggregationMethod?: string;
  scoringDirection: string;
  metricType?: string;
  unitLabel: string;
  percentageSourceScale?: 'Fraction' | 'Whole';
  sourceScoringDirection?: string;
  sourceMetricType?: string;
  sourceUnitLabel?: string;
  classificationStatus?: KpiClassificationStatus;
  classificationSource?: string;
  classificationRationale?: string;
  ownerSourceCode?: string;
  dataQualityFlags?: string;
  portfolioWeight?: number;
  kpiWeightWithinWorkstream?: number;
  ragParametersJson?: string;
  baselineValue?: number;
  kpiThresholdOverride?: IKpiScoringThresholdOverride;
  approvedMilestonePolicy?: IApprovedMilestonePolicy;
  approvedScorePolicy?: IApprovedScorePolicy;
  approvedTargetRangePolicy?: IApprovedTargetRangePolicy;
  scoringPolicyIssues?: string[];
  yearEndTarget?: string;
  yearEndTargetValue?: number;
  yearEndTargetText?: string;
  q1Target?: string;
  q1TargetValue?: number;
  q1TargetText?: string;
  q2Target?: string;
  q2TargetValue?: number;
  q2TargetText?: string;
  q3Target?: string;
  q3TargetValue?: number;
  q3TargetText?: string;
  q4Target?: string;
  q4TargetValue?: number;
  q4TargetText?: string;
}

export interface ICoreWorkplanItem {
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
  coreWorkplanWeight?: number;
  employeeKpiRole?: CoreKpiRole;
  displayOrder: number;
  activeInWorkplan: boolean;
}

export interface IBehaviourSummary {
  behaviourId: string;
  behaviourVersionKey: string;
  title: string;
  description: string;
  assessmentGuidance?: string;
  defaultWorkplanWeight: number;
  displayOrder: number;
}

export interface IPersonalWorkplanItem {
  id: number;
  etag: string;
  workplanItemKey: string;
  naturalKey: string;
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  wording: string;
  description?: string;
  measure: string;
  measureType?: PersonalMeasureType;
  scoringDirection?: PersonalScoringDirection;
  percentageSourceScale?: 'Fraction' | 'Whole';
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
  /** Local/domain boundary only until a separately governed tenant contract exists. */
  impactClassification?: Readonly<IImpactClassification>;
}

export interface IBehaviourWorkplanItem {
  id: number;
  etag: string;
  workplanItemKey: string;
  naturalKey: string;
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  behaviourId: string;
  behaviourVersionKey: string;
  /** Present only for KCCC-BEHAVIOUR|v02. Historic v01 fields below remain read-only. */
  behaviourSnapshotV2?: Readonly<IBehaviourAnnualSnapshotV2>;
  behaviourCommitmentV2?: string;
  behaviourPlanningLevelsV1?: Readonly<IBehaviourPlanningLevelsV1>;
  behaviourPeriodCommitmentsV2?: Readonly<Record<string, string>>;
  behaviourSelectionSnapshotsV2?: Readonly<IBehaviourSelectionSnapshotEnvelopeV2>;
  behaviourSelectionSnapshotsSha256?: string;
  behaviourSelectionSnapshotsUtf8ByteLength?: number;
  objectiveSource?: BehaviourObjectiveSource;
  sourceObjectiveKey?: string;
  selectedSuggestionKeys?: string[];
  customObjective?: string;
  objectiveTitle?: string;
  objectiveDescription?: string;
  measure?: string;
  unit?: string;
  evidenceDefinition?: string;
  q1TargetText?: string;
  q2TargetText?: string;
  q3TargetText?: string;
  q4TargetText?: string;
  targetRating?: BehaviourRating;
  q1TargetRating?: BehaviourRating;
  q2TargetRating?: BehaviourRating;
  q3TargetRating?: BehaviourRating;
  q4TargetRating?: BehaviourRating;
  behaviourItemWeight?: number;
  displayOrder: number;
  activeInWorkplan: boolean;
}

export type SectionCompletionState = 'empty' | 'incomplete' | 'complete' | 'invalid';

export interface IAnnualSubmissionReadiness {
  ready: boolean;
  core: SectionCompletionState;
  personal: SectionCompletionState;
  behaviours: SectionCompletionState;
  blockers: string[];
}

export interface IControlledSubmissionContext {
  workplan?: IAnnualWorkplan;
  employee?: IProductionPerson;
  manager?: IProductionPerson;
  config?: IProductionConfig;
  coreCatalogue: ICoreKpiCatalogueItem[];
  coreItems: ICoreWorkplanItem[];
  personalItems: IPersonalWorkplanItem[];
  behaviours: IBehaviourSummary[];
  behaviourItems: IBehaviourWorkplanItem[];
}

export type WorkplanAuditEventType =
  | 'WorkplanSubmitted'
  | 'WorkplanChangesRequested'
  | 'WorkplanResubmitted'
  | 'WorkplanApproved'
  | 'WorkplanLocked';

export interface IWorkplanAuditEvent {
  id: number;
  auditKey: string;
  eventType: WorkplanAuditEventType;
  subjectKey: string;
  performanceYear: number;
  actorEmail: string;
  actorRole: string;
  eventAt: string;
  reason?: string;
  beforeJson?: string;
  afterJson?: string;
  correlationKey: string;
  source: 'SPFx';
  sourceReference?: string;
  success: boolean;
}

export type IWorkplanAuditWrite = Omit<IWorkplanAuditEvent, 'id'>;

export type StorageAclStatus = 'InheritedDependency';

export interface IWorkplanSubmissionResult {
  workplan: IAnnualWorkplan;
  audit: IWorkplanAuditEvent;
  alreadySubmitted: boolean;
  storageAclStatus: StorageAclStatus;
}

export interface IWorkplanTransitionResult {
  workplan: IAnnualWorkplan;
  audits: IWorkplanAuditEvent[];
  alreadyCompleted: boolean;
  storageAclStatus: StorageAclStatus;
}

export interface IManagerWorkplanReviewContext {
  workplan: IAnnualWorkplan;
  employee: IProductionPerson;
  manager: IProductionPerson;
  coreCatalogue: ICoreKpiCatalogueItem[];
  coreItems: ICoreWorkplanItem[];
  personalItems: IPersonalWorkplanItem[];
  behaviours: IBehaviourSummary[];
  behaviourItems: IBehaviourWorkplanItem[];
  readiness: IAnnualSubmissionReadiness;
  submissionAudit?: IWorkplanAuditEvent;
  auditEvents: IWorkplanAuditEvent[];
}

export type ReadinessStatus = 'pass' | 'fail';

export interface IReadinessCheck {
  key: 'employee' | 'managerEmail' | 'manager' | 'performanceYear' | 'kpiMaster' | 'annualTargets' | 'behaviours' | 'weighting';
  label: string;
  status: ReadinessStatus;
  message: string;
}

export interface IReadinessResult {
  ready: boolean;
  checks: IReadinessCheck[];
  blockers: string[];
  warnings: string[];
  nextAction: string;
}

export interface IReadinessContext {
  employee?: IProductionPerson;
  manager?: IProductionPerson;
  config?: IProductionConfig;
  counts?: IReferenceCounts;
  dataQualityWarnings?: string[];
  employeeLookupFailed?: boolean;
  managerLookupFailed?: boolean;
  configLookupFailed?: boolean;
  referenceLookupFailed?: boolean;
}

export interface IProductionOverview {
  employee?: IProductionPerson;
  manager?: IProductionPerson;
  config?: IProductionConfig;
  counts?: IReferenceCounts;
  workplanStatus: string;
  readiness: IReadinessResult;
  loadMessages: string[];
}
