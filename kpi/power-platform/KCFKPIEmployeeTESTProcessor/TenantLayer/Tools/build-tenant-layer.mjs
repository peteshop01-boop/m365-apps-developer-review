import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  COMPANION_SOLUTION,
  BINDING_AUTHORITY_VERSION,
  PACKAGE_TRANSITION_AUTHORITY_VERSION,
  RECEIPT_AUTHORITY_VERSION,
  RECEIPT_SCHEMA_VERSION,
  bindingTemplate,
  generatedFlowContract,
  productDataTemplate,
  receiptTemplates,
  schemaContract
} from './tenant-layer-contract.mjs';

const tenantRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const processorRoot = dirname(tenantRoot);
const projectRoot = dirname(dirname(processorRoot));
const baseDefinitionPath = join(processorRoot, 'Definitions', 'C2b.disabled.definition.json');
const executablePreflightPath = join(projectRoot, 'src', 'webparts', 'performanceHub', 'services', 'tenant',
  'TenantPacketPreflight.ts');
const args = process.argv.slice(2);
const mode = args[0] || '--check';
let expectedCurrentManifestSha256;
if (mode === '--check') {
  if (args.length > 1) throw new Error('TENANT_LAYER_ARGUMENTS_INVALID');
} else if (mode === '--write') {
  if (args.length !== 3 || args[1] !== '--expected-current-manifest-sha256'
    || !/^[0-9a-f]{64}$/i.test(args[2])) throw new Error('TENANT_LAYER_EXPECTED_CURRENT_MANIFEST_ARGUMENT_INVALID');
  expectedCurrentManifestSha256 = args[2].toUpperCase();
} else throw new Error('TENANT_LAYER_ARGUMENTS_INVALID');
const serialise = value => `${JSON.stringify(value, null, 2)}\n`;
const hash = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const exactKeys = (value, expected, code) => {
  if (!value || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort()))
    throw new Error(code);
};
const allNull = value => Object.values(value).every(item => item === null);

