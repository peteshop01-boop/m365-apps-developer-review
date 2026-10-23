export const TENANT_LAYER_CONTRACT_VERSION = 'kcf.kpi.wib12.tenant-layer.v1';
export const TENANT_LAYER_SCHEMA_REVISION = 'kcf-behaviour-v2-tenant-1';
export const TARGET_EVIDENCE_SHA256 = '2BED23BF19E22C6FB3288036CB5426217574F056D7CF649C4AD43EC8E8B64825';
export const ISOLATION_AUTHORITY = 'KCF-KPI-Sponsor-M013';
export const RECEIPT_SCHEMA_VERSION = 'kcf.kpi.wib12.provisioning-receipt.v1';
export const BINDING_AUTHORITY_VERSION = 'kcf.kpi.wib12.binding-authority.v1';
export const RECEIPT_AUTHORITY_VERSION = 'kcf.kpi.wib12.receipt-authority.v1';
export const PACKAGE_TRANSITION_AUTHORITY_VERSION = 'kcf.kpi.wib12.package-transition-authority.v1';
export const COMPANION_SOLUTION = Object.freeze({
  uniqueName: 'KCFKPIEmployeeC2bTenantLayerDisabled',
  version: '1.0.1.0',
  workflowId: '3db97504-0731-4134-af1a-27e467d23b28',
  workflowName: 'KCF KPI Employee C2b Tenant Layer Disabled'
});

const text = (internalName, required, options = {}) => ({
  internalName, type: 'Text', required, maxLength: options.maxLength || 255,
  indexed: Boolean(options.indexed), unique: Boolean(options.unique)
});
const note = (internalName, required) => ({
  internalName, type: 'Note', required, plainText: true, appendOnly: false, versionHistory: false,
  indexed: false, unique: false
});
const bool = (internalName, required, defaultValue, indexed = false) => ({
  internalName, type: 'Boolean', required, defaultValue, indexed, unique: false
});
const date = (internalName, required, indexed = false) => ({
  internalName, type: 'Date', required, dateOnly: true, utcNormalisedInput: true, indexed, unique: false
});
const dateTime = (internalName, required, indexed = false) => ({
  internalName, type: 'Date', required, dateOnly: false, utcNormalisedInput: true, indexed, unique: false
});
const choice = (internalName, required, choices, indexed = false) => ({
  internalName, type: 'Choice', required, choices, fillInChoice: false, indexed, unique: false
});
const number = (internalName, required, minimum, maximum, indexed = false) => ({
  internalName, type: 'Number', required, decimals: 0, minimum, maximum, indexed, unique: false
});
const chunks = (prefix, count) => Array.from({ length: count }, (_, index) =>
  note(`${prefix}${String(index + 1).padStart(2, '0')}`, false));

