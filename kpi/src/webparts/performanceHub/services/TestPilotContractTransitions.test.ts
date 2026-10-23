import { readFileSync } from 'fs';
import { ModelHeader, SafeBusinessRow, EffectIntent, LocalJournal, StableSnapshot, TrustedGrantContext, AuthorisationState } from '../models/TestPilotContracts';
import { planJournal as planBoundJournal, planCreateJournal as planBoundCreateJournal, issueEffect as issueBoundEffect, settleEffect, completeCanonical, reconcileTerminal, stableRead, intendedCoreSet } from './TestRuntimeBindings';
const fixture = JSON.parse(readFileSync('data/test-pilot/command-fixtures.json', 'utf8')) as { header: ModelHeader; rows: SafeBusinessRow[] };
const header = (): ModelHeader => ({ ...fixture.header });
const rows = (): SafeBusinessRow[] => fixture.rows.map(r => ({ ...r }));
const claimed = (): ModelHeader => ({ ...header(), transition: 'InProgress', correlation: 'LOCAL-CORR-01', rowVersionToken: 1, etag: '"2"' });
const ready = (): ModelHeader => ({ ...claimed(), transition: 'Ready', rowVersionToken: 2, etag: '"3"' });
const snapshot = (): StableSnapshot => ({ before: ready(), after: ready(), pages: [rows()], complete: true });
const context = (commandKey = 'LOCAL-CMD-01', correlation = 'LOCAL-CORR-01'): TrustedGrantContext => ({
  commandKey, correlation, subjectKey: header().workplanKey, actorKey: header().personKey, expectedRevision: 1,
  state: JSON.parse(readFileSync('data/test-pilot/authorisation.json', 'utf8')) as AuthorisationState,
  resources: [
    { key: header().workplanKey, resource: 'Core', workplanKey: header().workplanKey, personKey: header().personKey, year: 2027 },
    { key: rows()[0].key, resource: 'Core', workplanKey: header().workplanKey, personKey: header().personKey, year: 2027 },
    { key: 'LOCAL-STATUS-01', resource: 'Status', workplanKey: header().workplanKey, personKey: header().personKey, year: 2027 }
  ]
});
// Preserve every original transition assertion; only supply the new mandatory trusted fixture boundary.
const planJournal = (cmd: string, h: ModelHeader, correlation: string, effects: EffectIntent[], expected: SafeBusinessRow[], previous?: LocalJournal): LocalJournal =>
  planBoundJournal(cmd, h, correlation, effects, expected, context(cmd, correlation), previous);
const planCreateJournal = (cmd: string, h: ModelHeader, correlation: string, effects: EffectIntent[], expected: SafeBusinessRow[], count: number, previous?: LocalJournal): LocalJournal =>
  planBoundCreateJournal(cmd, h, correlation, effects, expected, count, context(cmd, correlation), previous);
const issueEffect = (j: LocalJournal, id: string, h: ModelHeader | null, stable?: StableSnapshot): LocalJournal =>
  issueBoundEffect(j, id, h, context(j.commandKey, j.correlation), stable);
