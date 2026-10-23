import type {
  IImpactClassification,
  IImpactClassificationSelection,
  IPersonalWorkplanItem
} from '../models/ProductionModels';
import type { IScoringResult, QuarterKey } from '../models/QuarterlyModels';
import { calculatePerformance } from './PerformanceScoring';
import {
  UnsafeBoundaryInputError,
  assertCanonicalKeys,
  canonicalisePlainArray,
  canonicalisePlainRecord
} from './SecurityBoundaryCanonicalisation';

export interface IPersonalKpiValidation {
  valid: boolean;
  errors: string[];
}

export interface IImpactClassificationConfiguration {
  authority?: Readonly<IImpactTaxonomyAuthority>;
  strategicPillars: ReadonlyArray<Readonly<IImpactClassificationSelection>>;
  businessContributionAreas: ReadonlyArray<Readonly<IImpactClassificationSelection>>;
}

export interface IImpactTaxonomyAuthority {
  taxonomyId: string;
  version: string;
  etag: string;
  approvalReference: 'DEMO-APP-PETE-PD-02';
  contentSha256: string;
  effectiveFrom: string;
  publishedAt: string;
  publishedBy: string;
  changeReference: string;
}

export interface IGovernedImpactTaxonomyOption {
  key: string;
  label: string;
  source: string;
  sourceReference?: string;
  active: boolean;
  approved: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
}

/** Admin-owned PD-02 data contract. Labels are data and never calculation branches. */
export interface IGovernedImpactTaxonomyContract {
  schema: 'DEMO.ImpactTaxonomy';
  immutable: true;
  published: true;
  authority: IImpactTaxonomyAuthority;
  strategicPillars: ReadonlyArray<Readonly<IGovernedImpactTaxonomyOption>>;
  businessContributionAreas: ReadonlyArray<Readonly<IGovernedImpactTaxonomyOption>>;
}

export interface IImpactSectionValidation extends IPersonalKpiValidation {
  activeCount: number;
  weightTotal: number;
}

export const MAX_ACTIVE_IMPACT_KPIS = 5;

const impactItemKeys = Object.freeze([
  'id', 'etag', 'workplanItemKey', 'naturalKey', 'workplanKey', 'personKey', 'performanceYear',
  'wording', 'description', 'measure', 'measureType', 'scoringDirection', 'percentageSourceScale',
  'baselineValue', 'yearEndTargetValue', 'yearEndTargetText', 'q1TargetValue', 'q1TargetText',
  'q2TargetValue', 'q2TargetText', 'q3TargetValue', 'q3TargetText', 'q4TargetValue', 'q4TargetText',
  'unitLabel', 'personalItemWeight', 'displayOrder', 'activeInWorkplan', 'impactClassification'
] as const);
const impactClassificationKeys = Object.freeze(['strategicPillar', 'businessContributionArea'] as const);
const impactSelectionKeys = Object.freeze([
  'key', 'label', 'source', 'sourceReference', 'taxonomyId', 'taxonomyVersion', 'taxonomyEtag',
  'taxonomyApprovalReference'
] as const);
const impactConfigurationKeys = Object.freeze(['authority', 'strategicPillars', 'businessContributionAreas'] as const);
const impactTaxonomyContractKeys = Object.freeze([
  'schema', 'immutable', 'published', 'authority', 'strategicPillars', 'businessContributionAreas'
] as const);
const impactTaxonomyAuthorityKeys = Object.freeze([
  'taxonomyId', 'version', 'etag', 'approvalReference', 'contentSha256', 'effectiveFrom',
  'publishedAt', 'publishedBy', 'changeReference'
] as const);
const impactTaxonomyOptionKeys = Object.freeze([
  'key', 'label', 'source', 'sourceReference', 'active', 'approved', 'effectiveFrom', 'effectiveTo'
] as const);

