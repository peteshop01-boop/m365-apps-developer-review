import {
  OPTION_E_ACL_RECONCILER_MASKS,
  OPTION_E_CONTENT_PROCESSOR_MASKS,
  OPTION_E_NATIVE_ROLES,
  OPTION_E_RECOVERY_ROLE,
  OPTION_E_SCHEMA_CONTRACT_VERSION,
  OPTION_E_WORKPLAN_SCHEMA,
  type IOptionENativeRoleDefinition,
  type OptionEWorkplanListTitle
} from '../OptionEWorkplanPhysicalSchema';
import {
  assertOptionEWorkplanAclPlan,
  buildOptionEWorkplanAclPlan,
  convergeOptionENativeRoleDefinitions,
  type IOptionEAclContext,
  type IOptionEAclStep,
  type IOptionENativeRoleReadback
} from '../OptionEWorkplanAclPlan';
import {
  buildOptionEWorkplanProvisioningPlan,
  isOptionEWorkplanNativeSaveSchemaConverged,
  preflightOptionEWorkplanSchema,
  optionEFieldSchemaXml,
  type IOptionEListReadback,
  type IOptionEPlannedMutation
} from './OptionEWorkplanProvisioner';

export const OPTION_E_EXECUTOR_VERSION = 'KCF-KPI-OPTION-E-TENANT-EXECUTOR-V2';
export const OPTION_E_EXECUTOR_SITE_URL = 'https://example.invalid/sites/REVIEW-TEST-SITE';
export const OPTION_E_EXECUTOR_WEB_ID = '4ebc956f-bc50-42e0-ac05-59a032569075';
export const OPTION_E_EXECUTOR_ENVIRONMENT = 'REVIEW-TEST-SITE-TEST';
export const OPTION_E_BINDING_VERSION = 'KCF-KPI-B13-02-PACKAGE-2-INTEGRATION-V1';

export type OptionETenantExecutorMode = 'Plan' | 'Apply' | 'Readback' | 'Rollback';
export type OptionETenantExecutorScope = 'RootSchemaAcl' | 'SubjectAcl';
export type OptionEExecutionState =
  | 'CREATED' | 'INPUTS_VERIFIED' | 'AUTHENTICATED'
  | 'BEFORE_CAPTURED_1' | 'BEFORE_CAPTURED_2' | 'PLANNED'
  | 'APPLY_AUTHORISED' | 'STEP_APPLYING' | 'STEP_READ_BACK'
  | 'AFTER_CAPTURED' | 'ZERO_DELTA_CONFIRMED' | 'COMPLETE';

export interface IOptionEExecutorTarget {
  tenantId: string;
  siteUrl: string;
  webId: string;
  environmentLabel: string;
  // The governed contract requires an explicit JSON null to prove no Power Platform binding exists.
  // eslint-disable-next-line @rushstack/no-new-null
  powerPlatformEnvironmentId: null;
}

export interface IOptionEExecutorCandidate {
  commit: string;
  tree: string;
  sppkgSha256: string;
  schemaManifestSha256: string;
  bindingManifestSha256: string;
  executorPackageSha256: string;
  f03EvidenceSha256: string;
}

export interface IOptionEExecutorIdentity {
  label: 'E1' | 'M1' | 'M0' | 'U1' | 'E2' | 'ContentProcessor' | 'AclReconciler' | 'Recovery' | 'Operator';
  objectId: string;
  loginClaim: string;
  isSiteAdmin: boolean;
  currentUserReceiptSha256: string;
  membershipSha256: string;
}

export interface IOptionERowReadback {
  listTitle: OptionEWorkplanListTitle;
  id: number;
  uniqueId: string;
  eTag: string;
  key?: string;
  rowSha256: string;
  conflictsWithOptionE: boolean;
}

export interface IOptionERootAssignmentReadback {
  listTitle: OptionEWorkplanListTitle;
  principal: string;
  roleDefinition: IOptionENativeRoleReadback;
  effectiveHigh: number;
  effectiveLow: number;
}

export interface IOptionEImmediateDuplicateCheck {
  listTitle: 'KCFKPI_People' | 'KCFKPI_Workplans';
  field: 'Email' | 'DraftItemId';
  nonBlankDuplicateCount: number;
  querySha256: string;
  observedAtUtc: string;
}

export interface IOptionETenantCapture {
  lists: readonly IOptionEListReadback[];
  roles: readonly IOptionENativeRoleReadback[];
  rows: readonly IOptionERowReadback[];
  rootAssignments: readonly IOptionERootAssignmentReadback[];
}

export interface IOptionESubjectBinding {
  logicalTarget: string;
  listTitle: OptionEWorkplanListTitle;
  listId: string;
  itemId?: number;
  uniqueId: string;
  eTag: string;
  beforeSha256: string;
  apiPath: string;
  parentPrivate: true;
  recoveryProof: true;
  hierarchyEpoch: number;
  aclEpoch: number;
}