function assertGovernedTemplateContract() {
  exactKeys(bindingTemplate.bindingAuthority,
    ['contractVersion', 'authorityReference', 'expectedBindingSha256', 'expectedBinding', 'aclAuthority'],
    'TENANT_LAYER_BINDING_AUTHORITY_SCHEMA_INVALID');
  exactKeys(bindingTemplate.bindingAuthority.aclAuthority,
    ['authorised', 'identitySeparationEvidenceSha256', 'rollbackActorPrincipalId', 'rollbackRegistryReference'],
    'TENANT_LAYER_ACL_AUTHORITY_SCHEMA_INVALID');
  exactKeys(bindingTemplate.schemaAuthority,
    ['authorityReference', 'schemaSha256', 'listInventorySha256'], 'TENANT_LAYER_SCHEMA_AUTHORITY_SCHEMA_INVALID');
  exactKeys(bindingTemplate.receiptAuthority,
    ['contractVersion', 'authorityReference', 'receiptListId', 'receiptListTitle', 'schemaRevision', 'baseTemplate',
      'majorVersioningEnabled', 'foldersEnabled', 'keyField', 'seriesKeyField', 'chunkPrefix', 'chunkCount',
      'maximumCodeUnits', 'fieldInventory', 'fieldInventorySha256',
      'writerPrincipalKey', 'writerPrincipalId'], 'TENANT_LAYER_RECEIPT_AUTHORITY_SCHEMA_INVALID');
  exactKeys(bindingTemplate.nativeStorageFields,
    ['sourcePayloadJson', 'journalKey', 'effectKey', 'workplanKey', 'workplanItemKey', 'auditKey', 'receiptKey',
      'controlCaseKey', 'provisioningReceiptKey'], 'TENANT_LAYER_NATIVE_STORAGE_SCHEMA_INVALID');
  exactKeys(bindingTemplate.planningAuthority,
    ['schemaRevision', 'behaviourContractVersion', 'initialState', 'initialAccessState', 'initialTransitionStatus',
      'processorPrincipalKey', 'adminPrincipalKeys', 'coreCatalogueProviderReference', 'coreKpiMasterListId',
      'coreAnnualTargetsListId'],
    'TENANT_LAYER_PLANNING_AUTHORITY_SCHEMA_INVALID');
  exactKeys(bindingTemplate.packageTransitionAuthority,
    ['contractVersion', 'authorityReference', 'targetCandidate', 'targetBasePackage', 'allowedPriorBasePackages'],
    'TENANT_LAYER_PACKAGE_TRANSITION_AUTHORITY_SCHEMA_INVALID');
  exactKeys(productDataTemplate.productAuthority,
    ['authorityReference', 'productDataSha256', 'frameworkVersion', 'catalogueDigestSha256', 'fixtureRange',
      'actorPrincipalMapSha256', 'historicEvidenceReferences'], 'TENANT_LAYER_PRODUCT_AUTHORITY_SCHEMA_INVALID');
  exactKeys(receiptTemplates.operationReceipt,
    ['contractVersion', 'receiptSchemaVersion', 'revision', 'previousReceiptSha256', 'receiptSha256', 'mode',
      'applyExplicitlyEnabled', 'receiptKey', 'status', 'startedAt', 'completedAt', 'planSha256', 'plan',
      'beforeStateSha256', 'confirmations', 'stopCode', 'pendingOperation', 'unknownOperation', 'afterStateSha256',
      'rollback'], 'TENANT_LAYER_OPERATION_RECEIPT_SCHEMA_INVALID');
  exactKeys(receiptTemplates.rollbackManifest.rollbackRegistryAuthority,
    ['authorityReference', 'registryReference', 'identitySeparationEvidenceSha256', 'rollbackActorPrincipalId'],
    'TENANT_LAYER_ROLLBACK_REGISTRY_SCHEMA_INVALID');
  if (bindingTemplate.bindingAuthority.contractVersion !== BINDING_AUTHORITY_VERSION
    || bindingTemplate.receiptAuthority.contractVersion !== RECEIPT_AUTHORITY_VERSION
    || bindingTemplate.packageTransitionAuthority.contractVersion !== PACKAGE_TRANSITION_AUTHORITY_VERSION
    || receiptTemplates.operationReceipt.receiptSchemaVersion !== RECEIPT_SCHEMA_VERSION
    || bindingTemplate.enabled !== false || bindingTemplate.activated !== false
    || bindingTemplate.bindingAuthority.aclAuthority.authorised !== false
    || !allNull({ authorityReference: bindingTemplate.bindingAuthority.authorityReference,
      expectedBindingSha256: bindingTemplate.bindingAuthority.expectedBindingSha256,
      expectedBinding: bindingTemplate.bindingAuthority.expectedBinding,
      identitySeparationEvidenceSha256:
        bindingTemplate.bindingAuthority.aclAuthority.identitySeparationEvidenceSha256,
      rollbackActorPrincipalId: bindingTemplate.bindingAuthority.aclAuthority.rollbackActorPrincipalId,
      rollbackRegistryReference: bindingTemplate.bindingAuthority.aclAuthority.rollbackRegistryReference })
    || !allNull(bindingTemplate.schemaAuthority)
    || !allNull(Object.fromEntries(Object.entries(bindingTemplate.receiptAuthority)
      .filter(([key]) => !['contractVersion', 'keyField', 'seriesKeyField', 'chunkPrefix', 'chunkCount',
        'maximumCodeUnits', 'fieldInventory'].includes(key))))
    || bindingTemplate.receiptAuthority.keyField !== 'ReceiptRevisionKey'
    || bindingTemplate.receiptAuthority.seriesKeyField !== 'ReceiptKey'
    || bindingTemplate.receiptAuthority.chunkPrefix !== 'ReceiptChunk'
    || bindingTemplate.receiptAuthority.chunkCount !== 16
    || bindingTemplate.receiptAuthority.maximumCodeUnits !== 960000
    || bindingTemplate.receiptAuthority.fieldInventory.length !== 0
    || JSON.stringify(bindingTemplate.nativeStorageFields) !== JSON.stringify({ sourcePayloadJson: 'PayloadJSON',
      journalKey: 'CommandKey', effectKey: 'EffectKey', workplanKey: 'WorkplanKey',
      workplanItemKey: 'WorkplanItemNaturalKey', auditKey: 'AuditKey', receiptKey: 'ReceiptKey',
      controlCaseKey: 'ControlCaseKey', provisioningReceiptKey: 'ReceiptRevisionKey' })
    || bindingTemplate.planningAuthority.schemaRevision !== 'c2b-annual-v2'
    || bindingTemplate.planningAuthority.initialState !== 'Draft'
    || bindingTemplate.planningAuthority.initialAccessState !== 'EmployeeEdit'
    || bindingTemplate.planningAuthority.initialTransitionStatus !== 'Ready'
    || bindingTemplate.planningAuthority.behaviourContractVersion !== null
    || bindingTemplate.planningAuthority.processorPrincipalKey !== null
    || bindingTemplate.planningAuthority.coreCatalogueProviderReference !== null
    || bindingTemplate.planningAuthority.coreKpiMasterListId !== null
    || bindingTemplate.planningAuthority.coreAnnualTargetsListId !== null
    || bindingTemplate.planningAuthority.adminPrincipalKeys.length !== 0
    || !allNull(Object.fromEntries(Object.entries(bindingTemplate.packageTransitionAuthority)
      .filter(([key]) => !['contractVersion', 'targetCandidate', 'targetBasePackage', 'allowedPriorBasePackages'].includes(key))))
    || !allNull(bindingTemplate.packageTransitionAuthority.targetCandidate)
    || !allNull(bindingTemplate.packageTransitionAuthority.targetBasePackage)
    || bindingTemplate.packageTransitionAuthority.allowedPriorBasePackages.length !== 0
    || !allNull(Object.fromEntries(Object.entries(productDataTemplate.productAuthority)
      .filter(([key]) => key !== 'historicEvidenceReferences')))
    || productDataTemplate.productAuthority.historicEvidenceReferences.length !== 0
    || receiptTemplates.operationReceipt.revision !== null
    || receiptTemplates.operationReceipt.previousReceiptSha256 !== null
    || receiptTemplates.operationReceipt.receiptSha256 !== null
    || receiptTemplates.operationReceipt.rollback.flowMustRemainOff !== true
    || Object.prototype.hasOwnProperty.call(receiptTemplates.operationReceipt, 'stopped')
    || !allNull(receiptTemplates.rollbackManifest.rollbackRegistryAuthority)
    || generatedFlowContract.receiptPolicy.receiptSchemaVersion !== RECEIPT_SCHEMA_VERSION
    || generatedFlowContract.receiptPolicy.validateEveryRevision !== true
    || generatedFlowContract.receiptPolicy.flowMustRemainOff !== true)
    throw new Error('TENANT_LAYER_GOVERNED_AUTHORITY_TEMPLATE_NOT_FAIL_CLOSED');
}

