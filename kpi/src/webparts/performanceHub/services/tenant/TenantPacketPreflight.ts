/* eslint-disable @rushstack/no-new-null -- absence is material package before-state */
import { assertKcfAutomationTenantTarget, type ITenantTargetEvidence } from './TenantTargetClassification';
import { immutableTenantInput } from './ImmutableTenantInput';

export const WI_B12_BASE_SPFX_PRODUCT_ID = '34bee229-16d5-4ecb-a2f8-a7ae2353c3bf' as const;
export const WI_B12_BASE_SPFX_VERSION = '1.0.0.0' as const;
export const WI_B12_BASE_SPFX_SHA256 = 'CE91E398B38DE312E2AC5E5731F93AF5D6263BC53C08E3C349CEA745262C3EB6' as const;
export const WI_B12_COMPANION_SOLUTION_NAME = 'KCFKPIEmployeeC2bTenantLayerDisabled' as const;
export const WI_B12_COMPANION_SOLUTION_VERSION = '1.0.1.0' as const;
export const WI_B12_COMPANION_WORKFLOW_ID = '3db97504-0731-4134-af1a-27e467d23b28' as const;
export const WI_B12_COMPANION_WORKFLOW_NAME = 'KCF KPI Employee C2b Tenant Layer Disabled' as const;
export const WI_B12_BASE_WORKFLOW_ID = '32b971df-fde0-460d-a9a7-5967e21d0711' as const;
export const WI_B12_BASE_WORKFLOW_NAME = 'KCF KPI Employee C2b Disabled Foundation' as const;
/** Frozen deterministic bytes generated from the reviewed disabled companion package. */
export const WI_B12_COMPANION_SHA256 = 'DE4EF8A90E61CDBAF8EAAFFCE1BCD0E60E352004615385B1DC1B07ABFFFAE39F' as const;
/** Updated mechanically with the self-excluding tenant manifest after generation. */
export const WI_B12_TENANT_MANIFEST_SHA256 = '7DBAA3165C586C332B6DA735C437A8B2A908EBED515976D4046D08B1EBE7F403' as const;

export interface IPackageIdentityObservation {
  productId: string;
  version: string;
  binarySha256: string | null;
  receiptReference: string | null;
  installed: boolean;
}

export interface ISolutionIdentityObservation {
  uniqueName: string;
  version: string;
  binarySha256: string | null;
  receiptReference: string | null;
  installed: boolean;
}

export interface IFlowSafetyObservation {
  workflowId: string;
  name: string;
  state: 'Off' | 'On' | 'Unknown';
  triggerCount: number;
  connectionReferenceCount: number;
  unexpectedRunObserved: boolean;
  receiptReference: string | null;
}

export interface ITenantCandidateObservation {
  sourceCommit: string;
  sourceTree: string;
  tenantPacketManifestSha256: string;
  companionPackageSha256: string;
  receiptReference: string | null;
}

/** Trusted candidate identity supplied independently of provider discovery. */
export type ITenantCandidateIdentity = Readonly<Pick<ITenantCandidateObservation,
  'sourceCommit' | 'sourceTree' | 'tenantPacketManifestSha256' | 'companionPackageSha256'>>;

export interface ITenantPackageTransitionAuthority {
  contractVersion: 'kcf.kpi.wib12.package-transition-authority.v1';
  authorityReference: string;
  targetCandidate: ITenantCandidateIdentity;
  targetBasePackage: Readonly<Pick<IPackageIdentityObservation, 'productId' | 'version' | 'binarySha256'>>;
  allowedPriorBasePackages: readonly Readonly<Pick<IPackageIdentityObservation,
    'productId' | 'version' | 'binarySha256' | 'receiptReference'>>[];
}

export interface ITenantPacketBeforeState {
  targetEvidence: ITenantTargetEvidence;
  appCatalogueScope: 'SiteCollection' | 'Tenant' | 'Unknown';
  appCatalogueId: string | null;
  globalAvailabilitySelected: boolean;
  basePackages: readonly IPackageIdentityObservation[];
  companionSolutions: readonly ISolutionIdentityObservation[];
  flows: readonly IFlowSafetyObservation[];
  productionReferenceObserved: boolean;
  candidate: ITenantCandidateObservation;
}

