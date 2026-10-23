import {
  Sec006AutomationProcessor,
  type ISec006CanonicalSubject,
  type ISec006CommandEnvelope,
  type ISec006ControlCase,
  type ISec006DelegationRecord,
  type ISec006ProcessContext,
  type ISec006ProcessorState,
  type ISec006TrustedSource
} from './Sec006AutomationProcessor';
import { Sec006AtomicControlCaseMemoryStore } from './Sec006ControlCaseStore';
import {
  SEC006_PRIVATE_ROOTS,
  buildSec006AclPlan,
  isSec006DirectMutationAllowed,
  isSec006GovernedProcessorMutationAllowed,
  type ISec006AclPerson,
  type ISec006Delegation
} from './Sec006AclPlan';

const employeeListId = '7cd2b366-aa4d-4d2c-a046-a5ca92624918';
const managerListId = 'c506d905-ec56-45ff-a2a0-2a4ee094fa4a';
const trustedUtc = '2026-11-01T12:00:00Z';
const automation = 'a1.synthetic.noninteractive@example.invalid';

const people: ISec006AclPerson[] = [
  { personKey: 'E1', email: 'e1@example.invalid', active: true, managerPersonKey: 'M1', appRoles: ['Employee'] },
  { personKey: 'M1', email: 'm1@example.invalid', active: true, appRoles: ['Manager'] },
  { personKey: 'D1', email: 'd1@example.invalid', active: true, appRoles: ['DelegatedManager'] },
  { personKey: 'SA1', email: 'sa1@example.invalid', active: true, appRoles: ['SystemAdmin'] }
];

const lockedWorkplan = (patch: Partial<ISec006CanonicalSubject> = {}): ISec006CanonicalSubject => ({
  subjectKey: 'WP|E1|2027', subjectType: 'Workplan', personKey: 'E1', performanceYear: 2027,
  etag: '"1"', rowVersionToken: 1, state: 'Locked', workplanVersion: 1, locked: true,
  transitionStatus: 'Ready', values: { approvedMarker: 'immutable-v1' }, ...patch
});

const controlCase = (patch: Partial<ISec006ControlCase> = {}): ISec006ControlCase => ({
  controlCaseKey: 'CONTROL-027D-001', controlReference: 'CONTROL-027D-001',
  authorisedAction: 'CreateWorkplanAmendmentV2',
  subjectKey: 'WP|E1|2027', workplanKey: 'WP|E1|2027', workplanVersion: 1,
  expectedETag: '"1"', expectedRowVersionToken: 1,
  storageETag: '"1"', storageRowVersionToken: 1,
  active: true, validFromUtc: '2026-10-01T00:00:00Z', validToUtc: '2027-10-31T23:59:59Z',
  revoked: false,
  ...patch
});

const processorState = (subject: ISec006CanonicalSubject = lockedWorkplan()): ISec006ProcessorState => ({
  trustedSourceListIds: {
    KCFKPI_EmployeeCommands: employeeListId,
    KCFKPI_ManagerCommands: managerListId
  },
  people: [
    { personKey: 'E1', email: 'e1@example.invalid', managerPersonKey: 'M1', active: true, appRoles: ['Employee'] },
    { personKey: 'M1', email: 'm1@example.invalid', active: true, appRoles: ['Manager'] },
    { personKey: 'D1', email: 'd1@example.invalid', active: true, appRoles: ['DelegatedManager'] },
    { personKey: 'SA1', email: 'sa1@example.invalid', active: true, appRoles: ['SystemAdmin'] }
  ],
  delegations: [], stableKeyBindings: [], controlCases: [controlCase()],
  controlCaseStore: new Sec006AtomicControlCaseMemoryStore([controlCase()]),
  subjects: new Map([[subject.subjectKey, subject]]), approvedHistory: [], receipts: [], audit: [],
  recoveryJournal: []
});

const source = (patch: Partial<ISec006TrustedSource> = {}): ISec006TrustedSource => ({
  listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', itemId: 81, itemVersion: '1.0',
  authorEmail: 'sa1@example.invalid', createdUtc: '2026-11-01T11:59:00Z', ...patch
});