const lists = [
  {
    purpose: 'BehaviourFrameworkSets', title: 'KCFKPI_BehaviourFrameworkSets', createIfMissing: true,
    description: 'Versioned Behaviour framework envelopes.', stableKey: 'FrameworkVersion',
    fields: [
      text('FrameworkVersion', true, { indexed: true, unique: true }),
      bool('Published', true, false), bool('Immutable', true, true), bool('Current', true, false, true),
      bool('ProductionSafe', true, false), bool('Synthetic', true, true),
      date('EffectiveFrom', true, true), date('EffectiveTo', false, true),
      note('RatingLabelsJSON', true), text('ApprovalReference', true)
    ]
  },
  {
    purpose: 'BehaviourFrameworkValues', title: 'KCFKPI_BehaviourFrameworkValues', createIfMissing: true,
    description: 'Versioned Behaviour Values and tier descriptors.', stableKey: 'FrameworkValueKey',
    fields: [
      text('FrameworkValueKey', true, { indexed: true, unique: true }),
      text('FrameworkVersion', true, { indexed: true }), text('ValueID', true, { indexed: true }),
      text('ValueTitle', true), text('CorporateValue', true), note('ICOfficerDescriptor', true),
      note('PeopleManagerDescriptor', true), note('SeniorLeaderDescriptor', true)
    ]
  },
  {
    purpose: 'PersonBehaviourAssignments', title: 'KCFKPI_PersonBehaviourAssignments', createIfMissing: true,
    description: 'Explicit person Behaviour version, role tier and cadence assignments.', stableKey: 'AssignmentKey',
    fields: [
      text('AssignmentKey', true, { indexed: true, unique: true }), text('PersonKey', true, { indexed: true }),
      text('FrameworkVersion', true, { indexed: true }),
      choice('RoleTier', true, ['IC_OFFICER', 'PEOPLE_MANAGER', 'SENIOR_LEADER'], true),
      choice('Cadence', true, ['Quarterly', 'TwiceYearly'], true), note('PeriodKeysJSON', true),
      bool('Active', true, false, true)
    ]
  },
  {
    purpose: 'BehaviourObjectiveLibrary', title: 'KCFKPI_BehaviourObjectiveLibrary', createIfMissing: false,
    description: 'Existing governed 16-field Behaviour catalogue.', stableKey: 'BehaviourObjectiveKey',
    fields: [
      text('BehaviourObjectiveKey', true, { indexed: true, unique: true }),
      text('BehaviourKey', true, { indexed: true }), text('BehaviourTitle', true), text('CorporateValue', true),
      text('RoleLevelName', true), text('DropdownLabel', true), text('ObjectiveTitle', true),
      text('SuggestedUnit', true), choice('RoleLevelCode', true, ['L1', 'L2', 'L3'], true),
      note('ObjectiveDescription', true), note('SuggestedMeasure', true), note('SuggestedEvidence', true),
      bool('Active', true, false, true), number('SortOrder', true, 1, 5),
      date('EffectiveFrom', true, true), date('EffectiveTo', false, true)
    ], exactCustomFieldSet: true
  },
  {
    purpose: 'People', title: 'KCFKPI_TEST_People', createIfMissing: false, stableKey: 'PersonKey',
    requiredExistingFields: [text('PersonKey', true, { indexed: true, unique: true })], fields: [
      text('BehaviourFrameworkVersionV2', false),
      choice('BehaviourRoleTierV2', false, ['IC_OFFICER', 'PEOPLE_MANAGER', 'SENIOR_LEADER']),
      choice('BehaviourCadenceV2', false, ['Quarterly', 'TwiceYearly'])
    ]
  },
  {
    purpose: 'Workplans', title: 'KCFKPI_TEST_Workplans', createIfMissing: false,
    stableKey: 'WorkplanKey',
    requiredExistingFields: [text('WorkplanKey', true, { indexed: true, unique: true })], fields: [
      text('BehaviourContractVersion', false), text('SchemaRevision', false)
    ]
  },
  {
    purpose: 'WorkplanItems', title: 'KCFKPI_TEST_WorkplanItems', createIfMissing: false,
    stableKey: 'WorkplanItemNaturalKey',
    requiredExistingFields: [text('WorkplanItemNaturalKey', true, { indexed: true, unique: true })], fields: [
      text('BehaviourFrameworkVersion', false), text('BehaviourValueTitleSnapshot', false),
      text('BehaviourCorporateValueSnapshot', false), text('BehaviourRoleTierSnapshot', false),
      text('BehaviourCadenceSnapshot', false), note('BehaviourDescriptorSnapshot', false),
      note('BehaviourPeriodKeysSnapshotJSON', false), note('BehaviourRatingLabelsSnapshotJSON', false),
      note('BehaviourCommitmentV2', false), note('BehaviourPeriodCommitmentsV2JSON', false),
      note('BehaviourV2SelectedSuggestionKeysJSON', false),
      text('BehaviourPlanningContractVersion', false), text('BehaviourCurrentLevelV2', false),
      text('BehaviourTargetLevelV2', false), note('BehaviourTargetLevelReasonV2', false),
      number('RowVersionToken', false, 1, Number.MAX_SAFE_INTEGER)
    ]
  },
  {
    purpose: 'QuarterReviews', title: 'KCFKPI_TEST_QuarterReviews', createIfMissing: false,
    stableKey: 'QuarterReviewKey',
    requiredExistingFields: [text('QuarterReviewKey', true, { indexed: true, unique: true })], fields: [
      text('BehaviourFrameworkVersionSnapshot', false), text('BehaviourRoleTierSnapshot', false),
      text('BehaviourCadenceSnapshot', false)
    ]
  },
  {
    purpose: 'QuarterReviewItems', title: 'KCFKPI_TEST_QuarterReviewItems', createIfMissing: false,
    stableKey: 'QuarterReviewItemKey',
    requiredExistingFields: [text('QuarterReviewItemKey', true, { indexed: true, unique: true })], fields: [
      text('BehaviourFrameworkVersionSnapshot', false), text('BehaviourValueTitleSnapshot', false),
      text('BehaviourCorporateValueSnapshot', false), text('BehaviourRoleTierSnapshot', false),
      text('BehaviourCadenceSnapshot', false), text('BehaviourPeriodSnapshot', false),
      note('BehaviourDescriptorSnapshot', false), note('BehaviourPeriodKeysSnapshotJSON', false),
      note('BehaviourRatingLabelsSnapshotJSON', false), note('EmployeeBehaviourEvidenceV2', false),
      number('EmployeeBehaviourAssessmentV2', false, 1, 3), note('ManagerBehaviourEvidenceV2', false),
      number('ManagerBehaviourAssessmentV2', false, 1, 3), note('FinalBehaviourEvidenceV2', false),
      number('FinalBehaviourAssessmentV2', false, 1, 3),
      text('BehaviourAnnualTargetLevelV2', false), note('BehaviourAnnualTargetJustificationV2', false),
      text('BehaviourAnnualTargetSourceWorkplanItemKeyV2', false), text('BehaviourAnnualTargetSourceEtagV2', false),
      number('BehaviourAnnualTargetSourceWorkplanVersionV2', false, 1, Number.MAX_SAFE_INTEGER),
      text('BehaviourAnnualTargetSourceApprovalKeyV2', false)
    ]
  },
  {
    purpose: 'CommandReceipts', title: 'KCFKPI_TEST_CommandReceipts', createIfMissing: false,
    schemaRevision: 'c2b-annual-v2', stableKey: 'ReceiptKey',
    requiredExistingFields: [text('ReceiptKey', true, { indexed: true, unique: true }),
      text('CommandKey', true, { indexed: true, unique: true })], fields: [
      choice('NativeReceiptPayloadKind', false, ['C2bTerminal'], true),
      text('NativeReceiptContractVersion', false, { maxLength: 100 }),
      text('NativeReceiptStateSHA256', false, { maxLength: 64, indexed: true }),
      number('NativeReceiptStateLength', false, 2, 480000),
      number('NativeReceiptChunkCount', false, 1, 8), ...chunks('NativeReceiptChunk', 8)
    ]
  },
  {
    purpose: 'ControlCases', title: 'KCFKPI_TEST_ControlCases', createIfMissing: true,
    schemaRevision: 'c2b-control-case-v1', description: 'Processor-private authoritative C2b control cases.',
    permissionCapability: 'PrivateProcessorOnly',
    stableKey: 'ControlCaseKey', fields: [
      text('ControlCaseKey', true, { maxLength: 255, indexed: true, unique: true }),
      text('ControlReference', true, { maxLength: 255, indexed: true }),
      choice('AuthorisedAction', true, ['CreateWorkplanAmendmentV2'], true),
      text('SubjectKey', true, { maxLength: 255, indexed: true }),
      text('WorkplanKey', true, { maxLength: 255, indexed: true }),
      number('WorkplanVersion', true, 1, Number.MAX_SAFE_INTEGER),
      text('ExpectedETag', true, { maxLength: 255 }),
      number('ExpectedRowVersionToken', true, 1, Number.MAX_SAFE_INTEGER),
      bool('Active', true, false, true), dateTime('ValidFromUtc', true, true), dateTime('ValidToUtc', true, true),
      bool('Revoked', true, false, true), dateTime('RevokedAtUtc', false), note('RevocationReason', false),
      dateTime('ConsumedAtUtc', false, true), text('ConsumedCommandKey', false, { maxLength: 255, indexed: true }),
      text('ConsumedSourceListId', false, { maxLength: 36 }),
      number('ConsumedSourceItemId', false, 1, Number.MAX_SAFE_INTEGER),
      text('ConsumedSourceItemVersion', false, { maxLength: 64 }),
      dateTime('RecoveryHoldAtUtc', false, true), note('RecoveryHoldReason', false),
      number('RowVersionToken', true, 1, Number.MAX_SAFE_INTEGER),
      text('ControlCaseContentSHA256', true, { maxLength: 64, indexed: true })
    ]
  },
  {
    purpose: 'TenantProvisioningReceipts', title: 'KCFKPI_TEST_TenantProvisioningReceipts', createIfMissing: true,
    schemaRevision: 'kcf-wib12-provisioning-receipt-v1',
    description: 'Processor-private append-only WI-B12 provisioning receipt revisions.',
    permissionCapability: 'PrivateProcessorOnly',
    stableKey: 'ReceiptRevisionKey', fields: [
      text('ReceiptRevisionKey', true, { maxLength: 255, indexed: true, unique: true }),
      text('ReceiptKey', true, { maxLength: 100, indexed: true }),
      number('Revision', true, 1, Number.MAX_SAFE_INTEGER, true),
      text('ReceiptSHA256', true, { maxLength: 64, indexed: true }),
      text('PreviousReceiptSHA256', false, { maxLength: 64 }),
      choice('Status', true, ['InProgress', 'Completed', 'BlockedOff'], true),
      text('PlanSHA256', true, { maxLength: 64, indexed: true }),
      number('ReceiptStateLength', true, 2, 960000), number('ReceiptChunkCount', true, 1, 16),
      ...chunks('ReceiptChunk', 16)
    ]
  }
].map(list => ({
  ...list, schemaRevision: list.schemaRevision || TENANT_LAYER_SCHEMA_REVISION,
  baseTemplate: 100, titleRequired: false, majorVersioningEnabled: true, foldersEnabled: false
}));

