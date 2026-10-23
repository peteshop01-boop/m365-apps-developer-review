jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
if (typeof globalThis.TextDecoder === 'undefined') Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: TextDecoder });
jest.mock('./TenantTargetClassification', () => ({
  ...jest.requireActual('./TenantTargetClassification'),
  assertKcfAutomationTenantTarget: () => ({ deploymentClassification: 'NonProduction',
    platformEnvironmentType: 'Default', evidenceSha256: 'A'.repeat(64), authorityReference: 'KCF-KPI-Sponsor-M013' })
}));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { webcrypto } from 'crypto';
import type { C2bCommandCaptureAdmissionV1 } from '../C2bCommandSourceStorageV1';
import SharePointC2bNativePort, { type IC2bAclRollbackImage, type IC2bAclRollbackRegistry } from './SharePointC2bNativePort';
import EmployeeWorkplanV2C2bSharePointNativeAdapter from './EmployeeWorkplanV2C2bSharePointNativeAdapter';
import { createEmployeeWorkplanV2C2bAnnualPlan } from '../EmployeeWorkplanV2C2bAnnualCoordinator';
import { canonicaliseC2b, hashC2bCanonical, type C2bCommandEffect, type C2bCommandJournal } from '../TestPilotCommandAdmissionC2b';
import SharePointBehaviourV2TenantProvisioningClient,
{ SharePointTenantProvisioningReceiptStore, type ITenantPrivateListAclAuthority,
  type ITenantPrivateListAclRollbackRegistry } from './SharePointBehaviourV2TenantProvisioningClient';
import type { IBehaviourV2TenantSchema, ITenantProvisioningReceipt,
  ITenantProvisioningReceiptAuthority } from './BehaviourV2TenantProvisioner';
import { C2B_TENANT_TITLES, c2bTenantNativeBindingAuthorityContent, hashC2bTenantNativeBindingReceipt,
  type C2bTenantListPurpose, type IC2bTenantBindingAuthority,
  type IC2bTenantCandidateIdentity, type IC2bTenantNativeBinding } from './EmployeeWorkplanV2C2bSharePointNativeAdapter';
import { C2B_COMMAND_EFFECTS_LIST_CONTRACT, C2B_COMMAND_JOURNAL_LIST_CONTRACT }
  from '../EmployeeWorkplanV2C2bSharePointSchema';
import { C2B_CONTROL_CASE_PHYSICAL_FIELDS } from './SharePointC2bControlCaseStore';
import { c2bControlCaseContentSha256 } from './SharePointC2bControlCaseStore';
import { BEHAVIOUR_V2_RATING_OPTIONS } from '../BehaviourFrameworkV2Policy';
import { C2B_PROVISIONING_RECEIPT_FIELDS, C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS,
  serialiseTenantProvisioningReceiptRow, tenantProvisioningRevisionKey } from './SharePointC2bReceiptStores';

const purposes: C2bTenantListPurpose[] = [
  'People', 'EmployeeCommands', 'ManagerCommands', 'CommandJournal', 'CommandEffects', 'CommandReceipts',
  'Workplans', 'WorkplanItems', 'Audit', 'BehaviourFrameworkSets', 'BehaviourFrameworkValues',
  'PersonBehaviourAssignments', 'BehaviourObjectiveLibrary', 'ControlCases', 'TenantProvisioningReceipts'
];
const id = (index: number): string => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const storage = {
  sourcePayloadJson: 'PayloadJSON', journalKey: 'CommandKey', effectKey: 'EffectKey', workplanKey: 'WorkplanKey',
  workplanItemKey: 'WorkplanItemNaturalKey', auditKey: 'AuditKey', receiptKey: 'ReceiptKey',
  controlCaseKey: 'ControlCaseKey', provisioningReceiptKey: 'ReceiptRevisionKey'
};
type FieldReceipt = IC2bTenantNativeBinding['lists'][number]['observedFields'][number];
const key = (internalName: string): FieldReceipt => ({ internalName, type: 'Text', required: true, indexed: true, unique: true });
const textField = (internalName: string): FieldReceipt => ({ internalName, type: 'Text', required: true, indexed: false, unique: false });
const note = (internalName: string): FieldReceipt => ({ internalName, type: 'Note', required: true, indexed: false, unique: false });
const observed = (purpose: C2bTenantListPurpose): FieldReceipt[] => ({
  People: [key('PersonKey'), ...['Title', 'Email', 'ManagerPersonKey', 'ManagerEmail', 'AppRoles', 'Active'].map(textField)],
  EmployeeCommands: [note(storage.sourcePayloadJson)], ManagerCommands: [note(storage.sourcePayloadJson)],
  CommandJournal: [...C2B_COMMAND_JOURNAL_LIST_CONTRACT.fields] as FieldReceipt[],
  CommandEffects: [...C2B_COMMAND_EFFECTS_LIST_CONTRACT.fields] as FieldReceipt[],
  CommandReceipts: [key(storage.receiptKey), ...C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS as FieldReceipt[]],
  Workplans: [key(storage.workplanKey)], WorkplanItems: [key(storage.workplanItemKey)], Audit: [key(storage.auditKey)],
  BehaviourFrameworkSets: [key('FrameworkVersion')], BehaviourFrameworkValues: [key('FrameworkValueKey')],
  PersonBehaviourAssignments: [key('AssignmentKey')], BehaviourObjectiveLibrary: [key('BehaviourObjectiveKey')],
  ControlCases: [key(storage.controlCaseKey), ...C2B_CONTROL_CASE_PHYSICAL_FIELDS
    .filter(name => name !== storage.controlCaseKey).map(textField)],
  TenantProvisioningReceipts: C2B_PROVISIONING_RECEIPT_FIELDS as FieldReceipt[]
} as Record<C2bTenantListPurpose, FieldReceipt[]>)[purpose];
const expectedCandidate: IC2bTenantCandidateIdentity = { commit: 'a'.repeat(40), tree: 'b'.repeat(40),
  tenantPacketManifestSha256: 'E'.repeat(64),
  companionPackageSha256: 'DE4EF8A90E61CDBAF8EAAFFCE1BCD0E60E352004615385B1DC1B07ABFFFAE39F' };
const seal = (value: IC2bTenantNativeBinding): IC2bTenantNativeBinding => {
  value.bindingReceiptSha256 = hashC2bTenantNativeBindingReceipt(value); return value;
};
const binding = (): IC2bTenantNativeBinding => seal({
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v1', enabled: true, activationAuthorised: true,
  bindingReceiptSha256: '0'.repeat(64), candidate: { ...expectedCandidate },
  workflow: { id: '3db97504-0731-4134-af1a-27e467d23b28', name: 'KCF KPI Employee C2b Tenant Layer Disabled' },
  targetEvidence: { platformEnvironmentType: 'Default', environmentId: id(90),
    siteUrl: 'https://synthetic.invalid/sites/kcf-test', siteCollectionId: id(91), rootWebId: id(92),
    appCatalogueScope: 'SiteCollection', authorityReference: 'KCF-KPI-Sponsor-M013',
    testOnlyBindings: true, productionExcluded: true },
  connectionReferenceId: 'SYNTHETIC-CONNECTION', connector: 'shared_sharepointonline',
  lists: purposes.map((purpose, index) => ({ purpose, title: C2B_TENANT_TITLES[purpose], listId: id(index + 1),
    schemaRevision: purpose.startsWith('Behaviour') || purpose === 'PersonBehaviourAssignments'
      ? 'kcf-behaviour-v2-tenant-1' : purpose === 'ControlCases' ? 'c2b-control-case-v1'
        : purpose === 'TenantProvisioningReceipts' ? 'kcf-wib12-provisioning-receipt-v1' : 'c2b-annual-v2',
    observedFields: observed(purpose) })),
  principals: { processorPrincipalId: 101, primaryOwnerPrincipalId: 102, backupOwnerPrincipalId: 103,
    administratorPrincipalIds: [104], submitterPrincipalIds: [105], actorPrincipalIds: [106, 109],
    negativePrincipalIds: [107], visitorsGroupId: 108, processorRoleId: 201, administratorRoleId: 202,
    submitterRoleId: 203, actorReadRoleId: 204, visitorsRoleId: 204, visitorsRole: 'Read',
    roleDefinitions: [{ roleId: 201, name: 'Processor Full Control', roleTypeKind: 5,
      basePermissionsHigh: '2147483647', basePermissionsLow: '4294967295' },
      { roleId: 202, name: 'Administrator Full Control', roleTypeKind: 5,
        basePermissionsHigh: '2147483647', basePermissionsLow: '4294967295' },
      { roleId: 203, name: 'Submitter Contribute', roleTypeKind: 3,
        basePermissionsHigh: '0', basePermissionsLow: '1011030767' },
      { roleId: 204, name: 'Read', roleTypeKind: 2,
        basePermissionsHigh: '0', basePermissionsLow: '138612833' }],
    principalKeyBindings: [{ principalKey: 'PROCESSOR', principalId: 101, category: 'Processor' },
      { principalKey: 'ADMIN', principalId: 104, category: 'Administrator' },
      { principalKey: 'SUBMITTER', principalId: 105, category: 'Submitter' },
      { principalKey: 'ACTOR', principalId: 106, category: 'Actor' },
      { principalKey: 'M-001', principalId: 109, category: 'Actor' },
      { principalKey: 'NEGATIVE', principalId: 107, category: 'Negative' }] },
  fields: storage,
  planningAuthority: { schemaRevision: 'c2b-annual-v2', behaviourContractVersion: 'KCCC-BEHAVIOUR|v02',
    initialState: 'Draft', initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready',
    processorPrincipalKey: 'PROCESSOR', adminPrincipalKeys: ['ADMIN'],
    coreCatalogueProviderReference: 'SYNTHETIC-CORE-CATALOGUE', coreKpiMasterListId: id(16),
    coreAnnualTargetsListId: id(17) }
});

const authority = (native: IC2bTenantNativeBinding, aclAuthorised: boolean = false): IC2bTenantBindingAuthority => {
  const expectedBinding = c2bTenantNativeBindingAuthorityContent(native);
  return { contractVersion: 'kcf.kpi.wib12.binding-authority.v1', authorityReference: 'SYNTHETIC-BINDING-AUTHORITY',
    expectedBindingSha256: hashC2bCanonical(expectedBinding), expectedBinding,
    aclAuthority: { authorised: aclAuthorised, identitySeparationEvidenceSha256: aclAuthorised ? 'F'.repeat(64) : null,
      rollbackActorPrincipalId: aclAuthorised ? native.principals.primaryOwnerPrincipalId : null,
      rollbackRegistryReference: aclAuthorised ? 'SYNTHETIC-ACL-ROLLBACK' : null } };
};
const nativePort = (sp: SPHttpClient, native: IC2bTenantNativeBinding = binding()): SharePointC2bNativePort =>
  new SharePointC2bNativePort(sp, native, expectedCandidate, authority(native), undefined, 30000,
    native.planningAuthority.coreCatalogueProviderReference);

