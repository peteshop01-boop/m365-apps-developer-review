import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const identity = Object.freeze({
  solutionUniqueName: 'KCFKPIOptionESubmitV1',
  solutionDisplayName: 'KCF KPI Option E Submit v1',
  version: '1.0.3.0',
  workflowUniqueName: 'KCFKPIOptionESubmitProcessorV1',
  workflowDisplayName: 'KCF KPI Option E Submit Processor v1',
  workflowId: 'c583eeae-ad13-4e91-ac90-88f908d7ebf4',
  publisher: 'KCFKPI', prefix: 'kcfkpi'
});
const relative = Object.freeze({
  binding: 'Configuration/option-e-submit.binding.template.json',
  definition: 'Definitions/option-e-submit.disabled.definition.json',
  contentTypes: 'PackageSource/[Content_Types].xml',
  customizations: 'PackageSource/Other/Customizations.xml',
  solution: 'PackageSource/Other/Solution.xml',
  workflow: `PackageSource/Workflows/${identity.workflowUniqueName}-${identity.workflowId}.json`,
  workflowData: `PackageSource/Workflows/${identity.workflowUniqueName}-${identity.workflowId}.json.data.xml`,
  package: `Package/${identity.solutionUniqueName}_${identity.version.replace(/\./g, '_')}.zip`,
  manifest: 'option-e-submit-manifest.json'
});
const serialise = value => `${JSON.stringify(value, null, 2)}\n`;
const xml = value => `${value.trim()}\n`;
const hash = value => createHash('sha256').update(value).digest('hex').toUpperCase();

