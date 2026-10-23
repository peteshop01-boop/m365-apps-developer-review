import {
  normaliseSec006HumanReason,
  Sec006AutomationProcessor,
  type ISec006CanonicalSubject,
  type ISec006DelegationRecord,
  type ISec006ProcessContext,
  type ISec006ProcessResult,
  type ISec006ProcessorState
} from './Sec006AutomationProcessor';
import {
  Sec006AtomicControlCaseMemoryStore,
  type ISec006AuthoritativeControlCaseStore,
  type ISec006ControlCase
} from './Sec006ControlCaseStore';
import {
  buildSec006AclPlan,
  type ISec006AclPerson,
  type ISec006Delegation
} from './Sec006AclPlan';
import { resolveSec006GovernedCommand } from './Sec006DelegationScope';
import {
  EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES,
  EMPLOYEE_V2_MANAGER_COMMAND_TYPES
} from '../EmployeeWorkplanV2PhysicalSchema';
import type {
  EmployeeV2CommandType,
  EmployeeV2SubjectType
} from '../../models/EmployeeWorkplanV2PersistenceModels';

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

const workplan = (): ISec006CanonicalSubject => ({
  subjectKey: 'WP|E1|2027', subjectType: 'Workplan', personKey: 'E1', performanceYear: 2027,
  etag: '"1"', rowVersionToken: 1, state: 'Locked', workplanVersion: 1, locked: true,
  transitionStatus: 'Ready', values: { approvedMarker: 'immutable-v1' }
});

const safeControlCase = (patch: Partial<ISec006ControlCase> = {}): ISec006ControlCase => ({
  controlCaseKey: 'CONTROL-027F-001', controlReference: 'CONTROL-027F-001',
  authorisedAction: 'CreateWorkplanAmendmentV2', subjectKey: 'WP|E1|2027',
  workplanKey: 'WP|E1|2027', workplanVersion: 1, expectedETag: '"1"', expectedRowVersionToken: 1,
  storageETag: '"1"', storageRowVersionToken: 1, active: true,
  validFromUtc: '2026-10-01T00:00:00Z', validToUtc: '2027-10-31T23:59:59Z', revoked: false,
  ...patch
});

const processorState = (
  snapshot: ISec006ControlCase,
  authoritative: ISec006ControlCase = snapshot,
  store: ISec006AuthoritativeControlCaseStore = new Sec006AtomicControlCaseMemoryStore([{ ...authoritative }])
): ISec006ProcessorState => {
  const subject = workplan();
  return {
    trustedSourceListIds: {
      KCFKPI_EmployeeCommands: employeeListId,
      KCFKPI_ManagerCommands: managerListId
    },
    people: people.map(person => ({ ...person })), delegations: [], stableKeyBindings: [],
    controlCases: [{ ...snapshot }],
    controlCaseStore: store,
    subjects: new Map([[subject.subjectKey, subject]]),
    approvedHistory: [], receipts: [], audit: [], recoveryJournal: []
  };
};

const amendmentContext = (itemId: number, reason: string): ISec006ProcessContext => ({
  source: {
    listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', itemId, itemVersion: '1.0',
    authorEmail: 'sa1@example.invalid', createdUtc: '2026-11-01T11:59:00Z'
  },
  command: {
    commandKey: `CMD-027F-${itemId}`, commandType: 'CreateWorkplanAmendmentV2',
    subjectType: 'Workplan', subjectKey: 'WP|E1|2027', claimedPersonKey: 'E1',
    claimedPerformanceYear: 2027, expectedETag: '"1"', expectedRowVersionToken: 1,
    payload: { reason, controlReference: 'CONTROL-027F-001' }, clientCorrelationKey: 'UNTRUSTED'
  },
  automationIdentity: automation, flowRunReference: `FLOW-${itemId}`, trustedUtc
});

interface IAmendmentRun {
  before: ISec006CanonicalSubject | undefined;
  result: ISec006ProcessResult;
  state: ISec006ProcessorState;
}

const runAmendment = (
  authoritative: ISec006ControlCase,
  itemId: number,
  reason: string = 'Human correction.'
): IAmendmentRun => {
  const snapshot = safeControlCase();
  const state = processorState(snapshot, authoritative);
  const before = state.subjects.get('WP|E1|2027');
  const result = new Sec006AutomationProcessor().process(amendmentContext(itemId, reason), state);
  return { before, result, state };
};

