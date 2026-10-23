import type { ReviewCommandV1, ReviewJournalV1, PendingEffectV1, ConfirmedEffectV1,
  CapturedRecordV1, ManagerSourceV1, ReviewPortsV1, ReviewAuthorityV1,
  ReviewJournalObservationV1, EffectRecoveryV1 } from './OptionEWorkplanReviewV1Models';
import type { IOptionEReviewControl } from '../services/OptionEWorkplanReviewContract';
import type { RequestChangesFinalReadPorts } from '../services/OptionEWorkplanReviewSourceReadback';

export type RequestChangesCommandV1 = Omit<ReviewCommandV1, 'command' | 'reason'> & {
  command: 'RequestChanges'; reason: string;
};
export type RequestChangesEffectKindV2 = 'ControlClaim' | 'ReceiptCreate' | 'DecisionReady' | 'Acl' | 'ControlRelease';
export type RequestChangesPendingEffectV2 = Omit<PendingEffectV1, 'kind'> & { kind: RequestChangesEffectKindV2 };
export type RequestChangesConfirmedEffectV2 = Omit<ConfirmedEffectV1, 'kind'> & { kind: RequestChangesEffectKindV2 };
/** Explicit protected recovery frame. Employee, command/v1 and receipt/v1 fields do not evolve. */
export type RequestChangesJournalV2 = Omit<ReviewJournalV1,
  'schemaVersion' | 'command' | 'phase' | 'pendingEffect' | 'confirmedEffects'> & {
  schemaVersion: 'kcf.kpi.option-e.review-journal/v2'; command: RequestChangesCommandV1;
  phase: 'Validated' | 'ControlClaimed' | 'ApprovedWritten' | 'DecisionRecorded' | 'DecisionReady' | 'AclVerified' | 'ControlReleased' | 'Completed';
  pendingEffect?: RequestChangesPendingEffectV2; confirmedEffects: RequestChangesConfirmedEffectV2[];
};

type PatchCoordinates = Omit<IOptionEReviewControl, 'etag' | 'state' | 'transitionStatus' | 'currentApprovedSnapshotKey'>;
interface RequestChangesPatchPins {
  operationKey: string; expectedEtag: string; expectedVersion: number; hierarchyEpoch: number; aclEpoch: number;
}
/** Transient CAS requests only. A future store must independently check native identity,
 * live journal/lease ownership, exact ETag/token/epochs and reason before applying them.
 * Claim sets pending/LastOperationKey; DecisionReady retains both; only Release clears pending.
 * Token n is retained until Release's n+1; the historical annual ordinal never changes. */
export type RequestChangesControlPatch =
  | (RequestChangesPatchPins & { mode: 'Claim'; accessState: 'ReadOnly';
      control: PatchCoordinates & { state: 'Submitted'; transitionStatus: 'Reviewing' } })
  | (RequestChangesPatchPins & { mode: 'DecisionReady'; accessState: 'ReadOnly'; managerDecisionComment: string;
      control: PatchCoordinates & { state: 'ChangesRequested'; transitionStatus: 'Ready' } })
  | (RequestChangesPatchPins & { mode: 'Release'; accessState: 'EmployeeEdit'; managerDecisionComment: string;
      control: PatchCoordinates & { state: 'ChangesRequested'; transitionStatus: 'Ready' } });

/** Existing immutable Audit observation shape with the allocated RequestChanges event.
 * No native admission, human visibility grant or ACL effect is supplied by this type. */
export interface RequestChangesAudit extends CapturedRecordV1 {
  key: string; eventType: 'WorkplanChangesRequested'; createdAt: string; commandSource: ManagerSourceV1;
}

/** Local source-store obligations, not native capabilities. The eventual processor separately
 * composes mandatory private Audit observations. No method supplies a completed readback. */
export interface RequestChangesPorts extends Readonly<Pick<ReviewPortsV1,
  'readManagerCommand' | 'readCurrentAuthority' | 'readHistoricalHeaderVersion' | 'readCapturedSubmit' | 'now' | 'sha256'>> {
  readonly readJournal: (key: string) => Promise<ReviewJournalObservationV1 | undefined>;
  readonly createJournal: (key: string, exactBody: string) => Promise<ReviewJournalObservationV1>;
  readonly casJournal: (key: string, expectedEtag: string, exactBody: string) => Promise<ReviewJournalObservationV1>;
  readonly casControl: (patch: RequestChangesControlPatch) => Promise<ReviewAuthorityV1>;
  readonly readAudit: (key: string) => Promise<RequestChangesAudit | undefined>;
  readonly createAudit: (key: string, eventType: RequestChangesAudit['eventType'], exactBody: string,
    source: ManagerSourceV1) => Promise<RequestChangesAudit>;
  readonly readRequestChangesAclBinding: RequestChangesFinalReadPorts['readRequestChangesAclBinding'];
  readonly readRequestChangesFinalAcl: RequestChangesFinalReadPorts['readRequestChangesFinalAcl'];
  /** Provider independently resolves the actual owned DecisionReady/header/journal/lease
   * fence immediately before dispatch and serializes the subject ACL job. Unknown effects
   * remain outstanding; a caller Boolean or expired lease does not prove cancellation. */
  readonly applyRequestChangesAcl: (journal: RequestChangesJournalV2, receipt: RequestChangesAudit,
    leaseEpoch: number) => Promise<void>;
  readonly recoverEffect: (operationKey: string, effect: RequestChangesPendingEffectV2) => Promise<EffectRecoveryV1>;
}
export type RequestChangesPortsV2 = RequestChangesPorts;
