import {
  BEHAVIOUR_FRAMEWORK_V2_VERSION,
  BEHAVIOUR_PLANNING_LEVELS_VERSION,
  BEHAVIOUR_V2_QUARTERLY_PERIODS,
  BEHAVIOUR_V2_ROLE_TIERS,
  BEHAVIOUR_V2_TWICE_YEARLY_PERIODS,
  BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourAssessmentOwnerV2,
  type BehaviourV2Cadence,
  type BehaviourV2Period,
  type BehaviourV2Rating,
  type BehaviourV2RoleTier,
  type BehaviourV2ValueId,
  type IBehaviourAnnualSnapshotV2,
  type IBehaviourPlanningLevelsV1,
  type IBehaviourAssessmentPatchV2,
  type IBehaviourFrameworkV2PublishedSet,
  type IBehaviourPeriodAssessmentV2,
  type IBehaviourPeriodSnapshotV2,
  type IBehaviourPersonAssignmentV2,
  type IBehaviourV2RatingOption
} from '../models/BehaviourFrameworkV2Models';

export const BEHAVIOUR_V2_RATING_OPTIONS: readonly IBehaviourV2RatingOption[] = Object.freeze([
  Object.freeze({ value: 1 as const, label: 'Developing' as const, displayLabel: '1 Developing' }),
  Object.freeze({ value: 2 as const, label: 'Effective' as const, displayLabel: '2 Effective' }),
  Object.freeze({ value: 3 as const, label: 'Exceptional' as const, displayLabel: '3 Exceptional' })
]);

const planningLevels = ['Developing', 'Effective', 'Exceptional'] as const;
export const suggestedBehaviourTargetLevel = (current?: IBehaviourPlanningLevelsV1['currentLevel']): IBehaviourPlanningLevelsV1['targetLevel'] =>
  current === 'Developing' ? 'Effective' : current === 'Effective' ? 'Exceptional' : undefined;

/** Validate the exact categorical envelope without interpreting numeric assessments as planning levels. */
export const validateBehaviourPlanningLevelsV1 = (value: unknown): IBehaviourPlanningLevelsV1 | undefined => {
  if (value === undefined) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Behaviour planning levels must be an object.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !['contractVersion', 'currentLevel', 'targetLevel', 'targetJustification'].includes(key))
    || row.contractVersion !== BEHAVIOUR_PLANNING_LEVELS_VERSION) {
    throw new Error('Behaviour planning levels require the exact v01 categorical contract.');
  }
  const current = row.currentLevel;
  const target = row.targetLevel;
  const reason = row.targetJustification;
  if (current !== undefined && !planningLevels.includes(current as typeof planningLevels[number])
    || target !== undefined && !planningLevels.includes(target as typeof planningLevels[number])) {
    throw new Error('Behaviour planning levels must use Developing, Effective or Exceptional labels.');
  }
  if (reason !== undefined && (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 1000)) {
    throw new Error('Behaviour Target justification must be visible text of at most 1,000 characters.');
  }
  if (target !== undefined && current === undefined || reason !== undefined && target === undefined) {
    throw new Error('Behaviour Target and justification require a Current and a Target Level.');
  }
  if (current !== undefined && target !== undefined) {
    if (planningLevels.indexOf(target as typeof planningLevels[number]) < planningLevels.indexOf(current as typeof planningLevels[number])) {
      throw new Error('Behaviour Target Level cannot be below Current Level.');
    }
    if (target !== suggestedBehaviourTargetLevel(current as typeof planningLevels[number]) && reason === undefined) {
      throw new Error('A same or higher override needs visible Target justification.');
    }
  }
  return { contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
    ...(current === undefined ? {} : { currentLevel: current as typeof planningLevels[number] }),
    ...(target === undefined ? {} : { targetLevel: target as typeof planningLevels[number] }),
    ...(reason === undefined ? {} : { targetJustification: (reason as string).trim() }) };
};

