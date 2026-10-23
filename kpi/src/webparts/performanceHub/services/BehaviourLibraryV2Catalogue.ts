import {
  BEHAVIOUR_FRAMEWORK_V2_VERSION,
  BEHAVIOUR_V2_ROLE_TIERS,
  BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourLibraryV2SourceRoleLevel,
  type BehaviourV2RoleTier,
  type IBehaviourLibraryV2Record,
  type IBehaviourLibraryV2SourceCatalogue,
  type IBehaviourLibraryV2SourceRow
} from '../models/BehaviourFrameworkV2Models';
import type { BehaviourKey } from '../models/BehaviourWorkplanModels';
import { assertNoBehaviourV2ScoringFields } from './BehaviourFrameworkV2Policy';
import {
  assertBehaviourLibraryV2SourceRoleTier,
  isBehaviourLibraryV2SourceRoleLevel,
  mapBehaviourLibraryV2SourceRoleTier
} from './BehaviourLibraryV2RoleTier';

export const BEHAVIOUR_LIBRARY_V2_SOURCE_FIELDS = Object.freeze([
  'BehaviourObjectiveKey', 'BehaviourKey', 'BehaviourTitle', 'CorporateValue',
  'RoleLevelCode', 'RoleLevelName', 'DropdownLabel', 'ObjectiveTitle',
  'ObjectiveDescription', 'SuggestedMeasure', 'SuggestedUnit', 'SuggestedEvidence',
  'Active', 'SortOrder', 'EffectiveFrom', 'EffectiveTo'
] as const);

const catalogueFields = Object.freeze([
  'frameworkVersion', 'published', 'productionSafe', 'synthetic', 'records'
] as const);
const recordRequiredFields = Object.freeze([
  'behaviourObjectiveKey', 'behaviourKey', 'frameworkVersion', 'roleTier', 'sourceRoleLevelCode',
  'published', 'productionSafe', 'synthetic', 'objectiveTitle', 'objectiveDescription',
  'suggestedMeasure', 'suggestedUnit', 'suggestedEvidence', 'active', 'sortOrder', 'effectiveFrom'
] as const);
const recordOptionalFields = Object.freeze(['id', 'etag', 'effectiveTo'] as const);
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (value: object, expected: readonly string[]): boolean => {
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  return actual.length === required.length && actual.every((key, index) => key === required[index]);
};
const isoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const isExactBehaviourLibraryV2SuggestionKey = (
  behaviourKey: string,
  key: string,
  sourceRoleLevelCode?: BehaviourLibraryV2SourceRoleLevel
): boolean => /^BHV-0[1-5]$/.test(behaviourKey)
  && /^BHV-0[1-5]-L[1-3]-0[1-9][0-9]*$/.test(key)
  && key.slice(0, 6) === behaviourKey
  && (sourceRoleLevelCode === undefined || key.split('-')[2] === sourceRoleLevelCode);

export const inspectBehaviourLibraryV2SourceRow = (value: unknown): readonly string[] => {
  const errors: string[] = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['A Behaviour library source row must be an object.'];
  }
  const row = value as IBehaviourLibraryV2SourceRow;
  if (!exactKeys(row, BEHAVIOUR_LIBRARY_V2_SOURCE_FIELDS)) {
    errors.push('A Behaviour library source row must contain exactly the sixteen authorised fields.');
    return errors;
  }
  try { assertNoBehaviourV2ScoringFields(row); } catch (error) {
    errors.push(error instanceof Error ? error.message : 'The source row contains a protected v02 field.');
  }
  if (BEHAVIOUR_V2_VALUE_IDS.indexOf(row.BehaviourKey) < 0) {
    errors.push('The source row must use an exact fixed Behaviour key.');
  }
  if (!isBehaviourLibraryV2SourceRoleLevel(row.RoleLevelCode)
    || !isExactBehaviourLibraryV2SuggestionKey(row.BehaviourKey, row.BehaviourObjectiveKey, row.RoleLevelCode)) {
    errors.push('The source row key must exactly match its fixed Behaviour and L1, L2 or L3 role.');
  }
  [row.BehaviourTitle, row.CorporateValue, row.RoleLevelName, row.ObjectiveTitle,
    row.ObjectiveDescription, row.SuggestedMeasure, row.SuggestedUnit, row.SuggestedEvidence]
    .forEach(field => { if (!nonBlank(field)) errors.push('All source wording fields must contain visible text.'); });
  if (row.DropdownLabel !== `[${row.RoleLevelName}] ${row.ObjectiveTitle}`) {
    errors.push('The source dropdown label must be the exact role label and objective title projection.');
  }
  if (typeof row.Active !== 'boolean') errors.push('The source Active value must be boolean.');
  if (!Number.isInteger(row.SortOrder) || row.SortOrder < 1) {
    errors.push('The source SortOrder must be a positive whole number.');
  }
  if (!isoDate(row.EffectiveFrom)) errors.push('The source EffectiveFrom value must be an exact valid ISO date.');
  if (row.EffectiveTo !== null && !isoDate(row.EffectiveTo)) {
    errors.push('The source EffectiveTo value must be null or an exact valid ISO date.');
  }
  if (isoDate(row.EffectiveFrom) && row.EffectiveTo !== null && isoDate(row.EffectiveTo)
    && row.EffectiveTo < row.EffectiveFrom) {
    errors.push('The source EffectiveTo value cannot precede EffectiveFrom.');
  }
  return Array.from(new Set(errors));
};

