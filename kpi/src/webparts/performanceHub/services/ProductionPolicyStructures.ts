import type { IMilestoneStageRecord } from './ScoringPolicy';

export type ProductionPolicyFieldType = 'Text' | 'Note' | 'Number' | 'Boolean' | 'Choice' | 'DateOnly';

export interface IProductionPolicyFieldDefinition {
  id: string;
  internalName: string;
  type: ProductionPolicyFieldType;
  required: boolean;
  indexed: boolean;
  enforceUniqueValues?: boolean;
  choices?: readonly string[];
  decimalPlaces?: 0 | 2;
  minimum?: number;
  maximum?: number;
}

export interface IProductionPolicyListDefinition {
  title: 'KCFKPI_MilestoneStages' | 'KCFKPI_OrganisationalWeights';
  description: string;
  fields: readonly IProductionPolicyFieldDefinition[];
}

export interface IProductionPolicyFieldReadback {
  internalName: string;
  type: string;
  required: boolean;
  indexed: boolean;
  enforceUniqueValues: boolean;
  choices: readonly string[];
}

export interface IOrganisationalWeightRecord {
  organisationalWeightKey: string;
  weightGroupKey: string;
  performanceYear: number;
  weightLevel: 'KPIWithinWorkstream' | 'WorkstreamWithinPillar' | 'PillarWithinBoard';
  parentKey: string;
  childKey: string;
  weightPercent?: number;
  active: boolean;
  approvalStatus: 'Draft' | 'Approved' | 'Superseded';
  effectiveFrom: string;
  effectiveTo?: string;
  version: string;
  approvalReference: string;
  source: string;
  publishedSnapshotKey?: string;
  historicSnapshotLocked: boolean;
}

export interface IPolicyValidationResult {
  valid: boolean;
  errors: string[];
}

const milestoneFields: readonly IProductionPolicyFieldDefinition[] = [
  { id: 'c89fc0c6-c96c-48c1-a343-422c924c50dd', internalName: 'MilestoneStageKey', type: 'Text', required: true, indexed: true, enforceUniqueValues: true },
  { id: '89a4b944-6848-44d1-affc-e62481301505', internalName: 'PerformanceYear', type: 'Number', required: true, indexed: true, decimalPlaces: 0, minimum: 2000, maximum: 2100 },
  { id: '1ebc5503-2e3e-4c38-a98d-90c4c40e7112', internalName: 'KPIID', type: 'Text', required: true, indexed: true },
  { id: 'fdc2a465-a1e4-4ee8-a137-bf5cd17acbd7', internalName: 'KPIVersionKey', type: 'Text', required: true, indexed: false },
  { id: '66ceb27f-18c3-4e45-a68d-9f875bca1c06', internalName: 'StageKey', type: 'Text', required: true, indexed: false },
  { id: '456b1505-7fb6-429d-a50f-a6aa08b4c710', internalName: 'StageOrderKey', type: 'Text', required: true, indexed: true, enforceUniqueValues: true },
  { id: '245914c9-439c-43e4-a854-7b63b71fc010', internalName: 'StageName', type: 'Text', required: true, indexed: false },
  { id: '6f1d91eb-559f-4ef3-ada4-a725d42041a8', internalName: 'SortOrder', type: 'Number', required: true, indexed: false, decimalPlaces: 0, minimum: 1 },
  { id: '85e6c86b-0f20-4e42-a8ef-a57c68fb1270', internalName: 'CompletionPercent', type: 'Number', required: true, indexed: false, decimalPlaces: 2, minimum: 0, maximum: 100 },
  { id: '7718de4a-1992-4ab5-a8a2-0a49496d080f', internalName: 'Active', type: 'Boolean', required: true, indexed: true },
  { id: '6f8b7bd1-0c70-4e20-a166-b4ff3f0b482c', internalName: 'ApprovalStatus', type: 'Choice', required: true, indexed: true, choices: ['Draft', 'Approved', 'Retired'] },
  { id: '3f120c6f-ad8c-444f-a566-e64e5ba7ffde', internalName: 'EffectiveFrom', type: 'DateOnly', required: true, indexed: false },
  { id: '647da04b-255c-42bc-afe5-2433f984a067', internalName: 'EffectiveTo', type: 'DateOnly', required: false, indexed: false },
  { id: 'c82cfb96-44ec-43fc-a46b-7da215e363c8', internalName: 'Version', type: 'Text', required: true, indexed: false },
  { id: '39f5125f-0c9a-44f5-a904-0d176b65511e', internalName: 'Source', type: 'Note', required: true, indexed: false },
  { id: 'b2d1ce8e-aa4f-4de7-a3da-8b18f13ac8b1', internalName: 'ApprovalReference', type: 'Text', required: true, indexed: false }
];

