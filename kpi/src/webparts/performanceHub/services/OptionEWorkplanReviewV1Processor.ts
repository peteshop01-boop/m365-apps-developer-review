import type { Native, ReviewPortsV1, ReviewResultV1, ReviewJournalV1, ReviewJournalObservationV1, ReviewAuthorityV1,
  ReviewAuditV1, ReviewApprovedV1, ReviewReceiptV1, ReviewControlPatchV1, CaptureReferenceV1, EffectKindV1, ManagerCommandObservationV1, ReviewAclV1, OrdinalSourceV1, CapturedRecordV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { IOptionEReviewSnapshot, IOptionEReviewIntent, IOptionEReviewControl } from './OptionEWorkplanReviewContract';
import { createOptionEWorkplanReviewSourceReadback } from './OptionEWorkplanReviewSourceReadback';
import { createOptionEWorkplanReviewAuditSourceReadback, type ReviewAuditReadContext } from './OptionEWorkplanReviewAuditSourceReadback';
import { parseReviewCommandV1, parseReviewApprovedV1, parseReviewReceiptV1, parseReviewJournalV1,
  encodeReviewApprovedV1, encodeReviewReceiptV1, encodeReviewJournalV1, canonicalReviewV1, ReviewFrameErrorV1 } from './OptionEWorkplanReviewV1Wire';
import { parseV5CapturedReceipt, parseV5CapturedSnapshot, encodeV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
import type { V4AclReadback } from '../models/OptionEWorkplanSubmitExactBodyV4Models';

class Hold extends Error { public constructor(public readonly code: string) { super(code); Object.setPrototypeOf(this, Hold.prototype); } }
const check = (ok: boolean, code: string): void => { if (!ok) throw new Hold(code); };
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const equal = (a: unknown, b: unknown): boolean => canonicalReviewV1(copy(a)) === canonicalReviewV1(copy(b));
const positive = (n: number): boolean => Number.isSafeInteger(n) && n > 0;
const instant = (s: string): boolean => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const nativeValid = (n: Native): boolean => !!n && [n.siteId, n.webId, n.listId, n.version].every(s => typeof s === 'string' && !!s.trim()) && positive(n.itemId) && v4Etag(n.etag);
const sameItem = (a: Native, b: Native): boolean => (['siteId', 'webId', 'listId', 'itemId'] as const).every(k => a[k] === b[k]);
const withoutEtag = (control: IOptionEReviewControl): Omit<IOptionEReviewControl, 'etag'> => {
  const { etag, ...value } = copy(control); check(v4Etag(etag), 'InvalidControlEtag'); return value;
};
interface Qualified {
  authority: ReviewAuthorityV1; actor: ReviewAuthorityV1['people'][number]; capture: CaptureReferenceV1;
  submitted: IOptionEReviewSnapshot; ordinal: OrdinalSourceV1; bytes: { receipt?: CapturedRecordV1; snapshot?: CapturedRecordV1 }; acl: V4AclReadback;
}
const submittedAcl = (acl: V4AclReadback | undefined, c: IOptionEReviewControl, subject: number, manager: number): void => {
  check(!!acl && acl.admissionKey === c.currentSubmittedSnapshotKey && acl.hierarchyEpoch === c.hierarchyEpoch
    && acl.aclEpoch === c.aclEpoch && acl.targets.length === 4, 'SubmittedAclUnavailable');
  const snapshot = acl!.targets.find(t => t.key === `${c.workplanKey}/Snapshot/${c.currentSubmittedSnapshotKey}`);
  check(!!snapshot && Array.isArray(snapshot.grants), 'SubmittedAclMismatch');
  const content = snapshot!.grants.find(g => g.role === 'AppendOnly')?.principal,
    aclOwner = snapshot!.grants.find(g => g.role === 'AclReconciler')?.principal,
    recovery = snapshot!.grants.find(g => g.role === 'FullControl')?.principal;
  const principals = [content, aclOwner, recovery, subject, manager];
  check(principals.every(n => typeof n === 'number' && positive(n)) && new Set(principals).size === 5, 'SubmittedAclMismatch');
  for (const kind of ['Draft', 'Snapshot', 'Operation', 'Control']) {
    const targets = acl!.targets.filter(t => t.key === `${c.workplanKey}/${kind}/${c.currentSubmittedSnapshotKey}`);
    check(targets.length === 1, 'SubmittedAclMismatch'); const target = targets[0];
    const expected = [{ principal: content, role: kind === 'Snapshot' ? 'AppendOnly' : 'MutatorNoDelete' },
      { principal: aclOwner, role: 'AclReconciler' }, { principal: recovery, role: 'FullControl' },
      { principal: subject, role: 'Read' }, ...(kind === 'Draft' ? [] : [{ principal: manager, role: 'Read' }])];
    check(target.complete === true && target.inherited === false && target.grants.length === expected.length
      && expected.every(w => target.grants.filter(g => g.principal === w.principal && g.role === w.role).length === 1), 'SubmittedAclMismatch');
  }
};
const read = async <T>(query: () => Promise<T>): Promise<T> => { try { const v = await query(); return v === undefined ? v : copy(v); } catch { throw new Hold('ReadUnavailable'); } };
const approvedFrame = (j: ReviewJournalV1): ReviewApprovedV1 => ({ schemaVersion: 'kcf.kpi.option-e.review-approved/v1', commandKey: j.command.commandKey,
  approved: { ...j.submitted, snapshotKey: j.desired.currentApprovedSnapshotKey! }, sourceCapture: j.sourceCapture, ordinalSource: j.ordinalSource });
const receiptFrame = (j: ReviewJournalV1, approved: ReviewAuditV1, digest: string): ReviewReceiptV1 => ({
  schemaVersion: 'kcf.kpi.option-e.review-receipt/v1', commandSource: j.commandSource, sourceCapture: j.sourceCapture,
  approvedReference: { key: approved.key, native: approved.native, sha256: digest },
  receipt: { commandKey: j.command.commandKey, command: 'ApproveLock', workplanKey: j.before.workplanKey, actorPersonKey: j.actorBinding.personKey,
    submittedSnapshotKey: j.sourceCapture.key, approvedSnapshotKey: approved.key, receiptKey: `${j.operationKey}:receipt`, auditKey: `${j.operationKey}:receipt`,
    controlVersionBefore: j.before.rowVersionToken, controlVersionAfter: j.desired.rowVersionToken, processorIdentity: 'KCFKPIOptionEReviewProcessorV1' }
});

/** LOCAL domain processor only. The supplied store owns exact CAS, uniqueness and independent
 * effect recovery; successful source observations do not certify native identity or permission. */
export function createOptionEWorkplanReviewV1Processor(ports?: ReviewPortsV1, lease?: { owner: string; milliseconds: number }): {
  process(source: Native): Promise<ReviewResultV1>;
} {
  return Object.freeze({ process: async (source: Native): Promise<ReviewResultV1> => {
    if (!ports || !lease) return { outcome: 'RecoveryHold', reason: 'ProcessorUnbound' };
    if (typeof ports.readReviewAuditBindings !== 'function' || typeof ports.readReviewAuditAcl !== 'function')
      return { outcome: 'RecoveryHold', reason: 'AuditAclReadbackUnavailable' };
    const auditReader = createOptionEWorkplanReviewAuditSourceReadback(ports);
    let journal: ReviewJournalV1 | undefined, journalRow: ReviewJournalObservationV1 | undefined;
    // These variables belong to this invocation; publish detached observations synchronously.
    const acceptRow = (row: ReviewJournalObservationV1 | undefined): void => { journalRow = row === undefined ? undefined : copy(row); };
    const currentRow = (): ReviewJournalObservationV1 | undefined => journalRow;
    const acceptJournal = (frame: ReviewJournalV1, row: ReviewJournalObservationV1): void => { journal = copy(frame); acceptRow(row); };
    const auditContext = (): ReviewAuditReadContext => ({ operationKey: journal!.operationKey, before: copy(journal!.before),
      actorBinding: copy(journal!.actorBinding), commandSource: copy(journal!.commandSource), ...(journalRow ? { journal: copy(journalRow) } : {}) });
    const auditPreflight = async (): Promise<void> => { await auditReader.preflight(auditContext(), [
      { key: `${journal!.operationKey}:approved`, eventType: 'WorkplanApproved' }, { key: `${journal!.operationKey}:receipt`, eventType: 'WorkplanLocked' }]); };
    const digest = async (body: string): Promise<string> => { const result = await read(() => ports.sha256(body)); check(/^[0-9A-F]{64}$/.test(result), 'DigestUnavailable'); return result; };
    const save = async (next: ReviewJournalV1): Promise<void> => {
      check(!!journalRow, 'JournalUnavailable'); const desired = copy({ ...next, journalRevision: next.journalRevision + 1 });
      const body = encodeReviewJournalV1(desired), actual = await ports.casJournal(desired.operationKey, journalRow!.native.etag, body);
      check(actual.body === body && nativeValid(actual.native) && sameItem(actual.native, journalRow!.native)
        && actual.native.etag !== journalRow!.native.etag, 'JournalReadbackMismatch');
      acceptJournal(desired, actual);
    };
    const sourceRead = async (): Promise<ManagerCommandObservationV1> => {
      const observed = await read(() => ports.readManagerCommand(copy(source))); const command = parseReviewCommandV1(observed.body);
      check(nativeValid(observed.native) && equal(observed.native, source) && observed.immutable === true && positive(observed.authorPrincipalId)
        && instant(observed.createdAt) && equal(command, observed.columns), 'CommandSourceMismatch'); return observed;
    };
    const qualify = async (observed: ManagerCommandObservationV1): Promise<Qualified> => {
      const command = parseReviewCommandV1(observed.body), authority = await read(() => ports.readCurrentAuthority(command.expectedWorkplanKey));
      const { control: c, header: h, people } = authority;
      const actors = people.filter(p => p.value.principalId === observed.authorPrincipalId);
      const subjects = people.filter(p => p.value.personKey === c.personKey);
      const managers = people.filter(p => p.value.personKey === c.managerPersonKey);
      check(actors.length === 1 && subjects.length === 1 && managers.length === 1 && actors[0].value.personKey === managers[0].value.personKey
        && actors[0].value.personKey !== subjects[0].value.personKey && actors[0].value.active && subjects[0].value.active
        && managers[0].value.active && subjects[0].value.managerPersonKey === managers[0].value.personKey
        && people.every(p => nativeValid(p.native) && positive(p.value.principalId))
        && new Set(people.map(p => p.value.principalId)).size === people.length && new Set(people.map(p => p.value.personKey)).size === people.length, 'ActorAuthorityMismatch');
      check(nativeValid(h.native) && h.value.id === h.native.itemId && h.value.etag === h.native.etag && c.etag === h.native.etag
        && c.workplanKey === command.expectedWorkplanKey && h.value.workplanKey === c.workplanKey && h.value.personKey === c.personKey
        && h.value.performanceYear === c.performanceYear && h.value.managerPersonKey === c.managerPersonKey
        && h.value.state === c.state && h.value.transitionStatus === c.transitionStatus && h.value.rowVersionToken === c.rowVersionToken
        && positive(c.hierarchyEpoch) && positive(c.aclEpoch) && positive(c.rowVersionToken) && c.currentSubmittedSnapshotKey === command.expectedSubmittedSnapshotKey, 'CurrentHeaderMismatch');
      const bytes = await read(() => ports.readCapturedSubmit(command.expectedSubmittedSnapshotKey));
      check(!!bytes.receipt || !!bytes.snapshot, 'MissingCapturedSubmit');
      let receipt: ReturnType<typeof parseV5CapturedReceipt> | undefined, snapshot: ReturnType<typeof parseV5CapturedSnapshot> | undefined;
      try {
        receipt = bytes.receipt ? parseV5CapturedReceipt(bytes.receipt.body) : undefined;
        snapshot = bytes.snapshot ? parseV5CapturedSnapshot(bytes.snapshot.body) : undefined;
      } catch { throw new Hold('InvalidCapturedSubmit'); }
      if (receipt && snapshot) check(equal(receipt.snapshot, snapshot) && encodeV5CapturedSnapshot(receipt.snapshot) === bytes.snapshot!.body, 'CapturedPairMismatch');
      const captured = receipt?.snapshot || snapshot!;
      if (receipt) check(receipt.key === command.expectedSubmittedSnapshotKey, 'CaptureIdentityMismatch');
      const a = captured.admission.authority, q = a.request.query;
      check(captured.key === command.expectedSubmittedSnapshotKey && captured.admission.key === captured.key
        && q.workplan === c.workplanKey && q.person === c.personKey && q.year === c.performanceYear
        && a.actor.key === c.personKey && a.actor.principal === subjects[0].value.principalId
        && a.control.workplan === c.workplanKey && a.control.person === c.personKey && a.control.year === c.performanceYear
        && a.workplan.value.workplanKey === c.workplanKey && a.workplan.value.personKey === c.personKey && a.workplan.value.performanceYear === c.performanceYear
        && sameItem(a.workplan.native, h.native), 'CaptureIdentityMismatch');
      for (const record of [bytes.receipt, bytes.snapshot]) if (record) check(record.immutable === true && nativeValid(record.native), 'CaptureSourceMismatch');
      const historical = await read(() => ports.readHistoricalHeaderVersion(copy(a.workplan.native)));
      check(equal(historical.native, a.workplan.native) && Object.keys(a.workplan.value).every(k =>
        equal(historical.value[k as keyof typeof a.workplan.value], a.workplan.value[k as keyof typeof a.workplan.value]))
        && positive(historical.value.workplanVersion) && historical.value.workplanVersion === h.value.workplanVersion, 'HistoricalOrdinalUnavailable');
      const acl = await read(() => ports.readFinalAcl(`oe-review:${command.commandKey}`));
      submittedAcl(acl?.submitted, c, subjects[0].value.principalId, actors[0].value.principalId);
      const preferred = bytes.receipt || bytes.snapshot!;
      const capture: CaptureReferenceV1 = { encoding: 'captured-native-request/v1', kind: bytes.receipt ? 'receipt' : 'snapshot', key: captured.key,
        native: copy(preferred.native), sha256: await digest(preferred.body) };
      const submitted: IOptionEReviewSnapshot = { snapshotKey: captured.key, sourceSubmittedSnapshotKey: captured.key, workplanKey: c.workplanKey,
        personKey: c.personKey, performanceYear: c.performanceYear, version: historical.value.workplanVersion, payloadSha256: await digest(captured.body), immutable: true };
      return { authority, actor: actors[0], capture, submitted, ordinal: { native: copy(historical.native), field: 'WorkplanVersion' as const, value: historical.value.workplanVersion }, bytes, acl: copy(acl!.submitted) };
    };
    const pinned = async (observed: ManagerCommandObservationV1): Promise<Qualified> => {
      const actualSource = await sourceRead(); check(equal(actualSource, observed), 'CommandSourceChanged');
      const q = await qualify(actualSource), j = journal!;
      check(equal(j.commandSource, { native: actualSource.native, bodySha256: await digest(actualSource.body) })
        && equal(q.actor.native, j.actorBinding.personNative) && q.actor.value.personKey === j.actorBinding.personKey
        && q.actor.value.principalId === j.actorBinding.principalId && q.actor.value.email === j.actorBinding.email
        && equal(q.capture, j.sourceCapture) && equal(q.submitted, j.submitted) && equal(q.ordinal, j.ordinalSource)
        && sameItem(q.authority.header.native, j.headerNative), 'PinnedSourceChanged');
      const current = q.authority.control;
      for (const k of ['workplanKey', 'personKey', 'performanceYear', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch', 'currentSubmittedSnapshotKey'] as const)
        check(current[k] === j.before[k], 'CurrentAuthorityChanged');
      const pendingClaim = j.pendingEffect?.kind === 'ControlClaim', pendingRelease = j.pendingEffect?.kind === 'ControlRelease';
      if (!pendingClaim && !pendingRelease) check(equal(q.authority.header.native, j.headerNative) && equal(current, j.currentControl), 'ControlObservationChanged');
      if (j.phase === 'Validated' && !(pendingClaim && q.authority.pendingRequestKey === j.operationKey)) {
        check(equal(current, j.before) && !q.authority.pendingRequestKey, 'ControlConflict');
      } else if (j.phase === 'ControlReleased' || j.phase === 'Completed' || (pendingRelease && current.state === 'Locked')) {
        check(equal(withoutEtag(current), j.desired) && !q.authority.pendingRequestKey && q.authority.lastOperationKey === j.operationKey, 'FinalControlMismatch');
      } else {
        check(current.state === 'Submitted' && current.transitionStatus === 'Reviewing' && current.rowVersionToken === j.before.rowVersionToken
          && q.authority.pendingRequestKey === j.operationKey && q.authority.lastOperationKey === j.operationKey
          && !current.currentApprovedSnapshotKey && (pendingClaim || pendingRelease || current.etag === j.currentControl.etag), 'ControlConflict');
      }
      return q;
    };
    const audit = async (key: string, body: string, event: ReviewAuditV1['eventType']): Promise<ReviewAuditV1> => {
      const record = await read(() => ports.readAudit(key)); check(!!record && record.key === key && record.body === body
        && record.eventType === event && record.immutable === true && instant(record.createdAt) && nativeValid(record.native)
        && equal(record.commandSource, journal!.commandSource), 'ImmutableAuditMismatch');
      const pin = journal!.confirmedEffects.find(e => e.key === key && (e.kind === 'ApprovedCreate' || e.kind === 'ReceiptCreate'));
      if (pin) check(equal(pin.native, record!.native) && pin.bodySha256 === await digest(record!.body), 'ImmutableAuditPinMismatch'); return record!;
    };
    const artifacts = async (): Promise<ReviewAuditV1[]> => {
      const approvedBody = encodeReviewApprovedV1(approvedFrame(journal!)); const a = await audit(`${journal!.operationKey}:approved`, approvedBody, 'WorkplanApproved');
      const r = await audit(`${journal!.operationKey}:receipt`, encodeReviewReceiptV1(receiptFrame(journal!, a, await digest(a.body))), 'WorkplanLocked');
      const qualified = await auditReader.confirm(auditContext(), [a, r]);
      check(equal(qualified.rows.map(row => row.row), [a, r]), 'ImmutableAuditMismatch');
      for (const observed of qualified.rows) { const pin = journal!.confirmedEffects.find(effect => effect.key === observed.row.key
        && (effect.kind === 'ApprovedCreate' || effect.kind === 'ReceiptCreate'));
        check(!!pin && pin.bodySha256 === observed.sha256 && equal(pin.native, observed.row.native), 'ImmutableAuditPinMismatch'); }
      return [a, r];
    };
    const aclCheck = (acl: ReviewAclV1 | undefined): void => {
      const j = journal!; check(!!acl && acl.operationKey === j.operationKey && positive(acl.leaseEpoch)
        && acl.leaseEpoch === j.lease!.epoch && nativeValid(acl.native) && acl.submitted.admissionKey === j.sourceCapture.key
        && acl.submitted.hierarchyEpoch === j.before.hierarchyEpoch && acl.submitted.aclEpoch === j.before.aclEpoch
        && acl.submitted.targets.length === 4, 'FinalAclUnavailable');
      // Legacy artifacts labels are retained for compatibility, never Audit acceptance evidence.
    };
    const effect = async (kind: EffectKindV1, key: string, body: string, phase: ReviewJournalV1['phase'], dispatch: () => Promise<void>,
      verify: () => Promise<Native>, expectedEtag?: string): Promise<void> => {
      const sha = await digest(body); let alreadyApplied = false;
      if (journal!.pendingEffect) {
        const p = journal!.pendingEffect;
        check(p.kind === kind && p.key === key && p.desiredSha256 === sha && p.expectedEtag === expectedEtag, 'PendingEffectMismatch');
        const recovery = await read(() => ports.recoverEffect(journal!.operationKey, copy(p)));
        if (recovery.status === 'StillUnknown') throw new Hold('EffectStillUnknown');
        if (recovery.status === 'Applied') { check(recovery.bodySha256 === sha && nativeValid(recovery.native), 'EffectProofMismatch'); alreadyApplied = true;
          check(equal(await verify(), recovery.native), 'EffectProofMismatch'); }
        else { check(recovery.noOutstandingDispatch === true && recovery.beforeEtag === expectedEtag, 'EffectNotAppliedUnproved');
          if (expectedEtag) { const before = await read(() => ports.readCurrentAuthority(journal!.before.workplanKey));
            check(before.header.native.etag === expectedEtag && equal(before.header.native, journal!.headerNative)
              && equal(before.control, journal!.currentControl), 'EffectBeforeImageChanged'); }
          const clear = copy(journal!); delete clear.pendingEffect; delete clear.holdReason; clear.outcome = 'Running'; await save(clear); }
      }
      if (!alreadyApplied) {
        check(journal!.lease!.owner === lease.owner && Date.parse(journal!.lease!.expiresAt) > Date.parse(ports.now()), 'LeaseExpired');
        const issued = copy(journal!); delete issued.holdReason; issued.outcome = 'Running';
        issued.pendingEffect = { kind, key, desiredSha256: sha, issuedAt: ports.now(), leaseEpoch: issued.lease!.epoch, ...(expectedEtag ? { expectedEtag } : {}) };
        await save(issued); await dispatch();
      }
      const native = await verify(); const authority = await read(() => ports.readCurrentAuthority(journal!.before.workplanKey));
      const next = copy(journal!); next.confirmedEffects.push({ kind, key, bodySha256: sha, native });
      delete next.pendingEffect; delete next.holdReason; next.outcome = 'Running'; next.phase = phase;
      next.currentControl = authority.control; next.headerNative = copy(authority.header.native); await save(next);
    };
    try {
      check(nativeValid(source) && !!lease.owner.trim() && positive(lease.milliseconds) && instant(ports.now()), 'InvalidProcessorAdmission'); source = copy(source);
      const observed = await sourceRead(), command = parseReviewCommandV1(observed.body);
      if (command.command === 'RequestChanges') return { outcome: 'RecoveryHold', reason: 'RequestChangesFinalAclReadbackUnavailable' };
      const operationKey = `oe-review:${command.commandKey}`;
      acceptRow(await read(() => ports.readJournal(operationKey)));
      if (journalRow) {
        check(nativeValid(journalRow.native), 'JournalReadbackMismatch'); journal = parseReviewJournalV1(journalRow.body);
        check(encodeReviewJournalV1(journal) === journalRow.body, 'JournalReadbackMismatch');
        check(journal.operationKey === operationKey && equal(journal.command, command)
          && equal(journal.commandSource, { native: observed.native, bodySha256: await digest(observed.body) }), 'CommandCollision');
        await auditPreflight();
      } else {
        const one = await qualify(observed), secondSource = await sourceRead(), two = await qualify(secondSource);
        check(equal(observed, secondSource) && equal(one, two), 'SourceChanged'); const b = one.authority.control;
        check(b.state === 'Submitted' && b.transitionStatus === 'Ready' && !one.authority.pendingRequestKey && !b.currentApprovedSnapshotKey
          && b.etag === command.expectedControlEtag && b.rowVersionToken === command.expectedControlVersion
          && b.rowVersionToken < Number.MAX_SAFE_INTEGER, 'SubmittedAuthorityUnavailable');
        journal = { schemaVersion: 'kcf.kpi.option-e.review-journal/v1', operationKey, journalRevision: 1, command,
          commandSource: { native: observed.native, bodySha256: await digest(observed.body) },
          actorBinding: { personKey: one.actor.value.personKey, principalId: one.actor.value.principalId, email: one.actor.value.email, personNative: copy(one.actor.native),
            subjectPersonKey: b.personKey, managerPersonKey: b.managerPersonKey, hierarchyEpoch: b.hierarchyEpoch, aclEpoch: b.aclEpoch },
          before: b, currentControl: b, headerNative: copy(one.authority.header.native), desired: { ...withoutEtag(b), state: 'Locked', transitionStatus: 'Ready', rowVersionToken: b.rowVersionToken + 1, currentApprovedSnapshotKey: `${operationKey}:approved` },
          submitted: one.submitted, sourceCapture: one.capture, ordinalSource: one.ordinal, phase: 'Validated', outcome: 'Running', confirmedEffects: [],
          lease: { owner: lease.owner, epoch: 1, expiresAt: new Date(Date.parse(ports.now()) + lease.milliseconds).toISOString() } };
        // Bound all prospective frame shapes before the first journal/control effect.
        const approvedBody = encodeReviewApprovedV1(approvedFrame(journal));
        encodeReviewReceiptV1(receiptFrame(journal, { key: `${operationKey}:approved`, native: journal.sourceCapture.native, body: approvedBody,
          immutable: true, eventType: 'WorkplanApproved', createdAt: ports.now(), commandSource: journal.commandSource }, await digest(approvedBody)));
        const prospective = copy(journal); prospective.phase = 'Completed'; prospective.outcome = 'Completed';
        prospective.currentControl = { ...prospective.desired, etag: prospective.headerNative.etag };
        prospective.confirmedEffects = (['ControlClaim', 'ApprovedCreate', 'ReceiptCreate', 'Acl', 'ControlRelease'] as EffectKindV1[]).map(kind => ({
          kind, key: kind === 'ApprovedCreate' ? `${operationKey}:approved` : kind === 'ReceiptCreate' ? `${operationKey}:receipt` : kind === 'Acl' ? operationKey : prospective.before.workplanKey,
          bodySha256: prospective.commandSource.bodySha256, native: prospective.headerNative }));
        // Capacity preflight only: these prospective proof shapes are never stored or returned.
        encodeReviewJournalV1(prospective);
        await auditPreflight();
        const body = encodeReviewJournalV1(journal);
        try { acceptRow(await ports.createJournal(operationKey, body)); }
        catch { acceptRow(await read(() => ports.readJournal(operationKey))); }
        const created = currentRow(); check(!!created && created.body === body && nativeValid(created.native), 'JournalCreateConflict');
      }
      await pinned(observed);
      if (journal.outcome !== 'Completed') check(journal.lease?.owner === lease.owner && Date.parse(journal.lease.expiresAt) > Date.parse(ports.now()), 'LeaseExpiredOrForeign');
      const patch = (mode: 'Claim' | 'Release', time?: string): ReviewControlPatchV1 => ({ mode, operationKey, expectedEtag: journal!.currentControl.etag,
        expectedVersion: journal!.before.rowVersionToken, hierarchyEpoch: journal!.before.hierarchyEpoch, aclEpoch: journal!.before.aclEpoch,
        control: mode === 'Claim' ? { ...withoutEtag(journal!.before), transitionStatus: 'Reviewing' } : journal!.desired,
        ...(mode === 'Release' ? { accessState: 'ReadOnly', approvedAt: time!, approvedByEmail: journal!.actorBinding.email, lockedAt: time!, lockedByEmail: journal!.actorBinding.email } : {}) });
      if (journal.phase === 'Validated') {
        const p = patch('Claim'); await effect('ControlClaim', journal.before.workplanKey, canonicalReviewV1(p), 'ControlClaimed',
          async () => { await ports.casControl(copy(p)); }, async () => { const q = await pinned(observed);
            check(q.authority.pendingRequestKey === operationKey && equal(withoutEtag(q.authority.control), p.control), 'ClaimReadbackMismatch'); return copy(q.authority.header.native); }, p.expectedEtag);
      }
      if (journal.phase === 'ControlClaimed') {
        await pinned(observed); const body = encodeReviewApprovedV1(approvedFrame(journal)), key = `${operationKey}:approved`;
        await effect('ApprovedCreate', key, body, 'ApprovedWritten', async () => {
          await auditPreflight();
          const existing = await read(() => ports.readAudit(key)); if (!existing) await ports.createAudit(key, 'WorkplanApproved', body, copy(journal!.commandSource));
        }, async () => copy((await audit(key, body, 'WorkplanApproved')).native));
      }
      if (journal.phase === 'ApprovedWritten') {
        await pinned(observed); const a = await audit(`${operationKey}:approved`, encodeReviewApprovedV1(approvedFrame(journal)), 'WorkplanApproved');
        const body = encodeReviewReceiptV1(receiptFrame(journal, a, await digest(a.body))), key = `${operationKey}:receipt`;
        await effect('ReceiptCreate', key, body, 'DecisionRecorded', async () => { await auditPreflight(); const existing = await read(() => ports.readAudit(key));
          if (!existing) await ports.createAudit(key, 'WorkplanLocked', body, copy(journal!.commandSource)); }, async () => copy((await audit(key, body, 'WorkplanLocked')).native));
      }
      if (journal.phase === 'DecisionRecorded') {
        await pinned(observed); const rows = await artifacts(), body = canonicalReviewV1({ operationKey, artifacts: await Promise.all(rows.map(async row => ({ key: row.key, sha256: await digest(row.body), native: row.native }))), hierarchyEpoch: journal.before.hierarchyEpoch, aclEpoch: journal.before.aclEpoch });
        await effect('Acl', operationKey, body, 'AclVerified', async () => { const freshRows = await artifacts(); await pinned(observed);
          check(equal(rows, freshRows), 'ImmutableAuditMismatch'); await ports.applyFinalAcl(copy(journal!), copy(freshRows), journal!.lease!.epoch); },
          async () => { await artifacts(); const acl = await read(() => ports.readFinalAcl(operationKey)); aclCheck(acl); return copy(acl!.native); });
      }
      if (journal.phase === 'AclVerified') {
        await pinned(observed); await artifacts(); const acl = await read(() => ports.readFinalAcl(operationKey)); aclCheck(acl);
        const time = journal.pendingEffect?.issuedAt || ports.now(), p = patch('Release', time);
        await effect('ControlRelease', journal.before.workplanKey, canonicalReviewV1(p), 'ControlReleased', async () => {
          await artifacts(); await pinned(observed); await ports.casControl(copy(p)); },
          async () => { const q = await pinned(observed); check(equal(withoutEtag(q.authority.control), journal!.desired)
            && q.authority.header.value.accessState === 'ReadOnly' && q.authority.header.value.approvedAt === time && q.authority.header.value.lockedAt === time
            && q.authority.header.value.approvedByEmail === journal!.actorBinding.email && q.authority.header.value.lockedByEmail === journal!.actorBinding.email, 'ReleaseReadbackMismatch'); return copy(q.authority.header.native); }, p.expectedEtag);
      }
      check(journal.phase === 'ControlReleased' || journal.phase === 'Completed', 'IncompleteJournal');
      // The sealed024 reader obtains separate fresh domain-store observations, never a prepared result.
      const intent: IOptionEReviewIntent = { commandKey: command.commandKey, command: command.command, actorPersonKey: journal.actorBinding.personKey,
        expectedWorkplanKey: command.expectedWorkplanKey, expectedControlEtag: command.expectedControlEtag,
        expectedControlVersion: command.expectedControlVersion, expectedSubmittedSnapshotKey: command.expectedSubmittedSnapshotKey };
      const reader = createOptionEWorkplanReviewSourceReadback({
        readCurrentActor: async () => { const q = await pinned(observed); return copy(q.actor.value); },
        readCurrentHeader: async workplan => (await read(() => ports.readCurrentAuthority(workplan))).header,
        readReviewControl: async workplan => (await read(() => ports.readCurrentAuthority(workplan))).control,
        readSubmittedMetadata: async () => (await pinned(observed)).submitted,
        readApprovedMetadata: async key => { const row = await read(() => ports.readAudit(key)); return row ? parseReviewApprovedV1(row.body).approved : undefined; },
        readReviewReceipt: async () => { const row = await read(() => ports.readAudit(`${operationKey}:receipt`)); return row ? { ...parseReviewReceiptV1(row.body).receipt, nativeCreatedAt: row.createdAt } : undefined; },
        readReceipt: async pointer => (await read(() => ports.readCapturedSubmit(pointer))).receipt?.body,
        readSnapshot: async pointer => (await read(() => ports.readCapturedSubmit(pointer))).snapshot?.body,
        readAcl: async () => (await read(() => ports.readFinalAcl(operationKey)))?.submitted, sha256: ports.sha256
      });
      const finalRows = await artifacts(), finalAcl = await read(() => ports.readFinalAcl(operationKey)); aclCheck(finalAcl);
      const readback = await reader.confirm(intent, copy(journal.before));
      check(equal(finalRows, await artifacts()) && equal(finalAcl, await read(() => ports.readFinalAcl(operationKey))), 'FinalArtifactsChanged'); await pinned(observed);
      if (journal.phase !== 'Completed') { const completed = copy(journal); completed.phase = 'Completed'; completed.outcome = 'Completed'; delete completed.holdReason; await save(completed); }
      return { outcome: 'Completed', readback: copy(readback) };
    } catch (error) {
      const reason = error instanceof Hold || error instanceof ReviewFrameErrorV1 ? error.code
        : error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'EffectOrStoreUnavailable';
      // A collision/foreign lease must never change somebody else's journal.
      if (journal && journalRow && journal.outcome !== 'Completed' && journal.lease?.owner === lease.owner && reason !== 'CommandCollision') {
        const held = copy(journal); held.outcome = 'RecoveryHold'; held.holdReason = reason;
        try { await save(held); } catch { /* Preserve the last durable Issued frame when CAS/readback is uncertain. */ }
      }
      return { outcome: 'RecoveryHold', reason };
    }
  } });
}
