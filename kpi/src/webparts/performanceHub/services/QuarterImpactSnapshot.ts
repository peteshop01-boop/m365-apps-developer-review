import type { IPersonalWorkplanItem } from '../models/ProductionModels';
import type {
  IQuarterImpactAnnualDefinitionSnapshot,
  IQuarterImpactClassificationSelectionSnapshot,
  IQuarterImpactClassificationSnapshot,
  IQuarterReviewItem
} from '../models/QuarterlyModels';

export interface IQuarterImpactAnnualSource extends IPersonalWorkplanItem {
  readonly impactClassification?: Readonly<IQuarterImpactClassificationSnapshot>;
}

export interface IQuarterImpactTargetSnapshot {
  readonly value?: number;
  readonly text?: string;
}

const snapshotSelection = (
  value: Readonly<IQuarterImpactClassificationSelectionSnapshot> | undefined,
  label: string
): Readonly<IQuarterImpactClassificationSelectionSnapshot> | undefined => {
  if (!value) return undefined;
  if (!value.key?.trim() || !value.label?.trim() || !value.source?.trim()) {
    throw new Error(`${label} must retain a governed key, label and source.`);
  }
  return Object.freeze({
    key: value.key,
    label: value.label,
    source: value.source,
    sourceReference: value.sourceReference,
    ...(value.taxonomyId === undefined ? {} : { taxonomyId: value.taxonomyId }),
    ...(value.taxonomyVersion === undefined ? {} : { taxonomyVersion: value.taxonomyVersion }),
    ...(value.taxonomyEtag === undefined ? {} : { taxonomyEtag: value.taxonomyEtag }),
    ...(value.taxonomyApprovalReference === undefined ? {} : { taxonomyApprovalReference: value.taxonomyApprovalReference })
  });
};

const snapshotClassification = (
  value: Readonly<IQuarterImpactClassificationSnapshot> | undefined
): Readonly<IQuarterImpactClassificationSnapshot> | undefined => {
  if (!value) return undefined;
  if (!value.businessContributionArea) {
    throw new Error('An approved Impact classification requires one governed Business Contribution Area.');
  }
  return Object.freeze({
    strategicPillar: snapshotSelection(value.strategicPillar, 'Strategic Pillar'),
    businessContributionArea: snapshotSelection(value.businessContributionArea, 'Business Contribution Area')
  });
};

/**
 * Creates the immutable annual input for one quarterly Impact result. Absence
 * of a classification remains distinguishable from an approved classification;
 * a partial/forged classification is rejected.
 */
export const createQuarterImpactAnnualDefinitionSnapshot = (
  source: Readonly<IQuarterImpactAnnualSource>,
  target: Readonly<IQuarterImpactTargetSnapshot>
): Readonly<IQuarterImpactAnnualDefinitionSnapshot> => Object.freeze({
  sourceWorkplanItemKey: source.workplanItemKey,
  wording: source.wording,
  intendedOutcome: source.description,
  measure: source.measure,
  unitLabel: source.unitLabel,
  metricType: source.measureType || 'Other',
  scoringDirection: source.scoringDirection || 'TBC',
  percentageSourceScale: source.percentageSourceScale,
  baselineValue: source.baselineValue,
  yearEndTargetValue: source.yearEndTargetValue,
  yearEndTargetText: source.yearEndTargetText,
  quarterTargetValue: target.value,
  quarterTargetText: target.text,
  workplanItemWeight: source.personalItemWeight,
  classification: snapshotClassification(source.impactClassification)
});

const sameSelection = (
  left: Readonly<IQuarterImpactClassificationSelectionSnapshot> | undefined,
  right: Readonly<IQuarterImpactClassificationSelectionSnapshot> | undefined
): boolean => left === right || Boolean(left && right
  && left.key === right.key
  && left.label === right.label
  && left.source === right.source
  && left.sourceReference === right.sourceReference
  && left.taxonomyId === right.taxonomyId
  && left.taxonomyVersion === right.taxonomyVersion
  && left.taxonomyEtag === right.taxonomyEtag
  && left.taxonomyApprovalReference === right.taxonomyApprovalReference);

const sameClassification = (
  left: Readonly<IQuarterImpactClassificationSnapshot> | undefined,
  right: Readonly<IQuarterImpactClassificationSnapshot> | undefined
): boolean => left === right || Boolean(left && right
  && sameSelection(left.strategicPillar, right.strategicPillar)
  && sameSelection(left.businessContributionArea, right.businessContributionArea));

/** Proves that editable progress has not altered the approved annual input. */
export const assertQuarterImpactAnnualSnapshot = (item: Readonly<IQuarterReviewItem>): void => {
  if (item.itemType !== 'LocalPersonal' || item.reportingStream !== 'Impact') {
    throw new Error('The Quarterly item is not an Impact reporting-stream snapshot.');
  }
  const snapshot = item.impactAnnualDefinitionSnapshot;
  const canonicalClassification = snapshot ? snapshotClassification(snapshot.classification) : undefined;
  if (!snapshot
    || snapshot.sourceWorkplanItemKey !== item.workplanItemKey
    || snapshot.wording !== item.wording
    || snapshot.intendedOutcome !== item.itemDescription
    || snapshot.measure !== item.measure
    || snapshot.unitLabel !== item.unitLabel
    || snapshot.metricType !== (item.metricType || 'Other')
    || snapshot.scoringDirection !== (item.scoringDirection || 'TBC')
    || snapshot.percentageSourceScale !== item.percentageSourceScale
    || snapshot.baselineValue !== item.baselineValue
    || snapshot.yearEndTargetValue !== item.yearEndTargetValueSnapshot
    || snapshot.yearEndTargetText !== item.yearEndTargetTextSnapshot
    || snapshot.quarterTargetValue !== item.quarterTargetValue
    || snapshot.quarterTargetText !== item.quarterTargetText
    || snapshot.workplanItemWeight !== item.workplanItemWeightSnapshot
    || !sameClassification(snapshot.classification, canonicalClassification)) {
    throw new Error('The Impact annual definition/classification snapshot no longer matches the saved quarterly item.');
  }
};
