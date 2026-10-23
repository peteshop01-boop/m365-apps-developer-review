import { controlledApplicationRoles } from '../ControlledApplicationRoles';
import type { IProductionPerson } from '../../models/ProductionModels';
import { NOTIFICATION_EVENT_KINDS } from './NotificationModels';
import type {
  IDisabledNotificationDeliveryAdapterConfig,
  IDisabledNotificationDeliveryRequest,
  IDisabledNotificationDeliveryResult,
  INotificationAttempt,
  INotificationAuditEvidence,
  INotificationDeliveryCapability,
  INotificationDeliveryFailureEvidence,
  INotificationDigest,
  INotificationEvaluationInput,
  INotificationEventConfig,
  INotificationOutboxRecord,
  INotificationOutcomeInput,
  INotificationPlanResult,
  INotificationResendAuthorisation,
  INotificationResendDecision,
  INotificationSafeLinkPolicy,
  INotificationTemplateContract,
  IRenderedNotificationTemplate,
  NotificationEventKind,
  NotificationPeriodKey,
  NotificationWorkflowState
} from './NotificationModels';
import {
  NOTIFICATION_KEY_PATTERN,
  NOTIFICATION_SAFE_CODE_PATTERN,
  NOTIFICATION_VERSION_PATTERN,
  assertNotificationAttemptShape,
  assertNotificationOutcomeShape,
  assertNotificationOutboxShape,
  assertNotificationRecordKeys,
  captureNotificationProtectedData,
  encodeNotificationIdentity,
  exactNotificationData,
  isCanonicalNotificationUtc,
  isSafeNotificationLink,
  notificationStateForOutcome
} from './NotificationBoundary';

const DAY_MS = 24 * 60 * 60 * 1000;
const actionableStates: readonly NotificationWorkflowState[] = ['NotStarted', 'Draft', 'ChangesRequested'];
type AuthorityUse = 'Available' | 'Consumed';

interface IResendAuthorityState {
  readonly authorisation: Readonly<INotificationResendAuthorisation>;
  readonly original: Readonly<INotificationOutboxRecord>;
  planUse: AuthorityUse;
}

interface IOutboxAuthorityState {
  readonly record: Readonly<INotificationOutboxRecord>;
  readonly safeLinkPolicy?: Readonly<INotificationSafeLinkPolicy>;
  readonly phase: 'Planned' | 'Attempting' | 'Completed';
  readonly attempt?: Readonly<INotificationAttempt>;
  readonly outcome?: Readonly<INotificationOutcomeInput>;
  beginUse?: AuthorityUse;
  completionUse?: AuthorityUse;
  auditCache?: Readonly<INotificationAuditEvidence>;
}

interface IAttemptAuthorityState {
  readonly attempt: Readonly<INotificationAttempt>;
  readonly outbox: Readonly<INotificationOutboxRecord>;
  completionUse: AuthorityUse;
}

interface IDeliveryAuthorityState {
  readonly capability: Readonly<INotificationDeliveryCapability>;
  readonly outbox: Readonly<INotificationOutboxRecord>;
  readonly attempt: Readonly<INotificationAttempt>;
  readonly renderedTemplate: Readonly<IRenderedNotificationTemplate>;
  readonly adapter: Readonly<IDisabledNotificationDeliveryAdapterConfig>;
  executionState: 'Available' | 'Executing' | 'Completed';
  completionRequest?: Readonly<IDisabledNotificationDeliveryRequest>;
  result?: Readonly<IDisabledNotificationDeliveryResult>;
}

const governedResendAuthorisations = new WeakMap<object, IResendAuthorityState>();
const governedResendAuthorisationsByKey = new Map<string, IResendAuthorityState>();
const issuedOutboxes = new WeakMap<object, IOutboxAuthorityState>();
const issuedAttempts = new WeakMap<object, IAttemptAuthorityState>();
const issuedDeliveryCapabilities = new WeakMap<object, IDeliveryAuthorityState>();

export const isCanonicalUtcTimestamp = isCanonicalNotificationUtc;

const normalEmail = (value: string): string => value.trim().toLowerCase();

export const isSafeNotificationActionLink = (
  value: string,
  policy: Readonly<INotificationSafeLinkPolicy> | undefined
): boolean => isSafeNotificationLink(value, policy);

const requireIssuedOutbox = (
  source: Readonly<INotificationOutboxRecord>,
  label: string
): IOutboxAuthorityState => {
  if (!source || typeof source !== 'object') throw new Error('Exact issued notification outbox is required.');
  const authority = issuedOutboxes.get(source);
  if (!authority) throw new Error('Exact issued notification outbox is required.');
  const snapshot = captureNotificationProtectedData(source, label).value;
  if (!exactNotificationData(snapshot, authority.record)) throw new Error('Issued notification outbox was altered.');
  assertNotificationOutboxShape(authority.record, authority.safeLinkPolicy);
  return authority;
};

const requireIssuedAttempt = (
  source: Readonly<INotificationAttempt>,
  label: string
): IAttemptAuthorityState => {
  if (!source || typeof source !== 'object') throw new Error('Exact issued notification attempt is required.');
  const authority = issuedAttempts.get(source);
  if (!authority) throw new Error('Exact issued notification attempt is required.');
  const snapshot = captureNotificationProtectedData(source, label).value;
  if (!exactNotificationData(snapshot, authority.attempt)) throw new Error('Issued notification attempt was altered.');
  assertNotificationAttemptShape(authority.attempt);
  return authority;
};

