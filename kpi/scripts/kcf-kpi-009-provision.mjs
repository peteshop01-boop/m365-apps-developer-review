import { createHash } from 'node:crypto';

export const SITE_URL = 'https://example.invalid/sites/REVIEW-TEST-SITE';

export const TARGET_ASSETS = [
  'KCFKPI_People',
  'KCFKPI_KPIMaster',
  'KCFKPI_AnnualTargets',
  'KCFKPI_Behaviours',
  'KCFKPI_Workplans',
  'KCFKPI_WorkplanItems',
  'KCFKPI_QuarterReviews',
  'KCFKPI_QuarterReviewItems',
  'KCFKPI_KPIResults',
  'KCFKPI_ReportingMap',
  'KCFKPI_Config',
  'KCFKPI_Audit',
  'KCFKPI_Evidence',
  'KCFKPI_Reporting',
  'KCFKPI_ProgressNotes',
  'KCFKPI_OutputDefinitions'
];

export const SPIKE_ASSETS = [
  'KCFKPI_SPIKE_People',
  'KCFKPI_SPIKE_KPIs',
  'KCFKPI_SPIKE_Updates'
];

const LIBRARIES = new Set(['KCFKPI_Evidence', 'KCFKPI_Reporting']);

const ANNUAL_FOLDER_LISTS = new Set([
  'KCFKPI_Workplans',
  'KCFKPI_WorkplanItems',
  'KCFKPI_ProgressNotes'
]);

const QUARTER_FOLDER_LISTS = new Set([
  'KCFKPI_QuarterReviews',
  'KCFKPI_QuarterReviewItems'
]);

const ASSET_DESCRIPTIONS = {
  KCFKPI_People: 'KCF KPI controlled identity, manager, team and application-role mapping.',
  KCFKPI_KPIMaster: 'KCF KPI versioned Core GOLD KPI catalogue.',
  KCFKPI_AnnualTargets: 'KCF KPI versioned annual and quarterly targets.',
  KCFKPI_Behaviours: 'KCF KPI versioned Behaviour framework.',
  KCFKPI_Workplans: 'KCF KPI annual employee workplan headers.',
  KCFKPI_WorkplanItems: 'KCF KPI annual Core, Local/Personal and Behaviour workplan items.',
  KCFKPI_QuarterReviews: 'KCF KPI formal quarterly employee submission and manager decision headers.',
  KCFKPI_QuarterReviewItems: 'KCF KPI immutable-at-lock quarterly workplan item snapshots.',
  KCFKPI_KPIResults: 'KCF KPI GOLD OUTPUT organisational results.',
  KCFKPI_ReportingMap: 'KCF KPI versioned Core KPI-to-output mappings.',
  KCFKPI_Config: 'KCF KPI typed production configuration without secrets.',
  KCFKPI_Audit: 'KCF KPI append-only controlled business audit events.',
  KCFKPI_Evidence: 'KCF KPI supporting evidence documents.',
  KCFKPI_Reporting: 'KCF KPI generated reporting files and immutable publish snapshots.',
  KCFKPI_ProgressNotes: 'KCF KPI monthly progress ledgers.',
  KCFKPI_OutputDefinitions: 'KCF KPI controlled reporting-output definitions.'
};

const CHOICE_OVERRIDES = {
  'KCFKPI_Audit.EventType': [
    'KPIDefinitionChanged',
    'AnnualTargetChanged',
    'WorkplanSubmitted',
    'WorkplanResubmitted',
    'WorkplanApproved',
    'WorkplanChangesRequested',
    'WorkplanLocked',
    'QuarterSubmitted',
    'QuarterChangesRequested',
    'QuarterApproved',
    'QuarterLocked',
    'QuarterReopened',
    'RAGOverridden',
    'ReportingMapChanged',
    'AggregationOverridden',
    'QuarterPublished',
    'AdminConfigChanged',
    'ManagerReassigned'
  ],
  'KCFKPI_KPIResults.AggregationMethod': [
    'DirectMetric',
    'Additive',
    'WeightedContribution',
    'Composite',
    'Milestone',
    'AccountableOwner'
  ],
  'KCFKPI_KPIResults.FinalRAG': ['Green', 'Amber', 'Red', 'NotRated'],
  'KCFKPI_QuarterReviewItems.FinalRAG': ['Green', 'Amber', 'Red', 'NotRated'],
  'KCFKPI_Evidence.RetentionCategory': ['PerformanceEvidence'],
  'KCFKPI_Reporting.RetentionCategory': ['PerformanceOutput']
};

