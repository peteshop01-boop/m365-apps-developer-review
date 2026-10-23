import type {
  IAnnualWorkplan,
  IControlledSubmissionContext,
  IProductionPerson,
  IWorkplanAuditEvent,
  IWorkplanAuditWrite
} from '../models/ProductionModels';
import { evaluateControlledSubmissionReadiness } from './AnnualWorkplanValidation';
import { canEmployeeEditWorkplan, canEmployeeReadWorkplan, canManagerReadWorkplan } from './WorkplanAuthorisation';
import { assertAnnualWorkplanLifecycleAction } from './WorkplanLifecycle';

export interface ISubmissionPlan {
  correlationKey: string;
  submittedAt: string;
  submittedByEmail: string;
  managerPersonKey: string;
  managerDisplayName: string;
  managerEmail: string;
  nextRowVersionToken: number;
  audit: IWorkplanAuditWrite;
}

const definitionSnapshot = (context: IControlledSubmissionContext): object => {
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

export const createSubmissionPlan = (
  context: IControlledSubmissionContext,
  actor: IProductionPerson,
  correlationKey: string,
  submittedAt: string
): ISubmissionPlan => {
  const { workplan, manager } = context;
  const readiness = evaluateControlledSubmissionReadiness(context);
  if (!workplan || !canEmployeeEditWorkplan(actor, workplan)) throw new Error('Only the Workplan employee may submit an editable Draft or resubmit after Changes Requested.');
  assertAnnualWorkplanLifecycleAction(workplan, actor, workplan.state === 'ChangesRequested' ? 'Resubmit' : 'Submit');
  if (!manager || manager.appRoles.indexOf('Manager') < 0 || !canManagerReadWorkplan(manager, workplan)) throw new Error('The assigned active Manager relationship is invalid.');
  if (!readiness.ready) throw new Error(readiness.blockers.join(' '));
  const isResubmission = workplan.state === 'ChangesRequested';
  const definition = definitionSnapshot(context);
  const before = {
    state: workplan.state,
    accessState: workplan.accessState,
    transitionStatus: workplan.transitionStatus,
    rowVersionToken: workplan.rowVersionToken,
    ...definition
  };
  const after = {
    state: 'Submitted',
    accessState: 'ManagerDecision',
    transitionStatus: 'Ready',
    submittedByPersonKey: actor.personKey,
    submittedByEmail: actor.email.trim().toLowerCase(),
    submittedAt,
    managerPersonKey: manager.personKey,
    managerDisplayName: manager.displayName,
    managerEmail: manager.email.trim().toLowerCase(),
    rowVersionToken: workplan.rowVersionToken + 2,
    storageAcl: 'InheritedDependency',
    ...definition
  };
  return {
    correlationKey,
    submittedAt,
    submittedByEmail: after.submittedByEmail,
    managerPersonKey: manager.personKey,
    managerDisplayName: manager.displayName,
    managerEmail: after.managerEmail,
    nextRowVersionToken: workplan.rowVersionToken + 1,
    audit: {
      auditKey: correlationKey,
      eventType: isResubmission ? 'WorkplanResubmitted' : 'WorkplanSubmitted',
      subjectKey: workplan.workplanKey,
      performanceYear: workplan.performanceYear,
      actorEmail: after.submittedByEmail,
      actorRole: 'Employee',
      eventAt: submittedAt,
      reason: isResubmission ? 'Annual Workplan amended and resubmitted by employee' : 'Annual Workplan submitted by employee',
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(after),
      correlationKey,
      source: 'SPFx',
      sourceReference: isResubmission ? 'DEMO-APP-014B' : 'DEMO-APP-014A',
      success: true
    }
  };
};

export const verifyCompletedSubmission = (
  workplan: IAnnualWorkplan,
  actor: IProductionPerson,
  audits: IWorkplanAuditEvent[]
): IWorkplanAuditEvent => {
  if (!canEmployeeReadWorkplan(actor, workplan)) throw new Error('This submitted Workplan does not belong to the signed-in employee.');
  if (workplan.state !== 'Submitted' || workplan.accessState !== 'ManagerDecision' || workplan.transitionStatus !== 'Ready'
    || !workplan.transitionCorrelationKey || !workplan.submittedAt || !workplan.submittedByEmail) {
    throw new Error('The prior submission is incomplete and requires controlled recovery.');
  }
  const matching = audits.filter(audit => (audit.eventType === 'WorkplanSubmitted' || audit.eventType === 'WorkplanResubmitted')
    && audit.subjectKey === workplan.workplanKey
    && audit.correlationKey === workplan.transitionCorrelationKey
    && audit.success);
  if (matching.length !== 1) throw new Error('The prior submission audit is missing or duplicated and requires controlled recovery.');
  return matching[0];
};
