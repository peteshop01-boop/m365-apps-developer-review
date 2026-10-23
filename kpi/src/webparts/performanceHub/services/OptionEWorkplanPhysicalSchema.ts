export const OPTION_E_SCHEMA_CONTRACT_VERSION = 'KCF-KPI-B13-OPTION-E-V3';
export const OPTION_E_DRAFT_SCHEMA_VERSION = 'kcf.workplan-draft/v1';

export type OptionEWorkplanListTitle =
  | 'KCFKPI_WorkplanDrafts'
  | 'KCFKPI_WorkplanSubmitRequests'
  | 'KCFKPI_WorkplanSubmittedSnapshots'
  | 'KCFKPI_Workplans'
  | 'KCFKPI_WorkplanSubmitOperations'
  | 'KCFKPI_Audit'
  | 'KCFKPI_People';

export type OptionEFieldType = 'Text' | 'Note' | 'Number' | 'Boolean' | 'Choice' | 'DateTime';
export type OptionEFieldAction = 'Create' | 'Reuse' | 'AddIfMissing' | 'ReuseOrAddIndex' | 'ReuseOrAddChoices';
export type OptionEMutationPolicy =
  | 'FourUntrustedEmployeeFields'
  | 'CreateOnlyImmutableRequest'
  | 'CreateOnlyImmutableSnapshot'
  | 'ProcessorOnlyControl'
  | 'ProcessorOnlyOperation'
  | 'CreateOnlyAppendOnlyAudit'
  | 'GovernedPeopleReference';

export interface IOptionEFieldDefinition {
  internalName: string;
  type: OptionEFieldType;
  required: boolean;
  indexed: boolean;
  enforceUniqueValues: boolean;
  action: OptionEFieldAction;
  id?: string;
  maxLength?: number;
  decimalPlaces?: 0 | 2;
  choices?: readonly string[];
  compatibleExistingTypes?: readonly OptionEFieldType[];
  allowAdditionalChoices?: boolean;
  defaultValue?: boolean | number | string;
  immutableAfterCreate?: boolean;
  processorOnly?: boolean;
  employeeWritableUntrusted?: boolean;
  applicationRequiredForNewEvent?: boolean;
  authoritativeSource?: 'ProtectedWorkplans' | 'GovernedPeople' | 'SystemCreatedBy';
  checkedCacheOnly?: boolean;
  showInNewForm?: boolean;
  showInEditForm?: boolean;
}

export interface IOptionEListDefinition {
  title: OptionEWorkplanListTitle;
  purpose: string;
  existingAsset: boolean;
  createIfMissing: boolean;
  enableVersioning: true;
  enableFolderCreation: boolean;
  attachmentsEnabled: boolean;
  contentTypesEnabled: boolean;
  privateRoot: true;
  defaultFormMutationDisabled: true;
  titleField: Readonly<{ required: false; hidden: true; readOnlyField: true }>;
  retention: 'NoAutomaticDeletion';
  naturalKey: string;
  mutationPolicy: OptionEMutationPolicy;
  fields: readonly IOptionEFieldDefinition[];
}

export interface IOptionENativeRoleDefinition {
  name: string;
  roleTypeKind: 0;
  high: number;
  low: number;
  rights: readonly string[];
  explicitlyAbsent: readonly string[];
}

export const OPTION_E_NATIVE_RIGHT_BITS = Object.freeze({
  ViewListItems: 1,
  AddListItems: 2,
  EditListItems: 4,
  DeleteListItems: 8,
  ManagePermissions: 33554432
});

