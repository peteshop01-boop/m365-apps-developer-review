import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const workflowPath = path.join(
  root,
  'power-platform',
  'KCFKPIEmployeeTESTProcessor',
  'Workflows',
  'KCFKPIEmployeeTESTCommandProcessor-fce11d54-525e-4281-afd5-f4023317d09b.json'
);

const site = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const lists = Object.freeze({
  people: 'c89a7c3c-4ad7-45ca-ae17-5c108c318598',
  commands: '3e05ec37-95ce-4a30-a56c-ff2437bf9bed',
  workplans: '47210791-25f1-416e-ab24-832c8b6448ec',
  items: '98f2a280-46a7-40b5-a37d-db97b02fc826',
  receipts: '3eb157c8-6290-4e1b-ad6b-d41e4a2293b9',
  audit: '59a00c55-5ceb-4561-a5d5-0942edb5ad6d'
});

const runAfter = (name, outcomes = ['Succeeded']) => ({ [name]: outcomes });
const sharePointAction = (operationId, table, parameters, after = {}) => ({
  runAfter: after,
  type: 'OpenApiConnection',
  inputs: {
    host: {
      apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline',
      connectionName: 'shared_sharepointonline',
      operationId
    },
    parameters: { dataset: site, table, ...parameters },
    authentication: "@parameters('$authentication')"
  },
  runtimeConfiguration: { retryPolicy: { type: 'None' } }
});

const post = (table, parameters, after) => sharePointAction('PostItem', table, parameters, after);
const command = name => `@body('Get_Command_Authoritative_1')?['${name}']`;
const commandChoice = name => `@body('Get_Command_Authoritative_1')?['${name}']?['Value']`;
const commandType = commandChoice('CommandType');
const subjectType = commandChoice('SubjectType');
const actorEmail = "@toLower(body('Get_Command_Authoritative_1')?['Author']?['Email'])";
const derivedPersonKey = "@first(body('Filter_Active_People_For_Author'))?['PersonKey']";
const derivedSubjectKey = "@concat(first(body('Filter_Active_People_For_Author'))?['PersonKey'], '|', string(body('Get_Command_Authoritative_1')?['PerformanceYear']))";
const payload = name => `@body('Parse_JSON_Payload')?['${name}']`;
const nested = (container, name) => `@body('Parse_JSON_Payload')?['${container}']?['${name}']`;
const sourceVersion = "@string(body('Get_Command_Authoritative_1')?['{VersionNumber}'])";
const sourceEtag = "@body('Get_Command_Authoritative_1')?['@odata.etag']";
const receiptKey = `@concat('${lists.commands}|', string(body('Get_Command_Authoritative_1')?['ID']), '|', string(body('Get_Command_Authoritative_1')?['{VersionNumber}']), '|ETAG|', body('Get_Command_Authoritative_1')?['@odata.etag'])`;
const flowRun = "@workflow()?['run']?['name']";
const processorCorrelation = "@concat('KCF036|', workflow()?['run']?['name'])";
const auditKeyAccepted = `@concat('AUDIT|${lists.commands}|', string(body('Get_Command_Authoritative_1')?['ID']), '|ACCEPTED')`;
const auditKeyFor = code => `@concat('AUDIT|${lists.commands}|', string(body('Get_Command_Authoritative_1')?['ID']), '|${code}')`;
const resultKeys = "@string(createArray(outputs('Create_TEST_Workplan')?['body/WorkplanKey'], outputs('Create_TEST_Core')?['body/WorkplanItemKey'], outputs('Create_TEST_Personal')?['body/WorkplanItemKey'], outputs('Create_TEST_Behaviour')?['body/WorkplanItemKey']))";

