import {
  BEHAVIOUR_FRAMEWORK_V2_VERSION,
  BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourV2Period,
  type BehaviourV2Rating,
  type BehaviourV2RatingLabel
} from '../models/BehaviourFrameworkV2Models';
import type {
  IQuarterBehaviourHeadlineDistribution,
  IQuarterBehaviourMovementInput,
  IQuarterBehaviourObservation,
  IQuarterDeliveryReadResult,
  IQuarterEvidenceReference,
  IQuarterManagerCompositionInput,
  IQuarterPerformanceReadProjection,
  IQuarterReview,
  IQuarterReviewItem,
  QuarterBehaviourAssessmentLane
} from '../models/QuarterlyModels';
import { createBehaviourPeriodSnapshotV2 } from './BehaviourFrameworkV2Policy';
import { QUARTER_BEHAVIOUR_TARGET_FIELDS, materialiseQuarterBehaviourTarget } from './QuarterBehaviourTargetSnapshot';
import { assertQuarterImpactAnnualSnapshot } from './QuarterImpactSnapshot';
import { assertQuarterReviewItemWriteBoundary } from './QuarterReviewAuthorisation';
import {
  assertQuarterlyExactKeys,
  materializeQuarterlyData,
  quarterlyOwnDataValue
} from './QuarterlyTrustBoundary';

export interface IQuarterPerformanceReadSource {
  review: IQuarterReview;
  items: IQuarterReviewItem[];
  evidence: IQuarterEvidenceReference[];
}

const ISSUED_PROJECTIONS = new WeakSet<object>();