export const OPTION_E_NATIVE_ROLES: readonly IOptionENativeRoleDefinition[] = Object.freeze([
  {
    name: 'KCF KPI Option E Item Reader v1', roleTypeKind: 0, high: 0, low: 1,
    rights: ['ViewListItems'], explicitlyAbsent: ['AddListItems', 'EditListItems', 'DeleteListItems', 'ManagePermissions']
  },
  {
    name: 'KCF KPI Option E Add Read No Edit v1', roleTypeKind: 0, high: 0, low: 3,
    rights: ['ViewListItems', 'AddListItems'], explicitlyAbsent: ['EditListItems', 'DeleteListItems', 'ManagePermissions']
  },
  {
    name: 'KCF KPI Option E Draft Editor v1', roleTypeKind: 0, high: 0, low: 5,
    rights: ['ViewListItems', 'EditListItems'], explicitlyAbsent: ['AddListItems', 'DeleteListItems', 'ManagePermissions']
  },
  {
    name: 'KCF KPI Option E Mutator No Delete v1', roleTypeKind: 0, high: 0, low: 7,
    rights: ['ViewListItems', 'AddListItems', 'EditListItems'], explicitlyAbsent: ['DeleteListItems', 'ManagePermissions']
  },
  {
    name: 'KCF KPI Option E ACL Reconciler v1', roleTypeKind: 0, high: 0, low: 33554433,
    rights: ['ViewListItems', 'ManagePermissions'], explicitlyAbsent: ['AddListItems', 'EditListItems', 'DeleteListItems']
  }
]);

export const OPTION_E_RECOVERY_ROLE = Object.freeze({
  name: 'Full Control', roleTypeKind: 5 as const, high: 2147483647, low: 4294967295,
  binding: 'ReviewedRecoveryPrincipalOnly'
});

export const OPTION_E_CONTENT_PROCESSOR_MASKS: Readonly<Record<OptionEWorkplanListTitle, number>> = Object.freeze({
  KCFKPI_WorkplanDrafts: 7,
  KCFKPI_WorkplanSubmitRequests: 1,
  KCFKPI_WorkplanSubmittedSnapshots: 3,
  KCFKPI_Workplans: 5,
  KCFKPI_WorkplanSubmitOperations: 7,
  KCFKPI_Audit: 3,
  KCFKPI_People: 1
});

export const OPTION_E_ACL_RECONCILER_MASKS: Readonly<Partial<Record<OptionEWorkplanListTitle, number>>> = Object.freeze({
  KCFKPI_WorkplanDrafts: 33554433,
  KCFKPI_WorkplanSubmitRequests: 33554433,
  KCFKPI_WorkplanSubmittedSnapshots: 33554433,
  KCFKPI_Workplans: 33554433,
  KCFKPI_WorkplanSubmitOperations: 33554433,
  KCFKPI_People: 1
});

const commonField = (
  internalName: string,
  type: OptionEFieldType,
  options: Partial<IOptionEFieldDefinition> = {}
): IOptionEFieldDefinition => ({
  internalName, type, required: true, indexed: false, enforceUniqueValues: false,
  action: 'Create', ...options
});
const text = (internalName: string, maxLength: number, options: Partial<IOptionEFieldDefinition> = {}): IOptionEFieldDefinition =>
  commonField(internalName, 'Text', { maxLength, ...options });
const note = (internalName: string, options: Partial<IOptionEFieldDefinition> = {}): IOptionEFieldDefinition =>
  commonField(internalName, 'Note', options);
const number = (internalName: string, options: Partial<IOptionEFieldDefinition> = {}): IOptionEFieldDefinition =>
  commonField(internalName, 'Number', { decimalPlaces: 0, ...options });
const dateTime = (internalName: string, options: Partial<IOptionEFieldDefinition> = {}): IOptionEFieldDefinition =>
  commonField(internalName, 'DateTime', options);
const choice = (
  internalName: string,
  choices: readonly string[],
  options: Partial<IOptionEFieldDefinition> = {}
): IOptionEFieldDefinition => commonField(internalName, 'Choice', { choices, ...options });
const boolean = (internalName: string, options: Partial<IOptionEFieldDefinition> = {}): IOptionEFieldDefinition =>
  commonField(internalName, 'Boolean', options);
const uniqueKey = (internalName: string, options: Partial<IOptionEFieldDefinition> = {}): IOptionEFieldDefinition =>
  text(internalName, 255, { indexed: true, enforceUniqueValues: true, immutableAfterCreate: true, ...options });

