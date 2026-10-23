export type Workplan018FieldType = 'Text' | 'Note' | 'Number' | 'Boolean' | 'Choice' | 'DateOnly';

export type Workplan018ListTitle =
  | 'KCFKPI_Workplans'
  | 'KCFKPI_WorkplanItems'
  | 'KCFKPI_QuarterReviews'
  | 'KCFKPI_QuarterReviewItems'
  | 'KCFKPI_BehaviourObjectiveLibrary';

export interface IWorkplan018FieldDefinition {
  id: string;
  internalName: string;
  type: Workplan018FieldType;
  required: boolean;
  indexed: boolean;
  enforceUniqueValues?: boolean;
  choices?: readonly string[];
  decimalPlaces?: 0 | 2;
  minimum?: number;
  maximum?: number;
}

export interface IWorkplan018ListDefinition {
  title: Workplan018ListTitle;
  description: string;
  createIfMissing: boolean;
  fields: readonly IWorkplan018FieldDefinition[];
}

export interface IWorkplan018FieldReadback {
  internalName: string;
  type: string;
  required: boolean;
  indexed: boolean;
  enforceUniqueValues: boolean;
  choices: readonly string[];
}

export const PERSONAL_MEASURE_TYPES = [
  'Count', 'Number', 'Percentage', 'Currency', 'Rate', 'Days', 'Score',
  'Milestone', 'Other', 'TextStatus'
] as const;
export const PERSONAL_SCORING_DIRECTIONS = [
  'HigherIsBetter', 'LowerIsBetter', 'TargetRange', 'Milestone', 'TBC'
] as const;

const workplanFields: readonly IWorkplan018FieldDefinition[] = [
  { id: '7768b8fe-2b11-4371-a556-b18006bf878b', internalName: 'CategoryWeightingReason', type: 'Note', required: false, indexed: false }
];

const workplanItemFields: readonly IWorkplan018FieldDefinition[] = [
  { id: '9e6a8ccb-3059-4be7-acad-64176f1e93e8', internalName: 'LocalKPIDescription', type: 'Note', required: false, indexed: false },
  { id: 'f72324d7-2bbe-49b3-a4fe-25f336d911bf', internalName: 'LocalMetricType', type: 'Choice', required: false, indexed: false, choices: PERSONAL_MEASURE_TYPES },
  { id: '2643b0a5-3031-41b5-a5b1-5a498a2bc674', internalName: 'LocalScoringDirection', type: 'Choice', required: false, indexed: false, choices: PERSONAL_SCORING_DIRECTIONS },
  { id: '958c0b83-d626-4470-a20b-6d7762bfbf56', internalName: 'LocalPercentageScale', type: 'Choice', required: false, indexed: false, choices: ['Fraction', 'Whole'] },
  { id: '5b614fda-5f9a-4368-ab78-16c32ed3406d', internalName: 'LocalBaselineValue', type: 'Number', required: false, indexed: false, decimalPlaces: 2 },
  { id: '73e871aa-daf5-428e-a838-d5748eba7ecd', internalName: 'Q1TargetValue', type: 'Number', required: false, indexed: false, decimalPlaces: 2 },
  { id: '232870fa-f290-4b52-aac3-1fbab221f5cd', internalName: 'Q1TargetText', type: 'Text', required: false, indexed: false },
  { id: '671b725d-a7be-402a-a37c-4ac9642ae726', internalName: 'Q2TargetValue', type: 'Number', required: false, indexed: false, decimalPlaces: 2 },
  { id: '566044ad-0561-4ab8-adb8-3a6d5578ecf2', internalName: 'Q2TargetText', type: 'Text', required: false, indexed: false },
  { id: '4fb64cee-8f58-4603-aac2-013e94e6413d', internalName: 'Q3TargetValue', type: 'Number', required: false, indexed: false, decimalPlaces: 2 },
  { id: '84b7eb1f-68f8-4834-a131-461dd97fef47', internalName: 'Q3TargetText', type: 'Text', required: false, indexed: false },
  { id: '6dc1515c-b84a-4d6b-ac95-cc3a7f4010f7', internalName: 'Q4TargetValue', type: 'Number', required: false, indexed: false, decimalPlaces: 2 },
  { id: '0208c752-f0ba-4986-a8c9-a94ad73ae170', internalName: 'Q4TargetText', type: 'Text', required: false, indexed: false },
  { id: '4372229c-64d1-4e47-a4ce-07a090390c36', internalName: 'BehaviourObjectiveSource', type: 'Choice', required: false, indexed: false, choices: ['Library', 'Custom'] },
  { id: '19bc878c-5b5a-4280-a044-3eb81a00f313', internalName: 'BehaviourObjectiveKey', type: 'Text', required: false, indexed: false },
  { id: 'c8e8b997-28de-4ac4-a3bf-7fb092cfe1e5', internalName: 'BehaviourObjectiveTitle', type: 'Text', required: false, indexed: false },
  { id: '0e746e14-a0a0-46b5-a58c-8bd3e34463e1', internalName: 'BehaviourObjectiveDescription', type: 'Note', required: false, indexed: false },
  { id: '1f174164-bf25-4408-a2ee-613b71d24969', internalName: 'BehaviourMeasure', type: 'Note', required: false, indexed: false },
  { id: 'aa5ebfe9-605b-468f-ab66-ee632ed63d5d', internalName: 'BehaviourEvidenceDefinition', type: 'Note', required: false, indexed: false },
  { id: '2f1fb742-f3dd-4b0c-a419-eb04282a9b5b', internalName: 'Q1BehaviourTargetRating', type: 'Number', required: false, indexed: false, decimalPlaces: 0, minimum: 1, maximum: 4 },
  { id: '5ed9eb44-fe72-4a94-af33-b39f6e5eb763', internalName: 'Q2BehaviourTargetRating', type: 'Number', required: false, indexed: false, decimalPlaces: 0, minimum: 1, maximum: 4 },
  { id: 'd1578939-7833-4a7b-a4ad-167d5955e01b', internalName: 'Q3BehaviourTargetRating', type: 'Number', required: false, indexed: false, decimalPlaces: 0, minimum: 1, maximum: 4 },
  { id: '23666aef-565f-45b8-ae08-492f96c483c7', internalName: 'Q4BehaviourTargetRating', type: 'Number', required: false, indexed: false, decimalPlaces: 0, minimum: 1, maximum: 4 }
];

