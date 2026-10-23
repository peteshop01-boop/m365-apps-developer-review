jest.mock('../services/ProductionOverviewLoader', () => ({ loadProductionOverview: jest.fn() }));
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import type { IYearLifecycleSyntheticFixture, LifecycleSourceChoice } from '../models/YearLifecycleSourceCallerModels';
import type * as M from '../services/yearLifecycle/YearLifecycleModels';
import { createEmptyYearLifecycleState, sealYearLifecycleImportManifest, sha256Hex } from '../services/yearLifecycle/YearLifecycleImportEngine';
import { createEmptyYearLifecycleTransitionState } from '../services/yearLifecycle/YearLifecycleTransitionEngine';
import { createEmptyStrategyCycleState } from '../services/yearLifecycle/StrategyCycleEngine';
const freeze = <T,>(value: T): T => {
  if (value && typeof value === 'object') { Object.keys(value).forEach(key => freeze((value as Record<string, unknown>)[key])); Object.freeze(value); }
  return value;
};
const adminActor: M.IYearLifecycleActor = { actorId: 'SYNTH-ACTOR', actorEmail: 'admin@example.invalid', role: 'LifecycleAdministrator', active: true };
const guard = { hostname: 'localhost', isAdmin: true, signedInEmail: adminActor.actorEmail, sessionId: 'SYNTH-SESSION' };
const fixture = (): IYearLifecycleSyntheticFixture => {
  const compensation = { actor: adminActor, occurredAt: '2026-10-03T08:00:00.000Z', reason: 'Synthetic same-process compensation' };
  const choices: LifecycleSourceChoice[] = [];
  for (const targetYear of [2026, 2027] as const) {
    const manifest = sealYearLifecycleImportManifest({ schema: 'KCF.YearLifecycleImportManifest', schemaVersion: '1.0.0',
      manifestId: `SYNTH-MANIFEST-${targetYear}`, importKind: targetYear === 2026 ? 'HistoricalGold2026' : 'ApprovedNewYearBaseline2027',
      targetYear, configurationVersion: `CONFIG-${targetYear}-V1`, complete: true, approved: true, approvalReference: 'SYNTH-APPROVAL',
      approvedBy: 'sponsor@example.invalid', approvedAt: '2026-10-01T00:00:00.000Z',
      source: { sourceId: `SYNTH-SOURCE-${targetYear}`, sourceVersion: 'V1', sourceEtag: '"V1"' },
      records: targetYear === 2026 ? [{ recordType: 'HistoricalGold', recordKey: 'GOLD1', performanceYear: 2026,
        entityType: 'GoldTargetSnapshot', sourceRecordKey: 'GOLD-SOURCE1', version: 'FROZEN-V1', classification: 'Core',
        closedYearSnapshot: true, snapshotValue: 'original annual target 100; actual 75' }]
        : [{ recordType: 'ApprovedBaseline', recordKey: 'BASE1', performanceYear: 2027, entityType: 'KPI',
          sourceRecordKey: 'BASE-SOURCE1', version: 'BASE-V1', classification: 'Core', approvalStatus: 'Approved', lifecycleStatus: 'Current' }] });
    choices.push({ id: `import${targetYear}`, label: `Import ${targetYear}`, family: 'Import', compensation, manifest,
      expectation: { manifestId: manifest.manifestId, manifestSha256: manifest.manifestSha256, importKind: manifest.importKind,
        targetYear, configurationVersion: manifest.configurationVersion, approvalReference: manifest.approvalReference,
        sourceId: manifest.source.sourceId, sourceVersion: manifest.source.sourceVersion, sourceEtag: manifest.source.sourceEtag,
        sourceContentSha256: manifest.source.contentSha256 },
      request: { idempotencyKey: `SYNTH-IMPORT-${targetYear}`, requestedAt: '2026-10-03T06:00:00.000Z', actor: adminActor } });
  }
  const boundaries: M.IYearCloseBoundarySnapshot[] = (['Core', 'Impact', 'Behaviour', 'Evidence', 'ManagerAction'] as const).map(boundary => ({
    boundary, sourceVersion: `${boundary}-V1`, sourceSha256: sha256Hex(boundary), recordCount: 3, incompleteCount: boundary === 'Core' ? 1 : 0, unresolvedCount: 0 }));
  for (const [id, transition, year, expected] of [['open27','Open',2027,0], ['open28','Open',2028,0],
    ['blocked','Close',2027,1], ['close27','Close',2027,1], ['reopen27','Reopen',2027,2]] as const) {
    const command: M.IYearLifecycleTransitionCommand = { commandId: id, idempotencyKey: `SYNTH-${id}`, transition,
      performanceYear: year, configurationVersion: `CONFIG-${year}-V1`, expectedYearVersion: expected, actor: adminActor,
      occurredAt: ['2026-10-03T06:10:00.000Z','2026-10-03T06:11:00.000Z','2026-10-03T06:12:00.000Z'][expected], reason: `Synthetic ${id}` };
    choices.push({ id, label: id, family: 'Transition', compensation, command, initialBoundaries: boundaries,
      preClose: { performanceYear: year, configurationVersion: command.configurationVersion, expectedYearVersion: expected,
        boundaries, exceptions: id === 'close27' ? [{ issueKey: 'Core:Incomplete', boundary: 'Core', issueType: 'Incomplete',
          reason: 'Synthetic accepted exception', approvalReference: 'SYNTH-EXCEPTION', approvedBy: 'sponsor@example.invalid',
          approvedAt: '2026-10-02T00:00:00.000Z', approved: true }] : [] } });
  }
  for (const [id, operation, expected] of [['cycle','CreateCycle',0], ['outcome','CreateOutcome',1], ['carry','CarryForward',2],
    ['update','UpdateOutcome',3], ['retire','RetireOutcome',4]] as const) {
    choices.push({ id, label: id, family: 'Strategy', compensation,
      command: { commandId: id, idempotencyKey: `SYNTH-${id}`, operation, cycleId: 'CYCLE2029', performanceYear: 2029,
        expectedCycleVersion: expected, actor: adminActor, occurredAt: ['2026-10-03T06:20:00.000Z','2026-10-03T06:21:00.000Z','2026-10-03T06:22:00.000Z','2026-10-03T06:23:00.000Z','2026-10-03T06:24:00.000Z'][expected], reason: `Synthetic ${id}`,
        source: { sourceId: 'SYNTH-STRATEGY', sourceVersion: 'V1', sourceSha256: sha256Hex('strategy'), approvalReference: 'SYNTH-APPROVED', approved: true } },
      outcome: { outcomeId: 'O1', title: id === 'update' ? 'Updated title' : 'Original title', description: 'Synthetic outcome',
        effectiveCycle: 2029, effectivePeriod: '2029-01-01/2029-12-31' }, outcomeId: 'O1',
      selection: { selectionMode: 'Explicit', items: [{ entityType: 'Mapping', sourceStableId: 'SOURCE-MAP1', targetStableId: 'TARGET-MAP1',
        sourceVersion: 'V1', sourceSha256: sha256Hex('map1'), approvalStatus: 'Approved', lifecycleStatus: 'Active', obsolete: false,
        sourceClassification: 'NotApplicable', targetClassification: 'NotApplicable', outcomeId: 'O1', outcomeVersion: 1 }] } });
  }
  return freeze({ kind: 'SyntheticLifecycleSource', fixtureId: 'SYNTH-WP41', sessionId: guard.sessionId, signedInEmail: adminActor.actorEmail,
    imports: createEmptyYearLifecycleState(), transitions: createEmptyYearLifecycleTransitionState(), strategy: createEmptyStrategyCycleState(), choices });
};
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import IntegratedPerformanceHub from './IntegratedPerformanceHub';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService } from '../services/AdminReportingControlDataService';
const person = { id: 1, personKey: 'admin', displayName: 'Synthetic Admin', email: adminActor.actorEmail, appRoles: ['SystemAdmin'], active: true };
const dataService = { getAdminPeople: async () => [], getAdminTeams: async () => [], getAdminConfigRecords: async () => [{ key: 'ExistingConfig', textValue: 'Preserved setting', active: true }],
  getBehaviourObjectiveLibrary: async () => [], getDirectReports: async () => [], getQuarterTimingConfig: async () => { throw new Error('No quarter capture'); },
  getCoreKpiCatalogue: async () => [], getPublishedBehaviours: async () => [], getEmployeeWorkplanV2: async () => undefined } as unknown as IProductionDataService;
