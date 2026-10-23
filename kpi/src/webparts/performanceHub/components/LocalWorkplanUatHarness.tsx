import * as React from 'react';
import type {
  IAnnualWorkplan,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  ICoreKpiCatalogueItem,
  ICoreWorkplanItem,
  IPersonalWorkplanItem,
  IProductionPerson,
  WorkplanState
} from '../models/ProductionModels';
import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import type { IWorkplanCategoryWeights } from '../models/GovernanceModels';
import type { IProgressEntry, IQuarterReviewContext, IQuarterReviewItem, QuarterKey } from '../models/QuarterlyModels';
import { buildEmployeeWorkplanStatus } from '../services/EmployeeWorkplanStatus';
import {
  addLocalQuarterProgress,
  buildLocalPersonalQuarterContext,
  buildLocalQuarterLifecycle,
  LOCAL_QUARTERLY_CONFIG,
  saveLocalCoreQuarterItem,
  saveLocalPersonalQuarterItem
} from '../services/LocalQuarterlyUat';
import { materialiseBehaviourSourceData } from '../services/QuarterBehaviourTargetSnapshot';
import WorkplanStatusPanel from './WorkplanStatusPanel';
import CategoryWeightingPanel from './CategoryWeightingPanel';
import CoreWorkplanPage from './CoreWorkplanPage';
import PersonalWorkplanPage from './PersonalWorkplanPage';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';
import BehaviourObjectiveLibraryAdminPage from './BehaviourObjectiveLibraryAdminPage';
import QuarterlyReviewPage from './QuarterlyReviewPage';
import styles from './PerformanceHub.module.scss';

type UatSection = 'overview' | 'core' | 'personal' | 'behaviours' | 'quarterly' | 'admin';
const UAT_QUARTERS: readonly QuarterKey[] = ['Q1', 'Q2', 'Q3', 'Q4'];

export interface ILocalWorkplanUatHarnessProps {
  catalogue: ICoreKpiCatalogueItem[];
  behaviours: IBehaviourSummary[];
  behaviourLibrary: ReadonlyArray<IBehaviourObjectiveLibraryRecord>;
  employee?: IProductionPerson;
  manager?: IProductionPerson;
}

const fixtureWorkplan = (employee?: IProductionPerson, manager?: IProductionPerson): IAnnualWorkplan => ({
  id: -1800,
  etag: 'LOCAL-UAT',
  workplanKey: 'KCF-KPI-018|LOCAL-UAT|2026',
  personKey: employee?.personKey || 'LOCAL-UAT-EMPLOYEE',
  employeeDisplayName: employee?.displayName || 'Local UAT Employee',
  employeeEmail: employee?.email || 'local-uat@example.invalid',
  performanceYear: 2026,
  managerPersonKey: manager?.personKey || 'LOCAL-UAT-MANAGER',
  managerDisplayName: manager?.displayName || 'Local UAT Manager',
  managerEmail: manager?.email || 'local-uat-manager@example.invalid',
  state: 'Draft',
  accessState: 'EmployeeEdit',
  transitionStatus: 'Ready',
  coreCategoryWeight: 70,
  personalCategoryWeight: 20,
  behaviourCategoryWeight: 10,
  rowVersionToken: 1
});

const fixtureEmployee = (workplan: IAnnualWorkplan, employee?: IProductionPerson): IProductionPerson => employee || ({
  id: -1800,
  personKey: workplan.personKey,
  displayName: workplan.employeeDisplayName,
  email: workplan.employeeEmail,
  managerPersonKey: workplan.managerPersonKey,
  managerEmail: workplan.managerEmail,
  appRoles: ['Employee'],
  active: true
});

const fixtureManager = (workplan: IAnnualWorkplan, manager?: IProductionPerson): IProductionPerson => manager || ({
  id: -1801,
  personKey: workplan.managerPersonKey || 'LOCAL-UAT-MANAGER',
  displayName: workplan.managerDisplayName || 'Local UAT Manager',
  email: workplan.managerEmail || 'local-uat-manager@example.invalid',
  appRoles: ['Manager'],
  active: true
});

const localParticipantBinding = (person: IProductionPerson): string => JSON.stringify([
  person.personKey, person.email.trim().toLowerCase(), person.active,
  person.managerPersonKey || '', person.managerEmail?.trim().toLowerCase() || '', [...person.appRoles].sort()
]);

