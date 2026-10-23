/* eslint-disable @typescript-eslint/explicit-function-return-type, @rushstack/no-new-null -- synthetic adapter proof */
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
if (typeof globalThis.TextDecoder === 'undefined') Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: TextDecoder });
jest.mock('./TenantTargetClassification', () => ({
  ...jest.requireActual('./TenantTargetClassification'),
  assertKcfAutomationTenantTarget: () => ({
    deploymentClassification: 'NonProduction', platformEnvironmentType: 'Default',
    evidenceSha256: 'A'.repeat(64), authorityReference: 'KCF-KPI-Sponsor-M013'
  })
}));

import { assertC2bNativeAdapterContract, type IC2bNativePage,
  type IC2bNativeReceiptProvenance } from '../EmployeeWorkplanV2C2bNativeAdapter';
import type {
  C2bCanonicalEntityReadback,
  C2bCanonicalObservation,
  C2bCommandEffect,
  C2bCommandJournal,
  C2bStableReadProof,
  C2bTerminalReceipt
} from '../TestPilotCommandAdmissionC2b';
import { hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import type { C2bTrustedCommandSource } from '../TestPilotCommandAdmissionC2bHandlers';
import EmployeeWorkplanV2C2bSharePointNativeAdapter, {
  C2B_TENANT_TITLES,
  bindC2bTenantNativeBinding,
  assertC2bTenantNativeBinding,
  c2bTenantNativeBindingAuthorityContent,
  hashC2bTenantNativeBindingReceipt,
  type C2bSharePointMutationOutcome,
  type C2bTenantListPurpose,
  type IC2bNativeSharePointPort,
  type IC2bSharePointRecord,
  type IC2bTenantCandidateIdentity,
  type IC2bTenantBindingAuthority,
  type IC2bTenantNativeBinding
} from './EmployeeWorkplanV2C2bSharePointNativeAdapter';
import { immutableTenantInput } from './ImmutableTenantInput';
import { C2bCommandSourceStorageV1, immutableCommandRawResponseV1 } from '../C2bCommandSourceStorageV1';
import { C2B_COMMAND_EFFECTS_LIST_CONTRACT, C2B_COMMAND_JOURNAL_LIST_CONTRACT }
  from '../EmployeeWorkplanV2C2bSharePointSchema';
import { C2B_CONTROL_CASE_PHYSICAL_FIELDS } from './SharePointC2bControlCaseStore';
import { C2B_PROVISIONING_RECEIPT_FIELDS, C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS }
  from './SharePointC2bReceiptStores';
import { C2B_BEHAVIOUR_FOCUS_ROW_FIELDS, C2B_BEHAVIOUR_PUBLICATION_FIELDS,
  C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS } from './C2bPhysicalConvergenceContract';

const purposes: C2bTenantListPurpose[] = [
  'People', 'EmployeeCommands', 'ManagerCommands', 'CommandJournal', 'CommandEffects', 'CommandReceipts',
  'Workplans', 'WorkplanItems', 'Audit', 'BehaviourFrameworkSets', 'BehaviourFrameworkValues',
  'PersonBehaviourAssignments', 'BehaviourObjectiveLibrary', 'ControlCases', 'TenantProvisioningReceipts'
];
const id = (index: number): string => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const fields = {
  sourcePayloadJson: 'PayloadJSON', journalKey: 'CommandKey', effectKey: 'EffectKey', workplanKey: 'WorkplanKey',
  workplanItemKey: 'WorkplanItemNaturalKey', auditKey: 'AuditKey', receiptKey: 'ReceiptKey',
  controlCaseKey: 'ControlCaseKey', provisioningReceiptKey: 'ReceiptRevisionKey'
};
type FieldReceipt = IC2bTenantNativeBinding['lists'][number]['observedFields'][number];
const key = (internalName: string): FieldReceipt => ({ internalName, type: 'Text', required: true, indexed: true, unique: true });
const textField = (internalName: string): FieldReceipt => ({ internalName, type: 'Text', required: true, indexed: false, unique: false });
const note = (internalName: string): FieldReceipt => ({ internalName, type: 'Note', required: true, indexed: false, unique: false });
const observedFields = (purpose: C2bTenantListPurpose): FieldReceipt[] => {
  const exact: Partial<Record<C2bTenantListPurpose, FieldReceipt[]>> = {
    People: [key('PersonKey'), ...['Title', 'Email', 'ManagerPersonKey', 'ManagerEmail', 'AppRoles', 'Active'].map(textField)],
    EmployeeCommands: [note(fields.sourcePayloadJson)], ManagerCommands: [note(fields.sourcePayloadJson)],
    CommandJournal: [...C2B_COMMAND_JOURNAL_LIST_CONTRACT.fields] as FieldReceipt[],
    CommandEffects: [...C2B_COMMAND_EFFECTS_LIST_CONTRACT.fields] as FieldReceipt[],
    CommandReceipts: [key(fields.receiptKey), ...C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS as FieldReceipt[]],
    Workplans: [key(fields.workplanKey)], WorkplanItems: [key(fields.workplanItemKey)], Audit: [key(fields.auditKey)],
    BehaviourFrameworkSets: [key('FrameworkVersion')], BehaviourFrameworkValues: [key('FrameworkValueKey')],
    PersonBehaviourAssignments: [key('AssignmentKey')], BehaviourObjectiveLibrary: [key('BehaviourObjectiveKey')],
    ControlCases: [key(fields.controlCaseKey), ...C2B_CONTROL_CASE_PHYSICAL_FIELDS
      .filter(name => name !== fields.controlCaseKey).map(textField)],
    TenantProvisioningReceipts: C2B_PROVISIONING_RECEIPT_FIELDS as FieldReceipt[]
  };
  return exact[purpose] || [];
};
const expectedCandidate: IC2bTenantCandidateIdentity = { commit: 'a'.repeat(40), tree: 'b'.repeat(40),
    tenantPacketManifestSha256: 'E'.repeat(64),
    companionPackageSha256: 'DE4EF8A90E61CDBAF8EAAFFCE1BCD0E60E352004615385B1DC1B07ABFFFAE39F' };
const seal = (value: IC2bTenantNativeBinding): IC2bTenantNativeBinding => {
  value.bindingReceiptSha256 = hashC2bTenantNativeBindingReceipt(value); return value;
};
const binding = (activationAuthorised: boolean = true): IC2bTenantNativeBinding => seal({
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v1', enabled: true, activationAuthorised,
  bindingReceiptSha256: '0'.repeat(64), candidate: { ...expectedCandidate },
  workflow: { id: '3db97504-0731-4134-af1a-27e467d23b28', name: 'KCF KPI Employee C2b Tenant Layer Disabled' },
  targetEvidence: { platformEnvironmentType: 'Default', environmentId: 'synthetic', siteUrl: 'synthetic',
    siteCollectionId: 'synthetic', rootWebId: 'synthetic', appCatalogueScope: 'SiteCollection',
    authorityReference: 'KCF-KPI-Sponsor-M013', testOnlyBindings: true, productionExcluded: true },
  connectionReferenceId: 'SYNTHETIC-CONNECTION-REFERENCE', connector: 'shared_sharepointonline',
  lists: purposes.map((purpose, index) => ({ purpose, title: C2B_TENANT_TITLES[purpose],
    listId: id(index + 1), schemaRevision: purpose.startsWith('Behaviour') || purpose === 'PersonBehaviourAssignments'
      ? 'kcf-behaviour-v2-tenant-1' : purpose === 'ControlCases' ? 'c2b-control-case-v1'
        : purpose === 'TenantProvisioningReceipts' ? 'kcf-wib12-provisioning-receipt-v1' : 'c2b-annual-v2',
    observedFields: observedFields(purpose) })),
  principals: {
    processorPrincipalId: 101, primaryOwnerPrincipalId: 102, backupOwnerPrincipalId: 103,
    administratorPrincipalIds: [104], submitterPrincipalIds: [105], actorPrincipalIds: [106],
    negativePrincipalIds: [107], visitorsGroupId: 108, visitorsRole: 'Read', processorRoleId: 201,
    administratorRoleId: 202, submitterRoleId: 203, actorReadRoleId: 204, visitorsRoleId: 204,
    roleDefinitions: [{ roleId: 201, name: 'Processor Full Control', roleTypeKind: 5,
      basePermissionsHigh: '2147483647', basePermissionsLow: '4294967295' },
      { roleId: 202, name: 'Administrator Full Control', roleTypeKind: 5,
        basePermissionsHigh: '2147483647', basePermissionsLow: '4294967295' },
      { roleId: 203, name: 'Submitter Contribute', roleTypeKind: 3,
        basePermissionsHigh: '0', basePermissionsLow: '1011030767' },
      { roleId: 204, name: 'Read', roleTypeKind: 2,
        basePermissionsHigh: '0', basePermissionsLow: '138612833' }],
    principalKeyBindings: [
      { principalKey: 'PROCESSOR', principalId: 101, category: 'Processor' },
      { principalKey: 'ADMIN', principalId: 104, category: 'Administrator' },
      { principalKey: 'SUBMITTER', principalId: 105, category: 'Submitter' },
      { principalKey: 'ACTOR', principalId: 106, category: 'Actor' },
      { principalKey: 'NEGATIVE', principalId: 107, category: 'Negative' }
    ]
  },
  fields,
  planningAuthority: { schemaRevision: 'c2b-annual-v2', behaviourContractVersion: 'KCCC-BEHAVIOUR|v02',
    initialState: 'Draft', initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready',
    processorPrincipalKey: 'PROCESSOR', adminPrincipalKeys: ['ADMIN'],
    coreCatalogueProviderReference: 'SYNTHETIC-CORE-CATALOGUE', coreKpiMasterListId: id(16),
    coreAnnualTargetsListId: id(17) }
});
const bindingAuthority = (native: IC2bTenantNativeBinding): IC2bTenantBindingAuthority => {
  const expectedBinding = c2bTenantNativeBindingAuthorityContent(native);
  return { contractVersion: 'kcf.kpi.wib12.binding-authority.v1', authorityReference: 'SYNTHETIC-BINDING-AUTHORITY',
    expectedBinding, expectedBindingSha256: hashC2bCanonical(expectedBinding),
    aclAuthority: { authorised: false, identitySeparationEvidenceSha256: null,
      rollbackActorPrincipalId: null, rollbackRegistryReference: null } };
};

const focusBinding = (): IC2bTenantNativeBinding => {
  const value = binding();
  value.contractVersion = 'kcf.kpi.wib12.tenant-layer.v2';
  value.previousProvisioningReceiptSha256 = 'A'.repeat(64);
  value.lists = [...value.lists.map(list => list.purpose === 'WorkplanItems'
    ? { ...list, schemaRevision: 'c2b-annual-v3',
      observedFields: [...list.observedFields, ...C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS] }
    : list.purpose === 'TenantProvisioningReceipts'
      ? { ...list, schemaRevision: 'kcf-wib12-provisioning-receipt-v2' } : list),
  { purpose: 'BehaviourFocusCatalogue', title: C2B_TENANT_TITLES.BehaviourFocusCatalogue,
    listId: id(18), schemaRevision: 'kcf-behaviour-focus-c2b-v1', majorVersioningEnabled: true,
    aclEvidenceSha256: 'B'.repeat(64), observedFields: C2B_BEHAVIOUR_FOCUS_ROW_FIELDS },
  { purpose: 'BehaviourCataloguePublications', title: C2B_TENANT_TITLES.BehaviourCataloguePublications,
    listId: id(19), schemaRevision: 'kcf-behaviour-focus-c2b-v1', majorVersioningEnabled: true,
    aclEvidenceSha256: 'C'.repeat(64), observedFields: C2B_BEHAVIOUR_PUBLICATION_FIELDS }];
  value.planningAuthority = { ...value.planningAuthority, schemaRevision: 'c2b-annual-v3',
    behaviourCataloguePin: { catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS',
      catalogueVersion: 'KCF-BHV-PD03-2026.09-v1', revision: 1,
      contentSha256: 'FADBC5D795AB7F092D984EF19F91B936BC23337F828F53EB5B0C86CADBCE709C',
      contentCanonicalUtf8ByteLength: 35668,
      sourceRowsCanonicalSha256: 'FADBC5D795AB7F092D984EF19F91B936BC23337F828F53EB5B0C86CADBCE709C',
      generatedRowsJsonSha256: '3420F5D1FDF3E427F65E2F54FB86545DFC94699992F818921AE7783D790F15E4',
      sourceSha256: '851BA6C4C315986ADB17F3FC0ADCFDAFBA59B225BD97201918462CC85AD338A4',
      approvalReference: 'KCF-KPI-Sponsor-BEH-V1-001',
      sourcePath: 'data/test-pilot/behaviour-catalogue.v2.json', rowCount: 75 } };
  return seal(value);
};

describe('v2 focus binding receipt admission', () => {
  it('accepts only the new GUID-bound purposes and pinned canonical identity', () => {
    const native = focusBinding();
    const authority = bindingAuthority(native);
    authority.contractVersion = 'kcf.kpi.wib12.binding-authority.v2';
    expect(() => assertC2bTenantNativeBinding(native, expectedCandidate, authority)).not.toThrow();
    const missing = { ...native, lists: native.lists.filter(list => list.purpose !== 'BehaviourFocusCatalogue') };
    const missingAuthority = bindingAuthority(missing);
    missingAuthority.contractVersion = 'kcf.kpi.wib12.binding-authority.v2';
    expect(() => assertC2bTenantNativeBinding(seal(missing), expectedCandidate, missingAuthority)).toThrow();
  });
  it.each([
    ['file in canonical rows', 'sourceRowsCanonicalSha256', '851BA6C4C315986ADB17F3FC0ADCFDAFBA59B225BD97201918462CC85AD338A4'],
    ['projected rows in canonical rows', 'sourceRowsCanonicalSha256', '3420F5D1FDF3E427F65E2F54FB86545DFC94699992F818921AE7783D790F15E4'],
    ['canonical rows in projected rows', 'generatedRowsJsonSha256', 'FADBC5D795AB7F092D984EF19F91B936BC23337F828F53EB5B0C86CADBCE709C']
  ])('rejects %s after resealing', (_label, field, hash) => {
    const native = focusBinding();
    native.planningAuthority.behaviourCataloguePin = { ...native.planningAuthority.behaviourCataloguePin!, [field]: hash };
    seal(native);
    const authority = bindingAuthority(native);
    authority.contractVersion = 'kcf.kpi.wib12.binding-authority.v2';
    expect(() => assertC2bTenantNativeBinding(native, expectedCandidate, authority)).toThrow(/PLANNING_AUTHORITY_INVALID/);
  });
});

const record = (fields: Record<string, unknown> = {}): IC2bSharePointRecord => ({
  itemId: 17, etag: '"etag-1"', rowVersionToken: 1, itemVersion: '1.0', authorPrincipalId: 101,
  editorPrincipalId: 101, authorEmail: 'employee@example.invalid', fields
});
const confirmed = (fields: Record<string, unknown> = { confirmed: true }): C2bSharePointMutationOutcome => ({
  outcome: 'Confirmed', providerReference: 'SP:17', observed: record(fields)
});
const effect = (kind: C2bCommandEffect['kind'], target: C2bCommandEffect['target'],
  naturalKey: string = 'SYNTHETIC-KEY'): C2bCommandEffect => ({
  sequence: 1, effectKey: `EFFECT-${kind}`, kind, target, naturalKey, expectedETag: null,
  expectedETagFromEffectKey: null, expectedRowVersionToken: null, beforeFields: null,
  beforeSha256: 'A'.repeat(64), desiredFields: { NaturalKey: naturalKey }, desiredSha256: 'B'.repeat(64),
  effectSha256: 'C'.repeat(64), disposition: 'Issued', confirmation: null, confirmationSha256: null
});
const observation = (): C2bCanonicalObservation => ({
  header: { naturalKey: 'SYNTHETIC-HEADER', fields: {}, etag: '"h"', rowVersionToken: 1 },
  items: [], acls: [], pagination: { complete: true, pageCount: 1, totalCount: 0, nextLink: null,
    affectedNaturalKeys: [] }, auditKeys: [], effectEvidenceSha256: [], processorEpoch: 1
});
const proof: C2bStableReadProof = { first: observation(), second: observation() };
const journal = { plan: { commandKey: 'SYNTHETIC-COMMAND' } } as C2bCommandJournal;
const receipt = { receiptKey: 'SYNTHETIC-RECEIPT' } as C2bTerminalReceipt;
const source: C2bTrustedCommandSource = { listId: id(2), itemId: 17, itemVersion: '1.0' };

class MemoryPort implements IC2bNativeSharePointPort {
  public readonly calls: string[] = [];
  public canonicalOutcome: C2bSharePointMutationOutcome = confirmed();
  public lastReadCanonicalListId: string | null = null;
  public lastAclPrincipals: IC2bTenantNativeBinding['principals'] | null = null;
  public readItemById(_listId: string, _itemId: number) {
    this.calls.push('readItemById');
    return Promise.resolve(record({ PayloadJSON: JSON.stringify({ schemaVersion: 'synthetic' }),
      AuthorEmail: 'employee@example.invalid', ItemVersion: '1.0' }));
  }
  public readItemByStableKey(_listId: string, _keyField: string, _stableKey: string) {
    this.calls.push('readItemByStableKey'); return Promise.resolve(undefined);
  }
  public readPlanningProjection() { this.calls.push('readPlanningProjection'); return Promise.resolve({} as never); }
  public createPhysicalRow() { this.calls.push('createPhysicalRow'); return Promise.resolve(confirmed()); }
  public compareExchangePhysicalRow() { this.calls.push('compareExchangePhysicalRow'); return Promise.resolve(confirmed()); }
  public persistEffectState() { this.calls.push('persistEffectState'); return Promise.resolve(confirmed()); }
  public readDirect(listId: string) { this.calls.push('readDirect'); this.lastReadCanonicalListId = listId;
    return Promise.resolve({ naturalKey: 'SYNTHETIC',
    fields: {}, etag: '"1"', rowVersionToken: 1 }); }
  public readDirectPage(_listId: string, _workplanKey: string, _cursor: string | null):
  Promise<IC2bNativePage<C2bCanonicalEntityReadback>> {
    this.calls.push('readDirectPage'); return Promise.resolve({ items: [], pageNumber: 1, complete: true,
      nextCursor: null });
  }
  public applyCanonicalEffect() { this.calls.push('applyCanonicalEffect'); return Promise.resolve(this.canonicalOutcome); }
  public consumeControlCase() { this.calls.push('consumeControlCase'); return Promise.resolve(confirmed()); }
  public reconcileContainerAcl(_listId: string, _effect: C2bCommandEffect,
    principals: IC2bTenantNativeBinding['principals']) {
    this.calls.push('reconcileContainerAcl'); this.lastAclPrincipals = principals; return Promise.resolve(confirmed());
  }
  public appendAudit() { this.calls.push('appendAudit'); return Promise.resolve(confirmed()); }
  public createTerminalReceipt() { this.calls.push('createTerminalReceipt'); return Promise.resolve(confirmed()); }
  public reconcileReceiptActorRead() { this.calls.push('reconcileReceiptActorRead'); return Promise.resolve(confirmed()); }
  public readStableProof() { this.calls.push('readStableProof'); return Promise.resolve(proof); }
  public recoverExact() { this.calls.push('recoverExact'); return Promise.resolve({ outcome: 'NotApplied' as const,
    confirmation: { providerReference: 'SP:17', naturalKey: 'SYNTHETIC', requestETag: null,
      observedETag: '"1"', observedRowVersionToken: 1, readback: {} } }); }
}

describe('WI-B12 SharePoint native-adapter v2 implementation', () => {
  it.each(['etag', 'content-type', 'content-length', 'content-encoding'])(
    'retains both complete captures and rejects changed %s before hydration', async field => {
      const port = new MemoryPort(); const native = binding();
      const bytes = new TextEncoder().encode('{"complete":"synthetic response"}');
      const captures: Uint8Array[] = [];
      const readCommandRawSource = jest.fn(async () => {
        captures.push(bytes.slice());
        const headers: [string, string][] = [['etag', '"source-1"'], ['content-type', 'application/json'],
          ['content-length', String(bytes.length)], ['content-encoding', 'identity']];
        if (captures.length === 2) headers.find(([name]) => name === field)![1] += '-changed';
        return immutableCommandRawResponseV1({ requestUrl: 'https://synthetic.invalid/source',
          responseUrl: 'https://synthetic.invalid/source', status: 200, headers, sha256: 'A'.repeat(64),
          retentionReference: `retained-${captures.length}` }, bytes);
      });
      const read = jest.fn(); const hold = jest.fn(async (_admission, error) => { throw error; });
      const reader = { prepare: async () => ({}), read, hold } as unknown as C2bCommandSourceStorageV1;
      const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(Object.assign(port, { readCommandRawSource }),
        native, expectedCandidate, bindingAuthority(native), reader);
      await expect(adapter.readCommandSourceTwice(source)).rejects.toThrow('COMMAND_SOURCE_DRIFT');
      expect(captures).toEqual([bytes, bytes]); expect(readCommandRawSource).toHaveBeenCalledTimes(2);
      expect(read).not.toHaveBeenCalled(); expect(hold).toHaveBeenCalledTimes(1); expect(port.calls).toEqual([]);
    });
  it('permits header-name case, ordering, dynamic headers and different retention references', async () => {
    const port = new MemoryPort(); const native = binding(); let captures = 0;
    const readCommandRawSource = async () => {
      captures++;
      const headers: [string, string][] = captures === 1
        ? [['etag', '"source-1"'], ['content-type', 'application/json'], ['content-length', '2'], ['date', 'first']]
        : [['Date', 'second'], ['Content-Length', '2'], ['Content-Type', 'application/json'], ['ETag', '"source-1"']];
      return immutableCommandRawResponseV1({ requestUrl: 'https://synthetic.invalid/source',
        responseUrl: 'https://synthetic.invalid/source', status: 200, headers, sha256: 'A'.repeat(64),
        retentionReference: `retained-${captures}` }, new TextEncoder().encode('{}'));
    };
    const read = jest.fn(async () => ({})); const hold = jest.fn();
    const reader = { prepare: async () => ({}), read, hold } as unknown as C2bCommandSourceStorageV1;
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(Object.assign(port, { readCommandRawSource }),
      native, expectedCandidate, bindingAuthority(native), reader);
    await adapter.readCommandSourceTwice(source);
    expect(captures).toBe(2); expect(read).toHaveBeenCalledTimes(2); expect(hold).not.toHaveBeenCalled();
    expect(port.calls).toEqual([]);
  });
  it('an explicit B reader denies unavailable capture or dependencies before any source I/O', async () => {
    const port = new MemoryPort(); const native = binding();
    const reader = new C2bCommandSourceStorageV1();
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate, bindingAuthority(native), reader);
    await expect(adapter.readCommandSourceTwice(source)).rejects.toThrow('COMMAND_CAPTURE_UNAVAILABLE');
    expect(port.calls).toHaveLength(0);
    const readCommandRawSource = jest.fn();
    const capable = Object.assign(port, { readCommandRawSource });
    const explicit = new EmployeeWorkplanV2C2bSharePointNativeAdapter(capable, native, expectedCandidate, bindingAuthority(native), reader);
    await expect(explicit.readCommandSourceTwice(source)).rejects.toThrow('COMMAND_DEPENDENCIES_UNAVAILABLE');
    expect(readCommandRawSource).not.toHaveBeenCalled(); expect(port.calls).toHaveLength(0);
  });
  it('owns and freezes nested JSON arrays while rejecting Map inputs at the boundary', () => {
    const sourceInput = { nested: { values: [{ key: 'governed' }] } };
    const immutable = immutableTenantInput(sourceInput);
    sourceInput.nested.values[0].key = 'injected';
    expect(immutable.nested.values[0].key).toBe('governed');
    expect(Object.isFrozen(immutable.nested.values)).toBe(true);
    expect(() => immutableTenantInput({ bindings: new Map([['L1', 'injected']]) })).toThrow(/JSON values only/);
  });

  it('maps the generated receipt shape without coercion and rejects a crossed purpose/title', () => {
    const native = binding();
    const receipt = {
      contractVersion: native.contractVersion, enabled: true, activated: true,
      bindingReceiptSha256: native.bindingReceiptSha256, builtCandidate: native.candidate,
      targetEvidence: native.targetEvidence, package: { workflowId: native.workflow.id, workflowName: native.workflow.name },
      connectionReference: { id: native.connectionReferenceId, connector: native.connector,
        primaryOwnerPrincipalId: native.principals.primaryOwnerPrincipalId,
        backupOwnerPrincipalId: native.principals.backupOwnerPrincipalId },
      nativeStorageFields: native.fields, planningAuthority: native.planningAuthority, lists: native.lists,
      principals: { processor: native.principals.processorPrincipalId,
        administrators: native.principals.administratorPrincipalIds,
        submitters: native.principals.submitterPrincipalIds, actors: native.principals.actorPrincipalIds,
        negative: native.principals.negativePrincipalIds, visitorsGroup: native.principals.visitorsGroupId,
        visitorsRole: native.principals.visitorsRole, processorRoleId: native.principals.processorRoleId,
        administratorRoleId: native.principals.administratorRoleId, submitterRoleId: native.principals.submitterRoleId,
        actorReadRoleId: native.principals.actorReadRoleId, visitorsRoleId: native.principals.visitorsRoleId,
        roleDefinitions: native.principals.roleDefinitions,
        principalKeyBindings: native.principals.principalKeyBindings }
    };
    expect(bindC2bTenantNativeBinding(receipt, expectedCandidate, bindingAuthority(native))).toMatchObject({ enabled: true,
      connector: 'shared_sharepointonline', activationAuthorised: true });
    const crossed = { ...receipt, lists: receipt.lists.map((list, index) => index === 0
      ? { ...list, title: C2B_TENANT_TITLES.EmployeeCommands } : list) };
    expect(() => bindC2bTenantNativeBinding(crossed, expectedCandidate, bindingAuthority(native)))
      .toThrow(/C2B_NATIVE_BINDING_AUTHORITY_MISMATCH/);
  });

  it('implements every required capability and routes bounded native operations through the exact bindings', async () => {
    const port = new MemoryPort();
    const native = binding();
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate,
      bindingAuthority(native));
    expect(() => assertC2bNativeAdapterContract(adapter)).not.toThrow();
    const doubleRead = await adapter.readCommandSourceTwice(source);
    expect(doubleRead.first).toEqual(doubleRead.second);
    expect(await adapter.readJournal('SYNTHETIC-COMMAND')).toEqual({ etag: null });
    await adapter.readWorkplan('SYNTHETIC');
    await adapter.readWorkplanItemsPage('SYNTHETIC', null);
    await adapter.compareExchangeWorkplan(effect('Claim', 'Workplans'));
    await adapter.compareExchangeWorkplanItem(effect('CanonicalUpsert', 'WorkplanItems'));
    await adapter.consumeAuthoritativeControlCase(effect('ControlCaseConsume', 'AuthoritativeControlCase'));
    await adapter.reconcileEmployeeContainerAcl(effect('Grant', 'Workplans'));
    await adapter.appendAudit(effect('AuditAppend', 'Audit'));
    await adapter.reconcileReceiptActorRead(effect('ReceiptGrant', 'CommandReceipts', receipt.receiptKey), receipt);
    await adapter.readStableCanonicalProof(journal);
    const unknown = effect('Claim', 'Workplans'); unknown.disposition = 'Unknown';
    await adapter.recoverUnknownEffect(journal, unknown);
    expect(port.calls).toEqual(expect.arrayContaining([
      'readItemById', 'readDirect', 'readDirectPage',
      'applyCanonicalEffect', 'consumeControlCase', 'reconcileContainerAcl', 'appendAudit',
      'reconcileReceiptActorRead', 'readStableProof', 'recoverExact'
    ]));
  });

  it('keeps every mutation method Off until activation is separately authorised', async () => {
    const native = binding(false);
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(new MemoryPort(), native, expectedCandidate,
      bindingAuthority(native));
    await expect(adapter.compareExchangeWorkplan(effect('Claim', 'Workplans')))
      .rejects.toThrow(/C2B_NATIVE_ACTIVATION_NOT_AUTHORISED/);
    await expect(adapter.compareExchangeJournal(journal, null))
      .rejects.toThrow(/C2B_NATIVE_ACTIVATION_NOT_AUTHORISED/);
  });

  it('rejects forged list identities, crossed source routes and duplicate principals', async () => {
    const forged = binding(); forged.lists[0].listId = 'not-a-guid'; seal(forged);
    expect(() => new EmployeeWorkplanV2C2bSharePointNativeAdapter(new MemoryPort(), forged, expectedCandidate,
      bindingAuthority(forged)))
      .toThrow(/C2B_NATIVE_LIST_BINDING_INVALID/);

    const crossedBinding = binding();
    const crossed = new EmployeeWorkplanV2C2bSharePointNativeAdapter(new MemoryPort(), crossedBinding,
      expectedCandidate, bindingAuthority(crossedBinding));
    await expect(crossed.readCommandSourceTwice({ ...source, listId: id(99) }))
      .rejects.toThrow(/C2B_NATIVE_SOURCE_LIST_FORGED/);

    const duplicate = binding(); duplicate.principals.negativePrincipalIds = [duplicate.principals.processorPrincipalId];
    seal(duplicate);
    expect(() => new EmployeeWorkplanV2C2bSharePointNativeAdapter(new MemoryPort(), duplicate, expectedCandidate,
      bindingAuthority(duplicate)))
      .toThrow(/C2B_NATIVE_PRINCIPAL_BINDING_INVALID/);
  });

  it('rejects candidate, receipt-digest and numeric Read-role substitutions', () => {
    const wrongCandidate = binding(); wrongCandidate.candidate.commit = 'f'.repeat(40); seal(wrongCandidate);
    expect(() => new EmployeeWorkplanV2C2bSharePointNativeAdapter(new MemoryPort(), wrongCandidate,
      expectedCandidate, bindingAuthority(wrongCandidate))).toThrow(/C2B_NATIVE_BINDING_DISABLED/);
    const wrongDigest = binding(); wrongDigest.bindingReceiptSha256 = 'F'.repeat(64);
    expect(() => new EmployeeWorkplanV2C2bSharePointNativeAdapter(new MemoryPort(), wrongDigest,
      expectedCandidate, bindingAuthority(wrongDigest))).toThrow(/C2B_NATIVE_BINDING_DISABLED/);
    const elevatedVisitors = binding();
    elevatedVisitors.principals.roleDefinitions = elevatedVisitors.principals.roleDefinitions.map(role =>
      role.roleId === elevatedVisitors.principals.visitorsRoleId
        ? { ...role, name: 'Full Control', roleTypeKind: 5 } : role);
    seal(elevatedVisitors);
    expect(() => new EmployeeWorkplanV2C2bSharePointNativeAdapter(new MemoryPort(), elevatedVisitors,
      expectedCandidate, bindingAuthority(elevatedVisitors))).toThrow(/C2B_NATIVE_PRINCIPAL_BINDING_INVALID/);
  });

  it.each<[string, (native: IC2bTenantNativeBinding) => void]>([
    ['list', native => { native.lists[0].listId = id(99); }],
    ['principal', native => {
      native.principals.actorPrincipalIds = [999];
      native.principals.principalKeyBindings = native.principals.principalKeyBindings.map(item =>
        item.category === 'Actor' ? { ...item, principalId: 999 } : item);
    }],
    ['role mask', native => {
      native.principals.roleDefinitions = native.principals.roleDefinitions.map(role =>
        role.roleId === native.principals.submitterRoleId ? { ...role, basePermissionsLow: '1011030768' } : role);
    }],
    ['activation', native => { native.activationAuthorised = false; }]
  ])('rejects a recomputed receipt after %s substitution against the independent binding authority',
    (_label, substitute) => {
      const native = binding(); const independentAuthority = bindingAuthority(native);
      substitute(native); seal(native);
      expect(() => new EmployeeWorkplanV2C2bSharePointNativeAdapter(new MemoryPort(), native,
        expectedCandidate, independentAuthority)).toThrow(/C2B_NATIVE_BINDING_AUTHORITY_MISMATCH/);
    });

  it('keeps nested list, principal and role bindings immutable for the executable lifetime', async () => {
    const callerBinding = binding();
    const intendedWorkplansId = callerBinding.lists.find(list => list.purpose === 'Workplans')!.listId;
    const crossedWorkplanItemsId = callerBinding.lists.find(list => list.purpose === 'WorkplanItems')!.listId;
    const intendedActorIds = [...callerBinding.principals.actorPrincipalIds];
    const port = new MemoryPort();
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, callerBinding, expectedCandidate,
      bindingAuthority(callerBinding));

    callerBinding.lists.find(list => list.purpose === 'Workplans')!.listId = crossedWorkplanItemsId;
    callerBinding.principals.actorPrincipalIds = [999];
    callerBinding.principals.roleDefinitions[0].name = 'Injected Role';
    await adapter.readWorkplan('SYNTHETIC');
    await adapter.reconcileEmployeeContainerAcl(effect('Grant', 'Workplans'));

    expect(port.lastReadCanonicalListId).toBe(intendedWorkplansId);
    expect(port.lastAclPrincipals?.actorPrincipalIds).toEqual(intendedActorIds);
    expect(port.lastAclPrincipals?.roleDefinitions[0].name).toBe('Processor Full Control');
    expect(Object.isFrozen(port.lastAclPrincipals?.roleDefinitions)).toBe(true);
  });

  it('propagates provider unknown outcomes without claiming confirmation', async () => {
    const port = new MemoryPort();
    port.canonicalOutcome = { outcome: 'Unknown', safeCode: 'TIMEOUT_UNKNOWN' };
    const native = binding();
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate,
      bindingAuthority(native));
    await expect(adapter.compareExchangeWorkplan(effect('Claim', 'Workplans'))).resolves.toEqual({
      outcome: 'Unknown', safeCode: 'TIMEOUT_UNKNOWN'
    });
  });

  it('rejects incomplete or contradictory page evidence', async () => {
    const port = new MemoryPort();
    port.readDirectPage = (() => Promise.resolve({ items: [], pageNumber: 1, complete: true,
      nextCursor: 'forged' })) as IC2bNativeSharePointPort['readDirectPage'];
    const native = binding();
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate,
      bindingAuthority(native));
    await expect(adapter.readWorkplanItemsPage('SYNTHETIC', null)).rejects.toThrow(/C2B_NATIVE_PAGE_INVALID/);
  });

  const terminalReceipt = (): C2bTerminalReceipt => ({ receiptKey: 'RECEIPT-1', commandKey: 'RECEIPT-1',
    outcome: 'Accepted', planSha256: 'A'.repeat(64), payloadSha256: 'B'.repeat(64), canonicalSha256: 'C'.repeat(64),
    resultKeys: ['ACTOR|2027'], auditKeys: ['AUDIT-1'], processorReference: 'FLOW-1',
    completedAt: '2026-09-14T22:00:00Z', actorAccess: { receiptKey: 'RECEIPT-1', breaksInheritance: true,
      allowedPrincipals: [{ principalKey: 'ACTOR', permission: 'Read', source: 'Employee' },
        { principalKey: 'PROCESSOR', permission: 'FullControl', source: 'Processor' }], revokedPrincipalKeys: [] } });
  const receiptProvenance = (): IC2bNativeReceiptProvenance => {
    const command = { commandType: 'UpsertPersonalItemV2' as const, subjectType: 'WorkplanItem' as const,
      subjectKey: 'PERSONAL-1', personKey: 'ACTOR', performanceYear: 2027, quarter: null };
    const sourceIdentity = { listId: id(2), itemId: 7, itemVersion: '1.0', sourceETag: '"source-1"' };
    return { source: sourceIdentity, command, actor: { email: 'employee@example.invalid', personKey: 'ACTOR',
      effectiveRole: 'Employee' }, processor: { email: 'processor@example.invalid', principalKey: 'PROCESSOR',
      flowRunReference: 'FLOW-1', completedAt: '2026-09-14T22:00:00Z' }, admittedSource: {
      source: { listId: id(2), itemId: 7, itemVersion: '1.0' }, sourceETag: '"source-1"', sourceRowVersion: '1.0',
      route: 'Employee', authorEmail: 'employee@example.invalid', envelope: { schemaVersion: 'kcf.kpi.test-command.v2',
        binding: { ...command, workplanKey: 'ACTOR|2027', commandKey: 'RECEIPT-1' },
        expected: { header: { presence: 'Present', token: '1', etag: '"header-1"' },
          item: { presence: 'Absent' } }, payload: {} } } };
  };

  it('passes exact immutable actor and processor receipt authority to the physical port', async () => {
    const port = new MemoryPort(); const native = binding();
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate,
      bindingAuthority(native));
    await expect(adapter.createImmutableReceipt(effect('ReceiptCreate', 'CommandReceipts', 'RECEIPT-1'),
      terminalReceipt(), receiptProvenance())).resolves.toMatchObject({ outcome: 'Confirmed' });
    expect(port.calls.filter(call => call === 'createTerminalReceipt')).toHaveLength(1);
  });

  it.each([
    ['actor principal', (value: IC2bNativeReceiptProvenance) => { value.actor.personKey = 'NEGATIVE'; }],
    ['actor category', (value: IC2bNativeReceiptProvenance) => { value.actor.personKey = 'ADMIN'; }],
    ['processor principal', (value: IC2bNativeReceiptProvenance) => { value.processor.principalKey = 'NEGATIVE'; }]
  ])('rejects a %s substitution before receipt mutation', async (_label, mutate) => {
    const port = new MemoryPort(); const native = binding(); const provenance = receiptProvenance(); mutate(provenance);
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate,
      bindingAuthority(native));
    await expect(adapter.createImmutableReceipt(effect('ReceiptCreate', 'CommandReceipts', 'RECEIPT-1'),
      terminalReceipt(), provenance)).rejects.toThrow(/C2B_NATIVE_RECEIPT_AUTHORITY_INVALID|C2B_TERMINAL_RECEIPT_PROVENANCE_INVALID/);
    expect(port.calls).not.toContain('createTerminalReceipt');
  });
});
