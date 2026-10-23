import { EXACT_BODY_V4, V4_CHECKPOINTS } from './OptionEWorkplanSubmitExactBodyV4Models';
import { OPTION_E_DRAFT_V2_WIRE_VERSION } from './OptionEWorkplanDraftV2Models';
import {
  EXACT_BODY_V5, V5_MAX_BYTES, V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT,
  V5_OPERATION_CONTRACT, V5_DELIVERY_READER_CONTRACT, V5_TAXONOMY_READER_CONTRACT, V5_CHECKPOINTS,
  type V5Snapshot, type V5Receipt
} from './OptionEWorkplanSubmitExactBodyV5Models';

test('V5 negotiates separate protocol/storage/receipt identifiers and the frozen DraftV2 wire', () => {
  expect(EXACT_BODY_V5).toEqual({ protocol: 'kcf.kpi.option-e.submit.v5', integrity: 'exact-body/v1',
    wire: 'canonical-draft/v2', storage: 'kcf.kpi.option-e.storage.v5', receipt: 'immutable-receipt/v5' });
  expect(EXACT_BODY_V5.wire).toBe(OPTION_E_DRAFT_V2_WIRE_VERSION);
  expect(EXACT_BODY_V4).toEqual({ protocol: 'kcf.kpi.option-e.submit.v4', integrity: 'exact-body/v1',
    wire: 'canonical-draft/v1', storage: 'kcf.kpi.option-e.storage.v4', receipt: 'immutable-receipt/v4' });
});
test('all stored-frame tags are distinct and explicitly versioned', () => {
  expect([V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT, V5_OPERATION_CONTRACT]).toEqual([
    'kcf.kpi.option-e.references.v5', 'kcf.kpi.option-e.authority.v5', 'kcf.kpi.option-e.admission.v5', 'kcf.kpi.option-e.operation.v5'
  ]);
  expect(new Set([V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT, V5_OPERATION_CONTRACT,
    EXACT_BODY_V5.storage, EXACT_BODY_V5.receipt]).size).toBe(6);
});
test('new PD reader purposes remain distinct', () => {
  expect(V5_DELIVERY_READER_CONTRACT).toBe('kcf.option-e.delivery-publication-exact-body-reader/v1');
  expect(V5_TAXONOMY_READER_CONTRACT).toBe('kcf.option-e.impact-taxonomy-exact-body-reader/v1');
  expect(V5_DELIVERY_READER_CONTRACT as string).not.toBe(V5_TAXONOMY_READER_CONTRACT);
});
test('retains the existing byte limit and checkpoint sequence without sharing the array', () => {
  expect(V5_MAX_BYTES).toBe(56000);
  expect(V5_CHECKPOINTS).toEqual(['Validated', 'ControlClaimed', 'SnapshotWritten', 'AuditWritten', 'ControlPointed', 'AclVerified', 'Completed']);
  expect(V5_CHECKPOINTS).toEqual(V4_CHECKPOINTS);
  expect(V5_CHECKPOINTS).not.toBe(V4_CHECKPOINTS);
});
test('unadmitted V5 r2 types retain one complete admission and no redundant reference body', () => {
  const snapshotKeys: Record<keyof V5Snapshot, true> = { contract: true, key: true, admission: true, body: true };
  const receiptKeys: Record<keyof V5Receipt, true> = { contract: true, key: true, snapshot: true, nativeCreated: true };
  expect(Object.keys(snapshotKeys).sort()).toEqual(['admission', 'body', 'contract', 'key']);
  expect(Object.keys(receiptKeys).sort()).toEqual(['contract', 'key', 'nativeCreated', 'snapshot']);
});