const SOURCE_KEYS = ['review', 'items', 'evidence'] as const;
const REVIEW_KEYS = [
  'id', 'etag', 'quarterReviewKey', 'workplanKey', 'personKey', 'employeeDisplayName', 'employeeEmail',
  'performanceYear', 'quarter', 'managerPersonKey', 'managerDisplayName', 'managerEmail',
  'coreCategoryWeightSnapshot', 'personalCategoryWeightSnapshot', 'behaviourCategoryWeightSnapshot',
  'workplanApprovalCorrelationKey', 'state', 'accessState', 'transitionStatus', 'transitionCorrelationKey',
  'employeeSubmissionComment', 'submittedAt', 'submittedByEmail', 'managerDecisionComment', 'approvedAt',
  'approvedByEmail', 'lockedAt', 'lockedByEmail', 'rowVersionToken', 'behaviourFrameworkVersionV2',
  'behaviourRoleTierV2', 'behaviourCadenceV2', 'submissionSnapshot', 'overallDeliveryWeightConfigurationSnapshot'
] as const;
const ITEM_KEYS = [
  'id', 'etag', 'quarterReviewItemKey', 'quarterReviewKey', 'workplanItemKey', 'workplanKey', 'personKey',
  'performanceYear', 'quarter', 'itemType', 'reportingStream', 'kpiId', 'kpiVersionKey', 'targetVersionKey',
  'wording', 'itemDescription', 'measure', 'pillar', 'workstream', 'ownerEmail', 'unitLabel', 'metricType',
  'scoringDirection', 'percentageSourceScale', 'baselineValue', 'strategyTarget', 'yearEndTarget',
  'yearEndTargetValueSnapshot', 'yearEndTargetTextSnapshot', 'quarterTargetValue', 'quarterTargetText',
  'previousQuarterActualValue', 'previousQuarterActualText', 'employeeActualValue', 'employeeActualText',
  'progressPct', 'scoredProgressPct', 'calculatedRag', 'calculationRuleVersion', 'scoringMessage', 'statusUpdate',
  'contextMitigation', 'quarterEndForecastValue', 'quarterEndForecastText', 'evidenceCount', 'evidenceRequired',
  'recovery', 'behaviourPrompt', 'behaviourAssessmentGuidance', 'behaviourId', 'behaviourVersionKey',
  'behaviourTitle', 'behaviourObjectiveKey', 'behaviourObjectiveSource', 'behaviourObjectiveTitle',
  'behaviourObjectiveDescription', 'behaviourEvidenceDefinition', 'behaviourTargetRating',
  'employeeBehaviourRating', 'managerBehaviourRating', 'finalBehaviourRating', 'behaviourReflection',
  'behaviourExamples', 'behaviourSnapshotV2', 'employeeBehaviourEvidenceV2', 'employeeBehaviourAssessmentV2',
  'managerBehaviourEvidenceV2', 'managerBehaviourAssessmentV2', 'finalBehaviourEvidenceV2',
  'finalBehaviourAssessmentV2', 'managerBehaviourAssessment', 'managerComment', 'managerOverride',
  'finalApprovedRag', 'contributionWeightSnapshot', 'workplanItemWeightSnapshot',
  'behaviourAnnualCurrentLevelV2', ...QUARTER_BEHAVIOUR_TARGET_FIELDS,
  'impactAnnualDefinitionSnapshot', 'behaviourCommitmentSnapshotsV1', 'managerApproved', 'locked'
] as const;
const EVIDENCE_KEYS = [
  'evidenceKey', 'kind', 'personKey', 'workplanKey', 'workplanItemKey', 'quarterReviewKey',
  'quarterReviewItemKey', 'performanceYear', 'quarter', 'kpiId', 'description', 'url',
  'serverRelativeFileUrl', 'status'
] as const;
const RECOVERY_KEYS = [
  'route', 'action', 'ownerPersonKey', 'dueDate', 'nextReviewDate', 'status', 'expectedReturnToGreenDate',
  'expectedReducedOutcome', 'proposedRevisedTarget', 'proposedRevisedDate', 'reforecastReason',
  'reforecastApprovalStatus', 'dependencyOrDecision', 'escalatedTo', 'targetDecisionDate'
] as const;
const MANAGER_OVERRIDE_KEYS = ['rag', 'reason', 'actorPersonKey', 'actorEmail', 'overriddenAt'] as const;
const IMPACT_DEFINITION_KEYS = [
  'sourceWorkplanItemKey', 'wording', 'intendedOutcome', 'measure', 'unitLabel', 'metricType',
  'scoringDirection', 'percentageSourceScale', 'baselineValue', 'yearEndTargetValue', 'yearEndTargetText',
  'quarterTargetValue', 'quarterTargetText', 'workplanItemWeight', 'classification'
] as const;
const IMPACT_CLASSIFICATION_KEYS = ['strategicPillar', 'businessContributionArea'] as const;
const IMPACT_SELECTION_KEYS = [
  'key', 'label', 'source', 'sourceReference', 'taxonomyId', 'taxonomyVersion', 'taxonomyEtag', 'taxonomyApprovalReference'
] as const;
const BEHAVIOUR_SNAPSHOT_KEYS = [
  'frameworkVersion', 'valueId', 'valueTitle', 'corporateValue', 'roleTier', 'descriptor', 'cadence',
  'periodKeys', 'ratingOptions', 'period'
] as const;
const RATING_OPTION_KEYS = ['value', 'label', 'displayLabel'] as const;
const COMMITMENT_KEYS = [
  'selectionKey', 'catalogueIdentity', 'headlineId', 'roleTier', 'focusAreaKey', 'focusAreaTitle',
  'selectionPath', 'suggestedTargetKey', 'targetTextSnapshot', 'myCommitment', 'howWillWeKnow',
  'managerDecision', 'managerDecisionByPersonKey', 'managerDecisionAt', 'managerDecisionComment',
  'retiredAtSnapshot'
] as const;
const CATALOGUE_IDENTITY_KEYS = [
  'decisionReference', 'catalogueVersion', 'contentHash', 'sourceReference', 'effectiveFrom'
] as const;

const periodOrder: Readonly<Record<BehaviourV2Period, number>> = Object.freeze({
  Q1: 1, Q2: 2, Q3: 3, Q4: 4, H1: 1, H2: 2
});

const deepFreezeCopy = <T>(value: T): Readonly<T> => {
  if (value === null || typeof value !== 'object') return value as Readonly<T>;
  if (Array.isArray(value)) return Object.freeze(value.map(item => deepFreezeCopy(item))) as unknown as Readonly<T>;
  const copy = Object.create(null) as Record<string, unknown>;
  Object.keys(value as Record<string, unknown>).forEach(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || Object.prototype.hasOwnProperty.call(descriptor, 'get')
      || Object.prototype.hasOwnProperty.call(descriptor, 'set')) {
      throw new Error('Quarter projection copy accepts own data properties only.');
    }
    Object.defineProperty(copy, key, {
      value: deepFreezeCopy(descriptor.value),
      enumerable: true,
      configurable: false,
      writable: false
    });
  });
  return Object.freeze(copy) as Readonly<T>;
};