const organisationalWeightFields: readonly IProductionPolicyFieldDefinition[] = [
  { id: '49dd3be4-eab9-4b0e-a6a3-6b48892e6dce', internalName: 'OrganisationalWeightKey', type: 'Text', required: true, indexed: true, enforceUniqueValues: true },
  { id: 'c159be70-dd87-44f9-a075-8ce1014eb817', internalName: 'WeightGroupKey', type: 'Text', required: true, indexed: true },
  { id: 'e8cab3b9-1f67-4d4d-ae14-da54d123160e', internalName: 'PerformanceYear', type: 'Number', required: true, indexed: true, decimalPlaces: 0, minimum: 2000, maximum: 2100 },
  { id: 'cae26972-807b-4eac-ae28-9f22f99923d8', internalName: 'WeightLevel', type: 'Choice', required: true, indexed: true, choices: ['KPIWithinWorkstream', 'WorkstreamWithinPillar', 'PillarWithinBoard'] },
  { id: 'a7d72ea4-0621-43f9-aa35-bd4a83bcde94', internalName: 'ParentKey', type: 'Text', required: true, indexed: true },
  { id: '510140a8-2200-4696-a02c-aa1d6c5bb199', internalName: 'ChildKey', type: 'Text', required: true, indexed: false },
  { id: '717d70fd-626c-4703-a4d9-5de9f3bd1c3d', internalName: 'WeightPercent', type: 'Number', required: true, indexed: false, decimalPlaces: 2, minimum: 0, maximum: 100 },
  { id: 'a2016380-fc13-4f4e-af49-766bd173210f', internalName: 'Active', type: 'Boolean', required: true, indexed: true },
  { id: 'cd53fde7-2732-45ff-acf3-7d4a71e0e0f5', internalName: 'ApprovalStatus', type: 'Choice', required: true, indexed: true, choices: ['Draft', 'Approved', 'Superseded'] },
  { id: '363b51ff-b892-42d7-afc3-698db010a14a', internalName: 'EffectiveFrom', type: 'DateOnly', required: true, indexed: false },
  { id: '8461bed2-ff94-48d6-adfa-86f851594fd8', internalName: 'EffectiveTo', type: 'DateOnly', required: false, indexed: false },
  { id: 'fe9d6e1b-8ea2-4b2d-a75c-3929ea4ebe15', internalName: 'Version', type: 'Text', required: true, indexed: false },
  { id: '80dca9fe-6f7b-42c7-a172-ceaa8251b36d', internalName: 'ApprovalReference', type: 'Text', required: true, indexed: false },
  { id: '33140bf3-0997-4877-a97f-ae9be1ec83ae', internalName: 'Source', type: 'Note', required: true, indexed: false },
  { id: '3a7bc76a-a77b-4e4d-a17c-feb59cb73dfb', internalName: 'PublishedSnapshotKey', type: 'Text', required: false, indexed: false },
  { id: '00c5f7e0-9f39-4ff1-abdf-cb55fa824b7d', internalName: 'HistoricSnapshotLocked', type: 'Boolean', required: true, indexed: false }
];

export const ORGANISATIONAL_WEIGHTS_LIST_DEFINITION = {
  title: 'KCFKPI_OrganisationalWeights',
  description: 'CONTROL-approved, year- and version-specific KPI/Workstream/Pillar organisational weights. Blank governance remains unpublished.',
  fields: organisationalWeightFields
} as const satisfies IProductionPolicyListDefinition;

// The schema action creates storage only. CONTROL has not authorised any
// organisational weighting values or an equal-weight seed.
export const ORGANISATIONAL_WEIGHTS_INITIAL_ROWS: readonly IOrganisationalWeightRecord[] = [];

const controlledKeyPart = (value: string | number): string => String(value).trim();

export const organisationalWeightGroupKey = (
  record: Pick<IOrganisationalWeightRecord, 'performanceYear' | 'weightLevel' | 'parentKey' | 'version'>
): string => [record.performanceYear, record.version, record.weightLevel, record.parentKey]
  .map(controlledKeyPart)
  .join('|');

