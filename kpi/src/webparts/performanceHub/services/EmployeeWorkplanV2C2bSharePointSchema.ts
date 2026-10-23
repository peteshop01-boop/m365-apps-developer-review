/* eslint-disable @rushstack/no-new-null -- null is the explicit unbound/default-free SharePoint contract value */
import {
  C2B_LIST_CAPABILITY_REQUIREMENTS,
  type C2bListPurpose,
  type C2bPermissionCapability
} from './TestPilotCommandAdmissionC2b';

export const C2B_SHAREPOINT_PHYSICAL_CONTRACT_VERSION = 'kcf.kpi.c2b.sharepoint.v1' as const;
export const C2B_SHAREPOINT_DEFAULT_MODE = 'Disabled' as const;
export const C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS = 60000;
export const C2B_JOURNAL_JSON_CHUNK_COUNT = 16;
export const C2B_EFFECT_JSON_CHUNK_COUNT = 8;

export type C2bSharePointFieldType = 'Text' | 'Note' | 'Choice' | 'Number' | 'DateTime';

export interface IC2bSharePointFieldContract {
  displayName: string;
  internalName: string;
  type: C2bSharePointFieldType;
  required: boolean;
  nullable: boolean;
  defaultValue: string | number | null;
  indexed: boolean;
  unique: boolean;
  maxLength?: number;
  choices?: readonly string[];
  decimals?: 0;
  minimum?: number;
  maximum?: number;
  dateTimeFormat?: 'DateTime';
  richText?: false;
  appendOnly?: false;
}

export interface IC2bSharePointListContract {
  purpose: 'CommandJournal' | 'CommandEffects';
  title: string;
  template: 100;
  schemaRevision: 'c2b-annual-v2';
  versioningEnabled: true;
  foldersEnabled: false;
  permissionCapability: 'PrivateProcessorOnly';
  fields: readonly IC2bSharePointFieldContract[];
  capacity: {
    encoding: 'CanonicalJSON';
    chunkCodeUnits: number;
    chunkCount: number;
    maximumCodeUnits: number;
    overflowBehaviour: 'FailClosedBeforeWrite';
  };
}

const text = (internalName: string, required: boolean, maxLength: number,
  indexed = false, unique = false): IC2bSharePointFieldContract => ({
  displayName: internalName, internalName, type: 'Text', required, nullable: !required,
  defaultValue: null, indexed, unique, maxLength
});

const number = (internalName: string, required: boolean, minimum: number,
  maximum: number, indexed = false): IC2bSharePointFieldContract => ({
  displayName: internalName, internalName, type: 'Number', required, nullable: !required,
  defaultValue: null, indexed, unique: false, decimals: 0, minimum, maximum
});

const choice = (internalName: string, values: readonly string[], indexed = false): IC2bSharePointFieldContract => ({
  displayName: internalName, internalName, type: 'Choice', required: true, nullable: false,
  defaultValue: null, indexed, unique: false, choices: values
});

const dateTime = (internalName: string, indexed = false): IC2bSharePointFieldContract => ({
  displayName: internalName, internalName, type: 'DateTime', required: false, nullable: true,
  defaultValue: null, indexed, unique: false, dateTimeFormat: 'DateTime'
});

const chunks = (prefix: 'JournalChunk' | 'EffectChunk', count: number): IC2bSharePointFieldContract[] =>
  Array.from({ length: count }, (_, index) => {
    const internalName = `${prefix}${String(index + 1).padStart(2, '0')}`;
    return { displayName: internalName, internalName, type: 'Note', required: false, nullable: true,
      defaultValue: null, indexed: false, unique: false, richText: false, appendOnly: false };
  });

const JOURNAL_STATES = ['Planned', 'Leased', 'Claimed', 'Applying', 'Finalising', 'Ready', 'Held', 'Terminal'] as const;
const EFFECT_KINDS = ['ControlCaseConsume', 'Claim', 'CanonicalUpsert', 'Grant', 'Revoke', 'Finalise',
  'AuditAppend', 'StableRead', 'ReceiptCreate', 'ReceiptGrant'] as const;
const EFFECT_TARGETS = ['People', 'EmployeeCommands', 'ManagerCommands', 'CommandJournal', 'CommandEffects',
  'CommandReceipts', 'Workplans', 'WorkplanItems', 'Audit', 'AuthoritativeControlCase'] as const;
const EFFECT_DISPOSITIONS = ['Planned', 'Issued', 'Confirmed', 'Unknown', 'Held'] as const;
const MAX_SAFE_INTEGER = 9007199254740991;

