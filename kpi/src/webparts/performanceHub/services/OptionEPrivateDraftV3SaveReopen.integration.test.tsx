/* eslint-disable @rushstack/pair-react-dom-render-unmount -- mounted test hosts are unmounted in afterEach and before the fresh reopen */
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import type { SPHttpClient, SPHttpClientConfiguration, SPHttpClientResponse } from '@microsoft/sp-http';
import type { IProductionConfig, IProductionPerson, ICoreKpiCatalogueItem } from '../models/ProductionModels';
import { type IOptionEWorkplanDraftV3Aggregate as IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftV3Models';
import { canonicaliseOptionEPartialDraftV3 as canonicaliseOptionEPartialDraft } from './OptionEWorkplanDraftV3Wire';
import { OptionEDraftSaveController } from '../components/OptionEDraftSaveController';
import IntegratedPerformanceHub from '../components/IntegratedPerformanceHub';
import type { IProductionDataService } from './IProductionDataService';
import type { IAdminReportingControlDataService } from './AdminReportingControlDataService';
import SharePointEmployeeWorkplanV2PersistenceService from './SharePointEmployeeWorkplanV2PersistenceService';
import { OptionEDraftSharePointGateway, type IOptionEDraftGateway } from './OptionEDraftSharePointGateway';
import { OptionEProtectedDraftGateway } from './OptionEProtectedDraftGateway';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './OptionEWorkplanListBindings';
import { createOptionEProductionDataServiceFacade } from './OptionEProductionDataServiceFacade';

// Supply actual standard runtime APIs missing from jsdom; no source hasher/UUID stub is substituted.
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const originalEncoder = globalThis.TextEncoder;
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
});
afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  globalThis.TextEncoder = originalEncoder;
});

// Declared local transport, not a live TEST site, identity, ACL or installed-host admission.
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
const openScreen = async (server: FictionalSharePoint, catalogue: readonly ICoreKpiCatalogueItem[] = []): Promise<{
  host: HTMLDivElement; button(label: string): HTMLButtonElement; flush(): Promise<void>; close(): void;
  change(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void;
  replaceGateway(gateway: IOptionEDraftGateway<IOptionEWorkplanDraftAggregate>): Promise<void>;
}> => {
  const host = document.createElement('div'); document.body.appendChild(host);
  const real = ports(server), adapter = {
    getPersonByEmail: async (email: string) => people.find(p => p.email === email), getProductionConfig: async () => config,
    getReferenceCounts: async () => ({ activeKpis: 1, approvedAnnualTargets: 1, publishedBehaviours: 1 }), getWorkplanStatus: async () => 'Draft',
    getBehaviourObjectiveLibrary: async () => [], getCoreKpiCatalogue: async () => catalogue, getPublishedBehaviours: async () => [],
    getQuarterTimingConfig: async () => { throw Error('Quarter outside declared fixture'); },
    getEmployeeWorkplanV2: (actor: IProductionPerson, year: number) => real.reader.getEmployeeWorkplanV2(actor, year)
  } as unknown as IProductionDataService;
  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
    if (!found) throw Error('Missing visible button: ' + label); return found;
  };
  const flush = async (): Promise<void> => { for (let i = 0; i < 32; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
  const close = (): void => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); };
  const change = (element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void => {
    if (!element) throw Error('Expected editable field was absent');
    act(() => { element.value = value; Simulate.change(element); });
  };
  const facade = createOptionEProductionDataServiceFacade(adapter, undefined, undefined, true);
  const render = async (gateway: IOptionEDraftGateway<IOptionEWorkplanDraftAggregate>): Promise<void> => {
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub
      dataService={facade} adminReportingDataService={{} as IAdminReportingControlDataService}
      currentUserEmail={employee.email} userDisplayName={employee.displayName} optionEPrivateDraftV3Gateway={gateway} />, host); });
    await flush();
  };
  try {
    await render(real.gateway); act(() => button('Build My Workplan').click()); await flush(); act(() => button('IMPACT KPIs').click());
    return { host, button, flush, close, change, replaceGateway: render };
  } catch (error) { close(); throw error; }
};

