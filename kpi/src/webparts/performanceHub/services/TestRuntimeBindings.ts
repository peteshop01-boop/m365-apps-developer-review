/** LOCAL C1 executable specification only. No HTTP, browser, SharePoint or runtime entry imports. */
import {
  TEST_SCHEMA_VERSION, TEST_YEAR, TestProfile, TestBinding, TestCommand, TestStatus, StatusEvent, StatusOutcome,
  TrustedCommandSource, AuthorisationState, TrustedActor, Resource, ReadDecision, ReadRequest,
  SafeBusinessRow, StableSnapshot, ModelHeader, EffectIntent, JournalEffect, LocalJournal, RoleChangeRequest, RoleJournal,
  TrustedGrantContext, TrustedGrantResource, JournalGrantDecision
} from '../models/TestPilotContracts';

const fail = (): never => { throw new Error('Local TEST contract rejected.'); };
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 1024 && v === v.trim()
  && !v.split('').some(character => { const code = character.charCodeAt(0); return code <= 31 || code === 127; });
export const workplanKey = (personKey: string): string => { if (!text(personKey) || /[|:]/.test(personKey)) return fail(); return `${personKey}|2027`; };
const integer = (v: unknown, min = 1): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min;
const email = (v: unknown): v is string => text(v) && v === v.toLowerCase() && /^[^\s@:]+@[^\s@:]+\.[^\s@:]+$/.test(v);
const etag = (v: unknown): v is string => text(v) && v !== '*';
const guid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const exact = (v: unknown, required: string[], optional: string[] = []): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail();
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some(k => !required.includes(k) && !optional.includes(k)) || required.some(k => !Object.prototype.hasOwnProperty.call(o, k))) return fail();
  return o;
};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export const LEAN_COMMANDS: readonly TestCommand[] = ['CreateWorkplanDraft', 'UpsertCoreContributionV2'];
export const LEAN_DEFAULTS = { year: TEST_YEAR, core: 70, personal: 20, behaviours: 10, coreWeighting: 'Equal', overrides: false } as const;
export const commandAllowed = (v: unknown): v is TestCommand => LEAN_COMMANDS.includes(v as TestCommand);