const assertImpactClassificationShape = (
  classification: Readonly<IImpactClassification> | undefined,
  label: string
): void => {
  if (!classification) return;
  assertCanonicalKeys(classification, impactClassificationKeys, label);
  if (classification.strategicPillar) {
    assertCanonicalKeys(classification.strategicPillar, impactSelectionKeys, `${label}.strategicPillar`);
  }
  if (classification.businessContributionArea) {
    assertCanonicalKeys(classification.businessContributionArea, impactSelectionKeys,
      `${label}.businessContributionArea`);
  }
};

const canonicalImpactClassification = (
  classification: Readonly<IImpactClassification> | undefined,
  label: string
): Readonly<IImpactClassification> | undefined => {
  if (classification === undefined) return undefined;
  const snapshot = canonicalisePlainRecord(classification, label, impactClassificationKeys);
  assertImpactClassificationShape(snapshot, label);
  return snapshot;
};

const canonicalImpactConfiguration = (
  configuration: IImpactClassificationConfiguration | undefined
): Readonly<IImpactClassificationConfiguration> | undefined => {
  if (configuration === undefined) return undefined;
  const snapshot = canonicalisePlainRecord(configuration, 'Impact classification configuration', impactConfigurationKeys);
  if (snapshot.authority) assertCanonicalKeys(
    snapshot.authority, impactTaxonomyAuthorityKeys, 'Impact classification configuration.authority'
  );
  snapshot.strategicPillars.forEach((option, index) => assertCanonicalKeys(
    option, impactSelectionKeys, `Impact classification configuration.strategicPillars[${index}]`
  ));
  snapshot.businessContributionAreas.forEach((option, index) => assertCanonicalKeys(
    option, impactSelectionKeys, `Impact classification configuration.businessContributionAreas[${index}]`
  ));
  return snapshot;
};

const canonicalImpactItems = (
  items: ReadonlyArray<IPersonalWorkplanItem>
): ReadonlyArray<Readonly<IPersonalWorkplanItem>> => {
  const snapshots = canonicalisePlainArray(items, 'Impact items');
  snapshots.forEach((item, index) => {
    assertCanonicalKeys(item, impactItemKeys, `Impact items[${index}]`);
    assertImpactClassificationShape(item.impactClassification, `Impact items[${index}].impactClassification`);
  });
  return snapshots;
};

export interface IPersistedPersonalDraftIdentity {
  id: number;
  etag: string;
  workplanItemKey: string;
  naturalKey: string;
  workplanKey: string;
  personKey: string;
}

export interface IPersonalDraftUpsertTarget {
  workplanItemKey: string;
  naturalKey: string;
  persistedId?: number;
  updateEtag?: string;
}

const FIRST_LOCAL_PERSONAL_DRAFT_ID = -1800;

/**
 * Allocates a local-only numeric ID below every existing negative Draft ID.
 * SharePoint IDs remain positive and are deliberately ignored.
 */
export const nextPersonalDraftId = (
  items: ReadonlyArray<Pick<IPersonalWorkplanItem, 'id'>>
): number => {
  const lowestExisting = items.reduce((lowest, item) => (
    Number.isInteger(item.id) && item.id < 0 ? Math.min(lowest, item.id) : lowest
  ), FIRST_LOCAL_PERSONAL_DRAFT_ID + 1);
  return lowestExisting - 1;
};

/** Applies one local editor change to exactly one stable Personal assignment key. */
export const patchPersonalDraftItem = (
  items: ReadonlyArray<IPersonalWorkplanItem>,
  workplanItemKey: string,
  patch: Partial<IPersonalWorkplanItem>
): IPersonalWorkplanItem[] => {
  const matching = items.filter(item => item.workplanItemKey === workplanItemKey);
  if (!workplanItemKey.trim() || matching.length !== 1) {
    throw new Error('The Personal KPI Draft identity is missing or not unique. Reload the Workplan before editing.');
  }
  return items.map(item => item.workplanItemKey === workplanItemKey ? { ...item, ...patch } : item);
};