const registerPlannedOutbox = (
  record: INotificationOutboxRecord,
  safeLinkPolicy: Readonly<INotificationSafeLinkPolicy> | undefined
): Readonly<INotificationOutboxRecord> => {
  const issued = captureNotificationProtectedData(record, 'plannedOutbox').value;
  const policy = safeLinkPolicy === undefined
    ? undefined : captureNotificationProtectedData(safeLinkPolicy, 'safeLinkPolicy').value;
  assertNotificationOutboxShape(issued, policy);
  issuedOutboxes.set(issued, {
    record: issued,
    safeLinkPolicy: policy,
    phase: 'Planned',
    beginUse: 'Available'
  });
  return issued;
};

const registerAttemptTransition = (
  previous: IOutboxAuthorityState,
  outbox: INotificationOutboxRecord,
  attempt: INotificationAttempt
): Readonly<INotificationAttemptTransition> => {
  const issuedOutbox = captureNotificationProtectedData(outbox, 'attemptingOutbox').value;
  const issuedAttempt = captureNotificationProtectedData(attempt, 'attempt').value;
  assertNotificationOutboxShape(issuedOutbox, previous.safeLinkPolicy);
  assertNotificationAttemptShape(issuedAttempt);
  const outboxAuthority: IOutboxAuthorityState = {
    record: issuedOutbox,
    safeLinkPolicy: previous.safeLinkPolicy,
    phase: 'Attempting',
    attempt: issuedAttempt,
    completionUse: 'Available'
  };
  const attemptAuthority: IAttemptAuthorityState = {
    attempt: issuedAttempt,
    outbox: issuedOutbox,
    completionUse: 'Available'
  };
  issuedOutboxes.set(issuedOutbox, outboxAuthority);
  issuedAttempts.set(issuedAttempt, attemptAuthority);
  previous.beginUse = 'Consumed';
  return Object.freeze({ outbox: issuedOutbox, attempt: issuedAttempt });
};

const registerCompletedOutbox = (
  previous: IOutboxAuthorityState,
  attemptAuthority: IAttemptAuthorityState,
  outbox: INotificationOutboxRecord,
  outcome: Readonly<INotificationOutcomeInput>
): Readonly<INotificationOutboxRecord> => {
  if (previous.completionUse !== 'Available' || attemptAuthority.completionUse !== 'Available') {
    throw new Error('Notification completion authority has already been consumed.');
  }
  const issued = captureNotificationProtectedData(outbox, 'completedOutbox').value;
  assertNotificationOutboxShape(issued, previous.safeLinkPolicy);
  const authority: IOutboxAuthorityState = {
    record: issued,
    safeLinkPolicy: previous.safeLinkPolicy,
    phase: 'Completed',
    attempt: attemptAuthority.attempt,
    outcome,
    beginUse: issued.state === 'FailedTransient' ? 'Available' : undefined
  };
  issuedOutboxes.set(issued, authority);
  previous.completionUse = 'Consumed';
  attemptAuthority.completionUse = 'Consumed';
  return issued;
};

const expectedReminderDays = (kind: NotificationEventKind): number | undefined => {
  if (kind === 'EmployeeReadiness30Day') return 30;
  if (kind === 'EmployeePreparation14Day') return 14;
  if (kind === 'EmployeeFinalReminder7Day') return 7;
  return undefined;
};

const periodIsValid = (kind: NotificationEventKind, periodKey: NotificationPeriodKey, periodLabel: string): boolean => {
  if (kind === 'QuarterlyCycleOpen') return periodKey !== 'Annual'
    && periodLabel.trim().toUpperCase().startsWith(periodKey);
  return periodKey === 'Annual';
};

export const validateNotificationEventConfig = (config: Readonly<INotificationEventConfig>): readonly string[] => {
  const issues: string[] = [];
  if (!NOTIFICATION_EVENT_KINDS.includes(config.kind)) issues.push('Notification event kind is unsupported.');
  if (!NOTIFICATION_KEY_PATTERN.test(config.eventKey) || !NOTIFICATION_KEY_PATTERN.test(config.configKey)
    || !NOTIFICATION_VERSION_PATTERN.test(config.configVersion)) issues.push('Config identity is malformed.');
  if (!/^\d{4}\/\d{2}$/.test(config.performanceYear)
    || !Number.isInteger(config.performanceYearNumber)
    || config.performanceYearNumber !== Number(config.performanceYear.slice(0, 4))) {
    issues.push('Performance year is malformed or inconsistent.');
  }
  if (!periodIsValid(config.kind, config.periodKey, config.periodLabel)) issues.push('Configured period is invalid for the event kind.');
  if (!config.periodLabel.trim() || config.periodLabel.length > 120) issues.push('Configured period label is invalid.');
  if (!isCanonicalUtcTimestamp(config.scheduledAt) || !isCanonicalUtcTimestamp(config.deadlineAt)
    || Date.parse(config.deadlineAt) <= Date.parse(config.scheduledAt)) issues.push('Configured schedule or deadline is not canonical UTC chronology.');
  const reminderDays = expectedReminderDays(config.kind);
  if (reminderDays !== undefined) {
    const isFinalReminder = config.kind === 'EmployeeFinalReminder7Day';
    if (config.opensAt !== undefined
      || (!isFinalReminder && config.actionLink !== undefined)
      || (isFinalReminder && !config.actionLink)
      || Date.parse(config.deadlineAt) - Date.parse(config.scheduledAt) !== reminderDays * DAY_MS) {
      issues.push(`${reminderDays}-day reminder configuration is not on its exact UTC boundary.`);
    }
  } else {
    if (!isCanonicalUtcTimestamp(config.opensAt) || config.opensAt !== config.scheduledAt) {
      issues.push('Open-cycle event must run at the exact canonical UTC Opens At boundary.');
    }
    if (!config.actionLink) issues.push('Open-cycle event requires a governed safe direct action link.');
  }
  if (config.kind === 'AnnualCycleOpen' && config.periodLabel !== config.performanceYear) {
    issues.push('Annual open-cycle period label must equal the configured performance year.');
  }
  if (config.channel !== 'Email' && config.channel !== 'Teams') issues.push('Notification channel is unsupported.');
  if (config.actionLink !== undefined && !isSafeNotificationActionLink(config.actionLink, config.safeLinkPolicy)) {
    issues.push('Action link is outside the governed safe-link policy.');
  }
  return Object.freeze(Array.from(new Set(issues)));
};

