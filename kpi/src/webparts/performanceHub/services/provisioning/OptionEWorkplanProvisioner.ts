import {
  OPTION_E_SCHEMA_CONTRACT_VERSION,
  OPTION_E_WORKPLAN_SCHEMA,
  validateOptionEPhysicalSchema,
  type IOptionEFieldDefinition,
  type IOptionEListDefinition,
  type OptionEWorkplanListTitle
} from '../OptionEWorkplanPhysicalSchema';

export interface IOptionEFieldReadback {
  id?: string;
  internalName: string;
  type: string;
  required: boolean;
  indexed: boolean;
  enforceUniqueValues: boolean;
  maxLength?: number;
  decimalPlaces?: number;
  choices?: readonly string[];
  defaultValue?: boolean | number | string;
  nonBlankDuplicateCount?: number;
}

export interface IOptionEListReadback {
  title: string;
  exists: boolean;
  enableVersioning: boolean;
  enableFolderCreation: boolean;
  attachmentsEnabled: boolean;
  contentTypesEnabled: boolean;
  rootHasUniqueRoleAssignments: boolean;
  broadRootPrincipals: readonly string[];
  defaultFormMutationDisabled: boolean;
  recoveryRoutePresent: boolean;
  fields: readonly IOptionEFieldReadback[];
  lifecycleIssues?: readonly string[];
  authorityMappingIssues?: readonly string[];
  opaqueLegacyFingerprint?: string;
}

export type OptionEProvisioningOperation =
  | 'VerifyCanonicalReadbacks' | 'VerifyExistingList'
  | 'CreateList' | 'CreateField' | 'AddIndex' | 'EnforceUniqueValues' | 'AddChoice'
  | 'BackfillOptionERowsExactETag' | 'ReadBackOptionERows' | 'EnableOptionERoute';

export interface IOptionEPlannedMutation {
  operation: 'CreateList' | 'CreateField' | 'AddIndex' | 'EnforceUniqueValues' | 'AddChoice';
  target: string;
  expectedReadback: string;
}

export interface IOptionEPreflightEvidence {
  checkedStoreCount: number;
  canonicalReadbacksEqual: boolean;
  exactExistingStores: readonly string[];
  missingCreateableStores: readonly string[];
  plannedMutations: readonly IOptionEPlannedMutation[];
  mismatches: readonly string[];
  remediation: readonly string[];
  ready: boolean;
}

export interface IOptionEProvisioningStep {
  sequence: number;
  operation: OptionEProvisioningOperation;
  target: string;
  mutatesTenant: boolean;
  idempotencyKey: string;
  expectedReadback: string;
}

export interface IOptionERollbackStep {
  sequence: number;
  operation: 'DisableOptionERoute' | 'RestoreCapturedConfiguration' | 'RestoreCapturedPermissions' | 'PreserveEvidence';
  target: string;
  deletesListOrField: false;
  deletesItemFileAuditOrSnapshot: false;
}

export interface IOptionEProvisioningPlan {
  contractVersion: typeof OPTION_E_SCHEMA_CONTRACT_VERSION;
  tenantNeutral: true;
  applyAuthorised: false;
  preflight: IOptionEPreflightEvidence;
  steps: readonly IOptionEProvisioningStep[];
  rollback: readonly IOptionERollbackStep[];
}

export class OptionEProvisioningPreflightError extends Error {
  public constructor(public readonly evidence: IOptionEPreflightEvidence) {
    super(`Option-E provisioning preflight failed: ${evidence.mismatches.join(' ')}`);
    this.name = 'OptionEProvisioningPreflightError';
    Object.setPrototypeOf(this, OptionEProvisioningPreflightError.prototype);
  }
}

const normalise = (value: string): string => value.trim().toLowerCase();
const sorted = (values: readonly string[]): string[] => values.slice().sort((a, b) => a.localeCompare(b));
const fieldTarget = (title: string, field: string): string => `${title}.${field}`;
const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source).sort().reduce<Record<string, unknown>>((result, key) => {
      if (source[key] !== undefined) result[key] = stableValue(source[key]);
      return result;
    }, {});
  }
  return value;
};

