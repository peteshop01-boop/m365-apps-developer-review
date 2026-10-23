import type {
  BehaviourKey,
  BehaviourRating,
  BehaviourRag,
  IBehaviourAssessmentView,
  IBehaviourObjectiveLibraryRecord,
  IBehaviourQuarterAssessment,
  ISelectedBehaviourObjective,
  GovernedBehaviourHeadlineRating,
  GovernedBehaviourRoleLevel,
  IGovernedBehaviourCatalogueAuthority,
  IGovernedBehaviourCatalogueContract,
  IGovernedBehaviourCatalogueExpectation,
  IGovernedBehaviourCommandContext,
  IGovernedBehaviourCommitmentCommand,
  IGovernedBehaviourCommitmentDraft,
  IGovernedBehaviourHeadlineRatingInput,
  IGovernedBehaviourHeadlineRatingSet,
  IGovernedBehaviourManagerReviewEntry,
  IGovernedBehaviourManagerReviewInput,
  IGovernedBehaviourSelectionSnapshot,
  IGovernedBehaviourSelectionView
} from '../models/BehaviourWorkplanModels';
import {
  BEHAVIOUR_KEYS,
  GOVERNED_BEHAVIOUR_MANAGER_DISPOSITIONS,
  GOVERNED_BEHAVIOUR_RATINGS,
  GOVERNED_BEHAVIOUR_ROLE_LEVELS
} from '../models/BehaviourWorkplanModels';
import { isRoleBehaviourObjectiveLibraryRecord, needsBehaviourRoleMetadata } from './BehaviourLibraryRoleMetadata';
import {
  isExactLegacyEmployeeBehaviourSuggestionKey,
  isFixedEmployeeBehaviourKey,
  normaliseEmployeeBehaviourCustomObjective
} from './EmployeeBehaviourSelection';

export const DEFAULT_BEHAVIOUR_TARGET_RATING: BehaviourRating = 3;

export const makeBehaviourObjectiveKey = (
  behaviourKey: BehaviourKey,
  now: Date = new Date(),
  randomToken: string = Math.random().toString(36).slice(2, 8).toUpperCase()
): string =>
  `${behaviourKey}-DEMO-${now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomToken}`;

export const behaviourObjectiveKeyCanBeSaved = (
  item: Pick<IBehaviourObjectiveLibraryRecord, 'id' | 'behaviourKey' | 'behaviourObjectiveKey'>
): boolean => Boolean(item.id) || item.behaviourObjectiveKey.trim().startsWith(`${item.behaviourKey}-`);

export const validateBehaviourObjectiveLibraryRecord = (
  item: IBehaviourObjectiveLibraryRecord
): string[] => {
  if (BEHAVIOUR_KEYS.indexOf(item.behaviourKey) < 0) {
    return ['The Behaviour objective must reference one of the five fixed Behaviour keys.'];
  }
  const values = [
    item.behaviourObjectiveKey, item.objectiveTitle, item.objectiveDescription,
    item.suggestedMeasure, item.suggestedUnit, item.suggestedEvidence
  ];
  if (values.some(value => !value?.trim())) {
    return ['The Behaviour objective key, title, description, measure, unit and evidence guidance are required.'];
  }
  if (!behaviourObjectiveKeyCanBeSaved(item)) {
    return ['A new Behaviour objective key must be namespaced to its initial fixed Behaviour key. Persisted keys remain stable when Admin reassigns the banner.'];
  }
  if (needsBehaviourRoleMetadata(item) && !isRoleBehaviourObjectiveLibraryRecord(item)) {
    return ['A role catalogue record requires an exact fixed Behaviour/role/choice key and its matching L1, L2 or L3 level.'];
  }
  if (!Number.isInteger(item.sortOrder) || item.sortOrder < 1) {
    return ['The Behaviour objective sort order must be a positive whole number.'];
  }
  if (!item.effectiveFrom || Number.isNaN(Date.parse(item.effectiveFrom))) {
    return ['The Behaviour objective needs a valid Effective From date.'];
  }
  if (item.effectiveTo && Number.isNaN(Date.parse(item.effectiveTo))) {
    return ['The Behaviour objective Effective To date is invalid.'];
  }
  if (item.effectiveTo && item.effectiveTo < item.effectiveFrom) {
    return ['The Behaviour objective Effective To date cannot precede Effective From.'];
  }
  return [];
};

export const BEHAVIOUR_RATING_SCALE: ReadonlyArray<Readonly<{ value: BehaviourRating; label: string }>> = [
  { value: 4, label: 'Exceeds expectations' },
  { value: 3, label: 'Meets expectations' },
  { value: 2, label: 'Developing' },
  { value: 1, label: 'Not demonstrated / insufficient evidence' }
];

export interface IBehaviourRatingResult {
  rateable: boolean;
  actualRating?: BehaviourRating;
  targetRating?: BehaviourRating;
  rag: BehaviourRag;
  rawNormalisedScore?: number;
  scoredContribution?: number;
}

export interface IBehaviourWeight {
  behaviourKey: BehaviourKey;
  weight: number;
}

export interface IBehaviourPolicyValidation {
  valid: boolean;
  total: number;
  errors: string[];
}

const hasText = (value: string | undefined): boolean => Boolean(value?.trim());

export const isBehaviourRating = (value: unknown): value is BehaviourRating =>
  value === 1 || value === 2 || value === 3 || value === 4;

export const getBehaviourRatingLabel = (value: BehaviourRating | undefined): string | undefined =>
  value === undefined ? undefined : BEHAVIOUR_RATING_SCALE.find(option => option.value === value)?.label;

