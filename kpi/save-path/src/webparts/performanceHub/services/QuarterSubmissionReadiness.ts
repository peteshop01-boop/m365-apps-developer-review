import type {
  IQuarterLifecycle,
  IQuarterReview,
  IQuarterReviewItem,
  IQuarterSubmissionReadiness
} from '../models/QuarterlyModels';
import { createBehaviourPeriodSnapshotV2 } from './BehaviourFrameworkV2Policy';
import { validateRecoveryAction } from './RecoveryActionValidation';
import { assertQuarterImpactAnnualSnapshot } from './QuarterImpactSnapshot';

const hasActual = (item: IQuarterReviewItem): boolean =>
  (typeof item.employeeActualValue === 'number' && Number.isFinite(item.employeeActualValue)) || Boolean(item.employeeActualText?.trim());

const ratingIsValid = (value: number | undefined): boolean => value === 1 || value === 2 || value === 3 || value === 4;
const v2RatingIsValid = (value: number | undefined): boolean => value === 1 || value === 2 || value === 3;

const evaluateQuarterItemContent = (items: IQuarterReviewItem[], requireManagerBehaviourRating = false): IQuarterSubmissionReadiness => {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (!items.length) blockers.push('The Quarter Review has no Workplan Item snapshots.');
  if (new Set(items.map(item => item.quarterReviewItemKey)).size !== items.length) blockers.push('The Quarter Review contains duplicate item keys.');

  let coreComplete = 0;
  let personalComplete = 0;
  let behavioursComplete = 0;
  items.forEach(item => {
    const label = item.kpiId || item.wording;
    if (item.locked) blockers.push(`${label} is unexpectedly locked before manager approval.`);
    if (item.itemType === 'CoreGold' && item.reportingStream && item.reportingStream !== 'CoreGold') {
      blockers.push(`${label} is crossed into the wrong reporting stream.`);
    }
    if (item.itemType === 'Behaviour') {
      if (item.reportingStream && item.reportingStream !== 'Behaviour') blockers.push(`${label} is crossed into the wrong reporting stream.`);
      if (item.behaviourSnapshotV2) {
        const snapshot = item.behaviourSnapshotV2;
        let snapshotValid = false;
        try { createBehaviourPeriodSnapshotV2(snapshot, snapshot.period); snapshotValid = true; }
        catch { snapshotValid = false; }
        if (!snapshotValid || snapshot.frameworkVersion !== 'DEMO-BEHAVIOUR|v02'
          || snapshot.period !== item.quarter || snapshot.valueId !== item.behaviourId) {
          blockers.push(`${label} has an incomplete or crossed v02 Behaviour snapshot.`);
        }
        if (item.behaviourTargetRating !== undefined || item.employeeBehaviourRating !== undefined
          || item.managerBehaviourRating !== undefined || item.finalBehaviourRating !== undefined
          || item.workplanItemWeightSnapshot !== undefined || item.progressPct !== undefined
          || item.scoredProgressPct !== undefined || item.finalApprovedRag !== undefined
          || item.calculatedRag !== 'NotRated') {
          blockers.push(`${label} contains prohibited v02 target, weight, score or RAG content.`);
        }
        if (!v2RatingIsValid(item.employeeBehaviourAssessmentV2)) blockers.push(`${label} requires a v02 employee self-assessment.`);
        if (!item.employeeBehaviourEvidenceV2?.trim()) blockers.push(`${label} requires separate employee evidence.`);
        if (requireManagerBehaviourRating && !v2RatingIsValid(item.managerBehaviourAssessmentV2)) {
          blockers.push(`${label} requires a separate v02 manager assessment before approval.`);
        }
        if (requireManagerBehaviourRating && !item.managerBehaviourEvidenceV2?.trim()) {
          blockers.push(`${label} requires separate manager evidence before approval.`);
        }
        if (v2RatingIsValid(item.employeeBehaviourAssessmentV2) && item.employeeBehaviourEvidenceV2?.trim()
          && (!requireManagerBehaviourRating || v2RatingIsValid(item.managerBehaviourAssessmentV2)
            && item.managerBehaviourEvidenceV2?.trim())) behavioursComplete += 1;
        return;
      }
      if (!ratingIsValid(item.behaviourTargetRating)) blockers.push(`${label} requires an agreed Behaviour target rating from 1 to 4.`);
      if (!ratingIsValid(item.employeeBehaviourRating)) blockers.push(`${label} requires an employee self-assessment.`);
      if (!item.behaviourReflection?.trim()) blockers.push(`${label} requires an employee reflection.`);
      if (requireManagerBehaviourRating && !ratingIsValid(item.managerBehaviourRating)) {
        blockers.push(`${label} requires a separate manager assessment before approval.`);
      }
      if (ratingIsValid(item.behaviourTargetRating) && ratingIsValid(item.employeeBehaviourRating)
        && item.behaviourReflection?.trim()
        && (!requireManagerBehaviourRating || ratingIsValid(item.managerBehaviourRating))) behavioursComplete += 1;
      return;
    }
    if (item.itemType === 'LocalPersonal') {
      if (item.reportingStream && item.reportingStream !== 'Impact') blockers.push(`${label} is crossed into the wrong reporting stream.`);
      if (item.impactAnnualDefinitionSnapshot) {
        try { assertQuarterImpactAnnualSnapshot(item); }
        catch (error) { blockers.push(`${label}: ${(error as Error).message}`); }
      } else {
        warnings.push(`${label}: Legacy Personal/Impact input has no immutable annual definition snapshot; controlled migration is required before Impact reporting.`);
      }
    }
    if (!hasActual(item)) blockers.push(`${label} requires a valid Actual or status entry.`);
    if (!item.statusUpdate?.trim()) blockers.push(`${label} requires a meaningful Status Update.`);
    if (item.evidenceRequired && item.evidenceCount < 1) blockers.push(`${label} requires linked evidence under the configured rule.`);
    if (item.itemType === 'CoreGold' || item.itemType === 'LocalPersonal') {
      const recovery = validateRecoveryAction(item.calculatedRag, item.recovery);
      blockers.push(...recovery.errors.map(error => `${label}: ${error}`));
      warnings.push(...recovery.warnings.map(warning => `${label}: ${warning}`));
      if (item.calculatedRag === 'NotRated') warnings.push(`${label}: RAG is unassessed; Actual/status is retained pending approved scoring configuration.`);
      if (hasActual(item) && item.statusUpdate?.trim() && recovery.valid) {
        if (item.itemType === 'CoreGold') coreComplete += 1;
        else personalComplete += 1;
      }
    }
  });

  return { ready: blockers.length === 0, blockers, warnings, coreComplete, personalComplete, behavioursComplete };
};

