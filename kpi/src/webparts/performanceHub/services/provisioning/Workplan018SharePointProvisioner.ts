import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import type { IBehaviourObjectiveLibraryRecord } from '../../models/BehaviourWorkplanModels';
import {
  type IWorkplan018FieldDefinition,
  type IWorkplan018FieldReadback,
  type IWorkplan018ListDefinition,
  type Workplan018ListTitle,
  WORKPLAN_018_SCHEMA,
  validateWorkplan018SchemaReadback,
  workplan018FieldSchemaXml
} from '../Workplan018Schema';
import {
  assertProductionQueryFields,
  BEHAVIOUR_OBJECTIVE_LIBRARY_SELECT
} from '../ProductionQueryFieldContracts';
import { BEHAVIOUR_OBJECTIVE_LIBRARY_SEED } from './BehaviourObjectiveLibrarySeed';

export const WORKPLAN_018_APPROVED_SITE = 'https://example.invalid/sites/REVIEW-TEST-SITE';
export const WORKPLAN_018_APPROVED_ACTOR = 'person003@example.invalid';

type ProvisioningMode = 'Preflight' | 'Provision';
export type Workplan018ProvisioningStatus = 'Running' | 'Ready' | 'Pass' | 'Failed';

interface IODataCollection<T> { value: T[]; }

interface ISharePointListRow {
  Id: string;
  BaseTemplate: number;
  EnableVersioning: boolean;
  EnableFolderCreation: boolean;
  OnQuickLaunch: boolean;
  RootFolder?: { ServerRelativeUrl?: string };
}

interface ISharePointFieldRow {
  Id: string;
  InternalName: string;
  TypeAsString: string;
  Required: boolean;
  Indexed: boolean;
  EnforceUniqueValues: boolean;
  Choices?: readonly string[] | { results?: readonly string[] };
  SchemaXml?: string;
}

interface ISharePointItemIdentity { Id: number; }

interface IBehaviourObjectiveLibraryRow extends ISharePointItemIdentity {
  BehaviourObjectiveKey: string;
  BehaviourKey: string;
  ObjectiveTitle: string;
  ObjectiveDescription: string;
  SuggestedMeasure: string;
  SuggestedUnit: string;
  SuggestedEvidence: string;
  Active: boolean;
  SortOrder: number;
  EffectiveFrom?: string;
  EffectiveTo?: string;
}

export interface IWorkplan018ListEvidence {
  title: Workplan018ListTitle;
  listId?: string;
  listUrl?: string;
  existedBefore: boolean;
  createdList: boolean;
  settingsChanged: boolean;
  missingFieldsBefore: string[];
  createdFields: string[];
  verifiedFields: string[];
  mismatches: string[];
}

export interface IBehaviourObjectiveSeedValidation {
  rowCount: number;
  distinctKeyCount: number;
  countsByBehaviour: { [behaviourKey: string]: number };
  duplicateKeys: string[];
  unknownKeys: string[];
  missingKeys: string[];
  contentMismatches: string[];
}

export interface IWorkplan018SeedEvidence extends IBehaviourObjectiveSeedValidation {
  expectedCount: 30;
  existingBefore: number;
  createdKeys: string[];
}

export interface IWorkplan018ProvisioningEvidence {
  mode: ProvisioningMode;
  status: Workplan018ProvisioningStatus;
  siteUrl: string;
  actorEmail: string;
  startedAt: string;
  completedAt?: string;
  lists: IWorkplan018ListEvidence[];
  seed: IWorkplan018SeedEvidence;
  actions: string[];
  error?: string;
}

export class Workplan018ProvisioningError extends Error {
  public readonly evidence: IWorkplan018ProvisioningEvidence;

  public constructor(message: string, evidence: IWorkplan018ProvisioningEvidence) {
    super(message);
    this.name = 'Workplan018ProvisioningError';
    this.evidence = evidence;
    Object.setPrototypeOf(this, Workplan018ProvisioningError.prototype);
  }
}

