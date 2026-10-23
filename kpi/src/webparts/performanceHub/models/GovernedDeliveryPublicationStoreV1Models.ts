import type { IAdminOverallDeliveryConfigurationContract } from '../services/AdminConfigDomain';
import type { IDeliveryCategoryWeights, IGovernedDeliveryWeightConfigurationContract } from '../services/CategoryWeightingPolicy';
import type {
  GovernedDeliveryPublicationProposal, IDeliveryPublicationManagerObservations, IDeliveryPublicationNativeCoordinates
} from './GovernedDeliveryPublicationV1Models';

/** User intent only. Authority, current values, approval and capabilities are never caller inputs. */
export type DeliveryPublicationCommand = Readonly<{
  key: string; kind: 'GlobalDefault'; year: number;
}> | Readonly<{
  key: string; kind: 'WorkplanOverride'; year: number; workplan: string; person: string;
  proposed: Readonly<IDeliveryCategoryWeights>; reason: string;
}>;

export interface IDeliveryPublicationProtectedBinding {
  admitted: true;
  admissionReference: string;
  /** Separately admitted native operation enforcing all supplied source preconditions at create.
   * This library supplies no implementation and makes no cross-store atomicity claim. */
  sourcePreconditionContract: string;
  immutableCreate: true;
  appendOnlyIntent: true;
  publication: Readonly<IDeliveryPublicationNativeCoordinates>;
  producerPrincipal: number;
  publisherIdentity: string;
  configListId: string;
  workplanListId: string;
  peopleListId: string;
}

export interface IDeliveryPublicationProtectedSources {
  config: Readonly<IAdminOverallDeliveryConfigurationContract>;
  configNative: Readonly<{ core: Readonly<IDeliveryPublicationNativeCoordinates>; impact: Readonly<IDeliveryPublicationNativeCoordinates> }>;
  globalPayload: Readonly<IGovernedDeliveryWeightConfigurationContract>;
  publicationPayload: Readonly<IGovernedDeliveryWeightConfigurationContract>;
  manager?: Readonly<IDeliveryPublicationManagerObservations>;
  /** Protected clock and complete append-only audit-key observation, never browser assertions. */
  approvalEventAt?: string;
  existingAuditKeys?: readonly string[];
}

/** Immutable protected intent persists before an uncertain publication attempt. Not a publication receipt. */
export interface IDeliveryPublicationStoreIntent {
  contract: 'kcf.option-e.delivery-publication-intent/v1';
  command: DeliveryPublicationCommand;
  binding: Readonly<IDeliveryPublicationProtectedBinding>;
  sources: Readonly<IDeliveryPublicationProtectedSources>;
  rawBody: string;
}

export interface IDeliveryPublicationStoreReadback {
  commandKey: string;
  native: Readonly<IDeliveryPublicationNativeCoordinates>;
  authorId: number;
  createdAt: string;
  rawBody: string;
  /** Independently protected readback of the native conditional-create preconditions. */
  sourcePreconditionContract: string;
  sourcePreconditions: Readonly<IDeliveryPublicationProtectedSources>;
}

/** Only a separately admitted backend may implement these ports. No default tenant/network adapter exists.
 * All reads are exact, complete and nonpaginated. Undefined means proved absent, not access/read failure.
 * Implementations must throw on incomplete/ambiguous reads. Creating never overwrites or selects current.
 * The conditional publication must atomically enforce its admitted source preconditions, or remain unbound.
 */
export interface IDeliveryPublicationProtectedPorts {
  readBinding(command: DeliveryPublicationCommand): Promise<Readonly<IDeliveryPublicationProtectedBinding> | undefined>;
  readSources(command: DeliveryPublicationCommand): Promise<Readonly<IDeliveryPublicationProtectedSources> | undefined>;
  readIntent(key: string): Promise<Readonly<IDeliveryPublicationStoreIntent> | undefined>;
  createIntentIfAbsent(intent: Readonly<IDeliveryPublicationStoreIntent>): Promise<void>;
  readPublication(intent: Readonly<IDeliveryPublicationStoreIntent>): Promise<Readonly<IDeliveryPublicationStoreReadback> | undefined>;
  createPublicationIfSourcesCurrent(intent: Readonly<IDeliveryPublicationStoreIntent>): Promise<void>;
}

export interface IDeliveryPublicationSourceReceipt {
  contract: 'kcf.option-e.delivery-publication-source-readback/v1';
  evidence: 'SOURCE_PORT_READBACK_ONLY';
  intent: Readonly<IDeliveryPublicationStoreIntent>;
  readback: Readonly<IDeliveryPublicationStoreReadback>;
  publication: GovernedDeliveryPublicationProposal;
}