export const calculateBehaviourRating = (
  actualRating: number | undefined,
  targetRating: number | undefined
): IBehaviourRatingResult => {
  if (!isBehaviourRating(actualRating) || !isBehaviourRating(targetRating)) {
    return { rateable: false, rag: 'NotRated' };
  }

  const difference = actualRating - targetRating;
  const rawNormalisedScore = actualRating / targetRating;
  return {
    rateable: true,
    actualRating,
    targetRating,
    rag: difference >= 0 ? 'Green' : difference === -1 ? 'Amber' : 'Red',
    rawNormalisedScore,
    scoredContribution: Math.min(rawNormalisedScore, 1)
  };
};

export const buildBehaviourAssessmentView = (
  assessment: IBehaviourQuarterAssessment
): IBehaviourAssessmentView => {
  const result = calculateBehaviourRating(assessment.finalRating, assessment.targetRating);
  return {
    target: { value: assessment.targetRating, label: getBehaviourRatingLabel(assessment.targetRating) },
    employee: { value: assessment.employeeSelfRating, label: getBehaviourRatingLabel(assessment.employeeSelfRating) },
    manager: { value: assessment.managerRating, label: getBehaviourRatingLabel(assessment.managerRating) },
    final: { value: assessment.finalRating, label: getBehaviourRatingLabel(assessment.finalRating) },
    rag: result.rag,
    rawNormalisedScore: result.rawNormalisedScore,
    scoredContribution: result.scoredContribution
  };
};

export const createDefaultBehaviourWeights = (): IBehaviourWeight[] =>
  BEHAVIOUR_KEYS.map(behaviourKey => ({ behaviourKey, weight: 20 }));

export const validateBehaviourWeights = (weights: ReadonlyArray<IBehaviourWeight>): IBehaviourPolicyValidation => {
  const errors: string[] = [];
  const total = weights.reduce((sum, row) => sum + (Number.isFinite(row.weight) ? row.weight : 0), 0);
  const keys = weights.map(row => row.behaviourKey);

  if (weights.length !== BEHAVIOUR_KEYS.length) errors.push('Exactly five Behaviour weights are required.');
  if (new Set(keys).size !== keys.length) errors.push('Each Behaviour may have only one weight.');
  BEHAVIOUR_KEYS.forEach(key => {
    if (keys.indexOf(key) < 0) errors.push(`${key} needs a Behaviour weight.`);
  });
  weights.forEach(row => {
    if (!Number.isFinite(row.weight) || row.weight < 0 || row.weight > 100) {
      errors.push(`${row.behaviourKey} weight must be from 0 to 100%.`);
    }
  });
  if (total !== 100) errors.push('Behaviour weights must total exactly 100%.');

  return { valid: errors.length === 0, total, errors };
};

const missingQuarterTargets = (item: ISelectedBehaviourObjective): string[] => {
  const targets = item.quarterTargets;
  const missing: string[] = [];
  if (!hasText(targets.q1Target)) missing.push('Q1');
  if (!hasText(targets.q2Target)) missing.push('Q2');
  if (!hasText(targets.q3Target)) missing.push('Q3');
  if (!hasText(targets.q4Target)) missing.push('Q4');
  return missing;
};

export const validateBehaviourObjectives = (
  objectives: ReadonlyArray<ISelectedBehaviourObjective>
): IBehaviourPolicyValidation => {
  const active = objectives.filter(item => item.activeInWorkplan);
  const errors: string[] = [];
  const weightResult = validateBehaviourWeights(active.map(item => ({
    behaviourKey: item.behaviourKey,
    weight: item.behaviourWeight
  })));

  if (active.length !== BEHAVIOUR_KEYS.length) errors.push('Select exactly one objective for each of the five Behaviours.');
  BEHAVIOUR_KEYS.forEach(key => {
    const matches = active.filter(item => item.behaviourKey === key);
    if (matches.length !== 1) errors.push(`${key} must have exactly one active objective.`);
  });
  active.forEach(item => {
    if (!isFixedEmployeeBehaviourKey(item.behaviourKey)) {
      errors.push('Behaviour identity must reference one of the five fixed Behaviours.');
    }
    const selectedKeys = item.selectedSuggestionKeys || (item.sourceObjectiveKey ? [item.sourceObjectiveKey] : []);
    if (item.source === 'Library' && selectedKeys.length === 0) {
      errors.push(`${item.behaviourKey} library selection needs its source objective key.`);
    }
    if (new Set(selectedKeys).size !== selectedKeys.length
      || selectedKeys.some(key => !isExactLegacyEmployeeBehaviourSuggestionKey(item.behaviourKey, key))) {
      errors.push(`${item.behaviourKey} suggestion keys must be unique approved OBJ-01 to OBJ-05 keys.`);
    }
    const customText = item.customObjective || (item.source === 'Custom' ? item.objectiveTitle : '');
    const normalisedCustomText = customText
      ? normaliseEmployeeBehaviourCustomObjective(customText)
      : undefined;
    if (item.customObjective && normalisedCustomText === undefined) {
      errors.push(`${item.behaviourKey} custom wording must be safe visible text of at most 100,000 characters.`);
    }
    if (item.source === 'Custom' && normalisedCustomText === undefined) {
      errors.push(`${item.behaviourKey} custom wording must be safe visible text of at most 100,000 characters.`);
    }
    if (selectedKeys.length === 0 && normalisedCustomText === undefined) {
      errors.push(`${item.behaviourKey} needs at least one controlled suggestion or custom wording.`);
    }
    if (!hasText(item.objectiveTitle)) errors.push(`${item.behaviourKey} needs an objective.`);
    if (!hasText(item.objectiveDescription)) errors.push(`${item.behaviourKey} needs a description.`);
    if (!hasText(item.measure)) errors.push(`${item.behaviourKey} needs a measure.`);
    if (!hasText(item.unit)) errors.push(`${item.behaviourKey} needs a unit.`);
    if (!hasText(item.evidenceDefinition)) errors.push(`${item.behaviourKey} needs an evidence definition.`);
    const missing = missingQuarterTargets(item);
    if (missing.length > 0) errors.push(`${item.behaviourKey} needs ${missing.join(', ')} targets.`);
    if (!isBehaviourRating(item.targetRating)) errors.push(`${item.behaviourKey} needs a target rating from 1 to 4.`);
  });

  errors.push(...weightResult.errors);
  return { valid: errors.length === 0, total: weightResult.total, errors: Array.from(new Set(errors)) };
};

