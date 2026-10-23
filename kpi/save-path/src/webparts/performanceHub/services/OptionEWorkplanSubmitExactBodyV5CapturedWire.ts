import {
  V5_CAPTURE_ENCODING, V5_MAX_BYTES, type V5Admission, type V5JournalOperation, type V5Snapshot, type V5Receipt,
  type V5CapturedAdmission, type V5CapturedJournalOperation, type V5CapturedSnapshot, type V5CapturedReceipt
} from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import { assertV4Schema, BufferByteLength, parseV4Canonical } from './OptionEWorkplanSubmitExactBodyV4Wire';
import {
  v5Canonical, parseV5Request, parseV5ReferenceSet, validateV5AdmissionView, validateV5JournalOperationView,
  validateV5SnapshotView, validateV5ReceiptView, V5_CAPTURED_ADMISSION_SCHEMA, V5_CAPTURED_JOURNAL_SCHEMA,
  V5_CAPTURED_SNAPSHOT_SCHEMA, V5_CAPTURED_RECEIPT_SCHEMA
} from './OptionEWorkplanSubmitExactBodyV5Wire';

/** Source-only r3 codec. Neither parsing nor encoding establishes protected origin or immutable replay.
 * Paired parsers return a fresh expanded logical view; only paired encoder strings are r3 storage bytes.
 * No historical r2 auto-detection, native binding, hashing, effects or current-configuration lookup.
 */
const captured = <T>(body: string, schema: object): T => {
  if (typeof body !== 'string' || BufferByteLength(body) > V5_MAX_BYTES) throw new Error('ExactBodyV5CapturedWireInvalid');
  const value = parseV4Canonical(body); assertV4Schema(value, schema); return value as T;
};
const factorAdmission = (value: V5Admission): V5CapturedAdmission => {
  const a = value.authority, r = a.request;
  return { contract: value.contract, encoding: V5_CAPTURE_ENCODING, capability: value.capability,
    key: value.key, eventAt: value.eventAt, authority: { contract: a.contract,
      request: { itemId: r.itemId, etag: r.etag, version: r.version, createdBy: r.createdBy, body: r.body },
      actor: a.actor, manager: a.manager, control: a.control, workplan: a.workplan } };
};
const expandAdmission = (value: V5CapturedAdmission): V5Admission => {
  const a = value.authority, query = parseV5Request(a.request.body);
  return { contract: value.contract, capability: value.capability, key: value.key, eventAt: value.eventAt,
    authority: { ...a, request: { ...a.request, query }, draft: query.source,
      references: parseV5ReferenceSet(query.referenceBody) } };
};
const factorSnapshot = (value: V5Snapshot): V5CapturedSnapshot => ({ ...value, admission: factorAdmission(value.admission) });
const expandSnapshot = (value: V5CapturedSnapshot): V5Snapshot => ({ ...value, admission: expandAdmission(value.admission) });

/** Validate the COMPLETE observed view before removing any redundant observation. */
export function encodeV5CapturedAdmission(value: V5Admission): string {
  validateV5AdmissionView(value);
  const body = v5Canonical(factorAdmission(value)); parseV5CapturedAdmission(body); return body;
}
export function parseV5CapturedAdmission(body: string): V5Admission {
  return validateV5AdmissionView(expandAdmission(captured<V5CapturedAdmission>(body, V5_CAPTURED_ADMISSION_SCHEMA)));
}
export function encodeV5CapturedJournalOperation(value: V5JournalOperation): string {
  validateV5JournalOperationView(value);
  const frame: V5CapturedJournalOperation = { ...value, admission: factorAdmission(value.admission) };
  const body = v5Canonical(frame); parseV5CapturedJournalOperation(body); return body;
}
export function parseV5CapturedJournalOperation(body: string): V5JournalOperation {
  const frame = captured<V5CapturedJournalOperation>(body, V5_CAPTURED_JOURNAL_SCHEMA);
  return validateV5JournalOperationView({ ...frame, admission: expandAdmission(frame.admission) });
}
export function encodeV5CapturedSnapshot(value: V5Snapshot): string {
  validateV5SnapshotView(value);
  const body = v5Canonical(factorSnapshot(value)); parseV5CapturedSnapshot(body); return body;
}
export function parseV5CapturedSnapshot(body: string): V5Snapshot {
  return validateV5SnapshotView(expandSnapshot(captured<V5CapturedSnapshot>(body, V5_CAPTURED_SNAPSHOT_SCHEMA)));
}
export function encodeV5CapturedReceipt(value: V5Receipt): string {
  validateV5ReceiptView(value);
  const frame: V5CapturedReceipt = { ...value, snapshot: factorSnapshot(value.snapshot) };
  const body = v5Canonical(frame); parseV5CapturedReceipt(body); return body;
}
export function parseV5CapturedReceipt(body: string): V5Receipt {
  const frame = captured<V5CapturedReceipt>(body, V5_CAPTURED_RECEIPT_SCHEMA);
  return validateV5ReceiptView({ ...frame, snapshot: expandSnapshot(frame.snapshot) });
}
