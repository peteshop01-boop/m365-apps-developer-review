jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import type { IAnnualWorkplan, IProductionPerson } from '../models/ProductionModels';
import type { IEmployeeV2QuarterCommandContext, IEmployeeQuarterUpdateInputV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { materialiseQuarterBehaviourTarget, QUARTER_BEHAVIOUR_TARGET_FIELDS } from './QuarterBehaviourTargetSnapshot';
import EmployeeWorkplanV2CommandTransport, {
  type IEmployeeV2AnnualCommandRequest,
  type IEmployeeV2CommandRequest
} from './EmployeeWorkplanV2CommandTransport';
import type { IEmployeeWorkplanV2C2bCommandGateway } from './EmployeeWorkplanV2C2bCommandGateway';
import { EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS, KCF_KPI_036_TEST_LIST_BINDINGS } from './EmployeeWorkplanV2ListBindings';
import SharePointEmployeeWorkplanV2PersistenceService, {
  EMPLOYEE_V2_WORKPLAN_ITEM_SELECT,
  projectEmployeeCoreContributionV2
} from './SharePointEmployeeWorkplanV2PersistenceService';

const site = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const employee: IProductionPerson = {
  id: 1, personKey: 'PERSON-001', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
  managerPersonKey: 'MANAGER-001', managerEmail: 'manager@example.invalid', appRoles: ['Employee'], active: true
};
const manager: IProductionPerson = {
  id: 2, personKey: 'MANAGER-001', displayName: 'Synthetic Manager', email: 'manager@example.invalid',
  appRoles: ['Manager'], active: true
};
const system: IProductionPerson = {
  id: 3, personKey: 'SYSTEM-001', displayName: 'Synthetic System Admin', email: 'system@example.invalid',
  appRoles: ['SystemAdmin'], active: true
};

const response = (data: unknown): SPHttpClientResponse => ({
  ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data)
} as unknown as SPHttpClientResponse);

const workplanRow: Record<string, unknown> = {
  '@odata.etag': '"1"', Id: 10, WorkplanKey: 'PERSON-001|2027', PersonKey: employee.personKey,
  EmployeeDisplayName: employee.displayName, EmployeeEmail: employee.email, PerformanceYear: 2027,
  ManagerPersonKey: manager.personKey, ManagerDisplayName: manager.displayName, ManagerEmail: manager.email,
  State: 'Draft', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', CoreCategoryWeight: 70,
  PersonalCategoryWeight: 20, BehaviourCategoryWeight: 10, CoreWeightingMode: undefined,
  WorkplanVersion: 1, RowVersionToken: 1
};

const coreRow: Record<string, unknown> = {
  '@odata.etag': '"1"', Id: 20, WorkplanItemKey: 'CORE-ITEM-001',
  WorkplanItemNaturalKey: 'PERSON-001|2027|CoreGold|SO1-001', WorkplanKey: 'PERSON-001|2027',
  PersonKey: employee.personKey, PerformanceYear: 2027, ItemType: 'CoreGold', DisplayOrder: 0,
  KPIID: 'SO1-001', KPIVersionKey: 'SO1-001|V1', TargetVersionKey: 'SO1-001|2027|V1',
  EmployeeKpiRole: 'DeliveryLead', ContributionMethod: 'AdditiveDirect', UnitLabel: 'schools',
  WorkplanVersion: 1, YearEndTargetValue: 100, Q1TargetValue: 25, Q2TargetValue: 25,
  Q3TargetValue: 25, Q4TargetValue: 25, CoreWorkplanWeight: 100,
  DirectContributionEligible: true, ContributionApprovalState: 'Draft', AdditiveApproved: false,
  NonOverlapRequired: true, NonOverlapApproved: false, ActiveInWorkplan: true
};

const personalRow: Record<string, unknown> = {
  '@odata.etag': '"1"', Id: 21, WorkplanItemKey: 'PERSONAL-ITEM-001',
  WorkplanItemNaturalKey: 'PERSON-001|2027|LocalPersonal|PERSONAL-001', WorkplanKey: 'PERSON-001|2027',
  PersonKey: employee.personKey, PerformanceYear: 2027, ItemType: 'LocalPersonal', DisplayOrder: 0,
  LocalKPIWording: 'Deliver staff learning', LocalMeasure: 'Sessions', LocalMetricType: 'Count',
  LocalScoringDirection: 'HigherIsBetter', YearEndTargetValue: 4, Q1TargetValue: 1, Q2TargetValue: 1,
  Q3TargetValue: 1, Q4TargetValue: 1, UnitLabel: 'sessions', PersonalItemWeight: 100, ActiveInWorkplan: true
};

const behaviourRow: Record<string, unknown> = {
  '@odata.etag': '"1"', Id: 22, WorkplanItemKey: 'BEHAVIOUR-ITEM-001',
  WorkplanItemNaturalKey: 'PERSON-001|2027|Behaviour|BEH-01', WorkplanKey: 'PERSON-001|2027',
  PersonKey: employee.personKey, PerformanceYear: 2027, ItemType: 'Behaviour', DisplayOrder: 0,
  BehaviourID: 'BEH-01', BehaviourVersionKey: 'BEH-01|V1', BehaviourObjectiveSource: 'Custom',
  BehaviourObjectiveTitle: 'Work as one team', BehaviourObjectiveDescription: 'Share learning.',
  BehaviourMeasure: 'Quarterly examples', BehaviourEvidenceDefinition: 'Examples and feedback',
  Q1TargetText: 'Q1 commitment', Q2TargetText: 'Q2 commitment', Q3TargetText: 'Q3 commitment',
  Q4TargetText: 'Q4 commitment', BehaviourItemWeight: 20, ActiveInWorkplan: true
};

const quarterReviewRow: Record<string, unknown> = {
  '@odata.etag': '"1"', Id: 30, QuarterReviewKey: 'PERSON-001|2027|Q1', WorkplanKey: 'PERSON-001|2027',
  PersonKey: employee.personKey, EmployeeDisplayName: employee.displayName, EmployeeEmail: employee.email,
  PerformanceYear: 2027, Quarter: 'Q1', ManagerPersonKey: manager.personKey,
  ManagerDisplayName: manager.displayName, ManagerEmail: manager.email, State: 'Draft', AccessState: 'EmployeeEdit',
  TransitionStatus: 'Ready', WorkplanApprovalCorrelationKey: 'APPROVAL-V2', RowVersionToken: 1
};

