import type { IYearLifecycleSyntheticFixture, IYearLifecycleSyntheticSourceSession } from '../models/YearLifecycleSourceCallerModels';
import { createYearLifecycleSyntheticSourceSession } from '../services/yearLifecycle/YearLifecycleSyntheticSourceSession';
import { YearLifecycleSourceCallerView } from './YearLifecycleSourceCallerView';
import { OptionEWorkplanSubmittedHistoryV5View } from './OptionEWorkplanSubmittedHistoryV5View';
import type { V5HistoryReadResult } from '../services/OptionEWorkplanSubmittedHistoryV5ReadProjection';
import AdminFoundationBehaviourCatalogue from './AdminFoundationPage.behaviourCatalogue';
import { ImpactClassificationFields } from './ImpactClassificationFields';
import { CapturedDeliveryWeightingPanel } from './CategoryWeightingPanel';
import type { IBehaviourCatalogueAdministrationGateway } from '../services/BehaviourCatalogueAdministration';
import { OptionEWorkplanSubmitExactBodyV4Client } from '../services/OptionEWorkplanSubmitExactBodyV4Client';
import { readOptionEDraftCreateAdmission, type IOptionEDraftCreateIntegration } from '../services/OptionEDraftCreateIntegration';
import { startAndOpenVerifiedDraft } from '../services/OptionEDraftStartAndReadback';
import type { GovernedNotificationSourceController } from '../services/notifications/GovernedNotificationSourceController';
import * as React from 'react';
import type { SPHttpClient, SPHttpClientConfiguration } from '@microsoft/sp-http';
import OptionEDraftSharePointGateway from '../services/OptionEDraftSharePointGateway';
import OptionEProtectedDraftGateway from '../services/OptionEProtectedDraftGateway';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from '../services/OptionEWorkplanListBindings';
import { OPTION_E_DRAFT_V3_SCHEMA_VERSION, type IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
import type { OptionEPrivateDraftAggregate } from '../services/OptionEDraftSharePointGateway';
import { PrivateDraftV3EditorSession } from '../services/OptionEPrivateDraftV3EditorAdapter';
import { AdminMasterSourceCompositionView } from './AdminMasterSourceCompositionView';
import { readAdminMasterSource } from '../services/AdminMasterSourceComposition';
import type { AdminMasterReadResult, IAdminMasterSourceReader } from '../models/AdminMasterSourceCompositionModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService, IAdminReportingControlSnapshot } from '../services/AdminReportingControlDataService';
import type {
  CoreKpiRole, IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem,
  ICoreKpiCatalogueItem, ICoreWorkplanItem, IManagerWorkplanReviewContext, IPersonalWorkplanItem,
  IProductionOverview, IProductionPerson
} from '../models/ProductionModels';
import type {
  EmployeeContributionMethodV2, EmployeeCoreWeightingModeV2,
  IEmployeeBehaviourCommitmentInputV2, IEmployeeCoreContributionReadbackV2,
  IEmployeeV2ItemCommandContext, IEmployeeWorkplanReadbackV2
} from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IAdminTeamRecord } from '../models/AdminFoundationModels';
import type { IAdminConfigSourceRecord } from '../services/AdminConfigDomain';
import { filterAuthorisedAdminEventHistoryView, type IAdminEventHistoryView } from '../services/AdminEventHistoryDomain';
import type { BehaviourKey, BehaviourRating, IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_PLANNING_LEVELS_VERSION, BEHAVIOUR_V2_VALUE_IDS,
  type IBehaviourPlanningLevelsV1,
  type BehaviourV2Cadence } from '../models/BehaviourFrameworkV2Models';
import type { IBehaviourFocusTargetSelection, IBehaviourFrameworkV2Catalogue }
  from '../services/BehaviourFrameworkV2';
import { getBehaviourFrameworkV2Choices } from '../services/BehaviourFrameworkV2';
import { suggestedBehaviourTargetLevel } from '../services/BehaviourFrameworkV2Policy';
import { validateBehaviourAssignments } from '../services/AnnualWorkplanValidation';
import { validateEmployeeBehaviourCommitmentInputV2 } from '../services/EmployeeWorkplanV2PersistencePolicy';
import type { IManagerQuarterReviewContext, IProgressEntry, IQuarterLifecycle, IQuarterReviewContext, IQuarterReviewItem, QuarterKey } from '../models/QuarterlyModels';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { buildIntegratedKpis, integratedReferenceCounts, type IIntegratedKpi } from '../services/IntegratedReferenceData';
import { EMPLOYEE_V2_APPROVED_BEHAVIOURS } from '../services/EmployeeWorkplanV2ApprovedBehaviours';
import {
  behaviourSelectionIsComplete,
  choosePrimaryBehaviourSuggestion,
  getEmployeeBehaviourSuggestions,
  getLocalBehaviourLibrarySuggestions,
  getEmployeeBehaviourV2Suggestions,
  getUnavailableEmployeeBehaviourV2SelectionKeys,
  retainUnavailableEmployeeBehaviourV2Selection
} from '../services/EmployeeBehaviourSelection';
import { buildManagerExperience } from '../services/ManagerExperience';
import { buildQuarterLifecycle, getCurrentQuarter } from '../services/QuarterLifecycle';
import { isAnnualWorkplanEligibleForQuarterlyDraft, type IQuarterDraftSource } from '../services/QuarterReviewFactory';
import AdminPeopleManagementView from './AdminPeopleManagementView';
import { getAdminFoundationEntitlement } from '../services/AdminFoundationEntitlement';
import { applicationEntryCapabilities, hasExactManagerIdentity } from '../services/ControlledApplicationRoles';
import {
  getConfirmedCoverageMembershipOptions, getIntegratedReportingReadinessReasons,
  integratedEmployeeCommandKey, resolveIntegratedContributionMethod
} from '../services/IntegratedPerformanceHubR2Contract';
import type { IStrategicCoreCoverageFilter } from '../services/StrategicCoreCoverageFeed';
import StrategicCoreCoveragePage from './StrategicCoreCoveragePage';
import ManagerExperiencePage from './ManagerExperiencePage';
import QuarterlyReviewPage from './QuarterlyReviewPage';
import styles from './IntegratedPerformanceHub.module.scss';
import BehaviourFrameworkV2Panel from './BehaviourFrameworkV2Panel';
import BehaviourLibrarySelector from './BehaviourLibrarySelector';
import { ImpactFieldHelp } from './ImpactFieldHelp';
import { IMPACT_HELP } from '../services/ImpactFieldHelpContent';
import { readImpactDraft, projectImpactDraft, retainImpactInput, impactTargetEditReason, type IIntegratedImpactDraft, type ImpactEditorMeasure } from '../services/IntegratedImpactDraftMapping';
import {
  OPTION_E_BEHAVIOUR_FRAMEWORK_VERSION,
  OPTION_E_DRAFT_SCHEMA_VERSION,
  type IOptionEBehaviourSelectionSnapshot,
  type IOptionEGovernedBehaviourExtension,
  type IOptionEWorkplanDraftAggregate,
  type OptionEContributionMethod,
  type OptionETargetValue
} from '../models/OptionEWorkplanDraftModels';
import type { IOptionEDraftGateway, IOptionEDraftCanonicalRecord } from '../services/OptionEDraftSharePointGateway';
import {
  buildOptionEBehaviourGovernedExtension,
  type IOptionEBehaviourManagerGateway,
  type IOptionEBehaviourManagerReadModel,
  type IOptionEBehaviourRuntimeAuthority,
  type OptionEBehaviourManagerDisposition
} from '../services/BehaviourOptionEBinding';
import { OptionEDraftSaveController, type IOptionEDraftSaveSnapshot } from './OptionEDraftSaveController';
import { formatCoreSelectionCount } from '../services/CoreWorkplanValidation';
import kcfLogo from '../assets/kcf-foundation-landscape-white.png';
import ContextualHelp, { type IContextualHelpProps } from './ContextualHelp';
import { PerformanceConceptGuide, scoringApproachLabel } from './PerformancePresentation';
import ReportingViewsPage from './ReportingViewsPage';
import type { IReportingViewsDataset } from '../models/ReportingModels';
import { validateReportingDataset } from '../services/ReportingViewModels';

type ProductArea = 'home' | 'build' | 'workplan' | 'manager' | 'admin' | 'reporting';
type BuilderTab = 'Core KPIs' | 'Personal KPIs' | 'Behaviours' | 'Review & Weight';
export type ManagerTab = 'My Team' | 'Reviews Awaiting Me' | 'Employee Review' | 'Quarterly Review';
export type AdminTab = 'People' | 'Teams' | 'KPI Master' | 'Annual Targets' | 'Behaviour Library' | 'Config' | 'Reporting Map' | 'Output Definitions' | 'Strategic Core Coverage' | 'History & Audit' | 'Data Quality';
export type ReportingTab = 'Reporting Readiness' | 'GOLD / organisation reporting' | 'CWOP / CWSP' | 'Performance reporting views';
type CoreRole = 'Owner' | 'Delivery' | 'Support';

// Short card cues restate the five approved V1 prompts; the full governed text stays in the editor.
const behaviourFocusCues: Record<string, readonly string[]> = {
  'BHV-01': ['Share openly', 'Back colleagues', 'Collaborate well', 'Challenge constructively', 'Put KCF first'],
  'BHV-02': ['Improve how we work', 'Learn and adjust', 'Welcome ideas', 'Use evidence', 'Think ahead'],
  'BHV-03': ['Treat people well', 'Listen first', 'Communicate clearly', 'Value perspectives', 'Disagree constructively'],
  'BHV-04': ['Bring energy', 'Follow through', 'Respond to setbacks', 'Support the team', 'Represent Kent proudly'],
  'BHV-05': ['Own the outcome', 'Raise risks early', 'Seek advice', 'Put problems right', 'Learn from results']
};
type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';
type WeightMode = 'Equal' | 'Custom';

export interface ICoreChoice {
  kpiId: string; role?: CoreRole; ownerDirect?: boolean; weight: number; annualContribution?: string;
  q1?: string; q2?: string; q3?: string; q4?: string;
  annualSuccess?: string; q1Success?: string; q2Success?: string; q3Success?: string; q4Success?: string;
  contributionMethod?: EmployeeContributionMethodV2;
  sharedTargetRule?: 'VisibleOnly' | 'ApprovedApportionment'; sharedApportionmentPercent?: number;
  governanceReference?: string; denominatorNumerator?: number; denominatorValue?: number;
  denominatorUnit?: string; denominatorRuleReference?: string; denominatorSourceReference?: string;
  roleEvidence?: 'UnsupportedStoredRole';
  optionEDraftTargetValues?: Readonly<Record<'annual' | 'q1' | 'q2' | 'q3' | 'q4', OptionETargetValue | undefined>>;
  optionEDraftCoreId?: string; optionEDraftKpiVersionKey?: string; optionEDraftTargetVersionKey?: string;
}
export type IPersonalChoice = IIntegratedImpactDraft & {
  optionEDraftTargetValues?: Readonly<Record<'annual' | 'q1' | 'q2' | 'q3' | 'q4', OptionETargetValue | undefined>>;
};
type IBehaviourChoiceSelection = NonNullable<IEmployeeBehaviourCommitmentInputV2['selections']>[number] & {
  focusKey?: string;
  focusTitle?: string;
};
export interface IBehaviourChoice {
  behaviourId: string; selectedSuggestionKeys: string[]; commitment: string;
  selections?: IBehaviourChoiceSelection[];
  storedSelectionSnapshots?: IBehaviourWorkplanItem['behaviourSelectionSnapshotsV2'];
  q1: string; q2: string; q3: string; q4: string; h1: string; h2: string;
  frameworkVersion?: string; roleTier?: string; cadence?: BehaviourV2Cadence;
  planningLevels?: IBehaviourPlanningLevelsV1;
  valueTitle?: string; corporateValue?: string; descriptor?: string;
  primarySuggestionKey?: string; customObjective?: string; targetRating?: BehaviourRating; weight?: number;
  objectiveDescription?: string; measure?: string; unit?: string; evidenceDefinition?: string;
  /** Legacy guidance keys are separate from governed selection IDs. */
  optionEDraftLegacySelectedPromptKeys?: readonly string[];
  optionEDraftDescriptorKey?: string; optionEDraftGuidancePromptKeys?: string[];
  optionEGovernedSnapshots?: readonly IOptionEBehaviourSelectionSnapshot[];
}

const behaviourChoiceFromReadback = (behaviourId: string, item?: IBehaviourWorkplanItem): IBehaviourChoice => {
  const selectedSuggestionKeys = item?.selectedSuggestionKeys || (item?.sourceObjectiveKey ? [item.sourceObjectiveKey] : []);
  const periods = item?.behaviourPeriodCommitmentsV2 || {};
  return { behaviourId, selectedSuggestionKeys,
    selections: item?.behaviourSelectionSnapshotsV2?.selections.map(selection => ({
      source: selection.source, selectionKey: selection.selectionKey,
      commitment: selection.commitment, howWillWeKnow: selection.howWillWeKnow
    })),
    storedSelectionSnapshots: item?.behaviourSelectionSnapshotsV2,
    commitment: item?.behaviourCommitmentV2 || item?.customObjective
      || (item?.objectiveSource === 'Custom' ? item.objectiveTitle || '' : ''),
    q1: periods.Q1 || '', q2: periods.Q2 || '', q3: periods.Q3 || '', q4: periods.Q4 || '',
    h1: periods.H1 || '', h2: periods.H2 || '', frameworkVersion: item?.behaviourSnapshotV2?.frameworkVersion,
    roleTier: item?.behaviourSnapshotV2?.roleTier, cadence: item?.behaviourSnapshotV2?.cadence,
    planningLevels: item?.behaviourPlanningLevelsV1 ? { ...item.behaviourPlanningLevelsV1 } : undefined,
    valueTitle: item?.behaviourSnapshotV2?.valueTitle,
    corporateValue: item?.behaviourSnapshotV2?.corporateValue,
    descriptor: item?.behaviourSnapshotV2?.descriptor,
    primarySuggestionKey: item?.sourceObjectiveKey,
    customObjective: item?.customObjective || (item?.objectiveSource === 'Custom' ? item.objectiveTitle || '' : ''),
    objectiveDescription: item?.objectiveDescription, measure: item?.measure, unit: item?.unit,
    evidenceDefinition: item?.evidenceDefinition,
    targetRating: item?.targetRating || item?.q1TargetRating || 3,
    weight: item?.behaviourItemWeight ?? 0,
    ...(item?.behaviourSnapshotV2 ? {} : {
      q1: item?.q1TargetText || '', q2: item?.q2TargetText || '',
      q3: item?.q3TargetText || '', q4: item?.q4TargetText || ''
    }) };
};

const behaviourV2MutationProjection = (choice: IBehaviourChoice): object => ({
  behaviourId: choice.behaviourId, selectedSuggestionKeys: [...choice.selectedSuggestionKeys],
  selections: choice.selections?.map(selection => ({ ...selection })) || [],
  commitment: choice.commitment, q1: choice.q1, q2: choice.q2, q3: choice.q3, q4: choice.q4,
  h1: choice.h1, h2: choice.h2, planningLevels: choice.planningLevels
});

const behaviourV1MutationProjection = (choice: IBehaviourChoice): object => ({
  behaviourId: choice.behaviourId, selectedSuggestionKeys: [...choice.selectedSuggestionKeys],
  primarySuggestionKey: choice.primarySuggestionKey, customObjective: choice.customObjective || '',
  objectiveDescription: choice.objectiveDescription, measure: choice.measure, unit: choice.unit,
  evidenceDefinition: choice.evidenceDefinition, q1: choice.q1, q2: choice.q2, q3: choice.q3, q4: choice.q4,
  targetRating: choice.targetRating || 3, weight: choice.weight ?? 0
});

export const isBehaviourV2Journey = (person: IProductionPerson | undefined,
  canonical: readonly IBehaviourWorkplanItem[]): boolean => {
  const active = canonical.filter(item => item.activeInWorkplan);
  if (active.some(item => item.behaviourSnapshotV2?.frameworkVersion === BEHAVIOUR_FRAMEWORK_V2_VERSION
    || item.behaviourVersionKey === BEHAVIOUR_FRAMEWORK_V2_VERSION)) return true;
  return person?.behaviourFrameworkVersionV2 === BEHAVIOUR_FRAMEWORK_V2_VERSION;
};

export const hasDeferredBehaviourMutation = (choices: readonly IBehaviourChoice[],
  canonical: readonly IBehaviourWorkplanItem[]): boolean => {
  const requested = choices.filter(choice => behaviourSelectionIsComplete(
    choice.selectedSuggestionKeys, choice.customObjective || ''))
    .map(behaviourV1MutationProjection).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const persisted = canonical.filter(item => item.activeInWorkplan && !item.behaviourSnapshotV2)
    .map(item => behaviourV1MutationProjection(behaviourChoiceFromReadback(item.behaviourId, item)))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify(requested) !== JSON.stringify(persisted);
};

export const hasBehaviourV2Mutation = (choices: readonly IBehaviourChoice[],
  canonical: readonly IBehaviourWorkplanItem[]): boolean => {
  const requested = choices.filter(choice => Boolean(choice.commitment.trim()))
    .map(behaviourV2MutationProjection).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const persisted = canonical.filter(item => item.activeInWorkplan && Boolean(item.behaviourSnapshotV2))
    .map(item => behaviourV2MutationProjection(behaviourChoiceFromReadback(item.behaviourId, item)))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return JSON.stringify(requested) !== JSON.stringify(persisted);
};

const behaviourInput = (choice: IBehaviourChoice, cadence: BehaviourV2Cadence,
  displayOrder: number): IEmployeeBehaviourCommitmentInputV2 => ({
  behaviourId: choice.behaviourId as IEmployeeBehaviourCommitmentInputV2['behaviourId'],
  selectedSuggestionKeys: [...choice.selectedSuggestionKeys],
  ...(choice.selections ? { selections: choice.selections.map(selection => ({
    source: selection.source, selectionKey: selection.selectionKey,
    commitment: selection.commitment, howWillWeKnow: selection.howWillWeKnow
  })) } : {}),
  commitment: choice.commitment,
  periodCommitments: (cadence === 'Quarterly' ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['H1', 'H2']).map(period => ({
    period: period as IEmployeeBehaviourCommitmentInputV2['periodCommitments'][number]['period'],
    commitment: choice[period.toLowerCase() as 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2']
  })),
  ...(choice.planningLevels ? { planningLevels: { ...choice.planningLevels } } : {}),
  displayOrder, activeInWorkplan: true
});

export const getBehaviourV2SavePreflightIssues = (choices: readonly IBehaviourChoice[],
  person: IProductionPerson, requireGovernedSelections = false): string[] => {
  const issues: string[] = [];
  if (person.behaviourFrameworkVersionV2 !== BEHAVIOUR_FRAMEWORK_V2_VERSION
    || !person.behaviourRoleTierV2 || !person.behaviourCadenceV2) {
    issues.push('The explicit governed Behaviour framework, role tier and cadence assignment is unavailable.');
    return issues;
  }
  const ids = choices.map(choice => choice.behaviourId);
  if (choices.length !== 5 || BEHAVIOUR_V2_VALUE_IDS.some(valueId => ids.filter(id => id === valueId).length !== 1)) {
    issues.push('Exactly one card for each stable Value BHV-01 to BHV-05 is required.');
    return issues;
  }
  choices.forEach((choice, index) => {
    if (requireGovernedSelections && !Array.isArray(choice.selections)) {
      issues.push(`${choice.behaviourId}: exact per-selection employee text is required.`);
      return;
    }
    try { validateEmployeeBehaviourCommitmentInputV2(behaviourInput(choice, person.behaviourCadenceV2!, index + 1)); }
    catch (error) { issues.push(error instanceof Error ? `${choice.behaviourId}: ${error.message}` : `${choice.behaviourId}: invalid v02 commitment.`); }
  });
  return issues;
};
export interface IIntegratedData {
  overview?: IProductionOverview; reporting?: IAdminReportingControlSnapshot; kpis: IIntegratedKpi[];
  adminEventHistory?: { status: 'denied' | 'unavailable' | 'ready'; view?: IAdminEventHistoryView };
  people: IProductionPerson[]; peopleReadAvailable?: boolean; directReports: IProductionPerson[]; teams: IAdminTeamRecord[]; configs: IAdminConfigSourceRecord[];
  objectives: IBehaviourObjectiveLibraryRecord[]; annualReviews: IManagerWorkplanReviewContext[];
  quarterReviews: IManagerQuarterReviewContext[]; quarterLifecycles: IQuarterLifecycle[]; warnings: string[];
}

export interface IIntegratedPerformanceHubProps {
  dataService: IProductionDataService;
  /** Governed REVIEW-TEST-SITE view-only mode. Never a write admission. */
  nativeWritesHeld?: boolean;
  adminReportingDataService: IAdminReportingControlDataService;
  currentUserEmail: string;
  userDisplayName: string;
  /** Local synthetic preview date only; published runtime uses trusted native as-of data. */
  behaviourLibraryAsOf?: Date;
  /** Supplied only by an independently receipted read-only v2 catalogue binding. */
  behaviourFocusCatalogueV2?: IBehaviourFrameworkV2Catalogue;
  /** B13-05 supplies the exact runtime binding; absence preserves the accepted existing route. */
  optionEDraftGateway?: IOptionEDraftGateway;
  optionEPrivateDraftV3Gateway?: IOptionEDraftGateway<IOptionEWorkplanDraftV3Aggregate>;
  /** Requires the separately verified native Create/receipt/private read capability. */
  optionEDraftCreateIntegration?: IOptionEDraftCreateIntegration;
  /** Closed-v4 source connection; installed Submit stays disabled without native admission. */
  optionEV4SubmitClient?: OptionEWorkplanSubmitExactBodyV4Client;
  /** Separately injected source helper only; no native event producer or delivery is admitted. */
  notificationSource?: GovernedNotificationSourceController;
  /** Exact receipted authority for the supplied published v02 catalogue. */
  behaviourCatalogueAuthority?: IOptionEBehaviourRuntimeAuthority;
  /** Trusted catalogue observation date supplied with the receipted authority. */
  behaviourCatalogueAsOfDate?: string;
  /** Disabled until the separately reviewed manager processor/list/ACL binding is supplied. */
  managerBehaviourGateway?: IOptionEBehaviourManagerGateway;
  /** Client port only; production remains unavailable pending admitted server binding. */
  behaviourCatalogueAdministration?: IBehaviourCatalogueAdministrationGateway;
  /** Synthetic local preview only. There is no operational B04 dataset issuer in this candidate. */
  localSyntheticReportingDataset?: IReportingViewsDataset;
  /** Explicit immutable source-only capture; no installed lifecycle authority. */
  localSyntheticLifecycleFixture?: IYearLifecycleSyntheticFixture;
  /** Source-only read port. Installed binding remains separately admitted. */
  adminMasterSourceReader?: IAdminMasterSourceReader;
}

const quarters: Quarter[] = ['Q1', 'Q2', 'Q3', 'Q4'];
const localPrivateGateways = new WeakSet<object>();
export const LOCAL_PRIVATE_DRAFT_FIXTURE_SITE = 'https://kcf-test.invalid/sites/first-save';
export function isLocalPrivateDraftFixtureRoute(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const url = new URL(window.location.href);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/package-host/'
      && !url.username && !url.password && !url.hash;
  } catch { return false; }
}
/** Declared loopback fixture transport only. It cannot route a request to a SharePoint
 * site; no instance or matching typed row attests native authentication or permission. */
export class LocalPrivateDraftV3Gateway extends OptionEProtectedDraftGateway<IOptionEWorkplanDraftV3Aggregate> {
  private readonly localActorEmail: string;
  public constructor(client: SPHttpClient, email: string, configuration: SPHttpClientConfiguration) {
    const actor = email.trim().toLowerCase();
    const checkRoute = (url: string): void => {
      if (!isLocalPrivateDraftFixtureRoute() || !actor.endsWith('.invalid')
        || !url.startsWith(`${LOCAL_PRIVATE_DRAFT_FIXTURE_SITE}/_api/web/lists/`)) {
        throw new Error('LOCAL_NOT_INSTALLED: the private Draft fixture route is unavailable.');
      }
    };
    if (!isLocalPrivateDraftFixtureRoute() || !actor.endsWith('.invalid')) throw new Error('LOCAL_NOT_INSTALLED: fictional loopback actor required.');
    const transport = {
      get: (...args: Parameters<SPHttpClient['get']>) => { checkRoute(args[0]); return client.get(...args); },
      post: (...args: Parameters<SPHttpClient['post']>) => { checkRoute(args[0]); return client.post(...args); }
    } as unknown as SPHttpClient;
    const store = new OptionEDraftSharePointGateway<IOptionEWorkplanDraftV3Aggregate>(transport,
      LOCAL_PRIVATE_DRAFT_FIXTURE_SITE, OPTION_E_WORKPLAN_LIST_BINDINGS, configuration, undefined, OPTION_E_DRAFT_V3_SCHEMA_VERSION);
    super(transport, LOCAL_PRIVATE_DRAFT_FIXTURE_SITE, actor, OPTION_E_WORKPLAN_LIST_BINDINGS,
      configuration, store, OPTION_E_DRAFT_V3_SCHEMA_VERSION);
    this.localActorEmail = actor;
    localPrivateGateways.add(this); Object.freeze(this);
  }
  public matchesLocalActor(email: string): boolean {
    return localPrivateGateways.has(this) && isLocalPrivateDraftFixtureRoute() && this.localActorEmail === email.trim().toLowerCase();
  }
}
const isCurrentLocalPrivateGateway = (gateway: IOptionEDraftGateway<IOptionEWorkplanDraftV3Aggregate> | undefined, email: string): boolean =>
  gateway instanceof LocalPrivateDraftV3Gateway && localPrivateGateways.has(gateway) && gateway.matchesLocalActor(email);
const annualStartUnavailable = 'Start My Workplan is unavailable until the private employee Draft store and protected Workplan binding are verified.';
const isLegacyPrivateDraftSnapshot = (snapshot: IOptionEDraftSaveSnapshot<OptionEPrivateDraftAggregate>): snapshot is IOptionEDraftSaveSnapshot =>
  (!snapshot.buffer || snapshot.buffer.schemaVersion === 'kcf.workplan-draft/v1')
  && (!snapshot.canonical || (snapshot.canonical.aggregate.schemaVersion === 'kcf.workplan-draft/v1'
    && snapshot.canonical.binding.draftSchemaVersion === 'kcf.workplan-draft/v1'));

const matchesPrivateDraftHeader = (header: IAnnualWorkplan, canonical: IOptionEDraftCanonicalRecord<OptionEPrivateDraftAggregate> | undefined,
  actor: IProductionPerson, authenticatedEmail: string, year: number, expectedSchema: OptionEPrivateDraftAggregate['schemaVersion'] = 'kcf.workplan-draft/v1'): boolean => {
  const binding = canonical?.binding;
  const email = authenticatedEmail.trim().toLowerCase();
  return Boolean(binding && actor.active && actor.email.trim().toLowerCase() === email
    && typeof header.employeeEmail === 'string' && typeof binding.email === 'string'
    && header.employeeEmail.trim().toLowerCase() === email && binding.email.trim().toLowerCase() === email
    && Number.isSafeInteger(header.id) && header.id > 0 && header.id === binding.workplanItemId
    && header.workplanKey === `${actor.personKey}|${year}` && header.workplanKey === binding.workplanKey
    && header.personKey === actor.personKey && header.personKey === binding.personKey
    && header.performanceYear === year && header.performanceYear === binding.performanceYear
    && header.etag !== '*' && Boolean(header.etag) && header.etag === binding.workplanEtag
    && header.rowVersionToken === binding.rowVersionToken
    && (header.state === 'Draft' || header.state === 'ChangesRequested') && header.state === binding.state
    && header.transitionStatus === 'Ready' && binding.transitionStatus === 'Ready'
    && binding.draftSchemaVersion === expectedSchema
    && (expectedSchema !== OPTION_E_DRAFT_V3_SCHEMA_VERSION || canonical?.aggregate.schemaVersion === expectedSchema));
};
const equalWeights = (count: number): number[] => count < 1 ? [] : Array.from({ length: count }, (_, index) =>
  Math.floor(100 / count) + (index < 100 % count ? 1 : 0));
const textValue = (value: number | string | undefined, unit?: string): string => value === undefined
  ? 'Not available' : `${value}${unit && unit !== 'TBC' ? ` ${unit}` : ''}`;
const humanConfigValue = (record: IAdminConfigSourceRecord): string => record.textValue !== undefined ? record.textValue
  : record.numberValue !== undefined ? String(record.numberValue)
    : record.booleanValue !== undefined ? (record.booleanValue ? 'Yes' : 'No')
      : record.dateValue || 'Not set';
