jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import IntegratedPerformanceHub, { CoreBuilder, type ICoreChoice } from './IntegratedPerformanceHub';
import type { IIntegratedKpi } from '../services/IntegratedReferenceData';
import type { CoreKpiRole, IBehaviourWorkplanItem, ICoreKpiCatalogueItem, IProductionPerson } from '../models/ProductionModels';
import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import type {
  IEmployeeCoreContributionInputV2, IEmployeeCoreContributionReadbackV2,
  IEmployeeV2ItemCommandContext, IEmployeeWorkplanHeaderReadbackV2, IEmployeeWorkplanReadbackV2
} from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import SharePointEmployeeWorkplanV2PersistenceService from '../services/SharePointEmployeeWorkplanV2PersistenceService';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS } from '../services/BehaviourFrameworkV2Policy';

describe('integrated Workplan Core save preflight', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });

  const button = (text: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(candidate => candidate.textContent?.trim() === text);
    if (!found) throw new Error(`Missing button ${text}`);
    return found;
  };
  const catalogue = (kpiId: string, wording = `${kpiId} current approved wording`): ICoreKpiCatalogueItem => ({
    kpiId, kpiVersionKey: `${kpiId}|v01`, targetVersionKey: `${kpiId}|2026|v01`, wording,
    pillar: 'Participation', workstream: 'Schools', scoringDirection: 'HigherIsBetter', unitLabel: 'people'
  });
  const integratedKpi = (kpiId: string): IIntegratedKpi => ({
    kpiId, wording: `${kpiId} current approved wording`, pillarCode: 'SO1', pillar: 'Participation',
    workstream: 'Schools', unit: 'people', annualTarget: 12,
    quarterTargets: [{ quarter: 'Q1', value: 3 }, { quarter: 'Q2', value: 6 },
      { quarter: 'Q3', value: 9 }, { quarter: 'Q4', value: 12 }], memberships: []
  });
  const coreItem = (kpiId: string, displayOrder: number, role?: CoreKpiRole): IEmployeeCoreContributionReadbackV2 => ({
    id: displayOrder, etag: `core-${displayOrder}`, workplanItemKey: `e|2026|CoreGold|${kpiId}`,
    naturalKey: `e|2026|CoreGold|${kpiId}`, workplanKey: 'e|2026', personKey: 'e', performanceYear: 2026,
    kpiId, kpiVersionKey: `${kpiId}|v01`, targetVersionKey: `${kpiId}|2026|v01`, workplanVersion: 1,
    employeeKpiRole: role, contributionMethod: 'AdditiveDirect', annualTargetValue: 12,
    quarterTargets: [{ quarter: 'Q1', targetValue: 3 }, { quarter: 'Q2', targetValue: 6 },
      { quarter: 'Q3', targetValue: 9 }, { quarter: 'Q4', targetValue: 12 }],
    coreWorkplanWeight: 100, displayOrder, activeInWorkplan: true, directContributionEligible: true,
    additiveApproved: true, nonOverlapRequired: false, nonOverlapApproved: true
  });
  const legacyBehaviourItem = (): IBehaviourWorkplanItem => ({
    id: 10, etag: 'behaviour-1', workplanItemKey: 'e|2026|Behaviour|BHV-01',
    naturalKey: 'e|2026|Behaviour|BHV-01', workplanKey: 'e|2026', personKey: 'e', performanceYear: 2026,
    behaviourId: 'BHV-01', behaviourVersionKey: 'BHV-01|v01', objectiveSource: 'Custom',
    selectedSuggestionKeys: [], customObjective: 'Keep the exact stored custom commitment',
    objectiveTitle: 'Keep the exact stored custom commitment',
    objectiveDescription: 'Synthetic legacy description', measure: 'Quarterly Behaviour commitment', unit: 'Rating',
    evidenceDefinition: 'Synthetic legacy evidence', q1TargetText: 'Legacy Q1', q2TargetText: 'Legacy Q2',
    q3TargetText: 'Legacy Q3', q4TargetText: 'Legacy Q4', targetRating: 3,
    q1TargetRating: 3, q2TargetRating: 3, q3TargetRating: 3, q4TargetRating: 3,
    behaviourItemWeight: 100, displayOrder: 1, activeInWorkplan: true
  });
  const legacySuggestion: IBehaviourObjectiveLibraryRecord = {
    behaviourObjectiveKey: 'BHV-01-OBJ-01', behaviourKey: 'BHV-01', objectiveTitle: 'Synthetic controlled suggestion',
    objectiveDescription: 'Synthetic suggestion description', suggestedMeasure: 'Quarterly Behaviour commitment',
    suggestedUnit: 'Rating', suggestedEvidence: 'Synthetic evidence', active: true, sortOrder: 1
  };
  const v2BehaviourItem = (): IBehaviourWorkplanItem => ({
    id: 20, etag: 'behaviour-v2-1', workplanItemKey: 'BHV2-e-2026-BHV-01',
    naturalKey: 'e|2026|BehaviourV2|BHV-01', workplanKey: 'e|2026', personKey: 'e', performanceYear: 2026,
    behaviourId: 'BHV-01', behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    behaviourSnapshotV2: { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId: 'BHV-01',
      valueTitle: 'Synthetic Value 1', corporateValue: 'Synthetic Corporate Value 1', roleTier: 'IC_OFFICER',
      descriptor: 'SYNTHETIC TEST ONLY descriptor', cadence: 'Quarterly',
      periodKeys: ['Q1', 'Q2', 'Q3', 'Q4'], ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS },
    behaviourCommitmentV2: 'Original v02 commitment',
    behaviourPeriodCommitmentsV2: { Q1: 'V02 Q1', Q2: 'V02 Q2', Q3: 'V02 Q3', Q4: 'V02 Q4' },
    selectedSuggestionKeys: [], displayOrder: 1, activeInWorkplan: true
  });

  interface IRoute {
    upsertCore: jest.Mock;
    upsertPersonal: jest.Mock;
    upsertBehaviour: jest.Mock;
    setCoreWeighting: jest.Mock;
    saveHeader: jest.Mock;
    saveCompleted: Promise<void>;
    current(): IEmployeeWorkplanReadbackV2;
  }

  const mount = async (items: IEmployeeCoreContributionReadbackV2[], currentCatalogue: ICoreKpiCatalogueItem[],
    deferredUpsert?: { promise: Promise<void>; entered?: () => void }, legacy?: {
      behaviourItems: IBehaviourWorkplanItem[]; objectives?: IBehaviourObjectiveLibraryRecord[];
    }): Promise<IRoute> => {
    const employee = { id: 1, personKey: 'e', email: 'e@example.invalid', displayName: 'Synthetic Employee', active: true, appRoles: ['Employee'] } as IProductionPerson;
    const workplan: IEmployeeWorkplanHeaderReadbackV2 = {
      id: 1, etag: 'header-1', workplanKey: 'e|2026', personKey: 'e',
      employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
      state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1,
      workplanVersion: 1, coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10
    };
    let readback: IEmployeeWorkplanReadbackV2 = {
      workplan, coreItems: items, personalItems: [], behaviourItems: legacy?.behaviourItems || [], audits: []
    };
    let revision = 1;
    const bump = (): void => {
      revision += 1;
      readback = { ...readback, workplan: { ...readback.workplan, etag: `header-${revision}`, rowVersionToken: revision, workplanVersion: revision } };
    };
    let resolveSaveCompleted: (() => void) | undefined;
    const saveCompleted = new Promise<void>(resolve => { resolveSaveCompleted = resolve; });
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'Draft', readiness: { ready: true, blockers: [] } });
    const upsertCore = jest.fn(async (_context: IEmployeeV2ItemCommandContext, input: IEmployeeCoreContributionInputV2) => {
      deferredUpsert?.entered?.();
      if (deferredUpsert) await deferredUpsert.promise;
      bump();
      readback = { ...readback, coreItems: readback.coreItems.map(item => item.kpiId === input.kpiId ? {
        ...item, employeeKpiRole: input.role, contributionMethod: input.contributionMethod,
        annualTargetValue: input.annualTargetValue, annualTargetText: input.annualTargetText,
        quarterTargets: input.quarterTargets, displayOrder: input.displayOrder, activeInWorkplan: input.activeInWorkplan,
        etag: `core-${revision}`, workplanVersion: revision
      } : item) };
      return { readback, duplicate: false };
    });
    const upsertPersonal = jest.fn();
    const upsertBehaviour = jest.fn(SharePointEmployeeWorkplanV2PersistenceService.prototype
      .upsertBehaviourCommitmentV2.bind({} as SharePointEmployeeWorkplanV2PersistenceService));
    const setCoreWeighting = jest.fn(async () => { bump(); return { readback, duplicate: false }; });
    const saveHeader = jest.fn(async () => { bump(); resolveSaveCompleted?.(); return { readback, duplicate: false }; });
    const service = {
      getBehaviourObjectiveLibrary: async () => legacy?.objectives || [], getDirectReports: async () => [],
      getCoreKpiCatalogue: async () => currentCatalogue, getPublishedBehaviours: async () => [],
      getEmployeeWorkplanV2: async () => readback, upsertCoreContributionV2: upsertCore,
      upsertPersonalItemV2: upsertPersonal, upsertBehaviourCommitmentV2: upsertBehaviour,
      setCoreWeightingV2: setCoreWeighting, saveEmployeeWorkplanDraftV2: saveHeader
    } as unknown as IProductionDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service}
      adminReportingDataService={{} as IAdminReportingControlDataService} currentUserEmail={employee.email}
      userDisplayName={employee.displayName} />, host); });
    act(() => { button('Build My Workplan').click(); });
    return { upsertCore, upsertPersonal, upsertBehaviour, setCoreWeighting, saveHeader, saveCompleted, current: () => readback };
  };

  const save = async (): Promise<void> => {
    act(() => { button('Review & Weight').click(); });
    await act(async () => { button('Save Draft').click(); });
  };
  const expectNoMutations = (route: IRoute): void => {
    [route.upsertCore, route.upsertPersonal, route.upsertBehaviour, route.setCoreWeighting, route.saveHeader]
      .forEach(mutation => expect(mutation).not.toHaveBeenCalled());
  };
  const annualContributionInput = (kpiId: string): HTMLInputElement => {
    const selectedCards = Array.from(host.querySelectorAll<HTMLElement>('[data-kpi-id]'))
      .filter(card => card.getAttribute('data-kpi-id') === kpiId && card.querySelector(`[aria-label="Edit ${kpiId}"]`));
    if (selectedCards.length !== 1) throw new Error(`Expected exactly one selected editor card for ${kpiId}; found ${selectedCards.length}.`);
    const labels = Array.from(selectedCards[0].querySelectorAll('label'))
      .filter(label => label.querySelector('span')?.textContent?.trim() === 'My annual contribution');
    if (labels.length !== 1) throw new Error(`Expected exactly one My annual contribution label for ${kpiId}; found ${labels.length}.`);
    const inputs = labels[0].querySelectorAll('input');
    if (inputs.length !== 1) throw new Error(`Expected exactly one input inside the annual contribution label for ${kpiId}; found ${inputs.length}.`);
    return inputs[0];
  };

  test('valid exact catalogue and governed role preserve the serial canonical save route', async () => {
    const route = await mount([coreItem('SO1-013', 1, 'DeliveryLead')], [catalogue('SO1-013')]);
    await save();
    expect(route.upsertCore).toHaveBeenCalledTimes(1);
    expect(route.setCoreWeighting).toHaveBeenCalledTimes(1);
    expect(route.saveHeader).toHaveBeenCalledTimes(1);
    expect(route.upsertCore.mock.invocationCallOrder[0]).toBeLessThan(route.setCoreWeighting.mock.invocationCallOrder[0]);
    expect(route.setCoreWeighting.mock.invocationCallOrder[0]).toBeLessThan(route.saveHeader.mock.invocationCallOrder[0]);
    expect(host.textContent).toContain('Draft saved and confirmed.');
  });

  test('an unchanged custom v01 commitment does not block an unrelated Core Draft save', async () => {
    const route = await mount([coreItem('SO1-013', 1, 'DeliveryLead')], [catalogue('SO1-013')], undefined,
      { behaviourItems: [legacyBehaviourItem()] });
    await save();
    expect(route.upsertCore).toHaveBeenCalledTimes(1);
    expect(route.setCoreWeighting).toHaveBeenCalledTimes(1);
    expect(route.saveHeader).toHaveBeenCalledTimes(1);
    expect(route.upsertBehaviour).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Draft saved and confirmed.');
    expect(host.textContent).not.toContain('Behaviour preflight failed');
  });

  test('a changed suggestion-only v01 edit fails closed before every command and never reports success', async () => {
    const route = await mount([coreItem('SO1-013', 1, 'DeliveryLead')], [catalogue('SO1-013')], undefined,
      { behaviourItems: [legacyBehaviourItem()], objectives: [legacySuggestion] });
    act(() => { button('Behaviours').click(); });
    expect(host.textContent).toContain('Keep the exact stored custom commitment');
    expect(host.textContent).not.toContain('KCCC-BEHAVIOUR|v02');
    act(() => { button('Choose & configure').click(); });
    const suggestion = host.querySelector<HTMLInputElement>('[data-behaviour-suggestion="BHV-01-OBJ-01"]');
    if (!suggestion) throw new Error('Expected the mounted v01 controlled suggestion.');
    act(() => { suggestion.checked = true; Simulate.change(suggestion); });
    await save();
    expectNoMutations(route);
    expect(host.textContent).toContain('Behaviour changes cannot be saved through this integrated v01 journey.');
    expect(host.textContent).toContain('Use the existing Behaviour Draft route for v01 changes.');
    expect(host.textContent).toContain('Nothing was saved by this attempt.');
    expect(host.textContent).not.toContain('Draft saved and confirmed.');
    expect(host.querySelector('h2')?.textContent).toBe('Behaviours');
  });

  test('stored v02 is read-only when current catalogue and assignment are unavailable', async () => {
    const route = await mount([coreItem('SO1-013', 1, 'DeliveryLead')], [catalogue('SO1-013')], undefined,
      { behaviourItems: [v2BehaviourItem()] });
    act(() => { button('Behaviours').click(); });
    expect(host.textContent).toContain('Behaviour commitments unavailable');
    expect(host.textContent).toContain('governed catalogue publication and exact role assignment');
    expect(host.querySelector('[data-behaviour-commitment]')).toBeNull();
    expect(host.querySelector('[data-focus-choice]')).toBeNull();
    expectNoMutations(route);
  });

  test('empty current catalogue blocks all mutations without inventing a KPI name', async () => {
    const route = await mount([coreItem('SO1-013', 1, 'DeliveryLead')], []);
    await save(); expectNoMutations(route);
    expect(host.textContent).toContain('SO1-013: cannot be matched exactly to the current approved Core KPI catalogue.');
    expect(host.textContent).not.toContain('SO1-013 current approved wording');
    expect(host.textContent).toContain('Nothing was saved by this attempt.');
  });

  test('stale exact-ID mismatch is blocked even when a different current KPI exists', async () => {
    const route = await mount([coreItem('SO1-013', 1, 'DeliveryLead')], [catalogue('SO1-015')]);
    await save(); expectNoMutations(route);
    expect(host.textContent).toContain('SO1-013: cannot be matched exactly');
    expect(host.textContent).not.toContain('SO1-015 current approved wording: cannot be matched');
  });

  test('missing role names the reliably matched KPI and focuses its correction editor', async () => {
    const route = await mount([coreItem('SO1-013', 1)], [catalogue('SO1-013', 'School participation')]);
    await save(); expectNoMutations(route);
    expect(host.textContent).toContain('SO1-013 — School participation: choose how you contribute before saving.');
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Edit SO1-013');
    act(() => { button('Review SO1-013').click(); });
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Edit SO1-013');
  });

  test('Selected search has an immediate native reverse Review route that restores and focuses the first issue', async () => {
    const route = await mount([coreItem('SO1-015', 1)], [catalogue('SO1-015', 'School participation')]);
    await save(); expectNoMutations(route);
    const selectedSearchText = Array.from(host.querySelectorAll('label span'))
      .find(candidate => candidate.textContent?.trim() === 'Search selected KPIs');
    const selectedSearchLabel = selectedSearchText?.closest('label');
    const selectedSearch = selectedSearchLabel?.querySelector<HTMLInputElement>('input[type="search"]');
    const selectedPane = selectedSearchLabel?.closest('aside');
    const selectedReview = Array.from(selectedPane?.querySelectorAll<HTMLButtonElement>('button') || [])
      .find(candidate => candidate.textContent?.trim() === 'Review SO1-015');
    expect(Array.from(host.querySelectorAll('button'))
      .filter(candidate => candidate.textContent?.trim() === 'Review SO1-015')).toHaveLength(2);
    expect(selectedReview?.type).toBe('button');
    expect(selectedReview?.className).toBeTruthy();
    expect(selectedReview?.nextElementSibling).toBe(selectedSearchLabel);
    const nativeTabStops = Array.from(host.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex="0"]'));
    expect(nativeTabStops[nativeTabStops.indexOf(selectedSearch as HTMLInputElement) - 1]).toBe(selectedReview);
    act(() => {
      if (!selectedSearch) throw new Error('Missing Selected search input.');
      selectedSearch.value = 'no matching selected KPI';
      Simulate.change(selectedSearch);
      selectedSearch.focus();
    });
    expect(host.querySelector('[aria-label="Edit SO1-015"]')).toBeNull();
    act(() => { selectedReview?.click(); });
    expect(selectedSearch?.value).toBe('');
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Edit SO1-015');
    expectNoMutations(route);
  });

  test('unsupported stored role is distinguished from an ordinary missing selection', async () => {
    const unsupported = coreItem('SO1-013', 1, 'LegacyCoordinator' as CoreKpiRole);
    const route = await mount([unsupported], [catalogue('SO1-013', 'School participation')]);
    await save(); expectNoMutations(route);
    expect(host.textContent).toContain('SO1-013 — School participation: this Workplan role is no longer supported.');
    expect(host.textContent).toContain('Contact KPI support before changing it.');
  });

  test('valid-first invalid-second preflight reports all issues in selection order before any mutation', async () => {
    const route = await mount([
      { ...coreItem('SO1-013', 1, 'DeliveryLead'), coreWorkplanWeight: 50 },
      { ...coreItem('SO1-015', 2), coreWorkplanWeight: 50 },
      { ...coreItem('SO1-017', 3, 'LegacyCoordinator' as CoreKpiRole), coreWorkplanWeight: 0 }
    ], [catalogue('SO1-013'), catalogue('SO1-015', 'Second current KPI'), catalogue('SO1-017', 'Third current KPI')]);
    await save(); expectNoMutations(route);
    const text = host.textContent || '';
    expect(text.indexOf('SO1-015 — Second current KPI')).toBeLessThan(text.indexOf('SO1-017 — Third current KPI'));
    expect(text).not.toContain('SO1-013 — SO1-013 current approved wording:');
  });

  test('unrepresented stale item remains selected and receives an honest non-opening correction route', async () => {
    const route = await mount([coreItem('NOT-IN-GOLD', 1, 'DeliveryLead')], []);
    await save(); expectNoMutations(route);
    expect(host.textContent).toContain('NOT-IN-GOLD cannot be opened in the current editor.');
    expect(host.textContent).toContain('It remains selected; contact KPI support');
    expect(Array.from(host.querySelectorAll('button')).some(candidate => candidate.textContent?.trim() === 'Review NOT-IN-GOLD')).toBe(false);
  });

  test('correction keeps session values and a governed role permits a fresh successful retry', async () => {
    const route = await mount([coreItem('SO1-013', 1)], [catalogue('SO1-013')]);
    act(() => { button('Edit').click(); });
    const annual = annualContributionInput('SO1-013');
    expect(annual.value).toBe('12');
    act(() => { annual.value = '19'; Simulate.change(annual); });
    await save(); expectNoMutations(route);
    expect(annualContributionInput('SO1-013').value).toBe('19');
    act(() => { button('I DELIVER THIS').click(); });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(annualContributionInput('SO1-013').value).toBe('19');
    await save();
    expect(route.upsertCore).toHaveBeenCalledTimes(1);
    expect(route.upsertCore.mock.calls[0][1]).toMatchObject({ role: 'DeliveryLead', annualTargetValue: 19 });
    expect(route.current().coreItems[0]).toMatchObject({ employeeKpiRole: 'DeliveryLead', annualTargetValue: 19 });
    expect(host.textContent).toContain('Draft saved and confirmed.');
  });

  test('a handled correction stays consumed through continuous edits and a full journey remount until explicit review', async () => {
    const route = await mount([coreItem('SO1-013', 1)], [catalogue('SO1-013')]);
    await save(); expectNoMutations(route);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Edit SO1-013');
    act(() => { button('Review SO1-013').click(); });
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Edit SO1-013');
    const annual = annualContributionInput('SO1-013');
    act(() => { annual.focus(); annual.value = '123'; Simulate.change(annual); });
    expect(document.activeElement).toBe(annual);
    expect(annualContributionInput('SO1-013').value).toBe('123');
    act(() => { annual.value = '1234'; Simulate.change(annual); });
    expect(document.activeElement).toBe(annual);
    expect(annualContributionInput('SO1-013').value).toBe('1234');
    act(() => { button('Done editing (not saved)').click(); });
    expect(host.querySelector('[aria-label="Edit SO1-013"]')).toBeNull();
    act(() => { button('IMPACT KPIs').click(); });
    act(() => { button('Core KPIs').click(); });
    expect(host.querySelector('[aria-label="Edit SO1-013"]')).toBeNull();
    act(() => { button('Edit').click(); });
    expect(annualContributionInput('SO1-013').value).toBe('1234');
  });

  test('an unrepresented correction waits for representation and only a new sequence refocuses it', () => {
    const handled = jest.fn();
    const onChange = jest.fn();
    const request = { kpiId: 'SEC-B', sequence: 1 };
    const choice: ICoreChoice = { kpiId: 'SEC-B', weight: 100, annualContribution: '12' };
    const render = (selections: ICoreChoice[], correctionRequest: { kpiId: string; sequence: number }): void => {
      act(() => { ReactDOM.render(<CoreBuilder kpis={[integratedKpi('SEC-B')]} selections={selections}
        onChange={onChange} correctionRequest={correctionRequest} onCorrectionRequestHandled={handled} />, host); });
    };
    render([], request);
    expect(handled).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Edit SEC-B"]')).toBeNull();
    render([choice], request);
    expect(handled).toHaveBeenCalledTimes(1);
    expect(handled).toHaveBeenLastCalledWith(request);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Edit SEC-B');
    const annual = annualContributionInput('SEC-B');
    act(() => { annual.focus(); });
    render([{ ...choice, annualContribution: '123' }], request);
    expect(handled).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(annual);
    const repeated = { kpiId: 'SEC-B', sequence: 2 };
    render([{ ...choice, annualContribution: '123' }], repeated);
    expect(handled).toHaveBeenCalledTimes(2);
    expect(handled).toHaveBeenLastCalledWith(repeated);
    expect((document.activeElement as HTMLElement).getAttribute('aria-label')).toBe('Edit SEC-B');
  });

  test('a second press while the first valid save is pending does not start another mutation pipeline', async () => {
    let release: (() => void) | undefined;
    let signalEntered: (() => void) | undefined;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { signalEntered = resolve; });
    const route = await mount([coreItem('SO1-013', 1, 'DeliveryLead')], [catalogue('SO1-013')],
      { promise: pending, entered: () => signalEntered?.() });
    act(() => { button('Review & Weight').click(); });
    try {
      await act(async () => { button('Save Draft').click(); await entered; });
      const pendingButton = button('Saving…');
      expect(pendingButton.disabled).toBe(true);
      act(() => { pendingButton.click(); });
      expect(route.upsertCore).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => { release?.(); await pending; await route.saveCompleted; });
    }
    expect(route.saveHeader).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Draft saved and confirmed.');
  });
});
