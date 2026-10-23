import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import type { IAnnualWorkplan, ICoreKpiCatalogueItem, IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import type { IProgressEntry, IProgressLedger, IQuarterEvidenceReference, IQuarterLifecycle, IQuarterReview, IQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import QuarterlyReviewPage from './QuarterlyReviewPage';
import type { IQuarterlyReviewPageProps } from './QuarterlyReviewPage';

const employee: IProductionPerson = {
  id: 1, personKey: 'employee', displayName: 'Employee', email: 'person012@example.invalid',
  appRoles: ['Employee'], active: true
};
const manager: IProductionPerson = {
  id: 2, personKey: 'manager', displayName: 'Manager', email: 'person013@example.invalid',
  appRoles: ['Employee'], active: true
};
const config: IProductionConfig = {
  performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31',
  performanceYearNumber: 2026, quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 }, rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: [], retentionStatus: 'TBC'
};
const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'employee|2026', personKey: employee.personKey,
  employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
  managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
  state: 'Approved', accessState: 'ReadOnly', transitionStatus: 'Ready', transitionCorrelationKey: 'annual-approval-1',
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
};
const openLifecycle: IQuarterLifecycle = {
  performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q3', quarterName: 'Q3',
  quarterStart: '2026-05-01', quarterEnd: '2026-07-31', isCurrentQuarter: true, isOpenForProgressUpdates: true,
  employeeSubmissionDeadline: '2026-08-07', managerReviewDeadline: '2026-08-14',
  reminderMilestones: { earlyReview: '2026-07-01', preparation: '2026-07-17', final: '2026-07-24' },
  status: 'Open', priorQuarter: 'Q2', nextQuarter: 'Q4'
};
const review: IQuarterReview = {
  id: 1, etag: '"1"', quarterReviewKey: 'employee|2026|Q3', workplanKey: workplan.workplanKey,
  personKey: employee.personKey, employeeDisplayName: employee.displayName, employeeEmail: employee.email,
  performanceYear: 2026, quarter: 'Q3', managerPersonKey: manager.personKey,
  managerDisplayName: manager.displayName, managerEmail: manager.email,
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1
};
const impact: IQuarterReviewItem = {
  id: 2, etag: '"1"', quarterReviewItemKey: 'employee|2026|Q3|impact-1', quarterReviewKey: review.quarterReviewKey,
  workplanItemKey: 'impact-1', workplanKey: workplan.workplanKey, personKey: employee.personKey,
  performanceYear: 2026, quarter: 'Q3', itemType: 'LocalPersonal', reportingStream: 'Impact',
  wording: 'Improve synthetic delivery', itemDescription: 'Reduce controlled waiting time', measure: 'Completed cases',
  unitLabel: 'cases', metricType: 'Count', scoringDirection: 'HigherIsBetter', yearEndTargetValueSnapshot: 40,
  quarterTargetValue: 10, employeeActualValue: 10, progressPct: 100, scoredProgressPct: 100,
  calculatedRag: 'Green', statusUpdate: 'Ten synthetic cases completed.', evidenceCount: 0,
  workplanItemWeightSnapshot: 100, managerApproved: false, locked: false,
  impactAnnualDefinitionSnapshot: Object.freeze({
    sourceWorkplanItemKey: 'impact-1', wording: 'Improve synthetic delivery', intendedOutcome: 'Reduce controlled waiting time',
    measure: 'Completed cases', unitLabel: 'cases', metricType: 'Count', scoringDirection: 'HigherIsBetter',
    yearEndTargetValue: 40, quarterTargetValue: 10, workplanItemWeight: 100,
    classification: Object.freeze({
      strategicPillar: Object.freeze({ key: 'pillar-1', label: 'Synthetic pillar', source: 'TEST-GOVERNED' }),
      businessContributionArea: Object.freeze({ key: 'area-1', label: 'Synthetic area', source: 'TEST-GOVERNED' })
    })
  })
};

const context = (lifecycle: IQuarterLifecycle): IQuarterReviewContext => ({
  lifecycle, review, employee, manager, coreCatalogue: [], behaviours: [], items: [impact],
  progressLedgers: [], evidence: [], readiness: {
    ready: lifecycle.status === 'Finalising', blockers: [], warnings: [], coreComplete: 0, personalComplete: 1, behavioursComplete: 0
  }, dataFoundationReady: true, messages: []
});