const quarterReviewFields: readonly IWorkplan018FieldDefinition[] = [
  { id: '28905c8c-c590-4112-a6c5-23095fab8e80', internalName: 'CoreCategoryWeightSnapshot', type: 'Number', required: false, indexed: false, decimalPlaces: 2, minimum: 0, maximum: 100 },
  { id: 'ad7197a7-c689-4efc-a64e-135646bb1c4e', internalName: 'PersonalCategoryWeightSnapshot', type: 'Number', required: false, indexed: false, decimalPlaces: 2, minimum: 0, maximum: 100 },
  { id: 'ecb6efff-2a12-4809-a801-f54ad0e044ce', internalName: 'BehaviourCategoryWeightSnapshot', type: 'Number', required: false, indexed: false, decimalPlaces: 2, minimum: 0, maximum: 100 },
  { id: '5371bcbb-5155-4874-a204-6496199292b1', internalName: 'WorkplanApprovalCorrelationKey', type: 'Text', required: false, indexed: false }
];

const quarterReviewItemFields: readonly IWorkplan018FieldDefinition[] = [
  { id: 'cab16e71-0731-4e38-a21d-3b8a3702c1d8', internalName: 'ItemDescriptionSnapshot', type: 'Note', required: false, indexed: false },
  { id: 'e659f82c-2ed9-4276-a221-dea3ad6654f8', internalName: 'MeasureSnapshot', type: 'Note', required: false, indexed: false },
  { id: 'f00c7c2a-ccf2-4d60-ab97-5d4936eff9ca', internalName: 'MetricTypeSnapshot', type: 'Choice', required: false, indexed: false, choices: PERSONAL_MEASURE_TYPES },
  { id: '68799a74-ec7f-42af-a74e-eb4f269befc8', internalName: 'ScoringDirectionSnapshot', type: 'Choice', required: false, indexed: false, choices: PERSONAL_SCORING_DIRECTIONS },
  { id: '6feefbfe-b5db-419c-a350-baaa836d5873', internalName: 'PercentageScaleSnapshot', type: 'Choice', required: false, indexed: false, choices: ['Fraction', 'Whole'] },
  { id: '72a80d39-e0ea-4471-a553-50f2434e242f', internalName: 'BaselineValueSnapshot', type: 'Number', required: false, indexed: false, decimalPlaces: 2 },
  { id: '19ff3384-934f-4c8b-a2ee-814b549ebd36', internalName: 'YearEndTargetValueSnapshot', type: 'Number', required: false, indexed: false, decimalPlaces: 2 },
  { id: '8537b0b6-9547-47f3-ae7a-3419aa41583b', internalName: 'YearEndTargetTextSnapshot', type: 'Text', required: false, indexed: false },
  { id: 'ee289cb9-b842-477b-a87f-4776c0bef711', internalName: 'WorkplanItemWeightSnapshot', type: 'Number', required: false, indexed: false, decimalPlaces: 2, minimum: 0, maximum: 100 },
  { id: '0c7f285e-4b35-4c88-a3fd-23d2f8895ba9', internalName: 'BehaviourIDSnapshot', type: 'Text', required: false, indexed: false },
  { id: '83651757-f83a-4ed9-a1b5-9b5031b83db6', internalName: 'BehaviourVersionKeySnapshot', type: 'Text', required: false, indexed: false },
  { id: 'd9c806af-cd64-49ea-a5cd-ef48e9624382', internalName: 'BehaviourTitleSnapshot', type: 'Text', required: false, indexed: false },
  { id: '8d3947be-0dd6-4189-a1ea-5aa088d3fb5b', internalName: 'BehaviourDescriptionSnapshot', type: 'Note', required: false, indexed: false },
  { id: '9cdb7762-4b17-4529-a40d-0c0ba9266420', internalName: 'BehaviourGuidanceSnapshot', type: 'Note', required: false, indexed: false },
  { id: 'e4e0dd3a-7192-4279-a421-5ef9fd696d70', internalName: 'BehaviourObjectiveKeySnapshot', type: 'Text', required: false, indexed: false },
  { id: '3ab0292b-556a-4e46-a1c2-6427055faf3a', internalName: 'BehaviourObjectiveTitleSnapshot', type: 'Text', required: false, indexed: false },
  { id: '0d8b319a-fa5a-4cd8-a29c-95073160f194', internalName: 'BehaviourObjectiveSourceSnapshot', type: 'Choice', required: false, indexed: false, choices: ['Library', 'Custom'] },
  { id: '3554486b-9a58-4330-a9ff-eecc26016d8c', internalName: 'BehaviourEvidenceDefSnapshot', type: 'Note', required: false, indexed: false },
  { id: '17dbae56-3393-4041-a25d-2338a4043af7', internalName: 'BehaviourTargetRating', type: 'Number', required: false, indexed: false, decimalPlaces: 0, minimum: 1, maximum: 4 },
  { id: '78b41088-25ad-41eb-a39d-bb81eb42d43a', internalName: 'EmployeeBehaviourRating', type: 'Number', required: false, indexed: false, decimalPlaces: 0, minimum: 1, maximum: 4 },
  { id: 'bcc1288e-7b42-4380-a014-0dbeb4a60f84', internalName: 'ManagerBehaviourRating', type: 'Number', required: false, indexed: false, decimalPlaces: 0, minimum: 1, maximum: 4 },
  { id: '09247567-13e3-4a85-af70-ef0a41bf1379', internalName: 'FinalBehaviourRating', type: 'Number', required: false, indexed: false, decimalPlaces: 0, minimum: 1, maximum: 4 }
];

