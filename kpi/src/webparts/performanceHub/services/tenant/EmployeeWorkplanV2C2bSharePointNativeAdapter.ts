/* eslint-disable @rushstack/no-new-null -- native CAS and absence are represented explicitly */
import type {
  C2bCanonicalEntityReadback,
  C2bCommandEffect,
  C2bCommandJournal,
  C2bEffectConfirmation,
  C2bListPurpose,
  C2bStableReadProof,
  C2bTerminalReceipt
} from '../TestPilotCommandAdmissionC2b';
import { canonicaliseC2b, hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import { C2bCommandSourceStorageV1, assertCommandSourcePairV1, type C2bCommandCaptureAdmissionV1,
  type C2bCommandRawResponseV1 } from '../C2bCommandSourceStorageV1';
import type {
  C2bNativeEffectResult,
  C2bNativeRecoveryResult,
  IC2bNativeAdapterCapabilities,
  IC2bNativePage,
  IC2bNativePlanningObservations,
  IC2bNativeReceiptProvenance,
  IC2bNativeSourceDoubleRead,
  IC2bNativeSourceObservation,
  IEmployeeWorkplanV2C2bNativeAdapter
} from '../EmployeeWorkplanV2C2bNativeAdapter';
import { C2B_NATIVE_ADAPTER_CONTRACT_VERSION, C2B_REQUIRED_NATIVE_ADAPTER_CAPABILITIES } from '../EmployeeWorkplanV2C2bNativeAdapter';
import type { C2bTrustedCommandSource, C2bTrustedBehaviourV2Observations }
  from '../TestPilotCommandAdmissionC2bHandlers';
import type { IDeliveryWeightConfigurationAuthority } from '../CategoryWeightingPolicy';
import { assertKcfAutomationTenantTarget, type ITenantTargetEvidence } from './TenantTargetClassification';
import { immutableTenantInput } from './ImmutableTenantInput';
import { deserialiseC2bJournalRow, serialiseC2bEffectRow, serialiseC2bJournalRow }
  from '../EmployeeWorkplanV2C2bSharePointJournalStore';
import { C2B_COMMAND_EFFECTS_LIST_CONTRACT, C2B_COMMAND_JOURNAL_LIST_CONTRACT }
  from '../EmployeeWorkplanV2C2bSharePointSchema';
import { C2B_CONVERGED_TITLES, C2B_CONTROL_CASE_SCHEMA_REVISION, C2B_DIRECT_KEY_FIELDS,
  C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION, C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION_V2,
  C2B_BEHAVIOUR_FOCUS_SCHEMA_REVISION, C2B_ANNUAL_SELECTION_SCHEMA_REVISION,
  C2B_BEHAVIOUR_FOCUS_ROW_FIELDS, C2B_BEHAVIOUR_PUBLICATION_FIELDS,
  C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS, assertStableC2bPlanningProjection,
  type C2bConvergedListPurpose } from './C2bPhysicalConvergenceContract';
import { C2B_CONTROL_CASE_PHYSICAL_FIELDS } from './SharePointC2bControlCaseStore';
import { C2B_PROVISIONING_RECEIPT_FIELDS, C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS,
  serialiseC2bTerminalReceiptRow } from './SharePointC2bReceiptStores';

export type C2bTenantListPurpose = C2bConvergedListPurpose;

export interface IC2bTenantListBinding {
  purpose: C2bTenantListPurpose;
  title: string;
  listId: string;
  schemaRevision: string;
  majorVersioningEnabled?: boolean;
  aclEvidenceSha256?: string;
  observedFields: readonly { internalName: string; type: 'Text' | 'Note' | 'Number' | 'Boolean' | 'Choice' | 'Date' | 'DateTime';
    required: boolean; indexed: boolean; unique: boolean; maxLength?: number; plainText?: boolean;
    appendOnly?: boolean; choices?: readonly string[] }[];
}

export interface IC2bTenantPrincipalBindings {
  processorPrincipalId: number;
  primaryOwnerPrincipalId: number;
  backupOwnerPrincipalId: number;
  administratorPrincipalIds: readonly number[];
  submitterPrincipalIds: readonly number[];
  actorPrincipalIds: readonly number[];
  negativePrincipalIds: readonly number[];
  visitorsGroupId: number;
  processorRoleId: number;
  administratorRoleId: number;
  submitterRoleId: number;
  actorReadRoleId: number;
  visitorsRoleId: number;
  visitorsRole: 'Read';
  roleDefinitions: readonly { roleId: number; name: string; roleTypeKind: number;
    basePermissionsHigh: string; basePermissionsLow: string }[];
  principalKeyBindings: readonly { principalKey: string; principalId: number;
    category: 'Processor' | 'Administrator' | 'Submitter' | 'Actor' | 'Negative' }[];
}

export interface IC2bNativeStorageFields {
  sourcePayloadJson: string;
  journalKey: string;
  effectKey: string;
  workplanKey: string;
  workplanItemKey: string;
  auditKey: string;
  receiptKey: string;
  controlCaseKey: string;
  provisioningReceiptKey: string;
}
export interface IC2bNativeBehaviourCataloguePin {
  catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS'; catalogueVersion: string; revision: number;
  contentSha256: string; contentCanonicalUtf8ByteLength: number;
  sourceSha256: string; sourceRowsCanonicalSha256: string;
  generatedRowsJsonSha256: string;
  approvalReference: string; sourcePath: string; rowCount: number;
}
export interface IC2bNativePlanningAuthority { schemaRevision: 'c2b-annual-v2' | 'c2b-annual-v3'; behaviourContractVersion: string;
  behaviourCataloguePin?: IC2bNativeBehaviourCataloguePin;
  deliveryWeightConfiguration?: { listId: string; listTitle: string;
    authority: IDeliveryWeightConfigurationAuthority };
  initialState: 'Draft'; initialAccessState: 'EmployeeEdit'; initialTransitionStatus: 'Ready';
  processorPrincipalKey: string; adminPrincipalKeys: readonly string[]; coreCatalogueProviderReference: string;
  coreKpiMasterListId: string; coreAnnualTargetsListId: string; }

export interface IC2bTenantNativeBinding {
  enabled: true;
  activationAuthorised: boolean;
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v1' | 'kcf.kpi.wib12.tenant-layer.v2';
  bindingReceiptSha256: string;
  previousProvisioningReceiptSha256?: string;
  candidate: { commit: string; tree: string; tenantPacketManifestSha256: string; companionPackageSha256: string };
  workflow: { id: string; name: string };
  targetEvidence: ITenantTargetEvidence;
  connectionReferenceId: string;
  connector: 'shared_sharepointonline';
  lists: readonly IC2bTenantListBinding[];
  principals: IC2bTenantPrincipalBindings;
  fields: IC2bNativeStorageFields;
  planningAuthority: IC2bNativePlanningAuthority;
}

export type IC2bTenantCandidateIdentity = Readonly<IC2bTenantNativeBinding['candidate']>;

export interface IC2bTenantBindingAuthority {
  contractVersion: 'kcf.kpi.wib12.binding-authority.v1' | 'kcf.kpi.wib12.binding-authority.v2';
  authorityReference: string;
  expectedBindingSha256: string;
  expectedBinding: Readonly<Omit<IC2bTenantNativeBinding, 'bindingReceiptSha256'>>;
  aclAuthority: {
    authorised: boolean;
    identitySeparationEvidenceSha256: string | null;
    rollbackActorPrincipalId: number | null;
    rollbackRegistryReference: string | null;
  };
}

export interface IC2bSharePointRecord {
  itemId: number;
  etag: string;
  rowVersionToken: number;
  itemVersion: string;
  authorPrincipalId: number;
  editorPrincipalId: number;
  authorEmail: string;
  fields: Readonly<Record<string, unknown>>;
}

export type C2bSharePointMutationOutcome = {
  outcome: 'Confirmed';
  providerReference: string;
  observed: IC2bSharePointRecord;
} | {
  outcome: 'Unknown';
  safeCode: 'TIMEOUT_UNKNOWN' | 'PROVIDER_UNKNOWN' | 'CONNECTION_INTERRUPTED';
};
export interface IC2bNativePlanningProjectionResult {
  observations: IC2bNativePlanningObservations;
  provenanceSha256: string;
}

/**
 * Physical SharePoint driver boundary. A runtime implementation supplies authenticated REST calls;
 * all tenant/list/connection/principal identities come from the reviewed binding receipt.
 */
export interface IC2bNativeSharePointPort {
  readCommandRawSource?(listId: string, itemId: number, admission: C2bCommandCaptureAdmissionV1):
    Promise<C2bCommandRawResponseV1>;
  readItemById(listId: string, itemId: number): Promise<IC2bSharePointRecord | undefined>;
  readItemByStableKey(listId: string, keyField: string, stableKey: string): Promise<IC2bSharePointRecord | undefined>;
  readPlanningProjection(binding: IC2bTenantNativeBinding, source: IC2bNativeSourceObservation):
    Promise<IC2bNativePlanningProjectionResult>;
  assertBehaviourCatalogueStable?(behaviour: C2bTrustedBehaviourV2Observations): Promise<void>;
  createPhysicalRow(listId: string, keyField: string, stableKey: string, fields: Readonly<Record<string, unknown>>):
    Promise<C2bSharePointMutationOutcome>;
  compareExchangePhysicalRow(listId: string, itemId: number, expectedETag: string, fields: Readonly<Record<string, unknown>>):
    Promise<C2bSharePointMutationOutcome>;
  persistEffectState(listId: string, keyField: string, effect: C2bCommandEffect, journalETag: string,
    journal: C2bCommandJournal): Promise<C2bSharePointMutationOutcome>;
  readDirect(listId: string, purpose: 'Workplans' | 'WorkplanItems', keyField: string, naturalKey: string):
    Promise<C2bCanonicalEntityReadback | undefined>;
  readDirectPage(listId: string, workplanKey: string, cursor: string | null):
    Promise<IC2bNativePage<C2bCanonicalEntityReadback>>;
  applyCanonicalEffect(listId: string, effect: C2bCommandEffect): Promise<C2bSharePointMutationOutcome>;
  consumeControlCase(effect: C2bCommandEffect): Promise<C2bSharePointMutationOutcome>;
  reconcileContainerAcl(listId: string, effect: C2bCommandEffect, principals: IC2bTenantPrincipalBindings):
    Promise<C2bSharePointMutationOutcome>;
  appendAudit(listId: string, effect: C2bCommandEffect): Promise<C2bSharePointMutationOutcome>;
  createTerminalReceipt(listId: string, effect: C2bCommandEffect, receipt: C2bTerminalReceipt,
    provenance: IC2bNativeReceiptProvenance): Promise<C2bSharePointMutationOutcome>;
  reconcileReceiptActorRead(listId: string, effect: C2bCommandEffect, receipt: C2bTerminalReceipt,
    principals: IC2bTenantPrincipalBindings): Promise<C2bSharePointMutationOutcome>;
  readStableProof(binding: IC2bTenantNativeBinding, journal: C2bCommandJournal): Promise<C2bStableReadProof>;
  recoverExact(binding: IC2bTenantNativeBinding, journal: C2bCommandJournal, effect: C2bCommandEffect):
    Promise<C2bNativeRecoveryResult>;
}

const B01_PURPOSES: readonly C2bListPurpose[] = [
  'People', 'EmployeeCommands', 'ManagerCommands', 'CommandJournal', 'CommandEffects',
  'CommandReceipts', 'Workplans', 'WorkplanItems', 'Audit'
];
const BEHAVIOUR_PURPOSES: readonly C2bTenantListPurpose[] = [
  'BehaviourFrameworkSets', 'BehaviourFrameworkValues', 'PersonBehaviourAssignments', 'BehaviourObjectiveLibrary'
];
const BEHAVIOUR_FOCUS_PURPOSES: readonly C2bTenantListPurpose[] = [
  'BehaviourFocusCatalogue', 'BehaviourCataloguePublications'
];
const ISOLATED_PURPOSES: readonly C2bTenantListPurpose[] = ['ControlCases', 'TenantProvisioningReceipts'];
const ALL_PURPOSES: readonly C2bTenantListPurpose[] = [...B01_PURPOSES, ...BEHAVIOUR_PURPOSES, ...ISOLATED_PURPOSES];
export const C2B_TENANT_TITLES: Readonly<Record<C2bTenantListPurpose, string>> = C2B_CONVERGED_TITLES;
const BEHAVIOUR_SCHEMA_REVISION = 'kcf-behaviour-v2-tenant-1';
const B01_SCHEMA_REVISION = 'c2b-annual-v2';
const EXACT_WORKFLOW = Object.freeze({ id: '3db97504-0731-4134-af1a-27e467d23b28',
  name: 'KCF KPI Employee C2b Tenant Layer Disabled' });
const EXACT_STORAGE_FIELDS: Readonly<IC2bNativeStorageFields> = Object.freeze({
  sourcePayloadJson: 'PayloadJSON', journalKey: 'CommandKey', effectKey: 'EffectKey',
  workplanKey: C2B_DIRECT_KEY_FIELDS.Workplans, workplanItemKey: C2B_DIRECT_KEY_FIELDS.WorkplanItems,
  auditKey: C2B_DIRECT_KEY_FIELDS.Audit, receiptKey: 'ReceiptKey', controlCaseKey: 'ControlCaseKey',
  provisioningReceiptKey: 'ReceiptRevisionKey'
});
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const GIT_ID = /^[0-9a-f]{40}$/i;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const normalGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const fail = (code: string, detail: string): never => { throw new Error(`${code}: ${detail}`); };

function parseJsonField<T>(record: IC2bSharePointRecord, field: string, code: string): T {
  const value = record.fields[field];
  if (!nonBlank(value)) throw new Error(`${code}: ${field} is absent.`);
  try { return JSON.parse(value) as T; }
  catch { return fail(code, `${field} is not valid JSON.`); }
}

export function hashC2bTenantNativeBindingReceipt(binding: IC2bTenantNativeBinding): string {
  const receiptContent = Object.keys(binding).filter(key => key !== 'bindingReceiptSha256')
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = binding[key as keyof IC2bTenantNativeBinding]; return result;
    }, {});
  return hashC2bCanonical(receiptContent);
}

