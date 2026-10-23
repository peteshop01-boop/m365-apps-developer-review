/* eslint-disable @rushstack/no-new-null, @typescript-eslint/explicit-function-return-type -- synthetic native proof mirrors external null/CAS contracts */
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { IEmployeeV2CommandReceipt } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { ISec006ControlCase, ISec006ControlCaseConsumption } from './sec006/Sec006ControlCaseStore';
import type { IEmployeeV2AnnualCommandRequest, IEmployeeV2TransportResult } from './EmployeeWorkplanV2CommandTransport';
import {
  createEmployeeV2AnnualAdmissionEnvelope,
  employeeV2AnnualOuterBinding,
  serializeEmployeeV2AnnualCommand
} from './EmployeeWorkplanV2CommandTransport';
import type { IEmployeeWorkplanV2ListBindings } from './EmployeeWorkplanV2ListBindings';
import { LocallyValidatedEmployeeWorkplanV2C2bCommandGateway } from './EmployeeWorkplanV2C2bCommandGateway';
import {
  C2B_CONTRACT_VERSION,
  C2B_LIST_CAPABILITY_REQUIREMENTS,
  C2B_SCHEMA_REVISION,
  acquireC2bLease,
  admitC2bPlan,
  completeC2bReceipt,
  confirmC2bStableRead,
  hashC2bCanonical,
  issueNextC2bEffect,
  preflightC2bComposition,
  recoverC2bEffect,
  settleC2bEffect,
  type C2bCanonicalObservation,
  type C2bCommandJournal,
  type C2bEffectConfirmation,
  type C2bListAclImage,
  type C2bStableReadProof,
  type C2bTerminalReceipt
} from './TestPilotCommandAdmissionC2b';
import {
  type C2bTrustedAnnualConfiguration,
  type C2bTrustedAnnualItem,
  type C2bTrustedAnnualReadiness,
  type C2bTrustedCommandSource,
  type C2bTrustedCoreCatalogueItem,
  type C2bTrustedPerson,
  type C2bTrustedWorkplanHeader
} from './TestPilotCommandAdmissionC2bHandlers';
import {
  C2B_NATIVE_ADAPTER_CONTRACT_VERSION,
  C2B_REQUIRED_NATIVE_ADAPTER_CAPABILITIES,
  assertC2bNativeAdapterContract,
  type C2bNativeEffectResult,
  type IEmployeeWorkplanV2C2bNativeAdapter,
  type IC2bNativePlanningObservations,
  type IC2bNativeSourceObservation
} from './EmployeeWorkplanV2C2bNativeAdapter';
import { createEmployeeWorkplanV2C2bAnnualPlan } from './EmployeeWorkplanV2C2bAnnualCoordinator';

const processedAt = '2026-09-12T08:15:00Z';
const leaseExpiry = '2026-09-12T08:20:00Z';
const source: C2bTrustedCommandSource = {
  listId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53', itemId: 17, itemVersion: '1.0'
};
const employee: C2bTrustedPerson = {
  personKey: 'PERSON-001', email: 'employee@example.invalid', displayName: 'Synthetic Employee', active: true,
  roles: ['Employee'], managerPersonKey: 'MANAGER-001', managerEmail: 'manager@example.invalid'
};
const manager: C2bTrustedPerson = {
  personKey: 'MANAGER-001', email: 'manager@example.invalid', displayName: 'Synthetic Manager', active: true,
  roles: ['Employee', 'Manager'], managerPersonKey: null, managerEmail: null
};
const systemAdmin: C2bTrustedPerson = {
  personKey: 'ADMIN-001', email: 'admin@example.invalid', displayName: 'Synthetic System Admin', active: true,
  roles: ['SystemAdmin'], managerPersonKey: null, managerEmail: null
};
const configuration: C2bTrustedAnnualConfiguration = {
  schemaRevision: 'c2b-annual-v2', performanceYear: 2027,
  behaviourContractVersion: 'BEHAVIOUR-CONTRACT-OPAQUE', initialState: 'Draft',
  initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready', processorPrincipalKey: 'PROCESSOR-001',
  adminPrincipalKeys: ['ADMIN-GROUP-001']
};