export function parseProfile(value: unknown): TestProfile {
  const p = exact(value, ['Title', 'ProfileKey', 'PersonKey', 'Email', 'Active', 'PerformanceYear', 'ManagerMappingValid', 'MappingRevision', 'SchemaVersion'], ['ManagerPersonKey', 'ManagerDisplayName', 'ManagerEmail']);
  if (!text(p.Title) || !text(p.PersonKey) || !email(p.Email) || p.ProfileKey !== `${p.Email}:2027`
    || typeof p.Active !== 'boolean' || p.PerformanceYear !== TEST_YEAR || typeof p.ManagerMappingValid !== 'boolean'
    || !integer(p.MappingRevision) || p.SchemaVersion !== TEST_SCHEMA_VERSION) return fail();
  if (p.ManagerPersonKey !== undefined && (!text(p.ManagerPersonKey) || p.ManagerPersonKey === p.PersonKey)) return fail();
  if (p.ManagerDisplayName !== undefined && !text(p.ManagerDisplayName)) return fail();
  if (p.ManagerEmail !== undefined && (!email(p.ManagerEmail) || p.ManagerEmail === p.Email)) return fail();
  if (p.ManagerMappingValid && (!text(p.ManagerPersonKey) || !text(p.ManagerDisplayName) || !email(p.ManagerEmail))) return fail();
  return clone(p) as unknown as TestProfile;
}
export function parseBinding(value: unknown): TestBinding {
  const b = exact(value, ['environment', 'performanceYear', 'schemaVersion', 'profileListId', 'statusListId', 'commandListId', 'workplansListId', 'workplanItemsListId']);
  if (b.environment !== 'TEST' || b.performanceYear !== TEST_YEAR || b.schemaVersion !== TEST_SCHEMA_VERSION) return fail();
  const ids = ['profileListId', 'statusListId', 'commandListId', 'workplansListId', 'workplanItemsListId'].map(k => b[k]);
  if (ids.some(v => v !== null && !guid(v)) || new Set(ids.filter(v => v !== null)).size !== ids.filter(v => v !== null).length) return fail();
  return clone(b) as unknown as TestBinding;
}
export function bindingReady(candidate: unknown, trusted: unknown): boolean {
  try { const c = parseBinding(candidate), t = parseBinding(trusted); return same(c, t) && Object.values(c).every(v => v !== null); } catch { return false; }
}
/** Both source observations must come from the future trusted boundary; client copies prove nothing. */
export function validateCommandEnvelope(value: unknown, first: TrustedCommandSource, second: TrustedCommandSource,
  binding: TestBinding, trustedBinding: TestBinding, profile: TestProfile, state: AuthorisationState,
  expectedRevision: number, header: ModelHeader | null, referenceKeys: string[]): boolean {
  try {
    const c = exact(value, ['commandKey', 'commandType', 'personKey', 'performanceYear', 'workplanKey', 'expectedToken', 'expectedETag', 'payload']);
    if (!bindingReady(binding, trustedBinding) || !validSource(first) || !same(first, second) || first.listId !== binding.commandListId
      || c.commandKey !== first.commandKey || c.commandType !== first.commandType || c.personKey !== first.actorKey
      || c.performanceYear !== TEST_YEAR || c.workplanKey !== workplanKey(first.actorKey)
      || !saveReady(profile, state, first.actorKey, expectedRevision) || profile.Email !== first.actorEmail) return false;
    if (first.commandType === 'CreateWorkplanDraft') {
      const p = exact(c.payload, []);
      return Object.keys(p).length === 0 && header === null && c.expectedToken === 0 && c.expectedETag === null;
    }
    const p = exact(c.payload, ['referenceKey', 'activeInWorkplan', 'target']);
    return !!(header && headerValid(header) && header.personKey === first.actorKey && header.transition === 'Ready' && header.access === 'EmployeeEdit'
      && c.expectedToken === header.rowVersionToken && c.expectedETag === header.etag && etag(c.expectedETag)
      && text(p.referenceKey) && referenceKeys.includes(p.referenceKey) && typeof p.activeInWorkplan === 'boolean'
      && typeof p.target === 'number' && Number.isFinite(p.target));
  } catch { return false; }
}
function actor(state: AuthorisationState, key: string): TrustedActor | undefined {
  const found = state.actors.filter(a => a.personKey === key);
  const a = found[0];
  return found.length === 1 && a.active && email(a.email) && state.actors.filter(x => x.email === a.email).length === 1 ? a : undefined;
}
function current(state: AuthorisationState, revision: number): boolean {
  return state.environment === 'TEST' && state.year === TEST_YEAR && state.phase === 'Active' && integer(state.revision) && state.revision === revision;
}
export function saveReady(profile: unknown, state: AuthorisationState, authenticatedKey: string, revision: number): boolean {
  try {
    const p = parseProfile(profile), a = actor(state, authenticatedKey), manager = p.ManagerPersonKey && actor(state, p.ManagerPersonKey);
    return !!(current(state, revision) && p.Active && p.ManagerMappingValid && a && a.roles.includes('Employee') && p.PersonKey === a.personKey && p.Email === a.email
      && manager && manager.roles.includes('Manager') && a.managerPersonKey === manager.personKey && p.ManagerEmail === manager.email);
  } catch { return false; }
}
const resources: readonly Resource[] = ['Core', 'Personal', 'Behaviour', 'Review', 'Progress', 'Evidence', 'Profile', 'Status', 'People', 'Membership', 'Audit', 'Journal', 'Connection', 'Secret'];
const business: readonly Resource[] = ['Core', 'Personal', 'Behaviour', 'Review', 'Progress', 'Evidence'];
export function readPolicy(value: unknown, before: AuthorisationState, after: AuthorisationState): ReadDecision {
  const denied: ReadDecision = { policy: 'Denied', leanCapability: 'Unimplemented', runtime: 'NotImplemented' };
  try {
    const r = exact(value, ['environment', 'year', 'actorKey', 'targetKey', 'resource', 'expectedRevision']) as unknown as ReadRequest;
    if (r.environment !== 'TEST' || r.year !== TEST_YEAR || !resources.includes(r.resource) || !text(r.actorKey) || !text(r.targetKey)
      || !current(before, r.expectedRevision) || !current(after, r.expectedRevision) || !same(before, after)) return denied;
    const a = actor(after, r.actorKey), target = actor(after, r.targetKey);
    if (!a || !target) return denied;
    let allowed = false;
    if (r.resource === 'Profile' || r.resource === 'Status') allowed = a.personKey === target.personKey && a.roles.includes('Employee');
    if (business.includes(r.resource)) allowed = (a.personKey === target.personKey && a.roles.includes('Employee'))
      || (a.roles.includes('Manager') && target.managerPersonKey === a.personKey) || a.roles.includes('SLT');
    return { policy: allowed ? 'Allowed' : 'Denied', leanCapability: allowed && ['Core', 'Profile', 'Status'].includes(r.resource) ? 'Included' : 'Unimplemented', runtime: 'NotImplemented' };
  } catch { return denied; }
}
/** All direct canonical/business mutations remain disabled. Two command envelopes are a later processor route. */
export const directBusinessMutationAllowed = (): false => false;