const assertNestedItemShapes = (item: Readonly<IQuarterReviewItem>, path: string): void => {
  assertQuarterlyExactKeys(item, ITEM_KEYS, path, [
    'id', 'etag', 'quarterReviewItemKey', 'quarterReviewKey', 'workplanItemKey', 'workplanKey', 'personKey',
    'performanceYear', 'quarter', 'itemType', 'wording', 'calculatedRag', 'evidenceCount', 'managerApproved', 'locked'
  ]);
  const recovery = quarterlyOwnDataValue<IQuarterReviewItem['recovery']>(item, 'recovery', path);
  const managerOverride = quarterlyOwnDataValue<IQuarterReviewItem['managerOverride']>(item, 'managerOverride', path);
  if (recovery) assertQuarterlyExactKeys(recovery, RECOVERY_KEYS, `${path}.recovery`);
  if (managerOverride) assertQuarterlyExactKeys(managerOverride, MANAGER_OVERRIDE_KEYS, `${path}.managerOverride`);
  const definition = item.impactAnnualDefinitionSnapshot;
  if (definition) {
    assertQuarterlyExactKeys(definition, IMPACT_DEFINITION_KEYS, `${path}.impactAnnualDefinitionSnapshot`);
    if (definition.classification) {
      assertQuarterlyExactKeys(definition.classification, IMPACT_CLASSIFICATION_KEYS, `${path}.impactAnnualDefinitionSnapshot.classification`);
      if (definition.classification.strategicPillar) {
        assertQuarterlyExactKeys(definition.classification.strategicPillar, IMPACT_SELECTION_KEYS,
          `${path}.impactAnnualDefinitionSnapshot.classification.strategicPillar`);
      }
      if (definition.classification.businessContributionArea) {
        assertQuarterlyExactKeys(definition.classification.businessContributionArea, IMPACT_SELECTION_KEYS,
          `${path}.impactAnnualDefinitionSnapshot.classification.businessContributionArea`);
      }
    }
  }
  const behaviourSnapshot = item.behaviourSnapshotV2;
  if (behaviourSnapshot) {
    assertQuarterlyExactKeys(behaviourSnapshot, BEHAVIOUR_SNAPSHOT_KEYS, `${path}.behaviourSnapshotV2`);
    behaviourSnapshot.ratingOptions.forEach((option, index) =>
      assertQuarterlyExactKeys(option, RATING_OPTION_KEYS, `${path}.behaviourSnapshotV2.ratingOptions[${index}]`));
  }
  item.behaviourCommitmentSnapshotsV1?.forEach((commitment, index) => {
    const commitmentPath = `${path}.behaviourCommitmentSnapshotsV1[${index}]`;
    assertQuarterlyExactKeys(commitment, COMMITMENT_KEYS, commitmentPath);
    assertQuarterlyExactKeys(commitment.catalogueIdentity, CATALOGUE_IDENTITY_KEYS, `${commitmentPath}.catalogueIdentity`);
  });
};

const materializeReadSources = (
  sources: IQuarterPerformanceReadSource[]
): ReadonlyArray<IQuarterPerformanceReadSource> => {
  const snapshot = materializeQuarterlyData(sources, 'Quarter read sources');
  snapshot.forEach((source, sourceIndex) => {
    const sourcePath = `Quarter read sources[${sourceIndex}]`;
    assertQuarterlyExactKeys(source, SOURCE_KEYS, sourcePath, SOURCE_KEYS);
    assertQuarterlyExactKeys(source.review, REVIEW_KEYS, `${sourcePath}.review`, [
      'id', 'etag', 'quarterReviewKey', 'workplanKey', 'personKey', 'employeeDisplayName', 'employeeEmail',
      'performanceYear', 'quarter', 'managerPersonKey', 'managerDisplayName', 'managerEmail', 'state', 'accessState',
      'transitionStatus', 'rowVersionToken'
    ]);
    source.items.forEach((item, itemIndex) => assertNestedItemShapes(item, `${sourcePath}.items[${itemIndex}]`));
    source.evidence.forEach((evidence, evidenceIndex) => assertQuarterlyExactKeys(
      evidence,
      EVIDENCE_KEYS,
      `${sourcePath}.evidence[${evidenceIndex}]`,
      ['evidenceKey', 'kind', 'personKey', 'workplanKey', 'workplanItemKey', 'quarterReviewKey',
        'quarterReviewItemKey', 'performanceYear', 'quarter', 'description', 'status']
    ));
  });
  return snapshot as unknown as ReadonlyArray<IQuarterPerformanceReadSource>;
};