const canonicalReadbacks = (readbacks: readonly IOptionEListReadback[]): string => JSON.stringify(stableValue(
  readbacks.slice().sort((a, b) => a.title.localeCompare(b.title)).map(list => ({
    ...list,
    broadRootPrincipals: sorted(list.broadRootPrincipals.map(normalise)),
    lifecycleIssues: sorted(list.lifecycleIssues || []),
    authorityMappingIssues: sorted(list.authorityMappingIssues || []),
    fields: list.fields.slice().sort((a, b) => a.internalName.localeCompare(b.internalName)).map(field => ({
      ...field, id: field.id?.toLowerCase(), choices: sorted(field.choices || [])
    }))
  }))
));

const broadPrincipalError = (title: string, principals: readonly string[]): string | undefined => {
  const unsafe = principals.filter(principal => {
    const value = normalise(principal);
    return value.indexOf('visitor') >= 0 || value.indexOf('member') >= 0
      || value === 'everyone' || value.indexOf('everyone except') >= 0;
  });
  return unsafe.length ? `${title} root contains prohibited broad principals: ${unsafe.join(', ')}.` : undefined;
};

const physicalErrors = (title: string, expected: IOptionEFieldDefinition, actual: IOptionEFieldReadback): string[] => {
  const prefix = fieldTarget(title, expected.internalName);
  const errors: string[] = [];
  const compatibleTypes: readonly string[] = expected.compatibleExistingTypes || [expected.type];
  if (compatibleTypes.indexOf(actual.type) < 0) {
    errors.push(`${prefix} type ${actual.type}; expected compatible ${compatibleTypes.join('|')}.`);
  }
  if (actual.required !== expected.required) errors.push(`${prefix} Required ${actual.required}; expected ${expected.required}.`);
  if (expected.type === 'Text' && actual.type === 'Text' && actual.maxLength !== expected.maxLength) {
    errors.push(`${prefix} MaxLength ${String(actual.maxLength)}; expected ${String(expected.maxLength)}.`);
  }
  if (expected.type === 'Number' && actual.decimalPlaces !== expected.decimalPlaces) {
    errors.push(`${prefix} DecimalPlaces ${String(actual.decimalPlaces)}; expected ${String(expected.decimalPlaces)}.`);
  }
  if (expected.id && normalise(actual.id || '') !== normalise(expected.id)) {
    errors.push(`${prefix} field identity ${actual.id || '(missing)'}; expected ${expected.id}.`);
  }
  if (expected.defaultValue !== undefined && actual.defaultValue !== expected.defaultValue) {
    errors.push(`${prefix} default ${String(actual.defaultValue)}; expected ${String(expected.defaultValue)}.`);
  }
  return errors;
};

const addMutation = (
  mutations: IOptionEPlannedMutation[], operation: IOptionEPlannedMutation['operation'],
  target: string, expectedReadback: string
): void => { mutations.push({ operation, target, expectedReadback }); };

