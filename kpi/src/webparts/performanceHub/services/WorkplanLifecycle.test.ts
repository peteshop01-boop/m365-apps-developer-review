import type {
  IAnnualWorkplan,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  IControlledSubmissionContext,
  ICoreKpiCatalogueItem,
  ICoreWorkplanItem,
  IProductionPerson,
  IWorkplanAuditEvent,
  WorkplanState
} from '../models/ProductionModels';
import { canEmployeeEditWorkplan, canManagerDecideWorkplan, canManagerReadWorkplan } from './WorkplanAuthorisation';
import {
  assertAnnualWorkplanLifecycleAction,
  assertAppendOnlyWorkplanAuditHistory,
  assertPersistedWorkplanAuditMatchesPlan,
  createAdminLockPlan,
  createApprovalPlan,
  createControlledAmendmentPlan,
  createControlledReopenPlan,
  createRequestChangesPlan,
  executeControlledAmendment,
  normaliseStrictUtcTimestamp,
  type AnnualWorkplanLifecycleAction,
  type IControlledAmendmentExecutionPort,
  verifyCompletedManagerTransition
} from './WorkplanLifecycle';

const employee: IProductionPerson = {
  id: 1,
  personKey: 'person',
  displayName: 'Synthetic Person 02',
  email: 'person003@example.invalid',
  managerPersonKey: 'manager',
  managerEmail: 'person002@example.invalid',
  appRoles: ['Employee'],
  active: true
};

const manager: IProductionPerson = {
  id: 2,
  personKey: 'manager',
  displayName: 'Synthetic Person 01',
  email: 'person002@example.invalid',
  appRoles: ['Manager'],
  active: true
};

const unrelated: IProductionPerson = {
  id: 3,
  personKey: 'unrelated',
  displayName: 'Unrelated Manager',
  email: 'person020@example.invalid',
  appRoles: ['Manager'],
  active: true
};

const systemAdmin: IProductionPerson = {
  id: 4,
  personKey: 'system-admin',
  displayName: 'System Administrator',
  email: 'person014@example.invalid',
  appRoles: ['SystemAdmin'],
  active: true
};

const submitted: IAnnualWorkplan = {
  id: 1,
  etag: '"3"',
  workplanKey: 'person|2026',
  personKey: employee.personKey,
  employeeDisplayName: employee.displayName,
  employeeEmail: employee.email,
  performanceYear: 2026,
  managerPersonKey: manager.personKey,
  managerDisplayName: manager.displayName,
  managerEmail: manager.email,
  state: 'Submitted',
  accessState: 'ManagerDecision',
  transitionStatus: 'Ready',
  transitionCorrelationKey: 'submission-correlation',
  coreCategoryWeight: 80,
  personalCategoryWeight: 0,
  behaviourCategoryWeight: 20,
  categoryWeightReason: 'No Personal KPIs in this Workplan.',
  submittedAt: '2026-08-19T22:44:39Z',
  submittedByEmail: employee.email,
  rowVersionToken: 3
};

const catalogue: ICoreKpiCatalogueItem[] = [{
  kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|v01',
  targetVersionKey: 'SO1-001|2026|v01',
  wording: 'Approved KPI',
  pillar: 'Pillar',
  workstream: 'Workstream',
  scoringDirection: 'TBC',
  unitLabel: 'TBC'
}];

const coreItems: ICoreWorkplanItem[] = [{
  id: 1,
  etag: '"2"',
  workplanItemKey: 'core',
  naturalKey: 'person|2026|CoreGold|SO1-001',
  workplanKey: submitted.workplanKey,
  personKey: employee.personKey,
  performanceYear: 2026,
  kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|v01',
  targetVersionKey: 'SO1-001|2026|v01',
  coreWorkplanWeight: 100,
  employeeKpiRole: 'Contributor',
  displayOrder: 1,
  activeInWorkplan: true
}];