export type TenantPacketPreflightResult = {
  ready: true;
  code: 'TENANT_PACKET_ADD_ONLY_READY';
  basePackageAction: 'Add' | 'Upgrade' | 'NoOp';
  companionSolutionAction: 'Add' | 'NoOp';
  rollback: {
    flowFirst: 'Off';
    priorBasePackage: IPackageIdentityObservation | null;
    removeCompanionOnlyIfActionCreated: true;
    restoreReceiptedPriorOnly: true;
  };
} | {
  ready: false;
  code: string;
  reasons: readonly string[];
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const normalGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const versionParts = (value: string): readonly number[] | null => {
  const parts = value.split('.');
  if (parts.length !== 4 || parts.some(part => !/^\d+$/.test(part))) return null;
  const values = parts.map(Number);
  return values.some(part => !Number.isSafeInteger(part) || part < 0) ? null : values;
};
const versionGreaterThan = (left: string, right: string): boolean => {
  const a = versionParts(left); const b = versionParts(right);
  if (!a || !b) return false;
  for (let index = 0; index < 4; index++) {
    if (a[index] !== b[index]) return a[index] > b[index];
  }
  return false;
};

export function preflightTenantPacket(
  before: ITenantPacketBeforeState,
  expectedCandidate: ITenantCandidateIdentity,
  transitionAuthority: ITenantPackageTransitionAuthority
): TenantPacketPreflightResult {
  if (!SHA256.test(expectedCandidate.tenantPacketManifestSha256)
    || expectedCandidate.tenantPacketManifestSha256.toUpperCase() !== WI_B12_TENANT_MANIFEST_SHA256) {
    return { ready: false, code: 'TENANT_PACKET_MANIFEST_IDENTITY_INVALID',
      reasons: ['The executable candidate identity does not match the generated tenant manifest.'] };
  }
  const authority = immutableTenantInput(transitionAuthority);
  if (!authority || authority.contractVersion !== 'kcf.kpi.wib12.package-transition-authority.v1'
    || !nonBlank(authority.authorityReference) || !Array.isArray(authority.allowedPriorBasePackages)
    || authority.targetCandidate.sourceCommit.toLowerCase() !== expectedCandidate.sourceCommit.toLowerCase()
    || authority.targetCandidate.sourceTree.toLowerCase() !== expectedCandidate.sourceTree.toLowerCase()
    || authority.targetCandidate.tenantPacketManifestSha256.toUpperCase()
      !== expectedCandidate.tenantPacketManifestSha256.toUpperCase()
    || authority.targetCandidate.companionPackageSha256.toUpperCase()
      !== expectedCandidate.companionPackageSha256.toUpperCase()
    || normalGuid(authority.targetBasePackage.productId) !== WI_B12_BASE_SPFX_PRODUCT_ID
    || authority.targetBasePackage.version !== WI_B12_BASE_SPFX_VERSION
    || authority.targetBasePackage.binarySha256?.toUpperCase() !== WI_B12_BASE_SPFX_SHA256
    || !versionParts(authority.targetBasePackage.version)) {
    return { ready: false, code: 'TENANT_PACKET_TRANSITION_AUTHORITY_INVALID',
      reasons: ['A separate immutable exact package-transition authority is required.'] };
  }
  const observedManifestSha256 = before.candidate?.tenantPacketManifestSha256;
  if (!SHA256.test(observedManifestSha256 || '')
    || (observedManifestSha256 || '').toUpperCase() !== WI_B12_TENANT_MANIFEST_SHA256) {
    return { ready: false, code: 'TENANT_PACKET_NO_OVERWRITE_BLOCKED',
      reasons: ['The candidate commit/tree/manifest/companion receipt is not the frozen packet identity.'] };
  }
  try { assertKcfAutomationTenantTarget(before.targetEvidence); }
  catch (caught) {
    return { ready: false, code: 'TENANT_PACKET_TARGET_UNKNOWN', reasons: [caught instanceof Error ? caught.message : 'Target classification failed.'] };
  }
  const reasons: string[] = [];
  if (before.appCatalogueScope !== 'SiteCollection' || !before.appCatalogueId
    || !GUID.test(normalGuid(before.appCatalogueId))) reasons.push('A receipted site-collection app catalogue is required.');
  if (before.globalAvailabilitySelected) reasons.push('Global availability must not be selected.');
  if (before.productionReferenceObserved) reasons.push('A Production reference was observed.');
  const candidate = before.candidate;
  if (!/^[0-9a-f]{40}$/i.test(expectedCandidate.sourceCommit)
    || !/^[0-9a-f]{40}$/i.test(expectedCandidate.sourceTree)
    || !SHA256.test(expectedCandidate.tenantPacketManifestSha256)
    || expectedCandidate.companionPackageSha256.toUpperCase() !== WI_B12_COMPANION_SHA256
    || candidate.sourceCommit.toLowerCase() !== expectedCandidate.sourceCommit.toLowerCase()
    || candidate.sourceTree.toLowerCase() !== expectedCandidate.sourceTree.toLowerCase()
    || candidate.tenantPacketManifestSha256.toUpperCase()
      !== expectedCandidate.tenantPacketManifestSha256.toUpperCase()
    || candidate.companionPackageSha256.toUpperCase()
      !== expectedCandidate.companionPackageSha256.toUpperCase()
    || !nonBlank(candidate.receiptReference)) {
    reasons.push('The candidate commit/tree/manifest/companion receipt is not the frozen packet identity.');
  }
  const expectedFlows = new Map<string, string>([
    [WI_B12_BASE_WORKFLOW_ID, WI_B12_BASE_WORKFLOW_NAME],
    [WI_B12_COMPANION_WORKFLOW_ID, WI_B12_COMPANION_WORKFLOW_NAME]
  ]);
  if (before.flows.length !== expectedFlows.size || new Set(before.flows.map(flow => normalGuid(flow.workflowId))).size !== before.flows.length
    || before.flows.some(flow => expectedFlows.get(normalGuid(flow.workflowId)) !== flow.name
      || flow.state !== 'Off' || flow.triggerCount !== 0
      || flow.connectionReferenceCount !== 0 || flow.unexpectedRunObserved || !nonBlank(flow.receiptReference))) {
    reasons.push('Every old/new processor must be Off, triggerless, unbound and have no unexpected run.');
  }
  const sameBaseVersion = before.basePackages.filter(item => normalGuid(item.productId) === WI_B12_BASE_SPFX_PRODUCT_ID
    && item.version === WI_B12_BASE_SPFX_VERSION);
  if (sameBaseVersion.length > 1) reasons.push('The exact base product/version is duplicated.');
  if (sameBaseVersion.length === 1 && (!sameBaseVersion[0].installed
    || sameBaseVersion[0].binarySha256?.toUpperCase() !== WI_B12_BASE_SPFX_SHA256
    || !nonBlank(sameBaseVersion[0].receiptReference))) {
    reasons.push('The same base product/version lacks an exact receipted binary identity.');
  }
  const sameCompanion = before.companionSolutions.filter(item => item.uniqueName === WI_B12_COMPANION_SOLUTION_NAME
    && item.version === WI_B12_COMPANION_SOLUTION_VERSION);
  const companionVersionCollisions = before.companionSolutions.filter(item => item.installed
    && item.uniqueName === WI_B12_COMPANION_SOLUTION_NAME && item.version !== WI_B12_COMPANION_SOLUTION_VERSION);
  if (companionVersionCollisions.length)
    reasons.push('An installed same-name companion solution has a different version.');
  if (sameCompanion.length > 1) reasons.push('The exact companion solution/version is duplicated.');
  if (sameCompanion.length === 1 && (!sameCompanion[0].installed
    || sameCompanion[0].binarySha256?.toUpperCase() !== WI_B12_COMPANION_SHA256
    || !nonBlank(sameCompanion[0].receiptReference))) {
    reasons.push('The same companion solution/version lacks an exact receipted binary identity.');
  }
  if (reasons.length) return { ready: false, code: 'TENANT_PACKET_NO_OVERWRITE_BLOCKED', reasons };
  const installedBases = before.basePackages.filter(item => normalGuid(item.productId) === WI_B12_BASE_SPFX_PRODUCT_ID
    && item.installed);
  if (installedBases.length > 1)
    return { ready: false, code: 'TENANT_PACKET_NO_OVERWRITE_BLOCKED', reasons: ['Multiple installed base identities were observed.'] };
  const priorBase = installedBases.find(item => item.version !== WI_B12_BASE_SPFX_VERSION) || null;
  const allowedPrior = priorBase ? authority.allowedPriorBasePackages.find(item =>
    normalGuid(item.productId) === normalGuid(priorBase.productId) && item.version === priorBase.version
      && item.binarySha256?.toUpperCase() === priorBase.binarySha256?.toUpperCase()
      && item.receiptReference === priorBase.receiptReference) : undefined;
  if (priorBase && (!SHA256.test(priorBase.binarySha256 || '') || !nonBlank(priorBase.receiptReference)
    || !versionParts(priorBase.version) || !versionGreaterThan(WI_B12_BASE_SPFX_VERSION, priorBase.version)
    || !allowedPrior)) {
    return { ready: false, code: 'TENANT_PACKET_NO_OVERWRITE_BLOCKED',
      reasons: ['The installed prior base is not an expressly allowed, receipted, lower four-part version.'] };
  }
  return immutableTenantInput({
    ready: true, code: 'TENANT_PACKET_ADD_ONLY_READY',
    basePackageAction: sameBaseVersion.length === 1 ? 'NoOp' : priorBase ? 'Upgrade' : 'Add',
    companionSolutionAction: sameCompanion.length ? 'NoOp' : 'Add',
    rollback: { flowFirst: 'Off', priorBasePackage: priorBase, removeCompanionOnlyIfActionCreated: true,
      restoreReceiptedPriorOnly: true }
  });
}

export function assertTenantPackageRollbackIdentity(
  result: TenantPacketPreflightResult,
  transitionAuthority: ITenantPackageTransitionAuthority
): void {
  if (!result.ready || result.basePackageAction !== 'Upgrade') return;
  const prior = result.rollback.priorBasePackage;
  const allowed = immutableTenantInput(transitionAuthority).allowedPriorBasePackages;
  if (!prior || !allowed.some(item => normalGuid(item.productId) === normalGuid(prior.productId)
    && item.version === prior.version && item.binarySha256?.toUpperCase() === prior.binarySha256?.toUpperCase()
    && item.receiptReference === prior.receiptReference)) {
    throw new Error('TENANT_PACKET_ROLLBACK_IDENTITY_CHANGED: package action is blocked.');
  }
}
