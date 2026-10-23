import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';

const processorRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const c2aPath = join(processorRoot, 'Definitions', 'C2a.disabled.definition.json');
const c2bPath = join(processorRoot, 'Definitions', 'C2b.disabled.definition.json');
const workflowPath = join(processorRoot, 'C2bPackage', 'Workflows', 'KCFKPIEmployeeC2bDisabled-32b971df-fde0-460d-a9a7-5967e21d0711.json');
const unboundPath = join(processorRoot, 'Configuration', 'C2b.unbound.configuration.json');
const sharePointContractPath = join(processorRoot, 'Configuration', 'C2b.sharepoint.schema.json');
const mode = process.argv[2] || '--check';
const blockedIdentity = /samplefoundation|new_sharedsharepointonline|3e05ec37-95ce-4a30-a56c-ff2437bf9bed|47210791-25f1-416e-ab24-832c8b6448ec|98f2a280-46a7-40b5-a37d-db97b02fc826/i;
const hash = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const serialise = value => `${JSON.stringify(value, null, 2)}\n`;
const settledAnnualCommands = [
  'CreateWorkplanDraft', 'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2', 'UpsertPersonalItemV2',
  'UpsertBehaviourCommitmentV2', 'SetCoreWeightingV2', 'SubmitWorkplan', 'RequestWorkplanChanges', 'ApproveAndLockWorkplan',
  'CreateWorkplanAmendmentV2'
];
const nativeAdapterOperations = [
  'SourceDoubleRead', 'JournalAndEffectCAS', 'WorkplanCRUD', 'WorkplanItemCRUD',
  'AuthoritativeControlCaseConsume', 'BehaviourCatalogueStableRead', 'EmployeeContainerACL', 'AuditAppend', 'ReceiptCreateAndActorRead',
  'CompletePaging', 'ETagCAS', 'TimeoutUnknown', 'ExactRecoveryReadback',
  'JournalReadCreateCasUpdate', 'EffectReadCreateCasUpdate', 'LeaseEpochOwnership', 'PartialEffectRecovery'
];
const canonicalSiteUrlPattern = '^https://[a-z0-9.-]+(?::[0-9]+)?(?:/[^\\s?#]*[^/\\s?#])?$';
const canonicalGuidPattern = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const connectorDataset = "@body('C2B_Context')?['site']";