const workflowStem = `KCFKPIEmployeeC2bTenantLayerDisabled-${COMPANION_SOLUTION.workflowId.toUpperCase()}`;
const relativeOutputs = Object.freeze({
  schema: join('Schema', 'behaviour-v2-sharepoint-schema.json'),
  binding: join('Configuration', 'tenant-binding.template.json'),
  data: join('Data', 'product-data.template.json'),
  before: join('Receipts', 'before-state.template.json'),
  operation: join('Receipts', 'operation-receipt.template.json'),
  after: join('Receipts', 'after-state.template.json'),
  rollback: join('Receipts', 'rollback-manifest.template.json'),
  definition: join('Definitions', 'C2b.tenant-layer.disabled.definition.json'),
  contentTypes: join('PackageSource', '[Content_Types].xml'),
  customizations: join('PackageSource', 'Other', 'Customizations.xml'),
  solution: join('PackageSource', 'Other', 'Solution.xml'),
  workflow: join('PackageSource', 'Workflows', `${workflowStem}.json`),
  workflowData: join('PackageSource', 'Workflows', `${workflowStem}.json.data.xml`),
  package: join('Package', `${COMPANION_SOLUTION.uniqueName}_${COMPANION_SOLUTION.version.replace(/\./g, '_')}.zip`),
  manifest: 'tenant-layer-manifest.json'
});

