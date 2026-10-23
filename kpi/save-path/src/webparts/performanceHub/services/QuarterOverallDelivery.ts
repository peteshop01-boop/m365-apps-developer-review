import type {
  IAggregationInput,
  IOverallDeliveryCalculationResult,
  IOverallDeliveryStreamResult,
  IOverallDeliveryWeightConfiguration,
  IQuarterDeliveryStreamProjection,
  IQuarterPerformanceReadProjection,
  IScoringResult
} from '../models/QuarterlyModels';
import { prepareAggregation } from './AggregationPreparation';
import { calculatePerformance } from './PerformanceScoring';
import { assertIssuedQuarterPerformanceReadProjection } from './QuarterPerformanceReadProjection';
import { assertQuarterlyExactKeys, materializeQuarterlyData } from './QuarterlyTrustBoundary';

const CALCULATION_VERSION = 'DEMO-PD01-001' as const;
const ISSUED_OVERALL_RESULTS = new WeakMap<object, object>();
const WEIGHT_KEYS = [
  'configurationKey', 'configurationVersion', 'coreWeight', 'impactWeight', 'sourceReference'
] as const;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const round = (value: number): number => Math.round(value * 100) / 100;
const nonBlank = (value: string): boolean => value.trim().length > 0;

const deepFreezeCopy = <T>(value: T): Readonly<T> => {
  if (value === null || typeof value !== 'object') return value as Readonly<T>;
  if (Array.isArray(value)) return Object.freeze(value.map(item => deepFreezeCopy(item))) as unknown as Readonly<T>;
  const copy: Record<string, unknown> = {};
  Object.keys(value as Record<string, unknown>).forEach(key => {
    copy[key] = deepFreezeCopy((value as Record<string, unknown>)[key]);
  });
  return Object.freeze(copy) as Readonly<T>;
};

export const DEFAULT_OVERALL_DELIVERY_WEIGHTS: Readonly<IOverallDeliveryWeightConfiguration> = Object.freeze({
  configurationKey: 'DEMO-OVERALL-DELIVERY-DEFAULT',
  configurationVersion: 'v1',
  coreWeight: 70,
  impactWeight: 30,
  sourceReference: 'DEMO-APP-PETE-PD-01'
});

export const quarterDeliveryResultKey = (
  result: IQuarterDeliveryStreamProjection['results'][number]
): string => `${result.quarterReviewKey}|${result.item.quarterReviewItemKey}`;

const validateWeights = (weights: IOverallDeliveryWeightConfiguration, errors: string[]): void => {
  if (!nonBlank(weights.configurationKey) || !nonBlank(weights.configurationVersion)) {
    errors.push('Overall Delivery weight configuration requires stable key and version identities.');
  }
  if (weights.sourceReference !== 'DEMO-APP-PETE-PD-01') {
    errors.push('Overall Delivery weight configuration must cite DEMO-APP-PETE-PD-01.');
  }
  if (!finite(weights.coreWeight) || !finite(weights.impactWeight)
    || weights.coreWeight < 0 || weights.impactWeight < 0
    || weights.coreWeight > 100 || weights.impactWeight > 100) {
    errors.push('Overall Delivery weights must each be finite percentages from 0 to 100.');
  } else if (Math.abs(weights.coreWeight + weights.impactWeight - 100) > 1e-9) {
    errors.push('Overall Delivery Core and Impact weights must total exactly 100.');
  }
};

/** Copy an existing configuration into annual/quarter source history; never issue or default authority. */
export const snapshotOverallDeliveryWeightConfiguration = (
  value: Readonly<IOverallDeliveryWeightConfiguration>
): Readonly<IOverallDeliveryWeightConfiguration> => {
  const weights = materializeQuarterlyData(value, 'Overall Delivery weight snapshot') as IOverallDeliveryWeightConfiguration;
  assertQuarterlyExactKeys(weights, WEIGHT_KEYS, 'Overall Delivery weight snapshot', WEIGHT_KEYS);
  const errors: string[] = [];
  validateWeights(weights, errors);
  if (errors.length) throw new Error(errors.join(' '));
  return Object.freeze({ ...weights });
};

const sameOptionalNumber = (left: number | undefined, right: number | undefined): boolean =>
  left === undefined ? right === undefined : right !== undefined && Math.abs(left - right) <= 1e-9;