function intents(): EffectIntent[] {
  const h = header(), c = claimed();
  const effect = (kind: EffectIntent['kind'], key: string, existingId: number | null, tag: string | null, beforeImage: string | null, desiredImage: string, reader: string | null = null): EffectIntent =>
    ({ id: `LOCAL-CMD-01:${kind}:${key}`, kind, key, existingId, expectedETag: tag, beforeImage, desiredImage, reader });
  return [effect('Claim', h.workplanKey, h.id, h.etag, JSON.stringify(h), JSON.stringify(c)),
    effect('Canonical', rows()[0].key, null, null, null, JSON.stringify(rows()[0])),
    effect('Grant', rows()[0].key, null, null, null, 'LOCAL-ACTOR-ONLY', h.personKey),
    effect('Finalise', h.workplanKey, h.id, c.etag, JSON.stringify(c), JSON.stringify(ready())),
    effect('StatusCreate', 'LOCAL-STATUS-01', null, null, null, 'LOCAL-SAFE-STATUS'),
    effect('StatusGrant', 'LOCAL-STATUS-01', null, null, null, 'LOCAL-ACTOR-ONLY', h.personKey)];
}
const planned = (): LocalJournal => planJournal('LOCAL-CMD-01', header(), 'LOCAL-CORR-01', intents(), rows());
const next = (j: LocalJournal, kind: EffectIntent['kind']): LocalJournal => {
  const e = j.effects.find(e => e.kind === kind)!;
  const h = kind === 'Claim' ? header() : ['StatusCreate', 'StatusGrant'].includes(kind) ? ready() : claimed();
  return settleEffect(issueEffect(j, e.id, h, snapshot()), e.id, 'Confirmed', `LOCAL-RESPONSE:${kind}`);
};
const atReady = (): LocalJournal => {
  let j = next(next(next(planned(), 'Claim'), 'Canonical'), 'Grant');
  j = completeCanonical(j, rows(), true, true, 'LOCAL-COMPLETE-SET-AND-GRANTS'); return next(j, 'Finalise');
};
describe('R02 stable-key journal, concurrency, complete-set and hold-only models', () => {
  it('complete deterministic intent includes absent insert, claim/finalise and fixed actor status grants before issue', () => {
    const a = planned(); expect(a).toEqual(planned()); expect(a.effects.every(e => e.disposition === 'Planned' && e.response === null)).toBe(true);
    expect(a.effects.find(e => e.kind === 'Canonical')).toMatchObject({ existingId: null, expectedETag: null, beforeImage: null });
    expect(() => issueEffect(a, 'UNJOURNALLED', header())).toThrow();
    for (const kind of ['Claim', 'Canonical', 'Finalise', 'StatusGrant'] as const) expect(() => planJournal('LOCAL-CMD-01', header(), 'LOCAL-CORR-01', intents().filter(e => e.kind !== kind), rows())).toThrow();
  });
  it('never issues dependent effects before confirmed claim; no wildcard or blank conditional write', () => {
    const j = planned(), claim = j.effects[0]; expect(() => issueEffect(j, j.effects[1].id, claimed())).toThrow();
    const issued = issueEffect(j, claim.id, header()); expect(() => issueEffect(issued, issued.effects[1].id, claimed())).toThrow();
    expect(() => settleEffect(issued, claim.id, 'Confirmed', null)).toThrow();
    for (const tag of ['*', '']) { const bad = intents(); bad[0].expectedETag = tag; expect(() => planJournal('LOCAL-CMD-01', header(), 'LOCAL-CORR-01', bad, rows())).toThrow(); }
  });
  it('creation uses zero matching headers and a private InProgress insert; one/duplicate headers never clone', () => {
    const all = intents(); all[0] = { ...all[0], existingId: null, expectedETag: null, beforeImage: null };
    const j = planCreateJournal('LOCAL-CMD-01', header(), 'LOCAL-CORR-01', all, rows(), 0);
    expect(issueEffect(j, j.effects[0].id, null).effects[0].disposition).toBe('Issued');
    expect(() => issueEffect(j, j.effects[0].id, header())).toThrow();
    for (const count of [1, 2]) expect(() => planCreateJournal('LOCAL-CMD-01', header(), 'LOCAL-CORR-01', all, rows(), count)).toThrow();
  });
  it.each([{ etag: '"7"' }, { rowVersionToken: 2 }, { transition: 'InProgress' }, { access: 'RecoveryHold' }, { workplanKey: 'OTHER|2027' }])('stale/held header rejects claim %j', patch => {
    const j = planned(); expect(() => issueEffect(j, j.effects[0].id, { ...header(), ...patch } as ModelHeader)).toThrow();
  });
  it('finalise requires THIS correlation/ETag, all writes/grants, complete pages, exact rows and private completion', () => {
    let j = next(planned(), 'Claim'); expect(() => issueEffect(j, j.effects[3].id, claimed())).toThrow();
    j = next(next(j, 'Canonical'), 'Grant');
    expect(() => completeCanonical(j, rows(), false, true, 'LOCAL-REF')).toThrow(); expect(() => completeCanonical(j, rows(), true, false, 'LOCAL-REF')).toThrow();
    expect(() => completeCanonical(j, [], true, true, 'LOCAL-REF')).toThrow(); expect(() => completeCanonical(j, [{ ...rows()[0], weight: 50 }], true, true, 'LOCAL-REF')).toThrow();
    expect(() => issueEffect(j, j.effects[3].id, claimed())).toThrow();
    j = completeCanonical(j, rows(), true, true, 'LOCAL-REF');
    expect(() => issueEffect(j, j.effects[3].id, { ...claimed(), correlation: 'OTHER' })).toThrow();
    expect(() => issueEffect(j, j.effects[3].id, { ...claimed(), etag: '"9"' })).toThrow();
    expect(next(j, 'Finalise').phase).toBe('Ready');
  });
  it.each(['Claim', 'Canonical', 'Grant', 'Finalise', 'StatusCreate', 'StatusGrant'] as const)('unknown %s blocks Ready restoration, delayed completion and all successors', kind => {
    let j = planned();
    for (const prior of ['Claim', 'Canonical', 'Grant', 'Finalise', 'StatusCreate', 'StatusGrant'] as const) {
      if (prior === kind) break;
      if (prior === 'Finalise') j = completeCanonical(j, rows(), true, true, 'LOCAL-COMPLETE');
      j = next(j, prior);
    }
    if (kind === 'Finalise') j = completeCanonical(j, rows(), true, true, 'LOCAL-COMPLETE');
    const id = j.effects.find(e => e.kind === kind)!.id;
    j = settleEffect(issueEffect(j, id, kind === 'Claim' ? header() : ['StatusCreate', 'StatusGrant'].includes(kind) ? ready() : claimed(), snapshot()), id, 'Unknown', null);
    expect(j.phase).toBe('Held'); expect(() => settleEffect(j, id, 'Confirmed', 'LOCAL-LATE-RESPONSE')).toThrow();
    expect(() => reconcileTerminal(j, snapshot())).toThrow(); expect(() => planJournal('LOCAL-NEXT', header(), 'LOCAL-NEXT-CORR', intents(), rows(), j)).toThrow();
    expect(() => issueEffect(j, j.effects[3].id, claimed())).toThrow();
  });
  it('no canonical/grant mutation after Ready; missing status reconciles original terminal only after stable proof', () => {
    let j = atReady(); expect(j.phase).toBe('Ready');
    expect(() => issueEffect(j, j.effects[1].id, ready())).toThrow(); expect(() => issueEffect(j, j.effects[2].id, ready())).toThrow();
    expect(() => issueEffect(j, j.effects[4].id, ready())).toThrow(); expect(() => reconcileTerminal(j, snapshot())).toThrow();
    expect(() => planJournal('LOCAL-NEXT', header(), 'LOCAL-NEXT-CORR', intents(), rows(), j)).toThrow();
    j = next(next(j, 'StatusCreate'), 'StatusGrant'); const terminal = reconcileTerminal(j, snapshot()); expect(terminal.phase).toBe('Terminal');
    expect(planJournal('LOCAL-NEXT', ready(), 'LOCAL-NEXT-CORR', intents(), rows(), terminal).phase).toBe('Planned');
  });
  it('status cannot grant a different actor, and uncertain status never becomes a canonical grant', () => {
    const all = intents(); all[5].reader = 'LOCAL-P09'; expect(() => planJournal('LOCAL-CMD-01', header(), 'LOCAL-CORR-01', all, rows())).toThrow();
    expect(intents().filter(e => e.kind === 'StatusGrant').map(e => e.key)).toEqual(['LOCAL-STATUS-01']);
  });
  it('stable read rejects changed ETag/token, Ready ABA, partial pages, duplicate/forged rows and held headers', () => {
    expect(stableRead(snapshot(), rows())).toBe(true);
    for (const patch of [{ etag: '"4"' }, { rowVersionToken: 4 }, { transition: 'InProgress' }, { transition: 'Failed', access: 'RecoveryHold' }]) {
      const s = snapshot(); s.after = { ...s.after, ...patch } as ModelHeader; expect(stableRead(s, rows())).toBe(false);
    }
    expect(stableRead({ ...snapshot(), complete: false }, rows())).toBe(false);
    for (const pages of [[], [rows(), rows()], [[{ ...rows()[0], personKey: 'LOCAL-P09' }]], [[{ ...rows()[0], target: 41 }]]]) expect(stableRead({ ...snapshot(), pages }, rows())).toBe(false);
  });
  it('all pages exceed 500 without silent truncation', () => {
    const many = Array.from({length: 501}, (_, i) => ({ ...rows()[0], key: `LOCAL-ITEM-${i}`, referenceKey: `LOCAL-KPI-${i}`, naturalKey: `${header().workplanKey}|CoreGold|LOCAL-KPI-${i}` }));
    const s = { ...snapshot(), pages: [many.slice(0, 500), many.slice(500)] }; expect(stableRead(s, many)).toBe(true);
    expect(stableRead({ ...s, pages: [many.slice(0, 500)] }, many)).toBe(false);
  });
  it('stable upsert/deactivate recalculates the full active Core set without deleting or altering Personal/Behaviour fields', () => {
    const core = rows()[0], other: SafeBusinessRow = { ...core, key: 'LOCAL-CORE-2', referenceKey: 'LOCAL-KPI-02', naturalKey: `${core.workplanKey}|CoreGold|LOCAL-KPI-02` };
    const personal: SafeBusinessRow = { ...core, key: 'LOCAL-PERSONAL-1', category: 'LocalPersonal', referenceKey: 'LOCAL-PERSONAL-1', naturalKey: `${core.workplanKey}|LocalPersonal|LOCAL-PERSONAL-1`, weight: 35 };
    const behaviour: SafeBusinessRow = { ...core, key: 'LOCAL-BHV-1', category: 'Behaviour', referenceKey: 'BHV-01', naturalKey: `${core.workplanKey}|Behaviour|BHV-01`, weight: 20,
      BehaviourSelectedSuggestionKeysJ: '["BHV-01-01"]', BehaviourCustomObjective: 'Preserved synthetic objective.' };
    const before = [core, personal, behaviour], added = intendedCoreSet(before, other);
    expect(added.filter(r => r.category === 'CoreGold').map(r => r.weight)).toEqual([50, 50]); expect(before).toEqual([core, personal, behaviour]);
    const deactivated = intendedCoreSet(added, { ...other, active: false }); expect(deactivated).toHaveLength(4);
    expect(deactivated.find(r => r.key === core.key)?.weight).toBe(100); expect(deactivated.find(r => r.key === other.key)).toMatchObject({ active: false, weight: 0 });
    expect(deactivated.find(r => r.key === personal.key)).toEqual(personal); expect(deactivated.find(r => r.key === behaviour.key)).toEqual(behaviour);
    expect(() => intendedCoreSet(before, { ...core, key: 'CLONED-KEY' })).toThrow(); expect(() => intendedCoreSet([...before, core], other)).toThrow();
  });
});
