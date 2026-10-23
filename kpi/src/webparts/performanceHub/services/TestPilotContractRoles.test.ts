import { readFileSync } from 'fs';
import { AuthorisationState, Resource, RoleJournal, RoleChangeRequest } from '../models/TestPilotContracts';
import { readPolicy, planRoleChange, issueRoleEffect, settleRoleEffect, confirmRoleChange, saveReady, directBusinessMutationAllowed } from './TestRuntimeBindings';
const load = <T>(name: string): T => JSON.parse(readFileSync(`data/test-pilot/${name}.json`, 'utf8')) as T;
const state = (): AuthorisationState => load('authorisation');
const k = (i: number): string => `LOCAL-P${String(i).padStart(2, '0')}`;
const low = (): AuthorisationState => { const s = state(); s.actors[1].roles = ['Employee', 'Manager']; return s; };
const decision = (s: AuthorisationState, a: number, t: number, resource: Resource = 'Core', after = s, revision = s.revision) =>
  readPolicy({ environment: 'TEST', year: 2027, actorKey: k(a), targetKey: k(t), resource, expectedRevision: revision }, s, after);
const allow = (s: AuthorisationState, a: number, t: number, resource: Resource = 'Core'): void => { expect(decision(s, a, t, resource).policy).toBe('Allowed'); };
const deny = (s: AuthorisationState, a: number, t: number, resource: Resource = 'Core'): void => { expect(decision(s, a, t, resource).policy).toBe('Denied'); };
const change = (s: AuthorisationState, target = 2, role: 'SLT' | 'AppAdmin' = 'SLT', grant = true, a = 4): RoleChangeRequest =>
  ({ actorKey: k(a), targetKey: k(target), role, grant, expectedRevision: s.revision, idempotencyKey: `LOCAL-ROLE-${s.revision}-${target}-${role}` });
