import type { IYearLifecycleSyntheticFixture, LifecycleSourceChoice } from '../models/YearLifecycleSourceCallerModels';
import type * as M from '../services/yearLifecycle/YearLifecycleModels';
import { createEmptyYearLifecycleState, sealYearLifecycleImportManifest, sha256Hex } from '../services/yearLifecycle/YearLifecycleImportEngine';
import { createEmptyYearLifecycleTransitionState } from '../services/yearLifecycle/YearLifecycleTransitionEngine';
import { createEmptyStrategyCycleState } from '../services/yearLifecycle/StrategyCycleEngine';
import { createYearLifecycleSyntheticSourceSession } from '../services/yearLifecycle/YearLifecycleSyntheticSourceSession';
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
import { YearLifecycleSourceCallerView } from './YearLifecycleSourceCallerView';
describe('accessible synthetic caller view', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host=document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  it('keeps all default controls disabled and shows recovery limits', () => {
    act(() => { ReactDOM.render(<YearLifecycleSourceCallerView />,host); });
    expect(host.textContent).toContain('UNBOUND / HOLD');
    expect(Array.from(host.querySelectorAll('button')).every(button => button.disabled)).toBe(true);
    expect(host.textContent).toContain('unavailable after reload');
  });
  it('offers only captured choices, separate plan/apply and retained receipts', () => {
    const session=createYearLifecycleSyntheticSourceSession(fixture(),guard);
    act(() => { ReactDOM.render(<YearLifecycleSourceCallerView session={session} />,host); });
    const button = (text: string): HTMLButtonElement => Array.from(host.querySelectorAll('button')).find(item => item.textContent === text)!;
    expect(host.querySelectorAll('input,textarea')).toHaveLength(0);
    expect(button('Apply Import 2026').disabled).toBe(true);
    act(() => button('Plan Import 2026').click()); expect(button('Apply Import 2026').disabled).toBe(false);
    act(() => button('Apply Import 2026').click());
    expect(host.querySelector('[aria-label="Lifecycle results and receipts"]')?.textContent).toContain('Applied');
    const compensation=Array.from(host.querySelectorAll('button')).find(item => item.textContent?.startsWith('Compensate Import'))!;
    act(() => compensation.click()); expect(host.textContent).toContain('RolledBack'); expect(host.textContent).toContain('Applied');
  });
});
