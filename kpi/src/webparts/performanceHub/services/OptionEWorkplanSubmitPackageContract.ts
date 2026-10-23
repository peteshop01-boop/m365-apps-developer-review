import {
  OPTION_E_ACL_CONNECTION_REFERENCE,
  OPTION_E_CONTENT_CONNECTION_REFERENCE
} from './OptionEWorkplanSubmitProcessor';

export const OPTION_E_SUBMIT_SOLUTION = Object.freeze({
  uniqueName: 'KCFKPIOptionESubmitV1', displayName: 'KCF KPI Option E Submit v1', version: '1.0.3.0',
  workflowUniqueName: 'KCFKPIOptionESubmitProcessorV1',
  workflowDisplayName: 'KCF KPI Option E Submit Processor v1',
  workflowId: 'c583eeae-ad13-4e91-ac90-88f908d7ebf4',
  publisher: 'KCFKPI', prefix: 'kcfkpi', packageName: 'KCFKPIOptionESubmitV1_1_0_3_0.zip',
  stateCode: 0, statusCode: 1
} as const);

export const OPTION_E_SUBMIT_CONNECTION_REFERENCES = Object.freeze({
  content: OPTION_E_CONTENT_CONNECTION_REFERENCE,
  acl: OPTION_E_ACL_CONNECTION_REFERENCE,
  connector: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline'
} as const);

export const OPTION_E_SUBMIT_CHECKPOINTS = Object.freeze([
  'Validated', 'ControlClaimed', 'SnapshotWritten', 'AuditWritten',
  'ControlPointed', 'AclVerified', 'Completed'
] as const);

export interface IOptionESubmitPackageFiles {
  definition: unknown;
  binding: unknown;
  manifest: unknown;
  solutionXml: string;
  workflowDataXml: string;
}

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;

interface IActionInventory {
  byName: Record<string, JsonObject>;
  parentByName: Record<string, string>;
  duplicateNames: string[];
}

const inventoryActions = (value: unknown): IActionInventory => {
  const byName: Record<string, JsonObject> = {};
  const parentByName: Record<string, string> = {};
  const duplicateNames: string[] = [];
  const visit = (candidate: unknown, parent = 'root'): void => {
    const actions = object(candidate);
    if (!actions) return;
    Object.entries(actions).forEach(([name, item]) => {
      const action = object(item);
      if (!action) return;
      if (byName[name]) duplicateNames.push(name);
      byName[name] = action; parentByName[name] = parent;
      visit(action.actions, name); visit(object(action.else)?.actions, name);
    });
  };
  visit(value);
  return { byName, parentByName, duplicateNames };
};

const actionText = (inventory: IActionInventory, name: string): string => JSON.stringify(
  inventory.byName[name] || {},
  (key, value: unknown) => ['metadata', 'comment', 'comments', 'description', 'trackedProperties']
    .indexOf(key) >= 0 ? undefined : value
);
const parameters = (inventory: IActionInventory, name: string): JsonObject =>
  object(object(inventory.byName[name]?.inputs)?.parameters) || {};
const uri = (inventory: IActionInventory, name: string): string =>
  String(parameters(inventory, name)['parameters/uri'] || '');
const method = (inventory: IActionInventory, name: string): string =>
  String(parameters(inventory, name)['parameters/method'] || '').toUpperCase();
const exactKeys = (value: unknown, expected: readonly string[]): boolean => {
  const candidate = object(value);
  return Boolean(candidate) && JSON.stringify(Object.keys(candidate || {}).sort()) === JSON.stringify([...expected].sort());
};
const includesEvery = (value: string, tokens: readonly string[]): boolean =>
  tokens.every(token => value.indexOf(token) >= 0);
const captureAll = (value: string, pattern: RegExp): string[] => {
  const result: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value)) !== null) result.push(match[1]);
  return result;
};

