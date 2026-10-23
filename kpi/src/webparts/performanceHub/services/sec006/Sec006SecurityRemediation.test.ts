import {
  Sec006AutomationProcessor,
  type ISec006CanonicalSubject,
  type ISec006CommandEnvelope,
  type ISec006ProcessContext,
  type ISec006ProcessorState,
  type ISec006TrustedSource
} from './Sec006AutomationProcessor';
import { Sec006AtomicControlCaseMemoryStore, type ISec006ControlCase } from './Sec006ControlCaseStore';
import {
  createSec006BusinessAdminExceptionProjection,
  createSec006CoverageSummaryProjection,
  type ISec006ProjectionAuthority,
  type ISec006RawCoverageRow
} from './Sec006CoverageProjections';

const employeeListId = '7cd2b366-aa4d-4d2c-a046-a5ca92624918';
const managerListId = 'c506d905-ec56-45ff-a2a0-2a4ee094fa4a';
const trustedUtc = '2026-11-01T12:00:00Z';

const canonical = (patch: Partial<ISec006CanonicalSubject> = {}): ISec006CanonicalSubject => ({
  subjectKey: 'WP|E1|2027', subjectType: 'Workplan', personKey: 'E1', performanceYear: 2027,
  etag: '"1"', rowVersionToken: 1, state: 'Draft', workplanVersion: 1, locked: false,
  transitionStatus: 'Ready', values: {}, ...patch
});

const controlCase = (): ISec006ControlCase => ({
  controlCaseKey: 'CONTROL-027C-001', controlReference: 'CONTROL-027C-001',
  authorisedAction: 'CreateWorkplanAmendmentV2', subjectKey: 'WP|E1|2027',
  workplanKey: 'WP|E1|2027', workplanVersion: 1, expectedETag: '"1"',
  expectedRowVersionToken: 1, storageETag: '"1"', storageRowVersionToken: 1, active: true,
  validFromUtc: '2026-10-01T00:00:00Z', validToUtc: '2027-10-31T23:59:59Z', revoked: false
});

const processorState = (subject: ISec006CanonicalSubject = canonical()): ISec006ProcessorState => ({
  trustedSourceListIds: {
    KCFKPI_EmployeeCommands: employeeListId,
    KCFKPI_ManagerCommands: managerListId
  },
  people: [
    { personKey: 'E1', email: 'e1@example.invalid', managerPersonKey: 'M1', active: true, appRoles: ['Employee'] },
    { personKey: 'E2', email: 'e2@example.invalid', managerPersonKey: 'M2', active: true, appRoles: ['Employee'] },
    { personKey: 'M1', email: 'm1@example.invalid', active: true, appRoles: ['Manager'] },
    { personKey: 'M2', email: 'm2@example.invalid', active: true, appRoles: ['Manager'] },
    { personKey: 'D1', email: 'd1@example.invalid', active: true, appRoles: ['DelegatedManager'] },
    { personKey: 'SA1', email: 'sa1@example.invalid', active: true, appRoles: ['SystemAdmin'] }
  ],
  delegations: [{
    delegationKey: 'DEL-UNSCOPED', delegatorPersonKey: 'M1', delegatePersonKey: 'D1',
    subjectPersonKey: 'E1', performanceYear: 2027, partition: 'annual',
    resourceType: 'KCFKPI_Workplans', resourceKey: 'WP|E1|2027',
    subjectType: 'Workplan', subjectKey: 'WP|E1|2027', active: true, revoked: false,
    startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z',
    subjectTypes: [], subjectKeys: [], commandTypes: [], readbackAllowed: false
  }],
  stableKeyBindings: [{
    fieldName: 'workplanItemKey', value: 'WPI|E2|2027|SO1-001',
    subjectKey: 'WP|E2|2027', personKey: 'E2', performanceYear: 2027, active: true
  }],
  controlCases: [controlCase()],
  controlCaseStore: new Sec006AtomicControlCaseMemoryStore([controlCase()]),
  subjects: new Map([[subject.subjectKey, subject]]), approvedHistory: [], receipts: [], audit: [],
  recoveryJournal: []
});