export function c2bTenantNativeBindingAuthorityContent(
  binding: IC2bTenantNativeBinding
): Readonly<Omit<IC2bTenantNativeBinding, 'bindingReceiptSha256'>> {
  return immutableTenantInput(Object.keys(binding).filter(key => key !== 'bindingReceiptSha256')
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = binding[key as keyof IC2bTenantNativeBinding]; return result;
    }, {}) as Omit<IC2bTenantNativeBinding, 'bindingReceiptSha256'>);
}

export function assertC2bTenantNativeBinding(
  binding: IC2bTenantNativeBinding,
  expectedCandidate: IC2bTenantCandidateIdentity,
  authority: IC2bTenantBindingAuthority
): void {
  const authorityBinding = authority?.expectedBinding;
  const v2 = binding.contractVersion === 'kcf.kpi.wib12.tenant-layer.v2';
  const expectedAuthorityVersion = v2 ? 'kcf.kpi.wib12.binding-authority.v2'
    : 'kcf.kpi.wib12.binding-authority.v1';
  if (!authorityBinding || authority.contractVersion !== expectedAuthorityVersion
    || !nonBlank(authority.authorityReference) || !SHA256.test(authority.expectedBindingSha256)
    || authority.expectedBindingSha256.toUpperCase() !== hashC2bCanonical(authorityBinding)
    || canonicaliseC2b(authorityBinding) !== canonicaliseC2b(c2bTenantNativeBindingAuthorityContent(binding))) {
    fail('C2B_NATIVE_BINDING_AUTHORITY_MISMATCH',
      'The executable binding is not anchored to the separately supplied immutable authority.');
  }
  assertKcfAutomationTenantTarget(binding.targetEvidence);
  if (!binding.enabled || (binding.contractVersion !== 'kcf.kpi.wib12.tenant-layer.v1' && !v2)
    || !nonBlank(binding.connectionReferenceId) || binding.connector !== 'shared_sharepointonline'
    || !SHA256.test(binding.bindingReceiptSha256)
    || binding.bindingReceiptSha256.toUpperCase() !== hashC2bTenantNativeBindingReceipt(binding)
    || !GIT_ID.test(expectedCandidate.commit) || !GIT_ID.test(expectedCandidate.tree)
    || !SHA256.test(expectedCandidate.tenantPacketManifestSha256)
    || expectedCandidate.companionPackageSha256.toUpperCase()
      !== 'DE4EF8A90E61CDBAF8EAAFFCE1BCD0E60E352004615385B1DC1B07ABFFFAE39F'
    || binding.candidate.commit.toLowerCase() !== expectedCandidate.commit.toLowerCase()
    || binding.candidate.tree.toLowerCase() !== expectedCandidate.tree.toLowerCase()
    || binding.candidate.tenantPacketManifestSha256.toUpperCase()
      !== expectedCandidate.tenantPacketManifestSha256.toUpperCase()
    || binding.candidate.companionPackageSha256.toUpperCase()
      !== expectedCandidate.companionPackageSha256.toUpperCase()
    || normalGuid(binding.workflow.id) !== EXACT_WORKFLOW.id || binding.workflow.name !== EXACT_WORKFLOW.name)
    fail('C2B_NATIVE_BINDING_DISABLED', 'The exact connection reference must be bound.');
  if (v2 && (!SHA256.test(binding.previousProvisioningReceiptSha256 || '')
    || binding.lists.filter(list => BEHAVIOUR_FOCUS_PURPOSES.includes(list.purpose))
      .some(list => list.majorVersioningEnabled !== true || !SHA256.test(list.aclEvidenceSha256 || '')))) {
    fail('C2B_NATIVE_FOCUS_RECEIPT_INCOMPLETE', 'The v2 list versioning, ACL and prior receipt chain are unproved.');
  }
  const purposes = binding.lists.map(list => list.purpose);
  const ids = binding.lists.map(list => normalGuid(list.listId));
  const requiredPurposes = v2 ? [...ALL_PURPOSES, ...BEHAVIOUR_FOCUS_PURPOSES] : ALL_PURPOSES;
  const schemaRevision = (purpose: C2bTenantListPurpose): string => BEHAVIOUR_FOCUS_PURPOSES.includes(purpose)
    ? C2B_BEHAVIOUR_FOCUS_SCHEMA_REVISION : v2 && purpose === 'WorkplanItems'
      ? C2B_ANNUAL_SELECTION_SCHEMA_REVISION : BEHAVIOUR_PURPOSES.includes(purpose)
    ? BEHAVIOUR_SCHEMA_REVISION : purpose === 'ControlCases' ? C2B_CONTROL_CASE_SCHEMA_REVISION
      : purpose === 'TenantProvisioningReceipts' ? v2 ? C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION_V2
        : C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION : B01_SCHEMA_REVISION;
  if (binding.lists.length !== requiredPurposes.length || new Set(purposes).size !== requiredPurposes.length
    || requiredPurposes.some(purpose => !purposes.includes(purpose))
    || ids.some(id => !GUID.test(id)) || new Set(ids).size !== ids.length
    || binding.lists.some(list => list.title !== C2B_TENANT_TITLES[list.purpose]
      || list.schemaRevision !== schemaRevision(list.purpose)
      || !Array.isArray(list.observedFields)
      || new Set(list.observedFields.map(field => field.internalName)).size !== list.observedFields.length
      || list.observedFields.some(field => !nonBlank(field.internalName)))) {
    fail('C2B_NATIVE_LIST_BINDING_INVALID', 'Every B01 and Behaviour list needs one unique exact GUID and schema receipt.');
  }
  type FieldReceipt = IC2bTenantListBinding['observedFields'][number];
  type RequiredFieldReceipt = { internalName: string; type?: FieldReceipt['type']; required?: boolean;
    indexed?: boolean; unique?: boolean };
  const key = (internalName: string): FieldReceipt => ({ internalName, type: 'Text', required: true,
    indexed: true, unique: true });
  const note = (internalName: string): FieldReceipt => ({ internalName, type: 'Note', required: true,
    indexed: false, unique: false });
  const named = (internalName: string): RequiredFieldReceipt => ({ internalName });
  const contract = (items: readonly { internalName: string; type: string; required: boolean; indexed: boolean;
    unique: boolean }[]): RequiredFieldReceipt[] => items.map(f => ({ internalName: f.internalName,
      type: f.type as FieldReceipt['type'], required: f.required, indexed: f.indexed, unique: f.unique }));
  const requiredFields: Partial<Record<C2bTenantListPurpose, readonly RequiredFieldReceipt[]>> = {
    People: [key('PersonKey'), named('Title'), named('Email'), named('ManagerPersonKey'), named('ManagerEmail'),
      named('AppRoles'), named('Active')],
    EmployeeCommands: [note(binding.fields.sourcePayloadJson)], ManagerCommands: [note(binding.fields.sourcePayloadJson)],
    CommandJournal: contract(C2B_COMMAND_JOURNAL_LIST_CONTRACT.fields),
    CommandEffects: contract(C2B_COMMAND_EFFECTS_LIST_CONTRACT.fields),
    CommandReceipts: [key(binding.fields.receiptKey), ...contract(C2B_TERMINAL_RECEIPT_ADDITIVE_FIELDS)],
    Workplans: [key(binding.fields.workplanKey)], WorkplanItems: [key(binding.fields.workplanItemKey),
      ...(v2 ? contract(C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS) : [])],
    Audit: [key(binding.fields.auditKey)],
    BehaviourFrameworkSets: [key('FrameworkVersion')], BehaviourFrameworkValues: [key('FrameworkValueKey')],
    PersonBehaviourAssignments: [key('AssignmentKey')], BehaviourObjectiveLibrary: [key('BehaviourObjectiveKey')],
    BehaviourFocusCatalogue: contract(C2B_BEHAVIOUR_FOCUS_ROW_FIELDS),
    BehaviourCataloguePublications: contract(C2B_BEHAVIOUR_PUBLICATION_FIELDS),
    ControlCases: [key(binding.fields.controlCaseKey), ...C2B_CONTROL_CASE_PHYSICAL_FIELDS
      .filter(name => name !== binding.fields.controlCaseKey).map(named)],
    TenantProvisioningReceipts: contract(C2B_PROVISIONING_RECEIPT_FIELDS)
  };
  if (binding.lists.some(list => (requiredFields[list.purpose] || []).some(field =>
    !list.observedFields.some(observed => observed.internalName === field.internalName
      && (field.type === undefined || observed.type === field.type)
      && (field.required === undefined || observed.required === field.required)
      && (field.indexed === undefined || observed.indexed === field.indexed)
      && (field.unique === undefined || observed.unique === field.unique)))))
    fail('C2B_NATIVE_FIELD_RECEIPT_INCOMPLETE', 'Observed list fields do not prove every physical operation binding.');
  const principals = binding.principals;
  const principalIds = [principals.processorPrincipalId, principals.primaryOwnerPrincipalId,
    principals.backupOwnerPrincipalId, principals.visitorsGroupId, ...principals.administratorPrincipalIds,
    ...principals.submitterPrincipalIds, ...principals.actorPrincipalIds, ...principals.negativePrincipalIds];
  const roleIds = [principals.processorRoleId, principals.administratorRoleId, principals.submitterRoleId,
    principals.actorReadRoleId, principals.visitorsRoleId];
  const expectedRoleIds = Array.from(new Set(roleIds)).sort((left, right) => left - right);
  const observedRoleIds = principals.roleDefinitions.map(role => role.roleId).sort((left, right) => left - right);
  const readRole = principals.roleDefinitions.find(role => role.roleId === principals.visitorsRoleId);
  if (principalIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(principalIds).size !== principalIds.length
    || roleIds.some(id => !Number.isSafeInteger(id) || id < 1)
    || principals.roleDefinitions.some(role => !Number.isSafeInteger(role.roleId) || role.roleId < 1
      || !nonBlank(role.name) || !Number.isSafeInteger(role.roleTypeKind) || role.roleTypeKind < 1
      || !/^\d+$/.test(role.basePermissionsHigh) || !/^\d+$/.test(role.basePermissionsLow))
    || new Set(observedRoleIds).size !== observedRoleIds.length
    || canonicaliseC2b(observedRoleIds) !== canonicaliseC2b(expectedRoleIds)
    || principals.actorReadRoleId !== principals.visitorsRoleId || principals.visitorsRole !== 'Read'
    || readRole?.name !== 'Read' || readRole.roleTypeKind !== 2) {
    fail('C2B_NATIVE_PRINCIPAL_BINDING_INVALID', 'Principals must be unique immutable IDs and Visitors must remain Read.');
  }
  const keyedIds = principals.principalKeyBindings.map(item => item.principalId);
  const keyedNames = principals.principalKeyBindings.map(item => item.principalKey);
  const expectedKeyedIds = [principals.processorPrincipalId, ...principals.administratorPrincipalIds,
    ...principals.submitterPrincipalIds, ...principals.actorPrincipalIds, ...principals.negativePrincipalIds].sort();
  if (keyedIds.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(keyedIds).size !== keyedIds.length
    || keyedNames.some(name => !nonBlank(name)) || new Set(keyedNames).size !== keyedNames.length
    || canonicaliseC2b([...keyedIds].sort()) !== canonicaliseC2b(expectedKeyedIds)
    || principals.principalKeyBindings.some(item => item.principalId === principals.processorPrincipalId
      ? item.category !== 'Processor' : principals.administratorPrincipalIds.includes(item.principalId)
        ? item.category !== 'Administrator' : principals.submitterPrincipalIds.includes(item.principalId)
          ? item.category !== 'Submitter' : principals.actorPrincipalIds.includes(item.principalId)
            ? item.category !== 'Actor' : item.category !== 'Negative'))
    fail('C2B_NATIVE_PRINCIPAL_KEY_BINDING_INVALID', 'Every executable principal needs one exact stable-key mapping.');
  const fields = Object.values(binding.fields);
  if (fields.some(value => !nonBlank(value)) || new Set(fields).size !== fields.length
    || Object.keys(EXACT_STORAGE_FIELDS).some(key =>
      binding.fields[key as keyof IC2bNativeStorageFields] !== EXACT_STORAGE_FIELDS[key as keyof IC2bNativeStorageFields]))
    fail('C2B_NATIVE_FIELD_BINDING_INVALID', 'Every native storage field must be non-blank and unambiguous.');
  const planning = binding.planningAuthority;
  const delivery = planning?.deliveryWeightConfiguration;
  const deliveryAuthority = delivery?.authority;
  const coreListIds = planning && nonBlank(planning.coreKpiMasterListId) && nonBlank(planning.coreAnnualTargetsListId)
    ? [normalGuid(planning.coreKpiMasterListId), normalGuid(planning.coreAnnualTargetsListId)] : [];
  const pin = planning?.behaviourCataloguePin;
  const initialPinValid = !pin || pin.catalogueVersion !== 'KCF-BHV-PD03-2026.09-v1'
    || (pin.catalogueKey === 'KCF-KCCC-BEHAVIOUR-FOCUS' && pin.revision === 1
      && pin.contentSha256.toUpperCase() === 'FADBC5D795AB7F092D984EF19F91B936BC23337F828F53EB5B0C86CADBCE709C'
      && pin.contentCanonicalUtf8ByteLength === 35668
      && pin.sourceRowsCanonicalSha256.toUpperCase() === 'FADBC5D795AB7F092D984EF19F91B936BC23337F828F53EB5B0C86CADBCE709C'
      && pin.generatedRowsJsonSha256.toUpperCase() === '3420F5D1FDF3E427F65E2F54FB86545DFC94699992F818921AE7783D790F15E4'
      && pin.sourceSha256.toUpperCase() === '851BA6C4C315986ADB17F3FC0ADCFDAFBA59B225BD97201918462CC85AD338A4'
      && pin.rowCount === 75 && pin.approvalReference === 'KCF-KPI-Sponsor-BEH-V1-001'
      && pin.sourcePath === 'data/test-pilot/behaviour-catalogue.v2.json');
  if (!planning || planning.schemaRevision !== (v2 ? C2B_ANNUAL_SELECTION_SCHEMA_REVISION : B01_SCHEMA_REVISION)
    || !nonBlank(planning.behaviourContractVersion)
    || (v2 && (!pin || pin.catalogueKey !== 'KCF-KCCC-BEHAVIOUR-FOCUS'
      || !nonBlank(pin.catalogueVersion) || !Number.isSafeInteger(pin.revision) || pin.revision < 1
      || !SHA256.test(pin.contentSha256) || !SHA256.test(pin.sourceSha256)
      || !Number.isSafeInteger(pin.contentCanonicalUtf8ByteLength)
      || pin.contentCanonicalUtf8ByteLength < 1
      || !SHA256.test(pin.sourceRowsCanonicalSha256) || !nonBlank(pin.approvalReference)
      || !SHA256.test(pin.generatedRowsJsonSha256)
      || !nonBlank(pin.sourcePath) || !Number.isSafeInteger(pin.rowCount) || pin.rowCount < 1))
    || (!v2 && pin !== undefined)
    || !initialPinValid
    || planning.initialState !== 'Draft' || planning.initialAccessState !== 'EmployeeEdit'
    || planning.initialTransitionStatus !== 'Ready' || !nonBlank(planning.processorPrincipalKey)
    || !Array.isArray(planning.adminPrincipalKeys) || !planning.adminPrincipalKeys.length
    || planning.adminPrincipalKeys.some(keyValue => !nonBlank(keyValue))
    || new Set(planning.adminPrincipalKeys).size !== planning.adminPrincipalKeys.length
    || !nonBlank(planning.coreCatalogueProviderReference) || coreListIds.length !== 2 || coreListIds.some(id => !GUID.test(id))
    || new Set(coreListIds).size !== coreListIds.length || coreListIds.some(id => ids.includes(id)))
    fail('C2B_NATIVE_PLANNING_AUTHORITY_INVALID', 'Planning configuration must come from immutable authority.');
  if (delivery && (!GUID.test(normalGuid(delivery.listId)) || !nonBlank(delivery.listTitle)
    || coreListIds.includes(normalGuid(delivery.listId)) || ids.includes(normalGuid(delivery.listId))
    || !deliveryAuthority || !nonBlank(deliveryAuthority.configurationId)
    || !nonBlank(deliveryAuthority.version) || !nonBlank(deliveryAuthority.etag)
    || deliveryAuthority.approvalReference !== 'KCF-KPI-Sponsor-PD-01'
    || !SHA256.test(deliveryAuthority.contentSha256)
    || !nonBlank(deliveryAuthority.effectiveFrom) || !nonBlank(deliveryAuthority.publishedAt)
    || !nonBlank(deliveryAuthority.publishedBy) || !nonBlank(deliveryAuthority.changeReference)))
    fail('C2B_NATIVE_DELIVERY_AUTHORITY_INVALID', 'Governed Delivery configuration binding is incomplete.');
}

