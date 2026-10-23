jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
import { createHash } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import IntegratedPerformanceHub, { type IIntegratedPerformanceHubProps } from './IntegratedPerformanceHub';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { APPROVED_BEHAVIOUR_V1_SOURCE_ROWS } from '../testing/BehaviourFrameworkV1ApprovedData';
import { createBehaviourFrameworkV2Catalogue } from '../services/BehaviourFrameworkV2';
import { BehaviourCatalogueAdministrationProcessor, createBehaviourCatalogueAdministrationBaseline,
  type IBehaviourCatalogueAdministrationGateway, type IBehaviourCatalogueAdminReadModel,
  type IBehaviourCatalogueAdminCommand } from '../services/BehaviourCatalogueAdministration';
import { SharePointBehaviourCatalogueAdministrationStore, encodeBehaviourCatalogueSharePointFields,
  type IBehaviourSharePointRequest, type IBehaviourSharePointResponse } from '../services/SharePointBehaviourCatalogueAdministrationStore';

Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true });
const sha = async (value: string): Promise<string> => createHash('sha256').update(value).digest('hex').toUpperCase();
const admin = { id: 1, personKey: 'SYN-ADMIN', email: 'admin@example.invalid', displayName: 'Synthetic Admin', active: true, appRoles: ['SystemAdmin'] };
const binding = { environment: 'TEST' as const, webUrl: 'https://example.invalid/sites/REVIEW-TEST-SITE',
  siteId: 'fb1f6035-236e-434c-ae05-a78003badd47', webId: 'cbf5edb8-5d3b-46a5-a5ea-4564fa3ff43c',
  listId: 'cb02da80-d986-4034-a832-41d7b04e56ff', itemId: 17, entityType: 'SP.Data.KCFKPI_TEST_BehaviourCatalogueStateListItem' };
const coordinates = { siteId: binding.siteId, webId: binding.webId, listId: binding.listId, itemId: binding.itemId };
const itemUrl = `${binding.webUrl}/_api/web/lists(guid'${binding.listId}')/items(${binding.itemId})`;