const behaviours: IBehaviourSummary[] = Array.from({ length: 5 }, (_, index) => ({
  behaviourId: `BHV-0${index + 1}`,
  behaviourVersionKey: `BHV-0${index + 1}|v01`,
  title: `Behaviour ${index + 1}`,
  description: 'Approved',
  defaultWorkplanWeight: 20,
  displayOrder: index + 1
}));

const behaviourItems: IBehaviourWorkplanItem[] = behaviours.map((behaviour, index) => ({
  id: index + 3,
  etag: '"2"',
  workplanItemKey: `behaviour-${index + 1}`,
  naturalKey: `${submitted.workplanKey}|Behaviour|${behaviour.behaviourId}`,
  workplanKey: submitted.workplanKey,
  personKey: employee.personKey,
  performanceYear: 2026,
  behaviourId: behaviour.behaviourId,
  behaviourVersionKey: behaviour.behaviourVersionKey,
  objectiveSource: 'Custom',
  objectiveTitle: `${behaviour.title} objective`,
  objectiveDescription: 'Controlled objective',
  measure: 'Delivery evidence',
  unit: 'rating',
  evidenceDefinition: 'Quarterly evidence',
  q1TargetText: 'Q1 commitment',
  q2TargetText: 'Q2 commitment',
  q3TargetText: 'Q3 commitment',
  q4TargetText: 'Q4 commitment',
  q1TargetRating: 3,
  q2TargetRating: 3,
  q3TargetRating: 3,
  q4TargetRating: 3,
  behaviourItemWeight: 20,
  displayOrder: index + 1,
  activeInWorkplan: true
}));

const context: IControlledSubmissionContext = {
  workplan: submitted,
  employee,
  manager,
  config: {
    performanceYear: '2025/26',
    performanceYearStart: '2025-11-01',
    performanceYearEnd: '2026-10-31',
    performanceYearNumber: 2026,
    quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' },
    weights: { core: 70, personal: 20, behaviours: 10 },
    rag: { greenThreshold: 90, amberThreshold: 50 },
    aggregationMethods: ['DirectMetric'],
    retentionStatus: 'TBC'
  },
  coreCatalogue: catalogue,
  coreItems,
  personalItems: [],
  behaviours,
  behaviourItems
};

const asAudit = (id: number, write: ReturnType<typeof createRequestChangesPlan>['audit']): IWorkplanAuditEvent => ({ id, ...write });

