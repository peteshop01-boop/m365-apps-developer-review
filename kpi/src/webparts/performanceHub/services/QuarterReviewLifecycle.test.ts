import type { IProductionPerson } from '../models/ProductionModels';
import type { IQuarterReview } from '../models/QuarterlyModels';
import { canEmployeeEditQuarterReview, canManagerReadQuarterReview, filterManagerQuarterReviews } from './QuarterReviewAuthorisation';
import {
  createQuarterCreationAudit,
  createQuarterRagOverridePlan,
  createQuarterTransitionPlan,
  planQuarterTransition,
  verifyCompletedQuarterSubmission,
  verifyQuarterTransition
} from './QuarterReviewLifecycle';

const employee: IProductionPerson = { id: 1, personKey: 'employee', displayName: 'Employee', email: 'person012@example.invalid', appRoles: ['Employee'], active: true };
const manager: IProductionPerson = { id: 2, personKey: 'manager', displayName: 'Manager', email: 'person013@example.invalid', appRoles: ['Employee'], active: true };
const unrelated: IProductionPerson = { id: 3, personKey: 'other', displayName: 'Other', email: 'person017@example.invalid', appRoles: ['Employee'], active: true };
const draft: IQuarterReview = {
  id: 1, etag: '"1"', quarterReviewKey: 'workplan|Q3', workplanKey: 'workplan', personKey: employee.personKey,
  employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026, quarter: 'Q3',
  managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1
};

