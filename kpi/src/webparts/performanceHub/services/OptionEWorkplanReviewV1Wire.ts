import type { ReviewCommandV1, ReviewApprovedV1, ReviewReceiptV1, ReviewJournalV1 } from '../models/OptionEWorkplanReviewV1Models';
import { v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
export class ReviewFrameErrorV1 extends Error {
  public constructor(public readonly code: string) { super(code); Object.setPrototypeOf(this, ReviewFrameErrorV1.prototype); }
}
const requireThat = (ok: boolean, code = 'InvalidReviewFrame'): void => { if (!ok) throw new ReviewFrameErrorV1(code); };
type Fields = { [key: string]: unknown }; // Validation view only, never a persisted field bag.
const object = (v: unknown, required: string[], optional: string[] = []): Fields => {
  requireThat(typeof v === 'object' && v !== null && !Array.isArray(v)); const o = v as Fields;
  requireThat(required.every(k => Object.prototype.hasOwnProperty.call(o, k)) && Object.keys(o).every(k => required.includes(k) || optional.includes(k))); return o;
};
const text = (v: unknown): void => requireThat(typeof v === 'string' && !!v.trim());
const positive = (v: unknown): void => requireThat(typeof v === 'number' && Number.isSafeInteger(v) && v > 0);
const digest = (v: unknown): void => requireThat(typeof v === 'string' && /^[0-9A-F]{64}$/.test(v));
const etag = (v: unknown): void => requireThat(typeof v === 'string' && v4Etag(v));
const uuid = (v: unknown): void => requireThat(typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v));
const iso = (v: unknown): void => requireThat(typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
const year = (v: unknown): void => requireThat(typeof v === 'number' && Number.isSafeInteger(v) && v >= 2000 && v <= 9999);
const native = (v: unknown): void => {
  const o = object(v, ['siteId', 'webId', 'listId', 'itemId', 'version', 'etag']); ['siteId', 'webId', 'listId', 'version'].forEach(k => text(o[k])); positive(o.itemId); etag(o.etag);
};
const managerSource = (v: unknown): void => { const o = object(v, ['native', 'bodySha256']); native(o.native); digest(o.bodySha256); };
const capture = (v: unknown): void => {
  const o = object(v, ['encoding', 'kind', 'key', 'native', 'sha256']); requireThat(o.encoding === 'captured-native-request/v1' && ['receipt', 'snapshot'].includes(String(o.kind))); text(o.key); native(o.native); digest(o.sha256);
};
const ordinal = (v: unknown): void => { const o = object(v, ['native', 'field', 'value']); native(o.native); requireThat(o.field === 'WorkplanVersion'); positive(o.value); };
const controlFields = ['workplanKey', 'personKey', 'performanceYear', 'state', 'transitionStatus', 'rowVersionToken', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch'];
const control = (v: unknown, desired = false): Fields => {
  const o = object(v, [...controlFields, ...(desired ? [] : ['etag'])], ['currentSubmittedSnapshotKey', 'currentApprovedSnapshotKey']);
  ['workplanKey', 'personKey', 'managerPersonKey'].forEach(k => text(o[k])); year(o.performanceYear); ['rowVersionToken', 'hierarchyEpoch', 'aclEpoch'].forEach(k => positive(o[k]));
  requireThat(['Draft', 'ChangesRequested', 'Submitted', 'Approved', 'Locked'].includes(String(o.state)) && ['Ready', 'Submitting', 'Reviewing', 'RecoveryHold'].includes(String(o.transitionStatus)));
  if (!desired) etag(o.etag); ['currentSubmittedSnapshotKey', 'currentApprovedSnapshotKey'].forEach(k => { if (k in o) text(o[k]); }); return o;
};
const snapshot = (v: unknown): Fields => {
  const o = object(v, ['snapshotKey', 'workplanKey', 'personKey', 'performanceYear', 'version', 'payloadSha256', 'sourceSubmittedSnapshotKey', 'immutable']);
  ['snapshotKey', 'workplanKey', 'personKey', 'sourceSubmittedSnapshotKey'].forEach(k => text(o[k])); year(o.performanceYear); positive(o.version); digest(o.payloadSha256); requireThat(o.immutable === true); return o;
};
const command = (v: unknown): Fields => {
  const o = object(v, ['schemaVersion', 'commandKey', 'command', 'expectedWorkplanKey', 'expectedControlEtag', 'expectedControlVersion', 'expectedSubmittedSnapshotKey'], ['reason']);
  requireThat(o.schemaVersion === 'kcf.kpi.option-e.review-command/v1'); uuid(o.commandKey); ['expectedWorkplanKey', 'expectedSubmittedSnapshotKey'].forEach(k => text(o[k])); etag(o.expectedControlEtag); positive(o.expectedControlVersion);
  requireThat(o.command === 'RequestChanges' || o.command === 'ApproveLock'); if (o.command === 'RequestChanges') text(o.reason); else requireThat(!('reason' in o)); return o;
};
const approved = (v: unknown): void => {
  const o = object(v, ['schemaVersion', 'commandKey', 'approved', 'sourceCapture', 'ordinalSource']); requireThat(o.schemaVersion === 'kcf.kpi.option-e.review-approved/v1'); uuid(o.commandKey);
  const s = snapshot(o.approved); capture(o.sourceCapture); ordinal(o.ordinalSource);
  requireThat(s.snapshotKey === `oe-review:${o.commandKey}:approved` && s.sourceSubmittedSnapshotKey === (o.sourceCapture as Fields).key && s.version === (o.ordinalSource as Fields).value);
};
const receipt = (v: unknown): void => {
  const o = object(v, ['schemaVersion', 'receipt', 'commandSource', 'sourceCapture'], ['approvedReference', 'reason']); requireThat(o.schemaVersion === 'kcf.kpi.option-e.review-receipt/v1'); managerSource(o.commandSource); capture(o.sourceCapture);
  const r = object(o.receipt, ['receiptKey', 'commandKey', 'command', 'workplanKey', 'actorPersonKey', 'submittedSnapshotKey', 'controlVersionBefore', 'controlVersionAfter', 'processorIdentity', 'auditKey'], ['approvedSnapshotKey']);
  uuid(r.commandKey); ['workplanKey', 'actorPersonKey', 'submittedSnapshotKey', 'processorIdentity'].forEach(k => text(r[k])); positive(r.controlVersionBefore); positive(r.controlVersionAfter);
  requireThat(r.receiptKey === `oe-review:${r.commandKey}:receipt` && r.auditKey === r.receiptKey && r.controlVersionAfter === Number(r.controlVersionBefore) + 1 && r.submittedSnapshotKey === (o.sourceCapture as Fields).key);
  if (r.command === 'ApproveLock') { requireThat(!('reason' in o) && r.approvedSnapshotKey === `oe-review:${r.commandKey}:approved`); const a = object(o.approvedReference, ['key', 'native', 'sha256']); native(a.native); digest(a.sha256); requireThat(a.key === r.approvedSnapshotKey); }
  else { requireThat(r.command === 'RequestChanges' && !('approvedReference' in o) && !('approvedSnapshotKey' in r)); text(o.reason); }
};
const kinds = ['ControlClaim', 'ApprovedCreate', 'ReceiptCreate', 'Acl', 'ControlRelease'];
const phases = ['Validated', 'ControlClaimed', 'ApprovedWritten', 'DecisionRecorded', 'AclVerified', 'ControlReleased', 'Completed'];
const journal = (v: unknown): void => {
  const o = object(v, ['schemaVersion', 'operationKey', 'journalRevision', 'command', 'commandSource', 'actorBinding', 'before', 'currentControl', 'headerNative', 'desired', 'submitted', 'sourceCapture', 'ordinalSource', 'phase', 'outcome', 'confirmedEffects'], ['lease', 'pendingEffect', 'holdReason']);
  requireThat(o.schemaVersion === 'kcf.kpi.option-e.review-journal/v1'); const c = command(o.command); managerSource(o.commandSource); requireThat(o.operationKey === `oe-review:${c.commandKey}` && String(o.operationKey).length <= 255); positive(o.journalRevision);
  const a = object(o.actorBinding, ['personKey', 'principalId', 'email', 'personNative', 'subjectPersonKey', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch']); ['personKey', 'email', 'subjectPersonKey', 'managerPersonKey'].forEach(k => text(a[k])); ['principalId', 'hierarchyEpoch', 'aclEpoch'].forEach(k => positive(a[k])); native(a.personNative); native(o.headerNative);
  const b = control(o.before), current = control(o.currentControl), d = control(o.desired, true), s = snapshot(o.submitted); capture(o.sourceCapture); ordinal(o.ordinalSource);
  requireThat(b.state === 'Submitted' && b.transitionStatus === 'Ready' && b.etag === c.expectedControlEtag && b.rowVersionToken === c.expectedControlVersion && b.workplanKey === c.expectedWorkplanKey && b.currentSubmittedSnapshotKey === c.expectedSubmittedSnapshotKey && !('currentApprovedSnapshotKey' in b)
    && Number(b.rowVersionToken) < Number.MAX_SAFE_INTEGER && d.rowVersionToken === Number(b.rowVersionToken) + 1 && d.state === (c.command === 'ApproveLock' ? 'Locked' : 'ChangesRequested') && d.transitionStatus === 'Ready');
  for (const k of ['workplanKey', 'personKey', 'performanceYear', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch', 'currentSubmittedSnapshotKey']) requireThat(b[k] === d[k] && b[k] === current[k]);
  requireThat(a.personKey === a.managerPersonKey && a.personKey === b.managerPersonKey && a.subjectPersonKey === b.personKey && a.personKey !== b.personKey && a.hierarchyEpoch === b.hierarchyEpoch && a.aclEpoch === b.aclEpoch);
  requireThat(s.snapshotKey === b.currentSubmittedSnapshotKey && s.sourceSubmittedSnapshotKey === s.snapshotKey && (o.sourceCapture as Fields).key === s.snapshotKey && s.version === (o.ordinalSource as Fields).value && ['workplanKey', 'personKey', 'performanceYear'].every(k => s[k] === b[k]));
  requireThat(c.command === 'ApproveLock' ? d.currentApprovedSnapshotKey === `oe-review:${c.commandKey}:approved` : !('currentApprovedSnapshotKey' in d)); requireThat(phases.includes(String(o.phase)) && ['Running', 'Completed', 'RecoveryHold'].includes(String(o.outcome)));
  requireThat(Array.isArray(o.confirmedEffects)); let last = -1;
  const plan = c.command === 'ApproveLock' ? kinds : kinds.filter(k => k !== 'ApprovedCreate');
  const stage = phases.indexOf(String(o.phase)), expectedCount = c.command === 'ApproveLock' ? Math.min(stage, 5) : Math.max(0, Math.min(stage, 5) - (stage >= 2 ? 1 : 0));
  requireThat((o.confirmedEffects as unknown[]).length === expectedCount);
  const effectKey = (kind: unknown): unknown => kind === 'ApprovedCreate' ? `${o.operationKey}:approved` : kind === 'ReceiptCreate' ? `${o.operationKey}:receipt` : kind === 'Acl' ? o.operationKey : b.workplanKey;
  (o.confirmedEffects as unknown[]).forEach((e, i) => { const f = object(e, ['kind', 'key', 'bodySha256', 'native']); const index = kinds.indexOf(String(f.kind)); requireThat(index > last && f.kind === plan[i] && f.key === effectKey(f.kind)); last = index; text(f.key); digest(f.bodySha256); native(f.native); });
  if (stage < 5) requireThat(current.rowVersionToken === b.rowVersionToken && current.state === 'Submitted' && current.transitionStatus === (stage === 0 ? 'Ready' : 'Reviewing') && !('currentApprovedSnapshotKey' in current));
  else requireThat(current.rowVersionToken === d.rowVersionToken && current.state === d.state && current.transitionStatus === 'Ready' && current.currentApprovedSnapshotKey === d.currentApprovedSnapshotKey);
  if ('lease' in o) { const l = object(o.lease, ['owner', 'epoch', 'expiresAt']); text(l.owner); positive(l.epoch); iso(l.expiresAt); }
  if ('pendingEffect' in o) { const p = object(o.pendingEffect, ['kind', 'key', 'desiredSha256', 'issuedAt', 'leaseEpoch'], ['expectedEtag']); requireThat(p.kind === plan[expectedCount] && p.key === effectKey(p.kind) && !!o.lease && Number(p.leaseEpoch) <= Number((o.lease as Fields).epoch)); text(p.key); digest(p.desiredSha256); iso(p.issuedAt); positive(p.leaseEpoch); if (p.kind === 'ControlClaim' || p.kind === 'ControlRelease') etag(p.expectedEtag); else requireThat(!('expectedEtag' in p)); }
  if (o.outcome === 'RecoveryHold') text(o.holdReason); else requireThat(!('holdReason' in o));
  if (o.outcome === 'Completed' || o.phase === 'Completed') requireThat(o.outcome === 'Completed' && o.phase === 'Completed' && !('pendingEffect' in o) && last === 4 && current.state === d.state && current.transitionStatus === 'Ready' && current.rowVersionToken === d.rowVersionToken);
};
/** Ordinary fixed-frame encoding; raw command/capture strings are hashed unchanged elsewhere. */
export const canonicalReviewV1 = (value: unknown): string => {
  const sorted = (v: unknown): unknown => {
    if (typeof v === 'string' || typeof v === 'boolean') return v; if (typeof v === 'number') { requireThat(Number.isFinite(v)); return v; }
    requireThat(typeof v === 'object' && v !== null); if (Array.isArray(v)) return v.map(sorted);
    const result: Fields = {}; for (const k of Object.keys(v as Fields).sort()) result[k] = sorted((v as Fields)[k]); return result;
  }; return JSON.stringify(sorted(value));
};
const parse = (body: string, check: (v: unknown) => unknown): unknown => {
  requireThat(typeof body === 'string' && new TextEncoder().encode(body).length <= 56000, 'ReviewFrameCapacity'); let v: unknown;
  try { v = JSON.parse(body); } catch { throw new ReviewFrameErrorV1('InvalidReviewJson'); } check(v); canonicalReviewV1(v); return v;
};
const encode = (v: unknown, check: (v: unknown) => unknown): string => { check(v); const body = canonicalReviewV1(v); parse(body, check); return body; };
export const encodeReviewCommandV1 = (v: ReviewCommandV1): string => encode(v, command);
export const parseReviewCommandV1 = (body: string): ReviewCommandV1 => parse(body, command) as ReviewCommandV1;
export const encodeReviewApprovedV1 = (v: ReviewApprovedV1): string => encode(v, approved);
export const parseReviewApprovedV1 = (body: string): ReviewApprovedV1 => parse(body, approved) as ReviewApprovedV1;
export const encodeReviewReceiptV1 = (v: ReviewReceiptV1): string => encode(v, receipt);
export const parseReviewReceiptV1 = (body: string): ReviewReceiptV1 => parse(body, receipt) as ReviewReceiptV1;
export const encodeReviewJournalV1 = (v: ReviewJournalV1): string => encode(v, journal);
export const parseReviewJournalV1 = (body: string): ReviewJournalV1 => parse(body, journal) as ReviewJournalV1;