const currentAcl = () => ({
  containerKey: employee.personKey, breaksInheritanceAtContainer: true as const, canonicalChildrenInherit: true as const,
  allowedPrincipals: [{ principalKey: 'LEGACY-READERS', permission: 'Read' as const, source: 'Admin' as const }],
  revokedPrincipalKeys: []
});
const acls = (withItems: boolean): { current: C2bListAclImage[] } => ({
  current: [{ listPurpose: 'Workplans', acl: currentAcl() },
    ...(withItems ? [{ listPurpose: 'WorkplanItems' as const, acl: currentAcl() }] : [])]
});
const header = (state: C2bTrustedWorkplanHeader['state'], token: number): C2bTrustedWorkplanHeader => {
  const accessState = state === 'Draft' || state === 'ChangesRequested' ? 'EmployeeEdit'
    : state === 'Submitted' ? 'ManagerDecision' : 'ReadOnly';
  const fields: Record<string, unknown> = {
    WorkplanKey: 'PERSON-001|2027', PersonKey: employee.personKey, EmployeeDisplayName: employee.displayName,
    EmployeeEmail: employee.email, ManagerPersonKey: manager.personKey, ManagerDisplayName: manager.displayName,
    ManagerEmail: manager.email, PerformanceYear: 2027, State: state, AccessState: accessState,
    TransitionStatus: 'Ready', CoreCategoryWeight: 70, PersonalCategoryWeight: 20,
    BehaviourCategoryWeight: 10, WorkplanVersion: 1, RowVersionToken: token
  };
  if (state === 'Submitted' || state === 'Approved' || state === 'Locked') {
    fields.SubmittedAt = '2026-09-12T08:00:00Z'; fields.SubmittedByEmail = employee.email;
  }
  if (state === 'Approved' || state === 'Locked') {
    fields.ApprovedAt = '2026-09-12T08:05:00Z'; fields.ApprovedByEmail = manager.email;
  }
  if (state === 'Locked') {
    fields.LockedAt = '2026-09-12T08:06:00Z'; fields.LockedByEmail = manager.email;
  }
  return { workplanKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    etag: `"header-${token}"`, rowVersionToken: token, state, accessState,
    transitionStatus: 'Ready', fields };
};
const annualItem = (itemType: C2bTrustedAnnualItem['itemType'], id: string, token: number): C2bTrustedAnnualItem => {
  const naturalKey = `PERSON-001|2027|${itemType}|${id}`;
  const fields: Record<string, unknown> = {
    WorkplanItemKey: id, WorkplanItemNaturalKey: naturalKey, WorkplanKey: 'PERSON-001|2027',
    PersonKey: employee.personKey, PerformanceYear: 2027, ItemType: itemType, ActiveInWorkplan: true,
    WorkplanVersion: 1, AddedByEmail: employee.email, AddedAt: processedAt, RowVersionToken: token
  };
  if (itemType === 'CoreGold') fields.KPIID = id;
  if (itemType === 'LocalPersonal') fields.LocalKPIWording = `Synthetic ${id}`;
  if (itemType === 'Behaviour') fields.BehaviourID = id;
  return { workplanItemKey: id, workplanItemNaturalKey: naturalKey, workplanKey: 'PERSON-001|2027',
    personKey: employee.personKey, performanceYear: 2027, itemType, activeInWorkplan: true,
    etag: `"item-${token}"`, rowVersionToken: token, fields };
};
const currentItems = [
  annualItem('CoreGold', 'KPI-001', 2), annualItem('CoreGold', 'KPI-002', 3),
  annualItem('LocalPersonal', 'PERSONAL-001', 4), annualItem('Behaviour', 'OPAQUE-001', 5)
];
const readiness = (valueHeader: C2bTrustedWorkplanHeader): C2bTrustedAnnualReadiness => ({
  complete: true, blockerCodes: [], pagingComplete: true,
  behaviourContractVersion: configuration.behaviourContractVersion,
  sourceHeaderSha256: hashC2bCanonical(valueHeader.fields),
  sourceItemsSha256: hashC2bCanonical(currentItems.map(item => ({
    naturalKey: item.workplanItemNaturalKey, fields: item.fields
  })).sort((left, right) => left.naturalKey.localeCompare(right.naturalKey)))
});
const catalogue: C2bTrustedCoreCatalogueItem = {
  kpiId: 'KPI-001', kpiVersionKey: 'KPI-001|V1', targetVersionKey: 'KPI-001|2027|V1',
  performanceYear: 2027, active: true, approved: true, contributionUnit: '%',
  directContributionEligible: true, additiveEligible: true, nonOverlapRequired: true
};
const controlCase = (locked: C2bTrustedWorkplanHeader): ISec006ControlCase => ({
  controlCaseKey: 'CONTROL-KPI-016', controlReference: 'CONTROL-KPI-016',
  authorisedAction: 'CreateWorkplanAmendmentV2', subjectKey: locked.workplanKey, workplanKey: locked.workplanKey,
  workplanVersion: Number(locked.fields.WorkplanVersion), expectedETag: locked.etag,
  expectedRowVersionToken: locked.rowVersionToken, storageETag: '"control-1"', storageRowVersionToken: 1,
  active: true, validFromUtc: '2026-09-12T00:00:00Z', validToUtc: '2026-09-13T00:00:00Z', revoked: false
});