/** One Personal assignment identity is stable for the lifetime of its client Draft. */
export const personalNaturalKey = (workplanKey: string, workplanItemKey: string): string =>
  `${workplanKey}|LocalPersonal|${workplanItemKey}`;

/**
 * Resolves the safe Personal upsert boundary. A local negative-ID Draft may recover
 * a POST that succeeded before its read-back was received, but a persisted positive
 * row may never silently switch to a different SharePoint row.
 */
export const resolvePersonalDraftUpsertTarget = (
  item: Pick<IPersonalWorkplanItem, 'id' | 'etag' | 'workplanItemKey' | 'naturalKey' | 'workplanKey' | 'personKey'>,
  currentWorkplanKey: string,
  currentPersonKey: string,
  persisted?: IPersistedPersonalDraftIdentity
): IPersonalDraftUpsertTarget => {
  const workplanItemKey = item.workplanItemKey.trim();
  if (!workplanItemKey) throw new Error('The Personal KPI Draft has no stable item key. Reload and add it again.');
  const naturalKey = personalNaturalKey(currentWorkplanKey, workplanItemKey);
  if (item.naturalKey !== naturalKey || item.workplanKey !== currentWorkplanKey || item.personKey !== currentPersonKey) {
    throw new Error('This Personal KPI does not belong to the current employee Workplan.');
  }
  if (!persisted) return { workplanItemKey, naturalKey };
  if (persisted.workplanItemKey !== workplanItemKey || persisted.naturalKey !== naturalKey
    || persisted.workplanKey !== currentWorkplanKey || persisted.personKey !== currentPersonKey) {
    throw new Error('The Personal KPI persisted identity does not match the current employee Workplan.');
  }
  if (persisted.id === item.id) {
    return { workplanItemKey, naturalKey, persistedId: persisted.id, updateEtag: item.etag };
  }
  if (item.id < 0 && item.etag === 'LOCAL-DRAFT') {
    return { workplanItemKey, naturalKey, persistedId: persisted.id, updateEtag: persisted.etag };
  }
  throw new Error('The Personal KPI key conflicts with another row.');
};

const text = (value: string | undefined): boolean => Boolean(value?.trim());
const finite = (value: number | undefined): value is number => typeof value === 'number' && Number.isFinite(value);

const targetPresent = (value: number | undefined, targetText: string | undefined): boolean => finite(value) || text(targetText);

const exactGovernedSelection = (
  selected: Readonly<IImpactClassificationSelection> | undefined,
  governed: ReadonlyArray<Readonly<IImpactClassificationSelection>>
): boolean => Boolean(selected && governed.some(option => option.key === selected.key
  && option.label === selected.label && option.source === selected.source
  && option.sourceReference === selected.sourceReference
  && option.taxonomyId === selected.taxonomyId
  && option.taxonomyVersion === selected.taxonomyVersion
  && option.taxonomyEtag === selected.taxonomyEtag
  && option.taxonomyApprovalReference === selected.taxonomyApprovalReference));

const validCanonicalDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
const validCanonicalUtc = (value: string): boolean => !Number.isNaN(Date.parse(value))
  && new Date(value).toISOString() === value;

export const cloneImpactClassification = (
  classification: Readonly<IImpactClassification> | undefined
): IImpactClassification | undefined => canonicalImpactClassification(
  classification, 'Impact classification'
) as IImpactClassification | undefined;