const governedAuthorityFields = Object.freeze([
  'catalogueId', 'version', 'etag', 'approvalReference', 'contentSha256',
  'effectiveFrom', 'publishedAt', 'publishedBy', 'changeReference'
] as const);
const governedTargetFields = Object.freeze([
  'targetKey', 'behaviourKey', 'focusKey', 'roleLevel', 'wording', 'sortOrder',
  'active', 'approved', 'effectiveFrom'
] as const);
const governedHeadlineFields = Object.freeze([
  'behaviourKey', 'title', 'sortOrder', 'active', 'approved', 'focuses'
] as const);
const governedFocusFields = Object.freeze(['focusKey', 'behaviourKey', 'title', 'sortOrder', 'targets'] as const);

const inspectOwnData = (
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = []
): Readonly<{ [key: string]: unknown }> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a plain object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must use a plain or null prototype.`);
  const keys = Reflect.ownKeys(value);
  const allowed = [...required, ...optional];
  if (keys.some(key => typeof key !== 'string' || allowed.indexOf(key) < 0)
    || required.some(field => keys.indexOf(field) < 0)) {
    throw new Error(`${label} has a missing, unexpected or symbol field.`);
  }
  const snapshot: { [key: string]: unknown } = Object.create(null) as { [key: string]: unknown };
  keys.forEach(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new Error(`${label}.${String(key)} must be an enumerable own data property.`);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false
    });
  });
  return Object.freeze(snapshot);
};

const inspectDenseArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)))) {
    throw new Error(`${label} contains an unsupported own field or symbol.`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  const length = lengthDescriptor && Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
    ? lengthDescriptor.value
    : undefined;
  if (!Number.isSafeInteger(length) || length < 0 || keys.filter(key => key !== 'length').length !== length) {
    throw new Error(`${label} must be dense and have an exact length descriptor.`);
  }
  const result: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new Error(`${label}[${index}] must be an enumerable own data property.`);
    }
    result.push(descriptor.value);
  }
  return Object.freeze(result);
};

const governedText = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const text = value.trim();
  if (!text || text.length > 100000 || text.indexOf('\0') >= 0 || /[\uD800-\uDFFF]/.test(text)) {
    throw new Error(`${label} must be safe visible text of at most 100,000 characters.`);
  }
  return text;
};

const exactIso = (value: unknown, label: string): string => {
  const text = governedText(value, label);
  if (Number.isNaN(Date.parse(text))) throw new Error(`${label} must be an exact parseable date or timestamp.`);
  return text;
};

const governedRole = (value: unknown, label: string): GovernedBehaviourRoleLevel => {
  if (GOVERNED_BEHAVIOUR_ROLE_LEVELS.indexOf(value as GovernedBehaviourRoleLevel) < 0) {
    throw new Error(`${label} must be one approved governed role level.`);
  }
  return value as GovernedBehaviourRoleLevel;
};

const governedBehaviourKey = (value: unknown, label: string): BehaviourKey => {
  if (BEHAVIOUR_KEYS.indexOf(value as BehaviourKey) < 0) throw new Error(`${label} must be one fixed Behaviour key.`);
  return value as BehaviourKey;
};

const governedSortOrder = (value: unknown, label: string): 1 | 2 | 3 | 4 | 5 => {
  if (!Number.isInteger(value) || typeof value !== 'number' || value < 1 || value > 5) {
    throw new Error(`${label} must be a whole number from 1 to 5.`);
  }
  return value as 1 | 2 | 3 | 4 | 5;
};

const canonicalGovernedAuthority = (value: unknown): Readonly<IGovernedBehaviourCatalogueAuthority> => {
  const source = inspectOwnData(value, 'Governed Behaviour catalogue authority', governedAuthorityFields);
  const authority: IGovernedBehaviourCatalogueAuthority = {
    catalogueId: governedText(source.catalogueId, 'Catalogue ID'),
    version: governedText(source.version, 'Catalogue version'),
    etag: governedText(source.etag, 'Catalogue ETag'),
    approvalReference: source.approvalReference as 'DEMO-APP-PETE-BEH-V1-001',
    contentSha256: governedText(source.contentSha256, 'Catalogue content SHA-256').toUpperCase(),
    effectiveFrom: exactIso(source.effectiveFrom, 'Catalogue Effective From'),
    publishedAt: exactIso(source.publishedAt, 'Catalogue Published At'),
    publishedBy: governedText(source.publishedBy, 'Catalogue publisher'),
    changeReference: governedText(source.changeReference, 'Catalogue ChangeReference')
  };
  if (authority.etag === '*' || authority.approvalReference !== 'DEMO-APP-PETE-BEH-V1-001'
    || !/^[A-F0-9]{64}$/.test(authority.contentSha256)) {
    throw new Error('Governed Behaviour catalogue authority requires an exact ETag, Sponsor approval and SHA-256 provenance.');
  }
  return Object.freeze(authority);
};

const canonicalGovernedCatalogue = (
  value: unknown,
  expectedAuthority?: IGovernedBehaviourCatalogueExpectation
): Readonly<IGovernedBehaviourCatalogueContract> => {
  const envelope = inspectOwnData(value, 'Governed Behaviour catalogue', [
    'schema', 'immutable', 'published', 'productionSafe', 'authority', 'headlines', 'ratingOptions'
  ]);
  if (envelope.schema !== 'DEMO.GovernedBehaviourCatalogue' || envelope.immutable !== true
    || envelope.published !== true || envelope.productionSafe !== true) {
    throw new Error('Governed Behaviour catalogue must be the immutable published production-safe contract.');
  }
  const authority = canonicalGovernedAuthority(envelope.authority);
  if (expectedAuthority) {
    const expected = canonicalGovernedAuthority(expectedAuthority);
    if (governedAuthorityFields.some(field => authority[field] !== expected[field])) {
      throw new Error('Governed Behaviour catalogue authority, version, ETag or provenance changed after it was loaded.');
    }
  }
  const headlineInputs = inspectDenseArray(envelope.headlines, 'Governed Behaviour headlines');
  if (headlineInputs.length !== 5) throw new Error('Governed Behaviour catalogue requires exactly five headlines.');
  const allTargetKeys = new Set<string>();
  const headlines = headlineInputs.map((headlineValue, headlineIndex) => {
    const headline = inspectOwnData(headlineValue, `Governed Behaviour headline ${headlineIndex + 1}`, governedHeadlineFields);
    const behaviourKey = governedBehaviourKey(headline.behaviourKey, 'Headline Behaviour key');
    const sortOrder = governedSortOrder(headline.sortOrder, 'Headline sort order');
    if (behaviourKey !== BEHAVIOUR_KEYS[headlineIndex] || sortOrder !== headlineIndex + 1
      || headline.active !== true || headline.approved !== true) {
      throw new Error('Governed Behaviour headline identity/order/state does not match the approved five-headline contract.');
    }
    const focusInputs = inspectDenseArray(headline.focuses, `${behaviourKey} focus areas`);
    if (focusInputs.length !== 5) throw new Error(`${behaviourKey} requires exactly five governed focus areas.`);
    const focusKeys = new Set<string>();
    const focuses = focusInputs.map((focusValue, focusIndex) => {
      const focus = inspectOwnData(focusValue, `${behaviourKey} focus ${focusIndex + 1}`, governedFocusFields);
      const focusKey = governedText(focus.focusKey, 'Focus key');
      const focusBehaviourKey = governedBehaviourKey(focus.behaviourKey, 'Focus Behaviour key');
      const focusOrder = governedSortOrder(focus.sortOrder, 'Focus sort order');
      if (focusBehaviourKey !== behaviourKey || focusOrder !== focusIndex + 1 || focusKeys.has(focusKey)) {
        throw new Error(`${behaviourKey} focus identity/order is duplicated, missing or moved.`);
      }
      focusKeys.add(focusKey);
      const targetInputs = inspectDenseArray(focus.targets, `${focusKey} role targets`);
      if (targetInputs.length !== 3) throw new Error(`${focusKey} requires exactly three role-filtered targets.`);
      const targetRoles = new Set<GovernedBehaviourRoleLevel>();
      const targets = targetInputs.map((targetValue, targetIndex) => {
        const target = inspectOwnData(targetValue, `${focusKey} target ${targetIndex + 1}`,
          governedTargetFields, ['effectiveTo']);
        const targetKey = governedText(target.targetKey, 'Target key');
        const targetBehaviourKey = governedBehaviourKey(target.behaviourKey, 'Target Behaviour key');
        const targetFocusKey = governedText(target.focusKey, 'Target focus key');
        const roleLevel = governedRole(target.roleLevel, 'Target role level');
        const effectiveFrom = exactIso(target.effectiveFrom, 'Target Effective From');
        const effectiveTo = target.effectiveTo === undefined ? undefined : exactIso(target.effectiveTo, 'Target Effective To');
        if (targetBehaviourKey !== behaviourKey || targetFocusKey !== focusKey
          || roleLevel !== GOVERNED_BEHAVIOUR_ROLE_LEVELS[targetIndex]
          || governedSortOrder(target.sortOrder, 'Target sort order') !== focusOrder
          || targetRoles.has(roleLevel) || allTargetKeys.has(targetKey)
          || typeof target.active !== 'boolean' || typeof target.approved !== 'boolean'
          || (effectiveTo !== undefined && effectiveTo < effectiveFrom)) {
          throw new Error(`${targetKey} has duplicate, moved, crossed, role-mismatched or invalid governed identity.`);
        }
        targetRoles.add(roleLevel);
        allTargetKeys.add(targetKey);
        return Object.freeze({
          targetKey,
          behaviourKey,
          focusKey,
          roleLevel,
          wording: governedText(target.wording, 'Target wording'),
          sortOrder: focusOrder,
          active: target.active as boolean,
          approved: target.approved as boolean,
          effectiveFrom,
          ...(effectiveTo ? { effectiveTo } : {})
        });
      });
      return Object.freeze({
        focusKey,
        behaviourKey,
        title: governedText(focus.title, 'Focus title'),
        sortOrder: focusOrder,
        targets: Object.freeze(targets)
      });
    });
    return Object.freeze({
      behaviourKey,
      title: governedText(headline.title, 'Headline title'),
      sortOrder,
      active: true as const,
      approved: true as const,
      focuses: Object.freeze(focuses)
    });
  });
  if (allTargetKeys.size !== 75) throw new Error('Governed Behaviour catalogue requires exactly 75 unique role targets.');
  const ratingInputs = inspectDenseArray(envelope.ratingOptions, 'Governed Behaviour rating options');
  if (ratingInputs.length !== 3 || ratingInputs.some((rating, index) => rating !== GOVERNED_BEHAVIOUR_RATINGS[index])) {
    throw new Error('Governed Behaviour ratings must be exactly Developing, Effective and Exceptional.');
  }
  return Object.freeze({
    schema: 'DEMO.GovernedBehaviourCatalogue' as const,
    immutable: true as const,
    published: true as const,
    productionSafe: true as const,
    authority,
    headlines: Object.freeze(headlines),
    ratingOptions: GOVERNED_BEHAVIOUR_RATINGS
  });
};

export const assertGovernedBehaviourCatalogue = (
  value: unknown,
  expectedAuthority?: IGovernedBehaviourCatalogueExpectation
): Readonly<IGovernedBehaviourCatalogueContract> => canonicalGovernedCatalogue(value, expectedAuthority);

const targetIsEffective = (
  target: Readonly<{ effectiveFrom: string; effectiveTo?: string }>,
  asOf: Date
): boolean => {
  if (Number.isNaN(asOf.getTime())) throw new Error('Governed Behaviour selection requires a valid as-of date.');
  const date = asOf.toISOString();
  return Date.parse(target.effectiveFrom) <= Date.parse(date)
    && (target.effectiveTo === undefined || Date.parse(target.effectiveTo) >= Date.parse(date));
};

const assertCatalogueEffective = (
  catalogue: Readonly<IGovernedBehaviourCatalogueContract>,
  asOf: Date
): void => {
  if (Number.isNaN(asOf.getTime()) || Date.parse(catalogue.authority.effectiveFrom) > asOf.getTime()) {
    throw new Error('Governed Behaviour catalogue is not effective for the requested as-of time.');
  }
};

export const buildGovernedBehaviourSelectionView = (
  catalogueValue: unknown,
  expectedAuthority: IGovernedBehaviourCatalogueExpectation,
  roleLevelValue: unknown,
  asOf: Date,
  selectedTargetKeys: readonly string[] = []
): readonly Readonly<IGovernedBehaviourSelectionView>[] => {
  const catalogue = canonicalGovernedCatalogue(catalogueValue, expectedAuthority);
  assertCatalogueEffective(catalogue, asOf);
  const roleLevel = governedRole(roleLevelValue, 'Assigned role level');
  const selectedInputs = inspectDenseArray(selectedTargetKeys, 'Selected target keys');
  const selected = Object.freeze(selectedInputs.map((key, index) => governedText(key, `Selected target key ${index + 1}`)));
  if (new Set(selected).size !== selected.length) throw new Error('Selected target keys must be unique.');
  return Object.freeze(catalogue.headlines.map(headline => Object.freeze({
    behaviourKey: headline.behaviourKey,
    headlineTitle: headline.title,
    focuses: Object.freeze(headline.focuses.map(focus => Object.freeze({
      focusKey: focus.focusKey,
      focusTitle: focus.title,
      targets: Object.freeze(focus.targets.filter(target => target.roleLevel === roleLevel).map(target => Object.freeze({
        targetKey: target.targetKey,
        wording: target.wording,
        selected: selected.indexOf(target.targetKey) >= 0,
        historicallySelected: selected.indexOf(target.targetKey) >= 0 && (!target.active || !target.approved || !targetIsEffective(target, asOf)),
        selectable: target.active && target.approved && targetIsEffective(target, asOf)
      })))
    })))
  })));
};

const canonicalCommandContext = (value: unknown): Readonly<IGovernedBehaviourCommandContext> => {
  const context = inspectOwnData(value, 'Governed Behaviour command context', [
    'action', 'workplanKey', 'expectedWorkplanVersion', 'currentWorkplanVersion', 'state', 'roleLevel',
    'actorEmail', 'occurredAt', 'changeReference'
  ]);
  if (context.action !== 'Save' && context.action !== 'Submit') throw new Error('Governed Behaviour action must be Save or Submit.');
  if (context.state !== 'Draft' && context.state !== 'ChangesRequested') {
    throw new Error('Governed Behaviour changes require Draft or Changes Requested state. Submitted is read-only.');
  }
  const expectedWorkplanVersion = governedText(context.expectedWorkplanVersion, 'Expected Workplan version');
  if (expectedWorkplanVersion !== governedText(context.currentWorkplanVersion, 'Current Workplan version')) {
    throw new Error('Governed Behaviour Workplan version is stale.');
  }
  return Object.freeze({
    action: context.action,
    workplanKey: governedText(context.workplanKey, 'Workplan key'),
    expectedWorkplanVersion,
    currentWorkplanVersion: expectedWorkplanVersion,
    state: context.state,
    roleLevel: governedRole(context.roleLevel, 'Assigned role level'),
    actorEmail: governedText(context.actorEmail, 'Actor email'),
    occurredAt: exactIso(context.occurredAt, 'Occurred At'),
    changeReference: governedText(context.changeReference, 'ChangeReference')
  });
};

export const buildGovernedBehaviourCommitmentCommand = (
  catalogueValue: unknown,
  expectedAuthority: IGovernedBehaviourCatalogueExpectation,
  contextValue: unknown,
  draftValues: readonly IGovernedBehaviourCommitmentDraft[],
  asOf: Date
): Readonly<IGovernedBehaviourCommitmentCommand> => {
  const catalogue = canonicalGovernedCatalogue(catalogueValue, expectedAuthority);
  assertCatalogueEffective(catalogue, asOf);
  const context = canonicalCommandContext(contextValue);
  const draftInputs = inspectDenseArray(draftValues, 'Governed Behaviour commitment drafts');
  if (draftInputs.length < 1 || draftInputs.length > 5) {
    throw new Error('Governed Behaviour commitments allow one to five items; three to five is guidance, not a fabricated hard minimum.');
  }
  const commitmentKeys = new Set<string>();
  const selectionKeys = new Set<string>();
  const snapshots = draftInputs.map((draftValue, draftIndex): Readonly<IGovernedBehaviourSelectionSnapshot> => {
    const draft = inspectOwnData(draftValue, `Governed Behaviour draft ${draftIndex + 1}`, [
      'commitmentKey', 'source', 'behaviourKey', 'focusKey', 'roleLevel',
      'catalogueVersion', 'catalogueEtag', 'myCommitment', 'howWillWeKnow'
    ], ['targetKey', 'ownTarget']);
    const commitmentKey = governedText(draft.commitmentKey, 'Commitment key');
    if (commitmentKeys.has(commitmentKey)) throw new Error('Governed Behaviour commitment keys must be unique.');
    commitmentKeys.add(commitmentKey);
    if (draft.source !== 'GovernedTarget' && draft.source !== 'OwnTarget') {
      throw new Error(`${commitmentKey} has an unsupported target source.`);
    }
    const behaviourKey = governedBehaviourKey(draft.behaviourKey, 'Commitment Behaviour key');
    const focusKey = governedText(draft.focusKey, 'Commitment focus key');
    const roleLevel = governedRole(draft.roleLevel, 'Commitment role level');
    if (roleLevel !== context.roleLevel || draft.catalogueVersion !== catalogue.authority.version
      || draft.catalogueEtag !== catalogue.authority.etag) {
      throw new Error(`${commitmentKey} has a stale catalogue version/ETag or role mismatch.`);
    }
    const headline = catalogue.headlines.filter(item => item.behaviourKey === behaviourKey)[0];
    const focus = headline?.focuses.filter(item => item.focusKey === focusKey)[0];
    if (!headline || !focus) throw new Error(`${commitmentKey} references a missing or moved headline/focus identity.`);
    let targetKey: string;
    let targetWording: string;
    if (draft.source === 'GovernedTarget') {
      if (draft.ownTarget !== undefined) throw new Error(`${commitmentKey} cannot mix governed and own target sources.`);
      targetKey = governedText(draft.targetKey, 'Governed target key');
      const matches = focus.targets.filter(target => target.targetKey === targetKey);
      const anywhere = catalogue.headlines.reduce((total, item) => total.concat(
        item.focuses.reduce((focusTotal, candidateFocus) => focusTotal.concat(
          candidateFocus.targets.filter(target => target.targetKey === targetKey)
        ), [] as typeof focus.targets[number][])
      ), [] as typeof focus.targets[number][]);
      if (matches.length !== 1 || anywhere.length !== 1) {
        throw new Error(`${commitmentKey} references a missing, duplicate or moved governed target.`);
      }
      const target = matches[0];
      if (target.roleLevel !== roleLevel || !target.active || !target.approved || !targetIsEffective(target, asOf)) {
        throw new Error(`${commitmentKey} target is role-mismatched, retired, unapproved or outside its effective period.`);
      }
      targetWording = target.wording;
    } else {
      if (draft.targetKey !== undefined) throw new Error(`${commitmentKey} own target must not assert a governed target key.`);
      targetKey = `OWN:${commitmentKey}`;
      targetWording = governedText(draft.ownTarget, 'Own target wording');
    }
    if (selectionKeys.has(targetKey)) throw new Error(`${commitmentKey} duplicates an existing governed or own target identity.`);
    selectionKeys.add(targetKey);
    return Object.freeze({
      commitmentKey,
      source: draft.source,
      behaviourKey,
      headlineTitle: headline.title,
      focusKey,
      focusTitle: focus.title,
      roleLevel,
      targetKey,
      targetWording,
      catalogueId: catalogue.authority.catalogueId,
      catalogueVersion: catalogue.authority.version,
      catalogueEtag: catalogue.authority.etag,
      approvalReference: catalogue.authority.approvalReference,
      contentSha256: catalogue.authority.contentSha256,
      myCommitment: governedText(draft.myCommitment, 'MY COMMITMENT'),
      howWillWeKnow: governedText(draft.howWillWeKnow, 'HOW WILL WE KNOW?')
    });
  });
  return Object.freeze({
    mode: 'BrowserMemoryCommand' as const,
    action: context.action,
    workplanKey: context.workplanKey,
    expectedWorkplanVersion: context.expectedWorkplanVersion,
    sourceState: context.state as 'Draft' | 'ChangesRequested',
    catalogueAuthority: catalogue.authority,
    roleLevel: context.roleLevel,
    commitments: Object.freeze(snapshots),
    guidance: Object.freeze({ normalMinimum: 3 as const, normalMaximum: 5 as const }),
    behavioursExcludedFromDeliveryArithmetic: true as const,
    perTargetScoreProduced: false as const,
    behaviourRagProduced: false as const,
    tenantMutationExecuted: false as const,
    attribution: Object.freeze({
      actorEmail: context.actorEmail,
      occurredAt: context.occurredAt,
      changeReference: context.changeReference
    })
  });
};

const snapshotFields = Object.freeze([
  'commitmentKey', 'source', 'behaviourKey', 'headlineTitle', 'focusKey', 'focusTitle', 'roleLevel',
  'targetKey', 'targetWording', 'catalogueId', 'catalogueVersion', 'catalogueEtag', 'approvalReference',
  'contentSha256', 'myCommitment', 'howWillWeKnow'
] as const);

export const reopenGovernedBehaviourCommitmentReadModel = (
  value: unknown
): Readonly<IGovernedBehaviourCommitmentCommand> => {
  const command = inspectOwnData(value, 'Governed Behaviour read model', [
    'mode', 'action', 'workplanKey', 'expectedWorkplanVersion', 'sourceState', 'catalogueAuthority',
    'roleLevel', 'commitments', 'guidance', 'behavioursExcludedFromDeliveryArithmetic',
    'perTargetScoreProduced', 'behaviourRagProduced', 'tenantMutationExecuted', 'attribution'
  ]);
  if (command.mode !== 'BrowserMemoryCommand' || (command.action !== 'Save' && command.action !== 'Submit')
    || (command.sourceState !== 'Draft' && command.sourceState !== 'ChangesRequested')
    || command.behavioursExcludedFromDeliveryArithmetic !== true || command.perTargetScoreProduced !== false
    || command.behaviourRagProduced !== false || command.tenantMutationExecuted !== false) {
    throw new Error('Governed Behaviour read model has invalid state or arithmetic flags.');
  }
  const authority = canonicalGovernedAuthority(command.catalogueAuthority);
  const roleLevel = governedRole(command.roleLevel, 'Stored role level');
  const commitmentInputs = inspectDenseArray(command.commitments, 'Stored Behaviour commitments');
  const storedCommitmentKeys = new Set<string>();
  const storedTargetKeys = new Set<string>();
  const commitments = commitmentInputs.map((valueItem, index): Readonly<IGovernedBehaviourSelectionSnapshot> => {
    const item = inspectOwnData(valueItem, `Stored Behaviour commitment ${index + 1}`, snapshotFields);
    const source = item.source;
    if (source !== 'GovernedTarget' && source !== 'OwnTarget') throw new Error('Stored Behaviour source is invalid.');
    const approvalReference = item.approvalReference;
    if (item.catalogueId !== authority.catalogueId || item.catalogueVersion !== authority.version
      || item.catalogueEtag !== authority.etag || approvalReference !== authority.approvalReference
      || item.contentSha256 !== authority.contentSha256 || item.roleLevel !== roleLevel) {
      throw new Error('Stored Behaviour commitment authority or provenance is crossed or altered.');
    }
    const commitmentKey = governedText(item.commitmentKey, 'Stored commitment key');
    const targetKey = governedText(item.targetKey, 'Stored target key');
    if (storedCommitmentKeys.has(commitmentKey) || storedTargetKeys.has(targetKey)) {
      throw new Error('Stored Behaviour commitment or target identity is duplicated.');
    }
    storedCommitmentKeys.add(commitmentKey);
    storedTargetKeys.add(targetKey);
    return Object.freeze({
      commitmentKey,
      source,
      behaviourKey: governedBehaviourKey(item.behaviourKey, 'Stored Behaviour key'),
      headlineTitle: governedText(item.headlineTitle, 'Stored headline title'),
      focusKey: governedText(item.focusKey, 'Stored focus key'),
      focusTitle: governedText(item.focusTitle, 'Stored focus title'),
      roleLevel,
      targetKey,
      targetWording: governedText(item.targetWording, 'Stored target wording'),
      catalogueId: authority.catalogueId,
      catalogueVersion: authority.version,
      catalogueEtag: authority.etag,
      approvalReference: authority.approvalReference,
      contentSha256: authority.contentSha256,
      myCommitment: governedText(item.myCommitment, 'Stored MY COMMITMENT'),
      howWillWeKnow: governedText(item.howWillWeKnow, 'Stored HOW WILL WE KNOW?')
    });
  });
  const guidance = inspectOwnData(command.guidance, 'Stored commitment guidance', ['normalMinimum', 'normalMaximum']);
  if (guidance.normalMinimum !== 3 || guidance.normalMaximum !== 5) throw new Error('Stored commitment guidance is invalid.');
  const attribution = inspectOwnData(command.attribution, 'Stored command attribution', [
    'actorEmail', 'occurredAt', 'changeReference'
  ]);
  return Object.freeze({
    mode: 'BrowserMemoryCommand' as const,
    action: command.action,
    workplanKey: governedText(command.workplanKey, 'Stored Workplan key'),
    expectedWorkplanVersion: governedText(command.expectedWorkplanVersion, 'Stored Workplan version'),
    sourceState: command.sourceState,
    catalogueAuthority: authority,
    roleLevel,
    commitments: Object.freeze(commitments),
    guidance: Object.freeze({ normalMinimum: 3 as const, normalMaximum: 5 as const }),
    behavioursExcludedFromDeliveryArithmetic: true as const,
    perTargetScoreProduced: false as const,
    behaviourRagProduced: false as const,
    tenantMutationExecuted: false as const,
    attribution: Object.freeze({
      actorEmail: governedText(attribution.actorEmail, 'Stored actor'),
      occurredAt: exactIso(attribution.occurredAt, 'Stored occurrence time'),
      changeReference: governedText(attribution.changeReference, 'Stored ChangeReference')
    })
  });
};

const reviewFields = Object.freeze([
  'auditKey', 'expectedWorkplanVersion', 'managerEmail', 'occurredAt',
  'changeReference', 'disposition'
] as const);

export const appendGovernedBehaviourManagerReview = (
  historyValues: readonly IGovernedBehaviourManagerReviewEntry[],
  inputValue: unknown,
  currentWorkplanVersion: string
): readonly Readonly<IGovernedBehaviourManagerReviewEntry>[] => {
  const historyInputs = inspectDenseArray(historyValues, 'Manager Behaviour review history');
  const history = historyInputs.map((entryValue, index) => {
    const entry = inspectOwnData(entryValue, `Manager review history ${index + 1}`,
      [...reviewFields, 'sequence'], ['commentary']);
    if (entry.sequence !== index + 1 || GOVERNED_BEHAVIOUR_MANAGER_DISPOSITIONS.indexOf(
      entry.disposition as IGovernedBehaviourManagerReviewEntry['disposition']) < 0) {
      throw new Error('Manager Behaviour review history has invalid sequence or disposition.');
    }
    return Object.freeze({
      auditKey: governedText(entry.auditKey, 'Manager audit key'),
      expectedWorkplanVersion: governedText(entry.expectedWorkplanVersion, 'Manager expected Workplan version'),
      managerEmail: governedText(entry.managerEmail, 'Manager email'),
      occurredAt: exactIso(entry.occurredAt, 'Manager review time'),
      changeReference: governedText(entry.changeReference, 'Manager ChangeReference'),
      disposition: entry.disposition as IGovernedBehaviourManagerReviewEntry['disposition'],
      ...(entry.commentary === undefined ? {} : { commentary: governedText(entry.commentary, 'Manager commentary') }),
      sequence: index + 1
    });
  });
  const input = inspectOwnData(inputValue, 'Manager Behaviour review input', reviewFields, ['commentary']);
  const disposition = input.disposition;
  if (GOVERNED_BEHAVIOUR_MANAGER_DISPOSITIONS.indexOf(
    disposition as IGovernedBehaviourManagerReviewInput['disposition']) < 0) {
    throw new Error('Manager Behaviour review disposition must be AGREED or CHANGES REQUESTED.');
  }
  const expectedVersion = governedText(input.expectedWorkplanVersion, 'Manager expected Workplan version');
  if (expectedVersion !== governedText(currentWorkplanVersion, 'Current Workplan version')) {
    throw new Error('Manager Behaviour review Workplan version is stale.');
  }
  const auditKey = governedText(input.auditKey, 'Manager audit key');
  if (history.some(entry => entry.auditKey === auditKey)) throw new Error('Manager Behaviour review audit key was already used.');
  const appended: Readonly<IGovernedBehaviourManagerReviewEntry> = Object.freeze({
    auditKey,
    expectedWorkplanVersion: expectedVersion,
    managerEmail: governedText(input.managerEmail, 'Manager email'),
    occurredAt: exactIso(input.occurredAt, 'Manager review time'),
    changeReference: governedText(input.changeReference, 'Manager ChangeReference'),
    disposition: disposition as IGovernedBehaviourManagerReviewInput['disposition'],
    ...(input.commentary === undefined ? {} : { commentary: governedText(input.commentary, 'Manager commentary') }),
    sequence: history.length + 1
  });
  return Object.freeze([...history, appended]);
};

export const buildGovernedBehaviourHeadlineRatingSet = (
  catalogueValue: unknown,
  expectedAuthority: IGovernedBehaviourCatalogueExpectation,
  ratingValues: readonly IGovernedBehaviourHeadlineRatingInput[]
): Readonly<IGovernedBehaviourHeadlineRatingSet> => {
  const catalogue = canonicalGovernedCatalogue(catalogueValue, expectedAuthority);
  const ratingInputs = inspectDenseArray(ratingValues, 'Governed Behaviour headline ratings');
  if (ratingInputs.length !== 5) throw new Error('Exactly one formal rating is required for each of five headline Behaviours.');
  const byKey = new Map<BehaviourKey, GovernedBehaviourHeadlineRating>();
  ratingInputs.forEach((ratingValue, index) => {
    const rating = inspectOwnData(ratingValue, `Headline rating ${index + 1}`, ['behaviourKey', 'rating']);
    const behaviourKey = governedBehaviourKey(rating.behaviourKey, 'Rating Behaviour key');
    if (byKey.has(behaviourKey) || GOVERNED_BEHAVIOUR_RATINGS.indexOf(
      rating.rating as GovernedBehaviourHeadlineRating) < 0) {
      throw new Error('Headline Behaviour ratings must be unique and Developing, Effective or Exceptional.');
    }
    byKey.set(behaviourKey, rating.rating as GovernedBehaviourHeadlineRating);
  });
  const ratings = catalogue.headlines.map(headline => {
    const rating = byKey.get(headline.behaviourKey);
    if (!rating) throw new Error(`${headline.behaviourKey} requires exactly one headline rating.`);
    return Object.freeze({ behaviourKey: headline.behaviourKey, rating });
  });
  return Object.freeze({
    ratings: Object.freeze(ratings),
    perTargetScoreProduced: false as const,
    behaviourRagProduced: false as const,
    deliveryContributionProduced: false as const
  });
};