export const C2B_COMMAND_JOURNAL_LIST_CONTRACT: Readonly<IC2bSharePointListContract> = Object.freeze({
  purpose: 'CommandJournal', title: 'KCFKPI_TEST_CommandJournal', template: 100,
  schemaRevision: 'c2b-annual-v2', versioningEnabled: true, foldersEnabled: false,
  permissionCapability: 'PrivateProcessorOnly',
  fields: Object.freeze([
    text('Title', true, 255),
    text('CommandKey', true, 36, true, true),
    choice('State', JOURNAL_STATES, true),
    number('JournalVersion', true, 1, MAX_SAFE_INTEGER),
    text('LeaseOwner', false, 255),
    number('LeaseEpoch', true, 0, MAX_SAFE_INTEGER),
    dateTime('LeaseExpiresAt', true),
    text('PlanSHA256', true, 64),
    text('PayloadSHA256', true, 64),
    text('IntendedImageSHA256', true, 64),
    text('JournalStateSHA256', true, 64),
    number('JournalStateLength', true, 2, C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS * C2B_JOURNAL_JSON_CHUNK_COUNT),
    number('JournalChunkCount', true, 1, C2B_JOURNAL_JSON_CHUNK_COUNT),
    number('EffectCount', true, 0, MAX_SAFE_INTEGER),
    text('TerminalEvidenceSHA256', false, 64),
    ...chunks('JournalChunk', C2B_JOURNAL_JSON_CHUNK_COUNT)
  ]),
  capacity: Object.freeze({ encoding: 'CanonicalJSON', chunkCodeUnits: C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS,
    chunkCount: C2B_JOURNAL_JSON_CHUNK_COUNT,
    maximumCodeUnits: C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS * C2B_JOURNAL_JSON_CHUNK_COUNT,
    overflowBehaviour: 'FailClosedBeforeWrite' })
});

export const C2B_COMMAND_EFFECTS_LIST_CONTRACT: Readonly<IC2bSharePointListContract> = Object.freeze({
  purpose: 'CommandEffects', title: 'KCFKPI_TEST_CommandEffects', template: 100,
  schemaRevision: 'c2b-annual-v2', versioningEnabled: true, foldersEnabled: false,
  permissionCapability: 'PrivateProcessorOnly',
  fields: Object.freeze([
    text('Title', true, 255),
    text('EffectKey', true, 255, true, true),
    text('CommandKey', true, 36, true),
    number('Sequence', true, 1, MAX_SAFE_INTEGER, true),
    choice('Kind', EFFECT_KINDS),
    choice('Target', EFFECT_TARGETS),
    choice('Disposition', EFFECT_DISPOSITIONS, true),
    text('JournalETag', true, 255),
    text('BeforeSHA256', true, 64),
    text('DesiredSHA256', true, 64),
    text('EffectSHA256', true, 64),
    text('ConfirmationSHA256', false, 64),
    text('EffectStateSHA256', true, 64),
    number('EffectStateLength', true, 2, C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS * C2B_EFFECT_JSON_CHUNK_COUNT),
    number('EffectChunkCount', true, 1, C2B_EFFECT_JSON_CHUNK_COUNT),
    ...chunks('EffectChunk', C2B_EFFECT_JSON_CHUNK_COUNT)
  ]),
  capacity: Object.freeze({ encoding: 'CanonicalJSON', chunkCodeUnits: C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS,
    chunkCount: C2B_EFFECT_JSON_CHUNK_COUNT,
    maximumCodeUnits: C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS * C2B_EFFECT_JSON_CHUNK_COUNT,
    overflowBehaviour: 'FailClosedBeforeWrite' })
});

export interface IC2bExistingListRemediationContract {
  purpose: Exclude<C2bListPurpose, 'CommandJournal' | 'CommandEffects'>;
  title: string;
  template: 100;
  addIndexes: readonly string[];
  enforceUnique: readonly string[];
  disableFolders: boolean;
  permissionCapability: C2bPermissionCapability;
  preconditions: readonly ('CompleteCountAndThresholdCheck' | 'CompleteDuplicateNullBlankScan'
    | 'ZeroFolderObjects' | 'PermissionBindingsAndAclRollback')[];
}

