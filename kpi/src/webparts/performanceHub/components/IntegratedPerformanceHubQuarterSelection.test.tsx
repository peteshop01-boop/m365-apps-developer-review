/* eslint-disable @rushstack/pair-react-dom-render-unmount -- host is unmounted in afterEach */
jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
jest.mock('../services/QuarterLifecycle', () => ({ buildQuarterLifecycle: jest.fn(), getCurrentQuarter: jest.fn() }));
jest.mock('./QuarterlyReviewPage', () => ({ __esModule: true, default: jest.fn(() => null) }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';
import QuarterlyReviewPage, { type IQuarterlyReviewPageProps } from './QuarterlyReviewPage';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { buildQuarterLifecycle, getCurrentQuarter } from '../services/QuarterLifecycle';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IAnnualWorkplan, IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import type { IQuarterReviewContext, IQuarterLifecycle, QuarterKey, IQuarterReviewItem, IProgressEntry } from '../models/QuarterlyModels';

const employee: IProductionPerson = { id: 1, personKey: 'employee', displayName: 'Synthetic Employee',
  email: 'employee@example.invalid', appRoles: ['Employee'], active: true };
const manager: IProductionPerson = { ...employee, id: 2, personKey: 'manager', email: 'manager@example.invalid' };
const workplan: IAnnualWorkplan = { id: 1, etag: '"1"', workplanKey: 'employee|2026', personKey: 'employee',
  employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
  managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
  state: 'Approved', accessState: 'ReadOnly', transitionStatus: 'Ready', rowVersionToken: 1,
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 };
const config: IProductionConfig = { performanceYear: '2026', performanceYearNumber: 2026,
  performanceYearStart: '2026-01-01', performanceYearEnd: '2026-12-31',
  quarters: { q1: 'Jan-Mar', q2: 'Apr-Jun', q3: 'Jul-Sep', q4: 'Oct-Dec' },
  weights: { core: 70, personal: 20, behaviours: 10 }, rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: [], retentionStatus: 'Synthetic' };
const lifecycle = (quarter: QuarterKey): IQuarterLifecycle => ({ quarterKey: quarter, quarterName: quarter,
  performanceYear: '2026', performanceYearNumber: 2026, quarterStart: '2026-01-01', quarterEnd: '2026-03-31',
  isCurrentQuarter: quarter === 'Q1', isOpenForProgressUpdates: false, employeeSubmissionDeadline: '2026-04-07',
  managerReviewDeadline: '2026-04-14', reminderMilestones: { earlyReview: '2026-03-01', preparation: '2026-03-15', final: '2026-03-24' }, status: 'Locked' });
const context = (quarter: QuarterKey, version?: number): IQuarterReviewContext => ({
  lifecycle: lifecycle(quarter), employee, manager, coreCatalogue: [], behaviours: [], items: [],
  progressLedgers: [], evidence: [], messages: [], dataFoundationReady: true,
  readiness: { ready: false, blockers: ['Synthetic read-only fixture'], warnings: [], coreComplete: 0, personalComplete: 0, behavioursComplete: 0 },
  review: version === undefined ? undefined : { id: 1, etag: '"1"', quarterReviewKey: `employee|2026|${quarter}`,
    workplanKey: workplan.workplanKey, personKey: employee.personKey, employeeDisplayName: employee.displayName,
    employeeEmail: employee.email, performanceYear: 2026, quarter,
    managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
    state: 'Locked', accessState: 'ReadOnly', transitionStatus: 'Ready', rowVersionToken: version }
});
const deferred = <T,>(): { promise: Promise<T>; resolve(value: T): void; reject(error: Error): void } => {
  let resolvePromise!: (value: T) => void; let rejectPromise!: (error: Error) => void;
  const promise = new Promise<T>((resolve, reject) => { resolvePromise = resolve; rejectPromise = reject; });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
};

describe('actual integrated My Workplan quarter selection', () => {
  let host: HTMLDivElement;
  let readContext: jest.Mock; let readCanonical: jest.Mock; let service: IProductionDataService;
  const admin = {} as IAdminReportingControlDataService;
  const props = (): IQuarterlyReviewPageProps => {
    const calls = (QuarterlyReviewPage as jest.Mock).mock.calls;
    if (!calls.length) throw new Error('My Workplan quarterly route was not mounted');
    return calls[calls.length - 1][0] as IQuarterlyReviewPageProps;
  };
  const render = async (adapter = service, email = employee.email, nativeWritesHeld = true): Promise<void> => {
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={adapter}
      adminReportingDataService={admin} currentUserEmail={email} userDisplayName={employee.displayName}
      nativeWritesHeld={nativeWritesHeld} />, host); });
    for (let i = 0; i < 20; i += 1) await act(async () => { await Promise.resolve(); });
    const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === 'My Workplan');
    if (!button) throw new Error('Missing actual My Workplan navigation');
    act(() => { button.click(); });
    expect(props().nativeWritesHeld).toBe(nativeWritesHeld);
  };
  const select = (quarter: QuarterKey): Promise<void> => {
    let completion!: Promise<void>;
    act(() => { completion = props().onSelectQuarter(quarter); });
    return completion;
  };
  beforeEach(async () => {
    host = document.createElement('div'); document.body.appendChild(host);
    readContext = jest.fn().mockResolvedValue(context('Q1'));
    readCanonical = jest.fn().mockImplementation(async (command: { review: IQuarterReviewContext['review'] }) =>
      ({ review: command.review, items: [], evidence: [], audits: [] }));
    service = { getBehaviourObjectiveLibrary: async () => [], getQuarterTimingConfig: async () => ({}),
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getEmployeeWorkplanV2: async () => ({ workplan, coreItems: [], personalItems: [], behaviourItems: [], audits: [] }),
      getQuarterReviewContext: readContext, getEmployeeQuarterV2: readCanonical } as unknown as IProductionDataService;
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, config, workplanStatus: 'Approved' });
    (buildQuarterLifecycle as jest.Mock).mockReturnValue(['Q1', 'Q2', 'Q3', 'Q4'].map(q => lifecycle(q as QuarterKey)));
    (getCurrentQuarter as jest.Mock).mockImplementation((rows: IQuarterLifecycle[]) => rows[0]);
    await render(); readContext.mockClear(); readCanonical.mockClear();
  });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });

  describe.each(['save', 'submit'] as const)('%s mutation completion', operation => {
    it.each(['Q1', 'Q2'] as const)('cannot replace a newer %s selection', async quarter => {
      const pending = deferred<unknown>();
      Object.assign(service, { saveEmployeeQuarterUpdateV2: jest.fn().mockReturnValue(pending.promise),
        submitEmployeeQuarterV2: jest.fn().mockReturnValue(pending.promise) });
      await render(service, employee.email, false);
      readContext.mockResolvedValueOnce(context('Q1', 1));
      readCanonical.mockResolvedValueOnce({ review: context('Q1', 1).review!, items: [], evidence: [], audits: [] });
      await act(async () => { await select('Q1'); });
      let completion!: Promise<void>;
      act(() => { completion = operation === 'save' ? props().onSaveItem({ quarterReviewItemKey: 'employee|2026|Q1|core' } as IQuarterReviewItem) : props().onSubmit(); });
      readContext.mockResolvedValueOnce(context(quarter, 2));
      readCanonical.mockResolvedValueOnce({ review: context(quarter, 2).review!, items: [], evidence: [], audits: [] });
      await act(async () => { await select(quarter); pending.resolve({ duplicate: false,
        readback: { review: context('Q1', 3).review!, items: [], evidence: [], audits: [] } }); await completion; });
      expect(props().context?.review?.quarter).toBe(quarter);
      expect(props().context?.review?.rowVersionToken).toBe(2);
      expect(props().message).toBe(''); expect(props().saving).toBe(false);
    });
  });
  it('rejects a failed progress callback so the form retains unsaved note and link', async () => {
    Object.assign(service, { saveProgressEntry: jest.fn().mockRejectedValue(new Error('Synthetic failed save')) });
    await render(service, employee.email, false);
    let rejected = false;
    await act(async () => { await props().onAddProgress({} as IQuarterReviewItem, {} as IProgressEntry).catch(() => { rejected = true; }); });
    expect(rejected).toBe(true); expect(props().message).toContain('could not be confirmed'); expect(props().message).toContain('Reload the Quarter Review'); expect(props().saving).toBe(false);
  });
  it.each(['save', 'submit'] as const)('reports uncertain %s and fresh reopen shows the committed result without another write', async operation => {
    const initial = context('Q1', 2);
    let stored: IQuarterReviewContext = { ...initial, review: { ...initial.review!, state: 'Draft', accessState: 'EmployeeEdit' } };
    readContext.mockImplementation(async () => stored);
    readCanonical.mockImplementation(async () => ({ review: stored.review, items: stored.items, evidence: stored.evidence, audits: stored.auditEvents || [] }));
    const write = jest.fn(async () => {
      const prior = stored.review!;
      stored = { ...stored, review: { ...prior, rowVersionToken: 3, etag: '"3"',
        state: operation === 'submit' ? 'Submitted' : 'Draft',
        accessState: operation === 'submit' ? 'ReadOnly' : 'EmployeeEdit' },
        items: operation === 'save' ? [{ quarterReviewItemKey: 'fictional-core', employeeActualValue: 0 } as IQuarterReviewItem] : [] };
      throw new Error('Fictional write committed; response unavailable');
    });
    Object.assign(service, operation === 'save' ? { saveEmployeeQuarterUpdateV2: write } : { submitEmployeeQuarterV2: write });
    await render(service, employee.email, false); await act(async () => { await select('Q1'); });
    await act(async () => {
      if (operation === 'save') await props().onSaveItem({ quarterReviewItemKey: 'fictional-core', employeeActualValue: 0 } as IQuarterReviewItem);
      else await props().onSubmit();
    });
    expect(props().message).toContain('could not be confirmed');
    expect(props().message).toContain('Reload the Quarter Review');
    expect(props().message).not.toContain('was not saved');
    expect(props().message).not.toContain('was not submitted');
    expect(props().saving).toBe(false); expect(write).toHaveBeenCalledTimes(1);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    await render(service, employee.email, false); await act(async () => { await select('Q1'); });
    expect(props().context?.review?.rowVersionToken).toBe(3);
    expect(props().context?.review?.state).toBe(operation === 'submit' ? 'Submitted' : 'Draft');
    if (operation === 'save') expect(props().context?.items[0].employeeActualValue).toBe(0);
    expect(write).toHaveBeenCalledTimes(1);
  });
  describe.each(['save', 'submit', 'prepare', 'progress'] as const)('%s replacement ownership', operation => {
    it.each(['source', 'person', 'year'].flatMap(boundary => ['success', 'failure'].map(outcome => [boundary, outcome])))
    ('releases obsolete busy state on %s before its late %s', async (boundary, outcome) => {
      const pending = deferred<unknown>();
      Object.assign(service, { saveEmployeeQuarterUpdateV2: jest.fn().mockReturnValue(pending.promise),
        submitEmployeeQuarterV2: jest.fn().mockReturnValue(pending.promise),
        prepareQuarterReview: jest.fn().mockReturnValue(pending.promise), saveProgressEntry: jest.fn().mockReturnValue(pending.promise) });
      await render(service, employee.email, false);
      readContext.mockResolvedValueOnce(context('Q1', 1));
      await act(async () => { await select('Q1'); });
      let completion!: Promise<void>;
      act(() => { completion = (operation === 'save' ? props().onSaveItem({ quarterReviewItemKey: 'core' } as IQuarterReviewItem)
        : operation === 'submit' ? props().onSubmit() : operation === 'prepare' ? props().onPrepare()
          : props().onAddProgress({} as IQuarterReviewItem, {} as IProgressEntry)).catch(() => undefined); });
      expect(props().saving).toBe(true);
      const person = boundary === 'person' ? { ...employee, personKey: 'replacement', email: 'replacement@example.invalid' } : employee;
      const year = boundary === 'year' ? 2027 : 2026;
      const plan = { ...workplan, personKey: person.personKey, employeeEmail: person.email,
        workplanKey: `${person.personKey}|${year}`, performanceYear: year, workplanVersion: 1 };
      const replacementContext = context('Q2', 2);
      (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: person, manager,
        config: { ...config, performanceYear: String(year), performanceYearNumber: year }, workplanStatus: 'Approved' });
      await render({ ...service, getEmployeeWorkplanV2: async () => ({ workplan: plan, coreItems: [], personalItems: [], behaviourItems: [], audits: [] }),
        getQuarterReviewContext: jest.fn().mockResolvedValue(replacementContext),
        getEmployeeQuarterV2: jest.fn().mockResolvedValue({ review: replacementContext.review!, items: [], evidence: [], audits: [] }) }, person.email, false);
      const before = props().context;
      expect(props().saving).toBe(false);
      await act(async () => { if (outcome === 'failure') pending.reject(new Error('Synthetic late mutation failure'));
        else pending.resolve({}); await completion; });
      expect(props().saving).toBe(false); expect(props().context).toEqual(before); expect(props().message).toBe('');
    });
  });
  it.each(['absent', 'failed'] as const)('does not claim no creation after successful Prepare with %s confirmation', async outcome => {
    Object.assign(service, { prepareQuarterReview: jest.fn().mockResolvedValue(context('Q1', 7)) });
    await render(service, employee.email, false);
    if (outcome === 'failed') readCanonical.mockRejectedValueOnce(new Error('Synthetic confirmation read failed'));
    else readCanonical.mockResolvedValueOnce(undefined);
    await act(async () => { await props().onPrepare(); });
    expect(service.prepareQuarterReview).toHaveBeenCalledTimes(1);
    expect(props().message).not.toContain('No quarterly progress was created');
    expect(props().message).toContain('could not be confirmed'); expect(props().message).toContain('Reload');
    expect(props().saving).toBe(false);
  });
  it.each(['success', 'failure'] as const)('keeps the replacement owner busy when an obsolete submit finishes with %s', async outcome => {
    const older = deferred<unknown>(); const newer = deferred<unknown>();
    Object.assign(service, { submitEmployeeQuarterV2: jest.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise) });
    await render(service, employee.email, false);
    readContext.mockResolvedValueOnce(context('Q1', 1)); await act(async () => { await select('Q1'); });
    let first!: Promise<void>; act(() => { first = props().onSubmit(); });
    const replacement = context('Q2', 2);
    await render({ ...service, getQuarterReviewContext: jest.fn().mockResolvedValue(replacement),
      getEmployeeQuarterV2: jest.fn().mockResolvedValue({ review: replacement.review!, items: [], evidence: [], audits: [] }) }, employee.email, false);
    expect(props().saving).toBe(false);
    let second!: Promise<void>; act(() => { second = props().onSubmit(); });
    await act(async () => { if (outcome === 'failure') older.reject(new Error('Synthetic obsolete submit failure'));
      else older.resolve({}); await first; });
    expect(props().saving).toBe(true); expect(props().message).toBe('');
    expect(props().context?.review?.quarter).toBe('Q2');
    await act(async () => { newer.resolve({ readback: { review: context('Q2', 3).review!, items: [], evidence: [], audits: [] } }); await second; });
    expect(props().saving).toBe(false); expect(props().context?.review?.rowVersionToken).toBe(3);
  });
  it.each(['prepare', 'progress'] as const)('discards an earlier %s confirmation after selecting another quarter', async operation => {
    const pending = deferred<unknown>();
    Object.assign(service, { prepareQuarterReview: jest.fn().mockReturnValue(pending.promise),
      saveProgressEntry: jest.fn().mockReturnValue(pending.promise) });
    await render(service, employee.email, false);
    let completion!: Promise<void>; let rejected = false;
    act(() => { completion = (operation === 'prepare' ? props().onPrepare()
      : props().onAddProgress({} as IQuarterReviewItem, {} as IProgressEntry)).catch(() => { rejected = true; }); });
    readContext.mockResolvedValueOnce(context('Q2'));
    await act(async () => { await select('Q2'); pending.resolve(operation === 'prepare' ? context('Q1', 3)
      : { workplanItemKey: 'core', entries: [], rowVersionToken: 2 }); await completion; });
    expect(props().context?.lifecycle.quarterKey).toBe('Q2'); expect(props().context?.progressLedgers).toEqual([]);
    expect(props().message).toBe(''); expect(props().saving).toBe(false);
    expect(rejected).toBe(operation === 'progress'); expect(readCanonical).not.toHaveBeenCalled();
  });
  it('withholds an earlier context when canonical readback reports the review absent', async () => {
    readContext.mockResolvedValueOnce(context('Q2', 1)); readCanonical.mockResolvedValueOnce(undefined);
    await act(async () => { await select('Q2'); });
    expect(props().context).toBeUndefined(); expect(props().message).toContain('canonical'); expect(props().loading).toBe(false);
  });
  it('keeps a newer mutation saving until its own completion', async () => {
    const older = deferred<unknown>(); const newer = deferred<unknown>();
    Object.assign(service, { submitEmployeeQuarterV2: jest.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise) });
    await render(service, employee.email, false); readContext.mockResolvedValueOnce(context('Q1', 1));
    await act(async () => { await select('Q1'); });
    let first!: Promise<void>; act(() => { first = props().onSubmit(); });
    readContext.mockResolvedValueOnce(context('Q2', 2)); await act(async () => { await select('Q2'); });
    let second!: Promise<void>; act(() => { second = props().onSubmit(); });
    await act(async () => { older.resolve({ readback: { review: context('Q1', 3).review! } }); await first; });
    expect(props().saving).toBe(true); expect(props().message).toBe('');
    await act(async () => { newer.resolve({ readback: { review: context('Q2', 3).review!, items: [], evidence: [], audits: [] } }); await second; });
    expect(props().saving).toBe(false); expect(props().context?.review?.quarter).toBe('Q2');
    expect(props().context?.review?.rowVersionToken).toBe(3);
  });
  it.each(['replaced', 'unmounted'] as const)('does not consume mutation readback after source is %s', async outcome => {
    const pending = deferred<unknown>(); Object.assign(service, { submitEmployeeQuarterV2: jest.fn().mockReturnValue(pending.promise) });
    await render(service, employee.email, false); readContext.mockResolvedValueOnce(context('Q1', 1));
    await act(async () => { await select('Q1'); });
    let completion!: Promise<void>; act(() => { completion = props().onSubmit(); });
    if (outcome === 'unmounted') act(() => { ReactDOM.unmountComponentAtNode(host); });
    else await render({ ...service, getQuarterReviewContext: jest.fn().mockResolvedValue(context('Q1')) }, employee.email, false);
    const readback = jest.fn(() => { throw new Error('Obsolete readback must not be consumed'); });
    const result = {}; Object.defineProperty(result, 'readback', { enumerable: true, get: readback });
    await act(async () => { pending.resolve(result); await completion; });
    expect(readback).not.toHaveBeenCalled();
    if (outcome === 'replaced') { expect(props().context?.review).toBeUndefined(); expect(props().message).toBe(''); }
  });

  it('retains the newer quarter when an earlier context finishes last', async () => {
    const older = deferred<IQuarterReviewContext>(); const newer = deferred<IQuarterReviewContext>();
    readContext.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = select('Q1'); const second = select('Q2');
    await act(async () => { newer.resolve(context('Q2')); await second; });
    await act(async () => { older.resolve(context('Q1')); await first; });
    expect(props().selectedQuarter).toBe('Q2'); expect(props().context?.lifecycle.quarterKey).toBe('Q2');
  });
  it('keeps the newer loading state until its own context finishes', async () => {
    const older = deferred<IQuarterReviewContext>(); const newer = deferred<IQuarterReviewContext>();
    readContext.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = select('Q1'); const second = select('Q2'); expect(props().loading).toBe(true);
    await act(async () => { older.resolve(context('Q1')); await first; });
    expect(props().loading).toBe(true); expect(props().context).toBeUndefined();
    await act(async () => { newer.resolve(context('Q2')); await second; }); expect(props().loading).toBe(false);
  });
  it('does not begin canonical readback for an obsolete first-stage context', async () => {
    const older = deferred<IQuarterReviewContext>(); readContext.mockReturnValueOnce(older.promise).mockResolvedValueOnce(context('Q2'));
    const first = select('Q1'); const second = select('Q2');
    await act(async () => { await second; older.resolve(context('Q1', 1)); await first; });
    expect(readCanonical).not.toHaveBeenCalled(); expect(props().context?.lifecycle.quarterKey).toBe('Q2');
  });
  it('discards an older canonical readback that finishes after the newer selection', async () => {
    const older = deferred<Awaited<ReturnType<IProductionDataService['getEmployeeQuarterV2']>>>();
    readContext.mockResolvedValueOnce(context('Q1', 1)).mockResolvedValueOnce(context('Q2'));
    readCanonical.mockReturnValueOnce(older.promise); const first = select('Q1');
    await act(async () => { await Promise.resolve(); }); expect(readCanonical).toHaveBeenCalledTimes(1);
    const second = select('Q2'); await act(async () => {
      await second; older.resolve({ review: context('Q1', 9).review!, items: [], evidence: [], audits: [] }); await first;
    });
    expect(props().selectedQuarter).toBe('Q2'); expect(props().context?.lifecycle.quarterKey).toBe('Q2');
  });
  it('isolates two loads of the same quarter by request rather than quarter label', async () => {
    const older = deferred<IQuarterReviewContext>(); readContext.mockReturnValueOnce(older.promise).mockResolvedValueOnce(context('Q1', 2));
    const first = select('Q1'); const second = select('Q1');
    await act(async () => { await second; older.resolve(context('Q1', 1)); await first; });
    expect(props().context?.review?.rowVersionToken).toBe(2);
  });
  it('handles the latest failed read as recoverable unavailable state', async () => {
    readContext.mockRejectedValueOnce(new Error('Synthetic failed read'));
    let rejected = false;
    await act(async () => { await select('Q2').catch(() => { rejected = true; }); });
    expect(rejected).toBe(false); expect(props().context).toBeUndefined(); expect(props().loading).toBe(false);
    expect(props().message).toContain('could not be loaded');
  });
  it('does not show an obsolete read failure after a newer context succeeds', async () => {
    const older = deferred<IQuarterReviewContext>(); readContext.mockReturnValueOnce(older.promise).mockResolvedValueOnce(context('Q2'));
    const first = select('Q1').catch(() => undefined); const second = select('Q2');
    await act(async () => { await second; older.reject(new Error('Synthetic obsolete failure')); await first; });
    expect(props().context?.lifecycle.quarterKey).toBe('Q2'); expect(props().message || '').not.toContain('could not be loaded');
  });
  it('renders the latest canonical readback and clears an earlier recoverable read error', async () => {
    readContext.mockRejectedValueOnce(new Error('Synthetic first failure'));
    await act(async () => { await select('Q1'); }); expect(props().message).toContain('could not be loaded');
    readContext.mockResolvedValueOnce(context('Q2', 1));
    readCanonical.mockResolvedValueOnce({ review: context('Q2', 3).review!, items: [], evidence: [], audits: [] });
    await act(async () => { await select('Q2'); });
    expect(props().context?.review?.rowVersionToken).toBe(3); expect(props().context?.lifecycle.quarterKey).toBe('Q2');
    expect(props().message).toBe(''); expect(props().loading).toBe(false);
  });
  it('withholds context after the latest canonical read fails', async () => {
    readContext.mockResolvedValueOnce(context('Q2', 1)); readCanonical.mockRejectedValueOnce(new Error('Synthetic canonical failure'));
    let rejected = false;
    await act(async () => { await select('Q2').catch(() => { rejected = true; }); });
    expect(rejected).toBe(false); expect(props().context).toBeUndefined();
    expect(props().message).toContain('could not be loaded'); expect(props().loading).toBe(false);
  });
  it('does not show an obsolete canonical failure after a newer context succeeds', async () => {
    const older = deferred<Awaited<ReturnType<IProductionDataService['getEmployeeQuarterV2']>>>();
    readContext.mockResolvedValueOnce(context('Q1', 1)).mockResolvedValueOnce(context('Q2'));
    readCanonical.mockReturnValueOnce(older.promise); const first = select('Q1');
    await act(async () => { await Promise.resolve(); }); const second = select('Q2');
    await act(async () => { await second; older.reject(new Error('Synthetic stale canonical failure')); await first; });
    expect(props().context?.lifecycle.quarterKey).toBe('Q2'); expect(props().message).toBe(''); expect(props().loading).toBe(false);
  });
  it('does not continue canonical reads after the mounted source is replaced', async () => {
    const older = deferred<IQuarterReviewContext>(); readContext.mockReturnValueOnce(older.promise);
    const first = select('Q2'); const replacement = { ...service, getQuarterReviewContext: jest.fn().mockResolvedValue(context('Q1')) };
    await render(replacement);
    await act(async () => { older.resolve(context('Q2', 1)); await first; });
    expect(readCanonical).not.toHaveBeenCalled(); expect(props().context?.lifecycle.quarterKey).toBe('Q1');
  });
  it('does not continue canonical reads after unmount', async () => {
    const older = deferred<IQuarterReviewContext>(); readContext.mockReturnValueOnce(older.promise);
    const first = select('Q2'); act(() => { ReactDOM.unmountComponentAtNode(host); });
    await act(async () => { older.resolve(context('Q2', 1)); await first; }); expect(readCanonical).not.toHaveBeenCalled();
  });
  it.each(['confirmed', 'absent', 'failed'] as const)('discards superseded initial canonical %s completion after service replacement', async outcome => {
    const older = deferred<Awaited<ReturnType<IProductionDataService['getEmployeeQuarterV2']>>>();
    const oldRead = jest.fn().mockReturnValue(older.promise);
    await render({ ...service, getQuarterReviewContext: jest.fn().mockResolvedValue(context('Q1', 1)), getEmployeeQuarterV2: oldRead });
    expect(oldRead).toHaveBeenCalledTimes(1);
    await render({ ...service, getQuarterReviewContext: jest.fn().mockResolvedValue(context('Q1', 2)),
      getEmployeeQuarterV2: jest.fn().mockResolvedValue({ review: context('Q1', 3).review!, items: [], evidence: [], audits: [] }) });
    expect(props().context?.review?.rowVersionToken).toBe(3);
    await act(async () => {
      if (outcome === 'failed') older.reject(new Error('Synthetic superseded initial canonical failure'));
      else older.resolve(outcome === 'absent' ? undefined : { review: context('Q1', 9).review!, items: [], evidence: [], audits: [] });
      await Promise.resolve();
    });
    expect(props().context?.review?.rowVersionToken).toBe(3);
    expect(props().loading).toBe(false); expect(props().nativeWritesHeld).toBe(true);
  });
  it.each(['confirmed', 'absent', 'failed'] as const)('retains current initial canonical %s behavior', async outcome => {
    const read = jest.fn();
    if (outcome === 'failed') read.mockRejectedValue(new Error('Synthetic current canonical unavailable'));
    else read.mockResolvedValue(outcome === 'absent' ? undefined : { review: context('Q1', 4).review!, items: [], evidence: [], audits: [] });
    await render({ ...service, getQuarterReviewContext: jest.fn().mockResolvedValue(context('Q1', 2)), getEmployeeQuarterV2: read });
    expect(read).toHaveBeenCalledTimes(1);
    expect(props().context?.review?.rowVersionToken).toBe(outcome === 'confirmed' ? 4 : undefined);
    if (outcome !== 'confirmed') { expect(props().context).toBeUndefined(); expect(props().message).toContain('canonical'); }
    expect(props().loading).toBe(false); expect(props().nativeWritesHeld).toBe(true);
  });
  it('does not install an earlier identity canonical context after the signed-in person changes', async () => {
    const older = deferred<Awaited<ReturnType<IProductionDataService['getEmployeeQuarterV2']>>>();
    const oldRead = jest.fn().mockReturnValue(older.promise);
    await render({ ...service, getQuarterReviewContext: jest.fn().mockResolvedValue(context('Q1', 1)), getEmployeeQuarterV2: oldRead });
    expect(oldRead).toHaveBeenCalledTimes(1);
    const other = { ...employee, personKey: 'other', email: 'other@example.invalid', displayName: 'Synthetic Other' };
    const otherWorkplan = { ...workplan, workplanKey: 'other|2026', personKey: other.personKey,
      employeeEmail: other.email, employeeDisplayName: other.displayName };
    const otherContext = { ...context('Q1', 2), employee: other, review: { ...context('Q1', 2).review!,
      quarterReviewKey: 'other|2026|Q1', workplanKey: otherWorkplan.workplanKey, personKey: other.personKey,
      employeeEmail: other.email, employeeDisplayName: other.displayName } };
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: other, manager, config, workplanStatus: 'Approved' });
    await render({ ...service,
      getEmployeeWorkplanV2: jest.fn().mockResolvedValue({ workplan: otherWorkplan, coreItems: [], personalItems: [], behaviourItems: [], audits: [] }),
      getQuarterReviewContext: jest.fn().mockResolvedValue(otherContext), getEmployeeQuarterV2: jest.fn().mockResolvedValue({
        review: otherContext.review, items: [], evidence: [], audits: [] })
    }, other.email);
    expect(props().context?.review?.personKey).toBe('other');
    await act(async () => { older.resolve({ review: context('Q1', 9).review!, items: [], evidence: [], audits: [] }); await Promise.resolve(); });
    expect(props().context?.review?.personKey).toBe('other'); expect(props().context?.review?.quarterReviewKey).toBe('other|2026|Q1');
    expect(props().workplan?.personKey).toBe('other');
  });
  it('does not consume initial canonical result fields after unmount', async () => {
    const older = deferred<Awaited<ReturnType<IProductionDataService['getEmployeeQuarterV2']>>>();
    const oldRead = jest.fn().mockReturnValue(older.promise);
    await render({ ...service, getQuarterReviewContext: jest.fn().mockResolvedValue(context('Q1', 1)), getEmployeeQuarterV2: oldRead });
    expect(oldRead).toHaveBeenCalledTimes(1); act(() => { ReactDOM.unmountComponentAtNode(host); });
    const readback = { review: context('Q1', 3).review!, items: [], evidence: [], audits: [] };
    const readReview = jest.fn(() => context('Q1', 3).review!);
    Object.defineProperty(readback, 'review', { enumerable: true, get: readReview });
    await act(async () => { older.resolve(readback); await Promise.resolve(); });
    expect(readReview).not.toHaveBeenCalled();
  });
});