const build = async () => {
  const c2aText = await readFile(c2aPath, 'utf8');
  const unbound = JSON.parse(await readFile(unboundPath, 'utf8'));
  const sharePointContractText = await readFile(sharePointContractPath, 'utf8');
  const sharePointContract = JSON.parse(sharePointContractText);
  const c2b = JSON.parse(c2aText);
  const definition = c2b.properties.definition;
  c2b.properties.connectionReferences = {};
  definition.contentVersion = '0.0.4.0';
  definition.triggers = {};
  definition.parameters.$connections.defaultValue = {};

  const contextSchema = definition.actions.Canonical_Process.actions.C2B_Context.inputs.schema;
  Object.assign(contextSchema.properties, {
    compositionReady: { enum: [true] },
    schemaRevision: { enum: ['c2b-annual-v2'] },
    connectionReference: { type: 'string', minLength: 1, maxLength: 255 },
    configuredSite: { type: 'string', minLength: 1, maxLength: 255, pattern: canonicalSiteUrlPattern },
    observedSiteUrl: { type: 'string', minLength: 1, maxLength: 255, pattern: canonicalSiteUrlPattern },
    configuredSiteCollectionId: { type: 'string', pattern: canonicalGuidPattern },
    observedSiteCollectionId: { type: 'string', pattern: canonicalGuidPattern },
    configuredWebId: { type: 'string', pattern: canonicalGuidPattern },
    observedWebId: { type: 'string', pattern: canonicalGuidPattern },
    configuredCommandList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    configuredManagerCommandList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    commandRoute: { enum: ['Employee', 'Manager'] },
    configuredHeaderList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    configuredItemList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    peopleList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    journalList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    effectList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    receiptList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' },
    auditList: { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' }
  });
  contextSchema.required.push('compositionReady', 'schemaRevision', 'connectionReference', 'configuredSite',
    'observedSiteUrl', 'configuredSiteCollectionId', 'observedSiteCollectionId', 'configuredWebId', 'observedWebId',
    'configuredCommandList', 'configuredManagerCommandList', 'commandRoute', 'configuredHeaderList', 'configuredItemList', 'peopleList', 'journalList',
    'effectList', 'receiptList', 'auditList');
  definition.actions.Canonical_Process.actions.Immutable_Binding.expression =
    "@and(equals(body('C2B_Context')?['compositionReady'],true),equals(body('C2B_Context')?['schemaRevision'],'c2b-annual-v2'),equals(body('C2B_Context')?['site'],body('C2B_Context')?['configuredSite']),equals(body('C2B_Context')?['site'],body('C2B_Context')?['observedSiteUrl']),equals(body('C2B_Context')?['configuredSiteCollectionId'],body('C2B_Context')?['observedSiteCollectionId']),equals(body('C2B_Context')?['configuredWebId'],body('C2B_Context')?['observedWebId']),not(equals(body('C2B_Context')?['configuredSiteCollectionId'],body('C2B_Context')?['configuredWebId'])),or(and(equals(body('C2B_Context')?['commandRoute'],'Employee'),equals(body('C2B_Context')?['commandList'],body('C2B_Context')?['configuredCommandList'])),and(equals(body('C2B_Context')?['commandRoute'],'Manager'),equals(body('C2B_Context')?['commandList'],body('C2B_Context')?['configuredManagerCommandList']))),equals(body('C2B_Context')?['headerList'],body('C2B_Context')?['configuredHeaderList']),equals(body('C2B_Context')?['itemList'],body('C2B_Context')?['configuredItemList']))";

  const canonical = definition.actions.Canonical_Process.actions;
  // C2b owns this exact v2 wire boundary: the outer numeric token is always null and the
  // only outer ETag is a checked mirror of the payload's authoritative header ETag.
  const annualOuterBindingExpression = "@and(equals(body('Validate_Source')?['outer']?['CommandKey'],body('Parse_Admission')?['binding']?['commandKey']),equals(body('Validate_Source')?['outer']?['CommandType'],body('Parse_Admission')?['binding']?['commandType']),equals(body('Validate_Source')?['outer']?['SubjectType'],body('Parse_Admission')?['binding']?['subjectType']),equals(body('Validate_Source')?['outer']?['SubjectKey'],body('Parse_Admission')?['binding']?['subjectKey']),equals(body('Validate_Source')?['outer']?['PersonKey'],body('Parse_Admission')?['binding']?['personKey']),equals(body('Validate_Source')?['outer']?['PerformanceYear'],body('Parse_Admission')?['binding']?['performanceYear']),equals(body('Validate_Source')?['outer']?['ExpectedRowVersionToken'],null),equals(body('Validate_Source')?['outer']?['Quarter'],null),equals(body('Validate_Source')?['outer']?['ClientCorrelationKey'],body('Parse_Admission')?['binding']?['commandKey']),equals(body('Validate_Source')?['outer']?['ExpectedETag'],body('Parse_Admission')?['expected']?['header']?['etag']))";
  canonical.Outer_Binding.expression = annualOuterBindingExpression;
  canonical.Parse_Admission.inputs.schema.properties.binding.properties.commandType.enum = settledAnnualCommands;
  canonical.Admission_Command = {
    type: 'If',
    expression: `@contains(createArray(${settledAnnualCommands.map(value => `'${value}'`).join(',')}),body('Parse_Admission')?['binding']?['commandType'])`,
    actions: {},
    else: { actions: { Admission_Settled_Route_Reject: { type: 'ParseJson', inputs: {
      content: null, schema: { type: 'object' }
    }, runAfter: {} } } },
    runAfter: canonical.Admission_Command.runAfter
  };

  definition.actions.Canonical_Process.actions.C2B_Settled_Annual_Route_Contract = {
    type: 'Compose',
    inputs: {
      contractVersion: 'kcf.kpi.c2b.native-adapter.v2',
      implementedRoutes: unbound.annualRoutes,
      deferredRoutes: unbound.deferredRoutes,
      requiredNativeAdapterOperations: nativeAdapterOperations,
      terminalSuccessOutcomes: ['Accepted', 'Duplicate'],
      nonSuccessOutcomes: ['Queued', 'Held', 'Rejected', 'Failed', 'Unknown'],
      requireStableCanonicalAuditReceiptProof: true
    },
    runAfter: { Admission_Evidence: ['Succeeded'] }
  };
  definition.actions.Canonical_Process.actions.C2B_Annual_Route_Select = {
    type: 'Switch',
    expression: "@body('Parse_Admission')?['binding']?['commandType']",
    cases: Object.fromEntries(unbound.annualRoutes.map(route => [`Route_${route.commandType}`, {
      case: route.commandType,
      actions: { Selected_Route_Contract: { type: 'Compose', inputs: {
        ...route,
        plannerContract: 'kcf.kpi.c2b.foundation.v2',
        nativeAdapterContractVersion: 'kcf.kpi.c2b.native-adapter.v2'
      }, runAfter: {} } }
    }])),
    default: { actions: { Unknown_Or_Deferred_Route_Reject: { type: 'ParseJson', inputs: {
      content: null, schema: { type: 'object' }
    }, runAfter: {} } } },
    runAfter: { C2B_Settled_Annual_Route_Contract: ['Succeeded'] }
  };
  definition.actions.Canonical_Process.actions.C2B_Native_Annual_Plan = {
    type: 'ParseJson',
    inputs: { content: null, schema: {
      type: 'object',
      properties: {
        commandKey: { type: 'string' }, commandType: { enum: settledAnnualCommands },
        planSha256: { type: 'string', pattern: '^[0-9A-Fa-f]{64}$' },
        payloadSha256: { type: 'string', pattern: '^[0-9A-Fa-f]{64}$' },
        intendedImageSha256: { type: 'string', pattern: '^[0-9A-Fa-f]{64}$' },
        effects: { type: 'array', minItems: 8 }
      },
      required: ['commandKey', 'commandType', 'planSha256', 'payloadSha256', 'intendedImageSha256', 'effects'],
      additionalProperties: false
    } },
    runAfter: { C2B_Annual_Route_Select: ['Succeeded'] }
  };
  definition.actions.Canonical_Process.actions.Dispatch.runAfter = {
    C2B_Native_Annual_Plan: ['Succeeded']
  };

  definition.actions.C2B_Local_Composition_Contract = {
    type: 'Compose',
    inputs: unbound,
    runAfter: {}
  };
  definition.actions.C2B_SharePoint_Physical_Contract = {
    type: 'Compose',
    inputs: {
      contractVersion: sharePointContract.contractVersion,
      schemaRevision: sharePointContract.schemaRevision,
      provisioningMode: unbound.provisioningMode,
      journalListTitle: sharePointContract.lists.find(value => value.purpose === 'CommandJournal')?.title,
      effectListTitle: sharePointContract.lists.find(value => value.purpose === 'CommandEffects')?.title,
      contractSha256: hash(sharePointContractText),
      runtimeIdentityEvidenceRequired: true,
      principalAndRoleBindingsRequired: true,
      networkExecutionPermitted: false
    },
    runAfter: {}
  };
  definition.actions.Initialise_Internal.runAfter = {
    C2B_Local_Composition_Contract: ['Succeeded'],
    C2B_SharePoint_Physical_Contract: ['Succeeded']
  };
  definition.actions.C2B_Absent_Stop.inputs.runError = {
    code: 'C2B_DISABLED_UNBOUND',
    message: 'C2b bindings, capabilities, journal/effects storage and connection reference are absent or disabled. No processing allowed.'
  };
  const c2bText = serialise(c2b);
  if (blockedIdentity.test(c2bText)) throw new Error('Generated C2b definition contains a tenant/list/connection identity.');
  if (Object.keys(c2b.properties.connectionReferences).length || Object.keys(definition.triggers).length)
    throw new Error('Generated C2b definition must remain unbound and triggerless.');
  if (!definition.actions.Canonical_Process.actions.Source_A || !definition.actions.Canonical_Process.actions.Source_B
    || !definition.actions.Canonical_Process.actions.Source_Observations_Match)
    throw new Error('Generated C2b definition did not preserve C2a double-read admission.');
  const datasets = [];
  const collectDatasets = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'dataset') datasets.push(child);
      collectDatasets(child);
    }
  };
  collectDatasets(definition.actions.Canonical_Process.actions);
  if (!datasets.length || datasets.some(value => value !== connectorDataset))
    throw new Error('Generated C2b SharePoint connector dataset is not immutably bound to the canonical site URL.');
  if (sharePointContract.contractVersion !== 'kcf.kpi.c2b.sharepoint.v1'
    || sharePointContract.schemaRevision !== 'c2b-annual-v2'
    || unbound.provisioningMode !== 'Disabled' || unbound.principalAndRoleBindings !== null
    || unbound.siteUrl !== null || unbound.siteCollectionId !== null || unbound.webId !== null
    || sharePointContract.lists.length !== 2
    || sharePointContract.lists.some(value => value.permissionCapability !== 'PrivateProcessorOnly')
    || definition.actions.C2B_SharePoint_Physical_Contract.inputs.networkExecutionPermitted !== false)
    throw new Error('Generated C2b SharePoint physical contract is incomplete or not disabled.');
  if (JSON.stringify(definition.actions.Canonical_Process.runAfter) !== JSON.stringify({ C2B_Absent_Stop: ['Succeeded'] }))
    throw new Error('Generated C2b canonical process can bypass the disabled stop.');
  const routes = definition.actions.Canonical_Process.actions.C2B_Settled_Annual_Route_Contract.inputs;
  const routeSwitch = definition.actions.Canonical_Process.actions.C2B_Annual_Route_Select;
  if (routes.contractVersion !== 'kcf.kpi.c2b.native-adapter.v2'
    || JSON.stringify(routes.implementedRoutes.map(route => route.commandType)) !== JSON.stringify(settledAnnualCommands)
    || routes.implementedRoutes.some(route => !['Employee', 'Manager'].includes(route.route)
      || !['Workplan', 'WorkplanItem'].includes(route.subjectType))
    || routes.deferredRoutes.length !== 0
    || nativeAdapterOperations.some(operation => !routes.requiredNativeAdapterOperations.includes(operation))
    || Object.keys(routeSwitch.cases).length !== settledAnnualCommands.length
    || settledAnnualCommands.some(command => routeSwitch.cases[`Route_${command}`]?.case !== command)
    || definition.actions.Canonical_Process.actions.C2B_Native_Annual_Plan.inputs.content !== null
    || canonical.Outer_Binding.expression !== annualOuterBindingExpression
    || JSON.stringify(definition.actions.Canonical_Process.actions.Dispatch.runAfter)
      !== JSON.stringify({ C2B_Native_Annual_Plan: ['Succeeded'] })) {
    throw new Error('Generated C2b annual route/native-adapter composition is incomplete.');
  }
  const packaged = { ...c2b, schemaVersion: '1.0.0.0' };
  return { c2aText, c2bText, workflowText: serialise(packaged), sharePointContractText };
};