const quarterItemRow: Record<string, unknown> = {
  '@odata.etag': '"1"', Id: 31, QuarterReviewItemKey: 'PERSON-001|2027|Q1|CORE-ITEM-001',
  QuarterReviewKey: 'PERSON-001|2027|Q1', WorkplanItemKey: 'CORE-ITEM-001', WorkplanKey: 'PERSON-001|2027',
  PersonKey: employee.personKey, PerformanceYear: 2027, Quarter: 'Q1', ItemType: 'CoreGold', KPIID: 'SO1-001',
  KPIVersionKey: 'SO1-001|V1', TargetVersionKey: 'SO1-001|2027|V1', ItemWordingSnapshot: 'Schools delivering activity',
  UnitLabelSnapshot: 'schools', QuarterTargetValue: 25, CalculatedRAG: 'NotRated', EvidenceCount: 0,
  ManagerApproved: false, Locked: false
};

const workplanAudits: Record<string, unknown>[] = [];
const quarterAudits: Record<string, unknown>[] = [];
const evidenceRows: Record<string, unknown>[] = [];
const itemRows: Record<string, unknown>[] = [coreRow, personalRow, behaviourRow];
let lastRequest: IEmployeeV2CommandRequest | undefined;

const appendAudit = (request: IEmployeeV2CommandRequest, eventType: string, after: object): void => {
  const target = request.quarter ? quarterAudits : workplanAudits;
  target.push({
    Id: target.length + 1, AuditKey: `AUDIT-${request.commandKey}`, EventType: eventType,
    SubjectKey: request.quarter ? quarterReviewRow.QuarterReviewKey : workplanRow.WorkplanKey,
    PerformanceYear: 2027, Quarter: request.quarter, ActorEmail: request.route === 'Employee' ? employee.email : manager.email,
    ActorRole: request.route === 'Employee' ? 'Employee' : 'Manager', EventAt: '2026-08-24T10:00:00Z',
    Reason: (request.payload as { reason?: string }).reason, BeforeJSON: '{}', AfterJSON: JSON.stringify(after),
    CorrelationKey: request.commandKey, Source: 'PowerAutomate', SourceReference: 'FLOW-027A', Success: true
  });
};

const advanceWorkplan = (request: IEmployeeV2CommandRequest): void => {
  workplanRow.RowVersionToken = Number(workplanRow.RowVersionToken) + 2;
  workplanRow['@odata.etag'] = `"${workplanRow.RowVersionToken}"`;
  if (request.commandType === 'UpdateWorkplanDraftV2') {
    Object.assign(workplanRow, {
      CoreCategoryWeight: 90, PersonalCategoryWeight: 0, BehaviourCategoryWeight: 10,
      CategoryWeightingReason: 'No Personal KPI is agreed.'
    });
    appendAudit(request, 'WorkplanDraftUpdated', { version: workplanRow.WorkplanVersion });
  } else if (request.commandType === 'SetCoreWeightingV2') {
    workplanRow.CoreWeightingMode = (request.payload as { mode: string }).mode;
    appendAudit(request, 'WorkplanDraftUpdated', { mode: workplanRow.CoreWeightingMode });
  } else if (request.commandType === 'UpsertCoreContributionV2') {
    const input = request.payload as { annualTargetValue?: number; quarterTargets: Array<{ targetValue?: number }> };
    coreRow.YearEndTargetValue = input.annualTargetValue;
    coreRow.Q1TargetValue = input.quarterTargets[0].targetValue;
    coreRow.WorkplanVersion = workplanRow.WorkplanVersion;
    appendAudit(request, 'WorkplanDraftUpdated', { annualTargetValue: input.annualTargetValue });
  } else if (request.commandType === 'SubmitWorkplan') {
    workplanRow.State = 'Submitted'; workplanRow.AccessState = 'ManagerDecision';
    appendAudit(request, workplanAudits.some(row => row.EventType === 'WorkplanSubmitted') ? 'WorkplanResubmitted' : 'WorkplanSubmitted', { version: workplanRow.WorkplanVersion });
  } else if (request.commandType === 'RequestWorkplanChanges') {
    workplanRow.State = 'ChangesRequested'; workplanRow.AccessState = 'EmployeeEdit';
    workplanRow.ManagerDecisionComment = (request.payload as { reason: string }).reason;
    appendAudit(request, 'WorkplanChangesRequested', { reason: workplanRow.ManagerDecisionComment });
  } else if (request.commandType === 'ApproveAndLockWorkplan') {
    workplanRow.State = 'Locked'; workplanRow.AccessState = 'ReadOnly';
    workplanRow.ApprovedAt = '2026-08-24T10:00:00Z'; workplanRow.ApprovedByEmail = manager.email;
    workplanRow.LockedAt = '2026-08-24T10:00:01Z'; workplanRow.LockedByEmail = manager.email;
    coreRow.ContributionApprovalState = 'Approved'; coreRow.AdditiveApproved = true; coreRow.NonOverlapApproved = true;
    appendAudit(request, 'WorkplanApproved', { version: workplanRow.WorkplanVersion, immutableCoreTarget: coreRow.YearEndTargetValue });
    appendAudit(request, 'WorkplanLocked', { version: workplanRow.WorkplanVersion });
  } else if (request.commandType === 'CreateWorkplanAmendmentV2') {
    workplanRow.WorkplanVersion = Number(workplanRow.WorkplanVersion) + 1;
    workplanRow.State = 'ChangesRequested'; workplanRow.AccessState = 'EmployeeEdit';
    workplanRow.ApprovedAt = undefined; workplanRow.ApprovedByEmail = undefined;
    workplanRow.LockedAt = undefined; workplanRow.LockedByEmail = undefined;
    appendAudit(request, 'WorkplanAmendmentCreated', { version: workplanRow.WorkplanVersion, retainedVersion: Number(workplanRow.WorkplanVersion) - 1 });
  } else {
    appendAudit(request, 'WorkplanDraftUpdated', { commandType: request.commandType });
  }
};