/** Older rows have none of these fields. Partial or crossed stored fields fail closed. */
export const readBehaviourPlanningLevelsV1 = (fields: Record<string, unknown>): IBehaviourPlanningLevelsV1 | undefined => {
  const version = fields.BehaviourPlanningContractVersion;
  const current = fields.BehaviourCurrentLevelV2;
  const target = fields.BehaviourTargetLevelV2;
  const reason = fields.BehaviourTargetLevelReasonV2;
  const present = [version, current, target, reason].some(value => value !== undefined && value !== null && value !== '');
  if (!present) return undefined;
  return validateBehaviourPlanningLevelsV1({ contractVersion: version,
    ...(current === undefined || current === null || current === '' ? {} : { currentLevel: current }),
    ...(target === undefined || target === null || target === '' ? {} : { targetLevel: target }),
    ...(reason === undefined || reason === null || reason === '' ? {} : { targetJustification: reason }) });
};

export const BEHAVIOUR_V2_FORBIDDEN_FIELDS = Object.freeze([
  'target', 'targetRating', 'q1TargetRating', 'q2TargetRating', 'q3TargetRating', 'q4TargetRating',
  'weight', 'behaviourWeight', 'behaviourItemWeight', 'behaviourCategoryWeight', 'average',
  'rag', 'calculatedRag', 'ragFromTarget', 'rawNormalisedScore', 'normalisedScore',
  'scoredContribution', 'peerRating', 'peerScore', 'peerEffect', 'peerFeedback'
] as const);

export interface IBehaviourV2Inspection {
  valid: boolean;
  errors: readonly string[];
}

const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const exactSet = (actual: readonly unknown[], expected: readonly unknown[]): boolean =>
  actual.length === expected.length && expected.every(value => actual.filter(candidate => candidate === value).length === 1);

const exactRatingOptions = (value: unknown): boolean => Array.isArray(value) && value.length === 3
  && value.every((option, index) => {
    if (!option || typeof option !== 'object' || Array.isArray(option)) return false;
    const rating = option as Record<string, unknown>;
    return exactSet(Object.keys(rating), ['value', 'label', 'displayLabel'])
      && rating.value === index + 1
      && rating.label === BEHAVIOUR_V2_RATING_OPTIONS[index].label
      && rating.displayLabel === BEHAVIOUR_V2_RATING_OPTIONS[index].displayLabel;
  });

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.keys(value as Record<string, unknown>).forEach(key => deepFreeze((value as Record<string, unknown>)[key]));
    Object.freeze(value);
  }
  return value;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const isBehaviourV2Rating = (value: unknown): value is BehaviourV2Rating =>
  value === 1 || value === 2 || value === 3;

export const isBehaviourV2RoleTier = (value: unknown): value is BehaviourV2RoleTier =>
  BEHAVIOUR_V2_ROLE_TIERS.indexOf(value as BehaviourV2RoleTier) >= 0;

export const isBehaviourV2ValueId = (value: unknown): value is BehaviourV2ValueId =>
  BEHAVIOUR_V2_VALUE_IDS.indexOf(value as BehaviourV2ValueId) >= 0;

export const behaviourV2Periods = (cadence: BehaviourV2Cadence): readonly BehaviourV2Period[] =>
  cadence === 'Quarterly' ? BEHAVIOUR_V2_QUARTERLY_PERIODS : BEHAVIOUR_V2_TWICE_YEARLY_PERIODS;