const commonReceipt = (outcome, diagnosticHash = `@coalesce(body('Parse_JSON_Payload')?['payloadSha256'], '${'0'.repeat(64)}')`) => ({
  'item/Title': `@concat('${outcome} ', body('Get_Command_Authoritative_1')?['CommandKey'])`,
  'item/ReceiptKey': receiptKey,
  'item/SourceListId': lists.commands,
  'item/SourceItemId': command('ID'),
  'item/SourceItemVersion': sourceVersion,
  'item/CommandKey': command('CommandKey'),
  'item/CommandType/Value': commandType,
  'item/SubjectType/Value': subjectType,
  'item/SubjectKey': `@if(equals(length(body('Filter_Active_People_For_Author')), 1), concat(first(body('Filter_Active_People_For_Author'))?['PersonKey'], '|', string(body('Get_Command_Authoritative_1')?['PerformanceYear'])), body('Get_Command_Authoritative_1')?['SubjectKey'])`,
  'item/PersonKey': "@if(equals(length(body('Filter_Active_People_For_Author')), 1), first(body('Filter_Active_People_For_Author'))?['PersonKey'], body('Get_Command_Authoritative_1')?['PersonKey'])",
  'item/PerformanceYear': command('PerformanceYear'),
  'item/AuthenticatedActorEmail': actorEmail,
  'item/AuthenticatedActorPersonKey': "@if(equals(length(body('Filter_Active_People_For_Author')), 1), first(body('Filter_Active_People_For_Author'))?['PersonKey'], '')",
  'item/EffectiveRole/Value': outcome === 'Accepted' ? 'Employee' : 'Unresolved',
  'item/ProcessedByEmail': 'person003@example.invalid',
  'item/ProcessedAt': '@utcNow()',
  'item/Outcome/Value': outcome,
  'item/ProcessedPayloadSHA256': diagnosticHash,
  'item/CorrelationKey': processorCorrelation,
  'item/FlowRunReference': flowRun,
  'item/TestRunKey': command('TestRunKey')
});

const commonAudit = (success, event, auditKey) => ({
  'item/Title': `@concat('${event} ', body('Get_Command_Authoritative_1')?['CommandKey'])`,
  'item/AuditKey': auditKey,
  'item/EventType/Value': event,
  'item/SubjectType/Value': success ? 'Workplan' : 'Command',
  'item/SubjectKey': success ? derivedSubjectKey : command('SubjectKey'),
  'item/PerformanceYear': command('PerformanceYear'),
  'item/ActorEmail': actorEmail,
  'item/ActorRole': success ? 'Employee' : 'Unresolved',
  'item/EventAt': '@utcNow()',
  'item/BeforeJSON': '{}',
  'item/AfterJSON': command('PayloadJSON'),
  'item/CorrelationKey': processorCorrelation,
  'item/Source/Value': 'PowerAutomate',
  'item/SourceReference': command('CommandKey'),
  'item/Success': success,
  'item/TestRunKey': command('TestRunKey')
});

const visibleAscii = (maxLength, minLength = 0) => ({
  type: 'string', minLength, maxLength, pattern: '^[\\x20-\\x7E]*$'
});
const keyText = { type: 'string', minLength: 1, maxLength: 160, pattern: '^[A-Za-z0-9._:|\\-]+$' };
const nullableNumber = { type: ['number', 'null'] };
const nullableText = maxLength => ({ anyOf: [visibleAscii(maxLength), { type: 'null' }] });
const behaviourKeys = Object.freeze(
  [1, 2, 3, 4, 5].flatMap(heading => [1, 2, 3, 4, 5]
    .map(objective => `BHV-0${heading}-OBJ-0${objective}`))
);

const payloadSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'workplanKey', 'employeeEmail', 'employeeDisplayName', 'weights', 'core', 'personal', 'behaviour'],
  properties: {
    schemaVersion: { const: 'KCF-KPI-036-EMPLOYEE-DRAFT-V1' },
    workplanKey: keyText,
    employeeEmail: visibleAscii(254, 3),
    employeeDisplayName: visibleAscii(120, 1),
    payloadSha256: { type: 'string', pattern: '^[0-9A-Fa-f]{64}$' },
    weights: {
      type: 'object', additionalProperties: false, required: ['core', 'personal', 'behaviour'],
      properties: { core: { const: 70 }, personal: { const: 20 }, behaviour: { const: 10 } }
    },
    core: {
      type: 'object', additionalProperties: false,
      required: ['workplanItemKey', 'naturalKey', 'kpiId', 'kpiVersionKey', 'targetVersionKey', 'role',
        'contributionMethod', 'annualTargetValue', 'annualTargetText', 'q1TargetValue', 'q1TargetText',
        'q2TargetValue', 'q2TargetText', 'q3TargetValue', 'q3TargetText', 'q4TargetValue', 'q4TargetText'],
      properties: {
        workplanItemKey: keyText, naturalKey: keyText, kpiId: keyText, kpiVersionKey: keyText, targetVersionKey: keyText,
        role: { enum: ['AccountableOwner', 'DeliveryLead', 'Contributor', 'Oversight', 'EvidenceProvider'] },
        contributionMethod: { enum: ['AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight'] },
        annualTargetValue: nullableNumber, annualTargetText: nullableText(500),
        q1TargetValue: nullableNumber, q1TargetText: nullableText(500),
        q2TargetValue: nullableNumber, q2TargetText: nullableText(500),
        q3TargetValue: nullableNumber, q3TargetText: nullableText(500),
        q4TargetValue: nullableNumber, q4TargetText: nullableText(500)
      }
    },
    personal: {
      type: 'object', additionalProperties: false,
      required: ['workplanItemKey', 'naturalKey', 'wording', 'description', 'measure', 'measureType', 'scoringDirection',
        'percentageSourceScale', 'baselineValue', 'yearEndTargetValue', 'yearEndTargetText', 'q1TargetValue', 'q1TargetText',
        'q2TargetValue', 'q2TargetText', 'q3TargetValue', 'q3TargetText', 'q4TargetValue', 'q4TargetText', 'weight', 'unitLabel'],
      properties: {
        workplanItemKey: keyText, naturalKey: keyText, wording: visibleAscii(500, 1), description: visibleAscii(1000),
        measure: visibleAscii(500, 1), measureType: { enum: ['Count', 'Number', 'Percentage', 'Currency', 'Rate', 'Days', 'Score', 'Milestone', 'Other', 'TextStatus'] },
        scoringDirection: { enum: ['HigherIsBetter', 'LowerIsBetter', 'TargetRange', 'Milestone', 'TBC'] },
        percentageSourceScale: { enum: ['Fraction', 'Whole'] }, baselineValue: nullableNumber,
        yearEndTargetValue: nullableNumber, yearEndTargetText: nullableText(500),
        q1TargetValue: nullableNumber, q1TargetText: nullableText(500),
        q2TargetValue: nullableNumber, q2TargetText: nullableText(500),
        q3TargetValue: nullableNumber, q3TargetText: nullableText(500),
        q4TargetValue: nullableNumber, q4TargetText: nullableText(500),
        weight: { type: 'number', minimum: 0, maximum: 100 }, unitLabel: visibleAscii(80, 1)
      }
    },
    behaviour: {
      type: 'object', additionalProperties: false,
      required: ['workplanItemKey', 'naturalKey', 'behaviourId', 'behaviourVersionKey', 'objectiveSource',
        'sourceObjectiveKey', 'objectiveTitle', 'objectiveDescription', 'measure', 'evidenceDefinition',
        'selectedSuggestionKeys', 'customObjective', 'q1TargetText', 'q2TargetText', 'q3TargetText', 'q4TargetText',
        'q1TargetRating', 'q2TargetRating', 'q3TargetRating', 'q4TargetRating', 'weight', 'unit'],
      properties: {
        workplanItemKey: keyText, naturalKey: keyText,
        behaviourId: { enum: ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] },
        behaviourVersionKey: keyText, objectiveSource: { enum: ['Library', 'Custom'] },
        sourceObjectiveKey: nullableText(160), objectiveTitle: visibleAscii(300, 1),
        objectiveDescription: visibleAscii(1000), measure: visibleAscii(500), evidenceDefinition: visibleAscii(1000),
        selectedSuggestionKeys: { type: 'array', maxItems: 5, uniqueItems: true, items: { enum: behaviourKeys } },
        customObjective: visibleAscii(500), q1TargetText: visibleAscii(500), q2TargetText: visibleAscii(500),
        q3TargetText: visibleAscii(500), q4TargetText: visibleAscii(500),
        q1TargetRating: { type: 'number', minimum: 1, maximum: 5 }, q2TargetRating: { type: 'number', minimum: 1, maximum: 5 },
        q3TargetRating: { type: 'number', minimum: 1, maximum: 5 }, q4TargetRating: { type: 'number', minimum: 1, maximum: 5 },
        weight: { type: 'number', minimum: 0, maximum: 100 }, unit: visibleAscii(80, 1)
      }
    }
  }
};

const securitySnapshot = readName => ({
  SourceListGuid: lists.commands,
  ID: `@body('${readName}')?['ID']`,
  Title: `@body('${readName}')?['Title']`,
  CommandKey: `@body('${readName}')?['CommandKey']`,
  CommandType: `@body('${readName}')?['CommandType']?['Value']`,
  SubjectType: `@body('${readName}')?['SubjectType']?['Value']`,
  SubjectKey: `@body('${readName}')?['SubjectKey']`,
  PersonKey: `@body('${readName}')?['PersonKey']`,
  PerformanceYear: `@body('${readName}')?['PerformanceYear']`,
  Quarter: `@body('${readName}')?['Quarter']?['Value']`,
  ExpectedRowVersionToken: `@body('${readName}')?['ExpectedRowVersionToken']`,
  ExpectedETag: `@body('${readName}')?['ExpectedETag']`,
  PayloadJSON: `@body('${readName}')?['PayloadJSON']`,
  ClientVersion: `@body('${readName}')?['ClientVersion']`,
  ClientSubmittedAt: `@body('${readName}')?['ClientSubmittedAt']`,
  ClientCorrelationKey: `@body('${readName}')?['ClientCorrelationKey']`,
  TestRunKey: `@body('${readName}')?['TestRunKey']`,
  AuthorEmail: `@toLower(body('${readName}')?['Author']?['Email'])`,
  EditorEmail: `@toLower(body('${readName}')?['Editor']?['Email'])`,
  Created: `@body('${readName}')?['Created']`, Modified: `@body('${readName}')?['Modified']`,
  Version: `@body('${readName}')?['{VersionNumber}']`, ETag: `@body('${readName}')?['@odata.etag']`
});

