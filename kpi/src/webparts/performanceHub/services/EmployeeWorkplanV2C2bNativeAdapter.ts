/* eslint-disable @rushstack/no-new-null -- null is the explicit native CAS absence/complete-page representation */
/**
 * Tenant-neutral contract for the native Power Automate/SharePoint adapter boundary.
 *
 * This module deliberately contains no URL, credential, connection reference, list GUID or
 * endpoint or credential. The journal/effect SharePoint store is implemented and re-exported below;
 * a later authorised TEST binding must implement the remaining capabilities and pass C2b composition
 * preflight before the governed gateway can submit anything.
 */
import type {
  IEmployeeV2AnnualAdmissionEnvelope
} from './EmployeeWorkplanV2CommandTransport';
import type {
  C2bCanonicalEntityReadback,
  C2bCommandEffect,
  C2bCommandJournal,
  C2bEffectConfirmation,
  C2bListAclImage,
  C2bStableReadProof,
  C2bTerminalReceipt
} from './TestPilotCommandAdmissionC2b';
import type {
  C2bTrustedAnnualConfiguration,
  C2bTrustedAnnualItem,
  C2bTrustedAnnualReadiness,
  C2bTrustedBehaviourV2Observations,
  C2bTrustedCommandSource,
  C2bTrustedCoreCatalogueItem,
  C2bTrustedPerson,
  C2bTrustedWorkplanHeader
} from './TestPilotCommandAdmissionC2bHandlers';
import type { ISec006ControlCase } from './sec006/Sec006ControlCaseStore';
import type { C2bAcceptedCommandV1 } from './C2bCommandSourceStorageV1';
import type { C2bPhysicalLogicalPairV1 } from '../models/C2bFileStorageV1Models';

export const C2B_NATIVE_ADAPTER_CONTRACT_VERSION = 'kcf.kpi.c2b.native-adapter.v2' as const;

/** Optional command consumer representation only; it grants no installed/native compatibility. */
export interface IC2bCommandSourcePairV1 extends C2bPhysicalLogicalPairV1<Record<string, unknown>, IEmployeeV2AnnualAdmissionEnvelope> {
  readonly version: 'kcf.kpi.command-source.v1';
  readonly kind: 'legacy-inline' | 'file';
  readonly response: Readonly<{ requestUrl: string; responseUrl: string; status: number;
    headers: readonly (readonly [string, string])[]; retentionReference: string }>;
  readonly acceptance?: Readonly<Omit<C2bAcceptedCommandV1, 'bindingBytes' | 'sealBytes'>
    & { bindingSHA256: string; sealSHA256: string }>;
}

export interface IC2bNativeSourceObservation {
  source: C2bTrustedCommandSource;
  sourceETag: string;
  sourceRowVersion: string;
  route: 'Employee' | 'Manager';
  authorEmail: string;
  envelope: IEmployeeV2AnnualAdmissionEnvelope;
  commandSource?: IC2bCommandSourcePairV1;
}

export interface IC2bNativeSourceDoubleRead {
  first: IC2bNativeSourceObservation;
  second: IC2bNativeSourceObservation;
}
export interface IC2bNativeReceiptProvenance {
  admittedSource: Readonly<IC2bNativeSourceObservation>;
  source: { listId: string; itemId: number; itemVersion: string; sourceETag: string };
  command: { commandType: IEmployeeV2AnnualAdmissionEnvelope['binding']['commandType'];
    subjectType: IEmployeeV2AnnualAdmissionEnvelope['binding']['subjectType']; subjectKey: string; personKey: string;
    performanceYear: number; quarter: null };
  actor: { email: string; personKey: string; effectiveRole: 'Employee' | 'Manager' | 'SystemAdmin' };
  processor: { email: string; principalKey: string; flowRunReference: string; completedAt: string };
}

export interface IC2bNativePage<T> {
  items: readonly T[];
  pageNumber: number;
  complete: boolean;
  nextCursor: string | null;
}

export interface IC2bNativePlanningObservations {
  employee: C2bTrustedPerson;
  manager: C2bTrustedPerson;
  actor: C2bTrustedPerson;
  configuration: C2bTrustedAnnualConfiguration;
  header?: C2bTrustedWorkplanHeader;
  currentItem?: C2bTrustedAnnualItem;
  allItems: readonly C2bTrustedAnnualItem[];
  currentAcls: readonly C2bListAclImage[];
  readiness?: C2bTrustedAnnualReadiness;
  behaviourV2?: C2bTrustedBehaviourV2Observations;
  catalogueItem?: C2bTrustedCoreCatalogueItem;
  allocatedItemKey?: string;
  controlCases: readonly ISec006ControlCase[];
}

export type C2bNativeEffectResult =
  | { outcome: 'Confirmed'; confirmation: C2bEffectConfirmation }
  | { outcome: 'Unknown'; safeCode: 'TIMEOUT_UNKNOWN' | 'PROVIDER_UNKNOWN' | 'CONNECTION_INTERRUPTED' };

