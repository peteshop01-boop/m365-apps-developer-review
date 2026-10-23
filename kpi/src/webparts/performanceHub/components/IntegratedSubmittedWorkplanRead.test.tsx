jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { IAnnualWorkplan, IProductionPerson, WorkplanState } from '../models/ProductionModels';
import type { IEmployeeWorkplanReadbackV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IOptionEDraftGateway } from '../services/OptionEDraftSharePointGateway';
import type { IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';

// Declared source-only roles/readback, no M365/session/ACL claim or network transport.
const employee: IProductionPerson = { id: 1, personKey: 'FICTION-EMPLOYEE', displayName: 'Fictional Employee',
  email: 'employee@kcf-test.invalid', active: true, appRoles: ['Employee'], managerPersonKey: 'FICTION-MANAGER',
  managerEmail: 'manager@kcf-test.invalid', behaviourFrameworkVersionV2: 'KCCC-BEHAVIOUR|v02',
  behaviourRoleTierV2: 'IC_OFFICER', behaviourCadenceV2: 'Quarterly' };
const manager: IProductionPerson = { id: 2, personKey: 'FICTION-MANAGER', displayName: 'Fictional Manager',
  email: 'manager@kcf-test.invalid', active: true, appRoles: ['Employee','Manager'] };
const readback = (state: WorkplanState, accessState: IAnnualWorkplan['accessState'] = 'ManagerDecision',
  transitionStatus: IAnnualWorkplan['transitionStatus'] = 'Ready'): IEmployeeWorkplanReadbackV2 => ({
  workplan: { id: 9, etag: '"control-3"', workplanKey: 'FICTION-EMPLOYEE|2026', personKey: employee.personKey,
    employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
    managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
    state, accessState, transitionStatus, coreCategoryWeight: 70, personalCategoryWeight: 30, behaviourCategoryWeight: 0,
    coreWeightingMode: 'Custom', workplanVersion: 3, rowVersionToken: 3 },
  coreItems: [], behaviourItems: [], audits: [], personalItems: [{ id: 21, etag: '"item-2"', workplanItemKey: 'IMPACT-EXACT',
    naturalKey: 'FICTION-EMPLOYEE|2026|IMPACT-EXACT', workplanKey: 'FICTION-EMPLOYEE|2026', personKey: employee.personKey,
    performanceYear: 2026, wording: 'Exact submitted outcome', description: 'Retained submitted evidence', measure: 'Exact success criterion',
    measureType: 'Number', scoringDirection: 'HigherIsBetter', unitLabel: 'items', yearEndTargetValue: 0, q1TargetValue: 0,
    q2TargetValue: 2, q3TargetValue: 3, q4TargetValue: 4, personalItemWeight: 100, displayOrder: 1, activeInWorkplan: true }]
});

describe('annual employee read-only entry from the actual loaded state', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); jest.clearAllMocks(); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
    if (!found) throw Error('Missing visible button ' + label); return found;
  };
  const mount = async (body: IEmployeeWorkplanReadbackV2 | undefined, state: WorkplanState,
    privateVersion?: 'v1' | 'v3', failRead = false): Promise<{ read: jest.Mock; mutate: jest.Mock }> => {
    const read = jest.fn(async () => { throw Error('Private Draft is not a Submitted read source'); }), mutate = jest.fn();
    const service = { getBehaviourObjectiveLibrary: async () => [], getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getQuarterTimingConfig: async () => { throw Error('Quarter outside declared annual fixture'); },
      getEmployeeWorkplanV2: async () => { if (failRead) throw Error('Declared Submitted read unavailable'); return body; },
      upsertCoreContributionV2: mutate, upsertPersonalItemV2: mutate, upsertBehaviourCommitmentV2: mutate,
      saveEmployeeWorkplanDraftV2: mutate, submitEmployeeWorkplanV2: mutate, createEmployeeWorkplanDraftV2: mutate
    } as unknown as IProductionDataService;
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: state,
      config: { performanceYearNumber: 2026 }, readiness: { ready: true, blockers: [] } });
    const common = { dataService: service, adminReportingDataService: {} as IAdminReportingControlDataService,
      currentUserEmail: employee.email, userDisplayName: employee.displayName };
    const gateway = { read, prepare: mutate, updateExact: mutate };
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub {...common}
      optionEDraftGateway={privateVersion === 'v1' ? gateway as IOptionEDraftGateway : undefined}
      optionEPrivateDraftV3Gateway={privateVersion === 'v3' ? gateway as IOptionEDraftGateway<IOptionEWorkplanDraftV3Aggregate> : undefined} />, host); });
    for (let i = 0; i < 12; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    act(() => button('Build My Workplan').click());
    return { read, mutate };
  };
  it.each(['Submitted','Approved','Locked','Archived'] as const)('shows %s summaries and disables every employee edit/Save/Submit without a private gateway', async state => {
    const ports = await mount(readback(state), state); act(() => button('IMPACT KPIs').click());
    expect(host.textContent).toContain('Exact submitted outcome'); expect(host.textContent).toContain('Exact success criterion');
    expect(host.textContent).toContain('Annual 0'); expect(host.textContent).toContain('Retained submitted evidence');
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(true);
    act(() => button('Review & Weight').click()); expect(button('Save Draft').disabled).toBe(true); expect(button('Submit Workplan').disabled).toBe(true);
    expect(ports.mutate).not.toHaveBeenCalled();
  });
  it.each(['v1','v3'] as const)('does not open the %s private Draft or show a private-Draft failure for a loaded Submitted plan', async version => {
    const ports = await mount(readback('Submitted'), 'Submitted', version);
    expect(ports.read).not.toHaveBeenCalled(); expect(host.textContent).not.toContain('private aggregate Draft could not be loaded');
    act(() => button('IMPACT KPIs').click()); expect(host.textContent).toContain('Exact submitted outcome');
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(true);
  });
  it.each(['Draft','ChangesRequested'] as const)('retains the existing %s/EmployeeEdit/Ready source route', async state => {
    await mount(readback(state, 'EmployeeEdit'), state);
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(false);
    act(() => button('Review & Weight').click()); expect(button('Save Draft').disabled).toBe(false);
  });
  it.each([
    ['ManagerDecision','Ready'], ['EmployeeEdit','Pending']
  ] as const)('holds Draft editing when access/transition is %s/%s', async (access, transition) => {
    await mount(readback('Draft', access, transition), 'Draft');
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(true);
    act(() => button('Review & Weight').click()); expect(button('Save Draft').disabled).toBe(true);
  });
  it.each([false,true])('keeps unavailable Submitted content truthful and makes no private/create/write request, readFails=%s', async failRead => {
    const ports = await mount(undefined, 'Submitted', 'v3', failRead);
    expect(host.textContent).toContain('Your existing Workplan could not be loaded'); expect(host.textContent).not.toContain('No Workplan has been started');
    expect(ports.read).not.toHaveBeenCalled(); expect(ports.mutate).not.toHaveBeenCalled();
  });
});
