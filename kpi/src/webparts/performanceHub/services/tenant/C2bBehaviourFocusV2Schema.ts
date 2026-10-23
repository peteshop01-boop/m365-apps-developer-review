/** Tenant-neutral schema and receipt contract. No list operation is performed here. */
import { canonicaliseC2b, hashC2bCanonical, hashC2bUtf8Text } from '../TestPilotCommandAdmissionC2b';
import { C2B_ANNUAL_SELECTION_SCHEMA_REVISION, C2B_BEHAVIOUR_FOCUS_ROW_FIELDS,
  C2B_BEHAVIOUR_FOCUS_SCHEMA_REVISION, C2B_BEHAVIOUR_PUBLICATION_FIELDS,
  C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS, C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION_V2 }
  from './C2bPhysicalConvergenceContract';

export const C2B_BEHAVIOUR_FOCUS_V2_SCHEMA = Object.freeze({
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v2' as const,
  executionLock: 'PACKAGE_ONLY_NO_TENANT_MUTATION' as const,
  lists: Object.freeze([
    Object.freeze({ purpose: 'BehaviourFocusCatalogue' as const,
      title: 'KCFKPI_BehaviourFocusCatalogue', schemaRevision: C2B_BEHAVIOUR_FOCUS_SCHEMA_REVISION,
      stableKey: 'CatalogueRowKey', majorVersioningEnabled: true, appendOnly: true,
      fields: C2B_BEHAVIOUR_FOCUS_ROW_FIELDS }),
    Object.freeze({ purpose: 'BehaviourCataloguePublications' as const,
      title: 'KCFKPI_BehaviourCataloguePublications', schemaRevision: C2B_BEHAVIOUR_FOCUS_SCHEMA_REVISION,
      stableKey: 'PublicationKey', majorVersioningEnabled: true, appendOnly: true,
      fields: C2B_BEHAVIOUR_PUBLICATION_FIELDS })
  ]),
  workplanItems: Object.freeze({ purpose: 'WorkplanItems' as const,
    schemaRevision: C2B_ANNUAL_SELECTION_SCHEMA_REVISION, majorVersioningEnabled: true,
    fields: C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS })
});

/** Rebuild the reviewed generator's projected JSON rows, not provider response order or JSON. */
export const hashC2bProjectedFocusRows = (rows: readonly Readonly<Record<string, unknown>>[]): string => {
  if (!Array.isArray(rows) || rows.length === 0
    || new Set(rows.map(row => row.TargetKey)).size !== rows.length
    || rows.some(row => typeof row.TargetKey !== 'string' || !row.TargetKey
      || typeof row.BehaviourKey !== 'string' || typeof row.RoleLevelCode !== 'string'
      || typeof row.FocusKey !== 'string' || typeof row.FocusArea !== 'string'
      || typeof row.SuggestedTarget !== 'string' || typeof row.SuggestedMeasure !== 'string'
      || typeof row.SuggestedUnit !== 'string' || typeof row.SuggestedEvidence !== 'string'
      || !Number.isSafeInteger(row.SortOrder) || Number(row.SortOrder) < 1)) {
    throw new Error('The physical Behaviour focus rows cannot be projected exactly.');
  }
  const projected = [...rows].sort((left, right) => String(left.BehaviourKey).localeCompare(String(right.BehaviourKey))
    || String(left.FocusKey).localeCompare(String(right.FocusKey))
    || String(left.RoleLevelCode).localeCompare(String(right.RoleLevelCode)))
    .map(row => ({
      targetKey: row.TargetKey, behaviourKey: row.BehaviourKey, roleLevelCode: row.RoleLevelCode,
      focusKey: row.FocusKey, focusArea: row.FocusArea,
      exampleText: row.SuggestedTarget, suggestedTarget: row.SuggestedTarget,
      suggestedMeasure: row.SuggestedMeasure, suggestedUnit: row.SuggestedUnit,
      suggestedEvidence: row.SuggestedEvidence,
      status: row.EffectiveStatus, sortOrder: row.SortOrder,
      effectiveFrom: String(row.EffectiveFrom || '').slice(0, 10),
      effectiveTo: row.EffectiveTo ? String(row.EffectiveTo).slice(0, 10) : null
    }));
  return hashC2bUtf8Text(JSON.stringify(projected));
};

export interface IC2bBehaviourFocusProvisioningReceiptV2 {
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v2';
  schemaRevision: typeof C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION_V2;
  receiptKey: string;
  revision: number;
  status: 'Completed';
  planSha256: string;
  previousReceiptSha256: string;
  receiptSha256: string;
  bindingAuthoritySha256: string;
  candidate: { commit: string; tree: string; tenantPacketManifestSha256: string;
    companionPackageSha256: string };
  siteUrl: string;
  workflowId: string;
  connectionReferenceId: string;
  cataloguePin: { catalogueKey: string; catalogueVersion: string; revision: number;
    contentSha256: string; contentCanonicalUtf8ByteLength: number; sourceSha256: string;
    sourceRowsCanonicalSha256: string; generatedRowsJsonSha256: string; rowCount: number };
  lists: readonly { purpose: 'BehaviourFocusCatalogue' | 'BehaviourCataloguePublications';
    listId: string; title: string; schemaRevision: typeof C2B_BEHAVIOUR_FOCUS_SCHEMA_REVISION;
    majorVersioningEnabled: true; observedFieldsSha256: string; aclEvidenceSha256: string }[];
  workplanItems: { listId: string; schemaRevision: typeof C2B_ANNUAL_SELECTION_SCHEMA_REVISION;
    majorVersioningEnabled: true; additiveFieldsSha256: string };
  principalsSha256: string;
  negativeAccessEvidenceSha256: string;
}