const reporting = { getAdminReportingControlSnapshot: async () => ({ performanceYear: 2027, reportingMaps: [], outputDefinitions: [] }) } as unknown as IAdminReportingControlDataService;

import { buildStrategicCoreCoverageUatSource } from '../services/StrategicCoreCoverageFeed';
import type { IAdminMasterSourceCapture, IAdminMasterSourceReader } from '../models/AdminMasterSourceCompositionModels';
const capture = (): IAdminMasterSourceCapture => {
  const coverage = buildStrategicCoreCoverageUatSource();
  const records = coverage.kpis.map((row, index) => ({ id: index, kpiId: row.kpiId, kpiVersionKey: 'v1', wording: row.wording,
    wordingSourceReference: 'synthetic-master/v1', pillar: row.pillar, workstream: row.workstream, active: index !== 1,
    owner: index === 0 ? 'Owner A' : 'Owner B', measureType: 'Count', unit: row.unit, direction: 'HigherIsBetter', aggregationMethod: 'DirectMetric', reportingStatus: 'Included' }));
  return { coordinates: { actor: person.email, person: person.personKey, year: 2027 }, sourceVersion: 'CAPTURE-ONE', masterVersion: 'm1', mappingVersion: 'map1',
    assignmentVersion: 'a1', coverageVersion: 'c1', sourceReference: 'Synthetic explicit source', asOfDate: coverage.asOfDate, activePeriod: '2027 Annual',
    records: [...records, records[0]], coverage, mappings: records.map((row, index) => ({ kpiId: row.kpiId, kpiVersionKey: 'v1', strategyId: 'S1',
      strategyVersion: 'S1v1', activePeriod: '2027 Annual', sourceReference: 'explicit mapping', outcome: index === 2 ? 'Unmapped' : { outcomeId: 'O1', outcomeVersion: 1 } })),
    assignments: records.map(row => ({ assignmentId: row.kpiId, kpiId: row.kpiId, kpiVersionKey: 'v1', person: 'Person A', role: 'Contributor',
      current: true, activePeriod: '2027 Annual', sourceReference: 'assignment1' })), dataQualityIssues: [] };
};

