import type { IAnnualWorkplan, IBehaviourWorkplanItem } from '../models/ProductionModels';
import type { BehaviourRating } from '../models/BehaviourWorkplanModels';
import type { IQuarterReviewItem } from '../models/QuarterlyModels';

const EXPECTED_BEHAVIOUR_COUNT = 5;

const hasText = (value: string | undefined): boolean => Boolean(value?.trim());
const hasRating = (value: BehaviourRating | undefined): boolean =>
  value === 1 || value === 2 || value === 3 || value === 4;

const hasCurrentAnnualDefinition = (item: IBehaviourWorkplanItem): boolean =>
  hasText(item.objectiveTitle)
  && hasText(item.objectiveDescription)
  && hasText(item.measure)
  && hasText(item.unit)
  && hasText(item.evidenceDefinition)
  && hasText(item.q1TargetText)
  && hasText(item.q2TargetText)
  && hasText(item.q3TargetText)
  && hasText(item.q4TargetText)
  && hasRating(item.q1TargetRating)
  && hasRating(item.q2TargetRating)
  && hasRating(item.q3TargetRating)
  && hasRating(item.q4TargetRating);

const hasCurrentQuarterSnapshot = (item: IQuarterReviewItem): boolean =>
  hasText(item.behaviourObjectiveTitle)
  && hasText(item.behaviourObjectiveDescription)
  && hasText(item.measure)
  && hasText(item.unitLabel)
  && hasText(item.behaviourEvidenceDefinition)
  && hasText(item.quarterTargetText)
  && hasRating(item.behaviourTargetRating);

export interface ILegacySubmittedBehaviourCompatibility {
  activeHeadingCount: number;
  completeObjectiveCount: number;
  headingStatus: string;
  completionSummary: string;
  annualNotice: string;
  quarterlyNotice: string;
  managerAction: string;
}

const buildCompatibility = (
  workplan: IAnnualWorkplan | undefined,
  activeHeadingCount: number,
  completeObjectiveCount: number
): ILegacySubmittedBehaviourCompatibility | undefined => {
  if (workplan?.state !== 'Submitted'
    || activeHeadingCount !== EXPECTED_BEHAVIOUR_COUNT
    || completeObjectiveCount === EXPECTED_BEHAVIOUR_COUNT) return undefined;

  return {
    activeHeadingCount,
    completeObjectiveCount,
    headingStatus: `${activeHeadingCount} of ${EXPECTED_BEHAVIOUR_COUNT} headings assigned · ${completeObjectiveCount} of ${EXPECTED_BEHAVIOUR_COUNT} current objectives complete`,
    completionSummary: 'Submitted legacy framework · update required',
    annualNotice: 'This Submitted Workplan has all five Behaviour headings, but it does not contain the complete current Behaviour objectives and Q1–Q4 targets. It remains read-only and incomplete; no missing objective, target or approval evidence has been inferred.',
    quarterlyNotice: 'Quarterly Behaviour readiness remains blocked because the Submitted Annual Workplan does not contain the complete current Behaviour objectives and quarter targets. No missing target or assessment has been inferred.',
    managerAction: 'Only the genuinely authenticated assigned manager may use Request Changes so the employee can complete and resubmit this same Workplan.'
  };
};

export const getLegacySubmittedAnnualBehaviourCompatibility = (
  workplan: IAnnualWorkplan | undefined,
  items: ReadonlyArray<IBehaviourWorkplanItem>
): ILegacySubmittedBehaviourCompatibility | undefined => {
  const active = items.filter(item => item.activeInWorkplan);
  if (active.some(item => Boolean(item.behaviourSnapshotV2))) return undefined;
  return buildCompatibility(workplan, active.length, active.filter(hasCurrentAnnualDefinition).length);
};

export const getLegacySubmittedQuarterBehaviourCompatibility = (
  workplan: IAnnualWorkplan | undefined,
  items: ReadonlyArray<IQuarterReviewItem>
): ILegacySubmittedBehaviourCompatibility | undefined => {
  const behaviours = items.filter(item => item.itemType === 'Behaviour');
  if (behaviours.some(item => Boolean(item.behaviourSnapshotV2))) return undefined;
  return buildCompatibility(workplan, behaviours.length, behaviours.filter(hasCurrentQuarterSnapshot).length);
};
