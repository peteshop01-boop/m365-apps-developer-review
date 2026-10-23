import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import type {
  EmployeeContributionMethodV2,
  IEmployeeBehaviourCommitmentInputV2,
  IEmployeeCoreContributionInputV2,
  IEmployeeCoreContributionReadbackV2,
  IEmployeeCoreWeightingInputV2,
  IEmployeeEvidenceRegistrationInputV2,
  IEmployeePersonalItemInputV2,
  IEmployeeQuarterReadbackV2,
  IEmployeeQuarterUpdateInputV2,
  IEmployeeV2CommandReceipt,
  IEmployeeV2ItemCommandContext,
  IEmployeeV2PersistenceResult,
  IEmployeeV2QuarterCommandContext,
  IEmployeeV2WorkplanCommandContext,
  IEmployeeWorkplanAuditReadbackV2,
  IEmployeeWorkplanDraftInputV2,
  IEmployeeWorkplanHeaderReadbackV2,
  IEmployeeWorkplanReadbackV2
} from '../models/EmployeeWorkplanV2PersistenceModels';
import type {
  IAnnualWorkplan,
  IBehaviourWorkplanItem,
  IPersonalWorkplanItem,
  IProductionPerson
} from '../models/ProductionModels';
import type {
  BehaviourAssessment,
  IQuarterEvidenceReference,
  IQuarterReview,
  IQuarterReviewAuditEvent,
  IQuarterReviewItem,
  QuarterKey,
  QuarterReviewAuditEventType,
  RecoveryRoute,
  RecoveryStatus,
  ReforecastApprovalStatus
} from '../models/QuarterlyModels';
import type { BehaviourObjectiveSource, BehaviourRating } from '../models/BehaviourWorkplanModels';
import type {
  BehaviourV2Cadence,
  BehaviourV2Period,
  BehaviourV2RoleTier,
  BehaviourV2ValueId,
  IBehaviourAnnualSnapshotV2,
  IBehaviourV2RatingOption
} from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION } from '../models/BehaviourFrameworkV2Models';
import { decodeBehaviourSelectionSnapshotsV2 } from './BehaviourSelectionSnapshotsV2';
import { materialiseQuarterBehaviourTarget, ownSnapshotValue, QUARTER_BEHAVIOUR_TARGET_FIELDS } from './QuarterBehaviourTargetSnapshot';
import type {
  IEmployeeV2CreateWorkplanCommandContext,
  IEmployeeWorkplanV2PersistenceService
} from './IEmployeeWorkplanV2PersistenceService';
import EmployeeWorkplanV2CommandTransport, {
  type IEmployeeV2AnnualCommandRequest,
  type IEmployeeV2CommandRequest
} from './EmployeeWorkplanV2CommandTransport';
import {
  DISABLED_EMPLOYEE_WORKPLAN_C2B_GATEWAY,
  type IEmployeeV2C2bAnnualCommandRequest,
  type IEmployeeWorkplanV2C2bCommandGateway
} from './EmployeeWorkplanV2C2bCommandGateway';
import {
  assertEmployeeV2BindingsForRuntime,
  EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS,
  type IEmployeeWorkplanV2ListBindings
} from './EmployeeWorkplanV2ListBindings';
import {
  assertEmployeeV2CommandContext,
  validateEmployeeCoreContributionInputV2,
  validateEmployeeCoreWeightingInputV2,
  validateEmployeeBehaviourCommitmentInputV2,
  validateEmployeeEvidenceRegistrationInputV2,
  validateEmployeePersonalItemInputV2,
  validateEmployeeQuarterUpdateInputV2,
  validateEmployeeWorkplanDraftInputV2
} from './EmployeeWorkplanV2PersistencePolicy';
import {
  BEHAVIOUR_V2_RATING_OPTIONS,
  behaviourV2Periods,
  isBehaviourV2RoleTier,
  isBehaviourV2ValueId,
  readBehaviourPlanningLevelsV1
} from './BehaviourFrameworkV2Policy';

interface IODataCollection<T> { value: T[]; }
interface IODataRow { '@odata.etag'?: string; }

interface IWorkplanRowV2 extends IODataRow {
  Id: number; WorkplanKey: string; PersonKey: string; EmployeeDisplayName: string; EmployeeEmail: string;
  PerformanceYear: number; ManagerPersonKey?: string; ManagerDisplayName?: string; ManagerEmail?: string;
  State: IAnnualWorkplan['state']; AccessState: string; TransitionStatus: string; TransitionCorrelationKey?: string;
  CoreCategoryWeight: number; PersonalCategoryWeight: number; BehaviourCategoryWeight: number;
  CategoryWeightingReason?: string; CoreWeightingMode?: IEmployeeWorkplanHeaderReadbackV2['coreWeightingMode'];
  WorkplanVersion: number; SubmittedAt?: string; SubmittedByEmail?: string; ManagerDecisionComment?: string;
  ApprovedAt?: string; ApprovedByEmail?: string; LockedAt?: string; LockedByEmail?: string; RowVersionToken: number;
}

interface IWorkplanItemRowV2 extends IODataRow {
  Id: number; WorkplanItemKey: string; WorkplanItemNaturalKey: string; WorkplanKey: string; PersonKey: string;
  PerformanceYear: number; ItemType: 'CoreGold' | 'LocalPersonal' | 'Behaviour'; DisplayOrder: number;
  KPIID?: string; KPIVersionKey?: string; TargetVersionKey?: string; EmployeeKpiRole?: IEmployeeCoreContributionReadbackV2['employeeKpiRole'];
  ContributionMethod?: EmployeeContributionMethodV2; UnitLabel?: string; WorkplanVersion?: number;
  YearEndTargetValue?: number; YearEndTargetText?: string; Q1TargetValue?: number; Q1TargetText?: string;
  Q2TargetValue?: number; Q2TargetText?: string; Q3TargetValue?: number; Q3TargetText?: string;
  Q4TargetValue?: number; Q4TargetText?: string; Q1SuccessDefinition?: string; Q2SuccessDefinition?: string;
  Q3SuccessDefinition?: string; Q4SuccessDefinition?: string; ContributionWeight?: number; CoreWorkplanWeight?: number;
  SharedTargetRule?: IEmployeeCoreContributionReadbackV2['sharedTargetRule']; SharedApportionmentPercent?: number;
  ContributionGovernanceReference?: string; DenominatorNumerator?: number; DenominatorValue?: number;
  DenominatorUnit?: string; DenominatorRuleReference?: string; DenominatorSourceReference?: string;
  DirectContributionEligible?: boolean; ContributionApprovalState?: IEmployeeCoreContributionReadbackV2['contributionApprovalState'];
  AdditiveApproved?: boolean; NonOverlapRequired?: boolean; NonOverlapApproved?: boolean;
  ContributionEffectiveFrom?: string; ContributionEffectiveTo?: string; ContributionApprovalReference?: string;
  ContributionApprovedAt?: string; ContributionAuditReference?: string;
  LocalKPIWording?: string; LocalKPIDescription?: string; LocalMeasure?: string;
  LocalMetricType?: IPersonalWorkplanItem['measureType']; LocalScoringDirection?: IPersonalWorkplanItem['scoringDirection'];
  LocalPercentageScale?: IPersonalWorkplanItem['percentageSourceScale']; LocalBaselineValue?: number;
  PersonalItemWeight?: number; BehaviourID?: string; BehaviourVersionKey?: string;
  BehaviourObjectiveSource?: BehaviourObjectiveSource; BehaviourObjectiveKey?: string; BehaviourObjectiveTitle?: string;
  BehaviourObjectiveDescription?: string; BehaviourMeasure?: string; BehaviourEvidenceDefinition?: string;
  BehaviourSelectedSuggestionKeysJ?: string; BehaviourCustomObjective?: string;
  Q1BehaviourTargetRating?: BehaviourRating; Q2BehaviourTargetRating?: BehaviourRating;
  Q3BehaviourTargetRating?: BehaviourRating; Q4BehaviourTargetRating?: BehaviourRating;
  BehaviourItemWeight?: number; ActiveInWorkplan: boolean;
  BehaviourFrameworkVersion?: string; BehaviourValueTitleSnapshot?: string;
  BehaviourCorporateValueSnapshot?: string; BehaviourRoleTierSnapshot?: BehaviourV2RoleTier;
  BehaviourDescriptorSnapshot?: string; BehaviourCadenceSnapshot?: BehaviourV2Cadence;
  BehaviourPeriodKeysSnapshotJSON?: string; BehaviourRatingLabelsSnapshotJSON?: string;
  BehaviourCommitmentV2?: string; BehaviourPeriodCommitmentsV2JSON?: string;
  BehaviourPlanningContractVersion?: string; BehaviourCurrentLevelV2?: string;
  BehaviourTargetLevelV2?: string; BehaviourTargetLevelReasonV2?: string;
  BehaviourV2SelectedSuggestionKeysJSON?: string;
  BehaviourV2SelectionSnapshotsJSON?: string;
  BehaviourV2SelectionSnapshotsSHA256?: string;
  BehaviourV2SelectionSnapshotsUtf8ByteLength?: number;
  AddedByEmail: string; AddedAt: string;
}

interface IQuarterReviewRowV2 extends IODataRow {
  Id: number; QuarterReviewKey: string; WorkplanKey: string; PersonKey: string; EmployeeDisplayName: string;
  EmployeeEmail: string; PerformanceYear: number; Quarter: QuarterKey; ManagerPersonKey: string;
  ManagerDisplayName: string; ManagerEmail: string; CoreCategoryWeightSnapshot?: number;
  PersonalCategoryWeightSnapshot?: number; BehaviourCategoryWeightSnapshot?: number;
  WorkplanApprovalCorrelationKey?: string; State: IQuarterReview['state']; AccessState: IQuarterReview['accessState'];
  TransitionStatus: IQuarterReview['transitionStatus']; TransitionCorrelationKey?: string;
  EmployeeSubmissionComment?: string; SubmittedAt?: string; SubmittedByEmail?: string; ManagerDecisionComment?: string;
  ApprovedAt?: string; ApprovedByEmail?: string; LockedAt?: string; LockedByEmail?: string; RowVersionToken: number;
  BehaviourFrameworkVersionSnapshot?: string; BehaviourRoleTierSnapshot?: BehaviourV2RoleTier;
  BehaviourCadenceSnapshot?: BehaviourV2Cadence;
}