const inspectField = (
  definition: IOptionEListDefinition, expected: IOptionEFieldDefinition,
  actual: IOptionEFieldReadback | undefined, errors: string[], mutations: IOptionEPlannedMutation[]
): void => {
  const target = fieldTarget(definition.title, expected.internalName);
  if (!actual) {
    if (expected.action === 'Create' || expected.action === 'AddIfMissing') {
      addMutation(mutations, 'CreateField', target,
        `${expected.id}|${expected.type}|required=${expected.required}|indexed=${expected.indexed}|unique=${expected.enforceUniqueValues}`);
    } else errors.push(`${target} is a required governed field and cannot be recreated by Option-E.`);
    return;
  }
  errors.push(...physicalErrors(definition.title, expected, actual));
  const duplicates = actual.nonBlankDuplicateCount;
  if (expected.enforceUniqueValues && duplicates !== undefined && duplicates > 0) {
    errors.push(`${target} contains ${duplicates} non-blank duplicate value(s); remove duplicates before enforcing uniqueness.`);
  }
  if (expected.indexed && !actual.indexed) {
    if ((expected.action === 'ReuseOrAddIndex' || expected.action === 'AddIfMissing')
      && (!expected.enforceUniqueValues || duplicates === 0)) {
      addMutation(mutations, 'AddIndex', target, `Indexed=true|Unique=${expected.enforceUniqueValues}`);
    } else errors.push(`${target} Indexed false; expected true.`);
  }
  if (expected.enforceUniqueValues && !actual.enforceUniqueValues) {
    if (duplicates === undefined) {
      errors.push(`${target} uniqueness cannot be enabled without an explicit non-blank duplicate count readback.`);
    } else if (duplicates > 0) {
      // The exact duplicate remediation is already recorded above; no mutation is safe.
    } else if (expected.action === 'ReuseOrAddIndex' || expected.action === 'AddIfMissing') {
      addMutation(mutations, 'EnforceUniqueValues', target,
        'NonBlankDuplicateCount=0|Indexed=true|EnforceUniqueValues=true|exact readback required');
    } else {
      errors.push(`${target} EnforceUniqueValues false; expected true.`);
    }
  } else if (!expected.enforceUniqueValues && actual.enforceUniqueValues) {
    errors.push(`${target} unexpectedly enforces unique values.`);
  }
  if (expected.type === 'Choice') {
    const actualChoices = new Set(actual.choices || []);
    (expected.choices || []).forEach(choice => {
      if (!actualChoices.has(choice)) {
        if (expected.action === 'ReuseOrAddChoices') addMutation(mutations, 'AddChoice', `${target}.${choice}`, `Choice=${choice}`);
        else errors.push(`${target} is missing required lifecycle choice ${choice}.`);
      }
    });
    if (!expected.allowAdditionalChoices) {
      (actual.choices || []).filter(choice => (expected.choices || []).indexOf(choice) < 0)
        .forEach(choice => errors.push(`${target} contains undeclared choice ${choice}.`));
    }
  }
};