const advanceQuarter = (request: IEmployeeV2CommandRequest): void => {
  quarterReviewRow.RowVersionToken = Number(quarterReviewRow.RowVersionToken) + 1;
  quarterReviewRow['@odata.etag'] = `"${quarterReviewRow.RowVersionToken}"`;
  if (request.commandType === 'UpdateQuarterItemV2') {
    const input = request.payload as { employeeActualValue?: number; employeeUpdate: string; contextMitigation?: string; recovery?: Record<string, unknown> };
    quarterItemRow.EmployeeActualValue = input.employeeActualValue; quarterItemRow.StatusUpdate = input.employeeUpdate;
    quarterItemRow.ContextMitigation = input.contextMitigation; quarterItemRow.ProgressPct = 72;
    quarterItemRow.CalculatedRAG = 'Amber';
    const recovery = input.recovery || {};
    quarterItemRow.BTGRoute = recovery.route; quarterItemRow.BTGAction = recovery.action;
    quarterItemRow.BTGOwnerPersonKey = recovery.ownerPersonKey; quarterItemRow.BTGDueDate = recovery.dueDate;
    quarterItemRow.NextReviewDate = recovery.nextReviewDate; quarterItemRow.BTGExpectedReducedOutcome = recovery.expectedReducedOutcome;
    appendAudit(request, 'QuarterReviewDraftUpdated', { actual: input.employeeActualValue, calculatedRag: 'Amber' });
  } else if (request.commandType === 'RegisterEvidence') {
    evidenceRows.push({
      EvidenceKey: 'EVIDENCE-001', PersonKey: employee.personKey, WorkplanKey: workplanRow.WorkplanKey,
      WorkplanItemKey: quarterItemRow.WorkplanItemKey, QuarterReviewKey: quarterReviewRow.QuarterReviewKey,
      QuarterReviewItemKey: quarterItemRow.QuarterReviewItemKey, PerformanceYear: 2027, Quarter: 'Q1',
      KPIID: 'SO1-001', EvidenceStatus: 'Draft', EvidenceDescription: (request.payload as { description: string }).description,
      FileRef: '/sites/REVIEW-TEST-SITE/KCFKPI_Evidence/2027/PERSON-001/Q1/evidence.pdf'
    });
    quarterItemRow.EvidenceCount = 1;
    appendAudit(request, 'EvidenceRegistered', { evidenceKey: 'EVIDENCE-001' });
  } else if (request.commandType === 'SubmitQuarterReview') {
    quarterReviewRow.State = 'Submitted'; quarterReviewRow.AccessState = 'ManagerDecision';
    appendAudit(request, 'QuarterReviewSubmitted', { state: 'Submitted' });
  }
};

const executeMock = jest.fn(async (request: IEmployeeV2CommandRequest) => {
    lastRequest = request;
    if (request.quarter) advanceQuarter(request); else advanceWorkplan(request);
    return {
      receipt: {
        receiptKey: `7cd2b366-aa4d-4d2c-a046-a5ca92624918|71`,
        sourceListId: '7cd2b366-aa4d-4d2c-a046-a5ca92624918', sourceItemId: 71,
        sourceItemVersion: '1.0', commandKey: request.commandKey, commandType: request.commandType,
        subjectType: request.subjectType, subjectKey: request.subjectKey, personKey: request.personKey,
        performanceYear: request.performanceYear, quarter: request.quarter,
        authenticatedActorEmail: request.route === 'Employee' ? employee.email : manager.email,
        authenticatedActorPersonKey: request.route === 'Employee' ? employee.personKey : manager.personKey,
        effectiveRole: request.route === 'Employee' ? 'Employee' as const : 'Manager' as const,
        processedByEmail: 'kcf-kpi-automation@example.invalid', processedAt: '2026-08-24T10:00:00Z',
        outcome: 'Accepted' as const, validationCode: 'ACCEPTED', message: 'Persisted and read back.',
        processedPayloadSha256: 'A'.repeat(64), resultKeysJson: JSON.stringify([{ subjectKey: request.subjectKey, rowVersionToken: request.expectedRowVersionToken ? request.expectedRowVersionToken + 1 : 1 }]),
        auditKeysJson: '["AUDIT"]', correlationKey: request.commandKey, flowRunReference: 'FLOW-027A'
      },
      replayed: false
    };
  });
const transport = { execute: executeMock } as unknown as EmployeeWorkplanV2CommandTransport;
const executeAnnualMock = jest.fn(async (request: IEmployeeV2AnnualCommandRequest) => {
  lastRequest = request;
  advanceWorkplan(request);
  const actor = request.commandType === 'CreateWorkplanAmendmentV2' ? system
    : request.route === 'Manager' ? manager : employee;
  const auditKey = `AUDIT-${request.commandKey}`;
  const receipt = {
    receiptKey: `7cd2b366-aa4d-4d2c-a046-a5ca92624918|71|1.0`,
    sourceListId: '7cd2b366-aa4d-4d2c-a046-a5ca92624918', sourceItemId: 71, sourceItemVersion: '1.0',
    commandKey: request.commandKey, commandType: request.commandType, subjectType: request.subjectType,
    subjectKey: request.subjectKey, personKey: request.personKey, performanceYear: request.performanceYear,
    authenticatedActorEmail: actor.email, authenticatedActorPersonKey: actor.personKey,
    effectiveRole: request.commandType === 'CreateWorkplanAmendmentV2' ? 'SystemAdmin' as const
      : request.route === 'Manager' ? 'Manager' as const : 'Employee' as const,
    processedByEmail: 'kcf-kpi-automation@example.invalid', processedAt: '2026-08-24T10:00:00Z',
    outcome: 'Accepted' as const, validationCode: 'ACCEPTED', message: 'Persisted and read back.',
    processedPayloadSha256: 'A'.repeat(64), resultKeysJson: JSON.stringify([{
      workplanKey: workplanRow.WorkplanKey, rowVersionToken: workplanRow.RowVersionToken,
      etag: workplanRow['@odata.etag'], itemKeys: request.subjectType === 'WorkplanItem' ? [request.subjectKey] : []
    }]), auditKeysJson: JSON.stringify([auditKey]), correlationKey: `PROCESSOR-${request.commandKey}`,
    flowRunReference: 'FLOW-C2B'
  };
  return { receipt, replayed: false, canonicalProof: {
    workplanKey: String(workplanRow.WorkplanKey), rowVersionToken: Number(workplanRow.RowVersionToken),
    etag: String(workplanRow['@odata.etag']), itemKeys: request.subjectType === 'WorkplanItem' ? [request.subjectKey] : [],
    auditKeys: [auditKey]
  } };
});
const annualGateway: IEmployeeWorkplanV2C2bCommandGateway = {
  executeAnnualCommand: executeAnnualMock,
  executeCreateWorkplanDraft: executeAnnualMock
};

const get = jest.fn(async (url: string) => {
  const decoded = decodeURIComponent(url);
  if (decoded.indexOf("getbytitle('KCFKPI_Workplans')") >= 0) return response({ value: [workplanRow] });
  if (decoded.indexOf("getbytitle('KCFKPI_WorkplanItems')") >= 0) {
    if (new URL(url).searchParams.get('$select') === 'Id,WorkplanKey') {
      return response({ value: itemRows.slice(0, 1).map(row => ({ Id: row.Id, WorkplanKey: row.WorkplanKey })) });
    }
    return response({ value: itemRows });
  }
  if (decoded.indexOf("getbytitle('KCFKPI_QuarterReviews')") >= 0) return response({ value: [quarterReviewRow] });
  if (decoded.indexOf("getbytitle('KCFKPI_QuarterReviewItems')") >= 0) return response({ value: [quarterItemRow] });
  if (decoded.indexOf("getbytitle('KCFKPI_Evidence')") >= 0) return response({ value: evidenceRows });
  if (decoded.indexOf("getbytitle('KCFKPI_Audit')") >= 0) {
    return response({ value: decoded.indexOf('PERSON-001|2027|Q1') >= 0 ? quarterAudits : workplanAudits });
  }
  return response({ value: [] });
});
const client = { get, post: jest.fn() } as unknown as SPHttpClient;

