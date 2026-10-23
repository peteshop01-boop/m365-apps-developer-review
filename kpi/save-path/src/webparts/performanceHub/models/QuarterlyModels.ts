import type { IBehaviourSummary, ICoreKpiCatalogueItem, IImpactClassificationSelection, IProductionPerson } from './ProductionModels';
import type { BehaviourObjectiveSource, BehaviourRating } from './BehaviourWorkplanModels';
import type {
  BehaviourV2Cadence,
  BehaviourV2Period,
  BehaviourV2Rating,
  BehaviourV2RatingLabel,
  BehaviourV2RoleTier,
  BehaviourV2ValueId,
  IBehaviourPeriodSnapshotV2
} from './BehaviourFrameworkV2Models';

export type QuarterKey = 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type QuarterCalendarStatus = 'Upcoming' | 'Open' | 'Finalising' | 'AwaitingManagerReview' | 'Approved' | 'Locked';
export type QuarterReviewState = 'Draft' | 'Submitted' | 'ChangesRequested' | 'Approved' | 'Locked';
export type QuarterReviewAccessState = 'EmployeeEdit' | 'ManagerDecision' | 'ReadOnly' | 'RecoveryHold';
export type RagStatus = 'Green' | 'Amber' | 'Red' | 'NotRated';
export type ScoringDirection = 'HigherIsBetter' | 'LowerIsBetter' | 'TBC' | 'TargetRange' | 'Milestone';
export type MetricType = 'Count' | 'Number' | 'Percentage' | 'Currency' | 'Rate' | 'Days' | 'Score' | 'Milestone' | 'TextStatus' | 'Other';
export type QuarterItemType = 'CoreGold' | 'LocalPersonal' | 'Behaviour';
export type QuarterReportingStream = 'CoreGold' | 'Impact' | 'Behaviour';
export type BehaviourAssessment = 'ExceedsExpectations' | 'MeetsExpectations' | 'Developing' | 'InsufficientEvidence';
export type QuarterReviewAuditEventType =
  | 'QuarterReviewCreated'
  | 'QuarterReviewSubmitted'
  | 'QuarterReviewChangesRequested'
  | 'QuarterReviewResubmitted'
  | 'QuarterReviewApproved'
  | 'QuarterReviewLocked'
  | 'QuarterReviewReopened'
  | 'RAGOverridden';

export interface IQuarterLifecycle {
  performanceYear: string;
  performanceYearNumber: number;
  quarterKey: QuarterKey;
  quarterName: string;
  quarterStart: string;
  quarterEnd: string;
  isCurrentQuarter: boolean;
  isOpenForProgressUpdates: boolean;
  employeeSubmissionDeadline: string;
  managerReviewDeadline: string;
  reminderMilestones: {
    earlyReview: string;
    preparation: string;
    final: string;
  };
  status: QuarterCalendarStatus;
  priorQuarter?: QuarterKey;
  nextQuarter?: QuarterKey;
}

export interface IScoringInput {
  scoringDirection: ScoringDirection | string;
  metricType: MetricType | string;
  targetValue?: number;
  actualValue?: number;
  baselineValue?: number;
  targetText?: string;
  actualText?: string;
  milestoneStages?: string[];
  statusProgressMap?: Record<string, number>;
  greenThreshold?: number;
  amberThreshold?: number;
}

export type ScoringReason =
  | 'CALCULATED'
  | 'SCORING_CONFIGURATION_TBC'
  | 'TARGET_MISSING'
  | 'TARGET_ZERO_UNASSESSABLE'
  | 'ACTUAL_MISSING_OR_INVALID'
  | 'LOWER_IS_BETTER_BASELINE_REQUIRED'
  | 'LOWER_IS_BETTER_CONTEXT_INVALID'
  | 'MILESTONE_MAPPING_REQUIRED'
  | 'TEXT_STATUS_MAPPING_REQUIRED'
  | 'UNSUPPORTED_METRIC';

export interface IScoringResult {
  rateable: boolean;
  rawProgressPct?: number;
  scoredProgressPct?: number;
  calculatedRag: RagStatus;
  reason: ScoringReason;
  message: string;
  calculationVersion: 'DEMO-RAG-001';
}

export interface IManagerRagOverride {
  rag?: Exclude<RagStatus, 'NotRated'>;
  reason?: string;
  actorPersonKey?: string;
  actorEmail?: string;
  overriddenAt?: string;
}