function effectConfirmation(journal: C2bCommandJournal,
  effect: C2bCommandJournal['effects'][number]): C2bEffectConfirmation {
  const predecessor = effect.expectedETagFromEffectKey
    ? journal.effects.find(candidate => candidate.effectKey === effect.expectedETagFromEffectKey) : undefined;
  if (effect.kind === 'ControlCaseConsume') {
    const instruction = effect.desiredFields as unknown as ISec006ControlCaseConsumption & { operation: string };
    return { providerReference: `NATIVE-${effect.sequence}`, naturalKey: effect.naturalKey,
      requestETag: effect.expectedETag, observedETag: '"control-consumed"',
      observedRowVersionToken: instruction.expectedStorageRowVersionToken + 1,
      readback: { ...(effect.beforeFields as Record<string, unknown>), active: false,
        storageETag: '"control-consumed"', storageRowVersionToken: instruction.expectedStorageRowVersionToken + 1,
        consumedAtUtc: instruction.consumedAtUtc, consumedCommandKey: instruction.consumedCommandKey,
        consumedSourceListId: instruction.consumedSourceListId, consumedSourceItemId: instruction.consumedSourceItemId,
        consumedSourceItemVersion: instruction.consumedSourceItemVersion } };
  }
  return { providerReference: `NATIVE-${effect.sequence}`, naturalKey: effect.naturalKey,
    requestETag: predecessor ? predecessor.confirmation?.observedETag || null : effect.expectedETag,
    observedETag: ['Claim', 'CanonicalUpsert', 'Finalise'].includes(effect.kind) ? `"native-${effect.sequence}"` : null,
    observedRowVersionToken: ['Claim', 'CanonicalUpsert', 'Finalise'].includes(effect.kind)
      ? effect.desiredFields.RowVersionToken as number : null,
    readback: effect.desiredFields };
}

function stableProof(journal: C2bCommandJournal): C2bStableReadProof {
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
}

function terminalReceipt(journal: C2bCommandJournal): C2bTerminalReceipt {
  const actorAccess: C2bTerminalReceipt['actorAccess'] = JSON.parse(JSON.stringify(
    journal.effects.find(effect => effect.kind === 'ReceiptGrant')!.desiredFields.actorAccess
  ));
  return {
    receiptKey: journal.plan.commandKey, commandKey: journal.plan.commandKey, outcome: 'Accepted',
    planSha256: journal.plan.planSha256, payloadSha256: journal.plan.payloadSha256,
    canonicalSha256: journal.stableRead!.readbackSha256,
    resultKeys: [journal.plan.subjectKey, ...journal.plan.intendedImage.items.map(item => item.naturalKey)].sort(),
    auditKeys: journal.effects.filter(effect => effect.kind === 'AuditAppend').map(effect => effect.confirmation!.naturalKey),
    actorAccess,
    processorReference: 'SYNTHETIC-NATIVE-RUN', completedAt: processedAt
  };
}

class SyntheticNativeAdapter implements IEmployeeWorkplanV2C2bNativeAdapter {
  public readonly contractVersion = C2B_NATIVE_ADAPTER_CONTRACT_VERSION;
  public readonly capabilities = C2B_REQUIRED_NATIVE_ADAPTER_CAPABILITIES;
  public readonly calls: string[] = [];
  private current?: C2bCommandJournal;

