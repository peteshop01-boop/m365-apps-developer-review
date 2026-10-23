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
import type { IWorkplanCategoryWeights } from '../models/GovernanceModels';
import { buildEmployeeWorkplanStatus } from '../services/EmployeeWorkplanStatus';
import WorkplanStatusPanel from './WorkplanStatusPanel';
import CategoryWeightingPanel from './CategoryWeightingPanel';
import CoreWorkplanPage from './CoreWorkplanPage';
import PersonalKpisPage from './PersonalKpisPage';
import BehavioursPage from './BehavioursPage';
import styles from './PerformanceHub.module.scss';

type UatSection = 'overview' | 'core' | 'personal' | 'behaviours';

export interface IEmployeeWorkplanUatHarnessProps {
  catalogue: ICoreKpiCatalogueItem[];
  behaviours: IBehaviourSummary[];
  employee?: IProductionPerson;
  manager?: IProductionPerson;
}

const fixtureWorkplan = (employee: IProductionPerson | undefined, manager: IProductionPerson | undefined): IAnnualWorkplan => ({
  id: -17,
  etag: 'LOCAL-UAT',
  workplanKey: 'KCF-KPI-017|LOCAL-UAT|2026',
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

const EmployeeWorkplanUatHarness: React.FC<IEmployeeWorkplanUatHarnessProps> = ({ catalogue, behaviours, employee, manager }) => {
  const [section, setSection] = React.useState<UatSection>('overview');
  const [workplan, setWorkplan] = React.useState<IAnnualWorkplan>(() => fixtureWorkplan(employee, manager));
  const firstKpi = catalogue.find(item => item.kpiId === 'SO1-001') || catalogue[0];
  const [coreItems, setCoreItems] = React.useState<ICoreWorkplanItem[]>(() => firstKpi ? [{
    id: -1, etag: 'LOCAL-UAT', workplanItemKey: 'LOCAL-UAT|CORE|1', naturalKey: `KCF-KPI-017|LOCAL-UAT|CoreGold|${firstKpi.kpiId}`,
    workplanKey: workplan.workplanKey, personKey: workplan.personKey, performanceYear: workplan.performanceYear,
    kpiId: firstKpi.kpiId, kpiVersionKey: firstKpi.kpiVersionKey, targetVersionKey: firstKpi.targetVersionKey,
    coreWorkplanWeight: 100, employeeKpiRole: 'Contributor', displayOrder: 1, activeInWorkplan: true
  }] : []);
  const [personalItems, setPersonalItems] = React.useState<IPersonalWorkplanItem[]>([]);
  const [behaviourItems, setBehaviourItems] = React.useState<IBehaviourWorkplanItem[]>(() => behaviours.map((behaviour, index) => ({
    id: -(index + 10), etag: 'LOCAL-UAT', workplanItemKey: `LOCAL-UAT|BEHAVIOUR|${behaviour.behaviourId}`,
    naturalKey: `KCF-KPI-017|LOCAL-UAT|Behaviour|${behaviour.behaviourId}`, workplanKey: workplan.workplanKey,
    personKey: workplan.personKey, performanceYear: workplan.performanceYear, behaviourId: behaviour.behaviourId,
    behaviourVersionKey: behaviour.behaviourVersionKey, behaviourItemWeight: 20, displayOrder: index + 1, activeInWorkplan: true
  })));
  const [weights, setWeights] = React.useState<IWorkplanCategoryWeights>({ core: 70, personal: 20, behaviours: 10 });
  const [overrideReason, setOverrideReason] = React.useState('');
  const [simulatedApproval, setSimulatedApproval] = React.useState(false);
  const [message, setMessage] = React.useState('Local preview ready. Changes here do not affect live data.');

  const changeState = (state: WorkplanState): void => {
    const editable = state === 'Draft' || state === 'ChangesRequested';
    setWorkplan(current => ({
      ...current,
      state,
      accessState: editable ? 'EmployeeEdit' : state === 'Submitted' ? 'ManagerDecision' : 'ReadOnly',
      managerDecisionComment: state === 'ChangesRequested' ? 'Local UAT: please amend the selected content and resubmit.' : undefined,
      submittedAt: state === 'Submitted' ? '2026-08-20T12:00:00Z' : undefined,
      submittedByEmail: state === 'Submitted' ? current.employeeEmail : undefined
    }));
  };

  const saveCore = async (items: ICoreWorkplanItem[]): Promise<void> => {
    setCoreItems(items.map((item, index) => ({ ...item, id: item.id || -(index + 1), etag: 'LOCAL-UAT', workplanItemKey: item.workplanItemKey || `LOCAL-UAT|CORE|${item.kpiId}` })));
    setMessage('Core Draft saved in the local preview only. No live data was changed.');
  };

  const savePersonal = async (items: IPersonalWorkplanItem[]): Promise<void> => {
    setPersonalItems(items.map((item, index) => {
      const key = item.workplanItemKey || `LOCAL-UAT|PERSONAL|${Math.abs(item.id || index + 1)}`;
      return { ...item, id: item.id || -(index + 100), etag: 'LOCAL-UAT', workplanItemKey: key, naturalKey: item.naturalKey || `${workplan.workplanKey}|LocalPersonal|${key}` };
    }));
    setMessage('Impact KPI Draft saved in the local preview only. No live data was changed.');
  };

  const assignBehaviours = async (): Promise<void> => {
    setBehaviourItems(behaviours.map((behaviour, index) => ({
      id: -(index + 10), etag: 'LOCAL-UAT', workplanItemKey: `LOCAL-UAT|BEHAVIOUR|${behaviour.behaviourId}`,
      naturalKey: `${workplan.workplanKey}|Behaviour|${behaviour.behaviourId}`, workplanKey: workplan.workplanKey,
      personKey: workplan.personKey, performanceYear: workplan.performanceYear, behaviourId: behaviour.behaviourId,
      behaviourVersionKey: behaviour.behaviourVersionKey, behaviourItemWeight: 20, displayOrder: index + 1, activeInWorkplan: true
    })));
    setMessage('All five Behaviour assignments refreshed in local memory only.');
  };

  const removeBehaviours = async (): Promise<void> => {
    setBehaviourItems(items => items.map(item => ({ ...item, activeInWorkplan: false })));
    setMessage('Behaviour assignments deactivated in local memory only.');
  };

  const status = buildEmployeeWorkplanStatus(workplan, manager, coreItems, personalItems, behaviourItems);
  return <section className={styles.uatHarness} aria-label="KCF-KPI-017 local editable Workplan UAT">
    <div className={styles.uatBanner} role="status"><strong>LOCAL UAT · SYNTHETIC DRAFT · NO SHAREPOINT WRITES</strong><span>This fixture reuses the real employee components and the live read-only catalogue/Behaviour definitions. Saves exist only in browser memory and disappear on reload.</span></div>
    <div className={styles.uatControls}>
      <label><span>Simulated Workplan state</span><select value={workplan.state} onChange={event => changeState(event.target.value as WorkplanState)}><option>Draft</option><option>ChangesRequested</option><option>Submitted</option><option>Locked</option></select></label>
      <span>{message}</span>
    </div>
    <nav className={styles.uatNav} aria-label="Local editable UAT sections">{(['overview', 'core', 'personal', 'behaviours'] as UatSection[]).map(item => <button type="button" key={item} aria-current={section === item ? 'page' : undefined} onClick={() => setSection(item)}>{item === 'overview' ? 'UAT Overview' : item === 'core' ? 'Core KPIs' : item === 'personal' ? 'Impact KPIs' : 'Behaviours'}</button>)}</nav>
    {section === 'overview' ? <>
      <WorkplanStatusPanel status={status} />
      <CategoryWeightingPanel weights={weights} workplanState={workplan.state} editable={status.editable} localUat reason={overrideReason} simulatedApproval={simulatedApproval} onChange={value => { setWeights(value); setWorkplan(current => ({ ...current, coreCategoryWeight: value.core, personalCategoryWeight: value.personal, behaviourCategoryWeight: value.behaviours })); }} onReasonChange={setOverrideReason} onApprovalChange={setSimulatedApproval} />
    </> : section === 'core' ? <CoreWorkplanPage catalogue={catalogue} workplan={workplan} items={coreItems} saving={false} message={message} onSave={saveCore} />
      : section === 'personal' ? <PersonalKpisPage workplan={workplan} items={personalItems} saving={false} message={message} onSave={savePersonal} />
        : <BehavioursPage workplan={workplan} behaviours={behaviours} items={behaviourItems} saving={false} message={message} onAssign={assignBehaviours} onRemove={removeBehaviours} />}
  </section>;
};

export default EmployeeWorkplanUatHarness;
