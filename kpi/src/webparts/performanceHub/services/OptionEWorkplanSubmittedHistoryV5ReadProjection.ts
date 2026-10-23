import type { IV5SubmittedHistory, V5SubmittedHistoryResult } from '../models/OptionEWorkplanSubmittedHistoryV5Models';

/** References the frozen decoded capture. No current catalogue, clock, actuals or approval input exists. */
export interface IV5HistoryReadProjection {
  readonly history: Readonly<IV5SubmittedHistory>;
  readonly annual: IV5SubmittedHistory['draft'];
  readonly quarterly: IV5SubmittedHistory['draft'];
  readonly reporting: IV5SubmittedHistory['draft'];
  readonly deliveryWeights: IV5SubmittedHistory['overallDeliveryWeightConfiguration'];
  readonly classifications: IV5SubmittedHistory['impactClassifications'];
  readonly behavioursExcludedFromDeliveryArithmetic: true;
  readonly operationalEligibility: 'NOT_ASSESSED';
}
export type V5HistoryReadResult = Readonly<
  { status: 'DECODED_SOURCE_ONLY'; projection: Readonly<IV5HistoryReadProjection> }
  | { status: 'HOLD'; reason: 'Unbound' | 'MissingCapture' | 'InvalidHistoricalCapture' | 'ReadUnavailable' | 'CoordinateMismatch' | 'Loading' }
>;

export const projectOptionEWorkplanSubmittedHistoryV5 = (decoded: V5SubmittedHistoryResult): V5HistoryReadResult => {
  if (decoded.status === 'HOLD') return decoded;
  const history = decoded.history;
  return Object.freeze({ status: 'DECODED_SOURCE_ONLY', projection: Object.freeze({
    history, annual: history.draft, quarterly: history.draft, reporting: history.draft,
    deliveryWeights: history.overallDeliveryWeightConfiguration, classifications: history.impactClassifications,
    behavioursExcludedFromDeliveryArithmetic: true, operationalEligibility: 'NOT_ASSESSED'
  }) });
};