export type C2bNativeRecoveryResult =
  | { outcome: 'Applied'; confirmation: C2bEffectConfirmation }
  | { outcome: 'NotApplied'; confirmation: C2bEffectConfirmation }
  | { outcome: 'StillUnknown'; safeCode: string };

export interface IC2bNativeAdapterCapabilities {
  sourceDoubleRead: true;
  journalAndEffectCas: true;
  workplanCrudWithoutDelete: true;
  workplanItemCrudWithoutDelete: true;
  authoritativeControlCaseCas: true;
  behaviourCatalogueStableRead: true;
  employeeContainerAclReconciliation: true;
  appendOnlyAudit: true;
  immutableReceiptAndActorRead: true;
  completePaging: true;
  timeoutUnknownOutcome: true;
  exactRecoveryReadback: true;
}

/**
 * Native boundary consumed by the local coordinator and generated flow composition.
 * Every mutation is conditional/CAS-bound. There is intentionally no delete or wildcard write API.
 */
export interface IEmployeeWorkplanV2C2bNativeAdapter {
  readonly contractVersion: typeof C2B_NATIVE_ADAPTER_CONTRACT_VERSION;
  readonly capabilities: IC2bNativeAdapterCapabilities;

  readCommandSourceTwice(source: C2bTrustedCommandSource): Promise<IC2bNativeSourceDoubleRead>;
  readPlanningObservations(admittedSource: Readonly<IC2bNativeSourceObservation>): Promise<IC2bNativePlanningObservations>;

  readJournal(commandKey: string): Promise<{ journal?: C2bCommandJournal; etag: string | null }>;
  compareExchangeJournal(journal: C2bCommandJournal, expectedETag: string | null): Promise<{ etag: string }>;
  persistEffectState(effect: C2bCommandEffect, journalETag: string,
    journal: C2bCommandJournal): Promise<{ etag: string }>;

  readWorkplan(workplanKey: string): Promise<C2bCanonicalEntityReadback | undefined>;
  readWorkplanItemsPage(workplanKey: string, cursor: string | null): Promise<IC2bNativePage<C2bCanonicalEntityReadback>>;
  compareExchangeWorkplan(effect: C2bCommandEffect): Promise<C2bNativeEffectResult>;
  compareExchangeWorkplanItem(effect: C2bCommandEffect): Promise<C2bNativeEffectResult>;
  consumeAuthoritativeControlCase(effect: C2bCommandEffect): Promise<C2bNativeEffectResult>;
  reconcileEmployeeContainerAcl(effect: C2bCommandEffect): Promise<C2bNativeEffectResult>;
  appendAudit(effect: C2bCommandEffect): Promise<C2bNativeEffectResult>;
  createImmutableReceipt(effect: C2bCommandEffect, receipt: C2bTerminalReceipt,
    provenance: IC2bNativeReceiptProvenance): Promise<C2bNativeEffectResult>;
  reconcileReceiptActorRead(effect: C2bCommandEffect, receipt: C2bTerminalReceipt): Promise<C2bNativeEffectResult>;

  readStableCanonicalProof(journal: C2bCommandJournal): Promise<C2bStableReadProof>;
  recoverUnknownEffect(journal: C2bCommandJournal, effect: C2bCommandEffect): Promise<C2bNativeRecoveryResult>;
}

export const C2B_REQUIRED_NATIVE_ADAPTER_CAPABILITIES: Readonly<IC2bNativeAdapterCapabilities> = Object.freeze({
  sourceDoubleRead: true,
  journalAndEffectCas: true,
  workplanCrudWithoutDelete: true,
  workplanItemCrudWithoutDelete: true,
  authoritativeControlCaseCas: true,
  behaviourCatalogueStableRead: true,
  employeeContainerAclReconciliation: true,
  appendOnlyAudit: true,
  immutableReceiptAndActorRead: true,
  completePaging: true,
  timeoutUnknownOutcome: true,
  exactRecoveryReadback: true
});

export function assertC2bNativeAdapterContract(adapter: IEmployeeWorkplanV2C2bNativeAdapter): void {
  if (adapter.contractVersion !== C2B_NATIVE_ADAPTER_CONTRACT_VERSION
    || Object.keys(C2B_REQUIRED_NATIVE_ADAPTER_CAPABILITIES)
      .some(key => adapter.capabilities[key as keyof IC2bNativeAdapterCapabilities] !== true)) {
    throw new Error('C2B_NATIVE_ADAPTER_INCOMPLETE: every admitted native capability must fail closed until bound.');
  }
}

export {
  C2bSharePointCasConflictError,
  C2bSharePointContractError,
  C2bSharePointWriteUnknownError,
  SharePointC2bJournalEffectStore
} from './EmployeeWorkplanV2C2bSharePointJournalStore';
export type {
  C2bPersistenceRecovery,
  IC2bSharePointJournalEffectBinding,
  IC2bSharePointRestRequest,
  IC2bSharePointRestResponse,
  IC2bSharePointRestTransport,
  IC2bSharePointStored
} from './EmployeeWorkplanV2C2bSharePointJournalStore';