export const inspectPublishedBehaviourFrameworkV2 = (
  set: IBehaviourFrameworkV2PublishedSet
): IBehaviourV2Inspection => {
  const errors: string[] = [];
  if (set.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION) errors.push('The framework version is not KCCC-BEHAVIOUR|v02.');
  if (set.published !== true || set.immutable !== true) errors.push('The v02 framework must be published and immutable.');
  if (!exactRatingOptions(set.ratingOptions)) {
    errors.push('The label-first rating map must be exactly 1 Developing, 2 Effective, 3 Exceptional.');
  }
  if (!Array.isArray(set.values) || set.values.length !== 5
    || !exactSet(set.values.map(value => value.valueId), BEHAVIOUR_V2_VALUE_IDS)) {
    errors.push('The published v02 set must contain exactly one of each stable Value BHV-01 to BHV-05.');
  }
  (set.values || []).forEach(value => {
    if (value.frameworkVersion !== set.frameworkVersion || !isBehaviourV2ValueId(value.valueId)
      || !nonBlank(value.title) || !nonBlank(value.corporateValue)) {
      errors.push(`${String(value.valueId || 'Unknown Value')} has incomplete versioned identity or governed title.`);
    }
    const descriptors = value.descriptors as Record<string, unknown> | undefined;
    const descriptorKeys = descriptors ? Object.keys(descriptors) : [];
    if (!descriptors || !exactSet(descriptorKeys, BEHAVIOUR_V2_ROLE_TIERS)
      || BEHAVIOUR_V2_ROLE_TIERS.some(tier => !nonBlank(descriptors[tier]))) {
      errors.push(`${String(value.valueId || 'Unknown Value')} must have exactly one non-blank descriptor for each governed role tier.`);
    }
  });
  return { valid: errors.length === 0, errors: Array.from(new Set(errors)) };
};

export const assertPublishedBehaviourFrameworkV2 = (
  set: IBehaviourFrameworkV2PublishedSet
): Readonly<IBehaviourFrameworkV2PublishedSet> => {
  const inspection = inspectPublishedBehaviourFrameworkV2(set);
  if (!inspection.valid) throw new Error(`BEHAVIOUR_V2_SET_INVALID: ${inspection.errors.join(' ')}`);
  return deepFreeze(clone(set));
};

export const inspectBehaviourPersonAssignmentV2 = (
  assignment: IBehaviourPersonAssignmentV2
): IBehaviourV2Inspection => {
  const errors: string[] = [];
  if (!nonBlank(assignment.personKey)) errors.push('An explicit person key is required.');
  if (assignment.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION) errors.push('The assignment framework version is invalid.');
  if (!isBehaviourV2RoleTier(assignment.roleTier)) errors.push('The explicit governed role tier is invalid.');
  if (assignment.cadence !== 'Quarterly' && assignment.cadence !== 'TwiceYearly') errors.push('The configured cadence is invalid.');
  const expected = assignment.cadence === 'Quarterly' ? BEHAVIOUR_V2_QUARTERLY_PERIODS
    : assignment.cadence === 'TwiceYearly' ? BEHAVIOUR_V2_TWICE_YEARLY_PERIODS : [];
  if (!Array.isArray(assignment.periodKeys) || !exactSet(assignment.periodKeys, expected)) {
    errors.push('The assignment periods do not match the configured cadence.');
  }
  return { valid: errors.length === 0, errors };
};

export const assertBehaviourPersonAssignmentV2 = (
  assignment: IBehaviourPersonAssignmentV2
): Readonly<IBehaviourPersonAssignmentV2> => {
  const inspection = inspectBehaviourPersonAssignmentV2(assignment);
  if (!inspection.valid) throw new Error(`BEHAVIOUR_V2_ASSIGNMENT_INVALID: ${inspection.errors.join(' ')}`);
  return deepFreeze(clone(assignment));
};

export const createBehaviourAnnualSnapshotV2 = (
  setValue: IBehaviourFrameworkV2PublishedSet,
  assignmentValue: IBehaviourPersonAssignmentV2,
  valueId: BehaviourV2ValueId
): Readonly<IBehaviourAnnualSnapshotV2> => {
  const set = assertPublishedBehaviourFrameworkV2(setValue);
  const assignment = assertBehaviourPersonAssignmentV2(assignmentValue);
  if (assignment.frameworkVersion !== set.frameworkVersion) {
    throw new Error('BEHAVIOUR_V2_SNAPSHOT_INVALID: assignment and published set versions differ.');
  }
  const matches = set.values.filter(value => value.valueId === valueId);
  if (matches.length !== 1) throw new Error('BEHAVIOUR_V2_SNAPSHOT_INVALID: stable Value is missing or ambiguous.');
  const value = matches[0];
  return deepFreeze({
    frameworkVersion: set.frameworkVersion,
    valueId: value.valueId,
    valueTitle: value.title,
    corporateValue: value.corporateValue,
    roleTier: assignment.roleTier,
    descriptor: value.descriptors[assignment.roleTier],
    cadence: assignment.cadence,
    periodKeys: assignment.periodKeys.slice(),
    ratingOptions: set.ratingOptions.map(option => ({ ...option }))
  });
};