const normaliseGuid = (value: string | undefined): string =>
  (value || '').replace(/[{}]/g, '').toLowerCase();
const normaliseText = (value: string | undefined): string => (value || '').trim();
const normaliseDate = (value: string | undefined): string => normaliseText(value).slice(0, 10);
const escapeOData = (value: string): string => value.replace(/'/g, "''");
const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));

const fieldChoices = (value: ISharePointFieldRow['Choices']): readonly string[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as readonly string[];
  const wrapped = value as { results?: readonly string[] };
  return wrapped.results || [];
};

const mapFieldReadback = (row: ISharePointFieldRow): IWorkplan018FieldReadback => ({
  internalName: row.InternalName,
  type: row.TypeAsString,
  required: Boolean(row.Required),
  indexed: Boolean(row.Indexed),
  enforceUniqueValues: Boolean(row.EnforceUniqueValues),
  choices: fieldChoices(row.Choices)
});

const schemaAttribute = (schemaXml: string, name: string): string | undefined => {
  const marker = `${name}="`;
  const start = schemaXml.toLowerCase().indexOf(marker.toLowerCase());
  if (start < 0) return undefined;
  const valueStart = start + marker.length;
  const valueEnd = schemaXml.indexOf('"', valueStart);
  return valueEnd < 0 ? undefined : schemaXml.slice(valueStart, valueEnd);
};

const schemaElement = (schemaXml: string, name: string): string | undefined => {
  const opening = `<${name}>`;
  const closing = `</${name}>`;
  const start = schemaXml.toLowerCase().indexOf(opening.toLowerCase());
  if (start < 0) return undefined;
  const valueStart = start + opening.length;
  const valueEnd = schemaXml.toLowerCase().indexOf(closing.toLowerCase(), valueStart);
  return valueEnd < 0 ? undefined : schemaXml.slice(valueStart, valueEnd);
};

const physicalFieldMismatches = (
  expected: IWorkplan018FieldDefinition,
  actual: ISharePointFieldRow
): string[] => {
  const mismatches: string[] = [];
  const schemaXml = actual.SchemaXml || '';
  if (!schemaXml) return [`${expected.internalName}: SchemaXml was not returned for exact physical read-back.`];
  if (expected.type === 'Number') {
    if (Number(schemaAttribute(schemaXml, 'Decimals')) !== (expected.decimalPlaces ?? 2)) {
      mismatches.push(`${expected.internalName}: decimal places do not match the approved schema.`);
    }
    if (expected.minimum !== undefined && Number(schemaAttribute(schemaXml, 'Min')) !== expected.minimum) {
      mismatches.push(`${expected.internalName}: minimum does not match the approved schema.`);
    }
    if (expected.maximum !== undefined && Number(schemaAttribute(schemaXml, 'Max')) !== expected.maximum) {
      mismatches.push(`${expected.internalName}: maximum does not match the approved schema.`);
    }
  }
  if (expected.type === 'Text' && Number(schemaAttribute(schemaXml, 'MaxLength')) !== 255) {
    mismatches.push(`${expected.internalName}: MaxLength does not match 255.`);
  }
  if (expected.type === 'DateOnly' && schemaAttribute(schemaXml, 'Format') !== 'DateOnly') {
    mismatches.push(`${expected.internalName}: DateTime format is not DateOnly.`);
  }
  if (expected.type === 'Note') {
    if ((schemaAttribute(schemaXml, 'RichText') || '').toUpperCase() !== 'FALSE'
      || (schemaAttribute(schemaXml, 'AppendOnly') || '').toUpperCase() !== 'FALSE') {
      mismatches.push(`${expected.internalName}: Note field must be plain text and not append-only.`);
    }
  }
  if (expected.type === 'Choice' && (schemaAttribute(schemaXml, 'FillInChoice') || '').toUpperCase() !== 'FALSE') {
    mismatches.push(`${expected.internalName}: fill-in Choice values must be disabled.`);
  }
  if (expected.type === 'Boolean') {
    const defaultValue = schemaAttribute(schemaXml, 'Default') || schemaElement(schemaXml, 'Default');
    if (defaultValue !== '1' && defaultValue?.toUpperCase() !== 'TRUE') {
      mismatches.push(`${expected.internalName}: Boolean default must be Yes/true.`);
    }
  }
  return mismatches;
};

