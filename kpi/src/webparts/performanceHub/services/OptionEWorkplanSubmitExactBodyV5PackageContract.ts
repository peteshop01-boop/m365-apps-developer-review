import { EXACT_BODY_V5, V5_MAX_BYTES, V5_OPERATION_CONTRACT, type V5Admission, type V5JournalOperation,
  type V5Snapshot, type V5Store, type V5Receipt } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { V5CapturedBytePort, V5Capacity } from '../models/OptionEWorkplanSubmitExactBodyV5ExecutionModels';
import { BufferByteLength, v4Equal, v4ExactKeys, v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { encodeV5CapturedAdmission, parseV5CapturedAdmission, encodeV5CapturedJournalOperation,
  parseV5CapturedJournalOperation, encodeV5CapturedSnapshot, parseV5CapturedSnapshot,
  encodeV5CapturedReceipt, parseV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';

export const V5_EXECUTION_DECLARATION = {
  capability: EXACT_BODY_V5, encoding: 'captured-native-request/v1', maxUtf8Bytes: V5_MAX_BYTES,
  state: 'Disabled', binding: 'Unbound', readiness: 'NOT_ADMITTED', purpose: 'SyntheticSourceOnly'
} as const;
export const v5InstalledReadiness = (_binding: unknown): 'NOT_ADMITTED' => 'NOT_ADMITTED';
export function validateV5SourceDomainBinding(binding: unknown): asserts binding is V5Store['binding'] {
  v4ExactKeys(binding, ['kind', 'capability', 'protectedOrigin', 'principals']);
  if (binding.kind !== 'domain-test' || binding.protectedOrigin !== true || !v4Equal(binding.capability, EXACT_BODY_V5)) {
    throw new Error('BindingProtocolNotAdmitted');
  }
  v4ExactKeys(binding.principals, ['content', 'acl', 'recovery']);
  const values = Object.values(binding.principals);
  if (!values.every(value => typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    || new Set(values).size !== 3) throw new Error('BindingPrincipalTypes');
}
export const v5SnapshotFor = (admission: V5Admission): V5Snapshot => ({
  contract: EXACT_BODY_V5.storage, key: admission.key, admission, body: admission.authority.draft.body
});

/** Complete real codec sizing before the first effect. The representative date is sizing only.
 * This does not establish capacity for a later, longer returned ETag or hold reason: each write
 * below is encoded again with the exact proposed fields before invoking its byte-port effect.
 */
export function measureV5Capacity(admission: V5Admission, operationEtag = '"sizing-only"'): V5Capacity {
  const { etag, ...after } = admission.authority.control;
  const journal: V5JournalOperation = { contract: V5_OPERATION_CONTRACT, admission, checkpoint: 'Validated',
    outcome: 'Running', etag: operationEtag, controlReadback: admission.authority.control,
    controlIntent: { before: { ...after, etag }, after: { ...after, transition: 'Submitting', command: admission.key } } };
  const snapshot = v5SnapshotFor(admission);
  const sizingReceipt: V5Receipt = { contract: EXACT_BODY_V5.receipt, key: admission.key, snapshot,
    nativeCreated: admission.eventAt }; // Fixed-width valid UTC representative; never sent to createReceipt.
  return { request: BufferByteLength(admission.authority.request.body),
    references: BufferByteLength(admission.authority.request.query.referenceBody),
    admission: BufferByteLength(encodeV5CapturedAdmission(admission)),
    journal: BufferByteLength(encodeV5CapturedJournalOperation(journal)),
    snapshot: BufferByteLength(encodeV5CapturedSnapshot(snapshot)), receipt: BufferByteLength(encodeV5CapturedReceipt(sizingReceipt)) };
}

/** Logical-domain adapter over synthetic encoded storage. It never serialises expanded views. */
export function createV5CapturedDomainStore(port: V5CapturedBytePort): V5Store {
  validateV5SourceDomainBinding(port.binding);
  const methods: (keyof V5CapturedBytePort)[] = ['readAuthority', 'nextOperationEtag', 'readOperation', 'createOperation',
    'replaceOperation', 'readControl', 'casControl', 'readSnapshot', 'createSnapshot', 'readReceipt', 'createReceipt',
    'expectedAcl', 'readAcl', 'applyAcl', 'now'];
  if (methods.some(name => typeof port[name] !== 'function')) throw new Error('IncompleteSyntheticBytePort');
  const readOperation = async (key: string): Promise<V5JournalOperation | undefined> => {
    const body = await port.readOperation(key);
    const operation = body === undefined ? undefined : parseV5CapturedJournalOperation(body);
    if (operation && operation.admission.key !== key) throw new Error('OperationKeyMismatch');
    return operation;
  };
  const nextEtag = async (key: string, old?: string): Promise<string> => {
    const value = await port.nextOperationEtag(key, old);
    if (!v4Etag(value) || value === old) throw new Error('SyntheticOperationETagInvalid');
    return value;
  };
  const write = async (key: string, exactEtag: string, mutate: (current: V5JournalOperation) => V5JournalOperation): Promise<V5JournalOperation> => {
    const current = await readOperation(key);
    if (!v4Etag(exactEtag) || !current || current.etag !== exactEtag) throw new Error('ExactOperationETagMismatch');
    const next = { ...mutate(current), etag: await nextEtag(key, exactEtag) };
    const body = encodeV5CapturedJournalOperation(next); // Includes full intent/reason/new ETag before effect.
    try { await port.replaceOperation(key, exactEtag, body); } catch { /* Sole resolution is full durable readback. */ }
    const readback = await readOperation(key);
    if (!readback || !v4Equal(readback, next)) throw new Error('ExactOperationWriteReadback');
    return readback;
  };
  return {
    binding: port.binding, readAuthority: key => port.readAuthority(key), readOperation,
    createOperation: async admission => {
      const admissionBody = encodeV5CapturedAdmission(admission);
      const captured = parseV5CapturedAdmission(admissionBody);
      const etag = await nextEtag(admission.key);
      measureV5Capacity(captured, etag);
      const operation: V5JournalOperation = { contract: V5_OPERATION_CONTRACT, admission: captured,
        checkpoint: 'Validated', outcome: 'Running', etag, controlReadback: captured.authority.control };
      const body = encodeV5CapturedJournalOperation(operation);
      try { await port.createOperation(admissionBody, body); } catch { /* No second create. */ }
      const readback = await readOperation(admission.key);
      if (!readback || !v4Equal(readback, operation)) throw new Error('ExactOperationCreateReadback');
      return readback;
    },
    advance: (key, etag, checkpoint, controlReadback) => write(key, etag, current => ({
      contract: current.contract, admission: current.admission, checkpoint, etag: current.etag,
      outcome: checkpoint === 'Completed' ? 'Completed' : 'Running', controlReadback
    })),
    prepareControl: async (key, etag, controlIntent) => { await write(key, etag, current => ({ ...current, controlIntent })); },
    hold: async (key, etag, holdReason) => { await write(key, etag, current => ({ ...current, outcome: 'RecoveryHold', holdReason })); },
    readControl: key => port.readControl(key), casControl: (key, etag, next) => port.casControl(key, etag, next),
    readSnapshot: async key => { const body = await port.readSnapshot(key); return body === undefined ? undefined : parseV5CapturedSnapshot(body); },
    createSnapshot: snapshot => port.createSnapshot(encodeV5CapturedSnapshot(snapshot)),
    readReceipt: async key => { const body = await port.readReceipt(key); return body === undefined ? undefined : parseV5CapturedReceipt(body); },
    createReceipt: async receipt => {
      if (receipt.contract !== EXACT_BODY_V5.receipt || receipt.key !== receipt.snapshot.key) throw new Error('ReceiptCreationIdentity');
      measureV5Capacity(receipt.snapshot.admission);
      await port.createReceipt(encodeV5CapturedSnapshot(receipt.snapshot));
    },
    expectedAcl: admission => port.expectedAcl(parseV5CapturedAdmission(encodeV5CapturedAdmission(admission))),
    readAcl: key => port.readAcl(key),
    applyAcl: admission => port.applyAcl(parseV5CapturedAdmission(encodeV5CapturedAdmission(admission))),
    now: () => port.now()
  };
}