const contentTypes = xml(`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/octet-stream" />
  <Default Extension="json" ContentType="application/octet-stream" />
</Types>`);
const customizations = xml(`<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <Entities /><Roles /><Workflows /><FieldSecurityProfiles /><Templates /><EntityMaps />
  <EntityRelationships /><OrganizationSettings /><optionsets /><CustomControls /><EntityDataProviders />
  <connectionreferences>
    <connectionreference connectionreferencelogicalname="kcfkpi_optione_contentprocessor_sp">
      <connectorid>/providers/Microsoft.PowerApps/apis/shared_sharepointonline</connectorid>
      <connectionreferencedisplayname>KCF KPI Option E Content Processor SharePoint</connectionreferencedisplayname>
      <connectionid xsi:nil="true" />
    </connectionreference>
    <connectionreference connectionreferencelogicalname="kcfkpi_optione_aclreconciler_sp">
      <connectorid>/providers/Microsoft.PowerApps/apis/shared_sharepointonline</connectorid>
      <connectionreferencedisplayname>KCF KPI Option E ACL Reconciler SharePoint</connectionreferencedisplayname>
      <connectionid xsi:nil="true" />
    </connectionreference>
  </connectionreferences>
  <Languages><Language>1033</Language></Languages>
</ImportExportXml>`);
const solution = xml(`<?xml version="1.0" encoding="utf-8"?>
<ImportExportXml version="9.2" SolutionPackageVersion="9.2" languagecode="1033" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <SolutionManifest>
    <UniqueName>${identity.solutionUniqueName}</UniqueName>
    <LocalizedNames><LocalizedName description="${identity.solutionDisplayName}" languagecode="1033" /></LocalizedNames>
    <Descriptions /><Version>${identity.version}</Version><Managed>0</Managed>
    <Publisher>
      <UniqueName>${identity.publisher}</UniqueName>
      <LocalizedNames><LocalizedName description="KCF KPI" languagecode="1033" /></LocalizedNames>
      <Descriptions /><EMailAddress xsi:nil="true" /><SupportingWebsiteUrl xsi:nil="true" />
      <CustomizationPrefix>${identity.prefix}</CustomizationPrefix><CustomizationOptionValuePrefix>62000</CustomizationOptionValuePrefix><Addresses />
    </Publisher>
    <RootComponents>
      <RootComponent type="29" id="{${identity.workflowId}}" behavior="0" />
      <RootComponent type="371" schemaName="kcfkpi_optione_contentprocessor_sp" behavior="0" />
      <RootComponent type="371" schemaName="kcfkpi_optione_aclreconciler_sp" behavior="0" />
    </RootComponents>
    <MissingDependencies />
  </SolutionManifest>
</ImportExportXml>`);
const workflowData = xml(`<?xml version="1.0" encoding="utf-8"?>
<Workflow WorkflowId="{${identity.workflowId}}" Name="${identity.workflowDisplayName}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <JsonFileName>/Workflows/${identity.workflowUniqueName}-${identity.workflowId}.json</JsonFileName>
  <Type>1</Type><Subprocess>0</Subprocess><Category>5</Category><Mode>0</Mode><Scope>4</Scope>
  <OnDemand>0</OnDemand><TriggerOnCreate>0</TriggerOnCreate><TriggerOnDelete>0</TriggerOnDelete>
  <AsyncAutodelete>0</AsyncAutodelete><SyncWorkflowLogOnFailure>0</SyncWorkflowLogOnFailure>
  <StateCode>0</StateCode><StatusCode>1</StatusCode><RunAs>1</RunAs><IsTransacted>1</IsTransacted>
  <IntroducedVersion>${identity.version}</IntroducedVersion><IsCustomizable>1</IsCustomizable>
  <BusinessProcessType>0</BusinessProcessType><IsCustomProcessingStepAllowedForOtherPublishers>1</IsCustomProcessingStepAllowedForOtherPublishers>
  <ModernFlowType>0</ModernFlowType><PrimaryEntity>none</PrimaryEntity>
  <LocalizedNames><LocalizedName languagecode="1033" description="${identity.workflowDisplayName}" /></LocalizedNames>
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
const deterministicZip = entries => {
  const local = []; const central = []; let offset = 0;
  const sorted = [...entries].sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of sorted) {
    if (entry.name.startsWith('/') || entry.name.includes('..') || entry.name.includes('\\')) throw new Error(`UNSAFE_ZIP_PATH:${entry.name}`);
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const crc = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); localHeader.writeUInt16LE(20, 4); localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(0, 8); localHeader.writeUInt16LE(0, 10); localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(crc, 14); localHeader.writeUInt32LE(data.length, 18); localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26); localHeader.writeUInt16LE(0, 28); local.push(localHeader, name, data);
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
};

const buildExecutableDefinition = () => {
  const contentRef = 'kcfkpi_optione_contentprocessor_sp';
  const aclRef = 'kcfkpi_optione_aclreconciler_sp';
  const apiId = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline';
  const after = name => ({ [name]: ['Succeeded'] });
  const afterAny = name => ({ [name]: ['Succeeded', 'Failed', 'TimedOut'] });
  const http = (connectionName, method, uri, body, runAfter = {}, headers = {}) => {
    const parameters = {
      dataset: "@parameters('siteUrl')", 'parameters/method': method, 'parameters/uri': uri,
      'parameters/headers': {
        Accept: 'application/json;odata=nometadata',
        ...(method === 'POST' || method === 'PATCH' ? { 'Content-Type': 'application/json;odata=nometadata' } : {}),
        ...headers
      }
    };
    if (body !== undefined) parameters['parameters/body'] = body;
    return {
      type: 'OpenApiConnection',
      inputs: { host: { apiId, connectionName, operationId: 'HttpRequest' }, parameters, retryPolicy: { type: 'none' } },
      runAfter
    };
  };
  const condition = (expression, actions, elseActions = {}, runAfter = {}) => ({
    type: 'If', expression, actions, else: { actions: elseActions }, runAfter
  });
  const scope = (actions, runAfter = {}) => ({ type: 'Scope', actions, runAfter });
  const foreach = (items, actions, runAfter = {}) => ({
    type: 'Foreach', foreach: items, actions, runAfter,
    runtimeConfiguration: { concurrency: { repetitions: 1 } }
  });
  const setVariable = (name, value, runAfter = {}) => ({ type: 'SetVariable', inputs: { name, value }, runAfter });
  const appendVariable = (name, value, runAfter = {}) => ({
    type: 'AppendToArrayVariable', inputs: { name, value }, runAfter
  });
  const incrementVariable = (name, value, runAfter = {}) => ({
    type: 'IncrementVariable', inputs: { name, value }, runAfter
  });
  const terminate = (code, message, runAfter = {}) => ({
    type: 'Terminate', inputs: { runStatus: 'Failed', runError: { code, message } }, runAfter
  });
  const eq = (left, right) => ({ equals: [left, right] });
  const and = (...items) => ({ and: items });
  const or = (...items) => ({ or: items });
  const failure = (tag, code, intent = 'RecoveryHold') => ({
    [`Set_${tag}_FailureCode`]: setVariable('FailureCode', code),
    [`Set_${tag}_TerminalIntent`]: setVariable('TerminalIntent', intent, after(`Set_${tag}_FailureCode`))
  });
  const operationQuery = "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmitOperations'],''')/items?$filter=OperationKey eq ''',uriComponent(variables('OperationKey')),'''&$top=2')";
  const snapshotQuery = "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmittedSnapshots'],''')/items?$filter=SnapshotKey eq ''',uriComponent(variables('SnapshotKey')),'''&$top=2')";
  const auditQuery = "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_Audit'],''')/items?$filter=AuditKey eq ''',uriComponent(variables('AuditKey')),'''&$top=2')";
  const snapshotCheckpointNames = ['SnapshotWritten', 'AuditWritten', 'ControlPointed', 'AclVerified', 'Completed'];
  const auditCheckpointNames = ['AuditWritten', 'ControlPointed', 'AclVerified', 'Completed'];
  const canonicalOperationCheckpoint = "@first(body('Canonical_Read_Operation')?['value'])?['Checkpoint']";
  const canonicalOperationOutcome = "@first(body('Canonical_Read_Operation')?['value'])?['Outcome']";
  const canonicalOperationField = field => `@first(body('Canonical_Read_Operation')?['value'])?['${field}']`;
  const protectedControlField = field => `@first(body('Read_Protected_Workplan_Control')?['value'])?['${field}']`;
  const protectedDraftLikeState = or(
    eq(protectedControlField('State'), 'Draft'),
    eq(protectedControlField('State'), 'ChangesRequested')
  );
  const protectedClaimedState = and(
    protectedDraftLikeState,
    eq(protectedControlField('TransitionStatus'), 'Submitting'),
    eq(protectedControlField('PendingRequestKey'), "@variables('RequestKey')"),
    eq(protectedControlField('LastOperationKey'), "@variables('OperationKey')")
  );
  const protectedPointedState = and(
    eq(protectedControlField('State'), 'Submitted'),
    eq(protectedControlField('TransitionStatus'), 'AclPending'),
    eq(protectedControlField('CurrentSubmittedSnapshotKey'), "@variables('SnapshotKey')"),
    eq(protectedControlField('PendingRequestKey'), "@variables('RequestKey')"),
    eq(protectedControlField('LastOperationKey'), "@variables('OperationKey')")
  );
  const protectedReadyState = and(
    eq(protectedControlField('State'), 'Submitted'),
    eq(protectedControlField('TransitionStatus'), 'Ready'),
    eq(protectedControlField('CurrentSubmittedSnapshotKey'), "@variables('SnapshotKey')"),
    eq(protectedControlField('PendingRequestKey'), ''),
    eq(protectedControlField('LastOperationKey'), "@variables('OperationKey')"),
    eq(protectedControlField('AclEpoch'), protectedControlField('HierarchyEpoch'))
  );
  const protectedControlEtagMatchesOperation = eq(
    canonicalOperationField('ObservedControlETag'), protectedControlField('@odata.etag')
  );
  const canonicalSnapshot = readName => and(
    eq(`@length(body('${readName}')?['value'])`, 1),
    eq(`@first(body('${readName}')?['value'])?['SnapshotKey']`, "@variables('SnapshotKey')"),
    eq(`@first(body('${readName}')?['value'])?['RequestKey']`, "@variables('RequestKey')"),
    eq(`@first(body('${readName}')?['value'])?['PersonKey']`, "@body('Read_Request_A')?['PersonKey']"),
    eq(`@first(body('${readName}')?['value'])?['PerformanceYear']`, "@body('Read_Request_A')?['PerformanceYear']"),
    eq(`@first(body('${readName}')?['value'])?['WorkplanKey']`, "@body('Read_Request_A')?['WorkplanKey']"),
    eq(`@first(body('${readName}')?['value'])?['PayloadJSON']`, "@body('Read_Request_A')?['PayloadJSON']"),
    eq(`@first(body('${readName}')?['value'])?['PayloadSHA256']`, "@body('Read_Request_A')?['PayloadSHA256']"),
    eq(`@first(body('${readName}')?['value'])?['SourceDraftItemID']`, "@body('Read_Request_A')?['DraftItemID']"),
    eq(`@first(body('${readName}')?['value'])?['SourceDraftETag']`, "@body('Read_Request_A')?['DraftETag']"),
    eq(`@first(body('${readName}')?['value'])?['SourceDraftVersion']`, "@body('Read_Request_A')?['DraftVersion']"),
    eq(`@first(body('${readName}')?['value'])?['RequestItemID']`, "@body('Read_Request_A')?['ID']"),
    eq(`@first(body('${readName}')?['value'])?['RequestETag']`, "@body('Read_Request_A')?['@odata.etag']"),
    eq(`@first(body('${readName}')?['value'])?['AuthenticatedEmployeePersonKey']`, "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']"),
    eq(`@first(body('${readName}')?['value'])?['AuthenticatedEmployeeEmail']`, "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['Email']"),
    eq(`@first(body('${readName}')?['value'])?['ManagerPersonKey']`, "@first(body('Read_Current_Manager_From_People')?['value'])?['PersonKey']"),
    eq(`@first(body('${readName}')?['value'])?['ManagerEmail']`, "@first(body('Read_Current_Manager_From_People')?['value'])?['Email']"),
    eq(`@first(body('${readName}')?['value'])?['HierarchyEpoch']`, "@variables('HierarchyEpoch')"),
    eq(`@first(body('${readName}')?['value'])?['FrameworkSnapshotJSON']`, "@string(createArray(body('Read_Current_Behaviour_Framework_Set')?['value'],body('Read_Current_Behaviour_Framework_Values')?['value'],body('Read_Current_Person_Behaviour_Assignment')?['value'],body('Read_Current_Behaviour_Prompts')?['value']))"),
    eq(`@first(body('${readName}')?['value'])?['CatalogueSnapshotJSON']`, "@string(createArray(body('Read_Current_Core_KPI_References')?['value'],body('Read_Current_Core_Target_References')?['value']))")
  );
  const canonicalAudit = (readName, expectedEventAt) => and(
    eq(`@length(body('${readName}')?['value'])`, 1),
    eq(`@first(body('${readName}')?['value'])?['AuditKey']`, "@variables('AuditKey')"),
    eq(`@first(body('${readName}')?['value'])?['EventType']`, 'WorkplanSubmitted'),
    eq(`@first(body('${readName}')?['value'])?['SubjectKey']`, "@body('Read_Request_A')?['WorkplanKey']"),
    eq(`@first(body('${readName}')?['value'])?['PerformanceYear']`, "@body('Read_Request_A')?['PerformanceYear']"),
    eq(`@first(body('${readName}')?['value'])?['ActorEmail']`, "@body('Read_Request_A')?['Author/EMail']"),
    eq(`@first(body('${readName}')?['value'])?['ActorRole']`, 'Employee'),
    eq(`@length(match(string(first(body('${readName}')?['value'])?['EventAt']),'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'))`, 1),
    eq(`@length(match(string(first(body('${readName}')?['value'])?['Created']),'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'))`, 1),
    { lessOrEquals: [`@div(abs(sub(ticks(first(body('${readName}')?['value'])?['EventAt']),ticks(first(body('${readName}')?['value'])?['Created']))),10000)`, 300000] },
    eq(`@first(body('${readName}')?['value'])?['EventAt']`, expectedEventAt),
    eq(`@first(body('${readName}')?['value'])?['CorrelationKey']`, "@variables('RequestKey')"),
    eq(`@first(body('${readName}')?['value'])?['Source']`, 'KCFKPIOptionESubmitProcessorV1'),
    eq(`@first(body('${readName}')?['value'])?['SourceReference']`, "@variables('RequestKey')"),
    eq(`@first(body('${readName}')?['value'])?['Success']`, true),
    eq(`@first(body('${readName}')?['value'])?['RequestKey']`, "@variables('RequestKey')"),
    eq(`@first(body('${readName}')?['value'])?['SnapshotKey']`, "@variables('SnapshotKey')"),
    eq(`@first(body('${readName}')?['value'])?['PayloadSHA256']`, "@body('Read_Request_A')?['PayloadSHA256']"),
    eq(`@first(body('${readName}')?['value'])?['ActorPersonKey']`, "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']"),
    eq(`@first(body('${readName}')?['value'])?['ProcessorIdentity']`, 'KCFKPIOptionESubmitProcessorV1')
  );
  const stableIdPattern = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$';
  const draftTargetSchema = {
    type: 'object', additionalProperties: false,
    properties: {
      value: { type: ['string', 'number'] }, success: { type: 'string' }
    }
  };
  const draftPayloadSchema = {
    type: 'object', additionalProperties: false,
    required: ['schemaVersion', 'core', 'impact', 'behaviours'],
    properties: {
      schemaVersion: { type: 'string', enum: ['kcf.workplan-draft/v1'] },
      core: {
        type: 'object', additionalProperties: false, required: ['weightingMode', 'entries'],
        properties: {
          weightingMode: { type: 'string', enum: ['Equal', 'Custom'] },
          entries: { type: 'array', items: {
            type: 'object', additionalProperties: false,
            required: ['coreId', 'kpiId', 'kpiVersionKey', 'targetVersionKey', 'role', 'contributionMethod',
              'weightPercent', 'annual', 'q1', 'q2', 'q3', 'q4'],
            properties: {
              coreId: { type: 'string', pattern: stableIdPattern },
              kpiId: { type: 'string', pattern: stableIdPattern },
              kpiVersionKey: { type: 'string', minLength: 1 },
              targetVersionKey: { type: 'string', minLength: 1 },
              role: { type: 'string', enum: ['Owner', 'Delivery', 'Support'] },
              contributionMethod: { type: 'string', enum: ['AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight'] },
              weightPercent: { type: 'number', minimum: 0, multipleOf: 0.01 },
              annual: draftTargetSchema, q1: draftTargetSchema, q2: draftTargetSchema,
              q3: draftTargetSchema, q4: draftTargetSchema
            }
          } }
        }
      },
      impact: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        required: ['impactId', 'wording', 'measure', 'unit', 'success'],
        properties: {
          impactId: { type: 'string', pattern: stableIdPattern }, wording: { type: 'string', minLength: 1 },
          measure: { type: 'string', minLength: 1 }, unit: { type: 'string' }, success: { type: 'string' },
          annual: { type: ['string', 'number'] }, q1: { type: ['string', 'number'] },
          q2: { type: ['string', 'number'] }, q3: { type: ['string', 'number'] }, q4: { type: ['string', 'number'] }
        }
      } },
      behaviours: {
        type: 'object', additionalProperties: false, required: ['frameworkVersion', 'roleTier', 'entries'],
        properties: {
          frameworkVersion: { type: 'string', enum: ['KCCC-BEHAVIOUR|v02'] },
          roleTier: { type: 'string', enum: ['IC_OFFICER', 'PEOPLE_MANAGER', 'SENIOR_LEADER'] },
          entries: { type: 'array', minItems: 5, maxItems: 5, items: {
            type: 'object', additionalProperties: false,
            required: ['valueId', 'descriptorKey', 'guidancePromptKeys', 'selectedPromptKeys', 'commitment', 'periodCommitments'],
            properties: {
              valueId: { type: 'string', enum: ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] },
              descriptorKey: { type: 'string', minLength: 1 },
              guidancePromptKeys: { type: 'array', minItems: 5, maxItems: 5, uniqueItems: true,
                items: { type: 'string', minLength: 1 } },
              selectedPromptKeys: { type: 'array', uniqueItems: true, items: { type: 'string', minLength: 1 } },
              commitment: { type: 'string' },
              periodCommitments: { type: 'object', additionalProperties: false,
                required: ['Q1', 'Q2', 'Q3', 'Q4'], properties: {
                  Q1: { type: 'string' }, Q2: { type: 'string' }, Q3: { type: 'string' }, Q4: { type: 'string' }
                } }
            }
          } }
        }
      }
    }
  };
  const advance = (tag, checkpoint, observedEtag, runAfter = {}) => {
    const patchName = `Patch_Operation_${tag}`;
    const readName = `Read_Operation_${tag}`;
    const proofName = `Prove_Operation_${tag}`;
    return scope({
      [patchName]: http(contentRef, 'PATCH', "@variables('OperationItemUri')", {
        Checkpoint: checkpoint, Outcome: checkpoint === 'Completed' ? 'Completed' : 'Running',
        ObservedControlETag: observedEtag,
        ...(checkpoint === 'SnapshotWritten' ? { CreatedSnapshotKey: "@variables('SnapshotKey')" } : {}),
        ...(checkpoint === 'AuditWritten' ? {
          CreatedAuditKey: "@variables('AuditKey')",
          CreatedAuditEventAt: "@variables('TrustedAuditEventAt')"
        } : {})
      }, {}, { 'If-Match': "@variables('ExactOperationETag')" }),
      [readName]: http(contentRef, 'GET', operationQuery, undefined, afterAny(patchName)),
      [proofName]: condition(and(
        eq(`@length(body('${readName}')?['value'])`, 1),
        eq(`@first(body('${readName}')?['value'])?['Checkpoint']`, checkpoint),
        eq(`@first(body('${readName}')?['value'])?['Outcome']`, checkpoint === 'Completed' ? 'Completed' : 'Running'),
        eq(`@first(body('${readName}')?['value'])?['OperationKey']`, "@variables('OperationKey')"),
        eq(`@first(body('${readName}')?['value'])?['RequestKey']`, "@variables('RequestKey')"),
        eq(`@first(body('${readName}')?['value'])?['WorkplanKey']`, "@body('Read_Request_A')?['WorkplanKey']"),
        eq(`@first(body('${readName}')?['value'])?['PersonKey']`, "@body('Read_Request_A')?['PersonKey']"),
        eq(`@first(body('${readName}')?['value'])?['PerformanceYear']`, "@body('Read_Request_A')?['PerformanceYear']"),
        eq(`@first(body('${readName}')?['value'])?['ProcessorIdentity']`, 'KCFKPIOptionESubmitProcessorV1'),
        eq(`@first(body('${readName}')?['value'])?['ExpectedControlETag']`, "@variables('ExpectedOperationControlETag')"),
        eq(`@first(body('${readName}')?['value'])?['ErrorCode']`, null),
        eq(`@first(body('${readName}')?['value'])?['ErrorDetail']`, null),
        eq(`@first(body('${readName}')?['value'])?['ObservedControlETag']`, observedEtag),
        { not: eq(`@first(body('${readName}')?['value'])?['@odata.etag']`, "@variables('ExactOperationETag')") }
      ), {
        [`Set_${tag}_Checkpoint`]: setVariable('Checkpoint', checkpoint),
        [`Set_${tag}_DurableOutcome`]: setVariable('DurableOutcome',
          checkpoint === 'Completed' ? 'Completed' : 'Running', after(`Set_${tag}_Checkpoint`)),
        [`Set_${tag}_OperationETag`]: setVariable('ExactOperationETag',
          `@first(body('${readName}')?['value'])?['@odata.etag']`, after(`Set_${tag}_DurableOutcome`))
      }, failure(tag, `${tag}CheckpointReadbackMismatch`), after(readName))
    }, runAfter);
  };
  const actions = {};
  const initialVariables = [
    ['RequestKey', 'string', "@triggerBody()?['RequestKey']"],
    ['OperationKey', 'string', "@triggerBody()?['RequestKey']"],
    ['SnapshotKey', 'string', "@triggerBody()?['RequestKey']"],
    ['AuditKey', 'string', "@concat(triggerBody()?['RequestKey'],'|WorkplanSubmitted')"],
    ['Checkpoint', 'string', ''], ['DurableOutcome', 'string', ''], ['FailureCode', 'string', ''], ['TerminalIntent', 'string', ''],
    ['DraftItemUri', 'string', ''], ['SnapshotItemUri', 'string', ''],
    ['ProtectedControlItemUri', 'string', ''], ['OperationItemUri', 'string', ''],
    ['ExactControlETag', 'string', ''], ['ExactOperationETag', 'string', ''],
    ['ExpectedOperationControlETag', 'string', ''],
    ['HierarchyEpoch', 'integer', 0], ['AclEpoch', 'integer', 0],
    ['SubmittedPromptCoordinates', 'array', []],
    ['AclCanonicalSiteUrl', 'string', "@if(endsWith(parameters('siteUrl'),'/'),substring(parameters('siteUrl'),0,sub(length(parameters('siteUrl')),1)),parameters('siteUrl'))"],
    ['AclExpectedCollectionUri', 'string', ''], ['AclContinuationUri', 'string', ''],
    ['AclPageValues', 'array', []], ['AclSeenContinuations', 'array', []], ['AclPageCount', 'integer', 0],
    ['FreshAclProofValid', 'boolean', false], ['TrustedAuditEventAt', 'string', '']
  ];
  let previous;
  for (const [name, type, value] of initialVariables) {
    const actionName = `Initialize_${name}`;
    actions[actionName] = {
      type: 'InitializeVariable', inputs: { variables: [{ name, type, value }] },
      runAfter: previous ? after(previous) : {}
    };
    previous = actionName;
  }

  const tryActions = {};
  tryActions.Read_Request_A = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmitRequests'],''')/items(',triggerBody()?['ID'],')?$expand=Author')");
  tryActions.Read_Request_B = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmitRequests'],''')/items(',triggerBody()?['ID'],')?$expand=Author')",
    undefined, after('Read_Request_A'));
  tryActions.Parse_Immutable_Request_Payload = {
    type: 'ParseJson',
    inputs: {
      content: "@body('Read_Request_A')?['PayloadJSON']",
      schema: draftPayloadSchema
    },
    runAfter: after('Read_Request_B')
  };
  tryActions.Set_PackagedPayload_FailureCode = setVariable('FailureCode', 'RequestPayloadInvalid', {
    Parse_Immutable_Request_Payload: ['Failed', 'TimedOut']
  });
  tryActions.Set_PackagedPayload_TerminalIntent = setVariable(
    'TerminalIntent', 'FailClosedNoTerminal', after('Set_PackagedPayload_FailureCode')
  );
  tryActions.Compose_Canonical_Payload_JSON = {
    type: 'Compose', inputs: "@string(body('Parse_Immutable_Request_Payload'))",
    runAfter: after('Parse_Immutable_Request_Payload')
  };
  tryActions.Compose_Payload_UTF8_Byte_Length = {
    type: 'Compose',
    inputs: "@length(base64ToBinary(base64(body('Read_Request_A')?['PayloadJSON'])))",
    runAfter: after('Compose_Canonical_Payload_JSON')
  };
  tryActions.Select_Item_IDs = {
    type: 'Select', inputs: { from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']", select: "@item()?['coreId']" },
    runAfter: after('Compose_Payload_UTF8_Byte_Length')
  };
  tryActions.Select_Behaviour_IDs = {
    type: 'Select', inputs: { from: "@body('Parse_Immutable_Request_Payload')?['behaviours']?['entries']", select: "@item()?['valueId']" },
    runAfter: after('Select_Item_IDs')
  };
  tryActions.Filter_Invalid_Core_Separation = {
    type: 'Query', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']",
      where: "@or(not(contains(createArray('Owner','Delivery','Support'),item()?['role'])),not(contains(createArray('AdditiveDirect','SharedTarget','WeightedDenominator','AccountableOwner','CompletionOversight'),item()?['contributionMethod'])))"
    }, runAfter: after('Select_Behaviour_IDs')
  };
  tryActions.Filter_Invalid_Personal_Core_Fields = {
    type: 'Query', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']",
      where: "@or(empty(trim(string(item()?['kpiId']))),empty(trim(string(item()?['kpiVersionKey']))),empty(trim(string(item()?['targetVersionKey']))))"
    }, runAfter: after('Filter_Invalid_Core_Separation')
  };
  tryActions.Filter_Invalid_Custom_Allocations = {
    type: 'Query', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']",
      where: "@or(less(float(item()?['weightPercent']),0),greater(float(item()?['weightPercent']),100),not(equals(mul(float(item()?['weightPercent']),100),int(mul(float(item()?['weightPercent']),100)))))"
    }, runAfter: after('Filter_Invalid_Personal_Core_Fields')
  };
  tryActions.Filter_Invalid_Equal_Allocations = {
    type: 'Query', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']",
      where: "@and(equals(body('Parse_Immutable_Request_Payload')?['core']?['weightingMode'],'Equal'),not(equals(float(item()?['weightPercent']),int(float(item()?['weightPercent'])))))"
    }, runAfter: after('Filter_Invalid_Custom_Allocations')
  };
  tryActions.Select_Custom_Allocation_Percents = {
    type: 'Select', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']",
      select: "@int(mul(float(item()?['weightPercent']),100))"
    }, runAfter: after('Filter_Invalid_Equal_Allocations')
  };
  tryActions.Filter_Invalid_Behaviour_Value_Order = {
    type: 'Query', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['behaviours']?['entries']",
      where: "@not(contains(createArray('BHV-01','BHV-02','BHV-03','BHV-04','BHV-05'),item()?['valueId']))"
    }, runAfter: after('Select_Custom_Allocation_Percents')
  };
  tryActions.Filter_Invalid_Behaviour_Commitments = {
    type: 'Query', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['behaviours']?['entries']",
      where: "@or(empty(trim(string(item()?['descriptorKey']))),not(equals(item()?['descriptorKey'],concat(body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion'],'|',body('Parse_Immutable_Request_Payload')?['behaviours']?['roleTier'],'|',item()?['valueId']))))"
    }, runAfter: after('Filter_Invalid_Behaviour_Value_Order')
  };
  tryActions.Validate_Selected_Prompts_Are_Guidance = foreach(
    "@body('Parse_Immutable_Request_Payload')?['behaviours']?['entries']", {
      Filter_Selected_Prompt_Outside_Guidance: {
        type: 'Query', inputs: {
          from: "@items('Validate_Selected_Prompts_Are_Guidance')?['selectedPromptKeys']",
          where: "@not(contains(items('Validate_Selected_Prompts_Are_Guidance')?['guidancePromptKeys'],item()))"
        }
      },
      Selected_Prompts_Are_Exact_Guidance_Subset: condition(
        eq("@length(body('Filter_Selected_Prompt_Outside_Guidance'))", 0),
        { Selected_Prompt_Subset_Valid: { type: 'Compose', inputs: true, runAfter: {} } },
        failure('SelectedPromptSubset', 'RequestPayloadInvalid'), after('Filter_Selected_Prompt_Outside_Guidance')
      )
    }, after('Filter_Invalid_Behaviour_Commitments')
  );
  tryActions.Packaged_Payload_Semantics_Are_Valid = condition(and(
    eq("@body('Read_Request_A')?['PayloadJSON']", "@outputs('Compose_Canonical_Payload_JSON')"),
    { lessOrEquals: ["@outputs('Compose_Payload_UTF8_Byte_Length')", 56000] },
    eq("@length(body('Select_Item_IDs'))", "@length(union(body('Select_Item_IDs'),body('Select_Item_IDs')))"),
    eq("@length(body('Select_Behaviour_IDs'))", "@length(union(body('Select_Behaviour_IDs'),body('Select_Behaviour_IDs')))"),
    eq("@length(body('Filter_Invalid_Core_Separation'))", 0),
    eq("@length(body('Filter_Invalid_Personal_Core_Fields'))", 0),
    eq("@length(body('Filter_Invalid_Custom_Allocations'))", 0),
    eq("@length(body('Filter_Invalid_Equal_Allocations'))", 0),
    or(
      eq("@length(body('Select_Custom_Allocation_Percents'))", 0),
      eq("@sum(body('Select_Custom_Allocation_Percents'))", 10000)
    ),
    eq("@length(body('Filter_Invalid_Behaviour_Value_Order'))", 0),
    eq("@string(sort(body('Select_Behaviour_IDs')))", "@string(createArray('BHV-01','BHV-02','BHV-03','BHV-04','BHV-05'))"),
    eq("@length(body('Filter_Invalid_Behaviour_Commitments'))", 0)
  ), {
    Payload_Semantics_Validated: {
      type: 'Compose', inputs: {
        maximumUtf8Bytes: 56000, stableAndUniqueIds: true, savedDraftAggregate: 'kcf.workplan-draft/v1',
        canonicalPayload: 'DuplicateKeysRejectedByExactCanonicalByteComparison',
        allocationRules: 'EqualOrCustomExactly10000BasisPoints', behaviours: 5,
        validationCodes: ['DraftPayloadInvalid', 'PayloadNotCanonical', 'DuplicateStableId', 'CoreWeightsMustTotal100']
      }, runAfter: {}
    }
  }, failure('PackagedPayloadSemantic', 'RequestPayloadInvalid', 'FailClosedNoTerminal'),
  after('Validate_Selected_Prompts_Are_Guidance'));
  tryActions.Read_Actor_From_Native_Created_By = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_People'],''')/items?$filter=Active eq 1 and Email eq ''',uriComponent(body('Read_Request_A')?['Author/EMail']),'''&$top=2')",
    undefined, after('Packaged_Payload_Semantics_Are_Valid'));
  tryActions.Read_Authoritative_Draft_A = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanDrafts'],''')/items?$filter=ID eq ',string(body('Read_Request_A')?['DraftItemID']),'&$top=2')",
    undefined, after('Read_Actor_From_Native_Created_By'));
  tryActions.Read_Authoritative_Draft_B = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanDrafts'],''')/items?$filter=ID eq ',string(body('Read_Request_A')?['DraftItemID']),'&$top=2')",
    undefined, after('Read_Authoritative_Draft_A'));
  tryActions.Read_Protected_Workplan_Control = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_Workplans'],''')/items?$filter=PersonKey eq ''',uriComponent(first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']),''' and DraftItemID eq ',string(body('Read_Request_A')?['DraftItemID']),'&$top=2')",
    undefined, after('Read_Authoritative_Draft_B'));
  tryActions.Read_Current_Manager_From_People = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_People'],''')/items?$filter=Active eq 1 and PersonKey eq ''',uriComponent(first(body('Read_Actor_From_Native_Created_By')?['value'])?['ManagerPersonKey']),'''&$top=2')",
    undefined, after('Read_Protected_Workplan_Control'));
  tryActions.Read_Current_Core_KPI_References = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_KPIMaster'],''')/items?$filter=Active eq 1&$top=5000')",
    undefined, after('Read_Current_Manager_From_People'));
  tryActions.Read_Current_Core_Target_References = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_AnnualTargets'],''')/items?$filter=Status eq ''Approved'' and PerformanceYear eq ''',string(body('Read_Request_A')?['PerformanceYear']),'''&$top=5000')",
    undefined, after('Read_Current_Core_KPI_References'));
  tryActions.Read_Current_Behaviour_Framework_Set = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_BehaviourFrameworkSets'],''')/items?$filter=FrameworkVersion eq ''',uriComponent(body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion']),''' and Published eq 1 and Immutable eq 1&$top=2')",
    undefined, after('Read_Current_Core_Target_References'));
  tryActions.Read_Current_Behaviour_Framework_Values = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_BehaviourFrameworkValues'],''')/items?$filter=FrameworkVersion eq ''',uriComponent(body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion']),'''&$top=5000')",
    undefined, after('Read_Current_Behaviour_Framework_Set'));
  tryActions.Read_Current_Person_Behaviour_Assignment = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_PersonBehaviourAssignments'],''')/items?$filter=PersonKey eq ''',uriComponent(first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']),''' and FrameworkVersion eq ''',uriComponent(body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion']),''' and Active eq 1&$top=2')",
    undefined, after('Read_Current_Behaviour_Framework_Values'));
  tryActions.Read_Current_Behaviour_Prompts = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_BehaviourObjectiveLibrary'],''')/items?$filter=Active eq 1&$top=5000')",
    undefined, after('Read_Current_Person_Behaviour_Assignment'));
  tryActions.Read_Current_Core_KPI_References_B = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_KPIMaster'],''')/items?$filter=Active eq 1&$top=5000')",
    undefined, after('Read_Current_Behaviour_Prompts'));
  tryActions.Read_Current_Core_Target_References_B = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_AnnualTargets'],''')/items?$filter=Status eq ''Approved'' and PerformanceYear eq ''',string(body('Read_Request_A')?['PerformanceYear']),'''&$top=5000')",
    undefined, after('Read_Current_Core_KPI_References_B'));
  tryActions.Read_Current_Behaviour_Framework_Set_B = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_BehaviourFrameworkSets'],''')/items?$filter=FrameworkVersion eq ''',uriComponent(body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion']),''' and Published eq 1 and Immutable eq 1&$top=2')",
    undefined, after('Read_Current_Core_Target_References_B'));
  tryActions.Read_Current_Behaviour_Framework_Values_B = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_BehaviourFrameworkValues'],''')/items?$filter=FrameworkVersion eq ''',uriComponent(body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion']),'''&$top=5000')",
    undefined, after('Read_Current_Behaviour_Framework_Set_B'));
  tryActions.Read_Current_Person_Behaviour_Assignment_B = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_PersonBehaviourAssignments'],''')/items?$filter=PersonKey eq ''',uriComponent(first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']),''' and FrameworkVersion eq ''',uriComponent(body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion']),''' and Active eq 1&$top=2')",
    undefined, after('Read_Current_Behaviour_Framework_Values_B'));
  tryActions.Read_Current_Behaviour_Prompts_B = http(contentRef, 'GET',
    "@concat('/_api/web/lists(guid''',parameters('referenceListIds')?['KCFKPI_BehaviourObjectiveLibrary'],''')/items?$filter=Active eq 1&$top=5000')",
    undefined, after('Read_Current_Person_Behaviour_Assignment_B'));
  tryActions.Select_Submitted_Core_KPI_Keys = {
    type: 'Select', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']",
      select: "@concat(item()?['kpiId'],'|',item()?['kpiVersionKey'])"
    }, runAfter: after('Read_Current_Behaviour_Prompts_B')
  };
  tryActions.Select_Submitted_Core_Target_Keys = {
    type: 'Select', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']",
      select: "@concat(item()?['kpiId'],'|',item()?['targetVersionKey'],'|',string(body('Read_Request_A')?['PerformanceYear']))"
    }, runAfter: after('Select_Submitted_Core_KPI_Keys')
  };
  tryActions.Select_Submitted_Core_Reference_Coordinates = {
    type: 'Select', inputs: {
      from: "@body('Parse_Immutable_Request_Payload')?['core']?['entries']",
      select: "@concat(item()?['kpiId'],'|',item()?['kpiVersionKey'],'|',item()?['targetVersionKey'],'|',string(body('Read_Request_A')?['PerformanceYear']))"
    }, runAfter: after('Select_Submitted_Core_Target_Keys')
  };
  tryActions.Filter_Current_Core_KPI_References_For_Submitted = {
    type: 'Query', inputs: {
      from: "@body('Read_Current_Core_KPI_References')?['value']",
      where: "@contains(body('Select_Submitted_Core_KPI_Keys'),concat(item()?['KPIID'],'|',item()?['KPIVersionKey']))"
    }, runAfter: after('Select_Submitted_Core_Reference_Coordinates')
  };
  tryActions.Select_Current_Core_KPI_Keys = {
    type: 'Select', inputs: { from: "@body('Filter_Current_Core_KPI_References_For_Submitted')",
      select: "@concat(item()?['KPIID'],'|',item()?['KPIVersionKey'])" },
    runAfter: after('Filter_Current_Core_KPI_References_For_Submitted')
  };
  tryActions.Filter_Current_Core_Target_References_For_Submitted = {
    type: 'Query', inputs: {
      from: "@body('Read_Current_Core_Target_References')?['value']",
      where: "@contains(body('Select_Submitted_Core_Target_Keys'),concat(item()?['KPIID'],'|',item()?['TargetVersionKey'],'|',string(item()?['PerformanceYear'])))"
    }, runAfter: after('Select_Current_Core_KPI_Keys')
  };
  tryActions.Select_Current_Core_Target_Keys = {
    type: 'Select', inputs: { from: "@body('Filter_Current_Core_Target_References_For_Submitted')",
      select: "@concat(item()?['KPIID'],'|',item()?['TargetVersionKey'],'|',string(item()?['PerformanceYear']))" },
    runAfter: after('Filter_Current_Core_Target_References_For_Submitted')
  };
  tryActions.Select_Submitted_Behaviour_Value_Keys = {
    type: 'Select', inputs: { from: "@body('Parse_Immutable_Request_Payload')?['behaviours']?['entries']",
      select: "@concat(body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion'],'|',item()?['valueId'])" },
    runAfter: after('Select_Current_Core_Target_Keys')
  };
  tryActions.Filter_Current_Behaviour_Values_For_Submitted = {
    type: 'Query', inputs: {
      from: "@body('Read_Current_Behaviour_Framework_Values')?['value']",
      where: "@contains(body('Select_Submitted_Behaviour_Value_Keys'),item()?['FrameworkValueKey'])"
    }, runAfter: after('Select_Submitted_Behaviour_Value_Keys')
  };
  tryActions.Select_Current_Behaviour_Value_Keys = {
    type: 'Select', inputs: { from: "@body('Filter_Current_Behaviour_Values_For_Submitted')",
      select: "@item()?['FrameworkValueKey']" }, runAfter: after('Filter_Current_Behaviour_Values_For_Submitted')
  };
  tryActions.Select_Submitted_Behaviour_Descriptor_Keys = {
    type: 'Select', inputs: { from: "@body('Parse_Immutable_Request_Payload')?['behaviours']?['entries']",
      select: "@item()?['descriptorKey']" }, runAfter: after('Select_Current_Behaviour_Value_Keys')
  };
  tryActions.Select_Current_Behaviour_Descriptor_Keys = {
    type: 'Select', inputs: { from: "@body('Filter_Current_Behaviour_Values_For_Submitted')",
      select: "@concat(item()?['FrameworkVersion'],'|',body('Parse_Immutable_Request_Payload')?['behaviours']?['roleTier'],'|',item()?['ValueID'])" },
    runAfter: after('Select_Submitted_Behaviour_Descriptor_Keys')
  };
  tryActions.Build_Submitted_Behaviour_Prompt_Coordinates = foreach(
    "@body('Parse_Immutable_Request_Payload')?['behaviours']?['entries']", {
      Append_Submitted_Behaviour_Prompt_Coordinates: foreach(
        "@items('Build_Submitted_Behaviour_Prompt_Coordinates')?['guidancePromptKeys']", {
          Append_Submitted_Behaviour_Prompt_Coordinate: {
            type: 'AppendToArrayVariable', inputs: { name: 'SubmittedPromptCoordinates',
              value: "@concat(items('Build_Submitted_Behaviour_Prompt_Coordinates')?['valueId'],'|',body('Parse_Immutable_Request_Payload')?['behaviours']?['roleTier'],'|',item())" }
          }
        }
      )
    }, after('Select_Current_Behaviour_Descriptor_Keys')
  );
  tryActions.Filter_Current_Behaviour_Prompts_For_Submitted = {
    type: 'Query', inputs: { from: "@body('Read_Current_Behaviour_Prompts')?['value']",
      where: "@and(contains(variables('SubmittedPromptCoordinates'),concat(item()?['BehaviourKey'],'|',body('Parse_Immutable_Request_Payload')?['behaviours']?['roleTier'],'|',item()?['BehaviourObjectiveKey'])),equals(item()?['RoleLevelCode'],if(equals(body('Parse_Immutable_Request_Payload')?['behaviours']?['roleTier'],'IC_OFFICER'),'L1',if(equals(body('Parse_Immutable_Request_Payload')?['behaviours']?['roleTier'],'PEOPLE_MANAGER'),'L2','L3'))))" },
    runAfter: after('Build_Submitted_Behaviour_Prompt_Coordinates')
  };
  tryActions.Select_Authoritative_Behaviour_Prompt_Coordinates = {
    type: 'Select', inputs: { from: "@body('Filter_Current_Behaviour_Prompts_For_Submitted')",
      select: "@concat(item()?['BehaviourKey'],'|',body('Parse_Immutable_Request_Payload')?['behaviours']?['roleTier'],'|',item()?['BehaviourObjectiveKey'])" },
    runAfter: after('Filter_Current_Behaviour_Prompts_For_Submitted')
  };
  tryActions.Set_Protected_Authority_Variables = scope({
    Set_DraftItemUri: setVariable('DraftItemUri',
      "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanDrafts'],''')/items(',string(body('Read_Request_A')?['DraftItemID']),')')"),
    Set_ProtectedControlItemUri: setVariable('ProtectedControlItemUri',
      "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_Workplans'],''')/items(',first(body('Read_Protected_Workplan_Control')?['value'])?['ID'],')')", after('Set_DraftItemUri')),
    Set_ExactControlETag: setVariable('ExactControlETag', "@first(body('Read_Protected_Workplan_Control')?['value'])?['@odata.etag']", after('Set_ProtectedControlItemUri')),
    Set_HierarchyEpoch: setVariable('HierarchyEpoch', "@int(first(body('Read_Protected_Workplan_Control')?['value'])?['HierarchyEpoch'])", after('Set_ExactControlETag')),
    Set_AclEpoch: setVariable('AclEpoch', "@int(first(body('Read_Protected_Workplan_Control')?['value'])?['AclEpoch'])", after('Set_HierarchyEpoch'))
  }, after('Select_Authoritative_Behaviour_Prompt_Coordinates'));

  const draftRequestProof = and(
    eq("@variables('FailureCode')", ''),
    eq("@string(body('Read_Request_A'))", "@string(body('Read_Request_B'))"),
    eq("@body('Read_Request_A')?['RequestKey']", "@variables('RequestKey')"),
    eq("@body('Read_Request_A')?['RequestKey']", "@concat(body('Read_Request_A')?['PersonKey'],'|',string(body('Read_Request_A')?['PerformanceYear']),'|',body('Read_Request_A')?['ClientSubmitID'])"),
    eq("@body('Read_Request_A')?['ClientSubmitID']", "@toLower(body('Read_Request_A')?['ClientSubmitID'])"),
    eq("@length(match(body('Read_Request_A')?['ClientSubmitID'],'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))", 1),
    eq("@length(match(body('Read_Request_A')?['PayloadSHA256'],'^[0-9A-F]{64}$'))", 1),
    eq("@body('Read_Request_A')?['PayloadSHA256']", "@toUpper(sha256(body('Read_Request_A')?['PayloadJSON']))"),
    eq("@length(body('Read_Authoritative_Draft_A')?['value'])", 1),
    eq("@length(body('Read_Authoritative_Draft_B')?['value'])", 1),
    eq("@string(first(body('Read_Authoritative_Draft_A')?['value']))", "@string(first(body('Read_Authoritative_Draft_B')?['value']))"),
    eq("@body('Read_Request_A')?['DraftItemID']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['ID']"),
    eq("@body('Read_Request_A')?['DraftETag']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['@odata.etag']"),
    eq("@body('Read_Request_A')?['DraftVersion']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['DraftVersion']"),
    eq("@body('Read_Request_A')?['DraftSchemaVersion']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['SchemaVersion']"),
    eq("@body('Read_Request_A')?['PayloadJSON']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['DraftPayloadJSON']"),
    eq("@body('Read_Request_A')?['PayloadSHA256']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['DraftPayloadSHA256']"),
    eq("@first(body('Read_Authoritative_Draft_A')?['value'])?['DraftPayloadSHA256']", "@toUpper(sha256(first(body('Read_Authoritative_Draft_A')?['value'])?['DraftPayloadJSON']))"),
    eq("@body('Read_Request_A')?['FrameworkVersion']", "@body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion']"),
    eq("@body('Read_Request_A')?['FrameworkVersion']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['FrameworkVersion']"),
    eq("@body('Read_Request_A')?['CatalogueVersion']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['CatalogueVersion']"),
    eq("@length(body('Read_Protected_Workplan_Control')?['value'])", 1),
    eq("@body('Read_Request_A')?['PersonKey']", "@first(body('Read_Protected_Workplan_Control')?['value'])?['PersonKey']"),
    eq("@body('Read_Request_A')?['WorkplanKey']", "@first(body('Read_Protected_Workplan_Control')?['value'])?['WorkplanKey']"),
    eq("@body('Read_Request_A')?['PerformanceYear']", "@first(body('Read_Protected_Workplan_Control')?['value'])?['PerformanceYear']"),
    eq("@body('Read_Request_A')?['DraftItemID']", "@first(body('Read_Protected_Workplan_Control')?['value'])?['DraftItemID']"),
    eq("@body('Read_Request_A')?['DraftSchemaVersion']", "@first(body('Read_Protected_Workplan_Control')?['value'])?['DraftSchemaVersion']"),
    eq("@length(body('Read_Actor_From_Native_Created_By')?['value'])", 1),
    eq("@toLower(first(body('Read_Actor_From_Native_Created_By')?['value'])?['Email'])", "@toLower(body('Read_Request_A')?['Author/EMail'])"),
    eq("@body('Read_Request_A')?['PersonKey']", "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']"),
    eq("@length(body('Read_Current_Manager_From_People')?['value'])", 1),
    eq("@first(body('Read_Current_Manager_From_People')?['value'])?['PersonKey']", "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['ManagerPersonKey']"),
    eq("@first(body('Read_Protected_Workplan_Control')?['value'])?['ManagerPersonKey']", "@first(body('Read_Current_Manager_From_People')?['value'])?['PersonKey']"),
    { greater: ["@int(first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID'])", 0] },
    { greater: ["@int(first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'])", 0] },
    { greaterOrEquals: ["@variables('HierarchyEpoch')", 1] },
    { lessOrEquals: ["@variables('AclEpoch')", "@variables('HierarchyEpoch')"] }
  );
  tryActions.Draft_Request_Bytes_And_Hash_Are_Exact = condition(draftRequestProof, {
    Draft_Request_Provenance_Validated: { type: 'Compose', inputs: 'ExactDraftRequestBytesHashEtagVersionAndProtectedCoordinates', runAfter: {} }
  }, failure('DraftRequestProof', 'DraftRequestBytesOrCoordinatesMismatch', 'FailClosedNoTerminal'),
  after('Set_Protected_Authority_Variables'));

  const referenceProof = and(
    eq("@variables('FailureCode')", ''),
    eq("@string(body('Read_Current_Core_KPI_References'))", "@string(body('Read_Current_Core_KPI_References_B'))"),
    eq("@string(body('Read_Current_Core_Target_References'))", "@string(body('Read_Current_Core_Target_References_B'))"),
    eq("@string(body('Read_Current_Behaviour_Framework_Set'))", "@string(body('Read_Current_Behaviour_Framework_Set_B'))"),
    eq("@string(body('Read_Current_Behaviour_Framework_Values'))", "@string(body('Read_Current_Behaviour_Framework_Values_B'))"),
    eq("@string(body('Read_Current_Person_Behaviour_Assignment'))", "@string(body('Read_Current_Person_Behaviour_Assignment_B'))"),
    eq("@string(body('Read_Current_Behaviour_Prompts'))", "@string(body('Read_Current_Behaviour_Prompts_B'))"),
    eq("@string(sort(body('Select_Submitted_Core_KPI_Keys')))", "@string(sort(body('Select_Current_Core_KPI_Keys')))"),
    eq("@string(sort(body('Select_Submitted_Core_Target_Keys')))", "@string(sort(body('Select_Current_Core_Target_Keys')))"),
    eq("@body('Read_Request_A')?['CatalogueVersion']", "@toUpper(sha256(join(sort(body('Select_Submitted_Core_Reference_Coordinates')),'\n')))"),
    eq("@length(body('Read_Current_Behaviour_Framework_Set')?['value'])", 1),
    eq("@first(body('Read_Current_Behaviour_Framework_Set')?['value'])?['FrameworkVersion']", "@body('Parse_Immutable_Request_Payload')?['behaviours']?['frameworkVersion']"),
    eq("@first(body('Read_Current_Behaviour_Framework_Set')?['value'])?['Published']", true),
    eq("@first(body('Read_Current_Behaviour_Framework_Set')?['value'])?['Immutable']", true),
    eq("@length(body('Read_Current_Person_Behaviour_Assignment')?['value'])", 1),
    eq("@first(body('Read_Current_Person_Behaviour_Assignment')?['value'])?['PersonKey']", "@body('Read_Request_A')?['PersonKey']"),
    eq("@first(body('Read_Current_Person_Behaviour_Assignment')?['value'])?['RoleTier']", "@body('Parse_Immutable_Request_Payload')?['behaviours']?['roleTier']"),
    eq("@string(sort(body('Select_Submitted_Behaviour_Value_Keys')))", "@string(sort(body('Select_Current_Behaviour_Value_Keys')))"),
    eq("@string(sort(body('Select_Submitted_Behaviour_Descriptor_Keys')))", "@string(sort(body('Select_Current_Behaviour_Descriptor_Keys')))"),
    eq("@length(variables('SubmittedPromptCoordinates'))", 25),
    eq("@length(variables('SubmittedPromptCoordinates'))", "@length(union(variables('SubmittedPromptCoordinates'),variables('SubmittedPromptCoordinates')))"),
    eq("@string(sort(variables('SubmittedPromptCoordinates')))", "@string(sort(body('Select_Authoritative_Behaviour_Prompt_Coordinates')))"),
    { greater: ["@int(parameters('principalIds')?['contentProcessor'])", 0] },
    { greater: ["@int(parameters('principalIds')?['aclReconciler'])", 0] },
    { greater: ["@int(parameters('principalIds')?['recoveryAdmin'])", 0] },
    eq("@length(union(createArray(parameters('principalIds')?['contentProcessor'],parameters('principalIds')?['aclReconciler'],parameters('principalIds')?['recoveryAdmin'],first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID'],first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID']),createArray(parameters('principalIds')?['contentProcessor'],parameters('principalIds')?['aclReconciler'],parameters('principalIds')?['recoveryAdmin'],first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID'],first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'])))", 5),
    eq("@length(union(createArray(parameters('roleIds')?['itemReader'],parameters('roleIds')?['addReadNoEdit'],parameters('roleIds')?['draftEditor'],parameters('roleIds')?['mutatorNoDelete'],parameters('roleIds')?['aclReconciler'],parameters('roleIds')?['fullControl']),createArray(parameters('roleIds')?['itemReader'],parameters('roleIds')?['addReadNoEdit'],parameters('roleIds')?['draftEditor'],parameters('roleIds')?['mutatorNoDelete'],parameters('roleIds')?['aclReconciler'],parameters('roleIds')?['fullControl'])))", 6)
  );
  tryActions.Protected_Assigned_Current_References_Are_Exact = condition(referenceProof, {
    Protected_Current_References_Validated: { type: 'Compose', inputs: 'ExactCoreFrameworkAssignmentValuesPromptsAndCatalogueDigest', runAfter: {} }
  }, failure('ProtectedReferenceProof', 'ProtectedAssignedCurrentReferencesMismatch', 'FailClosedNoTerminal'),
  after('Draft_Request_Bytes_And_Hash_Are_Exact'));

  tryActions.Pre_Operation_Authority_Proof = condition(eq("@variables('FailureCode')", ''), {
    Read_Operation_By_Unique_Key: http(contentRef, 'GET', operationQuery),
    Operation_Is_Missing: condition(eq("@length(body('Read_Operation_By_Unique_Key')?['value'])", 0), {
      Read_Protected_Control_Before_Operation: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')"),
      Protected_Control_Is_Fresh_Before_Create: condition(and(
        eq("@string(body('Read_Protected_Control_Before_Operation'))", "@string(first(body('Read_Protected_Workplan_Control')?['value']))"),
        or(eq("@body('Read_Protected_Control_Before_Operation')?['State']", 'Draft'),
          eq("@body('Read_Protected_Control_Before_Operation')?['State']", 'ChangesRequested')),
        eq("@body('Read_Protected_Control_Before_Operation')?['TransitionStatus']", 'Ready'),
        eq("@coalesce(body('Read_Protected_Control_Before_Operation')?['PendingRequestKey'],'')", '')
      ), {
        Create_Unique_Operation: http(contentRef, 'POST',
          "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmitOperations'],''')/items')", {
            OperationKey: "@variables('OperationKey')", RequestKey: "@variables('RequestKey')",
            WorkplanKey: "@body('Read_Request_A')?['WorkplanKey']", PersonKey: "@body('Read_Request_A')?['PersonKey']",
            PerformanceYear: "@body('Read_Request_A')?['PerformanceYear']", ProcessorIdentity: 'KCFKPIOptionESubmitProcessorV1',
            ExpectedControlETag: "@variables('ExactControlETag')", ObservedControlETag: "@variables('ExactControlETag')",
            Checkpoint: 'Validated', Outcome: 'Running', AttemptCount: 1
          })
      }, failure('ProtectedControlFreshness', 'ProtectedControlStaleBeforeOperation', 'FailClosedNoTerminal'),
      after('Read_Protected_Control_Before_Operation'))
    }, { Resume_Existing_Operation: { type: 'Compose', inputs: "@variables('OperationKey')", runAfter: {} } }, after('Read_Operation_By_Unique_Key')),
    Canonical_Read_Operation: http(contentRef, 'GET', operationQuery, undefined, afterAny('Operation_Is_Missing')),
    Operation_Readback_Is_Canonical: condition(and(
      eq("@length(body('Canonical_Read_Operation')?['value'])", 1),
      eq("@first(body('Canonical_Read_Operation')?['value'])?['OperationKey']", "@variables('OperationKey')"),
      eq("@first(body('Canonical_Read_Operation')?['value'])?['RequestKey']", "@variables('RequestKey')"),
      eq("@first(body('Canonical_Read_Operation')?['value'])?['WorkplanKey']", "@body('Read_Request_A')?['WorkplanKey']"),
      eq("@first(body('Canonical_Read_Operation')?['value'])?['PersonKey']", "@body('Read_Request_A')?['PersonKey']"),
      eq("@first(body('Canonical_Read_Operation')?['value'])?['PerformanceYear']", "@body('Read_Request_A')?['PerformanceYear']"),
      eq("@first(body('Canonical_Read_Operation')?['value'])?['ProcessorIdentity']", 'KCFKPIOptionESubmitProcessorV1'),
      { greater: ["@length(string(first(body('Canonical_Read_Operation')?['value'])?['ExpectedControlETag']))", 0] },
      or(
        { not: { contains: [snapshotCheckpointNames, canonicalOperationCheckpoint] } },
        eq("@first(body('Canonical_Read_Operation')?['value'])?['CreatedSnapshotKey']", "@variables('SnapshotKey')")
      ),
      or(
        { not: { contains: [auditCheckpointNames, canonicalOperationCheckpoint] } },
        and(
          eq("@first(body('Canonical_Read_Operation')?['value'])?['CreatedAuditKey']", "@variables('AuditKey')"),
          eq("@length(match(string(first(body('Canonical_Read_Operation')?['value'])?['CreatedAuditEventAt']),'^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$'))", 1)
        )
      ),
      or(
        and(
          eq(canonicalOperationCheckpoint, 'Validated'),
          or(
            and(
              protectedDraftLikeState,
              eq(protectedControlField('TransitionStatus'), 'Ready'),
              protectedControlEtagMatchesOperation
            ),
            protectedClaimedState
          )
        ),
        and(
          { contains: [['ControlClaimed', 'SnapshotWritten'], canonicalOperationCheckpoint] },
          protectedClaimedState,
          protectedControlEtagMatchesOperation
        ),
        and(
          eq(canonicalOperationCheckpoint, 'AuditWritten'),
          or(
            and(protectedClaimedState, protectedControlEtagMatchesOperation),
            protectedPointedState
          )
        ),
        and(
          eq(canonicalOperationCheckpoint, 'ControlPointed'),
          protectedPointedState,
          protectedControlEtagMatchesOperation
        ),
        and(
          eq(canonicalOperationCheckpoint, 'AclVerified'),
          or(
            and(protectedPointedState, protectedControlEtagMatchesOperation),
            protectedReadyState
          )
        ),
        and(
          eq(canonicalOperationCheckpoint, 'Completed'),
          protectedReadyState,
          protectedControlEtagMatchesOperation
        ),
        and(
          eq(canonicalOperationOutcome, 'RecoveryHold'),
          eq(protectedControlField('TransitionStatus'), 'RecoveryHold'),
          eq(protectedControlField('PendingRequestKey'), "@variables('RequestKey')"),
          eq(protectedControlField('LastOperationKey'), "@variables('OperationKey')")
        ),
        and(
          eq(canonicalOperationOutcome, 'Rejected'),
          { not: eq(protectedControlField('PendingRequestKey'), "@variables('RequestKey')") },
          { not: eq(protectedControlField('LastOperationKey'), "@variables('OperationKey')") }
        )
      ),
      or(
        and(
          eq("@first(body('Canonical_Read_Operation')?['value'])?['Outcome']", 'Running'),
          eq("@first(body('Canonical_Read_Operation')?['value'])?['ErrorCode']", null),
          eq("@first(body('Canonical_Read_Operation')?['value'])?['ErrorDetail']", null),
          { contains: [['Validated', 'ControlClaimed', 'SnapshotWritten', 'AuditWritten', 'ControlPointed', 'AclVerified'], "@first(body('Canonical_Read_Operation')?['value'])?['Checkpoint']"] }
        ),
        and(
          eq("@first(body('Canonical_Read_Operation')?['value'])?['Outcome']", 'Completed'),
          eq("@first(body('Canonical_Read_Operation')?['value'])?['Checkpoint']", 'Completed'),
          eq("@first(body('Canonical_Read_Operation')?['value'])?['ErrorCode']", null),
          eq("@first(body('Canonical_Read_Operation')?['value'])?['ErrorDetail']", null)
        ),
        and(
          { contains: [['Rejected', 'RecoveryHold'], canonicalOperationOutcome] },
          { contains: [['Validated', 'ControlClaimed', 'SnapshotWritten', 'AuditWritten', 'ControlPointed', 'AclVerified'], canonicalOperationCheckpoint] },
          { greater: ["@length(trim(string(first(body('Canonical_Read_Operation')?['value'])?['ErrorCode'])))", 0] },
          { greater: ["@length(trim(string(first(body('Canonical_Read_Operation')?['value'])?['ErrorDetail'])))", 0] }
        )
      )
    ), {
      Set_OperationItemUri: setVariable('OperationItemUri',
        "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmitOperations'],''')/items(',first(body('Canonical_Read_Operation')?['value'])?['ID'],')')"),
      Set_ExpectedOperationControlETag: setVariable('ExpectedOperationControlETag', canonicalOperationField('ExpectedControlETag'), after('Set_OperationItemUri')),
      Set_ExactOperationETag: setVariable('ExactOperationETag', "@first(body('Canonical_Read_Operation')?['value'])?['@odata.etag']", after('Set_ExpectedOperationControlETag')),
      Set_Checkpoint_From_Durable_Operation: setVariable('Checkpoint', canonicalOperationCheckpoint, after('Set_ExactOperationETag')),
      Set_DurableOutcome_From_Operation: setVariable('DurableOutcome', canonicalOperationOutcome, after('Set_Checkpoint_From_Durable_Operation')),
      Read_Resume_Snapshot_Canonical: http(contentRef, 'GET', snapshotQuery, undefined, after('Set_DurableOutcome_From_Operation')),
      Read_Resume_Audit_Canonical: http(contentRef, 'GET', auditQuery, undefined, after('Read_Resume_Snapshot_Canonical')),
      Resume_Immutable_Evidence_Is_Canonical: condition(and(
        or(
          { not: { contains: [snapshotCheckpointNames, canonicalOperationCheckpoint] } },
          canonicalSnapshot('Read_Resume_Snapshot_Canonical')
        ),
        or(
          { not: { contains: [auditCheckpointNames, canonicalOperationCheckpoint] } },
          canonicalAudit('Read_Resume_Audit_Canonical', canonicalOperationField('CreatedAuditEventAt'))
        )
      ), {
        Restore_Resume_Snapshot_Item_URI: condition(
          eq("@length(body('Read_Resume_Snapshot_Canonical')?['value'])", 1),
          {
            Set_Resume_SnapshotItemUri: setVariable('SnapshotItemUri',
              "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmittedSnapshots'],''')/items(',first(body('Read_Resume_Snapshot_Canonical')?['value'])?['ID'],')')")
          },
          { Resume_Snapshot_Not_Yet_Written: { type: 'Compose', inputs: canonicalOperationCheckpoint, runAfter: {} } }
        )
      }, failure('ResumeEvidence', 'ResumeCanonicalEvidenceMismatch'), after('Read_Resume_Audit_Canonical'))
    }, failure('OperationIdentity', 'OperationCreateOrReadMismatch'), after('Canonical_Read_Operation'))
  }, failure('PreOperationValidation', 'PreOperationValidationFailed', 'FailClosedNoTerminal'),
  after('Protected_Assigned_Current_References_Are_Exact'));

  tryActions.ControlClaimed_Checkpoint = condition(and(eq("@variables('FailureCode')", ''), eq("@variables('DurableOutcome')", 'Running'), eq("@variables('Checkpoint')", 'Validated')), {
    Read_Control_Before_Claim: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')"),
    Competing_Request_Owns_Control: condition(or(
      and({ greater: ["@length(string(body('Read_Control_Before_Claim')?['PendingRequestKey']))", 0] }, { not: eq("@body('Read_Control_Before_Claim')?['PendingRequestKey']", "@variables('RequestKey')") }),
      and({ greater: ["@length(string(body('Read_Control_Before_Claim')?['LastOperationKey']))", 0] }, { not: eq("@body('Read_Control_Before_Claim')?['LastOperationKey']", "@variables('OperationKey')") })
    ), failure('CompetingRequest', 'ConcurrentRequestLostCas', 'Rejected'), {
      CAS_Control_Claim: http(contentRef, 'PATCH', "@variables('ProtectedControlItemUri')", {
        TransitionStatus: 'Submitting', PendingRequestKey: "@variables('RequestKey')", LastOperationKey: "@variables('OperationKey')"
      }, {}, { 'If-Match': "@variables('ExactControlETag')" }),
      Read_Control_After_Claim: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')", undefined, afterAny('CAS_Control_Claim')),
      Control_Claim_Readback_Is_Exact: condition(and(
        eq("@body('Read_Control_After_Claim')?['TransitionStatus']", 'Submitting'),
        eq("@body('Read_Control_After_Claim')?['PendingRequestKey']", "@variables('RequestKey')"),
        eq("@body('Read_Control_After_Claim')?['LastOperationKey']", "@variables('OperationKey')")
      ), {
        Set_Claimed_Control_ETag: setVariable('ExactControlETag', "@body('Read_Control_After_Claim')?['@odata.etag']"),
        Advance_ControlClaimed: advance('ControlClaimed', 'ControlClaimed', "@body('Read_Control_After_Claim')?['@odata.etag']", after('Set_Claimed_Control_ETag'))
      }, failure('ControlClaim', 'ControlClaimUncertain'), after('Read_Control_After_Claim'))
    }, after('Read_Control_Before_Claim'))
  }, {}, after('Pre_Operation_Authority_Proof'));

  tryActions.SnapshotWritten_Checkpoint = condition(and(eq("@variables('FailureCode')", ''), eq("@variables('DurableOutcome')", 'Running'), eq("@variables('Checkpoint')", 'ControlClaimed')), {
    Read_Snapshot_By_Unique_Key: http(contentRef, 'GET', snapshotQuery),
    Snapshot_Is_Missing: condition(eq("@length(body('Read_Snapshot_By_Unique_Key')?['value'])", 0), {
      Create_Immutable_Snapshot_From_Request_A: http(contentRef, 'POST',
        "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmittedSnapshots'],''')/items')", {
          SnapshotKey: "@variables('SnapshotKey')", RequestKey: "@variables('RequestKey')",
          PersonKey: "@body('Read_Request_A')?['PersonKey']", PerformanceYear: "@body('Read_Request_A')?['PerformanceYear']",
          WorkplanKey: "@body('Read_Request_A')?['WorkplanKey']",
          PayloadJSON: "@body('Read_Request_A')?['PayloadJSON']", PayloadSHA256: "@body('Read_Request_A')?['PayloadSHA256']",
          SourceDraftItemID: "@body('Read_Request_A')?['DraftItemID']", SourceDraftETag: "@body('Read_Request_A')?['DraftETag']",
          SourceDraftVersion: "@body('Read_Request_A')?['DraftVersion']",
          RequestItemID: "@body('Read_Request_A')?['ID']", RequestETag: "@body('Read_Request_A')?['@odata.etag']",
          AuthenticatedEmployeePersonKey: "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']",
          AuthenticatedEmployeeEmail: "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['Email']",
          ManagerPersonKey: "@first(body('Read_Current_Manager_From_People')?['value'])?['PersonKey']",
          ManagerEmail: "@first(body('Read_Current_Manager_From_People')?['value'])?['Email']",
          HierarchyEpoch: "@variables('HierarchyEpoch')",
          FrameworkSnapshotJSON: "@string(createArray(body('Read_Current_Behaviour_Framework_Set')?['value'],body('Read_Current_Behaviour_Framework_Values')?['value'],body('Read_Current_Person_Behaviour_Assignment')?['value'],body('Read_Current_Behaviour_Prompts')?['value']))",
          CatalogueSnapshotJSON: "@string(createArray(body('Read_Current_Core_KPI_References')?['value'],body('Read_Current_Core_Target_References')?['value']))"
        })
    }, { Resume_Existing_Snapshot: { type: 'Compose', inputs: "@variables('SnapshotKey')", runAfter: {} } }, after('Read_Snapshot_By_Unique_Key')),
    Read_Snapshot_Canonical: http(contentRef, 'GET', snapshotQuery, undefined, afterAny('Snapshot_Is_Missing')),
    Snapshot_Readback_Is_Exact_Request_A: condition(and(
      eq("@length(body('Read_Snapshot_Canonical')?['value'])", 1),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['SnapshotKey']", "@variables('SnapshotKey')"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['RequestKey']", "@variables('RequestKey')"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['PersonKey']", "@body('Read_Request_A')?['PersonKey']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['PerformanceYear']", "@body('Read_Request_A')?['PerformanceYear']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['WorkplanKey']", "@body('Read_Request_A')?['WorkplanKey']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['PayloadJSON']", "@body('Read_Request_A')?['PayloadJSON']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['PayloadSHA256']", "@body('Read_Request_A')?['PayloadSHA256']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['SourceDraftItemID']", "@body('Read_Request_A')?['DraftItemID']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['SourceDraftETag']", "@body('Read_Request_A')?['DraftETag']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['SourceDraftVersion']", "@body('Read_Request_A')?['DraftVersion']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['RequestItemID']", "@body('Read_Request_A')?['ID']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['RequestETag']", "@body('Read_Request_A')?['@odata.etag']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['AuthenticatedEmployeePersonKey']", "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['AuthenticatedEmployeeEmail']", "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['Email']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['ManagerPersonKey']", "@first(body('Read_Current_Manager_From_People')?['value'])?['PersonKey']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['ManagerEmail']", "@first(body('Read_Current_Manager_From_People')?['value'])?['Email']"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['HierarchyEpoch']", "@variables('HierarchyEpoch')"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['FrameworkSnapshotJSON']", "@string(createArray(body('Read_Current_Behaviour_Framework_Set')?['value'],body('Read_Current_Behaviour_Framework_Values')?['value'],body('Read_Current_Person_Behaviour_Assignment')?['value'],body('Read_Current_Behaviour_Prompts')?['value']))"),
      eq("@first(body('Read_Snapshot_Canonical')?['value'])?['CatalogueSnapshotJSON']", "@string(createArray(body('Read_Current_Core_KPI_References')?['value'],body('Read_Current_Core_Target_References')?['value']))")
    ), {
      Set_SnapshotItemUri: setVariable('SnapshotItemUri',
        "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmittedSnapshots'],''')/items(',first(body('Read_Snapshot_Canonical')?['value'])?['ID'],')')"),
      Advance_SnapshotWritten: advance('SnapshotWritten', 'SnapshotWritten', "@variables('ExactControlETag')", after('Set_SnapshotItemUri'))
    },
    failure('Snapshot', 'SnapshotMismatchOrUncertain'), after('Read_Snapshot_Canonical'))
  }, {}, after('ControlClaimed_Checkpoint'));

  tryActions.AuditWritten_Checkpoint = condition(and(eq("@variables('FailureCode')", ''), eq("@variables('DurableOutcome')", 'Running'), eq("@variables('Checkpoint')", 'SnapshotWritten')), {
    Read_Audit_By_Unique_Key: http(contentRef, 'GET', auditQuery),
    Audit_Is_Missing: condition(eq("@length(body('Read_Audit_By_Unique_Key')?['value'])", 0), {
      Capture_Trusted_Audit_EventAt: setVariable('TrustedAuditEventAt', '@utcNow()'),
      Create_Append_Only_Audit: http(contentRef, 'POST',
        "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_Audit'],''')/items')", {
          AuditKey: "@variables('AuditKey')", RequestKey: "@variables('RequestKey')", SnapshotKey: "@variables('SnapshotKey')",
          EventType: 'WorkplanSubmitted', SubjectKey: "@body('Read_Request_A')?['WorkplanKey']",
          PerformanceYear: "@body('Read_Request_A')?['PerformanceYear']",
          ActorEmail: "@body('Read_Request_A')?['Author/EMail']", ActorRole: 'Employee',
          EventAt: "@variables('TrustedAuditEventAt')", CorrelationKey: "@variables('RequestKey')",
          Source: 'KCFKPIOptionESubmitProcessorV1', SourceReference: "@variables('RequestKey')", Success: true,
          PayloadSHA256: "@body('Read_Request_A')?['PayloadSHA256']",
          ActorPersonKey: "@first(body('Read_Actor_From_Native_Created_By')?['value'])?['PersonKey']",
          ProcessorIdentity: 'KCFKPIOptionESubmitProcessorV1'
        }, after('Capture_Trusted_Audit_EventAt'))
    }, {
      Restore_Trusted_Audit_EventAt: setVariable('TrustedAuditEventAt',
        "@first(body('Read_Audit_By_Unique_Key')?['value'])?['EventAt']")
    }, after('Read_Audit_By_Unique_Key')),
    Read_Audit_Canonical: http(contentRef, 'GET', auditQuery, undefined, afterAny('Audit_Is_Missing')),
    Audit_Readback_Is_Exact: condition(canonicalAudit('Read_Audit_Canonical', "@variables('TrustedAuditEventAt')"),
    { Advance_AuditWritten: advance('AuditWritten', 'AuditWritten', "@variables('ExactControlETag')") },
    failure('Audit', 'AuditMismatchOrUncertain'), after('Read_Audit_Canonical'))
  }, {}, after('SnapshotWritten_Checkpoint'));

  tryActions.ControlPointed_Checkpoint = condition(and(eq("@variables('FailureCode')", ''), eq("@variables('DurableOutcome')", 'Running'), eq("@variables('Checkpoint')", 'AuditWritten')), {
    Read_Control_Before_Pointer: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')"),
    Read_Operation_Before_Pointer: http(contentRef, 'GET', operationQuery, undefined, after('Read_Control_Before_Pointer')),
    Pointer_Prior_State_And_Ownership_Are_Exact: condition(and(
      eq("@body('Read_Control_Before_Pointer')?['PersonKey']", "@body('Read_Request_A')?['PersonKey']"),
      eq("@body('Read_Control_Before_Pointer')?['WorkplanKey']", "@body('Read_Request_A')?['WorkplanKey']"),
      eq("@body('Read_Control_Before_Pointer')?['PerformanceYear']", "@body('Read_Request_A')?['PerformanceYear']"),
      eq("@length(body('Read_Operation_Before_Pointer')?['value'])", 1),
      eq("@first(body('Read_Operation_Before_Pointer')?['value'])?['OperationKey']", "@variables('OperationKey')"),
      eq("@first(body('Read_Operation_Before_Pointer')?['value'])?['RequestKey']", "@variables('RequestKey')"),
      eq("@first(body('Read_Operation_Before_Pointer')?['value'])?['Checkpoint']", 'AuditWritten'),
      eq("@first(body('Read_Operation_Before_Pointer')?['value'])?['Outcome']", 'Running'),
      or(
        and(
          or(eq("@body('Read_Control_Before_Pointer')?['State']", 'Draft'), eq("@body('Read_Control_Before_Pointer')?['State']", 'ChangesRequested')),
          eq("@body('Read_Control_Before_Pointer')?['TransitionStatus']", 'Submitting'),
          eq("@body('Read_Control_Before_Pointer')?['PendingRequestKey']", "@variables('RequestKey')"),
          eq("@body('Read_Control_Before_Pointer')?['LastOperationKey']", "@variables('OperationKey')"),
          eq("@first(body('Read_Operation_Before_Pointer')?['value'])?['ObservedControlETag']", "@body('Read_Control_Before_Pointer')?['@odata.etag']")
        ),
        and(
          eq("@body('Read_Control_Before_Pointer')?['State']", 'Submitted'),
          eq("@body('Read_Control_Before_Pointer')?['TransitionStatus']", 'AclPending'),
          eq("@body('Read_Control_Before_Pointer')?['CurrentSubmittedSnapshotKey']", "@variables('SnapshotKey')"),
          eq("@body('Read_Control_Before_Pointer')?['PendingRequestKey']", "@variables('RequestKey')"),
          eq("@body('Read_Control_Before_Pointer')?['LastOperationKey']", "@variables('OperationKey')")
        )
      )
    ), {
      CAS_Control_To_Submitted_AclPending: http(contentRef, 'PATCH', "@variables('ProtectedControlItemUri')", {
        State: 'Submitted', TransitionStatus: 'AclPending', CurrentSubmittedSnapshotKey: "@variables('SnapshotKey')",
        PendingRequestKey: "@variables('RequestKey')", LastOperationKey: "@variables('OperationKey')"
      }, {}, { 'If-Match': "@body('Read_Control_Before_Pointer')?['@odata.etag']" }),
      Read_Control_After_Pointer: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')", undefined, afterAny('CAS_Control_To_Submitted_AclPending')),
      Control_Pointer_Readback_Is_Exact: condition(and(
        eq("@body('Read_Control_After_Pointer')?['State']", 'Submitted'),
        eq("@body('Read_Control_After_Pointer')?['TransitionStatus']", 'AclPending'),
        eq("@body('Read_Control_After_Pointer')?['CurrentSubmittedSnapshotKey']", "@variables('SnapshotKey')"),
        eq("@body('Read_Control_After_Pointer')?['PendingRequestKey']", "@variables('RequestKey')"),
        eq("@body('Read_Control_After_Pointer')?['LastOperationKey']", "@variables('OperationKey')"),
        { not: eq("@body('Read_Control_After_Pointer')?['@odata.etag']", "@body('Read_Control_Before_Pointer')?['@odata.etag']") }
      ), {
        Set_Pointed_Control_ETag: setVariable('ExactControlETag', "@body('Read_Control_After_Pointer')?['@odata.etag']"),
        Advance_ControlPointed: advance('ControlPointed', 'ControlPointed', "@body('Read_Control_After_Pointer')?['@odata.etag']", after('Set_Pointed_Control_ETag'))
      }, failure('ControlPointer', 'ControlPointerUncertain'), after('Read_Control_After_Pointer'))
    }, failure('ControlPointerPriorState', 'ControlPointerPriorStateOrOwnershipMismatch'), after('Read_Operation_Before_Pointer'))
  }, {}, after('AuditWritten_Checkpoint'));
  const nativeAclTupleSelect = (readName, runAfter = {}) => ({
    type: 'Select', inputs: {
      from: `@body('${readName}')?['value']`,
      select: "@concat(string(item()?['PrincipalId']),'|',string(item()?['Member']?['PrincipalType']),'|',string(first(item()?['RoleDefinitionBindings'])?['Id']),'|',first(item()?['RoleDefinitionBindings'])?['Name'],'|',string(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind']),'|',string(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High']),'|',string(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low']))"
    }, runAfter
  });
  const invalidAclRowFilter = (readName, runAfter = {}) => ({
    type: 'Query', inputs: {
      from: `@body('${readName}')?['value']`,
      where: "@or(not(equals(item()?['Member']?['PrincipalType'],1)),not(equals(length(item()?['RoleDefinitionBindings']),1)),lessOrEquals(int(item()?['PrincipalId']),0))"
    }, runAfter
  });
  const expectedAclTuple = (principal, roleKey, roleName, roleTypeKind, high, low) =>
    `concat(string(${principal}),'|1|',string(parameters('roleIds')?['${roleKey}']),'|${roleName}|${roleTypeKind}|${high}|${low}')`;
  const expectedAclSet = (contentRoleKey, contentRoleName, contentLow, includeManager, runAfter = {}) => {
    const tuples = [
      expectedAclTuple("parameters('principalIds')?['contentProcessor']", contentRoleKey, contentRoleName, 0, 0, contentLow),
      expectedAclTuple("parameters('principalIds')?['aclReconciler']", 'aclReconciler', 'KCF KPI Option E ACL Reconciler v1', 0, 0, 33554433),
      expectedAclTuple("parameters('principalIds')?['recoveryAdmin']", 'fullControl', 'Full Control', 5, 2147483647, 4294967295),
      expectedAclTuple("first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID']", 'itemReader', 'KCF KPI Option E Item Reader v1', 0, 0, 1)
    ];
    if (includeManager) tuples.push(expectedAclTuple(
      "first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID']",
      'itemReader', 'KCF KPI Option E Item Reader v1', 0, 0, 1
    ));
    return { type: 'Compose', inputs: `@createArray(${tuples.join(',')})`, runAfter };
  };
  const aclContinuationValue = pageRead => `coalesce(body('${pageRead}')?['@odata.nextLink'],'')`;
  const aclContinuationPrefix = query => `concat(variables('AclExpectedCollectionUri'),'${query}')`;
  const absoluteAclContinuationPrefix = query =>
    `concat(variables('AclCanonicalSiteUrl'),variables('AclExpectedCollectionUri'),'${query}')`;
  const canonicalAclContinuationValue = pageRead => {
    const next = aclContinuationValue(pageRead);
    return `if(startsWith(${next},variables('AclCanonicalSiteUrl')),substring(${next},length(variables('AclCanonicalSiteUrl'))),${next})`;
  };
  const aclContinuationIsCanonical = pageRead => {
    const next = aclContinuationValue(pageRead);
    const canonical = canonicalAclContinuationValue(pageRead);
    const relativeShort = aclContinuationPrefix('?$skiptoken=');
    const relativeFull = aclContinuationPrefix('?$expand=Member,RoleDefinitionBindings&$top=5000&$skiptoken=');
    const absoluteShort = absoluteAclContinuationPrefix('?$skiptoken=');
    const absoluteFull = absoluteAclContinuationPrefix('?$expand=Member,RoleDefinitionBindings&$top=5000&$skiptoken=');
    return and(
      eq(`@contains(body('${pageRead}'),'value')`, true),
      { not: eq(`@body('${pageRead}')?['value']`, null) },
      eq(`@contains(body('${pageRead}'),'odata.nextLink')`, false),
      eq(`@contains(body('${pageRead}'),'__next')`, false),
      or(
        and(
          eq(`@contains(body('${pageRead}'),'@odata.nextLink')`, false),
          eq(`@${next}`, '')
        ),
        and(
          eq(`@contains(body('${pageRead}'),'@odata.nextLink')`, true),
          { not: eq(`@${next}`, '') },
          eq(`@trim(${next})`, `@${next}`),
          eq(`@length(split(${next},'$skiptoken='))`, 2),
          or(
            eq(`@startsWith(${next},${relativeShort})`, true),
            eq(`@startsWith(${next},${relativeFull})`, true),
            eq(`@startsWith(${next},${absoluteShort})`, true),
            eq(`@startsWith(${next},${absoluteFull})`, true)
          ),
          eq(`@length(match(last(split(${next},'$skiptoken=')),'^(?:[A-Za-z0-9._~-]|%[0-9A-Fa-f]{2})+$'))`, 1),
          eq(`@contains(${next},'#')`, false),
          eq(`@contains(${next},'\\')`, false),
          eq(`@contains(toLower(${next}),'%2f')`, false),
          eq(`@contains(toLower(${next}),'%5c')`, false),
          eq(`@contains(toLower(${next}),'%25')`, false),
          eq(`@contains(toLower(${next}),'%23')`, false),
          eq(`@contains(toLower(${next}),'%3f')`, false),
          eq(`@contains(variables('AclSeenContinuations'),${canonical})`, false)
        )
      )
    );
  };
  const pagedAclReadActions = (readName, tag, targetVariable, runAfter = {}) => {
    const resetValues = `Reset_${tag}_ACL_Values`;
    const resetContinuations = `Reset_${tag}_ACL_Continuations`;
    const resetPageCount = `Reset_${tag}_ACL_Page_Count`;
    const setCollection = `Set_${tag}_ACL_Collection`;
    const setFirstPage = `Set_${tag}_ACL_First_Page`;
    const enumerate = `Enumerate_${tag}_ACL_Pages`;
    const pageRead = `GET_${tag}_ACL_Page`;
    const validatePage = `Validate_${tag}_ACL_Page`;
    const appendItems = `Append_${tag}_ACL_Items`;
    const appendItem = `Append_${tag}_ACL_Item`;
    const incrementPage = `Increment_${tag}_ACL_Page_Count`;
    const hasContinuation = `Has_${tag}_ACL_Continuation`;
    const recordContinuation = `Record_${tag}_ACL_Continuation`;
    const setNextPage = `Set_${tag}_ACL_Next_Page`;
    const clearContinuation = `Clear_${tag}_ACL_Continuation`;
    const rejectPage = `Reject_${tag}_Unsafe_ACL_Page`;
    const next = aclContinuationValue(pageRead);
    const canonical = canonicalAclContinuationValue(pageRead);
    return {
      [resetValues]: setVariable('AclPageValues', [], runAfter),
      [resetContinuations]: setVariable('AclSeenContinuations', [], after(resetValues)),
      [resetPageCount]: setVariable('AclPageCount', 0, after(resetContinuations)),
      [setCollection]: setVariable(
        'AclExpectedCollectionUri', `@concat(variables('${targetVariable}'),'/RoleAssignments')`, after(resetPageCount)
      ),
      [setFirstPage]: setVariable(
        'AclContinuationUri',
        "@concat(variables('AclExpectedCollectionUri'),'?$expand=Member,RoleDefinitionBindings&$top=5000')",
        after(setCollection)
      ),
      [enumerate]: {
        type: 'Until', expression: eq("@variables('AclContinuationUri')", ''),
        limit: { count: 100, timeout: 'PT5M' }, runAfter: after(setFirstPage),
        actions: {
          [pageRead]: http(aclRef, 'GET', "@variables('AclContinuationUri')"),
          [validatePage]: condition(aclContinuationIsCanonical(pageRead), {
            [appendItems]: foreach(`@body('${pageRead}')?['value']`, {
              [appendItem]: appendVariable('AclPageValues', '@item()')
            }),
            [incrementPage]: incrementVariable('AclPageCount', 1, after(appendItems)),
            [hasContinuation]: condition({ not: eq(`@${next}`, '') }, {
              [recordContinuation]: appendVariable('AclSeenContinuations', `@${canonical}`),
              [setNextPage]: setVariable(
                'AclContinuationUri', `@${canonical}`, after(recordContinuation)
              )
            }, {
              [clearContinuation]: setVariable('AclContinuationUri', '')
            }, after(incrementPage))
          }, {
            [rejectPage]: terminate('UnsafeAclContinuation', `${tag} ACL page or continuation is malformed, ambiguous, incomplete or outside the exact authorised collection.`)
          }, after(pageRead))
        }
      },
      [readName]: {
        type: 'Compose',
        inputs: {
          value: "@variables('AclPageValues')",
          '@odata.nextLink': "@variables('AclContinuationUri')",
          complete: "@and(equals(variables('AclContinuationUri'),''),greater(variables('AclPageCount'),0),equals(variables('AclPageCount'),add(length(variables('AclSeenContinuations')),1)))",
          pageCount: "@variables('AclPageCount')",
          totalCount: "@length(variables('AclPageValues'))",
          continuationUris: "@variables('AclSeenContinuations')",
          canonicalCollectionUri: "@variables('AclExpectedCollectionUri')"
        },
        runAfter: after(enumerate)
      }
    };
  };
  const aclEnumerationProof = (readName, targetVariable) => [
    eq(`@body('${readName}')?['complete']`, true),
    eq(`@body('${readName}')?['@odata.nextLink']`, ''),
    eq(`@body('${readName}')?['canonicalCollectionUri']`, `@concat(variables('${targetVariable}'),'/RoleAssignments')`),
    { greater: [`@body('${readName}')?['pageCount']`, 0] },
    eq(`@body('${readName}')?['pageCount']`, `@add(length(body('${readName}')?['continuationUris']),1)`),
    eq(`@body('${readName}')?['totalCount']`, `@length(body('${readName}')?['value'])`),
    eq(`@length(body('${readName}')?['continuationUris'])`,
      `@length(union(body('${readName}')?['continuationUris'],body('${readName}')?['continuationUris']))`)
  ];
  tryActions.AclVerified_Checkpoint = condition(and(eq("@variables('FailureCode')", ''), eq("@variables('DurableOutcome')", 'Running'), eq("@variables('Checkpoint')", 'ControlPointed')), {
    Break_Draft_Role_Inheritance: http(aclRef, 'POST', "@concat(variables('DraftItemUri'),'/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')", {}),
    Grant_Employee_Draft_Read: http(aclRef, 'POST', "@concat(variables('DraftItemUri'),'/roleassignments/addroleassignment(principalid=',first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Break_Draft_Role_Inheritance')),
    Grant_Content_Processor_Draft_Mutator: http(aclRef, 'POST', "@concat(variables('DraftItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['contentProcessor'],',roledefid=',parameters('roleIds')?['mutatorNoDelete'],')')", {}, after('Grant_Employee_Draft_Read')),
    Grant_Acl_Reconciler_Draft: http(aclRef, 'POST', "@concat(variables('DraftItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['aclReconciler'],',roledefid=',parameters('roleIds')?['aclReconciler'],')')", {}, after('Grant_Content_Processor_Draft_Mutator')),
    Grant_Recovery_Draft_Full_Control: http(aclRef, 'POST', "@concat(variables('DraftItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['recoveryAdmin'],',roledefid=',parameters('roleIds')?['fullControl'],')')", {}, after('Grant_Acl_Reconciler_Draft')),
    Break_Snapshot_Role_Inheritance: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')", {}, after('Grant_Recovery_Draft_Full_Control')),
    Grant_Manager_Snapshot_Read: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/roleassignments/addroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Break_Snapshot_Role_Inheritance')),
    Grant_Employee_Snapshot_Read: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/roleassignments/addroleassignment(principalid=',first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Grant_Manager_Snapshot_Read')),
    Grant_Content_Processor_Snapshot_Add_Read: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['contentProcessor'],',roledefid=',parameters('roleIds')?['addReadNoEdit'],')')", {}, after('Grant_Employee_Snapshot_Read')),
    Grant_Acl_Reconciler_Snapshot: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['aclReconciler'],',roledefid=',parameters('roleIds')?['aclReconciler'],')')", {}, after('Grant_Content_Processor_Snapshot_Add_Read')),
    Grant_Recovery_Snapshot_Full_Control: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['recoveryAdmin'],',roledefid=',parameters('roleIds')?['fullControl'],')')", {}, after('Grant_Acl_Reconciler_Snapshot')),
    Break_Safe_Operation_Role_Inheritance: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')", {}, after('Grant_Recovery_Snapshot_Full_Control')),
    Grant_Manager_Safe_Operation_Read: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/roleassignments/addroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Break_Safe_Operation_Role_Inheritance')),
    Grant_Employee_Safe_Operation_Read: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/roleassignments/addroleassignment(principalid=',first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Grant_Manager_Safe_Operation_Read')),
    Grant_Content_Processor_Operation_Mutator: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['contentProcessor'],',roledefid=',parameters('roleIds')?['mutatorNoDelete'],')')", {}, after('Grant_Employee_Safe_Operation_Read')),
    Grant_Acl_Reconciler_Operation: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['aclReconciler'],',roledefid=',parameters('roleIds')?['aclReconciler'],')')", {}, after('Grant_Content_Processor_Operation_Mutator')),
    Grant_Recovery_Operation_Full_Control: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['recoveryAdmin'],',roledefid=',parameters('roleIds')?['fullControl'],')')", {}, after('Grant_Acl_Reconciler_Operation')),
    Break_Control_Role_Inheritance: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=true)')", {}, after('Grant_Recovery_Operation_Full_Control')),
    Grant_Manager_Control_Read: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/roleassignments/addroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Break_Control_Role_Inheritance')),
    Grant_Employee_Control_Read: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/roleassignments/addroleassignment(principalid=',first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Grant_Manager_Control_Read')),
    Grant_Content_Processor_Control_Editor: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['contentProcessor'],',roledefid=',parameters('roleIds')?['draftEditor'],')')", {}, after('Grant_Employee_Control_Read')),
    Grant_Acl_Reconciler_Control: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['aclReconciler'],',roledefid=',parameters('roleIds')?['aclReconciler'],')')", {}, after('Grant_Content_Processor_Control_Editor')),
    Grant_Recovery_Control_Full_Control: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/roleassignments/addroleassignment(principalid=',parameters('principalIds')?['recoveryAdmin'],',roledefid=',parameters('roleIds')?['fullControl'],')')", {}, after('Grant_Acl_Reconciler_Control')),
    ...pagedAclReadActions('Read_Draft_Native_ACL_Assignments_After_Apply', 'Apply_Draft', 'DraftItemUri', after('Grant_Recovery_Control_Full_Control')),
    ...pagedAclReadActions('Read_Snapshot_Native_ACL_Assignments_After_Apply', 'Apply_Snapshot', 'SnapshotItemUri', after('Read_Draft_Native_ACL_Assignments_After_Apply')),
    ...pagedAclReadActions('Read_Safe_Operation_Native_ACL_Assignments_After_Apply', 'Apply_Operation', 'OperationItemUri', after('Read_Snapshot_Native_ACL_Assignments_After_Apply')),
    ...pagedAclReadActions('Read_Native_ACL_Assignments_After_Apply', 'Apply_Control', 'ProtectedControlItemUri', after('Read_Safe_Operation_Native_ACL_Assignments_After_Apply')),
    Filter_Draft_Employee_Reader_Assignments: { type: 'Query', inputs: { from: "@body('Read_Draft_Native_ACL_Assignments_After_Apply')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID']),equals(length(item()?['RoleDefinitionBindings']),1),equals(first(item()?['RoleDefinitionBindings'])?['Id'],parameters('roleIds')?['itemReader']),equals(first(item()?['RoleDefinitionBindings'])?['Name'],'KCF KPI Option E Item Reader v1'),equals(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'],1))" }, runAfter: after('Read_Native_ACL_Assignments_After_Apply') },
    Filter_Draft_Employee_Editor_Assignments: { type: 'Query', inputs: { from: "@body('Read_Draft_Native_ACL_Assignments_After_Apply')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID']),contains(string(item()?['RoleDefinitionBindings']),string(parameters('roleIds')?['draftEditor'])))" }, runAfter: after('Filter_Draft_Employee_Reader_Assignments') },
    Filter_Snapshot_Manager_Reader_Assignments: { type: 'Query', inputs: { from: "@body('Read_Snapshot_Native_ACL_Assignments_After_Apply')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID']),equals(length(item()?['RoleDefinitionBindings']),1),equals(first(item()?['RoleDefinitionBindings'])?['Id'],parameters('roleIds')?['itemReader']),equals(first(item()?['RoleDefinitionBindings'])?['Name'],'KCF KPI Option E Item Reader v1'),equals(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'],1))" }, runAfter: after('Filter_Draft_Employee_Editor_Assignments') },
    Filter_Operation_Manager_Reader_Assignments: { type: 'Query', inputs: { from: "@body('Read_Safe_Operation_Native_ACL_Assignments_After_Apply')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID']),equals(length(item()?['RoleDefinitionBindings']),1),equals(first(item()?['RoleDefinitionBindings'])?['Id'],parameters('roleIds')?['itemReader']),equals(first(item()?['RoleDefinitionBindings'])?['Name'],'KCF KPI Option E Item Reader v1'),equals(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'],1))" }, runAfter: after('Filter_Snapshot_Manager_Reader_Assignments') },
    Filter_Control_Manager_Reader_Assignments: { type: 'Query', inputs: { from: "@body('Read_Native_ACL_Assignments_After_Apply')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID']),equals(length(item()?['RoleDefinitionBindings']),1),equals(first(item()?['RoleDefinitionBindings'])?['Id'],parameters('roleIds')?['itemReader']),equals(first(item()?['RoleDefinitionBindings'])?['Name'],'KCF KPI Option E Item Reader v1'),equals(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'],1))" }, runAfter: after('Filter_Operation_Manager_Reader_Assignments') },
    Select_Draft_Complete_Assignment_Tuples: nativeAclTupleSelect('Read_Draft_Native_ACL_Assignments_After_Apply', after('Filter_Control_Manager_Reader_Assignments')),
    Select_Snapshot_Complete_Assignment_Tuples: nativeAclTupleSelect('Read_Snapshot_Native_ACL_Assignments_After_Apply', after('Select_Draft_Complete_Assignment_Tuples')),
    Select_Operation_Complete_Assignment_Tuples: nativeAclTupleSelect('Read_Safe_Operation_Native_ACL_Assignments_After_Apply', after('Select_Snapshot_Complete_Assignment_Tuples')),
    Select_Control_Complete_Assignment_Tuples: nativeAclTupleSelect('Read_Native_ACL_Assignments_After_Apply', after('Select_Operation_Complete_Assignment_Tuples')),
    Filter_Invalid_Draft_Assignment_Rows: invalidAclRowFilter('Read_Draft_Native_ACL_Assignments_After_Apply', after('Select_Control_Complete_Assignment_Tuples')),
    Filter_Invalid_Snapshot_Assignment_Rows: invalidAclRowFilter('Read_Snapshot_Native_ACL_Assignments_After_Apply', after('Filter_Invalid_Draft_Assignment_Rows')),
    Filter_Invalid_Operation_Assignment_Rows: invalidAclRowFilter('Read_Safe_Operation_Native_ACL_Assignments_After_Apply', after('Filter_Invalid_Snapshot_Assignment_Rows')),
    Filter_Invalid_Control_Assignment_Rows: invalidAclRowFilter('Read_Native_ACL_Assignments_After_Apply', after('Filter_Invalid_Operation_Assignment_Rows')),
    Expected_Draft_Complete_Assignment_Tuples: expectedAclSet('mutatorNoDelete', 'KCF KPI Option E Mutator No Delete v1', 7, false, after('Filter_Invalid_Control_Assignment_Rows')),
    Expected_Snapshot_Complete_Assignment_Tuples: expectedAclSet('addReadNoEdit', 'KCF KPI Option E Add Read No Edit v1', 3, true, after('Expected_Draft_Complete_Assignment_Tuples')),
    Expected_Operation_Complete_Assignment_Tuples: expectedAclSet('mutatorNoDelete', 'KCF KPI Option E Mutator No Delete v1', 7, true, after('Expected_Snapshot_Complete_Assignment_Tuples')),
    Expected_Control_Complete_Assignment_Tuples: expectedAclSet('draftEditor', 'KCF KPI Option E Draft Editor v1', 5, true, after('Expected_Operation_Complete_Assignment_Tuples')),
    Read_Employee_Effective_Permissions_After_Apply: http(aclRef, 'GET', "@concat(variables('DraftItemUri'),'/getusereffectivepermissions(@u)?@u=''',uriComponent(body('Read_Request_A')?['Author/EMail']),'''')", undefined, after('Expected_Control_Complete_Assignment_Tuples')),
    Read_Manager_Snapshot_Effective_Permissions_After_Apply: http(aclRef, 'GET', "@concat(variables('SnapshotItemUri'),'/getusereffectivepermissions(@u)?@u=''',uriComponent(first(body('Read_Current_Manager_From_People')?['value'])?['Email']),'''')", undefined, after('Read_Employee_Effective_Permissions_After_Apply')),
    Read_Manager_Operation_Effective_Permissions_After_Apply: http(aclRef, 'GET', "@concat(variables('OperationItemUri'),'/getusereffectivepermissions(@u)?@u=''',uriComponent(first(body('Read_Current_Manager_From_People')?['value'])?['Email']),'''')", undefined, after('Read_Manager_Snapshot_Effective_Permissions_After_Apply')),
    Read_Manager_Effective_Permissions_After_Apply: http(aclRef, 'GET', "@concat(variables('ProtectedControlItemUri'),'/getusereffectivepermissions(@u)?@u=''',uriComponent(first(body('Read_Current_Manager_From_People')?['value'])?['Email']),'''')", undefined, after('Read_Manager_Operation_Effective_Permissions_After_Apply')),
    ACL_Apply_Complete_Assignment_Sets_Are_Exact: condition(and(
      eq("@variables('HierarchyEpoch')", "@variables('AclEpoch')"),
      eq("@length(body('Filter_Draft_Employee_Reader_Assignments'))", 1),
      eq("@length(body('Filter_Draft_Employee_Editor_Assignments'))", 0),
      eq("@length(body('Filter_Snapshot_Manager_Reader_Assignments'))", 1),
      eq("@length(body('Filter_Operation_Manager_Reader_Assignments'))", 1),
      eq("@length(body('Filter_Control_Manager_Reader_Assignments'))", 1),
      eq("@body('Read_Employee_Effective_Permissions_After_Apply')?['High']", 0),
      eq("@body('Read_Employee_Effective_Permissions_After_Apply')?['Low']", 1),
      eq("@body('Read_Manager_Snapshot_Effective_Permissions_After_Apply')?['High']", 0),
      eq("@body('Read_Manager_Snapshot_Effective_Permissions_After_Apply')?['Low']", 1),
      eq("@body('Read_Manager_Operation_Effective_Permissions_After_Apply')?['High']", 0),
      eq("@body('Read_Manager_Operation_Effective_Permissions_After_Apply')?['Low']", 1),
      eq("@body('Read_Manager_Effective_Permissions_After_Apply')?['High']", 0),
      eq("@body('Read_Manager_Effective_Permissions_After_Apply')?['Low']", 1),
      eq("@length(body('Filter_Invalid_Draft_Assignment_Rows'))", 0),
      eq("@length(body('Filter_Invalid_Snapshot_Assignment_Rows'))", 0),
      eq("@length(body('Filter_Invalid_Operation_Assignment_Rows'))", 0),
      eq("@length(body('Filter_Invalid_Control_Assignment_Rows'))", 0),
      eq("@length(body('Select_Draft_Complete_Assignment_Tuples'))", "@length(outputs('Expected_Draft_Complete_Assignment_Tuples'))"),
      eq("@length(body('Select_Snapshot_Complete_Assignment_Tuples'))", "@length(outputs('Expected_Snapshot_Complete_Assignment_Tuples'))"),
      eq("@length(body('Select_Operation_Complete_Assignment_Tuples'))", "@length(outputs('Expected_Operation_Complete_Assignment_Tuples'))"),
      eq("@length(body('Select_Control_Complete_Assignment_Tuples'))", "@length(outputs('Expected_Control_Complete_Assignment_Tuples'))"),
      eq("@length(body('Select_Draft_Complete_Assignment_Tuples'))", "@length(union(body('Select_Draft_Complete_Assignment_Tuples'),body('Select_Draft_Complete_Assignment_Tuples')))"),
      eq("@length(body('Select_Snapshot_Complete_Assignment_Tuples'))", "@length(union(body('Select_Snapshot_Complete_Assignment_Tuples'),body('Select_Snapshot_Complete_Assignment_Tuples')))"),
      eq("@length(body('Select_Operation_Complete_Assignment_Tuples'))", "@length(union(body('Select_Operation_Complete_Assignment_Tuples'),body('Select_Operation_Complete_Assignment_Tuples')))"),
      eq("@length(body('Select_Control_Complete_Assignment_Tuples'))", "@length(union(body('Select_Control_Complete_Assignment_Tuples'),body('Select_Control_Complete_Assignment_Tuples')))"),
      eq("@string(sort(body('Select_Draft_Complete_Assignment_Tuples')))", "@string(sort(outputs('Expected_Draft_Complete_Assignment_Tuples')))"),
      eq("@string(sort(body('Select_Snapshot_Complete_Assignment_Tuples')))", "@string(sort(outputs('Expected_Snapshot_Complete_Assignment_Tuples')))"),
      eq("@string(sort(body('Select_Operation_Complete_Assignment_Tuples')))", "@string(sort(outputs('Expected_Operation_Complete_Assignment_Tuples')))"),
      eq("@string(sort(body('Select_Control_Complete_Assignment_Tuples')))", "@string(sort(outputs('Expected_Control_Complete_Assignment_Tuples')))"),
      ...aclEnumerationProof('Read_Draft_Native_ACL_Assignments_After_Apply', 'DraftItemUri'),
      ...aclEnumerationProof('Read_Snapshot_Native_ACL_Assignments_After_Apply', 'SnapshotItemUri'),
      ...aclEnumerationProof('Read_Safe_Operation_Native_ACL_Assignments_After_Apply', 'OperationItemUri'),
      ...aclEnumerationProof('Read_Native_ACL_Assignments_After_Apply', 'ProtectedControlItemUri')
    ), { Advance_AclVerified: advance('AclVerified', 'AclVerified', "@variables('ExactControlETag')") }, {
      Revoke_Unverified_Manager_Grant: scope({
        Revoke_Unverified_Manager_Snapshot: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}),
        Revoke_Unverified_Manager_Operation: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Revoke_Unverified_Manager_Snapshot')),
        Revoke_Unverified_Manager_Control: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Revoke_Unverified_Manager_Operation'))
      }),
      ...failure('AclProof', 'AclProofMismatch')
    }, after('Read_Manager_Effective_Permissions_After_Apply'))
  }, {}, after('ControlPointed_Checkpoint'));

  tryActions.Require_Fresh_Native_ACL_Readback_At_AclVerified = condition(and(
    eq("@variables('FailureCode')", ''),
    or(
      and(eq("@variables('DurableOutcome')", 'Running'), eq("@variables('Checkpoint')", 'AclVerified')),
      and(eq("@variables('DurableOutcome')", 'Completed'), eq("@variables('Checkpoint')", 'Completed'))
    )
  ), {
    ...pagedAclReadActions('Fresh_Read_Draft_Native_ACL_Assignments', 'Fresh_Draft', 'DraftItemUri'),
    ...pagedAclReadActions('Fresh_Read_Snapshot_Native_ACL_Assignments', 'Fresh_Snapshot', 'SnapshotItemUri', after('Fresh_Read_Draft_Native_ACL_Assignments')),
    ...pagedAclReadActions('Fresh_Read_Safe_Operation_Native_ACL_Assignments', 'Fresh_Operation', 'OperationItemUri', after('Fresh_Read_Snapshot_Native_ACL_Assignments')),
    ...pagedAclReadActions('Fresh_Read_Native_ACL_Assignments', 'Fresh_Control', 'ProtectedControlItemUri', after('Fresh_Read_Safe_Operation_Native_ACL_Assignments')),
    Fresh_Filter_Draft_Employee_Reader_Assignments: { type: 'Query', inputs: { from: "@body('Fresh_Read_Draft_Native_ACL_Assignments')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID']),equals(length(item()?['RoleDefinitionBindings']),1),equals(first(item()?['RoleDefinitionBindings'])?['Id'],parameters('roleIds')?['itemReader']),equals(first(item()?['RoleDefinitionBindings'])?['Name'],'KCF KPI Option E Item Reader v1'),equals(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'],1))" }, runAfter: after('Fresh_Read_Native_ACL_Assignments') },
    Fresh_Filter_Draft_Employee_Editor_Assignments: { type: 'Query', inputs: { from: "@body('Fresh_Read_Draft_Native_ACL_Assignments')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Actor_From_Native_Created_By')?['value'])?['PrincipalID']),contains(string(item()?['RoleDefinitionBindings']),string(parameters('roleIds')?['draftEditor'])))" }, runAfter: after('Fresh_Filter_Draft_Employee_Reader_Assignments') },
    Fresh_Filter_Snapshot_Manager_Reader_Assignments: { type: 'Query', inputs: { from: "@body('Fresh_Read_Snapshot_Native_ACL_Assignments')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID']),equals(length(item()?['RoleDefinitionBindings']),1),equals(first(item()?['RoleDefinitionBindings'])?['Id'],parameters('roleIds')?['itemReader']),equals(first(item()?['RoleDefinitionBindings'])?['Name'],'KCF KPI Option E Item Reader v1'),equals(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'],1))" }, runAfter: after('Fresh_Filter_Draft_Employee_Editor_Assignments') },
    Fresh_Filter_Operation_Manager_Reader_Assignments: { type: 'Query', inputs: { from: "@body('Fresh_Read_Safe_Operation_Native_ACL_Assignments')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID']),equals(length(item()?['RoleDefinitionBindings']),1),equals(first(item()?['RoleDefinitionBindings'])?['Id'],parameters('roleIds')?['itemReader']),equals(first(item()?['RoleDefinitionBindings'])?['Name'],'KCF KPI Option E Item Reader v1'),equals(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'],1))" }, runAfter: after('Fresh_Filter_Snapshot_Manager_Reader_Assignments') },
    Fresh_Filter_Control_Manager_Reader_Assignments: { type: 'Query', inputs: { from: "@body('Fresh_Read_Native_ACL_Assignments')?['value']", where: "@and(equals(item()?['PrincipalId'],first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID']),equals(length(item()?['RoleDefinitionBindings']),1),equals(first(item()?['RoleDefinitionBindings'])?['Id'],parameters('roleIds')?['itemReader']),equals(first(item()?['RoleDefinitionBindings'])?['Name'],'KCF KPI Option E Item Reader v1'),equals(first(item()?['RoleDefinitionBindings'])?['RoleTypeKind'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High'],0),equals(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'],1))" }, runAfter: after('Fresh_Filter_Operation_Manager_Reader_Assignments') },
    Fresh_Select_Draft_Complete_Assignment_Tuples: nativeAclTupleSelect('Fresh_Read_Draft_Native_ACL_Assignments', after('Fresh_Filter_Control_Manager_Reader_Assignments')),
    Fresh_Select_Snapshot_Complete_Assignment_Tuples: nativeAclTupleSelect('Fresh_Read_Snapshot_Native_ACL_Assignments', after('Fresh_Select_Draft_Complete_Assignment_Tuples')),
    Fresh_Select_Operation_Complete_Assignment_Tuples: nativeAclTupleSelect('Fresh_Read_Safe_Operation_Native_ACL_Assignments', after('Fresh_Select_Snapshot_Complete_Assignment_Tuples')),
    Fresh_Select_Control_Complete_Assignment_Tuples: nativeAclTupleSelect('Fresh_Read_Native_ACL_Assignments', after('Fresh_Select_Operation_Complete_Assignment_Tuples')),
    Fresh_Filter_Invalid_Draft_Assignment_Rows: invalidAclRowFilter('Fresh_Read_Draft_Native_ACL_Assignments', after('Fresh_Select_Control_Complete_Assignment_Tuples')),
    Fresh_Filter_Invalid_Snapshot_Assignment_Rows: invalidAclRowFilter('Fresh_Read_Snapshot_Native_ACL_Assignments', after('Fresh_Filter_Invalid_Draft_Assignment_Rows')),
    Fresh_Filter_Invalid_Operation_Assignment_Rows: invalidAclRowFilter('Fresh_Read_Safe_Operation_Native_ACL_Assignments', after('Fresh_Filter_Invalid_Snapshot_Assignment_Rows')),
    Fresh_Filter_Invalid_Control_Assignment_Rows: invalidAclRowFilter('Fresh_Read_Native_ACL_Assignments', after('Fresh_Filter_Invalid_Operation_Assignment_Rows')),
    Fresh_Expected_Draft_Complete_Assignment_Tuples: expectedAclSet('mutatorNoDelete', 'KCF KPI Option E Mutator No Delete v1', 7, false, after('Fresh_Filter_Invalid_Control_Assignment_Rows')),
    Fresh_Expected_Snapshot_Complete_Assignment_Tuples: expectedAclSet('addReadNoEdit', 'KCF KPI Option E Add Read No Edit v1', 3, true, after('Fresh_Expected_Draft_Complete_Assignment_Tuples')),
    Fresh_Expected_Operation_Complete_Assignment_Tuples: expectedAclSet('mutatorNoDelete', 'KCF KPI Option E Mutator No Delete v1', 7, true, after('Fresh_Expected_Snapshot_Complete_Assignment_Tuples')),
    Fresh_Expected_Control_Complete_Assignment_Tuples: expectedAclSet('draftEditor', 'KCF KPI Option E Draft Editor v1', 5, true, after('Fresh_Expected_Operation_Complete_Assignment_Tuples')),
    Fresh_Read_Employee_Effective_Permissions: http(aclRef, 'GET', "@concat(variables('DraftItemUri'),'/getusereffectivepermissions(@u)?@u=''',uriComponent(body('Read_Request_A')?['Author/EMail']),'''')", undefined, after('Fresh_Expected_Control_Complete_Assignment_Tuples')),
    Fresh_Read_Manager_Snapshot_Effective_Permissions: http(aclRef, 'GET', "@concat(variables('SnapshotItemUri'),'/getusereffectivepermissions(@u)?@u=''',uriComponent(first(body('Read_Current_Manager_From_People')?['value'])?['Email']),'''')", undefined, after('Fresh_Read_Employee_Effective_Permissions')),
    Fresh_Read_Manager_Operation_Effective_Permissions: http(aclRef, 'GET', "@concat(variables('OperationItemUri'),'/getusereffectivepermissions(@u)?@u=''',uriComponent(first(body('Read_Current_Manager_From_People')?['value'])?['Email']),'''')", undefined, after('Fresh_Read_Manager_Snapshot_Effective_Permissions')),
    Fresh_Read_Manager_Effective_Permissions: http(aclRef, 'GET', "@concat(variables('ProtectedControlItemUri'),'/getusereffectivepermissions(@u)?@u=''',uriComponent(first(body('Read_Current_Manager_From_People')?['value'])?['Email']),'''')", undefined, after('Fresh_Read_Manager_Operation_Effective_Permissions')),
    Fresh_ACL_Complete_Assignment_Sets_Are_Exact: condition(and(
      eq("@variables('HierarchyEpoch')", "@variables('AclEpoch')"),
      eq("@length(body('Fresh_Filter_Draft_Employee_Reader_Assignments'))", 1),
      eq("@length(body('Fresh_Filter_Draft_Employee_Editor_Assignments'))", 0),
      eq("@length(body('Fresh_Filter_Snapshot_Manager_Reader_Assignments'))", 1),
      eq("@length(body('Fresh_Filter_Operation_Manager_Reader_Assignments'))", 1),
      eq("@length(body('Fresh_Filter_Control_Manager_Reader_Assignments'))", 1),
      eq("@body('Fresh_Read_Employee_Effective_Permissions')?['High']", 0),
      eq("@body('Fresh_Read_Employee_Effective_Permissions')?['Low']", 1),
      eq("@body('Fresh_Read_Manager_Snapshot_Effective_Permissions')?['High']", 0),
      eq("@body('Fresh_Read_Manager_Snapshot_Effective_Permissions')?['Low']", 1),
      eq("@body('Fresh_Read_Manager_Operation_Effective_Permissions')?['High']", 0),
      eq("@body('Fresh_Read_Manager_Operation_Effective_Permissions')?['Low']", 1),
      eq("@body('Fresh_Read_Manager_Effective_Permissions')?['High']", 0),
      eq("@body('Fresh_Read_Manager_Effective_Permissions')?['Low']", 1),
      eq("@length(body('Fresh_Filter_Invalid_Draft_Assignment_Rows'))", 0),
      eq("@length(body('Fresh_Filter_Invalid_Snapshot_Assignment_Rows'))", 0),
      eq("@length(body('Fresh_Filter_Invalid_Operation_Assignment_Rows'))", 0),
      eq("@length(body('Fresh_Filter_Invalid_Control_Assignment_Rows'))", 0),
      eq("@length(body('Fresh_Select_Draft_Complete_Assignment_Tuples'))", "@length(outputs('Fresh_Expected_Draft_Complete_Assignment_Tuples'))"),
      eq("@length(body('Fresh_Select_Snapshot_Complete_Assignment_Tuples'))", "@length(outputs('Fresh_Expected_Snapshot_Complete_Assignment_Tuples'))"),
      eq("@length(body('Fresh_Select_Operation_Complete_Assignment_Tuples'))", "@length(outputs('Fresh_Expected_Operation_Complete_Assignment_Tuples'))"),
      eq("@length(body('Fresh_Select_Control_Complete_Assignment_Tuples'))", "@length(outputs('Fresh_Expected_Control_Complete_Assignment_Tuples'))"),
      eq("@length(body('Fresh_Select_Draft_Complete_Assignment_Tuples'))", "@length(union(body('Fresh_Select_Draft_Complete_Assignment_Tuples'),body('Fresh_Select_Draft_Complete_Assignment_Tuples')))"),
      eq("@length(body('Fresh_Select_Snapshot_Complete_Assignment_Tuples'))", "@length(union(body('Fresh_Select_Snapshot_Complete_Assignment_Tuples'),body('Fresh_Select_Snapshot_Complete_Assignment_Tuples')))"),
      eq("@length(body('Fresh_Select_Operation_Complete_Assignment_Tuples'))", "@length(union(body('Fresh_Select_Operation_Complete_Assignment_Tuples'),body('Fresh_Select_Operation_Complete_Assignment_Tuples')))"),
      eq("@length(body('Fresh_Select_Control_Complete_Assignment_Tuples'))", "@length(union(body('Fresh_Select_Control_Complete_Assignment_Tuples'),body('Fresh_Select_Control_Complete_Assignment_Tuples')))"),
      eq("@string(sort(body('Fresh_Select_Draft_Complete_Assignment_Tuples')))", "@string(sort(outputs('Fresh_Expected_Draft_Complete_Assignment_Tuples')))"),
      eq("@string(sort(body('Fresh_Select_Snapshot_Complete_Assignment_Tuples')))", "@string(sort(outputs('Fresh_Expected_Snapshot_Complete_Assignment_Tuples')))"),
      eq("@string(sort(body('Fresh_Select_Operation_Complete_Assignment_Tuples')))", "@string(sort(outputs('Fresh_Expected_Operation_Complete_Assignment_Tuples')))"),
      eq("@string(sort(body('Fresh_Select_Control_Complete_Assignment_Tuples')))", "@string(sort(outputs('Fresh_Expected_Control_Complete_Assignment_Tuples')))"),
      ...aclEnumerationProof('Fresh_Read_Draft_Native_ACL_Assignments', 'DraftItemUri'),
      ...aclEnumerationProof('Fresh_Read_Snapshot_Native_ACL_Assignments', 'SnapshotItemUri'),
      ...aclEnumerationProof('Fresh_Read_Safe_Operation_Native_ACL_Assignments', 'OperationItemUri'),
      ...aclEnumerationProof('Fresh_Read_Native_ACL_Assignments', 'ProtectedControlItemUri')
    ), { Set_FreshAclProofValid: setVariable('FreshAclProofValid', true) }, {
      Revoke_Manager_After_Fresh_Proof_Failure: scope({
        Fresh_Revoke_Manager_Snapshot: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}),
        Fresh_Revoke_Manager_Operation: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Fresh_Revoke_Manager_Snapshot')),
        Fresh_Revoke_Manager_Control: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Fresh_Revoke_Manager_Operation'))
      }),
      ...failure('FreshAclProof', 'FreshAclProofMismatch')
    }, after('Fresh_Read_Manager_Effective_Permissions'))
  }, {}, after('AclVerified_Checkpoint'));

  tryActions.Completed_Checkpoint = condition(and(
    eq("@variables('FailureCode')", ''), eq("@variables('DurableOutcome')", 'Running'),
    eq("@variables('Checkpoint')", 'AclVerified'), eq("@variables('FreshAclProofValid')", true)
  ), {
    Read_Control_Before_Completion: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')"),
    Read_Operation_Before_Completion: http(contentRef, 'GET', operationQuery, undefined, after('Read_Control_Before_Completion')),
    Completion_Prior_State_And_Ownership_Are_Exact: condition(and(
      eq("@body('Read_Control_Before_Completion')?['State']", 'Submitted'),
      eq("@body('Read_Control_Before_Completion')?['LastOperationKey']", "@variables('OperationKey')"),
      eq("@body('Read_Control_Before_Completion')?['CurrentSubmittedSnapshotKey']", "@variables('SnapshotKey')"),
      eq("@length(body('Read_Operation_Before_Completion')?['value'])", 1),
      eq("@first(body('Read_Operation_Before_Completion')?['value'])?['OperationKey']", "@variables('OperationKey')"),
      eq("@first(body('Read_Operation_Before_Completion')?['value'])?['RequestKey']", "@variables('RequestKey')"),
      eq("@first(body('Read_Operation_Before_Completion')?['value'])?['Checkpoint']", 'AclVerified'),
      eq("@first(body('Read_Operation_Before_Completion')?['value'])?['Outcome']", 'Running'),
      or(
        and(
          eq("@body('Read_Control_Before_Completion')?['TransitionStatus']", 'AclPending'),
          eq("@body('Read_Control_Before_Completion')?['PendingRequestKey']", "@variables('RequestKey')"),
          eq("@first(body('Read_Operation_Before_Completion')?['value'])?['ObservedControlETag']", "@body('Read_Control_Before_Completion')?['@odata.etag']")
        ),
        and(
          eq("@body('Read_Control_Before_Completion')?['TransitionStatus']", 'Ready'),
          eq("@body('Read_Control_Before_Completion')?['PendingRequestKey']", ''),
          eq("@body('Read_Control_Before_Completion')?['AclEpoch']", "@body('Read_Control_Before_Completion')?['HierarchyEpoch']")
        )
      )
    ), {
      CAS_Control_To_Submitted_Ready: http(contentRef, 'PATCH', "@variables('ProtectedControlItemUri')", {
        State: 'Submitted', TransitionStatus: 'Ready', PendingRequestKey: '', CurrentSubmittedSnapshotKey: "@variables('SnapshotKey')",
        AclEpoch: "@variables('HierarchyEpoch')", LastOperationKey: "@variables('OperationKey')"
      }, {}, { 'If-Match': "@body('Read_Control_Before_Completion')?['@odata.etag']" }),
      Read_Control_After_Completion: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')", undefined, afterAny('CAS_Control_To_Submitted_Ready')),
      Completion_Control_Readback_Is_Exact: condition(and(
        eq("@body('Read_Control_After_Completion')?['State']", 'Submitted'),
        eq("@body('Read_Control_After_Completion')?['TransitionStatus']", 'Ready'),
        eq("@body('Read_Control_After_Completion')?['PendingRequestKey']", ''),
        eq("@body('Read_Control_After_Completion')?['CurrentSubmittedSnapshotKey']", "@variables('SnapshotKey')"),
        eq("@body('Read_Control_After_Completion')?['LastOperationKey']", "@variables('OperationKey')"),
        eq("@body('Read_Control_After_Completion')?['AclEpoch']", "@body('Read_Control_After_Completion')?['HierarchyEpoch']"),
        { not: eq("@body('Read_Control_After_Completion')?['@odata.etag']", "@body('Read_Control_Before_Completion')?['@odata.etag']") }
      ), { Advance_Completed: advance('Completed', 'Completed', "@body('Read_Control_After_Completion')?['@odata.etag']") },
      failure('Completion', 'CompletionUncertain'), after('Read_Control_After_Completion'))
    }, failure('CompletionPriorState', 'CompletionPriorStateOrOwnershipMismatch'), after('Read_Operation_Before_Completion'))
  }, {}, after('Require_Fresh_Native_ACL_Readback_At_AclVerified'));

  tryActions.Prove_Final_Completed_State = condition(and(
    eq("@variables('FailureCode')", ''), eq("@variables('DurableOutcome')", 'Completed'),
    eq("@variables('Checkpoint')", 'Completed'), eq("@variables('FreshAclProofValid')", true)
  ), {
    Read_Final_Completed_Operation: http(contentRef, 'GET', operationQuery),
    Read_Final_Completed_Control: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')", undefined, after('Read_Final_Completed_Operation')),
    Final_Completed_Readback_Is_Exact: condition(and(
      eq("@length(body('Read_Final_Completed_Operation')?['value'])", 1),
      eq("@first(body('Read_Final_Completed_Operation')?['value'])?['OperationKey']", "@variables('OperationKey')"),
      eq("@first(body('Read_Final_Completed_Operation')?['value'])?['RequestKey']", "@variables('RequestKey')"),
      eq("@first(body('Read_Final_Completed_Operation')?['value'])?['WorkplanKey']", "@body('Read_Request_A')?['WorkplanKey']"),
      eq("@first(body('Read_Final_Completed_Operation')?['value'])?['PersonKey']", "@body('Read_Request_A')?['PersonKey']"),
      eq("@first(body('Read_Final_Completed_Operation')?['value'])?['PerformanceYear']", "@body('Read_Request_A')?['PerformanceYear']"),
      eq("@first(body('Read_Final_Completed_Operation')?['value'])?['ProcessorIdentity']", 'KCFKPIOptionESubmitProcessorV1'),
      eq("@first(body('Read_Final_Completed_Operation')?['value'])?['Outcome']", 'Completed'),
      eq("@first(body('Read_Final_Completed_Operation')?['value'])?['Checkpoint']", 'Completed'),
      eq("@body('Read_Final_Completed_Control')?['State']", 'Submitted'),
      eq("@body('Read_Final_Completed_Control')?['TransitionStatus']", 'Ready'),
      eq("@body('Read_Final_Completed_Control')?['PendingRequestKey']", ''),
      eq("@body('Read_Final_Completed_Control')?['CurrentSubmittedSnapshotKey']", "@variables('SnapshotKey')"),
      eq("@body('Read_Final_Completed_Control')?['LastOperationKey']", "@variables('OperationKey')"),
      eq("@body('Read_Final_Completed_Control')?['AclEpoch']", "@body('Read_Final_Completed_Control')?['HierarchyEpoch']")
    ), { Durable_Completed_Result: { type: 'Compose', inputs: { outcome: 'Completed', operationKey: "@variables('OperationKey')" }, runAfter: {} } }, {
      Fail_Closed_Ambiguous_Completion: terminate('CompletedNotDurable', 'Completed operation/control canonical readback did not match.')
    }, after('Read_Final_Completed_Control'))
  }, {}, after('Completed_Checkpoint'));

  actions.Try_Governed_Submit = scope(tryActions, after(previous));

  const terminalActions = {
    Read_Control_For_Terminal_Commit: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')"),
    Terminal_Is_RecoveryHold: condition(eq("@variables('TerminalIntent')", 'RecoveryHold'), {
      CAS_Control_To_RecoveryHold: http(contentRef, 'PATCH', "@variables('ProtectedControlItemUri')", {
        TransitionStatus: 'RecoveryHold', PendingRequestKey: "@variables('RequestKey')", LastOperationKey: "@variables('OperationKey')"
      }, {}, { 'If-Match': "@body('Read_Control_For_Terminal_Commit')?['@odata.etag']" })
    }, { Preserve_Competing_Control_For_Rejected_Proof: { type: 'Compose', inputs: 'Rejected', runAfter: {} } }, after('Read_Control_For_Terminal_Commit')),
    Read_Control_After_Terminal_Intent: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')", undefined, afterAny('Terminal_Is_RecoveryHold')),
    Patch_Terminal_Operation: http(contentRef, 'PATCH', "@variables('OperationItemUri')", {
      Outcome: "@variables('TerminalIntent')", ErrorCode: "@variables('FailureCode')",
      ErrorDetail: "@concat('Fail-closed governed Submit: ',variables('FailureCode'))"
    }, after('Read_Control_After_Terminal_Intent'), { 'If-Match': "@variables('ExactOperationETag')" }),
    Read_Terminal_Operation_Canonical: http(contentRef, 'GET', operationQuery, undefined, afterAny('Patch_Terminal_Operation')),
    Terminal_Operation_And_Control_Readback_Are_Exact: condition(and(
      eq("@length(body('Read_Terminal_Operation_Canonical')?['value'])", 1),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['OperationKey']", "@variables('OperationKey')"),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['RequestKey']", "@variables('RequestKey')"),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['WorkplanKey']", "@body('Read_Request_A')?['WorkplanKey']"),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['PersonKey']", "@body('Read_Request_A')?['PersonKey']"),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['PerformanceYear']", "@body('Read_Request_A')?['PerformanceYear']"),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['ProcessorIdentity']", 'KCFKPIOptionESubmitProcessorV1'),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['Outcome']", "@variables('TerminalIntent')"),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['ErrorCode']", "@variables('FailureCode')"),
      eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['ErrorDetail']", "@concat('Fail-closed governed Submit: ',variables('FailureCode'))"),
      { not: eq("@first(body('Read_Terminal_Operation_Canonical')?['value'])?['@odata.etag']", "@variables('ExactOperationETag')") },
      or(
        and(eq("@variables('TerminalIntent')", 'RecoveryHold'), eq("@body('Read_Control_After_Terminal_Intent')?['TransitionStatus']", 'RecoveryHold'), eq("@body('Read_Control_After_Terminal_Intent')?['PendingRequestKey']", "@variables('RequestKey')"), eq("@body('Read_Control_After_Terminal_Intent')?['LastOperationKey']", "@variables('OperationKey')")),
        and(eq("@variables('TerminalIntent')", 'Rejected'), { not: eq("@body('Read_Control_After_Terminal_Intent')?['PendingRequestKey']", "@variables('RequestKey')") }, { not: eq("@body('Read_Control_After_Terminal_Intent')?['LastOperationKey']", "@variables('OperationKey')") })
      )
    ), { Durable_Terminal_Result: { type: 'Compose', inputs: { outcome: "@variables('TerminalIntent')", errorCode: "@variables('FailureCode')" }, runAfter: {} } }, {
      Fail_Closed_Ambiguous_Terminal: terminate('TerminalOutcomeNotDurable', 'Rejected/RecoveryHold was not proven by operation and control readback.')
    }, after('Read_Terminal_Operation_Canonical'))
  };
  actions.Commit_Business_Terminal = condition({ not: eq("@variables('FailureCode')", '') }, {
    Has_Durable_Operation_For_Terminal: condition(and(
      { not: eq("@variables('TerminalIntent')", 'FailClosedNoTerminal') },
      { greater: ["@length(variables('ExactOperationETag'))", 0] }
    ), { Commit_Terminal_Outcome_With_Canonical_Readback: scope(terminalActions) }, {
      Fail_Closed_Without_Terminal_Claim: terminate('PreOperationFailClosed', 'No durable operation exists; no Rejected result is returned.')
    })
  }, { No_Business_Terminal_Needed: { type: 'Compose', inputs: 'CompletedOrResumable', runAfter: {} } }, after('Try_Governed_Submit'));

  actions.Catch_And_Durably_Commit_RecoveryHold = scope({
    Read_Operation_After_Unexpected_Failure: http(contentRef, 'GET', operationQuery),
    Read_Control_After_Unexpected_Failure: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')", undefined, after('Read_Operation_After_Unexpected_Failure')),
    Revoke_Unverified_Manager_After_Partial_ACL: condition(or(eq("@variables('Checkpoint')", 'ControlPointed'), eq("@variables('Checkpoint')", 'AclVerified')), {
      Revoke_Manager_In_Catch: scope({
        Catch_Revoke_Manager_Snapshot: http(aclRef, 'POST', "@concat(variables('SnapshotItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}),
        Catch_Revoke_Manager_Operation: http(aclRef, 'POST', "@concat(variables('OperationItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Catch_Revoke_Manager_Snapshot')),
        Catch_Revoke_Manager_Control: http(aclRef, 'POST', "@concat(variables('ProtectedControlItemUri'),'/roleassignments/removeroleassignment(principalid=',first(body('Read_Current_Manager_From_People')?['value'])?['PrincipalID'],',roledefid=',parameters('roleIds')?['itemReader'],')')", {}, after('Catch_Revoke_Manager_Operation'))
      })
    }, {}, after('Read_Control_After_Unexpected_Failure')),
    Catch_Can_Durably_Commit_RecoveryHold: condition(and(
      eq("@length(body('Read_Operation_After_Unexpected_Failure')?['value'])", 1),
      eq("@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['OperationKey']", "@variables('OperationKey')"),
      eq("@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['RequestKey']", "@variables('RequestKey')"),
      eq("@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['WorkplanKey']", "@body('Read_Request_A')?['WorkplanKey']"),
      eq("@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['PersonKey']", "@body('Read_Request_A')?['PersonKey']"),
      eq("@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['PerformanceYear']", "@body('Read_Request_A')?['PerformanceYear']"),
      eq("@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['ProcessorIdentity']", 'KCFKPIOptionESubmitProcessorV1'),
      eq("@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['Outcome']", 'Running'),
      or(eq("@body('Read_Control_After_Unexpected_Failure')?['PendingRequestKey']", ''), eq("@body('Read_Control_After_Unexpected_Failure')?['PendingRequestKey']", "@variables('RequestKey')")),
      or(eq("@body('Read_Control_After_Unexpected_Failure')?['LastOperationKey']", ''), eq("@body('Read_Control_After_Unexpected_Failure')?['LastOperationKey']", "@variables('OperationKey')"))
    ), {
      CAS_Catch_Control_To_RecoveryHold: http(contentRef, 'PATCH', "@variables('ProtectedControlItemUri')", {
        TransitionStatus: 'RecoveryHold', PendingRequestKey: "@variables('RequestKey')", LastOperationKey: "@variables('OperationKey')"
      }, {}, { 'If-Match': "@body('Read_Control_After_Unexpected_Failure')?['@odata.etag']" }),
      Read_Catch_Control_RecoveryHold: http(contentRef, 'GET', "@variables('ProtectedControlItemUri')", undefined, afterAny('CAS_Catch_Control_To_RecoveryHold')),
      Patch_Catch_Operation_RecoveryHold: http(contentRef, 'PATCH',
        "@concat('/_api/web/lists(guid''',parameters('listIds')?['KCFKPI_WorkplanSubmitOperations'],''')/items(',first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['ID'],')')", {
          Outcome: 'RecoveryHold', ErrorCode: 'UnexpectedConnectorOrExpressionFailure',
          ErrorDetail: 'Catch commits only after canonical control and operation readback.'
        }, after('Read_Catch_Control_RecoveryHold'), { 'If-Match': "@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['@odata.etag']" }),
      Read_Catch_Operation_RecoveryHold: http(contentRef, 'GET', operationQuery, undefined, afterAny('Patch_Catch_Operation_RecoveryHold')),
      Catch_RecoveryHold_Readback_Is_Exact: condition(and(
        eq("@length(body('Read_Catch_Operation_RecoveryHold')?['value'])", 1),
        eq("@body('Read_Catch_Control_RecoveryHold')?['TransitionStatus']", 'RecoveryHold'),
        eq("@body('Read_Catch_Control_RecoveryHold')?['PendingRequestKey']", "@variables('RequestKey')"),
        eq("@body('Read_Catch_Control_RecoveryHold')?['LastOperationKey']", "@variables('OperationKey')"),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['OperationKey']", "@variables('OperationKey')"),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['RequestKey']", "@variables('RequestKey')"),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['WorkplanKey']", "@body('Read_Request_A')?['WorkplanKey']"),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['PersonKey']", "@body('Read_Request_A')?['PersonKey']"),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['PerformanceYear']", "@body('Read_Request_A')?['PerformanceYear']"),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['ProcessorIdentity']", 'KCFKPIOptionESubmitProcessorV1'),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['Outcome']", 'RecoveryHold'),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['ErrorCode']", 'UnexpectedConnectorOrExpressionFailure'),
        eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['ErrorDetail']", 'Catch commits only after canonical control and operation readback.'),
        { not: eq("@first(body('Read_Catch_Operation_RecoveryHold')?['value'])?['@odata.etag']", "@first(body('Read_Operation_After_Unexpected_Failure')?['value'])?['@odata.etag']") }
      ), { Durable_Catch_RecoveryHold_Result: { type: 'Compose', inputs: { outcome: 'RecoveryHold' }, runAfter: {} } }, {
        Fail_Closed_Catch_Ambiguity: terminate('CatchRecoveryHoldNotDurable', 'No terminal outcome is returned from ambiguous catch state.')
      }, after('Read_Catch_Operation_RecoveryHold'))
    }, { Fail_Closed_Catch_Without_Durable_Authority: terminate('CatchCannotCommitTerminal', 'No exact operation/control authority exists.') },
    after('Revoke_Unverified_Manager_After_Partial_ACL'))
  }, { Try_Governed_Submit: ['Failed', 'TimedOut'] });

  return {
    name: identity.workflowUniqueName, displayName: identity.workflowDisplayName, workflowId: identity.workflowId,
    properties: {
      state: 'Off', enabled: false, activated: false,
      definitionSummary: 'Disabled, unbound executable governed Submit state machine. Import, binding and activation require separate authority.',
      checkpointOrder: ['Validated', 'ControlClaimed', 'SnapshotWritten', 'AuditWritten', 'ControlPointed', 'AclVerified', 'Completed'],
      terminalOutcomes: ['Rejected', 'RecoveryHold'],
      governedSubmitContract: {
        submitContractVersion: 'kcf.kpi.option-e.submit.v3',
        requestDoubleRead: true, createdByAuthority: true, peopleAuthority: true,
        authoritativeCurrentReferenceData: true, payloadAuthorityForbidden: true,
        etagIfMatch: true, canonicalReadback: true, uniqueOperationSnapshotAudit: true,
        requestSourceSnapshot: true, draftSourceSnapshotForbidden: true, writeRetriesDisabled: true,
        recoveryHold: true, exactNativeAclProof: true, freshAclProofOnResume: true,
        nonEmptyNegativeIdentities: true, durableTerminalReadback: true,
        packagedPayloadSemanticValidation: true, exactSeparateAclTargets: true,
        completeIdentitySetProof: true, explicitAclContinuationValidation: true, stateGuardedCas: true,
        epochEqualityBeforeReady: true, immutableEvidenceNoDelete: true,
        requestKey: 'PersonKey|PerformanceYear|ClientSubmitID', operationKey: 'RequestKey',
        snapshotKey: 'RequestKey', auditKey: 'RequestKey|WorkplanSubmitted'
      },
      connectionReferences: {
        [contentRef]: { apiId, connectionId: null, displayName: 'KCF KPI Option E Content Processor SharePoint' },
        [aclRef]: { apiId, connectionId: null, displayName: 'KCF KPI Option E ACL Reconciler SharePoint' }
      },
      definition: {
        $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',
        contentVersion: identity.version,
        parameters: {
          $connections: { type: 'Object', defaultValue: { [contentRef]: null, [aclRef]: null } },
          siteUrl: { type: 'String', defaultValue: null }, listIds: { type: 'Object', defaultValue: null },
          referenceListIds: { type: 'Object', defaultValue: null },
          principalIds: { type: 'Object', defaultValue: null }, roleIds: { type: 'Object', defaultValue: null }
        },
        triggers: {
          When_a_new_immutable_Submit_Request_is_created: {
            type: 'OpenApiConnection', runtimeConfiguration: { concurrency: { runs: 1 } },
            inputs: {
              host: { apiId, connectionName: contentRef, operationId: 'GetOnNewItems' },
              parameters: { dataset: "@parameters('siteUrl')", table: "@parameters('listIds')?['KCFKPI_WorkplanSubmitRequests']" },
              retryPolicy: { type: 'none' }, authentication: "@parameters('$authentication')"
            }
          }
        }, actions, outputs: {}
      }
    }
  };
};

const assertSources = (definition, binding) => {
  const refs = definition.properties?.connectionReferences || {};
  const expectedRefs = ['kcfkpi_optione_aclreconciler_sp', 'kcfkpi_optione_contentprocessor_sp'];
  if (definition.name !== identity.workflowUniqueName || definition.workflowId !== identity.workflowId
    || definition.properties?.state !== 'Off' || definition.properties?.enabled !== false
    || definition.properties?.activated !== false
    || JSON.stringify(Object.keys(refs).sort()) !== JSON.stringify(expectedRefs)
    || Object.values(refs).some(ref => ref.connectionId !== null
      || ref.apiId !== '/providers/Microsoft.PowerApps/apis/shared_sharepointonline')) {
    throw new Error('DEFINITION_IDENTITY_OR_POSTURE_INVALID');
  }
  const workflow = definition.properties.definition;
  const triggerValues = Object.values(workflow?.triggers || {});
  if (triggerValues.length !== 1 || triggerValues[0].runtimeConfiguration?.concurrency?.runs !== 1) {
    throw new Error('TRIGGER_CONCURRENCY_INVALID');
  }

  const actions = new Map(); const parents = new Map();
  const visit = (collection, parent = 'root') => {
    if (!collection || typeof collection !== 'object' || Array.isArray(collection)) return;
    for (const [name, action] of Object.entries(collection)) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) continue;
      if (actions.has(name)) throw new Error('DUPLICATE_EXECUTABLE_ACTION:' + name);
      actions.set(name, action); parents.set(name, parent);
      visit(action.actions, name); visit(action.else?.actions, name);
    }
  };
  visit(workflow?.actions);
  [
    'Parse_Immutable_Request_Payload', 'Packaged_Payload_Semantics_Are_Valid',
    'Read_Authoritative_Draft_A', 'Read_Authoritative_Draft_B',
    'Draft_Request_Bytes_And_Hash_Are_Exact',
    'Read_Current_Core_KPI_References', 'Read_Current_Core_Target_References',
    'Read_Current_Behaviour_Framework_Set', 'Read_Current_Behaviour_Framework_Values',
    'Read_Current_Person_Behaviour_Assignment', 'Read_Current_Behaviour_Prompts',
    'Protected_Assigned_Current_References_Are_Exact',
    'Read_Protected_Control_Before_Operation', 'Protected_Control_Is_Fresh_Before_Create',
    'Create_Unique_Operation', 'Canonical_Read_Operation', 'Operation_Readback_Is_Canonical',
    'Create_Immutable_Snapshot_From_Request_A', 'Create_Append_Only_Audit',
    'CAS_Control_To_Submitted_AclPending',
    'ACL_Apply_Complete_Assignment_Sets_Are_Exact',
    'Fresh_ACL_Complete_Assignment_Sets_Are_Exact',
    'CAS_Control_To_Submitted_Ready',
    'Terminal_Operation_And_Control_Readback_Are_Exact',
    'Catch_RecoveryHold_Readback_Is_Exact'
  ].forEach(name => { if (!actions.has(name)) throw new Error('EXECUTABLE_ACTION_MISSING:' + name); });

  const actionText = name => JSON.stringify(actions.get(name) || {});
  const allText = JSON.stringify({ definition, binding });
  if (!actionText('Parse_Immutable_Request_Payload').includes('kcf.workplan-draft/v1')
    || !actionText('Parse_Immutable_Request_Payload').includes('kpiVersionKey')
    || !actionText('Parse_Immutable_Request_Payload').includes('targetVersionKey')
    || !actionText('Parse_Immutable_Request_Payload').includes('descriptorKey')
    || !actionText('Parse_Immutable_Request_Payload').includes('guidancePromptKeys')) {
    throw new Error('SAVED_DRAFT_SCHEMA_NOT_EXECUTABLE');
  }
  if (!actionText('Draft_Request_Bytes_And_Hash_Are_Exact').includes('DraftPayloadJSON')
    || !actionText('Draft_Request_Bytes_And_Hash_Are_Exact').includes('DraftPayloadSHA256')
    || !actionText('Draft_Request_Bytes_And_Hash_Are_Exact').includes('DraftETag')
    || !actionText('Draft_Request_Bytes_And_Hash_Are_Exact').includes('DraftVersion')
    || !actionText('Draft_Request_Bytes_And_Hash_Are_Exact').includes('Read_Authoritative_Draft_A')
    || !actionText('Draft_Request_Bytes_And_Hash_Are_Exact').includes('Read_Authoritative_Draft_B')) {
    throw new Error('DRAFT_PROVENANCE_PROOF_INCOMPLETE');
  }
  const referenceText = actionText('Protected_Assigned_Current_References_Are_Exact');
  [
    'Select_Submitted_Core_KPI_Keys', 'Select_Current_Core_KPI_Keys',
    'Select_Submitted_Core_Target_Keys', 'Select_Current_Core_Target_Keys',
    'CatalogueVersion', 'sha256', 'Read_Current_Behaviour_Framework_Set',
    'Read_Current_Person_Behaviour_Assignment', 'Select_Submitted_Behaviour_Value_Keys',
    'Select_Submitted_Behaviour_Descriptor_Keys', 'SubmittedPromptCoordinates',
    'Select_Authoritative_Behaviour_Prompt_Coordinates'
  ].forEach(token => {
    if (!referenceText.includes(token)) throw new Error('REFERENCE_PROOF_INCOMPLETE:' + token);
  });
  if (actions.get('Protected_Assigned_Current_References_Are_Exact')?.runAfter?.Draft_Request_Bytes_And_Hash_Are_Exact?.[0] !== 'Succeeded'
    || actions.get('Pre_Operation_Authority_Proof')?.runAfter?.Protected_Assigned_Current_References_Are_Exact?.[0] !== 'Succeeded'
    || parents.get('Create_Unique_Operation') !== 'Protected_Control_Is_Fresh_Before_Create') {
    throw new Error('PRE_OPERATION_PROOF_ORDER_INVALID');
  }

  const expectedListIds = [
    'KCFKPI_Audit', 'KCFKPI_People', 'KCFKPI_WorkplanDrafts',
    'KCFKPI_WorkplanSubmitOperations', 'KCFKPI_WorkplanSubmitRequests',
    'KCFKPI_WorkplanSubmittedSnapshots', 'KCFKPI_Workplans'
  ].sort();
  const expectedReferenceIds = [
    'KCFKPI_AnnualTargets', 'KCFKPI_BehaviourFrameworkSets', 'KCFKPI_BehaviourFrameworkValues',
    'KCFKPI_BehaviourObjectiveLibrary', 'KCFKPI_KPIMaster', 'KCFKPI_PersonBehaviourAssignments'
  ].sort();
  const exactKeys = (value, expected) => JSON.stringify(Object.keys(value || {}).sort()) === JSON.stringify(expected);
  if (!exactKeys(binding.listIds, expectedListIds) || !exactKeys(binding.referenceListIds, expectedReferenceIds)) {
    throw new Error('BINDING_NAMESPACE_CLOSURE_INVALID');
  }
  const listRefs = [...allText.matchAll(/parameters\('listIds'\)\?\['([^']+)'\]/g)].map(match => match[1]);
  const referenceListRefs = [...allText.matchAll(/parameters\('referenceListIds'\)\?\['([^']+)'\]/g)].map(match => match[1]);
  if (listRefs.some(name => !expectedListIds.includes(name))
    || referenceListRefs.some(name => !expectedReferenceIds.includes(name))
    || expectedListIds.some(name => !listRefs.includes(name))
    || expectedReferenceIds.some(name => !referenceListRefs.includes(name))) {
    throw new Error('DEFINITION_BINDING_NAMESPACE_CLOSURE_INVALID');
  }

  const aclPaginationSpecs = [
    ['Read_Draft_Native_ACL_Assignments_After_Apply', 'Apply_Draft', 'DraftItemUri'],
    ['Read_Snapshot_Native_ACL_Assignments_After_Apply', 'Apply_Snapshot', 'SnapshotItemUri'],
    ['Read_Safe_Operation_Native_ACL_Assignments_After_Apply', 'Apply_Operation', 'OperationItemUri'],
    ['Read_Native_ACL_Assignments_After_Apply', 'Apply_Control', 'ProtectedControlItemUri'],
    ['Fresh_Read_Draft_Native_ACL_Assignments', 'Fresh_Draft', 'DraftItemUri'],
    ['Fresh_Read_Snapshot_Native_ACL_Assignments', 'Fresh_Snapshot', 'SnapshotItemUri'],
    ['Fresh_Read_Safe_Operation_Native_ACL_Assignments', 'Fresh_Operation', 'OperationItemUri'],
    ['Fresh_Read_Native_ACL_Assignments', 'Fresh_Control', 'ProtectedControlItemUri']
  ];
  aclPaginationSpecs.forEach(([name, tag, target]) => {
    const output = actions.get(name);
    const collection = actions.get(`Set_${tag}_ACL_Collection`);
    const enumerate = actions.get(`Enumerate_${tag}_ACL_Pages`);
    const pageRead = actions.get(`GET_${tag}_ACL_Page`);
    const validate = actions.get(`Validate_${tag}_ACL_Page`);
    const record = actions.get(`Record_${tag}_ACL_Continuation`);
    const setNext = actions.get(`Set_${tag}_ACL_Next_Page`);
    const reject = actions.get(`Reject_${tag}_Unsafe_ACL_Page`);
    const validateText = JSON.stringify(validate || {});
    const recordValue = String(record?.inputs?.value || '');
    const setNextValue = String(setNext?.inputs?.value || '');
    const canonicalValue = recordValue.startsWith('@') ? recordValue.slice(1) : '';
    if (output?.type !== 'Compose'
      || !String(output?.inputs?.canonicalCollectionUri || '').includes('AclExpectedCollectionUri')
      || collection?.type !== 'SetVariable' || collection?.inputs?.name !== 'AclExpectedCollectionUri'
      || !String(collection?.inputs?.value || '').includes(`variables('${target}')`)
      || !String(collection?.inputs?.value || '').includes('/RoleAssignments')
      || enumerate?.type !== 'Until' || enumerate?.limit?.count !== 100 || enumerate?.limit?.timeout !== 'PT5M'
      || pageRead?.type !== 'OpenApiConnection'
      || pageRead?.inputs?.parameters?.['parameters/method'] !== 'GET'
      || pageRead?.inputs?.parameters?.['parameters/uri'] !== "@variables('AclContinuationUri')"
      || pageRead?.runtimeConfiguration?.paginationPolicy !== undefined
      || validate?.type !== 'If' || reject?.type !== 'Terminate'
      || record?.type !== 'AppendToArrayVariable' || record?.inputs?.name !== 'AclSeenContinuations'
      || setNext?.type !== 'SetVariable' || setNext?.inputs?.name !== 'AclContinuationUri'
      || recordValue !== setNextValue
      || !recordValue.includes('@if(') || !recordValue.includes('AclCanonicalSiteUrl')
      || !recordValue.includes('substring(') || !recordValue.includes('@odata.nextLink')
      || !canonicalValue || !validateText.includes(`contains(variables('AclSeenContinuations'),${canonicalValue})`)
      || reject?.inputs?.runError?.code !== 'UnsafeAclContinuation') {
      throw new Error('ACL_EXPLICIT_PAGINATION_TOPOLOGY_INVALID:' + name);
    }
    [
      '@odata.nextLink', 'odata.nextLink', '__next', '$skiptoken=', 'AclCanonicalSiteUrl',
      'AclExpectedCollectionUri', 'AclSeenContinuations', 'match', '%2f', '%5c', '%25', '%23', '%3f'
    ].forEach(token => {
      if (!validateText.includes(token)) throw new Error('ACL_CONTINUATION_GUARD_INVALID:' + name + ':' + token);
    });
  });
  ['ACL_Apply_Complete_Assignment_Sets_Are_Exact', 'Fresh_ACL_Complete_Assignment_Sets_Are_Exact']
    .forEach(name => {
      const text = actionText(name);
      [
        'Complete_Assignment_Tuples', 'Expected_', 'Filter_Invalid_', '@odata.nextLink',
        'canonicalCollectionUri', 'continuationUris', 'pageCount', 'totalCount', 'union', 'sort'
      ].forEach(token => {
        if (!text.includes(token)) throw new Error('COMPLETE_ACL_SET_PROOF_INVALID:' + name + ':' + token);
      });
    });
  if (parents.get('Advance_AclVerified') !== 'ACL_Apply_Complete_Assignment_Sets_Are_Exact'
    || parents.get('CAS_Control_To_Submitted_Ready') !== 'Completion_Prior_State_And_Ownership_Are_Exact') {
    throw new Error('ACL_PAGINATION_PROTECTED_WRITE_ORDER_INVALID');
  }
  ['Select_Draft_Complete_Assignment_Tuples', 'Fresh_Select_Draft_Complete_Assignment_Tuples'].forEach(name => {
    if (!actionText(name).includes('RoleDefinitionBindings') || !actionText(name).includes('PrincipalType')) {
      throw new Error('ACL_TUPLE_PROJECTION_INVALID:' + name);
    }
  });

  const initialised = new Set();
  for (const action of actions.values()) {
    if (action.type === 'InitializeVariable') {
      for (const variable of action.inputs?.variables || []) initialised.add(variable.name);
    }
  }
  const referenced = new Set(); const variableExpression = /variables\('([^']+)'\)/g;
  let match;
  while ((match = variableExpression.exec(JSON.stringify(workflow))) !== null) referenced.add(match[1]);
  for (const name of referenced) if (!initialised.has(name)) throw new Error('VARIABLE_NOT_INITIALISED:' + name);

  const httpActions = [...actions.values()].filter(action => action.type === 'OpenApiConnection'
    && action.inputs?.host?.operationId === 'HttpRequest');
  const methods = httpActions.map(action => String(action.inputs?.parameters?.['parameters/method'] || '').toUpperCase());
  if (methods.includes('PUT') || methods.includes('DELETE')
    || methods.filter(method => method === 'POST').length < 20
    || methods.filter(method => method === 'PATCH').length < 8
    || httpActions.some(action => action.inputs?.retryPolicy?.type !== 'none')) {
    throw new Error('EXECUTABLE_READ_WRITE_RETRY_TOPOLOGY_INVALID');
  }
  const catchStatuses = actions.get('Catch_And_Durably_Commit_RecoveryHold')?.runAfter?.Try_Governed_Submit || [];
  if (!catchStatuses.includes('Failed') || !catchStatuses.includes('TimedOut')) throw new Error('CATCH_RUN_AFTER_INVALID');

  if (binding.enabled !== false || binding.activated !== false || binding.environmentId !== null
    || binding.testSiteUrl !== null || binding.contentConnectionId !== null || binding.aclConnectionId !== null
    || Object.values(binding.listIds || {}).some(value => value !== null)
    || Object.values(binding.referenceListIds || {}).some(value => value !== null)
    || Object.values(binding.principalIds || {}).some(value => value !== null)
    || Object.values(binding.roleIds || {}).some(value => value !== null)) {
    throw new Error('BINDING_NOT_FAIL_CLOSED');
  }
  if (/(?:client_secret|access_token|refresh_token|password)\s*["':=]+\s*(?!null)/i.test(allText)) {
    throw new Error('SECRET_MATERIAL_DETECTED');
  }
  if (/https:\/\/(?!schema\.management\.azure\.com\b)[^"\s]+/i.test(allText)) {
    throw new Error('NON_SCHEMA_URL_DETECTED');
  }
};

async function build() {
  const bindingRaw = await readFile(join(root, relative.binding), 'utf8');
  const definition = buildExecutableDefinition(); const binding = JSON.parse(bindingRaw);
  assertSources(definition, binding);
  const definitionText = serialise(definition); const bindingText = serialise(binding);
  const packagedWorkflowText = serialise({ ...definition, schemaVersion: identity.version });
  const packageEntries = [
    { name: '[Content_Types].xml', data: contentTypes },
    { name: 'Other/Customizations.xml', data: customizations },
    { name: 'Other/Solution.xml', data: solution },
    { name: `Workflows/${identity.workflowUniqueName}-${identity.workflowId}.json`, data: packagedWorkflowText },
    { name: `Workflows/${identity.workflowUniqueName}-${identity.workflowId}.json.data.xml`, data: workflowData }
  ];
  const packageBytes = deterministicZip(packageEntries);
  const outputs = new Map([
    [relative.binding, Buffer.from(bindingText)], [relative.definition, Buffer.from(definitionText)],
    [relative.contentTypes, Buffer.from(contentTypes)], [relative.customizations, Buffer.from(customizations)],
    [relative.solution, Buffer.from(solution)], [relative.workflow, Buffer.from(packagedWorkflowText)],
    [relative.workflowData, Buffer.from(workflowData)], [relative.package, packageBytes]
  ]);
  const generatedFiles = [...outputs.entries()].map(([file, bytes]) => ({ file, bytes: bytes.length, sha256: hash(bytes) }));
  generatedFiles.sort((left, right) => left.file.localeCompare(right.file));
  const manifest = {
    contractVersion: 'kcf.kpi.option-e.submit.package.v3', submitContractVersion: 'kcf.kpi.option-e.submit.v3',
    generationEpoch: '2000-01-01T00:00:00Z',
    deterministic: true, selfExcluded: true, disabled: true, unbound: true,
    solutionUniqueName: identity.solutionUniqueName, solutionDisplayName: identity.solutionDisplayName,
    version: identity.version, workflowUniqueName: identity.workflowUniqueName,
    workflowDisplayName: identity.workflowDisplayName, workflowId: identity.workflowId,
    stateCode: 0, statusCode: 1, packageName: relative.package.split('/').pop(),
    connectionReferences: ['kcfkpi_optione_contentprocessor_sp', 'kcfkpi_optione_aclreconciler_sp'],
    triggerCount: 1, triggerConcurrency: 1, writeRetryPolicy: 'none',
    zipEntries: packageEntries.map(item => item.name).sort(), generatedFiles
  };
  outputs.set(relative.manifest, Buffer.from(serialise(manifest)));
  return { outputs, manifest };
}

const writeOutputs = async (base, outputs) => {
  for (const [file, bytes] of outputs) {
    const target = join(base, file); await mkdir(dirname(target), { recursive: true }); await writeFile(target, bytes);
  }
};
const check = async outputs => {
  for (const [file, expected] of outputs) {
    let actual;
    try { actual = await readFile(join(root, file)); } catch { throw new Error(`MISSING_GENERATED_FILE:${file}`); }
    if (!actual.equals(expected)) throw new Error(`GENERATED_FILE_DRIFT:${file}`);
  }
};

const args = process.argv.slice(2); const mode = args[0] || '--check';
const { outputs, manifest } = await build();
if (mode === '--write') await writeOutputs(root, outputs);
else if (mode === '--out') {
  if (!args[1]) throw new Error('OUT_PATH_REQUIRED'); await writeOutputs(resolve(args[1]), outputs);
} else if (mode === '--check') await check(outputs);
else throw new Error(`UNKNOWN_MODE:${mode}`);
process.stdout.write(`${JSON.stringify({ mode, root: mode === '--out' ? resolve(args[1]) : root,
  packageSha256: manifest.generatedFiles.find(file => file.file === relative.package).sha256,
  manifestSha256: hash(outputs.get(relative.manifest)), generatedFileCount: outputs.size })}\n`);