/** Shape emitted by the tenant binding template once Runtime has filled and receipted it. */
export interface IC2bTenantBindingReceipt {
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v1' | 'kcf.kpi.wib12.tenant-layer.v2';
  enabled: boolean;
  activated: boolean;
  bindingReceiptSha256: string;
  previousProvisioningReceiptSha256?: string;
  builtCandidate: { commit: string; tree: string; tenantPacketManifestSha256: string; companionPackageSha256: string };
  targetEvidence: ITenantTargetEvidence;
  package: { workflowId: string; workflowName: string };
  connectionReference: { id: string; connector: 'shared_sharepointonline';
    primaryOwnerPrincipalId: number; backupOwnerPrincipalId: number };
  nativeStorageFields: IC2bNativeStorageFields;
  planningAuthority: IC2bNativePlanningAuthority;
  lists: readonly IC2bTenantListBinding[];
  principals: {
    processor: number; administrators: readonly number[]; submitters: readonly number[]; actors: readonly number[];
    negative: readonly number[]; visitorsGroup: number; visitorsRole: 'Read'; processorRoleId: number;
    administratorRoleId: number; submitterRoleId: number; actorReadRoleId: number; visitorsRoleId: number;
    roleDefinitions: IC2bTenantPrincipalBindings['roleDefinitions'];
    principalKeyBindings: IC2bTenantPrincipalBindings['principalKeyBindings'];
  };
}