export const SAFE_MESSAGES: Record<StatusEvent, string> = { SAVED: 'Saved.', REJECTED: 'The request was rejected.', DUPLICATE: 'This request was already received.', FAILED: 'The request could not be completed.', HELD: 'The request is held for review.' };
const outcomes: Record<StatusEvent, StatusOutcome> = { SAVED: 'Accepted', REJECTED: 'Rejected', DUPLICATE: 'Duplicate', FAILED: 'Failed', HELD: 'RecoveryHold' };
const statusKey = (s: TrustedCommandSource, event: StatusEvent): string => `${s.listId}:${s.itemId}:${encodeURIComponent(s.version)}:${event}`;
function validSource(s: TrustedCommandSource): boolean {
  return guid(s.listId) && integer(s.itemId) && text(s.version) && etag(s.etag) && text(s.commandKey) && commandAllowed(s.commandType)
    && text(s.actorKey) && email(s.actorEmail) && s.year === TEST_YEAR && text(s.correlationKey)
    && s.subjectType === (s.commandType === 'CreateWorkplanDraft' ? 'Workplan' : 'WorkplanItem')
    && Array.isArray(s.resultKeys) && s.resultKeys.every(text) && new Set(s.resultKeys).size === s.resultKeys.length;
}
export function safeRejectedStatus(source: TrustedCommandSource | undefined, at: string): TestStatus | undefined {
  if (!source || !validSource(source)) return undefined;
  return { Title: 'Command status', StatusKey: statusKey(source, 'REJECTED'), PersonKey: source.actorKey, CommandKey: source.commandKey,
    CommandType: source.commandType, SourceListId: source.listId, SourceItemId: source.itemId, SourceItemVersion: source.version, SourceItemETag: source.etag,
    ActorEmail: source.actorEmail, ActorPersonKey: source.actorKey, EffectiveRole: 'Employee', SubjectType: source.subjectType, PerformanceYear: TEST_YEAR,
    Outcome: 'Rejected', EventCode: 'REJECTED', SafeMessage: SAFE_MESSAGES.REJECTED, EventAt: at, SchemaVersion: TEST_SCHEMA_VERSION, CorrelationKey: source.correlationKey };
}
export function verifyStatus(value: unknown, source: TrustedCommandSource, snapshot?: StableSnapshot, intended?: SafeBusinessRow[]): boolean {
  try {
    if (!validSource(source)) return false;
    const s = exact(value, ['Title', 'StatusKey', 'PersonKey', 'CommandKey', 'CommandType', 'SourceListId', 'SourceItemId', 'SourceItemVersion', 'SourceItemETag', 'ActorEmail', 'ActorPersonKey', 'EffectiveRole', 'SubjectType', 'PerformanceYear', 'Outcome', 'EventCode', 'SafeMessage', 'EventAt', 'SchemaVersion', 'CorrelationKey'], ['SubjectKey', 'WorkplanKey', 'WorkplanVersion', 'RowVersionToken', 'ResultKeysJSON']) as unknown as TestStatus;
    if (!Object.prototype.hasOwnProperty.call(SAFE_MESSAGES, s.EventCode) || s.Outcome !== outcomes[s.EventCode] || s.SafeMessage !== SAFE_MESSAGES[s.EventCode]
      || s.Title !== 'Command status' || s.SchemaVersion !== TEST_SCHEMA_VERSION || s.EffectiveRole !== 'Employee' || s.PerformanceYear !== TEST_YEAR
      || s.StatusKey !== statusKey(source, s.EventCode) || s.PersonKey !== source.actorKey || s.ActorPersonKey !== source.actorKey || s.ActorEmail !== source.actorEmail
      || s.CommandKey !== source.commandKey || s.CommandType !== source.commandType || s.SourceListId !== source.listId || s.SourceItemId !== source.itemId
      || s.SourceItemVersion !== source.version || s.SourceItemETag !== source.etag || s.SubjectType !== source.subjectType || s.CorrelationKey !== source.correlationKey
      || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(s.EventAt) || !Number.isFinite(Date.parse(s.EventAt))) return false;
    const resultFields = ['SubjectKey', 'WorkplanKey', 'WorkplanVersion', 'RowVersionToken', 'ResultKeysJSON'] as const;
    if (s.Outcome === 'Rejected') return resultFields.every(k => !Object.prototype.hasOwnProperty.call(s, k));
    if (s.SubjectKey !== undefined && s.SubjectKey !== source.subjectKey || s.WorkplanKey !== undefined && s.WorkplanKey !== source.workplanKey) return false;
    if (s.WorkplanVersion !== undefined && !integer(s.WorkplanVersion) || s.RowVersionToken !== undefined && !integer(s.RowVersionToken, 0)) return false;
    if (s.ResultKeysJSON !== undefined && !same(JSON.parse(s.ResultKeysJSON), source.resultKeys)) return false;
    if (s.Outcome !== 'Accepted') return true;
    return !!(source.subjectKey && source.workplanKey && resultFields.every(k => s[k] !== undefined) && snapshot && intended
      && stableRead(snapshot, intended) && snapshot.after.personKey === source.actorKey && snapshot.after.workplanKey === source.workplanKey
      // Identical saved values can belong to another command: both observations must prove this committed epoch.
      && snapshot.before.correlation === source.correlationKey && snapshot.after.correlation === source.correlationKey
      && s.SubjectKey === source.subjectKey && s.WorkplanVersion === snapshot.after.workplanVersion && s.RowVersionToken === snapshot.after.rowVersionToken
      && (source.subjectType === 'Workplan' ? source.subjectKey === source.workplanKey : intended.some(row => row.key === source.subjectKey && row.personKey === source.actorKey))
      && source.resultKeys.every(k => k === snapshot.after.workplanKey || intended.some(row => row.key === k)));
  } catch { return false; }
}

