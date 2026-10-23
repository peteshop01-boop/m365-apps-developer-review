import type {
  IAnnualWorkplan,
  IControlledSubmissionContext,
  IProductionPerson,
  IWorkplanAuditEvent,
  IWorkplanAuditWrite,
  WorkplanAuditEventType,
  WorkplanState
} from '../models/ProductionModels';
import { evaluateControlledSubmissionReadiness } from './AnnualWorkplanValidation';
import { canManagerDecideWorkplan, canManagerReadWorkplan } from './WorkplanAuthorisation';

export interface IRequestChangesPlan {
  correlationKey: string;
  changedAt: string;
  reason: string;
  nextRowVersionToken: number;
  audit: IWorkplanAuditWrite;
}

export interface IApprovalPlan {
  correlationKey: string;
  approvedAt: string;
  nextRowVersionToken: number;
  audit: IWorkplanAuditWrite;
}

export interface IAdminYearGate {
  performanceYear: number;
  controlReference: string;
}

export interface IAdminLockPlan {
  correlationKey: string;
  lockedAt: string;
  nextRowVersionToken: number;
  audit: IWorkplanAuditWrite;
}

export interface IDownstreamDependencyGuard {
  downstreamQuarterDependencyCount: number;
  supersessionControlReference?: string;
}

export interface IControlledReopenPlan {
  correlationKey: string;
  reason: string;
  controlReference: string;
  started: IAnnualWorkplan;
  completed: IAnnualWorkplan;
  audit: IWorkplanAuditWrite;
}

export type AnnualWorkplanLifecycleAction =
  | 'Submit'
  | 'Resubmit'
  | 'RequestChanges'
  | 'Approve'
  | 'Lock'
  | 'Reopen'
  | 'CreateAmendment';

export type AnnualWorkplanLifecycleActorRole = 'Employee' | 'Manager' | 'SystemAdmin';

export interface IAnnualWorkplanLifecycleRule {
  action: AnnualWorkplanLifecycleAction;
  from: readonly WorkplanState[];
  to: WorkplanState;
  actorRole: AnnualWorkplanLifecycleActorRole;
}

export interface IControlledAmendmentPlan {
  correlationKey: string;
  reason: string;
  controlReference: string;
  previousState: Extract<WorkplanState, 'Approved' | 'Locked'>;
  started: IAnnualWorkplan;
  completed: IAnnualWorkplan;
  audit: IWorkplanAuditWrite;
}

export interface IControlledAmendmentExecutionPort {
  stage(workplan: IAnnualWorkplan): Promise<IAnnualWorkplan>;
  appendAudit(audit: IWorkplanAuditWrite): Promise<IWorkplanAuditEvent>;
  finalise(workplan: IAnnualWorkplan): Promise<IAnnualWorkplan>;
  markRecoveryHold(workplan: IAnnualWorkplan): Promise<void>;
}

export interface IControlledAmendmentExecutionResult {
  workplan: IAnnualWorkplan;
  auditHistory: IWorkplanAuditEvent[];
}

export const ANNUAL_WORKPLAN_LIFECYCLE_RULES: readonly IAnnualWorkplanLifecycleRule[] = Object.freeze([
  { action: 'Submit', from: ['Draft'], to: 'Submitted', actorRole: 'Employee' },
  { action: 'Resubmit', from: ['ChangesRequested'], to: 'Submitted', actorRole: 'Employee' },
  { action: 'RequestChanges', from: ['Submitted'], to: 'ChangesRequested', actorRole: 'Manager' },
  { action: 'Approve', from: ['Submitted'], to: 'Approved', actorRole: 'Manager' },
  { action: 'Lock', from: ['Approved'], to: 'Locked', actorRole: 'SystemAdmin' },
  { action: 'Reopen', from: ['Locked'], to: 'Approved', actorRole: 'SystemAdmin' },
  { action: 'CreateAmendment', from: ['Approved'], to: 'ChangesRequested', actorRole: 'SystemAdmin' }
]);

const lifecycleRule = (action: AnnualWorkplanLifecycleAction): IAnnualWorkplanLifecycleRule => {
  const rule = ANNUAL_WORKPLAN_LIFECYCLE_RULES.find(candidate => candidate.action === action);
  if (!rule) throw new Error(`Unknown Annual Workplan lifecycle action ${action}.`);
  return rule;
};