export const preflightOptionEWorkplanSchema = (
  firstReadback: readonly IOptionEListReadback[], secondReadback: readonly IOptionEListReadback[]
): IOptionEPreflightEvidence => {
  const errors = validateOptionEPhysicalSchema().slice();
  const mutations: IOptionEPlannedMutation[] = [];
  const exactExistingStores: string[] = [];
  const missingCreateableStores: string[] = [];
  const equal = canonicalReadbacks(firstReadback) === canonicalReadbacks(secondReadback);
  if (!equal) errors.push('The two canonical preflight readbacks differ; stop for TOCTOU remediation.');
  const duplicateTitles = firstReadback.map(item => item.title).filter((title, index, all) => all.indexOf(title) !== index);
  if (duplicateTitles.length) errors.push(`Duplicate governed list readbacks: ${sorted(duplicateTitles).join(', ')}.`);
  const actualByTitle = new Map(firstReadback.map(readback => [readback.title, readback]));
  OPTION_E_WORKPLAN_SCHEMA.forEach(definition => {
    const errorStart = errors.length;
    const mutationStart = mutations.length;
    const actual = actualByTitle.get(definition.title);
    if (!actual || !actual.exists) {
      if (!definition.createIfMissing) errors.push(`${definition.title} is a governed existing asset and must not be recreated.`);
      else {
        missingCreateableStores.push(definition.title);
        addMutation(mutations, 'CreateList', definition.title, 'Versioned private generic list with exact settings.');
        definition.fields.forEach(field => inspectField(definition, field, undefined, errors, mutations));
      }
      return;
    }
    if (!actual.enableVersioning) errors.push(`${definition.title} version history is disabled.`);
    if (actual.enableFolderCreation !== definition.enableFolderCreation) {
      errors.push(`${definition.title} EnableFolderCreation ${actual.enableFolderCreation}; expected ${definition.enableFolderCreation}.`);
    }
    if (actual.attachmentsEnabled !== definition.attachmentsEnabled) {
      errors.push(`${definition.title} AttachmentsEnabled ${actual.attachmentsEnabled}; expected ${definition.attachmentsEnabled}.`);
    }
    if (actual.contentTypesEnabled !== definition.contentTypesEnabled) {
      errors.push(`${definition.title} ContentTypesEnabled ${actual.contentTypesEnabled}; expected ${definition.contentTypesEnabled}.`);
    }
    if (!actual.rootHasUniqueRoleAssignments) errors.push(`${definition.title} root still inherits permissions.`);
    const broadError = broadPrincipalError(definition.title, actual.broadRootPrincipals);
    if (broadError) errors.push(broadError);
    if (!actual.defaultFormMutationDisabled) errors.push(`${definition.title} default forms still expose a mutation route.`);
    if (!actual.recoveryRoutePresent) errors.push(`${definition.title} has no reviewed recovery route.`);
    (actual.lifecycleIssues || []).forEach(issue => errors.push(`${definition.title} lifecycle mismatch: ${issue}.`));
    (actual.authorityMappingIssues || []).forEach(issue => errors.push(`${definition.title} authority mapping mismatch: ${issue}.`));
    const duplicateFields = actual.fields.map(field => field.internalName)
      .filter((name, index, all) => all.indexOf(name) !== index);
    if (duplicateFields.length) errors.push(`${definition.title} has duplicate field identities: ${sorted(duplicateFields).join(', ')}.`);
    const fieldsByName = new Map(actual.fields.map(field => [field.internalName, field]));
    definition.fields.forEach(expected => inspectField(definition, expected, fieldsByName.get(expected.internalName), errors, mutations));
    if (errors.length === errorStart && mutations.length === mutationStart) exactExistingStores.push(definition.title);
  });
  const unexpected = firstReadback.filter(readback => readback.exists
    && !OPTION_E_WORKPLAN_SCHEMA.some(definition => definition.title === readback.title));
  if (unexpected.length) errors.push(`Unexpected Option-E store readbacks: ${unexpected.map(item => item.title).join(', ')}.`);
  const ready = errors.length === 0;
  return {
    checkedStoreCount: OPTION_E_WORKPLAN_SCHEMA.length,
    canonicalReadbacksEqual: equal,
    exactExistingStores,
    missingCreateableStores,
    plannedMutations: ready ? mutations : [],
    mismatches: errors,
    remediation: errors.map(error => `STOP: ${error}`),
    ready
  };
};

/** Schema-only readiness for native Save. Planning permission is not deployment proof.
 * This remains insufficient without authenticated subject ACL, processor and hosted UAT evidence.
 */
export const isOptionEWorkplanNativeSaveSchemaConverged = (evidence: IOptionEPreflightEvidence): boolean =>
  evidence.ready === true
  && evidence.canonicalReadbacksEqual === true
  && evidence.checkedStoreCount === OPTION_E_WORKPLAN_SCHEMA.length
  && evidence.mismatches.length === 0
  && evidence.plannedMutations.length === 0
  && evidence.missingCreateableStores.length === 0
  && new Set(evidence.exactExistingStores).size === OPTION_E_WORKPLAN_SCHEMA.length
  && OPTION_E_WORKPLAN_SCHEMA.every(definition => evidence.exactExistingStores.indexOf(definition.title) >= 0);