const scoreProjectedResult = (
  result: IQuarterDeliveryStreamProjection['results'][number],
  label: string,
  errors: string[]
): IScoringResult => {
  const item = result.item;
  const scoring = calculatePerformance({
    scoringDirection: item.scoringDirection || 'TBC',
    metricType: item.metricType || 'Other',
    targetValue: item.quarterTargetValue,
    actualValue: item.employeeActualValue,
    baselineValue: item.baselineValue,
    targetText: item.quarterTargetText,
    actualText: item.employeeActualText
  }, {
    percentageSourceScale: item.percentageSourceScale
  });
  if (item.calculationRuleVersion !== scoring.calculationVersion
    || item.calculatedRag !== scoring.calculatedRag
    || !sameOptionalNumber(item.progressPct, scoring.rawProgressPct)
    || !sameOptionalNumber(item.scoredProgressPct, scoring.scoredProgressPct)) {
    errors.push(`${label} result ${quarterDeliveryResultKey(result)} does not match its exact DEMO-RAG-001 governed output.`);
  }
  return scoring;
};

const streamResult = (
  projection: Readonly<IQuarterDeliveryStreamProjection>,
  expectedStream: 'CoreGold' | 'Impact',
  weight: number,
  errors: string[]
): IOverallDeliveryStreamResult | undefined => {
  const label = expectedStream === 'CoreGold' ? 'Core' : 'Impact';
  if (projection.stream !== expectedStream || !projection.results.length) {
    errors.push(`${label} Overall Delivery requires at least one result in the exact ${expectedStream} stream.`);
    return undefined;
  }
  const scorings = projection.results.map(result => scoreProjectedResult(result, label, errors));
  const aggregationInputs: IAggregationInput[] = projection.results.map((result, index) => ({
    key: quarterDeliveryResultKey(result),
    itemType: 'CoreGold',
    kpiId: result.item.kpiId,
    actualValue: result.item.employeeActualValue,
    progressPct: scorings[index].scoredProgressPct,
    finalRag: scorings[index].calculatedRag,
    approved: (result.reviewState === 'Approved' || result.reviewState === 'Locked') && result.item.managerApproved,
    locked: result.reviewState === 'Locked' && result.item.locked,
    contributionWeight: result.item.workplanItemWeightSnapshot
  }));
  const aggregation = prepareAggregation('WeightedContribution', aggregationInputs);
  if (!aggregation.ready || !finite(aggregation.scoredProgressPct)) {
    errors.push(...aggregation.errors.map(error => `${label} DEMO-AGG-001: ${error}`));
    return undefined;
  }
  const authoritativeRag = calculatePerformance({
    scoringDirection: 'HigherIsBetter',
    metricType: 'Percentage',
    targetValue: 100,
    actualValue: aggregation.scoredProgressPct
  }, {
    percentageSourceScale: 'Whole'
  });
  if (!authoritativeRag.rateable
    || authoritativeRag.calculationVersion !== 'DEMO-RAG-001'
    || !sameOptionalNumber(authoritativeRag.scoredProgressPct, aggregation.scoredProgressPct)) {
    errors.push(`${label} aggregate does not produce an exact authoritative DEMO-RAG-001 output.`);
    return undefined;
  }
  return {
    stream: expectedStream,
    score: aggregation.scoredProgressPct,
    authoritativeRag: authoritativeRag.calculatedRag,
    weight,
    weightedContribution: round(aggregation.scoredProgressPct * weight / 100),
    sourceResultKeys: [...aggregation.includedKeys],
    scoreCalculationVersion: 'DEMO-RAG-001',
    aggregationCalculationVersion: aggregation.calculationVersion
  };
};

export const assertIssuedQuarterOverallDelivery = (
  candidate: Readonly<IOverallDeliveryCalculationResult>,
  projection: Readonly<IQuarterPerformanceReadProjection>
): Readonly<IOverallDeliveryCalculationResult> => {
  if (candidate === null || typeof candidate !== 'object'
    || ISSUED_OVERALL_RESULTS.get(candidate as object) !== projection) {
    throw new Error('Decision composition requires the exact internally issued Overall Delivery result for this projection.');
  }
  return candidate;
};

