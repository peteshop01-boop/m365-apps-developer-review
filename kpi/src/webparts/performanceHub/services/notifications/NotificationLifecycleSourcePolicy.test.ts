import type { IAnnualWorkplan, IProductionPerson, IWorkplanAuditEvent, IWorkplanSubmissionResult, IWorkplanTransitionResult } from '../../models/ProductionModels';
import type { IQuarterReview, IQuarterReviewTransitionResult } from '../../models/QuarterlyModels';
import { createQuarterTransitionPlan } from '../QuarterReviewLifecycle';
import { createRequestChangesPlan } from '../WorkplanLifecycle';
import { NOTIFICATION_EVENT_KINDS } from './NotificationModels';
import type { INotificationLifecycleSourceInput, NotificationLifecycleDecision } from './NotificationLifecycleSourceModels';
import { projectNotificationLifecycleSource } from './NotificationLifecycleSourcePolicy';

const EVENT_AT = '2026-10-03T09:00:00.000Z';
const LINK = 'https://hub.example.invalid/sites/kpi/PerformanceHub.aspx';
const employee: IProductionPerson = {
  id: 1, personKey: 'EMP-001', displayName: 'Synthetic employee', email: 'employee@example.invalid',
  managerPersonKey: 'MGR-001', managerEmail: 'manager@example.invalid', active: true, appRoles: ['Employee']
};
const manager: IProductionPerson = {
  id: 2, personKey: 'MGR-001', displayName: 'Synthetic manager', email: 'manager@example.invalid', active: true, appRoles: ['Manager']
};
const annual = (): IAnnualWorkplan => ({
  id: 5, etag: '"7"', workplanKey: 'EMP-001|2026', personKey: employee.personKey,
  employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
  managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
  state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready', transitionCorrelationKey: 'submitted-before',
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 7,
  submittedAt: '2026-10-02T09:00:00.000Z', submittedByEmail: employee.email
});
const input = (change: INotificationLifecycleSourceInput['change']): INotificationLifecycleSourceInput => ({
  change, people: [employee, manager], actionLink: LINK,
  safeLinkPolicy: { allowedOrigins: ['https://hub.example.invalid'], allowedPathPrefixes: ['/sites/kpi'] },
  previewState: { processedTransitionIdentities: [] }
});

/** Synthetic persisted result shapes, including audit IDs and final source versions. */
const annualInput = (decision: NotificationLifecycleDecision): INotificationLifecycleSourceInput => {
  const workplan = annual();
  const correlation = `annual-${decision}`;
  const isSubmission = decision === 'Submitted' || decision === 'Resubmitted';
  const state = isSubmission ? 'Submitted' : decision;
  const accessState = isSubmission ? 'ManagerDecision' : decision === 'ChangesRequested' ? 'EmployeeEdit' : 'ReadOnly';
  const completed: IAnnualWorkplan = { ...workplan, state, accessState, rowVersionToken: 9,
    transitionCorrelationKey: correlation, submittedAt: isSubmission ? EVENT_AT : workplan.submittedAt,
    approvedAt: decision === 'Approved' ? EVENT_AT : undefined,
    approvedByEmail: decision === 'Approved' ? manager.email : undefined,
    managerDecisionComment: 'Sensitive manager comment must remain in the Hub.' };
  let audit: IWorkplanAuditEvent = {
    id: 100, auditKey: correlation, eventType: `Workplan${decision}` as IWorkplanAuditEvent['eventType'],
    subjectKey: completed.workplanKey, performanceYear: 2026,
    actorEmail: isSubmission ? employee.email : manager.email, actorRole: isSubmission ? 'Employee' : 'Manager',
    eventAt: EVENT_AT, correlationKey: correlation, source: 'SPFx', success: true,
    reason: 'Sensitive manager comment must remain in the Hub.',
    afterJson: JSON.stringify({ state, accessState, transitionStatus: 'Ready', rowVersionToken: 9,
      sensitiveScore: 99, privateResult: 'Confidential performance detail' })
  };
  if (decision === 'ChangesRequested') {
    const plan = createRequestChangesPlan(workplan, manager, 'Sensitive manager comment must remain in the Hub.', correlation, EVENT_AT);
    audit = { ...plan.audit, id: 100 };
  }
  if (isSubmission) return input({ kind: 'AnnualSubmission', result: { workplan: completed, audit,
    alreadySubmitted: false, storageAclStatus: 'InheritedDependency' } });
  return input({ kind: 'AnnualDecision', result: { workplan: completed, audits: [audit],
    alreadyCompleted: false, storageAclStatus: 'InheritedDependency' } });
};

