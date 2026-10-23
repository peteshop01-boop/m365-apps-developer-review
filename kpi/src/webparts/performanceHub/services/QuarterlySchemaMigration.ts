export type QuarterlySchemaFieldType = 'Choice' | 'Text' | 'Note' | 'DateOnly';

export interface IQuarterlySchemaFieldDefinition {
  id: string;
  internalName: string;
  type: QuarterlySchemaFieldType;
  required: false;
  indexed: false;
  choices?: string[];
}

export interface IQuarterlySchemaFieldReadback {
  internalName: string;
  type: string;
  required: boolean;
  indexed: boolean;
  choices: string[];
}

export interface IQuarterlySchemaMigrationResult {
  listId: string;
  listTitle: 'KCFKPI_QuarterReviewItems';
  listUrl: string;
  createdFields: string[];
  verifiedFields: IQuarterlySchemaFieldReadback[];
  missingFields: string[];
  mismatches: string[];
}

export const QUARTERLY_EXTENSION_FIELDS: IQuarterlySchemaFieldDefinition[] = [
  { id: '4bcb6503-5458-4a06-ac42-85d96f7de931', internalName: 'BTGRoute', type: 'Choice', required: false, indexed: false, choices: ['Recover', 'Mitigate', 'Reforecast', 'Escalate'] },
  { id: 'fd029118-b4c3-48ac-a1ef-282a3fa0f250', internalName: 'BTGOwnerPersonKey', type: 'Text', required: false, indexed: false },
  { id: 'cfc12437-f0b8-4d5e-a0ae-4a93b43796e1', internalName: 'BTGDueDate', type: 'DateOnly', required: false, indexed: false },
  { id: 'ddec8ab7-58e0-4233-a02a-c5762774daca', internalName: 'BTGStatus', type: 'Choice', required: false, indexed: false, choices: ['Draft', 'Active', 'Complete', 'Superseded', 'Escalated'] },
  { id: '259972d9-1619-4336-af45-7f88f8f8f3e3', internalName: 'BTGExpectedReturnToGreenDate', type: 'DateOnly', required: false, indexed: false },
  { id: '8cd4b568-36f1-4b10-a704-1cfad4b39aea', internalName: 'BTGExpectedReducedOutcome', type: 'Note', required: false, indexed: false },
  { id: '91c85046-040a-43dc-a72f-b66cdde9c663', internalName: 'ReforecastProposedTarget', type: 'Text', required: false, indexed: false },
  { id: '87e4035d-e570-4f88-a4ce-848cc6f8a6db', internalName: 'ReforecastProposedDate', type: 'DateOnly', required: false, indexed: false },
  { id: 'f4e90084-a530-4a67-af14-0f01af59cae1', internalName: 'ReforecastReason', type: 'Note', required: false, indexed: false },
  { id: '5cde1ffb-17dd-44ef-adcb-0df5daf3395c', internalName: 'ReforecastApprovalStatus', type: 'Choice', required: false, indexed: false, choices: ['NotRequested', 'Pending', 'Approved', 'Rejected'] },
  { id: '6efe7a8c-31df-4a56-a4f1-626cbbbf3b0d', internalName: 'EscalationDependency', type: 'Note', required: false, indexed: false },
  { id: '3350e61b-7909-4900-a29f-21ab788ade35', internalName: 'EscalatedTo', type: 'Text', required: false, indexed: false },
  { id: '56d3fdfe-1479-4d33-a8ff-3142e9881347', internalName: 'EscalationTargetDecisionDate', type: 'DateOnly', required: false, indexed: false },
  { id: '4b067c9e-f3f8-4990-adf6-a19ffbe733da', internalName: 'BehaviourExamples', type: 'Note', required: false, indexed: false },
  { id: '29b732ce-fce7-4fee-ad1a-2d23638b3097', internalName: 'ManagerBehaviourAssessment', type: 'Choice', required: false, indexed: false, choices: ['ExceedsExpectations', 'MeetsExpectations', 'Developing', 'InsufficientEvidence'] }
];

const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const quarterlyFieldSchemaXml = (field: IQuarterlySchemaFieldDefinition): string => {
  const sharePointType = field.type === 'DateOnly' ? 'DateTime' : field.type;
  const attributes = [
    `ID="{${field.id}}"`,
    `Name="${field.internalName}"`,
    `StaticName="${field.internalName}"`,
    `DisplayName="${field.internalName}"`,
    `Type="${sharePointType}"`,
    'Required="FALSE"',
    'Indexed="FALSE"',
    'Hidden="FALSE"',
    'Group="KCF KPI Production"'
  ];
  if (field.type === 'Text') attributes.push('MaxLength="255"');
  if (field.type === 'Note') attributes.push('RichText="FALSE"', 'NumLines="6"', 'AppendOnly="FALSE"');
  if (field.type === 'DateOnly') attributes.push('Format="DateOnly"', 'FriendlyDisplayFormat="Disabled"');
  if (field.type === 'Choice') attributes.push('Format="Dropdown"', 'FillInChoice="FALSE"');
  const choices = field.choices?.length
    ? `<CHOICES>${field.choices.map(choice => `<CHOICE>${escapeXml(choice)}</CHOICE>`).join('')}</CHOICES>`
    : '';
  return `<Field ${attributes.join(' ')}>${choices}</Field>`;
};

export const validateQuarterlySchemaReadback = (fields: IQuarterlySchemaFieldReadback[]): { missingFields: string[]; mismatches: string[] } => {
  const byName = new Map(fields.map(field => [field.internalName, field]));
  const missingFields: string[] = [];
  const mismatches: string[] = [];
  QUARTERLY_EXTENSION_FIELDS.forEach(expected => {
    const actual = byName.get(expected.internalName);
    if (!actual) {
      missingFields.push(expected.internalName);
      return;
    }
    const expectedType = expected.type === 'DateOnly' ? 'DateTime' : expected.type;
    if (actual.type !== expectedType) mismatches.push(`${expected.internalName}: type ${actual.type}, expected ${expectedType}.`);
    if (actual.required) mismatches.push(`${expected.internalName}: Required must be false.`);
    if (actual.indexed) mismatches.push(`${expected.internalName}: Indexed must be false.`);
    const expectedChoices = expected.choices || [];
    if (expectedChoices.length && (actual.choices.length !== expectedChoices.length || expectedChoices.some(choice => actual.choices.indexOf(choice) < 0))) {
      mismatches.push(`${expected.internalName}: choices ${actual.choices.join(', ')}, expected ${expectedChoices.join(', ')}.`);
    }
  });
  return { missingFields, mismatches };
};