const command = (patch: Partial<ISec006CommandEnvelope> = {}): ISec006CommandEnvelope => ({
  commandKey: 'CMD-027D-001', commandType: 'CreateWorkplanAmendmentV2', subjectType: 'Workplan',
  subjectKey: 'WP|E1|2027', claimedPersonKey: 'E1', claimedPerformanceYear: 2027,
  expectedETag: '"1"', expectedRowVersionToken: 1,
  payload: { reason: 'Controlled correction.', controlReference: 'CONTROL-027D-001' },
  clientCorrelationKey: 'NON-AUTHORITATIVE', ...patch
});

const context = (
  sourcePatch: Partial<ISec006TrustedSource> = {},
  commandPatch: Partial<ISec006CommandEnvelope> = {}
): ISec006ProcessContext => ({
  source: source(sourcePatch), command: command(commandPatch), automationIdentity: automation,
  flowRunReference: 'FLOW-027D', trustedUtc
});

describe('KCF-KPI-027D baseline attack reproduction', () => {
  it('ATTACK-027D-01 rejects an empty amendment reason without accepted history', () => {
    const state = processorState();
    const result = new Sec006AutomationProcessor().process(context({}, {
      payload: { reason: '', controlReference: 'CONTROL-027D-001' }
    }), state);
    expect(result.receipt.outcome).toBe('Rejected');
    expect(result.mutationApplied).toBe(false);
    expect(state.approvedHistory).toHaveLength(0);
    expect(state.receipts.some(receipt => receipt.outcome === 'Accepted')).toBe(false);
  });

  it('ATTACK-027D-02 rejects reuse of one CONTROL case against the next Workplan version', () => {
    const state = processorState();
    const processor = new Sec006AutomationProcessor();
    const first = processor.process(context(), state);
    expect(first.receipt.outcome).toBe('Accepted');
    const versionTwo = state.subjects.get('WP|E1|2027') as ISec006CanonicalSubject;
    state.subjects.set(versionTwo.subjectKey, { ...versionTwo, state: 'Locked', locked: true });
    const replay = processor.process(context({ itemId: 82 }, {
      commandKey: 'CMD-027D-002', expectedETag: versionTwo.etag,
      expectedRowVersionToken: versionTwo.rowVersionToken
    }), state);
    expect(replay.receipt.outcome).toBe('Rejected');
    expect(replay.mutationApplied).toBe(false);
    expect(state.approvedHistory).toHaveLength(1);
  });

  it('ATTACK-027D-03 grants no broad private-root ACL to a command-scoped Q1 delegate', () => {
    const delegation = {
      delegationKey: 'DEL-Q1', delegatorPersonKey: 'M1', delegatePersonKey: 'D1', subjectPersonKey: 'E1',
      performanceYears: [2027], performanceYear: 2027, partition: 'Q1', resourceType: 'KCFKPI_QuarterReviews',
      resourceKey: 'QR|E1|2027|Q1', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1',
      commandTypes: ['SetQuarterManagerReview'], readOnly: false,
      startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z', active: true, revoked: false
    } as unknown as ISec006Delegation;
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [delegation], automation);
    const directDelegateGrantCount = plan.partitions.reduce((count, partition) => count
      + partition.grants.filter(grant => grant.principal === 'd1@example.invalid').length, 0);
    expect(directDelegateGrantCount).toBe(0);
  });

  it('ATTACK-027D-04 grants no standing human full control over private records', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [], automation);
    const systemAdminPrivateGrantCount = plan.partitions.reduce((count, partition) => count
      + partition.grants.filter(grant => grant.principal === 'sa1@example.invalid').length, 0);
    expect(systemAdminPrivateGrantCount).toBe(0);
  });
});

const aclDelegation = (patch: Partial<ISec006Delegation> = {}): ISec006Delegation => ({
  delegationKey: 'DEL-Q1', delegatorPersonKey: 'M1', delegatePersonKey: 'D1', subjectPersonKey: 'E1',
  performanceYear: 2027, partition: 'Q1', resourceType: 'KCFKPI_QuarterReviews',
  resourceKey: 'QR|E1|2027|Q1', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1',
  commandTypes: ['SetQuarterManagerReview'], readOnly: false,
  startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z',
  active: true, revoked: false, ...patch
});