const hasLiteralDecision = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasLiteralDecision);
  const candidate = object(value);
  if (!candidate) return false;
  const equals = candidate.equals;
  if (Array.isArray(equals) && equals.length === 2
    && !String(equals[0]).startsWith('@') && !String(equals[1]).startsWith('@')
    && JSON.stringify(equals[0]) === JSON.stringify(equals[1])) return true;
  return Object.values(candidate).some(hasLiteralDecision);
};

const expectedListIds = [
  'KCFKPI_Audit', 'KCFKPI_People', 'KCFKPI_WorkplanDrafts', 'KCFKPI_WorkplanSubmitOperations',
  'KCFKPI_WorkplanSubmitRequests', 'KCFKPI_WorkplanSubmittedSnapshots', 'KCFKPI_Workplans'
] as const;
const expectedReferenceListIds = [
  'KCFKPI_AnnualTargets', 'KCFKPI_BehaviourFrameworkSets', 'KCFKPI_BehaviourFrameworkValues',
  'KCFKPI_BehaviourObjectiveLibrary', 'KCFKPI_KPIMaster', 'KCFKPI_PersonBehaviourAssignments'
] as const;
const prohibitedTokens = [
  'KCFKPI_ApprovedWorkplanReferences', 'KCFKPI_SubmitAclNegativePrincipals',
  'coreMethodId', 'coreRoleId', 'behaviourId', 'promptId'
] as const;
const requiredRepairActions = [
  'Read_Authoritative_Draft_A', 'Read_Authoritative_Draft_B',
  'Draft_Request_Bytes_And_Hash_Are_Exact',
  'Read_Current_Core_KPI_References', 'Read_Current_Core_Target_References',
  'Read_Current_Behaviour_Framework_Set', 'Read_Current_Behaviour_Framework_Values',
  'Read_Current_Person_Behaviour_Assignment', 'Read_Current_Behaviour_Prompts',
  'Protected_Assigned_Current_References_Are_Exact',
  'ACL_Apply_Complete_Assignment_Sets_Are_Exact',
  'Fresh_ACL_Complete_Assignment_Sets_Are_Exact'
] as const;
const pagedAclReadSpecs = [
  ['Read_Draft_Native_ACL_Assignments_After_Apply', 'Apply_Draft', 'DraftItemUri'],
  ['Read_Snapshot_Native_ACL_Assignments_After_Apply', 'Apply_Snapshot', 'SnapshotItemUri'],
  ['Read_Safe_Operation_Native_ACL_Assignments_After_Apply', 'Apply_Operation', 'OperationItemUri'],
  ['Read_Native_ACL_Assignments_After_Apply', 'Apply_Control', 'ProtectedControlItemUri'],
  ['Fresh_Read_Draft_Native_ACL_Assignments', 'Fresh_Draft', 'DraftItemUri'],
  ['Fresh_Read_Snapshot_Native_ACL_Assignments', 'Fresh_Snapshot', 'SnapshotItemUri'],
  ['Fresh_Read_Safe_Operation_Native_ACL_Assignments', 'Fresh_Operation', 'OperationItemUri'],
  ['Fresh_Read_Native_ACL_Assignments', 'Fresh_Control', 'ProtectedControlItemUri']
] as const;

export interface IOptionEAclExecutablePage {
  value?: readonly unknown[];
  '@odata.nextLink'?: unknown;
  'odata.nextLink'?: unknown;
  __next?: unknown;
}

export interface IOptionEAclExecutableTrace {
  accepted: boolean;
  reason: string;
  pageReads: number;
  followedContinuations: readonly string[];
  accumulatedValues: readonly unknown[];
  postPaginationProtectedWrites: number;
}