const xml = value => `${value.trim()}\n`;
const contentTypes = xml(`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/octet-stream" />
  <Default Extension="json" ContentType="application/octet-stream" />
</Types>`);
const customizations = xml(`<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities /><Roles /><Workflows /><FieldSecurityProfiles /><Templates /><EntityMaps />
  <EntityRelationships /><OrganizationSettings /><optionsets /><CustomControls />
  <EntityDataProviders /><connectionreferences />
  <Languages><Language>1033</Language></Languages>
</ImportExportXml>`);
const solution = xml(`<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2" SolutionPackageVersion="9.2" languagecode="1033" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>${COMPANION_SOLUTION.uniqueName}</UniqueName>
    <LocalizedNames><LocalizedName description="KCF KPI Employee C2b Tenant Layer Disabled" languagecode="1033" /></LocalizedNames>
    <Descriptions />
    <Version>${COMPANION_SOLUTION.version}</Version>
    <Managed>0</Managed>
    <Publisher>
      <UniqueName>KCFKPI</UniqueName>
      <LocalizedNames><LocalizedName description="KCF KPI" languagecode="1033" /></LocalizedNames>
      <Descriptions /><EMailAddress xsi:nil="true"></EMailAddress><SupportingWebsiteUrl xsi:nil="true"></SupportingWebsiteUrl>
      <CustomizationPrefix>kcfkpi</CustomizationPrefix><CustomizationOptionValuePrefix>62000</CustomizationOptionValuePrefix><Addresses />
    </Publisher>
    <RootComponents><RootComponent type="29" id="{${COMPANION_SOLUTION.workflowId}}" behavior="0" /></RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>`);
const workflowData = xml(`<?xml version="1.0" encoding="utf-8"?>
<Workflow WorkflowId="{${COMPANION_SOLUTION.workflowId}}" Name="${COMPANION_SOLUTION.workflowName}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <JsonFileName>/Workflows/${workflowStem}.json</JsonFileName>
  <Type>1</Type><Subprocess>0</Subprocess><Category>5</Category><Mode>0</Mode><Scope>4</Scope>
  <OnDemand>0</OnDemand><TriggerOnCreate>0</TriggerOnCreate><TriggerOnDelete>0</TriggerOnDelete>
  <AsyncAutodelete>0</AsyncAutodelete><SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
  <StateCode>0</StateCode><StatusCode>1</StatusCode><RunAs>1</RunAs><IsTransacted>1</IsTransacted>
  <IntroducedVersion>${COMPANION_SOLUTION.version}</IntroducedVersion><IsCustomizable>1</IsCustomizable>
  <BusinessProcessType>0</BusinessProcessType><IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>
  <ModernFlowType>0</ModernFlowType><PrimaryEntity>none</PrimaryEntity>
  <LocalizedNames><LocalizedName languagecode="1033" description="${COMPANION_SOLUTION.workflowName}" /></LocalizedNames>
</Workflow>`);

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();
const crc32 = buffer => {
  let value = 0xffffffff;
  for (const byte of buffer) value = crcTable[(value ^ byte) & 0xff] ^ value >>> 8;
  return (value ^ 0xffffffff) >>> 0;
};

function deterministicZip(entries) {
  const local = [];
  const central = [];
  let offset = 0;
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of sorted) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8); localHeader.writeUInt16LE(0, 10); localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(crc, 14); localHeader.writeUInt32LE(data.length, 18); localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26); localHeader.writeUInt16LE(0, 28);
    local.push(localHeader, name, data);
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); centralHeader.writeUInt16LE(20, 4); centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8); centralHeader.writeUInt16LE(0, 10); centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14); centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20); centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28); centralHeader.writeUInt16LE(0, 30); centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34); centralHeader.writeUInt16LE(0, 36); centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42); central.push(centralHeader, name);
    offset += localHeader.length + name.length + data.length;
  }
  const centralBytes = central.reduce((sum, value) => sum + value.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(sorted.length, 8); end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralBytes, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...local, ...central, end]);
}

