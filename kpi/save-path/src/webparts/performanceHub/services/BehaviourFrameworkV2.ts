import type { BehaviourKey, BehaviourRoleLevelCode } from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_KEYS } from '../models/BehaviourWorkplanModels';
import type { IBehaviourCatalogueSourceRow } from './BehaviourLibraryCatalogue';

export const BEHAVIOUR_FRAMEWORK_V2_SCHEMA_VERSION = '2.0';
export const BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY = 'DEMO-DEMO-BEHAVIOUR-FOCUS';
export const BEHAVIOUR_FRAMEWORK_V2_RATINGS = ['Developing', 'Effective', 'Exceptional'] as const;
export const BEHAVIOUR_FRAMEWORK_V2_MANAGER_STATUSES = ['AGREED', 'CHANGES REQUESTED'] as const;
export const BEHAVIOUR_FRAMEWORK_V2_COMMITMENT_PROMPT = 'What will you actually do in your role to demonstrate this Behaviour?';
export const BEHAVIOUR_FRAMEWORK_V2_EVIDENCE_PROMPT = 'What would you, your manager or colleagues expect to see if you are making progress?';
export type BehaviourFrameworkV2Rating = typeof BEHAVIOUR_FRAMEWORK_V2_RATINGS[number];
export type BehaviourFrameworkV2ManagerStatus = typeof BEHAVIOUR_FRAMEWORK_V2_MANAGER_STATUSES[number];
export type BehaviourFrameworkV2Status = 'Draft' | 'Published' | 'Retired';
export type BehaviourFrameworkV2View = 'Draft' | 'Review' | 'History' | 'QuarterlyEmployee' | 'QuarterlyManager';
export type BehaviourFrameworkV2Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface IBehaviourFrameworkV2RoleLevel {
  code: BehaviourRoleLevelCode;
  name: string;
  sortOrder: number;
}

/** Product-owned authority. Caller-supplied display names are never trusted. */
export const BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS: ReadonlyArray<Readonly<IBehaviourFrameworkV2RoleLevel>> = [
  { code: 'L1', name: 'Individual Contributor / Coach', sortOrder: 1 },
  { code: 'L2', name: 'Manager', sortOrder: 2 },
  { code: 'L3', name: 'Senior Manager / Leader', sortOrder: 3 }
];

export interface IBehaviourFrameworkV2Headline {
  behaviourKey: BehaviourKey;
  title: string;
  sortOrder: number;
}

