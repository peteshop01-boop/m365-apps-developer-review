import type { IYearLifecycleSyntheticFixture, LifecycleSourceChoice } from '../../models/YearLifecycleSourceCallerModels';
import type * as M from './YearLifecycleModels';
import { applyYearLifecycleImport, createEmptyYearLifecycleState, sealYearLifecycleImportManifest, sha256Hex } from './YearLifecycleImportEngine';
import { createEmptyYearLifecycleTransitionState } from './YearLifecycleTransitionEngine';
import { createEmptyStrategyCycleState } from './StrategyCycleEngine';
import { createYearLifecycleSyntheticSourceSession } from './YearLifecycleSyntheticSourceSession';
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
const execute = (session: ReturnType<typeof createYearLifecycleSyntheticSourceSession>, id: string): void => { session.plan(id); session.apply(id); };
describe('synthetic source session with genuine private capabilities', () => {
  it('exposes a frozen plan projection without releasing the genuine plan capability', () => {
    const capture = fixture(); const session = createYearLifecycleSyntheticSourceSession(capture, guard);
    session.plan('import2026'); const displayed = session.read().events[0].detail;
    expect(Object.isFrozen(displayed)).toBe(true);
    expect(applyYearLifecycleImport(displayed, capture.imports).status).toBe('Rejected');
    session.apply('import2026'); expect(session.read().events.slice(-1)[0].status).toBe('Applied');
  });
  it.each(['source', 'targetYear', 'commandYear', 'configuration', 'expectedVersion'])('holds missing %s capture', field => {
    const capture = JSON.parse(JSON.stringify(fixture()));
    if (field === 'source') delete capture.choices[0].manifest.source;
    if (field === 'targetYear') delete capture.choices[0].manifest.targetYear;
    if (field === 'commandYear') delete capture.choices[2].command.performanceYear;
    if (field === 'configuration') delete capture.choices[2].command.configurationVersion;
    if (field === 'expectedVersion') delete capture.choices[2].command.expectedYearVersion;
    expect(createYearLifecycleSyntheticSourceSession(freeze(capture), guard).read().available).toBe(false);
  });
  it('dispatches all families and reads original versions without cross-family mutations', () => {
    const session = createYearLifecycleSyntheticSourceSession(fixture(), guard);
    expect(session.read().available).toBe(true);
    execute(session, 'import2026'); const gold = JSON.stringify(session.read().imports[0]);
    execute(session, 'import2027');
    expect(JSON.stringify(session.read().imports[0])).toBe(gold);
    execute(session, 'open27'); execute(session, 'open28');
    session.plan('blocked'); expect(session.read().events.slice(-1)[0].status).toBe('Rejected');
    execute(session, 'close27'); execute(session, 'reopen27');
    const transition = JSON.stringify(session.read().transitions);
    for (const id of ['cycle','outcome','carry','update','retire']) execute(session, id);
    const result = session.read();
    expect(result.events.filter(event => event.status === 'Applied')).toHaveLength(11);
    expect(result.transitions[0].versions.map(version => version?.transition)).toEqual(['Open','Close','Reopen']);
    expect(result.transitions[0].versions[1]?.acceptedExceptions).toHaveLength(1);
    expect(result.transitions[1].history.currentVersion).toBe(1);
    expect(result.strategy[0].outcomes.map(version => version?.status)).toEqual(['Active','Active','Retired']);
    expect(result.strategy[0].outcomes[0]?.title).toBe('Original title');
    expect(result.strategy[0].versions[2]?.carriedRecords[0]).toMatchObject({ outcomeId: 'O1', outcomeVersion: 1 });
    expect(JSON.stringify(result.transitions)).toBe(transition); expect(JSON.stringify(result.imports[0])).toBe(gold);
    expect(JSON.stringify(result)).not.toContain('appliedStateRevision');
  });
  it.each(['import2026','open27','cycle'])('compensates %s once with exact same-process token and retains receipts', id => {
    const session = createYearLifecycleSyntheticSourceSession(fixture(), guard);
    const before = session.read(); execute(session,id);
    const capability = session.read().compensation[0];
    session.plan(id); expect(session.read().events.slice(-1)[0].status).toBe('Idempotent');
    expect(session.read().compensation).toHaveLength(1);
    session.compensate(capability.id);
    expect(session.read().events.slice(-1)[0].status).toBe('RolledBack');
    expect(session.read().imports).toEqual(before.imports); expect(session.read().transitions).toEqual(before.transitions);
    expect(session.read().strategy).toEqual(before.strategy);
    session.compensate(capability.id); expect(session.read().events.slice(-1)[0].status).toBe('Rejected');
    expect(session.read().events.some(event => event.status === 'Applied')).toBe(true);
    expect(session.read().events.some(event => event.status === 'RolledBack')).toBe(true);
  });
  it('rejects stale compensation and stale plans and never rehydrates receipt JSON', () => {
    const capture = fixture(); const session = createYearLifecycleSyntheticSourceSession(capture, guard);
    session.plan('import2026'); session.plan('import2027'); session.apply('import2026'); session.apply('import2027');
    expect(session.read().events.slice(-1)[0].status).toBe('Rejected');
    const old = session.read().compensation[0].id; execute(session,'import2027');
    session.compensate(old); expect(session.read().events.slice(-1)[0].status).toBe('Rejected');
    const reload = createYearLifecycleSyntheticSourceSession(capture, guard); reload.compensate(old);
    expect(reload.read().events.slice(-1)[0].status).toBe('Rejected');
    session.discard(); expect(session.read().available).toBe(false); expect(session.read().compensation).toHaveLength(0);
    session.compensate(old); expect(session.read().imports.every(value => !value)).toBe(true);
  });
  it.each([{ hostname: 'example.invalid' }, { isAdmin: false }, { signedInEmail: 'other@example.invalid' }, { sessionId: 'other' }])('holds wrong local session %j', patch => {
    const session = createYearLifecycleSyntheticSourceSession(fixture(), { ...guard, ...patch });
    expect(session.read().available).toBe(false); session.plan('cycle'); expect(session.read().pending).toHaveLength(0);
  });
  it('holds absent, mutable, missing actor/date/capture and rejects caller-invented selections', () => {
    expect(createYearLifecycleSyntheticSourceSession(undefined, guard).read().available).toBe(false);
    expect(createYearLifecycleSyntheticSourceSession(JSON.parse(JSON.stringify(fixture())), guard).read().available).toBe(false);
    for (const field of ['actor','requestedAt']) {
      const value = JSON.parse(JSON.stringify(fixture())); delete value.choices[0].request[field];
      expect(createYearLifecycleSyntheticSourceSession(freeze(value), guard).read().available).toBe(false);
    }
    const session = createYearLifecycleSyntheticSourceSession(fixture(), guard);
    session.plan('invented'); session.apply('invented'); session.compensate('{}');
    expect(session.read().events.every(event => event.status === 'Rejected')).toBe(true);
  });
  it.each(['year','hash','source','config','revision','cycle'])('rejects supplied invalid %s through existing engine checks', kind => {
    const value = JSON.parse(JSON.stringify(fixture())); let id = 'import2026';
    if (kind === 'year') value.choices[0].manifest.targetYear = 2028;
    if (kind === 'hash') value.choices[0].manifest.manifestSha256 = '0'.repeat(64);
    if (kind === 'source') value.choices[0].expectation.sourceId = 'different';
    if (kind === 'config') value.choices[0].expectation.configurationVersion = 'different';
    if (kind === 'revision') { id = 'open27'; value.choices[2].command.expectedYearVersion = 99; }
    if (kind === 'cycle') { id = 'cycle'; value.choices[7].command.performanceYear = 2028; }
    const session = createYearLifecycleSyntheticSourceSession(freeze(value), guard); session.plan(id);
    expect(session.read().events.slice(-1)[0].status).toBe('Rejected'); expect(session.read().pending).toHaveLength(0);
  });
});