const hasRole = (actor: IProductionPerson, role: AnnualWorkplanLifecycleActorRole): boolean =>
  actor.active && actor.appRoles.indexOf(role) >= 0;

export const assertAnnualWorkplanLifecycleAction = (
  workplan: IAnnualWorkplan,
  actor: IProductionPerson,
  action: AnnualWorkplanLifecycleAction
): IAnnualWorkplanLifecycleRule => {
  const rule = lifecycleRule(action);
  if (rule.from.indexOf(workplan.state) < 0
    || workplan.transitionStatus !== 'Ready'
    || (action === 'Lock' || action === 'Reopen' || action === 'CreateAmendment') && workplan.accessState !== 'ReadOnly'
    || (action === 'Submit' || action === 'Resubmit') && workplan.accessState !== 'EmployeeEdit'
    || (action === 'RequestChanges' || action === 'Approve') && workplan.accessState !== 'ManagerDecision') {
    throw new Error(`${action} is not allowed from ${workplan.state} or while the Workplan is not transition-ready.`);
  }
  if (!hasRole(actor, rule.actorRole)) throw new Error(`${action} requires the exact active ${rule.actorRole} role.`);
  if ((action === 'Submit' || action === 'Resubmit')
    && (actor.personKey !== workplan.personKey || actor.email.trim().toLowerCase() !== workplan.employeeEmail.trim().toLowerCase())) {
    throw new Error('Only the exact Workplan employee may submit or resubmit this Workplan.');
  }
  if ((action === 'RequestChanges' || action === 'Approve') && !canManagerDecideWorkplan(actor, workplan)) {
    throw new Error('Only the exact assigned manager may decide this Submitted Workplan.');
  }
  if ((action === 'Lock' || action === 'Reopen' || action === 'CreateAmendment') && actor.personKey === workplan.personKey) {
    throw new Error('The Workplan employee cannot authorise their own controlled lifecycle exception.');
  }
  return rule;
};

const actorSnapshot = (actor: IProductionPerson): object => ({
  actorPersonKey: actor.personKey,
  actorEmail: actor.email.trim().toLowerCase()
});

const managerSnapshot = (workplan: IAnnualWorkplan): object => ({
  managerPersonKey: workplan.managerPersonKey,
  managerDisplayName: workplan.managerDisplayName,
  managerEmail: workplan.managerEmail?.trim().toLowerCase()
});

const approvedDefinitionSnapshot = (context: IControlledSubmissionContext): object => {
  const activeCore = context.coreItems.filter(item => item.activeInWorkplan);
  const activePersonal = context.personalItems.filter(item => item.activeInWorkplan);
  const activeBehaviours = context.behaviourItems.filter(item => item.activeInWorkplan);
  return {
    categoryWeights: {
      core: context.workplan?.coreCategoryWeight,
      personal: context.workplan?.personalCategoryWeight,
      behaviours: context.workplan?.behaviourCategoryWeight
    },
    categoryWeightingReason: context.workplan?.categoryWeightReason,
    assignmentCounts: {
      core: activeCore.length,
      personal: activePersonal.length,
      behaviours: activeBehaviours.length
    },
    behaviourObjectiveCounts: {
      library: activeBehaviours.filter(item => item.objectiveSource === 'Library').length,
      custom: activeBehaviours.filter(item => item.objectiveSource === 'Custom').length
    }
  };
};

