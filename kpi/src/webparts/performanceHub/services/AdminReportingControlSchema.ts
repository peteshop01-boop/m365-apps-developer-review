export type AdminReportingControlFieldType = 'Text' | 'Choice';

export interface IAdminReportingControlFieldDefinition {
  id: string;
  listTitle: 'KCFKPI_ReportingMap' | 'KCFKPI_OutputDefinitions';
  internalName: string;
  type: AdminReportingControlFieldType;
  required: boolean;
  indexed: boolean;
  enforceUniqueValues: boolean;
  defaultValue?: string;
  choices?: readonly string[];
}

export interface IAdminReportingControlFieldReadback {
  id: string;
  listTitle: string;
  internalName: string;
  type: string;
  required: boolean;
  hidden: boolean;
  indexed: boolean;
  enforceUniqueValues: boolean;
  defaultValue?: string;
  choices: readonly string[];
  schemaXml?: string;
}

/**
 * Existing ReportingMap.ExternalKey is the signed external output row/field
 * key. No duplicate section/field columns are added without a concrete output
 * contract. MappingRequirement is the one missing persisted readiness fact.
 */
export const ADMIN_REPORTING_CONTROL_FIELDS: readonly IAdminReportingControlFieldDefinition[] = [
  {
    id: '767d727a-04d8-4cb2-a0d4-d6b914332890',
    listTitle: 'KCFKPI_OutputDefinitions',
    internalName: 'MappingRequirement',
    type: 'Choice',
    required: true,
    indexed: false,
    enforceUniqueValues: false,
    choices: ['Required', 'Optional']
  }
];

const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const adminReportingControlFieldSchemaXml = (
  field: IAdminReportingControlFieldDefinition
): string => {
  const attributes = [
    `ID="{${field.id}}"`,
    `Name="${field.internalName}"`,
    `StaticName="${field.internalName}"`,
    `DisplayName="${field.internalName}"`,
    `Type="${field.type}"`,
    `Required="${field.required ? 'TRUE' : 'FALSE'}"`,
    `Indexed="${field.indexed ? 'TRUE' : 'FALSE'}"`,
    `EnforceUniqueValues="${field.enforceUniqueValues ? 'TRUE' : 'FALSE'}"`,
    'Hidden="FALSE"',
    'Group="KCF KPI Production"'
  ];
  if (field.type === 'Text') attributes.push('MaxLength="255"');
  if (field.type === 'Choice') attributes.push('Format="Dropdown"', 'FillInChoice="FALSE"');
  const choices = field.choices?.length
    ? `<CHOICES>${field.choices.map(choice => `<CHOICE>${escapeXml(choice)}</CHOICE>`).join('')}</CHOICES>`
    : '';
  const defaultValue = field.defaultValue ? `<Default>${escapeXml(field.defaultValue)}</Default>` : '';
  return `<Field ${attributes.join(' ')}>${choices}${defaultValue}</Field>`;
};

const normaliseGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();

const schemaAttribute = (schemaXml: string | undefined, name: string): string | undefined => {
  if (!schemaXml) return undefined;
  const attributes = /\s([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = attributes.exec(schemaXml)) !== null) {
    if (match[1].toLowerCase() === name.toLowerCase()) return match[2];
  }
  return undefined;
};

export const validateAdminReportingControlSchemaReadback = (
  rows: readonly IAdminReportingControlFieldReadback[]
): { missingFields: string[]; mismatches: string[] } => {
  const missingFields: string[] = [];
  const mismatches: string[] = [];
  ADMIN_REPORTING_CONTROL_FIELDS.forEach(expected => {
    const actual = rows.filter(row => row.listTitle === expected.listTitle
      && row.internalName === expected.internalName)[0];
    const label = `${expected.listTitle}.${expected.internalName}`;
    if (!actual) {
      missingFields.push(label);
      return;
    }
    if (normaliseGuid(actual.id) !== normaliseGuid(expected.id)) {
      mismatches.push(`${label}: field ID ${actual.id}, expected ${expected.id}.`);
    }
    if (actual.type !== expected.type) mismatches.push(`${label}: type ${actual.type}, expected ${expected.type}.`);
    if (actual.required !== expected.required) mismatches.push(`${label}: Required ${actual.required}, expected ${expected.required}.`);
    if (actual.hidden) mismatches.push(`${label}: Hidden true, expected false.`);
    if (actual.indexed !== expected.indexed) mismatches.push(`${label}: Indexed ${actual.indexed}, expected ${expected.indexed}.`);
    if (actual.enforceUniqueValues !== expected.enforceUniqueValues) {
      mismatches.push(`${label}: EnforceUniqueValues ${actual.enforceUniqueValues}, expected ${expected.enforceUniqueValues}.`);
    }
    const choices = expected.choices || [];
    if (choices.length && (actual.choices.length !== choices.length
      || choices.some(choice => actual.choices.indexOf(choice) < 0))) {
      mismatches.push(`${label}: choices ${actual.choices.join(', ')}, expected ${choices.join(', ')}.`);
    }
    if ((actual.defaultValue || '') !== (expected.defaultValue || '')) {
      mismatches.push(`${label}: default ${actual.defaultValue || '(blank)'}, expected ${expected.defaultValue || '(blank)'}.`);
    }
    if (expected.type === 'Choice') {
      if (schemaAttribute(actual.schemaXml, 'Format') !== 'Dropdown') {
        mismatches.push(`${label}: Choice Format must be Dropdown.`);
      }
      if ((schemaAttribute(actual.schemaXml, 'FillInChoice') || '').toUpperCase() !== 'FALSE') {
        mismatches.push(`${label}: FillInChoice must be FALSE.`);
      }
    }
  });
  return { missingFields, mismatches };
};
