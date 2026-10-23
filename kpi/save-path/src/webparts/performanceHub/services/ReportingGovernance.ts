import type {
  IGovernedReportingReference,
  IGovernedTaxonomyReference,
  IReportingProvenance,
  IReportingViewsDataset
} from '../models/ReportingModels';

export const APPROVED_BEHAVIOUR_CATALOGUE_SHA256 = '74F2AE0A7FDB33B72419CBF8897EEF0B45B23978583ABBF27DBF66581F504E8F';
export const APPROVED_BEHAVIOUR_TARGET_COUNT = 75;
export const APPROVED_BUSINESS_CONTRIBUTION_AREA_COUNT = 13;

const hasText = (value: string | undefined): value is string => typeof value === 'string' && value.trim().length > 0;

const validReference = (reference: IGovernedReportingReference | undefined): boolean => Boolean(
  reference && hasText(reference.id) && hasText(reference.versionKey) && hasText(reference.title) && hasText(reference.lifecycleState)
);

const validTaxonomyReference = (reference: IGovernedTaxonomyReference | undefined): boolean => Boolean(
  reference && validReference(reference) && Number.isFinite(Date.parse(reference.effectiveFrom)) && (!reference.retiredAt || Number.isFinite(Date.parse(reference.retiredAt)))
);

const sameProvenanceIdentity = (left: IReportingProvenance, right: IReportingProvenance): boolean =>
  left.reportRunId === right.reportRunId &&
  left.modelVersion === right.modelVersion &&
  left.cutTimestamp === right.cutTimestamp &&
  left.snapshotKey === right.snapshotKey;

const hasExactHistoryReference = (history: IGovernedTaxonomyReference[], reference: IGovernedReportingReference): boolean =>
  history.some(item => item.id === reference.id && item.versionKey === reference.versionKey && item.title === reference.title);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const arrayOfRecords = (value: unknown): value is Record<string, unknown>[] =>
  Array.isArray(value) && value.every(isRecord);