export const coreNaturalKey = (key: string, reference: string): string => `${key}|CoreGold|${reference}`;
export function parseBusinessRow(value: unknown): SafeBusinessRow {
  const r = exact(value, ['key', 'naturalKey', 'workplanKey', 'personKey', 'year', 'category', 'referenceKey', 'active', 'weight', 'target', 'BehaviourSelectedSuggestionKeysJ', 'BehaviourCustomObjective']) as unknown as SafeBusinessRow;
  if (![r.key, r.naturalKey, r.personKey, r.referenceKey].every(text) || r.year !== TEST_YEAR || r.workplanKey !== workplanKey(r.personKey)
    || !['CoreGold', 'LocalPersonal', 'Behaviour'].includes(r.category) || r.naturalKey !== `${r.workplanKey}|${r.category}|${r.referenceKey}`
    || typeof r.active !== 'boolean' || !Number.isFinite(r.weight) || r.weight < 0 || r.weight > 100 || !Number.isFinite(r.target)
    || typeof r.BehaviourCustomObjective !== 'string' || typeof r.BehaviourSelectedSuggestionKeysJ !== 'string') return fail();
  const selections: unknown = JSON.parse(r.BehaviourSelectedSuggestionKeysJ);
  if (!Array.isArray(selections) || selections.some(s => !text(s))) return fail();
  return clone(r);
}
function rowsValid(rows: SafeBusinessRow[], key: string, person: string): boolean {
  return rows.every(r => { parseBusinessRow(r); return r.workplanKey === key && r.personKey === person; })
    && new Set(rows.map(r => r.key)).size === rows.length && new Set(rows.map(r => r.naturalKey)).size === rows.length;
}
function sameRows(a: SafeBusinessRow[], b: SafeBusinessRow[]): boolean {
  const ordered = (rows: SafeBusinessRow[]): SafeBusinessRow[] => rows.slice().sort((x, y) => x.key.localeCompare(y.key));
  return same(ordered(a), ordered(b));
}
function headerValid(h: ModelHeader): boolean {
  return integer(h.id) && etag(h.etag) && h.year === TEST_YEAR && h.workplanKey === workplanKey(h.personKey) && h.workplanVersion === 1 && integer(h.rowVersionToken, 0);
}
export function stableRead(s: StableSnapshot, intended: SafeBusinessRow[]): boolean {
  try {
    const a = s.before, b = s.after, rows = s.pages.flat();
    return s.complete === true && headerValid(a) && headerValid(b) && a.transition === 'Ready' && b.transition === 'Ready'
      && a.access === 'EmployeeEdit' && b.access === 'EmployeeEdit' && same(a, b)
      && rowsValid(rows, a.workplanKey, a.personKey) && rowsValid(intended, a.workplanKey, a.personKey) && sameRows(rows, intended);
  } catch { return false; }
}
/** Keep all non-Core rows byte-for-byte; stable keys are updated/deactivated, never deleted. */
export function intendedCoreSet(before: SafeBusinessRow[], next: SafeBusinessRow): SafeBusinessRow[] {
  parseBusinessRow(next);
  if (next.category !== 'CoreGold' || !rowsValid(before, next.workplanKey, next.personKey)) return fail();
  const existing = before.find(r => r.naturalKey === next.naturalKey);
  if (existing && existing.key !== next.key || before.some(r => r.key === next.key && r.naturalKey !== next.naturalKey)) return fail();
  const rows = before.filter(r => r.key !== next.key).concat(clone(next));
  const count = rows.filter(r => r.category === 'CoreGold' && r.active).length;
  return rows.map(r => r.category === 'CoreGold' ? { ...r, weight: r.active && count ? 100 / count : 0 } : clone(r));
}
function intentValid(e: EffectIntent): boolean {
  return text(e.id) && text(e.key) && text(e.desiredImage) && (e.existingId === null ? e.expectedETag === null && e.beforeImage === null : integer(e.existingId) && etag(e.expectedETag) && text(e.beforeImage))
    && (['Grant', 'Revoke', 'StatusGrant'].includes(e.kind) ? text(e.reader) : e.reader === null);
}
/** Reconcile an independent resource observation to the epoch's canonical set, then derive each reader decision.
 * This pure model consumes a trusted boundary input. Neither desiredImage nor grantsConfirmed is authority. */
