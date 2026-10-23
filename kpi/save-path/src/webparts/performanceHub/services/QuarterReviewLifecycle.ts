import type { IProductionPerson } from '../models/ProductionModels';
import type {
  IQuarterManagerOverrideResult,
  IQuarterReview,
  IQuarterReviewAuditEvent,
  IQuarterReviewAuditWrite,
  IQuarterReviewItem,
  IQuarterSubmissionSnapshot,
  IQuarterReviewTransitionResult,
  QuarterReviewAuditEventType,
  QuarterReviewState,
  RagStatus
} from '../models/QuarterlyModels';
import {
  canEmployeeEditQuarterReview,
  canManagerReadQuarterReview,
  isActiveQuarterActor,
  canManagerDecideQuarterReview,
  canManagerOverrideQuarterRag
} from './QuarterReviewAuthorisation';
import { resolveFinalRag } from './PerformanceScoring';
import { ownSnapshotValue } from './QuarterBehaviourTargetSnapshot';

export type QuarterTransitionAction = 'Submit' | 'RequestChanges' | 'Resubmit' | 'Approve' | 'Lock';

export interface IQuarterTransitionPlan {
  review: IQuarterReview;
  audit: IQuarterReviewAuditWrite;
}

export interface IQuarterRagOverridePlan {
  item: IQuarterReviewItem;
  audit: IQuarterReviewAuditWrite;
}

const transitions: Record<QuarterTransitionAction, { from: QuarterReviewState; to: QuarterReviewState; actor: 'Employee' | 'Manager' }> = {
  Submit: { from: 'Draft', to: 'Submitted', actor: 'Employee' },
  RequestChanges: { from: 'Submitted', to: 'ChangesRequested', actor: 'Manager' },
  Resubmit: { from: 'ChangesRequested', to: 'Submitted', actor: 'Employee' },
  Approve: { from: 'Submitted', to: 'Approved', actor: 'Manager' },
  Lock: { from: 'Approved', to: 'Locked', actor: 'Manager' }
};

export const planQuarterTransition = (
  review: IQuarterReview,
  actor: IProductionPerson,
  action: QuarterTransitionAction,
  reason?: string
): { oldState: QuarterReviewState; newState: QuarterReviewState; actorRole: 'Employee' | 'Manager'; reason?: string } => {
  const transition = transitions[action];
  if (review.state !== transition.from || review.transitionStatus !== 'Ready') {
    throw new Error(`${action} is not allowed from ${review.state} or while a transition is incomplete.`);
  }
  if (transition.actor === 'Employee' && !canEmployeeEditQuarterReview(actor, review)) throw new Error('Only the review employee may perform this transition.');
  if (transition.actor === 'Manager') {
    if (action === 'Lock') {
      if (!canManagerReadQuarterReview(actor, review)) {
        throw new Error('Only the assigned manager may lock the approved Quarter Review.');
      }
    } else if (!canManagerDecideQuarterReview(actor, review)) throw new Error('Only the assigned manager may decide a Submitted Quarter Review.');
  }
  const controlledReason = reason?.trim();
  if (action === 'RequestChanges' && !controlledReason) throw new Error('Request Changes requires a manager comment.');
  return { oldState: review.state, newState: transition.to, actorRole: transition.actor, reason: controlledReason || undefined };
};

const eventForAction: Record<QuarterTransitionAction, QuarterReviewAuditEventType> = {
  Submit: 'QuarterReviewSubmitted',
  RequestChanges: 'QuarterReviewChangesRequested',
  Resubmit: 'QuarterReviewResubmitted',
  Approve: 'QuarterReviewApproved',
  Lock: 'QuarterReviewLocked'
};

const auditWrite = (
  review: IQuarterReview,
  actor: IProductionPerson,
  eventType: QuarterReviewAuditEventType,
  actorRole: 'Employee' | 'Manager' | 'Admin',
  correlationKey: string,
  eventAt: string,
  before: unknown,
  after: unknown,
  reason?: string
): IQuarterReviewAuditWrite => ({
  auditKey: `${review.quarterReviewKey}|${eventType}|${correlationKey}`,
  eventType,
  subjectKey: review.quarterReviewKey,
  performanceYear: review.performanceYear,
  quarter: review.quarter,
  actorPersonKey: actor.personKey,
  actorEmail: actor.email.trim().toLowerCase(),
  actorRole,
  eventAt,
  reason,
  beforeJson: JSON.stringify({ actorPersonKey: actor.personKey, value: before }),
  afterJson: JSON.stringify({ actorPersonKey: actor.personKey, value: after }),
  correlationKey,
  source: 'SPFx',
  sourceReference: review.quarterReviewKey,
  success: true
});