export const validateReportingGovernance = (dataset: IReportingViewsDataset): string[] => {
  const issues: string[] = [];
  if (!isRecord(dataset)) return ['The reporting dataset is absent or malformed.'];
  const delivery = dataset.deliverySummary;
  const governance = dataset.governance;

  if (!delivery) issues.push('The governed Overall Delivery result contract is absent.');
  if (!governance) issues.push('The governed reporting configuration is absent.');
  if (!delivery || !governance) return issues;

  if (!isRecord(delivery)) return [...issues, 'The governed Overall Delivery result contract is malformed.'];
  if (!isRecord(governance)) return [...issues, 'The governed reporting configuration is malformed.'];
  if (!isRecord(delivery.provenance) || !isRecord(delivery.core) || !isRecord(delivery.impact) ||
      !isRecord(delivery.overall) || !isRecord(delivery.poorCoreMaskingGuard)) {
    return [...issues, 'The governed Delivery provenance, components or masking guard are malformed.'];
  }
  if (!isRecord(dataset.core) || !isRecord(dataset.core.executive) || !isRecord(dataset.core.pillar) ||
      !isRecord(dataset.core.portfolio) || !isRecord(dataset.core.kpiDetail) ||
      ![dataset.core.executive.provenance, dataset.core.pillar.provenance,
        dataset.core.portfolio.provenance, dataset.core.kpiDetail.provenance].every(isRecord)) {
    return [...issues, 'The Core reporting feeds or provenance are absent or malformed.'];
  }
  if (!isRecord(dataset.impact) || !isRecord(dataset.impact.provenance)) {
    return [...issues, 'The Impact reporting feed or provenance is absent or malformed.'];
  }
  if (!isRecord(dataset.behaviour) || !isRecord(dataset.behaviour.provenance)) {
    return [...issues, 'The Behaviour reporting feed or provenance is absent or malformed.'];
  }
  if (!isRecord(governance.businessContributionAreas) ||
      !arrayOfRecords(governance.businessContributionAreas.defaultReferences) ||
      !arrayOfRecords(governance.businessContributionAreas.history)) {
    return [...issues, 'The governed Business Contribution Area defaults or history are absent or malformed.'];
  }
  if (!isRecord(governance.strategicPillars) || !arrayOfRecords(governance.strategicPillars.history)) {
    return [...issues, 'The governed Strategic Pillar history is absent or malformed.'];
  }
  if (!arrayOfRecords(dataset.impact.rows) || dataset.impact.rows.some(row =>
    (row.businessContributionArea !== undefined && !isRecord(row.businessContributionArea)) ||
    (row.pillar !== undefined && !isRecord(row.pillar)))) {
    return [...issues, 'The Impact rows or historic references are absent or malformed.'];
  }
  if (!arrayOfRecords(dataset.behaviour.headlines) || dataset.behaviour.headlines.some(headline =>
    !isRecord(headline.headlineReference))) {
    return [...issues, 'The Behaviour headlines or headline references are absent or malformed.'];
  }

  if (!hasText(delivery.contractId) || !hasText(delivery.contractVersion) || !hasText(delivery.snapshotKey)) {
    issues.push('The Overall Delivery result contract identity is incomplete.');
  }
  if (delivery.freshnessState !== 'Current') issues.push('The Overall Delivery result contract is stale.');
  if (!validReference(delivery.weightingConfiguration)) issues.push('The Delivery weighting configuration reference is incomplete.');
  if (delivery.snapshotKey !== delivery.provenance.snapshotKey) issues.push('The Delivery result snapshot does not match its provenance.');
  if (delivery.core.domain !== 'Core' || delivery.impact.domain !== 'Impact') issues.push('The Delivery component domains are mismatched.');
  if (delivery.core.state !== 'Reportable' || delivery.impact.state !== 'Reportable' || delivery.overall.state !== 'Reportable') {
    issues.push('Core, Impact and Overall Delivery must all be reportable; NotRated or missing governed results fail closed.');
  }
  if (![delivery.core.configuredWeightPercent, delivery.impact.configuredWeightPercent].every(value => Number.isFinite(value) && value >= 0 && value <= 100)) {
    issues.push('Core and Impact weights must be finite percentages from zero to 100.');
  } else if (delivery.core.configuredWeightPercent + delivery.impact.configuredWeightPercent !== 100) {
    issues.push('Configured Core and Impact weights must total exactly 100%.');
  }
  if (delivery.isDefaultWeighting && (delivery.core.configuredWeightPercent !== 70 || delivery.impact.configuredWeightPercent !== 30)) {
    issues.push('The default Delivery weighting must be supplied as Core 70% and Impact 30%.');
  }
  if ([delivery.core.resultDisplay, delivery.core.weightedContributionDisplay, delivery.core.sourceResultRef, delivery.impact.resultDisplay, delivery.impact.weightedContributionDisplay, delivery.impact.sourceResultRef, delivery.overall.resultDisplay, delivery.overall.classificationDisplay, delivery.overall.sourceResultRef].some(value => !hasText(value))) {
    issues.push('The governed Delivery result contract is incomplete.');
  }
  if (!['Applied', 'NotTriggered'].some(disposition => disposition === delivery.poorCoreMaskingGuard.disposition) || !hasText(delivery.poorCoreMaskingGuard.display) || !hasText(delivery.poorCoreMaskingGuard.policyReference)) {
    issues.push('The poor-Core masking guard must provide a governed applied/not-triggered disposition and policy reference.');
  }
  if (Object.prototype.hasOwnProperty.call(delivery, 'behaviourScore') || Object.prototype.hasOwnProperty.call(delivery, 'behaviourWeightPercent')) {
    issues.push('Behaviour data cannot enter the Overall Delivery result contract.');
  }

  const feedProvenance = [
    dataset.core.executive.provenance,
    dataset.core.pillar.provenance,
    dataset.core.portfolio.provenance,
    dataset.core.kpiDetail.provenance,
    dataset.impact.provenance,
    dataset.behaviour.provenance
  ];
  if (feedProvenance.some(provenance => !sameProvenanceIdentity(delivery.provenance, provenance))) {
    issues.push('The reporting feed provenance does not match the governed Delivery result snapshot.');
  }

  if (!validReference(governance.configurationReference)) issues.push('The reporting governance configuration reference is incomplete.');
  const defaults = governance.businessContributionAreas.defaultReferences;
  const history = governance.businessContributionAreas.history;
  if (defaults.length !== APPROVED_BUSINESS_CONTRIBUTION_AREA_COUNT) {
    issues.push(`The governed default Business Contribution Area configuration must contain exactly ${APPROVED_BUSINESS_CONTRIBUTION_AREA_COUNT} values.`);
  }
  if (defaults.some(reference => !validTaxonomyReference(reference)) || history.some(reference => !validTaxonomyReference(reference))) {
    issues.push('Business Contribution Area references require stable IDs, versions, labels, lifecycle and valid effective dates.');
  }
  if (new Set(defaults.map(reference => reference.id)).size !== defaults.length || new Set(defaults.map(reference => reference.versionKey)).size !== defaults.length) {
    issues.push('Default Business Contribution Area IDs and versions must be unique.');
  }
  if (defaults.some(reference => !hasExactHistoryReference(history, reference))) {
    issues.push('Every default Business Contribution Area version must be retained in governed history.');
  }
  dataset.impact.rows.forEach(row => {
    if (!row.businessContributionArea || !hasExactHistoryReference(history, row.businessContributionArea)) {
      issues.push(`${row.impactKey}: Business Contribution Area must resolve to an exact governed historic version.`);
    }
    if (row.pillar && !hasExactHistoryReference(governance.strategicPillars.history, row.pillar)) {
      issues.push(`${row.impactKey}: optional Strategic Pillar must resolve to an exact governed historic version.`);
    }
  });

  const catalogue = governance.behaviourCatalogue;
  if (typeof catalogue !== 'object' || catalogue === null || Array.isArray(catalogue)) {
    issues.push('The governed Behaviour catalogue is absent or malformed.');
    return issues;
  }
  const headlineReferences = catalogue.headlineReferences;
  if (!Array.isArray(headlineReferences) || headlineReferences.some(reference =>
    typeof reference !== 'object' || reference === null || Array.isArray(reference))) {
    issues.push('The governed Behaviour headline references are absent or malformed.');
    return issues;
  }
  if (!hasText(catalogue.catalogueId) || !hasText(catalogue.versionKey) || !hasText(catalogue.lifecycleState) || !Number.isFinite(Date.parse(catalogue.effectiveFrom))) {
    issues.push('The Behaviour catalogue reference identity is incomplete.');
  }
  if (catalogue.contentSha256 !== APPROVED_BEHAVIOUR_CATALOGUE_SHA256 || catalogue.detailedTargetCount !== APPROVED_BEHAVIOUR_TARGET_COUNT) {
    issues.push('The Behaviour catalogue reference does not match the Sponsor-approved v1 hash and 75-target count.');
  }
  if (catalogue.headlineReferences.length !== 5 || catalogue.headlineReferences.some(reference => !validTaxonomyReference(reference))) {
    issues.push('The Behaviour catalogue must expose exactly five valid governed headline identities.');
  }
  if (new Set(catalogue.headlineReferences.map(reference => reference.id)).size !== 5) {
    issues.push('The five governed Behaviour headline IDs must be unique.');
  }
  dataset.behaviour.headlines.forEach(headline => {
    if (!hasExactHistoryReference(catalogue.headlineReferences, headline.headlineReference) || headline.behaviourKey !== headline.headlineReference.id || headline.title !== headline.headlineReference.title) {
      issues.push(`${headline.behaviourKey}: headline identity must match the governed Behaviour catalogue version.`);
    }
  });

  return issues;
};
