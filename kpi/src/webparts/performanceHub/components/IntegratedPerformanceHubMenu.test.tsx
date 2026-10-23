jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';

describe('PM50 narrow navigation focus repair', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    (loadProductionOverview as jest.Mock).mockResolvedValue({
      employee: { id: -1, personKey: 'synthetic', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
        active: true, appRoles: ['Employee'] }, workplanStatus: 'NotStarted', readiness: { ready: false, blockers: [] }
    });
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks();
  });
  const mount = async (): Promise<void> => {
    const dataService = { getBehaviourObjectiveLibrary: async () => [], getCoreKpiCatalogue: async () => [],
      getPublishedBehaviours: async () => [], getEmployeeWorkplanV2: async () => undefined } as unknown as IProductionDataService;
    const adminReportingDataService = { getAdminReportingControlSnapshot: async () => { throw new Error('Unavailable'); } } as IAdminReportingControlDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={dataService}
      adminReportingDataService={adminReportingDataService} currentUserEmail="employee@example.invalid"
      userDisplayName="Synthetic Employee" />, host); });
  };
  it('opens, closes with Escape and returns focus to the menu button', async () => {
    await mount();
    const menu = host.querySelector<HTMLButtonElement>('button[aria-label="Open navigation"]')!;
    const employee = Array.from(host.querySelectorAll<HTMLButtonElement>('aside button')).find(button => button.textContent === 'Employee')!;
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(employee).toBeTruthy();
    expect(host.textContent).not.toContain('Reporting Readiness');
    act(() => { menu.click(); });
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    employee.focus();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
    act(() => { menu.click(); employee.click(); });
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
  });
});