const configName = (key: string): string => key.replace(/^.*\./, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ');
type Settled<T> = { ok: true; value: T } | { ok: false };
const settle = async <T,>(operation: Promise<T>): Promise<Settled<T>> => operation.then(value => ({ ok: true, value } as const), () => ({ ok: false } as const));
const annualWorkplanIsEditable = (workplan?: IAnnualWorkplan): boolean => Boolean(workplan
  && (workplan.state === 'Draft' || workplan.state === 'ChangesRequested')
  && workplan.accessState === 'EmployeeEdit' && workplan.transitionStatus === 'Ready');
const noWorkplan = (status: string): boolean => /not\s*started|no workplan/i.test(status);
const hasExistingWorkplan = (status: string): boolean => /^(draft|submitted|changes\s*requested|approved|locked|archived)$/i.test(status.trim());
const roleToChoice = (role?: CoreKpiRole): CoreRole | undefined => role === 'AccountableOwner' ? 'Owner'
  : role === 'DeliveryLead' || role === 'Contributor' ? 'Delivery'
    : role === 'Oversight' || role === 'EvidenceProvider' ? 'Support' : undefined;
const roleToService = (choice: ICoreChoice): CoreKpiRole | undefined => choice.role === 'Owner' ? 'AccountableOwner'
  : choice.role === 'Delivery' ? 'DeliveryLead' : choice.role === 'Support' ? 'Oversight' : undefined;

export type CoreSavePreflightReason = 'CURRENT_CATALOGUE_RECORD_MISSING' | 'ROLE_NOT_SELECTED' | 'UNSUPPORTED_STORED_ROLE';
export interface ICoreSavePreflightIssue {
  kpiId: string;
  name?: string;
  reason: CoreSavePreflightReason;
}

export const getCoreSavePreflightIssues = (
  choices: readonly ICoreChoice[],
  currentCatalogue: readonly ICoreKpiCatalogueItem[]
): ICoreSavePreflightIssue[] => choices.reduce((issues, choice) => {
  const current = currentCatalogue.find(item => item.kpiId === choice.kpiId);
  if (!current) {
    issues.push({ kpiId: choice.kpiId, reason: 'CURRENT_CATALOGUE_RECORD_MISSING' });
  } else if (choice.roleEvidence === 'UnsupportedStoredRole' && !choice.role) {
    issues.push({ kpiId: choice.kpiId, name: current.wording, reason: 'UNSUPPORTED_STORED_ROLE' });
  } else if (!choice.role) {
    issues.push({ kpiId: choice.kpiId, name: current.wording, reason: 'ROLE_NOT_SELECTED' });
  } else if (!roleToService(choice)) {
    issues.push({ kpiId: choice.kpiId, name: current.wording, reason: 'UNSUPPORTED_STORED_ROLE' });
  }
  return issues;
}, [] as ICoreSavePreflightIssue[]);

const coreSaveIssueText = (issue: ICoreSavePreflightIssue): string => {
  const subject = issue.name ? `${issue.kpiId} — ${issue.name}` : issue.kpiId;
  if (issue.reason === 'ROLE_NOT_SELECTED') return `${subject}: choose how you contribute before saving.`;
  if (issue.reason === 'UNSUPPORTED_STORED_ROLE') return `${subject}: this Workplan role is no longer supported. Contact KPI support before changing it.`;
  return `${subject}: cannot be matched exactly to the current approved Core KPI catalogue. The cause may be stale selection data or unavailable current catalogue data; contact KPI support.`;
};
const numeric = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
};
const targetText = (numberValue: number | undefined, text: string | undefined): string => numberValue !== undefined ? String(numberValue) : text || '';
const optionETargetValue = (value: string | undefined): OptionETargetValue | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const trimmed = value.trim();
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return value;
};
const optionETargetText = (value: OptionETargetValue | undefined): string => value === undefined ? '' : String(value);

/** Unchanged editor text retains the saved scalar type/bytes; actual edits use the existing parser. */
const retainedOptionETargetValue = (text: string | undefined,
  retained: ICoreChoice['optionEDraftTargetValues'], period: 'annual' | 'q1' | 'q2' | 'q3' | 'q4'): OptionETargetValue | undefined =>
  retained && text === optionETargetText(retained[period]) ? retained[period] : optionETargetValue(text);
const optionEBehaviourRoleCode = (roleTier: string | undefined): 'L1' | 'L2' | 'L3' | undefined =>
  roleTier === 'IC_OFFICER' ? 'L1' : roleTier === 'PEOPLE_MANAGER' ? 'L2'
    : roleTier === 'SENIOR_LEADER' ? 'L3' : undefined;

const unrepresentedCoreDraftFields = ['sharedTargetRule', 'sharedApportionmentPercent', 'governanceReference',
  'denominatorNumerator', 'denominatorValue', 'denominatorUnit', 'denominatorRuleReference',
  'denominatorSourceReference', 'roleEvidence'] as const;
type ICoreDraftContributionRules = Pick<ICoreChoice, typeof unrepresentedCoreDraftFields[number]>;
export interface IIntegratedCoreWorkplanItem extends ICoreWorkplanItem {
  /** Native readback evidence stays separate when the private Draft replaces editor choices. Never a wire field. */
  optionERetainedContributionRules?: Readonly<ICoreDraftContributionRules>;
}
const hasUnrepresentedCoreDraftRules = (rules: ICoreDraftContributionRules | undefined): boolean =>
  !!rules && unrepresentedCoreDraftFields.some(field => rules[field] !== undefined);

export interface IIntegratedOptionEDraftSource {
  core: readonly ICoreChoice[];
  personal: readonly IPersonalChoice[];
  behaviours: readonly IBehaviourChoice[];
  coreItems: readonly IIntegratedCoreWorkplanItem[];
  catalogue: readonly ICoreKpiCatalogueItem[];
  objectives: readonly IBehaviourObjectiveLibraryRecord[];
  coreWeightingMode: WeightMode;
  behaviourRoleTier?: string;
  governedBehaviourExtension?: IOptionEGovernedBehaviourExtension;
  /** Retained source values must not be silently omitted by the closed Draft/Submit contract. */
  retainedPersonalItems?: readonly IPersonalWorkplanItem[];
  overallDeliveryWeightConfiguration?: IAnnualWorkplan['overallDeliveryWeightConfiguration'];
}

/** Builds only employee-owned aggregate content. Authenticated employee/manager identity is never projected. */
export const buildIntegratedOptionEDraft = (source: IIntegratedOptionEDraftSource): IOptionEWorkplanDraftAggregate => {
  if (source.core.some(hasUnrepresentedCoreDraftRules)
    || source.coreItems.some(item => hasUnrepresentedCoreDraftRules(item.optionERetainedContributionRules))) {
    throw new Error('Saving this Workplan is unavailable until its saved Core contribution rules can be retained. Your changes remain in this session.');
  }
  if (source.overallDeliveryWeightConfiguration !== undefined
    || source.personal.some(item => item.classification !== undefined || item.original?.impactClassification !== undefined)
    || source.retainedPersonalItems?.some(item => item.impactClassification !== undefined)) {
    throw new Error('Saving this Workplan is unavailable until its saved Impact classification and Delivery configuration can be retained. Your changes remain in this session.');
  }
  // The closed Draft has no Impact-weight field. Its editor default is zero;
  // explicitly captured native zero is still source evidence, not an unset value.
  if (source.personal.some(item => item.weight !== 0 || item.original?.personalItemWeight !== undefined)
    || source.retainedPersonalItems?.some(item => item.personalItemWeight !== undefined)) {
    throw new Error('Saving this Workplan is unavailable until its Impact weights can be retained. Your changes remain in this session.');
  }
  return {
  schemaVersion: OPTION_E_DRAFT_SCHEMA_VERSION,
  core: {
    weightingMode: source.coreWeightingMode,
    entries: source.core.map(choice => {
      const catalogue = source.catalogue.find(item => item.kpiId === choice.kpiId);
      const existing = source.coreItems.find(item => item.kpiId === choice.kpiId);
      return {
        coreId: choice.optionEDraftCoreId || existing?.workplanItemKey || `CORE|${choice.kpiId}`,
        kpiId: choice.kpiId,
        kpiVersionKey: choice.optionEDraftKpiVersionKey || catalogue?.kpiVersionKey || existing?.kpiVersionKey || '',
        targetVersionKey: choice.optionEDraftTargetVersionKey || catalogue?.targetVersionKey || existing?.targetVersionKey || '',
        role: choice.role || ('' as IOptionEWorkplanDraftAggregate['core']['entries'][number]['role']),
        contributionMethod: (choice.contributionMethod || '') as OptionEContributionMethod,
        weightPercent: choice.weight,
        annual: { value: retainedOptionETargetValue(choice.annualContribution, choice.optionEDraftTargetValues, 'annual'), success: choice.annualSuccess },
        q1: { value: retainedOptionETargetValue(choice.q1, choice.optionEDraftTargetValues, 'q1'), success: choice.q1Success },
        q2: { value: retainedOptionETargetValue(choice.q2, choice.optionEDraftTargetValues, 'q2'), success: choice.q2Success },
        q3: { value: retainedOptionETargetValue(choice.q3, choice.optionEDraftTargetValues, 'q3'), success: choice.q3Success },
        q4: { value: retainedOptionETargetValue(choice.q4, choice.optionEDraftTargetValues, 'q4'), success: choice.q4Success }
      };
    })
  },
  impact: source.personal.map(item => ({
    impactId: item.key, wording: item.wording, measure: item.measure, unit: item.unit,
    annual: retainedOptionETargetValue(item.annual, item.optionEDraftTargetValues, 'annual'), q1: retainedOptionETargetValue(item.q1, item.optionEDraftTargetValues, 'q1'), q2: retainedOptionETargetValue(item.q2, item.optionEDraftTargetValues, 'q2'),
    q3: retainedOptionETargetValue(item.q3, item.optionEDraftTargetValues, 'q3'), q4: retainedOptionETargetValue(item.q4, item.optionEDraftTargetValues, 'q4'), success: item.success
  })),
  behaviours: {
    frameworkVersion: OPTION_E_BEHAVIOUR_FRAMEWORK_VERSION,
    roleTier: source.behaviourRoleTier || '',
    entries: source.behaviours.map(choice => {
      const guidancePromptKeys = source.objectives.filter(item => item.behaviourKey === choice.behaviourId && item.active)
        .sort((left, right) => left.sortOrder - right.sortOrder).map(item => item.behaviourObjectiveKey);
      return {
        valueId: choice.behaviourId as IOptionEWorkplanDraftAggregate['behaviours']['entries'][number]['valueId'],
        descriptorKey: choice.optionEDraftDescriptorKey
          || `${OPTION_E_BEHAVIOUR_FRAMEWORK_VERSION}|${source.behaviourRoleTier || ''}|${choice.behaviourId}`,
        guidancePromptKeys: choice.optionEDraftGuidancePromptKeys || guidancePromptKeys,
        selectedPromptKeys: [...(source.governedBehaviourExtension && choice.optionEDraftLegacySelectedPromptKeys
          ? choice.optionEDraftLegacySelectedPromptKeys : choice.selectedSuggestionKeys)], commitment: choice.commitment,
        periodCommitments: { Q1: choice.q1, Q2: choice.q2, Q3: choice.q3, Q4: choice.q4 }
      };
    }),
    governedExtension: source.governedBehaviourExtension
  }
  };
};

export const readIntegratedOptionEDraft = (aggregate: IOptionEWorkplanDraftAggregate): {
  core: ICoreChoice[]; personal: IPersonalChoice[]; behaviours: IBehaviourChoice[]; weightingMode: WeightMode;
} => ({
  weightingMode: aggregate.core.weightingMode,
  core: aggregate.core.entries.map(item => ({
    kpiId: item.kpiId, role: item.role, contributionMethod: item.contributionMethod as EmployeeContributionMethodV2,
    optionEDraftCoreId: item.coreId, optionEDraftKpiVersionKey: item.kpiVersionKey,
    optionEDraftTargetVersionKey: item.targetVersionKey,
    optionEDraftTargetValues: { annual: item.annual.value, q1: item.q1.value, q2: item.q2.value, q3: item.q3.value, q4: item.q4.value },
    annualSuccess: item.annual.success,
    weight: item.weightPercent, annualContribution: optionETargetText(item.annual.value),
    q1: optionETargetText(item.q1.value), q2: optionETargetText(item.q2.value),
    q3: optionETargetText(item.q3.value), q4: optionETargetText(item.q4.value),
    q1Success: item.q1.success, q2Success: item.q2.success, q3Success: item.q3.success, q4Success: item.q4.success
  })),
  personal: aggregate.impact.map(item => ({
    key: item.impactId, wording: item.wording, measure: item.measure as ImpactEditorMeasure, unit: item.unit,
    optionEDraftTargetValues: { annual: item.annual, q1: item.q1, q2: item.q2, q3: item.q3, q4: item.q4 },
    annual: optionETargetText(item.annual), q1: optionETargetText(item.q1), q2: optionETargetText(item.q2),
    q3: optionETargetText(item.q3), q4: optionETargetText(item.q4), success: item.success, weight: 0
  })),
  behaviours: aggregate.behaviours.entries.map(item => {
    const governed = aggregate.behaviours.governedExtension?.headlines
      .find(headline => headline.behaviourKey === item.valueId);
    const governedSelections = governed?.selections || [];
    return ({
    behaviourId: item.valueId,
    selectedSuggestionKeys: governedSelections.length
      ? governedSelections.filter(selection => selection.source === 'Catalogue').map(selection => selection.selectionKey)
      : [...item.selectedPromptKeys],
    commitment: item.commitment,
    selections: governedSelections.length ? governedSelections.map(selection => ({
      source: selection.source, selectionKey: selection.selectionKey,
      commitment: selection.myCommitment, howWillWeKnow: selection.howWillWeKnow,
      focusKey: selection.focusKey, focusTitle: selection.focusTitle
    })) : undefined,
    storedSelectionSnapshots: governedSelections.length ? {
      schemaVersion: 'kcf.behaviour.v02.selections.v1', frameworkVersion: 'KCCC-BEHAVIOUR|v02',
      valueId: item.valueId,
      selections: governedSelections.map(selection => selection.source === 'Catalogue' ? {
        source: 'Catalogue' as const, selectionKey: selection.selectionKey,
        catalogueKey: selection.catalogueId, catalogueVersion: selection.catalogueVersion,
        catalogueRevision: selection.catalogueRevision, targetKey: selection.targetKey!, focusKey: selection.focusKey,
        behaviourKey: selection.behaviourKey, roleLevelCode: selection.roleLevelCode,
        focusArea: selection.focusTitle, selectedExampleText: selection.selectedWording,
        commitment: selection.myCommitment, howWillWeKnow: selection.howWillWeKnow
      } : {
        source: 'Own' as const, selectionKey: selection.selectionKey, behaviourKey: selection.behaviourKey,
        commitment: selection.myCommitment, howWillWeKnow: selection.howWillWeKnow
      })
    } : undefined,
    optionEGovernedSnapshots: governedSelections.length ? governedSelections.map(selection => ({ ...selection })) : undefined,
    q1: item.periodCommitments.Q1, q2: item.periodCommitments.Q2,
    q3: item.periodCommitments.Q3, q4: item.periodCommitments.Q4, h1: '', h2: '',
    frameworkVersion: aggregate.behaviours.frameworkVersion, roleTier: aggregate.behaviours.roleTier,
    optionEDraftLegacySelectedPromptKeys: aggregate.behaviours.governedExtension ? [...item.selectedPromptKeys] : undefined,
    optionEDraftDescriptorKey: item.descriptorKey,
    optionEDraftGuidancePromptKeys: [...item.guidancePromptKeys]
  }); })
});
const legacyCoreItem = (item: IEmployeeCoreContributionReadbackV2): IIntegratedCoreWorkplanItem => ({
  id: item.id, etag: item.etag, workplanItemKey: item.workplanItemKey, naturalKey: item.naturalKey,
  workplanKey: item.workplanKey, personKey: item.personKey, performanceYear: item.performanceYear,
  kpiId: item.kpiId, kpiVersionKey: item.kpiVersionKey, targetVersionKey: item.targetVersionKey,
  coreWorkplanWeight: item.coreWorkplanWeight, employeeKpiRole: item.employeeKpiRole,
  displayOrder: item.displayOrder, activeInWorkplan: item.activeInWorkplan,
  optionERetainedContributionRules: Object.freeze({
    sharedTargetRule: item.sharedTargetRule, sharedApportionmentPercent: item.sharedApportionmentPercent,
    governanceReference: item.governanceReference, denominatorNumerator: item.denominatorNumerator,
    denominatorValue: item.denominatorValue, denominatorUnit: item.denominatorUnit,
    denominatorRuleReference: item.denominatorRuleReference, denominatorSourceReference: item.denominatorSourceReference,
    roleEvidence: item.employeeKpiRole && !roleToChoice(item.employeeKpiRole) ? 'UnsupportedStoredRole' : undefined
  })
});
const quarterContributionText = (item: IEmployeeCoreContributionReadbackV2, quarter: Quarter): string => {
  const target = item.quarterTargets.find(candidate => candidate.quarter === quarter);
  return target ? targetText(target.targetValue, target.commitment || target.targetText) : '';
};
const quarterSuccessText = (item: IEmployeeCoreContributionReadbackV2, quarter: Quarter): string =>
  item.quarterTargets.find(candidate => candidate.quarter === quarter)?.successDefinition || '';

export type IntegratedExperienceState = 'loading' | 'empty' | 'denied' | 'failed';

export interface IIntegratedExperienceStateProps {
  state: IntegratedExperienceState;
  title: string;
  message: string;
  nextStep: string;
  actionLabel?: string;
  onAction?(): void;
}

export const IntegratedExperienceStatePanel: React.FC<IIntegratedExperienceStateProps> = ({
  state, title, message, nextStep, actionLabel, onAction
}) => <section className={styles.statePanel} data-experience-state={state} role={state === 'failed' || state === 'denied' ? 'alert' : 'status'} aria-busy={state === 'loading' || undefined}>
  <strong>{title}</strong>
  <span>{message}</span>
  <span><strong>Next step:</strong> {nextStep}</span>
  {actionLabel && onAction && <button type="button" onClick={onAction}>{actionLabel}</button>}
</section>;

export const IntegratedScreenGuidance: React.FC<IContextualHelpProps> = props =>
  <ContextualHelp {...props} className={styles.integratedHelp} />;

export const ResponsiveTableRegion: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) =>
  <div className={styles.tableWrap} role="region" aria-label={label} tabIndex={0}>
    <p className={styles.tableHint}>On a phone, swipe within this table to see every column. The page itself stays fixed.</p>
    {children}
  </div>;

const governedTerms = [
  'Core — KCF strategic priorities.',
  'Impact — your measurable role contribution.',
  'Behaviours — how you work and demonstrate KCF values.',
  'Overall Delivery — the combined delivery result shown only when the governed calculation is available.'
];

const Loading: React.FC = () => <IntegratedExperienceStatePanel state="loading" title="Loading your Performance Hub…"
  message="Checking your Workplan and the areas available to your signed-in role."
  nextStep="Wait for the check to finish. Do not enter information until the page is ready." />;
const Empty: React.FC<{ title: string; message: string; nextStep: string }> = ({ title, message, nextStep }) =>
  <IntegratedExperienceStatePanel state="empty" title={title} message={message} nextStep={nextStep} />;

export type IntegratedComponentLayout = 'wide' | 'compact' | 'phone' | 'small-phone';

export const resolveIntegratedComponentLayout = (width: number): IntegratedComponentLayout => {
  if (width <= 360) return 'small-phone';
  if (width <= 600) return 'phone';
  if (width <= 1100) return 'compact';
  return 'wide';
};

export interface IIntegratedRenderedLayoutAudit {
  clientWidth: number;
  scrollWidth: number;
  horizontalOverflow: number;
  interactiveTargets: number;
  undersizedTargets: number;
}

export const auditIntegratedRenderedLayout = (root: HTMLElement): IIntegratedRenderedLayoutAudit => {
  const controls = Array.from(root.querySelectorAll<HTMLElement>('button, input, select, textarea, [role="button"]'))
    .map(control => control.getBoundingClientRect())
    .filter(rect => rect.width > 0 && rect.height > 0);
  return {
    clientWidth: root.clientWidth,
    scrollWidth: root.scrollWidth,
    horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
    interactiveTargets: controls.length,
    undersizedTargets: controls.filter(rect => rect.width < 44 || rect.height < 44).length
  };
};

export const IntegratedComponentFrame: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [layout, setLayout] = React.useState<IntegratedComponentLayout>('compact');

  React.useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const update = (width?: number): void => {
      const measured = width && width > 0 ? width : host.getBoundingClientRect().width;
      if (measured > 0) setLayout(resolveIntegratedComponentLayout(measured));
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(entries => update(entries[0]?.contentRect.width));
      observer.observe(host);
      return () => observer.disconnect();
    }
    const onResize = (): void => update();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return <div ref={hostRef} className={styles.componentHost} data-component-layout={layout}>{children}</div>;
};