export const schemaContract = Object.freeze({
  contractVersion: TENANT_LAYER_CONTRACT_VERSION,
  schemaRevision: TENANT_LAYER_SCHEMA_REVISION,
  operationPolicy: Object.freeze({ modeDefault: 'DryRun', applyRequiresExplicitEnable: true, addOnly: true,
    overwriteAllowed: false, deleteAllowed: false, stableKeyImport: true, exactReadbackRequired: true }),
  lists
});

const b01Purposes = ['People', 'EmployeeCommands', 'ManagerCommands', 'CommandJournal', 'CommandEffects',
  'CommandReceipts', 'Workplans', 'WorkplanItems', 'Audit'];
const behaviourPurposes = ['BehaviourFrameworkSets', 'BehaviourFrameworkValues', 'PersonBehaviourAssignments',
  'BehaviourObjectiveLibrary'];
const isolatedPurposes = ['ControlCases', 'TenantProvisioningReceipts'];
const b01Titles = Object.freeze({
  People: 'KCFKPI_TEST_People', EmployeeCommands: 'KCFKPI_TEST_EmployeeCommands',
  ManagerCommands: 'KCFKPI_TEST_ManagerCommands', CommandJournal: 'KCFKPI_TEST_CommandJournal',
  CommandEffects: 'KCFKPI_TEST_CommandEffects', CommandReceipts: 'KCFKPI_TEST_CommandReceipts',
  Workplans: 'KCFKPI_TEST_Workplans', WorkplanItems: 'KCFKPI_TEST_WorkplanItems', Audit: 'KCFKPI_TEST_Audit'
});