export interface IOptionETenantExecutionInput {
  executorVersion: typeof OPTION_E_EXECUTOR_VERSION;
  schemaVersion: typeof OPTION_E_SCHEMA_CONTRACT_VERSION;
  bindingVersion: typeof OPTION_E_BINDING_VERSION;
  mode: OptionETenantExecutorMode;
  scope?: OptionETenantExecutorScope;
  runId: string;
  target: IOptionEExecutorTarget;
  candidate: IOptionEExecutorCandidate;
  operatorObjectId: string;
  transportModule: Readonly<{ name: 'PnP.PowerShell'; version: '3.2.0' }>;
  identities: readonly IOptionEExecutorIdentity[];
  firstCapture: IOptionETenantCapture;
  secondCapture: IOptionETenantCapture;
  allowListedCreateableRows: readonly IOptionERowReadback[];
  existingStoreAggregateSha256: Readonly<Partial<Record<OptionEWorkplanListTitle, string>>>;
  immediateDuplicateChecks: readonly IOptionEImmediateDuplicateCheck[];
  subjectBindings?: readonly IOptionESubjectBinding[];
  aclContext?: IOptionEAclContext;
}

export interface IOptionETransportRequest {
  method: 'GET' | 'POST';
  relativeUrl: string;
  headers?: Readonly<Record<string, string>>;
  body?: unknown;
}

export interface IOptionETenantExecutionStep {
  sequence: number;
  state: 'STEP_APPLYING' | 'STEP_READ_BACK';
  scope: OptionETenantExecutorScope;
  operation: string;
  target: string;
  mutatesTenant: boolean;
  expectedReadback: string;
  expectedReadbackData?: unknown;
  beforeSha256?: string;
  principal?: string;
  roleDefinitionId?: number;
  roleName?: string;
  roleTypeKind?: number;
  high?: number;
  low?: number;
  eTag?: string;
  request?: IOptionETransportRequest;
  readbackRequest?: IOptionETransportRequest;
  rollback?: Readonly<{ operation: 'RemoveExecutorIntroducedSubjectGrant'; permitted: boolean }>;
}

export interface IOptionETenantExecutionPlan {
  executorVersion: typeof OPTION_E_EXECUTOR_VERSION;
  schemaVersion: typeof OPTION_E_SCHEMA_CONTRACT_VERSION;
  bindingVersion: typeof OPTION_E_BINDING_VERSION;
  runId: string;
  mode: OptionETenantExecutorMode;
  scope?: OptionETenantExecutorScope;
  inputSha256: string;
  target: IOptionEExecutorTarget;
  states: readonly OptionEExecutionState[];
  requiresAuthorisation: boolean;
  executable: boolean;
  mutationCount: number;
  requiresBoundedResume: boolean;
  resumeReasons: readonly string[];
  steps: readonly IOptionETenantExecutionStep[];
  assertions: Readonly<{
    storeCount: 7;
    fieldCount: 98;
    uniqueContractCount: 10;
    customRoleCount: 5;
    capturesEqual: boolean;
    principalsSeparated: boolean;
    noWildcardEtag: boolean;
  }>;
}

export class OptionETenantExecutionPlanError extends Error {
  public constructor(public readonly errors: readonly string[]) {
    super(`Option-E tenant execution plan failed: ${errors.join(' ')}`);
    this.name = 'OptionETenantExecutionPlanError';
    Object.setPrototypeOf(this, OptionETenantExecutionPlanError.prototype);
  }
}

const SHA256 = /^[0-9a-f]{64}$/i;
const GIT_ID = /^[0-9a-f]{40}$/i;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXACT_UNIQUE_CONTRACTS = Object.freeze([
  'KCFKPI_WorkplanSubmitRequests.RequestKey',
  'KCFKPI_WorkplanSubmittedSnapshots.SnapshotKey',
  'KCFKPI_WorkplanSubmittedSnapshots.RequestKey',
  'KCFKPI_Workplans.WorkplanKey',
  'KCFKPI_Workplans.DraftItemId',
  'KCFKPI_WorkplanSubmitOperations.OperationKey',
  'KCFKPI_WorkplanSubmitOperations.RequestKey',
  'KCFKPI_Audit.AuditKey',
  'KCFKPI_People.PersonKey',
  'KCFKPI_People.Email'
]);
const CREATEABLE_STORES = new Set(OPTION_E_WORKPLAN_SCHEMA.filter(item => item.createIfMissing).map(item => item.title));
const EXISTING_STORES = new Set(OPTION_E_WORKPLAN_SCHEMA.filter(item => item.existingAsset).map(item => item.title));

export const optionECanonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(optionECanonicalValue);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.keys(source).sort().reduce<Record<string, unknown>>((result, key) => {
      if (source[key] !== undefined) result[key] = optionECanonicalValue(source[key]);
      return result;
    }, {});
  }
  return value;
};

export const optionECanonicalJson = (value: unknown): string => JSON.stringify(optionECanonicalValue(value));

