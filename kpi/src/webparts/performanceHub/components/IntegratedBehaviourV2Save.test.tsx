jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION } from '../models/BehaviourFrameworkV2Models';
import type { IBehaviourWorkplanItem, ICoreKpiCatalogueItem, IProductionPerson } from '../models/ProductionModels';
import type { IEmployeeBehaviourCommitmentInputV2, IEmployeeCoreContributionReadbackV2,
  IEmployeeV2ItemCommandContext, IEmployeeWorkplanHeaderReadbackV2,
  IEmployeeWorkplanReadbackV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import { BEHAVIOUR_V2_RATING_OPTIONS } from '../services/BehaviourFrameworkV2Policy';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { behaviourFrameworkV2TestCatalogue as focusCatalogue } from '../testing/BehaviourFrameworkV2TestData';
import { BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, encodeBehaviourSelectionSnapshotsV2,
  type BehaviourSelectionSnapshotV2, type IBehaviourSelectionSnapshotEnvelopeV2 } from '../services/BehaviourSelectionSnapshotsV2';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';

const valueIds = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const;
const employee: IProductionPerson = {
  id: 1, personKey: 'PERSON-001', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
  managerPersonKey: 'PERSON-002', managerEmail: 'manager@example.invalid', appRoles: ['Employee'], active: true,
  behaviourFrameworkVersionV2: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  behaviourRoleTierV2: 'IC_OFFICER', behaviourCadenceV2: 'Quarterly'
};
const manager: IProductionPerson = { id: 2, personKey: 'PERSON-002', displayName: 'Synthetic Manager',
  email: 'manager@example.invalid', appRoles: ['Employee', 'Manager'], active: true };
const catalogue: ICoreKpiCatalogueItem = {
  kpiId: 'SO1-013', kpiVersionKey: 'SO1-013|v01', targetVersionKey: 'SO1-013|2027|v01',
  wording: 'Synthetic Core KPI', pillar: 'Participation', workstream: 'Schools',
  scoringDirection: 'HigherIsBetter', unitLabel: 'people'
};
const core: IEmployeeCoreContributionReadbackV2 = {
  id: 1, etag: '"core-1"', workplanItemKey: 'PERSON-001|2027|CoreGold|SO1-013',
  naturalKey: 'PERSON-001|2027|CoreGold|SO1-013', workplanKey: 'PERSON-001|2027', personKey: employee.personKey,
  performanceYear: 2027, kpiId: catalogue.kpiId, kpiVersionKey: catalogue.kpiVersionKey,
  targetVersionKey: catalogue.targetVersionKey, workplanVersion: 1, employeeKpiRole: 'DeliveryLead',
  contributionMethod: 'AdditiveDirect', annualTargetValue: 100,
  quarterTargets: [{ quarter: 'Q1', targetValue: 25 }, { quarter: 'Q2', targetValue: 50 },
    { quarter: 'Q3', targetValue: 75 }, { quarter: 'Q4', targetValue: 100 }],
  coreWorkplanWeight: 100, displayOrder: 1, activeInWorkplan: true, directContributionEligible: true,
  additiveApproved: true, nonOverlapRequired: false, nonOverlapApproved: true
};
const behaviour = (valueId: typeof valueIds[number], index: number): IBehaviourWorkplanItem => ({
  id: index + 10, etag: `"behaviour-${index + 1}"`, workplanItemKey: `BEHAVIOUR-${index + 1}`,
  naturalKey: `PERSON-001|2027|Behaviour|${valueId}`, workplanKey: 'PERSON-001|2027', personKey: employee.personKey,
  performanceYear: 2027, behaviourId: valueId, behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  behaviourSnapshotV2: { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId,
    valueTitle: `Synthetic Value ${index + 1}`, corporateValue: `Synthetic Corporate Value ${index + 1}`,
    roleTier: 'IC_OFFICER', descriptor: `SYNTHETIC TEST ONLY descriptor ${index + 1}`, cadence: 'Quarterly',
    periodKeys: ['Q1', 'Q2', 'Q3', 'Q4'], ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS },
  behaviourCommitmentV2: `Original commitment ${index + 1}`,
  behaviourPeriodCommitmentsV2: { Q1: 'Q1 commitment', Q2: 'Q2 commitment', Q3: 'Q3 commitment', Q4: 'Q4 commitment' },
  selectedSuggestionKeys: [], behaviourSelectionSnapshotsV2: {
    schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    valueId, selections: []
  }, behaviourSelectionSnapshotsSha256: encodeBehaviourSelectionSnapshotsV2({
    schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    valueId, selections: []
  }).sha256, displayOrder: index + 1, activeInWorkplan: true
});

describe('integrated Behaviour v02 preflight and serial canonical readback', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });
  const button = (text: string): HTMLButtonElement => {
    const result = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === text);
    if (!result) throw new Error(`Missing button ${text}`);
    return result;
  };

  const mount = async (failOnBehaviour?: string): Promise<{ upsertBehaviour: jest.Mock; setWeighting: jest.Mock;
    saveHeader: jest.Mock; sequence: string[] }> => {
    const header: IEmployeeWorkplanHeaderReadbackV2 = { id: 1, etag: '"header-1"', workplanKey: 'PERSON-001|2027',
      personKey: employee.personKey, employeeDisplayName: employee.displayName, employeeEmail: employee.email,
      performanceYear: 2027, managerPersonKey: manager.personKey, managerDisplayName: manager.displayName,
      managerEmail: manager.email, state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready',
      coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10,
      rowVersionToken: 1, workplanVersion: 1, coreWeightingMode: 'Equal' };
    let current: IEmployeeWorkplanReadbackV2 = { workplan: header, coreItems: [core], personalItems: [],
      behaviourItems: valueIds.map(behaviour), audits: [] };
    let version = 1;
    const sequence: string[] = [];
    const bump = (): void => { version += 1; current = { ...current,
      workplan: { ...current.workplan, rowVersionToken: version, etag: `"header-${version}"` } }; };
    const upsertCore = jest.fn(async () => { sequence.push('core'); bump(); return { readback: current, duplicate: false }; });
    const upsertBehaviour = jest.fn(async (_context: IEmployeeV2ItemCommandContext,
      input: IEmployeeBehaviourCommitmentInputV2) => {
      sequence.push(input.behaviourId);
      if (input.behaviourId === failOnBehaviour) throw new Error(`Synthetic ${input.behaviourId} failure after prior canonical receipts.`);
      bump();
      const periodMap = input.periodCommitments.reduce((result, entry) => ({ ...result, [entry.period]: entry.commitment.trim() }), {} as Record<string, string>);
      const snapshot: IBehaviourSelectionSnapshotEnvelopeV2 = {
        schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
        valueId: input.behaviourId, selections: (input.selections || []).map((selection): BehaviourSelectionSnapshotV2 => {
          if (selection.source === 'Own') return { source: 'Own', selectionKey: selection.selectionKey,
            behaviourKey: input.behaviourId, commitment: selection.commitment,
            howWillWeKnow: selection.howWillWeKnow };
          const row = focusCatalogue.rows.find(candidate => candidate.targetKey === selection.selectionKey)!;
          return { source: 'Catalogue', selectionKey: selection.selectionKey,
            commitment: selection.commitment, howWillWeKnow: selection.howWillWeKnow,
            catalogueKey: focusCatalogue.catalogueKey,
            catalogueVersion: focusCatalogue.catalogueVersion, catalogueRevision: focusCatalogue.revision,
            targetKey: row.targetKey, focusKey: row.focusKey, behaviourKey: input.behaviourId,
            roleLevelCode: row.roleLevelCode, focusArea: row.focusArea, selectedExampleText: row.suggestedTarget };
        }).sort((left, right) => left.selectionKey.localeCompare(right.selectionKey))
      };
      current = { ...current, behaviourItems: current.behaviourItems.map(item => item.behaviourId === input.behaviourId
        ? { ...item, etag: `"behaviour-${version}"`, behaviourCommitmentV2: input.commitment.trim(),
          behaviourPeriodCommitmentsV2: periodMap, selectedSuggestionKeys: input.selectedSuggestionKeys,
          behaviourSelectionSnapshotsV2: snapshot,
          behaviourSelectionSnapshotsSha256: encodeBehaviourSelectionSnapshotsV2(snapshot).sha256 }
        : item) };
      return { readback: current, duplicate: false };
    });
    const setWeighting = jest.fn(async () => { sequence.push('weighting'); bump(); return { readback: current, duplicate: false }; });
    const saveHeader = jest.fn(async () => { sequence.push('header'); bump(); return { readback: current, duplicate: false }; });
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: 'Draft',
      readiness: { ready: true, blockers: [] } });
    const service = { getCoreKpiCatalogue: async () => [catalogue], getPublishedBehaviours: async () => [],
      getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
      getEmployeeWorkplanV2: async () => current, upsertCoreContributionV2: upsertCore,
      upsertPersonalItemV2: jest.fn(), upsertBehaviourCommitmentV2: upsertBehaviour,
      setCoreWeightingV2: setWeighting, saveEmployeeWorkplanDraftV2: saveHeader
    } as unknown as IProductionDataService;
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service}
      adminReportingDataService={{} as IAdminReportingControlDataService} currentUserEmail={employee.email}
      userDisplayName={employee.displayName} behaviourFocusCatalogueV2={focusCatalogue}
      behaviourLibraryAsOf={new Date('2026-11-01T12:00:00Z')} />, host); });
    act(() => button('Build My Workplan').click());
    act(() => button('Behaviours').click());
    expect(host.querySelectorAll('[data-headline-behaviour]')).toHaveLength(5);
    const first = host.querySelector<HTMLInputElement>('[data-focus-choice="BHV-01-L1-01"]');
    if (!first) throw new Error('Mounted governed Behaviour focus choice was not found.');
    act(() => { first.click(); });
    const commitment = host.querySelector<HTMLTextAreaElement>('[data-commitment-input="BHV-01-L1-01"]');
    const observable = host.querySelector<HTMLTextAreaElement>('[data-how-will-we-know-input="BHV-01-L1-01"]');
    if (!commitment || !observable) throw new Error('Mounted per-selection Behaviour text was not found.');
    act(() => { commitment.value = 'Changed synthetic commitment'; Simulate.change(commitment); });
    act(() => { observable.value = 'Observable synthetic outcome'; Simulate.change(observable); });
    act(() => button('Review & Weight').click());
    await act(async () => { button('Save Draft').click(); });
    return { upsertBehaviour, setWeighting, saveHeader, sequence };
  };

  it('preflights all five then executes five Behaviour commands serially without a legacy category-weight write', async () => {
    const route = await mount();
    expect(host.textContent).toContain('Draft items saved and confirmed.');
    expect(route.upsertBehaviour).toHaveBeenCalledTimes(5);
    expect(route.upsertBehaviour.mock.calls.map(call => call[0].workplan.rowVersionToken)).toEqual([2, 3, 4, 5, 6]);
    expect(route.sequence).toEqual(['core', 'BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05', 'weighting']);
    expect(route.setWeighting).toHaveBeenCalledTimes(1);
    expect(route.saveHeader).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Behaviour v02 remained unweighted');
    expect(host.textContent).toContain('Behaviour v02 has no category weight.');
    expect(host.textContent).not.toContain('Category balance');
  });

  it('reports a truthful failure and does not execute later commands after a failed canonical Behaviour readback', async () => {
    const route = await mount('BHV-03');
    expect(route.sequence).toEqual(['core', 'BHV-01', 'BHV-02', 'BHV-03']);
    expect(route.setWeighting).not.toHaveBeenCalled();
    expect(route.saveHeader).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Partial save: 3 command(s) were confirmed before the error.');
    expect(host.textContent).toContain('Reload the canonical Workplan before retrying. Synthetic BHV-03 failure after prior canonical receipts.');
    expect(host.textContent).not.toContain('Draft saved and confirmed.');
  });
});
