import * as React from 'react';
import * as ReactDOM from 'react-dom';
import BehaviourWorkplanPage from '../components/BehaviourWorkplanPage';
import IntegratedPerformanceHub from '../components/IntegratedPerformanceHub';
import { BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED } from '../services/provisioning/BehaviourRoleLevelLibrarySeed';
import { BEHAVIOUR_OBJECTIVE_LIBRARY_SEED } from '../services/provisioning/BehaviourObjectiveLibrarySeed';
import { mapBehaviourCatalogueRow } from '../services/BehaviourLibraryCatalogue';
import { upsertLocalBehaviourCatalogue } from '../services/BehaviourLibraryLocalStore';
import { EMPLOYEE_V2_APPROVED_BEHAVIOURS } from '../services/EmployeeWorkplanV2ApprovedBehaviours';
import type { IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem, IProductionPerson, IProductionConfig } from '../models/ProductionModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IEmployeeWorkplanReadbackV2, IEmployeeV2WorkplanCommandContext, IEmployeeV2PersistenceResult, EmployeeV2CommandType } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IQuarterTimingConfig } from '../models/GovernanceModels';
import { evaluateReadiness } from '../services/ReadinessService';
import styles from '../components/PerformanceHub.module.scss';

// This entire module is an explicit test entry, never imported by the production webpart.
export const localLibrary = upsertLocalBehaviourCatalogue(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED,
  BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED.map(mapBehaviourCatalogueRow));
export const localWorkplan: IAnnualWorkplan = {
  id: -1, etag: 'LOCAL-1', workplanKey: 'BHVLIB-001|synthetic|2026', personKey: 'synthetic',
  employeeDisplayName: 'Synthetic Employee', employeeEmail: 'employee@example.invalid', performanceYear: 2026,
  managerPersonKey: 'synthetic-manager', managerDisplayName: 'Synthetic Manager', managerEmail: 'manager@example.invalid',
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', coreCategoryWeight: 70,
  personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
};
export const localDefinitions: IBehaviourSummary[] = EMPLOYEE_V2_APPROVED_BEHAVIOURS.map((row, index) => ({
  behaviourId: row.behaviourId, behaviourVersionKey: `${row.behaviourId}|v01`, title: row.title,
  description: row.title, assessmentGuidance: `CorporateValue: ${row.corporateValue}\n${row.prompts.map((prompt, i) => `Prompt${i + 1}: ${prompt}`).join('\n')}`,
  defaultWorkplanWeight: 20, displayOrder: index + 1
}));
export const initialLocalItems = (): IBehaviourWorkplanItem[] => localDefinitions.map((row, index) => ({
  id: -(index + 1), etag: 'LOCAL-1', workplanItemKey: `local-${row.behaviourId}`, naturalKey: `local|${row.behaviourId}`,
  workplanKey: localWorkplan.workplanKey, personKey: localWorkplan.personKey, performanceYear: 2026,
  behaviourId: row.behaviourId, behaviourVersionKey: row.behaviourVersionKey, objectiveSource: 'Custom',
  selectedSuggestionKeys: [], customObjective: `Synthetic commitment ${index + 1}`, objectiveTitle: `Synthetic commitment ${index + 1}`,
  objectiveDescription: `Synthetic commitment ${index + 1}`, measure: 'Agreed commitments', unit: 'Rating', evidenceDefinition: 'Dated examples',
  q1TargetText: 'Q1 commitment', q2TargetText: 'Q2 commitment', q3TargetText: 'Q3 commitment', q4TargetText: 'Q4 commitment',
  targetRating: 3, q1TargetRating: 3, q2TargetRating: 3, q3TargetRating: 3, q4TargetRating: 3,
  behaviourItemWeight: 20, displayOrder: index + 1, activeInWorkplan: true
}));