const commandCaptureAdmission = (native: IC2bTenantNativeBinding): C2bCommandCaptureAdmissionV1 => ({
  host: { context: { source: { listId: id(2), itemId: 17, itemVersion: '1.0' }, route: 'Employee', payloadField: 'PayloadJSON',
    siteUrl: native.targetEvidence.siteUrl, site: native.targetEvidence.siteCollectionId, web: native.targetEvidence.rootWebId,
    candidate: { commit: expectedCandidate.commit, tree: expectedCandidate.tree } },
  binding: { k: 'kcf.kpi.storage-binding.v1', target: { site: id(91), web: id(92), library: id(93), list: id(2) },
    operation: { commandType: 'CreateWorkplanDraft', purpose: 'command', stateVersion: 1 },
    identity: { commandKey: 'synthetic-command', effectKey: null, attemptKey: id(94), leaseEpoch: 1 },
    source: { phase: 'PreSource', expectedActor: '101', observed: null },
    subjects: { subjectType: 'Workplan', subjectKey: 'P|2027', personKey: 'P', workplanKey: 'P|2027', performanceYear: 2027,
      itemKey: null, behaviourValue: null }, roles: { actorPersonKey: 'P', effectiveRole: 'Employee', rolePublicationSHA256: 'A'.repeat(64) },
    catalogue: null, candidate: { commit: expectedCandidate.commit, tree: expectedCandidate.tree, storageDesignSHA256: 'B'.repeat(64) },
    grant: { issuerPrincipal: '101', authorityRef: 'SYNTHETIC', authoritySHA256: 'C'.repeat(64), scopeSHA256: 'D'.repeat(64) } },
  providerProfile: 'sphttpclient-arraybuffer-odata3-nometadata-v1', responseByteBound: 1000000, completeBufferBytes: 1000000,
  timeoutMs: 10000, providerEvidence: 'synthetic', resourceReservation: 'synthetic', retentionAuthority: 'synthetic',
  registryAuthority: 'synthetic', provenanceAuthority: 'synthetic', readRightsAuthority: 'synthetic', issuer: '101', grantSHA256: 'E'.repeat(64) },
  retain: async responseValue => ({ reference: 'synthetic-retained', sha256: responseValue.sha256, bytes: responseValue.bytes.length })
});
const receiptFields = (): ITenantProvisioningReceiptAuthority['fieldInventory'] => [
  ...C2B_PROVISIONING_RECEIPT_FIELDS.map(field => field.type === 'Note'
    ? { ...field, versionHistory: false } : field.type === 'Number' ? { ...field, decimals: 0 }
      : field.type === 'Choice' ? { ...field, fillInChoice: false } : field)
].sort((left, right) => left.internalName.localeCompare(right.internalName));
const receiptStoreAuthority = (): ITenantProvisioningReceiptAuthority => {
  const fieldInventory = receiptFields();
  return { contractVersion: 'kcf.kpi.wib12.receipt-authority.v1',
    authorityReference: 'SYNTHETIC-RECEIPT-AUTHORITY', receiptListId: id(15),
    receiptListTitle: C2B_TENANT_TITLES.TenantProvisioningReceipts,
    schemaRevision: 'kcf-wib12-provisioning-receipt-v1',
    baseTemplate: 100, majorVersioningEnabled: true, foldersEnabled: false,
    keyField: 'ReceiptRevisionKey', seriesKeyField: 'ReceiptKey', chunkPrefix: 'ReceiptChunk',
    chunkCount: 16, maximumCodeUnits: 960000, fieldInventory,
    fieldInventorySha256: hashC2bCanonical(fieldInventory), writerPrincipalKey: 'PROCESSOR', writerPrincipalId: 101 };
};
const receiptListProviderIdentity = (): { Id: string; Title: string; BaseTemplate: number;
  EnableVersioning: boolean; EnableFolderCreation: boolean } => ({
  Id: id(15), Title: C2B_TENANT_TITLES.TenantProvisioningReceipts,
  BaseTemplate: 100, EnableVersioning: true, EnableFolderCreation: false });
const receiptFieldsProviderIdentity = (): { value: Array<Record<string, unknown>> } => ({ value: receiptFields().map(field => ({
  InternalName: field.internalName, TypeAsString: field.type === 'Date' ? 'DateTime' : field.type,
  Required: field.required, Indexed: field.indexed, EnforceUniqueValues: field.unique, FromBaseType: false,
  Choices: field.type === 'Choice' ? field.choices : undefined,
  SchemaXml: field.type === 'Text' ? `<Field MaxLength="${field.maxLength}" />`
    : field.type === 'Note' ? '<Field RichText="FALSE" AppendOnly="FALSE" />'
      : field.type === 'Choice' ? '<Field FillInChoice="FALSE" />'
        : field.type === 'Number' ? `<Field Decimals="0" Min="${field.minimum}" Max="${field.maximum}" />` : '<Field />'
})) });
const response = (status: number, body: unknown): SPHttpClientResponse => ({
  status, ok: status >= 200 && status < 300,
  json: () => Promise.resolve(body), text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body))
} as unknown as SPHttpClientResponse);
const client = (): SPHttpClient & { get: jest.Mock; post: jest.Mock } => ({
  get: jest.fn(), post: jest.fn() } as unknown as SPHttpClient & {
  get: jest.Mock; post: jest.Mock });
const effect = (kind: C2bCommandEffect['kind'], target: C2bCommandEffect['target'],
  desiredFields: Readonly<Record<string, unknown>>): C2bCommandEffect => ({
  sequence: 1, effectKey: `EFFECT-${kind}`, kind, target, naturalKey: 'P-001|2026', expectedETag: null,
  expectedETagFromEffectKey: null, expectedRowVersionToken: null, beforeFields: null,
  beforeSha256: 'A'.repeat(64), desiredFields, desiredSha256: hashC2bCanonical(desiredFields),
  effectSha256: 'B'.repeat(64), disposition: 'Unknown', confirmation: null, confirmationSha256: null
});
const journal = { plan: { commandKey: 'SYNTHETIC' } } as C2bCommandJournal;
const sealProvisioningReceipt = (receipt: ITenantProvisioningReceipt): ITenantProvisioningReceipt => {
  const unsigned = Object.keys(receipt).filter(keyName => keyName !== 'receiptSha256')
    .reduce<Record<string, unknown>>((result, keyName) => {
      result[keyName] = receipt[keyName as keyof ITenantProvisioningReceipt]; return result;
    }, {});
  receipt.receiptSha256 = hashC2bCanonical(unsigned); return receipt;
};
const mockRoleDefinitions = (sp: SPHttpClient & { get: jest.Mock }, native: IC2bTenantNativeBinding): void => {
  native.principals.roleDefinitions.forEach(role => sp.get.mockResolvedValueOnce(response(200, {
    Id: role.roleId, Name: role.name, RoleTypeKind: role.roleTypeKind,
    BasePermissions: { High: role.basePermissionsHigh, Low: role.basePermissionsLow }
  })));
};
interface ITestRoleAssignment {
  PrincipalId: number;
  RoleDefinitionBindings: Array<{ Id: number; Name: string;
    BasePermissions: { High: string; Low: string } }>;
}
interface IAclFaultHarness {
  native: IC2bTenantNativeBinding;
  initialAssignments: ITestRoleAssignment[];
  initialUnique: boolean;
  state: { unique: boolean; assignments: ITestRoleAssignment[] };
  sp: SPHttpClient & { get: jest.Mock; post: jest.Mock };
  port: SharePointC2bNativePort;
  register: jest.Mock;
  confirmRestored: jest.Mock;
  registeredImage: () => IC2bAclRollbackImage | undefined;
}
const roleAssignment = (native: IC2bTenantNativeBinding, principalId: number, roleId: number): ITestRoleAssignment => {
  const role = native.principals.roleDefinitions.find(item => item.roleId === roleId)!;
  return { PrincipalId: principalId, RoleDefinitionBindings: [{ Id: role.roleId, Name: role.name,
    BasePermissions: { High: role.basePermissionsHigh, Low: role.basePermissionsLow } }] };
};
const aclEffect = (): C2bCommandEffect => effect('Grant', 'Workplans', {
  containerKey: 'P-001|2026', breaksInheritanceAtContainer: true, canonicalChildrenInherit: true,
  allowedPrincipals: [{ principalKey: 'ACTOR', permission: 'Read', source: 'Employee' }],
  revokedPrincipalKeys: []
});
const aclFaultHarness = (faultAt: number, initialUnique: boolean = true): IAclFaultHarness => {
  const native = binding();
  const initialAssignments = [
    roleAssignment(native, native.principals.processorPrincipalId, native.principals.processorRoleId),
    roleAssignment(native, native.principals.primaryOwnerPrincipalId, native.principals.administratorRoleId),
    roleAssignment(native, native.principals.administratorPrincipalIds[0], native.principals.administratorRoleId),
    roleAssignment(native, 109, native.principals.actorReadRoleId)
  ];
  const state = { unique: initialUnique,
    assignments: JSON.parse(JSON.stringify(initialAssignments)) as typeof initialAssignments };
  const sp = client(); let mutationPostCount = 0;
  sp.get.mockImplementation((urlValue: string) => {
    const url = String(urlValue);
    const roleIdMatch = /roledefinitions\/getbyid\((\d+)\)/.exec(url);
    if (roleIdMatch) {
      const role = native.principals.roleDefinitions.find(item => item.roleId === Number(roleIdMatch[1]))!;
      return Promise.resolve(response(200, { Id: role.roleId, Name: role.name, RoleTypeKind: role.roleTypeKind,
        BasePermissions: { High: role.basePermissionsHigh, Low: role.basePermissionsLow } }));
    }
    if (url.includes('/items?$select=*,') && url.includes('&$filter=')) return Promise.resolve(response(200, { value: [{
      Id: 22, '@odata.etag': '"2"', RowVersionToken: 2, WorkplanKey: 'P-001|2026', ReceiptKey: 'P-001|2026'
    }] }));
    if (url.endsWith('?$select=HasUniqueRoleAssignments'))
      return Promise.resolve(response(200, { HasUniqueRoleAssignments: state.unique }));
    if (url.includes('/roleassignments?')) return Promise.resolve(response(200, { value: state.assignments }));
    throw new Error(`UNEXPECTED_GET:${url}`);
  });
  sp.post.mockImplementation((urlValue: string) => {
    const url = String(urlValue);
    if (url.includes('/breakroleinheritance(')) { state.unique = true; state.assignments = []; }
    else if (url.endsWith('/resetroleinheritance()')) {
      state.unique = false;
      state.assignments = JSON.parse(JSON.stringify(initialAssignments)) as typeof initialAssignments;
    } else {
      const grant = /addroleassignment\(principalid=(\d+),roledefid=(\d+)\)/.exec(url);
      if (!grant) throw new Error(`UNEXPECTED_POST:${url}`);
      state.assignments.push(roleAssignment(native, Number(grant[1]), Number(grant[2])));
    }
    mutationPostCount += 1;
    return Promise.resolve(response(mutationPostCount === faultAt ? 503 : 204, {}));
  });
  let registeredImage: IC2bAclRollbackImage | undefined;
  const register = jest.fn((image: IC2bAclRollbackImage, _authorityReference: string) => {
    registeredImage = image;
    return Promise.resolve({ registryReference: 'SYNTHETIC-ACL-ROLLBACK', imageSha256: image.imageSha256 });
  });
  const confirmRestored = jest.fn((_registryReference: string, _imageSha256: string) => Promise.resolve());
  const registry: IC2bAclRollbackRegistry = { register, confirmRestored };
  const port = new SharePointC2bNativePort(sp, native, expectedCandidate, authority(native, true), registry, 30000,
    native.planningAuthority.coreCatalogueProviderReference);
  return { native, initialAssignments, initialUnique, state, sp, port, register, confirmRestored,
    registeredImage: () => registeredImage };
};