describe('PM128 current Core editor source boundary', () => {
  const definition: ICoreKpiCatalogueItem = { kpiId: 'CORE-001', kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|t1',
    wording: 'Synthetic Core source', pillar: 'Synthetic pillar', workstream: 'Synthetic stream', metricType: 'Count',
    scoringDirection: 'HigherIsBetter', unitLabel: 'cases', q3TargetValue: 10 };
  const core: IQuarterReviewItem = { ...impact, itemType: 'CoreGold', reportingStream: 'CoreGold', kpiId: 'CORE-001',
    kpiVersionKey: definition.kpiVersionKey, targetVersionKey: definition.targetVersionKey, wording: 'Controlled Core row' };
  let host: HTMLDivElement;
  const mutation = jest.fn(async () => undefined);
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); mutation.mockClear(); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const render = (sources: ICoreKpiCatalogueItem[], historical = false, suppliedConfig = config, suppliedItem = core): void => {
    const lifecycle: IQuarterLifecycle = historical
      ? { ...openLifecycle, status: 'Locked', isCurrentQuarter: false, isOpenForProgressUpdates: false } : openLifecycle;
    const value: IQuarterReviewContext = { ...context(lifecycle), coreCatalogue: sources, items: [Object.freeze({ ...suppliedItem })],
      review: historical ? { ...review, state: 'Locked', accessState: 'ReadOnly' } : review };
    const original = JSON.stringify(value);
    act(() => { ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={suppliedConfig} lifecycles={[lifecycle]}
      selectedQuarter="Q3" context={value} loading={false} saving={false} onSelectQuarter={mutation} onPrepare={mutation}
      onSaveItem={mutation} onAddProgress={mutation} onSubmit={mutation} />, host); });
    expect(JSON.stringify(value)).toBe(original);
  };
  const saveButton = (): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll<HTMLButtonElement>('details button')).find(node => node.textContent === 'Save update');
    if (!found) throw new Error('Missing Core save button.'); return found;
  };
  it.each(['CoreGold', 'LocalPersonal'] as const)('withholds %s edits for each invalid config-year source', itemType => {
    const item = itemType === 'CoreGold' ? core : impact;
    for (const year of [2027, undefined, '2026', NaN, Infinity, 2026.5]) {
      const invalid = { ...config, performanceYearNumber: year } as unknown as IProductionConfig;
      render([{ ...definition }], false, invalid, item);
      expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(true);
      expect(saveButton().disabled).toBe(true);
      expect(host.textContent).toContain('Scoring configuration does not match this saved quarter year');
      act(() => { saveButton().click(); }); expect(mutation).not.toHaveBeenCalled();
    }
  });
  it.each(['CoreGold', 'LocalPersonal'] as const)('preserves readonly %s history with a different current config year', itemType => {
    const item = itemType === 'CoreGold' ? core : impact;
    render([], true, { ...config, performanceYearNumber: 2027 }, item);
    expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('Green');
    expect(saveButton().disabled).toBe(true);
    expect(host.textContent).not.toContain('Scoring configuration does not match this saved quarter year');
  });
  it.each(['CoreGold', 'LocalPersonal'] as const)('keeps matching-year %s editing available', itemType => {
    render([{ ...definition }], false, config, itemType === 'CoreGold' ? core : impact);
    expect(saveButton().disabled).toBe(false);
    expect(host.textContent).not.toContain('Scoring configuration does not match this saved quarter year');
  });
  it.each(['missing', 'duplicate', 'KPIID', 'KPIVersion', 'targetVersion', 'targetValue', 'targetText'] as const)(
    'withholds editable Core input when supplied source is %s', kind => {
      let sources = [{ ...definition }];
      if (kind === 'missing') sources = [];
      else if (kind === 'duplicate') sources.push({ ...definition });
      else if (kind === 'KPIID') sources[0].kpiId = 'CORE-OTHER';
      else if (kind === 'KPIVersion') sources[0].kpiVersionKey = 'CORE-001|v2';
      else if (kind === 'targetVersion') sources[0].targetVersionKey = 'CORE-001|t2';
      else if (kind === 'targetValue') sources[0].q3TargetValue = 11;
      else sources[0].q3TargetText = 'Changed target text';
      render(sources);
      expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(true);
      expect((host.querySelector('details textarea') as HTMLTextAreaElement).disabled).toBe(true);
      expect(saveButton().disabled).toBe(true);
      expect(host.textContent).toContain('Current Core KPI or target source is unavailable or changed');
      act(() => { saveButton().click(); }); expect(mutation).not.toHaveBeenCalled();
    });
  it('keeps the exact unique KPI and target snapshot editable', () => {
    render([{ ...definition }]);
    expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(false);
    expect(saveButton().disabled).toBe(false);
    expect(host.textContent).not.toContain('Current Core KPI or target source is unavailable or changed');
    expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('Green');
  });
  it('keeps historical display readable without requiring a current Core catalogue', () => {
    render([], true);
    expect(host.textContent).toContain('Controlled Core row');
    expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('Green');
    expect(saveButton().disabled).toBe(true);
    expect(host.textContent).not.toContain('Current Core KPI or target source is unavailable or changed');
  });
  it('withholds an existing draft immediately when its supplied target version changes', () => {
    render([{ ...definition }]); expect(saveButton().disabled).toBe(false);
    const input = host.querySelector('details input[type="number"]') as HTMLInputElement;
    act(() => { input.value = '7'; Simulate.change(input); });
    render([{ ...definition, targetVersionKey: 'CORE-001|t2' }]);
    expect(saveButton().disabled).toBe(true);
    expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(true);
    act(() => { saveButton().click(); }); expect(mutation).not.toHaveBeenCalled();
  });
});

describe('PM128 saved readonly quarter display', () => {
  const withPage = (value: IQuarterReviewContext, check: (host: HTMLDivElement) => void): void => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const mutation = jest.fn(async () => undefined);
    const original = JSON.stringify(value);
    try {
      act(() => { ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={config}
        lifecycles={[value.lifecycle]} selectedQuarter="Q3" context={value} loading={false} saving={false}
        onSelectQuarter={mutation} onPrepare={mutation} onSaveItem={mutation} onAddProgress={mutation} onSubmit={mutation} />, host); });
      check(host); expect(JSON.stringify(value)).toBe(original); expect(mutation).not.toHaveBeenCalled();
    } finally { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); }
  };
  const historical = (item: IQuarterReviewItem, state: 'Approved' | 'Locked' | 'Submitted' = 'Locked'): IQuarterReviewContext => ({
    ...context({ ...openLifecycle, status: 'Locked', isCurrentQuarter: false, isOpenForProgressUpdates: false }),
    review: { ...review, state, accessState: 'ReadOnly' }, items: [Object.freeze(item)]
  });
  it.each([
    ['Approved', 'CoreGold'], ['Locked', 'CoreGold'], ['Submitted', 'CoreGold'],
    ['Approved', 'LocalPersonal'], ['Locked', 'LocalPersonal'], ['Submitted', 'LocalPersonal']
  ] as const)('preserves captured %s %s RAG/progress/message despite current config', (state, itemType) => {
    const saved: IQuarterReviewItem = { ...impact, itemType, employeeActualValue: 7,
      reportingStream: itemType === 'CoreGold' ? 'CoreGold' : 'Impact', kpiId: itemType === 'CoreGold' ? 'CORE-001' : undefined,
      kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|t1', progressPct: 77, scoredProgressPct: 65,
      calculatedRag: 'Green', scoringMessage: 'Captured approved scoring explanation', locked: true };
    withPage(historical(saved, state), host => {
      expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('Green');
      expect(host.textContent).toContain('77% progress against target · 65% delivery score');
      expect(host.textContent).toContain('Captured approved scoring explanation');
      expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(true);
    });
  });
  it('preserves saved legacy Behaviour result instead of recomputing employee assessment', () => {
    const saved: IQuarterReviewItem = { ...impact, itemType: 'Behaviour', reportingStream: undefined,
      behaviourTargetRating: 3, employeeBehaviourRating: 1, calculatedRag: 'Green',
      progressPct: 75, scoredProgressPct: 65, scoringMessage: 'Captured Behaviour result', locked: true };
    withPage(historical(saved), host => {
      expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('Green');
      expect(host.textContent).toContain('Captured Behaviour result');
      expect((host.querySelector('details select') as HTMLSelectElement).disabled).toBe(true);
    });
  });
  it('keeps captured fractional Actual/target/forecast units despite changed live catalogue', () => {
    const saved: IQuarterReviewItem = { ...impact, itemType: 'CoreGold', reportingStream: 'CoreGold', kpiId: 'CORE-001',
      kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|t1', metricType: 'Percentage',
      percentageSourceScale: 'Fraction', quarterTargetValue: 1, employeeActualValue: 0.8, quarterEndForecastValue: 0.9,
      unitLabel: '%', locked: true };
    const value = historical(saved);
    value.coreCatalogue = [{ kpiId: 'CORE-001', kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|t2',
      wording: 'Changed live definition', pillar: 'Pillar', workstream: 'Stream', metricType: 'Percentage',
      scoringDirection: 'HigherIsBetter', percentageSourceScale: 'Whole', unitLabel: '%' }];
    withPage(value, host => {
      const inputs = host.querySelectorAll('details input[type="number"]');
      expect((inputs[0] as HTMLInputElement).value).toBe('80');
      expect((inputs[1] as HTMLInputElement).value).toBe('90');
      expect(host.textContent).toContain('100 %');
    });
  });
  it('does not invent a missing saved score or replace captured NotRated in history', () => {
    withPage(historical({ ...impact, progressPct: undefined, scoredProgressPct: undefined,
      calculatedRag: 'NotRated', scoringMessage: 'Original policy unavailable', locked: true }), host => {
      expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('NotRated');
      expect(host.textContent).toContain('Unassessed'); expect(host.textContent).toContain('Original policy unavailable');
    });
  });
  it('preserves a saved non-current draft result without granting edit permission', () => {
    const value = context({ ...openLifecycle, isCurrentQuarter: false });
    value.items = [{ ...impact, employeeActualValue: 7, progressPct: 77, scoredProgressPct: 65,
      calculatedRag: 'Green', scoringMessage: 'Saved non-current draft result' }];
    withPage(value, host => {
      expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('Green');
      expect(host.textContent).toContain('77% progress against target');
      expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(true);
    });
  });
  it('continues live controlled recalculation for authorised editable current drafts', () => {
    const value = context(openLifecycle);
    value.items = [{ ...impact, employeeActualValue: 7, progressPct: 77, scoredProgressPct: 65,
      calculatedRag: 'Green', scoringMessage: 'Saved prior draft result' }];
    withPage(value, host => {
      expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('Amber');
      expect(host.textContent).toContain('70% progress against target');
      expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(false);
    });
  });
});