export const createRequestChangesPlan = (
  workplan: IAnnualWorkplan,
  actor: IProductionPerson,
  reason: string,
  correlationKey: string,
  changedAt: string
): IRequestChangesPlan => {
  const controlledReason = reason.trim();
  if (!controlledReason) throw new Error('A manager change-request comment is required.');
  assertAnnualWorkplanLifecycleAction(workplan, actor, 'RequestChanges');
  const before = {
    state: workplan.state,
    accessState: workplan.accessState,
    transitionStatus: workplan.transitionStatus,
    rowVersionToken: workplan.rowVersionToken
  };
  const after = {
    state: 'ChangesRequested',
    accessState: 'EmployeeEdit',
    transitionStatus: 'Ready',
    managerDecisionComment: controlledReason,
    changedAt,
    ...actorSnapshot(actor),
    ...managerSnapshot(workplan),
    rowVersionToken: workplan.rowVersionToken + 2,
    storageAcl: 'InheritedDependency'
  };
  return {
    correlationKey,
    changedAt,
    reason: controlledReason,
    nextRowVersionToken: workplan.rowVersionToken + 1,
    audit: {
      auditKey: correlationKey,
      eventType: 'WorkplanChangesRequested',
      subjectKey: workplan.workplanKey,
      performanceYear: workplan.performanceYear,
      actorEmail: actor.email.trim().toLowerCase(),
      actorRole: 'Manager',
      eventAt: changedAt,
      reason: controlledReason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      correlationKey,
      source: 'SPFx',
      sourceReference: 'KCF-KPI-014B',
      success: true
    }
  };
};

const CONTROL_REFERENCE = /^CONTROL-[A-Z0-9][A-Z0-9-]{4,}$/i;
const STRICT_UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|\+00:00)$/;

export const normaliseStrictUtcTimestamp = (value: string): string => {
  const match = STRICT_UTC_TIMESTAMP.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) {
    throw new Error('A strict UTC timestamp with Z or +00:00 is required.');
  }
  const parsed = new Date(value);
  if (parsed.getUTCFullYear() !== Number(match[1]) || parsed.getUTCMonth() + 1 !== Number(match[2])
    || parsed.getUTCDate() !== Number(match[3]) || parsed.getUTCHours() !== Number(match[4])
    || parsed.getUTCMinutes() !== Number(match[5]) || parsed.getUTCSeconds() !== Number(match[6])) {
    throw new Error('A strict UTC timestamp with a valid calendar date is required.');
  }
  return parsed.toISOString();
};

const assertControlReference = (value: string, label: string): string => {
  const controlled = value.trim();
  if (!CONTROL_REFERENCE.test(controlled)) throw new Error(`A valid CONTROL ${label} reference is required.`);
  return controlled;
};

export const createApprovalPlan = (
  context: IControlledSubmissionContext,
  actor: IProductionPerson,
  correlationKey: string,
  approvedAt: string
): IApprovalPlan => {
  const { workplan } = context;
  if (!workplan) {
    throw new Error('Only the assigned manager may approve a transition-ready Submitted Workplan.');
  }
  assertAnnualWorkplanLifecycleAction(workplan, actor, 'Approve');
  if (!correlationKey.trim()) throw new Error('A stable approval correlation key is required.');
  const controlledApprovedAt = normaliseStrictUtcTimestamp(approvedAt);
  const readiness = evaluateControlledSubmissionReadiness(context, false);
  if (!readiness.ready) throw new Error(readiness.blockers.join(' '));
  const identity = { ...actorSnapshot(actor), ...managerSnapshot(workplan) };
  const definition = approvedDefinitionSnapshot(context);
  const approvedBefore = {
    state: workplan.state,
    accessState: workplan.accessState,
    transitionStatus: workplan.transitionStatus,
    rowVersionToken: workplan.rowVersionToken
  };
  const approvedAfter = {
    state: 'Approved',
    accessState: 'ReadOnly',
    transitionStatus: 'Ready',
    approvedAt: controlledApprovedAt,
    approvedByPersonKey: actor.personKey,
    approvedByEmail: actor.email.trim().toLowerCase(),
    ...managerSnapshot(workplan),
    rowVersionToken: workplan.rowVersionToken + 2,
    storageAcl: 'InheritedDependency',
    ...definition
  };
  return {
    correlationKey,
    approvedAt: controlledApprovedAt,
    nextRowVersionToken: workplan.rowVersionToken + 1,
    audit: {
      auditKey: `${correlationKey}:approved`,
      eventType: 'WorkplanApproved',
      subjectKey: workplan.workplanKey,
      performanceYear: workplan.performanceYear,
      actorEmail: actor.email.trim().toLowerCase(),
      actorRole: 'Manager',
      eventAt: controlledApprovedAt,
      reason: 'Annual Workplan approved by assigned manager',
      beforeJson: JSON.stringify(approvedBefore),
      afterJson: JSON.stringify({ ...approvedAfter, ...identity }),
      correlationKey,
      source: 'SPFx',
      sourceReference: 'KCF-KPI-014B',
      success: true
    }
  };
};

