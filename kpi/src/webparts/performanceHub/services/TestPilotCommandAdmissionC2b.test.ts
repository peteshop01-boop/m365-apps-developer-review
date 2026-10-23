import {
  C2B_ANNUAL_COMMAND_ALLOW_LIST,
  C2B_CONTRACT_VERSION,
  C2B_DEFERRED_ANNUAL_HANDLERS,
  C2B_DISABLED_BINDINGS,
  C2B_LIST_CAPABILITY_REQUIREMENTS,
  C2B_SCHEMA_REVISION,
  acquireC2bLease,
  admitC2bPlan,
  completeC2bReceipt,
  confirmC2bStableRead,
  createC2bCommandPlan,
  createC2bEffectPlan,
  createC2bRejectedOutcome,
  hashC2bCanonical,
  holdC2bPostFinaliseEffect,
  issueNextC2bEffect,
  preflightC2bComposition,
  recoverC2bEffect,
  recoverC2bPostFinaliseEffect,
  settleC2bEffect,
  type C2bAclImage,
  type C2bBindingConfiguration,
  type C2bCanonicalObservation,
  type C2bCommandJournal,
  type C2bCommandPlan,
  type C2bEffectConfirmation,
  type C2bEffectPlan,
  type C2bListAclImage,
  type C2bObservedComposition,
  type C2bPostFinaliseHoldProof,
  type C2bStableReadProof,
  type C2bTerminalReceipt
} from './TestPilotCommandAdmissionC2b';
import {
  C2B_DEFERRED_ANNUAL_HANDLER_DETAILS,
  planCreateWorkplanDraftC2b,
  planUpsertCoreContributionC2b,
  type C2bTrustedAnnualConfiguration,
  type C2bTrustedAnnualItem,
  type C2bTrustedPerson,
  type C2bTrustedWorkplanHeader
} from './TestPilotCommandAdmissionC2bHandlers';

const now = '2026-09-12T03:00:00Z';
const expiry = '2026-09-12T03:05:00Z';
const ids = [
  'bcbcff1a-88fd-4fc7-a95e-8301a57804d1', 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d',
  '6906d187-3451-467a-a362-10ddc87449f7', '986c85e3-1225-45c5-a251-95f826249273',
  '519f4a71-e15c-4fe7-a8bf-ea2258f5c172', '203c2cde-d519-41bf-a51e-e50ae0281711',
  'e0fad8ef-7b8b-4a05-af29-435f7808f2d6', '82b4a5d6-cac9-41ee-ab9b-6c0dbcfab978',
  '1ec50abd-a35c-4cec-ad6f-3d515cb5b36e'
];
const employee: C2bTrustedPerson = {
  personKey: 'PERSON-001', email: 'employee@example.invalid', displayName: 'Synthetic Employee', active: true,
  roles: ['Employee'], managerPersonKey: 'PERSON-002', managerEmail: 'manager@example.invalid'
};
const manager: C2bTrustedPerson = {
  personKey: 'PERSON-002', email: 'manager@example.invalid', displayName: 'Synthetic Manager', active: true,
  roles: ['Employee', 'Manager'], managerPersonKey: null, managerEmail: null
};
const configuration: C2bTrustedAnnualConfiguration = {
  schemaRevision: C2B_SCHEMA_REVISION, performanceYear: 2027,
  behaviourContractVersion: 'CONFIGURED-BEHAVIOUR-VERSION', initialState: 'Draft',
  initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready',
  processorPrincipalKey: 'PROCESSOR-001', adminPrincipalKeys: ['ADMIN-GROUP-001']
};
const command = {
  commandKey: '59271670-824e-4911-ac53-c1cd0c345072', commandType: 'CreateWorkplanDraft' as const,
  personKey: employee.personKey, performanceYear: 2027, payload: {}
};
const currentAcl = (extra = 'SITE-MEMBERS'): C2bAclImage => ({
  containerKey: 'PERSON-001', breaksInheritanceAtContainer: true, canonicalChildrenInherit: true,
  allowedPrincipals: [{ principalKey: extra, permission: 'Read', source: 'Admin' }], revokedPrincipalKeys: []
});
const currentAcls = (purposes: Array<'Workplans' | 'WorkplanItems'> = ['Workplans'],
  extra = 'SITE-MEMBERS'): C2bListAclImage[] => purposes.map(listPurpose => ({ listPurpose, acl: currentAcl(extra) }));
const createPlan = (extra?: string): C2bCommandPlan => planCreateWorkplanDraftC2b(command, employee.email,
  employee, manager, configuration, { current: currentAcls(['Workplans'], extra) });

const bindings = (): C2bBindingConfiguration => ({
  contractVersion: C2B_CONTRACT_VERSION, enabled: true, environmentKind: 'NonProduction',
  environmentId: 'LOCAL-TEST-ENVIRONMENT', siteUrl: 'https://tenant.example.invalid/sites/kcf-test',
  siteCollectionId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53',
  webId: '9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818', connectionReference: 'LOCAL-UNBOUND-REFERENCE',
  lists: C2B_LIST_CAPABILITY_REQUIREMENTS.map((requirement, index) => ({
    purpose: requirement.purpose, listId: ids[index], schemaRevision: C2B_SCHEMA_REVISION
  }))
});
const observations = (): C2bObservedComposition => ({
  environmentKind: 'NonProduction', environmentId: 'LOCAL-TEST-ENVIRONMENT',
  siteUrl: 'https://tenant.example.invalid/sites/kcf-test',
  siteCollectionId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53',
  webId: '9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818',
  connectionReference: 'LOCAL-UNBOUND-REFERENCE',
  lists: C2B_LIST_CAPABILITY_REQUIREMENTS.map((requirement, index) => ({
    purpose: requirement.purpose, listId: ids[index], schemaRevision: C2B_SCHEMA_REVISION,
    indexedFields: [...requirement.indexedFields], uniqueFields: [...requirement.uniqueFields],
    versioningEnabled: true, foldersEnabled: requirement.foldersEnabled,
    permissionCapability: requirement.permissionCapability
  }))
});