describe('selected quarter context coherence', () => {
  let host: HTMLDivElement;
  const mutation = jest.fn(async () => undefined);
  const selection = jest.fn(async () => undefined);
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); mutation.mockClear(); selection.mockClear(); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const renderContext = (value?: IQuarterReviewContext, overrides: Partial<IQuarterlyReviewPageProps> = {}): void => {
    act(() => { ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={config}
      lifecycles={[openLifecycle]} selectedQuarter="Q3" context={value} loading={false} saving={false}
      onSelectQuarter={selection} onPrepare={mutation} onSaveItem={mutation} onAddProgress={mutation} onSubmit={mutation}
      {...overrides} />, host); });
  };
  const blocked = (): void => {
    expect(host.textContent).toContain('Reload the selected quarter');
    expect(host.textContent).not.toContain('Improve synthetic delivery');
    expect(host.querySelector('section[data-reporting-stream="Impact"] details')).toBeNull();
    expect(host.querySelector('input')).toBeNull();
    expect(host.querySelector('textarea')).toBeNull();
    const buttons = Array.from(host.querySelectorAll('button'));
    expect(buttons.some(button => /Prepare|Save update|Submit Quarter|Add progress/.test(button.textContent || ''))).toBe(false);
    act(() => { buttons.forEach(button => button.click()); });
    expect(mutation).not.toHaveBeenCalled();
    const selector = host.querySelector('select') as HTMLSelectElement;
    expect(selector.disabled).toBe(false);
    const selected = selector.value;
    act(() => { Simulate.change(selector); });
    expect(selection).toHaveBeenCalledWith(selected);
  };
  it.each(['quarter', 'workplan', 'person', 'year', 'key', 'employee', 'lifecycleQuarter', 'lifecycleYear', 'lifecycleState', 'item'] as const)(
    'withholds a supplied mismatched %s source and retains quarter reload', kind => {
      const value = context(openLifecycle); const original = JSON.stringify(value);
      const changed: IQuarterReviewContext = { ...value };
      if (kind === 'quarter') changed.review = { ...review, quarter: 'Q2', quarterReviewKey: 'employee|2026|Q2' };
      else if (kind === 'workplan') changed.review = { ...review, workplanKey: 'other-workplan' };
      else if (kind === 'person') changed.review = { ...review, personKey: 'other-person' };
      else if (kind === 'year') changed.review = { ...review, performanceYear: 2027 };
      else if (kind === 'key') changed.review = { ...review, quarterReviewKey: 'other-review' };
      else if (kind === 'employee') changed.employee = { ...employee, personKey: 'other-person' };
      else if (kind === 'lifecycleQuarter') changed.lifecycle = { ...openLifecycle, quarterKey: 'Q2' };
      else if (kind === 'lifecycleYear') changed.lifecycle = { ...openLifecycle, performanceYearNumber: 2027 };
      else if (kind === 'lifecycleState') changed.lifecycle = { ...openLifecycle, status: 'Locked', isOpenForProgressUpdates: false };
      else changed.items = [{ ...impact, quarterReviewKey: 'employee|2026|Q2', quarter: 'Q2' }];
      renderContext(changed); blocked(); expect(JSON.stringify(value)).toBe(original);
    });
  it('hides the old review when selection changes before its replacement arrives', () => {
    renderContext(context(openLifecycle)); expect(host.textContent).toContain('Improve synthetic delivery');
    const nextLifecycle: IQuarterLifecycle = { ...openLifecycle, quarterKey: 'Q4', quarterName: 'Q4' };
    renderContext(context(openLifecycle), { selectedQuarter: 'Q4', lifecycles: [nextLifecycle] }); blocked();
  });
  it('withholds context after the accepted Workplan changes', () => {
    renderContext(context(openLifecycle), { workplan: { ...workplan, workplanKey: 'employee|2027', performanceYear: 2027 } }); blocked();
  });
  it('does not treat an unprepared context with the wrong lifecycle as permission to prepare', () => {
    renderContext({ ...context(openLifecycle), review: undefined, items: [], lifecycle: { ...openLifecycle, quarterKey: 'Q2' } }); blocked();
  });
  it.each(['absent', 'unprepared'] as const)('preserves genuinely %s matching preparation', kind => {
    renderContext(kind === 'absent' ? undefined : { ...context(openLifecycle), review: undefined, items: [] });
    const prepare = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Prepare Q3 review')!;
    expect(prepare.disabled).toBe(false); act(() => { prepare.click(); }); expect(mutation).toHaveBeenCalledTimes(1);
    expect(host.textContent).not.toContain('Reload the selected quarter');
  });
  it.each(['absent', 'unprepared'] as const)('withholds %s preparation with an invalid config year', kind => {
    const value = kind === 'absent' ? undefined : { ...context(openLifecycle), review: undefined, items: [] };
    for (const year of [2027, undefined, '2026', NaN, Infinity, 2026.5]) {
      renderContext(value, { config: { ...config, performanceYearNumber: year } as unknown as IProductionConfig });
      const prepare = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent === 'Prepare Q3 review');
      if (!prepare) throw new Error('Expected preparation button.');
      expect(prepare.disabled).toBe(true);
      expect(host.textContent).toContain('Quarter preparation requires matching Workplan, lifecycle and configuration years');
      act(() => { prepare.click(); }); expect(mutation).not.toHaveBeenCalled();
      expect((host.querySelector('select') as HTMLSelectElement).disabled).toBe(false);
    }
  });
  it('withholds absent-context preparation when lifecycle year differs from the accepted Workplan', () => {
    renderContext(undefined, { lifecycles: [{ ...openLifecycle, performanceYearNumber: 2027 }] });
    const prepare = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent === 'Prepare Q3 review');
    if (!prepare) throw new Error('Expected preparation button.');
    expect(prepare.disabled).toBe(true); act(() => { prepare.click(); }); expect(mutation).not.toHaveBeenCalled();
  });
  it('recovers from mismatched context to a matching saved read-only review', () => {
    renderContext({ ...context(openLifecycle), review: { ...review, workplanKey: 'other-workplan' } }); blocked();
    const historical: IQuarterLifecycle = { ...openLifecycle, status: 'Locked', isCurrentQuarter: false, isOpenForProgressUpdates: false };
    renderContext({ ...context(historical), review: { ...review, state: 'Locked', accessState: 'ReadOnly' } }, { lifecycles: [historical] });
    expect(host.textContent).not.toContain('Reload the selected quarter'); expect(host.textContent).toContain('Improve synthetic delivery');
    expect((host.querySelector('input[type="number"]') as HTMLInputElement).disabled).toBe(true);
    expect(mutation).not.toHaveBeenCalled();
  });
  it('withholds item and progress writes while a matching quarter is loading', () => {
    renderContext(context(openLifecycle), { loading: true });
    expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(true);
    const save = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent === 'Save update');
    expect(save?.disabled).toBe(true);
    expect((host.querySelector('details textarea') as HTMLTextAreaElement).disabled).toBe(true);
    renderContext(context(openLifecycle), { loading: false });
    expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(false);
  });
  it('withholds preparation while the quarter source is loading', () => {
    renderContext(undefined, { loading: true });
    const prepare = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(node => node.textContent === 'Prepare Q3 review');
    expect(prepare?.disabled).toBe(true);
    act(() => { prepare?.click(); }); expect(mutation).not.toHaveBeenCalled();
  });
  it('retains saved quarter display and withholds edits when configuration is unavailable', () => {
    expect(() => renderContext(context(openLifecycle), { config: undefined })).not.toThrow();
    expect(host.textContent).toContain('Improve synthetic delivery');
    expect((host.querySelector('details input[type="number"]') as HTMLInputElement).disabled).toBe(true);
    expect(host.querySelector('details [data-rag]')?.getAttribute('data-rag')).toBe('Green');
  });
});