describe('QuarterReview lifecycle and authorisation', () => {
  it.each(['false', 'true', 1, false, undefined])('rejects malformed audit success %s', success => {
    const plan = createQuarterTransitionPlan(draft, employee, 'Submit', 'audit-success', '2026-11-01T10:00:00Z');
    const audit = { ...plan.audit, id: 10, success: success as unknown as boolean };
    expect(() => verifyQuarterTransition(plan.review, employee, [audit], 'Submitted', ['QuarterReviewSubmitted'])).toThrow(/exactly one/);
    expect(() => verifyCompletedQuarterSubmission(plan.review, employee, [audit])).toThrow(/exactly one/);
  });
  it.each(['actorPersonKey', 'actorEmail', 'performanceYear', 'quarter'] as const)('rejects missing audit %s provenance', field => {
    const plan = createQuarterTransitionPlan(draft, employee, 'Submit', 'audit-provenance', '2026-11-01T10:00:00Z');
    const audit = { ...plan.audit, id: 10 }; delete (audit as Partial<typeof audit>)[field];
    expect(() => verifyQuarterTransition(plan.review, employee, [audit], 'Submitted', ['QuarterReviewSubmitted'])).toThrow(/exactly one/);
  });
  describe.each(['Submit', 'Resubmit', 'Approve', 'Lock'] as const)('%s active actor boundary', action => {
    it.each(['false', 'true', 1, {}])('rejects nonboolean active %s', active => {
      const review = { ...draft, state: action === 'Submit' ? 'Draft' as const : action === 'Resubmit' ? 'ChangesRequested' as const
        : action === 'Approve' ? 'Submitted' as const : 'Approved' as const,
        accessState: action === 'Approve' ? 'ManagerDecision' as const : action === 'Lock' ? 'ReadOnly' as const : 'EmployeeEdit' as const };
      const actor = { ...(action === 'Submit' || action === 'Resubmit' ? employee : manager), active: active as unknown as boolean };
      expect(() => planQuarterTransition(review, actor, action)).toThrow();
    });
  });
  it.each(['active', 'personKey', 'email'] as const)('rejects inherited employee %s without executing its getter', field => {
    const actor = { ...employee }; delete (actor as Partial<IProductionPerson>)[field]; let reads = 0;
    Object.defineProperty(Object.prototype, field, { configurable: true, get: () => { reads++; return employee[field]; } });
    try { expect(canEmployeeEditQuarterReview(actor, draft)).toBe(false); expect(reads).toBe(0); }
    finally { delete (Object.prototype as Partial<IProductionPerson>)[field]; }
  });
  it('requires an own active actor for readback verification', () => {
    const submitted = createQuarterTransitionPlan(draft, employee, 'Submit', 'own-active', '2026-11-01T10:00:00Z');
    const actor = { ...employee }; delete (actor as Partial<IProductionPerson>).active;
    Object.defineProperty(Object.prototype, 'active', { configurable: true, value: true });
    try { expect(() => verifyQuarterTransition(submitted.review, actor, [{ ...submitted.audit, id: 10 }], 'Submitted', ['QuarterReviewSubmitted'])).toThrow(/active actor/); }
    finally { delete (Object.prototype as Partial<IProductionPerson>).active; }
  });
  it('isolates employee editing and manager direct-report reads', () => {
    expect(canEmployeeEditQuarterReview(employee, draft)).toBe(true);
    expect(canEmployeeEditQuarterReview(unrelated, draft)).toBe(false);
    expect(canManagerReadQuarterReview(manager, draft)).toBe(true);
    expect(canManagerReadQuarterReview(unrelated, draft)).toBe(false);
    expect(filterManagerQuarterReviews(manager, [draft, { ...draft, id: 2, managerPersonKey: unrelated.personKey, managerEmail: unrelated.email }])).toEqual([draft]);
  });

  it('supports only the controlled Draft→Submitted→ChangesRequested→Submitted→Approved→Locked path', () => {
    expect(planQuarterTransition(draft, employee, 'Submit').newState).toBe('Submitted');
    const submitted = { ...draft, state: 'Submitted' as const, accessState: 'ManagerDecision' as const };
    expect(planQuarterTransition(submitted, manager, 'RequestChanges', 'Clarify the Actual.').newState).toBe('ChangesRequested');
    expect(() => planQuarterTransition(submitted, manager, 'RequestChanges', ' ')).toThrow(/requires a manager comment/);
    const changes = { ...draft, state: 'ChangesRequested' as const };
    expect(planQuarterTransition(changes, employee, 'Resubmit').newState).toBe('Submitted');
    expect(planQuarterTransition(submitted, manager, 'Approve').newState).toBe('Approved');
    const approved = { ...submitted, state: 'Approved' as const, accessState: 'ReadOnly' as const };
    expect(planQuarterTransition(approved, manager, 'Lock').newState).toBe('Locked');
  });

  it('rejects unrelated actors and invalid state jumps', () => {
    const submitted = { ...draft, state: 'Submitted' as const, accessState: 'ManagerDecision' as const };
    expect(() => planQuarterTransition(draft, manager, 'Submit')).toThrow(/review employee/);
    expect(() => planQuarterTransition(submitted, unrelated, 'Approve')).toThrow(/assigned manager/);
    expect(() => planQuarterTransition(draft, employee, 'Resubmit')).toThrow(/not allowed/);
  });

  it('plans append-only metadata for submission, request changes, approval and lock', () => {
    const submitted = createQuarterTransitionPlan(draft, employee, 'Submit', 'submit-1', '2026-11-01T10:00:00Z');
    expect(submitted.review).toEqual(expect.objectContaining({ state: 'Submitted', accessState: 'ManagerDecision', submittedByEmail: employee.email, rowVersionToken: 2 }));
    expect(submitted.audit).toEqual(expect.objectContaining({ eventType: 'QuarterReviewSubmitted', correlationKey: 'submit-1', actorPersonKey: employee.personKey }));
    const changes = createQuarterTransitionPlan(submitted.review, manager, 'RequestChanges', 'changes-1', '2026-11-02T10:00:00Z', 'Clarify the result.');
    expect(changes.review).toEqual(expect.objectContaining({ state: 'ChangesRequested', accessState: 'EmployeeEdit', managerDecisionComment: 'Clarify the result.' }));
    const resubmitted = createQuarterTransitionPlan(changes.review, employee, 'Resubmit', 'resubmit-1', '2026-11-03T10:00:00Z');
    const approved = createQuarterTransitionPlan(resubmitted.review, manager, 'Approve', 'approval-1', '2026-11-04T10:00:00Z');
    const locked = createQuarterTransitionPlan(approved.review, manager, 'Lock', 'approval-1', '2026-11-04T10:00:01Z');
    expect(locked.review).toEqual(expect.objectContaining({ state: 'Locked', accessState: 'ReadOnly', approvedByEmail: manager.email, lockedByEmail: manager.email }));
    expect([approved.audit.eventType, locked.audit.eventType]).toEqual(['QuarterReviewApproved', 'QuarterReviewLocked']);
  });

  it('creates and verifies one correlated audit per transition event', () => {
    const creation = createQuarterCreationAudit(draft, employee, 'created-audit', '2026-08-20T10:00:00Z');
    expect(creation).toEqual(expect.objectContaining({ eventType: 'QuarterReviewCreated', correlationKey: 'workplan|Q3|created' }));
    const submitted = createQuarterTransitionPlan(draft, employee, 'Submit', 'submit-2', '2026-11-01T10:00:00Z');
    const audit = { ...submitted.audit, id: 10 };
    expect(verifyQuarterTransition(submitted.review, employee, [audit], 'Submitted', ['QuarterReviewSubmitted'])).toEqual([audit]);
    expect(() => verifyQuarterTransition(submitted.review, employee, [audit, { ...audit, id: 11 }], 'Submitted', ['QuarterReviewSubmitted'])).toThrow(/exactly one/);
  });

  it('verifies repeat Submit and repeat Resubmit from the persisted correlated audit without changing event type', () => {
    const submitted = createQuarterTransitionPlan(draft, employee, 'Submit', 'submit-repeat', '2026-11-01T10:00:00Z');
    const submittedAudit = { ...submitted.audit, id: 10 };
    expect(verifyCompletedQuarterSubmission(submitted.review, employee, [submittedAudit])).toEqual([submittedAudit]);

    const changes = createQuarterTransitionPlan(submitted.review, manager, 'RequestChanges', 'changes-repeat', '2026-11-02T10:00:00Z', 'Clarify the Actual.');
    const resubmitted = createQuarterTransitionPlan(changes.review, employee, 'Resubmit', 'resubmit-repeat', '2026-11-03T10:00:00Z');
    const resubmittedAudit = { ...resubmitted.audit, id: 11 };
    expect(verifyCompletedQuarterSubmission(resubmitted.review, employee, [resubmittedAudit])).toEqual([resubmittedAudit]);
    expect(verifyCompletedQuarterSubmission(resubmitted.review, employee, [submittedAudit, resubmittedAudit])).toEqual([resubmittedAudit]);
    expect(() => verifyCompletedQuarterSubmission(resubmitted.review, employee,
      [submittedAudit, resubmittedAudit, { ...resubmittedAudit, id: 12 }])).toThrow(/exactly one/);
  });

  it('keeps calculated RAG and requires a reasoned manager override', () => {
    const submitted = { ...draft, state: 'Submitted' as const, accessState: 'ManagerDecision' as const };
    const item = {
      id: 1, etag: '"1"', quarterReviewItemKey: 'workplan|Q3|core', quarterReviewKey: submitted.quarterReviewKey,
      workplanItemKey: 'core', workplanKey: submitted.workplanKey, personKey: submitted.personKey,
      performanceYear: 2026, quarter: 'Q3' as const, itemType: 'CoreGold' as const, kpiId: 'SO1-001', wording: 'Core KPI',
      calculatedRag: 'Amber' as const, evidenceCount: 0, managerApproved: false, locked: false
    };
    const plan = createQuarterRagOverridePlan(submitted, item, manager, 'Red', 'Delivery risk confirmed.', 'override-1', '2026-11-02T10:00:00Z');
    expect(plan.item.calculatedRag).toBe('Amber');
    expect(plan.item.finalApprovedRag).toBe('Red');
    expect(plan.audit.eventType).toBe('RAGOverridden');
    expect(createQuarterRagOverridePlan(submitted, {
      ...item, quarterReviewItemKey: 'workplan|Q3|impact', workplanItemKey: 'impact', itemType: 'LocalPersonal',
      kpiId: undefined, reportingStream: 'Impact'
    }, manager, 'Green', 'Impact evidence supports Green.', 'override-impact', '2026-11-02T10:00:00Z').item.finalApprovedRag).toBe('Green');
    expect(() => createQuarterRagOverridePlan(submitted, {
      ...item, quarterReviewItemKey: 'workplan|Q3|behaviour', workplanItemKey: 'behaviour', itemType: 'Behaviour',
      kpiId: undefined, reportingStream: 'Behaviour'
    }, manager, 'Green', 'Invalid behaviour override.', 'override-behaviour', '2026-11-02T10:00:00Z')).toThrow(/Core or Impact/);
    expect(() => createQuarterRagOverridePlan(submitted, item, manager, 'Red', ' ', 'override-2', '2026-11-02T10:00:00Z')).toThrow(/requires a reason/);
    expect(() => createQuarterRagOverridePlan(submitted, { ...item, calculatedRag: 'NotRated' }, manager, 'Green', 'Override', 'override-3', '2026-11-02T10:00:00Z')).toThrow(/cannot repair/);
  });

  it('selects the current successful resubmission from append-only history', () => {
    const submitted = createQuarterTransitionPlan(draft, employee, 'Submit', 'old-submit', '2026-11-01T10:00:00Z');
    const changes = createQuarterTransitionPlan(submitted.review, manager, 'RequestChanges', 'old-changes', '2026-11-02T10:00:00Z', 'Clarify.');
    const current = createQuarterTransitionPlan(changes.review, employee, 'Resubmit', 'current-submit', '2026-11-03T10:00:00Z');
    const audit = { ...current.audit, id: 20 };
    const history = [{ ...submitted.audit, id: 10 }, { ...changes.audit, id: 11 },
      { ...audit, id: 12, subjectKey: 'other-review' }, { ...audit, id: 13, success: false }, audit];
    expect(verifyCompletedQuarterSubmission(current.review, employee, history)).toEqual([audit]);
    expect(() => verifyCompletedQuarterSubmission(current.review, employee, [...history, { ...audit, id: 21 }])).toThrow(/exactly one/);
  });

  it('does not accept an older successful submission for the current transition', () => {
    const current = createQuarterTransitionPlan(draft, employee, 'Submit', 'current-submit', '2026-11-01T10:00:00Z');
    expect(() => verifyCompletedQuarterSubmission(current.review, employee,
      [{ ...current.audit, id: 10, correlationKey: 'older-submit' }])).toThrow(/exactly one/);
  });

  it('selects current manager decisions without changing or rejecting older history', () => {
    const submitted = createQuarterTransitionPlan(draft, employee, 'Submit', 'submit-manager', '2026-11-01T10:00:00Z');
    const current = createQuarterTransitionPlan(submitted.review, manager, 'RequestChanges', 'current-changes', '2026-11-02T10:00:00Z', 'Clarify.');
    const audit = { ...current.audit, id: 20 };
    const older = { ...audit, id: 10, correlationKey: 'older-changes' };
    expect(verifyQuarterTransition(current.review, manager, [older, audit], 'ChangesRequested', ['QuarterReviewChangesRequested'])).toEqual([audit]);
    expect(() => verifyQuarterTransition(current.review, manager, [older], 'ChangesRequested', ['QuarterReviewChangesRequested'])).toThrow(/exactly one/);
  });

  it.each([undefined, '', '   '])('requires a persisted current correlation (%s)', correlation => {
    const current = createQuarterTransitionPlan(draft, employee, 'Submit', 'current-submit', '2026-11-01T10:00:00Z');
    expect(() => verifyQuarterTransition({ ...current.review, transitionCorrelationKey: correlation }, employee,
      [{ ...current.audit, id: 10 }], 'Submitted', ['QuarterReviewSubmitted'])).toThrow(/correlation/);
  });

  describe.each(['Submit', 'Resubmit', 'RequestChanges', 'Approve', 'Lock'] as const)('%s version admission', action => {
    const source = (): IQuarterReview => ({ ...draft,
      state: action === 'Submit' ? 'Draft' : action === 'Resubmit' ? 'ChangesRequested' : action === 'Lock' ? 'Approved' : 'Submitted',
      accessState: action === 'Submit' || action === 'Resubmit' ? 'EmployeeEdit' : action === 'Lock' ? 'ReadOnly' : 'ManagerDecision' });
    const actor = action === 'Submit' || action === 'Resubmit' ? employee : manager;
    it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, undefined])(
      'rejects invalid or exhausted source version %s without modifying the review', version => {
        const review = { ...source(), rowVersionToken: version as number };
        const before = { ...review };
        expect(() => createQuarterTransitionPlan(review, actor, action, 'version-check', '2026-11-01T10:00:00Z', 'Clarify.')).toThrow(/version/);
        expect(review).toEqual(before);
      });
    it('advances a valid boundary version exactly and preserves before/after audit versions', () => {
      const version = Number.MAX_SAFE_INTEGER - (action === 'Approve' ? 2 : 1);
      const review = { ...source(), rowVersionToken: version };
      const plan = createQuarterTransitionPlan(review, actor, action, 'version-check', '2026-11-01T10:00:00Z', 'Clarify.');
      expect(plan.review.rowVersionToken).toBe(version + 1);
      expect(review.rowVersionToken).toBe(version);
      expect(JSON.parse(plan.audit.beforeJson as string).value.rowVersionToken).toBe(version);
      expect(JSON.parse(plan.audit.afterJson as string).value.rowVersionToken).toBe(version + 1);
    });
  });

  it('reserves the following Lock version before approving a submitted review', () => {
    const review = { ...draft, state: 'Submitted' as const, accessState: 'ManagerDecision' as const,
      rowVersionToken: Number.MAX_SAFE_INTEGER - 1 };
    expect(() => createQuarterTransitionPlan(review, manager, 'Approve', 'approve-lock', '2026-11-01T10:00:00Z')).toThrow(/version/);
    expect(review.state).toBe('Submitted');
  });

  it('allows approval followed by lock at the final safe version without mutating the source', () => {
    const review = { ...draft, state: 'Submitted' as const, accessState: 'ManagerDecision' as const,
      rowVersionToken: Number.MAX_SAFE_INTEGER - 2 };
    const approval = createQuarterTransitionPlan(review, manager, 'Approve', 'approve-lock', '2026-11-01T10:00:00Z');
    const lock = createQuarterTransitionPlan(approval.review, manager, 'Lock', 'approve-lock', '2026-11-01T10:00:01Z');
    expect(lock.review.rowVersionToken).toBe(Number.MAX_SAFE_INTEGER);
    expect(lock.review.state).toBe('Locked');
    expect(review.state).toBe('Submitted');
    expect(approval.review.state).toBe('Approved');
  });
});