const objectiveLibraryFields: readonly IWorkplan018FieldDefinition[] = [
  { id: 'e782f53c-a813-48eb-a567-80c7764576d9', internalName: 'BehaviourObjectiveKey', type: 'Text', required: true, indexed: true, enforceUniqueValues: true },
  { id: 'e9984cea-b18b-45a2-a545-a468fc5f733e', internalName: 'BehaviourKey', type: 'Text', required: true, indexed: true },
  { id: '69af228b-ba48-4296-ad0a-c3a258439b30', internalName: 'ObjectiveTitle', type: 'Text', required: true, indexed: false },
  { id: '5ee2abfe-dd97-43e6-af48-f975a6ea8506', internalName: 'ObjectiveDescription', type: 'Note', required: true, indexed: false },
  { id: '85796618-9d95-4bbb-a309-1260a77886d7', internalName: 'SuggestedMeasure', type: 'Note', required: true, indexed: false },
  { id: 'cf27ef31-1ac9-446c-a498-d1eac8a4c64f', internalName: 'SuggestedUnit', type: 'Text', required: true, indexed: false },
  { id: 'c31d6f89-02da-4f11-aacb-f076ef4688e8', internalName: 'SuggestedEvidence', type: 'Note', required: true, indexed: false },
  { id: '0ae8a075-bd9e-49c9-ac26-163866489c2d', internalName: 'Active', type: 'Boolean', required: true, indexed: true },
  { id: '7d9c6b59-df5a-4c5d-ab3e-6cc3cc5b4617', internalName: 'SortOrder', type: 'Number', required: true, indexed: false, decimalPlaces: 0, minimum: 1 },
  { id: '351ae4d6-c72f-4b83-a62b-e74fcfe2a7f5', internalName: 'EffectiveFrom', type: 'DateOnly', required: true, indexed: false },
  { id: 'a1375a2a-efcf-43e4-a3ee-872905764d2a', internalName: 'EffectiveTo', type: 'DateOnly', required: false, indexed: false }
];