describe('WI-B12 concrete SharePoint C2b native port', () => {
  it('captures complete command raw bytes with public SDK members and retains before interpretation', async () => {
    Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
    const native = binding(); const sp = client(); const admission = commandCaptureAdmission(native);
    const bytes = new TextEncoder().encode('{ "Id":17, "PayloadJSON":"\\u0061" }');
    let retained: Uint8Array | undefined; const oldRetain = admission.retain;
    admission.retain = async value => { retained = value.bytes.slice(); value.bytes.fill(0); return oldRetain({ ...value, bytes }); };
    const json = jest.fn(() => { throw new Error('JSON_READER_FORBIDDEN'); });
    sp.get.mockImplementation(async (url: string, _configuration: unknown, options: { headers: Record<string, string> }) => {
      if (!url.startsWith('https://synthetic.invalid/sites/kcf-test/_api/web/lists(')) throw new Error('NO_LIVE_OR_FOREIGN_URL');
      expect(options.headers['OData-Version']).toBe('3.0'); expect(options.headers.Accept).toBe('application/json;odata=nometadata');
      return { url, status: 200, headers: new Headers({ 'Content-Type': 'application/json;odata=nometadata',
        'Content-Length': String(bytes.length), ETag: '"1"' }), bodyUsed: false, json,
        arrayBuffer: async () => bytes.slice().buffer } as unknown as SPHttpClientResponse;
    });
    const got = await nativePort(sp, native).readCommandRawSource(id(2), 17, admission);
    expect(Buffer.from(got.bytes)).toEqual(Buffer.from(bytes)); expect(retained).toEqual(bytes);
    got.bytes.fill(0); expect(got.bytes).toEqual(bytes); expect(json).not.toHaveBeenCalled(); expect(sp.post).not.toHaveBeenCalled();
  });

  it.each(['missing-admission', 'unknown-bound', 'memory', 'rights', 'foreign-list', 'wrong-item', 'wrong-target'])(
    'denies command capture %s before SDK I/O', async attack => {
      const native = binding(); const sp = client(); const a = commandCaptureAdmission(native);
      if (attack === 'unknown-bound') (a.host as { responseByteBound?: number }).responseByteBound = undefined;
      if (attack === 'memory') (a.host as { completeBufferBytes: number }).completeBufferBytes = 1;
      if (attack === 'rights') (a.host as { readRightsAuthority: string }).readRightsAuthority = '';
      if (attack === 'wrong-target') a.host.context.site = id(99);
      await expect(nativePort(sp, native).readCommandRawSource(attack === 'foreign-list' ? id(6) : id(2),
        attack === 'wrong-item' ? 18 : 17, attack === 'missing-admission' ? undefined as unknown as C2bCommandCaptureAdmissionV1 : a)).rejects.toThrow();
      expect(sp.get).not.toHaveBeenCalled(); expect(sp.post).not.toHaveBeenCalled();
    });

  it.each(['url', 'status', 'media', 'encoding', 'length-missing', 'length-large', 'length-mismatch', 'used', 'body-failed',
    'retention', 'retention-hash', 'deadline', 'post-capture-mutation'])(
    'rejects received command capture %s with no recovered success', async attack => {
      Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
      const native = binding(); const sp = client(); const a = commandCaptureAdmission(native);
      const bytes = new TextEncoder().encode('{"Id":17}'); const retained: Uint8Array[] = [];
      let suppliedResponse: { status: number } | undefined;
      a.retain = async value => { retained.push(value.bytes.slice()); if (attack === 'retention') throw new Error('RETAIN_FAILED');
        if (attack === 'post-capture-mutation') suppliedResponse!.status = 200;
        return { reference: 'synthetic-retained', sha256: attack === 'retention-hash' ? 'F'.repeat(64) : value.sha256, bytes: value.bytes.length }; };
      if (attack === 'deadline') (a.host as { timeoutMs: number }).timeoutMs = 1;
      sp.get.mockImplementation(async (url: string) => {
        if (!url.startsWith('https://synthetic.invalid/sites/kcf-test/')) throw new Error('NO_LIVE_OR_FOREIGN_URL');
        const headers = new Headers({ 'Content-Type': attack === 'media' ? 'text/html' : 'application/json',
          'Content-Length': String(attack === 'length-large' ? 1000001 : attack === 'length-mismatch' ? bytes.length + 1 : bytes.length), ETag: '"1"' });
        if (attack === 'length-missing') headers.delete('Content-Length');
        if (attack === 'encoding') headers.set('Content-Encoding', 'gzip');
        suppliedResponse = { url: attack === 'url' ? 'https://foreign.invalid' : url,
          status: attack === 'status' || attack === 'post-capture-mutation' ? 503 : 200, headers,
          bodyUsed: attack === 'used', arrayBuffer: async () => {
            if (attack === 'body-failed') throw new Error('BODY_FAILED');
            if (attack === 'deadline') await new Promise(resolve => setTimeout(resolve, 10));
            return bytes.slice().buffer;
          } } as unknown as SPHttpClientResponse;
        return suppliedResponse as SPHttpClientResponse;
      });
      await expect(nativePort(sp, native).readCommandRawSource(id(2), 17, a)).rejects.toThrow();
      if (['status', 'media', 'encoding', 'length-mismatch', 'retention', 'retention-hash', 'post-capture-mutation'].includes(attack)) expect(retained).toEqual([bytes]);
      expect(sp.get).toHaveBeenCalledTimes(1); expect(sp.post).not.toHaveBeenCalled();
    });
  it('uses an exact GUID route, escapes an adversarial stable key and rejects duplicate readback', async () => {
    const sp = client();
    sp.get.mockResolvedValueOnce(response(200, { value: [{ Id: 7, '@odata.etag': '"1"', RowVersionToken: 1,
      NaturalKey: "O'Brien" }] }));
    const port = nativePort(sp);
    await expect(port.readItemByStableKey(id(7), 'NaturalKey', "O'Brien")).resolves.toMatchObject({ itemId: 7 });
    expect(decodeURIComponent(sp.get.mock.calls[0][0])).toContain("NaturalKey eq 'O''Brien'");
    expect(sp.get.mock.calls[0][0]).toContain(`lists(guid'${id(7)}')`);

    sp.get.mockResolvedValueOnce(response(200, { value: [
      { Id: 7, '@odata.etag': '"1"', RowVersionToken: 1 },
      { Id: 8, '@odata.etag': '"1"', RowVersionToken: 1 }
    ] }));
    await expect(port.readItemByStableKey(id(7), 'NaturalKey', 'COLLISION'))
      .rejects.toThrow(/C2B_NATIVE_STABLE_KEY_DUPLICATE/);
  });

  it('performs IF-MATCH CAS and confirms the actual provider readback', async () => {
    const sp = client();
    sp.post.mockResolvedValueOnce(response(204, {}));
    sp.get.mockResolvedValueOnce(response(200, { Id: 17, '@odata.etag': '"2"', RowVersionToken: 2,
      JournalStateSHA256: 'A'.repeat(64) }));
    const result = await nativePort(sp).compareExchangePhysicalRow(
      id(4), 17, '"1"', { JournalStateSHA256: 'A'.repeat(64) });
    expect(result).toMatchObject({ outcome: 'Confirmed', observed: { etag: '"2"', rowVersionToken: 2 } });
    expect(sp.post.mock.calls[0][2].headers).toMatchObject({ 'IF-MATCH': '"1"', 'X-HTTP-Method': 'MERGE' });
  });

  it('returns Unknown for provider ambiguity and never claims confirmation', async () => {
    const sp = client(); sp.post.mockResolvedValueOnce(response(503, 'unavailable'));
    const result = await nativePort(sp).compareExchangePhysicalRow(
      id(4), 17, '"1"', { JournalStateSHA256: 'A'.repeat(64) });
    expect(result).toEqual({ outcome: 'Unknown', safeCode: 'PROVIDER_UNKNOWN' });
    expect(sp.get).not.toHaveBeenCalled();
  });

  it('rejects a wrong list GUID and a cross-site paging continuation', async () => {
    const sp = client(); const port = nativePort(sp);
    await expect(port.readItemById(id(99), 1)).rejects.toThrow(/C2B_NATIVE_LIST_ID_UNBOUND/);
    sp.get.mockResolvedValueOnce(response(200, { value: [], '@odata.nextLink': 'https://evil.invalid/_api/web/lists' }));
    await expect(port.readDirectPage(id(8), 'P-001|2026', null))
      .rejects.toThrow(/C2B_NATIVE_PAGING_TARGET_ESCAPE/);

    sp.get.mockResolvedValueOnce(response(200, { value: [],
      '@odata.nextLink': `${binding().targetEvidence.siteUrl}/_api/web/lists(guid'${id(7)}')/items?$select=*&$top=200&$skiptoken=forged` }));
    await expect(port.readDirectPage(id(8), 'P-001|2026', null))
      .rejects.toThrow(/C2B_NATIVE_PAGING_QUERY_ESCAPE/);
  });

  it('recovers CommandEffects by effectKey and classifies exact ACL state only', async () => {
    const native = binding(); const sp = client();
    const commandEffect = effect('CanonicalUpsert', 'CommandEffects', { state: 'Issued' });
    sp.get.mockResolvedValueOnce(response(200, { value: [{ Id: 21, '@odata.etag': '"1"',
      RowVersionToken: 1, EffectKey: commandEffect.effectKey, EffectJSON: '{}' }] }));
    const port = nativePort(sp, native);
    await expect(port.recoverExact(native, journal, commandEffect)).resolves.toMatchObject({ outcome: 'StillUnknown' });
    expect(decodeURIComponent(sp.get.mock.calls[0][0])).toContain(`EffectKey eq '${commandEffect.effectKey}'`);

    const acl = effect('Grant', 'Workplans', { containerKey: 'P-001|2026', breaksInheritanceAtContainer: true,
      canonicalChildrenInherit: true, allowedPrincipals: [
        { principalKey: 'PROCESSOR', permission: 'FullControl', source: 'Processor' },
        { principalKey: 'ACTOR', permission: 'Read', source: 'Employee' }
      ], revokedPrincipalKeys: [] });
    sp.get.mockResolvedValueOnce(response(200, { value: [{ Id: 22, '@odata.etag': '"2"', RowVersionToken: 2,
      WorkplanKey: acl.naturalKey }] }));
    mockRoleDefinitions(sp, native);
    sp.get.mockResolvedValueOnce(response(200, { value: [
        roleAssignment(native, 101, 201), roleAssignment(native, 104, 202),
        roleAssignment(native, 106, 204), roleAssignment(native, 108, 204)
      ] }));
    await expect(port.recoverExact(native, journal, acl)).resolves.toMatchObject({ outcome: 'Applied',
      confirmation: { providerReference: `list:${id(7)}:item:22` } });

    sp.get.mockResolvedValueOnce(response(200, { value: [{ Id: 22, '@odata.etag': '"2"', RowVersionToken: 2,
      WorkplanKey: acl.naturalKey }] }));
    mockRoleDefinitions(sp, native);
    sp.get.mockResolvedValueOnce(response(200, { value: [
        roleAssignment(native, 101, 201), roleAssignment(native, 104, 202),
        roleAssignment(native, 106, 201), roleAssignment(native, 108, 204)
      ] }));
    await expect(port.recoverExact(native, journal, acl)).resolves.toMatchObject({ outcome: 'StillUnknown',
      safeCode: 'C2B_NATIVE_RECOVERY_ACL_MISMATCH' });
  });

  it('re-observes exact provider role-definition identity before ACL recovery', async () => {
    const native = binding(); const sp = client();
    const acl = effect('Grant', 'Workplans', { containerKey: 'P-001|2026', breaksInheritanceAtContainer: true,
      canonicalChildrenInherit: true, allowedPrincipals: [
        { principalKey: 'ACTOR', permission: 'Read', source: 'Employee' }
      ], revokedPrincipalKeys: [] });
    sp.get.mockResolvedValueOnce(response(200, { value: [{ Id: 22, '@odata.etag': '"2"', RowVersionToken: 2,
      WorkplanKey: acl.naturalKey }] })).mockResolvedValueOnce(response(200, {
        Id: 201, Name: 'SUBSTITUTED', RoleTypeKind: 2
      }));
    await expect(nativePort(sp, native).recoverExact(native, journal, acl))
      .rejects.toThrow(/C2B_NATIVE_ROLE_DEFINITION_PROVIDER_MISMATCH/);
  });

  it('persists an append-only provisioning revision and proves its exact readback', async () => {
    const sp = client();
    const receipt: ITenantProvisioningReceipt = {
      contractVersion: 'kcf.kpi.wib12.tenant-layer.v1',
      receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1', revision: 1,
      previousReceiptSha256: null, receiptSha256: 'C'.repeat(64), mode: 'Apply', applyExplicitlyEnabled: true,
      receiptKey: `tenant-provision|${'A'.repeat(64)}`, status: 'InProgress', stopCode: null,
      pendingOperation: null, unknownOperation: null, startedAt: '2026-09-13T18:45:00Z', completedAt: '2026-09-13T18:45:00Z',
      planSha256: 'A'.repeat(64), plan: {} as never, beforeStateSha256: 'B'.repeat(64), afterStateSha256: null,
      confirmations: [], rollback: { requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true,
        entries: [], ambiguityOutcome: 'BLOCKED_OFF' }
    };
    sealProvisioningReceipt(receipt);
    const stored = { Id: 41, ...serialiseTenantProvisioningReceiptRow(receipt),
      OData__UIVersionString: '1.0', '@odata.etag': '"1"', AuthorId: 101, EditorId: 101 };
    sp.get.mockResolvedValueOnce(response(200, receiptListProviderIdentity()))
      .mockResolvedValueOnce(response(200, receiptFieldsProviderIdentity()))
      .mockResolvedValueOnce(response(200, { value: [] }))
      .mockResolvedValueOnce(response(200, { value: [stored] }));
    sp.post.mockResolvedValueOnce(response(201, { Id: 41 }));
    const mutableTarget = binding().targetEvidence;
    const expectedSiteUrl = mutableTarget.siteUrl;
    const mutableAuthority = receiptStoreAuthority();
    const store = new SharePointTenantProvisioningReceiptStore(sp, mutableTarget, id(15), mutableAuthority);
    mutableTarget.siteUrl = 'https://escape.invalid/sites/production';
    (mutableAuthority as { receiptListId: string }).receiptListId = id(9);
    (mutableAuthority.fieldInventory[0] as { internalName: string }).internalName = 'InjectedReceiptJSON';
    (mutableAuthority as { writerPrincipalId: number }).writerPrincipalId = 999;
    await expect(store.persist(receipt)).resolves.toMatchObject({ providerReference: `list:${id(15)}:item:41` });
    expect(sp.get.mock.calls.every(call => String(call[0]).startsWith(expectedSiteUrl))).toBe(true);
    expect(JSON.parse(sp.post.mock.calls[0][2].body)).toEqual(serialiseTenantProvisioningReceiptRow(receipt));
  });

  it.each([
    ['list identity', () => ({ ...receiptListProviderIdentity(), Title: 'SubstitutedReceipts' }),
      receiptFieldsProviderIdentity, /TENANT_RECEIPT_LIST_IDENTITY_MISMATCH/],
    ['field schema', receiptListProviderIdentity, () => ({ value: receiptFieldsProviderIdentity().value.map((field, index) =>
      index === 0 ? { ...field, TypeAsString: 'Note' } : field) }), /TENANT_RECEIPT_SCHEMA_AUTHORITY_MISMATCH/]
  ])('rejects substituted provider %s before receipt use', async (_label, listIdentity, fieldIdentity, expected) => {
    const sp = client();
    sp.get.mockResolvedValueOnce(response(200, listIdentity()))
      .mockResolvedValueOnce(response(200, fieldIdentity()));
    const store = new SharePointTenantProvisioningReceiptStore(sp, binding().targetEvidence, id(15),
      receiptStoreAuthority());
    await expect(store.readChain('tenant-provision|synthetic')).rejects.toThrow(expected);
    expect(sp.post).not.toHaveBeenCalled();
  });

  it('rejects substituted item writer evidence before returning a receipt chain', async () => {
    const sp = client(); const receiptAuthority = receiptStoreAuthority();
    const receipt: ITenantProvisioningReceipt = {
      contractVersion: 'kcf.kpi.wib12.tenant-layer.v1',
      receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1', revision: 1,
      previousReceiptSha256: null, receiptSha256: 'C'.repeat(64), mode: 'Apply', applyExplicitlyEnabled: true,
      receiptKey: `tenant-provision|${'A'.repeat(64)}`, status: 'InProgress', stopCode: null,
      pendingOperation: null, unknownOperation: null, startedAt: '2026-09-13T18:45:00Z',
      completedAt: '2026-09-13T18:45:00Z', planSha256: 'A'.repeat(64), plan: {} as never,
      beforeStateSha256: 'B'.repeat(64), afterStateSha256: null, confirmations: [],
      rollback: { requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true,
        entries: [], ambiguityOutcome: 'BLOCKED_OFF' }
    };
    sealProvisioningReceipt(receipt);
    const revisionKey = tenantProvisioningRevisionKey(receipt);
    sp.get.mockResolvedValueOnce(response(200, receiptListProviderIdentity()))
      .mockResolvedValueOnce(response(200, receiptFieldsProviderIdentity()))
      .mockResolvedValueOnce(response(200, { value: [{ Id: 41, ...serialiseTenantProvisioningReceiptRow(receipt),
        ReceiptRevisionKey: revisionKey, OData__UIVersionString: '1.0', '@odata.etag': '"1"',
        AuthorId: receiptAuthority.writerPrincipalId, EditorId: 999 }] }));
    const store = new SharePointTenantProvisioningReceiptStore(sp, binding().targetEvidence, id(15), receiptAuthority);
    await expect(store.readChain(receipt.receiptKey))
      .rejects.toThrow(/TENANT_RECEIPT_ITEM_WRITER_EVIDENCE_MISMATCH/);
    expect(sp.post).not.toHaveBeenCalled();
  });

  it.each<[number, boolean]>([
    [1, false], [2, true], [3, false], [4, true], [5, false], [6, true]
  ])('restores the exact inherited/unique ACL image when fault %i occurs after a transactional mutation',
    async (faultAt, initialUnique) => {
      const harness = aclFaultHarness(faultAt, initialUnique);
      await expect(harness.port.reconcileContainerAcl(id(7), aclEffect(), harness.native.principals))
        .rejects.toThrow(/C2B_NATIVE_ACL_BLOCKED_OFF/);
      expect(harness.register).toHaveBeenCalledTimes(1);
      expect(harness.confirmRestored).toHaveBeenCalledTimes(1);
      expect(harness.registeredImage()).toMatchObject({ hasUniqueRoleAssignments: initialUnique,
        rollbackActorPrincipalId: harness.native.principals.primaryOwnerPrincipalId,
        imageSha256: expect.stringMatching(/^[0-9A-F]{64}$/) });
      expect(harness.state.unique).toBe(initialUnique);
      expect(canonicaliseC2b(harness.state.assignments)).toBe(canonicaliseC2b(harness.initialAssignments));
    });

  it('uses the same exact rollback transaction before a receipt ACL break', async () => {
    const harness = aclFaultHarness(1, false);
    const receiptAcl = effect('ReceiptGrant', 'CommandReceipts', { actorAccess: { allowedPrincipals: [
      { principalKey: 'ACTOR', permission: 'Read', source: 'Employee' }
    ] } });
    await expect(harness.port.reconcileReceiptActorRead(id(6), receiptAcl, {} as never, harness.native.principals))
      .rejects.toThrow(/C2B_NATIVE_ACL_BLOCKED_OFF/);
    expect(harness.confirmRestored).toHaveBeenCalledTimes(1);
    expect(harness.state.unique).toBe(false);
    expect(canonicaliseC2b(harness.state.assignments)).toBe(canonicaliseC2b(harness.initialAssignments));
  });

  it('binds an opaque cursor to list, workplan, query and prior page, then consumes it once', async () => {
    const native = binding(); const site = native.targetEvidence.siteUrl;
    const initial = `${site}/_api/web/lists(guid'${id(8)}')/items?$select=*&$filter=${encodeURIComponent("WorkplanKey eq 'P-001|2026'")}&$orderby=WorkplanItemNaturalKey&$top=200`;
    const next = `${initial}&$skiptoken=${encodeURIComponent('Paged=TRUE&p_ID=1')}`;
    const row = { Id: 31, '@odata.etag': '"1"', OData__UIVersionString: '1.0', RowVersionToken: 1,
      WorkplanItemNaturalKey: 'ITEM-1', WorkplanKey: 'P-001|2026' };
    const sp = client(); sp.get.mockResolvedValueOnce(response(200, { value: [row], '@odata.nextLink': next }))
      .mockResolvedValueOnce(response(200, { value: [] }));
    const port = nativePort(sp, native);
    const first = await port.readDirectPage(id(8), 'P-001|2026', null);
    expect(first).toMatchObject({ pageNumber: 1, complete: false, items: [{ naturalKey: 'ITEM-1' }] });
    expect(first.nextCursor).toMatch(/^[0-9a-f]{64}$/);
    expect(first.nextCursor).not.toContain('$skiptoken');
    await expect(port.readDirectPage(id(8), 'P-001|2026', first.nextCursor))
      .resolves.toMatchObject({ pageNumber: 2, complete: true, nextCursor: null });
    const callsAfterConsume = sp.get.mock.calls.length;
    await expect(port.readDirectPage(id(8), 'P-001|2026', first.nextCursor))
      .rejects.toThrow(/C2B_NATIVE_CURSOR_INVALID/);
    expect(sp.get).toHaveBeenCalledTimes(callsAfterConsume);

    for (const crossed of [{ listId: id(8), workplanKey: 'P-OTHER|2026' },
      { listId: id(7), workplanKey: 'P-001|2026' }]) {
      const crossedSp = client(); crossedSp.get.mockResolvedValueOnce(response(200, { value: [], '@odata.nextLink': next }));
      const crossedPort = nativePort(crossedSp, native);
      const issued = await crossedPort.readDirectPage(id(8), 'P-001|2026', null);
      await expect(crossedPort.readDirectPage(crossed.listId, crossed.workplanKey, issued.nextCursor))
        .rejects.toThrow(/C2B_NATIVE_CURSOR_INVALID/);
      expect(crossedSp.get).toHaveBeenCalledTimes(1);
    }
  });

  it.each<[string, (initial: string) => string, RegExp]>([
    ['duplicate token', (initial: string) => `${initial}&$skiptoken=one&$skiptoken=two`, /C2B_NATIVE_PAGING_QUERY_ESCAPE/],
    ['case-variant token', (initial: string) => `${initial}&$SkipToken=one`, /C2B_NATIVE_PAGING_QUERY_ESCAPE/],
    ['empty token', (initial: string) => `${initial}&$skiptoken=`, /C2B_NATIVE_PAGING_QUERY_ESCAPE/],
    ['altered query', (initial: string) => `${initial}&$filter=Injected&$skiptoken=one`, /C2B_NATIVE_PAGING_QUERY_ESCAPE/],
    ['altered path', (initial: string) => initial.replace(id(8), id(7)) + '&$skiptoken=one',
      /C2B_NATIVE_PAGING_QUERY_ESCAPE/],
    ['altered host', (initial: string) => initial.replace('synthetic.invalid', 'evil.invalid') + '&$skiptoken=one',
      /C2B_NATIVE_PAGING_TARGET_ESCAPE/]
  ])('rejects a %s continuation before issuing an external cursor', async (_label, attack, expected) => {
    const native = binding(); const sp = client();
    const initial = `${native.targetEvidence.siteUrl}/_api/web/lists(guid'${id(8)}')/items?$select=*&$filter=${encodeURIComponent("WorkplanKey eq ''")}&$orderby=WorkplanItemNaturalKey&$top=200`;
    sp.get.mockResolvedValueOnce(response(200, { value: [], '@odata.nextLink': attack(initial) }));
    await expect(nativePort(sp, native).readDirectPage(id(8), '', null)).rejects.toThrow(expected);
    expect(sp.get).toHaveBeenCalledTimes(1);
  });
});