describe('V3 actual ports and editor Save/fresh Reopen', () => {
 it('actual Root Core reselection/Owner event cannot rewrite another row whose logical ID equals the KPI key', async()=>{
  const server=new FictionalSharePoint(),body=retained(),a=body.core.entries[0];
  a.kpiId='SO1-013';a.coreId='SO1-014';a.kpiVersionKey='A|v1';a.targetVersionKey='A-TARGET|v1';
  const b={...clone(a),coreId:'CORE-B',kpiId:'SO1-014',kpiVersionKey:'B|v1',targetVersionKey:'B-TARGET|v1'};body.core.entries.push(b);seed(server,body);
  const catalogue:ICoreKpiCatalogueItem[]=['SO1-013','SO1-014'].map(kpiId=>({kpiId,kpiVersionKey:kpiId+'|current',targetVersionKey:kpiId+'|current-target',
   wording:'Declared current source',pillar:'Participation',workstream:'Schools',scoringDirection:'HigherIsBetter',unitLabel:'items'}));
  const screen=await openScreen(server,catalogue);
  const click=(label:string):void=>{const card=screen.host.querySelector('aside [data-kpi-id="SO1-014"]')!;
   const button=Array.from(card.querySelectorAll('button')).find(el=>el.textContent?.trim()===label)!;act(()=>button.click());};
  try {
   act(()=>screen.button('Core KPIs').click());click('Edit');click('Remove from Workplan');
   act(()=>{(screen.host.querySelector('button[aria-label="Add SO1-014 to Workplan"]') as HTMLButtonElement).click();});
   click('Edit');click('I OWN THIS');act(()=>screen.button('Review & Weight').click());
   await act(async()=>screen.button('Save Draft').click());await screen.flush();
   const saved=await ports(server).controller.open({performanceYear:2026});
   expect(saved.core.entries.find(row=>row.coreId==='SO1-014')).toEqual({...a,weightPercent:50});
   expect(saved.core.entries.find(row=>row.coreId==='CORE-B')?.nativeRole).toBe('AccountableOwner');
   expect(server.requests.filter(r=>r.method==='POST')).toHaveLength(1);
  } finally {screen.close();}
 });
 it('actual Root Support choice saves and freshly reopens with an admitted Support alias', async()=>{
  const server=new FictionalSharePoint(),body=retained();body.core.entries[0].kpiId='SO1-013';seed(server,body);
  const screen=await openScreen(server);
  try {
   act(()=>screen.button('Core KPIs').click());act(()=>screen.button('Edit').click());act(()=>screen.button('I SUPPORT / OVERSEE THIS').click());
   act(()=>screen.button('Review & Weight').click());await act(async()=>screen.button('Save Draft').click());await screen.flush();
   expect(screen.host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
   const saved=await ports(server).controller.open({performanceYear:2026});expect(saved.core.entries[0].role).toBe('Support');
   expect(saved.core.entries[0].nativeRole).toBe('Oversight');expect(saved.core.entries[0].targets).toEqual(body.core.entries[0].targets);
   expect(server.requests.filter(r=>r.method==='POST')).toHaveLength(1);
  } finally {screen.close();}
 });
 // Two mounts and five 32-turn real-timer drains (160 turns): CI exceeded 5s; diagnosis took 2990/2938ms. Test budget, not app latency.
 it.each([true,false])('actual Core Remove/Add/Save/close/fresh Reopen keeps the selected definition, matchingIDs=%s', async matchingIds => {
  const server=new FictionalSharePoint(),body=retained(),savedCore=body.core.entries[0];
  savedCore.kpiId='SO1-013';savedCore.coreId=matchingIds?'SO1-013':'HISTORIC-CORE-IDENTITY';seed(server,body);
  const catalogue: ICoreKpiCatalogueItem[]=[{kpiId:'SO1-013',kpiVersionKey:'SO1-013|current',targetVersionKey:'SO1-013|2026|current',
   wording:'Declared current source',pillar:'Participation',workstream:'Schools',scoringDirection:'HigherIsBetter',unitLabel:'items'}];
  const screen=await openScreen(server,catalogue);
  try {
   act(()=>screen.button('Core KPIs').click());act(()=>screen.button('Edit').click());act(()=>screen.button('Remove from Workplan').click());
   const add=screen.host.querySelector('button[aria-label="Add SO1-013 to Workplan"]') as HTMLButtonElement;
   expect(add).not.toBeNull();act(()=>add.click());
   act(()=>screen.button('Review & Weight').click());await act(async()=>screen.button('Save Draft').click());await screen.flush();
   const expected=clone(body);expected.core.entries[0].weightPercent=100;
   expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(expected);
  } finally {screen.close();}
  const fresh=await openScreen(server,catalogue);try {
   act(()=>fresh.button('Core KPIs').click());expect(fresh.host.querySelector('aside [data-kpi-id="SO1-013"]')).not.toBeNull();
   expect(await ports(server).controller.open({performanceYear:2026})).toEqual(JSON.parse(server.draft.DraftPayloadJSON as string));
  } finally {fresh.close();}
 }, 10000);
 it('does not display Saved after a committed write whose protected readback is denied and cannot blindly retry', async () => {
  const server = new FictionalSharePoint(), real = ports(server); await real.controller.open({ performanceYear: 2026 });
  real.controller.replaceBuffer(weighted()); server.denyReadAfterWrite = true;
  const result = await real.controller.save(); expect(result.status).toBe('NotSaved'); expect(result.requiresCanonicalReopen).toBe(true);
  expect(result.buffer).toEqual(weighted()); expect(real.controller.shouldWarnBeforeUnload()).toBe(true);
  await real.controller.save(); expect(server.requests.filter(r => r.method === 'POST')).toHaveLength(1);
  server.denyReadAfterWrite = false; expect(await ports(server).controller.open({ performanceYear: 2026 })).toEqual(weighted());
 });
 it('clears the former V3 Saved receipt and private editor when its source gateway is replaced', async () => {
  const server = new FictionalSharePoint(); seed(server, weighted()); const screen = await openScreen(server);
  try {
   act(() => screen.button('Review & Weight').click()); expect(screen.host.querySelector('[data-option-e-save-status="Saved"]')).not.toBeNull();
   await screen.replaceGateway(ports(server, other).gateway);
   expect(screen.host.querySelector('[data-option-e-save-status="Saved"]')).toBeNull();
   expect(screen.host.querySelector('fieldset[aria-label="Workplan editable fields"]')?.hasAttribute('disabled')).toBe(true);
   expect(server.requests.filter(r => r.method === 'POST')).toHaveLength(0);
  } finally { screen.close(); }
 });
 it('changes only wording through the screen and retains the full private body after a fresh reopen', async () => {
  const server = new FictionalSharePoint(), original = retained(); seed(server, original);
  const screen = await openScreen(server);
  try {
   act(() => screen.button('Edit').click()); screen.change(screen.host.querySelector('textarea')!, '£ newly retained wording');
   act(() => screen.button('Review & Weight').click()); await act(async () => screen.button('Save Draft').click()); await screen.flush();
   const expected = clone(original); expected.impact[0].wording = '£ newly retained wording';
   expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(expected);
   expect(await ports(server).controller.open({ performanceYear: 2026 })).toEqual(expected);
   expect(server.requests.filter(r => r.method === 'POST')).toHaveLength(1);
  } finally { screen.close(); }
  const fresh = await openScreen(server); try { expect(fresh.host.textContent).toContain('£ newly retained wording'); } finally { fresh.close(); }
 });
 it('shows saved unparsed target text faithfully and preserves raw native pairs when the text changes', async () => {
  const server = new FictionalSharePoint(), original = retained(); seed(server, original); const screen = await openScreen(server);
  try {
   act(() => screen.button('Edit').click());
   const input = screen.host.querySelector('input[id$="-annual"]') as HTMLInputElement;
   expect(input.value).toBe('001% pending'); screen.change(input, '002% pending');
   act(() => screen.button('Review & Weight').click()); await act(async () => screen.button('Save Draft').click()); await screen.flush();
   const expected = clone(original); expected.impact[0].targets.annual.editorText = '002% pending';
   expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(expected);
  } finally { screen.close(); }
 });
 it('keeps an unset weight absent on unrelated Save and writes explicit zero only after its actual input event', async () => {
  const server = new FictionalSharePoint(), original = retained(); delete original.impact[0].personalItemWeight; seed(server, original);
  const screen = await openScreen(server);
  try {
   act(() => screen.button('Review & Weight').click()); await act(async () => screen.button('Save Draft').click()); await screen.flush();
   expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(original);
   const block = Array.from(screen.host.querySelectorAll('h3')).find(h => h.textContent === 'IMPACT')!.closest('section')!;
   act(() => Array.from(block.querySelectorAll('button')).find(b => b.textContent === 'Custom')!.click());
   screen.change(block.querySelector('input[type="number"]')!, '0');
   await act(async () => screen.button('Save Draft').click()); await screen.flush();
   const expected = clone(original); expected.impact[0].personalItemWeight = 0;
   expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(expected);
  } finally { screen.close(); }
 });
 it('does not reuse an inactive retained IMPACT ID when creating another KPI', async () => {
  const server = new FictionalSharePoint(), original = weighted(); original.impact[0].impactId = 'personal-1'; original.impact[0].activeInWorkplan = false; seed(server, original);
  const screen = await openScreen(server);
  try {
   act(() => screen.button('Create IMPACT KPI').click()); screen.change(screen.host.querySelector('textarea')!, 'New visible item');
   act(() => screen.button('Review & Weight').click()); await act(async () => screen.button('Save Draft').click()); await screen.flush();
   const saved = JSON.parse(server.draft.DraftPayloadJSON as string) as IOptionEWorkplanDraftAggregate;
   expect(saved.impact[0]).toEqual(original.impact[0]); expect(saved.impact).toHaveLength(2);
   expect(saved.impact[1].impactId).not.toBe('personal-1'); expect(saved.impact[1].wording).toBe('New visible item');
  } finally { screen.close(); }
  const fresh = await openScreen(server); try { expect(fresh.host.textContent).toContain('New visible item'); } finally { fresh.close(); }
 });
 it('shows an unfinished measure as unselected instead of displaying a fabricated Number measure', async () => {
  const server = new FictionalSharePoint(), original = weighted(); original.impact[0].editorDefinition.measure = ''; seed(server, original);
  const screen = await openScreen(server);
  try {
   act(() => screen.button('Edit').click()); const select = screen.host.querySelector('select[id$="-measure"]') as HTMLSelectElement;
   expect(select.value).toBe(''); expect(select.selectedOptions[0].textContent).toBe('Not selected');
   act(() => screen.button('Review & Weight').click()); await act(async () => screen.button('Save Draft').click()); await screen.flush();
   expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(original);
  } finally { screen.close(); }
 });
 it('retains a stale screen edit on412, explicitly reapplies it and saves against the fresh exact ETag', async () => {
  const server = new FictionalSharePoint(); seed(server, weighted()); const screen = await openScreen(server);
  try {
   act(() => screen.button('Edit').click()); screen.change(screen.host.querySelector('textarea')!, 'Retained losing client wording');
   const winner = ports(server); await winner.controller.open({ performanceYear: 2026 });
   const remote = weighted(); remote.impact[0].wording = 'Winning client wording'; winner.controller.replaceBuffer(remote);
   expect((await winner.controller.save()).status).toBe('Saved');
   act(() => screen.button('Review & Weight').click()); await act(async () => screen.button('Save Draft').click()); await screen.flush();
   expect(screen.host.querySelector('[data-option-e-save-status]')?.getAttribute('data-option-e-save-status')).toBe('Conflict');
   expect(JSON.parse(server.draft.DraftPayloadJSON as string).impact[0].wording).toBe('Winning client wording');
   act(() => screen.button('Reapply retained changes').click()); await act(async () => screen.button('Save Draft').click()); await screen.flush();
   expect(screen.host.querySelector('[data-option-e-save-status]')?.getAttribute('data-option-e-save-status')).toBe('Saved');
   expect(JSON.parse(server.draft.DraftPayloadJSON as string).impact[0].wording).toBe('Retained losing client wording');
   expect(server.requests.filter(r => r.method === 'POST').map(r => r.status)).toEqual([204,412,204]);
  } finally { screen.close(); }
 });
 it.each(['deny','commitThen500','wrongReadback'] as const)('classifies %s without automatic duplicate writes', async outcome => {
  const server = new FictionalSharePoint(), real = ports(server); await real.controller.open({ performanceYear: 2026 });
  real.controller.replaceBuffer(weighted()); server.writeOutcome = outcome; const result = await real.controller.save();
  expect(result.status).toBe(outcome === 'commitThen500' ? 'Saved' : outcome === 'wrongReadback' ? 'Conflict' : 'NotSaved');
  expect(result.retainedBuffer).toBe(outcome !== 'commitThen500');
  expect(server.requests.filter(r => r.method === 'POST')).toHaveLength(1);
 });
 it('requires a fresh protected V3 header before writing and refuses both fictional foreign roles', async () => {
  const server = new FictionalSharePoint(), real = ports(server); await real.controller.open({ performanceYear: 2026 });
  real.controller.replaceBuffer(weighted()); server.header.RowVersionToken = 2; server.header['@odata.etag'] = '"control-2"';
  expect((await real.controller.save()).status).toBe('Conflict'); expect(server.requests.filter(r => r.method === 'POST')).toHaveLength(0);
  await expect(ports(server, manager).controller.open({ performanceYear: 2026 })).rejects.toThrow();
  await expect(ports(server, other).controller.open({ performanceYear: 2026 })).rejects.toThrow();
 });
 it('retains a normal100 planning weight through real fourfieldwrite and fresh instances', async () => {
  const server=new FictionalSharePoint(), first=ports(server), header=clone(server.header);
  await first.controller.open({performanceYear:2026});first.controller.replaceBuffer(weighted());
  expect((await first.controller.save()).status).toBe('Saved');
  expect(await ports(server).controller.open({performanceYear:2026})).toEqual(weighted());
  expect(server.header).toEqual(header);expect(server.requests.filter(r=>r.method==='POST')).toHaveLength(1);
 });
 it('normal UI Create IMPACT100 -> Save -> unmount -> fresh UI reopens the actual weight', async () => {
  const server=new FictionalSharePoint(), host=document.createElement('div');document.body.appendChild(host);
  const button=(label:string):HTMLButtonElement=>{const found=Array.from(host.querySelectorAll('button')).find(b=>b.textContent?.trim()===label);if(!found)throw Error('Missingbutton '+label+' '+host.textContent);return found;};
  const flush=async():Promise<void>=>{for(let i=0;i<32;i++)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});};
  const mount=async():Promise<void>=>{
   const real=ports(server),adapter={getPersonByEmail:async(email:string)=>people.find(p=>p.email===email),getProductionConfig:async()=>config,
    getReferenceCounts:async()=>({activeKpis:1,approvedAnnualTargets:1,publishedBehaviours:1}),getWorkplanStatus:async()=>'Draft',
    getBehaviourObjectiveLibrary:async()=>[],getCoreKpiCatalogue:async()=>[],getPublishedBehaviours:async()=>[],
    getQuarterTimingConfig:async()=>{throw Error('Quarteroutsidefixture');},
    getEmployeeWorkplanV2:(actor:IProductionPerson,year:number)=>real.reader.getEmployeeWorkplanV2(actor,year)} as unknown as IProductionDataService;
   const props={dataService:createOptionEProductionDataServiceFacade(adapter,undefined,undefined,true),adminReportingDataService:{} as IAdminReportingControlDataService,
    currentUserEmail:employee.email,userDisplayName:employee.displayName,optionEPrivateDraftV3Gateway:real.gateway};
   await act(async()=>{ReactDOM.render(<IntegratedPerformanceHub {...props}/>,host);});await flush();
   act(()=>button('Build My Workplan').click());await flush();act(()=>button('IMPACT KPIs').click());
  };
  try {
   await mount();act(()=>button('Create IMPACT KPI').click());
   const input=host.querySelector('textarea');if(!input)throw Error('NewImpactwording noteditable');
   act(()=>{input.value='A newly saved weighted outcome';Simulate.change(input);});
   act(()=>button('Review & Weight').click());await act(async()=>button('Save Draft').click());await flush();
   const body=JSON.parse(server.draft.DraftPayloadJSON as string) as IOptionEWorkplanDraftAggregate;
   expect(body.impact).toHaveLength(1);expect(body.impact[0].personalItemWeight).toBe(100);expect(body.impact[0].wording).toBe('A newly saved weighted outcome');
   expect(server.requests.filter(r=>r.method==='POST')).toHaveLength(1);
   act(()=>{ReactDOM.unmountComponentAtNode(host);});await mount();
   expect(host.textContent).toContain('A newly saved weighted outcome');
   act(()=>button('Review & Weight').click());
   const weightBlock=Array.from(host.querySelectorAll('h3')).find(h=>h.textContent?.trim()==='IMPACT')?.closest('section');
   expect(weightBlock?.querySelector('strong')?.textContent).toBe('100%');
   const custom=Array.from(weightBlock?.querySelectorAll('button') || []).find(b=>b.textContent==='Custom');
   if(!custom)throw Error('Existing IMPACT weighting controls unavailable');act(()=>custom.click());
   expect((weightBlock?.querySelector('input[type="number"]') as HTMLInputElement)?.value).toBe('100');
  } finally {act(()=>{ReactDOM.unmountComponentAtNode(host);});host.remove();}
 });
});