function validateGrantContext(value: TrustedGrantContext, commandKey: string, subjectKey: string, actorKey: string,
  correlation: string, intents: EffectIntent[], rows: SafeBusinessRow[]): TrustedGrantContext {
  const c = exact(value, ['commandKey', 'correlation', 'subjectKey', 'actorKey', 'expectedRevision', 'state', 'resources']) as unknown as TrustedGrantContext;
  if (c.commandKey !== commandKey || c.subjectKey !== subjectKey || c.actorKey !== actorKey || c.correlation !== correlation
    || !current(c.state, c.expectedRevision) || !actor(c.state, actorKey)?.roles.includes('Employee')) return fail();
  exact(c.state, ['environment', 'year', 'revision', 'phase', 'actors']);
  for (const a of c.state.actors) {
    exact(a, ['personKey', 'email', 'active', 'roles', 'managerPersonKey']);
    if (!text(a.personKey) || !email(a.email) || typeof a.active !== 'boolean' || !Array.isArray(a.roles)
      || a.roles.some(r => !['Employee', 'Manager', 'SLT', 'AppAdmin'].includes(r)) || new Set(a.roles).size !== a.roles.length
      || a.managerPersonKey !== null && (!text(a.managerPersonKey) || a.managerPersonKey === a.personKey)) return fail();
  }
  const status = intents.filter(e => e.kind === 'StatusCreate');
  if (status.length !== 1 || !Array.isArray(c.resources)) return fail();
  const resource = (key: string, kind: TrustedGrantResource['resource']): TrustedGrantResource =>
    ({ key, resource: kind, workplanKey: subjectKey, personKey: actorKey, year: TEST_YEAR });
  const expected: TrustedGrantResource[] = [resource(subjectKey, 'Core'), ...rows.map(r => resource(r.key,
    r.category === 'CoreGold' ? 'Core' : r.category === 'LocalPersonal' ? 'Personal' : 'Behaviour')), resource(status[0].key, 'Status')];
  if (new Set(expected.map(r => r.key)).size !== expected.length || c.resources.length !== expected.length) return fail();
  for (const r of c.resources) exact(r, ['key', 'resource', 'workplanKey', 'personKey', 'year']);
  if (new Set(c.resources.map(r => r.key)).size !== c.resources.length || expected.some(r => !c.resources.some(t =>
    t.key === r.key && t.resource === r.resource && t.workplanKey === r.workplanKey && t.personKey === r.personKey && t.year === r.year))) return fail();
  for (const e of intents.filter(e => e.kind === 'Grant' || e.kind === 'StatusGrant')) {
    const r = c.resources.find(r => r.key === e.key);
    if (!r || !e.reader || e.kind === 'StatusGrant' && (r.resource !== 'Status' || e.reader !== actorKey)
      || e.kind === 'Grant' && !business.includes(r.resource)) return fail();
    const decision = readPolicy({ environment: 'TEST', year: TEST_YEAR, actorKey: e.reader, targetKey: r.personKey,
      resource: r.resource, expectedRevision: c.expectedRevision }, c.state, c.state);
    if (decision.policy !== 'Allowed') return fail();
  }
  return clone(c);
}
const grantDecisions = (intents: EffectIntent[]): JournalGrantDecision[] => intents.filter(e => e.kind === 'Grant' || e.kind === 'StatusGrant')
  .map(e => ({ effectId: e.id, kind: e.kind as 'Grant' | 'StatusGrant', key: e.key, reader: e.reader! }));