const canonicalProjectionValue = (value: unknown, active = new Set<object>()): string => {
  if (value === undefined) return 'u';
  if (value === null) return 'n';
  if (typeof value === 'string') return `s${JSON.stringify(value)}`;
  if (typeof value === 'boolean') return value ? 'b1' : 'b0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Quarter projection identity rejects non-finite numbers.');
    return `d${Object.is(value, -0) ? '0' : JSON.stringify(value)}`;
  }
  if (typeof value !== 'object' || active.has(value)) {
    throw new Error('Quarter projection identity accepts acyclic JSON-compatible values only.');
  }
  active.add(value);
  if (Array.isArray(value)) {
    const result = `a[${value.map(item => canonicalProjectionValue(item, active)).join(',')}]`;
    active.delete(value);
    return result;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    active.delete(value);
    throw new Error('Quarter projection identity accepts plain data objects only.');
  }
  const source = value as Record<string, unknown>;
  const result = `o{${Object.keys(source).sort().map(key =>
    `${JSON.stringify(key)}:${canonicalProjectionValue(source[key], active)}`).join(',')}}`;
  active.delete(value);
  return result;
};

const utf8 = (value: string): number[] => {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
        index += 1;
      }
    }
    if (code <= 0x7f) bytes.push(code);
    else if (code <= 0x7ff) bytes.push(0xc0 | code >>> 6, 0x80 | code & 0x3f);
    else if (code <= 0xffff) bytes.push(0xe0 | code >>> 12, 0x80 | code >>> 6 & 0x3f, 0x80 | code & 0x3f);
    else bytes.push(0xf0 | code >>> 18, 0x80 | code >>> 12 & 0x3f, 0x80 | code >>> 6 & 0x3f, 0x80 | code & 0x3f);
  }
  return bytes;
};