const fixedFieldId = (storeCode: number, index: number): string =>
  `b13e${storeCode.toString(16).padStart(4, '0')}-0000-4000-8000-${(index + 1).toString(16).padStart(12, '0')}`;
const createFields = (storeCode: number, fields: readonly IOptionEFieldDefinition[]): readonly IOptionEFieldDefinition[] =>
  fields.map((field, index) => ({ ...field, action: 'Create', id: fixedFieldId(storeCode, index) }));
const exactTitleField = Object.freeze({ required: false, hidden: true, readOnlyField: true } as const);
const listDefaults = Object.freeze({
  enableVersioning: true as const,
  privateRoot: true as const,
  defaultFormMutationDisabled: true as const,
  titleField: exactTitleField,
  retention: 'NoAutomaticDeletion' as const
});

const draftFields = createFields(1, [
  note('DraftPayloadJSON', { employeeWritableUntrusted: true, showInNewForm: false, showInEditForm: false }),
  text('DraftPayloadSHA256', 64, { employeeWritableUntrusted: true, showInNewForm: false, showInEditForm: false }),
  text('ClientSaveID', 64, { employeeWritableUntrusted: true, showInNewForm: false, showInEditForm: false }),
  dateTime('ClientSavedAt', { employeeWritableUntrusted: true, showInNewForm: false, showInEditForm: false })
]);

const requestFields = createFields(2, [
  uniqueKey('RequestKey'),
  text('PersonKey', 128, { indexed: true, immutableAfterCreate: true, authoritativeSource: 'SystemCreatedBy' }),
  number('PerformanceYear', { indexed: true, immutableAfterCreate: true, authoritativeSource: 'ProtectedWorkplans' }),
  text('WorkplanKey', 255, { indexed: true, immutableAfterCreate: true, authoritativeSource: 'ProtectedWorkplans' }),
  text('ClientSubmitID', 64, { indexed: true, immutableAfterCreate: true }),
  number('DraftItemID', { immutableAfterCreate: true }),
  text('DraftETag', 128, { immutableAfterCreate: true }),
  text('DraftVersion', 64, { immutableAfterCreate: true }),
  text('DraftSchemaVersion', 64, { immutableAfterCreate: true, authoritativeSource: 'ProtectedWorkplans' }),
  note('PayloadJSON', { immutableAfterCreate: true }),
  text('PayloadSHA256', 64, { immutableAfterCreate: true }),
  text('FrameworkVersion', 128, { immutableAfterCreate: true }),
  text('CatalogueVersion', 128, { immutableAfterCreate: true }),
  dateTime('ClientSubmittedAt', { immutableAfterCreate: true })
]);

const snapshotFields = createFields(3, [
  uniqueKey('SnapshotKey'),
  text('RequestKey', 255, { indexed: true, enforceUniqueValues: true, immutableAfterCreate: true }),
  text('PersonKey', 128, { indexed: true, immutableAfterCreate: true, authoritativeSource: 'GovernedPeople' }),
  number('PerformanceYear', { indexed: true, immutableAfterCreate: true, authoritativeSource: 'ProtectedWorkplans' }),
  text('WorkplanKey', 255, { indexed: true, immutableAfterCreate: true, authoritativeSource: 'ProtectedWorkplans' }),
  note('PayloadJSON', { immutableAfterCreate: true }),
  text('PayloadSHA256', 64, { immutableAfterCreate: true }),
  number('SourceDraftItemID', { immutableAfterCreate: true }),
  text('SourceDraftETag', 128, { immutableAfterCreate: true }),
  text('SourceDraftVersion', 64, { immutableAfterCreate: true }),
  number('RequestItemID', { immutableAfterCreate: true }),
  text('RequestETag', 128, { immutableAfterCreate: true }),
  text('AuthenticatedEmployeePersonKey', 128, { immutableAfterCreate: true, authoritativeSource: 'SystemCreatedBy' }),
  text('AuthenticatedEmployeeEmail', 255, { immutableAfterCreate: true, authoritativeSource: 'SystemCreatedBy' }),
  text('ManagerPersonKey', 128, { indexed: true, immutableAfterCreate: true, authoritativeSource: 'GovernedPeople' }),
  text('ManagerEmail', 255, { immutableAfterCreate: true, authoritativeSource: 'GovernedPeople' }),
  number('HierarchyEpoch', { immutableAfterCreate: true, authoritativeSource: 'ProtectedWorkplans' }),
  note('FrameworkSnapshotJSON', { immutableAfterCreate: true }),
  note('CatalogueSnapshotJSON', { immutableAfterCreate: true })
]);

