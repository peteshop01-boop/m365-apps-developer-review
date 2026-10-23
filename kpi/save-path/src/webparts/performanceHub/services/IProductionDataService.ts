import type { IV5HistoryCoordinates } from '../models/OptionEWorkplanSubmittedHistoryV5Models';
import type { V5HistoryReadResult } from './OptionEWorkplanSubmittedHistoryV5ReadProjection';
import type {
  IProductionConfig,
  IProductionPerson,
  IReferenceCounts,
  IAnnualWorkplan,
  ICoreKpiCatalogueItem,
  ICoreWorkplanItem,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  IPersonalWorkplanItem,
  IControlledSubmissionContext,
  IManagerWorkplanReviewContext,
  IWorkplanSubmissionResult,
  IWorkplanTransitionResult,
  CoreKpiRole
} from '../models/ProductionModels';
import type { IQuarterTimingConfig } from '../models/GovernanceModels';
import type { IWorkplanCategoryWeights } from '../models/GovernanceModels';
import type { BehaviourRating, IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import type {
  IProgressEntry,
  IProgressLedger,
  IManagerQuarterReviewContext,
  IQuarterLifecycle,
  IQuarterReviewContext,
  IQuarterReviewItem,
  IQuarterReviewTransitionResult,
  IQuarterManagerOverrideResult
} from '../models/QuarterlyModels';
import type { IQuarterDraftSource } from './QuarterReviewFactory';
import type { IAdminTeamRecord } from '../models/AdminFoundationModels';
import type { IAdminConfigSourceRecord } from './AdminConfigDomain';
import type { IAdminEventHistoryView } from './AdminEventHistoryDomain';
import type { IEmployeeWorkplanV2PersistenceService } from './IEmployeeWorkplanV2PersistenceService';

/** Runtime-opaque; validity is held by the authoritative SharePoint People adapter, not these fields. */
export interface IAuthoritativeAdminEventHistoryCapability {
  readonly actorEmail: string;
  readonly personKey: string;
  readonly authorisationSource: 'AuthoritativePeopleReadback';
}

/** Runtime-opaque; validity and its issue set are held by the production readback adapter. */
export interface IAuthoritativeAdminKpiRemediationQueueCapability {
  readonly actorEmail: string;
  readonly personKey: string;
  readonly performanceYear: number;
  readonly issueCount: number;
  readonly sourceList: 'DEMOAPP_KPIMaster';
  readonly authorisationSource: 'AuthoritativeKpiDataQualityReadback';
}

export interface IProductionDataService extends IEmployeeWorkplanV2PersistenceService {
  /** Optional immutable historical read; confers no mutation or operational capability. */
  getSubmittedWorkplanHistoryV5?(coordinates: Readonly<IV5HistoryCoordinates>): Promise<V5HistoryReadResult>;
  getPersonByEmail(email: string): Promise<IProductionPerson | undefined>;
  /** Current People hierarchy only; never a stored Workplan manager snapshot. */
  getDirectReports(manager: IProductionPerson): Promise<IProductionPerson[]>;
  getAdminPeople(actor: IProductionPerson): Promise<IProductionPerson[]>;
  getAdminTeams(actor: IProductionPerson): Promise<IAdminTeamRecord[]>;
  getAdminConfigRecords(actor: IProductionPerson): Promise<IAdminConfigSourceRecord[]>;
  getAuthoritativeAdminEventHistoryCapability(): Promise<IAuthoritativeAdminEventHistoryCapability>;
  getAuthoritativeAdminEventHistoryView?(performanceYear: number): Promise<IAdminEventHistoryView>;
  getAuthoritativeAdminKpiRemediationQueueCapability(
    performanceYear: number
  ): Promise<IAuthoritativeAdminKpiRemediationQueueCapability>;
  getProductionConfig(): Promise<IProductionConfig>;
  getReferenceCounts(performanceYearNumber: number): Promise<IReferenceCounts>;
  getWorkplanStatus(personKey: string, performanceYearNumber: number): Promise<string>;
  getOrCreateDraftWorkplan(employee: IProductionPerson, manager: IProductionPerson | undefined, config: IProductionConfig): Promise<IAnnualWorkplan>;
  saveWorkplanCategoryWeights(workplan: IAnnualWorkplan, weights: IWorkplanCategoryWeights, reason?: string): Promise<IAnnualWorkplan>;
  getCoreKpiCatalogue(performanceYearNumber: number): Promise<ICoreKpiCatalogueItem[]>;
  getCoreWorkplanItems(workplanKey: string): Promise<ICoreWorkplanItem[]>;
  saveCoreWorkplanItem(workplan: IAnnualWorkplan, kpi: ICoreKpiCatalogueItem, weight: number | undefined, role: CoreKpiRole | undefined, displayOrder: number): Promise<ICoreWorkplanItem>;
  removeCoreWorkplanItem(workplan: IAnnualWorkplan, item: ICoreWorkplanItem): Promise<void>;
  getPublishedBehaviours(): Promise<IBehaviourSummary[]>;
  getPersonalWorkplanItems(workplanKey: string): Promise<IPersonalWorkplanItem[]>;
  savePersonalWorkplanItem(workplan: IAnnualWorkplan, item: IPersonalWorkplanItem, displayOrder: number): Promise<IPersonalWorkplanItem>;
  removePersonalWorkplanItem(workplan: IAnnualWorkplan, item: IPersonalWorkplanItem): Promise<void>;
  getBehaviourWorkplanItems(workplanKey: string): Promise<IBehaviourWorkplanItem[]>;
  saveBehaviourWorkplanItem(workplan: IAnnualWorkplan, behaviour: IBehaviourSummary, item?: IBehaviourWorkplanItem): Promise<IBehaviourWorkplanItem>;
  removeBehaviourWorkplanItem(workplan: IAnnualWorkplan, item: IBehaviourWorkplanItem): Promise<void>;
  getBehaviourObjectiveLibrary(includeInactive?: boolean): Promise<IBehaviourObjectiveLibraryRecord[]>;
  saveBehaviourObjective(actor: IProductionPerson, item: IBehaviourObjectiveLibraryRecord): Promise<IBehaviourObjectiveLibraryRecord>;
  setBehaviourObjectiveActive(actor: IProductionPerson, item: IBehaviourObjectiveLibraryRecord, active: boolean): Promise<IBehaviourObjectiveLibraryRecord>;
  submitWorkplan(context: IControlledSubmissionContext, actor: IProductionPerson): Promise<IWorkplanSubmissionResult>;
  getManagerReviewContexts(manager: IProductionPerson): Promise<IManagerWorkplanReviewContext[]>;
  requestWorkplanChanges(context: IManagerWorkplanReviewContext, actor: IProductionPerson, reason: string): Promise<IWorkplanTransitionResult>;
  approveWorkplan(context: IManagerWorkplanReviewContext, actor: IProductionPerson): Promise<IWorkplanTransitionResult>;
  /** Compatibility facade only; delegates to approveWorkplan and cannot perform Admin locking. */
  approveAndLockWorkplan(context: IManagerWorkplanReviewContext, actor: IProductionPerson): Promise<IWorkplanTransitionResult>;
  lockApprovedWorkplan?(loaded: IAnnualWorkplan, actor: IProductionPerson, yearGateControlReference: string, correlationKey: string): Promise<IWorkplanTransitionResult>;
  reopenLockedWorkplan?(loaded: IAnnualWorkplan, actor: IProductionPerson, reason: string, controlReference: string, correlationKey: string, supersessionControlReference?: string): Promise<IWorkplanTransitionResult>;
  openApprovedWorkplanAmendment?(loaded: IAnnualWorkplan, actor: IProductionPerson, reason: string, controlReference: string, correlationKey: string): Promise<IWorkplanTransitionResult>;
  getQuarterTimingConfig(): Promise<IQuarterTimingConfig>;
  getManagerQuarterReviewContexts(manager: IProductionPerson, lifecycles: IQuarterLifecycle[]): Promise<IManagerQuarterReviewContext[]>;
  getQuarterReviewContext(source: IQuarterDraftSource): Promise<IQuarterReviewContext>;
  prepareQuarterReview(source: IQuarterDraftSource): Promise<IQuarterReviewContext>;
  saveQuarterReviewItem(context: IQuarterReviewContext, item: IQuarterReviewItem, actor: IProductionPerson, config: IProductionConfig): Promise<IQuarterReviewItem>;
  saveProgressEntry(context: IQuarterReviewContext, item: IQuarterReviewItem, entry: IProgressEntry, actor: IProductionPerson): Promise<IProgressLedger>;
  submitQuarterReview(context: IQuarterReviewContext, actor: IProductionPerson, comment?: string): Promise<IQuarterReviewTransitionResult>;
  requestQuarterReviewChanges(context: IManagerQuarterReviewContext, actor: IProductionPerson, reason: string): Promise<IQuarterReviewTransitionResult>;
  approveAndLockQuarterReview(context: IManagerQuarterReviewContext, actor: IProductionPerson, comment?: string): Promise<IQuarterReviewTransitionResult>;
  saveQuarterManagerOverride(context: IManagerQuarterReviewContext, item: IQuarterReviewItem, actor: IProductionPerson, rag: Exclude<IQuarterReviewItem['calculatedRag'], 'NotRated'>, reason: string): Promise<IQuarterManagerOverrideResult>;
  saveQuarterBehaviourAssessment(context: IManagerQuarterReviewContext, item: IQuarterReviewItem, actor: IProductionPerson, rating: BehaviourRating): Promise<IQuarterReviewItem>;
}
