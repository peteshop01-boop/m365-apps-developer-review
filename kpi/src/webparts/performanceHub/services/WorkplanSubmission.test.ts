import type {
  IAnnualWorkplan,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  IControlledSubmissionContext,
  ICoreKpiCatalogueItem,
  ICoreWorkplanItem,
  IProductionPerson,
  IWorkplanAuditEvent
} from '../models/ProductionModels';
import { canEmployeeEditWorkplan, canEmployeeReadWorkplan, canManagerReadWorkplan } from './WorkplanAuthorisation';
import { createSubmissionPlan, verifyCompletedSubmission } from './WorkplanSubmission';

const employee: IProductionPerson = {
  id: 1, personKey: 'person', displayName: 'Synthetic Person 02', email: 'person003@example.invalid',
  managerPersonKey: 'manager', managerEmail: 'person002@example.invalid', appRoles: ['Employee'], active: true
};
const manager: IProductionPerson = {
  id: 2, personKey: 'manager', displayName: 'Synthetic Person 01', email: 'person002@example.invalid', appRoles: ['Manager'], active: true
};
const other: IProductionPerson = {
  id: 3, personKey: 'other', displayName: 'Other Employee', email: 'person017@example.invalid', appRoles: ['Employee'], active: true
};
const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'person|2026', personKey: 'person', employeeDisplayName: employee.displayName,
  employeeEmail: employee.email, performanceYear: 2026, managerPersonKey: manager.personKey, managerDisplayName: manager.displayName,
  managerEmail: manager.email, state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', coreCategoryWeight: 80,
  personalCategoryWeight: 0, behaviourCategoryWeight: 20, categoryWeightReason: 'No Personal KPIs in this Workplan.', rowVersionToken: 1
};
const coreCatalogue: ICoreKpiCatalogueItem[] = [{
  kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01', wording: 'Approved KPI',
  pillar: 'Pillar', workstream: 'Workstream', scoringDirection: 'TBC', unitLabel: 'TBC'
}];
const coreItems: ICoreWorkplanItem[] = [{
  id: 1, etag: '"1"', workplanItemKey: 'core', naturalKey: 'person|2026|CoreGold|SO1-001', workplanKey: workplan.workplanKey,
  personKey: employee.personKey, performanceYear: 2026, kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01',
  targetVersionKey: 'SO1-001|2026|v01', coreWorkplanWeight: 100, employeeKpiRole: 'Contributor', displayOrder: 1, activeInWorkplan: true
}];
const behaviours: IBehaviourSummary[] = Array.from({ length: 5 }, (_, index) => ({
  behaviourId: `BHV-0${index + 1}`, behaviourVersionKey: `BHV-0${index + 1}|v01`, title: `Behaviour ${index + 1}`,
  description: 'Approved', defaultWorkplanWeight: 20, displayOrder: index + 1
}));
const behaviourItems: IBehaviourWorkplanItem[] = behaviours.map((behaviour, index) => ({
  id: index + 2, etag: '"1"', workplanItemKey: `behaviour-${index}`, naturalKey: `${workplan.workplanKey}|Behaviour|${behaviour.behaviourId}`,
  workplanKey: workplan.workplanKey, personKey: employee.personKey, performanceYear: 2026, behaviourId: behaviour.behaviourId,
  behaviourVersionKey: behaviour.behaviourVersionKey, objectiveSource: 'Library', sourceObjectiveKey: `${behaviour.behaviourId}-OBJ-01`,
  objectiveTitle: `${behaviour.title} objective`, objectiveDescription: 'Controlled objective', measure: 'Delivery evidence', unit: 'rating',
  evidenceDefinition: 'Quarterly evidence', q1TargetText: 'Q1 commitment', q2TargetText: 'Q2 commitment', q3TargetText: 'Q3 commitment',
  q4TargetText: 'Q4 commitment', q1TargetRating: 3, q2TargetRating: 3, q3TargetRating: 3, q4TargetRating: 3,
  behaviourItemWeight: 20, displayOrder: index + 1, activeInWorkplan: true
}));
const context: IControlledSubmissionContext = {
  workplan, employee, manager,
  config: {
    performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31', performanceYearNumber: 2026,
    quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' }, weights: { core: 70, personal: 20, behaviours: 10 },
    rag: { greenThreshold: 90, amberThreshold: 50 }, aggregationMethods: ['DirectMetric'], retentionStatus: 'TBC'
  },
  coreCatalogue, coreItems, personalItems: [], behaviours, behaviourItems
};