export const createQuarterCreationAudit = (
  review: IQuarterReview,
  actor: IProductionPerson,
  _correlationKey: string,
  eventAt: string
): IQuarterReviewAuditWrite => auditWrite(
  review,
  actor,
  'QuarterReviewCreated',
  'Employee',
  `${review.quarterReviewKey}|created`,
  eventAt,
  {},
  review
);

export const createQuarterTransitionPlan = (
  review: IQuarterReview,
  actor: IProductionPerson,
  action: QuarterTransitionAction,
  correlationKey: string,
  eventAt: string,
  reason?: string,
  submissionSnapshot?: Readonly<IQuarterSubmissionSnapshot>
): IQuarterTransitionPlan => {
  const transition = planQuarterTransition(review, actor, action, reason);
  // Approval is followed by Lock in the controlled lifecycle: reject exhaustion
  // before approval can be persisted, reserving both version increments.
  const increments = action === 'Approve' ? 2 : 1;
  if (!Number.isSafeInteger(review.rowVersionToken) || review.rowVersionToken <= 0
    || review.rowVersionToken > Number.MAX_SAFE_INTEGER - increments) {
    throw new Error('Quarter transition requires a positive safe source version with room to complete the transition.');
  }
  const next: IQuarterReview = {
    ...review,
    state: transition.newState,
    accessState: action === 'Submit' || action === 'Resubmit' ? 'ManagerDecision'
      : action === 'RequestChanges' ? 'EmployeeEdit'
        : 'ReadOnly',
    transitionStatus: 'Ready',
    transitionCorrelationKey: correlationKey,
    rowVersionToken: review.rowVersionToken + 1,
    submissionSnapshot: action === 'Submit' || action === 'Resubmit'
      ? submissionSnapshot || review.submissionSnapshot
      : review.submissionSnapshot
  };
  if (action === 'Submit' || action === 'Resubmit') {
    next.submittedAt = eventAt;
    next.submittedByEmail = actor.email.trim().toLowerCase();
    next.employeeSubmissionComment = transition.reason;
  } else if (action === 'RequestChanges') {
    next.managerDecisionComment = transition.reason;
  } else if (action === 'Approve') {
    next.approvedAt = eventAt;
    next.approvedByEmail = actor.email.trim().toLowerCase();
  } else if (action === 'Lock') {
    next.lockedAt = eventAt;
    next.lockedByEmail = actor.email.trim().toLowerCase();
  }
  return {
    review: next,
    audit: auditWrite(review, actor, eventForAction[action], transition.actorRole, correlationKey, eventAt, review, next, transition.reason)
  };
};

export const verifyQuarterTransition = (
  review: IQuarterReview,
  actor: IProductionPerson,
  audits: IQuarterReviewAuditEvent[],
  expectedState: QuarterReviewState,
  expectedEvents: QuarterReviewAuditEventType[]
): IQuarterReviewAuditEvent[] => {
  if (review.state !== expectedState || review.transitionStatus !== 'Ready') throw new Error(`Quarter Review did not reach ${expectedState}.`);
  if (!isActiveQuarterActor(actor)) throw new Error('Transition verification requires an active actor.');
  if (!review.transitionCorrelationKey?.trim()) throw new Error('Transition verification requires a persisted current correlation.');
  const verified: IQuarterReviewAuditEvent[] = [];
  expectedEvents.forEach(eventType => {
    const matches = audits.filter(audit => ownSnapshotValue(audit, 'eventType') === eventType
      && ownSnapshotValue(audit, 'subjectKey') === review.quarterReviewKey
      && ownSnapshotValue(audit, 'correlationKey') === review.transitionCorrelationKey
      && ownSnapshotValue(audit, 'success') === true
      && ownSnapshotValue(audit, 'performanceYear') === review.performanceYear
      && ownSnapshotValue(audit, 'quarter') === review.quarter
      && ownSnapshotValue(audit, 'actorPersonKey') === actor.personKey
      && typeof ownSnapshotValue(audit, 'actorEmail') === 'string'
      && audit.actorEmail.trim().toLowerCase() === actor.email.trim().toLowerCase());
    if (matches.length !== 1) throw new Error(`Expected exactly one ${eventType} audit event; found ${matches.length}.`);
    verified.push(matches[0]);
  });
  return verified;
};