describe('PM12 authoritative native planning provider', () => {
  const corePayload = { kpiId: 'KPI-001', role: 'DeliveryLead', contributionMethod: 'AdditiveDirect',
    annualTargetValue: 100, quarterTargets: [
      { quarter: 'Q1', targetValue: 25 }, { quarter: 'Q2', targetValue: 50 },
      { quarter: 'Q3', targetValue: 75 }, { quarter: 'Q4', targetValue: 100 }
    ], displayOrder: 1, activeInWorkplan: true };
  const envelope = { schemaVersion: 'kcf.kpi.test-command.v2', binding: { commandKey: id(40),
    commandType: 'UpsertCoreContributionV2', subjectType: 'WorkplanItem', subjectKey: 'KPI-001',
    personKey: 'ACTOR', performanceYear: 2027, workplanKey: 'ACTOR|2027' },
  expected: { header: { presence: 'Present', token: '5', etag: '"header-5"' },
    item: { presence: 'Present', etag: '"item-2"' } }, payload: corePayload };
  const source = { listId: id(2), itemId: 7, itemVersion: '1.0' };
  const row = (Id: number, etag: string, version: string, fields: Record<string, unknown>): Record<string, unknown> => ({
    Id, '@odata.etag': etag, OData__UIVersionString: version, AuthorId: 106, EditorId: 106,
    Author: { EMail: 'employee@example.invalid' }, ...fields
  });
  const kpiRow = (governance: object = { additiveEligible: true, directContributionEligible: true,
    nonOverlapRequired: true }): Record<string, unknown> => ({
    KPIID: 'KPI-001', KPIVersionKey: 'KPI-001|V1', KPIWording: 'Synthetic KPI', Pillar: 'Synthetic',
    Workstream: 'Synthetic', StrategyTarget: null, AccountableOwnerEmail: null, OwnerSourceCode: 'SYNTHETIC',
    DataQualityFlags: null, AggregationMethod: 'Sum', ScoringDirection: 'HigherIsBetter', MetricType: 'Percentage',
    UnitLabel: '%', RAGParametersJSON: canonicaliseC2b(governance), '@odata.etag': '"kpi-1"'
  });
  const targetRow = (): Record<string, unknown> => ({ KPIID: 'KPI-001', TargetVersionKey: 'KPI-001|2027|V1',
    YearEndTargetValue: 100, YearEndTargetText: null, Q1TargetValue: 25, Q1TargetText: null,
    Q2TargetValue: 50, Q2TargetText: null, Q3TargetValue: 75, Q3TargetText: null,
    Q4TargetValue: 100, Q4TargetText: null, '@odata.etag': '"target-1"' });
  const behaviourValues = (): Record<string, unknown>[] => Array.from({ length: 5 }, (_, index) =>
    row(20 + index, `"value-${index + 1}"`, '1.0', { FrameworkValueKey: `KCCC-BEHAVIOUR|v02|BHV-0${index + 1}`,
      FrameworkVersion: 'KCCC-BEHAVIOUR|v02', ValueID: `BHV-0${index + 1}`,
      ValueTitle: `Value ${index + 1}`, CorporateValue: `Value ${index + 1}`,
      ICOfficerDescriptor: `IC descriptor ${index + 1}`, PeopleManagerDescriptor: `Manager descriptor ${index + 1}`,
      SeniorLeaderDescriptor: `Leader descriptor ${index + 1}`, RowVersionToken: 1 }));
  const behaviourCatalogue = (): Record<string, unknown>[] => Array.from({ length: 5 }, (_, valueIndex) =>
    ['L1', 'L2', 'L3'].flatMap((level, levelIndex) => Array.from({ length: 5 }, (_, optionIndex) => {
      const title = `Objective ${valueIndex + 1}-${level}-${optionIndex + 1}`;
      return row(100 + valueIndex * 15 + levelIndex * 5 + optionIndex,
        `"catalogue-${valueIndex}-${levelIndex}-${optionIndex}"`, '1.0', {
          BehaviourObjectiveKey: `BHV-0${valueIndex + 1}-${level}-0${optionIndex + 1}`,
          BehaviourKey: `BHV-0${valueIndex + 1}`, BehaviourTitle: `Value ${valueIndex + 1}`,
          CorporateValue: `Value ${valueIndex + 1}`, RoleLevelCode: level,
          RoleLevelName: `Role ${level}`, DropdownLabel: `[Role ${level}] ${title}`, ObjectiveTitle: title,
          ObjectiveDescription: `${title} description`, SuggestedMeasure: `${title} measure`, SuggestedUnit: 'evidence',
          SuggestedEvidence: `${title} evidence`, Active: true, SortOrder: optionIndex + 1,
          EffectiveFrom: '2026-01-01', EffectiveTo: null, RowVersionToken: 1
        });
    }))).flat();
  const controlCaseRow = (): Record<string, unknown> => {
    const fields: Record<string, unknown> = { ControlCaseKey: 'CONTROL-KPI-001', ControlReference: 'CONTROL-KPI-001',
      AuthorisedAction: 'CreateWorkplanAmendmentV2', SubjectKey: 'ACTOR|2027', WorkplanKey: 'ACTOR|2027',
      WorkplanVersion: 1, ExpectedETag: '"header-5"', ExpectedRowVersionToken: 5, Active: true,
      ValidFromUtc: '2026-09-14T00:00:00Z', ValidToUtc: '2026-09-15T00:00:00Z', Revoked: false,
      RevokedAtUtc: null, RevocationReason: null, ConsumedAtUtc: null, ConsumedCommandKey: null,
      ConsumedSourceListId: null, ConsumedSourceItemId: null, ConsumedSourceItemVersion: null,
      RecoveryHoldAtUtc: null, RecoveryHoldReason: null, RowVersionToken: 1, ControlCaseContentSHA256: '' };
    fields.ControlCaseContentSHA256 = c2bControlCaseContentSha256(fields);
    return row(300, '"control-1"', '1.0', fields);
  };
  const planningSp = (options: { coreTitle?: string; governance?: object; duplicateCore?: boolean;
    unstableCore?: boolean; escapeCorePage?: boolean; missingCoreField?: boolean;
    crossedTarget?: boolean; headerToken?: unknown; itemToken?: unknown } = {}): SPHttpClient & { get: jest.Mock; post: jest.Mock } => {
    const native = binding(); const sp = client(); let coreReads = 0;
    const assignments = [roleAssignment(native, 101, 201), roleAssignment(native, 104, 202),
      roleAssignment(native, 106, 204), roleAssignment(native, 109, 204)];
    const header = row(3, '"header-5"', '5.0', { WorkplanKey: 'ACTOR|2027', PersonKey: 'ACTOR',
      EmployeeDisplayName: 'Employee', EmployeeEmail: 'employee@example.invalid', ManagerPersonKey: 'M-001',
      ManagerDisplayName: 'Manager', ManagerEmail: 'manager@example.invalid', PerformanceYear: 2027,
      State: 'Draft', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', CoreCategoryWeight: 100,
      PersonalCategoryWeight: 0, BehaviourCategoryWeight: 0, WorkplanVersion: 1, RowVersionToken: 5 });
    const item = row(4, '"item-2"', '2.0', { WorkplanItemKey: 'KPI-001',
      WorkplanItemNaturalKey: 'ACTOR|2027|CoreGold|KPI-001', WorkplanKey: 'ACTOR|2027', PersonKey: 'ACTOR',
      PerformanceYear: 2027, ItemType: 'CoreGold', KPIID: 'KPI-001', KPIVersionKey: 'KPI-001|V1',
      TargetVersionKey: 'KPI-001|2027|V1', EmployeeKpiRole: 'DeliveryLead', ContributionMethod: 'AdditiveDirect',
      UnitLabel: '%', CoreWorkplanWeight: 100, DisplayOrder: 1, ActiveInWorkplan: true,
      AddedByEmail: 'employee@example.invalid', AddedAt: '2026-09-14T22:00:00Z', RowVersionToken: 2 });
    if (Object.prototype.hasOwnProperty.call(options, 'headerToken')) {
      if (options.headerToken === undefined) delete header.RowVersionToken;
      else header.RowVersionToken = options.headerToken;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'itemToken')) {
      if (options.itemToken === undefined) delete item.RowVersionToken;
      else item.RowVersionToken = options.itemToken;
    }
    sp.get.mockImplementation((url: string) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes(`lists(guid'${id(2)}')/items(7)`)) return Promise.resolve(response(200,
        row(7, '"source-1"', '1.0', { RowVersionToken: 1, PayloadJSON: JSON.stringify(envelope) })));
      if (decoded.includes(`lists(guid'${id(1)}')/items?`) && decoded.includes("PersonKey eq 'ACTOR'"))
        return Promise.resolve(response(200, { value: [row(1, '"person-1"', '1.0', { PersonKey: 'ACTOR',
          Title: 'Employee', Email: 'employee@example.invalid', ManagerPersonKey: 'M-001',
          ManagerEmail: 'manager@example.invalid', AppRoles: ['Employee'], Active: true, RowVersionToken: 1 })] }));
      if (decoded.includes(`lists(guid'${id(1)}')/items?`) && decoded.includes("PersonKey eq 'M-001'"))
        return Promise.resolve(response(200, { value: [row(2, '"person-2"', '1.0', { PersonKey: 'M-001',
          Title: 'Manager', Email: 'manager@example.invalid', ManagerPersonKey: null,
          ManagerEmail: null, AppRoles: ['Manager'], Active: true, RowVersionToken: 1 })] }));
      if (decoded.includes(`lists(guid'${id(1)}')/items?`) && decoded.includes("Email eq 'admin@example.invalid'"))
        return Promise.resolve(response(200, { value: [row(5, '"person-5"', '1.0', { PersonKey: 'ADMIN',
          Title: 'Administrator', Email: 'admin@example.invalid', ManagerPersonKey: null,
          ManagerEmail: null, AppRoles: ['SystemAdmin'], Active: true, RowVersionToken: 1 })] }));
      if (decoded.includes(`lists(guid'${id(7)}')/items?`)) return Promise.resolve(response(200, { value: [header] }));
      if (decoded.includes(`lists(guid'${id(8)}')/items?`)) return Promise.resolve(response(200, { value: [item] }));
      if (decoded.includes(`lists(guid'${id(10)}')/items?`)) return Promise.resolve(response(200, { value: [
        row(10, '"framework-1"', '1.0', { FrameworkVersion: 'KCCC-BEHAVIOUR|v02', Published: true,
          Immutable: true, Current: true, ProductionSafe: false, Synthetic: true, EffectiveFrom: '2026-01-01',
          EffectiveTo: null, RatingLabelsJSON: canonicaliseC2b(BEHAVIOUR_V2_RATING_OPTIONS), RowVersionToken: 1 })] }));
      if (decoded.includes(`lists(guid'${id(11)}')/items?`)) return Promise.resolve(response(200,
        { value: behaviourValues() }));
      if (decoded.includes(`lists(guid'${id(12)}')/items?`)) return Promise.resolve(response(200, { value: [
        row(12, '"assignment-1"', '1.0', { AssignmentKey: 'ACTOR|KCCC-BEHAVIOUR|v02', PersonKey: 'ACTOR',
          FrameworkVersion: 'KCCC-BEHAVIOUR|v02', RoleTier: 'IC_OFFICER', Cadence: 'Quarterly',
          PeriodKeysJSON: canonicaliseC2b(['Q1', 'Q2', 'Q3', 'Q4']), Active: true, RowVersionToken: 1 })] }));
      if (decoded.includes(`lists(guid'${id(13)}')/items?`)) return Promise.resolve(response(200,
        { value: behaviourCatalogue() }));
      if (decoded.includes(`lists(guid'${id(14)}')/items?`)) return Promise.resolve(response(200,
        { value: [controlCaseRow()] }));
      if (decoded.includes('/roleassignments?')) return Promise.resolve(response(200, { value: assignments }));
      if (decoded.includes('HasUniqueRoleAssignments'))
        return Promise.resolve(response(200, { HasUniqueRoleAssignments: true }));
      if (decoded.includes(`lists(guid'${id(16)}')/items?`)) {
        coreReads += 1; const current = kpiRow(options.governance);
        if (options.missingCoreField) delete current.UnitLabel;
        if (options.unstableCore) current['@odata.etag'] = `"kpi-${coreReads}"`;
        const body: Record<string, unknown> = { value: options.duplicateCore ? [current, { ...current }] : [current] };
        if (options.escapeCorePage) body['@odata.nextLink'] = decoded.replace(id(16), id(17)) + '&$skiptoken=forged';
        return Promise.resolve(response(200, body));
      }
      if (decoded.includes(`lists(guid'${id(17)}')/items?`)) return Promise.resolve(response(200,
        { value: [{ ...targetRow(), ...(options.crossedTarget ? { KPIID: 'KPI-CROSSED' } : {}) }] }));
      if (decoded.includes(`lists(guid'${id(16)}')?`)) return Promise.resolve(response(200,
        { Id: id(16), Title: options.coreTitle || 'KCFKPI_KPIMaster' }));
      if (decoded.includes(`lists(guid'${id(17)}')?`)) return Promise.resolve(response(200,
        { Id: id(17), Title: 'KCFKPI_AnnualTargets' }));
      return Promise.resolve(response(404, {}));
    });
    return sp;
  };

  it.each([['headerToken', undefined], ['itemToken', undefined], ['headerToken', null], ['itemToken', null]] as const)
  ('denies historic missing raw %s encoded as %s without assigning a fallback', async (key, token) => {
    const native = binding(); const sp = planningSp({ [key]: token });
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(nativePort(sp, native), native,
      expectedCandidate, authority(native));
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, '2026-09-14T22:00:00Z'))
      .rejects.toThrow(/C2B_NATIVE_PLANNING_(HEADER|ITEM)_INVALID/);
    expect(sp.post).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('denies invalid stored token %s before annual effects', async token => {
    for (const key of ['headerToken', 'itemToken']) {
      const native = binding(); const sp = planningSp({ [key]: token });
      const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(nativePort(sp, native), native,
        expectedCandidate, authority(native));
      await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, '2026-09-14T22:00:00Z'))
        .rejects.toThrow(/C2B_NATIVE_(RECORD|PLANNING_(HEADER|ITEM))_INVALID/);
      expect(sp.post).not.toHaveBeenCalled();
    }
  });

  it('builds a positive Core plan only from exact bound GUID provider reads and immutable provenance', async () => {
    const native = binding(); const sp = planningSp();
    const port = nativePort(sp, native);
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate, authority(native));
    const plan = await createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, '2026-09-14T22:00:00Z');
    expect(plan).toMatchObject({ commandType: 'UpsertCoreContributionV2', personKey: 'ACTOR', actorPersonKey: 'ACTOR' });
    expect(plan.effects.some(candidate => candidate.target === 'WorkplanItems')).toBe(true);
    expect(sp.post).not.toHaveBeenCalled();
    const urls = sp.get.mock.calls.map(call => decodeURIComponent(String(call[0])));
    expect(urls.some(url => url.includes(`lists(guid'${id(16)}')/items?`)
      && url.includes("DefinitionStatus eq 'Active' and IsCurrent eq 1 and KPIID eq 'KPI-001'")
      && url.includes('$orderby=KPIID'))).toBe(true);
    expect(urls.some(url => url.includes(`lists(guid'${id(17)}')/items?`)
      && url.includes("PerformanceYear eq 2027 and TargetStatus eq 'Approved' and IsCurrent eq 1 and KPIID eq 'KPI-001'")
      && url.includes('$orderby=KPIID'))).toBe(true);
  });

  it.each([
    ['title crossing', { coreTitle: 'KCFKPI_AnnualTargets' }, /C2B_NATIVE_CORE_LIST_IDENTITY_MISMATCH/],
    ['duplicate row', { duplicateCore: true }, /C2B_NATIVE_CORE_CATALOGUE_AMBIGUOUS/],
    ['changed provider ETag', { unstableCore: true }, /C2B_NATIVE_CORE_CATALOGUE_TOCTOU/],
    ['cursor escape', { escapeCorePage: true }, /C2B_NATIVE_PAGING_QUERY_ESCAPE/],
    ['missing physical field', { missingCoreField: true }, /C2B_NATIVE_CORE_CATALOGUE_FIELD_ABSENT/],
    ['crossed target row', { crossedTarget: true }, /C2B_NATIVE_CORE_CATALOGUE_AMBIGUOUS/],
    ['missing governance', { governance: { directContributionEligible: true } }, /C2B_NATIVE_CORE_GOVERNANCE_INVALID/]
  ])('fails Core planning closed for %s with zero mutation', async (_label, options, expected) => {
    const native = binding(); const sp = planningSp(options); const port = nativePort(sp, native);
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate, authority(native));
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, '2026-09-14T22:00:00Z')).rejects.toThrow(expected);
    expect(sp.post).not.toHaveBeenCalled();
  });

  it('rejects a provider-reference substitution before any provider read', () => {
    const native = binding(); const sp = client();
    expect(() => new SharePointC2bNativePort(sp, native, expectedCandidate, authority(native), undefined, 30000,
      'FORGED-CORE-PROVIDER')).toThrow(/C2B_NATIVE_CORE_PROVIDER_REFERENCE_MISMATCH/);
    expect(sp.get).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed', (native: IC2bTenantNativeBinding) => { native.planningAuthority.coreKpiMasterListId = 'not-a-guid'; },
      /C2B_NATIVE_PLANNING_AUTHORITY_INVALID/],
    ['duplicate', (native: IC2bTenantNativeBinding) => {
      native.planningAuthority.coreAnnualTargetsListId = native.planningAuthority.coreKpiMasterListId;
    }, /C2B_NATIVE_PLANNING_AUTHORITY_INVALID/],
    ['crossed with B01', (native: IC2bTenantNativeBinding) => {
      native.planningAuthority.coreKpiMasterListId = native.lists[0].listId;
    }, /C2B_NATIVE_PLANNING_AUTHORITY_INVALID/]
  ])('rejects %s Core GUID authority before provider read', (_label, mutate, expected) => {
    const native = binding(); mutate(native); seal(native); const sp = client();
    expect(() => nativePort(sp, native)).toThrow(expected);
    expect(sp.get).not.toHaveBeenCalled();
  });

  it('rejects swapped Core GUID/title identity with zero mutation', async () => {
    const native = binding();
    [native.planningAuthority.coreKpiMasterListId, native.planningAuthority.coreAnnualTargetsListId] =
      [native.planningAuthority.coreAnnualTargetsListId, native.planningAuthority.coreKpiMasterListId];
    seal(native); const sp = planningSp(); const port = nativePort(sp, native);
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate, authority(native));
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, source, '2026-09-14T22:00:00Z'))
      .rejects.toThrow(/C2B_NATIVE_CORE_LIST_IDENTITY_MISMATCH/);
    expect(sp.post).not.toHaveBeenCalled();
  });

  it('reads the complete framework/value/assignment/75-row Behaviour projection from bound providers', async () => {
    const native = binding(); const sp = planningSp(); const port = nativePort(sp, native);
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate, authority(native));
    const behaviourEnvelope = { ...envelope,
      binding: { ...envelope.binding, commandKey: id(41), commandType: 'UpsertBehaviourCommitmentV2' as never,
        subjectKey: 'BHV-01' }, expected: { ...envelope.expected, item: { presence: 'Absent' as const } },
      payload: { valueId: 'BHV-01' } };
    const observation = { source: { listId: id(2), itemId: 8, itemVersion: '1.0' }, sourceETag: '"source-2"',
      sourceRowVersion: '1.0', route: 'Employee' as const, authorEmail: 'employee@example.invalid',
      envelope: behaviourEnvelope as never };
    const result = await adapter.readPlanningObservations(observation);
    expect(result.behaviourV2).toMatchObject({ framework: { frameworkVersion: 'KCCC-BEHAVIOUR|v02',
      values: expect.any(Array) }, assignment: { personKey: 'ACTOR', roleTier: 'IC_OFFICER' },
    catalogue: { complete: true, records: expect.any(Array) } });
    expect(result.behaviourV2?.framework.values).toHaveLength(5);
    expect(result.behaviourV2?.catalogue?.records).toHaveLength(75);
    expect(result.allocatedItemKey).toBe('BHV-01');
    expect(sp.post).not.toHaveBeenCalled();
  });

  it('reads exactly one stable authoritative control case for the amendment route', async () => {
    const native = binding(); const sp = planningSp(); const port = nativePort(sp, native);
    const adapter = new EmployeeWorkplanV2C2bSharePointNativeAdapter(port, native, expectedCandidate, authority(native));
    const amendmentEnvelope = { ...envelope,
      binding: { ...envelope.binding, commandKey: id(42), commandType: 'CreateWorkplanAmendmentV2' as const,
        subjectType: 'Workplan' as const, subjectKey: 'ACTOR|2027' },
      expected: { ...envelope.expected, item: { presence: 'NotApplicable' as const } },
      payload: { controlReference: 'CONTROL-KPI-001', reason: 'Synthetic authorised amendment' } };
    const observation = { source: { listId: id(3), itemId: 9, itemVersion: '1.0' }, sourceETag: '"source-3"',
      sourceRowVersion: '1.0', route: 'Manager' as const, authorEmail: 'admin@example.invalid',
      envelope: amendmentEnvelope as never };
    const result = await adapter.readPlanningObservations(observation);
    expect(result.actor).toMatchObject({ personKey: 'ADMIN', roles: ['SystemAdmin'] });
    expect(result.controlCases).toHaveLength(1);
    expect(result.controlCases[0]).toMatchObject({ controlCaseKey: 'CONTROL-KPI-001', storageETag: '"control-1"' });
    expect(sp.post).not.toHaveBeenCalled();
  });
});