const resolveRecipient = (
  people: ReadonlyArray<Readonly<IProductionPerson>>,
  personKey: string,
  email: string
): Readonly<{ person?: Readonly<IProductionPerson>; reason?: INotificationPlanResult['reason'] }> => {
  if (!NOTIFICATION_KEY_PATTERN.test(personKey) || !email.trim() || !email.includes('@') || /\s/.test(email)) {
    return { reason: 'RecipientIdentityMismatch' };
  }
  const keyMatches = people.filter(person => person.personKey === personKey);
  const emailMatches = people.filter(person => normalEmail(person.email) === normalEmail(email));
  if (keyMatches.length > 1 || emailMatches.length > 1) return { reason: 'AmbiguousPeopleIdentity' };
  if (keyMatches.length !== 1 || emailMatches.length !== 1 || keyMatches[0] !== emailMatches[0]) {
    return { reason: 'RecipientIdentityMismatch' };
  }
  const person = keyMatches[0];
  if (!person.active) return { reason: 'InactiveRecipient' };
  const roles = controlledApplicationRoles(person.appRoles);
  if (!roles || !roles.includes('Employee')) return { reason: 'IneligibleRecipientRole' };
  return { person };
};

const samePlannedIdentity = (left: INotificationOutboxRecord, right: INotificationOutboxRecord): boolean =>
  left.outboxKey === right.outboxKey && left.eventKey === right.eventKey
  && left.recipientIdempotencyKey === right.recipientIdempotencyKey
  && left.recipientReference === right.recipientReference && left.kind === right.kind
  && left.channel === right.channel && left.scheduledAt === right.scheduledAt
  && JSON.stringify(left.digest) === JSON.stringify(right.digest)
  && JSON.stringify(left.provenance) === JSON.stringify(right.provenance)
  && JSON.stringify(left.resendDistinction) === JSON.stringify(right.resendDistinction);

const assertPlanningShapes = (
  input: Readonly<INotificationEvaluationInput>,
  existingOutbox: ReadonlyArray<Readonly<INotificationOutboxRecord>>
): void => {
  assertNotificationRecordKeys(input, [
    'now', 'config', 'people', 'intendedRecipient', 'workflow', 'expectedWorkflowState', 'expectedWorkflowVersion'
  ], ['resend']);
  assertNotificationRecordKeys(input.config, [
    'eventKey', 'kind', 'configKey', 'configVersion', 'performanceYear', 'performanceYearNumber', 'periodKey',
    'periodLabel', 'scheduledAt', 'deadlineAt', 'channel'
  ], ['opensAt', 'actionLink', 'safeLinkPolicy']);
  if (input.config.safeLinkPolicy !== undefined) {
    assertNotificationRecordKeys(input.config.safeLinkPolicy, ['allowedOrigins', 'allowedPathPrefixes']);
  }
  if (!Array.isArray(input.people) || !Array.isArray(existingOutbox)) throw new Error('Notification planning arrays are invalid.');
  input.people.forEach(person => {
    assertNotificationRecordKeys(person, ['id', 'personKey', 'displayName', 'email', 'appRoles', 'active'], [
      'managerPersonKey', 'managerEmail', 'team', 'jobRole', 'behaviourRoleTierV2', 'behaviourCadenceV2',
      'behaviourFrameworkVersionV2'
    ]);
    if (!Array.isArray(person.appRoles)) throw new Error('Notification People role data is invalid.');
  });
  assertNotificationRecordKeys(input.intendedRecipient, ['personKey', 'email']);
  assertNotificationRecordKeys(input.workflow, [
    'workflowKey', 'employeePersonKey', 'performanceYearNumber', 'periodKey', 'state', 'sourceVersion'
  ]);
  existingOutbox.forEach(record => assertNotificationOutboxShape(record, input.config.safeLinkPolicy));
};