const validActions = {
  Create_TEST_Workplan: post(lists.workplans, {
    'item/Title': "@concat('TEST Workplan ', first(body('Filter_Active_People_For_Author'))?['PersonKey'], '|', string(body('Get_Command_Authoritative_1')?['PerformanceYear']))",
    'item/WorkplanKey': derivedSubjectKey,
    'item/PersonKey': derivedPersonKey,
    'item/EmployeeDisplayName': "@first(body('Filter_Active_People_For_Author'))?['Title']",
    'item/EmployeeEmail': actorEmail,
    'item/PerformanceYear': command('PerformanceYear'),
    'item/State/Value': 'Draft',
    'item/AccessState/Value': 'EmployeeEdit',
    'item/TransitionStatus/Value': 'Ready',
    'item/TransitionCorrelationKey': processorCorrelation,
    'item/CoreCategoryWeight': nested('weights', 'core'),
    'item/PersonalCategoryWeight': nested('weights', 'personal'),
    'item/BehaviourCategoryWeight': nested('weights', 'behaviour'),
    'item/CategoryWeightingReason': 'KCF-KPI-036 controlled TEST vertical slice',
    'item/CoreWeightingMode/Value': 'Equal',
    'item/WorkplanVersion': 1,
    'item/RowVersionToken': 1,
    'item/TestRunKey': command('TestRunKey')
  }, {}),
  Create_TEST_Core: post(lists.items, {
    'item/Title': "@concat('TEST Core ', body('Parse_JSON_Payload')?['core']?['kpiId'])",
    'item/WorkplanItemKey': nested('core', 'workplanItemKey'),
    'item/WorkplanItemNaturalKey': nested('core', 'naturalKey'),
    'item/WorkplanKey': derivedSubjectKey,
    'item/PersonKey': derivedPersonKey,
    'item/PerformanceYear': command('PerformanceYear'),
    'item/ItemType/Value': 'CoreGold',
    'item/KPIID': nested('core', 'kpiId'),
    'item/KPIVersionKey': nested('core', 'kpiVersionKey'),
    'item/TargetVersionKey': nested('core', 'targetVersionKey'),
    'item/EmployeeKpiRole/Value': nested('core', 'role'),
    'item/ContributionMethod/Value': nested('core', 'contributionMethod'),
    'item/YearEndTargetValue': nested('core', 'annualTargetValue'),
    'item/YearEndTargetText': nested('core', 'annualTargetText'),
    'item/Q1TargetValue': nested('core', 'q1TargetValue'),
    'item/Q1TargetText': nested('core', 'q1TargetText'),
    'item/Q2TargetValue': nested('core', 'q2TargetValue'),
    'item/Q2TargetText': nested('core', 'q2TargetText'),
    'item/Q3TargetValue': nested('core', 'q3TargetValue'),
    'item/Q3TargetText': nested('core', 'q3TargetText'),
    'item/Q4TargetValue': nested('core', 'q4TargetValue'),
    'item/Q4TargetText': nested('core', 'q4TargetText'),
    'item/SharedTargetRule/Value': 'VisibleOnly',
    'item/DirectContributionEligible': false,
    'item/ContributionApprovalState/Value': 'Draft',
    'item/AdditiveApproved': false,
    'item/NonOverlapRequired': false,
    'item/NonOverlapApproved': false,
    'item/DisplayOrder': 1,
    'item/WorkplanVersion': 1,
    'item/AddedAt': '@utcNow()',
    'item/AddedByEmail': actorEmail,
    'item/ActiveInWorkplan': true,
    'item/TestRunKey': command('TestRunKey')
  }, runAfter('Create_TEST_Workplan')),
  Create_TEST_Personal: post(lists.items, {
    'item/Title': "@concat('TEST Personal ', body('Parse_JSON_Payload')?['personal']?['workplanItemKey'])",
    'item/WorkplanItemKey': nested('personal', 'workplanItemKey'),
    'item/WorkplanItemNaturalKey': nested('personal', 'naturalKey'),
    'item/WorkplanKey': derivedSubjectKey,
    'item/PersonKey': derivedPersonKey,
    'item/PerformanceYear': command('PerformanceYear'),
    'item/ItemType/Value': 'LocalPersonal',
    'item/LocalKPIWording': nested('personal', 'wording'),
    'item/LocalKPIDescription': nested('personal', 'description'),
    'item/LocalMeasure': nested('personal', 'measure'),
    'item/LocalMetricType/Value': nested('personal', 'measureType'),
    'item/LocalScoringDirection/Value': nested('personal', 'scoringDirection'),
    'item/LocalPercentageScale/Value': nested('personal', 'percentageSourceScale'),
    'item/LocalBaselineValue': nested('personal', 'baselineValue'),
    'item/YearEndTargetValue': nested('personal', 'yearEndTargetValue'),
    'item/YearEndTargetText': nested('personal', 'yearEndTargetText'),
    'item/Q1TargetValue': nested('personal', 'q1TargetValue'),
    'item/Q1TargetText': nested('personal', 'q1TargetText'),
    'item/Q2TargetValue': nested('personal', 'q2TargetValue'),
    'item/Q2TargetText': nested('personal', 'q2TargetText'),
    'item/Q3TargetValue': nested('personal', 'q3TargetValue'),
    'item/Q3TargetText': nested('personal', 'q3TargetText'),
    'item/Q4TargetValue': nested('personal', 'q4TargetValue'),
    'item/Q4TargetText': nested('personal', 'q4TargetText'),
    'item/PersonalItemWeight': nested('personal', 'weight'),
    'item/UnitLabel': nested('personal', 'unitLabel'),
    'item/DisplayOrder': 2,
    'item/WorkplanVersion': 1,
    'item/AddedAt': '@utcNow()',
    'item/AddedByEmail': actorEmail,
    'item/ActiveInWorkplan': true,
    'item/TestRunKey': command('TestRunKey')
  }, runAfter('Create_TEST_Core')),
  Create_TEST_Behaviour: post(lists.items, {
    'item/Title': "@concat('TEST Behaviour ', body('Parse_JSON_Payload')?['behaviour']?['behaviourId'])",
    'item/WorkplanItemKey': nested('behaviour', 'workplanItemKey'),
    'item/WorkplanItemNaturalKey': nested('behaviour', 'naturalKey'),
    'item/WorkplanKey': derivedSubjectKey,
    'item/PersonKey': derivedPersonKey,
    'item/PerformanceYear': command('PerformanceYear'),
    'item/ItemType/Value': 'Behaviour',
    'item/BehaviourID': nested('behaviour', 'behaviourId'),
    'item/BehaviourVersionKey': nested('behaviour', 'behaviourVersionKey'),
    'item/BehaviourObjectiveSource/Value': nested('behaviour', 'objectiveSource'),
    'item/BehaviourObjectiveKey': nested('behaviour', 'sourceObjectiveKey'),
    'item/BehaviourObjectiveTitle': nested('behaviour', 'objectiveTitle'),
    'item/BehaviourObjectiveDescription': nested('behaviour', 'objectiveDescription'),
    'item/BehaviourMeasure': nested('behaviour', 'measure'),
    'item/BehaviourEvidenceDefinition': nested('behaviour', 'evidenceDefinition'),
    'item/BehaviourSelectedSuggestionKeysJ': "@string(body('Parse_JSON_Payload')?['behaviour']?['selectedSuggestionKeys'])",
    'item/BehaviourCustomObjective': nested('behaviour', 'customObjective'),
    'item/Q1TargetText': nested('behaviour', 'q1TargetText'),
    'item/Q2TargetText': nested('behaviour', 'q2TargetText'),
    'item/Q3TargetText': nested('behaviour', 'q3TargetText'),
    'item/Q4TargetText': nested('behaviour', 'q4TargetText'),
    'item/Q1BehaviourTargetRating': nested('behaviour', 'q1TargetRating'),
    'item/Q2BehaviourTargetRating': nested('behaviour', 'q2TargetRating'),
    'item/Q3BehaviourTargetRating': nested('behaviour', 'q3TargetRating'),
    'item/Q4BehaviourTargetRating': nested('behaviour', 'q4TargetRating'),
    'item/BehaviourItemWeight': nested('behaviour', 'weight'),
    'item/UnitLabel': nested('behaviour', 'unit'),
    'item/DisplayOrder': 3,
    'item/WorkplanVersion': 1,
    'item/AddedAt': '@utcNow()',
    'item/AddedByEmail': actorEmail,
    'item/ActiveInWorkplan': true,
    'item/TestRunKey': command('TestRunKey')
  }, runAfter('Create_TEST_Personal')),
  Create_TEST_Audit_Accepted: post(lists.audit, {
    ...commonAudit(true, 'WorkplanDraftUpdated', auditKeyAccepted),
    'item/Reason': 'KCF-KPI-036 TEST Employee Draft persisted'
  }, runAfter('Create_TEST_Behaviour')),
  Create_TEST_Receipt_Accepted: post(lists.receipts, {
    ...commonReceipt('Accepted'),
    'item/ValidationCode': 'ACCEPTED',
    'item/Message': 'TEST Workplan header, Core, Personal and Behaviour rows persisted and audited.',
    'item/ResultKeysJSON': resultKeys,
    'item/AuditKeysJSON': "@string(createArray(outputs('Create_TEST_Audit_Accepted')?['body/AuditKey']))"
  }, runAfter('Create_TEST_Audit_Accepted'))
};

