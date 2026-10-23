import type { Native, ReviewResultV1, ReviewJournalObservationV1, ReviewAuthorityV1, ManagerCommandObservationV1,
  ReviewReceiptV1, CaptureReferenceV1, OrdinalSourceV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { RequestChangesPorts, RequestChangesJournalV2, RequestChangesCommandV1, RequestChangesControlPatch,
  RequestChangesEffectKindV2, RequestChangesAudit } from '../models/OptionEWorkplanRequestChangesV2Models';
import { createOptionEWorkplanReviewAuditSourceReadback, type ReviewAuditReadPorts, type ReviewAuditReadContext } from './OptionEWorkplanReviewAuditSourceReadback';
import { createOptionEWorkplanRequestChangesFinalSourceReadback, qualifyOptionEWorkplanRequestChangesOwnedReady,
  confirmOptionEWorkplanRequestChangesOwnedAcl } from './OptionEWorkplanReviewSourceReadback';
import { parseRequestChangesJournalV2, encodeRequestChangesJournalV2 } from './OptionEWorkplanRequestChangesJournalV2Wire';
import { parseReviewCommandV1, parseReviewReceiptV1, encodeReviewReceiptV1, canonicalReviewV1 } from './OptionEWorkplanReviewV1Wire';
import { parseV5CapturedReceipt, parseV5CapturedSnapshot, encodeV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
import type { IOptionEReviewControl, IOptionEReviewSnapshot, IOptionEReviewIntent } from './OptionEWorkplanReviewContract';

export type RequestChangesProcessorPorts = RequestChangesPorts & Pick<ReviewAuditReadPorts,
  'readReviewAuditBindings' | 'readReviewAuditAcl'>;

class Hold extends Error { public constructor(public readonly code: string) { super(code); Object.setPrototypeOf(this, Hold.prototype); } }
const check = (okay: boolean, code: string): void => { if (!okay) throw new Hold(code); };
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const equal = (a: unknown, b: unknown): boolean => canonicalReviewV1(copy(a)) === canonicalReviewV1(copy(b));
const positive = (n: number): boolean => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const instant = (s: string): boolean => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const nativeOkay = (n: Native): boolean => !!n && [n.siteId, n.webId, n.listId, n.version].every(s => typeof s === 'string' && !!s.trim())
  && positive(n.itemId) && v4Etag(n.etag);
const sameItem = (a: Native, b: Native): boolean => (['siteId', 'webId', 'listId', 'itemId'] as const).every(k => a[k] === b[k]);
const withoutEtag = (c: IOptionEReviewControl): Omit<IOptionEReviewControl, 'etag'> => { const { etag, ...rest } = copy(c);
  check(v4Etag(etag), 'InvalidControlEtag'); return rest; };
const read = async <T>(query: () => Promise<T>): Promise<T> => { try { const v = await query(); return v === undefined ? v : copy(v); }
  catch { throw new Hold('ReadUnavailable'); } };
interface Qualified {
  authority: ReviewAuthorityV1; actor: ReviewAuthorityV1['people'][number]; capture: CaptureReferenceV1;
  submitted: IOptionEReviewSnapshot; ordinal: OrdinalSourceV1;
}
const receiptFrame = (j: RequestChangesJournalV2): ReviewReceiptV1 => ({ schemaVersion: 'kcf.kpi.option-e.review-receipt/v1',
  commandSource: j.commandSource, sourceCapture: j.sourceCapture, reason: j.command.reason,
  receipt: { receiptKey: `${j.operationKey}:receipt`, auditKey: `${j.operationKey}:receipt`, commandKey: j.command.commandKey,
    command: 'RequestChanges', workplanKey: j.before.workplanKey, actorPersonKey: j.actorBinding.personKey,
    submittedSnapshotKey: j.sourceCapture.key, controlVersionBefore: j.before.rowVersionToken,
    controlVersionAfter: j.before.rowVersionToken + 1, processorIdentity: 'KCFKPIOptionEReviewProcessorV1' } });

/** LOCAL source composition. Providers must independently implement immutable uniqueness,
 * exact CAS and serialized subject/owner/lease fences; this module activates no native writer. */
export function createOptionEWorkplanRequestChangesV2Processor(ports?: RequestChangesProcessorPorts,
  lease?: { owner: string; milliseconds: number }): { process(source: Native): Promise<ReviewResultV1> } {
  lease = lease === undefined ? undefined : copy(lease);
  return Object.freeze({ process: async (source: Native): Promise<ReviewResultV1> => {
    if (!ports || !lease) return { outcome: 'RecoveryHold', reason: 'ProcessorUnbound' };
    if (typeof ports.readReviewAuditBindings !== 'function' || typeof ports.readReviewAuditAcl !== 'function')
      return { outcome: 'RecoveryHold', reason: 'AuditAclReadbackUnavailable' };
    const methods: readonly (keyof RequestChangesProcessorPorts)[] = ['readManagerCommand', 'readCurrentAuthority',
      'readHistoricalHeaderVersion', 'readCapturedSubmit', 'readJournal', 'createJournal', 'casJournal', 'casControl',
      'readAudit', 'createAudit', 'readRequestChangesAclBinding', 'readRequestChangesFinalAcl', 'applyRequestChangesAcl',
      'recoverEffect', 'now', 'sha256'];
    if (!methods.every(k => typeof ports[k] === 'function')) return { outcome: 'RecoveryHold', reason: 'ProcessorPortsUnavailable' };
    let journal: RequestChangesJournalV2 | undefined, row: ReviewJournalObservationV1 | undefined;
    let ownsJournal = false;
    const auditReader = createOptionEWorkplanReviewAuditSourceReadback(ports);
    const accept = (observed: ReviewJournalObservationV1): void => {
      const parsed = parseRequestChangesJournalV2(observed.body);
      check(nativeOkay(observed.native) && encodeRequestChangesJournalV2(parsed) === observed.body, 'JournalReadbackMismatch');
      row = copy(observed); journal = parsed;
    };
    const digest = async (body: string): Promise<string> => { const sha = await read(() => ports.sha256(body));
      check(/^[0-9A-F]{64}$/.test(sha), 'DigestUnavailable'); return sha; };
    const auditContext = (): ReviewAuditReadContext => ({ operationKey: journal!.operationKey, before: copy(journal!.before),
      actorBinding: copy(journal!.actorBinding), commandSource: copy(journal!.commandSource), ...(row ? { journal: copy(row) } : {}) });
    const auditPreflight = async (): Promise<void> => { await auditReader.preflight(auditContext(),
      [{ key: `${journal!.operationKey}:receipt`, eventType: 'WorkplanChangesRequested' }]); };
    const save = async (next: RequestChangesJournalV2): Promise<void> => {
      check(!!row, 'JournalUnavailable'); const previous = copy(row!), value = copy({ ...next, journalRevision: next.journalRevision + 1 });
      const body = encodeRequestChangesJournalV2(value);
      let actual: ReviewJournalObservationV1;
      try { actual = await ports.casJournal(value.operationKey, previous.native.etag, body); }
      catch { const observed = await read(() => ports.readJournal(value.operationKey));
        check(!!observed && observed.body === body, 'JournalCasUncertain'); actual = observed!; }
      check(actual.body === body && nativeOkay(actual.native) && sameItem(actual.native, previous.native)
        && actual.native.etag !== previous.native.etag, 'JournalReadbackMismatch');
      accept(actual); // All downstream readers receive the current actual CAS row, never a stale context.
    };
    const sourceRead = async (): Promise<ManagerCommandObservationV1> => {
      const s = await read(() => ports.readManagerCommand(copy(source))), command = parseReviewCommandV1(s.body);
      check(s.immutable === true && nativeOkay(s.native) && equal(s.native, source) && positive(s.authorPrincipalId)
        && instant(s.createdAt) && equal(s.columns, command), 'CommandSourceMismatch'); return s;
    };
    const qualify = async (observed: ManagerCommandObservationV1): Promise<Qualified> => {
      const command = parseReviewCommandV1(observed.body);
      const query = async (): Promise<{
        authority: ReviewAuthorityV1; bytes: Awaited<ReturnType<RequestChangesPorts['readCapturedSubmit']>>;
        binding: Awaited<ReturnType<RequestChangesPorts['readRequestChangesAclBinding']>>;
        acl: Awaited<ReturnType<RequestChangesPorts['readRequestChangesFinalAcl']>>;
      }> => {
        const authority = await read(() => ports.readCurrentAuthority(command.expectedWorkplanKey));
        // ReviewAuthorityV1 is the actual source for Submitted/Reviewing. The older Submit DTO
        // has no Reviewing literal; it is neither cast nor projected into a fictitious Ready row.
        const ready = authority.control.transitionStatus === 'Ready';
        return { authority, bytes: await read(() => ports.readCapturedSubmit(command.expectedSubmittedSnapshotKey)),
          binding: ready ? await read(() => ports.readRequestChangesAclBinding(command.expectedWorkplanKey)) : undefined,
          acl: ready ? await read(() => ports.readRequestChangesFinalAcl(command.expectedWorkplanKey)) : undefined };
      };
      const first = await query(), { authority, bytes, binding } = first, c = authority.control, h = authority.header;
      const actors = authority.people.filter(p => p.value.principalId === observed.authorPrincipalId),
        subjects = authority.people.filter(p => p.value.personKey === c.personKey), managers = authority.people.filter(p => p.value.personKey === c.managerPersonKey);
      check(actors.length === 1 && subjects.length === 1 && managers.length === 1
        && actors[0].value.personKey === managers[0].value.personKey && actors[0].value.personKey !== subjects[0].value.personKey
        && subjects[0].value.managerPersonKey === actors[0].value.personKey
        && authority.people.every(p => p.value.active === true && nativeOkay(p.native) && positive(p.value.principalId)
          && typeof p.value.email === 'string' && !!p.value.email.trim())
        && new Set(authority.people.map(p => p.value.personKey)).size === authority.people.length
        && new Set(authority.people.map(p => p.value.principalId)).size === authority.people.length, 'ActorAuthorityMismatch');
      check(nativeOkay(h.native) && h.value.id === h.native.itemId && h.value.etag === h.native.etag && c.etag === h.native.etag
        && c.workplanKey === command.expectedWorkplanKey && c.currentSubmittedSnapshotKey === command.expectedSubmittedSnapshotKey
        && h.value.workplanKey === c.workplanKey && h.value.personKey === c.personKey && h.value.performanceYear === c.performanceYear
        && h.value.managerPersonKey === c.managerPersonKey && h.value.state === c.state && h.value.transitionStatus === c.transitionStatus
        && h.value.rowVersionToken === c.rowVersionToken && positive(c.rowVersionToken) && positive(c.hierarchyEpoch)
        && c.hierarchyEpoch === c.aclEpoch && !c.currentApprovedSnapshotKey, 'CurrentHeaderMismatch');
      check(!!bytes.receipt || !!bytes.snapshot, 'MissingCapturedSubmit');
      let r: ReturnType<typeof parseV5CapturedReceipt> | undefined, s: ReturnType<typeof parseV5CapturedSnapshot> | undefined;
      try { r = bytes.receipt ? parseV5CapturedReceipt(bytes.receipt.body) : undefined;
        s = bytes.snapshot ? parseV5CapturedSnapshot(bytes.snapshot.body) : undefined; } catch { throw new Hold('InvalidCapturedSubmit'); }
      if (r && s) check(equal(r.snapshot, s) && encodeV5CapturedSnapshot(r.snapshot) === bytes.snapshot!.body, 'CapturedPairMismatch');
      const captured = r?.snapshot || s!, a = captured.admission.authority, q = a.request.query;
      check(captured.key === command.expectedSubmittedSnapshotKey && captured.admission.key === captured.key
        && (!r || r.key === captured.key) && q.workplan === c.workplanKey && q.person === c.personKey && q.year === c.performanceYear
        && a.actor.key === c.personKey && a.actor.principal === subjects[0].value.principalId
        && a.control.workplan === c.workplanKey && a.control.person === c.personKey && a.control.year === c.performanceYear
        && a.workplan.value.workplanKey === c.workplanKey && a.workplan.value.personKey === c.personKey
        && a.workplan.value.performanceYear === c.performanceYear && sameItem(a.workplan.native, h.native), 'CaptureIdentityMismatch');
      check([bytes.receipt, bytes.snapshot].every(record => !record || (record.immutable === true && nativeOkay(record.native))), 'CaptureSourceMismatch');
      const historical = await read(() => ports.readHistoricalHeaderVersion(copy(a.workplan.native)));
      check(equal(historical.native, a.workplan.native) && Object.keys(a.workplan.value).every(k =>
        equal(historical.value[k as keyof typeof historical.value], a.workplan.value[k as keyof typeof a.workplan.value]))
        && positive(historical.value.workplanVersion) && historical.value.workplanVersion === h.value.workplanVersion, 'HistoricalOrdinalUnavailable');
      if (c.transitionStatus === 'Ready') check(!!binding && !!first.acl && equal(binding.control.native, h.native) && binding.control.value.etag === c.etag
        && binding.control.value.workplanKey === c.workplanKey && binding.control.value.personKey === c.personKey
        && binding.control.value.performanceYear === c.performanceYear && binding.control.value.state === c.state
        && binding.control.value.transitionStatus === c.transitionStatus && binding.control.value.managerPersonKey === c.managerPersonKey
        && binding.control.value.hierarchyEpoch === c.hierarchyEpoch && binding.control.value.aclEpoch === c.aclEpoch
        && binding.control.value.currentSubmittedSnapshotKey === captured.key
        && (binding.control.value.pendingRequestKey || '') === (authority.pendingRequestKey || '')
        && (binding.control.value.lastOperationKey || '') === (authority.lastOperationKey || '')
        && binding.control.value.draftItemId === a.draft.itemId && binding.control.value.draftSchemaVersion === a.draft.schema
        && binding.employee.active === true && binding.employee.personKey === c.personKey
        && binding.employee.principalId === subjects[0].value.principalId && first.acl.workplanKey === c.workplanKey
        && first.acl.submittedSnapshotKey === captured.key && first.acl.hierarchyEpoch === c.hierarchyEpoch
        && first.acl.aclEpoch === c.aclEpoch && first.acl.targets.length === 4 && binding.targets.length === 4
        && binding.targets.every(t => first.acl!.targets.filter(x => x.kind === t.kind && x.key === t.key
          && equal(x.native, t.native) && x.inherited === false && x.assignments.complete === true).length === 1), 'ControlBindingMismatch');
      const preferred = bytes.receipt || bytes.snapshot!, capture: CaptureReferenceV1 = { encoding: 'captured-native-request/v1',
        kind: bytes.receipt ? 'receipt' : 'snapshot', key: captured.key, native: copy(preferred.native), sha256: await digest(preferred.body) };
      const submitted: IOptionEReviewSnapshot = { snapshotKey: captured.key, sourceSubmittedSnapshotKey: captured.key, workplanKey: c.workplanKey,
        personKey: c.personKey, performanceYear: c.performanceYear, version: historical.value.workplanVersion,
        payloadSha256: await digest(captured.body), immutable: true };
      const second = await query(), historicalAgain = await read(() => ports.readHistoricalHeaderVersion(copy(a.workplan.native)));
      check(equal(first, second) && equal(historical, historicalAgain) && equal(observed, await sourceRead()), 'SourceChanged');
      return { authority, actor: actors[0], capture, submitted, ordinal: { native: copy(historical.native), field: 'WorkplanVersion', value: historical.value.workplanVersion } };
    };
    const liveLease = (): void => { check(journal!.lease?.owner === lease.owner && positive(journal!.lease.epoch)
      && instant(ports.now()) && Date.parse(journal!.lease.expiresAt) > Date.parse(ports.now())
      && (!journal!.pendingEffect || journal!.pendingEffect.leaseEpoch === journal!.lease.epoch), 'LeaseExpiredOrForeign'); };
    const pinned = async (observed: ManagerCommandObservationV1): Promise<Qualified> => {
      const fresh = await sourceRead(); check(equal(fresh, observed), 'CommandSourceChanged'); const q = await qualify(fresh), j = journal!;
      check(equal(j.commandSource, { native: fresh.native, bodySha256: await digest(fresh.body) })
        && equal(q.actor.native, j.actorBinding.personNative) && q.actor.value.personKey === j.actorBinding.personKey
        && q.actor.value.principalId === j.actorBinding.principalId && q.actor.value.email === j.actorBinding.email
        && equal(q.capture, j.sourceCapture) && equal(q.submitted, j.submitted) && equal(q.ordinal, j.ordinalSource)
        && sameItem(q.authority.header.native, j.headerNative), 'PinnedSourceChanged');
      const a = q.authority, c = a.control, b = j.before;
      for (const k of ['workplanKey', 'personKey', 'performanceYear', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch', 'currentSubmittedSnapshotKey'] as const)
        check(c[k] === b[k], 'CurrentAuthorityChanged');
      const pending = j.pendingEffect?.kind;
      const beforeClaim = c.state === 'Submitted' && c.transitionStatus === 'Ready' && c.rowVersionToken === b.rowVersionToken && !a.pendingRequestKey;
      const claimed = c.state === 'Submitted' && c.transitionStatus === 'Reviewing' && c.rowVersionToken === b.rowVersionToken
        && a.pendingRequestKey === j.operationKey && a.lastOperationKey === j.operationKey && a.header.value.accessState === 'ReadOnly';
      const decision = c.state === 'ChangesRequested' && c.transitionStatus === 'Ready' && c.rowVersionToken === b.rowVersionToken
        && a.pendingRequestKey === j.operationKey && a.lastOperationKey === j.operationKey && a.header.value.accessState === 'ReadOnly'
        && a.header.value.managerDecisionComment === j.command.reason;
      const released = equal(withoutEtag(c), j.desired) && !a.pendingRequestKey && a.lastOperationKey === j.operationKey
        && a.header.value.accessState === 'EmployeeEdit' && a.header.value.managerDecisionComment === j.command.reason;
      const expected = j.phase === 'Validated' ? beforeClaim || (pending === 'ControlClaim' && claimed)
        : j.phase === 'ControlClaimed' || j.phase === 'ApprovedWritten' || j.phase === 'DecisionRecorded'
          ? claimed || (pending === 'DecisionReady' && decision)
          : j.phase === 'DecisionReady' || j.phase === 'AclVerified' ? decision || (pending === 'ControlRelease' && released) : released;
      check(expected, 'ControlConflict');
      const mutablePending = pending === 'ControlClaim' || pending === 'DecisionReady' || pending === 'ControlRelease';
      if (!mutablePending || equal(c, j.currentControl)) check(equal(c, j.currentControl) && equal(a.header.native, j.headerNative), 'ControlObservationChanged');
      const currentRow = await read(() => ports.readJournal(j.operationKey)); check(!!row && !!currentRow && equal(currentRow, row), 'JournalChanged');
      return q;
    };
    const artifact = async (): Promise<RequestChangesAudit> => {
      const j = journal!, key = `${j.operationKey}:receipt`, body = encodeReviewReceiptV1(receiptFrame(j));
      const actual = await read(() => ports.readAudit(key));
      check(!!actual && actual.body === body && actual.key === key && actual.eventType === 'WorkplanChangesRequested'
        && actual.immutable === true && nativeOkay(actual.native) && instant(actual.createdAt)
        && equal(actual.commandSource, j.commandSource), 'ImmutableReceiptMismatch');
      const pin = j.confirmedEffects.find(e => e.kind === 'ReceiptCreate');
      if (pin) check(equal(pin.native, actual!.native) && pin.bodySha256 === await digest(actual!.body), 'ImmutableReceiptPinMismatch');
      const observed = await auditReader.confirm(auditContext(), [actual!]);
      check(equal(observed.rows[0].row, actual!) && observed.rows[0].sha256 === await digest(body), 'ImmutableReceiptMismatch');
      return actual!;
    };
    const owned = async (afterGrant: boolean): Promise<Awaited<ReturnType<typeof confirmOptionEWorkplanRequestChangesOwnedAcl>>> => {
      liveLease(); check(!!row, 'JournalUnavailable');
      return afterGrant ? confirmOptionEWorkplanRequestChangesOwnedAcl(ports, { journal: copy(row!), owner: lease.owner })
        : qualifyOptionEWorkplanRequestChangesOwnedReady(ports, { journal: copy(row!), owner: lease.owner });
    };
    const effect = async (kind: RequestChangesEffectKindV2, key: string, body: string, phase: RequestChangesJournalV2['phase'],
      dispatch: () => Promise<void>, verify: () => Promise<Native>, observed: ManagerCommandObservationV1, expectedEtag?: string): Promise<void> => {
      const sha = await digest(body); let applied = false;
      liveLease(); await pinned(observed);
      if (journal!.pendingEffect) {
        const p = copy(journal!.pendingEffect);
        check(p.kind === kind && p.key === key && p.desiredSha256 === sha && p.expectedEtag === expectedEtag, 'PendingEffectMismatch');
        const recovery = await read(() => ports.recoverEffect(journal!.operationKey, p));
        liveLease(); await pinned(observed);
        if (recovery.status === 'StillUnknown') throw new Hold('EffectStillUnknown');
        if (recovery.status === 'Applied') {
          check(recovery.bodySha256 === sha && nativeOkay(recovery.native) && equal(await verify(), recovery.native), 'EffectProofMismatch'); applied = true;
        } else {
          check(recovery.noOutstandingDispatch === true && recovery.beforeEtag === expectedEtag, 'EffectNotAppliedUnproved');
          const authority = await read(() => ports.readCurrentAuthority(journal!.before.workplanKey));
          check(equal(authority.control, journal!.currentControl) && equal(authority.header.native, journal!.headerNative), 'EffectBeforeImageChanged');
          const clear = copy(journal!); delete clear.pendingEffect; delete clear.holdReason; clear.outcome = 'Running'; await save(clear);
        }
      }
      if (!applied) {
        liveLease(); await pinned(observed); const issued = copy(journal!); delete issued.holdReason; issued.outcome = 'Running';
        issued.pendingEffect = { kind, key, desiredSha256: sha, issuedAt: ports.now(), leaseEpoch: issued.lease!.epoch,
          ...(expectedEtag ? { expectedEtag } : {}) }; await save(issued);
        // Durable marker precedes the final independent fence and the provider's own atomic/serialized fence.
        liveLease(); await pinned(observed); await dispatch();
      }
      liveLease(); const native = await verify(), authority = await read(() => ports.readCurrentAuthority(journal!.before.workplanKey));
      const next = copy(journal!); next.confirmedEffects.push({ kind, key, bodySha256: sha, native: copy(native) });
      delete next.pendingEffect; delete next.holdReason; next.outcome = 'Running'; next.phase = phase;
      next.currentControl = copy(authority.control); next.headerNative = copy(authority.header.native); await save(next);
    };
    try {
      check(nativeOkay(source) && typeof lease.owner === 'string' && !!lease.owner.trim() && positive(lease.milliseconds)
        && instant(ports.now()), 'InvalidProcessorAdmission'); source = copy(source);
      const observed = await sourceRead(), parsed = parseReviewCommandV1(observed.body);
      if (parsed.command !== 'RequestChanges' || typeof parsed.reason !== 'string' || !parsed.reason.trim())
        return { outcome: 'RecoveryHold', reason: 'UnsupportedRequestChangesCommand' };
      const command: RequestChangesCommandV1 = { ...parsed, command: 'RequestChanges', reason: parsed.reason }, operationKey = `oe-review:${command.commandKey}`;
      const existing = await read(() => ports.readJournal(operationKey));
      if (existing) {
        accept(existing); check(journal!.operationKey === operationKey && equal(journal!.command, command)
          && equal(journal!.commandSource, { native: observed.native, bodySha256: await digest(observed.body) }), 'CommandCollision');
        ownsJournal = true; if (journal!.outcome !== 'Completed') liveLease(); await auditPreflight();
      } else {
        const one = await qualify(observed), secondSource = await sourceRead(), two = await qualify(secondSource);
        check(equal(observed, secondSource) && equal(one, two), 'SourceChanged'); const b = one.authority.control;
        check(b.state === 'Submitted' && b.transitionStatus === 'Ready' && !one.authority.pendingRequestKey
          && b.etag === command.expectedControlEtag && b.rowVersionToken === command.expectedControlVersion
          && b.rowVersionToken < Number.MAX_SAFE_INTEGER && one.authority.header.value.accessState === 'ReadOnly', 'SubmittedAuthorityUnavailable');
        journal = { schemaVersion: 'kcf.kpi.option-e.review-journal/v2', operationKey, journalRevision: 1, command,
          commandSource: { native: observed.native, bodySha256: await digest(observed.body) },
          actorBinding: { personKey: one.actor.value.personKey, principalId: one.actor.value.principalId, email: one.actor.value.email,
            personNative: copy(one.actor.native), subjectPersonKey: b.personKey, managerPersonKey: b.managerPersonKey,
            hierarchyEpoch: b.hierarchyEpoch, aclEpoch: b.aclEpoch }, before: copy(b), currentControl: copy(b), headerNative: copy(one.authority.header.native),
          desired: { ...withoutEtag(b), state: 'ChangesRequested', transitionStatus: 'Ready', rowVersionToken: b.rowVersionToken + 1 },
          submitted: one.submitted, sourceCapture: one.capture, ordinalSource: one.ordinal, phase: 'Validated', outcome: 'Running', confirmedEffects: [],
          lease: { owner: lease.owner, epoch: 1, expiresAt: new Date(Date.parse(ports.now()) + lease.milliseconds).toISOString() } };
        encodeReviewReceiptV1(receiptFrame(journal)); encodeRequestChangesJournalV2(journal);
        // Bound prospective proof capacity only; none of these shapes is stored or treated as observed evidence.
        const capacity = copy(journal); capacity.phase = 'Completed'; capacity.outcome = 'Completed';
        capacity.currentControl = { ...capacity.desired, etag: capacity.headerNative.etag };
        capacity.confirmedEffects = (['ControlClaim', 'ReceiptCreate', 'DecisionReady', 'Acl', 'ControlRelease'] as RequestChangesEffectKindV2[])
          .map(kind => ({ kind, key: kind === 'ReceiptCreate' ? `${operationKey}:receipt` : kind === 'Acl' ? operationKey : b.workplanKey,
            bodySha256: capacity.commandSource.bodySha256, native: capacity.headerNative })); encodeRequestChangesJournalV2(capacity);
        await auditPreflight(); const body = encodeRequestChangesJournalV2(journal);
        let created: ReviewJournalObservationV1 | undefined;
        try { created = await ports.createJournal(operationKey, body); } catch { created = await read(() => ports.readJournal(operationKey)); }
        check(!!created && created.body === body, 'JournalCreateConflict'); accept(created!); ownsJournal = true;
      }
      await pinned(observed); if (journal!.outcome !== 'Completed') liveLease();
      const patch = (mode: RequestChangesControlPatch['mode']): RequestChangesControlPatch => {
        const j = journal!, base = withoutEtag(j.before);
        const pins = { operationKey, expectedEtag: j.currentControl.etag, expectedVersion: j.before.rowVersionToken,
          hierarchyEpoch: j.before.hierarchyEpoch, aclEpoch: j.before.aclEpoch };
        if (mode === 'Claim') return { ...pins, mode, accessState: 'ReadOnly', control: { ...base, state: 'Submitted', transitionStatus: 'Reviewing' } };
        if (mode === 'DecisionReady') return { ...pins, mode, accessState: 'ReadOnly', managerDecisionComment: j.command.reason,
          control: { ...base, state: 'ChangesRequested', transitionStatus: 'Ready', rowVersionToken: j.before.rowVersionToken } };
        return { ...pins, mode, accessState: 'EmployeeEdit', managerDecisionComment: j.command.reason,
          control: { ...base, state: 'ChangesRequested', transitionStatus: 'Ready', rowVersionToken: j.before.rowVersionToken + 1 } };
      };
      const controlEffect = async (mode: RequestChangesControlPatch['mode'], phase: RequestChangesJournalV2['phase']): Promise<void> => {
        const p = patch(mode), kind = mode === 'Claim' ? 'ControlClaim' : mode === 'DecisionReady' ? 'DecisionReady' : 'ControlRelease';
        await effect(kind, journal!.before.workplanKey, canonicalReviewV1(p), phase, async () => {
          await auditPreflight(); if (mode !== 'Claim') await artifact(); if (mode === 'Release') await owned(true);
          liveLease(); await pinned(observed); await ports.casControl(copy(p));
        }, async () => { const q = await pinned(observed); check(equal(withoutEtag(q.authority.control), p.control), 'ControlReadbackMismatch');
          if (p.mode === 'Claim') check(q.authority.pendingRequestKey === operationKey, 'ControlReadbackMismatch');
          else check(q.authority.header.value.managerDecisionComment === p.managerDecisionComment && q.authority.header.value.accessState === p.accessState
            && (mode === 'Release' ? !q.authority.pendingRequestKey : q.authority.pendingRequestKey === operationKey), 'ControlReadbackMismatch');
          return copy(q.authority.header.native); }, observed, p.expectedEtag);
      };
      if (journal!.phase === 'Validated') await controlEffect('Claim', 'ControlClaimed');
      if (journal!.phase === 'ControlClaimed' || journal!.phase === 'ApprovedWritten') {
        const body = encodeReviewReceiptV1(receiptFrame(journal!)), key = `${operationKey}:receipt`;
        await effect('ReceiptCreate', key, body, 'DecisionRecorded', async () => { await auditPreflight(); liveLease(); await pinned(observed);
          const existingReceipt = await read(() => ports.readAudit(key));
          if (!existingReceipt) { liveLease(); await pinned(observed); await ports.createAudit(key, 'WorkplanChangesRequested', body, copy(journal!.commandSource)); }
        }, async () => copy((await artifact()).native), observed);
      }
      if (journal!.phase === 'DecisionRecorded') await controlEffect('DecisionReady', 'DecisionReady');
      if (journal!.phase === 'DecisionReady') {
        const receipt = await artifact(); const body = canonicalReviewV1({ operationKey,
          receipt: { key: receipt.key, sha256: await digest(receipt.body), native: receipt.native },
          hierarchyEpoch: journal!.before.hierarchyEpoch, aclEpoch: journal!.before.aclEpoch });
        await effect('Acl', operationKey, body, 'AclVerified', async () => { await owned(false); const actualReceipt = await artifact();
          check(equal(actualReceipt, receipt), 'ImmutableReceiptChanged'); liveLease(); await pinned(observed);
          await ports.applyRequestChangesAcl(copy(journal!), copy(actualReceipt), journal!.lease!.epoch);
        }, async () => { await artifact(); const actual = await owned(true); return copy(actual.authority.header.native); }, observed);
      }
      if (journal!.phase === 'AclVerified') { await artifact();
        // A committed release with a lost response is qualified by actual recovery and final reads,
        // rather than insisting that the already released source still looks intermediate.
        if (journal!.pendingEffect?.kind !== 'ControlRelease') await owned(true);
        await controlEffect('Release', 'ControlReleased'); }
      check(journal!.phase === 'ControlReleased' || journal!.phase === 'Completed', 'IncompleteJournal');
      const intent: IOptionEReviewIntent = { ...command, actorPersonKey: journal!.actorBinding.personKey };
      const reader = createOptionEWorkplanRequestChangesFinalSourceReadback({
        readCurrentActor: async () => copy((await pinned(observed)).actor.value),
        readCurrentHeader: async key => (await read(() => ports.readCurrentAuthority(key))).header,
        readReviewControl: async key => (await read(() => ports.readCurrentAuthority(key))).control,
        readSubmittedMetadata: async () => copy((await pinned(observed)).submitted), readApprovedMetadata: async () => undefined,
        readReviewReceipt: async () => { const r = await artifact(); return { ...parseReviewReceiptV1(r.body).receipt, nativeCreatedAt: r.createdAt }; },
        readReceipt: async key => (await read(() => ports.readCapturedSubmit(key))).receipt?.body,
        readSnapshot: async key => (await read(() => ports.readCapturedSubmit(key))).snapshot?.body,
        readRequestChangesAclBinding: ports.readRequestChangesAclBinding, readRequestChangesFinalAcl: ports.readRequestChangesFinalAcl,
        sha256: ports.sha256
      });
      const finalSource = async (): Promise<{
        authority: ReviewAuthorityV1; binding: Awaited<ReturnType<RequestChangesPorts['readRequestChangesAclBinding']>>;
        acl: Awaited<ReturnType<RequestChangesPorts['readRequestChangesFinalAcl']>>;
      }> => ({ authority: await read(() => ports.readCurrentAuthority(journal!.before.workplanKey)),
        binding: await read(() => ports.readRequestChangesAclBinding(journal!.before.workplanKey)),
        acl: await read(() => ports.readRequestChangesFinalAcl(journal!.before.workplanKey)) });
      const originalFinal = await finalSource(), originalReceipt = await artifact(), readback = await reader.confirm(intent, copy(journal!.before));
      check(equal(originalReceipt, await artifact()), 'FinalReceiptChanged'); await pinned(observed);
      check(equal(originalFinal, await finalSource()), 'FinalSourceChanged');
      if (journal!.phase !== 'Completed') { liveLease(); const completed = copy(journal!); completed.phase = 'Completed'; completed.outcome = 'Completed';
        delete completed.holdReason; await save(completed); }
      return { outcome: 'Completed', readback: copy(readback) };
    } catch (error) {
      const reason = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'EffectOrStoreUnavailable';
      // Never mutate a collision/foreign operation or cancel an outstanding marker on lease expiry.
      if (ownsJournal && journal && row && journal.outcome !== 'Completed' && journal.lease?.owner === lease.owner && reason !== 'CommandCollision') {
        try { if (Date.parse(journal.lease.expiresAt) > Date.parse(ports.now())) {
          const held = copy(journal); held.outcome = 'RecoveryHold'; held.holdReason = reason; await save(held);
        } } catch { /* Last durable issued marker remains authoritative when journal/time readback is uncertain. */ }
      }
      return { outcome: 'RecoveryHold', reason };
    }
  } });
}