const reuse = <T extends IOptionEFieldDefinition>(field: T): T => ({
  ...field, action: field.action === 'Create' ? 'Reuse' : field.action
});
const additive = <T extends IOptionEFieldDefinition>(storeCode: number, index: number, field: T): T => ({
  ...field, action: 'AddIfMissing', id: fixedFieldId(storeCode, index), required: false
});

const workplanFields: readonly IOptionEFieldDefinition[] = [
  reuse(uniqueKey('WorkplanKey', { authoritativeSource: 'ProtectedWorkplans' })),
  reuse(text('PersonKey', 128, { indexed: true, authoritativeSource: 'ProtectedWorkplans' })),
  reuse(number('PerformanceYear', { indexed: true, authoritativeSource: 'ProtectedWorkplans' })),
  reuse(choice('State', ['Draft', 'Submitted', 'ChangesRequested', 'Approved', 'Locked', 'Archived'], {
    indexed: true, processorOnly: true, authoritativeSource: 'ProtectedWorkplans', allowAdditionalChoices: true
  })),
  reuse(choice('TransitionStatus', ['Ready', 'Submitting', 'AclPending', 'RecoveryHold'], {
    indexed: true, processorOnly: true, authoritativeSource: 'ProtectedWorkplans', allowAdditionalChoices: true,
    action: 'ReuseOrAddChoices'
  })),
  reuse(text('ManagerPersonKey', 128, { required: false, indexed: true, processorOnly: true, checkedCacheOnly: true })),
  reuse(number('RowVersionToken', { processorOnly: true, authoritativeSource: 'ProtectedWorkplans' })),
  additive(4, 0, text('PendingRequestKey', 255, { indexed: true, processorOnly: true })),
  additive(4, 1, text('CurrentSubmittedSnapshotKey', 255, { indexed: true, processorOnly: true })),
  additive(4, 2, number('HierarchyEpoch', { processorOnly: true })),
  additive(4, 3, number('AclEpoch', { processorOnly: true })),
  additive(4, 4, text('LastOperationKey', 255, { indexed: true, processorOnly: true })),
  additive(4, 5, text('DraftItemId', 20, { indexed: true, enforceUniqueValues: true, processorOnly: true })),
  additive(4, 6, text('DraftSchemaVersion', 64, { processorOnly: true }))
];

export const OPTION_E_OPERATION_CHECKPOINTS = [
  'Validated', 'ControlClaimed', 'SnapshotWritten', 'AuditWritten',
  'ControlPointed', 'AclVerified', 'Completed'
] as const;