const rejectionActions = (code, reason, diagnosticHash) => ({
  Create_TEST_Audit_Rejected: post(lists.audit, {
    ...commonAudit(false, 'CommandRejected', auditKeyFor(code)),
    'item/Reason': reason
  }, {}),
  Create_TEST_Receipt_Rejected: post(lists.receipts, {
    ...commonReceipt('Rejected', diagnosticHash),
    'item/ValidationCode': code,
    'item/Message': reason,
    'item/ResultKeysJSON': '[]',
    'item/AuditKeysJSON': "@string(createArray(outputs('Create_TEST_Audit_Rejected')?['body/AuditKey']))"
  }, runAfter('Create_TEST_Audit_Rejected'))
});

const zeroHash = `'${'0'.repeat(64)}'`;
const businessValidation = {
  and: [
    { equals: [commandType, 'CreateWorkplanDraft'] },
    { equals: [subjectType, 'Workplan'] },
    { startsWith: [command('TestRunKey'), 'KCF-KPI-036|'] },
    { greaterOrEquals: [command('PerformanceYear'), 2020] },
    { lessOrEquals: [command('PerformanceYear'), 2100] },
    { equals: [`@mod(body('Get_Command_Authoritative_1')?['PerformanceYear'], 1)`, 0] },
    { equals: [command('PersonKey'), derivedPersonKey] },
    { equals: [command('SubjectKey'), derivedSubjectKey] },
    { equals: [payload('workplanKey'), derivedSubjectKey] },
    { equals: ["@toLower(body('Parse_JSON_Payload')?['employeeEmail'])", actorEmail] },
    { equals: [payload('schemaVersion'), 'KCF-KPI-036-EMPLOYEE-DRAFT-V1'] },
    { equals: [nested('weights', 'core'), 70] },
    { equals: [nested('weights', 'personal'), 20] },
    { equals: [nested('weights', 'behaviour'), 10] },
    { not: { equals: [nested('core', 'naturalKey'), nested('personal', 'naturalKey')] } },
    { not: { equals: [nested('core', 'naturalKey'), nested('behaviour', 'naturalKey')] } },
    { not: { equals: [nested('personal', 'naturalKey'), nested('behaviour', 'naturalKey')] } },
    { startsWith: [nested('core', 'workplanItemKey'), derivedSubjectKey] },
    { startsWith: [nested('personal', 'workplanItemKey'), derivedSubjectKey] },
    { startsWith: [nested('behaviour', 'workplanItemKey'), derivedSubjectKey] }
  ]
};

