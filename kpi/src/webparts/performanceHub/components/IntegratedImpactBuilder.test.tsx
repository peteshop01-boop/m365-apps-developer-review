/* eslint-disable @rushstack/pair-react-dom-render-unmount -- all mounted hosts unmounted in afterEach */
jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import IntegratedPerformanceHub, { PersonalBuilder, ReviewWeights } from './IntegratedPerformanceHub';
import { readImpactDraft } from '../services/IntegratedImpactDraftMapping';
import type { IPersonalWorkplanItem, IProductionPerson, IAnnualWorkplan } from '../models/ProductionModels';
import type { IEmployeeWorkplanReadbackV2, IEmployeePersonalItemInputV2, IEmployeeV2ItemCommandContext } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
const row: IPersonalWorkplanItem = { id: 9, etag: 'one', workplanItemKey: 'personal-1', naturalKey: 'e|2027|LocalPersonal|personal-1', workplanKey: 'e|2027', personKey: 'e', performanceYear: 2027,
  wording: 'Reduce waiting', description: 'Old evidence retained', measure: 'Agreed rate', measureType: 'Percentage', scoringDirection: 'LowerIsBetter', baselineValue: 0.8, percentageSourceScale: 'Fraction',
  unitLabel: 'proportion', yearEndTargetValue: 0.4, q1TargetValue: 0.7, q2TargetValue: 0.6, q3TargetValue: 0.5, q4TargetValue: 0.4, personalItemWeight: 100, displayOrder: 0, activeInWorkplan: true };