/** Exact, non-coercing mapper from the generated receipt format to the executable adapter binding. */
export function bindC2bTenantNativeBinding(
  value: unknown,
  expectedCandidate: IC2bTenantCandidateIdentity,
  authority: IC2bTenantBindingAuthority
): IC2bTenantNativeBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail('C2B_NATIVE_BINDER_INPUT_INVALID', 'A complete binding receipt object is required.');
  const receipt = value as IC2bTenantBindingReceipt;
  if (receipt.enabled !== true || receipt.activated !== true || !receipt.builtCandidate
    || !receipt.connectionReference || !receipt.principals || !receipt.package
    || !receipt.nativeStorageFields || !receipt.planningAuthority || !Array.isArray(receipt.lists)
    || !Array.isArray(receipt.principals.roleDefinitions)
    || !Array.isArray(receipt.principals.principalKeyBindings)) {
    fail('C2B_NATIVE_BINDER_INPUT_INVALID', 'Binding receipt is incomplete, disabled or not activated.');
  }
  const binding: IC2bTenantNativeBinding = {
    contractVersion: receipt.contractVersion, enabled: true, activationAuthorised: receipt.activated,
    bindingReceiptSha256: receipt.bindingReceiptSha256,
    ...(receipt.previousProvisioningReceiptSha256
      ? { previousProvisioningReceiptSha256: receipt.previousProvisioningReceiptSha256 } : {}),
    candidate: { ...receipt.builtCandidate },
    workflow: { id: receipt.package.workflowId, name: receipt.package.workflowName },
    targetEvidence: receipt.targetEvidence, connectionReferenceId: receipt.connectionReference.id,
    connector: receipt.connectionReference.connector,
    lists: receipt.lists.map(list => ({ ...list, observedFields: [...list.observedFields] })),
    principals: {
      processorPrincipalId: receipt.principals.processor,
      primaryOwnerPrincipalId: receipt.connectionReference.primaryOwnerPrincipalId,
      backupOwnerPrincipalId: receipt.connectionReference.backupOwnerPrincipalId,
      administratorPrincipalIds: [...receipt.principals.administrators],
      submitterPrincipalIds: [...receipt.principals.submitters], actorPrincipalIds: [...receipt.principals.actors],
      negativePrincipalIds: [...receipt.principals.negative], visitorsGroupId: receipt.principals.visitorsGroup,
      processorRoleId: receipt.principals.processorRoleId, administratorRoleId: receipt.principals.administratorRoleId,
      submitterRoleId: receipt.principals.submitterRoleId, actorReadRoleId: receipt.principals.actorReadRoleId,
      visitorsRoleId: receipt.principals.visitorsRoleId, visitorsRole: receipt.principals.visitorsRole,
      roleDefinitions: receipt.principals.roleDefinitions.map(item => ({ ...item })),
      principalKeyBindings: receipt.principals.principalKeyBindings.map(item => ({ ...item }))
    },
    fields: { ...receipt.nativeStorageFields },
    planningAuthority: { ...receipt.planningAuthority, adminPrincipalKeys: [...receipt.planningAuthority.adminPrincipalKeys] }
  };
  assertC2bTenantNativeBinding(binding, expectedCandidate, immutableTenantInput(authority));
  return immutableTenantInput(binding);
}