const normalise = (value: string): string => value.trim().toLowerCase();
const exactEtag = (value: string): boolean => Boolean(value && value.trim() && value.trim() !== '*');
const escapeOdata = (value: string): string => value.replace(/'/g, "''");
const listApi = (title: string): string => `/_api/web/lists/GetByTitle('${escapeOdata(title)}')`;
const roleTuple = (role: Pick<IOptionENativeRoleReadback, 'name' | 'roleTypeKind' | 'high' | 'low'>): string =>
  `${role.name}|${role.roleTypeKind}|${role.high}|${role.low}`;
const sameRole = (
  actual: IOptionENativeRoleReadback,
  expected: Pick<IOptionENativeRoleReadback, 'name' | 'roleTypeKind' | 'high' | 'low'>
): boolean => actual.name === expected.name && actual.roleTypeKind === expected.roleTypeKind
  && actual.high === expected.high && actual.low === expected.low;

const validateHashesAndTarget = (input: IOptionETenantExecutionInput, errors: string[]): void => {
  if (input.executorVersion !== OPTION_E_EXECUTOR_VERSION) errors.push('Executor version is not V2.');
  if (input.schemaVersion !== OPTION_E_SCHEMA_CONTRACT_VERSION) errors.push('Schema contract is not V3.');
  if (input.bindingVersion !== OPTION_E_BINDING_VERSION) errors.push('Binding contract is not the fixed V1 contract.');
  if (input.target.siteUrl !== OPTION_E_EXECUTOR_SITE_URL) errors.push('Site URL is outside the exact TEST allow-list.');
  if (normalise(input.target.webId) !== OPTION_E_EXECUTOR_WEB_ID) errors.push('Web ID is outside the exact TEST allow-list.');
  if (input.target.environmentLabel !== OPTION_E_EXECUTOR_ENVIRONMENT) errors.push('Environment marker is outside the exact TEST allow-list.');
  if (input.target.powerPlatformEnvironmentId !== null) errors.push('Power Platform environment binding is prohibited.');
  if (!GUID.test(input.target.tenantId)) errors.push('Tenant ID must be an exact GUID.');
  if (!GUID.test(input.runId)) errors.push('Run ID must be an exact GUID.');
  if (!GUID.test(input.operatorObjectId)) errors.push('Operator object ID must be an exact GUID.');
  if (input.transportModule.name !== 'PnP.PowerShell' || input.transportModule.version !== '3.2.0') {
    errors.push('Transport must be pinned to PnP.PowerShell 3.2.0.');
  }
  if (!GIT_ID.test(input.candidate.commit) || !GIT_ID.test(input.candidate.tree)) {
    errors.push('Candidate commit and tree must be exact 40-character Git identities.');
  }
  (['sppkgSha256', 'schemaManifestSha256', 'bindingManifestSha256', 'executorPackageSha256', 'f03EvidenceSha256'] as const)
    .forEach(key => { if (!SHA256.test(input.candidate[key])) errors.push(`${key} must be an exact SHA-256.`); });
  if ((input.mode === 'Apply' || input.mode === 'Rollback') && !input.scope) errors.push(`${input.mode} requires an exact scope.`);
  if (input.mode === 'Rollback' && input.scope !== 'SubjectAcl') errors.push('Rollback is limited to receipted SubjectAcl changes.');
};

const validateIdentities = (input: IOptionETenantExecutionInput, errors: string[]): void => {
  const expected = ['E1', 'M1', 'M0', 'U1', 'E2', 'ContentProcessor', 'AclReconciler', 'Recovery', 'Operator'];
  expected.forEach(label => {
    const matches = input.identities.filter(identity => identity.label === label);
    if (matches.length !== 1) errors.push(`Identity ${label} must occur exactly once; found ${matches.length}.`);
  });
  const objectIds = input.identities.map(item => normalise(item.objectId));
  const claims = input.identities.map(item => normalise(item.loginClaim));
  if (objectIds.some(id => !GUID.test(id))) errors.push('Every identity requires an exact object ID.');
  if (objectIds.some((id, index) => objectIds.indexOf(id) !== index)) errors.push('All executor, service and human object IDs must be distinct.');
  if (claims.some(claim => !claim) || claims.some((claim, index) => claims.indexOf(claim) !== index)) {
    errors.push('All executor, service and human login claims must be non-empty and distinct.');
  }
  input.identities.forEach(identity => {
    if (!SHA256.test(identity.currentUserReceiptSha256) || !SHA256.test(identity.membershipSha256)) {
      errors.push(`${identity.label} requires independent current-user and membership receipt hashes.`);
    }
    if (['E1', 'M1', 'M0', 'U1', 'E2'].indexOf(identity.label) >= 0 && identity.isSiteAdmin) {
      errors.push(`${identity.label} must not be a site collection administrator.`);
    }
  });
  const operator = input.identities.find(item => item.label === 'Operator');
  if (!operator || normalise(operator.objectId) !== normalise(input.operatorObjectId)) {
    errors.push('Operator object ID does not match the independently receipted Operator identity.');
  }
};

const validateCapturePair = (input: IOptionETenantExecutionInput, errors: string[]): void => {
  if (optionECanonicalJson(input.firstCapture) !== optionECanonicalJson(input.secondCapture)) {
    errors.push('The two complete before captures differ; stop for TOCTOU remediation.');
  }
  const uniqueContracts = OPTION_E_WORKPLAN_SCHEMA.flatMap(list => list.fields
    .filter(field => field.enforceUniqueValues).map(field => `${list.title}.${field.internalName}`));
  if (optionECanonicalJson(uniqueContracts) !== optionECanonicalJson(EXACT_UNIQUE_CONTRACTS)) {
    errors.push('The physical contract does not expose the exact ten uniqueness contracts.');
  }
  input.firstCapture.rows.forEach(row => {
    if (!Number.isInteger(row.id) || row.id <= 0 || !GUID.test(row.uniqueId) || !exactEtag(row.eTag) || !SHA256.test(row.rowSha256)) {
      errors.push(`${row.listTitle} row ${row.id} lacks an exact ID, UniqueId, ETag or row hash.`);
    }
    if (row.conflictsWithOptionE) errors.push(`${row.listTitle} row ${row.id} conflicts with governed Option-E keys.`);
    if (CREATEABLE_STORES.has(row.listTitle)) {
      const allowed = input.allowListedCreateableRows.filter(item => item.listTitle === row.listTitle
        && item.id === row.id && normalise(item.uniqueId) === normalise(row.uniqueId)
        && item.eTag === row.eTag && item.rowSha256 === row.rowSha256);
      if (allowed.length !== 1) errors.push(`${row.listTitle} pre-existing row ${row.id} is not exactly allow-listed.`);
    }
  });
  EXISTING_STORES.forEach(title => {
    const expected = input.existingStoreAggregateSha256[title];
    if (!expected || !SHA256.test(expected)) errors.push(`${title} requires an opaque legacy-row aggregate SHA-256.`);
  });
  const expectedImmediate = ['KCFKPI_People.Email', 'KCFKPI_Workplans.DraftItemId'];
  expectedImmediate.forEach(contract => {
    const matches = input.immediateDuplicateChecks.filter(item => `${item.listTitle}.${item.field}` === contract);
    if (matches.length !== 1 || matches[0].nonBlankDuplicateCount !== 0
      || !SHA256.test(matches[0].querySha256) || Number.isNaN(Date.parse(matches[0].observedAtUtc))) {
      errors.push(`${contract} requires one immediate zero-duplicate query receipt.`);
    }
  });
};

interface IRolePlanResult {
  steps: IOptionETenantExecutionStep[];
  resolved: readonly IOptionENativeRoleReadback[];
  requiresResume: boolean;
  errors: string[];
}

const planRoleDefinitions = (input: IOptionETenantExecutionInput): IRolePlanResult => {
  const errors: string[] = [];
  const steps: IOptionETenantExecutionStep[] = [];
  const first = input.firstCapture.roles;
  const second = input.secondCapture.roles;
  const ids = new Set<number>();
  const names = new Set<string>();
  first.forEach(role => {
    if (!Number.isInteger(role.id) || role.id <= 0) errors.push(`${role.name} has no positive native role-definition ID.`);
    if (ids.has(role.id)) errors.push(`Duplicate native role-definition ID ${role.id}.`);
    ids.add(role.id);
    const name = normalise(role.name);
    if (names.has(name)) errors.push(`Duplicate/same-name native role ${role.name}.`);
    names.add(name);
  });
  OPTION_E_NATIVE_ROLES.forEach(expected => {
    const byName = first.filter(role => normalise(role.name) === normalise(expected.name));
    const aliases = first.filter(role => normalise(role.name) !== normalise(expected.name)
      && role.high === expected.high && role.low === expected.low);
    if (aliases.length) errors.push(`${expected.name} has same-mask alias(es): ${aliases.map(role => role.name).join(', ')}.`);
    if (byName.length > 1) errors.push(`${expected.name} has duplicate same-name role definitions.`);
    if (byName.length === 1 && !sameRole(byName[0], expected)) {
      errors.push(`${expected.name} is ${roleTuple(byName[0])}; expected custom 0/${expected.high}/${expected.low}.`);
    }
    if (byName.length === 0) {
      const sequence = steps.length + 1;
      steps.push({
        sequence, state: 'STEP_APPLYING', scope: 'RootSchemaAcl', operation: 'AddMissingExactRole',
        target: expected.name, mutatesTenant: true,
        expectedReadback: `positive returned ID|${roleTuple(expected)}`,
        expectedReadbackData: { Name: expected.name, RoleTypeKind: 0,
          BasePermissions: { High: expected.high, Low: expected.low } },
        roleName: expected.name, roleTypeKind: 0, high: expected.high, low: expected.low,
        request: {
          method: 'POST', relativeUrl: '/_api/web/roledefinitions',
          body: { __metadata: { type: 'SP.RoleDefinition' }, Name: expected.name,
            Description: `${OPTION_E_EXECUTOR_VERSION}|${OPTION_E_SCHEMA_CONTRACT_VERSION}`,
            BasePermissions: { High: expected.high, Low: expected.low } }
        },
        readbackRequest: { method: 'GET', relativeUrl: '/_api/web/roledefinitions/getbyid({returnedRoleDefinitionId})' }
      });
    }
  });
  const recovery = first.filter(role => normalise(role.name) === normalise(OPTION_E_RECOVERY_ROLE.name));
  if (recovery.length !== 1 || !sameRole(recovery[0], OPTION_E_RECOVERY_ROLE)) {
    errors.push('Recovery Full Control must be one exact built-in Administrator 5/2147483647/4294967295 role.');
  }
  const requiresResume = steps.length > 0;
  if (!requiresResume && errors.length === 0) {
    const convergence = convergeOptionENativeRoleDefinitions(first, [], second);
    if (!convergence.ready) errors.push(...convergence.errors);
    return { steps, resolved: [...convergence.resolvedRoles, ...(convergence.recoveryRole ? [convergence.recoveryRole] : [])],
      requiresResume, errors };
  }
  return { steps, resolved: [], requiresResume, errors };
};

const schemaMutationRequest = (
  mutation: IOptionEPlannedMutation,
  capture: IOptionETenantCapture
): Pick<IOptionETenantExecutionStep, 'request' | 'readbackRequest' | 'eTag' | 'expectedReadbackData'> => {
  const [title, ...fieldParts] = mutation.target.split('.');
  const fieldName = fieldParts[0];
  const definition = OPTION_E_WORKPLAN_SCHEMA.find(item => item.title === title);
  if (!definition) throw new Error(`No governed list definition exists for ${title}.`);
  if (mutation.operation === 'CreateList') {
    return {
      request: { method: 'POST', relativeUrl: '/_api/web/lists', body: {
        __metadata: { type: 'SP.List' }, BaseTemplate: 100, Title: title,
        EnableVersioning: true, EnableFolderCreation: definition.enableFolderCreation,
        EnableAttachments: definition.attachmentsEnabled, ContentTypesEnabled: definition.contentTypesEnabled
      } },
      expectedReadbackData: { Title: title, EnableVersioning: true,
        EnableFolderCreation: definition.enableFolderCreation,
        EnableAttachments: definition.attachmentsEnabled, ContentTypesEnabled: definition.contentTypesEnabled },
      readbackRequest: { method: 'GET', relativeUrl: `${listApi(title)}?$select=Id,Title,EnableVersioning,EnableFolderCreation,EnableAttachments,ContentTypesEnabled,HasUniqueRoleAssignments` }
    };
  }
  const field = definition.fields.find(item => item.internalName === fieldName);
  if (!field) throw new Error(`No governed field definition exists for ${mutation.target}.`);
  if (mutation.operation === 'CreateField') {
    return {
      request: { method: 'POST', relativeUrl: `${listApi(title)}/fields/createfieldasxml`,
        body: { parameters: { SchemaXml: optionEFieldSchemaXml(field), Options: 0 } } },
      expectedReadbackData: { InternalName: fieldName, TypeAsString: field.type, Required: field.required,
        Indexed: field.indexed, EnforceUniqueValues: field.enforceUniqueValues },
      readbackRequest: { method: 'GET', relativeUrl: `${listApi(title)}/fields/getbyinternalnameortitle('${escapeOdata(fieldName)}')` }
    };
  }
  const fieldReadback = capture.lists.find(item => item.title === title)?.fields.find(item => item.internalName === fieldName);
  const extension = fieldReadback as (typeof fieldReadback & { eTag?: string });
  if (!extension?.eTag || !exactEtag(extension.eTag)) throw new Error(`${mutation.target} mutation requires an exact field ETag.`);
  const body = mutation.operation === 'AddIndex' ? { Indexed: true }
    : mutation.operation === 'EnforceUniqueValues' ? { Indexed: true, EnforceUniqueValues: true }
      : { Choices: field.choices };
  const relativeUrl = `${listApi(title)}/fields/getbyinternalnameortitle('${escapeOdata(fieldName)}')`;
  return {
    eTag: extension.eTag,
    request: { method: 'POST', relativeUrl, headers: { 'IF-MATCH': extension.eTag, 'X-HTTP-Method': 'MERGE' }, body },
    expectedReadbackData: body,
    readbackRequest: { method: 'GET', relativeUrl }
  };
};

const roleByLow = (roles: readonly IOptionENativeRoleReadback[], low: number): IOptionENativeRoleReadback | undefined =>
  roles.find(role => role.roleTypeKind === 0 && role.high === 0 && role.low === low);

type IOptionEListExecutionReadback = IOptionEListReadback & Readonly<{
  listId?: string;
  eTag?: string;
  createdByExecutorReceiptSha256?: string;
}>;

const isReceiptedNewList = (input: IOptionETenantExecutionInput, readback: IOptionEListReadback): boolean => {
  const observed = readback as IOptionEListExecutionReadback;
  const definition = OPTION_E_WORKPLAN_SCHEMA.find(item => item.title === readback.title);
  return Boolean(definition?.createIfMissing && readback.exists && !readback.rootHasUniqueRoleAssignments
    && GUID.test(observed.listId || '') && exactEtag(observed.eTag || '')
    && SHA256.test(observed.createdByExecutorReceiptSha256 || '')
    && input.firstCapture.rows.every(row => row.listTitle !== readback.title));
};

const planRootAssignments = (
  input: IOptionETenantExecutionInput,
  roles: readonly IOptionENativeRoleReadback[],
  startSequence: number,
  errors: string[]
): IOptionETenantExecutionStep[] => {
  const steps: IOptionETenantExecutionStep[] = [];
  const processor = input.identities.find(item => item.label === 'ContentProcessor')?.loginClaim || '';
  const reconciler = input.identities.find(item => item.label === 'AclReconciler')?.loginClaim || '';
  const recovery = input.identities.find(item => item.label === 'Recovery')?.loginClaim || '';
  const recoveryRole = roles.find(role => sameRole(role, OPTION_E_RECOVERY_ROLE));
  OPTION_E_WORKPLAN_SCHEMA.forEach(definition => {
    const listReadback = input.firstCapture.lists.find(item => item.title === definition.title && item.exists);
    if (!listReadback) return;
    const executionReadback = listReadback as IOptionEListExecutionReadback;
    const expected: Array<{ principal: string; role?: IOptionENativeRoleReadback }> = [
      { principal: recovery, role: recoveryRole },
      { principal: processor, role: roleByLow(roles, OPTION_E_CONTENT_PROCESSOR_MASKS[definition.title]) },
      ...(OPTION_E_ACL_RECONCILER_MASKS[definition.title] === undefined ? []
        : [{ principal: reconciler, role: roleByLow(roles, OPTION_E_ACL_RECONCILER_MASKS[definition.title] as number) }]),
    ];
    const observed = input.firstCapture.rootAssignments.filter(item => item.listTitle === definition.title);
    observed.forEach(assignment => {
      const match = expected.find(item => normalise(item.principal) === normalise(assignment.principal)
        && item.role && assignment.roleDefinition.id === item.role.id && sameRole(assignment.roleDefinition, item.role));
      if (!match || assignment.effectiveHigh !== assignment.roleDefinition.high
        || assignment.effectiveLow !== assignment.roleDefinition.low) {
        errors.push(`${definition.title} contains an unexplained, wrong, multiple or broader root assignment for ${assignment.principal}.`);
      }
    });
    if (isReceiptedNewList(input, listReadback)) {
      const recoverySequence = startSequence + steps.length;
      steps.push({
        sequence: recoverySequence, state: 'STEP_READ_BACK', scope: 'RootSchemaAcl',
        operation: 'AssertRecoveryFullControl', target: input.target.webId, mutatesTenant: false,
        expectedReadback: `${recovery}|${recoveryRole?.id}|Full Control|5|2147483647|4294967295`,
        roleDefinitionId: recoveryRole?.id, roleName: recoveryRole?.name,
        principal: recovery,
        roleTypeKind: recoveryRole?.roleTypeKind, high: recoveryRole?.high, low: recoveryRole?.low,
        readbackRequest: { method: 'GET', relativeUrl: '/_api/web/roleassignments?$expand=Member,RoleDefinitionBindings' }
      });
      const breakSequence = startSequence + steps.length;
      steps.push({
        sequence: breakSequence, state: 'STEP_APPLYING', scope: 'RootSchemaAcl',
        operation: 'BreakInheritanceNoCopy', target: definition.title, mutatesTenant: true,
        eTag: executionReadback.eTag,
        expectedReadback: 'HasUniqueRoleAssignments=true|copyRoleAssignments=false|zero rows|recovery re-bound exactly',
        expectedReadbackData: { HasUniqueRoleAssignments: true },
        request: { method: 'POST', relativeUrl: `${listApi(definition.title)}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`,
          headers: { 'IF-MATCH': executionReadback.eTag as string } },
        readbackRequest: { method: 'GET', relativeUrl: `${listApi(definition.title)}?$select=Id,HasUniqueRoleAssignments` }
      });
    }
    expected.forEach(item => {
      if (!item.role || item.role.id <= 0) {
        errors.push(`${definition.title} cannot bind ${item.principal} without one exact positive native role ID.`);
        return;
      }
      const matches = observed.filter(assignment => normalise(assignment.principal) === normalise(item.principal));
      if (matches.length > 1) {
        errors.push(`${definition.title} has multiple root bindings for ${item.principal}.`);
      } else if (matches.length === 0) {
        const sequence = startSequence + steps.length;
        steps.push({
          sequence, state: 'STEP_APPLYING', scope: 'RootSchemaAcl', operation: 'EnsureRoleAssignment',
          target: definition.title, mutatesTenant: true,
          expectedReadback: `exactly one ${roleTuple(item.role)} binding with exact effective mask`,
          expectedReadbackData: { assignment: { principal: item.principal, roleDefinitionId: item.role.id,
            roleTypeKind: item.role.roleTypeKind, high: item.role.high, low: item.role.low } },
          principal: item.principal,
          roleDefinitionId: item.role.id, roleName: item.role.name, roleTypeKind: item.role.roleTypeKind,
          high: item.role.high, low: item.role.low,
          request: { method: 'POST', relativeUrl: `${listApi(definition.title)}/roleassignments/addroleassignment(principalid={resolvedPrincipalId},roledefid=${item.role.id})` },
          readbackRequest: { method: 'GET', relativeUrl: `${listApi(definition.title)}/roleassignments?$expand=Member,RoleDefinitionBindings` }
        });
      }
    });
  });
  return steps;
};

const subjectRequest = (
  step: IOptionEAclStep,
  binding: IOptionESubjectBinding
): Pick<IOptionETenantExecutionStep, 'request' | 'readbackRequest' | 'eTag' | 'rollback'> => {
  const assignments = `${binding.apiPath}/roleassignments`;
  const readbackRequest: IOptionETransportRequest = { method: 'GET',
    relativeUrl: `${assignments}?$expand=Member,RoleDefinitionBindings` };
  if (step.operation === 'EnsureRoleAssignment') {
    return {
      eTag: binding.eTag,
      request: { method: 'POST',
        relativeUrl: `${assignments}/addroleassignment(principalid={resolvedPrincipalId},roledefid=${step.roleDefinitionId})`,
        headers: { 'IF-MATCH': binding.eTag } },
      readbackRequest,
      rollback: { operation: 'RemoveExecutorIntroducedSubjectGrant', permitted: true }
    };
  }
  if (step.operation === 'RemoveRoleAssignment') {
    return {
      eTag: binding.eTag,
      request: { method: 'POST',
        relativeUrl: `${assignments}/removeroleassignment(principalid={resolvedPrincipalId},roledefid=${step.roleDefinitionId})`,
        headers: { 'IF-MATCH': binding.eTag } }, readbackRequest
    };
  }
  return { readbackRequest };
};

const planSubjectAcl = (
  input: IOptionETenantExecutionInput,
  startSequence: number,
  errors: string[]
): IOptionETenantExecutionStep[] => {
  if (!input.aclContext) {
    errors.push('SubjectAcl requires the reviewed pure ACL context.');
    return [];
  }
  const plan = buildOptionEWorkplanAclPlan(input.aclContext);
  errors.push(...assertOptionEWorkplanAclPlan(plan, input.aclContext));
  const bindings = input.subjectBindings || [];
  const steps: IOptionETenantExecutionStep[] = [];
  const broken = new Set<string>();
  const recovery = input.firstCapture.roles.find(role => sameRole(role, OPTION_E_RECOVERY_ROLE));
  if (!recovery) errors.push('SubjectAcl lacks the exact positive recovery Administrator role.');
  else {
    steps.push({
      sequence: startSequence, state: 'STEP_READ_BACK', scope: 'SubjectAcl',
      operation: 'AssertRecoveryFullControl', target: input.target.webId, mutatesTenant: false,
      expectedReadback: `${input.aclContext.recoveryAdminPrincipal}|${roleTuple(recovery)}`,
      expectedReadbackData: { assignment: { principal: input.aclContext.recoveryAdminPrincipal,
        roleDefinitionId: recovery.id, roleTypeKind: 5, high: recovery.high, low: recovery.low } },
      principal: input.aclContext.recoveryAdminPrincipal,
      roleDefinitionId: recovery.id, roleName: recovery.name, roleTypeKind: recovery.roleTypeKind,
      high: recovery.high, low: recovery.low,
      readbackRequest: { method: 'GET', relativeUrl: '/_api/web/roleassignments?$expand=Member,RoleDefinitionBindings' }
    });
  }
  bindings.filter((binding, index) => bindings.findIndex(item => item.logicalTarget === binding.logicalTarget) !== index)
    .forEach(binding => errors.push(`Subject target ${binding.logicalTarget} has duplicate receipted bindings.`));
  plan.steps.filter(step => !OPTION_E_WORKPLAN_SCHEMA.some(item => item.title === step.target)
    && step.target !== 'OptionERecoveryBoundary').forEach(aclStep => {
    const isAllSubjects = aclStep.target === 'AllOptionESubjectScopes'
      || aclStep.target === 'AllOptionEPrivateRootsAndSubjectScopes';
    const targets = isAllSubjects ? bindings : bindings.filter(item => item.logicalTarget === aclStep.target);
    if (!isAllSubjects && targets.length !== 1) {
      errors.push(`Subject target ${aclStep.target} has no exact receipted binding.`);
      return;
    }
    targets.forEach(binding => {
      if (!GUID.test(binding.listId) || !GUID.test(binding.uniqueId) || !exactEtag(binding.eTag)
        || !binding.apiPath.startsWith('/_api/web/lists(guid\'') || binding.apiPath.indexOf('..') >= 0) {
        errors.push(`Subject target ${binding.logicalTarget} has an invalid ID, ETag or safe relative API path.`);
        return;
      }
      if (binding.hierarchyEpoch !== input.aclContext?.hierarchyEpoch || binding.aclEpoch !== input.aclContext?.aclEpoch) {
        errors.push(`Subject target ${binding.logicalTarget} has stale hierarchy/ACL epochs.`);
        return;
      }
      if (aclStep.operation === 'EnsureRoleAssignment' && !broken.has(binding.logicalTarget)) {
        const sequence = startSequence + steps.length;
        steps.push({
          sequence, state: 'STEP_APPLYING', scope: 'SubjectAcl', operation: 'BreakInheritanceNoCopy',
          target: binding.logicalTarget, mutatesTenant: true, eTag: binding.eTag,
          beforeSha256: binding.beforeSha256,
          expectedReadback: 'HasUniqueRoleAssignments=true|copyRoleAssignments=false|reviewed recovery remains exact',
          expectedReadbackData: { HasUniqueRoleAssignments: true },
          request: { method: 'POST', relativeUrl: `${binding.apiPath}/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)`,
            headers: { 'IF-MATCH': binding.eTag } },
          readbackRequest: { method: 'GET', relativeUrl: `${binding.apiPath}?$select=Id,UniqueId,HasUniqueRoleAssignments` }
        });
        broken.add(binding.logicalTarget);
      }
      const sequence = startSequence + steps.length;
      steps.push({
        sequence, state: aclStep.operation.indexOf('ReadBack') === 0 || aclStep.operation.indexOf('Assert') === 0
          ? 'STEP_READ_BACK' : 'STEP_APPLYING',
        scope: 'SubjectAcl', operation: aclStep.operation, target: binding.logicalTarget,
        mutatesTenant: aclStep.operation === 'EnsureRoleAssignment' || aclStep.operation === 'RemoveRoleAssignment',
        expectedReadback: `${aclStep.principal}|${aclStep.roleDefinitionId}|${aclStep.roleName}|${aclStep.roleTypeKind}|${aclStep.high}|${aclStep.low}`,
        expectedReadbackData: { assignment: { principal: aclStep.principal,
          roleDefinitionId: aclStep.roleDefinitionId, roleTypeKind: aclStep.roleTypeKind,
          high: aclStep.high, low: aclStep.low,
          absent: aclStep.operation === 'RemoveRoleAssignment' || aclStep.operation === 'AssertDenied' } },
        beforeSha256: binding.beforeSha256,
        principal: aclStep.principal,
        roleDefinitionId: aclStep.roleDefinitionId, roleName: aclStep.roleName,
        roleTypeKind: aclStep.roleTypeKind, high: aclStep.high, low: aclStep.low,
        ...subjectRequest(aclStep, binding)
      });
    });
  });
  return steps;
};

export const buildOptionETenantExecutionPlan = (
  input: IOptionETenantExecutionInput,
  inputSha256: string
): IOptionETenantExecutionPlan => {
  const errors: string[] = [];
  validateHashesAndTarget(input, errors);
  validateIdentities(input, errors);
  validateCapturePair(input, errors);
  if (!SHA256.test(inputSha256)) errors.push('Canonical execution-input hash is missing or invalid.');
  const rolePlan = planRoleDefinitions(input);
  errors.push(...rolePlan.errors);
  const resumeReasons: string[] = [];
  const steps: IOptionETenantExecutionStep[] = rolePlan.steps.slice();

  if (input.scope === 'RootSchemaAcl') {
    let provisioning;
    try {
      const projectReceiptedRoot = (item: IOptionEListReadback): IOptionEListReadback => isReceiptedNewList(input, item)
        ? { ...item, rootHasUniqueRoleAssignments: true } : item;
      provisioning = buildOptionEWorkplanProvisioningPlan(
        input.firstCapture.lists.map(projectReceiptedRoot),
        input.secondCapture.lists.map(projectReceiptedRoot)
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (provisioning) {
      provisioning.preflight.plannedMutations.forEach(mutation => {
        try {
          const sequence = steps.length + 1;
          steps.push({ sequence, state: 'STEP_APPLYING', scope: 'RootSchemaAcl',
            operation: mutation.operation, target: mutation.target, mutatesTenant: true,
            expectedReadback: mutation.expectedReadback,
            ...schemaMutationRequest(mutation, input.firstCapture) });
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      });
      if (rolePlan.requiresResume || provisioning.preflight.missingCreateableStores.length > 0) {
        resumeReasons.push('Fresh double capture and plan are required after add-only role/list/field creation receipts.');
      } else {
        steps.push(...planRootAssignments(input, rolePlan.resolved, steps.length + 1, errors));
      }
    }
  } else if (input.scope === 'SubjectAcl') {
    if (rolePlan.requiresResume) errors.push('SubjectAcl cannot proceed until every native role has a positive exact refetched ID.');
    else steps.push(...planSubjectAcl(input, steps.length + 1, errors));
  }

  if (input.mode === 'Readback') {
    // Report native schema gaps against unmodified captured state. Planned repairs are NOT proof
    // of native Save readiness, and Readback cannot grant approval or execute any write.
    const schemaEvidence = preflightOptionEWorkplanSchema(input.firstCapture.lists, input.secondCapture.lists);
    if (!isOptionEWorkplanNativeSaveSchemaConverged(schemaEvidence)) {
      const pending = schemaEvidence.plannedMutations.map(mutation => `${mutation.operation}:${mutation.target}`);
      const blockers = schemaEvidence.mismatches.concat(pending);
      resumeReasons.push(`Native Save schema NOT READY: ${blockers.length ? blockers.join('; ') : 'seven exact private stores have not been proven'}.`);
    }
  }
  const mutationCount = steps.filter(step => step.mutatesTenant).length;
  const wildcard = steps.some(step => step.eTag === '*' || step.request?.headers?.['IF-MATCH'] === '*');
  if (wildcard) errors.push('Wildcard ETag is prohibited.');
  if (steps.some(step => /prod|teams|appcatalog|tenantwide/i.test(step.request?.relativeUrl || ''))) {
    errors.push('A transport request escaped the exact TEST-site safe path.');
  }
  if (errors.length) throw new OptionETenantExecutionPlanError(errors);
  return {
    executorVersion: OPTION_E_EXECUTOR_VERSION,
    schemaVersion: OPTION_E_SCHEMA_CONTRACT_VERSION,
    bindingVersion: OPTION_E_BINDING_VERSION,
    runId: input.runId,
    mode: input.mode,
    scope: input.scope,
    inputSha256: inputSha256.toUpperCase(),
    target: input.target,
    states: ['CREATED', 'INPUTS_VERIFIED', 'AUTHENTICATED', 'BEFORE_CAPTURED_1', 'BEFORE_CAPTURED_2',
      'PLANNED', 'APPLY_AUTHORISED', 'STEP_APPLYING', 'STEP_READ_BACK', 'AFTER_CAPTURED',
      'ZERO_DELTA_CONFIRMED', 'COMPLETE'],
    requiresAuthorisation: input.mode === 'Apply' || input.mode === 'Rollback',
    executable: input.mode === 'Apply' && resumeReasons.length === 0,
    mutationCount,
    requiresBoundedResume: resumeReasons.length > 0,
    resumeReasons,
    steps,
    assertions: {
      storeCount: 7,
      fieldCount: 98,
      uniqueContractCount: 10,
      customRoleCount: 5,
      capturesEqual: true,
      principalsSeparated: true,
      noWildcardEtag: true
    }
  };
};

export const optionEExpectedRoleDefinition = (low: number): IOptionENativeRoleDefinition | undefined =>
  OPTION_E_NATIVE_ROLES.find(role => role.low === low);