const inspectCatalogueEnvelope = (value: unknown): readonly string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['The Behaviour library catalogue must be an object.'];
  }
  const catalogue = value as IBehaviourLibraryV2SourceCatalogue;
  const errors: string[] = [];
  if (!exactKeys(catalogue, catalogueFields)) errors.push('The Behaviour library catalogue envelope has an unexpected shape.');
  if (catalogue.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION) errors.push('The Behaviour library framework version is not trusted.');
  if (typeof catalogue.published !== 'boolean') errors.push('The Behaviour library publication state must be explicit.');
  if (typeof catalogue.productionSafe !== 'boolean') errors.push('The Behaviour library production-safety state must be explicit.');
  if (typeof catalogue.synthetic !== 'boolean') errors.push('The Behaviour library synthetic state must be explicit.');
  if (!Array.isArray(catalogue.records)) errors.push('The Behaviour library records must be an array.');
  return errors;
};

export const mapBehaviourLibraryV2SourceRow = (
  rowValue: unknown,
  catalogue: Pick<IBehaviourLibraryV2SourceCatalogue,
  'frameworkVersion' | 'published' | 'productionSafe' | 'synthetic'>
): IBehaviourLibraryV2Record => {
  const errors = inspectBehaviourLibraryV2SourceRow(rowValue);
  if (catalogue.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION
    || typeof catalogue.published !== 'boolean' || typeof catalogue.productionSafe !== 'boolean'
    || typeof catalogue.synthetic !== 'boolean' || errors.length) {
    throw new Error(`BEHAVIOUR_LIBRARY_V2_ROW_INVALID: ${[
      ...(catalogue.frameworkVersion === BEHAVIOUR_FRAMEWORK_V2_VERSION ? [] : ['The framework version is not trusted.']),
      ...(typeof catalogue.published === 'boolean' && typeof catalogue.productionSafe === 'boolean'
        && typeof catalogue.synthetic === 'boolean' ? [] : ['Catalogue states must be explicit booleans.']),
      ...errors
    ].join(' ')}`);
  }
  const row = rowValue as IBehaviourLibraryV2SourceRow;
  return {
    behaviourObjectiveKey: row.BehaviourObjectiveKey,
    behaviourKey: row.BehaviourKey,
    frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    roleTier: assertBehaviourLibraryV2SourceRoleTier(row.RoleLevelCode),
    sourceRoleLevelCode: row.RoleLevelCode,
    published: catalogue.published,
    productionSafe: catalogue.productionSafe,
    synthetic: catalogue.synthetic,
    objectiveTitle: row.ObjectiveTitle,
    objectiveDescription: row.ObjectiveDescription,
    suggestedMeasure: row.SuggestedMeasure,
    suggestedUnit: row.SuggestedUnit,
    suggestedEvidence: row.SuggestedEvidence,
    active: row.Active,
    sortOrder: row.SortOrder,
    effectiveFrom: row.EffectiveFrom,
    effectiveTo: row.EffectiveTo || undefined
  };
};

