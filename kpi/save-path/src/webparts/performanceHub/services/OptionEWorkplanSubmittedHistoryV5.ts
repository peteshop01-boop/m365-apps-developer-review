import type { IAnnualWorkplan, IImpactClassificationSelection } from '../models/ProductionModels';
import type { GovernedDeliveryPublicationProposal, IGlobalDeliveryPublicationProposal,
  IManagerDeliveryPublicationProposal } from '../models/GovernedDeliveryPublicationV1Models';
import type { V5Authority, V5DeliveryReferenceRow, V5TaxonomyReferenceRow, V5Snapshot, V5Receipt } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { IV5HistoryCapture, IV5CapturedHistoryCapture, IV5HistoryCoordinates, IV5HistoricalTaxonomyPublication,
  IV5SubmittedHistory, V5SubmittedHistoryResult } from '../models/OptionEWorkplanSubmittedHistoryV5Models';
import { parseV5Receipt, parseV5Snapshot } from './OptionEWorkplanSubmitExactBodyV5Wire';
import { parseV5CapturedReceipt, parseV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { v4Canonical } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { parseCanonicalOptionEDraftV2 } from './OptionEWorkplanDraftV2Wire';
import { buildGlobalDeliveryPublicationProposal } from './GovernedDeliveryPublicationV1';
import { resolveGovernedDeliveryWeightConfiguration, validateDeliveryCategoryWeights,
  type IDeliveryCategoryWeights } from './CategoryWeightingPolicy';
import { resolveGovernedImpactTaxonomy, type IGovernedImpactTaxonomyOption } from './PersonalWorkplanPolicy';
import { controlledApplicationRoles } from './ControlledApplicationRoles';
import { canonicalisePlainRecord } from './SecurityBoundaryCanonicalisation';

const requireThat = (condition: unknown): void => { if (!condition) throw new Error('InvalidHistoricalCapture'); };
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const equal = (left: unknown, right: unknown): boolean => v4Canonical(left) === v4Canonical(right);
const mail = (value: string): string => value.trim().toLowerCase();
const utc = (value: string): boolean => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const date = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const sameWeights = (left: Readonly<IDeliveryCategoryWeights>, right: Readonly<IDeliveryCategoryWeights>): boolean =>
  left.core === right.core && left.impact === right.impact;

const workplanValid = (workplan: Readonly<IAnnualWorkplan>): void => {
  requireThat([workplan.workplanKey, workplan.personKey, workplan.employeeDisplayName, workplan.employeeEmail,
    workplan.accessState].every(text) && ['Draft', 'ChangesRequested'].includes(workplan.state)
    && workplan.transitionStatus === 'Ready' && workplan.performanceYear <= 2100
    && [workplan.coreCategoryWeight, workplan.personalCategoryWeight, workplan.behaviourCategoryWeight].every(Number.isFinite));
  if (workplan.overallDeliveryWeightConfiguration) {
    const existing = workplan.overallDeliveryWeightConfiguration;
    requireThat(text(existing.configurationKey) && text(existing.configurationVersion)
      && validateDeliveryCategoryWeights({ core: existing.coreWeight, impact: existing.impactWeight }, 'Captured configuration.').valid);
  }
};

const publicationTime = (authority: { effectiveFrom: string; publishedAt: string }, asOf: string): void => {
  requireThat(date(authority.effectiveFrom) && utc(authority.publishedAt)
    && Date.parse(authority.publishedAt) <= Date.parse(asOf)
    && Date.parse(`${authority.effectiveFrom}T00:00:00.000Z`) <= Date.parse(asOf));
};

const globalValid = (publication: Readonly<IGlobalDeliveryPublicationProposal>, year: number, asOf: string): void => {
  // This factory validates data only. The Manager approval/capability factories are deliberately not invoked.
  const validated = buildGlobalDeliveryPublicationProposal(publication.provenance.configSource, publication.payload);
  requireThat(equal(validated, publication) && publication.scope.year === year
    && sameWeights(publication.payload.activeWeights, { core: 70, impact: 30 }));
  publicationTime(publication.payload.authority, asOf);
};

/** Reconcile the captured approval as history; never re-approve it or bind an approval capability. */
const managerValid = (publication: Readonly<IManagerDeliveryPublicationProposal>, authority: V5Authority, asOf: string): void => {
  const provenance = publication.provenance;
  const workplan = provenance.workplanSource.value;
  const actor = provenance.actorSource.value, subject = provenance.subjectSource.value;
  const approval = provenance.approval, audit = approval.audit;
  globalValid(provenance.baseline, workplan.performanceYear, asOf);
  workplanValid(workplan);
  requireThat(equal(provenance.workplanSource, authority.workplan)
    && publication.scope.workplan === workplan.workplanKey && publication.scope.person === workplan.personKey
    && publication.scope.year === workplan.performanceYear);
  const roles = controlledApplicationRoles(actor.appRoles);
  requireThat([actor.personKey, actor.email, subject.personKey, subject.managerPersonKey, subject.managerEmail,
    workplan.managerPersonKey, workplan.managerEmail].every(text)
    && actor.active && roles?.includes('Manager') && !roles?.includes('SystemAdmin')
    && actor.personKey !== subject.personKey && mail(actor.email) !== mail(workplan.employeeEmail)
    && workplan.personKey === subject.personKey && actor.personKey === subject.managerPersonKey
    && workplan.managerPersonKey === subject.managerPersonKey
    && mail(actor.email) === mail(subject.managerEmail!) && mail(workplan.managerEmail!) === mail(subject.managerEmail!)
    && actor.personKey === authority.manager.key && subject.personKey === authority.actor.key);
  const wpNative = provenance.workplanSource.native;
  requireThat([provenance.actorSource.native, provenance.subjectSource.native].every(native =>
    native.siteId === wpNative.siteId && native.webId === wpNative.webId)
    && provenance.actorSource.native.listId === provenance.subjectSource.native.listId
    && provenance.actorSource.native.itemId !== provenance.subjectSource.native.itemId);
  requireThat(approval.actorPersonKey === actor.personKey.trim() && approval.subjectPersonKey === subject.personKey.trim()
    && approval.assignedManagerPersonKey === subject.managerPersonKey!.trim()
    && audit.actorEmail === mail(actor.email) && audit.actorRole === 'Manager'
    && text(audit.auditKey) && audit.auditKey === audit.auditKey.trim()
    && text(audit.reason) && audit.reason === audit.reason.trim()
    && audit.eventType === 'DeliveryWeightOverrideApproved' && utc(audit.eventAt)
    && audit.sourceVersion === workplan.rowVersionToken && audit.resultingState === workplan.state
    && Date.parse(audit.eventAt) >= Date.parse(provenance.baseline.payload.authority.publishedAt)
    && Date.parse(audit.eventAt) <= Date.parse(publication.payload.authority.publishedAt));
  const existing = workplan.overallDeliveryWeightConfiguration;
  const before = existing ? { core: existing.coreWeight, impact: existing.impactWeight } : provenance.baseline.payload.activeWeights;
  requireThat(validateDeliveryCategoryWeights(audit.before, audit.reason).valid
    && validateDeliveryCategoryWeights(audit.after, audit.reason).valid
    && sameWeights(audit.before, before) && sameWeights(audit.after, publication.payload.activeWeights)
    && !sameWeights(audit.before, audit.after));
};

const publicationCoordinates = (row: V5DeliveryReferenceRow | V5TaxonomyReferenceRow, authority: V5Authority): void => {
  const metadata = JSON.parse(row.nativeMetadataBody) as Record<string, unknown>;
  requireThat(metadata.Id === row.native.itemId && metadata.OData__UIVersionString === row.native.version
    && metadata['@odata.etag'] === row.native.etag
    && row.native.siteId === authority.workplan.native.siteId && row.native.webId === authority.workplan.native.webId);
};

const classify = (option: Readonly<IGovernedImpactTaxonomyOption>, taxonomy: IV5HistoricalTaxonomyPublication): IImpactClassificationSelection => ({
  key: option.key, label: option.label, source: option.source,
  ...(option.sourceReference === undefined ? {} : { sourceReference: option.sourceReference }),
  taxonomyId: taxonomy.payload.authority.taxonomyId, taxonomyVersion: taxonomy.payload.authority.version,
  taxonomyEtag: taxonomy.payload.authority.etag, taxonomyApprovalReference: taxonomy.payload.authority.approvalReference
});

/** Private mapping of already validated complete views; both public routes retain their original bytes. */
const mapParsedHistoryV5 = (
  snapshot: V5Snapshot, receipt: V5Receipt | undefined,
  capture: Readonly<IV5HistoryCapture | IV5CapturedHistoryCapture>, expected: Readonly<IV5HistoryCoordinates>
): V5SubmittedHistoryResult => {
    const admission = snapshot.admission, authority = admission.authority, request = authority.request.query;
    requireThat(request.workplan === expected.workplan && request.person === expected.person && request.year === expected.year
      && authority.request.createdBy === authority.actor.principal && authority.actor.manager === authority.manager.key
      && authority.workplan.value.managerPersonKey === authority.manager.key
      && Date.parse(authority.references.asOf) <= Date.parse(admission.eventAt)
      && (!receipt || Date.parse(receipt.nativeCreated) >= Date.parse(admission.eventAt)));
    workplanValid(authority.workplan.value);
    const deliveryRow = authority.references.rows.find(row => row.kind === 'DeliveryConfiguration') as V5DeliveryReferenceRow;
    const taxonomyRow = authority.references.rows.find(row => row.kind === 'ImpactTaxonomy') as V5TaxonomyReferenceRow;
    publicationCoordinates(deliveryRow, authority); publicationCoordinates(taxonomyRow, authority);
    const delivery = JSON.parse(deliveryRow.body) as GovernedDeliveryPublicationProposal;
    const taxonomy = JSON.parse(taxonomyRow.body) as IV5HistoricalTaxonomyPublication;
    const asOf = authority.references.asOf;
    publicationTime(delivery.payload.authority, asOf); publicationTime(taxonomy.payload.authority, asOf);
    const weights = resolveGovernedDeliveryWeightConfiguration(delivery.payload, delivery.payload.authority,
      new Date(delivery.payload.authority.publishedAt));
    const configuration = { configurationKey: weights.authority.configurationId,
      configurationVersion: weights.authority.version, coreWeight: weights.activeWeights.core,
      impactWeight: weights.activeWeights.impact, sourceReference: weights.authority.approvalReference };
    if (delivery.scope.kind === 'GlobalDefault') {
      globalValid(delivery as IGlobalDeliveryPublicationProposal, request.year, asOf);
      const capturedWorkplanConfiguration = authority.workplan.value.overallDeliveryWeightConfiguration;
      // An observed override cannot disappear into the global default when its captured publication is absent.
      requireThat(!capturedWorkplanConfiguration || equal(capturedWorkplanConfiguration, configuration));
    } else managerValid(delivery as IManagerDeliveryPublicationProposal, authority, asOf);
    resolveGovernedImpactTaxonomy(taxonomy.payload, taxonomy.payload.authority, new Date(admission.eventAt));
    [...taxonomy.payload.businessContributionAreas, ...taxonomy.payload.strategicPillars].forEach(option =>
      requireThat(date(option.effectiveFrom) && (option.effectiveTo === undefined || date(option.effectiveTo))));
    const draft = parseCanonicalOptionEDraftV2(snapshot.body);
    const impactClassifications = draft.impact.map(entry => {
      const selection = entry.classificationSelection, pin = selection.taxonomyPin, observed = taxonomy.payload.authority;
      requireThat(pin.taxonomyId === observed.taxonomyId && pin.version === observed.version
        && pin.etag === observed.etag && pin.contentSha256 === observed.contentSha256);
      const areas = taxonomy.payload.businessContributionAreas.filter(option => option.key === selection.businessContributionAreaKey);
      const pillars = selection.strategicPillarKey === undefined ? []
        : taxonomy.payload.strategicPillars.filter(option => option.key === selection.strategicPillarKey);
      requireThat(areas.length === 1 && (selection.strategicPillarKey === undefined || pillars.length === 1));
      return { impactId: entry.impactId, classification: { businessContributionArea: classify(areas[0], taxonomy),
        ...(pillars.length ? { strategicPillar: classify(pillars[0], taxonomy) } : {}) } };
    });
    const history: IV5SubmittedHistory = {
      coordinates: { ...expected }, capture: { ...capture }, snapshot, ...(receipt ? { receipt } : {}),
      raw: { requestBody: authority.request.body, referenceBody: request.referenceBody, draftBody: snapshot.body,
        deliveryBody: deliveryRow.body, taxonomyBody: taxonomyRow.body,
        deliveryNativeMetadataBody: deliveryRow.nativeMetadataBody, taxonomyNativeMetadataBody: taxonomyRow.nativeMetadataBody },
      draft, deliveryPublication: delivery, taxonomyPublication: taxonomy, impactClassifications,
      overallDeliveryWeightConfiguration: configuration
    };
    return Object.freeze({ status: 'DECODED_SOURCE_ONLY', history: canonicalisePlainRecord(history, 'V5 historical source data') });
};

/** Pure r2 decode. All policy dates and publications come from the capture; no live configuration or I/O is accepted. */
export const decodeOptionEWorkplanSubmittedHistoryV5 = (
  capture: Readonly<IV5HistoryCapture> | undefined,
  expected: Readonly<IV5HistoryCoordinates>
): V5SubmittedHistoryResult => {
  if (!capture) return Object.freeze({ status: 'HOLD', reason: 'MissingCapture' });
  try {
    requireThat(Object.keys(capture).length === 2 && ['receipt', 'snapshot'].includes(capture.kind)
      && typeof capture.canonicalBody === 'string' && Object.keys(expected).length === 3
      && text(expected.workplan) && text(expected.person) && Number.isInteger(expected.year));
    const receipt = capture.kind === 'receipt' ? parseV5Receipt(capture.canonicalBody) : undefined;
    const snapshot = receipt ? receipt.snapshot : parseV5Snapshot(capture.canonicalBody);
    return mapParsedHistoryV5(snapshot, receipt, capture, expected);
  } catch { return Object.freeze({ status: 'HOLD', reason: 'InvalidHistoricalCapture' }); }
};

/** Explicit captured-r3 decode; expanded logical views never pass through the bounded r2 parsers. */
export const decodeOptionEWorkplanSubmittedCapturedHistoryV5 = (
  capture: Readonly<IV5CapturedHistoryCapture> | undefined,
  expected: Readonly<IV5HistoryCoordinates>
): V5SubmittedHistoryResult => {
  if (!capture) return Object.freeze({ status: 'HOLD', reason: 'MissingCapture' });
  try {
    requireThat(Object.keys(capture).length === 3 && capture.encoding === 'captured-native-request/v1'
      && ['receipt', 'snapshot'].includes(capture.kind) && typeof capture.canonicalBody === 'string'
      && Object.keys(expected).length === 3 && text(expected.workplan) && text(expected.person) && Number.isInteger(expected.year));
    const receipt = capture.kind === 'receipt' ? parseV5CapturedReceipt(capture.canonicalBody) : undefined;
    const snapshot = receipt ? receipt.snapshot : parseV5CapturedSnapshot(capture.canonicalBody);
    return mapParsedHistoryV5(snapshot, receipt, capture, expected);
  } catch { return Object.freeze({ status: 'HOLD', reason: 'InvalidHistoricalCapture' }); }
};