const mapLibraryRow = (row: IBehaviourObjectiveLibraryRow): IBehaviourObjectiveLibraryRecord => ({
  id: row.Id,
  behaviourObjectiveKey: row.BehaviourObjectiveKey,
  behaviourKey: row.BehaviourKey as IBehaviourObjectiveLibraryRecord['behaviourKey'],
  objectiveTitle: row.ObjectiveTitle,
  objectiveDescription: row.ObjectiveDescription,
  suggestedMeasure: row.SuggestedMeasure,
  suggestedUnit: row.SuggestedUnit,
  suggestedEvidence: row.SuggestedEvidence,
  active: Boolean(row.Active),
  sortOrder: Number(row.SortOrder),
  effectiveFrom: row.EffectiveFrom,
  effectiveTo: row.EffectiveTo || undefined
});

const seedRecordMismatches = (
  actual: IBehaviourObjectiveLibraryRecord,
  expected: IBehaviourObjectiveLibraryRecord
): string[] => {
  const mismatches: string[] = [];
  const compare = (label: string, actualValue: string, expectedValue: string): void => {
    if (normaliseText(actualValue) !== normaliseText(expectedValue)) {
      mismatches.push(`${expected.behaviourObjectiveKey}: ${label} differs from the approved seed.`);
    }
  };
  compare('BehaviourKey', actual.behaviourKey, expected.behaviourKey);
  compare('ObjectiveTitle', actual.objectiveTitle, expected.objectiveTitle);
  compare('ObjectiveDescription', actual.objectiveDescription, expected.objectiveDescription);
  compare('SuggestedMeasure', actual.suggestedMeasure, expected.suggestedMeasure);
  compare('SuggestedUnit', actual.suggestedUnit, expected.suggestedUnit);
  compare('SuggestedEvidence', actual.suggestedEvidence, expected.suggestedEvidence);
  if (actual.active !== expected.active) mismatches.push(`${expected.behaviourObjectiveKey}: Active differs from the approved seed.`);
  if (actual.sortOrder !== expected.sortOrder) mismatches.push(`${expected.behaviourObjectiveKey}: SortOrder differs from the approved seed.`);
  if (normaliseDate(actual.effectiveFrom) !== normaliseDate(expected.effectiveFrom)) mismatches.push(`${expected.behaviourObjectiveKey}: EffectiveFrom differs from the approved seed.`);
  if (normaliseDate(actual.effectiveTo) !== normaliseDate(expected.effectiveTo)) mismatches.push(`${expected.behaviourObjectiveKey}: EffectiveTo differs from the approved seed.`);
  return mismatches;
};

export const validateBehaviourObjectiveSeedReadback = (
  records: ReadonlyArray<IBehaviourObjectiveLibraryRecord>,
  requireComplete: boolean
): IBehaviourObjectiveSeedValidation => {
  const expectedByKey = new Map(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.map(item => [item.behaviourObjectiveKey, item]));
  const keyCounts = new Map<string, number>();
  const countsByBehaviour: { [behaviourKey: string]: number } = {
    'BHV-01': 0, 'BHV-02': 0, 'BHV-03': 0, 'BHV-04': 0, 'BHV-05': 0
  };
  const contentMismatches: string[] = [];
  records.forEach(record => {
    const key = normaliseText(record.behaviourObjectiveKey);
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    countsByBehaviour[record.behaviourKey] = (countsByBehaviour[record.behaviourKey] || 0) + 1;
    const expected = expectedByKey.get(key);
    if (expected) contentMismatches.push(...seedRecordMismatches(record, expected));
  });
  return {
    rowCount: records.length,
    distinctKeyCount: keyCounts.size,
    countsByBehaviour,
    duplicateKeys: uniqueSorted(Array.from(keyCounts.entries()).filter(([, count]) => count > 1).map(([key]) => key)),
    unknownKeys: uniqueSorted(Array.from(keyCounts.keys()).filter(key => !expectedByKey.has(key))),
    missingKeys: requireComplete
      ? uniqueSorted(Array.from(expectedByKey.keys()).filter(key => !keyCounts.has(key)))
      : [],
    contentMismatches: uniqueSorted(contentMismatches)
  };
};

