import { materialiseQuarterBehaviourTarget, ownSnapshotValue } from './QuarterBehaviourTargetSnapshot';
import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import { Guid } from '@microsoft/sp-core-library';
import type {
  CoreKpiRole,
  IAnnualWorkplan,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  ConfigValueType,
  IControlledSubmissionContext,
  ICoreKpiCatalogueItem,
  ICoreWorkplanItem,
  IConfigRecord,
  IProductionConfig,
  IProductionPerson,
  IReferenceCounts,
  IPersonalWorkplanItem,
  IManagerWorkplanReviewContext,
  IWorkplanAuditEvent,
  IWorkplanAuditWrite,
  IWorkplanSubmissionResult,
  IWorkplanTransitionResult,
  WorkplanAuditEventType
} from '../models/ProductionModels';
import type { IQuarterTimingConfig } from '../models/GovernanceModels';
import type { IWorkplanCategoryWeights } from '../models/GovernanceModels';
import type {
  BehaviourKey,
  BehaviourObjectiveSource,
  BehaviourRating,
  IBehaviourObjectiveLibraryRecord
} from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, type BehaviourV2Cadence,
  type BehaviourV2Period, type BehaviourV2RoleTier, type BehaviourV2ValueId,
  type IBehaviourV2RatingOption } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS, behaviourV2Periods, isBehaviourV2RoleTier,
  isBehaviourV2ValueId, isBehaviourV2Rating, createBehaviourPeriodSnapshotV2,
  readBehaviourPlanningLevelsV1 } from './BehaviourFrameworkV2Policy';
import { decodeBehaviourSelectionSnapshotsV2 } from './BehaviourSelectionSnapshotsV2';
import type {
  BehaviourAssessment,
  IProgressEntry,
  IProgressLedger,
  IManagerQuarterReviewContext,
  IQuarterEvidenceReference,
  IQuarterLifecycle,
  IQuarterReview,
  IQuarterReviewAuditEvent,
  IQuarterReviewAuditWrite,
  IQuarterReviewContext,
  IQuarterReviewItem,
  IQuarterReviewTransitionResult,
  IQuarterManagerOverrideResult,
  QuarterReviewAuditEventType,
  QuarterKey,
  RecoveryRoute,
  RecoveryStatus,
  ReforecastApprovalStatus
} from '../models/QuarterlyModels';
import type {
  IAuthoritativeAdminEventHistoryCapability,
  IAuthoritativeAdminKpiRemediationQueueCapability,
  IProductionDataService
} from './IProductionDataService';
import type {
  IAdminKpiRemediationSourceIssue,
  IAuthoritativeAdminKpiRemediationIssues
} from './AdminKpiMasterDomain';
import type { IAdminTeamRecord } from '../models/AdminFoundationModels';
import type { IAdminConfigSourceRecord } from './AdminConfigDomain';
import { investigateAdminEventHistory, type IAdminControlledEventHistoryRecord,
  type IAdminEventHistoryView } from './AdminEventHistoryDomain';
import {
  ADMIN_CONFIG_AUDIT_EXPAND,
  ADMIN_CONFIG_AUDIT_SELECT,
  mapAdminConfigSourceRecord,
  type IAdminConfigListItemReadback
} from './AdminConfigProductionAdapter';
import { mapProductionConfig, mapQuarterTimingConfig } from './ProductionConfigMapper';
import { evaluateControlledSubmissionReadiness } from './AnnualWorkplanValidation';
import { canManagerReadWorkplan } from './WorkplanAuthorisation';
import { createSubmissionPlan, verifyCompletedSubmission } from './WorkplanSubmission';
import {
  assertPersistedWorkplanAuditMatchesPlan,
  createAdminLockPlan,
  createApprovalPlan,
  createControlledAmendmentPlan,
  createControlledReopenPlan,
  createRequestChangesPlan,
  executeControlledAmendment,
  verifyCompletedManagerTransition
} from './WorkplanLifecycle';
import type { IQuarterDraftSource } from './QuarterReviewFactory';
import { buildQuarterReviewDraft } from './QuarterReviewFactory';
import {
  assertQuarterReviewItemSnapshotCurrent,
  assertQuarterReviewItemWriteBoundary,
  assertQuarterReviewSnapshotCurrent,
  canEmployeeEditQuarterReview,
  canManagerAssessQuarterBehaviour,
  canManagerReadQuarterReview,
  filterManagerQuarterReviews
} from './QuarterReviewAuthorisation';
import { evaluateQuarterManagerApprovalReadiness, evaluateQuarterSubmissionReadiness } from './QuarterSubmissionReadiness';
import { assertApprovedBehaviourTargetSource, assertFrozenBehaviourAnnualTarget, prepareAuthoritativeCoreQuarterSave, prepareAuthoritativePersonalQuarterSave } from './QuarterReviewItemPersistence';
import {
  createQuarterCreationAudit,
  createQuarterRagOverridePlan,
  createQuarterTransitionPlan,
  verifyCompletedQuarterSubmission,
  verifyQuarterRagOverride,
  verifyQuarterTransition
} from './QuarterReviewLifecycle';
import { upsertProgressEntry } from './ProgressLedgerValidation';
import { validateQuarterDraftSave } from './QuarterDraftValidation';
import { calculateBehaviourRating, isBehaviourRating, validateBehaviourObjectiveLibraryRecord } from './BehaviourWorkplanPolicy';
import { normaliseEmployeeBehaviourCustomObjective } from './EmployeeBehaviourSelection';
import {
  assertCurrentEditableWorkplanSnapshot,
  createAnnualWorkplanItemDeactivationPlan,
  executeAnnualWorkplanItemDeactivation,
  type AnnualWorkplanWriteArea
} from './AnnualWorkplanWriteAuthorisation';
import {
  buildKpiDataQualityOptionsFromCatalogue,
  buildKpiDataQualityQueue,
  isKpiDataQualityAdmin
} from './KpiDataQuality';
import { projectKpiDataQualityIssues } from './AdminDataQualityDomain';
import { validateWorkplanCategoryWeights } from './CategoryWeightingPolicy';
import {
  personalQuarterTarget,
  resolvePersonalDraftUpsertTarget,
  validatePersonalKpiDefinition
} from './PersonalWorkplanPolicy';
import { PILOT_SCORING_CLASSIFICATIONS, resolvePilotScoringClassification, type PilotScoringKpiId } from './PilotScoringClassification';
import {
  validateQuarterlyLifecycleSchema,
  type IQuarterlyLifecycleSchemaReadback
} from './QuarterlyLifecycleSchema';
import SharePointPolicyDataService from './SharePointPolicyDataService';
import { parseProductionScoringMetadata } from './ProductionScoringMetadata';
import {
  ANNUAL_TARGET_CATALOGUE_SELECT,
  ADMIN_TEAMS_SELECT,
  ANNUAL_TARGET_COUNT_SELECT,
  BEHAVIOUR_CATALOGUE_SELECT,
  BEHAVIOUR_COUNT_SELECT,
  BEHAVIOUR_OBJECTIVE_LIBRARY_SELECT,
  BEHAVIOUR_ITEM_SELECT,
  BEHAVIOUR_V2_ITEM_SELECT,
  CONFIG_SELECT,
  CORE_ITEM_SELECT,
  KPI_MASTER_CATALOGUE_SELECT,
  KPI_MASTER_COUNT_SELECT,
  PEOPLE_SELECT,
  PERSONAL_ITEM_SELECT,
  QUARTER_ITEM_BASE_SELECT,
  QUARTER_ITEM_BEHAVIOUR_V2_SELECT,
  QUARTER_ITEM_RECOVERY_SELECT,
  QUARTER_REVIEW_SELECT,
  WORKPLAN_ASSIGNMENT_SELECT,
  WORKPLAN_SELECT,
  WORKPLAN_STATUS_SELECT,
  assertProductionQueryFields
} from './ProductionQueryFieldContracts';
import SharePointEmployeeWorkplanV2PersistenceService from './SharePointEmployeeWorkplanV2PersistenceService';
import type { IEmployeeV2CreateWorkplanCommandContext } from './IEmployeeWorkplanV2PersistenceService';
import type {
  IEmployeeBehaviourCommitmentInputV2,
  IEmployeeCoreContributionInputV2,
  IEmployeeCoreWeightingInputV2,
  IEmployeeEvidenceRegistrationInputV2,
  IEmployeePersonalItemInputV2,
  IEmployeeQuarterReadbackV2,
  IEmployeeQuarterUpdateInputV2,
  IEmployeeV2ItemCommandContext,
  IEmployeeV2PersistenceResult,
  IEmployeeV2QuarterCommandContext,
  IEmployeeV2WorkplanCommandContext,
  IEmployeeWorkplanDraftInputV2,
  IEmployeeWorkplanReadbackV2
} from '../models/EmployeeWorkplanV2PersistenceModels';

interface IODataCollection<T> { value: T[]; }

interface IListReadback {
  Id: string;
  Title: string;
  RootFolder: { ServerRelativeUrl: string };
}

interface IFieldReadback {
  InternalName: string;
  TypeAsString: string;
  Required: boolean;
  Indexed: boolean;
  Choices?: string[] | { results: string[] };
}

interface IPersonListItem {
  Id: number;
  PersonKey: string;
  Title: string;
  Email: string;
  ManagerPersonKey?: string;
  ManagerEmail?: string;
  Team?: string;
  JobRole?: string;
  AppRoles?: string[];
  Active: boolean;
  BehaviourFrameworkVersionV2?: string;
  BehaviourRoleTierV2?: BehaviourV2RoleTier;
  BehaviourCadenceV2?: BehaviourV2Cadence;
}

interface IConfigListItem {
  Id: number;
  ConfigKey: string;
  ValueType: ConfigValueType;
  TextValue?: string;
  NumberValue?: number;
  BooleanValue?: boolean;
  DateValue?: string;
  JSONValue?: string;
  Active: boolean;
}

interface IAdminTeamListItem {
  Id: number;
  TeamKey: string;
  TeamName: string;
  TeamLeadPersonKey?: string;
  Active: boolean;
  SortOrder: number;
}

interface ICurrentListItem { Id: number; IsCurrent: boolean; }
interface IWorkplanListItem { Id: number; State: string; }
interface IODataRow { '@odata.etag'?: string; }

interface IWorkplanItem extends IODataRow {
  Id: number;
  WorkplanKey: string;
  PersonKey: string;
  EmployeeDisplayName: string;
  EmployeeEmail: string;
  PerformanceYear: number;
  ManagerPersonKey?: string;
  ManagerDisplayName?: string;
  ManagerEmail?: string;
  State: IAnnualWorkplan['state'];
  AccessState: string;
  TransitionStatus: string;
  TransitionCorrelationKey?: string;
  CoreCategoryWeight: number;
  PersonalCategoryWeight: number;
  BehaviourCategoryWeight: number;
  CategoryWeightingReason?: string;
  SubmittedAt?: string;
  SubmittedByEmail?: string;
  ManagerDecisionComment?: string;
  ApprovedAt?: string;
  ApprovedByEmail?: string;
  LockedAt?: string;
  LockedByEmail?: string;
  RowVersionToken: number;
}

interface IAuditListItem {
  Id: number;
  AuditKey: string;
  EventType: WorkplanAuditEventType | QuarterReviewAuditEventType;
  SubjectType?: 'Workplan' | 'QuarterReview';
  SubjectKey: string;
  PerformanceYear: number;
  Quarter?: QuarterKey;
  ActorEmail: string;
  ActorRole: string;
  EventAt: string;
  Reason?: string;
  BeforeJSON?: string;
  AfterJSON?: string;
  CorrelationKey: string;
  Source: 'SPFx';
  SourceReference?: string;
  Success: boolean;
}

interface IKpiMasterItem {
  KPIID: string;
  KPIVersionKey: string;
  KPIWording: string;
  Pillar: string;
  Workstream: string;
  StrategyTarget?: string;
  AccountableOwnerEmail?: string;
  OwnerSourceCode?: string;
  DataQualityFlags?: string;
  AggregationMethod: string;
  ScoringDirection: string;
  MetricType: string;
  UnitLabel: string;
  RAGParametersJSON?: string;
}

interface IAnnualTargetItem {
  KPIID: string;
  TargetVersionKey: string;
  YearEndTargetValue?: number;
  YearEndTargetText?: string;
  Q1TargetValue?: number;
  Q1TargetText?: string;
  Q2TargetValue?: number;
  Q2TargetText?: string;
  Q3TargetValue?: number;
  Q3TargetText?: string;
  Q4TargetValue?: number;
  Q4TargetText?: string;
}

interface ICoreWorkplanListItem extends IODataRow {
  Id: number;
  WorkplanItemKey: string;
  WorkplanItemNaturalKey: string;
  WorkplanKey: string;
  PersonKey: string;
  PerformanceYear: number;
  KPIID: string;
  KPIVersionKey: string;
  TargetVersionKey: string;
  CoreWorkplanWeight?: number;
  EmployeeKpiRole?: CoreKpiRole;
  DisplayOrder: number;
  ActiveInWorkplan: boolean;
}

interface IBehaviourListItem {
  BehaviourID: string;
  BehaviourVersionKey: string;
  Title: string;
  Description: string;
  AssessmentGuidance?: string;
  DefaultWorkplanWeight?: number;
  DisplayOrder: number;
  IsCurrent: boolean;
}

interface IPersonalWorkplanListItem extends IODataRow {
  Id: number;
  WorkplanItemKey: string;
  WorkplanItemNaturalKey: string;
  WorkplanKey: string;
  PersonKey: string;
  PerformanceYear: number;
  LocalKPIWording: string;
  LocalKPIDescription?: string;
  LocalMeasure: string;
  LocalMetricType?: IPersonalWorkplanItem['measureType'];
  LocalScoringDirection?: IPersonalWorkplanItem['scoringDirection'];
  LocalPercentageScale?: IPersonalWorkplanItem['percentageSourceScale'];
  LocalBaselineValue?: number;
  YearEndTargetValue?: number;
  YearEndTargetText?: string;
  Q1TargetValue?: number;
  Q1TargetText?: string;
  Q2TargetValue?: number;
  Q2TargetText?: string;
  Q3TargetValue?: number;
  Q3TargetText?: string;
  Q4TargetValue?: number;
  Q4TargetText?: string;
  UnitLabel: string;
  PersonalItemWeight?: number;
  DisplayOrder: number;
  ActiveInWorkplan: boolean;
}

interface IBehaviourWorkplanListItem extends IODataRow {
  Id: number;
  WorkplanItemKey: string;
  WorkplanItemNaturalKey: string;
  WorkplanKey: string;
  PersonKey: string;
  PerformanceYear: number;
  BehaviourID: string;
  BehaviourVersionKey: string;
  BehaviourObjectiveSource?: BehaviourObjectiveSource;
  BehaviourObjectiveKey?: string;
  BehaviourObjectiveTitle?: string;
  BehaviourObjectiveDescription?: string;
  BehaviourMeasure?: string;
  UnitLabel?: string;
  BehaviourEvidenceDefinition?: string;
  Q1TargetText?: string;
  Q2TargetText?: string;
  Q3TargetText?: string;
  Q4TargetText?: string;
  Q1BehaviourTargetRating?: BehaviourRating;
  Q2BehaviourTargetRating?: BehaviourRating;
  Q3BehaviourTargetRating?: BehaviourRating;
  Q4BehaviourTargetRating?: BehaviourRating;
  BehaviourItemWeight?: number;
  BehaviourFrameworkVersion?: string;
  BehaviourValueTitleSnapshot?: string;
  BehaviourCorporateValueSnapshot?: string;
  BehaviourRoleTierSnapshot?: BehaviourV2RoleTier;
  BehaviourDescriptorSnapshot?: string;
  BehaviourCadenceSnapshot?: BehaviourV2Cadence;
  BehaviourPeriodKeysSnapshotJSON?: string;
  BehaviourRatingLabelsSnapshotJSON?: string;
  BehaviourCommitmentV2?: string;
  BehaviourPlanningContractVersion?: string;
  BehaviourCurrentLevelV2?: string;
  BehaviourTargetLevelV2?: string;
  BehaviourTargetLevelReasonV2?: string;
  BehaviourPeriodCommitmentsV2JSON?: string;
  BehaviourV2SelectedSuggestionKeysJSON?: string;
  BehaviourV2SelectionSnapshotsJSON?: string;
  BehaviourV2SelectionSnapshotsSHA256?: string;
  BehaviourV2SelectionSnapshotsUtf8ByteLength?: number;
  DisplayOrder: number;
  ActiveInWorkplan: boolean;
}

interface IQuarterReviewListItem extends IODataRow {
  Id: number;
  QuarterReviewKey: string;
  WorkplanKey: string;
  PersonKey: string;
  EmployeeDisplayName: string;
  EmployeeEmail: string;
  PerformanceYear: number;
  Quarter: QuarterKey;
  ManagerPersonKey: string;
  ManagerDisplayName: string;
  ManagerEmail: string;
  CoreCategoryWeightSnapshot?: number;
  PersonalCategoryWeightSnapshot?: number;
  BehaviourCategoryWeightSnapshot?: number;
  WorkplanApprovalCorrelationKey?: string;
  State: IQuarterReview['state'];
  AccessState: IQuarterReview['accessState'];
  TransitionStatus: IQuarterReview['transitionStatus'];
  TransitionCorrelationKey?: string;
  EmployeeSubmissionComment?: string;
  SubmittedAt?: string;
  SubmittedByEmail?: string;
  ManagerDecisionComment?: string;
  ApprovedAt?: string;
  ApprovedByEmail?: string;
  LockedAt?: string;
  LockedByEmail?: string;
  RowVersionToken: number;
  BehaviourFrameworkVersionSnapshot?: string;
  BehaviourRoleTierSnapshot?: BehaviourV2RoleTier;
  BehaviourCadenceSnapshot?: BehaviourV2Cadence;
}

interface IQuarterReviewItemListItem extends IODataRow {
  Id: number;
  QuarterReviewItemKey: string;
  QuarterReviewKey: string;
  WorkplanItemKey: string;
  WorkplanKey: string;
  PersonKey: string;
  PerformanceYear: number;
  Quarter: QuarterKey;
  ItemType: IQuarterReviewItem['itemType'];
  KPIID?: string;
  KPIVersionKey?: string;
  TargetVersionKey?: string;
  ItemWordingSnapshot: string;
  ItemDescriptionSnapshot?: string;
  MeasureSnapshot?: string;
  PillarSnapshot?: string;
  WorkstreamSnapshot?: string;
  OwnerEmailSnapshot?: string;
  UnitLabelSnapshot?: string;
  MetricTypeSnapshot?: string;
  ScoringDirectionSnapshot?: string;
  PercentageScaleSnapshot?: 'Fraction' | 'Whole';
  BaselineValueSnapshot?: number;
  YearEndTargetValueSnapshot?: number;
  YearEndTargetTextSnapshot?: string;
  QuarterTargetValue?: number;
  QuarterTargetText?: string;
  EmployeeActualValue?: number;
  EmployeeActualText?: string;
  ProgressPct?: number;
  CalculatedRAG?: IQuarterReviewItem['calculatedRag'];
  CalculationRuleVersion?: string;
  StatusUpdate?: string;
  EvidenceCount: number;
  BTGAction?: string;
  NextReviewDate?: string;
  QuarterEndForecastValue?: number;
  QuarterEndForecastText?: string;
  ManagerComment?: string;
  ManagerOverrideRAG?: IQuarterReviewItem['calculatedRag'];
  OverrideReason?: string;
  OverrideByEmail?: string;
  OverrideAt?: string;
  FinalRAG?: IQuarterReviewItem['calculatedRag'];
  ContributionWeightSnapshot?: number;
  WorkplanItemWeightSnapshot?: number;
  ManagerApproved: boolean;
  Locked: boolean;
  BTGRoute?: RecoveryRoute;
  BTGOwnerPersonKey?: string;
  BTGDueDate?: string;
  BTGStatus?: RecoveryStatus;
  BTGExpectedReturnToGreenDate?: string;
  BTGExpectedReducedOutcome?: string;
  ReforecastProposedTarget?: string;
  ReforecastProposedDate?: string;
  ReforecastReason?: string;
  ReforecastApprovalStatus?: ReforecastApprovalStatus;
  EscalationDependency?: string;
  EscalatedTo?: string;
  EscalationTargetDecisionDate?: string;
  BehaviourExamples?: string;
  ManagerBehaviourAssessment?: IQuarterReviewItem['managerBehaviourAssessment'];
  BehaviourIDSnapshot?: string;
  BehaviourVersionKeySnapshot?: string;
  BehaviourTitleSnapshot?: string;
  BehaviourDescriptionSnapshot?: string;
  BehaviourGuidanceSnapshot?: string;
  BehaviourObjectiveKeySnapshot?: string;
  BehaviourObjectiveSourceSnapshot?: BehaviourObjectiveSource;
  BehaviourObjectiveTitleSnapshot?: string;
  BehaviourEvidenceDefSnapshot?: string;
  BehaviourTargetRating?: BehaviourRating;
  EmployeeBehaviourRating?: BehaviourRating;
  ManagerBehaviourRating?: BehaviourRating;
  FinalBehaviourRating?: BehaviourRating;
  BehaviourFrameworkVersionSnapshot?: string;
  BehaviourValueTitleSnapshot?: string;
  BehaviourCorporateValueSnapshot?: string;
  BehaviourRoleTierSnapshot?: BehaviourV2RoleTier;
  BehaviourDescriptorSnapshot?: string;
  BehaviourCadenceSnapshot?: BehaviourV2Cadence;
  BehaviourPeriodKeysSnapshotJSON?: string;
  BehaviourPeriodSnapshot?: BehaviourV2Period;
  BehaviourRatingLabelsSnapshotJSON?: string;
  BehaviourAnnualTargetLevelV2?: IQuarterReviewItem['behaviourAnnualTargetLevelV2'];
  BehaviourAnnualTargetJustificationV2?: string;
  BehaviourAnnualTargetSourceWorkplanItemKeyV2?: string;
  BehaviourAnnualTargetSourceEtagV2?: string;
  BehaviourAnnualTargetSourceWorkplanVersionV2?: number;
  BehaviourAnnualTargetSourceApprovalKeyV2?: string;
  EmployeeBehaviourEvidenceV2?: string;
  EmployeeBehaviourAssessmentV2?: 1 | 2 | 3;
  ManagerBehaviourEvidenceV2?: string;
  ManagerBehaviourAssessmentV2?: 1 | 2 | 3;
  FinalBehaviourEvidenceV2?: string;
  FinalBehaviourAssessmentV2?: 1 | 2 | 3;
}

interface IBehaviourObjectiveLibraryListItem extends IODataRow {
  Id: number;
  BehaviourObjectiveKey: string;
  BehaviourKey: BehaviourKey;
  ObjectiveTitle: string;
  ObjectiveDescription: string;
  SuggestedMeasure: string;
  SuggestedUnit: string;
  SuggestedEvidence: string;
  Active: boolean;
  SortOrder: number;
  EffectiveFrom?: string;
  EffectiveTo?: string;
}

interface IProgressLedgerListItem extends IODataRow {
  Id: number;
  ProgressLedgerKey: string;
  WorkplanItemKey: string;
  WorkplanKey: string;
  PersonKey: string;
  PerformanceYear: number;
  ItemType: IQuarterReviewItem['itemType'];
  KPIID?: string;
  ProgressEntriesJSON?: string;
  LatestMonth?: string;
  LatestStatus?: IProgressEntry['status'];
  LatestUpdatedAt?: string;
  Locked: boolean;
  RowVersionToken: number;
}

interface IWorkplanAssignmentReadback {
  Id: number;
  WorkplanItemKey: string;
  WorkplanKey: string;
  PersonKey: string;
  ItemType: 'CoreGold' | 'LocalPersonal' | 'Behaviour';
  KPIID?: string;
  KPIVersionKey?: string;
  TargetVersionKey?: string;
  CoreWorkplanWeight?: number;
  PersonalItemWeight?: number;
  BehaviourItemWeight?: number;
  BehaviourID?: string;
  ActiveInWorkplan: boolean;
}

interface IEvidenceListItem {
  EvidenceKey: string;
  PersonKey: string;
  WorkplanKey: string;
  WorkplanItemKey: string;
  QuarterReviewKey?: string;
  QuarterReviewItemKey?: string;
  KPIID?: string;
  PerformanceYear: number;
  Quarter?: QuarterKey;
  EvidenceStatus: IQuarterEvidenceReference['status'];
  EvidenceDescription: string;
  FileRef?: string;
}

const LISTS = {
  people: 'KCFKPI_People',
  teams: 'KCFKPI_Teams',
  config: 'KCFKPI_Config',
  kpiMaster: 'KCFKPI_KPIMaster',
  annualTargets: 'KCFKPI_AnnualTargets',
  behaviours: 'KCFKPI_Behaviours',
  workplans: 'KCFKPI_Workplans',
  workplanItems: 'KCFKPI_WorkplanItems',
  audit: 'KCFKPI_Audit',
  quarterReviews: 'KCFKPI_QuarterReviews',
  quarterReviewItems: 'KCFKPI_QuarterReviewItems',
  progressNotes: 'KCFKPI_ProgressNotes',
  evidence: 'KCFKPI_Evidence',
  behaviourObjectiveLibrary: 'KCFKPI_BehaviourObjectiveLibrary'
} as const;

const AUDIT_SELECT = 'Id,AuditKey,EventType,SubjectType,SubjectKey,PerformanceYear,Quarter,ActorEmail,ActorRole,EventAt,Reason,BeforeJSON,AfterJSON,CorrelationKey,Source,SourceReference,Success';
const PROGRESS_LEDGER_SELECT = 'Id,ProgressLedgerKey,WorkplanItemKey,WorkplanKey,PersonKey,PerformanceYear,ItemType,KPIID,ProgressEntriesJSON,LatestMonth,LatestStatus,LatestUpdatedAt,Locked,RowVersionToken';
const EVIDENCE_SELECT = 'EvidenceKey,PersonKey,WorkplanKey,WorkplanItemKey,QuarterReviewKey,QuarterReviewItemKey,KPIID,PerformanceYear,Quarter,EvidenceStatus,EvidenceDescription,FileRef';
const REST_NULL: unknown = JSON.parse('null');
const assertQuarterV02PhysicalReadiness = (snapshot: unknown): void => {
  if (snapshot) throw new Error('Behaviour v02 Quarter Review preparation is blocked until separate annual Target and quarterly Current/Actual physical fields are bound and verified.');
};
const RATING_BEHAVIOUR_ASSESSMENTS: Record<BehaviourRating, BehaviourAssessment> = {
  4: 'ExceedsExpectations',
  3: 'MeetsExpectations',
  2: 'Developing',
  1: 'InsufficientEvidence'
};

const issuedEventHistoryCapabilities = new WeakSet<object>();
const issuedKpiRemediationQueues = new WeakMap<object, IAuthoritativeAdminKpiRemediationIssues>();

/** Runtime proof only: copied fields and caller-created role objects cannot reproduce membership. */
export const isAuthoritativeAdminEventHistoryCapability = (
  value: unknown
): value is IAuthoritativeAdminEventHistoryCapability => (
  typeof value === 'object'
  && value !== null
  && issuedEventHistoryCapabilities.has(value)
);

