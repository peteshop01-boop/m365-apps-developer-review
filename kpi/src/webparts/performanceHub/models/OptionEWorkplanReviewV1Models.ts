import type { IDeliveryPublicationNativeCoordinates as Native, IDeliveryPublicationObservation as Observation } from './GovernedDeliveryPublicationV1Models';
import type { IEmployeeWorkplanHeaderReadbackV2 } from './EmployeeWorkplanV2PersistenceModels';
import type { IOptionEPeopleRow } from './OptionEWorkplanSubmitModels';
import type { V4AclReadback, V4AclTarget } from './OptionEWorkplanSubmitExactBodyV4Models';
import type { IOptionEReviewControl, IOptionEReviewSnapshot, IOptionEReviewReceipt, IOptionEReviewReadback, OptionEReviewCommand } from '../services/OptionEWorkplanReviewContract';
import type { ReviewAuditBindings, ReviewAuditAclObservation } from '../services/OptionEWorkplanReviewAuditSourceReadback';

export type { Native, Observation };
export interface ReviewCommandV1 {
  schemaVersion: 'kcf.kpi.option-e.review-command/v1'; commandKey: string; command: OptionEReviewCommand;
  expectedWorkplanKey: string; expectedControlEtag: string; expectedControlVersion: number;
  expectedSubmittedSnapshotKey: string; reason?: string;
}
export interface OrdinalSourceV1 { native: Native; field: 'WorkplanVersion'; value: number }
export interface CaptureReferenceV1 { encoding: 'captured-native-request/v1'; kind: 'receipt' | 'snapshot'; key: string; native: Native; sha256: string }
export interface ManagerSourceV1 { native: Native; bodySha256: string }
export interface ReviewApprovedV1 {
  schemaVersion: 'kcf.kpi.option-e.review-approved/v1'; commandKey: string; approved: IOptionEReviewSnapshot;
  sourceCapture: CaptureReferenceV1; ordinalSource: OrdinalSourceV1;
}
export interface ReviewReceiptV1 {
  schemaVersion: 'kcf.kpi.option-e.review-receipt/v1'; receipt: Omit<IOptionEReviewReceipt, 'nativeCreatedAt'>;
  commandSource: ManagerSourceV1; sourceCapture: CaptureReferenceV1;
  approvedReference?: { key: string; native: Native; sha256: string }; reason?: string;
}
export type EffectKindV1 = 'ControlClaim' | 'ApprovedCreate' | 'ReceiptCreate' | 'Acl' | 'ControlRelease';
export interface PendingEffectV1 { kind: EffectKindV1; key: string; expectedEtag?: string; desiredSha256: string; issuedAt: string; leaseEpoch: number }
export interface ConfirmedEffectV1 { kind: EffectKindV1; key: string; bodySha256: string; native: Native }
export interface ReviewJournalV1 {
  schemaVersion: 'kcf.kpi.option-e.review-journal/v1'; operationKey: string; journalRevision: number;
  command: ReviewCommandV1; commandSource: ManagerSourceV1;
  actorBinding: { personKey: string; principalId: number; email: string; personNative: Native; subjectPersonKey: string; managerPersonKey: string; hierarchyEpoch: number; aclEpoch: number };
  before: IOptionEReviewControl; currentControl: IOptionEReviewControl; headerNative: Native; desired: Omit<IOptionEReviewControl, 'etag'>;
  submitted: IOptionEReviewSnapshot; sourceCapture: CaptureReferenceV1; ordinalSource: OrdinalSourceV1;
  phase: 'Validated' | 'ControlClaimed' | 'ApprovedWritten' | 'DecisionRecorded' | 'AclVerified' | 'ControlReleased' | 'Completed';
  outcome: 'Running' | 'Completed' | 'RecoveryHold'; lease?: { owner: string; epoch: number; expiresAt: string };
  pendingEffect?: PendingEffectV1; confirmedEffects: ConfirmedEffectV1[]; holdReason?: string;
}

/** Source-domain observations. No declaration here grants native authority. */
export interface ManagerCommandObservationV1 { body: string; native: Native; authorPrincipalId: number; createdAt: string; immutable: true; columns: ReviewCommandV1 }
export interface CapturedRecordV1 { body: string; native: Native; immutable: true }
export interface ReviewAuthorityV1 {
  header: Observation<IEmployeeWorkplanHeaderReadbackV2>; control: IOptionEReviewControl;
  people: Observation<IOptionEPeopleRow>[]; pendingRequestKey?: string; lastOperationKey?: string;
}
export interface ReviewAuditV1 extends CapturedRecordV1 { key: string; eventType: 'WorkplanApproved' | 'WorkplanLocked'; createdAt: string; commandSource: ManagerSourceV1 }
export interface ReviewJournalObservationV1 { body: string; native: Native }
export interface ReviewControlPatchV1 {
  mode: 'Claim' | 'Release' | 'Fence'; operationKey: string; expectedEtag: string; expectedVersion: number;
  hierarchyEpoch: number; aclEpoch: number; control: Omit<IOptionEReviewControl, 'etag'>;
  accessState?: 'ReadOnly'; approvedAt?: string; approvedByEmail?: string; lockedAt?: string; lockedByEmail?: string;
}
export interface ReviewAclV1 { submitted: V4AclReadback; artifacts: V4AclTarget[]; native: Native; operationKey: string; leaseEpoch: number }
export type EffectRecoveryV1 = { status: 'Applied'; bodySha256: string; native: Native }
  | { status: 'NotApplied'; noOutstandingDispatch: true; beforeEtag?: string }
  | { status: 'StillUnknown' };
/** A supplied LOCAL store must implement create uniqueness, exact CAS, immutable reads,
 * separately serialized/fenced ACL jobs, and definitive recovery. No live adapter is supplied. */
export interface ReviewPortsV1 {
  readManagerCommand(source: Native): Promise<ManagerCommandObservationV1>;
  readCurrentAuthority(workplan: string): Promise<ReviewAuthorityV1>;
  readHistoricalHeaderVersion(native: Native): Promise<Observation<IEmployeeWorkplanHeaderReadbackV2>>;
  readCapturedSubmit(pointer: string): Promise<{ receipt?: CapturedRecordV1; snapshot?: CapturedRecordV1 }>;
  readJournal(key: string): Promise<ReviewJournalObservationV1 | undefined>;
  createJournal(key: string, body: string): Promise<ReviewJournalObservationV1>;
  casJournal(key: string, expectedEtag: string, body: string): Promise<ReviewJournalObservationV1>;
  casControl(patch: ReviewControlPatchV1): Promise<ReviewAuthorityV1>;
  readAudit(key: string): Promise<ReviewAuditV1 | undefined>;
  readReviewAuditBindings(operationKey: string): Promise<ReviewAuditBindings | undefined>;
  readReviewAuditAcl(operationKey: string): Promise<ReviewAuditAclObservation | undefined>;
  createAudit(key: string, eventType: ReviewAuditV1['eventType'], body: string, source: ManagerSourceV1): Promise<ReviewAuditV1>;
  readFinalAcl(operationKey: string): Promise<ReviewAclV1 | undefined>;
  applyFinalAcl(journal: ReviewJournalV1, artifacts: ReviewAuditV1[], leaseEpoch: number): Promise<void>;
  recoverEffect(operationKey: string, effect: PendingEffectV1): Promise<EffectRecoveryV1>;
  now(): string;
  sha256(exactUtf8: string): Promise<string>;
}
export type ReviewResultV1 = { outcome: 'Completed'; readback: IOptionEReviewReadback }
  | { outcome: 'RecoveryHold'; reason: string };