const validateImpactConfigurationSnapshot = (
  configuration: Readonly<IImpactClassificationConfiguration>
): string[] => {
  const errors: string[] = [];
  const allOptions = [...configuration.strategicPillars, ...configuration.businessContributionAreas];
  const validOption = (option: Readonly<IImpactClassificationSelection>): boolean => Boolean(
    typeof option.key === 'string' && option.key.trim()
    && typeof option.label === 'string' && option.label.trim()
    && typeof option.source === 'string' && option.source.trim()
    && (option.sourceReference === undefined || typeof option.sourceReference === 'string')
  );
  const unique = (options: ReadonlyArray<Readonly<IImpactClassificationSelection>>): boolean =>
    new Set(options.map(option => option.key)).size === options.length;
  if (!allOptions.every(validOption) || !unique(configuration.strategicPillars)
    || !unique(configuration.businessContributionAreas)) {
    errors.push('Governed Impact classification configuration is invalid.');
  }
  if (configuration.authority) {
    const authority = configuration.authority;
    const provenanceMatches = allOptions.every(option => option.taxonomyId === authority.taxonomyId
      && option.taxonomyVersion === authority.version && option.taxonomyEtag === authority.etag
      && option.taxonomyApprovalReference === authority.approvalReference);
    if (!authority.taxonomyId.trim() || !authority.version.trim() || !authority.etag.trim()
      || authority.approvalReference !== 'DEMO-APP-PETE-PD-02'
      || !/^[a-f\d]{64}$/i.test(authority.contentSha256) || !authority.publishedBy.trim()
      || !authority.changeReference.trim() || !validCanonicalDate(authority.effectiveFrom)
      || !validCanonicalUtc(authority.publishedAt) || !provenanceMatches
      || configuration.businessContributionAreas.length !== 13) {
      errors.push('Governed Impact taxonomy identity or exact 13-value configuration is mismatched.');
    }
  }
  return errors;
};

/**
 * Resolves the exact current PD-02 taxonomy into the existing Impact consumer
 * shape while copying taxonomy identity onto each selection for historic readback.
 */
export const resolveGovernedImpactTaxonomy = (
  contract: Readonly<IGovernedImpactTaxonomyContract>,
  expectedAuthority: Readonly<IImpactTaxonomyAuthority>,
  asOf: Date
): Readonly<IImpactClassificationConfiguration> => {
  const source = canonicalisePlainRecord(contract, 'Governed Impact taxonomy', impactTaxonomyContractKeys);
  const authority = canonicalisePlainRecord(
    source.authority, 'Governed Impact taxonomy authority', impactTaxonomyAuthorityKeys
  );
  const expected = canonicalisePlainRecord(
    expectedAuthority, 'Expected Impact taxonomy authority', impactTaxonomyAuthorityKeys
  );
  if (source.schema !== 'DEMO.ImpactTaxonomy' || source.immutable !== true || source.published !== true) {
    throw new Error('Governed Impact taxonomy must be immutable and published.');
  }
  if (JSON.stringify(authority) !== JSON.stringify(expected)) {
    throw new Error('Governed Impact taxonomy authority, version, ETag or provenance changed after it was loaded.');
  }
  if (!authority.taxonomyId.trim() || !authority.version.trim() || !authority.etag.trim()
    || authority.approvalReference !== 'DEMO-APP-PETE-PD-02'
    || !/^[a-f\d]{64}$/i.test(authority.contentSha256) || !authority.publishedBy.trim()
    || !authority.changeReference.trim() || !validCanonicalDate(authority.effectiveFrom)
    || !validCanonicalUtc(authority.publishedAt)) {
    throw new Error('Governed Impact taxonomy provenance is invalid.');
  }
  if (!Number.isFinite(asOf.getTime()) || asOf < new Date(`${authority.effectiveFrom}T00:00:00.000Z`)) {
    throw new Error('Governed Impact taxonomy is not effective.');
  }
  const checkOptions = (
    values: ReadonlyArray<Readonly<IGovernedImpactTaxonomyOption>>,
    label: string
  ): ReadonlyArray<Readonly<IGovernedImpactTaxonomyOption>> => {
    const options = canonicalisePlainArray(values, label);
    options.forEach((option, index) => assertCanonicalKeys(option, impactTaxonomyOptionKeys, `${label}[${index}]`));
    const keys = options.map(option => option.key.trim());
    const labels = options.map(option => option.label.trim().toLowerCase());
    if (options.some(option => !option.key.trim() || !option.label.trim() || !option.source.trim()
      || (option.sourceReference !== undefined && !option.sourceReference.trim())
      || !validCanonicalDate(option.effectiveFrom)
      || (option.effectiveTo !== undefined && !validCanonicalDate(option.effectiveTo)))) {
      throw new Error(`${label} contains an invalid governed value.`);
    }
    if (new Set(keys).size !== keys.length || new Set(labels).size !== labels.length) {
      throw new Error(`${label} contains a duplicate key or label.`);
    }
    options.forEach(option => {
      const effective = new Date(`${option.effectiveFrom}T00:00:00.000Z`);
      const retired = option.effectiveTo ? asOf >= new Date(`${option.effectiveTo}T00:00:00.000Z`) : false;
      if (!option.active || !option.approved || asOf < effective || retired) {
        throw new Error(`${label} contains a retired, unapproved or not-yet-effective value.`);
      }
    });
    return options;
  };
  const strategicPillars = checkOptions(source.strategicPillars, 'Governed Strategic Pillars');
  const businessContributionAreas = checkOptions(
    source.businessContributionAreas, 'Governed Business Contribution Areas'
  );
  if (businessContributionAreas.length !== 13) {
    throw new Error('Governed Impact taxonomy requires exactly 13 Business Contribution Areas.');
  }
  const selection = (option: Readonly<IGovernedImpactTaxonomyOption>): Readonly<IImpactClassificationSelection> =>
    Object.freeze({
      key: option.key.trim(),
      label: option.label.trim(),
      source: option.source.trim(),
      ...(option.sourceReference === undefined ? {} : { sourceReference: option.sourceReference.trim() }),
      taxonomyId: authority.taxonomyId,
      taxonomyVersion: authority.version,
      taxonomyEtag: authority.etag,
      taxonomyApprovalReference: authority.approvalReference
    });
  return Object.freeze({
    authority: Object.freeze({ ...authority }),
    strategicPillars: Object.freeze(strategicPillars.map(selection)),
    businessContributionAreas: Object.freeze(businessContributionAreas.map(selection))
  });
};