describe('Workplan manager decision and separate Admin lock lifecycle', () => {
  it('authorises only SyntheticUser against Synthetic User and requires a change-request comment', () => {
    expect(canManagerReadWorkplan(manager, submitted)).toBe(true);
    expect(canManagerDecideWorkplan(manager, submitted)).toBe(true);
    expect(canManagerReadWorkplan(unrelated, submitted)).toBe(false);
    expect(canManagerDecideWorkplan(unrelated, submitted)).toBe(false);
    expect(() => createRequestChangesPlan(submitted, manager, '   ', 'request-1', '2026-08-20T09:00:00Z')).toThrow(/comment is required/);
    expect(() => createRequestChangesPlan(submitted, unrelated, 'Clarify delivery.', 'request-1', '2026-08-20T09:00:00Z')).toThrow(/assigned manager/);
  });

  it('plans Submitted to Changes Requested without mutating the prior submission', () => {
    const original = JSON.stringify(submitted);
    const plan = createRequestChangesPlan(submitted, manager, 'Clarify the employee delivery role.', 'request-1', '2026-08-20T09:00:00Z');
    expect(plan.audit).toEqual(expect.objectContaining({
      eventType: 'WorkplanChangesRequested',
      subjectKey: submitted.workplanKey,
      actorEmail: manager.email,
      reason: 'Clarify the employee delivery role.'
    }));
    expect(JSON.parse(plan.audit.afterJson || '{}')).toEqual(expect.objectContaining({
      state: 'ChangesRequested',
      actorPersonKey: manager.personKey,
      managerPersonKey: manager.personKey,
      storageAcl: 'InheritedDependency'
    }));
    expect(JSON.stringify(submitted)).toBe(original);
  });

  it('verifies a single idempotent Changes Requested event and reopens employee editing only then', () => {
    const plan = createRequestChangesPlan(submitted, manager, 'Clarify delivery.', 'request-1', '2026-08-20T09:00:00Z');
    const changed: IAnnualWorkplan = {
      ...submitted,
      state: 'ChangesRequested',
      accessState: 'EmployeeEdit',
      transitionStatus: 'Ready',
      transitionCorrelationKey: 'request-1',
      managerDecisionComment: plan.reason,
      rowVersionToken: 5
    };
    const audit = asAudit(2, plan.audit);
    expect(verifyCompletedManagerTransition(changed, manager, [audit], 'ChangesRequested', ['WorkplanChangesRequested'])).toEqual([audit]);
    expect(() => verifyCompletedManagerTransition(changed, manager, [audit, { ...audit, id: 3 }], 'ChangesRequested', ['WorkplanChangesRequested'])).toThrow(/missing or duplicated/);
    expect(canEmployeeEditWorkplan(employee, changed)).toBe(true);
    expect(canEmployeeEditWorkplan(employee, submitted)).toBe(false);
  });

  it('allows the assigned Manager to approve but not lock a valid Submitted Workplan', () => {
    const plan = createApprovalPlan(context, manager, 'approval-1', '2026-08-20T10:00:00Z');
    expect(plan.audit.eventType).toBe('WorkplanApproved');
    expect(plan.audit.actorRole).toBe('Manager');
    expect(JSON.parse(plan.audit.afterJson || '{}')).toEqual(expect.objectContaining({
      state: 'Approved',
      approvedByPersonKey: manager.personKey,
      approvedByEmail: manager.email,
      categoryWeights: { core: 80, personal: 0, behaviours: 20 },
      behaviourObjectiveCounts: { library: 0, custom: 5 }
    }));
    expect(() => createApprovalPlan(context, unrelated, 'approval-2', '2026-08-20T10:00:00Z')).toThrow(/assigned manager/);
    expect(() => createApprovalPlan({ ...context, workplan: { ...submitted, state: 'ChangesRequested', accessState: 'EmployeeEdit' } }, manager, 'approval-3', '2026-08-20T10:00:00Z')).toThrow(/not allowed from ChangesRequested/);
  });

  it('verifies Manager Approved idempotently and leaves employee and manager editing disabled', () => {
    const plan = createApprovalPlan(context, manager, 'approval-1', '2026-08-20T10:00:00Z');
    const approvedAudit: IWorkplanAuditEvent = { id: 4, ...plan.audit };
    const approved: IAnnualWorkplan = {
      ...submitted,
      state: 'Approved',
      accessState: 'ReadOnly',
      transitionStatus: 'Ready',
      transitionCorrelationKey: 'approval-1',
      approvedAt: plan.approvedAt,
      approvedByEmail: manager.email,
      rowVersionToken: 5
    };
    expect(verifyCompletedManagerTransition(approved, manager, [approvedAudit], 'Approved', ['WorkplanApproved'])).toEqual([approvedAudit]);
    expect(() => verifyCompletedManagerTransition(approved, manager, [approvedAudit, { ...approvedAudit, id: 6 }], 'Approved', ['WorkplanApproved'])).toThrow(/missing or duplicated/);
    expect(canEmployeeEditWorkplan(employee, approved)).toBe(false);
    expect(canManagerDecideWorkplan(manager, approved)).toBe(false);
    expect(canManagerReadWorkplan(manager, approved)).toBe(true);
  });
});