export const verifyCompletedQuarterSubmission = (
  review: IQuarterReview,
  actor: IProductionPerson,
  audits: IQuarterReviewAuditEvent[]
): IQuarterReviewAuditEvent[] => {
  const completed = audits.filter(audit => (ownSnapshotValue(audit, 'eventType') === 'QuarterReviewSubmitted' || ownSnapshotValue(audit, 'eventType') === 'QuarterReviewResubmitted')
    && ownSnapshotValue(audit, 'subjectKey') === review.quarterReviewKey && ownSnapshotValue(audit, 'correlationKey') === review.transitionCorrelationKey
    && ownSnapshotValue(audit, 'success') === true);
  if (completed.length !== 1) throw new Error(`Expected exactly one completed Quarter Review submission audit; found ${completed.length}.`);
  return verifyQuarterTransition(review, actor, audits, 'Submitted', [completed[0].eventType]);
};

export const createQuarterRagOverridePlan = (
  review: IQuarterReview,
  item: IQuarterReviewItem,
  actor: IProductionPerson,
  rag: Exclude<RagStatus, 'NotRated'>,
  reason: string,
  correlationKey: string,
  eventAt: string
): IQuarterRagOverridePlan => {
  if (!canManagerOverrideQuarterRag(actor, review, item)) {
    throw new Error('Only the assigned manager may override RAG for an unlocked Core or Impact result in a Submitted Quarter Review.');
  }
  const controlledReason = reason.trim();
  if (!controlledReason) throw new Error('Manager RAG override requires a reason.');
  const override = {
    rag,
    reason: controlledReason,
    actorPersonKey: actor.personKey,
    actorEmail: actor.email.trim().toLowerCase(),
    overriddenAt: eventAt
  };
  const final = resolveFinalRag(item.calculatedRag, override);
  if (!final.valid) throw new Error(final.errors.join(' '));
  const next: IQuarterReviewItem = {
    ...item,
    managerOverride: override,
    finalApprovedRag: final.finalRag
  };
  return {
    item: next,
    audit: {
      ...auditWrite(review, actor, 'RAGOverridden', 'Manager', correlationKey, eventAt, item, next, controlledReason),
      sourceReference: item.quarterReviewItemKey
    }
  };
};

export const verifyQuarterRagOverride = (
  item: IQuarterReviewItem,
  audit: IQuarterReviewAuditEvent,
  actor: IProductionPerson
): IQuarterManagerOverrideResult => {
  if (!item.managerOverride?.rag || !item.managerOverride.reason?.trim() || !item.finalApprovedRag) {
    throw new Error('The manager RAG override was not persisted completely.');
  }
  const final = resolveFinalRag(item.calculatedRag, item.managerOverride);
  if (!final.valid || item.finalApprovedRag !== final.finalRag) throw new Error('Final Approved RAG does not match the controlled manager override.');
  if (audit.eventType !== 'RAGOverridden' || audit.subjectKey !== item.quarterReviewKey || audit.sourceReference !== item.quarterReviewItemKey || !audit.success) {
    throw new Error('The append-only RAG Override audit does not match the persisted item.');
  }
  if (!actor.active || audit.actorEmail.trim().toLowerCase() !== actor.email.trim().toLowerCase()) {
    throw new Error('The RAG Override audit actor does not match the authenticated manager.');
  }
  return { item, audit, alreadyCompleted: true };
};

export const asQuarterTransitionResult = (
  review: IQuarterReview,
  audits: IQuarterReviewAuditEvent[],
  alreadyCompleted: boolean
): IQuarterReviewTransitionResult => ({ review, audits, alreadyCompleted });

export const asQuarterOverrideResult = (
  item: IQuarterReviewItem,
  audit: IQuarterReviewAuditEvent,
  alreadyCompleted: boolean
): IQuarterManagerOverrideResult => ({ item, audit, alreadyCompleted });