  public constructor(
    private readonly observation: IC2bNativeSourceObservation,
    private readonly mutateSecond?: (value: IC2bNativeSourceObservation) => void,
    private readonly mutatePlanning?: (value: IC2bNativePlanningObservations) => void
  ) {}
  public use(journal: C2bCommandJournal): void { this.current = journal; }
  private apply(effect: C2bCommandJournal['effects'][number], operation: string): Promise<C2bNativeEffectResult> {
    this.calls.push(operation);
    if (!this.current) return Promise.reject(new Error('Synthetic adapter has no current journal.'));
    return Promise.resolve({ outcome: 'Confirmed', confirmation: effectConfirmation(this.current, effect) });
  }
  public readCommandSourceTwice(_source: C2bTrustedCommandSource): Promise<{ first: IC2bNativeSourceObservation; second: IC2bNativeSourceObservation }> {
    this.calls.push('SourceDoubleRead');
    const first = JSON.parse(JSON.stringify(this.observation)) as IC2bNativeSourceObservation;
    const second = JSON.parse(JSON.stringify(this.observation)) as IC2bNativeSourceObservation;
    this.mutateSecond?.(second);
    return Promise.resolve({ first, second });
  }
  public readPlanningObservations(admitted: Readonly<IC2bNativeSourceObservation>): Promise<IC2bNativePlanningObservations> {
    this.calls.push('PlanningObservations');
    const envelope = admitted.envelope;
    const result: IC2bNativePlanningObservations = { employee, manager, actor: admitted.route === 'Employee' ? employee
      : envelope.binding.commandType === 'CreateWorkplanAmendmentV2' ? systemAdmin : manager,
    configuration, header: envelope.binding.commandType === 'CreateWorkplanDraft' ? undefined
      : admitted.route === 'Employee' ? header('Draft', 5)
        : envelope.binding.commandType === 'CreateWorkplanAmendmentV2' ? header('Locked', 13) : header('Submitted', 9),
    currentItem: envelope.binding.subjectType === 'WorkplanItem'
      ? currentItems.find(item => item.workplanItemKey === envelope.binding.subjectKey) : undefined,
    allItems: currentItems, currentAcls: acls(true).current,
    readiness: envelope.binding.commandType === 'SubmitWorkplan' ? readiness(header('Draft', 5))
      : envelope.binding.commandType === 'ApproveAndLockWorkplan' ? readiness(header('Submitted', 9)) : undefined,
    catalogueItem: envelope.binding.commandType === 'UpsertCoreContributionV2' ? catalogue : undefined,
    controlCases: envelope.binding.commandType === 'CreateWorkplanAmendmentV2' ? [controlCase(header('Locked', 13))] : [] };
    this.mutatePlanning?.(result);
    return Promise.resolve(result);
  }
  public readJournal(_commandKey: string): Promise<{ journal?: C2bCommandJournal; etag: string | null }> {
    this.calls.push('JournalRead'); return Promise.resolve({ etag: null });
  }
  public compareExchangeJournal(_journal: C2bCommandJournal, _expectedETag: string | null): Promise<{ etag: string }> {
    this.calls.push('JournalCAS'); return Promise.resolve({ etag: `"journal-${this.calls.length}"` });
  }
  public persistEffectState(_effect: C2bCommandJournal['effects'][number],
    _journalETag: string): Promise<{ etag: string }> {
    this.calls.push('EffectCAS'); return Promise.resolve({ etag: `"effect-${this.calls.length}"` });
  }
  public readWorkplan(_workplanKey: string) { return Promise.resolve(undefined); }
  public readWorkplanItemsPage(_workplanKey: string, _cursor: string | null) {
    return Promise.resolve({ items: [], pageNumber: 1, complete: true, nextCursor: null });
  }
  public compareExchangeWorkplan(effect: C2bCommandJournal['effects'][number]) { return this.apply(effect, 'WorkplanCAS'); }
  public compareExchangeWorkplanItem(effect: C2bCommandJournal['effects'][number]) { return this.apply(effect, 'WorkplanItemCAS'); }
  public consumeAuthoritativeControlCase(effect: C2bCommandJournal['effects'][number]) { return this.apply(effect, 'ControlCaseCAS'); }
  public reconcileEmployeeContainerAcl(effect: C2bCommandJournal['effects'][number]) { return this.apply(effect, 'ContainerACL'); }
  public appendAudit(effect: C2bCommandJournal['effects'][number]) { return this.apply(effect, 'AuditAppend'); }
  public createImmutableReceipt(effect: C2bCommandJournal['effects'][number], receipt: C2bTerminalReceipt) {
    this.calls.push('ReceiptCreate');
    return Promise.resolve({ outcome: 'Confirmed' as const, confirmation: { providerReference: 'NATIVE-RECEIPT-CREATE',
      naturalKey: effect.naturalKey, requestETag: null, observedETag: '"receipt-created"',
      observedRowVersionToken: null, readback: { operation: 'CreateAfterStableRead', receipt } } });
  }
  public reconcileReceiptActorRead(effect: C2bCommandJournal['effects'][number], receipt: C2bTerminalReceipt) {
    this.calls.push('ReceiptActorRead');
    const created = this.current!.effects.find(candidate => candidate.kind === 'ReceiptCreate')!;
    return Promise.resolve({ outcome: 'Confirmed' as const, confirmation: { providerReference: 'NATIVE-RECEIPT-GRANT',
      naturalKey: effect.naturalKey, requestETag: created.confirmation!.observedETag,
      observedETag: '"receipt-granted"', observedRowVersionToken: null,
      readback: { operation: 'GrantReceiptRead', receiptKey: receipt.receiptKey,
        receiptSha256: hashC2bCanonical(receipt), actorAccess: receipt.actorAccess } } });
  }
  public readStableCanonicalProof(journal: C2bCommandJournal): Promise<C2bStableReadProof> {
    this.calls.push('StableDoubleRead'); return Promise.resolve(stableProof(journal));
  }
  public recoverUnknownEffect(_journal: C2bCommandJournal, _effect: C2bCommandJournal['effects'][number]) {
    return Promise.resolve({ outcome: 'StillUnknown' as const, safeCode: 'STILL_UNKNOWN' });
  }
}