export interface IFinalRagResult {
  finalRag: RagStatus;
  overrideApplied: boolean;
  valid: boolean;
  errors: string[];
}

/**
 * Historical copy of one governed annual Impact classification value. The
 * source identity is retained so later taxonomy changes cannot rewrite the
 * quarterly record.
 */
export type IQuarterImpactClassificationSelectionSnapshot = Readonly<IImpactClassificationSelection>;

export interface IQuarterImpactClassificationSnapshot {
  readonly strategicPillar?: Readonly<IQuarterImpactClassificationSelectionSnapshot>;
  readonly businessContributionArea?: Readonly<IQuarterImpactClassificationSelectionSnapshot>;
}

/** Immutable annual definition and classification bound to one Impact quarter. */
export interface IQuarterImpactAnnualDefinitionSnapshot {
  readonly sourceWorkplanItemKey: string;
  readonly wording: string;
  readonly intendedOutcome?: string;
  readonly measure: string;
  readonly unitLabel: string;
  readonly metricType: string;
  readonly scoringDirection: string;
  readonly percentageSourceScale?: 'Fraction' | 'Whole';
  readonly baselineValue?: number;
  readonly yearEndTargetValue?: number;
  readonly yearEndTargetText?: string;
  readonly quarterTargetValue?: number;
  readonly quarterTargetText?: string;
  readonly workplanItemWeight?: number;
  readonly classification?: Readonly<IQuarterImpactClassificationSnapshot>;
}

export type RecoveryRoute = 'Recover' | 'Mitigate' | 'Reforecast' | 'Escalate';
export type RecoveryStatus = 'Draft' | 'Active' | 'Complete' | 'Superseded' | 'Escalated';
export type ReforecastApprovalStatus = 'NotRequested' | 'Pending' | 'Approved' | 'Rejected';

export interface IRecoveryAction {
  route?: RecoveryRoute;
  action?: string;
  ownerPersonKey?: string;
  dueDate?: string;
  nextReviewDate?: string;
  status?: RecoveryStatus;
  expectedReturnToGreenDate?: string;
  expectedReducedOutcome?: string;
  proposedRevisedTarget?: string;
  proposedRevisedDate?: string;
  reforecastReason?: string;
  reforecastApprovalStatus?: ReforecastApprovalStatus;
  dependencyOrDecision?: string;
  escalatedTo?: string;
  targetDecisionDate?: string;
}

export interface IRecoveryValidationResult {
  required: boolean;
  valid: boolean;
  errors: string[];
  warnings: string[];
  targetChangeAuthorised: boolean;
}

export interface IQuarterReview {
  id: number;
  etag: string;
  quarterReviewKey: string;
  workplanKey: string;
  personKey: string;
  employeeDisplayName: string;
  employeeEmail: string;
  performanceYear: number;
  quarter: QuarterKey;
  managerPersonKey: string;
  managerDisplayName: string;
  managerEmail: string;
  /** Immutable copy of the approved Annual Workplan category proposal. */
  coreCategoryWeightSnapshot?: number;
  personalCategoryWeightSnapshot?: number;
  behaviourCategoryWeightSnapshot?: number;
  /** Exact PD-01 annual configuration, independent of legacy planning-category weights. */
  overallDeliveryWeightConfigurationSnapshot?: Readonly<IOverallDeliveryWeightConfiguration>;
  /** Annual manager approval/lock correlation which authorised the source snapshot. */
  workplanApprovalCorrelationKey?: string;
  state: QuarterReviewState;
  accessState: QuarterReviewAccessState;
  transitionStatus: 'Ready' | 'InProgress' | 'Failed';
  transitionCorrelationKey?: string;
  employeeSubmissionComment?: string;
  submittedAt?: string;
  submittedByEmail?: string;
  managerDecisionComment?: string;
  approvedAt?: string;
  approvedByEmail?: string;
  lockedAt?: string;
  lockedByEmail?: string;
  rowVersionToken: number;
  behaviourFrameworkVersionV2?: string;
  behaviourRoleTierV2?: BehaviourV2RoleTier;
  behaviourCadenceV2?: BehaviourV2Cadence;
  /** Exact employee submission input; manager actions must not silently rebuild it. */
  submissionSnapshot?: Readonly<IQuarterSubmissionSnapshot>;
}