function exactSourceObservation(
  source: C2bTrustedCommandSource,
  route: 'Employee' | 'Manager',
  record: IC2bSharePointRecord,
  fields: IC2bNativeStorageFields
): IC2bNativeSourceObservation {
  if (record.itemVersion !== source.itemVersion)
    fail('C2B_NATIVE_SOURCE_VERSION_MISMATCH', 'The immutable command source version changed.');
  const authorEmail = record.authorEmail;
  if (!nonBlank(authorEmail)) throw new Error('C2B_NATIVE_SOURCE_AUTHOR_ABSENT: The immutable source Author is absent.');
  return { source, sourceETag: record.etag, sourceRowVersion: source.itemVersion, route,
    authorEmail: authorEmail.trim().toLowerCase(), envelope: parseJsonField(record, fields.sourcePayloadJson,
      'C2B_NATIVE_SOURCE_PAYLOAD_INVALID') };
}

export default class EmployeeWorkplanV2C2bSharePointNativeAdapter
implements IEmployeeWorkplanV2C2bNativeAdapter {
  public readonly contractVersion = C2B_NATIVE_ADAPTER_CONTRACT_VERSION;
  public readonly capabilities: IC2bNativeAdapterCapabilities = C2B_REQUIRED_NATIVE_ADAPTER_CAPABILITIES;
  private readonly binding: IC2bTenantNativeBinding;
  private plannedBehaviour?: C2bTrustedBehaviourV2Observations;

  public constructor(
    private readonly port: IC2bNativeSharePointPort,
    binding: IC2bTenantNativeBinding,
    expectedCandidate: IC2bTenantCandidateIdentity,
    authority: IC2bTenantBindingAuthority,
    private readonly commandSourceReader?: C2bCommandSourceStorageV1
  ) {
    const immutableBinding = immutableTenantInput(binding);
    const immutableCandidate = immutableTenantInput(expectedCandidate);
    const immutableAuthority = immutableTenantInput(authority);
    assertC2bTenantNativeBinding(immutableBinding, immutableCandidate, immutableAuthority);
    this.binding = immutableBinding;
  }

  public async readCommandSourceTwice(source: C2bTrustedCommandSource): Promise<IC2bNativeSourceDoubleRead> {
    const employee = this.list('EmployeeCommands');
    const manager = this.list('ManagerCommands');
    const sourceId = normalGuid(source.listId);
    const selected = sourceId === normalGuid(employee.listId) ? { list: employee, route: 'Employee' as const }
      : sourceId === normalGuid(manager.listId) ? { list: manager, route: 'Manager' as const }
        : fail('C2B_NATIVE_SOURCE_LIST_FORGED', 'The source list is not an exact bound command list.');
    if (this.commandSourceReader !== undefined) {
      const reader = this.commandSourceReader; const read = this.port.readCommandRawSource;
      if (typeof read !== 'function') return fail('C2B_NATIVE_COMMAND_CAPTURE_UNAVAILABLE', 'The explicit reader needs complete raw captures.');
      const admission = await reader.prepare({ source: { ...source, listId: sourceId }, route: selected.route,
        payloadField: this.binding.fields.sourcePayloadJson as 'PayloadJSON',
        siteUrl: this.binding.targetEvidence.siteUrl.trim().replace(/\/+$/, ''),
        site: this.binding.targetEvidence.siteCollectionId, web: this.binding.targetEvidence.rootWebId,
        candidate: { commit: this.binding.candidate.commit, tree: this.binding.candidate.tree } });
      try {
        const firstRaw = await read.call(this.port, selected.list.listId, source.itemId, admission);
        const secondRaw = await read.call(this.port, selected.list.listId, source.itemId, admission);
        if (firstRaw.sha256 !== secondRaw.sha256 || firstRaw.requestUrl !== secondRaw.requestUrl
          || firstRaw.responseUrl !== secondRaw.responseUrl || firstRaw.status !== secondRaw.status
          || ['etag', 'content-type', 'content-length', 'content-encoding'].some(name =>
            JSON.stringify(firstRaw.headers.filter(([key]) => key.toLowerCase() === name).map(([, value]) => value))
            !== JSON.stringify(secondRaw.headers.filter(([key]) => key.toLowerCase() === name).map(([, value]) => value)))) {
          return fail('C2B_NATIVE_COMMAND_SOURCE_DRIFT', 'The two complete source captures differ before hydration.');
        }
        // Both complete raw observations must exist before hydration or planning.
        const first = await reader.read(firstRaw, admission); const second = await reader.read(secondRaw, admission);
        return { first, second };
      } catch (error) { return reader.hold(admission, error); }
    }
    const firstRecord = await this.port.readItemById(selected.list.listId, source.itemId);
    const secondRecord = await this.port.readItemById(selected.list.listId, source.itemId);
    if (!firstRecord || !secondRecord) throw new Error('C2B_NATIVE_SOURCE_ABSENT: Both source reads are required.');
    return { first: exactSourceObservation(source, selected.route, firstRecord, this.binding.fields),
      second: exactSourceObservation(source, selected.route, secondRecord, this.binding.fields) };
  }

  public async readPlanningObservations(admittedSource: Readonly<IC2bNativeSourceObservation>):
  Promise<IC2bNativePlanningObservations> {
    if (admittedSource.commandSource) await assertCommandSourcePairV1(admittedSource);
    const { commandSource, ...originalSource } = admittedSource;
    // Planning consumes the complete original logical envelope; raw buffers stay in the immutable source pair.
    const source = immutableTenantInput(commandSource ? originalSource : admittedSource);
    const first = await this.port.readPlanningProjection(this.binding, source);
    const second = await this.port.readPlanningProjection(this.binding, source);
    if (first.provenanceSha256 !== second.provenanceSha256)
      fail('C2B_NATIVE_PLANNING_PROVENANCE_TOCTOU', 'Authoritative provider identities changed between projections.');
    const stable = immutableTenantInput(assertStableC2bPlanningProjection(first.observations, second.observations, source));
    this.plannedBehaviour = stable.behaviourV2;
    return stable;
  }

  public async readJournal(commandKey: string): Promise<{ journal?: C2bCommandJournal; etag: string | null }> {
    const list = this.list('CommandJournal');
    const record = await this.port.readItemByStableKey(list.listId, this.binding.fields.journalKey, commandKey);
    return record ? { journal: deserialiseC2bJournalRow(record.fields),
      etag: record.etag } : { etag: null };
  }

  public async compareExchangeJournal(journal: C2bCommandJournal, expectedETag: string | null): Promise<{ etag: string }> {
    this.assertMutationAuthority();
    if (this.binding.contractVersion === 'kcf.kpi.wib12.tenant-layer.v2'
      && journal.plan.commandType === 'UpsertBehaviourCommitmentV2' && !this.plannedBehaviour?.focusCatalogue) {
      fail('C2B_NATIVE_FOCUS_PLANNING_MISSING', 'A trusted versioned focus observation is required before the Behaviour journal.');
    }
    await this.assertV2FocusStillStable();
    const list = this.list('CommandJournal');
    const fields = serialiseC2bJournalRow(journal);
    const outcome = expectedETag === null
      ? await this.port.createPhysicalRow(list.listId, this.binding.fields.journalKey, journal.plan.commandKey, fields)
      : await this.compareExchangeExisting(list.listId, this.binding.fields.journalKey, journal.plan.commandKey,
        expectedETag, fields);
    if (outcome.outcome !== 'Confirmed') throw new Error(`C2B_NATIVE_JOURNAL_UNKNOWN: ${outcome.safeCode}`);
    deserialiseC2bJournalRow(outcome.observed.fields);
    return { etag: outcome.observed.etag };
  }

  public async persistEffectState(effect: C2bCommandEffect, journalETag: string,
    journal: C2bCommandJournal): Promise<{ etag: string }> {
    this.assertMutationAuthority();
    if (!nonBlank(journalETag)) fail('C2B_NATIVE_EFFECT_JOURNAL_ETAG_ABSENT', 'Effect persistence requires journal CAS.');
    const list = this.list('CommandEffects');
    serialiseC2bEffectRow(journal.plan.commandKey, effect, journalETag, journal);
    const outcome = await this.port.persistEffectState(list.listId, this.binding.fields.effectKey, effect,
      journalETag, immutableTenantInput(journal));
    if (outcome.outcome !== 'Confirmed') throw new Error(`C2B_NATIVE_EFFECT_UNKNOWN: ${outcome.safeCode}`);
    return { etag: outcome.observed.etag };
  }

  public readWorkplan(workplanKey: string): Promise<C2bCanonicalEntityReadback | undefined> {
    const list = this.list('Workplans');
    return this.port.readDirect(list.listId, 'Workplans', this.binding.fields.workplanKey, workplanKey);
  }

  public async readWorkplanItemsPage(workplanKey: string, cursor: string | null):
  Promise<IC2bNativePage<C2bCanonicalEntityReadback>> {
    const list = this.list('WorkplanItems');
    const page = await this.port.readDirectPage(list.listId, workplanKey, cursor);
    if (page.pageNumber < 1 || page.complete === (page.nextCursor !== null))
      fail('C2B_NATIVE_PAGE_INVALID', 'Page completion and cursor state are inconsistent.');
    return page;
  }

  public compareExchangeWorkplan(effect: C2bCommandEffect): Promise<C2bNativeEffectResult> {
    return this.applyCanonical('Workplans', effect, ['Claim', 'Finalise', 'CanonicalUpsert']);
  }

  public async compareExchangeWorkplanItem(effect: C2bCommandEffect): Promise<C2bNativeEffectResult> {
    await this.assertV2FocusStillStable();
    return this.applyCanonical('WorkplanItems', effect, ['CanonicalUpsert']);
  }

  public async consumeAuthoritativeControlCase(effect: C2bCommandEffect): Promise<C2bNativeEffectResult> {
    this.assertEffect(effect, 'AuthoritativeControlCase', ['ControlCaseConsume']);
    this.assertMutationAuthority();
    return this.effectResult(effect, await this.port.consumeControlCase(effect));
  }

  public async reconcileEmployeeContainerAcl(effect: C2bCommandEffect): Promise<C2bNativeEffectResult> {
    if (effect.target !== 'Workplans' && effect.target !== 'WorkplanItems')
      throw new Error('C2B_NATIVE_ACL_TARGET_INVALID: ACL reconciliation is limited to employee containers.');
    this.assertEffect(effect, effect.target, ['Grant', 'Revoke']);
    this.assertMutationAuthority();
    return this.effectResult(effect, await this.port.reconcileContainerAcl(this.list(effect.target).listId,
      effect, this.binding.principals));
  }

  public async appendAudit(effect: C2bCommandEffect): Promise<C2bNativeEffectResult> {
    this.assertEffect(effect, 'Audit', ['AuditAppend']);
    this.assertMutationAuthority();
    return this.effectResult(effect, await this.port.appendAudit(this.list('Audit').listId, effect));
  }

  public async createImmutableReceipt(effect: C2bCommandEffect, receipt: C2bTerminalReceipt,
    provenance: IC2bNativeReceiptProvenance):
  Promise<C2bNativeEffectResult> {
    this.assertEffect(effect, 'CommandReceipts', ['ReceiptCreate']);
    this.assertMutationAuthority();
    if (effect.naturalKey !== receipt.receiptKey || effect.desiredSha256 === '')
      fail('C2B_NATIVE_RECEIPT_BINDING_INVALID', 'Receipt identity is not bound to the immutable effect.');
    const immutableProvenance = immutableTenantInput(provenance);
    const actorBinding = this.binding.principals.principalKeyBindings
      .find(item => item.principalKey === immutableProvenance.actor.personKey);
    const processorBinding = this.binding.principals.principalKeyBindings
      .find(item => item.principalKey === immutableProvenance.processor.principalKey);
    const expectedActorCategory = immutableProvenance.actor.effectiveRole === 'SystemAdmin' ? 'Administrator' : 'Actor';
    if (!actorBinding || actorBinding.category !== expectedActorCategory
      || !processorBinding || processorBinding.category !== 'Processor'
      || processorBinding.principalId !== this.binding.principals.processorPrincipalId
      || immutableProvenance.processor.principalKey !== this.binding.planningAuthority.processorPrincipalKey) {
      fail('C2B_NATIVE_RECEIPT_AUTHORITY_INVALID', 'Actor and processor provenance must match immutable principal authority.');
    }
    const list = this.list('CommandReceipts');
    serialiseC2bTerminalReceiptRow(receipt, immutableProvenance);
    const outcome = await this.port.createTerminalReceipt(list.listId, effect, receipt, immutableProvenance);
    return this.effectResult(effect, outcome);
  }

  public async reconcileReceiptActorRead(effect: C2bCommandEffect, receipt: C2bTerminalReceipt):
  Promise<C2bNativeEffectResult> {
    this.assertEffect(effect, 'CommandReceipts', ['ReceiptGrant']);
    this.assertMutationAuthority();
    if (effect.naturalKey !== receipt.receiptKey)
      fail('C2B_NATIVE_RECEIPT_ACL_BINDING_INVALID', 'Receipt ACL identity is crossed.');
    return this.effectResult(effect, await this.port.reconcileReceiptActorRead(this.list('CommandReceipts').listId,
      effect, receipt, this.binding.principals));
  }

  public async readStableCanonicalProof(journal: C2bCommandJournal): Promise<C2bStableReadProof> {
    const proof = await this.port.readStableProof(this.binding, journal);
    if (!proof.first.pagination.complete || !proof.second.pagination.complete
      || proof.first.pagination.nextLink !== null || proof.second.pagination.nextLink !== null) {
      fail('C2B_NATIVE_STABLE_READ_INCOMPLETE', 'Both stable reads must be completely paged.');
    }
    return proof;
  }

  public recoverUnknownEffect(journal: C2bCommandJournal, effect: C2bCommandEffect):
  Promise<C2bNativeRecoveryResult> {
    this.assertMutationAuthority();
    if (effect.disposition !== 'Unknown' && effect.disposition !== 'Held')
      fail('C2B_NATIVE_RECOVERY_NOT_UNKNOWN', 'Recovery is limited to an exact unknown or held effect.');
    return this.port.recoverExact(this.binding, journal, effect);
  }

  private async assertV2FocusStillStable(): Promise<void> {
    if (this.binding.contractVersion !== 'kcf.kpi.wib12.tenant-layer.v2'
      || !this.plannedBehaviour) return;
    const assertStable = this.port.assertBehaviourCatalogueStable;
    if (!this.plannedBehaviour.focusCatalogue || !assertStable) {
      return fail('C2B_NATIVE_FOCUS_STABLE_READ_UNAVAILABLE', 'The versioned focus catalogue cannot be rechecked before mutation.');
    }
    await assertStable.call(this.port, this.plannedBehaviour);
  }

  private list(purpose: C2bTenantListPurpose): IC2bTenantListBinding {
    return this.binding.lists.find(list => list.purpose === purpose)
      || fail('C2B_NATIVE_LIST_UNBOUND', `${purpose} is not bound.`);
  }

  private assertMutationAuthority(): void {
    if (!this.binding.activationAuthorised)
      fail('C2B_NATIVE_ACTIVATION_NOT_AUTHORISED', 'The generated flow and native mutation path remain Off.');
  }

  private assertEffect(effect: C2bCommandEffect, target: C2bCommandEffect['target'], kinds: readonly string[]): void {
    if (effect.target !== target || !kinds.includes(effect.kind) || effect.kind.toLowerCase().includes('delete'))
      fail('C2B_NATIVE_EFFECT_SCOPE_INVALID', `${effect.kind}/${effect.target} is outside the exact adapter route.`);
  }

  private async applyCanonical(purpose: 'Workplans' | 'WorkplanItems', effect: C2bCommandEffect,
    kinds: readonly string[]): Promise<C2bNativeEffectResult> {
    this.assertEffect(effect, purpose, kinds);
    this.assertMutationAuthority();
    return this.effectResult(effect, await this.port.applyCanonicalEffect(this.list(purpose).listId, effect));
  }

  private async compareExchangeExisting(listId: string, keyField: string, stableKey: string,
    expectedETag: string, fields: Readonly<Record<string, unknown>>): Promise<C2bSharePointMutationOutcome> {
    const existing = await this.port.readItemByStableKey(listId, keyField, stableKey);
    if (!existing || existing.etag !== expectedETag)
      throw new Error(`C2B_NATIVE_CAS_STALE: ${stableKey} does not match the requested ETag.`);
    return this.port.compareExchangePhysicalRow(listId, existing.itemId, expectedETag, fields);
  }

  private effectResult(effect: C2bCommandEffect, outcome: C2bSharePointMutationOutcome): C2bNativeEffectResult {
    if (outcome.outcome === 'Unknown') return outcome;
    const confirmation: C2bEffectConfirmation = {
      providerReference: outcome.providerReference, naturalKey: effect.naturalKey,
      requestETag: effect.expectedETag, observedETag: outcome.observed.etag,
      observedRowVersionToken: effect.kind === 'ReceiptCreate' || effect.kind === 'ReceiptGrant'
        ? null : outcome.observed.rowVersionToken,
      readback: outcome.observed.fields
    };
    if (canonicaliseC2b(outcome.observed.fields).length === 0)
      fail('C2B_NATIVE_EMPTY_READBACK', 'Every effect requires canonical readback.');
    return { outcome: 'Confirmed', confirmation };
  }
}
