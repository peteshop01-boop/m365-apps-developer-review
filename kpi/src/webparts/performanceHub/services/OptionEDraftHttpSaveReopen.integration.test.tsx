/* eslint-disable @rushstack/pair-react-dom-render-unmount -- mounted test hosts are unmounted in afterEach and before the fresh reopen */
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import type { SPHttpClient, SPHttpClientConfiguration, SPHttpClientResponse } from '@microsoft/sp-http';
import type { IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import { canonicaliseOptionEPartialDraft, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import { OptionEDraftSaveController } from '../components/OptionEDraftSaveController';
import IntegratedPerformanceHub from '../components/IntegratedPerformanceHub';
import type { IProductionDataService } from './IProductionDataService';
import type { IAdminReportingControlDataService } from './AdminReportingControlDataService';
import SharePointEmployeeWorkplanV2PersistenceService from './SharePointEmployeeWorkplanV2PersistenceService';
import { OptionEDraftSharePointGateway } from './OptionEDraftSharePointGateway';
import { OptionEProtectedDraftGateway } from './OptionEProtectedDraftGateway';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './OptionEWorkplanListBindings';
import { createOptionEProductionDataServiceFacade } from './OptionEProductionDataServiceFacade';
import { loadProductionOverview } from './ProductionOverviewLoader';

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
const initialAggregate = (): IOptionEWorkplanDraftAggregate => ({ schemaVersion: 'kcf.workplan-draft/v1',
  core: { weightingMode: 'Equal', entries: [] },
  impact: [{ impactId: 'FICTION-IMPACT-1', wording: 'Deliver one fictional outcome', measure: 'Number / Quantity',
    unit: 'items', annual: 0, q1: 0, q2: 0, q3: 0, q4: 0, success: 'Exact fictional result' }],
  behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER', entries: [] } });
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
    RowVersionToken: 1, DraftItemId: '17', DraftSchemaVersion: 'kcf.workplan-draft/v1', PendingRequestKey: '' };
  public readonly draft: Record<string, unknown>;
  public writeOutcome: 'success' | 'deny' | 'commitThen500' | 'wrongReadback' = 'success';
  public itemsPresent = false;
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
      if (actor.email !== employee.email) { status = 403; body = { error: 'Declared fictional own-item policy denied.' }; }
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
  reader: SharePointEmployeeWorkplanV2PersistenceService; gateway: OptionEProtectedDraftGateway;
  leaf: OptionEDraftSharePointGateway; controller: OptionEDraftSaveController;
} => {
  const client = server.client(actor), configuration = {} as SPHttpClientConfiguration;
  const leaf = new OptionEDraftSharePointGateway(client, site, OPTION_E_WORKPLAN_LIST_BINDINGS, configuration);
  const gateway = new OptionEProtectedDraftGateway(client, site, actor.email, OPTION_E_WORKPLAN_LIST_BINDINGS, configuration, leaf);
  return { reader: new SharePointEmployeeWorkplanV2PersistenceService(client, site, actor.email), gateway, leaf,
    controller: new OptionEDraftSaveController(gateway, () => 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d', () => new Date('2026-10-11T00:30:00.000Z')) };
};
const changed = (wording = 'Saved fictional wording: café 🏏.'): IOptionEWorkplanDraftAggregate => {
  const value = initialAggregate(); value.impact[0].wording = wording; return value;
};

describe('real Draft ports on a declared stateful local HTTP transport', () => {
  it('writes exactly four fields with native ETag and fresh instances reopen exact persisted bytes', async () => {
    const server = new FictionalSharePoint(), first = ports(server), originalHeader = clone(server.header);
    const header = await first.reader.getEmployeeWorkplanV2(employee, 2026);
    expect({ core: header?.workplan.coreCategoryWeight, personal: header?.workplan.personalCategoryWeight,
      behaviours: header?.workplan.behaviourCategoryWeight }).toEqual(config.weights);
    await first.controller.open({ performanceYear: 2026 });
    first.controller.replaceBuffer(changed());
    const saved = await first.controller.save();
    expect(saved.status).toBe('Saved');
    const posts = server.requests.filter(request => request.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].headers?.['IF-MATCH']).toBe('"draft-1"');
    expect(posts[0].body?.DraftPayloadJSON).toBe(canonicaliseOptionEPartialDraft(changed()));
    expect(posts[0].body?.DraftPayloadSHA256).toBe(hash(posts[0].body!.DraftPayloadJSON));
    expect(server.header).toEqual(originalHeader);
    const fresh = ports(server);
    expect(await fresh.controller.open({ performanceYear: 2026 })).toEqual(changed());
    expect(fresh.controller.snapshot.canonical?.etag).toBe('"draft-2"');
    expect(fresh.controller.snapshot.canonical?.clientSaveId).toBe(posts[0].body?.ClientSaveID);
    expect(server.requests.filter(request => request.url.includes('WorkplanItems')).every(request => new URL(request.url).searchParams.get('$select') === 'Id,WorkplanKey')).toBe(true);
  });
  it.each([manager, other])('keeps fictional $displayName outside another employee private route', async actor => {
    const server = new FictionalSharePoint(), own = ports(server), foreign = ports(server, actor);
    const canonical = await own.gateway.read({ performanceYear: 2026 });
    const prepared = await own.gateway.prepare(changed());
    await expect(foreign.gateway.read({ performanceYear: 2026 })).rejects.toThrow();
    await expect(foreign.leaf.readExact(17)).rejects.toThrow();
    await expect(foreign.gateway.updateExact({ context: { performanceYear: 2026 }, expectedBinding: canonical.binding,
      itemId: 17, expectedEtag: canonical.etag, prepared, clientSaveId: 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d',
      clientSavedAt: '2026-10-11T00:30:00.000Z' })).rejects.toThrow();
    expect(server.requests.filter(request => request.method === 'POST')).toHaveLength(0);
    expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(initialAggregate());
  });
  it('retains real buffer on native412 and does not replace remote data', async () => {
    const server = new FictionalSharePoint(), first = ports(server);
    await first.controller.open({ performanceYear: 2026 }); first.controller.replaceBuffer(changed());
    server.draft['@odata.etag'] = '"draft-changed-elsewhere"';
    expect((await first.controller.save()).status).toBe('Conflict');
    expect(first.controller.snapshot.buffer).toEqual(changed());
    expect(first.controller.snapshot.retainedBuffer).toBe(true);
    expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(initialAggregate());
  });
  it('does not MERGE when protected header changes after open', async () => {
    const server = new FictionalSharePoint(), first = ports(server);
    await first.controller.open({ performanceYear: 2026 }); first.controller.replaceBuffer(changed());
    server.header['@odata.etag'] = '"control-2"'; server.header.RowVersionToken = 2;
    expect((await first.controller.save()).status).not.toBe('Saved');
    expect(first.controller.snapshot.buffer).toEqual(changed());
    expect(server.requests.filter(request => request.method === 'POST')).toHaveLength(0);
  });
  it('recovers committed500 only through actual exact byte/id/time readback', async () => {
    const server = new FictionalSharePoint(), first = ports(server); server.writeOutcome = 'commitThen500';
    await first.controller.open({ performanceYear: 2026 }); first.controller.replaceBuffer(changed());
    expect((await first.controller.save()).status).toBe('Saved');
    expect(server.requests.find(request => request.method === 'POST')?.status).toBe(500);
    expect(await ports(server).controller.open({ performanceYear: 2026 })).toEqual(changed());
  });
  it('rejects different valid persisted content rather than accepting successful204', async () => {
    const server = new FictionalSharePoint(), first = ports(server); server.writeOutcome = 'wrongReadback';
    await first.controller.open({ performanceYear: 2026 }); first.controller.replaceBuffer(changed());
    expect((await first.controller.save()).status).not.toBe('Saved');
    expect(first.controller.snapshot.retainedBuffer).toBe(true);
    expect(first.controller.snapshot.buffer).toEqual(changed());
  });
  it('keeps rich-schema dependency when any normalised row exists', async () => {
    const server = new FictionalSharePoint(); server.itemsPresent = true;
    await expect(ports(server).reader.getEmployeeWorkplanV2(employee, 2026)).rejects.toThrow();
    expect(server.requests.filter(request => request.method === 'POST')).toHaveLength(0);
    expect(server.requests.some(request => request.url.includes('WorkplanItems') && request.status === 400)).toBe(true);
  });
});

describe('actual UI and native-shaped Draft ports through Save/unmount/fresh mount', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === label);
    if (!found) throw new Error('Missing UI button: ' + label + '; rendered: ' + host.textContent); return found;
  };
  const flush = async (): Promise<void> => { for (let i = 0; i < 32; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
  const mount = async (server: FictionalSharePoint, held = false): Promise<void> => {
    const real = ports(server);
    // Only unaffected overview/reference ports are declared fixtures; Workplan read and all Draft ports are real source.
    const adapter = { getPersonByEmail: async (email: string) => people.find(person => person.email === email),
      getProductionConfig: async () => config, getReferenceCounts: async () => ({ activeKpis: 1, approvedAnnualTargets: 1, publishedBehaviours: 1 }),
      getWorkplanStatus: async () => 'Draft', getBehaviourObjectiveLibrary: async () => [],
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
      getQuarterTimingConfig: async () => { throw new Error('Quarter timing is outside this declared local Save fixture.'); },
      getEmployeeWorkplanV2: (actor: IProductionPerson, year: number) => real.reader.getEmployeeWorkplanV2(actor, year)
    } as unknown as IProductionDataService;
    const facade = createOptionEProductionDataServiceFacade(adapter, undefined, undefined, true);
    expect((await loadProductionOverview(facade, employee.email)).employee).toEqual(employee);
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={facade}
      adminReportingDataService={{} as IAdminReportingControlDataService} currentUserEmail={employee.email}
      userDisplayName={employee.displayName} optionEDraftGateway={real.gateway} nativeWritesHeld={held} />, host); });
    await flush();
    act(() => button('Build My Workplan').click());
    await flush();
  };
  const edit = (): void => {
    act(() => button('IMPACT KPIs').click()); act(() => button('Edit').click());
    const input = host.querySelector('textarea');
    if (!input) throw new Error('Existing unweighted Impact wording was not editable.');
    act(() => { input.value = changed().impact[0].wording; Simulate.change(input); });
  };
  const save = async (): Promise<void> => {
    act(() => button('Review & Weight').click()); await act(async () => button('Save Draft').click()); await flush();
  };
  it('writes through real HTTP ports and fresh UI reads persisted wording with every other field exact', async () => {
    const server = new FictionalSharePoint(); await mount(server); edit(); await save();
    expect(host.textContent).toMatch(/Saved/);
    expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(changed());
    expect(server.requests.filter(request => request.method === 'POST')).toHaveLength(1);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    const start = server.requests.length; await mount(server);
    act(() => button('IMPACT KPIs').click());
    expect(host.textContent).toContain(changed().impact[0].wording);
    expect(server.requests.slice(start).some(request => request.method === 'GET' && request.url.includes('WorkplanDrafts'))).toBe(true);
    expect(server.requests.slice(start).some(request => request.method === 'POST')).toBe(false);
  });
  it('keeps pending employee changes and unload warning when fictional write policy denies403', async () => {
    const server = new FictionalSharePoint(); await mount(server); edit(); server.writeOutcome = 'deny'; await save();
    expect(host.textContent).toMatch(/not saved|Not saved/);
    expect(JSON.parse(server.draft.DraftPayloadJSON as string)).toEqual(initialAggregate());
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    act(() => button('IMPACT KPIs').click()); expect(host.textContent).toContain(changed().impact[0].wording);
  });
  it('retains actual UI writeHOLD even with all synthetic private ports available', async () => {
    const server = new FictionalSharePoint(); await mount(server, true);
    expect(host.querySelector('fieldset')?.disabled).toBe(true);
    act(() => button('Review & Weight').click()); expect(button('Save Draft').disabled).toBe(true);
    expect(button('Submit Workplan').disabled).toBe(true);
    expect(server.requests.filter(request => request.method === 'POST')).toHaveLength(0);
  });
});