interface IQuarterItemRowV2 extends IODataRow {
  Id: number; QuarterReviewItemKey: string; QuarterReviewKey: string; WorkplanItemKey: string; WorkplanKey: string;
  PersonKey: string; PerformanceYear: number; Quarter: QuarterKey; ItemType: IQuarterReviewItem['itemType'];
  KPIID?: string; KPIVersionKey?: string; TargetVersionKey?: string; ItemWordingSnapshot: string;
  ItemDescriptionSnapshot?: string; MeasureSnapshot?: string; PillarSnapshot?: string; WorkstreamSnapshot?: string;
  OwnerEmailSnapshot?: string; UnitLabelSnapshot?: string; MetricTypeSnapshot?: string; ScoringDirectionSnapshot?: string;
  PercentageScaleSnapshot?: 'Fraction' | 'Whole'; BaselineValueSnapshot?: number; YearEndTargetValueSnapshot?: number;
  YearEndTargetTextSnapshot?: string; QuarterTargetValue?: number; QuarterTargetText?: string;
  EmployeeActualValue?: number; EmployeeActualText?: string; ProgressPct?: number; CalculatedRAG?: IQuarterReviewItem['calculatedRag'];
  CalculationRuleVersion?: string; StatusUpdate?: string; ContextMitigation?: string; EvidenceCount: number;
  QuarterEndForecastValue?: number; QuarterEndForecastText?: string; ManagerComment?: string;
  ManagerOverrideRAG?: IQuarterReviewItem['calculatedRag']; OverrideReason?: string; OverrideByEmail?: string;
  OverrideAt?: string; FinalRAG?: IQuarterReviewItem['calculatedRag']; ContributionWeightSnapshot?: number;
  WorkplanItemWeightSnapshot?: number; ManagerApproved: boolean; Locked: boolean; BTGRoute?: RecoveryRoute;
  BTGAction?: string; BTGOwnerPersonKey?: string; BTGDueDate?: string; NextReviewDate?: string; BTGStatus?: RecoveryStatus;
  BTGExpectedReturnToGreenDate?: string; BTGExpectedReducedOutcome?: string; ReforecastProposedTarget?: string;
  ReforecastProposedDate?: string; ReforecastReason?: string; ReforecastApprovalStatus?: ReforecastApprovalStatus;
  EscalationDependency?: string; EscalatedTo?: string; EscalationTargetDecisionDate?: string; BehaviourExamples?: string;
  ManagerBehaviourAssessment?: BehaviourAssessment; BehaviourIDSnapshot?: string; BehaviourVersionKeySnapshot?: string;
  BehaviourTitleSnapshot?: string; BehaviourDescriptionSnapshot?: string; BehaviourGuidanceSnapshot?: string;
  BehaviourObjectiveKeySnapshot?: string; BehaviourObjectiveSourceSnapshot?: BehaviourObjectiveSource;
  BehaviourObjectiveTitleSnapshot?: string; BehaviourEvidenceDefSnapshot?: string; BehaviourTargetRating?: BehaviourRating;
  EmployeeBehaviourRating?: BehaviourRating; ManagerBehaviourRating?: BehaviourRating; FinalBehaviourRating?: BehaviourRating;
  BehaviourFrameworkVersionSnapshot?: string; BehaviourValueTitleSnapshot?: string;
  BehaviourCorporateValueSnapshot?: string; BehaviourRoleTierSnapshot?: BehaviourV2RoleTier;
  BehaviourDescriptorSnapshot?: string; BehaviourCadenceSnapshot?: BehaviourV2Cadence;
  BehaviourPeriodKeysSnapshotJSON?: string; BehaviourPeriodSnapshot?: string;
  BehaviourRatingLabelsSnapshotJSON?: string; EmployeeBehaviourEvidenceV2?: string;
  EmployeeBehaviourAssessmentV2?: 1 | 2 | 3; ManagerBehaviourEvidenceV2?: string;
  ManagerBehaviourAssessmentV2?: 1 | 2 | 3; FinalBehaviourEvidenceV2?: string;
  FinalBehaviourAssessmentV2?: 1 | 2 | 3;
  BehaviourAnnualTargetLevelV2?: IQuarterReviewItem['behaviourAnnualTargetLevelV2'] | null;
  BehaviourAnnualTargetJustificationV2?: string | null;
  BehaviourAnnualTargetSourceWorkplanItemKeyV2?: string | null;
  BehaviourAnnualTargetSourceEtagV2?: string | null;
  BehaviourAnnualTargetSourceWorkplanVersionV2?: number | null;
  BehaviourAnnualTargetSourceApprovalKeyV2?: string | null;
}

interface IEvidenceRowV2 {
  EvidenceKey: string; PersonKey: string; WorkplanKey: string; WorkplanItemKey: string;
  QuarterReviewKey: string; QuarterReviewItemKey: string; PerformanceYear: number; Quarter: QuarterKey;
  KPIID?: string; EvidenceStatus: IQuarterEvidenceReference['status']; EvidenceDescription: string; FileRef?: string;
}

interface IAuditRowV2 {
  Id: number; AuditKey: string; EventType: string; SubjectKey: string; PerformanceYear: number; Quarter?: QuarterKey;
  ActorEmail: string; ActorRole: string; EventAt: string; Reason?: string; BeforeJSON?: string; AfterJSON?: string;
  CorrelationKey: string; Source: string; SourceReference?: string; Success: boolean;
}

const WORKPLAN_SELECT = [
  'Id', 'WorkplanKey', 'PersonKey', 'EmployeeDisplayName', 'EmployeeEmail', 'PerformanceYear',
  'ManagerPersonKey', 'ManagerDisplayName', 'ManagerEmail', 'State', 'AccessState',
  'TransitionStatus', 'TransitionCorrelationKey', 'CoreCategoryWeight', 'PersonalCategoryWeight',
  'BehaviourCategoryWeight', 'CategoryWeightingReason', 'CoreWeightingMode', 'WorkplanVersion',
  'SubmittedAt', 'SubmittedByEmail', 'ManagerDecisionComment', 'ApprovedAt', 'ApprovedByEmail',
  'LockedAt', 'LockedByEmail', 'RowVersionToken'
].join(',');

const WORKPLAN_ITEM_SELECT = [
  'Id', 'WorkplanItemKey', 'WorkplanItemNaturalKey', 'WorkplanKey', 'PersonKey', 'PerformanceYear',
  'ItemType', 'DisplayOrder', 'KPIID', 'KPIVersionKey', 'TargetVersionKey', 'EmployeeKpiRole',
  'ContributionMethod', 'UnitLabel', 'WorkplanVersion', 'YearEndTargetValue', 'YearEndTargetText',
  'Q1TargetValue', 'Q1TargetText', 'Q2TargetValue', 'Q2TargetText', 'Q3TargetValue', 'Q3TargetText',
  'Q4TargetValue', 'Q4TargetText', 'Q1SuccessDefinition', 'Q2SuccessDefinition', 'Q3SuccessDefinition',
  'Q4SuccessDefinition', 'ContributionWeight', 'CoreWorkplanWeight', 'SharedTargetRule', 'SharedApportionmentPercent',
  'ContributionGovernanceReference', 'DenominatorNumerator', 'DenominatorValue', 'DenominatorUnit',
  'DenominatorRuleReference', 'DenominatorSourceReference', 'DirectContributionEligible', 'ContributionApprovalState',
  'AdditiveApproved', 'NonOverlapRequired', 'NonOverlapApproved', 'ContributionEffectiveFrom',
  'ContributionEffectiveTo', 'ContributionApprovalReference', 'ContributionApprovedAt', 'ContributionAuditReference',
  'LocalKPIWording', 'LocalKPIDescription', 'LocalMeasure', 'LocalMetricType', 'LocalScoringDirection',
  'LocalPercentageScale', 'LocalBaselineValue', 'PersonalItemWeight', 'BehaviourID', 'BehaviourVersionKey',
  'BehaviourObjectiveSource', 'BehaviourObjectiveKey', 'BehaviourObjectiveTitle', 'BehaviourObjectiveDescription',
  'BehaviourMeasure', 'BehaviourEvidenceDefinition', 'Q1BehaviourTargetRating', 'Q2BehaviourTargetRating',
  'Q3BehaviourTargetRating', 'Q4BehaviourTargetRating', 'BehaviourItemWeight', 'ActiveInWorkplan',
  'AddedByEmail', 'AddedAt'
].join(',');
const TEST_WORKPLAN_ITEM_SELECT = `${WORKPLAN_ITEM_SELECT},BehaviourSelectedSuggestionKeysJ,BehaviourCustomObjective`;
const BEHAVIOUR_V2_WORKPLAN_ITEM_SELECT = `${TEST_WORKPLAN_ITEM_SELECT},BehaviourFrameworkVersion,BehaviourValueTitleSnapshot,BehaviourCorporateValueSnapshot,BehaviourRoleTierSnapshot,BehaviourDescriptorSnapshot,BehaviourCadenceSnapshot,BehaviourPeriodKeysSnapshotJSON,BehaviourRatingLabelsSnapshotJSON,BehaviourCommitmentV2,BehaviourPeriodCommitmentsV2JSON,BehaviourV2SelectedSuggestionKeysJSON,BehaviourPlanningContractVersion,BehaviourCurrentLevelV2,BehaviourTargetLevelV2,BehaviourTargetLevelReasonV2`;
const BEHAVIOUR_V2_SELECTION_WORKPLAN_ITEM_SELECT = `${BEHAVIOUR_V2_WORKPLAN_ITEM_SELECT},BehaviourV2SelectionSnapshotsJSON,BehaviourV2SelectionSnapshotsSHA256,BehaviourV2SelectionSnapshotsUtf8ByteLength`;

const QUARTER_REVIEW_SELECT = [
  'Id', 'QuarterReviewKey', 'WorkplanKey', 'PersonKey', 'EmployeeDisplayName', 'EmployeeEmail', 'PerformanceYear',
  'Quarter', 'ManagerPersonKey', 'ManagerDisplayName', 'ManagerEmail', 'CoreCategoryWeightSnapshot',
  'PersonalCategoryWeightSnapshot', 'BehaviourCategoryWeightSnapshot', 'WorkplanApprovalCorrelationKey', 'State',
  'AccessState', 'TransitionStatus', 'TransitionCorrelationKey', 'EmployeeSubmissionComment', 'SubmittedAt',
  'SubmittedByEmail', 'ManagerDecisionComment', 'ApprovedAt', 'ApprovedByEmail', 'LockedAt', 'LockedByEmail',
  'RowVersionToken'
].join(',');
const BEHAVIOUR_V2_QUARTER_REVIEW_SELECT = `${QUARTER_REVIEW_SELECT},BehaviourFrameworkVersionSnapshot,BehaviourRoleTierSnapshot,BehaviourCadenceSnapshot`;