export function planJournal(commandKey: string, header: ModelHeader, correlation: string, intents: EffectIntent[], intendedRows: SafeBusinessRow[], context: TrustedGrantContext, predecessor?: LocalJournal): LocalJournal {
  if (!headerValid(header) || header.transition !== 'Ready' || header.access !== 'EmployeeEdit' || !text(commandKey) || !text(correlation)
    || predecessor && (predecessor.phase !== 'Terminal' || predecessor.commandKey === commandKey) || !rowsValid(intendedRows, header.workplanKey, header.personKey)
    || !intents.length || !intents.every(intentValid) || new Set(intents.map(e => e.id)).size !== intents.length
    || intents.filter(e => e.kind === 'Claim').length !== 1 || intents.filter(e => e.kind === 'Finalise').length !== 1
    || intents.filter(e => e.kind === 'StatusCreate').length !== 1 || intents.filter(e => e.kind === 'StatusGrant').length !== 1
    || intents.some(e => !['Claim', 'Canonical', 'Grant', 'Finalise', 'StatusCreate', 'StatusGrant'].includes(e.kind))
    || intents.some(e => e.kind === 'StatusGrant' && e.reader !== header.personKey)
    || intents.filter(e => e.kind === 'Canonical').some(e => !intents.some(g => g.kind === 'Grant' && g.key === e.key && g.reader === header.personKey))
    || intendedRows.filter(r => r.category === 'CoreGold').some(r => !intents.some(e => e.kind === 'Canonical' && e.key === r.key && e.desiredImage === JSON.stringify(r)))
    || intents.filter(e => e.kind === 'Canonical').some(e => !intendedRows.some(r => r.category === 'CoreGold' && e.key === r.key && e.desiredImage === JSON.stringify(r)))) return fail();
  const grantAuthorisation = validateGrantContext(context, commandKey, header.workplanKey, header.personKey, correlation, intents, intendedRows);
  return { commandKey, subjectKey: header.workplanKey, actorKey: header.personKey, correlation, expectedToken: header.rowVersionToken, grantAuthorisation, grantDecisions: grantDecisions(intents),
    phase: 'Planned', effects: intents.map(e => ({ ...clone(e), disposition: 'Planned', response: null })), intendedRows: clone(intendedRows), completionReference: null };
}
/** Zero observed headers is mandatory. The proposed local header is not a persisted Ready row. */
export function planCreateJournal(commandKey: string, proposed: ModelHeader, correlation: string, intents: EffectIntent[], intendedRows: SafeBusinessRow[], matchingHeaderCount: number, context: TrustedGrantContext, predecessor?: LocalJournal): LocalJournal {
  if (matchingHeaderCount !== 0 || proposed.rowVersionToken !== 0 || intents.find(e => e.kind === 'Claim')?.existingId !== null) return fail();
  return planJournal(commandKey, proposed, correlation, intents, intendedRows, context, predecessor);
}
export function issueEffect(journal: LocalJournal, id: string, header: ModelHeader | null, context: TrustedGrantContext, stable?: StableSnapshot): LocalJournal {
  const j = clone(journal), e = j.effects.find(x => x.id === id);
  const currentContext = validateGrantContext(context, j.commandKey, j.subjectKey, j.actorKey, j.correlation, j.effects, j.intendedRows);
  // An unchanged revision alone is insufficient if a caller supplies different role/resource observations.
  if (!same(currentContext, j.grantAuthorisation) || !same(grantDecisions(j.effects), j.grantDecisions)
    || new Set(j.effects.map(effect => effect.id)).size !== j.effects.length) return fail();
  if (!e || e.disposition !== 'Planned' || j.phase === 'Held' || j.phase === 'Terminal' || j.effects.some(x => x.disposition === 'Unknown' || x.disposition === 'Issued')) return fail();
  const done = (kind: EffectIntent['kind']): boolean => j.effects.filter(x => x.kind === kind).every(x => x.disposition === 'Confirmed');
  if (e.kind === 'Claim') {
    if (j.phase !== 'Planned') return fail();
    if (e.existingId === null) { if (header !== null || j.expectedToken !== 0) return fail(); }
    else if (!header || !headerValid(header) || header.workplanKey !== j.subjectKey || header.transition !== 'Ready' || header.access !== 'EmployeeEdit'
      || header.rowVersionToken !== j.expectedToken || e.existingId !== header.id || e.expectedETag !== header.etag) return fail();
  } else if (['Canonical', 'Grant', 'Finalise'].includes(e.kind)) {
    if (!header || j.phase !== 'InProgress' || !done('Claim') || header.transition !== 'InProgress' || header.access !== 'EmployeeEdit' || header.correlation !== j.correlation
      || header.workplanKey !== j.subjectKey || header.rowVersionToken !== j.expectedToken + 1 || !etag(header.etag)) return fail();
    if (e.kind === 'Finalise' && (!done('Canonical') || !done('Grant') || !j.completionReference || e.expectedETag !== header.etag)) return fail();
  } else if (j.phase !== 'Ready' || !done('Finalise') || e.kind === 'StatusGrant' && !done('StatusCreate')
    || !stable || !stableRead(stable, j.intendedRows) || stable.after.workplanKey !== j.subjectKey || stable.after.correlation !== j.correlation
    || stable.after.rowVersionToken !== j.expectedToken + 2) return fail();
  e.disposition = 'Issued'; return j;
}
export function settleEffect(journal: LocalJournal, id: string, result: 'Confirmed' | 'Unknown', response: string | null): LocalJournal {
  const j = clone(journal), e = j.effects.find(x => x.id === id);
  if (!e || e.disposition !== 'Issued' || j.phase === 'Held' || result === 'Confirmed' && !text(response)) return fail();
  e.disposition = result; e.response = response;
  if (result === 'Unknown') { j.phase = 'Held'; return j; }
  if (e.kind === 'Claim') j.phase = 'InProgress';
  if (e.kind === 'Finalise') j.phase = 'Ready';
  // StatusGrant alone cannot mark Terminal; stable canonical proof is still required.
  return j;
}
export function completeCanonical(journal: LocalJournal, rows: SafeBusinessRow[], allPages: boolean, grantsConfirmed: boolean, reference: string): LocalJournal {
  const j = clone(journal);
  const activeCore = rows.filter(r => r.category === 'CoreGold' && r.active);
  if (j.phase !== 'InProgress' || !allPages || !grantsConfirmed || !text(reference) || !sameRows(rows, j.intendedRows)
    || activeCore.some(r => Math.abs(r.weight - 100 / activeCore.length) > 1e-9)
    || j.effects.filter(e => ['Claim', 'Canonical', 'Grant'].includes(e.kind)).some(e => e.disposition !== 'Confirmed')) return fail();
  j.completionReference = reference; return j;
}
export function reconcileTerminal(journal: LocalJournal, snapshot: StableSnapshot): LocalJournal {
  const j = clone(journal);
  if (j.phase !== 'Ready' || !j.completionReference || j.effects.some(e => e.disposition !== 'Confirmed') || !stableRead(snapshot, j.intendedRows)
    || snapshot.after.workplanKey !== j.subjectKey || snapshot.after.correlation !== j.correlation || snapshot.after.rowVersionToken !== j.expectedToken + 2) return fail();
  j.phase = 'Terminal'; return j;
}