const canonicalAclContinuation = (
  siteUrl: string,
  collectionUri: string,
  value: string
): string | undefined => {
  const site = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
  const relativePrefixes = [
    `${collectionUri}?$skiptoken=`,
    `${collectionUri}?$expand=Member,RoleDefinitionBindings&$top=5000&$skiptoken=`
  ];
  const prefixes = [...relativePrefixes, ...relativePrefixes.map(prefix => `${site}${prefix}`)];
  const prefix = prefixes.find(candidate => value.startsWith(candidate));
  if (!prefix || value.trim() !== value || value.includes('#') || value.includes('\\')) return undefined;
  if ((value.match(/\$skiptoken=/g) || []).length !== 1 || /%2f|%5c|%25|%23|%3f/i.test(value)) return undefined;
  const token = value.slice(prefix.length);
  if (!/^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$/.test(token)) return undefined;
  return value.startsWith(site) ? value.slice(site.length) : value;
};

export const exerciseOptionEAclExecutablePagination = (
  siteUrl: string,
  collectionUri: string,
  pages: readonly IOptionEAclExecutablePage[]
): IOptionEAclExecutableTrace => {
  const followed: string[] = []; const accumulated: unknown[] = []; const seen = new Set<string>();
  const rejected = (reason: string, pageReads: number): IOptionEAclExecutableTrace => ({
    accepted: false, reason, pageReads, followedContinuations: followed,
    accumulatedValues: accumulated, postPaginationProtectedWrites: 0
  });
  for (let index = 0; index < pages.length; index += 1) {
    const pageReads = index + 1; const page = pages[index];
    if (pageReads > 100) return rejected('PageLimitNotExhausted', index);
    if (!Array.isArray(page.value)) return rejected('MalformedOrPartialPage', pageReads);
    accumulated.push(...page.value);
    if (Object.prototype.hasOwnProperty.call(page, 'odata.nextLink')
      || Object.prototype.hasOwnProperty.call(page, '__next')) return rejected('AmbiguousContinuation', pageReads);
    if (!Object.prototype.hasOwnProperty.call(page, '@odata.nextLink')) {
      return {
        accepted: true, reason: 'Complete', pageReads, followedContinuations: followed,
        accumulatedValues: accumulated, postPaginationProtectedWrites: 1
      };
    }
    if (typeof page['@odata.nextLink'] !== 'string' || page['@odata.nextLink'].length === 0) {
      return rejected('MalformedContinuation', pageReads);
    }
    const supplied = page['@odata.nextLink'];
    const continuation = canonicalAclContinuation(siteUrl, collectionUri, supplied);
    if (!continuation || seen.has(continuation)) return rejected('UnsafeContinuation', pageReads);
    seen.add(continuation); followed.push(continuation);
    if (index + 1 >= pages.length) return rejected('PartialContinuationChain', pageReads);
  }
  return rejected('NoCompletePage', pages.length);
};