describe('WI-B12 contained SharePoint provisioning observation', () => {
  const miniSchema: IBehaviourV2TenantSchema = {
    contractVersion: 'kcf.kpi.wib12.tenant-layer.v1', schemaRevision: 'kcf-behaviour-v2-tenant-1',
    operationPolicy: { modeDefault: 'DryRun', applyRequiresExplicitEnable: true, addOnly: true,
      overwriteAllowed: false, deleteAllowed: false, stableKeyImport: true, exactReadbackRequired: true },
    lists: [{ purpose: 'BehaviourFrameworkSets', title: 'KCFKPI_BehaviourFrameworkSets', createIfMissing: true,
      schemaRevision: 'kcf-behaviour-v2-tenant-1',
      stableKey: 'FrameworkVersion', baseTemplate: 100, titleRequired: false, majorVersioningEnabled: true,
      foldersEnabled: false, fields: [{ internalName: 'FrameworkVersion', type: 'Text', required: true,
        indexed: true, unique: true, maxLength: 255 }] }]
  };
  const createProvisioningClient = (sp: SPHttpClient): SharePointBehaviourV2TenantProvisioningClient =>
    new SharePointBehaviourV2TenantProvisioningClient(sp,
    binding().targetEvidence, miniSchema, [{ purpose: 'BehaviourFrameworkSets',
      title: 'KCFKPI_BehaviourFrameworkSets', listId: id(20), schemaRevision: miniSchema.schemaRevision }],
    { persist: jest.fn(), readChain: jest.fn() }, { productionReferenceObserved: false, activeOldFlowObserved: false });

  it('takes schema revision from provider Description, not the binding claim', async () => {
    const sp = client();
    sp.get.mockImplementation((url: string) => {
      if (url.includes('/fields?')) return Promise.resolve(response(200, { value: [] }));
      if (url.includes('/items?')) return Promise.resolve(response(200, { value: [] }));
      return Promise.resolve(response(200, { Id: id(20), Title: 'KCFKPI_BehaviourFrameworkSets',
        BaseTemplate: 100, EnableVersioning: true, EnableFolderCreation: false,
        Description: 'Provider state [schema:provider-observed-revision]' }));
    });
    const observedSnapshot = await createProvisioningClient(sp).observe();
    expect(observedSnapshot.lists[0].schemaRevision).toBe('provider-observed-revision');
  });

  it('retains immutable target, schema and GUID bindings after constructor validation', async () => {
    const sp = client();
    sp.get.mockResolvedValue(response(404, {}));
    const mutableTarget = binding().targetEvidence;
    const expectedSiteUrl = mutableTarget.siteUrl;
    const mutableSchema = JSON.parse(JSON.stringify(miniSchema)) as IBehaviourV2TenantSchema;
    const mutableBinding = { purpose: 'BehaviourFrameworkSets', title: 'KCFKPI_BehaviourFrameworkSets',
      listId: id(20), schemaRevision: miniSchema.schemaRevision };
    const provisioning = new SharePointBehaviourV2TenantProvisioningClient(sp, mutableTarget, mutableSchema,
      [mutableBinding], { persist: jest.fn(), readChain: jest.fn() },
      { productionReferenceObserved: false, activeOldFlowObserved: false });

    mutableTarget.siteUrl = 'https://escape.invalid/sites/production';
    (mutableSchema.lists[0] as { title: string }).title = 'Injected list title';
    mutableBinding.listId = id(21);
    await provisioning.observe();

    expect(sp.get.mock.calls).toHaveLength(1);
    expect(String(sp.get.mock.calls[0][0])).toContain(`lists(guid'${id(20)}')`);
    expect(String(sp.get.mock.calls[0][0]).startsWith(expectedSiteUrl)).toBe(true);
  });

  it('rejects a same-site continuation to another bound list/query', async () => {
    const sp = client();
    sp.get.mockImplementation((url: string) => {
      if (url.includes('/fields?')) return Promise.resolve(response(200, { value: [],
        '@odata.nextLink': `${binding().targetEvidence.siteUrl}/_api/web/lists(guid'${id(21)}')/fields?$select=InternalName&$top=5000&$skiptoken=forged` }));
      if (url.includes('/items?')) return Promise.resolve(response(200, { value: [] }));
      return Promise.resolve(response(200, { Id: id(20), Title: 'KCFKPI_BehaviourFrameworkSets',
        BaseTemplate: 100, EnableVersioning: true, EnableFolderCreation: false,
        Description: `Provider state [schema:${miniSchema.schemaRevision}]` }));
    });
    await expect(createProvisioningClient(sp).observe()).rejects.toThrow(/TENANT_PAGING_TARGET_ESCAPE/);
  });

  const isolatedSchema = (): IBehaviourV2TenantSchema => ({
    contractVersion: 'kcf.kpi.wib12.tenant-layer.v1', schemaRevision: 'kcf-behaviour-v2-tenant-1',
    operationPolicy: { modeDefault: 'DryRun', applyRequiresExplicitEnable: true, addOnly: true,
      overwriteAllowed: false, deleteAllowed: false, stableKeyImport: true, exactReadbackRequired: true },
    lists: [{ purpose: 'ControlCases', title: 'KCFKPI_TEST_ControlCases', createIfMissing: true,
      schemaRevision: 'c2b-control-case-v1', permissionCapability: 'PrivateProcessorOnly',
      stableKey: 'ControlCaseKey', baseTemplate: 100, titleRequired: false, majorVersioningEnabled: true,
      foldersEnabled: false, fields: [] }]
  });
  const privateAclAuthority = (): ITenantPrivateListAclAuthority => ({
    contractVersion: 'kcf.kpi.wib12.private-list-acl-authority.v1', authorityReference: 'SYNTHETIC-ACL-AUTHORITY',
    authorised: true, identitySeparationEvidenceSha256: 'F'.repeat(64),
    rollbackRegistryReference: 'SYNTHETIC-ACL-ROLLBACK', processorPrincipalId: 101,
    administratorPrincipalIds: [104], recoveryPrincipalId: 102, b01ActorPrincipalIds: [105, 106, 107],
    visitorsGroupId: 108, processorRoleId: 201, administratorRoleId: 202, recoveryRoleId: 202,
    roleDefinitions: [{ roleId: 201, name: 'Processor Full Control', roleTypeKind: 5,
      basePermissionsHigh: '2147483647', basePermissionsLow: '4294967295' },
    { roleId: 202, name: 'Administrator Full Control', roleTypeKind: 5,
      basePermissionsHigh: '2147483647', basePermissionsLow: '4294967295' }]
  });
  const isolatedClient = (sp: SPHttpClient, registry?: ITenantPrivateListAclRollbackRegistry,
    aclAuthority?: ITenantPrivateListAclAuthority): SharePointBehaviourV2TenantProvisioningClient => {
    const definition = isolatedSchema();
    return new SharePointBehaviourV2TenantProvisioningClient(sp, binding().targetEvidence, definition,
      [{ purpose: 'ControlCases', title: 'KCFKPI_TEST_ControlCases', listId: id(30),
        schemaRevision: 'c2b-control-case-v1' }], { persist: jest.fn(), readChain: jest.fn() },
      { productionReferenceObserved: false, activeOldFlowObserved: false }, aclAuthority, registry);
  };

  it.each([['c2b-control-case-v1', true], ['wrong-revision', false]])
  ('creates and reads back a list using its own %s revision', async (providerRevision, passes) => {
    const sp = client(); const schema = isolatedSchema(); let posted: Record<string, unknown> | undefined;
    sp.post.mockImplementation((url: string, _configuration: unknown, options: { body?: string }) => {
      if (url.endsWith('/_api/web/lists')) { posted = JSON.parse(options.body || '{}') as Record<string, unknown>;
        return Promise.resolve(response(201, { Id: id(30) })); }
      return Promise.resolve(response(204, {}));
    });
    let listReads = 0;
    sp.get.mockImplementation((url: string) => {
      if (url.includes("fields/getbyinternalnameortitle('Title')"))
        return Promise.resolve(response(200, { InternalName: 'Title', Required: true, '@odata.etag': '"1"' }));
      listReads += 1;
      const revision = listReads < 2 ? 'c2b-control-case-v1' : providerRevision;
      return Promise.resolve(response(200, { Id: id(30), Title: 'KCFKPI_TEST_ControlCases', BaseTemplate: 100,
        EnableVersioning: true, EnableFolderCreation: false, Description: `Created [schema:${revision}]` }));
    });
    const result = isolatedClient(sp).addList(schema.lists[0]);
    if (passes) await expect(result).resolves.toMatchObject({ outcome: 'Confirmed', listId: id(30) });
    else await expect(result).rejects.toThrow(/TENANT_ADD_LIST_READBACK_MISMATCH/);
    expect(posted?.Description).toContain('[schema:c2b-control-case-v1]');
  });

  it('applies an exact processor/admin/recovery ACL and excludes B01 actors and Visitors', async () => {
    const sp = client(); const authority = privateAclAuthority();
    const roles = new Map(authority.roleDefinitions.map(role => [role.roleId, role]));
    const state = { unique: false, assignments: [] as ITestRoleAssignment[] };
    sp.get.mockImplementation((url: string) => {
      const roleId = authority.roleDefinitions.find(role => url.includes(`getbyid(${role.roleId})`))?.roleId;
      if (roleId) { const role = roles.get(roleId)!; return Promise.resolve(response(200, { Id: role.roleId,
        Name: role.name, RoleTypeKind: role.roleTypeKind,
        BasePermissions: { High: role.basePermissionsHigh, Low: role.basePermissionsLow } })); }
      if (url.includes('/roleassignments?')) return Promise.resolve(response(200, { value: state.assignments }));
      return Promise.resolve(response(200, { Id: id(30), HasUniqueRoleAssignments: state.unique }));
    });
    sp.post.mockImplementation((url: string) => {
      if (url.includes('breakroleinheritance')) { state.unique = true; state.assignments = []; }
      const match = url.match(/principalid=(\d+),roledefid=(\d+)/);
      if (match) state.assignments.push(roleAssignment(binding(), Number(match[1]), Number(match[2])));
      if (url.includes('resetroleinheritance')) { state.unique = false; state.assignments = []; }
      return Promise.resolve(response(200, {}));
    });
    const registry = { register: jest.fn(async image => ({ registryReference: 'REGISTERED',
      imageSha256: image.imageSha256 })), confirmRestored: jest.fn() };
    await expect(isolatedClient(sp, registry, authority).reconcilePrivateListAcl(id(30), isolatedSchema().lists[0]))
      .resolves.toMatchObject({ outcome: 'Confirmed', providerReference: `list:${id(30)}:acl` });
    expect(state.unique).toBe(true);
    expect(state.assignments.map(row => row.PrincipalId).sort()).toEqual([101, 102, 104]);
    expect(state.assignments.some(row => [...authority.b01ActorPrincipalIds, authority.visitorsGroupId]
      .includes(row.PrincipalId))).toBe(false);
  });

  it('restores inherited ACL state after a provider fault and records the recovery', async () => {
    const sp = client(); const authority = privateAclAuthority(); let unique = false; let addCalls = 0;
    const assignments: ITestRoleAssignment[] = [];
    sp.get.mockImplementation((url: string) => {
      const role = authority.roleDefinitions.find(item => url.includes(`getbyid(${item.roleId})`));
      if (role) return Promise.resolve(response(200, { Id: role.roleId, Name: role.name, RoleTypeKind: role.roleTypeKind,
        BasePermissions: { High: role.basePermissionsHigh, Low: role.basePermissionsLow } }));
      if (url.includes('/roleassignments?')) return Promise.resolve(response(200, { value: assignments }));
      return Promise.resolve(response(200, { Id: id(30), HasUniqueRoleAssignments: unique }));
    });
    sp.post.mockImplementation((url: string) => {
      if (url.includes('breakroleinheritance')) { unique = true; assignments.length = 0; }
      if (url.includes('addroleassignment')) { addCalls += 1; if (addCalls === 2) return Promise.reject(new Error('network fault'));
        const match = url.match(/principalid=(\d+),roledefid=(\d+)/)!;
        assignments.push(roleAssignment(binding(), Number(match[1]), Number(match[2]))); }
      if (url.includes('resetroleinheritance')) { unique = false; assignments.length = 0; }
      return Promise.resolve(response(200, {}));
    });
    const registry = { register: jest.fn(async image => ({ registryReference: 'REGISTERED',
      imageSha256: image.imageSha256 })), confirmRestored: jest.fn() };
    await expect(isolatedClient(sp, registry, authority).reconcilePrivateListAcl(id(30), isolatedSchema().lists[0]))
      .resolves.toMatchObject({ outcome: 'Unknown', safeCode: 'CONNECTION_INTERRUPTED' });
    expect(unique).toBe(false); expect(assignments).toEqual([]); expect(registry.confirmRestored).toHaveBeenCalledTimes(1);
  });
});