const authoritativeUnsafeCases: ReadonlyArray<{
  label: string;
  patch: Partial<ISec006ControlCase>;
  expectedCode: string;
}> = [
  { label: 'revoked flag', patch: { revoked: true }, expectedCode: 'AMENDMENT_CONTROL_CASE_REVOKED' },
  {
    label: 'revocation timestamp', patch: { revokedAtUtc: '2026-10-20T00:00:00Z' },
    expectedCode: 'AMENDMENT_CONTROL_CASE_REVOKED'
  },
  {
    label: 'revocation reason', patch: { revocationReason: 'CONTROL revoked.' },
    expectedCode: 'AMENDMENT_CONTROL_CASE_REVOKED'
  },
  {
    label: 'future validity', patch: { validFromUtc: '2026-11-02T00:00:00Z' },
    expectedCode: 'AMENDMENT_CONTROL_CASE_NOT_YET_VALID'
  },
  {
    label: 'expired validity', patch: { validToUtc: '2026-10-31T23:59:59Z' },
    expectedCode: 'AMENDMENT_CONTROL_CASE_EXPIRED'
  },
  {
    label: 'subject binding divergence',
    patch: { subjectKey: 'WP|E2|2027', workplanKey: 'WP|E2|2027' },
    expectedCode: 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH'
  },
  {
    label: 'CONTROL reference divergence', patch: { controlReference: 'CONTROL-027F-DIVERGENT' },
    expectedCode: 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH'
  }
];

const newlyProvedInvisibleReasons: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'U+0000 NULL', value: '\u0000' },
  { label: 'U+070F SYRIAC ABBREVIATION MARK', value: '\u070f' },
  { label: 'U+FFF0 unassigned default-ignorable', value: '\ufff0' },
  { label: 'U+1BCA0 SHORTHAND FORMAT LETTER OVERLAP', value: '\u{1bca0}' },
  { label: 'U+1D173 MUSICAL SYMBOL BEGIN BEAM', value: '\u{1d173}' },
  { label: 'base-less U+0301 COMBINING ACUTE ACCENT', value: '\u0301' }
];

const aclDelegation = (
  subjectType: ISec006Delegation['subjectType'],
  subjectKey: string,
  resourceType: ISec006Delegation['resourceType'],
  commandType: ISec006Delegation['commandTypes'][number],
  partition: ISec006Delegation['partition'] = 'annual'
): ISec006Delegation => ({
  delegationKey: `DEL-027F-${commandType}`, delegatorPersonKey: 'M1', delegatePersonKey: 'D1',
  subjectPersonKey: 'E1', performanceYear: 2027, partition, resourceType,
  resourceKey: subjectKey, subjectType, subjectKey, commandTypes: [commandType], readOnly: false,
  startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z', active: true, revoked: false
});

const processorDelegation = (
  subjectType: EmployeeV2SubjectType,
  subjectKey: string,
  resourceType: ISec006DelegationRecord['resourceType'],
  commandType: EmployeeV2CommandType,
  partition: ISec006DelegationRecord['partition']
): ISec006DelegationRecord => ({
  delegationKey: `DEL-027F-PROCESSOR-${commandType}`, delegatorPersonKey: 'M1', delegatePersonKey: 'D1',
  subjectPersonKey: 'E1', performanceYear: 2027, partition, resourceType, resourceKey: subjectKey,
  subjectType, subjectKey, active: true, revoked: false,
  startUtc: '2026-10-01T00:00:00Z', endUtc: '2027-10-31T23:59:59Z',
  subjectTypes: [subjectType], subjectKeys: [subjectKey], commandTypes: [commandType], readbackAllowed: true
});

const delegatedSubject = (subjectType: 'Workplan' | 'QuarterReview'): ISec006CanonicalSubject => {
  const subjectKey = subjectType === 'Workplan' ? 'WP|E1|2027' : 'QR|E1|2027|Q1';
  return {
    subjectKey, subjectType, personKey: 'E1', performanceYear: 2027,
    etag: '"1"', rowVersionToken: 1, state: 'Submitted', workplanVersion: 1, locked: false,
    transitionStatus: 'Ready', values: { unchanged: true }
  };
};

const delegatedProcessorState = (
  subject: ISec006CanonicalSubject,
  delegation: ISec006DelegationRecord
): ISec006ProcessorState => ({
  trustedSourceListIds: {
    KCFKPI_EmployeeCommands: employeeListId,
    KCFKPI_ManagerCommands: managerListId
  },
  people: people.map(person => ({ ...person })), delegations: [{ ...delegation }], stableKeyBindings: [],
  controlCases: [], controlCaseStore: new Sec006AtomicControlCaseMemoryStore([]),
  subjects: new Map([[subject.subjectKey, subject]]),
  approvedHistory: [], receipts: [], audit: [], recoveryJournal: []
});

const delegatedManagerContext = (
  itemId: number,
  commandType: EmployeeV2CommandType,
  subject: ISec006CanonicalSubject
): ISec006ProcessContext => ({
  source: {
    listId: managerListId, listTitle: 'KCFKPI_ManagerCommands', itemId, itemVersion: '1.0',
    authorEmail: 'd1@example.invalid', createdUtc: '2026-11-01T11:59:00Z'
  },
  command: {
    commandKey: `CMD-027F-DELEGATED-${itemId}`, commandType, subjectType: subject.subjectType,
    subjectKey: subject.subjectKey, claimedPersonKey: 'E1', claimedPerformanceYear: 2027,
    expectedETag: subject.etag, expectedRowVersionToken: subject.rowVersionToken,
    payload: {}, clientCorrelationKey: 'UNTRUSTED'
  },
  automationIdentity: automation, flowRunReference: `FLOW-DELEGATED-${itemId}`, trustedUtc
});

