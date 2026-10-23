import type { IOptionEWorkplanDraftAggregate } from './OptionEWorkplanDraftModels';

export const EXACT_BODY_V4 = {
  protocol: 'demo.kpi.option-e.submit.v4', integrity: 'exact-body/v1',
  wire: 'canonical-draft/v1', storage: 'demo.kpi.option-e.storage.v4', receipt: 'immutable-receipt/v4'
} as const;
export const EXACT_BODY_MAX_BYTES = 56000;
export type V4Capability = typeof EXACT_BODY_V4;
export interface V4Request {
  capability: V4Capability; action: 'Submit'; command: string; person: string; year: number;
  workplan: string; source: V4Draft; referenceBody: string;
}
export interface V4Draft {
  itemId: number; etag: string; version: string; schema: 'demo.workplan-draft/v1'; body: string;
}
/** Metadata originates from native readback, never a client payload. */
export interface V4NativeRequest { itemId: number; etag: string; version: string; createdBy: number; body: string; query: V4Request }
export interface V4Person { key: string; principal: number; active: true; manager?: string; version: string }
export interface V4Control {
  workplan: string; person: string; year: number; draftId: number; manager: string;
  hierarchyEpoch: number; aclEpoch: number; etag: string;
  state: 'Draft' | 'ChangesRequested' | 'Submitted'; transition: 'Ready' | 'Submitting' | 'AclPending';
  command?: string; snapshot?: string;
}
/** Each row retains its complete closed native body plus item/ETag/version. */
export interface V4ReferenceRow {
  kind: 'Kpi' | 'Target' | 'Framework' | 'Assignment' | 'Value' | 'Prompt' | 'Catalogue' | 'Headline' | 'Focus' | 'BehaviourTarget';
  key: string; itemId: number; etag: string; version: string; body: string;
}
export interface V4ReferenceSet { rows: V4ReferenceRow[]; asOf: string }
export interface V4Authority {
  request: V4NativeRequest; draft: V4Draft; references: V4ReferenceSet;
  actor: V4Person; manager: V4Person; control: V4Control;
}
export const V4_CHECKPOINTS = ['Validated', 'ControlClaimed', 'SnapshotWritten', 'AuditWritten', 'ControlPointed', 'AclVerified', 'Completed'] as const;
export type V4Checkpoint = typeof V4_CHECKPOINTS[number];
export interface V4Admission { key: string; authority: V4Authority; eventAt: string }
export interface V4Operation { admission: V4Admission; checkpoint: V4Checkpoint; etag: string; outcome: 'Running' | 'Completed' | 'RecoveryHold'; holdReason?: string }
export interface V4Snapshot { key: string; admission: V4Admission; body: string; referencesBody: string }
export interface V4Receipt { key: string; admission: V4Admission; snapshot: V4Snapshot; nativeCreated: string }
export interface V4AclReadback { admissionKey: string; hierarchyEpoch: number; aclEpoch: number; targets: V4AclTarget[] }
export interface V4AclTarget { key: string; inherited: false; complete: true; grants: { principal: number; role: 'Read' | 'AppendOnly' | 'MutatorNoDelete' | 'AclReconciler' | 'FullControl' }[] }
export interface V4Store {
  /** Local fake stores may use domain-test only. Native requires separately admitted protected binding. */
  binding: { kind: 'domain-test' | 'native'; capability: V4Capability; storageEvidence?: string; hostParityEvidence?: string; protectedOrigin: boolean; principals: { content: number; acl: number; recovery: number } };
  readAuthority(key: string): Promise<V4Authority>;
  readOperation(key: string): Promise<V4Operation | undefined>;
  createOperation(admission: V4Admission): Promise<V4Operation>;
  advance(key: string, exactEtag: string, checkpoint: V4Checkpoint): Promise<V4Operation>;
  hold(key: string, exactEtag: string, reason: string): Promise<void>;
  readControl(key: string): Promise<V4Control>;
  casControl(key: string, exactEtag: string, next: Omit<V4Control, 'etag'>): Promise<V4Control>;
  readSnapshot(key: string): Promise<V4Snapshot | undefined>;
  createSnapshot(snapshot: V4Snapshot): Promise<void>;
  readReceipt(key: string): Promise<V4Receipt | undefined>;
  createReceipt(receipt: Omit<V4Receipt, 'nativeCreated'>): Promise<void>;
  expectedAcl(admission: V4Admission): Promise<V4AclReadback>;
  readAcl(key: string): Promise<V4AclReadback | undefined>;
  applyAcl(admission: V4Admission): Promise<void>;
  now(): string;
}
export type V4Result = { outcome: 'Completed'; receipt: V4Receipt } | { outcome: 'Rejected' | 'RecoveryHold'; reason: string };
export type V4DraftBody = IOptionEWorkplanDraftAggregate;
