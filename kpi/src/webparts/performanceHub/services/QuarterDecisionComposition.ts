import { BEHAVIOUR_V2_ROLE_TIERS, BEHAVIOUR_V2_VALUE_IDS } from '../models/BehaviourFrameworkV2Models';
import type {
  IOverallDeliveryCalculationResult,
  IQuarterBehaviourCatalogueConsumerResult,
  IQuarterPerformanceReadProjection,
  IQuarterYearEndDecisionInput
} from '../models/QuarterlyModels';
import { assertIssuedQuarterBehaviourResult } from './QuarterBehaviourCatalogueConsumer';
import { assertIssuedQuarterOverallDelivery, quarterDeliveryResultKey } from './QuarterOverallDelivery';
import { assertIssuedQuarterPerformanceReadProjection } from './QuarterPerformanceReadProjection';

const deepFreezeCopy = <T>(value: T): Readonly<T> => {
  if (value === null || typeof value !== 'object') return value as Readonly<T>;
  if (Array.isArray(value)) return Object.freeze(value.map(item => deepFreezeCopy(item))) as unknown as Readonly<T>;
  const copy = Object.create(null) as Record<string, unknown>;
  Object.keys(value as Record<string, unknown>).forEach(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || Object.prototype.hasOwnProperty.call(descriptor, 'get')
      || Object.prototype.hasOwnProperty.call(descriptor, 'set')) {
      throw new Error('Quarter decision composition copy accepts own data properties only.');
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

const sameKeys = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean => {
  if (left.length !== right.length || new Set(left).size !== left.length) return false;
  const expected = new Set(right);
  return left.every(key => expected.has(key));
};

const sameOrderedIdentity = <T>(left: ReadonlyArray<T>, right: ReadonlyArray<T>): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/**
 * Composes only the frozen decision inputs approved for BT-07. It does not
 * determine final outcomes, mutate lifecycle state, or perform rollover.
 */
export const composeQuarterYearEndDecisionInput = (
  projection: Readonly<IQuarterPerformanceReadProjection>,
  overallDelivery: Readonly<IOverallDeliveryCalculationResult>,
  behaviours: Readonly<IQuarterBehaviourCatalogueConsumerResult>
): Readonly<IQuarterYearEndDecisionInput> => {
  const trustedProjection = assertIssuedQuarterPerformanceReadProjection(projection);
  const trustedOverall = assertIssuedQuarterOverallDelivery(overallDelivery, trustedProjection);
  const trustedBehaviours = assertIssuedQuarterBehaviourResult(behaviours, trustedProjection);
  if (!trustedOverall.ready || !trustedOverall.core || !trustedOverall.impact
    || trustedOverall.overallScore === undefined) {
    throw new Error('Decision composition requires a ready Overall Delivery result.');
  }
  if (!sameKeys(trustedOverall.core.sourceResultKeys, trustedProjection.core.results.map(quarterDeliveryResultKey))
    || !sameKeys(trustedOverall.impact.sourceResultKeys, trustedProjection.impact.results.map(quarterDeliveryResultKey))) {
    throw new Error('Decision composition rejects Overall Delivery provenance crossed outside the projection.');
  }
  if (trustedOverall.projectionIdentity !== trustedProjection.projectionIdentity
    || trustedBehaviours.projectionIdentity !== trustedProjection.projectionIdentity
    || trustedProjection.managerCompositionInputs.some(input => input.projectionIdentity !== trustedProjection.projectionIdentity)) {
    throw new Error('Decision composition rejects crossed projection identities across consumer and manager inputs.');
  }
  if (trustedBehaviours.consumerVersion !== 'KCF-PD03-001'
    || !sameOrderedIdentity(trustedBehaviours.headlineIds, BEHAVIOUR_V2_VALUE_IDS)
    || !sameOrderedIdentity(trustedBehaviours.roleTiers, BEHAVIOUR_V2_ROLE_TIERS)) {
    throw new Error('Decision composition requires the approved Behaviour catalogue consumer result.');
  }
  return deepFreezeCopy({
    compositionVersion: 'KCF-BT07-DECISION-001',
    projectionIdentity: trustedProjection.projectionIdentity,
    performanceYear: trustedProjection.performanceYear,
    overallDelivery: trustedOverall,
    core: trustedProjection.core,
    impact: trustedProjection.impact,
    behaviours: trustedBehaviours,
    managerCompositionInputs: trustedProjection.managerCompositionInputs
  });
};