export const organisationalWeightRecordKey = (
  record: Pick<IOrganisationalWeightRecord, 'performanceYear' | 'weightLevel' | 'parentKey' | 'childKey' | 'version'>
): string => `${organisationalWeightGroupKey(record)}|${controlledKeyPart(record.childKey)}`;

export const PRODUCTION_POLICY_LISTS: readonly IProductionPolicyListDefinition[] = [
  {
    title: 'KCFKPI_MilestoneStages',
    description: 'CONTROL-approved, year- and version-specific ordered Milestone scoring stages. Empty maps are deliberately NotRated.',
    fields: milestoneFields
  },
  ORGANISATIONAL_WEIGHTS_LIST_DEFINITION
];

const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const productionPolicyFieldSchemaXml = (field: IProductionPolicyFieldDefinition): string => {
  const type = field.type === 'DateOnly' ? 'DateTime' : field.type;
  const attributes = [
    `ID="{${field.id}}"`,
    `Name="${field.internalName}"`,
    `StaticName="${field.internalName}"`,
    `DisplayName="${field.internalName}"`,
    `Type="${type}"`,
    `Required="${field.required ? 'TRUE' : 'FALSE'}"`,
    `Indexed="${field.indexed ? 'TRUE' : 'FALSE'}"`,
    `EnforceUniqueValues="${field.enforceUniqueValues ? 'TRUE' : 'FALSE'}"`,
    'Hidden="FALSE"',
    'Group="KCF KPI Production"'
  ];
  if (field.type === 'Text') attributes.push('MaxLength="255"');
  if (field.type === 'Note') attributes.push('RichText="FALSE"', 'NumLines="6"', 'AppendOnly="FALSE"');
  if (field.type === 'Number') {
    attributes.push(`Decimals="${field.decimalPlaces ?? 2}"`);
    if (field.minimum !== undefined) attributes.push(`Min="${field.minimum}"`);
    if (field.maximum !== undefined) attributes.push(`Max="${field.maximum}"`);
  }
  if (field.type === 'Boolean') attributes.push('Default="0"');
  if (field.type === 'DateOnly') attributes.push('Format="DateOnly"', 'FriendlyDisplayFormat="Disabled"');
  if (field.type === 'Choice') attributes.push('Format="Dropdown"', 'FillInChoice="FALSE"');
  const choices = field.choices?.length
    ? `<CHOICES>${field.choices.map(choice => `<CHOICE>${escapeXml(choice)}</CHOICE>`).join('')}</CHOICES>`
    : '';
  return `<Field ${attributes.join(' ')}>${choices}</Field>`;
};

export const validateProductionPolicySchemaReadback = (
  definition: IProductionPolicyListDefinition,
  fields: readonly IProductionPolicyFieldReadback[]
): { missingFields: string[]; mismatches: string[] } => {
  const byName = new Map(fields.map(field => [field.internalName, field]));
  const missingFields: string[] = [];
  const mismatches: string[] = [];
  definition.fields.forEach(expected => {
    const actual = byName.get(expected.internalName);
    if (!actual) {
      missingFields.push(expected.internalName);
      return;
    }
    const expectedType = expected.type === 'DateOnly' ? 'DateTime' : expected.type;
    if (actual.type !== expectedType) mismatches.push(`${expected.internalName}: type ${actual.type}, expected ${expectedType}.`);
    if (actual.required !== expected.required) mismatches.push(`${expected.internalName}: Required ${actual.required}, expected ${expected.required}.`);
    if (actual.indexed !== expected.indexed) mismatches.push(`${expected.internalName}: Indexed ${actual.indexed}, expected ${expected.indexed}.`);
    if (actual.enforceUniqueValues !== Boolean(expected.enforceUniqueValues)) {
      mismatches.push(`${expected.internalName}: EnforceUniqueValues ${actual.enforceUniqueValues}, expected ${Boolean(expected.enforceUniqueValues)}.`);
    }
    const expectedChoices = expected.choices ?? [];
    if (expectedChoices.length && (actual.choices.length !== expectedChoices.length
      || expectedChoices.some(choice => actual.choices.indexOf(choice) < 0))) {
      mismatches.push(`${expected.internalName}: choices ${actual.choices.join(', ')}, expected ${expectedChoices.join(', ')}.`);
    }
  });
  return { missingFields, mismatches };
};