describe('IMPACT integrated builder and actual save route', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });
  const button = (text: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === text);
    if (!found) throw new Error('Missing button '+text); return found;
  };
  test('actual builder labels and adjacent help cover every field without false Saved wording', () => {
    const change = jest.fn(); act(() => { ReactDOM.render(<PersonalBuilder items={[readImpactDraft(Object.freeze(row))]} onChange={change} />, host); });
    act(() => { button('Edit').click(); });
    expect(host.textContent).toContain('Your measurable contribution through your role during this performance year.');
    expect(host.textContent).toContain('Old evidence retained'); expect(host.textContent).toContain('Done editing (not saved)');
    host.querySelectorAll('input, select, textarea').forEach(field => expect(field.parentElement?.querySelector('[aria-controls]')).not.toBeNull());
    const controls = Array.from(host.querySelectorAll('[aria-controls]')).map(c => c.getAttribute('aria-controls')); expect(new Set(controls).size).toBe(controls.length);
    const quarter = host.querySelector('#impact-personal-1-Q1') as HTMLInputElement; expect(quarter.max).toBe('1'); expect(quarter.value).toBe('0.7');
    act(() => { (host.querySelector('[aria-label="Help: Q1 target"]') as HTMLButtonElement).click(); });
    expect(host.textContent).toContain('31 March 2027 deadline is in Q2'); expect(change).not.toHaveBeenCalled();
  });
  test('help on actual IMPACT weight controls leaves weights unchanged', () => {
    const change = jest.fn(); act(() => { ReactDOM.render(<ReviewWeights core={[]} personal={[readImpactDraft(row)]} behaviours={[]} onCore={() => undefined} onPersonal={change} onBehaviours={() => undefined} saving={false} message="" onSave={async () => undefined} onSubmit={async () => undefined} />, host); });
    const section = Array.from(host.querySelectorAll('section')).find(s => s.querySelector('h3')?.textContent === 'IMPACT') as HTMLElement;
    const custom = Array.from(section.querySelectorAll('button')).find(b => b.textContent === 'Custom') as HTMLButtonElement;
    act(() => { custom.click(); });
    const help = section.querySelector('[aria-label="Help: IMPACT item 1 planning weight"]') as HTMLButtonElement;
    act(() => { help.click(); }); expect(change).not.toHaveBeenCalled(); expect((section.querySelector('input') as HTMLInputElement).value).toBe('100');
  });
  test('actual canonical readback -> editor -> active upsert -> rehydration and deactivate preserve metadata and ETag', async () => {
    const employee = { id: 1, personKey: 'e', email: 'e@example.invalid', displayName: 'Synthetic', active: true, appRoles: ['Employee'] } as IProductionPerson;
    const workplan = { id: 1, etag: 'header1', workplanKey: 'e|2027', personKey: 'e', performanceYear: 2027, state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1, coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 } as IAnnualWorkplan;
    let readback = { workplan, coreItems: [], personalItems: [{ ...row }], behaviourItems: [], audits: [] } as unknown as IEmployeeWorkplanReadbackV2;
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'Draft', readiness: { ready: true, blockers: [] } });
    const upsert = jest.fn(async (context: IEmployeeV2ItemCommandContext, input: IEmployeePersonalItemInputV2) => {
      expect(context.subjectKey).toBe(row.workplanItemKey); expect(context.expectedItemEtag).toBe(readback.personalItems[0].etag);
      readback = { ...readback, personalItems: [{ ...readback.personalItems[0], ...input, etag: input.activeInWorkplan ? 'two' : 'three' }] };
      return { readback, duplicate: false };
    });
    const service = { getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [], getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getEmployeeWorkplanV2: async () => readback, upsertPersonalItemV2: upsert, setCoreWeightingV2: async () => ({ readback }), saveEmployeeWorkplanDraftV2: async () => ({ readback }) } as unknown as IProductionDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service} adminReportingDataService={{} as IAdminReportingControlDataService} currentUserEmail={employee.email} userDisplayName="Synthetic" />, host); });
    act(() => { button('Build My Workplan').click(); });
    act(() => { button('IMPACT KPIs').click(); });
    act(() => { button('Edit').click(); });
    const wording = host.querySelector('textarea[id$="-wording"]') as HTMLTextAreaElement;
    act(() => { wording.value = 'Changed role contribution'; Simulate.change(wording); });
    act(() => { button('Review & Weight').click(); });
    await act(async () => { button('Save Draft').click(); });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][1]).toMatchObject({ wording: 'Changed role contribution', description: row.description, measure: row.measure, measureType: 'Percentage', scoringDirection: 'LowerIsBetter', baselineValue: 0.8, percentageSourceScale: 'Fraction', unitLabel: 'proportion', q1TargetValue: 0.7, displayOrder: 0 });
    act(() => { button('IMPACT KPIs').click(); }); expect(host.textContent).toContain('Changed role contribution'); expect(host.textContent).toContain('Progress increases as the result falls'); expect(host.textContent).not.toContain('LowerIsBetter');
    act(() => { button('Edit').click(); }); act(() => { button('Remove').click(); }); act(() => { button('Review & Weight').click(); });
    await act(async () => { button('Save Draft').click(); });
    expect(upsert).toHaveBeenCalledTimes(2); expect(upsert.mock.calls[1][1]).toMatchObject({ activeInWorkplan: false, scoringDirection: 'LowerIsBetter', baselineValue: 0.8, percentageSourceScale: 'Fraction', description: row.description });
    expect(readback.personalItems[0].id).toBe(row.id); expect(readback.personalItems[0].naturalKey).toBe(row.naturalKey);
  });
  const singleStatement = (): HTMLTextAreaElement => {
    const fields = host.querySelectorAll('textarea'); expect(fields).toHaveLength(1);
    const statement = fields[0] as HTMLTextAreaElement;
    expect(host.querySelector(`label[for="${statement.id}"]`)?.textContent).toBe('IMPACT KPI and annual success target');
    expect(statement.required).toBe(true); expect(statement.hasAttribute('maxlength')).toBe(false);
    expect(host.querySelector('textarea[id$="-success"], input[id$="-success"]')).toBeNull();
    return statement;
  };
  const setImpactField = (selector: string, value: string): void => {
    const field = host.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    expect(field).not.toBeNull(); act(() => { field.value = value; Simulate.change(field); });
  };
  const mountCanonical = async (initial?: IPersonalWorkplanItem): Promise<{ upsert: jest.Mock; current: () => IEmployeeWorkplanReadbackV2 }> => {
    const employee = { id: 1, personKey: 'e', email: 'e@example.invalid', displayName: 'Synthetic', active: true, appRoles: ['Employee'] } as IProductionPerson;
    const workplan = { id: 1, etag: 'header1', workplanKey: 'e|2027', personKey: 'e', performanceYear: 2027, state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1, coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 } as IAnnualWorkplan;
    let readback = { workplan, coreItems: [], personalItems: initial ? [Object.freeze({ ...initial })] : [], behaviourItems: [], audits: [] } as unknown as IEmployeeWorkplanReadbackV2;
    let revision = 0;
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'Draft', readiness: { ready: true, blockers: [] } });
    const upsert = jest.fn(async (context: IEmployeeV2ItemCommandContext, input: IEmployeePersonalItemInputV2) => {
      const saved = readback.personalItems[0];
      if (saved) { expect(context.subjectKey).toBe(saved.workplanItemKey); expect(context.expectedItemEtag).toBe(saved.etag); }
      revision += 1;
      readback = { ...readback, personalItems: [{ ...row, ...input, workplanItemKey: context.subjectKey, naturalKey: `e|2027|LocalPersonal|${context.subjectKey}`, etag: `revision-${revision}` }] };
      return { readback, duplicate: false };
    });
    const service = { getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [], getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getEmployeeWorkplanV2: async () => readback, upsertPersonalItemV2: upsert, setCoreWeightingV2: async () => ({ readback }), saveEmployeeWorkplanDraftV2: async () => ({ readback }) } as unknown as IProductionDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service} adminReportingDataService={{} as IAdminReportingControlDataService} currentUserEmail={employee.email} userDisplayName="Synthetic" />, host); });
    act(() => { button('Build My Workplan').click(); }); act(() => { button('IMPACT KPIs').click(); });
    return { upsert, current: () => readback };
  };
  test.each([
    ['different', '  Earlier evidence\nRetain exact spacing  '],
    ['identical', row.wording]
  ])('one statement preserves %s legacy description through untouched save, edit, help and deactivate', async (_label, description) => {
    const initial = Object.freeze({ ...row, description }); const before = JSON.stringify(initial);
    const route = await mountCanonical(initial);
    act(() => { button('Edit').click(); }); expect(singleStatement().value).toBe(row.wording);
    const legacy = (): string | null | undefined => host.querySelector('[id$="-legacy-description"]')?.textContent;
    expect(legacy()).toBe(description); expect(host.textContent).toContain('Previously saved description / evidence');
    // Choose the labelled legacy help rather than assuming which field owns the first Help button.
    const legacyHelp = host.querySelector('[aria-label="Help: Previously saved description / evidence"]') as HTMLButtonElement;
    act(() => { legacyHelp.click(); }); expect(host.textContent).toContain('read-only');
    act(() => { button('Close').click(); }); expect(document.activeElement).toBe(legacyHelp);
    expect(route.upsert).not.toHaveBeenCalled(); expect(legacy()).toBe(description); expect(singleStatement().value).toBe(row.wording);
    act(() => { button('Done editing (not saved)').click(); }); act(() => { button('Edit').click(); }); expect(singleStatement().value).toBe(row.wording);
    act(() => { button('Review & Weight').click(); }); await act(async () => { button('Save Draft').click(); });
    expect(route.upsert).toHaveBeenCalledTimes(1); expect(route.upsert.mock.calls[0][1].wording).toBe(row.wording); expect(route.upsert.mock.calls[0][1].description).toBe(description);
    act(() => { button('IMPACT KPIs').click(); }); act(() => { button('Edit').click(); });
    const changed = 'Reduce waiting to 40% by 31 October 2027'; setImpactField('textarea[id$="-wording"]', changed);
    expect(legacy()).toBe(description); expect(singleStatement().value).toBe(changed);
    act(() => { button('Review & Weight').click(); }); await act(async () => { button('Save Draft').click(); });
    expect(route.upsert).toHaveBeenCalledTimes(2); expect(route.upsert.mock.calls[1][1]).toMatchObject({ wording: changed, description, measure: row.measure, baselineValue: 0.8, percentageSourceScale: 'Fraction', scoringDirection: 'LowerIsBetter' });
    act(() => { button('IMPACT KPIs').click(); }); act(() => { button('Edit').click(); }); expect(singleStatement().value).toBe(changed); expect(legacy()).toBe(description);
    act(() => { button('Remove').click(); }); act(() => { button('Review & Weight').click(); }); await act(async () => { button('Save Draft').click(); });
    expect(route.upsert).toHaveBeenCalledTimes(3); expect(route.upsert.mock.calls[2][1]).toMatchObject({ activeInWorkplan: false, wording: changed, description });
    expect(route.current().personalItems[0].description).toBe(description); expect(route.current().personalItems[0].naturalKey).toBe(row.naturalKey); expect(JSON.stringify(initial)).toBe(before);
  });
  test.each(['Number / Quantity', 'Milestone / Completion'])('new %s item needs no duplicate entry and saves the existing wording fallback', async measure => {
    const route = await mountCanonical(); act(() => { button('Create IMPACT KPI').click(); });
    const statement = singleStatement(); expect(statement.value).toBe(''); expect(statement.validity.valueMissing).toBe(true);
    expect(host.querySelector('[id$="-legacy-description"]')).toBeNull();
    setImpactField('select[id$="-measure"]', measure); expect(singleStatement()).toBeDefined();
    const wording = measure === 'Number / Quantity' ? 'Increase participating schools to 20 by 31 October 2027' : 'Year 2 of 3: complete delivery plan and obtain approval by 31 March 2027';
    setImpactField('textarea[id$="-wording"]', wording);
    const statementHelp = host.querySelector('[aria-label="Help: IMPACT KPI and annual success target"]') as HTMLButtonElement;
    act(() => { statementHelp.click(); }); expect(host.textContent).toContain('single statement'); expect(host.textContent).toContain('multiyear');
    act(() => { button('Close').click(); }); expect(document.activeElement).toBe(statementHelp); expect(singleStatement().value).toBe(wording);
    if (measure === 'Number / Quantity') setImpactField('input[id$="-unit"]', 'schools');
    const target = measure === 'Number / Quantity' ? '20' : 'Approved delivery plan';
    setImpactField('input[id$="-annual"]', target); ['Q1', 'Q2', 'Q3', 'Q4'].forEach(q => setImpactField(`input[id$="-${q}"]`, target));
    act(() => { button('Done editing (not saved)').click(); }); expect(route.upsert).not.toHaveBeenCalled();
    act(() => { button('Review & Weight').click(); }); await act(async () => { button('Save Draft').click(); });
    expect(route.upsert).toHaveBeenCalledTimes(1); const input = route.upsert.mock.calls[0][1]; expect(input.wording).toBe(wording); expect(input.description).toBe(wording);
    if (measure === 'Number / Quantity') expect(input).toMatchObject({ yearEndTargetValue: 20, q1TargetValue: 20, unitLabel: 'schools' });
    else expect(input).toMatchObject({ yearEndTargetText: target, q1TargetText: target, measureType: 'Milestone' });
    act(() => { button('IMPACT KPIs').click(); }); act(() => { button('Edit').click(); });
    expect(singleStatement().value).toBe(wording); expect(host.querySelector('[id$="-legacy-description"]')?.textContent).toBe(wording);
  });
});