export function planRoleChange(value: unknown, state: AuthorisationState, history: RoleJournal[], protectedAdminKey: string): RoleJournal {
  const r = exact(value, ['actorKey', 'targetKey', 'role', 'grant', 'expectedRevision', 'idempotencyKey']) as unknown as RoleChangeRequest;
  const a = actor(state, r.actorKey), target = actor(state, r.targetKey);
  if (!current(state, r.expectedRevision) || !a?.roles.includes('AppAdmin') || !target || !['SLT', 'AppAdmin'].includes(r.role)
    || typeof r.grant !== 'boolean' || !text(r.idempotencyKey) || target.personKey === protectedAdminKey && r.role === 'AppAdmin' && !r.grant
    || history.some(h => h.phase !== 'Confirmed') || history.some(h => h.request.idempotencyKey === r.idempotencyKey)) return fail();
  const intended = clone(state); intended.phase = 'Changing'; intended.revision++;
  const next = intended.actors.find(x => x.personKey === target.personKey)!;
  next.roles = r.grant ? Array.from(new Set([...next.roles, r.role])) : next.roles.filter(role => role !== r.role);
  const kinds: EffectIntent['kind'][] = ['RoleMap', 'CacheInvalidate', r.grant ? 'Grant' : 'Revoke'];
  const effects: JournalEffect[] = kinds.map((kind, index) => ({ id: `${r.idempotencyKey}:${index}:${kind}`, kind, key: target.personKey,
    existingId: null, expectedETag: null, beforeImage: JSON.stringify(target.roles), desiredImage: JSON.stringify(next.roles),
    reader: kind === 'Grant' || kind === 'Revoke' ? target.personKey : null, disposition: 'Planned', response: null }));
  return { request: clone(r), before: clone(state), intended, effects, phase: 'Changing' };
}
export function issueRoleEffect(journal: RoleJournal, id: string): RoleJournal {
  const j = clone(journal), index = j.effects.findIndex(x => x.id === id), e = j.effects[index];
  if (j.phase !== 'Changing' || !e || e.disposition !== 'Planned' || j.effects.slice(0, index).some(x => x.disposition !== 'Confirmed')
    || j.effects.some(x => x.disposition === 'Unknown' || x.disposition === 'Issued')) return fail();
  e.disposition = 'Issued'; return j;
}
export function settleRoleEffect(journal: RoleJournal, id: string, result: 'Confirmed' | 'Unknown', reference: string | null): RoleJournal {
  const j = clone(journal), e = j.effects.find(x => x.id === id);
  if (j.phase !== 'Changing' || !e || e.disposition !== 'Issued' || result === 'Confirmed' && !text(reference)) return fail();
  e.disposition = result; e.response = reference;
  if (result === 'Unknown') { j.phase = 'Held'; j.intended.phase = 'Held'; }
  return j;
}
/** Proof input is a LOCAL fixture observation, never authenticated backend evidence. */
export function confirmRoleChange(journal: RoleJournal, observed: AuthorisationState, allowedAndDeniedRoutesChecked: boolean): RoleJournal {
  const j = clone(journal);
  if (j.phase !== 'Changing' || !allowedAndDeniedRoutesChecked || j.effects.some(e => e.disposition !== 'Confirmed') || !same(j.intended, observed)) return fail();
  j.phase = 'Confirmed'; j.intended.phase = 'Active'; return j;
}
