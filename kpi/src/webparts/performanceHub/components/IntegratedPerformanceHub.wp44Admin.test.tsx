jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import { buildStrategicCoreCoverageUatSource } from '../services/StrategicCoreCoverageFeed';
import type { IAdminMasterSourceCapture, IAdminMasterSourceReader } from '../models/AdminMasterSourceCompositionModels';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';

const employee = { id: 1, personKey: 'admin', displayName: 'Synthetic Admin', email: 'admin@example.invalid', appRoles: ['SystemAdmin'], active: true };
const service = { getAdminPeople: async () => [], getAdminTeams: async () => [], getAdminConfigRecords: async () => [],
  getQuarterTimingConfig: async () => { throw Error('Synthetic timing unavailable'); },
  getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [], getEmployeeWorkplanV2: async () => undefined,
  getAdminEventHistory: async () => undefined } as unknown as IProductionDataService;
const reporting = { getAdminReportingControlSnapshot: async () => undefined } as unknown as IAdminReportingControlDataService;
const capture = (): IAdminMasterSourceCapture => {
  const coverage = buildStrategicCoreCoverageUatSource();
  const records = coverage.kpis.map((row, index) => ({ id: index, kpiId: row.kpiId, kpiVersionKey: 'v1', wording: row.wording,
    wordingSourceReference: 'synthetic-master/v1', pillar: row.pillar, workstream: row.workstream, active: index !== 1,
    owner: index === 0 ? 'Owner A' : 'Owner B', measureType: 'Count', unit: row.unit, direction: 'HigherIsBetter', aggregationMethod: 'DirectMetric', reportingStatus: 'Included' }));
  return { coordinates: { actor: employee.email, person: employee.personKey, year: 2027 }, sourceVersion: 'CAPTURE-ONE', masterVersion: 'm1', mappingVersion: 'map1',
    assignmentVersion: 'a1', coverageVersion: 'c1', sourceReference: 'Synthetic explicit source', asOfDate: coverage.asOfDate, activePeriod: '2027 Annual',
    records: [...records, records[0]], coverage, mappings: records.map((row, index) => ({ kpiId: row.kpiId, kpiVersionKey: 'v1', strategyId: 'S1',
      strategyVersion: 'S1v1', activePeriod: '2027 Annual', sourceReference: 'explicit mapping', outcome: index === 2 ? 'Unmapped' : { outcomeId: 'O1', outcomeVersion: 1 } })),
    assignments: records.map(row => ({ assignmentId: row.kpiId, kpiId: row.kpiId, kpiVersionKey: 'v1', person: 'Person A', role: 'Contributor',
      current: true, activePeriod: '2027 Annual', sourceReference: 'assignment1' })), dataQualityIssues: [] };
};
describe('actual authorised Hub Admin captured source callers', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'NotStarted', config: { performanceYearNumber: 2027 } }); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });
  const render = async (reader?: IAdminMasterSourceReader, email = employee.email): Promise<void> => {
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={service} adminReportingDataService={reporting}
      currentUserEmail={email} userDisplayName="Synthetic Admin" adminMasterSourceReader={reader} />, host); });
    for (let i = 0; i < 20; i++) await act(async () => { await Promise.resolve(); });
  };
  const open = (label: string): void => { const button = Array.from(host.querySelectorAll('button')).find(row => row.textContent?.trim() === label);
    if (!button) throw Error(`Missing ${label}`); act(() => button.click()); };
  it('passes complete captured master, mapping and coverage through all three actual tabs with all filters and exceptions', async () => {
    const read = jest.fn(async () => capture()); await render({ read });
    expect(read).toHaveBeenCalledWith({ actor: employee.email, person: employee.personKey, year: 2027 });
    open('KPI Master'); expect(host.textContent).toContain('O1 / v1'); expect(host.textContent).toContain('Person A');
    for (const [key, value, count] of [['search', 'SC-EXACT-100', 1], ['owner', 'Owner A', 2], ['role', 'Contributor', 11], ['strategy', 'S1', 11], ['outcome', 'Unmapped', 1], ['activePeriod', '2027 Annual', 11], ['status', 'Inactive', 1]] as const) {
      const control = host.querySelector(`[aria-label="${key}"]`) as HTMLInputElement;
      act(() => { control.value = value; Simulate.change(control); });
      expect(host.querySelectorAll('tbody tr')).toHaveLength(count);
      act(() => { control.value = key === 'status' ? 'All' : ''; Simulate.change(control); });
    }
    open('Strategic Core Coverage'); expect(host.textContent).toContain('Source only'); expect(host.textContent).toContain('SC-SCHOOLS-200');
    open('Data Quality'); for (const family of ['Duplicate', 'Unmapped', 'InactiveAssigned']) expect(host.querySelector(`[aria-label="${family}"]`)?.textContent).toContain('Correction route:');
    expect(host.textContent).toContain('Digest HOLD');
    expect(Array.from(host.querySelectorAll('[data-admin-source] button')).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
  });
  it('retains the default missing native coverage binding', async () => {
    await render(); open('Strategic Core Coverage'); expect(host.textContent).toContain('NOT READY'); expect(host.querySelector('[data-admin-source="READY_SOURCE"]')).toBeNull();
  });
  it('discards a late result when the reader/session changes', async () => {
    let release: ((value: IAdminMasterSourceCapture) => void) | undefined;
    const pending = new Promise<IAdminMasterSourceCapture>(resolve => { release = resolve; });
    await render({ read: () => pending }); await render({ read: async () => undefined });
    await act(async () => { release!(capture()); }); open('KPI Master');
    expect(host.textContent).toContain('HOLD'); expect(host.textContent).not.toContain('CAPTURE-ONE');
  });
  it('does not call the read port for an unauthorised identity', async () => {
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: { ...employee, appRoles: [] }, workplanStatus: 'NotStarted', config: { performanceYearNumber: 2027 } });
    const read = jest.fn(async () => capture()); await render({ read }); expect(read).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Access unavailable');
  });
  it('holds the actual caller when no governed period was captured instead of using the catalogue default year', async () => {
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee, workplanStatus: 'NotStarted' });
    const read = jest.fn(async () => capture()); await render({ read }); open('KPI Master');
    expect(read).not.toHaveBeenCalled(); expect(host.textContent).toContain('Governed active period unavailable');
  });
  it('discards the previous actor and year capture after the actual caller changes coordinates', async () => {
    let release: ((value: IAdminMasterSourceCapture) => void) | undefined;
    const pending = new Promise<IAdminMasterSourceCapture>(resolve => { release = resolve; });
    const read = jest.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    const reader = { read };
    await render(reader); expect(read).toHaveBeenCalledTimes(1);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: { ...employee, personKey: 'other', email: 'other@example.invalid' },
      workplanStatus: 'NotStarted', config: { performanceYearNumber: 2028 } });
    await render(reader, 'other@example.invalid');
    await act(async () => { release!(capture()); }); open('KPI Master');
    expect(read).toHaveBeenLastCalledWith({ actor: 'other@example.invalid', person: 'other', year: 2028 });
    expect(host.textContent).toContain('HOLD'); expect(host.textContent).not.toContain('CAPTURE-ONE');
  });
});