export const authoriseNotificationResend = (
  original: Readonly<INotificationOutboxRecord>,
  decision: Readonly<INotificationResendDecision>
): Readonly<INotificationResendAuthorisation> => {
  const originalAuthority = requireIssuedOutbox(original, 'resendOriginal');
  if (originalAuthority.record.resendDistinction) throw new Error('A resend cannot authorise another resend.');
  const captured = captureNotificationProtectedData(decision, 'resendDecision').value;
  assertNotificationRecordKeys(captured, ['decision', 'distinctionKey', 'governanceReference']);
  if (captured.decision !== 'Approved' || !NOTIFICATION_SAFE_CODE_PATTERN.test(captured.distinctionKey)
    || !NOTIFICATION_KEY_PATTERN.test(captured.governanceReference)) {
    throw new Error('A governed approved resend decision is required.');
  }
  const candidate = {
    authorityKey: encodeNotificationIdentity('resend-authority', [
      originalAuthority.record.outboxKey,
      originalAuthority.record.eventKey,
      originalAuthority.record.recipientReference,
      originalAuthority.record.provenance.workflowKey,
      captured.distinctionKey,
      captured.governanceReference,
      'Approved'
    ]),
    decision: 'Approved' as const,
    distinctionKey: captured.distinctionKey,
    governanceReference: captured.governanceReference,
    originalOutboxKey: originalAuthority.record.outboxKey,
    eventKey: originalAuthority.record.eventKey,
    recipientReference: originalAuthority.record.recipientReference,
    workflowKey: originalAuthority.record.provenance.workflowKey
  };
  const existing = governedResendAuthorisationsByKey.get(candidate.authorityKey);
  if (existing) {
    if (existing.original !== originalAuthority.record
      || !exactNotificationData(existing.authorisation, candidate)) {
      throw new Error('Conflicting governed resend authority binding.');
    }
    return existing.authorisation;
  }
  const authorisation = captureNotificationProtectedData(candidate, 'resendAuthorisation').value;
  const authority: IResendAuthorityState = {
    authorisation,
    original: originalAuthority.record,
    planUse: 'Available'
  };
  governedResendAuthorisations.set(authorisation, authority);
  governedResendAuthorisationsByKey.set(authorisation.authorityKey, authority);
  return authorisation;
};

