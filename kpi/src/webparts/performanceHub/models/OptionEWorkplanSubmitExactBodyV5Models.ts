import type { IOptionEWorkplanDraftV2Aggregate } from './OptionEWorkplanDraftV2Models';
import type { IDeliveryPublicationNativeCoordinates, IDeliveryPublicationObservation } from './GovernedDeliveryPublicationV1Models';
import type { IAnnualWorkplan } from './ProductionModels';
import { V4_CHECKPOINTS, type V4Person, type V4Control, type V4ReferenceRow, type V4AclReadback } from './OptionEWorkplanSubmitExactBodyV4Models';

export const EXACT_BODY_V5 = {
  protocol: 'kcf.kpi.option-e.submit.v5', integrity: 'exact-body/v1', wire: 'canonical-draft/v2',
  storage: 'kcf.kpi.option-e.storage.v5', receipt: 'immutable-receipt/v5'
} as const;
export const V5_REFERENCE_CONTRACT = 'kcf.kpi.option-e.references.v5' as const;
export const V5_AUTHORITY_CONTRACT = 'kcf.kpi.option-e.authority.v5' as const;
export const V5_ADMISSION_CONTRACT = 'kcf.kpi.option-e.admission.v5' as const;
export const V5_OPERATION_CONTRACT = 'kcf.kpi.option-e.operation.v5' as const;
export const V5_CAPTURE_ENCODING = 'captured-native-request/v1' as const;
export const V5_MAX_BYTES = 56000;
export const V5_DELIVERY_READER_CONTRACT = 'kcf.option-e.delivery-publication-exact-body-reader/v1' as const;
export const V5_TAXONOMY_READER_CONTRACT = 'kcf.option-e.impact-taxonomy-exact-body-reader/v1' as const;
export type V5Capability = typeof EXACT_BODY_V5;
export type V5DraftBody = IOptionEWorkplanDraftV2Aggregate;
export interface V5Draft { itemId: number; etag: string; version: string; schema: 'kcf.workplan-draft/v2'; body: string }
/** Request/reference fields are claims. Parsing does not establish protected origin. */
export interface V5Request {
  capability: V5Capability; action: 'Submit'; command: string; person: string; year: number;
  workplan: string; source: V5Draft; referenceBody: string;
}
export interface V5NativeRequest { itemId: number; etag: string; version: string; createdBy: number; body: string; query: V5Request }
interface V5PublicationReferenceBase {
  key: string; itemId: number; etag: string; version: string; body: string;
  native: IDeliveryPublicationNativeCoordinates; nativeMetadataBody: string;
}
export interface V5DeliveryReferenceRow extends V5PublicationReferenceBase {
  kind: 'DeliveryConfiguration'; readerContract: typeof V5_DELIVERY_READER_CONTRACT;
}
export interface V5TaxonomyReferenceRow extends V5PublicationReferenceBase {
  kind: 'ImpactTaxonomy'; readerContract: typeof V5_TAXONOMY_READER_CONTRACT;
}
export type V5ReferenceRow = V4ReferenceRow | V5DeliveryReferenceRow | V5TaxonomyReferenceRow;
export interface V5ReferenceSet { contract: typeof V5_REFERENCE_CONTRACT; rows: V5ReferenceRow[]; asOf: string }
export interface V5Authority {
  contract: typeof V5_AUTHORITY_CONTRACT; request: V5NativeRequest; draft: V5Draft; references: V5ReferenceSet;
  actor: V4Person; manager: V4Person; control: V4Control; workplan: IDeliveryPublicationObservation<IAnnualWorkplan>;
}
export interface V5Admission {
  contract: typeof V5_ADMISSION_CONTRACT; capability: V5Capability; key: string; authority: V5Authority; eventAt: string;
}
export const V5_CHECKPOINTS = [...V4_CHECKPOINTS] as const;
export type V5Checkpoint = typeof V5_CHECKPOINTS[number];
export interface V5JournalOperation {
  contract: typeof V5_OPERATION_CONTRACT; admission: V5Admission; checkpoint: V5Checkpoint; etag: string;
  outcome: 'Running' | 'Completed' | 'RecoveryHold'; holdReason?: string; controlReadback: V4Control;
  controlIntent?: { before: V4Control; after: Omit<V4Control, 'etag'> };
}
/** Unadmitted V5 source revision r2: references exist only in admission.authority.request.query.referenceBody. */
export interface V5Snapshot {
  contract: typeof EXACT_BODY_V5.storage; key: string; admission: V5Admission; body: string;
}
/** r2 stores the complete captured admission only in snapshot; no serialised r1 duplicate or fallback. */
export interface V5Receipt {
  contract: typeof EXACT_BODY_V5.receipt; key: string; snapshot: V5Snapshot; nativeCreated: string;
}
/** Unadmitted source revision r3. These persisted types are distinct from the expanded logical views above. */
export type V5CapturedNativeRequest = Omit<V5NativeRequest, 'query'>;
export interface V5CapturedAuthority extends Omit<V5Authority, 'request' | 'draft' | 'references'> {
  request: V5CapturedNativeRequest;
}
export interface V5CapturedAdmission extends Omit<V5Admission, 'authority'> {
  encoding: typeof V5_CAPTURE_ENCODING; authority: V5CapturedAuthority;
}
export interface V5CapturedJournalOperation extends Omit<V5JournalOperation, 'admission'> {
  admission: V5CapturedAdmission;
}
export interface V5CapturedSnapshot extends Omit<V5Snapshot, 'admission'> { admission: V5CapturedAdmission }
export interface V5CapturedReceipt extends Omit<V5Receipt, 'snapshot'> { snapshot: V5CapturedSnapshot }
// Future store adapters must use the explicit captured encoders/parsers. Logical V5Store values are
// unpersisted observations/validation views, not permission to serialise expanded frames as storage.
type V5BindingBase = { capability: V5Capability; protectedOrigin: boolean; principals: { content: number; acl: number; recovery: number } };
/** Evidence fields are required ports, not an assertion that a native binding has been admitted. */
export type V5StoreBinding = V5BindingBase & ({ kind: 'domain-test' } | {
  kind: 'native'; storageEvidence: string; hostParityEvidence: string; sourceEvidence: string;
});
export interface V5Store {
  binding: V5StoreBinding;
  readAuthority(key: string): Promise<V5Authority>;
  readOperation(key: string): Promise<V5JournalOperation | undefined>;
  createOperation(admission: V5Admission): Promise<V5JournalOperation>;
  advance(key: string, exactEtag: string, checkpoint: V5Checkpoint, controlReadback: V4Control): Promise<V5JournalOperation>;
  prepareControl(key: string, exactEtag: string, intent: NonNullable<V5JournalOperation['controlIntent']>): Promise<void>;
  hold(key: string, exactEtag: string, reason: string): Promise<void>;
  readControl(key: string): Promise<V4Control>;
  casControl(key: string, exactEtag: string, next: Omit<V4Control, 'etag'>): Promise<V4Control>;
  readSnapshot(key: string): Promise<V5Snapshot | undefined>;
  createSnapshot(snapshot: V5Snapshot): Promise<void>;
  readReceipt(key: string): Promise<V5Receipt | undefined>;
  createReceipt(receipt: Omit<V5Receipt, 'nativeCreated'>): Promise<void>;
  expectedAcl(admission: V5Admission): Promise<V4AclReadback>;
  readAcl(key: string): Promise<V4AclReadback | undefined>;
  applyAcl(admission: V5Admission): Promise<void>;
  now(): string;
}