export interface IBehaviourFrameworkV2CatalogueRow {
  targetKey: string;
  behaviourKey: BehaviourKey;
  roleLevelCode: BehaviourRoleLevelCode;
  focusKey: string;
  focusArea: string;
  suggestedTarget: string;
  suggestedMeasure: string;
  suggestedUnit: string;
  suggestedEvidence: string;
  status: 'Published' | 'Retired';
  sortOrder: number;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface IBehaviourFrameworkV2Catalogue {
  catalogueKey: typeof BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY;
  catalogueVersion: string;
  revision: number;
  schemaVersion: typeof BEHAVIOUR_FRAMEWORK_V2_SCHEMA_VERSION;
  status: BehaviourFrameworkV2Status;
  effectiveFrom: string;
  effectiveTo?: string;
  headlineBehaviours: ReadonlyArray<Readonly<IBehaviourFrameworkV2Headline>>;
  roleLevels: ReadonlyArray<Readonly<IBehaviourFrameworkV2RoleLevel>>;
  ratingScale: ReadonlyArray<BehaviourFrameworkV2Rating>;
  // eslint-disable-next-line @rushstack/no-new-null -- null explicitly means no hard maximum in governed JSON.
  selectionGuidance: Readonly<{ recommendedMinimum: 3; recommendedMaximum: 5; hardMaximum: null }>;
  rows: ReadonlyArray<Readonly<IBehaviourFrameworkV2CatalogueRow>>;
}

export interface IBehaviourFrameworkV2CatalogueMetadata {
  catalogueVersion: string;
  revision: number;
  status: BehaviourFrameworkV2Status;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface IBehaviourFocusTargetSelection {
  selectionKey: string;
  source: 'Catalogue' | 'Own';
  catalogueKey: string;
  catalogueVersion: string;
  targetKey?: string;
  behaviourKey: BehaviourKey;
  roleLevelCode: BehaviourRoleLevelCode;
  focusArea: string;
  selectedExampleText?: string;
  commitment: string;
  howWillWeKnow: string;
}

export interface IBehaviourFocusSelectionInspection {
  valid: boolean;
  selectedCount: number;
  guidance: 'BelowGuidance' | 'WithinGuidance' | 'AboveGuidance';
  issues: ReadonlyArray<string>;
}

export interface IBehaviourFocusQuarterEvidence {
  evidenceKey: string;
  selectionKey: string;
  behaviourKey: BehaviourKey;
  quarter: BehaviourFrameworkV2Quarter;
  evidenceText: string;
  recordedAt: string;
  recordedBy: string;
}

export interface IBehaviourHeadlineQuarterAssessment {
  assessmentKey: string;
  behaviourKey: BehaviourKey;
  quarter: BehaviourFrameworkV2Quarter;
  employeeRating?: BehaviourFrameworkV2Rating;
  managerRating?: BehaviourFrameworkV2Rating;
  finalRating?: BehaviourFrameworkV2Rating;
}

export interface IBehaviourManagerReviewEvent {
  reviewKey: string;
  sequence: number;
  selectionKey: string;
  status: BehaviourFrameworkV2ManagerStatus;
  comment?: string;
  actorEmail: string;
  occurredAt: string;
}

export interface IBehaviourFrameworkV2Readback {
  view: BehaviourFrameworkV2View;
  catalogueKey: string;
  catalogueVersion: string;
  selections: ReadonlyArray<Readonly<IBehaviourFocusTargetSelection>>;
  reviews: ReadonlyArray<Readonly<IBehaviourManagerReviewEvent>>;
  evidence: ReadonlyArray<Readonly<IBehaviourFocusQuarterEvidence>>;
  assessments: ReadonlyArray<Readonly<IBehaviourHeadlineQuarterAssessment>>;
}

const clean = (value: string | undefined): string => (value || '').trim();
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const VERSION_PATTERN = /^DEMO-BHV-PD03-\d{4}\.\d{2}-v[1-9]\d*$/;
const TARGET_KEY_PATTERN = /^BHV-0[1-5]-L[1-3]-0[1-9]\d*$/;
const OWN_KEY_PATTERN = /^BHV-0[1-5]-OWN-[A-Z0-9][A-Z0-9-]{5,39}$/;
const QUARTERS: ReadonlyArray<BehaviourFrameworkV2Quarter> = ['Q1', 'Q2', 'Q3', 'Q4'];

const isExactDate = (value: string | undefined): value is string => {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isRoleLevel = (value: unknown): value is BehaviourRoleLevelCode =>
  BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS.some(role => role.code === value);

const isBehaviourKey = (value: unknown): value is BehaviourKey =>
  BEHAVIOUR_KEYS.indexOf(value as BehaviourKey) >= 0;

export const isBehaviourFrameworkV2Rating = (value: unknown): value is BehaviourFrameworkV2Rating =>
  BEHAVIOUR_FRAMEWORK_V2_RATINGS.indexOf(value as BehaviourFrameworkV2Rating) >= 0;

const isQuarter = (value: unknown): value is BehaviourFrameworkV2Quarter =>
  QUARTERS.indexOf(value as BehaviourFrameworkV2Quarter) >= 0;

const cloneSelection = (selection: IBehaviourFocusTargetSelection): IBehaviourFocusTargetSelection => ({ ...selection });
const cloneEvidence = (evidence: IBehaviourFocusQuarterEvidence): IBehaviourFocusQuarterEvidence => ({ ...evidence });
const cloneAssessment = (assessment: IBehaviourHeadlineQuarterAssessment): IBehaviourHeadlineQuarterAssessment => ({ ...assessment });
const cloneReview = (review: IBehaviourManagerReviewEvent): IBehaviourManagerReviewEvent => ({ ...review });

const freezeCatalogue = (catalogue: IBehaviourFrameworkV2Catalogue): IBehaviourFrameworkV2Catalogue => Object.freeze({
  ...catalogue,
  headlineBehaviours: Object.freeze(catalogue.headlineBehaviours.map(row => Object.freeze({ ...row }))),
  roleLevels: Object.freeze(catalogue.roleLevels.map(row => Object.freeze({ ...row }))),
  ratingScale: Object.freeze(catalogue.ratingScale.slice()),
  selectionGuidance: Object.freeze({ ...catalogue.selectionGuidance }),
  rows: Object.freeze(catalogue.rows.map(row => Object.freeze({ ...row })))
});

const rowIssues = (row: IBehaviourFrameworkV2CatalogueRow, index: number): string[] => {
  const issues: string[] = [];
  const prefix = `Catalogue row ${index + 1}`;
  if (!TARGET_KEY_PATTERN.test(row.targetKey) || row.targetKey.slice(0, 6) !== row.behaviourKey
    || row.targetKey.split('-')[2] !== row.roleLevelCode) {
    issues.push(`${prefix} has an invalid or mismatched stable target key.`);
  }
  if (!isBehaviourKey(row.behaviourKey)) issues.push(`${prefix} does not use one of the five headline Behaviour keys.`);
  if (!isRoleLevel(row.roleLevelCode)) issues.push(`${prefix} does not use governed role metadata.`);
  if (!/^BHV-0[1-5]-FOCUS-0[1-5]$/.test(row.focusKey)
    || row.focusKey.slice(0, 6) !== row.behaviourKey) issues.push(`${prefix} has an invalid focus key.`);
  if ([row.focusArea, row.suggestedTarget, row.suggestedMeasure, row.suggestedUnit, row.suggestedEvidence]
    .some(value => !clean(value))) issues.push(`${prefix} has incomplete focus, example or approved authoring-prompt detail.`);
  if (row.status !== 'Published' && row.status !== 'Retired') issues.push(`${prefix} has an invalid effective status.`);
  if (!Number.isInteger(row.sortOrder) || row.sortOrder < 1) issues.push(`${prefix} has an invalid sort order.`);
  if (!isExactDate(row.effectiveFrom)) issues.push(`${prefix} has an invalid Effective From date.`);
  if (row.effectiveTo && !isExactDate(row.effectiveTo)) issues.push(`${prefix} has an invalid Effective To date.`);
  if (row.effectiveTo && row.effectiveTo < row.effectiveFrom) issues.push(`${prefix} has an inverted effective period.`);
  return issues;
};

export const inspectBehaviourFrameworkV2Catalogue = (
  catalogue: IBehaviourFrameworkV2Catalogue
): Readonly<{ valid: boolean; issues: ReadonlyArray<string> }> => {
  const issues: string[] = [];
  if (catalogue.catalogueKey !== BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY) issues.push('Catalogue key is not the governed BT-04 key.');
  if (!VERSION_PATTERN.test(catalogue.catalogueVersion)) issues.push('Catalogue version is invalid.');
  if (!Number.isInteger(catalogue.revision) || catalogue.revision < 1) issues.push('Catalogue revision must be a positive whole number.');
  if (catalogue.schemaVersion !== BEHAVIOUR_FRAMEWORK_V2_SCHEMA_VERSION) issues.push('Catalogue schema version is invalid.');
  if (['Draft', 'Published', 'Retired'].indexOf(catalogue.status) < 0) issues.push('Catalogue status is invalid.');
  if (!isExactDate(catalogue.effectiveFrom)) issues.push('Catalogue Effective From date is invalid.');
  if (catalogue.effectiveTo && !isExactDate(catalogue.effectiveTo)) issues.push('Catalogue Effective To date is invalid.');
  if (catalogue.effectiveTo && catalogue.effectiveTo < catalogue.effectiveFrom) issues.push('Catalogue effective period is inverted.');

  if (catalogue.headlineBehaviours.length !== BEHAVIOUR_KEYS.length
    || catalogue.headlineBehaviours.some((row, index) => row.behaviourKey !== BEHAVIOUR_KEYS[index]
      || row.sortOrder !== index + 1 || !clean(row.title))) {
    issues.push('Catalogue must contain the exact five ordered DEMO headline Behaviours.');
  }
  if (JSON.stringify(catalogue.roleLevels) !== JSON.stringify(BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS)) {
    issues.push('Catalogue role levels do not match the governed L1/L2/L3 authority.');
  }
  if (JSON.stringify(catalogue.ratingScale) !== JSON.stringify(BEHAVIOUR_FRAMEWORK_V2_RATINGS)) {
    issues.push('Catalogue rating scale must be exactly Developing, Effective and Exceptional.');
  }
  if (catalogue.selectionGuidance.recommendedMinimum !== 3
    || catalogue.selectionGuidance.recommendedMaximum !== 5
    || catalogue.selectionGuidance.hardMaximum !== null) {
    issues.push('Selection guidance must recommend 3–5 overall without a hard maximum.');
  }

  const seen = new Set<string>();
  const focusKeys = new Set<string>();
  catalogue.rows.forEach((row, index) => {
    issues.push(...rowIssues(row, index));
    if (seen.has(row.targetKey)) issues.push(`Catalogue target key ${row.targetKey} is duplicated.`);
    seen.add(row.targetKey);
    focusKeys.add(row.focusKey);
  });
  if (catalogue.rows.length === 75 && focusKeys.size !== 25) issues.push('The approved v1 catalogue must preserve exactly 25 focus areas.');
  if (!catalogue.rows.length) issues.push('Catalogue must contain at least one governed example / prompt.');
  return Object.freeze({ valid: issues.length === 0, issues: Object.freeze(Array.from(new Set(issues))) });
};

export const createBehaviourFrameworkV2Catalogue = (
  sourceRows: ReadonlyArray<IBehaviourCatalogueSourceRow>,
  metadata: IBehaviourFrameworkV2CatalogueMetadata
): IBehaviourFrameworkV2Catalogue => {
  const titleByKey = new Map<BehaviourKey, string>();
  sourceRows.forEach(row => {
    const existing = titleByKey.get(row.BehaviourKey);
    if (existing && existing !== clean(row.BehaviourTitle)) throw new Error(`Conflicting headline title for ${row.BehaviourKey}.`);
    titleByKey.set(row.BehaviourKey, clean(row.BehaviourTitle));
  });
  const catalogue: IBehaviourFrameworkV2Catalogue = {
    catalogueKey: BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY,
    catalogueVersion: clean(metadata.catalogueVersion),
    revision: metadata.revision,
    schemaVersion: BEHAVIOUR_FRAMEWORK_V2_SCHEMA_VERSION,
    status: metadata.status,
    effectiveFrom: clean(metadata.effectiveFrom),
    effectiveTo: metadata.effectiveTo ? clean(metadata.effectiveTo) : undefined,
    headlineBehaviours: BEHAVIOUR_KEYS.map((behaviourKey, index) => ({
      behaviourKey,
      title: titleByKey.get(behaviourKey) || '',
      sortOrder: index + 1
    })),
    roleLevels: BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS.map(role => ({ ...role })),
    ratingScale: BEHAVIOUR_FRAMEWORK_V2_RATINGS.slice(),
    selectionGuidance: { recommendedMinimum: 3, recommendedMaximum: 5, hardMaximum: null },
    rows: sourceRows.map(row => ({
      targetKey: clean(row.BehaviourObjectiveKey),
      behaviourKey: row.BehaviourKey,
      roleLevelCode: row.RoleLevelCode,
      focusKey: `${row.BehaviourKey}-FOCUS-${clean(row.BehaviourObjectiveKey).slice(-2)}`,
      focusArea: clean(row.ObjectiveTitle),
      suggestedTarget: clean(row.ObjectiveDescription),
      suggestedMeasure: clean(row.SuggestedMeasure),
      suggestedUnit: clean(row.SuggestedUnit),
      suggestedEvidence: clean(row.SuggestedEvidence),
      status: row.Active ? 'Published' : 'Retired',
      sortOrder: row.SortOrder,
      effectiveFrom: clean(row.EffectiveFrom),
      effectiveTo: row.EffectiveTo ? clean(row.EffectiveTo) : undefined
    }))
  };
  const inspection = inspectBehaviourFrameworkV2Catalogue(catalogue);
  if (!inspection.valid) throw new Error(inspection.issues.join(' '));
  return freezeCatalogue(catalogue);
};

const dateIsEligible = (from: string, to: string | undefined, date: string): boolean =>
  from <= date && (!to || to >= date);

export const getBehaviourFrameworkV2Choices = (
  catalogue: IBehaviourFrameworkV2Catalogue,
  roleLevelCode: BehaviourRoleLevelCode,
  behaviourKey?: BehaviourKey,
  asOf: Date = new Date()
): ReadonlyArray<Readonly<IBehaviourFrameworkV2CatalogueRow>> => {
  const inspection = inspectBehaviourFrameworkV2Catalogue(catalogue);
  if (!inspection.valid) throw new Error(inspection.issues.join(' '));
  if (!isRoleLevel(roleLevelCode)) throw new Error('A governed role level is required.');
  if (behaviourKey !== undefined && !isBehaviourKey(behaviourKey)) throw new Error('A fixed headline Behaviour key is required.');
  const date = asOf.toISOString().slice(0, 10);
  if (catalogue.status !== 'Published' || !dateIsEligible(catalogue.effectiveFrom, catalogue.effectiveTo, date)) return [];
  return Object.freeze(catalogue.rows.filter(row => row.status === 'Published'
    && row.roleLevelCode === roleLevelCode
    && (!behaviourKey || row.behaviourKey === behaviourKey)
    && dateIsEligible(row.effectiveFrom, row.effectiveTo, date))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.targetKey.localeCompare(right.targetKey))
    .map(row => Object.freeze({ ...row })));
};

export const selectBehaviourFrameworkV2Target = (
  catalogue: IBehaviourFrameworkV2Catalogue,
  roleLevelCode: BehaviourRoleLevelCode,
  targetKey: string,
  asOf: Date = new Date(),
  authoring: Readonly<{ commitment: string; howWillWeKnow: string }> = { commitment: '', howWillWeKnow: '' }
): Readonly<IBehaviourFocusTargetSelection> => {
  const row = getBehaviourFrameworkV2Choices(catalogue, roleLevelCode, undefined, asOf)
    .find(candidate => candidate.targetKey === targetKey);
  if (!row) throw new Error('The example is not an effective choice for the governed role level.');
  return Object.freeze({
    selectionKey: row.targetKey,
    source: 'Catalogue',
    catalogueKey: catalogue.catalogueKey,
    catalogueVersion: catalogue.catalogueVersion,
    targetKey: row.targetKey,
    behaviourKey: row.behaviourKey,
    roleLevelCode: row.roleLevelCode,
    focusArea: row.focusArea,
    selectedExampleText: row.suggestedTarget,
    commitment: authoring.commitment,
    howWillWeKnow: authoring.howWillWeKnow
  });
};

export const createOwnBehaviourFrameworkV2Target = (input: Readonly<{
  selectionKey: string;
  behaviourKey: BehaviourKey;
  roleLevelCode: BehaviourRoleLevelCode;
  commitment: string;
  howWillWeKnow: string;
}>): Readonly<IBehaviourFocusTargetSelection> => {
  if (!isBehaviourKey(input.behaviourKey) || !isRoleLevel(input.roleLevelCode)
    || !OWN_KEY_PATTERN.test(clean(input.selectionKey))
    || clean(input.selectionKey).slice(0, 6) !== input.behaviourKey
    || [input.commitment, input.howWillWeKnow].some(value => !clean(value))) {
    throw new Error('Own Behaviour commitment needs a stable Behaviour key, governed role, MY COMMITMENT and HOW WILL WE KNOW.');
  }
  return Object.freeze({
    selectionKey: clean(input.selectionKey),
    source: 'Own',
    catalogueKey: BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY,
    catalogueVersion: 'OWN',
    behaviourKey: input.behaviourKey,
    roleLevelCode: input.roleLevelCode,
    focusArea: 'MY COMMITMENT',
    commitment: clean(input.commitment),
    howWillWeKnow: clean(input.howWillWeKnow)
  });
};

export const inspectBehaviourFrameworkV2Selections = (
  selections: ReadonlyArray<IBehaviourFocusTargetSelection>
): IBehaviourFocusSelectionInspection => {
  const issues: string[] = [];
  const seen = new Set<string>();
  selections.forEach((selection, index) => {
    if (seen.has(selection.selectionKey)) issues.push(`Selection ${selection.selectionKey} is duplicated.`);
    seen.add(selection.selectionKey);
    if (!isBehaviourKey(selection.behaviourKey) || !isRoleLevel(selection.roleLevelCode)) {
      issues.push(`Selection ${index + 1} has invalid Behaviour or role metadata.`);
    }
    if ([selection.selectionKey, selection.focusArea, selection.commitment, selection.howWillWeKnow]
      .some(value => !clean(value))) issues.push(`Selection ${index + 1} must complete MY COMMITMENT and HOW WILL WE KNOW.`);
    if (selection.source === 'Catalogue') {
      if (!selection.targetKey || selection.selectionKey !== selection.targetKey
        || !TARGET_KEY_PATTERN.test(selection.targetKey)
        || !VERSION_PATTERN.test(selection.catalogueVersion) || !clean(selection.selectedExampleText)) {
        issues.push(`Selection ${index + 1} has invalid catalogue identity or example snapshot.`);
      }
    } else if (selection.source === 'Own') {
      if (selection.targetKey !== undefined || !OWN_KEY_PATTERN.test(selection.selectionKey)
        || selection.catalogueVersion !== 'OWN' || selection.selectedExampleText !== undefined) {
        issues.push(`Selection ${index + 1} has invalid own-commitment identity.`);
      }
    } else issues.push(`Selection ${index + 1} has an invalid source.`);
  });
  const selectedCount = selections.length;
  return Object.freeze({
    valid: issues.length === 0,
    selectedCount,
    guidance: selectedCount < 3 ? 'BelowGuidance' : selectedCount > 5 ? 'AboveGuidance' : 'WithinGuidance',
    issues: Object.freeze(Array.from(new Set(issues)))
  });
};

export const inspectBehaviourFrameworkV2Reviews = (
  reviews: ReadonlyArray<IBehaviourManagerReviewEvent>,
  selections: ReadonlyArray<IBehaviourFocusTargetSelection>
): ReadonlyArray<string> => {
  const issues: string[] = [];
  const selectionKeys = new Set(selections.map(selection => selection.selectionKey));
  const reviewKeys = new Set<string>();
  reviews.forEach((review, index) => {
    if (reviewKeys.has(review.reviewKey)) issues.push(`Manager review key ${review.reviewKey} is duplicated.`);
    reviewKeys.add(review.reviewKey);
    if (!clean(review.reviewKey) || !Number.isInteger(review.sequence) || review.sequence !== index + 1
      || !selectionKeys.has(review.selectionKey)
      || BEHAVIOUR_FRAMEWORK_V2_MANAGER_STATUSES.indexOf(review.status) < 0
      || !clean(review.actorEmail) || !clean(review.occurredAt)
      || Number.isNaN(new Date(review.occurredAt).getTime())) {
      issues.push(`Manager review ${index + 1} has invalid identity, sequence, status or audit metadata.`);
    }
    if (review.status === 'CHANGES REQUESTED' && !clean(review.comment)) {
      issues.push(`Manager review ${index + 1} needs a comment when changes are requested.`);
    }
  });
  return Object.freeze(Array.from(new Set(issues)));
};

export const recordBehaviourFrameworkV2ManagerReview = (
  reviews: ReadonlyArray<IBehaviourManagerReviewEvent>,
  selections: ReadonlyArray<IBehaviourFocusTargetSelection>,
  input: Readonly<Omit<IBehaviourManagerReviewEvent, 'sequence'>>
): ReadonlyArray<Readonly<IBehaviourManagerReviewEvent>> => {
  const next = [...reviews.map(cloneReview), { ...input, sequence: reviews.length + 1 }];
  const issues = inspectBehaviourFrameworkV2Reviews(next, selections);
  if (issues.length) throw new Error(issues.join(' '));
  return Object.freeze(next.map(review => Object.freeze(review)));
};

export const inspectBehaviourFrameworkV2Evidence = (
  evidence: ReadonlyArray<IBehaviourFocusQuarterEvidence>,
  selections: ReadonlyArray<IBehaviourFocusTargetSelection>
): ReadonlyArray<string> => {
  const issues: string[] = [];
  const selectionByKey = new Map(selections.map(selection => [selection.selectionKey, selection]));
  const seen = new Set<string>();
  evidence.forEach((row, index) => {
    const selection = selectionByKey.get(row.selectionKey);
    if (seen.has(row.evidenceKey)) issues.push(`Quarter evidence key ${row.evidenceKey} is duplicated.`);
    seen.add(row.evidenceKey);
    if (!clean(row.evidenceKey) || !selection || selection.behaviourKey !== row.behaviourKey
      || !isQuarter(row.quarter) || !clean(row.evidenceText) || !clean(row.recordedAt) || !clean(row.recordedBy)) {
      issues.push(`Quarter evidence ${index + 1} is not bound to an exact selected Behaviour commitment.`);
    }
  });
  return Object.freeze(Array.from(new Set(issues)));
};

export const inspectBehaviourFrameworkV2Assessments = (
  assessments: ReadonlyArray<IBehaviourHeadlineQuarterAssessment>
): ReadonlyArray<string> => {
  const issues: string[] = [];
  const seen = new Set<string>();
  assessments.forEach((row, index) => {
    if (seen.has(row.assessmentKey)) issues.push(`Headline assessment key ${row.assessmentKey} is duplicated.`);
    seen.add(row.assessmentKey);
    if (!clean(row.assessmentKey) || !isBehaviourKey(row.behaviourKey) || !isQuarter(row.quarter)) {
      issues.push(`Headline assessment ${index + 1} has invalid identity.`);
    }
    [row.employeeRating, row.managerRating, row.finalRating].forEach(rating => {
      if (rating !== undefined && !isBehaviourFrameworkV2Rating(rating)) {
        issues.push(`Headline assessment ${index + 1} contains a rating outside Developing, Effective or Exceptional.`);
      }
    });
  });
  return Object.freeze(Array.from(new Set(issues)));
};

export const buildBehaviourFrameworkV2Readback = (input: Readonly<{
  view: BehaviourFrameworkV2View;
  catalogueKey: string;
  catalogueVersion: string;
  selections: ReadonlyArray<IBehaviourFocusTargetSelection>;
  reviews?: ReadonlyArray<IBehaviourManagerReviewEvent>;
  evidence?: ReadonlyArray<IBehaviourFocusQuarterEvidence>;
  assessments?: ReadonlyArray<IBehaviourHeadlineQuarterAssessment>;
}>): Readonly<IBehaviourFrameworkV2Readback> => {
  const selectionInspection = inspectBehaviourFrameworkV2Selections(input.selections);
  const reviews = input.reviews || [];
  const evidence = input.evidence || [];
  const assessments = input.assessments || [];
  const issues = [
    ...selectionInspection.issues,
    ...inspectBehaviourFrameworkV2Reviews(reviews, input.selections),
    ...inspectBehaviourFrameworkV2Evidence(evidence, input.selections),
    ...inspectBehaviourFrameworkV2Assessments(assessments)
  ];
  if (!clean(input.catalogueKey) || !clean(input.catalogueVersion)) issues.push('Readback needs catalogue identity.');
  if (issues.length) throw new Error(Array.from(new Set(issues)).join(' '));
  return Object.freeze({
    view: input.view,
    catalogueKey: clean(input.catalogueKey),
    catalogueVersion: clean(input.catalogueVersion),
    selections: Object.freeze(input.selections.map(row => Object.freeze(cloneSelection(row)))),
    reviews: Object.freeze(reviews.map(row => Object.freeze(cloneReview(row)))),
    evidence: Object.freeze(evidence.map(row => Object.freeze(cloneEvidence(row)))),
    assessments: Object.freeze(assessments.map(row => Object.freeze(cloneAssessment(row))))
  });
};
