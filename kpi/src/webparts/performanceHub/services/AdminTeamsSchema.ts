export type AdminTeamsFieldType = 'Text' | 'Number' | 'Boolean';

export interface IAdminTeamsFieldDefinition {
  id: string;
  internalName: 'TeamKey' | 'TeamName' | 'TeamLeadPersonKey' | 'Active' | 'SortOrder';
  type: AdminTeamsFieldType;
  required: boolean;
  indexed: boolean;
  enforceUniqueValues: boolean;
  defaultValue?: string;
  maxLength?: number;
  decimalPlaces?: 0;
  minimum?: number;
}

export interface IAdminTeamsListSettings {
  baseTemplate: 100;
  enableVersioning: true;
  enableFolderCreation: false;
  onQuickLaunch: false;
  hidden: false;
}

export interface IAdminTeamsFieldReadback {
  id: string;
  internalName: string;
  type: string;
  required: boolean;
  hidden: boolean;
  indexed: boolean;
  enforceUniqueValues: boolean;
  defaultValue?: string;
  schemaXml: string;
}

export interface IAdminTeamsListReadback {
  baseTemplate: number;
  description: string;
  enableVersioning: boolean;
  enableFolderCreation: boolean;
  onQuickLaunch: boolean;
  hidden: boolean;
  itemCount: number;
}

export interface IAdminTeamsSchemaValidation {
  missingFields: string[];
  mismatches: string[];
}

export const ADMIN_TEAMS_LIST_TITLE = 'KCFKPI_Teams' as const;

export const ADMIN_TEAMS_LIST_DESCRIPTION =
  'Controlled KCF Team dimension. Reporting hierarchy remains independent and no Team rows are seeded.';

export const ADMIN_TEAMS_LIST_SETTINGS: IAdminTeamsListSettings = {
  baseTemplate: 100,
  enableVersioning: true,
  enableFolderCreation: false,
  onQuickLaunch: false,
  hidden: false
};

/**
 * Teams uses TeamName as its business label. SharePoint's built-in Title field
 * remains a system field, but it must not force administrators to supply a
 * second, undocumented name value.
 */
export const ADMIN_TEAMS_TITLE_FIELD = {
  internalName: 'Title' as const,
  required: false,
  hidden: true
};

/**
 * KCF has not approved final Team names. An empty list is therefore a valid,
 * explicit "Teams not configured" state and provisioning must never seed rows.
 */
export const ADMIN_TEAMS_INITIAL_ROWS: readonly never[] = [];

/**
 * The five approved custom fields only. SharePoint's built-in system fields
 * (including ID and Title) are not part of this custom-field contract.
 */
export const ADMIN_TEAMS_FIELDS: readonly IAdminTeamsFieldDefinition[] = [
  {
    id: 'a48f3516-7a00-416e-aecd-618b94da6130',
    internalName: 'TeamKey',
    type: 'Text',
    required: true,
    indexed: true,
    enforceUniqueValues: true,
    maxLength: 255
  },
  {
    id: 'b2518dbb-e14f-4221-ab99-21a5ea17031f',
    internalName: 'TeamName',
    type: 'Text',
    required: true,
    indexed: false,
    enforceUniqueValues: false,
    maxLength: 255
  },
  {
    id: '53ca238f-492d-47e5-a3ad-c888908fb9f2',
    internalName: 'TeamLeadPersonKey',
    type: 'Text',
    required: false,
    indexed: true,
    enforceUniqueValues: false,
    maxLength: 255
  },
  {
    id: '8348d128-77ec-4bba-a480-662a23823707',
    internalName: 'Active',
    type: 'Boolean',
    required: true,
    indexed: true,
    enforceUniqueValues: false,
    defaultValue: '1'
  },
  {
    id: '5558362c-f0d3-4325-ac07-ce71965ec228',
    internalName: 'SortOrder',
    type: 'Number',
    required: true,
    indexed: false,
    enforceUniqueValues: false,
    decimalPlaces: 0,
    minimum: 0
  }
];

const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const normaliseGuid = (value: string): string => value.replace(/[{}]/g, '').toLowerCase();

const schemaAttribute = (schemaXml: string, name: string): string | undefined => {
  const source = schemaXml || '';
  const token = `${name}="`;
  const start = source.toLowerCase().indexOf(token.toLowerCase());
  if (start < 0) return undefined;
  const valueStart = start + token.length;
  const valueEnd = source.indexOf('"', valueStart);
  return valueEnd < 0 ? undefined : source.slice(valueStart, valueEnd);
};

const normaliseDefault = (value: string | undefined): string | undefined => {
  if (value === undefined || value === '') return undefined;
  return value;
};

export const adminTeamsFieldSchemaXml = (field: IAdminTeamsFieldDefinition): string => {
  const attributes = [
    `ID="{${field.id}}"`,
    `Name="${escapeXml(field.internalName)}"`,
    `StaticName="${escapeXml(field.internalName)}"`,
    `DisplayName="${escapeXml(field.internalName)}"`,
    `Type="${field.type}"`,
    `Required="${field.required ? 'TRUE' : 'FALSE'}"`,
    `Indexed="${field.indexed ? 'TRUE' : 'FALSE'}"`,
    `EnforceUniqueValues="${field.enforceUniqueValues ? 'TRUE' : 'FALSE'}"`,
    'Hidden="FALSE"',
    'Group="KCF KPI Production"'
  ];
  if (field.type === 'Text') attributes.push(`MaxLength="${field.maxLength}"`);
  if (field.type === 'Number') {
    attributes.push(`Decimals="${field.decimalPlaces}"`);
    if (field.minimum !== undefined) attributes.push(`Min="${field.minimum}"`);
  }
  if (field.defaultValue !== undefined) attributes.push(`Default="${escapeXml(field.defaultValue)}"`);
  return `<Field ${attributes.join(' ')} />`;
};