describe('actual Hub common Admin and lifecycle source callers', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host);
    (loadProductionOverview as jest.Mock).mockResolvedValue({ employee: person, workplanStatus: 'Draft', config: { performanceYearNumber: 2027 } }); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks(); });
  const render = async (reader?: IAdminMasterSourceReader, synthetic?: IYearLifecycleSyntheticFixture, email = person.email): Promise<void> => {
    await act(async () => { ReactDOM.render(<IntegratedPerformanceHub dataService={dataService} adminReportingDataService={reporting}
      currentUserEmail={email} userDisplayName="Synthetic Admin" adminMasterSourceReader={reader} localSyntheticLifecycleFixture={synthetic} />, host); });
    for (let i=0;i<20;i++) await act(async () => { await Promise.resolve(); });
  };
  const click = (label: string): void => { const b = Array.from(host.querySelectorAll('button')).find(x => x.textContent?.trim() === label);
    if (!b) throw new Error(`Missing ${label}`); act(() => b.click()); };
  it('coexists across all three Admin tabs and Config while retaining independent source periods, history and receipts', async () => {
    const read = jest.fn(async () => capture()); await render({ read }, fixture());
    expect(read).toHaveBeenCalledWith({ actor: person.email, person: person.personKey, year: 2027 });
    click('KPI Master'); expect(host.textContent).toContain('O1 / v1'); expect(host.textContent).toContain('Person A');
    click('Strategic Core Coverage'); expect(host.textContent).toContain('SC-SCHOOLS-200');
    click('Data Quality'); for (const family of ['Duplicate','Unmapped','InactiveAssigned']) expect(host.querySelector(`[aria-label="${family}"]`)).not.toBeNull();
    expect(host.textContent).toContain('Digest HOLD'); click('Config'); expect(host.textContent).toContain('Preserved setting');
    for (const choice of ['Import 2026','Import 2027','open27','open28']) { click(`Plan ${choice}`); click(`Apply ${choice}`); }
    click('Plan blocked'); expect(host.textContent).toContain('Rejected');
    for (const choice of ['close27','reopen27','cycle','outcome','carry','update','retire']) { click(`Plan ${choice}`); click(`Apply ${choice}`); }
    expect(host.textContent).toContain('original annual target 100; actual 75'); expect(host.textContent).toContain('Original title');
    for (const family of ['Import','Transition','Strategy']) {
      const button=Array.from(host.querySelectorAll('button')).filter(b=>b.textContent?.startsWith(`Compensate ${family}`)).slice(-1)[0];
      expect(button).toBeDefined(); act(()=>button.click());
    }
    expect(host.querySelector('[aria-label="Lifecycle results and receipts"]')?.textContent?.match(/RolledBack/g)).toHaveLength(3);
    click('KPI Master'); expect(host.textContent).toContain('O1 / v1');
    click('Config'); expect(host.textContent).toContain('RolledBack');
    expect(read).toHaveBeenLastCalledWith({ actor: person.email, person: person.personKey, year: 2027 });
  });
  it('keeps lifecycle authority isolated from an absent or replaced Admin capture', async () => {
    const synthetic=fixture(); await render({ read: async()=>capture() }, synthetic); click('Config'); click('Plan cycle'); click('Apply cycle');
    await render({ read: async()=>undefined }, synthetic); click('KPI Master'); expect(host.textContent).toContain('HOLD');
    click('Config'); expect(host.textContent).toContain('Compensate Strategy');
    expect(host.textContent).toContain('Preserved setting');
  });
  it('holds both default bindings and discards lifecycle capabilities and Admin capture on identity change', async () => {
    await render(); click('Strategic Core Coverage'); expect(host.textContent).toContain('NOT READY'); click('Config'); expect(host.textContent).toContain('UNBOUND / HOLD');
    const reader={read: async()=>capture()}, synthetic=fixture(); await render(reader,synthetic); click('Config'); click('Plan cycle'); click('Apply cycle');
    (loadProductionOverview as jest.Mock).mockResolvedValue({employee:{...person,email:'other@example.invalid'},workplanStatus:'Draft',config:{performanceYearNumber:2027}});
    await render(reader,synthetic,'other@example.invalid'); click('Config'); expect(host.textContent).toContain('UNBOUND / HOLD'); expect(host.textContent).not.toContain('Compensate Strategy');
    click('KPI Master'); expect(host.textContent).toContain('HOLD'); expect(host.querySelector('[data-admin-source="READY_SOURCE"]')).toBeNull();
  });
  it('does not obtain either caller authority through a non-admin profile', async () => {
    (loadProductionOverview as jest.Mock).mockResolvedValue({employee:{...person,appRoles:['Employee']},workplanStatus:'Draft',config:{performanceYearNumber:2027}});
    const read=jest.fn(async()=>capture()); await render({read},fixture()); expect(read).not.toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Synthetic year lifecycle source caller"]')).toBeNull();
    expect(Array.from(host.querySelectorAll('button')).some(b=>b.textContent==='Config')).toBe(false);
  });
});