const localDefinitionImage = (value: unknown): string => JSON.stringify(value, (_key, entry: unknown) => {
  if (typeof entry === 'number' && !Number.isFinite(entry)) throw new Error('Local annual definitions require finite numeric values.');
  return entry;
});
const assertNoRecordedQuarterRefresh = (contexts: Partial<Record<QuarterKey, IQuarterReviewContext>>): void => {
  const hasWork = Object.keys(contexts).some(key => {
    const context = contexts[key as QuarterKey];
    return context && (context.progressLedgers.length > 0 || context.evidence.length > 0
      || (context.review && context.review.state !== 'Draft' && context.review.state !== 'ChangesRequested')
      || context.items.some(item => item.employeeActualValue !== undefined || item.employeeActualText !== undefined
        || Boolean(item.statusUpdate) || item.quarterEndForecastValue !== undefined || item.quarterEndForecastText !== undefined
        || item.recovery !== undefined));
  });
  if (hasWork) throw new Error('Existing Quarterly work must be reconciled before changing local annual definitions. Current updates and evidence were preserved.');
};

const LocalWorkplanUatHarness: React.FC<ILocalWorkplanUatHarnessProps> = ({ catalogue, behaviours, behaviourLibrary, employee, manager }) => {
  const initialWorkplan = React.useMemo(() => fixtureWorkplan(employee, manager), [employee, manager]);
  const localEmployee = React.useMemo(() => fixtureEmployee(initialWorkplan, employee), [employee, initialWorkplan]);
  const localManager = React.useMemo(() => fixtureManager(initialWorkplan, manager), [initialWorkplan, manager]);
  const [section, setSection] = React.useState<UatSection>('overview');
  const [workplan, setWorkplan] = React.useState<IAnnualWorkplan>(initialWorkplan);
  const [coreItems, setCoreItems] = React.useState<ICoreWorkplanItem[]>([]);
  const [personalItems, setPersonalItems] = React.useState<IPersonalWorkplanItem[]>([]);
  const [behaviourItems, setBehaviourItems] = React.useState<IBehaviourWorkplanItem[]>([]);
  const [library, setLibrary] = React.useState<IBehaviourObjectiveLibraryRecord[]>(() => behaviourLibrary.map(item => ({ ...item })));
  const [weights, setWeights] = React.useState<IWorkplanCategoryWeights>({ core: 70, personal: 20, behaviours: 10 });
  const [categoryReason, setCategoryReason] = React.useState('');
  const [simulatedApproval, setSimulatedApproval] = React.useState(false);
  const [selectedUatQuarter, setSelectedUatQuarter] = React.useState<QuarterKey>('Q1');
  const [quarterContexts, setQuarterContexts] = React.useState<Partial<Record<QuarterKey, IQuarterReviewContext>>>(() => ({
    Q1: buildLocalPersonalQuarterContext(initialWorkplan, localEmployee, localManager, [], 'Q1', [], [], true)
  }));
  const currentQuarterContexts = React.useRef(quarterContexts);
  const personalDefinitionImage = React.useRef('[]');
  const coreDefinitionImage = React.useRef(localDefinitionImage({ items: [], catalogue: [] }));
  const currentCoreItems = React.useRef<ICoreWorkplanItem[]>([]);
  const currentPersonalItems = React.useRef<IPersonalWorkplanItem[]>([]);
  const capturedCoreCatalogue = React.useRef<ICoreKpiCatalogueItem[]>([]);
  const quarterGeneration = React.useRef(0);
  const mounted = React.useRef(true);
  const participantBinding = localParticipantBinding(localEmployee) + '|' + localParticipantBinding(localManager);
  const originalParticipants = React.useRef(participantBinding);
  const participantsAvailable = React.useRef(true);
  participantsAvailable.current = participantBinding === originalParticipants.current
    && localEmployee.active === true && localManager.active === true;
  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const [message, setMessage] = React.useState('Local preview ready. Changes here do not affect live data.');
  const assertLocalParticipants = (): void => {
    if (!mounted.current || !participantsAvailable.current) {
      throw new Error('Local preview participants changed or are unavailable. Existing work was preserved.');
    }
  };

  const changeState = (state: WorkplanState): void => {
    assertLocalParticipants();
    const editable = state === 'Draft' || state === 'ChangesRequested';
    setWorkplan(current => ({
      ...current,
      state,
      accessState: editable ? 'EmployeeEdit' : state === 'Submitted' ? 'ManagerDecision' : 'ReadOnly',
      managerDecisionComment: state === 'ChangesRequested' ? 'Local UAT change request: amend and resubmit the complete Workplan.' : undefined
    }));
  };

  const saveCore = async (items: ICoreWorkplanItem[]): Promise<void> => {
    assertLocalParticipants();
    const saved = materialiseBehaviourSourceData(items.map((item, index) => ({
      ...item,
      id: item.id || -(index + 1),
      etag: 'LOCAL-UAT',
      workplanItemKey: item.workplanItemKey || `LOCAL-UAT|CORE|${item.kpiId}`,
      naturalKey: item.naturalKey || `${workplan.workplanKey}|CoreGold|${item.kpiId}`
    })));
    const sourceCatalogue = materialiseBehaviourSourceData(catalogue);
    const image = localDefinitionImage({ items: saved, catalogue: sourceCatalogue });
    if (image === coreDefinitionImage.current) {
      setMessage('Core definitions are unchanged. Existing Quarterly updates and evidence remain in this local preview.');
      return;
    }
    assertNoRecordedQuarterRefresh(currentQuarterContexts.current);
    const refreshedContexts: Partial<Record<QuarterKey, IQuarterReviewContext>> = {};
    UAT_QUARTERS.forEach(quarter => {
      refreshedContexts[quarter] = buildLocalPersonalQuarterContext(workplan, localEmployee, localManager,
        currentPersonalItems.current, quarter, sourceCatalogue, saved, true);
    });
    quarterGeneration.current += 1;
    coreDefinitionImage.current = image;
    currentCoreItems.current = saved;
    capturedCoreCatalogue.current = sourceCatalogue;
    currentQuarterContexts.current = refreshedContexts;
    setCoreItems(saved);
    setQuarterContexts(refreshedContexts);
    setMessage('Core definitions and Q1–Q4 targets saved in the local preview and refreshed for Quarterly Review.');
  };

  const savePersonal = async (items: IPersonalWorkplanItem[]): Promise<void> => {
    assertLocalParticipants();
    const saved = items.map((item, index) => {
      const key = item.workplanItemKey || `LOCAL-UAT|PERSONAL|${Math.abs(item.id || index + 1)}`;
      return { ...item, id: item.id || -(index + 100), etag: 'LOCAL-UAT', workplanItemKey: key, naturalKey: item.naturalKey || `${workplan.workplanKey}|LocalPersonal|${key}` };
    });
    const definitionImage = localDefinitionImage(saved);
    if (definitionImage === personalDefinitionImage.current) {
      setMessage('Impact definitions are unchanged. Existing Quarterly updates and evidence remain in this local preview.');
      return;
    }
    assertNoRecordedQuarterRefresh(currentQuarterContexts.current);
    const refreshedContexts: Partial<Record<QuarterKey, IQuarterReviewContext>> = {};
    UAT_QUARTERS.forEach(quarter => {
      refreshedContexts[quarter] = buildLocalPersonalQuarterContext(workplan, localEmployee, localManager, saved, quarter,
        capturedCoreCatalogue.current, currentCoreItems.current, true);
    });
    quarterGeneration.current += 1;
    personalDefinitionImage.current = definitionImage;
    currentPersonalItems.current = saved;
    currentQuarterContexts.current = refreshedContexts;
    setPersonalItems(saved);
    setQuarterContexts(refreshedContexts);
    setMessage('Impact KPI definitions and Q1–Q4 targets saved in the local preview and refreshed for Quarterly Review.');
  };

  const saveBehaviours = async (items: IBehaviourWorkplanItem[]): Promise<void> => {
    assertLocalParticipants();
    setBehaviourItems(items.map((item, index) => ({
      ...item,
      id: item.id || -(index + 200),
      etag: 'LOCAL-UAT',
      workplanItemKey: item.workplanItemKey || `LOCAL-UAT|BEHAVIOUR|${item.behaviourId}`,
      naturalKey: item.naturalKey || `${workplan.workplanKey}|Behaviour|${item.behaviourId}`,
      activeInWorkplan: true
    })));
    setMessage('Five Behaviour objectives and quarterly commitments saved in the local preview only.');
  };

  if (!participantsAvailable.current) {
    return <section className={styles.uatHarness} role="alert">Local preview participants changed or are unavailable.
      Existing preview work is preserved. Reopen with the original employee and manager to continue.</section>;
  }

  const status = buildEmployeeWorkplanStatus(workplan, manager, coreItems, personalItems, behaviourItems);
  const activePersonal = personalItems.filter(item => item.activeInWorkplan).length;
  const selectedQuarterContext = quarterContexts[selectedUatQuarter]
    || buildLocalPersonalQuarterContext(workplan, localEmployee, localManager, personalItems, selectedUatQuarter,
      capturedCoreCatalogue.current, currentCoreItems.current, true);
  const quarterlyWorkplan: IAnnualWorkplan = { ...workplan, state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready' };
  const callbackGeneration = quarterGeneration.current;
  const currentQuarterForMutation = (): IQuarterReviewContext => {
    assertLocalParticipants();
    if (!mounted.current || callbackGeneration !== quarterGeneration.current) {
      throw new Error('The local Quarterly context changed or closed. Reload before updating.');
    }
    return currentQuarterContexts.current[selectedUatQuarter] || selectedQuarterContext;
  };
  const commitQuarterContext = (context: IQuarterReviewContext): void => {
    const next = { ...currentQuarterContexts.current, [selectedUatQuarter]: context };
    currentQuarterContexts.current = next;
    setQuarterContexts(next);
  };

  const saveQuarterItem = async (item: IQuarterReviewItem): Promise<void> => {
    const context = currentQuarterForMutation();
    commitQuarterContext(item.itemType === 'CoreGold' ? saveLocalCoreQuarterItem(context, item) : saveLocalPersonalQuarterItem(context, item));
    setMessage(`${selectedUatQuarter} KPI update saved and recalculated in the local preview only.`);
  };

  const addQuarterProgress = async (item: IQuarterReviewItem, entry: IProgressEntry): Promise<void> => {
    commitQuarterContext(addLocalQuarterProgress(currentQuarterForMutation(), item, entry));
    setMessage(`${selectedUatQuarter} progress and evidence reference saved in the local preview only.`);
  };

  return <section className={styles.uatHarness} aria-label="KCF-KPI-018 full local editable Workplan UAT">
    <div className={styles.uatBanner} role="status"><strong>LOCAL UAT · SYNTHETIC WORKPLAN · NO LIVE CHANGES</strong><span>Core, Impact, Behaviour, category and Admin changes stay in this preview and disappear on reload.</span>
      {section === 'quarterly' && <span>{selectedUatQuarter} is simulated as open and current for local editing. The live quarterly calendar is unchanged.</span>}</div>
    <div className={styles.uatControls}>
      <label><span>Simulated Workplan state</span><select value={workplan.state} onChange={event => changeState(event.target.value as WorkplanState)}><option>Draft</option><option>ChangesRequested</option><option>Submitted</option><option>Approved</option><option>Locked</option></select></label>
      <span>{message}</span>
    </div>
    <nav className={styles.uatNav} aria-label="KCF-KPI-018 local UAT sections">{([
      ['overview', 'UAT Overview'], ['core', 'Core KPIs'], ['personal', 'Impact KPIs'], ['behaviours', 'Behaviours'], ['quarterly', 'Quarterly Review'], ['admin', 'Admin library']
    ] as ReadonlyArray<readonly [UatSection, string]>).map(([key, label]) => <button type="button" key={key} aria-current={section === key ? 'page' : undefined} onClick={() => setSection(key)}>{label}</button>)}</nav>

    {section === 'overview' ? <>
      <WorkplanStatusPanel status={status} />
      <CategoryWeightingPanel
        weights={weights}
        workplanState={workplan.state}
        editable={status.editable}
        localUat
        activePersonalKpiCount={activePersonal}
        reason={categoryReason}
        simulatedApproval={simulatedApproval}
        onChange={value => {
          assertLocalParticipants();
          setWeights(value);
          setWorkplan(current => ({ ...current, coreCategoryWeight: value.core, personalCategoryWeight: value.personal, behaviourCategoryWeight: value.behaviours }));
        }}
        onReasonChange={value => { assertLocalParticipants(); setCategoryReason(value); setWorkplan(current => ({ ...current, categoryWeightReason: value })); }}
        onApprovalChange={value => { assertLocalParticipants(); setSimulatedApproval(value); }}
        onSave={async () => { assertLocalParticipants(); setMessage('Category-weight proposal saved in the local preview only.'); }}
      />
    </> : section === 'core' ? <CoreWorkplanPage catalogue={catalogue} workplan={workplan} items={coreItems} saving={false} message={message} onSave={saveCore} />
      : section === 'personal' ? <PersonalWorkplanPage workplan={workplan} items={personalItems} saving={false} message={message} localUat onSave={savePersonal} />
        : section === 'behaviours' ? <BehaviourWorkplanPage workplan={workplan} behaviours={behaviours} library={library} items={behaviourItems} saving={false} message={message} localUat onSave={saveBehaviours} />
          : section === 'quarterly' ? <QuarterlyReviewPage
            workplan={quarterlyWorkplan}
            config={LOCAL_QUARTERLY_CONFIG}
            lifecycles={UAT_QUARTERS.map(quarter => buildLocalQuarterLifecycle(quarter, quarter === selectedUatQuarter))}
            selectedQuarter={selectedUatQuarter}
            context={selectedQuarterContext}
            loading={false}
            saving={false}
            message={message}
            onSelectQuarter={async quarter => { assertLocalParticipants(); setSelectedUatQuarter(quarter); }}
            onPrepare={async () => { assertLocalParticipants(); setMessage('Local Quarterly Review is already prepared in this preview. No live data was changed.'); }}
            onSaveItem={saveQuarterItem}
            onAddProgress={addQuarterProgress}
            onSubmit={async () => { assertLocalParticipants(); setMessage('Local Quarterly submission was simulated in this preview only. No status or live data changed.'); }}
          /> : <BehaviourObjectiveLibraryAdminPage records={library} localUat onChange={value => { assertLocalParticipants(); setLibrary(value); }} />}
  </section>;
};

export default LocalWorkplanUatHarness;