/** Resolves only the immutable issue set bound to an authoritative production readback capability. */
export const resolveAuthoritativeAdminKpiRemediationIssues = (
  value: unknown
): IAuthoritativeAdminKpiRemediationIssues => {
  if (typeof value !== 'object' || value === null || !issuedKpiRemediationQueues.has(value)) {
    throw new Error('Controlled KPI remediation requires an opaque authoritative queue readback capability.');
  }
  return issuedKpiRemediationQueues.get(value)!;
};

const issueAdminEventHistoryCapability = (
  person: IProductionPerson
): IAuthoritativeAdminEventHistoryCapability => {
  const capability = Object.freeze({
    actorEmail: person.email.trim(),
    personKey: person.personKey.trim(),
    authorisationSource: 'AuthoritativePeopleReadback' as const
  });
  issuedEventHistoryCapabilities.add(capability);
  return capability;
};

const issueAdminKpiRemediationQueueCapability = (
  person: IProductionPerson,
  performanceYear: number,
  issues: readonly IAdminKpiRemediationSourceIssue[]
): IAuthoritativeAdminKpiRemediationQueueCapability => {
  const boundIssues = issues.map(issue => Object.freeze({ ...issue }));
  Object.defineProperty(boundIssues, 'authoritativeActorEmail', {
    value: person.email.trim(),
    enumerable: false,
    configurable: false,
    writable: false
  });
  const authoritativeIssues = Object.freeze(boundIssues) as IAuthoritativeAdminKpiRemediationIssues;
  const capability = Object.freeze({
    actorEmail: person.email.trim(),
    personKey: person.personKey.trim(),
    performanceYear,
    issueCount: boundIssues.length,
    sourceList: 'KCFKPI_KPIMaster' as const,
    authorisationSource: 'AuthoritativeKpiDataQualityReadback' as const
  });
  issuedKpiRemediationQueues.set(capability, authoritativeIssues);
  return capability;
};

