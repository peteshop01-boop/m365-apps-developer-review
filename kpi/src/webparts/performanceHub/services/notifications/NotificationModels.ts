import type { IProductionPerson } from '../../models/ProductionModels';

export const NOTIFICATION_EVENT_KINDS = Object.freeze([
  'EmployeeReadiness30Day',
  'EmployeePreparation14Day',
  'EmployeeFinalReminder7Day',
  'AnnualCycleOpen',
  'QuarterlyCycleOpen'
] as const);

export type NotificationEventKind = typeof NOTIFICATION_EVENT_KINDS[number];
export type NotificationPeriodKey = 'Annual' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type NotificationChannel = 'Email' | 'Teams';
export type NotificationWorkflowState = 'NotStarted' | 'Draft' | 'ChangesRequested' | 'Submitted' | 'Approved' | 'Locked' | 'Complete';
export type NotificationOutboxState = 'Queued' | 'Attempting' | 'Delivered' | 'FailedTransient' | 'FailedPermanent';
export type NotificationAttemptOutcome = 'Delivered' | 'TransientFailure' | 'PermanentFailure';

export interface INotificationSafeLinkPolicy {
  allowedOrigins: readonly string[];
  allowedPathPrefixes: readonly string[];
}

export interface INotificationEventConfig {
  eventKey: string;
  kind: NotificationEventKind;
  configKey: string;
  configVersion: string;
  performanceYear: string;
  performanceYearNumber: number;
  periodKey: NotificationPeriodKey;
  periodLabel: string;
  scheduledAt: string;
  opensAt?: string;
  deadlineAt: string;
  channel: NotificationChannel;
  actionLink?: string;
  safeLinkPolicy?: Readonly<INotificationSafeLinkPolicy>;
}

export interface INotificationRecipientReference {
  personKey: string;
  email: string;
}

export interface INotificationWorkflowSnapshot {
  workflowKey: string;
  employeePersonKey: string;
  performanceYearNumber: number;
  periodKey: NotificationPeriodKey;
  state: NotificationWorkflowState;
  sourceVersion: number;
}

export interface INotificationResendDistinction {
  distinctionKey: string;
  governanceReference: string;
}

export interface INotificationResendDecision extends INotificationResendDistinction {
  decision: 'Approved';
}

export interface INotificationResendAuthorisation extends INotificationResendDecision {
  authorityKey: string;
  originalOutboxKey: string;
  eventKey: string;
  recipientReference: string;
  workflowKey: string;
}

export interface INotificationEvaluationInput {
  now: string;
  config: Readonly<INotificationEventConfig>;
  people: ReadonlyArray<Readonly<IProductionPerson>>;
  intendedRecipient: Readonly<INotificationRecipientReference>;
  workflow: Readonly<INotificationWorkflowSnapshot>;
  expectedWorkflowState: NotificationWorkflowState;
  expectedWorkflowVersion: number;
  resend?: Readonly<INotificationResendAuthorisation>;
}

/** Required governed fields only. Transport owns any later channel-specific rendering. */
export interface INotificationDigest {
  kind: NotificationEventKind;
  performanceYear: string;
  periodKey: NotificationPeriodKey;
  periodLabel: string;
  deadlineAt: string;
  actionLink?: string;
}

export interface INotificationSourceProvenance {
  configKey: string;
  configVersion: string;
  workflowKey: string;
  workflowVersion: number;
  workflowState: NotificationWorkflowState;
  performanceYearNumber: number;
  periodKey: NotificationPeriodKey;
}

export interface INotificationOutboxRecord {
  outboxKey: string;
  eventKey: string;
  recipientIdempotencyKey: string;
  recipientReference: string;
  kind: NotificationEventKind;
  channel: NotificationChannel;
  scheduledAt: string;
  digest: Readonly<INotificationDigest>;
  provenance: Readonly<INotificationSourceProvenance>;
  resendDistinction?: Readonly<INotificationResendDistinction>;
  state: NotificationOutboxState;
  attemptCount: number;
  lastAttemptAt?: string;
  lastOutcomeAt?: string;
  lastOutcomeCode?: string;
  version: number;
}

