jest.mock('./ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { readFileSync } from 'fs';
import { TextDecoder, TextEncoder } from 'node:util';
import IntegratedPerformanceHub from '../components/IntegratedPerformanceHub';
import { loadProductionOverview } from './ProductionOverviewLoader';
import { createOptionEProductionDataServiceFacade } from './OptionEProductionDataServiceFacade';
import { createOptionEWorkplanSubmittedHistoryV5SourceReader, type SourceReadPorts } from './OptionEWorkplanSubmittedHistoryV5SourceReader';
import { parseV5CapturedReceipt, encodeV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import type { V5ClientSource } from '../models/OptionEWorkplanSubmitExactBodyV5ClientModels';
import type { V4Control } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import type { IProductionDataService } from './IProductionDataService';
import type { IAdminReportingControlDataService } from './AdminReportingControlDataService';
Object.assign(globalThis, { TextDecoder, TextEncoder });

const employee = { id: 1, personKey: 'employee', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
  appRoles: ['Employee', 'BoardReadOnly'], active: true };
const admin = {} as IAdminReportingControlDataService;
interface Fixture {
  ports: { readCurrentSource: jest.Mock<Promise<V5ClientSource>, []>; readControl: jest.Mock<Promise<V4Control>, []>;
    readReceipt: jest.Mock<Promise<string | undefined>, [string]>; readSnapshot: jest.Mock<Promise<string | undefined>, [string]> };
  source: V5ClientSource; original: ReturnType<typeof parseV5CapturedReceipt>; receipt: string; snapshot: string;
  bind(readPorts?: SourceReadPorts): IProductionDataService;
}
const fixture = (name = 'global', snapshotOnly = false): Fixture => {
  const receipt = readFileSync(`tests/fixtures/captured-history/PM86-TECH-A002/complete-${name}-r3-receipt.json`, 'utf8');
  const original = parseV5CapturedReceipt(receipt), a = original.snapshot.admission.authority;
  const control: V4Control = { ...a.control, etag: '"submitted-control-9"', state: 'Submitted',
    transition: 'Ready', aclEpoch: a.control.hierarchyEpoch, snapshot: original.key };
  const source: V5ClientSource = { contract: a.contract, actor: a.actor, manager: a.manager, draft: a.draft,
    references: { ...a.references, rows: [] }, control,
    workplan: { native: { ...a.workplan.native, etag: '"submitted-header-9"', version: '9.0' },
      value: { ...a.workplan.value, state: 'Submitted', transitionStatus: 'Ready', etag: '"submitted-header-9"', rowVersionToken: 9 } } };
  const snapshot = encodeV5CapturedSnapshot(original.snapshot);
  const ports = { readCurrentSource: jest.fn(async () => source), readControl: jest.fn(async () => control),
    readReceipt: jest.fn<Promise<string | undefined>, [string]>(async () => snapshotOnly ? undefined : receipt),
    readSnapshot: jest.fn<Promise<string | undefined>, [string]>(async () => snapshot) };
  const adapter = {
    getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
    getQuarterTimingConfig: async () => { throw new Error('No current Quarter fixture'); },
    getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
    getEmployeeWorkplanV2: async () => ({ workplan: source.workplan.value, coreItems: [], personalItems: [], behaviourItems: [], audits: [] })
  } as unknown as IProductionDataService;
  const bind = (readPorts: SourceReadPorts = ports): IProductionDataService => createOptionEProductionDataServiceFacade(adapter, undefined,
    createOptionEWorkplanSubmittedHistoryV5SourceReader(readPorts));
  return { ports, source, original, receipt, snapshot, bind };
};

describe('new source reader through actual loader, facade and current Hub', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'Submitted', config: { performanceYearNumber: 2026 } });
  });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 30; i++) await act(async () => { await Promise.resolve(); });
  };
  const render = async (service: IProductionDataService, email = employee.email): Promise<void> => {
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service} adminReportingDataService={admin}
      currentUserEmail={email} userDisplayName="Synthetic Employee" />, host); });
    await flush();
  };
  const open = (label: string): void => {
    const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
    if (!button) throw new Error(`Missing ${label}`);
    act(() => button.click());
  };
  it.each(['global', 'manager'].flatMap(name => [false, true].map(snapshotOnly => ({ name, snapshotOnly }))))(
    'retains $name bytes and definitions, snapshot-only=$snapshotOnly, through all three journeys', async ({ name, snapshotOnly }) => {
      const f = fixture(name, snapshotOnly), service = f.bind();
      const result = await service.getSubmittedWorkplanHistoryV5!({ workplan: f.source.control.workplan, person: employee.personKey, year: 2026 });
      expect(result.status).toBe('DECODED_SOURCE_ONLY');
      if (result.status !== 'DECODED_SOURCE_ONLY') throw new Error(result.reason);
      expect(result.projection.history.capture.canonicalBody).toBe(snapshotOnly ? f.snapshot : f.receipt);
      expect(result.projection.history.raw.requestBody).toBe(f.original.snapshot.admission.authority.request.body);
      expect(result.projection.history.snapshot.admission.authority.workplan.value.state).toBe('Draft');
      await render(service);
      for (const [label, journey] of [['Build My Workplan', 'annual'], ['My Workplan', 'quarter'], ['Performance reporting views', 'reporting']]) {
        open(label);
        const text = host.querySelector(`[data-history-journey="${journey}"]`)?.textContent;
        expect(text).toContain(`Core ${name === 'manager' ? 80 : 70}%`);
        expect(text).toContain(`Captured ${snapshotOnly ? 'snapshot' : 'receipt'}`);
        expect(text).toContain('Annual Target');
        expect(text).toContain(f.original.snapshot.admission.authority.draft.version);
        expect(text).toContain('operational reporting eligibility have not been established');
        expect(text).toContain(f.original.snapshot.admission.authority.request.body);
      }
      await expect(service.submitEmployeeWorkplanV2({} as never)).rejects.toThrow('OPTION_E_TRUSTED_ROUTE_ABSENT');
    });
  it.each(['missing', 'exception', 'invalid', 'pending'])(
    'shows %s HOLD through the new reader in each current view', async condition => {
      const f = fixture();
      if (condition === 'missing') { f.ports.readReceipt.mockResolvedValue(undefined); f.ports.readSnapshot.mockResolvedValue(undefined); }
      if (condition === 'exception') f.ports.readReceipt.mockRejectedValue(new Error('Fictional read failure'));
      if (condition === 'invalid') f.ports.readReceipt.mockResolvedValue('invalid');
      if (condition === 'pending') f.source.control.command = 'pending';
      await render(f.bind());
      for (const [label, journey] of [['Build My Workplan', 'annual'], ['My Workplan', 'quarter'], ['Reporting Readiness', 'reporting']]) {
        open(label);
        expect(host.querySelector(`[data-history-journey="${journey}"]`)?.textContent).toContain('HOLD');
        expect(host.querySelector(`[data-history-journey="${journey}"]`)?.textContent).not.toContain('Core 70%');
      }
    });
  it.each(['source', 'actor'])('ignores a late real-reader result after %s replacement', async replacement => {
    const old = fixture('manager');
    let release: (body: string) => void = () => { throw new Error('Not waiting'); };
    const delayed = new Promise<string>(resolve => { release = resolve; });
    old.ports.readReceipt.mockReturnValue(delayed);
    await render(old.bind());
    expect(old.ports.readReceipt).toHaveBeenCalledTimes(1);
    const fresh = fixture();
    if (replacement === 'actor') {
      (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: { ...employee, personKey: 'fictional-replacement', email: 'replacement@example.invalid' },
        workplanStatus: 'Submitted', config: { performanceYearNumber: 2026 } });
      fresh.source.workplan.value = { ...fresh.source.workplan.value, personKey: 'fictional-replacement' };
    }
    await render(fresh.bind(), replacement === 'actor' ? 'replacement@example.invalid' : employee.email);
    await act(async () => { release(old.receipt); }); await flush();
    expect(old.ports.readCurrentSource).toHaveBeenCalledTimes(2);
    open('Build My Workplan');
    const text = host.querySelector('[data-history-journey="annual"]')?.textContent;
    expect(text).not.toContain('Core 80%');
    expect(text).toContain(replacement === 'actor' ? 'HOLD' : 'Core 70%');
  });
});