export const bindingTemplate = Object.freeze({
  contractVersion: TENANT_LAYER_CONTRACT_VERSION,
  enabled: false,
  bindingReceiptSha256: null,
  bindingAuthority: {
    contractVersion: BINDING_AUTHORITY_VERSION, authorityReference: null,
    expectedBindingSha256: null, expectedBinding: null,
    aclAuthority: { authorised: false, identitySeparationEvidenceSha256: null,
      rollbackActorPrincipalId: null, rollbackRegistryReference: null }
  },
  schemaAuthority: { authorityReference: null, schemaSha256: null, listInventorySha256: null },
  receiptAuthority: {
    contractVersion: RECEIPT_AUTHORITY_VERSION, authorityReference: null,
    receiptListId: null, receiptListTitle: null, schemaRevision: null,
    baseTemplate: null, majorVersioningEnabled: null, foldersEnabled: null,
    keyField: 'ReceiptRevisionKey', seriesKeyField: 'ReceiptKey', chunkPrefix: 'ReceiptChunk',
    chunkCount: 16, maximumCodeUnits: 960000, fieldInventory: [], fieldInventorySha256: null,
    writerPrincipalKey: null, writerPrincipalId: null
  },
  packageTransitionAuthority: {
    contractVersion: PACKAGE_TRANSITION_AUTHORITY_VERSION, authorityReference: null,
    targetCandidate: { sourceCommit: null, sourceTree: null,
      tenantPacketManifestSha256: null, companionPackageSha256: null },
    targetBasePackage: { productId: null, version: null, binarySha256: null },
    allowedPriorBasePackages: []
  },
  frozenBase: { commit: '30caa68738681cda364db52d478138fde7bbc53a',
    tree: '688b09d841a74adb064c230ced8a90072a256f2c',
    packageSha256: 'CE91E398B38DE312E2AC5E5731F93AF5D6263BC53C08E3C349CEA745262C3EB6' },
  builtCandidate: { commit: null, tree: null, tenantPacketManifestSha256: null, companionPackageSha256: null },
  targetEvidence: null,
  deploymentClassification: 'Unknown',
  expectedTargetEvidenceSha256: TARGET_EVIDENCE_SHA256,
  isolationAuthorityReference: ISOLATION_AUTHORITY,
  appCatalogue: { scope: 'SiteCollection', id: null, priorPackageIdentity: null, installScope: null },
  baseSpfxPackage: { productId: '34bee229-16d5-4ecb-a2f8-a7ae2353c3bf', version: '1.0.0.0',
    binarySha256: 'CE91E398B38DE312E2AC5E5731F93AF5D6263BC53C08E3C349CEA745262C3EB6',
    priorInstalledVersion: null, receiptReference: null },
  package: { companionSolutionUniqueName: COMPANION_SOLUTION.uniqueName, version: COMPANION_SOLUTION.version,
    workflowId: COMPANION_SOLUTION.workflowId, workflowName: COMPANION_SOLUTION.workflowName,
    binarySha256: null, priorInstalledVersion: null },
  connectionReference: { id: null, connector: 'shared_sharepointonline', primaryOwnerPrincipalId: null,
    backupOwnerPrincipalId: null, continuityReference: null },
  nativeStorageFields: { sourcePayloadJson: 'PayloadJSON', journalKey: 'CommandKey', effectKey: 'EffectKey',
    workplanKey: 'WorkplanKey', workplanItemKey: 'WorkplanItemNaturalKey', auditKey: 'AuditKey',
    receiptKey: 'ReceiptKey', controlCaseKey: 'ControlCaseKey', provisioningReceiptKey: 'ReceiptRevisionKey' },
  planningAuthority: { schemaRevision: 'c2b-annual-v2', behaviourContractVersion: null,
    initialState: 'Draft', initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready',
    processorPrincipalKey: null, adminPrincipalKeys: [], coreCatalogueProviderReference: null,
    coreKpiMasterListId: null, coreAnnualTargetsListId: null },
  lists: [...b01Purposes, ...behaviourPurposes, ...isolatedPurposes].map(purpose => ({
    purpose, title: lists.find(list => list.purpose === purpose)?.title || b01Titles[purpose] || null, listId: null,
    schemaRevision: null, observedFields: [], beforeETag: null, afterETag: null, beforeCount: null, afterCount: null
  })),
  provisioningLists: lists.map(list => ({ purpose: list.purpose, title: list.title, listId: null,
    schemaRevision: list.schemaRevision })),
  principals: { processor: null, administrators: [], submitters: [], actors: [], negative: [], visitorsGroup: null,
    visitorsRole: 'Read', processorRoleId: null, administratorRoleId: null, submitterRoleId: null,
    actorReadRoleId: null, visitorsRoleId: null, roleDefinitions: [], principalKeyBindings: [] },
  catalogue: { frameworkVersion: null, published: null, productionSafe: null, synthetic: null,
    expectedRowCount: 75, canonicalDigestSha256: null },
  productData: { approvalReference: null, importedStableKeys: [] },
  activated: false
});

