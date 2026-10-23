import type { C2bTerminalReceipt } from '../TestPilotCommandAdmissionC2b';
import { canonicaliseC2b, hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import type { IC2bNativeReceiptProvenance } from '../EmployeeWorkplanV2C2bNativeAdapter';
import type { ITenantProvisioningReceipt } from './BehaviourV2TenantProvisioner';
import { assertC2bBehaviourFocusProvisioningReceiptV2,
  type IC2bBehaviourFocusProvisioningReceiptV2 } from './C2bBehaviourFocusV2Schema';
import { C2B_PROVISIONING_RECEIPT_CHUNK_COUNT, C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION,
  C2B_TERMINAL_RECEIPT_CHUNK_COUNT, C2B_TERMINAL_RECEIPT_STORAGE_VERSION,
  createC2bTerminalReceiptStorageEnvelope, decodeC2bPhysicalChunks, encodeC2bPhysicalChunks,
  type IC2bTerminalReceiptStorageEnvelope } from './C2bPhysicalConvergenceContract';
export interface IC2bPhysicalFieldDefinition { internalName: string; type: 'Text' | 'Note' | 'Choice' | 'Number';
  required: boolean; indexed: boolean; unique: boolean; maxLength?: number; choices?: readonly string[];
  minimum?: number; maximum?: number; plainText?: true; appendOnly?: false; }
const chunks = (prefix: string, count: number): IC2bPhysicalFieldDefinition[] => Array.from({ length: count }, (_, i) => ({
  internalName: `${prefix}${String(i + 1).padStart(2, '0')}`, type: 'Note', required: false,
  indexed: false, unique: false, plainText: true, appendOnly: false }));
export const C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS: readonly IC2bPhysicalFieldDefinition[] = Object.freeze([
  { internalName: 'NativeReceiptPayloadKind', type: 'Choice', required: false, indexed: true, unique: false,
    choices: ['C2bTerminal'] },
  { internalName: 'NativeReceiptContractVersion', type: 'Text', required: false, indexed: false, unique: false, maxLength: 100 },
  { internalName: 'NativeReceiptStateSHA256', type: 'Text', required: false, indexed: true, unique: false, maxLength: 64 },
  { internalName: 'NativeReceiptStateLength', type: 'Number', required: false, indexed: false, unique: false, minimum: 2, maximum: 480000 },
  { internalName: 'NativeReceiptChunkCount', type: 'Number', required: false, indexed: false, unique: false, minimum: 1, maximum: 8 },
  ...chunks('NativeReceiptChunk', 8)
]);
export const C2B_PROVISIONING_RECEIPT_FIELDS: readonly IC2bPhysicalFieldDefinition[] = Object.freeze([
  { internalName: 'ReceiptRevisionKey', type: 'Text', required: true, indexed: true, unique: true, maxLength: 255 },
  { internalName: 'ReceiptKey', type: 'Text', required: true, indexed: true, unique: false, maxLength: 100 },
  { internalName: 'Revision', type: 'Number', required: true, indexed: true, unique: false, minimum: 1, maximum: Number.MAX_SAFE_INTEGER },
  { internalName: 'ReceiptSHA256', type: 'Text', required: true, indexed: true, unique: false, maxLength: 64 },
  { internalName: 'PreviousReceiptSHA256', type: 'Text', required: false, indexed: false, unique: false, maxLength: 64 },
  { internalName: 'Status', type: 'Choice', required: true, indexed: true, unique: false,
    choices: ['InProgress', 'Completed', 'BlockedOff'] },
  { internalName: 'PlanSHA256', type: 'Text', required: true, indexed: true, unique: false, maxLength: 64 },
  { internalName: 'ReceiptStateLength', type: 'Number', required: true, indexed: false, unique: false, minimum: 2, maximum: 960000 },
  { internalName: 'ReceiptChunkCount', type: 'Number', required: true, indexed: false, unique: false, minimum: 1, maximum: 16 },
  ...chunks('ReceiptChunk', 16)
]);
const fail = (code: string): never => { throw new Error(code); };
const exact = (a: unknown, b: unknown, code: string): void => { if (canonicaliseC2b(a) !== canonicaliseC2b(b)) fail(code); };
export function serialiseC2bTerminalReceiptRow(receipt: C2bTerminalReceipt,
  p: IC2bNativeReceiptProvenance): Readonly<Record<string, unknown>> {
  const envelope = createC2bTerminalReceiptStorageEnvelope(receipt, p);
  const state = encodeC2bPhysicalChunks(envelope, 'NativeReceiptChunk', C2B_TERMINAL_RECEIPT_CHUNK_COUNT);
  const accepted = receipt.outcome === 'Accepted';
  return Object.freeze({ Title: receipt.receiptKey, ReceiptKey: receipt.receiptKey, SourceListId: p.source.listId,
    SourceItemId: p.source.itemId, SourceItemVersion: p.source.itemVersion, CommandKey: receipt.commandKey,
    CommandType: p.command.commandType, SubjectType: p.command.subjectType, SubjectKey: p.command.subjectKey,
    PersonKey: p.command.personKey, PerformanceYear: p.command.performanceYear, Quarter: null,
    AuthenticatedActorEmail: p.actor.email.trim().toLowerCase(), AuthenticatedActorPersonKey: p.actor.personKey,
    EffectiveRole: p.actor.effectiveRole, ProcessedByEmail: p.processor.email.trim().toLowerCase(),
    ProcessedAt: p.processor.completedAt, Outcome: receipt.outcome,
    ValidationCode: accepted ? 'C2B_ACCEPTED' : 'C2B_DUPLICATE', Message: accepted ? 'Accepted' : 'Duplicate',
    ProcessedPayloadSHA256: receipt.payloadSha256, ResultKeysJSON: canonicaliseC2b(receipt.resultKeys),
    AuditKeysJSON: canonicaliseC2b(receipt.auditKeys), CorrelationKey: receipt.commandKey,
    FlowRunReference: p.processor.flowRunReference, NativeReceiptPayloadKind: 'C2bTerminal',
    NativeReceiptContractVersion: C2B_TERMINAL_RECEIPT_STORAGE_VERSION,
    NativeReceiptStateSHA256: state.stateSha256, NativeReceiptStateLength: state.stateLength,
    NativeReceiptChunkCount: state.chunkCount, ...state.fields });
}
export function deserialiseC2bTerminalReceiptRow(row: Readonly<Record<string, unknown>>): IC2bTerminalReceiptStorageEnvelope {
  if (row.NativeReceiptPayloadKind !== 'C2bTerminal' || row.NativeReceiptContractVersion !== C2B_TERMINAL_RECEIPT_STORAGE_VERSION)
    return fail('C2B_TERMINAL_RECEIPT_METADATA_INVALID');
  const e = decodeC2bPhysicalChunks(row, 'NativeReceiptChunk', 'NativeReceiptChunkCount', 'NativeReceiptStateLength',
    'NativeReceiptStateSHA256', 8) as IC2bTerminalReceiptStorageEnvelope;
  if (e.contractVersion !== C2B_TERMINAL_RECEIPT_STORAGE_VERSION) fail('C2B_TERMINAL_RECEIPT_TYPE_CONFUSION');
  const mapping: Record<string, unknown> = { ReceiptKey: e.receipt.receiptKey, CommandKey: e.receipt.commandKey,
    SourceListId: e.source.listId, SourceItemId: e.source.itemId, SourceItemVersion: e.source.itemVersion,
    CommandType: e.command.commandType, SubjectType: e.command.subjectType, SubjectKey: e.command.subjectKey,
    PersonKey: e.command.personKey, PerformanceYear: e.command.performanceYear, Quarter: null,
    AuthenticatedActorEmail: e.actor.email.trim().toLowerCase(), AuthenticatedActorPersonKey: e.actor.personKey,
    EffectiveRole: e.actor.effectiveRole, ProcessedByEmail: e.processor.email.trim().toLowerCase(),
    ProcessedAt: e.processor.completedAt, Outcome: e.receipt.outcome,
    ValidationCode: e.receipt.outcome === 'Accepted' ? 'C2B_ACCEPTED' : 'C2B_DUPLICATE',
    Message: e.receipt.outcome, ProcessedPayloadSHA256: e.receipt.payloadSha256,
    ResultKeysJSON: canonicaliseC2b(e.receipt.resultKeys), AuditKeysJSON: canonicaliseC2b(e.receipt.auditKeys),
    CorrelationKey: e.receipt.commandKey, FlowRunReference: e.processor.flowRunReference };
  Object.keys(mapping).forEach(k => exact(row[k], mapping[k], 'C2B_TERMINAL_RECEIPT_COLUMN_MISMATCH'));
  return e;
}
export const tenantProvisioningRevisionKey = (r: ITenantProvisioningReceipt): string =>
  `${r.receiptKey}|R${String(r.revision).padStart(6, '0')}|${r.receiptSha256}`;
export function serialiseTenantProvisioningReceiptRow(r: ITenantProvisioningReceipt): Readonly<Record<string, unknown>> {
  const state = encodeC2bPhysicalChunks(r, 'ReceiptChunk', C2B_PROVISIONING_RECEIPT_CHUNK_COUNT);
  const key = tenantProvisioningRevisionKey(r);
  if (!/^tenant-provision\|[0-9A-F]{64}$/i.test(r.receiptKey) || key.length > 255) fail('TENANT_RECEIPT_PHYSICAL_KEY_INVALID');
  return Object.freeze({ Title: key, ReceiptRevisionKey: key, ReceiptKey: r.receiptKey, Revision: r.revision,
    ReceiptSHA256: r.receiptSha256, PreviousReceiptSHA256: r.previousReceiptSha256, Status: r.status,
    PlanSHA256: r.planSha256, ReceiptStateLength: state.stateLength, ReceiptChunkCount: state.chunkCount, ...state.fields });
}
export function deserialiseTenantProvisioningReceiptRow(row: Readonly<Record<string, unknown>>): ITenantProvisioningReceipt {
  const r = (decodeC2bPhysicalChunks(row, 'ReceiptChunk', 'ReceiptChunkCount', 'ReceiptStateLength',
    null, 16) as ITenantProvisioningReceipt);
  const expected = serialiseTenantProvisioningReceiptRow(r);
  ['Title', 'ReceiptRevisionKey', 'ReceiptKey', 'Revision', 'ReceiptSHA256', 'PreviousReceiptSHA256', 'Status',
    'PlanSHA256', 'ReceiptStateLength', 'ReceiptChunkCount'].forEach(k => exact(row[k], expected[k], 'TENANT_RECEIPT_PHYSICAL_COLUMN_MISMATCH'));
  const unsigned = Object.keys(r).filter(k => k !== 'receiptSha256').reduce<Record<string, unknown>>((v, k) => {
    v[k] = r[k as keyof ITenantProvisioningReceipt]; return v;
  }, {});
  if (r.receiptSchemaVersion !== 'kcf.kpi.wib12.provisioning-receipt.v1' || hashC2bCanonical(unsigned) !== r.receiptSha256)
    fail('TENANT_RECEIPT_PHYSICAL_SELF_HASH_INVALID');
  return r;
}
export { C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION };

/** Append-only v2 receipt row; a prior v1 receipt hash is mandatory and never overwritten. */
export function serialiseBehaviourFocusV2ProvisioningReceiptRow(
  input: IC2bBehaviourFocusProvisioningReceiptV2
): Readonly<Record<string, unknown>> {
  const receipt = assertC2bBehaviourFocusProvisioningReceiptV2(input);
  const state = encodeC2bPhysicalChunks(receipt, 'ReceiptChunk', C2B_PROVISIONING_RECEIPT_CHUNK_COUNT);
  const key = `${receipt.receiptKey}|R${String(receipt.revision).padStart(6, '0')}|${receipt.receiptSha256}`;
  if (key.length > 255) fail('TENANT_FOCUS_V2_RECEIPT_KEY_INVALID');
  return Object.freeze({ Title: key, ReceiptRevisionKey: key, ReceiptKey: receipt.receiptKey,
    Revision: receipt.revision, ReceiptSHA256: receipt.receiptSha256,
    PreviousReceiptSHA256: receipt.previousReceiptSha256, Status: receipt.status,
    PlanSHA256: receipt.planSha256, ReceiptStateLength: state.stateLength,
    ReceiptChunkCount: state.chunkCount, ...state.fields });
}

export function deserialiseBehaviourFocusV2ProvisioningReceiptRow(
  row: Readonly<Record<string, unknown>>
): IC2bBehaviourFocusProvisioningReceiptV2 {
  const receipt = decodeC2bPhysicalChunks(row, 'ReceiptChunk', 'ReceiptChunkCount',
    'ReceiptStateLength', null, C2B_PROVISIONING_RECEIPT_CHUNK_COUNT) as IC2bBehaviourFocusProvisioningReceiptV2;
  const expected = serialiseBehaviourFocusV2ProvisioningReceiptRow(receipt);
  ['Title', 'ReceiptRevisionKey', 'ReceiptKey', 'Revision', 'ReceiptSHA256',
    'PreviousReceiptSHA256', 'Status', 'PlanSHA256', 'ReceiptStateLength', 'ReceiptChunkCount']
    .forEach(field => exact(row[field], expected[field], 'TENANT_FOCUS_V2_RECEIPT_COLUMN_MISMATCH'));
  return receipt;
}