const command = (index: number, actor: IProductionPerson, workplan: IAnnualWorkplan): {
  commandKey: string; actor: IProductionPerson; workplan: IAnnualWorkplan;
} => ({
  commandKey: `${(`00000000${index}`).slice(-8)}-1111-4111-8111-111111111111`, actor, workplan
});

describe('canonical EmployeeV2 frozen quarterly Behaviour Target readback', () => {
  const storedTarget = {
    BehaviourAnnualTargetLevelV2: 'Effective', BehaviourAnnualTargetJustificationV2: 'Approved annual ambition',
    BehaviourAnnualTargetSourceWorkplanItemKeyV2: 'BHV-ITEM-001', BehaviourAnnualTargetSourceEtagV2: '"source-3"',
    BehaviourAnnualTargetSourceWorkplanVersionV2: 3, BehaviourAnnualTargetSourceApprovalKeyV2: 'approval-3'
  };
  const physicalFields = Object.keys(storedTarget);
  const expectedTarget = {
    behaviourAnnualTargetLevelV2: 'Effective', behaviourAnnualTargetJustificationV2: 'Approved annual ambition',
    behaviourAnnualTargetSourceWorkplanItemKeyV2: 'BHV-ITEM-001', behaviourAnnualTargetSourceEtagV2: '"source-3"',
    behaviourAnnualTargetSourceWorkplanVersionV2: 3, behaviourAnnualTargetSourceApprovalKeyV2: 'approval-3'
  };
  const fixture = (quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4' = 'Q1', v02 = true) => {
    const key = `PERSON-001|2027|${quarter}`;
    const reviewRow = { ...quarterReviewRow, '@odata.etag': '"1"', QuarterReviewKey: key, Quarter: quarter,
      State: 'Draft', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', RowVersionToken: 1 };
    const row: Record<string, unknown> = { ...quarterItemRow, '@odata.etag': '"1"', QuarterReviewKey: key,
      QuarterReviewItemKey: `${key}|BHV-ITEM-001`, Quarter: quarter, WorkplanItemKey: 'BHV-ITEM-001',
      ItemType: 'Behaviour', BehaviourIDSnapshot: 'BHV-01', ManagerApproved: false, Locked: false,
      BehaviourFrameworkVersionSnapshot: BEHAVIOUR_FRAMEWORK_V2_VERSION, BehaviourValueTitleSnapshot: 'Value one',
      BehaviourCorporateValueSnapshot: 'Value one', BehaviourRoleTierSnapshot: 'IC_OFFICER',
      BehaviourDescriptorSnapshot: 'Approved descriptor', BehaviourCadenceSnapshot: 'Quarterly',
      BehaviourPeriodKeysSnapshotJSON: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4']), BehaviourPeriodSnapshot: quarter,
      BehaviourRatingLabelsSnapshotJSON: JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS),
      EmployeeBehaviourAssessmentV2: 1, EmployeeBehaviourEvidenceV2: 'Current quarterly evidence',
      ManagerBehaviourAssessmentV2: 2, ManagerBehaviourEvidenceV2: 'Manager evidence',
      FinalBehaviourAssessmentV2: 2, FinalBehaviourEvidenceV2: 'Final evidence', ...storedTarget };
    const read = jest.fn(async (url: string) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes(`getbytitle('${EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS.quarterReviews}')`)) return response({ value: [reviewRow] });
      if (decoded.includes(`getbytitle('${EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS.quarterReviewItems}')`)) return response({ value: [row] });
      return response({ value: [] });
    });
    const send = jest.fn(async (request: IEmployeeV2CommandRequest) => {
      const input = request.payload as IEmployeeQuarterUpdateInputV2;
      row.EmployeeBehaviourAssessmentV2 = input.employeeBehaviourAssessmentV2;
      row.EmployeeBehaviourEvidenceV2 = input.employeeBehaviourEvidenceV2;
      reviewRow.RowVersionToken++; reviewRow['@odata.etag'] = `"${reviewRow.RowVersionToken}"`;
      return { receipt: {
        receiptKey: '7cd2b366-aa4d-4d2c-a046-a5ca92624918|71', sourceListId: '7cd2b366-aa4d-4d2c-a046-a5ca92624918',
        sourceItemId: 71, sourceItemVersion: '1.0', commandKey: request.commandKey, commandType: request.commandType,
        subjectType: request.subjectType, subjectKey: request.subjectKey, personKey: request.personKey,
        performanceYear: request.performanceYear, quarter: request.quarter, authenticatedActorEmail: employee.email,
        authenticatedActorPersonKey: employee.personKey, effectiveRole: 'Employee' as const,
        processedByEmail: 'kcf-kpi-automation@example.invalid', processedAt: '2026-08-24T10:00:00Z',
        outcome: 'Accepted' as const, validationCode: 'ACCEPTED', message: 'Persisted and read back.',
        processedPayloadSha256: 'A'.repeat(64), resultKeysJson: JSON.stringify([{ subjectKey: request.subjectKey,
          rowVersionToken: reviewRow.RowVersionToken }]), auditKeysJson: '["AUDIT"]',
        correlationKey: request.commandKey, flowRunReference: 'FLOW-027A'
      }, replayed: false };
    });
    const service = new SharePointEmployeeWorkplanV2PersistenceService({ get: read } as unknown as SPHttpClient,
      site, employee.email, { execute: send } as unknown as EmployeeWorkplanV2CommandTransport,
      { ...EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS, supportsBehaviourFrameworkV2Fields: v02 });
    const context = { ...command(91, employee, { ...workplanRow, workplanKey: 'PERSON-001|2027',
      personKey: employee.personKey, employeeEmail: employee.email, performanceYear: 2027, state: 'Locked',
      etag: '"1"', rowVersionToken: 1, transitionStatus: 'Ready', managerPersonKey: manager.personKey,
      managerEmail: manager.email, workplanVersion: 3 } as unknown as IAnnualWorkplan),
      review: { quarterReviewKey: key, workplanKey: 'PERSON-001|2027', personKey: employee.personKey,
        performanceYear: 2027, quarter, etag: '"1"', rowVersionToken: 1, state: 'Draft',
        accessState: 'EmployeeEdit', transitionStatus: 'Ready' } } as IEmployeeV2QuarterCommandContext;
    return { row, reviewRow, read, send, service, context };
  };

  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('retains the same detached approved image for %s and separate Actuals', async quarter => {
    const f = fixture(quarter);
    const item = (await f.service.getEmployeeQuarterV2(f.context))!.items[0];
    expect(materialiseQuarterBehaviourTarget(item)).toEqual(expectedTarget);
    expect(Object.isFrozen(materialiseQuarterBehaviourTarget(item))).toBe(true);
    expect(item.behaviourSnapshotV2!.period).toBe(quarter);
    expect(item).toEqual(expect.objectContaining({ employeeBehaviourAssessmentV2: 1, managerBehaviourAssessmentV2: 2, finalBehaviourAssessmentV2: 2 }));
    const select = f.read.mock.calls.find(([url]) => url.includes("getbytitle('KCFKPI_QuarterReviewItems')"))![0].split('$select=')[1].split('&')[0].split(',');
    physicalFields.forEach(field => expect(select.filter(value => value === field)).toHaveLength(1));
    f.row.BehaviourAnnualTargetLevelV2 = 'Exceptional';
    expect(materialiseQuarterBehaviourTarget(item)).toEqual(expectedTarget);
  });
  it.each(['missing', 'null', 'empty'])('leaves %s historic Target unavailable without annual fallback', async absence => {
    const f = fixture();
    physicalFields.forEach(field => { if (absence === 'missing') delete f.row[field]; else f.row[field] = absence === 'null' ? null : ''; });
    expect(materialiseQuarterBehaviourTarget((await f.service.getEmployeeQuarterV2(f.context))!.items[0])).toBeUndefined();
  });
  it('accepts absent optional justification and matching half-year period', async () => {
    const f = fixture('Q3'); delete f.row.BehaviourAnnualTargetJustificationV2;
    f.row.BehaviourCadenceSnapshot = 'TwiceYearly'; f.row.BehaviourPeriodKeysSnapshotJSON = '["H1","H2"]'; f.row.BehaviourPeriodSnapshot = 'H2';
    expect(materialiseQuarterBehaviourTarget((await f.service.getEmployeeQuarterV2(f.context))!.items[0]))
      .toEqual({ ...expectedTarget, behaviourAnnualTargetJustificationV2: undefined });
  });
  it.each([
    ['BehaviourAnnualTargetLevelV2', undefined], ['BehaviourAnnualTargetLevelV2', 2], ['BehaviourAnnualTargetLevelV2', 'Unknown'],
    ['BehaviourAnnualTargetJustificationV2', 17], ['BehaviourAnnualTargetSourceWorkplanItemKeyV2', 'different-item'],
    ['BehaviourAnnualTargetSourceWorkplanItemKeyV2', 3], ['BehaviourAnnualTargetSourceEtagV2', '*'],
    ['BehaviourAnnualTargetSourceEtagV2', 'unquoted'], ['BehaviourAnnualTargetSourceEtagV2', 3],
    ['BehaviourAnnualTargetSourceWorkplanVersionV2', 0], ['BehaviourAnnualTargetSourceWorkplanVersionV2', 1.5],
    ['BehaviourAnnualTargetSourceWorkplanVersionV2', '3'], ['BehaviourAnnualTargetSourceApprovalKeyV2', ' '],
    ['BehaviourAnnualTargetSourceApprovalKeyV2', 3], ['QuarterReviewItemKey', ''], ['WorkplanKey', ''],
    ['PersonKey', ''], ['BehaviourIDSnapshot', 'Unknown'], ['BehaviourPeriodSnapshot', 'Q2']
  ])('rejects incomplete, wrong-type or inconsistent stored %s=%s', async (field, value) => {
    const f = fixture(); f.row[field as string] = value;
    await expect(f.service.getEmployeeQuarterV2(f.context)).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
  });
  it('preserves all six fixed fields after an ordinary categorical Actual update', async () => {
    const f = fixture(); const before = (await f.service.getEmployeeQuarterV2(f.context))!;
    const saved = await f.service.saveEmployeeQuarterUpdateV2({ ...f.context, review: before.review, item: before.items[0] },
      { employeeUpdate: 'Quarter evidence updated', employeeBehaviourAssessmentV2: 3, employeeBehaviourEvidenceV2: 'New actual evidence' });
    expect(materialiseQuarterBehaviourTarget(saved.readback.items[0])).toEqual(expectedTarget);
    expect(saved.readback.items[0]).toEqual(expect.objectContaining({ employeeBehaviourAssessmentV2: 3,
      employeeBehaviourEvidenceV2: 'New actual evidence', managerBehaviourAssessmentV2: 2, finalBehaviourAssessmentV2: 2 }));
    expect(f.send).toHaveBeenCalledTimes(1);
    physicalFields.forEach(field => expect(f.row[field]).toEqual(storedTarget[field as keyof typeof storedTarget]));
  });
  it.each(QUARTER_BEHAVIOUR_TARGET_FIELDS)('rejects immutable %s update before transport', async field => {
    const f = fixture(); const readback = (await f.service.getEmployeeQuarterV2(f.context))!;
    await expect(f.service.saveEmployeeQuarterUpdateV2({ ...f.context, review: readback.review, item: readback.items[0] },
      { employeeUpdate: 'Update', [field]: expectedTarget[field] } as IEmployeeQuarterUpdateInputV2)).rejects.toThrow();
    expect(f.send).not.toHaveBeenCalled();
  });
  it.each([EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS, KCF_KPI_036_TEST_LIST_BINDINGS])('keeps false-v02 binding selectors unchanged for $runtime', async bindings => {
    const f = fixture('Q1', false);
    const service = new SharePointEmployeeWorkplanV2PersistenceService({ get: f.read } as unknown as SPHttpClient,
      site, employee.email, undefined, bindings);
    await service.getEmployeeQuarterV2(f.context);
    const queries = f.read.mock.calls.map(([url]) => url.split('$select=')[1].split('&')[0]);
    physicalFields.forEach(field => expect(queries.join(',')).not.toContain(field));
    expect(bindings.supportsBehaviourFrameworkV2Fields).toBe(false);
  });
});

