/** Local processor boundary only. None of these trusted inputs may originate in a client payload.
 * No I/O, issuance, persistence or route registration. Full native column emission is a later tranche. */
import type { IEmployeeCoreContributionInputV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { AuthorisationState, EffectIntent, LocalJournal, ModelHeader, SafeBusinessRow, StableSnapshot,
  TestBinding, TestProfile, TrustedCommandSource, TrustedGrantContext } from '../models/TestPilotContracts';
import { TEST_ADMISSION_POLICY_V2, TEST_COMMAND_WIRE_V2, TestCommandWireV2 } from '../models/TestPilotCommandWire';
import { bindingReady, saveReady, safeRejectedStatus, stableRead, intendedCoreSet, planJournal, planCreateJournal } from './TestRuntimeBindings';
import { exactTestObject, exactOpaqueTag, parseTestToken, rejectTestWire, validateTestWire } from './TestPilotCommandWire';

export interface TrustedWireSource {
  identity: TrustedCommandSource;
  authorEmail: string; editorEmail: string; createdAt: string; modifiedAt: string;
  outer: Record<string, unknown>; // complete captured outer row, including opaque PayloadJSON
}
/** Complete physical-before business data retained beside C1's deliberately smaller row model. */
export interface TrustedRowImage {
  row: SafeBusinessRow; id: number; etag: string; fullImage: Record<string, unknown>;
}
export interface TrustedAdmissionInputs {
  binding: TestBinding; trustedBinding: TestBinding; profile: TestProfile; state: AuthorisationState; revision: number;
  header: ModelHeader; matchingHeaderCount: number; snapshot: StableSnapshot | null;
  rows: TrustedRowImage[]; referenceKeys: string[];
  /** Trusted processor planner supplies C1 intent and resources, never client claims or fabricated responses. */
  intents: EffectIntent[]; intendedRows: SafeBusinessRow[]; grants: TrustedGrantContext;
  predecessor?: { journal: LocalJournal; terminalSnapshot: StableSnapshot };
}
export interface BoundJournalV2 {
  wireVersion: typeof TEST_COMMAND_WIRE_V2; admissionPolicyVersion: typeof TEST_ADMISSION_POLICY_V2;
  sourceTuple: TrustedWireSource; rawPayload: string; admittedTokenText: string;
  admittedExpected: TestCommandWireV2['expected']; admittedWire: TestCommandWireV2;
  fullIntent: { beforeRows: TrustedRowImage[]; coreProjection: IEmployeeCoreContributionInputV2 | null;
    effects: { intent: EffectIntent; fullBeforeImage: unknown; fullDesiredImage: unknown }[] };
  c1Journal: LocalJournal;
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
function requireTrue(ok: unknown): asserts ok { if (!ok) rejectTestWire(); }
function sourceCheck(first: TrustedWireSource, second: TrustedWireSource, t: TrustedAdmissionInputs): void {
  const s = first.identity, o = first.outer;
  requireTrue(same(first, second) && bindingReady(t.binding, t.trustedBinding) && s.listId === t.binding.commandListId
    && safeRejectedStatus(s, first.createdAt) && s.version === '1.0' && first.createdAt === first.modifiedAt
    && Number.isFinite(Date.parse(first.createdAt)) && first.authorEmail === s.actorEmail && first.editorEmail === s.actorEmail
    && saveReady(t.profile, t.state, s.actorKey, t.revision) && t.profile.Email === s.actorEmail
    && typeof o.PayloadJSON === 'string' && o.ExpectedRowVersionToken == null && o.Quarter == null
    && o.ClientCorrelationKey === s.commandKey && s.correlationKey === s.commandKey);
  for (const [outer, inner] of [['CommandKey', 'commandKey'], ['CommandType', 'commandType'], ['SubjectType', 'subjectType'],
    ['SubjectKey', 'subjectKey'], ['PersonKey', 'actorKey'], ['PerformanceYear', 'year']] as const) requireTrue(o[outer] === s[inner]);
}
function bind(w: TestCommandWireV2, source: TrustedWireSource, t: TrustedAdmissionInputs): BoundJournalV2 {
  const b = w.binding, s = source.identity, h = w.expected.header, token = parseTestToken(h.token, b.commandType === 'CreateWorkplanDraft');
  requireTrue(b.commandKey === s.commandKey && b.commandType === s.commandType && b.personKey === s.actorKey
    && b.subjectType === s.subjectType && b.subjectKey === s.subjectKey && b.performanceYear === s.year && b.workplanKey === s.workplanKey
    && t.header.workplanKey === b.workplanKey && t.header.personKey === b.personKey && t.header.rowVersionToken === token
    && (source.outer.ExpectedETag ?? null) === h.etag);
  if (t.predecessor) {
    const p = t.predecessor;
    requireTrue(p.journal.phase === 'Terminal' && p.journal.commandKey !== b.commandKey && p.journal.subjectKey === b.workplanKey
      && p.journal.completionReference && p.journal.effects.every(e => e.disposition === 'Confirmed' && typeof e.response === 'string' && e.response.length > 0)
      && stableRead(p.terminalSnapshot, p.journal.intendedRows) && p.terminalSnapshot.after.rowVersionToken === p.journal.expectedToken + 2
      && p.terminalSnapshot.after.correlation === p.journal.correlation && same(p.terminalSnapshot.after, t.header));
  }
  requireTrue(t.grants.commandKey === b.commandKey && t.grants.actorKey === b.personKey && t.grants.subjectKey === b.workplanKey
    && t.grants.correlation === s.correlationKey && t.grants.expectedRevision === t.revision && same(t.grants.state, t.state));
  requireTrue(new Set(t.rows.map(r => r.row.key)).size === t.rows.length && new Set(t.rows.map(r => r.id)).size === t.rows.length);
  for (const row of t.rows) { requireTrue(Number.isSafeInteger(row.id) && row.id > 0); exactOpaqueTag(row.etag); requireTrue(same(row.fullImage.row, row.row)); }
  let core: IEmployeeCoreContributionInputV2 | null = null;
  if (b.commandType === 'CreateWorkplanDraft') {
    requireTrue(t.matchingHeaderCount === 0 && t.snapshot === null && t.rows.length === 0 && t.intendedRows.length === 0
      && t.intents.filter(e => e.kind === 'Canonical').length === 0);
  } else {
    core = w.payload as IEmployeeCoreContributionInputV2;
    requireTrue(t.matchingHeaderCount === 1 && t.snapshot && stableRead(t.snapshot, t.rows.map(r => r.row))
      && same(t.header, t.snapshot.after) && h.etag === t.header.etag && t.referenceKeys.includes(core.kpiId));
    const matching = t.rows.filter(r => r.row.naturalKey === `${b.workplanKey}|CoreGold|${core!.kpiId}`);
    const item = w.expected.item;
    requireTrue(item.presence === 'Absent' ? matching.length === 0 : item.presence === 'Present' && matching.length === 1 && matching[0].etag === item.etag);
    const next = t.intendedRows.find(r => r.key === b.subjectKey);
    requireTrue(next && next.category === 'CoreGold' && next.referenceKey === core.kpiId && next.active === core.activeInWorkplan);
    // Textual methods retain their supplied finite C1 summary; full method-specific targets are bound below.
    if (core.annualTargetValue !== undefined) requireTrue(next.target === core.annualTargetValue);
    requireTrue(same(intendedCoreSet(t.rows.map(r => r.row), next), t.intendedRows));
  }
  const claim = t.intents.filter(e => e.kind === 'Claim');
  requireTrue(claim.length === 1 && claim[0].key === b.workplanKey);
  if (b.commandType === 'CreateWorkplanDraft') requireTrue(claim[0].existingId === null && claim[0].beforeImage === null && claim[0].expectedETag === null);
  else requireTrue(claim[0].existingId === t.header.id && claim[0].expectedETag === t.header.etag && claim[0].beforeImage === JSON.stringify(t.header));
  const effects = t.intents.map(e => {
    if (e.kind !== 'Canonical') return { intent: copy(e), fullBeforeImage: e.beforeImage, fullDesiredImage: e.desiredImage };
    const before = t.rows.find(r => r.row.key === e.key), desired = t.intendedRows.find(r => r.key === e.key);
    requireTrue(desired && e.existingId === (before?.id ?? null) && e.expectedETag === (before?.etag ?? null)
      && e.beforeImage === (before ? JSON.stringify(before.row) : null) && e.desiredImage === JSON.stringify(desired));
    // Preserve every other full row field while Equal changes its C1 summary weight. Never truncate full Core input.
    return { intent: copy(e), fullBeforeImage: before ? copy(before.fullImage) : null,
      fullDesiredImage: { ...(before ? copy(before.fullImage) : {}), row: copy(desired),
        ...(e.key === b.subjectKey && core ? { contribution: copy(core) } : {}) } };
  });
  const journal = b.commandType === 'CreateWorkplanDraft'
    ? planCreateJournal(b.commandKey, t.header, s.correlationKey, t.intents, t.intendedRows, t.matchingHeaderCount, t.grants, t.predecessor?.journal)
    : planJournal(b.commandKey, t.header, s.correlationKey, t.intents, t.intendedRows, t.grants, t.predecessor?.journal);
  return freeze(copy({ wireVersion: TEST_COMMAND_WIRE_V2, admissionPolicyVersion: TEST_ADMISSION_POLICY_V2,
    sourceTuple: source, rawPayload: source.outer.PayloadJSON as string, admittedTokenText: h.token, admittedExpected: w.expected,
    admittedWire: w, fullIntent: { beforeRows: t.rows, coreProjection: core, effects }, c1Journal: journal }));
}
/** The sole raw-inner authority parse in this local implementation. Both source reads are processor inputs. */
export function admitTestCommandV2(first: TrustedWireSource, second: TrustedWireSource, trusted: TrustedAdmissionInputs): BoundJournalV2 {
  sourceCheck(first, second, trusted);
  return bind(validateTestWire(JSON.parse(first.outer.PayloadJSON as string)), first, trusted);
}
/** Reload the complete immutable PLANNED envelope. Mutable issuance/recovery belongs to later private storage.
 * expectedOriginal MUST be retained by the trusted processor, never copied from the reload itself.
 * Decode the wrapper, compare raw bytes opaquely, and validate its admitted projection without reparsing raw intent. */
export function reloadBoundJournalV2(serialized: string, expectedOriginal: BoundJournalV2,
  first: TrustedWireSource, second: TrustedWireSource, trusted: TrustedAdmissionInputs): BoundJournalV2 {
  sourceCheck(first, second, trusted);
  const value: unknown = JSON.parse(serialized);
  const o = exactTestObject(value, ['wireVersion', 'admissionPolicyVersion', 'sourceTuple', 'rawPayload', 'admittedTokenText',
    'admittedExpected', 'admittedWire', 'fullIntent', 'c1Journal']);
  requireTrue(o.wireVersion === TEST_COMMAND_WIRE_V2 && o.admissionPolicyVersion === TEST_ADMISSION_POLICY_V2
    && same(o, expectedOriginal) && same(o.sourceTuple, first) && o.rawPayload === first.outer.PayloadJSON);
  const recomposed = bind(validateTestWire(o.admittedWire), first, trusted);
  requireTrue(same(recomposed, expectedOriginal));
  return recomposed;
}
