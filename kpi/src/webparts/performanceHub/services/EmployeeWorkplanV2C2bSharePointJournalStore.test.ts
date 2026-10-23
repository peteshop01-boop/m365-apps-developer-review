import {
  acquireC2bLease,
  C2B_LIST_CAPABILITY_REQUIREMENTS,
  C2B_SCHEMA_REVISION,
  admitC2bPlan,
  cloneC2b,
  hashC2bCanonical,
  issueNextC2bEffect,
  type C2bAclImage,
  type C2bCommandJournal,
} from './TestPilotCommandAdmissionC2b';
import {
  planCreateWorkplanDraftC2b,
  type C2bTrustedAnnualConfiguration,
  type C2bTrustedPerson
} from './TestPilotCommandAdmissionC2bHandlers';
import {
  C2bSharePointCasConflictError,
  C2bSharePointContractError,
  C2bSharePointWriteUnknownError,
  SharePointC2bJournalEffectStore,
  deserialiseC2bEffectRow,
  deserialiseC2bJournalRow,
  serialiseC2bEffectRow,
  serialiseC2bJournalRow,
  type IC2bSharePointRestRequest,
  type IC2bSharePointRestResponse,
  type IC2bSharePointRestTransport,
  type IC2bSharePointTransportTargetIdentity
} from './EmployeeWorkplanV2C2bSharePointJournalStore';
import {
  C2B_COMMAND_EFFECTS_LIST_CONTRACT,
  C2B_COMMAND_JOURNAL_LIST_CONTRACT,
  C2B_EXISTING_LIST_REMEDIATIONS,
  C2B_SHAREPOINT_PHYSICAL_CONTRACT,
  planC2bSharePointProvisioning,
  verifyC2bSharePointPhysicalContract,
  type IC2bSharePointListObservation,
  type IC2bSharePointProvisioningConfiguration,
  type IC2bSharePointProvisioningTargetObservation
} from './EmployeeWorkplanV2C2bSharePointSchema';

