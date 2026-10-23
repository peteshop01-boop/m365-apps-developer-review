import type { IOptionEWorkplanDraftV2Aggregate } from './OptionEWorkplanDraftV2Models';
import type { V5Receipt, V5Snapshot } from './OptionEWorkplanSubmitExactBodyV5Models';
import type { GovernedDeliveryPublicationProposal } from './GovernedDeliveryPublicationV1Models';
import type { IImpactClassification } from './ProductionModels';
import type { IOverallDeliveryWeightConfiguration } from './QuarterlyModels';
import type { IGovernedImpactTaxonomyContract } from '../services/PersonalWorkplanPolicy';

export interface IV5HistoryCoordinates { workplan: string; person: string; year: number }
export interface IV5HistoryCapture { kind: 'receipt' | 'snapshot'; canonicalBody: string }
/** Explicit captured r3 input. This discriminator identifies storage encoding, never protected origin. */
export interface IV5CapturedHistoryCapture extends IV5HistoryCapture { encoding: 'captured-native-request/v1' }
export interface IV5HistoricalTaxonomyPublication {
  contract: 'demo.option-e.impact-taxonomy-publication/v1';
  purposeApproval: 'DEMO-APP-PM83-D001';
  payload: IGovernedImpactTaxonomyContract;
  provenance: { sourceReference: 'DEMO-APP-PETE-PD-02'; publisherPrincipal: number };
}

/** Decoded historical data only. No protected origin, approval or native readiness is conferred. */
export interface IV5SubmittedHistory {
  coordinates: Readonly<IV5HistoryCoordinates>;
  capture: Readonly<IV5HistoryCapture | IV5CapturedHistoryCapture>;
  snapshot: Readonly<V5Snapshot>;
  receipt?: Readonly<V5Receipt>;
  raw: Readonly<{
    requestBody: string; referenceBody: string; draftBody: string;
    deliveryBody: string; taxonomyBody: string;
    deliveryNativeMetadataBody: string; taxonomyNativeMetadataBody: string;
  }>;
  draft: Readonly<IOptionEWorkplanDraftV2Aggregate>;
  deliveryPublication: GovernedDeliveryPublicationProposal;
  taxonomyPublication: Readonly<IV5HistoricalTaxonomyPublication>;
  impactClassifications: ReadonlyArray<Readonly<{ impactId: string; classification: Readonly<IImpactClassification> }>>;
  overallDeliveryWeightConfiguration: Readonly<IOverallDeliveryWeightConfiguration>;
}

export type V5SubmittedHistoryResult = Readonly<
  { status: 'DECODED_SOURCE_ONLY'; history: Readonly<IV5SubmittedHistory> }
  | { status: 'HOLD'; reason: 'MissingCapture' | 'InvalidHistoricalCapture' }
>;

/** Future read-only adapter contract; no implementation or native binding ships with the mapper. */
export interface IV5SubmittedHistoryLoader {
  readCapture(coordinates: Readonly<IV5HistoryCoordinates>): Promise<Readonly<IV5HistoryCapture | IV5CapturedHistoryCapture> | undefined>;
}
export const V5_SUBMITTED_HISTORY_LOADER_BINDING: Readonly<{
  state: 'UNBOUND'; status: 'HOLD'; loader: undefined;
}> = Object.freeze({ state: 'UNBOUND', status: 'HOLD', loader: undefined });