const emptySeedEvidence = (): IWorkplan018SeedEvidence => ({
  expectedCount: 30,
  existingBefore: 0,
  createdKeys: [],
  rowCount: 0,
  distinctKeyCount: 0,
  countsByBehaviour: { 'BHV-01': 0, 'BHV-02': 0, 'BHV-03': 0, 'BHV-04': 0, 'BHV-05': 0 },
  duplicateKeys: [],
  unknownKeys: [],
  missingKeys: [],
  contentMismatches: []
});

const seedErrors = (validation: IBehaviourObjectiveSeedValidation): string[] => [
  ...validation.duplicateKeys.map(key => `Duplicate Behaviour objective key ${key}.`),
  ...validation.unknownKeys.map(key => `Unapproved Behaviour objective key ${key}.`),
  ...validation.missingKeys.map(key => `Missing approved Behaviour objective key ${key}.`),
  ...validation.contentMismatches
];

export default class Workplan018SharePointProvisioner {
  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly currentUserEmail: string
  ) {}

  public async preflight(): Promise<IWorkplan018ProvisioningEvidence> {
    return this.execute('Preflight');
  }

  public async provision(): Promise<IWorkplan018ProvisioningEvidence> {
    return this.execute('Provision');
  }

  private async execute(mode: ProvisioningMode): Promise<IWorkplan018ProvisioningEvidence> {
    const evidence = this.createEvidence(mode);
    try {
      this.assertGuard();
      evidence.actions.push('Exact REVIEW-TEST-SITE site and Synthetic Person 02 identity guard passed.');
      await this.inspectCurrentState(evidence);
      this.assertPreflightSafe(evidence);
      if (mode === 'Preflight') {
        evidence.status = 'Ready';
        evidence.completedAt = new Date().toISOString();
        evidence.actions.push('Read-only preflight completed; no SharePoint write was made.');
        return evidence;
      }
      await this.ensureLibrary(evidence);
      await this.createMissingFields(evidence);
      await this.verifyAllFields(evidence);
      await this.seedLibrary(evidence);
      await this.verifyFinalState(evidence);
      evidence.status = 'Pass';
      evidence.completedAt = new Date().toISOString();
      evidence.actions.push('KCF-KPI-018 additive schema and 30-record seed verified exactly.');
      return evidence;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unknown KCF-KPI-018 provisioning failure.';
      evidence.status = 'Failed';
      evidence.error = message;
      evidence.completedAt = new Date().toISOString();
      throw new Workplan018ProvisioningError(message, evidence);
    }
  }

  private createEvidence(mode: ProvisioningMode): IWorkplan018ProvisioningEvidence {
    return {
      mode,
      status: 'Running',
      siteUrl: this.webAbsoluteUrl,
      actorEmail: this.currentUserEmail,
      startedAt: new Date().toISOString(),
      lists: WORKPLAN_018_SCHEMA.map(definition => ({
        title: definition.title,
        existedBefore: false,
        createdList: false,
        settingsChanged: false,
        missingFieldsBefore: [],
        createdFields: [],
        verifiedFields: [],
        mismatches: []
      })),
      seed: emptySeedEvidence(),
      actions: []
    };
  }

  private assertGuard(): void {
    const actualSite = this.webAbsoluteUrl.replace(/\/+$/, '').toLowerCase();
    if (actualSite !== WORKPLAN_018_APPROVED_SITE.toLowerCase()) {
      throw new Error('KCF-KPI-018 provisioning is restricted to the exact REVIEW-TEST-SITE site.');
    }
    if (this.currentUserEmail.trim().toLowerCase() !== WORKPLAN_018_APPROVED_ACTOR) {
      throw new Error('KCF-KPI-018 provisioning is restricted to Synthetic Person 02’s authenticated KCF account.');
    }
  }

  private async inspectCurrentState(evidence: IWorkplan018ProvisioningEvidence): Promise<void> {
    for (const definition of WORKPLAN_018_SCHEMA) {
      const listEvidence = this.evidenceFor(evidence, definition.title);
      const list = await this.readList(definition.title);
      if (!list) {
        if (definition.createIfMissing) listEvidence.missingFieldsBefore = definition.fields.map(field => field.internalName);
        else listEvidence.mismatches.push('Required existing production list was not found.');
        continue;
      }
      listEvidence.existedBefore = true;
      listEvidence.listId = list.Id;
      listEvidence.listUrl = list.RootFolder?.ServerRelativeUrl;
      if (definition.createIfMissing && list.BaseTemplate !== 100) {
        listEvidence.mismatches.push(`BaseTemplate ${list.BaseTemplate}, expected 100.`);
      }
      const fieldRows = await this.readFields(definition.title);
      this.recordFieldInspection(definition, fieldRows, listEvidence);
      if (definition.title === 'KCFKPI_BehaviourObjectiveLibrary') {
        await this.inspectExistingSeed(fieldRows, evidence);
      }
    }
  }

  private recordFieldInspection(
    definition: IWorkplan018ListDefinition,
    rows: ISharePointFieldRow[],
    evidence: IWorkplan018ListEvidence
  ): void {
    const validation = validateWorkplan018SchemaReadback(definition, rows.map(mapFieldReadback));
    evidence.missingFieldsBefore = validation.missingFields;
    evidence.mismatches.push(...validation.mismatches);
    const byName = new Map(rows.map(row => [row.InternalName, row]));
    definition.fields.forEach(field => {
      const row = byName.get(field.internalName);
      if (!row) return;
      if (normaliseGuid(row.Id) !== normaliseGuid(field.id)) {
        evidence.mismatches.push(`${field.internalName}: field ID ${row.Id}, expected ${field.id}.`);
      }
      evidence.mismatches.push(...physicalFieldMismatches(field, row));
    });
  }

  private async inspectExistingSeed(rows: ISharePointFieldRow[], evidence: IWorkplan018ProvisioningEvidence): Promise<void> {
    const available = new Set(rows.map(row => row.InternalName.toLowerCase()));
    const canRead = BEHAVIOUR_OBJECTIVE_LIBRARY_SELECT.split(',').every(name => available.has(name.toLowerCase()));
    if (!canRead) {
      const identities = await this.readLibraryIdentities();
      evidence.seed.existingBefore = identities.length;
      if (identities.length) {
        this.evidenceFor(evidence, 'KCFKPI_BehaviourObjectiveLibrary').mismatches.push('Partially provisioned library already contains rows; seed identity/content cannot be reconciled safely.');
      }
      return;
    }
    const records = await this.readLibraryRecords();
    evidence.seed.existingBefore = records.length;
    this.applySeedValidation(evidence, validateBehaviourObjectiveSeedReadback(records, false));
  }

  private assertPreflightSafe(evidence: IWorkplan018ProvisioningEvidence): void {
    const errors = evidence.lists.reduce<string[]>((all, list) => [
      ...all,
      ...list.mismatches.map(message => `${list.title}: ${message}`)
    ], []);
    errors.push(...seedErrors(evidence.seed));
    if (errors.length) throw new Error(`KCF-KPI-018 preflight failed: ${errors.join(' ')}`);
  }

  private async ensureLibrary(evidence: IWorkplan018ProvisioningEvidence): Promise<void> {
    const definition = this.definitionFor('KCFKPI_BehaviourObjectiveLibrary');
    const listEvidence = this.evidenceFor(evidence, definition.title);
    let list = await this.readList(definition.title);
    if (!list) {
      await this.postJson(`${this.siteUrl()}/_api/web/lists`, {
        BaseTemplate: 100,
        Description: definition.description,
        EnableFolderCreation: false,
        EnableVersioning: true,
        OnQuickLaunch: false,
        Title: definition.title
      }, 'The KCF Behaviour Objective Library could not be created.');
      listEvidence.createdList = true;
      evidence.actions.push('Created KCFKPI_BehaviourObjectiveLibrary as BaseTemplate 100.');
      list = await this.readList(definition.title);
      if (!list) throw new Error('The KCF Behaviour Objective Library was not found after creation.');
      listEvidence.listId = list.Id;
      listEvidence.listUrl = list.RootFolder?.ServerRelativeUrl;
    }
    if (!list.EnableVersioning || list.EnableFolderCreation || list.OnQuickLaunch) {
      await this.mergeJson(this.listUrl(definition.title), {
        EnableVersioning: true,
        EnableFolderCreation: false,
        OnQuickLaunch: false
      }, 'The KCF Behaviour Objective Library settings could not be applied.');
      listEvidence.settingsChanged = true;
      evidence.actions.push('Applied versioning on, folders off and Quick Launch off.');
    }
  }

  private async createMissingFields(evidence: IWorkplan018ProvisioningEvidence): Promise<void> {
    for (const definition of WORKPLAN_018_SCHEMA) {
      const listEvidence = this.evidenceFor(evidence, definition.title);
      const missing = listEvidence.createdList
        ? definition.fields.map(field => field.internalName)
        : listEvidence.missingFieldsBefore;
      for (const internalName of missing) {
        const field = definition.fields.find(candidate => candidate.internalName === internalName);
        if (!field) throw new Error(`${definition.title}: missing field definition ${internalName}.`);
        await this.postJson(`${this.listUrl(definition.title)}/fields/createfieldasxml`, {
          parameters: {
            __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' },
            SchemaXml: workplan018FieldSchemaXml(field),
            Options: 0
          }
        }, `The approved field ${definition.title}.${field.internalName} could not be created.`, true);
        listEvidence.createdFields.push(field.internalName);
        evidence.actions.push(`Created ${definition.title}.${field.internalName}.`);
      }
    }
  }

  private async verifyAllFields(evidence: IWorkplan018ProvisioningEvidence): Promise<void> {
    for (const definition of WORKPLAN_018_SCHEMA) {
      const listEvidence = this.evidenceFor(evidence, definition.title);
      const list = await this.readList(definition.title);
      if (!list) throw new Error(`${definition.title} was not found during exact read-back.`);
      listEvidence.listId = list.Id;
      listEvidence.listUrl = list.RootFolder?.ServerRelativeUrl;
      const rows = await this.readFields(definition.title);
      const validation = validateWorkplan018SchemaReadback(definition, rows.map(mapFieldReadback));
      const byName = new Map(rows.map(row => [row.InternalName, row]));
      const exactMismatches = definition.fields.reduce<string[]>((all, field) => {
        const row = byName.get(field.internalName);
        if (!row) return all;
        const idMismatch = normaliseGuid(row.Id) === normaliseGuid(field.id)
          ? []
          : [`${field.internalName}: field ID does not match the approved schema.`];
        return [...all, ...idMismatch, ...physicalFieldMismatches(field, row)];
      }, []);
      listEvidence.mismatches = [...validation.mismatches, ...exactMismatches];
      if (validation.missingFields.length || listEvidence.mismatches.length) {
        throw new Error(`${definition.title} exact field read-back failed: ${[
          ...validation.missingFields.map(name => `missing ${name}`),
          ...listEvidence.mismatches
        ].join(' ')}`);
      }
      listEvidence.verifiedFields = definition.fields.map(field => field.internalName);
    }
  }

  private async seedLibrary(evidence: IWorkplan018ProvisioningEvidence): Promise<void> {
    const existing = await this.readLibraryRecords();
    const validation = validateBehaviourObjectiveSeedReadback(existing, false);
    this.applySeedValidation(evidence, validation);
    const errors = seedErrors(validation);
    if (errors.length) throw new Error(`Behaviour Objective Library pre-seed validation failed: ${errors.join(' ')}`);
    const existingKeys = new Set(existing.map(item => item.behaviourObjectiveKey));
    for (const seed of BEHAVIOUR_OBJECTIVE_LIBRARY_SEED) {
      if (existingKeys.has(seed.behaviourObjectiveKey)) continue;
      await this.postJson(`${this.listUrl('KCFKPI_BehaviourObjectiveLibrary')}/items`, this.seedPayload(seed), `The approved Behaviour objective ${seed.behaviourObjectiveKey} could not be created.`);
      evidence.seed.createdKeys.push(seed.behaviourObjectiveKey);
      evidence.actions.push(`Created seed ${seed.behaviourObjectiveKey}.`);
    }
  }

  private seedPayload(seed: IBehaviourObjectiveLibraryRecord): object {
    const payload: { [key: string]: string | number | boolean } = {
      Title: seed.objectiveTitle,
      BehaviourObjectiveKey: seed.behaviourObjectiveKey,
      BehaviourKey: seed.behaviourKey,
      ObjectiveTitle: seed.objectiveTitle,
      ObjectiveDescription: seed.objectiveDescription,
      SuggestedMeasure: seed.suggestedMeasure,
      SuggestedUnit: seed.suggestedUnit,
      SuggestedEvidence: seed.suggestedEvidence,
      Active: seed.active,
      SortOrder: seed.sortOrder,
      EffectiveFrom: seed.effectiveFrom || '2025-11-01'
    };
    if (seed.effectiveTo) payload.EffectiveTo = seed.effectiveTo;
    return payload;
  }

  private async verifyFinalState(evidence: IWorkplan018ProvisioningEvidence): Promise<void> {
    const list = await this.readList('KCFKPI_BehaviourObjectiveLibrary');
    if (!list) throw new Error('The Behaviour Objective Library was not found during final read-back.');
    if (list.BaseTemplate !== 100 || !list.EnableVersioning || list.EnableFolderCreation || list.OnQuickLaunch) {
      throw new Error('The Behaviour Objective Library settings did not match BaseTemplate 100, versioning on, folders off and Quick Launch off.');
    }
    const validation = validateBehaviourObjectiveSeedReadback(await this.readLibraryRecords(), true);
    this.applySeedValidation(evidence, validation);
    const errors = seedErrors(validation);
    Object.keys(validation.countsByBehaviour).forEach(key => {
      if (validation.countsByBehaviour[key] !== 6) errors.push(`${key} contains ${validation.countsByBehaviour[key]} records, expected 6.`);
    });
    if (validation.rowCount !== 30) errors.push(`Library contains ${validation.rowCount} records, expected exactly 30.`);
    if (validation.distinctKeyCount !== 30) errors.push(`Library contains ${validation.distinctKeyCount} distinct keys, expected exactly 30.`);
    if (errors.length) throw new Error(`Behaviour Objective Library final read-back failed: ${errors.join(' ')}`);
  }

  private applySeedValidation(evidence: IWorkplan018ProvisioningEvidence, validation: IBehaviourObjectiveSeedValidation): void {
    evidence.seed.rowCount = validation.rowCount;
    evidence.seed.distinctKeyCount = validation.distinctKeyCount;
    evidence.seed.countsByBehaviour = validation.countsByBehaviour;
    evidence.seed.duplicateKeys = validation.duplicateKeys;
    evidence.seed.unknownKeys = validation.unknownKeys;
    evidence.seed.missingKeys = validation.missingKeys;
    evidence.seed.contentMismatches = validation.contentMismatches;
  }

  private async readList(title: Workplan018ListTitle): Promise<ISharePointListRow | undefined> {
    const response = await this.spHttpClient.get(
      `${this.listUrl(title)}?$select=Id,BaseTemplate,EnableVersioning,EnableFolderCreation,OnQuickLaunch,RootFolder/ServerRelativeUrl&$expand=RootFolder`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    if (response.status === 404) return undefined;
    await this.ensureSuccess(response, `The list contract for ${title} could not be read.`);
    return await response.json() as ISharePointListRow;
  }

  private async readFields(title: Workplan018ListTitle): Promise<ISharePointFieldRow[]> {
    const response = await this.spHttpClient.get(
      `${this.listUrl(title)}/fields?$select=Id,InternalName,TypeAsString,Required,Indexed,EnforceUniqueValues,Choices,SchemaXml&$top=5000`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    await this.ensureSuccess(response, `The field contract for ${title} could not be read.`);
    const data = await response.json() as IODataCollection<ISharePointFieldRow>;
    return data.value;
  }

  private async readLibraryIdentities(): Promise<ISharePointItemIdentity[]> {
    assertProductionQueryFields('KCFKPI_BehaviourObjectiveLibrary', 'Id', '', '');
    const response = await this.spHttpClient.get(
      `${this.listUrl('KCFKPI_BehaviourObjectiveLibrary')}/items?$select=Id&$top=5000`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    await this.ensureSuccess(response, 'The Behaviour Objective Library item count could not be read.');
    const data = await response.json() as IODataCollection<ISharePointItemIdentity>;
    return data.value;
  }

  private async readLibraryRecords(): Promise<IBehaviourObjectiveLibraryRecord[]> {
    const orderBy = 'BehaviourKey,SortOrder';
    assertProductionQueryFields('KCFKPI_BehaviourObjectiveLibrary', BEHAVIOUR_OBJECTIVE_LIBRARY_SELECT, '', orderBy);
    const response = await this.spHttpClient.get(
      `${this.listUrl('KCFKPI_BehaviourObjectiveLibrary')}/items?$select=${BEHAVIOUR_OBJECTIVE_LIBRARY_SELECT}&$orderby=${orderBy}&$top=5000`,
      SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' } }
    );
    await this.ensureSuccess(response, 'The Behaviour Objective Library seed could not be read.');
    const data = await response.json() as IODataCollection<IBehaviourObjectiveLibraryRow>;
    return data.value.map(mapLibraryRow);
  }

  private async postJson(url: string, body: object, fallback: string, verbose: boolean = false): Promise<void> {
    const mediaType = verbose ? 'application/json;odata=verbose' : 'application/json;odata=nometadata';
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: { Accept: mediaType, 'Content-Type': mediaType },
      body: JSON.stringify(body)
    });
    await this.ensureSuccess(response, fallback);
  }

  private async mergeJson(url: string, body: object, fallback: string): Promise<void> {
    const response = await this.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'MERGE'
      },
      body: JSON.stringify(body)
    });
    await this.ensureSuccess(response, fallback);
  }

  private async ensureSuccess(response: SPHttpClientResponse, fallback: string): Promise<void> {
    if (response.ok) return;
    let detail = '';
    try {
      detail = (await response.text()).replace(/\s+/g, ' ').trim().slice(0, 500);
    } catch {
      detail = '';
    }
    throw new Error(`${fallback} HTTP ${response.status}${detail ? `: ${detail}` : '.'}`);
  }

  private siteUrl(): string {
    return this.webAbsoluteUrl.replace(/\/+$/, '');
  }

  private listUrl(title: Workplan018ListTitle): string {
    return `${this.siteUrl()}/_api/web/lists/getbytitle('${escapeOData(title)}')`;
  }

  private definitionFor(title: Workplan018ListTitle): IWorkplan018ListDefinition {
    const definition = WORKPLAN_018_SCHEMA.find(item => item.title === title);
    if (!definition) throw new Error(`Missing KCF-KPI-018 schema definition for ${title}.`);
    return definition;
  }

  private evidenceFor(evidence: IWorkplan018ProvisioningEvidence, title: Workplan018ListTitle): IWorkplan018ListEvidence {
    const result = evidence.lists.find(item => item.title === title);
    if (!result) throw new Error(`Missing KCF-KPI-018 evidence container for ${title}.`);
    return result;
  }
}