async function executeThroughAdapter(adapter: SyntheticNativeAdapter): Promise<C2bCommandJournal> {
  assertC2bNativeAdapterContract(adapter);
  const plan = await createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, processedAt);
  const stored = await adapter.readJournal(plan.commandKey);
  const admitted = admitC2bPlan(stored.journal, plan, processedAt);
  if (admitted.status !== 'Created') throw new Error('Expected a new exact immutable plan.');
  await adapter.compareExchangeJournal(admitted.journal, stored.etag);
  let journal = acquireC2bLease(admitted.journal, 'PROCESSOR-A', processedAt, leaseExpiry,
    admitted.journal.journalVersion);
  await adapter.compareExchangeJournal(journal, '"journal-1"');
  while (journal.state !== 'Terminal') {
    const effect = journal.effects.find(candidate => candidate.disposition !== 'Confirmed')!;
    journal = issueNextC2bEffect(journal, effect.effectKey, 'PROCESSOR-A', journal.leaseEpoch,
      processedAt, journal.journalVersion);
    adapter.use(journal);
    const issued = journal.effects.find(candidate => candidate.effectKey === effect.effectKey)!;
    await adapter.persistEffectState(issued, '"journal-current"');
    if (issued.kind === 'StableRead') {
      const proof = await adapter.readStableCanonicalProof(journal);
      journal = confirmC2bStableRead(journal, issued.effectKey, proof, 'PROCESSOR-A', journal.leaseEpoch,
        processedAt, journal.journalVersion);
    } else if (issued.kind === 'ReceiptCreate') {
      const result = await adapter.createImmutableReceipt(issued, terminalReceipt(journal));
      if (result.outcome !== 'Confirmed') throw new Error('Synthetic ReceiptCreate unexpectedly became unknown.');
      journal = settleC2bEffect(journal, issued.effectKey, { outcome: 'Confirmed', proof: result.confirmation },
        'PROCESSOR-A', journal.leaseEpoch, processedAt, journal.journalVersion);
    } else if (issued.kind === 'ReceiptGrant') {
      const receiptReadback = journal.effects.find(candidate => candidate.kind === 'ReceiptCreate')!
        .confirmation!.readback as { receipt: C2bTerminalReceipt };
      const receipt = receiptReadback.receipt;
      const result = await adapter.reconcileReceiptActorRead(issued, receipt);
      if (result.outcome !== 'Confirmed') throw new Error('Synthetic ReceiptGrant unexpectedly became unknown.');
      journal = completeC2bReceipt(journal, issued.effectKey, receipt, result.confirmation,
        'PROCESSOR-A', journal.leaseEpoch, processedAt, journal.journalVersion);
    } else {
      const result = issued.kind === 'ControlCaseConsume' ? await adapter.consumeAuthoritativeControlCase(issued)
        : issued.kind === 'CanonicalUpsert' ? await adapter.compareExchangeWorkplanItem(issued)
          : issued.kind === 'Grant' || issued.kind === 'Revoke' ? await adapter.reconcileEmployeeContainerAcl(issued)
            : issued.kind === 'AuditAppend' ? await adapter.appendAudit(issued)
              : await adapter.compareExchangeWorkplan(issued);
      if (result.outcome !== 'Confirmed') throw new Error('Synthetic effect unexpectedly became unknown.');
      journal = settleC2bEffect(journal, issued.effectKey, { outcome: 'Confirmed', proof: result.confirmation },
        'PROCESSOR-A', journal.leaseEpoch, processedAt, journal.journalVersion);
    }
    adapter.use(journal);
    await adapter.compareExchangeJournal(journal, '"journal-current"');
  }
  return journal;
}