export const evaluateQuarterSubmissionReadiness = (
  lifecycle: IQuarterLifecycle,
  review: IQuarterReview | undefined,
  items: IQuarterReviewItem[]
): IQuarterSubmissionReadiness => {
  const blockers: string[] = [];
  if (!review) blockers.push('The Quarter Review header has not been prepared.');
  else {
    if (review.state !== 'Draft' && review.state !== 'ChangesRequested') blockers.push('Only a Draft or Changes Requested Quarter Review may be submitted.');
    if (review.accessState !== 'EmployeeEdit' || review.transitionStatus !== 'Ready') blockers.push('The Quarter Review is not in a transition-ready employee-edit state.');
  }
  if (lifecycle.status !== 'Finalising') blockers.push('Quarter submission opens after quarter end and before the employee submission deadline.');
  const content = evaluateQuarterItemContent(items);
  return { ...content, ready: blockers.length === 0 && content.ready, blockers: [...blockers, ...content.blockers] };
};

export const evaluateQuarterManagerApprovalReadiness = (
  review: IQuarterReview | undefined,
  items: IQuarterReviewItem[]
): IQuarterSubmissionReadiness => {
  const blockers: string[] = [];
  if (!review) blockers.push('The submitted Quarter Review header is unavailable.');
  else {
    if (review.state !== 'Submitted') blockers.push('Only a Submitted Quarter Review may be approved by the assigned manager.');
    if (review.accessState !== 'ManagerDecision' || review.transitionStatus !== 'Ready') {
      blockers.push('The Quarter Review is not in a transition-ready manager-decision state.');
    }
  }
  const content = evaluateQuarterItemContent(items, true);
  return { ...content, ready: blockers.length === 0 && content.ready, blockers: [...blockers, ...content.blockers] };
};