describe('quarter progress draft isolation', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const renderContext = (value: IQuarterReviewContext, add: IQuarterlyReviewPageProps['onAddProgress'] = jest.fn(async (_item: IQuarterReviewItem, _entry: unknown) => undefined)): void => {
    act(() => { ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={config} lifecycles={[value.lifecycle]}
      selectedQuarter="Q3" context={value} loading={false} saving={false}
      onSelectQuarter={async () => undefined} onPrepare={async () => undefined} onSaveItem={async () => undefined}
      onAddProgress={add} onSubmit={async () => undefined} />, host); });
  };
  const note = (): HTMLTextAreaElement => host.querySelector('section[data-reporting-stream="Impact"] textarea[rows="2"]') as HTMLTextAreaElement;
  const link = (): HTMLInputElement => host.querySelector('section[data-reporting-stream="Impact"] input[type="url"]') as HTMLInputElement;
  const date = (): HTMLInputElement => host.querySelector('section[data-reporting-stream="Impact"] input[type="date"]') as HTMLInputElement;
  const addButton = (): HTMLButtonElement => Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Add progress note')!;
  const edit = (text = 'First synthetic note', url = 'https://example.invalid/first'): void => {
    act(() => { note().value = text; Simulate.change(note()); });
    act(() => { link().value = url; Simulate.change(link()); });
    act(() => { date().value = '2026-06-03'; Simulate.input(date()); });
    expect(note().value).toBe(text); expect(link().value).toBe(url); expect(date().value).toBe('2026-06-03');
  };
  it.each(['version', 'state', 'access', 'transition', 'lifecycle'] as const)('clears unsaved progress fields at a changed %s boundary', kind => {
    const before = context(openLifecycle); renderContext(before); edit();
    const next: IQuarterReviewContext = { ...before, review: { ...review } };
    if (kind === 'version') next.review!.rowVersionToken = 2;
    else if (kind === 'state') next.review!.state = 'Locked';
    else if (kind === 'access') next.review!.accessState = 'RecoveryHold';
    else if (kind === 'transition') next.review!.transitionStatus = 'InProgress';
    else next.lifecycle = { ...openLifecycle, status: 'Finalising', isCurrentQuarter: false, isOpenForProgressUpdates: false };
    renderContext(next); expect(note().value).toBe(''); expect(link().value).toBe(''); expect(date().value).not.toBe('2026-06-03');
  });
  it('preserves an unsaved progress draft through matching metadata refresh', () => {
    const before = context(openLifecycle); renderContext(before); edit();
    renderContext({ ...before, auditEvents: [], evidence: [] });
    expect(note().value).toBe('First synthetic note'); expect(link().value).toBe('https://example.invalid/first'); expect(date().value).toBe('2026-06-03');
  });
  it('preserves later edits when an earlier progress completion arrives', async () => {
    let complete: () => void = () => undefined;
    const pending = new Promise<void>(resolve => { complete = resolve; });
    const add = jest.fn(async (_item: IQuarterReviewItem, _entry: unknown) => pending);
    renderContext(context(openLifecycle), add); edit();
    act(() => { addButton().click(); });
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ quarterReviewItemKey: impact.quarterReviewItemKey }),
      expect.objectContaining({ note: 'First synthetic note', date: '2026-06-03', evidenceLink: 'https://example.invalid/first' }));
    edit('Newer synthetic note', 'https://example.invalid/newer');
    await act(async () => { complete(); await pending; await Promise.resolve(); });
    expect(note().value).toBe('Newer synthetic note'); expect(link().value).toBe('https://example.invalid/newer');
  });
  it('clears only the unchanged successfully submitted note and link', async () => {
    const add = jest.fn(async (_item: IQuarterReviewItem, _entry: unknown) => undefined);
    renderContext(context(openLifecycle), add); edit();
    await act(async () => { addButton().click(); await Promise.resolve(); });
    expect(note().value).toBe(''); expect(link().value).toBe(''); expect(date().value).toBe('2026-06-03');
    expect(add).toHaveBeenCalledTimes(1);
  });
  it.each(['date', 'link'] as const)('preserves the draft when only its %s changes while Add is pending', async field => {
    let complete: () => void = () => undefined;
    const pending = new Promise<void>(resolve => { complete = resolve; });
    const add = jest.fn(async (_item: IQuarterReviewItem, _entry: unknown) => pending);
    renderContext(context(openLifecycle), add); edit(); act(() => { addButton().click(); });
    if (field === 'date') act(() => { date().value = '2026-06-04'; Simulate.input(date()); });
    else act(() => { link().value = 'https://example.invalid/newer'; Simulate.change(link()); });
    await act(async () => { complete(); await pending; await Promise.resolve(); });
    expect(note().value).toBe('First synthetic note');
    expect(link().value).toBe(field === 'link' ? 'https://example.invalid/newer' : 'https://example.invalid/first');
    expect(date().value).toBe(field === 'date' ? '2026-06-04' : '2026-06-03');
  });
  it('does not let a previous review version completion clear the new version draft', async () => {
    let complete: () => void = () => undefined;
    const pending = new Promise<void>(resolve => { complete = resolve; });
    const add = jest.fn(async (_item: IQuarterReviewItem, _entry: unknown) => pending);
    const before = context(openLifecycle); renderContext(before, add); edit(); act(() => { addButton().click(); });
    renderContext({ ...before, review: { ...review, rowVersionToken: 2 } }, add);
    expect(note().value).toBe(''); edit('New version draft', 'https://example.invalid/version2');
    await act(async () => { complete(); await pending; await Promise.resolve(); });
    expect(note().value).toBe('New version draft'); expect(link().value).toBe('https://example.invalid/version2');
  });
  it('retains a draft after rejected progress submission', async () => {
    const add = jest.fn(async (_item: IQuarterReviewItem, _entry: unknown) => { throw new Error('Synthetic hold'); });
    renderContext(context(openLifecycle), add); edit();
    await act(async () => { addButton().click(); await Promise.resolve(); });
    expect(note().value).toBe('First synthetic note'); expect(link().value).toBe('https://example.invalid/first');
  });
});