export const C2B_EXISTING_LIST_REMEDIATIONS: readonly IC2bExistingListRemediationContract[] = Object.freeze([
  { purpose: 'People', title: 'KCFKPI_TEST_People', template: 100, addIndexes: [], enforceUnique: [], disableFolders: false,
    permissionCapability: 'PrivateProcessorOnly', preconditions: ['PermissionBindingsAndAclRollback'] },
  { purpose: 'EmployeeCommands', title: 'KCFKPI_TEST_EmployeeCommands', template: 100, addIndexes: ['Created'],
    enforceUnique: ['CommandKey'], disableFolders: true, permissionCapability: 'CommandSubmitterCreateOnly',
    preconditions: ['CompleteCountAndThresholdCheck', 'CompleteDuplicateNullBlankScan', 'ZeroFolderObjects',
      'PermissionBindingsAndAclRollback'] },
  { purpose: 'ManagerCommands', title: 'KCFKPI_TEST_ManagerCommands', template: 100, addIndexes: ['Created'],
    enforceUnique: ['CommandKey'], disableFolders: true, permissionCapability: 'CommandSubmitterCreateOnly',
    preconditions: ['CompleteCountAndThresholdCheck', 'CompleteDuplicateNullBlankScan', 'ZeroFolderObjects',
      'PermissionBindingsAndAclRollback'] },
  { purpose: 'CommandReceipts', title: 'KCFKPI_TEST_CommandReceipts', template: 100, addIndexes: [],
    enforceUnique: ['CommandKey'], disableFolders: true, permissionCapability: 'ProcessorOwnedReceiptActorRead',
    preconditions: ['CompleteDuplicateNullBlankScan', 'ZeroFolderObjects', 'PermissionBindingsAndAclRollback'] },
  { purpose: 'Workplans', title: 'KCFKPI_TEST_Workplans', template: 100, addIndexes: [], enforceUnique: [], disableFolders: false,
    permissionCapability: 'EmployeeContainerInheritance', preconditions: ['PermissionBindingsAndAclRollback'] },
  { purpose: 'WorkplanItems', title: 'KCFKPI_TEST_WorkplanItems', template: 100, addIndexes: [], enforceUnique: [], disableFolders: false,
    permissionCapability: 'EmployeeContainerInheritance', preconditions: ['PermissionBindingsAndAclRollback'] },
  { purpose: 'Audit', title: 'KCFKPI_TEST_Audit', template: 100, addIndexes: [], enforceUnique: [], disableFolders: true,
    permissionCapability: 'PrivateProcessorOnly',
    preconditions: ['ZeroFolderObjects', 'PermissionBindingsAndAclRollback'] }
]);

export const C2B_SHAREPOINT_PHYSICAL_CONTRACT = Object.freeze({
  contractVersion: C2B_SHAREPOINT_PHYSICAL_CONTRACT_VERSION,
  defaultMode: C2B_SHAREPOINT_DEFAULT_MODE,
  lists: Object.freeze([C2B_COMMAND_JOURNAL_LIST_CONTRACT, C2B_COMMAND_EFFECTS_LIST_CONTRACT]),
  existingListRemediations: C2B_EXISTING_LIST_REMEDIATIONS
});

export type C2bRoleSemantic = 'FullControl' | 'Read' | 'CreateOnly';

export interface IC2bRoleDefinitionEvidence {
  roleDefinitionId: number | null;
  semantic: C2bRoleSemantic;
  canViewItems: boolean;
  canAddItems: boolean;
  canEditItems: boolean;
  canDeleteItems: boolean;
  canManagePermissions: boolean;
  canManageLists: boolean;
}

export interface IC2bCreateOnlyRoleDefinitionEvidence extends IC2bRoleDefinitionEvidence {
  roleName: string;
  basePermissionsHigh: number;
  basePermissionsLow: number;
}

export const C2B_COMMAND_CREATE_ONLY_ROLE_NAME = 'KCF KPI TEST Command Submitter Create Only v1';
export const C2B_COMMAND_CREATE_ONLY_BASE_PERMISSIONS = Object.freeze({ high: 0, low: 2 });

export interface IC2bContainerPrincipalBinding {
  purpose: 'Workplans' | 'WorkplanItems';
  containerKey: string;
  actorPrincipalIds: readonly number[];
}

export interface IC2bPermissionBindingConfiguration {
  processorPrincipalId: number | null;
  controlledAdminPrincipalIds: readonly number[];
  commandSubmitterPrincipalIds: readonly number[];
  receiptActorPrincipalIds: readonly number[];
  containerPrincipalBindings: readonly IC2bContainerPrincipalBinding[];
  negativeProofPrincipalIds: readonly number[];
  fullControlRoleDefinitionId: number | null;
  readRoleDefinitionId: number | null;
  commandCreateOnlyRoleDefinitionId: number | null;
  roleDefinitionEvidence: {
    fullControl: IC2bRoleDefinitionEvidence;
    read: IC2bRoleDefinitionEvidence;
    commandCreateOnly: IC2bCreateOnlyRoleDefinitionEvidence;
  };
  aclRollbackPrincipalId: number | null;
}

export interface IC2bSharePointProvisioningConfiguration {
  enabled: boolean;
  environmentKind: 'NonProduction';
  environmentId: string | null;
  siteUrl: string | null;
  siteCollectionId: string | null;
  webId: string | null;
  connectionReference: string | null;
  listIds: Readonly<Partial<Record<C2bListPurpose, string | null>>>;
  permissions?: IC2bPermissionBindingConfiguration;
}

export interface IC2bSharePointProvisioningTargetObservation {
  siteUrl: string | null;
  siteCollectionId: string | null;
  webId: string | null;
}

export type C2bProvisioningOperation = {
  order: number;
  kind: 'CreateOrVerifyList' | 'EnsureField' | 'EnsureIndex' | 'PreflightUnique'
    | 'EnsureUnique' | 'PreflightFolders' | 'DisableFolders' | 'PreflightThreshold'
    | 'VerifyListSettings' | 'CaptureCurrentAcl' | 'RegisterAclRollback' | 'BreakRoleInheritance'
    | 'GrantRole' | 'RevokeUnapprovedRoleAssignments' | 'VerifyEffectivePermissions'
    | 'RestoreAclOnFailure' | 'CommitAclChange';
  purpose: C2bListPurpose;
  title: string;
  field?: string;
  details?: unknown;
};