describe('AWP-022/023 controlled annual lifecycle and immutable audit', () => {
  const approved: IAnnualWorkplan = {
    ...submitted,
    state: 'Approved',
    accessState: 'ReadOnly',
    transitionStatus: 'Ready',
    transitionCorrelationKey: 'approval-1',
    approvedAt: '2026-08-20T10:00:00Z',
    approvedByEmail: manager.email,
    rowVersionToken: 5
  };
  const locked: IAnnualWorkplan = {
    ...approved,
    state: 'Locked',
    lockedAt: '2026-08-20T10:00:01Z',
    lockedByEmail: manager.email,
    rowVersionToken: 7
  };

  it.each([
    ['Submit', { ...submitted, state: 'Draft', accessState: 'EmployeeEdit' }, employee],
    ['Resubmit', { ...submitted, state: 'ChangesRequested', accessState: 'EmployeeEdit' }, employee],
    ['RequestChanges', submitted, manager],
    ['Approve', submitted, manager],
    ['Lock', approved, systemAdmin],
    ['Reopen', locked, systemAdmin],
    ['CreateAmendment', approved, systemAdmin],
  ] as const)('allows the exact %s state and actor contract', (action, workplan, actor) => {
    expect(() => assertAnnualWorkplanLifecycleAction(workplan, actor, action)).not.toThrow();
  });

  it('rejects illegal state/actor combinations before a lifecycle write', () => {
    const states: WorkplanState[] = ['Draft', 'Submitted', 'ChangesRequested', 'Approved', 'Locked', 'Archived'];
    const allowed: Record<AnnualWorkplanLifecycleAction, readonly WorkplanState[]> = {
      Submit: ['Draft'],
      Resubmit: ['ChangesRequested'],
      RequestChanges: ['Submitted'],
      Approve: ['Submitted'],
      Lock: ['Approved'],
      Reopen: ['Locked'],
      CreateAmendment: ['Approved']
    };
    const actors: Record<AnnualWorkplanLifecycleAction, IProductionPerson> = {
      Submit: employee,
      Resubmit: employee,
      RequestChanges: manager,
      Approve: manager,
      Lock: systemAdmin,
      Reopen: systemAdmin,
      CreateAmendment: systemAdmin
    };
    const access: Record<AnnualWorkplanLifecycleAction, string> = {
      Submit: 'EmployeeEdit',
      Resubmit: 'EmployeeEdit',
      RequestChanges: 'ManagerDecision',
      Approve: 'ManagerDecision',
      Lock: 'ReadOnly',
      Reopen: 'ReadOnly',
      CreateAmendment: 'ReadOnly'
    };
    (Object.keys(allowed) as AnnualWorkplanLifecycleAction[]).forEach(action => states
      .filter(state => allowed[action].indexOf(state) < 0)
      .forEach(state => expect(() => assertAnnualWorkplanLifecycleAction({
        ...submitted, state, accessState: access[action], approvedAt: approved.approvedAt,
        approvedByEmail: approved.approvedByEmail, lockedAt: locked.lockedAt, lockedByEmail: locked.lockedByEmail
      }, actors[action], action)).toThrow(/not allowed/)));
    expect(() => assertAnnualWorkplanLifecycleAction(submitted, employee, 'Approve')).toThrow(/Manager role/);
    expect(() => assertAnnualWorkplanLifecycleAction(approved, manager, 'CreateAmendment')).toThrow(/SystemAdmin role/);
    expect(() => assertAnnualWorkplanLifecycleAction(approved, { ...systemAdmin, active: false }, 'CreateAmendment')).toThrow(/SystemAdmin role/);
  });

  it('separates Admin/year-gate locking and controlled Locked to Approved reopen with dependency guards', () => {
    const lock = createAdminLockPlan(approved, systemAdmin, {
      performanceYear: approved.performanceYear, controlReference: 'CONTROL-YEAR-GATE-2026'
    }, 'lock-1', '2026-09-20T09:00:00+00:00');
    expect(lock.audit).toEqual(expect.objectContaining({ eventType: 'WorkplanLocked', actorRole: 'SystemAdmin' }));
    expect(JSON.parse(lock.audit.afterJson || '{}')).toEqual(expect.objectContaining({
      state: 'Locked', yearGateReference: 'CONTROL-YEAR-GATE-2026'
    }));
    expect(() => createAdminLockPlan(approved, manager, {
      performanceYear: approved.performanceYear, controlReference: 'CONTROL-YEAR-GATE-2026'
    }, 'bad-lock', '2026-09-20T09:00:00Z')).toThrow(/SystemAdmin/);
    expect(() => createAdminLockPlan(approved, systemAdmin, {
      performanceYear: 2025, controlReference: 'CONTROL-YEAR-GATE-2026'
    }, 'bad-year', '2026-09-20T09:00:00Z')).toThrow(/year gate/);

    expect(() => createControlledReopenPlan(
      locked, systemAdmin, 'Correct locked content.', 'CONTROL-AWP-023', 'reopen-blocked',
      '2026-09-20T09:05:00Z', { downstreamQuarterDependencyCount: 1 }
    )).toThrow(/supersession/);
    const reopen = createControlledReopenPlan(
      locked, systemAdmin, 'Correct locked content.', 'CONTROL-AWP-023', 'reopen-1',
      '2026-09-20T09:05:00Z', {
        downstreamQuarterDependencyCount: 1,
        supersessionControlReference: 'CONTROL-PUBLISH-SUPERSESSION-01'
      }
    );
    expect(reopen.completed).toEqual(expect.objectContaining({
      state: 'Approved', accessState: 'ReadOnly', approvedAt: locked.approvedAt, lockedAt: locked.lockedAt
    }));
    expect(JSON.parse(reopen.audit.afterJson || '{}')).toEqual(expect.objectContaining({
      state: 'Approved', downstreamQuarterDependencyCount: 1,
      supersessionControlReference: 'CONTROL-PUBLISH-SUPERSESSION-01'
    }));
  });

  it('creates a CONTROL-referenced amendment only from Approved without erasing prior provenance', () => {
    const reopenedApproved = { ...locked, state: 'Approved' as const };
    const original = JSON.stringify(reopenedApproved);
    const plan = createControlledAmendmentPlan(
      reopenedApproved, systemAdmin, 'Correct the approved selection.', 'CONTROL-AWP-023', 'amendment-1', '2026-09-20T09:15:00Z'
    );
    expect(plan.started).toEqual(expect.objectContaining({
      state: 'Approved', accessState: 'ReadOnly', transitionStatus: 'InProgress', rowVersionToken: 8
    }));
    expect(plan.completed).toEqual(expect.objectContaining({
      state: 'ChangesRequested', accessState: 'EmployeeEdit', transitionStatus: 'Ready',
      approvedAt: reopenedApproved.approvedAt, approvedByEmail: reopenedApproved.approvedByEmail,
      lockedAt: reopenedApproved.lockedAt, lockedByEmail: reopenedApproved.lockedByEmail, rowVersionToken: 9
    }));
    expect(plan.audit).toEqual(expect.objectContaining({
      eventType: 'WorkplanChangesRequested', actorEmail: systemAdmin.email,
      actorRole: 'SystemAdmin', reason: 'Correct the approved selection.', sourceReference: 'CONTROL-AWP-023'
    }));
    expect(JSON.parse(plan.audit.beforeJson || '{}')).toEqual(expect.objectContaining({
      state: 'Approved', approvedAt: reopenedApproved.approvedAt, lockedAt: reopenedApproved.lockedAt
    }));
    expect(JSON.stringify(reopenedApproved)).toBe(original);
    expect(() => createControlledAmendmentPlan(locked, systemAdmin, 'Attempt.', 'CONTROL-AWP-023', 'bad-state', '2026-09-20T09:15:00Z')).toThrow(/not allowed from Locked/);
    expect(() => createControlledAmendmentPlan(approved, manager, 'Attempt.', 'CONTROL-AWP-023', 'bad-1', '2026-09-20T09:15:00Z')).toThrow(/SystemAdmin/);
    expect(() => createControlledAmendmentPlan(approved, systemAdmin, ' ', 'CONTROL-AWP-023', 'bad-2', '2026-09-20T09:15:00Z')).toThrow(/reason/);
    expect(() => createControlledAmendmentPlan(approved, systemAdmin, 'Attempt.', 'none', 'bad-3', '2026-09-20T09:15:00Z')).toThrow(/CONTROL/);
  });

  it('accepts only append-only audit history and rejects deletion, mutation, reordering or duplicate keys', () => {
    const first = asAudit(1, createRequestChangesPlan(submitted, manager, 'Clarify delivery.', 'request-1', '2026-08-20T09:00:00Z').audit);
    const second = { ...first, id: 2, auditKey: 'request-2', correlationKey: 'request-2' };
    expect(() => assertAppendOnlyWorkplanAuditHistory([first], [first, second])).not.toThrow();
    expect(() => assertAppendOnlyWorkplanAuditHistory([first], [])).toThrow(/delete/);
    expect(() => assertAppendOnlyWorkplanAuditHistory([first], [{ ...first, reason: 'rewritten' }])).toThrow(/edit or reorder/);
    expect(() => assertAppendOnlyWorkplanAuditHistory([first, second], [second, first])).toThrow(/edit or reorder/);
    expect(() => assertAppendOnlyWorkplanAuditHistory([first], [first, { ...second, auditKey: first.auditKey }])).toThrow(/duplicate/);
  });

  it('enters Recovery Hold on partial failure without rolling back appended immutable history', async () => {
    const plan = createControlledAmendmentPlan(
      approved, systemAdmin, 'Correct the approved selection.', 'CONTROL-AWP-023', 'amendment-2', '2026-09-20T09:20:00Z'
    );
    const prior = asAudit(1, createApprovalPlan(context, manager, 'approval-old', '2026-08-20T10:00:00Z').audit);
    const storedAudits: IWorkplanAuditEvent[] = [prior];
    let recovery: IAnnualWorkplan | undefined;
    const port: IControlledAmendmentExecutionPort = {
      stage: async value => ({ ...value }),
      appendAudit: async value => {
        const appended: IWorkplanAuditEvent = { id: 2, ...value };
        storedAudits.push(appended);
        return appended;
      },
      finalise: async () => { throw new Error('simulated finalise failure'); },
      markRecoveryHold: async value => { recovery = { ...value }; }
    };
    await expect(executeControlledAmendment(() => plan, [prior], port)).rejects.toThrow(/simulated finalise failure/);
    expect(storedAudits).toHaveLength(2);
    expect(storedAudits[0]).toEqual(prior);
    expect(storedAudits[1].eventType).toBe('WorkplanChangesRequested');
    expect(recovery).toEqual(expect.objectContaining({
      state: 'Approved', accessState: 'RecoveryHold', transitionStatus: 'Failed', transitionCorrelationKey: 'amendment-2'
    }));
  });

  it('performs no protected write when amendment planning is rejected and completes an accepted plan exactly once', async () => {
    const calls: string[] = [];
    const port: IControlledAmendmentExecutionPort = {
      stage: async value => { calls.push('stage'); return { ...value }; },
      appendAudit: async value => { calls.push('audit'); return { id: 2, ...value }; },
      finalise: async value => { calls.push('finalise'); return { ...value }; },
      markRecoveryHold: async () => { calls.push('hold'); }
    };
    await expect(executeControlledAmendment(() => createControlledAmendmentPlan(
      approved, manager, 'Attempt.', 'CONTROL-AWP-023', 'rejected-1', '2026-09-20T09:30:00Z'
    ), [], port)).rejects.toThrow(/SystemAdmin/);
    expect(calls).toEqual([]);

    const accepted = createControlledAmendmentPlan(
      approved, systemAdmin, 'Correct the approved selection.', 'CONTROL-AWP-023', 'amendment-3', '2026-09-20T09:31:00Z'
    );
    const result = await executeControlledAmendment(() => accepted, [], port);
    expect(calls).toEqual(['stage', 'audit', 'finalise']);
    expect(result.workplan).toEqual(accepted.completed);
    expect(result.auditHistory).toHaveLength(1);
  });

  it('rejects a replayed correlation/idempotency key before any protected call', async () => {
    const plan = createControlledAmendmentPlan(
      approved, systemAdmin, 'Correct the approved selection.', 'CONTROL-AWP-023', 'amendment-replay', '2026-09-20T09:31:00Z'
    );
    const prior: IWorkplanAuditEvent = { id: 1, ...plan.audit };
    const calls: string[] = [];
    await expect(executeControlledAmendment(() => plan, [prior], {
      stage: async value => { calls.push('stage'); return value; },
      appendAudit: async value => { calls.push('audit'); return { id: 2, ...value }; },
      finalise: async value => { calls.push('finalise'); return value; },
      markRecoveryHold: async () => { calls.push('hold'); }
    })).rejects.toThrow(/already been used/);
    expect(calls).toEqual([]);
  });

  it('accepts explicit UTC variants, canonicalises them, and rejects timezone-less or non-UTC timestamps', () => {
    expect(normaliseStrictUtcTimestamp('2026-09-20T09:15:00Z')).toBe('2026-09-20T09:15:00.000Z');
    expect(normaliseStrictUtcTimestamp('2026-09-20T09:15:00.125+00:00')).toBe('2026-09-20T09:15:00.125Z');
    expect(() => normaliseStrictUtcTimestamp('2026-09-20 09:15:00')).toThrow(/strict UTC/);
    expect(() => normaliseStrictUtcTimestamp('2026-09-20T10:15:00+01:00')).toThrow(/strict UTC/);
    expect(() => normaliseStrictUtcTimestamp('2026-02-30T09:15:00Z')).toThrow(/valid calendar date/);
    expect(() => createControlledAmendmentPlan(
      approved, systemAdmin, 'Correct.', 'CONTROL-AWP-023', 'non-utc', '2026-09-20 09:15:00'
    )).toThrow(/strict UTC/);
  });

  it.each([
    ['subject', { subjectKey: 'OTHER-WORKPLAN' }],
    ['year', { performanceYear: 1999 }],
    ['actor email', { actorEmail: 'attacker@kcf.example' }],
    ['actor role', { actorRole: 'Employee' }],
    ['UTC time', { eventAt: '2000-01-01T00:00:00.000Z' }],
    ['reason', { reason: 'tampered' }],
    ['before content', { beforeJson: '{}' }],
    ['after content', { afterJson: '{}' }],
    ['CONTROL reference', { sourceReference: 'CONTROL-OTHER' }],
    ['correlation', { correlationKey: 'different-correlation' }],
    ['audit key', { auditKey: 'different-audit' }]
  ])('fails closed before editable finalisation when persisted audit %s is tampered', async (_field, mutation) => {
    const plan = createControlledAmendmentPlan(
      approved, systemAdmin, 'Correct the approved selection.', 'CONTROL-AWP-023', 'audit-bind-1', '2026-09-20T09:31:00Z'
    );
    const calls: string[] = [];
    await expect(executeControlledAmendment(() => plan, [], {
      stage: async value => { calls.push('stage'); return { ...value }; },
      appendAudit: async value => { calls.push('audit'); return { id: 2, ...value, ...mutation }; },
      finalise: async value => { calls.push('finalise'); return { ...value }; },
      markRecoveryHold: async () => { calls.push('hold'); }
    })).rejects.toThrow(/exact planned/);
    expect(calls).toEqual(['stage', 'audit', 'hold']);
  });

  it('compares the complete planned and persisted audit tuple exactly', () => {
    const plan = createControlledAmendmentPlan(
      approved, systemAdmin, 'Correct.', 'CONTROL-AWP-023', 'audit-bind-2', '2026-09-20T09:32:00Z'
    );
    expect(() => assertPersistedWorkplanAuditMatchesPlan(plan.audit, { id: 2, ...plan.audit })).not.toThrow();
    expect(() => assertPersistedWorkplanAuditMatchesPlan(plan.audit, {
      id: 2, ...plan.audit, success: false
    })).toThrow(/exact planned/);
  });
});