export const CoreBuilder: React.FC<{
  kpis: IIntegratedKpi[]; selections: ICoreChoice[]; onChange(next: ICoreChoice[]): void; onEditField?(id: string, field: string, kpiId: string): void; createChoice?(kpiId: string): ICoreChoice;
  canonicalDraftAvailable?: boolean; sessionChanged?: boolean;
  saveIssues?: ICoreSavePreflightIssue[];
  correctionRequest?: { kpiId: string; sequence: number };
  onCorrectionRequestHandled?(request: { kpiId: string; sequence: number }): void;
  onReviewIssue?(kpiId: string): void;
}> = ({ kpis, selections, onChange, onEditField, createChoice, canonicalDraftAvailable = false, sessionChanged = false,
  saveIssues = [], correctionRequest, onCorrectionRequestHandled, onReviewIssue }) => {
  const [pillars, setPillars] = React.useState<string[]>([]);
  const [workstreams, setWorkstreams] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const [selectedSearch, setSelectedSearch] = React.useState('');
  const [editing, setEditing] = React.useState<string>();
  const [mobilePane, setMobilePane] = React.useState<'catalogue' | 'selected'>('catalogue');
  const correctionEditorRef = React.useRef<HTMLDivElement>(null);
  const handledCorrectionRequestRef = React.useRef<string>();
  const [focusCorrection, setFocusCorrection] = React.useState<string>();
  const pillarValues = Array.from(new Set(kpis.map(row => row.pillar))).sort();
  const workstreamKey = (row: IIntegratedKpi): string => `${row.pillar}|${row.workstream}`;
  const workstreamOptions = kpis.filter(row => !pillars.length || pillars.indexOf(row.pillar) >= 0)
    .map(row => ({ key: workstreamKey(row), pillar: row.pillar, workstream: row.workstream }))
    .filter((row, index, rows) => rows.findIndex(candidate => candidate.key === row.key) === index)
    .sort((left, right) => left.key.localeCompare(right.key));
  const workstreamValues = workstreamOptions.map(row => row.key);
  React.useEffect(() => setWorkstreams(values => values.filter(item => workstreamValues.indexOf(item) >= 0)), [pillars.join('|')]);
  React.useEffect(() => {
    if (!correctionRequest) return;
    const requestKey = `${correctionRequest.kpiId}|${correctionRequest.sequence}`;
    if (handledCorrectionRequestRef.current === requestKey) return;
    const represented = selections.some(item => item.kpiId === correctionRequest.kpiId)
      && kpis.some(item => item.kpiId === correctionRequest.kpiId);
    if (!represented) return;
    handledCorrectionRequestRef.current = requestKey;
    setSelectedSearch('');
    setMobilePane('selected');
    setEditing(correctionRequest.kpiId);
    setFocusCorrection(correctionRequest.kpiId);
    onCorrectionRequestHandled?.(correctionRequest);
  }, [correctionRequest, selections, kpis, onCorrectionRequestHandled]);
  React.useEffect(() => {
    if (focusCorrection && editing === focusCorrection && correctionEditorRef.current) {
      correctionEditorRef.current.focus();
      setFocusCorrection(undefined);
    }
  }, [editing, focusCorrection]);
  const selectedIds = new Set(selections.map(row => row.kpiId));
  const term = search.trim().toLowerCase();
  const available = kpis.filter(row => !selectedIds.has(row.kpiId)
    && (!pillars.length || pillars.indexOf(row.pillar) >= 0)
    && (!workstreams.length || workstreams.indexOf(workstreamKey(row)) >= 0)
    && (!term || [row.kpiId, row.wording, row.pillar, row.workstream].some(value => value.toLowerCase().indexOf(term) >= 0)));
  const selectedTerm = selectedSearch.trim().toLowerCase();
  const visibleSelected = selections.filter(choice => {
    const row = kpis.filter(item => item.kpiId === choice.kpiId)[0];
    return !selectedTerm || [choice.kpiId, row?.wording || '', row?.pillar || '', row?.workstream || '']
      .some(value => value.toLowerCase().indexOf(selectedTerm) >= 0);
  });
  const add = (row: IIntegratedKpi): void => {
    const next = [...selections, createChoice ? createChoice(row.kpiId) : { kpiId: row.kpiId, weight: 0 }];
    const weights = equalWeights(next.length);
    onChange(next.map((item, index) => ({ ...item, weight: weights[index] })));
    setEditing(undefined);
    setMobilePane('selected');
  };
  const update = (choice: ICoreChoice, patch: Partial<ICoreChoice>): void => {
    Object.keys(patch).forEach(field => onEditField?.(choice.optionEDraftCoreId || choice.kpiId, field, choice.kpiId));
    onChange(selections.map(item => item.kpiId === choice.kpiId ? { ...item, ...patch } : item));
  };
  const remove = (kpiId: string): void => {
    const next = selections.filter(item => item.kpiId !== kpiId);
    const weights = equalWeights(next.length);
    onChange(next.map((item, index) => ({ ...item, weight: weights[index] })));
  };
  const sessionMessage = canonicalDraftAvailable
    ? sessionChanged ? 'Unsaved session changes. Save from Review & Weight and wait for confirmation.' : 'Your saved Draft is loaded. There are no unsaved Core changes.'
    : sessionChanged ? 'Session only — not saved. Start My Workplan before saving or submitting.' : 'No saved Draft. You can explore the catalogue, but Save and Submit stay unavailable.';
  const firstIssue = saveIssues[0];
  const selectionLabel = formatCoreSelectionCount(selections.length);
  const firstIssueRepresented = Boolean(firstIssue && selections.some(item => item.kpiId === firstIssue.kpiId)
    && kpis.some(item => item.kpiId === firstIssue.kpiId));
  return <><IntegratedScreenGuidance
    heading="Core Guide"
    purpose="Choose the current Core KPIs that describe your contribution to KCF strategic priorities."
    actions={['Filter or search the catalogue, add the relevant Core KPIs, then open each selected KPI and choose your role.', 'Record your annual and quarterly contribution before moving to Review & Weight.']}
    fields={['My role explains whether you own, deliver, or support the KPI.', 'Annual and quarterly contribution fields describe your own commitment; they do not change the organisation target.', ...governedTerms]}
    next="Check every selected Core KPI, then continue to Impact KPIs, Behaviours and Review & Weight. Nothing is saved until Save Draft succeeds."
  />{saveIssues.length > 0 && <section className={styles.correctionAlert} role="alert" aria-labelledby="core-save-correction-heading">
    <h2 id="core-save-correction-heading">Core KPIs need attention before this Workplan can be saved</h2>
    <p>Nothing was saved by this attempt. Your current Workplan inputs remain in this session.</p>
    <ul>{saveIssues.map(issue => <li key={`${issue.kpiId}|${issue.reason}`}>{coreSaveIssueText(issue)}</li>)}</ul>
    {firstIssueRepresented && firstIssue && <button type="button" onClick={() => onReviewIssue?.(firstIssue.kpiId)}>Review {firstIssue.kpiId}</button>}
    {!firstIssueRepresented && firstIssue && <p><strong>{firstIssue.kpiId} cannot be opened in the current editor.</strong> It remains selected; contact KPI support to reconcile it without discarding your other inputs.</p>}
  </section>}<div className={styles.sessionStatus} role="status" data-session-changed={sessionChanged ? 'true' : 'false'}><strong>{sessionChanged ? 'Session changes' : canonicalDraftAvailable ? 'Saved Draft loaded' : 'Session-only planning'}</strong><span>{sessionMessage}</span></div><nav className={styles.mobilePaneTabs} aria-label="Core KPI panes"><button type="button" aria-pressed={mobilePane === 'catalogue'} onClick={() => setMobilePane('catalogue')}>Catalogue</button><button type="button" aria-pressed={mobilePane === 'selected'} onClick={() => setMobilePane('selected')}>{selectionLabel}</button></nav><div className={styles.builderColumns}>
    <section className={`${styles.cataloguePane} ${mobilePane === 'selected' ? styles.mobilePaneHidden : ''}`}>
      <header className={styles.sectionHeader}><div><span>Strategic Core catalogue</span><h2>Choose Core KPIs</h2></div><strong>{available.length} available</strong></header>
      <fieldset className={styles.filterGroup}><legend>Pillars</legend><div className={styles.chipGrid}>
        {pillarValues.map(pillar => <button type="button" key={pillar} data-pillar={kpis.filter(row => row.pillar === pillar)[0]?.pillarCode} aria-pressed={pillars.indexOf(pillar) >= 0}
          onClick={() => setPillars(values => values.indexOf(pillar) >= 0 ? values.filter(item => item !== pillar) : [...values, pillar])}>
          <strong>{kpis.filter(row => row.pillar === pillar)[0]?.pillarCode}</strong><span>{pillar.replace(/^SO\d+\s*[–-]\s*/, '')}</span></button>)}
      </div></fieldset>
      <fieldset className={styles.filterGroup}><legend>Workstreams</legend><div className={styles.checkGrid}>
        {workstreamOptions.map(option => <label key={option.key}><input type="checkbox" data-workstream-key={option.key} checked={workstreams.indexOf(option.key) >= 0}
          onChange={() => setWorkstreams(values => values.indexOf(option.key) >= 0 ? values.filter(item => item !== option.key) : [...values, option.key])} /><span>{option.workstream}<small>{option.pillar.replace(/\s*[–-].*$/, '')}</small></span></label>)}
      </div></fieldset>
      <div className={styles.searchRow}><label><span>Search</span><input type="search" value={search} onChange={event => setSearch(event.currentTarget.value)} placeholder="KPI ID or wording" /></label>
        <button type="button" disabled={!pillars.length && !workstreams.length && !search} onClick={() => { setPillars([]); setWorkstreams([]); setSearch(''); }}>Clear filters</button>
        <button type="button" onClick={() => { setPillars([]); setWorkstreams([]); setSearch(''); }}>Show all</button></div>
      <div className={styles.cardList} role="region" aria-label="Available Core KPI catalogue" tabIndex={0}>{available.map(row => <article className={styles.kpiCard} key={row.kpiId} data-kpi-id={row.kpiId}>
        <header><strong>{row.kpiId}</strong><button type="button" aria-label={`Add ${row.kpiId} to Workplan`} onClick={() => add(row)}>Add</button></header>
        <h3>{row.wording}</h3><p>{row.pillar}<br /><span>{row.workstream}</span></p>
        <dl><div><dt>Organisation target</dt><dd>{textValue(row.annualTarget, row.unit)}</dd></div>
          {row.quarterTargets.map(target => <div key={target.quarter}><dt>{target.quarter}</dt><dd>{textValue(target.value, row.unit)}</dd></div>)}</dl>
      </article>)}</div>
      {!available.length && <Empty title="No matching Core KPIs" message="The current filters or search returned no catalogue rows. Your selected Core KPIs are unchanged."
        nextStep="Clear or change the filters, or open the Selected list to continue with KPIs already chosen." />}
    </section>
    <aside className={`${styles.selectedPane} ${mobilePane === 'catalogue' ? styles.mobilePaneHidden : ''}`}>
      <header className={styles.sectionHeader}><div><span>My Workplan</span><h2>Selected Core</h2></div><strong>{selectionLabel}</strong></header>
      {firstIssueRepresented && firstIssue && <button type="button" className={styles.secondaryButton} onClick={() => onReviewIssue?.(firstIssue.kpiId)}>Review {firstIssue.kpiId}</button>}
      <label className={styles.fullSearch}><span>Search selected KPIs</span><input type="search" value={selectedSearch} onChange={event => setSelectedSearch(event.currentTarget.value)} /></label>
      {!selections.length && <Empty title="No Core KPIs selected" message="No current Core KPI has been added to this Workplan session."
        nextStep="Open Catalogue and use Add on each relevant Core KPI." />}
      {visibleSelected.map(choice => {
        const row = kpis.filter(item => item.kpiId === choice.kpiId)[0];
        if (!row) return null;
        const isEditing = editing === choice.kpiId;
        return <article className={styles.selectedCard} key={choice.kpiId} data-kpi-id={choice.kpiId}>
          <header><div><strong>{choice.kpiId}</strong><span>{choice.weight}%</span></div><button type="button" onClick={() => setEditing(isEditing ? undefined : choice.kpiId)}>{isEditing ? 'Done editing (not saved)' : 'Edit'}</button></header>
          <h3>{row.wording}</h3><p>{choice.role === 'Owner' ? 'I own this' : choice.role === 'Delivery' ? 'I deliver this' : choice.role === 'Support' ? 'I support / oversee this' : 'Choose your role'}</p>
          <dl className={styles.selectedTargetSummary} aria-label={`${choice.kpiId} measure and targets`}>
            <div><dt>Measure</dt><dd>{row.unit || 'Not available'}</dd></div>
            <div><dt>Annual target</dt><dd>{textValue(row.annualTarget, row.unit)}</dd></div>
            {row.quarterTargets.map(target => <div key={target.quarter}><dt>{target.quarter}</dt><dd>{textValue(target.value, row.unit)}</dd></div>)}
          </dl>
          {isEditing && <div className={styles.editor} ref={focusCorrection === choice.kpiId ? correctionEditorRef : undefined} tabIndex={-1} aria-label={`Edit ${choice.kpiId}`}>
            <fieldset><legend>My role</legend><div className={styles.roleChoices}>
              <button type="button" aria-pressed={choice.role === 'Owner'} onClick={() => update(choice, { role: 'Owner' })}>I OWN THIS</button>
              <button type="button" aria-pressed={choice.role === 'Delivery'} onClick={() => update(choice, { role: 'Delivery', ownerDirect: undefined })}>I DELIVER THIS</button>
              <button type="button" aria-pressed={choice.role === 'Support'} onClick={() => update(choice, { role: 'Support', ownerDirect: undefined })}>I SUPPORT / OVERSEE THIS</button>
            </div></fieldset>
            <label><span>How I contribute</span><select aria-label={`How I contribute to ${choice.kpiId}`}
              value={choice.contributionMethod || ''} onChange={event => update(choice, {
                contributionMethod: event.currentTarget.value as EmployeeContributionMethodV2 || undefined
              })}>
              <option value="">Choose a method</option><option value="AdditiveDirect">Additive direct</option>
              <option value="SharedTarget">Shared target</option><option value="WeightedDenominator">Weighted denominator</option>
              <option value="AccountableOwner">Accountable owner</option><option value="CompletionOversight">Completion oversight</option>
            </select></label>
            {choice.role === 'Owner' && <label className={styles.checkboxLine}><input type="checkbox" checked={choice.ownerDirect || false} onChange={event => update(choice, { ownerDirect: event.currentTarget.checked })} />I ALSO DIRECTLY CONTRIBUTE</label>}
            <label><span>My annual contribution</span><input value={choice.annualContribution || ''} onChange={event => update(choice, { annualContribution: event.currentTarget.value })} /></label>
            <div className={styles.quarterInputs}>{quarters.map(quarter => <label key={quarter}><span>{quarter}</span><input value={choice[quarter.toLowerCase() as 'q1'] || ''} onChange={event => update(choice, { [quarter.toLowerCase()]: event.currentTarget.value })} /></label>)}</div>
            {choice.role === 'Support' && <div className={styles.quarterInputs}>{quarters.map(quarter => <label key={`${quarter}-success`}><span>{quarter} — What 100% looks like</span><textarea rows={2} value={choice[`${quarter.toLowerCase()}Success` as 'q1Success'] || ''} onChange={event => update(choice, { [`${quarter.toLowerCase()}Success`]: event.currentTarget.value })} /></label>)}</div>}
            <button type="button" className={styles.dangerButton} onClick={() => remove(choice.kpiId)}>Remove from Workplan</button>
          </div>}
        </article>;
      })}
    </aside>
  </div></>;
};

export const PersonalBuilder: React.FC<{ items: IPersonalChoice[]; onChange(next: IPersonalChoice[]): void; onEditField?(id: string, field: string): void; reservedImpactIds?: readonly string[]; retainTargetText?: boolean }> = ({ items, onChange, onEditField, reservedImpactIds = [], retainTargetText = false }) => {
  const [editing, setEditing] = React.useState<string>();
  const add = (): void => {
    if (items.length >= 5) return;
    let suffix = items.length + 1;
    while (items.some(item => item.key === `personal-${suffix}`) || reservedImpactIds.includes(`personal-${suffix}`)) suffix += 1;
    const next = [...items, { key: `personal-${suffix}`, wording: '', measure: 'Number / Quantity' as ImpactEditorMeasure, unit: '', annual: '', q1: '', q2: '', q3: '', q4: '', success: '', weight: 0 }];
    const weights = equalWeights(next.length);
    onChange(next.map((item, index) => ({ ...item, weight: weights[index] })));
    setEditing(next[next.length - 1].key);
  };
  const patch = (key: string, value: Partial<IPersonalChoice>): void => { Object.keys(value).forEach(field => onEditField?.(key, field)); onChange(items.map(item => item.key === key ? { ...item, ...value } : item)); };
  return <section className={styles.singlePage}>
    <header className={styles.sectionHeader}><div><span>Measurable role contribution</span><h2>IMPACT KPIs</h2><p>Your measurable contribution through your role during this performance year.</p><p>CORE: strategic priorities. IMPACT: measurable role contribution. BEHAVIOURS: how you work and demonstrate values.</p></div><button type="button" disabled={items.length >= 5} onClick={add}>Create IMPACT KPI</button></header>
    <IntegratedScreenGuidance
      heading="Impact Guide"
      purpose="Define the measurable Impact outcomes that are specific to your role and separate from Core strategic priorities."
      actions={['Create an Impact KPI, describe the outcome and choose its measure.', 'Complete the annual and Q1–Q4 targets, then apply the change to this session.']}
      fields={['The Impact statement describes the outcome and annual success target.', 'Measure, unit and quarterly targets explain how progress will be evidenced.', ...governedTerms]}
      next="Continue to Behaviours, then use Review & Weight to check readiness and save the Draft."
    />
    <p>Changes stay in this session until you use Save Draft in Review &amp; Weight. Use one statement for your outcome, annual success target and deadline. Keep the structured annual and quarterly targets consistent with it. Previously saved descriptions are retained for reference.</p>
    {items.map(item => {
      const prefix = `impact-${encodeURIComponent(item.key)}`;
      const targetReason = impactTargetEditReason(item)?.replace('wording, description and weight can still be edited', 'wording and weight can still be edited');
      const help = (field: string, label: string, content: string): React.ReactElement => <ImpactFieldHelp id={`${prefix}-${field}-help`} label={label} content={IMPACT_HELP[content]} />;
      const fraction = item.original?.percentageSourceScale === 'Fraction';
      return <article className={styles.selectedCard} key={item.key}>
        <header><div><strong>{item.wording || 'New IMPACT KPI'}</strong><span>{item.weight}%</span></div><button type="button" onClick={() => setEditing(editing === item.key ? undefined : item.key)}>{editing === item.key ? 'Done editing (not saved)' : 'Edit'}</button></header>
        <p>{item.original?.measure || item.measure}{item.annual ? ` · Annual ${item.annual}${item.unit ? ` ${item.unit}` : ''}` : ''}</p>
        <ImpactClassificationFields id={prefix} classification={item.classification} disabled />
        {item.original?.description !== undefined && <div className={styles.impactField}><p><strong>Previously saved description / evidence</strong></p><p id={`${prefix}-legacy-description`} style={{ whiteSpace: 'pre-wrap' }}>{item.original.description}</p>{help('legacy-description', 'Previously saved description / evidence', 'success')}</div>}
        {item.original && <p>Saved measurement: {item.original.measure || item.measure || 'Not recorded'}. {scoringApproachLabel(item.original.scoringDirection)}. Existing calculation settings are retained and are not editable here.</p>}
        {editing === item.key && <div className={styles.editor}>
          <div className={styles.impactField}><label htmlFor={`${prefix}-wording`}>IMPACT KPI and annual success target</label><textarea id={`${prefix}-wording`} rows={3} required value={item.wording} onChange={event => patch(item.key, { wording: event.currentTarget.value })} />{help('wording', 'IMPACT KPI and annual success target', 'statement')}</div>
          <div className={styles.impactField}><label htmlFor={`${prefix}-measure`}>Measure type</label><select id={`${prefix}-measure`} disabled={Boolean(item.original)} value={item.measure} onChange={event => patch(item.key, { measure: event.currentTarget.value as ImpactEditorMeasure })}>{!item.measure && <option value="" disabled>Not selected</option>}<option>Number / Quantity</option><option>Percentage</option><option>Milestone / Completion</option></select>{item.original && <p>The saved measure type is retained. Type conversion needs the complete definition editor; other compatible edits remain available.</p>}{help('measure', 'Measure type', 'measure')}</div>
          {item.measure === 'Number / Quantity' && <div className={styles.impactField}><label htmlFor={`${prefix}-unit`}>Unit</label><input id={`${prefix}-unit`} value={item.unit} onChange={event => patch(item.key, { unit: event.currentTarget.value })} />{help('unit', 'Unit', 'unit')}</div>}
          {targetReason && <p id={`${prefix}-target-reason`} role="status">{targetReason}</p>}
          <div className={styles.impactField}><label htmlFor={`${prefix}-annual`}>Annual {item.measure === 'Milestone / Completion' ? 'commitment' : 'target'}</label><input id={`${prefix}-annual`} readOnly={Boolean(targetReason)} aria-describedby={targetReason ? `${prefix}-target-reason` : undefined} type={retainTargetText || targetReason || item.measure === 'Milestone / Completion' ? 'text' : 'number'} step="any" min={item.measure === 'Percentage' ? 0 : undefined} max={item.measure === 'Percentage' ? fraction ? 1 : 100 : undefined} value={item.annual} onChange={event => patch(item.key, { annual: event.currentTarget.value })} />{help('annual', 'Annual target', 'annual')}</div>
          <div className={styles.quarterInputs}>{quarters.map(quarter => <div className={styles.impactField} key={quarter}><label htmlFor={`${prefix}-${quarter}`}>{quarter} {item.measure === 'Milestone / Completion' ? 'commitment' : 'target'}</label><input id={`${prefix}-${quarter}`} readOnly={Boolean(targetReason)} aria-describedby={targetReason ? `${prefix}-target-reason` : undefined} type={retainTargetText || targetReason || item.measure === 'Milestone / Completion' ? 'text' : 'number'} step="any" min={item.measure === 'Percentage' ? 0 : undefined} max={item.measure === 'Percentage' ? fraction ? 1 : 100 : undefined} value={item[quarter.toLowerCase() as 'q1']} onChange={event => patch(item.key, { [quarter.toLowerCase()]: event.currentTarget.value })} />{help(quarter, `${quarter} target`, 'quarter')}</div>)}</div>
          <button type="button" className={styles.dangerButton} onClick={() => { const next = items.filter(row => row.key !== item.key); const weights = equalWeights(next.length); onChange(next.map((row, index) => ({ ...row, weight: weights[index] }))); }}>Remove</button>
        </div>}
      </article>;
    })}
    {!items.length && <Empty title="No Impact KPIs yet" message="No role-specific measurable commitment has been added to this Workplan session."
      nextStep="Use Create Impact KPI, complete its outcome and targets, then continue to Review & Weight." />}
  </section>;
};

