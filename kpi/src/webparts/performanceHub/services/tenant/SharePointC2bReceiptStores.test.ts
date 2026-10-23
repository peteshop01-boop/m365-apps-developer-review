import type { C2bTerminalReceipt } from '../TestPilotCommandAdmissionC2b';
import { canonicaliseC2b, hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import type { IC2bNativeReceiptProvenance } from '../EmployeeWorkplanV2C2bNativeAdapter';
import type { ITenantProvisioningReceipt } from './BehaviourV2TenantProvisioner';
import { C2B_PROVISIONING_RECEIPT_FIELDS, C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS,
  deserialiseC2bTerminalReceiptRow, deserialiseTenantProvisioningReceiptRow,
  serialiseC2bTerminalReceiptRow, serialiseTenantProvisioningReceiptRow,
  tenantProvisioningRevisionKey } from './SharePointC2bReceiptStores';

const terminal = (padding: number = 0): C2bTerminalReceipt => ({ receiptKey: 'COMMAND-1', commandKey: 'COMMAND-1',
  outcome: 'Accepted', planSha256: 'B'.repeat(64), payloadSha256: 'A'.repeat(64), canonicalSha256: 'C'.repeat(64),
  resultKeys: padding ? [`P-1|2026|${'x'.repeat(padding)}`] : ['P-1|2026'], auditKeys: ['AUDIT-1'],
  processorReference: 'FLOW-1', completedAt: '2026-09-14T01:00:00Z', actorAccess: {
    receiptKey: 'COMMAND-1', breaksInheritance: true, allowedPrincipals: [
      { principalKey: 'P-1', permission: 'Read', source: 'Employee' },
      { principalKey: 'PROCESSOR', permission: 'FullControl', source: 'Processor' }
    ], revokedPrincipalKeys: [] } });
const provenance = (): IC2bNativeReceiptProvenance => {
  const binding = { commandType: 'UpsertPersonalItemV2', subjectType: 'WorkplanItem', subjectKey: 'ITEM-1',
    personKey: 'P-1', performanceYear: 2026, workplanKey: 'P-1|2026' };
  const source = { listId: 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d', itemId: 7, itemVersion: '1.0',
    sourceETag: '"1"' };
  return { source, command: { ...binding, quarter: null }, actor: { email: 'employee@example.invalid',
    personKey: 'P-1', effectiveRole: 'Employee' }, processor: { email: 'processor@example.invalid',
    principalKey: 'PROCESSOR', flowRunReference: 'FLOW-1', completedAt: '2026-09-14T01:00:00Z' },
  admittedSource: { source: { listId: source.listId, itemId: source.itemId, itemVersion: source.itemVersion },
    sourceETag: source.sourceETag, sourceRowVersion: '1', route: 'Employee', authorEmail: 'employee@example.invalid',
    envelope: { binding, expected: {}, payload: {} } as never } } as unknown as IC2bNativeReceiptProvenance;
};
const provisioning = (padding: number = 0): ITenantProvisioningReceipt => {
  const value: ITenantProvisioningReceipt = { contractVersion: 'kcf.kpi.wib12.tenant-layer.v1',
    receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1', revision: 1,
    previousReceiptSha256: null, receiptSha256: '0'.repeat(64), mode: 'Apply', applyExplicitlyEnabled: true,
    receiptKey: `tenant-provision|${'A'.repeat(64)}`, status: 'InProgress', stopCode: null,
    pendingOperation: null, unknownOperation: null, startedAt: '2026-09-14T01:00:00Z',
    completedAt: '2026-09-14T01:00:00Z', planSha256: 'A'.repeat(64),
    plan: padding ? { state: 'x'.repeat(padding) } as never : {} as never,
    beforeStateSha256: 'B'.repeat(64), afterStateSha256: null, confirmations: [],
    rollback: { requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true, entries: [],
      ambiguityOutcome: 'BLOCKED_OFF' } };
  const unsigned = Object.keys(value).filter(key => key !== 'receiptSha256').reduce<Record<string, unknown>>((r, key) => {
    r[key] = value[key as keyof ITenantProvisioningReceipt]; return r;
  }, {});
  value.receiptSha256 = hashC2bCanonical(unsigned); return value;
};

describe('PM11 physical terminal and provisioning receipt stores', () => {
  it('declares only the additive terminal fields and dedicated 16-chunk provisioning schema', () => {
    expect(C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS.map(field => field.internalName)).toEqual([
      'NativeReceiptPayloadKind', 'NativeReceiptContractVersion', 'NativeReceiptStateSHA256',
      'NativeReceiptStateLength', 'NativeReceiptChunkCount', ...Array.from({ length: 8 }, (_, index) =>
        `NativeReceiptChunk${String(index + 1).padStart(2, '0')}`)]);
    expect(C2B_PROVISIONING_RECEIPT_FIELDS.filter(field => /^ReceiptChunk\d{2}$/.test(field.internalName)))
      .toHaveLength(16);
    expect(C2B_PROVISIONING_RECEIPT_FIELDS[0]).toMatchObject({ internalName: 'ReceiptRevisionKey',
      required: true, indexed: true, unique: true });
  });

  it('maps every B01 terminal column and losslessly restores the native envelope', () => {
    const receipt = terminal(); const evidence = provenance(); const row = serialiseC2bTerminalReceiptRow(receipt, evidence);
    expect(row).toMatchObject({ Title: 'COMMAND-1', ReceiptKey: 'COMMAND-1', CommandKey: 'COMMAND-1',
      SourceItemVersion: '1.0', AuthenticatedActorEmail: 'employee@example.invalid',
      Outcome: 'Accepted', ValidationCode: 'C2B_ACCEPTED', Message: 'Accepted',
      NativeReceiptPayloadKind: 'C2bTerminal', NativeReceiptChunkCount: 1 });
    const restored = deserialiseC2bTerminalReceiptRow(row);
    expect(restored.receipt).toEqual(receipt); expect(restored.source).toEqual(evidence.source);
    expect(restored.processor).toEqual(evidence.processor);
  });

  it.each([[0, 1], [60000, 2], [420000, 8]])
  ('round-trips terminal payload padding %i through %i physical chunks', (padding, chunks) => {
    const receipt = terminal(padding); const row = serialiseC2bTerminalReceiptRow(receipt, provenance());
    expect(row.NativeReceiptChunkCount).toBe(chunks);
    expect(deserialiseC2bTerminalReceiptRow(row).receipt).toEqual(receipt);
  });

  it('rejects legacy metadata absence, crossed columns and chunk tampering', () => {
    const row = { ...serialiseC2bTerminalReceiptRow(terminal(), provenance()) };
    expect(() => deserialiseC2bTerminalReceiptRow({ ...row, NativeReceiptPayloadKind: null }))
      .toThrow(/C2B_TERMINAL_RECEIPT_METADATA_INVALID/);
    expect(() => deserialiseC2bTerminalReceiptRow({ ...row, CommandKey: 'CROSSED' }))
      .toThrow(/C2B_TERMINAL_RECEIPT_COLUMN_MISMATCH/);
    expect(() => deserialiseC2bTerminalReceiptRow({ ...row, NativeReceiptStateLength:
      Number(row.NativeReceiptStateLength) + 1 })).toThrow(/C2B_PHYSICAL_LENGTH_MISMATCH/);
    expect(() => deserialiseC2bTerminalReceiptRow({ ...row, NativeReceiptChunk02: 'injected' }))
      .toThrow(/C2B_PHYSICAL_EXTRA_CHUNK/);
  });

  it.each([
    ['actor person', (value: IC2bNativeReceiptProvenance) => { value.actor.personKey = 'FORGED-PERSON'; }],
    ['actor role', (value: IC2bNativeReceiptProvenance) => { value.actor.effectiveRole = 'SystemAdmin'; }],
    ['processor principal', (value: IC2bNativeReceiptProvenance) => { value.processor.principalKey = 'FORGED-PROCESSOR'; }],
    ['processor run', (value: IC2bNativeReceiptProvenance) => { value.processor.flowRunReference = 'FORGED-RUN'; }]
  ])('rejects caller-substituted terminal %s provenance before serialisation', (_label, mutate) => {
    const value = provenance(); mutate(value);
    expect(() => serialiseC2bTerminalReceiptRow(terminal(), value))
      .toThrow(/C2B_TERMINAL_RECEIPT_PROVENANCE_INVALID/);
  });

  it('uses the exact immutable revision key and losslessly restores a provisioning revision', () => {
    const receipt = provisioning(); const row = serialiseTenantProvisioningReceiptRow(receipt);
    expect(row.ReceiptRevisionKey).toBe(tenantProvisioningRevisionKey(receipt));
    expect(row.Title).toBe(row.ReceiptRevisionKey); expect(row.ReceiptKey).toBe(receipt.receiptKey);
    expect(deserialiseTenantProvisioningReceiptRow(row)).toEqual(receipt);
    expect(canonicaliseC2b(deserialiseTenantProvisioningReceiptRow(row))).toBe(canonicaliseC2b(receipt));
  });

  it.each([[0, 1], [60000, 2], [900000, 16]])
  ('round-trips provisioning payload padding %i through %i physical chunks', (padding, chunks) => {
    const receipt = provisioning(padding); const row = serialiseTenantProvisioningReceiptRow(receipt);
    expect(row.ReceiptChunkCount).toBe(chunks); expect(deserialiseTenantProvisioningReceiptRow(row)).toEqual(receipt);
  });

  it('rejects provisioning column/digest/chunk attacks and >960,000 overflow', () => {
    const receipt = provisioning(); const row = { ...serialiseTenantProvisioningReceiptRow(receipt) };
    expect(() => deserialiseTenantProvisioningReceiptRow({ ...row, ReceiptKey: 'tenant-provision|CROSSED' }))
      .toThrow(/TENANT_RECEIPT_PHYSICAL_COLUMN_MISMATCH/);
    expect(() => deserialiseTenantProvisioningReceiptRow({ ...row, ReceiptSHA256: 'F'.repeat(64) }))
      .toThrow(/TENANT_RECEIPT_PHYSICAL_COLUMN_MISMATCH|TENANT_RECEIPT_PHYSICAL_SELF_HASH_INVALID/);
    expect(() => deserialiseTenantProvisioningReceiptRow({ ...row, ReceiptChunk01: `${row.ReceiptChunk01}x` }))
      .toThrow(/C2B_PHYSICAL_LENGTH_MISMATCH/);
    expect(() => serialiseC2bTerminalReceiptRow(terminal(480000), provenance()))
      .toThrow(/C2B_PHYSICAL_CAPACITY_EXCEEDED/);
    expect(() => serialiseTenantProvisioningReceiptRow(provisioning(960000)))
      .toThrow(/C2B_PHYSICAL_CAPACITY_EXCEEDED/);
  });
});
