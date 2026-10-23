import * as React from 'react';
import type { IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem, IControlledSubmissionContext, ICoreKpiCatalogueItem, ICoreWorkplanItem, IManagerWorkplanReviewContext, IPersonalWorkplanItem, ProductionSection, IProductionOverview, StorageAclStatus, WorkplanDataLoadState } from '../models/ProductionModels';
import type { IManagerQuarterReviewContext, IProgressEntry, IQuarterLifecycle, IQuarterReviewContext, IQuarterReviewItem, QuarterKey } from '../models/QuarterlyModels';
import type { BehaviourRating, IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import type { IWorkplanCategoryWeights } from '../models/GovernanceModels';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { evaluateReadiness } from '../services/ReadinessService';
import type { IPerformanceHubProps } from './IPerformanceHubProps';
import OverviewPage from './OverviewPage';
import ProductionNavigation from './ProductionNavigation';
import CoreWorkplanPage from './CoreWorkplanPage';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';
import PersonalWorkplanPage from './PersonalWorkplanPage';
import ManagerReviewPage from './ManagerReviewPage';
import QuarterlyReviewPage from './QuarterlyReviewPage';
import RecoveryActionboardPage from './RecoveryActionboardPage';
import DataQualityPage from './DataQualityPage';
import LocalWorkplanUatHarness from './LocalWorkplanUatHarness';
import BehaviourObjectiveLibraryAdminPage from './BehaviourObjectiveLibraryAdminPage';
import AdminFoundationUatHarness from './AdminFoundationUatHarness';
import AdminFoundationPage from './AdminFoundationPage';
import AdminReportingControlPage from './AdminReportingControlPage';
import AdminReportingControlUatHarness from './AdminReportingControlUatHarness';
import StrategicCoreCoveragePage from './StrategicCoreCoveragePage';
import StrategicCoreCoverageUatHarness from './StrategicCoreCoverageUatHarness';
import StrategicCoreCoverageBusinessUatHarness from './StrategicCoreCoverageBusinessUatHarness';
import { createAdminPeopleUatState } from '../services/AdminPeopleUat';
import { createAdminTeamsUatState } from '../services/AdminTeamsUat';
import type { IAdminPeopleUatState, IAdminTeamsUatState } from '../models/AdminFoundationModels';
import type { IAdminConfigSourceRecord } from '../services/AdminConfigDomain';
import type { IAdminReportingControlSnapshot } from '../services/AdminReportingControlDataService';
import { WorkplanSectionUnavailable } from './WorkplanDataUnavailable';
import ReportingViewsPage from './ReportingViewsPage';
import { validatePersonalItems } from '../services/AnnualWorkplanValidation';
import { buildQuarterLifecycle, getCurrentQuarter } from '../services/QuarterLifecycle';
import { isAnnualWorkplanEligibleForQuarterlyDraft, type IQuarterDraftSource } from '../services/QuarterReviewFactory';
import {
  buildKpiDataQualityOptionsFromCatalogue,
  buildKpiDataQualityQueue,
  isKpiDataQualityAdmin
} from '../services/KpiDataQuality';
import { deduplicateRecoveryActionboardContexts, type IRecoveryActionboardContext } from '../services/RecoveryActionboard';
import { makeBehaviourObjectiveKey } from '../services/BehaviourWorkplanPolicy';
import styles from './PerformanceHub.module.scss';

const emptyOverview: IProductionOverview = {
  workplanStatus: 'Loading',
  readiness: evaluateReadiness({}),
  loadMessages: []
};

const PerformanceHub: React.FC<IPerformanceHubProps> = ({
  dataService,
  adminReportingDataService,
  currentUserEmail,
  userDisplayName,
  localUatMode = false,
  adminUatMode = false,
  adminReportingUatMode = false,
  strategicCoreCoverageUatMode = false,
  strategicCoreCoverageBusinessUatMode = false,
  reportingData
}) => {
  const [activeSection, setActiveSection] = React.useState<ProductionSection>('overview');
  const [overview, setOverview] = React.useState<IProductionOverview>(emptyOverview);
  const [workplan, setWorkplan] = React.useState<IAnnualWorkplan>();
  const [workplanDataState, setWorkplanDataState] = React.useState<WorkplanDataLoadState>('loading');
  const [catalogue, setCatalogue] = React.useState<ICoreKpiCatalogueItem[]>([]);
  const [coreItems, setCoreItems] = React.useState<ICoreWorkplanItem[]>([]);
  const [personalItems, setPersonalItems] = React.useState<IPersonalWorkplanItem[]>([]);
  const [behaviours, setBehaviours] = React.useState<IBehaviourSummary[]>([]);
  const [behaviourItems, setBehaviourItems] = React.useState<IBehaviourWorkplanItem[]>([]);
  const [behaviourLibrary, setBehaviourLibrary] = React.useState<IBehaviourObjectiveLibraryRecord[]>([]);
  const [adminPeopleState, setAdminPeopleState] = React.useState<IAdminPeopleUatState>(() => createAdminPeopleUatState([]));
  const [adminTeamsState, setAdminTeamsState] = React.useState<IAdminTeamsUatState>(() => createAdminTeamsUatState([]));
  const [adminConfigRecords, setAdminConfigRecords] = React.useState<IAdminConfigSourceRecord[]>([]);
  const [adminLoadMessage, setAdminLoadMessage] = React.useState<string>();
  const [adminReportingSnapshot, setAdminReportingSnapshot] = React.useState<IAdminReportingControlSnapshot>();
  const [adminReportingLoadMessage, setAdminReportingLoadMessage] = React.useState<string>();
  const [managerContexts, setManagerContexts] = React.useState<IManagerWorkplanReviewContext[]>([]);
  const [managerQuarterContexts, setManagerQuarterContexts] = React.useState<IManagerQuarterReviewContext[]>([]);
  const [quarterLifecycles, setQuarterLifecycles] = React.useState<IQuarterLifecycle[]>([]);
  const [selectedQuarter, setSelectedQuarter] = React.useState<QuarterKey>();
  const [quarterContext, setQuarterContext] = React.useState<IQuarterReviewContext>();
  const [quarterLoading, setQuarterLoading] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [workplanMessage, setWorkplanMessage] = React.useState<string>();
  const [personalMessage, setPersonalMessage] = React.useState<string>();
  const [behaviourMessage, setBehaviourMessage] = React.useState<string>();
  const [submissionMessage, setSubmissionMessage] = React.useState<string>();
  const [managerMessage, setManagerMessage] = React.useState<string>();
  const [quarterMessage, setQuarterMessage] = React.useState<string>();
  const [storageAclStatus] = React.useState<StorageAclStatus>('InheritedDependency');

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setWorkplanDataState('loading');
    setWorkplanMessage(undefined);
    const load = async (): Promise<void> => {
      if (strategicCoreCoverageUatMode) {
        if (active) setLoading(false);
        return;
      }
      if (strategicCoreCoverageBusinessUatMode) {
        try {
          if (!adminReportingDataService) throw new Error('Coverage reference read service is unavailable.');
          const snapshot = await adminReportingDataService.getAdminReportingControlSnapshot();
          if (active) {
            setAdminReportingSnapshot(snapshot);
            setAdminReportingLoadMessage(undefined);
          }
        } catch {
          if (active) setAdminReportingLoadMessage('The current KCF reference data could not be verified. Business UAT remains unavailable and no data was changed.');
        }
        if (active) setLoading(false);
        return;
      }
      if (adminUatMode) {
        if (active) setLoading(false);
        return;
      }
      if (adminReportingUatMode) {
        try {
          if (!adminReportingDataService) throw new Error('Admin Reporting read service is unavailable.');
          const snapshot = await adminReportingDataService.getAdminReportingControlSnapshot();
          if (active) {
            setAdminReportingSnapshot(snapshot);
            setAdminReportingLoadMessage(undefined);
          }
        } catch {
          if (active) setAdminReportingLoadMessage('The authorised read-only production baseline could not be verified. Safe Admin Reporting UAT is blocked; no data was changed.');
        }
        if (active) setLoading(false);
        return;
      }
      try {
        const result = await loadProductionOverview(dataService, currentUserEmail);
        if (active) setOverview(result);
        if (result.employee && isKpiDataQualityAdmin(result.employee.appRoles)) {
          try {
            const [adminPeople, adminTeams, adminConfig, adminLibrary, adminCatalogue] = await Promise.all([
              dataService.getAdminPeople(result.employee),
              dataService.getAdminTeams(result.employee),
              dataService.getAdminConfigRecords(result.employee),
              dataService.getBehaviourObjectiveLibrary(true),
              result.config ? dataService.getCoreKpiCatalogue(result.config.performanceYearNumber) : Promise.resolve([])
            ]);
            if (active) {
              setAdminPeopleState(createAdminPeopleUatState(adminPeople));
              setAdminTeamsState(createAdminTeamsUatState(adminTeams));
              setAdminConfigRecords(adminConfig);
              setBehaviourLibrary(adminLibrary);
              if (adminCatalogue.length) setCatalogue(adminCatalogue);
              setAdminLoadMessage(undefined);
            }
          } catch {
            if (active) setAdminLoadMessage('One or more Admin read paths could not be verified. No partial Admin edit capability is enabled; contact the KPI system owner.');
          }
          try {
            if (!adminReportingDataService) throw new Error('Admin Reporting read service is unavailable.');
            const reportingSnapshot = await adminReportingDataService.getAdminReportingControlSnapshot(
              result.config?.performanceYearNumber
            );
            if (active) {
              setAdminReportingSnapshot(reportingSnapshot);
              setAdminReportingLoadMessage(undefined);
            }
          } catch {
            if (active) setAdminReportingLoadMessage('Reporting-control data could not be verified. The production Admin reporting view remains read-only and fail-closed.');
          }
        }
        if (localUatMode) {
          if (result.readiness.ready && result.employee && result.config) {
            const [loadedCatalogue, loadedBehaviours, loadedLibrary] = await Promise.all([
              dataService.getCoreKpiCatalogue(result.config.performanceYearNumber),
              dataService.getPublishedBehaviours(),
              dataService.getBehaviourObjectiveLibrary(true)
            ]);
            if (loadedCatalogue.length !== 109) throw new Error(`The production Core KPI catalogue contains ${loadedCatalogue.length} records; 109 are required.`);
            if (active) {
              setCatalogue(loadedCatalogue);
              setBehaviours(loadedBehaviours);
              setBehaviourLibrary(loadedLibrary);
              setWorkplanDataState('available');
            }
          } else if (active) setWorkplanDataState('notReady');
          if (active) setLoading(false);
          return;
        }
        let loadedLifecycles: IQuarterLifecycle[] = [];
        if (result.employee?.active) {
          try {
            const reviews = await dataService.getManagerReviewContexts(result.employee);
            if (active) setManagerContexts(reviews);
          } catch {
            if (active) setManagerContexts([]);
          }
          if (result.config) {
            try {
              const timing = await dataService.getQuarterTimingConfig();
              loadedLifecycles = buildQuarterLifecycle(result.config, timing, new Date());
              const selected = getCurrentQuarter(loadedLifecycles) || loadedLifecycles[0];
              const managerQuarterReviews = await dataService.getManagerQuarterReviewContexts(result.employee, loadedLifecycles);
              if (active) {
                setQuarterLifecycles(loadedLifecycles);
                setSelectedQuarter(selected?.quarterKey);
                setManagerQuarterContexts(managerQuarterReviews);
              }
            } catch {
              if (active) {
                setManagerQuarterContexts([]);
                setQuarterMessage('Quarter timing or authorised manager-review data could not be loaded. Annual Workplan functions remain available.');
              }
            }
          }
        }
        if (result.readiness.ready && result.employee && result.config) {
          const loadedWorkplan = await dataService.getOrCreateDraftWorkplan(result.employee, result.manager, result.config);
          const includeInactiveObjectives = isKpiDataQualityAdmin(result.employee.appRoles);
          const [loadedCatalogue, loadedItems, loadedPersonalItems, loadedBehaviours, loadedBehaviourItems, loadedLibrary] = await Promise.all([
            dataService.getCoreKpiCatalogue(result.config.performanceYearNumber),
            dataService.getCoreWorkplanItems(loadedWorkplan.workplanKey),
            dataService.getPersonalWorkplanItems(loadedWorkplan.workplanKey),
            dataService.getPublishedBehaviours(),
            dataService.getBehaviourWorkplanItems(loadedWorkplan.workplanKey),
            dataService.getBehaviourObjectiveLibrary(includeInactiveObjectives)
          ]);
          if (loadedCatalogue.length !== 109) throw new Error(`The production Core KPI catalogue contains ${loadedCatalogue.length} records; 109 are required.`);
          if (active) {
            setWorkplan(loadedWorkplan);
            setCatalogue(loadedCatalogue);
            setCoreItems(loadedItems);
            setPersonalItems(loadedPersonalItems);
            setBehaviours(loadedBehaviours);
            setBehaviourItems(loadedBehaviourItems);
            setBehaviourLibrary(loadedLibrary);
            setWorkplanDataState('available');
            setOverview({ ...result, workplanStatus: loadedWorkplan.state });
          }
          try {
            const selected = getCurrentQuarter(loadedLifecycles) || loadedLifecycles[0];
            if (selected && result.manager && isAnnualWorkplanEligibleForQuarterlyDraft(loadedWorkplan)) {
              const source: IQuarterDraftSource = {
                workplan: loadedWorkplan,
                employee: result.employee,
                manager: result.manager,
                lifecycle: selected,
                coreCatalogue: loadedCatalogue,
                coreItems: loadedItems,
                personalItems: loadedPersonalItems,
                behaviours: loadedBehaviours,
                behaviourItems: loadedBehaviourItems
              };
              const loadedQuarter = await dataService.getQuarterReviewContext(source);
              if (active) setQuarterContext(loadedQuarter);
            }
          } catch {
            if (active) setQuarterMessage('Quarter timing or review data could not be loaded. Annual Workplan functions remain available; contact the KPI system owner if this persists.');
          }
        } else if (active) setWorkplanDataState('notReady');
      } catch {
        if (active) {
          setWorkplanMessage('The Annual Workplan and its section data could not be loaded safely. Please try again or contact the KPI system owner.');
          setWorkplanDataState('unavailable');
        }
      }
      if (active) setLoading(false);
    };
    load().catch(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [adminReportingDataService, adminReportingUatMode, adminUatMode, currentUserEmail, dataService, localUatMode,
    strategicCoreCoverageBusinessUatMode, strategicCoreCoverageUatMode]);

  const displayName = overview.employee?.displayName || userDisplayName;
  const showManager = managerContexts.length > 0 || managerQuarterContexts.length > 0;
  const showDataQuality = isKpiDataQualityAdmin(overview.employee?.appRoles);
  const showBehaviourAdmin = showDataQuality;
  const showAdmin = showDataQuality;
  const unavailableWorkplanState: Exclude<WorkplanDataLoadState, 'available'> = workplanDataState === 'available' ? 'unavailable' : workplanDataState;
  const dataQualityQueue = React.useMemo(() => buildKpiDataQualityQueue(
    catalogue,
    buildKpiDataQualityOptionsFromCatalogue(catalogue, overview.config?.performanceYearNumber)
  ), [catalogue, overview.config?.performanceYearNumber]);
  const recoveryActionboardContexts = React.useMemo<IRecoveryActionboardContext[]>(() => {
    const contexts: IRecoveryActionboardContext[] = [];
    if (quarterContext?.review) {
      contexts.push({
        review: quarterContext.review,
        employee: quarterContext.employee,
        manager: quarterContext.manager,
        items: quarterContext.items
      });
    }
    contexts.push(...managerQuarterContexts);
    return deduplicateRecoveryActionboardContexts(contexts);
  }, [quarterContext, managerQuarterContexts]);
  const showRecovery = recoveryActionboardContexts.length > 0;

  const quarterSource = (quarter: IQuarterLifecycle | undefined): IQuarterDraftSource | undefined => {
    if (!quarter || !workplan || !overview.employee || !overview.manager) return undefined;
    if (!isAnnualWorkplanEligibleForQuarterlyDraft(workplan)) return undefined;
    return {
      workplan,
      employee: overview.employee,
      manager: overview.manager,
      lifecycle: quarter,
      coreCatalogue: catalogue,
      coreItems,
      personalItems,
      behaviours,
      behaviourItems
    };
  };

  const selectQuarter = async (quarterKey: QuarterKey): Promise<void> => {
    setSelectedQuarter(quarterKey);
    setQuarterContext(undefined);
    setQuarterMessage(undefined);
    const lifecycle = quarterLifecycles.find(item => item.quarterKey === quarterKey);
    const source = quarterSource(lifecycle);
    if (!source) return;
    setQuarterLoading(true);
    try {
      setQuarterContext(await dataService.getQuarterReviewContext(source));
    } catch {
      setQuarterMessage('The selected Quarter Review could not be loaded safely. No data was changed.');
    } finally {
      setQuarterLoading(false);
    }
  };

  const prepareQuarter = async (): Promise<void> => {
    const lifecycle = quarterLifecycles.find(item => item.quarterKey === selectedQuarter);
    const source = quarterSource(lifecycle);
    if (!source) return;
    setSaving(true);
    setQuarterMessage(undefined);
    try {
      setQuarterContext(await dataService.prepareQuarterReview(source));
      setQuarterMessage('Quarter Review prepared and confirmed. No progress is recorded until a meaningful update is saved.');
    } catch {
      setQuarterMessage('The Quarter Review could not be prepared. Reload before trying again or contact KPI support.');
    } finally {
      setSaving(false);
    }
  };

  const saveQuarterItem = async (item: IQuarterReviewItem): Promise<void> => {
    if (!quarterContext || !overview.employee || !overview.config) return;
    setSaving(true);
    setQuarterMessage(undefined);
    try {
      const saved = await dataService.saveQuarterReviewItem(quarterContext, item, overview.employee, overview.config);
      setQuarterContext(current => current ? {
        ...current,
        items: current.items.map(existing => existing.quarterReviewItemKey === saved.quarterReviewItemKey ? saved : existing)
      } : current);
      setQuarterMessage('Quarter update saved and confirmed.');
    } catch {
      setQuarterMessage('The Quarter update was not saved. Check the required fields and readiness messages, then reload before retrying.');
    } finally {
      setSaving(false);
    }
  };

  const addQuarterProgress = async (item: IQuarterReviewItem, entry: IProgressEntry): Promise<void> => {
    if (!quarterContext || !overview.employee) return;
    setSaving(true);
    setQuarterMessage(undefined);
    try {
      const ledger = await dataService.saveProgressEntry(quarterContext, item, entry, overview.employee);
      setQuarterContext(current => current ? {
        ...current,
        progressLedgers: [...current.progressLedgers.filter(existing => existing.progressLedgerKey !== ledger.progressLedgerKey), ledger]
      } : current);
      setQuarterMessage('Progress note saved and confirmed.');
    } catch {
      setQuarterMessage('The progress note was not saved. Review the entry and try again.');
    } finally {
      setSaving(false);
    }
  };

  const submitQuarter = async (): Promise<void> => {
    if (!quarterContext || !overview.employee) return;
    setSaving(true);
    setQuarterMessage(undefined);
    try {
      const result = await dataService.submitQuarterReview(quarterContext, overview.employee);
      setQuarterContext(current => current ? { ...current, review: result.review, auditEvents: [...(current.auditEvents || []), ...result.audits.filter(audit => !(current.auditEvents || []).some(existing => existing.id === audit.id))] } : current);
      setQuarterMessage(result.alreadyCompleted
        ? 'The existing Quarter Review submission was confirmed without creating a duplicate.'
        : 'Quarter Review submitted and confirmed.');
    } catch {
      setQuarterMessage('The Quarter Review is not ready for submission. Resolve the listed issues; no review status was changed.');
    } finally {
      setSaving(false);
    }
  };

  const saveCoreDraft = async (draftItems: ICoreWorkplanItem[]): Promise<void> => {
    if (!workplan) return;
    setSaving(true);
    setWorkplanMessage(undefined);
    try {
      const activeDraft = draftItems.filter(item => item.activeInWorkplan);
      if (new Set(activeDraft.map(item => item.kpiId)).size !== activeDraft.length) throw new Error('The Draft contains duplicate Core KPI selections.');
      for (let index = 0; index < activeDraft.length; index += 1) {
        const item = activeDraft[index];
        const kpi = catalogue.find(row => row.kpiId === item.kpiId);
        if (!kpi) throw new Error(`The current KPI definition for ${item.kpiId} is unavailable.`);
        await dataService.saveCoreWorkplanItem(workplan, kpi, item.coreWorkplanWeight, item.employeeKpiRole, index + 1);
      }
      for (const existing of coreItems.filter(item => item.activeInWorkplan && !activeDraft.some(draft => draft.kpiId === item.kpiId))) {
        await dataService.removeCoreWorkplanItem(workplan, existing);
      }
      const reloaded = await dataService.getCoreWorkplanItems(workplan.workplanKey);
      setCoreItems(reloaded);
      setWorkplanMessage('Core Draft saved and confirmed.');
    } catch {
      setWorkplanMessage('The Draft could not be saved safely. Reload before trying again or contact the KPI system owner.');
    } finally {
      setSaving(false);
    }
  };

  const savePersonalDraft = async (draftItems: IPersonalWorkplanItem[]): Promise<void> => {
    if (!workplan) return;
    setSaving(true);
    setPersonalMessage(undefined);
    try {
      const validation = validatePersonalItems(draftItems);
       if (validation.state === 'invalid') throw new Error('Impact KPI validation failed.');
      const activeDraft = draftItems.filter(item => item.activeInWorkplan);
      for (let index = 0; index < activeDraft.length; index += 1) {
        await dataService.savePersonalWorkplanItem(workplan, activeDraft[index], index + 1);
      }
      for (const existing of personalItems.filter(item => item.activeInWorkplan && !activeDraft.some(draft => draft.naturalKey && draft.naturalKey === item.naturalKey))) {
        await dataService.removePersonalWorkplanItem(workplan, existing);
      }
      const reloaded = await dataService.getPersonalWorkplanItems(workplan.workplanKey);
      setPersonalItems(reloaded);
      setPersonalMessage('Impact KPI Draft saved and confirmed.');
    } catch {
      setPersonalMessage('The Impact KPI Draft was not saved. Review the visible issues, reload, then try again.');
    } finally {
      setSaving(false);
    }
  };

  const saveCategoryWeights = async (weights: IWorkplanCategoryWeights, reason?: string): Promise<void> => {
    if (!workplan) return;
    setSaving(true);
    setSubmissionMessage(undefined);
    try {
      const saved = await dataService.saveWorkplanCategoryWeights(workplan, weights, reason);
      setWorkplan(saved);
      setOverview(current => ({ ...current, workplanStatus: saved.state }));
      setSubmissionMessage('Category-weight proposal saved and confirmed. Manager approval still applies to the complete Workplan.');
    } catch {
      setSubmissionMessage('The category-weight proposal could not be saved safely. Check the 60–90 / 0–30 / 10–20 guardrails, exact 100% total and required reason.');
    } finally {
      setSaving(false);
    }
  };

  const saveBehaviourDraft = async (draftItems: IBehaviourWorkplanItem[]): Promise<void> => {
    if (!workplan) return;
    setSaving(true);
    setBehaviourMessage(undefined);
    try {
      if (draftItems.length !== 5 || new Set(draftItems.map(item => item.behaviourId)).size !== 5) {
        throw new Error('Exactly one objective is required for each of the five fixed Behaviours.');
      }
      for (const item of draftItems) {
        const behaviour = behaviours.find(candidate => candidate.behaviourId === item.behaviourId);
        if (!behaviour) throw new Error(`The published Behaviour ${item.behaviourId} is unavailable.`);
        await dataService.saveBehaviourWorkplanItem(workplan, behaviour, item);
      }
      const reloaded = await dataService.getBehaviourWorkplanItems(workplan.workplanKey);
      setBehaviourItems(reloaded);
      setBehaviourMessage('All five Behaviour objectives, Q1–Q4 commitments and planning weights were saved and confirmed.');
    } catch {
      setBehaviourMessage('The Behaviour Draft could not be saved safely. Complete one measurable objective and four quarterly commitments for each fixed Behaviour, then retry.');
    } finally {
      setSaving(false);
    }
  };

  const saveBehaviourObjective = async (record: IBehaviourObjectiveLibraryRecord): Promise<IBehaviourObjectiveLibraryRecord> => {
    if (!overview.employee || !showBehaviourAdmin) throw new Error('Admin role required.');
    const saved = await dataService.saveBehaviourObjective(overview.employee, record);
    setBehaviourLibrary(current => [...current.filter(item => item.behaviourObjectiveKey !== saved.behaviourObjectiveKey), saved]);
    return saved;
  };

  const setBehaviourObjectiveActive = async (record: IBehaviourObjectiveLibraryRecord, active: boolean): Promise<void> => {
    if (!overview.employee || !showBehaviourAdmin) throw new Error('Admin role required.');
    const saved = await dataService.setBehaviourObjectiveActive(overview.employee, record, active);
    setBehaviourLibrary(current => current.map(item => item.behaviourObjectiveKey === saved.behaviourObjectiveKey ? saved : item));
  };

  const reorderBehaviourObjectives = async (records: IBehaviourObjectiveLibraryRecord[]): Promise<void> => {
    if (!overview.employee || !showBehaviourAdmin) throw new Error('Admin role required.');
    const changed = records.filter(record => {
      const current = behaviourLibrary.find(item => item.behaviourObjectiveKey === record.behaviourObjectiveKey);
      return current && current.sortOrder !== record.sortOrder;
    });
    const saved: IBehaviourObjectiveLibraryRecord[] = [];
    for (const record of changed) saved.push(await dataService.saveBehaviourObjective(overview.employee, record));
    setBehaviourLibrary(current => current.map(item => saved.find(record => record.behaviourObjectiveKey === item.behaviourObjectiveKey) || item));
  };

  const submitWorkplan = async (): Promise<void> => {
    if (!workplan || !overview.employee) return;
    setSaving(true);
    setSubmissionMessage(undefined);
    try {
      const context: IControlledSubmissionContext = {
        workplan,
        employee: overview.employee,
        manager: overview.manager,
        config: overview.config,
        coreCatalogue: catalogue,
        coreItems,
        personalItems,
        behaviours,
        behaviourItems
      };
      const result = await dataService.submitWorkplan(context, overview.employee);
      setWorkplan(result.workplan);
      setOverview(current => ({ ...current, workplanStatus: result.workplan.state }));
      const resubmitted = result.audit.eventType === 'WorkplanResubmitted';
      setSubmissionMessage(result.alreadySubmitted
        ? 'This Workplan was already submitted. The existing submission was confirmed without creating a duplicate.'
        : resubmitted
          ? 'Workplan resubmitted and confirmed. Employee editing is locked again.'
          : 'Workplan submitted and confirmed. Employee editing is now locked.');
    } catch {
      setSubmissionMessage('The Workplan could not be submitted safely. Reload before trying again or contact the KPI system owner.');
    } finally {
      setSaving(false);
    }
  };

  const requestWorkplanChanges = async (context: IManagerWorkplanReviewContext, reason: string): Promise<void> => {
    if (!overview.employee) return;
    setSaving(true);
    setManagerMessage(undefined);
    try {
      const result = await dataService.requestWorkplanChanges(context, overview.employee, reason);
      const reloaded = await dataService.getManagerReviewContexts(overview.employee);
      setManagerContexts(reloaded);
      setManagerMessage(result.alreadyCompleted
        ? 'The existing Changes Requested decision was confirmed without creating a duplicate.'
        : 'Changes Requested was saved and confirmed.');
    } catch {
      setManagerMessage('The Request Changes transition could not be completed safely. Reload before trying again or contact the KPI system owner.');
    } finally {
      setSaving(false);
    }
  };

  const approveWorkplan = async (context: IManagerWorkplanReviewContext): Promise<void> => {
    if (!overview.employee) return;
    setSaving(true);
    setManagerMessage(undefined);
    try {
      const result = await dataService.approveWorkplan(context, overview.employee);
      const reloaded = await dataService.getManagerReviewContexts(overview.employee);
      setManagerContexts(reloaded);
      setManagerMessage(result.alreadyCompleted
        ? 'The existing Manager approval and append-only audit were verified without duplication. Admin/year-gate locking remains separate.'
        : 'The Workplan was Manager Approved and read back with its append-only audit. Admin/year-gate locking remains separate.');
    } catch {
      setManagerMessage('The Manager approval could not be completed safely. Reload before trying again or contact the KPI system owner.');
    } finally {
      setSaving(false);
    }
  };

  const reloadManagerQuarterReviews = async (): Promise<void> => {
    if (!overview.employee) return;
    setManagerQuarterContexts(await dataService.getManagerQuarterReviewContexts(overview.employee, quarterLifecycles));
  };

  const requestQuarterChanges = async (context: IManagerQuarterReviewContext, reason: string): Promise<void> => {
    if (!overview.employee) return;
    setSaving(true);
    setManagerMessage(undefined);
    try {
      const result = await dataService.requestQuarterReviewChanges(context, overview.employee, reason);
      await reloadManagerQuarterReviews();
      setManagerMessage(result.alreadyCompleted
        ? 'The existing Quarterly Changes Requested decision was confirmed without creating a duplicate.'
        : 'Quarterly Changes Requested was saved and confirmed.');
    } catch {
      setManagerMessage('Quarterly Request Changes was not completed. No review state was changed.');
    } finally {
      setSaving(false);
    }
  };

  const approveAndLockQuarter = async (context: IManagerQuarterReviewContext): Promise<void> => {
    if (!overview.employee) return;
    setSaving(true);
    setManagerMessage(undefined);
    try {
      const result = await dataService.approveAndLockQuarterReview(context, overview.employee);
      await reloadManagerQuarterReviews();
      setManagerMessage(result.alreadyCompleted
        ? 'The existing Quarterly approval and lock were confirmed without creating a duplicate.'
        : 'Quarter Review approved, locked and confirmed.');
    } catch {
      setManagerMessage('Quarterly approval and lock were not completed. Resolve the readiness issues and confirm the assigned manager.');
    } finally {
      setSaving(false);
    }
  };

  const overrideQuarterRag = async (context: IManagerQuarterReviewContext, item: IQuarterReviewItem, rag: 'Green' | 'Amber' | 'Red', reason: string): Promise<void> => {
    if (!overview.employee) return;
    setSaving(true);
    setManagerMessage(undefined);
    try {
      const result = await dataService.saveQuarterManagerOverride(context, item, overview.employee, rag, reason);
      await reloadManagerQuarterReviews();
      setManagerMessage(result.alreadyCompleted
        ? 'The existing reasoned RAG Override was confirmed without creating a duplicate.'
        : 'The separate Manager RAG Override was saved and confirmed; Calculated RAG was preserved.');
    } catch {
      setManagerMessage('The Manager RAG Override could not be saved. A genuine assigned-manager session, valid calculated RAG and reason are required.');
    } finally {
      setSaving(false);
    }
  };

  const assessQuarterBehaviour = async (context: IManagerQuarterReviewContext, item: IQuarterReviewItem, assessment: BehaviourRating): Promise<void> => {
    if (!overview.employee) return;
    setSaving(true);
    setManagerMessage(undefined);
    try {
      await dataService.saveQuarterBehaviourAssessment(context, item, overview.employee, assessment);
      await reloadManagerQuarterReviews();
      setManagerMessage('The separate manager Behaviour rating was saved and confirmed apart from the employee self-assessment.');
    } catch {
      setManagerMessage('The manager Behaviour assessment could not be saved. A genuine assigned-manager session and Submitted review are required.');
    } finally {
      setSaving(false);
    }
  };

  if (adminUatMode) {
    return <AdminFoundationUatHarness productionIdentity={`${userDisplayName} · ${currentUserEmail}`} />;
  }

  if (strategicCoreCoverageUatMode) {
    return <StrategicCoreCoverageUatHarness productionIdentity={`${userDisplayName} · ${currentUserEmail}`} />;
  }

  if (strategicCoreCoverageBusinessUatMode) {
    if (loading) return <section className={styles.performanceHub} aria-label="Coverage business UAT loading">
      <div className={styles.loadingState} role="status">Loading current KCF reference data…</div>
    </section>;
    if (!adminReportingSnapshot) return <section className={styles.performanceHub} aria-label="Coverage business UAT unavailable">
      <div className={styles.loadingState} role="alert">{adminReportingLoadMessage
        || 'The current KCF reference data could not be verified. No data was changed.'}</div>
    </section>;
    return <StrategicCoreCoverageBusinessUatHarness
      productionIdentity={`${userDisplayName} · ${currentUserEmail}`}
      snapshot={adminReportingSnapshot}
    />;
  }

  if (adminReportingUatMode) {
    if (loading) {
      return <section className={styles.performanceHub} aria-label="KCF Admin Reporting safe UAT loading">
        <div className={styles.loadingState} role="status">Verifying the authorised read-only production baseline…</div>
      </section>;
    }
    if (!adminReportingSnapshot) {
      return <section className={styles.performanceHub} aria-label="KCF Admin Reporting safe UAT blocked">
        <div className={styles.loadingState} role="alert">{adminReportingLoadMessage
          || 'Safe Admin Reporting UAT is blocked because the read-only production baseline was not verified. No data was changed.'}</div>
      </section>;
    }
    return <AdminReportingControlUatHarness
      productionIdentity={`${userDisplayName} · ${currentUserEmail}`}
      baseline={adminReportingSnapshot}
      loadMessage={adminReportingLoadMessage}
    />;
  }

  return (
    <section className={styles.performanceHub} aria-label="KCF Performance Hub production application">
      <header className={styles.shellHeader}>
        <div className={styles.brandBlock}>
          <span className={styles.brandMark} aria-hidden="true">KCF</span>
          <div><span className={styles.eyebrow}>Kent Cricket Foundation</span><h1>Performance Hub</h1><p>{localUatMode ? 'Annual Workplan · Local editable UAT' : 'Annual Workplan · Production'}</p></div>
        </div>
        <div className={styles.userBadge} aria-label="Signed-in user">
          <span className={styles.avatar}>{displayName.charAt(0)}</span>
          <span><strong>{displayName}</strong><small>{currentUserEmail}</small></span>
        </div>
      </header>

      {!localUatMode && <ProductionNavigation activeSection={activeSection} showManager={showManager} showRecovery={showRecovery} showAdmin={showAdmin} showDataQuality={showDataQuality} showBehaviourAdmin={showBehaviourAdmin} onChange={setActiveSection} />}

      <main className={styles.workspace}>
        {loading ? <div className={styles.loadingState} role="status">Loading your Workplan…</div> : localUatMode ? (
          <LocalWorkplanUatHarness catalogue={catalogue} behaviours={behaviours} behaviourLibrary={behaviourLibrary} employee={overview.employee} manager={overview.manager} />
        ) : activeSection === 'overview' ? (
          <OverviewPage overview={overview} fallbackDisplayName={userDisplayName} currentUserEmail={currentUserEmail} workplan={workplan} coreCatalogue={catalogue} coreItems={coreItems} personalItems={personalItems} behaviours={behaviours} behaviourItems={behaviourItems} quarterItems={quarterContext?.items} workplanDataState={workplanDataState} workplanDataMessage={workplanMessage} submitting={saving} submissionMessage={submissionMessage} storageAclStatus={storageAclStatus} onSubmit={submitWorkplan} onSaveCategoryWeights={saveCategoryWeights} />
        ) : activeSection === 'core' ? (
          workplanDataState === 'available' && workplan
            ? <CoreWorkplanPage catalogue={catalogue} workplan={workplan} items={coreItems} quarterItems={quarterContext?.items} saving={saving} message={workplanMessage} onSave={saveCoreDraft} />
            : <WorkplanSectionUnavailable state={unavailableWorkplanState} overview={overview} currentUserEmail={currentUserEmail} sectionName="Core Strategy KPIs" description="Core KPI selections are shown only after the Workplan header, approved catalogue and assignment rows have all been verified." message={workplanMessage} />
        ) : activeSection === 'personal' ? (
          workplanDataState === 'available' && workplan
            ? <PersonalWorkplanPage workplan={workplan} items={personalItems} saving={saving} message={personalMessage} onSave={savePersonalDraft} />
            : <WorkplanSectionUnavailable state={unavailableWorkplanState} overview={overview} currentUserEmail={currentUserEmail} sectionName="Impact KPIs" description="Impact KPI values are shown only after your current Workplan and employee access have been verified." message={workplanMessage} />
        ) : activeSection === 'behaviours' ? (
          workplanDataState === 'available' && workplan
            ? <BehaviourWorkplanPage workplan={workplan} behaviours={behaviours} library={behaviourLibrary} items={behaviourItems} saving={saving} message={behaviourMessage} onSave={saveBehaviourDraft} />
            : <WorkplanSectionUnavailable state={unavailableWorkplanState} overview={overview} currentUserEmail={currentUserEmail} sectionName="Behaviours" description="Behaviour assignments are shown only after the published framework and Workplan assignment rows have been verified." message={workplanMessage} />
        ) : activeSection === 'quarterly' ? (
          <QuarterlyReviewPage workplan={workplan} config={overview.config} lifecycles={quarterLifecycles} selectedQuarter={selectedQuarter} context={quarterContext} loading={quarterLoading} saving={saving} message={quarterMessage} onSelectQuarter={selectQuarter} onPrepare={prepareQuarter} onSaveItem={saveQuarterItem} onAddProgress={addQuarterProgress} onSubmit={submitQuarter} />
        ) : activeSection === 'manager' ? (
          <ManagerReviewPage contexts={managerContexts} quarterContexts={managerQuarterContexts} saving={saving} message={managerMessage} onRequestChanges={requestWorkplanChanges} onApproveAndLock={approveWorkplan} onRequestQuarterChanges={requestQuarterChanges} onApproveAndLockQuarter={approveAndLockQuarter} onOverrideQuarterRag={overrideQuarterRag} onAssessQuarterBehaviour={assessQuarterBehaviour} />
        ) : activeSection === 'recovery' ? (
          <RecoveryActionboardPage contexts={recoveryActionboardContexts} />
        ) : activeSection === 'admin' && showAdmin && overview.employee ? (
          <AdminFoundationPage
            peopleState={adminPeopleState}
            teamsState={adminTeamsState}
            behaviourLibrary={behaviourLibrary}
            configRecords={adminConfigRecords}
            kpiDataQualityQueue={dataQualityQueue}
            reportingChecks={[{
              checkKey: 'reporting-map',
              label: 'Reporting Map administration is not released',
              ready: false,
              detail: 'The current Admin foundation does not publish a Reporting Map.',
              recommendedResolution: 'Complete the separately controlled Reporting/Admin slice.',
              sourceReference: 'KCF-KPI-020A bounded scope',
              priority: 'P2',
              owner: 'CONTROL'
            }]}
            localUat={false}
            productionIdentity={`${overview.employee.displayName} · ${overview.employee.email}`}
            actorEmail={overview.employee.email}
            loadMessage={adminLoadMessage}
          />
        ) : activeSection === 'adminReporting' && showAdmin && overview.employee ? (
          <AdminReportingControlPage
            productionIdentity={`${overview.employee.displayName} · ${overview.employee.email}`}
            snapshot={adminReportingSnapshot}
            unresolvedDataQualityCount={dataQualityQueue.totalIssues}
            loadMessage={adminReportingLoadMessage}
            localUat={false}
          />
        ) : activeSection === 'strategicCoverage' && showAdmin && overview.employee ? (
          <StrategicCoreCoveragePage
            productionIdentity={`${overview.employee.displayName} · ${overview.employee.email}`}
            filter={{ performanceYear: overview.config?.performanceYearNumber }}
            filterOptions={{
              performanceYears: overview.config ? [overview.config.performanceYearNumber] : [],
              pillars: [], workstreams: [], teams: [], managers: [], kpis: [],
              memberships: [
                { key: 'CORE_CWOP', label: 'CORE CWOP', enabled: true },
                { key: 'LONDON_CITIES_CWOP', label: 'LONDON CITIES CWOP', enabled: true },
                { key: 'WOMEN_GIRLS_CWOP', label: 'WOMEN & GIRLS CWOP', enabled: true },
                { key: 'CWSP', label: 'CWSP', enabled: true },
                { key: 'EDI_CWOP', label: 'Future EDI CWOP — configuration required', enabled: false }
              ]
            }}
            localUat={false}
            message="The production RPT-005 contribution feed is not yet provisioned or activated. The screen remains read-only and makes no inference."
          />
        ) : activeSection === 'reporting' ? (
          <ReportingViewsPage dataset={reportingData} />
        ) : activeSection === 'dataQuality' && showDataQuality ? (
          <DataQualityPage queue={dataQualityQueue} />
        ) : activeSection === 'behaviourAdmin' && showBehaviourAdmin ? (
          <BehaviourObjectiveLibraryAdminPage
            records={behaviourLibrary}
            disabled={saving}
            onSaveRecord={saveBehaviourObjective}
            onSetActive={setBehaviourObjectiveActive}
            onReorder={reorderBehaviourObjectives}
            makeKey={makeBehaviourObjectiveKey}
          />
        ) : null}
      </main>
    </section>
  );
};

export default PerformanceHub;