const operationFields = createFields(5, [
  uniqueKey('OperationKey'),
  text('RequestKey', 255, { indexed: true, enforceUniqueValues: true, immutableAfterCreate: true }),
  text('WorkplanKey', 255, { indexed: true, immutableAfterCreate: true, authoritativeSource: 'ProtectedWorkplans' }),
  text('PersonKey', 128, { indexed: true, immutableAfterCreate: true, authoritativeSource: 'GovernedPeople' }),
  number('PerformanceYear', { indexed: true, immutableAfterCreate: true, authoritativeSource: 'ProtectedWorkplans' }),
  number('AttemptCount', { processorOnly: true }),
  text('ProcessorIdentity', 255, { processorOnly: true }),
  text('ExpectedControlETag', 128, { required: false, processorOnly: true }),
  text('ObservedControlETag', 128, { required: false, processorOnly: true }),
  choice('Checkpoint', OPTION_E_OPERATION_CHECKPOINTS, { indexed: true, processorOnly: true }),
  dateTime('ValidatedAt', { required: false, processorOnly: true }),
  dateTime('ControlClaimedAt', { required: false, processorOnly: true }),
  dateTime('SnapshotWrittenAt', { required: false, processorOnly: true }),
  dateTime('AuditWrittenAt', { required: false, processorOnly: true }),
  dateTime('ControlPointedAt', { required: false, processorOnly: true }),
  dateTime('AclVerifiedAt', { required: false, processorOnly: true }),
  dateTime('CompletedAt', { required: false, processorOnly: true }),
  choice('Outcome', ['Running', 'Completed', 'Rejected', 'RecoveryHold'], { indexed: true, processorOnly: true }),
  text('ErrorCode', 128, { required: false, processorOnly: true }),
  note('ErrorDetail', { required: false, processorOnly: true }),
  text('CreatedSnapshotKey', 255, { required: false, processorOnly: true }),
  text('CreatedAuditKey', 255, { required: false, processorOnly: true })
]);

const auditFields: readonly IOptionEFieldDefinition[] = [
  reuse(uniqueKey('AuditKey')),
  reuse(text('EventType', 128, { indexed: true, immutableAfterCreate: true, action: 'ReuseOrAddIndex' })),
  reuse(text('SubjectKey', 255, { indexed: true, immutableAfterCreate: true })),
  reuse(number('PerformanceYear', { immutableAfterCreate: true })),
  reuse(text('Quarter', 16, {
    required: false, immutableAfterCreate: true, compatibleExistingTypes: ['Text', 'Choice']
  })),
  reuse(text('ActorEmail', 255, { immutableAfterCreate: true, authoritativeSource: 'SystemCreatedBy' })),
  reuse(text('ActorRole', 64, { immutableAfterCreate: true })),
  reuse(dateTime('EventAt', { indexed: true, immutableAfterCreate: true })),
  reuse(note('Reason', {
    required: false, immutableAfterCreate: true, compatibleExistingTypes: ['Note', 'Text']
  })),
  reuse(note('BeforeJSON', { required: false, immutableAfterCreate: true })),
  reuse(note('AfterJSON', { required: false, immutableAfterCreate: true })),
  reuse(text('CorrelationKey', 255, { required: false, immutableAfterCreate: true })),
  reuse(text('Source', 128, { required: false, immutableAfterCreate: true })),
  reuse(text('SourceReference', 255, { required: false, immutableAfterCreate: true })),
  reuse(boolean('Success', { immutableAfterCreate: true })),
  additive(6, 0, text('RequestKey', 255, { indexed: true, immutableAfterCreate: true, applicationRequiredForNewEvent: true })),
  additive(6, 1, text('SnapshotKey', 255, { indexed: true, immutableAfterCreate: true, applicationRequiredForNewEvent: true })),
  additive(6, 2, text('PayloadSHA256', 64, { immutableAfterCreate: true, applicationRequiredForNewEvent: true })),
  additive(6, 3, text('ActorPersonKey', 128, {
    immutableAfterCreate: true, applicationRequiredForNewEvent: true, authoritativeSource: 'GovernedPeople'
  })),
  additive(6, 4, text('ProcessorIdentity', 255, { immutableAfterCreate: true, applicationRequiredForNewEvent: true }))
];

const peopleFields: readonly IOptionEFieldDefinition[] = [
  reuse(uniqueKey('PersonKey', { authoritativeSource: 'GovernedPeople' })),
  reuse(text('Email', 255, {
    indexed: true, enforceUniqueValues: true, authoritativeSource: 'GovernedPeople', action: 'ReuseOrAddIndex'
  })),
  reuse(text('ManagerPersonKey', 128, { required: false, indexed: true, authoritativeSource: 'GovernedPeople' })),
  reuse(text('ManagerEmail', 255, {
    required: false, indexed: true, authoritativeSource: 'GovernedPeople', action: 'ReuseOrAddIndex'
  })),
  reuse(boolean('Active', { indexed: true, defaultValue: true, authoritativeSource: 'GovernedPeople' }))
];