describe('PM49 governed PD-01 native readiness source', () => {
  const configured = (): { native: IC2bTenantNativeBinding; row: Record<string, unknown> } => {
    const native = binding();
    const content = { schema: 'KCF.DeliveryWeightConfiguration', immutable: true, published: true,
      configurationId: 'PD01-2027', version: 'v1', approvalReference: 'KCF-KPI-Sponsor-PD-01',
      effectiveFrom: '2026-09-20', publishedAt: '2026-09-20T12:00:00.000Z',
      publishedBy: 'admin@example.invalid', changeReference: 'PD01-2027-PUBLISH',
      defaultWeights: { core: 70, impact: 30 }, activeWeights: { core: 70, impact: 30 } };
    const contentSha256 = hashC2bCanonical(content);
    native.planningAuthority.deliveryWeightConfiguration = { listId: id(18), listTitle: 'KCFKPI_TEST_DeliveryWeights',
      authority: { configurationId: content.configurationId, version: content.version,
        etag: '"pd01-1"', approvalReference: 'KCF-KPI-Sponsor-PD-01', contentSha256,
        effectiveFrom: content.effectiveFrom, publishedAt: content.publishedAt,
        publishedBy: content.publishedBy, changeReference: content.changeReference } };
    native.bindingReceiptSha256 = hashC2bTenantNativeBindingReceipt(native);
    return { native, row: { Schema: content.schema, Immutable: true, Published: true,
      ConfigurationID: content.configurationId, Version: content.version,
      ApprovalReference: content.approvalReference, ContentSHA256: contentSha256,
      EffectiveFrom: content.effectiveFrom, PublishedAt: content.publishedAt,
      PublishedBy: content.publishedBy, ChangeReference: content.changeReference,
      DefaultCoreWeight: 70, DefaultImpactWeight: 30, ActiveCoreWeight: 70, ActiveImpactWeight: 30,
      IsCurrent: true, '@odata.etag': '"pd01-1"' } };
  };
  const read = (port: SharePointC2bNativePort): Promise<unknown> =>
    (port as unknown as { readPlanningDeliveryWeightConfiguration(proof: unknown[]): Promise<unknown> })
      .readPlanningDeliveryWeightConfiguration([]);

  it('BUILD PM50 replay rejects switched list identity, unpublished and future-effective PD-01', async () => {
    const { native, row } = configured(); const sp = client();
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [row] } : { Id: id(18), Title: 'WRONG_LIST' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow(/PD01_LIST_IDENTITY_INVALID/);
    const unpublished = { ...row, Published: false };
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [unpublished] }
        : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow();
    const future = { ...row, EffectiveFrom: '2099-01-01' };
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [future] }
        : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow();
  });

  it('BUILD PM50 replay rejects partial, extra-page and switching PD-01 item reads', async () => {
    const { native, row } = configured(); const sp = client();
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [] }
        : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow(/PD01_CONFIGURATION_UNSTABLE/);
    const next = `https://synthetic.invalid/sites/kcf-test/_api/web/lists(guid'${id(18)}')/items?` +
      `$select=*,OData__UIVersionString&$filter=${encodeURIComponent("ConfigurationID eq 'PD01-2027' and IsCurrent eq 1")}` +
      '&$top=2&$skiptoken=extra';
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('$skiptoken=') ? { value: [row] }
        : url.includes('/items?') ? { value: [row], '@odata.nextLink': next }
          : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow(/PD01_CONFIGURATION_UNSTABLE/);
    let rowRead = 0;
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [{ ...row, Version: ++rowRead === 1 ? 'v1' : 'v2' }] }
        : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow(/PD01_CONFIGURATION_UNSTABLE/);
  });

  it('fails closed when the physical governed configuration is unbound', async () => {
    await expect(read(nativePort(client()))).rejects.toThrow(/PD01_CONFIGURATION_BINDING_ABSENT/);
  });

  it('names a missing bound TEST list as a physical blocker', async () => {
    const { native } = configured(); const sp = client();
    sp.get.mockResolvedValue(response(404, {}));
    await expect(read(nativePort(sp, native))).rejects.toThrow(/PD01_LIST_ABSENT/);
  });

  it('accepts only a stable, bound, published Core/Impact row with its exact content hash', async () => {
    const { native, row } = configured(); const sp = client();
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [row] } : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).resolves.toMatchObject({
      snapshot: { activeWeights: { core: 70, impact: 30 }, behaviourIncluded: false } });
    const forged = { ...row, ActiveCoreWeight: 60, ActiveImpactWeight: 40 };
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [forged] } : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow(/PD01_CONTENT_HASH_INVALID/);
  });

  it('rejects a changing row between the two native observations', async () => {
    const { native, row } = configured(); const sp = client(); let reads = 0;
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [{ ...row, Version: ++reads === 1 ? 'v1' : 'v2' }] }
        : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow(/PD01_CONFIGURATION_UNSTABLE/);
  });

  it('rejects stale pinned ETag and incomplete physical provenance', async () => {
    const { native, row } = configured(); const sp = client();
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [{ ...row, '@odata.etag': '"pd01-2"' }] }
        : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow(/AUTHORITY_STALE|authority|ETag/);
    sp.get.mockImplementation((url: string) => Promise.resolve(response(200,
      url.includes('/items?') ? { value: [{ ...row, PublishedBy: undefined }] }
        : { Id: id(18), Title: 'KCFKPI_TEST_DeliveryWeights' })));
    await expect(read(nativePort(sp, native))).rejects.toThrow();
  });
});