export interface IQuarterReviewItem {
  id: number;
  etag: string;
  quarterReviewItemKey: string;
  quarterReviewKey: string;
  workplanItemKey: string;
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  quarter: QuarterKey;
  itemType: QuarterItemType;
  /** Explicitly prevents Impact results being projected into Core/GOLD reporting. */
  reportingStream?: QuarterReportingStream;
  kpiId?: string;
  kpiVersionKey?: string;
  targetVersionKey?: string;
  wording: string;
  itemDescription?: string;
  measure?: string;
  pillar?: string;
  workstream?: string;
  ownerEmail?: string;
  unitLabel?: string;
  metricType?: string;
  scoringDirection?: string;
  percentageSourceScale?: 'Fraction' | 'Whole';
  baselineValue?: number;
  strategyTarget?: string;
  yearEndTarget?: string;
  yearEndTargetValueSnapshot?: number;
  yearEndTargetTextSnapshot?: string;
  quarterTargetValue?: number;
  quarterTargetText?: string;
  previousQuarterActualValue?: number;
  previousQuarterActualText?: string;
  employeeActualValue?: number;
  employeeActualText?: string;
  progressPct?: number;
  scoredProgressPct?: number;
  calculatedRag: RagStatus;
  calculationRuleVersion?: string;
  scoringMessage?: string;
  statusUpdate?: string;
  /** Employee-owned V2 context/mitigation, stored separately from the update. */
  contextMitigation?: string;
  quarterEndForecastValue?: number;
  quarterEndForecastText?: string;
  evidenceCount: number;
  evidenceRequired?: boolean;
  recovery?: IRecoveryAction;
  behaviourPrompt?: string;
  behaviourAssessmentGuidance?: string;
  behaviourId?: string;
  behaviourVersionKey?: string;
  behaviourTitle?: string;
  behaviourObjectiveKey?: string;
  behaviourObjectiveSource?: BehaviourObjectiveSource;
  behaviourObjectiveTitle?: string;
  behaviourObjectiveDescription?: string;
  behaviourEvidenceDefinition?: string;
  behaviourTargetRating?: BehaviourRating;
  employeeBehaviourRating?: BehaviourRating;
  managerBehaviourRating?: BehaviourRating;
  finalBehaviourRating?: BehaviourRating;
  behaviourReflection?: string;
  behaviourExamples?: string;
  /** v02 uses stored governed snapshots and separate owner fields; it has no target/RAG/score. */
  behaviourSnapshotV2?: Readonly<IBehaviourPeriodSnapshotV2>;
  /** Read-only full-year Workplan levels, captured from the accepted annual item. */
  readonly behaviourAnnualCurrentLevelV2?: BehaviourV2RatingLabel;
  readonly behaviourAnnualTargetLevelV2?: BehaviourV2RatingLabel;
  readonly behaviourAnnualTargetJustificationV2?: string;
  readonly behaviourAnnualTargetSourceWorkplanItemKeyV2?: string;
  readonly behaviourAnnualTargetSourceEtagV2?: string;
  /** Approved Workplan header version and approval event captured with this item. */
  readonly behaviourAnnualTargetSourceWorkplanVersionV2?: number;
  readonly behaviourAnnualTargetSourceApprovalKeyV2?: string;
  /** This quarter's separate Current/Actual; never copied from the annual Target. */
  behaviourQuarterCurrentActualLevelV2?: BehaviourV2RatingLabel;
  employeeBehaviourEvidenceV2?: string;
  employeeBehaviourAssessmentV2?: BehaviourV2Rating;
  managerBehaviourEvidenceV2?: string;
  managerBehaviourAssessmentV2?: BehaviourV2Rating;
  finalBehaviourEvidenceV2?: string;
  finalBehaviourAssessmentV2?: BehaviourV2Rating;
  managerBehaviourAssessment?: BehaviourAssessment;
  managerComment?: string;
  managerOverride?: IManagerRagOverride;
  finalApprovedRag?: RagStatus;
  contributionWeightSnapshot?: number;
  /** Employee Workplan item weight, separate from Core organisational contribution semantics. */
  workplanItemWeightSnapshot?: number;
  /** Immutable copy of the approved annual Impact definition/classification. */
  impactAnnualDefinitionSnapshot?: Readonly<IQuarterImpactAnnualDefinitionSnapshot>;
  /** Versioned selected Behaviour catalogue commitments; detailed wording is stored data, never calculation logic. */
  behaviourCommitmentSnapshotsV1?: ReadonlyArray<Readonly<IQuarterBehaviourCommitmentSnapshotV1>>;
  managerApproved: boolean;
  locked: boolean;
}