export const planNotificationOutbox = (
  input: Readonly<INotificationEvaluationInput>,
  existingOutbox: ReadonlyArray<Readonly<INotificationOutboxRecord>>
): Readonly<INotificationPlanResult> => {
  let capturedInput: ReturnType<typeof captureNotificationProtectedData<INotificationEvaluationInput>>;
  let capturedExisting: ReturnType<typeof captureNotificationProtectedData<ReadonlyArray<Readonly<INotificationOutboxRecord>>>>;
  try {
    capturedInput = captureNotificationProtectedData(input, 'planningInput');
    capturedExisting = captureNotificationProtectedData(existingOutbox, 'existingOutbox');
    assertPlanningShapes(capturedInput.value, capturedExisting.value);
  } catch {
    return Object.freeze({ status: 'Rejected', reason: 'MalformedConfig' });
  }
  const plannedInput = capturedInput.value;
  const existing = capturedExisting.value;
  if (plannedInput.config.actionLink !== undefined
    && !isSafeNotificationActionLink(plannedInput.config.actionLink, plannedInput.config.safeLinkPolicy)) {
    return Object.freeze({ status: 'Rejected', reason: 'UnsafeActionLink' });
  }
  if (validateNotificationEventConfig(plannedInput.config).length > 0 || !isCanonicalUtcTimestamp(plannedInput.now)) {
    return Object.freeze({ status: 'Rejected', reason: 'MalformedConfig' });
  }
  const recipient = resolveRecipient(plannedInput.people,
    plannedInput.intendedRecipient.personKey, plannedInput.intendedRecipient.email);
  if (!recipient.person) return Object.freeze({ status: 'Rejected', reason: recipient.reason as INotificationPlanResult['reason'] });
  if (plannedInput.workflow.employeePersonKey !== recipient.person.personKey
    || plannedInput.workflow.performanceYearNumber !== plannedInput.config.performanceYearNumber
    || plannedInput.workflow.periodKey !== plannedInput.config.periodKey) {
    return Object.freeze({ status: 'Rejected', reason: 'WrongPeriodOrEmployee' });
  }
  if (plannedInput.expectedWorkflowVersion !== plannedInput.workflow.sourceVersion
    || plannedInput.expectedWorkflowState !== plannedInput.workflow.state
    || !NOTIFICATION_KEY_PATTERN.test(plannedInput.workflow.workflowKey)
    || !Number.isInteger(plannedInput.workflow.sourceVersion) || plannedInput.workflow.sourceVersion < 1) {
    return Object.freeze({ status: 'Rejected', reason: 'StaleWorkflowState' });
  }
  if (!actionableStates.includes(plannedInput.workflow.state)) {
    return Object.freeze({ status: 'Suppressed', reason: 'NotActionableState' });
  }
  if (plannedInput.now !== plannedInput.config.scheduledAt) {
    return Object.freeze({ status: 'Suppressed', reason: 'NotScheduledBoundary' });
  }
  const baseKey = encodeNotificationIdentity('outbox', [
    plannedInput.config.eventKey, recipient.person.personKey, plannedInput.workflow.workflowKey
  ]);
  let resendAuthority: IResendAuthorityState | undefined;
  if (plannedInput.resend) {
    try {
      assertNotificationRecordKeys(plannedInput.resend, [
        'authorityKey', 'decision', 'distinctionKey', 'governanceReference', 'originalOutboxKey',
        'eventKey', 'recipientReference', 'workflowKey'
      ]);
      const source = capturedInput.sourceOf(plannedInput.resend);
      const governed = source ? governedResendAuthorisations.get(source) : undefined;
      const originalPresent = governed && existing.some(record =>
        capturedExisting.sourceOf(record) === governed.original);
      if (!governed || governed.planUse !== 'Available'
        || !exactNotificationData(plannedInput.resend, governed.authorisation) || !originalPresent
        || plannedInput.resend.decision !== 'Approved' || plannedInput.resend.originalOutboxKey !== baseKey
        || plannedInput.resend.eventKey !== plannedInput.config.eventKey
        || plannedInput.resend.recipientReference !== recipient.person.personKey
        || plannedInput.resend.workflowKey !== plannedInput.workflow.workflowKey) {
        throw new Error('Invalid governed resend authority.');
      }
      resendAuthority = governed;
    } catch {
      return Object.freeze({ status: 'Rejected', reason: 'InvalidResendDistinction' });
    }
  }
  const recipientIdempotencyKey = plannedInput.resend
    ? encodeNotificationIdentity('resend-outbox', [
      plannedInput.config.eventKey,
      recipient.person.personKey,
      plannedInput.workflow.workflowKey,
      plannedInput.resend.distinctionKey,
      plannedInput.resend.governanceReference
    ]) : baseKey;
  const digest: INotificationDigest = {
    kind: plannedInput.config.kind,
    performanceYear: plannedInput.config.performanceYear,
    periodKey: plannedInput.config.periodKey,
    periodLabel: plannedInput.config.periodLabel,
    deadlineAt: plannedInput.config.deadlineAt,
    actionLink: plannedInput.config.actionLink
  };
  const candidate: INotificationOutboxRecord = {
    outboxKey: recipientIdempotencyKey,
    eventKey: plannedInput.config.eventKey,
    recipientIdempotencyKey,
    recipientReference: recipient.person.personKey,
    kind: plannedInput.config.kind,
    channel: plannedInput.config.channel,
    scheduledAt: plannedInput.config.scheduledAt,
    digest,
    provenance: {
      configKey: plannedInput.config.configKey,
      configVersion: plannedInput.config.configVersion,
      workflowKey: plannedInput.workflow.workflowKey,
      workflowVersion: plannedInput.workflow.sourceVersion,
      workflowState: plannedInput.workflow.state,
      performanceYearNumber: plannedInput.workflow.performanceYearNumber,
      periodKey: plannedInput.workflow.periodKey
    },
    resendDistinction: plannedInput.resend ? {
      distinctionKey: plannedInput.resend.distinctionKey,
      governanceReference: plannedInput.resend.governanceReference
    } : undefined,
    state: 'Queued', attemptCount: 0, version: 1
  };
  const matches = existing.filter(record => record.outboxKey === candidate.outboxKey);
  if (matches.length > 1 || (matches.length === 1 && !samePlannedIdentity(matches[0], candidate))) {
    return Object.freeze({ status: 'Rejected', reason: 'ConflictingOutboxState' });
  }
  if (matches.length === 1) return Object.freeze({ status: 'Suppressed', reason: 'DuplicateOutboxKey' });
  const issued = registerPlannedOutbox(candidate, plannedInput.config.safeLinkPolicy);
  if (resendAuthority) resendAuthority.planUse = 'Consumed';
  return Object.freeze({
    status: 'Queued', reason: 'Eligible',
    outbox: issued
  });
};

export interface INotificationAttemptTransition {
  outbox: Readonly<INotificationOutboxRecord>;
  attempt: Readonly<INotificationAttempt>;
}

export const beginNotificationAttempt = (
  current: Readonly<INotificationOutboxRecord>,
  attemptedAt: string
): Readonly<INotificationAttemptTransition> => {
  const authority = requireIssuedOutbox(current, 'beginOutbox');
  const record = authority.record;
  if (record.state !== 'Queued' && record.state !== 'FailedTransient') {
    throw new Error('Only a queued or transiently failed notification may begin an attempt.');
  }
  if (authority.beginUse !== 'Available') {
    throw new Error('Notification begin authority has already been consumed.');
  }
  const attemptedAtSnapshot = captureNotificationProtectedData(attemptedAt, 'attemptedAt').value;
  if (!isCanonicalNotificationUtc(attemptedAtSnapshot) || attemptedAtSnapshot < record.scheduledAt) {
    throw new Error('Notification attempt time must be canonical UTC at or after its scheduled time.');
  }
  const attemptNumber = record.attemptCount + 1;
  const attempt: INotificationAttempt = {
    attemptKey: encodeNotificationIdentity('attempt', [record.outboxKey, String(attemptNumber)]),
    outboxKey: record.outboxKey,
    attemptNumber,
    attemptedAt: attemptedAtSnapshot,
    expectedOutboxVersion: record.version
  };
  const outbox: INotificationOutboxRecord = {
    ...record,
    state: 'Attempting',
    attemptCount: attemptNumber,
    lastAttemptAt: attemptedAtSnapshot,
    lastOutcomeAt: undefined,
    lastOutcomeCode: undefined,
    version: record.version + 1
  };
  return registerAttemptTransition(authority, outbox, attempt);
};

