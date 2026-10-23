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
  title: 'DEMOAPP_MilestoneStages' | 'DEMOAPP_OrganisationalWeights';
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
  { id: 'ad3ec35c-edb5-411a-b236-3a30b16d415d', internalName: 'MilestoneStageKey', type: 'Text', required: true, indexed: true, enforceUniqueValues: true },
  { id: '581726c4-5374-48bd-b02b-187cb249febd', internalName: 'PerformanceYear', type: 'Number', required: true, indexed: true, decimalPlaces: 0, minimum: 2000, maximum: 2100 },
  { id: '440a5c73-97bb-4fef-af85-40a7d6b7f00c', internalName: 'KPIID', type: 'Text', required: true, indexed: true },
  { id: 'dbe12ec3-ac38-4683-a68a-9aa20d880165', internalName: 'KPIVersionKey', type: 'Text', required: true, indexed: false },
  { id: '23771b1a-e6f6-4eac-ab66-2afe6c981806', internalName: 'StageKey', type: 'Text', required: true, indexed: false },
  { id: '704f3dc1-718c-481f-b1f9-912552002b62', internalName: 'StageOrderKey', type: 'Text', required: true, indexed: true, enforceUniqueValues: true },
  { id: '215754c4-1aae-4e31-be7e-06f86cced8a8', internalName: 'StageName', type: 'Text', required: true, indexed: false },
  { id: '65eb182d-eb34-40f4-9ddb-b56940018d15', internalName: 'SortOrder', type: 'Number', required: true, indexed: false, decimalPlaces: 0, minimum: 1 },
  { id: '1a817e7c-fec2-4b9c-bc1e-7d60580b2808', internalName: 'CompletionPercent', type: 'Number', required: true, indexed: false, decimalPlaces: 2, minimum: 0, maximum: 100 },
  { id: 'd5bb2deb-d5ef-49cc-80c7-e4e06e1b1279', internalName: 'Active', type: 'Boolean', required: true, indexed: true },
  { id: 'a860e589-1a95-4580-aa03-4ae5a610d915', internalName: 'ApprovalStatus', type: 'Choice', required: true, indexed: true, choices: ['Draft', 'Approved', 'Retired'] },
  { id: '031eddfb-a2ba-48a2-92e2-eae7951701b8', internalName: 'EffectiveFrom', type: 'DateOnly', required: true, indexed: false },
  { id: '42e25e83-8c55-412d-a93d-fa5fb496a253', internalName: 'EffectiveTo', type: 'DateOnly', required: false, indexed: false },
  { id: '13690a1e-a490-47f5-84cc-ad78152408dd', internalName: 'Version', type: 'Text', required: true, indexed: false },
  { id: 'bf7cc515-d09c-43e7-b81f-fe4a51959dea', internalName: 'Source', type: 'Note', required: true, indexed: false },
  { id: 'ac700d07-48e5-4790-a2db-664e3c6d6608', internalName: 'ApprovalReference', type: 'Text', required: true, indexed: false }
];

const organisationalWeightFields: readonly IProductionPolicyFieldDefinition[] = [
  { id: 'dbe986e7-4a4d-4060-9a0b-1624f679b5bd', internalName: 'OrganisationalWeightKey', type: 'Text', required: true, indexed: true, enforceUniqueValues: true },
  { id: 'cfd2745d-4d7c-420b-9efe-471c96f2bfc7', internalName: 'WeightGroupKey', type: 'Text', required: true, indexed: true },
  { id: 'c2338871-3b18-4e50-96a3-d1be56926d42', internalName: 'PerformanceYear', type: 'Number', required: true, indexed: true, decimalPlaces: 0, minimum: 2000, maximum: 2100 },
  { id: 'da717de9-12a6-4673-b352-373b169e25f6', internalName: 'WeightLevel', type: 'Choice', required: true, indexed: true, choices: ['KPIWithinWorkstream', 'WorkstreamWithinPillar', 'PillarWithinBoard'] },
  { id: '05a1a15b-383c-4e9b-a04a-1b7623755e4b', internalName: 'ParentKey', type: 'Text', required: true, indexed: true },
  { id: '380319ae-389b-483c-8191-6de577537eb4', internalName: 'ChildKey', type: 'Text', required: true, indexed: false },
  { id: '6906d036-5e23-4b85-b332-88604f5570b9', internalName: 'WeightPercent', type: 'Number', required: true, indexed: false, decimalPlaces: 2, minimum: 0, maximum: 100 },
  { id: '37094fef-422a-49c9-a78c-3376d5fcdfa2', internalName: 'Active', type: 'Boolean', required: true, indexed: true },
  { id: '6a0407aa-c314-46f8-9c30-ceba61aa5d07', internalName: 'ApprovalStatus', type: 'Choice', required: true, indexed: true, choices: ['Draft', 'Approved', 'Superseded'] },
  { id: '6f8895f1-648c-4a86-bb00-7df4192357c0', internalName: 'EffectiveFrom', type: 'DateOnly', required: true, indexed: false },
  { id: '079d8fcb-c4e3-4599-9477-d7a8f8323ffc', internalName: 'EffectiveTo', type: 'DateOnly', required: false, indexed: false },
  { id: '2a60d25b-03b0-49ae-8fac-2a10ffead5c6', internalName: 'Version', type: 'Text', required: true, indexed: false },
  { id: '6fb29918-7b4d-4a88-8f01-b2effd2d3d17', internalName: 'ApprovalReference', type: 'Text', required: true, indexed: false },
  { id: 'bb90d8c6-7c39-49ae-bd43-70a542c84c09', internalName: 'Source', type: 'Note', required: true, indexed: false },
  { id: 'a5355c04-e0d2-43c9-bce3-36d25968de65', internalName: 'PublishedSnapshotKey', type: 'Text', required: false, indexed: false },
  { id: '9f60e159-62f3-42b8-a465-ec5a9bd7fa47', internalName: 'HistoricSnapshotLocked', type: 'Boolean', required: true, indexed: false }
];

export const ORGANISATIONAL_WEIGHTS_LIST_DEFINITION = {
  title: 'DEMOAPP_OrganisationalWeights',
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
    title: 'DEMOAPP_MilestoneStages',
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
    'Group="DEMO KPI Production"'
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
