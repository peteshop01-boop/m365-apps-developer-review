import type { IAnnualWorkplan, IProductionPerson, IWorkplanAuditEvent } from '../../models/ProductionModels';
import type { IQuarterReview, IQuarterReviewAuditEvent } from '../../models/QuarterlyModels';
import { resolveManagerRelationship } from '../GovernanceValidation';
import { canEmployeeReadWorkplan, canManagerReadWorkplan } from '../WorkplanAuthorisation';
import { normaliseStrictUtcTimestamp, verifyCompletedManagerTransition } from '../WorkplanLifecycle';
import { verifyCompletedSubmission } from '../WorkplanSubmission';
import { verifyCompletedQuarterSubmission, verifyQuarterTransition } from '../QuarterReviewLifecycle';
import { captureNotificationProtectedData, encodeNotificationIdentity, isCanonicalNotificationUtc, isSafeNotificationLink } from './NotificationBoundary';
import type { NotificationPeriodKey } from './NotificationModels';
import type {
  INotificationLifecycleFacts, INotificationLifecyclePreviewState, INotificationLifecycleSourceInput,
  INotificationLifecycleSourceResult, NotificationLifecycleDecision, NotificationLifecycleRecipientRole,
  NotificationLifecycleSourceReason
} from './NotificationLifecycleSourceModels';

type Header = IAnnualWorkplan | IQuarterReview;
type Audit = IWorkplanAuditEvent | IQuarterReviewAuditEvent;
const decisions: Readonly<Record<string, NotificationLifecycleDecision>> = Object.freeze({
  WorkplanChangesRequested: 'ChangesRequested', QuarterReviewChangesRequested: 'ChangesRequested',
  WorkplanApproved: 'Approved', QuarterReviewApproved: 'Approved',
  WorkplanSubmitted: 'Submitted', QuarterReviewSubmitted: 'Submitted',
  WorkplanResubmitted: 'Resubmitted', QuarterReviewResubmitted: 'Resubmitted'
});
const positiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const email = (value: string): string => value.trim().toLowerCase();
const validEmail = (value: unknown): value is string => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const sameTime = (left: string | undefined, right: string): boolean =>
  !!left && normaliseStrictUtcTimestamp(left) === normaliseStrictUtcTimestamp(right);

const result = (
  status: INotificationLifecycleSourceResult['status'], reason: NotificationLifecycleSourceReason,
  state?: Readonly<INotificationLifecyclePreviewState>, transitionIdentity?: string
): Readonly<INotificationLifecycleSourceResult> => Object.freeze({
  status, reason, nativeDeliveryEnabled: false, notifications: Object.freeze([]),
  nextPreviewState: state, transitionIdentity
});

/** Check persisted IDs and exact current transition provenance in addition to the existing
 * lifecycle verifiers. A plan's success:true audit alone cannot pass these checks.
 */
const assertAudit = (audit: Audit, header: Header, subjectKey: string, period: NotificationPeriodKey, actor: IProductionPerson): void => {
  if (!positiveInteger(audit.id) || !nonempty(audit.auditKey) || audit.success !== true || audit.source !== 'SPFx'
    || audit.subjectKey !== subjectKey || audit.performanceYear !== header.performanceYear
    || audit.correlationKey !== header.transitionCorrelationKey
    || (period !== 'Annual' && (audit as IQuarterReviewAuditEvent).quarter !== period)
    || !isCanonicalNotificationUtc(normaliseStrictUtcTimestamp(audit.eventAt))
    || !validEmail(audit.actorEmail) || email(audit.actorEmail) !== email(actor.email)
    || (period !== 'Annual' && (audit as IQuarterReviewAuditEvent).actorPersonKey !== actor.personKey)) {
    throw new Error('Completed audit provenance is unavailable.');
  }
};