const commandKey = 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1';
const journalListId = 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d';
const effectListId = '6906d187-3451-467a-a362-10ddc87449f7';
const id = (index: number): string => `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const canonicalTargetIdentity: IC2bSharePointTransportTargetIdentity = {
  siteUrl: 'https://tenant.example.invalid/sites/kcf-test',
  siteCollectionId: '094ae5f7-ea13-44c9-a9b1-6863e144bf53',
  webId: '9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818'
};

const employee: C2bTrustedPerson = { personKey: 'PERSON-001', email: 'employee@example.invalid',
  displayName: 'Synthetic Employee', active: true, roles: ['Employee'], managerPersonKey: 'PERSON-002',
  managerEmail: 'manager@example.invalid' };
const manager: C2bTrustedPerson = { personKey: 'PERSON-002', email: 'manager@example.invalid',
  displayName: 'Synthetic Manager', active: true, roles: ['Employee', 'Manager'], managerPersonKey: null,
  managerEmail: null };
const annualConfiguration: C2bTrustedAnnualConfiguration = { schemaRevision: C2B_SCHEMA_REVISION,
  performanceYear: 2027, behaviourContractVersion: 'CONFIGURED-BEHAVIOUR-VERSION', initialState: 'Draft',
  initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready', processorPrincipalKey: 'PROCESSOR-001',
  adminPrincipalKeys: ['ADMIN-GROUP-001'] };
function makeJournal(blobLength = 0): C2bCommandJournal {
  const extraPrincipal = blobLength ? `${'A'.repeat(blobLength)}😀` : 'SITE-MEMBERS';
  const currentAcl: C2bAclImage = { containerKey: employee.personKey, breaksInheritanceAtContainer: true,
    canonicalChildrenInherit: true, allowedPrincipals: [
      { principalKey: extraPrincipal, permission: 'Read', source: 'Admin' }
    ], revokedPrincipalKeys: [] };
  const plan = planCreateWorkplanDraftC2b({ commandKey, commandType: 'CreateWorkplanDraft',
    personKey: employee.personKey, performanceYear: 2027, payload: {} }, employee.email, employee, manager,
  annualConfiguration, { current: [{ listPurpose: 'Workplans', acl: currentAcl }] });
  const admitted = admitC2bPlan(undefined, plan, '2026-09-13T04:00:00.000Z');
  if (admitted.status !== 'Created') throw new Error('Expected a valid full C2b journal fixture.');
  return admitted.journal;
}

const largestEffect = (journal: C2bCommandJournal): C2bCommandJournal['effects'][number] =>
  journal.effects.reduce((largest, effect) => JSON.stringify(effect).length > JSON.stringify(largest).length ? effect : largest);

class MemorySharePointTransport implements IC2bSharePointRestTransport {
  private readonly tables = new Map<string, Array<Record<string, unknown>>>();
  private nextId = 1;
  private nextEtag = 1;
  public readonly requests: IC2bSharePointRestRequest[] = [];
  public throwAfterCommitForEffectKey: string | undefined;

  public constructor(public readonly targetIdentity: IC2bSharePointTransportTargetIdentity = {
    ...canonicalTargetIdentity
  }) {}

  private table(relativeUrl: string): Array<Record<string, unknown>> {
    const match = relativeUrl.match(/lists\(guid'([^']+)'\)/);
    if (!match) throw new Error('Synthetic transport received an invalid list URL.');
    const value = this.tables.get(match[1]) || [];
    this.tables.set(match[1], value);
    return value;
  }

  public request(request: IC2bSharePointRestRequest): Promise<IC2bSharePointRestResponse> {
    this.requests.push(request);
    const table = this.table(request.relativeUrl);
    if (request.method === 'GET') {
      const decoded = decodeURIComponent(request.relativeUrl);
      const filter = decoded.match(/\$filter=(CommandKey|EffectKey) eq '([^']+)'/);
      const values = filter ? table.filter(row => row[filter[1]] === filter[2].replace(/''/g, "'")) : [...table];
      return Promise.resolve({ status: 200, body: { value: values.map(row => ({ ...row })) } });
    }
    if (!request.body) throw new Error('Synthetic write body missing.');
    if (request.method === 'POST') {
      const keyField = request.body.CommandKey && !request.body.EffectKey ? 'CommandKey' : 'EffectKey';
      if (table.some(row => row[keyField] === request.body?.[keyField]))
        return Promise.resolve({ status: 409 });
      const row = { ...request.body, Id: this.nextId++, '@odata.etag': `"${this.nextEtag++}"` };
      table.push(row);
      if (this.throwAfterCommitForEffectKey && request.body.EffectKey === this.throwAfterCommitForEffectKey) {
        this.throwAfterCommitForEffectKey = undefined;
        throw new Error('Synthetic connection interruption after commit.');
      }
      return Promise.resolve({ status: 201, body: row });
    }
    const itemId = Number(request.relativeUrl.match(/items\((\d+)\)/)?.[1]);
    const row = table.find(value => value.Id === itemId);
    if (!row || request.headers['If-Match'] !== row['@odata.etag']) return Promise.resolve({ status: 412 });
    Object.assign(row, request.body, { '@odata.etag': `"${this.nextEtag++}"` });
    return Promise.resolve({ status: 204 });
  }

  public corrupt(listId: string, field: string, value: unknown): void {
    const row = this.tables.get(listId)?.[0];
    if (!row) throw new Error('Synthetic row is absent.');
    row[field] = value;
  }

  public writeCount(listId: string): number {
    return this.requests.filter(request => request.method !== 'GET' && request.relativeUrl.includes(listId)).length;
  }
}

const binding = {
  enabled: true, environmentKind: 'NonProduction' as const, environmentId: 'SYNTHETIC-ENVIRONMENT',
  ...canonicalTargetIdentity, connectionReference: 'SYNTHETIC-CONNECTION',
  commandJournalListId: journalListId, commandEffectsListId: effectListId
};

describe('C2b physical SharePoint journal/effect contract', () => {
  it('round-trips canonical multi-chunk journal/effect state and rejects capacity overflow', () => {
    const journal = makeJournal(61000);
    const effect = largestEffect(journal);
    const journalRow = serialiseC2bJournalRow(journal);
    const effectRow = serialiseC2bEffectRow(commandKey, effect, '"1"', journal);
    expect(journalRow.JournalChunkCount).toBeGreaterThan(1);
    expect(effectRow.EffectChunkCount).toBeGreaterThan(1);
    expect(deserialiseC2bJournalRow(journalRow)).toEqual(journal);
    expect(deserialiseC2bEffectRow(effectRow, journal)).toEqual(effect);
    const oversizedEffectJournal = makeJournal(490000);
    expect(() => serialiseC2bEffectRow(commandKey, largestEffect(oversizedEffectJournal), '"1"',
      oversizedEffectJournal))
      .toThrow('C2B_SHAREPOINT_CAPACITY_EXCEEDED');
    expect(() => serialiseC2bJournalRow(makeJournal(970000))).toThrow('C2B_SHAREPOINT_CAPACITY_EXCEEDED');
  });

  it('rejects the review one-effect/unrelated-payload-hash journal before serialisation', () => {
    const invalid = cloneC2b(makeJournal());
    invalid.plan.payloadSha256 = 'A'.repeat(64);
    invalid.plan.effects = [invalid.plan.effects[0]];
    invalid.effects = [invalid.effects[0]];
    const withoutHash = { ...invalid.plan } as Partial<typeof invalid.plan>;
    delete withoutHash.planSha256;
    invalid.plan.planSha256 = hashC2bCanonical(withoutHash);
    expect(() => serialiseC2bJournalRow(invalid)).toThrow(/incomplete|payload/i);
  });

  it('rejects corrupt lease, confirmation, terminal and query-projection states before acceptance', () => {
    const plannedConfirmation = cloneC2b(makeJournal());
    plannedConfirmation.effects[0].confirmation = { providerReference: 'INVALID',
      naturalKey: plannedConfirmation.effects[0].naturalKey, requestETag: null, observedETag: null,
      observedRowVersionToken: null, readback: plannedConfirmation.effects[0].desiredFields };
    plannedConfirmation.effects[0].confirmationSha256 = hashC2bCanonical(plannedConfirmation.effects[0].confirmation);
    expect(() => serialiseC2bJournalRow(plannedConfirmation)).toThrow(/unconfirmed effect/i);

    const missingLease = cloneC2b(makeJournal()); missingLease.state = 'Leased';
    expect(() => serialiseC2bJournalRow(missingLease)).toThrow(/lease/i);
    const falseTerminal = cloneC2b(makeJournal()); falseTerminal.state = 'Terminal';
    expect(() => serialiseC2bJournalRow(falseTerminal)).toThrow(/Terminal|confirmed/i);

    const row = { ...serialiseC2bJournalRow(makeJournal()), State: 'Terminal' };
    expect(() => deserialiseC2bJournalRow(row)).toThrow('C2B_JOURNAL_READBACK_MISMATCH');
  });

  it('uses stable readback and exact ETag CAS for journal create/update/conflict', async () => {
    const transport = new MemorySharePointTransport();
    const store = new SharePointC2bJournalEffectStore(transport, binding);
    const journal = makeJournal();
    const created = await store.compareExchangeJournal(journal, null);
    expect((await store.readJournal(commandKey)).journal).toEqual(journal);
    const leased = acquireC2bLease(journal, 'PROCESSOR-A', '2026-09-13T04:00:00.000Z',
      '2026-09-13T04:05:00.000Z', journal.journalVersion);
    const updated = await store.compareExchangeJournal(leased, created.etag);
    expect(updated.etag).not.toBe(created.etag);
    const writesBeforeConflict = transport.writeCount(journalListId);
    await expect(store.compareExchangeJournal(journal, created.etag)).rejects.toBeInstanceOf(C2bSharePointCasConflictError);
    expect(transport.writeCount(journalListId)).toBe(writesBeforeConflict);
  });

  it('creates and CAS-updates effect state while making duplicate replay idempotent', async () => {
    const transport = new MemorySharePointTransport();
    const store = new SharePointC2bJournalEffectStore(transport, binding);
    const journal = makeJournal();
    const journalWrite = await store.compareExchangeJournal(journal, null);
    const issued = cloneC2b(journal.effects[0]);
    issued.disposition = 'Issued';
    const first = await store.persistEffectState(issued, journalWrite.etag);
    expect((await store.readStoredEffect(issued.effectKey))?.value).toEqual(issued);
    const writesAfterFirst = transport.writeCount(effectListId);
    const replay = await store.persistEffectState(issued, journalWrite.etag);
    expect(replay.etag).toBe(first.etag);
    expect(transport.writeCount(effectListId)).toBe(writesAfterFirst);

    const confirmed = cloneC2b(issued);
    confirmed.disposition = 'Confirmed';
    confirmed.confirmation = { providerReference: 'SYNTHETIC-1', naturalKey: confirmed.naturalKey,
      requestETag: null, observedETag: '"canonical-1"', observedRowVersionToken: 1,
      readback: cloneC2b(confirmed.desiredFields) };
    confirmed.confirmationSha256 = hashC2bCanonical(confirmed.confirmation);
    await store.persistEffectState(confirmed, journalWrite.etag);
    expect((await store.readStoredEffect(confirmed.effectKey))?.value.disposition).toBe('Confirmed');
  });

  it('does not blindly retry an unknown effect write and recovers by exact readback', async () => {
    const transport = new MemorySharePointTransport();
    const store = new SharePointC2bJournalEffectStore(transport, binding);
    const journal = makeJournal();
    const journalWrite = await store.compareExchangeJournal(journal, null);
    const issued = cloneC2b(journal.effects[0]);
    issued.disposition = 'Issued';
    transport.throwAfterCommitForEffectKey = issued.effectKey;
    await expect(store.persistEffectState(issued, journalWrite.etag)).rejects
      .toBeInstanceOf(C2bSharePointWriteUnknownError);
    expect(transport.writeCount(effectListId)).toBe(1);
    const recovered = await store.recoverEffectPersistence(issued);
    expect(recovered.outcome).toBe('Applied');
    expect(transport.writeCount(effectListId)).toBe(1);
  });

  it('distinguishes not-applied and divergent partial effect recovery without mutation', async () => {
    const transport = new MemorySharePointTransport();
    const store = new SharePointC2bJournalEffectStore(transport, binding);
    const journal = makeJournal();
    const journalWrite = await store.compareExchangeJournal(journal, null);
    const planned = journal.effects[0];
    await store.createEffect(commandKey, planned, journalWrite.etag);
    const issued = cloneC2b(planned);
    issued.disposition = 'Issued';
    const notApplied = await store.recoverEffectPersistence(issued, planned);
    expect(notApplied.outcome).toBe('NotApplied');
    const held = cloneC2b(planned);
    held.disposition = 'Held';
    await store.compareExchangeEffect(commandKey, held, (await store.readStoredEffect(planned.effectKey))!.etag,
      journalWrite.etag);
    const unknown = await store.recoverEffectPersistence(issued, planned);
    expect(unknown.outcome).toBe('StillUnknown');
  });

  it('rejects corrupted stable readback and disabled/unbound storage configuration', async () => {
    const transport = new MemorySharePointTransport();
    const store = new SharePointC2bJournalEffectStore(transport, binding);
    await store.compareExchangeJournal(makeJournal(), null);
    transport.corrupt(journalListId, 'JournalChunk01', '{"tampered":true}');
    await expect(store.readJournal(commandKey)).rejects.toBeInstanceOf(C2bSharePointContractError);
    expect(() => new SharePointC2bJournalEffectStore(transport, { ...binding, enabled: false }))
      .toThrow('C2B_NATIVE_STORE_DISABLED_UNBOUND');
  });

  it('binds the native transport to the canonical URL and exact collection/web identity pair', () => {
    const canonicalisedBinding = { ...binding,
      siteUrl: 'HTTPS://TENANT.EXAMPLE.INVALID/sites/kcf-test/',
      siteCollectionId: '{094ae5f7-ea13-44c9-a9b1-6863e144bf53}',
      webId: ' {9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818} ' };
    expect(() => new SharePointC2bJournalEffectStore(new MemorySharePointTransport(), canonicalisedBinding))
      .not.toThrow();

    const mismatchedUrl = new MemorySharePointTransport({ ...canonicalTargetIdentity,
      siteUrl: 'https://tenant.example.invalid/sites/another-web' });
    expect(() => new SharePointC2bJournalEffectStore(mismatchedUrl, binding))
      .toThrow('C2B_NATIVE_STORE_TARGET_MISMATCH');
    const mismatchedCollection = new MemorySharePointTransport({ ...canonicalTargetIdentity,
      siteCollectionId: 'a43afb76-f56b-4016-a860-8b8039ace574' });
    expect(() => new SharePointC2bJournalEffectStore(mismatchedCollection, binding))
      .toThrow('C2B_NATIVE_STORE_TARGET_MISMATCH');
    const mismatchedWeb = new MemorySharePointTransport({ ...canonicalTargetIdentity,
      webId: 'daff0268-1b17-4e23-a456-c20c696c0299' });
    expect(() => new SharePointC2bJournalEffectStore(mismatchedWeb, binding))
      .toThrow('C2B_NATIVE_STORE_TARGET_MISMATCH');
    const swapped = new MemorySharePointTransport({ ...canonicalTargetIdentity,
      siteCollectionId: canonicalTargetIdentity.webId, webId: canonicalTargetIdentity.siteCollectionId });
    expect(() => new SharePointC2bJournalEffectStore(swapped, binding))
      .toThrow('C2B_NATIVE_STORE_TARGET_MISMATCH');
    const malformedBinding = { ...binding, webId: 'tenant.example.invalid,collection,web' };
    expect(() => new SharePointC2bJournalEffectStore(new MemorySharePointTransport(), malformedBinding))
      .toThrow('C2B_NATIVE_STORE_DISABLED_UNBOUND');
    expect(mismatchedUrl.requests).toHaveLength(0);
    expect(mismatchedCollection.requests).toHaveLength(0);
    expect(mismatchedWeb.requests).toHaveLength(0);
    expect(swapped.requests).toHaveLength(0);
  });

  it('preserves lease owner/epoch and holds an expired issued effect', () => {
    const journal = makeJournal();
    const leased = acquireC2bLease(journal, 'PROCESSOR-A', '2026-09-13T04:00:00.000Z',
      '2026-09-13T04:05:00.000Z', journal.journalVersion);
    expect(() => issueNextC2bEffect(leased, leased.effects[0].effectKey, 'PROCESSOR-A', leased.leaseEpoch + 1,
      '2026-09-13T04:01:00.000Z', leased.journalVersion)).toThrow('owner or epoch is stale');
    const issued = issueNextC2bEffect(leased, leased.effects[0].effectKey, 'PROCESSOR-A', leased.leaseEpoch,
      '2026-09-13T04:01:00.000Z', leased.journalVersion);
    const held = acquireC2bLease(issued, 'PROCESSOR-B', '2026-09-13T04:06:00.000Z',
      '2026-09-13T04:11:00.000Z', issued.journalVersion);
    expect(held.state).toBe('Held');
    expect(held.effects[0].disposition).toBe('Held');
    expect(held.leaseOwner).toBeNull();
  });
});

const knownRuntimeConfiguration = (): IC2bSharePointProvisioningConfiguration => ({
  enabled: true, environmentKind: 'NonProduction',
  environmentId: 'Default-923abc6b-8271-4462-a054-bf1c293044a0',
  siteUrl: 'https://example.invalid/sites/REVIEW-TEST-SITE',
  siteCollectionId: 'f2d23af0-1770-4e9b-aca2-1462b43c8999',
  webId: '4ebc956f-bc50-42e0-ac05-59a032569075',
  connectionReference: 'new_sharedsharepointonline_0237e|bf81c320-96d3-4c29-a4e2-6779b72ee59e',
  listIds: {
    People: 'c89a7c3c-4ad7-45ca-ae17-5c108c318598',
    EmployeeCommands: '3e05ec37-95ce-4a30-a56c-ff2437bf9bed',
    ManagerCommands: '40ec1c73-a802-40ec-a6a2-cde0cba1d182',
    CommandReceipts: '3eb157c8-6290-4e1b-ad6b-d41e4a2293b9',
    Workplans: '47210791-25f1-416e-ab24-832c8b6448ec',
    WorkplanItems: '98f2a280-46a7-40b5-a37d-db97b02fc826',
    Audit: '59a00c55-5ceb-4561-a5d5-0942edb5ad6d'
  },
  permissions: { processorPrincipalId: 101, controlledAdminPrincipalIds: [102],
    commandSubmitterPrincipalIds: [103], receiptActorPrincipalIds: [105], negativeProofPrincipalIds: [106],
    containerPrincipalBindings: [
      { purpose: 'Workplans', containerKey: 'PERSON-001', actorPrincipalIds: [105] },
      { purpose: 'WorkplanItems', containerKey: 'PERSON-001', actorPrincipalIds: [105] }
    ], fullControlRoleDefinitionId: 1073741829,
    readRoleDefinitionId: 1073741826, commandCreateOnlyRoleDefinitionId: 1073741840,
    roleDefinitionEvidence: {
      fullControl: { roleDefinitionId: 1073741829, semantic: 'FullControl', canViewItems: true,
        canAddItems: true, canEditItems: true, canDeleteItems: true, canManagePermissions: true, canManageLists: true },
      read: { roleDefinitionId: 1073741826, semantic: 'Read', canViewItems: true,
        canAddItems: false, canEditItems: false, canDeleteItems: false, canManagePermissions: false, canManageLists: false },
      commandCreateOnly: { roleDefinitionId: 1073741840,
        roleName: 'KCF KPI TEST Command Submitter Create Only v1', basePermissionsHigh: 0, basePermissionsLow: 2,
        semantic: 'CreateOnly', canViewItems: false,
        canAddItems: true, canEditItems: false, canDeleteItems: false, canManagePermissions: false, canManageLists: false }
    }, aclRollbackPrincipalId: 102 }
});

const knownRuntimeObservation = (): IC2bSharePointProvisioningTargetObservation => ({
  siteUrl: 'https://example.invalid/sites/REVIEW-TEST-SITE',
  siteCollectionId: 'f2d23af0-1770-4e9b-aca2-1462b43c8999',
  webId: '4ebc956f-bc50-42e0-ac05-59a032569075'
});

function completeObservations(): IC2bSharePointListObservation[] {
  const title = (purpose: string): string => C2B_SHAREPOINT_PHYSICAL_CONTRACT.lists
    .find(value => value.purpose === purpose)?.title || C2B_EXISTING_LIST_REMEDIATIONS
      .find(value => value.purpose === purpose)!.title;
  return C2B_LIST_CAPABILITY_REQUIREMENTS.map((requirement, index) => {
    const physical = C2B_SHAREPOINT_PHYSICAL_CONTRACT.lists.find(value => value.purpose === requirement.purpose);
    return { purpose: requirement.purpose, title: title(requirement.purpose), listId: id(index + 1), template: 100,
      schemaRevision: 'c2b-annual-v2', versioningEnabled: true, foldersEnabled: requirement.foldersEnabled,
      fields: physical ? physical.fields.map(field => ({ displayName: field.displayName, internalName: field.internalName,
        type: field.type, required: field.required, nullable: field.nullable, defaultValue: field.defaultValue,
        indexed: field.indexed, unique: field.unique, maxLength: field.maxLength, choices: field.choices,
        decimals: field.decimals, minimum: field.minimum, maximum: field.maximum,
        dateTimeFormat: field.dateTimeFormat, richText: field.richText, appendOnly: field.appendOnly })) : [],
      indexedFields: [...requirement.indexedFields], uniqueFields: [...requirement.uniqueFields],
      permissionCapability: requirement.permissionCapability, permissionProofComplete: true };
  });
}

describe('C2b deterministic provisioning and exact verification', () => {
  it('defaults disabled and fails closed when principal/role configuration is absent', () => {
    const disabled = planC2bSharePointProvisioning({ ...knownRuntimeConfiguration(), enabled: false });
    expect(disabled).toEqual({ ready: false, code: 'C2B_PROVISIONING_DISABLED',
      reasons: ['Provisioning is disabled by default.'], operations: [] });
    const unbound = knownRuntimeConfiguration();
    delete unbound.permissions;
    expect(planC2bSharePointProvisioning(unbound, knownRuntimeObservation()).code)
      .toBe('C2B_PERMISSION_CONFIG_ABSENT');
  });

  it('requires independent site identity and plans only for an exact canonical three-field match', () => {
    const formerlyUnsafe = planC2bSharePointProvisioning(knownRuntimeConfiguration());
    expect(formerlyUnsafe).toEqual(expect.objectContaining({ ready: false, operations: [] }));

    const canonicalisedObservation: IC2bSharePointProvisioningTargetObservation = {
      siteUrl: 'HTTPS://example.invalid/sites/REVIEW-TEST-SITE/',
      siteCollectionId: ' {f2d23af0-1770-4e9b-aca2-1462b43c8999} ',
      webId: '{4ebc956f-bc50-42e0-ac05-59a032569075}'
    };
    const exact = planC2bSharePointProvisioning(knownRuntimeConfiguration(), canonicalisedObservation);
    expect(exact).toMatchObject({ ready: true, code: 'C2B_PROVISIONING_PLAN_READY' });
    expect(exact.operations).toHaveLength(190);
  });

  it('emits zero operations for invalid, substituted, swapped, mismatched or Production identities', () => {
    const configuredMissingUrl = knownRuntimeConfiguration(); configuredMissingUrl.siteUrl = null;
    const configuredMissingCollection = knownRuntimeConfiguration(); configuredMissingCollection.siteCollectionId = null;
    const configuredMissingWeb = knownRuntimeConfiguration(); configuredMissingWeb.webId = null;
    const configuredMalformedUrl = knownRuntimeConfiguration(); configuredMalformedUrl.siteUrl = 'not-an-https-url';
    const configuredGraphComposite = knownRuntimeConfiguration();
    configuredGraphComposite.siteCollectionId = 'tenant.example.invalid,collection,web';
    const configuredEqualIds = knownRuntimeConfiguration();
    configuredEqualIds.webId = configuredEqualIds.siteCollectionId;
    const configuredStaleCollection = knownRuntimeConfiguration();
    configuredStaleCollection.siteCollectionId = '094ae5f7-ea13-44c9-a9b1-6863e144bf53';
    const configuredProduction = knownRuntimeConfiguration();
    configuredProduction.environmentKind = 'Production' as 'NonProduction';

    const observationMissingUrl = knownRuntimeObservation(); observationMissingUrl.siteUrl = null;
    const observationMissingCollection = knownRuntimeObservation(); observationMissingCollection.siteCollectionId = null;
    const observationMissingWeb = knownRuntimeObservation(); observationMissingWeb.webId = null;
    const observationMalformedUrl = knownRuntimeObservation(); observationMalformedUrl.siteUrl = 'http://example.invalid';
    const observationGraphComposite = knownRuntimeObservation();
    observationGraphComposite.siteCollectionId = 'tenant.example.invalid,collection,web';
    const observationGroupSubstitution = knownRuntimeObservation();
    observationGroupSubstitution.siteCollectionId = 'a4476f69-b773-4d35-af86-2fccc95b0cb5';
    const observationSwapped = knownRuntimeObservation();
    observationSwapped.siteCollectionId = knownRuntimeObservation().webId;
    observationSwapped.webId = knownRuntimeObservation().siteCollectionId;
    const observationEqualIds = knownRuntimeObservation(); observationEqualIds.webId = observationEqualIds.siteCollectionId;
    const observationWrongWeb = knownRuntimeObservation();
    observationWrongWeb.webId = '9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818';
    const observationWrongCollection = knownRuntimeObservation();
    observationWrongCollection.siteCollectionId = '094ae5f7-ea13-44c9-a9b1-6863e144bf53';
    const observationWrongUrl = knownRuntimeObservation();
    observationWrongUrl.siteUrl = 'https://example.invalid/sites/Another-Site';

    const cases: ReadonlyArray<readonly [IC2bSharePointProvisioningConfiguration,
      IC2bSharePointProvisioningTargetObservation]> = [
      [configuredMissingUrl, knownRuntimeObservation()],
      [configuredMissingCollection, knownRuntimeObservation()],
      [configuredMissingWeb, knownRuntimeObservation()],
      [configuredMalformedUrl, knownRuntimeObservation()],
      [configuredGraphComposite, knownRuntimeObservation()],
      [configuredEqualIds, knownRuntimeObservation()],
      [configuredStaleCollection, knownRuntimeObservation()],
      [configuredProduction, knownRuntimeObservation()],
      [knownRuntimeConfiguration(), observationMissingUrl],
      [knownRuntimeConfiguration(), observationMissingCollection],
      [knownRuntimeConfiguration(), observationMissingWeb],
      [knownRuntimeConfiguration(), observationMalformedUrl],
      [knownRuntimeConfiguration(), observationGraphComposite],
      [knownRuntimeConfiguration(), observationGroupSubstitution],
      [knownRuntimeConfiguration(), observationSwapped],
      [knownRuntimeConfiguration(), observationEqualIds],
      [knownRuntimeConfiguration(), observationWrongWeb],
      [knownRuntimeConfiguration(), observationWrongCollection],
      [knownRuntimeConfiguration(), observationWrongUrl]
    ];
    cases.forEach(([configuration, observation]) => {
      expect(planC2bSharePointProvisioning(configuration, observation)).toEqual(expect.objectContaining({
        ready: false, operations: []
      }));
    });
  });

  it('rejects equal or semantically incompatible roles and absent rollback/proof inputs', () => {
    const equalRoles = knownRuntimeConfiguration();
    equalRoles.permissions!.fullControlRoleDefinitionId = 777;
    equalRoles.permissions!.readRoleDefinitionId = 777;
    equalRoles.permissions!.commandCreateOnlyRoleDefinitionId = 777;
    equalRoles.permissions!.roleDefinitionEvidence.fullControl.roleDefinitionId = 777;
    equalRoles.permissions!.roleDefinitionEvidence.read.roleDefinitionId = 777;
    equalRoles.permissions!.roleDefinitionEvidence.commandCreateOnly.roleDefinitionId = 777;
    expect(planC2bSharePointProvisioning(equalRoles, knownRuntimeObservation())).toMatchObject({ ready: false,
      code: 'C2B_PERMISSION_CONFIG_INVALID' });
    const wrongReadSemantics = knownRuntimeConfiguration();
    wrongReadSemantics.permissions!.roleDefinitionEvidence.read.canAddItems = true;
    expect(planC2bSharePointProvisioning(wrongReadSemantics, knownRuntimeObservation()).ready).toBe(false);
    const noNegativeProof = knownRuntimeConfiguration(); noNegativeProof.permissions!.negativeProofPrincipalIds = [];
    expect(planC2bSharePointProvisioning(noNegativeProof, knownRuntimeObservation()).ready).toBe(false);
    const lockoutRollback = knownRuntimeConfiguration(); lockoutRollback.permissions!.aclRollbackPrincipalId = 999;
    expect(planC2bSharePointProvisioning(lockoutRollback, knownRuntimeObservation()).ready).toBe(false);
  });

  it('rejects privileged actor overlap and ungoverned create-only role evidence with zero operations', () => {
    const sharedPositiveActor = knownRuntimeConfiguration();
    sharedPositiveActor.permissions!.commandSubmitterPrincipalIds = [105];
    expect(planC2bSharePointProvisioning(sharedPositiveActor, knownRuntimeObservation())).toMatchObject({
      ready: true, code: 'C2B_PROVISIONING_PLAN_READY'
    });
    const receiptProcessor = knownRuntimeConfiguration();
    receiptProcessor.permissions!.receiptActorPrincipalIds = [receiptProcessor.permissions!.processorPrincipalId!];
    const containerProcessor = knownRuntimeConfiguration();
    containerProcessor.permissions!.containerPrincipalBindings[0].actorPrincipalIds =
      [containerProcessor.permissions!.processorPrincipalId!];
    const receiptAdmin = knownRuntimeConfiguration();
    receiptAdmin.permissions!.receiptActorPrincipalIds = [receiptAdmin.permissions!.controlledAdminPrincipalIds[0]];
    const containerAdmin = knownRuntimeConfiguration();
    containerAdmin.permissions!.containerPrincipalBindings[1].actorPrincipalIds =
      [containerAdmin.permissions!.controlledAdminPrincipalIds[0]];
    const designLabelledCreateOnly = knownRuntimeConfiguration();
    designLabelledCreateOnly.permissions!.commandCreateOnlyRoleDefinitionId = 1073741828;
    designLabelledCreateOnly.permissions!.roleDefinitionEvidence.commandCreateOnly.roleDefinitionId = 1073741828;
    const wrongRoleName = knownRuntimeConfiguration();
    wrongRoleName.permissions!.roleDefinitionEvidence.commandCreateOnly.roleName = 'CreateOnly';
    const wrongRawMask = knownRuntimeConfiguration();
    wrongRawMask.permissions!.roleDefinitionEvidence.commandCreateOnly.basePermissionsLow = 3;
    const mismatchedLiveRoleId = knownRuntimeConfiguration();
    mismatchedLiveRoleId.permissions!.roleDefinitionEvidence.commandCreateOnly.roleDefinitionId = 1073741841;
    const contradictoryDerivedCapability = knownRuntimeConfiguration();
    contradictoryDerivedCapability.permissions!.roleDefinitionEvidence.commandCreateOnly.canViewItems = true;
    const negativePositiveOverlap = knownRuntimeConfiguration();
    negativePositiveOverlap.permissions!.negativeProofPrincipalIds =
      [negativePositiveOverlap.permissions!.commandSubmitterPrincipalIds[0]];
    const processorAdminOverlap = knownRuntimeConfiguration();
    processorAdminOverlap.permissions!.processorPrincipalId =
      processorAdminOverlap.permissions!.controlledAdminPrincipalIds[0];

    [receiptProcessor, containerProcessor, receiptAdmin, containerAdmin, designLabelledCreateOnly,
      wrongRoleName, wrongRawMask, mismatchedLiveRoleId, contradictoryDerivedCapability, negativePositiveOverlap,
      processorAdminOverlap].forEach(configuration => {
      expect(planC2bSharePointProvisioning(configuration, knownRuntimeObservation())).toEqual({
        ready: false, code: 'C2B_PERMISSION_CONFIG_INVALID',
        reasons: ['Role IDs/semantics must be distinct and compatible; no-lockout principal, container, rollback and proof inputs must be complete.'],
        operations: []
      });
    });
  });

  it('plans the exact two-list schema and seven remediations from injected TEST evidence', () => {
    const result = planC2bSharePointProvisioning(knownRuntimeConfiguration(), knownRuntimeObservation());
    expect(result.ready).toBe(true);
    if (!result.ready) throw new Error('Expected a complete synthetic provisioning plan.');
    expect(result.operations.filter(value => value.kind === 'CreateOrVerifyList').map(value => value.title))
      .toEqual(['KCFKPI_TEST_CommandJournal', 'KCFKPI_TEST_CommandEffects']);
    expect(result.operations.some(value => value.purpose === 'EmployeeCommands'
      && value.kind === 'EnsureIndex' && value.field === 'Created')).toBe(true);
    expect(result.operations.some(value => value.purpose === 'ManagerCommands'
      && value.kind === 'EnsureUnique' && value.field === 'CommandKey')).toBe(true);
    expect(result.operations.filter(value => value.kind === 'CaptureCurrentAcl').length).toBe(11);
    expect(result.operations.filter(value => value.kind === 'RegisterAclRollback').length).toBe(11);
    expect(result.operations.filter(value => value.kind === 'RestoreAclOnFailure').length).toBe(11);
    expect(result.operations.filter(value => value.kind === 'VerifyEffectivePermissions').length).toBe(11);
    expect(result.operations.every((value, index) => value.order === index + 1)).toBe(true);
    expect(result.operations.find(value => value.kind === 'GrantRole'
      && value.details && (value.details as { semantic?: string }).semantic === 'CreateOnly')).toMatchObject({
      details: { roleDefinitionId: 1073741840, expectedRoleEvidence: {
        roleDefinitionId: 1073741840, roleName: 'KCF KPI TEST Command Submitter Create Only v1',
        basePermissionsHigh: 0, basePermissionsLow: 2
      } }
    });
    expect(result.operations.find(value => value.kind === 'VerifyEffectivePermissions'
      && value.details && (value.details as { positive?: unknown[] }).positive?.some(entry =>
        (entry as { expectedRoleEvidence?: { roleName?: string } }).expectedRoleEvidence?.roleName
          === 'KCF KPI TEST Command Submitter Create Only v1'))).toBeDefined();
    const firstCapture = result.operations.find(value => value.kind === 'CaptureCurrentAcl')!;
    const firstRollback = result.operations.find(value => value.kind === 'RegisterAclRollback')!;
    const firstBreak = result.operations.find(value => value.kind === 'BreakRoleInheritance')!;
    expect(firstCapture.order).toBeLessThan(firstRollback.order);
    expect(firstRollback.order).toBeLessThan(firstBreak.order);
    expect(result.operations.some(value => value.kind === 'CommitAclChange'
      && (value.details as { requireNoLockout?: boolean }).requireNoLockout === true)).toBe(true);
  });

  it('verifies exact fields/settings/capabilities and rejects one changed permission proof', () => {
    const observations = completeObservations();
    expect(verifyC2bSharePointPhysicalContract(observations)).toEqual({ ready: true,
      code: 'C2B_SHAREPOINT_SCHEMA_VERIFIED', reasons: [] });
    const changed = JSON.parse(JSON.stringify(observations)) as IC2bSharePointListObservation[];
    changed.find(value => value.purpose === 'CommandEffects')!.permissionProofComplete = false;
    const result = verifyC2bSharePointPhysicalContract(changed);
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain('CommandEffects: permission capability proof is absent or mismatched.');
  });

  it('rejects the review template/number/date/note probe and omitted frozen field properties', () => {
    const changed = completeObservations();
    changed.forEach(observation => { observation.template = 101; });
    const physicalFields = changed.filter(observation => ['CommandJournal', 'CommandEffects'].includes(observation.purpose))
      .flatMap(observation => observation.fields);
    physicalFields.filter(field => field.type === 'Number').forEach(field => {
      field.decimals = 2; field.minimum = -999; field.maximum = 999;
    });
    physicalFields.filter(field => field.type === 'DateTime').forEach(field => { field.dateTimeFormat = 'DateOnly'; });
    physicalFields.filter(field => field.type === 'Note').forEach(field => {
      field.richText = true; field.appendOnly = true;
    });
    expect(verifyC2bSharePointPhysicalContract(changed).ready).toBe(false);

    const omitted = completeObservations();
    const commandKeyField = omitted.find(value => value.purpose === 'CommandJournal')!.fields
      .find(field => field.internalName === 'CommandKey')!;
    delete (commandKeyField as Partial<typeof commandKeyField>).nullable;
    expect(verifyC2bSharePointPhysicalContract(omitted).ready).toBe(false);
  });

  it('keeps physical capacity, indexes and uniqueness deterministic', () => {
    expect(C2B_COMMAND_JOURNAL_LIST_CONTRACT.capacity.maximumCodeUnits).toBe(960000);
    expect(C2B_COMMAND_EFFECTS_LIST_CONTRACT.capacity.maximumCodeUnits).toBe(480000);
    expect(C2B_COMMAND_JOURNAL_LIST_CONTRACT.fields.filter(value => value.indexed)
      .map(value => value.internalName)).toEqual(['CommandKey', 'State', 'LeaseExpiresAt']);
    expect(C2B_COMMAND_EFFECTS_LIST_CONTRACT.fields.filter(value => value.unique)
      .map(value => value.internalName)).toEqual(['EffectKey']);
    expect(new Set(C2B_COMMAND_JOURNAL_LIST_CONTRACT.fields.map(value => value.internalName)).size)
      .toBe(C2B_COMMAND_JOURNAL_LIST_CONTRACT.fields.length);
  });
});
