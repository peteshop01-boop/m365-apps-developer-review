import type { V5Admission, V5Authority, V5Receipt, V5StoreBinding } from './OptionEWorkplanSubmitExactBodyV5Models';
import type { V4AclReadback, V4Control } from './OptionEWorkplanSubmitExactBodyV4Models';

export type V5Result = { outcome: 'Completed'; receipt: V5Receipt }
  | { outcome: 'Rejected' | 'RecoveryHold'; reason: string };

/** Synthetic source-test boundary only. No native implementation is admitted.
 * Every durable record is a complete captured-codec frame, never a logical JSON view.
 * nextOperationEtag is a read-only synthetic prediction, NOT a native ETag allocator.
 * A writer must enforce unique create / exact old ETag and store the supplied new ETag.
 */
export interface V5CapturedBytePort {
  binding: V5StoreBinding;
  readAuthority(key: string): Promise<V5Authority>;
  nextOperationEtag(key: string, exactEtag?: string): Promise<string>;
  readOperation(key: string): Promise<string | undefined>;
  createOperation(admissionBody: string, operationBody: string): Promise<void>;
  replaceOperation(key: string, exactEtag: string, operationBody: string): Promise<void>;
  readControl(key: string): Promise<V4Control>;
  casControl(key: string, exactEtag: string, next: Omit<V4Control, 'etag'>): Promise<V4Control>;
  readSnapshot(key: string): Promise<string | undefined>;
  createSnapshot(snapshotBody: string): Promise<void>;
  readReceipt(key: string): Promise<string | undefined>;
  /** Store adds its authoritative nativeCreated, encodes the COMPLETE receipt and persists it.
   * Input is a complete encoded snapshot, not a partial receipt or fabricated native date. */
  createReceipt(snapshotBody: string): Promise<void>;
  expectedAcl(admission: V5Admission): Promise<V4AclReadback>;
  readAcl(key: string): Promise<V4AclReadback | undefined>;
  applyAcl(admission: V5Admission): Promise<void>;
  now(): string;
}

export interface V5Capacity {
  request: number; references: number; admission: number; journal: number; snapshot: number; receipt: number;
}
