/* eslint-disable @rushstack/pair-react-dom-render-unmount -- mounted host is unmounted in afterEach */
jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { readFileSync } from 'fs';
import { TextDecoder, TextEncoder } from 'node:util';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { createOptionEProductionDataServiceFacade } from '../services/OptionEProductionDataServiceFacade';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
import type { IV5SubmittedHistoryLoader } from '../models/OptionEWorkplanSubmittedHistoryV5Models';
import { parseV5CapturedReceipt } from '../services/OptionEWorkplanSubmitExactBodyV5CapturedWire';
Object.assign(globalThis, { TextDecoder, TextEncoder });
const bytes = (name: string, kind: string): string => readFileSync(`tests/fixtures/captured-history/PM86-TECH-A002/complete-${name}-r3-${kind}.json`, 'utf8');
const sourceWorkplan = (): ReturnType<typeof parseV5CapturedReceipt>['snapshot']['admission']['authority']['workplan']['value'] =>
  parseV5CapturedReceipt(bytes('global', 'receipt')).snapshot.admission.authority.workplan.value;
const employee = { id: 1, personKey: 'employee', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
  appRoles: ['Employee', 'BoardReadOnly'], active: true };
const admin = {} as IAdminReportingControlDataService;
const adapter = (person = 'employee'): IProductionDataService => ({
  getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [],
  getQuarterTimingConfig: async () => { throw new Error('No current quarter fixture'); },
  getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [],
  getEmployeeWorkplanV2: async () => ({ workplan: { ...sourceWorkplan(), personKey: person },
    coreItems: [], personalItems: [], behaviourItems: [], audits: [] })
} as unknown as IProductionDataService);
describe('actual Hub captured-history caller through facade and async loader', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'Draft', config: { performanceYearNumber: 2026 } });
  });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });
  const render = async (service: IProductionDataService, email = employee.email,
    reportingService = admin): Promise<void> => {
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service} adminReportingDataService={reportingService}
      currentUserEmail={email} userDisplayName="Synthetic Employee" />, host); });
    for (let i = 0; i < 30; i++) await act(async () => { await Promise.resolve(); });
  };
  const open = (label: string): void => {
    const button = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === label);
    if (!button) throw new Error(`Missing ${label}`);
    act(() => button.click());
  };
  const annualReason = (): string => {
    open('Build My Workplan');
    return host.querySelector('[data-history-journey="annual"]')?.textContent || '';
  };
  const expectEveryJourney = (reason: string): void => {
    for (const [label, journey] of [['Build My Workplan', 'annual'], ['My Workplan', 'quarter'], ['Reporting Readiness', 'reporting']]) {
      open(label);
      const text = host.querySelector(`[data-history-journey="${journey}"]`)?.textContent || '';
      expect(text).toContain(reason);
      expect(text).not.toContain('Core 70%');
      expect(text).not.toContain('Core 80%');
    }
  };
  const deferred = <T,>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: Error) => void } => {
    let resolveDeferred!: (value: T) => void, rejectDeferred!: (error: Error) => void;
    const promise = new Promise<T>((resolve, reject) => { resolveDeferred = resolve; rejectDeferred = reject; });
    return { promise, resolve: resolveDeferred, reject: rejectDeferred };
  };
  const decodedService = (): IProductionDataService => createOptionEProductionDataServiceFacade(adapter(), undefined, {
    readCapture: async () => ({ encoding: 'captured-native-request/v1', kind: 'receipt', canonicalBody: bytes('global', 'receipt') })
  });
  it.each(['undefined', 'rejected'] as const)('same-coordinate current %s saved read never admits retained coordinates', async outcome => {
    await render(decodedService());
    expect(annualReason()).toContain('Core 70%');
    const saved = deferred<Awaited<ReturnType<IProductionDataService['getEmployeeWorkplanV2']>>>();
    const readCapture = jest.fn(async () => undefined);
    const service = createOptionEProductionDataServiceFacade({ ...adapter(), getEmployeeWorkplanV2: () => saved.promise }, undefined, { readCapture });
    await render(service);
    expect(host.textContent).toContain('Loading your Performance Hub');
    expect(host.textContent).not.toContain('Core 70%');
    expect(readCapture).not.toHaveBeenCalled();
    await act(async () => { if (outcome === 'undefined') saved.resolve(undefined); else saved.reject(new Error('Current synthetic read rejected')); });
    expectEveryJourney('ReadUnavailable');
    expect(readCapture).not.toHaveBeenCalled();
  });
  it('fresh same-coordinate read invalidates old decoded history and preserves genuine MissingCapture', async () => {
    await render(decodedService());
    const captured = deferred<undefined>();
    const readCapture = jest.fn(() => captured.promise);
    await render(createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture }));
    expectEveryJourney('Loading');
    expect(readCapture).toHaveBeenCalledTimes(1);
    expect(readCapture).toHaveBeenCalledWith({ workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 });
    await act(async () => { captured.resolve(undefined); });
    expectEveryJourney('MissingCapture');
  });
  it('fresh successful same-coordinate capture uses new decoded facts', async () => {
    await render(decodedService());
    const readCapture = jest.fn(async () => ({ encoding: 'captured-native-request/v1' as const,
      kind: 'receipt' as const, canonicalBody: bytes('manager', 'receipt') }));
    await render(createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture }));
    expect(annualReason()).toContain('Core 80%');
    expect(annualReason()).not.toContain('Core 70%');
    expect(readCapture).toHaveBeenCalledTimes(1);
  });
  it.each(['success', 'reject'] as const)('obsolete pending saved-read %s cannot bind a current witness', async outcome => {
    await render(decodedService());
    const saved = deferred<Awaited<ReturnType<IProductionDataService['getEmployeeWorkplanV2']>>>();
    const oldCapture = jest.fn(async () => undefined);
    await render(createOptionEProductionDataServiceFacade({ ...adapter(), getEmployeeWorkplanV2: () => saved.promise }, undefined, { readCapture: oldCapture }));
    const currentCapture = jest.fn(async () => undefined);
    await render(createOptionEProductionDataServiceFacade({ ...adapter(), getEmployeeWorkplanV2: async () => undefined }, undefined, { readCapture: currentCapture }));
    await act(async () => { if (outcome === 'success') saved.resolve(await adapter().getEmployeeWorkplanV2(employee, 2026));
      else saved.reject(new Error('Obsolete synthetic read rejected')); });
    expectEveryJourney('ReadUnavailable');
    expect(oldCapture).not.toHaveBeenCalled();
    expect(currentCapture).not.toHaveBeenCalled();
  });
  it.each(['success', 'reject'] as const)('obsolete pending capture %s cannot replace a settled unavailable current read', async outcome => {
    const captured = deferred<Awaited<ReturnType<IV5SubmittedHistoryLoader['readCapture']>>>();
    await render(createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture: () => captured.promise }));
    const currentCapture = jest.fn(async () => undefined);
    await render(createOptionEProductionDataServiceFacade({ ...adapter(), getEmployeeWorkplanV2: async () => undefined }, undefined, { readCapture: currentCapture }));
    await act(async () => { if (outcome === 'success') captured.resolve({ encoding: 'captured-native-request/v1',
      kind: 'receipt', canonicalBody: bytes('manager', 'receipt') }); else captured.reject(new Error('Obsolete capture rejected')); });
    expectEveryJourney('ReadUnavailable');
    expect(currentCapture).not.toHaveBeenCalled();
  });
  it('cancelled pending saved read after unmount cannot initiate capture', async () => {
    const saved = deferred<Awaited<ReturnType<IProductionDataService['getEmployeeWorkplanV2']>>>();
    const readCapture = jest.fn(async () => undefined);
    await render(createOptionEProductionDataServiceFacade({ ...adapter(), getEmployeeWorkplanV2: () => saved.promise }, undefined, { readCapture }));
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    await act(async () => { saved.resolve(await adapter().getEmployeeWorkplanV2(employee, 2026)); });
    expect(readCapture).not.toHaveBeenCalled();
    expect(host.textContent).toBe('');
  });
  it('not-attempted current saved read cannot use a prior witness', async () => {
    await render(decodedService());
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'NotStarted', config: { performanceYearNumber: 2026 } });
    const getEmployeeWorkplanV2 = jest.fn(adapter().getEmployeeWorkplanV2);
    const readCapture = jest.fn(async () => undefined);
    await render(createOptionEProductionDataServiceFacade({ ...adapter(), getEmployeeWorkplanV2 }, undefined, { readCapture }));
    expectEveryJourney('ReadUnavailable');
    expect(getEmployeeWorkplanV2).not.toHaveBeenCalled();
    expect(readCapture).not.toHaveBeenCalled();
  });
  it('missing current saved-read method cannot use retained coordinates', async () => {
    await render(decodedService());
    const getSubmittedWorkplanHistoryV5 = jest.fn(async () => ({ status: 'HOLD' as const, reason: 'MissingCapture' as const }));
    await render({ ...adapter(), getEmployeeWorkplanV2: undefined, getSubmittedWorkplanHistoryV5 } as unknown as IProductionDataService);
    expectEveryJourney('ReadUnavailable');
    expect(getSubmittedWorkplanHistoryV5).not.toHaveBeenCalled();
  });
  it('a successful cross-person saved read cannot admit capture', async () => {
    const readCapture = jest.fn(async () => undefined);
    await render(createOptionEProductionDataServiceFacade(adapter('other'), undefined, { readCapture }));
    expectEveryJourney('ReadUnavailable');
    expect(readCapture).not.toHaveBeenCalled();
  });
  it('a new load with the same service and coordinates cannot reuse its prior witness', async () => {
    const saved = jest.fn(adapter().getEmployeeWorkplanV2);
    const readCapture = jest.fn(async () => ({ encoding: 'captured-native-request/v1' as const,
      kind: 'receipt' as const, canonicalBody: bytes('global', 'receipt') }));
    const service = createOptionEProductionDataServiceFacade({ ...adapter(), getEmployeeWorkplanV2: saved }, undefined, { readCapture });
    await render(service);
    expect(annualReason()).toContain('Core 70%');
    saved.mockResolvedValueOnce(undefined);
    await render(service, employee.email, {} as IAdminReportingControlDataService);
    expectEveryJourney('ReadUnavailable');
    expect(saved).toHaveBeenCalledTimes(2);
    expect(readCapture).toHaveBeenCalledTimes(1);
  });
  it.each(['success', 'reject'] as const)('cancelled pending capture %s after unmount cannot render', async outcome => {
    const captured = deferred<Awaited<ReturnType<IV5SubmittedHistoryLoader['readCapture']>>>();
    await render(createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture: () => captured.promise }));
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    await act(async () => { if (outcome === 'success') captured.resolve({ encoding: 'captured-native-request/v1',
      kind: 'receipt', canonicalBody: bytes('manager', 'receipt') }); else captured.reject(new Error('Cancelled capture rejected')); });
    expect(host.textContent).toBe('');
  });
  it.each(['rejected', 'undefined'] as const)('settled %s Workplan read reports unavailable without a capture read', async mode => {
    const getSubmittedWorkplanHistoryV5 = jest.fn();
    const service = { ...adapter(), getSubmittedWorkplanHistoryV5, getEmployeeWorkplanV2: mode === 'rejected'
      ? async () => { throw new Error('Synthetic read failure'); } : async () => undefined } as unknown as IProductionDataService;
    await render(service);
    expect(annualReason()).toContain('ReadUnavailable');
    expect(annualReason()).not.toContain('MissingCapture');
    expect(getSubmittedWorkplanHistoryV5).not.toHaveBeenCalled();
  });
  it('initial overview loading reports Loading without a capture read', async () => {
    (loadProductionOverview as jest.Mock).mockReturnValue(new Promise(() => {}));
    const getSubmittedWorkplanHistoryV5 = jest.fn();
    await render({ ...adapter(), getSubmittedWorkplanHistoryV5 });
    expect(host.textContent).toContain('Loading your Performance Hub');
    expect(host.textContent).not.toContain('MissingCapture');
    expect(getSubmittedWorkplanHistoryV5).not.toHaveBeenCalled();
  });
  it('a current pending capture reports Loading', async () => {
    const readCapture = jest.fn(() => new Promise<undefined>(() => {}));
    await render(createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture }));
    expect(annualReason()).toContain('Loading');
    expect(readCapture).toHaveBeenCalledTimes(1);
  });
  it.each(['MissingCapture', 'ReadUnavailable', 'CoordinateMismatch'] as const)('preserves actual loader %s', async reason => {
    const getSubmittedWorkplanHistoryV5 = jest.fn(async () => ({ status: 'HOLD' as const, reason }));
    await render({ ...adapter(), getSubmittedWorkplanHistoryV5 });
    expect(annualReason()).toContain(reason);
    expect(getSubmittedWorkplanHistoryV5).toHaveBeenCalledTimes(1);
  });
  it('settled refresh failure reports unavailable rather than loading retained coordinates', async () => {
    await render(createOptionEProductionDataServiceFacade(adapter()));
    expect(annualReason()).toContain('Unbound');
    const getSubmittedWorkplanHistoryV5 = jest.fn();
    await render({ ...adapter(), getSubmittedWorkplanHistoryV5,
      getCoreKpiCatalogue: () => { throw new Error('Synthetic synchronous refresh failure'); } });
    expect(annualReason()).toContain('ReadUnavailable');
    expect(annualReason()).not.toContain('Loading');
    expect(getSubmittedWorkplanHistoryV5).not.toHaveBeenCalled();
  });
  it('year mismatch after refresh reports unavailable without consuming old decoded history', async () => {
    const readCapture = jest.fn(async () => ({ encoding: 'captured-native-request/v1' as const,
      kind: 'receipt' as const, canonicalBody: bytes('global', 'receipt') }));
    await render(createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture }));
    expect(annualReason()).toContain('Core 70%');
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'Draft', config: { performanceYearNumber: 2027 } });
    const newReadCapture = jest.fn();
    await render(createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture: newReadCapture }));
    expect(annualReason()).toContain('ReadUnavailable');
    expect(annualReason()).not.toContain('Core 70%');
    expect(newReadCapture).not.toHaveBeenCalled();
  });
  it.each(['global', 'manager'].flatMap(name => (['receipt', 'snapshot'] as const).map(kind => ({ name, kind }))))(
    'passes complete $name $kind through all three actual journeys', async ({ name, kind }) => {
      const readCapture = jest.fn(async () => ({ encoding: 'captured-native-request/v1' as const, kind, canonicalBody: bytes(name, kind) }));
      const service = createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture });
      await render(service);
      expect(readCapture).toHaveBeenCalledWith({ workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 });
      for (const [label, journey] of [['Build My Workplan', 'annual'], ['My Workplan', 'quarter'], ['Performance reporting views', 'reporting']]) {
        open(label);
        const view = host.querySelector(`[data-history-journey="${journey}"]`);
        expect(view?.textContent).toContain(`Core ${name === 'manager' ? 80 : 70}%`);
        expect(view?.textContent).toContain('Annual Target');
        expect(view?.textContent).toContain('operational reporting eligibility have not been established');
      }
      expect(host.textContent).toContain('Reporting data is not connected.');
      await expect(service.submitEmployeeWorkplanV2({} as never)).rejects.toThrow('OPTION_E_TRUSTED_ROUTE_ABSENT');
    });
  it('propagates missing native port HOLD through annual, quarterly and Reporting', async () => {
    await render(createOptionEProductionDataServiceFacade(adapter()));
    for (const [label, journey] of [['Build My Workplan', 'annual'], ['My Workplan', 'quarter'], ['Reporting Readiness', 'reporting']]) {
      open(label); expect(host.querySelector(`[data-history-journey="${journey}"]`)?.textContent).toContain('HOLD');
      expect(host.querySelector(`[data-history-journey="${journey}"]`)?.textContent).toContain('Unbound');
    }
  });
  it('discards an old pending read after the actual caller changes person and service', async () => {
    let release: ((value: Awaited<ReturnType<IV5SubmittedHistoryLoader['readCapture']>>) => void) | undefined;
    const delayed = new Promise<Awaited<ReturnType<IV5SubmittedHistoryLoader['readCapture']>>>(resolve => { release = resolve; });
    const readCapture = jest.fn(() => delayed);
    await render(createOptionEProductionDataServiceFacade(adapter(), undefined, { readCapture }));
    expect(readCapture).toHaveBeenCalledTimes(1);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: { ...employee, personKey: 'other', email: 'other@example.invalid' },
      workplanStatus: 'Draft', config: { performanceYearNumber: 2026 } });
    await render(createOptionEProductionDataServiceFacade(adapter('other')), 'other@example.invalid');
    await act(async () => { release!({ encoding: 'captured-native-request/v1', kind: 'receipt', canonicalBody: bytes('manager', 'receipt') }); });
    open('Build My Workplan');
    expect(host.querySelector('[data-history-journey="annual"]')?.textContent).toContain('HOLD');
    expect(host.querySelector('[data-history-journey="annual"]')?.textContent).not.toContain('Core 80%');
  });
});