export interface IQuarterReviewAuditEvent {
  id: number;
  auditKey: string;
  eventType: QuarterReviewAuditEventType;
  subjectKey: string;
  performanceYear: number;
  quarter: QuarterKey;
  actorPersonKey?: string;
  actorEmail: string;
  actorRole: 'Employee' | 'Manager' | 'Admin';
  eventAt: string;
  reason?: string;
  beforeJson?: string;
  afterJson?: string;
  correlationKey: string;
  source: 'SPFx';
  sourceReference?: string;
  success: boolean;
}

export type IQuarterReviewAuditWrite = Omit<IQuarterReviewAuditEvent, 'id'>;

export interface IQuarterReviewTransitionResult {
  review: IQuarterReview;
  audits: IQuarterReviewAuditEvent[];
  alreadyCompleted: boolean;
}

export interface IQuarterManagerOverrideResult {
  item: IQuarterReviewItem;
  audit: IQuarterReviewAuditEvent;
  alreadyCompleted: boolean;
}

export interface IProgressEntry {
  entryKey: string;
  quarterReviewKey?: string;
  quarterReviewItemKey?: string;
  quarter?: QuarterKey;
  date: string;
  note: string;
  actorPersonKey: string;
  actorEmail: string;
  updatedAt: string;
  status?: 'OnTrack' | 'AtRisk' | 'OffTrack' | 'Complete' | 'NotRated';
  actualValue?: number;
  actualText?: string;
  forecastValue?: number;
  forecastText?: string;
  evidenceLink?: string;
}

export interface IProgressLedger {
  id: number;
  etag: string;
  progressLedgerKey: string;
  workplanItemKey: string;
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  itemType: QuarterItemType;
  kpiId?: string;
  entries: IProgressEntry[];
  locked: boolean;
  rowVersionToken: number;
}

export type EvidenceKind = 'Text' | 'Link' | 'File';

export interface IQuarterEvidenceReference {
  evidenceKey: string;
  kind: EvidenceKind;
  personKey: string;
  workplanKey: string;
  workplanItemKey: string;
  quarterReviewKey: string;
  quarterReviewItemKey: string;
  performanceYear: number;
  quarter: QuarterKey;
  kpiId?: string;
  description: string;
  url?: string;
  serverRelativeFileUrl?: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Locked' | 'Withdrawn';
}

export type IQuarterSubmissionItemSnapshot = Readonly<Omit<IQuarterReviewItem,
  | 'etag'
  | 'managerBehaviourRating'
  | 'finalBehaviourRating'
  | 'managerBehaviourEvidenceV2'
  | 'managerBehaviourAssessmentV2'
  | 'finalBehaviourEvidenceV2'
  | 'finalBehaviourAssessmentV2'
  | 'managerBehaviourAssessment'
  | 'managerComment'
  | 'managerOverride'
  | 'finalApprovedRag'
  | 'managerApproved'
  | 'locked'>>;

export interface IQuarterSubmissionSnapshot {
  readonly snapshotVersion: 'DEMO-QUARTER-SUBMISSION-001';
  readonly snapshotKey: string;
  readonly quarterReviewKey: string;
  readonly workplanKey: string;
  readonly personKey: string;
  readonly performanceYear: number;
  readonly quarter: QuarterKey;
  readonly sourceReviewRowVersionToken: number;
  readonly submittedByPersonKey: string;
  readonly submittedByEmail: string;
  readonly capturedAt: string;
  readonly items: ReadonlyArray<IQuarterSubmissionItemSnapshot>;
  readonly evidence: ReadonlyArray<Readonly<IQuarterEvidenceReference>>;
  readonly progressEntries: ReadonlyArray<Readonly<IProgressEntry>>;
}

export interface IQuarterSubmissionReadiness {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  coreComplete: number;
  personalComplete: number;
  behavioursComplete: number;
}

export interface IQuarterReviewContext {
  lifecycle: IQuarterLifecycle;
  review?: IQuarterReview;
  employee: IProductionPerson;
  manager?: IProductionPerson;
  coreCatalogue: ICoreKpiCatalogueItem[];
  behaviours: IBehaviourSummary[];
  items: IQuarterReviewItem[];
  progressLedgers: IProgressLedger[];
  evidence: IQuarterEvidenceReference[];
  auditEvents?: IQuarterReviewAuditEvent[];
  readiness: IQuarterSubmissionReadiness;
  dataFoundationReady: boolean;
  messages: string[];
}

