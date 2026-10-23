jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import type { IProductionPerson } from '../models/ProductionModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IOptionEDraftGateway } from '../services/OptionEDraftSharePointGateway';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';

const employee: IProductionPerson = { id: 1, personKey: 'PERSON-001', displayName: 'Synthetic Employee',
  email: 'employee@example.invalid', managerPersonKey: 'MANAGER-001', managerEmail: 'manager@example.invalid',
  appRoles: ['Employee'], active: true };
const manager: IProductionPerson = { id: 2, personKey: 'MANAGER-001', displayName: 'Synthetic Manager',
  email: 'manager@example.invalid', appRoles: ['Manager'], active: true };
const unavailable = 'Start My Workplan is unavailable until the private employee Draft store and protected Workplan binding are verified.';

describe('annual Start physical admission remains closed', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: 'Not started',
      config: { performanceYearNumber: 2027, performanceYear: '2027', weights: { core: 70, personal: 20, behaviours: 10 } },
      readiness: { ready: true, blockers: [] } });
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks();
  });
  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
    if (!found) throw new Error(`Missing button ${label}`);
    return found;
  };

  it.each(['read failed', 'content absent'] as const)(
    'shows an existing Submitted Workplan as unavailable when %s without claiming it was never started', async mode => {
      (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: 'Submitted',
        config: { performanceYearNumber: 2027, performanceYear: '2027' } });
      const read = mode === 'read failed' ? jest.fn().mockRejectedValue(new Error('Missing physical item fields'))
        : jest.fn().mockResolvedValue(undefined);
      const create = jest.fn(), save = jest.fn();
      const service = { getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
        getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
        getQuarterTimingConfig: async () => { throw new Error('No quarter required.'); },
        getEmployeeWorkplanV2: read, createEmployeeWorkplanDraftV2: create,
        saveEmployeeWorkplanDraftV2: save } as unknown as IProductionDataService;
      await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service}
        adminReportingDataService={{} as IAdminReportingControlDataService}
        currentUserEmail={employee.email} userDisplayName={employee.displayName} nativeWritesHeld />, host); });
      act(() => { button('Build My Workplan').click(); });
      expect(read).toHaveBeenCalledWith(employee, 2027);
      expect(host.textContent).toContain('Your existing Workplan could not be loaded.');
      expect(host.textContent).toContain('Submitted');
      expect(host.textContent).not.toContain('No Workplan has been started');
      expect(host.textContent).not.toContain('No protected Workplan Draft has been created');
      expect(Array.from(host.querySelectorAll('button')).filter(item => item.textContent === 'Start My Workplan')).toHaveLength(0);
      const editor = host.querySelector('fieldset[aria-label="Workplan editable fields"]') as HTMLFieldSetElement;
      expect(editor.disabled).toBe(true); expect(create).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
      act(() => { ReactDOM.unmountComponentAtNode(host); });
    }
  );

  it('does not claim a plan is absent when the header status is unknown', async () => {
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: '',
      config: { performanceYearNumber: 2027, performanceYear: '2027' } });
    const service = { getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getQuarterTimingConfig: async () => { throw new Error('No quarter required.'); } } as unknown as IProductionDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service}
      adminReportingDataService={{} as IAdminReportingControlDataService}
      currentUserEmail={employee.email} userDisplayName={employee.displayName} />, host); });
    expect(host.querySelector('[class*="metricGrid"] article strong')?.textContent).toBe('Status unavailable');
    act(() => { button('Build My Workplan').click(); });
    expect(host.textContent).toContain('Your Workplan status could not be confirmed.');
    expect(host.textContent).not.toContain('No Workplan has been started');
    expect(host.textContent).not.toContain('No protected Workplan Draft has been created');
    expect(Array.from(host.querySelectorAll('button')).filter(item => item.textContent === 'Start My Workplan')).toHaveLength(0);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
  });

  it('shows genuinely absent status without enabling unbound Start or Save', async () => {
    const service = { getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getQuarterTimingConfig: async () => { throw new Error('No quarter required.'); } } as unknown as IProductionDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service}
      adminReportingDataService={{} as IAdminReportingControlDataService}
      currentUserEmail={employee.email} userDisplayName={employee.displayName} />, host); });
    act(() => { button('Build My Workplan').click(); });
    expect(host.textContent).toContain('No Workplan has been started for this performance year.');
    expect(button('Start My Workplan').disabled).toBe(true);
    const editor = host.querySelector('fieldset[aria-label="Workplan editable fields"]') as HTMLFieldSetElement;
    expect(editor.disabled).toBe(true);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
  });

  it('retains a loaded Submitted header without claiming that its unavailable private Draft means no Workplan', async () => {
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: 'Submitted',
      config: { performanceYearNumber: 2027, performanceYear: '2027' } });
    const readback = { workplan: { id: 1, etag: '"3"', workplanKey: 'PERSON-001|2027', personKey: employee.personKey,
      employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2027,
      state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready', rowVersionToken: 3,
      coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 },
      coreItems: [], personalItems: [], behaviourItems: [], audits: [] };
    const read = jest.fn().mockResolvedValue(readback);
    const service = { getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getQuarterTimingConfig: async () => { throw new Error('No quarter required.'); },
      getEmployeeWorkplanV2: read } as unknown as IProductionDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service}
      adminReportingDataService={{} as IAdminReportingControlDataService}
      currentUserEmail={employee.email} userDisplayName={employee.displayName} nativeWritesHeld />, host); });
    act(() => { button('Build My Workplan').click(); });
    expect(read).toHaveBeenCalledWith(employee, 2027);
    expect(host.textContent).not.toContain('No Workplan has been started');
    expect(host.textContent).not.toContain('Your existing Workplan could not be loaded');
    expect(Array.from(host.querySelectorAll('button')).filter(item => item.textContent === 'Start My Workplan')).toHaveLength(0);
    const editor = host.querySelector('fieldset[aria-label="Workplan editable fields"]') as HTMLFieldSetElement;
    expect(editor.disabled).toBe(true); expect(readback.workplan.state).toBe('Submitted');
    act(() => { ReactDOM.unmountComponentAtNode(host); });
  });

  it.each([
    ['absent', undefined],
    ['empty gateway object', {} as IOptionEDraftGateway],
    ['partial', { read: jest.fn() } as unknown as IOptionEDraftGateway],
    ['complete-shaped but unverified gateway', {
      prepare: jest.fn(), read: jest.fn(), updateExact: jest.fn()
    } as IOptionEDraftGateway]
  ])('disables both Start locations with %s binding despite readiness', async (_name, gateway) => {
    const create = jest.fn(), fallback = jest.fn(), save = jest.fn();
    const service = { getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getQuarterTimingConfig: async () => { throw new Error('No quarter required.'); },
      createEmployeeWorkplanDraftV2: create, getOrCreateDraftWorkplan: fallback,
      saveEmployeeWorkplanDraftV2: save } as unknown as IProductionDataService;
    await act(async () => {
      ReactDOM.render(<IntegratedPerformanceHub dataService={service}
        adminReportingDataService={{} as IAdminReportingControlDataService}
        currentUserEmail={employee.email} userDisplayName={employee.displayName}
        optionEDraftGateway={gateway} />, host);
    });
    const homeStart = button('Start My Workplan');
    expect(homeStart.disabled).toBe(true);
    expect(host.textContent).toContain(unavailable);
    act(() => { Simulate.click(homeStart); });
    expect(create).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();

    act(() => { button('Build My Workplan').click(); });
    const buildStart = button('Start My Workplan');
    expect(buildStart.disabled).toBe(true);
    expect(host.textContent).toContain(unavailable);
    act(() => { Simulate.click(buildStart); });
    act(() => { button('Review & Weight').click(); });
    expect(button('Save Draft').disabled).toBe(true);
    expect(button('Submit Workplan').disabled).toBe(true);
    expect(create).not.toHaveBeenCalled();
    expect(fallback).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