export const OPTION_E_WORKPLAN_SCHEMA: readonly IOptionEListDefinition[] = Object.freeze([
  {
    ...listDefaults, title: 'KCFKPI_WorkplanDrafts',
    purpose: 'Four untrusted employee-owned Draft content fields; all authority remains protected.',
    existingAsset: false, createIfMissing: true, enableFolderCreation: false,
    attachmentsEnabled: false, contentTypesEnabled: false,
    naturalKey: 'System ID/UniqueId bound from protected Workplans.DraftItemId',
    mutationPolicy: 'FourUntrustedEmployeeFields', fields: draftFields
  },
  {
    ...listDefaults, title: 'KCFKPI_WorkplanSubmitRequests',
    purpose: 'Immutable Submit requests in uniquely secured employee folders.',
    existingAsset: false, createIfMissing: true, enableFolderCreation: true,
    attachmentsEnabled: false, contentTypesEnabled: false,
    naturalKey: 'RequestKey=authenticated PersonKey|PerformanceYear|ClientSubmitID',
    mutationPolicy: 'CreateOnlyImmutableRequest', fields: requestFields
  },
  {
    ...listDefaults, title: 'KCFKPI_WorkplanSubmittedSnapshots',
    purpose: 'Immutable submitted content copied byte-for-byte from the accepted request.',
    existingAsset: false, createIfMissing: true, enableFolderCreation: false,
    attachmentsEnabled: false, contentTypesEnabled: false,
    naturalKey: 'SnapshotKey=RequestKey', mutationPolicy: 'CreateOnlyImmutableSnapshot', fields: snapshotFields
  },
  {
    ...listDefaults, title: 'KCFKPI_Workplans',
    purpose: 'Protected existing control and authoritative Draft binding; legacy lifecycle is preserved.',
    existingAsset: true, createIfMissing: false, enableFolderCreation: true,
    attachmentsEnabled: false, contentTypesEnabled: false,
    naturalKey: 'WorkplanKey=PersonKey|PerformanceYear', mutationPolicy: 'ProcessorOnlyControl', fields: workplanFields
  },
  {
    ...listDefaults, title: 'KCFKPI_WorkplanSubmitOperations',
    purpose: 'Durable processor-owned idempotency and recovery checkpoints.',
    existingAsset: false, createIfMissing: true, enableFolderCreation: false,
    attachmentsEnabled: false, contentTypesEnabled: false,
    naturalKey: 'OperationKey=RequestKey', mutationPolicy: 'ProcessorOnlyOperation', fields: operationFields
  },
  {
    ...listDefaults, title: 'KCFKPI_Audit',
    purpose: 'Existing append-only events with additive Option-E provenance.',
    existingAsset: true, createIfMissing: false, enableFolderCreation: false,
    attachmentsEnabled: false, contentTypesEnabled: false,
    naturalKey: 'AuditKey=RequestKey|WorkplanSubmitted', mutationPolicy: 'CreateOnlyAppendOnlyAudit', fields: auditFields
  },
  {
    ...listDefaults, title: 'KCFKPI_People',
    purpose: 'Existing governed identity and exact current-manager authority.',
    existingAsset: true, createIfMissing: false, enableFolderCreation: false,
    attachmentsEnabled: false, contentTypesEnabled: false,
    naturalKey: 'PersonKey and normalised Email', mutationPolicy: 'GovernedPeopleReference', fields: peopleFields
  }
]);

export const OPTION_E_DRAFT_EMPLOYEE_WRITABLE_FIELDS = draftFields.map(field => field.internalName);
export const OPTION_E_PRIVATE_ROOTS = OPTION_E_WORKPLAN_SCHEMA.map(definition => definition.title);