const QUARTER_ITEM_SELECT = [
  'Id', 'QuarterReviewItemKey', 'QuarterReviewKey', 'WorkplanItemKey', 'WorkplanKey', 'PersonKey',
  'PerformanceYear', 'Quarter', 'ItemType', 'KPIID', 'KPIVersionKey', 'TargetVersionKey', 'ItemWordingSnapshot',
  'ItemDescriptionSnapshot', 'MeasureSnapshot', 'PillarSnapshot', 'WorkstreamSnapshot', 'OwnerEmailSnapshot',
  'UnitLabelSnapshot', 'MetricTypeSnapshot', 'ScoringDirectionSnapshot', 'PercentageScaleSnapshot',
  'BaselineValueSnapshot', 'YearEndTargetValueSnapshot', 'YearEndTargetTextSnapshot', 'QuarterTargetValue',
  'QuarterTargetText', 'EmployeeActualValue', 'EmployeeActualText', 'ProgressPct', 'CalculatedRAG',
  'CalculationRuleVersion', 'StatusUpdate', 'ContextMitigation', 'EvidenceCount', 'QuarterEndForecastValue',
  'QuarterEndForecastText', 'ManagerComment', 'ManagerOverrideRAG', 'OverrideReason', 'OverrideByEmail',
  'OverrideAt', 'FinalRAG', 'ContributionWeightSnapshot', 'WorkplanItemWeightSnapshot', 'ManagerApproved', 'Locked',
  'BTGRoute', 'BTGAction', 'BTGOwnerPersonKey', 'BTGDueDate', 'NextReviewDate', 'BTGStatus',
  'BTGExpectedReturnToGreenDate', 'BTGExpectedReducedOutcome', 'ReforecastProposedTarget',
  'ReforecastProposedDate', 'ReforecastReason', 'ReforecastApprovalStatus', 'EscalationDependency',
  'EscalatedTo', 'EscalationTargetDecisionDate', 'BehaviourExamples', 'ManagerBehaviourAssessment',
  'BehaviourIDSnapshot', 'BehaviourVersionKeySnapshot', 'BehaviourTitleSnapshot', 'BehaviourDescriptionSnapshot',
  'BehaviourGuidanceSnapshot', 'BehaviourObjectiveKeySnapshot', 'BehaviourObjectiveSourceSnapshot',
  'BehaviourObjectiveTitleSnapshot', 'BehaviourEvidenceDefSnapshot', 'BehaviourTargetRating',
  'EmployeeBehaviourRating', 'ManagerBehaviourRating', 'FinalBehaviourRating'
].join(',');
const BEHAVIOUR_V2_QUARTER_ITEM_SELECT = `${QUARTER_ITEM_SELECT},BehaviourFrameworkVersionSnapshot,BehaviourValueTitleSnapshot,BehaviourCorporateValueSnapshot,BehaviourRoleTierSnapshot,BehaviourDescriptorSnapshot,BehaviourCadenceSnapshot,BehaviourPeriodKeysSnapshotJSON,BehaviourPeriodSnapshot,BehaviourRatingLabelsSnapshotJSON,EmployeeBehaviourEvidenceV2,EmployeeBehaviourAssessmentV2,ManagerBehaviourEvidenceV2,ManagerBehaviourAssessmentV2,FinalBehaviourEvidenceV2,FinalBehaviourAssessmentV2,BehaviourAnnualTargetLevelV2,BehaviourAnnualTargetJustificationV2,BehaviourAnnualTargetSourceWorkplanItemKeyV2,BehaviourAnnualTargetSourceEtagV2,BehaviourAnnualTargetSourceWorkplanVersionV2,BehaviourAnnualTargetSourceApprovalKeyV2`;

const EVIDENCE_SELECT = 'EvidenceKey,PersonKey,WorkplanKey,WorkplanItemKey,QuarterReviewKey,QuarterReviewItemKey,PerformanceYear,Quarter,KPIID,EvidenceStatus,EvidenceDescription,FileRef';
const AUDIT_SELECT = 'Id,AuditKey,EventType,SubjectKey,PerformanceYear,Quarter,ActorEmail,ActorRole,EventAt,Reason,BeforeJSON,AfterJSON,CorrelationKey,Source,SourceReference,Success';

/** Shared full Core projection; validation remains at each caller boundary. */
export const projectEmployeeCoreContributionV2 = (input: IEmployeeCoreContributionInputV2): IEmployeeCoreContributionInputV2 => ({
      kpiId: input.kpiId, role: input.role, contributionMethod: input.contributionMethod,
      annualTargetValue: input.annualTargetValue, annualTargetText: input.annualTargetText,
      quarterTargets: input.quarterTargets.map(target => ({ quarter: target.quarter, targetValue: target.targetValue,
        targetText: target.targetText, commitment: target.commitment, successDefinition: target.successDefinition })),
      displayOrder: input.displayOrder, activeInWorkplan: input.activeInWorkplan,
      sharedTargetRule: input.sharedTargetRule, sharedApportionmentPercent: input.sharedApportionmentPercent,
      governanceReference: input.governanceReference, denominatorNumerator: input.denominatorNumerator,
      denominatorValue: input.denominatorValue, denominatorUnit: input.denominatorUnit,
      denominatorRuleReference: input.denominatorRuleReference,
      denominatorSourceReference: input.denominatorSourceReference
    });

export const projectEmployeeBehaviourCommitmentV2 = (
  input: IEmployeeBehaviourCommitmentInputV2
): IEmployeeBehaviourCommitmentInputV2 => ({
  behaviourId: input.behaviourId,
  selectedSuggestionKeys: [...input.selectedSuggestionKeys],
  ...(input.selections ? { selections: input.selections.map(row => ({ ...row })) } : {}),
  commitment: input.commitment,
  periodCommitments: input.periodCommitments.map(entry => ({ period: entry.period, commitment: entry.commitment })),
  ...(input.planningLevels ? { planningLevels: { ...input.planningLevels } } : {}),
  displayOrder: input.displayOrder,
  activeInWorkplan: input.activeInWorkplan
});