export const WORKPLAN_018_SCHEMA: readonly IWorkplan018ListDefinition[] = [
  { title: 'KCFKPI_Workplans', description: 'Annual Workplan headers and approved category-weight proposal context.', createIfMissing: false, fields: workplanFields },
  { title: 'KCFKPI_WorkplanItems', description: 'Persistent Core, Personal KPI and selected Behaviour-objective annual definitions.', createIfMissing: false, fields: workplanItemFields },
  { title: 'KCFKPI_QuarterReviews', description: 'Quarter-review lifecycle and immutable approved Workplan category snapshots.', createIfMissing: false, fields: quarterReviewFields },
  { title: 'KCFKPI_QuarterReviewItems', description: 'Quarter target, result, evidence, Recovery and Behaviour assessment snapshots.', createIfMissing: false, fields: quarterReviewItemFields },
  { title: 'KCFKPI_BehaviourObjectiveLibrary', description: 'Admin-maintainable suggested objectives for the five fixed KCF Behaviour banners.', createIfMissing: true, fields: objectiveLibraryFields }
];

const escapeXml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

export const workplan018FieldSchemaXml = (field: IWorkplan018FieldDefinition): string => {
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
  if (field.type === 'Boolean') attributes.push('Default="1"');
  if (field.type === 'DateOnly') attributes.push('Format="DateOnly"', 'FriendlyDisplayFormat="Disabled"');
  if (field.type === 'Choice') attributes.push('Format="Dropdown"', 'FillInChoice="FALSE"');
  const choices = field.choices?.length
    ? `<CHOICES>${field.choices.map(choice => `<CHOICE>${escapeXml(choice)}</CHOICE>`).join('')}</CHOICES>`
    : '';
  return `<Field ${attributes.join(' ')}>${choices}</Field>`;
};

export const validateWorkplan018SchemaReadback = (
  definition: IWorkplan018ListDefinition,
  actualFields: readonly IWorkplan018FieldReadback[]
): { missingFields: string[]; mismatches: string[] } => {
  const actualByName = new Map(actualFields.map(field => [field.internalName, field]));
  const missingFields: string[] = [];
  const mismatches: string[] = [];
  definition.fields.forEach(expected => {
    const actual = actualByName.get(expected.internalName);
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
    const expectedChoices = expected.choices || [];
    if (expectedChoices.length && (actual.choices.length !== expectedChoices.length
      || expectedChoices.some(choice => actual.choices.indexOf(choice) < 0))) {
      mismatches.push(`${expected.internalName}: choices ${actual.choices.join(', ')}, expected ${expectedChoices.join(', ')}.`);
    }
  });
  return { missingFields, mismatches };
};