export default class SharePointProductionDataService implements IProductionDataService {
  private readonly employeeV2Persistence: SharePointEmployeeWorkplanV2PersistenceService;

  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly authenticatedEmail: string
  ) {
    this.employeeV2Persistence = new SharePointEmployeeWorkplanV2PersistenceService(
      spHttpClient, webAbsoluteUrl, authenticatedEmail
    );
  }

  public getEmployeeWorkplanV2(actor: IProductionPerson, performanceYear: number): Promise<IEmployeeWorkplanReadbackV2 | undefined> {
    return this.employeeV2Persistence.getEmployeeWorkplanV2(actor, performanceYear);
  }

  public createEmployeeWorkplanDraftV2(context: IEmployeeV2CreateWorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.createEmployeeWorkplanDraftV2(context);
  }

  public saveEmployeeWorkplanDraftV2(context: IEmployeeV2WorkplanCommandContext, input: IEmployeeWorkplanDraftInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.saveEmployeeWorkplanDraftV2(context, input);
  }

  public upsertCoreContributionV2(context: IEmployeeV2ItemCommandContext, input: IEmployeeCoreContributionInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.upsertCoreContributionV2(context, input);
  }

  public upsertPersonalItemV2(context: IEmployeeV2ItemCommandContext, input: IEmployeePersonalItemInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.upsertPersonalItemV2(context, input);
  }

  public upsertBehaviourCommitmentV2(context: IEmployeeV2ItemCommandContext, input: IEmployeeBehaviourCommitmentInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.upsertBehaviourCommitmentV2(context, input);
  }

  public setCoreWeightingV2(context: IEmployeeV2WorkplanCommandContext, input: IEmployeeCoreWeightingInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.setCoreWeightingV2(context, input);
  }

  public submitEmployeeWorkplanV2(context: IEmployeeV2WorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.submitEmployeeWorkplanV2(context);
  }

  public requestEmployeeWorkplanChangesV2(context: IEmployeeV2WorkplanCommandContext, reason: string): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.requestEmployeeWorkplanChangesV2(context, reason);
  }

  public createEmployeeWorkplanAmendmentV2(context: IEmployeeV2WorkplanCommandContext, reason: string, controlReference: string): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.createEmployeeWorkplanAmendmentV2(context, reason, controlReference);
  }

  public approveAndLockEmployeeWorkplanV2(context: IEmployeeV2WorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    return this.employeeV2Persistence.approveAndLockEmployeeWorkplanV2(context);
  }

  public getEmployeeQuarterV2(context: IEmployeeV2QuarterCommandContext): Promise<IEmployeeQuarterReadbackV2 | undefined> {
    return this.employeeV2Persistence.getEmployeeQuarterV2(context);
  }

  public saveEmployeeQuarterUpdateV2(context: IEmployeeV2QuarterCommandContext, input: IEmployeeQuarterUpdateInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>> {
    return this.employeeV2Persistence.saveEmployeeQuarterUpdateV2(context, input);
  }

  public registerEmployeeQuarterEvidenceV2(context: IEmployeeV2QuarterCommandContext, input: IEmployeeEvidenceRegistrationInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>> {
    return this.employeeV2Persistence.registerEmployeeQuarterEvidenceV2(context, input);
  }

  public submitEmployeeQuarterV2(context: IEmployeeV2QuarterCommandContext, comment?: string): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>> {
    return this.employeeV2Persistence.submitEmployeeQuarterV2(context, comment);
  }

  public async getQuarterlyLifecycleSchemaStatus(): Promise<IQuarterlyLifecycleSchemaReadback> {
    this.assertQuarterlyMigrationSite();
    const [quarterList, auditList] = await Promise.all([
      this.getJson<IListReadback>(
        `${this.webAbsoluteUrl}/_api/web/lists/getbytitle('${LISTS.quarterReviewItems}')?$select=Id,Title,RootFolder/ServerRelativeUrl&$expand=RootFolder`,
        'The production Quarter Review Item list could not be verified.'
      ),
      this.getJson<IListReadback>(
        `${this.webAbsoluteUrl}/_api/web/lists/getbytitle('${LISTS.audit}')?$select=Id,Title,RootFolder/ServerRelativeUrl&$expand=RootFolder`,
        'The production Audit list could not be verified.'
      )
    ]);
    const [statusUpdate, eventType] = await Promise.all([
      this.getJson<IFieldReadback>(
        `${this.webAbsoluteUrl}/_api/web/lists(guid'${quarterList.Id}')/fields/getbyinternalnameortitle('StatusUpdate')?$select=InternalName,TypeAsString,Required,Indexed,Choices`,
        'The production StatusUpdate field could not be verified.'
      ),
      this.getJson<IFieldReadback>(
        `${this.webAbsoluteUrl}/_api/web/lists(guid'${auditList.Id}')/fields/getbyinternalnameortitle('EventType')?$select=InternalName,TypeAsString,Required,Indexed,Choices`,
        'The production Audit EventType field could not be verified.'
      )
    ]);
    const eventChoices = Array.isArray(eventType.Choices) ? eventType.Choices : eventType.Choices?.results || [];
    const validation = validateQuarterlyLifecycleSchema(
      { type: statusUpdate.TypeAsString, required: statusUpdate.Required },
      { type: eventType.TypeAsString, required: eventType.Required, choices: eventChoices }
    );
    return {
      quarterReviewItemListId: quarterList.Id,
      quarterReviewItemListUrl: quarterList.RootFolder.ServerRelativeUrl,
      auditListId: auditList.Id,
      auditListUrl: auditList.RootFolder.ServerRelativeUrl,
      statusUpdateRequired: statusUpdate.Required,
      statusUpdateType: statusUpdate.TypeAsString,
      auditEventTypeRequired: eventType.Required,
      auditEventTypeChoices: eventChoices,
      missingAuditEventTypes: validation.missingAuditEventTypes,
      mismatches: validation.mismatches,
      statusUpdateChanged: false,
      auditChoicesAdded: []
    };
  }

  public async getPersonByEmail(email: string): Promise<IProductionPerson | undefined> {
    const normalisedEmail = email.trim().toLowerCase();
    const rows = await this.getItems<IPersonListItem>(
      LISTS.people,
      PEOPLE_SELECT,
      `Email eq '${this.escapeOData(normalisedEmail)}'`,
      'Id',
      2
    );
    if (rows.length > 1) throw new Error('More than one production People record matches this email.');
    const row = rows[0];
    return row ? this.mapProductionPerson(row) : undefined;
  }

  public async getDirectReports(manager: IProductionPerson): Promise<IProductionPerson[]> {
    this.assertAuthenticatedPerson(manager);
    const rows = await this.getItems<IPersonListItem>(
      LISTS.people,
      PEOPLE_SELECT,
      `ManagerPersonKey eq '${this.escapeOData(manager.personKey)}' and Active eq 1`,
      'Title',
      501
    );
    if (rows.length > 500) throw new Error('The direct-report People query exceeded its controlled limit and requires paging before use.');
    const managerEmail = manager.email.trim().toLowerCase();
    const reports = rows.map(row => this.mapProductionPerson(row));
    if (reports.some(report => report.personKey === manager.personKey
      || report.managerPersonKey !== manager.personKey
      || report.managerEmail?.trim().toLowerCase() !== managerEmail)) {
      throw new Error('The production People hierarchy contains an inconsistent direct-report manager relationship.');
    }
    if (new Set(reports.map(report => report.personKey)).size !== reports.length
      || new Set(reports.map(report => report.email.trim().toLowerCase())).size !== reports.length) {
      throw new Error('The production People hierarchy contains duplicate direct-report identities.');
    }
    return reports.sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  public async getAdminPeople(actor: IProductionPerson): Promise<IProductionPerson[]> {
    await this.assertAuthoritativeAdmin(actor);
    const rows = await this.getItems<IPersonListItem>(
      LISTS.people,
      PEOPLE_SELECT,
      'Id gt 0',
      'Title',
      500
    );
    if (rows.length === 500) throw new Error('The People Admin read reached its safety limit. No partial roster was shown.');
    const keys = rows.map(row => row.PersonKey.trim().toLowerCase());
    const emails = rows.map(row => row.Email.trim().toLowerCase());
    if (new Set(keys).size !== rows.length || new Set(emails).size !== rows.length) {
      throw new Error('The People list contains duplicate PersonKey or Email values. Admin editing was blocked.');
    }
    return rows.map(row => this.mapProductionPerson(row));
  }

  public async getAdminTeams(actor: IProductionPerson): Promise<IAdminTeamRecord[]> {
    await this.assertAuthoritativeAdmin(actor);
    const rows = await this.getItems<IAdminTeamListItem>(
      LISTS.teams,
      ADMIN_TEAMS_SELECT,
      'Id gt 0',
      'SortOrder,TeamName',
      500
    );
    if (rows.length === 500) throw new Error('The Teams Admin read reached its safety limit. No partial Team list was shown.');
    if (new Set(rows.map(row => row.TeamKey.trim().toLowerCase())).size !== rows.length) {
      throw new Error('The Teams list contains duplicate TeamKey values. Admin editing was blocked.');
    }
    return rows.map(row => ({
      id: row.Id,
      teamKey: row.TeamKey,
      teamName: row.TeamName,
      teamLeadPersonKey: row.TeamLeadPersonKey || undefined,
      active: row.Active,
      sortOrder: row.SortOrder
    }));
  }

  public async getAdminConfigRecords(actor: IProductionPerson): Promise<IAdminConfigSourceRecord[]> {
    await this.assertAuthoritativeAdmin(actor);
    const rows = await this.getItems<IAdminConfigListItemReadback>(
      LISTS.config,
      ADMIN_CONFIG_AUDIT_SELECT,
      `Environment eq 'Production'`,
      'ConfigKey',
      500,
      ADMIN_CONFIG_AUDIT_EXPAND
    );
    if (rows.length === 500) throw new Error('The Config Admin read reached its safety limit. No partial configuration was shown.');
    return rows.map(mapAdminConfigSourceRecord);
  }

  public async getAuthoritativeAdminEventHistoryCapability(): Promise<IAuthoritativeAdminEventHistoryCapability> {
    const current = await this.readAuthoritativeSystemAdmin();
    return issueAdminEventHistoryCapability(current);
  }

  public async getAuthoritativeAdminEventHistoryView(performanceYear: number): Promise<IAdminEventHistoryView> {
    // Resolve the signed-in identity before touching the protected Audit list.
    const current = await this.readAuthoritativeSystemAdmin();
    if (!Number.isInteger(performanceYear) || performanceYear < 2000 || performanceYear > 2100) {
      throw new Error('Admin event history requires a supported PerformanceYear from 2000 to 2100.');
    }
    const capability = issueAdminEventHistoryCapability(current);
    const listUrl = this.listItemsUrl(LISTS.audit);
    const pageSize = 500;
    const capacity = 5000;
    let url: string | undefined = `${listUrl}?$select=${AUDIT_SELECT}&$filter=${encodeURIComponent(`PerformanceYear eq ${performanceYear}`)}&$orderby=${encodeURIComponent('Id asc')}&$top=${pageSize}`;
    const rows: IAuditListItem[] = [];
    const visited = new Set<string>();
    while (url) {
      if (!url.startsWith(`${listUrl}?`) || visited.has(url)) {
        throw new Error('Admin event history returned an invalid Audit page continuation.');
      }
      visited.add(url);
      const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
        headers: { Accept: 'application/json;odata=nometadata' }
      });
      await this.ensureSuccess(response, 'Controlled Admin event history could not load.');
      const page = await response.json() as IODataCollection<IAuditListItem> & {
        'odata.nextLink'?: string; '@odata.nextLink'?: string
      };
      if (!Array.isArray(page.value) || page.value.length > pageSize || rows.length + page.value.length > capacity) {
        throw new Error('Admin event history exceeded its controlled page or capacity limit.');
      }
      rows.push(...page.value);
      const continuations = [page['odata.nextLink'], page['@odata.nextLink']]
        .filter(value => value !== undefined);
      if (continuations.some(value => typeof value !== 'string' || !value || value.trim() !== value)
        || (continuations.length === 2 && continuations[0] !== continuations[1])) {
        throw new Error('Admin event history returned an invalid Audit page continuation.');
      }
      url = continuations[0];
      if (url && page.value.length === 0) {
        throw new Error('Admin event history returned an empty Audit continuation page.');
      }
      if (url && rows.length >= capacity) {
        throw new Error('Admin event history exceeded its controlled capacity. No partial history was shown.');
      }
    }
    const mapped: IAdminControlledEventHistoryRecord[] = rows.map(row => ({
      id: row.Id, auditKey: row.AuditKey, eventType: row.EventType as IAdminControlledEventHistoryRecord['eventType'],
      subjectKey: row.SubjectKey, performanceYear: row.PerformanceYear, quarter: row.Quarter === null ? undefined : row.Quarter,
      actorEmail: row.ActorEmail, actorRole: row.ActorRole, eventAt: row.EventAt,
      reason: row.Reason === null ? undefined : row.Reason,
      beforeJson: row.BeforeJSON === null ? undefined : row.BeforeJSON,
      afterJson: row.AfterJSON === null ? undefined : row.AfterJSON,
      correlationKey: row.CorrelationKey, source: row.Source,
      sourceReference: row.SourceReference === null ? undefined : row.SourceReference,
      success: row.Success
    }));
    if (mapped.some(row => row.performanceYear !== performanceYear)) {
      throw new Error('Admin event history returned an event outside the requested PerformanceYear.');
    }
    return investigateAdminEventHistory(capability, mapped);
  }

  public async getAuthoritativeAdminKpiRemediationQueueCapability(
    performanceYear: number
  ): Promise<IAuthoritativeAdminKpiRemediationQueueCapability> {
    const current = await this.readAuthoritativeSystemAdmin();
    if (!Number.isInteger(performanceYear) || performanceYear < 2000 || performanceYear > 2100) {
      throw new Error('Controlled KPI remediation requires a supported authoritative PerformanceYear.');
    }
    const catalogue = await this.getCoreKpiCatalogue(performanceYear);
    const queue = buildKpiDataQualityQueue(
      catalogue,
      buildKpiDataQualityOptionsFromCatalogue(catalogue, performanceYear)
    );
    const issues: IAdminKpiRemediationSourceIssue[] = projectKpiDataQualityIssues(queue)
      .filter(issue => issue.scope === 'KPI' && Boolean(issue.kpiId && issue.sourceIssueCode))
      .map(issue => ({
        scope: 'KPI' as const,
        issueKey: issue.issueKey,
        issueType: issue.issueType,
        sourceIssueCode: issue.sourceIssueCode!,
        kpiId: issue.kpiId!,
        status: issue.status,
        sourceReference: issue.sourceReference
      }));
    return issueAdminKpiRemediationQueueCapability(current, performanceYear, issues);
  }

  public async getProductionConfig(): Promise<IProductionConfig> {
    const rows = await this.getItems<IConfigListItem>(
      LISTS.config,
      CONFIG_SELECT,
      `Environment eq 'Production'`,
      'ConfigKey',
      100
    );
    const mapped: IConfigRecord[] = rows.map(row => ({
      id: row.Id,
      key: row.ConfigKey,
      valueType: row.ValueType,
      textValue: row.TextValue,
      numberValue: row.NumberValue,
      booleanValue: row.BooleanValue,
      dateValue: row.DateValue,
      jsonValue: row.JSONValue,
      active: row.Active
    }));
    return mapProductionConfig(mapped);
  }

  public async getReferenceCounts(performanceYearNumber: number): Promise<IReferenceCounts> {
    const [kpis, targets, behaviours] = await Promise.all([
      this.getItems<ICurrentListItem>(LISTS.kpiMaster, KPI_MASTER_COUNT_SELECT, `DefinitionStatus eq 'Active'`, 'Id', 5000),
      this.getItems<ICurrentListItem>(LISTS.annualTargets, ANNUAL_TARGET_COUNT_SELECT, `PerformanceYear eq ${performanceYearNumber} and TargetStatus eq 'Approved'`, 'Id', 5000),
      this.getItems<ICurrentListItem>(LISTS.behaviours, BEHAVIOUR_COUNT_SELECT, `Status eq 'Published'`, 'Id', 100)
    ]);
    return {
      activeKpis: kpis.filter(row => row.IsCurrent).length,
      approvedAnnualTargets: targets.filter(row => row.IsCurrent).length,
      publishedBehaviours: behaviours.filter(row => row.IsCurrent).length
    };
  }

  public async getWorkplanStatus(personKey: string, performanceYearNumber: number): Promise<string> {
    const workplanKey = `${personKey}|${performanceYearNumber}`;
    const rows = await this.getItems<IWorkplanListItem>(
      LISTS.workplans,
      WORKPLAN_STATUS_SELECT,
      `WorkplanKey eq '${this.escapeOData(workplanKey)}'`,
      'Id',
      2
    );
    if (rows.length > 1) throw new Error('Duplicate production Workplan headers exist for this employee and year.');
    return rows[0]?.State || 'Not started';
  }

  public async getOrCreateDraftWorkplan(
    employee: IProductionPerson,
    manager: IProductionPerson | undefined,
    config: IProductionConfig
  ): Promise<IAnnualWorkplan> {
    if (!manager) throw new Error('The exact active manager is required before governed Workplan creation.');
    const result = await this.createEmployeeWorkplanDraftV2({
      commandKey: `CreateWorkplanDraft|${employee.personKey}|${config.performanceYearNumber}`,
      actor: employee,
      manager,
      performanceYear: config.performanceYearNumber
    });
    return result.readback.workplan;
  }

  public async saveWorkplanCategoryWeights(
    workplan: IAnnualWorkplan,
    weights: IWorkplanCategoryWeights,
    reason?: string
  ): Promise<IAnnualWorkplan> {
    this.assertAuthenticatedWorkplan(workplan);
    this.assertEditable(workplan);
    const currentRows = await this.getWorkplansByKey(workplan.workplanKey);
    if (currentRows.length !== 1) throw new Error('The Annual Workplan could not be uniquely resolved before saving category weights.');
    const current = this.mapWorkplan(currentRows[0]);
    if (current.etag !== workplan.etag || current.rowVersionToken !== workplan.rowVersionToken) {
      throw new Error('The Workplan changed after it was loaded. Reload before saving category weights.');
    }
    this.assertAuthenticatedWorkplan(current);
    this.assertEditable(current);
    const personal = await this.getPersonalWorkplanItems(current.workplanKey);
    const validation = validateWorkplanCategoryWeights(
      weights,
      personal.filter(item => item.activeInWorkplan).length,
      reason
    );
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    const controlledReason = reason?.trim();
    await this.mergeJson(this.listItemUrl(LISTS.workplans, current.id), {
      CoreCategoryWeight: weights.core,
      PersonalCategoryWeight: weights.personal,
      BehaviourCategoryWeight: weights.behaviours,
      CategoryWeightingReason: controlledReason || REST_NULL,
      RowVersionToken: current.rowVersionToken + 1
    }, current.etag, 'The Workplan category weights could not be saved.');
    const readBack = await this.getWorkplansByKey(current.workplanKey);
    if (readBack.length !== 1) throw new Error('The Workplan category weights could not be read back.');
    const saved = this.mapWorkplan(readBack[0]);
    if (saved.coreCategoryWeight !== weights.core
      || saved.personalCategoryWeight !== weights.personal
      || saved.behaviourCategoryWeight !== weights.behaviours
      || (saved.categoryWeightReason || '') !== (controlledReason || '')
      || saved.rowVersionToken !== current.rowVersionToken + 1) {
      throw new Error('The Workplan category-weight read-back did not match the authorised proposal.');
    }
    return saved;
  }

  public async getCoreKpiCatalogue(performanceYearNumber: number): Promise<ICoreKpiCatalogueItem[]> {
    const policyDataService = new SharePointPolicyDataService(this.spHttpClient, this.webAbsoluteUrl);
    const [kpis, targets, milestoneStages] = await Promise.all([
      this.getItems<IKpiMasterItem>(
        LISTS.kpiMaster,
        KPI_MASTER_CATALOGUE_SELECT,
        `DefinitionStatus eq 'Active' and IsCurrent eq 1`,
        'KPIID',
        5000
      ),
      this.getItems<IAnnualTargetItem>(
        LISTS.annualTargets,
        ANNUAL_TARGET_CATALOGUE_SELECT,
        `PerformanceYear eq ${performanceYearNumber} and TargetStatus eq 'Approved' and IsCurrent eq 1`,
        'KPIID',
        5000
      ),
      policyDataService.getMilestoneStageRecords(performanceYearNumber)
    ]);
    const targetsByKpi = new Map<string, IAnnualTargetItem>();
    targets.forEach(target => {
      if (targetsByKpi.has(target.KPIID)) throw new Error(`Duplicate current Annual Targets exist for ${target.KPIID}.`);
      targetsByKpi.set(target.KPIID, target);
    });
    return kpis.map(kpi => {
      const target = targetsByKpi.get(kpi.KPIID);
      const policyMetadata = parseProductionScoringMetadata(kpi.RAGParametersJSON, kpi.KPIID, kpi.KPIVersionKey);
      const approvedMilestonePolicy = policyDataService.resolveCurrentMilestonePolicy(
        milestoneStages,
        performanceYearNumber,
        kpi.KPIID,
        kpi.KPIVersionKey,
        new Date().toISOString(),
        policyMetadata.milestoneVersion
      );
      const source: ICoreKpiCatalogueItem = {
        kpiId: kpi.KPIID,
        kpiVersionKey: kpi.KPIVersionKey,
        targetVersionKey: target?.TargetVersionKey || '',
        wording: kpi.KPIWording,
        pillar: kpi.Pillar,
        workstream: kpi.Workstream,
        strategyTarget: kpi.StrategyTarget || undefined,
        accountableOwnerEmail: kpi.AccountableOwnerEmail || undefined,
        aggregationMethod: kpi.AggregationMethod,
        scoringDirection: kpi.ScoringDirection,
        metricType: kpi.MetricType,
        unitLabel: kpi.UnitLabel,
        percentageSourceScale: policyMetadata.percentageSourceScale,
        sourceScoringDirection: kpi.ScoringDirection,
        sourceMetricType: kpi.MetricType,
        sourceUnitLabel: kpi.UnitLabel,
        ownerSourceCode: kpi.OwnerSourceCode || undefined,
        dataQualityFlags: kpi.DataQualityFlags || undefined,
        // Organisational/reporting weighting is not configured for the
        // employee Workplan. Keep both logical values explicitly unavailable
        // without making either a dependency of this required query.
        portfolioWeight: undefined,
        kpiWeightWithinWorkstream: undefined,
        ragParametersJson: kpi.RAGParametersJSON || undefined,
        baselineValue: policyMetadata.baselineValue,
        kpiThresholdOverride: policyMetadata.kpiThresholdOverride,
        approvedMilestonePolicy,
        approvedScorePolicy: policyMetadata.approvedScorePolicy,
        approvedTargetRangePolicy: policyMetadata.approvedTargetRangePolicy,
        scoringPolicyIssues: policyMetadata.issues,
        yearEndTarget: target ? this.formatTarget(target.YearEndTargetValue, target.YearEndTargetText) : undefined,
        yearEndTargetValue: target?.YearEndTargetValue,
        yearEndTargetText: target?.YearEndTargetText || undefined,
        q1Target: target ? this.formatTarget(target.Q1TargetValue, target.Q1TargetText) : undefined,
        q1TargetValue: target?.Q1TargetValue,
        q1TargetText: target?.Q1TargetText || undefined,
        q2Target: target ? this.formatTarget(target.Q2TargetValue, target.Q2TargetText) : undefined,
        q2TargetValue: target?.Q2TargetValue,
        q2TargetText: target?.Q2TargetText || undefined,
        q3Target: target ? this.formatTarget(target.Q3TargetValue, target.Q3TargetText) : undefined,
        q3TargetValue: target?.Q3TargetValue,
        q3TargetText: target?.Q3TargetText || undefined,
        q4Target: target ? this.formatTarget(target.Q4TargetValue, target.Q4TargetText) : undefined,
        q4TargetValue: target?.Q4TargetValue,
        q4TargetText: target?.Q4TargetText || undefined
      };
      const resolved = resolvePilotScoringClassification(source);
      const pilot = PILOT_SCORING_CLASSIFICATIONS[kpi.KPIID as PilotScoringKpiId];
      const pilotApplies = Boolean(pilot && pilot.status === 'PilotApproved' && pilot.kpiVersionKey === kpi.KPIVersionKey);
      const unresolved = !resolved.scoringDirection?.trim() || resolved.scoringDirection.toUpperCase() === 'TBC'
        || !resolved.metricType?.trim() || resolved.metricType.toUpperCase() === 'TBC';
      return {
        ...resolved,
        classificationStatus: pilotApplies ? 'PilotApproved' : unresolved ? 'UnresolvedTBC' : 'SourceConfirmed',
        classificationSource: pilotApplies ? `${pilot?.source.authority}; ${pilot?.source.evidencePath}; row ${pilot?.source.sourceRow}` : `KCFKPI_KPIMaster ${kpi.KPIVersionKey}`,
        classificationRationale: pilotApplies ? pilot?.rationale : unresolved ? 'The current approved KPI definition retains unresolved scoring metadata.' : 'The current KPI definition contains an approved source classification.'
      };
    });
  }

  public async getCoreWorkplanItems(workplanKey: string): Promise<ICoreWorkplanItem[]> {
    const rows = await this.getItems<ICoreWorkplanListItem>(
      LISTS.workplanItems,
      CORE_ITEM_SELECT,
      `WorkplanKey eq '${this.escapeOData(workplanKey)}' and ItemType eq 'CoreGold'`,
      'DisplayOrder',
      5000
    );
    const naturalKeys = new Set<string>();
    rows.forEach(row => {
      if (naturalKeys.has(row.WorkplanItemNaturalKey)) throw new Error('Duplicate Core KPI assignments exist in this Workplan. Contact the KPI system owner.');
      naturalKeys.add(row.WorkplanItemNaturalKey);
    });
    return rows.map(row => this.mapCoreWorkplanItem(row));
  }

  public async saveCoreWorkplanItem(
    workplan: IAnnualWorkplan,
    kpi: ICoreKpiCatalogueItem,
    weight: number | undefined,
    role: CoreKpiRole | undefined,
    displayOrder: number
  ): Promise<ICoreWorkplanItem> {
    const current = await this.resolveCurrentEditableWorkplan(workplan, 'Core KPI');
    if (!kpi.kpiVersionKey || !kpi.targetVersionKey) throw new Error('Core KPI selection requires current approved KPI and Annual Target versions.');
    if (weight !== undefined && (!Number.isFinite(weight) || weight < 0 || weight > 100)) throw new Error('Core KPI weight must be a number from 0 to 100.');
    const naturalKey = `${current.workplanKey}|CoreGold|${kpi.kpiId}`;
    const existing = await this.getCoreItemsByNaturalKey(naturalKey);
    if (existing.length > 1) throw new Error(`Duplicate Core KPI assignment exists for ${kpi.kpiId}.`);
    const mutable = {
      Title: kpi.kpiId,
      KPIVersionKey: kpi.kpiVersionKey,
      TargetVersionKey: kpi.targetVersionKey,
      CoreWorkplanWeight: weight === undefined ? REST_NULL : weight,
      EmployeeKpiRole: role || REST_NULL,
      DisplayOrder: displayOrder,
      ActiveInWorkplan: true
    };
    if (existing[0]) {
      await this.mergeJson(this.listItemUrl(LISTS.workplanItems, existing[0].Id), mutable, existing[0]['@odata.etag'] || '*', 'The Core KPI Draft item could not be updated.');
    } else {
      await this.postJson(this.listItemsUrl(LISTS.workplanItems), {
        ...mutable,
        WorkplanItemKey: Guid.newGuid().toString(),
        WorkplanItemNaturalKey: naturalKey,
        WorkplanKey: current.workplanKey,
        PersonKey: current.personKey,
        PerformanceYear: current.performanceYear,
        ItemType: 'CoreGold',
        KPIID: kpi.kpiId,
        AddedByEmail: current.employeeEmail,
        AddedAt: new Date().toISOString()
      }, 'The Core KPI Draft item could not be created.');
    }
    const saved = await this.getCoreItemsByNaturalKey(naturalKey);
    if (saved.length !== 1 || !saved[0].ActiveInWorkplan) throw new Error('The Core KPI Draft item could not be verified after saving.');
    return this.mapCoreWorkplanItem(saved[0]);
  }

  public async removeCoreWorkplanItem(workplan: IAnnualWorkplan, item: ICoreWorkplanItem): Promise<void> {
    const current = await this.resolveCurrentEditableWorkplan(workplan, 'Core KPI');
    if (!item.id) return;
    const rows = await this.getCoreItemsByNaturalKey(item.naturalKey);
    if (rows.length !== 1) throw new Error('Exactly one current Core KPI item is required before deactivation.');
    const currentItem = this.mapCoreWorkplanItem(rows[0]);
    const actor = await this.getPersonByEmail(this.authenticatedEmail);
    if (!actor) throw new Error('The authenticated Employee People record could not be verified before Core KPI deactivation.');
    await executeAnnualWorkplanItemDeactivation(() => createAnnualWorkplanItemDeactivationPlan(
      workplan, current, actor, item, currentItem, 'Core KPI'
    ), {
      persistDeactivation: async (after, expectedEtag) => {
        await this.mergeJson(this.listItemUrl(LISTS.workplanItems, after.id), { ActiveInWorkplan: false }, expectedEtag, 'The Core KPI could not be deactivated.');
        const readBack = await this.getCoreItemsByNaturalKey(after.naturalKey);
        if (readBack.length !== 1) throw new Error('The deactivated Core KPI could not be read back exactly once.');
        return this.mapCoreWorkplanItem(readBack[0]);
      }
    });
  }

  public async getPublishedBehaviours(): Promise<IBehaviourSummary[]> {
    const rows = await this.getItems<IBehaviourListItem>(
      LISTS.behaviours,
      BEHAVIOUR_CATALOGUE_SELECT,
      `Status eq 'Published' and IsCurrent eq 1`,
      'DisplayOrder',
      10
    );
    return rows.map(row => ({
      behaviourId: row.BehaviourID,
      behaviourVersionKey: row.BehaviourVersionKey,
      title: row.Title,
      description: row.Description,
      assessmentGuidance: row.AssessmentGuidance || undefined,
      defaultWorkplanWeight: row.DefaultWorkplanWeight ?? 20,
      displayOrder: row.DisplayOrder
    }));
  }

  public async getBehaviourObjectiveLibrary(includeInactive: boolean = false): Promise<IBehaviourObjectiveLibraryRecord[]> {
    const rows = await this.getItems<IBehaviourObjectiveLibraryListItem>(
      LISTS.behaviourObjectiveLibrary,
      BEHAVIOUR_OBJECTIVE_LIBRARY_SELECT,
      includeInactive ? 'Id gt 0' : 'Active eq 1',
      'BehaviourKey,SortOrder',
      500
    );
    if (new Set(rows.map(row => row.BehaviourObjectiveKey)).size !== rows.length) {
      throw new Error('Duplicate Behaviour objective keys exist. Admin reconciliation is required.');
    }
    return rows.map(row => this.mapBehaviourObjective(row));
  }

  public async saveBehaviourObjective(
    actor: IProductionPerson,
    item: IBehaviourObjectiveLibraryRecord
  ): Promise<IBehaviourObjectiveLibraryRecord> {
    this.assertBehaviourObjectiveAdmin(actor);
    this.validateBehaviourObjective(item);
    const key = item.behaviourObjectiveKey.trim();
    const existing = await this.getBehaviourObjectivesByKey(key);
    if (existing.length > 1) throw new Error(`Duplicate Behaviour objective key ${key} exists.`);
    if (item.id && (!existing[0] || existing[0].Id !== item.id)) {
      throw new Error('The Behaviour objective key or row identity changed after it was loaded.');
    }
    const payload = {
      Title: item.objectiveTitle.trim().slice(0, 255),
      BehaviourObjectiveKey: key,
      BehaviourKey: item.behaviourKey,
      ObjectiveTitle: item.objectiveTitle.trim(),
      ObjectiveDescription: item.objectiveDescription.trim(),
      SuggestedMeasure: item.suggestedMeasure.trim(),
      SuggestedUnit: item.suggestedUnit.trim(),
      SuggestedEvidence: item.suggestedEvidence.trim(),
      Active: item.active,
      SortOrder: item.sortOrder,
      EffectiveFrom: item.effectiveFrom,
      EffectiveTo: item.effectiveTo || REST_NULL
    };
    if (existing[0]) {
      await this.mergeJson(
        this.listItemUrl(LISTS.behaviourObjectiveLibrary, existing[0].Id),
        payload,
        item.etag || existing[0]['@odata.etag'] || '*',
        'The Behaviour objective could not be updated.'
      );
    } else {
      await this.postJson(this.listItemsUrl(LISTS.behaviourObjectiveLibrary), payload, 'The Behaviour objective could not be created.');
    }
    const readBack = await this.getBehaviourObjectivesByKey(key);
    if (readBack.length !== 1) throw new Error('The Behaviour objective could not be read back without duplication.');
    const saved = this.mapBehaviourObjective(readBack[0]);
    if (saved.behaviourKey !== item.behaviourKey || saved.objectiveTitle !== item.objectiveTitle.trim()
      || saved.active !== item.active || saved.sortOrder !== item.sortOrder) {
      throw new Error('The Behaviour objective read-back did not match the authorised values.');
    }
    return saved;
  }

  public async setBehaviourObjectiveActive(
    actor: IProductionPerson,
    item: IBehaviourObjectiveLibraryRecord,
    active: boolean
  ): Promise<IBehaviourObjectiveLibraryRecord> {
    return this.saveBehaviourObjective(actor, { ...item, active });
  }

  public async getPersonalWorkplanItems(workplanKey: string): Promise<IPersonalWorkplanItem[]> {
    const rows = await this.getItems<IPersonalWorkplanListItem>(
      LISTS.workplanItems,
      PERSONAL_ITEM_SELECT,
      `WorkplanKey eq '${this.escapeOData(workplanKey)}' and ItemType eq 'LocalPersonal' and ActiveInWorkplan eq 1`,
      'DisplayOrder asc,Id asc',
      6
    );
    this.assertUniqueNaturalKeys(rows, 'Personal KPI');
    return rows.map(row => this.mapPersonalWorkplanItem(row));
  }

  public async savePersonalWorkplanItem(
    workplan: IAnnualWorkplan,
    item: IPersonalWorkplanItem,
    displayOrder: number
  ): Promise<IPersonalWorkplanItem> {
    const current = await this.resolveCurrentEditableWorkplan(workplan, 'Personal KPI');
    const wording = item.wording.trim();
    const measure = item.measure.trim();
    const unitLabel = item.unitLabel.trim();
    const targetText = item.yearEndTargetText?.trim();
    const validation = validatePersonalKpiDefinition(item);
    if (!validation.valid) throw new Error(validation.errors.join(' '));
    if (displayOrder < 1 || displayOrder > 5) throw new Error('A maximum of five Personal KPIs is allowed.');

    const naturalKey = `${current.workplanKey}|LocalPersonal|${item.workplanItemKey.trim()}`;
    const existing = await this.getPersonalItemsByNaturalKey(naturalKey);
    if (existing.length > 1) throw new Error('Duplicate Personal KPI item keys exist. Contact the KPI system owner.');
    const target = resolvePersonalDraftUpsertTarget(item, current.workplanKey, current.personKey, existing[0] ? {
      id: existing[0].Id,
      etag: existing[0]['@odata.etag'] || '*',
      workplanItemKey: existing[0].WorkplanItemKey,
      naturalKey: existing[0].WorkplanItemNaturalKey,
      workplanKey: existing[0].WorkplanKey,
      personKey: existing[0].PersonKey
    } : undefined);
    const mutable = {
      Title: wording.slice(0, 255),
      LocalKPIWording: wording,
      LocalKPIDescription: item.description?.trim() || REST_NULL,
      LocalMeasure: measure,
      LocalMetricType: item.measureType || REST_NULL,
      LocalScoringDirection: item.scoringDirection || REST_NULL,
      LocalPercentageScale: item.percentageSourceScale || REST_NULL,
      LocalBaselineValue: item.baselineValue === undefined ? REST_NULL : item.baselineValue,
      YearEndTargetValue: item.yearEndTargetValue === undefined ? REST_NULL : item.yearEndTargetValue,
      YearEndTargetText: targetText || REST_NULL,
      Q1TargetValue: item.q1TargetValue === undefined ? REST_NULL : item.q1TargetValue,
      Q1TargetText: item.q1TargetText?.trim() || REST_NULL,
      Q2TargetValue: item.q2TargetValue === undefined ? REST_NULL : item.q2TargetValue,
      Q2TargetText: item.q2TargetText?.trim() || REST_NULL,
      Q3TargetValue: item.q3TargetValue === undefined ? REST_NULL : item.q3TargetValue,
      Q3TargetText: item.q3TargetText?.trim() || REST_NULL,
      Q4TargetValue: item.q4TargetValue === undefined ? REST_NULL : item.q4TargetValue,
      Q4TargetText: item.q4TargetText?.trim() || REST_NULL,
      UnitLabel: unitLabel,
      PersonalItemWeight: item.personalItemWeight,
      DisplayOrder: displayOrder,
      ActiveInWorkplan: true
    };
    if (target.persistedId !== undefined) {
      await this.mergeJson(this.listItemUrl(LISTS.workplanItems, target.persistedId), mutable, target.updateEtag as string, 'The Personal KPI Draft item could not be updated.');
    } else {
      await this.postJson(this.listItemsUrl(LISTS.workplanItems), {
        ...mutable,
        WorkplanItemKey: target.workplanItemKey,
        WorkplanItemNaturalKey: target.naturalKey,
        WorkplanKey: current.workplanKey,
        PersonKey: current.personKey,
        PerformanceYear: current.performanceYear,
        ItemType: 'LocalPersonal',
        AddedByEmail: current.employeeEmail,
        AddedAt: new Date().toISOString()
      }, 'The Personal KPI Draft item could not be created.');
    }
    const saved = await this.getPersonalItemsByNaturalKey(target.naturalKey);
    if (saved.length !== 1 || !saved[0].ActiveInWorkplan) throw new Error('The Personal KPI Draft item could not be verified after saving.');
    return this.mapPersonalWorkplanItem(saved[0]);
  }

  public async removePersonalWorkplanItem(workplan: IAnnualWorkplan, item: IPersonalWorkplanItem): Promise<void> {
    const current = await this.resolveCurrentEditableWorkplan(workplan, 'Personal KPI');
    if (!item.id) return;
    const rows = await this.getPersonalItemsByNaturalKey(item.naturalKey);
    if (rows.length !== 1) throw new Error('Exactly one current Personal KPI item is required before deactivation.');
    const currentItem = this.mapPersonalWorkplanItem(rows[0]);
    const actor = await this.getPersonByEmail(this.authenticatedEmail);
    if (!actor) throw new Error('The authenticated Employee People record could not be verified before Personal KPI deactivation.');
    await executeAnnualWorkplanItemDeactivation(() => createAnnualWorkplanItemDeactivationPlan(
      workplan, current, actor, item, currentItem, 'Personal KPI'
    ), {
      persistDeactivation: async (after, expectedEtag) => {
        await this.mergeJson(this.listItemUrl(LISTS.workplanItems, after.id), { ActiveInWorkplan: false }, expectedEtag, 'The Personal KPI could not be deactivated.');
        const readBack = await this.getPersonalItemsByNaturalKey(after.naturalKey);
        if (readBack.length !== 1) throw new Error('The deactivated Personal KPI could not be read back exactly once.');
        return this.mapPersonalWorkplanItem(readBack[0]);
      }
    });
  }

  public async getBehaviourWorkplanItems(workplanKey: string): Promise<IBehaviourWorkplanItem[]> {
    const baseRows = await this.getItems<IBehaviourWorkplanListItem>(
      LISTS.workplanItems,
      BEHAVIOUR_ITEM_SELECT,
      `WorkplanKey eq '${this.escapeOData(workplanKey)}' and ItemType eq 'Behaviour'`,
      'DisplayOrder',
      10
    );
    const hasV02 = baseRows.some(row => row.BehaviourVersionKey === BEHAVIOUR_FRAMEWORK_V2_VERSION);
    const rows = hasV02 ? await this.getItems<IBehaviourWorkplanListItem>(LISTS.workplanItems,
      BEHAVIOUR_V2_ITEM_SELECT,
      `WorkplanKey eq '${this.escapeOData(workplanKey)}' and ItemType eq 'Behaviour'`, 'DisplayOrder', 10) : baseRows;
    if (hasV02) {
      const confirmed = await this.getItems<IBehaviourWorkplanListItem>(LISTS.workplanItems,
        BEHAVIOUR_V2_ITEM_SELECT,
        `WorkplanKey eq '${this.escapeOData(workplanKey)}' and ItemType eq 'Behaviour'`, 'DisplayOrder', 10);
      const baseFields = BEHAVIOUR_ITEM_SELECT.split(',');
      const projection = (values: IBehaviourWorkplanListItem[]): string => JSON.stringify(values.map(row =>
        [row['@odata.etag'], ...baseFields.map(field => row[field as keyof IBehaviourWorkplanListItem])]));
      if (projection(baseRows) !== projection(rows) || JSON.stringify(rows) !== JSON.stringify(confirmed))
        throw new Error('The v02 Behaviour item set changed between its canonical base and full saved readback.');
    }
    this.assertUniqueNaturalKeys(rows, 'Behaviour');
    return rows.map(row => this.mapBehaviourWorkplanItem(row));
  }

  public async saveBehaviourWorkplanItem(
    workplan: IAnnualWorkplan,
    behaviour: IBehaviourSummary,
    item?: IBehaviourWorkplanItem
  ): Promise<IBehaviourWorkplanItem> {
    const current = await this.resolveCurrentEditableWorkplan(workplan, 'Behaviour');
    if (!behaviour.behaviourId || !behaviour.behaviourVersionKey || !Number.isFinite(behaviour.defaultWorkplanWeight) || behaviour.defaultWorkplanWeight < 0 || behaviour.defaultWorkplanWeight > 100) {
      throw new Error('The published Behaviour definition is incomplete.');
    }
    const naturalKey = `${current.workplanKey}|Behaviour|${behaviour.behaviourId}`;
    if (item && (item.naturalKey !== naturalKey || item.workplanKey !== current.workplanKey
      || item.personKey !== current.personKey || item.behaviourId !== behaviour.behaviourId)) {
      throw new Error('This Behaviour objective does not belong to the current employee Workplan.');
    }
    const selectedWeight = item?.behaviourItemWeight ?? behaviour.defaultWorkplanWeight;
    const targetRatings = [
      item?.q1TargetRating || item?.targetRating,
      item?.q2TargetRating || item?.targetRating,
      item?.q3TargetRating || item?.targetRating,
      item?.q4TargetRating || item?.targetRating
    ];
    if (item) {
      const required = [
        item.objectiveTitle, item.objectiveDescription, item.measure, item.unit,
        item.evidenceDefinition, item.q1TargetText, item.q2TargetText,
        item.q3TargetText, item.q4TargetText
      ];
      if (required.some(value => !value?.trim())) throw new Error('The Behaviour objective, measure, unit, evidence definition and four quarterly targets are required.');
      if (item.objectiveSource === 'Library' && !item.sourceObjectiveKey?.trim()) throw new Error('A library Behaviour objective requires its source objective key.');
      if (targetRatings.some(value => !isBehaviourRating(value))) throw new Error('Each Behaviour quarter needs a target rating from 1 to 4.');
    }
    if (!Number.isFinite(selectedWeight) || selectedWeight < 0 || selectedWeight > 100) {
      throw new Error('The Behaviour item weight must be from 0 to 100%.');
    }
    const existing = await this.getBehaviourItemsByNaturalKey(naturalKey);
    if (existing.length > 1) throw new Error(`Duplicate Behaviour assignment exists for ${behaviour.behaviourId}.`);
    const mutable = {
      Title: behaviour.title.slice(0, 255),
      BehaviourVersionKey: behaviour.behaviourVersionKey,
      BehaviourObjectiveSource: item?.objectiveSource || REST_NULL,
      BehaviourObjectiveKey: item?.sourceObjectiveKey?.trim() || REST_NULL,
      BehaviourObjectiveTitle: item?.objectiveTitle?.trim() || REST_NULL,
      BehaviourObjectiveDescription: item?.objectiveDescription?.trim() || REST_NULL,
      BehaviourMeasure: item?.measure?.trim() || REST_NULL,
      UnitLabel: item?.unit?.trim() || REST_NULL,
      BehaviourEvidenceDefinition: item?.evidenceDefinition?.trim() || REST_NULL,
      Q1TargetText: item?.q1TargetText?.trim() || REST_NULL,
      Q2TargetText: item?.q2TargetText?.trim() || REST_NULL,
      Q3TargetText: item?.q3TargetText?.trim() || REST_NULL,
      Q4TargetText: item?.q4TargetText?.trim() || REST_NULL,
      Q1BehaviourTargetRating: targetRatings[0] || REST_NULL,
      Q2BehaviourTargetRating: targetRatings[1] || REST_NULL,
      Q3BehaviourTargetRating: targetRatings[2] || REST_NULL,
      Q4BehaviourTargetRating: targetRatings[3] || REST_NULL,
      BehaviourItemWeight: selectedWeight,
      DisplayOrder: behaviour.displayOrder,
      ActiveInWorkplan: true
    };
    if (existing[0]) {
      await this.mergeJson(this.listItemUrl(LISTS.workplanItems, existing[0].Id), mutable, item?.etag || existing[0]['@odata.etag'] || '*', 'The Behaviour assignment could not be updated.');
    } else {
      await this.postJson(this.listItemsUrl(LISTS.workplanItems), {
        ...mutable,
        WorkplanItemKey: Guid.newGuid().toString(),
        WorkplanItemNaturalKey: naturalKey,
        WorkplanKey: current.workplanKey,
        PersonKey: current.personKey,
        PerformanceYear: current.performanceYear,
        ItemType: 'Behaviour',
        BehaviourID: behaviour.behaviourId,
        AddedByEmail: current.employeeEmail,
        AddedAt: new Date().toISOString()
      }, 'The Behaviour assignment could not be created.');
    }
    const saved = await this.getBehaviourItemsByNaturalKey(naturalKey);
    if (saved.length !== 1 || !saved[0].ActiveInWorkplan) throw new Error('The Behaviour assignment could not be verified after saving.');
    return this.mapBehaviourWorkplanItem(saved[0]);
  }

  public async removeBehaviourWorkplanItem(workplan: IAnnualWorkplan, item: IBehaviourWorkplanItem): Promise<void> {
    const current = await this.resolveCurrentEditableWorkplan(workplan, 'Behaviour');
    if (!item.id) return;
    const rows = await this.getBehaviourItemsByNaturalKey(item.naturalKey);
    if (rows.length !== 1) throw new Error('Exactly one current Behaviour item is required before deactivation.');
    const currentItem = this.mapBehaviourWorkplanItem(rows[0]);
    const actor = await this.getPersonByEmail(this.authenticatedEmail);
    if (!actor) throw new Error('The authenticated Employee People record could not be verified before Behaviour deactivation.');
    await executeAnnualWorkplanItemDeactivation(() => createAnnualWorkplanItemDeactivationPlan(
      workplan, current, actor, item, currentItem, 'Behaviour'
    ), {
      persistDeactivation: async (after, expectedEtag) => {
        await this.mergeJson(this.listItemUrl(LISTS.workplanItems, after.id), { ActiveInWorkplan: false }, expectedEtag, 'The Behaviour assignment could not be deactivated.');
        const readBack = await this.getBehaviourItemsByNaturalKey(after.naturalKey);
        if (readBack.length !== 1) throw new Error('The deactivated Behaviour could not be read back exactly once.');
        return this.mapBehaviourWorkplanItem(readBack[0]);
      }
    });
  }

  public async submitWorkplan(context: IControlledSubmissionContext, actor: IProductionPerson): Promise<IWorkplanSubmissionResult> {
    this.assertAuthenticatedPerson(actor);
    if (!context.workplan) throw new Error('The Annual Workplan could not be found.');
    const currentRows = await this.getWorkplansByKey(context.workplan.workplanKey);
    if (currentRows.length !== 1) throw new Error('Exactly one Annual Workplan is required before submission.');
    const current = this.mapWorkplan(currentRows[0]);
    this.assertAuthenticatedWorkplan(current);

    if (current.state === 'Submitted') {
      const audits = current.transitionCorrelationKey
        ? await this.getTransitionAudits(current.workplanKey, current.transitionCorrelationKey)
        : [];
      const audit = verifyCompletedSubmission(current, actor, audits);
      return { workplan: current, audit, alreadySubmitted: true, storageAclStatus: 'InheritedDependency' };
    }
    if ((current.state !== 'Draft' && current.state !== 'ChangesRequested') || current.etag !== context.workplan.etag || current.rowVersionToken !== context.workplan.rowVersionToken) {
      throw new Error('The editable Workplan changed after it was loaded. Reload before submitting.');
    }

    const currentContext = { ...context, workplan: current };
    const correlationKey = Guid.newGuid().toString();
    const plan = createSubmissionPlan(currentContext, actor, correlationKey, new Date().toISOString());
    await this.mergeJson(this.listItemUrl(LISTS.workplans, current.id), {
      State: 'Submitted',
      AccessState: 'ManagerDecision',
      TransitionStatus: 'InProgress',
      TransitionCorrelationKey: plan.correlationKey,
      SubmittedAt: plan.submittedAt,
      SubmittedByEmail: plan.submittedByEmail,
      ManagerPersonKey: plan.managerPersonKey,
      ManagerDisplayName: plan.managerDisplayName,
      ManagerEmail: plan.managerEmail,
      RowVersionToken: plan.nextRowVersionToken
    }, current.etag, 'The Workplan submission transition could not be started.');

    try {
      const stagedRows = await this.getWorkplansByKey(current.workplanKey);
      if (stagedRows.length !== 1) throw new Error('The submitted Workplan could not be read back.');
      const staged = this.mapWorkplan(stagedRows[0]);
      const audit = await this.appendAudit(plan.audit);
      await this.mergeJson(this.listItemUrl(LISTS.workplans, staged.id), {
        TransitionStatus: 'Ready',
        RowVersionToken: staged.rowVersionToken + 1
      }, staged.etag, 'The Workplan submission could not be finalised.');
      const completedRows = await this.getWorkplansByKey(current.workplanKey);
      if (completedRows.length !== 1) throw new Error('The submitted Workplan could not be verified.');
      const completed = this.mapWorkplan(completedRows[0]);
      verifyCompletedSubmission(completed, actor, [audit]);
      return { workplan: completed, audit, alreadySubmitted: false, storageAclStatus: 'InheritedDependency' };
    } catch (error) {
      await this.markTransitionRecoveryHold(current.workplanKey);
      throw error;
    }
  }

  public async getManagerReviewContexts(manager: IProductionPerson): Promise<IManagerWorkplanReviewContext[]> {
    this.assertAuthenticatedPerson(manager);
    const config = await this.getProductionConfig();
    const rows = await this.getItems<IWorkplanItem>(
      LISTS.workplans,
      WORKPLAN_SELECT,
      `ManagerPersonKey eq '${this.escapeOData(manager.personKey)}' and PerformanceYear eq ${config.performanceYearNumber}`,
      'EmployeeDisplayName',
      100
    );
    const reviewRows = rows.filter(row => ['Submitted', 'ChangesRequested', 'Approved', 'Locked'].indexOf(row.State) >= 0);
    if (reviewRows.length === 0) return [];
    const [coreCatalogue, behaviours] = await Promise.all([
      this.getCoreKpiCatalogue(config.performanceYearNumber),
      this.getPublishedBehaviours()
    ]);
    const contexts: IManagerWorkplanReviewContext[] = [];
    for (const row of reviewRows) {
      const workplan = this.mapWorkplan(row);
      if (!canManagerReadWorkplan(manager, workplan)) throw new Error('A submitted Workplan failed the direct-report authorisation check.');
      const employee = await this.getPersonByEmail(workplan.employeeEmail);
      if (!employee?.active) throw new Error('A submitted direct-report Workplan has no active employee People record.');
      const [coreItems, personalItems, behaviourItems] = await Promise.all([
        this.getCoreWorkplanItems(workplan.workplanKey),
        this.getPersonalWorkplanItems(workplan.workplanKey),
        this.getBehaviourWorkplanItems(workplan.workplanKey)
      ]);
      const readinessContext: IControlledSubmissionContext = {
        workplan, employee, manager, config, coreCatalogue, coreItems, personalItems, behaviours, behaviourItems
      };
      const auditRows = await this.getWorkplanAuditEvents(workplan.workplanKey);
      const submissionAudit = auditRows.filter(audit => audit.eventType === 'WorkplanSubmitted').sort((left, right) => left.eventAt.localeCompare(right.eventAt))[0];
      contexts.push({
        ...readinessContext,
        workplan,
        employee,
        manager,
        readiness: evaluateControlledSubmissionReadiness(readinessContext, false),
        submissionAudit,
        auditEvents: auditRows
      });
    }
    return contexts;
  }

  public async requestWorkplanChanges(
    context: IManagerWorkplanReviewContext,
    actor: IProductionPerson,
    reason: string
  ): Promise<IWorkplanTransitionResult> {
    this.assertAuthenticatedPerson(actor);
    const currentRows = await this.getWorkplansByKey(context.workplan.workplanKey);
    if (currentRows.length !== 1) throw new Error('Exactly one Annual Workplan is required before requesting changes.');
    const current = this.mapWorkplan(currentRows[0]);
    if (current.state === 'ChangesRequested') {
      const audits = current.transitionCorrelationKey
        ? await this.getTransitionAudits(current.workplanKey, current.transitionCorrelationKey)
        : [];
      const verified = verifyCompletedManagerTransition(current, actor, audits, 'ChangesRequested', ['WorkplanChangesRequested']);
      return { workplan: current, audits: verified, alreadyCompleted: true, storageAclStatus: 'InheritedDependency' };
    }
    if (current.etag !== context.workplan.etag || current.rowVersionToken !== context.workplan.rowVersionToken) {
      throw new Error('The submitted Workplan changed after manager review loaded. Reload before requesting changes.');
    }

    const plan = createRequestChangesPlan(current, actor, reason, Guid.newGuid().toString(), new Date().toISOString());
    await this.mergeJson(this.listItemUrl(LISTS.workplans, current.id), {
      State: 'ChangesRequested',
      AccessState: 'EmployeeEdit',
      TransitionStatus: 'InProgress',
      TransitionCorrelationKey: plan.correlationKey,
      ManagerDecisionComment: plan.reason,
      RowVersionToken: plan.nextRowVersionToken
    }, current.etag, 'The Workplan Request Changes transition could not be started.');

    try {
      const stagedRows = await this.getWorkplansByKey(current.workplanKey);
      if (stagedRows.length !== 1) throw new Error('The Changes Requested Workplan could not be read back.');
      const audit = await this.appendAudit(plan.audit);
      const staged = this.mapWorkplan(stagedRows[0]);
      await this.mergeJson(this.listItemUrl(LISTS.workplans, staged.id), {
        TransitionStatus: 'Ready',
        RowVersionToken: staged.rowVersionToken + 1
      }, staged.etag, 'The Workplan Request Changes transition could not be finalised.');
      const completedRows = await this.getWorkplansByKey(current.workplanKey);
      if (completedRows.length !== 1) throw new Error('The Changes Requested Workplan could not be verified.');
      const completed = this.mapWorkplan(completedRows[0]);
      const verified = verifyCompletedManagerTransition(completed, actor, [audit], 'ChangesRequested', ['WorkplanChangesRequested']);
      return { workplan: completed, audits: verified, alreadyCompleted: false, storageAclStatus: 'InheritedDependency' };
    } catch (error) {
      await this.markTransitionRecoveryHold(current.workplanKey);
      throw error;
    }
  }

  public async approveWorkplan(
    context: IManagerWorkplanReviewContext,
    actor: IProductionPerson
  ): Promise<IWorkplanTransitionResult> {
    this.assertAuthenticatedPerson(actor);
    const currentRows = await this.getWorkplansByKey(context.workplan.workplanKey);
    if (currentRows.length !== 1) throw new Error('Exactly one Annual Workplan is required before approval.');
    const current = this.mapWorkplan(currentRows[0]);
    if (current.state === 'Approved') {
      const audits = current.transitionCorrelationKey
        ? await this.getTransitionAudits(current.workplanKey, current.transitionCorrelationKey)
        : [];
      const verified = verifyCompletedManagerTransition(current, actor, audits, 'Approved', ['WorkplanApproved']);
      return { workplan: current, audits: verified, alreadyCompleted: true, storageAclStatus: 'InheritedDependency' };
    }
    if (current.etag !== context.workplan.etag || current.rowVersionToken !== context.workplan.rowVersionToken) {
      throw new Error('The submitted Workplan changed after manager review loaded. Reload before approval.');
    }

    const currentContext: IControlledSubmissionContext = { ...context, workplan: current };
    const correlationKey = Guid.newGuid().toString();
    const approvedAt = new Date().toISOString();
    const plan = createApprovalPlan(currentContext, actor, correlationKey, approvedAt);
    await this.mergeJson(this.listItemUrl(LISTS.workplans, current.id), {
      State: 'Approved',
      AccessState: 'ReadOnly',
      TransitionStatus: 'InProgress',
      TransitionCorrelationKey: plan.correlationKey,
      ApprovedAt: plan.approvedAt,
      ApprovedByEmail: actor.email.trim().toLowerCase(),
      RowVersionToken: plan.nextRowVersionToken
    }, current.etag, 'The Workplan approval transition could not be started.');

    try {
      const approvedRows = await this.getWorkplansByKey(current.workplanKey);
      if (approvedRows.length !== 1) throw new Error('The Approved Workplan could not be read back.');
      const approved = this.mapWorkplan(approvedRows[0]);
      if (approved.id !== current.id || approved.workplanKey !== current.workplanKey
        || approved.state !== 'Approved' || approved.accessState !== 'ReadOnly'
        || approved.transitionStatus !== 'InProgress' || approved.transitionCorrelationKey !== plan.correlationKey
        || approved.rowVersionToken !== plan.nextRowVersionToken
        || approved.approvedAt !== plan.approvedAt || approved.approvedByEmail !== actor.email.trim().toLowerCase()) {
        throw new Error('The Manager approval staging state was not persisted exactly.');
      }
      const approvedAudit = await this.appendAudit(plan.audit);
      assertPersistedWorkplanAuditMatchesPlan(plan.audit, approvedAudit);
      await this.mergeJson(this.listItemUrl(LISTS.workplans, approved.id), {
        TransitionStatus: 'Ready',
        RowVersionToken: approved.rowVersionToken + 1
      }, approved.etag, 'The Workplan approval transition could not be finalised.');

      const completedRows = await this.getWorkplansByKey(current.workplanKey);
      if (completedRows.length !== 1) throw new Error('The Approved Workplan could not be verified.');
      const completed = this.mapWorkplan(completedRows[0]);
      const verified = verifyCompletedManagerTransition(completed, actor, [approvedAudit], 'Approved', ['WorkplanApproved']);
      return { workplan: completed, audits: verified, alreadyCompleted: false, storageAclStatus: 'InheritedDependency' };
    } catch (error) {
      await this.markTransitionRecoveryHold(current.workplanKey);
      throw error;
    }
  }

  public approveAndLockWorkplan(
    context: IManagerWorkplanReviewContext,
    actor: IProductionPerson
  ): Promise<IWorkplanTransitionResult> {
    return this.approveWorkplan(context, actor);
  }

  public async lockApprovedWorkplan(
    loaded: IAnnualWorkplan,
    _actor: IProductionPerson,
    yearGateControlReference: string,
    correlationKey: string
  ): Promise<IWorkplanTransitionResult> {
    const actor = await this.resolveAuthoritativeLifecycleSystemAdmin();
    const currentRows = await this.getWorkplansByKey(loaded.workplanKey);
    if (currentRows.length !== 1) throw new Error('Exactly one Annual Workplan is required before Admin locking.');
    const current = this.mapWorkplan(currentRows[0]);
    if (current.id !== loaded.id || current.workplanKey !== loaded.workplanKey || current.etag !== loaded.etag
      || current.rowVersionToken !== loaded.rowVersionToken) {
      throw new Error('The Manager Approved Workplan changed after it was loaded. Reload before Admin locking.');
    }
    const config = await this.getProductionConfig();
    if ((await this.getTransitionAudits(current.workplanKey, correlationKey)).length > 0) {
      throw new Error('The Admin lock correlation/idempotency key has already been used.');
    }
    const plan = createAdminLockPlan(current, actor, {
      performanceYear: config.performanceYearNumber,
      controlReference: yearGateControlReference
    }, correlationKey, new Date().toISOString());
    await this.mergeJson(this.listItemUrl(LISTS.workplans, current.id), {
      State: 'Locked', AccessState: 'ReadOnly', TransitionStatus: 'InProgress',
      TransitionCorrelationKey: plan.correlationKey, LockedAt: plan.lockedAt,
      LockedByEmail: actor.email.trim().toLowerCase(), RowVersionToken: plan.nextRowVersionToken
    }, current.etag, 'The authorised Admin Workplan lock could not be started.');
    try {
      const stagedRows = await this.getWorkplansByKey(current.workplanKey);
      if (stagedRows.length !== 1) throw new Error('The staged Locked Workplan could not be read back.');
      const staged = this.mapWorkplan(stagedRows[0]);
      if (staged.id !== current.id || staged.workplanKey !== current.workplanKey
        || staged.state !== 'Locked' || staged.accessState !== 'ReadOnly'
        || staged.transitionStatus !== 'InProgress' || staged.transitionCorrelationKey !== plan.correlationKey
        || staged.rowVersionToken !== plan.nextRowVersionToken || staged.lockedAt !== plan.lockedAt
        || staged.lockedByEmail !== actor.email.trim().toLowerCase()
        || staged.approvedAt !== current.approvedAt || staged.approvedByEmail !== current.approvedByEmail) {
        throw new Error('The authorised Admin lock staging state was not persisted exactly.');
      }
      const audit = await this.appendAudit(plan.audit);
      assertPersistedWorkplanAuditMatchesPlan(plan.audit, audit);
      await this.mergeJson(this.listItemUrl(LISTS.workplans, staged.id), {
        TransitionStatus: 'Ready', RowVersionToken: staged.rowVersionToken + 1
      }, staged.etag, 'The authorised Admin Workplan lock could not be finalised.');
      const completedRows = await this.getWorkplansByKey(current.workplanKey);
      if (completedRows.length !== 1) throw new Error('The Locked Workplan could not be verified.');
      const completed = this.mapWorkplan(completedRows[0]);
      if (completed.state !== 'Locked' || completed.accessState !== 'ReadOnly'
        || completed.transitionStatus !== 'Ready' || completed.transitionCorrelationKey !== plan.correlationKey) {
        throw new Error('The authorised Admin Workplan lock did not persist exactly.');
      }
      return { workplan: completed, audits: [audit], alreadyCompleted: false, storageAclStatus: 'InheritedDependency' };
    } catch (error) {
      await this.markTransitionRecoveryHold(current.workplanKey);
      throw error;
    }
  }

  public async reopenLockedWorkplan(
    loaded: IAnnualWorkplan,
    _actor: IProductionPerson,
    reason: string,
    controlReference: string,
    correlationKey: string,
    supersessionControlReference?: string
  ): Promise<IWorkplanTransitionResult> {
    const actor = await this.resolveAuthoritativeLifecycleSystemAdmin();
    const currentRows = await this.getWorkplansByKey(loaded.workplanKey);
    if (currentRows.length !== 1) throw new Error('Exactly one Annual Workplan is required before controlled reopen.');
    const current = this.mapWorkplan(currentRows[0]);
    if (current.id !== loaded.id || current.workplanKey !== loaded.workplanKey || current.etag !== loaded.etag
      || current.rowVersionToken !== loaded.rowVersionToken) {
      throw new Error('The Locked Workplan changed after it was loaded. Reload before controlled reopen.');
    }
    const downstream = await this.getItems<IQuarterReviewListItem>(
      LISTS.quarterReviews, QUARTER_REVIEW_SELECT,
      `WorkplanKey eq '${this.escapeOData(current.workplanKey)}'`, 'Id', 500
    );
    if ((await this.getTransitionAudits(current.workplanKey, correlationKey)).length > 0) {
      throw new Error('The controlled reopen correlation/idempotency key has already been used.');
    }
    const plan = createControlledReopenPlan(
      current, actor, reason, controlReference, correlationKey, new Date().toISOString(), {
        downstreamQuarterDependencyCount: downstream.length,
        supersessionControlReference
      }
    );
    await this.mergeJson(this.listItemUrl(LISTS.workplans, current.id), {
      State: 'Approved', AccessState: 'ReadOnly', TransitionStatus: 'InProgress',
      TransitionCorrelationKey: plan.correlationKey, ManagerDecisionComment: plan.reason,
      RowVersionToken: plan.started.rowVersionToken
    }, current.etag, 'The controlled Locked-to-Approved reopen could not be started.');
    try {
      const stagedRows = await this.getWorkplansByKey(current.workplanKey);
      if (stagedRows.length !== 1) throw new Error('The staged Approved Workplan could not be read back.');
      const staged = this.mapWorkplan(stagedRows[0]);
      if (staged.id !== current.id || staged.workplanKey !== current.workplanKey
        || staged.state !== 'Approved' || staged.accessState !== 'ReadOnly'
        || staged.transitionStatus !== 'InProgress' || staged.transitionCorrelationKey !== plan.correlationKey
        || staged.rowVersionToken !== plan.started.rowVersionToken
        || staged.approvedAt !== current.approvedAt || staged.approvedByEmail !== current.approvedByEmail
        || staged.lockedAt !== current.lockedAt || staged.lockedByEmail !== current.lockedByEmail) {
        throw new Error('The controlled Locked-to-Approved staging state was not persisted exactly.');
      }
      const audit = await this.appendAudit(plan.audit);
      assertPersistedWorkplanAuditMatchesPlan(plan.audit, audit);
      await this.mergeJson(this.listItemUrl(LISTS.workplans, staged.id), {
        TransitionStatus: 'Ready', RowVersionToken: plan.completed.rowVersionToken
      }, staged.etag, 'The controlled Locked-to-Approved reopen could not be finalised.');
      const completedRows = await this.getWorkplansByKey(current.workplanKey);
      if (completedRows.length !== 1) throw new Error('The reopened Approved Workplan could not be verified.');
      const completed = this.mapWorkplan(completedRows[0]);
      if (completed.state !== 'Approved' || completed.accessState !== 'ReadOnly'
        || completed.transitionStatus !== 'Ready' || completed.transitionCorrelationKey !== plan.correlationKey
        || completed.lockedAt !== current.lockedAt || completed.lockedByEmail !== current.lockedByEmail) {
        throw new Error('The controlled Locked-to-Approved reopen did not preserve exact history.');
      }
      return { workplan: completed, audits: [audit], alreadyCompleted: false, storageAclStatus: 'InheritedDependency' };
    } catch (error) {
      await this.markTransitionRecoveryHold(current.workplanKey);
      throw error;
    }
  }

  public async openApprovedWorkplanAmendment(
    loaded: IAnnualWorkplan,
    _actor: IProductionPerson,
    reason: string,
    controlReference: string,
    correlationKey: string
  ): Promise<IWorkplanTransitionResult> {
    const actor = await this.resolveAuthoritativeLifecycleSystemAdmin();
    const currentRows = await this.getWorkplansByKey(loaded.workplanKey);
    if (currentRows.length !== 1) throw new Error('Exactly one Annual Workplan is required before controlled amendment.');
    const current = this.mapWorkplan(currentRows[0]);
    if (current.id !== loaded.id || current.workplanKey !== loaded.workplanKey || current.etag !== loaded.etag
      || current.rowVersionToken !== loaded.rowVersionToken) {
      throw new Error('The Approved Workplan changed after it was loaded. Reload before controlled amendment.');
    }
    const priorAudits = await this.getWorkplanAuditEvents(current.workplanKey);
    let stagedSnapshot = current;
    const result = await executeControlledAmendment(() => createControlledAmendmentPlan(
      current, actor, reason, controlReference, correlationKey, new Date().toISOString()
    ), priorAudits, {
      stage: async staged => {
        await this.mergeJson(this.listItemUrl(LISTS.workplans, current.id), {
          AccessState: 'ReadOnly', TransitionStatus: 'InProgress',
          TransitionCorrelationKey: staged.transitionCorrelationKey,
          RowVersionToken: staged.rowVersionToken
        }, current.etag, 'The controlled amendment could not be staged.');
        const rows = await this.getWorkplansByKey(current.workplanKey);
        if (rows.length !== 1) throw new Error('The staged controlled amendment could not be read back.');
        stagedSnapshot = this.mapWorkplan(rows[0]);
        return stagedSnapshot;
      },
      appendAudit: audit => this.appendAudit(audit),
      finalise: async completed => {
        await this.mergeJson(this.listItemUrl(LISTS.workplans, stagedSnapshot.id), {
          State: 'ChangesRequested', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready',
          ManagerDecisionComment: reason.trim(), RowVersionToken: completed.rowVersionToken
        }, stagedSnapshot.etag, 'The controlled amendment could not be finalised.');
        const rows = await this.getWorkplansByKey(current.workplanKey);
        if (rows.length !== 1) throw new Error('The controlled amendment could not be verified.');
        return this.mapWorkplan(rows[0]);
      },
      markRecoveryHold: hold => this.markTransitionRecoveryHold(hold.workplanKey)
    });
    return {
      workplan: result.workplan,
      audits: result.auditHistory.filter(audit => audit.correlationKey === result.workplan.transitionCorrelationKey),
      alreadyCompleted: false,
      storageAclStatus: 'InheritedDependency'
    };
  }

  public async getQuarterTimingConfig(): Promise<IQuarterTimingConfig> {
    const rows = await this.getItems<IConfigListItem>(
      LISTS.config,
      CONFIG_SELECT,
      `Environment eq 'Production'`,
      'ConfigKey',
      100
    );
    return mapQuarterTimingConfig(rows.map(row => ({
      id: row.Id,
      key: row.ConfigKey,
      valueType: row.ValueType,
      textValue: row.TextValue,
      numberValue: row.NumberValue,
      booleanValue: row.BooleanValue,
      dateValue: row.DateValue,
      jsonValue: row.JSONValue,
      active: row.Active
    })));
  }

  public async getQuarterReviewContext(source: IQuarterDraftSource): Promise<IQuarterReviewContext> {
    this.assertAuthenticatedPerson(source.employee);
    const prepared = buildQuarterReviewDraft(source);
    if (prepared.items.some(item => Boolean(item.behaviourSnapshotV2)))
      throw new Error('Behaviour v02 Quarter Review readback is blocked until separate annual Target and quarterly Current/Actual physical fields are bound and verified.');
    const reviewRows = await this.getQuarterReviewsByKey(prepared.review.quarterReviewKey);
    if (reviewRows.length > 1) throw new Error('Duplicate Quarter Review headers exist for this employee/year/quarter.');

    let recoverySchemaReady = true;
    let currentRows: IQuarterReviewItemListItem[] = [];
    try {
      currentRows = await this.getQuarterReviewItemRows(prepared.review.quarterReviewKey, true);
    } catch {
      recoverySchemaReady = false;
      currentRows = await this.getQuarterReviewItemRows(prepared.review.quarterReviewKey, false);
    }
    if (new Set(currentRows.map(row => row.QuarterReviewItemKey)).size !== currentRows.length) {
      throw new Error('Duplicate Quarter Review Item keys exist.');
    }
    if (new Set(currentRows.map(row => row.WorkplanItemKey)).size !== currentRows.length) {
      throw new Error('Multiple Quarter Review Items reference the same Annual Workplan assignment.');
    }

    const review = reviewRows[0] ? this.mapQuarterReview(reviewRows[0]) : undefined;
    const [annualRows, progressLedgers, evidence, auditEvents] = review ? await Promise.all([
      this.getItems<IQuarterReviewItemListItem>(
        LISTS.quarterReviewItems,
        QUARTER_ITEM_BASE_SELECT,
        `WorkplanKey eq '${this.escapeOData(source.workplan.workplanKey)}'`,
        'QuarterReviewItemKey',
        500
      ),
      this.getProgressLedgers(source.workplan.workplanKey),
      this.getQuarterEvidence(source.employee.personKey, source.workplan.performanceYear, source.lifecycle.quarterKey),
      this.getQuarterAuditEvents(prepared.review.quarterReviewKey)
    ]) : [[], [], [], []] as [IQuarterReviewItemListItem[], IProgressLedger[], IQuarterEvidenceReference[], IQuarterReviewAuditEvent[]];

    const previousByItemKey = new Map<string, IQuarterReviewItemListItem>();
    if (source.lifecycle.priorQuarter) {
      annualRows.filter(row => row.Quarter === source.lifecycle.priorQuarter).forEach(row => previousByItemKey.set(row.WorkplanItemKey, row));
    }
    const currentByKey = new Map(currentRows.map(row => [row.QuarterReviewItemKey, row]));
    const items = prepared.items.map(preview => {
      const row = currentByKey.get(preview.quarterReviewItemKey);
      if (row) return this.mapQuarterReviewItem(row, preview, previousByItemKey.get(preview.workplanItemKey));
      const sourceBehaviour = preview.itemType === 'Behaviour'
        ? source.behaviourItems.find(item => item.workplanItemKey === preview.workplanItemKey && item.activeInWorkplan)
        : undefined;
      const behaviourSnapshotV2 = sourceBehaviour?.behaviourSnapshotV2
        ? createBehaviourPeriodSnapshotV2(sourceBehaviour.behaviourSnapshotV2, source.lifecycle.quarterKey)
        : undefined;
      return {
        ...preview,
        ...(behaviourSnapshotV2 ? { wording: behaviourSnapshotV2.valueTitle,
          behaviourId: behaviourSnapshotV2.valueId, behaviourVersionKey: behaviourSnapshotV2.frameworkVersion,
          behaviourTitle: behaviourSnapshotV2.valueTitle, itemDescription: behaviourSnapshotV2.descriptor,
          behaviourSnapshotV2, quarterTargetText: sourceBehaviour?.behaviourPeriodCommitmentsV2?.[source.lifecycle.quarterKey],
          behaviourTargetRating: undefined, workplanItemWeightSnapshot: undefined,
          calculatedRag: 'NotRated' as const, scoringMessage: 'KCCC Behaviour v02 is label-first and unscored.' } : {}),
        previousQuarterActualValue: previousByItemKey.get(preview.workplanItemKey)?.EmployeeActualValue,
        previousQuarterActualText: previousByItemKey.get(preview.workplanItemKey)?.EmployeeActualText
      };
    });
    const messages: string[] = [];
    if (!review) messages.push('No Quarter Review header exists yet. Preview rows are derived from the accepted Annual Workplan and have not been written to SharePoint.');
    if (source.workplan.state === 'Submitted' && !source.workplan.transitionCorrelationKey?.trim()) {
      messages.push('The Annual Workplan remains Submitted pending genuine manager-auth approval. Quarterly compatibility is retained, but no manager-approved snapshot is claimed.');
    } else if (source.workplan.state === 'Submitted') {
      messages.push('The Annual Workplan remains Submitted pending genuine manager-auth approval. Its current transition correlation is not represented as an approval.');
    }
    if (!recoverySchemaReady) messages.push('Recovery Route persistence is pending the controlled additive KCF-KPI-015 schema migration. Core Actual/status entry can continue; Amber/Red submission remains blocked until the migration is applied.');
    if (currentRows.some(row => !items.some(item => item.quarterReviewItemKey === row.QuarterReviewItemKey))) {
      messages.push('Stored Quarter Review rows exist outside the current approved Workplan snapshot and require Admin reconciliation.');
    }
    return {
      lifecycle: source.lifecycle,
      review,
      employee: source.employee,
      manager: source.manager,
      coreCatalogue: source.coreCatalogue,
      behaviours: source.behaviours,
      items,
      progressLedgers,
      evidence,
      auditEvents,
      readiness: evaluateQuarterSubmissionReadiness(source.lifecycle, review, items),
      dataFoundationReady: recoverySchemaReady,
      messages
    };
  }

  public async getManagerQuarterReviewContexts(
    manager: IProductionPerson,
    lifecycles: IQuarterLifecycle[]
  ): Promise<IManagerQuarterReviewContext[]> {
    this.assertAuthenticatedPerson(manager);
    const rows = await this.getItems<IQuarterReviewListItem>(
      LISTS.quarterReviews,
      QUARTER_REVIEW_SELECT,
      `ManagerPersonKey eq '${this.escapeOData(manager.personKey)}'`,
      'SubmittedAt',
      500
    );
    const reviews = filterManagerQuarterReviews(manager, rows.map(row => this.mapQuarterReview(row)));
    const contexts: IManagerQuarterReviewContext[] = [];
    for (const review of reviews) {
      if (!canManagerReadQuarterReview(manager, review)) throw new Error('A Quarter Review failed the direct-report authorisation check.');
      const lifecycle = lifecycles.find(item => item.performanceYearNumber === review.performanceYear && item.quarterKey === review.quarter);
      if (!lifecycle) throw new Error(`No controlled lifecycle configuration exists for ${review.performanceYear}/${review.quarter}.`);
      const employee = await this.getPersonByEmail(review.employeeEmail);
      if (!employee?.active || employee.personKey !== review.personKey) throw new Error('A direct-report Quarter Review has no matching active People record.');
      let dataFoundationReady = true;
      let itemRows: IQuarterReviewItemListItem[];
      try {
        itemRows = await this.getQuarterReviewItemRows(review.quarterReviewKey, true);
      } catch {
        dataFoundationReady = false;
        itemRows = await this.getQuarterReviewItemRows(review.quarterReviewKey, false);
      }
      if (new Set(itemRows.map(item => item.QuarterReviewItemKey)).size !== itemRows.length) {
        throw new Error(`Duplicate Quarter Review Item keys exist for ${review.quarterReviewKey}.`);
      }
      if (new Set(itemRows.map(item => item.WorkplanItemKey)).size !== itemRows.length) {
        throw new Error(`Multiple Quarter Review Items reference the same Annual Workplan assignment for ${review.quarterReviewKey}.`);
      }
      const [evidence, auditEvents, behaviourAssignments] = await Promise.all([
        this.getQuarterEvidence(employee.personKey, review.performanceYear, review.quarter),
        this.getQuarterAuditEvents(review.quarterReviewKey),
        this.getBehaviourWorkplanItems(review.workplanKey)
      ]);
      if (behaviourAssignments.some(item => item.activeInWorkplan && item.behaviourSnapshotV2))
        throw new Error('Behaviour v02 manager Quarter Review readback is blocked until separate annual Target and quarterly Current/Actual physical fields are bound and verified.');
      const storedItems = itemRows.map(row => this.mapStoredQuarterReviewItem(row));
      const needsLegacyBehaviourDefinitions = storedItems.some(item => item.itemType === 'Behaviour'
        && !item.behaviourSnapshotV2);
      const behaviourDefinitions = needsLegacyBehaviourDefinitions ? await this.getPublishedBehaviours() : [];
      const behaviourAssignmentByKey = new Map(behaviourAssignments.map(item => [item.workplanItemKey, item]));
      const behaviourDefinitionById = new Map(behaviourDefinitions.map(item => [item.behaviourId, item]));
      const items = storedItems.map(item => {
        if (item.itemType !== 'Behaviour' || item.behaviourSnapshotV2) return item;
        const assignment = behaviourAssignmentByKey.get(item.workplanItemKey);
        const definition = assignment ? behaviourDefinitionById.get(assignment.behaviourId) : undefined;
        return {
          ...item,
          behaviourPrompt: definition?.description,
          behaviourAssessmentGuidance: definition?.assessmentGuidance
        };
      });
      contexts.push({
        lifecycle,
        review,
        employee,
        manager,
        items,
        evidence,
        auditEvents,
        readiness: evaluateQuarterManagerApprovalReadiness(review, items),
        dataFoundationReady,
        messages: dataFoundationReady ? [] : ['Recovery/Behaviour extension fields are pending the controlled KCF-KPI-015 additive schema migration.']
      });
    }
    return contexts.sort((left, right) => right.review.performanceYear - left.review.performanceYear
      || right.review.quarter.localeCompare(left.review.quarter)
      || left.employee.displayName.localeCompare(right.employee.displayName));
  }

  public async prepareQuarterReview(source: IQuarterDraftSource): Promise<IQuarterReviewContext> {
    this.assertAuthenticatedPerson(source.employee);
    const annualRows = await this.getWorkplansByKey(source.workplan.workplanKey);
    if (annualRows.length !== 1) throw new Error('Exactly one accepted Annual Workplan is required before preparing a Quarter Review.');
    const currentAnnual = this.mapWorkplan(annualRows[0]);
    if (currentAnnual.personKey !== source.employee.personKey || currentAnnual.employeeEmail.trim().toLowerCase() !== source.employee.email.trim().toLowerCase()) {
      throw new Error('The accepted Annual Workplan does not belong to the authenticated employee.');
    }
    if (currentAnnual.state !== 'Submitted' && currentAnnual.state !== 'Approved' && currentAnnual.state !== 'Locked') {
      throw new Error(`Quarterly Draft preparation is blocked while the current Annual Workplan is ${currentAnnual.state}.`);
    }
    source = { ...source, workplan: currentAnnual };
    const behaviourV2Items = source.behaviourItems.filter(item => item.activeInWorkplan && item.behaviourSnapshotV2);
    const behaviourV2Header = behaviourV2Items[0]?.behaviourSnapshotV2;
    if (behaviourV2Items.length > 0 && (behaviourV2Items.length !== 5 || !behaviourV2Header
      || behaviourV2Items.some(item => item.behaviourSnapshotV2?.frameworkVersion !== behaviourV2Header.frameworkVersion
        || item.behaviourSnapshotV2.roleTier !== behaviourV2Header.roleTier
        || item.behaviourSnapshotV2.cadence !== behaviourV2Header.cadence)
      || source.employee.behaviourFrameworkVersionV2 !== behaviourV2Header.frameworkVersion
      || source.employee.behaviourRoleTierV2 !== behaviourV2Header.roleTier
      || source.employee.behaviourCadenceV2 !== behaviourV2Header.cadence)) {
      throw new Error('Quarterly preparation rejected a missing, mixed or crossed Behaviour v02 snapshot/person assignment.');
    }
    if (behaviourV2Header && behaviourV2Header.cadence !== 'Quarterly') {
      throw new Error('Quarterly preparation cannot create Phase 2 TwiceYearly records.');
    }
    assertQuarterV02PhysicalReadiness(behaviourV2Header);
    const prepared = buildQuarterReviewDraft(source);
    const schema = await this.getQuarterlyLifecycleSchemaStatus();
    if (schema.statusUpdateRequired || schema.missingAuditEventTypes.length || schema.mismatches.length) {
      throw new Error('Quarterly Draft preparation requires the CONTROL-approved KCF-KPI-015B lifecycle schema read-back.');
    }
    const existing = await this.getQuarterReviewsByKey(prepared.review.quarterReviewKey);
    if (existing.length > 1) throw new Error('Duplicate Quarter Review headers exist.');
    if (!existing[0]) {
      try {
        await this.postJson(this.listItemsUrl(LISTS.quarterReviews), {
          Title: `${source.employee.displayName} — ${source.lifecycle.quarterName}`,
          QuarterReviewKey: prepared.review.quarterReviewKey,
          WorkplanKey: prepared.review.workplanKey,
          PersonKey: prepared.review.personKey,
          EmployeeDisplayName: prepared.review.employeeDisplayName,
          EmployeeEmail: prepared.review.employeeEmail,
          PerformanceYear: prepared.review.performanceYear,
          Quarter: prepared.review.quarter,
          ManagerPersonKey: prepared.review.managerPersonKey,
          ManagerDisplayName: prepared.review.managerDisplayName,
          ManagerEmail: prepared.review.managerEmail,
          CoreCategoryWeightSnapshot: prepared.review.coreCategoryWeightSnapshot ?? REST_NULL,
          PersonalCategoryWeightSnapshot: prepared.review.personalCategoryWeightSnapshot ?? REST_NULL,
          BehaviourCategoryWeightSnapshot: prepared.review.behaviourCategoryWeightSnapshot ?? REST_NULL,
          WorkplanApprovalCorrelationKey: prepared.review.workplanApprovalCorrelationKey || REST_NULL,
          BehaviourFrameworkVersionSnapshot: behaviourV2Header?.frameworkVersion || REST_NULL,
          BehaviourRoleTierSnapshot: behaviourV2Header?.roleTier || REST_NULL,
          BehaviourCadenceSnapshot: behaviourV2Header?.cadence || REST_NULL,
          State: 'Draft',
          AccessState: 'EmployeeEdit',
          TransitionStatus: 'Ready',
          RowVersionToken: 1
        }, 'The Draft Quarter Review header could not be created.');
      } catch (error) {
        const raced = await this.getQuarterReviewsByKey(prepared.review.quarterReviewKey);
        if (raced.length !== 1) throw error;
      }
    }
    const created = await this.getQuarterReviewsByKey(prepared.review.quarterReviewKey);
    if (created.length !== 1) throw new Error('The Draft Quarter Review header could not be verified.');
    const mapped = this.mapQuarterReview(created[0]);
    await this.appendQuarterAudit(createQuarterCreationAudit(mapped, source.employee, Guid.newGuid().toString(), new Date().toISOString()));
    return this.getQuarterReviewContext(source);
  }

  public async saveQuarterReviewItem(
    context: IQuarterReviewContext,
    item: IQuarterReviewItem,
    actor: IProductionPerson,
    _config: IProductionConfig
  ): Promise<IQuarterReviewItem> {
    this.assertAuthenticatedPerson(actor);
    if (!context.review) throw new Error('This Quarter Review has no persisted header.');
    const currentReview = await this.getCurrentEditableQuarterReview(context.review, actor, context.lifecycle);
    assertQuarterReviewItemWriteBoundary(currentReview, item);
    const assignment = await this.assertActiveQuarterAssignment(item, currentReview);
    if (item.recovery?.route && !context.dataFoundationReady) throw new Error('Recovery Route persistence requires the controlled KCF-KPI-015 additive schema migration.');
    const existing = await this.getQuarterReviewItemsByKey(item.quarterReviewItemKey, context.dataFoundationReady, Boolean(item.behaviourSnapshotV2));
    if (existing.length > 1) throw new Error('Duplicate Quarter Review Items exist for this stable key.');
    const stored = existing[0] ? this.mapStoredQuarterReviewItem(existing[0]) : undefined;
    if (stored) {
      assertQuarterReviewItemWriteBoundary(currentReview, stored);
      assertQuarterReviewItemSnapshotCurrent(item, stored);
      if (item.behaviourSnapshotV2 || stored.behaviourSnapshotV2) assertFrozenBehaviourAnnualTarget(item, stored);
    } else if (item.id !== 0 || item.etag !== '*') {
      throw new Error('The Quarterly item expected an existing saved row but none was found. Reload before saving.');
    }
    if ((item.itemType === 'CoreGold' || item.itemType === 'LocalPersonal') && item.recovery?.route) {
      await this.assertCurrentQuarterRecoveryOwner(currentReview, item.recovery.ownerPersonKey);
    }

    let trusted = stored ? { ...stored } : {
      ...item,
      id: 0,
      etag: '*',
      kpiVersionKey: assignment.KPIVersionKey || item.kpiVersionKey,
      targetVersionKey: assignment.TargetVersionKey || item.targetVersionKey,
      workplanItemWeightSnapshot: assignment.ItemType === 'CoreGold'
        ? assignment.CoreWorkplanWeight
        : assignment.ItemType === 'LocalPersonal'
          ? assignment.PersonalItemWeight
          : assignment.BehaviourItemWeight,
      contributionWeightSnapshot: assignment.ItemType === 'CoreGold' ? assignment.CoreWorkplanWeight : undefined,
      evidenceCount: 0,
      managerApproved: false,
      locked: false
    };
    if (item.itemType === 'CoreGold') {
      const [serverConfig, catalogue] = await Promise.all([
        this.getProductionConfig(),
        this.getCoreKpiCatalogue(currentReview.performanceYear)
      ]);
      const kpi = catalogue.find(row => row.kpiId === assignment.KPIID);
      if (!kpi || !kpi.targetVersionKey) throw new Error('The active Core assignment has no approved current KPI/Annual Target definition.');
      if (!stored) {
        const quarterTarget = this.getCatalogueQuarterTarget(kpi, currentReview.quarter);
        trusted = {
          ...trusted,
          kpiId: kpi.kpiId,
          kpiVersionKey: assignment.KPIVersionKey,
          targetVersionKey: assignment.TargetVersionKey,
          wording: kpi.wording,
          pillar: kpi.pillar,
          workstream: kpi.workstream,
          ownerEmail: kpi.accountableOwnerEmail,
          unitLabel: kpi.unitLabel,
          metricType: kpi.metricType || 'Other',
          scoringDirection: kpi.scoringDirection,
          percentageSourceScale: kpi.percentageSourceScale,
          baselineValue: kpi.baselineValue,
          strategyTarget: kpi.strategyTarget,
          yearEndTarget: kpi.yearEndTarget,
          yearEndTargetValueSnapshot: kpi.yearEndTargetValue,
          yearEndTargetTextSnapshot: kpi.yearEndTargetText,
          quarterTargetValue: quarterTarget.value,
          quarterTargetText: quarterTarget.text
        };
      }
      trusted = prepareAuthoritativeCoreQuarterSave(trusted, item, kpi, serverConfig).item;
    } else if (item.itemType === 'LocalPersonal') {
      const serverConfig = await this.getProductionConfig();
      if (!stored) {
        const personalItems = await this.getPersonalWorkplanItems(currentReview.workplanKey);
        const sourceItem = personalItems.find(row => row.workplanItemKey === assignment.WorkplanItemKey && row.activeInWorkplan);
        if (!sourceItem) throw new Error('The active Personal KPI definition could not be resolved for the Quarterly snapshot.');
        const target = personalQuarterTarget(sourceItem, currentReview.quarter);
        trusted = {
          ...trusted,
          wording: sourceItem.wording,
          itemDescription: sourceItem.description,
          measure: sourceItem.measure,
          unitLabel: sourceItem.unitLabel,
          metricType: sourceItem.measureType || 'Other',
          scoringDirection: sourceItem.scoringDirection || 'TBC',
          percentageSourceScale: sourceItem.percentageSourceScale,
          baselineValue: sourceItem.baselineValue,
          yearEndTargetValueSnapshot: sourceItem.yearEndTargetValue,
          yearEndTargetTextSnapshot: sourceItem.yearEndTargetText,
          yearEndTarget: sourceItem.yearEndTargetValue !== undefined ? String(sourceItem.yearEndTargetValue) : sourceItem.yearEndTargetText,
          quarterTargetValue: target.value,
          quarterTargetText: target.text,
          workplanItemWeightSnapshot: sourceItem.personalItemWeight
        };
      }
      trusted = prepareAuthoritativePersonalQuarterSave(trusted, item, serverConfig).item;
    } else {
      if (!stored) {
        const behaviourItems = await this.getBehaviourWorkplanItems(currentReview.workplanKey);
        const sourceItem = behaviourItems.find(row => row.workplanItemKey === assignment.WorkplanItemKey && row.activeInWorkplan);
        if (!sourceItem) throw new Error('The active Behaviour definition could not be resolved for the Quarterly snapshot.');
        if (sourceItem.behaviourSnapshotV2) {
          const annualRows = await this.getWorkplansByKey(currentReview.workplanKey);
          if (annualRows.length !== 1) throw new Error('The approved annual Workplan source is absent or duplicated.');
          const annual = this.mapWorkplan(annualRows[0]);
          if (currentReview.workplanApprovalCorrelationKey !== annual.transitionCorrelationKey)
            throw new Error('The quarter header and approved annual source version differ.');
          assertApprovedBehaviourTargetSource(item, annual, sourceItem);
          const periodSnapshot = createBehaviourPeriodSnapshotV2(sourceItem.behaviourSnapshotV2, currentReview.quarter);
          trusted = { ...trusted, wording: periodSnapshot.valueTitle, behaviourId: periodSnapshot.valueId,
            behaviourVersionKey: periodSnapshot.frameworkVersion, behaviourTitle: periodSnapshot.valueTitle,
            behaviourSnapshotV2: periodSnapshot, itemDescription: periodSnapshot.descriptor,
            behaviourAnnualTargetLevelV2: item.behaviourAnnualTargetLevelV2,
            behaviourAnnualTargetJustificationV2: item.behaviourAnnualTargetJustificationV2,
            behaviourAnnualTargetSourceWorkplanItemKeyV2: item.behaviourAnnualTargetSourceWorkplanItemKeyV2,
            behaviourAnnualTargetSourceEtagV2: item.behaviourAnnualTargetSourceEtagV2,
            behaviourAnnualTargetSourceWorkplanVersionV2: item.behaviourAnnualTargetSourceWorkplanVersionV2,
            behaviourAnnualTargetSourceApprovalKeyV2: item.behaviourAnnualTargetSourceApprovalKeyV2,
            quarterTargetText: sourceItem.behaviourPeriodCommitmentsV2?.[currentReview.quarter],
            employeeBehaviourEvidenceV2: item.employeeBehaviourEvidenceV2,
            employeeBehaviourAssessmentV2: item.employeeBehaviourAssessmentV2,
            calculatedRag: 'NotRated', progressPct: undefined, scoredProgressPct: undefined,
            calculationRuleVersion: undefined, workplanItemWeightSnapshot: undefined };
        } else {
          const definitions = await this.getPublishedBehaviours();
          const definition = definitions.find(row => row.behaviourId === sourceItem.behaviourId
            && row.behaviourVersionKey === sourceItem.behaviourVersionKey);
          if (!definition) throw new Error('The active historic Behaviour definition could not be resolved for the Quarterly snapshot.');
          trusted = {
            ...trusted, wording: definition.title, behaviourId: sourceItem.behaviourId,
            behaviourVersionKey: sourceItem.behaviourVersionKey, behaviourTitle: definition.title,
            behaviourPrompt: definition.description, behaviourAssessmentGuidance: definition.assessmentGuidance,
            behaviourObjectiveKey: sourceItem.sourceObjectiveKey, behaviourObjectiveSource: sourceItem.objectiveSource,
            behaviourObjectiveTitle: sourceItem.objectiveTitle,
            behaviourObjectiveDescription: sourceItem.objectiveDescription,
            behaviourEvidenceDefinition: sourceItem.evidenceDefinition, itemDescription: sourceItem.objectiveDescription,
            measure: sourceItem.measure, unitLabel: sourceItem.unit,
            quarterTargetText: this.getBehaviourQuarterTarget(sourceItem, currentReview.quarter),
            behaviourTargetRating: this.getBehaviourQuarterTargetRating(sourceItem, currentReview.quarter),
            workplanItemWeightSnapshot: sourceItem.behaviourItemWeight
          };
        }
      }
      if (trusted.behaviourSnapshotV2) {
        if (item.employeeBehaviourAssessmentV2 !== undefined && !isBehaviourV2Rating(item.employeeBehaviourAssessmentV2)) {
          throw new Error('Behaviour v02 employee assessment must be 1, 2 or 3.');
        }
        trusted = { ...trusted, employeeActualValue: undefined, employeeActualText: undefined,
          employeeBehaviourRating: undefined, statusUpdate: undefined, behaviourReflection: undefined,
          behaviourExamples: undefined, employeeBehaviourEvidenceV2: item.employeeBehaviourEvidenceV2,
          employeeBehaviourAssessmentV2: item.employeeBehaviourAssessmentV2,
          quarterEndForecastValue: undefined, quarterEndForecastText: undefined,
          evidenceCount: stored?.evidenceCount || 0, progressPct: undefined, scoredProgressPct: undefined,
          calculatedRag: 'NotRated', calculationRuleVersion: undefined,
          scoringMessage: 'KCCC Behaviour v02 is label-first and is not converted to target/RAG/score.' };
      } else {
        const employeeRating = item.employeeBehaviourRating
          || (isBehaviourRating(item.employeeActualValue) ? item.employeeActualValue : undefined);
        const scoring = calculateBehaviourRating(employeeRating, trusted.behaviourTargetRating);
        trusted = {
          ...trusted, employeeActualValue: employeeRating, employeeActualText: undefined,
          employeeBehaviourRating: employeeRating, statusUpdate: undefined,
          behaviourReflection: item.behaviourReflection, behaviourExamples: item.behaviourExamples,
          quarterEndForecastValue: undefined, quarterEndForecastText: item.quarterEndForecastText,
          evidenceCount: stored?.evidenceCount || 0,
          progressPct: scoring.rawNormalisedScore === undefined ? undefined : scoring.rawNormalisedScore * 100,
          scoredProgressPct: scoring.scoredContribution === undefined ? undefined : scoring.scoredContribution * 100,
          calculatedRag: scoring.rag, calculationRuleVersion: 'KCF-BEH-001',
          scoringMessage: scoring.rateable
            ? `Employee rating ${employeeRating}/4 against target ${trusted.behaviourTargetRating}/4.`
            : 'A valid employee and target Behaviour rating from 1 to 4 is required.'
        };
      }
      if (!trusted.behaviourSnapshotV2) {
        const draftValidation = validateQuarterDraftSave(trusted);
        if (!draftValidation.valid) throw new Error(draftValidation.errors.join(' '));
      }
    }

    const mutablePayload: Record<string, unknown> = {
      EmployeeActualValue: trusted.employeeActualValue ?? REST_NULL,
      EmployeeActualText: trusted.employeeActualText || REST_NULL,
      ProgressPct: trusted.progressPct ?? REST_NULL,
      CalculatedRAG: trusted.calculatedRag,
      CalculationRuleVersion: trusted.calculationRuleVersion,
      StatusUpdate: trusted.itemType === 'Behaviour' ? (trusted.behaviourReflection || '') : (trusted.statusUpdate || ''),
      BehaviourExamples: trusted.itemType === 'Behaviour' ? (trusted.behaviourExamples || REST_NULL) : REST_NULL,
      EmployeeBehaviourRating: trusted.itemType === 'Behaviour' ? (trusted.employeeBehaviourRating || REST_NULL) : REST_NULL,
      EmployeeBehaviourEvidenceV2: trusted.behaviourSnapshotV2
        ? (trusted.employeeBehaviourEvidenceV2 || REST_NULL) : REST_NULL,
      EmployeeBehaviourAssessmentV2: trusted.behaviourSnapshotV2
        ? (trusted.employeeBehaviourAssessmentV2 || REST_NULL) : REST_NULL,
      QuarterEndForecastValue: trusted.quarterEndForecastValue ?? REST_NULL,
      QuarterEndForecastText: trusted.quarterEndForecastText || REST_NULL
    };
    if (context.dataFoundationReady) Object.assign(mutablePayload, this.recoveryPayload(trusted));
    if (existing[0]) {
      await this.mergeJson(this.listItemUrl(LISTS.quarterReviewItems, existing[0].Id), mutablePayload, stored?.etag as string, 'The Quarter Review Item could not be updated.');
    } else {
      await this.postJson(this.listItemsUrl(LISTS.quarterReviewItems), {
        ...mutablePayload,
        Title: trusted.kpiId ? `${trusted.kpiId} — ${trusted.wording}` : trusted.wording,
        QuarterReviewItemKey: trusted.quarterReviewItemKey,
        QuarterReviewKey: trusted.quarterReviewKey,
        WorkplanItemKey: trusted.workplanItemKey,
        WorkplanKey: trusted.workplanKey,
        PersonKey: trusted.personKey,
        PerformanceYear: trusted.performanceYear,
        Quarter: trusted.quarter,
        ItemType: trusted.itemType,
        KPIID: trusted.kpiId || REST_NULL,
        KPIVersionKey: trusted.kpiVersionKey || REST_NULL,
        TargetVersionKey: trusted.targetVersionKey || REST_NULL,
        ItemWordingSnapshot: trusted.wording,
        ItemDescriptionSnapshot: trusted.itemDescription || REST_NULL,
        MeasureSnapshot: trusted.measure || REST_NULL,
        PillarSnapshot: trusted.pillar || REST_NULL,
        WorkstreamSnapshot: trusted.workstream || REST_NULL,
        OwnerEmailSnapshot: trusted.ownerEmail || REST_NULL,
        UnitLabelSnapshot: trusted.unitLabel || REST_NULL,
        MetricTypeSnapshot: trusted.metricType || REST_NULL,
        ScoringDirectionSnapshot: trusted.scoringDirection || REST_NULL,
        PercentageScaleSnapshot: trusted.percentageSourceScale || REST_NULL,
        BaselineValueSnapshot: trusted.baselineValue ?? REST_NULL,
        YearEndTargetValueSnapshot: trusted.yearEndTargetValueSnapshot ?? REST_NULL,
        YearEndTargetTextSnapshot: trusted.yearEndTargetTextSnapshot || REST_NULL,
        QuarterTargetValue: trusted.quarterTargetValue ?? REST_NULL,
        QuarterTargetText: trusted.quarterTargetText || REST_NULL,
        BehaviourIDSnapshot: trusted.behaviourId || REST_NULL,
        BehaviourVersionKeySnapshot: trusted.behaviourVersionKey || REST_NULL,
        BehaviourTitleSnapshot: trusted.behaviourTitle || REST_NULL,
        BehaviourDescriptionSnapshot: trusted.behaviourPrompt || REST_NULL,
        BehaviourGuidanceSnapshot: trusted.behaviourAssessmentGuidance || REST_NULL,
        BehaviourObjectiveKeySnapshot: trusted.behaviourObjectiveKey || REST_NULL,
        BehaviourObjectiveSourceSnapshot: trusted.behaviourObjectiveSource || REST_NULL,
        BehaviourObjectiveTitleSnapshot: trusted.behaviourObjectiveTitle || REST_NULL,
        BehaviourEvidenceDefSnapshot: trusted.behaviourEvidenceDefinition || REST_NULL,
        BehaviourTargetRating: trusted.behaviourTargetRating || REST_NULL,
        WorkplanItemWeightSnapshot: trusted.workplanItemWeightSnapshot ?? REST_NULL,
        BehaviourFrameworkVersionSnapshot: trusted.behaviourSnapshotV2?.frameworkVersion || REST_NULL,
        BehaviourValueTitleSnapshot: trusted.behaviourSnapshotV2?.valueTitle || REST_NULL,
        BehaviourCorporateValueSnapshot: trusted.behaviourSnapshotV2?.corporateValue || REST_NULL,
        BehaviourRoleTierSnapshot: trusted.behaviourSnapshotV2?.roleTier || REST_NULL,
        BehaviourDescriptorSnapshot: trusted.behaviourSnapshotV2?.descriptor || REST_NULL,
        BehaviourCadenceSnapshot: trusted.behaviourSnapshotV2?.cadence || REST_NULL,
        BehaviourPeriodKeysSnapshotJSON: trusted.behaviourSnapshotV2
          ? JSON.stringify(trusted.behaviourSnapshotV2.periodKeys) : REST_NULL,
        BehaviourPeriodSnapshot: trusted.behaviourSnapshotV2?.period || REST_NULL,
        BehaviourRatingLabelsSnapshotJSON: trusted.behaviourSnapshotV2
          ? JSON.stringify(trusted.behaviourSnapshotV2.ratingOptions) : REST_NULL,
        BehaviourAnnualTargetLevelV2: trusted.behaviourSnapshotV2 ? trusted.behaviourAnnualTargetLevelV2 : REST_NULL,
        BehaviourAnnualTargetJustificationV2: trusted.behaviourSnapshotV2 ? (trusted.behaviourAnnualTargetJustificationV2 || REST_NULL) : REST_NULL,
        BehaviourAnnualTargetSourceWorkplanItemKeyV2: trusted.behaviourSnapshotV2 ? trusted.behaviourAnnualTargetSourceWorkplanItemKeyV2 : REST_NULL,
        BehaviourAnnualTargetSourceEtagV2: trusted.behaviourSnapshotV2 ? trusted.behaviourAnnualTargetSourceEtagV2 : REST_NULL,
        BehaviourAnnualTargetSourceWorkplanVersionV2: trusted.behaviourSnapshotV2 ? trusted.behaviourAnnualTargetSourceWorkplanVersionV2 : REST_NULL,
        BehaviourAnnualTargetSourceApprovalKeyV2: trusted.behaviourSnapshotV2 ? trusted.behaviourAnnualTargetSourceApprovalKeyV2 : REST_NULL,
        EvidenceCount: 0,
        ManagerApproved: false,
        Locked: false
      }, 'The Quarter Review Item could not be created.');
    }
    const readBack = await this.getQuarterReviewItemsByKey(item.quarterReviewItemKey, context.dataFoundationReady, Boolean(trusted.behaviourSnapshotV2));
    if (readBack.length !== 1) throw new Error('The Quarter Review Item could not be read back without duplication.');
    const mapped = this.mapQuarterReviewItem(readBack[0], trusted);
    assertQuarterReviewItemWriteBoundary(currentReview, mapped);
    if (trusted.behaviourSnapshotV2) assertFrozenBehaviourAnnualTarget(trusted, mapped);
    return mapped;
  }

  public async saveProgressEntry(
    context: IQuarterReviewContext,
    item: IQuarterReviewItem,
    entry: IProgressEntry,
    actor: IProductionPerson
  ): Promise<IProgressLedger> {
    this.assertAuthenticatedPerson(actor);
    if (!context.review) throw new Error('Progress notes require a persisted Quarter Review header.');
    const currentReview = await this.getCurrentEditableQuarterReview(context.review, actor, context.lifecycle);
    if (item.quarterReviewKey !== currentReview.quarterReviewKey || item.personKey !== currentReview.personKey || item.workplanKey !== currentReview.workplanKey || item.quarter !== currentReview.quarter) {
      throw new Error('Progress entry context does not match the persisted employee review.');
    }
    await this.assertActiveQuarterAssignment(item, currentReview);
    const naturalKey = `${item.workplanItemKey}|${item.performanceYear}`;
    const rows = await this.getProgressLedgerRows(naturalKey);
    if (rows.length > 1) throw new Error('Duplicate progress ledgers exist for this Workplan Item/year.');
    const initial: IProgressLedger = rows[0] ? this.mapProgressLedger(rows[0]) : {
      id: 0,
      etag: '*',
      progressLedgerKey: naturalKey,
      workplanItemKey: item.workplanItemKey,
      workplanKey: item.workplanKey,
      personKey: item.personKey,
      performanceYear: item.performanceYear,
      itemType: item.itemType,
      kpiId: item.kpiId,
      entries: [],
      locked: false,
      rowVersionToken: 1
    };
    const scopedEntry: IProgressEntry = {
      ...entry,
      entryKey: `${item.quarterReviewItemKey}|${entry.date}`,
      quarterReviewKey: currentReview.quarterReviewKey,
      quarterReviewItemKey: item.quarterReviewItemKey,
      quarter: currentReview.quarter
    };
    const result = upsertProgressEntry(initial, scopedEntry, actor);
    const latest = result.ledger.entries[result.ledger.entries.length - 1];
    const payload = {
      Title: `${item.kpiId || item.wording} progress`,
      ProgressLedgerKey: result.ledger.progressLedgerKey,
      WorkplanItemKey: result.ledger.workplanItemKey,
      WorkplanKey: result.ledger.workplanKey,
      PersonKey: result.ledger.personKey,
      PerformanceYear: result.ledger.performanceYear,
      ItemType: result.ledger.itemType,
      KPIID: result.ledger.kpiId || REST_NULL,
      ProgressEntriesJSON: JSON.stringify(result.ledger.entries),
      LatestMonth: latest?.date.slice(0, 7) || REST_NULL,
      LatestStatus: latest?.status || REST_NULL,
      LatestUpdatedAt: latest?.updatedAt || REST_NULL,
      Locked: false,
      RowVersionToken: result.ledger.rowVersionToken
    };
    if (rows[0]) await this.mergeJson(this.listItemUrl(LISTS.progressNotes, rows[0].Id), payload, rows[0]['@odata.etag'] || '*', 'The progress ledger could not be updated.');
    else await this.postJson(this.listItemsUrl(LISTS.progressNotes), payload, 'The progress ledger could not be created.');
    const readBack = await this.getProgressLedgerRows(naturalKey);
    if (readBack.length !== 1) throw new Error('The progress ledger could not be read back without duplication.');
    return this.mapProgressLedger(readBack[0]);
  }

  public async submitQuarterReview(
    context: IQuarterReviewContext,
    actor: IProductionPerson,
    comment?: string
  ): Promise<IQuarterReviewTransitionResult> {
    this.assertAuthenticatedPerson(actor);
    if (!context.review) throw new Error('The Quarter Review header must exist before submission.');
    const rows = await this.getQuarterReviewsByKey(context.review.quarterReviewKey);
    if (rows.length !== 1) throw new Error('The Quarter Review header could not be uniquely resolved.');
    const current = this.mapQuarterReview(rows[0]);
    if (current.state === 'Submitted' && current.transitionCorrelationKey) {
      const audits = await this.getQuarterTransitionAudits(current.quarterReviewKey, current.transitionCorrelationKey);
      return { review: current, audits: verifyCompletedQuarterSubmission(current, actor, audits), alreadyCompleted: true };
    }
    assertQuarterReviewSnapshotCurrent(context.review, current);
    const action = current.state === 'ChangesRequested' ? 'Resubmit' as const : 'Submit' as const;
    const expectedEvent = action === 'Resubmit' ? 'QuarterReviewResubmitted' as const : 'QuarterReviewSubmitted' as const;
    const persistedItems = await this.getPersistedQuarterItemsForTransition(current, context.dataFoundationReady);
    const readiness = evaluateQuarterSubmissionReadiness(context.lifecycle, current, persistedItems);
    if (!readiness.ready) throw new Error(`Quarter Review submission is blocked: ${readiness.blockers.join(' ')}`);
    const plan = createQuarterTransitionPlan(current, actor, action, Guid.newGuid().toString(), new Date().toISOString(), comment);
    try {
      await this.mergeJson(this.listItemUrl(LISTS.quarterReviews, current.id), this.quarterReviewTransitionPayload(plan.review), current.etag, 'The Quarter Review could not be submitted.');
      const audit = await this.appendQuarterAudit(plan.audit);
      const completedRows = await this.getQuarterReviewsByKey(current.quarterReviewKey);
      if (completedRows.length !== 1) throw new Error('The submitted Quarter Review could not be verified.');
      const completed = this.mapQuarterReview(completedRows[0]);
      return { review: completed, audits: verifyQuarterTransition(completed, actor, [audit], 'Submitted', [expectedEvent]), alreadyCompleted: false };
    } catch (error) {
      await this.markQuarterTransitionRecoveryHold(current.quarterReviewKey);
      throw error;
    }
  }

  public async requestQuarterReviewChanges(
    context: IManagerQuarterReviewContext,
    actor: IProductionPerson,
    reason: string
  ): Promise<IQuarterReviewTransitionResult> {
    this.assertAuthenticatedPerson(actor);
    const rows = await this.getQuarterReviewsByKey(context.review.quarterReviewKey);
    if (rows.length !== 1) throw new Error('The Quarter Review header could not be uniquely resolved.');
    const current = this.mapQuarterReview(rows[0]);
    if (current.state === 'ChangesRequested' && current.transitionCorrelationKey) {
      const audits = await this.getQuarterTransitionAudits(current.quarterReviewKey, current.transitionCorrelationKey);
      return { review: current, audits: verifyQuarterTransition(current, actor, audits, 'ChangesRequested', ['QuarterReviewChangesRequested']), alreadyCompleted: true };
    }
    const plan = createQuarterTransitionPlan(current, actor, 'RequestChanges', Guid.newGuid().toString(), new Date().toISOString(), reason);
    try {
      await this.mergeJson(this.listItemUrl(LISTS.quarterReviews, current.id), this.quarterReviewTransitionPayload(plan.review), current.etag, 'Quarter Review changes could not be requested.');
      const audit = await this.appendQuarterAudit(plan.audit);
      const completedRows = await this.getQuarterReviewsByKey(current.quarterReviewKey);
      if (completedRows.length !== 1) throw new Error('The Changes Requested Quarter Review could not be verified.');
      const completed = this.mapQuarterReview(completedRows[0]);
      return { review: completed, audits: verifyQuarterTransition(completed, actor, [audit], 'ChangesRequested', ['QuarterReviewChangesRequested']), alreadyCompleted: false };
    } catch (error) {
      await this.markQuarterTransitionRecoveryHold(current.quarterReviewKey);
      throw error;
    }
  }

  public async approveAndLockQuarterReview(
    context: IManagerQuarterReviewContext,
    actor: IProductionPerson,
    comment?: string
  ): Promise<IQuarterReviewTransitionResult> {
    this.assertAuthenticatedPerson(actor);
    const rows = await this.getQuarterReviewsByKey(context.review.quarterReviewKey);
    if (rows.length !== 1) throw new Error('The Quarter Review header could not be uniquely resolved.');
    let current = this.mapQuarterReview(rows[0]);
    if (current.state === 'Locked' && current.transitionCorrelationKey) {
      const audits = await this.getQuarterTransitionAudits(current.quarterReviewKey, current.transitionCorrelationKey);
      return { review: current, audits: verifyQuarterTransition(current, actor, audits, 'Locked', ['QuarterReviewApproved', 'QuarterReviewLocked']), alreadyCompleted: true };
    }
    assertQuarterReviewSnapshotCurrent(context.review, current);
    const persistedItems = await this.getPersistedQuarterItemsForTransition(current, context.dataFoundationReady);
    const approvalReadiness = evaluateQuarterManagerApprovalReadiness(current, persistedItems);
    if (!approvalReadiness.ready) throw new Error(`Quarter Review approval is blocked: ${approvalReadiness.blockers.join(' ')}`);
    const correlationKey = Guid.newGuid().toString();
    const approved = createQuarterTransitionPlan(current, actor, 'Approve', correlationKey, new Date().toISOString(), comment);
    try {
      await this.mergeJson(this.listItemUrl(LISTS.quarterReviews, current.id), this.quarterReviewTransitionPayload(approved.review), current.etag, 'The Quarter Review could not be approved.');
      const approvedAudit = await this.appendQuarterAudit(approved.audit);
      await this.setQuarterReviewItemsDecisionState(current.quarterReviewKey, true, false);
      const approvedRows = await this.getQuarterReviewsByKey(current.quarterReviewKey);
      if (approvedRows.length !== 1) throw new Error('The approved Quarter Review could not be verified.');
      current = this.mapQuarterReview(approvedRows[0]);
      const locked = createQuarterTransitionPlan(current, actor, 'Lock', correlationKey, new Date().toISOString());
      await this.mergeJson(this.listItemUrl(LISTS.quarterReviews, current.id), this.quarterReviewTransitionPayload(locked.review), current.etag, 'The approved Quarter Review could not be locked.');
      await this.setQuarterReviewItemsDecisionState(current.quarterReviewKey, true, true);
      const lockedAudit = await this.appendQuarterAudit(locked.audit);
      const completedRows = await this.getQuarterReviewsByKey(current.quarterReviewKey);
      if (completedRows.length !== 1) throw new Error('The locked Quarter Review could not be verified.');
      const completed = this.mapQuarterReview(completedRows[0]);
      return { review: completed, audits: verifyQuarterTransition(completed, actor, [approvedAudit, lockedAudit], 'Locked', ['QuarterReviewApproved', 'QuarterReviewLocked']), alreadyCompleted: false };
    } catch (error) {
      await this.markQuarterTransitionRecoveryHold(current.quarterReviewKey);
      throw error;
    }
  }

  public async saveQuarterManagerOverride(
    context: IManagerQuarterReviewContext,
    item: IQuarterReviewItem,
    actor: IProductionPerson,
    rag: Exclude<IQuarterReviewItem['calculatedRag'], 'NotRated'>,
    reason: string
  ): Promise<IQuarterManagerOverrideResult> {
    this.assertAuthenticatedPerson(actor);
    const reviewRows = await this.getQuarterReviewsByKey(context.review.quarterReviewKey);
    if (reviewRows.length !== 1) throw new Error('The Quarter Review header could not be uniquely resolved for RAG Override.');
    const currentReview = this.mapQuarterReview(reviewRows[0]);
    assertQuarterReviewSnapshotCurrent(context.review, currentReview);
    const rows = await this.getQuarterReviewItemsByKey(item.quarterReviewItemKey, context.dataFoundationReady);
    if (rows.length !== 1) throw new Error('The Core Quarter Review Item could not be uniquely resolved.');
    const current = this.mapStoredQuarterReviewItem(rows[0]);
    assertQuarterReviewItemWriteBoundary(currentReview, current);
    assertQuarterReviewItemSnapshotCurrent(item, current);
    if (current.itemType !== 'CoreGold' || current.quarterReviewKey !== currentReview.quarterReviewKey || current.personKey !== currentReview.personKey) {
      throw new Error('The RAG Override target is not a Core KPI in the persisted manager review.');
    }
    const audits = await this.getQuarterAuditEvents(currentReview.quarterReviewKey);
    const matching = audits.filter(audit => audit.eventType === 'RAGOverridden'
      && audit.sourceReference === item.quarterReviewItemKey
      && current.managerOverride?.rag === rag
      && current.managerOverride.reason?.trim() === reason.trim());
    if (matching.length > 1) throw new Error('Duplicate RAG Override audits exist for this Core item state.');
    if (matching[0]) return verifyQuarterRagOverride(current, matching[0], actor);
    const plan = createQuarterRagOverridePlan(currentReview, current, actor, rag, reason, Guid.newGuid().toString(), new Date().toISOString());
    await this.mergeJson(this.listItemUrl(LISTS.quarterReviewItems, current.id), {
      ManagerOverrideRAG: plan.item.managerOverride?.rag,
      OverrideReason: plan.item.managerOverride?.reason,
      OverrideByEmail: plan.item.managerOverride?.actorEmail,
      OverrideAt: plan.item.managerOverride?.overriddenAt,
      FinalRAG: plan.item.finalApprovedRag
    }, current.etag, 'The Manager RAG Override could not be saved.');
    const audit = await this.appendQuarterAudit(plan.audit);
    const readBack = await this.getQuarterReviewItemsByKey(item.quarterReviewItemKey, context.dataFoundationReady);
    if (readBack.length !== 1) throw new Error('The Manager RAG Override could not be read back without duplication.');
    return { ...verifyQuarterRagOverride(this.mapQuarterReviewItem(readBack[0], current), audit, actor), alreadyCompleted: false };
  }

  public async saveQuarterBehaviourAssessment(
    context: IManagerQuarterReviewContext,
    item: IQuarterReviewItem,
    actor: IProductionPerson,
    rating: BehaviourRating
  ): Promise<IQuarterReviewItem> {
    this.assertAuthenticatedPerson(actor);
    const reviewRows = await this.getQuarterReviewsByKey(context.review.quarterReviewKey);
    if (reviewRows.length !== 1) throw new Error('The Quarter Review header could not be uniquely resolved for Behaviour assessment.');
    const currentReview = this.mapQuarterReview(reviewRows[0]);
    assertQuarterReviewSnapshotCurrent(context.review, currentReview);
    const rows = await this.getQuarterReviewItemsByKey(item.quarterReviewItemKey, context.dataFoundationReady);
    if (rows.length !== 1) throw new Error('The Behaviour Quarter Review Item could not be uniquely resolved.');
    const current = this.mapStoredQuarterReviewItem(rows[0]);
    assertQuarterReviewItemWriteBoundary(currentReview, current);
    assertQuarterReviewItemSnapshotCurrent(item, current);
    if (!canManagerAssessQuarterBehaviour(actor, currentReview, current)) {
      throw new Error('Only the assigned manager may assess an unlocked Behaviour in a Submitted Quarter Review.');
    }
    if (current.behaviourSnapshotV2) {
      if (!isBehaviourV2Rating(rating)) throw new Error('Manager Behaviour v02 assessment must be 1, 2 or 3.');
      const evidence = normaliseEmployeeBehaviourCustomObjective(item.managerBehaviourEvidenceV2);
      if (!evidence) throw new Error('Manager Behaviour v02 evidence is required and must be safe visible text.');
      if (current.managerBehaviourAssessmentV2 === rating && current.managerBehaviourEvidenceV2 === evidence) return current;
      await this.mergeJson(this.listItemUrl(LISTS.quarterReviewItems, current.id), {
        ManagerBehaviourEvidenceV2: evidence,
        ManagerBehaviourAssessmentV2: rating
      }, current.etag, 'The separate manager Behaviour v02 evidence/assessment could not be saved.');
      const readBackV2 = await this.getQuarterReviewItemsByKey(item.quarterReviewItemKey, context.dataFoundationReady);
      if (readBackV2.length !== 1) throw new Error('The manager Behaviour v02 assessment could not be read back without duplication.');
      const mappedV2 = this.mapQuarterReviewItem(readBackV2[0], current);
      if (mappedV2.managerBehaviourAssessmentV2 !== rating || mappedV2.managerBehaviourEvidenceV2 !== evidence) {
        throw new Error('The manager Behaviour v02 evidence/assessment did not reconcile to canonical readback.');
      }
      return mappedV2;
    }
    if (!isBehaviourRating(rating)) throw new Error('Manager Behaviour rating must be from 1 to 4.');
    const assessment = RATING_BEHAVIOUR_ASSESSMENTS[rating];
    if (current.managerBehaviourAssessment === assessment && current.managerBehaviourRating === rating) return current;
    await this.mergeJson(this.listItemUrl(LISTS.quarterReviewItems, current.id), {
      ManagerBehaviourAssessment: assessment,
      ManagerBehaviourRating: rating
    }, current.etag, 'The separate manager Behaviour assessment could not be saved.');
    const readBack = await this.getQuarterReviewItemsByKey(item.quarterReviewItemKey, context.dataFoundationReady);
    if (readBack.length !== 1) throw new Error('The manager Behaviour assessment could not be read back without duplication.');
    return this.mapQuarterReviewItem(readBack[0], current);
  }

  private async getQuarterReviewsByKey(quarterReviewKey: string): Promise<IQuarterReviewListItem[]> {
    return this.getItems<IQuarterReviewListItem>(
      LISTS.quarterReviews,
      QUARTER_REVIEW_SELECT,
      `QuarterReviewKey eq '${this.escapeOData(quarterReviewKey)}'`,
      'Id',
      2
    );
  }

  private async getQuarterReviewItemRows(quarterReviewKey: string, includeRecovery: boolean): Promise<IQuarterReviewItemListItem[]> {
    return this.getItems<IQuarterReviewItemListItem>(
      LISTS.quarterReviewItems,
      includeRecovery ? QUARTER_ITEM_RECOVERY_SELECT : QUARTER_ITEM_BASE_SELECT,
      `QuarterReviewKey eq '${this.escapeOData(quarterReviewKey)}'`,
      'QuarterReviewItemKey',
      100
    );
  }

  private async getQuarterReviewItemsByKey(quarterReviewItemKey: string, includeRecovery: boolean, includeBehaviourV02 = false): Promise<IQuarterReviewItemListItem[]> {
    return this.getItems<IQuarterReviewItemListItem>(
      LISTS.quarterReviewItems,
      includeBehaviourV02 ? QUARTER_ITEM_BEHAVIOUR_V2_SELECT
        : includeRecovery ? QUARTER_ITEM_RECOVERY_SELECT : QUARTER_ITEM_BASE_SELECT,
      `QuarterReviewItemKey eq '${this.escapeOData(quarterReviewItemKey)}'`,
      'Id',
      2
    );
  }

  private async assertCurrentQuarterRecoveryOwner(review: IQuarterReview, ownerPersonKey?: string): Promise<void> {
    if (!ownerPersonKey?.trim()) throw new Error('Select a recovery owner.');
    const subjectRows = await this.getItems<IPersonListItem>(
      LISTS.people, PEOPLE_SELECT, `PersonKey eq '${this.escapeOData(review.personKey)}'`, 'Id', 2
    );
    if (subjectRows.length !== 1 || !subjectRows[0].Active
      || subjectRows[0].Email.trim().toLowerCase() !== this.authenticatedEmail.trim().toLowerCase()
      || subjectRows[0].Email.trim().toLowerCase() !== review.employeeEmail.trim().toLowerCase()) {
      throw new Error('The current employee People identity could not be uniquely verified. Reload before saving.');
    }
    if (ownerPersonKey === review.personKey) return;
    if (ownerPersonKey !== subjectRows[0].ManagerPersonKey || ownerPersonKey !== review.managerPersonKey) {
      throw new Error('Select the current employee or assigned manager as recovery owner.');
    }
    const ownerRows = await this.getItems<IPersonListItem>(
      LISTS.people, PEOPLE_SELECT, `PersonKey eq '${this.escapeOData(ownerPersonKey)}'`, 'Id', 2
    );
    if (ownerRows.length !== 1 || !ownerRows[0].Active
      || ownerRows[0].Email.trim().toLowerCase() !== review.managerEmail.trim().toLowerCase()
      || ownerRows[0].Email.trim().toLowerCase() !== (subjectRows[0].ManagerEmail || '').trim().toLowerCase()) {
      throw new Error('The assigned recovery manager People identity could not be uniquely verified. Reload before saving.');
    }
  }

  private async getCurrentEditableQuarterReview(
    expected: IQuarterReview,
    actor: IProductionPerson,
    lifecycle: IQuarterLifecycle
  ): Promise<IQuarterReview> {
    const rows = await this.getQuarterReviewsByKey(expected.quarterReviewKey);
    if (rows.length !== 1) throw new Error('The Quarter Review header could not be uniquely resolved.');
    const current = this.mapQuarterReview(rows[0]);
    assertQuarterReviewSnapshotCurrent(expected, current);
    if (!canEmployeeEditQuarterReview(actor, current)) throw new Error('This Quarter Review is not editable by the signed-in employee.');
    if (current.quarter !== lifecycle.quarterKey || current.performanceYear !== lifecycle.performanceYearNumber || !lifecycle.isOpenForProgressUpdates) {
      throw new Error('Progress updates are not open for this configured Quarter Review.');
    }
    return current;
  }

  private async getWorkplanAssignmentRows(workplanKey: string): Promise<IWorkplanAssignmentReadback[]> {
    return this.getItems<IWorkplanAssignmentReadback>(
      LISTS.workplanItems,
      WORKPLAN_ASSIGNMENT_SELECT,
      `WorkplanKey eq '${this.escapeOData(workplanKey)}'`,
      'Id',
      5000
    );
  }

  private async assertActiveQuarterAssignment(item: IQuarterReviewItem, review: IQuarterReview): Promise<IWorkplanAssignmentReadback> {
    const assignments = (await this.getWorkplanAssignmentRows(review.workplanKey))
      .filter(row => row.WorkplanItemKey === item.workplanItemKey);
    if (assignments.length !== 1) throw new Error('The Quarter Review Item does not resolve to exactly one Annual Workplan assignment.');
    const assignment = assignments[0];
    if (!assignment.ActiveInWorkplan || assignment.PersonKey !== review.personKey || assignment.ItemType !== item.itemType) {
      throw new Error('The Quarter Review Item is not an active assignment for this employee Workplan.');
    }
    if (item.itemType === 'CoreGold' && assignment.KPIID !== item.kpiId) throw new Error('The Quarter Review KPI does not match its active Annual Workplan assignment.');
    if (item.itemType === 'CoreGold' && (!assignment.KPIVersionKey || !assignment.TargetVersionKey)) {
      throw new Error('The active Core assignment has no controlled KPI/Annual Target version binding.');
    }
    return assignment;
  }

  private async getPersistedQuarterItemsForTransition(
    review: IQuarterReview,
    includeRecovery: boolean
  ): Promise<IQuarterReviewItem[]> {
    const [rows, assignments] = await Promise.all([
      this.getQuarterReviewItemRows(review.quarterReviewKey, includeRecovery),
      this.getWorkplanAssignmentRows(review.workplanKey)
    ]);
    if (new Set(rows.map(row => row.QuarterReviewItemKey)).size !== rows.length) throw new Error('The Quarter Review contains duplicate persisted item keys.');
    if (new Set(rows.map(row => row.WorkplanItemKey)).size !== rows.length) throw new Error('The Quarter Review contains duplicate Annual Workplan assignment references.');
    const active = assignments.filter(row => row.ActiveInWorkplan);
    const activeKeys = new Set(active.map(row => row.WorkplanItemKey));
    const storedKeys = new Set(rows.map(row => row.WorkplanItemKey));
    if (activeKeys.size !== storedKeys.size || Array.from(activeKeys).some(key => !storedKeys.has(key))) {
      throw new Error('Every active Annual Workplan assignment must have exactly one persisted Quarter Review Item before transition.');
    }
    rows.forEach(row => {
      if (row.QuarterReviewKey !== review.quarterReviewKey || row.WorkplanKey !== review.workplanKey || row.PersonKey !== review.personKey || row.Quarter !== review.quarter) {
        throw new Error('A persisted Quarter Review Item is outside the current employee/Workplan/quarter boundary.');
      }
    });
    return rows.map(row => this.mapStoredQuarterReviewItem(row));
  }

  private async getProgressLedgers(workplanKey: string): Promise<IProgressLedger[]> {
    const rows = await this.getItems<IProgressLedgerListItem>(
      LISTS.progressNotes,
      PROGRESS_LEDGER_SELECT,
      `WorkplanKey eq '${this.escapeOData(workplanKey)}'`,
      'ProgressLedgerKey',
      100
    );
    if (new Set(rows.map(row => row.ProgressLedgerKey)).size !== rows.length) throw new Error('Duplicate progress ledger keys exist.');
    return rows.map(row => this.mapProgressLedger(row));
  }

  private async getProgressLedgerRows(progressLedgerKey: string): Promise<IProgressLedgerListItem[]> {
    return this.getItems<IProgressLedgerListItem>(
      LISTS.progressNotes,
      PROGRESS_LEDGER_SELECT,
      `ProgressLedgerKey eq '${this.escapeOData(progressLedgerKey)}'`,
      'Id',
      2
    );
  }

  private async getQuarterEvidence(personKey: string, performanceYear: number, quarter: QuarterKey): Promise<IQuarterEvidenceReference[]> {
    const rows = await this.getItems<IEvidenceListItem>(
      LISTS.evidence,
      EVIDENCE_SELECT,
      `PersonKey eq '${this.escapeOData(personKey)}' and PerformanceYear eq ${performanceYear}`,
      'EvidenceKey',
      500
    );
    return rows.filter(row => row.Quarter === quarter && Boolean(row.QuarterReviewKey) && Boolean(row.QuarterReviewItemKey)).map(row => ({
      evidenceKey: row.EvidenceKey,
      kind: 'File',
      personKey: row.PersonKey,
      workplanKey: row.WorkplanKey,
      workplanItemKey: row.WorkplanItemKey,
      quarterReviewKey: row.QuarterReviewKey as string,
      quarterReviewItemKey: row.QuarterReviewItemKey as string,
      performanceYear: row.PerformanceYear,
      quarter: row.Quarter as QuarterKey,
      kpiId: row.KPIID || undefined,
      description: row.EvidenceDescription,
      serverRelativeFileUrl: row.FileRef || undefined,
      status: row.EvidenceStatus
    }));
  }

  private recoveryPayload(item: IQuarterReviewItem): Record<string, unknown> {
    // A missing route means there is no active Recovery record. Clear the whole
    // route payload so hidden values from an earlier Amber/Red save cannot linger.
    const recovery = item.recovery?.route ? item.recovery : undefined;
    return {
      BTGRoute: recovery?.route || REST_NULL,
      BTGAction: recovery?.action || REST_NULL,
      BTGOwnerPersonKey: recovery?.ownerPersonKey || REST_NULL,
      BTGDueDate: recovery?.dueDate || REST_NULL,
      NextReviewDate: recovery?.nextReviewDate || REST_NULL,
      BTGStatus: recovery?.status || REST_NULL,
      BTGExpectedReturnToGreenDate: recovery?.expectedReturnToGreenDate || REST_NULL,
      BTGExpectedReducedOutcome: recovery?.expectedReducedOutcome || REST_NULL,
      ReforecastProposedTarget: recovery?.proposedRevisedTarget || REST_NULL,
      ReforecastProposedDate: recovery?.proposedRevisedDate || REST_NULL,
      ReforecastReason: recovery?.reforecastReason || REST_NULL,
      ReforecastApprovalStatus: recovery?.reforecastApprovalStatus || REST_NULL,
      EscalationDependency: recovery?.dependencyOrDecision || REST_NULL,
      EscalatedTo: recovery?.escalatedTo || REST_NULL,
      EscalationTargetDecisionDate: recovery?.targetDecisionDate || REST_NULL,
      BehaviourExamples: item.behaviourExamples || REST_NULL,
      ManagerBehaviourAssessment: item.managerBehaviourAssessment || REST_NULL
    };
  }

  private async getWorkplansByKey(workplanKey: string): Promise<IWorkplanItem[]> {
    return this.getItems<IWorkplanItem>(LISTS.workplans, WORKPLAN_SELECT, `WorkplanKey eq '${this.escapeOData(workplanKey)}'`, 'Id', 2);
  }

  private async getCoreItemsByNaturalKey(naturalKey: string): Promise<ICoreWorkplanListItem[]> {
    return this.getItems<ICoreWorkplanListItem>(LISTS.workplanItems, CORE_ITEM_SELECT, `WorkplanItemNaturalKey eq '${this.escapeOData(naturalKey)}'`, 'Id', 2);
  }

  private async getPersonalItemsByNaturalKey(naturalKey: string): Promise<IPersonalWorkplanListItem[]> {
    return this.getItems<IPersonalWorkplanListItem>(LISTS.workplanItems, PERSONAL_ITEM_SELECT, `WorkplanItemNaturalKey eq '${this.escapeOData(naturalKey)}'`, 'Id', 2);
  }

  private async getBehaviourItemsByNaturalKey(naturalKey: string): Promise<IBehaviourWorkplanListItem[]> {
    return this.getItems<IBehaviourWorkplanListItem>(LISTS.workplanItems, BEHAVIOUR_ITEM_SELECT, `WorkplanItemNaturalKey eq '${this.escapeOData(naturalKey)}'`, 'Id', 2);
  }

  private async getBehaviourObjectivesByKey(key: string): Promise<IBehaviourObjectiveLibraryListItem[]> {
    return this.getItems<IBehaviourObjectiveLibraryListItem>(
      LISTS.behaviourObjectiveLibrary,
      BEHAVIOUR_OBJECTIVE_LIBRARY_SELECT,
      `BehaviourObjectiveKey eq '${this.escapeOData(key)}'`,
      'Id',
      2
    );
  }

  private async getTransitionAudits(workplanKey: string, correlationKey: string): Promise<IWorkplanAuditEvent[]> {
    const rows = await this.getItems<IAuditListItem>(
      LISTS.audit,
      AUDIT_SELECT,
      `SubjectKey eq '${this.escapeOData(workplanKey)}' and CorrelationKey eq '${this.escapeOData(correlationKey)}'`,
      'Id',
      5
    );
    return rows.map(row => this.mapAudit(row));
  }

  private async getWorkplanAuditEvents(workplanKey: string): Promise<IWorkplanAuditEvent[]> {
    const rows = await this.getItems<IAuditListItem>(
      LISTS.audit,
      AUDIT_SELECT,
      `SubjectKey eq '${this.escapeOData(workplanKey)}'`,
      'EventAt',
      100
    );
    return rows.map(row => this.mapAudit(row));
  }

  private async getQuarterTransitionAudits(quarterReviewKey: string, correlationKey: string): Promise<IQuarterReviewAuditEvent[]> {
    const rows = await this.getItems<IAuditListItem>(
      LISTS.audit,
      AUDIT_SELECT,
      `SubjectKey eq '${this.escapeOData(quarterReviewKey)}' and CorrelationKey eq '${this.escapeOData(correlationKey)}'`,
      'Id',
      10
    );
    return rows.filter(row => row.SubjectType === 'QuarterReview').map(row => this.mapQuarterAudit(row));
  }

  private async getQuarterAuditEvents(quarterReviewKey: string): Promise<IQuarterReviewAuditEvent[]> {
    const rows = await this.getItems<IAuditListItem>(
      LISTS.audit,
      AUDIT_SELECT,
      `SubjectKey eq '${this.escapeOData(quarterReviewKey)}'`,
      'EventAt',
      100
    );
    return rows.filter(row => row.SubjectType === 'QuarterReview').map(row => this.mapQuarterAudit(row));
  }

  private async appendAudit(audit: IWorkplanAuditWrite): Promise<IWorkplanAuditEvent> {
    const existing = (await this.getTransitionAudits(audit.subjectKey, audit.correlationKey))
      .filter(row => row.eventType === audit.eventType);
    if (existing.length > 1) throw new Error(`Duplicate ${audit.eventType} audits exist.`);
    if (existing[0]) return existing[0];
    const titles: Record<WorkplanAuditEventType, string> = {
      WorkplanSubmitted: 'Annual Workplan submitted',
      WorkplanChangesRequested: 'Annual Workplan changes requested',
      WorkplanResubmitted: 'Annual Workplan resubmitted',
      WorkplanApproved: 'Annual Workplan approved',
      WorkplanLocked: 'Annual Workplan locked'
    };
    try {
      await this.postJson(this.listItemsUrl(LISTS.audit), {
        Title: titles[audit.eventType],
        AuditKey: audit.auditKey,
        EventType: audit.eventType,
        SubjectType: 'Workplan',
        SubjectKey: audit.subjectKey,
        PerformanceYear: audit.performanceYear,
        ActorEmail: audit.actorEmail,
        ActorRole: audit.actorRole,
        EventAt: audit.eventAt,
        Reason: audit.reason || REST_NULL,
        BeforeJSON: audit.beforeJson || REST_NULL,
        AfterJSON: audit.afterJson || REST_NULL,
        CorrelationKey: audit.correlationKey,
        Source: audit.source,
        SourceReference: audit.sourceReference || REST_NULL,
        Success: audit.success
      }, `The append-only ${audit.eventType} audit could not be created.`);
    } catch (error) {
      const raced = (await this.getTransitionAudits(audit.subjectKey, audit.correlationKey))
        .filter(row => row.eventType === audit.eventType);
      if (raced.length !== 1) throw error;
      return raced[0];
    }
    const created = (await this.getTransitionAudits(audit.subjectKey, audit.correlationKey))
      .filter(row => row.eventType === audit.eventType);
    if (created.length !== 1) throw new Error(`The ${audit.eventType} audit could not be verified.`);
    return created[0];
  }

  private async appendQuarterAudit(audit: IQuarterReviewAuditWrite): Promise<IQuarterReviewAuditEvent> {
    const existing = (await this.getQuarterTransitionAudits(audit.subjectKey, audit.correlationKey))
      .filter(row => row.eventType === audit.eventType);
    if (existing.length > 1) throw new Error(`Duplicate ${audit.eventType} audits exist.`);
    if (existing[0]) return existing[0];
    const titles: Record<QuarterReviewAuditEventType, string> = {
      QuarterReviewCreated: 'Quarter Review created',
      QuarterReviewSubmitted: 'Quarter Review submitted',
      QuarterReviewChangesRequested: 'Quarter Review changes requested',
      QuarterReviewResubmitted: 'Quarter Review resubmitted',
      QuarterReviewApproved: 'Quarter Review approved',
      QuarterReviewLocked: 'Quarter Review locked',
      QuarterReviewReopened: 'Quarter Review reopened',
      RAGOverridden: 'Quarter Review RAG overridden'
    };
    try {
      await this.postJson(this.listItemsUrl(LISTS.audit), {
        Title: titles[audit.eventType],
        AuditKey: audit.auditKey,
        EventType: audit.eventType,
        SubjectType: 'QuarterReview',
        SubjectKey: audit.subjectKey,
        PerformanceYear: audit.performanceYear,
        Quarter: audit.quarter,
        ActorEmail: audit.actorEmail,
        ActorRole: audit.actorRole,
        EventAt: audit.eventAt,
        Reason: audit.reason || REST_NULL,
        BeforeJSON: audit.beforeJson || REST_NULL,
        AfterJSON: audit.afterJson || REST_NULL,
        CorrelationKey: audit.correlationKey,
        Source: audit.source,
        SourceReference: audit.sourceReference || REST_NULL,
        Success: audit.success
      }, `The append-only ${audit.eventType} audit could not be created.`);
    } catch (error) {
      const raced = (await this.getQuarterTransitionAudits(audit.subjectKey, audit.correlationKey))
        .filter(row => row.eventType === audit.eventType);
      if (raced.length !== 1) throw error;
      return raced[0];
    }
    const created = (await this.getQuarterTransitionAudits(audit.subjectKey, audit.correlationKey))
      .filter(row => row.eventType === audit.eventType);
    if (created.length !== 1) throw new Error(`The ${audit.eventType} audit could not be verified.`);
    return created[0];
  }

  private async markTransitionRecoveryHold(workplanKey: string): Promise<void> {
    try {
      const rows = await this.getWorkplansByKey(workplanKey);
      if (rows.length !== 1) return;
      const current = this.mapWorkplan(rows[0]);
      await this.mergeJson(this.listItemUrl(LISTS.workplans, current.id), {
        AccessState: 'RecoveryHold',
        TransitionStatus: 'Failed',
        RowVersionToken: current.rowVersionToken + 1
      }, current.etag, 'The failed submission could not be placed in recovery hold.');
    } catch {
      // A failed recovery write is deliberately not hidden by a second exception.
    }
  }

  private quarterReviewTransitionPayload(review: IQuarterReview): Record<string, unknown> {
    return {
      State: review.state,
      AccessState: review.accessState,
      TransitionStatus: review.transitionStatus,
      TransitionCorrelationKey: review.transitionCorrelationKey || REST_NULL,
      EmployeeSubmissionComment: review.employeeSubmissionComment || REST_NULL,
      SubmittedAt: review.submittedAt || REST_NULL,
      SubmittedByEmail: review.submittedByEmail || REST_NULL,
      ManagerDecisionComment: review.managerDecisionComment || REST_NULL,
      ApprovedAt: review.approvedAt || REST_NULL,
      ApprovedByEmail: review.approvedByEmail || REST_NULL,
      LockedAt: review.lockedAt || REST_NULL,
      LockedByEmail: review.lockedByEmail || REST_NULL,
      RowVersionToken: review.rowVersionToken
    };
  }

  private async setQuarterReviewItemsDecisionState(quarterReviewKey: string, managerApproved: boolean, locked: boolean): Promise<void> {
    const rows = await this.getQuarterReviewItemRows(quarterReviewKey, true);
    for (const row of rows) {
      if (row.ItemType === 'Behaviour' && row.BehaviourFrameworkVersionSnapshot === BEHAVIOUR_FRAMEWORK_V2_VERSION) {
        await this.mergeJson(this.listItemUrl(LISTS.quarterReviewItems, row.Id), {
          ManagerApproved: managerApproved,
          Locked: locked
        }, row['@odata.etag'] || '*', 'The Behaviour v02 manager-decision state could not be saved.');
        continue;
      }
      const finalBehaviourRating = row.ItemType === 'Behaviour'
        ? row.ManagerBehaviourRating || row.EmployeeBehaviourRating
        : undefined;
      const behaviourResult = row.ItemType === 'Behaviour'
        ? calculateBehaviourRating(finalBehaviourRating, row.BehaviourTargetRating)
        : undefined;
      const finalRag = row.ItemType === 'Behaviour'
        ? behaviourResult?.rag || 'NotRated'
        : row.ManagerOverrideRAG && row.OverrideReason ? row.ManagerOverrideRAG : row.CalculatedRAG || 'NotRated';
      await this.mergeJson(this.listItemUrl(LISTS.quarterReviewItems, row.Id), {
        ManagerApproved: managerApproved,
        Locked: locked,
        FinalRAG: finalRag,
        FinalBehaviourRating: finalBehaviourRating || REST_NULL
      }, row['@odata.etag'] || '*', 'The Quarter Review Item manager-decision state could not be saved.');
    }
  }

  private async markQuarterTransitionRecoveryHold(quarterReviewKey: string): Promise<void> {
    try {
      const rows = await this.getQuarterReviewsByKey(quarterReviewKey);
      if (rows.length !== 1) return;
      const current = this.mapQuarterReview(rows[0]);
      await this.mergeJson(this.listItemUrl(LISTS.quarterReviews, current.id), {
        AccessState: 'RecoveryHold',
        TransitionStatus: 'Failed',
        RowVersionToken: current.rowVersionToken + 1
      }, current.etag, 'The failed Quarterly transition could not be placed in recovery hold.');
    } catch {
      // Preserve the original transition error when a recovery marker cannot be written.
    }
  }

  private assertUniqueNaturalKeys(rows: Array<{ WorkplanItemNaturalKey: string }>, label: string): void {
    const naturalKeys = new Set<string>();
    rows.forEach(row => {
      if (naturalKeys.has(row.WorkplanItemNaturalKey)) throw new Error(`Duplicate ${label} assignments exist in this Workplan. Contact the KPI system owner.`);
      naturalKeys.add(row.WorkplanItemNaturalKey);
    });
  }

  private mapQuarterReview(row: IQuarterReviewListItem): IQuarterReview {
    const hasBehaviourV2Header = [row.BehaviourFrameworkVersionSnapshot,
      row.BehaviourRoleTierSnapshot, row.BehaviourCadenceSnapshot]
      .some(value => value !== undefined && value !== null);
    if (hasBehaviourV2Header && (row.BehaviourFrameworkVersionSnapshot !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || !isBehaviourV2RoleTier(row.BehaviourRoleTierSnapshot)
      || row.BehaviourCadenceSnapshot !== 'Quarterly' && row.BehaviourCadenceSnapshot !== 'TwiceYearly')) {
      throw new Error('The stored Quarter Review Behaviour v02 header snapshot is incomplete or crossed.');
    }
    return {
      id: row.Id,
      etag: row['@odata.etag'] || '*',
      quarterReviewKey: row.QuarterReviewKey,
      workplanKey: row.WorkplanKey,
      personKey: row.PersonKey,
      employeeDisplayName: row.EmployeeDisplayName,
      employeeEmail: row.EmployeeEmail,
      performanceYear: row.PerformanceYear,
      quarter: row.Quarter,
      managerPersonKey: row.ManagerPersonKey,
      managerDisplayName: row.ManagerDisplayName,
      managerEmail: row.ManagerEmail,
      coreCategoryWeightSnapshot: row.CoreCategoryWeightSnapshot,
      personalCategoryWeightSnapshot: row.PersonalCategoryWeightSnapshot,
      behaviourCategoryWeightSnapshot: row.BehaviourCategoryWeightSnapshot,
      workplanApprovalCorrelationKey: row.WorkplanApprovalCorrelationKey || undefined,
      state: row.State,
      accessState: row.AccessState,
      transitionStatus: row.TransitionStatus,
      transitionCorrelationKey: row.TransitionCorrelationKey || undefined,
      employeeSubmissionComment: row.EmployeeSubmissionComment || undefined,
      submittedAt: row.SubmittedAt || undefined,
      submittedByEmail: row.SubmittedByEmail || undefined,
      managerDecisionComment: row.ManagerDecisionComment || undefined,
      approvedAt: row.ApprovedAt || undefined,
      approvedByEmail: row.ApprovedByEmail || undefined,
      lockedAt: row.LockedAt || undefined,
      lockedByEmail: row.LockedByEmail || undefined,
      rowVersionToken: row.RowVersionToken,
      behaviourFrameworkVersionV2: row.BehaviourFrameworkVersionSnapshot,
      behaviourRoleTierV2: row.BehaviourRoleTierSnapshot,
      behaviourCadenceV2: row.BehaviourCadenceSnapshot
    };
  }

  private mapQuarterReviewItem(
    row: IQuarterReviewItemListItem,
    preview: IQuarterReviewItem,
    previous?: IQuarterReviewItemListItem
  ): IQuarterReviewItem {
    // Preflight bound authority descriptors before the mapper can read them.
    ['WorkplanItemKey', 'WorkplanKey', 'PersonKey', 'QuarterReviewItemKey', 'Quarter', 'PerformanceYear',
      'BehaviourIDSnapshot', 'BehaviourAnnualTargetLevelV2', 'BehaviourAnnualTargetJustificationV2',
      'BehaviourAnnualTargetSourceWorkplanItemKeyV2', 'BehaviourAnnualTargetSourceEtagV2',
      'BehaviourAnnualTargetSourceWorkplanVersionV2', 'BehaviourAnnualTargetSourceApprovalKeyV2']
      .forEach(key => ownSnapshotValue(row, key));
    const behaviourSnapshotV2 = this.parseBehaviourPeriodSnapshotV2(row);
    const recovery = row.BTGRoute ? {
      route: row.BTGRoute,
      action: row.BTGAction || undefined,
      ownerPersonKey: row.BTGOwnerPersonKey || undefined,
      dueDate: row.BTGDueDate?.slice(0, 10),
      nextReviewDate: row.NextReviewDate?.slice(0, 10),
      status: row.BTGStatus,
      expectedReturnToGreenDate: row.BTGExpectedReturnToGreenDate?.slice(0, 10),
      expectedReducedOutcome: row.BTGExpectedReducedOutcome || undefined,
      proposedRevisedTarget: row.ReforecastProposedTarget || undefined,
      proposedRevisedDate: row.ReforecastProposedDate?.slice(0, 10),
      reforecastReason: row.ReforecastReason || undefined,
      reforecastApprovalStatus: row.ReforecastApprovalStatus,
      dependencyOrDecision: row.EscalationDependency || undefined,
      escalatedTo: row.EscalatedTo || undefined,
      targetDecisionDate: row.EscalationTargetDecisionDate?.slice(0, 10)
    } : undefined;
    const mapped: IQuarterReviewItem = {
      ...preview,
      id: row.Id,
      etag: row['@odata.etag'] || '*',
      quarterReviewItemKey: row.QuarterReviewItemKey,
      quarterReviewKey: row.QuarterReviewKey,
      workplanItemKey: row.WorkplanItemKey,
      workplanKey: row.WorkplanKey,
      personKey: row.PersonKey,
      performanceYear: row.PerformanceYear,
      quarter: row.Quarter,
      itemType: row.ItemType,
      kpiId: row.KPIID || undefined,
      kpiVersionKey: row.KPIVersionKey || undefined,
      targetVersionKey: row.TargetVersionKey || undefined,
      wording: row.ItemWordingSnapshot || preview.wording,
      itemDescription: row.ItemDescriptionSnapshot || preview.itemDescription,
      measure: row.MeasureSnapshot || preview.measure,
      pillar: row.PillarSnapshot || preview.pillar,
      workstream: row.WorkstreamSnapshot || preview.workstream,
      ownerEmail: row.OwnerEmailSnapshot || preview.ownerEmail,
      unitLabel: row.UnitLabelSnapshot || preview.unitLabel,
      metricType: row.MetricTypeSnapshot || preview.metricType,
      scoringDirection: row.ScoringDirectionSnapshot || preview.scoringDirection,
      percentageSourceScale: row.PercentageScaleSnapshot || preview.percentageSourceScale,
      baselineValue: row.BaselineValueSnapshot ?? preview.baselineValue,
      yearEndTargetValueSnapshot: row.YearEndTargetValueSnapshot ?? preview.yearEndTargetValueSnapshot,
      yearEndTargetTextSnapshot: row.YearEndTargetTextSnapshot || preview.yearEndTargetTextSnapshot,
      quarterTargetValue: row.QuarterTargetValue,
      quarterTargetText: row.QuarterTargetText || undefined,
      previousQuarterActualValue: previous?.EmployeeActualValue,
      previousQuarterActualText: previous?.EmployeeActualText || undefined,
      employeeActualValue: row.EmployeeActualValue,
      employeeActualText: row.EmployeeActualText || undefined,
      progressPct: row.ProgressPct,
      scoredProgressPct: typeof row.ProgressPct === 'number' ? Math.max(0, Math.min(100, row.ProgressPct)) : undefined,
      calculatedRag: row.CalculatedRAG || 'NotRated',
      calculationRuleVersion: row.CalculationRuleVersion || undefined,
      scoringMessage: row.CalculatedRAG === 'NotRated' ? 'RAG pending KPI scoring configuration.' : undefined,
      statusUpdate: row.StatusUpdate || undefined,
      behaviourReflection: row.ItemType === 'Behaviour' ? row.StatusUpdate || undefined : preview.behaviourReflection,
      behaviourExamples: row.BehaviourExamples || preview.behaviourExamples,
      evidenceCount: row.EvidenceCount,
      recovery,
      quarterEndForecastValue: row.QuarterEndForecastValue,
      quarterEndForecastText: row.QuarterEndForecastText || undefined,
      managerComment: row.ManagerComment || undefined,
      managerOverride: row.ManagerOverrideRAG ? {
        rag: row.ManagerOverrideRAG === 'NotRated' ? undefined : row.ManagerOverrideRAG,
        reason: row.OverrideReason || undefined,
        actorEmail: row.OverrideByEmail || undefined,
        overriddenAt: row.OverrideAt || undefined
      } : undefined,
      finalApprovedRag: row.FinalRAG || undefined,
      contributionWeightSnapshot: row.ContributionWeightSnapshot,
      workplanItemWeightSnapshot: row.WorkplanItemWeightSnapshot,
      managerBehaviourAssessment: row.ManagerBehaviourAssessment,
      behaviourId: row.BehaviourIDSnapshot || preview.behaviourId,
      behaviourVersionKey: row.BehaviourVersionKeySnapshot || preview.behaviourVersionKey,
      behaviourTitle: row.BehaviourTitleSnapshot || preview.behaviourTitle,
      behaviourPrompt: row.BehaviourDescriptionSnapshot || preview.behaviourPrompt,
      behaviourAssessmentGuidance: row.BehaviourGuidanceSnapshot || preview.behaviourAssessmentGuidance,
      behaviourObjectiveKey: row.BehaviourObjectiveKeySnapshot || preview.behaviourObjectiveKey,
      behaviourObjectiveSource: row.BehaviourObjectiveSourceSnapshot || preview.behaviourObjectiveSource,
      behaviourObjectiveTitle: row.BehaviourObjectiveTitleSnapshot || preview.behaviourObjectiveTitle,
      behaviourObjectiveDescription: row.ItemDescriptionSnapshot || preview.behaviourObjectiveDescription,
      behaviourEvidenceDefinition: row.BehaviourEvidenceDefSnapshot || preview.behaviourEvidenceDefinition,
      behaviourTargetRating: behaviourSnapshotV2 ? undefined : row.BehaviourTargetRating || preview.behaviourTargetRating,
      employeeBehaviourRating: behaviourSnapshotV2 ? undefined : row.EmployeeBehaviourRating,
      managerBehaviourRating: behaviourSnapshotV2 ? undefined : row.ManagerBehaviourRating,
      finalBehaviourRating: behaviourSnapshotV2 ? undefined : row.FinalBehaviourRating,
      behaviourSnapshotV2,
      behaviourAnnualTargetLevelV2: ownSnapshotValue(row, 'BehaviourAnnualTargetLevelV2') as IQuarterReviewItem['behaviourAnnualTargetLevelV2'],
      behaviourAnnualTargetJustificationV2: ownSnapshotValue(row, 'BehaviourAnnualTargetJustificationV2') as IQuarterReviewItem['behaviourAnnualTargetJustificationV2'],
      behaviourAnnualTargetSourceWorkplanItemKeyV2: ownSnapshotValue(row, 'BehaviourAnnualTargetSourceWorkplanItemKeyV2') as IQuarterReviewItem['behaviourAnnualTargetSourceWorkplanItemKeyV2'],
      behaviourAnnualTargetSourceEtagV2: ownSnapshotValue(row, 'BehaviourAnnualTargetSourceEtagV2') as IQuarterReviewItem['behaviourAnnualTargetSourceEtagV2'],
      behaviourAnnualTargetSourceWorkplanVersionV2: ownSnapshotValue(row, 'BehaviourAnnualTargetSourceWorkplanVersionV2') as IQuarterReviewItem['behaviourAnnualTargetSourceWorkplanVersionV2'],
      behaviourAnnualTargetSourceApprovalKeyV2: ownSnapshotValue(row, 'BehaviourAnnualTargetSourceApprovalKeyV2') as IQuarterReviewItem['behaviourAnnualTargetSourceApprovalKeyV2'],
      employeeBehaviourEvidenceV2: row.EmployeeBehaviourEvidenceV2,
      employeeBehaviourAssessmentV2: row.EmployeeBehaviourAssessmentV2,
      managerBehaviourEvidenceV2: row.ManagerBehaviourEvidenceV2,
      managerBehaviourAssessmentV2: row.ManagerBehaviourAssessmentV2,
      finalBehaviourEvidenceV2: row.FinalBehaviourEvidenceV2,
      finalBehaviourAssessmentV2: row.FinalBehaviourAssessmentV2,
      managerApproved: row.ManagerApproved,
      locked: row.Locked
    };
    const targetKeys = ['behaviourAnnualTargetLevelV2', 'behaviourAnnualTargetJustificationV2',
      'behaviourAnnualTargetSourceWorkplanItemKeyV2', 'behaviourAnnualTargetSourceEtagV2',
      'behaviourAnnualTargetSourceWorkplanVersionV2', 'behaviourAnnualTargetSourceApprovalKeyV2'] as const;
    targetKeys.forEach(key => { if (mapped[key] === null || mapped[key] === '') delete mapped[key]; });
    const image = materialiseQuarterBehaviourTarget(mapped);
    return { ...mapped, ...image };
  }

  private mapStoredQuarterReviewItem(row: IQuarterReviewItemListItem): IQuarterReviewItem {
    const preview: IQuarterReviewItem = {
      id: row.Id,
      etag: row['@odata.etag'] || '*',
      quarterReviewItemKey: row.QuarterReviewItemKey,
      quarterReviewKey: row.QuarterReviewKey,
      workplanItemKey: row.WorkplanItemKey,
      workplanKey: row.WorkplanKey,
      personKey: row.PersonKey,
      performanceYear: row.PerformanceYear,
      quarter: row.Quarter,
      itemType: row.ItemType,
      kpiId: row.KPIID || undefined,
      kpiVersionKey: row.KPIVersionKey || undefined,
      targetVersionKey: row.TargetVersionKey || undefined,
      wording: row.ItemWordingSnapshot,
      itemDescription: row.ItemDescriptionSnapshot || undefined,
      measure: row.MeasureSnapshot || undefined,
      pillar: row.PillarSnapshot || undefined,
      workstream: row.WorkstreamSnapshot || undefined,
      ownerEmail: row.OwnerEmailSnapshot || undefined,
      unitLabel: row.UnitLabelSnapshot || undefined,
      metricType: row.MetricTypeSnapshot || undefined,
      scoringDirection: row.ScoringDirectionSnapshot || undefined,
      percentageSourceScale: row.PercentageScaleSnapshot,
      baselineValue: row.BaselineValueSnapshot,
      yearEndTargetValueSnapshot: row.YearEndTargetValueSnapshot,
      yearEndTargetTextSnapshot: row.YearEndTargetTextSnapshot || undefined,
      quarterTargetValue: row.QuarterTargetValue,
      quarterTargetText: row.QuarterTargetText || undefined,
      behaviourId: row.BehaviourIDSnapshot || undefined,
      behaviourVersionKey: row.BehaviourVersionKeySnapshot || undefined,
      behaviourTitle: row.BehaviourTitleSnapshot || undefined,
      behaviourPrompt: row.BehaviourDescriptionSnapshot || undefined,
      behaviourAssessmentGuidance: row.BehaviourGuidanceSnapshot || undefined,
      behaviourObjectiveKey: row.BehaviourObjectiveKeySnapshot || undefined,
      behaviourObjectiveSource: row.BehaviourObjectiveSourceSnapshot,
      behaviourObjectiveTitle: row.BehaviourObjectiveTitleSnapshot || undefined,
      behaviourObjectiveDescription: row.ItemDescriptionSnapshot || undefined,
      behaviourEvidenceDefinition: row.BehaviourEvidenceDefSnapshot || undefined,
      behaviourTargetRating: row.BehaviourTargetRating,
      calculatedRag: row.CalculatedRAG || 'NotRated',
      evidenceCount: row.EvidenceCount,
      managerApproved: row.ManagerApproved,
      locked: row.Locked
    };
    return this.mapQuarterReviewItem(row, preview);
  }

  private mapProgressLedger(row: IProgressLedgerListItem): IProgressLedger {
    let parsed: unknown = [];
    try {
      parsed = JSON.parse(row.ProgressEntriesJSON || '[]');
    } catch {
      throw new Error(`Progress ledger ${row.ProgressLedgerKey} contains invalid JSON.`);
    }
    if (!Array.isArray(parsed) || parsed.some(entry => typeof entry !== 'object' || entry === null)) {
      throw new Error(`Progress ledger ${row.ProgressLedgerKey} must contain an entry array.`);
    }
    return {
      id: row.Id,
      etag: row['@odata.etag'] || '*',
      progressLedgerKey: row.ProgressLedgerKey,
      workplanItemKey: row.WorkplanItemKey,
      workplanKey: row.WorkplanKey,
      personKey: row.PersonKey,
      performanceYear: row.PerformanceYear,
      itemType: row.ItemType,
      kpiId: row.KPIID || undefined,
      entries: parsed as IProgressEntry[],
      locked: row.Locked,
      rowVersionToken: row.RowVersionToken
    };
  }

  private mapWorkplan(row: IWorkplanItem): IAnnualWorkplan {
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', workplanKey: row.WorkplanKey, personKey: row.PersonKey,
      employeeDisplayName: row.EmployeeDisplayName, employeeEmail: row.EmployeeEmail, performanceYear: row.PerformanceYear,
      managerPersonKey: row.ManagerPersonKey || undefined, managerDisplayName: row.ManagerDisplayName || undefined,
      managerEmail: row.ManagerEmail || undefined, state: row.State, accessState: row.AccessState,
      transitionStatus: row.TransitionStatus, transitionCorrelationKey: row.TransitionCorrelationKey || undefined,
      coreCategoryWeight: row.CoreCategoryWeight,
      personalCategoryWeight: row.PersonalCategoryWeight, behaviourCategoryWeight: row.BehaviourCategoryWeight,
      categoryWeightReason: row.CategoryWeightingReason || undefined,
      submittedAt: row.SubmittedAt || undefined, submittedByEmail: row.SubmittedByEmail || undefined,
      managerDecisionComment: row.ManagerDecisionComment || undefined,
      approvedAt: row.ApprovedAt || undefined, approvedByEmail: row.ApprovedByEmail || undefined,
      lockedAt: row.LockedAt || undefined, lockedByEmail: row.LockedByEmail || undefined,
      rowVersionToken: row.RowVersionToken
    };
  }

  private mapCoreWorkplanItem(row: ICoreWorkplanListItem): ICoreWorkplanItem {
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', workplanItemKey: row.WorkplanItemKey,
      naturalKey: row.WorkplanItemNaturalKey, workplanKey: row.WorkplanKey, personKey: row.PersonKey,
      performanceYear: row.PerformanceYear, kpiId: row.KPIID, kpiVersionKey: row.KPIVersionKey,
      targetVersionKey: row.TargetVersionKey, coreWorkplanWeight: row.CoreWorkplanWeight,
      employeeKpiRole: row.EmployeeKpiRole, displayOrder: row.DisplayOrder, activeInWorkplan: row.ActiveInWorkplan
    };
  }

  private mapPersonalWorkplanItem(row: IPersonalWorkplanListItem): IPersonalWorkplanItem {
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', workplanItemKey: row.WorkplanItemKey,
      naturalKey: row.WorkplanItemNaturalKey, workplanKey: row.WorkplanKey, personKey: row.PersonKey,
      performanceYear: row.PerformanceYear, wording: row.LocalKPIWording || '', measure: row.LocalMeasure || '',
      description: row.LocalKPIDescription || undefined,
      measureType: row.LocalMetricType,
      scoringDirection: row.LocalScoringDirection,
      percentageSourceScale: row.LocalPercentageScale,
      baselineValue: row.LocalBaselineValue,
      yearEndTargetValue: row.YearEndTargetValue, yearEndTargetText: row.YearEndTargetText || undefined,
      q1TargetValue: row.Q1TargetValue, q1TargetText: row.Q1TargetText || undefined,
      q2TargetValue: row.Q2TargetValue, q2TargetText: row.Q2TargetText || undefined,
      q3TargetValue: row.Q3TargetValue, q3TargetText: row.Q3TargetText || undefined,
      q4TargetValue: row.Q4TargetValue, q4TargetText: row.Q4TargetText || undefined,
      unitLabel: row.UnitLabel || '', personalItemWeight: row.PersonalItemWeight, displayOrder: row.DisplayOrder,
      activeInWorkplan: row.ActiveInWorkplan
    };
  }

  private mapBehaviourWorkplanItem(row: IBehaviourWorkplanListItem): IBehaviourWorkplanItem {
    const snapshot = this.parseBehaviourAnnualSnapshotV2(row);
    if (row.BehaviourVersionKey === BEHAVIOUR_FRAMEWORK_V2_VERSION && !snapshot)
      throw new Error('The saved Behaviour v02 annual Value snapshot is missing.');
    const planningLevels = readBehaviourPlanningLevelsV1(row as unknown as Record<string, unknown>);
    if (planningLevels && !snapshot) throw new Error('Behaviour planning levels require a valid v02 annual snapshot.');
    const selectedSuggestionKeys = snapshot
      ? this.parseBehaviourStringArray(row.BehaviourV2SelectedSuggestionKeysJSON, 'selected suggestion keys')
      : undefined;
    const selectionSnapshots = snapshot ? decodeBehaviourSelectionSnapshotsV2(
      row.BehaviourV2SelectionSnapshotsJSON || '', row.BehaviourV2SelectionSnapshotsSHA256 || '',
      Number(row.BehaviourV2SelectionSnapshotsUtf8ByteLength)) : undefined;
    if (snapshot && (selectionSnapshots?.valueId !== snapshot.valueId
      || JSON.stringify(selectedSuggestionKeys) !== JSON.stringify(selectionSnapshots.selections
        .filter(selection => selection.source === 'Catalogue').map(selection => selection.selectionKey))))
      throw new Error('The saved Behaviour v02 focus selection provenance is missing or crossed.');
    const behaviourPeriodCommitmentsV2: Record<string, string> = {};
    if (snapshot) {
      let parsed: unknown;
      try { parsed = JSON.parse(row.BehaviourPeriodCommitmentsV2JSON || 'null') as unknown; }
      catch { throw new Error('The stored Behaviour v02 period commitment JSON is invalid.'); }
      if (!Array.isArray(parsed) || parsed.length !== snapshot.periodKeys.length) {
        throw new Error('The stored Behaviour v02 period commitments do not match the immutable cadence snapshot.');
      }
      parsed.forEach(value => {
        const entry = value as { period?: unknown; commitment?: unknown };
        if (!entry || typeof entry.period !== 'string' || snapshot.periodKeys.indexOf(entry.period as BehaviourV2Period) < 0
          || behaviourPeriodCommitmentsV2[entry.period] !== undefined || typeof entry.commitment !== 'string'
          || !entry.commitment.trim()) {
          throw new Error('A stored Behaviour v02 period commitment is incomplete or crossed.');
        }
        behaviourPeriodCommitmentsV2[entry.period] = entry.commitment;
      });
    }
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', workplanItemKey: row.WorkplanItemKey,
      naturalKey: row.WorkplanItemNaturalKey, workplanKey: row.WorkplanKey, personKey: row.PersonKey,
      performanceYear: row.PerformanceYear, behaviourId: row.BehaviourID,
      behaviourVersionKey: row.BehaviourVersionKey,
      behaviourSnapshotV2: snapshot,
      behaviourCommitmentV2: snapshot ? row.BehaviourCommitmentV2 : undefined,
      behaviourPlanningLevelsV1: planningLevels,
      behaviourSelectionSnapshotsV2: selectionSnapshots,
      behaviourSelectionSnapshotsSha256: snapshot ? row.BehaviourV2SelectionSnapshotsSHA256 : undefined,
      behaviourSelectionSnapshotsUtf8ByteLength: snapshot ? row.BehaviourV2SelectionSnapshotsUtf8ByteLength : undefined,
      behaviourPeriodCommitmentsV2: snapshot ? Object.freeze(behaviourPeriodCommitmentsV2) : undefined,
      objectiveSource: row.BehaviourObjectiveSource,
      sourceObjectiveKey: row.BehaviourObjectiveKey || undefined,
      selectedSuggestionKeys,
      objectiveTitle: row.BehaviourObjectiveTitle || undefined,
      objectiveDescription: row.BehaviourObjectiveDescription || undefined,
      measure: row.BehaviourMeasure || undefined,
      unit: row.UnitLabel || undefined,
      evidenceDefinition: row.BehaviourEvidenceDefinition || undefined,
      q1TargetText: row.Q1TargetText || undefined,
      q2TargetText: row.Q2TargetText || undefined,
      q3TargetText: row.Q3TargetText || undefined,
      q4TargetText: row.Q4TargetText || undefined,
      targetRating: row.Q1BehaviourTargetRating,
      q1TargetRating: row.Q1BehaviourTargetRating,
      q2TargetRating: row.Q2BehaviourTargetRating,
      q3TargetRating: row.Q3BehaviourTargetRating,
      q4TargetRating: row.Q4BehaviourTargetRating,
      behaviourItemWeight: row.BehaviourItemWeight,
      displayOrder: row.DisplayOrder, activeInWorkplan: row.ActiveInWorkplan
    };
  }

  private parseBehaviourPeriodSnapshotV2(row: IQuarterReviewItemListItem): IQuarterReviewItem['behaviourSnapshotV2'] {
    const hasV2Field = [row.BehaviourFrameworkVersionSnapshot, row.BehaviourValueTitleSnapshot,
      row.BehaviourCorporateValueSnapshot, row.BehaviourRoleTierSnapshot, row.BehaviourDescriptorSnapshot,
      row.BehaviourCadenceSnapshot, row.BehaviourPeriodKeysSnapshotJSON, row.BehaviourPeriodSnapshot,
      row.BehaviourRatingLabelsSnapshotJSON, row.EmployeeBehaviourEvidenceV2,
      row.EmployeeBehaviourAssessmentV2, row.ManagerBehaviourEvidenceV2,
      row.ManagerBehaviourAssessmentV2, row.FinalBehaviourEvidenceV2, row.FinalBehaviourAssessmentV2]
      .some(value => value !== undefined && value !== null);
    if (!hasV2Field) return undefined;
    let periodKeys: unknown;
    let ratingOptions: unknown;
    try {
      periodKeys = JSON.parse(row.BehaviourPeriodKeysSnapshotJSON || 'null') as unknown;
      ratingOptions = JSON.parse(row.BehaviourRatingLabelsSnapshotJSON || 'null') as unknown;
    } catch { throw new Error('The stored Behaviour v02 period snapshot JSON is invalid.'); }
    const cadence = row.BehaviourCadenceSnapshot;
    if (row.BehaviourFrameworkVersionSnapshot !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || !isBehaviourV2ValueId(row.BehaviourIDSnapshot) || !isBehaviourV2RoleTier(row.BehaviourRoleTierSnapshot)
      || cadence !== 'Quarterly' && cadence !== 'TwiceYearly'
      || !row.BehaviourValueTitleSnapshot?.trim() || !row.BehaviourCorporateValueSnapshot?.trim()
      || !row.BehaviourDescriptorSnapshot?.trim() || !Array.isArray(periodKeys)
      || JSON.stringify([...periodKeys].sort()) !== JSON.stringify([...behaviourV2Periods(cadence)].sort())
      || !row.BehaviourPeriodSnapshot || (periodKeys as string[]).indexOf(row.BehaviourPeriodSnapshot) < 0
      || !Array.isArray(ratingOptions) || JSON.stringify(ratingOptions) !== JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS)
      || row.EmployeeBehaviourAssessmentV2 !== undefined && !isBehaviourV2Rating(row.EmployeeBehaviourAssessmentV2)
      || row.ManagerBehaviourAssessmentV2 !== undefined && !isBehaviourV2Rating(row.ManagerBehaviourAssessmentV2)
      || row.FinalBehaviourAssessmentV2 !== undefined && !isBehaviourV2Rating(row.FinalBehaviourAssessmentV2)) {
      throw new Error('The stored Behaviour v02 period snapshot or assessment is incomplete, mixed or crossed.');
    }
    return Object.freeze({ frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      valueId: row.BehaviourIDSnapshot as BehaviourV2ValueId, valueTitle: row.BehaviourValueTitleSnapshot,
      corporateValue: row.BehaviourCorporateValueSnapshot, roleTier: row.BehaviourRoleTierSnapshot,
      descriptor: row.BehaviourDescriptorSnapshot, cadence,
      periodKeys: Object.freeze((periodKeys as BehaviourV2Period[]).slice()),
      ratingOptions: Object.freeze((ratingOptions as IBehaviourV2RatingOption[]).map(option => Object.freeze({ ...option }))),
      period: row.BehaviourPeriodSnapshot });
  }

  private parseBehaviourAnnualSnapshotV2(row: IBehaviourWorkplanListItem): IBehaviourWorkplanItem['behaviourSnapshotV2'] {
    const hasV2Field = [row.BehaviourFrameworkVersion, row.BehaviourValueTitleSnapshot,
      row.BehaviourCorporateValueSnapshot, row.BehaviourRoleTierSnapshot, row.BehaviourDescriptorSnapshot,
      row.BehaviourCadenceSnapshot, row.BehaviourPeriodKeysSnapshotJSON,
      row.BehaviourRatingLabelsSnapshotJSON, row.BehaviourCommitmentV2,
      row.BehaviourPeriodCommitmentsV2JSON, row.BehaviourV2SelectedSuggestionKeysJSON]
      .some(value => value !== undefined && value !== null);
    if (!hasV2Field) return undefined;
    let periodKeys: unknown;
    let ratingOptions: unknown;
    try {
      periodKeys = JSON.parse(row.BehaviourPeriodKeysSnapshotJSON || 'null') as unknown;
      ratingOptions = JSON.parse(row.BehaviourRatingLabelsSnapshotJSON || 'null') as unknown;
    } catch { throw new Error('The stored Behaviour v02 annual snapshot JSON is invalid.'); }
    const cadence = row.BehaviourCadenceSnapshot;
    if (row.BehaviourFrameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || row.BehaviourVersionKey !== BEHAVIOUR_FRAMEWORK_V2_VERSION || !isBehaviourV2ValueId(row.BehaviourID)
      || !isBehaviourV2RoleTier(row.BehaviourRoleTierSnapshot)
      || cadence !== 'Quarterly' && cadence !== 'TwiceYearly'
      || !row.BehaviourValueTitleSnapshot?.trim() || !row.BehaviourCorporateValueSnapshot?.trim()
      || !row.BehaviourDescriptorSnapshot?.trim() || !Array.isArray(periodKeys)
      || JSON.stringify([...periodKeys].sort()) !== JSON.stringify([...behaviourV2Periods(cadence)].sort())
      || !Array.isArray(ratingOptions) || JSON.stringify(ratingOptions) !== JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS)) {
      throw new Error('The stored Behaviour v02 annual snapshot is incomplete, mixed or crossed.');
    }
    return Object.freeze({ frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      valueId: row.BehaviourID as BehaviourV2ValueId, valueTitle: row.BehaviourValueTitleSnapshot,
      corporateValue: row.BehaviourCorporateValueSnapshot, roleTier: row.BehaviourRoleTierSnapshot,
      descriptor: row.BehaviourDescriptorSnapshot, cadence,
      periodKeys: Object.freeze((periodKeys as BehaviourV2Period[]).slice()),
      ratingOptions: Object.freeze((ratingOptions as IBehaviourV2RatingOption[]).map(option => Object.freeze({ ...option }))) });
  }

  private parseBehaviourStringArray(value: string | undefined, label: string): string[] {
    let parsed: unknown;
    try { parsed = JSON.parse(value || 'null') as unknown; }
    catch { throw new Error(`The stored Behaviour v02 ${label} JSON is invalid.`); }
    if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string' || !item.trim())
      || new Set(parsed as string[]).size !== parsed.length) {
      throw new Error(`The stored Behaviour v02 ${label} are invalid.`);
    }
    return parsed as string[];
  }

  private mapBehaviourObjective(row: IBehaviourObjectiveLibraryListItem): IBehaviourObjectiveLibraryRecord {
    return {
      id: row.Id,
      etag: row['@odata.etag'] || '*',
      behaviourObjectiveKey: row.BehaviourObjectiveKey,
      behaviourKey: row.BehaviourKey,
      objectiveTitle: row.ObjectiveTitle,
      objectiveDescription: row.ObjectiveDescription,
      suggestedMeasure: row.SuggestedMeasure,
      suggestedUnit: row.SuggestedUnit,
      suggestedEvidence: row.SuggestedEvidence,
      active: row.Active,
      sortOrder: row.SortOrder,
      effectiveFrom: row.EffectiveFrom?.slice(0, 10),
      effectiveTo: row.EffectiveTo?.slice(0, 10)
    };
  }

  private mapProductionPerson(row: IPersonListItem): IProductionPerson {
    const hasBehaviourV2Assignment = Boolean(row.BehaviourFrameworkVersionV2
      || row.BehaviourRoleTierV2 || row.BehaviourCadenceV2);
    if (hasBehaviourV2Assignment && (row.BehaviourFrameworkVersionV2 !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || !isBehaviourV2RoleTier(row.BehaviourRoleTierV2)
      || row.BehaviourCadenceV2 !== 'Quarterly' && row.BehaviourCadenceV2 !== 'TwiceYearly')) {
      throw new Error('The explicit Behaviour v02 person tier/cadence assignment is incomplete or invalid.');
    }
    return {
      id: row.Id,
      personKey: row.PersonKey,
      displayName: row.Title,
      email: row.Email,
      managerPersonKey: row.ManagerPersonKey || undefined,
      managerEmail: row.ManagerEmail || undefined,
      team: row.Team || undefined,
      jobRole: row.JobRole || undefined,
      appRoles: row.AppRoles || [],
      active: row.Active,
      behaviourFrameworkVersionV2: row.BehaviourFrameworkVersionV2,
      behaviourRoleTierV2: row.BehaviourRoleTierV2,
      behaviourCadenceV2: row.BehaviourCadenceV2
    };
  }

  private async assertAuthoritativeAdmin(actor: IProductionPerson): Promise<IProductionPerson> {
    this.assertAuthenticatedPerson(actor);
    const current = await this.getPersonByEmail(actor.email);
    if (!current
      || current.id !== actor.id
      || current.personKey !== actor.personKey
      || !current.active
      || !isKpiDataQualityAdmin(current.appRoles)) {
      throw new Error('The signed-in People record does not carry an authorised Admin application role.');
    }
    return current;
  }

  private async readAuthoritativeSystemAdmin(): Promise<IProductionPerson> {
    const authenticatedEmail = this.authenticatedEmail.trim().toLowerCase();
    if (!authenticatedEmail) {
      throw new Error('The signed-in identity is unavailable for authoritative SystemAdmin readback.');
    }
    const current = await this.getPersonByEmail(authenticatedEmail);
    if (!current
      || typeof current.email !== 'string'
      || typeof current.personKey !== 'string'
      || current.email.trim().toLowerCase() !== authenticatedEmail
      || !current.active
      || !current.personKey.trim()
      || !current.appRoles.includes('SystemAdmin')) {
      throw new Error('The signed-in People readback does not resolve to exactly one active SystemAdmin identity.');
    }
    return current;
  }

  private async resolveAuthoritativeLifecycleSystemAdmin(): Promise<IProductionPerson> {
    const signedInEmail = this.authenticatedEmail.trim().toLowerCase();
    const actor = await this.getPersonByEmail(signedInEmail);
    if (!actor
      || !actor.active
      || actor.email.trim().toLowerCase() !== signedInEmail
      || !actor.personKey.trim()
      || actor.appRoles.indexOf('SystemAdmin') < 0) {
      throw new Error('The signed-in People record does not carry the active SystemAdmin role required for Workplan lifecycle administration.');
    }
    return actor;
  }

  private mapAudit(row: IAuditListItem): IWorkplanAuditEvent {
    return {
      id: row.Id,
      auditKey: row.AuditKey,
      eventType: row.EventType as WorkplanAuditEventType,
      subjectKey: row.SubjectKey,
      performanceYear: row.PerformanceYear,
      actorEmail: row.ActorEmail,
      actorRole: row.ActorRole,
      eventAt: row.EventAt,
      reason: row.Reason || undefined,
      beforeJson: row.BeforeJSON || undefined,
      afterJson: row.AfterJSON || undefined,
      correlationKey: row.CorrelationKey,
      source: row.Source,
      sourceReference: row.SourceReference || undefined,
      success: row.Success
    };
  }

  private mapQuarterAudit(row: IAuditListItem): IQuarterReviewAuditEvent {
    if (!row.Quarter) throw new Error(`Quarter Review audit ${row.AuditKey} has no Quarter value.`);
    let actorPersonKey: string | undefined;
    try {
      const parsed = JSON.parse(row.AfterJSON || row.BeforeJSON || '{}') as { actorPersonKey?: unknown };
      actorPersonKey = typeof parsed.actorPersonKey === 'string' ? parsed.actorPersonKey : undefined;
    } catch {
      actorPersonKey = undefined;
    }
    return {
      id: row.Id,
      auditKey: row.AuditKey,
      eventType: row.EventType as QuarterReviewAuditEventType,
      subjectKey: row.SubjectKey,
      performanceYear: row.PerformanceYear,
      quarter: row.Quarter,
      actorPersonKey,
      actorEmail: row.ActorEmail,
      actorRole: row.ActorRole as IQuarterReviewAuditEvent['actorRole'],
      eventAt: row.EventAt,
      reason: row.Reason || undefined,
      beforeJson: row.BeforeJSON || undefined,
      afterJson: row.AfterJSON || undefined,
      correlationKey: row.CorrelationKey,
      source: row.Source,
      sourceReference: row.SourceReference || undefined,
      success: row.Success
    };
  }

  private assertAuthenticatedPerson(person: IProductionPerson): void {
    if (!person.active || person.email.trim().toLowerCase() !== this.authenticatedEmail.trim().toLowerCase()) {
      throw new Error('The requested action is not authorised for the signed-in SharePoint user.');
    }
  }

  private assertBehaviourObjectiveAdmin(actor: IProductionPerson): void {
    this.assertAuthenticatedPerson(actor);
    if (!isKpiDataQualityAdmin(actor.appRoles)) {
      throw new Error('Only a Senior Manager Admin or SystemAdmin may maintain the Behaviour objective library.');
    }
  }

  private validateBehaviourObjective(item: IBehaviourObjectiveLibraryRecord): void {
    const errors = validateBehaviourObjectiveLibraryRecord(item);
    if (errors.length > 0) throw new Error(errors[0]);
  }

  private assertAuthenticatedWorkplan(workplan: IAnnualWorkplan): void {
    if (workplan.employeeEmail.trim().toLowerCase() !== this.authenticatedEmail.trim().toLowerCase()) {
      throw new Error('Another employee Workplan cannot be changed through the employee route.');
    }
  }

  private async resolveCurrentEditableWorkplan(
    loaded: IAnnualWorkplan,
    area: AnnualWorkplanWriteArea
  ): Promise<IAnnualWorkplan> {
    this.assertAuthenticatedWorkplan(loaded);
    this.assertEditable(loaded);
    const rows = await this.getWorkplansByKey(loaded.workplanKey);
    if (rows.length !== 1) throw new Error(`${area} write rejected because the Annual Workplan could not be uniquely resolved.`);
    const current = this.mapWorkplan(rows[0]);
    this.assertAuthenticatedWorkplan(current);
    assertCurrentEditableWorkplanSnapshot(loaded, current, area);
    return current;
  }

  private assertEditable(workplan: IAnnualWorkplan): void {
    if ((workplan.state !== 'Draft' && workplan.state !== 'ChangesRequested') || workplan.accessState !== 'EmployeeEdit' || workplan.transitionStatus !== 'Ready') {
      throw new Error('This Workplan is not currently editable. Reload the page or contact the KPI system owner.');
    }
  }

  private formatTarget(value: number | undefined, text: string | undefined): string | undefined {
    if (typeof value === 'number') return String(value);
    return text || undefined;
  }

  private getCatalogueQuarterTarget(kpi: ICoreKpiCatalogueItem, quarter: QuarterKey): { value?: number; text?: string } {
    if (quarter === 'Q1') return { value: kpi.q1TargetValue, text: kpi.q1TargetText };
    if (quarter === 'Q2') return { value: kpi.q2TargetValue, text: kpi.q2TargetText };
    if (quarter === 'Q3') return { value: kpi.q3TargetValue, text: kpi.q3TargetText };
    return { value: kpi.q4TargetValue, text: kpi.q4TargetText };
  }

  private getBehaviourQuarterTarget(item: IBehaviourWorkplanItem, quarter: QuarterKey): string | undefined {
    if (quarter === 'Q1') return item.q1TargetText;
    if (quarter === 'Q2') return item.q2TargetText;
    if (quarter === 'Q3') return item.q3TargetText;
    return item.q4TargetText;
  }

  private getBehaviourQuarterTargetRating(item: IBehaviourWorkplanItem, quarter: QuarterKey): BehaviourRating | undefined {
    if (quarter === 'Q1') return item.q1TargetRating || item.targetRating;
    if (quarter === 'Q2') return item.q2TargetRating || item.targetRating;
    if (quarter === 'Q3') return item.q3TargetRating || item.targetRating;
    return item.q4TargetRating || item.targetRating;
  }

  private assertQuarterlyMigrationSite(): void {
    const actual = this.webAbsoluteUrl.replace(/\/$/, '').toLowerCase();
    const approved = 'https://example.invalid/sites/REVIEW-TEST-SITE';
    if (actual !== approved) throw new Error('Quarterly schema migration is restricted to the approved REVIEW-TEST-SITE site.');
  }

  private async getJson<T>(url: string, fallbackMessage: string): Promise<T> {
    const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    await this.ensureSuccess(response, fallbackMessage);
    return await response.json() as T;
  }

  private async postJson(url: string, body: object, fallbackMessage: string): Promise<void> {
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' },
      body: JSON.stringify(body)
    });
    await this.ensureSuccess(response, fallbackMessage);
  }

  private async mergeJson(url: string, body: object, etag: string, fallbackMessage: string): Promise<void> {
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': etag,
        'X-HTTP-Method': 'MERGE'
      },
      body: JSON.stringify(body)
    });
    if (response.status === 412) throw new Error('This Draft changed after it was loaded. Reload before saving again.');
    await this.ensureSuccess(response, fallbackMessage);
  }

  private async getItems<T>(
    listTitle: string,
    select: string,
    filter: string,
    orderBy: string,
    top: number,
    expand?: string
  ): Promise<T[]> {
    assertProductionQueryFields(listTitle, select, filter, orderBy);
    const expandQuery = expand ? `&$expand=${encodeURIComponent(expand)}` : '';
    const url = `${this.listItemsUrl(listTitle)}?$select=${select}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent(orderBy)}&$top=${top}${expandQuery}`;
    const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    await this.ensureSuccess(response, `Production data could not load from ${listTitle}.`);
    const data = await response.json() as IODataCollection<T>;
    return data.value;
  }

  private listItemsUrl(listTitle: string): string {
    return `${this.webAbsoluteUrl}/_api/web/lists/getbytitle('${this.escapeOData(listTitle)}')/items`;
  }

  private listItemUrl(listTitle: string, id: number): string {
    return `${this.listItemsUrl(listTitle)}(${id})`;
  }

  private escapeOData(value: string): string {
    return value.replace(/'/g, "''");
  }

  private async ensureSuccess(response: SPHttpClientResponse, fallbackMessage: string): Promise<void> {
    if (!response.ok) throw new Error(`${fallbackMessage} Please try again or contact the KPI system owner.`);
  }
}