describe('quarter saved progress and evidence associations', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const entry: IProgressEntry = { entryKey: 'bound-entry', quarterReviewKey: review.quarterReviewKey,
    quarterReviewItemKey: impact.quarterReviewItemKey, quarter: 'Q3', date: '2026-06-01', note: 'Bound synthetic progress',
    actorPersonKey: employee.personKey, actorEmail: employee.email, updatedAt: '2026-06-01T10:00:00.000Z' };
  const ledger: IProgressLedger = { id: 1, etag: '"1"', progressLedgerKey: 'bound-ledger',
    workplanItemKey: impact.workplanItemKey, workplanKey: workplan.workplanKey, personKey: employee.personKey,
    performanceYear: 2026, itemType: 'LocalPersonal', entries: [entry], locked: false, rowVersionToken: 1 };
  const evidence: IQuarterEvidenceReference = { evidenceKey: 'bound-evidence', kind: 'Text', personKey: employee.personKey,
    workplanKey: workplan.workplanKey, workplanItemKey: impact.workplanItemKey, quarterReviewKey: review.quarterReviewKey,
    quarterReviewItemKey: impact.quarterReviewItemKey, performanceYear: 2026, quarter: 'Q3', description: 'Synthetic evidence', status: 'Approved' };
  const renderContext = (value: IQuarterReviewContext, overrides: Partial<IQuarterlyReviewPageProps> = {}): void => {
    act(() => { ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={config} lifecycles={[openLifecycle]}
      selectedQuarter="Q3" context={value} loading={false} saving={false} nativeWritesHeld
      onSelectQuarter={async () => undefined} onPrepare={async () => undefined} onSaveItem={async () => undefined}
      onAddProgress={async () => undefined} onSubmit={async () => undefined} {...overrides} />, host); });
  };
  const section = (): HTMLElement => host.querySelector('section[data-reporting-stream="Impact"]') as HTMLElement;
  it.each(['workplan', 'person', 'year', 'itemType', 'kpi'] as const)('withholds a ledger with mismatched %s identity', kind => {
    const wrong: IProgressLedger = { ...ledger };
    if (kind === 'workplan') wrong.workplanKey = 'other-workplan';
    else if (kind === 'person') wrong.personKey = 'other-person';
    else if (kind === 'year') wrong.performanceYear = 2027;
    else if (kind === 'itemType') wrong.itemType = 'Behaviour';
    else wrong.kpiId = 'foreign-kpi';
    renderContext({ ...context(openLifecycle), progressLedgers: [wrong] });
    expect(section().textContent).not.toContain('Bound synthetic progress');
  });
  it('finds the matching ledger after a different annual source with the same item key', () => {
    renderContext({ ...context(openLifecycle), progressLedgers: [{ ...ledger, workplanKey: 'other-workplan',
      entries: [{ ...entry, note: 'Foreign synthetic progress' }] }, ledger] });
    expect(section().textContent).toContain('Bound synthetic progress'); expect(section().textContent).not.toContain('Foreign synthetic progress');
  });
  it('withholds ambiguous duplicate matching ledgers instead of choosing the first', () => {
    renderContext({ ...context(openLifecycle), progressLedgers: [ledger, { ...ledger, id: 2, progressLedgerKey: 'duplicate-ledger' }] });
    expect(section().textContent).toContain('Progress history unavailable: multiple matching records');
    expect(section().textContent).not.toContain('Bound synthetic progress');
  });
  it('withholds Add and progress inputs when duplicate ledger ambiguity appears after editing', () => {
    const add = jest.fn(async () => undefined);
    renderContext({ ...context(openLifecycle), progressLedgers: [ledger] }, { nativeWritesHeld: false, onAddProgress: add });
    const note = section().querySelector('textarea[rows="2"]') as HTMLTextAreaElement;
    expect(note.disabled).toBe(false); act(() => { note.value = 'Unsaved source-bound note'; Simulate.change(note); });
    renderContext({ ...context(openLifecycle), progressLedgers: [ledger, { ...ledger, id: 2 }] }, { nativeWritesHeld: false, onAddProgress: add });
    const controls = Array.from(section().querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="date"],input[type="url"],textarea[rows="2"]'));
    expect(controls.length).toBe(3); expect(controls.every(control => control.disabled)).toBe(true);
    const button = Array.from(section().querySelectorAll('button')).find(item => item.textContent === 'Add progress note')!;
    expect(button.disabled).toBe(true); act(() => { button.click(); }); expect(add).not.toHaveBeenCalled();
  });
  it('preserves genuine no-quarter history as annual history without attributing it to this quarter', () => {
    const legacy: IProgressEntry = { ...entry, quarterReviewKey: undefined, quarterReviewItemKey: undefined, quarter: undefined,
      note: 'Legacy annual progress', evidenceLink: 'https://example.invalid/annual' };
    const value = { ...context(openLifecycle), progressLedgers: [{ ...ledger, entries: [legacy] }] };
    const original = JSON.stringify(value); renderContext(value);
    expect(section().textContent).toContain('Annual progress history — quarter not recorded');
    const annual = section().querySelector('[data-progress-history="AnnualUnassigned"]')!;
    expect(annual.textContent).toContain('Legacy annual progress');
    expect(annual.querySelector('a')?.getAttribute('href')).toBe('https://example.invalid/annual');
    expect(section().querySelector('[data-progress-history="Quarter"]')?.textContent || '').not.toContain('Legacy annual progress');
    expect(JSON.stringify(value)).toBe(original);
  });
  it('does not display an explicitly different legacy quarter as this quarter progress', () => {
    renderContext({ ...context(openLifecycle), progressLedgers: [{ ...ledger, entries: [{ ...entry,
      quarterReviewKey: undefined, quarterReviewItemKey: undefined, quarter: 'Q2' }] }] });
    expect(section().textContent).not.toContain('Bound synthetic progress');
  });
  it('retains explicitly matching legacy quarter progress within the matching annual ledger', () => {
    renderContext({ ...context(openLifecycle), progressLedgers: [{ ...ledger, entries: [{ ...entry,
      quarterReviewKey: undefined, quarterReviewItemKey: undefined }] }] });
    expect(section().textContent).toContain('Bound synthetic progress');
  });
  it.each(['itemOnly', 'partialWithQuarter'] as const)('withholds an incomplete %s review association', kind => {
    renderContext({ ...context(openLifecycle), progressLedgers: [{ ...ledger, entries: [{ ...entry,
      quarterReviewKey: undefined, quarterReviewItemKey: 'foreign-quarter-item', quarter: kind === 'itemOnly' ? undefined : 'Q3' }] }] });
    expect(section().textContent).not.toContain('Bound synthetic progress');
  });
  it.each(['workplan', 'person', 'year', 'review', 'quarterItem', 'quarter', 'annualItem', 'kpi'] as const)(
    'does not display evidence status with mismatched %s identity', kind => {
      const wrong: IQuarterEvidenceReference = { ...evidence };
      if (kind === 'workplan') wrong.workplanKey = 'other-workplan';
      else if (kind === 'person') wrong.personKey = 'other-person';
      else if (kind === 'year') wrong.performanceYear = 2027;
      else if (kind === 'review') wrong.quarterReviewKey = 'other-review';
      else if (kind === 'quarterItem') wrong.quarterReviewItemKey = 'other-item';
      else if (kind === 'quarter') wrong.quarter = 'Q2';
      else if (kind === 'annualItem') wrong.workplanItemKey = 'other-annual-item';
      else wrong.kpiId = 'foreign-kpi';
      renderContext({ ...context(openLifecycle), evidence: [wrong] });
      expect(section().textContent).toContain('Evidence state: None linked.');
    });
  it('retains fully associated saved progress/evidence and leaves the source unchanged', () => {
    const value = { ...context(openLifecycle), progressLedgers: [ledger], evidence: [evidence] };
    const original = JSON.stringify(value); renderContext(value);
    expect(section().textContent).toContain('Bound synthetic progress'); expect(section().textContent).toContain('Evidence state: Approved.');
    expect(JSON.stringify(value)).toBe(original);
  });
});