export const BehaviourBuilder: React.FC<{
  choices: IBehaviourChoice[]; objectives: IBehaviourObjectiveLibraryRecord[]; person?: IProductionPerson;
  behaviourV2?: boolean;
  behaviourLibraryAsOf?: Date;
  focusCatalogue?: IBehaviourFrameworkV2Catalogue;
  onChange(next: IBehaviourChoice[]): void;
  onEditField?(id: string, field: string): void;
}> = ({ choices, objectives, person,
  behaviourV2 = person?.behaviourFrameworkVersionV2 === BEHAVIOUR_FRAMEWORK_V2_VERSION,
  behaviourLibraryAsOf, focusCatalogue, onChange, onEditField }) => {
  const [editing, setEditing] = React.useState<string>();
  const [selectionMessage, setSelectionMessage] = React.useState('');
  const patch = (behaviourId: string, value: Partial<IBehaviourChoice>): void => { Object.keys(value).forEach(field => onEditField?.(behaviourId, field)); onChange(choices.map(item => item.behaviourId === behaviourId ? { ...item, ...value } : item)); };
  if (behaviourV2) {
    const roleLevelCode = person?.behaviourRoleTierV2 === 'IC_OFFICER' ? 'L1'
      : person?.behaviourRoleTierV2 === 'PEOPLE_MANAGER' ? 'L2'
        : person?.behaviourRoleTierV2 === 'SENIOR_LEADER' ? 'L3' : undefined;
    if (!focusCatalogue || !roleLevelCode || person?.behaviourFrameworkVersionV2 !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || !person.behaviourCadenceV2) {
      return <section className={styles.singlePage} role="alert" data-behaviour-v2-unavailable="true">
        <h2>Behaviour commitments unavailable</h2>
        <p>The governed catalogue publication and exact role assignment must be read before a v02 selection can be edited.</p>
      </section>;
    }
    const storedByKey = new Map(choices.flatMap(choice => choice.storedSelectionSnapshots?.selections || [])
      .map(selection => [selection.selectionKey, selection]));
    const views: IBehaviourFocusTargetSelection[] = choices.flatMap(choice => (choice.selections || []).map(selection => {
      const stored = storedByKey.get(selection.selectionKey);
      const governed = choice.optionEGovernedSnapshots?.find(snapshot => snapshot.selectionKey === selection.selectionKey);
      const row = focusCatalogue.rows.find(candidate => candidate.targetKey === selection.selectionKey);
      return { selectionKey: selection.selectionKey, source: selection.source,
        catalogueKey: stored?.source === 'Catalogue' ? stored.catalogueKey : focusCatalogue.catalogueKey,
        catalogueVersion: stored?.source === 'Catalogue' ? stored.catalogueVersion
          : selection.source === 'Own' ? 'OWN' : focusCatalogue.catalogueVersion,
        targetKey: selection.source === 'Catalogue' ? selection.selectionKey : undefined,
        behaviourKey: choice.behaviourId as BehaviourKey, roleLevelCode,
        focusArea: stored?.source === 'Catalogue' ? stored.focusArea
          : governed?.focusTitle || selection.focusTitle || row?.focusArea || 'MY COMMITMENT',
        selectedExampleText: stored?.source === 'Catalogue' ? stored.selectedExampleText : row?.suggestedTarget,
        commitment: selection.commitment, howWillWeKnow: selection.howWillWeKnow };
    }));
    const updateSelection = (selectionKey: string, update: (current: NonNullable<IBehaviourChoice['selections']>[number]) =>
      NonNullable<IBehaviourChoice['selections']>[number]): void => {
      onChange(choices.map(choice => ({ ...choice,
        selections: choice.selections?.map(row => row.selectionKey === selectionKey ? update(row) : row) })));
    };
    const cadence = person.behaviourCadenceV2;
    const periods = cadence === 'Quarterly' ? ['Q1', 'Q2', 'Q3', 'Q4'] as const : ['H1', 'H2'] as const;
    return <section className={styles.singlePage}>
      <IntegratedScreenGuidance heading="Behaviour Guide" purpose="Choose governed Behaviour focus areas and describe your own commitments." actions={['Review the five headline Behaviours and their focus areas.', 'Choose relevant approved examples or write your own commitment in the governed focus area.']} fields={['MY COMMITMENT states what you will do.', 'HOW WILL WE KNOW records observable evidence.']} next="Complete annual and period commitments, then review readiness before saving the Draft." />
      <BehaviourFrameworkV2Panel catalogue={focusCatalogue} roleLevelCode={roleLevelCode}
        audience="Employee" view="Draft" selections={views} asOf={behaviourLibraryAsOf}
        onToggleCatalogueTarget={targetKey => {
          const row = getBehaviourFrameworkV2Choices(focusCatalogue, roleLevelCode, undefined,
            behaviourLibraryAsOf).find(candidate => candidate.targetKey === targetKey);
          if (!row) { setSelectionMessage('This example is no longer available for a new selection.'); return; }
          const choice = choices.find(item => item.behaviourId === row.behaviourKey);
          if (!choice) return;
          const existing = choice.selections || [];
          if (existing.some(item => item.selectionKey === targetKey)
            && choice.storedSelectionSnapshots?.selections.some(item => item.selectionKey === targetKey)) {
            setSelectionMessage('A saved selection keeps its original wording and identity.'); return;
          }
          const selections = existing.some(item => item.selectionKey === targetKey)
            ? existing.filter(item => item.selectionKey !== targetKey)
            : [...existing, { source: 'Catalogue' as const, selectionKey: targetKey,
              commitment: '', howWillWeKnow: '' }];
          patch(choice.behaviourId, { selections,
            selectedSuggestionKeys: selections.filter(item => item.source === 'Catalogue')
              .map(item => item.selectionKey) });
          setSelectionMessage('');
        }}
        onAddOwnTarget={(behaviourKey, focusKey, focusTitle) => {
          const choice = choices.find(item => item.behaviourId === behaviourKey);
          if (!choice) return;
          const key = `${behaviourKey}-OWN-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
          patch(behaviourKey, { selections: [...choice.selections || [], {
            source: 'Own', selectionKey: key, focusKey, focusTitle, commitment: '', howWillWeKnow: '' }] });
        }}
        onCommitmentChange={(selectionKey, field, value) => updateSelection(selectionKey,
          row => ({ ...row, [field]: value }))} />
      {selectionMessage && <p role="status" className={styles.notice}>{selectionMessage}</p>}
      {choices.map(choice => <article key={choice.behaviourId} className={styles.behaviourCard}>
        <h3>{choice.valueTitle || choice.behaviourId} · annual and {cadence} commitments</h3>
        <div className={styles.quarterInputs} data-behaviour-planning={choice.behaviourId}>
          <label><span>Current Level</span><select value={choice.planningLevels?.currentLevel || ''}
            onChange={event => {
              const currentLevel = event.currentTarget.value as IBehaviourPlanningLevelsV1['currentLevel'] | '';
              patch(choice.behaviourId, { planningLevels: currentLevel ? {
                contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION, currentLevel,
                targetLevel: suggestedBehaviourTargetLevel(currentLevel)
              } : undefined });
            }}>
            <option value="">Not entered</option><option value="Developing">Developing</option>
            <option value="Effective">Effective</option><option value="Exceptional">Exceptional</option>
          </select></label>
          <label><span>Target Level</span><select value={choice.planningLevels?.targetLevel || ''}
            disabled={!choice.planningLevels?.currentLevel} onChange={event => patch(choice.behaviourId, {
              planningLevels: { contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
                currentLevel: choice.planningLevels?.currentLevel,
                targetLevel: event.currentTarget.value as IBehaviourPlanningLevelsV1['targetLevel'] || undefined }
            })}>
            <option value="">Not entered</option>{(['Developing', 'Effective', 'Exceptional'] as const)
              .filter(level => ['Developing', 'Effective', 'Exceptional'].indexOf(level)
                >= ['Developing', 'Effective', 'Exceptional'].indexOf(choice.planningLevels?.currentLevel || ''))
              .map(level => <option key={level} value={level}>{level}</option>)}
          </select></label>
        </div>
        {choice.planningLevels?.targetLevel
          && choice.planningLevels.targetLevel !== suggestedBehaviourTargetLevel(choice.planningLevels.currentLevel)
          && <label><span>Target Level justification (required for this choice)</span><textarea rows={2}
            value={choice.planningLevels.targetJustification || ''}
            onChange={event => patch(choice.behaviourId, { planningLevels: {
              ...choice.planningLevels!, targetJustification: event.currentTarget.value
            } })} /></label>}
        <p>Levels are categorical planning labels. An empty Current Level remains empty; assessment scores are separate.</p>
        <label><span>Annual commitment</span><textarea rows={2} value={choice.commitment}
          onChange={event => patch(choice.behaviourId, { commitment: event.currentTarget.value })} /></label>
        <div className={styles.quarterInputs}>{periods.map(period => <label key={period}>
          <span>{period} commitment</span><textarea rows={2}
            value={choice[period.toLowerCase() as 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2']}
            onChange={event => patch(choice.behaviourId, { [period.toLowerCase()]: event.currentTarget.value })} />
        </label>)}</div>
      </article>)}
    </section>;
  }
  if (!behaviourV2) {
    return <section className={styles.singlePage}>
      <header className={styles.sectionHeader}><div><span>KCF Behaviour framework</span><h2>Behaviours</h2><p>Select one or more controlled suggestions, add your own wording if useful, and agree quarterly commitments.</p></div><strong>{choices.filter(item => behaviourSelectionIsComplete(item.selectedSuggestionKeys, item.customObjective || '')).length} of 5 configured</strong></header>
      <IntegratedScreenGuidance heading="Behaviour Guide" purpose="Describe how you will demonstrate the five governed Behaviours." actions={['Read each card’s focus cues, then open it to see the full approved prompts.', 'Choose a controlled suggestion or add your own wording and quarterly commitments.']} fields={['Focus cues summarise the approved prompts; the full prompts remain the governed wording.']} next="Review all five Behaviours, then continue to Review & Weight before saving." />
      {EMPLOYEE_V2_APPROVED_BEHAVIOURS.map(definition => {
        const choice = choices.filter(item => item.behaviourId === definition.behaviourId)[0];
        const suggestions = behaviourLibraryAsOf
          ? getLocalBehaviourLibrarySuggestions(objectives, definition.behaviourId as BehaviourKey, behaviourLibraryAsOf)
          : getEmployeeBehaviourSuggestions(objectives, definition.behaviourId as BehaviourKey);
        const isEditing = editing === definition.behaviourId;
        const summary = choice ? [...choice.selectedSuggestionKeys.map(key => suggestions.find(item => item.behaviourObjectiveKey === key)?.objectiveTitle).filter(Boolean), (choice.customObjective || '').trim()].filter(Boolean).join('; ') : '';
        return <article className={styles.behaviourCard} key={definition.behaviourId} data-behaviour-v1-value={definition.behaviourId}>
          <header><div><span>{definition.corporateValue}</span><h3>{definition.title}</h3><ul className={styles.behaviourCues} aria-label={`${definition.title} focus cues`}>{behaviourFocusCues[definition.behaviourId].map(cue => <li key={cue}>{cue}</li>)}</ul><p>{summary || 'No suggestion or custom wording selected'}</p></div><button type="button" onClick={() => setEditing(isEditing ? undefined : definition.behaviourId)}>{isEditing ? 'Done editing (not saved)' : 'Choose & configure'}</button></header>
          {isEditing && choice && <div className={styles.editor}>
            <fieldset><legend>Approved prompts</legend><ul className={styles.promptList}>{definition.prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul></fieldset>
            {behaviourLibraryAsOf ? <BehaviourLibrarySelector behaviourKey={definition.behaviourId as BehaviourKey}
              library={objectives} selectedKeys={choice.selectedSuggestionKeys} asOf={behaviourLibraryAsOf}
              copiedContent={<><p>{choice.objectiveDescription}</p><p>{choice.measure}</p><p>{choice.unit}</p><p>{choice.evidenceDefinition}</p></>}
              onToggle={key => {
                const selectedSuggestionKeys = choice.selectedSuggestionKeys.indexOf(key) >= 0
                  ? choice.selectedSuggestionKeys.filter(value => value !== key)
                  : [...choice.selectedSuggestionKeys, key];
                const primarySuggestionKey = choosePrimaryBehaviourSuggestion(selectedSuggestionKeys, choice.primarySuggestionKey);
                const source = suggestions.find(item => item.behaviourObjectiveKey === primarySuggestionKey);
                patch(choice.behaviourId, { selectedSuggestionKeys, primarySuggestionKey,
                  objectiveDescription: source?.objectiveDescription || choice.objectiveDescription,
                  measure: source?.suggestedMeasure || choice.measure, unit: source?.suggestedUnit || choice.unit,
                  evidenceDefinition: source?.suggestedEvidence || choice.evidenceDefinition });
              }} /> : <fieldset><legend>Controlled suggestions — choose one or more</legend><div className={styles.suggestionGrid}>{suggestions.map(item => <label className={styles.suggestionCard} key={item.behaviourObjectiveKey}><input type="checkbox" data-behaviour-suggestion={item.behaviourObjectiveKey} checked={choice.selectedSuggestionKeys.indexOf(item.behaviourObjectiveKey) >= 0} onChange={() => {
              const selectedSuggestionKeys = choice.selectedSuggestionKeys.indexOf(item.behaviourObjectiveKey) >= 0
                ? choice.selectedSuggestionKeys.filter(key => key !== item.behaviourObjectiveKey)
                : [...choice.selectedSuggestionKeys, item.behaviourObjectiveKey];
              patch(choice.behaviourId, { selectedSuggestionKeys,
                primarySuggestionKey: choosePrimaryBehaviourSuggestion(selectedSuggestionKeys, choice.primarySuggestionKey) });
            }} /><span><strong>{item.behaviourObjectiveKey.replace(`${definition.behaviourId}-`, '')}</strong>{item.objectiveTitle}<small>{item.objectiveDescription}</small></span></label>)}</div></fieldset>}
            <label><span>My additional or alternative wording</span><textarea rows={3} data-behaviour-custom={choice.behaviourId} value={choice.customObjective || ''} onChange={event => patch(choice.behaviourId, { customObjective: event.currentTarget.value })} placeholder="Optional when a controlled suggestion is selected; required if none is selected." /></label>
            <div className={styles.quarterInputs}>{quarters.map(quarter => <label key={quarter}><span>{quarter} commitment</span><textarea rows={2} value={choice[quarter.toLowerCase() as 'q1' | 'q2' | 'q3' | 'q4']} onChange={event => patch(choice.behaviourId, { [quarter.toLowerCase()]: event.currentTarget.value })} /></label>)}</div>
            <label><span>Target rating</span><select data-behaviour-rating={choice.behaviourId} value={choice.targetRating || 3} onChange={event => patch(choice.behaviourId, { targetRating: Number(event.currentTarget.value) as BehaviourRating })}><option value="1">1 — Not demonstrated / insufficient evidence</option><option value="2">2 — Developing</option><option value="3">3 — Meets expectations</option><option value="4">4 — Exceeds expectations</option></select></label>
          </div>}
        </article>;
      })}
    </section>;
  }
  const cadence = person?.behaviourCadenceV2 || 'Quarterly';
  const periods = cadence === 'Quarterly' ? ['Q1', 'Q2', 'Q3', 'Q4'] as const : ['H1', 'H2'] as const;
  const configured = (choice: IBehaviourChoice): boolean => Boolean(choice.commitment.trim())
    && periods.every(period => Boolean(choice[period.toLowerCase() as 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2'].trim()));
  return <section className={styles.singlePage}>
    <header className={styles.sectionHeader}><div><span>KCCC-BEHAVIOUR|v02 · {cadence}</span><h2>Behaviours</h2><p>Agree a commitment for each of the five KCCC Values. Assessments are label-first: 1 Developing · 2 Effective · 3 Exceptional. Effective is guidance for the role, not a target.</p></div><strong>{choices.filter(configured).length} of 5 configured</strong></header>
    {(!person?.behaviourRoleTierV2 || person.behaviourFrameworkVersionV2 !== BEHAVIOUR_FRAMEWORK_V2_VERSION
      || !person.behaviourCadenceV2) && <div className={styles.persistenceWarning} role="alert"><strong>Governed Behaviour assignment unavailable.</strong><span>Saving is blocked until an explicit v02 role tier and cadence assignment is configured.</span></div>}
    {EMPLOYEE_V2_APPROVED_BEHAVIOURS.map(definition => {
      const choice = choices.filter(item => item.behaviourId === definition.behaviourId)[0];
      const suggestions = getEmployeeBehaviourV2Suggestions(objectives, definition.behaviourId as BehaviourKey, {
        frameworkVersion: person?.behaviourFrameworkVersionV2,
        roleTier: person?.behaviourRoleTierV2
      }, behaviourLibraryAsOf);
      const unavailableSuggestionKeys = choice
        ? getUnavailableEmployeeBehaviourV2SelectionKeys(choice.selectedSuggestionKeys, suggestions) : [];
      const isEditing = editing === definition.behaviourId;
      return <article className={styles.behaviourCard} key={definition.behaviourId} data-behaviour-v2-value={definition.behaviourId}>
        <header><div><span>{definition.behaviourId} · {choice?.corporateValue || definition.corporateValue}</span><h3>{choice?.valueTitle || definition.title}</h3><p>{choice?.descriptor || `Governed ${person?.behaviourRoleTierV2 || 'role-tier'} descriptor unavailable`}</p><small>{choice?.commitment.trim() || 'No employee commitment entered'}</small></div><button type="button" onClick={() => setEditing(isEditing ? undefined : definition.behaviourId)}>{isEditing ? 'Done editing (not saved)' : 'Open Value card'}</button></header>
        {isEditing && choice && <div className={styles.editor}>
          {unavailableSuggestionKeys.length > 0 && <div className={styles.notice} data-behaviour-unavailable={definition.behaviourId}><strong>Stored selections retained — currently unavailable</strong><ul>{unavailableSuggestionKeys.map(key => <li key={key}>{key}</li>)}</ul></div>}
          <fieldset><legend>Controlled suggestions — choose one or more</legend><div className={styles.suggestionGrid}>{suggestions.map(item => <label className={styles.suggestionCard} key={item.behaviourObjectiveKey}><input type="checkbox" data-behaviour-suggestion={item.behaviourObjectiveKey} checked={choice.selectedSuggestionKeys.indexOf(item.behaviourObjectiveKey) >= 0} onChange={() => {
            const selectedAvailableKeys = suggestions.map(suggestion => suggestion.behaviourObjectiveKey)
              .filter(key => choice.selectedSuggestionKeys.indexOf(key) >= 0);
            const requestedAvailableKeys = selectedAvailableKeys.indexOf(item.behaviourObjectiveKey) >= 0
              ? selectedAvailableKeys.filter(key => key !== item.behaviourObjectiveKey)
              : [...selectedAvailableKeys, item.behaviourObjectiveKey];
            const selectedSuggestionKeys = retainUnavailableEmployeeBehaviourV2Selection(
              choice.selectedSuggestionKeys, requestedAvailableKeys, suggestions);
            patch(choice.behaviourId, { selectedSuggestionKeys });
          }} /><span><strong>{item.behaviourObjectiveKey.replace(`${definition.behaviourId}-`, '')}</strong>{item.objectiveTitle}<small>{item.objectiveDescription}</small></span></label>)}</div></fieldset>
          <label><span>My commitment for this Value</span><textarea rows={3} data-behaviour-commitment={choice.behaviourId} value={choice.commitment} onChange={event => patch(choice.behaviourId, { commitment: event.currentTarget.value })} /></label>
          <div className={styles.quarterInputs}>{periods.map(period => <label key={period}><span>{period} commitment</span><textarea rows={2} value={choice[period.toLowerCase() as 'q1' | 'q2' | 'q3' | 'q4' | 'h1' | 'h2']} onChange={event => patch(choice.behaviourId, { [period.toLowerCase()]: event.currentTarget.value })} /></label>)}</div>
          <div className={styles.notice} aria-label="Behaviour assessment labels"><strong>Assessment guidance</strong>{' '}<span>1 Developing · 2 Effective · 3 Exceptional</span>{' '}<small>Effective describes the expected role standard; it is not stored as a target.</small></div>
        </div>}
      </article>;
    })}
  </section>;
};

const WeightEditor: React.FC<{ title: string; mode: WeightMode; values: number[]; onMode(mode: WeightMode): void; onChange(values: number[]): void; onEdit?(index: number): void }> = ({ title, mode, values, onMode, onChange, onEdit }) => {
  const total = values.reduce((sum, value) => sum + value, 0);
  const valid = values.every(value => Number.isFinite(value) && value >= 0 && value <= 100) && total === 100;
  return <section className={styles.weightBlock}><header><h3>{title}</h3><strong className={valid || values.length === 0 ? styles.weightGood : styles.weightBad}>{values.length ? `${total}%` : 'No items'}</strong></header>
    <div className={styles.segmented}><button type="button" aria-pressed={mode === 'Equal'} onClick={() => { onMode('Equal'); values.forEach((_value, index) => onEdit?.(index)); onChange(equalWeights(values.length)); }}>Equal</button><button type="button" aria-pressed={mode === 'Custom'} onClick={() => onMode('Custom')}>Custom</button><button type="button" onClick={() => onMode('Custom')}>Edit</button></div>
    {title === 'IMPACT' && <ImpactFieldHelp id="impact-weight-mode-help" label="IMPACT weighting mode" content={IMPACT_HELP.weight} />}
    {mode === 'Custom' && <div className={styles.weightInputs}>{values.map((value, index) => <div key={index} className={title === 'IMPACT' ? styles.impactField : undefined}><label><span>Item {index + 1} planning weight</span><input type="number" min="0" max="100" value={value} onChange={event => { onEdit?.(index); onChange(values.map((item, itemIndex) => itemIndex === index ? Number(event.currentTarget.value) : item)); }} /></label>{title === 'IMPACT' && <ImpactFieldHelp id={`impact-weight-${index}-help`} label={`IMPACT item ${index + 1} planning weight`} content={IMPACT_HELP.weight} />}</div>)}</div>}
    {values.length > 0 && !valid && <p className={styles.warning}>Planning weights must each be from 0% to 100% and total exactly 100%.</p>}
  </section>;
};

export const ReviewWeights: React.FC<{
  core: ICoreChoice[]; personal: IPersonalChoice[]; behaviours: IBehaviourChoice[];
  onCore(items: ICoreChoice[]): void; onPersonal(items: IPersonalChoice[]): void; onBehaviours(items: IBehaviourChoice[]): void;
  workplan?: IAnnualWorkplan; saving: boolean; message: string; nativeWritesHeld?: boolean;
  privateDraftWritesHeld?: boolean; sessionRecoveryRequired?: boolean;
  assignedManager?: IProductionPerson;
  initialCoreMode?: EmployeeCoreWeightingModeV2;
  behaviourV2?: boolean;
  behaviourCadence?: BehaviourV2Cadence;
  canonicalBehaviourItems?: readonly IBehaviourWorkplanItem[];
  draftSessionChanged?: boolean;
  optionEDraftSave?: IOptionEDraftSaveSnapshot<OptionEPrivateDraftAggregate>;
  optionEV4SubmitAvailable?: boolean;
  onReloadOptionEDraft?(): Promise<void>;
  onReapplyOptionEDraft?(): void;
  onSave(category: { core: number; personal: number; behaviours: number }, modes: { core: WeightMode; personal: WeightMode; behaviours: WeightMode }, categoryReason: string, zeroPersonalReason: string): Promise<void>;
  onSubmit(): Promise<void>;
  onEditWeight?(group: 'core' | 'impact' | 'behaviour', id: string): void;
  privateEmployeeNotes?: IOptionEWorkplanDraftV3Aggregate['employeeNotes'];
}> = ({ core, personal, behaviours, onCore, onPersonal, onBehaviours, workplan, saving, message, nativeWritesHeld = false,
  assignedManager, initialCoreMode, privateDraftWritesHeld = nativeWritesHeld, sessionRecoveryRequired = false,
  behaviourV2 = behaviours.some(item => item.frameworkVersion === BEHAVIOUR_FRAMEWORK_V2_VERSION),
  behaviourCadence = 'Quarterly', canonicalBehaviourItems = [], draftSessionChanged = false,
  optionEDraftSave, optionEV4SubmitAvailable = false, onReloadOptionEDraft, onReapplyOptionEDraft, onSave, onSubmit, onEditWeight, privateEmployeeNotes }) => {
  const [modes, setModes] = React.useState<{ core: WeightMode; personal: WeightMode; behaviours: WeightMode }>({ core: initialCoreMode || 'Equal', personal: 'Equal', behaviours: 'Equal' });
  const [category, setCategory] = React.useState(() => ({ core: workplan?.coreCategoryWeight ?? 70, personal: workplan?.personalCategoryWeight ?? 20, behaviours: workplan?.behaviourCategoryWeight ?? 10 }));
  const [categoryReason, setCategoryReason] = React.useState(privateEmployeeNotes?.categoryWeightReason ?? workplan?.categoryWeightReason ?? '');
  const [zeroPersonalReason, setZeroPersonalReason] = React.useState(privateEmployeeNotes?.zeroPersonalReason ?? '');
  React.useEffect(() => {
    setCategory({ core: workplan?.coreCategoryWeight ?? 70, personal: workplan?.personalCategoryWeight ?? 20, behaviours: workplan?.behaviourCategoryWeight ?? 10 });
    setCategoryReason(privateEmployeeNotes?.categoryWeightReason ?? workplan?.categoryWeightReason ?? '');
    setZeroPersonalReason(privateEmployeeNotes?.zeroPersonalReason ?? '');
    setModes(current => ({ ...current, core: initialCoreMode || 'Equal' }));
  }, [workplan?.rowVersionToken, initialCoreMode, privateEmployeeNotes?.categoryWeightReason, privateEmployeeNotes?.zeroPersonalReason]);
  const categoryTotal = category.core + category.personal + category.behaviours;
  const behaviourPeriods = behaviourCadence === 'Quarterly' ? ['q1', 'q2', 'q3', 'q4'] as const : ['h1', 'h2'] as const;
  const configuredBehaviours = behaviourV2
    ? behaviours.filter(item => item.commitment.trim() && behaviourPeriods.every(period => item[period].trim()))
    : behaviours.filter(item => behaviourSelectionIsComplete(item.selectedSuggestionKeys, item.customObjective || '')
      && item.q1.trim() && item.q2.trim() && item.q3.trim() && item.q4.trim()
      && Boolean(item.targetRating && item.targetRating >= 1 && item.targetRating <= 4));
  const weightsReady = (values: number[]): boolean => values.every(value => Number.isFinite(value) && value >= 0 && value <= 100)
    && values.reduce((sum, value) => sum + value, 0) === 100;
  const coreReady = core.length > 0 && core.every(item => Boolean(item.role)
    && (!optionEDraftSave || Boolean(item.contributionMethod))) && weightsReady(core.map(item => item.weight));
  const zeroPersonalReady = personal.length === 0 && category.personal === 0 && Boolean(zeroPersonalReason.trim());
  const personalReady = behaviourV2 && personal.length === 0 || zeroPersonalReady || (personal.length > 0 && personal.every(item => item.wording.trim() && item.annual.trim() && item.q1.trim() && item.q2.trim() && item.q3.trim() && item.q4.trim())
    && weightsReady(personal.map(item => item.weight)));
  const behaviourReady = configuredBehaviours.length === 5
    && (behaviourV2 || weightsReady(configuredBehaviours.map(item => item.weight ?? 0)));
  const categoryValuesValid = [category.core, category.personal, category.behaviours].every(value => Number.isFinite(value) && value >= 0 && value <= 100);
  const categoryReasonRequired = category.core !== 70 || category.personal !== 20 || category.behaviours !== 10;
  const managerReady = Boolean(workplan && assignedManager && hasExactManagerIdentity({
    personKey: workplan.personKey,
    managerPersonKey: workplan.managerPersonKey,
    managerEmail: workplan.managerEmail
  }, assignedManager));
  const canonicalV02Ready = behaviourV2 && validateBehaviourAssignments([], [...canonicalBehaviourItems]).state === 'complete'
    && !hasBehaviourV2Mutation(behaviours, canonicalBehaviourItems) && !draftSessionChanged;
  const sectionSaveUnconfirmed = !workplan || draftSessionChanged
    || (optionEDraftSave !== undefined && optionEDraftSave.status !== 'Saved');
  const annualEditable = annualWorkplanIsEditable(workplan);
  const ready = annualEditable
    && (workplan?.state === 'Draft' || workplan?.state === 'ChangesRequested')
    && managerReady && coreReady && personalReady && behaviourReady
    && (behaviourV2 ? canonicalV02Ready : categoryValuesValid && categoryTotal === 100
      && (!categoryReasonRequired || Boolean(categoryReason.trim())));
  return <section className={styles.singlePage}>
    <header className={styles.sectionHeader}><div><span>Final check</span><h2>Review & Weight</h2><p>Review the annual agreement and confirm how each section contributes.</p></div><strong>{ready ? 'Ready to submit' : 'Not ready'}</strong></header>
    <IntegratedScreenGuidance
      purpose={behaviourV2 ? 'Check the complete annual Workplan. Core and Impact planning weights stay separate from the five unweighted Behaviour commitments.' : 'Check the complete annual Workplan and confirm the legacy category balance before saving or submitting.'}
      actions={['Resolve every visible readiness item and confirm selected-item weights total exactly 100% within each section.', 'Save the Draft and check its confirmation before submitting the Workplan.']}
      fields={behaviourV2 ? ['Core and Impact planning weights do not change Overall Delivery scoring weights.', 'Behaviour v02 commitments are assessed separately without an item weight or target rating.', ...governedTerms] : ['The legacy category balance controls how Core, Impact and Behaviours contribute.', 'A reason is required when the approved category balance changes.', ...governedTerms]}
      next="Save Draft first. Submit only after every readiness item is clear and the page confirms submission is available; the manager then reviews the submitted Workplan."
    />
    <PerformanceConceptGuide />
    <CapturedDeliveryWeightingPanel configuration={workplan?.overallDeliveryWeightConfiguration} workplanState={workplan?.state || 'Draft'} />
    {!workplan && <div className={styles.persistenceWarning} role="alert"><strong>Saving is unavailable.</strong><span>Start My Workplan first. Session changes are not saved.</span></div>}
    <section className={styles.metricGrid} aria-label="Workplan section completion and assigned manager">
      <article><strong>{coreReady ? sectionSaveUnconfirmed ? 'Entered — not saved' : 'Complete' : 'Needs attention'}</strong><span>Core section · {core.length} selected</span></article>
      <article><strong>{personalReady ? sectionSaveUnconfirmed ? 'Entered — not saved' : 'Complete' : 'Needs attention'}</strong><span>IMPACT section · {personal.length} configured</span></article>
      <article><strong>{behaviourReady ? sectionSaveUnconfirmed ? 'Entered — not saved' : 'Complete' : 'Needs attention'}</strong><span>Behaviour section · {configuredBehaviours.length} configured</span></article>
      <article><strong>{managerReady ? 'Verified' : 'Not verified'}</strong><span>Assigned manager · {assignedManager?.displayName || workplan?.managerDisplayName || 'Not recorded'}</span></article>
    </section>
    <div className={styles.weightStack}>
      <WeightEditor onEdit={index => onEditWeight?.('core', core[index].optionEDraftCoreId || core[index].kpiId)} title="Core" mode={modes.core} values={core.map(item => item.weight)} onMode={mode => setModes({ ...modes, core: mode })} onChange={values => onCore(core.map((item, index) => ({ ...item, weight: values[index] })))} />
      <WeightEditor onEdit={index => onEditWeight?.('impact', personal[index].key)} title="IMPACT" mode={modes.personal} values={personal.map(item => item.weight)} onMode={mode => setModes({ ...modes, personal: mode })} onChange={values => onPersonal(personal.map((item, index) => ({ ...item, weight: values[index] })))} />
      {behaviourV2
        ? <section className={styles.weightBlock}><header><h3>Behaviours</h3><strong>{behaviourReady ? 'Five Values' : 'Incomplete'}</strong></header><p>KCCC Behaviour v02 Values are assessed separately. No item weight, target, average or RAG-from-target is calculated.</p></section>
        : <WeightEditor title="Behaviours" mode={modes.behaviours} values={configuredBehaviours.map(item => item.weight ?? 0)} onMode={mode => setModes({ ...modes, behaviours: mode })} onChange={values => onBehaviours(behaviours.map(item => { const index = configuredBehaviours.findIndex(candidate => candidate.behaviourId === item.behaviourId); return index < 0 ? item : { ...item, weight: values[index] }; }))} />}
    </div>
    {!behaviourV2 && <section className={styles.categoryBalance}><header><h3>Category balance</h3><strong className={categoryTotal === 100 ? styles.weightGood : styles.weightBad}>{categoryTotal}%</strong></header><div className={styles.categoryInputs}>
      {(['core', 'personal', 'behaviours'] as const).map(key => <label key={key}><span>{key === 'personal' ? 'IMPACT' : key[0].toUpperCase() + key.slice(1)}</span><input type="number" min="0" max="100" value={category[key]} onChange={event => setCategory({ ...category, [key]: Number(event.currentTarget.value) })} /></label>)}
    </div>{(!categoryValuesValid || categoryTotal !== 100) && <p className={styles.warning}>Category weights must each be from 0% to 100% and total exactly 100%.</p>}
    {categoryReasonRequired && <label className={styles.fullSearch}><span>Reason for changing the approved 70/20/10 category balance</span><textarea rows={2} value={categoryReason} onChange={event => setCategoryReason(event.currentTarget.value)} /></label>}
    {personal.length === 0 && <label className={styles.fullSearch}><span>Employee reason for proposing zero IMPACT KPIs</span><textarea rows={2} value={zeroPersonalReason} onChange={event => setZeroPersonalReason(event.currentTarget.value)} placeholder="This proposal is recorded for manager decision; it is never applied silently." /></label>}</section>}
    {behaviourV2 && <div className={styles.persistenceWarning}><strong>Behaviour v02 has no category weight.</strong><span>The legacy category balance is not displayed, copied or written by this v02 save. Submission checks the governed Core/Impact configuration and saved Workplan again.</span></div>}
    {!ready && <ul className={styles.issueList}>{!workplan && <li>Start the current-year Workplan before saving.</li>}{workplan && !managerReady && <li>The assigned manager PersonKey and email must match one active controlled Manager record.</li>}{!coreReady && <li>Core needs at least one configured role and valid exact 100% selected-item weighting.</li>}{!personalReady && <li>{behaviourV2 ? 'Complete the selected IMPACT KPIs, or leave the optional IMPACT section empty.' : 'Complete IMPACT KPIs, or set IMPACT to 0% and record the employee’s governed zero-Personal proposal.'}</li>}{!behaviourReady && <li>{behaviourV2 ? `All five Behaviour Value commitments and ${behaviourCadence === 'Quarterly' ? 'Q1–Q4' : 'H1–H2'} commitments must be completed.` : 'All five Behaviour objectives and Q1–Q4 commitments must be completed before their weights can be ready.'}</li>}{!behaviourV2 && categoryReasonRequired && !categoryReason.trim() && <li>A reason is required when the approved category balance changes.</li>}{behaviourV2 && !canonicalV02Ready && <li>Save Draft, confirm all five published Behaviour snapshots in the saved readback, and resolve unsaved changes before submitting.</li>}</ul>}
    {optionEDraftSave && <section className={styles.persistenceWarning} aria-live="polite" aria-atomic="true"
      role={optionEDraftSave.status === 'Conflict' || optionEDraftSave.status === 'NotSaved' ? 'alert' : 'status'}
      data-option-e-save-status={optionEDraftSave.status}>
      <strong>{optionEDraftSave.visibleStatus}</strong>{optionEDraftSave.detail && <span>{optionEDraftSave.detail}</span>}
      {(optionEDraftSave.canResolveConflict || optionEDraftSave.requiresCanonicalReopen || sessionRecoveryRequired) && <div className={styles.quickActions}>
        <button type="button" onClick={onReloadOptionEDraft}>Reload canonical Draft</button>
        {(optionEDraftSave.canResolveConflict || sessionRecoveryRequired) && <button type="button" onClick={onReapplyOptionEDraft}>Reapply retained changes</button>}
      </div>}
    </section>}
    {optionEDraftSave && !optionEV4SubmitAvailable && <p className={styles.persistenceWarning} role="status">Submit is unavailable until the trusted Option E request, status and receipt processor is connected. A saved Draft remains private and is not eligible for manager review or reporting.</p>}
    <div className={styles.quickActions}><button type="button" disabled={privateDraftWritesHeld || sessionRecoveryRequired || !annualEditable || saving || !workplan || Boolean(optionEDraftSave && (!optionEDraftSave.canonical || optionEDraftSave.requiresCanonicalReopen))} onClick={() => onSave(category, modes, categoryReason, zeroPersonalReason)}>{optionEDraftSave?.status === 'Checking' ? 'Checking save…' : saving ? 'Saving…' : 'Save Draft'}</button><button type="button" disabled={nativeWritesHeld || !annualEditable || saving || !ready || Boolean(optionEDraftSave && (!optionEV4SubmitAvailable || optionEDraftSave.status !== 'Saved' || optionEDraftSave.requiresCanonicalReopen || optionEDraftSave.retainedBuffer))} onClick={onSubmit}>Submit Workplan</button></div>
    {message && <p className={styles.notice} role="status">{message}</p>}
  </section>;
};

const adminGuidance: Record<AdminTab, { purpose: string; actions: string[]; fields: string[]; next: string }> = {
  'People': {
    purpose: 'Review the governed People records used for employee, manager and Admin journeys.',
    actions: ['Choose a Person to inspect their identity, status, Team and manager relationship.', 'Add and Deactivate remain unavailable until the governed update route is verified.'],
    fields: ['Status says whether the person is active.', 'Manager and Team are separate governed relationships.'],
    next: 'Use Teams or Data Quality to continue the review; route a confirmed data issue through the controlled Admin process.'
  },
  'Teams': {
    purpose: 'Review approved Teams independently from the People reporting hierarchy.',
    actions: ['Check each Team name and Team lead.', 'Confirm that an empty list means Teams are not configured, not that zero Teams were approved.'],
    fields: ['Team lead is the governed Team owner.', 'Active and inactive status remains visible in the record.'],
    next: 'Use People to check membership relationships or Data Quality to investigate a configuration issue.'
  },
  'KPI Master': {
    purpose: 'Inspect the current Core KPI catalogue and its governed organisational metadata.',
    actions: ['Search by KPI ID or wording.', 'Review pillar, workstream and owner without changing the catalogue.'],
    fields: ['KPI ID identifies the current Core definition.', 'Owner is organisational metadata, not the employee Workplan role.'],
    next: 'Use Annual Targets or Reporting Map to inspect the related governed records.'
  },
  'Annual Targets': {
    purpose: 'Inspect current annual and quarterly organisation targets for Core KPIs.',
    actions: ['Review the annual target and each Q1–Q4 value.', 'Treat Not available as missing governed data, never as zero.'],
    fields: ['Annual and Q1–Q4 values are organisation targets.', 'Unit explains how each target is measured.'],
    next: 'Use Data Quality when a required target or unit is unavailable.'
  },
  'Behaviour Library': {
    purpose: 'Review the controlled suggestion library that supports the five KCF Behaviours.',
    actions: ['Check the suggestion count and approved prompts for each Behaviour.', 'Do not treat an absent suggestion as an employee choice.'],
    fields: ['Behaviour title and corporate value identify the governed definition.', 'Suggested objectives support, but do not replace, an employee commitment.'],
    next: 'Continue to Data Quality if a current Behaviour definition or suggestion is missing.'
  },
  'Config': {
    purpose: 'Inspect active configuration values used by the Performance Hub.',
    actions: ['Review each value and its last-updated date.', 'Treat an unavailable list as a failed read, not an empty approved configuration.'],
    fields: ['Configuration name identifies the governed setting.', 'Last updated provides the visible freshness context.'],
    next: 'Use Data Quality to investigate missing, stale or unsupported values.'
  },
  'Reporting Map': {
    purpose: 'Inspect how Core KPIs are mapped to governed reporting outputs.',
    actions: ['Review the KPI, output, treatment, approval status and effective date.', 'Treat missing mappings as not confirmed rather than inferring membership.'],
    fields: ['Approval status provides text meaning for the mapping state.', 'Effective from identifies when the mapping applies.'],
    next: 'Use Output Definitions for the output contract or Reporting Readiness for the combined readiness view.'
  },
  'Output Definitions': {
    purpose: 'Review the governed definitions and publication state of reporting outputs.',
    actions: ['Check the output description, frequency and publication state.', 'Do not infer a current output when no confirmed definition is shown.'],
    fields: ['Publication state is shown as text, not colour alone.', 'Reporting frequency describes the governed cycle.'],
    next: 'Use Reporting Map to inspect memberships or Reporting Readiness to review blockers.'
  },
  'Strategic Core Coverage': {
    purpose: 'Inspect the authorised Strategic Core coverage view without inventing unavailable contribution data.',
    actions: ['Apply only the available filters.', 'Read any unavailable or not-ready message before interpreting coverage.'],
    fields: ['Filters limit the governed projection.', 'Coverage and exception states always include visible text.'],
    next: 'Resolve the named data dependency before using coverage as a reporting input.'
  },
  'History & Audit': {
    purpose: 'Review the bounded recent history supplied to this Admin view.',
    actions: ['Check event time, type, entity and actor.', 'Treat no events as an empty bounded window, not proof that no historic event exists.'],
    fields: ['Event time uses the visible UK locale.', 'Entity and actor identify what changed and who performed it.'],
    next: 'Use the relevant Admin area to inspect the current record; request governed audit evidence if a wider window is needed.'
  },
  'Data Quality': {
    purpose: 'Review visible catalogue, target, actual and load issues before relying on Admin or reporting data.',
    actions: ['Read every named issue and the affected count.', 'Do not replace unavailable values with plausible zeroes.'],
    fields: ['Items needing attention is a text count.', 'Warnings describe the unavailable or inconsistent source.'],
    next: 'Route each confirmed issue to its governed data owner, then reload and recheck this view.'
  }
};

export const AdminView: React.FC<{ tab: AdminTab; data: IIntegratedData; behaviourCatalogueAdministration?: IBehaviourCatalogueAdministrationGateway; lifecycleSession?: IYearLifecycleSyntheticSourceSession; adminMasterSource?: AdminMasterReadResult }> = ({ tab, data, behaviourCatalogueAdministration, lifecycleSession, adminMasterSource }) => {
  const [search, setSearch] = React.useState('');
  const [historyActor, setHistoryActor] = React.useState('');
  const [historyState, setHistoryState] = React.useState('');
  const [historyStatus, setHistoryStatus] = React.useState('');
  const [historyYear, setHistoryYear] = React.useState('');
  const [historyQuarter, setHistoryQuarter] = React.useState('');
  const [coverageFilter, setCoverageFilter] = React.useState<IStrategicCoreCoverageFilter>({ performanceYear: data.reporting?.performanceYear || data.overview?.config?.performanceYearNumber });
  const term = search.toLowerCase();
  const filteredKpis = data.kpis.filter(row => !term || `${row.kpiId} ${row.wording}`.toLowerCase().indexOf(term) >= 0);
  const activeConfigs = data.configs.filter(record => record.active);
  const reportingMaps = data.reporting?.reportingMaps || [];
  const outputDefinitions = data.reporting?.outputDefinitions || [];
  const guide = adminGuidance[tab];
  const header = <><header className={styles.sectionHeader}><div><span>Administration</span><h2>{tab}</h2></div></header>
    <IntegratedScreenGuidance purpose={guide.purpose} actions={guide.actions} fields={[...guide.fields, ...governedTerms]} next={guide.next} /></>;
  if (adminMasterSource && ['KPI Master', 'Strategic Core Coverage', 'Data Quality'].indexOf(tab) >= 0) return <section>{header}<AdminMasterSourceCompositionView key={tab} tab={tab} result={adminMasterSource} /></section>;
  if (tab === 'People') return <section className={styles.singlePage}>{header}<AdminPeopleManagementView records={data.people} readAvailable={data.peopleReadAvailable === true} actorRoles={data.overview?.employee?.appRoles} /></section>;
  if (tab === 'Teams') return <section className={styles.singlePage}>{header}<div className={styles.dataGrid}>{data.teams.map(team => <article key={team.teamKey}><h3>{team.teamName}</h3><p>Team lead: {data.people.filter(person => person.personKey === team.teamLeadPersonKey)[0]?.displayName || 'Not recorded'}</p><span>{team.active ? 'Active' : 'Inactive'}</span></article>)}</div>{!data.teams.length && <Empty title="Teams not configured" message="No approved current Team records are available."
    nextStep="Ask the governed Team data owner to confirm configuration; do not invent Team names." />}</section>;
  if (tab === 'KPI Master') return <section className={styles.singlePage}>{header}<label className={styles.fullSearch}><span>Search KPI Master</span><input type="search" value={search} onChange={event => setSearch(event.currentTarget.value)} /></label><ResponsiveTableRegion label="Current Core KPI catalogue table"><table><thead><tr><th>KPI ID</th><th>Wording</th><th>Pillar</th><th>Workstream</th><th>Owner</th></tr></thead><tbody>{filteredKpis.map(row => <tr key={row.kpiId}><td>{row.kpiId}</td><td>{row.wording}</td><td>{row.pillar}</td><td>{row.workstream}</td><td>{row.owner || 'Not recorded'}</td></tr>)}</tbody></table></ResponsiveTableRegion>{!filteredKpis.length && <Empty title="No Core KPIs shown" message={term ? 'No current Core KPI matches this search.' : 'No current Core KPI catalogue rows were returned.'}
    nextStep={term ? 'Change or clear the search.' : 'Check Data Quality and restore the governed catalogue read before continuing.'} />}</section>;
  if (tab === 'Annual Targets') return <section className={styles.singlePage}>{header}<ResponsiveTableRegion label="Current Core annual and quarterly targets table"><table><thead><tr><th>KPI ID</th><th>Annual</th><th>Q1</th><th>Q2</th><th>Q3</th><th>Q4</th><th>Unit</th></tr></thead><tbody>{data.kpis.map(row => <tr key={row.kpiId}><td>{row.kpiId}</td><td>{textValue(row.annualTarget)}</td>{row.quarterTargets.map(target => <td key={target.quarter}>{textValue(target.value)}</td>)}<td>{row.unit || 'Not recorded'}</td></tr>)}</tbody></table></ResponsiveTableRegion>{!data.kpis.length && <Empty title="Annual targets unavailable" message="No current Core KPI target rows were returned."
    nextStep="Check Data Quality and restore the governed catalogue and target read before continuing." />}</section>;
  if (tab === 'Behaviour Library') return <section className={styles.singlePage}>{header}<AdminFoundationBehaviourCatalogue key={data.overview?.employee?.email} gateway={behaviourCatalogueAdministration} /><div className={styles.dataGrid}>{EMPLOYEE_V2_APPROVED_BEHAVIOURS.map(definition => <article key={definition.behaviourId}><h3>{definition.title}</h3><p>{definition.corporateValue}</p><strong>{data.objectives.filter(item => item.behaviourKey === definition.behaviourId && item.active).length} suggested objectives</strong><ul>{definition.prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ul></article>)}</div></section>;
  if (tab === 'Config') return <section className={styles.singlePage}>{header}<div className={styles.dataGrid}>{activeConfigs.map(record => <article key={record.key}><h3>{configName(record.key)}</h3><strong>{humanConfigValue(record)}</strong><p>Last updated {record.modifiedAt ? new Date(record.modifiedAt).toLocaleDateString('en-GB') : 'date not recorded'}</p></article>)}</div>{!activeConfigs.length && <Empty title="Configuration unavailable" message="No active current configuration records are available to this role."
    nextStep="Ask the governed configuration owner to restore the read, then reload before continuing." />}<YearLifecycleSourceCallerView session={applicationEntryCapabilities(data.overview?.employee).admin ? lifecycleSession : undefined} /></section>;
  if (tab === 'Reporting Map') return <section className={styles.singlePage}>{header}<ResponsiveTableRegion label="Current reporting map table"><table><thead><tr><th>KPI</th><th>Reporting output</th><th>Treatment</th><th>Status</th><th>Effective from</th></tr></thead><tbody>{reportingMaps.map(row => <tr key={row.mappingKey}><td>{row.kpiId}</td><td>{row.outputCode}</td><td>{row.treatment || 'Not recorded'}</td><td>{row.approvalStatus}</td><td>{row.effectiveFrom}</td></tr>)}</tbody></table></ResponsiveTableRegion>{!reportingMaps.length && <Empty title="Reporting Map not configured" message="No confirmed current reporting memberships were returned."
    nextStep="Check Reporting Readiness and ask the governed reporting-map owner to confirm the configuration." />}</section>;
  if (tab === 'Output Definitions') return <section className={styles.singlePage}>{header}<div className={styles.dataGrid}>{outputDefinitions.map(row => <article key={`${row.outputCode}|${row.version}`}><h3>{row.outputName}</h3><p>{row.description || 'No description recorded'}</p><strong>{row.publicationStatus} · {row.reportingFrequency}</strong></article>)}</div>{!outputDefinitions.length && <Empty title="Output definitions unavailable" message="No confirmed current reporting output definition was returned."
    nextStep="Check Reporting Readiness and ask the governed output owner to restore or confirm the definition." />}</section>;
  if (tab === 'History & Audit') {
    const history = data.adminEventHistory;
    const view = history?.status === 'ready' ? history.view : undefined;
    const selected = view && filterAuthorisedAdminEventHistoryView(view, {
      actors: historyActor ? [historyActor] : undefined,
      states: historyState ? [historyState] : undefined,
      statuses: historyStatus ? [historyStatus] : undefined,
      performanceYears: historyYear ? [Number(historyYear)] : undefined,
      quarters: historyQuarter ? [historyQuarter as 'Q1' | 'Q2' | 'Q3' | 'Q4'] : undefined
    });
    const choose = (label: string, value: string, values: readonly string[], update: (next: string) => void): JSX.Element => (
      <label><span>{label}</span><select value={value} onChange={event => update(event.currentTarget.value)}>
        <option value="">All {label.toLowerCase()}</option>
        {values.map(option => <option key={option} value={option}>{option}</option>)}
      </select></label>
    );
    return <section className={styles.singlePage}>{header}
      <h3>Controlled forensic history</h3>
      {history?.status === 'denied' && <p role="status">Controlled Audit history requires an active SystemAdmin People identity.</p>}
      {history?.status === 'unavailable' && <p role="alert">Controlled Audit history could not be loaded. Its contents are unavailable; retry after the governed source is restored.</p>}
      {!history && <p role="status">Controlled Audit history is loading or unavailable.</p>}
      {selected && <><div className={styles.dataGrid} aria-label="Controlled history filters">
        {choose('Actor', historyActor, view!.filterOptions.actors, setHistoryActor)}
        {choose('State', historyState, view!.filterOptions.states, setHistoryState)}
        {choose('Status', historyStatus, view!.filterOptions.statuses, setHistoryStatus)}
        {choose('Performance year', historyYear, view!.filterOptions.performanceYears.map(String), setHistoryYear)}
        {choose('Quarter', historyQuarter, view!.filterOptions.quarters, setHistoryQuarter)}
      </div><p role="status">{selected.filteredEvents.length} of {selected.allEvents.length} controlled events shown for the bound year.</p>
      <div className={styles.timeline}>{selected.filteredEvents.map(row => <article key={row.auditKey}>
        <time>{new Date(row.eventAt).toLocaleString('en-GB')}</time><h4>{row.eventType}</h4>
        <p>{row.subjectKey} · {row.actorEmail} · {row.actorRole}</p>
        <p>{row.state || row.status || 'No state or status recorded'} · {row.quarter || 'Annual'} · {row.success ? 'Succeeded' : 'Failed'}</p>
        <p>Correlation: {row.correlationKey}</p>
      </article>)}</div>{!selected.filteredEvents.length && <p>No controlled events match these filters in the bound year.</p>}</>}
      <h3>Reporting-control events</h3>
      <div className={styles.timeline}>{(data.reporting?.auditEvents || []).map(row => <article key={row.auditKey}><time>{new Date(row.eventAt).toLocaleString('en-GB')}</time><h4>{row.eventType.replace(/([a-z])([A-Z])/g, '$1 $2')}</h4><p>{row.entityType.replace(/([a-z])([A-Z])/g, '$1 $2')} updated by {row.actor}</p></article>)}</div>
      {!data.reporting && <p role="status">Reporting-control events are unavailable.</p>}
      {data.reporting && !data.reporting.auditEvents.length && <p>No reporting-control events are available in the current bounded window.</p>}
    </section>;
  }
  if (tab === 'Data Quality') {
    const counts = integratedReferenceCounts(data.kpis);
    const issues = [...data.warnings, ...(data.reporting?.warnings || [])];
    return <section className={styles.singlePage}>{header}<div className={styles.metricGrid}><article><strong>{counts.kpis}</strong><span>Current Core KPIs</span></article><article><strong>{counts.targets}</strong><span>Annual targets available</span></article><article><strong>{counts.officialActuals}</strong><span>Official Actuals available</span></article><article><strong>{issues.length}</strong><span>Items needing attention</span></article></div>{issues.length ? <ul className={styles.issueList}>{issues.map((issue, index) => <li key={`${index}|${issue}`}>{issue}</li>)}</ul> : <Empty title="No current issues" message="The data checks available to this view are clear."
      nextStep="Continue to the required Admin or reporting task and recheck Data Quality after any governed change." />}</section>;
  }
  return <>{header}<StrategicCoreCoveragePage
    productionIdentity={`${data.overview?.employee?.displayName || 'Authorised Admin'} · ${data.overview?.employee?.email || 'signed-in identity'}`}
    filter={coverageFilter}
    filterOptions={{
      performanceYears: coverageFilter.performanceYear ? [coverageFilter.performanceYear] : [],
      pillars: Array.from(new Set(data.kpis.map(row => row.pillar))).sort(),
      workstreams: Array.from(new Set(data.kpis.filter(row => !coverageFilter.pillar || row.pillar === coverageFilter.pillar).map(row => row.workstream))).sort(),
      teams: data.teams.map(row => ({ key: row.teamKey, label: row.teamName })),
      managers: data.people.filter(row => data.people.some(person => person.managerPersonKey === row.personKey)).map(row => ({ key: row.personKey, label: row.displayName })),
      kpis: data.kpis.map(row => ({ key: row.kpiId, label: `${row.kpiId} · ${row.wording}` })),
      memberships: getConfirmedCoverageMembershipOptions(data.reporting)
    }}
    localUat={false}
    message="NOT READY — the authorised server-side RPT-005 contribution projection is not available to this integrated candidate. No coverage values or exception results are inferred."
    onFilterChange={setCoverageFilter}
  /></>;
};

const reportingGuidance: Record<ReportingTab, { purpose: string; actions: string[]; fields: string[]; next: string }> = {
  'Reporting Readiness': {
    purpose: 'Check whether the governed Core catalogue, targets, reporting memberships and Official Actuals are ready for reporting.',
    actions: ['Review every readiness count and named reason.', 'Treat NOT READY as a blocking text state; do not infer readiness from colour or partial counts.'],
    fields: ['Core KPI catalogue shows the current governed count.', 'Targets, memberships and Official Actuals are separate readiness inputs.'],
    next: 'Resolve each named dependency in its governed Admin area, then reload and recheck readiness.'
  },
  'GOLD / organisation reporting': {
    purpose: 'Inspect organisation-level Core results and confirmed reporting memberships without changing them.',
    actions: ['Review target, Official Actual and membership for each Core KPI.', 'Treat Not available and No confirmed current mapping as explicit missing states.'],
    fields: ['Target and Official Actual are separate governed values.', 'Memberships list only confirmed current reporting outputs.'],
    next: 'Use Reporting Readiness for blockers or the relevant Admin area for governed correction.'
  },
  'CWOP / CWSP': {
    purpose: 'Review confirmed current CWOP and CWSP output definitions supplied to this role.',
    actions: ['Read the description and publication status for each available output.', 'Do not infer an output definition when none is shown.'],
    fields: ['Description explains the governed output purpose.', 'Publication status is visible text and is not represented by colour alone.'],
    next: 'Use Reporting Readiness to check dependencies or ask the governed output owner to confirm a missing definition.'
  },
  'Performance reporting views': {
    purpose: 'Inspect the separate Core, Impact and Behaviour reporting views when a validated governed dataset is supplied.',
    actions: ['Choose a view and inspect its submission state, completeness and provenance.', 'Treat an unavailable feed as a blocking state.'],
    fields: ['The local demonstration is explicitly synthetic.', 'No operational reporting issuer is connected in this candidate.'],
    next: 'Wait for an independently governed operational dataset before using these views for decisions.'
  }
};

const managerGuidance: Record<ManagerTab, { purpose: string; actions: string[]; fields: string[]; next: string }> = {
  'My Team': {
    purpose: 'Review direct-report Workplan and quarterly-review status from one governed manager view.',
    actions: ['Choose an employee with a submitted item requiring review.', 'Read the complete Core, Impact and Behaviours evidence before taking a manager action.'],
    fields: ['Workplan and quarter states are written as text.', 'Readiness and review counts identify the next available action.'],
    next: 'Open the relevant employee review, then approve and lock or request changes with a clear reason.'
  },
  'Reviews Awaiting Me': {
    purpose: 'Focus on submitted annual and quarterly reviews that require the signed-in manager.',
    actions: ['Open one waiting review at a time.', 'Check the employee evidence and any readiness issue before deciding.'],
    fields: ['Employee, review period and state identify the item.', 'Core, Impact, Behaviours and Overall Delivery retain separate text meaning.'],
    next: 'Complete the manager decision or request specific changes; the item then follows its governed lifecycle.'
  },
  'Employee Review': {
    purpose: 'Locate submitted annual Workplans for current direct reports.',
    actions: ['Choose an available employee review.', 'Open the employee from My Team to inspect the complete Workplan before deciding.'],
    fields: ['State shows the annual lifecycle position.', 'Core and Impact counts identify the employee commitments present.'],
    next: 'Open the employee in My Team and complete the governed annual review action.'
  },
  'Quarterly Review': {
    purpose: 'Locate submitted quarterly reviews for current direct reports.',
    actions: ['Choose an available employee quarter.', 'Open it from My Team to inspect progress, recovery and Behaviour evidence.'],
    fields: ['Quarter and state identify the review period and lifecycle position.', 'Review-item count confirms the evidence set returned.'],
    next: 'Open the employee in My Team and complete the governed quarterly review action.'
  }
};

export const IntegratedManagerScreenGuidance: React.FC<{ tab: ManagerTab }> = ({ tab }) => {
  const guide = managerGuidance[tab];
  return <IntegratedScreenGuidance purpose={guide.purpose} actions={guide.actions}
    fields={[...guide.fields, ...governedTerms]} next={guide.next} />;
};

export const ReportingView: React.FC<{ tab: ReportingTab; data: IIntegratedData; localSyntheticReportingDataset?: IReportingViewsDataset }> = ({ tab, data, localSyntheticReportingDataset }) => {
  if (tab === 'Performance reporting views') {
    const loopback = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    const dataset = loopback && localSyntheticReportingDataset && validateReportingDataset(localSyntheticReportingDataset).length === 0
      ? localSyntheticReportingDataset : undefined;
    return <section className={styles.singlePage}>
      {dataset && <p className={styles.notice} role="status"><strong>SYNTHETIC LOCAL DEMONSTRATION</strong> · Example data only. No operational reporting result or approved source is connected.</p>}
      <ReportingViewsPage dataset={dataset} />
    </section>;
  }
  const counts = integratedReferenceCounts(data.kpis);
  const outputs = data.reporting?.outputDefinitions || [];
  const readinessReasons = getIntegratedReportingReadinessReasons(counts, data.reporting, data.configs);
  const guide = reportingGuidance[tab];
  const guidance = <IntegratedScreenGuidance purpose={guide.purpose} actions={guide.actions} fields={[...guide.fields, ...governedTerms]} next={guide.next} />;
  if (tab === 'Reporting Readiness') return <section className={styles.singlePage}><header className={styles.sectionHeader}><div><span>Reporting</span><h2>Reporting Readiness</h2></div><strong>{readinessReasons.length ? 'NOT READY' : 'READY'}</strong></header>{guidance}<div className={styles.metricGrid}><article><strong>{counts.kpis === 109 ? '109 / 109' : `${counts.kpis} / 109`}</strong><span>Core KPI catalogue</span></article><article><strong>{counts.targets}</strong><span>KPIs with organisation targets</span></article><article><strong>{counts.memberships}</strong><span>Confirmed reporting memberships</span></article><article><strong>{counts.officialActuals}</strong><span>Official Actuals available</span></article></div>{readinessReasons.length > 0 && <ul className={styles.issueList}>{readinessReasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}</section>;
  if (tab === 'GOLD / organisation reporting') return <section className={styles.singlePage}><header className={styles.sectionHeader}><div><span>Reporting</span><h2>GOLD / organisation reporting</h2></div></header>{guidance}<ResponsiveTableRegion label="Organisation Core reporting table"><table><thead><tr><th>KPI ID</th><th>Wording</th><th>Target</th><th>Official Actual</th><th>Memberships</th></tr></thead><tbody>{data.kpis.map(row => <tr key={row.kpiId}><td>{row.kpiId}</td><td>{row.wording}</td><td>{textValue(row.annualTarget, row.unit)}</td><td>{textValue(row.officialActual, row.unit)}</td><td>{row.memberships.join(', ') || 'No confirmed current mapping'}</td></tr>)}</tbody></table></ResponsiveTableRegion>{!data.kpis.length && <Empty title="Core reporting data unavailable" message="No current Core reporting rows were returned."
    nextStep="Return to Reporting Readiness and resolve the named catalogue or source-data dependency." />}</section>;
  const matchingOutputs = outputs.filter(row => /CWOP|CWSP/i.test(`${row.outputCode} ${row.outputName}`));
  return <section className={styles.singlePage}><header className={styles.sectionHeader}><div><span>Reporting</span><h2>CWOP / CWSP</h2></div></header>{guidance}<div className={styles.dataGrid}>{matchingOutputs.map(row => <article key={`${row.outputCode}|${row.version}`}><h3>{row.outputName}</h3><p>{row.description || 'No description recorded'}</p><strong>{row.publicationStatus}</strong></article>)}</div>{!matchingOutputs.length && <Empty title="No current output available" message="No confirmed current CWOP or CWSP output definition was returned."
    nextStep="Check Reporting Readiness, then ask the governed output owner to confirm the definition." />}</section>;
};

const IntegratedPerformanceHub: React.FC<IIntegratedPerformanceHubProps> = ({ dataService, adminReportingDataService,
  currentUserEmail, userDisplayName, nativeWritesHeld: inheritedWritesHeld = false, optionEDraftGateway, optionEPrivateDraftV3Gateway, optionEDraftCreateIntegration, optionEV4SubmitClient, behaviourFocusCatalogueV2,
  behaviourLibraryAsOf, behaviourCatalogueAuthority, behaviourCatalogueAsOfDate, managerBehaviourGateway, behaviourCatalogueAdministration,
  localSyntheticReportingDataset, localSyntheticLifecycleFixture, adminMasterSourceReader }) => {
  const nativeWritesHeld = inheritedWritesHeld || Boolean(optionEDraftGateway && optionEPrivateDraftV3Gateway);
  const localPrivateSave = !optionEDraftGateway && isCurrentLocalPrivateGateway(optionEPrivateDraftV3Gateway, currentUserEmail);
  const privateDraftWritesHeld = nativeWritesHeld && !localPrivateSave;
  const privateDraftSchema = optionEPrivateDraftV3Gateway ? OPTION_E_DRAFT_V3_SCHEMA_VERSION : 'kcf.workplan-draft/v1';
  const v3Editor = React.useRef<PrivateDraftV3EditorSession>();
  const actualV3Readback = React.useRef<{ loadKey: object; value: IEmployeeWorkplanReadbackV2; catalogue: readonly ICoreKpiCatalogueItem[] }>();
  const sameActorRecovery = React.useRef<{ email: string; snapshot: IOptionEDraftSaveSnapshot<OptionEPrivateDraftAggregate> }>();
  const recoveryNeedsDecision = React.useRef(false);
  if (sameActorRecovery.current && sameActorRecovery.current.email !== currentUserEmail.trim().toLowerCase()) {
    sameActorRecovery.current = undefined; recoveryNeedsDecision.current = false;
  }
  const clearPrivateRecovery = (): void => { sameActorRecovery.current = undefined; recoveryNeedsDecision.current = false; };
  const [area, setArea] = React.useState<ProductArea>('home');
  const [builderTab, setBuilderTab] = React.useState<BuilderTab>('Core KPIs');
  const [managerTab, setManagerTab] = React.useState<ManagerTab>('My Team');
  const [adminTab, setAdminTab] = React.useState<AdminTab>('People');
  const [reportingTab, setReportingTab] = React.useState<ReportingTab>('Reporting Readiness');
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const menuButtonRef = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    if (!mobileOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMobileOpen(false);
      menuButtonRef.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileOpen]);
  const [data, setData] = React.useState<IIntegratedData>({ kpis: [], people: [], directReports: [], teams: [], configs: [], objectives: [], annualReviews: [], quarterReviews: [], quarterLifecycles: [], warnings: [] });
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [workplan, setWorkplan] = React.useState<IAnnualWorkplan>();
  const [catalogue, setCatalogue] = React.useState<ICoreKpiCatalogueItem[]>([]);
  const [coreItems, setCoreItems] = React.useState<IIntegratedCoreWorkplanItem[]>([]);
  const [personalItems, setPersonalItems] = React.useState<IPersonalWorkplanItem[]>([]);
  const [publishedBehaviours, setPublishedBehaviours] = React.useState<IBehaviourSummary[]>([]);
  const [behaviourItems, setBehaviourItems] = React.useState<IBehaviourWorkplanItem[]>([]);
  const [quarterContext, setQuarterContext] = React.useState<IQuarterReviewContext>();
  const [selectedQuarter, setSelectedQuarter] = React.useState<QuarterKey>();
  const [quarterLoading, setQuarterLoading] = React.useState(false);
  const quarterSelectionRequest = React.useRef<object>();
  const quarterMutationRequest = React.useRef<object>();
  const annualMutationRequest = React.useRef<object>();
  const [core, setCore] = React.useState<ICoreChoice[]>([]);
  const [coreWeightingMode, setCoreWeightingMode] = React.useState<EmployeeCoreWeightingModeV2>('Equal');
  const [coreSessionChanged, setCoreSessionChanged] = React.useState(false);
  const [draftSessionChanged, setDraftSessionChanged] = React.useState(false);
  const [coreSaveIssues, setCoreSaveIssues] = React.useState<ICoreSavePreflightIssue[]>([]);
  const [coreCorrectionRequest, setCoreCorrectionRequest] = React.useState<{ kpiId: string; sequence: number }>();
  const coreCorrectionSequenceRef = React.useRef(0);
  const [personal, setPersonal] = React.useState<IPersonalChoice[]>([]);
  const [behaviours, setBehaviours] = React.useState<IBehaviourChoice[]>(() => EMPLOYEE_V2_APPROVED_BEHAVIOURS.map(item => ({
    behaviourId: item.behaviourId, selectedSuggestionKeys: [], commitment: '',
    q1: '', q2: '', q3: '', q4: '', h1: '', h2: ''
  })));
  const [managerMessage, setManagerMessage] = React.useState('');
  const [managerBehaviourReadModels, setManagerBehaviourReadModels] = React.useState<Readonly<Record<string, IOptionEBehaviourManagerReadModel>>>({});
  const [employeeMessage, setEmployeeMessage] = React.useState('');
  const optionEDraftController = React.useMemo(() => {
    if (optionEDraftGateway && optionEPrivateDraftV3Gateway) return undefined;
    if (optionEPrivateDraftV3Gateway) return new OptionEDraftSaveController<OptionEPrivateDraftAggregate>(optionEPrivateDraftV3Gateway, undefined, undefined, OPTION_E_DRAFT_V3_SCHEMA_VERSION);
    return optionEDraftGateway ? new OptionEDraftSaveController<OptionEPrivateDraftAggregate>(optionEDraftGateway) : undefined;
  }, [optionEDraftGateway, optionEPrivateDraftV3Gateway, currentUserEmail, dataService]);
  const [rawOptionEDraftSave, setOptionEDraftSave] = React.useState<IOptionEDraftSaveSnapshot<OptionEPrivateDraftAggregate>>();
  const optionEV4Submit = React.useMemo(() => optionEV4SubmitClient
    || new OptionEWorkplanSubmitExactBodyV4Client(), [optionEV4SubmitClient]);

  const historyLoadKey = React.useMemo(() => ({}),
    [currentUserEmail, dataService, adminReportingDataService, optionEDraftController, managerBehaviourGateway]);
  const [observedDraftPair, setObservedDraftPair] = React.useState<{
    loadKey: object; header: IAnnualWorkplan; actor: IProductionPerson; year: number;
  }>();
  const pairMatches = observedDraftPair?.loadKey === historyLoadKey && Boolean(rawOptionEDraftSave?.canonical)
    && matchesPrivateDraftHeader(observedDraftPair.header, rawOptionEDraftSave?.canonical,
      observedDraftPair.actor, currentUserEmail, observedDraftPair.year, privateDraftSchema);
  // A controller read is not a matched header receipt. Never expose an unpaired canonical record.
  const optionEDraftSave: IOptionEDraftSaveSnapshot<OptionEPrivateDraftAggregate> | undefined = !optionEDraftController ? undefined
    : rawOptionEDraftSave?.canonical && (!pairMatches || rawOptionEDraftSave.requiresCanonicalReopen)
      ? { ...rawOptionEDraftSave, canonical: undefined, status: 'NotSaved',
        visibleStatus: rawOptionEDraftSave.retainedBuffer
          ? 'Not saved — your changes remain in this session. Reload your saved Workplan to continue.'
          : 'Not saved — reload your Workplan to confirm its saved Draft.',
        canResolveConflict: false, requiresCanonicalReopen: true }
      : rawOptionEDraftSave;
  const lifecycleSession = React.useMemo(() => createYearLifecycleSyntheticSourceSession(localSyntheticLifecycleFixture, {
    hostname: typeof window === 'undefined' ? '' : window.location.hostname,
    isAdmin: applicationEntryCapabilities(data.overview?.employee).admin
      && data.overview?.employee?.email === currentUserEmail,
    signedInEmail: currentUserEmail,
    sessionId: localSyntheticLifecycleFixture?.sessionId || ''
  }), [localSyntheticLifecycleFixture, historyLoadKey, data.overview?.employee]);
  React.useEffect(() => () => lifecycleSession.discard(), [lifecycleSession]);
  const currentHistoryLoadKey = React.useRef<object | undefined>(historyLoadKey);
  currentHistoryLoadKey.current = historyLoadKey;
  type CurrentSavedWorkplanRead = Readonly<{ loadKey: object; workplan: string; person: string; year: number }>;
  const [historyBinding, setHistoryBinding] = React.useState<{
    loadKey: object; year: number; savedWorkplanRead?: CurrentSavedWorkplanRead
  }>();
  React.useEffect(() => {
    setOptionEDraftSave(undefined);
    return optionEDraftController?.subscribe(snapshot => {
      if (currentHistoryLoadKey.current !== historyLoadKey) return;
      setOptionEDraftSave(snapshot);
      if (privateDraftSchema === OPTION_E_DRAFT_V3_SCHEMA_VERSION && snapshot.retainedBuffer && snapshot.buffer
        && snapshot.canonical?.binding.email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase()) {
        sameActorRecovery.current = { email: currentUserEmail.trim().toLowerCase(), snapshot };
      }
    });
  }, [optionEDraftController, historyLoadKey, currentUserEmail, privateDraftSchema]);
  React.useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      const recovery = sameActorRecovery.current;
      const hasOwnRecovery = recovery?.email === currentUserEmail.trim().toLowerCase()
        && Boolean(recovery.snapshot.retainedBuffer && recovery.snapshot.buffer);
      if (!optionEDraftController?.shouldWarnBeforeUnload() && !hasOwnRecovery) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [optionEDraftController, currentUserEmail]);

  const applyWorkplanReadback = (readback: IEmployeeWorkplanReadbackV2): void => {
    // Internal persistence contract: canonical Employee V2 readback. Never expose this implementation wording in the UI.
    const loadedCore = readback.coreItems.map(legacyCoreItem);
    setWorkplan(readback.workplan);
    setCoreItems(loadedCore);
    setPersonalItems(readback.personalItems);
    setBehaviourItems(readback.behaviourItems);
    setCoreWeightingMode(readback.workplan.coreWeightingMode || 'Equal');
    setCoreSessionChanged(false);
    setDraftSessionChanged(false);
    setCoreSaveIssues([]);
    setCore(readback.coreItems.filter(item => item.activeInWorkplan).sort((a, b) => a.displayOrder - b.displayOrder).map(item => ({
      kpiId: item.kpiId, role: roleToChoice(item.employeeKpiRole),
      roleEvidence: item.employeeKpiRole && !roleToChoice(item.employeeKpiRole) ? 'UnsupportedStoredRole' : undefined,
      ownerDirect: item.employeeKpiRole === 'AccountableOwner' && item.contributionMethod === 'AdditiveDirect',
      weight: item.coreWorkplanWeight || 0, annualContribution: targetText(item.annualTargetValue, item.annualTargetText),
      q1: quarterContributionText(item, 'Q1'), q2: quarterContributionText(item, 'Q2'),
      q3: quarterContributionText(item, 'Q3'), q4: quarterContributionText(item, 'Q4'),
      q1Success: quarterSuccessText(item, 'Q1'), q2Success: quarterSuccessText(item, 'Q2'),
      q3Success: quarterSuccessText(item, 'Q3'), q4Success: quarterSuccessText(item, 'Q4'),
      contributionMethod: item.contributionMethod, sharedTargetRule: item.sharedTargetRule,
      sharedApportionmentPercent: item.sharedApportionmentPercent, governanceReference: item.governanceReference,
      denominatorNumerator: item.denominatorNumerator, denominatorValue: item.denominatorValue,
      denominatorUnit: item.denominatorUnit, denominatorRuleReference: item.denominatorRuleReference,
      denominatorSourceReference: item.denominatorSourceReference
    })));
    setPersonal(readback.personalItems.filter(item => item.activeInWorkplan).sort((a, b) => a.displayOrder - b.displayOrder).map(readImpactDraft));
    setBehaviours(EMPLOYEE_V2_APPROVED_BEHAVIOURS.map(definition => behaviourChoiceFromReadback(definition.behaviourId,
      readback.behaviourItems.find(candidate => candidate.behaviourId === definition.behaviourId && candidate.activeInWorkplan))));
    setData(current => ({ ...current, overview: current.overview
      ? { ...current.overview, workplanStatus: readback.workplan.state } : current.overview }));
  };

  const observeMatchedPrivateHeader = (header: IAnnualWorkplan, canonical: IOptionEDraftCanonicalRecord<OptionEPrivateDraftAggregate> | undefined,
    actor: IProductionPerson, year: number): void => {
    if (!matchesPrivateDraftHeader(header, canonical, actor, currentUserEmail, year, privateDraftSchema)) {
      setObservedDraftPair(undefined);
      throw new Error('Your saved Workplan and Draft could not be verified together. Reload the Workplan before editing.');
    }
    setObservedDraftPair({ loadKey: historyLoadKey, header: { ...header }, actor: { ...actor }, year });
  };

  const applyOptionEDraftAggregate = (aggregate: OptionEPrivateDraftAggregate): void => {
    let readback;
    if (aggregate.schemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION) {
      const source = actualV3Readback.current, canonical = optionEDraftController?.snapshot.canonical;
      if (!source || source.loadKey !== historyLoadKey || canonical?.aggregate.schemaVersion !== OPTION_E_DRAFT_V3_SCHEMA_VERSION) throw new Error('The full Draft readonly context is unavailable. Reload before editing.');
      const actual = { ...canonical, aggregate: canonical.aggregate } as IOptionEDraftCanonicalRecord<IOptionEWorkplanDraftV3Aggregate>;
      v3Editor.current = new PrivateDraftV3EditorSession({ canonical: actual, readback: source.value, catalogue: source.catalogue, loadKey: historyLoadKey }, aggregate);
      readback = v3Editor.current.view;
    } else readback = readIntegratedOptionEDraft(aggregate);
    setCore(readback.core);
    setPersonal(readback.personal);
    setBehaviours(readback.behaviours);
    setCoreWeightingMode(readback.weightingMode);
    setCoreSessionChanged(false);
    setCoreSaveIssues([]);
  };

  React.useEffect(() => {
    let active = true;
    quarterSelectionRequest.current = {};
    if (quarterMutationRequest.current || annualMutationRequest.current) setSaving(false);
    quarterMutationRequest.current = undefined;
    annualMutationRequest.current = undefined;
    // A replacement employee/source must never inherit the previous private editor.
    setWorkplan(undefined);
    setObservedDraftPair(undefined);
    v3Editor.current = undefined; actualV3Readback.current = undefined;
    setCoreItems([]); setPersonalItems([]); setBehaviourItems([]);
    setCore([]); setPersonal([]); setBehaviours([]);
    setCoreSessionChanged(false); setDraftSessionChanged(false); setCoreSaveIssues([]);
    setEmployeeMessage('');
    setQuarterContext(undefined);
    setQuarterLoading(false);
    setLoading(true);
    setData(current => ({ ...current, adminEventHistory: { status: 'denied' } }));
    setHistoryBinding(undefined);
    const load = async (): Promise<void> => {
      const warnings: string[] = [];
      let overview: IProductionOverview | undefined;
      let reporting: IAdminReportingControlSnapshot | undefined;
      try { overview = await loadProductionOverview(dataService, currentUserEmail); } catch { warnings.push('Your profile and current Workplan status could not be loaded.'); }
      if (applicationEntryCapabilities(overview?.employee).reporting) {
        try { reporting = await adminReportingDataService.getAdminReportingControlSnapshot(overview?.config?.performanceYearNumber || 2026); }
        catch { warnings.push('Current reporting controls could not be loaded.'); }
      }
      if (!active || currentHistoryLoadKey.current !== historyLoadKey) return;
      const year = reporting?.performanceYear || overview?.config?.performanceYearNumber || 2026;
      let savedWorkplanRead: CurrentSavedWorkplanRead | undefined;
      let people: IProductionPerson[] = [];
      let peopleReadAvailable = false;
      let teams: IAdminTeamRecord[] = [];
      let configs: IAdminConfigSourceRecord[] = [];
      let objectives: IBehaviourObjectiveLibraryRecord[] = [];
      let directReports: IProductionPerson[] = [];
      let annualReviews: IManagerWorkplanReviewContext[] = [];
      let quarterReviews: IManagerQuarterReviewContext[] = [];
      let quarterLifecycles: IQuarterLifecycle[] = [];
      let adminEventHistory: IIntegratedData['adminEventHistory'] = { status: 'denied' };
      if (overview?.employee) {
        const employee = overview.employee;
        const employeeEntry = applicationEntryCapabilities(employee);
        if (employee.active && employee.appRoles.includes('SystemAdmin')) {
          try {
            if (!dataService.getAuthoritativeAdminEventHistoryView) {
              throw new Error('Controlled Admin event history read is unavailable.');
            }
            const view = await dataService.getAuthoritativeAdminEventHistoryView(year);
            adminEventHistory = { status: 'ready', view };
          } catch (error) {
            adminEventHistory = error instanceof Error && /active SystemAdmin identity/.test(error.message)
              ? { status: 'denied' } : { status: 'unavailable' };
          }
        }
        const [objectiveResult, directResult] = await Promise.all([
          employeeEntry.employee ? settle(dataService.getBehaviourObjectiveLibrary(false))
            : Promise.resolve({ ok: true, value: [] as IBehaviourObjectiveLibraryRecord[] } as const),
          employeeEntry.manager ? settle(dataService.getDirectReports(employee))
            : Promise.resolve({ ok: true, value: [] as IProductionPerson[] } as const)
        ]);
        if (objectiveResult.ok) objectives = objectiveResult.value; else warnings.push('Suggested Behaviour objectives could not be loaded.');
        if (directResult.ok) directReports = directResult.value; else warnings.push('The current People hierarchy could not be resolved for Manager navigation.');

        if (employeeEntry.admin && getAdminFoundationEntitlement(employee.appRoles).entitled) {
          const adminResults = await Promise.all([
            settle(dataService.getAdminPeople(employee)), settle(dataService.getAdminTeams(employee)),
            settle(dataService.getAdminConfigRecords(employee))
          ]);
          if (adminResults[0].ok) { people = adminResults[0].value; peopleReadAvailable = true; } else warnings.push('People are unavailable to this governed Admin role.');
          if (adminResults[1].ok) teams = adminResults[1].value; else warnings.push('Teams are unavailable to this governed Admin role.');
          if (adminResults[2].ok) configs = adminResults[2].value; else warnings.push('Configuration is unavailable to this governed Admin role.');
        }

        if (directReports.length > 0) {
          const annualResult = await settle(dataService.getManagerReviewContexts(employee));
          if (annualResult.ok) annualReviews = annualResult.value; else warnings.push('Annual manager reviews are not available.');
          if (managerBehaviourGateway) {
            const reads = await Promise.all(directReports.map(async report => ({
              personKey: report.personKey, readModel: await managerBehaviourGateway.read(report.personKey)
            })));
            if (active) setManagerBehaviourReadModels(reads.reduce((result, item) => {
              result[item.personKey] = item.readModel;
              return result;
            }, {} as Record<string, IOptionEBehaviourManagerReadModel>));
          }
        }
        if (overview.config) {
          const timing = await settle(dataService.getQuarterTimingConfig());
          if (timing.ok) {
            quarterLifecycles = buildQuarterLifecycle(overview.config, timing.value, new Date());
            if (directReports.length > 0) {
              const managerQuarters = await settle(dataService.getManagerQuarterReviewContexts(employee, quarterLifecycles));
              if (managerQuarters.ok) quarterReviews = managerQuarters.value; else warnings.push('Quarterly manager reviews are not available.');
            }
          } else warnings.push('Quarter timing configuration is not available.');
        }

        const reference = await Promise.all([
          settle(dataService.getCoreKpiCatalogue(year)), settle(dataService.getPublishedBehaviours())
        ]);
        if (reference[0].ok) setCatalogue(reference[0].value); else warnings.push('The current Core KPI catalogue could not be loaded.');
        if (reference[1].ok) setPublishedBehaviours(reference[1].value); else warnings.push('Published Behaviours could not be loaded.');
        // This path is read-only: ordinary entry never calls the Draft-creation method.
        if (hasExistingWorkplan(overview.workplanStatus)) {
          const loaded = await settle(dataService.getEmployeeWorkplanV2(employee, year));
          if (!loaded.ok) warnings.push('Your saved Workplan could not be loaded. No Draft was created.');
          else if (!loaded.value) warnings.push('The Workplan status shows an existing plan, but its saved content is unavailable.');
          else if (active && currentHistoryLoadKey.current === historyLoadKey) {
            savedWorkplanRead = Object.freeze({ loadKey: historyLoadKey, workplan: loaded.value.workplan.workplanKey,
              person: loaded.value.workplan.personKey, year: loaded.value.workplan.performanceYear });
            // Noneditable annual states retain their existing rich read-only/Quarterly view.
            if (loaded.value.workplan.state !== 'Draft' && loaded.value.workplan.state !== 'ChangesRequested') {
              applyWorkplanReadback(loaded.value);
            }
            if (optionEDraftController && annualWorkplanIsEditable(loaded.value.workplan) && overview.config
              && Number.isSafeInteger(overview.config.performanceYearNumber)
              && overview.config.performanceYearNumber >= 1000 && overview.config.performanceYearNumber <= 9999) {
              const recovery = privateDraftSchema === OPTION_E_DRAFT_V3_SCHEMA_VERSION ? sameActorRecovery.current : undefined;
              const optionEDraft = await settle(optionEDraftController.open({
                performanceYear: overview.config.performanceYearNumber
              }));
              if (active && optionEDraft.ok) {
                try {
                  actualV3Readback.current = { loadKey: historyLoadKey, value: loaded.value, catalogue: reference[0].ok ? reference[0].value : [] };
                  observeMatchedPrivateHeader(loaded.value.workplan, optionEDraftController.snapshot.canonical, employee, year);
                  applyWorkplanReadback(loaded.value);
                  applyOptionEDraftAggregate(optionEDraft.value);
                  if (recovery && sameActorRecovery.current === recovery && recovery.snapshot.buffer && recovery.snapshot.canonical
                    && recovery.email === currentUserEmail.trim().toLowerCase()) {
                    const previous = recovery.snapshot.canonical, latest = optionEDraftController.snapshot.canonical!;
                    if (previous.itemId === latest.itemId && previous.binding.workplanUniqueId === latest.binding.workplanUniqueId
                      && previous.binding.peopleUniqueId === latest.binding.peopleUniqueId && previous.binding.workplanKey === latest.binding.workplanKey
                      && previous.binding.performanceYear === latest.binding.performanceYear && previous.aggregate.schemaVersion === latest.aggregate.schemaVersion) {
                      if (previous.payloadJson === latest.payloadJson && previous.etag === latest.etag) {
                        optionEDraftController.replaceBuffer(recovery.snapshot.buffer); applyOptionEDraftAggregate(recovery.snapshot.buffer);
                        recoveryNeedsDecision.current = false; setEmployeeMessage('Your unsaved changes remain in this employee session. They have not been saved.');
                      } else {
                        recoveryNeedsDecision.current = true;
                        optionEDraftController.holdUnserializableChanges('Your earlier unsaved changes are retained. The saved Draft changed; choose Reload or explicitly Reapply retained changes.');
                      }
                    } else {
                      recoveryNeedsDecision.current = true;
                      optionEDraftController.holdUnserializableChanges('Your earlier changes belong to another private Draft binding. Return to that Draft; they cannot be applied here.');
                    }
                  }
                } catch (error) { setObservedDraftPair(undefined); warnings.push(error instanceof Error ? error.message : 'The private Draft header could not be confirmed.'); }
              }
              else if (!optionEDraft.ok) warnings.push('The private aggregate Draft could not be loaded; Save remains fail-closed.');
            } else if (optionEDraftController && annualWorkplanIsEditable(loaded.value.workplan)) warnings.push('The governed performance year is unavailable; aggregate Draft Save remains fail-closed.');
            else applyWorkplanReadback(loaded.value);
            const loadedCore = loaded.value.coreItems.map(legacyCoreItem);
            if (isAnnualWorkplanEligibleForQuarterlyDraft(loaded.value.workplan) && overview.manager && quarterLifecycles.length) {
                const selected = getCurrentQuarter(quarterLifecycles) || quarterLifecycles[0];
                setSelectedQuarter(selected.quarterKey);
                const source: IQuarterDraftSource = { workplan: loaded.value.workplan, employee, manager: overview.manager,
                  lifecycle: selected, coreCatalogue: reference[0].ok ? reference[0].value : [], coreItems: loadedCore,
                  personalItems: loaded.value.personalItems, behaviours: reference[1].ok ? reference[1].value : [],
                  behaviourItems: loaded.value.behaviourItems };
                const currentQuarter = await settle(dataService.getQuarterReviewContext(source));
                if (active && currentQuarter.ok && currentQuarter.value.review) {
                  const canonicalQuarter = await settle(dataService.getEmployeeQuarterV2({
                    commandKey: integratedEmployeeCommandKey(employee.email, currentQuarter.value.review.quarterReviewKey,
                      currentQuarter.value.review.rowVersionToken, 'read-initial-quarter'), actor: employee,
                    workplan: loaded.value.workplan, review: currentQuarter.value.review
                  }));
                  if (!active || currentHistoryLoadKey.current !== historyLoadKey) return;
                  setQuarterContext(canonicalQuarter.ok && canonicalQuarter.value
                    ? { ...currentQuarter.value, review: canonicalQuarter.value.review, items: canonicalQuarter.value.items,
                      evidence: canonicalQuarter.value.evidence, auditEvents: canonicalQuarter.value.audits }
                    : undefined);
                  if (!canonicalQuarter.ok || !canonicalQuarter.value) setEmployeeMessage('The canonical Quarter Review could not be confirmed. Reload before making changes.');
                } else if (active && currentQuarter.ok) setQuarterContext(currentQuarter.value);
            }
          }
        }
      }
      const kpis = buildIntegratedKpis(year, reporting);
      if (active && currentHistoryLoadKey.current === historyLoadKey) {
        setData({ overview, reporting, adminEventHistory, kpis, people, peopleReadAvailable, directReports, teams, configs, objectives, annualReviews, quarterReviews, quarterLifecycles, warnings });
        setHistoryBinding({ loadKey: historyLoadKey, year, savedWorkplanRead });
        setLoading(false);
      }
    };
    load().catch(() => { if (active && currentHistoryLoadKey.current === historyLoadKey) {
      setData(current => ({ ...current, adminEventHistory: { status: 'unavailable' }, kpis: buildIntegratedKpis(2026), warnings: ['The current reference-data refresh failed. The approved catalogue remains available.'] }));
      setHistoryBinding(undefined);
      setLoading(false);
    } });
    return () => {
      active = false;
      // Invalidate old completions immediately. Retain their busy marker until
      // the replacement effect releases it; cleanup must not update unmounted state.
      quarterSelectionRequest.current = undefined;
      if (currentHistoryLoadKey.current === historyLoadKey) currentHistoryLoadKey.current = undefined;
    };
  }, [currentUserEmail, dataService, adminReportingDataService, optionEDraftController, managerBehaviourGateway, historyLoadKey]);

  const historyYear = data.reporting?.performanceYear || data.overview?.config?.performanceYearNumber || 2026;
  const currentAdminData: IIntegratedData = historyBinding?.loadKey === historyLoadKey
    && historyBinding.year === historyYear && !loading ? data
      : { ...data, adminEventHistory: { status: 'denied' } };

  const user = data.overview?.employee;
  const currentSavedWorkplanRead = historyBinding?.loadKey === historyLoadKey
    && historyBinding.savedWorkplanRead?.loadKey === historyLoadKey
    && historyBinding.savedWorkplanRead.year === historyBinding.year ? historyBinding.savedWorkplanRead : undefined;
  const annualEditable = annualWorkplanIsEditable(workplan);
  // A new source/session/coordinate invalidates prior results before an async read can settle.
  // Retained builder state cannot stand in for this load's successful saved read.
  const captureCoordinates = React.useMemo(() => currentSavedWorkplanRead && workplan && user
    && currentSavedWorkplanRead.workplan === workplan.workplanKey && currentSavedWorkplanRead.person === user.personKey
    && currentSavedWorkplanRead.year === historyYear && workplan.personKey === user.personKey
    && workplan.performanceYear === historyYear ? Object.freeze({ workplan: workplan.workplanKey,
      person: user.personKey, year: workplan.performanceYear }) : undefined,
  [currentSavedWorkplanRead, historyLoadKey, workplan?.workplanKey, workplan?.personKey, workplan?.performanceYear, user?.personKey, historyYear]);
  const captureRequest = React.useMemo(() => ({}), [historyLoadKey, captureCoordinates]);
  const currentCaptureRequest = React.useRef(captureRequest);
  currentCaptureRequest.current = captureRequest;
  const [capturedHistory, setCapturedHistory] = React.useState<{ request: object; result: V5HistoryReadResult }>();
  React.useEffect(() => {
    let active = true;
    if (loading || historyBinding?.loadKey !== historyLoadKey || !captureCoordinates) return undefined;
    const receive = (result: V5HistoryReadResult): void => {
      if (!active || currentCaptureRequest.current !== captureRequest) return;
      const actual = result.status === 'DECODED_SOURCE_ONLY' ? result.projection.history.coordinates : undefined;
      setCapturedHistory({ request: captureRequest, result: actual && (actual.workplan !== captureCoordinates.workplan
        || actual.person !== captureCoordinates.person || actual.year !== captureCoordinates.year)
        ? { status: 'HOLD', reason: 'CoordinateMismatch' } : result });
    };
    Promise.resolve().then(() => dataService.getSubmittedWorkplanHistoryV5
      ? dataService.getSubmittedWorkplanHistoryV5(captureCoordinates)
      : { status: 'HOLD', reason: 'Unbound' } as const).then(receive,
      () => receive({ status: 'HOLD', reason: 'ReadUnavailable' }));
    return () => { active = false; };
  }, [captureRequest, captureCoordinates, dataService, loading, historyBinding, historyLoadKey]);
  const currentCapturedHistory: V5HistoryReadResult = !loading && historyBinding?.loadKey === historyLoadKey
    && captureCoordinates && capturedHistory?.request === captureRequest ? capturedHistory.result
    : { status: 'HOLD', reason: loading || (historyBinding && historyBinding.loadKey !== historyLoadKey)
      || (historyBinding?.loadKey === historyLoadKey && captureCoordinates) ? 'Loading' : 'ReadUnavailable' };
  const behaviourV2Journey = isBehaviourV2Journey(user, behaviourItems);
  const entry = applicationEntryCapabilities(user);
  const canManager = entry.manager;
  const adminEntitlement = getAdminFoundationEntitlement(user?.appRoles);
  const canAdmin = entry.admin && adminEntitlement.showAdminNavigation;
  const adminSourceYear = data.reporting?.performanceYear || data.overview?.config?.performanceYearNumber;
  const adminSourceKey = React.useMemo(() => ({}), [historyLoadKey, adminSourceYear, user?.personKey, user?.email, user?.appRoles, canAdmin, adminMasterSourceReader]);
  const currentAdminSourceKey = React.useRef(adminSourceKey);
  currentAdminSourceKey.current = adminSourceKey;
  const [adminMasterSource, setAdminMasterSource] = React.useState<{ key: object; result: AdminMasterReadResult }>();
  React.useEffect(() => {
    let active = true;
    if (loading || historyBinding?.loadKey !== historyLoadKey || !user || !adminMasterSourceReader) return undefined;
    if (!adminSourceYear || !Number.isInteger(adminSourceYear)) {
      setAdminMasterSource({ key: adminSourceKey, result: { status: 'HOLD', nativeAdmission: 'NOT_ADMITTED', reason: 'Governed active period unavailable' } });
      return undefined;
    }
    readAdminMasterSource(adminMasterSourceReader, { actor: currentUserEmail, person: user.personKey, year: adminSourceYear },
      canAdmin && adminEntitlement.entitled && user.email.toLowerCase() === currentUserEmail.toLowerCase()).then(result => {
      if (active && currentAdminSourceKey.current === adminSourceKey) setAdminMasterSource({ key: adminSourceKey, result });
    }).catch(() => { /* readAdminMasterSource fails closed; no mutation or fallback */ });
    return () => { active = false; };
  }, [adminSourceKey, loading, historyBinding, historyLoadKey, adminMasterSourceReader]);
  const visibleAdminMasterSource: AdminMasterReadResult | undefined = adminMasterSourceReader
    ? !loading && historyBinding?.loadKey === historyLoadKey && adminMasterSource?.key === adminSourceKey
      ? adminMasterSource.result : { status: 'HOLD', nativeAdmission: 'NOT_ADMITTED', reason: 'Captured Admin source loading or session unavailable' }
    : undefined;
  const canReporting = entry.reporting;
  const reportingOnly = entry.boardReadOnly && !entry.employee && !entry.manager && !entry.admin;
  const allowedArea = (next: ProductArea): boolean =>
    next === 'manager' ? canManager : next === 'admin' ? canAdmin
      : next === 'reporting' ? canReporting : entry.employee;
  const visibleArea: ProductArea = allowedArea(area) ? area
    : reportingOnly || (!entry.employee && canReporting) ? 'reporting'
      : canManager ? 'manager' : canAdmin ? 'admin' : 'home';
  const annualWorkplans = data.annualReviews.map(context => context.workplan);
  const quarterReviewRecords = data.quarterReviews.map(context => context.review);
  const quarterItems = data.quarterReviews.reduce((all, context) => all.concat(context.items), [] as IManagerQuarterReviewContext['items']);
  const managerExperience = buildManagerExperience({ authenticatedPerson: user, people: user ? [user, ...data.directReports] : [], workplans: annualWorkplans, quarterReviews: quarterReviewRecords, quarterReviewItems: quarterItems, nowIso: new Date().toISOString() });
  const nav = (next: ProductArea): void => {
    if (allowedArea(next)) setArea(next);
    if (mobileOpen) menuButtonRef.current?.focus();
    setMobileOpen(false);
  };
  const adminTabs: AdminTab[] = ['People', 'Teams', 'KPI Master', 'Annual Targets', 'Behaviour Library', 'Config', 'Reporting Map', 'Output Definitions', 'Strategic Core Coverage', 'History & Audit', 'Data Quality'];
  const counts = integratedReferenceCounts(data.kpis);
  const buildCurrentGovernedBehaviourExtension = (
    nextBehaviours: readonly IBehaviourChoice[]
  ): IOptionEGovernedBehaviourExtension | undefined => {
    const roleLevelCode = optionEBehaviourRoleCode(user?.behaviourRoleTierV2);
    if (!behaviourFocusCatalogueV2 || !behaviourCatalogueAuthority || !behaviourCatalogueAsOfDate || !roleLevelCode) {
      return undefined;
    }
    return buildOptionEBehaviourGovernedExtension({
      catalogue: behaviourFocusCatalogueV2, authority: behaviourCatalogueAuthority,
      roleLevelCode, asOfDate: behaviourCatalogueAsOfDate,
      headlines: nextBehaviours.map(choice => ({
        behaviourKey: choice.behaviourId as BehaviourKey,
        selections: (choice.selections || []).map(selection => ({ ...selection,
          storedSnapshot: choice.optionEGovernedSnapshots?.find(snapshot =>
            snapshot.selectionKey === selection.selectionKey)
        }))
      }))
    });
  };
  const retainOptionEDraftBuffer = (nextCore: readonly ICoreChoice[], nextPersonal: readonly IPersonalChoice[],
    nextBehaviours: readonly IBehaviourChoice[], weightingMode: WeightMode = coreWeightingMode): void => {
    if (!optionEDraftController) return;
    try {
      if (privateDraftSchema === OPTION_E_DRAFT_V3_SCHEMA_VERSION) {
        if (v3Editor.current?.context.loadKey !== historyLoadKey) throw new Error('The full private Draft context is unavailable. Reload before editing.');
        optionEDraftController.replaceBuffer(v3Editor.current.update({ core: [...nextCore], personal: [...nextPersonal], behaviours: [...nextBehaviours], weightingMode }));
        return;
      }
      optionEDraftController.replaceBuffer(buildIntegratedOptionEDraft({
        core: nextCore, personal: nextPersonal, behaviours: nextBehaviours, coreItems, catalogue,
        objectives: data.objectives, coreWeightingMode: weightingMode,
        behaviourRoleTier: nextBehaviours[0]?.roleTier || user?.behaviourRoleTierV2,
        governedBehaviourExtension: buildCurrentGovernedBehaviourExtension(nextBehaviours),
        retainedPersonalItems: personalItems, overallDeliveryWeightConfiguration: workplan?.overallDeliveryWeightConfiguration
      }));
    } catch (error) {
      optionEDraftController.holdUnserializableChanges(error instanceof Error ? error.message : 'The Draft content could not be retained safely.');
      setEmployeeMessage(error instanceof Error ? `Draft not saved: ${error.message}` : 'The governed Behaviour binding is invalid.');
    }
  };
  const updateCoreSession = (next: ICoreChoice[]): void => {
    if (!annualEditable) return;
    setCore(next);
    retainOptionEDraftBuffer(next, personal, behaviours);
    setCoreSessionChanged(true);
    setDraftSessionChanged(true);
    setCoreSaveIssues([]);
    setEmployeeMessage(workplan
      ? 'Unsaved session changes. Use Review & Weight when you are ready to save.'
      : 'Session only — not saved. Start My Workplan before saving or submitting.');
  };
  const updatePersonalSession = (next: IPersonalChoice[]): void => {
    if (!annualEditable) return;
    setPersonal(next);
    setDraftSessionChanged(true);
    retainOptionEDraftBuffer(core, next, behaviours);
    setEmployeeMessage('Unsaved session changes. Use Review & Weight when you are ready to save.');
  };
  const updateBehaviourSession = (next: IBehaviourChoice[]): void => {
    if (!annualEditable) return;
    setBehaviours(next);
    setDraftSessionChanged(true);
    retainOptionEDraftBuffer(core, personal, next);
    setEmployeeMessage('Unsaved session changes. Use Review & Weight when you are ready to save.');
  };
  const requestCoreCorrection = React.useCallback((kpiId: string): void => {
    coreCorrectionSequenceRef.current += 1;
    setCoreCorrectionRequest({ kpiId, sequence: coreCorrectionSequenceRef.current });
  }, []);
  const acknowledgeCoreCorrection = React.useCallback((handled: { kpiId: string; sequence: number }): void => {
    setCoreCorrectionRequest(current => current?.kpiId === handled.kpiId && current.sequence === handled.sequence
      ? undefined : current);
  }, []);

  const reloadManagerData = async (): Promise<void> => {
    if (!user) return;
    const [annual, quarter] = await Promise.all([
      dataService.getManagerReviewContexts(user),
      dataService.getManagerQuarterReviewContexts(user, data.quarterLifecycles)
    ]);
    setData(current => ({ ...current, annualReviews: annual, quarterReviews: quarter }));
  };

  const beginAnnualMutation = (): (() => boolean) | undefined => {
    if (annualMutationRequest.current) return undefined;
    const request = {};
    annualMutationRequest.current = request;
    return () => annualMutationRequest.current === request && currentHistoryLoadKey.current === historyLoadKey;
  };
  const finishAnnualMutation = (isCurrent: () => boolean): void => {
    if (!isCurrent()) return;
    annualMutationRequest.current = undefined;
    setSaving(false);
  };
  const canStartWorkplan = !optionEPrivateDraftV3Gateway && !nativeWritesHeld && !saving && !workplan && Boolean(
    user?.active && user.email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase()
    && data.overview?.manager && optionEDraftGateway && optionEDraftController
    && optionEDraftCreateIntegration
    && readOptionEDraftCreateAdmission(optionEDraftCreateIntegration).admitted
    && Number.isSafeInteger(data.overview?.config?.performanceYearNumber)
  );
  const startWorkplan = async (): Promise<void> => {
    const year = data.overview?.config?.performanceYearNumber;
    if (!canStartWorkplan || !user || !year || !optionEDraftCreateIntegration
      || !optionEDraftGateway || !optionEDraftController) {
      setEmployeeMessage('Start My Workplan is unavailable. Nothing has been saved or created.');
      return;
    }
    const isCurrent = beginAnnualMutation();
    if (!isCurrent) return;
    setSaving(true);
    setEmployeeMessage('Checking the protected new Draft…');
    try {
      const canonical = await startAndOpenVerifiedDraft(optionEDraftCreateIntegration, optionEDraftGateway, {
        authenticatedEmail: currentUserEmail,
        performanceYear: year,
        correlationKey: `START-${user.personKey}-${year}`
      });
      if (!isCurrent()) return;
      const current = await dataService.getEmployeeWorkplanV2(user, year);
      if (!isCurrent()) return;
      if (!current || !matchesPrivateDraftHeader(current.workplan, canonical, user, currentUserEmail, year)) {
        throw new Error('The new Workplan could not be independently confirmed from SharePoint.');
      }
      const draft = await optionEDraftController.open({ performanceYear: year });
      if (!isCurrent()) return;
      observeMatchedPrivateHeader(current.workplan, optionEDraftController.snapshot.canonical, user, year);
      applyWorkplanReadback(current);
      applyOptionEDraftAggregate(draft);
      setEmployeeMessage('Your new Draft has been saved and reopened from SharePoint.');
      nav('build');
    } catch (error) {
      if (isCurrent()) setEmployeeMessage(`Start not confirmed. Do not enter work: ${error instanceof Error ? error.message : 'SharePoint did not confirm the new Draft.'}`);
    } finally {
      finishAnnualMutation(isCurrent);
    }
  };

  const saveDraft = async (
    category: { core: number; personal: number; behaviours: number },
    modes: { core: WeightMode; personal: WeightMode; behaviours: WeightMode },
    categoryReason: string,
    zeroPersonalReason: string
  ): Promise<void> => {
    if (privateDraftWritesHeld) { setEmployeeMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (recoveryNeedsDecision.current) { setEmployeeMessage('Your earlier changes remain unsaved. Choose Reload or Reapply retained changes before Save.'); return; }
    if (!workplan || !user) {
      setEmployeeMessage('Draft not saved. Start My Workplan first; your session changes remain unsaved.');
      return;
    }
    if (!annualEditable) { setEmployeeMessage('This Workplan is read-only. Reload the current editable Draft before saving.'); return; }
    if (optionEDraftController) {
      const currentDraft = optionEDraftController.snapshot;
      if (observedDraftPair?.loadKey !== historyLoadKey || currentDraft.requiresCanonicalReopen
        || !matchesPrivateDraftHeader(workplan, currentDraft.canonical, user, currentUserEmail, workplan.performanceYear, privateDraftSchema)) {
        setEmployeeMessage('Draft not saved. Reload your saved Workplan before saving these changes.');
        return;
      }
      const isCurrent = beginAnnualMutation();
      if (!isCurrent) return;
      setSaving(true); setEmployeeMessage('');
      try {
        const aggregate = privateDraftSchema === OPTION_E_DRAFT_V3_SCHEMA_VERSION
          ? (() => {
              if (v3Editor.current?.context.loadKey !== historyLoadKey) throw new Error('The full private Draft context is unavailable. Reload before saving.');
              if (category.core !== workplan.coreCategoryWeight || category.personal !== workplan.personalCategoryWeight || category.behaviours !== workplan.behaviourCategoryWeight) throw new Error('Protected category weights cannot be changed by private Draft Save.');
              return v3Editor.current.update({ core, personal, behaviours, weightingMode: modes.core }, { categoryWeightReason: categoryReason, zeroPersonalReason });
            })()
          : buildIntegratedOptionEDraft({
          core, personal, behaviours, coreItems, catalogue, objectives: data.objectives,
          coreWeightingMode: modes.core, behaviourRoleTier: behaviours[0]?.roleTier || user.behaviourRoleTierV2,
          governedBehaviourExtension: buildCurrentGovernedBehaviourExtension(behaviours),
          retainedPersonalItems: personalItems, overallDeliveryWeightConfiguration: workplan.overallDeliveryWeightConfiguration
        });
        optionEDraftController.replaceBuffer(aggregate);
        await optionEDraftController.save();
        if (!isCurrent()) return;
        const result = optionEDraftController.snapshot;
        if (result.status === 'Saved' && result.canonical) {
          if (!result.retainedBuffer) clearPrivateRecovery();
          observeMatchedPrivateHeader(workplan, result.canonical, user, workplan.performanceYear);
          applyOptionEDraftAggregate(result.canonical.aggregate);
          setEmployeeMessage(result.visibleStatus);
        } else {
          setEmployeeMessage(result.detail || result.visibleStatus);
        }
      } catch (error) {
        if (!isCurrent()) return;
        optionEDraftController.holdUnserializableChanges(error instanceof Error ? error.message : 'The Draft content could not be retained safely.');
        setEmployeeMessage(error instanceof Error ? `Draft not saved: ${error.message}` : 'The Draft could not be saved safely.');
      } finally { finishAnnualMutation(isCurrent); }
      return;
    }
    setSaving(true); setEmployeeMessage('');
    let confirmedCommands = 0;
    try {
      const canonical = await dataService.getEmployeeWorkplanV2(user, workplan.performanceYear);
      if (!canonical || canonical.workplan.workplanKey !== workplan.workplanKey
        || canonical.workplan.rowVersionToken !== workplan.rowVersionToken || canonical.workplan.etag !== workplan.etag) {
        throw new Error('This Workplan changed after it was loaded. Reload before saving; the stale edit was not applied.');
      }
      const behaviourV2Active = isBehaviourV2Journey(user, canonical.behaviourItems);
      const behaviourChanged = behaviourV2Active
        ? hasBehaviourV2Mutation(behaviours, canonical.behaviourItems)
        : hasDeferredBehaviourMutation(behaviours, canonical.behaviourItems);
      if (behaviourChanged) {
        if (!behaviourV2Active) {
          setBuilderTab('Behaviours');
          setEmployeeMessage('Draft not saved: Behaviour changes cannot be saved through this integrated v01 journey. Nothing was saved by this attempt. Use the existing Behaviour Draft route for v01 changes.');
          return;
        }
        if (!behaviourFocusCatalogueV2 || behaviourFocusCatalogueV2.status !== 'Published') {
          setBuilderTab('Behaviours');
          setEmployeeMessage('Draft not saved: a receipted, published focus catalogue is required before the first v02 command. Nothing was saved by this attempt.');
          return;
        }
        const behaviourIssues = getBehaviourV2SavePreflightIssues(behaviours, user, true);
        if (behaviourIssues.length) {
          setBuilderTab('Behaviours');
          setEmployeeMessage(`Draft not saved: Behaviour preflight failed before the first command. ${behaviourIssues.join(' ')} Nothing was saved by this attempt.`);
          return;
        }
      }
      // Validate IMPACT compatibility before any command can partially mutate this save.
      personal.forEach((choice, index) => projectImpactDraft(choice, canonical.personalItems.find(item => item.workplanItemKey === choice.key), index + 1));
      const coreIssues = getCoreSavePreflightIssues(core, catalogue);
      if (coreIssues.length > 0) {
        setCoreSaveIssues(coreIssues);
        setBuilderTab('Core KPIs');
        requestCoreCorrection(coreIssues[0].kpiId);
        setEmployeeMessage(`Draft not saved: ${coreSaveIssueText(coreIssues[0])} Nothing was saved by this attempt.`);
        return;
      }
      let current = canonical;
      const context = (operation: string, subjectKey: string, payload: unknown, expectedItemEtag?: string): IEmployeeV2ItemCommandContext => ({
        commandKey: integratedEmployeeCommandKey(user.email, current.workplan.workplanKey, current.workplan.rowVersionToken,
          operation, subjectKey, JSON.stringify(payload)), actor: user, workplan: current.workplan, subjectKey, expectedItemEtag
      });

      for (let index = 0; index < core.length; index += 1) {
        const choice = core[index];
        const kpi = catalogue.find(item => item.kpiId === choice.kpiId);
        const role = roleToService(choice);
        if (!kpi || !role || !choice.role) throw new Error('Every selected Core KPI requires its current catalogue record and role.');
        const existing = current.coreItems.find(item => item.kpiId === choice.kpiId);
        const method = resolveIntegratedContributionMethod(choice.role, choice.ownerDirect, choice.contributionMethod);
        const quarterTargets = quarters.map(quarter => {
          const value = choice[quarter.toLowerCase() as 'q1'] || '';
          const success = choice[`${quarter.toLowerCase()}Success` as 'q1Success'] || '';
          return method === 'AdditiveDirect' ? { quarter, targetValue: numeric(value) }
            : method === 'CompletionOversight' ? { quarter, commitment: value.trim(), successDefinition: success.trim() }
              : { quarter, targetText: value.trim() || undefined };
        });
        const input = {
          kpiId: choice.kpiId, role, contributionMethod: method,
          annualTargetValue: method === 'AdditiveDirect' ? numeric(choice.annualContribution || '') : undefined,
          annualTargetText: method === 'AdditiveDirect' ? undefined : choice.annualContribution?.trim(),
          quarterTargets, displayOrder: index + 1, activeInWorkplan: true,
          sharedTargetRule: choice.sharedTargetRule, sharedApportionmentPercent: choice.sharedApportionmentPercent,
          governanceReference: choice.governanceReference, denominatorNumerator: choice.denominatorNumerator,
          denominatorValue: choice.denominatorValue, denominatorUnit: choice.denominatorUnit,
          denominatorRuleReference: choice.denominatorRuleReference,
          denominatorSourceReference: choice.denominatorSourceReference
        };
        const subjectKey = existing?.workplanItemKey || `${current.workplan.workplanKey}|CoreGold|${choice.kpiId}`;
        const result = await dataService.upsertCoreContributionV2(context('upsert-core', subjectKey, input, existing?.etag), input);
        confirmedCommands += 1;
        // Serial command pipeline: each next command must use the preceding canonical version.
        // eslint-disable-next-line require-atomic-updates
        current = result.readback;
      }
      for (const existing of current.coreItems.filter(item => item.activeInWorkplan && !core.some(choice => choice.kpiId === item.kpiId))) {
        if (!existing.employeeKpiRole || !existing.contributionMethod) throw new Error(`Core item ${existing.kpiId} cannot be deactivated because its governed role or contribution treatment is unresolved.`);
        const input = {
          kpiId: existing.kpiId, role: existing.employeeKpiRole, contributionMethod: existing.contributionMethod,
          annualTargetValue: existing.annualTargetValue, annualTargetText: existing.annualTargetText,
          quarterTargets: existing.quarterTargets, displayOrder: existing.displayOrder, activeInWorkplan: false,
          sharedTargetRule: existing.sharedTargetRule, sharedApportionmentPercent: existing.sharedApportionmentPercent,
          governanceReference: existing.governanceReference, denominatorNumerator: existing.denominatorNumerator,
          denominatorValue: existing.denominatorValue, denominatorUnit: existing.denominatorUnit,
          denominatorRuleReference: existing.denominatorRuleReference, denominatorSourceReference: existing.denominatorSourceReference
        };
        const result = await dataService.upsertCoreContributionV2(context('deactivate-core', existing.workplanItemKey, input, existing.etag), input);
        confirmedCommands += 1;
        current = result.readback;
      }

      for (let index = 0; index < personal.length; index += 1) {
        const choice = personal[index];
        const existing = current.personalItems.find(item => item.workplanItemKey === choice.key);
        const input = projectImpactDraft(choice, existing, index + 1);
        const subjectKey = existing?.workplanItemKey || choice.key;
        const result = await dataService.upsertPersonalItemV2(context('upsert-personal', subjectKey, input, existing?.etag), input);
        confirmedCommands += 1;
        // eslint-disable-next-line require-atomic-updates
        current = result.readback;
      }
      for (const existing of current.personalItems.filter(item => item.activeInWorkplan && !personal.some(choice => choice.key === item.workplanItemKey))) {
        const input = retainImpactInput(existing, false);
        const result = await dataService.upsertPersonalItemV2(context('deactivate-personal', existing.workplanItemKey, input, existing.etag), input);
        confirmedCommands += 1;
        current = result.readback;
      }

      if (behaviourV2Active && behaviourChanged) {
        for (let index = 0; index < behaviours.length; index += 1) {
          const choice = behaviours[index];
          const input = behaviourInput(choice, user.behaviourCadenceV2!, index + 1);
          const existing = current.behaviourItems.find(item => item.behaviourId === choice.behaviourId
            && item.activeInWorkplan && Boolean(item.behaviourSnapshotV2));
          const subjectKey = existing?.workplanItemKey
            || `BHV2-${user.personKey}-${current.workplan.performanceYear}-${choice.behaviourId}`;
          const behaviourResult = await dataService.upsertBehaviourCommitmentV2(
            context('upsert-behaviour-v2', subjectKey, input, existing?.etag), input);
          confirmedCommands += 1;
          // Serial canonical reconciliation: the next command uses only this accepted readback.
          // eslint-disable-next-line require-atomic-updates
          current = behaviourResult.readback;
          const canonicalBehaviour = current.behaviourItems.find(item => item.behaviourId === choice.behaviourId
            && item.activeInWorkplan && Boolean(item.behaviourSnapshotV2));
          const expectedPeriods = input.periodCommitments.reduce((resultValue, entry) => ({
            ...resultValue, [entry.period]: entry.commitment.trim()
          }), {} as Record<string, string>);
          const expectedSelections = (input.selections || []).map(row => ({
            source: row.source, selectionKey: row.selectionKey,
            commitment: row.commitment.trim(), howWillWeKnow: row.howWillWeKnow.trim()
          })).sort((left, right) => left.selectionKey.localeCompare(right.selectionKey));
          const actualSelections = canonicalBehaviour?.behaviourSelectionSnapshotsV2?.selections.map(row => ({
            source: row.source, selectionKey: row.selectionKey,
            commitment: row.commitment, howWillWeKnow: row.howWillWeKnow
          })) || [];
          if (!canonicalBehaviour?.behaviourSnapshotV2
            || canonicalBehaviour.behaviourSnapshotV2.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION
            || canonicalBehaviour.behaviourSnapshotV2.roleTier !== user.behaviourRoleTierV2
            || canonicalBehaviour.behaviourSnapshotV2.cadence !== user.behaviourCadenceV2
            || canonicalBehaviour.behaviourCommitmentV2 !== input.commitment.trim()
            || JSON.stringify([...(canonicalBehaviour.selectedSuggestionKeys || [])].sort())
              !== JSON.stringify([...input.selectedSuggestionKeys].sort())
            || !canonicalBehaviour.behaviourSelectionSnapshotsSha256
            || JSON.stringify(actualSelections) !== JSON.stringify(expectedSelections)
            || JSON.stringify(canonicalBehaviour.behaviourPeriodCommitmentsV2) !== JSON.stringify(expectedPeriods)) {
            throw new Error(`${choice.behaviourId} did not reconcile to the accepted canonical v02 readback.`);
          }
        }
      }

      const weightingInput = modes.core === 'Equal' ? { mode: 'Equal' as const }
        : { mode: 'Custom' as const, customWeights: core.map(choice => ({ kpiId: choice.kpiId, weight: choice.weight })) };
      let result = await dataService.setCoreWeightingV2({
        commandKey: integratedEmployeeCommandKey(user.email, current.workplan.workplanKey, current.workplan.rowVersionToken,
          'set-core-weighting', JSON.stringify(weightingInput)), actor: user, workplan: current.workplan
      }, weightingInput);
      confirmedCommands += 1;
      // eslint-disable-next-line require-atomic-updates
      current = result.readback;
      if (!behaviourV2Active) {
        const draftInput = {
          coreCategoryWeight: category.core, personalCategoryWeight: category.personal,
          behaviourCategoryWeight: category.behaviours, categoryWeightReason: categoryReason.trim() || undefined,
          zeroPersonalProposal: personal.length === 0 && category.personal === 0 ? {
            employeeReason: zeroPersonalReason.trim(), coreCategoryWeight: category.core,
            personalCategoryWeight: 0 as const, behaviourCategoryWeight: category.behaviours
          } : undefined
        };
        result = await dataService.saveEmployeeWorkplanDraftV2({
          commandKey: integratedEmployeeCommandKey(user.email, current.workplan.workplanKey, current.workplan.rowVersionToken,
            'save-draft-header', JSON.stringify(draftInput)), actor: user, workplan: current.workplan
        }, draftInput);
        confirmedCommands += 1;
        // eslint-disable-next-line require-atomic-updates
        current = result.readback;
      }
      applyWorkplanReadback(current);
      setEmployeeMessage(behaviourV2Active
        ? 'Draft items saved and confirmed. Behaviour v02 remained unweighted; no legacy category balance was written.'
        : 'Draft saved and confirmed.');
    } catch (error) {
      setEmployeeMessage(confirmedCommands > 0
        ? `Partial save: ${confirmedCommands} command(s) were confirmed before the error. Reload the canonical Workplan before retrying. ${error instanceof Error ? error.message : ''}`
        : error instanceof Error ? `Draft not saved: ${error.message}` : 'The Draft could not be saved safely.');
    } finally { setSaving(false); }
  };

  const reloadOptionEDraft = async (): Promise<void> => {
    const controller = optionEDraftController;
    const retained = controller?.snapshot;
    if (!controller || !retained
      || retained.status === 'Saving' || retained.status === 'Checking'
      || retained.status === 'Loading') return;

    const explicitRecoveryReload = Boolean(recoveryNeedsDecision.current && retained.context);
    const isCurrent = beginAnnualMutation();
    if (!isCurrent) return;

    try {
      let aggregate: OptionEPrivateDraftAggregate | undefined;
      try {
        aggregate = explicitRecoveryReload && retained.context
          ? await controller.open(retained.context)
          : await controller.reloadCanonical();
      } catch (error) {
        if (isCurrent()) setEmployeeMessage(error instanceof Error ? error.message
          : 'The canonical Draft could not be reopened. Your retained changes remain unsaved.');
        return;
      }
      if (!isCurrent() || !aggregate || !workplan || !user) return;

      const current = controller.snapshot;
      if (current.status !== 'Saved' || current.retainedBuffer
        || current.requiresCanonicalReopen || !current.canonical || !current.buffer) {
        setEmployeeMessage(current.detail
          || 'Newer session changes remain unsaved. The earlier Reload did not discard them.');
        return;
      }

      // Guard above precedes this failure/restoration path so it cannot replace a newer edit.
      try { observeMatchedPrivateHeader(workplan, current.canonical, user, workplan.performanceYear); }
      catch (error) {
        if (!isCurrent()) return;
        if (retained.retainedBuffer) {
          if (retained.buffer) controller.replaceBuffer(retained.buffer);
          else controller.holdUnserializableChanges('The unsaved editor changes remain in this session.');
        }
        setEmployeeMessage(error instanceof Error ? error.message
          : 'The private Draft header could not be confirmed.');
        return;
      }

      // No await between the clean/current paired proof and this explicit commit.
      if (!isCurrent()) return;
      clearPrivateRecovery();
      applyOptionEDraftAggregate(aggregate);
      setEmployeeMessage('The latest protected canonical Draft was freshly loaded. Retained session changes were discarded by explicit choice.');
    } finally { finishAnnualMutation(isCurrent); }
  };

  const reapplyOptionEDraft = (): void => {
    const recovery = sameActorRecovery.current, current = optionEDraftController?.snapshot.canonical;
    if (recoveryNeedsDecision.current && recovery?.snapshot.buffer && recovery.snapshot.canonical && current && workplan && user) {
      const previous = recovery.snapshot.canonical;
      if (recovery.email !== currentUserEmail.trim().toLowerCase() || previous.itemId !== current.itemId
        || previous.binding.peopleUniqueId !== current.binding.peopleUniqueId
        || previous.binding.workplanUniqueId !== current.binding.workplanUniqueId
        || previous.binding.workplanKey !== current.binding.workplanKey || previous.binding.performanceYear !== current.binding.performanceYear
        || !matchesPrivateDraftHeader(workplan, current, user, currentUserEmail, workplan.performanceYear, privateDraftSchema)) {
        setEmployeeMessage('Retained changes belong to another private Draft. Return to the matching employee Draft to recover them.'); return;
      }
      optionEDraftController?.replaceBuffer(recovery.snapshot.buffer);
      applyOptionEDraftAggregate(recovery.snapshot.buffer); recoveryNeedsDecision.current = false;
      setEmployeeMessage('Your retained changes remain unsaved. Review them against the freshly loaded Draft before choosing Save Draft.'); return;
    }
    const buffer = optionEDraftController?.reapplyRetainedBuffer();
    if (!buffer) return;
    if (buffer.schemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION) applyOptionEDraftAggregate(buffer);
    setEmployeeMessage('Your retained changes are ready. Choose Save Draft to apply them against the latest canonical version.');
  };

  const submitWorkplan = async (): Promise<void> => {
    if (!annualEditable) { setEmployeeMessage('This Workplan is read-only and cannot be submitted again.'); return; }
    if (optionEPrivateDraftV3Gateway) { setEmployeeMessage('Submit is unavailable for this full private Draft. Your saved Draft remains private.'); return; }
    if (nativeWritesHeld) { setEmployeeMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (optionEDraftGateway) {
      if (optionEV4Submit.installedAvailable() && optionEDraftSave && isLegacyPrivateDraftSnapshot(optionEDraftSave)) {
        setSaving(true);
        try { setEmployeeMessage((await optionEV4Submit.submit(optionEDraftSave)).message); }
        finally { setSaving(false); }
        return;
      }
      setEmployeeMessage('Submit is unavailable until the trusted Option E request, status and receipt processor is connected. The Draft remains private.');
      return;
    }
    if (!workplan || !user) {
      setEmployeeMessage('Workplan not submitted. Start My Workplan first.');
      return;
    }
    setSaving(true); setEmployeeMessage('');
    try {
      if (behaviourV2Journey) {
        const latest = await dataService.getEmployeeWorkplanV2(user, workplan.performanceYear);
        if (!latest || latest.workplan.etag !== workplan.etag
          || latest.workplan.rowVersionToken !== workplan.rowVersionToken
          || draftSessionChanged || hasBehaviourV2Mutation(behaviours, latest.behaviourItems)
          || validateBehaviourAssignments([], latest.behaviourItems).state !== 'complete')
          throw new Error('Save Draft and reload the complete canonical Behaviour v02 Workplan before submitting.');
      }
      const result = await dataService.submitEmployeeWorkplanV2({
        commandKey: integratedEmployeeCommandKey(user.email, workplan.workplanKey, workplan.rowVersionToken, 'submit-workplan'),
        actor: user, workplan
      });
      applyWorkplanReadback(result.readback);
      setEmployeeMessage(result.duplicate ? 'The existing submission was checked without creating a duplicate.' : 'Workplan submitted and confirmed.');
    } catch (error) { const detail = error instanceof Error ? error.message : '';
      setEmployeeMessage(/PD01_CONFIGURATION_BINDING_ABSENT|PD01_LIST_ABSENT|PD01_CONFIGURATION_UNSTABLE/.test(detail)
        ? 'The Workplan remains Draft. The governed Core/Impact configuration is not ready in this TEST environment.'
        : detail ? `The Workplan was not submitted. ${detail}`
          : 'The Workplan was not submitted. Resolve the visible readiness issues, reload, then try again.'); }
    finally { setSaving(false); }
  };

  const requestChanges = async (context: IManagerWorkplanReviewContext, reason: string): Promise<void> => {
    if (nativeWritesHeld) { setManagerMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (optionEDraftGateway) {
      setManagerMessage('Request Changes is unavailable until the trusted Option E manager processor and assigned-manager scope are verified.');
      return;
    }
    if (!user) return; setSaving(true); setManagerMessage('');
    try { const result = await dataService.requestEmployeeWorkplanChangesV2({
      commandKey: integratedEmployeeCommandKey(user.email, context.workplan.workplanKey, context.workplan.rowVersionToken, 'manager-request-changes', reason.trim()),
      actor: user, workplan: context.workplan
    }, reason); await reloadManagerData(); setManagerMessage(result.duplicate ? 'The existing Changes Requested decision was confirmed.' : 'Changes Requested was saved and confirmed.'); }
    catch { setManagerMessage("The Request Changes decision could not be confirmed and may have committed. Reload this employee's Workplan before trying again."); } finally { setSaving(false); }
  };
  const approveWorkplan = async (context: IManagerWorkplanReviewContext): Promise<void> => {
    if (nativeWritesHeld) { setManagerMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (optionEDraftGateway) {
      setManagerMessage('Approve and Lock is unavailable until the trusted Option E manager processor, approved snapshot and receipt store are verified.');
      return;
    }
    if (!user) return; setSaving(true); setManagerMessage('');
    try { const result = await dataService.approveAndLockEmployeeWorkplanV2({
      commandKey: integratedEmployeeCommandKey(user.email, context.workplan.workplanKey, context.workplan.rowVersionToken, 'manager-approve-lock'),
      actor: user, workplan: context.workplan
    }); await reloadManagerData(); setManagerMessage(result.duplicate ? 'The existing approval and lock were confirmed.' : 'Workplan approved, locked and confirmed.'); }
    catch { setManagerMessage("The approval and lock decision could not be confirmed and may have committed. Reload this employee's Workplan before trying again."); } finally { setSaving(false); }
  };
  const requestQuarterChanges = async (context: IManagerQuarterReviewContext, reason: string): Promise<void> => {
    if (nativeWritesHeld) { setManagerMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (!user) return; setSaving(true); setManagerMessage('');
    try { await dataService.requestQuarterReviewChanges(context, user, reason); await reloadManagerData(); setManagerMessage('Quarterly Changes Requested was saved and confirmed.'); }
    catch { setManagerMessage("The quarterly Request Changes decision could not be confirmed and may have committed. Reload this employee's Quarter Review before trying again."); } finally { setSaving(false); }
  };
  const approveQuarter = async (context: IManagerQuarterReviewContext): Promise<void> => {
    if (nativeWritesHeld) { setManagerMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (!user) return; setSaving(true); setManagerMessage('');
    try { await dataService.approveAndLockQuarterReview(context, user); await reloadManagerData(); setManagerMessage('Quarter Review approved, locked and confirmed.'); }
    catch { setManagerMessage("The Quarter approval and lock decision could not be confirmed and may have committed. Reload this employee's Quarter Review before trying again."); } finally { setSaving(false); }
  };
  const overrideQuarter = async (context: IManagerQuarterReviewContext, item: IQuarterReviewItem, rag: 'Green' | 'Amber' | 'Red', reason: string): Promise<void> => {
    if (nativeWritesHeld) { setManagerMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (!user) return; setSaving(true); setManagerMessage('');
    try { await dataService.saveQuarterManagerOverride(context, item, user, rag, reason); await reloadManagerData(); setManagerMessage('Manager RAG Override was saved separately and confirmed.'); }
    catch { setManagerMessage("The Manager RAG Override update could not be confirmed and may have committed. Reload this employee's Quarter Review before trying again."); } finally { setSaving(false); }
  };
  const assessBehaviour = async (context: IManagerQuarterReviewContext, item: IQuarterReviewItem, rating: BehaviourRating): Promise<void> => {
    if (nativeWritesHeld) { setManagerMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (!user) return; setSaving(true); setManagerMessage('');
    try { await dataService.saveQuarterBehaviourAssessment(context, item, user, rating); await reloadManagerData(); setManagerMessage('Manager Behaviour assessment was saved separately and confirmed.'); }
    catch { setManagerMessage("The Manager Behaviour assessment update could not be confirmed and may have committed. Reload this employee's Quarter Review before trying again."); } finally { setSaving(false); }
  };
  const reviewBehaviourCommitment = async (
    readModel: Extract<IOptionEBehaviourManagerReadModel, { state: 'Available' }>,
    selectionKey: string,
    disposition: OptionEBehaviourManagerDisposition,
    commentary?: string
  ): Promise<void> => {
    if (nativeWritesHeld) { setManagerMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (!managerBehaviourGateway || typeof globalThis.crypto?.randomUUID !== 'function') {
      setManagerMessage('Governed Behaviour review is unavailable. No manager event was written.');
      return;
    }
    setSaving(true); setManagerMessage('');
    try {
      const result = await managerBehaviourGateway.review({
        contract: 'KCF.OptionEBehaviourManagerIntent/v1', idempotencyKey: globalThis.crypto.randomUUID(),
        workplanKey: readModel.workplanKey, performanceYear: readModel.performanceYear,
        submittedSnapshotKey: readModel.submittedSnapshotKey, selectionKey,
        expectedRowVersion: readModel.rowVersion, expectedHierarchyVersion: readModel.hierarchyVersion,
        disposition, commentary
      });
      if (result.outcome === 'Confirmed' || result.outcome === 'ConfirmedReplay') {
        const refreshed = await managerBehaviourGateway.read(readModel.employeePersonKey);
        setManagerBehaviourReadModels(current => ({ ...current, [readModel.employeePersonKey]: refreshed }));
      }
      setManagerMessage(result.message);
    } catch {
      setManagerMessage('The manager Behaviour event effect is uncertain. Reload canonical history before retrying.');
    } finally { setSaving(false); }
  };

  const quarterSource = (quarter: QuarterKey): IQuarterDraftSource | undefined => {
    const lifecycle = data.quarterLifecycles.find(item => item.quarterKey === quarter);
    if (!workplan || !user || !data.overview?.manager || !lifecycle) return undefined;
    return { workplan, employee: user, manager: data.overview.manager, lifecycle, coreCatalogue: catalogue,
      coreItems, personalItems, behaviours: publishedBehaviours, behaviourItems };
  };
  const selectQuarter = async (quarter: QuarterKey): Promise<void> => {
    const request = {};
    if (quarterMutationRequest.current) setSaving(false);
    quarterMutationRequest.current = undefined;
    quarterSelectionRequest.current = request;
    const isCurrent = (): boolean => quarterSelectionRequest.current === request
      && currentHistoryLoadKey.current === historyLoadKey;
    setSelectedQuarter(quarter); setQuarterContext(undefined); setEmployeeMessage('');
    setQuarterLoading(false);
    const source = quarterSource(quarter); if (!source) return;
    setQuarterLoading(true);
    try {
      const context = await dataService.getQuarterReviewContext(source);
      if (!isCurrent()) return;
      if (context.review && user && workplan) {
        const readback = await dataService.getEmployeeQuarterV2({
          commandKey: integratedEmployeeCommandKey(user.email, context.review.quarterReviewKey, context.review.rowVersionToken, 'read-quarter'),
          actor: user, workplan, review: context.review
        });
        if (!isCurrent()) return;
        if (!readback) throw new Error('The canonical Quarter Review is unavailable.');
        setQuarterContext({ ...context, review: readback.review, items: readback.items,
          evidence: readback.evidence, auditEvents: readback.audits });
      } else setQuarterContext(context);
    } catch {
      if (isCurrent()) setEmployeeMessage('The selected Quarter Review could not be loaded safely through canonical readback. No data was changed.');
    } finally {
      if (isCurrent()) setQuarterLoading(false);
    }
  };
  const beginQuarterMutation = (): (() => boolean) => {
    const selection = quarterSelectionRequest.current;
    const mutation = {};
    quarterMutationRequest.current = mutation;
    setSaving(true); setEmployeeMessage('');
    return () => quarterSelectionRequest.current === selection
      && quarterMutationRequest.current === mutation
      && currentHistoryLoadKey.current === historyLoadKey;
  };
  const prepareQuarter = async (): Promise<void> => {
    if (nativeWritesHeld) { setEmployeeMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (!selectedQuarter) return; const source = quarterSource(selectedQuarter); if (!source) return;
    const isCurrent = beginQuarterMutation();
    try {
      const prepared = await dataService.prepareQuarterReview(source);
      if (!isCurrent()) return;
      if (!prepared.review || !user || !workplan) throw new Error('Quarter Review preparation did not return its canonical header.');
      const readback = await dataService.getEmployeeQuarterV2({
        commandKey: integratedEmployeeCommandKey(user.email, prepared.review.quarterReviewKey, prepared.review.rowVersionToken, 'read-prepared-quarter'),
        actor: user, workplan, review: prepared.review
      });
      if (!isCurrent()) return;
      if (!readback) throw new Error('The prepared Quarter Review could not be read through Employee V2.');
      setQuarterContext({ ...prepared, review: readback.review, items: readback.items, evidence: readback.evidence, auditEvents: readback.audits });
      setEmployeeMessage('Quarter Review prepared from the approved Workplan and confirmed.');
    }
    catch { if (isCurrent()) setEmployeeMessage('Quarter Review preparation could not be confirmed. A review may have been created. Reload the Quarter Review before trying again.'); } finally { if (isCurrent()) setSaving(false); }
  };
  const saveQuarterItem = async (item: IQuarterReviewItem): Promise<void> => {
    if (nativeWritesHeld) { setEmployeeMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (!quarterContext?.review || !user || !workplan) return;
    const isCurrent = beginQuarterMutation();
    try {
      const recovery = item.recovery?.route ? {
        route: item.recovery.route, action: item.recovery.action || '', ownerPersonKey: item.recovery.ownerPersonKey || '',
        dueDate: item.recovery.dueDate || '', nextReviewDate: item.recovery.nextReviewDate || '',
        expectedReturnToGreenDate: item.recovery.expectedReturnToGreenDate,
        expectedReducedOutcome: item.recovery.expectedReducedOutcome,
        proposedRevisedTarget: item.recovery.proposedRevisedTarget,
        proposedRevisedDate: item.recovery.proposedRevisedDate, reforecastReason: item.recovery.reforecastReason,
        dependencyOrDecision: item.recovery.dependencyOrDecision, escalatedTo: item.recovery.escalatedTo,
        targetDecisionDate: item.recovery.targetDecisionDate
      } : undefined;
      const input = {
        employeeActualValue: item.employeeActualValue, employeeActualText: item.employeeActualText,
        employeeUpdate: (item.behaviourSnapshotV2 ? item.employeeBehaviourEvidenceV2
          : item.itemType === 'Behaviour' ? item.behaviourReflection : item.statusUpdate) || '',
        contextMitigation: item.contextMitigation, forecastValue: item.quarterEndForecastValue,
        forecastText: item.quarterEndForecastText, employeeBehaviourRating: item.employeeBehaviourRating,
        behaviourExamples: item.behaviourExamples,
        employeeBehaviourEvidenceV2: item.employeeBehaviourEvidenceV2,
        employeeBehaviourAssessmentV2: item.employeeBehaviourAssessmentV2,
        recovery
      };
      const result = await dataService.saveEmployeeQuarterUpdateV2({
        commandKey: integratedEmployeeCommandKey(user.email, quarterContext.review.quarterReviewKey,
          quarterContext.review.rowVersionToken, 'save-quarter-item', item.quarterReviewItemKey, JSON.stringify(input)),
        actor: user, workplan, review: quarterContext.review, item
      }, input);
      if (!isCurrent()) return;
      setQuarterContext(current => isCurrent() && current ? { ...current, review: result.readback.review, items: result.readback.items,
        evidence: result.readback.evidence, auditEvents: result.readback.audits } : current);
      setEmployeeMessage(result.duplicate ? 'The existing Quarter update was confirmed without creating a duplicate.' : 'Quarter update saved and confirmed.');
    }
    catch { if (isCurrent()) setEmployeeMessage('Quarter update could not be confirmed. It may have been saved. Reload the Quarter Review before trying again.'); } finally { if (isCurrent()) setSaving(false); }
  };
  const addProgress = async (item: IQuarterReviewItem, entry: IProgressEntry): Promise<void> => {
    if (nativeWritesHeld) { setEmployeeMessage('KCF TEST view-only: changes are held pending governed admission.'); throw new Error('Progress save is held pending governed admission.'); }
    if (!quarterContext || !user) throw new Error('Progress save requires the current employee Quarter context.');
    const isCurrent = beginQuarterMutation();
    try { const ledger = await dataService.saveProgressEntry(quarterContext, item, entry, user);
      if (!isCurrent()) throw new Error('Progress save confirmation belongs to an earlier Quarter selection. Reload its saved history.');
      setQuarterContext(current => isCurrent() && current ? { ...current, progressLedgers: [...current.progressLedgers.filter(row => row.workplanItemKey !== ledger.workplanItemKey), ledger] } : current);
      setEmployeeMessage('Progress entry saved and confirmed.'); }
    catch (error) { if (isCurrent()) setEmployeeMessage('Progress entry could not be confirmed. It may have been saved. Reload the Quarter Review before trying again.'); throw error; } finally { if (isCurrent()) setSaving(false); }
  };
  const submitQuarter = async (): Promise<void> => {
    if (nativeWritesHeld) { setEmployeeMessage('KCF TEST view-only: changes are held pending governed admission.'); return; }
    if (!quarterContext?.review || !user || !workplan) return;
    const isCurrent = beginQuarterMutation();
    try {
      const result = await dataService.submitEmployeeQuarterV2({
        commandKey: integratedEmployeeCommandKey(user.email, quarterContext.review.quarterReviewKey,
          quarterContext.review.rowVersionToken, 'submit-quarter'), actor: user, workplan, review: quarterContext.review
      });
      if (!isCurrent()) return;
      setQuarterContext(current => isCurrent() && current ? { ...current, review: result.readback.review, items: result.readback.items,
        evidence: result.readback.evidence, auditEvents: result.readback.audits } : current);
      setEmployeeMessage(result.duplicate ? 'The existing Quarter submission was confirmed without creating a duplicate.' : 'Quarter Review submitted and confirmed.');
    }
    catch { if (isCurrent()) setEmployeeMessage('Quarter submission could not be confirmed. It may have been submitted. Reload the Quarter Review before trying again.'); } finally { if (isCurrent()) setSaving(false); }
  };

  return <IntegratedComponentFrame><div className={styles.appShell} data-candidate="KCF-KPI-026-R3-RENDERED-DEFECT-REPAIR">
    <header className={styles.topBar}><button type="button" ref={menuButtonRef} className={styles.menuButton} aria-label="Open navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(!mobileOpen)}>☰</button><img src={kcfLogo} alt="Kent Cricket Foundation" /><div className={styles.productTitle}><strong>KPI Performance Hub</strong><span>{data.overview?.config?.performanceYear || data.reporting?.performanceYear || 'Current performance year'}</span></div><div className={styles.identity}><strong>{user?.displayName || userDisplayName}</strong><span>{user?.jobRole || 'Signed in'}</span></div></header>
    <aside className={`${styles.sideNav} ${mobileOpen ? styles.sideNavOpen : ''}`} aria-label="Performance Hub navigation">
      {entry.employee && <section className={styles.navEmployee} aria-label="Employee"><strong>Employee</strong><button type="button" aria-current={visibleArea === 'home' ? 'page' : undefined} onClick={() => nav('home')}>Employee</button><button type="button" aria-current={visibleArea === 'build' ? 'page' : undefined} onClick={() => nav('build')}>Build My Workplan</button><button type="button" aria-current={visibleArea === 'workplan' ? 'page' : undefined} onClick={() => nav('workplan')}>My Workplan</button></section>}
      {canManager && <section className={styles.navManager} aria-label="Manager"><strong>Manager</strong>{(['My Team', 'Reviews Awaiting Me', 'Employee Review', 'Quarterly Review'] as ManagerTab[]).map(tab => <button type="button" key={tab} aria-current={visibleArea === 'manager' && managerTab === tab ? 'page' : undefined} onClick={() => { setManagerTab(tab); nav('manager'); }}>{tab}</button>)}</section>}
      {canAdmin && <section className={styles.navAdministration} aria-label="Administration"><strong>Administration</strong>{adminTabs.map(tab => <button type="button" key={tab} aria-current={visibleArea === 'admin' && adminTab === tab ? 'page' : undefined} onClick={() => { setAdminTab(tab); nav('admin'); }}>{tab}</button>)}</section>}
      {canReporting && <section className={styles.navReporting} aria-label="Reporting"><strong>Reporting</strong>{(['Reporting Readiness', 'GOLD / organisation reporting', 'CWOP / CWSP', 'Performance reporting views'] as ReportingTab[]).map(tab => <button type="button" key={tab} aria-current={visibleArea === 'reporting' && reportingTab === tab ? 'page' : undefined} onClick={() => { setReportingTab(tab); nav('reporting'); }}>{tab}</button>)}</section>}
    </aside>
    <main className={styles.main}>{nativeWritesHeld && <p className={styles.notice} role="status">{localPrivateSave ? 'LOCAL / NOT INSTALLED · Private Draft fixture Save only. SharePoint writes, Start, Submit, manager, Quarter and administration changes remain held.' : 'View only · SharePoint writes are held. Private Draft Save, Start, Submit, quarterly updates, manager decisions and administration changes remain unavailable.'}</p>}{entry.employee && <nav className={styles.journeyNav} aria-label="Employee Workplan journey"><button type="button" aria-current={visibleArea === 'home' ? 'page' : undefined} onClick={() => nav('home')}>Employee</button><button type="button" aria-current={visibleArea === 'build' ? 'page' : undefined} onClick={() => nav('build')}>Build My Workplan</button><button type="button" aria-current={visibleArea === 'workplan' ? 'page' : undefined} onClick={() => nav('workplan')}>My Workplan</button></nav>}
      {loading || historyBinding?.loadKey !== historyLoadKey || (user && user.email.trim().toLowerCase() !== currentUserEmail.trim().toLowerCase()) ? <Loading /> : !entry.valid ? <IntegratedExperienceStatePanel state="denied" title="Access unavailable" message="A current, active People record with a recognised application role is required." nextStep="Ask the governed People owner to check your role assignment." /> : visibleArea === 'home' ? <section className={styles.home}><header><span>Welcome back</span><h1>{user?.displayName || userDisplayName}</h1><p>Build your annual Workplan, review delivery and open the areas available to your role.</p></header><IntegratedScreenGuidance purpose="Start or continue your annual Workplan and open only the areas available to your signed-in role." actions={["Check the current Workplan state before choosing an action.", "Read unavailable-information notices before relying on visible counts."]} fields={governedTerms} next="Build and save the annual Workplan, then open the relevant review or governed specialist area." /><div className={styles.metricGrid}><article><strong>{data.overview?.workplanStatus || 'Status unavailable'}</strong><span>My Workplan</span></article><article><strong>{counts.kpis}</strong><span>Strategic Core KPIs</span></article><article><strong>{counts.pillars}</strong><span>Strategic pillars</span></article><article><strong>{counts.workstreams}</strong><span>Workstreams</span></article></div><div className={styles.quickActions}>{!workplan && noWorkplan(data.overview?.workplanStatus || '') ? <button type="button" disabled={!canStartWorkplan} onClick={startWorkplan}>Start My Workplan</button> : <button type="button" onClick={() => nav('build')}>Build My Workplan</button>}<button type="button" onClick={() => nav('workplan')}>View My Workplan</button>{canManager && <button type="button" onClick={() => { setManagerTab('Reviews Awaiting Me'); nav('manager'); }}>Reviews Awaiting Me</button>}{canAdmin && <button type="button" onClick={() => { setAdminTab('Data Quality'); nav('admin'); }}>Data Quality</button>}</div>{!workplan && noWorkplan(data.overview?.workplanStatus || '') && <p className={styles.notice} role="status">{annualStartUnavailable}</p>}{employeeMessage && <p className={styles.notice} role="status">{employeeMessage}</p>}{data.warnings.length > 0 && <section className={styles.notice}><strong>Some live information is not available</strong><ul>{data.warnings.map((warning, index) => <li key={`${index}|${warning}`}>{warning}</li>)}</ul></section>}</section>
        : visibleArea === 'build' ? <section><header className={styles.pageHero}><span>Employee · My Workplan</span><h1>Build My Workplan</h1><p>Choose annual commitments and review each section of your Workplan.</p></header>{employeeMessage && builderTab !== 'Review & Weight' && <p className={styles.notice} role="status">{employeeMessage}</p>}{!workplan && <section className={styles.notice}><strong>{noWorkplan(data.overview?.workplanStatus || '') ? 'No Workplan has been started for this performance year.' : hasExistingWorkplan(data.overview?.workplanStatus || '') ? 'Your existing Workplan could not be loaded.' : 'Your Workplan status could not be confirmed.'}</strong>{noWorkplan(data.overview?.workplanStatus || '') ? <><p>Start My Workplan to create a Draft. Until then, changes stay in this session and cannot be saved or submitted.</p><button type="button" disabled={!canStartWorkplan} onClick={startWorkplan}>Start My Workplan</button><p role="status">{annualStartUnavailable}</p></> : <p>{hasExistingWorkplan(data.overview?.workplanStatus || '') ? `Saved status: ${data.overview?.workplanStatus}. Reload your existing Workplan before making changes.` : 'Reload to confirm your saved Workplan status before making changes.'}</p>}</section>}{workplan && !annualEditable && <p className={styles.notice} role="status">This {workplan.state} Workplan is read-only. Its saved content remains available to review.</p>}<nav className={styles.pageTabs} aria-label="Build My Workplan steps">{(['Core KPIs', 'Personal KPIs', 'Behaviours', 'Review & Weight'] as BuilderTab[]).map(tab => <button type="button" key={tab} aria-pressed={builderTab === tab} onClick={() => setBuilderTab(tab)}>{tab === 'Personal KPIs' ? 'IMPACT KPIs' : tab}</button>)}</nav>{(privateDraftWritesHeld || !workplan || (annualEditable && optionEDraftController && !optionEDraftSave?.canonical)) && <section className={styles.persistenceWarning} role="alert" data-unsaveable-workplan="true"><strong>Workplan editing is unavailable. Nothing entered here can be saved.</strong><p>{privateDraftWritesHeld ? 'This TEST application is view-only. Core, IMPACT and Behaviour edits are disabled because no SharePoint Draft Save is authorised.' : !workplan ? noWorkplan(data.overview?.workplanStatus || '') ? 'No protected Workplan Draft has been created. You cannot save or reopen changes across devices.' : 'Your saved Workplan must be loaded and verified before changes can be saved.' : 'The protected Draft could not be loaded and verified. Reload the canonical Draft before editing.'}</p>{optionEDraftController && workplan && annualEditable && !privateDraftWritesHeld && !optionEDraftSave?.canonical && <button type="button" disabled={saving || rawOptionEDraftSave?.status === 'Loading' || rawOptionEDraftSave?.status === 'Saving' || rawOptionEDraftSave?.status === 'Checking'} onClick={reloadOptionEDraft}>Reload canonical Draft</button>}</section>}<fieldset disabled={privateDraftWritesHeld || !annualEditable || Boolean(optionEDraftController && !optionEDraftSave?.canonical)} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }} aria-label="Workplan editable fields">{builderTab === 'Core KPIs' ? <CoreBuilder kpis={data.kpis} selections={core} onChange={updateCoreSession} createChoice={optionEPrivateDraftV3Gateway ? kpiId => v3Editor.current?.createCoreChoice(kpiId) || { kpiId, weight: 0 } : undefined} onEditField={optionEPrivateDraftV3Gateway ? (id, field, kpiId) => { if (v3Editor.current?.context.loadKey === historyLoadKey && currentHistoryLoadKey.current === historyLoadKey) v3Editor.current.markCoreField(id, kpiId, field); } : undefined} canonicalDraftAvailable={Boolean(workplan)} sessionChanged={coreSessionChanged} saveIssues={coreSaveIssues} correctionRequest={coreCorrectionRequest} onCorrectionRequestHandled={acknowledgeCoreCorrection} onReviewIssue={requestCoreCorrection} /> : builderTab === 'Personal KPIs' ? <PersonalBuilder reservedImpactIds={rawOptionEDraftSave?.buffer?.schemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION ? rawOptionEDraftSave.buffer.impact.map(entry => entry.impactId) : undefined} retainTargetText={Boolean(optionEPrivateDraftV3Gateway)} items={personal} onChange={updatePersonalSession} onEditField={optionEPrivateDraftV3Gateway ? (id, field) => v3Editor.current?.markField('impact', id, field) : undefined} /> : builderTab === 'Behaviours' ? <BehaviourBuilder onEditField={optionEPrivateDraftV3Gateway ? (id, field) => v3Editor.current?.markField('behaviour', id, field) : undefined} choices={behaviours} objectives={data.objectives} person={user} behaviourV2={behaviourV2Journey} behaviourLibraryAsOf={behaviourLibraryAsOf} focusCatalogue={behaviourFocusCatalogueV2} onChange={updateBehaviourSession} /> : <ReviewWeights privateEmployeeNotes={rawOptionEDraftSave?.buffer?.schemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION ? rawOptionEDraftSave.buffer.employeeNotes : undefined} onEditWeight={optionEPrivateDraftV3Gateway ? (group, id) => v3Editor.current?.markField(group, id, 'weight') : undefined} core={core} personal={personal} behaviours={behaviours} onCore={updateCoreSession} onPersonal={updatePersonalSession} onBehaviours={updateBehaviourSession} workplan={workplan} assignedManager={data.overview?.manager} saving={saving} nativeWritesHeld={nativeWritesHeld} privateDraftWritesHeld={privateDraftWritesHeld} sessionRecoveryRequired={recoveryNeedsDecision.current} message={employeeMessage} initialCoreMode={coreWeightingMode} behaviourV2={behaviourV2Journey} behaviourCadence={user?.behaviourCadenceV2} canonicalBehaviourItems={behaviourItems} draftSessionChanged={draftSessionChanged} optionEDraftSave={optionEDraftSave} optionEV4SubmitAvailable={!optionEPrivateDraftV3Gateway && optionEV4Submit.installedAvailable()} onReloadOptionEDraft={reloadOptionEDraft} onReapplyOptionEDraft={reapplyOptionEDraft} onSave={saveDraft} onSubmit={submitWorkplan} />}</fieldset></section>
          : visibleArea === 'workplan' ? workplan && (workplan.state === 'Approved' || workplan.state === 'Locked') ? <QuarterlyReviewPage workplan={workplan} annualBehaviourItems={behaviourItems} config={data.overview?.config} lifecycles={data.quarterLifecycles} selectedQuarter={selectedQuarter} context={quarterContext} loading={loading || quarterLoading} saving={saving} nativeWritesHeld={nativeWritesHeld} message={employeeMessage} onSelectQuarter={selectQuarter} onPrepare={prepareQuarter} onSaveItem={saveQuarterItem} onAddProgress={addProgress} onSubmit={submitQuarter} /> : <Empty title="Approved Workplan required" message="My Workplan shows your approved saved Workplan. Builder changes remain separate until approved." nextStep="Complete and submit the Draft from Build My Workplan, then wait for governed manager approval." />
            : visibleArea === 'manager' ? <section><header className={styles.pageHero}><span>Manager</span><h1>{managerTab}</h1></header><IntegratedManagerScreenGuidance tab={managerTab} />{managerTab === 'My Team' || managerTab === 'Reviews Awaiting Me' ? <ManagerExperiencePage experience={managerExperience} annualContexts={data.annualReviews} quarterContexts={data.quarterReviews} saving={saving} nativeWritesHeld={nativeWritesHeld} message={managerMessage} initialMode={managerTab === 'My Team' ? 'team' : 'queue'} behaviourReadModels={managerBehaviourReadModels} onBehaviourDisposition={reviewBehaviourCommitment} onRequestChanges={requestChanges} onApproveAndLock={approveWorkplan} onRequestQuarterChanges={requestQuarterChanges} onApproveAndLockQuarter={approveQuarter} onOverrideQuarterRag={overrideQuarter} onAssessQuarterBehaviour={assessBehaviour} /> : managerTab === 'Employee Review' ? <section className={styles.singlePage}>{data.annualReviews.length ? data.annualReviews.map(context => <article className={styles.reviewCard} key={context.workplan.workplanKey}><h2>{context.employee.displayName}</h2><p>{context.workplan.state} · {context.coreItems.filter(item => item.activeInWorkplan).length} Core · {context.personalItems.filter(item => item.activeInWorkplan).length} Personal</p><button type="button" onClick={() => { setManagerTab('My Team'); setManagerMessage(`Open ${context.employee.displayName} from My Team.`); }}>Open employee review</button></article>) : <Empty title="No employee reviews available" message="Submitted Workplans from current direct reports will appear here." nextStep="Return to My Team or Reviews Awaiting Me after a direct report submits a Workplan." />}</section> : <section className={styles.singlePage}>{data.quarterReviews.length ? data.quarterReviews.map(context => <article className={styles.reviewCard} key={context.review.quarterReviewKey}><h2>{context.employee.displayName} · {context.review.quarter}</h2><p>{context.review.state} · {context.items.length} review items</p><button type="button" onClick={() => { setManagerTab('My Team'); setManagerMessage(`Open ${context.employee.displayName}'s quarterly review from My Team.`); }}>Open quarterly review</button></article>) : <Empty title="No quarterly reviews available" message="Submitted quarterly reviews from current direct reports will appear here." nextStep="Return to My Team or Reviews Awaiting Me after a direct report submits a quarterly review." />}</section>}</section>
              : visibleArea === 'admin' ? <AdminView key={currentUserEmail} tab={adminTab} data={currentAdminData} adminMasterSource={visibleAdminMasterSource} lifecycleSession={historyBinding?.loadKey === historyLoadKey && !loading ? lifecycleSession : undefined} behaviourCatalogueAdministration={!nativeWritesHeld && historyBinding?.loadKey === historyLoadKey && !loading ? behaviourCatalogueAdministration : undefined} /> : <ReportingView tab={reportingTab} data={data} localSyntheticReportingDataset={localSyntheticReportingDataset} />}
      {!loading && entry.valid && (visibleArea === 'build' || visibleArea === 'workplan' || visibleArea === 'reporting')
        && <OptionEWorkplanSubmittedHistoryV5View result={currentCapturedHistory}
          journey={visibleArea === 'build' ? 'annual' : visibleArea === 'workplan' ? 'quarter' : 'reporting'} quarter={selectedQuarter} />}
    </main>
  </div></IntegratedComponentFrame>;
};

export default IntegratedPerformanceHub;