const id = (index: number): string => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const corePayload = {
  kpiId: 'KPI-001', role: 'DeliveryLead' as const, contributionMethod: 'AdditiveDirect' as const,
  annualTargetValue: 100, quarterTargets: [
    { quarter: 'Q1' as const, targetValue: 25 }, { quarter: 'Q2' as const, targetValue: 50 },
    { quarter: 'Q3' as const, targetValue: 75 }, { quarter: 'Q4' as const, targetValue: 100 }
  ], displayOrder: 1, activeInWorkplan: true
};
const personalPayload = {
  wording: 'Deliver the synthetic outcome', measure: 'Completion', measureType: 'Percentage' as const,
  scoringDirection: 'HigherIsBetter' as const, baselineValue: 0, yearEndTargetValue: 100,
  q1TargetValue: 25, q2TargetValue: 50, q3TargetValue: 75, q4TargetValue: 100,
  unitLabel: '%', personalItemWeight: 100, displayOrder: 1, activeInWorkplan: true
};
const requests: IEmployeeV2AnnualCommandRequest[] = [
  { route: 'Employee', commandKey: id(1), commandType: 'CreateWorkplanDraft', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027, payload: {} },
  { route: 'Employee', commandKey: id(2), commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    expectedRowVersionToken: 5, expectedHeaderETag: '"header-5"',
    payload: { coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10 } },
  { route: 'Employee', commandKey: id(3), commandType: 'UpsertCoreContributionV2', subjectType: 'WorkplanItem',
    subjectKey: 'KPI-001', personKey: employee.personKey, performanceYear: 2027,
    expectedRowVersionToken: 5, expectedHeaderETag: '"header-5"',
    expectedItemETag: '"item-2"', payload: corePayload },
  { route: 'Employee', commandKey: id(4), commandType: 'UpsertPersonalItemV2', subjectType: 'WorkplanItem',
    subjectKey: 'PERSONAL-001', personKey: employee.personKey, performanceYear: 2027,
    expectedRowVersionToken: 5, expectedHeaderETag: '"header-5"',
    expectedItemETag: '"item-4"', payload: personalPayload },
  { route: 'Employee', commandKey: id(5), commandType: 'SetCoreWeightingV2', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    expectedRowVersionToken: 5, expectedHeaderETag: '"header-5"', payload: { mode: 'Equal' } },
  { route: 'Employee', commandKey: id(6), commandType: 'SubmitWorkplan', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    expectedRowVersionToken: 5, expectedHeaderETag: '"header-5"', payload: {} },
  { route: 'Manager', commandKey: id(7), commandType: 'RequestWorkplanChanges', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    expectedRowVersionToken: 9, expectedHeaderETag: '"header-9"',
    payload: { reason: 'Clarify the measurable outcome.' } },
  { route: 'Manager', commandKey: id(8), commandType: 'ApproveAndLockWorkplan', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    expectedRowVersionToken: 9, expectedHeaderETag: '"header-9"', payload: {} },
  { route: 'Manager', commandKey: id(9), commandType: 'CreateWorkplanAmendmentV2', subjectType: 'Workplan',
    subjectKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    expectedRowVersionToken: 13, expectedHeaderETag: '"header-13"',
    payload: { reason: 'Controlled correction.', controlReference: 'CONTROL-KPI-016' } }
];

const listIds = C2B_LIST_CAPABILITY_REQUIREMENTS.map((_, index) =>
  `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`);
const preflight = preflightC2bComposition({
  contractVersion: C2B_CONTRACT_VERSION, enabled: true, environmentKind: 'NonProduction',
  environmentId: 'LOCAL-TEST', siteUrl: 'https://tenant.example.invalid/sites/kcf-test',
  siteCollectionId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53',
  webId: '9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818', connectionReference: 'LOCAL-REFERENCE',
  lists: C2B_LIST_CAPABILITY_REQUIREMENTS.map((requirement, index) => ({
    purpose: requirement.purpose, listId: listIds[index], schemaRevision: C2B_SCHEMA_REVISION
  }))
}, {
  environmentKind: 'NonProduction', environmentId: 'LOCAL-TEST',
  siteUrl: 'https://tenant.example.invalid/sites/kcf-test',
  siteCollectionId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53',
  webId: '9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818', connectionReference: 'LOCAL-REFERENCE',
  lists: C2B_LIST_CAPABILITY_REQUIREMENTS.map((requirement, index) => ({
    purpose: requirement.purpose, listId: listIds[index], schemaRevision: C2B_SCHEMA_REVISION,
    indexedFields: [...requirement.indexedFields], uniqueFields: [...requirement.uniqueFields], versioningEnabled: true,
    foldersEnabled: requirement.foldersEnabled, permissionCapability: requirement.permissionCapability
  }))
});
const wireBindings: Readonly<IEmployeeWorkplanV2ListBindings> = Object.freeze({
  people: 'People', employeeCommands: 'EmployeeCommands', managerCommands: 'ManagerCommands',
  commandReceipts: 'CommandReceipts', workplans: 'Workplans', workplanItems: 'WorkplanItems',
  quarterReviews: 'QuarterReviews', quarterReviewItems: 'QuarterReviewItems', progressNotes: 'ProgressNotes',
  evidence: 'Evidence', audit: 'Audit', clientVersion: 'LOCAL-C2B', supportsBehaviourSelectionFields: false
});