describe('saved progress evidence link rendering', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const renderLink = (url: string, annual = false): IQuarterReviewContext => {
    const entry: IProgressEntry = { entryKey: 'link-entry', quarterReviewKey: annual ? undefined : review.quarterReviewKey,
      quarterReviewItemKey: annual ? undefined : impact.quarterReviewItemKey, quarter: annual ? undefined : 'Q3',
      date: '2026-06-01', note: 'Saved synthetic link note', actorPersonKey: employee.personKey,
      actorEmail: employee.email, updatedAt: '2026-06-01T10:00:00.000Z', evidenceLink: url };
    const value: IQuarterReviewContext = { ...context(openLifecycle), progressLedgers: [{ id: 1, etag: '"1"',
      progressLedgerKey: 'link-ledger', workplanItemKey: impact.workplanItemKey, workplanKey: workplan.workplanKey,
      personKey: employee.personKey, performanceYear: 2026, itemType: 'LocalPersonal', entries: [entry], locked: false, rowVersionToken: 1 }] };
    const original = JSON.stringify(value);
    act(() => { ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={config} lifecycles={[openLifecycle]}
      selectedQuarter="Q3" context={value} loading={false} saving={false} nativeWritesHeld
      onSelectQuarter={async () => undefined} onPrepare={async () => undefined} onSaveItem={async () => undefined}
      onAddProgress={async () => undefined} onSubmit={async () => undefined} />, host); });
    expect(JSON.stringify(value)).toBe(original);
    return value;
  };
  const history = (): HTMLElement => host.querySelector('section[data-reporting-stream="Impact"] ol') as HTMLElement;
  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,synthetic', 'blob:https://example.invalid/synthetic',
    'file:///synthetic/path', '//example.invalid/synthetic', '/synthetic/path', 'mailto:synthetic@example.invalid',
    'https://', 'https://user:password@example.invalid/progress', 'http://user@example.invalid/progress',
    'https://example.invalid/line\nbreak', 'https://example.invalid/tab\tbreak', 'https://example.invalid/space here',
    'https:\\example.invalid\\progress', ' https://example.invalid/progress'])(
    'retains unsupported URL %s as inactive historical evidence', url => {
      const value = renderLink(url); const original = JSON.stringify(value);
      expect(history().querySelector('a')).toBeNull(); expect(history().textContent).toContain('Evidence link unavailable');
      expect(history().textContent).toContain(url); expect(history().textContent).toContain('Saved synthetic link note');
      expect(JSON.stringify(value)).toBe(original); expect(value.progressLedgers[0].entries[0].evidenceLink).toBe(url);
    });
  it.each(['https://example.invalid/progress?case=synthetic#entry', 'http://example.invalid/progress',
    'HTTPS://example.invalid/progress', 'https://example.invalid/path%20with%20spaces'])(
    'retains supported absolute HTTP(S) link %s', url => {
      const value = renderLink(url); const anchor = history().querySelector('a')!;
      expect(anchor.getAttribute('href')).toBe(url); expect(anchor.getAttribute('target')).toBe('_blank');
      expect(anchor.getAttribute('rel')).toContain('noreferrer'); expect(anchor.getAttribute('rel')).toContain('noopener');
      expect(history().textContent).not.toContain('Evidence link unavailable'); expect(value.progressLedgers[0].entries[0].evidenceLink).toBe(url);
    });
  it('applies the same inactive link rendering to retained unassigned annual notes', () => {
    renderLink('javascript:synthetic()', true);
    expect(host.textContent).toContain('Annual progress history — quarter not recorded');
    expect(history().querySelector('a')).toBeNull(); expect(history().textContent).toContain('Evidence link unavailable');
    expect(history().textContent).toContain('javascript:synthetic()');
  });
  it('keeps a note without evidence link readable without an unavailable-link warning', () => {
    renderLink(''); expect(history().querySelector('a')).toBeNull(); expect(history().textContent).toContain('Saved synthetic link note');
    expect(history().textContent).not.toContain('Evidence link unavailable');
  });
});