const effectInput = (effect: C2bEffectPlan): Omit<C2bEffectPlan, 'beforeSha256' | 'desiredSha256' | 'effectSha256'> => {
  const input = { ...effect } as Partial<C2bEffectPlan>;
  delete input.beforeSha256; delete input.desiredSha256; delete input.effectSha256;
  return input as Omit<C2bEffectPlan, 'beforeSha256' | 'desiredSha256' | 'effectSha256'>;
};
const rebuild = (plan: C2bCommandPlan, effects: C2bEffectPlan[]): C2bCommandPlan => createC2bCommandPlan({
  commandKey: plan.commandKey, commandType: plan.commandType, personKey: plan.personKey,
  subjectKey: plan.subjectKey, performanceYear: plan.performanceYear,
  payload: JSON.parse(plan.payloadCanonical) as unknown, intendedImage: plan.intendedImage, effects
});
const confirmation = (effect: C2bEffectPlan): C2bEffectConfirmation => ({
  providerReference: `PROVIDER-${effect.sequence}`, naturalKey: effect.naturalKey,
  requestETag: effect.kind === 'Finalise' ? '"etag-1"' : effect.expectedETag,
  observedETag: ['Claim', 'CanonicalUpsert', 'Finalise'].includes(effect.kind) ? `"etag-${effect.sequence}"` : null,
  observedRowVersionToken: ['Claim', 'CanonicalUpsert', 'Finalise'].includes(effect.kind)
    ? effect.desiredFields.RowVersionToken as number : null,
  readback: effect.desiredFields
});
const receiptFor = (journal: C2bCommandJournal): C2bTerminalReceipt => {
  const actorAccess = journal.effects.find(effect => effect.kind === 'ReceiptGrant')!.desiredFields.actorAccess;
  const auditKeys = journal.effects.filter(effect => effect.kind === 'AuditAppend').map(effect => effect.confirmation!.naturalKey);
  return { receiptKey: journal.plan.commandKey, commandKey: journal.plan.commandKey, outcome: 'Accepted',
    planSha256: journal.plan.planSha256, payloadSha256: journal.plan.payloadSha256,
    canonicalSha256: journal.stableRead!.readbackSha256,
    resultKeys: [journal.plan.subjectKey, ...journal.plan.intendedImage.items.map(item => item.naturalKey)].sort(),
    auditKeys, actorAccess: actorAccess as C2bTerminalReceipt['actorAccess'],
    processorReference: 'RUN-001', completedAt: now };
};
const receiptCreateConfirmation = (journal: C2bCommandJournal,
  effect: C2bEffectPlan): C2bEffectConfirmation => ({
  providerReference: 'RECEIPT-CREATE-001', naturalKey: effect.naturalKey, requestETag: null,
  observedETag: '"receipt-1"', observedRowVersionToken: null,
  readback: { operation: 'CreateAfterStableRead', receipt: receiptFor(journal) }
});
const receiptGrantConfirmation = (journal: C2bCommandJournal,
  effect: C2bEffectPlan): C2bEffectConfirmation => {
  const receiptCreate = journal.effects.find(candidate => candidate.kind === 'ReceiptCreate')!;
  const receipt = (receiptCreate.confirmation!.readback as { receipt: C2bTerminalReceipt }).receipt;
  return { providerReference: 'RECEIPT-GRANT-001', naturalKey: effect.naturalKey,
    requestETag: receiptCreate.confirmation!.observedETag, observedETag: '"receipt-2"', observedRowVersionToken: null,
    readback: { operation: 'GrantReceiptRead', receiptKey: receipt.receiptKey,
      receiptSha256: hashC2bCanonical(receipt), actorAccess: receipt.actorAccess } };
};
const lease = (plan = createPlan()): C2bCommandJournal => {
  const admitted = admitC2bPlan(undefined, plan, now);
  if (admitted.status !== 'Created') throw new Error('Expected a new journal.');
  return acquireC2bLease(admitted.journal, 'PROCESSOR-A', now, expiry, admitted.journal.journalVersion);
};
const settleBeforeStable = (input = lease()): C2bCommandJournal => {
  let journal = input;
  while (true) {
    const current = journal.effects.find(effect => effect.disposition !== 'Confirmed')!;
    if (current.kind === 'StableRead') return journal;
    journal = issueNextC2bEffect(journal, current.effectKey, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    journal = settleC2bEffect(journal, current.effectKey, { outcome: 'Confirmed', proof: confirmation(current) },
      'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
  }
};
const stableProof = (journal: C2bCommandJournal): C2bStableReadProof => {
  const stable = journal.effects.find(effect => effect.kind === 'StableRead')!;
  const prior = journal.effects.filter(effect => effect.sequence < stable.sequence);
  const observation: C2bCanonicalObservation = {
    header: { ...journal.plan.intendedImage.header, etag: '"final-etag"',
      rowVersionToken: journal.plan.intendedImage.header.fields.RowVersionToken as number },
    items: journal.plan.intendedImage.items.map((item, index) => ({ ...item, etag: `"item-${index}"`,
      rowVersionToken: item.fields.RowVersionToken as number })),
    acls: journal.plan.intendedImage.acls.map(valueAcl => JSON.parse(JSON.stringify(valueAcl)) as C2bListAclImage),
    pagination: { complete: true, pageCount: 1, totalCount: journal.plan.intendedImage.items.length,
      nextLink: null, affectedNaturalKeys: journal.plan.intendedImage.items.map(item => item.naturalKey) },
    auditKeys: prior.filter(effect => effect.kind === 'AuditAppend').map(effect => effect.confirmation!.naturalKey),
    effectEvidenceSha256: prior.map(effect => effect.confirmationSha256!),
    processorEpoch: journal.leaseEpoch
  };
  return { first: observation, second: JSON.parse(JSON.stringify(observation)) as C2bCanonicalObservation };
};
const settleStable = (input = settleBeforeStable()): C2bCommandJournal => {
  let journal = input;
  const stable = journal.effects.find(effect => effect.kind === 'StableRead')!;
  journal = issueNextC2bEffect(journal, stable.effectKey, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
  return confirmC2bStableRead(journal, stable.effectKey, stableProof(journal),
    'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
};
const issuePostFinalise = (kind: 'AuditAppend' | 'StableRead' | 'ReceiptCreate' | 'ReceiptGrant'):
  C2bCommandJournal => {
  let journal = lease();
  while (true) {
    const current = journal.effects.find(effect => effect.disposition !== 'Confirmed')!;
    journal = issueNextC2bEffect(journal, current.effectKey, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    if (current.kind === kind) return journal;
    if (current.kind === 'StableRead') {
      journal = confirmC2bStableRead(journal, current.effectKey, stableProof(journal),
        'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    } else if (current.kind === 'ReceiptCreate') {
      journal = settleC2bEffect(journal, current.effectKey,
        { outcome: 'Confirmed', proof: receiptCreateConfirmation(journal, current) },
        'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    } else {
      journal = settleC2bEffect(journal, current.effectKey, { outcome: 'Confirmed', proof: confirmation(current) },
        'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    }
  }
};
const holdProof = (journal: C2bCommandJournal): C2bPostFinaliseHoldProof => {
  const finalise = journal.effects.find(effect => effect.kind === 'Finalise')!;
  return { providerReference: 'REHOLD-001', naturalKey: journal.plan.subjectKey,
    requestETag: finalise.confirmation!.observedETag!, observedETag: '"rehold-etag"',
    observedRowVersionToken: journal.plan.intendedImage.header.fields.RowVersionToken as number,
    processorEpoch: journal.leaseEpoch, beforeFields: journal.plan.intendedImage.header.fields,
    readback: { ...journal.plan.intendedImage.header.fields, AccessState: 'RecoveryHold',
      TransitionStatus: 'Held', TransitionCorrelationKey: journal.plan.commandKey } };
};

describe('A008 C2b binding and employee-container capability preflight', () => {
  it('fails closed while disabled/unbound and rejects Production, schema and capability mismatches', () => {
    expect(preflightC2bComposition(C2B_DISABLED_BINDINGS)).toMatchObject({ ready: false, code: 'C2B_DISABLED' });
    expect(preflightC2bComposition(bindings())).toMatchObject({ ready: false, code: 'C2B_UNBOUND' });
    expect(preflightC2bComposition(bindings(), { ...observations(), environmentKind: 'Production' }))
      .toMatchObject({ ready: false, code: 'C2B_UNBOUND' });
    const wrongSchema = observations(); wrongSchema.lists[0].schemaRevision = 'stale';
    expect(preflightC2bComposition(bindings(), wrongSchema)).toMatchObject({ ready: false, code: 'C2B_SCHEMA_MISMATCH' });
    const rowScoped = observations(); rowScoped.lists[6].permissionCapability = 'PrivateProcessorOnly';
    expect(preflightC2bComposition(bindings(), rowScoped)).toMatchObject({ ready: false, code: 'C2B_CAPABILITY_MISMATCH' });
    const foldersDisabled = observations(); foldersDisabled.lists[7].foldersEnabled = false;
    expect(preflightC2bComposition(bindings(), foldersDisabled)).toMatchObject({ ready: false, code: 'C2B_CAPABILITY_MISMATCH' });
  });

  it('requires private control stores, employee-container inheritance and receipt actor-read capability', () => {
    expect(preflightC2bComposition(bindings(), observations())).toMatchObject({ ready: true, code: 'C2B_PREFLIGHT_READY' });
    expect(C2B_LIST_CAPABILITY_REQUIREMENTS.find(item => item.purpose === 'CommandJournal')?.permissionCapability)
      .toBe('PrivateProcessorOnly');
    expect(C2B_LIST_CAPABILITY_REQUIREMENTS.find(item => item.purpose === 'CommandEffects')?.permissionCapability)
      .toBe('PrivateProcessorOnly');
    expect(C2B_LIST_CAPABILITY_REQUIREMENTS.find(item => item.purpose === 'Audit')?.permissionCapability)
      .toBe('PrivateProcessorOnly');
    expect(C2B_LIST_CAPABILITY_REQUIREMENTS.find(item => item.purpose === 'CommandReceipts')?.permissionCapability)
      .toBe('ProcessorOwnedReceiptActorRead');
  });

  it('canonicalises the exact site identity pair and rejects malformed, substituted, swapped or mismatched targets', () => {
    const canonicalised = bindings();
    canonicalised.siteUrl = 'HTTPS://TENANT.EXAMPLE.INVALID/sites/kcf-test/';
    canonicalised.siteCollectionId = '{094ae5f7-ea13-44c9-a9b1-6863e144bf53}';
    canonicalised.webId = ' {9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818} ';
    expect(preflightC2bComposition(canonicalised, observations()))
      .toMatchObject({ ready: true, code: 'C2B_PREFLIGHT_READY' });

    const malformedGuid = bindings(); malformedGuid.siteCollectionId = 'tenant.example.invalid,collection,web';
    expect(preflightC2bComposition(malformedGuid, observations()))
      .toMatchObject({ ready: false, code: 'C2B_UNBOUND' });
    const malformedUrl = bindings(); malformedUrl.siteUrl = 'tenant.example.invalid/sites/kcf-test';
    expect(preflightC2bComposition(malformedUrl, observations()))
      .toMatchObject({ ready: false, code: 'C2B_UNBOUND' });
    const oneIdentity = bindings(); oneIdentity.webId = oneIdentity.siteCollectionId;
    expect(preflightC2bComposition(oneIdentity, observations()))
      .toMatchObject({ ready: false, code: 'C2B_UNBOUND' });

    const staleOrGroupSubstitution = bindings();
    staleOrGroupSubstitution.siteCollectionId = 'a43afb76-f56b-4016-a860-8b8039ace574';
    expect(preflightC2bComposition(staleOrGroupSubstitution, observations()))
      .toMatchObject({ ready: false, code: 'C2B_BINDING_MISMATCH' });
    const swapped = observations();
    [swapped.siteCollectionId, swapped.webId] = [swapped.webId, swapped.siteCollectionId];
    expect(preflightC2bComposition(bindings(), swapped))
      .toMatchObject({ ready: false, code: 'C2B_BINDING_MISMATCH' });
    expect(preflightC2bComposition(bindings(), { ...observations(),
      webId: 'daff0268-1b17-4e23-a456-c20c696c0299' }))
      .toMatchObject({ ready: false, code: 'C2B_BINDING_MISMATCH' });
    expect(preflightC2bComposition(bindings(), { ...observations(),
      siteCollectionId: 'd6ac338f-7596-42e7-aeeb-62b7c2adf3c6' }))
      .toMatchObject({ ready: false, code: 'C2B_BINDING_MISMATCH' });
    expect(preflightC2bComposition(bindings(), { ...observations(),
      siteUrl: 'https://tenant.example.invalid/sites/another-web' }))
      .toMatchObject({ ready: false, code: 'C2B_BINDING_MISMATCH' });
  });
});

describe('A008 internally hashed executable annual planners', () => {
  it('computes canonical SHA-256 internally and binds Claim, ACL, Finalise, stable proof and receipt-last effects', () => {
    expect(hashC2bCanonical({})).toBe('44136FA355B3678A1146AD16F7E8649E94FB4FC21FE77E8310C060F61CAAFF8A');
    const plan = createPlan();
    expect(plan.payloadSha256).toBe(hashC2bCanonical({}));
    expect(plan.planSha256).toMatch(/^[0-9A-F]{64}$/);
    expect(plan.effects.map(effect => effect.kind)).toEqual([
      'Claim', 'Grant', 'Revoke', 'Finalise', 'AuditAppend', 'StableRead', 'ReceiptCreate', 'ReceiptGrant'
    ]);
    expect(plan.effects[0].desiredFields).toMatchObject({ AccessState: 'RecoveryHold', TransitionStatus: 'InProgress', RowVersionToken: 1 });
    expect(plan.effects[3].desiredFields).toMatchObject({ AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', RowVersionToken: 2 });
    expect(plan.intendedImage.acls).toHaveLength(1);
    expect(plan.intendedImage.acls[0]).toMatchObject({ listPurpose: 'Workplans',
      acl: { containerKey: 'PERSON-001', canonicalChildrenInherit: true, revokedPrincipalKeys: ['SITE-MEMBERS'] } });
    expect(plan.intendedImage.acls[0].acl.allowedPrincipals.map(value => value.principalKey).sort())
      .toEqual(['ADMIN-GROUP-001', 'PERSON-001', 'PERSON-002', 'PROCESSOR-001']);
  });

  it('uses UpsertCoreContributionV2 ActiveInWorkplan=false instead of a separate deactivation command', () => {
    const headerFields = { WorkplanKey: 'PERSON-001|2027', PersonKey: 'PERSON-001', PerformanceYear: 2027,
      ManagerPersonKey: 'PERSON-002', ManagerEmail: 'manager@example.invalid',
      State: 'Draft', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', RowVersionToken: 3 };
    const header: C2bTrustedWorkplanHeader = { workplanKey: 'PERSON-001|2027', personKey: 'PERSON-001',
      performanceYear: 2027, etag: '"header-3"', rowVersionToken: 3, state: 'Draft',
      accessState: 'EmployeeEdit', transitionStatus: 'Ready', fields: headerFields };
    const itemFields = { WorkplanItemKey: 'ITEM-001', WorkplanItemNaturalKey: 'PERSON-001|2027|CoreGold|KPI-001',
      WorkplanKey: 'PERSON-001|2027', PersonKey: 'PERSON-001', PerformanceYear: 2027, ItemType: 'CoreGold',
      KPIID: 'KPI-001', ActiveInWorkplan: true, AddedByEmail: employee.email, AddedAt: now,
      RowVersionToken: 2 };
    const item: C2bTrustedAnnualItem = { workplanItemKey: 'ITEM-001',
      workplanItemNaturalKey: 'PERSON-001|2027|CoreGold|KPI-001', workplanKey: 'PERSON-001|2027',
      personKey: 'PERSON-001', performanceYear: 2027, itemType: 'CoreGold', activeInWorkplan: true,
      etag: '"item-2"', rowVersionToken: 2, fields: itemFields };
    const plan = planUpsertCoreContributionC2b({ commandKey: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', commandType: 'UpsertCoreContributionV2',
      personKey: 'PERSON-001', performanceYear: 2027, payload: {
        kpiId: 'KPI-001', role: 'DeliveryLead', contributionMethod: 'AdditiveDirect',
        quarterTargets: [{ quarter: 'Q1' }, { quarter: 'Q2' }, { quarter: 'Q3' }, { quarter: 'Q4' }],
        displayOrder: 0, activeInWorkplan: false
      } }, employee.email, employee, manager, configuration, header, item, [item], now,
    { current: currentAcls(['Workplans', 'WorkplanItems']) });
    expect(plan.commandType).toBe('UpsertCoreContributionV2');
    expect(plan.effects.find(effect => effect.kind === 'CanonicalUpsert')?.desiredFields)
      .toMatchObject({ ActiveInWorkplan: false, RowVersionToken: 3 });
    expect(plan.intendedImage.acls.map(value => [value.listPurpose, value.acl.containerKey])).toEqual([
      ['WorkplanItems', 'PERSON-001'], ['Workplans', 'PERSON-001']
    ]);
    expect(plan.effects.filter(effect => effect.kind === 'Grant').map(effect => [effect.target, effect.naturalKey]))
      .toEqual([['Workplans', 'PERSON-001'], ['WorkplanItems', 'PERSON-001']]);
    expect(plan.effects.filter(effect => effect.kind === 'Revoke').map(effect => [effect.target, effect.naturalKey]))
      .toEqual([['Workplans', 'PERSON-001'], ['WorkplanItems', 'PERSON-001']]);
    const beforeStable = settleBeforeStable(lease(plan));
    const stable = beforeStable.effects.find(effect => effect.kind === 'StableRead')!;
    const issued = issueNextC2bEffect(beforeStable, stable.effectKey,
      'PROCESSOR-A', beforeStable.leaseEpoch, now, beforeStable.journalVersion);
    const missingListAcl = stableProof(issued);
    missingListAcl.first.acls = missingListAcl.first.acls.filter(value => value.listPurpose === 'Workplans');
    missingListAcl.second = JSON.parse(JSON.stringify(missingListAcl.first)) as C2bCanonicalObservation;
    expect(() => confirmC2bStableRead(issued, stable.effectKey, missingListAcl,
      'PROCESSOR-A', issued.leaseEpoch, now, issued.journalVersion)).toThrow(/intended image/);
    expect(C2B_ANNUAL_COMMAND_ALLOW_LIST).not.toContain('DeactivateWorkplanItemV2');
    expect(C2B_DEFERRED_ANNUAL_HANDLERS).toEqual([]);
    expect(C2B_DEFERRED_ANNUAL_HANDLER_DETAILS).toEqual([]);
  });

  it('rejects forged identity/manager and protected fields', () => {
    expect(() => planCreateWorkplanDraftC2b({ ...command, actorEmail: employee.email }, employee.email,
      employee, manager, configuration, { current: currentAcls() })).toThrow(/protected/);
    expect(() => planCreateWorkplanDraftC2b(command, 'forged@example.invalid', employee, manager,
      configuration, { current: currentAcls() })).toThrow(/key-plus-email/);
    expect(() => planCreateWorkplanDraftC2b(command, employee.email,
      { ...employee, managerEmail: 'other@example.invalid' }, manager, configuration,
      { current: currentAcls() })).toThrow(/key-plus-email/);
  });
});

describe('A008 negative lifecycle, proof, recovery and audit semantics', () => {
  it('rejects Ready-before-finalise, missing Finalise and missing expected+2 transition', () => {
    const plan = createPlan();
    const readyClaim = createC2bEffectPlan({ ...effectInput(plan.effects[0]),
      desiredFields: { ...plan.effects[0].desiredFields, AccessState: 'EmployeeEdit', TransitionStatus: 'Ready' } });
    expect(() => admitC2bPlan(undefined, rebuild(plan, [readyClaim, ...plan.effects.slice(1)]), now)).toThrow(/RecoveryHold/);
    expect(() => admitC2bPlan(undefined, rebuild(plan, plan.effects.filter(effect => effect.kind !== 'Finalise')), now))
      .toThrow(/incomplete|effects|Finalise/);
    const finaliseIndex = plan.effects.findIndex(effect => effect.kind === 'Finalise');
    const badFinalise = createC2bEffectPlan({ ...effectInput(plan.effects[finaliseIndex]),
      desiredFields: { ...plan.effects[finaliseIndex].desiredFields, RowVersionToken: 1 } });
    const effects = [...plan.effects]; effects[finaliseIndex] = badFinalise;
    expect(() => admitC2bPlan(undefined, rebuild(plan, effects), now)).toThrow(/expected\+2/);
  });

  it('rejects caller-tampered payload, plan and effect hashes', () => {
    const plan = createPlan();
    expect(() => admitC2bPlan(undefined, { ...plan, payloadSha256: 'F'.repeat(64) }, now)).toThrow(/payload/);
    expect(() => admitC2bPlan(undefined, { ...plan, planSha256: 'E'.repeat(64) }, now)).toThrow(/plan hash/);
    const tampered = [...plan.effects]; tampered[1] = { ...tampered[1], desiredFields: { operation: 'FakeGrant' } };
    expect(() => admitC2bPlan(undefined, { ...plan, effects: tampered }, now)).toThrow(/effect hash/);
  });

  it('rejects fake grant references and exact ACL readbacks with missing or extra principals', () => {
    let journal = lease();
    const claim = journal.effects[0];
    journal = issueNextC2bEffect(journal, claim.effectKey, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    journal = settleC2bEffect(journal, claim.effectKey, { outcome: 'Confirmed', proof: confirmation(claim) },
      'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    const grant = journal.effects[1];
    journal = issueNextC2bEffect(journal, grant.effectKey, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    expect(() => settleC2bEffect(journal, grant.effectKey, { outcome: 'Confirmed', proof: {
      ...confirmation(grant), providerReference: 'FAKE', readback: { operation: 'Grant' }
    } }, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion)).toThrow(/exact effect-specific/);

    const beforeStable = settleBeforeStable();
    const stable = beforeStable.effects.find(effect => effect.kind === 'StableRead')!;
    const issued = issueNextC2bEffect(beforeStable, stable.effectKey, 'PROCESSOR-A', beforeStable.leaseEpoch, now, beforeStable.journalVersion);
    const missing = stableProof(issued);
    missing.first.acls[0].acl.allowedPrincipals = missing.first.acls[0].acl.allowedPrincipals.slice(1);
    missing.second = JSON.parse(JSON.stringify(missing.first)) as C2bCanonicalObservation;
    expect(() => confirmC2bStableRead(issued, stable.effectKey, missing,
      'PROCESSOR-A', issued.leaseEpoch, now, issued.journalVersion)).toThrow(/intended image/);
    const extra = stableProof(issued);
    extra.first.acls[0].acl.allowedPrincipals = [...extra.first.acls[0].acl.allowedPrincipals,
      { principalKey: 'EXTRA', permission: 'Read', source: 'Admin' }];
    extra.second = JSON.parse(JSON.stringify(extra.first)) as C2bCanonicalObservation;
    expect(() => confirmC2bStableRead(issued, stable.effectKey, extra,
      'PROCESSOR-A', issued.leaseEpoch, now, issued.journalVersion)).toThrow(/intended image/);
  });

  it('rejects incomplete paging, wrong stable images and receipt before post-finalise proof', () => {
    const beforeStable = settleBeforeStable();
    const receipt = beforeStable.effects.find(effect => effect.kind === 'ReceiptCreate')!;
    expect(() => issueNextC2bEffect(beforeStable, receipt.effectKey, 'PROCESSOR-A', beforeStable.leaseEpoch,
      now, beforeStable.journalVersion)).toThrow(/plan order/);
    const stable = beforeStable.effects.find(effect => effect.kind === 'StableRead')!;
    const issued = issueNextC2bEffect(beforeStable, stable.effectKey, 'PROCESSOR-A', beforeStable.leaseEpoch, now, beforeStable.journalVersion);
    const incomplete = stableProof(issued); incomplete.first.pagination.complete = false;
    incomplete.second = JSON.parse(JSON.stringify(incomplete.first)) as C2bCanonicalObservation;
    expect(() => confirmC2bStableRead(issued, stable.effectKey, incomplete,
      'PROCESSOR-A', issued.leaseEpoch, now, issued.journalVersion)).toThrow(/complete intended image/);
    const wrong = stableProof(issued); wrong.first.header.fields = { ...wrong.first.header.fields, State: 'Submitted' };
    wrong.second = JSON.parse(JSON.stringify(wrong.first)) as C2bCanonicalObservation;
    expect(() => confirmC2bStableRead(issued, stable.effectKey, wrong,
      'PROCESSOR-A', issued.leaseEpoch, now, issued.journalVersion)).toThrow(/intended image/);
  });

  it('keeps false Confirmed recovery Held and records exact Held/Recovery evidence', () => {
    let journal = lease();
    const claim = journal.effects[0];
    journal = issueNextC2bEffect(journal, claim.effectKey, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    journal = settleC2bEffect(journal, claim.effectKey, { outcome: 'Unknown', safeCode: 'TIMEOUT_UNKNOWN' },
      'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    expect(journal).toMatchObject({ state: 'Held', outcomeAudits: [{ outcome: 'Held', safeCode: 'TIMEOUT_UNKNOWN' }] });
    expect(() => recoverC2bEffect(journal, claim.effectKey, { outcome: 'Confirmed', providerReference: 'FAKE',
      naturalKey: claim.naturalKey, requestETag: null, observedETag: '"wrong"', observedRowVersionToken: 1,
      readback: { Wrong: true } }, now, journal.journalVersion)).toThrow(/exact effect-specific/);
    expect(journal.state).toBe('Held');
    journal = recoverC2bEffect(journal, claim.effectKey, { outcome: 'Confirmed', providerReference: 'READBACK-001',
      naturalKey: claim.naturalKey, requestETag: null, observedETag: '"claim-1"', observedRowVersionToken: 1,
      readback: claim.desiredFields }, now, journal.journalVersion);
    expect(journal.outcomeAudits.map(value => value.outcome)).toEqual(['Held', 'Recovery']);
  });

  it('recovers Finalise NotApplied only from the exact Claim-derived before ETag, token and image', () => {
    let journal = lease();
    while (true) {
      const current = journal.effects.find(effect => effect.disposition !== 'Confirmed')!;
      journal = issueNextC2bEffect(journal, current.effectKey, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
      if (current.kind === 'Finalise') {
        journal = settleC2bEffect(journal, current.effectKey, { outcome: 'Unknown', safeCode: 'FINALISE_TIMEOUT' },
          'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
        break;
      }
      journal = settleC2bEffect(journal, current.effectKey, { outcome: 'Confirmed', proof: confirmation(current) },
        'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    }
    const finalise = journal.effects.find(effect => effect.kind === 'Finalise')!;
    const claim = journal.effects.find(effect => effect.kind === 'Claim')!;
    const exact = { outcome: 'NotApplied' as const, providerReference: 'FINALISE-NOT-APPLIED',
      naturalKey: finalise.naturalKey, requestETag: claim.confirmation!.observedETag,
      observedETag: claim.confirmation!.observedETag,
      observedRowVersionToken: finalise.expectedRowVersionToken, readback: finalise.beforeFields };
    expect(() => recoverC2bEffect(journal, finalise.effectKey,
      { ...exact, observedETag: '"wrong"' }, now, journal.journalVersion)).toThrow(/Claim-derived ETag/);
    expect(() => recoverC2bEffect(journal, finalise.effectKey,
      { ...exact, requestETag: '"wrong"' }, now, journal.journalVersion)).toThrow(/Claim-derived ETag/);
    expect(() => recoverC2bEffect(journal, finalise.effectKey,
      { ...exact, observedRowVersionToken: 99 }, now, journal.journalVersion)).toThrow(/token/);
    expect(() => recoverC2bEffect(journal, finalise.effectKey,
      { ...exact, readback: { Wrong: true } }, now, journal.journalVersion)).toThrow(/before image/);
    journal = recoverC2bEffect(journal, finalise.effectKey, exact, now, journal.journalVersion);
    expect(journal).toMatchObject({ state: 'Planned', effects: expect.arrayContaining([
      expect.objectContaining({ kind: 'Finalise', disposition: 'Planned' })
    ]) });
  });

  it.each(['AuditAppend', 'StableRead', 'ReceiptCreate', 'ReceiptGrant'] as const)(
    're-holds and exactly restores Ready before retry when %s fails after Finalise', kind => {
      const issued = issuePostFinalise(kind);
      const effect = issued.effects.find(candidate => candidate.kind === kind)!;
      const receiptCreateETag = kind === 'ReceiptGrant'
        ? issued.effects.find(candidate => candidate.kind === 'ReceiptCreate')!.confirmation!.observedETag : null;
      const exactHold = holdProof(issued);
      expect(() => holdC2bPostFinaliseEffect(issued, effect.effectKey,
        { outcome: 'Unknown', safeCode: `${kind.toUpperCase()}_UNKNOWN`, safeReason: 'Synthetic post-finalise failure.' },
        { ...exactHold, processorEpoch: issued.leaseEpoch + 1 }, 'PROCESSOR-A', issued.leaseEpoch,
        now, issued.journalVersion)).toThrow(/epoch/);
      const held = holdC2bPostFinaliseEffect(issued, effect.effectKey,
        { outcome: kind === 'StableRead' ? 'DefinitiveFailure' : 'Unknown',
          safeCode: `${kind.toUpperCase()}_FAILED`, safeReason: 'Synthetic post-finalise failure.' },
        exactHold, 'PROCESSOR-A', issued.leaseEpoch, now, issued.journalVersion);
      expect(held).toMatchObject({ state: 'Held', leaseOwner: null, stableRead: null,
        recoveryHold: { effectKey: effect.effectKey, leaseEpoch: issued.leaseEpoch,
          proof: { readback: { AccessState: 'RecoveryHold', TransitionStatus: 'Held' } } } });
      expect(held.outcomeAudits[held.outcomeAudits.length - 1]).toMatchObject({
        outcome: 'Held', effectKey: effect.effectKey, success: false
      });
      const notApplied = { outcome: 'NotApplied' as const, providerReference: `${kind}-NOT-APPLIED`,
        naturalKey: effect.naturalKey, requestETag: effect.kind === 'ReceiptGrant'
          ? receiptCreateETag
          : effect.expectedETag,
        observedETag: effect.kind === 'ReceiptGrant'
          ? receiptCreateETag
          : effect.expectedETag,
        observedRowVersionToken: effect.expectedRowVersionToken, readback: effect.beforeFields };
      const restore = { providerReference: 'RESTORE-READY-001', naturalKey: held.plan.subjectKey,
        requestETag: exactHold.observedETag, observedETag: '"restored-etag"',
        observedRowVersionToken: held.plan.intendedImage.header.fields.RowVersionToken as number,
        processorEpoch: issued.leaseEpoch, beforeFields: exactHold.readback,
        readback: held.plan.intendedImage.header.fields };
      expect(() => recoverC2bPostFinaliseEffect(held, effect.effectKey, notApplied,
        { ...restore, requestETag: '"wrong"' }, 'PROCESSOR-A', issued.leaseEpoch,
        now, held.journalVersion)).toThrow(/Ready restoration/);
      const recovered = recoverC2bPostFinaliseEffect(held, effect.effectKey, notApplied, restore,
        'PROCESSOR-A', issued.leaseEpoch, now, held.journalVersion);
      expect(recovered).toMatchObject({ state: 'Planned', recoveryHold: null,
        effects: expect.arrayContaining([expect.objectContaining({ effectKey: effect.effectKey, disposition: 'Planned' })]) });
      expect(recovered.outcomeAudits[recovered.outcomeAudits.length - 1]).toMatchObject({
        outcome: 'Recovery', safeCode: 'POST_FINALISE_NOT_APPLIED_RESTORED', success: true
      });
    });

  it('does not convert an expired post-Finalise effect to Held without canonical RecoveryHold proof', () => {
    const issued = issuePostFinalise('AuditAppend');
    const effect = issued.effects.find(candidate => candidate.kind === 'AuditAppend')!;
    const afterExpiry = '2026-09-12T03:06:00Z';
    expect(() => acquireC2bLease(issued, 'PROCESSOR-B', afterExpiry, '2026-09-12T03:11:00Z',
      issued.journalVersion)).toThrow(/post-Finalise.*RecoveryHold/);
    expect(issued).toMatchObject({ state: 'Applying', recoveryHold: null });
    const held = holdC2bPostFinaliseEffect(issued, effect.effectKey,
      { outcome: 'Unknown', safeCode: 'LEASE_EXPIRED', safeReason: 'Synthetic expired post-finalise lease.' },
      holdProof(issued), 'PROCESSOR-A', issued.leaseEpoch, afterExpiry, issued.journalVersion);
    expect(held).toMatchObject({ state: 'Held', recoveryHold: { effectKey: effect.effectKey } });
  });

  it('returns durable Rejected/Collision evidence and rejects missing failure semantics', () => {
    const rejected = createC2bRejectedOutcome({ commandKey: 'b07d8244-ba0e-4ac3-a2b1-01535e8c0f5d', commandType: 'UpdateWorkplanDraftV2',
      personKey: 'PERSON-001', subjectKey: 'PERSON-001|2027', performanceYear: 2027 },
    { forged: true }, 'SCHEMA_REJECTED', 'Payload schema did not match.', now);
    expect(rejected).toMatchObject({ audit: { outcome: 'Rejected', success: false }, receipt: { outcome: 'Rejected' } });
    expect(rejected.audit.evidenceSha256).toMatch(/^[0-9A-F]{64}$/);
    expect(() => createC2bRejectedOutcome({ commandKey: 'b07d8244-ba0e-4ac3-a2b1-01535e8c0f5d', commandType: 'UpdateWorkplanDraftV2',
      personKey: 'PERSON-001', subjectKey: 'PERSON-001|2027', performanceYear: 2027 }, {}, '', '', now))
      .toThrow(/code and safe message/);
    const existing = admitC2bPlan(undefined, createPlan(), now);
    if (existing.status !== 'Created') throw new Error('Expected created.');
    const collision = admitC2bPlan(existing.journal, createPlan('OTHER-SITE-MEMBERS'), now);
    expect(collision).toMatchObject({ status: 'Collision', audit: { outcome: 'Collision' }, receipt: { outcome: 'Rejected' } });
  });

  it('accepts only after final image, all effect evidence, receipt create and exact actor receipt access', () => {
    let journal = settleStable();
    const receiptCreate = journal.effects.find(effect => effect.kind === 'ReceiptCreate')!;
    journal = issueNextC2bEffect(journal, receiptCreate.effectKey,
      'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    const createProof = receiptCreateConfirmation(journal, receiptCreate);
    const createdReadback = createProof.readback as { operation: string; receipt: C2bTerminalReceipt };
    expect(() => settleC2bEffect(journal, receiptCreate.effectKey, { outcome: 'Confirmed', proof: {
      ...createProof, readback: { ...createdReadback,
        receipt: { ...createdReadback.receipt, planSha256: 'F'.repeat(64) } }
    } }, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion)).toThrow(/full immutable receipt/);
    expect(() => settleC2bEffect(journal, receiptCreate.effectKey, { outcome: 'Confirmed', proof: {
      ...createProof, readback: { ...createdReadback, receipt: { ...createdReadback.receipt,
        actorAccess: { ...createdReadback.receipt.actorAccess, allowedPrincipals: [] } } }
    } }, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion)).toThrow(/full immutable receipt/);
    journal = settleC2bEffect(journal, receiptCreate.effectKey, { outcome: 'Confirmed', proof: createProof },
      'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    const receiptGrant = journal.effects.find(effect => effect.kind === 'ReceiptGrant')!;
    journal = issueNextC2bEffect(journal, receiptGrant.effectKey, 'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    const confirmedReceiptCreate = journal.effects.find(effect => effect.kind === 'ReceiptCreate')!;
    const receipt = (confirmedReceiptCreate.confirmation!.readback as { receipt: C2bTerminalReceipt }).receipt;
    expect(() => completeC2bReceipt(journal, receiptGrant.effectKey,
      { ...receipt, processorReference: 'FABRICATED-RUN' }, receiptGrantConfirmation(journal, receiptGrant),
      'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion)).toThrow(/differs from the confirmed/);
    expect(() => completeC2bReceipt(journal, receiptGrant.effectKey, receipt,
      { ...confirmation(receiptGrant), readback: { operation: 'FakeReceiptGrant' } },
      'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion)).toThrow(/ReceiptGrant|effect-specific/);
    journal = completeC2bReceipt(journal, receiptGrant.effectKey, receipt, receiptGrantConfirmation(journal, receiptGrant),
      'PROCESSOR-A', journal.leaseEpoch, now, journal.journalVersion);
    expect(journal).toMatchObject({ state: 'Terminal', receipt: { outcome: 'Accepted' } });
    expect(journal.outcomeAudits[journal.outcomeAudits.length - 1])
      .toMatchObject({ outcome: 'Accepted', success: true });
    expect(journal.effects.every(effect => effect.disposition === 'Confirmed')).toBe(true);
  });
});
