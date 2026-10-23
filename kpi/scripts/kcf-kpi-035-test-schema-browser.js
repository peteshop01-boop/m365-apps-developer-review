(function attachKcfKpi035Schema(root) {
  'use strict';

  const ACTION = 'KCF-KPI-035';
  const VERSION = 'KCF-KPI-035-SCHEMA-1.0.0';
  const DEFAULT_SOURCE_PREFIX = 'KCFKPI_';
  const DEFAULT_TARGET_PREFIX = 'KCFKPI_TEST_';

  const BASE_ASSETS = [
    { suffix: 'People', baseTemplate: 100, enableFolders: false },
    { suffix: 'Workplans', baseTemplate: 100, enableFolders: true },
    { suffix: 'WorkplanItems', baseTemplate: 100, enableFolders: true },
    { suffix: 'QuarterReviews', baseTemplate: 100, enableFolders: true },
    { suffix: 'QuarterReviewItems', baseTemplate: 100, enableFolders: true },
    { suffix: 'ProgressNotes', baseTemplate: 100, enableFolders: true },
    { suffix: 'Evidence', baseTemplate: 101, enableFolders: true },
    { suffix: 'Audit', baseTemplate: 100, enableFolders: true }
  ];

  const EMPLOYEE_COMMANDS = [
    'CreateWorkplanDraft', 'UpdateWorkplanDraft', 'UpsertWorkplanItem',
    'DeactivateWorkplanItem', 'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2',
    'UpsertPersonalItemV2', 'UpsertBehaviourCommitmentV2', 'SetCoreWeightingV2',
    'SubmitWorkplan', 'CreateQuarterDraft', 'UpdateQuarterItem',
    'UpdateQuarterItemV2', 'SaveProgressEntry', 'RegisterEvidence',
    'SubmitQuarterReview'
  ];

  const MANAGER_COMMANDS = [
    'RequestWorkplanChanges', 'ApproveAndLockWorkplan', 'RequestQuarterChanges',
    'SetQuarterManagerReview', 'SetQuarterRAGOverride', 'DecideReforecast',
    'ApproveAndLockQuarter', 'CreateWorkplanAmendmentV2'
  ];

  const SUBJECT_TYPES = ['Workplan', 'WorkplanItem', 'QuarterReview', 'QuarterReviewItem', 'Evidence'];
  const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'];
  const AUDIT_SUBJECT_EXTENSIONS = ['WorkplanItem', 'QuarterReviewItem', 'Command'];
  const AUDIT_EVENT_EXTENSIONS = [
    'WorkplanDraftUpdated', 'CoreContributionUpserted', 'PersonalItemUpserted',
    'BehaviourCommitmentUpserted', 'CoreWeightingSet', 'ZeroPersonalProposed',
    'ZeroPersonalApproved', 'ZeroPersonalRejected', 'WorkplanSubmitted',
    'WorkplanResubmitted', 'WorkplanChangesRequested', 'WorkplanApproved',
    'WorkplanAmendmentCreated', 'QuarterReviewDraftUpdated', 'EvidenceRegistered',
    'QuarterReviewSubmitted', 'ManagerOverrideApplied',
    'ContributionApprovalChanged', 'CommandRejected', 'CommandFailed',
    'RecoveryHoldEntered'
  ];

  const TEST_RUN_FIELD = {
    name: 'TestRunKey', title: 'TestRunKey', type: 'Text', required: false,
    indexed: true, unique: false
  };

  const SEC006_ADDITIONS = {
    Workplans: [
      { name: 'CoreWeightingMode', type: 'Choice', choices: ['Equal', 'Custom'], defaultValue: 'Equal' },
      { name: 'WorkplanVersion', type: 'Number', decimals: 0, defaultValue: '1' }
    ],
    WorkplanItems: [
      { name: 'ContributionMethod', type: 'Choice', choices: ['AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight'] },
      { name: 'Q1SuccessDefinition', type: 'Note' },
      { name: 'Q2SuccessDefinition', type: 'Note' },
      { name: 'Q3SuccessDefinition', type: 'Note' },
      { name: 'Q4SuccessDefinition', type: 'Note' },
      { name: 'SharedTargetRule', type: 'Choice', choices: ['VisibleOnly', 'ApprovedApportionment'] },
      { name: 'SharedApportionmentPercent', type: 'Number', decimals: 2, min: 0, max: 100 },
      { name: 'ContributionGovernanceReference', type: 'Text' },
      { name: 'DenominatorNumerator', type: 'Number', decimals: 2 },
      { name: 'DenominatorValue', type: 'Number', decimals: 2, min: 0 },
      { name: 'DenominatorUnit', type: 'Text' },
      { name: 'DenominatorRuleReference', type: 'Text' },
      { name: 'DenominatorSourceReference', type: 'Text' },
      { name: 'DirectContributionEligible', type: 'Boolean', defaultValue: '0' },
      { name: 'ContributionApprovalState', type: 'Choice', choices: ['Draft', 'Pending', 'Approved', 'Retired'], defaultValue: 'Draft' },
      { name: 'AdditiveApproved', type: 'Boolean', defaultValue: '0' },
      { name: 'NonOverlapRequired', type: 'Boolean', defaultValue: '0' },
      { name: 'NonOverlapApproved', type: 'Boolean', defaultValue: '0' },
      { name: 'ContributionEffectiveFrom', type: 'DateTime', dateFormat: 'DateOnly' },
      { name: 'ContributionEffectiveTo', type: 'DateTime', dateFormat: 'DateOnly' },
      { name: 'ContributionApprovalReference', type: 'Text' },
      { name: 'ContributionApprovedAt', type: 'DateTime', dateFormat: 'DateTime' },
      { name: 'ContributionAuditReference', type: 'Text' },
      { name: 'WorkplanVersion', type: 'Number', decimals: 0, defaultValue: '1' },
      {
        name: 'BehaviourSelectedSuggestionKeysJson',
        internalName: 'BehaviourSelectedSuggestionKeysJ',
        staticName: 'BehaviourSelectedSuggestionKeysJson',
        type: 'Note', defaultValue: '[]'
      },
      { name: 'BehaviourCustomObjective', type: 'Note' }
    ],
    QuarterReviewItems: [
      { name: 'ContextMitigation', type: 'Note' }
    ]
  };

  const commandFields = commandChoices => [
    { name: 'CommandKey', type: 'Text', required: true, indexed: true },
    { name: 'CommandType', type: 'Choice', required: true, indexed: true, choices: commandChoices },
    { name: 'SubjectType', type: 'Choice', required: true, indexed: true, choices: SUBJECT_TYPES },
    { name: 'SubjectKey', type: 'Text', required: true, indexed: true },
    { name: 'PersonKey', type: 'Text', required: true, indexed: true },
    { name: 'PerformanceYear', type: 'Number', required: true, indexed: true, decimals: 0 },
    { name: 'Quarter', type: 'Choice', choices: QUARTERS },
    { name: 'ExpectedRowVersionToken', type: 'Number', decimals: 0 },
    { name: 'ExpectedETag', type: 'Text' },
    { name: 'PayloadJSON', type: 'Note', required: true },
    { name: 'ClientVersion', type: 'Text' },
    { name: 'ClientSubmittedAt', type: 'DateTime', required: true, dateFormat: 'DateTime' },
    { name: 'ClientCorrelationKey', type: 'Text', required: true, indexed: true }
  ];

  const RECEIPT_FIELDS = [
    { name: 'ReceiptKey', type: 'Text', required: true, indexed: true, unique: true },
    { name: 'SourceListId', type: 'Text', required: true, indexed: true },
    { name: 'SourceItemId', type: 'Number', required: true, indexed: true, decimals: 0 },
    { name: 'SourceItemVersion', type: 'Text', required: true },
    { name: 'CommandKey', type: 'Text', required: true, indexed: true },
    { name: 'CommandType', type: 'Choice', required: true, choices: [...EMPLOYEE_COMMANDS, ...MANAGER_COMMANDS] },
    { name: 'SubjectType', type: 'Choice', required: true, choices: SUBJECT_TYPES },
    { name: 'SubjectKey', type: 'Text', required: true, indexed: true },
    { name: 'PersonKey', type: 'Text', indexed: true },
    { name: 'PerformanceYear', type: 'Number', indexed: true, decimals: 0 },
    { name: 'Quarter', type: 'Choice', choices: QUARTERS },
    { name: 'AuthenticatedActorEmail', type: 'Text', required: true },
    { name: 'AuthenticatedActorPersonKey', type: 'Text' },
    { name: 'EffectiveRole', type: 'Choice', required: true, choices: ['Employee', 'Manager', 'DelegatedManager', 'BusinessAdmin', 'SystemAdmin', 'Unresolved'], defaultValue: 'Unresolved' },
    { name: 'ProcessedByEmail', type: 'Text', required: true },
    { name: 'ProcessedAt', type: 'DateTime', required: true, indexed: true, dateFormat: 'DateTime' },
    { name: 'Outcome', type: 'Choice', required: true, indexed: true, choices: ['Accepted', 'Rejected', 'Duplicate', 'Failed', 'RecoveryHold'] },
    { name: 'ValidationCode', type: 'Text', required: true },
    { name: 'Message', type: 'Note', required: true },
    { name: 'ProcessedPayloadSHA256', type: 'Text', required: true },
    { name: 'ResultKeysJSON', type: 'Note', required: true, defaultValue: '[]' },
    { name: 'AuditKeysJSON', type: 'Note', required: true, defaultValue: '[]' },
    { name: 'CorrelationKey', type: 'Text', required: true, indexed: true },
    { name: 'FlowRunReference', type: 'Text', required: true }
  ];

  const CONTROL_ASSETS = [
    { suffix: 'EmployeeCommands', baseTemplate: 100, enableFolders: true, fields: commandFields(EMPLOYEE_COMMANDS) },
    { suffix: 'ManagerCommands', baseTemplate: 100, enableFolders: true, fields: commandFields(MANAGER_COMMANDS) },
    { suffix: 'CommandReceipts', baseTemplate: 100, enableFolders: true, fields: RECEIPT_FIELDS }
  ];

  const MANAGED_ASSETS = [...BASE_ASSETS, ...CONTROL_ASSETS];
  const FIELD_SELECT = 'Id,Title,InternalName,StaticName,TypeAsString,Required,Indexed,EnforceUniqueValues,Hidden,ReadOnlyField,FromBaseType,DefaultValue,SchemaXml,Choices,LookupList,LookupField';

  const unique = values => [...new Set(values)];
  const escapeOData = value => String(value).replace(/'/g, "''");
  const xmlEscape = value => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  function normaliseOptions(input) {
    const options = {
      siteUrl: String(input?.siteUrl || '').replace(/\/$/, ''),
      sourcePrefix: String(input?.sourcePrefix || DEFAULT_SOURCE_PREFIX),
      targetPrefix: String(input?.targetPrefix || DEFAULT_TARGET_PREFIX),
      contractManifest: input?.contractManifest || null
    };
    if (!/^https:\/\/[^/]+\/sites\/[a-z0-9_-]+$/i.test(options.siteUrl)) throw new Error('A governed HTTPS SharePoint site URL is required.');
    if (!/^[A-Za-z0-9_]+_$/.test(options.sourcePrefix) || !/^[A-Za-z0-9_]+_$/.test(options.targetPrefix)) throw new Error('Source and target prefixes must be simple names ending in an underscore.');
    if (options.sourcePrefix === options.targetPrefix) throw new Error('Source and target prefixes must differ.');
    if (typeof location !== 'undefined') {
      const expected = new URL(options.siteUrl);
      if (location.origin !== expected.origin || !location.pathname.toLowerCase().startsWith(expected.pathname.toLowerCase())) {
        throw new Error('Browser origin/site path does not match the requested SharePoint site.');
      }
    }
    return options;
  }

  function contractFromManifest(manifest, asset) {
    if (!manifest?.targetPrefix || !Array.isArray(manifest.lists)) throw new Error('The supplied schema export is not a KCF-KPI-035 contract manifest.');
    const list = manifest.lists.find(item => item.title === `${manifest.targetPrefix}${asset.suffix}`);
    if (!list || list.baseTemplate !== asset.baseTemplate) throw new Error(`The supplied schema export is missing a compatible ${asset.suffix} contract.`);
    const titleField = list.fields.find(field => field.internalName === 'Title');
    const physical = manifest.physicalNameMapping;
    return {
      title: { title: titleField?.displayName || 'Title', required: Boolean(titleField?.required) },
      fields: list.fields.filter(field => field.internalName !== 'Title').map(field => normaliseDefinition({
        name: physical?.sharePointInternalName === field.internalName ? physical.acceptedName : field.internalName,
        internalName: field.internalName,
        staticName: field.staticName || field.internalName,
        title: field.displayName,
        type: field.type,
        required: field.required,
        indexed: field.indexed,
        unique: field.unique,
        defaultValue: field.defaultValue,
        choices: field.choices,
        lookupList: field.lookupList,
        lookupField: field.lookupField
      }))
    };
  }

  async function deterministicGuid(seed) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ACTION}:${seed}`))).slice(0, 16);
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const attr = (schemaXml, name) => schemaXml?.match(new RegExp(`\\s${name}="([^"]*)"`, 'i'))?.[1];

  function sourceFieldDefinition(field) {
    const allowed = ['Text', 'Note', 'Number', 'Boolean', 'Choice', 'MultiChoice', 'DateTime'];
    if (!allowed.includes(field.TypeAsString)) throw new Error(`Unsupported canonical field type ${field.TypeAsString} for ${field.InternalName}.`);
    return {
      name: field.InternalName,
      title: field.Title,
      type: field.TypeAsString,
      required: Boolean(field.Required),
      indexed: Boolean(field.Indexed),
      unique: Boolean(field.EnforceUniqueValues),
      defaultValue: field.DefaultValue ?? null,
      choices: field.Choices?.results ?? field.Choices ?? [],
      decimals: attr(field.SchemaXml, 'Decimals') === undefined ? undefined : Number(attr(field.SchemaXml, 'Decimals')),
      min: attr(field.SchemaXml, 'Min') === undefined ? undefined : Number(attr(field.SchemaXml, 'Min')),
      max: attr(field.SchemaXml, 'Max') === undefined ? undefined : Number(attr(field.SchemaXml, 'Max')),
      dateFormat: attr(field.SchemaXml, 'Format'),
      lookupList: field.LookupList || null,
      lookupField: field.LookupField || null
    };
  }

  function normaliseDefinition(input) {
    return {
      name: input.name,
      internalName: input.internalName || input.name,
      staticName: input.staticName || input.name,
      title: input.title || input.name,
      type: input.type,
      required: Boolean(input.required),
      indexed: Boolean(input.indexed || input.unique),
      unique: Boolean(input.unique),
      defaultValue: input.defaultValue ?? null,
      choices: unique(input.choices || []),
      decimals: input.decimals,
      min: input.min,
      max: input.max,
      dateFormat: input.dateFormat,
      lookupList: input.lookupList || null,
      lookupField: input.lookupField || null
    };
  }

  async function fieldSchemaXml(listTitle, input) {
    const field = normaliseDefinition(input);
    const id = await deterministicGuid(`${listTitle}.${field.internalName}`);
    const attributes = [
      `ID="{${id}}"`, `Name="${xmlEscape(field.internalName)}"`,
      `StaticName="${xmlEscape(field.staticName)}"`, `DisplayName="${xmlEscape(field.title)}"`,
      `Type="${field.type}"`, `Required="${field.required ? 'TRUE' : 'FALSE'}"`,
      `Indexed="${field.indexed ? 'TRUE' : 'FALSE'}"`,
      `EnforceUniqueValues="${field.unique ? 'TRUE' : 'FALSE'}"`,
      'Hidden="FALSE"', 'Group="KCF KPI TEST"'
    ];
    if (field.type === 'Text') attributes.push('MaxLength="255"');
    if (field.type === 'Note') attributes.push('RichText="FALSE"', 'NumLines="6"', 'AppendOnly="FALSE"');
    if (field.type === 'Choice') attributes.push('Format="Dropdown"', 'FillInChoice="FALSE"');
    if (field.type === 'MultiChoice') attributes.push('FillInChoice="FALSE"');
    if (field.type === 'Number') attributes.push(`Decimals="${field.decimals ?? 2}"`);
    if (field.type === 'DateTime') attributes.push(`Format="${field.dateFormat === 'DateOnly' ? 'DateOnly' : 'DateTime'}"`, 'FriendlyDisplayFormat="Disabled"');
    if (field.min !== undefined) attributes.push(`Min="${field.min}"`);
    if (field.max !== undefined) attributes.push(`Max="${field.max}"`);
    const children = [];
    if ((field.type === 'Choice' || field.type === 'MultiChoice') && field.choices.length) children.push(`<CHOICES>${field.choices.map(value => `<CHOICE>${xmlEscape(value)}</CHOICE>`).join('')}</CHOICES>`);
    if (field.defaultValue !== null) children.push(`<Default>${xmlEscape(field.defaultValue)}</Default>`);
    return `<Field ${attributes.join(' ')}>${children.join('')}</Field>`;
  }

  function createClient(siteUrl) {
    const accept = 'application/json;odata=verbose';
    let digest;
    let digestExpiresAt = 0;
    const getDigest = async () => {
      if (digest && Date.now() < digestExpiresAt) return digest;
      const response = await fetch(`${siteUrl}/_api/contextinfo`, { method: 'POST', credentials: 'same-origin', headers: { Accept: accept } });
      if (!response.ok) throw new Error(`POST contextinfo failed: ${response.status} ${await response.text()}`);
      const info = (await response.json()).d.GetContextWebInformation;
      digest = info.FormDigestValue;
      digestExpiresAt = Date.now() + Math.max(60000, (info.FormDigestTimeoutSeconds - 60) * 1000);
      return digest;
    };
    const request = async (path, options = {}) => {
      const method = options.method || 'GET';
      const headers = { Accept: accept };
      if (method !== 'GET') {
        headers['X-RequestDigest'] = await getDigest();
        headers['Content-Type'] = accept;
      }
      if (options.merge) {
        headers['IF-MATCH'] = '*';
        headers['X-HTTP-Method'] = 'MERGE';
      }
      const response = await fetch(`${siteUrl}${path}`, {
        method, credentials: 'same-origin', headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body)
      });
      if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text).d : null;
    };
    return { request };
  }

  async function sourceContract(client, options, asset) {
    if (options.contractManifest) return contractFromManifest(options.contractManifest, asset);
    if (asset.fields) return {
      title: { title: 'Title', required: false },
      fields: [...asset.fields, TEST_RUN_FIELD].map(normaliseDefinition)
    };
    const sourceTitle = `${options.sourcePrefix}${asset.suffix}`;
    const list = await client.request(`/_api/web/lists/getbytitle('${escapeOData(sourceTitle)}')?$select=Id,Title,BaseTemplate`);
    if (list.BaseTemplate !== asset.baseTemplate) throw new Error(`${sourceTitle} BaseTemplate ${list.BaseTemplate} does not match ${asset.baseTemplate}.`);
    const fields = (await client.request(`/_api/web/lists(guid'${list.Id}')/fields?$select=${FIELD_SELECT}`)).results;
    const titleField = fields.find(field => field.InternalName === 'Title');
    const custom = fields
      .filter(field => !field.FromBaseType && !field.Hidden && !field.ReadOnlyField && !['Title', '_ExtendedDescription'].includes(field.InternalName))
      .map(sourceFieldDefinition);
    const additions = (SEC006_ADDITIONS[asset.suffix] || []).map(normaliseDefinition);
    const byName = new Map(custom.map(field => [field.name, field]));
    additions.forEach(field => {
      if (byName.has(field.name)) throw new Error(`${sourceTitle}.${field.name} already exists; reconcile the accepted additive contract before provisioning.`);
      byName.set(field.name, field);
    });
    byName.set(TEST_RUN_FIELD.name, normaliseDefinition(TEST_RUN_FIELD));
    if (asset.suffix === 'Audit') {
      const eventType = byName.get('EventType');
      const subjectType = byName.get('SubjectType');
      if (!eventType || !subjectType) throw new Error('Canonical Audit choice fields are missing.');
      eventType.choices = unique([...eventType.choices, ...AUDIT_EVENT_EXTENSIONS]);
      subjectType.choices = unique([...subjectType.choices, ...AUDIT_SUBJECT_EXTENSIONS]);
    }
    return {
      title: { title: titleField?.Title || 'Title', required: Boolean(titleField?.Required) },
      fields: [...byName.values()]
    };
  }

  function compareField(expectedInput, actual) {
    const expected = normaliseDefinition(expectedInput);
    const discrepancies = [];
    if (!actual) return [`missing field ${expected.internalName}`];
    if (actual.TypeAsString !== expected.type) discrepancies.push(`${expected.internalName}.type expected ${expected.type}, found ${actual.TypeAsString}`);
    if (Boolean(actual.Required) !== expected.required) discrepancies.push(`${expected.internalName}.required expected ${expected.required}, found ${actual.Required}`);
    if (Boolean(actual.Indexed) !== expected.indexed) discrepancies.push(`${expected.internalName}.indexed expected ${expected.indexed}, found ${actual.Indexed}`);
    if (Boolean(actual.EnforceUniqueValues) !== expected.unique) discrepancies.push(`${expected.internalName}.unique expected ${expected.unique}, found ${actual.EnforceUniqueValues}`);
    const actualChoices = actual.Choices?.results ?? actual.Choices ?? [];
    if (expected.choices.length !== actualChoices.length || expected.choices.some(choice => !actualChoices.includes(choice))) discrepancies.push(`${expected.internalName}.choices differ`);
    return discrepancies;
  }

  async function readActual(client, listId, contract) {
    const fields = (await client.request(`/_api/web/lists(guid'${listId}')/fields?$select=${FIELD_SELECT}`)).results;
    const contentTypes = (await client.request(`/_api/web/lists(guid'${listId}')/contenttypes?$select=Id,Name,Hidden,ReadOnly,Sealed`)).results;
    const managed = ['Title', ...contract.fields.map(field => field.internalName)];
    return {
      fields,
      managedFields: fields.filter(field => managed.includes(field.InternalName)).map(field => ({
        id: field.Id, displayName: field.Title, internalName: field.InternalName,
        type: field.TypeAsString, required: Boolean(field.Required), indexed: Boolean(field.Indexed),
        unique: Boolean(field.EnforceUniqueValues), choices: field.Choices?.results ?? field.Choices ?? [],
        lookupList: field.LookupList || null, lookupField: field.LookupField || null
      })).sort((left, right) => left.internalName.localeCompare(right.internalName)),
      contentTypes: contentTypes.map(contentType => ({
        id: contentType.Id?.StringValue || contentType.Id, name: contentType.Name,
        hidden: Boolean(contentType.Hidden), readOnly: Boolean(contentType.ReadOnly), sealed: Boolean(contentType.Sealed)
      }))
    };
  }

  async function runAsset(input, suffix) {
    const options = normaliseOptions(input);
    const asset = MANAGED_ASSETS.find(item => item.suffix === suffix);
    if (!asset) throw new Error(`Unknown managed suffix: ${suffix}.`);
    const targetTitle = `${options.targetPrefix}${asset.suffix}`;
    if (!targetTitle.startsWith(options.targetPrefix) || targetTitle.startsWith(options.sourcePrefix)) throw new Error('Target boundary validation failed.');
    const client = createClient(options.siteUrl);
    const contract = await sourceContract(client, options, asset);
    const allLists = (await client.request('/_api/web/lists?$select=Id,Title,BaseTemplate,Description,EnableFolderCreation,EnableVersioning,ContentTypesEnabled,OnQuickLaunch,ItemCount')).results;
    let list = allLists.find(item => item.Title === targetTitle);
    let createdList = false;
    if (list) {
      const mismatches = [];
      if (list.BaseTemplate !== asset.baseTemplate) mismatches.push(`BaseTemplate expected ${asset.baseTemplate}, found ${list.BaseTemplate}`);
      if (!list.EnableVersioning) mismatches.push('versioning is disabled');
      if (Boolean(list.EnableFolderCreation) !== Boolean(asset.enableFolders)) mismatches.push(`EnableFolderCreation expected ${asset.enableFolders}, found ${list.EnableFolderCreation}`);
      if (!list.ContentTypesEnabled) mismatches.push('content types are disabled');
      if (list.OnQuickLaunch) mismatches.push('list is on Quick Launch');
      if (mismatches.length) throw new Error(`${targetTitle} exists with incompatible settings: ${mismatches.join('; ')}.`);
    } else {
      await client.request('/_api/web/lists', {
        method: 'POST',
        body: {
          __metadata: { type: 'SP.List' }, BaseTemplate: asset.baseTemplate,
          ContentTypesEnabled: true, Description: `${ACTION} isolated TEST schema: ${asset.suffix}.`,
          Title: targetTitle
        }
      });
      list = await client.request(`/_api/web/lists/getbytitle('${escapeOData(targetTitle)}')?$select=Id,Title,BaseTemplate,Description,EnableFolderCreation,EnableVersioning,ContentTypesEnabled,OnQuickLaunch,ItemCount`);
      await client.request(`/_api/web/lists(guid'${list.Id}')`, {
        method: 'POST', merge: true,
        body: {
          __metadata: { type: 'SP.List' }, ContentTypesEnabled: true,
          EnableFolderCreation: Boolean(asset.enableFolders), EnableVersioning: true,
          OnQuickLaunch: false
        }
      });
      await client.request(`/_api/web/lists(guid'${list.Id}')/fields/getbyinternalnameortitle('Title')`, {
        method: 'POST', merge: true,
        body: { __metadata: { type: 'SP.FieldText' }, Required: contract.title.required, Title: contract.title.title }
      });
      createdList = true;
    }

    const before = await readActual(client, list.Id, contract);
    const existingByName = new Map(before.fields.map(field => [field.InternalName, field]));
    const incompatible = contract.fields.flatMap(field => existingByName.has(field.internalName) ? compareField(field, existingByName.get(field.internalName)) : []);
    const titleActual = existingByName.get('Title');
    if (titleActual && (titleActual.Title !== contract.title.title || Boolean(titleActual.Required) !== contract.title.required)) incompatible.push('Title field display/required contract differs');
    if (incompatible.length) throw new Error(`${targetTitle} has incompatible existing fields: ${incompatible.join('; ')}.`);

    const createdFields = [];
    for (const field of contract.fields) {
      if (existingByName.has(field.internalName)) continue;
      await client.request(`/_api/web/lists(guid'${list.Id}')/fields/createfieldasxml`, {
        method: 'POST',
        body: {
          parameters: {
            __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' }, Options: 0,
            SchemaXml: await fieldSchemaXml(targetTitle, field)
          }
        }
      });
      createdFields.push(field.internalName);
    }

    list = await client.request(`/_api/web/lists(guid'${list.Id}')?$select=Id,Title,BaseTemplate,Description,EnableFolderCreation,EnableVersioning,ContentTypesEnabled,OnQuickLaunch,ItemCount,LastItemModifiedDate,RootFolder/ServerRelativeUrl&$expand=RootFolder`);
    const after = await readActual(client, list.Id, contract);
    const afterByName = new Map(after.fields.map(field => [field.InternalName, field]));
    const discrepancies = contract.fields.flatMap(field => compareField(field, afterByName.get(field.internalName)));
    if (discrepancies.length) throw new Error(`${targetTitle} verification failed: ${discrepancies.join('; ')}.`);
    return {
      action: ACTION, version: VERSION, siteUrl: options.siteUrl, sourcePrefix: options.sourcePrefix,
      targetPrefix: options.targetPrefix, title: targetTitle, id: list.Id,
      baseTemplate: list.BaseTemplate, itemCount: list.ItemCount,
      url: list.RootFolder.ServerRelativeUrl, createdList, createdFields,
      changedCount: Number(createdList) + createdFields.length,
      managedFieldCount: contract.fields.length + 1, lookupRelationshipCount: after.managedFields.filter(field => field.lookupList).length,
      contentTypes: after.contentTypes, verifiedAt: new Date().toISOString()
    };
  }

  async function readback(input) {
    const options = normaliseOptions(input);
    const client = createClient(options.siteUrl);
    const output = [];
    for (const asset of MANAGED_ASSETS) {
      const title = `${options.targetPrefix}${asset.suffix}`;
      const list = await client.request(`/_api/web/lists/getbytitle('${escapeOData(title)}')?$select=Id,Title,BaseTemplate,Description,EnableFolderCreation,EnableVersioning,ContentTypesEnabled,OnQuickLaunch,ItemCount,LastItemModifiedDate,RootFolder/ServerRelativeUrl&$expand=RootFolder`);
      const contract = await sourceContract(client, options, asset);
      const actual = await readActual(client, list.Id, contract);
      const actualByName = new Map(actual.fields.map(field => [field.InternalName, field]));
      const discrepancies = contract.fields.flatMap(field => compareField(field, actualByName.get(field.internalName)));
      output.push({
        title: list.Title, id: list.Id, baseTemplate: list.BaseTemplate,
        description: list.Description, enableFolders: Boolean(list.EnableFolderCreation),
        enableVersioning: Boolean(list.EnableVersioning), contentTypesEnabled: Boolean(list.ContentTypesEnabled),
        onQuickLaunch: Boolean(list.OnQuickLaunch), itemCount: list.ItemCount,
        modified: list.LastItemModifiedDate, url: list.RootFolder.ServerRelativeUrl,
        fields: actual.managedFields, fieldCount: actual.managedFields.length,
        contentTypes: actual.contentTypes, lookupRelationshipCount: actual.managedFields.filter(field => field.lookupList).length,
        discrepancies
      });
    }
    return {
      action: ACTION, version: VERSION, siteUrl: options.siteUrl,
      sourcePrefix: options.sourcePrefix, targetPrefix: options.targetPrefix,
      listCount: output.length, lists: output,
      pass: output.length === 11 && output.every(list => list.discrepancies.length === 0),
      capturedAt: new Date().toISOString()
    };
  }

  async function snapshotCanonical(input) {
    const options = normaliseOptions(input);
    const client = createClient(options.siteUrl);
    const lists = (await client.request('/_api/web/lists?$select=Id,Title,BaseTemplate,ItemCount,LastItemModifiedDate,HasUniqueRoleAssignments,Hidden,RootFolder/ServerRelativeUrl&$expand=RootFolder')).results
      .filter(list => list.Title.startsWith(options.sourcePrefix) && !list.Title.startsWith(options.targetPrefix))
      .sort((left, right) => left.Title.localeCompare(right.Title));
    const output = [];
    for (const list of lists) {
      const fields = (await client.request(`/_api/web/lists(guid'${list.Id}')/fields?$select=Id,Title,InternalName,TypeAsString,Required,Indexed,EnforceUniqueValues,Hidden,ReadOnlyField,FromBaseType,Choices,LookupList,LookupField`)).results
        .filter(field => !field.Hidden && !field.ReadOnlyField)
        .map(field => ({ id: field.Id, title: field.Title, internalName: field.InternalName, type: field.TypeAsString, required: Boolean(field.Required), indexed: Boolean(field.Indexed), unique: Boolean(field.EnforceUniqueValues), choices: field.Choices?.results ?? field.Choices ?? [], lookupList: field.LookupList || null, lookupField: field.LookupField || null }))
        .sort((left, right) => left.internalName.localeCompare(right.internalName));
      output.push({ id: list.Id, title: list.Title, baseTemplate: list.BaseTemplate, itemCount: list.ItemCount, modified: list.LastItemModifiedDate, uniquePermissions: Boolean(list.HasUniqueRoleAssignments), hidden: Boolean(list.Hidden), url: list.RootFolder.ServerRelativeUrl, fields });
    }
    return { action: ACTION, siteUrl: options.siteUrl, canonicalListCount: output.length, lists: output, capturedAt: new Date().toISOString() };
  }

  function canonicalComparable(snapshot) {
    return snapshot.lists.map(list => ({
      id: list.id, title: list.title, baseTemplate: list.baseTemplate,
      itemCount: list.itemCount, modified: list.modified,
      uniquePermissions: list.uniquePermissions, hidden: list.hidden, url: list.url,
      fields: list.fields
    }));
  }

  function compareCanonical(before, after) {
    const left = JSON.stringify(canonicalComparable(before));
    const right = JSON.stringify(canonicalComparable(after));
    return { pass: left === right, beforeListCount: before.canonicalListCount, afterListCount: after.canonicalListCount, changed: left === right ? [] : ['Canonical list metadata, field schema, item count, modified time or permissions changed.'] };
  }

  root.KcfKpi035Schema = Object.freeze({
    ACTION, VERSION, BASE_ASSETS, CONTROL_ASSETS, MANAGED_ASSETS,
    EMPLOYEE_COMMANDS, MANAGER_COMMANDS, SUBJECT_TYPES,
    SEC006_ADDITIONS, TEST_RUN_FIELD, RECEIPT_FIELDS,
    normaliseOptions, contractFromManifest, deterministicGuid, fieldSchemaXml, sourceFieldDefinition,
    runAsset, readback, snapshotCanonical, compareCanonical
  });
})(globalThis);