export const completeNotificationAttempt = (
  current: Readonly<INotificationOutboxRecord>,
  attempt: Readonly<INotificationAttempt>,
  outcome: Readonly<INotificationOutcomeInput>
): Readonly<INotificationOutboxRecord> => {
  const authority = requireIssuedOutbox(current, 'completeOutbox');
  const record = authority.record;
  const attemptAuthority = requireIssuedAttempt(attempt, 'completeAttempt');
  if (authority.phase !== 'Attempting' || !authority.attempt
    || attemptAuthority.outbox !== authority.record
    || !exactNotificationData(attemptAuthority.attempt, authority.attempt)
    || record.state !== 'Attempting' || record.outboxKey !== attemptAuthority.attempt.outboxKey
    || record.attemptCount !== attemptAuthority.attempt.attemptNumber
    || record.version !== attemptAuthority.attempt.expectedOutboxVersion + 1
    || record.lastAttemptAt !== attemptAuthority.attempt.attemptedAt) {
    throw new Error('Attempt completion does not match the exact current outbox transition.');
  }
  const outcomeSnapshot = captureNotificationProtectedData(outcome, 'outcome').value;
  assertNotificationOutcomeShape(outcomeSnapshot);
  if (outcomeSnapshot.outcomeAt < attemptAuthority.attempt.attemptedAt) {
    throw new Error('Notification outcome time or code is invalid.');
  }
  if (authority.completionUse !== 'Available' || attemptAuthority.completionUse !== 'Available') {
    throw new Error('Notification completion authority has already been consumed.');
  }
  const completed: INotificationOutboxRecord = {
    ...record,
    state: notificationStateForOutcome(outcomeSnapshot.outcome),
    lastOutcomeAt: outcomeSnapshot.outcomeAt,
    lastOutcomeCode: outcomeSnapshot.outcomeCode,
    version: record.version + 1
  };
  return registerCompletedOutbox(authority, attemptAuthority, completed, outcomeSnapshot);
};

export const canRetryNotification = (record: Readonly<INotificationOutboxRecord>): boolean => {
  try {
    const authority = requireIssuedOutbox(record, 'retryOutbox');
    return authority.record.state === 'FailedTransient' && authority.beginUse === 'Available';
  } catch { return false; }
};

/** Produces redacted audit evidence: no email, display name, message text or link value. */
export const createNotificationAuditEvidence = (
  completed: Readonly<INotificationOutboxRecord>,
  attempt: Readonly<INotificationAttempt>,
  outcome: Readonly<INotificationOutcomeInput>
): Readonly<INotificationAuditEvidence> => {
  const authority = requireIssuedOutbox(completed, 'completed');
  if (authority.phase !== 'Completed' || !authority.attempt || !authority.outcome) {
    throw new Error('The exact completed notification transition is required.');
  }
  const attemptAuthority = requireIssuedAttempt(attempt, 'auditAttempt');
  const outcomeSnapshot = captureNotificationProtectedData(outcome, 'auditOutcome').value;
  assertNotificationOutcomeShape(outcomeSnapshot);
  if (attemptAuthority.attempt !== authority.attempt
    || !exactNotificationData(outcomeSnapshot, authority.outcome)
    || authority.record.outboxKey !== authority.attempt.outboxKey
    || authority.record.attemptCount !== authority.attempt.attemptNumber
    || authority.record.lastAttemptAt !== authority.attempt.attemptedAt
    || authority.record.lastOutcomeAt !== authority.outcome.outcomeAt
    || authority.record.lastOutcomeCode !== authority.outcome.outcomeCode
    || authority.record.state !== notificationStateForOutcome(authority.outcome.outcome)) {
    throw new Error('Audit evidence requires the exact completed outbox attempt and outcome.');
  }
  if (authority.auditCache) return authority.auditCache;
  const evidence = captureNotificationProtectedData({
    auditKey: encodeNotificationIdentity('audit', [
      authority.attempt.attemptKey,
      authority.outcome.outcome,
      authority.outcome.outcomeAt,
      authority.outcome.outcomeCode
    ]),
    eventKey: authority.record.eventKey,
    outboxKey: authority.record.outboxKey,
    recipientReference: authority.record.recipientReference,
    channel: authority.record.channel,
    scheduledAt: authority.record.scheduledAt,
    attemptedAt: authority.attempt.attemptedAt,
    outcomeAt: authority.outcome.outcomeAt,
    attemptNumber: authority.attempt.attemptNumber,
    outcome: authority.outcome.outcome,
    outcomeCode: authority.outcome.outcomeCode,
    finalOutboxState: authority.record.state,
    linkIncluded: Boolean(authority.record.digest.actionLink),
    provenance: authority.record.provenance
  }, 'auditEvidence').value;
  authority.auditCache = evidence;
  return evidence;
};

const FINAL_REMINDER_FIELDS = Object.freeze([
  'performanceYear', 'periodLabel', 'deadlineAt', 'actionLink'
] as const);

const formulaNeutralText = (value: string, maximumLength: number): boolean =>
  typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= maximumLength
  && !/[{}<>=\r\n]/.test(value) && !value.includes('$(') && !/javascript:/i.test(value)
  && !Array.from(value).some(character => character.charCodeAt(0) <= 31);