describe('PM73 actual Hub governed Behaviour client route — synthetic only', () => {
  let host: HTMLDivElement;
  let writes: number;
  let fields: Readonly<Record<string, unknown>>;
  let etag: string;
  let actor: unknown;
  let failWrite: boolean;
  let gateway: IBehaviourCatalogueAdministrationGateway;
  let commands: IBehaviourCatalogueAdminCommand[];
  const props = (port: IBehaviourCatalogueAdministrationGateway | undefined = gateway): IIntegratedPerformanceHubProps => ({
    currentUserEmail: admin.email, userDisplayName: admin.displayName, behaviourCatalogueAdministration: port,
    dataService: { getAdminPeople: async () => [], getAdminTeams: async () => [], getAdminConfigRecords: async () => [],
      getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [], getBehaviourObjectiveLibrary: async () => [],
      getDirectReports: async () => [], getQuarterTimingConfig: async () => { throw new Error('Synthetic unavailable'); }
    } as unknown as IIntegratedPerformanceHubProps['dataService'],
    adminReportingDataService: { getAdminReportingControlSnapshot: async () => { throw new Error('Synthetic unavailable'); }
    } as unknown as IIntegratedPerformanceHubProps['adminReportingDataService']
  });
  const flush = async (): Promise<void> => { for (let i = 0; i < 12; i += 1) await act(async () => { await Promise.resolve(); }); };
  const draw = async (value = props()): Promise<void> => { await act(async () => { ReactDOM.render(<IntegratedPerformanceHub {...value} />, host); }); await flush(); };
  const click = async (text: string): Promise<void> => {
    const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === text);
    expect(button).toBeDefined(); await act(async () => { button!.click(); }); await flush();
  };
  const edit = (label: string, value: string): void => { const input = host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
    expect(input).not.toBeNull(); act(() => { input.value = value; Simulate.change(input); }); };
  const prepare = (version: number, action = 'Retire', status = 'Retired'): void => {
    edit('Catalogue action', action); edit('Target status', status);
    edit('Successor version', `KCF-BHV-PD03-2026.09-v${version}`); edit('Mandatory reason', 'Synthetic governed successor');
  };
  const enter = async (value = props()): Promise<void> => { await draw(value); await click('Behaviour Library'); };
  beforeEach(async () => {
    host = document.createElement('div'); document.body.appendChild(host);
    writes = 0; etag = '"synthetic-1"'; actor = { personKey: admin.personKey, email: admin.email, appRoles: admin.appRoles }; failWrite = false; commands = [];
    (loadProductionOverview as jest.Mock).mockReset().mockResolvedValue({ employee: admin,
      config: { performanceYearNumber: 2026 }, workplanStatus: 'Not started', readiness: { ready: true, blockers: [] } });
    const catalogue = createBehaviourFrameworkV2Catalogue(APPROVED_BEHAVIOUR_V1_SOURCE_ROWS,
      { catalogueVersion: 'KCF-BHV-PD03-2026.09-v1', revision: 1, status: 'Published', effectiveFrom: '2026-11-01' });
    const authority = { approvalReference: 'LOCAL-SYNTHETIC-APPROVAL', approvedV1Catalogue: catalogue,
      approvedV1ContentSha256: await sha(JSON.stringify(catalogue)) };
    const initial = await createBehaviourCatalogueAdministrationBaseline(authority, { personKey: admin.personKey, email: admin.email },
      '2026-10-01T12:00:00.000Z', 'LOCAL-SYNTHETIC-A007', 'de8fc527-fa58-4b8a-ae63-818822015746', sha);
    fields = await encodeBehaviourCatalogueSharePointFields(initial, authority, sha);
    const transport = { resolveAuthenticatedAdminContext: async () => actor,
      request: async (request: Readonly<IBehaviourSharePointRequest>): Promise<IBehaviourSharePointResponse> => {
        if (request.method === 'POST') {
          writes += 1;
          if (failWrite) throw new Error('Synthetic uncommitted timeout');
          if (request.headers['IF-MATCH'] !== etag) return { status: 412, coordinates };
          const next = { ...request.body! }; delete next.__metadata; fields = next;
          etag = `"synthetic-${writes + 1}"`; return { status: 204, coordinates };
        }
        return request.url.includes('?$select=Id,ListItemEntityTypeFullName')
          ? { status: 200, coordinates, body: { d: { Id: binding.listId, ListItemEntityTypeFullName: binding.entityType } } }
          : { status: 200, coordinates, etag, body: { d: { Id: binding.itemId, __metadata: { etag, type: binding.entityType, uri: itemUrl }, ...fields } } };
      } };
    const processor = new BehaviourCatalogueAdministrationProcessor(
      new SharePointBehaviourCatalogueAdministrationStore(binding, authority, transport, sha), authority,
      async () => actor, () => new Date(Date.UTC(2026, 9, 1, 12, 1, commands.length)).toISOString(), () => 'LOCAL-SYNTHETIC-A007', sha);
    gateway = { read: () => processor.read(), publish: command => { commands.push(command); return processor.publish(command); } };
  });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.restoreAllMocks(); });

  it('reaches the real editor and retires/reactivates through the cleared store with canonical history readback', async () => {
    await enter(); expect(host.textContent).toContain('How this works'); expect(host.textContent).toContain('WE TAKE RESPONSIBILITY');
    prepare(2); await click('Publish governed successor');
    expect(host.querySelector('[data-canonical-catalogue-version]')?.getAttribute('data-canonical-catalogue-version')).toBe('KCF-BHV-PD03-2026.09-v2');
    expect(host.querySelectorAll('[data-catalogue-history-version]')).toHaveLength(2);
    expect(host.querySelectorAll('[data-catalogue-audit-key]')).toHaveLength(2);
    const replay = await gateway.publish(commands[0]); expect(replay.outcome).toBe('ConfirmedReplay'); expect(writes).toBe(1);
    const collision = await gateway.publish({ ...commands[0], reason: 'Different reason' }); expect(collision.outcome).toBe('Denied'); expect(writes).toBe(1);
    prepare(3, 'Reactivate', 'Published'); await click('Publish governed successor');
    expect(writes).toBe(2);
    expect(host.querySelectorAll('[data-catalogue-history-version]')).toHaveLength(3);
    expect(host.querySelectorAll('[data-catalogue-audit-key]')).toHaveLength(3);
    const reactivation = commands[commands.length - 1];
    expect(reactivation.expectedRowVersion).toBe(2); expect(reactivation.expectedEtag).toBe('"synthetic-2"');
  });
  it('keeps production-default unavailability useful with zero writes', async () => {
    await enter({ ...props(), behaviourCatalogueAdministration: undefined });
    expect(host.querySelector('[data-behaviour-catalogue-admin-state="Unavailable"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Mandatory reason"]')).toBeNull(); expect(writes).toBe(0);
  });
  it('denies nonAdmin navigation and never invokes the client port', async () => {
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: { ...admin, appRoles: ['Employee'] },
      config: { performanceYearNumber: 2026 }, workplanStatus: 'Not started', readiness: { ready: true, blockers: [] } });
    const read = jest.fn(gateway.read); await draw(props({ ...gateway, read }));
    expect(host.textContent).not.toContain('Governed Behaviour catalogue administration'); expect(read).not.toHaveBeenCalled(); expect(writes).toBe(0);
  });
  it('rejects stale ETag and uncertain writes without presenting a confirmed successor', async () => {
    await enter(); etag = '"synthetic-external-change"'; prepare(2); await click('Publish governed successor');
    expect(host.querySelectorAll('[data-catalogue-history-version]')).toHaveLength(1);
    await click('Reload canonical catalogue'); failWrite = true; prepare(2); await click('Publish governed successor');
    expect(host.querySelectorAll('[data-catalogue-history-version]')).toHaveLength(1);
    expect(host.textContent).toMatch(/uncertain/i);
  });
  it('denies publication after trusted actor loses Admin with zero storage writes', async () => {
    await enter(); actor = { personKey: admin.personKey, email: admin.email, appRoles: ['Employee'] };
    prepare(2); await click('Publish governed successor'); expect(writes).toBe(0);
    await click('Reload canonical catalogue'); expect(host.querySelector('[data-behaviour-catalogue-admin-state="Denied"]')).not.toBeNull();
  });
  it('ignores a superseded gateway read and hides former privileged data immediately on replacement', async () => {
    let resolvePending!: (value: IBehaviourCatalogueAdminReadModel) => void;
    const old = await gateway.read();
    const pending = { ...gateway, read: () => new Promise<IBehaviourCatalogueAdminReadModel>(resolve => { resolvePending = resolve; }) };
    const value = props(pending); await enter(value);
    const denied: IBehaviourCatalogueAdministrationGateway = { read: async () => ({ state: 'Denied', reason: 'Synthetic denied' }), publish: gateway.publish };
    await draw({ ...value, behaviourCatalogueAdministration: denied });
    await act(async () => { resolvePending(old); }); await flush();
    expect(host.querySelector('[data-canonical-catalogue-version]')).toBeNull();
    expect(host.querySelector('[data-behaviour-catalogue-admin-state="Denied"]')).not.toBeNull(); expect(writes).toBe(0);
  });
  it('hides loaded data synchronously when gateway changes and ignores the old publish completion', async () => {
    let finish!: (value: Awaited<ReturnType<IBehaviourCatalogueAdministrationGateway['publish']>>) => void;
    const read = jest.fn(gateway.read);
    const oldPort: IBehaviourCatalogueAdministrationGateway = { read,
      publish: () => new Promise(resolve => { finish = resolve; }) };
    const value = props(oldPort); await enter(value); prepare(2); await click('Publish governed successor');
    const denied: IBehaviourCatalogueAdministrationGateway = { read: async () => ({ state: 'Denied', reason: 'Replacement denied' }),
      publish: jest.fn(gateway.publish) };
    act(() => { ReactDOM.flushSync(() => { ReactDOM.render(<IntegratedPerformanceHub {...value} behaviourCatalogueAdministration={denied} />, host); });
      expect(host.querySelector('[data-canonical-catalogue-version]')).toBeNull(); });
    await flush(); await act(async () => { finish({ outcome: 'Confirmed', message: 'OLD CONFIRMATION' }); }); await flush();
    expect(host.textContent).not.toContain('OLD CONFIRMATION'); expect(read).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-behaviour-catalogue-admin-state="Denied"]')).not.toBeNull(); expect(writes).toBe(0);
  });
  it.each(['actor', 'service'])('hides privileged data throughout a pending %s refresh and does not restore it after denial', async change => {
    const value = props(); await enter(value);
    let resolveOverview!: (value: unknown) => void;
    (loadProductionOverview as jest.Mock).mockReturnValueOnce(new Promise(resolve => { resolveOverview = resolve; }));
    const next = { ...value, currentUserEmail: change === 'actor' ? 'employee@example.invalid' : value.currentUserEmail,
      dataService: change === 'service' ? { ...value.dataService } : value.dataService };
    act(() => { ReactDOM.flushSync(() => { ReactDOM.render(<IntegratedPerformanceHub {...next} />, host); });
      expect(host.querySelector('[data-canonical-catalogue-version]')).toBeNull(); });
    await flush(); expect(host.querySelector('[aria-label="Mandatory reason"]')).toBeNull();
    await act(async () => { resolveOverview({ employee: { ...admin, email: next.currentUserEmail, appRoles: ['Employee'] },
      config: { performanceYearNumber: 2026 }, workplanStatus: 'Not started', readiness: { ready: true, blockers: [] } }); });
    await flush(); expect(host.querySelector('[data-canonical-catalogue-version]')).toBeNull(); expect(writes).toBe(0);
  });
});