export const selectGovernedImpactClassification = (
  current: Readonly<IImpactClassification> | undefined,
  field: 'strategicPillar' | 'businessContributionArea',
  key: string,
  configuration: IImpactClassificationConfiguration
): IImpactClassification => {
  const currentSnapshot = canonicalImpactClassification(current, 'Current Impact classification');
  const configurationSnapshot = canonicalImpactConfiguration(configuration);
  if (!configurationSnapshot) throw new Error('Governed Impact classification configuration is required.');
  const configurationErrors = validateImpactConfigurationSnapshot(configurationSnapshot);
  if (configurationErrors.length > 0) throw new Error(configurationErrors.join(' '));
  const options = field === 'strategicPillar'
    ? configurationSnapshot.strategicPillars : configurationSnapshot.businessContributionAreas;
  if (!key && field === 'strategicPillar') {
    return Object.freeze({ ...currentSnapshot, strategicPillar: undefined });
  }
  const matches = options.filter(option => option.key === key);
  if (!key.trim() || matches.length !== 1) {
    throw new Error(`Choose one governed ${field === 'strategicPillar' ? 'Strategic Pillar' : 'Business Contribution Area'} value.`);
  }
  return Object.freeze({ ...currentSnapshot, [field]: matches[0] });
};

const validateImpactClassificationSnapshot = (
  item: Readonly<IPersonalWorkplanItem>,
  configuration?: Readonly<IImpactClassificationConfiguration>
): string[] => {
  if (!configuration) return [];
  const errors: string[] = [];
  errors.push(...validateImpactConfigurationSnapshot(configuration));
  if (errors.length > 0) return errors;
  const classification = item.impactClassification;
  if (!exactGovernedSelection(classification?.businessContributionArea, configuration.businessContributionAreas)) {
    errors.push('Choose one governed Business Contribution Area.');
  }
  if (classification?.strategicPillar
    && !exactGovernedSelection(classification.strategicPillar, configuration.strategicPillars)) {
    errors.push('Strategic Pillar must use a governed configured value or remain blank.');
  }
  return errors;
};