const plan = (s: AuthorisationState, r = change(s), history: RoleJournal[] = []): RoleJournal => planRoleChange(r, s, history, k(4));
const finish = (journal: RoleJournal): RoleJournal => {
  let j = journal;
  for (const effect of j.effects) { j = issueRoleEffect(j, effect.id); j = settleRoleEffect(j, effect.id, 'Confirmed', `LOCAL-RESPONSE-${effect.id}`); }
  return confirmRoleChange(j, j.intended, true);
};
const categories: Resource[] = ['Core', 'Personal', 'Behaviour', 'Review', 'Progress', 'Evidence'];
describe('30 approved synthetic role scenario groups / no authenticated backend proof', () => {
  it('C1-ROLE-01 employee own all-category reads; other employee denied', () => { for (const c of categories) { allow(state(), 10, 10, c); deny(state(), 10, 11, c); } });
  it('C1-ROLE-02 exact direct manager Core read', () => allow(state(), 13, 21));
  it('C1-ROLE-03 exact direct manager Personal read', () => allow(state(), 13, 21, 'Personal'));
  it('C1-ROLE-04 exact direct manager Behaviour read', () => allow(state(), 13, 21, 'Behaviour'));
  it('C1-ROLE-05 direct manager review/progress/evidence read', () => { for (const c of categories.slice(3)) allow(state(), 13, 21, c); });
  it('C1-ROLE-06 sibling under same manager is not a direct report', () => deny(state(), 13, 10));
  it('C1-ROLE-07 actor13 reads its four direct reports', () => { for (const t of [21, 22, 23, 24]) allow(state(), 13, t); });
  it('C1-ROLE-08 actor18 manages two without SLT', () => { allow(state(), 18, 19); allow(state(), 18, 20); deny(state(), 18, 10); });
  it('C1-ROLE-09 low actor02 reads actor18 but no grand-report expansion', () => { allow(low(), 2, 18); deny(low(), 2, 19); deny(low(), 2, 20); });
  it('C1-ROLE-10 four explicit SLT memberships read every active business subject', () => { for (const a of [1, 2, 3, 4]) for (let t = 1; t <= 24; t++) for (const c of categories) allow(state(), a, t, c); });
  it('C1-ROLE-11 hierarchy position grants no SLT', () => deny(state(), 5, 10));
  it('C1-ROLE-12 SLT read never enables unrelated approvals or canonical writes', () => { allow(state(), 1, 20); expect(directBusinessMutationAllowed()).toBe(false); });
  it('C1-ROLE-13 AppAdmin alone has no all-staff read', () => { const s = state(); s.actors[4].roles.push('AppAdmin'); deny(s, 5, 10); allow(s, 5, 5); });
  it('C1-ROLE-14 actor04 holds independent AppAdmin and SLT capabilities', () => { allow(state(), 4, 20); expect(plan(low()).before.actors[3].roles).toEqual(['Employee', 'Manager', 'SLT', 'AppAdmin']); });
  it('C1-ROLE-15 future AppAdmin assignment adds no SLT/site rights', () => {
    const s = state(), j = finish(plan(s, change(s, 5, 'AppAdmin')));
    expect(j.intended.actors[4].roles).toEqual(['Employee', 'AppAdmin']); deny(j.intended, 5, 10);
    expect(planRoleChange(change(j.intended, 2, 'SLT', true, 5), j.intended, [j], k(4)).request.actorKey).toBe(k(5));
  });
  it('C1-ROLE-16 ordinary actor cannot self-promote or supply client roles', () => {
    expect(() => plan(state(), change(state(), 10, 'SLT', true, 10))).toThrow();
    expect(() => planRoleChange({ ...change(state()), roles: ['AppAdmin'] }, state(), [], k(4))).toThrow();
  });
  it('C1-ROLE-17 SLT-only actor cannot assign AppAdmin', () => expect(() => plan(state(), change(state(), 5, 'AppAdmin', true, 1))).toThrow());
  it('C1-ROLE-18 inactive actor denied even with SLT and AppAdmin', () => { const s = state(); s.actors[3].active = false; deny(s, 4, 10); expect(() => plan(s)).toThrow(); });
  it('C1-ROLE-19 missing or ambiguous person/email mapping denied', () => {
    const s = state(); s.actors.push({ ...s.actors[3] }); deny(s, 4, 10); deny(state(), 99, 10);
    const e = state(); e.actors[4].email = e.actors[3].email; deny(e, 4, 10);
  });
  it('C1-ROLE-20 inactive target denied for SLT and role administration', () => { const s = state(); s.actors[9].active = false; deny(s, 4, 10); expect(() => plan(s, change(s, 10))).toThrow(); });
  it('C1-ROLE-21 promotion is unavailable until all model effects and fresh route checks confirm', () => {
    const j = plan(low()); deny(j.intended, 2, 20); expect(() => confirmRoleChange(j, j.intended, true)).toThrow();
    const done = finish(j); expect(done.intended.revision).toBe(2); allow(done.intended, 2, 20);
  });
  it('C1-ROLE-22 demotion removes SLT increment and retains own/direct rights', () => {
    const promoted = finish(plan(low())); const demoted = finish(plan(promoted.intended, change(promoted.intended, 2, 'SLT', false), [promoted]));
    expect(demoted.intended.revision).toBe(3); allow(demoted.intended, 2, 2); allow(demoted.intended, 2, 18); deny(demoted.intended, 2, 20); deny(demoted.intended, 2, 10);
    expect(demoted.intended.actors[3].roles).toContain('AppAdmin');
  });
  it('C1-ROLE-23 stale cached decisions and in-flight revision changes are discarded', () => {
    const s = low(), done = finish(plan(s)); expect(decision(s, 2, 18, 'Core', done.intended).policy).toBe('Denied');
    expect(decision(done.intended, 2, 20, 'Core', done.intended, 1).policy).toBe('Denied');
  });
  it('C1-ROLE-24 alternate route cannot forge policy; actual backend ACL NOT_EXECUTED', () => {
    const s = low(), r = { environment: 'TEST', year: 2027, actorKey: k(2), targetKey: k(20), resource: 'Core', expectedRevision: 1 };
    expect(readPolicy(r, s, s).policy).toBe('Denied'); expect(readPolicy({ ...r, managerPersonKey: k(2), route: 'REST' }, s, s).policy).toBe('Denied');
  });
  it('C1-ROLE-25 unknown revoke and delayed old grant stay held with no successor', () => {
    for (const grant of [true, false]) {
      const s = grant ? low() : state(); let j = plan(s, change(s, 2, 'SLT', grant));
      for (const effect of j.effects.slice(0, 2)) { j = issueRoleEffect(j, effect.id); j = settleRoleEffect(j, effect.id, 'Confirmed', 'LOCAL-OBSERVATION'); }
      const id = j.effects[2].id; j = settleRoleEffect(issueRoleEffect(j, id), id, 'Unknown', null);
      expect(j.phase).toBe('Held'); deny(j.intended, 2, 18); expect(() => settleRoleEffect(j, id, 'Confirmed', 'LOCAL-LATE')).toThrow();
      expect(() => plan(s, change(s), [j])).toThrow(); expect(() => confirmRoleChange(j, j.intended, true)).toThrow();
    }
  });
  it('C1-ROLE-26 actor-only profile/status and private resources deny cross-subject SLT/Admin', () => {
    for (const c of ['Profile', 'Status'] as Resource[]) { allow(state(), 10, 10, c); deny(state(), 4, 10, c); }
    for (const c of ['People', 'Membership', 'Audit', 'Journal', 'Connection', 'Secret'] as Resource[]) { deny(state(), 4, 10, c); deny(state(), 4, 4, c); }
  });
  it('C1-ROLE-27 stale role changes and idempotency conflicts have no effects', () => {
    const s = low(), j = finish(plan(s)); expect(() => plan(s, { ...change(s), expectedRevision: 0 })).toThrow();
    expect(() => plan(j.intended, { ...change(j.intended, 5), idempotencyKey: j.request.idempotencyKey }, [j])).toThrow();
  });
  it('C1-ROLE-28 root has no invented manager: Save blocked, legitimate SLT read retained', () => {
    const profiles = load<unknown[]>('profiles'); expect(state().actors[0].managerPersonKey).toBeNull();
    expect(saveReady(profiles[0], state(), k(1), 1)).toBe(false); allow(state(), 1, 10);
  });
  it('C1-ROLE-29 Personal policy Allowed stays distinct from Unimplemented capability', () => expect(decision(state(), 4, 10, 'Personal')).toEqual({ policy: 'Allowed', leanCapability: 'Unimplemented', runtime: 'NotImplemented' }));
  it('C1-ROLE-30 future admin has no arbitrary amendments/Owners/processor privilege', () => {
    const j = finish(plan(state(), change(state(), 5, 'AppAdmin')));
    expect(j.intended.actors[4].roles).toEqual(['Employee', 'AppAdmin']); expect(directBusinessMutationAllowed()).toBe(false);
    expect(() => planRoleChange({ ...change(j.intended), role: 'Owners' }, j.intended, [], k(4))).toThrow();
    expect(() => plan(state(), change(state(), 4, 'AppAdmin', false))).toThrow();
  });
});