describe('QuarterlyReviewPage Impact lifecycle rendering', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { ReactDOM.unmountComponentAtNode(host); host.remove(); });

  const render = (lifecycle: IQuarterLifecycle): void => {
    act(() => {
      ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={config} lifecycles={[lifecycle]}
        selectedQuarter="Q3" context={context(lifecycle)} loading={false} saving={false}
        onSelectQuarter={async () => undefined} onPrepare={async () => undefined}
        onSaveItem={async () => undefined} onAddProgress={async () => undefined} onSubmit={async () => undefined} />, host);
    });
  };

  it('renders Impact separately with the exact approved annual definition and classification', () => {
    render(openLifecycle);
    const impactSection = host.querySelector('section[data-reporting-stream="Impact"]');
    expect(impactSection?.textContent).toContain('Impact KPIs');
    expect(impactSection?.textContent).toContain('separate from Core/GOLD reporting');
    expect(impactSection?.textContent).toContain('Improve synthetic delivery');
    expect(impactSection?.textContent).toContain('Reduce controlled waiting time');
    expect(impactSection?.textContent).toContain('Synthetic area');
    expect(impactSection?.textContent).toContain('Synthetic pillar');
    expect((impactSection?.querySelector('input[type="number"]') as HTMLInputElement).disabled).toBe(false);
  });

  it('makes the finalising prior quarter read-only while retaining controlled submission', () => {
    render({ ...openLifecycle, status: 'Finalising', isCurrentQuarter: false, isOpenForProgressUpdates: false });
    const impactSection = host.querySelector('section[data-reporting-stream="Impact"]') as HTMLElement;
    const editControls = Array.from(impactSection.querySelectorAll('input, textarea')) as Array<HTMLInputElement | HTMLTextAreaElement>;
    expect(editControls.length).toBeGreaterThan(0);
    expect(editControls.every(control => control.disabled)).toBe(true);
    const buttons = Array.from(host.querySelectorAll('button'));
    const save = buttons.find(button => button.textContent === 'Save update') as HTMLButtonElement;
    const submit = buttons.find(button => button.textContent === 'Submit Quarter Review') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(submit.disabled).toBe(false);
  });
});

describe('PM124 TEST quarterly hold',()=> {
 it('disables every progress/evidence/save action and preserves quarter reads and saved content',()=> {
  const host=document.createElement('div'); const mutation=jest.fn(async()=>undefined), select=jest.fn(async()=>undefined);
  act(()=>{ReactDOM.render(<QuarterlyReviewPage nativeWritesHeld workplan={workplan} config={config} lifecycles={[openLifecycle]} selectedQuarter="Q3" context={context(openLifecycle)} loading={false} saving={false} onSelectQuarter={select} onPrepare={mutation} onSaveItem={mutation} onAddProgress={mutation} onSubmit={mutation}/>,host);});
  expect(host.textContent).toContain('view-only'); expect(host.textContent).toContain('Ten synthetic cases completed'); expect(host.textContent).not.toContain('Saving…');
  const selector=host.querySelector('select') as HTMLSelectElement; expect(selector.disabled).toBe(false);
  const controls=Array.from(host.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLTextAreaElement|HTMLSelectElement>('input,button,textarea,select')).filter(control=>control!==selector);
  expect(controls.length).toBeGreaterThan(3); expect(controls.every(control=>control.disabled)).toBe(true);
  act(()=>{controls.forEach(control=>{if(control.tagName==='BUTTON')control.click();});});expect(mutation).not.toHaveBeenCalled();
  act(()=>{selector.dispatchEvent(new Event('change',{bubbles:true}));});expect(select).toHaveBeenCalledWith('Q3');
  act(()=>{ReactDOM.unmountComponentAtNode(host);});
 });
});

