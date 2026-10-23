import {
  C2B_DEFERRED_ANNUAL_HANDLERS,
  C2B_IMPLEMENTED_ANNUAL_PLANNERS,
  acquireC2bLease,
  admitC2bPlan,
  completeC2bReceipt,
  confirmC2bStableRead,
  createC2bCommandPlan,
  createC2bRejectedOutcome,
  hashC2bCanonical,
  issueNextC2bEffect,
  recoverC2bEffect,
  settleC2bEffect,
  type C2bAclImage,
  type C2bCanonicalObservation,
  type C2bCommandJournal,
  type C2bCommandPlan,
  type C2bEffectConfirmation,
  type C2bEffectPlan,
  type C2bListAclImage,
  type C2bStableReadProof,
  type C2bTerminalReceipt
} from './TestPilotCommandAdmissionC2b';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_PLANNING_LEVELS_VERSION,
  BEHAVIOUR_V2_VALUE_IDS } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, encodeBehaviourSelectionSnapshotsV2 }
  from './BehaviourSelectionSnapshotsV2';
import {
  planCreateWorkplanDraftC2b,
  planApproveAndLockWorkplanC2b,
  planCreateWorkplanAmendmentC2b,
  planRequestWorkplanChangesC2b,
  planSetCoreWeightingC2b,
  planSubmitWorkplanC2b,
  planUpdateWorkplanDraftC2b,
  planUpsertCoreContributionC2b,
  planUpsertPersonalItemC2b,
  type C2bTrustedAnnualConfiguration,
  type C2bTrustedAnnualItem,
  type C2bTrustedAnnualReadiness,
  type C2bTrustedCoreCatalogueItem,
  type C2bTrustedCommandSource,
  type C2bTrustedPerson,
  type C2bTrustedWorkplanHeader
} from './TestPilotCommandAdmissionC2bHandlers';
import type {
  IEmployeeCoreContributionInputV2,
  IEmployeePersonalItemInputV2
} from '../models/EmployeeWorkplanV2PersistenceModels';
import {
  Sec006AtomicControlCaseMemoryStore,
  type ISec006ControlCase,
  type ISec006ControlCaseConsumption
} from './sec006/Sec006ControlCaseStore';
import { EMPLOYEE_V2_PHYSICAL_ASSETS } from './EmployeeWorkplanV2PhysicalSchema';