const captureNotificationTemplate = (
  source: Readonly<INotificationTemplateContract>
): Readonly<INotificationTemplateContract> => {
  const template = captureNotificationProtectedData(source, 'notificationTemplate').value;
  assertNotificationRecordKeys(template, [
    'schema', 'schemaVersion', 'templateKey', 'templateVersion', 'kind', 'titleText', 'instructionText',
    'fieldOrder', 'configKey', 'configVersion'
  ]);
  if (template.schema !== 'DEMO.NotificationTemplate' || template.schemaVersion !== '1.0.0'
    || template.kind !== 'EmployeeFinalReminder7Day'
    || !NOTIFICATION_KEY_PATTERN.test(template.templateKey)
    || !NOTIFICATION_VERSION_PATTERN.test(template.templateVersion)
    || !NOTIFICATION_KEY_PATTERN.test(template.configKey)
    || !NOTIFICATION_VERSION_PATTERN.test(template.configVersion)
    || !formulaNeutralText(template.titleText, 200)
    || !formulaNeutralText(template.instructionText, 500)
    || !Array.isArray(template.fieldOrder)
    || !exactNotificationData(template.fieldOrder, FINAL_REMINDER_FIELDS)) {
    throw new Error('Notification template contract is malformed or not formula-neutral.');
  }
  return template;
};

const captureDisabledAdapter = (
  source: Readonly<IDisabledNotificationDeliveryAdapterConfig>
): Readonly<IDisabledNotificationDeliveryAdapterConfig> => {
  const adapter = captureNotificationProtectedData(source, 'disabledDeliveryAdapter').value;
  assertNotificationRecordKeys(adapter, [
    'adapterKey', 'adapterVersion', 'provider', 'enabled', 'bindingState'
  ]);
  if (!NOTIFICATION_KEY_PATTERN.test(adapter.adapterKey)
    || !NOTIFICATION_VERSION_PATTERN.test(adapter.adapterVersion)
    || adapter.provider !== 'SyntheticDisabled' || adapter.enabled !== false || adapter.bindingState !== 'Unbound') {
    throw new Error('Notification delivery adapter must remain disabled, synthetic and unbound.');
  }
  return adapter;
};

export const renderFinalReminderTemplate = (
  outbox: Readonly<INotificationOutboxRecord>,
  templateSource: Readonly<INotificationTemplateContract>
): Readonly<IRenderedNotificationTemplate> => {
  const authority = requireIssuedOutbox(outbox, 'templateOutbox');
  const record = authority.record;
  const template = captureNotificationTemplate(templateSource);
  if (record.kind !== 'EmployeeFinalReminder7Day' || record.digest.kind !== template.kind
    || !record.digest.actionLink
    || record.provenance.configKey !== template.configKey
    || record.provenance.configVersion !== template.configVersion) {
    throw new Error('Notification template does not match the exact final-reminder configuration provenance.');
  }
  return captureNotificationProtectedData({
    templateKey: template.templateKey,
    templateVersion: template.templateVersion,
    kind: template.kind,
    titleText: template.titleText,
    instructionText: template.instructionText,
    fields: {
      performanceYear: record.digest.performanceYear,
      periodLabel: record.digest.periodLabel,
      deadlineAt: record.digest.deadlineAt,
      actionLink: record.digest.actionLink
    },
    provenance: {
      templateSchemaVersion: template.schemaVersion,
      templateKey: template.templateKey,
      templateVersion: template.templateVersion,
      configKey: template.configKey,
      configVersion: template.configVersion
    }
  }, 'renderedNotificationTemplate').value;
};

export const prepareDisabledNotificationDelivery = (
  outbox: Readonly<INotificationOutboxRecord>,
  attempt: Readonly<INotificationAttempt>,
  templateSource: Readonly<INotificationTemplateContract>,
  adapterSource: Readonly<IDisabledNotificationDeliveryAdapterConfig>
): Readonly<INotificationDeliveryCapability> => {
  const outboxAuthority = requireIssuedOutbox(outbox, 'deliveryOutbox');
  const attemptAuthority = requireIssuedAttempt(attempt, 'deliveryAttempt');
  if (outboxAuthority.phase !== 'Attempting' || !outboxAuthority.attempt
    || attemptAuthority.outbox !== outboxAuthority.record
    || !exactNotificationData(attemptAuthority.attempt, outboxAuthority.attempt)
    || outboxAuthority.record.state !== 'Attempting'
    || outboxAuthority.record.version !== attemptAuthority.attempt.expectedOutboxVersion + 1) {
    throw new Error('Disabled delivery preparation requires the exact current issued attempt transition.');
  }
  const renderedTemplate = renderFinalReminderTemplate(outboxAuthority.record, templateSource);
  const adapter = captureDisabledAdapter(adapterSource);
  const candidate: INotificationDeliveryCapability = {
    capabilityKey: encodeNotificationIdentity('delivery-capability', [
      outboxAuthority.record.outboxKey,
      attemptAuthority.attempt.attemptKey,
      renderedTemplate.templateKey,
      renderedTemplate.templateVersion,
      adapter.adapterKey,
      adapter.adapterVersion
    ]),
    outboxKey: outboxAuthority.record.outboxKey,
    attemptKey: attemptAuthority.attempt.attemptKey,
    expectedOutboxVersion: outboxAuthority.record.version,
    templateKey: renderedTemplate.templateKey,
    templateVersion: renderedTemplate.templateVersion,
    adapterKey: adapter.adapterKey,
    adapterVersion: adapter.adapterVersion
  };
  const capability = captureNotificationProtectedData(candidate, 'deliveryCapability').value;
  const authority: IDeliveryAuthorityState = {
    capability,
    outbox: outboxAuthority.record,
    attempt: attemptAuthority.attempt,
    renderedTemplate,
    adapter,
    executionState: 'Available'
  };
  issuedDeliveryCapabilities.set(capability, authority);
  return capability;
};