const rollbackSteps = (): readonly IOptionERollbackStep[] => [
  { sequence: 1, operation: 'DisableOptionERoute', target: 'Option-E application route', deletesListOrField: false, deletesItemFileAuditOrSnapshot: false },
  { sequence: 2, operation: 'RestoreCapturedPermissions', target: 'Changed list roots and subject scopes', deletesListOrField: false, deletesItemFileAuditOrSnapshot: false },
  { sequence: 3, operation: 'RestoreCapturedConfiguration', target: 'Changed list settings and form routing', deletesListOrField: false, deletesItemFileAuditOrSnapshot: false },
  { sequence: 4, operation: 'PreserveEvidence', target: 'All lists, fields, items, requests, snapshots and audit events', deletesListOrField: false, deletesItemFileAuditOrSnapshot: false }
];

export const buildOptionEWorkplanProvisioningPlan = (
  firstReadback: readonly IOptionEListReadback[], secondReadback: readonly IOptionEListReadback[]
): IOptionEProvisioningPlan => {
  const preflight = preflightOptionEWorkplanSchema(firstReadback, secondReadback);
  if (!preflight.ready) throw new OptionEProvisioningPreflightError(preflight);
  const steps: IOptionEProvisioningStep[] = [];
  const add = (operation: OptionEProvisioningOperation, target: string, mutatesTenant: boolean, expectedReadback: string): void => {
    const sequence = steps.length + 1;
    steps.push({ sequence, operation, target, mutatesTenant, expectedReadback,
      idempotencyKey: `${OPTION_E_SCHEMA_CONTRACT_VERSION}|${sequence}|${operation}|${target}` });
  };
  add('VerifyCanonicalReadbacks', 'All seven governed stores', false, 'Two canonical readbacks are identical.');
  OPTION_E_WORKPLAN_SCHEMA.filter(definition => definition.existingAsset)
    .forEach(definition => add('VerifyExistingList', definition.title, false,
      'Identity, lifecycle, recovery and authority mappings are compatible.'));
  preflight.plannedMutations.forEach(item => add(item.operation, item.target, true, item.expectedReadback));
  const changesExistingStore = preflight.plannedMutations.some(item =>
    item.target.indexOf('KCFKPI_Workplans.') === 0 || item.target.indexOf('KCFKPI_Audit.') === 0);
  if (changesExistingStore) {
    add('BackfillOptionERowsExactETag', 'KCFKPI_Workplans and KCFKPI_Audit Option-E rows', true,
      'Only Option-E rows use exact ETag; legacy rows remain physically optional and unchanged.');
    add('ReadBackOptionERows', 'KCFKPI_Workplans and KCFKPI_Audit Option-E rows', false,
      'Every backfilled row and ETag transition is read back before route enablement.');
  }
  if (preflight.plannedMutations.length > 0) {
    add('EnableOptionERoute', 'Option-E application route', true,
      'Enable only after physical mutation and exact-ETag readback succeeds.');
  }
  return { contractVersion: OPTION_E_SCHEMA_CONTRACT_VERSION, tenantNeutral: true, applyAuthorised: false,
    preflight, steps, rollback: rollbackSteps() };
};

const expectedFieldReadback = (field: IOptionEFieldDefinition): IOptionEFieldReadback => ({
  id: field.id, internalName: field.internalName, type: field.type, required: field.required,
  indexed: field.indexed, enforceUniqueValues: field.enforceUniqueValues,
  maxLength: field.maxLength, decimalPlaces: field.decimalPlaces, choices: field.choices,
  defaultValue: field.defaultValue, nonBlankDuplicateCount: 0
});

export const optionEExpectedReadback = (definition: IOptionEListDefinition): IOptionEListReadback => ({
  title: definition.title, exists: true, enableVersioning: definition.enableVersioning,
  enableFolderCreation: definition.enableFolderCreation, attachmentsEnabled: definition.attachmentsEnabled,
  contentTypesEnabled: definition.contentTypesEnabled, rootHasUniqueRoleAssignments: definition.privateRoot,
  broadRootPrincipals: [], defaultFormMutationDisabled: definition.defaultFormMutationDisabled,
  recoveryRoutePresent: true, fields: definition.fields.map(expectedFieldReadback),
  lifecycleIssues: [], authorityMappingIssues: []
});