export const createBehaviourPeriodSnapshotV2 = (
  annualValue: IBehaviourAnnualSnapshotV2,
  period: BehaviourV2Period
): Readonly<IBehaviourPeriodSnapshotV2> => {
  const annual = deepFreeze(clone(annualValue));
  const cadenceValid = annual.cadence === 'Quarterly' || annual.cadence === 'TwiceYearly';
  if (annual.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION || !isBehaviourV2ValueId(annual.valueId)
    || !isBehaviourV2RoleTier(annual.roleTier) || !nonBlank(annual.valueTitle)
    || !nonBlank(annual.corporateValue) || !nonBlank(annual.descriptor) || !cadenceValid
    || !Array.isArray(annual.periodKeys) || !annual.periodKeys.includes(period)
    || !exactSet(annual.periodKeys, behaviourV2Periods(annual.cadence))
    || !exactRatingOptions(annual.ratingOptions)) {
    throw new Error('BEHAVIOUR_V2_PERIOD_SNAPSHOT_INVALID: the stored annual snapshot is incomplete or crossed.');
  }
  return deepFreeze({ ...clone(annual), period });
};

export const getBehaviourV2RatingDisplay = (value: BehaviourV2Rating | undefined): string =>
  value === undefined ? 'Not assessed' : BEHAVIOUR_V2_RATING_OPTIONS[value - 1].displayLabel;

const ownerKeys: Readonly<Record<BehaviourAssessmentOwnerV2, readonly string[]>> = Object.freeze({
  Employee: ['employeeEvidence', 'employeeAssessment'],
  Manager: ['managerEvidence', 'managerAssessment'],
  Final: ['finalEvidence', 'finalAssessment']
});

export const applyBehaviourAssessmentPatchV2 = (
  currentValue: IBehaviourPeriodAssessmentV2,
  patch: IBehaviourAssessmentPatchV2,
  owner: BehaviourAssessmentOwnerV2
): Readonly<IBehaviourPeriodAssessmentV2> => {
  const changed = Object.keys(patch);
  if (changed.some(key => ownerKeys[owner].indexOf(key) < 0)) {
    throw new Error(`BEHAVIOUR_V2_ASSESSMENT_OWNER_INVALID: ${owner} cannot write another owner's evidence or assessment.`);
  }
  changed.forEach(key => {
    const value = (patch as Record<string, unknown>)[key];
    if (key.endsWith('Assessment') && value !== undefined && !isBehaviourV2Rating(value)) {
      throw new Error('BEHAVIOUR_V2_ASSESSMENT_INVALID: ratings must be 1, 2 or 3; undefined means not assessed.');
    }
    if (key.endsWith('Evidence') && value !== undefined && !nonBlank(value)) {
      throw new Error('BEHAVIOUR_V2_EVIDENCE_INVALID: supplied evidence must contain visible text.');
    }
  });
  return deepFreeze({ ...clone(currentValue), ...clone(patch) });
};

export const assertNoBehaviourV2ScoringFields = (value: unknown, path = 'payload'): void => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoBehaviourV2ScoringFields(item, `${path}[${index}]`));
    return;
  }
  Object.keys(value as Record<string, unknown>).forEach(key => {
    if ((BEHAVIOUR_V2_FORBIDDEN_FIELDS as readonly string[]).indexOf(key) >= 0) {
      throw new Error(`BEHAVIOUR_V2_PROTECTED_FIELD: ${path}.${key} is not part of the v02 contract.`);
    }
    assertNoBehaviourV2ScoringFields((value as Record<string, unknown>)[key], `${path}.${key}`);
  });
};