const rotateRight = (value: number, count: number): number => value >>> count | value << 32 - count;
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const sha256Text = (value: string): string => {
  const bytes = utf8(value);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push(high >>> shift & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push(low >>> shift & 0xff);
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] = (bytes[start] << 24 | bytes[start + 1] << 16 | bytes[start + 2] << 8 | bytes[start + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ words[index - 15] >>> 3;
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ words[index - 2] >>> 10;
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = e & f ^ ~e & g;
      const temp1 = (h + s1 + choose + SHA256_K[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = a & b ^ a & c ^ b & c;
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return state.map(word => word.toString(16).padStart(8, '0')).join('').toUpperCase();
};

const projectionIdentityForSnapshot = (
  projection: Readonly<IQuarterPerformanceReadProjection>
): string => sha256Text(canonicalProjectionValue({
  projectionVersion: projection.projectionVersion,
  performanceYear: projection.performanceYear,
  ...(projection.overallDeliveryWeightConfigurations ? { overallDeliveryWeightConfigurations: projection.overallDeliveryWeightConfigurations } : {}),
  core: projection.core,
  impact: projection.impact,
  behaviourObservations: projection.behaviourObservations,
  behaviourDistributions: projection.behaviourDistributions,
  behaviourMovementInputs: projection.behaviourMovementInputs,
  managerCompositionInputs: projection.managerCompositionInputs.map(input => ({
    quarterReviewKey: input.quarterReviewKey,
    personKey: input.personKey,
    performanceYear: input.performanceYear,
    quarter: input.quarter,
    managerPersonKey: input.managerPersonKey,
    managerCommentary: input.managerCommentary,
    approvedAt: input.approvedAt,
    lockedAt: input.lockedAt,
    itemActions: input.itemActions
  }))
}));

export const assertIssuedQuarterPerformanceReadProjection = (
  candidate: Readonly<IQuarterPerformanceReadProjection>
): Readonly<IQuarterPerformanceReadProjection> => {
  if (candidate === null || typeof candidate !== 'object' || !ISSUED_PROJECTIONS.has(candidate as object)) {
    throw new Error('Quarterly consumer requires an internally issued immutable read projection.');
  }
  return candidate;
};

/** Identity inspection is retained for diagnostics, but it cannot issue or
 * authenticate projections. Only the module-private issuance registry can. */
export const quarterProjectionIdentityFor = (
  projection: Readonly<IQuarterPerformanceReadProjection>
): string => assertIssuedQuarterPerformanceReadProjection(projection).projectionIdentity;

const ratingLabel = (value: BehaviourV2Rating | undefined, label: string): BehaviourV2RatingLabel | undefined => {
  if (value === undefined) return undefined;
  if (value === 1) return 'Developing';
  if (value === 2) return 'Effective';
  if (value === 3) return 'Exceptional';
  throw new Error(`${label} must be Developing, Effective or Exceptional.`);
};

interface IMutableBehaviourRatingCardinality {
  Developing: number;
  Effective: number;
  Exceptional: number;
  unassessed: number;
  total: number;
}

const emptyCardinality = (): IMutableBehaviourRatingCardinality => ({
  Developing: 0, Effective: 0, Exceptional: 0, unassessed: 0, total: 0
});

const addRating = (
  cardinality: IMutableBehaviourRatingCardinality,
  rating: BehaviourV2RatingLabel | undefined
): void => {
  cardinality.total += 1;
  if (rating) cardinality[rating] += 1;
  else cardinality.unassessed += 1;
};

const evidenceForItem = (
  review: IQuarterReview,
  item: IQuarterReviewItem,
  evidence: IQuarterEvidenceReference[]
): ReadonlyArray<Readonly<IQuarterEvidenceReference>> => Object.freeze(evidence
  .filter(reference => reference.quarterReviewKey === review.quarterReviewKey
    && reference.quarterReviewItemKey === item.quarterReviewItemKey)
  .map(reference => deepFreezeCopy(reference))
  .sort((left, right) => left.evidenceKey.localeCompare(right.evidenceKey)));

const assertSourceEvidence = (source: IQuarterPerformanceReadSource): void => {
  const itemKeys = new Set(source.items.map(item => item.quarterReviewItemKey));
  const relevant = source.evidence.filter(reference => reference.quarterReviewKey === source.review.quarterReviewKey);
  if (new Set(relevant.map(reference => reference.evidenceKey)).size !== relevant.length) {
    throw new Error('Quarter read source contains duplicate evidence keys.');
  }
  relevant.forEach(reference => {
    if (reference.workplanKey !== source.review.workplanKey
      || reference.personKey !== source.review.personKey
      || reference.performanceYear !== source.review.performanceYear
      || reference.quarter !== source.review.quarter
      || !itemKeys.has(reference.quarterReviewItemKey)) {
      throw new Error('Quarter read evidence is crossed outside its review or item.');
    }
  });
};

const assertBehaviourProjectionItem = (item: IQuarterReviewItem): void => {
  const snapshot = item.behaviourSnapshotV2;
  if (item.reportingStream !== 'Behaviour' || !snapshot
    || snapshot.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION
    || BEHAVIOUR_V2_VALUE_IDS.indexOf(snapshot.valueId) < 0
    || item.behaviourId !== snapshot.valueId) {
    throw new Error('Behaviour projection requires one approved headline Behaviour snapshot.');
  }
  createBehaviourPeriodSnapshotV2(snapshot, snapshot.period);
  if (item.calculatedRag !== 'NotRated'
    || item.progressPct !== undefined
    || item.scoredProgressPct !== undefined
    || item.finalApprovedRag !== undefined
    || quarterlyOwnDataValue<IQuarterReviewItem['managerOverride']>(item, 'managerOverride', 'Behaviour projection item') !== undefined
    || item.workplanItemWeightSnapshot !== undefined
    || item.contributionWeightSnapshot !== undefined) {
    throw new Error('Behaviour projection rejects RAG, weight, score, average or override content.');
  }
};

const observationFor = (
  source: IQuarterPerformanceReadSource,
  item: IQuarterReviewItem
): IQuarterBehaviourObservation => {
  assertBehaviourProjectionItem(item);
  const snapshot = item.behaviourSnapshotV2!;
  const expectedPeriod = snapshot.cadence === 'Quarterly' ? source.review.quarter
    : source.review.quarter === 'Q1' || source.review.quarter === 'Q2' ? 'H1' : 'H2';
  if (snapshot.period !== expectedPeriod) {
    throw new Error('Behaviour read period does not match its exact quarter and configured cadence.');
  }
  const annualCurrent = item.behaviourAnnualCurrentLevelV2;
  if (annualCurrent !== undefined && !['Developing', 'Effective', 'Exceptional'].includes(annualCurrent)) {
    throw new Error('Annual Behaviour Current must be a categorical planning baseline.');
  }
  const annualTarget = materialiseQuarterBehaviourTarget(item);
  if (annualTarget && annualTarget.behaviourAnnualTargetSourceApprovalKeyV2 !== source.review.workplanApprovalCorrelationKey) {
    throw new Error('Annual Behaviour Target approval does not match the quarter annual approval context.');
  }
  return {
    behaviourAnnualCurrentLevelV2: annualCurrent,
    ...annualTarget,
    quarterReviewKey: source.review.quarterReviewKey,
    reviewState: source.review.state,
    personKey: source.review.personKey,
    performanceYear: source.review.performanceYear,
    period: snapshot.period,
    headlineId: snapshot.valueId,
    headlineTitle: snapshot.valueTitle,
    frameworkVersion: snapshot.frameworkVersion,
    employeeRating: ratingLabel(item.employeeBehaviourAssessmentV2, 'Employee Behaviour assessment'),
    managerRating: ratingLabel(item.managerBehaviourAssessmentV2, 'Manager Behaviour assessment'),
    finalRating: ratingLabel(item.finalBehaviourAssessmentV2, 'Final Behaviour assessment'),
    employeeEvidence: item.employeeBehaviourEvidenceV2,
    managerEvidence: item.managerBehaviourEvidenceV2,
    finalEvidence: item.finalBehaviourEvidenceV2,
    selectedCommitment: item.quarterTargetText,
    selectedCommitments: item.behaviourCommitmentSnapshotsV1,
    supportingEvidence: evidenceForItem(source.review, item, source.evidence)
  };
};

const distributionsFor = (
  observations: ReadonlyArray<IQuarterBehaviourObservation>
): ReadonlyArray<Readonly<IQuarterBehaviourHeadlineDistribution>> => {
  const periods = Array.from(new Set(observations.map(observation => observation.period)))
    .sort((left, right) => periodOrder[left] - periodOrder[right] || left.localeCompare(right));
  const distributions: IQuarterBehaviourHeadlineDistribution[] = [];
  periods.forEach(period => BEHAVIOUR_V2_VALUE_IDS.forEach(headlineId => {
    const matches = observations.filter(observation => observation.period === period && observation.headlineId === headlineId);
    const titles = Array.from(new Set(matches.map(observation => observation.headlineTitle)));
    if (titles.length > 1) throw new Error('One Behaviour headline has conflicting stored titles in the same period.');
    const employee = emptyCardinality();
    const manager = emptyCardinality();
    const final = emptyCardinality();
    matches.forEach(observation => {
      addRating(employee, observation.employeeRating);
      addRating(manager, observation.managerRating);
      addRating(final, observation.finalRating);
    });
    distributions.push({ period, headlineId, headlineTitle: titles[0], employee, manager, final });
  }));
  return Object.freeze(distributions.map(distribution => deepFreezeCopy(distribution)));
};

const laneRating = (
  observation: IQuarterBehaviourObservation,
  lane: QuarterBehaviourAssessmentLane
): BehaviourV2RatingLabel | undefined => lane === 'Employee'
  ? observation.employeeRating
  : lane === 'Manager' ? observation.managerRating : observation.finalRating;

const sameCadence = (left: BehaviourV2Period, right: BehaviourV2Period): boolean =>
  (left.startsWith('Q') && right.startsWith('Q')) || (left.startsWith('H') && right.startsWith('H'));

const movementInputsFor = (
  observations: ReadonlyArray<IQuarterBehaviourObservation>
): ReadonlyArray<Readonly<IQuarterBehaviourMovementInput>> => {
  const grouped = new Map<string, IQuarterBehaviourObservation[]>();
  observations.forEach(observation => {
    const key = `${observation.personKey}|${observation.headlineId}`;
    grouped.set(key, [...(grouped.get(key) || []), observation]);
  });
  const movements: IQuarterBehaviourMovementInput[] = [];
  grouped.forEach(group => {
    const identityPeriods = group.map(observation => observation.period);
    if (new Set(identityPeriods).size !== identityPeriods.length) {
      throw new Error('Behaviour movement input contains duplicate person/headline/period observations.');
    }
    const ordered = [...group].sort((left, right) => periodOrder[left.period] - periodOrder[right.period]
      || left.period.localeCompare(right.period));
    for (let index = 1; index < ordered.length; index += 1) {
      const from = ordered[index - 1];
      const to = ordered[index];
      if (!sameCadence(from.period, to.period)) continue;
      (['Employee', 'Manager', 'Final'] as const).forEach(lane => movements.push({
        lane,
        personKey: from.personKey,
        headlineId: from.headlineId,
        headlineTitle: from.headlineTitle,
        fromQuarterReviewKey: from.quarterReviewKey,
        toQuarterReviewKey: to.quarterReviewKey,
        fromPeriod: from.period,
        toPeriod: to.period,
        fromRating: laneRating(from, lane),
        toRating: laneRating(to, lane)
      }));
    }
  });
  return Object.freeze(movements.map(movement => deepFreezeCopy(movement))
    .sort((left, right) => `${left.personKey}|${left.headlineId}|${left.lane}|${left.fromPeriod}`
      .localeCompare(`${right.personKey}|${right.headlineId}|${right.lane}|${right.fromPeriod}`)));
};

const managerCompositionFor = (source: IQuarterPerformanceReadSource): IQuarterManagerCompositionInput => {
  const itemActions: IQuarterManagerCompositionInput['itemActions'][number][] = [];
  source.items.forEach((item, index) => {
    const itemPath = `Quarter manager composition item[${index}]`;
    const managerComment = quarterlyOwnDataValue<IQuarterReviewItem['managerComment']>(item, 'managerComment', itemPath);
    const recovery = quarterlyOwnDataValue<IQuarterReviewItem['recovery']>(item, 'recovery', itemPath);
    const managerOverride = quarterlyOwnDataValue<IQuarterReviewItem['managerOverride']>(item, 'managerOverride', itemPath);
    if (!managerComment && !recovery && !managerOverride) return;
    itemActions.push({
      quarterReviewItemKey: item.quarterReviewItemKey,
      managerComment,
      recovery: recovery ? deepFreezeCopy(recovery) : undefined,
      managerOverride: managerOverride ? deepFreezeCopy(managerOverride) : undefined
    });
  });
  return {
    projectionIdentity: '',
    quarterReviewKey: source.review.quarterReviewKey,
    personKey: source.review.personKey,
    performanceYear: source.review.performanceYear,
    quarter: source.review.quarter,
    managerPersonKey: source.review.managerPersonKey,
    managerCommentary: quarterlyOwnDataValue<IQuarterReview['managerDecisionComment']>(
      source.review,
      'managerDecisionComment',
      'Quarter manager composition review'
    ),
    approvedAt: source.review.approvedAt,
    lockedAt: source.review.lockedAt,
    itemActions
  };
};

export const buildQuarterPerformanceReadProjection = (
  performanceYear: number,
  sources: IQuarterPerformanceReadSource[]
): Readonly<IQuarterPerformanceReadProjection> => {
  if (!Number.isSafeInteger(performanceYear) || performanceYear < 2000) throw new Error('Quarter read projection requires a valid performance year.');
  const trustedSources = materializeReadSources(sources);
  if (new Set(trustedSources.map(source => source.review.quarterReviewKey)).size !== trustedSources.length) {
    throw new Error('Quarter read projection contains duplicate review keys.');
  }
  const core: IQuarterDeliveryReadResult[] = [];
  const impact: IQuarterDeliveryReadResult[] = [];
  const behaviourObservations: IQuarterBehaviourObservation[] = [];
  const managerCompositionInputs: IQuarterManagerCompositionInput[] = [];

  trustedSources.forEach(source => {
    if (source.review.performanceYear !== performanceYear) throw new Error('Quarter read source is crossed into another performance year.');
    const review = source.review;
    if (['Q1', 'Q2', 'Q3', 'Q4'].indexOf(review.quarter) < 0
      || typeof review.workplanKey !== 'string' || !review.workplanKey.trim()
      || typeof review.personKey !== 'string' || !review.personKey.trim()
      || review.quarterReviewKey !== `${review.workplanKey}|${review.quarter}`
      || !Number.isSafeInteger(review.rowVersionToken) || review.rowVersionToken <= 0) {
      throw new Error('Quarter read source requires an exact Workplan/quarter identity and a positive safe stored version.');
    }
    assertSourceEvidence(source);
    if (new Set(source.items.map(item => item.quarterReviewItemKey)).size !== source.items.length) {
      throw new Error('Quarter read source contains duplicate item keys.');
    }
    const behaviourItems = source.items.filter(item => item.itemType === 'Behaviour');
    const behaviourIds = behaviourItems.map(item => item.behaviourSnapshotV2?.valueId);
    const behaviourPeriods = Array.from(new Set(behaviourItems.map(item => item.behaviourSnapshotV2?.period)));
    if (behaviourItems.length !== BEHAVIOUR_V2_VALUE_IDS.length
      || BEHAVIOUR_V2_VALUE_IDS.some(valueId => behaviourIds.filter(candidate => candidate === valueId).length !== 1)
      || behaviourPeriods.length !== 1 || !behaviourPeriods[0]) {
      throw new Error('Quarter read source must contain exactly the five approved headline Behaviours for one review period.');
    }
    source.items.forEach(item => {
      assertQuarterReviewItemWriteBoundary(source.review, item);
      const actualEvidenceCount = source.evidence.filter(reference => reference.quarterReviewKey === source.review.quarterReviewKey
        && reference.quarterReviewItemKey === item.quarterReviewItemKey).length;
      if (item.evidenceCount !== actualEvidenceCount) {
        throw new Error(`${item.kpiId || item.wording} evidence count does not match the read projection references.`);
      }
      if (item.itemType === 'CoreGold') {
        if (item.reportingStream !== 'CoreGold') throw new Error('Core result is crossed into another reporting stream.');
        core.push({
          quarterReviewKey: source.review.quarterReviewKey,
          reviewState: source.review.state,
          personKey: source.review.personKey,
          performanceYear,
          quarter: source.review.quarter,
          categoryWeightSnapshot: source.review.coreCategoryWeightSnapshot,
          item: deepFreezeCopy(item),
          supportingEvidence: evidenceForItem(source.review, item, source.evidence)
        });
      } else if (item.itemType === 'LocalPersonal') {
        assertQuarterImpactAnnualSnapshot(item);
        impact.push({
          quarterReviewKey: source.review.quarterReviewKey,
          reviewState: source.review.state,
          personKey: source.review.personKey,
          performanceYear,
          quarter: source.review.quarter,
          categoryWeightSnapshot: source.review.personalCategoryWeightSnapshot,
          item: deepFreezeCopy(item),
          supportingEvidence: evidenceForItem(source.review, item, source.evidence)
        });
      } else {
        behaviourObservations.push(observationFor(source, item));
      }
    });
    managerCompositionInputs.push(managerCompositionFor(source));
  });

  const resultOrder = (result: IQuarterDeliveryReadResult): string =>
    `${result.performanceYear}|${result.quarter}|${result.personKey}|${result.item.quarterReviewItemKey}`;
  const observations = behaviourObservations.sort((left, right) =>
    `${left.period}|${left.personKey}|${left.headlineId}`.localeCompare(`${right.period}|${right.personKey}|${right.headlineId}`));

  const unbound: IQuarterPerformanceReadProjection = {
    projectionVersion: 'DEMO-QUARTER-READ-001',
    projectionIdentity: '',
    performanceYear,
    core: { stream: 'CoreGold', results: core.sort((left, right) => resultOrder(left).localeCompare(resultOrder(right))) },
    impact: { stream: 'Impact', results: impact.sort((left, right) => resultOrder(left).localeCompare(resultOrder(right))) },
    behaviourObservations: observations,
    behaviourDistributions: distributionsFor(observations),
    behaviourMovementInputs: movementInputsFor(observations),
    managerCompositionInputs: managerCompositionInputs.sort((left, right) => left.quarterReviewKey.localeCompare(right.quarterReviewKey)),
    ...(trustedSources.some(source => source.review.overallDeliveryWeightConfigurationSnapshot) ? {
      overallDeliveryWeightConfigurations: trustedSources.filter(source => source.review.overallDeliveryWeightConfigurationSnapshot)
        .map(source => ({ quarterReviewKey: source.review.quarterReviewKey,
          configuration: source.review.overallDeliveryWeightConfigurationSnapshot! }))
        .sort((left, right) => left.quarterReviewKey.localeCompare(right.quarterReviewKey))
    } : {})
  };
  const projectionIdentity = projectionIdentityForSnapshot(unbound);
  const issued = deepFreezeCopy({
    ...unbound,
    projectionIdentity,
    managerCompositionInputs: unbound.managerCompositionInputs.map(input => ({ ...input, projectionIdentity }))
  });
  ISSUED_PROJECTIONS.add(issued as object);
  return issued;
};