export const createAdminLockPlan = (
  workplan: IAnnualWorkplan,
  actor: IProductionPerson,
  yearGate: IAdminYearGate,
  correlationKey: string,
  lockedAt: string
): IAdminLockPlan => {
  assertAnnualWorkplanLifecycleAction(workplan, actor, 'Lock');
  if (!workplan.approvedAt || !workplan.approvedByEmail) throw new Error('Manager approval provenance is required before locking.');
  if (yearGate.performanceYear !== workplan.performanceYear) throw new Error('The Admin year gate does not match the Workplan performance year.');
  const gateReference = assertControlReference(yearGate.controlReference, 'year-gate');
  if (!correlationKey.trim()) throw new Error('A stable lock correlation key is required.');
  const controlledLockedAt = normaliseStrictUtcTimestamp(lockedAt);
  const before = {
    state: workplan.state, accessState: workplan.accessState, transitionStatus: workplan.transitionStatus,
    approvedAt: workplan.approvedAt, approvedByEmail: workplan.approvedByEmail,
    rowVersionToken: workplan.rowVersionToken
  };
  const after = {
    state: 'Locked', accessState: 'ReadOnly', transitionStatus: 'Ready',
    approvedAt: workplan.approvedAt, approvedByEmail: workplan.approvedByEmail,
    lockedAt: controlledLockedAt, lockedByPersonKey: actor.personKey,
    lockedByEmail: actor.email.trim().toLowerCase(), yearGateReference: gateReference,
    rowVersionToken: workplan.rowVersionToken + 2, storageAcl: 'InheritedDependency'
  };
  return {
    correlationKey,
    lockedAt: controlledLockedAt,
    nextRowVersionToken: workplan.rowVersionToken + 1,
    audit: {
      auditKey: `${correlationKey}:locked`, eventType: 'WorkplanLocked', subjectKey: workplan.workplanKey,
      performanceYear: workplan.performanceYear, actorEmail: actor.email.trim().toLowerCase(), actorRole: 'SystemAdmin',
      eventAt: controlledLockedAt, reason: 'Manager-approved Annual Workplan locked at the authorised Admin year gate',
      beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after), correlationKey, source: 'SPFx',
      sourceReference: gateReference, success: true
    }
  };
};

export const createControlledReopenPlan = (
  workplan: IAnnualWorkplan,
  actor: IProductionPerson,
  reason: string,
  controlReference: string,
  correlationKey: string,
  changedAt: string,
  dependencyGuard: IDownstreamDependencyGuard
): IControlledReopenPlan => {
  assertAnnualWorkplanLifecycleAction(workplan, actor, 'Reopen');
  const controlledReason = reason.trim();
  if (!controlledReason) throw new Error('A controlled reopen reason is required.');
  const controlledReference = assertControlReference(controlReference, 'reopen');
  if (!correlationKey.trim()) throw new Error('A stable reopen correlation key is required.');
  const controlledChangedAt = normaliseStrictUtcTimestamp(changedAt);
  if (!Number.isSafeInteger(dependencyGuard.downstreamQuarterDependencyCount)
    || dependencyGuard.downstreamQuarterDependencyCount < 0) {
    throw new Error('The downstream dependency snapshot is invalid.');
  }
  const supersessionReference = dependencyGuard.downstreamQuarterDependencyCount > 0
    ? assertControlReference(dependencyGuard.supersessionControlReference || '', 'correction/publish supersession')
    : undefined;
  if (!workplan.approvedAt || !workplan.approvedByEmail || !workplan.lockedAt || !workplan.lockedByEmail) {
    throw new Error('Approved and Locked provenance must be complete before a controlled reopen.');
  }
  const before = {
    state: workplan.state, accessState: workplan.accessState, transitionStatus: workplan.transitionStatus,
    approvedAt: workplan.approvedAt, approvedByEmail: workplan.approvedByEmail,
    lockedAt: workplan.lockedAt, lockedByEmail: workplan.lockedByEmail,
    rowVersionToken: workplan.rowVersionToken,
    downstreamQuarterDependencyCount: dependencyGuard.downstreamQuarterDependencyCount
  };
  const started: IAnnualWorkplan = {
    ...workplan, accessState: 'ReadOnly', transitionStatus: 'InProgress',
    transitionCorrelationKey: correlationKey, rowVersionToken: workplan.rowVersionToken + 1
  };
  const completed: IAnnualWorkplan = {
    ...started, state: 'Approved', accessState: 'ReadOnly', transitionStatus: 'Ready',
    managerDecisionComment: controlledReason, rowVersionToken: workplan.rowVersionToken + 2
  };
  return {
    correlationKey, reason: controlledReason, controlReference: controlledReference, started, completed,
    audit: {
      auditKey: `${correlationKey}:reopen`, eventType: 'WorkplanChangesRequested', subjectKey: workplan.workplanKey,
      performanceYear: workplan.performanceYear, actorEmail: actor.email.trim().toLowerCase(), actorRole: 'SystemAdmin',
      eventAt: controlledChangedAt, reason: controlledReason, beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify({
        state: completed.state, accessState: completed.accessState, transitionStatus: completed.transitionStatus,
        approvedAt: completed.approvedAt, approvedByEmail: completed.approvedByEmail,
        lockedAt: completed.lockedAt, lockedByEmail: completed.lockedByEmail,
        rowVersionToken: completed.rowVersionToken, controlReference: controlledReference,
        downstreamQuarterDependencyCount: dependencyGuard.downstreamQuarterDependencyCount,
        supersessionControlReference: supersessionReference
      }),
      correlationKey, source: 'SPFx', sourceReference: controlledReference, success: true
    }
  };
};