export interface IManagerQuarterReviewContext {
  lifecycle: IQuarterLifecycle;
  review: IQuarterReview;
  employee: IProductionPerson;
  manager: IProductionPerson;
  items: IQuarterReviewItem[];
  evidence: IQuarterEvidenceReference[];
  auditEvents?: IQuarterReviewAuditEvent[];
  readiness: IQuarterSubmissionReadiness;
  dataFoundationReady: boolean;
  messages: string[];
}

export interface IRecoveryActionboardItem {
  key: string;
  quarter: QuarterKey;
  employeeDisplayName: string;
  employeeEmail: string;
  kpiId: string;
  wording: string;
  pillar: string;
  workstream: string;
  ownerPersonKey?: string;
  ownerInitials: string;
  rag: 'Amber' | 'Red';
  route?: RecoveryRoute;
  action?: string;
  dueDate?: string;
  nextReviewDate?: string;
  recoveryStatus?: RecoveryStatus;
  decisionRequired: boolean;
  decisionReason?: string;
  overdue: boolean;
  priorityScore: number;
  managerDecisionStatus: QuarterReviewState;
}

export interface IRecoveryActionboardFilters {
  quarter?: QuarterKey;
  pillar?: string;
  workstream?: string;
  ownerPersonKey?: string;
  rag?: 'Amber' | 'Red';
  route?: RecoveryRoute;
  overdueOnly?: boolean;
  decisionRequiredOnly?: boolean;
}

export type AggregationMethod = 'DirectMetric' | 'Additive' | 'WeightedContribution' | 'Composite' | 'Milestone' | 'AccountableOwner';

export interface IAggregationInput {
  key: string;
  itemType: QuarterItemType;
  kpiId?: string;
  actualValue?: number;
  progressPct?: number;
  finalRag?: RagStatus;
  approved: boolean;
  locked: boolean;
  authoritative?: boolean;
  accountableOwner?: boolean;
  contributionWeight?: number;
  employeeWorkplanWeight?: number;
  organisationalWeight?: number;
}

export interface IAggregationPreparationResult {
  ready: boolean;
  method: AggregationMethod;
  includedKeys: string[];
  excludedNonCoreKeys: string[];
  excludedNotRatedKeys: string[];
  rawValue?: number;
  rawProgressPct?: number;
  scoredProgressPct?: number;
  errors: string[];
  calculationVersion: 'DEMO-AGG-001';
}

export type QuarterBehaviourAssessmentLane = 'Employee' | 'Manager' | 'Final';

export interface IQuarterDeliveryReadResult {
  readonly quarterReviewKey: string;
  readonly reviewState: QuarterReviewState;
  readonly personKey: string;
  readonly performanceYear: number;
  readonly quarter: QuarterKey;
  readonly categoryWeightSnapshot?: number;
  readonly item: Readonly<IQuarterReviewItem>;
  readonly supportingEvidence: ReadonlyArray<Readonly<IQuarterEvidenceReference>>;
}

export interface IQuarterDeliveryStreamProjection {
  readonly stream: 'CoreGold' | 'Impact';
  readonly results: ReadonlyArray<Readonly<IQuarterDeliveryReadResult>>;
}

export interface IQuarterBehaviourRatingCardinality {
  readonly Developing: number;
  readonly Effective: number;
  readonly Exceptional: number;
  readonly unassessed: number;
  readonly total: number;
}

export interface IQuarterBehaviourObservation {
  readonly quarterReviewKey: string;
  readonly reviewState: QuarterReviewState;
  readonly personKey: string;
  readonly performanceYear: number;
  readonly period: BehaviourV2Period;
  readonly headlineId: BehaviourV2ValueId;
  readonly headlineTitle: string;
  readonly frameworkVersion: string;
  readonly behaviourAnnualCurrentLevelV2?: BehaviourV2RatingLabel;
  readonly behaviourAnnualTargetLevelV2?: BehaviourV2RatingLabel;
  readonly behaviourAnnualTargetJustificationV2?: string;
  readonly behaviourAnnualTargetSourceWorkplanItemKeyV2?: string;
  readonly behaviourAnnualTargetSourceEtagV2?: string;
  readonly behaviourAnnualTargetSourceWorkplanVersionV2?: number;
  readonly behaviourAnnualTargetSourceApprovalKeyV2?: string;
  readonly employeeRating?: BehaviourV2RatingLabel;
  readonly managerRating?: BehaviourV2RatingLabel;
  readonly finalRating?: BehaviourV2RatingLabel;
  readonly employeeEvidence?: string;
  readonly managerEvidence?: string;
  readonly finalEvidence?: string;
  readonly selectedCommitment?: string;
  readonly selectedCommitments?: ReadonlyArray<Readonly<IQuarterBehaviourCommitmentSnapshotV1>>;
  readonly supportingEvidence: ReadonlyArray<Readonly<IQuarterEvidenceReference>>;
}

