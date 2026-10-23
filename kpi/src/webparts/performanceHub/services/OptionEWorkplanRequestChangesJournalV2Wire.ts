import type { RequestChangesJournalV2 } from '../models/OptionEWorkplanRequestChangesV2Models';
import { canonicalReviewV1, parseReviewCommandV1 } from './OptionEWorkplanReviewV1Wire';
import { v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';

export class RequestChangesJournalErrorV2 extends Error {
  public constructor(public readonly code: string) { super(code); Object.setPrototypeOf(this, RequestChangesJournalErrorV2.prototype); }
}
const requireThat = (ok: boolean, code = 'InvalidRequestChangesJournal'): void => {
  if (!ok) throw new RequestChangesJournalErrorV2(code);
};
type Fields = { [key: string]: unknown }; // Transient validation view, never a stored field bag.
const object = (value: unknown, required: string[], optional: string[] = []): Fields => {
  requireThat(typeof value === 'object' && value !== null && !Array.isArray(value)); const o = value as Fields;
  requireThat(required.every(k => Object.prototype.hasOwnProperty.call(o, k))
    && Object.keys(o).every(k => required.includes(k) || optional.includes(k))); return o;
};
const text = (value: unknown): void => requireThat(typeof value === 'string' && !!value.trim());
const positive = (value: unknown): void => requireThat(typeof value === 'number' && Number.isSafeInteger(value) && value > 0);
const digest = (value: unknown): void => requireThat(typeof value === 'string' && /^[0-9A-F]{64}$/.test(value));
const etag = (value: unknown): void => requireThat(typeof value === 'string' && v4Etag(value));
const iso = (value: unknown): void => requireThat(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
const year = (value: unknown): void => requireThat(typeof value === 'number' && Number.isSafeInteger(value) && value >= 2000 && value <= 9999);
const native = (value: unknown): Fields => {
  const o = object(value, ['siteId', 'webId', 'listId', 'itemId', 'version', 'etag']);
  ['siteId', 'webId', 'listId', 'version'].forEach(k => text(o[k])); positive(o.itemId); etag(o.etag); return o;
};
const sameItem = (a: Fields, b: Fields): boolean => ['siteId', 'webId', 'listId', 'itemId'].every(k => a[k] === b[k]);
const controlFields = ['workplanKey', 'personKey', 'performanceYear', 'state', 'transitionStatus', 'rowVersionToken', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch'];
const control = (value: unknown, desired = false): Fields => {
  const o = object(value, [...controlFields, ...(desired ? [] : ['etag'])], ['currentSubmittedSnapshotKey', 'currentApprovedSnapshotKey']);
  ['workplanKey', 'personKey', 'managerPersonKey'].forEach(k => text(o[k])); year(o.performanceYear);
  ['rowVersionToken', 'hierarchyEpoch', 'aclEpoch'].forEach(k => positive(o[k]));
  requireThat(['Draft', 'ChangesRequested', 'Submitted', 'Approved', 'Locked'].includes(String(o.state))
    && ['Ready', 'Submitting', 'Reviewing', 'RecoveryHold'].includes(String(o.transitionStatus)));
  if (!desired) etag(o.etag);
  ['currentSubmittedSnapshotKey', 'currentApprovedSnapshotKey'].forEach(k => { if (k in o) text(o[k]); }); return o;
};
const snapshot = (value: unknown): Fields => {
  const o = object(value, ['snapshotKey', 'workplanKey', 'personKey', 'performanceYear', 'version', 'payloadSha256', 'sourceSubmittedSnapshotKey', 'immutable']);
  ['snapshotKey', 'workplanKey', 'personKey', 'sourceSubmittedSnapshotKey'].forEach(k => text(o[k])); year(o.performanceYear);
  positive(o.version); digest(o.payloadSha256); requireThat(o.immutable === true); return o;
};
const plan = ['ControlClaim', 'ReceiptCreate', 'DecisionReady', 'Acl', 'ControlRelease'];
const phases = ['Validated', 'ControlClaimed', 'ApprovedWritten', 'DecisionRecorded', 'DecisionReady', 'AclVerified', 'ControlReleased', 'Completed'];
const counts = [0, 1, 1, 2, 3, 4, 5, 5];
const mutable = (kind: unknown): boolean => kind === 'ControlClaim' || kind === 'DecisionReady' || kind === 'ControlRelease';

const checkJournal = (value: unknown): void => {
  const o = object(value, ['schemaVersion', 'operationKey', 'journalRevision', 'command', 'commandSource', 'actorBinding', 'before', 'currentControl',
    'headerNative', 'desired', 'submitted', 'sourceCapture', 'ordinalSource', 'phase', 'outcome', 'confirmedEffects'], ['lease', 'pendingEffect', 'holdReason']);
  requireThat(o.schemaVersion === 'kcf.kpi.option-e.review-journal/v2');
  // Reuse the fixed command/v1 declaration; never reinterpret a journal/v1 frame.
  const c = parseReviewCommandV1(canonicalReviewV1(o.command)); requireThat(c.command === 'RequestChanges'); text(c.reason);
  requireThat(o.operationKey === `oe-review:${c.commandKey}` && String(o.operationKey).length <= 255); positive(o.journalRevision);
  const source = object(o.commandSource, ['native', 'bodySha256']); native(source.native); digest(source.bodySha256);
  const actor = object(o.actorBinding, ['personKey', 'principalId', 'email', 'personNative', 'subjectPersonKey', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch']);
  ['personKey', 'email', 'subjectPersonKey', 'managerPersonKey'].forEach(k => text(actor[k]));
  ['principalId', 'hierarchyEpoch', 'aclEpoch'].forEach(k => positive(actor[k])); native(actor.personNative);
  const before = control(o.before), current = control(o.currentControl), desired = control(o.desired, true), submitted = snapshot(o.submitted);
  const header = native(o.headerNative);
  const capture = object(o.sourceCapture, ['encoding', 'kind', 'key', 'native', 'sha256']);
  requireThat(capture.encoding === 'captured-native-request/v1' && (capture.kind === 'receipt' || capture.kind === 'snapshot'));
  text(capture.key); native(capture.native); digest(capture.sha256);
  const ordinal = object(o.ordinalSource, ['native', 'field', 'value']); const historical = native(ordinal.native);
  requireThat(ordinal.field === 'WorkplanVersion'); positive(ordinal.value);

  requireThat(before.state === 'Submitted' && before.transitionStatus === 'Ready' && before.etag === c.expectedControlEtag
    && before.rowVersionToken === c.expectedControlVersion && before.workplanKey === c.expectedWorkplanKey
    && before.currentSubmittedSnapshotKey === c.expectedSubmittedSnapshotKey && !('currentApprovedSnapshotKey' in before)
    && Number(before.rowVersionToken) < Number.MAX_SAFE_INTEGER && before.hierarchyEpoch === before.aclEpoch);
  requireThat(desired.state === 'ChangesRequested' && desired.transitionStatus === 'Ready'
    && desired.rowVersionToken === Number(before.rowVersionToken) + 1 && !('currentApprovedSnapshotKey' in desired));
  ['workplanKey', 'personKey', 'performanceYear', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch', 'currentSubmittedSnapshotKey'].forEach(k =>
    requireThat(before[k] === desired[k] && before[k] === current[k]));
  requireThat(actor.personKey === actor.managerPersonKey && actor.personKey === before.managerPersonKey && actor.subjectPersonKey === before.personKey
    && actor.personKey !== before.personKey && actor.hierarchyEpoch === before.hierarchyEpoch && actor.aclEpoch === before.aclEpoch);
  requireThat(submitted.snapshotKey === before.currentSubmittedSnapshotKey && submitted.sourceSubmittedSnapshotKey === submitted.snapshotKey
    && capture.key === submitted.snapshotKey && submitted.version === ordinal.value
    && ['workplanKey', 'personKey', 'performanceYear'].every(k => submitted[k] === before[k]));
  // Native versions are opaque observations, distinct from logical token and numeric annual ordinal.
  requireThat(sameItem(header, historical) && header.etag === current.etag);
  const stage = phases.indexOf(String(o.phase)); requireThat(stage >= 0 && ['Running', 'Completed', 'RecoveryHold'].includes(String(o.outcome)));
  const count = counts[stage]; requireThat(Array.isArray(o.confirmedEffects) && o.confirmedEffects.length === count);
  const effectKey = (kind: unknown): unknown => kind === 'ReceiptCreate' ? `${o.operationKey}:receipt` : kind === 'Acl' ? o.operationKey : before.workplanKey;
  let latestControl: Fields | undefined;
  (o.confirmedEffects as unknown[]).forEach((value, index) => {
    const effect = object(value, ['kind', 'key', 'bodySha256', 'native']);
    requireThat(effect.kind === plan[index] && effect.key === effectKey(effect.kind)); text(effect.key); digest(effect.bodySha256);
    const observed = native(effect.native); if (mutable(effect.kind)) { requireThat(sameItem(observed, header)); latestControl = observed; }
  });
  requireThat(!('currentApprovedSnapshotKey' in current));
  if (stage < 4) requireThat(current.rowVersionToken === before.rowVersionToken && current.state === 'Submitted'
    && current.transitionStatus === (stage === 0 ? 'Ready' : 'Reviewing'));
  else requireThat(current.state === 'ChangesRequested' && current.transitionStatus === 'Ready'
    && current.rowVersionToken === (stage < 6 ? before.rowVersionToken : desired.rowVersionToken));
  if (latestControl) requireThat(latestControl.etag === header.etag && latestControl.version === header.version);
  if ('lease' in o) { const lease = object(o.lease, ['owner', 'epoch', 'expiresAt']); text(lease.owner); positive(lease.epoch); iso(lease.expiresAt); }
  if ('pendingEffect' in o) {
    const pending = object(o.pendingEffect, ['kind', 'key', 'desiredSha256', 'issuedAt', 'leaseEpoch'], ['expectedEtag']);
    requireThat(count < plan.length && pending.kind === plan[count] && pending.key === effectKey(pending.kind) && !!o.lease);
    text(pending.key); digest(pending.desiredSha256); iso(pending.issuedAt); positive(pending.leaseEpoch);
    // An older dispatched marker remains intact on RecoveryHold; lease expiry is not cancellation.
    requireThat(Number(pending.leaseEpoch) <= Number((o.lease as Fields).epoch));
    if (mutable(pending.kind)) { etag(pending.expectedEtag); requireThat(pending.expectedEtag === current.etag); }
    else requireThat(!('expectedEtag' in pending));
  }
  if (o.outcome === 'RecoveryHold') text(o.holdReason); else requireThat(!('holdReason' in o));
  if (o.outcome === 'Completed' || o.phase === 'Completed') requireThat(o.outcome === 'Completed' && o.phase === 'Completed'
    && !('pendingEffect' in o) && count === 5 && current.rowVersionToken === desired.rowVersionToken);
};

/** Separate fixed v2 codec; a valid frame is not transaction, permission or final-readback proof.
 * Standard SHA256 must hash the returned exact UTF8 bytes, without BOM/newline, outside this codec. */
export const parseRequestChangesJournalV2 = (body: string): RequestChangesJournalV2 => {
  requireThat(typeof body === 'string' && new TextEncoder().encode(body).length <= 56000, 'RequestChangesJournalCapacity');
  let value: unknown; try { value = JSON.parse(body); } catch { throw new RequestChangesJournalErrorV2('InvalidRequestChangesJournalJson'); }
  checkJournal(value); canonicalReviewV1(value); return value as RequestChangesJournalV2;
};
export const encodeRequestChangesJournalV2 = (value: RequestChangesJournalV2): string => {
  checkJournal(value); const body = canonicalReviewV1(value); parseRequestChangesJournalV2(body); return body;
};
