import {
  EXACT_BODY_V5, V5_ADMISSION_CONTRACT, type V5Admission, type V5Authority,
  type V5DeliveryReferenceRow, type V5TaxonomyReferenceRow
} from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { V4ReferenceRow } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { v4Canonical, v4Equal, parseV4Draft } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { validateV5AdmissionView } from './OptionEWorkplanSubmitExactBodyV5Wire';
import { parseCanonicalOptionEDraftV2 } from './OptionEWorkplanDraftV2Wire';
import { validateV4References } from './OptionEWorkplanSubmitExactBodyV4';
import { selectEffectiveDeliveryPublication } from './GovernedDeliveryPublicationV1';
import type { GovernedDeliveryPublicationProposal, IGlobalDeliveryPublicationProposal,
  IManagerDeliveryPublicationProposal } from '../models/GovernedDeliveryPublicationV1Models';
import { resolveGovernedImpactTaxonomy, type IGovernedImpactTaxonomyContract } from './PersonalWorkplanPolicy';

const requireThat = (ok: boolean, reason: string): void => { if (!ok) throw new Error(reason); };
const utc = (value: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const date = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const publicationAt = (pin: { publishedAt: string; effectiveFrom: string }, eventAt: string): void => {
  requireThat(utc(pin.publishedAt) && date(pin.effectiveFrom) && pin.publishedAt <= eventAt
    && pin.effectiveFrom <= eventAt.slice(0, 10), 'PublicationNotEffectiveAtAdmission');
};
const nativeMetadata = (row: V5DeliveryReferenceRow | V5TaxonomyReferenceRow, eventAt: string): void => {
  const metadata = JSON.parse(row.nativeMetadataBody) as Record<string, unknown>;
  requireThat(metadata.Id === row.native.itemId && metadata['@odata.etag'] === row.native.etag
    && metadata.OData__UIVersionString === row.native.version && Number.isSafeInteger(metadata.AuthorId)
    && (metadata.AuthorId as number) > 0 && metadata.HasUniqueRoleAssignments === true
    && typeof metadata.Created === 'string' && utc(metadata.Created) && metadata.Created <= eventAt,
  'PublicationNativeCaptureMismatch');
};

/** Independent domain checks follow full observed-view structural validation.
 * Historical validation uses retained eventAt and captured publications only; no live fallback.
 * Neither this function nor a digest/boolean establishes a protected native origin.
 */
export function validateV5Admission(admission: V5Admission): void {
  validateV5AdmissionView(admission);
  const a = admission.authority, q = a.request.query, c = a.control, wp = a.workplan.value;
  requireThat((c.state === 'Draft' || c.state === 'ChangesRequested') && c.transition === 'Ready'
    && !c.command && !c.snapshot && wp.state === c.state && wp.transitionStatus === 'Ready', 'OriginalAdmissionStateInvalid');
  requireThat(a.request.createdBy === a.actor.principal && a.actor.active === true && a.manager.active === true
    && a.actor.principal !== a.manager.principal && a.actor.manager === a.manager.key
    && wp.managerPersonKey === a.manager.key && c.manager === a.manager.key, 'ProtectedActorManagerMismatch');
  requireThat(a.references.asOf <= admission.eventAt, 'ReferencesAfterAdmission');
  const draft = parseCanonicalOptionEDraftV2(a.draft.body);
  // Only a private validation projection; original V5 strings are never replaced or persisted as V4.
  const legacy = parseV4Draft(v4Canonical({ schemaVersion: 'kcf.workplan-draft/v1', core: draft.core,
    behaviours: draft.behaviours, impact: draft.impact.map(entry => Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== 'classificationSelection'))) }));
  const rows = a.references.rows.filter((row): row is V4ReferenceRow =>
    row.kind !== 'DeliveryConfiguration' && row.kind !== 'ImpactTaxonomy');
  validateV4References({ asOf: a.references.asOf, rows }, legacy, a.actor.key, c.year);
  rows.filter(row => row.kind === 'Catalogue').forEach(row => {
    const catalogue = JSON.parse(row.body) as { asOfDate: string };
    requireThat(catalogue.asOfDate === admission.eventAt.slice(0, 10), 'CatalogueHistoricalDateMismatch');
  });
  const deliveryRow = a.references.rows.find((row): row is V5DeliveryReferenceRow => row.kind === 'DeliveryConfiguration')!;
  const taxonomyRow = a.references.rows.find((row): row is V5TaxonomyReferenceRow => row.kind === 'ImpactTaxonomy')!;
  [deliveryRow, taxonomyRow].forEach(row => nativeMetadata(row, admission.eventAt));
  const proposal = JSON.parse(deliveryRow.body) as GovernedDeliveryPublicationProposal;
  const global = proposal.scope.kind === 'GlobalDefault' ? proposal as IGlobalDeliveryPublicationProposal
    : (proposal as IManagerDeliveryPublicationProposal).provenance.baseline;
  const override = proposal.scope.kind === 'WorkplanOverride' ? proposal as IManagerDeliveryPublicationProposal : undefined;
  const selected = selectEffectiveDeliveryPublication(global, override, wp);
  requireThat(v4Equal(selected, proposal), 'CapturedDeliverySelectionMismatch');
  publicationAt(global.payload.authority, admission.eventAt); publicationAt(proposal.payload.authority, admission.eventAt);
  if (override) {
    requireThat(v4Equal(override.provenance.workplanSource, a.workplan)
      && override.provenance.actorSource.value.personKey === a.manager.key
      && override.provenance.subjectSource.value.personKey === a.actor.key
      && override.provenance.approval.audit.eventAt <= admission.eventAt, 'CapturedManagerApprovalMismatch');
  }
  const publication = JSON.parse(taxonomyRow.body) as { payload: IGovernedImpactTaxonomyContract; provenance: { publisherPrincipal: number } };
  const taxonomy = publication.payload;
  publicationAt(taxonomy.authority, admission.eventAt);
  requireThat((JSON.parse(taxonomyRow.nativeMetadataBody) as { AuthorId: number }).AuthorId === publication.provenance.publisherPrincipal,
    'TaxonomyPublisherCaptureMismatch');
  const resolved = resolveGovernedImpactTaxonomy(taxonomy, taxonomy.authority, new Date(admission.eventAt));
  draft.impact.forEach(entry => {
    const selection = entry.classificationSelection, pin = selection.taxonomyPin, captured = taxonomy.authority;
    requireThat(pin.taxonomyId === captured.taxonomyId && pin.version === captured.version && pin.etag === captured.etag
      && pin.contentSha256 === captured.contentSha256, 'CapturedTaxonomyPinMismatch');
    requireThat(resolved.businessContributionAreas.filter(item => item.key === selection.businessContributionAreaKey).length === 1
      && (selection.strategicPillarKey === undefined || resolved.strategicPillars.filter(item => item.key === selection.strategicPillarKey).length === 1),
    'CapturedImpactSelectionMissing');
  });
  requireThat(q.person === wp.personKey && q.year === wp.performanceYear, 'CapturedWorkplanMismatch');
}

export function makeV5Admission(authority: V5Authority, key: string, eventAt: string): V5Admission {
  const admission: V5Admission = { contract: V5_ADMISSION_CONTRACT, capability: EXACT_BODY_V5, key, authority, eventAt };
  validateV5Admission(admission);
  return JSON.parse(v4Canonical(admission)) as V5Admission;
}