export interface ILocalBehaviourSnapshot { items: IBehaviourWorkplanItem[]; saves: number; }
let state: ILocalBehaviourSnapshot = { items: initialLocalItems(), saves: 0 };
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const getLocalSnapshot = (): string => JSON.stringify(state);
// Integrated fixtures are separate; the annual values above remain unchanged.
export const integratedConfig: IProductionConfig = {
  performanceYear: '2025/26', performanceYearStart: '2025-11-01T00:00:00Z', performanceYearEnd: '2026-10-31T00:00:00Z',
  performanceYearNumber: 2026, quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 }, rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: [], retentionStatus: 'TBC'
};
export const integratedTiming: IQuarterTimingConfig = {
  earlyReviewReminderDays: 30, preparationReminderDays: 14, finalReminderDays: 7,
  employeeSubmissionDays: 7, managerReviewDays: 7
};
const readback = (): IEmployeeWorkplanReadbackV2 => ({
  workplan: { ...clone(localWorkplan), workplanVersion: 1, coreWeightingMode: 'Equal' },
  coreItems: [], personalItems: [], behaviourItems: clone(state.items), audits: []
});
const employee: IProductionPerson = { id: -1, personKey: 'synthetic', displayName: 'Synthetic Employee',
  email: 'employee@example.invalid', managerEmail: 'manager@example.invalid', managerPersonKey: 'synthetic-manager', active: true, appRoles: ['Employee'] };
const manager: IProductionPerson = { id: -2, personKey: 'synthetic-manager', displayName: 'Synthetic Manager',
  email: 'manager@example.invalid', active: true, appRoles: ['Manager'] };