const sha = (value: unknown): value is string => typeof value === 'string' && /^[A-F0-9]{64}$/i.test(value);
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** Exact receipt is a reviewed template; a v1 receipt never satisfies this assertion. */
export const assertC2bBehaviourFocusProvisioningReceiptV2 = (
  receipt: IC2bBehaviourFocusProvisioningReceiptV2
): Readonly<IC2bBehaviourFocusProvisioningReceiptV2> => {
  const initial = receipt?.cataloguePin?.catalogueVersion === 'KCF-BHV-PD03-2026.09-v1';
  const initialValid = !initial || (receipt.cataloguePin.catalogueKey === 'KCF-KCCC-BEHAVIOUR-FOCUS'
    && receipt.cataloguePin.revision === 1 && receipt.cataloguePin.rowCount === 75
    && receipt.cataloguePin.contentSha256.toUpperCase() === 'FADBC5D795AB7F092D984EF19F91B936BC23337F828F53EB5B0C86CADBCE709C'
    && receipt.cataloguePin.sourceRowsCanonicalSha256.toUpperCase() === 'FADBC5D795AB7F092D984EF19F91B936BC23337F828F53EB5B0C86CADBCE709C'
    && receipt.cataloguePin.generatedRowsJsonSha256.toUpperCase() === '3420F5D1FDF3E427F65E2F54FB86545DFC94699992F818921AE7783D790F15E4'
    && receipt.cataloguePin.sourceSha256.toUpperCase() === '851BA6C4C315986ADB17F3FC0ADCFDAFBA59B225BD97201918462CC85AD338A4'
    && receipt.cataloguePin.contentCanonicalUtf8ByteLength === 35668);
  if (!receipt || receipt.contractVersion !== 'kcf.kpi.wib12.tenant-layer.v2'
    || receipt.schemaRevision !== C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION_V2
    || !/^tenant-provision\|[0-9A-F]{64}$/i.test(receipt.receiptKey)
    || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1
    || receipt.status !== 'Completed' || !sha(receipt.planSha256)
    || !sha(receipt.previousReceiptSha256) || !sha(receipt.bindingAuthoritySha256)
    || !sha(receipt.receiptSha256) || !sha(receipt.principalsSha256)
    || !sha(receipt.negativeAccessEvidenceSha256)
    || !/^[0-9a-f]{40}$/i.test(receipt.candidate?.commit)
    || !/^[0-9a-f]{40}$/i.test(receipt.candidate?.tree)
    || !sha(receipt.candidate?.tenantPacketManifestSha256)
    || !sha(receipt.candidate?.companionPackageSha256)
    || !text(receipt.siteUrl) || !guid(receipt.workflowId) || !text(receipt.connectionReferenceId)
    || receipt.lists?.length !== 2
    || new Set(receipt.lists.map(list => list.purpose)).size !== 2
    || new Set(receipt.lists.map(list => list.listId.toLowerCase())).size !== 2
    || receipt.lists.some(list => !guid(list.listId)
      || list.title !== C2B_BEHAVIOUR_FOCUS_V2_SCHEMA.lists.find(item => item.purpose === list.purpose)?.title
      || list.schemaRevision !== C2B_BEHAVIOUR_FOCUS_SCHEMA_REVISION
      || list.majorVersioningEnabled !== true
      || list.observedFieldsSha256 !== hashC2bCanonical(
        C2B_BEHAVIOUR_FOCUS_V2_SCHEMA.lists.find(item => item.purpose === list.purpose)?.fields)
      || !sha(list.aclEvidenceSha256))
    || !guid(receipt.workplanItems?.listId)
    || receipt.workplanItems.schemaRevision !== C2B_ANNUAL_SELECTION_SCHEMA_REVISION
    || receipt.workplanItems.majorVersioningEnabled !== true
    || receipt.workplanItems.additiveFieldsSha256 !== hashC2bCanonical(C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS)
    || !text(receipt.cataloguePin?.catalogueKey)
    || !text(receipt.cataloguePin.catalogueVersion)
    || !Number.isSafeInteger(receipt.cataloguePin.revision)
    || !sha(receipt.cataloguePin.contentSha256)
    || !Number.isSafeInteger(receipt.cataloguePin.contentCanonicalUtf8ByteLength)
    || !sha(receipt.cataloguePin.sourceSha256)
    || !sha(receipt.cataloguePin.sourceRowsCanonicalSha256)
    || !sha(receipt.cataloguePin.generatedRowsJsonSha256)
    || !Number.isSafeInteger(receipt.cataloguePin.rowCount)) {
    throw new Error('The Behaviour focus v2 provisioning receipt is incomplete or crossed.');
  }
  if (!initialValid) throw new Error('The initial Behaviour publication pin substituted a source or content hash.');
  const content = Object.keys(receipt).filter(key => key !== 'receiptSha256')
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = receipt[key as keyof IC2bBehaviourFocusProvisioningReceiptV2]; return result;
    }, {});
  if (hashC2bCanonical(content) !== receipt.receiptSha256
    || canonicaliseC2b(content).length < 2) {
    throw new Error('The Behaviour focus v2 receipt digest is invalid.');
  }
  return receipt;
};