const processedAt = '2026-09-12T05:45:00Z';
const leaseExpiry = '2026-09-12T05:50:00Z';
const source: C2bTrustedCommandSource = {
  listId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53', itemId: 14, itemVersion: '3.0'
};
const employee: C2bTrustedPerson = {
  personKey: 'PERSON-001', email: 'employee@example.invalid', displayName: 'Synthetic Employee', active: true,
  roles: ['Employee'], managerPersonKey: 'PERSON-002', managerEmail: 'manager@example.invalid'
};
const manager: C2bTrustedPerson = {
  personKey: 'PERSON-002', email: 'manager@example.invalid', displayName: 'Synthetic Manager', active: true,
  roles: ['Employee', 'Manager'], managerPersonKey: null, managerEmail: null
};
const systemAdmin: C2bTrustedPerson = {
  personKey: 'ADMIN-001', email: 'admin@example.invalid', displayName: 'Synthetic System Administrator', active: true,
  roles: ['SystemAdmin'], managerPersonKey: null, managerEmail: null
};
const configuration: C2bTrustedAnnualConfiguration = {
  schemaRevision: 'c2b-annual-v2', performanceYear: 2027,
  behaviourContractVersion: 'BEHAVIOUR-CONTRACT-UNRESOLVED-BINDING-V1', initialState: 'Draft',
  initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready',
  processorPrincipalKey: 'PROCESSOR-001', adminPrincipalKeys: ['ADMIN-GROUP-001']
};
const currentAcl = (): C2bAclImage => ({
  containerKey: employee.personKey, breaksInheritanceAtContainer: true, canonicalChildrenInherit: true,
  allowedPrincipals: [{ principalKey: 'LEGACY-SITE-MEMBERS', permission: 'Read', source: 'Admin' }],
  revokedPrincipalKeys: []
});
const acls = (includeItems: boolean): { current: C2bListAclImage[] } => ({
  current: [
    { listPurpose: 'Workplans', acl: currentAcl() },
    ...(includeItems ? [{ listPurpose: 'WorkplanItems' as const, acl: currentAcl() }] : [])
  ]
});
const header = (state: C2bTrustedWorkplanHeader['state'] = 'Draft', token = 5): C2bTrustedWorkplanHeader => {
  const accessState: C2bTrustedWorkplanHeader['accessState'] = state === 'Draft' || state === 'ChangesRequested'
    ? 'EmployeeEdit' : state === 'Submitted' ? 'ManagerDecision' : 'ReadOnly';
  const fields: Record<string, unknown> = {
    WorkplanKey: 'PERSON-001|2027', PersonKey: employee.personKey, EmployeeDisplayName: employee.displayName,
    EmployeeEmail: employee.email, ManagerPersonKey: manager.personKey, ManagerDisplayName: manager.displayName,
    ManagerEmail: manager.email, PerformanceYear: 2027, State: state, AccessState: accessState,
    TransitionStatus: 'Ready', CoreCategoryWeight: 70, PersonalCategoryWeight: 20,
    BehaviourCategoryWeight: 10, WorkplanVersion: 1, RowVersionToken: token
  };
  if (state === 'Submitted' || state === 'Approved' || state === 'Locked') {
    fields.SubmittedAt = '2026-09-12T05:30:00Z'; fields.SubmittedByEmail = employee.email;
  }
  if (state === 'Approved' || state === 'Locked') {
    fields.ApprovedAt = '2026-09-12T05:35:00Z'; fields.ApprovedByEmail = manager.email;
  }
  if (state === 'Locked') {
    fields.LockedAt = '2026-09-12T05:36:00Z'; fields.LockedByEmail = manager.email;
  }
  return { workplanKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    etag: `"header-${token}"`, rowVersionToken: token, state, accessState, transitionStatus: 'Ready', fields };
};
const annualItem = (itemType: C2bTrustedAnnualItem['itemType'], id: string, token: number,
  active = true): C2bTrustedAnnualItem => {
  const naturalKey = `PERSON-001|2027|${itemType}|${id}`;
  const fields: Record<string, unknown> = {
    WorkplanItemKey: id, WorkplanItemNaturalKey: naturalKey, WorkplanKey: 'PERSON-001|2027',
    PersonKey: employee.personKey, PerformanceYear: 2027, ItemType: itemType,
    ActiveInWorkplan: active, WorkplanVersion: 1, AddedByEmail: employee.email, AddedAt: processedAt,
    RowVersionToken: token
  };
  if (itemType === 'CoreGold') fields.KPIID = id;
  if (itemType === 'LocalPersonal') fields.LocalKPIWording = `Synthetic ${id}`;
  if (itemType === 'Behaviour') fields.BehaviourID = id;
  return { workplanItemKey: id, workplanItemNaturalKey: naturalKey, workplanKey: 'PERSON-001|2027',
    personKey: employee.personKey, performanceYear: 2027, itemType, activeInWorkplan: active,
    etag: `"item-${token}"`, rowVersionToken: token, fields };
};
const items = (): C2bTrustedAnnualItem[] => [
  annualItem('CoreGold', 'KPI-001', 2), annualItem('CoreGold', 'KPI-002', 3),
  annualItem('LocalPersonal', 'PERSONAL-001', 4), annualItem('Behaviour', 'OPAQUE-001', 5)
];
const readiness = (workplan: C2bTrustedWorkplanHeader,
  currentItems: readonly C2bTrustedAnnualItem[]): C2bTrustedAnnualReadiness => ({
  complete: true, blockerCodes: [], pagingComplete: true,
  behaviourContractVersion: configuration.behaviourContractVersion,
  sourceHeaderSha256: hashC2bCanonical(workplan.fields),
  sourceItemsSha256: hashC2bCanonical(currentItems.map(item => ({
    naturalKey: item.workplanItemNaturalKey, fields: item.fields
  })).sort((left, right) => left.naturalKey.localeCompare(right.naturalKey)))
});
const catalogue: C2bTrustedCoreCatalogueItem = {
  kpiId: 'KPI-NEW', kpiVersionKey: 'KPI-NEW|V1', targetVersionKey: 'KPI-NEW|2027|V1',
  performanceYear: 2027, active: true, approved: true, contributionUnit: '%',
  directContributionEligible: true, additiveEligible: true, nonOverlapRequired: true
};
const corePayload = (activeInWorkplan = true): IEmployeeCoreContributionInputV2 => ({
  kpiId: 'KPI-NEW', role: 'DeliveryLead' as const, contributionMethod: 'AdditiveDirect' as const,
  annualTargetValue: 100,
  quarterTargets: [
    { quarter: 'Q1' as const, targetValue: 25 }, { quarter: 'Q2' as const, targetValue: 50 },
    { quarter: 'Q3' as const, targetValue: 75 }, { quarter: 'Q4' as const, targetValue: 100 }
  ], displayOrder: 2, activeInWorkplan
});
const personalPayload = (activeInWorkplan = true): IEmployeePersonalItemInputV2 => ({
  wording: 'Deliver synthetic outcome', measure: 'Completion', measureType: 'Percentage' as const,
  scoringDirection: 'HigherIsBetter' as const, baselineValue: 0, yearEndTargetValue: 100,
  q1TargetValue: 25, q2TargetValue: 50, q3TargetValue: 75, q4TargetValue: 100,
  unitLabel: '%', personalItemWeight: 100, displayOrder: 1, activeInWorkplan
});
const rawCommand = (commandKey: string, commandType: C2bCommandPlan['commandType'], payload: unknown): {
  commandKey: string; commandType: C2bCommandPlan['commandType']; personKey: string;
  performanceYear: number; payload: unknown;
} => ({ commandKey, commandType, personKey: employee.personKey, performanceYear: 2027, payload });
const command = (commandKey: string, commandType: C2bCommandPlan['commandType'], payload: unknown): {
  commandKey: string; commandType: C2bCommandPlan['commandType']; personKey: string;
  performanceYear: number; payload: unknown;
} => {
  const digest = hashC2bCanonical(commandKey).toLowerCase();
  const stableCommandKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(commandKey)
    ? commandKey
    : `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return rawCommand(stableCommandKey, commandType, payload);
};
const controlCase = (workplan: C2bTrustedWorkplanHeader,
  overrides: Partial<ISec006ControlCase> = {}): ISec006ControlCase => ({
  controlCaseKey: 'CONTROL-KPI-012', controlReference: 'CONTROL-KPI-012',
  authorisedAction: 'CreateWorkplanAmendmentV2', subjectKey: workplan.workplanKey,
  workplanKey: workplan.workplanKey, workplanVersion: Number(workplan.fields.WorkplanVersion),
  expectedETag: workplan.etag, expectedRowVersionToken: workplan.rowVersionToken,
  storageETag: '"control-7"', storageRowVersionToken: 7, active: true,
  validFromUtc: '2026-09-12T00:00:00Z', validToUtc: '2026-09-13T00:00:00Z', revoked: false,
  ...overrides
});
const plannedConsumption = (effect: C2bEffectPlan): ISec006ControlCaseConsumption => {
  const value = { ...effect.desiredFields } as Record<string, unknown>;
  delete value.operation;
  return value as unknown as ISec006ControlCaseConsumption;
};

const effectConfirmation = (journal: C2bCommandJournal,
  effect: C2bCommandJournal['effects'][number]): C2bEffectConfirmation => {
  const source = effect.expectedETagFromEffectKey
    ? journal.effects.find(candidate => candidate.effectKey === effect.expectedETagFromEffectKey) : undefined;
  if (effect.kind === 'ControlCaseConsume') {
    const instruction = effect.desiredFields as unknown as ISec006ControlCaseConsumption & { operation: string };
    const readback = {
      ...(effect.beforeFields as Record<string, unknown>), active: false,
      storageETag: '"control-consumed"',
      storageRowVersionToken: instruction.expectedStorageRowVersionToken + 1,
      consumedAtUtc: instruction.consumedAtUtc,
      consumedCommandKey: instruction.consumedCommandKey,
      consumedSourceListId: instruction.consumedSourceListId,
      consumedSourceItemId: instruction.consumedSourceItemId,
      consumedSourceItemVersion: instruction.consumedSourceItemVersion
    };
    return { providerReference: `PROVIDER-${effect.sequence}`, naturalKey: effect.naturalKey,
      requestETag: effect.expectedETag, observedETag: '"control-consumed"',
      observedRowVersionToken: instruction.expectedStorageRowVersionToken + 1, readback };
  }
  return {
    providerReference: `PROVIDER-${effect.sequence}`, naturalKey: effect.naturalKey,
    requestETag: source ? source.confirmation?.observedETag || null : effect.expectedETag,
    observedETag: ['Claim', 'CanonicalUpsert', 'Finalise'].includes(effect.kind) ? `"observed-${effect.sequence}"` : null,
    observedRowVersionToken: ['Claim', 'CanonicalUpsert', 'Finalise'].includes(effect.kind)
      ? effect.desiredFields.RowVersionToken as number : null,
    readback: effect.desiredFields
  };
};
const stableProof = (journal: C2bCommandJournal): C2bStableReadProof => {
  const stable = journal.effects.find(effect => effect.kind === 'StableRead')!;
  const prior = journal.effects.filter(effect => effect.sequence < stable.sequence);
  const observation: C2bCanonicalObservation = {
    header: { ...journal.plan.intendedImage.header, etag: '"stable-header"',
      rowVersionToken: journal.plan.intendedImage.header.fields.RowVersionToken as number },
    items: journal.plan.intendedImage.items.map((item, index) => ({ ...item, etag: `"stable-item-${index}"`,
      rowVersionToken: item.fields.RowVersionToken as number })),
    acls: JSON.parse(JSON.stringify(journal.plan.intendedImage.acls)) as C2bListAclImage[],
    pagination: { complete: true, pageCount: 1, totalCount: journal.plan.intendedImage.items.length,
      nextLink: null, affectedNaturalKeys: journal.plan.intendedImage.items.map(item => item.naturalKey) },
    auditKeys: prior.filter(effect => effect.kind === 'AuditAppend').map(effect => effect.confirmation!.naturalKey),
    effectEvidenceSha256: prior.map(effect => effect.confirmationSha256!), processorEpoch: journal.leaseEpoch
  };
  return { first: observation, second: JSON.parse(JSON.stringify(observation)) as C2bCanonicalObservation };
};
const receiptFor = (journal: C2bCommandJournal): C2bTerminalReceipt => ({
  receiptKey: journal.plan.commandKey, commandKey: journal.plan.commandKey, outcome: 'Accepted',
  planSha256: journal.plan.planSha256, payloadSha256: journal.plan.payloadSha256,
  canonicalSha256: journal.stableRead!.readbackSha256,
  resultKeys: [journal.plan.subjectKey, ...journal.plan.intendedImage.items.map(item => item.naturalKey)].sort(),
  auditKeys: journal.effects.filter(effect => effect.kind === 'AuditAppend').map(effect => effect.confirmation!.naturalKey),
  actorAccess: journal.effects.find(effect => effect.kind === 'ReceiptGrant')!.desiredFields.actorAccess as C2bTerminalReceipt['actorAccess'],
  processorReference: 'SYNTHETIC-PROCESSOR-RUN', completedAt: processedAt
});
const execute = (plan: C2bCommandPlan): C2bCommandJournal => {
  const admitted = admitC2bPlan(undefined, plan, processedAt);
  if (admitted.status !== 'Created') throw new Error('Expected a new journal.');
  let journal = acquireC2bLease(admitted.journal, 'PROCESSOR-A', processedAt, leaseExpiry,
    admitted.journal.journalVersion);
  while (journal.state !== 'Terminal') {
    const effect = journal.effects.find(candidate => candidate.disposition !== 'Confirmed')!;
    journal = issueNextC2bEffect(journal, effect.effectKey, 'PROCESSOR-A', journal.leaseEpoch,
      processedAt, journal.journalVersion);
    const issued = journal.effects.find(candidate => candidate.effectKey === effect.effectKey)!;
    if (issued.kind === 'StableRead') {
      journal = confirmC2bStableRead(journal, issued.effectKey, stableProof(journal), 'PROCESSOR-A',
        journal.leaseEpoch, processedAt, journal.journalVersion);
    } else if (issued.kind === 'ReceiptCreate') {
      const receipt = receiptFor(journal);
      journal = settleC2bEffect(journal, issued.effectKey, { outcome: 'Confirmed', proof: {
        providerReference: 'RECEIPT-CREATE', naturalKey: issued.naturalKey, requestETag: null,
        observedETag: '"receipt-created"', observedRowVersionToken: null,
        readback: { operation: 'CreateAfterStableRead', receipt }
      } }, 'PROCESSOR-A', journal.leaseEpoch, processedAt, journal.journalVersion);
    } else if (issued.kind === 'ReceiptGrant') {
      const created = journal.effects.find(candidate => candidate.kind === 'ReceiptCreate')!;
      const receipt = (created.confirmation!.readback as { receipt: C2bTerminalReceipt }).receipt;
      journal = completeC2bReceipt(journal, issued.effectKey, receipt, {
        providerReference: 'RECEIPT-GRANT', naturalKey: issued.naturalKey,
        requestETag: created.confirmation!.observedETag, observedETag: '"receipt-granted"',
        observedRowVersionToken: null, readback: { operation: 'GrantReceiptRead', receiptKey: receipt.receiptKey,
          receiptSha256: hashC2bCanonical(receipt), actorAccess: receipt.actorAccess }
      }, 'PROCESSOR-A', journal.leaseEpoch, processedAt, journal.journalVersion);
    } else {
      journal = settleC2bEffect(journal, issued.effectKey,
        { outcome: 'Confirmed', proof: effectConfirmation(journal, issued) }, 'PROCESSOR-A',
        journal.leaseEpoch, processedAt, journal.journalVersion);
    }
  }
  return journal;
};

const plans = (): Array<[string, C2bCommandPlan]> => {
  const current = items();
  const draft = header();
  const submitted = header('Submitted', 9);
  const locked = header('Locked', 13);
  return [
    ['UpdateWorkplanDraftV2', planUpdateWorkplanDraftC2b(command('CMD-DRAFT', 'UpdateWorkplanDraftV2', {
      coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10
    }), employee.email, employee, manager, configuration, draft, current, processedAt, acls(false))],
    ['UpsertCoreContributionV2', planUpsertCoreContributionC2b(command('CMD-CORE', 'UpsertCoreContributionV2',
      corePayload()), employee.email, employee, manager, configuration, draft, undefined, current,
    processedAt, acls(true), catalogue, { workplanItemKey: 'CORE-NEW-001' })],
    ['UpsertPersonalItemV2', planUpsertPersonalItemC2b(command('CMD-PERSONAL', 'UpsertPersonalItemV2',
      personalPayload()), employee.email, employee, manager, configuration, draft, undefined, current,
    processedAt, acls(true), { workplanItemKey: 'PERSONAL-NEW-001' })],
    ['SetCoreWeightingV2', planSetCoreWeightingC2b(command('CMD-WEIGHTS', 'SetCoreWeightingV2',
      { mode: 'Equal' }), employee.email, employee, manager, configuration, draft, current,
    processedAt, acls(true))],
    ['SubmitWorkplan', planSubmitWorkplanC2b(JSON.stringify(command('CMD-SUBMIT', 'SubmitWorkplan', {})), employee.email,
      employee, manager, configuration, draft, current, readiness(draft, current), processedAt, acls(false))],
    ['RequestWorkplanChanges', planRequestWorkplanChangesC2b(command('CMD-CHANGES', 'RequestWorkplanChanges',
      { reason: 'Please clarify the measurable outcome.' }), manager.email, employee, manager, configuration,
    submitted, current, processedAt, acls(false))],
    ['ApproveAndLockWorkplan', planApproveAndLockWorkplanC2b(command('CMD-APPROVE', 'ApproveAndLockWorkplan', {}),
      manager.email, employee, manager, configuration, submitted, current, readiness(submitted, current),
      processedAt, acls(false))],
    ['CreateWorkplanAmendmentV2', planCreateWorkplanAmendmentC2b(command('CMD-AMEND',
      'CreateWorkplanAmendmentV2', { reason: 'Controlled correction.', controlReference: 'CONTROL-KPI-012' }),
    systemAdmin.email, systemAdmin, employee, manager, configuration, locked, current, processedAt, acls(true),
    [controlCase(locked)], source)]
  ];
};

describe('A012 settled annual handlers execute through stable proof and receipt-last completion', () => {
  it('emits exact configured new-header metadata and preserves idempotent terminal admission', () => {
    const plan = planCreateWorkplanDraftC2b(command('PM62-CREATE', 'CreateWorkplanDraft', {}), employee.email,
      employee, manager, configuration, acls(false));
    expect(plan.intendedImage.header.fields).toMatchObject({
      BehaviourContractVersion: configuration.behaviourContractVersion,
      SchemaRevision: configuration.schemaRevision
    });
    const terminal = execute(plan);
    expect(plan.effects[0].desiredFields.RowVersionToken).toBe(1);
    expect(plan.intendedImage.header.fields.RowVersionToken).toBe(2);
    expect(admitC2bPlan(terminal, plan, processedAt).status).toBe('Replay');
    expect(terminal.effects.every(effect => effect.disposition === 'Confirmed')).toBe(true);
    expect(terminal.receipt?.outcome).toBe('Accepted');
  });

  it('keeps header and item updates bound to exact ETag and monotonic token CAS', () => {
    const draft = header(); const current = annualItem('CoreGold', 'KPI-NEW', 6);
    const plan = planUpsertCoreContributionC2b(command('PM62-CAS', 'UpsertCoreContributionV2', corePayload()),
      employee.email, employee, manager, configuration, draft, current, [current], processedAt,
      acls(true), catalogue, { workplanItemKey: current.workplanItemKey });
    expect(plan.effects.find(effect => effect.kind === 'CanonicalUpsert')).toMatchObject({
      expectedETag: current.etag, expectedRowVersionToken: 6, desiredFields: { RowVersionToken: 7 }
    });
    expect(plan.intendedImage.header.fields.RowVersionToken).toBe(draft.rowVersionToken + 2);
    expect(draft.fields.RowVersionToken).toBe(5);
    expect(current.fields.RowVersionToken).toBe(6);
  });

  it('implements all ten settled annual planners with no deferred Behaviour route', () => {
    expect(C2B_IMPLEMENTED_ANNUAL_PLANNERS).toEqual([
      'CreateWorkplanDraft', 'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2', 'UpsertPersonalItemV2',
      'UpsertBehaviourCommitmentV2', 'SetCoreWeightingV2', 'SubmitWorkplan', 'RequestWorkplanChanges', 'ApproveAndLockWorkplan',
      'CreateWorkplanAmendmentV2'
    ]);
    expect(C2B_DEFERRED_ANNUAL_HANDLERS).toEqual([]);
  });

  it.each(plans())('%s reaches Terminal only after ordered durable effects and exact actor receipt access',
    (_name, plan) => {
      const terminal = execute(plan);
      expect(terminal).toMatchObject({ state: 'Terminal', receipt: { outcome: 'Accepted' } });
      expect(terminal.effects.every(effect => effect.disposition === 'Confirmed')).toBe(true);
      expect(terminal.effects[terminal.effects.length - 1].kind).toBe('ReceiptGrant');
      expect(terminal.effects.findIndex(effect => effect.kind === 'StableRead')).toBeLessThan(
        terminal.effects.findIndex(effect => effect.kind === 'ReceiptCreate'));
      expect(terminal.effects.some(effect => effect.desiredFields.operation === 'Delete')).toBe(false);
      expect(terminal.receipt?.actorAccess.allowedPrincipals.map(value => value.principalKey)).toContain(plan.actorPersonKey);
      expect(terminal.plan.intendedImage.acls.every(value => value.acl.containerKey === employee.personKey)).toBe(true);
    });

  it.each(plans())('%s inherits Held and exact Recovery audit semantics', (_name, plan) => {
    const admitted = admitC2bPlan(undefined, plan, processedAt);
    if (admitted.status !== 'Created') throw new Error('Expected created.');
    let journal = acquireC2bLease(admitted.journal, 'PROCESSOR-A', processedAt, leaseExpiry,
      admitted.journal.journalVersion);
    const claim = journal.effects[0];
    journal = issueNextC2bEffect(journal, claim.effectKey, 'PROCESSOR-A', journal.leaseEpoch,
      processedAt, journal.journalVersion);
    journal = settleC2bEffect(journal, claim.effectKey, { outcome: 'Unknown', safeCode: 'SYNTHETIC_TIMEOUT' },
      'PROCESSOR-A', journal.leaseEpoch, processedAt, journal.journalVersion);
    expect(journal).toMatchObject({ state: 'Held', outcomeAudits: [expect.objectContaining({ outcome: 'Held' })] });
    const proof = effectConfirmation(journal, claim);
    journal = recoverC2bEffect(journal, claim.effectKey, { outcome: 'Confirmed', ...proof,
      providerReference: 'RECOVERY-READ' }, processedAt, journal.journalVersion);
    expect(journal.outcomeAudits.map(value => value.outcome)).toEqual(['Held', 'Recovery']);
  });

  it.each(plans())('%s emits durable Rejected audit and failure receipt semantics', (_name, plan) => {
    const rejected = createC2bRejectedOutcome({ commandKey: plan.commandKey, commandType: plan.commandType,
      personKey: plan.personKey, subjectKey: plan.subjectKey, performanceYear: plan.performanceYear },
    JSON.parse(plan.payloadCanonical) as unknown, 'SYNTHETIC_REJECTION', 'Synthetic validation failure.', processedAt);
    expect(rejected).toMatchObject({ audit: { outcome: 'Rejected', success: false },
      receipt: { outcome: 'Rejected', validationCode: 'SYNTHETIC_REJECTION' } });
    expect(rejected.receipt.auditKey).toBe(rejected.audit.auditKey);
  });
});

describe('PM49 v02 Submit and independent manager approval image', () => {
  const v02Configuration: C2bTrustedAnnualConfiguration = { ...configuration,
    behaviourContractVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    deliveryWeightConfigurationAuthority: { configurationId: 'PD01-2027', version: 'v1',
      etag: '"pd01-1"', approvalReference: 'KCF-KPI-Sponsor-PD-01', contentSha256: 'A'.repeat(64),
      effectiveFrom: '2026-09-20', publishedAt: '2026-09-20T12:00:00.000Z',
      publishedBy: 'admin@example.invalid', changeReference: 'PD01-2027-PUBLISH' } };
  const annualHeader = (state: 'Draft' | 'Submitted' = 'Draft'): C2bTrustedWorkplanHeader => {
    const base = header(state, state === 'Draft' ? 5 : 7);
    const fields: Record<string, unknown> = { ...base.fields, BehaviourContractVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION };
    delete fields.CoreCategoryWeight; delete fields.PersonalCategoryWeight; delete fields.BehaviourCategoryWeight;
    return { ...base, fields };
  };
  const annualItems = (): C2bTrustedAnnualItem[] => [annualItem('CoreGold', 'KPI-001', 2),
    ...BEHAVIOUR_V2_VALUE_IDS.map((valueId, index) => {
      const item = annualItem('Behaviour', valueId, index + 3);
      const envelope = { schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA,
        frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId, selections: [] };
      const encoded = encodeBehaviourSelectionSnapshotsV2(envelope);
      return { ...item, fields: { ...item.fields,
        BehaviourFrameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
        BehaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
        BehaviourValueTitleSnapshot: `Value ${index + 1}`,
        BehaviourCorporateValueSnapshot: `Corporate ${index + 1}`,
        BehaviourRoleTierSnapshot: 'IC_OFFICER', BehaviourDescriptorSnapshot: `Descriptor ${index + 1}`,
        BehaviourCadenceSnapshot: 'Quarterly',
        BehaviourPeriodKeysSnapshotJSON: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4']),
        BehaviourRatingLabelsSnapshotJSON: JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS),
        BehaviourCommitmentV2: `Annual commitment ${index + 1}`,
        BehaviourPeriodCommitmentsV2JSON: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4'].map(period =>
          ({ period, commitment: `${period} commitment` }))),
        BehaviourPlanningContractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
        BehaviourCurrentLevelV2: index === 0 ? 'Developing' : null,
        BehaviourTargetLevelV2: index === 0 ? 'Effective' : null,
        BehaviourTargetLevelReasonV2: null,
        BehaviourV2SelectedSuggestionKeysJSON: '[]',
        BehaviourV2SelectionSnapshotsJSON: encoded.json,
        BehaviourV2SelectionSnapshotsSHA256: encoded.sha256,
        BehaviourV2SelectionSnapshotsUtf8ByteLength: encoded.utf8ByteLength
      } };
    })];
  const proof = (workplan: C2bTrustedWorkplanHeader, current: C2bTrustedAnnualItem[]): C2bTrustedAnnualReadiness => ({
    ...readiness(workplan, current), behaviourContractVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    sourceHeaderETag: workplan.etag,
    sourceItemsIdentitySha256: hashC2bCanonical(current.map(item => ({
      naturalKey: item.workplanItemNaturalKey, etag: item.etag, rowVersionToken: item.rowVersionToken
    })).sort((left, right) => left.naturalKey.localeCompare(right.naturalKey))),
    deliveryWeightConfigurationSha256: 'B'.repeat(64), behaviourPublicationSha256: 'C'.repeat(64)
  });

  it('BUILD PM50 replay rejects forged saved image, stale token, switched manager and replayed readiness', () => {
    const draft = annualHeader(); const current = annualItems();
    const call = (workplan: C2bTrustedWorkplanHeader, rows: C2bTrustedAnnualItem[],
      evidence: C2bTrustedAnnualReadiness = proof(workplan, rows)): C2bCommandPlan =>
      planSubmitWorkplanC2b(JSON.stringify(command('SEC-PM50-SUBMIT', 'SubmitWorkplan', {})), employee.email,
        employee, manager, v02Configuration, workplan, rows, evidence, processedAt, acls(false));
    const changedSelection = current.map((item, index) => index === 1 ? { ...item,
      fields: { ...item.fields, BehaviourV2SelectionSnapshotsJSON: '{"forged":true}' } } : item);
    expect(() => call(draft, changedSelection)).toThrow(/planning or focus provenance/);
    const legacy = current.map((item, index) => index === 1 ? { ...item,
      fields: { ...item.fields, ScoredContribution: 10 } } : item);
    expect(() => call(draft, legacy)).toThrow();
    expect(() => call({ ...draft, rowVersionToken: draft.rowVersionToken + 1 }, current))
      .toThrow(/ETag or token|stale/);
    expect(() => call(draft, current, { ...proof(draft, current), sourceHeaderETag: '"replayed"' }))
      .toThrow(/readiness/);
    const otherManager = { ...manager, personKey: 'PERSON-OTHER', email: 'other@example.invalid' };
    expect(() => planApproveAndLockWorkplanC2b(command('SEC-PM50-APPROVE', 'ApproveAndLockWorkplan', {}),
      otherManager.email, employee, otherManager, v02Configuration, annualHeader('Submitted'), current,
      proof(annualHeader('Submitted'), current), processedAt, acls(false))).toThrow(/manager|identity/i);
  });

  it('submits five exact saved Values, then rechecks the submitted image for manager approval', () => {
    const draft = annualHeader(); const current = annualItems();
    const submitted = planSubmitWorkplanC2b(JSON.stringify(command('CMD-V02-SUBMIT', 'SubmitWorkplan', {})), employee.email,
      employee, manager, v02Configuration, draft, current, proof(draft, current), processedAt, acls(false));
    expect(submitted.intendedImage.header.fields).toMatchObject({ State: 'Submitted', AccessState: 'ManagerDecision' });
    const submittedReceipt = execute(submitted);
    expect(submittedReceipt.state).toBe('Terminal');
    expect(submittedReceipt.stableRead?.readbackSha256).toBe(submitted.intendedImageSha256);
    const submittedHeader = annualHeader('Submitted');
    const approved = planApproveAndLockWorkplanC2b(command('CMD-V02-APPROVE', 'ApproveAndLockWorkplan', {}),
      manager.email, employee, manager, v02Configuration, submittedHeader, current,
      proof(submittedHeader, current), processedAt, acls(false));
    expect(approved.intendedImage.header.fields).toMatchObject({ State: 'Locked', AccessState: 'ReadOnly' });
    expect(approved.effects.some(effect => effect.kind === 'ReceiptCreate')).toBe(true);
    const approvedReceipt = execute(approved);
    expect(approvedReceipt.state).toBe('Terminal');
    expect(approvedReceipt.stableRead?.readbackSha256).toBe(approved.intendedImageSha256);
  });

  const submitUntrusted = (value: unknown): C2bCommandPlan => {
    const draft = annualHeader(); const current = annualItems();
    return planSubmitWorkplanC2b(value, employee.email,
      employee, manager, v02Configuration, draft, current, proof(draft, current), processedAt, acls(false));
  };

  it('BUILD PM50 replay rejects a symbol-bearing direct Submit command', () => {
    const withSymbol = { ...command('CMD-SYMBOL', 'SubmitWorkplan', {}), [Symbol('hidden')]: 'forged' };
    expect(() => submitUntrusted(withSymbol)).toThrow(/JSON text is required/);
  });

  it('BUILD PM50 replay rejects an accessor before calling its getter', () => {
    let getterCalls = 0;
    const withAccessor = Object.defineProperty({}, 'commandKey', { enumerable: true, get: () => {
      getterCalls += 1; return 'CMD-ACCESSOR';
    } });
    expect(() => submitUntrusted(withAccessor)).toThrow(/JSON text is required/);
    expect(getterCalls).toBe(0);
  });

  it('BUILD PM50 replay rejects a Proxy before any trap or value access', () => {
    let proxyTraps = 0;
    const withProxy = new Proxy({}, { get: () => { proxyTraps += 1; return 'forged'; },
      ownKeys: () => { proxyTraps += 1; return []; },
      getOwnPropertyDescriptor: () => { proxyTraps += 1; return undefined; } });
    expect(() => submitUntrusted(withProxy)).toThrow(/JSON text is required/);
    expect(proxyTraps).toBe(0);
  });

  it('rejects malformed and unknown-field JSON text', () => {
    expect(() => submitUntrusted('{bad')).toThrow(/malformed JSON/);
    expect(() => submitUntrusted(JSON.stringify({ ...command('CMD-EXTRA', 'SubmitWorkplan', {}), extra: true })))
      .toThrow(/unknown client fields/);
  });

  it('rejects missing Values, crossed annual Target, stale manager proof and legacy v02 weight writes', () => {
    const draft = annualHeader(); const current = annualItems();
    const submit = (itemsValue: C2bTrustedAnnualItem[], evidence = proof(draft, itemsValue)): C2bCommandPlan =>
      planSubmitWorkplanC2b(JSON.stringify(command('CMD-V02-SUBMIT', 'SubmitWorkplan', {})), employee.email,
        employee, manager, v02Configuration, draft, itemsValue, evidence, processedAt, acls(false));
    expect(() => planSubmitWorkplanC2b(JSON.stringify(command('CMD-V02-CLIENT-CONFIG', 'SubmitWorkplan', {
      deliveryWeightConfiguration: { core: 70, impact: 30 }
    })), employee.email, employee, manager, v02Configuration, draft, current, proof(draft, current),
    processedAt, acls(false))).toThrow();
    expect(() => submit(current.slice(0, -1))).toThrow(/five Values|Value/);
    const mixed = current.map((item, index) => index === 1 ? { ...item,
      fields: { ...item.fields, BehaviourFrameworkVersion: 'KCCC-BEHAVIOUR|v01' } } : item);
    expect(() => submit(mixed)).toThrow(/stored Value snapshot|v02/);
    const unknownHeader = { ...draft, fields: { ...draft.fields,
      BehaviourContractVersion: 'KCCC-BEHAVIOUR|v03' } };
    expect(() => planSubmitWorkplanC2b(JSON.stringify(command('CMD-V02-UNKNOWN', 'SubmitWorkplan', {})), employee.email,
      employee, manager, v02Configuration, unknownHeader, current, proof(unknownHeader, current),
      processedAt, acls(false))).toThrow(/contract versions are crossed/);
    const crossed = current.map((item, index) => index === 1 ? { ...item,
      fields: { ...item.fields, BehaviourTargetLevelV2: 'Unknown' } } : item);
    expect(() => submit(crossed)).toThrow(/planning or focus provenance/);
    const managerHeader = annualHeader('Submitted');
    expect(() => planApproveAndLockWorkplanC2b(command('CMD-V02-DENIED', 'ApproveAndLockWorkplan', {}),
      employee.email, employee, manager, v02Configuration, managerHeader, current,
      proof(managerHeader, current), processedAt, acls(false))).toThrow(/manager|identity|actor/i);
    expect(() => planApproveAndLockWorkplanC2b(command('CMD-V02-APPROVE', 'ApproveAndLockWorkplan', {}),
      manager.email, employee, manager, v02Configuration, managerHeader, current,
      { ...proof(managerHeader, current), sourceItemsSha256: 'F'.repeat(64) }, processedAt, acls(false)))
      .toThrow(/readiness/);
    const changedEtag = current.map((item, index) => index === 1 ? { ...item, etag: '"new-item-version"' } : item);
    expect(() => planApproveAndLockWorkplanC2b(command('CMD-V02-APPROVE-ETAG', 'ApproveAndLockWorkplan', {}),
      manager.email, employee, manager, v02Configuration, managerHeader, changedEtag,
      proof(managerHeader, current), processedAt, acls(false))).toThrow(/readiness/);
    expect(() => planUpdateWorkplanDraftC2b(command('CMD-V02-DRAFT', 'UpdateWorkplanDraftV2', {
      coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10
    }), employee.email, employee, manager, v02Configuration, draft, current, processedAt, acls(false)))
      .toThrow(/legacy category weights/);
  });
});

describe('A012 exact schemas, identities, natural keys, lifecycle and readiness fail closed', () => {
  it.each([
    ['UpdateWorkplanDraftV2', () => { const draft = header(); const current = items();
      return planUpdateWorkplanDraftC2b(command('CMD-U-DRAFT', 'UpdateWorkplanDraftV2', {
        coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, unknown: true
      }), employee.email, employee, manager, configuration, draft, current, processedAt, acls(false)); }],
    ['UpsertCoreContributionV2', () => { const draft = header(); const current = items();
      return planUpsertCoreContributionC2b(command('CMD-U-CORE', 'UpsertCoreContributionV2', {
        ...corePayload(), unknown: true
      }), employee.email, employee, manager, configuration, draft, undefined, current, processedAt,
      acls(true), catalogue, { workplanItemKey: 'CORE-UNKNOWN' }); }],
    ['UpsertPersonalItemV2', () => { const draft = header(); const current = items();
      return planUpsertPersonalItemC2b(command('CMD-U-PERSONAL', 'UpsertPersonalItemV2', {
        ...personalPayload(), unknown: true
      }), employee.email, employee, manager, configuration, draft, undefined, current, processedAt,
      acls(true), { workplanItemKey: 'PERSONAL-UNKNOWN' }); }],
    ['SetCoreWeightingV2', () => { const draft = header(); const current = items();
      return planSetCoreWeightingC2b(command('CMD-U-WEIGHTS', 'SetCoreWeightingV2', { mode: 'Equal', unknown: true }),
        employee.email, employee, manager, configuration, draft, current, processedAt, acls(true)); }],
    ['SubmitWorkplan', () => { const draft = header(); const current = items();
      return planSubmitWorkplanC2b(JSON.stringify(command('CMD-U-SUBMIT', 'SubmitWorkplan', { unknown: true })), employee.email,
        employee, manager, configuration, draft, current, readiness(draft, current), processedAt, acls(false)); }],
    ['RequestWorkplanChanges', () => { const submitted = header('Submitted');
      return planRequestWorkplanChangesC2b(command('CMD-U-CHANGES', 'RequestWorkplanChanges', {
        reason: 'Valid reason.', unknown: true
      }), manager.email, employee, manager, configuration, submitted, items(), processedAt, acls(false)); }],
    ['ApproveAndLockWorkplan', () => { const submitted = header('Submitted'); const current = items();
      return planApproveAndLockWorkplanC2b(command('CMD-U-APPROVE', 'ApproveAndLockWorkplan', { unknown: true }),
        manager.email, employee, manager, configuration, submitted, current, readiness(submitted, current),
        processedAt, acls(false)); }],
    ['CreateWorkplanAmendmentV2', () => { const locked = header('Locked');
      return planCreateWorkplanAmendmentC2b(command('CMD-U-AMEND',
        'CreateWorkplanAmendmentV2', { reason: 'Valid.', controlReference: 'CONTROL-KPI-012', unknown: true }),
      systemAdmin.email, systemAdmin, employee, manager, configuration, locked, items(), processedAt,
      acls(true), [controlCase(locked)], source); }]
  ] as Array<[string, () => C2bCommandPlan]>)('%s rejects unknown payload fields', (_name, attempt) => {
    expect(attempt).toThrow(/unknown|protected/i);
  });

  it('supports Core create, update, reactivate and deactivation without delete', () => {
    const draft = header();
    const created = plans().find(value => value[0] === 'UpsertCoreContributionV2')![1];
    expect(created.effects.find(effect => effect.kind === 'CanonicalUpsert')).toMatchObject({
      expectedETag: null, expectedRowVersionToken: 0,
      desiredFields: { KPIID: 'KPI-NEW', KPIVersionKey: 'KPI-NEW|V1', ActiveInWorkplan: true, RowVersionToken: 1 }
    });
    const sourceCurrent = annualItem('CoreGold', 'KPI-NEW', 6);
    const current: C2bTrustedAnnualItem = { ...sourceCurrent,
      fields: { ...sourceCurrent.fields, KPIID: 'KPI-NEW', KPIVersionKey: 'OLD', TargetVersionKey: 'OLD' } };
    const updated = planUpsertCoreContributionC2b(command('CMD-CORE-UPDATE', 'UpsertCoreContributionV2', corePayload()),
      employee.email, employee, manager, configuration, draft, current, [current], processedAt,
      acls(true), catalogue, { workplanItemKey: current.workplanItemKey });
    expect(updated.effects.find(effect => effect.kind === 'CanonicalUpsert')?.desiredFields)
      .toMatchObject({ KPIVersionKey: 'KPI-NEW|V1', ActiveInWorkplan: true, RowVersionToken: 7 });
    const deactivated = planUpsertCoreContributionC2b(command('CMD-CORE-OFF', 'UpsertCoreContributionV2',
      corePayload(false)), employee.email, employee, manager, configuration, draft, current, [current],
    processedAt, acls(true));
    expect(deactivated.effects.find(effect => effect.kind === 'CanonicalUpsert')?.desiredFields)
      .toMatchObject({ ActiveInWorkplan: false, RowVersionToken: 7 });
    expect(deactivated.effects.find(effect => effect.kind === 'CanonicalUpsert')?.desiredFields)
      .not.toHaveProperty('DeactivatedByEmail');
    expect(deactivated.effects.some(effect => effect.desiredFields.operation === 'Delete')).toBe(false);
  });

  it('supports Personal add/update/deactivate and rejects a duplicate natural key', () => {
    const draft = header();
    const current = annualItem('LocalPersonal', 'PERSONAL-X', 2);
    const updated = planUpsertPersonalItemC2b(command('CMD-PERSONAL-UPDATE', 'UpsertPersonalItemV2',
      personalPayload()), employee.email, employee, manager, configuration, draft, current, [current],
    processedAt, acls(true));
    expect(updated.effects.find(effect => effect.kind === 'CanonicalUpsert')?.desiredFields)
      .toMatchObject({ LocalKPIWording: 'Deliver synthetic outcome', ActiveInWorkplan: true, RowVersionToken: 3 });
    const off = planUpsertPersonalItemC2b(command('CMD-PERSONAL-OFF', 'UpsertPersonalItemV2',
      personalPayload(false)), employee.email, employee, manager, configuration, draft, current, [current],
    processedAt, acls(true));
    expect(off.effects.find(effect => effect.kind === 'CanonicalUpsert')?.desiredFields)
      .toMatchObject({ ActiveInWorkplan: false, RowVersionToken: 3 });
    expect(() => planUpsertPersonalItemC2b(command('CMD-PERSONAL-DUP', 'UpsertPersonalItemV2', personalPayload()),
      employee.email, employee, manager, configuration, draft, undefined, [current], processedAt,
      acls(true), { workplanItemKey: current.workplanItemKey })).toThrow(/natural.?key/);
  });

  it('reconciles Equal and Custom weights to every active Core row and rejects an incomplete map', () => {
    const draft = header(); const current = items();
    const equal = planSetCoreWeightingC2b(command('CMD-EQUAL', 'SetCoreWeightingV2', { mode: 'Equal' }),
      employee.email, employee, manager, configuration, draft, current, processedAt, acls(true));
    expect(equal.effects.filter(effect => effect.kind === 'CanonicalUpsert').map(effect => effect.desiredFields.CoreWorkplanWeight))
      .toEqual([50, 50]);
    const custom = planSetCoreWeightingC2b(command('CMD-CUSTOM', 'SetCoreWeightingV2', {
      mode: 'Custom', customWeights: [{ kpiId: 'KPI-001', weight: 40 }, { kpiId: 'KPI-002', weight: 60 }]
    }), employee.email, employee, manager, configuration, draft, current, processedAt, acls(true));
    expect(custom.effects.filter(effect => effect.kind === 'CanonicalUpsert').map(effect => effect.desiredFields.CoreWorkplanWeight))
      .toEqual([40, 60]);
    expect(() => planSetCoreWeightingC2b(command('CMD-BAD-CUSTOM', 'SetCoreWeightingV2', {
      mode: 'Custom', customWeights: [{ kpiId: 'KPI-001', weight: 100 }]
    }), employee.email, employee, manager, configuration, draft, current, processedAt, acls(true)))
      .toThrow(/complete affected Core set/);
  });

  it('rejects unknown/protected payload fields, forged employee and stale header ETag', () => {
    const draft = header(); const current = items();
    expect(() => planUpdateWorkplanDraftC2b(command('CMD-UNKNOWN', 'UpdateWorkplanDraftV2', {
      coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, actorEmail: employee.email
    }), employee.email, employee, manager, configuration, draft, current, processedAt, acls(false)))
      .toThrow(/unknown|Protected/);
    expect(() => planSubmitWorkplanC2b(JSON.stringify(command('CMD-FORGED', 'SubmitWorkplan', {})), 'forged@example.invalid',
      employee, manager, configuration, draft, current, readiness(draft, current), processedAt, acls(false)))
      .toThrow(/key-plus-email/);
    expect(() => planSubmitWorkplanC2b(JSON.stringify(command('CMD-STALE', 'SubmitWorkplan', {})), employee.email,
      employee, manager, configuration, { ...draft, etag: '*' }, current, readiness(draft, current),
      processedAt, acls(false))).toThrow(/ETag|stale/);
  });

  it('binds Submit and Approve to exact complete readiness and rejects stale or incomplete evidence', () => {
    const draft = header(); const submitted = header('Submitted'); const current = items();
    expect(() => planSubmitWorkplanC2b(JSON.stringify(command('CMD-NOT-READY', 'SubmitWorkplan', {})), employee.email,
      employee, manager, configuration, draft, current, { ...readiness(draft, current), complete: false,
        blockerCodes: ['CORE_INCOMPLETE'] }, processedAt, acls(false))).toThrow(/readiness/);
    expect(() => planApproveAndLockWorkplanC2b(command('CMD-STALE-READY', 'ApproveAndLockWorkplan', {}),
      manager.email, employee, manager, configuration, submitted, current,
      { ...readiness(submitted, current), sourceItemsSha256: 'F'.repeat(64) }, processedAt, acls(false)))
      .toThrow(/readiness/);
  });

  it('requires the exact assigned manager and mandatory safe Request Changes reason', () => {
    const submitted = header('Submitted'); const current = items();
    expect(() => planRequestWorkplanChangesC2b(command('CMD-NO-REASON', 'RequestWorkplanChanges', { reason: ' ' }),
      manager.email, employee, manager, configuration, submitted, current, processedAt, acls(false)))
      .toThrow(/mandatory reason/);
    expect(() => planRequestWorkplanChangesC2b(command('CMD-FORGED-MANAGER', 'RequestWorkplanChanges',
      { reason: 'Valid reason.' }), employee.email, employee, manager, configuration, submitted, current,
    processedAt, acls(false))).toThrow(/assigned manager/);
    const managerPlan = plans().find(value => value[0] === 'RequestWorkplanChanges')![1];
    const wrongRolePlan = createC2bCommandPlan({ commandKey: managerPlan.commandKey,
      commandType: managerPlan.commandType, personKey: managerPlan.personKey, subjectKey: managerPlan.subjectKey,
      performanceYear: managerPlan.performanceYear, payload: JSON.parse(managerPlan.payloadCanonical) as unknown,
      intendedImage: managerPlan.intendedImage, effects: managerPlan.effects });
    expect(() => admitC2bPlan(undefined, wrongRolePlan, processedAt)).toThrow(/actor role/);
  });

  it('requires exact SystemAdmin, approved/locked history, mandatory reason and CONTROL reference for amendment', () => {
    const locked = header('Locked'); const current = items();
    expect(() => planCreateWorkplanAmendmentC2b(command('CMD-NOT-ADMIN', 'CreateWorkplanAmendmentV2',
      { reason: 'Correction.', controlReference: 'CONTROL-KPI-012' }), manager.email, manager,
    employee, manager, configuration, locked, current, processedAt, acls(true),
    [controlCase(locked)], source)).toThrow(/SystemAdmin/);
    expect(() => planCreateWorkplanAmendmentC2b(command('CMD-BAD-CONTROL', 'CreateWorkplanAmendmentV2',
      { reason: '', controlReference: 'TICKET-1' }), systemAdmin.email, systemAdmin,
    employee, manager, configuration, locked, current, processedAt, acls(true),
    [controlCase(locked)], source)).toThrow(/reason and CONTROL/);
    const amended = planCreateWorkplanAmendmentC2b(command('CMD-AMEND-OK', 'CreateWorkplanAmendmentV2',
      { reason: 'Correction.', controlReference: 'CONTROL-KPI-012' }), systemAdmin.email, systemAdmin,
    employee, manager, configuration, locked, current, processedAt, acls(true),
    [controlCase(locked)], source);
    expect(amended.intendedImage.header.fields).toMatchObject({ State: 'ChangesRequested', AccessState: 'EmployeeEdit',
      WorkplanVersion: 2 });
    expect(amended.intendedImage.items.every(item => item.fields.WorkplanVersion === 2)).toBe(true);
    expect(amended.actorPersonKey).toBe(systemAdmin.personKey);
  });

  it('rejects missing ACL images and command-key collision while preserving the original journal', () => {
    const draft = header(); const current = items();
    expect(() => planSetCoreWeightingC2b(command('CMD-NO-ITEM-ACL', 'SetCoreWeightingV2', { mode: 'Equal' }),
      employee.email, employee, manager, configuration, draft, current, processedAt, acls(false)))
      .toThrow(/ACL observation/);
    const first = plans()[0][1];
    const existing = admitC2bPlan(undefined, first, processedAt);
    if (existing.status !== 'Created') throw new Error('Expected created.');
    const sourceHeader = header();
    const changedHeader: C2bTrustedWorkplanHeader = { ...sourceHeader,
      fields: { ...sourceHeader.fields, CoreCategoryWeight: 60 } };
    const different = planUpdateWorkplanDraftC2b(command('CMD-DRAFT', 'UpdateWorkplanDraftV2', {
      coreCategoryWeight: 60, personalCategoryWeight: 30, behaviourCategoryWeight: 10,
      categoryWeightReason: 'Synthetic collision.'
    }), employee.email, employee, manager, configuration, changedHeader, current, processedAt, acls(false));
    const collision = admitC2bPlan(existing.journal, different, processedAt);
    expect(collision).toMatchObject({ status: 'Collision', audit: { outcome: 'Collision' },
      receipt: { outcome: 'Rejected' } });
    expect(collision.journal.plan.planSha256).toBe(first.planSha256);
  });
});

describe('A014 annual handler integrity repair', () => {
  const amendmentPlan = (controlCases: readonly ISec006ControlCase[], reason: unknown = 'Controlled correction.',
    commandKey = '575d0745-eb5b-418e-a659-4b18cbc08ab1'): C2bCommandPlan => {
    const locked = header('Locked', 13);
    return planCreateWorkplanAmendmentC2b(rawCommand(commandKey, 'CreateWorkplanAmendmentV2', {
      reason, controlReference: 'CONTROL-KPI-012'
    }), systemAdmin.email, systemAdmin, employee, manager, configuration, locked, items(), processedAt,
    acls(true), controlCases, source);
  };

  it('enforces the stable lower-case GUID command key in every planner and admission path', () => {
    const draft = header(); const submitted = header('Submitted', 9); const locked = header('Locked', 13);
    const current = items(); const invalid = 'NOT-A-GUID';
    const attempts: Array<() => C2bCommandPlan> = [
      () => planCreateWorkplanDraftC2b(rawCommand(invalid, 'CreateWorkplanDraft', {}), employee.email,
        employee, manager, configuration, acls(false)),
      () => planUpdateWorkplanDraftC2b(rawCommand(invalid, 'UpdateWorkplanDraftV2', {
        coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10
      }), employee.email, employee, manager, configuration, draft, current, processedAt, acls(false)),
      () => planUpsertCoreContributionC2b(rawCommand(invalid, 'UpsertCoreContributionV2', corePayload()),
        employee.email, employee, manager, configuration, draft, undefined, current, processedAt,
        acls(true), catalogue, { workplanItemKey: 'CORE-NEW-001' }),
      () => planUpsertPersonalItemC2b(rawCommand(invalid, 'UpsertPersonalItemV2', personalPayload()),
        employee.email, employee, manager, configuration, draft, undefined, current, processedAt,
        acls(true), { workplanItemKey: 'PERSONAL-NEW-001' }),
      () => planSetCoreWeightingC2b(rawCommand(invalid, 'SetCoreWeightingV2', { mode: 'Equal' }),
        employee.email, employee, manager, configuration, draft, current, processedAt, acls(true)),
      () => planSubmitWorkplanC2b(JSON.stringify(rawCommand(invalid, 'SubmitWorkplan', {})), employee.email,
        employee, manager, configuration, draft, current, readiness(draft, current), processedAt, acls(false)),
      () => planRequestWorkplanChangesC2b(rawCommand(invalid, 'RequestWorkplanChanges', { reason: 'Visible.' }),
        manager.email, employee, manager, configuration, submitted, current, processedAt, acls(false)),
      () => planApproveAndLockWorkplanC2b(rawCommand(invalid, 'ApproveAndLockWorkplan', {}), manager.email,
        employee, manager, configuration, submitted, current, readiness(submitted, current), processedAt, acls(false)),
      () => planCreateWorkplanAmendmentC2b(rawCommand(invalid, 'CreateWorkplanAmendmentV2', {
        reason: 'Visible.', controlReference: 'CONTROL-KPI-012'
      }), systemAdmin.email, systemAdmin, employee, manager, configuration, locked, current, processedAt,
      acls(true), [controlCase(locked)], source)
    ];
    attempts.forEach(attempt => expect(attempt).toThrow(/rejected/i));

    const valid = plans()[0][1];
    const invalidAdmission = createC2bCommandPlan({ commandKey: invalid, commandType: valid.commandType,
      personKey: valid.personKey, actorPersonKey: valid.actorPersonKey, effectiveRole: valid.effectiveRole,
      subjectKey: valid.subjectKey, performanceYear: valid.performanceYear,
      payload: JSON.parse(valid.payloadCanonical) as unknown, intendedImage: valid.intendedImage, effects: valid.effects });
    expect(() => admitC2bPlan(undefined, invalidAdmission, processedAt)).toThrow(/immutable identity/);
    expect(() => createC2bRejectedOutcome({ commandKey: invalid, commandType: valid.commandType,
      personKey: valid.personKey, subjectKey: valid.subjectKey, performanceYear: valid.performanceYear },
    {}, 'INVALID_COMMAND', 'Rejected invalid key.', processedAt)).toThrow(/command identity/);
  });

  it.each([
    '7cd2b366-aa4d-4d2c-a046-a5ca92624918'.toUpperCase(),
    '48edd2d9-f389-4d69-a005-b7e482c29c89',
    'c6e3c237-f2fc-40f7-abf7-ba96e3142250',
    '{7cd2b366-aa4d-4d2c-a046-a5ca92624918}',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa'
  ])('rejects malformed stable-command format %s', invalidCommandKey => {
    expect(() => planCreateWorkplanDraftC2b(rawCommand(invalidCommandKey, 'CreateWorkplanDraft', {}),
      employee.email, employee, manager, configuration, acls(false))).toThrow(/rejected/);
  });

  it.each([
    ['invisible-only', '\u200B'],
    ['interior default-ignorable', 'visible\u200Btext'],
    ['lone surrogate', '\uD800'],
    ['mark-only', '\u0301\u0308']
  ])('rejects %s reasons for Request Changes and Amendment', (_label, unsafeReason) => {
    const submitted = header('Submitted', 9);
    expect(() => planRequestWorkplanChangesC2b(command(`REASON-${_label}`, 'RequestWorkplanChanges', {
      reason: unsafeReason
    }), manager.email, employee, manager, configuration, submitted, items(), processedAt, acls(false)))
      .toThrow(/mandatory reason/);
    const locked = header('Locked', 13);
    expect(() => planCreateWorkplanAmendmentC2b(command(`AMEND-${_label}`, 'CreateWorkplanAmendmentV2', {
      reason: unsafeReason, controlReference: 'CONTROL-KPI-012'
    }), systemAdmin.email, systemAdmin, employee, manager, configuration, locked, items(), processedAt,
    acls(true), [controlCase(locked)], source)).toThrow(/reason and CONTROL/);
  });

  it('normalises valid Unicode reasons to NFC once for both manager and amendment transitions', () => {
    const submitted = header('Submitted', 9);
    const request = planRequestWorkplanChangesC2b(command('UNICODE-REQUEST', 'RequestWorkplanChanges', {
      reason: '  Cafe\u0301 outcome ✅  '
    }), manager.email, employee, manager, configuration, submitted, items(), processedAt, acls(false));
    expect(request.intendedImage.header.fields.ManagerDecisionComment).toBe('Café outcome ✅');
    const locked = header('Locked', 13);
    const amendment = planCreateWorkplanAmendmentC2b(command('UNICODE-AMEND', 'CreateWorkplanAmendmentV2', {
      reason: '\u200BCafe\u0301 correction ✅\u200B', controlReference: 'CONTROL-KPI-012'
    }), systemAdmin.email, systemAdmin, employee, manager, configuration, locked, items(), processedAt,
    acls(true), [controlCase(locked)], source);
    expect(amendment.intendedImage.header.fields.ManagerDecisionComment).toBe('Café correction ✅');
  });

  it.each(['CoreGold', 'LocalPersonal', 'Behaviour'] as const)(
    'derives and validates the complete-set %s natural key from WorkplanKey|ItemType|ReferenceID', itemType => {
      const draft = header();
      const corrupt = annualItem(itemType, `${itemType}-001`, 7);
      corrupt.workplanItemNaturalKey = `${draft.workplanKey}|${itemType}|WRONG`;
      corrupt.fields = { ...corrupt.fields, WorkplanItemNaturalKey: corrupt.workplanItemNaturalKey };
      expect(() => planUpdateWorkplanDraftC2b(command(`NATURAL-${itemType}`, 'UpdateWorkplanDraftV2', {
        coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10
      }), employee.email, employee, manager, configuration, draft, [corrupt], processedAt, acls(false)))
        .toThrow(/complete current item set/);
    });

  it('uses the complete-set row as the sole update source and rejects split or unknown field images', () => {
    const draft = header();
    const complete = annualItem('CoreGold', 'KPI-001', 7);
    const split = { ...complete, fields: { ...complete.fields, ProtectedInjected: 'forbidden' } };
    const coreCatalogue = { ...catalogue, kpiId: 'KPI-001', kpiVersionKey: 'KPI-001|V1',
      targetVersionKey: 'KPI-001|2027|V1' };
    expect(() => planUpsertCoreContributionC2b(command('SPLIT-IMAGE', 'UpsertCoreContributionV2', {
      ...corePayload(), kpiId: 'KPI-001'
    }), employee.email, employee, manager, configuration, draft, split, [complete], processedAt,
    acls(true), coreCatalogue, { workplanItemKey: complete.workplanItemKey }))
      .toThrow(/byte-canonically/);
    const unknownComplete = { ...complete, fields: { ...complete.fields, ProtectedInjected: 'forbidden' } };
    expect(() => planUpdateWorkplanDraftC2b(command('UNKNOWN-IMAGE', 'UpdateWorkplanDraftV2', {
      coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10
    }), employee.email, employee, manager, configuration, draft, [unknownComplete], processedAt, acls(false)))
      .toThrow(/complete current item set/);
  });

  it('reconciles the approved physical vocabulary and routes deactivation history to Audit/versioning', () => {
    const itemFields = EMPLOYEE_V2_PHYSICAL_ASSETS
      .find(asset => asset.listTitle === 'KCFKPI_WorkplanItems')!.fieldsUsed;
    expect(itemFields).toEqual(expect.arrayContaining(['ContributionWeight', 'AddedByEmail', 'AddedAt']));
    expect(itemFields).not.toEqual(expect.arrayContaining(['AdditiveEligible', 'DeactivatedAt', 'DeactivatedByEmail']));
    const created = plans().find(entry => entry[0] === 'UpsertCoreContributionV2')![1]
      .effects.find(effect => effect.kind === 'CanonicalUpsert')!;
    expect(created.desiredFields).toMatchObject({ AddedByEmail: employee.email, AddedAt: processedAt });
    expect(created.desiredFields).not.toHaveProperty('AdditiveEligible');
    const current = annualItem('CoreGold', 'KPI-NEW', 7);
    const deactivated = planUpsertCoreContributionC2b(command('SCHEMA-DEACTIVATE', 'UpsertCoreContributionV2',
      corePayload(false)), employee.email, employee, manager, configuration, header(), current, [current],
    processedAt, acls(true));
    const desired = deactivated.effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields;
    expect(desired).toMatchObject({ ActiveInWorkplan: false, RowVersionToken: 8 });
    expect(desired).not.toHaveProperty('DeactivatedAt');
    expect(desired).not.toHaveProperty('DeactivatedByEmail');
    expect(deactivated.effects.filter(effect => effect.kind === 'AuditAppend')).toHaveLength(1);
  });

  it.each([
    ['inactive', { active: false }],
    ['revoked', { revoked: true, revokedAtUtc: processedAt, revocationReason: 'Withdrawn.' }],
    ['not yet valid', { validFromUtc: '2026-09-12T05:45:01Z' }],
    ['expired', { validToUtc: '2026-09-12T05:44:59Z' }],
    ['invalid validity', { validFromUtc: 'not-a-time' }],
    ['consumed', { active: false, consumedAtUtc: processedAt, consumedCommandKey: 'adf90042-e03b-4a77-a298-4494675b2c64' }],
    ['held', { recoveryHoldAtUtc: processedAt, recoveryHoldReason: 'Reconcile.' }],
    ['wrong subject', { subjectKey: 'PERSON-999|2027' }],
    ['wrong version', { workplanVersion: 99 }],
    ['wrong action', { authorisedAction: 'NotAuthorised' } as unknown as Partial<ISec006ControlCase>],
    ['wrong reference', { controlReference: 'CONTROL-OTHER-999' }],
    ['stale canonical token', { expectedRowVersionToken: 99 }],
    ['missing storage CAS', { storageETag: '*' }]
  ] as Array<[string, Partial<ISec006ControlCase>]>)('rejects an %s authoritative CONTROL case', (_label, overrides) => {
    const locked = header('Locked', 13);
    expect(() => amendmentPlan([controlCase(locked, overrides)])).toThrow(/CONTROL case|CONTROL-case/);
  });

  it('rejects missing and ambiguous CONTROL-case observations', () => {
    const locked = header('Locked', 13); const authorised = controlCase(locked);
    expect(() => amendmentPlan([])).toThrow(/missing or ambiguous/);
    expect(() => amendmentPlan([authorised, { ...authorised }])).toThrow(/missing or ambiguous/);
  });

  it('plans one-winner CONTROL-case CAS before canonical mutation and rejects replay/stale-store consumption', () => {
    const locked = header('Locked', 13); const authorised = controlCase(locked);
    const plan = amendmentPlan([authorised]);
    expect(plan.effects.slice(0, 2).map(effect => effect.kind)).toEqual(['ControlCaseConsume', 'Claim']);
    const consumeEffect = plan.effects[0];
    const consumption = plannedConsumption(consumeEffect);
    const store = new Sec006AtomicControlCaseMemoryStore([authorised]);
    expect(store.compareAndSwapConsume(consumption)).toMatchObject({ accepted: true, code: 'CONSUMED' });
    expect(store.compareAndSwapConsume(consumption)).toMatchObject({ accepted: false,
      code: 'CONTROL_CASE_ALREADY_CONSUMED' });

    const admitted = admitC2bPlan(undefined, plan, processedAt);
    if (admitted.status !== 'Created') throw new Error('Expected created amendment journal.');
    expect(admitC2bPlan(admitted.journal, plan, processedAt).status).toBe('Replay');

    const staleStore = new Sec006AtomicControlCaseMemoryStore([
      controlCase(locked, { storageETag: '"control-8"', storageRowVersionToken: 8 })
    ]);
    expect(staleStore.compareAndSwapConsume(consumption)).toMatchObject({ accepted: false,
      code: 'CONTROL_CASE_STALE_WRITE' });
  });

  it('recovers an unknown consumed CONTROL-case effect without re-consuming or skipping the canonical Claim', () => {
    const locked = header('Locked', 13); const authorised = controlCase(locked);
    const plan = amendmentPlan([authorised]);
    const store = new Sec006AtomicControlCaseMemoryStore([authorised]);
    const admitted = admitC2bPlan(undefined, plan, processedAt);
    if (admitted.status !== 'Created') throw new Error('Expected created amendment journal.');
    let journal = acquireC2bLease(admitted.journal, 'PROCESSOR-A', processedAt, leaseExpiry,
      admitted.journal.journalVersion);
    const consumeEffect = journal.effects[0];
    journal = issueNextC2bEffect(journal, consumeEffect.effectKey, 'PROCESSOR-A', journal.leaseEpoch,
      processedAt, journal.journalVersion);
    const consumption = plannedConsumption(consumeEffect);
    const consumed = store.compareAndSwapConsume(consumption);
    expect(consumed).toMatchObject({ accepted: true, code: 'CONSUMED' });
    journal = settleC2bEffect(journal, consumeEffect.effectKey,
      { outcome: 'Unknown', safeCode: 'CONTROL_CASE_ACK_UNKNOWN' }, 'PROCESSOR-A', journal.leaseEpoch,
      processedAt, journal.journalVersion);
    expect(journal.state).toBe('Held');
    journal = recoverC2bEffect(journal, consumeEffect.effectKey, {
      outcome: 'Confirmed', providerReference: 'CONTROL-RECOVERY-READ', naturalKey: consumeEffect.naturalKey,
      requestETag: consumeEffect.expectedETag, observedETag: consumed.controlCase!.storageETag,
      observedRowVersionToken: consumed.controlCase!.storageRowVersionToken,
      readback: consumed.controlCase! as unknown as Record<string, unknown>
    }, processedAt, journal.journalVersion);
    expect(journal.effects[0].disposition).toBe('Confirmed');
    expect(journal.effects.find(effect => effect.disposition !== 'Confirmed')!.kind).toBe('Claim');
    expect(store.compareAndSwapConsume(consumption)).toMatchObject({ accepted: false,
      code: 'CONTROL_CASE_ALREADY_CONSUMED' });
  });
});
