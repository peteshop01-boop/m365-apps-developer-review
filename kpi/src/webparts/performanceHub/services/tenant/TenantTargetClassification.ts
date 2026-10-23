/* eslint-disable @rushstack/no-new-null -- null is the explicit absent evidence digest */
/**
 * Evidence-bound classification for the WI-B12 TEST tenant layer.
 *
 * The allow-list stores only the SHA-256 of the authoritative target tuple. Tenant, site,
 * web and catalogue identifiers remain runtime evidence and are never committed here.
 */
import { hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';

export const KCF_AUTOMATION_TARGET_EVIDENCE_SHA256 =
  '2BED23BF19E22C6FB3288036CB5426217574F056D7CF649C4AD43EC8E8B64825' as const;
export const KCF_AUTOMATION_ISOLATION_AUTHORITY = 'KCF-KPI-Sponsor-M013' as const;

export interface ITenantTargetEvidence {
  platformEnvironmentType: string;
  environmentId: string;
  siteUrl: string;
  siteCollectionId: string;
  rootWebId: string;
  appCatalogueScope: string;
  authorityReference: string;
  testOnlyBindings: boolean;
  productionExcluded: boolean;
}

export type TenantTargetClassification = {
  deploymentClassification: 'NonProduction';
  platformEnvironmentType: 'Default';
  evidenceSha256: string;
  authorityReference: typeof KCF_AUTOMATION_ISOLATION_AUTHORITY;
} | {
  deploymentClassification: 'Unknown';
  platformEnvironmentType: string;
  evidenceSha256: string | null;
  reasons: readonly string[];
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENVIRONMENT_ID = /^Default-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const normalUrl = (value: string): string => value.trim().replace(/\/+$/, '');

export function canonicalTenantTargetEvidence(evidence: ITenantTargetEvidence): ITenantTargetEvidence {
  return {
    platformEnvironmentType: evidence.platformEnvironmentType.trim(),
    environmentId: evidence.environmentId.trim(),
    siteUrl: normalUrl(evidence.siteUrl),
    siteCollectionId: normalGuid(evidence.siteCollectionId),
    rootWebId: normalGuid(evidence.rootWebId),
    appCatalogueScope: evidence.appCatalogueScope.trim(),
    authorityReference: evidence.authorityReference.trim(),
    testOnlyBindings: evidence.testOnlyBindings,
    productionExcluded: evidence.productionExcluded
  };
}

/** Low-level deterministic evaluator used by the fixed KCF gate and synthetic tests. */
export function evaluateTenantTargetEvidence(
  evidence: ITenantTargetEvidence | undefined,
  allowedEvidenceSha256: string
): TenantTargetClassification {
  if (!evidence) {
    return {
      deploymentClassification: 'Unknown', platformEnvironmentType: 'Unknown', evidenceSha256: null,
      reasons: ['Target evidence is absent.']
    };
  }
  const canonical = canonicalTenantTargetEvidence(evidence);
  const reasons: string[] = [];
  if (canonical.platformEnvironmentType !== 'Default') reasons.push('The native environment type is not Default.');
  if (!ENVIRONMENT_ID.test(canonical.environmentId)) reasons.push('The environment identity is malformed.');
  if (!GUID.test(canonical.siteCollectionId) || !GUID.test(canonical.rootWebId)) reasons.push('The site or web identity is malformed.');
  if (!/^https:\/\/[^/]+\/sites\/[^/]+$/i.test(canonical.siteUrl)) reasons.push('The site URL is not an exact site-collection root.');
  if (canonical.appCatalogueScope !== 'SiteCollection') reasons.push('The app catalogue is not site-collection scoped.');
  if (canonical.authorityReference !== KCF_AUTOMATION_ISOLATION_AUTHORITY) reasons.push('The isolation authority does not match.');
  if (!canonical.testOnlyBindings) reasons.push('The bindings are not explicitly TEST-only.');
  if (!canonical.productionExcluded) reasons.push('Production exclusion is not evidenced.');
  const evidenceSha256 = hashC2bCanonical(canonical);
  if (!/^[0-9a-f]{64}$/i.test(allowedEvidenceSha256)
    || evidenceSha256.toUpperCase() !== allowedEvidenceSha256.toUpperCase()) {
    reasons.push('The authoritative target-evidence digest does not match.');
  }
  if (reasons.length) {
    return {
      deploymentClassification: 'Unknown', platformEnvironmentType: canonical.platformEnvironmentType,
      evidenceSha256, reasons
    };
  }
  return {
    deploymentClassification: 'NonProduction', platformEnvironmentType: 'Default', evidenceSha256,
    authorityReference: KCF_AUTOMATION_ISOLATION_AUTHORITY
  };
}

/** The only production classification entry point. Its allow-list cannot be caller-overridden. */
export function classifyKcfAutomationTenantTarget(
  evidence: ITenantTargetEvidence | undefined
): TenantTargetClassification {
  return evaluateTenantTargetEvidence(evidence, KCF_AUTOMATION_TARGET_EVIDENCE_SHA256);
}

export function assertKcfAutomationTenantTarget(
  evidence: ITenantTargetEvidence | undefined
): Extract<TenantTargetClassification, { deploymentClassification: 'NonProduction' }> {
  const classification = classifyKcfAutomationTenantTarget(evidence);
  if (classification.deploymentClassification !== 'NonProduction') {
    throw new Error(`KCF_TENANT_TARGET_UNKNOWN: ${classification.reasons.join(' ')}`);
  }
  return classification;
}
