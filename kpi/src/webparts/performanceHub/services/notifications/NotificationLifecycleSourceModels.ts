import type { IProductionPerson, IWorkplanSubmissionResult, IWorkplanTransitionResult } from '../../models/ProductionModels';
import type { IQuarterReviewTransitionResult } from '../../models/QuarterlyModels';
import type { INotificationRecipientReference, INotificationSafeLinkPolicy, NotificationPeriodKey } from './NotificationModels';

/** Use the returned, persisted lifecycle result, never a plan or an audit-write object.
 * These supplied local values are not a native completion or recipient authority issuer.
 */
export type NotificationLifecycleSourceChange =
  | { readonly kind: 'AnnualSubmission'; readonly result: Readonly<IWorkplanSubmissionResult> }
  | { readonly kind: 'AnnualDecision'; readonly result: Readonly<IWorkplanTransitionResult> }
  | { readonly kind: 'QuarterTransition'; readonly result: Readonly<IQuarterReviewTransitionResult> }
  | { readonly kind: 'DraftSave' | 'ProgressSave' | 'RecoverySave' };

export type NotificationLifecycleDecision = 'ChangesRequested' | 'Approved' | 'Submitted' | 'Resubmitted';
export type NotificationLifecycleRecipientRole = 'Employee' | 'Manager';

/** Caller-owned preview state only; not a persistent outbox or successful-send ledger. */
export interface INotificationLifecyclePreviewState {
  readonly processedTransitionIdentities: readonly string[];
}

export interface INotificationLifecycleSourceInput {
  readonly change?: NotificationLifecycleSourceChange;
  readonly people?: readonly IProductionPerson[];
  readonly actionLink?: string;
  readonly safeLinkPolicy?: Readonly<INotificationSafeLinkPolicy>;
  readonly previewState?: Readonly<INotificationLifecyclePreviewState>;
}

/** Deliberately excludes comments, scores, results and the audit JSON payloads. */
export interface INotificationLifecycleFacts {
  readonly workflow: 'AnnualWorkplan' | 'QuarterReview';
  readonly decision: NotificationLifecycleDecision;
  readonly subjectKey: string;
  readonly employeePersonKey: string;
  readonly performanceYear: number;
  readonly periodKey: NotificationPeriodKey;
  readonly workflowState: 'Submitted' | 'ChangesRequested' | 'Approved' | 'Locked';
  readonly eventType: string;
  readonly eventAt: string;
  readonly sourceVersion: number;
  readonly correlationKey: string;
  readonly actionLink: string;
  readonly message: string;
}

export interface INotificationLifecycleSourcePreview {
  readonly recipientRole: NotificationLifecycleRecipientRole;
  readonly recipient: Readonly<INotificationRecipientReference>;
  readonly facts: Readonly<INotificationLifecycleFacts>;
}

export type NotificationLifecycleSourceReason =
  | 'CompletedTransitionProjected' | 'IrrelevantEdit' | 'IrrelevantTransition' | 'AlreadyProcessed'
  | 'CompletionEvidenceUnavailable' | 'PeopleRelationshipUnavailable' | 'SafeHubLinkUnavailable'
  | 'PreviewStateUnavailable' | 'SourceInputUnavailable';

export interface INotificationLifecycleSourceResult {
  readonly status: 'PREVIEW' | 'SUPPRESSED' | 'HOLD';
  readonly reason: NotificationLifecycleSourceReason;
  readonly nativeDeliveryEnabled: false;
  readonly transitionIdentity?: string;
  readonly notifications: readonly Readonly<INotificationLifecycleSourcePreview>[];
  readonly nextPreviewState?: Readonly<INotificationLifecyclePreviewState>;
}