const assertAfter = (audit: Audit, header: Header, quarter: boolean, expectedState: string, expectedVersion: number): void => {
  if (!nonempty(audit.afterJson)) throw new Error('Completed source version evidence is unavailable.');
  const parsed = JSON.parse(audit.afterJson);
  const after = quarter ? parsed?.value : parsed;
  const expectedAccess = expectedState === 'Submitted' ? 'ManagerDecision' : expectedState === 'ChangesRequested' ? 'EmployeeEdit' : 'ReadOnly';
  if (!after || after.state !== expectedState || after.accessState !== expectedAccess || after.transitionStatus !== 'Ready'
    || after.rowVersionToken !== expectedVersion
    || (quarter && (after.quarterReviewKey !== (header as IQuarterReview).quarterReviewKey
      || after.personKey !== header.personKey || after.performanceYear !== header.performanceYear
      || after.quarter !== (header as IQuarterReview).quarter || after.transitionCorrelationKey !== header.transitionCorrelationKey))) {
    throw new Error('Completed source state/version does not match its audit.');
  }
};

/** Pure preview projection. The five-event reminder/cycle helper and its config semantics
 * remain unchanged; this reuses its protected capture, safe-link and identity boundaries.
 * No outbox, adapter capability, sender, calendar or native authority is created here.
 */