describe('KCF-KPI-027A production-service lifecycle', () => {
  beforeEach(() => {
    executeMock.mockClear(); executeAnnualMock.mockClear(); get.mockClear(); lastRequest = undefined;
  });

  it('proves save/readback, changes/amendment, resubmit, two immutable approval versions and exact approved readback', async () => {
    const employeeService = new SharePointEmployeeWorkplanV2PersistenceService(client, site, employee.email, transport,
      EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS, annualGateway);
    const managerService = new SharePointEmployeeWorkplanV2PersistenceService(client, site, manager.email, transport,
      EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS, annualGateway);
    const systemService = new SharePointEmployeeWorkplanV2PersistenceService(client, site, system.email, transport,
      EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS, annualGateway);
    const loaded = await employeeService.getEmployeeWorkplanV2(employee, 2027);
    expect(loaded?.workplan).toEqual(expect.objectContaining({ state: 'Draft', workplanVersion: 1, rowVersionToken: 1 }));

    let saved = await employeeService.saveEmployeeWorkplanDraftV2(command(1, employee, loaded!.workplan), {
      coreCategoryWeight: 90, personalCategoryWeight: 0, behaviourCategoryWeight: 10,
      categoryWeightReason: 'No Personal KPI is agreed.', zeroPersonalProposal: {
        employeeReason: 'My approved role needs no Personal KPI.', coreCategoryWeight: 90,
        personalCategoryWeight: 0, behaviourCategoryWeight: 10
      }
    });
    expect(saved.readback.workplan).toEqual(expect.objectContaining({ coreCategoryWeight: 90, personalCategoryWeight: 0, rowVersionToken: 3 }));

    saved = await employeeService.setCoreWeightingV2(command(2, employee, saved.readback.workplan), { mode: 'Custom', customWeights: [{ kpiId: 'SO1-001', weight: 100 }] });
    saved = await employeeService.submitEmployeeWorkplanV2(command(3, employee, saved.readback.workplan));
    expect(saved.readback.workplan.state).toBe('Submitted');

    saved = await managerService.requestEmployeeWorkplanChangesV2(command(4, manager, saved.readback.workplan), 'Clarify the annual direct-delivery target.');
    expect(saved.readback.workplan).toEqual(expect.objectContaining({ state: 'ChangesRequested', managerDecisionComment: 'Clarify the annual direct-delivery target.' }));

    saved = await employeeService.upsertCoreContributionV2({
      ...command(5, employee, saved.readback.workplan), subjectKey: 'PERSON-001|2027|CoreGold|SO1-001', expectedItemEtag: '"1"'
    }, {
      kpiId: 'SO1-001', role: 'DeliveryLead', contributionMethod: 'AdditiveDirect', annualTargetValue: 120,
      quarterTargets: [
        { quarter: 'Q1', targetValue: 30 }, { quarter: 'Q2', targetValue: 30 },
        { quarter: 'Q3', targetValue: 30 }, { quarter: 'Q4', targetValue: 30 }
      ], displayOrder: 0, activeInWorkplan: true
    });
    expect(saved.readback.coreItems[0]).toEqual(expect.objectContaining({ annualTargetValue: 120, contributionUnit: 'schools' }));
    expect(JSON.stringify(lastRequest?.payload)).not.toMatch(/contributionUnit|nonOverlapApproved|actorEmail|approvedAt/);

    saved = await employeeService.submitEmployeeWorkplanV2(command(6, employee, saved.readback.workplan));
    saved = await managerService.approveAndLockEmployeeWorkplanV2(command(7, manager, saved.readback.workplan));
    const firstApproval = workplanAudits.find(row => row.EventType === 'WorkplanApproved')?.AfterJSON;
    expect(saved.readback.workplan).toEqual(expect.objectContaining({ state: 'Locked', workplanVersion: 1 }));

    saved = await systemService.createEmployeeWorkplanAmendmentV2(
      command(8, system, saved.readback.workplan),
      'Controlled post-approval correction approved by CONTROL.',
      'CONTROL-027A-AMENDMENT-001'
    );
    expect(saved.readback.workplan).toEqual(expect.objectContaining({ state: 'ChangesRequested', workplanVersion: 2 }));
    saved = await employeeService.upsertCoreContributionV2({
      ...command(9, employee, saved.readback.workplan), subjectKey: 'PERSON-001|2027|CoreGold|SO1-001', expectedItemEtag: '"1"'
    }, {
      kpiId: 'SO1-001', role: 'DeliveryLead', contributionMethod: 'AdditiveDirect', annualTargetValue: 125,
      quarterTargets: [
        { quarter: 'Q1', targetValue: 30 }, { quarter: 'Q2', targetValue: 30 },
        { quarter: 'Q3', targetValue: 30 }, { quarter: 'Q4', targetValue: 35 }
      ], displayOrder: 0, activeInWorkplan: true
    });
    saved = await employeeService.submitEmployeeWorkplanV2(command(10, employee, saved.readback.workplan));
    saved = await managerService.approveAndLockEmployeeWorkplanV2(command(11, manager, saved.readback.workplan));

    expect(saved.readback.workplan).toEqual(expect.objectContaining({ state: 'Locked', workplanVersion: 2 }));
    expect(saved.readback.coreItems[0]).toEqual(expect.objectContaining({ annualTargetValue: 125, contributionApprovalState: 'Approved' }));
    expect(workplanAudits.filter(row => row.EventType === 'WorkplanApproved')).toHaveLength(2);
    expect(workplanAudits.filter(row => row.EventType === 'WorkplanAmendmentCreated')).toHaveLength(1);
    expect(workplanAudits.find(row => row.EventType === 'WorkplanApproved')?.AfterJSON).toBe(firstApproval);
  });

  it('proves current-quarter update, protected calculation, evidence registration, submit and exact readback', async () => {
    const employeeService = new SharePointEmployeeWorkplanV2PersistenceService(client, site, employee.email, transport);
    Object.assign(workplanRow, {
      State: 'Locked', AccessState: 'ReadOnly', WorkplanVersion: 2,
      ApprovedAt: '2026-08-24T10:00:00Z', ApprovedByEmail: manager.email,
      LockedAt: '2026-08-24T10:00:01Z', LockedByEmail: manager.email
    });
    Object.assign(quarterReviewRow, {
      '@odata.etag': '"1"', State: 'Draft', AccessState: 'EmployeeEdit',
      TransitionStatus: 'Ready', RowVersionToken: 1
    });
    Object.assign(quarterItemRow, {
      '@odata.etag': '"1"', EmployeeActualValue: undefined, StatusUpdate: undefined,
      ContextMitigation: undefined, ProgressPct: undefined, CalculatedRAG: 'NotRated',
      EvidenceCount: 0, ManagerApproved: false, Locked: false
    });
    quarterAudits.splice(0, quarterAudits.length); evidenceRows.splice(0, evidenceRows.length);
    const workplanReadback = await employeeService.getEmployeeWorkplanV2(employee, 2027);
    const review = {
      id: 30, etag: String(quarterReviewRow['@odata.etag']), quarterReviewKey: String(quarterReviewRow.QuarterReviewKey),
      workplanKey: String(quarterReviewRow.WorkplanKey), personKey: employee.personKey, employeeDisplayName: employee.displayName,
      employeeEmail: employee.email, performanceYear: 2027, quarter: 'Q1' as const, managerPersonKey: manager.personKey,
      managerDisplayName: manager.displayName, managerEmail: manager.email, state: 'Draft' as const,
      accessState: 'EmployeeEdit' as const, transitionStatus: 'Ready' as const, rowVersionToken: Number(quarterReviewRow.RowVersionToken)
    };
    const item = {
      id: 31, etag: String(quarterItemRow['@odata.etag']), quarterReviewItemKey: String(quarterItemRow.QuarterReviewItemKey),
      quarterReviewKey: review.quarterReviewKey, workplanItemKey: 'CORE-ITEM-001', workplanKey: review.workplanKey,
      personKey: employee.personKey, performanceYear: 2027, quarter: 'Q1' as const, itemType: 'CoreGold' as const,
      wording: 'Schools delivering activity', calculatedRag: 'NotRated' as const, evidenceCount: 0,
      managerApproved: false, locked: false
    };
    const context = { ...command(12, employee, workplanReadback!.workplan), review, item };
    let result = await employeeService.saveEmployeeQuarterUpdateV2(context, {
      employeeActualValue: 18, employeeUpdate: 'Eighteen schools are active.', contextMitigation: 'Venue capacity remains constrained.',
      forecastValue: 24, recovery: {
        route: 'Mitigate', action: 'Prioritise ready schools.', ownerPersonKey: employee.personKey,
        dueDate: '2027-01-20', nextReviewDate: '2027-01-27', expectedReducedOutcome: 'Deliver 24 of 25 schools.'
      }
    });
    expect(result.readback.items[0]).toEqual(expect.objectContaining({
      employeeActualValue: 18, statusUpdate: 'Eighteen schools are active.', contextMitigation: 'Venue capacity remains constrained.',
      calculatedRag: 'Amber', progressPct: 72
    }));
    expect(JSON.stringify(lastRequest?.payload)).not.toMatch(/calculatedRag|finalRag|progressPct|actorEmail/);

    const evidenceContext = { ...command(13, employee, workplanReadback!.workplan), review: result.readback.review, item: result.readback.items[0] };
    result = await employeeService.registerEmployeeQuarterEvidenceV2(evidenceContext, {
      fileUniqueId: 'de8fc527-fa58-4b8a-ae63-818822015746', description: 'Delivery register extract'
    });
    expect(result.readback.evidence).toEqual([expect.objectContaining({ evidenceKey: 'EVIDENCE-001', description: 'Delivery register extract' })]);
    expect(result.readback.items[0].evidenceCount).toBe(1);

    const submitContext = { ...command(14, employee, workplanReadback!.workplan), review: result.readback.review, item: result.readback.items[0] };
    result = await employeeService.submitEmployeeQuarterV2(submitContext, 'Q1 ready for manager review.');
    expect(result.readback.review).toEqual(expect.objectContaining({ state: 'Submitted', accessState: 'ManagerDecision' }));
    expect(result.readback.audits.map(row => row.eventType)).toEqual(expect.arrayContaining([
      'QuarterReviewDraftUpdated', 'EvidenceRegistered', 'QuarterReviewSubmitted'
    ]));
  });

  it('KCF-KPI-036 reloads every TEST Behaviour suggestion key together with concurrent custom wording', async () => {
    const selectedKeys = ['BHV-01-OBJ-01', 'BHV-01-OBJ-02'];
    const testBehaviour = {
      ...behaviourRow,
      WorkplanVersion: workplanRow.WorkplanVersion,
      BehaviourObjectiveSource: 'Library',
      BehaviourSelectedSuggestionKeysJ: JSON.stringify(selectedKeys),
      BehaviourCustomObjective: 'Help another team deliver an agreed TEST outcome'
    };
    const testGet = jest.fn(async (url: string) => {
      const decoded = decodeURIComponent(url);
      if (decoded.indexOf("getbytitle('KCFKPI_TEST_Workplans')") >= 0) return response({ value: [workplanRow] });
      if (decoded.indexOf("getbytitle('KCFKPI_TEST_WorkplanItems')") >= 0) return response({ value: [testBehaviour] });
      if (decoded.indexOf("getbytitle('KCFKPI_TEST_Audit')") >= 0) return response({ value: [] });
      return response({ value: [] });
    });
    const testClient = { get: testGet, post: jest.fn() } as unknown as SPHttpClient;
    const service = new SharePointEmployeeWorkplanV2PersistenceService(
      testClient, site, employee.email, undefined, KCF_KPI_036_TEST_LIST_BINDINGS
    );

    const loaded = await service.getEmployeeWorkplanV2(employee, 2027);

    expect(loaded?.behaviourItems[0]).toEqual(expect.objectContaining({
      selectedSuggestionKeys: selectedKeys,
      customObjective: 'Help another team deliver an agreed TEST outcome'
    }));
    const urls = testGet.mock.calls.map(call => decodeURIComponent(String(call[0]))).join('\n');
    expect(urls).toMatch(/KCFKPI_TEST_Workplans/);
    expect(urls).toMatch(/KCFKPI_TEST_WorkplanItems/);
    expect(urls).toMatch(/BehaviourSelectedSuggestionKeysJ,BehaviourCustomObjective/);
    expect(urls).not.toMatch(/getbytitle\('KCFKPI_(?!TEST_)/);
  });
});


it('M145 shared Core projection preserves every input field and copies nested quarter targets', () => {
  const input = { kpiId: 'K1', role: 'Contributor' as const, contributionMethod: 'WeightedDenominator' as const,
    annualTargetValue: -2.5, annualTargetText: 'é/é 🏏'.repeat(100), displayOrder: 2, activeInWorkplan: true,
    quarterTargets: ['Q1','Q2','Q3','Q4'].map(quarter => ({ quarter: quarter as 'Q1', targetValue: -0.5,
      targetText: 'one', commitment: 'two', successDefinition: 'three'.repeat(300) })),
    sharedTargetRule: 'VisibleOnly' as const, sharedApportionmentPercent: 25, governanceReference: 'g',
    denominatorNumerator: -4.25, denominatorValue: 8.5, denominatorUnit: 'participants', denominatorRuleReference: 'rule', denominatorSourceReference: 'source' };
  const before = JSON.stringify(input), result = projectEmployeeCoreContributionV2(input);
  expect(result).toEqual(input); expect(result.quarterTargets).not.toBe(input.quarterTargets);
  result.quarterTargets[0].targetValue = 999; expect(JSON.stringify(input)).toBe(before);
});

it('A014 persistence reads the approved required WorkplanItems attribution vocabulary only', () => {
  const fields = EMPLOYEE_V2_WORKPLAN_ITEM_SELECT.split(',');
  expect(fields).toEqual(expect.arrayContaining(['ContributionWeight', 'AddedByEmail', 'AddedAt']));
  expect(fields).not.toEqual(expect.arrayContaining(['AdditiveEligible', 'DeactivatedAt', 'DeactivatedByEmail']));
});

describe('qualified empty private Draft employee read', () => {
  const header = (): Record<string, unknown> => ({
    Id: 10, '@odata.etag': '"1"', WorkplanKey: 'PERSON-001|2027', PersonKey: employee.personKey,
    EmployeeDisplayName: employee.displayName, EmployeeEmail: employee.email, PerformanceYear: 2027,
    State: 'Draft', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', RowVersionToken: 1,
    WorkplanVersion: 1, CoreWeightingMode: 'Equal', CoreCategoryWeight: 70,
    PersonalCategoryWeight: 30, BehaviourCategoryWeight: 0
  });
  const fixture = (options: {
    first?: Record<string, unknown>; last?: Record<string, unknown>; presence?: unknown;
    rich?: Record<string, unknown>[]; failPresence?: boolean; failAudit?: boolean; missingRich?: boolean
  } = {}): { service: SharePointEmployeeWorkplanV2PersistenceService; read: jest.Mock } => {
    let headerReads = 0;
    const read = jest.fn(async (url: string) => {
      const parsed = new URL(url), select = parsed.searchParams.get('$select');
      if (url.includes("getbytitle('KCFKPI_Workplans')")) {
        headerReads += 1;
        return response({ value: [headerReads === 1 ? options.first || header() : options.last || options.first || header()] });
      }
      if (url.includes("getbytitle('KCFKPI_WorkplanItems')")) {
        if (select === 'Id,WorkplanKey') {
          if (options.failPresence) return { ...response({}), ok: false, status: 403 };
          return response(options.presence === undefined ? { value: [] } : options.presence);
        }
        if (options.missingRich) return { ...response({}), ok: false, status: 400 };
        return response({ value: options.rich || [] });
      }
      if (url.includes("getbytitle('KCFKPI_Audit')")) {
        if (options.failAudit) return { ...response({}), ok: false, status: 403 };
        return response({ value: [] });
      }
      throw new Error(`Unexpected qualification URL ${url}`);
    });
    return { service: new SharePointEmployeeWorkplanV2PersistenceService({ get: read } as unknown as SPHttpClient,
      site, employee.email), read };
  };
  it('loads actual header and audits without selecting absent rich columns for proved zero', async () => {
    const f = fixture({ missingRich: true });
    const result = await f.service.getEmployeeWorkplanV2(employee, 2027);
    expect(result?.workplan).toMatchObject({ id: 10, etag: '"1"', coreWeightingMode: 'Equal', personalCategoryWeight: 30 });
    expect(result?.coreItems).toEqual([]); expect(result?.personalItems).toEqual([]); expect(result?.behaviourItems).toEqual([]);
    const itemUrls = f.read.mock.calls.map(call => call[0] as string).filter(url => url.includes("getbytitle('KCFKPI_WorkplanItems')"));
    expect(itemUrls).toHaveLength(1); expect(new URL(itemUrls[0]).searchParams.get('$select')).toBe('Id,WorkplanKey');
    expect(new URL(itemUrls[0]).searchParams.get('$top')).toBe('1');
    expect(new URL(itemUrls[0]).searchParams.get('$filter')).toBe("WorkplanKey eq 'PERSON-001|2027'");
    expect(f.read.mock.calls.filter(call => (call[0] as string).includes("getbytitle('KCFKPI_Workplans')"))).toHaveLength(2);
    expect(f.read.mock.calls.some(call => (call[0] as string).includes("getbytitle('KCFKPI_Audit')"))).toBe(true);
  });
  it.each([
    { Id: 22, WorkplanKey: 'PERSON-001|2027', ActiveInWorkplan: true },
    { Id: 22, WorkplanKey: 'PERSON-001|2027', ActiveInWorkplan: false },
    { Id: 22, WorkplanKey: 'PERSON-001|2027', WorkplanVersion: 99 },
    { Id: 22, WorkplanKey: 'PERSON-001|2027', ItemType: 'Unknown' }
  ])('keeps the rich read when any normalised item exists: %j', async row => {
    const f = fixture({ presence: { value: [row] }, rich: [{ ...coreRow, WorkplanVersion: 1 }] });
    const result = await f.service.getEmployeeWorkplanV2(employee, 2027);
    expect(result?.coreItems).toHaveLength(1);
    expect(f.read.mock.calls.some(call => new URL(call[0] as string).searchParams.get('$select') === EMPLOYEE_V2_WORKPLAN_ITEM_SELECT)).toBe(true);
  });
  it.each([
    { CoreWeightingMode: undefined }, { CoreCategoryWeight: undefined }, { PersonalCategoryWeight: NaN },
    { BehaviourCategoryWeight: 101 }, { EmployeeDisplayName: '' }, { AccessState: undefined },
    { Id: 0 }, { '@odata.etag': '*' }, { WorkplanVersion: 0 }, { RowVersionToken: -1 }
  ])('refuses zero with absent or invalid actual header evidence: %j', async patch => {
    const f = fixture({ first: { ...header(), ...patch } });
    await expect(f.service.getEmployeeWorkplanV2(employee, 2027)).rejects.toThrow();
  });
  it.each([
    {}, { value: null }, { value: 'empty' }, { value: [], '@odata.nextLink': 'next' },
    { value: [{ Id: 22, WorkplanKey: 'OTHER|2027' }] }, { value: [{ Id: '22', WorkplanKey: 'PERSON-001|2027' }] },
    { value: [{ Id: 22, WorkplanKey: 'PERSON-001|2027' }, { Id: 23, WorkplanKey: 'PERSON-001|2027' }] }
  ])('holds malformed, ambiguous or continued absence responses: %j', async presence => {
    const f = fixture({ presence });
    await expect(f.service.getEmployeeWorkplanV2(employee, 2027)).rejects.toThrow();
  });
  it.each([{ failPresence: true }, { failAudit: true }])('retains HTTP failure as failure: %j', async options => {
    await expect(fixture(options).service.getEmployeeWorkplanV2(employee, 2027)).rejects.toThrow();
  });
  it.each([{ '@odata.etag': '"2"' }, { RowVersionToken: 2 }, { CoreCategoryWeight: 60 }, { State: 'Submitted' }])(
    'refuses changed header after absence/Audit reads: %j', async patch => {
      const f = fixture({ last: { ...header(), ...patch } });
      await expect(f.service.getEmployeeWorkplanV2(employee, 2027)).rejects.toThrow();
    });
  it.each(['ChangesRequested', 'Submitted', 'Locked'])('keeps %s on the unchanged rich path', async State => {
    const f = fixture({ first: { ...header(), State }, rich: [coreRow] });
    await f.service.getEmployeeWorkplanV2(employee, 2027);
    expect(f.read.mock.calls.some(call => new URL(call[0] as string).searchParams.get('$select') === 'Id,WorkplanKey')).toBe(false);
    expect(f.read.mock.calls.some(call => new URL(call[0] as string).searchParams.get('$select') === EMPLOYEE_V2_WORKPLAN_ITEM_SELECT)).toBe(true);
  });
});