export const validateImpactClassification = (
  item: IPersonalWorkplanItem,
  configuration?: IImpactClassificationConfiguration
): string[] => {
  try {
    const itemSnapshot = canonicalImpactItems([item])[0];
    const configurationSnapshot = canonicalImpactConfiguration(configuration);
    return validateImpactClassificationSnapshot(itemSnapshot, configurationSnapshot);
  } catch (error) {
    return [error instanceof UnsafeBoundaryInputError ? error.message : 'Impact classification input is unsafe.'];
  }
};

const validatePersonalKpiDefinitionSnapshot = (
  item: Readonly<IPersonalWorkplanItem>,
  classificationConfiguration?: Readonly<IImpactClassificationConfiguration>
): IPersonalKpiValidation => {
  const errors: string[] = [];
  if (!text(item.wording)) errors.push('Title is required.');
  if (!text(item.description)) errors.push('Description / objective is required.');
  if (!text(item.measure)) errors.push('Measure is required.');
  if (!text(item.measureType)) errors.push('Measure Type is required.');
  if (!text(item.unitLabel)) errors.push('Unit is required.');
  if (!text(item.scoringDirection) || item.scoringDirection === 'TBC') errors.push('A controlled Scoring Direction is required.');
  if (item.scoringDirection === 'LowerIsBetter' && !finite(item.baselineValue)) errors.push('Lower Is Better requires a numeric Baseline.');
  if (item.measureType === 'Percentage' && !item.percentageSourceScale) errors.push('Percentage requires an explicit Fraction or Whole source scale.');
  if (!targetPresent(item.yearEndTargetValue, item.yearEndTargetText)) errors.push('Annual Target is required.');
  const quarterTargets: Array<[string, number | undefined, string | undefined]> = [
    ['Q1', item.q1TargetValue, item.q1TargetText],
    ['Q2', item.q2TargetValue, item.q2TargetText],
    ['Q3', item.q3TargetValue, item.q3TargetText],
    ['Q4', item.q4TargetValue, item.q4TargetText]
  ];
  quarterTargets.forEach(([quarter, value, targetText]) => {
    if (!targetPresent(value, targetText)) errors.push(`${quarter} Target is required.`);
  });
  if (!finite(item.personalItemWeight) || item.personalItemWeight < 0 || item.personalItemWeight > 100) {
    errors.push('Personal KPI weight must be between 0% and 100%.');
  }
  errors.push(...validateImpactClassificationSnapshot(item, classificationConfiguration));
  return { valid: errors.length === 0, errors };
};

export const validatePersonalKpiDefinition = (
  item: IPersonalWorkplanItem,
  classificationConfiguration?: IImpactClassificationConfiguration
): IPersonalKpiValidation => {
  try {
    const itemSnapshot = canonicalImpactItems([item])[0];
    const configurationSnapshot = canonicalImpactConfiguration(classificationConfiguration);
    return validatePersonalKpiDefinitionSnapshot(itemSnapshot, configurationSnapshot);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof UnsafeBoundaryInputError ? error.message : 'Personal KPI input is unsafe.']
    };
  }
};

export const cloneImpactItems = (
  items: ReadonlyArray<IPersonalWorkplanItem>
): IPersonalWorkplanItem[] => canonicalImpactItems(items).slice() as IPersonalWorkplanItem[];