const DISPLAY_NAME_OVERRIDES = {
  'KCFKPI_People.Title': 'Display Name'
};

function splitMarkdownRow(line) {
  const values = [];
  let current = '';
  let escaped = false;
  for (const char of line.trim().replace(/^\|/, '').replace(/\|$/, '')) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '|') {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function cleanMarkdown(value) {
  return value
    .replace(/`/g, '')
    .replace(/\*\*/g, '')
    .trim();
}

function mapFieldType(typeText) {
  if (typeText.startsWith('Choice, multi-select')) return 'MultiChoice';
  if (typeText.startsWith('Choice')) return 'Choice';
  if (typeText.startsWith('Single line text')) return 'Text';
  if (typeText.startsWith('Multiple lines plain text')) return 'Note';
  if (typeText.startsWith('Number')) return 'Number';
  if (typeText.startsWith('Yes/No')) return 'Boolean';
  if (typeText.startsWith('Date only')) return 'DateOnly';
  if (typeText.startsWith('Date and Time')) return 'DateTime';
  throw new Error(`Unsupported SharePoint type in approved schema: ${typeText}`);
}

function extractRange(notes) {
  const match = notes.match(/(-?\d+(?:\.\d+)?)\s*[–-]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return {};
  return { min: Number(match[1]), max: Number(match[2]) };
}

function extractChoices(notes) {
  return [...notes.matchAll(/`([^`]+)`/g)].map(match => match[1]);
}

function normaliseDefault(value, fieldName, fieldType) {
  const cleaned = cleanMarkdown(value);
  if (!cleaned || cleaned === 'blank' || cleaned === '—') return null;
  if (cleaned === 'Generated' && fieldType === 'Text' && /Key$/.test(fieldName)) return null;
  if (cleaned === 'Current time') return '[today]';
  return cleaned;
}

function deterministicGuid(seed) {
  const hash = createHash('sha1').update(`KCF-KPI-009:${seed}`).digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fieldSchemaXml(assetName, field) {
  const id = deterministicGuid(`${assetName}.${field.name}`);
  const type = field.type === 'DateOnly' || field.type === 'DateTime' ? 'DateTime' : field.type;
  const attrs = [
    `ID="{${id}}"`,
    `Name="${xmlEscape(field.name)}"`,
    `StaticName="${xmlEscape(field.name)}"`,
    `DisplayName="${xmlEscape(field.displayName)}"`,
    `Type="${type}"`,
    `Required="${field.required ? 'TRUE' : 'FALSE'}"`,
    `Hidden="FALSE"`,
    `Group="KCF KPI Production"`
  ];

  if (field.unique) attrs.push('EnforceUniqueValues="TRUE"');
  if (field.indexed || field.unique) attrs.push('Indexed="TRUE"');
  if (field.type === 'Text') attrs.push('MaxLength="255"');
  if (field.type === 'Note') attrs.push('RichText="FALSE"', 'NumLines="6"', 'AppendOnly="FALSE"');
  if (field.type === 'Choice') attrs.push('Format="Dropdown"', 'FillInChoice="FALSE"');
  if (field.type === 'MultiChoice') attrs.push('FillInChoice="FALSE"');
  if (field.type === 'Number') attrs.push(`Decimals="${field.decimals}"`);
  if (field.type === 'DateOnly') attrs.push('Format="DateOnly"', 'FriendlyDisplayFormat="Disabled"');
  if (field.type === 'DateTime') attrs.push('Format="DateTime"', 'FriendlyDisplayFormat="Disabled"');
  if (field.min !== undefined) attrs.push(`Min="${field.min}"`);
  if (field.max !== undefined) attrs.push(`Max="${field.max}"`);

  const children = [];
  if (field.choices?.length) {
    children.push(`<CHOICES>${field.choices.map(choice => `<CHOICE>${xmlEscape(choice)}</CHOICE>`).join('')}</CHOICES>`);
  }
  if (field.defaultValue !== null) {
    let defaultValue = field.defaultValue;
    if (field.type === 'Boolean') defaultValue = /^yes|true|1$/i.test(defaultValue) ? '1' : '0';
    children.push(`<Default>${xmlEscape(defaultValue)}</Default>`);
  }

  return `<Field ${attrs.join(' ')}>${children.join('')}</Field>`;
}

function parseIndexes(section, fields) {
  const match = section.match(/^\*\*Indexes:\*\*(.*)$/m);
  const singles = new Set();
  const composites = [];
  if (!match) return { singles, composites };

  for (const part of match[1].split(';')) {
    const tokens = [...part.matchAll(/`([^`]+)`/g)].map(item => item[1]);
    for (const token of tokens) {
      if (token.includes(' + ')) {
        const [primary, secondary] = token.split(' + ').map(value => value.trim());
        composites.push({ primary, secondary });
      } else if (fields.some(field => field.name === token)) {
        singles.add(token);
      }
    }
  }
  return { singles, composites };
}

export function buildManifest(schemaMarkdown) {
  const sections = schemaMarkdown.split(/(?=^## \d+\. )/m).slice(1);
  const assets = [];

  for (const section of sections) {
    const heading = section.match(/^## \d+\. `([^`]+)`/m);
    if (!heading) continue;
    const name = heading[1];
    if (!TARGET_ASSETS.includes(name)) continue;

    const fields = [];
    for (const line of section.split(/\r?\n/)) {
      if (!line.startsWith('|')) continue;
      const cells = splitMarkdownRow(line);
      if (cells.length < 5 || !cells[0].startsWith('`')) continue;
      const fieldName = cells[0].match(/`([^`]+)`/)?.[1];
      if (!fieldName) continue;

      const typeText = cleanMarkdown(cells[1]);
      const notes = cells.slice(4).join(' | ');
      const fieldType = mapFieldType(typeText);
      const field = {
        name: fieldName,
        displayName: DISPLAY_NAME_OVERRIDES[`${name}.${fieldName}`] ?? fieldName,
        type: fieldType,
        required: cleanMarkdown(cells[2]).toLowerCase() === 'yes',
        defaultValue: normaliseDefault(cells[3], fieldName, fieldType),
        unique: /unique/i.test(typeText),
        indexed: false,
        decimals: /0 decimals/i.test(typeText) ? 0 : 2,
        notes: cleanMarkdown(notes),
        ...extractRange(notes)
      };

      if (field.type === 'Choice' || field.type === 'MultiChoice') {
        field.choices = CHOICE_OVERRIDES[`${name}.${fieldName}`] ?? extractChoices(notes);
        if (field.defaultValue && !field.choices.includes(field.defaultValue)) field.choices.unshift(field.defaultValue);
        if (!field.choices.length) throw new Error(`No choices resolved for ${name}.${fieldName}`);
      }
      fields.push(field);
    }

    const indexes = parseIndexes(section, fields);
    for (const field of fields) field.indexed = indexes.singles.has(field.name) || field.unique;

    const titleField = fields.find(field => field.name === 'Title') ?? null;
    const customFields = fields.filter(field => field.name !== 'Title');
    for (const field of customFields) field.schemaXml = fieldSchemaXml(name, field);

    assets.push({
      name,
      description: ASSET_DESCRIPTIONS[name],
      kind: LIBRARIES.has(name) ? 'Library' : 'List',
      baseTemplate: LIBRARIES.has(name) ? 101 : 100,
      enableFolders: LIBRARIES.has(name) || ANNUAL_FOLDER_LISTS.has(name) || QUARTER_FOLDER_LISTS.has(name) || name === 'KCFKPI_Audit',
      folderModel: QUARTER_FOLDER_LISTS.has(name) ? 'YearPersonQuarter' : ANNUAL_FOLDER_LISTS.has(name) ? 'YearPerson' : LIBRARIES.has(name) ? 'LibraryControlled' : name === 'KCFKPI_Audit' ? 'AuditControlled' : 'None',
      titleField,
      fields: customFields,
      compositeIndexes: indexes.composites
    });
  }

  const found = new Set(assets.map(asset => asset.name));
  const missing = TARGET_ASSETS.filter(name => !found.has(name));
  if (missing.length) throw new Error(`Approved schema is missing target assets: ${missing.join(', ')}`);
  return assets;
}

export const CONFIG_SEEDS = [
  { Title: 'Quarter 1 period', ConfigKey: 'Period.Q1', Category: 'Period', ValueType: 'Text', TextValue: 'Nov-Jan', Description: 'Q1 runs from November through January.' },
  { Title: 'Quarter 2 period', ConfigKey: 'Period.Q2', Category: 'Period', ValueType: 'Text', TextValue: 'Feb-Apr', Description: 'Q2 runs from February through April.' },
  { Title: 'Quarter 3 period', ConfigKey: 'Period.Q3', Category: 'Period', ValueType: 'Text', TextValue: 'May-Jul', Description: 'Q3 runs from May through July.' },
  { Title: 'Quarter 4 period', ConfigKey: 'Period.Q4', Category: 'Period', ValueType: 'Text', TextValue: 'Aug-Oct', Description: 'Q4 runs from August through October.' },
  { Title: 'RAG Green threshold', ConfigKey: 'RAG.GreenThresholdPct', Category: 'Scoring', ValueType: 'Number', NumberValue: 90, Description: 'Calculated progress at or above 90 percent is Green.' },
  { Title: 'RAG Amber threshold', ConfigKey: 'RAG.AmberThresholdPct', Category: 'Scoring', ValueType: 'Number', NumberValue: 50, Description: 'Calculated progress from 50 percent to below 90 percent is Amber; below 50 percent is Red.' },
  { Title: 'Invalid data remains unassessed', ConfigKey: 'RAG.InvalidIsUnassessed', Category: 'Scoring', ValueType: 'Boolean', BooleanValue: true, Description: 'Missing or invalid assessment inputs remain unassessed and never default to Green.' },
  { Title: 'Permitted aggregation methods', ConfigKey: 'Aggregation.PermittedMethods', Category: 'Scoring', ValueType: 'JSON', JSONValue: '["DirectMetric","Additive","WeightedContribution","Composite","Milestone","AccountableOwner"]', Description: 'CONTROL-approved organisational KPI aggregation methods.' },
  { Title: 'Core workplan category weight', ConfigKey: 'Workplan.Weight.Core', Category: 'Scoring', ValueType: 'Number', NumberValue: 70, Description: 'Core GOLD category contributes 70 percent of employee workplan scoring.' },
  { Title: 'Local and Personal category weight', ConfigKey: 'Workplan.Weight.LocalPersonal', Category: 'Scoring', ValueType: 'Number', NumberValue: 20, Description: 'Local and Personal category contributes 20 percent of employee workplan scoring.' },
  { Title: 'Behaviour category weight', ConfigKey: 'Workplan.Weight.Behaviours', Category: 'Scoring', ValueType: 'Number', NumberValue: 10, Description: 'Behaviours contribute 10 percent of employee workplan scoring.' },
  { Title: 'Retention policy status', ConfigKey: 'Retention.PolicyStatus', Category: 'Retention', ValueType: 'Text', TextValue: 'TBC — KCF HR/Data Retention Policy before production go-live', Description: 'No automatic deletion. Retention policy must be approved before production go-live.' }
].map(item => ({
  ...item,
  Environment: 'Production',
  Active: true,
  ChangeReference: 'KCF-KPI-009'
}));

function browserPreflight(siteUrl, targetAssets, spikeAssets) {
  return (async () => {
    if (location.origin !== new URL(siteUrl).origin) throw new Error('SharePoint origin mismatch.');
    const accept = 'application/json;odata=verbose';
    const response = await fetch(`${siteUrl}/_api/web/lists?$select=Id,Title,BaseTemplate,ItemCount,LastItemModifiedDate,HasUniqueRoleAssignments,RootFolder/ServerRelativeUrl&$expand=RootFolder`, {
      credentials: 'same-origin',
      headers: { Accept: accept }
    });
    if (!response.ok) throw new Error(`SharePoint preflight failed: ${response.status} ${await response.text()}`);
    const lists = (await response.json()).d.results;
    const wanted = [...targetAssets, ...spikeAssets];
    return {
      siteUrl,
      currentUser: document.querySelector('[aria-label^="Account manager for "]')?.getAttribute('aria-label') ?? null,
      targetExisting: lists.filter(item => targetAssets.includes(item.Title)),
      spikes: lists.filter(item => spikeAssets.includes(item.Title)),
      selected: lists.filter(item => wanted.includes(item.Title)),
      timestamp: new Date().toISOString()
    };
  })();
}

function browserProvision(siteUrl, manifest, configSeeds, options) {
  return (async () => {
    if (location.origin !== new URL(siteUrl).origin) throw new Error('SharePoint origin mismatch.');
    const accept = 'application/json;odata=verbose';
    let digest = null;
    let digestExpiresAt = 0;

    const getDigest = async () => {
      if (digest && Date.now() < digestExpiresAt) return digest;
      const response = await fetch(`${siteUrl}/_api/contextinfo`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: accept }
      });
      if (!response.ok) throw new Error(`Context info failed: ${response.status} ${await response.text()}`);
      const info = (await response.json()).d.GetContextWebInformation;
      digest = info.FormDigestValue;
      digestExpiresAt = Date.now() + Math.max(60000, (info.FormDigestTimeoutSeconds - 60) * 1000);
      return digest;
    };

    const request = async (path, { method = 'GET', body, merge = false, deleteItem = false } = {}) => {
      const headers = { Accept: accept };
      if (method !== 'GET') {
        headers['X-RequestDigest'] = await getDigest();
        headers['Content-Type'] = accept;
      }
      if (merge) {
        headers['IF-MATCH'] = '*';
        headers['X-HTTP-Method'] = 'MERGE';
      }
      if (deleteItem) {
        headers['IF-MATCH'] = '*';
        headers['X-HTTP-Method'] = 'DELETE';
      }
      const response = await fetch(`${siteUrl}${path}`, {
        method,
        credentials: 'same-origin',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!response.ok) throw new Error(`${method} ${path} failed: ${response.status} ${await response.text()}`);
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text).d : null;
    };

    const allLists = (await request('/_api/web/lists?$select=Id,Title')).results;
    const existingTargets = allLists.filter(item => manifest.some(asset => asset.name === item.Title));
    if (options.failIfAnyTargetExists && existingTargets.length) {
      throw new Error(`Production target assets already exist: ${existingTargets.map(item => item.Title).join(', ')}`);
    }

    const output = { created: [], fieldsCreated: 0, titleFieldsUpdated: 0, configSeeded: [], crud: null, errors: [] };

    for (const asset of manifest) {
      try {
        let list = allLists.find(item => item.Title === asset.name);
        if (!list) {
          await request('/_api/web/lists', {
            method: 'POST',
            body: {
              __metadata: { type: 'SP.List' },
              BaseTemplate: asset.baseTemplate,
              ContentTypesEnabled: true,
              Description: asset.description,
              Title: asset.name
            }
          });
          list = await request(`/_api/web/lists/getbytitle('${asset.name}')?$select=Id,Title,BaseTemplate,RootFolder/ServerRelativeUrl&$expand=RootFolder`);
          output.created.push({ name: asset.name, id: list.Id, url: list.RootFolder.ServerRelativeUrl, kind: asset.kind });
        }

        const listId = list.Id;
        await request(`/_api/web/lists(guid'${listId}')`, {
          method: 'POST',
          merge: true,
          body: {
            __metadata: { type: 'SP.List' },
            ContentTypesEnabled: true,
            EnableFolderCreation: asset.enableFolders,
            EnableVersioning: true,
            OnQuickLaunch: false
          }
        });

        if (asset.titleField) {
          await request(`/_api/web/lists(guid'${listId}')/fields/getbyinternalnameortitle('Title')`, {
            method: 'POST',
            merge: true,
            body: {
              __metadata: { type: 'SP.FieldText' },
              Required: asset.titleField.required,
              Title: asset.titleField.displayName
            }
          });
          output.titleFieldsUpdated += 1;
        }

        const existingFields = (await request(`/_api/web/lists(guid'${listId}')/fields?$select=InternalName`)).results;
        const fieldNames = new Set(existingFields.map(field => field.InternalName));
        for (const field of asset.fields) {
          if (fieldNames.has(field.name)) continue;
          await request(`/_api/web/lists(guid'${listId}')/fields/createfieldasxml`, {
            method: 'POST',
            body: {
              parameters: {
                __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
                Options: 0,
                SchemaXml: field.schemaXml
              }
            }
          });
          output.fieldsCreated += 1;
        }
      } catch (error) {
        output.errors.push({ asset: asset.name, message: String(error?.message ?? error) });
        throw Object.assign(new Error(`Provisioning stopped at ${asset.name}: ${error?.message ?? error}`), { provisionOutput: output });
      }
    }

    const config = await request("/_api/web/lists/getbytitle('KCFKPI_Config')?$select=Id,ListItemEntityTypeFullName");
    const entityType = config.ListItemEntityTypeFullName;
    const escapeOData = value => value.replace(/'/g, "''");

    for (const seed of configSeeds) {
      const found = (await request(`/_api/web/lists(guid'${config.Id}')/items?$select=Id,ConfigKey&$filter=ConfigKey eq '${escapeOData(seed.ConfigKey)}'`)).results;
      if (found.length) continue;
      const created = await request(`/_api/web/lists(guid'${config.Id}')/items`, {
        method: 'POST',
        body: { __metadata: { type: entityType }, ...seed }
      });
      output.configSeeded.push({ id: created.Id, key: seed.ConfigKey });
    }

    if (options.runCrudTest) {
      const testKey = 'KCFKPI009.CRUD.TEST';
      const previous = (await request(`/_api/web/lists(guid'${config.Id}')/items?$select=Id&$filter=ConfigKey eq '${testKey}'`)).results;
      if (previous.length) throw new Error('Pre-existing KCF-KPI-009 CRUD test record found; refusing to overwrite/delete it.');
      const created = await request(`/_api/web/lists(guid'${config.Id}')/items`, {
        method: 'POST',
        body: {
          __metadata: { type: entityType },
          Title: 'KCF-KPI-009 safe CRUD test',
          ConfigKey: testKey,
          Category: 'Operations',
          ValueType: 'Text',
          TextValue: 'created',
          Environment: 'Production',
          Active: false,
          Description: 'Synthetic non-personal configuration CRUD verification record.',
          ChangeReference: 'KCF-KPI-009'
        }
      });
      const read = await request(`/_api/web/lists(guid'${config.Id}')/items(${created.Id})?$select=Id,ConfigKey,TextValue`);
      await request(`/_api/web/lists(guid'${config.Id}')/items(${created.Id})`, {
        method: 'POST',
        merge: true,
        body: { __metadata: { type: entityType }, TextValue: 'updated-and-verified' }
      });
      const updated = await request(`/_api/web/lists(guid'${config.Id}')/items(${created.Id})?$select=Id,ConfigKey,TextValue`);
      await request(`/_api/web/lists(guid'${config.Id}')/items(${created.Id})/recycle()`, { method: 'POST' });
      const remaining = (await request(`/_api/web/lists(guid'${config.Id}')/items?$select=Id&$filter=ConfigKey eq '${testKey}'`)).results;
      output.crud = { created: { id: created.Id, key: testKey }, read, updated, deletedToRecycleBin: remaining.length === 0 };
    }

    output.completedAt = new Date().toISOString();
    return output;
  })();
}

function browserVerify(siteUrl, manifest, configKeys, spikeAssets) {
  return (async () => {
    if (location.origin !== new URL(siteUrl).origin) throw new Error('SharePoint origin mismatch.');
    const accept = 'application/json;odata=verbose';
    const get = async path => {
      const response = await fetch(`${siteUrl}${path}`, { credentials: 'same-origin', headers: { Accept: accept } });
      if (!response.ok) throw new Error(`GET ${path} failed: ${response.status} ${await response.text()}`);
      return (await response.json()).d;
    };
    const assets = [];
    for (const expected of manifest) {
      const list = await get(`/_api/web/lists/getbytitle('${expected.name}')?$select=Id,Title,BaseTemplate,Description,EnableFolderCreation,EnableVersioning,HasUniqueRoleAssignments,Hidden,OnQuickLaunch,ItemCount,RootFolder/ServerRelativeUrl&$expand=RootFolder`);
      const fields = (await get(`/_api/web/lists(guid'${list.Id}')/fields?$select=Id,InternalName,Title,TypeAsString,Required,EnforceUniqueValues,Indexed,DefaultValue,Hidden,ReadOnlyField,FromBaseType,Choices`)).results;
      assets.push({
        name: expected.name,
        id: list.Id,
        url: list.RootFolder.ServerRelativeUrl,
        baseTemplate: list.BaseTemplate,
        description: list.Description,
        enableFolders: list.EnableFolderCreation,
        enableVersioning: list.EnableVersioning,
        hasUniqueRoleAssignments: list.HasUniqueRoleAssignments,
        hidden: list.Hidden,
        onQuickLaunch: list.OnQuickLaunch,
        itemCount: list.ItemCount,
        fields
      });
    }
    const configList = assets.find(asset => asset.name === 'KCFKPI_Config');
    const configItems = (await get(`/_api/web/lists(guid'${configList.id}')/items?$select=Id,Title,ConfigKey,Category,ValueType,TextValue,NumberValue,BooleanValue,JSONValue,Environment,Active,Description,ChangeReference&$filter=${configKeys.map(key => `ConfigKey eq '${key.replace(/'/g, "''")}'`).join(' or ')}`)).results;
    const spikes = [];
    for (const name of spikeAssets) {
      const item = await get(`/_api/web/lists/getbytitle('${name}')?$select=Id,Title,ItemCount,LastItemModifiedDate,RootFolder/ServerRelativeUrl&$expand=RootFolder`);
      spikes.push({ name: item.Title, id: item.Id, itemCount: item.ItemCount, modified: item.LastItemModifiedDate, url: item.RootFolder.ServerRelativeUrl });
    }
    return { assets, configItems, spikes, verifiedAt: new Date().toISOString() };
  })();
}

function expressionFor(functionValue, args) {
  return `(${functionValue.toString()})(${args.map(arg => JSON.stringify(arg)).join(',')})`;
}

export function makePreflightExpression() {
  return expressionFor(browserPreflight, [SITE_URL, TARGET_ASSETS, SPIKE_ASSETS]);
}

export function makeProvisionExpression(manifest, options = {}) {
  return expressionFor(browserProvision, [SITE_URL, manifest, CONFIG_SEEDS, { failIfAnyTargetExists: true, runCrudTest: false, ...options }]);
}

export function makeVerifyExpression(manifest) {
  return expressionFor(browserVerify, [SITE_URL, manifest, CONFIG_SEEDS.map(item => item.ConfigKey), SPIKE_ASSETS]);
}

function expectedTypeAsString(type) {
  return ({
    Text: 'Text',
    Note: 'Note',
    Number: 'Number',
    Boolean: 'Boolean',
    DateOnly: 'DateTime',
    DateTime: 'DateTime',
    Choice: 'Choice',
    MultiChoice: 'MultiChoice'
  })[type];
}

function expectedDefaultValue(field) {
  if (field.defaultValue === null) return null;
  if (field.type === 'Boolean') return /^yes|true|1$/i.test(String(field.defaultValue)) ? '1' : '0';
  return String(field.defaultValue);
}

function actualDefaultValue(value) {
  if (value === null || value === undefined || value === '') return null;
  return String(value);
}

export function compareVerification(manifest, verification) {
  const results = [];
  for (const expected of manifest) {
    const actual = verification.assets.find(item => item.name === expected.name);
    const discrepancies = [];
    if (!actual) {
      discrepancies.push('Asset missing');
      results.push({ name: expected.name, pass: false, discrepancies });
      continue;
    }
    if (actual.baseTemplate !== expected.baseTemplate) discrepancies.push(`BaseTemplate expected ${expected.baseTemplate}, found ${actual.baseTemplate}`);
    if (!actual.enableVersioning) discrepancies.push('Versioning is not enabled');
    if (actual.enableFolders !== expected.enableFolders) discrepancies.push(`EnableFolderCreation expected ${expected.enableFolders}, found ${actual.enableFolders}`);
    if (actual.onQuickLaunch) discrepancies.push('Asset unexpectedly appears on Quick Launch');

    if (expected.titleField) {
      const title = actual.fields.find(field => field.InternalName === 'Title');
      if (!title) discrepancies.push('Built-in Title field missing');
      else {
        if (Boolean(title.Required) !== expected.titleField.required) discrepancies.push(`Title.Required expected ${expected.titleField.required}, found ${title.Required}`);
        if (title.Title !== expected.titleField.displayName) discrepancies.push(`Title display expected ${expected.titleField.displayName}, found ${title.Title}`);
      }
    }

    for (const field of expected.fields) {
      const found = actual.fields.find(item => item.InternalName === field.name);
      if (!found) {
        discrepancies.push(`Field missing: ${field.name}`);
        continue;
      }
      if (found.TypeAsString !== expectedTypeAsString(field.type)) discrepancies.push(`${field.name}.Type expected ${expectedTypeAsString(field.type)}, found ${found.TypeAsString}`);
      if (Boolean(found.Required) !== field.required) discrepancies.push(`${field.name}.Required expected ${field.required}, found ${found.Required}`);
      if (Boolean(found.EnforceUniqueValues) !== field.unique) discrepancies.push(`${field.name}.Unique expected ${field.unique}, found ${found.EnforceUniqueValues}`);
      if (Boolean(found.Indexed) !== Boolean(field.indexed || field.unique)) discrepancies.push(`${field.name}.Indexed expected ${Boolean(field.indexed || field.unique)}, found ${found.Indexed}`);
      if (actualDefaultValue(found.DefaultValue) !== expectedDefaultValue(field)) discrepancies.push(`${field.name}.Default expected ${expectedDefaultValue(field)}, found ${actualDefaultValue(found.DefaultValue)}`);
      if ((field.type === 'Choice' || field.type === 'MultiChoice') && field.choices.some(choice => !Array.from(found.Choices?.results ?? found.Choices ?? []).includes(choice))) {
        discrepancies.push(`${field.name}.Choices missing approved value(s)`);
      }
    }
    results.push({
      name: expected.name,
      pass: discrepancies.length === 0,
      discrepancies,
      id: actual.id,
      url: actual.url,
      expectedCustomFieldCount: expected.fields.length,
      actualApprovedFieldCount: expected.fields.filter(field => actual.fields.some(item => item.InternalName === field.name)).length,
      permissions: actual.hasUniqueRoleAssignments ? 'Unique' : 'Inherited'
    });
  }

  const expectedConfigKeys = new Set(CONFIG_SEEDS.map(item => item.ConfigKey));
  const actualConfigKeys = new Set(verification.configItems.map(item => item.ConfigKey));
  const missingConfig = [...expectedConfigKeys].filter(key => !actualConfigKeys.has(key));
  const configDiscrepancies = [];
  for (const expected of CONFIG_SEEDS) {
    const found = verification.configItems.find(item => item.ConfigKey === expected.ConfigKey);
    if (!found) continue;
    for (const [key, value] of Object.entries(expected)) {
      if (found[key] !== value) configDiscrepancies.push(`${expected.ConfigKey}.${key} expected ${JSON.stringify(value)}, found ${JSON.stringify(found[key])}`);
    }
  }
  const compositeIndexAssessment = manifest.flatMap(asset => asset.compositeIndexes.map(index => {
    const secondary = asset.fields.find(field => field.name === index.secondary);
    const supportedSecondary = secondary && ['Number', 'DateOnly', 'DateTime'].includes(secondary.type);
    return { asset: asset.name, ...index, secondaryType: secondary?.type ?? 'Unknown', supportedSecondary };
  }));
  return {
    assets: results,
    fieldAndSingleIndexPass: results.every(result => result.pass),
    configPass: missingConfig.length === 0 && configDiscrepancies.length === 0,
    pass: results.every(result => result.pass) && missingConfig.length === 0 && configDiscrepancies.length === 0 && compositeIndexAssessment.length === 0,
    missingConfig,
    configDiscrepancies,
    configCount: verification.configItems.length,
    spikes: verification.spikes,
    compositeIndexes: compositeIndexAssessment
  };
}
