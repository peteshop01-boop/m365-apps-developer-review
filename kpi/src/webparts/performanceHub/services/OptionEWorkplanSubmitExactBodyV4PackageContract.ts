import { EXACT_BODY_V4, EXACT_BODY_MAX_BYTES } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { v4Equal, v4ExactKeys, V4_WIRE_SCHEMA, V4_DRAFT_SCHEMA } from './OptionEWorkplanSubmitExactBodyV4Wire';
import type { V4Store } from '../models/OptionEWorkplanSubmitExactBodyV4Models';

/** Declaration only: independent hosted parity and storage approval are mandatory. */
export const V4_DECLARATION = {
  capability: EXACT_BODY_V4, maxUtf8Bytes: EXACT_BODY_MAX_BYTES, chunks: false, requestSchema:V4_WIRE_SCHEMA, draftSchema:V4_DRAFT_SCHEMA,
  guards: {
    Protocol: "@and(contains(outputs('Protocol'), 'kcf.kpi.option-e.submit.v4'), contains('kcf.kpi.option-e.submit.v4', outputs('Protocol')), equals(length(outputs('Protocol')), 26))",
    TypedPresence: "@and(contains(outputs('RequiredKeys'), 'source'), contains(outputs('RequiredKeys'), 'referenceBody'))",
    NativeActor: "@equals(outputs('NativeCreatedById'), outputs('ProtectedActorPrincipalId'))",
    CurrentManager: "@and(equals(outputs('ProtectedManagerId'), outputs('CurrentManagerId')), equals(outputs('AdmittedHierarchyEpoch'), outputs('CurrentHierarchyEpoch')))",
    ExactSourceCoordinates: "@and(equals(outputs('SourceItemId'), outputs('DraftItemId')), contains(outputs('SourceETag'), outputs('DraftETag')), contains(outputs('DraftETag'), outputs('SourceETag')), equals(length(outputs('SourceETag')), length(outputs('DraftETag'))))",
    CompleteCanonicalBody: "@and(equals(length(outputs('OriginalBody')), length(outputs('ReconstructedBody'))), contains(outputs('OriginalBody'), outputs('ReconstructedBody')), contains(outputs('ReconstructedBody'), outputs('OriginalBody')))",
    Utf8Roundtrip: "@and(equals(length(outputs('Scalar')), length(base64ToString(base64(outputs('Scalar'))))), contains(outputs('Scalar'), base64ToString(base64(outputs('Scalar')))), contains(base64ToString(base64(outputs('Scalar'))), outputs('Scalar')))",
    ByteCapNoChunks: "@and(lessOrEquals(outputs('Utf8ByteCount'), 56000), equals(outputs('ChunkInputPresent'), false))",
    DoubleRead: "@and(equals(length(outputs('AuthorityFirst')), length(outputs('AuthoritySecond'))), contains(outputs('AuthorityFirst'), outputs('AuthoritySecond')), contains(outputs('AuthoritySecond'), outputs('AuthorityFirst')))",
    CompleteReference: "@and(equals(length(outputs('ReferenceBody')), length(outputs('ProtectedReferenceBody'))), contains(outputs('ReferenceBody'), outputs('ProtectedReferenceBody')), contains(outputs('ProtectedReferenceBody'), outputs('ReferenceBody')))",
    UniqueCommandFullTuple: "@and(equals(length(outputs('AdmittedTuple')), length(outputs('DurableTuple'))), contains(outputs('AdmittedTuple'), outputs('DurableTuple')), contains(outputs('DurableTuple'), outputs('AdmittedTuple')))",
    ExactETagCAS: "@and(equals(outputs('ETagPresent'), true), equals(outputs('WildcardETag'), false))",
    ImmutableSnapshotReceipt: "@and(equals(outputs('SnapshotReadbackExact'), true), equals(outputs('ReceiptReadbackExact'), true), equals(outputs('NativeCreatedClockBound'), true))",
    CheckpointRecovery: "@and(equals(outputs('CheckpointReadbackExact'), true), equals(outputs('SameAdmission'), true))",
    ControlAclCompletion: "@and(equals(outputs('ControlReadbackExact'), true), equals(outputs('CompleteAclReadbackExact'), true), equals(outputs('CurrentManagerEpochExact'), true))",
    StorageHostAdmission: "@and(equals(outputs('VersionedStorageAdmitted'), true), equals(outputs('HostedWireParityAdmitted'), true))"
  }
} as const;
export interface V4Fixture { state: 'Disabled'; binding: 'Unbound'; purpose: 'DeclarationOnly'; declaration: typeof V4_DECLARATION; actions: { [key: string]: { type: 'Compose'; inputs: string } } }
export const v4Fixture = (): V4Fixture => ({
  state: 'Disabled', binding: 'Unbound', purpose: 'DeclarationOnly', declaration: V4_DECLARATION,
  actions: Object.fromEntries(Object.entries(V4_DECLARATION.guards).map(([k,v]) => [k, { type: 'Compose' as const, inputs: v }]))
});
export function validateV4Fixture(fixture: unknown): void {
  v4ExactKeys(fixture, ['state','binding','purpose','declaration','actions']);
  if (!v4Equal(fixture, v4Fixture())) throw new Error('V4DeclarationGuardMismatch');
}
export function validateV4SourceDomainBinding(binding: unknown): asserts binding is V4Store['binding'] {
  v4ExactKeys(binding,['kind','capability','protectedOrigin','principals']);
  if (binding.kind !== 'domain-test' || binding.protectedOrigin !== true || !v4Equal(binding.capability,EXACT_BODY_V4)) throw new Error('BindingProtocolNotAdmitted');
  v4ExactKeys(binding.principals,['content','acl','recovery']);
  const ids=Object.values(binding.principals);
  if (!ids.every(n => typeof n === 'number' && Number.isSafeInteger(n) && n > 0) || new Set(ids).size !== 3) throw new Error('BindingPrincipalTypes');
}
/** This source cut has no reviewed protected native loader. References/caller assertions confer no admission. */
export function v4InstalledReadiness(_binding: unknown): 'NOT_ADMITTED' {
  return 'NOT_ADMITTED';
}