export const verifyCompletedManagerTransition = (
  workplan: IAnnualWorkplan,
  actor: IProductionPerson,
  audits: IWorkplanAuditEvent[],
  expectedState: Extract<WorkplanState, 'ChangesRequested' | 'Approved'>,
  expectedEventTypes: WorkplanAuditEventType[]
): IWorkplanAuditEvent[] => {
  if (!hasRole(actor, 'Manager') || !canManagerReadWorkplan(actor, workplan)) throw new Error('This Workplan is not assigned to the signed-in active Manager.');
  const expectedAccessState = expectedState === 'ChangesRequested' ? 'EmployeeEdit' : 'ReadOnly';
  if (workplan.state !== expectedState
    || workplan.accessState !== expectedAccessState
    || workplan.transitionStatus !== 'Ready'
    || !workplan.transitionCorrelationKey) {
    throw new Error('The prior manager transition is incomplete and requires controlled recovery.');
  }
  const matching = expectedEventTypes.map(eventType => {
    const eventMatches = audits.filter(audit => audit.subjectKey === workplan.workplanKey
      && audit.correlationKey === workplan.transitionCorrelationKey
      && audit.eventType === eventType
      && audit.success);
    if (eventMatches.length !== 1) throw new Error(`The ${eventType} audit is missing or duplicated and requires controlled recovery.`);
    return eventMatches[0];
  });
  if (audits.some(audit => audit.correlationKey === workplan.transitionCorrelationKey && expectedEventTypes.indexOf(audit.eventType) < 0)) {
    throw new Error('The prior manager transition contains an unexpected correlated audit and requires controlled recovery.');
  }
  return matching;
};