describe('KCF-KPI-027D final Security remediation', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['spaces', '   '],
    ['tabs and newlines', '\t\n\r']
  ])('REPAIR-027D-01 rejects %s amendment reason before success evidence', (_label, reason) => {
    const state = processorState();
    const result = new Sec006AutomationProcessor().process(context({}, {
      payload: { reason, controlReference: 'CONTROL-027D-001' }
    }), state);
    expect(result.receipt.outcome).toBe('Rejected');
    expect(result.receipt.validationCode).toBe('AMENDMENT_REASON_REQUIRED');
    expect(result.mutationApplied).toBe(false);
    expect(state.approvedHistory).toHaveLength(0);
    expect(state.receipts.some(receipt => receipt.outcome === 'Accepted')).toBe(false);
    expect(state.audit.some(audit => audit.outcome === 'Accepted')).toBe(false);
  });

  it('REPAIR-027D-01 stores the trimmed reason in immutable history and complete Audit evidence', () => {
    const state = processorState();
    const result = new Sec006AutomationProcessor().process(context({}, {
      payload: { reason: '  Correct the approved target wording.  ', controlReference: 'CONTROL-027D-001' }
    }), state);
    expect(result.receipt.outcome).toBe('Accepted');
    expect(state.approvedHistory).toHaveLength(1);
    expect(state.approvedHistory[0].values).toMatchObject({
      approvedMarker: 'immutable-v1',
      amendmentReason: 'Correct the approved target wording.',
      amendmentControlCaseKey: 'CONTROL-027D-001',
      amendmentControlCaseConsumedAtUtc: trustedUtc
    });
    expect(state.audit[state.audit.length - 1]).toMatchObject({
      outcome: 'Accepted', actorEmail: 'sa1@example.invalid', sourceListId: managerListId,
      sourceItemId: 81, sourceItemVersion: '1.0'
    });
    expect(state.audit[state.audit.length - 1].after).toMatchObject({
      amendmentReason: 'Correct the approved target wording.',
      amendmentControlCaseKey: 'CONTROL-027D-001'
    });
  });

  it.each([
    ['wrong SubjectKey', { subjectKey: 'WP|E2|2027' }, 'AMENDMENT_CONTROL_CASE_SUBJECT_MISMATCH'],
    ['wrong WorkplanKey', { workplanKey: 'WP|E2|2027' }, 'AMENDMENT_CONTROL_CASE_SUBJECT_MISMATCH'],
    ['wrong version', { workplanVersion: 2 }, 'AMENDMENT_CONTROL_CASE_VERSION_MISMATCH'],
    ['wrong ETag', { expectedETag: '"99"' }, 'AMENDMENT_CONTROL_CASE_CONCURRENCY_MISMATCH'],
    ['wrong RowVersionToken', { expectedRowVersionToken: 99 }, 'AMENDMENT_CONTROL_CASE_CONCURRENCY_MISMATCH'],
    ['future validity', { validFromUtc: '2026-12-01T00:00:00Z' }, 'AMENDMENT_CONTROL_CASE_NOT_YET_VALID'],
    ['expired validity', { validToUtc: '2026-10-01T00:00:00Z' }, 'AMENDMENT_CONTROL_CASE_EXPIRED'],
    ['revoked state', {
      revoked: true, revokedAtUtc: '2026-10-20T00:00:00Z', revocationReason: 'Case withdrawn.'
    }, 'AMENDMENT_CONTROL_CASE_REVOKED'],
    ['consumed state', {
      active: false, consumedAtUtc: '2026-10-20T00:00:00Z', consumedCommandKey: 'CMD-OLD',
      consumedSourceListId: managerListId, consumedSourceItemId: 70, consumedSourceItemVersion: '1.0'
    }, 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED']
  ] as Array<[string, Partial<ISec006ControlCase>, string]>)
  ('REPAIR-027D-02 rejects CONTROL case with %s', (_label, casePatch, expectedCode) => {
    const state = processorState();
    state.controlCases = [controlCase(casePatch)];
    const result = new Sec006AutomationProcessor().process(context(), state);
    expect(result.receipt.outcome).toBe('Rejected');
    expect(result.receipt.validationCode).toBe(expectedCode);
    expect(result.mutationApplied).toBe(false);
    expect(state.approvedHistory).toHaveLength(0);
  });

  it('REPAIR-027D-02 rejects a version-1 case against canonical Workplan version 2', () => {
    const subject = lockedWorkplan({ workplanVersion: 2, etag: '"2"', rowVersionToken: 2 });
    const state = processorState(subject);
    const result = new Sec006AutomationProcessor().process(context({}, {
      expectedETag: '"2"', expectedRowVersionToken: 2
    }), state);
    expect(result.receipt.validationCode).toBe('AMENDMENT_CONTROL_CASE_VERSION_MISMATCH');
    expect(result.receipt.outcome).toBe('Rejected');
  });

  it('REPAIR-027D-02 consumes a valid case once and reports exact-source replay as Duplicate', () => {
    const state = processorState();
    const processor = new Sec006AutomationProcessor();
    const first = processor.process(context(), state);
    const immediateReplay = processor.process(context(), state);
    expect(first.receipt.outcome).toBe('Accepted');
    expect(immediateReplay.receipt.outcome).toBe('Duplicate');
    expect(immediateReplay.mutationApplied).toBe(false);
    expect(state.approvedHistory).toHaveLength(1);
    expect(state.controlCases[0]).toMatchObject({
      active: false, consumedAtUtc: trustedUtc, consumedCommandKey: 'CMD-027D-001',
      consumedSourceListId: managerListId, consumedSourceItemId: 81, consumedSourceItemVersion: '1.0'
    });
  });

  it('REPAIR-027D-02 rejects payload attempts to override server CONTROL bindings', () => {
    const state = processorState();
    const result = new Sec006AutomationProcessor().process(context({}, {
      payload: {
        reason: 'Attempted override.', controlReference: 'CONTROL-027D-001',
        workplanVersion: 99, workplanKey: 'WP|E2|2027'
      }
    }), state);
    expect(result.receipt.outcome).toBe('Rejected');
    expect(result.receipt.validationCode).toBe('PROTECTED_FIELD_CLAIM');
    expect(state.controlCases[0].consumedAtUtc).toBeUndefined();
  });

  it('REPAIR-027D-02 consumes the case and blocks duplicate amendment after partial I/O', () => {
    const state = processorState();
    const processor = new Sec006AutomationProcessor(undefined, {
      beforeWrite: stage => {
        if (stage === 'Audit') throw new Error('Synthetic Audit failure after CONTROL consumption.');
      }
    });
    const failed = processor.process(context(), state);
    expect(failed.receipt.outcome).toBe('RecoveryHold');
    expect(state.controlCases[0].consumedAtUtc).toBe(trustedUtc);
    expect(state.subjects.get('WP|E1|2027')?.transitionStatus).toBe('RecoveryHold');
    expect(state.approvedHistory).toHaveLength(0);
    const replay = new Sec006AutomationProcessor().process(context({ itemId: 83 }, {
      commandKey: 'CMD-027D-003'
    }), state);
    expect(replay.receipt.outcome).toBe('Rejected');
    expect(replay.receipt.validationCode).toBe('RECOVERY_HOLD_ACTIVE');
    expect(replay.mutationApplied).toBe(false);
    expect(state.approvedHistory).toHaveLength(0);
  });

  it('REPAIR-027D-03 records one exact Q1 delegated operation with no direct private grant', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [aclDelegation()], automation);
    expect(plan.delegatedOperations).toEqual([expect.objectContaining({
      delegationKey: 'DEL-Q1', partition: 'Q1', resourceType: 'KCFKPI_QuarterReviews',
      resourceKey: 'QR|E1|2027|Q1', subjectKey: 'QR|E1|2027|Q1',
      commandTypes: ['SetQuarterManagerReview'], directPrivateRootGrant: false,
      mediatedByAutomation: true
    })]);
    const directGrantCount = plan.partitions.reduce((count, partition) => count
      + partition.grants.filter(grant => grant.principal === 'd1@example.invalid').length, 0);
    expect(directGrantCount).toBe(0);
  });

  it.each([
    ['wrong year', { performanceYear: 2026 }],
    ['before start', { startUtc: '2026-12-01T00:00:00Z' }],
    ['expired', { endUtc: '2026-10-01T00:00:00Z' }],
    ['revoked', { revoked: true, revokedAtUtc: '2026-10-20T00:00:00Z' }],
    ['deactivated', { active: false }],
    ['self-delegated', { delegatePersonKey: 'E1' }],
    ['read-only with command authority', { readOnly: true, commandTypes: ['SetQuarterManagerReview'] }]
  ] as Array<[string, Partial<ISec006Delegation>]>)
  ('REPAIR-027D-03 creates no delegated operation for %s scope', (_label, delegationPatch) => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [aclDelegation(delegationPatch)], automation);
    expect(plan.delegatedOperations).toHaveLength(0);
  });

  it('REPAIR-027D-03 permits readback-only scope without command authority', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [aclDelegation({
      readOnly: true, commandTypes: []
    })], automation);
    expect(plan.delegatedOperations).toEqual([expect.objectContaining({
      commandTypes: [], readbackAllowed: true, directPrivateRootGrant: false
    })]);
  });

  it('REPAIR-027D-03 removes delegated scope after manager reassignment', () => {
    const reassignedPeople: ISec006AclPerson[] = [
      ...people.map(person => person.personKey === 'E1' ? { ...person, managerPersonKey: 'M2' } : person),
      { personKey: 'M2', email: 'm2@example.invalid', active: true, appRoles: ['Manager'] }
    ];
    const plan = buildSec006AclPlan(2027, trustedUtc, reassignedPeople, [aclDelegation()], automation);
    expect(plan.delegatedOperations).toHaveLength(0);
  });

  it('REPAIR-027D-03 keeps ACL and processor command scope aligned', () => {
    const quarter = lockedWorkplan({
      subjectKey: 'QR|E1|2027|Q1', subjectType: 'QuarterReview', state: 'Submitted', locked: false
    });
    const state = processorState(quarter);
    state.delegations = [{
      delegationKey: 'DEL-Q1', delegatorPersonKey: 'M1', delegatePersonKey: 'D1',
      subjectPersonKey: 'E1', performanceYear: 2027, partition: 'Q1',
      resourceType: 'KCFKPI_QuarterReviews', resourceKey: 'QR|E1|2027|Q1',
      subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', active: true, revoked: false,
      startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z',
      subjectTypes: ['QuarterReview'], subjectKeys: ['QR|E1|2027|Q1'],
      commandTypes: ['SetQuarterManagerReview'], readbackAllowed: true
    } as ISec006DelegationRecord];
    const accepted = new Sec006AutomationProcessor().process(context({
      authorEmail: 'd1@example.invalid'
    }, {
      commandType: 'SetQuarterManagerReview', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1',
      payload: { decisionComment: 'Exact Q1 scope.', proposedAssessment: 'Exceeds' }
    }), state);
    expect(accepted.receipt.outcome).toBe('Accepted');

    const adjacentState = processorState(quarter);
    adjacentState.delegations = state.delegations;
    const rejected = new Sec006AutomationProcessor().process(context({
      authorEmail: 'd1@example.invalid', itemId: 84
    }, {
      commandKey: 'CMD-027D-004', commandType: 'RequestQuarterChanges',
      subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', payload: { reason: 'Wrong command.' }
    }), adjacentState);
    expect(rejected.receipt.validationCode).toBe('AUTHORITY_DENIED');
  });

  it.each(SEC006_PRIVATE_ROOTS)(
    'REPAIR-027D-04 denies SA1 direct POST, PATCH and DELETE on %s', root => {
      const plan = buildSec006AclPlan(2027, trustedUtc, people, [], automation);
      (['POST', 'PATCH', 'DELETE'] as const).forEach(verb => {
        expect(isSec006DirectMutationAllowed(plan, 'sa1@example.invalid', root, verb)).toBe(false);
      });
    }
  );

  it('REPAIR-027D-04 retains limited diagnostics without private canonical access', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [], automation);
    expect(plan.systemAdminDiagnostics).toEqual([{
      principal: 'sa1@example.invalid', permission: 'ReadOnly',
      scopes: ['Configuration', 'ProcessorHealth', 'RecoveryStatus'],
      privateCanonicalAccess: false, canonicalWriteAllowed: false
    }]);
    expect(plan.breakGlass).toMatchObject({
      standingHumanAccess: false, mediatedByAutomation: true,
      requiresActiveControlCase: true, immutableAuditRequired: true
    });
  });

  it('REPAIR-027D-04 permits A1 processing ACLs but not A1-originated business decisions', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [], automation);
    expect(isSec006DirectMutationAllowed(plan, automation, 'KCFKPI_Workplans', 'PATCH')).toBe(false);
    expect(isSec006GovernedProcessorMutationAllowed(plan, automation, 'KCFKPI_Workplans', 'PATCH')).toBe(true);
    const state = processorState(lockedWorkplan({ state: 'Submitted', locked: false }));
    const originatedByA1 = new Sec006AutomationProcessor().process(context({
      authorEmail: automation
    }, {
      commandType: 'ApproveAndLockWorkplan', payload: {}
    }), state);
    expect(originatedByA1.receipt.outcome).toBe('Rejected');
    expect(originatedByA1.receipt.validationCode).toBe('ACTOR_NOT_ACTIVE');
  });
});