export default class SharePointEmployeeWorkplanV2PersistenceService implements IEmployeeWorkplanV2PersistenceService {
  private readonly transport: EmployeeWorkplanV2CommandTransport;
  private readonly listBindings: Readonly<IEmployeeWorkplanV2ListBindings>;
  private readonly workplanItemSelect: string;
  private readonly quarterReviewSelect: string;
  private readonly quarterItemSelect: string;

  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly authenticatedEmail: string,
    transport?: EmployeeWorkplanV2CommandTransport,
    listBindings: Readonly<IEmployeeWorkplanV2ListBindings> = EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS,
    private readonly c2bGateway: IEmployeeWorkplanV2C2bCommandGateway = DISABLED_EMPLOYEE_WORKPLAN_C2B_GATEWAY
  ) {
    assertEmployeeV2BindingsForRuntime(listBindings);
    this.listBindings = listBindings;
    this.workplanItemSelect = listBindings.supportsBehaviourV2SelectionSnapshots
      ? BEHAVIOUR_V2_SELECTION_WORKPLAN_ITEM_SELECT
      : listBindings.supportsBehaviourFrameworkV2Fields
      ? BEHAVIOUR_V2_WORKPLAN_ITEM_SELECT
      : listBindings.supportsBehaviourSelectionFields ? TEST_WORKPLAN_ITEM_SELECT : WORKPLAN_ITEM_SELECT;
    this.quarterReviewSelect = listBindings.supportsBehaviourFrameworkV2Fields
      ? BEHAVIOUR_V2_QUARTER_REVIEW_SELECT : QUARTER_REVIEW_SELECT;
    this.quarterItemSelect = listBindings.supportsBehaviourFrameworkV2Fields
      ? BEHAVIOUR_V2_QUARTER_ITEM_SELECT : QUARTER_ITEM_SELECT;
    this.transport = transport || new EmployeeWorkplanV2CommandTransport(
      spHttpClient, webAbsoluteUrl, authenticatedEmail, { listBindings }
    );
  }

  public async getEmployeeWorkplanV2(actor: IProductionPerson, performanceYear: number): Promise<IEmployeeWorkplanReadbackV2 | undefined> {
    const row = await this.getOwnEmployeeWorkplanRow(actor, performanceYear);
    if (!row) return undefined;
    if (row.State !== 'Draft' || row.TransitionStatus !== 'Ready') return this.getWorkplanByRow(row);
    this.assertEmployeeDraftIdentity(row, actor, performanceYear);
    return this.getEmptyEmployeeDraftOrRichReadback(row, actor, performanceYear);
  }

  private async getOwnEmployeeWorkplanRow(actor: IProductionPerson, performanceYear: number): Promise<IWorkplanRowV2 | undefined> {
    if (!actor.active || actor.email.trim().toLowerCase() !== this.authenticatedEmail.trim().toLowerCase()
      || actor.appRoles.indexOf('Employee') < 0) throw new Error('Employee V2 readback is restricted to the authenticated active Employee.');
    const rows = await this.getRows<IWorkplanRowV2>(this.listBindings.workplans, WORKPLAN_SELECT,
      `PersonKey eq '${this.escapeOData(actor.personKey)}' and PerformanceYear eq ${performanceYear}`, 'Id', 2);
    if (rows.length > 1) throw new Error('More than one canonical Workplan exists for this employee and performance year.');
    if (rows[0] && rows[0].EmployeeEmail.trim().toLowerCase() !== actor.email.trim().toLowerCase()) {
      throw new Error('The canonical Workplan subject does not match the authenticated Employee identity.');
    }
    return rows[0];
  }

  private assertEmployeeDraftIdentity(row: IWorkplanRowV2, actor: IProductionPerson, year: number): void {
    if (!Number.isSafeInteger(year) || year < 1000 || year > 9999
      || !actor.personKey.trim() || row.PersonKey !== actor.personKey || row.PerformanceYear !== year
      || row.WorkplanKey !== `${actor.personKey}|${year}`
      || typeof row.EmployeeEmail !== 'string'
      || row.EmployeeEmail.trim().toLowerCase() !== this.authenticatedEmail.trim().toLowerCase()) {
      throw new Error('The private Draft header does not match the authenticated employee and year.');
    }
  }

  private assertCompleteEmptyDraftHeader(row: IWorkplanRowV2, actor: IProductionPerson, year: number): void {
    this.assertEmployeeDraftIdentity(row, actor, year);
    const nonBlank = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;
    const specificEtag = typeof row['@odata.etag'] === 'string'
      && /^(?:W\/)?"[\x21\x23-\x7E\x80-\xFF]+"$/.test(row['@odata.etag']);
    if (!Number.isSafeInteger(row.Id) || row.Id <= 0 || !specificEtag
      || !Number.isSafeInteger(row.RowVersionToken) || row.RowVersionToken < 0
      || !Number.isSafeInteger(row.WorkplanVersion) || Number(row.WorkplanVersion) <= 0
      || !nonBlank(row.EmployeeDisplayName) || !nonBlank(row.AccessState)
      || ![row.CoreCategoryWeight, row.PersonalCategoryWeight, row.BehaviourCategoryWeight]
        .every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100)
      || (row.CoreWeightingMode !== 'Equal' && row.CoreWeightingMode !== 'Custom')
      || row.State !== 'Draft' || row.TransitionStatus !== 'Ready') {
      throw new Error('The empty private Draft requires complete actual header values.');
    }
  }

  /** This scoped reader retains response metadata; shared rich readers stay unchanged. */
  private async readDraftQualificationRows<T>(list: string, select: string, filter: string,
    orderBy: string, top: number): Promise<{ rows: T[]; continued: boolean }> {
    const url = `${this.listItemsUrl(list)}?$select=${select}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent(orderBy)}&$top=${top}`;
    const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    await this.ensureSuccess(response, 'The private Draft read qualification failed.');
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid private Draft collection.');
    const collection = body as Record<string, unknown>;
    if (!Array.isArray(collection.value) || collection.value.some(value => !value || typeof value !== 'object' || Array.isArray(value))) {
      throw new Error('Invalid private Draft collection rows.');
    }
    return { rows: collection.value as T[], continued: ['@odata.nextLink', 'odata.nextLink', '__next', 'd']
      .some(key => Object.prototype.hasOwnProperty.call(collection, key)) };
  }

  private async getEmptyEmployeeDraftOrRichReadback(row: IWorkplanRowV2, actor: IProductionPerson,
    year: number): Promise<IEmployeeWorkplanReadbackV2> {
    const observation = await this.readDraftQualificationRows<{ Id: number; WorkplanKey: string }>(
      this.listBindings.workplanItems, 'Id,WorkplanKey',
      `WorkplanKey eq '${this.escapeOData(row.WorkplanKey)}'`, 'Id', 1);
    if (observation.rows.length > 1 || observation.rows.some(item => !Number.isSafeInteger(item.Id)
      || item.Id <= 0 || item.WorkplanKey !== row.WorkplanKey)) {
      throw new Error('The normalised item observation is ambiguous or mismatched.');
    }
    // Any item (including historic/inactive/unknown) retains the existing full projection.
    if (observation.rows.length) return this.getWorkplanByRow(row);
    if (observation.continued) throw new Error('A continued response does not prove absence of normalised items.');
    this.assertCompleteEmptyDraftHeader(row, actor, year);
    const audits = await this.readDraftQualificationRows<IAuditRowV2>(this.listBindings.audit, AUDIT_SELECT,
      `SubjectKey eq '${this.escapeOData(row.WorkplanKey)}'`, 'EventAt', 500);
    if (audits.continued) throw new Error('The private Draft Audit read is incomplete.');
    const fresh = await this.readDraftQualificationRows<IWorkplanRowV2>(this.listBindings.workplans, WORKPLAN_SELECT,
      `PersonKey eq '${this.escapeOData(actor.personKey)}' and PerformanceYear eq ${year}`, 'Id', 2);
    if (fresh.continued || fresh.rows.length !== 1) throw new Error('The private Draft header reread is ambiguous.');
    this.assertCompleteEmptyDraftHeader(fresh.rows[0], actor, year);
    const fields = WORKPLAN_SELECT.split(',') as (keyof IWorkplanRowV2)[];
    if (row['@odata.etag'] !== fresh.rows[0]['@odata.etag']
      || fields.some(field => !Object.is(row[field], fresh.rows[0][field]))) {
      throw new Error('The private Draft header changed during the read qualification.');
    }
    return { workplan: this.mapWorkplan(fresh.rows[0]), coreItems: [], personalItems: [], behaviourItems: [],
      audits: audits.rows.map(item => this.mapWorkplanAudit(item)) };
  }

  public async createEmployeeWorkplanDraftV2(context: IEmployeeV2CreateWorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    const actorEmail = context.actor.email.trim().toLowerCase();
    const managerEmail = context.manager.email.trim().toLowerCase();
    if (!context.actor.active || context.actor.appRoles.indexOf('Employee') < 0
      || actorEmail !== this.authenticatedEmail.trim().toLowerCase()
      || !context.manager.active || context.manager.appRoles.indexOf('Manager') < 0
      || context.actor.managerPersonKey !== context.manager.personKey
      || context.actor.managerEmail?.trim().toLowerCase() !== managerEmail
      || !Number.isInteger(context.performanceYear) || context.performanceYear < 2000) {
      throw new Error('CreateWorkplanDraft requires the authenticated active Employee and exact active manager key-plus-email mapping.');
    }
    const workplanKey = `${context.actor.personKey}|${context.performanceYear}`;
    const command = await this.c2bGateway.executeCreateWorkplanDraft({
      route: 'Employee',
      commandKey: context.commandKey,
      commandType: 'CreateWorkplanDraft',
      subjectType: 'Workplan',
      subjectKey: workplanKey,
      personKey: context.actor.personKey,
      performanceYear: context.performanceYear,
      payload: {}
    });
    // Command readback retains the original rich path and its authenticated owner check.
    const createdRow = await this.getOwnEmployeeWorkplanRow(context.actor, context.performanceYear);
    const readback = createdRow ? await this.getWorkplanByRow(createdRow) : undefined;
    if (!readback || readback.workplan.workplanKey !== workplanKey || readback.workplan.personKey !== context.actor.personKey
      || readback.workplan.employeeEmail.trim().toLowerCase() !== actorEmail
      || readback.workplan.managerPersonKey !== context.manager.personKey
      || readback.workplan.managerEmail?.trim().toLowerCase() !== managerEmail
      || command.receipt.authenticatedActorEmail.trim().toLowerCase() !== actorEmail
      || readback.workplan.state !== 'Draft' || readback.workplan.transitionStatus !== 'Ready'
      || readback.workplan.rowVersionToken !== command.canonicalProof.rowVersionToken
      || readback.workplan.etag !== command.canonicalProof.etag
      || command.canonicalProof.workplanKey !== workplanKey
      || command.canonicalProof.auditKeys.some(key => !readback.audits.some(audit => audit.auditKey === key))) {
      throw new Error('CreateWorkplanDraft terminal receipt did not reconcile to stable canonical and audit readback.');
    }
    return { receipt: command.receipt, readback, duplicate: command.replayed };
  }

  public async saveEmployeeWorkplanDraftV2(context: IEmployeeV2WorkplanCommandContext, input: IEmployeeWorkplanDraftInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableAnnual(context.workplan);
    validateEmployeeWorkplanDraftInputV2(input);
    return this.mutateWorkplan(context, {
      route: 'Employee', commandKey: context.commandKey, commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan',
      subjectKey: context.workplan.workplanKey, personKey: context.workplan.personKey,
       performanceYear: context.workplan.performanceYear, expectedRowVersionToken: context.workplan.rowVersionToken,
       expectedHeaderETag: context.workplan.etag, payload: {
        coreCategoryWeight: input.coreCategoryWeight, personalCategoryWeight: input.personalCategoryWeight,
        behaviourCategoryWeight: input.behaviourCategoryWeight, categoryWeightReason: input.categoryWeightReason,
        zeroPersonalProposal: input.zeroPersonalProposal
      }
    });
  }

  public async upsertCoreContributionV2(context: IEmployeeV2ItemCommandContext, input: IEmployeeCoreContributionInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableAnnual(context.workplan);
    validateEmployeeCoreContributionInputV2(input);
    return this.mutateWorkplan(context, this.itemRequest(context, 'UpsertCoreContributionV2', projectEmployeeCoreContributionV2(input)));
  }

  public async upsertPersonalItemV2(context: IEmployeeV2ItemCommandContext, input: IEmployeePersonalItemInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableAnnual(context.workplan);
    validateEmployeePersonalItemInputV2(input);
    return this.mutateWorkplan(context, this.itemRequest(context, 'UpsertPersonalItemV2', {
      wording: input.wording, description: input.description, measure: input.measure, measureType: input.measureType,
      scoringDirection: input.scoringDirection, percentageSourceScale: input.percentageSourceScale,
      baselineValue: input.baselineValue, yearEndTargetValue: input.yearEndTargetValue,
      yearEndTargetText: input.yearEndTargetText, q1TargetValue: input.q1TargetValue, q1TargetText: input.q1TargetText,
      q2TargetValue: input.q2TargetValue, q2TargetText: input.q2TargetText, q3TargetValue: input.q3TargetValue,
      q3TargetText: input.q3TargetText, q4TargetValue: input.q4TargetValue, q4TargetText: input.q4TargetText,
      unitLabel: input.unitLabel, personalItemWeight: input.personalItemWeight,
      displayOrder: input.displayOrder, activeInWorkplan: input.activeInWorkplan
    }));
  }

  public async upsertBehaviourCommitmentV2(context: IEmployeeV2ItemCommandContext, input: IEmployeeBehaviourCommitmentInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableAnnual(context.workplan);
    validateEmployeeBehaviourCommitmentInputV2(input);
    return this.mutateWorkplan(context, this.itemRequest(context, 'UpsertBehaviourCommitmentV2',
      projectEmployeeBehaviourCommitmentV2(input)));
  }

  public async setCoreWeightingV2(context: IEmployeeV2WorkplanCommandContext, input: IEmployeeCoreWeightingInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableAnnual(context.workplan);
    validateEmployeeCoreWeightingInputV2(input);
    return this.mutateWorkplan(context, {
      route: 'Employee', commandKey: context.commandKey, commandType: 'SetCoreWeightingV2', subjectType: 'Workplan',
      subjectKey: context.workplan.workplanKey, personKey: context.workplan.personKey,
       performanceYear: context.workplan.performanceYear, expectedRowVersionToken: context.workplan.rowVersionToken,
       expectedHeaderETag: context.workplan.etag,
       payload: { mode: input.mode, customWeights: input.customWeights }
    });
  }

  public async submitEmployeeWorkplanV2(context: IEmployeeV2WorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableAnnual(context.workplan);
    const result = await this.mutateWorkplan(context, this.headerRequest(context, 'Employee', 'SubmitWorkplan', {}));
    if (result.readback.workplan.state !== 'Submitted') throw new Error('The accepted submit receipt did not read back a Submitted Workplan.');
    return result;
  }

  public async requestEmployeeWorkplanChangesV2(context: IEmployeeV2WorkplanCommandContext, reason: string): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Manager'); this.assertSubmittedAnnual(context.workplan);
    if (!reason.trim()) throw new Error('Request Changes requires a reason.');
    const result = await this.mutateWorkplan(context, this.headerRequest(context, 'Manager', 'RequestWorkplanChanges', { reason: reason.trim() }));
    if (result.readback.workplan.state !== 'ChangesRequested') throw new Error('The accepted Request Changes receipt did not read back Changes Requested.');
    return result;
  }

  public async createEmployeeWorkplanAmendmentV2(
    context: IEmployeeV2WorkplanCommandContext,
    reason: string,
    controlReference: string
  ): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'SystemAdmin');
    if (context.workplan.state !== 'Approved' && context.workplan.state !== 'Locked') throw new Error('Only approved history can be versioned for amendment.');
    if (!reason.trim()) throw new Error('A mandatory amendment reason is required.');
    if (!/^CONTROL-[A-Z0-9][A-Z0-9-]{4,}$/i.test(controlReference.trim())) {
      throw new Error('An exact CONTROL amendment/recovery reference is required.');
    }
    const result = await this.mutateWorkplan(context, this.headerRequest(context, 'Manager', 'CreateWorkplanAmendmentV2', {
      reason: reason.trim(),
      controlReference: controlReference.trim()
    }));
    if (result.readback.workplan.state !== 'ChangesRequested'
      || result.readback.workplan.workplanVersion < 2) throw new Error('The amendment did not read back as a new editable version with retained history.');
    return result;
  }

  public async approveAndLockEmployeeWorkplanV2(context: IEmployeeV2WorkplanCommandContext): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Manager'); this.assertSubmittedAnnual(context.workplan);
    const result = await this.mutateWorkplan(context, this.headerRequest(context, 'Manager', 'ApproveAndLockWorkplan', {}));
    if (result.readback.workplan.state !== 'Locked' || !result.readback.workplan.approvedAt
      || !result.readback.workplan.lockedAt) throw new Error('The accepted approval receipt did not read back an approved and locked Workplan.');
    return result;
  }

  public async getEmployeeQuarterV2(context: IEmployeeV2QuarterCommandContext): Promise<IEmployeeQuarterReadbackV2 | undefined> {
    this.assertEmployeeOwnedReadContext(context);
    const reviews = await this.getRows<IQuarterReviewRowV2>(this.listBindings.quarterReviews, this.quarterReviewSelect,
      `QuarterReviewKey eq '${this.escapeOData(context.review.quarterReviewKey)}'`, 'Id', 2);
    if (reviews.length > 1) throw new Error('More than one canonical Quarter Review exists for this key.');
    if (!reviews[0]) return undefined;
    this.assertQuarterBoundary(this.mapQuarterReview(reviews[0]), context);
    return this.getQuarterByRow(reviews[0]);
  }

  public async saveEmployeeQuarterUpdateV2(context: IEmployeeV2QuarterCommandContext, input: IEmployeeQuarterUpdateInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableQuarter(context);
    validateEmployeeQuarterUpdateInputV2(input);
    const item = context.item as IQuarterReviewItem;
    return this.mutateQuarter(context, {
      route: 'Employee', commandKey: context.commandKey, commandType: 'UpdateQuarterItemV2',
      subjectType: 'QuarterReviewItem', subjectKey: item.quarterReviewItemKey,
      personKey: context.workplan.personKey, performanceYear: context.workplan.performanceYear,
      quarter: context.review.quarter, expectedRowVersionToken: context.review.rowVersionToken,
      expectedETag: item.etag, payload: {
        employeeActualValue: input.employeeActualValue, employeeActualText: input.employeeActualText,
        employeeUpdate: input.employeeUpdate, contextMitigation: input.contextMitigation,
        forecastValue: input.forecastValue, forecastText: input.forecastText,
        employeeBehaviourRating: input.employeeBehaviourRating, behaviourExamples: input.behaviourExamples,
        employeeBehaviourEvidenceV2: input.employeeBehaviourEvidenceV2,
        employeeBehaviourAssessmentV2: input.employeeBehaviourAssessmentV2,
        recovery: input.recovery ? {
          route: input.recovery.route, action: input.recovery.action, ownerPersonKey: input.recovery.ownerPersonKey,
          dueDate: input.recovery.dueDate, nextReviewDate: input.recovery.nextReviewDate,
          expectedReturnToGreenDate: input.recovery.expectedReturnToGreenDate,
          expectedReducedOutcome: input.recovery.expectedReducedOutcome,
          proposedRevisedTarget: input.recovery.proposedRevisedTarget,
          proposedRevisedDate: input.recovery.proposedRevisedDate, reforecastReason: input.recovery.reforecastReason,
          dependencyOrDecision: input.recovery.dependencyOrDecision, escalatedTo: input.recovery.escalatedTo,
          targetDecisionDate: input.recovery.targetDecisionDate
        } : undefined
      }
    });
  }

  public async registerEmployeeQuarterEvidenceV2(context: IEmployeeV2QuarterCommandContext, input: IEmployeeEvidenceRegistrationInputV2): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableQuarter(context);
    validateEmployeeEvidenceRegistrationInputV2(input);
    const item = context.item as IQuarterReviewItem;
    return this.mutateQuarter(context, {
      route: 'Employee', commandKey: context.commandKey, commandType: 'RegisterEvidence', subjectType: 'Evidence',
      subjectKey: item.quarterReviewItemKey, personKey: context.workplan.personKey,
      performanceYear: context.workplan.performanceYear, quarter: context.review.quarter,
      expectedRowVersionToken: context.review.rowVersionToken, expectedETag: item.etag,
      payload: { fileUniqueId: input.fileUniqueId, description: input.description }
    });
  }

  public async submitEmployeeQuarterV2(context: IEmployeeV2QuarterCommandContext, comment?: string): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>> {
    assertEmployeeV2CommandContext(context, 'Employee'); this.assertEditableQuarter(context);
    const result = await this.mutateQuarter(context, {
      route: 'Employee', commandKey: context.commandKey, commandType: 'SubmitQuarterReview', subjectType: 'QuarterReview',
      subjectKey: context.review.quarterReviewKey, personKey: context.workplan.personKey,
      performanceYear: context.workplan.performanceYear, quarter: context.review.quarter,
      expectedRowVersionToken: context.review.rowVersionToken, expectedETag: context.review.etag,
      payload: { comment: comment?.trim() || undefined }
    });
    if (result.readback.review.state !== 'Submitted') throw new Error('The accepted quarterly submit receipt did not read back Submitted.');
    return result;
  }

  private async mutateWorkplan(context: IEmployeeV2WorkplanCommandContext,
    request: IEmployeeV2C2bAnnualCommandRequest): Promise<IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2>> {
    this.assertAuthenticatedActor(context.actor);
    const command = await this.c2bGateway.executeAnnualCommand(request);
    this.assertReceiptResultReference(command.receipt, request.subjectType === 'WorkplanItem'
      ? `${context.workplan.workplanKey}` : request.subjectKey);
    if (command.receipt.authenticatedActorPersonKey !== context.actor.personKey
      || command.receipt.authenticatedActorEmail.trim().toLowerCase() !== context.actor.email.trim().toLowerCase()) {
      throw new Error('The terminal annual receipt actor does not match the exact authenticated People identity.');
    }
    const readback = await this.getWorkplanByKey(context.workplan.workplanKey);
    if (!readback) throw new Error('The accepted Employee V2 command did not return its canonical Workplan readback.');
    if (readback.workplan.personKey !== context.workplan.personKey
      || readback.workplan.performanceYear !== context.workplan.performanceYear) {
      throw new Error('The canonical Workplan readback crossed the command subject boundary.');
    }
    if (readback.workplan.rowVersionToken !== command.canonicalProof.rowVersionToken
      || readback.workplan.etag !== command.canonicalProof.etag
      || command.canonicalProof.auditKeys.some(key => !readback.audits.some(audit => audit.auditKey === key))
      || request.subjectType === 'WorkplanItem' && ![...readback.coreItems, ...readback.personalItems, ...readback.behaviourItems]
        .some(item => item.workplanItemKey === request.subjectKey || item.naturalKey === request.subjectKey)) {
      throw new Error('The terminal annual receipt did not reconcile to exact canonical item/header and audit readback.');
    }
    return { receipt: command.receipt, readback, duplicate: command.replayed };
  }

  private async mutateQuarter(context: IEmployeeV2QuarterCommandContext, request: IEmployeeV2CommandRequest): Promise<IEmployeeV2PersistenceResult<IEmployeeQuarterReadbackV2>> {
    this.assertAuthenticatedActor(context.actor);
    const transportResult = await this.transport.execute(request);
    this.assertReceiptResultReference(transportResult.receipt, request.subjectKey);
    const readback = await this.getQuarterByKey(context.review.quarterReviewKey);
    if (!readback) throw new Error('The accepted Employee V2 command did not return its canonical Quarter Review readback.');
    this.assertQuarterBoundary(readback.review, context);
    if (readback.review.rowVersionToken <= context.review.rowVersionToken) {
      throw new Error('The accepted Employee V2 command did not advance the canonical Quarter Review version token.');
    }
    return { receipt: transportResult.receipt, readback, duplicate: transportResult.replayed };
  }

  private itemRequest(context: IEmployeeV2ItemCommandContext,
    commandType: 'UpsertCoreContributionV2' | 'UpsertPersonalItemV2' | 'UpsertBehaviourCommitmentV2',
    payload: object): IEmployeeV2C2bAnnualCommandRequest {
    if (!context.subjectKey.trim()) throw new Error('The stable Workplan Item subject key is required.');
    if (context.expectedItemEtag === '*') throw new Error('Wildcard item ETags are not accepted.');
    return {
      route: 'Employee', commandKey: context.commandKey, commandType, subjectType: 'WorkplanItem',
      subjectKey: context.subjectKey, personKey: context.workplan.personKey,
      performanceYear: context.workplan.performanceYear, expectedRowVersionToken: context.workplan.rowVersionToken,
      expectedHeaderETag: context.workplan.etag, expectedItemETag: context.expectedItemEtag, payload
    };
  }

  private headerRequest(context: IEmployeeV2WorkplanCommandContext, route: 'Employee' | 'Manager',
    commandType: 'UpdateWorkplanDraftV2' | 'SetCoreWeightingV2' | 'SubmitWorkplan'
      | 'RequestWorkplanChanges' | 'ApproveAndLockWorkplan' | 'CreateWorkplanAmendmentV2',
    payload: object): IEmployeeV2AnnualCommandRequest {
    return {
      route, commandKey: context.commandKey, commandType, subjectType: 'Workplan',
      subjectKey: context.workplan.workplanKey, personKey: context.workplan.personKey,
      performanceYear: context.workplan.performanceYear, expectedRowVersionToken: context.workplan.rowVersionToken,
      expectedHeaderETag: context.workplan.etag, payload
    };
  }

  private assertEditableAnnual(workplan: IAnnualWorkplan): void {
    if ((workplan.state !== 'Draft' && workplan.state !== 'ChangesRequested')
      || workplan.accessState !== 'EmployeeEdit' || workplan.transitionStatus !== 'Ready') {
      throw new Error('Employee V2 annual content is editable only in Draft or Changes Requested.');
    }
  }

  private assertSubmittedAnnual(workplan: IAnnualWorkplan): void {
    if (workplan.state !== 'Submitted' || workplan.accessState !== 'ManagerDecision' || workplan.transitionStatus !== 'Ready') {
      throw new Error('Manager Workplan action requires the current Submitted/Manager Decision version.');
    }
  }

  private assertEditableQuarter(context: IEmployeeV2QuarterCommandContext): void {
    if (!context.item) throw new Error('The exact Quarter Review Item is required.');
    if (context.workplan.state !== 'Approved' && context.workplan.state !== 'Locked') throw new Error('Quarterly updates require an approved Workplan.');
    if ((context.review.state !== 'Draft' && context.review.state !== 'ChangesRequested')
      || context.review.accessState !== 'EmployeeEdit' || context.review.transitionStatus !== 'Ready') {
      throw new Error('Quarterly employee content is editable only in the current Draft or Changes Requested review.');
    }
    if (context.item.locked || context.item.personKey !== context.workplan.personKey
      || context.item.quarterReviewKey !== context.review.quarterReviewKey) throw new Error('The Quarter Review Item is locked or outside the employee review boundary.');
  }

  private assertAuthenticatedActor(actor: IProductionPerson): void {
    if (!actor.active || actor.email.trim().toLowerCase() !== this.authenticatedEmail.trim().toLowerCase()) {
      throw new Error('The Employee V2 request is not authorised for the signed-in SharePoint user.');
    }
  }

  private assertEmployeeOwnedReadContext(context: IEmployeeV2QuarterCommandContext): void {
    this.assertAuthenticatedActor(context.actor);
    if (context.actor.appRoles.indexOf('Employee') < 0
      || context.actor.personKey !== context.workplan.personKey
      || context.actor.email.trim().toLowerCase() !== context.workplan.employeeEmail.trim().toLowerCase()) {
      throw new Error('Quarter readback is restricted to the authenticated Workplan Employee.');
    }
  }

  private assertQuarterBoundary(
    review: Pick<IQuarterReview, 'quarterReviewKey' | 'workplanKey' | 'personKey' | 'performanceYear' | 'quarter'>,
    context: IEmployeeV2QuarterCommandContext
  ): void {
    if (review.quarterReviewKey !== context.review.quarterReviewKey
      || review.workplanKey !== context.workplan.workplanKey
      || review.personKey !== context.workplan.personKey
      || review.performanceYear !== context.workplan.performanceYear
      || review.quarter !== context.review.quarter) {
      throw new Error('The canonical Quarter Review readback crossed the command subject boundary.');
    }
  }

  private assertReceiptResultReference(receipt: IEmployeeV2CommandReceipt, subjectKey: string): void {
    let parsed: unknown;
    try { parsed = JSON.parse(receipt.resultKeysJson); } catch { throw new Error('The accepted command receipt contains invalid canonical result JSON.'); }
    if (!this.containsExactString(parsed, subjectKey)) throw new Error('The accepted receipt does not reference the requested canonical subject.');
  }

  private containsExactString(value: unknown, expected: string): boolean {
    if (value === expected) return true;
    if (Array.isArray(value)) return value.some(item => this.containsExactString(item, expected));
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .some(key => this.containsExactString((value as Record<string, unknown>)[key], expected));
    }
    return false;
  }

  private async getWorkplanByKey(workplanKey: string): Promise<IEmployeeWorkplanReadbackV2 | undefined> {
    const rows = await this.getRows<IWorkplanRowV2>(this.listBindings.workplans, WORKPLAN_SELECT,
      `WorkplanKey eq '${this.escapeOData(workplanKey)}'`, 'Id', 2);
    if (rows.length > 1) throw new Error('More than one canonical Workplan exists for this key.');
    return rows[0] ? this.getWorkplanByRow(rows[0]) : undefined;
  }

  private async getWorkplanByRow(row: IWorkplanRowV2): Promise<IEmployeeWorkplanReadbackV2> {
    const [items, audits] = await Promise.all([
      this.getRows<IWorkplanItemRowV2>(this.listBindings.workplanItems, this.workplanItemSelect,
        `WorkplanKey eq '${this.escapeOData(row.WorkplanKey)}'`, 'DisplayOrder', 500),
      this.getRows<IAuditRowV2>(this.listBindings.audit, AUDIT_SELECT,
        `SubjectKey eq '${this.escapeOData(row.WorkplanKey)}'`, 'EventAt', 500)
    ]);
    const currentVersion = row.WorkplanVersion || 1;
    const currentItems = items.filter(item => (item.WorkplanVersion || 1) === currentVersion);
    return {
      workplan: this.mapWorkplan(row),
      coreItems: currentItems.filter(item => item.ItemType === 'CoreGold').map(item => this.mapCore(item)),
      personalItems: currentItems.filter(item => item.ItemType === 'LocalPersonal').map(item => this.mapPersonal(item)),
      behaviourItems: currentItems.filter(item => item.ItemType === 'Behaviour').map(item => this.mapBehaviour(item)),
      audits: audits.map(item => this.mapWorkplanAudit(item))
    };
  }

  private async getQuarterByKey(quarterReviewKey: string): Promise<IEmployeeQuarterReadbackV2 | undefined> {
    const rows = await this.getRows<IQuarterReviewRowV2>(this.listBindings.quarterReviews, this.quarterReviewSelect,
      `QuarterReviewKey eq '${this.escapeOData(quarterReviewKey)}'`, 'Id', 2);
    if (rows.length > 1) throw new Error('More than one canonical Quarter Review exists for this key.');
    return rows[0] ? this.getQuarterByRow(rows[0]) : undefined;
  }

  private async getQuarterByRow(row: IQuarterReviewRowV2): Promise<IEmployeeQuarterReadbackV2> {
    const [items, evidence, audits] = await Promise.all([
      this.getRows<IQuarterItemRowV2>(this.listBindings.quarterReviewItems, this.quarterItemSelect,
        `QuarterReviewKey eq '${this.escapeOData(row.QuarterReviewKey)}'`, 'QuarterReviewItemKey', 500),
      this.getRows<IEvidenceRowV2>(this.listBindings.evidence, EVIDENCE_SELECT,
        `QuarterReviewKey eq '${this.escapeOData(row.QuarterReviewKey)}'`, 'EvidenceKey', 500),
      this.getRows<IAuditRowV2>(this.listBindings.audit, AUDIT_SELECT,
        `SubjectKey eq '${this.escapeOData(row.QuarterReviewKey)}'`, 'EventAt', 500)
    ]);
    return { review: this.mapQuarterReview(row), items: items.map(item => this.mapQuarterItem(item)),
      evidence: evidence.map(item => this.mapEvidence(item)), audits: audits.map(item => this.mapQuarterAudit(item)) };
  }

  private mapWorkplan(row: IWorkplanRowV2): IEmployeeWorkplanHeaderReadbackV2 {
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', workplanKey: row.WorkplanKey,
      personKey: row.PersonKey, employeeDisplayName: row.EmployeeDisplayName, employeeEmail: row.EmployeeEmail,
      performanceYear: row.PerformanceYear, managerPersonKey: row.ManagerPersonKey || undefined,
      managerDisplayName: row.ManagerDisplayName || undefined, managerEmail: row.ManagerEmail || undefined,
      state: row.State, accessState: row.AccessState, transitionStatus: row.TransitionStatus,
      transitionCorrelationKey: row.TransitionCorrelationKey || undefined,
      coreCategoryWeight: row.CoreCategoryWeight, personalCategoryWeight: row.PersonalCategoryWeight,
      behaviourCategoryWeight: row.BehaviourCategoryWeight,
      categoryWeightReason: row.CategoryWeightingReason || undefined,
      submittedAt: row.SubmittedAt || undefined, submittedByEmail: row.SubmittedByEmail || undefined,
      managerDecisionComment: row.ManagerDecisionComment || undefined,
      approvedAt: row.ApprovedAt || undefined, approvedByEmail: row.ApprovedByEmail || undefined,
      lockedAt: row.LockedAt || undefined, lockedByEmail: row.LockedByEmail || undefined,
      rowVersionToken: row.RowVersionToken, workplanVersion: row.WorkplanVersion,
      coreWeightingMode: row.CoreWeightingMode
    };
  }

  private mapCore(row: IWorkplanItemRowV2): IEmployeeCoreContributionReadbackV2 {
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', workplanItemKey: row.WorkplanItemKey,
      naturalKey: row.WorkplanItemNaturalKey, workplanKey: row.WorkplanKey, personKey: row.PersonKey,
      performanceYear: row.PerformanceYear, kpiId: row.KPIID || '', kpiVersionKey: row.KPIVersionKey || '',
      targetVersionKey: row.TargetVersionKey || '', workplanVersion: row.WorkplanVersion || 1,
      employeeKpiRole: row.EmployeeKpiRole, contributionMethod: row.ContributionMethod,
      contributionUnit: row.UnitLabel || undefined, annualTargetValue: row.YearEndTargetValue,
      annualTargetText: row.YearEndTargetText || undefined,
      quarterTargets: [
        { quarter: 'Q1', targetValue: row.Q1TargetValue, targetText: row.Q1TargetText, commitment: row.Q1TargetText, successDefinition: row.Q1SuccessDefinition },
        { quarter: 'Q2', targetValue: row.Q2TargetValue, targetText: row.Q2TargetText, commitment: row.Q2TargetText, successDefinition: row.Q2SuccessDefinition },
        { quarter: 'Q3', targetValue: row.Q3TargetValue, targetText: row.Q3TargetText, commitment: row.Q3TargetText, successDefinition: row.Q3SuccessDefinition },
        { quarter: 'Q4', targetValue: row.Q4TargetValue, targetText: row.Q4TargetText, commitment: row.Q4TargetText, successDefinition: row.Q4SuccessDefinition }
      ],
      sharedTargetRule: row.SharedTargetRule, sharedApportionmentPercent: row.SharedApportionmentPercent,
      governanceReference: row.ContributionGovernanceReference || undefined,
      denominatorNumerator: row.DenominatorNumerator, denominatorValue: row.DenominatorValue,
      denominatorUnit: row.DenominatorUnit || undefined, denominatorRuleReference: row.DenominatorRuleReference || undefined,
      denominatorSourceReference: row.DenominatorSourceReference || undefined,
      coreWorkplanWeight: row.CoreWorkplanWeight, displayOrder: row.DisplayOrder,
      activeInWorkplan: row.ActiveInWorkplan, directContributionEligible: Boolean(row.DirectContributionEligible),
      contributionApprovalState: row.ContributionApprovalState, additiveApproved: Boolean(row.AdditiveApproved),
      nonOverlapRequired: Boolean(row.NonOverlapRequired), nonOverlapApproved: Boolean(row.NonOverlapApproved),
      effectiveFrom: row.ContributionEffectiveFrom || undefined, effectiveTo: row.ContributionEffectiveTo || undefined,
      approvalReference: row.ContributionApprovalReference || undefined, approvalAt: row.ContributionApprovedAt || undefined,
      auditReference: row.ContributionAuditReference || undefined
    };
  }

  private mapPersonal(row: IWorkplanItemRowV2): IPersonalWorkplanItem {
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', workplanItemKey: row.WorkplanItemKey,
      naturalKey: row.WorkplanItemNaturalKey, workplanKey: row.WorkplanKey, personKey: row.PersonKey,
      performanceYear: row.PerformanceYear, wording: row.LocalKPIWording || '', description: row.LocalKPIDescription,
      measure: row.LocalMeasure || '', measureType: row.LocalMetricType, scoringDirection: row.LocalScoringDirection,
      percentageSourceScale: row.LocalPercentageScale, baselineValue: row.LocalBaselineValue,
      yearEndTargetValue: row.YearEndTargetValue, yearEndTargetText: row.YearEndTargetText,
      q1TargetValue: row.Q1TargetValue, q1TargetText: row.Q1TargetText,
      q2TargetValue: row.Q2TargetValue, q2TargetText: row.Q2TargetText,
      q3TargetValue: row.Q3TargetValue, q3TargetText: row.Q3TargetText,
      q4TargetValue: row.Q4TargetValue, q4TargetText: row.Q4TargetText,
      unitLabel: row.UnitLabel || '', personalItemWeight: row.PersonalItemWeight,
      displayOrder: row.DisplayOrder, activeInWorkplan: row.ActiveInWorkplan
    };
  }

  private mapBehaviour(row: IWorkplanItemRowV2): IBehaviourWorkplanItem {
    const behaviourSnapshotV2 = this.parseBehaviourAnnualSnapshotV2(row);
    const planningLevels = readBehaviourPlanningLevelsV1(row as unknown as Record<string, unknown>);
    if (planningLevels && !behaviourSnapshotV2) throw new Error('Behaviour planning levels require a valid v02 annual snapshot.');
    const hasAnySelectionSnapshotField = [row.BehaviourV2SelectionSnapshotsJSON,
      row.BehaviourV2SelectionSnapshotsSHA256, row.BehaviourV2SelectionSnapshotsUtf8ByteLength]
      .some(value => value !== undefined && value !== null);
    const hasAllSelectionSnapshotFields = typeof row.BehaviourV2SelectionSnapshotsJSON === 'string'
      && typeof row.BehaviourV2SelectionSnapshotsSHA256 === 'string'
      && Number.isSafeInteger(row.BehaviourV2SelectionSnapshotsUtf8ByteLength);
    if (hasAnySelectionSnapshotField && (!hasAllSelectionSnapshotFields || !behaviourSnapshotV2)) {
      throw new Error('The stored Behaviour v02 selection snapshot fields are incomplete or crossed.');
    }
    const selectionSnapshots = hasAllSelectionSnapshotFields
      ? decodeBehaviourSelectionSnapshotsV2(row.BehaviourV2SelectionSnapshotsJSON!,
        row.BehaviourV2SelectionSnapshotsSHA256!, row.BehaviourV2SelectionSnapshotsUtf8ByteLength!)
      : undefined;
    if (selectionSnapshots && (selectionSnapshots.valueId !== row.BehaviourID
      || JSON.stringify(selectionSnapshots.selections.filter(item => item.source === 'Catalogue')
        .map(item => item.selectionKey)) !== JSON.stringify(this.parseBehaviourSelectedSuggestionKeys(
          row.BehaviourV2SelectedSuggestionKeysJSON, true)))) {
      throw new Error('The stored Behaviour v02 selection snapshot and catalogue keys are crossed.');
    }
    const periodCommitments = behaviourSnapshotV2
      ? this.parseBehaviourPeriodCommitmentsV2(row.BehaviourPeriodCommitmentsV2JSON,
        behaviourSnapshotV2.periodKeys as readonly string[])
      : undefined;
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', workplanItemKey: row.WorkplanItemKey,
      naturalKey: row.WorkplanItemNaturalKey, workplanKey: row.WorkplanKey, personKey: row.PersonKey,
      performanceYear: row.PerformanceYear, behaviourId: row.BehaviourID || '',
      behaviourVersionKey: row.BehaviourVersionKey || '', objectiveSource: row.BehaviourObjectiveSource,
      sourceObjectiveKey: row.BehaviourObjectiveKey, objectiveTitle: row.BehaviourObjectiveTitle,
      selectedSuggestionKeys: this.parseBehaviourSelectedSuggestionKeys(behaviourSnapshotV2
        ? row.BehaviourV2SelectedSuggestionKeysJSON : row.BehaviourSelectedSuggestionKeysJ, Boolean(behaviourSnapshotV2)),
      customObjective: row.BehaviourCustomObjective || undefined,
      objectiveDescription: row.BehaviourObjectiveDescription, measure: row.BehaviourMeasure,
      unit: row.UnitLabel, evidenceDefinition: row.BehaviourEvidenceDefinition,
      q1TargetText: row.Q1TargetText, q2TargetText: row.Q2TargetText,
      q3TargetText: row.Q3TargetText, q4TargetText: row.Q4TargetText,
      targetRating: row.Q1BehaviourTargetRating, q1TargetRating: row.Q1BehaviourTargetRating,
      q2TargetRating: row.Q2BehaviourTargetRating, q3TargetRating: row.Q3BehaviourTargetRating,
      q4TargetRating: row.Q4BehaviourTargetRating, behaviourItemWeight: row.BehaviourItemWeight,
      behaviourSnapshotV2, behaviourCommitmentV2: behaviourSnapshotV2 ? row.BehaviourCommitmentV2 : undefined,
      behaviourPlanningLevelsV1: planningLevels,
      behaviourPeriodCommitmentsV2: periodCommitments,
      behaviourSelectionSnapshotsV2: selectionSnapshots,
      behaviourSelectionSnapshotsSha256: hasAllSelectionSnapshotFields
        ? row.BehaviourV2SelectionSnapshotsSHA256 : undefined,
      behaviourSelectionSnapshotsUtf8ByteLength: hasAllSelectionSnapshotFields
        ? row.BehaviourV2SelectionSnapshotsUtf8ByteLength : undefined,
      displayOrder: row.DisplayOrder, activeInWorkplan: row.ActiveInWorkplan
    };
  }

  private parseBehaviourAnnualSnapshotV2(row: IWorkplanItemRowV2): Readonly<IBehaviourAnnualSnapshotV2> | undefined {
    const hasV2Field = [row.BehaviourFrameworkVersion, row.BehaviourValueTitleSnapshot,
      row.BehaviourCorporateValueSnapshot, row.BehaviourRoleTierSnapshot, row.BehaviourDescriptorSnapshot,
      row.BehaviourCadenceSnapshot, row.BehaviourPeriodKeysSnapshotJSON,
      row.BehaviourRatingLabelsSnapshotJSON, row.BehaviourCommitmentV2,
      row.BehaviourPeriodCommitmentsV2JSON, row.BehaviourV2SelectedSuggestionKeysJSON]
      .some(value => value !== undefined && value !== null);
    if (!hasV2Field) return undefined;
    let periods: unknown;
    let ratingOptions: unknown;
    try {
      periods = JSON.parse(row.BehaviourPeriodKeysSnapshotJSON || 'null') as unknown;
      ratingOptions = JSON.parse(row.BehaviourRatingLabelsSnapshotJSON || 'null') as unknown;
    } catch {
      throw new Error('The stored Behaviour v02 snapshot JSON is invalid.');
    }
    if (row.BehaviourFrameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || row.BehaviourVersionKey !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || !isBehaviourV2ValueId(row.BehaviourID) || !isBehaviourV2RoleTier(row.BehaviourRoleTierSnapshot)
      || (row.BehaviourCadenceSnapshot !== 'Quarterly' && row.BehaviourCadenceSnapshot !== 'TwiceYearly')
      || !row.BehaviourValueTitleSnapshot?.trim() || !row.BehaviourCorporateValueSnapshot?.trim()
      || !row.BehaviourDescriptorSnapshot?.trim() || !Array.isArray(periods)
      || JSON.stringify([...periods].sort()) !== JSON.stringify([...behaviourV2Periods(row.BehaviourCadenceSnapshot)].sort())
      || !Array.isArray(ratingOptions)
      || JSON.stringify(ratingOptions) !== JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS)) {
      throw new Error('The stored Behaviour v02 snapshot is incomplete, mixed or crossed.');
    }
    return Object.freeze({
      frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      valueId: row.BehaviourID as BehaviourV2ValueId,
      valueTitle: row.BehaviourValueTitleSnapshot,
      corporateValue: row.BehaviourCorporateValueSnapshot,
      roleTier: row.BehaviourRoleTierSnapshot,
      descriptor: row.BehaviourDescriptorSnapshot,
      cadence: row.BehaviourCadenceSnapshot,
      periodKeys: Object.freeze((periods as string[]).slice()) as IBehaviourAnnualSnapshotV2['periodKeys'],
      ratingOptions: Object.freeze((ratingOptions as IBehaviourV2RatingOption[]).map(option => Object.freeze({ ...option })))
    });
  }

  private parseBehaviourPeriodCommitmentsV2(value: string | undefined,
    periodKeys: readonly string[]): Readonly<Record<string, string>> {
    let parsed: unknown;
    try { parsed = JSON.parse(value || 'null') as unknown; }
    catch { throw new Error('The stored Behaviour v02 period commitments JSON is invalid.'); }
    if (!Array.isArray(parsed) || parsed.length !== periodKeys.length) {
      throw new Error('The stored Behaviour v02 period commitments do not match the immutable cadence snapshot.');
    }
    const result: Record<string, string> = {};
    parsed.forEach(valueEntry => {
      const entry = valueEntry as { period?: unknown; commitment?: unknown };
      if (!entry || typeof entry !== 'object' || typeof entry.period !== 'string'
        || periodKeys.indexOf(entry.period) < 0 || result[entry.period] !== undefined
        || typeof entry.commitment !== 'string' || !entry.commitment.trim()) {
        throw new Error('The stored Behaviour v02 period commitment is incomplete or crossed.');
      }
      result[entry.period] = entry.commitment;
    });
    return Object.freeze(result);
  }

  private parseBehaviourSelectedSuggestionKeys(value: string | undefined, required = false): string[] | undefined {
    if (!value && !required) return undefined;
    try {
      const parsed = JSON.parse(value || 'null') as unknown;
      if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string' || !item.trim())
        || new Set(parsed as string[]).size !== parsed.length) {
        throw new Error('invalid');
      }
      return parsed as string[];
    } catch {
      if (!required) return undefined;
      throw new Error('The stored Behaviour v02 selected suggestion keys are missing or invalid.');
    }
  }

  private mapWorkplanAudit(row: IAuditRowV2): IEmployeeWorkplanAuditReadbackV2 {
    return {
      auditKey: row.AuditKey, eventType: row.EventType, subjectKey: row.SubjectKey,
      actorEmail: row.ActorEmail, actorRole: row.ActorRole, eventAt: row.EventAt,
      reason: row.Reason, beforeJson: row.BeforeJSON, afterJson: row.AfterJSON,
      correlationKey: row.CorrelationKey, source: row.Source,
      sourceReference: row.SourceReference, success: row.Success
    };
  }

  private mapQuarterReview(row: IQuarterReviewRowV2): IQuarterReview {
    const hasBehaviourV2Header = [row.BehaviourFrameworkVersionSnapshot,
      row.BehaviourRoleTierSnapshot, row.BehaviourCadenceSnapshot]
      .some(value => value !== undefined && value !== null);
    if (hasBehaviourV2Header && (row.BehaviourFrameworkVersionSnapshot !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || !isBehaviourV2RoleTier(row.BehaviourRoleTierSnapshot)
      || row.BehaviourCadenceSnapshot !== 'Quarterly' && row.BehaviourCadenceSnapshot !== 'TwiceYearly')) {
      throw new Error('The stored Quarter Review Behaviour v02 header snapshot is incomplete or crossed.');
    }
    return {
      id: row.Id, etag: row['@odata.etag'] || '*', quarterReviewKey: row.QuarterReviewKey,
      workplanKey: row.WorkplanKey, personKey: row.PersonKey, employeeDisplayName: row.EmployeeDisplayName,
      employeeEmail: row.EmployeeEmail, performanceYear: row.PerformanceYear, quarter: row.Quarter,
      managerPersonKey: row.ManagerPersonKey, managerDisplayName: row.ManagerDisplayName, managerEmail: row.ManagerEmail,
      coreCategoryWeightSnapshot: row.CoreCategoryWeightSnapshot,
      personalCategoryWeightSnapshot: row.PersonalCategoryWeightSnapshot,
      behaviourCategoryWeightSnapshot: row.BehaviourCategoryWeightSnapshot,
      workplanApprovalCorrelationKey: row.WorkplanApprovalCorrelationKey,
      state: row.State, accessState: row.AccessState, transitionStatus: row.TransitionStatus,
      transitionCorrelationKey: row.TransitionCorrelationKey, employeeSubmissionComment: row.EmployeeSubmissionComment,
      submittedAt: row.SubmittedAt, submittedByEmail: row.SubmittedByEmail,
      managerDecisionComment: row.ManagerDecisionComment, approvedAt: row.ApprovedAt,
      approvedByEmail: row.ApprovedByEmail, lockedAt: row.LockedAt, lockedByEmail: row.LockedByEmail,
      rowVersionToken: row.RowVersionToken,
      behaviourFrameworkVersionV2: row.BehaviourFrameworkVersionSnapshot,
      behaviourRoleTierV2: row.BehaviourRoleTierSnapshot,
      behaviourCadenceV2: row.BehaviourCadenceSnapshot
    };
  }

  private mapQuarterItem(row: IQuarterItemRowV2): IQuarterReviewItem {
    // Admit stored authority and snapshot descriptors before parser/property reads.
    ['WorkplanItemKey', 'WorkplanKey', 'PersonKey', 'QuarterReviewItemKey', 'Quarter', 'PerformanceYear',
      'BehaviourIDSnapshot', 'BehaviourAnnualTargetLevelV2', 'BehaviourAnnualTargetJustificationV2',
      'BehaviourAnnualTargetSourceWorkplanItemKeyV2', 'BehaviourAnnualTargetSourceEtagV2',
      'BehaviourAnnualTargetSourceWorkplanVersionV2', 'BehaviourAnnualTargetSourceApprovalKeyV2',
      'BehaviourFrameworkVersionSnapshot', 'BehaviourValueTitleSnapshot', 'BehaviourCorporateValueSnapshot',
      'BehaviourRoleTierSnapshot', 'BehaviourDescriptorSnapshot', 'BehaviourCadenceSnapshot',
      'BehaviourPeriodKeysSnapshotJSON', 'BehaviourPeriodSnapshot', 'BehaviourRatingLabelsSnapshotJSON',
      'EmployeeBehaviourEvidenceV2', 'EmployeeBehaviourAssessmentV2', 'ManagerBehaviourEvidenceV2',
      'ManagerBehaviourAssessmentV2', 'FinalBehaviourEvidenceV2', 'FinalBehaviourAssessmentV2']
      .forEach(key => ownSnapshotValue(row, key));
    const behaviourSnapshotV2 = this.parseBehaviourPeriodSnapshotV2(row);
    const recovery = row.BTGRoute ? {
      route: row.BTGRoute, action: row.BTGAction, ownerPersonKey: row.BTGOwnerPersonKey,
      dueDate: row.BTGDueDate?.slice(0, 10), nextReviewDate: row.NextReviewDate?.slice(0, 10), status: row.BTGStatus,
      expectedReturnToGreenDate: row.BTGExpectedReturnToGreenDate?.slice(0, 10),
      expectedReducedOutcome: row.BTGExpectedReducedOutcome, proposedRevisedTarget: row.ReforecastProposedTarget,
      proposedRevisedDate: row.ReforecastProposedDate?.slice(0, 10), reforecastReason: row.ReforecastReason,
      reforecastApprovalStatus: row.ReforecastApprovalStatus, dependencyOrDecision: row.EscalationDependency,
      escalatedTo: row.EscalatedTo, targetDecisionDate: row.EscalationTargetDecisionDate?.slice(0, 10)
    } : undefined;
    const mapped: IQuarterReviewItem = {
      id: row.Id, etag: row['@odata.etag'] || '*', quarterReviewItemKey: row.QuarterReviewItemKey,
      quarterReviewKey: row.QuarterReviewKey, workplanItemKey: row.WorkplanItemKey, workplanKey: row.WorkplanKey,
      personKey: row.PersonKey, performanceYear: row.PerformanceYear, quarter: row.Quarter, itemType: row.ItemType,
      kpiId: row.KPIID, kpiVersionKey: row.KPIVersionKey, targetVersionKey: row.TargetVersionKey,
      wording: row.ItemWordingSnapshot, itemDescription: row.ItemDescriptionSnapshot, measure: row.MeasureSnapshot,
      pillar: row.PillarSnapshot, workstream: row.WorkstreamSnapshot, ownerEmail: row.OwnerEmailSnapshot,
      unitLabel: row.UnitLabelSnapshot, metricType: row.MetricTypeSnapshot, scoringDirection: row.ScoringDirectionSnapshot,
      percentageSourceScale: row.PercentageScaleSnapshot, baselineValue: row.BaselineValueSnapshot,
      yearEndTargetValueSnapshot: row.YearEndTargetValueSnapshot, yearEndTargetTextSnapshot: row.YearEndTargetTextSnapshot,
      quarterTargetValue: row.QuarterTargetValue, quarterTargetText: row.QuarterTargetText,
      employeeActualValue: row.EmployeeActualValue, employeeActualText: row.EmployeeActualText,
      progressPct: row.ProgressPct, scoredProgressPct: typeof row.ProgressPct === 'number' ? Math.max(0, Math.min(100, row.ProgressPct)) : undefined,
      calculatedRag: row.CalculatedRAG || 'NotRated', calculationRuleVersion: row.CalculationRuleVersion,
      scoringMessage: row.CalculatedRAG ? undefined : 'RAG pending governed calculation.', statusUpdate: row.StatusUpdate,
      contextMitigation: row.ContextMitigation, quarterEndForecastValue: row.QuarterEndForecastValue,
      quarterEndForecastText: row.QuarterEndForecastText, evidenceCount: row.EvidenceCount, recovery,
      managerComment: row.ManagerComment, managerOverride: row.ManagerOverrideRAG ? {
        rag: row.ManagerOverrideRAG === 'NotRated' ? undefined : row.ManagerOverrideRAG,
        reason: row.OverrideReason, actorEmail: row.OverrideByEmail, overriddenAt: row.OverrideAt
      } : undefined,
      finalApprovedRag: row.FinalRAG, contributionWeightSnapshot: row.ContributionWeightSnapshot,
      workplanItemWeightSnapshot: row.WorkplanItemWeightSnapshot, behaviourId: row.BehaviourIDSnapshot,
      behaviourVersionKey: row.BehaviourVersionKeySnapshot, behaviourTitle: row.BehaviourTitleSnapshot,
      behaviourPrompt: row.BehaviourDescriptionSnapshot, behaviourAssessmentGuidance: row.BehaviourGuidanceSnapshot,
      behaviourObjectiveKey: row.BehaviourObjectiveKeySnapshot, behaviourObjectiveSource: row.BehaviourObjectiveSourceSnapshot,
      behaviourObjectiveTitle: row.BehaviourObjectiveTitleSnapshot, behaviourObjectiveDescription: row.ItemDescriptionSnapshot,
      behaviourEvidenceDefinition: row.BehaviourEvidenceDefSnapshot,
      behaviourTargetRating: behaviourSnapshotV2 ? undefined : row.BehaviourTargetRating,
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
      behaviourExamples: row.BehaviourExamples,
      managerBehaviourAssessment: row.ManagerBehaviourAssessment, managerApproved: row.ManagerApproved, locked: row.Locked
    };
    QUARTER_BEHAVIOUR_TARGET_FIELDS.forEach(key => { if (mapped[key] === null || mapped[key] === '') delete mapped[key]; });
    const image = materialiseQuarterBehaviourTarget(mapped);
    return { ...mapped, ...image };
  }

  private parseBehaviourPeriodSnapshotV2(row: IQuarterItemRowV2): IQuarterReviewItem['behaviourSnapshotV2'] {
    const hasV2Field = [row.BehaviourFrameworkVersionSnapshot, row.BehaviourValueTitleSnapshot,
      row.BehaviourCorporateValueSnapshot, row.BehaviourRoleTierSnapshot, row.BehaviourDescriptorSnapshot,
      row.BehaviourCadenceSnapshot, row.BehaviourPeriodKeysSnapshotJSON, row.BehaviourPeriodSnapshot,
      row.BehaviourRatingLabelsSnapshotJSON, row.EmployeeBehaviourEvidenceV2,
      row.EmployeeBehaviourAssessmentV2, row.ManagerBehaviourEvidenceV2,
      row.ManagerBehaviourAssessmentV2, row.FinalBehaviourEvidenceV2, row.FinalBehaviourAssessmentV2]
      .some(value => value !== undefined && value !== null);
    if (!hasV2Field) return undefined;
    let periods: unknown;
    let labels: unknown;
    try {
      periods = JSON.parse(row.BehaviourPeriodKeysSnapshotJSON || 'null') as unknown;
      labels = JSON.parse(row.BehaviourRatingLabelsSnapshotJSON || 'null') as unknown;
    } catch {
      throw new Error('The stored Behaviour v02 review snapshot JSON is invalid.');
    }
    const cadence = row.BehaviourCadenceSnapshot;
    const period = row.BehaviourPeriodSnapshot;
    if (row.BehaviourFrameworkVersionSnapshot !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || !isBehaviourV2ValueId(row.BehaviourIDSnapshot) || !isBehaviourV2RoleTier(row.BehaviourRoleTierSnapshot)
      || (cadence !== 'Quarterly' && cadence !== 'TwiceYearly')
      || !row.BehaviourValueTitleSnapshot?.trim() || !row.BehaviourCorporateValueSnapshot?.trim()
      || !row.BehaviourDescriptorSnapshot?.trim() || !Array.isArray(periods)
      || JSON.stringify([...periods].sort()) !== JSON.stringify([...behaviourV2Periods(cadence)].sort())
      || typeof period !== 'string' || (periods as string[]).indexOf(period) < 0
      || !Array.isArray(labels) || JSON.stringify(labels) !== JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS)) {
      throw new Error('The stored Behaviour v02 review snapshot is incomplete, mixed or crossed.');
    }
    return Object.freeze({ frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      valueId: row.BehaviourIDSnapshot as BehaviourV2ValueId,
      valueTitle: row.BehaviourValueTitleSnapshot, corporateValue: row.BehaviourCorporateValueSnapshot,
      roleTier: row.BehaviourRoleTierSnapshot, descriptor: row.BehaviourDescriptorSnapshot,
      cadence, periodKeys: Object.freeze((periods as BehaviourV2Period[]).slice()),
      ratingOptions: Object.freeze((labels as IBehaviourV2RatingOption[]).map(option => Object.freeze({ ...option }))),
      period: period as BehaviourV2Period });
  }

  private mapEvidence(row: IEvidenceRowV2): IQuarterEvidenceReference {
    return {
      evidenceKey: row.EvidenceKey, kind: row.FileRef ? 'File' : 'Text', personKey: row.PersonKey,
      workplanKey: row.WorkplanKey, workplanItemKey: row.WorkplanItemKey,
      quarterReviewKey: row.QuarterReviewKey, quarterReviewItemKey: row.QuarterReviewItemKey,
      performanceYear: row.PerformanceYear, quarter: row.Quarter, kpiId: row.KPIID,
      description: row.EvidenceDescription, serverRelativeFileUrl: row.FileRef, status: row.EvidenceStatus
    };
  }

  private mapQuarterAudit(row: IAuditRowV2): IQuarterReviewAuditEvent {
    if (!row.Quarter) throw new Error(`Quarter Review audit ${row.AuditKey} has no Quarter.`);
    return {
      id: row.Id, auditKey: row.AuditKey, eventType: row.EventType as QuarterReviewAuditEventType,
      subjectKey: row.SubjectKey, performanceYear: row.PerformanceYear, quarter: row.Quarter,
      actorEmail: row.ActorEmail, actorRole: row.ActorRole as IQuarterReviewAuditEvent['actorRole'],
      eventAt: row.EventAt, reason: row.Reason, beforeJson: row.BeforeJSON, afterJson: row.AfterJSON,
      correlationKey: row.CorrelationKey, source: row.Source as IQuarterReviewAuditEvent['source'],
      sourceReference: row.SourceReference, success: row.Success
    };
  }

  private async getRows<T>(listTitle: string, select: string, filter: string, orderBy: string, top: number): Promise<T[]> {
    const url = `${this.listItemsUrl(listTitle)}?$select=${select}&$filter=${encodeURIComponent(filter)}&$orderby=${encodeURIComponent(orderBy)}&$top=${top}`;
    const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    await this.ensureSuccess(response, `Employee V2 canonical readback failed for ${listTitle}.`);
    return (await response.json() as IODataCollection<T>).value;
  }

  private listItemsUrl(listTitle: string): string {
    return `${this.webAbsoluteUrl}/_api/web/lists/getbytitle('${this.escapeOData(listTitle)}')/items`;
  }

  private escapeOData(value: string): string { return value.replace(/'/g, "''"); }
  private async ensureSuccess(response: SPHttpClientResponse, message: string): Promise<void> {
    if (!response.ok) throw new Error(message);
  }
}

export const EMPLOYEE_V2_WORKPLAN_SELECT = WORKPLAN_SELECT;
export const EMPLOYEE_V2_WORKPLAN_ITEM_SELECT = WORKPLAN_ITEM_SELECT;
export const EMPLOYEE_V2_TEST_WORKPLAN_ITEM_SELECT = TEST_WORKPLAN_ITEM_SELECT;
export const EMPLOYEE_V2_QUARTER_ITEM_SELECT = QUARTER_ITEM_SELECT;