async function build() {
  assertGovernedTemplateContract();
  const baseText = await readFile(baseDefinitionPath, 'utf8');
  const flow = JSON.parse(baseText);
  const definition = flow.properties.definition;
  definition.contentVersion = '0.0.5.0';
  flow.properties.connectionReferences = {};
  definition.parameters.$connections.defaultValue = {};
  definition.triggers = {};
  definition.actions.C2B_Tenant_Layer_Packet_Contract = {
    type: 'Compose', inputs: generatedFlowContract, runAfter: {}
  };
  definition.actions.C2B_Local_Composition_Contract.runAfter = {
    C2B_Tenant_Layer_Packet_Contract: ['Succeeded']
  };
  const definitionText = serialise(flow);
  const packagedFlowText = serialise({ ...flow, schemaVersion: COMPANION_SOLUTION.version });
  const textOutputs = new Map([
    [relativeOutputs.schema, serialise(schemaContract)], [relativeOutputs.binding, serialise(bindingTemplate)],
    [relativeOutputs.data, serialise(productDataTemplate)], [relativeOutputs.before, serialise(receiptTemplates.beforeState)],
    [relativeOutputs.operation, serialise(receiptTemplates.operationReceipt)], [relativeOutputs.after, serialise(receiptTemplates.afterState)],
    [relativeOutputs.rollback, serialise(receiptTemplates.rollbackManifest)], [relativeOutputs.definition, definitionText],
    [relativeOutputs.contentTypes, contentTypes], [relativeOutputs.customizations, customizations],
    [relativeOutputs.solution, solution], [relativeOutputs.workflow, packagedFlowText], [relativeOutputs.workflowData, workflowData]
  ]);
  const packageEntries = [
    { name: '[Content_Types].xml', data: contentTypes }, { name: 'Other/Customizations.xml', data: customizations },
    { name: 'Other/Solution.xml', data: solution }, { name: `Workflows/${workflowStem}.json`, data: packagedFlowText },
    { name: `Workflows/${workflowStem}.json.data.xml`, data: workflowData }
  ];
  const packageBytes = deterministicZip(packageEntries);
  const binaryOutputs = new Map([[relativeOutputs.package, packageBytes]]);
  const all = [...textOutputs.entries(), ...binaryOutputs.entries()].map(([file, value]) => {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
    return { file: file.replace(/\\/g, '/'), bytes: bytes.length, sha256: hash(bytes) };
  }).sort((left, right) => left.file.localeCompare(right.file));
  const manifest = {
    contractVersion: schemaContract.contractVersion, schemaRevision: schemaContract.schemaRevision,
    generationEpoch: '2000-01-01T00:00:00Z', deterministic: true, selfExcluded: true,
    baseDefinitionSha256: hash(baseText), targetEvidenceSha256: bindingTemplate.expectedTargetEvidenceSha256,
    solution: COMPANION_SOLUTION, disabled: true, triggerCount: 0, connectionReferenceCount: 0,
    applyDefaultEnabled: false, productRowCount: 0, generatedFiles: all
  };
  textOutputs.set(relativeOutputs.manifest, serialise(manifest));
  return { textOutputs, binaryOutputs, manifest, packageBytes };
}

function executableIdentity(sourceBytes) {
  const source = sourceBytes.toString('utf8');
  const pattern = /export const WI_B12_TENANT_MANIFEST_SHA256\s*=\s*'([0-9a-f]{64})'\s+as const;/gi;
  const matches = [...source.matchAll(pattern)];
  const declarations = [...source.matchAll(/\b(?:const|let|var)\s+WI_B12_TENANT_MANIFEST_SHA256\b/g)];
  if (matches.length !== 1 || declarations.length !== 1)
    throw new Error('TENANT_LAYER_EXECUTABLE_MANIFEST_IDENTITY_MISSING');
  const match = matches[0];
  const characterOffset = match.index + match[0].indexOf(match[1]);
  return { sha256: match[1].toUpperCase(), offset: Buffer.byteLength(source.slice(0, characterOffset), 'utf8') };
}