const validateImpactSectionSnapshots = (
  items: ReadonlyArray<Readonly<IPersonalWorkplanItem>>,
  classificationConfiguration?: Readonly<IImpactClassificationConfiguration>
): IImpactSectionValidation => {
  const configurationErrors = classificationConfiguration
    ? validateImpactConfigurationSnapshot(classificationConfiguration) : [];
  const active = items.filter(item => item.activeInWorkplan);
  const errors = configurationErrors.concat(active.flatMap((item, index) =>
    validatePersonalKpiDefinitionSnapshot(item, classificationConfiguration)
      .errors.map(error => `Impact KPI ${index + 1}: ${error}`)));
  if (active.length > MAX_ACTIVE_IMPACT_KPIS) errors.unshift(`A maximum of ${MAX_ACTIVE_IMPACT_KPIS} active Impact KPIs is allowed.`);
  const keys = active.map(item => typeof item.workplanItemKey === 'string' ? item.workplanItemKey.trim() : '');
  if (keys.some(key => !key) || new Set(keys).size !== keys.length) {
    errors.push('Every active Impact KPI must have one unique stable item identity.');
  }
  const weightTotal = active.reduce((sum, item) => sum + (finite(item.personalItemWeight) ? item.personalItemWeight : 0), 0);
  if (active.length > 0 && weightTotal !== 100) errors.push('Active Impact KPI weights must total exactly 100%.');
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)), activeCount: active.length, weightTotal };
};

export const validateImpactSection = (
  items: ReadonlyArray<IPersonalWorkplanItem>,
  classificationConfiguration?: IImpactClassificationConfiguration
): IImpactSectionValidation => {
  try {
    const snapshots = canonicalImpactItems(items);
    const configurationSnapshot = canonicalImpactConfiguration(classificationConfiguration);
    return validateImpactSectionSnapshots(snapshots, configurationSnapshot);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof UnsafeBoundaryInputError ? error.message : 'Impact section input is unsafe.'],
      activeCount: 0,
      weightTotal: 0
    };
  }
};

/** Creates an immutable save payload for the Impact section only. */
export const prepareImpactSectionSave = (
  items: ReadonlyArray<IPersonalWorkplanItem>,
  classificationConfiguration?: IImpactClassificationConfiguration
): IPersonalWorkplanItem[] => {
  const snapshots = canonicalImpactItems(items);
  const configurationSnapshot = canonicalImpactConfiguration(classificationConfiguration);
  const validation = validateImpactSectionSnapshots(snapshots, configurationSnapshot);
  if (!validation.valid) throw new Error(validation.errors.join(' '));
  return Object.freeze(snapshots.slice()) as unknown as IPersonalWorkplanItem[];
};

export const personalQuarterTarget = (
  item: IPersonalWorkplanItem,
  quarter: QuarterKey
): { value?: number; text?: string } => {
  if (quarter === 'Q1') return { value: item.q1TargetValue, text: item.q1TargetText };
  if (quarter === 'Q2') return { value: item.q2TargetValue, text: item.q2TargetText };
  if (quarter === 'Q3') return { value: item.q3TargetValue, text: item.q3TargetText };
  if (quarter === 'Q4') return { value: item.q4TargetValue, text: item.q4TargetText };
  throw new Error('Impact target requires a supported quarter.');
};

export const calculatePersonalQuarterResult = (
  item: IPersonalWorkplanItem,
  quarter: QuarterKey,
  actualValue: number | undefined,
  actualText: string | undefined,
  thresholds: { greenThreshold: number; amberThreshold: number }
): IScoringResult => {
  const target = personalQuarterTarget(item, quarter);
  return calculatePerformance({
    scoringDirection: item.scoringDirection || 'TBC',
    metricType: item.measureType || 'Other',
    targetValue: target.value,
    targetText: target.text,
    actualValue,
    actualText,
    baselineValue: item.baselineValue
  }, {
    configThresholds: thresholds,
    percentageSourceScale: item.percentageSourceScale
  });
};

export const entersOrganisationalGoldOutput = (itemType: 'CoreGold' | 'LocalPersonal' | 'Behaviour'): boolean =>
  itemType === 'CoreGold';
