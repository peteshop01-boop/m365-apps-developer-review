/* eslint-disable @rushstack/pair-react-dom-render-unmount -- each mounted case is unmounted in afterEach */
jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { IAnnualWorkplan, IProductionPerson } from '../models/ProductionModels';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IProductionDataService } from '../services/IProductionDataService';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import IntegratedPerformanceHub, {
  ReviewWeights,
  type IBehaviourChoice,
  type ICoreChoice,
  type IPersonalChoice
} from './IntegratedPerformanceHub';

const employee: IProductionPerson = {
  id: 1, personKey: 'PERSON-001', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
  managerPersonKey: 'MANAGER-001', managerEmail: 'manager@example.invalid', appRoles: ['Employee'], active: true
};
const manager: IProductionPerson = {
  id: 2, personKey: 'MANAGER-001', displayName: 'Synthetic Manager', email: 'manager@example.invalid',
  appRoles: ['Manager'], active: true
};
const workplan: IAnnualWorkplan = {
  id: 1, etag: '"header-5"', workplanKey: 'PERSON-001|2027', personKey: employee.personKey,
  employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2027,
  managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 5,
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10
};
const core: ICoreChoice[] = [{ kpiId: 'KPI-001', role: 'Delivery', weight: 100 }];
const personal: IPersonalChoice[] = [{
  key: 'PERSONAL-001', wording: 'Synthetic IMPACT', measure: 'Number / Quantity', unit: '%', annual: '100',
  q1: '25', q2: '50', q3: '75', q4: '100', success: 'Deliver the outcome', weight: 100
}];
const behaviours: IBehaviourChoice[] = Array.from({ length: 5 }, (_, index) => ({
  behaviourId: `BHV-0${index + 1}`, selectedSuggestionKeys: [], commitment: `Synthetic commitment ${index + 1}`,
  customObjective: `Synthetic commitment ${index + 1}`, targetRating: 3, weight: 20,
  q1: 'Q1 commitment', q2: 'Q2 commitment', q3: 'Q3 commitment', q4: 'Q4 commitment',
  h1: '', h2: ''
}));

describe('A016 rendered manager/section presentation and BoardReadOnly entry', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks();
  });

  const renderReview = (assignedManager: IProductionPerson): void => {
    act(() => { ReactDOM.render(<ReviewWeights core={core} personal={personal} behaviours={behaviours}
      onCore={jest.fn()} onPersonal={jest.fn()} onBehaviours={jest.fn()} workplan={workplan}
      assignedManager={assignedManager} saving={false} message="" onSave={async () => undefined}
      onSubmit={async () => undefined} />, host); });
  };

  it('renders each section independently and enables submit only with the exact assigned manager identity', () => {
    renderReview(manager);
    const presentation = host.querySelector('[aria-label="Workplan section completion and assigned manager"]');
    expect(presentation?.textContent).toContain('Core section · 1 selected');
    expect(presentation?.textContent).toContain('IMPACT section · 1 configured');
    expect(presentation?.textContent).toContain('Behaviour section · 5 configured');
    expect(presentation?.textContent).toContain('VerifiedAssigned manager · Synthetic Manager');
    expect(Array.from(presentation?.querySelectorAll('strong') || []).map(item => item.textContent))
      .toEqual(['Complete', 'Complete', 'Complete', 'Verified']);
    const submit = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Submit Workplan');
    expect(submit?.disabled).toBe(false);
  });

  it('renders an honest manager mismatch and keeps submit disabled', () => {
    renderReview({ ...manager, email: 'other@example.invalid' });
    expect(host.textContent).toContain('Not verifiedAssigned manager · Synthetic Manager');
    expect(host.textContent).toContain('The assigned manager PersonKey and email must match one active controlled Manager record.');
    const submit = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Submit Workplan');
    expect(submit?.disabled).toBe(true);
  });

  it('renders BoardReadOnly reporting entry without Manager or Admin mutation entry', async () => {
    const board = { ...employee, appRoles: ['BoardReadOnly'] };
    (loadProductionOverview as jest.Mock).mockResolvedValue({
      employee: board, workplanStatus: 'Not started', readiness: { ready: false, blockers: ['Reporting-only role'] }
    });
    const getDirectReports = jest.fn(async () => []);
    const getBehaviourObjectiveLibrary = jest.fn(async () => []);
    const dataService = {
      getDirectReports, getBehaviourObjectiveLibrary,
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => []
    } as unknown as IProductionDataService;
    const adminReportingDataService = {
      getAdminReportingControlSnapshot: async () => undefined
    } as unknown as IAdminReportingControlDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={dataService}
      adminReportingDataService={adminReportingDataService} currentUserEmail={board.email}
      userDisplayName={board.displayName} />, host); });
    const buttons = Array.from(host.querySelectorAll('button')).map(button => button.textContent?.trim());
    expect(buttons).toContain('Reporting Readiness');
    expect(buttons).not.toContain('Employee');
    expect(buttons).not.toContain('Build My Workplan');
    expect(buttons).not.toContain('My Workplan');
    expect(buttons).not.toContain('Start My Workplan');
    expect(buttons).not.toContain('View My Workplan');
    expect(buttons).not.toContain('My Team');
    expect(buttons).not.toContain('Data Quality');
    expect(host.querySelector('main h2')?.textContent).toBe('Reporting Readiness');
    expect(host.querySelector('[aria-label="Employee Workplan journey"]')).toBeNull();
    expect(getDirectReports).not.toHaveBeenCalled();
    expect(getBehaviourObjectiveLibrary).not.toHaveBeenCalled();
  });
});