export const projectNotificationLifecycleSource = (
  supplied: Readonly<INotificationLifecycleSourceInput>
): Readonly<INotificationLifecycleSourceResult> => {
  let input: Readonly<INotificationLifecycleSourceInput>;
  try { input = captureNotificationProtectedData(supplied, 'lifecycleSource').value; }
  catch { return result('HOLD', 'SourceInputUnavailable'); }
  if (!input) return result('HOLD', 'SourceInputUnavailable');
  if (!input.previewState || !Array.isArray(input.previewState.processedTransitionIdentities)
    || input.previewState.processedTransitionIdentities.some(identity => !nonempty(identity))) {
    return result('HOLD', 'PreviewStateUnavailable');
  }
  const state = input.previewState;
  const change = input.change;
  if (!change) return result('HOLD', 'CompletionEvidenceUnavailable', state);
  if (change.kind === 'DraftSave' || change.kind === 'ProgressSave' || change.kind === 'RecoverySave') {
    return result('SUPPRESSED', 'IrrelevantEdit', state);
  }
  if (change.kind !== 'AnnualSubmission' && change.kind !== 'AnnualDecision' && change.kind !== 'QuarterTransition') {
    return result('HOLD', 'CompletionEvidenceUnavailable', state);
  }

  try {
    const quarter = change.kind === 'QuarterTransition';
    const header = quarter ? change.result.review : change.result.workplan;
    const audits: Audit[] = change.kind === 'AnnualSubmission' ? [change.result.audit] : change.result.audits;
    const completionFlag = change.kind === 'AnnualSubmission' ? change.result.alreadySubmitted : change.result.alreadyCompleted;
    const subjectKey = quarter ? (header as IQuarterReview).quarterReviewKey : (header as IAnnualWorkplan).workplanKey;
    const period: NotificationPeriodKey = quarter ? (header as IQuarterReview).quarter : 'Annual';
    if (typeof completionFlag !== 'boolean' || !positiveInteger(header.id) || !nonempty(header.etag)
      || !nonempty(subjectKey) || !positiveInteger(header.rowVersionToken) || !positiveInteger(header.performanceYear)
      || header.transitionStatus !== 'Ready' || header.accessState === 'RecoveryHold'
      || !nonempty(header.transitionCorrelationKey) || !Array.isArray(audits)
      || (quarter && !['Q1', 'Q2', 'Q3', 'Q4'].includes(period))
      || (!quarter && change.result.storageAclStatus !== 'InheritedDependency')) {
      return result('HOLD', 'CompletionEvidenceUnavailable', state);
    }
    if (header.state === 'Draft') return result('SUPPRESSED', 'IrrelevantEdit', state);
    const selected = audits.filter(audit => audit && Object.prototype.hasOwnProperty.call(decisions, audit.eventType));
    if (!selected.length) {
      // Only explicit, irrelevant persisted transition events are suppressed. Missing audits HOLD.
      return audits.length && audits.every(audit => audit && positiveInteger(audit.id) && audit.success === true
        && audit.subjectKey === subjectKey && audit.correlationKey === header.transitionCorrelationKey
        && ['WorkplanLocked', 'QuarterReviewCreated', 'QuarterReviewLocked', 'QuarterReviewReopened', 'RAGOverridden'].includes(audit.eventType))
        ? result('SUPPRESSED', 'IrrelevantTransition', state) : result('HOLD', 'CompletionEvidenceUnavailable', state);
    }
    if (selected.length !== 1) return result('HOLD', 'CompletionEvidenceUnavailable', state);
    const audit = selected[0];
    const decision = decisions[audit.eventType];
    if (quarter !== audit.eventType.startsWith('QuarterReview')
      || (change.kind === 'AnnualSubmission' && !['Submitted', 'Resubmitted'].includes(decision))
      || (change.kind === 'AnnualDecision' && !['Approved', 'ChangesRequested'].includes(decision))) {
      return result('HOLD', 'CompletionEvidenceUnavailable', state);
    }

    const people = input.people;
    if (!Array.isArray(people)) return result('HOLD', 'PeopleRelationshipUnavailable', state);
    const employees = people.filter(person => person.personKey === header.personKey);
    if (employees.length !== 1 || !employees[0].active || !validEmail(employees[0].email)
      || !validEmail(header.employeeEmail) || email(employees[0].email) !== email(header.employeeEmail)) {
      return result('HOLD', 'PeopleRelationshipUnavailable', state);
    }
    const employee = employees[0];
    const resolved = resolveManagerRelationship(employee, people as IProductionPerson[]);
    const managers = people.filter(person => person.personKey === resolved.manager?.personKey);
    const manager = managers[0];
    if (!resolved.result.valid || managers.length !== 1 || !manager.active || !validEmail(manager.email)
      || manager.personKey === employee.personKey || email(manager.email) === email(employee.email)
      || !canEmployeeReadWorkplan(employee, header as IAnnualWorkplan)
      || !canManagerReadWorkplan(manager, header as IAnnualWorkplan)) {
      return result('HOLD', 'PeopleRelationshipUnavailable', state);
    }
    const submission = decision === 'Submitted' || decision === 'Resubmitted';
    const actor = submission ? employee : manager;
    const expectedState = submission ? 'Submitted' : decision === 'ChangesRequested' ? 'ChangesRequested' : quarter ? 'Locked' : 'Approved';
    const expectedAccess = submission ? 'ManagerDecision' : decision === 'ChangesRequested' ? 'EmployeeEdit' : 'ReadOnly';
    if (header.state !== expectedState || header.accessState !== expectedAccess
      || audit.actorRole !== (submission ? 'Employee' : 'Manager')) {
      return result('HOLD', 'CompletionEvidenceUnavailable', state);
    }
    const lockedApproval = quarter && decision === 'Approved';
    if (audits.length !== (lockedApproval ? 2 : 1)) return result('HOLD', 'CompletionEvidenceUnavailable', state);
    assertAudit(audit, header, subjectKey, period, actor);
    assertAfter(audit, header, quarter, lockedApproval ? 'Approved' : expectedState, header.rowVersionToken - (lockedApproval ? 1 : 0));
    if (submission && (!sameTime(header.submittedAt, audit.eventAt) || !header.submittedByEmail
      || email(header.submittedByEmail) !== email(employee.email))) return result('HOLD', 'CompletionEvidenceUnavailable', state);
    if (decision === 'Approved' && (!sameTime(header.approvedAt, audit.eventAt) || !header.approvedByEmail
      || email(header.approvedByEmail) !== email(manager.email))) return result('HOLD', 'CompletionEvidenceUnavailable', state);

    if (quarter) {
      const review = header as IQuarterReview;
      const quarterAudits = audits as IQuarterReviewAuditEvent[];
      if (submission) verifyCompletedQuarterSubmission(review, actor, quarterAudits);
      else if (lockedApproval) {
        const locks = quarterAudits.filter(event => event.eventType === 'QuarterReviewLocked');
        if (locks.length !== 1) return result('HOLD', 'CompletionEvidenceUnavailable', state);
        const lock = locks[0];
        assertAudit(lock, header, subjectKey, period, manager);
        assertAfter(lock, header, true, 'Locked', header.rowVersionToken);
        if (lock.actorRole !== 'Manager' || lock.id === audit.id || lock.auditKey === audit.auditKey
          || !sameTime(header.lockedAt, lock.eventAt) || Date.parse(lock.eventAt) < Date.parse(audit.eventAt)
          || !header.lockedByEmail || email(header.lockedByEmail) !== email(manager.email)) {
          return result('HOLD', 'CompletionEvidenceUnavailable', state);
        }
        verifyQuarterTransition(review, manager, quarterAudits, 'Locked', ['QuarterReviewApproved', 'QuarterReviewLocked']);
      } else verifyQuarterTransition(review, manager, quarterAudits, 'ChangesRequested', ['QuarterReviewChangesRequested']);
    } else if (submission) verifyCompletedSubmission(header as IAnnualWorkplan, employee, audits as IWorkplanAuditEvent[]);
    else verifyCompletedManagerTransition(header as IAnnualWorkplan, manager, audits as IWorkplanAuditEvent[],
      decision as 'Approved' | 'ChangesRequested', [(audit as IWorkplanAuditEvent).eventType]);

    // Reuse length-delimited tuple encoding, but label this explicitly as local preview identity.
    const transitionIdentity = `LifecycleSourcePreviewV1:${encodeNotificationIdentity('outbox', [
      JSON.stringify([quarter ? 'QuarterReview' : 'AnnualWorkplan', subjectKey, header.performanceYear, period]),
      audit.eventType, JSON.stringify([audit.correlationKey, header.rowVersionToken])
    ])}`;
    if (state.processedTransitionIdentities.includes(transitionIdentity)) return result('SUPPRESSED', 'AlreadyProcessed', state, transitionIdentity);
    if (!input.actionLink || !isSafeNotificationLink(input.actionLink, input.safeLinkPolicy)) {
      return result('HOLD', 'SafeHubLinkUnavailable', state);
    }
    const workflowLabel = quarter ? 'Quarter review' : 'Annual workplan';
    const messages: Record<NotificationLifecycleDecision, string> = {
      ChangesRequested: `${workflowLabel}: changes requested. Open the Hub to review and update.`,
      Approved: `${workflowLabel} approved. Open the Hub to view.`,
      Submitted: `${workflowLabel} submitted. Open the Hub to review.`,
      Resubmitted: `${workflowLabel} resubmitted. Open the Hub to review.`
    };
    const facts: Readonly<INotificationLifecycleFacts> = Object.freeze({
      workflow: quarter ? 'QuarterReview' : 'AnnualWorkplan', decision, subjectKey,
      employeePersonKey: employee.personKey, performanceYear: header.performanceYear, periodKey: period,
      workflowState: expectedState, eventType: audit.eventType, eventAt: audit.eventAt,
      sourceVersion: header.rowVersionToken, correlationKey: audit.correlationKey,
      actionLink: input.actionLink, message: messages[decision]
    });
    const roles: NotificationLifecycleRecipientRole[] = decision === 'Approved' ? ['Employee', 'Manager']
      : decision === 'ChangesRequested' ? ['Employee'] : ['Manager'];
    const notifications = Object.freeze(roles.map(recipientRole => {
      const person = recipientRole === 'Employee' ? employee : manager;
      return Object.freeze({ recipientRole, recipient: Object.freeze({ personKey: person.personKey, email: email(person.email) }), facts });
    }));
    return Object.freeze({ status: 'PREVIEW', reason: 'CompletedTransitionProjected', nativeDeliveryEnabled: false,
      transitionIdentity, notifications,
      nextPreviewState: Object.freeze({ processedTransitionIdentities: Object.freeze([...state.processedTransitionIdentities, transitionIdentity]) }) });
  } catch { return result('HOLD', 'CompletionEvidenceUnavailable', state); }
};
