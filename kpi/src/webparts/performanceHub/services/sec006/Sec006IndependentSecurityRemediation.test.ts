import {
  Sec006AutomationProcessor,
  type ISec006CanonicalSubject,
  type ISec006CommandEnvelope,
  type ISec006DelegationRecord,
  type ISec006ProcessContext,
  type ISec006ProcessorState,
  type ISec006TrustedSource
} from './Sec006AutomationProcessor';
import {
  Sec006AtomicControlCaseMemoryStore,
  type ISec006AuthoritativeControlCaseStore,
  type ISec006ControlCase
} from './Sec006ControlCaseStore';
import {
  SEC006_PERMISSION_LEVELS,
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

const workplan = (patch: Partial<ISec006CanonicalSubject> = {}): ISec006CanonicalSubject => ({
  subjectKey: 'WP|E1|2027', subjectType: 'Workplan', personKey: 'E1', performanceYear: 2027,
  etag: '"1"', rowVersionToken: 1, state: 'Locked', workplanVersion: 1, locked: true,
  transitionStatus: 'Ready', values: { approvedMarker: 'immutable-v1' }, ...patch
});

const quarter = (patch: Partial<ISec006CanonicalSubject> = {}): ISec006CanonicalSubject => ({
  subjectKey: 'QR|E1|2027|Q1', subjectType: 'QuarterReview', personKey: 'E1', performanceYear: 2027,
  etag: '"1"', rowVersionToken: 1, state: 'Submitted', workplanVersion: 1, locked: false,
  transitionStatus: 'Ready', values: { employeeMarker: 'unchanged' }, ...patch
});

const controlCase = (patch: Partial<ISec006ControlCase> = {}): ISec006ControlCase => ({
  controlCaseKey: 'CONTROL-027E-001', controlReference: 'CONTROL-027E-001',
  authorisedAction: 'CreateWorkplanAmendmentV2', subjectKey: 'WP|E1|2027',
  workplanKey: 'WP|E1|2027', workplanVersion: 1, expectedETag: '"1"', expectedRowVersionToken: 1,
  storageETag: '"1"', storageRowVersionToken: 1, active: true,
  validFromUtc: '2026-10-01T00:00:00Z', validToUtc: '2027-10-31T23:59:59Z', revoked: false,
  ...patch
});

const delegation = (patch: Partial<ISec006DelegationRecord> = {}): ISec006DelegationRecord => ({
  delegationKey: 'DEL-027E-Q1', delegatorPersonKey: 'M1', delegatePersonKey: 'D1',
  subjectPersonKey: 'E1', performanceYear: 2027, partition: 'Q1',
  resourceType: 'KCFKPI_QuarterReviews', resourceKey: 'QR|E1|2027|Q1',
  subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', active: true, revoked: false,
  startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z',
  subjectTypes: ['QuarterReview'], subjectKeys: ['QR|E1|2027|Q1'],
  commandTypes: ['SetQuarterManagerReview'], readbackAllowed: true,
  ...patch
});

const aclDelegation = (patch: Partial<ISec006Delegation> = {}): ISec006Delegation => ({
  delegationKey: 'DEL-027E-Q1', delegatorPersonKey: 'M1', delegatePersonKey: 'D1',
  subjectPersonKey: 'E1', performanceYear: 2027, partition: 'Q1',
  resourceType: 'KCFKPI_QuarterReviews', resourceKey: 'QR|E1|2027|Q1',
  subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1',
  commandTypes: ['SetQuarterManagerReview'], readOnly: false,
  startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z',
  active: true, revoked: false, ...patch
});

const processorState = (
  subject: ISec006CanonicalSubject,
  caseSnapshot: readonly ISec006ControlCase[] = [],
  controlCaseStore: ISec006AuthoritativeControlCaseStore = new Sec006AtomicControlCaseMemoryStore(caseSnapshot),
  delegations: readonly ISec006DelegationRecord[] = []
): ISec006ProcessorState => ({
  trustedSourceListIds: {
    KCFKPI_EmployeeCommands: employeeListId,
    KCFKPI_ManagerCommands: managerListId
  },
  people: people.map(person => ({ ...person })),
  delegations: delegations.map(item => ({ ...item })), stableKeyBindings: [],
  controlCases: caseSnapshot.map(item => ({ ...item })), controlCaseStore,
  subjects: new Map([[subject.subjectKey, { ...subject, values: { ...subject.values } }]]),
  approvedHistory: [], receipts: [], audit: [], recoveryJournal: []
});

const amendmentContext = (
  itemId: number,
  commandKey: string,
  reason: string = 'Controlled independent correction.'
): ISec006ProcessContext => ({
  source: {
    listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', itemId, itemVersion: '1.0',
    authorEmail: 'sa1@example.invalid', createdUtc: '2026-11-01T11:59:00Z'
  },
  command: {
    commandKey, commandType: 'CreateWorkplanAmendmentV2', subjectType: 'Workplan',
    subjectKey: 'WP|E1|2027', claimedPersonKey: 'E1', claimedPerformanceYear: 2027,
    expectedETag: '"1"', expectedRowVersionToken: 1,
    payload: { reason, controlReference: 'CONTROL-027E-001' }, clientCorrelationKey: 'UNTRUSTED'
  },
  automationIdentity: automation, flowRunReference: `FLOW-${itemId}`, trustedUtc
});

const delegatedContext = (
  itemId: number,
  commandPatch: Partial<ISec006CommandEnvelope> = {}
): ISec006ProcessContext => ({
  source: {
    listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', itemId, itemVersion: '1.0',
    authorEmail: 'd1@example.invalid', createdUtc: '2026-11-01T11:59:00Z'
  } as ISec006TrustedSource,
  command: {
    commandKey: `CMD-DELEGATED-${itemId}`, commandType: 'SetQuarterManagerReview',
    subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1',
    claimedPersonKey: 'E1', claimedPerformanceYear: 2027, expectedETag: '"1"',
    expectedRowVersionToken: 1, payload: { decisionComment: 'Scoped Q1 review.', proposedAssessment: 'Exceeds' },
    clientCorrelationKey: 'UNTRUSTED', ...commandPatch
  },
  automationIdentity: automation, flowRunReference: `FLOW-${itemId}`, trustedUtc
});

describe('KCF-KPI-027E independent Security findings remediation', () => {
  it('027E-01 permits exactly one concurrent consume from two independent processors and snapshots', async () => {
    const snapshot = controlCase();
    const store = new Sec006AtomicControlCaseMemoryStore([snapshot]);
    const left = processorState(workplan(), [{ ...snapshot }], store);
    const right = processorState(workplan(), [{ ...snapshot }], store);
    const results = await Promise.all([
      Promise.resolve().then(() => new Sec006AutomationProcessor()
        .process(amendmentContext(901, 'CMD-027E-901'), left)),
      Promise.resolve().then(() => new Sec006AutomationProcessor()
        .process(amendmentContext(902, 'CMD-027E-902'), right))
    ]);
    expect(results.filter(result => result.receipt.outcome === 'Accepted')).toHaveLength(1);
    expect(results.filter(result => result.receipt.outcome === 'Rejected')).toHaveLength(1);
    expect(left.approvedHistory.length + right.approvedHistory.length).toBe(1);
    expect([...left.receipts, ...right.receipts].filter(receipt => receipt.outcome === 'Accepted')).toHaveLength(1);
  });

  it('027E-02 rejects the losing stale CONTROL snapshot before canonical mutation', () => {
    const snapshot = controlCase();
    const store = new Sec006AtomicControlCaseMemoryStore([snapshot]);
    const winner = processorState(workplan(), [{ ...snapshot }], store);
    const loser = processorState(workplan(), [{ ...snapshot }], store);
    new Sec006AutomationProcessor().process(amendmentContext(903, 'CMD-027E-903'), winner);
    const result = new Sec006AutomationProcessor().process(amendmentContext(904, 'CMD-027E-904'), loser);
    expect(result.receipt.validationCode).toBe('AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED');
    expect(result.mutationApplied).toBe(false);
    expect(loser.subjects.get('WP|E1|2027')).toMatchObject({ state: 'Locked', workplanVersion: 1 });
  });

  it('027E-03 holds a consumed case after partial I/O and replay creates no duplicate amendment', () => {
    const snapshot = controlCase();
    const store = new Sec006AtomicControlCaseMemoryStore([snapshot]);
    const first = processorState(workplan(), [{ ...snapshot }], store);
    const failed = new Sec006AutomationProcessor(undefined, {
      beforeWrite: stage => { if (stage === 'Audit') throw new Error('Synthetic accepted-Audit failure.'); }
    }).process(amendmentContext(905, 'CMD-027E-905'), first);
    const replayState = processorState(workplan(), [{ ...snapshot }], store);
    const replay = new Sec006AutomationProcessor().process(amendmentContext(906, 'CMD-027E-906'), replayState);
    expect(failed.receipt.outcome).toBe('RecoveryHold');
    expect(replay.receipt.validationCode).toBe('AMENDMENT_CONTROL_CASE_RECOVERY_HOLD');
    expect(first.approvedHistory.length + replayState.approvedHistory.length).toBe(0);
    expect([...first.receipts, ...replayState.receipts].filter(receipt => receipt.outcome === 'Accepted')).toHaveLength(0);
  });

  it('027E-04 preserves immutable consumed source identity, timestamp and storage version', () => {
    const snapshot = controlCase();
    const store = new Sec006AtomicControlCaseMemoryStore([snapshot]);
    const first = processorState(workplan(), [{ ...snapshot }], store);
    new Sec006AutomationProcessor().process(amendmentContext(907, 'CMD-027E-907'), first);
    const consumed = store.read(snapshot.controlCaseKey)!;
    const second = processorState(workplan(), [{ ...snapshot }], store);
    new Sec006AutomationProcessor().process(amendmentContext(908, 'CMD-027E-908'), second);
    expect(store.read(snapshot.controlCaseKey)).toEqual(consumed);
    expect(consumed).toMatchObject({
      consumedAtUtc: trustedUtc, consumedCommandKey: 'CMD-027E-907', consumedSourceItemId: 907,
      consumedSourceItemVersion: '1.0', storageRowVersionToken: 2
    });
  });

  it('027E-05 rejects a revoked delegation inside its otherwise active date window', () => {
    const current = processorState(quarter(), [], undefined, [delegation({
      revoked: true, revokedAtUtc: '2026-10-20T00:00:00Z', revocationReason: 'CONTROL revoked.'
    })]);
    const result = new Sec006AutomationProcessor().process(delegatedContext(909), current);
    expect(result.receipt.validationCode).toBe('AUTHORITY_DENIED');
    expect(result.mutationApplied).toBe(false);
  });

  it('027E-06 rejects a client forged revoked=false claim', () => {
    const current = processorState(quarter(), [], undefined, [delegation({
      revoked: true, revokedAtUtc: '2026-10-20T00:00:00Z', revocationReason: 'CONTROL revoked.'
    })]);
    const result = new Sec006AutomationProcessor().process(delegatedContext(910, {
      payload: { decisionComment: 'Attack.', proposedAssessment: 'Exceeds', revoked: false }
    }), current);
    expect(result.receipt.validationCode).toBe('PROTECTED_FIELD_CLAIM');
    expect(result.mutationApplied).toBe(false);
  });

  it('027E-07 blocks the next action after server-side delegation revocation', () => {
    const activeDelegation = delegation();
    const current = processorState(quarter(), [], undefined, [activeDelegation]);
    const first = new Sec006AutomationProcessor().process(delegatedContext(911), current);
    expect(first.receipt.outcome).toBe('Accepted');
    current.delegations[0] = {
      ...current.delegations[0], revoked: true, revokedAtUtc: '2026-11-01T12:01:00Z',
      revocationReason: 'Manager revoked delegated authority.'
    };
    const after = current.subjects.get('QR|E1|2027|Q1')!;
    const second = new Sec006AutomationProcessor().process(delegatedContext(912, {
      expectedETag: after.etag, expectedRowVersionToken: after.rowVersionToken
    }), current);
    expect(second.receipt.validationCode).toBe('AUTHORITY_DENIED');
    expect(second.mutationApplied).toBe(false);
  });

  it('027E-08 fails closed when revocation metadata contradicts revoked=false', () => {
    const current = processorState(quarter(), [], undefined, [delegation({
      revoked: false, revokedAtUtc: '2026-10-20T00:00:00Z', revocationReason: 'Revoked in authority store.'
    })]);
    expect(new Sec006AutomationProcessor().process(delegatedContext(913), current).receipt.validationCode)
      .toBe('AUTHORITY_DENIED');
  });

  it.each([
    ['Q1 delegation targeting Q2', { subjectKey: 'QR|E1|2027|Q2', subjectKeys: ['QR|E1|2027|Q2'], resourceKey: 'QR|E1|2027|Q2' }],
    ['wrong partition', { partition: 'Q2' }],
    ['wrong resource type', { resourceType: 'KCFKPI_Workplans' }],
    ['wrong resource key', { resourceKey: 'QR|E1|2027|Q1|OTHER' }],
    ['wrong SubjectKey', { subjectKey: 'QR|E1|2027|Q1|OTHER', subjectKeys: ['QR|E1|2027|Q1|OTHER'] }],
    ['wrong subject person', { subjectPersonKey: 'E2' }],
    ['wrong subject type', { subjectType: 'Workplan', subjectTypes: ['Workplan'] }],
    ['invalid command for subject type', { commandTypes: ['ApproveAndLockWorkplan'] }],
    ['unrelated performance year', { performanceYear: 2026 }]
  ] as Array<[string, Partial<ISec006DelegationRecord>]>)('027E cross-binding rejects %s', (_label, patch) => {
    const current = processorState(quarter(), [], undefined, [delegation(patch)]);
    const result = new Sec006AutomationProcessor().process(delegatedContext(920), current);
    expect(result.receipt.validationCode).toBe('AUTHORITY_DENIED');
    expect(result.mutationApplied).toBe(false);
    expect(current.subjects.get('QR|E1|2027|Q1')?.values).toEqual({ employeeMarker: 'unchanged' });
  });

  it('027E-18 rejects both expired and revoked exact delegation bindings', () => {
    const variants = [
      delegation({ endUtc: '2026-10-31T23:59:59Z' }),
      delegation({ revoked: true, revokedAtUtc: trustedUtc, revocationReason: 'Revoked.' })
    ];
    variants.forEach((item, index) => {
      const current = processorState(quarter(), [], undefined, [item]);
      const result = new Sec006AutomationProcessor().process(delegatedContext(930 + index), current);
      expect(result.receipt.validationCode).toBe('AUTHORITY_DENIED');
      expect(result.mutationApplied).toBe(false);
    });
  });

  it('027E-19 keeps ACL and processor effective scopes identical for poisoned binding data', () => {
    const poisonedProcessor = delegation({ resourceKey: 'QR|E1|2027|Q2' });
    const poisonedAcl = aclDelegation({ resourceKey: 'QR|E1|2027|Q2' });
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [poisonedAcl], automation);
    const current = processorState(quarter(), [], undefined, [poisonedProcessor]);
    const result = new Sec006AutomationProcessor().process(delegatedContext(940), current);
    expect(plan.delegatedOperations).toHaveLength(0);
    expect(result.receipt.validationCode).toBe('AUTHORITY_DENIED');
    expect(result.mutationApplied).toBe(false);
  });

  it('027E-20 permits A1 Audit POST only through the governed processor route', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [], automation);
    expect(SEC006_PERMISSION_LEVELS['KCF KPI Append Only Automation']).toBe('0x000000300C031063');
    expect(isSec006GovernedProcessorMutationAllowed(plan, automation, 'KCFKPI_Audit', 'POST')).toBe(true);
    expect(isSec006DirectMutationAllowed(plan, automation, 'KCFKPI_Audit', 'POST')).toBe(false);
  });

  it('027E-21 denies A1 Audit PATCH and DELETE even through the governed route', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [], automation);
    expect(isSec006GovernedProcessorMutationAllowed(plan, automation, 'KCFKPI_Audit', 'PATCH')).toBe(false);
    expect(isSec006GovernedProcessorMutationAllowed(plan, automation, 'KCFKPI_Audit', 'DELETE')).toBe(false);
  });

  it('027E-22 permits governed receipt creation and denies receipt PATCH and DELETE', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [], automation);
    expect(isSec006GovernedProcessorMutationAllowed(plan, automation, 'KCFKPI_CommandReceipts', 'POST')).toBe(true);
    expect(isSec006GovernedProcessorMutationAllowed(plan, automation, 'KCFKPI_CommandReceipts', 'PATCH')).toBe(false);
    expect(isSec006GovernedProcessorMutationAllowed(plan, automation, 'KCFKPI_CommandReceipts', 'DELETE')).toBe(false);
  });

  it('027E-23 denies SA1 and human mutation of Audit and receipts on every route', () => {
    const plan = buildSec006AclPlan(2027, trustedUtc, people, [], automation);
    ['sa1@example.invalid', 'e1@example.invalid'].forEach(principal => {
      (['KCFKPI_Audit', 'KCFKPI_CommandReceipts'] as const).forEach(root => {
        (['POST', 'PATCH', 'DELETE'] as const).forEach(verb => {
          expect(isSec006DirectMutationAllowed(plan, principal, root, verb)).toBe(false);
          expect(isSec006GovernedProcessorMutationAllowed(plan, principal, root, verb)).toBe(false);
        });
      });
    });
  });

  it.each(['\u200b', '\u2060', '\u180e'])('027E rejects visually blank reason %p before persistence', reason => {
    const snapshot = controlCase();
    const current = processorState(workplan(), [snapshot]);
    const before = current.subjects.get('WP|E1|2027');
    const result = new Sec006AutomationProcessor().process(amendmentContext(950, 'CMD-027E-950', reason), current);
    expect(result.receipt.outcome).toBe('Rejected');
    expect(result.receipt.validationCode).toBe('AMENDMENT_REASON_REQUIRED');
    expect(current.subjects.get('WP|E1|2027')).toBe(before);
    expect(current.approvedHistory).toHaveLength(0);
    expect(current.receipts).toHaveLength(0);
    expect(current.audit).toHaveLength(0);
  });

  it('027E-27 rejects ignorable mixtures and preserves one bounded human-readable reason', () => {
    ['\u200b \t\u2060\n\u180e', '\r\n\u180e\u2060 \u200b\t'].forEach((reason, index) => {
      const snapshot = controlCase();
      const rejectedState = processorState(workplan(), [snapshot]);
      const rejected = new Sec006AutomationProcessor().process(
        amendmentContext(960 + index, `CMD-027E-${960 + index}`, reason), rejectedState
      );
      expect(rejected.receipt.validationCode).toBe('AMENDMENT_REASON_REQUIRED');
      expect(rejectedState.approvedHistory).toHaveLength(0);
      expect(rejectedState.receipts).toHaveLength(0);
    });
    const snapshot = controlCase();
    const acceptedState = processorState(workplan(), [snapshot]);
    const accepted = new Sec006AutomationProcessor().process(
      amendmentContext(962, 'CMD-027E-962', '\u200b\t Valid human reason. \n\u2060'), acceptedState
    );
    expect(accepted.receipt.outcome).toBe('Accepted');
    expect(acceptedState.approvedHistory[0].values.amendmentReason).toBe('Valid human reason.');
    expect(acceptedState.audit.find(item => item.outcome === 'Accepted')?.after.amendmentReason)
      .toBe('Valid human reason.');
  });
});