/**
 * Disabled by construction: no runtime binding issuer, endpoint or provider send exists in this component.
 * A supplied binding-shaped object is therefore forged and rejected. Missing binding records one local,
 * deterministic transient failure so a later separately authorised runtime may retry without workflow mutation.
 */
export const executeDisabledNotificationDelivery = (
  capabilitySource: Readonly<INotificationDeliveryCapability>,
  requestSource: Readonly<IDisabledNotificationDeliveryRequest>
): Readonly<IDisabledNotificationDeliveryResult> => {
  if (!capabilitySource || typeof capabilitySource !== 'object') {
    throw new Error('Exact privately issued notification delivery capability is required.');
  }
  const authority = issuedDeliveryCapabilities.get(capabilitySource);
  if (!authority) throw new Error('Exact privately issued notification delivery capability is required.');
  if (authority.executionState === 'Executing') {
    throw new Error('Notification delivery capability is already executing and cannot re-enter.');
  }
  const previousExecutionState = authority.executionState;
  authority.executionState = 'Executing';
  try {
    const capability = captureNotificationProtectedData(capabilitySource, 'deliveryCapabilityUse').value;
    if (!exactNotificationData(capability, authority.capability)) {
      throw new Error('Notification delivery capability was altered.');
    }
    const request = captureNotificationProtectedData(requestSource, 'disabledDeliveryRequest').value;
    assertNotificationRecordKeys(request, ['outcomeIdempotencyKey', 'outcomeAt'], ['runtimeBindingCapability']);
    if (!NOTIFICATION_SAFE_CODE_PATTERN.test(request.outcomeIdempotencyKey)
      || !isCanonicalNotificationUtc(request.outcomeAt)
      || request.outcomeAt < authority.attempt.attemptedAt) {
      throw new Error('Disabled notification delivery outcome request is invalid.');
    }
    if (request.runtimeBindingCapability !== undefined) {
      throw new Error('No runtime binding or activation capability is issued by the disabled adapter.');
    }
    if (authority.result) {
      if (!exactNotificationData(request, authority.completionRequest)) {
        throw new Error('Notification delivery capability was replayed with a conflicting outcome request.');
      }
      authority.executionState = 'Completed';
      return authority.result;
    }
    const outcome = captureNotificationProtectedData<INotificationOutcomeInput>({
      outcome: 'TransientFailure',
      outcomeAt: request.outcomeAt,
      outcomeCode: 'DELIVERY_ADAPTER_DISABLED_UNBOUND'
    }, 'disabledDeliveryOutcome').value;
    const completed = completeNotificationAttempt(authority.outbox, authority.attempt, outcome);
    if (!canRetryNotification(completed)) {
      throw new Error('Disabled delivery failure did not remain safely retryable.');
    }
    const failure = captureNotificationProtectedData<INotificationDeliveryFailureEvidence>({
      failureKey: encodeNotificationIdentity('delivery-failure', [
        authority.attempt.attemptKey,
        request.outcomeIdempotencyKey,
        request.outcomeAt,
        outcome.outcomeCode
      ]),
      eventKey: completed.eventKey,
      outboxKey: completed.outboxKey,
      attemptKey: authority.attempt.attemptKey,
      recipientReference: completed.recipientReference,
      channel: completed.channel,
      scheduledAt: completed.scheduledAt,
      attemptedAt: authority.attempt.attemptedAt,
      outcomeAt: outcome.outcomeAt,
      outcomeCode: 'DELIVERY_ADAPTER_DISABLED_UNBOUND',
      retryEligible: true,
      linkIncluded: Boolean(completed.digest.actionLink),
      templateProvenance: authority.renderedTemplate.provenance,
      adapterProvenance: {
        adapterKey: authority.adapter.adapterKey,
        adapterVersion: authority.adapter.adapterVersion,
        provider: authority.adapter.provider,
        enabled: authority.adapter.enabled,
        bindingState: authority.adapter.bindingState
      },
      configProvenance: completed.provenance
    }, 'disabledDeliveryFailure').value;
    const result: Readonly<IDisabledNotificationDeliveryResult> = Object.freeze({
      status: 'FailedTransient',
      outcomeIdempotencyKey: request.outcomeIdempotencyKey,
      outbox: completed,
      outcome,
      renderedTemplate: authority.renderedTemplate,
      failure
    });
    authority.completionRequest = request;
    authority.result = result;
    authority.executionState = 'Completed';
    return result;
  } finally {
    if (authority.executionState === 'Executing') authority.executionState = previousExecutionState;
  }
};
