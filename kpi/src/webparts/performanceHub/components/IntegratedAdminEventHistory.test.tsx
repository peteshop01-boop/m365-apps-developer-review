jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import IntegratedPerformanceHub, { AdminView, type IIntegratedData, type IIntegratedPerformanceHubProps } from './IntegratedPerformanceHub';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import type { IProductionOverview, IProductionPerson } from '../models/ProductionModels';
import * as historyDomain from '../services/AdminEventHistoryDomain';
import type { IAdminEventHistoryView } from '../services/AdminEventHistoryDomain';

const baseData: IIntegratedData = {
  kpis: [], people: [], directReports: [], teams: [], configs: [], objectives: [],
  annualReviews: [], quarterReviews: [], quarterLifecycles: [], warnings: []
};

describe('integrated controlled Admin history', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.restoreAllMocks(); });
  const render = (data: IIntegratedData): void => {
    act(() => { ReactDOM.render(<AdminView tab="History & Audit" data={data} />, host); });
  };

  const admin: IProductionPerson = { id: 1, personKey: 'SYN-ADMIN', email: 'admin@example.invalid',
    displayName: 'Synthetic Admin', active: true, appRoles: ['SystemAdmin'] };
  const overview = (employee: IProductionPerson | undefined, year = 2026): IProductionOverview => ({
    employee, config: { performanceYearNumber: year }, workplanStatus: 'Not started', readiness: { ready: true, blockers: [] }
  } as unknown as IProductionOverview);
  const history = (key: string, year = 2026): IAdminEventHistoryView => {
    const event = { id: 1, auditKey: key, eventType: 'WorkplanApproved', subjectKey: key, performanceYear: year,
      actorEmail: admin.email, actorRole: 'SystemAdmin', eventAt: '2026-09-30T10:00:00.000Z',
      correlationKey: 'SYN-CORR', source: 'SPFx', success: true };
    return { mode: 'ReadOnly', allEvents: [event], filteredEvents: [event],
      filterOptions: { actors: [admin.email], states: [], statuses: [], performanceYears: [year], quarters: [] } } as unknown as IAdminEventHistoryView;
  };
  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((_resolve, _reject) => { resolve = _resolve; reject = _reject; });
    return { promise, resolve, reject };
  }
  function props(): IIntegratedPerformanceHubProps {
    return { currentUserEmail: admin.email, userDisplayName: 'Synthetic user',
      dataService: { getAuthoritativeAdminEventHistoryView: jest.fn(async () => history('SYN-OLD')),
        getAdminPeople: async () => [], getAdminTeams: async () => [], getAdminConfigRecords: async () => [],
        getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
        getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
        getQuarterTimingConfig: async () => { throw new Error('Synthetic timing unavailable'); } } as unknown as IIntegratedPerformanceHubProps['dataService'],
      adminReportingDataService: { getAdminReportingControlSnapshot: async () => { throw new Error('Synthetic reporting unavailable'); } } as unknown as IIntegratedPerformanceHubProps['adminReportingDataService'] };
  }
  const drawHub = (value: IIntegratedPerformanceHubProps): void => { ReactDOM.render(<IntegratedPerformanceHub {...value} />, host); };
  async function readyHub(value: IIntegratedPerformanceHubProps): Promise<void> {
    (loadProductionOverview as jest.Mock).mockReset().mockResolvedValue(overview(admin));
    jest.spyOn(historyDomain, 'filterAuthorisedAdminEventHistoryView').mockImplementation(view => view);
    await act(async () => { drawHub(value); });
    act(() => {
      const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === 'History & Audit');
      expect(button).toBeDefined(); button!.click();
    });
    expect(host.textContent).toContain('SYN-OLD');
  }

  it.each(['KPIAdmin', 'Employee', 'inactive', 'missing'])
  ('immediately hides old history during %s actor refresh and after denial', async role => {
    const initial = props(); await readyHub(initial);
    const next = deferred<IProductionOverview>();
    (loadProductionOverview as jest.Mock).mockReturnValueOnce(next.promise);
    act(() => {
      ReactDOM.flushSync(() => { drawHub({ ...initial, currentUserEmail: 'changed@example.invalid' }); });
      expect(host.textContent).not.toContain('SYN-OLD');
    });
    expect(host.textContent).not.toContain('SYN-OLD');
    const employee = role === 'missing' ? undefined : { ...admin, email: 'changed@example.invalid',
      active: role !== 'inactive', appRoles: role === 'inactive' ? ['SystemAdmin'] : [role] };
    await act(async () => { next.resolve(overview(employee)); });
    expect(host.textContent).not.toContain('SYN-OLD');
    expect(initial.dataService.getAuthoritativeAdminEventHistoryView).toHaveBeenCalledTimes(1);
  });

  it.each(['actor', 'service', 'year'])('binds ready history to the current %s generation during pending and failed reads', async change => {
    const initial = props(); await readyHub(initial);
    const pending = deferred<IAdminEventHistoryView>();
    const service = { ...initial.dataService, getAuthoritativeAdminEventHistoryView: jest.fn(() => pending.promise) };
    const next = { ...initial, dataService: service,
      currentUserEmail: change === 'actor' ? 'next-admin@example.invalid' : initial.currentUserEmail };
    (loadProductionOverview as jest.Mock).mockResolvedValue(overview({ ...admin, email: next.currentUserEmail }, change === 'year' ? 2027 : 2026));
    await act(async () => { drawHub(next); });
    expect(host.textContent).not.toContain('SYN-OLD');
    expect(service.getAuthoritativeAdminEventHistoryView).toHaveBeenCalledWith(change === 'year' ? 2027 : 2026);
    await act(async () => { pending.reject(new Error('Synthetic protected read failure')); });
    expect(host.textContent).not.toContain('SYN-OLD');
    expect(host.textContent).toContain('Controlled Audit history could not be loaded');
  });

  it('clears old history on an unexpected outer refresh failure', async () => {
    const initial = props(); await readyHub(initial);
    const broken = { ...initial.dataService, getAdminPeople: (): never => { throw new Error('Synthetic outer failure'); } };
    await act(async () => { drawHub({ ...initial, dataService: broken }); });
    expect(host.textContent).not.toContain('SYN-OLD');
  });

  it('discards a superseded deferred result after the newest actor history resolves', async () => {
    const initial = props(); await readyHub(initial);
    const old = deferred<IProductionOverview>(); const newest = deferred<IProductionOverview>();
    (loadProductionOverview as jest.Mock).mockReturnValueOnce(old.promise).mockReturnValueOnce(newest.promise);
    await act(async () => { drawHub({ ...initial, currentUserEmail: 'older@example.invalid' }); });
    await act(async () => { drawHub({ ...initial, currentUserEmail: 'newest@example.invalid' }); });
    expect(host.textContent).not.toContain('SYN-OLD');
    (initial.dataService.getAuthoritativeAdminEventHistoryView as jest.Mock).mockResolvedValue(history('SYN-NEWEST', 2027));
    await act(async () => { newest.resolve(overview({ ...admin, email: 'newest@example.invalid' }, 2027)); });
    expect(host.textContent).toContain('SYN-NEWEST');
    await act(async () => { old.resolve(overview({ ...admin, email: 'older@example.invalid' })); });
    expect(host.textContent).toContain('SYN-NEWEST');
    expect(host.textContent).not.toContain('SYN-OLD');
    expect(initial.dataService.getAuthoritativeAdminEventHistoryView).toHaveBeenCalledTimes(2);
  });

  it('shows denial and read failure explicitly without claiming an empty controlled history', () => {
    render({ ...baseData, adminEventHistory: { status: 'denied' } });
    expect(host.textContent).toContain('requires an active SystemAdmin People identity');
    expect(host.textContent).not.toContain('No controlled events match');
    render({ ...baseData, adminEventHistory: { status: 'unavailable' } });
    expect(host.textContent).toContain('Controlled Audit history could not be loaded');
    expect(host.textContent).not.toContain('No controlled events match');
  });

  it('keeps controlled forensic and reporting-control event sources distinct', () => {
    const event = {
      id: 1, auditKey: 'SYN-FORENSIC', eventType: 'WorkplanApproved', subjectKey: 'SYN-WORKPLAN',
      performanceYear: 2026, actorEmail: 'synthetic@example.invalid', actorRole: 'SystemAdmin',
      eventAt: '2026-09-30T10:00:00.000Z', correlationKey: 'SYN-CORR', source: 'SPFx',
      success: true
    };
    const view = {
      mode: 'ReadOnly', allEvents: [event], filteredEvents: [event],
      filterOptions: { actors: [event.actorEmail], states: [], statuses: [], performanceYears: [2026], quarters: [] }
    } as unknown as IAdminEventHistoryView;
    jest.spyOn(historyDomain, 'filterAuthorisedAdminEventHistoryView').mockReturnValue(view);
    render({ ...baseData, adminEventHistory: { status: 'ready', view }, reporting: {
      auditEvents: [{ auditKey: 'SYN-REPORTING', eventAt: '2026-09-30T11:00:00.000Z',
        eventType: 'ReportingMapChanged', entityType: 'ReportingMap', actor: 'reporter@example.invalid' }]
    } as unknown as IIntegratedData['reporting'] });
    expect(host.textContent).toContain('Controlled forensic history');
    expect(host.textContent).toContain('SYN-WORKPLAN');
    expect(host.textContent).toContain('Reporting-control events');
    expect(host.textContent).toContain('reporter@example.invalid');
    expect(host.textContent).toContain('1 of 1 controlled events shown');
  });
});
