jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMServer from 'react-dom/server';
import { act } from 'react-dom/test-utils';
import IntegratedPerformanceHub, { CoreBuilder, ReviewWeights, type IBehaviourChoice, type ICoreChoice } from './IntegratedPerformanceHub';
import type { IIntegratedKpi } from '../services/IntegratedReferenceData';

const realKpi: IIntegratedKpi = {
  kpiId: 'SO1-001', wording: 'Increase participation in cricket', pillarCode: 'S01',
  pillar: 'SO1 Participation', workstream: 'Schools', unit: 'schools', annualTarget: 200,
  quarterTargets: [{ quarter: 'Q1', value: 50 }, { quarter: 'Q2', value: 50 },
    { quarter: 'Q3', value: 50 }, { quarter: 'Q4', value: 50 }], memberships: []
};

describe('KCF-KPI-026-R1 focused integrated repair', () => {
  it('adds the canonical KPI, updates the selected count, removes it from available, then edits and removes it', () => {
    const host = document.createElement('div');
    const Wrapper: React.FC = () => {
      const [selections, setSelections] = React.useState<ICoreChoice[]>([]);
      return <CoreBuilder kpis={[realKpi]} selections={selections} onChange={setSelections} />;
    };
    act(() => { ReactDOM.render(<Wrapper />, host); });
    const button = (label: string): HTMLButtonElement => Array.from(host.querySelectorAll('button'))
      .find(item => item.textContent?.trim() === label) as HTMLButtonElement;
    expect(host.textContent).toContain('1 available');
    expect(host.textContent).toContain('Selected 0 of 109');
    act(() => { button('Add').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.textContent).toContain('0 available');
    expect(host.textContent).toContain('Selected 1 of 109');
    expect(host.textContent).toContain('SO1-001');
    act(() => { button('Edit').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.textContent).toContain('Remove from Workplan');
    act(() => { button('Remove from Workplan').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.textContent).toContain('1 available');
    expect(host.textContent).toContain('Selected 0 of 109');
    act(() => { ReactDOM.unmountComponentAtNode(host); });
  });

  it('does not turn five empty Behaviour placeholders into 100% or Ready', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<ReviewWeights
      core={[]} personal={[]} behaviours={['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'].map(behaviourId => ({
        behaviourId, selectedSuggestionKeys: [], commitment: '', q1: '', q2: '', q3: '', q4: '', h1: '', h2: ''
      }))}
      onCore={() => undefined} onPersonal={() => undefined} onBehaviours={() => undefined}
      saving={false} message="" onSave={async () => undefined} onSubmit={async () => undefined}
    />);
    expect(html).toContain('Not ready');
    expect(html).toContain('Behaviours');
    expect(html).toContain('No items');
    expect(html).not.toContain('Ready to submit');
  });

  it('keeps stored v01 Behaviour item weights available in Review & Weight', () => {
    const host = document.createElement('div');
    const Wrapper: React.FC = () => {
      const [behaviours, setBehaviours] = React.useState<IBehaviourChoice[]>(['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'].map((behaviourId, index) => ({
        behaviourId, selectedSuggestionKeys: [], commitment: `Legacy custom ${index + 1}`,
        customObjective: `Legacy custom ${index + 1}`, q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4', h1: '', h2: '',
        targetRating: 3 as const, weight: [10, 15, 20, 25, 30][index]
      })));
      return <ReviewWeights core={[]} personal={[]} behaviours={behaviours}
        onCore={() => undefined} onPersonal={() => undefined} onBehaviours={setBehaviours}
        behaviourV2={false} saving={false} message="" onSave={async () => undefined} onSubmit={async () => undefined} />;
    };
    act(() => { ReactDOM.render(<Wrapper />, host); });
    const behaviourBlock = Array.from(host.querySelectorAll('section'))
      .find(section => section.querySelector('h3')?.textContent === 'Behaviours');
    if (!behaviourBlock) throw new Error('Expected the v01 Behaviour weight editor.');
    const custom = Array.from(behaviourBlock.querySelectorAll('button'))
      .find(item => item.textContent?.trim() === 'Custom') as HTMLButtonElement | undefined;
    if (!custom) throw new Error('Expected the v01 Behaviour custom-weight control.');
    act(() => { custom.click(); });
    expect(Array.from(behaviourBlock.querySelectorAll<HTMLInputElement>('input')).map(input => input.value))
      .toEqual(['10', '15', '20', '25', '30']);
    expect(behaviourBlock.textContent).not.toContain('No item weight');
    act(() => { ReactDOM.unmountComponentAtNode(host); });
  });
});

it('PM124 keeps Save and Submit visibly disabled under TEST hold without a false Saving label',()=>{
 const host=document.createElement('div');act(()=>{ReactDOM.render(<ReviewWeights nativeWritesHeld core={[]} personal={[]} behaviours={[]} onCore={()=>undefined} onPersonal={()=>undefined} onBehaviours={()=>undefined} saving={false} message="" onSave={async()=>undefined} onSubmit={async()=>undefined}/>,host);});
 for(const label of ['Save Draft','Submit Workplan']){const button=Array.from(host.querySelectorAll('button')).find(candidate=>candidate.textContent===label)!;expect(button.disabled).toBe(true);}
 expect(host.textContent).not.toContain('Saving…');act(()=>{ ReactDOM.unmountComponentAtNode(host); });
});

import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IAnnualWorkplan, IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import type { IQuarterDraftSource } from '../services/QuarterReviewFactory';
import type { IQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';

describe('PM124 A004 actual Hub quarterly TEST hold wiring', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove();
    jest.useRealTimers(); jest.clearAllMocks();
  });
  it.each([
    { held: true, prepared: true }, { held: false, prepared: true },
    { held: true, prepared: false }, { held: false, prepared: false }
  ])('renders actual quarterly mutation controls with held=$held prepared=$prepared and preserves reads/navigation', async ({ held, prepared }) => {
    const employee: IProductionPerson = { id: 1, personKey: 'synthetic-employee', displayName: 'Synthetic Employee',
      email: 'employee@example.invalid', active: true, appRoles: ['Employee'] };
    const manager: IProductionPerson = { id: 2, personKey: 'synthetic-manager', displayName: 'Synthetic Manager',
      email: 'manager@example.invalid', active: true, appRoles: ['Employee', 'Manager'] };
    const config: IProductionConfig = { performanceYear: '2025/26', performanceYearNumber: 2026,
      performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31',
      quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' },
      weights: { core: 70, personal: 30, behaviours: 0 }, rag: { greenThreshold: 90, amberThreshold: 50 },
      aggregationMethods: [], retentionStatus: 'TBC' };
    const workplan: IAnnualWorkplan = { id: 1, etag: '"1"', workplanKey: 'synthetic-employee|2026',
      personKey: employee.personKey, employeeDisplayName: employee.displayName, employeeEmail: employee.email,
      performanceYear: 2026, managerPersonKey: manager.personKey, managerDisplayName: manager.displayName,
      managerEmail: manager.email, state: 'Approved', accessState: 'ReadOnly', transitionStatus: 'Ready',
      rowVersionToken: 1, transitionCorrelationKey: 'approved-source', coreCategoryWeight: 70,
      personalCategoryWeight: 30, behaviourCategoryWeight: 0 };
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, config,
      workplanStatus: 'Approved', readiness: { ready: true, blockers: [] } });
    let latest: IQuarterReviewContext;
    const quarterRead = jest.fn(async (source: IQuarterDraftSource): Promise<IQuarterReviewContext> => {
      const quarter = source.lifecycle.quarterKey;
      const review = { id: 1, etag: '"1"', quarterReviewKey: 'synthetic-employee|2026|' + quarter,
        workplanKey: workplan.workplanKey, personKey: employee.personKey, employeeDisplayName: employee.displayName,
        employeeEmail: employee.email, performanceYear: 2026, quarter, managerPersonKey: manager.personKey,
        managerDisplayName: manager.displayName, managerEmail: manager.email, state: 'Draft' as const,
        accessState: 'EmployeeEdit' as const, transitionStatus: 'Ready' as const, rowVersionToken: 1 };
      const item: IQuarterReviewItem = { id: 1, etag: '"1"', quarterReviewItemKey: review.quarterReviewKey + '|impact',
        quarterReviewKey: review.quarterReviewKey, workplanItemKey: 'impact', workplanKey: workplan.workplanKey,
        personKey: employee.personKey, performanceYear: 2026, quarter, itemType: 'LocalPersonal', reportingStream: 'Impact',
        wording: 'Synthetic saved delivery result', metricType: 'Count', scoringDirection: 'HigherIsBetter',
        yearEndTargetValueSnapshot: 40, quarterTargetValue: 10, employeeActualValue: 10, progressPct: 100,
        scoredProgressPct: 100, calculatedRag: 'Green', statusUpdate: 'Saved source commentary', evidenceCount: 0,
        workplanItemWeightSnapshot: 100, managerApproved: false, locked: false };
      latest = { lifecycle: source.lifecycle, review, employee, manager, coreCatalogue: [], behaviours: [],
        items: [item], progressLedgers: [], evidence: [], readiness: { ready: true, blockers: [], warnings: [],
          coreComplete: 0, personalComplete: 1, behavioursComplete: 0 }, dataFoundationReady: true, messages: [] };
      return prepared ? latest : { ...latest, review: undefined, items: [] } as unknown as IQuarterReviewContext;
    });
    const canonicalQuarterRead = jest.fn(async () => ({ review: latest.review, items: latest.items, evidence: [], audits: [] }));
    const nativeMutation = jest.fn(async (): Promise<never> => { throw new Error('UNEXPECTED_NATIVE_MUTATION'); });
    const service = { getBehaviourObjectiveLibrary: async () => [], getCoreKpiCatalogue: async () => [],
      getPublishedBehaviours: async () => [], getEmployeeWorkplanV2: async () => ({ workplan,
        coreItems: [], personalItems: [], behaviourItems: [], audits: [] }),
      getQuarterTimingConfig: async () => ({ earlyReviewReminderDays: 30, preparationReminderDays: 14,
        finalReminderDays: 7, employeeSubmissionDays: 7, managerReviewDays: 7 }),
      getQuarterReviewContext: quarterRead, getEmployeeQuarterV2: canonicalQuarterRead,
      prepareQuarterReview: nativeMutation, saveEmployeeQuarterUpdateV2: nativeMutation,
      registerEmployeeQuarterEvidenceV2: nativeMutation, saveProgressEntry: nativeMutation,
      submitEmployeeQuarterV2: nativeMutation } as unknown as IProductionDataService;
    const adminService: IAdminReportingControlDataService = {
      getAdminReportingControlSnapshot: async () => { throw new Error('No synthetic reporting fixture'); }
    };
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub nativeWritesHeld={held}
      dataService={service} adminReportingDataService={adminService} currentUserEmail={employee.email}
      userDisplayName={employee.displayName} />, host); });
    const navigation = Array.from(host.querySelectorAll<HTMLButtonElement>('aside button'))
      .find(button => button.textContent === 'My Workplan')!;
    expect(navigation.disabled).toBe(false);
    await act(async () => { navigation.click(); });
    const page = host.querySelector<HTMLElement>('section[aria-labelledby="quarter-review-heading"]')!;
    expect(page).toBeTruthy(); expect(page.textContent).toContain(prepared ? 'Saved source commentary' : 'Quarter Review not yet prepared');
    expect(page.textContent).not.toContain('Saving…');
    const selector = page.querySelector<HTMLSelectElement>('select')!;
    expect(selector.disabled).toBe(false);
    const save = Array.from(page.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => prepared ? button.textContent === 'Save update' : button.textContent?.startsWith('Prepare '))!;
    expect(save).toBeTruthy(); expect(save.disabled).toBe(held);
    if (held) {
      const mutationControls = Array.from(page.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLButtonElement>('input,textarea,select,button'))
        .filter(control => control !== selector);
      expect(mutationControls.length).toBeGreaterThan(prepared ? 3 : 0);
      expect(mutationControls.every(control => control.disabled)).toBe(true);
      await act(async () => { mutationControls.filter(control => control.tagName === 'BUTTON').forEach(control => control.click()); });
      expect(page.textContent).toContain('KCF TEST view-only');
    }
    const priorReadCount = quarterRead.mock.calls.length;
    await act(async () => { selector.value = 'Q2'; selector.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(quarterRead.mock.calls.length).toBeGreaterThan(priorReadCount);
    if (prepared) expect(canonicalQuarterRead).toHaveBeenCalled();
    else expect(canonicalQuarterRead).not.toHaveBeenCalled();
    expect(nativeMutation).not.toHaveBeenCalled();
    const home = Array.from(host.querySelectorAll<HTMLButtonElement>('aside button')).find(button => button.textContent === 'Employee')!;
    expect(home.disabled).toBe(false); act(() => { home.click(); });
    expect(host.textContent).toContain('Welcome back');
    if (held) {
      const buildNav = Array.from(host.querySelectorAll<HTMLButtonElement>('aside button'))
        .find(button => button.textContent === 'Build My Workplan')!;
      await act(async () => { buildNav.click(); });
      const warning = host.querySelector<HTMLElement>('[data-unsaveable-workplan="true"]');
      expect(warning?.textContent).toContain('Nothing entered here can be saved');
      const editor = host.querySelector<HTMLFieldSetElement>('fieldset[aria-label="Workplan editable fields"]');
      expect(editor?.disabled).toBe(true);
      const add = Array.from(editor!.querySelectorAll<HTMLButtonElement>('button'))
        .find(button => button.getAttribute('aria-label')?.startsWith('Add '));
      if (add) expect(add.matches(':disabled')).toBe(true);
      const impactTab = Array.from(host.querySelectorAll<HTMLButtonElement>('nav[aria-label="Build My Workplan steps"] button'))
        .find(button => button.textContent === 'IMPACT KPIs')!;
      expect(impactTab.disabled).toBe(false);
      await act(async () => { impactTab.click(); });
      expect(host.querySelector<HTMLFieldSetElement>('fieldset[aria-label="Workplan editable fields"]')?.disabled).toBe(true);
    }
  });
});
