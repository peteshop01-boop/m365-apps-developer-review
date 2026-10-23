import type { IAnnualWorkplan } from './ProductionModels';
import type { IAdminOverallDeliveryConfigurationContract } from '../services/AdminConfigDomain';
import type {
  IDeliveryWeightOverrideAudit, IDeliveryWeightOverrideAuthoritativeActor,
  IDeliveryWeightOverrideAuthoritativeSubject, IGovernedDeliveryWeightConfigurationContract
} from '../services/CategoryWeightingPolicy';

export const DELIVERY_PUBLICATION_V1 = 'demo.option-e.delivery-publication/v1' as const;

/** Observed coordinates only: this value does not attest a protected native read. */
export interface IDeliveryPublicationNativeCoordinates {
  siteId: string; webId: string; listId: string; itemId: number; version: string; etag: string;
}

export interface IDeliveryPublicationObservation<T> {
  native: Readonly<IDeliveryPublicationNativeCoordinates>;
  value: Readonly<T>;
}

export interface IDeliveryPublicationManagerObservations {
  workplanSource: Readonly<IDeliveryPublicationObservation<IAnnualWorkplan>>;
  actorSource: Readonly<IDeliveryPublicationObservation<IDeliveryWeightOverrideAuthoritativeActor>>;
  subjectSource: Readonly<IDeliveryPublicationObservation<IDeliveryWeightOverrideAuthoritativeSubject>>;
}

interface IDeliveryPublicationProposalBase {
  contract: typeof DELIVERY_PUBLICATION_V1;
  purposeApproval: 'DEMO-APP-PM83-D001';
  payload: Readonly<IGovernedDeliveryWeightConfigurationContract>;
}

/** A frozen source proposal, never a publication receipt or Submit capability. */
export interface IGlobalDeliveryPublicationProposal extends IDeliveryPublicationProposalBase {
  scope: Readonly<{ kind: 'GlobalDefault'; year: number }>;
  provenance: Readonly<{ configSource: Readonly<IAdminOverallDeliveryConfigurationContract> }>;
}

export interface IManagerDeliveryPublicationProposal extends IDeliveryPublicationProposalBase {
  scope: Readonly<{ kind: 'WorkplanOverride'; workplan: string; person: string; year: number }>;
  provenance: Readonly<IDeliveryPublicationManagerObservations & {
    baseline: Readonly<IGlobalDeliveryPublicationProposal>;
    approval: Readonly<{
      actorPersonKey: string; subjectPersonKey: string; assignedManagerPersonKey: string;
      audit: Readonly<IDeliveryWeightOverrideAudit>;
    }>;
  }>;
}

export type GovernedDeliveryPublicationProposal =
  Readonly<IGlobalDeliveryPublicationProposal> | Readonly<IManagerDeliveryPublicationProposal>;
