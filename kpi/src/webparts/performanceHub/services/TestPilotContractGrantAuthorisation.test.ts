import { readFileSync } from 'fs';
import { AuthorisationState, EffectIntent, LocalJournal, ModelHeader, SafeBusinessRow, TrustedGrantContext } from '../models/TestPilotContracts';
import { planJournal, issueEffect, settleEffect, readPolicy } from './TestRuntimeBindings';
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const fixture = JSON.parse(readFileSync('data/test-pilot/command-fixtures.json', 'utf8')) as { header: ModelHeader; rows: SafeBusinessRow[] };
const h = fixture.header, row = fixture.rows[0], command = 'LOCAL-CMD-GRANT', correlation = 'LOCAL-GRANT-EPOCH';
const claimed: ModelHeader = { ...h, etag: '"2"', transition: 'InProgress', rowVersionToken: 1, correlation };
function context(): TrustedGrantContext {
  return { commandKey: command, correlation, subjectKey: h.workplanKey, actorKey: h.personKey, expectedRevision: 1,
    state: JSON.parse(readFileSync('data/test-pilot/authorisation.json', 'utf8')) as AuthorisationState,
    resources: [
      { key: h.workplanKey, resource: 'Core', workplanKey: h.workplanKey, personKey: h.personKey, year: 2027 },
      { key: row.key, resource: 'Core', workplanKey: h.workplanKey, personKey: h.personKey, year: 2027 },
      { key: 'LOCAL-STATUS-GRANT', resource: 'Status', workplanKey: h.workplanKey, personKey: h.personKey, year: 2027 }
    ] };
}
function effects(): EffectIntent[] {
  const effect = (kind: EffectIntent['kind'], key: string, reader: string | null = null): EffectIntent =>
    ({ id: `LOCAL-${kind}`, kind, key, reader, existingId: null, expectedETag: null, beforeImage: null, desiredImage: 'LOCAL-EFFECT' });
  return [{ ...effect('Claim', h.workplanKey), existingId: h.id, expectedETag: h.etag, beforeImage: JSON.stringify(h), desiredImage: JSON.stringify(claimed) },
    { ...effect('Canonical', row.key), desiredImage: JSON.stringify(row) }, effect('Grant', row.key, h.personKey),
    { ...effect('Finalise', h.workplanKey), existingId: h.id, expectedETag: claimed.etag, beforeImage: JSON.stringify(claimed) },
    effect('StatusCreate', 'LOCAL-STATUS-GRANT'), effect('StatusGrant', 'LOCAL-STATUS-GRANT', h.personKey)];
}
const extra = (reader: string, key = row.key): EffectIntent => ({ ...effects()[2], id: 'LOCAL-EXTRA-GRANT', reader, key });
const plan = (c = context(), all = effects(), rows = [row]): LocalJournal => planJournal(command, h, correlation, all, rows, c);
const claim = (j: LocalJournal, c: TrustedGrantContext): LocalJournal => settleEffect(issueEffect(j, j.effects[0].id, h, c), j.effects[0].id, 'Confirmed', 'LOCAL-CLAIM-OBSERVATION');
describe('SEC-C1-001 every grant pair authorised before issue / LOCAL model only', () => {
  it('original excess unrelated-reader pattern is denied while the required owner grant remains', () => {
    const c = context(); const bad = [...effects(), extra('LOCAL-P09')];
    expect(readPolicy({ environment: 'TEST', year: 2027, actorKey: 'LOCAL-P09', targetKey: h.personKey, resource: 'Core', expectedRevision: 1 }, c.state, c.state).policy).toBe('Denied');
    expect(bad.some(e => e.kind === 'Grant' && e.reader === h.personKey)).toBe(true);
    expect(() => plan(c, bad)).toThrow();
  });
  it.each(['LOCAL-UNRELATED-RESOURCE', 'LOCAL-P09|2027', 'LOCAL-STATUS-GRANT'])('rejects excess business Grant resource %s even for owner', key => {
    expect(() => plan(context(), [...effects(), extra(h.personKey, key)])).toThrow();
  });
  it.each(['LOCAL-P10', 'LOCAL-P04', 'LOCAL-P01'])('preserves legitimate owner/direct-manager/SLT reader %s through issuance', reader => {
    const c = context(); c.state.actors[3].roles = ['Employee', 'Manager']; // Direct-manager proof cannot borrow SLT.
    const all = [...effects(), extra(reader)]; const j = claim(plan(c, all), c);
    expect(issueEffect(j, 'LOCAL-EXTRA-GRANT', claimed, c).effects.find(e => e.id === 'LOCAL-EXTRA-GRANT')?.disposition).toBe('Issued');
  });
  it.each(['LOCAL-P01', 'LOCAL-P05', 'LOCAL-P13'])('denies non-transitive manager/AppAdmin-only/sibling reader %s', reader => {
    const c = context(); c.state.actors[0].roles = ['Employee', 'Manager']; c.state.actors[4].roles = ['Employee', 'AppAdmin'];
    expect(() => plan(c, [...effects(), extra(reader)])).toThrow();
  });
  it.each(['Personal', 'Behaviour'] as const)('preserves %s business grants for owner, exact manager and SLT without widening runtime', category => {
    const c = context(); c.state.actors[3].roles = ['Employee', 'Manager'];
    const other: SafeBusinessRow = { ...row, key: `LOCAL-${category}`, category: category === 'Personal' ? 'LocalPersonal' : 'Behaviour', referenceKey: `LOCAL-${category}`,
      naturalKey: `${h.workplanKey}|${category === 'Personal' ? 'LocalPersonal' : 'Behaviour'}|LOCAL-${category}` };
    c.resources.push({ key: other.key, resource: category, workplanKey: h.workplanKey, personKey: h.personKey, year: 2027 });
    for (const reader of ['LOCAL-P10', 'LOCAL-P04', 'LOCAL-P01']) {
      const j = claim(plan(c, [...effects(), extra(reader, other.key)], [row, other]), c);
      expect(issueEffect(j, 'LOCAL-EXTRA-GRANT', claimed, c).effects.find(e => e.id === 'LOCAL-EXTRA-GRANT')?.disposition).toBe('Issued');
      expect(readPolicy({environment: 'TEST', year: 2027, actorKey: reader, targetKey: h.personKey, resource: category, expectedRevision: 1}, c.state, c.state)).toMatchObject({policy: 'Allowed', runtime: 'NotImplemented', leanCapability: 'Unimplemented'});
    }
  });
  it('preserves own status only; SLT/direct manager and disguised canonical/status resources rejected', () => {
    expect(plan().effects.find(e => e.kind === 'StatusGrant')?.reader).toBe(h.personKey);
    for (const reader of ['LOCAL-P04', 'LOCAL-P01']) { const all = effects(); all[5].reader = reader; expect(() => plan(context(), all)).toThrow(); }
    const all = effects(); all[5].key = row.key; expect(() => plan(context(), all)).toThrow();
    const c = context(); c.resources[1].resource = 'Status'; expect(() => plan(c)).toThrow();
  });
  it.each(['commandKey', 'correlation', 'subjectKey', 'actorKey'] as const)('binds planning and issuance to exact %s', field => {
    const c = context(), forged = { ...c, [field]: 'FORGED' };
    expect(() => plan(forged)).toThrow(); const j = claim(plan(c), c);
    expect(() => issueEffect(j, 'LOCAL-Grant', claimed, forged)).toThrow(); expect(j.effects[2].disposition).toBe('Planned');
  });
  it.each(['staleExpected', 'newRevision', 'sameRevisionDifferentRoles', 'sameRevisionDifferentManager', 'Held', 'Changing', 'wrongEnvironment', 'wrongYear'])('blocks %s current context before any effect', variant => {
    const c = context(), j = claim(plan(c), c), next = clone(c);
    if (variant === 'staleExpected') next.expectedRevision = 0;
    if (variant === 'newRevision') { next.state.revision = 2; next.expectedRevision = 2; }
    if (variant === 'sameRevisionDifferentRoles') next.state.actors[0].roles = ['Employee'];
    if (variant === 'sameRevisionDifferentManager') next.state.actors[9].managerPersonKey = 'LOCAL-P03';
    if (variant === 'Held' || variant === 'Changing') next.state.phase = variant;
    if (variant === 'wrongEnvironment') (next.state as unknown as {environment: string}).environment = 'LIVE';
    if (variant === 'wrongYear') (next.state as unknown as {year: number}).year = 2026;
    expect(() => issueEffect(j, 'LOCAL-Grant', claimed, next)).toThrow(); expect(j.effects[2].disposition).toBe('Planned');
  });
  it.each(['missing', 'extra', 'duplicate', 'otherSubject', 'otherYear', 'otherKind'])('rejects %s trusted resource observation without using desiredImage as authority', variant => {
    const c = context();
    if (variant === 'missing') c.resources.splice(1, 1);
    if (variant === 'extra') c.resources.push({ ...c.resources[1], key: 'OTHER-RESOURCE' });
    if (variant === 'duplicate') c.resources[1] = { ...c.resources[0] };
    if (variant === 'otherSubject') c.resources[1].personKey = 'LOCAL-P09';
    if (variant === 'otherYear') (c.resources[1] as unknown as {year: number}).year = 2026;
    if (variant === 'otherKind') c.resources[1].resource = 'Personal';
    expect(() => plan(c)).toThrow();
  });
  it('does not accept omitted context, client allow-lists, private resource classes or unknown roles', () => {
    expect(() => planJournal(command, h, correlation, effects(), [row], undefined as unknown as TrustedGrantContext)).toThrow();
    const c = context(); expect(() => plan({ ...c, allowedPairs: [{ key: row.key, reader: 'LOCAL-P09' }] } as TrustedGrantContext)).toThrow();
    (c.state.actors[0].roles as string[]).push('Owners'); expect(() => plan(c)).toThrow();
    const privateContext = context(); (privateContext.resources[1] as unknown as {resource: string}).resource = 'Audit'; expect(() => plan(privateContext)).toThrow();
  });
  it('inactive, missing and ambiguous readers fail before grant issue', () => {
    for (const variant of ['inactive', 'missing', 'ambiguous']) {
      const c = context();
      if (variant === 'inactive') c.state.actors[0].active = false;
      if (variant === 'missing') c.state.actors.shift();
      if (variant === 'ambiguous') c.state.actors.push({ ...c.state.actors[0] });
      expect(() => plan(c, [...effects(), extra('LOCAL-P01')])).toThrow();
    }
  });
  it('revalidates forged post-plan reader/resource and rejects even authorised grants added after journalling', () => {
    const c = context(); const original = claim(plan(c), c);
    for (const additional of [extra('LOCAL-P09'), extra(h.personKey, 'OTHER-RESOURCE'), extra('LOCAL-P01')]) {
      const j = clone(original); j.effects.push({ ...additional, disposition: 'Planned', response: null });
      expect(() => issueEffect(j, additional.id, claimed, c)).toThrow(); expect(j.effects[j.effects.length - 1].disposition).toBe('Planned');
    }
    const duplicate = clone(original); duplicate.effects[2].id = duplicate.effects[1].id;
    expect(() => issueEffect(duplicate, duplicate.effects[2].id, claimed, c)).toThrow();
  });
  it('planned trusted context is copied and unknown grants remain Held even with fresh matching authority', () => {
    const c = context(), j = claim(plan(c), c); c.state.actors[0].roles = ['Employee'];
    expect(j.grantAuthorisation.state.actors[0].roles).toContain('SLT');
    const current = context(); const issued = issueEffect(j, 'LOCAL-Grant', claimed, current); const held = settleEffect(issued, 'LOCAL-Grant', 'Unknown', null);
    expect(held.phase).toBe('Held'); expect(() => issueEffect(held, 'LOCAL-Finalise', claimed, current)).toThrow();
    expect(() => planJournal('LOCAL-NEXT', h, 'LOCAL-NEXT', effects(), [row], { ...current, commandKey: 'LOCAL-NEXT', correlation: 'LOCAL-NEXT' }, held)).toThrow();
  });
});