export const inspectBehaviourLibraryV2Record = (value: unknown): readonly string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['A mapped Behaviour library record must be an object.'];
  }
  const record = value as IBehaviourLibraryV2Record;
  const errors: string[] = [];
  const actualFields = Object.keys(record);
  const allowedFields = [...recordRequiredFields, ...recordOptionalFields] as readonly string[];
  if (recordRequiredFields.some(field => !Object.prototype.hasOwnProperty.call(record, field))
    || actualFields.some(field => allowedFields.indexOf(field) < 0)) {
    errors.push('The mapped suggestion record has a missing or unauthorised field.');
  }
  if (record.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION) errors.push('The mapped framework version is not trusted.');
  const mappedTier = mapBehaviourLibraryV2SourceRoleTier(record.sourceRoleLevelCode);
  if (!mappedTier || record.roleTier !== mappedTier
    || BEHAVIOUR_V2_ROLE_TIERS.indexOf(record.roleTier as BehaviourV2RoleTier) < 0) {
    errors.push('The mapped role tier does not match its exact one-way source mapping.');
  }
  if (!isExactBehaviourLibraryV2SuggestionKey(record.behaviourKey, record.behaviourObjectiveKey,
    record.sourceRoleLevelCode)) errors.push('The mapped stable key is invalid.');
  [record.objectiveTitle, record.objectiveDescription, record.suggestedMeasure,
    record.suggestedUnit, record.suggestedEvidence]
    .forEach(field => { if (!nonBlank(field)) errors.push('Mapped suggestion wording must contain visible text.'); });
  if (typeof record.active !== 'boolean' || typeof record.published !== 'boolean'
    || typeof record.productionSafe !== 'boolean' || typeof record.synthetic !== 'boolean') {
    errors.push('Mapped activation, publication, production-safety and synthetic states must be explicit.');
  }
  if (!Number.isInteger(record.sortOrder) || record.sortOrder < 1) {
    errors.push('The mapped sort order must be a positive whole number.');
  }
  if (record.id !== undefined && (!Number.isInteger(record.id) || record.id < 1)) {
    errors.push('The mapped local identity must be a positive whole number when present.');
  }
  if (record.etag !== undefined && !nonBlank(record.etag)) {
    errors.push('The mapped local ETag must contain visible text when present.');
  }
  if (!isoDate(record.effectiveFrom) || (record.effectiveTo !== undefined && !isoDate(record.effectiveTo))
    || (record.effectiveTo !== undefined && record.effectiveTo < record.effectiveFrom!)) {
    errors.push('The mapped effective-date range is invalid.');
  }
  try { assertNoBehaviourV2ScoringFields(record); } catch (error) {
    errors.push(error instanceof Error ? error.message : 'The mapped record contains a protected v02 field.');
  }
  return Array.from(new Set(errors));
};

export const assertBehaviourLibraryV2Record = (
  value: IBehaviourLibraryV2Record
): IBehaviourLibraryV2Record => {
  const errors = inspectBehaviourLibraryV2Record(value);
  if (errors.length) throw new Error(`BEHAVIOUR_LIBRARY_V2_RECORD_INVALID: ${errors.join(' ')}`);
  return clone(value);
};

export const mapBehaviourLibraryV2Catalogue = (
  value: unknown
): IBehaviourLibraryV2Record[] => {
  const envelopeErrors = inspectCatalogueEnvelope(value);
  if (envelopeErrors.length) throw new Error(`BEHAVIOUR_LIBRARY_V2_CATALOGUE_INVALID: ${envelopeErrors.join(' ')}`);
  const catalogue = value as IBehaviourLibraryV2SourceCatalogue;
  if (catalogue.records.length === 0) {
    throw new Error('BEHAVIOUR_LIBRARY_V2_CATALOGUE_INVALID: a published version needs source records.');
  }
  const records = catalogue.records.map(row => mapBehaviourLibraryV2SourceRow(row, catalogue));
  if (new Set(records.map(record => record.behaviourObjectiveKey)).size !== records.length) {
    throw new Error('BEHAVIOUR_LIBRARY_V2_CATALOGUE_INVALID: stable source keys must be unique.');
  }
  BEHAVIOUR_V2_VALUE_IDS.forEach(behaviourKey => {
    BEHAVIOUR_V2_ROLE_TIERS.forEach(roleTier => {
      const pair = records.filter(record => record.behaviourKey === behaviourKey && record.roleTier === roleTier);
      if (new Set(pair.map(record => record.sortOrder)).size !== pair.length) {
        throw new Error('BEHAVIOUR_LIBRARY_V2_CATALOGUE_INVALID: sort order must be unique within a Value and role tier.');
      }
    });
  });
  return records;
};

export const behaviourLibraryV2RecordIsEffective = (
  record: IBehaviourLibraryV2Record,
  asOf: Date
): boolean => {
  if (Number.isNaN(asOf.getTime())) return false;
  const date = asOf.toISOString().slice(0, 10);
  return isoDate(record.effectiveFrom) && record.effectiveFrom <= date
    && (record.effectiveTo === undefined || (isoDate(record.effectiveTo) && record.effectiveTo >= date));
};

export const behaviourLibraryV2RecordMatchesAssignment = (
  record: IBehaviourLibraryV2Record,
  behaviourKey: BehaviourKey,
  frameworkVersion: unknown,
  roleTier: unknown,
  asOf: Date
): boolean => inspectBehaviourLibraryV2Record(record).length === 0
  && frameworkVersion === BEHAVIOUR_FRAMEWORK_V2_VERSION
  && BEHAVIOUR_V2_ROLE_TIERS.indexOf(roleTier as BehaviourV2RoleTier) >= 0
  && record.frameworkVersion === frameworkVersion
  && record.roleTier === roleTier
  && record.behaviourKey === behaviourKey
  && record.published === true
  && record.productionSafe === true
  && record.synthetic === false
  && record.active === true
  && behaviourLibraryV2RecordIsEffective(record, asOf);
