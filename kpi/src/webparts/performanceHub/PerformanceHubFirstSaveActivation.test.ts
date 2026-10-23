/**
 * @jest-environment jsdom
 * @jest-environment-options {"url":"http://127.0.0.1:4357/package-host/"}
 */
"use strict"; // eslint-disable-line strict -- Preserve the compiled Jest environment docblock as the first output.
jest.mock('@microsoft/sp-webpart-base', () => ({ BaseClientSideWebPart: class { public context: unknown; public domElement: unknown; public properties = {}; } }));
jest.mock('@microsoft/sp-core-library', () => ({ Version: { parse: (value: string) => value } }));
jest.mock('@microsoft/sp-property-pane', () => ({ PropertyPaneTextField: () => ({}) }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
jest.mock('PerformanceHubWebPartStrings', () => ({}), { virtual: true });
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import PerformanceHubWebPart from './PerformanceHubWebPart';
import IntegratedPerformanceHub, { type IIntegratedPerformanceHubProps } from './components/IntegratedPerformanceHub';

import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { act, Simulate } from 'react-dom/test-utils';
import type { SPHttpClient, SPHttpClientConfiguration, SPHttpClientResponse } from '@microsoft/sp-http';
import type { IProductionConfig, IProductionPerson } from './models/ProductionModels';
import type { IOptionEWorkplanDraftV3Aggregate } from './models/OptionEWorkplanDraftV3Models';
import { canonicaliseOptionEPartialDraftV3 } from './services/OptionEWorkplanDraftV3Wire';
import { OptionEDraftSaveController } from './components/OptionEDraftSaveController';
import SharePointEmployeeWorkplanV2PersistenceService from './services/SharePointEmployeeWorkplanV2PersistenceService';
import OptionEDraftSharePointGateway from './services/OptionEDraftSharePointGateway';
import OptionEProtectedDraftGateway from './services/OptionEProtectedDraftGateway';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './services/OptionEWorkplanListBindings';
import type { IProductionDataService } from './services/IProductionDataService';
import type { IAdminReportingControlDataService } from './services/AdminReportingControlDataService';
import { LocalPrivateDraftV3Gateway } from './components/IntegratedPerformanceHub';

const originalCrypto = globalThis.crypto, originalEncoder = globalThis.TextEncoder;
beforeAll(() => {
  expect(window.location.origin).toBe('http://127.0.0.1:4357');
  expect(window.location.pathname).toBe('/package-host/');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }); globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
});
afterAll(() => { Object.defineProperty(globalThis, 'crypto', { configurable: true, value: originalCrypto }); globalThis.TextEncoder = originalEncoder; });
const localV3 = (() => {
  type IOptionEWorkplanDraftAggregate = IOptionEWorkplanDraftV3Aggregate;
  const canonicaliseOptionEPartialDraft = canonicaliseOptionEPartialDraftV3;
const site = 'https://kcf-test.invalid/sites/first-save';
const employee: IProductionPerson = { id: 1, personKey: 'FICTION-EMPLOYEE', displayName: 'Fictional Employee',
  email: 'employee@kcf-test.invalid', managerPersonKey: 'FICTION-MANAGER', managerEmail: 'manager@kcf-test.invalid',
  appRoles: ['Employee'], active: true, behaviourFrameworkVersionV2: 'KCCC-BEHAVIOUR|v02',
  behaviourRoleTierV2: 'IC_OFFICER', behaviourCadenceV2: 'Quarterly' };
const manager: IProductionPerson = { id: 2, personKey: 'FICTION-MANAGER', displayName: 'Fictional Manager',
  email: 'manager@kcf-test.invalid', appRoles: ['Employee', 'Manager'], active: true };
const other: IProductionPerson = { id: 3, personKey: 'FICTION-OTHER', displayName: 'Fictional Other Employee',
  email: 'other.employee@kcf-test.invalid', appRoles: ['Employee'], active: true };
const people = [employee, manager, other];
const config: IProductionConfig = { performanceYear: '2026', performanceYearNumber: 2026,
  performanceYearStart: '2026-01-01T00:00:00Z', performanceYearEnd: '2026-12-31T23:59:59Z',
  quarters: { q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4' }, weights: { core: 70, personal: 30, behaviours: 0 },
  rag: { greenThreshold: 90, amberThreshold: 50 }, aggregationMethods: [], retentionStatus: 'Synthetic only' };
const slots = (): IOptionEWorkplanDraftAggregate['impact'][number]['targets'] => ({ annual: { kind: 'Scalar' }, q1: { kind: 'Scalar' }, q2: { kind: 'Scalar' }, q3: { kind: 'Scalar' }, q4: { kind: 'Scalar' } });
const initialAggregate = (): IOptionEWorkplanDraftAggregate => ({ schemaVersion: 'kcf.workplan-draft/v3',
 core: { weightingMode: 'Equal', entries: [] }, impact: [],
 behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER', entries: [] } });
const weighted = (): IOptionEWorkplanDraftAggregate => ({ ...initialAggregate(), impact: [{ impactId: 'FICTION-NEW-IMPACT',
 wording: 'A normal weighted employee outcome', measure: 'Number / Quantity', unitLabel: 'items', targets: slots(),
 editorDefinition: { measure: 'Number / Quantity', success: '' }, classification: { state: 'Unselected' }, personalItemWeight: 100 }] });
const hash = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const response = (status: number, body: unknown = {}): SPHttpClientResponse => ({ status,
  ok: status >= 200 && status < 300, json: async () => clone(body), text: async () => JSON.stringify(body)
} as unknown as SPHttpClientResponse);
interface IRequest { method: 'GET' | 'POST'; actor: string; url: string; status: number; body?: Record<string, string>; headers?: Record<string, string>; }

/** Ordinary native-shaped records and explicit simulated role policy; there is no network fallback. */
class FictionalSharePoint {
  public readonly requests: IRequest[] = [];
  public readonly header: Record<string, unknown> = { Id: 9, UniqueId: '8465d4d0-ccaa-4776-a945-d611f76ddb48',
    '@odata.etag': '"control-1"', WorkplanKey: 'FICTION-EMPLOYEE|2026', PersonKey: employee.personKey,
    EmployeeDisplayName: employee.displayName, EmployeeEmail: employee.email, PerformanceYear: 2026,
    ManagerPersonKey: manager.personKey, ManagerDisplayName: manager.displayName, ManagerEmail: manager.email,
    State: 'Draft', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', CoreCategoryWeight: 70,
    PersonalCategoryWeight: 30, BehaviourCategoryWeight: 0, CoreWeightingMode: 'Equal', WorkplanVersion: 1,
    RowVersionToken: 1, DraftItemId: '17', DraftSchemaVersion: 'kcf.workplan-draft/v3', PendingRequestKey: '' };
  public readonly draft: Record<string, unknown>;
  public writeOutcome: 'success' | 'deny' | 'commitThen500' | 'wrongReadback' = 'success';
  public itemsPresent = false;
  public denyReadAfterWrite = false;
  private draftVersion = 1;

  public constructor() {
    const payload = canonicaliseOptionEPartialDraft(initialAggregate());
    this.draft = { Id: 17, '@odata.etag': '"draft-1"', DraftPayloadJSON: payload, DraftPayloadSHA256: hash(payload),
      ClientSaveID: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1', ClientSavedAt: '2026-10-10T12:00:00.000Z',
      Modified: '2026-10-10T12:00:01.000Z', Editor: { EMail: employee.email, Title: employee.displayName } };
  }
  public client(actor: IProductionPerson): SPHttpClient {
    return { get: async (url: string) => this.get(actor, url),
      post: async (url: string, _configuration: unknown, options: { headers: Record<string, string>; body: string }) => this.post(actor, url, options)
    } as unknown as SPHttpClient;
  }
  private address(url: string): { parsed: URL; title: string; item?: number } {
    if (!url.startsWith(site + '/_api/web/lists/')) throw new Error('Local test transport refuses any other endpoint.');
    const parsed = new URL(url), match = parsed.pathname.match(/getbytitle\('([^']+)'\)\/items(?:\((\d+)\))?$/i);
    if (!match) throw new Error('Unexpected local test request: ' + url);
    return { parsed, title: match[1], item: match[2] ? Number(match[2]) : undefined };
  }
  private filtered(row: Record<string, unknown>, filter: string): boolean {
    const terms = Array.from(filter.matchAll(/([A-Za-z]+) eq (?:'([^']*)'|(\d+)|(true|false))/g));
    if (!terms.length) throw new Error('Collection fixture requires an explicit supported filter.');
    return terms.every(term => {
      const expected = term[2] !== undefined ? term[2] : term[3] !== undefined ? Number(term[3]) : term[4] === 'true';
      // SharePoint's Boolean REST filter uses1 while the returned JSON value istrue.
      return typeof row[term[1]] === 'boolean' && typeof expected === 'number'
        ? Number(row[term[1]]) === expected : row[term[1]] === expected;
    });
  }
  private projection(row: Record<string, unknown>, select: string): Record<string, unknown> {
    // This declared native-shaped fixture supplies row metadata; actual M365 metadata is still pending verification.
    const result: Record<string, unknown> = row['@odata.etag'] ? { '@odata.etag': row['@odata.etag'] } : {};
    for (const field of select.split(',')) {
      if (field.startsWith('Editor/')) result.Editor = clone(row.Editor);
      else if (row[field] !== undefined) result[field] = clone(row[field]);
    }
    return result;
  }
  private get(actor: IProductionPerson, url: string): SPHttpClientResponse {
    const { parsed, title, item } = this.address(url);
    const select = parsed.searchParams.get('$select') || '', filter = parsed.searchParams.get('$filter') || '';
    let status = 200, body: unknown;
    if (title === 'KCFKPI_People') {
      const rows = people.map(person => ({ Id: person.id, UniqueId: `10000000-0000-4000-8000-${String(person.id).padStart(12, '0')}`,
        PersonKey: person.personKey, Email: person.email, Active: person.active }));
      body = { value: rows.filter(row => this.filtered(row, filter)).map(row => this.projection(row, select)) };
    } else if (title === 'KCFKPI_Workplans') {
      const rows = actor.email === employee.email && this.filtered(this.header, filter) ? [this.header] : [];
      body = { value: rows.map(row => this.projection(row, select)) };
    } else if (title === 'KCFKPI_WorkplanItems') {
      // Simulates the observed missing rich schema; only a real zero presence query avoids it.
      if (select !== 'Id,WorkplanKey') { status = 400; body = { error: 'Rich item contract not installed in this declared fixture.' }; }
      else body = { value: this.itemsPresent ? [{ Id: 21, WorkplanKey: this.header.WorkplanKey }] : [] };
    } else if (title === 'KCFKPI_Audit') body = { value: [] };
    else if (title === 'KCFKPI_WorkplanDrafts' && item === 17) {
      if (actor.email !== employee.email || this.denyReadAfterWrite && this.requests.some(r => r.method === 'POST')) { status = 403; body = { error: 'Declared fictional own-item policy denied.' }; }
      else body = this.projection(this.draft, select);
    } else throw new Error('Unspecified fixture list/item: ' + title);
    this.requests.push({ method: 'GET', actor: actor.email, url, status });
    return response(status, body);
  }
  private post(actor: IProductionPerson, url: string, options: { headers: Record<string, string>; body: string }): SPHttpClientResponse {
    const { title, item } = this.address(url), body = JSON.parse(options.body) as Record<string, string>;
    const keys = Object.keys(body).sort();
    if (title !== 'KCFKPI_WorkplanDrafts' || item !== 17 || keys.join(',') !== 'ClientSaveID,ClientSavedAt,DraftPayloadJSON,DraftPayloadSHA256'
      || options.headers['X-HTTP-Method'] !== 'MERGE') throw new Error('Unexpected mutation refused by local fixture.');
    let status = 204;
    if (actor.email !== employee.email || this.writeOutcome === 'deny') status = 403;
    else if (options.headers['IF-MATCH'] !== this.draft['@odata.etag']) status = 412;
    else {
      Object.assign(this.draft, body);
      this.draft['@odata.etag'] = `"draft-${++this.draftVersion}"`;
      this.draft.Modified = '2026-10-11T00:30:01.000Z';
      if (this.writeOutcome === 'commitThen500') status = 500;
      if (this.writeOutcome === 'wrongReadback') {
        const wrong = JSON.parse(body.DraftPayloadJSON) as IOptionEWorkplanDraftAggregate;
        wrong.impact[0].wording = 'A different persisted outcome';
        this.draft.DraftPayloadJSON = canonicaliseOptionEPartialDraft(wrong);
        this.draft.DraftPayloadSHA256 = hash(this.draft.DraftPayloadJSON as string);
      }
    }
    this.requests.push({ method: 'POST', actor: actor.email, url, status, body: clone(body), headers: clone(options.headers) });
    return response(status);
  }
}

const ports = (server: FictionalSharePoint, actor = employee): {
  reader: SharePointEmployeeWorkplanV2PersistenceService; gateway: OptionEProtectedDraftGateway<IOptionEWorkplanDraftAggregate>;
  leaf: OptionEDraftSharePointGateway<IOptionEWorkplanDraftAggregate>; controller: OptionEDraftSaveController<IOptionEWorkplanDraftAggregate>;
} => {
  const client = server.client(actor), configuration = {} as SPHttpClientConfiguration;
  const leaf = new OptionEDraftSharePointGateway<IOptionEWorkplanDraftAggregate>(client, site, OPTION_E_WORKPLAN_LIST_BINDINGS, configuration, undefined, 'kcf.workplan-draft/v3');
  const gateway = new OptionEProtectedDraftGateway<IOptionEWorkplanDraftAggregate>(client, site, actor.email, OPTION_E_WORKPLAN_LIST_BINDINGS, configuration, leaf, 'kcf.workplan-draft/v3');
  return { reader: new SharePointEmployeeWorkplanV2PersistenceService(client, site, actor.email), gateway, leaf,
    controller: new OptionEDraftSaveController<IOptionEWorkplanDraftAggregate>(gateway, () => 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d', () => new Date('2026-10-11T00:30:00.000Z'), 'kcf.workplan-draft/v3') };
};

const seed = (server: FictionalSharePoint, body: IOptionEWorkplanDraftAggregate): void => {
  const payload = canonicaliseOptionEPartialDraft(body);
  server.draft.DraftPayloadJSON = payload; server.draft.DraftPayloadSHA256 = hash(payload);
};
const retained = (): IOptionEWorkplanDraftAggregate => {
  const body = weighted(), entry = body.impact[0];
  entry.impactId = 'personal-1'; entry.description = 'Historical evidence distinct from the editor';
  entry.measure = 'Independent historical criterion'; entry.measureType = 'Other'; entry.scoringDirection = 'TBC';
  entry.baselineValue = 0; entry.personalItemWeight = 0; entry.displayOrder = 4;
  entry.editorDefinition.intendedOutcome = ''; entry.editorDefinition.successCriterion = 'Separate editor criterion';
  entry.targets.annual = { kind: 'NativePair', numericValue: 0, textValue: 'native historical zero', editorText: '001% pending' };
  entry.classification = { state: 'RetainedUnresolved', businessContributionArea: { key: 'OLD-BCA', label: 'Historical label', source: 'Historical source' } };
  body.impact.push({ ...clone(entry), impactId: 'historic-inactive', activeInWorkplan: false });
  body.employeeNotes = { categoryWeightReason: 'Retained private reason', zeroPersonalReason: '' };
  body.core = { weightingMode: 'Custom', entries: [{ coreId: 'HISTORIC-CORE', kpiId: 'HISTORIC-KPI',
    kpiVersionKey: 'HISTORIC-KPI|v1', targetVersionKey: 'HISTORIC-TARGET|v1', role: 'Delivery', nativeRole: 'Contributor',
    contributionMethod: 'SharedTarget', sharedTargetRule: 'ApprovedApportionment', sharedApportionmentPercent: 0,
    governanceReference: 'historic-rule', denominatorNumerator: 0, denominatorValue: 0, denominatorUnit: 'items',
    denominatorRuleReference: 'historic-denominator-rule', denominatorSourceReference: 'historic-source',
    nativeQuarterOrder: ['Q3','Q1'], weightPercent: 0, targets: { ...slots(),
      annual: { kind: 'NativePair', numericValue: 0, textValue: 'zero separately', editorText: '', success: '' } } }] };
  body.behaviours.entries = [{ valueId: 'BHV-01', descriptorKey: 'historic-descriptor',
    guidancePromptKeys: ['PROMPT-B','PROMPT-A'], selectedPromptKeys: ['PROMPT-A'], commitment: '',
    cadenceClaim: 'TwiceYearly', periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '', H1: 'Retained H1', H2: '' },
    planningLevels: { contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Developing', targetLevel: 'Effective', targetJustification: '' } }];
  body.referenceClaims = { overallDelivery: { configurationKey: 'historic-config', configurationVersion: 'v-old',
    coreWeight: 70, impactWeight: 30, sourceReference: 'KCF-KPI-Sponsor-PD-01' } };
  return body;
};

  return { FictionalSharePoint, employee, manager, other, people, config, retained, seed, ports, clone };
})();

const init = async (): Promise<{ props: IIntegratedPerformanceHubProps; post: jest.Mock }> => {
  const part = new PerformanceHubWebPart(), post = jest.fn();
  Object.assign(part, { context: { spHttpClient: { get: jest.fn(), post },
    pageContext: { web: { absoluteUrl: 'https://fixture-native.invalid/sites/held' },
      user: { email: 'employee@example.invalid', displayName: 'Fictional Employee' } } },
    properties: { description: 'Local source check', nativeWritesHeld: false, enableSave: true }, domElement: document.createElement('div') });
  let props!: IIntegratedPerformanceHubProps;
  const actualDom: typeof ReactDOM = jest.requireActual('react-dom');
  const render = jest.spyOn(actualDom, 'render').mockImplementation((element: unknown) => {
    if (!React.isValidElement<IIntegratedPerformanceHubProps>(element)) throw new Error('Actual host element missing');
    props = element.props;
  });
  try { await (part as unknown as { onInit(): Promise<void> }).onInit(); part.render(); } finally { render.mockRestore(); }
  return { props, post };
};
test('native host always holds writes despite page/query/property Save input', async () => {
  window.history.replaceState({}, '', '/?enableSave=true&nativeWritesHeld=false');
  const x = await init(); expect(x.props.nativeWritesHeld).toBe(true); expect(x.post).not.toHaveBeenCalled();
});
test('native host selects only the fixed full private V3 read route', async () => {
  const x = await init(); expect(x.props.optionEPrivateDraftV3Gateway).toBeDefined(); expect(x.props.optionEDraftGateway).toBeUndefined();
  expect(x.post).not.toHaveBeenCalled();
});
test('native V3 wrapper rejects an actual exact update independently of UI flags', async () => {
  const x = await init(), server = new localV3.FictionalSharePoint(), real = localV3.ports(server);
  await real.controller.open({ performanceYear: 2026 }); const canonical = real.controller.snapshot.canonical!;
  const prepared = await real.gateway.prepare(canonical.aggregate);
  await expect(x.props.optionEPrivateDraftV3Gateway!.updateExact({ context: { performanceYear: 2026 },
    expectedBinding: canonical.binding, itemId: canonical.itemId, expectedEtag: canonical.etag, prepared,
    clientSaveId: 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d', clientSavedAt: '2026-10-11T23:25:00.000Z' })).rejects.toThrow('Draft Save is held');
  expect(x.post).not.toHaveBeenCalled();
});

describe('057 actual package host and local private V3 Save', () => {
  let host: HTMLDivElement;
  let server: InstanceType<typeof localV3.FictionalSharePoint>;
  let part: PerformanceHubWebPart;
  let nativePost: jest.Mock;
  let nativeGet: jest.Mock;
  const props = (): IIntegratedPerformanceHubProps => {
    const spy = jest.spyOn(jest.requireActual<typeof ReactDOM>('react-dom'), 'render');
    try { part.render(); return (spy.mock.calls[spy.mock.calls.length - 1][0] as unknown as React.ReactElement<IIntegratedPerformanceHubProps>).props; }
    finally { spy.mockRestore(); }
  };
  const serviceFor = (actor: IProductionPerson): IProductionDataService => {
    const actual = localV3.ports(server, actor);
    return { getPersonByEmail: async (email: string) => localV3.people.find(person => person.email === email),
      getProductionConfig: async () => localV3.config, getReferenceCounts: async () => ({ activeKpis: 1, approvedAnnualTargets: 1, publishedBehaviours: 1 }),
      getWorkplanStatus: async () => actor.personKey === localV3.employee.personKey ? 'Draft' : 'NotStarted',
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [], getBehaviourObjectiveLibrary: async () => [],
      getDirectReports: async () => [], getQuarterTimingConfig: async () => { throw new Error('Quarter is outside this local fixture'); },
      getEmployeeWorkplanV2: (person: IProductionPerson, year: number) => actual.reader.getEmployeeWorkplanV2(person, year)
    } as unknown as IProductionDataService;
  };
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 32; i += 1) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  };
  const boot = async (actor = localV3.employee, adapter = serviceFor(actor)): Promise<void> => {
    Object.assign(window, { __KCF_PACKAGE_HOST_LAB__: { syntheticReadOnly: true, dataService: adapter,
      adminReportingDataService: {} as IAdminReportingControlDataService, privateDraftTransport: server.client(actor) } });
    part = new PerformanceHubWebPart();
    Object.assign(part, { context: { spHttpClient: { get: nativeGet, post: nativePost },
      pageContext: { web: { absoluteUrl: window.location.origin }, user: { email: actor.email, displayName: actor.displayName } } },
      properties: { description: 'LOCAL / NOT INSTALLED', enableSave: true, nativeWritesHeld: false }, domElement: host });
    await (part as unknown as { onInit(): Promise<void> }).onInit(); await act(async () => { part.render(); }); await flush();
  };
  const button = (text: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(row => row.textContent?.trim() === text);
    if (!found) throw new Error('Missing actual host control: ' + text); return found;
  };
  const navigate = (text: string): void => { act(() => { button(text).click(); }); };
  const editWording = (text: string): void => {
    navigate('Build My Workplan'); navigate('IMPACT KPIs'); navigate('Edit');
    const input = host.querySelector('textarea'); if (!input) throw new Error('Actual IMPACT editor missing');
    act(() => { input.value = text; Simulate.change(input); });
  };
  const save = async (): Promise<void> => { navigate('Review & Weight'); await act(async () => { button('Save Draft').click(); }); await flush(); };
  beforeEach(() => {
    window.history.replaceState({}, '', '/package-host/');
    host = document.createElement('div'); document.body.appendChild(host); server = new localV3.FictionalSharePoint();
    localV3.seed(server, localV3.retained()); nativePost = jest.fn(() => { throw new Error('Native POST forbidden'); });
    nativeGet = jest.fn(() => { throw new Error('Native GET is not part of local transport'); });
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove();
    delete (window as unknown as { __KCF_PACKAGE_HOST_LAB__?: unknown }).__KCF_PACKAGE_HOST_LAB__;
    jest.clearAllMocks(); window.history.replaceState({}, '', '/package-host/');
  });
  test('Save changes only wording, retains full body/pairs/zeros/unset/history and fresh host reopens committed content', async () => {
    const original = localV3.retained(); await boot();
    expect(host.textContent).toContain('LOCAL / NOT INSTALLED'); expect(props().nativeWritesHeld).toBe(true);
    editWording('£ local wording only'); await save();
    const expected = localV3.clone(original); expected.impact[0].wording = '£ local wording only';
    expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(expected);
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
    expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(1);
    expect(nativePost).not.toHaveBeenCalled(); expect(nativeGet).not.toHaveBeenCalled();
    act(() => { ReactDOM.unmountComponentAtNode(host); }); await boot(); navigate('Build My Workplan'); navigate('IMPACT KPIs');
    expect(host.textContent).toContain('£ local wording only');
    expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(expected);
  });
  test('latest externally committed permitted Draft is read on fresh host, rather than cached Saved', async () => {
    await boot(); editWording('First committed'); await save();
    const latest = localV3.retained(); latest.impact[0].wording = 'Later permitted committed wording';
    localV3.seed(server, latest); server.draft['@odata.etag'] = '"draft-20"';
    act(() => { ReactDOM.unmountComponentAtNode(host); }); await boot(); navigate('Build My Workplan'); navigate('IMPACT KPIs');
    expect(host.textContent).toContain('Later permitted committed wording'); expect(host.textContent).not.toContain('First committed');
  });
  test('unset weight stays absent on unrelated Save and explicit zero is written only after its input event', async () => {
    const original = localV3.retained(); delete original.impact[0].personalItemWeight; localV3.seed(server, original);
    await boot(); navigate('Build My Workplan'); await save();
    expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(original);
    const block = Array.from(host.querySelectorAll('h3')).find(row => row.textContent === 'IMPACT')?.closest('section');
    if (!block) throw new Error('Actual IMPACT weight block missing');
    const custom = Array.from(block.querySelectorAll('button')).find(row => row.textContent === 'Custom');
    if (!custom) throw new Error('Actual custom weight control missing'); act(() => { custom.click(); });
    const input = block.querySelector<HTMLInputElement>('input[type="number"]'); if (!input) throw new Error('Actual weight input missing');
    act(() => { input.value = '0'; Simulate.change(input); }); await save();
    const expected = localV3.clone(original); expected.impact[0].personalItemWeight = 0;
    expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(expected);
  });
  test.each(['deny', 'commitThen500'] as const)('%s response settles only through actual matching readback', async outcome => {
    await boot(); server.writeOutcome = outcome; editWording('Recovery wording'); await save();
    expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(1);
    if (outcome === 'commitThen500') expect(host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
    else { expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull(); expect(host.textContent).toContain('retained'); }
    expect(nativePost).not.toHaveBeenCalled();
  });
  test('readback denial leaves recovery held and cannot blindly repeat an uncertain write', async () => {
    await boot(); server.denyReadAfterWrite = true; editWording('Unconfirmed private wording'); await save();
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
    expect(button('Save Draft').disabled).toBe(true); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(1);
  });
  test('412 conflict retains unsaved editor and requires explicit reconciliation', async () => {
    await boot(); editWording('Retained conflict wording'); server.draft['@odata.etag'] = '"draft-foreign"'; await save();
    expect(host.querySelector('[data-option-e-save-status="Conflict"]')).not.toBeNull();
    navigate('IMPACT KPIs');
    expect(host.textContent).toContain('Retained conflict wording'); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(1);
    expect(server.draft.DraftPayloadJSON).not.toContain('Retained conflict wording');
  });
  test('protected header/version replacement prevents private mutation', async () => {
    await boot(); editWording('Stale protected version'); server.header.RowVersionToken = 2; server.header['@odata.etag'] = '"control-2"'; await save();
    expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
  });
  const warnsBeforeUnload = (): boolean => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event); return event.defaultPrevented;
  };
  test('063 failed same-actor annual reload retains warning and reattaches own unsaved intent without writing', async () => {
    await boot(); editWording('Own intent survives failed reload'); expect(warnsBeforeUnload()).toBe(true);
    const unavailable = { ...serviceFor(localV3.employee), getEmployeeWorkplanV2: async () => { throw new Error('Declared local annual read unavailable'); } } as IProductionDataService;
    await boot(localV3.employee, unavailable); expect(warnsBeforeUnload()).toBe(true);
    expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
    await boot(); navigate('Build My Workplan'); navigate('IMPACT KPIs');
    expect(host.textContent).toContain('Own intent survives failed reload'); expect(warnsBeforeUnload()).toBe(true);
    await save(); expect(warnsBeforeUnload()).toBe(false);
    expect(server.draft.DraftPayloadJSON).toContain('Own intent survives failed reload');
  });
  test('063 withdrawn controller preserves own warning and explicit matching canonical reload clears it', async () => {
    await boot(); editWording('Own withdrawn-port intent'); expect(warnsBeforeUnload()).toBe(true);
    const held = { ...props(), optionEPrivateDraftV3Gateway: undefined, optionEDraftGateway: undefined };
    await act(async () => { ReactDOM.render(React.createElement(IntegratedPerformanceHub, held), host); }); await flush();
    expect(warnsBeforeUnload()).toBe(true); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
    const latest = localV3.retained(); latest.impact[0].wording = 'Declared concurrently committed canonical wording';
    localV3.seed(server, latest); server.draft['@odata.etag'] = '"draft-50"';
    await boot(); navigate('Build My Workplan'); navigate('Review & Weight');
    await act(async () => { button('Reload canonical Draft').click(); }); await flush();
    expect(host.textContent).toContain('Retained session changes were discarded by explicit choice.');
    expect(warnsBeforeUnload()).toBe(false); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
  });
  test('066 failed explicit discard preserves own warning and hold, then confirmed discard loads canonical with no write', async () => {
    await boot(); editWording('Keep own intent if explicit discard read fails');
    const latest = localV3.retained(); latest.impact[0].wording = 'Latest canonical after explicit discard';
    localV3.seed(server, latest); server.draft['@odata.etag'] = '"draft-66"';
    await boot(); navigate('Build My Workplan'); navigate('Review & Weight');
    const realClient = server.client.bind(server);
    const denied = jest.spyOn(server, 'client').mockImplementation(actor => {
      const client = realClient(actor); return { ...client, get: async (...args: Parameters<SPHttpClient['get']>) =>
        args[0].includes("getbytitle('KCFKPI_WorkplanDrafts')")
          ? { status: 403, ok: false, json: async () => ({ error: 'Declared explicit discard read unavailable' }), text: async () => 'Declared fixture denial' } as unknown as SPHttpClientResponse
          : client.get(...args) } as SPHttpClient;
    });
    // The currently mounted gateway retains its transport, so replace only its finite store response.
    const originalGet = (server as unknown as { get: (actor: IProductionPerson, url: string) => SPHttpClientResponse }).get.bind(server);
    const finiteGet = jest.spyOn(server as unknown as { get: (actor: IProductionPerson, url: string) => SPHttpClientResponse }, 'get')
      .mockImplementation((actor, url) => url.includes("getbytitle('KCFKPI_WorkplanDrafts')")
        ? { status: 403, ok: false, json: async () => ({}), text: async () => 'Declared private fixture unavailable' } as unknown as SPHttpClientResponse
        : originalGet(actor, url));
    try { await act(async () => { button('Reload canonical Draft').click(); }); await flush();
      expect(warnsBeforeUnload()).toBe(true); expect(button('Save Draft').disabled).toBe(true);
      expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
      expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
    } finally { finiteGet.mockRestore(); denied.mockRestore(); }
    expect(button('Reload canonical Draft').matches(':disabled')).toBe(false);
    await act(async () => { button('Reload canonical Draft').click(); }); await flush();
    expect(warnsBeforeUnload()).toBe(false); expect(host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
    navigate('IMPACT KPIs'); expect(host.textContent).toContain('Latest canonical after explicit discard');
    expect(host.textContent).not.toContain('Keep own intent if explicit discard read fails');
    expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
  });
  test('063 failed private canonical open retains own warning until successful matching recovery Save', async () => {
    await boot(); editWording('Own intent survives private open denial');
    const source = serviceFor(localV3.employee);
    const knownHeader = await source.getEmployeeWorkplanV2(localV3.employee, 2026);
    const headerOnly = { ...source, getEmployeeWorkplanV2: async () => knownHeader } as IProductionDataService;
    const realClient = server.client.bind(server);
    const privateUnavailable = jest.spyOn(server, 'client').mockImplementation(actor => {
      const client = realClient(actor);
      return { ...client, get: async (...args: Parameters<SPHttpClient['get']>) =>
        args[0].includes("getbytitle('KCFKPI_WorkplanDrafts')")
          ? { status: 403, ok: false, json: async () => ({ error: 'Declared private fixture read unavailable' }), text: async () => 'Declared fixture denial' } as unknown as SPHttpClientResponse
          : client.get(...args) } as SPHttpClient;
    });
    try { await boot(localV3.employee, headerOnly); expect(warnsBeforeUnload()).toBe(true);
      expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
    } finally { privateUnavailable.mockRestore(); }
    await boot(); navigate('Build My Workplan'); navigate('IMPACT KPIs');
    expect(host.textContent).toContain('Own intent survives private open denial'); await save();
    expect(warnsBeforeUnload()).toBe(false); expect(server.draft.DraftPayloadJSON).toContain('Own intent survives private open denial');
  });
  test.each([localV3.manager, localV3.other])('063 actor replacement %s clears former private recovery warning after unavailable reload', async actor => {
    await boot(); editWording('Former private warning intent');
    const unavailable = { ...serviceFor(localV3.employee), getEmployeeWorkplanV2: async () => { throw new Error('Declared local annual read unavailable'); } } as IProductionDataService;
    await boot(localV3.employee, unavailable); await boot(actor);
    expect(warnsBeforeUnload()).toBe(false); expect(host.textContent).not.toContain('Former private warning intent');
    expect(host.textContent).not.toContain('Retained private reason'); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
  });
  test('same actor session replacement preserves safe unsaved buffer with no implicit write', async () => {
    await boot(); editWording('Same actor unsaved recovery'); await boot();
    navigate('Build My Workplan'); navigate('IMPACT KPIs'); expect(host.textContent).toContain('Same actor unsaved recovery');
    expect(host.textContent).toContain('not been saved'); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
    await save(); expect(server.draft.DraftPayloadJSON).toContain('Same actor unsaved recovery');
  });
  test.each([localV3.manager, localV3.other])('cross actor %s never receives the former private buffer or result', async actor => {
    await boot(); editWording('Former actor PRIVATE buffer'); await boot(actor);
    expect(host.textContent).not.toContain('Former actor PRIVATE buffer'); expect(host.textContent).not.toContain('Retained private reason');
    expect(host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull(); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
  });
  test('same actor changed canonical requires explicit reapply while retaining prior unsaved intent', async () => {
    await boot(); editWording('Earlier retained intent'); const latest = localV3.retained(); latest.impact[0].wording = 'Concurrent committed';
    localV3.seed(server, latest); server.draft['@odata.etag'] = '"draft-30"'; await boot();
    navigate('Build My Workplan'); navigate('Review & Weight'); expect(button('Save Draft').disabled).toBe(true);
    expect(host.textContent).toContain('earlier unsaved changes'); navigate('Reapply retained changes');
    expect(button('Save Draft').disabled).toBe(false); await save();
    expect(server.draft.DraftPayloadJSON).toContain('Earlier retained intent'); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(1);
  });
  test('all unrelated service writes stay held and Submit remains disabled', async () => {
    await boot(); const current = props(); navigate('Build My Workplan'); navigate('Review & Weight');
    expect(button('Submit Workplan').disabled).toBe(true);
    const service = current.dataService as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
    for (const method of ['createEmployeeWorkplanDraftV2', 'saveEmployeeWorkplanDraftV2', 'submitEmployeeWorkplanV2',
      'requestEmployeeWorkplanChangesV2', 'approveAndLockEmployeeWorkplanV2', 'saveEmployeeQuarterUpdateV2', 'saveQuarterManagerOverride']) {
      await expect(service[method]()).rejects.toThrow('writes are blocked');
    }
    expect(nativePost).not.toHaveBeenCalled(); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
  });
  test('SharePoint-context host ignores injected loopback fixture transport and cannot lift native holds', async () => {
    await boot(); const fixtureWrites = server.requests.filter(row => row.method === 'POST').length;
    const native = await init();
    expect(native.props.nativeWritesHeld).toBe(true);
    expect(native.props.optionEPrivateDraftV3Gateway).not.toBeInstanceOf(LocalPrivateDraftV3Gateway);
    expect(native.post).not.toHaveBeenCalled(); expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(fixtureWrites);
  });
  test('moving off exact loopback route revokes synthetic write even when a caller flag says available', async () => {
    await boot(); const current = props(); expect(current.optionEPrivateDraftV3Gateway).toBeInstanceOf(LocalPrivateDraftV3Gateway);
    window.history.replaceState({}, '', '/different-route/?enableSave=true');
    const priorRequests = server.requests.length;
    await expect(current.optionEPrivateDraftV3Gateway!.read({ performanceYear: 2026 })).rejects.toThrow('inaccessible');
    expect(server.requests).toHaveLength(priorRequests);
    expect(server.requests.filter(row => row.method === 'POST')).toHaveLength(0);
  });
});