const referenceCounts = { activeKpis: 109, approvedAnnualTargets: 109, publishedBehaviours: 5 };
interface ILocalAdapterCall { method: string; args: unknown[]; result: unknown; }
let adapterCalls: ILocalAdapterCall[] = [];
const record = <T,>(method: string, args: unknown[], result: T): T => {
  adapterCalls.push({ method, args: clone(args), result: result === undefined ? undefined : clone(result) }); return result;
};
export const getIntegratedDiagnostics = (): { calls: ILocalAdapterCall[]; readback: IEmployeeWorkplanReadbackV2; readiness: ReturnType<typeof evaluateReadiness> } => ({
  calls: clone(adapterCalls), readback: readback(), readiness: evaluateReadiness({ employee, manager, config: integratedConfig, counts: referenceCounts })
});
// Typed synthetic receipts satisfy only the local adapter result shape. No SharePoint command/receipt exists.
const localResult = (context: IEmployeeV2WorkplanCommandContext, commandType: EmployeeV2CommandType): IEmployeeV2PersistenceResult<IEmployeeWorkplanReadbackV2> => ({
  readback: readback(), duplicate: false,
  receipt: { receiptKey: `LOCAL-ONLY|${context.commandKey}`, sourceListId: 'LOCAL_ONLY_NO_LIST', sourceItemId: -1,
    sourceItemVersion: 'LOCAL-1', commandKey: context.commandKey, commandType, subjectType: 'Workplan',
    subjectKey: localWorkplan.workplanKey, personKey: employee.personKey, performanceYear: 2026,
    authenticatedActorEmail: employee.email, authenticatedActorPersonKey: employee.personKey, effectiveRole: 'Employee',
    processedByEmail: 'local-adapter@example.invalid', processedAt: '2026-11-01T12:00:00Z', outcome: 'Accepted',
    validationCode: 'LOCAL_FIXTURE_ONLY', message: 'Synthetic adapter result; no authoritative persistence or receipt.',
    processedPayloadSha256: 'NOT_COMPUTED_LOCAL_FIXTURE', resultKeysJson: '[]', auditKeysJson: '[]',
    correlationKey: context.commandKey, flowRunReference: 'LOCAL_ONLY_NO_FLOW' }
});
// Every implemented method is checked against the real interface. Unimplemented routes fail explicitly.
export const localMethods: Pick<IProductionDataService, 'getPersonByEmail' | 'getProductionConfig' | 'getReferenceCounts'
  | 'getWorkplanStatus' | 'getBehaviourObjectiveLibrary' | 'getDirectReports' | 'getQuarterTimingConfig'
  | 'getCoreKpiCatalogue' | 'getPublishedBehaviours' | 'getEmployeeWorkplanV2' | 'upsertBehaviourCommitmentV2'
  | 'setCoreWeightingV2' | 'saveEmployeeWorkplanDraftV2'> = {
  getPersonByEmail: async email => record('getPersonByEmail', [email], email === employee.email ? clone(employee) : email === manager.email ? clone(manager) : undefined),
  getProductionConfig: async () => record('getProductionConfig', [], clone(integratedConfig)),
  getReferenceCounts: async year => record('getReferenceCounts', [year], clone(referenceCounts)),
  getWorkplanStatus: async (personKey, year) => record('getWorkplanStatus', [personKey, year], 'Draft'),
  getBehaviourObjectiveLibrary: async inactive => record('getBehaviourObjectiveLibrary', [inactive], clone(localLibrary)),
  getDirectReports: async actor => record('getDirectReports', [actor.personKey], []),
  getQuarterTimingConfig: async () => record('getQuarterTimingConfig', [], clone(integratedTiming)),
  getCoreKpiCatalogue: async year => record('getCoreKpiCatalogue', [year], []),
  getPublishedBehaviours: async () => record('getPublishedBehaviours', [], clone(localDefinitions)),
  getEmployeeWorkplanV2: async (actor, year) => record('getEmployeeWorkplanV2', [actor.personKey, year], readback()),
  upsertBehaviourCommitmentV2: async (context, input) => {
    state = { items: state.items.map(row => row.behaviourId === input.behaviourId ? { ...row, ...clone(input) } : row), saves: state.saves + 1 };
    return record('upsertBehaviourCommitmentV2', [context, input], localResult(context, 'UpsertBehaviourCommitmentV2'));
  },
  setCoreWeightingV2: async (context, input) => record('setCoreWeightingV2', [context, input], localResult(context, 'SetCoreWeightingV2')),
  saveEmployeeWorkplanDraftV2: async (context, input) => record('saveEmployeeWorkplanDraftV2', [context, input], localResult(context, 'UpdateWorkplanDraftV2'))
};
// Deliberately partial service boundary; no cast conceals concrete method or fixture fields.
const service = new Proxy(localMethods, { get(target, key: string) {
  if (key in target) return target[key as keyof typeof localMethods];
  throw new Error(`Local fixture does not implement ${key}`);
} }) as IProductionDataService;
const adminService = {} as IAdminReportingControlDataService;
export const unmountLocalHarness = (host: HTMLElement): void => { ReactDOM.unmountComponentAtNode(host); };
export const mountLocalHarness = (host: HTMLElement, surface: 'annual' | 'integrated', asOf: string, snapshot?: string): void => {
  unmountLocalHarness(host);
  state = snapshot ? JSON.parse(snapshot) as ILocalBehaviourSnapshot : { items: initialLocalItems(), saves: 0 };
  adapterCalls = [];
  const date = new Date(`${asOf}T12:00:00Z`);
  const Annual: React.FC = () => {
    const [items, setItems] = React.useState(clone(state.items));
    const [message, setMessage] = React.useState('');
    return <div className={styles.performanceHub}><BehaviourWorkplanPage workplan={localWorkplan} behaviours={localDefinitions}
      library={localLibrary} items={items} saving={false} localUat behaviourLibraryAsOf={date} message={message}
      onSave={async next => { state = { items: clone(next), saves: state.saves + 1 }; setItems(clone(state.items)); setMessage('Synthetic snapshot saved'); }} /></div>;
  };
  ReactDOM.render(surface === 'annual' ? <Annual /> : <IntegratedPerformanceHub dataService={service}
    adminReportingDataService={adminService} currentUserEmail={employee.email} userDisplayName={employee.displayName} behaviourLibraryAsOf={date} />, host);
};