const source = (patch: Partial<ISec006TrustedSource> = {}): ISec006TrustedSource => ({
  listId: employeeListId, listTitle: 'KCFKPI_EmployeeCommands', itemId: 71,
  itemVersion: '1.0', authorEmail: 'e1@example.invalid', createdUtc: '2026-11-01T11:59:00Z',
  ...patch
});

const command = (patch: Partial<ISec006CommandEnvelope> = {}): ISec006CommandEnvelope => ({
  commandKey: 'CMD-027C-001', commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan',
  subjectKey: 'WP|E1|2027', claimedPersonKey: 'E1', claimedPerformanceYear: 2027,
  expectedETag: '"1"', expectedRowVersionToken: 1,
  payload: { coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 },
  clientCorrelationKey: 'ATTACKER-CORRELATION', ...patch
});

const context = (
  sourcePatch: Partial<ISec006TrustedSource> = {},
  commandPatch: Partial<ISec006CommandEnvelope> = {}
): ISec006ProcessContext => ({
  source: source(sourcePatch), command: command(commandPatch),
  automationIdentity: 'a1.synthetic.noninteractive@example.invalid',
  flowRunReference: 'FLOW-RUN-027C', trustedUtc
});

const people = Array.from({ length: 12 }, (_, index) => `P${index + 1}`);
const raw = (personKey: string, patch: Partial<ISec006RawCoverageRow> = {}): ISec006RawCoverageRow => ({
  contributionCaseKey: `CASE-${personKey}`, personKey, personDisplayName: `Person ${personKey}`,
  managerPersonKey: 'M1', teamKey: 'TEAM-A', workplanKey: `WP|${personKey}|2027`,
  workplanItemKey: `WPI|${personKey}|SO1-001`, performanceYear: 2027, kpiId: 'SO1-001',
  kpiWording: 'Strategic KPI', pillar: 'Pillar A', workstream: 'Workstream A',
  reportingMemberships: ['CORE_CWOP'], contributionMethod: 'AdditiveDirect',
  employeeKpiRole: 'Contributor', approvalState: 'Approved', directContributionEligible: true,
  additiveApproved: true, nonOverlapRequired: true, nonOverlapApproved: true,
  unitLabel: 'schools', annualContributionTarget: 1, sourceVersion: 'RPT-005-v1',
  technicalCorrelationKey: `TECH-${personKey}`, recoveryHold: false, ...patch
});

const authority = (patch: Partial<ISec006ProjectionAuthority> = {}): ISec006ProjectionAuthority => ({
  role: 'Employee', actorPersonKey: 'P1', currentReportPersonKeys: [], activeDelegatedPersonKeys: [],
  exactRecoveryCaseKeys: [], allowedYears: [2027], allowedKpiIds: ['SO1-001', 'SO1-002'],
  organisationCohort: people.map(personKey => ({
    personKey, performanceYear: 2027, teamKey: 'TEAM-A', managerPersonKey: 'M1',
    kpiIds: ['SO1-001', 'SO1-002'], pillars: ['Pillar A'], workstreams: ['Workstream A'],
    reportingMemberships: Number(personKey.slice(1)) <= 8 ? ['CORE_CWOP'] : ['CWSP']
  })), sourceVersion: 'RPT-005-v1', scopeVersion: 'SCOPE-v1', trustedUtc,
  auditCorrelationKey: 'AUDIT-PROJECTION-027C', ...patch
});