const priorSource = await readFile(executablePreflightPath);
const priorIdentity = executableIdentity(priorSource);
let priorManifest;
const priorOutputs = new Map();
if (mode === '--write') {
  priorManifest = await readFile(join(tenantRoot, relativeOutputs.manifest));
  if (hash(priorManifest) !== expectedCurrentManifestSha256 || priorIdentity.sha256 !== expectedCurrentManifestSha256)
    throw new Error('TENANT_LAYER_AUTHORISED_PRIOR_MANIFEST_MISMATCH');
  const manifest = JSON.parse(priorManifest.toString('utf8'));
  const inventory = Object.values(relativeOutputs).filter(file => file !== relativeOutputs.manifest)
    .map(file => file.replace(/\\/g, '/')).sort();
  if (!Array.isArray(manifest.generatedFiles) || manifest.generatedFiles.length !== inventory.length
    || JSON.stringify(manifest.generatedFiles.map(entry => entry.file).sort()) !== JSON.stringify(inventory))
    throw new Error('TENANT_LAYER_PRIOR_INVENTORY_INVALID');
  for (const entry of manifest.generatedFiles) {
    const bytes = await readFile(join(tenantRoot, entry.file));
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes !== bytes.length || entry.sha256 !== hash(bytes))
      throw new Error(`TENANT_LAYER_PRIOR_OUTPUT_MISMATCH: ${entry.file}`);
    priorOutputs.set(entry.file, bytes);
  }
}

const result = await build();
const definition = JSON.parse(result.textOutputs.get(relativeOutputs.definition));
const packageText = Buffer.concat([...result.textOutputs.values()].map(value => Buffer.from(value))).toString('utf8');
if (definition.properties.definition.triggers && Object.keys(definition.properties.definition.triggers).length !== 0)
  throw new Error('TENANT_LAYER_FLOW_NOT_TRIGGERLESS');
if (Object.keys(definition.properties.connectionReferences || {}).length !== 0
  || Object.keys(definition.properties.definition.parameters.$connections.defaultValue || {}).length !== 0)
  throw new Error('TENANT_LAYER_FLOW_NOT_UNBOUND');
if (/https:\/\/[^"' ]+\.sharepoint\.com\/sites\/|Default-[0-9a-f]{8}-|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(packageText))
  throw new Error('TENANT_LAYER_SOURCE_CONTAINS_TARGET_OR_PERSONAL_BINDING');

const executableManifestSha256 = hash(result.textOutputs.get(relativeOutputs.manifest));
const nextSource = Buffer.concat([priorSource.subarray(0, priorIdentity.offset),
  Buffer.from(executableManifestSha256, 'ascii'), priorSource.subarray(priorIdentity.offset + 64)]);
const outputs = [...result.textOutputs, ...result.binaryOutputs].map(([relative, value]) =>
  [relative, Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8')]);
if (mode === '--write') {
  if (!(await readFile(executablePreflightPath)).equals(priorSource)
    || !(await readFile(join(tenantRoot, relativeOutputs.manifest))).equals(priorManifest))
    throw new Error('TENANT_LAYER_PRIOR_STATE_CHANGED');
  for (const [relative, bytes] of priorOutputs) {
    if (!(await readFile(join(tenantRoot, relative))).equals(bytes))
      throw new Error(`TENANT_LAYER_PRIOR_STATE_CHANGED: ${relative}`);
  }
  for (const [relative, bytes] of outputs) {
    const path = join(tenantRoot, relative);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
  await writeFile(executablePreflightPath, nextSource);
} else if (priorIdentity.sha256 !== executableManifestSha256) {
  throw new Error(`TENANT_LAYER_EXECUTABLE_MANIFEST_IDENTITY_MISMATCH: generated=${executableManifestSha256}; executable=${priorIdentity.sha256}`);
}
for (const [relative, bytes] of outputs) {
  if (!(await readFile(join(tenantRoot, relative))).equals(bytes))
    throw new Error(`TENANT_LAYER_GENERATION_MISMATCH: ${relative}`);
}
if (!(await readFile(executablePreflightPath)).equals(mode === '--write' ? nextSource : priorSource))
  throw new Error('TENANT_LAYER_EXECUTABLE_SOURCE_READBACK_MISMATCH');

process.stdout.write(`${JSON.stringify({
  mode, valid: true, deterministic: true, disabled: true, triggerCount: 0, connectionReferenceCount: 0,
  schemaListCount: schemaContract.lists.length,
  schemaFieldCount: schemaContract.lists.reduce((total, list) => total + list.fields.length, 0),
  productRowCount: 0, packageBytes: result.packageBytes.length, packageSha256: hash(result.packageBytes),
  manifestSha256: hash(result.textOutputs.get(relativeOutputs.manifest)), executableManifestSha256
}, null, 2)}\n`);