export const validateAdminTeamsFields = (
  actualFields: readonly IAdminTeamsFieldReadback[]
): IAdminTeamsSchemaValidation => {
  const missingFields: string[] = [];
  const mismatches: string[] = [];
  ADMIN_TEAMS_FIELDS.forEach(expected => {
    const actual = actualFields.filter(field => field.internalName === expected.internalName)[0];
    if (!actual) {
      missingFields.push(expected.internalName);
      return;
    }
    if (normaliseGuid(actual.id) !== normaliseGuid(expected.id)) {
      mismatches.push(`${expected.internalName}: field ID does not match the approved contract.`);
    }
    if (actual.type !== expected.type) {
      mismatches.push(`${expected.internalName}: type ${actual.type}, expected ${expected.type}.`);
    }
    if (actual.required !== expected.required) {
      mismatches.push(`${expected.internalName}: Required ${actual.required}, expected ${expected.required}.`);
    }
    if (actual.hidden !== false) {
      mismatches.push(`${expected.internalName}: Hidden ${actual.hidden}, expected false.`);
    }
    if (actual.indexed !== expected.indexed) {
      mismatches.push(`${expected.internalName}: Indexed ${actual.indexed}, expected ${expected.indexed}.`);
    }
    if (actual.enforceUniqueValues !== expected.enforceUniqueValues) {
      mismatches.push(`${expected.internalName}: EnforceUniqueValues ${actual.enforceUniqueValues}, expected ${expected.enforceUniqueValues}.`);
    }

    const actualDefault = normaliseDefault(actual.defaultValue)
      || normaliseDefault(schemaAttribute(actual.schemaXml, 'Default'));
    if (actualDefault !== expected.defaultValue) {
      mismatches.push(`${expected.internalName}: default ${actualDefault || 'blank'}, expected ${expected.defaultValue || 'blank'}.`);
    }
    if (expected.maxLength !== undefined
      && schemaAttribute(actual.schemaXml, 'MaxLength') !== String(expected.maxLength)) {
      mismatches.push(`${expected.internalName}: MaxLength must be ${expected.maxLength}.`);
    }
    if (expected.decimalPlaces !== undefined
      && schemaAttribute(actual.schemaXml, 'Decimals') !== String(expected.decimalPlaces)) {
      mismatches.push(`${expected.internalName}: Decimals must be ${expected.decimalPlaces}.`);
    }
    if (expected.minimum !== undefined
      && schemaAttribute(actual.schemaXml, 'Min') !== String(expected.minimum)) {
      mismatches.push(`${expected.internalName}: Min must be ${expected.minimum}.`);
    }
  });
  return { missingFields, mismatches };
};

export const validateAdminTeamsTitleField = (
  actualFields: readonly IAdminTeamsFieldReadback[]
): string[] => {
  const actual = actualFields.filter(field => field.internalName === ADMIN_TEAMS_TITLE_FIELD.internalName)[0];
  if (!actual) return ['Built-in Title field was not returned by SharePoint.'];
  const mismatches: string[] = [];
  if (actual.required !== ADMIN_TEAMS_TITLE_FIELD.required) {
    mismatches.push(`Title: Required ${actual.required}, expected false.`);
  }
  if (actual.hidden !== ADMIN_TEAMS_TITLE_FIELD.hidden) {
    mismatches.push(`Title: Hidden ${actual.hidden}, expected true.`);
  }
  return mismatches;
};

export const validateAdminTeamsListSettings = (
  actual: IAdminTeamsListReadback
): string[] => {
  const mismatches: string[] = [];
  if (actual.baseTemplate !== ADMIN_TEAMS_LIST_SETTINGS.baseTemplate) {
    mismatches.push(`BaseTemplate ${actual.baseTemplate}, expected 100.`);
  }
  if (actual.description !== ADMIN_TEAMS_LIST_DESCRIPTION) {
    mismatches.push('Description does not match the approved Teams contract.');
  }
  if (actual.enableVersioning !== ADMIN_TEAMS_LIST_SETTINGS.enableVersioning) {
    mismatches.push(`EnableVersioning ${actual.enableVersioning}, expected true.`);
  }
  if (actual.enableFolderCreation !== ADMIN_TEAMS_LIST_SETTINGS.enableFolderCreation) {
    mismatches.push(`EnableFolderCreation ${actual.enableFolderCreation}, expected false.`);
  }
  if (actual.onQuickLaunch !== ADMIN_TEAMS_LIST_SETTINGS.onQuickLaunch) {
    mismatches.push(`OnQuickLaunch ${actual.onQuickLaunch}, expected false.`);
  }
  if (actual.hidden !== ADMIN_TEAMS_LIST_SETTINGS.hidden) {
    mismatches.push(`Hidden ${actual.hidden}, expected false.`);
  }
  if (!isFinite(actual.itemCount) || actual.itemCount % 1 !== 0 || actual.itemCount < 0) {
    mismatches.push(`ItemCount ${actual.itemCount} is invalid.`);
  }
  return mismatches;
};
