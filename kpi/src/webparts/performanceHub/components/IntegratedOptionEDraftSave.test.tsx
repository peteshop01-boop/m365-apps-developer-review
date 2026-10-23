/* eslint-disable @rushstack/pair-react-dom-render-unmount -- every mounted host is unmounted in afterEach or the reopen step */
jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { canonicaliseOptionEDraft, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import type { IEmployeeWorkplanReadbackV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IProductionPerson } from '../models/ProductionModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IBehaviourFrameworkV2Catalogue } from '../services/BehaviourFrameworkV2';
import type { IOptionEDraftCanonicalRecord, IOptionEDraftExactUpdate,
  IOptionEDraftGateway, IOptionEDraftPreparedPayload,
  IOptionEProtectedDraftBinding } from '../services/OptionEDraftSharePointGateway';
import { OptionEDraftAmbiguousWriteError, OptionEDraftConflictError,
  OptionEDraftRouteError } from '../services/OptionEDraftSharePointGateway';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { createOptionEDraftCreateIntegration } from '../services/OptionEDraftCreateIntegration';
import type { IOptionEDraftCreateFields, IOptionEDraftCreateRequest } from '../services/OptionEDraftCreateContract';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from '../services/OptionEWorkplanListBindings';
import IntegratedPerformanceHub, { buildIntegratedOptionEDraft, readIntegratedOptionEDraft, type IIntegratedOptionEDraftSource,
  type IIntegratedPerformanceHubProps } from './IntegratedPerformanceHub';

const employee: IProductionPerson = { id: 1, personKey: 'PERSON-001', displayName: 'Synthetic Employee',
  email: 'employee@example.invalid', managerPersonKey: 'PERSON-002', managerEmail: 'manager@example.invalid',
  appRoles: ['Employee'], active: true, behaviourFrameworkVersionV2: 'KCCC-BEHAVIOUR|v02',
  behaviourRoleTierV2: 'IC_OFFICER', behaviourCadenceV2: 'Quarterly' };
const manager: IProductionPerson = { id: 2, personKey: 'PERSON-002', displayName: 'Synthetic Manager',
  email: 'manager@example.invalid', appRoles: ['Employee', 'Manager'], active: true };
const promptKeys = (valueId: string): string[] => [1, 2, 3, 4, 5].map(index => `${valueId}-PROMPT-${index}`);
const behaviourKeys = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const;
const focusCatalogue: IBehaviourFrameworkV2Catalogue = {
  catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'KCF-BHV-PD03-2026.09-v2', revision: 7,
  schemaVersion: '2.0', status: 'Published', effectiveFrom: '2026-09-01',
  headlineBehaviours: behaviourKeys.map((behaviourKey, index) => ({
    behaviourKey, title: `Headline ${index + 1}`, sortOrder: index + 1
  })),
  roleLevels: [{ code: 'L1', name: 'Individual Contributor / Coach', sortOrder: 1 },
    { code: 'L2', name: 'Manager', sortOrder: 2 }, { code: 'L3', name: 'Senior Manager / Leader', sortOrder: 3 }],
  ratingScale: ['Developing', 'Effective', 'Exceptional'],
  selectionGuidance: { recommendedMinimum: 3, recommendedMaximum: 5, hardMaximum: null },
  rows: behaviourKeys.map((behaviourKey, index) => ({
    targetKey: `${behaviourKey}-L1-01`, behaviourKey, roleLevelCode: 'L1' as const,
    focusKey: `${behaviourKey}-FOCUS-01`, focusArea: `Focus ${index + 1}`,
    suggestedTarget: `Approved target ${index + 1}`, suggestedMeasure: 'Commitment',
    suggestedUnit: 'Text', suggestedEvidence: `Evidence ${index + 1}`, status: 'Published' as const,
    sortOrder: index + 1, effectiveFrom: '2026-09-01'
  }))
};
const catalogueAuthority = {
  catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS' as const,
  catalogueVersion: focusCatalogue.catalogueVersion, catalogueRevision: focusCatalogue.revision,
  catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
  approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' as const
};
const governedExtension = (annual: number): NonNullable<IOptionEWorkplanDraftAggregate['behaviours']['governedExtension']> => ({
  schemaVersion: 'kcf.option-e.behaviours/v02', authority: catalogueAuthority, roleLevelCode: 'L1',
  headlines: behaviourKeys.map((behaviourKey, index) => ({
    behaviourKey, headlineTitle: `Headline ${index + 1}`, selections: [{
      selectionKey: `${behaviourKey}-OWN-ABCDEF`, source: 'Own', behaviourKey,
      headlineTitle: `Headline ${index + 1}`, focusKey: `${behaviourKey}-FOCUS-01`, focusTitle: `Focus ${index + 1}`,
      roleLevelCode: 'L1', selectedWording: `Commitment ${behaviourKey} ${annual}`,
      catalogueId: catalogueAuthority.catalogueId, catalogueVersion: catalogueAuthority.catalogueVersion,
      catalogueRevision: catalogueAuthority.catalogueRevision, catalogueEtag: catalogueAuthority.catalogueEtag,
      catalogueContentSha256: catalogueAuthority.catalogueContentSha256,
      myCommitment: `Commitment ${behaviourKey} ${annual}`, howWillWeKnow: `Evidence ${behaviourKey}`
    }]
  })),
  immutableSelectionSnapshots: true, legacyTargetRatingWeightFieldsWritten: false,
  deliveryArithmeticAffected: false
});
const aggregate = (annual: number): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'kcf.workplan-draft/v1',
  core: { weightingMode: 'Equal', entries: [{ coreId: 'CORE-STABLE-001', kpiId: 'SO1-013',
    kpiVersionKey: 'SO1-013|v01', targetVersionKey: 'SO1-013|2026|v01', role: 'Delivery',
    contributionMethod: 'AdditiveDirect', weightPercent: 100, annual: { value: annual }, q1: { value: 0 },
    q2: { value: 2 }, q3: { value: 3 }, q4: { value: 4 } }] },
  impact: [{ impactId: 'IMPACT-STABLE-001', wording: 'Deliver one exact outcome', measure: 'Number / Quantity',
    unit: 'items', annual: 0, q1: 0, q2: 0, q3: 0, q4: 0, success: 'Exact structured result' }],
  behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: (['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const).map(valueId => ({
      valueId, descriptorKey: `KCCC-BEHAVIOUR|v02|IC_OFFICER|${valueId}`,
      guidancePromptKeys: promptKeys(valueId), selectedPromptKeys: [promptKeys(valueId)[0]],
      commitment: `Commitment ${valueId}`, periodCommitments: { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4' }
    })), governedExtension: governedExtension(annual) }
});
const prepared = (value: IOptionEWorkplanDraftAggregate): IOptionEDraftPreparedPayload => {
  const payloadJson = canonicaliseOptionEDraft(value);
  return { aggregate: JSON.parse(payloadJson) as IOptionEWorkplanDraftAggregate, payloadJson,
    payloadSha256: payloadJson.length.toString(16).toUpperCase().padStart(64, '0') };
};
const binding = (): IOptionEProtectedDraftBinding => ({
  peopleItemId: 1, peopleUniqueId: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1',
  email: employee.email, personKey: employee.personKey, workplanItemId: 9,
  workplanUniqueId: '8465d4d0-ccaa-4776-a945-d611f76ddb48', workplanEtag: '"control-1"',
  workplanKey: 'PERSON-001|2026', performanceYear: 2026, draftItemId: 17,
  draftSchemaVersion: 'kcf.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready',
  pendingRequestKey: '', rowVersionToken: 1
});
const record = (value: IOptionEWorkplanDraftAggregate, etag = '"1"', clientSaveId = 'initial'): IOptionEDraftCanonicalRecord => {
  const payload = prepared(value);
  return { itemId: 17, etag, binding: binding(), aggregate: payload.aggregate,
    payloadJson: payload.payloadJson, payloadSha256: payload.payloadSha256, clientSaveId,
    clientSavedAt: '2026-09-18T00:00:00.000Z', modified: '2026-09-18T00:00:01.000Z' };
};