describe('Workplan submission and authorisation', () => {
  it('enforces employee ownership and direct-report manager reads', () => {
    expect(canEmployeeReadWorkplan(employee, workplan)).toBe(true);
    expect(canEmployeeEditWorkplan(employee, workplan)).toBe(true);
    expect(canEmployeeReadWorkplan(other, workplan)).toBe(false);
    expect(canManagerReadWorkplan(manager, workplan)).toBe(true);
    expect(canManagerReadWorkplan(employee, workplan)).toBe(false);
  });

  it('builds one correlated append-only submission audit and manager snapshot', () => {
    const plan = createSubmissionPlan(context, employee, 'correlation-1', '2026-08-19T22:00:00Z');
    expect(plan.audit).toEqual(expect.objectContaining({ auditKey: 'correlation-1', eventType: 'WorkplanSubmitted', subjectKey: workplan.workplanKey, actorEmail: employee.email, success: true }));
    expect(JSON.parse(plan.audit.afterJson || '{}')).toEqual(expect.objectContaining({
      submittedByPersonKey: employee.personKey,
      managerPersonKey: manager.personKey,
      storageAcl: 'InheritedDependency',
      categoryWeights: { core: 80, personal: 0, behaviours: 20 },
      assignmentCounts: { core: 1, personal: 0, behaviours: 5 },
      behaviourObjectiveCounts: { library: 5, custom: 0 }
    }));
  });

  it('treats a complete Submitted state plus one matching audit as idempotent', () => {
    const submitted: IAnnualWorkplan = {
      ...workplan, state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready', transitionCorrelationKey: 'correlation-1',
      submittedAt: '2026-08-19T22:00:00Z', submittedByEmail: employee.email, rowVersionToken: 3
    };
    const audit: IWorkplanAuditEvent = {
      id: 1, auditKey: 'correlation-1', eventType: 'WorkplanSubmitted', subjectKey: workplan.workplanKey, performanceYear: 2026,
      actorEmail: employee.email, actorRole: 'Employee', eventAt: submitted.submittedAt as string, correlationKey: 'correlation-1', source: 'SPFx', success: true
    };
    expect(verifyCompletedSubmission(submitted, employee, [audit])).toBe(audit);
    expect(() => verifyCompletedSubmission(submitted, employee, [audit, { ...audit, id: 2 }])).toThrow(/missing or duplicated/);
    expect(canEmployeeEditWorkplan(employee, submitted)).toBe(false);
  });

  it('allows only the employee to amend Changes Requested and creates a distinct resubmission audit', () => {
    const changesRequested: IAnnualWorkplan = {
      ...workplan,
      state: 'ChangesRequested',
      accessState: 'EmployeeEdit',
      managerDecisionComment: 'Clarify the delivery role.',
      rowVersionToken: 5
    };
    const amendedContext: IControlledSubmissionContext = { ...context, workplan: changesRequested };
    expect(canEmployeeEditWorkplan(employee, changesRequested)).toBe(true);
    expect(canEmployeeEditWorkplan(other, changesRequested)).toBe(false);
    const plan = createSubmissionPlan(amendedContext, employee, 'correlation-2', '2026-08-20T09:00:00Z');
    expect(plan.audit).toEqual(expect.objectContaining({
      auditKey: 'correlation-2',
      eventType: 'WorkplanResubmitted',
      subjectKey: changesRequested.workplanKey,
      actorEmail: employee.email
    }));
    expect(changesRequested.state).toBe('ChangesRequested');
    expect(changesRequested.managerDecisionComment).toBe('Clarify the delivery role.');
  });

  it('rejects actor-role substitution before creating a submission audit', () => {
    expect(() => createSubmissionPlan(context, { ...employee, appRoles: ['Manager'] }, 'role-1', '2026-08-20T09:00:00Z')).toThrow(/Employee role/);
    expect(() => createSubmissionPlan({ ...context, manager: { ...manager, appRoles: ['Employee'] } }, employee, 'role-2', '2026-08-20T09:00:00Z')).toThrow(/Manager relationship/);
  });
});
