import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import type {
  IBehaviourV2TenantProvisioningClient,
  IBehaviourV2TenantSchema,
  ITenantFieldDefinition,
  ITenantFieldObservation,
  ITenantListDefinition,
  ITenantListObservation,
  ITenantProvisioningListBinding,
  ITenantAuthenticatedReceiptChain,
  ITenantProvisioningReceipt,
  ITenantProvisioningReceiptAuthority,
  ITenantProvisioningSnapshot,
  ITenantRowObservation,
  TenantProvisioningOperation,
  TenantProvisioningRecoveryResult,
  TenantProvisioningMutationResult
} from './BehaviourV2TenantProvisioner';
import { canonicaliseC2b, hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import { assertKcfAutomationTenantTarget, type ITenantTargetEvidence } from './TenantTargetClassification';
import { immutableTenantInput } from './ImmutableTenantInput';
import { deserialiseTenantProvisioningReceiptRow, serialiseTenantProvisioningReceiptRow,
  tenantProvisioningRevisionKey } from './SharePointC2bReceiptStores';

interface IODataCollection<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

interface IListRow {
  Id: string;
  Title: string;
  BaseTemplate: number;
  EnableVersioning: boolean;
  EnableFolderCreation: boolean;
  Description?: string;
  HasUniqueRoleAssignments?: boolean;
}

interface IFieldRow {
  '@odata.etag'?: string;
  InternalName: string;
  TypeAsString: string;
  Required: boolean;
  Indexed: boolean;
  EnforceUniqueValues: boolean;
  Choices?: readonly string[] | { results?: readonly string[] };
  SchemaXml?: string;
  FromBaseType?: boolean;
}

interface IItemRow extends Record<string, unknown> {
  Id: number;
  OData__UIVersionString?: string;
  '@odata.etag'?: string;
  AuthorId?: number;
  EditorId?: number;
}
interface IBasePermissionsRow { High: string | number; Low: string | number; }
interface IRoleAssignmentRow { PrincipalId: number; RoleDefinitionBindings?: readonly { Id: number; Name?: string;
  BasePermissions?: IBasePermissionsRow }[]; }
interface IRoleDefinitionRow { Id: number; Name: string; RoleTypeKind: number; BasePermissions: IBasePermissionsRow; }

export interface ITenantPrivateListAclAuthority {
  contractVersion: 'kcf.kpi.wib12.private-list-acl-authority.v1';
  authorityReference: string;
  authorised: true;
  identitySeparationEvidenceSha256: string;
  rollbackRegistryReference: string;
  processorPrincipalId: number;
  administratorPrincipalIds: readonly number[];
  recoveryPrincipalId: number;
  b01ActorPrincipalIds: readonly number[];
  visitorsGroupId: number;
  processorRoleId: number;
  administratorRoleId: number;
  recoveryRoleId: number;
  roleDefinitions: readonly { roleId: number; name: string; roleTypeKind: number;
    basePermissionsHigh: string; basePermissionsLow: string }[];
}
export interface ITenantPrivateListAclRollbackImage {
  listId: string;
  hasUniqueRoleAssignments: boolean;
  assignments: readonly IRoleAssignmentRow[];
  imageSha256: string;
  recoveryPrincipalId: number;
}
export interface ITenantPrivateListAclRollbackRegistry {
  register(image: ITenantPrivateListAclRollbackImage, authorityReference: string):
    Promise<{ registryReference: string; imageSha256: string }>;
  confirmRestored(registryReference: string, imageSha256: string): Promise<void>;
}

const escapeOData = (value: string): string => value.replace(/'/g, "''");
const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');
const normalUrl = (value: string): string => value.trim().replace(/\/+$/, '');
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_]*$/;

export interface ITenantProvisioningReceiptStore {
  persist(receipt: ITenantProvisioningReceipt): Promise<{ providerReference: string; readbackSha256: string }>;
  readChain(receiptKey: string): Promise<ITenantAuthenticatedReceiptChain | undefined>;
}

const schemaAttribute = (schemaXml: string, name: string): string | undefined => {
  const marker = `${name}="`;
  const start = schemaXml.toLowerCase().indexOf(marker.toLowerCase());
  if (start < 0) return undefined;
  const valueStart = start + marker.length;
  const valueEnd = schemaXml.indexOf('"', valueStart);
  return valueEnd < 0 ? undefined : schemaXml.slice(valueStart, valueEnd);
};
const schemaElement = (schemaXml: string, name: string): string | undefined => {
  const opening = `<${name}>`;
  const closing = `</${name}>`;
  const start = schemaXml.toLowerCase().indexOf(opening.toLowerCase());
  if (start < 0) return undefined;
  const valueStart = start + opening.length;
  const valueEnd = schemaXml.toLowerCase().indexOf(closing.toLowerCase(), valueStart);
  return valueEnd < 0 ? undefined : schemaXml.slice(valueStart, valueEnd);
};
const boolAttr = (value: string | undefined): boolean | undefined => value === undefined ? undefined
  : ['TRUE', '1'].includes(value.toUpperCase());
const choices = (value: IFieldRow['Choices']): readonly string[] => Array.isArray(value)
  ? value : (value as { results?: readonly string[] } | undefined)?.results || [];

function mapField(row: IFieldRow): ITenantFieldObservation {
  const xml = row.SchemaXml || '';
  const type = row.TypeAsString === 'DateTime' ? 'Date' : row.TypeAsString;
  const result: ITenantFieldObservation = {
    internalName: row.InternalName,
    type: type as ITenantFieldObservation['type'], required: Boolean(row.Required),
    indexed: Boolean(row.Indexed), unique: Boolean(row.EnforceUniqueValues)
  };
  if (type === 'Text') result.maxLength = Number(schemaAttribute(xml, 'MaxLength'));
  if (type === 'Boolean') result.defaultValue = boolAttr(schemaAttribute(xml, 'Default') || schemaElement(xml, 'Default'));
  if (type === 'Date') {
    result.dateOnly = schemaAttribute(xml, 'Format') === 'DateOnly';
    result.utcNormalisedInput = true;
  }
  if (type === 'Choice') {
    result.choices = choices(row.Choices);
    result.fillInChoice = boolAttr(schemaAttribute(xml, 'FillInChoice')) || false;
  }
  if (type === 'Note') {
    result.plainText = !(boolAttr(schemaAttribute(xml, 'RichText')) || false);
    result.appendOnly = boolAttr(schemaAttribute(xml, 'AppendOnly')) || false;
    result.versionHistory = false;
  }
  if (type === 'Number') {
    result.decimals = Number(schemaAttribute(xml, 'Decimals'));
    result.minimum = Number(schemaAttribute(xml, 'Min'));
    result.maximum = Number(schemaAttribute(xml, 'Max'));
  }
  return result;
}

export function behaviourV2FieldSchemaXml(field: ITenantFieldDefinition): string {
  const common = `Name="${escapeXml(field.internalName)}" StaticName="${escapeXml(field.internalName)}" DisplayName="${escapeXml(field.internalName)}" Required="${field.required ? 'TRUE' : 'FALSE'}" Indexed="${field.indexed ? 'TRUE' : 'FALSE'}" EnforceUniqueValues="${field.unique ? 'TRUE' : 'FALSE'}"`;
  if (field.type === 'Text') return `<Field Type="Text" ${common} MaxLength="${field.maxLength || 255}" />`;
  if (field.type === 'Note') return `<Field Type="Note" ${common} RichText="FALSE" AppendOnly="FALSE" NumLines="6" />`;
  if (field.type === 'Boolean') return `<Field Type="Boolean" ${common}><Default>${field.defaultValue ? '1' : '0'}</Default></Field>`;
  if (field.type === 'Date') return `<Field Type="DateTime" ${common} Format="${field.dateOnly ? 'DateOnly' : 'DateTime'}" FriendlyDisplayFormat="Disabled" />`;
  if (field.type === 'Choice') return `<Field Type="Choice" ${common} FillInChoice="FALSE"><CHOICES>${(field.choices || [])
    .map(value => `<CHOICE>${escapeXml(value)}</CHOICE>`).join('')}</CHOICES></Field>`;
  return `<Field Type="Number" ${common} Decimals="${field.decimals ?? 0}" Min="${field.minimum}" Max="${field.maximum}" />`;
}

export default class SharePointBehaviourV2TenantProvisioningClient
implements IBehaviourV2TenantProvisioningClient {
  private readonly bindings = new Map<string, ITenantProvisioningListBinding>();
  private readonly targetEvidence: ITenantTargetEvidence;
  private readonly schema: IBehaviourV2TenantSchema;
  private readonly safety: { productionReferenceObserved: boolean; activeOldFlowObserved: boolean };
  private readonly privateAclAuthority?: ITenantPrivateListAclAuthority;

  public constructor(
    private readonly spHttpClient: SPHttpClient,
    targetEvidence: ITenantTargetEvidence,
    schema: IBehaviourV2TenantSchema,
    bindings: readonly ITenantProvisioningListBinding[],
    private readonly receiptStore: ITenantProvisioningReceiptStore,
    safety: { productionReferenceObserved: boolean; activeOldFlowObserved: boolean },
    privateAclAuthority?: ITenantPrivateListAclAuthority,
    private readonly privateAclRollbackRegistry?: ITenantPrivateListAclRollbackRegistry
  ) {
    const immutableTarget = immutableTenantInput(targetEvidence);
    const immutableSchema = immutableTenantInput(schema);
    const immutableBindings = immutableTenantInput(bindings);
    assertKcfAutomationTenantTarget(immutableTarget);
    if (immutableBindings.length !== immutableSchema.lists.length
      || new Set(immutableBindings.map(binding => binding.purpose)).size !== immutableBindings.length)
      throw new Error('TENANT_CLIENT_BINDING_INCOMPLETE');
    for (const definition of immutableSchema.lists) {
      const binding = immutableBindings.find(item => item.purpose === definition.purpose);
      if (!binding || binding.title !== definition.title || binding.schemaRevision !== definition.schemaRevision
        || binding.listId !== null && !GUID.test(binding.listId.replace(/[{}]/g, ''))) {
        throw new Error(`TENANT_CLIENT_BINDING_INVALID: ${definition.purpose}`);
      }
      this.bindings.set(binding.purpose, immutableTenantInput(binding));
    }
    this.targetEvidence = immutableTarget;
    this.schema = immutableSchema;
    this.safety = immutableTenantInput(safety);
    this.privateAclAuthority = privateAclAuthority ? immutableTenantInput(privateAclAuthority) : undefined;
    if (this.privateAclAuthority) this.assertPrivateAclAuthority(this.privateAclAuthority);
  }

  public async observe(): Promise<ITenantProvisioningSnapshot> {
    const lists: ITenantListObservation[] = [];
    for (const definition of this.schema.lists) {
      const binding = this.binding(definition.purpose);
      const list = binding.listId ? await this.readListById(binding.listId) : await this.readListByTitle(definition.title);
      if (!list) continue;
      if (list.Title !== definition.title) throw new Error(`TENANT_LIST_TITLE_GUID_CROSSED: ${definition.purpose}`);
      const providerSchemaRevision = this.providerSchemaRevision(list.Description);
      if (binding.listId === null && providerSchemaRevision === binding.schemaRevision) {
        this.bindings.set(definition.purpose, { ...binding, listId: list.Id });
      }
      const [fieldRows, rowRead] = await Promise.all([
        this.readAll<IFieldRow>(`${this.listUrlById(list.Id)}/fields?$select=InternalName,TypeAsString,Required,Indexed,EnforceUniqueValues,Choices,SchemaXml,FromBaseType&$top=5000`),
        this.readAll<IItemRow>(`${this.listUrlById(list.Id)}/items?$select=*&$top=5000`)
      ]);
      const title = fieldRows.items.find(field => field.InternalName === 'Title');
      const permissionCapability = definition.permissionCapability === 'PrivateProcessorOnly'
        ? (await this.observePrivateListAcl(list.Id)).permissionCapability : undefined;
      lists.push({
        purpose: definition.purpose, title: list.Title, listId: list.Id, schemaRevision: providerSchemaRevision,
        baseTemplate: list.BaseTemplate,
        titleRequired: Boolean(title?.Required), majorVersioningEnabled: Boolean(list.EnableVersioning),
        foldersEnabled: Boolean(list.EnableFolderCreation),
        fields: fieldRows.items.filter(field => field.InternalName !== 'Title' && field.FromBaseType !== true).map(mapField),
        rows: rowRead.items.map(row => this.mapRow(row)), pagingComplete: fieldRows.complete && rowRead.complete,
        ...(permissionCapability ? { permissionCapability } : {})
      });
    }
    return { targetEvidence: this.targetEvidence, bindings: Array.from(this.bindings.values()).map(binding => ({ ...binding })), lists,
      productionReferenceObserved: this.safety.productionReferenceObserved,
      activeOldFlowObserved: this.safety.activeOldFlowObserved };
  }

  public async addList(definition: ITenantListDefinition): Promise<TenantProvisioningMutationResult> {
    let response: SPHttpClientResponse;
    try {
      response = await this.post(`${this.siteUrl()}/_api/web/lists`, {
        BaseTemplate: definition.baseTemplate, Title: definition.title,
        Description: `${definition.description || ''} [schema:${definition.schemaRevision}]`.trim(),
        EnableVersioning: definition.majorVersioningEnabled, EnableFolderCreation: definition.foldersEnabled,
        OnQuickLaunch: false
      }, `Could not add ${definition.title}.`);
    } catch (caught) { return this.unknown(caught); }
    const created = await response.json() as { Id?: string };
    const observed = created.Id ? await this.readListById(created.Id) : await this.readListByTitle(definition.title);
    if (!observed?.Id) throw new Error(`TENANT_ADD_LIST_NO_ID: ${definition.title}`);
    const titleResponse = await this.spHttpClient.get(
      `${this.listUrlById(observed.Id)}/fields/getbyinternalnameortitle('Title')?$select=InternalName,Required`,
      SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
    await this.ensureSuccess(titleResponse, `Could not read ${definition.title}.Title before its created-list update.`);
    const titleField = await titleResponse.json() as IFieldRow;
    if (!titleField['@odata.etag']) throw new Error(`TENANT_CREATED_TITLE_ETAG_ABSENT: ${definition.title}`);
    await this.merge(`${this.listUrlById(observed.Id)}/fields/getbyinternalnameortitle('Title')`,
      titleField['@odata.etag'], { Required: false }, `Could not make ${definition.title}.Title optional.`);
    this.bindings.set(definition.purpose, { purpose: definition.purpose, title: definition.title,
      listId: observed.Id, schemaRevision: definition.schemaRevision });
    const readback = await this.readListById(observed.Id);
    if (!readback || readback.Title !== definition.title || readback.BaseTemplate !== definition.baseTemplate
      || this.providerSchemaRevision(readback.Description) !== definition.schemaRevision
      || !readback.EnableVersioning || readback.EnableFolderCreation) throw new Error('TENANT_ADD_LIST_READBACK_MISMATCH');
    return { outcome: 'Confirmed', providerReference: `list:${observed.Id}`, listId: observed.Id,
      readbackSha256: hashC2bCanonical(readback) };
  }

  public async reconcilePrivateListAcl(listId: string, definition: ITenantListDefinition):
  Promise<TenantProvisioningMutationResult> {
    if (definition.permissionCapability !== 'PrivateProcessorOnly')
      throw new Error(`TENANT_PRIVATE_LIST_ACL_DEFINITION_INVALID: ${definition.purpose}`);
    const binding = this.binding(definition.purpose);
    if (!binding.listId || this.normalGuid(binding.listId) !== this.normalGuid(listId))
      throw new Error(`TENANT_PRIVATE_LIST_ACL_BINDING_INVALID: ${definition.purpose}`);
    const authority = this.privateAclAuthority;
    const registry = this.privateAclRollbackRegistry;
    if (!authority || !registry)
      throw new Error(`TENANT_PRIVATE_LIST_ACL_AUTHORITY_ABSENT: ${definition.purpose}`);
    await this.assertProviderRoleDefinitions(authority);
    const before = await this.readPrivateAclState(listId);
    if (before.hasUniqueRoleAssignments)
      throw new Error(`TENANT_PRIVATE_LIST_ACL_PRESTATE_INVALID: ${definition.purpose}`);
    const image: ITenantPrivateListAclRollbackImage = immutableTenantInput({ listId: this.normalGuid(listId),
      hasUniqueRoleAssignments: before.hasUniqueRoleAssignments, assignments: before.assignments,
      imageSha256: hashC2bCanonical({ listId: this.normalGuid(listId),
        hasUniqueRoleAssignments: before.hasUniqueRoleAssignments, assignments: before.assignments }),
      recoveryPrincipalId: authority.recoveryPrincipalId });
    const registration = await registry.register(image, authority.rollbackRegistryReference);
    if (!registration.registryReference.trim() || registration.imageSha256 !== image.imageSha256)
      throw new Error(`TENANT_PRIVATE_LIST_ACL_ROLLBACK_REGISTRATION_INVALID: ${definition.purpose}`);
    try {
      await this.postAcl(`${this.listUrlById(listId)}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`);
      for (const assignment of this.expectedPrivateAssignments(authority)) {
        await this.postAcl(`${this.listUrlById(listId)}/roleassignments/addroleassignment(`
          + `principalid=${assignment.principalId},roledefid=${assignment.roleId})`);
      }
      const after = await this.readPrivateAclState(listId);
      this.assertPrivateAclState(after, authority, 'TENANT_PRIVATE_LIST_ACL_READBACK_MISMATCH');
      return { outcome: 'Confirmed', providerReference: `list:${this.normalGuid(listId)}:acl`,
        readbackSha256: hashC2bCanonical(after) };
    } catch (caught) {
      try {
        const observed = await this.readPrivateAclState(listId);
        try {
          this.assertPrivateAclState(observed, authority, 'TENANT_PRIVATE_LIST_ACL_READBACK_MISMATCH');
          return { outcome: 'Confirmed', providerReference: `list:${this.normalGuid(listId)}:acl`,
            readbackSha256: hashC2bCanonical(observed) };
        } catch { /* restore exact pre-state below */ }
        await this.restorePrivateAcl(image);
        const restored = await this.readPrivateAclState(listId);
        if (canonicaliseC2b(restored) !== canonicaliseC2b(before))
          throw new Error('TENANT_PRIVATE_LIST_ACL_RESTORE_MISMATCH');
        await registry.confirmRestored(registration.registryReference, image.imageSha256);
      } catch (restoreError) {
        throw new Error(`TENANT_PRIVATE_LIST_ACL_BLOCKED_OFF: ${restoreError instanceof Error
          ? restoreError.message : String(restoreError)}`);
      }
      return this.unknown(caught);
    }
  }

  public async addField(listId: string, definition: ITenantFieldDefinition): Promise<TenantProvisioningMutationResult> {
    try {
      await this.post(`${this.listUrlById(listId)}/fields/createfieldasxml`, {
        parameters: { __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
          SchemaXml: behaviourV2FieldSchemaXml(definition), Options: 0 }
      }, `Could not add ${definition.internalName}.`, true);
    } catch (caught) { return this.unknown(caught); }
    const observed = await this.readField(listId, definition.internalName);
    if (!observed || canonicaliseC2b(mapField(observed)) !== canonicaliseC2b(definition))
      throw new Error(`TENANT_ADD_FIELD_READBACK_MISMATCH: ${definition.internalName}`);
    return { outcome: 'Confirmed', providerReference: `list:${listId}:field:${definition.internalName}`,
      readbackSha256: hashC2bCanonical(mapField(observed)) };
  }

  public async insertRow(
    listId: string,
    stableKeyField: string,
    row: Readonly<Record<string, unknown>>
  ): Promise<TenantProvisioningMutationResult> {
    const stableKey = row[stableKeyField];
    if (!SAFE_FIELD.test(stableKeyField) || typeof stableKey !== 'string' || !stableKey.trim())
      throw new Error('TENANT_INSERT_KEY_ABSENT');
    const existing = await this.readRowsByStableKey(listId, stableKeyField, stableKey);
    if (existing.items.length) throw new Error(`TENANT_INSERT_WOULD_OVERWRITE: ${stableKey}`);
    let response: SPHttpClientResponse;
    try { response = await this.post(`${this.listUrlById(listId)}/items`, row, `Could not add stable key ${stableKey}.`); }
    catch (caught) { return this.unknown(caught); }
    const created = await response.json() as { Id?: number };
    const readback = await this.readRowsByStableKey(listId, stableKeyField, stableKey);
    if (readback.items.length !== 1) throw new Error(`TENANT_INSERT_READBACK_AMBIGUOUS: ${stableKey}`);
    const comparable = Object.keys(row).reduce<Record<string, unknown>>((result, key) => {
      result[key] = readback.items[0][key]; return result;
    }, {});
    if (canonicaliseC2b(comparable) !== canonicaliseC2b(row))
      throw new Error(`TENANT_INSERT_READBACK_MISMATCH: ${stableKey}`);
    return { outcome: 'Confirmed', providerReference: `list:${listId}:item:${created.Id || readback.items[0].Id}`,
      readbackSha256: hashC2bCanonical(comparable) };
  }

  public async recoverOperation(operation: TenantProvisioningOperation, definition: ITenantListDefinition,
    row?: Readonly<Record<string, unknown>>): Promise<TenantProvisioningRecoveryResult> {
    const binding = this.binding(operation.purpose);
    if (operation.kind === 'AddList') {
      const observed = binding.listId ? await this.readListById(binding.listId) : await this.readListByTitle(definition.title);
      if (!observed) return { outcome: 'NotApplied' };
      const providerReference = `list:${observed.Id}`;
      const readbackSha256 = hashC2bCanonical(observed);
      let revision: string;
      try { revision = this.providerSchemaRevision(observed.Description); }
      catch { return { outcome: 'PartiallyApplied', providerReference, readbackSha256,
        safeCode: 'TENANT_RECOVERY_LIST_SCHEMA_UNKNOWN' }; }
      const title = await this.readField(observed.Id, 'Title');
      if (observed.Title !== definition.title || observed.BaseTemplate !== definition.baseTemplate
        || revision !== binding.schemaRevision || !observed.EnableVersioning || observed.EnableFolderCreation
        || title?.Required !== false) {
        return { outcome: 'PartiallyApplied', providerReference, readbackSha256,
          safeCode: 'TENANT_RECOVERY_LIST_PARTIAL' };
      }
      this.bindings.set(operation.purpose, { ...binding, listId: observed.Id });
      return { outcome: 'Applied', providerReference, listId: observed.Id, readbackSha256 };
    }
    const listId = operation.listId || binding.listId;
    if (!listId) return { outcome: 'StillUnknown', safeCode: 'TENANT_RECOVERY_LIST_ID_ABSENT' };
    if (operation.kind === 'SetPrivateListAcl') {
      const observed = await this.observePrivateListAcl(listId);
      const readbackSha256 = observed.readbackSha256;
      const providerReference = `list:${this.normalGuid(listId)}:acl`;
      return observed.permissionCapability === 'PrivateProcessorOnly'
        ? { outcome: 'Applied', providerReference, readbackSha256 }
        : observed.permissionCapability === 'Inherited' ? { outcome: 'NotApplied' }
          : { outcome: 'PartiallyApplied', providerReference, readbackSha256,
            safeCode: 'TENANT_RECOVERY_PRIVATE_LIST_ACL_AMBIGUOUS' };
    }
    if (operation.kind === 'AddField') {
      const field = definition.fields.find(candidate => candidate.internalName === operation.field);
      if (!field) return { outcome: 'StillUnknown', safeCode: 'TENANT_RECOVERY_FIELD_DEFINITION_ABSENT' };
      const observed = await this.readField(listId, operation.field);
      if (!observed) return { outcome: 'NotApplied' };
      const mapped = mapField(observed);
      const recovered = { providerReference: `list:${listId}:field:${operation.field}`,
        readbackSha256: hashC2bCanonical(mapped) };
      return canonicaliseC2b(mapped) === canonicaliseC2b(field)
        ? { outcome: 'Applied', ...recovered }
        : { outcome: 'PartiallyApplied', ...recovered, safeCode: 'TENANT_RECOVERY_FIELD_CONFLICT' };
    }
    if (!row) return { outcome: 'StillUnknown', safeCode: 'TENANT_RECOVERY_ROW_DEFINITION_ABSENT' };
    const observed = await this.readRowsByStableKey(listId, operation.keyField, operation.stableKey);
    if (!observed.complete) return { outcome: 'StillUnknown', safeCode: 'TENANT_RECOVERY_ROW_PAGE_INCOMPLETE' };
    if (!observed.items.length) return { outcome: 'NotApplied' };
    const providerReference = `list:${listId}:item:${observed.items[0].Id}`;
    const comparable = Object.keys(row).reduce<Record<string, unknown>>((result, key) => {
      result[key] = observed.items[0][key]; return result;
    }, {});
    const recovered = { providerReference, readbackSha256: hashC2bCanonical(comparable) };
    return observed.items.length === 1 && canonicaliseC2b(comparable) === canonicaliseC2b(row)
      ? { outcome: 'Applied', ...recovered }
      : { outcome: 'PartiallyApplied', ...recovered, safeCode: 'TENANT_RECOVERY_ROW_CONFLICT' };
  }

  public persistReceipt(receipt: ITenantProvisioningReceipt):
  Promise<{ providerReference: string; readbackSha256: string }> { return this.receiptStore.persist(receipt); }

  public readReceiptChain(receiptKey: string): Promise<ITenantAuthenticatedReceiptChain | undefined> {
    return this.receiptStore.readChain(receiptKey);
  }

  private assertPrivateAclAuthority(authority: ITenantPrivateListAclAuthority): void {
    const positive = [authority.processorPrincipalId, ...authority.administratorPrincipalIds, authority.recoveryPrincipalId];
    const excluded = [...authority.b01ActorPrincipalIds, authority.visitorsGroupId];
    const roles = [authority.processorRoleId, authority.administratorRoleId, authority.recoveryRoleId];
    if (authority.contractVersion !== 'kcf.kpi.wib12.private-list-acl-authority.v1'
      || authority.authorised !== true || !authority.authorityReference.trim()
      || !SHA256.test(authority.identitySeparationEvidenceSha256)
      || !authority.rollbackRegistryReference.trim()
      || authority.administratorPrincipalIds.length < 1 || authority.b01ActorPrincipalIds.length < 1
      || [...positive, ...excluded, ...roles].some(value => !Number.isSafeInteger(value) || value < 1)
      || new Set(positive).size !== positive.length || new Set(excluded).size !== excluded.length
      || positive.some(value => excluded.includes(value))
      || new Set(authority.roleDefinitions.map(role => role.roleId)).size !== authority.roleDefinitions.length
      || new Set(roles).size !== authority.roleDefinitions.length
      || roles.some(roleId => !authority.roleDefinitions.some(role => role.roleId === roleId))
      || authority.roleDefinitions.some(role => role.roleTypeKind !== 5 || !role.name.trim()
        || !/^\d+$/.test(role.basePermissionsHigh) || !/^\d+$/.test(role.basePermissionsLow))) {
      throw new Error('TENANT_PRIVATE_LIST_ACL_AUTHORITY_INVALID');
    }
  }

  private expectedPrivateAssignments(authority: ITenantPrivateListAclAuthority):
  Array<{ principalId: number; roleId: number }> {
    return [
      { principalId: authority.processorPrincipalId, roleId: authority.processorRoleId },
      ...authority.administratorPrincipalIds.map(principalId => ({ principalId, roleId: authority.administratorRoleId })),
      { principalId: authority.recoveryPrincipalId, roleId: authority.recoveryRoleId }
    ].sort((left, right) => left.principalId - right.principalId || left.roleId - right.roleId);
  }

  private async assertProviderRoleDefinitions(authority: ITenantPrivateListAclAuthority): Promise<void> {
    for (const expected of authority.roleDefinitions) {
      const response = await this.spHttpClient.get(`${this.siteUrl()}/_api/web/roledefinitions/getbyid(${expected.roleId})`
        + '?$select=Id,Name,RoleTypeKind,BasePermissions/High,BasePermissions/Low',
      SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
      await this.ensureSuccess(response, 'Could not verify the exact private-list role definition.');
      const observed = await response.json() as IRoleDefinitionRow;
      if (observed.Id !== expected.roleId || observed.Name !== expected.name
        || observed.RoleTypeKind !== expected.roleTypeKind
        || String(observed.BasePermissions?.High) !== expected.basePermissionsHigh
        || String(observed.BasePermissions?.Low) !== expected.basePermissionsLow)
        throw new Error(`TENANT_PRIVATE_LIST_ROLE_DEFINITION_MISMATCH: ${expected.roleId}`);
    }
  }

  private normalGuid(value: string): string {
    const normal = value.replace(/[{}]/g, '').trim().toLowerCase();
    if (!GUID.test(normal)) throw new Error('TENANT_LIST_GUID_INVALID');
    return normal;
  }

  private normalAssignments(rows: readonly IRoleAssignmentRow[]): IRoleAssignmentRow[] {
    return rows.map(row => ({ PrincipalId: Number(row.PrincipalId), RoleDefinitionBindings:
      [...(row.RoleDefinitionBindings || [])].map(role => ({ Id: Number(role.Id), Name: String(role.Name || ''),
        BasePermissions: { High: String(role.BasePermissions?.High ?? ''), Low: String(role.BasePermissions?.Low ?? '') }
      })).sort((left, right) => left.Id - right.Id) }))
      .sort((left, right) => left.PrincipalId - right.PrincipalId);
  }

  private async readPrivateAclState(listId: string): Promise<{ hasUniqueRoleAssignments: boolean;
    assignments: IRoleAssignmentRow[] }> {
    const readOnce = async (): Promise<{ hasUniqueRoleAssignments: boolean; assignments: IRoleAssignmentRow[] }> => {
      const identity = await this.spHttpClient.get(`${this.listUrlById(listId)}?$select=Id,HasUniqueRoleAssignments`,
        SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
      await this.ensureSuccess(identity, 'Could not read private-list inheritance state.');
      const list = await identity.json() as IListRow;
      if (this.normalGuid(list.Id) !== this.normalGuid(listId) || typeof list.HasUniqueRoleAssignments !== 'boolean')
        throw new Error('TENANT_PRIVATE_LIST_ACL_IDENTITY_INVALID');
      const assignments = await this.readAll<IRoleAssignmentRow>(`${this.listUrlById(listId)}/roleassignments`
        + '?$select=PrincipalId,RoleDefinitionBindings/Id,RoleDefinitionBindings/Name,RoleDefinitionBindings/BasePermissions/High,RoleDefinitionBindings/BasePermissions/Low'
        + '&$expand=RoleDefinitionBindings&$top=200');
      return { hasUniqueRoleAssignments: list.HasUniqueRoleAssignments,
        assignments: this.normalAssignments(assignments.items) };
    };
    const first = await readOnce();
    const second = await readOnce();
    if (canonicaliseC2b(first) !== canonicaliseC2b(second))
      throw new Error('TENANT_PRIVATE_LIST_ACL_TOCTOU');
    return first;
  }

  private assertPrivateAclState(state: { hasUniqueRoleAssignments: boolean; assignments: readonly IRoleAssignmentRow[] },
    authority: ITenantPrivateListAclAuthority, code: string): void {
    const expected = this.expectedPrivateAssignments(authority);
    const actual = state.assignments.flatMap(row => (row.RoleDefinitionBindings || []).map(role => ({
      principalId: row.PrincipalId, roleId: role.Id, name: role.Name,
      high: String(role.BasePermissions?.High ?? ''), low: String(role.BasePermissions?.Low ?? '')
    }))).sort((left, right) => left.principalId - right.principalId || left.roleId - right.roleId);
    const expectedDetailed = expected.map(assignment => {
      const role = authority.roleDefinitions.find(item => item.roleId === assignment.roleId)!;
      return { ...assignment, name: role.name, high: role.basePermissionsHigh, low: role.basePermissionsLow };
    });
    const excluded = [...authority.b01ActorPrincipalIds, authority.visitorsGroupId];
    if (!state.hasUniqueRoleAssignments || actual.some(item => excluded.includes(item.principalId))
      || canonicaliseC2b(actual) !== canonicaliseC2b(expectedDetailed)) throw new Error(code);
  }

  private async observePrivateListAcl(listId: string): Promise<{ permissionCapability:
    'PrivateProcessorOnly' | 'Inherited' | 'Unknown'; readbackSha256: string }> {
    if (!this.privateAclAuthority) return { permissionCapability: 'Unknown',
      readbackSha256: hashC2bCanonical({ listId: this.normalGuid(listId), authority: 'absent' }) };
    try {
      const state = await this.readPrivateAclState(listId);
      const readbackSha256 = hashC2bCanonical(state);
      if (!state.hasUniqueRoleAssignments) return { permissionCapability: 'Inherited', readbackSha256 };
      this.assertPrivateAclState(state, this.privateAclAuthority, 'TENANT_PRIVATE_LIST_ACL_READBACK_MISMATCH');
      return { permissionCapability: 'PrivateProcessorOnly', readbackSha256 };
    } catch {
      return { permissionCapability: 'Unknown',
        readbackSha256: hashC2bCanonical({ listId: this.normalGuid(listId), authority: 'ambiguous' }) };
    }
  }

  private async postAcl(url: string): Promise<void> {
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' },
        body: '{}' });
    await this.ensureSuccess(response, 'Could not reconcile the exact processor-private list ACL.');
  }

  private async restorePrivateAcl(image: ITenantPrivateListAclRollbackImage): Promise<void> {
    const endpoint = this.listUrlById(image.listId);
    if (!image.hasUniqueRoleAssignments) await this.postAcl(`${endpoint}/resetroleinheritance()`);
    else {
      await this.postAcl(`${endpoint}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`);
      for (const row of image.assignments) for (const role of row.RoleDefinitionBindings || [])
        await this.postAcl(`${endpoint}/roleassignments/addroleassignment(principalid=${row.PrincipalId},roledefid=${role.Id})`);
    }
  }

  private mapRow(row: IItemRow): ITenantRowObservation {
    const fields = Object.keys(row).filter(key => !['Id', '@odata.etag', 'OData__UIVersionString'].includes(key))
      .reduce<Record<string, unknown>>((result, key) => { result[key] = row[key]; return result; }, {});
    return { itemId: Number(row.Id), etag: String(row['@odata.etag'] || ''),
      version: String(row.OData__UIVersionString || ''), fields };
  }

  private async readListByTitle(title: string): Promise<IListRow | undefined> {
    const response = await this.spHttpClient.get(
      `${this.siteUrl()}/_api/web/lists/getbytitle('${escapeOData(title)}')?$select=Id,Title,BaseTemplate,EnableVersioning,EnableFolderCreation,Description`,
      SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
    if (response.status === 404) return undefined;
    await this.ensureSuccess(response, `Could not discover ${title}.`);
    return await response.json() as IListRow;
  }

  private async readListById(listId: string): Promise<IListRow | undefined> {
    const response = await this.spHttpClient.get(
      `${this.listUrlById(listId)}?$select=Id,Title,BaseTemplate,EnableVersioning,EnableFolderCreation,Description`,
      SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
    if (response.status === 404) return undefined;
    await this.ensureSuccess(response, `Could not discover exact list GUID ${listId}.`);
    return await response.json() as IListRow;
  }

  private async readField(listId: string, internalName: string): Promise<IFieldRow | undefined> {
    if (!SAFE_FIELD.test(internalName)) throw new Error('TENANT_FIELD_NAME_INVALID');
    const response = await this.spHttpClient.get(
      `${this.listUrlById(listId)}/fields/getbyinternalnameortitle('${internalName}')?$select=InternalName,TypeAsString,Required,Indexed,EnforceUniqueValues,Choices,SchemaXml,FromBaseType`,
      SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
    if (response.status === 404) return undefined;
    await this.ensureSuccess(response, `Could not read back exact field ${internalName}.`);
    return await response.json() as IFieldRow;
  }

  private readRowsByStableKey(listId: string, stableKeyField: string, stableKey: string):
  Promise<{ items: IItemRow[]; complete: boolean }> {
    if (!SAFE_FIELD.test(stableKeyField)) throw new Error('TENANT_STABLE_KEY_FIELD_INVALID');
    const filter = encodeURIComponent(`${stableKeyField} eq '${escapeOData(stableKey)}'`);
    return this.readAll<IItemRow>(`${this.listUrlById(listId)}/items?$select=*&$filter=${filter}&$top=2`);
  }

  private async readAll<T>(initialUrl: string): Promise<{ items: T[]; complete: boolean }> {
    const items: T[] = [];
    let next: string | undefined = initialUrl;
    let pageCount = 0;
    while (next) {
      if (pageCount >= 1000) throw new Error('TENANT_PAGING_LIMIT_EXCEEDED');
      const response = await this.spHttpClient.get(this.containedPageUrl(initialUrl, next), SPHttpClient.configurations.v1,
        { headers: { Accept: 'application/json;odata=nometadata' } });
      await this.ensureSuccess(response, 'Could not complete SharePoint discovery paging.');
      const page = await response.json() as IODataCollection<T>;
      if (!Array.isArray(page.value)) throw new Error('TENANT_PAGING_RESPONSE_INVALID');
      items.push(...page.value);
      next = page['@odata.nextLink'] ? this.containedPageUrl(initialUrl, page['@odata.nextLink']) : undefined;
      pageCount += 1;
    }
    return { items, complete: true };
  }

  private async post(url: string, body: object, fallback: string, verbose: boolean = false): Promise<SPHttpClientResponse> {
    const mediaType = verbose ? 'application/json;odata=verbose' : 'application/json;odata=nometadata';
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1,
      { headers: { Accept: mediaType, 'Content-Type': mediaType }, body: JSON.stringify(body) });
    await this.ensureSuccess(response, fallback);
    return response;
  }

  private async merge(url: string, expectedETag: string, body: object, fallback: string): Promise<void> {
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': expectedETag, 'X-HTTP-Method': 'MERGE' }, body: JSON.stringify(body)
    });
    await this.ensureSuccess(response, fallback);
  }

  private async ensureSuccess(response: SPHttpClientResponse, fallback: string): Promise<void> {
    if (response.ok) return;
    const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
    throw new Error(`${fallback} HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
  }

  private binding(purpose: string): ITenantProvisioningListBinding {
    const binding = this.bindings.get(purpose);
    if (!binding) throw new Error(`TENANT_CLIENT_PURPOSE_UNBOUND: ${purpose}`);
    return binding;
  }

  private unknown(caught: unknown): TenantProvisioningMutationResult {
    const message = caught instanceof Error ? caught.message : String(caught);
    if (/HTTP (408|409|429|5\d\d)|timeout/i.test(message)) return { outcome: 'Unknown',
      safeCode: /HTTP 409/.test(message) ? 'RACE_COLLISION' : /timeout|HTTP 408/i.test(message)
        ? 'TIMEOUT_UNKNOWN' : 'PROVIDER_UNKNOWN' };
    if (/network|fetch|connection|abort/i.test(message)) return { outcome: 'Unknown', safeCode: 'CONNECTION_INTERRUPTED' };
    throw caught;
  }

  private siteUrl(): string { return normalUrl(this.targetEvidence.siteUrl); }
  private providerSchemaRevision(description: string | undefined): string {
    const matches = Array.from((description || '').matchAll(/\[schema:([^\]\s]+)\]/gi));
    if (matches.length !== 1 || !matches[0][1]) throw new Error('TENANT_PROVIDER_SCHEMA_REVISION_INVALID');
    return matches[0][1];
  }
  private containedPageUrl(initialValue: string, candidateValue: string): string {
    const site = new URL(this.siteUrl());
    const initial = new URL(initialValue, `${this.siteUrl()}/`);
    const candidate = new URL(candidateValue, `${this.siteUrl()}/`);
    const root = site.pathname.replace(/\/+$/, '');
    const initialTokens = Array.from(initial.searchParams.entries()).filter(([key]) => key.toLowerCase() === '$skiptoken');
    const candidateTokens = Array.from(candidate.searchParams.entries()).filter(([key]) => key.toLowerCase() === '$skiptoken');
    const query = (url: URL): string => Array.from(url.searchParams.entries())
      .filter(([key]) => key !== '$skiptoken')
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
      .map(([key, value]) => `${key}=${value}`).join('&');
    const continuation = candidate.toString() !== initial.toString();
    if (candidate.protocol !== site.protocol || candidate.host !== site.host
      || !candidate.pathname.startsWith(`${root}/_api/`) || initialTokens.length !== 0
      || candidateTokens.some(([key, value]) => key !== '$skiptoken' || !value.trim())
      || (continuation ? candidateTokens.length !== 1 : candidateTokens.length !== 0)
      || candidate.pathname !== initial.pathname
      || query(candidate) !== query(initial)) throw new Error('TENANT_PAGING_TARGET_ESCAPE');
    return candidate.toString();
  }
  private listUrlById(listId: string): string {
    const normal = listId.replace(/[{}]/g, '').trim().toLowerCase();
    if (!GUID.test(normal)) throw new Error('TENANT_LIST_GUID_INVALID');
    return `${this.siteUrl()}/_api/web/lists(guid'${normal}')`;
  }
}

/** Append-only SharePoint receipt journal used before and after every provisioning mutation. */
export class SharePointTenantProvisioningReceiptStore implements ITenantProvisioningReceiptStore {
  private readonly targetEvidence: ITenantTargetEvidence;
  private readonly receiptListId: string;
  private readonly keyField: string;
  private readonly seriesKeyField: string;
  private readonly authority: ITenantProvisioningReceiptAuthority;

  public constructor(
    private readonly spHttpClient: SPHttpClient,
    targetEvidence: ITenantTargetEvidence,
    receiptListId: string,
    receiptAuthority: ITenantProvisioningReceiptAuthority
  ) {
    const immutableTarget = immutableTenantInput(targetEvidence);
    const immutableAuthority = immutableTenantInput(receiptAuthority);
    assertKcfAutomationTenantTarget(immutableTarget);
    if (!GUID.test(receiptListId.replace(/[{}]/g, ''))
      || !immutableAuthority || immutableAuthority.contractVersion !== 'kcf.kpi.wib12.receipt-authority.v1'
      || immutableAuthority.receiptListId.replace(/[{}]/g, '').toLowerCase()
        !== receiptListId.replace(/[{}]/g, '').toLowerCase()
      || immutableAuthority.keyField !== 'ReceiptRevisionKey' || immutableAuthority.seriesKeyField !== 'ReceiptKey'
      || immutableAuthority.chunkPrefix !== 'ReceiptChunk' || immutableAuthority.chunkCount !== 16
      || immutableAuthority.maximumCodeUnits !== 960000
      || !immutableAuthority.receiptListTitle.trim() || !immutableAuthority.schemaRevision.trim()
      || immutableAuthority.baseTemplate !== 100 || immutableAuthority.majorVersioningEnabled !== true
      || immutableAuthority.foldersEnabled !== false || !immutableAuthority.writerPrincipalKey.trim()
      || !Number.isSafeInteger(immutableAuthority.writerPrincipalId) || immutableAuthority.writerPrincipalId < 1
      || !Array.isArray(immutableAuthority.fieldInventory) || !immutableAuthority.fieldInventory.length
      || immutableAuthority.fieldInventorySha256.toUpperCase()
        !== hashC2bCanonical(immutableAuthority.fieldInventory)
      || new Set(immutableAuthority.fieldInventory.map(field => field.internalName)).size
        !== immutableAuthority.fieldInventory.length
      || !immutableAuthority.fieldInventory.some(field => field.internalName === immutableAuthority.keyField)
      || !immutableAuthority.fieldInventory.some(field => field.internalName === immutableAuthority.seriesKeyField))
      throw new Error('TENANT_RECEIPT_STORE_BINDING_INVALID');
    this.targetEvidence = immutableTarget;
    this.receiptListId = receiptListId.replace(/[{}]/g, '').toLowerCase();
    this.keyField = immutableAuthority.keyField;
    this.seriesKeyField = immutableAuthority.seriesKeyField;
    this.authority = immutableAuthority;
  }

  public async persist(receipt: ITenantProvisioningReceipt):
  Promise<{ providerReference: string; readbackSha256: string }> {
    await this.authenticateStore();
    const revisionKey = tenantProvisioningRevisionKey(receipt);
    const physicalRow = serialiseTenantProvisioningReceiptRow(receipt);
    const existing = await this.readExact(revisionKey);
    if (existing.length > 1) throw new Error('TENANT_RECEIPT_KEY_DUPLICATE');
    if (existing.length === 1) {
      this.assertItemEvidence(existing[0]);
      if (canonicaliseC2b(deserialiseTenantProvisioningReceiptRow(existing[0])) !== canonicaliseC2b(receipt))
        throw new Error('TENANT_RECEIPT_REPLAY_CONFLICT');
      return { providerReference: `list:${this.receiptListId}:item:${existing[0].Id}`,
        readbackSha256: hashC2bCanonical(receipt) };
    }
    try {
      const response = await this.spHttpClient.post(`${this.listUrl()}/items`, SPHttpClient.configurations.v1, {
        headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' },
        body: JSON.stringify(physicalRow)
      });
      if (!response.ok) {
        const detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
        throw new Error(`TENANT_RECEIPT_WRITE_FAILED: HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
      }
    } catch (caught) {
      const recovered = await this.readExact(revisionKey);
      if (recovered.length !== 1
        || canonicaliseC2b(deserialiseTenantProvisioningReceiptRow(recovered[0])) !== canonicaliseC2b(receipt))
        throw new Error(`TENANT_RECEIPT_DURABILITY_UNKNOWN: ${caught instanceof Error ? caught.message : 'provider failure'}`);
    }
    const readback = await this.readExact(revisionKey);
    if (readback.length !== 1
      || canonicaliseC2b(deserialiseTenantProvisioningReceiptRow(readback[0])) !== canonicaliseC2b(receipt))
      throw new Error('TENANT_RECEIPT_READBACK_MISMATCH');
    this.assertItemEvidence(readback[0]);
    return { providerReference: `list:${this.receiptListId}:item:${readback[0].Id}`,
      readbackSha256: hashC2bCanonical(receipt) };
  }

  public async readChain(receiptKey: string): Promise<ITenantAuthenticatedReceiptChain | undefined> {
    if (!receiptKey.trim()) throw new Error('TENANT_RECEIPT_KEY_INVALID');
    const providerIdentity = await this.authenticateStore();
    const filter = encodeURIComponent(`${this.seriesKeyField} eq '${escapeOData(receiptKey)}'`);
    const initial = `${this.listUrl()}/items?$select=*`
      + `&$filter=${filter}&$top=500`;
    const rows: IItemRow[] = []; let next: string | undefined = initial; let pages = 0;
    while (next) {
      if (++pages > 100) throw new Error('TENANT_RECEIPT_PAGING_LIMIT');
      const response = await this.spHttpClient.get(this.containedPageUrl(initial, next), SPHttpClient.configurations.v1,
        { headers: { Accept: 'application/json;odata=nometadata' } });
      if (!response.ok) throw new Error(`TENANT_RECEIPT_READ_FAILED: HTTP ${response.status}`);
      const body = await response.json() as IODataCollection<IItemRow>;
      if (!Array.isArray(body.value)) throw new Error('TENANT_RECEIPT_READ_INVALID');
      rows.push(...body.value);
      next = body['@odata.nextLink'] ? this.containedPageUrl(initial, body['@odata.nextLink']) : undefined;
    }
    if (!rows.length) return undefined;
    const parsed = rows.map(row => ({ row, receipt: deserialiseTenantProvisioningReceiptRow(row) }))
      .sort((left, right) => left.receipt.revision - right.receipt.revision);
    for (const value of parsed) {
      this.assertItemEvidence(value.row);
      const expectedKey = tenantProvisioningRevisionKey(value.receipt);
      if (value.row[this.keyField] !== expectedKey) throw new Error('TENANT_RECEIPT_REVISION_KEY_MISMATCH');
      if (value.receipt.receiptKey !== receiptKey) throw new Error('TENANT_RECEIPT_SERIES_KEY_MISMATCH');
    }
    const latest = parsed[parsed.length - 1].row;
    return immutableTenantInput({ receiptListId: this.receiptListId,
      receiptListTitle: providerIdentity.Title, schemaRevision: this.authority.schemaRevision,
      fieldInventorySha256: providerIdentity.fieldInventorySha256,
      writerPrincipalKey: this.authority.writerPrincipalKey, writerPrincipalId: this.authority.writerPrincipalId,
      itemId: Number(latest.Id),
      itemVersion: String(latest.OData__UIVersionString || ''), etag: String(latest['@odata.etag'] || ''),
      revisionEvidence: parsed.map(value => ({ revision: value.receipt.revision,
        receiptSha256: value.receipt.receiptSha256, itemId: Number(value.row.Id),
        itemVersion: String(value.row.OData__UIVersionString || ''), etag: String(value.row['@odata.etag'] || ''),
        authorPrincipalId: Number(value.row.AuthorId), editorPrincipalId: Number(value.row.EditorId) })),
      revisions: parsed.map(value => value.receipt) });
  }

  private async readExact(key: string): Promise<IItemRow[]> {
    const normalId = this.receiptListId.replace(/[{}]/g, '').trim().toLowerCase();
    const filter = encodeURIComponent(`${this.keyField} eq '${escapeOData(key)}'`);
    const response = await this.spHttpClient.get(`${this.listUrl()}/items?$select=*`
      + `&$filter=${filter}&$top=2`, SPHttpClient.configurations.v1,
    { headers: { Accept: 'application/json;odata=nometadata' } });
    if (!response.ok) throw new Error(`TENANT_RECEIPT_READ_FAILED: ${normalId} HTTP ${response.status}`);
    const body = await response.json() as IODataCollection<IItemRow>;
    if (!Array.isArray(body.value)) throw new Error('TENANT_RECEIPT_READ_INVALID');
    return body.value;
  }

  private async authenticateStore(): Promise<IListRow & { fieldInventorySha256: string }> {
    const listResponse = await this.spHttpClient.get(
      `${this.listUrl()}?$select=Id,Title,BaseTemplate,EnableVersioning,EnableFolderCreation`,
      SPHttpClient.configurations.v1, { headers: { Accept: 'application/json;odata=nometadata' } });
    if (!listResponse.ok) throw new Error(`TENANT_RECEIPT_LIST_AUTHENTICATION_FAILED: HTTP ${listResponse.status}`);
    const list = await listResponse.json() as IListRow;
    const providerId = String(list.Id || '').replace(/[{}]/g, '').toLowerCase();
    if (providerId !== this.receiptListId || list.Title !== this.authority.receiptListTitle
      || list.BaseTemplate !== this.authority.baseTemplate
      || list.EnableVersioning !== this.authority.majorVersioningEnabled
      || list.EnableFolderCreation !== this.authority.foldersEnabled)
      throw new Error('TENANT_RECEIPT_LIST_IDENTITY_MISMATCH');
    const fieldResponse = await this.spHttpClient.get(`${this.listUrl()}/fields?`
      + '$select=InternalName,TypeAsString,Required,Indexed,EnforceUniqueValues,Choices,SchemaXml,FromBaseType'
      + '&$filter=FromBaseType eq false&$top=5000', SPHttpClient.configurations.v1,
    { headers: { Accept: 'application/json;odata=nometadata' } });
    if (!fieldResponse.ok) throw new Error(`TENANT_RECEIPT_SCHEMA_READ_FAILED: HTTP ${fieldResponse.status}`);
    const body = await fieldResponse.json() as IODataCollection<IFieldRow>;
    if (!Array.isArray(body.value) || body['@odata.nextLink']) throw new Error('TENANT_RECEIPT_SCHEMA_READ_INCOMPLETE');
    const actual = body.value.map(row => {
      const mapped = mapField(row);
      const field: Record<string, unknown> = { internalName: mapped.internalName, type: mapped.type,
        required: mapped.required, indexed: mapped.indexed, unique: mapped.unique };
      if (mapped.type === 'Text') field.maxLength = mapped.maxLength;
      if (mapped.type === 'Note') {
        field.plainText = mapped.plainText; field.appendOnly = mapped.appendOnly;
        field.versionHistory = mapped.versionHistory;
      }
      if (mapped.type === 'Choice') {
        field.choices = mapped.choices; field.fillInChoice = mapped.fillInChoice;
      }
      if (mapped.type === 'Number') {
        field.decimals = mapped.decimals; field.minimum = mapped.minimum; field.maximum = mapped.maximum;
      }
      return field;
    }).sort((left, right) => String(left.internalName).localeCompare(String(right.internalName)));
    const expected = [...this.authority.fieldInventory]
      .sort((left, right) => left.internalName.localeCompare(right.internalName));
    const fieldInventorySha256 = hashC2bCanonical(actual);
    if (canonicaliseC2b(actual) !== canonicaliseC2b(expected)
      || fieldInventorySha256 !== this.authority.fieldInventorySha256.toUpperCase())
      throw new Error('TENANT_RECEIPT_SCHEMA_AUTHORITY_MISMATCH');
    return { ...list, fieldInventorySha256 };
  }

  private assertItemEvidence(row: IItemRow): void {
    if (!Number.isSafeInteger(Number(row.Id)) || Number(row.Id) < 1
      || !String(row.OData__UIVersionString || '').trim() || !String(row['@odata.etag'] || '').trim()
      || Number(row.AuthorId) !== this.authority.writerPrincipalId
      || Number(row.EditorId) !== this.authority.writerPrincipalId)
      throw new Error('TENANT_RECEIPT_ITEM_WRITER_EVIDENCE_MISMATCH');
  }

  private containedPageUrl(initialValue: string, candidateValue: string): string {
    const site = new URL(this.targetEvidence.siteUrl);
    const initial = new URL(initialValue, `${this.targetEvidence.siteUrl}/`);
    const candidate = new URL(candidateValue, `${this.targetEvidence.siteUrl}/`);
    const initialTokens = Array.from(initial.searchParams.entries()).filter(([key]) => key.toLowerCase() === '$skiptoken');
    const candidateTokens = Array.from(candidate.searchParams.entries()).filter(([key]) => key.toLowerCase() === '$skiptoken');
    const query = (url: URL): string => Array.from(url.searchParams.entries()).filter(([key]) => key !== '$skiptoken')
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
      .map(([key, value]) => `${key}=${value}`).join('&');
    const root = site.pathname.replace(/\/+$/, '');
    const continuation = candidate.toString() !== initial.toString();
    if (candidate.protocol !== site.protocol || candidate.host !== site.host || !candidate.pathname.startsWith(`${root}/_api/`)
      || candidate.pathname !== initial.pathname || initialTokens.length !== 0
      || candidateTokens.some(([key, value]) => key !== '$skiptoken' || !value.trim())
      || (continuation ? candidateTokens.length !== 1 : candidateTokens.length !== 0)
      || query(candidate) !== query(initial)) throw new Error('TENANT_RECEIPT_PAGING_TARGET_ESCAPE');
    return candidate.toString();
  }

  private listUrl(): string {
    const id = this.receiptListId.replace(/[{}]/g, '').trim().toLowerCase();
    return `${normalUrl(this.targetEvidence.siteUrl)}/_api/web/lists(guid'${id}')`;
  }
}