export interface IQuarterBehaviourHeadlineDistribution {
  readonly period: BehaviourV2Period;
  readonly headlineId: BehaviourV2ValueId;
  readonly headlineTitle?: string;
  readonly employee: Readonly<IQuarterBehaviourRatingCardinality>;
  readonly manager: Readonly<IQuarterBehaviourRatingCardinality>;
  readonly final: Readonly<IQuarterBehaviourRatingCardinality>;
}

export interface IQuarterBehaviourMovementInput {
  readonly lane: QuarterBehaviourAssessmentLane;
  readonly personKey: string;
  readonly headlineId: BehaviourV2ValueId;
  readonly headlineTitle: string;
  readonly fromQuarterReviewKey: string;
  readonly toQuarterReviewKey: string;
  readonly fromPeriod: BehaviourV2Period;
  readonly toPeriod: BehaviourV2Period;
  readonly fromRating?: BehaviourV2RatingLabel;
  readonly toRating?: BehaviourV2RatingLabel;
}

export interface IQuarterManagerCompositionInput {
  readonly projectionIdentity: string;
  readonly quarterReviewKey: string;
  readonly personKey: string;
  readonly performanceYear: number;
  readonly quarter: QuarterKey;
  readonly managerPersonKey: string;
  readonly managerCommentary?: string;
  readonly approvedAt?: string;
  readonly lockedAt?: string;
  readonly itemActions: ReadonlyArray<Readonly<{
    quarterReviewItemKey: string;
    managerComment?: string;
    recovery?: Readonly<IRecoveryAction>;
    managerOverride?: Readonly<IManagerRagOverride>;
  }>>;
}

export interface IQuarterPerformanceReadProjection {
  readonly projectionVersion: 'DEMO-QUARTER-READ-001';
  readonly projectionIdentity: string;
  readonly performanceYear: number;
  readonly core: Readonly<IQuarterDeliveryStreamProjection>;
  readonly impact: Readonly<IQuarterDeliveryStreamProjection>;
  readonly behaviourObservations: ReadonlyArray<Readonly<IQuarterBehaviourObservation>>;
  readonly behaviourDistributions: ReadonlyArray<Readonly<IQuarterBehaviourHeadlineDistribution>>;
  readonly behaviourMovementInputs: ReadonlyArray<Readonly<IQuarterBehaviourMovementInput>>;
  readonly managerCompositionInputs: ReadonlyArray<Readonly<IQuarterManagerCompositionInput>>;
  readonly overallDeliveryWeightConfigurations?: ReadonlyArray<Readonly<{
    quarterReviewKey: string;
    configuration: Readonly<IOverallDeliveryWeightConfiguration>;
  }>>;
}

export type OverallDeliveryCoreProtectionState = 'Acceptable' | 'Poor' | 'NotRated';

export interface IOverallDeliveryWeightConfiguration {
  readonly configurationKey: string;
  readonly configurationVersion: string;
  readonly coreWeight: number;
  readonly impactWeight: number;
  readonly sourceReference: 'DEMO-APP-PETE-PD-01';
}

export interface IOverallDeliveryStreamResult {
  readonly stream: 'CoreGold' | 'Impact';
  readonly score: number;
  readonly authoritativeRag: RagStatus;
  readonly weight: number;
  readonly weightedContribution: number;
  readonly sourceResultKeys: ReadonlyArray<string>;
  readonly scoreCalculationVersion: 'DEMO-RAG-001';
  readonly aggregationCalculationVersion: 'DEMO-AGG-001';
}