describe('A016 end-to-end synthetic annual envelope/admission/plan/native-adapter/receipt/readback', () => {
  it.each(requests.map(request => [request.commandType, request] as const))(
    'executes %s through the exact settled local integration boundary', async (_name, request) => {
      let adapter: SyntheticNativeAdapter | undefined;
      let terminal: C2bCommandJournal | undefined;
      const submitter = async (submitted: IEmployeeV2AnnualCommandRequest): Promise<IEmployeeV2TransportResult> => {
        const sourceRow = JSON.parse(serializeEmployeeV2AnnualCommand(submitted, wireBindings, processedAt)) as Record<string, unknown>;
        expect(sourceRow).toMatchObject({ CommandKey: submitted.commandKey, CommandType: submitted.commandType,
          SubjectType: submitted.subjectType, SubjectKey: submitted.subjectKey, PersonKey: submitted.personKey,
          PerformanceYear: submitted.performanceYear });
        const admittedEnvelope = JSON.parse(String(sourceRow.PayloadJSON)) as Record<string, unknown>;
        expect(employeeV2AnnualOuterBinding(sourceRow)).toBe(true);
        expect(sourceRow.ExpectedRowVersionToken).toBeNull();
        expect(sourceRow.ExpectedETag).toBe((admittedEnvelope.expected as { header: { etag: string | null } }).header.etag);
        expect(admittedEnvelope).toMatchObject({
          schemaVersion: 'kcf.kpi.test-command.v2',
          binding: { commandKey: submitted.commandKey, commandType: submitted.commandType,
            subjectType: submitted.subjectType, subjectKey: submitted.subjectKey,
            personKey: submitted.personKey, performanceYear: submitted.performanceYear,
            workplanKey: `${submitted.personKey}|${submitted.performanceYear}` },
          payload: submitted.payload
        });
        const sourceActor = submitted.route === 'Employee' ? employee
          : submitted.commandType === 'CreateWorkplanAmendmentV2' ? systemAdmin : manager;
        adapter = new SyntheticNativeAdapter({ source, sourceETag: '"source-1"', sourceRowVersion: source.itemVersion,
          route: submitted.route, authorEmail: sourceActor.email,
          envelope: admittedEnvelope as unknown as ReturnType<typeof createEmployeeV2AnnualAdmissionEnvelope> });
        terminal = await executeThroughAdapter(adapter);
        const nativeReceipt = terminal.receipt!;
        const purpose = submitted.route === 'Employee' ? 'EmployeeCommands' : 'ManagerCommands';
        const sourceListId = listIds[C2B_LIST_CAPABILITY_REQUIREMENTS.findIndex(item => item.purpose === purpose)];
        const actor = terminal.plan.effectiveRole === 'Employee' ? employee
          : terminal.plan.effectiveRole === 'Manager' ? manager : systemAdmin;
        const receipt: IEmployeeV2CommandReceipt = {
          receiptKey: `${sourceListId}|17|1.0`, sourceListId, sourceItemId: 17, sourceItemVersion: '1.0',
          commandKey: submitted.commandKey, commandType: submitted.commandType, subjectType: submitted.subjectType,
          subjectKey: submitted.subjectKey, personKey: submitted.personKey, performanceYear: submitted.performanceYear,
          authenticatedActorEmail: actor.email, authenticatedActorPersonKey: actor.personKey,
          effectiveRole: terminal.plan.effectiveRole, processedByEmail: 'processor@example.invalid',
          processedAt, outcome: 'Accepted', validationCode: 'ACCEPTED', message: 'Stable canonical proof accepted.',
          processedPayloadSha256: nativeReceipt.payloadSha256,
          resultKeysJson: JSON.stringify([{ workplanKey: terminal.plan.subjectKey,
            rowVersionToken: terminal.stableRead!.second.header.rowVersionToken,
            etag: terminal.stableRead!.second.header.etag,
            itemKeys: submitted.subjectType === 'WorkplanItem' ? [submitted.subjectKey] : [] }]),
          auditKeysJson: JSON.stringify(nativeReceipt.auditKeys), correlationKey: `PROCESSOR-${submitted.commandKey}`,
          flowRunReference: nativeReceipt.processorReference
        };
        return { receipt, replayed: false };
      };
      const result = await new LocallyValidatedEmployeeWorkplanV2C2bCommandGateway(preflight,
        submitted => submitter(submitted as IEmployeeV2AnnualCommandRequest))
        .executeAnnualCommand(request);
      expect(terminal?.state).toBe('Terminal');
      expect(terminal?.stableRead?.first).toEqual(terminal?.stableRead?.second);
      expect(terminal?.stableRead?.second.pagination).toMatchObject({ complete: true, nextLink: null });
      expect(result.canonicalProof).toMatchObject({ workplanKey: 'PERSON-001|2027',
        rowVersionToken: request.commandType === 'CreateWorkplanDraft' ? 2 : (request.expectedRowVersionToken || 0) + 2,
        etag: '"stable-header"' });
      expect(adapter?.calls).toEqual(expect.arrayContaining([
        'SourceDoubleRead', 'PlanningObservations', 'JournalRead', 'JournalCAS', 'EffectCAS',
        'WorkplanCAS', 'ContainerACL', 'AuditAppend', 'StableDoubleRead', 'ReceiptCreate', 'ReceiptActorRead'
      ]));
      if (request.subjectType === 'WorkplanItem') expect(adapter?.calls).toContain('WorkplanItemCAS');
      if (request.commandType === 'CreateWorkplanAmendmentV2') expect(adapter?.calls).toContain('ControlCaseCAS');
    }
  );

  it('holds an unknown native outcome, requires exact recovery evidence and resumes at the next unexecuted effect', async () => {
    const request = requests[1];
    const adapter = new SyntheticNativeAdapter({ source, sourceETag: '"source-1"', sourceRowVersion: source.itemVersion,
      route: request.route, authorEmail: employee.email, envelope: createEmployeeV2AnnualAdmissionEnvelope(request) });
    const plan = await createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, processedAt);
    const admitted = admitC2bPlan(undefined, plan, processedAt);
    if (admitted.status !== 'Created') throw new Error('Expected created journal.');
    let journal = acquireC2bLease(admitted.journal, 'PROCESSOR-A', processedAt, leaseExpiry,
      admitted.journal.journalVersion);
    const claim = journal.effects[0];
    journal = issueNextC2bEffect(journal, claim.effectKey, 'PROCESSOR-A', journal.leaseEpoch,
      processedAt, journal.journalVersion);
    const issued = journal.effects[0];
    const exactConfirmation = effectConfirmation(journal, issued);
    journal = settleC2bEffect(journal, issued.effectKey, { outcome: 'Unknown', safeCode: 'TIMEOUT_UNKNOWN' },
      'PROCESSOR-A', journal.leaseEpoch, processedAt, journal.journalVersion);
    expect(journal.state).toBe('Held');
    expect(journal.receipt).toBeNull();
    journal = recoverC2bEffect(journal, issued.effectKey, {
      outcome: 'Confirmed', providerReference: exactConfirmation.providerReference,
      naturalKey: exactConfirmation.naturalKey, requestETag: exactConfirmation.requestETag,
      observedETag: exactConfirmation.observedETag,
      observedRowVersionToken: exactConfirmation.observedRowVersionToken,
      readback: exactConfirmation.readback
    }, processedAt, journal.journalVersion);
    expect(journal.state).toBe('Planned');
    expect(journal.effects[0].disposition).toBe('Confirmed');
    journal = acquireC2bLease(journal, 'PROCESSOR-A', processedAt, leaseExpiry, journal.journalVersion);
    const next = journal.effects.find(effect => effect.disposition !== 'Confirmed')!;
    expect(next.sequence).toBe(2);
    expect(next.kind).toBe('Grant');
  });

  it('rejects a mutated second source read before requesting planning observations', async () => {
    const request = requests[1];
    const adapter = new SyntheticNativeAdapter({ source, sourceETag: '"source-1"', sourceRowVersion: source.itemVersion,
      route: request.route, authorEmail: employee.email, envelope: createEmployeeV2AnnualAdmissionEnvelope(request) },
    second => { second.envelope.binding.subjectKey = 'PERSON-OTHER|2027'; });
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, processedAt)).rejects.toThrow(/changed between its two reads/);
    expect(adapter.calls).toEqual(['SourceDoubleRead']);
  });

  it('rejects a caller-forged paired version before any planning or mutation call', async () => {
    const request = requests[1];
    const forged = { source, sourceETag: '"source-1"', sourceRowVersion: source.itemVersion,
      route: request.route, authorEmail: employee.email, envelope: createEmployeeV2AnnualAdmissionEnvelope(request),
      commandSource: { version: 'kcf.kpi.command-source.v1' } } as IC2bNativeSourceObservation;
    const adapter = new SyntheticNativeAdapter(forged);
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, processedAt)).rejects.toThrow('COMMAND_PAIR_VERSION');
    expect(adapter.calls).toEqual(['SourceDoubleRead']);
  });

  it('rejects stale trusted header CAS before plan creation', async () => {
    const request = requests[1];
    const adapter = new SyntheticNativeAdapter({ source, sourceETag: '"source-1"', sourceRowVersion: source.itemVersion,
      route: request.route, authorEmail: employee.email, envelope: createEmployeeV2AnnualAdmissionEnvelope(request) },
    undefined, observations => { observations.header = header('Draft', 7); });
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, processedAt)).rejects.toThrow(/header CAS is stale/);
  });

  it('rejects a wrong Workplan Item subject even when both immutable source reads match', async () => {
    const request = requests[2];
    const envelope = createEmployeeV2AnnualAdmissionEnvelope(request);
    envelope.binding.subjectKey = 'KPI-OTHER';
    const adapter = new SyntheticNativeAdapter({ source, sourceETag: '"source-1"', sourceRowVersion: source.itemVersion,
      route: request.route, authorEmail: employee.email, envelope });
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, processedAt)).rejects.toThrow(/current Workplan Item observation/);
  });

  it('rejects a crossed command-list route before requesting planning observations', async () => {
    const request = requests[2];
    const adapter = new SyntheticNativeAdapter({ source, sourceETag: '"source-1"', sourceRowVersion: source.itemVersion,
      route: 'Manager', authorEmail: manager.email, envelope: createEmployeeV2AnnualAdmissionEnvelope(request) });
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, processedAt)).rejects.toThrow(/route or subject type is crossed/);
    expect(adapter.calls).toEqual(['SourceDoubleRead']);
  });
});