interface IRoute extends IOptionEDraftGateway {
  server: IOptionEDraftCanonicalRecord;
  prepare: jest.Mock;
  read: jest.Mock;
  updateExact: jest.Mock;
}
const route = (): IRoute => {
  const result = {
    server: record(aggregate(0)),
    prepare: jest.fn(async (value: IOptionEWorkplanDraftAggregate) => prepared(value)),
    read: jest.fn(async () => result.server),
    updateExact: jest.fn(async (request: IOptionEDraftExactUpdate) => {
      result.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt, payloadJson: request.prepared.payloadJson,
        payloadSha256: request.prepared.payloadSha256 };
    })
  } as IRoute;
  return result;
};

const deferred = (): { promise: Promise<void>; resolve(): void } => {
  let release = (): void => undefined;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, resolve: release };
};

const workplanReadback = (): IEmployeeWorkplanReadbackV2 => ({
  workplan: { id: 9, etag: '"control-1"', workplanKey: 'PERSON-001|2026', personKey: employee.personKey,
    employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
    managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
    state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1, workplanVersion: 1,
    coreWeightingMode: 'Equal', coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 },
  coreItems: [], personalItems: [], behaviourItems: [], audits: []
});
const objectives = (['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const).flatMap(valueId =>
  promptKeys(valueId).map((key, index) => ({ behaviourObjectiveKey: key, behaviourKey: valueId,
    objectiveTitle: key, objectiveDescription: key, suggestedMeasure: 'Commitment', suggestedUnit: 'Text',
    suggestedEvidence: 'None', active: true, sortOrder: index + 1 })));
const service = (readback = workplanReadback()): { value: IProductionDataService; legacyMutations: jest.Mock[] } => {
  const legacyMutations = [jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn()];
  return { value: {
    getBehaviourObjectiveLibrary: async () => objectives,
    getDirectReports: async () => [],
    getQuarterTimingConfig: async () => { throw new Error('Quarter timing is not part of this mounted Draft fixture.'); },
    getCoreKpiCatalogue: async () => [{ kpiId: 'SO1-013', kpiVersionKey: 'SO1-013|v01',
      targetVersionKey: 'SO1-013|2026|v01', wording: 'Synthetic KPI', pillar: 'Participation',
      workstream: 'Schools', scoringDirection: 'HigherIsBetter', unitLabel: 'items' }],
    getPublishedBehaviours: async () => [],
    getEmployeeWorkplanV2: async () => readback,
    upsertCoreContributionV2: legacyMutations[0], upsertPersonalItemV2: legacyMutations[1],
    upsertBehaviourCommitmentV2: legacyMutations[2], setCoreWeightingV2: legacyMutations[3],
    saveEmployeeWorkplanDraftV2: legacyMutations[4]
  } as unknown as IProductionDataService, legacyMutations };
};


describe('saved Draft editor roundtrip', () => {
  const rebuild = (value: IOptionEWorkplanDraftAggregate): IOptionEWorkplanDraftAggregate => {
    const read = readIntegratedOptionEDraft(value);
    return buildIntegratedOptionEDraft({ ...read, coreWeightingMode: read.weightingMode,
      coreItems: [], catalogue: [], objectives: [], behaviourRoleTier: value.behaviours.roleTier,
      governedBehaviourExtension: value.behaviours.governedExtension });
  };
  it.each([
    { sharedTargetRule: 'VisibleOnly' as const }, { sharedTargetRule: 'ApprovedApportionment' as const },
    { sharedApportionmentPercent: 0 }, { governanceReference: 'Saved approval' },
    { denominatorNumerator: 0 }, { denominatorValue: 10 }, { denominatorUnit: 'items' },
    { denominatorRuleReference: 'Saved rule' }, { denominatorSourceReference: 'Saved source' },
    { roleEvidence: 'UnsupportedStoredRole' as const }
  ])('holds unrepresented Core rules from editor and retained native readback: %j', rules => {
    const original = aggregate(5); const read = readIntegratedOptionEDraft(original);
    const source: IIntegratedOptionEDraftSource = { ...read, coreWeightingMode: read.weightingMode,
      coreItems: [], catalogue: [], objectives: [], behaviourRoleTier: original.behaviours.roleTier,
      governedBehaviourExtension: original.behaviours.governedExtension };
    const before = JSON.stringify(source);
    expect(() => buildIntegratedOptionEDraft({ ...source, core: [{ ...read.core[0], ...rules }] }))
      .toThrow('saved Core contribution rules can be retained');
    expect(() => buildIntegratedOptionEDraft({ ...source, coreItems: [{
      id: 31, etag: '"core-1"', workplanItemKey: 'CORE-STABLE-001', naturalKey: 'fixture|core',
      workplanKey: 'PERSON-001|2026', personKey: employee.personKey, performanceYear: 2026,
      kpiId: 'SO1-013', kpiVersionKey: 'SO1-013|v01', targetVersionKey: 'SO1-013|2026|v01',
      displayOrder: 1, activeInWorkplan: true, optionERetainedContributionRules: rules
    }] })).toThrow('saved Core contribution rules can be retained');
    expect(JSON.stringify(source)).toBe(before);
  });
  it('roundtrips governed selections and legacy guidance prompts in their separate namespaces', () => {
    const original = aggregate(5);
    expect(canonicaliseOptionEDraft(rebuild(original))).toBe(canonicaliseOptionEDraft(original));
    const read = readIntegratedOptionEDraft(original);
    original.behaviours.entries[0].selectedPromptKeys.push(promptKeys('BHV-01')[1]);
    const editedExtension = governedExtension(5);
    editedExtension.headlines[0].selections[0].myCommitment = 'Changed governed commitment';
    read.behaviours[0].selections![0].commitment = 'Changed governed commitment';
    const saved = buildIntegratedOptionEDraft({ ...read, coreWeightingMode: read.weightingMode,
      coreItems: [], catalogue: [], objectives: [], behaviourRoleTier: original.behaviours.roleTier,
      governedBehaviourExtension: editedExtension });
    expect(saved.behaviours.entries[0].selectedPromptKeys).toEqual([promptKeys('BHV-01')[0]]);
    expect(saved.behaviours.governedExtension!.headlines[0].selections[0].myCommitment).toBe('Changed governed commitment');
    expect(() => canonicaliseOptionEDraft(saved)).not.toThrow();
  });
  it('keeps legacy prompt edits effective when there is no governed extension', () => {
    const original = aggregate(5); delete original.behaviours.governedExtension;
    const read = readIntegratedOptionEDraft(original);
    read.behaviours[0].selectedSuggestionKeys = [promptKeys('BHV-01')[1]];
    const saved = buildIntegratedOptionEDraft({ ...read, coreWeightingMode: read.weightingMode,
      coreItems: [], catalogue: [], objectives: [], behaviourRoleTier: original.behaviours.roleTier });
    expect(saved.behaviours.entries[0].selectedPromptKeys).toEqual([promptKeys('BHV-01')[1]]);
    expect(() => canonicaliseOptionEDraft(saved)).not.toThrow();
  });
  it('retains annual success and empty quarterly success on unrelated Impact edits', () => {
    const original = aggregate(5);
    original.core.entries[0].annual.success = 'Annual retained result';
    original.core.entries[0].q1.success = '';
    const read = readIntegratedOptionEDraft(original);
    read.personal[0].wording = 'Edited Impact wording';
    const saved = buildIntegratedOptionEDraft({ ...read, coreWeightingMode: read.weightingMode,
      coreItems: [], catalogue: [], objectives: [], behaviourRoleTier: original.behaviours.roleTier,
      governedBehaviourExtension: original.behaviours.governedExtension });
    expect(saved.core).toEqual(original.core);
    expect(saved.impact[0].wording).toBe('Edited Impact wording');
  });
  it.each(['10', '', ' 10 '])('retains exact saved scalar type and text %j', value => {
    const original = aggregate(5);
    original.core.entries[0].annual.value = value;
    original.core.entries[0].q2.value = value;
    original.impact[0].annual = value;
    original.impact[0].q3 = value;
    const savedUnedited = rebuild(original);
    expect(JSON.parse(canonicaliseOptionEDraft(savedUnedited)).core).toEqual(JSON.parse(canonicaliseOptionEDraft(original)).core);
    expect(JSON.parse(canonicaliseOptionEDraft(savedUnedited)).impact).toEqual(JSON.parse(canonicaliseOptionEDraft(original)).impact);
  });
  it('retains missing and zero values without converting edited values back to the snapshot', () => {
    const original = aggregate(0);
    original.core.entries[0].q1 = {};
    original.impact[0].q2 = undefined;
    const savedUnedited = rebuild(original);
    expect(JSON.parse(canonicaliseOptionEDraft(savedUnedited)).core).toEqual(JSON.parse(canonicaliseOptionEDraft(original)).core);
    expect(JSON.parse(canonicaliseOptionEDraft(savedUnedited)).impact).toEqual(JSON.parse(canonicaliseOptionEDraft(original)).impact);
    const read = readIntegratedOptionEDraft(original);
    read.core[0].annualContribution = '12'; read.core[0].q1 = 'New commitment';
    read.personal[0].annual = '9';
    const saved = buildIntegratedOptionEDraft({ ...read, coreWeightingMode: read.weightingMode,
      coreItems: [], catalogue: [], objectives: [], behaviourRoleTier: original.behaviours.roleTier,
      governedBehaviourExtension: original.behaviours.governedExtension });
    expect(saved.core.entries[0].annual.value).toBe(12);
    expect(saved.core.entries[0].q1.value).toBe('New commitment');
    expect(saved.impact[0].annual).toBe(9);
  });
});

describe('mounted integrated Option E aggregate Draft save', () => {
  jest.setTimeout(15000);
  let host: HTMLDivElement;
  let mountedProps: IIntegratedPerformanceHubProps;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: 'Draft',
      config: { performanceYearNumber: 2026 },
      readiness: { ready: true, blockers: [] } });
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks();
  });
  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
    if (!found) throw new Error(`Missing button ${label}`);
    return found;
  };
  const mount = async (draftRoute: IRoute, readback = workplanReadback(),
    extraProps: Partial<IIntegratedPerformanceHubProps> = {}): Promise<jest.Mock[]> => {
    const data = service(readback);
    mountedProps = { dataService: data.value,
      adminReportingDataService: {} as IAdminReportingControlDataService, currentUserEmail: employee.email,
      userDisplayName: employee.displayName, optionEDraftGateway: draftRoute,
      behaviourFocusCatalogueV2: focusCatalogue, behaviourCatalogueAuthority: catalogueAuthority,
      behaviourCatalogueAsOfDate: '2026-09-23', ...extraProps };
    await act(async () => {
      ReactDOM.render(<IntegratedPerformanceHub {...mountedProps} />, host);
    });
    for (let index = 0; index < 24; index += 1) {
      await act(async () => { await Promise.resolve(); });
      if (draftRoute.read.mock.calls.length > 0 && host.textContent?.includes('Welcome back')) break;
    }
    act(() => button('Build My Workplan').click());
    return data.legacyMutations;
  };
  const editAnnual = (value: string): void => {
    act(() => button('Edit').click());
    const label = Array.from(host.querySelectorAll('label')).find(item => item.textContent?.includes('My annual contribution'));
    const input = label?.querySelector('input');
    if (!input) throw new Error('Core annual contribution input was not mounted.');
    act(() => { input.value = value; Simulate.change(input); });
  };
  const save = async (): Promise<void> => {
    act(() => button('Review & Weight').click());
    await act(async () => button('Save Draft').click());
  };
  const flushUpdates = async (): Promise<void> => {
    for (let index = 0; index < 12; index += 1) {
      await act(async () => { await Promise.resolve(); });
    }
  };
  it.each([
    { workplanItemId: 77 }, { workplanKey: 'OTHER|2026' }, { personKey: 'OTHER' },
    { performanceYear: 2027 }, { email: 'other@example.invalid' }, { workplanEtag: '"control-2"' },
    { rowVersionToken: 2 }, { state: 'ChangesRequested' as const }
  ])('private header pairing holds crossed canonical binding: %j', async patch => {
    const draftRoute = route(); draftRoute.server.binding = { ...draftRoute.server.binding, ...patch };
    await mount(draftRoute);
    act(() => button('Review & Weight').click());
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(true);
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
    expect(button('Save Draft').disabled).toBe(true);
    expect(draftRoute.prepare).not.toHaveBeenCalled(); expect(draftRoute.updateExact).not.toHaveBeenCalled();
  });
  it('private header pairing admits a real matched pair without creating a Draft', async () => {
    const draftRoute = route(), data = service();
    const create = jest.fn(async () => { throw new Error('Entry must not create.'); });
    data.value.createEmployeeWorkplanDraftV2 = create;
    await mount(draftRoute, workplanReadback(), { dataService: data.value });
    act(() => button('Review & Weight').click());
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(false);
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
  it('qualified private wording Save closes and freshly reopens exact content in a synthetic gateway', async () => {
    const draftRoute = route(), original = JSON.parse(JSON.stringify(draftRoute.server.aggregate)) as IOptionEWorkplanDraftAggregate;
    await mount(draftRoute);
    act(() => button('IMPACT KPIs').click()); act(() => button('Edit').click());
    const wording = host.querySelector('textarea');
    if (!wording) throw new Error('The existing Impact wording input was not mounted.');
    act(() => { wording.value = 'A newly saved employee outcome'; Simulate.change(wording); });
    await save();
    const expected = { ...original, impact: original.impact.map(item => ({ ...item, wording: 'A newly saved employee outcome' })) };
    expect(draftRoute.server.aggregate).toEqual(expected);
    expect(draftRoute.updateExact).toHaveBeenCalledTimes(1);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    await mount(draftRoute);
    act(() => button('IMPACT KPIs').click()); act(() => button('Edit').click());
    expect(host.querySelector('textarea')?.value).toBe('A newly saved employee outcome');
    act(() => button('Review & Weight').click());
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
  });
  it.each([false, true])('private header pairing verifies the final Start open, crossed=%s', async crossed => {
    const draftRoute = route();
    let fields: Readonly<IOptionEDraftCreateFields> | undefined;
    const receipt = { itemId: 9, etag: '"control-1"', rowVersionToken: 1 };
    const create = createOptionEDraftCreateIntegration({
      authorityResolver: { resolve: async () => ({ people: [{ itemId: employee.id, email: employee.email,
        personKey: employee.personKey, managerPersonKey: manager.personKey, active: true }],
        existing: [], ownDraftCreate: true, privateDraftReadback: true, rowVersionBefore: 0 }) },
      createOnlyTransport: {
        createOnce: async (request: Readonly<IOptionEDraftCreateRequest>) => { fields = request.fields; return receipt; },
        readCanonical: async () => {
          if (!fields) throw new Error('Synthetic creator fields unavailable.');
          return { ...fields, ...receipt };
        }
      },
      bindingCapability: { bindings: OPTION_E_WORKPLAN_LIST_BINDINGS, physicalIdentityVerified: true,
        privateItemAclVerified: true, physicalSchemaVerified: true, atomicCreateVerified: true,
        nativeReceiptVerified: true, privateReadbackVerified: true, trustedProcessorReceiptVerified: true,
        protectedState: 'Draft', transitionStatus: 'Ready' }
    });
    const final = { ...draftRoute.server, binding: { ...draftRoute.server.binding,
      workplanEtag: crossed ? '"control-2"' : '"control-1"' } };
    draftRoute.read.mockResolvedValueOnce(draftRoute.server).mockResolvedValueOnce(final);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: 'Not started',
      config: { performanceYearNumber: 2026 }, readiness: { ready: true, blockers: [] } });
    await mount(draftRoute, workplanReadback(), { optionEDraftCreateIntegration: create });
    await act(async () => button('Start My Workplan').click()); await flushUpdates();
    act(() => button('Review & Weight').click());
    expect(draftRoute.read).toHaveBeenCalledTimes(2);
    expect(Boolean(host.querySelector('[data-option-e-save-status="Saved"]'))).toBe(!crossed);
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(crossed);
    expect(host.textContent?.includes('Your new Draft has been saved and reopened')).toBe(!crossed);
  });
  it('qualified private wording route still holds ordinary new Impact creation weights', async () => {
    const draftRoute = route(); await mount(draftRoute);
    act(() => button('IMPACT KPIs').click()); act(() => button('Create IMPACT KPI').click());
    await save();
    expect(draftRoute.prepare).not.toHaveBeenCalled(); expect(draftRoute.updateExact).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Impact weights can be retained');
  });
  it('private header pairing retains unsaved buffer warning when a reopened binding disagrees', async () => {
    const draftRoute = route(); await mount(draftRoute); editAnnual('7');
    draftRoute.updateExact.mockImplementationOnce(async () => {
      draftRoute.server = record(aggregate(5), '"2"', 'other-session');
      throw new OptionEDraftConflictError();
    });
    await save();
    draftRoute.server.binding = { ...draftRoute.server.binding, workplanEtag: '"control-2"' };
    await act(async () => button('Reload canonical Draft').click());
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(true);
    const beforeUnload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });
  const replaceSession = async (kind: 'actor' | 'source/year' | 'gateway', draftRoute: IRoute,
    noSavedWorkplan = false): Promise<void> => {
    const nextEmployee = kind === 'actor' ? { ...employee, personKey: 'PERSON-OTHER',
      email: 'other@example.invalid', displayName: 'Other synthetic employee' } : employee;
    const year = kind === 'source/year' ? 2027 : 2026;
    const nextReadback = workplanReadback();
    nextReadback.workplan = { ...nextReadback.workplan, personKey: nextEmployee.personKey,
      employeeEmail: nextEmployee.email, employeeDisplayName: nextEmployee.displayName,
      performanceYear: year, workplanKey: `${nextEmployee.personKey}|${year}` };
    draftRoute.server = record(aggregate(42));
    draftRoute.server.binding = { ...draftRoute.server.binding, email: nextEmployee.email,
      personKey: nextEmployee.personKey, performanceYear: year, workplanKey: nextReadback.workplan.workplanKey };
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: nextEmployee, manager,
      workplanStatus: noSavedWorkplan ? 'Not started' : 'Draft', config: { performanceYearNumber: year },
      readiness: { ready: true, blockers: [] } });
    const nextService = kind === 'source/year' ? service(nextReadback).value : mountedProps.dataService;
    nextService.getEmployeeWorkplanV2 = async () => nextReadback;
    mountedProps = { ...mountedProps, dataService: nextService, optionEDraftGateway: draftRoute,
      currentUserEmail: nextEmployee.email, userDisplayName: nextEmployee.displayName };
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub {...mountedProps} />, host); });
    await flushUpdates();
  };
  const annualInput = (): HTMLInputElement => {
    act(() => button('Core KPIs').click());
    const findInput = (): HTMLInputElement | null | undefined => Array.from(host.querySelectorAll('label')).find(item =>
      item.textContent?.includes('My annual contribution'))?.querySelector('input');
    if (!findInput()) act(() => button('Edit').click());
    const input = findInput();
    if (!input) throw new Error('Replacement Draft annual contribution input was not mounted.');
    return input;
  };
  const beginDeferredSave = async (entered: Promise<void>): Promise<void> => {
    act(() => button('Review & Weight').click());
    act(() => button('Save Draft').click());
    await act(async () => { await entered; });
  };
  const editCoreWeightInReview = (value: string): void => {
    const coreWeight = Array.from(host.querySelectorAll('section')).find(section =>
      section.querySelector('h3')?.textContent?.trim() === 'Core');
    const custom = Array.from(coreWeight?.querySelectorAll('button') || []).find(item =>
      item.textContent?.trim() === 'Custom');
    if (!custom) throw new Error('Core custom weighting control was not mounted.');
    act(() => custom.click());
    const input = coreWeight?.querySelector('input[type="number"]');
    if (!(input instanceof HTMLInputElement)) throw new Error('Core weight input was not mounted.');
    act(() => { input.value = value; Simulate.change(input); });
  };

  it.each(['actor', 'source/year', 'gateway'] as const)(
    'isolates an old successful Save when the %s is replaced, even with a reused gateway', async kind => {
      const oldRoute = route();
      await mount(oldRoute);
      editAnnual('9');
      const entered = deferred(), release = deferred();
      oldRoute.updateExact.mockImplementationOnce(async (request: IOptionEDraftExactUpdate) => {
        entered.resolve(); await release.promise;
        oldRoute.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
          clientSavedAt: request.clientSavedAt, payloadJson: request.prepared.payloadJson,
          payloadSha256: request.prepared.payloadSha256 };
      });
      await beginDeferredSave(entered.promise);
      const nextRoute = kind === 'gateway' ? route() : oldRoute;
      await replaceSession(kind, nextRoute);
      expect(annualInput().value).toBe('42');
      act(() => button('Review & Weight').click());
      expect(button('Save Draft').disabled).toBe(false);
      await act(async () => { release.resolve(); await release.promise; });
      await flushUpdates();
      expect(annualInput().value).toBe('42');
      expect(oldRoute.updateExact).toHaveBeenCalledTimes(1);
    });

  it.each(['actor', 'source/year', 'gateway'] as const)(
    'ignores an old Save failure after %s replacement without disabling the new Draft', async kind => {
      const oldRoute = route();
      await mount(oldRoute);
      editAnnual('9');
      const entered = deferred(), release = deferred();
      oldRoute.updateExact.mockImplementationOnce(async () => {
        entered.resolve(); await release.promise;
        throw new Error('OLD-SAVE-FAILED');
      });
      await beginDeferredSave(entered.promise);
      const nextRoute = kind === 'gateway' ? route() : oldRoute;
      await replaceSession(kind, nextRoute);
      await act(async () => { release.resolve(); await release.promise; });
      await flushUpdates();
      expect(host.textContent).not.toContain('OLD-SAVE-FAILED');
      expect(annualInput().value).toBe('42');
      act(() => button('Review & Weight').click());
      expect(button('Save Draft').disabled).toBe(false);
    });

  it('does not place a late canonical Reload from the old gateway in the replacement Draft', async () => {
    const oldRoute = route(); await mount(oldRoute); editAnnual('9');
    oldRoute.updateExact.mockRejectedValueOnce(new OptionEDraftConflictError());
    await save();
    const entered = deferred(), release = deferred();
    oldRoute.read.mockImplementationOnce(async () => {
      entered.resolve(); await release.promise; return record(aggregate(9));
    });
    act(() => button('Reload canonical Draft').click());
    await act(async () => { await entered.promise; });
    await replaceSession('gateway', route());
    expect(annualInput().value).toBe('42');
    await act(async () => { release.resolve(); await release.promise; }); await flushUpdates();
    expect(annualInput().value).toBe('42');
    expect(host.textContent).not.toContain('Retained session changes were discarded by explicit choice.');
  });

  it('keeps the replacement Save busy when an older Save completes', async () => {
    const oldRoute = route(); await mount(oldRoute); editAnnual('9');
    const oldEntered = deferred(), oldRelease = deferred();
    oldRoute.updateExact.mockImplementationOnce(async (request: IOptionEDraftExactUpdate) => {
      oldEntered.resolve(); await oldRelease.promise;
      oldRoute.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt };
    });
    await beginDeferredSave(oldEntered.promise);
    const nextRoute = route(); await replaceSession('gateway', nextRoute);
    act(() => button('Core KPIs').click());
    editAnnual('55');
    const nextEntered = deferred(), nextRelease = deferred();
    nextRoute.updateExact.mockImplementationOnce(async (request: IOptionEDraftExactUpdate) => {
      nextEntered.resolve(); await nextRelease.promise;
      nextRoute.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt };
    });
    // Fail promptly if the replacement inherited busy state, rather than hanging on a disabled click.
    act(() => button('Review & Weight').click());
    expect(button('Save Draft').disabled).toBe(false);
    await beginDeferredSave(nextEntered.promise);
    await act(async () => { oldRelease.resolve(); await oldRelease.promise; }); await flushUpdates();
    expect(button('Saving…').disabled).toBe(true);
    await act(async () => { nextRelease.resolve(); await nextRelease.promise; }); await flushUpdates();
    expect(annualInput().value).toBe('55');
    expect(nextRoute.updateExact).toHaveBeenCalledTimes(1);
  });

  it.each(['create', 'second protected read'] as const)(
    'ignores an obsolete Start completion pending at %s after gateway replacement', async pendingAt => {
      const oldRoute = route(), entered = deferred(), release = deferred();
      let fields: Readonly<IOptionEDraftCreateFields> | undefined;
      const receipt = { itemId: 9, etag: '"control-1"', rowVersionToken: 1 };
      const integration = createOptionEDraftCreateIntegration({
        authorityResolver: { resolve: async () => ({ people: [{ itemId: employee.id, email: employee.email,
          personKey: employee.personKey, managerPersonKey: manager.personKey, active: true }],
          existing: [], ownDraftCreate: true, privateDraftReadback: true, rowVersionBefore: 0 }) },
        createOnlyTransport: {
          createOnce: async (request: Readonly<IOptionEDraftCreateRequest>) => {
            fields = request.fields;
            if (pendingAt === 'create') { entered.resolve(); await release.promise; }
            return receipt;
          },
          readCanonical: async () => {
            if (!fields) throw new Error('Synthetic creation fields are unavailable.');
            return { ...fields, ...receipt };
          }
        },
        bindingCapability: { bindings: OPTION_E_WORKPLAN_LIST_BINDINGS, physicalIdentityVerified: true,
          privateItemAclVerified: true, physicalSchemaVerified: true, atomicCreateVerified: true,
          nativeReceiptVerified: true, privateReadbackVerified: true, trustedProcessorReceiptVerified: true,
          protectedState: 'Draft', transitionStatus: 'Ready' }
      });
      const initialReadback = workplanReadback(); initialReadback.workplan.etag = receipt.etag;
      (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, manager, workplanStatus: 'Not started',
        config: { performanceYearNumber: 2026 }, readiness: { ready: true, blockers: [] } });
      if (pendingAt === 'second protected read') {
        oldRoute.read.mockResolvedValueOnce(oldRoute.server).mockImplementationOnce(async () => {
          entered.resolve(); await release.promise; return oldRoute.server;
        });
      }
      await mount(oldRoute, initialReadback, { optionEDraftCreateIntegration: integration });
      act(() => button('Start My Workplan').click());
      await act(async () => { await entered.promise; });
      await replaceSession('gateway', route());
      expect(annualInput().value).toBe('42');
      await act(async () => { release.resolve(); await release.promise; }); await flushUpdates();
      expect(annualInput().value).toBe('42');
      expect(host.textContent).not.toContain('Start not confirmed');
      expect(host.textContent).not.toContain('Your new Draft has been saved and reopened');
    });

  it('withdraws the old Saved receipt when the aggregate Draft gateway is removed', async () => {
    const oldRoute = route(); await mount(oldRoute);
    act(() => button('Review & Weight').click());
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
    mountedProps = { ...mountedProps, optionEDraftGateway: undefined };
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub {...mountedProps} />, host); });
    await flushUpdates();
    expect(host.querySelector('[data-option-e-save-status]')).toBeNull();
    expect(oldRoute.updateExact).not.toHaveBeenCalled();
  });

  it('does not restore a detached Saved receipt when its pending Save later finishes', async () => {
    const oldRoute = route(); await mount(oldRoute); editAnnual('9');
    const entered = deferred(), release = deferred();
    oldRoute.updateExact.mockImplementationOnce(async (request: IOptionEDraftExactUpdate) => {
      entered.resolve(); await release.promise;
      oldRoute.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt };
    });
    await beginDeferredSave(entered.promise);
    mountedProps = { ...mountedProps, optionEDraftGateway: undefined };
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub {...mountedProps} />, host); });
    await flushUpdates();
    expect(host.querySelector('[data-option-e-save-status]')).toBeNull();
    await act(async () => { release.resolve(); await release.promise; }); await flushUpdates();
    expect(host.querySelector('[data-option-e-save-status]')).toBeNull();
  });

  it('reattaches only the replacement gateway receipt after an explicit withdrawal', async () => {
    const oldRoute = route(); await mount(oldRoute);
    act(() => button('Review & Weight').click());
    mountedProps = { ...mountedProps, optionEDraftGateway: undefined };
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub {...mountedProps} />, host); });
    await flushUpdates();
    expect(host.querySelector('[data-option-e-save-status]')).toBeNull();
    const nextRoute = route(); await replaceSession('gateway', nextRoute);
    expect(annualInput().value).toBe('42');
    act(() => button('Review & Weight').click());
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
    expect(nextRoute.read).toHaveBeenCalledTimes(1);
  });

  it('clears the previous employee Workplan when the replacement employee has no saved plan', async () => {
    const oldRoute = route(); await mount(oldRoute);
    await replaceSession('actor', oldRoute, true);
    expect(host.textContent).toContain('No Workplan has been started');
    expect(host.querySelector('[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(true);
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
  });

  it('holds native Core rules after private Draft read replaces the editor choices', async () => {
    const draftRoute = route(); const readback = workplanReadback();
    readback.coreItems = [{ id: 31, etag: '"core-1"', workplanItemKey: 'CORE-STABLE-001', naturalKey: 'fixture|core',
      workplanKey: 'PERSON-001|2026', personKey: employee.personKey, performanceYear: 2026,
      kpiId: 'SO1-013', kpiVersionKey: 'SO1-013|v01', targetVersionKey: 'SO1-013|2026|v01',
      workplanVersion: 1, employeeKpiRole: 'Contributor', contributionMethod: 'AdditiveDirect',
      sharedTargetRule: 'ApprovedApportionment', sharedApportionmentPercent: 30, governanceReference: 'Saved approval',
      quarterTargets: [], coreWorkplanWeight: 100, displayOrder: 1, activeInWorkplan: true,
      directContributionEligible: false, additiveApproved: false, nonOverlapRequired: false, nonOverlapApproved: false }];
    const before = JSON.stringify(readback); const mutations = await mount(draftRoute, readback);
    editAnnual('45'); await save();
    expect(host.textContent).toContain('saved Core contribution rules can be retained');
    expect(host.querySelector('[data-option-e-save-status="NotSaved"]')).not.toBeNull();
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
    expect(draftRoute.prepare).not.toHaveBeenCalled(); expect(draftRoute.updateExact).not.toHaveBeenCalled();
    mutations.forEach(mutation => expect(mutation).not.toHaveBeenCalled());
    expect(JSON.stringify(readback)).toBe(before);
    expect(draftRoute.server.aggregate.core.entries[0].annual.value).toBe(0);
  });
  it.each(['classification', 'configuration'] as const)('PM82 holds %s before prepare/write and retains the unsaved editor changes', async kind => {
    const draftRoute = route();
    const readback = workplanReadback();
    if (kind === 'configuration') {
      readback.workplan.overallDeliveryWeightConfiguration = { configurationKey: 'SYNTH-CAPTURE', configurationVersion: 'saved-v7',
        coreWeight: 60, impactWeight: 40, sourceReference: 'KCF-KPI-Sponsor-PD-01' };
    } else {
      readback.personalItems = [{ id: 8, etag: '"saved-impact"', workplanItemKey: 'IMPACT-STABLE-001', naturalKey: 'fixture|impact',
        workplanKey: readback.workplan.workplanKey, personKey: employee.personKey, performanceYear: 2026,
        wording: 'Deliver one exact outcome', measure: 'Number / Quantity', unitLabel: 'items', displayOrder: 1, activeInWorkplan: true,
        impactClassification: { businessContributionArea: { key: 'saved-area', label: 'Original saved label', source: 'SYNTH',
          taxonomyId: 'saved-taxonomy', taxonomyVersion: 'saved-v1', taxonomyEtag: '"taxonomy-1"', taxonomyApprovalReference: 'KCF-KPI-Sponsor-PD-02' } } }];
    }
    const before = JSON.stringify(readback);
    const mutations = await mount(draftRoute, readback);
    editAnnual('45');
    await save();
    expect(host.textContent).toContain('Saving this Workplan is unavailable');
    expect(host.querySelector('[data-option-e-save-status="NotSaved"]')).not.toBeNull();
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
    expect(button('Submit Workplan').disabled).toBe(true);
    expect(draftRoute.prepare).not.toHaveBeenCalled();
    expect(draftRoute.updateExact).not.toHaveBeenCalled();
    mutations.forEach(mutation => expect(mutation).not.toHaveBeenCalled());
    expect(draftRoute.server.aggregate.core.entries[0].annual.value).toBe(0);
    expect(JSON.stringify(readback)).toBe(before);
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    act(() => button('Core KPIs').click());
    act(() => button('Edit').click());
    const input = Array.from(host.querySelectorAll('label')).find(item => item.textContent?.includes('My annual contribution'))?.querySelector('input');
    expect(input?.value).toBe('45');
  });

  it.each(['editor', 'original-zero', 'original-weight', 'retained-zero', 'retained-weight'] as const)(
    'PM128 holds unrepresented Impact weight from %s without changing the editor', kind => {
      const read = readIntegratedOptionEDraft(aggregate(0));
      const stored = { id: 8, etag: '"saved-impact"', workplanItemKey: 'IMPACT-STABLE-001', naturalKey: 'fixture|impact',
        workplanKey: 'PERSON-001|2026', personKey: employee.personKey, performanceYear: 2026,
        wording: 'Deliver one exact outcome', measure: 'Number / Quantity', unitLabel: 'items', displayOrder: 1,
        activeInWorkplan: true, personalItemWeight: kind.endsWith('zero') ? 0 : 25 };
      const source: IIntegratedOptionEDraftSource = { ...read, coreWeightingMode: read.weightingMode,
        coreItems: [], catalogue: [], objectives, governedBehaviourExtension: aggregate(0).behaviours.governedExtension };
      if (kind === 'editor') source.personal = [{ ...read.personal[0], weight: 25 }];
      else if (kind.startsWith('original')) source.personal = [{ ...read.personal[0], weight: 0, original: stored }];
      else source.retainedPersonalItems = [stored];
      const before = JSON.stringify(source);
      expect(() => buildIntegratedOptionEDraft(source)).toThrow('Impact weights can be retained');
      expect(JSON.stringify(source)).toBe(before);
    });

  it.each([0, 25])('PM128 holds retained native Impact weight %s before prepare/write and preserves unsaved changes', async weight => {
    const draftRoute = route(); const readback = workplanReadback();
    readback.personalItems = [{ id: 8, etag: '"saved-impact"', workplanItemKey: 'IMPACT-STABLE-001', naturalKey: 'fixture|impact',
      workplanKey: readback.workplan.workplanKey, personKey: employee.personKey, performanceYear: 2026,
      wording: 'Deliver one exact outcome', measure: 'Number / Quantity', unitLabel: 'items', displayOrder: 1,
      activeInWorkplan: true, personalItemWeight: weight }];
    const before = JSON.stringify(readback); const mutations = await mount(draftRoute, readback);
    editAnnual('45'); await save();
    expect(host.textContent).toContain('Impact weights can be retained');
    expect(host.querySelector('[data-option-e-save-status="NotSaved"]')).not.toBeNull();
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
    expect(draftRoute.prepare).not.toHaveBeenCalled(); expect(draftRoute.updateExact).not.toHaveBeenCalled();
    mutations.forEach(mutation => expect(mutation).not.toHaveBeenCalled());
    expect(draftRoute.server.aggregate.core.entries[0].annual.value).toBe(0);
    expect(JSON.stringify(readback)).toBe(before);
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload); expect(beforeUnload.defaultPrevented).toBe(true);
    act(() => button('Core KPIs').click()); act(() => button('Edit').click());
    const input = Array.from(host.querySelectorAll('label')).find(item => item.textContent?.includes('My annual contribution'))?.querySelector('input');
    expect(input?.value).toBe('45');
  });

  it('PM128 still admits a new unweighted Impact row with no stored weight evidence', () => {
    const original = aggregate(0); const read = readIntegratedOptionEDraft(original);
    const source: IIntegratedOptionEDraftSource = { ...read, coreWeightingMode: read.weightingMode,
      coreItems: [], catalogue: [], objectives, behaviourRoleTier: original.behaviours.roleTier,
      governedBehaviourExtension: original.behaviours.governedExtension };
    expect(JSON.parse(canonicaliseOptionEDraft(buildIntegratedOptionEDraft(source)))).toEqual(original);
  });

  it('PM82 holds an editor classification before the closed aggregate can discard it', () => {
    const source: IIntegratedOptionEDraftSource = { core: [], personal: [{ key: 'local-impact', wording: 'Outcome', measure: 'Number / Quantity',
      unit: 'items', annual: '4', q1: '1', q2: '1', q3: '1', q4: '1', success: 'Done', weight: 100,
      classification: { businessContributionArea: { key: 'area', label: 'Captured label', source: 'SYNTH' } } }],
      behaviours: [], coreItems: [], catalogue: [], objectives: [], coreWeightingMode: 'Equal' };
    const before = JSON.stringify(source);
    expect(() => buildIntegratedOptionEDraft(source)).toThrow('Saving this Workplan is unavailable');
    expect(JSON.stringify(source)).toBe(before);
  });

  it('renders canonical status, saves the aggregate, reopens exact A, continues to B and repeats Save without legacy commands', async () => {
    const draftRoute = route();
    const legacyMutations = await mount(draftRoute);
    act(() => button('Review & Weight').click());
    expect(host.querySelector('[data-option-e-save-status="Saved"]')?.textContent).toContain('Saved');
    act(() => button('Core KPIs').click());
    editAnnual('9');
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    await save();
    expect(draftRoute.updateExact).toHaveBeenCalledTimes(1);
    expect(draftRoute.read).toHaveBeenCalledTimes(2);
    expect(draftRoute.server.aggregate.core.entries[0].annual.value).toBe(9);
    expect(draftRoute.server.aggregate.core.entries[0]).toMatchObject({
      coreId: 'CORE-STABLE-001', kpiVersionKey: 'SO1-013|v01', targetVersionKey: 'SO1-013|2026|v01'
    });
    expect(draftRoute.server.aggregate.behaviours.entries[0]).toMatchObject({
      descriptorKey: 'KCCC-BEHAVIOUR|v02|IC_OFFICER|BHV-01', guidancePromptKeys: promptKeys('BHV-01')
    });
    expect(draftRoute.server.aggregate.behaviours.governedExtension?.headlines[0].selections[0]).toMatchObject({
      source: 'Own', focusKey: 'BHV-01-FOCUS-01', focusTitle: 'Focus 1'
    });
    legacyMutations.forEach(mutation => expect(mutation).not.toHaveBeenCalled());
    expect(host.querySelector('[data-option-e-save-status="Saved"]')?.textContent).toContain('Saved');
    expect(host.textContent).not.toContain('overall numeric Behaviour average');
    expect(host.textContent).toContain('Behaviour v02 has no category weight');

    act(() => { ReactDOM.unmountComponentAtNode(host); });
    await mount(draftRoute);
    act(() => button('Behaviours').click());
    expect(host.querySelector('[data-selected-target="BHV-01-OWN-ABCDEF"]')?.textContent).toContain('Focus 1');
    act(() => button('Core KPIs').click());
    act(() => button('Edit').click());
    const input = Array.from(host.querySelectorAll('label')).find(item => item.textContent?.includes('My annual contribution'))
      ?.querySelector('input');
    expect(input?.value).toBe('9');

    if (!input) throw new Error('Reopened Core annual input was not mounted.');
    act(() => { input.value = '12'; Simulate.change(input); });
    await save();
    await save();
    expect(draftRoute.updateExact).toHaveBeenCalledTimes(3);
    expect(draftRoute.server.aggregate.core.entries[0].annual.value).toBe(12);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    await mount(draftRoute);
    act(() => button('Edit').click());
    const reopened = Array.from(host.querySelectorAll('label'))
      .find(item => item.textContent?.includes('My annual contribution'))?.querySelector('input');
    expect(reopened?.value).toBe('12');
  });

  it('shows an accessible 412 conflict with the edited buffer retained, then explicitly reapplies against the new ETag', async () => {
    const draftRoute = route();
    const legacyMutations = await mount(draftRoute);
    editAnnual('11');
    draftRoute.updateExact.mockImplementationOnce(async () => {
      draftRoute.server = record(aggregate(7), '"2"', 'other-session');
      throw new OptionEDraftConflictError();
    });
    await save();
    const alert = host.querySelector('[data-option-e-save-status="Conflict"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('Conflict — your changes are retained');
    expect(button('Reload canonical Draft')).toBeDefined();
    act(() => button('Reapply retained changes').click());
    expect(host.querySelector('[data-option-e-save-status="Unsaved"]')?.textContent).toContain('Unsaved');
    await act(async () => button('Save Draft').click());
    expect(draftRoute.updateExact).toHaveBeenCalledTimes(2);
    expect(draftRoute.updateExact.mock.calls[1][0].expectedEtag).toBe('"2"');
    expect(draftRoute.server.aggregate.core.entries[0].annual.value).toBe(11);
    legacyMutations.forEach(mutation => expect(mutation).not.toHaveBeenCalled());
  });

  it('SESSION-01 keeps an in-flight Review & Weight edit B visible and protected after exact Save A completes', async () => {
    const draftRoute = route();
    await mount(draftRoute);
    const updateEntered = deferred();
    const allowUpdate = deferred();
    draftRoute.updateExact.mockImplementationOnce(async (request: IOptionEDraftExactUpdate) => {
      updateEntered.resolve();
      await allowUpdate.promise;
      draftRoute.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt, payloadJson: request.prepared.payloadJson,
        payloadSha256: request.prepared.payloadSha256 };
    });
    await beginDeferredSave(updateEntered.promise);
    editCoreWeightInReview('99');
    allowUpdate.resolve();
    await flushUpdates();
    expect(draftRoute.updateExact).toHaveBeenCalledTimes(1);
    expect(draftRoute.server.aggregate.core.entries[0].weightPercent).toBe(100);
    expect(host.querySelector('[data-option-e-save-status="NotSaved"]')?.textContent)
      .toContain('newer session changes');
    const coreWeight = Array.from(host.querySelectorAll('section')).find(section =>
      section.querySelector('h3')?.textContent?.trim() === 'Core');
    expect((coreWeight?.querySelector('input[type="number"]') as HTMLInputElement | null)?.value).toBe('99');
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });

  it('SESSION-02 keeps a newer Core builder edit B through an in-flight 412 conflict', async () => {
    const draftRoute = route();
    await mount(draftRoute);
    editAnnual('9');
    const updateEntered = deferred();
    const allowFailure = deferred();
    draftRoute.updateExact.mockImplementationOnce(async () => {
      updateEntered.resolve();
      await allowFailure.promise;
      draftRoute.server = record(aggregate(7), '"2"', 'other-session');
      throw new OptionEDraftConflictError();
    });
    await beginDeferredSave(updateEntered.promise);
    act(() => button('Core KPIs').click());
    editAnnual('11');
    allowFailure.resolve();
    await flushUpdates();
    expect(draftRoute.updateExact).toHaveBeenCalledTimes(1);
    const input = Array.from(host.querySelectorAll('label'))
      .find(item => item.textContent?.includes('My annual contribution'))?.querySelector('input');
    expect(input?.value).toBe('11');
    act(() => button('Review & Weight').click());
    expect(host.querySelector('[data-option-e-save-status="Conflict"]')?.textContent)
      .toContain('your changes are retained');
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });

  it('SESSION-03 keeps a newer Core builder edit B through an ambiguous unchanged readback', async () => {
    const draftRoute = route();
    await mount(draftRoute);
    editAnnual('9');
    const updateEntered = deferred();
    const allowFailure = deferred();
    draftRoute.updateExact.mockImplementationOnce(async () => {
      updateEntered.resolve();
      await allowFailure.promise;
      throw new OptionEDraftAmbiguousWriteError();
    });
    await beginDeferredSave(updateEntered.promise);
    act(() => button('Core KPIs').click());
    editAnnual('13');
    allowFailure.resolve();
    await flushUpdates();
    expect(draftRoute.updateExact).toHaveBeenCalledTimes(1);
    const input = Array.from(host.querySelectorAll('label'))
      .find(item => item.textContent?.includes('My annual contribution'))?.querySelector('input');
    expect(input?.value).toBe('13');
    act(() => button('Review & Weight').click());
    expect(host.querySelector('[data-option-e-save-status="NotSaved"]')?.textContent)
      .toContain('Not saved');
    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });

  it('shows an accessible fail-closed state and disables Save when the protected route cannot open', async () => {
    const draftRoute = route();
    draftRoute.read.mockRejectedValueOnce(new OptionEDraftRouteError('EMPLOYEE_MISSING', 'No active employee matched.'));
    await mount(draftRoute);
    act(() => button('Review & Weight').click());
    const alert = host.querySelector('[data-option-e-save-status="NotSaved"]');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(alert?.textContent).toContain('Not saved — your changes are retained');
    expect(button('Reload canonical Draft')).toBeDefined();
    expect(button('Save Draft').disabled).toBe(true);
    expect(draftRoute.updateExact).not.toHaveBeenCalled();
  });
  it('057 preserves injected V1 compatibility without legacy command fallback', async () => {
    const draftRoute = route(), legacy = await mount(draftRoute);
    editAnnual('17'); await save();
    expect(draftRoute.server.aggregate.schemaVersion).toBe('kcf.workplan-draft/v1');
    expect(draftRoute.server.aggregate.core.entries[0].annual.value).toBe(17);
    expect(draftRoute.updateExact).toHaveBeenCalledTimes(1);
    legacy.forEach(write => expect(write).not.toHaveBeenCalled());
  });
  it('057 a held V1 injection cannot enable Save through a caller flag or legacy fallback', async () => {
    const draftRoute = route(), legacy = await mount(draftRoute, workplanReadback(), { nativeWritesHeld: true });
    act(() => button('Review & Weight').click());
    expect(button('Save Draft').disabled).toBe(true); expect(button('Submit Workplan').disabled).toBe(true);
    expect(host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(true);
    expect(draftRoute.updateExact).not.toHaveBeenCalled(); legacy.forEach(write => expect(write).not.toHaveBeenCalled());
  });
});