describe('KCF-KPI-027C adversarial Security remediation', () => {
  it('DEF-027C-01 denies every System Admin business decision', () => {
    const result = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'sa1@example.invalid'
    }, { commandType: 'RequestWorkplanChanges', payload: { reason: 'Technical identity deciding business state.' } }),
    processorState(canonical({ state: 'Submitted' })));
    expect(result.receipt.validationCode).toBe('SYSTEM_ADMIN_NO_BUSINESS_DECISION');
    expect(result.mutationApplied).toBe(false);
  });

  it.each([
    ['ApproveAndLockWorkplan', 'Workplan', {}],
    ['RequestQuarterChanges', 'QuarterReview', { reason: 'Attempt.' }],
    ['SetQuarterManagerReview', 'QuarterReview', { decisionComment: 'Attempt.', proposedAssessment: 'Exceeds' }],
    ['SetQuarterRAGOverride', 'QuarterReview', { proposedOverrideRag: 'Green', decisionReason: 'Attempt.' }],
    ['DecideReforecast', 'QuarterReview', { decision: 'Approve', decisionComment: 'Attempt.' }],
    ['ApproveAndLockQuarter', 'QuarterReview', {}]
  ] as const)('DEF-027C-01 blocks System Admin command %s', (commandType, subjectType, payload) => {
    const target = canonical({
      subjectKey: subjectType === 'Workplan' ? 'WP|E1|2027' : 'QR|E1|2027|Q1',
      subjectType, state: 'Submitted'
    });
    const result = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'sa1@example.invalid'
    }, { commandType, subjectKey: target.subjectKey, subjectType, payload }), processorState(target));
    expect(result.receipt.validationCode).toBe('SYSTEM_ADMIN_NO_BUSINESS_DECISION');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-02 rejects a forged GUID/title binding before command authority is considered', () => {
    const result = new Sec006AutomationProcessor().process(context({
      listId: employeeListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'm1@example.invalid'
    }, { commandType: 'RequestWorkplanChanges', payload: { reason: 'Forged source identity.' } }),
    processorState(canonical({ state: 'Submitted' })));
    expect(result.receipt.validationCode).toBe('SOURCE_LIST_IDENTITY_MISMATCH');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-02 fails closed when the server source registry maps both titles to one GUID', () => {
    const current = processorState();
    current.trustedSourceListIds.KCFKPI_ManagerCommands = employeeListId;
    const result = new Sec006AutomationProcessor().process(context(), current);
    expect(result.receipt.validationCode).toBe('SOURCE_REGISTRY_INVALID');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-03 rejects a stable Workplan Item key bound to another subject', () => {
    const item = canonical({
      subjectKey: 'WPI|E1|2027|SO1-001', subjectType: 'WorkplanItem'
    });
    const result = new Sec006AutomationProcessor().process(context({}, {
      subjectKey: item.subjectKey, subjectType: 'WorkplanItem',
      commandType: 'DeactivateWorkplanItem', payload: {
        workplanItemKey: 'WPI|E2|2027|SO1-001', activeInWorkplan: false
      }
    }), processorState(item));
    expect(result.receipt.validationCode).toBe('STABLE_KEY_SUBJECT_MISMATCH');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-03 rejects a cross-subject mutation result key', () => {
    const result = new Sec006AutomationProcessor((before) => ({
      next: { ...before, etag: '"2"', rowVersionToken: 2 },
      resultKeys: ['WP|E2|2027']
    })).process(context(), processorState());
    expect(result.receipt.validationCode).toBe('RESULT_KEY_SUBJECT_MISMATCH');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-03 rejects an unrelated Recovery owner PersonKey', () => {
    const quarter = canonical({ subjectKey: 'QRI|E1|2027|Q1|SO1-001', subjectType: 'QuarterReviewItem' });
    const result = new Sec006AutomationProcessor().process(context({}, {
      subjectKey: quarter.subjectKey, subjectType: 'QuarterReviewItem', commandType: 'UpdateQuarterItemV2',
      payload: {
        employeeUpdate: 'Update.', recovery: {
          route: 'Recover', action: 'Action.', ownerPersonKey: 'E2', dueDate: '2027-01-10',
          nextReviewDate: '2027-01-15', expectedReturnToGreenDate: '2027-02-01'
        }
      }
    }), processorState(quarter));
    expect(result.receipt.validationCode).toBe('STABLE_KEY_SUBJECT_MISMATCH');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-04 denies CONTROL amendment from a Draft Workplan', () => {
    const result = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'sa1@example.invalid'
    }, { commandType: 'CreateWorkplanAmendmentV2', payload: {
      reason: 'Draft must not enter amendment.', controlReference: 'CONTROL-027C-001'
    } }), processorState());
    expect(result.receipt.validationCode).toBe('AMENDMENT_APPROVED_WORKPLAN_REQUIRED');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-05 rejects an active but unscoped delegation', () => {
    const quarter = canonical({ subjectKey: 'QR|E1|2027|Q1', subjectType: 'QuarterReview', state: 'Submitted' });
    const result = new Sec006AutomationProcessor().process(context({
      listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', authorEmail: 'd1@example.invalid'
    }, { subjectKey: quarter.subjectKey, subjectType: 'QuarterReview', commandType: 'SetQuarterManagerReview',
      payload: { decisionComment: 'Over-broad delegated decision.', proposedAssessment: 'Exceeds' }
    }), processorState(quarter));
    expect(result.receipt.validationCode).toBe('AUTHORITY_DENIED');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-06 computes complement inside the fully filtered reporting universe', () => {
    const rows = [
      ...people.slice(0, 5).map(personKey => raw(personKey)),
      ...people.slice(5, 8).map(personKey => raw(personKey, {
        kpiId: 'SO1-002', workplanItemKey: `WPI|${personKey}|SO1-002`
      }))
    ];
    const projection = createSec006CoverageSummaryProjection(rows, [], {
      performanceYear: 2027, reportingMembership: 'CORE_CWOP'
    }, authority());
    expect(projection.querySuppressionState).toBe('SUPPRESSED_SMALL_COHORT');
    expect(projection.rows).toEqual([]);
  });

  it('DEF-027C-07 makes zero and one-to-four summary cohorts indistinguishable', () => {
    const zero = createSec006CoverageSummaryProjection([], [], {
      performanceYear: 2027, kpiId: 'SO1-001'
    }, authority());
    const four = createSec006CoverageSummaryProjection(
      people.slice(0, 4).map(personKey => raw(personKey)), [],
      { performanceYear: 2027, kpiId: 'SO1-001' }, authority()
    );
    expect(four).toEqual(zero);
    expect(four.rows).toEqual([]);
  });

  it('DEF-027C-07 returns no exception metadata for a suppressed Business Admin cohort', () => {
    const projection = createSec006BusinessAdminExceptionProjection(
      people.slice(0, 4).map(personKey => raw(personKey, {
        exceptionType: 'UNIT_MISMATCH', exceptionOpenedAtUtc: '2026-10-20T12:00:00Z'
      })), { performanceYear: 2027 }, authority({ role: 'BusinessAdmin', actorPersonKey: 'BA1' })
    );
    expect(projection.querySuppressionState).toBe('SUPPRESSED_SMALL_COHORT');
    expect(projection.rows).toEqual([]);
  });

  it('DEF-027C-08 derives correlation from trusted server inputs, never the client claim', () => {
    const first = new Sec006AutomationProcessor().process(context({}, {
      clientCorrelationKey: 'ATTACKER-A'
    }), processorState());
    const second = new Sec006AutomationProcessor().process(context({}, {
      clientCorrelationKey: 'ATTACKER-B'
    }), processorState());
    expect(first.receipt.correlationKey).toBe(second.receipt.correlationKey);
    expect(first.receipt.correlationKey).not.toMatch(/ATTACKER/);
  });

  it('DEF-027C-08 fails closed when active People rows are ambiguous', () => {
    const current = processorState();
    current.people.push({
      personKey: 'ATTACKER', email: 'E1@EXAMPLE.INVALID', active: true, appRoles: ['Employee']
    });
    const result = new Sec006AutomationProcessor().process(context(), current);
    expect(result.receipt.validationCode).toBe('PEOPLE_DIRECTORY_AMBIGUOUS');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-08 rejects unknown properties recursively inside an otherwise allowed payload', () => {
    const quarter = canonical({ subjectKey: 'QRI|E1|2027|Q1|SO1-001', subjectType: 'QuarterReviewItem' });
    const result = new Sec006AutomationProcessor().process(context({}, {
      subjectKey: quarter.subjectKey, subjectType: 'QuarterReviewItem', commandType: 'UpdateQuarterItemV2',
      payload: {
        employeeUpdate: 'Update.',
        recovery: {
          route: 'Recover', action: 'Do the work.', ownerPersonKey: 'E1', dueDate: '2027-01-10',
          nextReviewDate: '2027-01-15', expectedReturnToGreenDate: '2027-02-01',
          injectedAuthority: 'SystemAdmin'
        }
      }
    }), processorState(quarter));
    expect(result.receipt.validationCode).toBe('UNKNOWN_NESTED_FIELD_CLAIM');
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-08 rejects cyclic payloads without recursion failure or mutation', () => {
    const cycle: Record<string, unknown> = {};
    cycle.recovery = cycle;
    const result = new Sec006AutomationProcessor().process(context({}, {
      commandType: 'UpdateQuarterItemV2', payload: cycle
    }), processorState());
    expect(result.receipt.validationCode).toBe('PAYLOAD_STRUCTURE_INVALID');
    expect(result.receipt.processedPayloadSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.mutationApplied).toBe(false);
  });

  it('DEF-027C-08 enters RecoveryHold when Audit I/O fails after canonical I/O', () => {
    const current = processorState();
    let failOnce = true;
    current.audit.push = ((...items: typeof current.audit) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('Synthetic Audit I/O failure.');
      }
      return Array.prototype.push.apply(current.audit, items);
    }) as typeof current.audit.push;
    const result = new Sec006AutomationProcessor().process(context(), current);
    expect(result.receipt.outcome).toBe('RecoveryHold');
    expect(result.receipt.validationCode).toBe('PARTIAL_IO_RECOVERY_HOLD');
    expect(result.mutationApplied).toBe(false);
    expect(current.subjects.get('WP|E1|2027')?.transitionStatus).toBe('RecoveryHold');
  });

  it('DEF-027C-08 rolls staged success back to RecoveryHold when Receipt I/O fails', () => {
    const current = processorState();
    const processor = new Sec006AutomationProcessor(undefined, {
      beforeWrite: stage => {
        if (stage === 'Receipt') throw new Error('Synthetic Receipt I/O failure.');
      }
    });
    const result = processor.process(context(), current);
    expect(result.receipt.outcome).toBe('RecoveryHold');
    expect(result.receipt.validationCode).toBe('PARTIAL_IO_RECOVERY_HOLD');
    expect(current.audit.some(item => item.outcome === 'Accepted')).toBe(false);
    expect(current.receipts.some(item => item.outcome === 'Accepted')).toBe(false);
    expect(current.recoveryJournal).toHaveLength(1);
    expect(current.recoveryJournal[0].failureStage).toBe('Receipt');
  });

  it('DEF-027C-08 leaves canonical state unchanged when I/O fails before the first write', () => {
    const current = processorState();
    const before = current.subjects.get('WP|E1|2027');
    const result = new Sec006AutomationProcessor(undefined, {
      beforeWrite: stage => {
        if (stage === 'Canonical') throw new Error('Synthetic pre-write failure.');
      }
    }).process(context(), current);
    expect(result.receipt.outcome).toBe('Failed');
    expect(result.receipt.validationCode).toBe('PROCESSOR_FAILURE');
    expect(current.subjects.get('WP|E1|2027')).toBe(before);
    expect(current.recoveryJournal).toHaveLength(0);
  });
});