describe('quarter item draft retention during metadata confirmation', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const renderContext = (value?: IQuarterReviewContext, save = jest.fn(async (_item: IQuarterReviewItem) => undefined)): void => {
    act(() => { ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={config} lifecycles={[value?.lifecycle || openLifecycle]}
      selectedQuarter={value?.review?.quarter || 'Q3'} context={value} loading={false} saving={false}
      onSelectQuarter={async () => undefined} onPrepare={async () => undefined}
      onSaveItem={save} onAddProgress={async () => undefined} onSubmit={async () => undefined} />, host); });
  };
  const actual = (): HTMLInputElement => host.querySelector('section[data-reporting-stream="Impact"] input[type="number"]') as HTMLInputElement;
  const commentary = (): HTMLTextAreaElement => host.querySelector('section[data-reporting-stream="Impact"] textarea[rows="3"]') as HTMLTextAreaElement;
  const edit = (): void => {
    expect(actual().disabled).toBe(false);
    act(() => { actual().value = '12'; Simulate.change(actual()); });
    act(() => { commentary().value = 'Unsaved synthetic commentary'; Simulate.change(commentary()); });
    expect(actual().value).toBe('12'); expect(commentary().value).toBe('Unsaved synthetic commentary');
  };
  it.each(['progress', 'evidence', 'audit'] as const)('retains unsaved Actual/commentary while saved %s metadata refreshes', async kind => {
    const before = context(openLifecycle); const original = JSON.stringify(before);
    const save = jest.fn(async (_item: IQuarterReviewItem) => undefined); renderContext(before, save); edit();
    const next: IQuarterReviewContext = { ...before };
    if (kind === 'progress') next.progressLedgers = [{ id: 1, etag: '"1"', progressLedgerKey: 'synthetic-progress',
      workplanItemKey: impact.workplanItemKey, workplanKey: workplan.workplanKey, personKey: employee.personKey,
      performanceYear: 2026, itemType: 'LocalPersonal', locked: false, rowVersionToken: 1,
      entries: [{ entryKey: 'synthetic-entry', quarterReviewKey: review.quarterReviewKey,
        quarterReviewItemKey: impact.quarterReviewItemKey, quarter: 'Q3', date: '2026-06-01', note: 'Saved synthetic progress',
        actorPersonKey: employee.personKey, actorEmail: employee.email, updatedAt: '2026-06-01T10:00:00.000Z' }] }];
    else if (kind === 'evidence') next.evidence = [{ evidenceKey: 'synthetic-evidence', kind: 'Text',
      personKey: employee.personKey, workplanKey: workplan.workplanKey, workplanItemKey: impact.workplanItemKey,
      quarterReviewKey: review.quarterReviewKey, quarterReviewItemKey: impact.quarterReviewItemKey,
      performanceYear: 2026, quarter: 'Q3', description: 'Saved synthetic evidence', status: 'Draft' }];
    else next.auditEvents = [];
    renderContext(next, save);
    expect(actual().value).toBe('12'); expect(commentary().value).toBe('Unsaved synthetic commentary');
    if (kind === 'progress') expect(host.textContent).toContain('Saved synthetic progress');
    const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent === 'Save update')!;
    await act(async () => { button.click(); await Promise.resolve(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ employeeActualValue: 12, statusUpdate: 'Unsaved synthetic commentary',
      quarterReviewItemKey: impact.quarterReviewItemKey }));
    expect(JSON.stringify(before)).toBe(original); expect(before.items[0].employeeActualValue).toBe(10);
  });
  it('resets unsaved edits to a changed canonical item array', () => {
    const before = context(openLifecycle); renderContext(before); edit();
    renderContext({ ...before, items: [{ ...impact, employeeActualValue: 15, statusUpdate: 'Confirmed saved commentary' }] });
    expect(actual().value).toBe('15'); expect(commentary().value).toBe('Confirmed saved commentary');
  });
  it.each([
    ['version', { rowVersionToken: 2 }], ['state', { state: 'Locked' as const }],
    ['access', { accessState: 'RecoveryHold' as const }], ['transition', { transitionStatus: 'InProgress' as const }]
  ])('resets item edits when the canonical review %s changes with the same item array', (_label, patch) => {
    const before = context(openLifecycle); renderContext(before); edit();
    renderContext({ ...before, review: { ...review, ...patch } });
    expect(actual().value).toBe('10'); expect(commentary().value).toBe('Ten synthetic cases completed.');
  });
  it('clears item editors when the quarter context becomes unavailable', () => {
    renderContext(context(openLifecycle)); edit(); renderContext(undefined);
    expect(host.querySelector('section[data-reporting-stream="Impact"] input')).toBeNull();
    expect(host.textContent).not.toContain('Unsaved synthetic commentary');
  });
  it('uses the next quarter saved values after switching to a different valid review identity', () => {
    renderContext(context(openLifecycle)); edit();
    const quarterReviewKey = 'employee|2026|Q4';
    const next: IQuarterReviewContext = { ...context(openLifecycle),
      lifecycle: { ...openLifecycle, quarterKey: 'Q4', quarterName: 'Q4', quarterStart: '2026-08-01', quarterEnd: '2026-10-31',
        employeeSubmissionDeadline: '2026-11-07', managerReviewDeadline: '2026-11-14' },
      review: { ...review, quarter: 'Q4', quarterReviewKey },
      items: [{ ...impact, quarter: 'Q4', quarterReviewKey, quarterReviewItemKey: `${quarterReviewKey}|impact-1`,
        employeeActualValue: 18, statusUpdate: 'Saved next quarter commentary' }] };
    renderContext(next);
    expect(actual().value).toBe('18'); expect(commentary().value).toBe('Saved next quarter commentary');
    expect(host.textContent).not.toContain('Unsaved synthetic commentary');
  });
  it('resets edits and disables progress after the same review enters a read-only lifecycle window', () => {
    const before = context(openLifecycle); renderContext(before); edit();
    renderContext({ ...before, lifecycle: { ...openLifecycle, status: 'Finalising', isCurrentQuarter: false, isOpenForProgressUpdates: false } });
    expect(actual().value).toBe('10'); expect(commentary().value).toBe('Ten synthetic cases completed.');
    expect(actual().disabled).toBe(true); expect(commentary().disabled).toBe(true);
  });
});