/**
 * Recomputes Core and Impact exclusively through DEMO-RAG-001 and DEMO-AGG-001,
 * then derives the PD-04 Core-protection disposition from the authoritative
 * aggregate Core RAG. Callers cannot supply scores, RAG or protection state.
 */
export const calculateQuarterOverallDelivery = (
  projection: Readonly<IQuarterPerformanceReadProjection>,
  weightConfiguration: Readonly<IOverallDeliveryWeightConfiguration> = DEFAULT_OVERALL_DELIVERY_WEIGHTS
): Readonly<IOverallDeliveryCalculationResult> => {
  const trustedProjection = assertIssuedQuarterPerformanceReadProjection(projection);
  const trustedWeights = materializeQuarterlyData(
    weightConfiguration,
    'Overall Delivery weight configuration'
  ) as IOverallDeliveryWeightConfiguration;
  assertQuarterlyExactKeys(trustedWeights, WEIGHT_KEYS, 'Overall Delivery weight configuration', WEIGHT_KEYS);

  const errors: string[] = [];
  validateWeights(trustedWeights, errors);
  const validWeights = errors.length === 0;
  const core = validWeights
    ? streamResult(trustedProjection.core, 'CoreGold', trustedWeights.coreWeight, errors) : undefined;
  const impact = validWeights
    ? streamResult(trustedProjection.impact, 'Impact', trustedWeights.impactWeight, errors) : undefined;
  const coreProtectionState = core?.authoritativeRag === 'Red'
    ? 'Poor' as const
    : core?.authoritativeRag === 'Amber' || core?.authoritativeRag === 'Green'
      ? 'Acceptable' as const
      : 'NotRated' as const;
  if (coreProtectionState === 'NotRated') {
    errors.push('Authoritative Core RAG is NotRated; Exceptional eligibility cannot be determined.');
  }
  const ready = errors.length === 0 && !!core && !!impact;

  const issued = deepFreezeCopy({
    calculationVersion: CALCULATION_VERSION,
    projectionIdentity: trustedProjection.projectionIdentity,
    ready,
    weights: trustedWeights,
    core,
    impact,
    overallScore: ready ? round(core.weightedContribution + impact.weightedContribution) : undefined,
    coreProtectionState,
    coreProtectionApplied: ready && coreProtectionState === 'Poor',
    exceptionalOutcomePermitted: ready && coreProtectionState === 'Acceptable',
    errors
  });
  ISSUED_OVERALL_RESULTS.set(issued as object, trustedProjection as object);
  return issued;
};

/** Report only with weights captured in the exact issued projection, never today's defaults. */
export const calculateCapturedQuarterOverallDelivery = (
  projection: Readonly<IQuarterPerformanceReadProjection>
): Readonly<IOverallDeliveryCalculationResult> => {
  const trusted = assertIssuedQuarterPerformanceReadProjection(projection);
  const reviewKeys = Array.from(new Set([...trusted.core.results, ...trusted.impact.results].map(result => result.quarterReviewKey)));
  const configurations = reviewKeys.map(key => {
    const matches = trusted.overallDeliveryWeightConfigurations?.filter(item => item.quarterReviewKey === key) || [];
    if (matches.length !== 1) throw new Error('Overall Delivery is unavailable until each review has its captured governed weight configuration.');
    const captured = matches[0].configuration;
    assertQuarterlyExactKeys(captured, WEIGHT_KEYS, 'Issued Overall Delivery weight snapshot', WEIGHT_KEYS);
    // Issued projections intentionally contain null-prototype records. Re-enter the public
    // plain-data validator only after the original projection capability has been checked.
    return snapshotOverallDeliveryWeightConfiguration({ ...captured });
  });
  if (!configurations.length) throw new Error('Overall Delivery has no approved Core/Impact review source.');
  const first = configurations[0];
  if (configurations.some(value => value.configurationKey !== first.configurationKey
    || value.configurationVersion !== first.configurationVersion || value.coreWeight !== first.coreWeight
    || value.impactWeight !== first.impactWeight || value.sourceReference !== first.sourceReference)) {
    throw new Error('Overall Delivery reviews use different captured configurations. Report each version separately.');
  }
  return calculateQuarterOverallDelivery(trusted, first);
};