export type NotificationPlanReason =
  | 'Eligible'
  | 'NotScheduledBoundary'
  | 'DuplicateOutboxKey'
  | 'NotActionableState'
  | 'InactiveRecipient'
  | 'IneligibleRecipientRole'
  | 'RecipientIdentityMismatch'
  | 'AmbiguousPeopleIdentity'
  | 'MalformedConfig'
  | 'WrongPeriodOrEmployee'
  | 'UnsafeActionLink'
  | 'StaleWorkflowState'
  | 'InvalidResendDistinction'
  | 'ConflictingOutboxState';

export interface INotificationPlanResult {
  status: 'Queued' | 'Suppressed' | 'Rejected';
  reason: NotificationPlanReason;
  outbox?: Readonly<INotificationOutboxRecord>;
}

export interface INotificationAttempt {
  attemptKey: string;
  outboxKey: string;
  attemptNumber: number;
  attemptedAt: string;
  expectedOutboxVersion: number;
}

export interface INotificationOutcomeInput {
  outcome: NotificationAttemptOutcome;
  outcomeAt: string;
  outcomeCode: string;
}

export interface INotificationAuditEvidence {
  auditKey: string;
  eventKey: string;
  outboxKey: string;
  recipientReference: string;
  channel: NotificationChannel;
  scheduledAt: string;
  attemptedAt: string;
  outcomeAt: string;
  attemptNumber: number;
  outcome: NotificationAttemptOutcome;
  outcomeCode: string;
  finalOutboxState: NotificationOutboxState;
  linkIncluded: boolean;
  provenance: Readonly<INotificationSourceProvenance>;
}

export interface INotificationTemplateContract {
  schema: 'KCF.NotificationTemplate';
  schemaVersion: '1.0.0';
  templateKey: string;
  templateVersion: string;
  kind: 'EmployeeFinalReminder7Day';
  titleText: string;
  instructionText: string;
  fieldOrder: readonly ['performanceYear', 'periodLabel', 'deadlineAt', 'actionLink'];
  configKey: string;
  configVersion: string;
}

export interface IRenderedNotificationTemplate {
  templateKey: string;
  templateVersion: string;
  kind: 'EmployeeFinalReminder7Day';
  titleText: string;
  instructionText: string;
  fields: Readonly<{
    performanceYear: string;
    periodLabel: string;
    deadlineAt: string;
    actionLink: string;
  }>;
  provenance: Readonly<{
    templateSchemaVersion: '1.0.0';
    templateKey: string;
    templateVersion: string;
    configKey: string;
    configVersion: string;
  }>;
}

export interface IDisabledNotificationDeliveryAdapterConfig {
  adapterKey: string;
  adapterVersion: string;
  provider: 'SyntheticDisabled';
  enabled: false;
  bindingState: 'Unbound';
}

export interface INotificationDeliveryCapability {
  capabilityKey: string;
  outboxKey: string;
  attemptKey: string;
  expectedOutboxVersion: number;
  templateKey: string;
  templateVersion: string;
  adapterKey: string;
  adapterVersion: string;
}

export interface IDisabledNotificationDeliveryRequest {
  outcomeIdempotencyKey: string;
  outcomeAt: string;
  runtimeBindingCapability?: unknown;
}

export interface INotificationDeliveryFailureEvidence {
  failureKey: string;
  eventKey: string;
  outboxKey: string;
  attemptKey: string;
  recipientReference: string;
  channel: NotificationChannel;
  scheduledAt: string;
  attemptedAt: string;
  outcomeAt: string;
  outcomeCode: 'DELIVERY_ADAPTER_DISABLED_UNBOUND';
  retryEligible: true;
  linkIncluded: boolean;
  templateProvenance: Readonly<IRenderedNotificationTemplate['provenance']>;
  adapterProvenance: Readonly<{
    adapterKey: string;
    adapterVersion: string;
    provider: 'SyntheticDisabled';
    enabled: false;
    bindingState: 'Unbound';
  }>;
  configProvenance: Readonly<INotificationSourceProvenance>;
}

export interface IDisabledNotificationDeliveryResult {
  status: 'FailedTransient';
  outcomeIdempotencyKey: string;
  outbox: Readonly<INotificationOutboxRecord>;
  outcome: Readonly<INotificationOutcomeInput>;
  renderedTemplate: Readonly<IRenderedNotificationTemplate>;
  failure: Readonly<INotificationDeliveryFailureEvidence>;
}