export interface IOverallDeliveryCalculationResult {
  readonly calculationVersion: 'DEMO-PD01-001';
  readonly projectionIdentity: string;
  readonly ready: boolean;
  readonly weights: Readonly<IOverallDeliveryWeightConfiguration>;
  readonly core?: Readonly<IOverallDeliveryStreamResult>;
  readonly impact?: Readonly<IOverallDeliveryStreamResult>;
  readonly overallScore?: number;
  readonly coreProtectionState: OverallDeliveryCoreProtectionState;
  readonly coreProtectionApplied: boolean;
  readonly exceptionalOutcomePermitted: boolean;
  readonly errors: ReadonlyArray<string>;
}

export type QuarterBehaviourSelectionPath = 'SuggestedTarget' | 'OwnTarget';
export type QuarterBehaviourManagerDecision = 'Agreed' | 'ChangesRequested';

export interface IQuarterBehaviourCatalogueIdentityV1 {
  readonly decisionReference: 'DEMO-APP-PETE-BEH-V1-001';
  readonly catalogueVersion: string;
  readonly contentHash: string;
  readonly sourceReference: string;
  readonly effectiveFrom: string;
}

export interface IQuarterBehaviourCommitmentSnapshotV1 {
  readonly selectionKey: string;
  readonly catalogueIdentity: Readonly<IQuarterBehaviourCatalogueIdentityV1>;
  readonly headlineId: BehaviourV2ValueId;
  readonly roleTier: BehaviourV2RoleTier;
  readonly focusAreaKey: string;
  readonly focusAreaTitle: string;
  readonly selectionPath: QuarterBehaviourSelectionPath;
  readonly suggestedTargetKey?: string;
  readonly targetTextSnapshot: string;
  readonly myCommitment: string;
  readonly howWillWeKnow: string;
  readonly managerDecision?: QuarterBehaviourManagerDecision;
  readonly managerDecisionByPersonKey?: string;
  readonly managerDecisionAt?: string;
  readonly managerDecisionComment?: string;
  readonly retiredAtSnapshot?: string;
}

export interface IQuarterBehaviourCatalogueConsumerResult {
  readonly consumerVersion: 'DEMO-PD03-001';
  readonly projectionIdentity: string;
  readonly catalogueIdentity: Readonly<IQuarterBehaviourCatalogueIdentityV1>;
  readonly headlineIds: ReadonlyArray<BehaviourV2ValueId>;
  readonly roleTiers: ReadonlyArray<BehaviourV2RoleTier>;
  readonly selections: ReadonlyArray<Readonly<IQuarterBehaviourCommitmentSnapshotV1>>;
  readonly selectionGuidance: 'BelowGuidance' | 'WithinGuidance' | 'AboveGuidance';
  readonly ratings: ReadonlyArray<Readonly<IQuarterBehaviourCatalogueRating>>;
}

export interface IQuarterBehaviourCatalogueRating {
  readonly quarterReviewKey: string;
  readonly personKey: string;
  readonly period: BehaviourV2Period;
  readonly headlineId: BehaviourV2ValueId;
  readonly behaviourAnnualCurrentLevelV2?: BehaviourV2RatingLabel;
  readonly behaviourAnnualTargetLevelV2?: BehaviourV2RatingLabel;
  readonly behaviourAnnualTargetJustificationV2?: string;
  readonly behaviourAnnualTargetSourceWorkplanItemKeyV2?: string;
  readonly behaviourAnnualTargetSourceEtagV2?: string;
  readonly behaviourAnnualTargetSourceWorkplanVersionV2?: number;
  readonly behaviourAnnualTargetSourceApprovalKeyV2?: string;
  readonly employeeRating?: BehaviourV2RatingLabel;
  readonly managerRating?: BehaviourV2RatingLabel;
  readonly finalRating?: BehaviourV2RatingLabel;
  readonly employeeEvidence?: string;
  readonly managerEvidence?: string;
  readonly finalEvidence?: string;
  readonly supportingEvidence: ReadonlyArray<Readonly<IQuarterEvidenceReference>>;
}

export interface IQuarterYearEndDecisionInput {
  readonly compositionVersion: 'DEMO-BT07-DECISION-001';
  readonly projectionIdentity: string;
  readonly performanceYear: number;
  readonly overallDelivery: Readonly<IOverallDeliveryCalculationResult>;
  readonly core: Readonly<IQuarterDeliveryStreamProjection>;
  readonly impact: Readonly<IQuarterDeliveryStreamProjection>;
  readonly behaviours: Readonly<IQuarterBehaviourCatalogueConsumerResult>;
  readonly managerCompositionInputs: ReadonlyArray<Readonly<IQuarterManagerCompositionInput>>;
}
