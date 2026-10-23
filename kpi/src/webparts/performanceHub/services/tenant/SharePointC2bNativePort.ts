/* eslint-disable @rushstack/no-new-null -- exact SharePoint absence/CAS state is explicit */
import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import { assertCommandCaptureAdmissionV1, immutableCommandRawResponseV1,
  type C2bCommandCaptureAdmissionV1, type C2bCommandRawResponseV1 } from '../C2bCommandSourceStorageV1';
import { storageCanonical, storageInteger, storageRequire } from '../../models/C2bFileStorageV1Models';
import { storageSHA256 } from '../C2bImmutableFileStorageV1';
import type {
  C2bCanonicalEntityReadback,
  C2bCanonicalObservation,
  C2bAclImage,
  C2bCommandEffect,
  C2bCommandJournal,
  C2bEffectConfirmation,
  C2bListAclImage,
  C2bStableReadProof,
  C2bTerminalReceipt
} from '../TestPilotCommandAdmissionC2b';
import { canonicaliseC2b, hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import type {
  C2bNativeRecoveryResult,
  IC2bNativePage,
  IC2bNativePlanningObservations,
  IC2bNativeReceiptProvenance,
  IC2bNativeSourceObservation
} from '../EmployeeWorkplanV2C2bNativeAdapter';
import type {
  C2bSharePointMutationOutcome,
  IC2bNativeSharePointPort,
  IC2bSharePointRecord,
  IC2bTenantBindingAuthority,
  IC2bTenantCandidateIdentity,
  IC2bNativePlanningProjectionResult,
  IC2bTenantNativeBinding,
  IC2bTenantPrincipalBindings
} from './EmployeeWorkplanV2C2bSharePointNativeAdapter';
import { assertC2bTenantNativeBinding } from './EmployeeWorkplanV2C2bSharePointNativeAdapter';
import { immutableTenantInput } from './ImmutableTenantInput';
import { hashC2bProjectedFocusRows } from './C2bBehaviourFocusV2Schema';
import { deserialiseC2bEffectRow, serialiseC2bEffectRow } from '../EmployeeWorkplanV2C2bSharePointJournalStore';
import { C2B_DIRECT_KEY_FIELDS, C2B_DIRECT_PHYSICAL_FIELDS, assertC2bDirectPhysicalFields }
  from './C2bPhysicalConvergenceContract';
import { SharePointC2bControlCaseStore, type IC2bControlCasePhysicalPort,
  type IC2bControlCasePhysicalRecord } from './SharePointC2bControlCaseStore';
import { deserialiseC2bTerminalReceiptRow, serialiseC2bTerminalReceiptRow } from './SharePointC2bReceiptStores';
import type { C2bControlledRole, C2bTrustedAnnualItem, C2bTrustedBehaviourV2Observations, C2bTrustedPerson,
  C2bTrustedWorkplanHeader } from '../TestPilotCommandAdmissionC2bHandlers';
import { assertC2bControlledPerson } from '../TestPilotCommandAdmissionC2bHandlers';
import { assertBehaviourPersonAssignmentV2, assertPublishedBehaviourFrameworkV2 }
  from '../BehaviourFrameworkV2Policy';
import { mapBehaviourLibraryV2Catalogue } from '../BehaviourLibraryV2Catalogue';
import { ANNUAL_TARGET_CATALOGUE_SELECT, KPI_MASTER_CATALOGUE_SELECT } from '../ProductionQueryFieldContracts';
import { evaluateAnnualSubmissionReadiness } from '../AnnualWorkplanValidation';
import { resolveGovernedDeliveryWeightConfiguration, type IDeliveryWeightConfigurationSnapshot,
  type IGovernedDeliveryWeightConfigurationContract } from '../CategoryWeightingPolicy';
import { readBehaviourPlanningLevelsV1, createBehaviourAnnualSnapshotV2 } from '../BehaviourFrameworkV2Policy';
import { decodeBehaviourSelectionSnapshotsV2 } from '../BehaviourSelectionSnapshotsV2';
import type { IAnnualWorkplan, IBehaviourWorkplanItem, ICoreWorkplanItem, IPersonalWorkplanItem }
  from '../../models/ProductionModels';

interface IODataCollection<T> { value: T[]; '@odata.nextLink'?: string; }
interface ISharePointRow extends Record<string, unknown> {
  Id: number;
  RowVersionToken?: number;
  OData__UIVersionString?: string;
  AuthorId?: number;
  EditorId?: number;
  Author?: { EMail?: string };
  '@odata.etag'?: string;
}
interface IBasePermissionsRow { High: string | number; Low: string | number; }
interface IRoleAssignmentRow { PrincipalId: number; RoleDefinitionBindings?: readonly { Id: number; Name?: string;
  BasePermissions?: IBasePermissionsRow }[]; }
interface IRoleDefinitionRow { Id: number; Name: string; RoleTypeKind: number; BasePermissions: IBasePermissionsRow; }
interface IExpectedRoleAssignment {
  principalId: number;
  roleId: number;
  roleName: string;
  basePermissionsHigh: string;
  basePermissionsLow: string;
}

export interface IC2bAclRollbackImage {
  endpoint: string;
  hasUniqueRoleAssignments: boolean;
  assignments: readonly IRoleAssignmentRow[];
  imageSha256: string;
  rollbackActorPrincipalId: number;
}

export interface IC2bAclRollbackRegistry {
  register(image: IC2bAclRollbackImage, authorityReference: string):
    Promise<{ registryReference: string; imageSha256: string }>;
  confirmRestored(registryReference: string, imageSha256: string): Promise<void>;
}
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const SAFE_FIELD = /^[A-Za-z][A-Za-z0-9_]*$/;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const escapeOData = (value: string): string => value.replace(/'/g, "''");
const fail = (code: string, detail: string): never => { throw new Error(`${code}: ${detail}`); };

/**
 * Authenticated native SharePoint REST port. It uses GUID-only list routing, exact IF-MATCH CAS,
 * bounded same-site paging, operation readback and unknown outcomes for ambiguous provider failures.
 */
export default class SharePointC2bNativePort implements IC2bNativeSharePointPort {
  private readonly siteUrl: string;
  private readonly listIds: ReadonlySet<string>;
  private readonly binding: IC2bTenantNativeBinding;
  private readonly expectedCandidate: IC2bTenantCandidateIdentity;
  private readonly bindingAuthority: IC2bTenantBindingAuthority;
  private readonly cursorRegistry = new Map<string, Readonly<{ listId: string; workplanKey: string;
    initialUrl: string; page: number; priorPageSha256: string; url: string }>>();

  public constructor(
    private readonly spHttpClient: SPHttpClient,
    binding: IC2bTenantNativeBinding,
    expectedCandidate: IC2bTenantCandidateIdentity,
    authority: IC2bTenantBindingAuthority,
    private readonly aclRollbackRegistry?: IC2bAclRollbackRegistry,
    private readonly timeoutMs: number = 30000,
    private readonly coreCatalogueProviderReference?: string
  ) {
    this.binding = immutableTenantInput(binding);
    this.expectedCandidate = immutableTenantInput(expectedCandidate);
    this.bindingAuthority = immutableTenantInput(authority);
    assertC2bTenantNativeBinding(this.binding, this.expectedCandidate, this.bindingAuthority);
    this.siteUrl = this.binding.targetEvidence.siteUrl.trim().replace(/\/+$/, '');
    this.listIds = new Set(this.binding.lists.map(list => this.guid(list.listId)));
    if (!nonBlank(this.coreCatalogueProviderReference)
      || this.coreCatalogueProviderReference !== this.binding.planningAuthority.coreCatalogueProviderReference)
      fail('C2B_NATIVE_CORE_PROVIDER_REFERENCE_MISMATCH', 'The concrete Core provider is not the immutable bound provider.');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000)
      fail('C2B_NATIVE_TIMEOUT_INVALID', 'Timeout must be between 1 and 120 seconds.');
  }

  public async readItemById(listId: string, itemId: number): Promise<IC2bSharePointRecord | undefined> {
    if (!Number.isSafeInteger(itemId) || itemId < 1) fail('C2B_NATIVE_ITEM_ID_INVALID', 'Item ID must be positive.');
    const response = await this.get(`${this.listUrl(listId)}/items(${itemId})?`
      + '$select=*,OData__UIVersionString,AuthorId,EditorId,Author/EMail&$expand=Author', true);
    return response ? this.record(await response.json() as ISharePointRow) : undefined;
  }

  /** Optional command-only complete capture; the general JSON readers and mutation paths are unchanged. */
  public async readCommandRawSource(listId: string, itemId: number,
    admission: C2bCommandCaptureAdmissionV1): Promise<C2bCommandRawResponseV1> {
    assertCommandCaptureAdmissionV1(admission);
    const h = admission.host; const c = h.context;
    const commands = [this.list('EmployeeCommands'), this.list('ManagerCommands')];
    const selected = commands.find(list => this.guid(list.listId) === this.guid(listId));
    storageRequire(selected && this.guid(listId) === c.source.listId && itemId === c.source.itemId
      && c.route === (selected.purpose === 'EmployeeCommands' ? 'Employee' : 'Manager')
      && c.siteUrl === this.siteUrl && c.site === this.binding.targetEvidence.siteCollectionId
      && c.web === this.binding.targetEvidence.rootWebId && c.payloadField === this.binding.fields.sourcePayloadJson
      && storageCanonical(c.candidate) === storageCanonical({ commit: this.expectedCandidate.commit, tree: this.expectedCandidate.tree }),
    'COMMAND_NATIVE_CONTEXT');
    storageInteger(itemId, 1);
    const url = this.safePageUrl(`${this.listUrl(listId)}/items(${itemId})?`
      + '$select=*,OData__UIVersionString,AuthorId,EditorId,Author/EMail&$expand=Author');
    const started = Date.now();
    const deadline = async <T,>(promise: Promise<T>): Promise<T> => {
      const remaining = Math.min(this.timeoutMs, h.timeoutMs) - (Date.now() - started);
      storageRequire(remaining > 0, 'COMMAND_DEADLINE');
      let timer: ReturnType<typeof setTimeout> | undefined;
      try { return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('C2B_FILE_COMMAND_DEADLINE')), remaining);
      })]); } finally { if (timer !== undefined) clearTimeout(timer); }
    };
    const response = await deadline(this.spHttpClient.get(url, SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata', 'OData-Version': '3.0' }, redirect: 'error' }));
    const responseUrl = response.url; const status = response.status;
    const headers: [string, string][] = []; response.headers.forEach((value, name) => headers.push([name, value]));
    headers.sort(([a], [b]) => a.localeCompare(b));
    const header = (name: string): string | undefined => {
      const values = headers.filter(([key]) => key.toLowerCase() === name.toLowerCase());
      storageRequire(values.length <= 1, 'COMMAND_DUPLICATE_HEADER'); return values[0]?.[1];
    };
    storageRequire(responseUrl === url && status >= 100 && status < 600
      && !(status >= 300 && status < 400), 'COMMAND_RESPONSE_URL');
    const lengthHeader = header('Content-Length');
    storageRequire(lengthHeader !== undefined && /^(0|[1-9][0-9]*)$/.test(lengthHeader), 'COMMAND_LENGTH_UNAVAILABLE');
    const length = Number(lengthHeader); storageInteger(length);
    storageRequire(length <= h.responseByteBound && !response.bodyUsed && typeof response.arrayBuffer === 'function', 'COMMAND_BODY_UNAVAILABLE');
    const bytes = new Uint8Array(await deadline(response.arrayBuffer()));
    const sha256 = await storageSHA256(bytes);
    const retained = await deadline(admission.retain({ requestUrl: url, responseUrl,
      status, headers: headers.map(([k, v]) => [k, v]), bytes: bytes.slice(), sha256 }));
    storageRequire(retained && nonBlank(retained.reference) && retained.sha256 === sha256 && retained.bytes === bytes.length,
      'COMMAND_RETENTION');
    storageRequire(bytes.length === length && bytes.length <= h.responseByteBound, 'COMMAND_COMPLETE_LENGTH');
    const media = header('Content-Type'); const encoding = header('Content-Encoding');
    storageRequire(typeof media === 'string' && /^application\/json(?:\s*;\s*(?:odata=nometadata|charset=utf-8))*$/i.test(media)
      && (encoding === undefined || encoding === 'identity') && status === 200, 'COMMAND_RECEIVED_REPRESENTATION');
    return immutableCommandRawResponseV1({ requestUrl: url, responseUrl, status,
      headers, sha256, retentionReference: retained.reference }, bytes);
  }

  public async readItemByStableKey(listId: string, keyField: string, stableKey: string):
  Promise<IC2bSharePointRecord | undefined> {
    this.field(keyField); if (!nonBlank(stableKey)) fail('C2B_NATIVE_STABLE_KEY_INVALID', 'Stable key is absent.');
    const filter = encodeURIComponent(`${keyField} eq '${escapeOData(stableKey)}'`);
    const rows = await this.readAll<ISharePointRow>(`${this.listUrl(listId)}/items?`
      + `$select=*,OData__UIVersionString,AuthorId,EditorId,Author/EMail&$expand=Author&$filter=${filter}&$top=2`);
    if (rows.length > 1) fail('C2B_NATIVE_STABLE_KEY_DUPLICATE', stableKey);
    return rows.length ? this.record(rows[0]) : undefined;
  }

  public async readPlanningProjection(binding: IC2bTenantNativeBinding, source: IC2bNativeSourceObservation):
  Promise<IC2bNativePlanningProjectionResult> {
    assertC2bTenantNativeBinding(binding, this.expectedCandidate, this.bindingAuthority);
    if (binding.bindingReceiptSha256 !== this.binding.bindingReceiptSha256)
      fail('C2B_NATIVE_PLANNING_BINDING_SWAP', 'Planning used a different receipt.');
    if (canonicaliseC2b(binding) !== canonicaliseC2b(this.binding))
      fail('C2B_NATIVE_PLANNING_BINDING_SWAP', 'Planning used caller-substituted binding bytes.');
    return immutableTenantInput(await this.readAuthoritativePlanningProjection(immutableTenantInput(source)));
  }

  public async createPhysicalRow(listId: string, keyField: string, stableKey: string,
    fields: Readonly<Record<string, unknown>>):
  Promise<C2bSharePointMutationOutcome> {
    this.field(keyField);
    if (await this.readItemByStableKey(listId, keyField, stableKey))
      fail('C2B_NATIVE_CREATE_COLLISION', stableKey);
    if (fields[keyField] !== stableKey) fail('C2B_NATIVE_CREATE_KEY_MISMATCH', stableKey);
    Object.keys(fields).forEach(field => this.field(field));
    const mutation = await this.postMutation(`${this.listUrl(listId)}/items`, { ...fields });
    if (mutation.outcome === 'Unknown') return mutation;
    const confirmed = await this.confirmStable(listId, keyField, stableKey);
    if (confirmed.outcome === 'Confirmed') this.assertFieldProjection(confirmed.observed.fields, fields,
      'C2B_NATIVE_CREATE_READBACK_MISMATCH');
    return confirmed;
  }

  public async compareExchangePhysicalRow(listId: string, itemId: number, expectedETag: string,
    fields: Readonly<Record<string, unknown>>): Promise<C2bSharePointMutationOutcome> {
    Object.keys(fields).forEach(field => this.field(field)); this.etag(expectedETag);
    const mutation = await this.postMutation(`${this.listUrl(listId)}/items(${itemId})`,
      { ...fields }, expectedETag);
    if (mutation.outcome === 'Unknown') return mutation;
    const observed = await this.readItemById(listId, itemId);
    if (!observed)
      fail('C2B_NATIVE_CAS_READBACK_MISMATCH', String(itemId));
    const exact = observed as IC2bSharePointRecord;
    this.assertFieldProjection(exact.fields, fields, 'C2B_NATIVE_CAS_READBACK_MISMATCH');
    return { outcome: 'Confirmed', providerReference: `list:${this.guid(listId)}:item:${itemId}`,
      observed: exact };
  }

  public async persistEffectState(listId: string, keyField: string, effect: C2bCommandEffect,
    journalETag: string, journal: C2bCommandJournal): Promise<C2bSharePointMutationOutcome> {
    this.etag(journalETag);
    const fields = serialiseC2bEffectRow(journal.plan.commandKey, effect, journalETag, journal);
    const existing = await this.readItemByStableKey(listId, keyField, effect.effectKey);
    const outcome = !existing ? await this.createPhysicalRow(listId, keyField, effect.effectKey, fields)
      : await this.compareExchangePhysicalRow(listId, existing.itemId, existing.etag, fields);
    if (outcome.outcome === 'Confirmed') deserialiseC2bEffectRow(outcome.observed.fields, journal);
    return outcome;
  }

  public async readDirect(listId: string, purpose: 'Workplans' | 'WorkplanItems', keyField: string, naturalKey: string):
  Promise<C2bCanonicalEntityReadback | undefined> {
    const record = await this.readItemByStableKey(listId, keyField, naturalKey);
    if (keyField !== C2B_DIRECT_KEY_FIELDS[purpose]) fail('C2B_NATIVE_DIRECT_KEY_FIELD_INVALID', purpose);
    return record ? this.directCanonical(record, purpose, naturalKey) : undefined;
  }

  public async readDirectPage(listId: string, workplanKey: string, cursor: string | null):
  Promise<IC2bNativePage<C2bCanonicalEntityReadback>> {
    const filter = encodeURIComponent(`WorkplanKey eq '${escapeOData(workplanKey)}'`);
    const initialUrl = `${this.listUrl(listId)}/items?$select=*&$filter=${filter}&$orderby=WorkplanItemNaturalKey&$top=200`;
    const exactListId = this.guid(listId);
    const decoded = cursor ? this.decodeCursor(cursor, exactListId, workplanKey, initialUrl)
      : { page: 1, url: initialUrl, priorPageSha256: hashC2bCanonical({ initialUrl, page: 0 }) };
    const response = await this.get(this.containedPageUrl(initialUrl, decoded.url));
    const page = await response!.json() as IODataCollection<ISharePointRow>;
    if (!Array.isArray(page.value)) fail('C2B_NATIVE_PAGE_INVALID', 'Items are absent.');
    const items = page.value.map(row => this.record(row)).map(record => this.directCanonical(record, 'WorkplanItems',
      String(record.fields[this.binding.fields.workplanItemKey] || '')));
    if (items.some(item => item.fields.WorkplanKey !== workplanKey)
      || new Set(items.map(item => item.naturalKey)).size !== items.length)
      fail('C2B_NATIVE_DIRECT_PAGE_CROSSED', workplanKey);
    const pageIdentity = hashC2bCanonical({ listId: exactListId, workplanKey, page: decoded.page,
      priorPageSha256: decoded.priorPageSha256, url: decoded.url, rows: page.value });
    const nextCursor = page['@odata.nextLink'] ? this.encodeCursor({ listId: exactListId, workplanKey, initialUrl,
      page: decoded.page + 1, priorPageSha256: pageIdentity,
      url: this.containedPageUrl(initialUrl, page['@odata.nextLink']) }) : null;
    return { items, pageNumber: decoded.page, complete: nextCursor === null, nextCursor };
  }

  public async applyCanonicalEffect(listId: string, effect: C2bCommandEffect): Promise<C2bSharePointMutationOutcome> {
    if (effect.target !== 'Workplans' && effect.target !== 'WorkplanItems')
      fail('C2B_NATIVE_DIRECT_TARGET_INVALID', effect.target);
    const purpose = effect.target as 'Workplans' | 'WorkplanItems';
    const keyField = purpose === 'Workplans' ? this.binding.fields.workplanKey : this.binding.fields.workplanItemKey;
    assertC2bDirectPhysicalFields(purpose, effect.desiredFields);
    if (effect.desiredFields[keyField] !== effect.naturalKey) fail('C2B_NATIVE_DIRECT_KEY_MISMATCH', effect.naturalKey);
    const existing = await this.readItemByStableKey(listId, keyField, effect.naturalKey);
    if (effect.expectedETag === null) {
      if (existing) fail('C2B_NATIVE_CANONICAL_CREATE_COLLISION', effect.naturalKey);
      const body = { ...effect.desiredFields };
      const mutation = await this.postMutation(`${this.listUrl(listId)}/items`, body);
      if (mutation.outcome === 'Unknown') return mutation;
    } else {
      if (!existing || existing.etag !== effect.expectedETag
        || effect.expectedRowVersionToken !== null && existing.rowVersionToken !== effect.expectedRowVersionToken)
        fail('C2B_NATIVE_CANONICAL_CAS_STALE', effect.naturalKey);
      const current = existing as IC2bSharePointRecord;
      const body = { ...effect.desiredFields };
      const mutation = await this.postMutation(`${this.listUrl(listId)}/items(${current.itemId})`, body,
        effect.expectedETag as string);
      if (mutation.outcome === 'Unknown') return mutation;
    }
    const confirmed = await this.confirmStable(listId, keyField, effect.naturalKey);
    if (confirmed.outcome === 'Confirmed') this.assertFieldProjection(confirmed.observed.fields, effect.desiredFields,
      'C2B_NATIVE_DIRECT_READBACK_MISMATCH');
    return confirmed;
  }

  public async consumeControlCase(effect: C2bCommandEffect): Promise<C2bSharePointMutationOutcome> {
    const result = await this.controlCaseStore().consume(effect);
    if (result.outcome === 'Unknown') return result;
    const listId = this.list('ControlCases').listId;
    const observed = await this.readItemByStableKey(listId, this.binding.fields.controlCaseKey, effect.naturalKey);
    if (!observed) fail('C2B_NATIVE_CONTROL_CASE_READBACK_ABSENT', effect.naturalKey);
    return { outcome: 'Confirmed', providerReference: result.providerReference, observed: observed as IC2bSharePointRecord };
  }

  public async reconcileContainerAcl(listId: string, effect: C2bCommandEffect,
    principals: IC2bTenantPrincipalBindings): Promise<C2bSharePointMutationOutcome> {
    this.assertAclMutationAuthority(principals);
    await this.assertProviderRoleDefinitions(principals);
    const keyField = effect.target === 'Workplans' ? this.binding.fields.workplanKey
      : effect.target === 'WorkplanItems' ? this.binding.fields.workplanItemKey
        : fail('C2B_NATIVE_ACL_TARGET_INVALID', effect.target);
    const record = await this.readItemByStableKey(listId, keyField, effect.naturalKey);
    if (!record || effect.expectedETag !== null && record.etag !== effect.expectedETag)
      fail('C2B_NATIVE_ACL_CONTAINER_STALE', effect.naturalKey);
    const container = record as IC2bSharePointRecord;
    const acl = effect.desiredFields as unknown as C2bAclImage;
    if (!acl || acl.containerKey !== effect.naturalKey || !Array.isArray(acl.allowedPrincipals)
      || !Array.isArray(acl.revokedPrincipalKeys))
      fail('C2B_NATIVE_ACL_IMAGE_INVALID', effect.naturalKey);
    const expectedAssignments = this.expectedContainerAssignments(effect, principals);
    const endpoint = `${this.listUrl(listId)}/items(${container.itemId})`;
    const assignmentRows = await this.replaceAclTransaction(endpoint, expectedAssignments, principals);
    const observedAcl = this.mapAcl(assignmentRows, effect.target as 'Workplans' | 'WorkplanItems', effect.naturalKey);
    return { outcome: 'Confirmed', providerReference: `list:${this.guid(listId)}:item:${container.itemId}:acl`,
      observed: { ...container, fields: { ...container.fields, AclReadback: observedAcl } } };
  }

  public appendAudit(listId: string, effect: C2bCommandEffect): Promise<C2bSharePointMutationOutcome> {
    assertC2bDirectPhysicalFields('Audit', effect.desiredFields);
    if (effect.desiredFields[this.binding.fields.auditKey] !== effect.naturalKey)
      fail('C2B_NATIVE_AUDIT_KEY_MISMATCH', effect.naturalKey);
    return this.createPhysicalRow(listId, this.binding.fields.auditKey, effect.naturalKey, effect.desiredFields);
  }
  public async createTerminalReceipt(listId: string, effect: C2bCommandEffect, receipt: C2bTerminalReceipt,
    provenance: IC2bNativeReceiptProvenance): Promise<C2bSharePointMutationOutcome> {
    const fields = serialiseC2bTerminalReceiptRow(receipt, provenance);
    const outcome = await this.createPhysicalRow(listId, this.binding.fields.receiptKey, receipt.receiptKey, fields);
    if (outcome.outcome === 'Confirmed') {
      const envelope = deserialiseC2bTerminalReceiptRow(outcome.observed.fields);
      if (canonicaliseC2b(envelope.receipt) !== canonicaliseC2b(receipt)
        || outcome.observed.authorPrincipalId !== this.binding.principals.processorPrincipalId
        || outcome.observed.editorPrincipalId !== this.binding.principals.processorPrincipalId
        || outcome.observed.authorEmail.trim().toLowerCase() !== provenance.processor.email.trim().toLowerCase())
        fail('C2B_NATIVE_RECEIPT_WRITER_READBACK_MISMATCH', receipt.receiptKey);
      return { ...outcome, observed: { ...outcome.observed,
        fields: { operation: 'CreateAfterStableRead', receipt: envelope.receipt } } };
    }
    return outcome;
  }

  public async reconcileReceiptActorRead(listId: string, effect: C2bCommandEffect, receipt: C2bTerminalReceipt,
    principals: IC2bTenantPrincipalBindings): Promise<C2bSharePointMutationOutcome> {
    this.assertAclMutationAuthority(principals);
    await this.assertProviderRoleDefinitions(principals);
    const record = await this.readItemByStableKey(listId, this.binding.fields.receiptKey, effect.naturalKey);
    if (!record) fail('C2B_NATIVE_RECEIPT_ACL_ITEM_ABSENT', effect.naturalKey);
    const receiptRecord = record as IC2bSharePointRecord;
    const actorAccess = (effect.desiredFields as { actorAccess?: { allowedPrincipals?: readonly { principalKey: string;
      permission: 'Read' | 'FullControl'; source: 'Processor' | 'Employee' | 'Manager' | 'Admin' }[] } }).actorAccess;
    if (!actorAccess || !Array.isArray(actorAccess.allowedPrincipals))
      fail('C2B_NATIVE_RECEIPT_ACL_IMAGE_INVALID', effect.naturalKey);
    const expectedAssignments = this.expectedReceiptAssignments(effect, principals);
    const endpoint = `${this.listUrl(listId)}/items(${receiptRecord.itemId})`;
    await this.replaceAclTransaction(endpoint, expectedAssignments, principals);
    return { outcome: 'Confirmed', providerReference: `list:${this.guid(listId)}:item:${receiptRecord.itemId}:acl`,
      observed: { ...receiptRecord, fields: { operation: 'GrantReceiptRead', receiptKey: receipt.receiptKey,
        receiptSha256: hashC2bCanonical(receipt), actorAccess: receipt.actorAccess } } };
  }

  public async readStableProof(_binding: IC2bTenantNativeBinding, journal: C2bCommandJournal):
  Promise<C2bStableReadProof> {
    const first = await this.canonicalObservation(journal);
    const second = await this.canonicalObservation(journal);
    if (canonicaliseC2b(first) !== canonicaliseC2b(second))
      fail('C2B_NATIVE_STABLE_READ_CHANGED', journal.plan.commandKey);
    return { first, second };
  }

  public async recoverExact(_binding: IC2bTenantNativeBinding, journal: C2bCommandJournal,
    effect: C2bCommandEffect): Promise<C2bNativeRecoveryResult> {
    const listPurpose = effect.target === 'AuthoritativeControlCase' ? 'ControlCases' : effect.target;
    const list = this.list(listPurpose);
    const keyField = effect.target === 'AuthoritativeControlCase' ? this.binding.fields.controlCaseKey
      : effect.target === 'CommandEffects' ? this.binding.fields.effectKey
        : effect.target === 'CommandReceipts' ? this.binding.fields.receiptKey
          : effect.target === 'Workplans' ? this.binding.fields.workplanKey
            : effect.target === 'WorkplanItems' ? this.binding.fields.workplanItemKey
              : effect.target === 'Audit' ? this.binding.fields.auditKey
                : fail('C2B_NATIVE_RECOVERY_TARGET_INVALID', effect.target);
    const lookupKey = effect.target === 'CommandEffects' ? effect.effectKey : effect.naturalKey;
    const record = await this.readItemByStableKey(list.listId, keyField, lookupKey);
    const confirmation: C2bEffectConfirmation = { providerReference: record
      ? `list:${this.guid(list.listId)}:item:${record.itemId}` : `list:${this.guid(list.listId)}:absent`,
    naturalKey: effect.naturalKey, requestETag: effect.expectedETag, observedETag: record?.etag || null,
    observedRowVersionToken: record?.rowVersionToken || null, readback: record?.fields || {} };
    if (!record) return { outcome: 'NotApplied', confirmation };
    if (effect.target === 'AuthoritativeControlCase') {
      const result = await this.controlCaseStore().recover(effect);
      return result === 'Applied' ? { outcome: 'Applied', confirmation }
        : result === 'NotApplied' ? { outcome: 'NotApplied', confirmation }
          : { outcome: 'StillUnknown', safeCode: 'C2B_NATIVE_RECOVERY_CONTROL_CASE_UNKNOWN' };
    }
    if ((effect.kind === 'Grant' || effect.kind === 'Revoke')
      && (effect.target === 'Workplans' || effect.target === 'WorkplanItems')) {
      await this.assertProviderRoleDefinitions(this.binding.principals);
      const rows = await this.readRoleAssignments(`${this.listUrl(list.listId)}/items(${record.itemId})`);
      if (this.assignmentsMatch(rows, this.expectedContainerAssignments(effect, this.binding.principals))) {
        return { outcome: 'Applied', confirmation: { ...confirmation,
          readback: { ...record.fields, AclReadback: rows } } };
      }
      return { outcome: 'StillUnknown', safeCode: 'C2B_NATIVE_RECOVERY_ACL_MISMATCH' };
    }
    if (effect.kind === 'ReceiptGrant' && effect.target === 'CommandReceipts') {
      await this.assertProviderRoleDefinitions(this.binding.principals);
      const rows = await this.readRoleAssignments(`${this.listUrl(list.listId)}/items(${record.itemId})`);
      if (this.assignmentsMatch(rows, this.expectedReceiptAssignments(effect, this.binding.principals))) {
        return { outcome: 'Applied', confirmation: { ...confirmation,
          readback: { ...record.fields, ReceiptAclReadback: rows } } };
      }
      return { outcome: 'StillUnknown', safeCode: 'C2B_NATIVE_RECOVERY_RECEIPT_ACL_MISMATCH' };
    }
    if (effect.target === 'CommandEffects') {
      try { if (canonicaliseC2b(deserialiseC2bEffectRow(record.fields, journal)) === canonicaliseC2b(effect))
        return { outcome: 'Applied', confirmation }; } catch { /* unknown */ }
    } else if (effect.target === 'CommandReceipts' && effect.kind === 'ReceiptCreate') {
      try {
        const e = deserialiseC2bTerminalReceiptRow(record.fields);
        const grant = journal.effects.find(candidate => candidate.kind === 'ReceiptGrant');
        const resultKeys = [journal.plan.subjectKey, ...journal.plan.intendedImage.items.map(item => item.naturalKey)].sort();
        const auditKeys = journal.effects.filter(candidate => candidate.kind === 'AuditAppend').map(candidate => candidate.naturalKey);
        if (e.receipt.receiptKey === effect.naturalKey && e.receipt.planSha256 === journal.plan.planSha256
          && e.receipt.payloadSha256 === journal.plan.payloadSha256
          && e.receipt.canonicalSha256 === journal.stableRead?.readbackSha256
          && canonicaliseC2b(e.receipt.resultKeys) === canonicaliseC2b(resultKeys)
          && canonicaliseC2b(e.receipt.auditKeys) === canonicaliseC2b(auditKeys)
          && canonicaliseC2b(e.receipt.actorAccess) === canonicaliseC2b(grant?.desiredFields.actorAccess)
          && record.authorPrincipalId === this.binding.principals.processorPrincipalId
          && record.editorPrincipalId === this.binding.principals.processorPrincipalId)
          return { outcome: 'Applied', confirmation: { ...confirmation, observedRowVersionToken: null,
            readback: { operation: 'CreateAfterStableRead', receipt: e.receipt } } };
      } catch { /* unknown */ }
    } else if (effect.target === 'Workplans' || effect.target === 'WorkplanItems' || effect.target === 'Audit') {
      try { this.assertFieldProjection(record.fields, effect.desiredFields, 'C2B_NATIVE_RECOVERY_READBACK_MISMATCH');
        return { outcome: 'Applied', confirmation }; } catch { /* unknown */ }
    }
    return { outcome: 'StillUnknown', safeCode: 'C2B_NATIVE_RECOVERY_READBACK_MISMATCH' };
  }

  private async readAuthoritativePlanningProjection(source: IC2bNativeSourceObservation):
  Promise<IC2bNativePlanningProjectionResult> {
    const proof: Array<{ slice: string; sha256: string }> = [];
    const admission = source.envelope;
    const command = admission?.binding;
    const sourcePurpose = source.route === 'Employee' ? 'EmployeeCommands' : 'ManagerCommands';
    if (admission?.schemaVersion !== 'kcf.kpi.test-command.v2' || !command
      || this.guid(source.source.listId) !== this.guid(this.list(sourcePurpose).listId)
      || source.source.itemVersion !== source.sourceRowVersion || source.source.itemId < 1
      || source.sourceETag === '*' || !nonBlank(source.sourceETag)) {
      return fail('C2B_NATIVE_PLANNING_SOURCE_INVALID', 'The admitted source is not the exact immutable TEST command row.');
    }
    const employeeRecord = await this.readPlanningUnique('People', 'PersonKey', command.personKey, proof);
    if (!employeeRecord) fail('C2B_NATIVE_PLANNING_EMPLOYEE_ABSENT', command.personKey);
    const employee = this.planningPerson(employeeRecord as IC2bSharePointRecord);
    if (!employee.active || !employee.roles.includes('Employee') || !nonBlank(employee.managerPersonKey))
      fail('C2B_NATIVE_PLANNING_EMPLOYEE_INVALID', command.personKey);
    const managerPersonKey = String(employee.managerPersonKey);
    const managerRecord = await this.readPlanningUnique('People', 'PersonKey', managerPersonKey, proof);
    if (!managerRecord) fail('C2B_NATIVE_PLANNING_MANAGER_ABSENT', String(employee.managerPersonKey));
    const manager = this.planningPerson(managerRecord as IC2bSharePointRecord);
    if (!manager.active || !manager.roles.includes('Manager') || manager.personKey !== employee.managerPersonKey
      || manager.email.trim().toLowerCase() !== String(employee.managerEmail).trim().toLowerCase())
      fail('C2B_NATIVE_PLANNING_MANAGER_INVALID', manager.personKey);
    let actor = source.route === 'Employee' ? employee : manager;
    if (command.commandType === 'CreateWorkplanAmendmentV2') {
      const actorRecord = await this.readPlanningUnique('People', 'Email', source.authorEmail.trim().toLowerCase(), proof);
      if (!actorRecord) fail('C2B_NATIVE_PLANNING_ACTOR_ABSENT', source.authorEmail);
      actor = this.planningPerson(actorRecord as IC2bSharePointRecord);
      if (!actor.active || !actor.roles.includes('SystemAdmin') || actor.personKey === employee.personKey)
        fail('C2B_NATIVE_PLANNING_ACTOR_INVALID', actor.personKey);
    } else if (source.route === 'Manager' && !['RequestWorkplanChanges', 'ApproveAndLockWorkplan'].includes(command.commandType)) {
      fail('C2B_NATIVE_PLANNING_ROUTE_UNSUPPORTED', command.commandType);
    }
    if (actor.email.trim().toLowerCase() !== source.authorEmail.trim().toLowerCase())
      fail('C2B_NATIVE_PLANNING_ACTOR_CROSSED', source.authorEmail);
    const configuration = Object.freeze({ schemaRevision: this.binding.planningAuthority.schemaRevision,
      performanceYear: command.performanceYear,
      behaviourContractVersion: this.binding.planningAuthority.behaviourContractVersion,
      ...(this.binding.planningAuthority.deliveryWeightConfiguration
        ? { deliveryWeightConfigurationAuthority: this.binding.planningAuthority.deliveryWeightConfiguration.authority } : {}),
      ...(this.binding.planningAuthority.behaviourCataloguePin
        ? { behaviourCataloguePin: this.binding.planningAuthority.behaviourCataloguePin } : {}),
      initialState: this.binding.planningAuthority.initialState,
      initialAccessState: this.binding.planningAuthority.initialAccessState,
      initialTransitionStatus: this.binding.planningAuthority.initialTransitionStatus,
      processorPrincipalKey: this.binding.planningAuthority.processorPrincipalKey,
      adminPrincipalKeys: [...this.binding.planningAuthority.adminPrincipalKeys] });
    const workplanKey = `${employee.personKey}|${command.performanceYear}`;
    if (command.workplanKey !== workplanKey)
      fail('C2B_NATIVE_PLANNING_WORKPLAN_KEY_CROSSED', command.workplanKey);
    const headerRecord = await this.readPlanningUnique('Workplans', this.binding.fields.workplanKey, workplanKey, proof);
    const header = headerRecord ? this.planningHeader(headerRecord, employee, manager, command.performanceYear) : undefined;
    if ((admission.expected.header.presence === 'Present') !== Boolean(header))
      fail('C2B_NATIVE_PLANNING_HEADER_PRESENCE_MISMATCH', workplanKey);
    const itemRecords = await this.readPlanningRecords('WorkplanItems',
      `WorkplanKey eq '${escapeOData(workplanKey)}'`, 'WorkplanItemNaturalKey', proof);
    const allItems = itemRecords.map(record => this.planningItem(record, workplanKey, employee.personKey,
      command.performanceYear)).sort((left, right) => left.workplanItemNaturalKey.localeCompare(right.workplanItemNaturalKey));
    if (new Set(allItems.map(item => item.workplanItemNaturalKey)).size !== allItems.length
      || new Set(allItems.map(item => item.workplanItemKey)).size !== allItems.length)
      fail('C2B_NATIVE_PLANNING_ITEM_DUPLICATE', workplanKey);
    const currentMatches = allItems.filter(item => item.workplanItemKey === command.subjectKey);
    if (currentMatches.length > 1) fail('C2B_NATIVE_PLANNING_CURRENT_ITEM_DUPLICATE', command.subjectKey);
    const currentItem = currentMatches[0];
    if (admission.expected.item.presence === 'Present' && !currentItem
      || admission.expected.item.presence === 'Absent' && currentItem)
      fail('C2B_NATIVE_PLANNING_ITEM_PRESENCE_MISMATCH', command.subjectKey);
    const containerKey = employee.personKey;
    const currentAcls: C2bListAclImage[] = [await this.readPlanningAcl('Workplans',
      headerRecord?.itemId, containerKey, employee, manager, proof)];
    if (command.subjectType === 'WorkplanItem') {
      const currentRecord = currentItem ? itemRecords.find(record => record.fields.WorkplanItemKey === currentItem.workplanItemKey) : undefined;
      currentAcls.push(await this.readPlanningAcl('WorkplanItems', currentRecord?.itemId,
        containerKey, employee, manager, proof));
    }
    const controlCases = [];
    if (command.commandType === 'CreateWorkplanAmendmentV2') {
      const controlReference = (admission.payload as { controlReference?: unknown }).controlReference;
      if (!nonBlank(controlReference)) fail('C2B_NATIVE_PLANNING_CONTROL_REFERENCE_INVALID', command.commandKey);
      const exactControlReference = String(controlReference);
      const first = await this.controlCaseStore().readExact(exactControlReference);
      const second = await this.controlCaseStore().readExact(exactControlReference);
      if (!first || canonicaliseC2b(first) !== canonicaliseC2b(second))
        fail('C2B_NATIVE_PLANNING_CONTROL_CASE_UNSTABLE', exactControlReference);
      const exactControlCase = first as NonNullable<typeof first>;
      controlCases.push(exactControlCase);
      proof.push({ slice: 'ControlCases', sha256: hashC2bCanonical(exactControlCase) });
    }
    const catalogueItem = command.commandType === 'UpsertCoreContributionV2'
      ? await this.readPlanningCoreCatalogue(admission.payload, command.performanceYear, proof) : undefined;
    const annualDecision = command.commandType === 'SubmitWorkplan' || command.commandType === 'ApproveAndLockWorkplan';
    const delivery = annualDecision && configuration.behaviourContractVersion === 'KCCC-BEHAVIOUR|v02'
      ? await this.readPlanningDeliveryWeightConfiguration(proof) : undefined;
    const decisionBehaviour = annualDecision && configuration.behaviourContractVersion === 'KCCC-BEHAVIOUR|v02'
      ? await this.readPlanningBehaviour(employee.personKey, proof) : undefined;
    const readiness = annualDecision
      ? this.planningReadiness(header, allItems, command.commandType === 'SubmitWorkplan', delivery, decisionBehaviour) : undefined;
    const behaviourV2 = (command.commandType as string) === 'UpsertBehaviourCommitmentV2'
      ? await this.readPlanningBehaviour(employee.personKey, proof) : undefined;
    const observations: IC2bNativePlanningObservations = {
      employee, manager, actor, configuration, ...(header ? { header } : {}),
      ...(currentItem ? { currentItem } : {}), allItems, currentAcls,
      ...(behaviourV2 ? { behaviourV2 } : {}),
      ...(catalogueItem ? { catalogueItem } : {}), ...(readiness ? { readiness } : {}),
      ...(admission.expected.item.presence === 'Absent' ? { allocatedItemKey: command.subjectKey } : {}), controlCases
    };
    return { observations, provenanceSha256: hashC2bCanonical(proof) };
  }

  private async readPlanningRecords(purpose: IC2bTenantNativeBinding['lists'][number]['purpose'], filter: string | undefined,
    orderBy: string | undefined, proof: Array<{ slice: string; sha256: string }>, top = 200): Promise<IC2bSharePointRecord[]> {
    const query = [`$select=*,OData__UIVersionString,AuthorId,EditorId,Author/EMail`, '$expand=Author',
      ...(filter ? [`$filter=${encodeURIComponent(filter)}`] : []), ...(orderBy ? [`$orderby=${orderBy}`] : []), `$top=${top}`].join('&');
    const url = `${this.listUrl(this.list(purpose).listId)}/items?${query}`;
    const first = await this.readAll<ISharePointRow>(url);
    const second = await this.readAll<ISharePointRow>(url);
    if (canonicaliseC2b(first) !== canonicaliseC2b(second))
      fail('C2B_NATIVE_PLANNING_SLICE_TOCTOU', purpose);
    proof.push({ slice: `${purpose}:${filter || 'all'}:${orderBy || 'provider'}`, sha256: hashC2bCanonical(first) });
    return first.map(row => this.record(row));
  }

  private async readPlanningUnique(purpose: IC2bTenantNativeBinding['lists'][number]['purpose'], field: string,
    value: string, proof: Array<{ slice: string; sha256: string }>): Promise<IC2bSharePointRecord | undefined> {
    this.field(field);
    const rows = await this.readPlanningRecords(purpose, `${field} eq '${escapeOData(value)}'`, undefined, proof, 2);
    if (rows.length > 1) fail('C2B_NATIVE_PLANNING_UNIQUE_KEY_DUPLICATE', `${purpose}.${field}`);
    return rows[0];
  }

  private planningPerson(record: IC2bSharePointRecord): C2bTrustedPerson {
    const choice = (value: unknown): C2bControlledRole[] => {
      const raw = Array.isArray(value) ? value : value && typeof value === 'object'
        ? (value as { results?: unknown }).results : undefined;
      if (!Array.isArray(raw) || raw.some(item => typeof item !== 'string'))
        fail('C2B_NATIVE_PLANNING_PERSON_ROLES_INVALID', String(record.fields.PersonKey || 'unknown'));
      return Array.from(new Set(raw as C2bControlledRole[]));
    };
    const managerPersonKey = nonBlank(record.fields.ManagerPersonKey) ? String(record.fields.ManagerPersonKey) : null;
    const managerEmail = nonBlank(record.fields.ManagerEmail) ? String(record.fields.ManagerEmail).trim().toLowerCase() : null;
    const person: C2bTrustedPerson = { personKey: String(record.fields.PersonKey || ''),
      email: String(record.fields.Email || '').trim().toLowerCase(), displayName: String(record.fields.Title || ''),
      active: record.fields.Active === true, roles: choice(record.fields.AppRoles), managerPersonKey, managerEmail };
    assertC2bControlledPerson(person);
    return person;
  }

  private planningHeader(record: IC2bSharePointRecord, employee: C2bTrustedPerson, manager: C2bTrustedPerson,
    performanceYear: number): C2bTrustedWorkplanHeader {
    const allowed = new Set<string>([...C2B_DIRECT_PHYSICAL_FIELDS.Workplans, 'EmployeeDisplayName', 'EmployeeEmail',
      'ManagerPersonKey', 'ManagerDisplayName', 'ManagerEmail', 'TransitionCorrelationKey',
      'BehaviourContractVersion', 'SchemaRevision', 'RowVersionToken']);
    const fields = Object.keys(record.fields).filter(key => allowed.has(key)).reduce<Record<string, unknown>>((result, key) => {
      result[key] = record.fields[key]; return result;
    }, {});
    if (!nonBlank(record.itemVersion) || fields.WorkplanKey !== `${employee.personKey}|${performanceYear}`
      || fields.PersonKey !== employee.personKey || fields.PerformanceYear !== performanceYear
      || fields.ManagerPersonKey !== manager.personKey
      || String(fields.ManagerEmail || '').trim().toLowerCase() !== manager.email.trim().toLowerCase()
      || fields.RowVersionToken !== record.rowVersionToken
      || !['Draft', 'ChangesRequested', 'Submitted', 'Approved', 'Locked'].includes(String(fields.State))
      || !['EmployeeEdit', 'ManagerDecision', 'ReadOnly'].includes(String(fields.AccessState))
      || fields.TransitionStatus !== 'Ready') fail('C2B_NATIVE_PLANNING_HEADER_INVALID', String(fields.WorkplanKey));
    return { workplanKey: String(fields.WorkplanKey), personKey: employee.personKey, performanceYear,
      etag: record.etag, rowVersionToken: record.rowVersionToken,
      state: fields.State as C2bTrustedWorkplanHeader['state'],
      accessState: fields.AccessState as C2bTrustedWorkplanHeader['accessState'], transitionStatus: 'Ready',
      fields: Object.freeze(fields) };
  }

  private planningItem(record: IC2bSharePointRecord, workplanKey: string, personKey: string,
    performanceYear: number): C2bTrustedAnnualItem {
    const allowed = new Set<string>([...C2B_DIRECT_PHYSICAL_FIELDS.WorkplanItems, 'RowVersionToken']);
    const fields = Object.keys(record.fields).filter(key => allowed.has(key)).reduce<Record<string, unknown>>((result, key) => {
      result[key] = record.fields[key]; return result;
    }, {});
    if (!nonBlank(record.itemVersion) || !nonBlank(fields.WorkplanItemKey) || !nonBlank(fields.WorkplanItemNaturalKey)
      || fields.WorkplanKey !== workplanKey || fields.PersonKey !== personKey || fields.PerformanceYear !== performanceYear
      || !['CoreGold', 'LocalPersonal', 'Behaviour'].includes(String(fields.ItemType))
      || typeof fields.ActiveInWorkplan !== 'boolean' || fields.RowVersionToken !== record.rowVersionToken)
      fail('C2B_NATIVE_PLANNING_ITEM_INVALID', String(fields.WorkplanItemNaturalKey));
    return { workplanItemKey: String(fields.WorkplanItemKey),
      workplanItemNaturalKey: String(fields.WorkplanItemNaturalKey), workplanKey, personKey, performanceYear,
      itemType: fields.ItemType as C2bTrustedAnnualItem['itemType'], activeInWorkplan: fields.ActiveInWorkplan as boolean,
      etag: record.etag, rowVersionToken: record.rowVersionToken, fields: Object.freeze(fields) };
  }

  private async readPlanningAcl(purpose: 'Workplans' | 'WorkplanItems', itemId: number | undefined,
    containerKey: string, employee: C2bTrustedPerson, manager: C2bTrustedPerson,
    proof: Array<{ slice: string; sha256: string }>): Promise<C2bListAclImage> {
    const endpoint = itemId ? `${this.listUrl(this.list(purpose).listId)}/items(${itemId})`
      : this.listUrl(this.list(purpose).listId);
    const readOnce = async (): Promise<{ unique: boolean; rows: IRoleAssignmentRow[] }> => {
      const identity = await this.get(`${endpoint}?$select=HasUniqueRoleAssignments`);
      const state = await identity!.json() as { HasUniqueRoleAssignments?: unknown };
      const rows = await this.readRoleAssignments(endpoint);
      if (typeof state.HasUniqueRoleAssignments !== 'boolean') fail('C2B_NATIVE_PLANNING_ACL_STATE_INVALID', purpose);
      return { unique: state.HasUniqueRoleAssignments as boolean, rows };
    };
    const first = await readOnce(); const second = await readOnce();
    if (canonicaliseC2b(first) !== canonicaliseC2b(second)) fail('C2B_NATIVE_PLANNING_ACL_TOCTOU', purpose);
    proof.push({ slice: `${purpose}:acl:${itemId || 'list'}`, sha256: hashC2bCanonical(first) });
    if (!first.unique) fail('C2B_NATIVE_PLANNING_ACL_INHERITED', purpose);
    const grants = first.rows.flatMap(row => (row.RoleDefinitionBindings || []).map(role => ({ row, role })));
    const allowedPrincipals = grants.map(({ row, role }) => {
      const principal = this.binding.principals.principalKeyBindings.find(item => item.principalId === row.PrincipalId);
      const roleDefinition = this.binding.principals.roleDefinitions.find(item => item.roleId === role.Id);
      if (!principal) fail('C2B_NATIVE_PLANNING_ACL_AUTHORITY_UNKNOWN', `${row.PrincipalId}:${role.Id}`);
      const exactPrincipal = principal as NonNullable<typeof principal>;
      if (!roleDefinition || role.Name !== roleDefinition.name
        || String(role.BasePermissions?.High) !== roleDefinition.basePermissionsHigh
        || String(role.BasePermissions?.Low) !== roleDefinition.basePermissionsLow)
        fail('C2B_NATIVE_PLANNING_ACL_AUTHORITY_UNKNOWN', `${row.PrincipalId}:${role.Id}`);
      const isProcessor = exactPrincipal.category === 'Processor' && role.Id === this.binding.principals.processorRoleId;
      const isAdmin = exactPrincipal.category === 'Administrator' && role.Id === this.binding.principals.administratorRoleId;
      const isEmployee = exactPrincipal.category === 'Actor' && exactPrincipal.principalKey === employee.personKey
        && role.Id === this.binding.principals.actorReadRoleId;
      const isManager = exactPrincipal.category === 'Actor' && exactPrincipal.principalKey === manager.personKey
        && role.Id === this.binding.principals.actorReadRoleId;
      if (!isProcessor && !isAdmin && !isEmployee && !isManager)
        fail('C2B_NATIVE_PLANNING_ACL_PRINCIPAL_UNKNOWN', exactPrincipal.principalKey);
      return { principalKey: exactPrincipal.principalKey, permission: isProcessor || isAdmin ? 'FullControl' as const : 'Read' as const,
        source: isProcessor ? 'Processor' as const : isAdmin ? 'Admin' as const
          : isManager ? 'Manager' as const : 'Employee' as const };
    }).sort((left, right) => left.principalKey.localeCompare(right.principalKey));
    if (new Set(allowedPrincipals.map(item => item.principalKey)).size !== allowedPrincipals.length)
      fail('C2B_NATIVE_PLANNING_ACL_PRINCIPAL_DUPLICATE', purpose);
    return { listPurpose: purpose, acl: { containerKey, breaksInheritanceAtContainer: true,
      canonicalChildrenInherit: true, allowedPrincipals, revokedPrincipalKeys: [] } };
  }

  private coreListUrl(listId: string): string {
    const normal = this.guid(listId);
    const allowed = [this.guid(this.binding.planningAuthority.coreKpiMasterListId),
      this.guid(this.binding.planningAuthority.coreAnnualTargetsListId)];
    if (!allowed.includes(normal)) fail('C2B_NATIVE_CORE_LIST_ID_UNBOUND', normal);
    return `${this.siteUrl}/_api/web/lists(guid'${normal}')`;
  }

  private async readCoreListIdentity(listId: string, expectedTitle: string,
    proof: Array<{ slice: string; sha256: string }>): Promise<void> {
    const url = `${this.coreListUrl(listId)}?$select=Id,Title`;
    const firstResponse = await this.get(url); const first = await firstResponse!.json() as { Id?: unknown; Title?: unknown };
    const secondResponse = await this.get(url); const second = await secondResponse!.json() as { Id?: unknown; Title?: unknown };
    if (canonicaliseC2b(first) !== canonicaliseC2b(second)
      || this.guid(String(first.Id || '')) !== this.guid(listId) || first.Title !== expectedTitle)
      fail('C2B_NATIVE_CORE_LIST_IDENTITY_MISMATCH', expectedTitle);
    proof.push({ slice: `CoreIdentity:${expectedTitle}`, sha256: hashC2bCanonical(first) });
  }

  private async readCoreRows(listId: string, select: string, filter: string,
    proof: Array<{ slice: string; sha256: string }>): Promise<ISharePointRow[]> {
    const url = `${this.coreListUrl(listId)}/items?$select=${select}&$filter=${encodeURIComponent(filter)}`
      + '&$orderby=KPIID&$top=2';
    const first = await this.readAll<ISharePointRow>(url); const second = await this.readAll<ISharePointRow>(url);
    if (canonicaliseC2b(first) !== canonicaliseC2b(second))
      fail('C2B_NATIVE_CORE_CATALOGUE_TOCTOU', filter);
    const requiredFields = select.split(',');
    if (first.some(row => requiredFields.some(field => !Object.prototype.hasOwnProperty.call(row, field))))
      fail('C2B_NATIVE_CORE_CATALOGUE_FIELD_ABSENT', filter);
    proof.push({ slice: `CoreRows:${this.guid(listId)}:${filter}`, sha256: hashC2bCanonical(first) });
    return first;
  }

  private async readPlanningCoreCatalogue(payload: object, performanceYear: number,
    proof: Array<{ slice: string; sha256: string }> ):
  Promise<NonNullable<IC2bNativePlanningObservations['catalogueItem']>> {
    const kpiId = (payload as { kpiId?: unknown }).kpiId;
    if (!nonBlank(kpiId) || !nonBlank(this.binding.planningAuthority.coreCatalogueProviderReference))
      return fail('C2B_NATIVE_CORE_CATALOGUE_QUERY_INVALID', String(kpiId || 'absent'));
    const kpiListId = this.binding.planningAuthority.coreKpiMasterListId;
    const targetListId = this.binding.planningAuthority.coreAnnualTargetsListId;
    await this.readCoreListIdentity(kpiListId, 'KCFKPI_KPIMaster', proof);
    await this.readCoreListIdentity(targetListId, 'KCFKPI_AnnualTargets', proof);
    const kpis = await this.readCoreRows(kpiListId, KPI_MASTER_CATALOGUE_SELECT,
      `DefinitionStatus eq 'Active' and IsCurrent eq 1 and KPIID eq '${escapeOData(kpiId)}'`, proof);
    const targets = await this.readCoreRows(targetListId, ANNUAL_TARGET_CATALOGUE_SELECT,
      `PerformanceYear eq ${performanceYear} and TargetStatus eq 'Approved' and IsCurrent eq 1 and KPIID eq '${escapeOData(kpiId)}'`, proof);
    if (kpis.length !== 1 || targets.length !== 1 || kpis[0].KPIID !== kpiId || targets[0].KPIID !== kpiId)
      fail('C2B_NATIVE_CORE_CATALOGUE_AMBIGUOUS', kpiId);
    const governance = this.parsePlanningJson(kpis[0].RAGParametersJSON,
      'C2B_NATIVE_CORE_GOVERNANCE_INVALID') as Record<string, unknown>;
    if (typeof governance.directContributionEligible !== 'boolean'
      || typeof governance.additiveEligible !== 'boolean' || typeof governance.nonOverlapRequired !== 'boolean')
      fail('C2B_NATIVE_CORE_GOVERNANCE_INVALID', kpiId);
    const result = { kpiId, kpiVersionKey: String(kpis[0].KPIVersionKey || ''),
      targetVersionKey: String(targets[0].TargetVersionKey || ''), performanceYear, active: true, approved: true,
      contributionUnit: String(kpis[0].UnitLabel || ''),
      directContributionEligible: governance.directContributionEligible as boolean,
      additiveEligible: governance.additiveEligible as boolean,
      nonOverlapRequired: governance.nonOverlapRequired as boolean };
    if (!nonBlank(result.kpiVersionKey) || !nonBlank(result.targetVersionKey) || !nonBlank(result.contributionUnit))
      fail('C2B_NATIVE_CORE_GOVERNANCE_INVALID', kpiId);
    proof.push({ slice: `CoreProvider:${this.binding.planningAuthority.coreCatalogueProviderReference}`,
      sha256: hashC2bCanonical(result) });
    return result;
  }

  private async readPlanningDeliveryWeightConfiguration(proof: Array<{ slice: string; sha256: string }>):
  Promise<{ snapshot: Readonly<IDeliveryWeightConfigurationSnapshot>; sha256: string }> {
    const binding = this.binding.planningAuthority.deliveryWeightConfiguration;
    if (!binding) fail('C2B_NATIVE_PD01_CONFIGURATION_BINDING_ABSENT', 'Governed Delivery configuration is not physically bound.');
    const exact = binding!;
    const listId = this.guid(exact.listId);
    const listUrl = `${this.siteUrl}/_api/web/lists(guid'${listId}')`;
    const identityUrl = `${listUrl}?$select=Id,Title`;
    const firstResponse = await this.get(identityUrl, true);
    if (!firstResponse) fail('C2B_NATIVE_PD01_LIST_ABSENT', exact.listTitle);
    const firstIdentity = await firstResponse!.json() as { Id?: unknown; Title?: unknown };
    const secondResponse = await this.get(identityUrl, true);
    if (!secondResponse) fail('C2B_NATIVE_PD01_LIST_ABSENT', exact.listTitle);
    const secondIdentity = await secondResponse!.json() as { Id?: unknown; Title?: unknown };
    if (canonicaliseC2b(firstIdentity) !== canonicaliseC2b(secondIdentity)
      || this.guid(String(firstIdentity.Id || '')) !== listId || firstIdentity.Title !== exact.listTitle)
      fail('C2B_NATIVE_PD01_LIST_IDENTITY_INVALID', exact.listTitle);
    const url = `${listUrl}/items?$select=*,OData__UIVersionString&$filter=${encodeURIComponent(
      `ConfigurationID eq '${escapeOData(exact.authority.configurationId)}' and IsCurrent eq 1`)}&$top=2`;
    const first = await this.readAll<ISharePointRow>(url);
    const second = await this.readAll<ISharePointRow>(url);
    if (canonicaliseC2b(first) !== canonicaliseC2b(second) || first.length !== 1)
      fail('C2B_NATIVE_PD01_CONFIGURATION_UNSTABLE', exact.authority.configurationId);
    const row = first[0];
    const required = ['Schema', 'Immutable', 'Published', 'ConfigurationID', 'Version', 'ApprovalReference',
      'ContentSHA256', 'EffectiveFrom', 'PublishedAt', 'PublishedBy', 'ChangeReference',
      'DefaultCoreWeight', 'DefaultImpactWeight', 'ActiveCoreWeight', 'ActiveImpactWeight', 'IsCurrent'];
    if (required.some(field => !Object.prototype.hasOwnProperty.call(row, field))
      || !nonBlank(row['@odata.etag']) || row.IsCurrent !== true)
      fail('C2B_NATIVE_PD01_CONFIGURATION_INCOMPLETE', exact.authority.configurationId);
    const effectiveFrom = String(row.EffectiveFrom || '');
    if (!/^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(effectiveFrom))
      fail('C2B_NATIVE_PD01_EFFECTIVE_DATE_INVALID', exact.authority.configurationId);
    const contract: IGovernedDeliveryWeightConfigurationContract = {
      schema: row.Schema as IGovernedDeliveryWeightConfigurationContract['schema'],
      immutable: row.Immutable as true, published: row.Published as true,
      authority: { configurationId: String(row.ConfigurationID), version: String(row.Version),
        etag: String(row['@odata.etag']), approvalReference: row.ApprovalReference as 'KCF-KPI-Sponsor-PD-01',
        contentSha256: String(row.ContentSHA256), effectiveFrom: effectiveFrom.slice(0, 10),
        publishedAt: String(row.PublishedAt), publishedBy: String(row.PublishedBy),
        changeReference: String(row.ChangeReference) },
      defaultWeights: { core: row.DefaultCoreWeight as number, impact: row.DefaultImpactWeight as number },
      activeWeights: { core: row.ActiveCoreWeight as number, impact: row.ActiveImpactWeight as number }
    };
    const content = { schema: contract.schema, immutable: contract.immutable, published: contract.published,
      configurationId: contract.authority.configurationId, version: contract.authority.version,
      approvalReference: contract.authority.approvalReference, effectiveFrom: contract.authority.effectiveFrom,
      publishedAt: contract.authority.publishedAt, publishedBy: contract.authority.publishedBy,
      changeReference: contract.authority.changeReference, defaultWeights: contract.defaultWeights,
      activeWeights: contract.activeWeights };
    if (hashC2bCanonical(content).toUpperCase() !== contract.authority.contentSha256.toUpperCase())
      fail('C2B_NATIVE_PD01_CONTENT_HASH_INVALID', exact.authority.configurationId);
    if (!Number.isFinite(Date.parse(contract.authority.publishedAt))
      || Date.parse(contract.authority.publishedAt) > Date.now())
      fail('C2B_NATIVE_PD01_PUBLICATION_TIME_INVALID', exact.authority.configurationId);
    if (hashC2bCanonical(contract.authority) !== hashC2bCanonical(exact.authority))
      fail('C2B_NATIVE_PD01_AUTHORITY_STALE', exact.authority.configurationId);
    const snapshot = resolveGovernedDeliveryWeightConfiguration(contract, contract.authority, new Date());
    const sha256 = hashC2bCanonical({ identity: firstIdentity, contract, content });
    proof.push({ slice: `DeliveryPD01:${listId}:${contract.authority.version}`, sha256 });
    return { snapshot, sha256 };
  }

  private planningReadiness(header: C2bTrustedWorkplanHeader | undefined, items: readonly C2bTrustedAnnualItem[],
    requireEditableDraft: boolean,
    delivery?: { snapshot: Readonly<IDeliveryWeightConfigurationSnapshot>; sha256: string },
    behaviour?: NonNullable<IC2bNativePlanningObservations['behaviourV2']>):
  NonNullable<IC2bNativePlanningObservations['readiness']> {
    if (!header) fail('C2B_NATIVE_READINESS_HEADER_ABSENT', 'readiness');
    const exactHeader = header as C2bTrustedWorkplanHeader;
    const v02 = exactHeader.fields.BehaviourContractVersion === 'KCCC-BEHAVIOUR|v02';
    if (v02 && (!delivery || !behaviour || this.binding.planningAuthority.behaviourContractVersion !== 'KCCC-BEHAVIOUR|v02'))
      fail('C2B_NATIVE_READINESS_V02_AUTHORITY_ABSENT', exactHeader.workplanKey);
    const workplan: IAnnualWorkplan = { id: 1, etag: exactHeader.etag, workplanKey: exactHeader.workplanKey,
      personKey: exactHeader.personKey, employeeDisplayName: String(exactHeader.fields.EmployeeDisplayName || ''),
      employeeEmail: String(exactHeader.fields.EmployeeEmail || ''), performanceYear: exactHeader.performanceYear,
      managerPersonKey: String(exactHeader.fields.ManagerPersonKey || ''),
      managerDisplayName: String(exactHeader.fields.ManagerDisplayName || ''), managerEmail: String(exactHeader.fields.ManagerEmail || ''),
      state: exactHeader.state, accessState: exactHeader.accessState, transitionStatus: exactHeader.transitionStatus,
      coreCategoryWeight: Number(exactHeader.fields.CoreCategoryWeight || 0),
      personalCategoryWeight: Number(exactHeader.fields.PersonalCategoryWeight || 0),
      behaviourCategoryWeight: Number(exactHeader.fields.BehaviourCategoryWeight || 0),
      categoryWeightReason: nonBlank(exactHeader.fields.CategoryWeightingReason)
        ? String(exactHeader.fields.CategoryWeightingReason) : undefined, rowVersionToken: exactHeader.rowVersionToken };
    const base = (item: C2bTrustedAnnualItem): { id: number; etag: string; workplanItemKey: string; naturalKey: string;
      workplanKey: string; personKey: string; performanceYear: number; displayOrder: number; activeInWorkplan: boolean } => ({
      id: 1, etag: item.etag, workplanItemKey: item.workplanItemKey, naturalKey: item.workplanItemNaturalKey,
      workplanKey: item.workplanKey, personKey: item.personKey, performanceYear: item.performanceYear,
      displayOrder: Number(item.fields.DisplayOrder), activeInWorkplan: item.activeInWorkplan });
    const coreItems: ICoreWorkplanItem[] = items.filter(item => item.itemType === 'CoreGold').map(item => ({ ...base(item),
      kpiId: String(item.fields.KPIID || ''), kpiVersionKey: String(item.fields.KPIVersionKey || ''),
      targetVersionKey: String(item.fields.TargetVersionKey || ''), coreWorkplanWeight: Number(item.fields.CoreWorkplanWeight),
      employeeKpiRole: item.fields.EmployeeKpiRole as ICoreWorkplanItem['employeeKpiRole'] }));
    const personalItems: IPersonalWorkplanItem[] = items.filter(item => item.itemType === 'LocalPersonal').map(item => ({
      ...base(item), wording: String(item.fields.LocalKPIWording || ''), description: String(item.fields.LocalKPIDescription || ''),
      measure: String(item.fields.LocalMeasure || ''), measureType: item.fields.LocalMetricType as IPersonalWorkplanItem['measureType'],
      scoringDirection: item.fields.LocalScoringDirection as IPersonalWorkplanItem['scoringDirection'],
      percentageSourceScale: item.fields.LocalPercentageScale as IPersonalWorkplanItem['percentageSourceScale'],
      baselineValue: item.fields.LocalBaselineValue as number | undefined,
      yearEndTargetValue: item.fields.YearEndTargetValue as number | undefined,
      yearEndTargetText: item.fields.YearEndTargetText as string | undefined,
      q1TargetValue: item.fields.Q1TargetValue as number | undefined, q1TargetText: item.fields.Q1TargetText as string | undefined,
      q2TargetValue: item.fields.Q2TargetValue as number | undefined, q2TargetText: item.fields.Q2TargetText as string | undefined,
      q3TargetValue: item.fields.Q3TargetValue as number | undefined, q3TargetText: item.fields.Q3TargetText as string | undefined,
      q4TargetValue: item.fields.Q4TargetValue as number | undefined, q4TargetText: item.fields.Q4TargetText as string | undefined,
      unitLabel: String(item.fields.UnitLabel || ''), personalItemWeight: item.fields.PersonalItemWeight as number | undefined }));
    const behaviourItems: IBehaviourWorkplanItem[] = items.filter(item => item.itemType === 'Behaviour').map(item => {
      const version = item.fields.BehaviourFrameworkVersion;
      if (v02 && item.activeInWorkplan && version !== 'KCCC-BEHAVIOUR|v02')
        fail('C2B_NATIVE_READINESS_BEHAVIOUR_VERSION_MIXED', String(item.fields.BehaviourID));
      if (!v02 && item.activeInWorkplan && version === 'KCCC-BEHAVIOUR|v02')
        fail('C2B_NATIVE_READINESS_BEHAVIOUR_VERSION_MIXED', String(item.fields.BehaviourID));
      if (!item.activeInWorkplan || !v02 || version !== 'KCCC-BEHAVIOUR|v02') return { ...base(item), behaviourId: String(item.fields.BehaviourID || ''),
        behaviourVersionKey: String(item.fields.BehaviourVersionKey || ''),
        behaviourItemWeight: item.fields.BehaviourItemWeight as number | undefined };
      const periodRows = this.parsePlanningJson(item.fields.BehaviourPeriodCommitmentsV2JSON,
        'C2B_NATIVE_READINESS_BEHAVIOUR_INVALID') as Array<{ period: string; commitment: string }>;
      if (!Array.isArray(periodRows) || periodRows.some(row => !row || !nonBlank(row.period) || !nonBlank(row.commitment)))
        fail('C2B_NATIVE_READINESS_BEHAVIOUR_PERIOD_INVALID', String(item.fields.BehaviourID));
      const periodCommitments = Object.fromEntries(periodRows.map(entry => [entry.period, entry.commitment]));
      const planningLevels = readBehaviourPlanningLevelsV1(item.fields);
      const selectionSnapshots = decodeBehaviourSelectionSnapshotsV2(
        String(item.fields.BehaviourV2SelectionSnapshotsJSON || ''),
        String(item.fields.BehaviourV2SelectionSnapshotsSHA256 || ''),
        Number(item.fields.BehaviourV2SelectionSnapshotsUtf8ByteLength));
      const selectedKeys = this.parsePlanningJson(item.fields.BehaviourV2SelectedSuggestionKeysJSON,
        'C2B_NATIVE_READINESS_BEHAVIOUR_SELECTION_INVALID');
      if (!Array.isArray(selectedKeys) || selectedKeys.some(key => !nonBlank(key))
        || selectionSnapshots.valueId !== item.fields.BehaviourID
        || canonicaliseC2b(selectedKeys) !== canonicaliseC2b(selectionSnapshots.selections
          .filter(row => row.source === 'Catalogue').map(row => row.selectionKey)))
        fail('C2B_NATIVE_READINESS_BEHAVIOUR_SELECTION_CROSSED', String(item.fields.BehaviourID));
      const focus = behaviour!.focusCatalogue;
      if (!focus || selectionSnapshots.selections.some(selection => {
        if (selection.source === 'Own') return false;
        const matches = focus.rows.filter(row => row.targetKey === selection.targetKey);
        return matches.length !== 1 || matches[0].effectiveStatus !== 'Published'
          || selection.catalogueKey !== focus.catalogueKey
          || selection.catalogueVersion !== focus.catalogueVersion
          || selection.catalogueRevision !== focus.revision
          || matches[0].behaviourKey !== selection.behaviourKey
          || matches[0].roleLevelCode !== selection.roleLevelCode
          || matches[0].focusKey !== selection.focusKey
          || matches[0].focusArea !== selection.focusArea
          || matches[0].suggestedTarget !== selection.selectedExampleText;
      })) fail('C2B_NATIVE_READINESS_BEHAVIOUR_FOCUS_STALE', String(item.fields.BehaviourID));
      const published = createBehaviourAnnualSnapshotV2(behaviour!.framework, behaviour!.assignment,
        String(item.fields.BehaviourID) as never);
      const storedSnapshot = { frameworkVersion: version, valueId: item.fields.BehaviourID,
        valueTitle: item.fields.BehaviourValueTitleSnapshot,
        corporateValue: item.fields.BehaviourCorporateValueSnapshot,
        roleTier: item.fields.BehaviourRoleTierSnapshot, descriptor: item.fields.BehaviourDescriptorSnapshot,
        cadence: item.fields.BehaviourCadenceSnapshot,
        periodKeys: this.parsePlanningJson(item.fields.BehaviourPeriodKeysSnapshotJSON,
          'C2B_NATIVE_READINESS_BEHAVIOUR_INVALID'),
        ratingOptions: this.parsePlanningJson(item.fields.BehaviourRatingLabelsSnapshotJSON,
          'C2B_NATIVE_READINESS_BEHAVIOUR_INVALID') };
      if (canonicaliseC2b(storedSnapshot) !== canonicaliseC2b(published))
        fail('C2B_NATIVE_READINESS_BEHAVIOUR_PUBLICATION_CROSSED', String(item.fields.BehaviourID));
      return { ...base(item), behaviourId: String(item.fields.BehaviourID || ''),
        behaviourVersionKey: String(item.fields.BehaviourVersionKey || ''), behaviourSnapshotV2: published,
        behaviourCommitmentV2: String(item.fields.BehaviourCommitmentV2 || ''),
        behaviourPlanningLevelsV1: planningLevels, behaviourPeriodCommitmentsV2: periodCommitments,
        behaviourSelectionSnapshotsV2: selectionSnapshots,
        behaviourSelectionSnapshotsSha256: String(item.fields.BehaviourV2SelectionSnapshotsSHA256),
        behaviourSelectionSnapshotsUtf8ByteLength: Number(item.fields.BehaviourV2SelectionSnapshotsUtf8ByteLength),
        selectedSuggestionKeys: selectedKeys as string[] };
    });
    const result = evaluateAnnualSubmissionReadiness(workplan, coreItems, personalItems, [], behaviourItems, requireEditableDraft);
    const blockers = [...result.blockers];
    if (v02 && (!delivery || !behaviour || items.filter(item => item.itemType === 'Behaviour' && item.activeInWorkplan).length !== 5))
      blockers.push('The complete published Behaviour v02 and governed Delivery configuration are required.');
    if (v02 && [exactHeader.fields.CoreCategoryWeight, exactHeader.fields.PersonalCategoryWeight,
      exactHeader.fields.BehaviourCategoryWeight].some(value => value !== undefined && value !== null))
      blockers.push('Legacy 70/20/10 category weights cannot be carried on a Behaviour v02 Workplan.');
    const sorted = items.map(item => ({ naturalKey: item.workplanItemNaturalKey, fields: item.fields }))
      .sort((left, right) => left.naturalKey.localeCompare(right.naturalKey));
    const itemIdentities = items.map(item => ({ naturalKey: item.workplanItemNaturalKey,
      etag: item.etag, rowVersionToken: item.rowVersionToken }))
      .sort((left, right) => left.naturalKey.localeCompare(right.naturalKey));
    return { complete: blockers.length === 0, blockerCodes: blockers, pagingComplete: true,
      behaviourContractVersion: this.binding.planningAuthority.behaviourContractVersion,
      sourceHeaderSha256: hashC2bCanonical(exactHeader.fields), sourceItemsSha256: hashC2bCanonical(sorted),
      ...(v02 ? { sourceHeaderETag: exactHeader.etag,
        sourceItemsIdentitySha256: hashC2bCanonical(itemIdentities) } : {}),
      ...(delivery ? { deliveryWeightConfigurationSha256: delivery.sha256 } : {}),
      ...(behaviour ? { behaviourPublicationSha256: hashC2bCanonical(behaviour) } : {}) };
  }

  private async readPlanningBehaviour(personKey: string, proof: Array<{ slice: string; sha256: string }> ):
  Promise<NonNullable<IC2bNativePlanningObservations['behaviourV2']>> {
    const version = this.binding.planningAuthority.behaviourContractVersion;
    const setRows = await this.readPlanningRecords('BehaviourFrameworkSets',
      `FrameworkVersion eq '${escapeOData(version)}' and Current eq 1`, undefined, proof, 2);
    if (setRows.length !== 1) fail('C2B_NATIVE_BEHAVIOUR_FRAMEWORK_AMBIGUOUS', version);
    const setRow = setRows[0].fields;
    const valueRows = await this.readPlanningRecords('BehaviourFrameworkValues',
      `FrameworkVersion eq '${escapeOData(version)}'`, 'ValueID', proof, 10);
    if (valueRows.length !== 5) fail('C2B_NATIVE_BEHAVIOUR_VALUES_INCOMPLETE', version);
    const framework = assertPublishedBehaviourFrameworkV2({ frameworkVersion: String(setRow.FrameworkVersion) as never,
      published: setRow.Published as true, immutable: setRow.Immutable as true,
      ratingOptions: this.parsePlanningJson(setRow.RatingLabelsJSON, 'C2B_NATIVE_BEHAVIOUR_RATINGS_INVALID') as never,
      values: valueRows.map(record => ({ frameworkVersion: String(record.fields.FrameworkVersion) as never,
        valueId: String(record.fields.ValueID) as never, title: String(record.fields.ValueTitle || ''),
        corporateValue: String(record.fields.CorporateValue || ''), descriptors: {
          IC_OFFICER: String(record.fields.ICOfficerDescriptor || ''),
          PEOPLE_MANAGER: String(record.fields.PeopleManagerDescriptor || ''),
          SENIOR_LEADER: String(record.fields.SeniorLeaderDescriptor || '')
        } })) });
    const assignmentRows = await this.readPlanningRecords('PersonBehaviourAssignments',
      `PersonKey eq '${escapeOData(personKey)}' and Active eq 1`, undefined, proof, 2);
    if (assignmentRows.length !== 1) fail('C2B_NATIVE_BEHAVIOUR_ASSIGNMENT_AMBIGUOUS', personKey);
    const assignmentRow = assignmentRows[0].fields;
    const assignment = assertBehaviourPersonAssignmentV2({ personKey: String(assignmentRow.PersonKey || ''),
      frameworkVersion: String(assignmentRow.FrameworkVersion) as never,
      roleTier: String(assignmentRow.RoleTier) as never, cadence: String(assignmentRow.Cadence) as never,
      periodKeys: this.parsePlanningJson(assignmentRow.PeriodKeysJSON, 'C2B_NATIVE_BEHAVIOUR_PERIODS_INVALID') as never });
    if (assignment.frameworkVersion !== framework.frameworkVersion)
      fail('C2B_NATIVE_BEHAVIOUR_ASSIGNMENT_CROSSED', personKey);
    if (this.binding.contractVersion === 'kcf.kpi.wib12.tenant-layer.v2') {
      const focusCatalogue = await this.readPlanningFocusCatalogue(proof);
      return { framework, assignment, focusCatalogue };
    }
    const catalogueRows = await this.readPlanningRecords('BehaviourObjectiveLibrary', undefined,
      'BehaviourObjectiveKey', proof, 200);
    const dateOnly = (value: unknown): string | null => {
      if (value === null || value === undefined || value === '') return null;
      const text = String(value); const normal = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text
        : /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(text) ? text.slice(0, 10) : '';
      return normal || fail('C2B_NATIVE_BEHAVIOUR_DATE_INVALID', text);
    };
    const sourceRecords = catalogueRows.map(record => ({
      BehaviourObjectiveKey: record.fields.BehaviourObjectiveKey, BehaviourKey: record.fields.BehaviourKey,
      BehaviourTitle: record.fields.BehaviourTitle, CorporateValue: record.fields.CorporateValue,
      RoleLevelCode: record.fields.RoleLevelCode, RoleLevelName: record.fields.RoleLevelName,
      DropdownLabel: record.fields.DropdownLabel, ObjectiveTitle: record.fields.ObjectiveTitle,
      ObjectiveDescription: record.fields.ObjectiveDescription, SuggestedMeasure: record.fields.SuggestedMeasure,
      SuggestedUnit: record.fields.SuggestedUnit, SuggestedEvidence: record.fields.SuggestedEvidence,
      Active: record.fields.Active, SortOrder: record.fields.SortOrder,
      EffectiveFrom: dateOnly(record.fields.EffectiveFrom), EffectiveTo: dateOnly(record.fields.EffectiveTo)
    }));
    const records = mapBehaviourLibraryV2Catalogue({ frameworkVersion: framework.frameworkVersion,
      published: setRow.Published, productionSafe: setRow.ProductionSafe, synthetic: setRow.Synthetic,
      records: sourceRecords }).map((record, index) => {
      const exact = { ...record, id: catalogueRows[index].itemId, etag: catalogueRows[index].etag };
      if (exact.effectiveTo === undefined) delete exact.effectiveTo;
      return exact;
    });
    return { framework, assignment, catalogue: { complete: true, frameworkVersion: framework.frameworkVersion,
      applicableDate: String(setRow.EffectiveFrom || ''), records } };
  }

  private async readPlanningFocusCatalogue(proof: Array<{ slice: string; sha256: string }>):
  Promise<NonNullable<NonNullable<IC2bNativePlanningObservations['behaviourV2']>['focusCatalogue']>> {
    const pin = this.binding.planningAuthority.behaviourCataloguePin;
    if (!pin || this.binding.contractVersion !== 'kcf.kpi.wib12.tenant-layer.v2') {
      return fail('C2B_NATIVE_FOCUS_BINDING_MISSING', 'The versioned focus catalogue binding is absent.');
    }
    const asOf = new Date().toISOString().slice(0, 10);
    const filter = `CatalogueVersion eq '${escapeOData(pin.catalogueVersion)}' and Revision eq ${pin.revision}`;
    const publications = await this.readPlanningRecords('BehaviourCataloguePublications', filter,
      'Sequence', proof, 200);
    if (!publications.length || new Set(publications.map(item => item.fields.PublicationKey)).size !== publications.length) {
      return fail('C2B_NATIVE_FOCUS_PUBLICATION_MISSING', pin.catalogueVersion);
    }
    const administrators = new Set([this.binding.principals.processorPrincipalId,
      ...this.binding.principals.administratorPrincipalIds]);
    const published = publications.filter(item => item.fields.Result === 'Published');
    const retired = publications.filter(item => item.fields.Result === 'Retired');
    if (published.length !== 1 || retired.length > 0
      || publications.some(item => !administrators.has(item.authorPrincipalId)
        || item.authorPrincipalId !== item.editorPrincipalId
        || item.itemVersion !== '1.0'
        || item.fields.ActorPrincipalId !== item.authorPrincipalId
        || String(item.fields.ActorEmail || '').trim().toLowerCase()
          !== item.authorEmail.trim().toLowerCase()
        || !this.binding.principals.principalKeyBindings.some(principal =>
          principal.principalId === item.authorPrincipalId
          && principal.principalKey === item.fields.ActorPrincipalKey)
        || item.fields.CatalogueKey !== pin.catalogueKey
        || item.fields.CatalogueVersion !== pin.catalogueVersion
        || item.fields.Revision !== pin.revision
        || item.fields.SchemaVersion !== '2.0'
        || !Number.isSafeInteger(item.fields.Sequence) || Number(item.fields.Sequence) < 1
        || item.fields.PublicationKey !== `${pin.catalogueVersion}|${pin.revision}|${item.fields.Sequence}`
        || item.fields.ContentSha256 !== pin.contentSha256
        || item.fields.SourceSha256 !== pin.sourceSha256
        || item.fields.SourceRowsCanonicalSha256 !== pin.sourceRowsCanonicalSha256
        || item.fields.GeneratedRowsJsonSha256 !== pin.generatedRowsJsonSha256
        || item.fields.ApprovalReference !== pin.approvalReference
        || item.fields.SourcePath !== pin.sourcePath
        || item.fields.RowCount !== pin.rowCount
        || item.fields.ContentCanonicalUtf8ByteLength !== pin.contentCanonicalUtf8ByteLength)) {
      return fail('C2B_NATIVE_FOCUS_PUBLICATION_CROSSED', pin.catalogueVersion);
    }
    const publication = published[0];
    const publicationDate = String(publication.fields.EffectiveFrom || '').slice(0, 10);
    const publicationEnd = publication.fields.EffectiveTo
      ? String(publication.fields.EffectiveTo).slice(0, 10) : undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate) || publicationDate > asOf
      || publicationEnd && publicationEnd < asOf) {
      return fail('C2B_NATIVE_FOCUS_PUBLICATION_NOT_EFFECTIVE', pin.catalogueVersion);
    }
    const rowRecords = await this.readPlanningRecords('BehaviourFocusCatalogue', filter,
      'CatalogueRowKey', proof, 200);
    if (rowRecords.length !== pin.rowCount
      || new Set(rowRecords.map(item => item.fields.CatalogueRowKey)).size !== rowRecords.length) {
      return fail('C2B_NATIVE_FOCUS_ROWS_INCOMPLETE', pin.catalogueVersion);
    }
    if (hashC2bProjectedFocusRows(rowRecords.map(item => item.fields)) !== pin.generatedRowsJsonSha256) {
      return fail('C2B_NATIVE_FOCUS_ROW_CONTENT_MISMATCH', pin.catalogueVersion);
    }
    const rows = rowRecords.map(item => {
      const fields = item.fields;
      const targetKey = String(fields.TargetKey || '');
      const effectiveTo = fields.EffectiveTo ? String(fields.EffectiveTo).slice(0, 10) : undefined;
      if (!administrators.has(item.authorPrincipalId)
        || item.authorPrincipalId !== item.editorPrincipalId || item.itemVersion !== '1.0'
        || fields.CatalogueRowKey !== `${pin.catalogueVersion}|${pin.revision}|${targetKey}`
        || fields.CatalogueKey !== pin.catalogueKey
        || fields.CatalogueVersion !== pin.catalogueVersion || fields.Revision !== pin.revision
        || fields.ContentSha256 !== pin.contentSha256
        || fields.ContentCanonicalUtf8ByteLength !== publication.fields.ContentCanonicalUtf8ByteLength
        || !Number.isSafeInteger(fields.SortOrder) || Number(fields.SortOrder) < 1
        || fields.EffectiveStatus !== 'Published' && fields.EffectiveStatus !== 'Retired') {
        return fail('C2B_NATIVE_FOCUS_ROW_CROSSED', targetKey);
      }
      return { targetKey, behaviourKey: String(fields.BehaviourKey || ''),
        roleLevelCode: String(fields.RoleLevelCode || '') as 'L1' | 'L2' | 'L3',
        focusKey: String(fields.FocusKey || ''), focusArea: String(fields.FocusArea || ''),
        suggestedTarget: String(fields.SuggestedTarget || ''),
        effectiveStatus: fields.EffectiveStatus as 'Published' | 'Retired',
        effectiveFrom: String(fields.EffectiveFrom || '').slice(0, 10), effectiveTo,
        contentSha256: String(fields.ContentSha256 || '') };
    });
    if (new Set(rows.map(row => row.targetKey)).size !== rows.length) {
      return fail('C2B_NATIVE_FOCUS_ROW_DUPLICATE', pin.catalogueVersion);
    }
    return { complete: true, applicableDate: asOf, catalogueKey: pin.catalogueKey,
      catalogueVersion: pin.catalogueVersion, revision: pin.revision,
      contentSha256: pin.contentSha256, publicationKey: String(publication.fields.PublicationKey),
      publicationSha256: hashC2bCanonical(publication.fields),
      publicationImageSha256: hashC2bCanonical(publications),
      rowsImageSha256: hashC2bCanonical(rowRecords), sourceSha256: pin.sourceSha256,
      sourceRowsCanonicalSha256: pin.sourceRowsCanonicalSha256,
      approvalReference: pin.approvalReference, rowCount: pin.rowCount, rows };
  }

  private parsePlanningJson(value: unknown, code: string): unknown {
    if (!nonBlank(value)) fail(code, 'absent');
    const text = String(value);
    try { const parsed = JSON.parse(text); if (canonicaliseC2b(parsed) !== text) fail(code, 'noncanonical'); return parsed; }
    catch { return fail(code, 'invalid'); }
  }

  private async canonicalObservation(journal: C2bCommandJournal): Promise<C2bCanonicalObservation> {
    const headerKey = journal.plan.intendedImage.header.naturalKey;
    const header = await this.readDirect(this.list('Workplans').listId, 'Workplans', this.binding.fields.workplanKey, headerKey);
    if (!header) fail('C2B_NATIVE_STABLE_HEADER_ABSENT', headerKey);
    const exactHeader = header as C2bCanonicalEntityReadback;
    const items: C2bCanonicalEntityReadback[] = [];
    let cursor: string | null = null; let pageCount = 0;
    do {
      const page = await this.readDirectPage(this.list('WorkplanItems').listId, headerKey, cursor);
      items.push(...page.items); cursor = page.nextCursor; pageCount += 1;
      if (pageCount > 1000) fail('C2B_NATIVE_PAGING_LIMIT', headerKey);
    } while (cursor);
    const acl = await this.readAcl(this.list('Workplans').listId,
      (await this.readItemByStableKey(this.list('Workplans').listId,
        this.binding.fields.workplanKey, headerKey))!.itemId, 'Workplans', headerKey);
    return { header: exactHeader, items, acls: [acl], pagination: { complete: true, pageCount, totalCount: items.length,
      nextLink: null, affectedNaturalKeys: items.map(item => item.naturalKey).sort() },
    auditKeys: journal.effects.filter(effect => effect.target === 'Audit').map(effect => effect.naturalKey).sort(),
    effectEvidenceSha256: journal.effects.map(effect => effect.confirmationSha256).filter(nonBlank).sort(),
    processorEpoch: journal.leaseEpoch };
  }

  public async assertBehaviourCatalogueStable(behaviour: C2bTrustedBehaviourV2Observations): Promise<void> {
    const focus = behaviour.focusCatalogue;
    if (this.binding.contractVersion === 'kcf.kpi.wib12.tenant-layer.v2') {
      const pin = this.binding.planningAuthority.behaviourCataloguePin;
      if (!pin || !focus) {
        return fail('C2B_NATIVE_FOCUS_STABLE_READ_UNAVAILABLE', 'The planned focus publication is absent or crossed.');
      }
      if (focus.catalogueVersion !== pin.catalogueVersion
        || focus.revision !== pin.revision || focus.contentSha256 !== pin.contentSha256) {
        return fail('C2B_NATIVE_FOCUS_STABLE_READ_UNAVAILABLE', 'The planned focus publication is absent or crossed.');
      }
      const filter = encodeURIComponent(`CatalogueVersion eq '${escapeOData(pin.catalogueVersion)}' and Revision eq ${pin.revision}`);
      const pubUrl = `${this.listUrl(this.list('BehaviourCataloguePublications').listId)}/items?`
        + `$select=*,OData__UIVersionString,AuthorId,EditorId,Author/EMail&$expand=Author&$filter=${filter}&$orderby=Sequence&$top=200`;
      const rowUrl = `${this.listUrl(this.list('BehaviourFocusCatalogue').listId)}/items?`
        + `$select=*,OData__UIVersionString,AuthorId,EditorId,Author/EMail&$expand=Author&$filter=${filter}&$orderby=CatalogueRowKey&$top=200`;
      const pubFirst = (await this.readAll<ISharePointRow>(pubUrl)).map(row => this.record(row));
      const pubSecond = (await this.readAll<ISharePointRow>(pubUrl)).map(row => this.record(row));
      const rowFirst = (await this.readAll<ISharePointRow>(rowUrl)).map(row => this.record(row));
      const rowSecond = (await this.readAll<ISharePointRow>(rowUrl)).map(row => this.record(row));
      if (hashC2bCanonical(pubFirst) !== focus.publicationImageSha256
        || canonicaliseC2b(pubFirst) !== canonicaliseC2b(pubSecond)
        || hashC2bCanonical(rowFirst) !== focus.rowsImageSha256
        || canonicaliseC2b(rowFirst) !== canonicaliseC2b(rowSecond)
        || new Date().toISOString().slice(0, 10) !== focus.applicableDate) {
        fail('C2B_NATIVE_FOCUS_TOCTOU', 'Publication, rows, versions or current date changed before mutation.');
      }
      return;
    }
    const trustedCatalogue = behaviour.catalogue;
    if (!trustedCatalogue) {
      return fail('C2B_NATIVE_BEHAVIOUR_CATALOGUE_UNSTABLE', 'The trusted legacy catalogue observation is absent.');
    }
    const catalogue = this.list('BehaviourObjectiveLibrary').listId;
    const first = await this.readAll<ISharePointRow>(`${this.listUrl(catalogue)}/items?$select=*&$top=200`);
    const second = await this.readAll<ISharePointRow>(`${this.listUrl(catalogue)}/items?$select=*&$top=200`);
    const observedKeys = first.map(row => row.BehaviourObjectiveKey).sort();
    const bundleKeys = trustedCatalogue.records.map(row => row.behaviourObjectiveKey).sort();
    if (first.length !== 75 || canonicaliseC2b(first) !== canonicaliseC2b(second)
      || canonicaliseC2b(observedKeys) !== canonicaliseC2b(bundleKeys))
      fail('C2B_NATIVE_BEHAVIOUR_CATALOGUE_UNSTABLE', 'The exact 75-row catalogue did not double-read.');
  }

  private async readAcl(listId: string, itemId: number, purpose: 'Workplans' | 'WorkplanItems', containerKey: string):
  Promise<C2bListAclImage> {
    const rows = await this.readRoleAssignments(`${this.listUrl(listId)}/items(${itemId})`);
    return this.mapAcl(rows, purpose, containerKey);
  }

  private mapAcl(rows: readonly IRoleAssignmentRow[], purpose: 'Workplans' | 'WorkplanItems', containerKey: string):
  C2bListAclImage {
    const grants = rows.flatMap(row => (row.RoleDefinitionBindings || []).map(role => ({ principalId: row.PrincipalId,
      roleId: role.Id })));
    const allowedPrincipals = this.binding.principals.principalKeyBindings.filter(principal =>
      grants.some(grant => grant.principalId === principal.principalId)).map(principal => ({
        principalKey: principal.principalKey,
        permission: grants.some(grant => grant.principalId === principal.principalId
          && [this.binding.principals.processorRoleId, this.binding.principals.administratorRoleId].includes(grant.roleId))
          ? 'FullControl' as const : 'Read' as const,
        source: principal.category === 'Processor' ? 'Processor' as const
          : principal.category === 'Administrator' ? 'Admin' as const : 'Employee' as const
      })).sort((left, right) => left.principalKey.localeCompare(right.principalKey));
    return { listPurpose: purpose, acl: { containerKey, breaksInheritanceAtContainer: true,
      canonicalChildrenInherit: true, allowedPrincipals, revokedPrincipalKeys: [] } };
  }

  private async readRoleAssignments(endpoint: string): Promise<IRoleAssignmentRow[]> {
    return this.readAll<IRoleAssignmentRow>(`${endpoint}/roleassignments`
      + '?$select=PrincipalId,RoleDefinitionBindings/Id,RoleDefinitionBindings/Name,RoleDefinitionBindings/BasePermissions/High,RoleDefinitionBindings/BasePermissions/Low'
      + '&$expand=RoleDefinitionBindings&$top=200');
  }

  private async assertProviderRoleDefinitions(principals: IC2bTenantPrincipalBindings): Promise<void> {
    for (const expected of principals.roleDefinitions) {
      const response = await this.get(`${this.siteUrl}/_api/web/roledefinitions/getbyid(${expected.roleId})`
        + '?$select=Id,Name,RoleTypeKind,BasePermissions/High,BasePermissions/Low');
      const observed = await response!.json() as IRoleDefinitionRow;
      if (observed.Id !== expected.roleId || observed.Name !== expected.name
        || observed.RoleTypeKind !== expected.roleTypeKind
        || String(observed.BasePermissions?.High) !== expected.basePermissionsHigh
        || String(observed.BasePermissions?.Low) !== expected.basePermissionsLow) {
        fail('C2B_NATIVE_ROLE_DEFINITION_PROVIDER_MISMATCH', String(expected.roleId));
      }
    }
  }

  private expectedContainerAssignments(effect: C2bCommandEffect, principals: IC2bTenantPrincipalBindings):
  IExpectedRoleAssignment[] {
    const desired = effect.desiredFields as unknown as C2bAclImage;
    if (!desired || desired.containerKey !== effect.naturalKey || !Array.isArray(desired.allowedPrincipals)
      || !Array.isArray(desired.revokedPrincipalKeys))
      return fail('C2B_NATIVE_ACL_IMAGE_INVALID', effect.naturalKey);
    const assignments = desired.allowedPrincipals.map(grant => {
      const principal = principals.principalKeyBindings.find(item => item.principalKey === grant.principalKey);
      if (!principal || grant.permission === 'FullControl'
        && principal.category !== 'Processor' && principal.category !== 'Administrator') {
        return fail('C2B_NATIVE_ACL_PRINCIPAL_UNBOUND', grant.principalKey);
      }
      const exactPrincipal = principal as IC2bTenantPrincipalBindings['principalKeyBindings'][number];
      const roleId = grant.permission === 'Read' ? principals.actorReadRoleId
        : exactPrincipal.category === 'Processor' ? principals.processorRoleId : principals.administratorRoleId;
      return this.expectedAssignment(exactPrincipal.principalId, roleId, principals);
    });
    assignments.push(this.expectedAssignment(principals.visitorsGroupId, principals.visitorsRoleId, principals));
    return this.withSafetyAssignments(assignments, principals);
  }

  private expectedReceiptAssignments(effect: C2bCommandEffect, principals: IC2bTenantPrincipalBindings):
  IExpectedRoleAssignment[] {
    const actorAccess = (effect.desiredFields as { actorAccess?: { allowedPrincipals?: readonly {
      principalKey: string; permission: 'Read' | 'FullControl' }[] } }).actorAccess;
    if (!actorAccess || !Array.isArray(actorAccess.allowedPrincipals))
      return fail('C2B_NATIVE_RECEIPT_ACL_IMAGE_INVALID', effect.naturalKey);
    return this.withSafetyAssignments(actorAccess.allowedPrincipals.map(grant => {
      const principal = principals.principalKeyBindings.find(item => item.principalKey === grant.principalKey);
      if (!principal || grant.permission === 'FullControl' && principal.category !== 'Processor')
        return fail('C2B_NATIVE_RECEIPT_ACL_PRINCIPAL_UNBOUND', grant.principalKey);
      const exactPrincipal = principal as IC2bTenantPrincipalBindings['principalKeyBindings'][number];
      return this.expectedAssignment(exactPrincipal.principalId,
        grant.permission === 'Read' ? principals.actorReadRoleId : principals.processorRoleId, principals);
    }), principals);
  }

  private withSafetyAssignments(assignments: readonly IExpectedRoleAssignment[], principals: IC2bTenantPrincipalBindings):
  IExpectedRoleAssignment[] {
    const result = [...assignments];
    const add = (principalId: number, roleId: number): void => {
      if (!result.some(item => item.principalId === principalId && item.roleId === roleId))
        result.push(this.expectedAssignment(principalId, roleId, principals));
    };
    add(principals.processorPrincipalId, principals.processorRoleId);
    principals.administratorPrincipalIds.forEach(principalId => add(principalId, principals.administratorRoleId));
    const rollbackActor = this.bindingAuthority.aclAuthority.rollbackActorPrincipalId;
    if (rollbackActor !== null) add(rollbackActor, principals.administratorRoleId);
    return result;
  }

  private assertAclMutationAuthority(principals: IC2bTenantPrincipalBindings): void {
    const authority = this.bindingAuthority.aclAuthority;
    const rollbackActor = authority.rollbackActorPrincipalId;
    if (authority.authorised !== true || !SHA256.test(authority.identitySeparationEvidenceSha256 || '')
      || !Number.isSafeInteger(rollbackActor) || (rollbackActor as number) < 1
      || !nonBlank(authority.rollbackRegistryReference) || !this.aclRollbackRegistry
      || rollbackActor === principals.processorPrincipalId || principals.negativePrincipalIds.includes(rollbackActor as number)
      || ![principals.primaryOwnerPrincipalId, principals.backupOwnerPrincipalId,
        ...principals.administratorPrincipalIds].includes(rollbackActor as number)) {
      fail('C2B_NATIVE_ACL_BLOCKED_OFF',
        'Authenticated identity separation, independent rollback actor and durable rollback registry are not authorised.');
    }
  }

  private canonicalRoleAssignments(rows: readonly IRoleAssignmentRow[]): readonly unknown[] {
    return rows.flatMap(row => (row.RoleDefinitionBindings || []).map(role => ({ principalId: row.PrincipalId,
      roleId: role.Id, roleName: role.Name || '', basePermissionsHigh: String(role.BasePermissions?.High ?? ''),
      basePermissionsLow: String(role.BasePermissions?.Low ?? '') })))
      .sort((left, right) => left.principalId - right.principalId || left.roleId - right.roleId);
  }

  private async captureAcl(endpoint: string, principals: IC2bTenantPrincipalBindings): Promise<IC2bAclRollbackImage> {
    const response = await this.get(`${endpoint}?$select=HasUniqueRoleAssignments`);
    const state = await response!.json() as { HasUniqueRoleAssignments?: unknown };
    if (typeof state.HasUniqueRoleAssignments !== 'boolean')
      fail('C2B_NATIVE_ACL_PRESTATE_INVALID', 'Inheritance state is absent.');
    const assignments = immutableTenantInput(await this.readRoleAssignments(endpoint));
    const rollbackActor = this.bindingAuthority.aclAuthority.rollbackActorPrincipalId as number;
    const requiredPreState = [rollbackActor, principals.processorPrincipalId, ...principals.administratorPrincipalIds];
    const observedPrincipals = new Set(assignments.map(row => row.PrincipalId));
    if (requiredPreState.some(principalId => !observedPrincipals.has(principalId)))
      fail('C2B_NATIVE_ACL_PRESTATE_LOCKOUT', 'Rollback actor, processor or administrator lacks pre-state access.');
    const content = { endpoint, hasUniqueRoleAssignments: state.HasUniqueRoleAssignments as boolean,
      assignments, rollbackActorPrincipalId: rollbackActor };
    return immutableTenantInput({ ...content, imageSha256: hashC2bCanonical(content) });
  }

  private async confirmedAclPost(url: string): Promise<void> {
    const outcome = await this.postMutation(url, {});
    if (outcome.outcome !== 'Confirmed') throw new Error(`C2B_NATIVE_ACL_${outcome.safeCode}`);
  }

  private async restoreAcl(image: IC2bAclRollbackImage): Promise<void> {
    if (image.hasUniqueRoleAssignments) {
      await this.confirmedAclPost(`${image.endpoint}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`);
      for (const row of image.assignments) for (const role of row.RoleDefinitionBindings || [])
        await this.confirmedAclPost(`${image.endpoint}/roleassignments/addroleassignment(principalid=${row.PrincipalId},roledefid=${role.Id})`);
    } else await this.confirmedAclPost(`${image.endpoint}/resetroleinheritance()`);
    const response = await this.get(`${image.endpoint}?$select=HasUniqueRoleAssignments`);
    const state = await response!.json() as { HasUniqueRoleAssignments?: unknown };
    const assignments = await this.readRoleAssignments(image.endpoint);
    if (state.HasUniqueRoleAssignments !== image.hasUniqueRoleAssignments
      || canonicaliseC2b(this.canonicalRoleAssignments(assignments))
        !== canonicaliseC2b(this.canonicalRoleAssignments(image.assignments))) {
      fail('C2B_NATIVE_ACL_RESTORE_MISMATCH', 'Exact inheritance/assignment/mask restoration failed.');
    }
  }

  private async replaceAclTransaction(endpoint: string, expected: readonly IExpectedRoleAssignment[],
    principals: IC2bTenantPrincipalBindings): Promise<IRoleAssignmentRow[]> {
    const registry = this.aclRollbackRegistry!;
    const image = await this.captureAcl(endpoint, principals);
    const registered = await registry.register(image, this.bindingAuthority.authorityReference);
    if (registered.imageSha256 !== image.imageSha256
      || registered.registryReference !== this.bindingAuthority.aclAuthority.rollbackRegistryReference)
      fail('C2B_NATIVE_ACL_ROLLBACK_REGISTRATION_INVALID', 'Exact pre-state was not durably registered.');
    try {
      await this.confirmedAclPost(`${endpoint}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`);
      for (const assignment of expected)
        await this.confirmedAclPost(`${endpoint}/roleassignments/addroleassignment(principalid=${assignment.principalId},roledefid=${assignment.roleId})`);
      const rows = await this.readRoleAssignments(endpoint);
      this.assertExactAssignments(rows, expected, 'C2B_NATIVE_ACL_READBACK_MISMATCH');
      const principalsAfter = new Set(rows.map(row => row.PrincipalId));
      const requiredAfter = [this.bindingAuthority.aclAuthority.rollbackActorPrincipalId as number,
        principals.processorPrincipalId, ...principals.administratorPrincipalIds];
      if (requiredAfter.some(principalId => !principalsAfter.has(principalId)))
        fail('C2B_NATIVE_ACL_POSTSTATE_LOCKOUT', 'Rollback actor, processor or administrator lost access.');
      return rows;
    } catch (caught) {
      try {
        await this.restoreAcl(image);
        await registry.confirmRestored(registered.registryReference, image.imageSha256);
      } catch (restoreError) {
        fail('C2B_NATIVE_ACL_BLOCKED_OFF', `Exact rollback failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
      }
      return fail('C2B_NATIVE_ACL_BLOCKED_OFF', `ACL transaction restored and stopped: ${caught instanceof Error ? caught.message : String(caught)}`);
    }
  }

  private expectedAssignment(principalId: number, roleId: number, principals: IC2bTenantPrincipalBindings):
  IExpectedRoleAssignment {
    const definition = principals.roleDefinitions.find(role => role.roleId === roleId)
      || fail('C2B_NATIVE_ROLE_DEFINITION_UNBOUND', String(roleId));
    return { principalId, roleId, roleName: definition.name,
      basePermissionsHigh: definition.basePermissionsHigh, basePermissionsLow: definition.basePermissionsLow };
  }

  private assignmentsMatch(rows: readonly IRoleAssignmentRow[], expected: readonly IExpectedRoleAssignment[]): boolean {
    const observed = rows.flatMap(row => (row.RoleDefinitionBindings || []).map(role => ({
      principalId: row.PrincipalId, roleId: role.Id, roleName: role.Name || '',
      basePermissionsHigh: String(role.BasePermissions?.High ?? ''),
      basePermissionsLow: String(role.BasePermissions?.Low ?? '')
    }))).sort((left, right) => left.principalId - right.principalId || left.roleId - right.roleId);
    const wanted = [...expected].sort((left, right) => left.principalId - right.principalId || left.roleId - right.roleId);
    return canonicaliseC2b(observed) === canonicaliseC2b(wanted);
  }

  private assertExactAssignments(rows: readonly IRoleAssignmentRow[], expected: readonly IExpectedRoleAssignment[],
    code: string): void {
    if (!this.assignmentsMatch(rows, expected)) fail(code, 'Provider role assignments do not match the exact bound ACL image.');
  }

  private directCanonical(record: IC2bSharePointRecord, purpose: 'Workplans' | 'WorkplanItems', naturalKey: string):
  C2bCanonicalEntityReadback {
    const keyField = C2B_DIRECT_KEY_FIELDS[purpose];
    if (!nonBlank(naturalKey) || record.fields[keyField] !== naturalKey) fail('C2B_NATIVE_DIRECT_KEY_CROSSED', naturalKey);
    const allowed = new Set(C2B_DIRECT_PHYSICAL_FIELDS[purpose]);
    const fields = Object.keys(record.fields).filter(key => allowed.has(key)).reduce<Record<string, unknown>>((v, key) => {
      v[key] = record.fields[key]; return v;
    }, {});
    if (!Object.prototype.hasOwnProperty.call(fields, keyField)) fail('C2B_NATIVE_DIRECT_FIELDS_INVALID', purpose);
    return { naturalKey, fields: Object.freeze(fields), etag: record.etag, rowVersionToken: record.rowVersionToken };
  }
  private assertFieldProjection(observed: Readonly<Record<string, unknown>>, expected: Readonly<Record<string, unknown>>,
    code: string): void { const p = Object.keys(expected).reduce<Record<string, unknown>>((v, key) => {
    v[key] = observed[key]; return v;
  }, {}); if (canonicaliseC2b(p) !== canonicaliseC2b(expected)) fail(code, 'Physical projection differs.'); }
  private controlCaseStore(): SharePointC2bControlCaseStore {
    const listId = this.list('ControlCases').listId;
    const port: IC2bControlCasePhysicalPort = { readByKey: async key => {
      const r = await this.readItemByStableKey(listId, this.binding.fields.controlCaseKey, key); if (!r) return [];
      return [{ itemId: r.itemId, etag: r.etag, itemVersion: r.itemVersion, fields: r.fields } as IC2bControlCasePhysicalRecord];
    }, patchIfMatch: async (itemId, etag, fields) => {
      const r = await this.compareExchangePhysicalRow(listId, itemId, etag, fields);
      return r.outcome === 'Unknown' ? r : { outcome: 'Confirmed', providerReference: r.providerReference };
    } };
    return new SharePointC2bControlCaseStore(port);
  }

  private async confirmStable(listId: string, keyField: string, stableKey: string): Promise<C2bSharePointMutationOutcome> {
    const observed = await this.readItemByStableKey(listId, keyField, stableKey);
    if (!observed) fail('C2B_NATIVE_MUTATION_READBACK_ABSENT', stableKey);
    const exact = observed as IC2bSharePointRecord;
    return { outcome: 'Confirmed', providerReference: `list:${this.guid(listId)}:item:${exact.itemId}`, observed: exact };
  }

  private async postMutation(url: string, body: object, expectedETag?: string): Promise<C2bSharePointMutationOutcome> {
    try {
      const response = await this.withTimeout(this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
        headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata',
          ...(expectedETag ? { 'IF-MATCH': expectedETag, 'X-HTTP-Method': 'MERGE' } : {}) },
        body: JSON.stringify(body)
      }));
      if ([408, 409, 429].includes(response.status) || response.status >= 500)
        return { outcome: 'Unknown', safeCode: response.status === 408 ? 'TIMEOUT_UNKNOWN' : 'PROVIDER_UNKNOWN' };
      if (!response.ok) fail('C2B_NATIVE_MUTATION_REJECTED', `HTTP ${response.status}`);
      return { outcome: 'Confirmed', providerReference: 'provider-accepted',
        observed: { itemId: 0, etag: '', rowVersionToken: 0, itemVersion: '0', authorPrincipalId: 1,
          editorPrincipalId: 1, authorEmail: 'provider-readback-required@example.invalid', fields: {} } };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      if (/C2B_NATIVE_TIMEOUT/.test(message)) return { outcome: 'Unknown', safeCode: 'TIMEOUT_UNKNOWN' };
      if (/network|fetch|abort|connection/i.test(message)) return { outcome: 'Unknown', safeCode: 'CONNECTION_INTERRUPTED' };
      throw caught;
    }
  }

  private async get(url: string, allow404: boolean = false): Promise<SPHttpClientResponse | undefined> {
    const response = await this.withTimeout(this.spHttpClient.get(this.safePageUrl(url), SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }));
    if (allow404 && response.status === 404) return undefined;
    if (!response.ok) fail('C2B_NATIVE_READ_FAILED', `HTTP ${response.status}`);
    return response;
  }

  private async readAll<T>(initialUrl: string): Promise<T[]> {
    const result: T[] = []; let next: string | undefined = initialUrl; let pages = 0;
    while (next) {
      if (++pages > 1000) fail('C2B_NATIVE_PAGING_LIMIT', initialUrl);
      const response = await this.get(this.containedPageUrl(initialUrl, next));
      const body = await response!.json() as IODataCollection<T>;
      if (!Array.isArray(body.value)) fail('C2B_NATIVE_PAGE_INVALID', initialUrl);
      result.push(...body.value); next = body['@odata.nextLink']
        ? this.containedPageUrl(initialUrl, body['@odata.nextLink']) : undefined;
    }
    return result;
  }

  private record(row: ISharePointRow): IC2bSharePointRecord {
    const fields = Object.keys(row).filter(key => !['Id', '@odata.etag', 'OData__UIVersionString', 'AuthorId',
      'EditorId', 'Author'].includes(key))
      .reduce<Record<string, unknown>>((result, key) => { result[key] = row[key]; return result; }, {});
    const itemId = Number(row.Id); const rowVersionToken = Number(row.RowVersionToken || 1);
    const etag = String(row['@odata.etag'] || ''); const itemVersion = String(row.OData__UIVersionString || '');
    const authorPrincipalId = Number(row.AuthorId); const editorPrincipalId = Number(row.EditorId);
    const authorEmail = String(row.Author?.EMail || '');
    if (!Number.isSafeInteger(itemId) || itemId < 1 || !Number.isSafeInteger(rowVersionToken)
      || rowVersionToken < 1 || !nonBlank(etag)) fail('C2B_NATIVE_RECORD_INVALID', String(row.Id));
    return { itemId, etag, rowVersionToken, itemVersion, authorPrincipalId, editorPrincipalId, authorEmail, fields };
  }

  private list(purpose: IC2bTenantNativeBinding['lists'][number]['purpose']): IC2bTenantNativeBinding['lists'][number] {
    const list = this.binding.lists.find(item => item.purpose === purpose);
    return list || fail('C2B_NATIVE_LIST_UNBOUND', purpose);
  }

  private listUrl(listId: string): string {
    const id = this.guid(listId);
    if (!this.listIds.has(id)) fail('C2B_NATIVE_LIST_ID_UNBOUND', id);
    return `${this.siteUrl}/_api/web/lists(guid'${id}')`;
  }

  private guid(value: string): string {
    const id = value.replace(/[{}]/g, '').trim().toLowerCase();
    return GUID.test(id) ? id : fail('C2B_NATIVE_GUID_INVALID', value);
  }
  private field(value: string): string { return SAFE_FIELD.test(value) ? value : fail('C2B_NATIVE_FIELD_INVALID', value); }
  private etag(value: string): string { return nonBlank(value) && value !== '*' ? value : fail('C2B_NATIVE_ETAG_INVALID', value); }

  private safePageUrl(value: string): string {
    const url = new URL(value, `${this.siteUrl}/`); const site = new URL(this.siteUrl);
    const root = site.pathname.replace(/\/+$/, '');
    if (url.protocol !== site.protocol || url.host !== site.host
      || !url.pathname.toLowerCase().startsWith(`${root.toLowerCase()}/_api/`))
      fail('C2B_NATIVE_PAGING_TARGET_ESCAPE', url.toString());
    return url.toString();
  }

  private containedPageUrl(initialValue: string, candidateValue: string): string {
    const initial = new URL(this.safePageUrl(initialValue));
    const candidate = new URL(this.safePageUrl(candidateValue));
    const initialTokens = Array.from(initial.searchParams.entries()).filter(([key]) => key.toLowerCase() === '$skiptoken');
    const candidateTokens = Array.from(candidate.searchParams.entries()).filter(([key]) => key.toLowerCase() === '$skiptoken');
    const query = (url: URL): string => Array.from(url.searchParams.entries())
      .filter(([key]) => key !== '$skiptoken')
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue))
      .map(([key, value]) => `${key}=${value}`).join('&');
    const continuation = candidate.toString() !== initial.toString();
    if (initialTokens.length !== 0 || candidateTokens.some(([key, value]) => key !== '$skiptoken' || !nonBlank(value))
      || (continuation ? candidateTokens.length !== 1 : candidateTokens.length !== 0)
      || candidate.pathname !== initial.pathname || query(candidate) !== query(initial)) {
      fail('C2B_NATIVE_PAGING_QUERY_ESCAPE', candidate.toString());
    }
    return candidate.toString();
  }

  private encodeCursor(value: { listId: string; workplanKey: string; initialUrl: string; page: number;
    priorPageSha256: string; url: string }): string {
    const bytes = new Uint8Array(32); globalThis.crypto.getRandomValues(bytes);
    const cursor = Array.from(bytes).map(item => item.toString(16).padStart(2, '0')).join('');
    this.cursorRegistry.set(cursor, immutableTenantInput(value));
    return cursor;
  }
  private decodeCursor(cursor: string, listId: string, workplanKey: string, initialUrl: string):
  { page: number; url: string; priorPageSha256: string } {
    const value = this.cursorRegistry.get(cursor);
    this.cursorRegistry.delete(cursor);
    if (!value || !/^[0-9a-f]{64}$/.test(cursor) || value.listId !== listId || value.workplanKey !== workplanKey
      || value.initialUrl !== initialUrl || !Number.isSafeInteger(value.page) || value.page < 2
      || !SHA256.test(value.priorPageSha256) || !nonBlank(value.url)) {
      return fail('C2B_NATIVE_CURSOR_INVALID', 'Paging cursor is unknown, consumed or crossed.');
    }
    return { page: value.page, url: value.url, priorPageSha256: value.priorPageSha256 };
  }

  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('C2B_NATIVE_TIMEOUT')), this.timeoutMs);
      promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  }
}