const parseDate = (value: string): number | undefined => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export const validateMilestoneStageRecords = (records: readonly IMilestoneStageRecord[]): IPolicyValidationResult => {
  const errors: string[] = [];
  const groups = new Map<string, IMilestoneStageRecord[]>();
  records.forEach(record => {
    const key = `${record.performanceYear}|${record.kpiId}|${record.kpiVersionKey}|${record.version}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  groups.forEach((group, key) => {
    if (group.some(record => !record.stageKey.trim() || !record.stageName.trim() || !record.source.trim() || !record.approvalReference.trim())) {
      errors.push(`${key} has blank controlled Milestone metadata.`);
    }
    if (group.some(record => !Number.isInteger(record.sortOrder) || record.sortOrder < 1
      || !Number.isFinite(record.completionPercent) || record.completionPercent < 0 || record.completionPercent > 100)) {
      errors.push(`${key} has an invalid stage order or CompletionPercent.`);
    }
    if (new Set(group.map(record => record.stageKey.trim().toLowerCase())).size !== group.length) errors.push(`${key} has duplicate StageKey values.`);
    if (new Set(group.map(record => record.sortOrder)).size !== group.length) errors.push(`${key} has duplicate SortOrder values.`);
    const ordered = [...group].sort((left, right) => left.sortOrder - right.sortOrder);
    if (ordered.some((record, index) => index > 0 && record.completionPercent < ordered[index - 1].completionPercent)) {
      errors.push(`${key} CompletionPercent values must not decrease with SortOrder.`);
    }
    if (ordered.length && ordered[ordered.length - 1].completionPercent !== 100) errors.push(`${key} final stage must equal 100%.`);
    if (group.some(record => parseDate(record.effectiveFrom) === undefined
      || (record.effectiveTo && parseDate(record.effectiveTo) === undefined))) errors.push(`${key} has an invalid effective date.`);
  });
  return { valid: errors.length === 0, errors };
};

export const validateOrganisationalWeightRecords = (records: readonly IOrganisationalWeightRecord[]): IPolicyValidationResult => {
  const errors: string[] = [];
  records.filter(record => record.active && record.approvalStatus !== 'Approved').forEach(record => {
    errors.push(`${organisationalWeightRecordKey(record)} is active but not approved.`);
  });
  const activeApproved = records.filter(record => record.active && record.approvalStatus === 'Approved');
  if (!activeApproved.length) errors.push('No active approved organisational weights are configured.');
  const groups = new Map<string, IOrganisationalWeightRecord[]>();
  activeApproved.forEach(record => {
    const key = `${record.performanceYear}|${record.weightLevel}|${record.parentKey}|${record.version}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  groups.forEach((group, key) => {
    if (group.some(record => record.weightGroupKey !== organisationalWeightGroupKey(record)
      || record.organisationalWeightKey !== organisationalWeightRecordKey(record))) {
      errors.push(`${key} has an invalid controlled group or record key.`);
    }
    if (group.some(record => !record.childKey.trim() || !record.version.trim() || !record.source.trim() || !record.approvalReference.trim())) {
      errors.push(`${key} has blank controlled organisational-weight metadata.`);
    }
    if (new Set(group.map(record => record.childKey.trim().toLowerCase())).size !== group.length) errors.push(`${key} has duplicate children.`);
    if (group.some(record => record.weightPercent === undefined || !Number.isFinite(record.weightPercent)
      || (record.weightPercent as number) < 0 || (record.weightPercent as number) > 100
      || Math.abs(((record.weightPercent as number) * 100) - Math.round((record.weightPercent as number) * 100)) > 0.000001)) {
      errors.push(`${key} has an invalid or unresolved weight.`);
    } else {
      const totalBasisPoints = group.reduce(
        (sum, record) => sum + Math.round((record.weightPercent as number) * 100),
        0
      );
      const total = totalBasisPoints / 100;
      if (totalBasisPoints !== 10000) errors.push(`${key} weights total ${total}, expected 100.`);
    }
    if (group.some(record => parseDate(record.effectiveFrom) === undefined
      || (record.effectiveTo && parseDate(record.effectiveTo) === undefined))) errors.push(`${key} has an invalid effective date.`);
    if (group.some(record => record.publishedSnapshotKey && !record.historicSnapshotLocked)) {
      errors.push(`${key} contains an unlocked published historic snapshot.`);
    }
  });
  return { valid: errors.length === 0, errors };
};