/** Deterministic state projection for developer validation only; it makes no tenant call. */
export const projectOptionEProvisioningResult = (
  before: readonly IOptionEListReadback[], plan: IOptionEProvisioningPlan
): readonly IOptionEListReadback[] => {
  if (plan.applyAuthorised) throw new Error('Tenant mutation must remain unauthorised in B13-03.');
  const beforeByTitle = new Map(before.filter(item => item.exists).map(item => [item.title, item]));
  const planned = new Set(plan.preflight.plannedMutations.map(item => `${item.operation}|${item.target}`));
  return OPTION_E_WORKPLAN_SCHEMA.map(definition => {
    const existing = beforeByTitle.get(definition.title);
    if (!existing) return optionEExpectedReadback(definition);
    const fields: IOptionEFieldReadback[] = existing.fields.map(field => ({
      ...field, choices: field.choices?.slice()
    }));
    const byName = new Map(fields.map(field => [field.internalName, field]));
    definition.fields.forEach(expected => {
      const actual = byName.get(expected.internalName);
      const targetName = fieldTarget(definition.title, expected.internalName);
      if (!actual && planned.has(`CreateField|${targetName}`)) {
        const created = expectedFieldReadback(expected);
        fields.push(created);
        byName.set(expected.internalName, created);
      } else if (actual) {
        if (planned.has(`AddIndex|${targetName}`)) actual.indexed = true;
        if (planned.has(`EnforceUniqueValues|${targetName}`)) actual.enforceUniqueValues = true;
      }
      const current = byName.get(expected.internalName);
      if (current && expected.action === 'ReuseOrAddChoices') {
        const additions = (expected.choices || []).filter(choice => planned.has(`AddChoice|${targetName}.${choice}`));
        current.choices = Array.from(new Set([...(current.choices || []), ...additions]));
      }
    });
    return { ...existing, fields };
  });
};

export const optionEFieldSchemaXml = (field: IOptionEFieldDefinition): string => {
  const escapeXml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&apos;');
  const attributes = [
    `Name="${escapeXml(field.internalName)}"`, `StaticName="${escapeXml(field.internalName)}"`,
    `DisplayName="${escapeXml(field.internalName)}"`, `Type="${field.type}"`,
    `Required="${field.required ? 'TRUE' : 'FALSE'}"`, `Indexed="${field.indexed ? 'TRUE' : 'FALSE'}"`,
    `EnforceUniqueValues="${field.enforceUniqueValues ? 'TRUE' : 'FALSE'}"`, 'Hidden="FALSE"',
    field.id ? `ID="{${field.id}}"` : '', 'Group="KCF KPI Option E"'
  ].filter(Boolean);
  if (field.type === 'Text') attributes.push(`MaxLength="${field.maxLength}"`);
  if (field.type === 'Note') attributes.push('RichText="FALSE"', 'AppendOnly="FALSE"');
  if (field.type === 'Number') attributes.push(`Decimals="${field.decimalPlaces}"`);
  if (field.type === 'Boolean' && field.defaultValue !== undefined) attributes.push(`Default="${field.defaultValue ? '1' : '0'}"`);
  const choices = field.choices?.length
    ? `<CHOICES>${field.choices.map(value => `<CHOICE>${escapeXml(value)}</CHOICE>`).join('')}</CHOICES>` : '';
  return `<Field ${attributes.join(' ')}>${choices}</Field>`;
};

export const optionEProvisioningMutationCount = (plan: IOptionEProvisioningPlan): number =>
  plan.steps.filter(step => step.mutatesTenant).length;

export const optionEListDefinitionByTitle = (
  title: OptionEWorkplanListTitle
): IOptionEListDefinition => OPTION_E_WORKPLAN_SCHEMA.find(definition => definition.title === title) as IOptionEListDefinition;