/** Compose the existing quarter planner into the actual completion result shape. Approval
 * includes its following lock, as returned by approveAndLockQuarterReview.
 */
const quarterInput = (decision: NotificationLifecycleDecision): INotificationLifecycleSourceInput => {
  const header = annual();
  const prior: IQuarterReview = {
    id: header.id, etag: header.etag, quarterReviewKey: 'EMP-001|2026|Q3', workplanKey: header.workplanKey,
    personKey: employee.personKey, employeeDisplayName: employee.displayName, employeeEmail: employee.email,
    performanceYear: 2026, quarter: 'Q3', managerPersonKey: manager.personKey,
    managerDisplayName: manager.displayName, managerEmail: manager.email,
    state: decision === 'Submitted' ? 'Draft' : decision === 'Resubmitted' ? 'ChangesRequested' : 'Submitted',
    accessState: decision === 'Submitted' || decision === 'Resubmitted' ? 'EmployeeEdit' : 'ManagerDecision',
    transitionStatus: 'Ready', rowVersionToken: 7
  };
  const action = decision === 'Submitted' ? 'Submit' : decision === 'Resubmitted' ? 'Resubmit'
    : decision === 'ChangesRequested' ? 'RequestChanges' : 'Approve';
  const actor = action === 'Submit' || action === 'Resubmit' ? employee : manager;
  const plan = createQuarterTransitionPlan(prior, actor, action, `quarter-${decision}`, EVENT_AT,
    'Sensitive manager comment must remain in the Hub.');
  const completed: IQuarterReviewTransitionResult = { review: { ...plan.review, etag: '"8"' },
    audits: [{ ...plan.audit, id: 200 }], alreadyCompleted: false };
  if (decision === 'Approved') {
    const lock = createQuarterTransitionPlan(completed.review, manager, 'Lock', `quarter-${decision}`, '2026-10-03T09:00:01.000Z');
    completed.review = { ...lock.review, etag: '"9"' };
    completed.audits.push({ ...lock.audit, id: 201 });
  }
  return input({ kind: 'QuarterTransition', result: completed });
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const annualSubmission = (value: INotificationLifecycleSourceInput): IWorkplanSubmissionResult =>
  (value.change as { result: IWorkplanSubmissionResult }).result;
const annualDecision = (value: INotificationLifecycleSourceInput): IWorkplanTransitionResult =>
  (value.change as { result: IWorkplanTransitionResult }).result;
const quarterResult = (value: INotificationLifecycleSourceInput): IQuarterReviewTransitionResult =>
  (value.change as { result: IQuarterReviewTransitionResult }).result;

describe('completed lifecycle notification source preview', () => {
  const decisions: NotificationLifecycleDecision[] = ['ChangesRequested', 'Approved', 'Submitted', 'Resubmitted'];
  describe.each([['Annual', annualInput], ['Quarter', quarterInput]] as const)('%s routing', (_scope, fixture) => {
    it.each(decisions)('projects %s with exact source facts and required recipients', decision => {
      const supplied = fixture(decision);
      const preview = projectNotificationLifecycleSource(supplied);
      expect(preview.status).toBe('PREVIEW');
      expect(preview.notifications.map(item => item.recipientRole)).toEqual(decision === 'Approved' ? ['Employee', 'Manager']
        : decision === 'ChangesRequested' ? ['Employee'] : ['Manager']);
      expect(preview.notifications.map(item => item.recipient.personKey)).toEqual(decision === 'Approved' ? [employee.personKey, manager.personKey]
        : decision === 'ChangesRequested' ? [employee.personKey] : [manager.personKey]);
      expect(preview.notifications[0].facts).toEqual(expect.objectContaining({
        decision, performanceYear: 2026, eventAt: EVENT_AT, actionLink: LINK, employeePersonKey: employee.personKey,
        periodKey: _scope === 'Annual' ? 'Annual' : 'Q3',
        sourceVersion: _scope === 'Annual' || decision === 'Approved' ? 9 : 8,
        correlationKey: `${_scope.toLowerCase()}-${decision}`,
        subjectKey: _scope === 'Annual' ? 'EMP-001|2026' : 'EMP-001|2026|Q3'
      }));
      expect(preview.nativeDeliveryEnabled).toBe(false);
      expect(JSON.stringify(preview)).not.toMatch(/Sensitive manager|Confidential performance|sensitiveScore|beforeJson|afterJson|managerDecisionComment/);
    });
  });

  it.each(['DraftSave', 'ProgressSave', 'RecoverySave'] as const)('suppresses %s without recipient or link configuration', kind => {
    const supplied = { change: { kind }, previewState: { processedTransitionIdentities: [] } };
    expect(projectNotificationLifecycleSource(supplied)).toEqual(expect.objectContaining({ status: 'SUPPRESSED', reason: 'IrrelevantEdit', notifications: [] }));
  });

  it.each(['missingEmployee', 'inactiveEmployee', 'missingManager', 'inactiveManager', 'missingRelationship', 'conflictingRelationship', 'duplicateEmployee', 'duplicateManager'])(
    'holds %s and does not consume preview identity', scenario => {
      const supplied = clone(annualInput('Approved'));
      const people = supplied.people as IProductionPerson[];
      if (scenario === 'missingEmployee') people.shift();
      if (scenario === 'inactiveEmployee') people[0].active = false;
      if (scenario === 'missingManager') people.pop();
      if (scenario === 'inactiveManager') people[1].active = false;
      if (scenario === 'missingRelationship') { delete people[0].managerPersonKey; delete people[0].managerEmail; }
      if (scenario === 'conflictingRelationship') people[0].managerEmail = 'different@example.invalid';
      if (scenario === 'duplicateEmployee') people.push({ ...people[0] });
      if (scenario === 'duplicateManager') people.push({ ...people[1] });
      const output = projectNotificationLifecycleSource(supplied);
      expect(output).toEqual(expect.objectContaining({ status: 'HOLD', reason: 'PeopleRelationshipUnavailable', notifications: [] }));
      expect(output.nextPreviewState?.processedTransitionIdentities).toEqual([]);
    });

  it('suppresses the exact repeated transition using only supplied local preview state', () => {
    const supplied = annualInput('Approved');
    const first = projectNotificationLifecycleSource(supplied);
    const repeated = projectNotificationLifecycleSource({ ...supplied, previewState: first.nextPreviewState });
    expect(repeated).toEqual(expect.objectContaining({ status: 'SUPPRESSED', reason: 'AlreadyProcessed', transitionIdentity: first.transitionIdentity, notifications: [] }));
    expect(repeated.nextPreviewState?.processedTransitionIdentities).toHaveLength(1);
    const newTransition = clone(supplied);
    annualDecision(newTransition).workplan.transitionCorrelationKey = 'another-completion';
    annualDecision(newTransition).audits[0].correlationKey = 'another-completion';
    expect(projectNotificationLifecycleSource({ ...newTransition, previewState: first.nextPreviewState }).status).toBe('PREVIEW');
  });

  it('retains replayed completion flags without pretending the transition was already notified', () => {
    const supplied = annualInput('Submitted');
    annualSubmission(supplied).alreadySubmitted = true;
    expect(projectNotificationLifecycleSource(supplied).status).toBe('PREVIEW');
  });

  it('keeps input objects unchanged and freezes detached facts, recipients and next state', () => {
    const supplied = clone(quarterInput('Approved'));
    const before = JSON.stringify(supplied);
    const output = projectNotificationLifecycleSource(supplied);
    expect(JSON.stringify(supplied)).toBe(before);
    expect(output.status).toBe('PREVIEW');
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.notifications)).toBe(true);
    expect(Object.isFrozen(output.notifications[0].facts)).toBe(true);
    expect(Object.isFrozen(output.notifications[0].recipient)).toBe(true);
    expect(Object.isFrozen(output.nextPreviewState?.processedTransitionIdentities)).toBe(true);
    (supplied.people as IProductionPerson[])[0].email = 'changed@example.invalid';
    expect(output.notifications[0].recipient.email).toBe(employee.email);
    expect(supplied.previewState?.processedTransitionIdentities).toHaveLength(0);
  });

  it.each(['missingAuditId', 'wrongSubject', 'wrongYear', 'wrongCorrelation', 'wrongVersion', 'failedAudit', 'missingAudit', 'duplicateAudit', 'inProgress', 'recoveryHold'])(
    'holds incomplete or mismatched annual completion: %s', scenario => {
      const supplied = clone(annualInput('ChangesRequested'));
      const completed = annualDecision(supplied);
      if (scenario === 'missingAuditId') delete (completed.audits[0] as Partial<IWorkplanAuditEvent>).id;
      if (scenario === 'wrongSubject') completed.audits[0].subjectKey = 'OTHER|2026';
      if (scenario === 'wrongYear') completed.audits[0].performanceYear = 2025;
      if (scenario === 'wrongCorrelation') completed.audits[0].correlationKey = 'other-correlation';
      if (scenario === 'wrongVersion') completed.workplan.rowVersionToken += 1;
      if (scenario === 'failedAudit') completed.audits[0].success = false;
      if (scenario === 'missingAudit') completed.audits = [];
      if (scenario === 'duplicateAudit') completed.audits.push({ ...completed.audits[0], id: 101 });
      if (scenario === 'inProgress') completed.workplan.transitionStatus = 'InProgress';
      if (scenario === 'recoveryHold') completed.workplan.accessState = 'RecoveryHold';
      expect(projectNotificationLifecycleSource(supplied)).toEqual(expect.objectContaining({ status: 'HOLD', notifications: [] }));
    });

  it('rejects the real annual request-changes plan as a completion result', () => {
    const plan = createRequestChangesPlan(annual(), manager, 'Please update.', 'plan-only', EVENT_AT);
    expect(projectNotificationLifecycleSource(input({ kind: 'AnnualDecision', result: plan as unknown as IWorkplanTransitionResult })).status).toBe('HOLD');
  });

  it.each(['approvalOnly', 'missingLock', 'wrongQuarter', 'wrongLockCorrelation', 'wrongApprovalVersion', 'wrongLockVersion', 'lockEarlier', 'missingLockId'])(
    'requires the real completed quarter approval and lock pair: %s', scenario => {
      const supplied = clone(quarterInput('Approved'));
      const completed = quarterResult(supplied);
      if (scenario === 'approvalOnly') { completed.review.state = 'Approved'; completed.review.rowVersionToken -= 1; completed.audits.pop(); }
      if (scenario === 'missingLock') completed.audits.pop();
      if (scenario === 'wrongQuarter') completed.audits[0].quarter = 'Q2';
      if (scenario === 'wrongLockCorrelation') completed.audits[1].correlationKey = 'other-correlation';
      if (scenario === 'wrongApprovalVersion') { const after = JSON.parse(completed.audits[0].afterJson as string); after.value.rowVersionToken += 1; completed.audits[0].afterJson = JSON.stringify(after); }
      if (scenario === 'wrongLockVersion') completed.review.rowVersionToken += 1;
      if (scenario === 'lockEarlier') { completed.audits[1].eventAt = '2026-10-02T09:00:00.000Z'; completed.review.lockedAt = completed.audits[1].eventAt; }
      if (scenario === 'missingLockId') completed.audits[1].id = 0;
      expect(projectNotificationLifecycleSource(supplied).status).toBe('HOLD');
    });

  it.each(['noLink', 'noPolicy', 'wrongOrigin', 'noState', 'noChange'])(
    'holds missing supplied preview prerequisites: %s', scenario => {
      const supplied = annualInput('Submitted');
      const changed = { ...supplied,
        actionLink: scenario === 'noLink' ? undefined : scenario === 'wrongOrigin' ? 'https://other.example.invalid/sites/kpi' : supplied.actionLink,
        safeLinkPolicy: scenario === 'noPolicy' ? undefined : supplied.safeLinkPolicy,
        previewState: scenario === 'noState' ? undefined : supplied.previewState,
        change: scenario === 'noChange' ? undefined : supplied.change };
      expect(projectNotificationLifecycleSource(changed).status).toBe('HOLD');
    });

  it('preserves supported source UTC spelling while validating its canonical equivalent', () => {
    const supplied = annualInput('Submitted');
    annualSubmission(supplied).audit.eventAt = '2026-10-03T09:00:00Z';
    const output = projectNotificationLifecycleSource(supplied);
    expect(output.status).toBe('PREVIEW');
    expect(output.notifications[0].facts.eventAt).toBe('2026-10-03T09:00:00Z');
  });

  it('leaves the existing five-event helper vocabulary unchanged', () => {
    expect(NOTIFICATION_EVENT_KINDS).toEqual(['EmployeeReadiness30Day', 'EmployeePreparation14Day', 'EmployeeFinalReminder7Day', 'AnnualCycleOpen', 'QuarterlyCycleOpen']);
  });
});