const validatedWritePath = {
  Filter_Invalid_Behaviour_Keys: {
    runAfter: {}, type: 'Query',
    inputs: {
      from: "@body('Parse_JSON_Payload')?['behaviour']?['selectedSuggestionKeys']",
      where: `@not(contains(createArray(${behaviourKeys.map(key => `'${key}'`).join(',')}), item()))`
    }
  },
  Filter_Cross_Heading_Behaviour_Keys: {
    runAfter: runAfter('Filter_Invalid_Behaviour_Keys'), type: 'Query',
    inputs: {
      from: "@body('Parse_JSON_Payload')?['behaviour']?['selectedSuggestionKeys']",
      where: "@not(startsWith(item(), concat(body('Parse_JSON_Payload')?['behaviour']?['behaviourId'], '-OBJ-')))"
    }
  },
  Validate_Behaviour_Key_Heading_Binding: {
    runAfter: runAfter('Filter_Cross_Heading_Behaviour_Keys'), type: 'If',
    metadata: { contract: 'SELECTION_ONLY_OR_CUSTOM_ONLY_OR_COMBINED' },
    expression: {
      and: [
        { equals: ["@length(body('Filter_Invalid_Behaviour_Keys'))", 0] },
        { equals: ["@length(body('Filter_Cross_Heading_Behaviour_Keys'))", 0] },
        { equals: ["@length(union(body('Parse_JSON_Payload')?['behaviour']?['selectedSuggestionKeys'], body('Parse_JSON_Payload')?['behaviour']?['selectedSuggestionKeys']))", "@length(body('Parse_JSON_Payload')?['behaviour']?['selectedSuggestionKeys'])"] },
        { or: [
          { greater: ["@length(body('Parse_JSON_Payload')?['behaviour']?['selectedSuggestionKeys'])", 0] },
          { greater: ["@length(trim(body('Parse_JSON_Payload')?['behaviour']?['customObjective']))", 0] }
        ] }
      ]
    },
    actions: {
      Get_TEST_Receipts_After_Validation: sharePointAction('GetItems', lists.receipts, {}, {}),
      Filter_Exact_Receipt_Binding: {
        runAfter: runAfter('Get_TEST_Receipts_After_Validation'), type: 'Query',
        inputs: {
          from: "@body('Get_TEST_Receipts_After_Validation')?['value']",
          where: `@and(equals(toLower(item()?['SourceListId']), '${lists.commands}'), equals(item()?['SourceItemId'], body('Get_Command_Authoritative_1')?['ID']), equals(item()?['CommandKey'], body('Get_Command_Authoritative_1')?['CommandKey']), equals(toLower(item()?['AuthenticatedActorEmail']), toLower(body('Get_Command_Authoritative_1')?['Author']?['Email'])), equals(item()?['AuthenticatedActorPersonKey'], first(body('Filter_Active_People_For_Author'))?['PersonKey']), equals(item()?['SourceItemVersion'], string(body('Get_Command_Authoritative_1')?['{VersionNumber}'])), equals(item()?['ReceiptKey'], concat('${lists.commands}|', string(body('Get_Command_Authoritative_1')?['ID']), '|', string(body('Get_Command_Authoritative_1')?['{VersionNumber}']), '|ETAG|', body('Get_Command_Authoritative_1')?['@odata.etag'])))`
        }
      },
      Filter_Receipt_Collision: {
        runAfter: runAfter('Filter_Exact_Receipt_Binding'), type: 'Query',
        inputs: {
          from: "@body('Get_TEST_Receipts_After_Validation')?['value']",
          where: `@and(or(equals(item()?['CommandKey'], body('Get_Command_Authoritative_1')?['CommandKey']), and(equals(toLower(item()?['SourceListId']), '${lists.commands}'), equals(item()?['SourceItemId'], body('Get_Command_Authoritative_1')?['ID']))), not(equals(item()?['ReceiptKey'], concat('${lists.commands}|', string(body('Get_Command_Authoritative_1')?['ID']), '|', string(body('Get_Command_Authoritative_1')?['{VersionNumber}']), '|ETAG|', body('Get_Command_Authoritative_1')?['@odata.etag']))))`
        }
      },
      If_Exact_Replay: {
        runAfter: runAfter('Filter_Receipt_Collision'), type: 'If',
        expression: { and: [
          { equals: ["@length(body('Filter_Exact_Receipt_Binding'))", 1] },
          { equals: ["@length(body('Filter_Receipt_Collision'))", 0] }
        ] },
        actions: {
          Exact_Replay_No_Second_Mutation: {
            runAfter: {}, type: 'Compose', inputs: 'EXACT_REPLAY_NO_SECOND_MUTATION'
          }
        },
        else: {
          actions: {
            If_Source_Binding_Collision: {
              runAfter: {}, type: 'If',
              expression: { or: [
                { greater: ["@length(body('Filter_Receipt_Collision'))", 0] },
                { greater: ["@length(body('Filter_Exact_Receipt_Binding'))", 1] }
              ] },
              actions: rejectionActions('SOURCE_BINDING_COLLISION', 'SOURCE_BINDING_COLLISION: the CommandKey or source item is already bound to another creator, version, ETag or item.'),
              else: {
                actions: {
                  Get_Command_Authoritative_2: sharePointAction('GetItem', lists.commands, {
                    id: command('ID')
                  }, {}),
                  Compose_Security_Snapshot_2: {
                    runAfter: runAfter('Get_Command_Authoritative_2'), type: 'Compose',
                    inputs: securitySnapshot('Get_Command_Authoritative_2')
                  },
                  If_Authoritative_Snapshots_Match: {
                    runAfter: runAfter('Compose_Security_Snapshot_2'), type: 'If',
                    expression: { equals: ["@string(outputs('Compose_Security_Snapshot_1'))", "@string(outputs('Compose_Security_Snapshot_2'))"] },
                    actions: validActions,
                    else: {
                      actions: rejectionActions('AUTHORITATIVE_ENVELOPE_CHANGED', 'The authoritative command or ETag changed between security reads; no official write was permitted.')
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    else: {
      actions: rejectionActions('CROSS_HEADING_OR_UNKNOWN_BEHAVIOUR_KEY', 'CROSS_HEADING_OR_UNKNOWN_BEHAVIOUR_KEY: Behaviour keys must be unique, frozen OBJ-01..OBJ-05 keys for their own heading; a safe selection, safe custom objective or both is required.')
    }
  }
};

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));
workflow.properties.definition.contentVersion = '1.0.36.1';
workflow.properties.definition.actions = {
  Get_Command_Authoritative_1: sharePointAction('GetItem', lists.commands, {
    id: "@triggerBody()?['ID']"
  }, {}),
  Compose_Security_Snapshot_1: {
    runAfter: runAfter('Get_Command_Authoritative_1'), type: 'Compose',
    inputs: securitySnapshot('Get_Command_Authoritative_1')
  },
  Get_TEST_People: sharePointAction('GetItems', lists.people, {}, runAfter('Compose_Security_Snapshot_1')),
  Filter_Active_People_For_Author: {
    runAfter: runAfter('Get_TEST_People'), type: 'Query',
    inputs: {
      from: "@body('Get_TEST_People')?['value']",
      where: "@and(equals(toLower(item()?['Email']), toLower(body('Get_Command_Authoritative_1')?['Author']?['Email'])), equals(item()?['Active'], true))"
    }
  },
  If_Authoritative_Envelope_And_Identity_Valid: {
    runAfter: runAfter('Filter_Active_People_For_Author'), type: 'If',
    expression: { and: [
      { equals: ["@length(body('Filter_Active_People_For_Author'))", 1] },
      { equals: ["@toLower(body('Get_Command_Authoritative_1')?['Author']?['Email'])", "@toLower(body('Get_Command_Authoritative_1')?['Editor']?['Email'])"] },
      { equals: [command('Created'), command('Modified')] },
      { equals: [sourceVersion, '1.0'] },
      { equals: [command('ID'), "@triggerBody()?['ID']"] },
      { not: { equals: [sourceEtag, null] } }
    ] },
    actions: {
      Guard_Retained_QA_Command_6: {
        runAfter: {}, type: 'If',
        expression: { and: [
          { equals: [command('ID'), 6] },
          { equals: [command('CommandKey'), 'KCF-KPI-036|QA|2098|DRAFT|V1'] },
          { equals: [command('TestRunKey'), 'KCF-KPI-036|20260904T123131Z|QA'] }
        ] },
        actions: rejectionActions('RETAINED_QA_SOURCE_ORPHAN', 'RETAINED_QA_SOURCE_ORPHAN: preserved EmployeeCommands ID 6 is terminally rejected with zero Workplan or WorkplanItem mutation.', zeroHash),
        else: {
          actions: {
            Parse_JSON_Payload: {
              runAfter: {}, type: 'ParseJson',
              inputs: { content: command('PayloadJSON'), schema: payloadSchema }
            },
            Handle_Malformed_JSON: {
              runAfter: runAfter('Parse_JSON_Payload', ['Failed', 'TimedOut']), type: 'Scope',
              actions: rejectionActions('MALFORMED_JSON', 'MALFORMED_JSON: the immutable source payload did not parse against the exact allow-listed schema.', zeroHash)
            },
            If_Business_Contract_Valid: {
              runAfter: runAfter('Parse_JSON_Payload'), type: 'If',
              expression: businessValidation,
              actions: validatedWritePath,
              else: {
                actions: rejectionActions('UNEXPECTED_OR_MALFORMED_PAYLOAD', 'UNEXPECTED_OR_MALFORMED_PAYLOAD: identity, year, weights, keys or typed business rules failed closed.')
              }
            }
          }
        }
      }
    },
    else: {
      actions: rejectionActions('AUTHORITATIVE_IDENTITY_OR_ENVELOPE_REJECTED', 'Authoritative identity/envelope rejected: exactly one active People row, matching Author/Editor, unchanged timestamps, first version and ETag are required.', zeroHash)
    }
  }
};

fs.writeFileSync(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ workflowPath, lists, contentVersion: workflow.properties.definition.contentVersion }, null, 2));