export const validateOptionESubmitPackage = (files: IOptionESubmitPackageFiles): readonly string[] => {
  const errors: string[] = [];
  const definition = object(files.definition);
  const binding = object(files.binding);
  const manifest = object(files.manifest);
  const properties = object(definition?.properties);
  const workflow = object(properties?.definition);
  const inventory = inventoryActions(workflow?.actions);
  const text = JSON.stringify({ definition, binding });

  if (definition?.name !== OPTION_E_SUBMIT_SOLUTION.workflowUniqueName
    || definition?.workflowId !== OPTION_E_SUBMIT_SOLUTION.workflowId
    || properties?.state !== 'Off' || properties?.enabled !== false || properties?.activated !== false) {
    errors.push('WorkflowIdentityOrDisabledPostureInvalid');
  }
  const connectionRefs = object(properties?.connectionReferences);
  if (!exactKeys(connectionRefs, [OPTION_E_CONTENT_CONNECTION_REFERENCE, OPTION_E_ACL_CONNECTION_REFERENCE])
    || Object.values(connectionRefs || {}).some(value => {
      const reference = object(value);
      return reference?.apiId !== OPTION_E_SUBMIT_CONNECTION_REFERENCES.connector || reference.connectionId !== null;
    })) errors.push('ConnectionReferencesInvalidOrBound');

  const triggers = object(workflow?.triggers);
  const trigger = object(triggers && Object.values(triggers)[0]);
  if (!triggers || Object.keys(triggers).length !== 1
    || object(trigger?.runtimeConfiguration)?.concurrency === undefined
    || object(object(trigger?.runtimeConfiguration)?.concurrency)?.runs !== 1) {
    errors.push('TriggerConcurrencyInvalid');
  }
  if (inventory.duplicateNames.length) errors.push('DuplicateExecutableActionNames');
  requiredRepairActions.forEach(name => {
    if (!inventory.byName[name]) errors.push(`RepairActionMissing:${name}`);
  });

  if (!exactKeys(binding?.listIds, expectedListIds)
    || !exactKeys(binding?.referenceListIds, expectedReferenceListIds)) {
    errors.push('DefinitionBindingListNamespaceMismatch');
  }
  const nullNamespaces = [binding?.listIds, binding?.referenceListIds, binding?.principalIds, binding?.roleIds];
  if (binding?.enabled !== false || binding?.activated !== false || binding?.environmentId !== null
    || binding?.testSiteUrl !== null || binding?.contentConnectionId !== null || binding?.aclConnectionId !== null
    || nullNamespaces.some(value => Object.values(object(value) || {}).some(item => item !== null))) {
    errors.push('BindingNotFailClosed');
  }
  const listRefs = captureAll(text, /parameters\('listIds'\)\?\['([^']+)'\]/g);
  const referenceRefs = captureAll(text, /parameters\('referenceListIds'\)\?\['([^']+)'\]/g);
  if (listRefs.some(name => expectedListIds.indexOf(name as typeof expectedListIds[number]) < 0)
    || referenceRefs.some(name => expectedReferenceListIds.indexOf(name as typeof expectedReferenceListIds[number]) < 0)
    || expectedListIds.some(name => listRefs.indexOf(name) < 0)
    || expectedReferenceListIds.some(name => referenceRefs.indexOf(name) < 0)) {
    errors.push('ExecutableBindingClosureInvalid');
  }
  prohibitedTokens.forEach(token => { if (text.indexOf(token) >= 0) errors.push(`ProhibitedExecutableToken:${token}`); });

  const parseText = actionText(inventory, 'Parse_Immutable_Request_Payload');
  if (!includesEvery(parseText, [
    'kcf.workplan-draft/v1', 'core', 'kpiId', 'kpiVersionKey', 'targetVersionKey',
    'Owner', 'Delivery', 'Support', 'AdditiveDirect', 'CompletionOversight',
    'behaviours', 'KCCC-BEHAVIOUR|v02', 'descriptorKey', 'guidancePromptKeys',
    'selectedPromptKeys', 'additionalProperties'
  ])) errors.push('SavedDraftExecutableSchemaIncomplete');
  const packagedGuard = inventory.byName.Packaged_Payload_Semantics_Are_Valid;
  if (packagedGuard?.type !== 'If' || hasLiteralDecision(packagedGuard.expression)
    || !includesEvery(actionText(inventory, 'Packaged_Payload_Semantics_Are_Valid'), [
      'Compose_Canonical_Payload_JSON', 'Compose_Payload_UTF8_Byte_Length', '56000',
      'Select_Item_IDs', 'Select_Behaviour_IDs', '10000', 'Filter_Invalid_Behaviour_Value_Order'
    ])) errors.push('SavedDraftSemanticGuardInvalid');

  const draftGuard = inventory.byName.Draft_Request_Bytes_And_Hash_Are_Exact;
  if (draftGuard?.type !== 'If' || hasLiteralDecision(draftGuard.expression)
    || !includesEvery(actionText(inventory, 'Draft_Request_Bytes_And_Hash_Are_Exact'), [
      'Read_Request_A', 'Read_Request_B', 'Read_Authoritative_Draft_A', 'Read_Authoritative_Draft_B',
      'DraftItemID', 'DraftETag', 'DraftVersion', 'DraftSchemaVersion',
      'DraftPayloadJSON', 'DraftPayloadSHA256', 'sha256', 'Read_Protected_Workplan_Control'
    ])) errors.push('DraftRequestProvenanceGuardInvalid');
  const referenceGuard = inventory.byName.Protected_Assigned_Current_References_Are_Exact;
  if (referenceGuard?.type !== 'If' || hasLiteralDecision(referenceGuard.expression)
    || !includesEvery(actionText(inventory, 'Protected_Assigned_Current_References_Are_Exact'), [
      'Read_Current_Core_KPI_References_B', 'Read_Current_Core_Target_References_B',
      'Read_Current_Behaviour_Framework_Set_B', 'Read_Current_Behaviour_Framework_Values_B',
      'Read_Current_Person_Behaviour_Assignment_B', 'Read_Current_Behaviour_Prompts_B',
      'Select_Submitted_Core_KPI_Keys', 'Select_Current_Core_KPI_Keys',
      'Select_Submitted_Core_Target_Keys', 'Select_Current_Core_Target_Keys',
      'CatalogueVersion', 'sha256', 'SubmittedPromptCoordinates',
      'Select_Authoritative_Behaviour_Prompt_Coordinates'
    ])) errors.push('ProtectedCurrentReferenceGuardInvalid');
  if (object(referenceGuard?.runAfter)?.Draft_Request_Bytes_And_Hash_Are_Exact === undefined
    || object(inventory.byName.Pre_Operation_Authority_Proof?.runAfter)?.Protected_Assigned_Current_References_Are_Exact === undefined
    || inventory.parentByName.Create_Unique_Operation !== 'Protected_Control_Is_Fresh_Before_Create') {
    errors.push('PreOperationAuthorityOrderInvalid');
  }

  pagedAclReadSpecs.forEach(([name, tag, target]) => {
    const output = inventory.byName[name];
    const outputInputs = object(output?.inputs);
    const collection = inventory.byName[`Set_${tag}_ACL_Collection`];
    const collectionInputs = object(collection?.inputs);
    const enumerate = inventory.byName[`Enumerate_${tag}_ACL_Pages`];
    const limit = object(enumerate?.limit);
    const pageReadName = `GET_${tag}_ACL_Page`;
    const pageRead = inventory.byName[pageReadName];
    const pagination = object(object(pageRead?.runtimeConfiguration)?.paginationPolicy);
    const validateName = `Validate_${tag}_ACL_Page`;
    const validate = inventory.byName[validateName];
    const validateText = actionText(inventory, validateName);
    const record = inventory.byName[`Record_${tag}_ACL_Continuation`];
    const recordInputs = object(record?.inputs);
    const setNext = inventory.byName[`Set_${tag}_ACL_Next_Page`];
    const setNextInputs = object(setNext?.inputs);
    const recordValue = String(recordInputs?.value || '');
    const setNextValue = String(setNextInputs?.value || '');
    const canonicalValue = recordValue.startsWith('@') ? recordValue.slice(1) : '';
    const reject = inventory.byName[`Reject_${tag}_Unsafe_ACL_Page`];
    const rejectError = object(object(reject?.inputs)?.runError);
    if (output?.type !== 'Compose'
      || !includesEvery(JSON.stringify(outputInputs || {}), [
        'AclPageValues', 'AclContinuationUri', 'AclPageCount', 'AclSeenContinuations', 'AclExpectedCollectionUri'
      ])
      || collection?.type !== 'SetVariable' || collectionInputs?.name !== 'AclExpectedCollectionUri'
      || !includesEvery(String(collectionInputs?.value || ''), [target, '/RoleAssignments'])
      || enumerate?.type !== 'Until' || limit?.count !== 100 || limit?.timeout !== 'PT5M'
      || !includesEvery(JSON.stringify(enumerate.expression || {}), ['AclContinuationUri', 'equals'])
      || method(inventory, pageReadName) !== 'GET' || uri(inventory, pageReadName) !== "@variables('AclContinuationUri')"
      || pagination !== undefined || validate?.type !== 'If' || hasLiteralDecision(validate.expression)
      || record?.type !== 'AppendToArrayVariable' || recordInputs?.name !== 'AclSeenContinuations'
      || setNext?.type !== 'SetVariable' || setNextInputs?.name !== 'AclContinuationUri'
      || recordValue !== setNextValue
      || !includesEvery(recordValue, ['@if(', 'AclCanonicalSiteUrl', 'substring(', '@odata.nextLink'])
      || !canonicalValue || !validateText.includes(`contains(variables('AclSeenContinuations'),${canonicalValue})`)
      || reject?.type !== 'Terminate' || rejectError?.code !== 'UnsafeAclContinuation') {
      errors.push(`AclExplicitPaginationInvalid:${name}`);
    }
    if (!includesEvery(validateText, [
      '@odata.nextLink', 'odata.nextLink', '__next', '$skiptoken=', 'AclCanonicalSiteUrl',
      'AclExpectedCollectionUri', 'AclSeenContinuations', 'match', '%2f', '%5c', '%25', '%23', '%3f'
    ])) errors.push(`AclContinuationGuardInvalid:${name}`);
  });
  [
    'ACL_Apply_Complete_Assignment_Sets_Are_Exact',
    'Fresh_ACL_Complete_Assignment_Sets_Are_Exact'
  ].forEach(name => {
    const action = inventory.byName[name];
    if (action?.type !== 'If' || hasLiteralDecision(action.expression)
      || !includesEvery(actionText(inventory, name), [
        'Complete_Assignment_Tuples', 'Expected_', 'Filter_Invalid_',
        '@odata.nextLink', 'canonicalCollectionUri', 'continuationUris', 'pageCount', 'totalCount',
        'union', 'sort', 'HierarchyEpoch', 'AclEpoch'
      ])) errors.push(`CompleteAclAssignmentGuardInvalid:${name}`);
  });
  if (inventory.parentByName.Advance_AclVerified !== 'ACL_Apply_Complete_Assignment_Sets_Are_Exact'
    || inventory.parentByName.CAS_Control_To_Submitted_Ready !== 'Completion_Prior_State_And_Ownership_Are_Exact') {
    errors.push('AclPaginationProtectedWriteOrderInvalid');
  }
  ['Select_Draft_Complete_Assignment_Tuples', 'Fresh_Select_Draft_Complete_Assignment_Tuples']
    .forEach(name => {
      if (!includesEvery(actionText(inventory, name), [
        'PrincipalId', 'PrincipalType', 'RoleDefinitionBindings', 'RoleTypeKind', 'BasePermissions', 'High', 'Low'
      ])) errors.push(`AclTupleProjectionInvalid:${name}`);
    });
  const expectedSetRules: Readonly<Record<string, readonly string[]>> = {
    Expected_Draft_Complete_Assignment_Tuples: [
      'contentProcessor', 'mutatorNoDelete', 'KCF KPI Option E Mutator No Delete v1',
      'aclReconciler', 'KCF KPI Option E ACL Reconciler v1', 'recoveryAdmin', 'fullControl', 'Full Control',
      'Read_Actor_From_Native_Created_By', 'itemReader', '|0|0|7', '|5|2147483647|4294967295'
    ],
    Expected_Snapshot_Complete_Assignment_Tuples: [
      'contentProcessor', 'addReadNoEdit', 'KCF KPI Option E Add Read No Edit v1',
      'aclReconciler', 'recoveryAdmin', 'fullControl', 'Read_Actor_From_Native_Created_By',
      'Read_Current_Manager_From_People', 'itemReader', '|0|0|3', '|5|2147483647|4294967295'
    ],
    Expected_Operation_Complete_Assignment_Tuples: [
      'contentProcessor', 'mutatorNoDelete', 'aclReconciler', 'recoveryAdmin', 'fullControl',
      'Read_Actor_From_Native_Created_By', 'Read_Current_Manager_From_People', 'itemReader', '|0|0|7'
    ],
    Expected_Control_Complete_Assignment_Tuples: [
      'contentProcessor', 'draftEditor', 'KCF KPI Option E Draft Editor v1',
      'aclReconciler', 'recoveryAdmin', 'fullControl', 'Read_Actor_From_Native_Created_By',
      'Read_Current_Manager_From_People', 'itemReader', '|0|0|5'
    ]
  };
  Object.entries(expectedSetRules).forEach(([name, tokens]) => {
    if (!includesEvery(actionText(inventory, name), tokens)) errors.push(`ExpectedAclSetInvalid:${name}`);
    const fresh = `Fresh_${name}`;
    if (!includesEvery(actionText(inventory, fresh), tokens)) errors.push(`ExpectedAclSetInvalid:${fresh}`);
  });
  if (!includesEvery(actionText(inventory, 'Filter_Current_Behaviour_Prompts_For_Submitted'), [
    'BehaviourKey', 'BehaviourObjectiveKey', 'RoleLevelCode', 'IC_OFFICER', 'PEOPLE_MANAGER', 'L1', 'L2', 'L3'
  ])) errors.push('BehaviourPromptTierBindingInvalid');

  const exactGrantRules: Readonly<Record<string, readonly string[]>> = {
    Grant_Content_Processor_Draft_Mutator: ['DraftItemUri', 'principalIds', 'contentProcessor', 'mutatorNoDelete'],
    Grant_Acl_Reconciler_Draft: ['DraftItemUri', 'principalIds', 'aclReconciler', 'roleIds'],
    Grant_Recovery_Draft_Full_Control: ['DraftItemUri', 'recoveryAdmin', 'fullControl'],
    Grant_Employee_Draft_Read: ['DraftItemUri', 'Read_Actor_From_Native_Created_By', 'itemReader'],
    Grant_Manager_Snapshot_Read: ['SnapshotItemUri', 'Read_Current_Manager_From_People', 'itemReader'],
    Grant_Content_Processor_Operation_Mutator: ['OperationItemUri', 'contentProcessor', 'mutatorNoDelete'],
    Grant_Content_Processor_Control_Editor: ['ProtectedControlItemUri', 'contentProcessor', 'draftEditor']
  };
  Object.entries(exactGrantRules).forEach(([name, tokens]) => {
    if (method(inventory, name) !== 'POST' || !includesEvery(uri(inventory, name), tokens)) {
      errors.push(`AclGrantTargetOrRoleInvalid:${name}`);
    }
  });

  const requiredCas: Readonly<Record<string, readonly string[]>> = {
    CAS_Control_Claim: ['ProtectedControlItemUri', 'Submitting', 'PendingRequestKey'],
    CAS_Control_To_Submitted_AclPending: ['ProtectedControlItemUri', 'Submitted', 'AclPending'],
    CAS_Control_To_Submitted_Ready: ['ProtectedControlItemUri', 'Submitted', 'Ready', 'AclEpoch'],
    Patch_Terminal_Operation: ['OperationItemUri', 'Outcome', 'FailureCode']
  };
  Object.entries(requiredCas).forEach(([name, tokens]) => {
    if (method(inventory, name) !== 'PATCH' || !includesEvery(actionText(inventory, name), tokens)
      || !actionText(inventory, name).includes('If-Match')) errors.push(`StateCasInvalid:${name}`);
  });
  const snapshotBody = object(parameters(inventory, 'Create_Immutable_Snapshot_From_Request_A')['parameters/body']);
  if (!includesEvery(actionText(inventory, 'Create_Immutable_Snapshot_From_Request_A'), [
    'Read_Request_A', 'PayloadJSON', 'PayloadSHA256', 'SourceDraftItemID', 'SourceDraftETag', 'SourceDraftVersion'
  ]) || snapshotBody?.PayloadJSON !== "@body('Read_Request_A')?['PayloadJSON']"
    || snapshotBody?.PayloadSHA256 !== "@body('Read_Request_A')?['PayloadSHA256']"
    || snapshotBody?.SourceDraftItemID !== "@body('Read_Request_A')?['DraftItemID']"
    || snapshotBody?.SourceDraftETag !== "@body('Read_Request_A')?['DraftETag']"
    || snapshotBody?.SourceDraftVersion !== "@body('Read_Request_A')?['DraftVersion']") {
    errors.push('SnapshotNotSourcedFromRequestA');
  }

  const initialised = new Set<string>();
  Object.values(inventory.byName).forEach(action => {
    if (action.type === 'InitializeVariable') {
      const variables = object(action.inputs)?.variables;
      if (Array.isArray(variables)) variables.forEach(item => {
        const variable = object(item); if (typeof variable?.name === 'string') initialised.add(variable.name);
      });
    }
  });
  const referenced = new Set<string>(); const variablePattern = /variables\('([^']+)'\)/g;
  let variableMatch: RegExpExecArray | null;
  while ((variableMatch = variablePattern.exec(JSON.stringify(workflow))) !== null) referenced.add(variableMatch[1]);
  referenced.forEach(name => { if (!initialised.has(name)) errors.push(`VariableNotInitialised:${name}`); });

  Object.entries(inventory.byName).forEach(([name, action]) => {
    if (action.type !== 'OpenApiConnection' || object(action.inputs)?.host === undefined) return;
    if (object(action.inputs)?.retryPolicy !== undefined && object(object(action.inputs)?.retryPolicy)?.type !== 'none') {
      errors.push(`WriteRetryPolicyInvalid:${name}`);
    }
    if (method(inventory, name) === 'PUT' || method(inventory, name) === 'DELETE') errors.push(`ForbiddenHttpMethod:${name}`);
  });
  if (inventory.byName.Catch_And_Durably_Commit_RecoveryHold === undefined
    || !includesEvery(JSON.stringify(inventory.byName.Catch_And_Durably_Commit_RecoveryHold?.runAfter || {}), [
      'Failed', 'TimedOut'
    ])) errors.push('CatchRecoveryRunAfterInvalid');

  if (manifest?.solutionUniqueName !== OPTION_E_SUBMIT_SOLUTION.uniqueName
    || manifest?.workflowId !== OPTION_E_SUBMIT_SOLUTION.workflowId
    || manifest?.version !== OPTION_E_SUBMIT_SOLUTION.version
    || manifest?.submitContractVersion !== 'kcf.kpi.option-e.submit.v3'
    || manifest?.disabled !== true || manifest?.unbound !== true
    || manifest?.triggerConcurrency !== 1 || manifest?.writeRetryPolicy !== 'none') {
    errors.push('ManifestIdentityOrPostureInvalid');
  }
  if (!files.solutionXml.includes(`<UniqueName>${OPTION_E_SUBMIT_SOLUTION.uniqueName}</UniqueName>`)
    || !files.solutionXml.includes(`<Version>${OPTION_E_SUBMIT_SOLUTION.version}</Version>`)
    || !files.workflowDataXml.includes(OPTION_E_SUBMIT_SOLUTION.workflowId)
    || !files.workflowDataXml.includes('<StateCode>0</StateCode>')) errors.push('SolutionOrWorkflowXmlIdentityInvalid');
  if (/(?:client_secret|access_token|refresh_token|password)\s*["':=]+\s*(?!null)/i.test(text)) {
    errors.push('SecretMaterialDetected');
  }
  if (/https:\/\/(?!schema\.management\.azure\.com\b)[^"\s]+/i.test(text)) errors.push('BoundAbsoluteUrlDetected');
  return errors;
};