export type C2bProvisioningPlan = {
  ready: false;
  code: 'C2B_PROVISIONING_DISABLED' | 'C2B_PROVISIONING_UNBOUND' | 'C2B_PERMISSION_CONFIG_ABSENT'
    | 'C2B_PERMISSION_CONFIG_INVALID' | 'C2B_PROVISIONING_TARGET_MISMATCH';
  reasons: string[];
  operations: readonly [];
} | {
  ready: true;
  code: 'C2B_PROVISIONING_PLAN_READY';
  operations: readonly C2bProvisioningOperation[];
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const normalGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const normalSiteUrl = (value: string): string | null => {
  if (!nonBlank(value)) return null;
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { return null; }
  if (parsed.protocol.toLowerCase() !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)
    return null;
  const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
  return `https://${parsed.host.toLowerCase()}${path}`;
};
const positiveInteger = (value: number | null): value is number => Number.isSafeInteger(value) && (value || 0) > 0;
const SHAREPOINT_DESIGN_ROLE_DEFINITION_ID = 1073741828;
const SHAREPOINT_LOW_PERMISSION = Object.freeze({
  viewItems: 0x00000001,
  addItems: 0x00000002,
  editItems: 0x00000004,
  deleteItems: 0x00000008,
  manageLists: 0x00000800,
  managePermissions: 0x40000000
});

const uniquePositiveIntegers = (values: readonly number[]): boolean => values.length > 0
  && new Set(values).size === values.length && values.every(value => positiveInteger(value));

function roleEvidenceCompatible(value: IC2bRoleDefinitionEvidence | undefined, roleDefinitionId: number | null,
  expected: Omit<IC2bRoleDefinitionEvidence, 'roleDefinitionId'>): boolean {
  return !!value && value.roleDefinitionId === roleDefinitionId && value.semantic === expected.semantic
    && value.canViewItems === expected.canViewItems && value.canAddItems === expected.canAddItems
    && value.canEditItems === expected.canEditItems && value.canDeleteItems === expected.canDeleteItems
    && value.canManagePermissions === expected.canManagePermissions && value.canManageLists === expected.canManageLists;
}

function createOnlyRoleEvidenceCompatible(value: IC2bCreateOnlyRoleDefinitionEvidence | undefined,
  roleDefinitionId: number | null): boolean {
  if (!value || value.roleName !== C2B_COMMAND_CREATE_ONLY_ROLE_NAME
    || value.basePermissionsHigh !== C2B_COMMAND_CREATE_ONLY_BASE_PERMISSIONS.high
    || value.basePermissionsLow !== C2B_COMMAND_CREATE_ONLY_BASE_PERMISSIONS.low) return false;
  const low = value.basePermissionsLow >>> 0;
  const derived = {
    canViewItems: (low & SHAREPOINT_LOW_PERMISSION.viewItems) !== 0,
    canAddItems: (low & SHAREPOINT_LOW_PERMISSION.addItems) !== 0,
    canEditItems: (low & SHAREPOINT_LOW_PERMISSION.editItems) !== 0,
    canDeleteItems: (low & SHAREPOINT_LOW_PERMISSION.deleteItems) !== 0,
    canManagePermissions: (low & SHAREPOINT_LOW_PERMISSION.managePermissions) !== 0,
    canManageLists: (low & SHAREPOINT_LOW_PERMISSION.manageLists) !== 0
  };
  return roleEvidenceCompatible(value, roleDefinitionId,
    { semantic: 'CreateOnly', canViewItems: false, canAddItems: true, canEditItems: false,
      canDeleteItems: false, canManagePermissions: false, canManageLists: false })
    && value.canViewItems === derived.canViewItems && value.canAddItems === derived.canAddItems
    && value.canEditItems === derived.canEditItems && value.canDeleteItems === derived.canDeleteItems
    && value.canManagePermissions === derived.canManagePermissions && value.canManageLists === derived.canManageLists;
}

function permissionsComplete(value: IC2bPermissionBindingConfiguration | undefined): boolean {
  if (!value || !positiveInteger(value.processorPrincipalId) || !positiveInteger(value.fullControlRoleDefinitionId)
    || !positiveInteger(value.readRoleDefinitionId) || !positiveInteger(value.commandCreateOnlyRoleDefinitionId)
    || !positiveInteger(value.aclRollbackPrincipalId) || !Array.isArray(value.controlledAdminPrincipalIds)
    || !Array.isArray(value.commandSubmitterPrincipalIds) || !Array.isArray(value.receiptActorPrincipalIds)
    || !Array.isArray(value.containerPrincipalBindings) || !Array.isArray(value.negativeProofPrincipalIds)
    || !uniquePositiveIntegers(value.controlledAdminPrincipalIds)
    || !uniquePositiveIntegers(value.commandSubmitterPrincipalIds)
    || !uniquePositiveIntegers(value.receiptActorPrincipalIds)
    || !uniquePositiveIntegers(value.negativeProofPrincipalIds)) return false;
  const roleIds = [value.fullControlRoleDefinitionId, value.readRoleDefinitionId,
    value.commandCreateOnlyRoleDefinitionId] as number[];
  if (new Set(roleIds).size !== roleIds.length
    || value.commandCreateOnlyRoleDefinitionId === SHAREPOINT_DESIGN_ROLE_DEFINITION_ID
    || !roleEvidenceCompatible(value.roleDefinitionEvidence?.fullControl, value.fullControlRoleDefinitionId,
      { semantic: 'FullControl', canViewItems: true, canAddItems: true, canEditItems: true,
        canDeleteItems: true, canManagePermissions: true, canManageLists: true })
    || !roleEvidenceCompatible(value.roleDefinitionEvidence?.read, value.readRoleDefinitionId,
      { semantic: 'Read', canViewItems: true, canAddItems: false, canEditItems: false,
        canDeleteItems: false, canManagePermissions: false, canManageLists: false })
    || !createOnlyRoleEvidenceCompatible(value.roleDefinitionEvidence?.commandCreateOnly,
      value.commandCreateOnlyRoleDefinitionId)) return false;
  if (!value.controlledAdminPrincipalIds.includes(value.aclRollbackPrincipalId)) return false;
  const privileged = [value.processorPrincipalId, ...value.controlledAdminPrincipalIds] as number[];
  const approvedActors = [...value.commandSubmitterPrincipalIds, ...value.receiptActorPrincipalIds,
    ...value.containerPrincipalBindings.flatMap(binding => binding.actorPrincipalIds)];
  if (new Set(privileged).size !== privileged.length || approvedActors.some(id => privileged.includes(id))) return false;
  const containerPurposes = value.containerPrincipalBindings.map(binding => binding.purpose);
  if (!containerPurposes.includes('Workplans') || !containerPurposes.includes('WorkplanItems')
    || new Set(value.containerPrincipalBindings.map(binding => `${binding.purpose}|${binding.containerKey}`)).size
      !== value.containerPrincipalBindings.length
    || value.containerPrincipalBindings.some(binding => !['Workplans', 'WorkplanItems'].includes(binding.purpose)
      || !nonBlank(binding.containerKey) || !uniquePositiveIntegers(binding.actorPrincipalIds))) return false;
  const positive = [...privileged, ...value.commandSubmitterPrincipalIds, ...value.receiptActorPrincipalIds,
    ...value.containerPrincipalBindings.flatMap(binding => binding.actorPrincipalIds)];
  return value.negativeProofPrincipalIds.every(id => !positive.includes(id));
}

export function planC2bSharePointProvisioning(
  configuration: IC2bSharePointProvisioningConfiguration,
  observed?: IC2bSharePointProvisioningTargetObservation
): C2bProvisioningPlan {
  if (!configuration.enabled) return { ready: false, code: 'C2B_PROVISIONING_DISABLED',
    reasons: ['Provisioning is disabled by default.'], operations: [] };
  const requiredExisting = C2B_EXISTING_LIST_REMEDIATIONS.map(value => value.purpose);
  const siteUrl = normalSiteUrl(configuration.siteUrl || '');
  const siteCollectionId = normalGuid(configuration.siteCollectionId || '');
  const webId = normalGuid(configuration.webId || '');
  if (configuration.environmentKind !== 'NonProduction' || !nonBlank(configuration.environmentId)
    || !siteUrl || !GUID.test(siteCollectionId) || !GUID.test(webId)
    || siteCollectionId === webId || !nonBlank(configuration.connectionReference)
    || requiredExisting.some(purpose => !GUID.test(configuration.listIds[purpose] || ''))) {
    return { ready: false, code: 'C2B_PROVISIONING_UNBOUND',
      reasons: ['Validated non-production environment, site URL, site-collection GUID, web GUID, connection and seven existing list IDs are required.'],
      operations: [] };
  }
  const observedSiteUrl = normalSiteUrl(observed?.siteUrl || '');
  const observedSiteCollectionId = normalGuid(observed?.siteCollectionId || '');
  const observedWebId = normalGuid(observed?.webId || '');
  if (!observedSiteUrl || !GUID.test(observedSiteCollectionId) || !GUID.test(observedWebId)
    || observedSiteCollectionId === observedWebId) {
    return { ready: false, code: 'C2B_PROVISIONING_UNBOUND',
      reasons: ['Independent site URL, site-collection GUID and web GUID observations are required.'],
      operations: [] };
  }
  if (observedSiteUrl !== siteUrl || observedSiteCollectionId !== siteCollectionId || observedWebId !== webId) {
    return { ready: false, code: 'C2B_PROVISIONING_TARGET_MISMATCH',
      reasons: ['Observed site URL, site-collection GUID or web GUID does not match provisioning configuration.'],
      operations: [] };
  }
  if (!configuration.permissions) return { ready: false, code: 'C2B_PERMISSION_CONFIG_ABSENT',
    reasons: ['Injected principal, role, ACL rollback and effective-proof inputs are required.'], operations: [] };
  if (!permissionsComplete(configuration.permissions)) return { ready: false, code: 'C2B_PERMISSION_CONFIG_INVALID',
    reasons: ['Role IDs/semantics must be distinct and compatible; no-lockout principal, container, rollback and proof inputs must be complete.'],
    operations: [] };

  const operations: C2bProvisioningOperation[] = [];
  const add = (operation: Omit<C2bProvisioningOperation, 'order'>): void => {
    operations.push({ order: operations.length + 1, ...operation });
  };
  const permissions = configuration.permissions;
  const permissionExpectation = (semantic: C2bRoleSemantic): Omit<IC2bRoleDefinitionEvidence, 'roleDefinitionId'> =>
    semantic === 'FullControl'
      ? { semantic, canViewItems: true, canAddItems: true, canEditItems: true, canDeleteItems: true,
        canManagePermissions: true, canManageLists: true }
      : semantic === 'Read'
        ? { semantic, canViewItems: true, canAddItems: false, canEditItems: false, canDeleteItems: false,
          canManagePermissions: false, canManageLists: false }
        : { semantic, canViewItems: false, canAddItems: true, canEditItems: false, canDeleteItems: false,
          canManagePermissions: false, canManageLists: false };
  const allUnprivileged = [...permissions.commandSubmitterPrincipalIds, ...permissions.receiptActorPrincipalIds,
    ...permissions.containerPrincipalBindings.flatMap(binding => binding.actorPrincipalIds),
    ...permissions.negativeProofPrincipalIds];
  const addAclSequence = (purpose: C2bListPurpose, title: string, capability: C2bPermissionCapability,
    scope: 'List' | 'Container', containerKey?: string, actorPrincipalIds: readonly number[] = []): void => {
    const targetKey = scope === 'List' ? 'LIST' : containerKey!;
    const captureKey = `${purpose}|${scope}|${targetKey}|ACL-BEFORE`;
    const approved = [
      { principalId: permissions.processorPrincipalId!, roleDefinitionId: permissions.fullControlRoleDefinitionId!,
        semantic: 'FullControl' as const },
      ...permissions.controlledAdminPrincipalIds.map(principalId => ({ principalId,
        roleDefinitionId: permissions.fullControlRoleDefinitionId!, semantic: 'FullControl' as const })),
      ...(scope === 'List' && capability === 'CommandSubmitterCreateOnly'
        ? permissions.commandSubmitterPrincipalIds.map(principalId => ({ principalId,
          roleDefinitionId: permissions.commandCreateOnlyRoleDefinitionId!, semantic: 'CreateOnly' as const,
          expectedRoleEvidence: {
            roleDefinitionId: permissions.roleDefinitionEvidence.commandCreateOnly.roleDefinitionId,
            roleName: permissions.roleDefinitionEvidence.commandCreateOnly.roleName,
            basePermissionsHigh: permissions.roleDefinitionEvidence.commandCreateOnly.basePermissionsHigh,
            basePermissionsLow: permissions.roleDefinitionEvidence.commandCreateOnly.basePermissionsLow
          } })) : []),
      ...(scope === 'Container' ? actorPrincipalIds.map(principalId => ({ principalId,
        roleDefinitionId: permissions.readRoleDefinitionId!, semantic: 'Read' as const })) : [])
    ];
    const approvedIds = Array.from(new Set(approved.map(value => value.principalId)));
    const negativeIds = Array.from(new Set(allUnprivileged.filter(principalId => !approvedIds.includes(principalId))));
    add({ kind: 'CaptureCurrentAcl', purpose, title, details: { scope, containerKey: containerKey || null,
      listId: configuration.listIds[purpose] || null, requireCompleteRoleAssignments: true,
      requireInheritanceState: true, outputCaptureKey: captureKey } });
    add({ kind: 'RegisterAclRollback', purpose, title, details: { scope, containerKey: containerKey || null,
      captureKey, rollbackPrincipalId: permissions.aclRollbackPrincipalId,
      rollbackRoleDefinitionId: permissions.fullControlRoleDefinitionId, executeBeforeMutation: true,
      restoreOnAnyFailure: true, requireExactRestorationProof: true } });
    const mutationOrders: number[] = [];
    const addMutation = (operation: Omit<C2bProvisioningOperation, 'order'>): void => {
      add(operation); mutationOrders.push(operations[operations.length - 1].order);
    };
    addMutation({ kind: 'BreakRoleInheritance', purpose, title, details: { scope,
      containerKey: containerKey || null, copyRoleAssignments: false, clearSubscopes: false, captureKey } });
    approved.forEach(binding => addMutation({ kind: 'GrantRole', purpose, title, details: { scope,
      containerKey: containerKey || null, ...binding, expectedRoleSemantics: permissionExpectation(binding.semantic) } }));
    addMutation({ kind: 'RevokeUnapprovedRoleAssignments', purpose, title, details: { scope,
      containerKey: containerKey || null, captureKey, preservePrincipalIds: approvedIds,
      removeEveryOtherCapturedAssignment: true } });
    add({ kind: 'VerifyEffectivePermissions', purpose, title, details: { scope, containerKey: containerKey || null,
      requireIndependentEffectivePermissionQueries: true, requireEveryExpectation: true,
      positive: approved.map(binding => ({ principalId: binding.principalId,
        roleDefinitionId: binding.roleDefinitionId, expectation: permissionExpectation(binding.semantic),
        ...('expectedRoleEvidence' in binding ? { expectedRoleEvidence: binding.expectedRoleEvidence } : {}) })),
      negative: negativeIds.map(principalId => ({ principalId,
        expectation: { canViewItems: false, canAddItems: false, canEditItems: false, canDeleteItems: false,
          canManagePermissions: false, canManageLists: false } })),
      runtimeReceiptActorItemProof: purpose === 'CommandReceipts' && scope === 'List'
        ? permissions.receiptActorPrincipalIds.map(principalId => ({ principalId,
          listExpectation: 'NoEnumerateReadEditDelete', itemExpectation: 'ReadOnlyAfterReceiptCreate' })) : [] } });
    add({ kind: 'RestoreAclOnFailure', purpose, title, details: { scope, containerKey: containerKey || null,
      captureKey, mutationOrders, trigger: 'AnyAclMutationOrProofFailure', restoreAssignmentsAndInheritanceExactly: true,
      requireRollbackPrincipalFullControl: true, requireExactRestorationProof: true } });
    add({ kind: 'CommitAclChange', purpose, title, details: { scope, containerKey: containerKey || null,
      captureKey, onlyAfterEffectiveProof: true, requireNoLockout: true,
      requiredFullControlPrincipalIds: [permissions.processorPrincipalId, ...permissions.controlledAdminPrincipalIds] } });
  };
  C2B_SHAREPOINT_PHYSICAL_CONTRACT.lists.forEach(list => {
    add({ kind: 'CreateOrVerifyList', purpose: list.purpose, title: list.title,
      details: { listId: configuration.listIds[list.purpose] || null, template: list.template } });
    list.fields.forEach(field => add({ kind: 'EnsureField', purpose: list.purpose, title: list.title,
      field: field.internalName, details: field }));
    add({ kind: 'VerifyListSettings', purpose: list.purpose, title: list.title,
      details: { versioningEnabled: true, foldersEnabled: false, capacity: list.capacity } });
    list.fields.filter(field => field.indexed).forEach(field => add({ kind: 'EnsureIndex', purpose: list.purpose,
      title: list.title, field: field.internalName }));
    list.fields.filter(field => field.unique).forEach(field => {
      add({ kind: 'PreflightUnique', purpose: list.purpose, title: list.title, field: field.internalName,
        details: { requireCompleteScan: true, duplicateCount: 0, nullCount: 0, blankCount: 0 } });
      add({ kind: 'EnsureUnique', purpose: list.purpose, title: list.title, field: field.internalName });
    });
    addAclSequence(list.purpose, list.title, list.permissionCapability, 'List');
  });
  C2B_EXISTING_LIST_REMEDIATIONS.forEach(remediation => {
    if (remediation.preconditions.includes('CompleteCountAndThresholdCheck'))
      add({ kind: 'PreflightThreshold', purpose: remediation.purpose, title: remediation.title,
        details: { requireCompleteCount: true, thresholdCheckRequired: true } });
    remediation.addIndexes.forEach(field => add({ kind: 'EnsureIndex', purpose: remediation.purpose,
      title: remediation.title, field }));
    remediation.enforceUnique.forEach(field => {
      add({ kind: 'PreflightUnique', purpose: remediation.purpose, title: remediation.title, field,
        details: { requireCompleteScan: true, duplicateCount: 0, nullCount: 0, blankCount: 0 } });
      add({ kind: 'EnsureUnique', purpose: remediation.purpose, title: remediation.title, field });
    });
    if (remediation.disableFolders) {
      add({ kind: 'PreflightFolders', purpose: remediation.purpose, title: remediation.title,
        details: { requireCompleteScan: true, folderCount: 0 } });
      add({ kind: 'DisableFolders', purpose: remediation.purpose, title: remediation.title });
    }
    addAclSequence(remediation.purpose, remediation.title, remediation.permissionCapability, 'List');
    if (remediation.permissionCapability === 'EmployeeContainerInheritance') {
      permissions.containerPrincipalBindings.filter(binding => binding.purpose === remediation.purpose)
        .forEach(binding => addAclSequence(remediation.purpose, remediation.title,
          remediation.permissionCapability, 'Container', binding.containerKey, binding.actorPrincipalIds));
    }
  });
  return { ready: true, code: 'C2B_PROVISIONING_PLAN_READY', operations: Object.freeze(operations) };
}

export interface IC2bSharePointFieldObservation {
  displayName: string;
  internalName: string;
  type: C2bSharePointFieldType;
  required: boolean;
  nullable: boolean;
  defaultValue: string | number | null;
  indexed: boolean;
  unique: boolean;
  maxLength?: number;
  choices?: readonly string[];
  decimals?: number;
  minimum?: number;
  maximum?: number;
  dateTimeFormat?: 'DateTime' | 'DateOnly';
  richText?: boolean;
  appendOnly?: boolean;
}

export interface IC2bSharePointListObservation {
  purpose: C2bListPurpose;
  title: string;
  listId: string;
  template: number;
  schemaRevision: string;
  versioningEnabled: boolean;
  foldersEnabled: boolean;
  fields: readonly IC2bSharePointFieldObservation[];
  indexedFields: readonly string[];
  uniqueFields: readonly string[];
  permissionCapability: C2bPermissionCapability;
  permissionProofComplete: boolean;
}

const equalSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && new Set(left).size === left.length
  && new Set(right).size === right.length && left.every(value => right.includes(value));

export function verifyC2bSharePointPhysicalContract(
  observations: readonly IC2bSharePointListObservation[]
): { ready: boolean; code: 'C2B_SHAREPOINT_SCHEMA_VERIFIED' | 'C2B_SHAREPOINT_SCHEMA_MISMATCH'; reasons: string[] } {
  const reasons: string[] = [];
  const expectedTitles = new Map<C2bListPurpose, string>([
    ...C2B_SHAREPOINT_PHYSICAL_CONTRACT.lists.map(value => [value.purpose, value.title] as const),
    ...C2B_EXISTING_LIST_REMEDIATIONS.map(value => [value.purpose, value.title] as const)
  ]);
  const observedIds = observations.map(value => value.listId.toLowerCase());
  if (new Set(observedIds).size !== observedIds.length) reasons.push('List GUIDs must be unique across all nine purposes.');
  C2B_LIST_CAPABILITY_REQUIREMENTS.forEach(requirement => {
    const matches = observations.filter(value => value.purpose === requirement.purpose);
    if (matches.length !== 1) {
      reasons.push(`${requirement.purpose}: exactly one observed list is required.`);
      return;
    }
    const observed = matches[0];
    if (!GUID.test(observed.listId) || observed.schemaRevision !== 'c2b-annual-v2')
      reasons.push(`${requirement.purpose}: identity or schema revision is invalid.`);
    if (observed.title !== expectedTitles.get(requirement.purpose))
      reasons.push(`${requirement.purpose}: exact TEST title differs.`);
    const physical = C2B_SHAREPOINT_PHYSICAL_CONTRACT.lists.find(list => list.purpose === requirement.purpose);
    const remediation = C2B_EXISTING_LIST_REMEDIATIONS.find(list => list.purpose === requirement.purpose);
    if (observed.template !== (physical?.template || remediation?.template))
      reasons.push(`${requirement.purpose}: exact Generic List template 100 differs.`);
    if (!equalSet(observed.indexedFields, requirement.indexedFields)
      || !equalSet(observed.uniqueFields, requirement.uniqueFields)
      || observed.versioningEnabled !== true || observed.foldersEnabled !== requirement.foldersEnabled)
      reasons.push(`${requirement.purpose}: index, uniqueness, versioning or folder settings differ.`);
    if (observed.permissionCapability !== requirement.permissionCapability || !observed.permissionProofComplete)
      reasons.push(`${requirement.purpose}: permission capability proof is absent or mismatched.`);
    if (!physical) return;
    physical.fields.forEach(expected => {
      const fields = observed.fields.filter(field => field.internalName === expected.internalName);
      if (fields.length !== 1) {
        reasons.push(`${requirement.purpose}.${expected.internalName}: exactly one physical field is required.`);
        return;
      }
      const current = fields[0];
      if (current.displayName !== expected.displayName || current.type !== expected.type
        || current.required !== expected.required || current.nullable !== expected.nullable
        || current.defaultValue !== expected.defaultValue
        || current.indexed !== expected.indexed || current.unique !== expected.unique
        || current.maxLength !== expected.maxLength
        || (expected.choices === undefined ? current.choices !== undefined
          : !Array.isArray(current.choices) || current.choices.length !== expected.choices.length
            || current.choices.some((value, index) => value !== expected.choices![index]))
        || current.decimals !== expected.decimals || current.minimum !== expected.minimum
        || current.maximum !== expected.maximum || current.dateTimeFormat !== expected.dateTimeFormat
        || current.richText !== expected.richText || current.appendOnly !== expected.appendOnly)
        reasons.push(`${requirement.purpose}.${expected.internalName}: physical definition differs.`);
    });
    if (observed.fields.length !== physical.fields.length)
      reasons.push(`${requirement.purpose}: unexpected or missing physical fields exist.`);
  });
  return reasons.length ? { ready: false, code: 'C2B_SHAREPOINT_SCHEMA_MISMATCH', reasons }
    : { ready: true, code: 'C2B_SHAREPOINT_SCHEMA_VERIFIED', reasons: [] };
}