const result = await build();
if (mode === '--write') {
  await writeFile(c2bPath, result.c2bText, 'utf8');
  await writeFile(workflowPath, result.workflowText, 'utf8');
} else if (mode === '--check') {
  const [actualC2b, actualWorkflow] = await Promise.all([readFile(c2bPath, 'utf8'), readFile(workflowPath, 'utf8')]);
  if (actualC2b !== result.c2bText || actualWorkflow !== result.workflowText)
    throw new Error('Generated C2b definition/package parity failed. Run --write only in the authorised worktree.');
} else {
  throw new Error('Usage: build-c2b-disabled.mjs --write|--check');
}

process.stdout.write(JSON.stringify({
  mode,
  sourceC2aSha256: hash(result.c2aText),
  c2bDefinitionSha256: hash(result.c2bText),
  packagedWorkflowSha256: hash(result.workflowText),
  sharePointPhysicalContractSha256: hash(result.sharePointContractText),
  disabled: true,
  triggerCount: 0,
  connectionReferenceCount: 0,
  c2aDoubleReadPreserved: true,
  settledAnnualRouteCount: settledAnnualCommands.length,
  deferredBehaviourRouteCount: 0,
  nativeAdapterOperationCount: nativeAdapterOperations.length,
  provisioningMode: 'Disabled',
  networkExecutionPermitted: false
}, null, 2));