interface ICommandParityCase {
  commandType: EmployeeV2CommandType;
  subjectType: EmployeeV2SubjectType;
  subjectKey: string;
  resourceType: ISec006DelegationRecord['resourceType'];
  partition: ISec006Delegation['partition'];
  delegatedManagerAllowed: boolean;
}

const commandParityCases: readonly ICommandParityCase[] = [
  { commandType: 'CreateWorkplanDraft', subjectType: 'Workplan', subjectKey: 'WP|E1|2027', resourceType: 'KCFKPI_Workplans', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'UpdateWorkplanDraft', subjectType: 'Workplan', subjectKey: 'WP|E1|2027', resourceType: 'KCFKPI_Workplans', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan', subjectKey: 'WP|E1|2027', resourceType: 'KCFKPI_Workplans', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'SetCoreWeightingV2', subjectType: 'Workplan', subjectKey: 'WP|E1|2027', resourceType: 'KCFKPI_Workplans', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'SubmitWorkplan', subjectType: 'Workplan', subjectKey: 'WP|E1|2027', resourceType: 'KCFKPI_Workplans', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'RequestWorkplanChanges', subjectType: 'Workplan', subjectKey: 'WP|E1|2027', resourceType: 'KCFKPI_Workplans', partition: 'annual', delegatedManagerAllowed: true },
  { commandType: 'ApproveAndLockWorkplan', subjectType: 'Workplan', subjectKey: 'WP|E1|2027', resourceType: 'KCFKPI_Workplans', partition: 'annual', delegatedManagerAllowed: true },
  { commandType: 'CreateWorkplanAmendmentV2', subjectType: 'Workplan', subjectKey: 'WP|E1|2027', resourceType: 'KCFKPI_Workplans', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'UpsertWorkplanItem', subjectType: 'WorkplanItem', subjectKey: 'WPI|E1|2027|1', resourceType: 'KCFKPI_WorkplanItems', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'DeactivateWorkplanItem', subjectType: 'WorkplanItem', subjectKey: 'WPI|E1|2027|1', resourceType: 'KCFKPI_WorkplanItems', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'UpsertCoreContributionV2', subjectType: 'WorkplanItem', subjectKey: 'WPI|E1|2027|1', resourceType: 'KCFKPI_WorkplanItems', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'UpsertPersonalItemV2', subjectType: 'WorkplanItem', subjectKey: 'WPI|E1|2027|1', resourceType: 'KCFKPI_WorkplanItems', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'UpsertBehaviourCommitmentV2', subjectType: 'WorkplanItem', subjectKey: 'WPI|E1|2027|1', resourceType: 'KCFKPI_WorkplanItems', partition: 'annual', delegatedManagerAllowed: false },
  { commandType: 'CreateQuarterDraft', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', resourceType: 'KCFKPI_QuarterReviews', partition: 'Q1', delegatedManagerAllowed: false },
  { commandType: 'SubmitQuarterReview', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', resourceType: 'KCFKPI_QuarterReviews', partition: 'Q1', delegatedManagerAllowed: false },
  { commandType: 'RequestQuarterChanges', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', resourceType: 'KCFKPI_QuarterReviews', partition: 'Q1', delegatedManagerAllowed: true },
  { commandType: 'SetQuarterManagerReview', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', resourceType: 'KCFKPI_QuarterReviews', partition: 'Q1', delegatedManagerAllowed: true },
  { commandType: 'SetQuarterRAGOverride', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', resourceType: 'KCFKPI_QuarterReviews', partition: 'Q1', delegatedManagerAllowed: true },
  { commandType: 'DecideReforecast', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', resourceType: 'KCFKPI_QuarterReviews', partition: 'Q1', delegatedManagerAllowed: true },
  { commandType: 'ApproveAndLockQuarter', subjectType: 'QuarterReview', subjectKey: 'QR|E1|2027|Q1', resourceType: 'KCFKPI_QuarterReviews', partition: 'Q1', delegatedManagerAllowed: true },
  { commandType: 'UpdateQuarterItem', subjectType: 'QuarterReviewItem', subjectKey: 'QRI|E1|2027|Q1|1', resourceType: 'KCFKPI_QuarterReviewItems', partition: 'Q1', delegatedManagerAllowed: false },
  { commandType: 'UpdateQuarterItemV2', subjectType: 'QuarterReviewItem', subjectKey: 'QRI|E1|2027|Q1|1', resourceType: 'KCFKPI_QuarterReviewItems', partition: 'Q1', delegatedManagerAllowed: false },
  { commandType: 'SaveProgressEntry', subjectType: 'QuarterReviewItem', subjectKey: 'QRI|E1|2027|Q1|1', resourceType: 'KCFKPI_QuarterReviewItems', partition: 'Q1', delegatedManagerAllowed: false },
  { commandType: 'RegisterEvidence', subjectType: 'Evidence', subjectKey: 'EVID|E1|2027', resourceType: 'KCFKPI_Evidence', partition: 'annual', delegatedManagerAllowed: false }
];

describe('KCF-KPI-027F red-to-green Security edge remediation', () => {
  describe('027F-G1 authoritative CONTROL-case validation — 21 baseline assertions', () => {
    authoritativeUnsafeCases.forEach((attack, attackIndex) => {
      it(`${attack.label} is rejected by authoritative classification`, () => {
        const { result } = runAmendment(safeControlCase(attack.patch), 1100 + attackIndex);
        expect(result.receipt.outcome).toBe('Rejected');
      });

      it(`${attack.label} returns the governed validation code`, () => {
        const { result } = runAmendment(safeControlCase(attack.patch), 1200 + attackIndex);
        expect(result.receipt.validationCode).toBe(attack.expectedCode);
      });

      it(`${attack.label} creates no mutation, history, receipt or success Audit`, () => {
        const { before, result, state } = runAmendment(safeControlCase(attack.patch), 1300 + attackIndex);
        expect({
          mutationApplied: result.mutationApplied,
          subjectUnchanged: state.subjects.get('WP|E1|2027') === before,
          approvedHistory: state.approvedHistory.length,
          receipts: state.receipts.length,
          successAudit: state.audit.filter(item => item.outcome === 'Accepted').length
        }).toEqual({
          mutationApplied: false, subjectUnchanged: true, approvedHistory: 0, receipts: 0, successAudit: 0
        });
      });
    });
  });

  describe('027F-G2 Unicode human-reason validation — 18 baseline assertions', () => {
    newlyProvedInvisibleReasons.forEach((attack, attackIndex) => {
      it(`${attack.label} is rejected`, () => {
        const { result } = runAmendment(safeControlCase(), 1400 + attackIndex, attack.value);
        expect(result.receipt.outcome).toBe('Rejected');
      });

      it(`${attack.label} has the required validation classification`, () => {
        const { result } = runAmendment(safeControlCase(), 1500 + attackIndex, attack.value);
        expect(result.receipt.validationCode).toBe('AMENDMENT_REASON_REQUIRED');
      });

      it(`${attack.label} creates no mutation, history, receipt or success Audit`, () => {
        const { before, result, state } = runAmendment(
          safeControlCase(), 1600 + attackIndex, attack.value
        );
        expect({
          mutationApplied: result.mutationApplied,
          subjectUnchanged: state.subjects.get('WP|E1|2027') === before,
          approvedHistory: state.approvedHistory.length,
          receipts: state.receipts.length,
          successAudit: state.audit.filter(item => item.outcome === 'Accepted').length
        }).toEqual({
          mutationApplied: false, subjectUnchanged: true, approvedHistory: 0, receipts: 0, successAudit: 0
        });
      });
    });
  });

  describe('027F-G3 delegated ACL/processor parity — 3 baseline assertions', () => {
    const updateDraft = aclDelegation(
      'Workplan', 'WP|E1|2027', 'KCFKPI_Workplans', 'UpdateWorkplanDraftV2'
    );
    const registerEvidence = aclDelegation(
      'Evidence', 'EVID|E1|2027', 'KCFKPI_Evidence', 'RegisterEvidence'
    );

    it('does not advertise UpdateWorkplanDraftV2 as a delegated Manager operation', () => {
      const plan = buildSec006AclPlan(2027, trustedUtc, people, [updateDraft], automation);
      expect(plan.delegatedOperations.some(operation =>
        operation.commandTypes.indexOf('UpdateWorkplanDraftV2') >= 0)).toBe(false);
    });

    it('does not advertise RegisterEvidence as a delegated Manager operation', () => {
      const plan = buildSec006AclPlan(2027, trustedUtc, people, [registerEvidence], automation);
      expect(plan.delegatedOperations.some(operation =>
        operation.commandTypes.indexOf('RegisterEvidence') >= 0)).toBe(false);
    });

    it('advertises only commands from the governed ManagerCommands authority set', () => {
      const plan = buildSec006AclPlan(2027, trustedUtc, people, [updateDraft, registerEvidence], automation);
      const managerCommands = new Set<string>(EMPLOYEE_V2_MANAGER_COMMAND_TYPES);
      expect(plan.delegatedOperations.every(operation =>
        operation.commandTypes.every(commandType => managerCommands.has(commandType)))).toBe(true);
    });
  });
});

describe('KCF-KPI-027F mandatory Security continuity attacks', () => {
  describe('027F-G1 authoritative atomic validation and recovery continuity — 13 assertions', () => {
    const rejectedAuthoritativeCases: ReadonlyArray<{
      label: string;
      patch: Partial<ISec006ControlCase>;
      expectedCode: string;
    }> = [
      { label: 'inactive', patch: { active: false }, expectedCode: 'AMENDMENT_CONTROL_CASE_INACTIVE' },
      {
        label: 'consumed',
        patch: {
          active: false, consumedAtUtc: trustedUtc, consumedCommandKey: 'CMD-OLD',
          consumedSourceListId: managerListId, consumedSourceItemId: 1, consumedSourceItemVersion: '1.0'
        },
        expectedCode: 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED'
      },
      {
        label: 'RecoveryHold', patch: { recoveryHoldAtUtc: trustedUtc, recoveryHoldReason: 'Reconcile.' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_RECOVERY_HOLD'
      },
      {
        label: 'invalid inverted window',
        patch: { validFromUtc: '2027-01-01T00:00:00Z', validToUtc: '2026-01-01T00:00:00Z' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_INVALID'
      },
      {
        label: 'authorised action divergence',
        patch: {
          authorisedAction: 'UpdateWorkplanDraftV2' as unknown as ISec006ControlCase['authorisedAction']
        },
        expectedCode: 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH'
      },
      {
        label: 'Workplan binding divergence', patch: { workplanKey: 'WP|E1|2027|OTHER' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH'
      },
      {
        label: 'Workplan version divergence', patch: { workplanVersion: 2 },
        expectedCode: 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH'
      },
      {
        label: 'canonical ETag binding divergence', patch: { expectedETag: '"9"' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH'
      },
      {
        label: 'canonical token binding divergence', patch: { expectedRowVersionToken: 9 },
        expectedCode: 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH'
      },
      {
        label: 'stale storage ETag', patch: { storageETag: '"2"' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_STALE_WRITE'
      },
      {
        label: 'stale storage token', patch: { storageRowVersionToken: 2 },
        expectedCode: 'AMENDMENT_CONTROL_CASE_STALE_WRITE'
      }
    ];

    it.each(rejectedAuthoritativeCases.map((testCase, caseIndex) => ({ ...testCase, caseIndex })))(
      'rejects authoritative $label atomically without persistence evidence',
      ({ patch, expectedCode, caseIndex }) => {
        const { before, result, state } = runAmendment(safeControlCase(patch), 1700 + caseIndex);
        expect({
          outcome: result.receipt.outcome,
          code: result.receipt.validationCode,
          mutationApplied: result.mutationApplied,
          subjectUnchanged: state.subjects.get('WP|E1|2027') === before,
          approvedHistory: state.approvedHistory.length,
          receipts: state.receipts.length,
          successAudit: state.audit.filter(item => item.outcome === 'Accepted').length
        }).toEqual({
          outcome: 'Rejected', code: expectedCode, mutationApplied: false, subjectUnchanged: true,
          approvedHistory: 0, receipts: 0, successAudit: 0
        });
      }
    );

    it('allows exactly one winner across independent processors and persists only that winner', async () => {
      const snapshot = safeControlCase();
      const store = new Sec006AtomicControlCaseMemoryStore([snapshot]);
      const left = processorState(snapshot, snapshot, store);
      const right = processorState(snapshot, snapshot, store);
      const results = await Promise.all([
        Promise.resolve().then(() => new Sec006AutomationProcessor()
          .process(amendmentContext(1801, 'Winner A.'), left)),
        Promise.resolve().then(() => new Sec006AutomationProcessor()
          .process(amendmentContext(1802, 'Winner B.'), right))
      ]);
      const consumed = store.read(snapshot.controlCaseKey);
      expect({
        acceptedResults: results.filter(result => result.receipt.outcome === 'Accepted').length,
        rejectedResults: results.filter(result => result.receipt.outcome === 'Rejected').length,
        history: left.approvedHistory.length + right.approvedHistory.length,
        persistedReceipts: left.receipts.length + right.receipts.length,
        successAudit: [...left.audit, ...right.audit].filter(item => item.outcome === 'Accepted').length,
        consumed: Boolean(consumed?.consumedAtUtc),
        storageRowVersionToken: consumed?.storageRowVersionToken
      }).toEqual({
        acceptedResults: 1, rejectedResults: 1, history: 1, persistedReceipts: 1,
        successAudit: 1, consumed: true, storageRowVersionToken: 2
      });
    });

    it('preserves consumed identity in RecoveryHold and blocks replay after partial I/O', () => {
      const snapshot = safeControlCase();
      const store = new Sec006AtomicControlCaseMemoryStore([snapshot]);
      const firstState = processorState(snapshot, snapshot, store);
      const first = new Sec006AutomationProcessor(undefined, {
        beforeWrite: stage => { if (stage === 'Audit') throw new Error('Synthetic Audit-stage failure.'); }
      }).process(amendmentContext(1803, 'Partial-I/O correction.'), firstState);
      const held = store.read(snapshot.controlCaseKey);
      const replayState = processorState(snapshot, snapshot, store);
      const replayBefore = replayState.subjects.get('WP|E1|2027');
      const replay = new Sec006AutomationProcessor()
        .process(amendmentContext(1804, 'Replay attack.'), replayState);
      expect({
        firstOutcome: first.receipt.outcome,
        held: Boolean(held?.recoveryHoldAtUtc),
        consumedCommandKey: held?.consumedCommandKey,
        replayOutcome: replay.receipt.outcome,
        replayCode: replay.receipt.validationCode,
        replayUnchanged: replayState.subjects.get('WP|E1|2027') === replayBefore,
        replayHistory: replayState.approvedHistory.length,
        replayReceipts: replayState.receipts.length,
        replaySuccessAudit: replayState.audit.filter(item => item.outcome === 'Accepted').length
      }).toEqual({
        firstOutcome: 'RecoveryHold', held: true, consumedCommandKey: 'CMD-027F-1803',
        replayOutcome: 'Rejected', replayCode: 'AMENDMENT_CONTROL_CASE_RECOVERY_HOLD',
        replayUnchanged: true, replayHistory: 0, replayReceipts: 0, replaySuccessAudit: 0
      });
    });
  });

  describe('027F-G2 comprehensive Unicode-property policy continuity — 11 assertions', () => {
    const rejectedReasons = [
      '\u200b', '\u2060', '\u180e', ' \t\r\n ', '\u070f\ufff0\u{1bca0}\u{1d173}\u200b',
      'Visible\u2060reason', 'Visible\nreason', '\u0301\u034f\u0300'
    ];

    it.each(rejectedReasons.map((reason, caseIndex) => ({ reason, caseIndex })))(
      'rejects Unicode reason $reason without any persistence evidence', ({ reason, caseIndex }) => {
        const { before, result, state } = runAmendment(safeControlCase(), 1900 + caseIndex, reason);
        expect({
          outcome: result.receipt.outcome,
          code: result.receipt.validationCode,
          mutationApplied: result.mutationApplied,
          subjectUnchanged: state.subjects.get('WP|E1|2027') === before,
          approvedHistory: state.approvedHistory.length,
          receipts: state.receipts.length,
          successAudit: state.audit.filter(item => item.outcome === 'Accepted').length
        }).toEqual({
          outcome: 'Rejected', code: 'AMENDMENT_REASON_REQUIRED', mutationApplied: false,
          subjectUnchanged: true, approvedHistory: 0, receipts: 0, successAudit: 0
        });
      }
    );

    it.each([
      {
        label: 'bounded accents and punctuation',
        reason: '\u200b\t Révision — approved! \n\u2060',
        expected: 'Révision — approved!',
        caseIndex: 0
      },
      { label: 'valid decomposed text', reason: 'Cafe\u0301 – reason.', expected: 'Café – reason.', caseIndex: 1 },
      {
        label: 'ordinary human punctuation',
        reason: "Reason: O'Brien's correction (Q1).",
        expected: "Reason: O'Brien's correction (Q1).",
        caseIndex: 2
      }
    ])('preserves $label after NFC boundary normalisation', ({ reason, expected, caseIndex }) => {
      const { result, state } = runAmendment(safeControlCase(), 2000 + caseIndex, reason);
      expect({
        outcome: result.receipt.outcome,
        mutationApplied: result.mutationApplied,
        historyReason: state.approvedHistory[0]?.values.amendmentReason,
        canonicalReason: state.subjects.get('WP|E1|2027')?.values.amendmentReason
      }).toEqual({
        outcome: 'Accepted', mutationApplied: true, historyReason: expected, canonicalReason: expected
      });
    });
  });

  describe('027F-G3 exhaustive governed command parity — 32 assertions', () => {
    it('covers the complete physical command union exactly once', () => {
      const physicalCommands = [...EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES, ...EMPLOYEE_V2_MANAGER_COMMAND_TYPES];
      expect({
        physicalCount: physicalCommands.length,
        physicalUnique: new Set(physicalCommands).size,
        parityCount: commandParityCases.length,
        parityUnique: new Set(commandParityCases.map(item => item.commandType)).size
      }).toEqual({ physicalCount: 24, physicalUnique: 24, parityCount: 24, parityUnique: 24 });
    });

    it.each(commandParityCases)(
      'classifies and advertises $commandType with exact delegated-manager parity',
      parityCase => {
        const classification = resolveSec006GovernedCommand(parityCase.commandType, parityCase.subjectType);
        const plan = buildSec006AclPlan(2027, trustedUtc, people, [aclDelegation(
          parityCase.subjectType, parityCase.subjectKey, parityCase.resourceType,
          parityCase.commandType, parityCase.partition
        )], automation);
        expect({
          sourceListTitle: classification?.sourceListTitle,
          delegatedManagerAllowed: classification?.delegatedManagerAllowed,
          advertisedOperations: plan.delegatedOperations.length,
          advertisedCommands: plan.delegatedOperations[0]?.commandTypes || []
        }).toEqual({
          sourceListTitle: EMPLOYEE_V2_MANAGER_COMMAND_TYPES.indexOf(parityCase.commandType) >= 0
            ? 'KCFKPI_ManagerCommands' : 'KCFKPI_EmployeeCommands',
          delegatedManagerAllowed: parityCase.delegatedManagerAllowed,
          advertisedOperations: parityCase.delegatedManagerAllowed ? 1 : 0,
          advertisedCommands: parityCase.delegatedManagerAllowed ? [parityCase.commandType] : []
        });
      }
    );

    it.each(commandParityCases.filter(item => item.delegatedManagerAllowed)
      .map((parityCase, caseIndex) => ({ ...parityCase, caseIndex })))(
      'executes every advertised delegated Manager command: $commandType',
      parityCase => {
        const subject = delegatedSubject(parityCase.subjectType as 'Workplan' | 'QuarterReview');
        const delegation = processorDelegation(
          parityCase.subjectType, parityCase.subjectKey, parityCase.resourceType,
          parityCase.commandType, parityCase.partition
        );
        const state = delegatedProcessorState(subject, delegation);
        const result = new Sec006AutomationProcessor().process(
          delegatedManagerContext(2100 + parityCase.caseIndex, parityCase.commandType, subject), state
        );
        expect({
          outcome: result.receipt.outcome,
          code: result.receipt.validationCode,
          role: result.receipt.effectiveRole,
          mutationApplied: result.mutationApplied,
          persistedReceipt: state.receipts.length,
          successAudit: state.audit.filter(item => item.outcome === 'Accepted').length
        }).toEqual({
          outcome: 'Accepted', code: 'ACCEPTED', role: 'DelegatedManager', mutationApplied: true,
          persistedReceipt: 1, successAudit: 1
        });
      }
    );
  });
});

describe('KCF-KPI-027G Security blocker repair', () => {
  it('027G-G1 rejects malformed authoritative consumed and timestamp states atomically', () => {
    const attacks: ReadonlyArray<{
      label: string;
      patch: Partial<ISec006ControlCase>;
      expectedCode: string;
    }> = [
      {
        label: 'numeric-zero consumed item marker',
        patch: { consumedSourceItemId: 0 },
        expectedCode: 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED'
      },
      {
        label: 'empty consumed timestamp marker',
        patch: { consumedAtUtc: '' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED'
      },
      {
        label: 'empty consumed command marker',
        patch: { consumedCommandKey: '' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED'
      },
      {
        label: 'empty consumed source-list marker',
        patch: { consumedSourceListId: '' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED'
      },
      {
        label: 'empty consumed item-version marker',
        patch: { consumedSourceItemVersion: '' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED'
      },
      {
        label: 'impossible validFrom calendar date',
        patch: { validFromUtc: '2026-02-30T00:00:00Z' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_INVALID'
      },
      {
        label: 'impossible validTo calendar date',
        patch: { validToUtc: '2027-02-30T00:00:00Z' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_INVALID'
      },
      {
        label: 'date-only validFrom value',
        patch: { validFromUtc: '2026-10-01' },
        expectedCode: 'AMENDMENT_CONTROL_CASE_INVALID'
      }
    ];

    const actual = attacks.map((attack, attackIndex) => {
      const authoritative = safeControlCase(attack.patch);
      const { before, result, state } = runAmendment(authoritative, 2200 + attackIndex);
      return {
        label: attack.label,
        outcome: result.receipt.outcome,
        code: result.receipt.validationCode,
        mutationApplied: result.mutationApplied,
        subjectUnchanged: state.subjects.get('WP|E1|2027') === before,
        approvedHistory: state.approvedHistory.length,
        persistedReceipts: state.receipts.length,
        successAudit: state.audit.filter(item => item.outcome === 'Accepted').length,
        authoritativeUnchanged: JSON.stringify(state.controlCaseStore.read(authoritative.controlCaseKey))
          === JSON.stringify(authoritative)
      };
    });

    expect(actual).toEqual(attacks.map(attack => ({
      label: attack.label,
      outcome: 'Rejected',
      code: attack.expectedCode,
      mutationApplied: false,
      subjectUnchanged: true,
      approvedHistory: 0,
      persistedReceipts: 0,
      successAudit: 0,
      authoritativeUnchanged: true
    })));
  });

  it('027G-G2 rejects lone high and low UTF-16 surrogates before persistence', () => {
    const invalidReasons = [
      { label: 'lone high surrogate', value: '\ud800' },
      { label: 'lone low surrogate', value: '\udfff' }
    ];
    const invalid = invalidReasons.map((attack, attackIndex) => {
      const { before, result, state } = runAmendment(
        safeControlCase(), 2300 + attackIndex, attack.value
      );
      return {
        label: attack.label,
        normalised: normaliseSec006HumanReason(attack.value),
        outcome: result.receipt.outcome,
        code: result.receipt.validationCode,
        mutationApplied: result.mutationApplied,
        subjectUnchanged: state.subjects.get('WP|E1|2027') === before,
        approvedHistory: state.approvedHistory.length,
        persistedReceipts: state.receipts.length,
        successAudit: state.audit.filter(item => item.outcome === 'Accepted').length,
        controlCaseConsumed: Boolean(state.controlCaseStore.read('CONTROL-027F-001')?.consumedAtUtc)
      };
    });
    const valid = runAmendment(safeControlCase(), 2302, 'Cafe\u0301 correction ✅');

    expect({
      invalid,
      valid: {
        normalised: normaliseSec006HumanReason('Cafe\u0301 correction ✅'),
        outcome: valid.result.receipt.outcome,
        mutationApplied: valid.result.mutationApplied,
        canonicalReason: valid.state.subjects.get('WP|E1|2027')?.values.amendmentReason,
        historyReason: valid.state.approvedHistory[0]?.values.amendmentReason
      }
    }).toEqual({
      invalid: invalidReasons.map(attack => ({
        label: attack.label,
        normalised: undefined,
        outcome: 'Rejected',
        code: 'AMENDMENT_REASON_REQUIRED',
        mutationApplied: false,
        subjectUnchanged: true,
        approvedHistory: 0,
        persistedReceipts: 0,
        successAudit: 0,
        controlCaseConsumed: false
      })),
      valid: {
        normalised: 'Café correction ✅',
        outcome: 'Accepted',
        mutationApplied: true,
        canonicalReason: 'Café correction ✅',
        historyReason: 'Café correction ✅'
      }
    });
  });

  it('027G-G3 keeps ACL and processor fail-closed under the same ambiguous People directories', () => {
    const directoryAttacks: ReadonlyArray<{ label: string; entries: ISec006AclPerson[] }> = [
      {
        label: 'duplicate active PersonKey',
        entries: [...people, {
          personKey: 'd1', email: 'd1-duplicate@example.invalid', active: true,
          appRoles: ['DelegatedManager']
        }]
      },
      {
        label: 'duplicate active email',
        entries: [...people, {
          personKey: 'X1', email: ' D1@example.invalid ', active: true, appRoles: ['Employee']
        }]
      },
      {
        label: 'empty active PersonKey',
        entries: [...people, {
          personKey: ' ', email: 'x1@example.invalid', active: true, appRoles: ['Employee']
        }]
      },
      {
        label: 'empty active email',
        entries: people.map(person => person.personKey === 'D1' ? { ...person, email: ' ' } : person)
      }
    ];
    const delegatedAcl = aclDelegation(
      'Workplan', 'WP|E1|2027', 'KCFKPI_Workplans', 'RequestWorkplanChanges'
    );

    const invalid = directoryAttacks.map((attack, attackIndex) => {
      const plan = buildSec006AclPlan(2027, trustedUtc, attack.entries, [delegatedAcl], automation);
      const subject = delegatedSubject('Workplan');
      const delegation = processorDelegation(
        'Workplan', subject.subjectKey, 'KCFKPI_Workplans', 'RequestWorkplanChanges', 'annual'
      );
      const state = delegatedProcessorState(subject, delegation);
      state.people = attack.entries.map(person => ({ ...person }));
      const processed = new Sec006AutomationProcessor().process(
        delegatedManagerContext(2400 + attackIndex, 'RequestWorkplanChanges', subject), state
      );
      return {
        label: attack.label,
        partitions: plan.partitions.length,
        delegatedOperations: plan.delegatedOperations.length,
        systemAdminDiagnostics: plan.systemAdminDiagnostics.length,
        processorOutcome: processed.receipt.outcome,
        processorCode: processed.receipt.validationCode,
        mutationApplied: processed.mutationApplied
      };
    });

    const validPlan = buildSec006AclPlan(2027, trustedUtc, people, [delegatedAcl], automation);
    const validSubject = delegatedSubject('Workplan');
    const validDelegation = processorDelegation(
      'Workplan', validSubject.subjectKey, 'KCFKPI_Workplans', 'RequestWorkplanChanges', 'annual'
    );
    const validState = delegatedProcessorState(validSubject, validDelegation);
    const validProcessed = new Sec006AutomationProcessor().process(
      delegatedManagerContext(2404, 'RequestWorkplanChanges', validSubject), validState
    );

    expect({
      invalid,
      valid: {
        delegatedOperations: validPlan.delegatedOperations.length,
        processorOutcome: validProcessed.receipt.outcome,
        processorCode: validProcessed.receipt.validationCode,
        mutationApplied: validProcessed.mutationApplied
      }
    }).toEqual({
      invalid: directoryAttacks.map(attack => ({
        label: attack.label,
        partitions: 0,
        delegatedOperations: 0,
        systemAdminDiagnostics: 0,
        processorOutcome: 'Rejected',
        processorCode: 'PEOPLE_DIRECTORY_AMBIGUOUS',
        mutationApplied: false
      })),
      valid: {
        delegatedOperations: 1,
        processorOutcome: 'Accepted',
        processorCode: 'ACCEPTED',
        mutationApplied: true
      }
    });
  });
});