export const productDataTemplate = Object.freeze({
  contractVersion: TENANT_LAYER_CONTRACT_VERSION,
  productAuthority: { authorityReference: null, productDataSha256: null, frameworkVersion: null,
    catalogueDigestSha256: null, fixtureRange: null, actorPrincipalMapSha256: null,
    historicEvidenceReferences: [] },
  approvalReference: null,
  dateBoundaryRule: null,
  frameworkSets: [], frameworkValues: [], personAssignments: [], behaviourObjectiveLibrary: [],
  peopleBindings: [], historicEvidence: [], roleLevelBindings: [], principalBindings: [],
  positiveActors: [], negativeActors: [], fixtureRange: null, fixtureAuthorityReference: null,
  catalogueBinding: null
});

export const receiptTemplates = Object.freeze({
  beforeState: {
    contractVersion: TENANT_LAYER_CONTRACT_VERSION, capturedAt: null, targetEvidenceSha256: null,
    package: null, flows: [], lists: [], bindings: null, permissions: [], productionChangeObserved: false
  },
  operationReceipt: {
    contractVersion: TENANT_LAYER_CONTRACT_VERSION, receiptSchemaVersion: RECEIPT_SCHEMA_VERSION,
    revision: null, previousReceiptSha256: null, receiptSha256: null,
    mode: 'DryRun', applyExplicitlyEnabled: false,
    receiptKey: null, status: 'InProgress', startedAt: null, completedAt: null, planSha256: null, plan: null,
    beforeStateSha256: null,
    confirmations: [], stopCode: null, pendingOperation: null, unknownOperation: null,
    afterStateSha256: null,
    rollback: { requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true, entries: [], ambiguityOutcome: 'BLOCKED_OFF' }
  },
  afterState: {
    contractVersion: TENANT_LAYER_CONTRACT_VERSION, capturedAt: null, targetEvidenceSha256: null,
    package: null, flows: [], lists: [], bindings: null, permissions: [], productionChangeObserved: false
  },
  rollbackManifest: {
    contractVersion: TENANT_LAYER_CONTRACT_VERSION, requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true,
    rollbackRegistryAuthority: { authorityReference: null, registryReference: null,
      identitySeparationEvidenceSha256: null, rollbackActorPrincipalId: null },
    restoreReceiptedPriorPackageOnly: true, restorePriorBindingsAndPermissions: true,
    preserveRunAndEvidenceIds: true, actionCreatedAssetsOnly: [], preExistingAssetsProtected: [],
    ambiguityOutcome: 'BLOCKED_OFF', productionChangeAllowed: false
  }
});