export const createControlledAmendmentPlan = (
  workplan: IAnnualWorkplan,
  actor: IProductionPerson,
  reason: string,
  controlReference: string,
  correlationKey: string,
  changedAt: string
): IControlledAmendmentPlan => {
  assertAnnualWorkplanLifecycleAction(workplan, actor, 'CreateAmendment');
  const controlledReason = reason.trim();
  const controlledReference = controlReference.trim();
  if (!controlledReason) throw new Error('A controlled amendment reason is required.');
  assertControlReference(controlledReference, 'amendment');
  if (!workplan.approvedAt || !workplan.approvedByEmail) {
    throw new Error('Manager approval provenance must be complete before a controlled amendment.');
  }
  if (!correlationKey.trim()) throw new Error('A stable correlation key is required.');
  const controlledChangedAt = normaliseStrictUtcTimestamp(changedAt);
  const previousState = workplan.state as Extract<WorkplanState, 'Approved'>;
  const before = {
    state: workplan.state,
    accessState: workplan.accessState,
    transitionStatus: workplan.transitionStatus,
    approvedAt: workplan.approvedAt,
    approvedByEmail: workplan.approvedByEmail,
    lockedAt: workplan.lockedAt,
    lockedByEmail: workplan.lockedByEmail,
    rowVersionToken: workplan.rowVersionToken
  };
  const started: IAnnualWorkplan = {
    ...workplan,
    accessState: 'ReadOnly',
    transitionStatus: 'InProgress',
    transitionCorrelationKey: correlationKey,
    rowVersionToken: workplan.rowVersionToken + 1
  };
  const completed: IAnnualWorkplan = {
    ...started,
    state: 'ChangesRequested',
    accessState: 'EmployeeEdit',
    transitionStatus: 'Ready',
    managerDecisionComment: controlledReason,
    rowVersionToken: workplan.rowVersionToken + 2
  };
  return {
    correlationKey,
    reason: controlledReason,
    controlReference: controlledReference,
    previousState,
    started,
    completed,
    audit: {
      auditKey: `${correlationKey}:amendment`,
      eventType: 'WorkplanChangesRequested',
      subjectKey: workplan.workplanKey,
      performanceYear: workplan.performanceYear,
      actorEmail: actor.email.trim().toLowerCase(),
      actorRole: 'SystemAdmin',
      eventAt: controlledChangedAt,
      reason: controlledReason,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify({
        state: completed.state,
        accessState: completed.accessState,
        transitionStatus: completed.transitionStatus,
        approvedAt: completed.approvedAt,
        approvedByEmail: completed.approvedByEmail,
        lockedAt: completed.lockedAt,
        lockedByEmail: completed.lockedByEmail,
        rowVersionToken: completed.rowVersionToken,
        controlReference: controlledReference
      }),
      correlationKey,
      source: 'SPFx',
      sourceReference: controlledReference,
      success: true
    }
  };
};

export const assertAppendOnlyWorkplanAuditHistory = (
  prior: readonly IWorkplanAuditEvent[],
  current: readonly IWorkplanAuditEvent[]
): void => {
  if (current.length < prior.length) throw new Error('Workplan audit history cannot delete prior events.');
  prior.forEach((event, index) => {
    if (JSON.stringify(current[index]) !== JSON.stringify(event)) {
      throw new Error('Workplan audit history cannot edit or reorder prior events.');
    }
  });
  const auditKeys = current.map(event => event.auditKey);
  if (new Set(auditKeys).size !== auditKeys.length) throw new Error('Workplan audit history contains a duplicate immutable AuditKey.');
};

export const assertPersistedWorkplanAuditMatchesPlan = (
  planned: IWorkplanAuditWrite,
  persisted: IWorkplanAuditEvent
): void => {
  const plannedTuple = {
    auditKey: planned.auditKey, eventType: planned.eventType, subjectKey: planned.subjectKey,
    performanceYear: planned.performanceYear, actorEmail: planned.actorEmail, actorRole: planned.actorRole,
    eventAt: planned.eventAt, reason: planned.reason || '', beforeJson: planned.beforeJson || '',
    afterJson: planned.afterJson || '', correlationKey: planned.correlationKey, source: planned.source,
    sourceReference: planned.sourceReference || '', success: planned.success
  };
  const persistedTuple = {
    auditKey: persisted.auditKey, eventType: persisted.eventType, subjectKey: persisted.subjectKey,
    performanceYear: persisted.performanceYear, actorEmail: persisted.actorEmail, actorRole: persisted.actorRole,
    eventAt: persisted.eventAt, reason: persisted.reason || '', beforeJson: persisted.beforeJson || '',
    afterJson: persisted.afterJson || '', correlationKey: persisted.correlationKey, source: persisted.source,
    sourceReference: persisted.sourceReference || '', success: persisted.success
  };
  if (JSON.stringify(plannedTuple) !== JSON.stringify(persistedTuple)) {
    throw new Error('The persisted Workplan audit does not match the exact planned subject, year, actor, UTC time, reason, content, CONTROL reference and correlation tuple.');
  }
};

