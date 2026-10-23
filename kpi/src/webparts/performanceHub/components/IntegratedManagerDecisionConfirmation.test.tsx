/* eslint-disable @rushstack/pair-react-dom-render-unmount -- every mounted root is unmounted in afterEach or before reopening */
jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
jest.mock('../services/QuarterLifecycle', () => ({ buildQuarterLifecycle: jest.fn(), getCurrentQuarter: jest.fn() }));
jest.mock('./ManagerExperiencePage', () => ({ __esModule: true, default: jest.fn(() => null) }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { webcrypto } from 'node:crypto';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';
import ManagerExperiencePage, { type IManagerExperiencePageProps } from './ManagerExperiencePage';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { buildQuarterLifecycle } from '../services/QuarterLifecycle';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IAnnualWorkplan, IManagerWorkplanReviewContext, IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import type { IManagerQuarterReviewContext, IQuarterLifecycle, IQuarterReviewItem } from '../models/QuarterlyModels';

const manager: IProductionPerson = { id: 2, personKey: 'fictional-manager', displayName: 'Fictional Manager',
  email: 'manager@example.invalid', active: true, appRoles: ['Manager'] };
const employee: IProductionPerson = { id: 1, personKey: 'fictional-employee', displayName: 'Fictional Employee',
  email: 'employee@example.invalid', active: true, appRoles: ['Employee'], managerPersonKey: manager.personKey, managerEmail: manager.email };
const otherEmployee: IProductionPerson = { ...employee, id: 3, personKey: 'fictional-other', displayName: 'Fictional Other', email: 'other@example.invalid' };
const config: IProductionConfig = { performanceYear: '2026', performanceYearNumber: 2026,
  performanceYearStart: '2026-01-01', performanceYearEnd: '2026-12-31',
  quarters: { q1: 'Jan-Mar', q2: 'Apr-Jun', q3: 'Jul-Sep', q4: 'Oct-Dec' },
  weights: { core: 70, personal: 20, behaviours: 10 }, rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: [], retentionStatus: 'Fictional' };
const lifecycle: IQuarterLifecycle = { quarterKey: 'Q1', quarterName: 'Q1', performanceYear: '2026', performanceYearNumber: 2026,
  quarterStart: '2026-01-01', quarterEnd: '2026-03-31', isCurrentQuarter: true, isOpenForProgressUpdates: false,
  employeeSubmissionDeadline: '2026-04-07', managerReviewDeadline: '2026-04-14',
  reminderMilestones: { earlyReview: '2026-03-01', preparation: '2026-03-15', final: '2026-03-24' }, status: 'AwaitingManagerReview' };
const annual = (person: IProductionPerson): IManagerWorkplanReviewContext => {
  const workplan: IAnnualWorkplan = { id: person.id, etag: '"7"', workplanKey: `${person.personKey}|2026`, personKey: person.personKey,
    employeeDisplayName: person.displayName, employeeEmail: person.email, performanceYear: 2026,
    managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
    state: 'Submitted', accessState: 'ReadOnly', transitionStatus: 'Ready', rowVersionToken: 7,
    coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 };
  return { workplan, employee: person, manager, coreCatalogue: [], coreItems: [], personalItems: [], behaviours: [], behaviourItems: [],
    readiness: { ready: true, core: 'complete', personal: 'complete', behaviours: 'complete', blockers: [] }, auditEvents: [] };
};
const quarter = (person: IProductionPerson): IManagerQuarterReviewContext => {
  const key = `${person.personKey}|2026|Q1`;
  const item: IQuarterReviewItem = { id: person.id, etag: '"7"', quarterReviewItemKey: `${key}|item`, quarterReviewKey: key,
    workplanItemKey: `${person.personKey}|item`, workplanKey: `${person.personKey}|2026`, personKey: person.personKey,
    performanceYear: 2026, quarter: 'Q1', itemType: 'CoreGold', wording: 'Fictional review item', calculatedRag: 'Amber', evidenceCount: 0,
    managerApproved: false, locked: false };
  return { lifecycle, employee: person, manager, items: [item], evidence: [], messages: [], dataFoundationReady: true,
    readiness: { ready: true, blockers: [], warnings: [], coreComplete: 1, personalComplete: 0, behavioursComplete: 0 },
    review: { id: person.id, etag: '"7"', quarterReviewKey: key, workplanKey: `${person.personKey}|2026`, personKey: person.personKey,
      employeeDisplayName: person.displayName, employeeEmail: person.email, performanceYear: 2026, quarter: 'Q1',
      managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
      state: 'Submitted', accessState: 'ReadOnly', transitionStatus: 'Ready', rowVersionToken: 7 } };
};
const operations = ['annualChanges', 'annualApprove', 'quarterChanges', 'quarterApprove', 'override', 'assessment'] as const;
type Operation = typeof operations[number];
const methods: Record<Operation, keyof IProductionDataService> = { annualChanges: 'requestEmployeeWorkplanChangesV2',
  annualApprove: 'approveAndLockEmployeeWorkplanV2', quarterChanges: 'requestQuarterReviewChanges',
  quarterApprove: 'approveAndLockQuarterReview', override: 'saveQuarterManagerOverride', assessment: 'saveQuarterBehaviourAssessment' };

describe('actual root manager decision confirmation after a fictional store commit', () => {
  let host: HTMLDivElement;
  let annualRows: IManagerWorkplanReviewContext[];
  let quarterRows: IManagerQuarterReviewContext[];
  let service: IProductionDataService;
  let write: jest.Mock;
  let failReload: boolean;
  const originalCrypto = globalThis.crypto;
  beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); });
  afterAll(() => { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto }); });
  const props = (): IManagerExperiencePageProps => {
    const calls = (ManagerExperiencePage as jest.Mock).mock.calls;
    if (!calls.length) throw new Error('Actual root Manager route not mounted');
    return calls[calls.length - 1][0] as IManagerExperiencePageProps;
  };
  const mount = async (held = false): Promise<void> => {
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service}
      adminReportingDataService={{} as IAdminReportingControlDataService} currentUserEmail={manager.email}
      userDisplayName={manager.displayName} nativeWritesHeld={held} />, host); });
    for (let i = 0; i < 20; i += 1) await act(async () => { await Promise.resolve(); });
    const button = Array.from(host.querySelectorAll('button')).find(row => row.textContent === 'My Team');
    if (!button) throw new Error('Actual manager navigation unavailable');
    act(() => { button.click(); });
    expect(props().nativeWritesHeld).toBe(held);
  };
  const invoke = async (operation: Operation): Promise<void> => {
    const current = props(); const plan = current.annualContexts[0]; const review = current.quarterContexts[0];
    await act(async () => {
      if (operation === 'annualChanges') await current.onRequestChanges(plan, '  Fictional raw reason  ');
      else if (operation === 'annualApprove') await current.onApproveAndLock(plan);
      else if (operation === 'quarterChanges') await current.onRequestQuarterChanges(review, '  Fictional raw reason  ');
      else if (operation === 'quarterApprove') await current.onApproveAndLockQuarter(review);
      else if (operation === 'override') await current.onOverrideQuarterRag(review, review.items[0], 'Green', '  Fictional raw reason  ');
      else await current.onAssessQuarterBehaviour(review, review.items[0], 4);
    });
  };
  const install = (operation: Operation, failure?: 'response' | 'reload'): void => {
    if (operation === 'assessment') quarterRows[0] = { ...quarterRows[0],
      items: quarterRows[0].items.map(item => ({ ...item, itemType: 'Behaviour', behaviourId: 'fictional-behaviour' })) };
    write = jest.fn(async () => {
      if (operation === 'annualChanges' || operation === 'annualApprove') {
        const prior = annualRows[0];
        annualRows[0] = { ...prior, workplan: { ...prior.workplan, etag: '"8"', rowVersionToken: 8,
          state: operation === 'annualChanges' ? 'ChangesRequested' : 'Locked',
          accessState: operation === 'annualChanges' ? 'EmployeeEdit' : 'ReadOnly' } };
      } else {
        const prior = quarterRows[0];
        quarterRows[0] = { ...prior, review: { ...prior.review, etag: '"8"', rowVersionToken: 8,
          state: operation === 'quarterChanges' ? 'ChangesRequested' : operation === 'quarterApprove' ? 'Locked' : 'Submitted',
          accessState: operation === 'quarterChanges' ? 'EmployeeEdit' : 'ReadOnly' },
          items: prior.items.map(item => ({ ...item,
            ...(operation === 'override' ? { managerOverride: { rag: 'Green' as const, reason: '  Fictional raw reason  ', actorPersonKey: manager.personKey, actorEmail: manager.email } } : {}),
            ...(operation === 'assessment' ? { managerBehaviourRating: 4 as const } : {}) })) };
      }
      if (failure === 'response') throw new Error('Fictional store committed; response lost');
      failReload = failure === 'reload';
      return { duplicate: false };
    });
    Object.assign(service, { [methods[operation]]: write });
  };
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    annualRows = [annual(employee), annual(otherEmployee)]; quarterRows = [quarter(employee), quarter(otherEmployee)]; failReload = false;
    service = { getDirectReports: async () => [employee, otherEmployee], getQuarterTimingConfig: async () => ({}),
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getManagerReviewContexts: jest.fn(async () => { if (failReload) throw new Error('Fictional canonical reload denied'); return [...annualRows]; }),
      getManagerQuarterReviewContexts: jest.fn(async () => [...quarterRows]) } as unknown as IProductionDataService;
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: manager, config, workplanStatus: 'NotStarted' });
    (buildQuarterLifecycle as jest.Mock).mockReturnValue([lifecycle]);
  });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });

  describe.each(operations)('%s', operation => {
    it.each(['response', 'reload'] as const)('reports uncertainty after committed write and %s failure; fresh root reads canonical result without retry', async failure => {
      install(operation, failure); await mount();
      const otherPlan = props().annualContexts[1]; const otherQuarter = props().quarterContexts[1];
      await invoke(operation);
      expect(write).toHaveBeenCalledTimes(1);
      expect(props().saving).toBe(false);
      expect(props().message).toContain('could not be confirmed');
      expect(props().message).toContain('may have committed');
      expect(props().message).toContain(operation.indexOf('annual') === 0 ? "Reload this employee's Workplan before trying again" : "Reload this employee's Quarter Review before trying again");
      expect(props().message).not.toMatch(/not completed|not saved|No .* was changed/);
      const actorIndex = operation.indexOf('annual') === 0 ? 0 : operation === 'override' || operation === 'assessment' ? 2 : 1;
      expect(write.mock.calls[0][actorIndex]).toMatchObject(operation.indexOf('annual') === 0 ? { actor: manager } : manager);
      if (operation === 'annualChanges' || operation === 'quarterChanges') expect(write.mock.calls[0][operation === 'annualChanges' ? 1 : 2]).toBe('  Fictional raw reason  ');
      failReload = false;
      act(() => { ReactDOM.unmountComponentAtNode(host); }); await mount();
      const current = props();
      expect(current.annualContexts[1]).toEqual(otherPlan); expect(current.quarterContexts[1]).toEqual(otherQuarter);
      if (operation.indexOf('annual') === 0) {
        expect(current.annualContexts[0].workplan).toMatchObject({ personKey: employee.personKey, rowVersionToken: 8, etag: '"8"', state: operation === 'annualChanges' ? 'ChangesRequested' : 'Locked' });
      } else {
        expect(current.quarterContexts[0].review).toMatchObject({ personKey: employee.personKey, quarter: 'Q1', rowVersionToken: 8, etag: '"8"', state: operation === 'quarterChanges' ? 'ChangesRequested' : operation === 'quarterApprove' ? 'Locked' : 'Submitted' });
        if (operation === 'override') expect(current.quarterContexts[0].items[0].managerOverride).toMatchObject({ rag: 'Green', actorPersonKey: manager.personKey, reason: '  Fictional raw reason  ' });
        if (operation === 'assessment') expect(current.quarterContexts[0].items[0].managerBehaviourRating).toBe(4);
      }
      expect(current.message).toBe(''); expect(write).toHaveBeenCalledTimes(1);
      expect(service.getManagerReviewContexts).toHaveBeenLastCalledWith(manager);
    });
    it('preserves confirmed success and canonical reload', async () => {
      install(operation); await mount(); await invoke(operation);
      expect(props().message).toContain('confirmed'); expect(props().message).not.toContain('may have committed');
      expect(props().saving).toBe(false); expect(write).toHaveBeenCalledTimes(1);
      expect(operation.indexOf('annual') === 0 ? props().annualContexts[0].workplan.rowVersionToken : props().quarterContexts[0].review.rowVersionToken).toBe(8);
    });
    it('preserves nativeWritesHeld with zero dispatches', async () => {
      install(operation); await mount(true); await invoke(operation);
      expect(props().message).toBe('KCF TEST view-only: changes are held pending governed admission.');
      expect(write).not.toHaveBeenCalled(); expect(props().saving).toBe(false);
    });
  });
});