export const generatedFlowContract = Object.freeze({
  contractVersion: TENANT_LAYER_CONTRACT_VERSION,
  targetClassification: { platformEnvironmentType: 'Default', deploymentClassification: 'NonProduction',
    expectedEvidenceSha256: TARGET_EVIDENCE_SHA256, isolationAuthorityReference: ISOLATION_AUTHORITY },
  provisioning: { schemaRevision: TENANT_LAYER_SCHEMA_REVISION, modeDefault: 'DryRun', applyExplicitlyEnabled: false,
    addOnly: true, overwriteAllowed: false, rollbackReceiptRequired: true },
  authorityRequirements: {
    binding: { contractVersion: BINDING_AUTHORITY_VERSION, required: true },
    schema: { required: true }, product: { required: true },
    receipt: { contractVersion: RECEIPT_AUTHORITY_VERSION, required: true,
      providerListSchemaRequired: true, providerWriterVersionEtagRequired: true },
    packageTransition: { contractVersion: PACKAGE_TRANSITION_AUTHORITY_VERSION, required: true },
    acl: { identitySeparationEvidenceRequired: true, rollbackRegistryRequired: true }
  },
  receiptPolicy: { receiptSchemaVersion: RECEIPT_SCHEMA_VERSION, appendOnlyDigestChain: true,
    validateEveryRevision: true, flowMustRemainOff: true },
  bindingRequired: true, preflightRequired: true, triggerInstalled: false, activated: false,
  forbiddenAtRuntime: ['UnknownTarget', 'MismatchedBinding', 'IncompletePage', 'DuplicateKey', 'FieldCoercion',
    'UnapprovedData', 'PermissionElevation', 'ActiveOldFlow', 'AmbiguousPackageIdentity', 'ProductionReference']
});