export const createWorkplanRecoveryHold = (workplan: IAnnualWorkplan): IAnnualWorkplan => ({
  ...workplan,
  accessState: 'RecoveryHold',
  transitionStatus: 'Failed',
  rowVersionToken: workplan.rowVersionToken + 1
});

export const executeControlledAmendment = async (
  createPlan: () => IControlledAmendmentPlan,
  priorAuditHistory: readonly IWorkplanAuditEvent[],
  port: IControlledAmendmentExecutionPort
): Promise<IControlledAmendmentExecutionResult> => {
  const plan = createPlan();
  if (priorAuditHistory.some(audit => audit.auditKey === plan.audit.auditKey
    || audit.correlationKey === plan.correlationKey)) {
    throw new Error('The controlled amendment correlation/idempotency key has already been used.');
  }
  let staged = plan.started;
  try {
    staged = await port.stage(plan.started);
    if (staged.id !== plan.started.id || staged.workplanKey !== plan.started.workplanKey
      || staged.personKey !== plan.started.personKey || staged.performanceYear !== plan.started.performanceYear
      || staged.state !== plan.started.state || staged.transitionCorrelationKey !== plan.correlationKey
      || staged.transitionStatus !== 'InProgress' || staged.accessState !== 'ReadOnly'
      || staged.rowVersionToken !== plan.started.rowVersionToken
      || staged.approvedAt !== plan.started.approvedAt || staged.approvedByEmail !== plan.started.approvedByEmail
      || staged.lockedAt !== plan.started.lockedAt || staged.lockedByEmail !== plan.started.lockedByEmail) {
      throw new Error('The controlled amendment staging state was not persisted exactly.');
    }
    const audit = await port.appendAudit(plan.audit);
    assertPersistedWorkplanAuditMatchesPlan(plan.audit, audit);
    const history = [...priorAuditHistory, audit];
    assertAppendOnlyWorkplanAuditHistory(priorAuditHistory, history);
    const completed = await port.finalise(plan.completed);
    if (completed.id !== plan.completed.id || completed.workplanKey !== plan.completed.workplanKey
      || completed.personKey !== plan.completed.personKey || completed.performanceYear !== plan.completed.performanceYear
      || completed.state !== 'ChangesRequested' || completed.accessState !== 'EmployeeEdit'
      || completed.transitionStatus !== 'Ready' || completed.transitionCorrelationKey !== plan.correlationKey
      || completed.rowVersionToken !== plan.completed.rowVersionToken
      || completed.approvedAt !== plan.completed.approvedAt || completed.approvedByEmail !== plan.completed.approvedByEmail
      || completed.lockedAt !== plan.completed.lockedAt || completed.lockedByEmail !== plan.completed.lockedByEmail) {
      throw new Error('The controlled amendment did not reach its exact editable completion state.');
    }
    const matching = history.filter(event => event.auditKey === plan.audit.auditKey
      && event.eventType === 'WorkplanChangesRequested' && event.actorRole === 'SystemAdmin'
      && event.sourceReference === plan.controlReference && event.success);
    if (matching.length !== 1) throw new Error('The controlled amendment audit is missing or duplicated.');
    return { workplan: completed, auditHistory: history };
  } catch (error) {
    const hold = createWorkplanRecoveryHold(staged);
    try {
      await port.markRecoveryHold(hold);
    } catch {
      throw new Error('The controlled amendment failed and its Recovery Hold could not be confirmed.');
    }
    throw error;
  }
};

export const annualWorkplanLifecycleNotice = (workplan: IAnnualWorkplan): string => {
  if (workplan.state === 'ChangesRequested') return 'Changes Requested · employee amendment is enabled; manager content editing remains unavailable.';
  if (workplan.state === 'Locked') return `Locked${workplan.lockedAt ? ` ${new Date(workplan.lockedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''} · original approval and lock history is retained; corrections require the controlled reasoned amendment route.`;
  if (workplan.state === 'Approved') return 'Approved · original approval history is retained; corrections require the controlled reasoned amendment route.';
  if (workplan.state === 'Archived') return 'Archived · approved and closed history is retained read-only.';
  return `${workplan.state} · manager review is read-only.`;
};