export const validateOptionEPhysicalSchema = (
  definitions: readonly IOptionEListDefinition[] = OPTION_E_WORKPLAN_SCHEMA
): string[] => {
  const errors: string[] = [];
  const titles = new Set<string>();
  const ids = new Set<string>();
  const fieldCount = definitions.reduce((total, definition) => total + definition.fields.length, 0);
  const newFieldCount = definitions.filter(definition => !definition.existingAsset)
    .reduce((total, definition) => total + definition.fields.length, 0);
  const existingFieldCount = fieldCount - newFieldCount;
  if (definitions.length !== 7) errors.push(`Expected seven Option-E stores; found ${definitions.length}.`);
  if (fieldCount !== 98 || newFieldCount !== 59 || existingFieldCount !== 39) {
    errors.push(`Expected 98 contracted fields (59 new-store, 39 existing-store); found ${fieldCount} (${newFieldCount}, ${existingFieldCount}).`);
  }
  definitions.forEach(definition => {
    if (titles.has(definition.title)) errors.push(`Duplicate store ${definition.title}.`);
    titles.add(definition.title);
    if (!definition.enableVersioning || !definition.privateRoot || !definition.defaultFormMutationDisabled) {
      errors.push(`${definition.title} must be versioned, private and form-disabled.`);
    }
    if (definition.retention !== 'NoAutomaticDeletion') errors.push(`${definition.title} must not delete evidence automatically.`);
    const names = new Set<string>();
    definition.fields.forEach(field => {
      if (names.has(field.internalName)) errors.push(`${definition.title}.${field.internalName} is duplicated.`);
      names.add(field.internalName);
      if (field.type === 'Text' && (!field.maxLength || field.maxLength > 255)) {
        errors.push(`${definition.title}.${field.internalName} requires an exact Text length from 1 to 255.`);
      }
      if (field.enforceUniqueValues && !field.indexed) errors.push(`${definition.title}.${field.internalName} unique keys must be indexed.`);
      if ((field.action === 'Create' || field.action === 'AddIfMissing') && !field.id) {
        errors.push(`${definition.title}.${field.internalName} requires a fixed field identity.`);
      }
      if (field.id) {
        if (ids.has(field.id)) errors.push(`Duplicate field identity ${field.id}.`);
        ids.add(field.id);
      }
    });
  });
  const draft = definitions.find(definition => definition.title === 'KCFKPI_WorkplanDrafts');
  const expectedDraft = ['DraftPayloadJSON', 'DraftPayloadSHA256', 'ClientSaveID', 'ClientSavedAt'];
  if (!draft || draft.fields.map(field => field.internalName).join('|') !== expectedDraft.join('|')
    || draft.fields.some(field => !field.employeeWritableUntrusted || field.showInNewForm !== false
      || field.showInEditForm !== false)) {
    errors.push('Draft must expose exactly four untrusted writable custom fields hidden from default forms.');
  }
  OPTION_E_NATIVE_ROLES.forEach(role => {
    const calculated = role.rights.reduce((mask, right) => mask
      | OPTION_E_NATIVE_RIGHT_BITS[right as keyof typeof OPTION_E_NATIVE_RIGHT_BITS], 0) >>> 0;
    if (role.high !== 0 || calculated !== role.low || role.roleTypeKind !== 0) {
      errors.push(`${role.name} raw mask does not match its exact native rights.`);
    }
  });
  if (OPTION_E_RECOVERY_ROLE.roleTypeKind !== 5 || OPTION_E_RECOVERY_ROLE.high !== 2147483647
    || OPTION_E_RECOVERY_ROLE.low !== 4294967295) {
    errors.push('Recovery Full Control must be the exact built-in Administrator role and unsigned mask.');
  }
  if (OPTION_E_ACL_RECONCILER_MASKS.KCFKPI_Audit !== undefined) {
    errors.push('ACL reconciler must have no Audit assignment.');
  }
  return errors;
};
