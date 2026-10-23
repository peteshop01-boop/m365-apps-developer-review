import type {
  IFinalRagResult,
  IManagerRagOverride,
  IScoringInput,
  IScoringResult,
  RagStatus
} from '../models/QuarterlyModels';
import {
  isApprovedMilestonePolicy,
  isApprovedScorePolicy,
  isApprovedTargetRangePolicy,
  normalisePercentageSourceValue,
  resolveScoringThresholds,
  type IScoringPolicyContext,
  type IScoringThresholds
} from './ScoringPolicy';

const VERSION = 'DEMO-RAG-001' as const;
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const round = (value: number): number => Math.round(value * 100) / 100;

const unassessed = (reason: IScoringResult['reason'], message: string): IScoringResult => ({
  rateable: false,
  calculatedRag: 'NotRated',
  reason,
  message,
  calculationVersion: VERSION
});

const ragFor = (progress: number, green: number, amber: number): Exclude<RagStatus, 'NotRated'> => {
  if (progress >= green) return 'Green';
  if (progress >= amber) return 'Amber';
  return 'Red';
};

const resultForProgress = (rawProgressPct: number, thresholds: IScoringThresholds): IScoringResult => {
  const raw = round(rawProgressPct);
  const scored = round(Math.max(0, Math.min(100, rawProgressPct)));
  return {
    rateable: true,
    rawProgressPct: raw,
    scoredProgressPct: scored,
    calculatedRag: ragFor(raw, thresholds.greenThreshold, thresholds.amberThreshold),
    reason: 'CALCULATED',
    message: raw > 100
      ? `Raw achievement is ${raw}%; scored contribution is capped at 100% without hiding overachievement.`
      : `Calculated achievement is ${raw}%.`,
    calculationVersion: VERSION
  };
};

const resultForRangeRag = (calculatedRag: Exclude<RagStatus, 'NotRated'>, message: string): IScoringResult => ({
  rateable: true,
  calculatedRag,
  reason: 'CALCULATED',
  message,
  calculationVersion: VERSION
});

const numericScore = (input: IScoringInput, thresholds: IScoringThresholds): IScoringResult => {
  if (!isFiniteNumber(input.actualValue)) return unassessed('ACTUAL_MISSING_OR_INVALID', 'A valid numeric Actual is required before progress can be calculated.');
  if (!isFiniteNumber(input.targetValue)) return unassessed('TARGET_MISSING', 'An approved numeric quarter target is required before progress can be calculated.');
  if (input.targetValue === 0) {
    if (input.actualValue === 0) return resultForProgress(100, thresholds);
    return unassessed('TARGET_ZERO_UNASSESSABLE', 'Data Quality issue: a zero target with a non-zero Actual requires an explicit metric policy; the KPI remains unassessed.');
  }
  if (input.targetValue < 0 || input.actualValue < 0) return unassessed('ACTUAL_MISSING_OR_INVALID', 'Negative target/Actual values require a KPI-specific approved rule.');

  if (input.scoringDirection === 'HigherIsBetter') return resultForProgress((input.actualValue / input.targetValue) * 100, thresholds);
  return unassessed('SCORING_CONFIGURATION_TBC', 'RAG pending KPI scoring configuration. Actual/status entry remains available.');
};

const lowerIsBetterScore = (input: IScoringInput, thresholds: IScoringThresholds): IScoringResult => {
  if (!isFiniteNumber(input.actualValue)) return unassessed('ACTUAL_MISSING_OR_INVALID', 'A valid numeric Actual is required before progress can be calculated.');
  if (!isFiniteNumber(input.targetValue)) return unassessed('TARGET_MISSING', 'An approved numeric quarter target is required before progress can be calculated.');
  if (!isFiniteNumber(input.baselineValue)) {
    return unassessed('LOWER_IS_BETTER_BASELINE_REQUIRED', 'Lower-is-better scoring requires an approved numeric Baseline.');
  }
  if (input.baselineValue <= input.targetValue) {
    return unassessed('LOWER_IS_BETTER_CONTEXT_INVALID', 'Lower-is-better scoring requires Baseline to be greater than Target.');
  }
  return resultForProgress(
    ((input.baselineValue - input.actualValue) / (input.baselineValue - input.targetValue)) * 100,
    thresholds
  );
};

const milestoneScore = (input: IScoringInput, thresholds: IScoringThresholds, policy: IScoringPolicyContext): IScoringResult => {
  if (!policy.kpiIdentity || !policy.scoringEffectiveAt
    || !isApprovedMilestonePolicy(policy.approvedMilestonePolicy, policy.kpiIdentity, policy.scoringEffectiveAt)) {
    return unassessed('MILESTONE_MAPPING_REQUIRED', 'Milestone scoring remains NotRated until an approved current stage map matches the KPI, version and Performance Year.');
  }
  const stages = policy.approvedMilestonePolicy?.stages || [];
  const target = input.targetText?.trim();
  const actual = input.actualText?.trim();
  if (!target || !actual) {
    return unassessed('MILESTONE_MAPPING_REQUIRED', 'Milestone scoring requires a controlled ordered stage map plus target and Actual stages.');
  }
  const matches = (candidate: string, stage: { stageKey: string; stageName: string }): boolean => {
    const normalised = candidate.toLowerCase();
    return stage.stageKey.trim().toLowerCase() === normalised || stage.stageName.trim().toLowerCase() === normalised;
  };
  const targetStage = stages.find(stage => matches(target, stage));
  const actualStage = stages.find(stage => matches(actual, stage));
  if (!targetStage || !actualStage || targetStage.completionPercent <= 0) {
    return unassessed('MILESTONE_MAPPING_REQUIRED', 'Target or Actual is not present in the approved milestone stage map, or the target stage is not scoreable.');
  }
  return resultForProgress((actualStage.completionPercent / targetStage.completionPercent) * 100, thresholds);
};

const targetRangeScore = (input: IScoringInput, policy: IScoringPolicyContext): IScoringResult => {
  const range = policy.approvedTargetRangePolicy;
  if (!isApprovedTargetRangePolicy(range) || !range) {
    return unassessed('SCORING_CONFIGURATION_TBC', 'TargetRange scoring requires approved Minimum, Maximum and Amber tolerance metadata.');
  }
  if (!isFiniteNumber(input.actualValue)) return unassessed('ACTUAL_MISSING_OR_INVALID', 'A valid numeric Actual is required before the approved target range can be assessed.');
  const epsilon = 1e-9;
  if (input.actualValue >= range.rangeMinimum - epsilon && input.actualValue <= range.rangeMaximum + epsilon) {
    return resultForRangeRag('Green', 'Actual is inside the approved target range.');
  }
  if (input.actualValue >= range.rangeMinimum - range.amberToleranceBelow - epsilon
    && input.actualValue <= range.rangeMaximum + range.amberToleranceAbove + epsilon) {
    return resultForRangeRag('Amber', 'Actual is outside the approved target range but inside its approved Amber tolerance.');
  }
  return resultForRangeRag('Red', 'Actual is outside the approved target range and Amber tolerance.');
};

const scoreMetric = (input: IScoringInput, thresholds: IScoringThresholds, policy: IScoringPolicyContext): IScoringResult => {
  const scorePolicy = policy.approvedScorePolicy;
  if (!isApprovedScorePolicy(scorePolicy) || !scorePolicy || input.scoringDirection !== scorePolicy.scoringDirection
    || !isFiniteNumber(input.targetValue) || input.targetValue !== scorePolicy.targetScore) {
    return unassessed('SCORING_CONFIGURATION_TBC', 'Score scoring requires approved Minimum, Maximum, Target and matching ScoringDirection metadata.');
  }
  if (!isFiniteNumber(input.actualValue)) {
    return unassessed('ACTUAL_MISSING_OR_INVALID', 'A valid numeric Actual is required before progress can be calculated.');
  }
  if (input.actualValue < scorePolicy.scoreMinimum || input.actualValue > scorePolicy.scoreMaximum) {
    return unassessed('ACTUAL_MISSING_OR_INVALID', 'The Score Actual is outside its approved scale.');
  }
  if (scorePolicy.scoringDirection === 'TargetRange') {
    const range = policy.approvedTargetRangePolicy;
    if (!isApprovedTargetRangePolicy(range) || !range || range.rangeMinimum < scorePolicy.scoreMinimum
      || range.rangeMaximum > scorePolicy.scoreMaximum) {
      return unassessed('SCORING_CONFIGURATION_TBC', 'A TargetRange Score requires an approved range and tolerances inside its approved Score scale.');
    }
    return targetRangeScore(input, policy);
  }
  if (scorePolicy.scoringDirection === 'LowerIsBetter') {
    if (!isFiniteNumber(input.baselineValue) || input.baselineValue < scorePolicy.scoreMinimum
      || input.baselineValue > scorePolicy.scoreMaximum) {
      return unassessed('LOWER_IS_BETTER_BASELINE_REQUIRED', 'A Lower-is-better Score requires an approved Baseline inside its scale.');
    }
    return lowerIsBetterScore(input, thresholds);
  }
  return numericScore(input, thresholds);
};

const statusScore = (input: IScoringInput, thresholds: IScoringThresholds): IScoringResult => {
  const actual = input.actualText?.trim();
  const progress = actual && input.statusProgressMap ? input.statusProgressMap[actual] : undefined;
  if (!isFiniteNumber(progress)) {
    return unassessed('TEXT_STATUS_MAPPING_REQUIRED', 'Text/status entry is retained, but a controlled status-to-progress mapping is required for numerical RAG.');
  }
  return resultForProgress(progress, thresholds);
};

export const calculatePerformance = (input: IScoringInput, policy: IScoringPolicyContext = {}): IScoringResult => {
  const hasInputConfig = input.greenThreshold !== undefined || input.amberThreshold !== undefined;
  const inputConfig = hasInputConfig
    ? { greenThreshold: input.greenThreshold as number, amberThreshold: input.amberThreshold as number }
    : undefined;
  const thresholds = resolveScoringThresholds({
    ...policy,
    configThresholds: policy.configThresholds || inputConfig
  });
  if (input.scoringDirection === 'TBC' || !input.scoringDirection) {
    return unassessed('SCORING_CONFIGURATION_TBC', 'RAG pending KPI scoring configuration. Actual/status entry remains available.');
  }
  if (input.metricType === 'Milestone' || input.scoringDirection === 'Milestone') return milestoneScore(input, thresholds, policy);
  if (input.metricType === 'Score') return scoreMetric(input, thresholds, policy);
  if (input.scoringDirection === 'TargetRange') return targetRangeScore(input, policy);
  if (input.metricType === 'Percentage') {
    if (!policy.percentageSourceScale) {
      return unassessed('SCORING_CONFIGURATION_TBC', 'Data Quality issue: PercentageSourceScale must explicitly be Fraction or Whole before authoritative scoring.');
    }
    const percentageInput: IScoringInput = {
      ...input,
      targetValue: isFiniteNumber(input.targetValue) ? normalisePercentageSourceValue(input.targetValue, policy.percentageSourceScale) : input.targetValue,
      actualValue: isFiniteNumber(input.actualValue) ? normalisePercentageSourceValue(input.actualValue, policy.percentageSourceScale) : input.actualValue,
      baselineValue: isFiniteNumber(input.baselineValue) ? normalisePercentageSourceValue(input.baselineValue, policy.percentageSourceScale) : input.baselineValue
    };
    return input.scoringDirection === 'LowerIsBetter'
      ? lowerIsBetterScore(percentageInput, thresholds)
      : numericScore(percentageInput, thresholds);
  }
  if (input.metricType === 'TextStatus' || input.metricType === 'Other') return statusScore(input, thresholds);
  if (['Count', 'Number', 'Currency', 'Rate', 'Days'].indexOf(input.metricType) >= 0) {
    return input.scoringDirection === 'LowerIsBetter'
      ? lowerIsBetterScore(input, thresholds)
      : numericScore(input, thresholds);
  }
  return unassessed('UNSUPPORTED_METRIC', 'The KPI metric does not yet have an approved deterministic scoring rule.');
};

export const resolveFinalRag = (calculatedRag: RagStatus, override?: IManagerRagOverride): IFinalRagResult => {
  if (!override?.rag) return { finalRag: calculatedRag, overrideApplied: false, valid: true, errors: [] };
  const errors: string[] = [];
  if (!override.reason?.trim()) errors.push('A Manager RAG Override requires a reason.');
  if (!override.actorPersonKey?.trim() || !override.actorEmail?.trim()) errors.push('A Manager RAG Override requires the manager PersonKey and email.');
  if (!override.overriddenAt || Number.isNaN(Date.parse(override.overriddenAt))) errors.push('A Manager RAG Override requires a valid UTC timestamp.');
  if (calculatedRag === 'NotRated') errors.push('A Manager RAG Override cannot repair missing or invalid calculation inputs.');
  return {
    finalRag: errors.length ? calculatedRag : override.rag,
    overrideApplied: errors.length === 0,
    valid: errors.length === 0,
    errors
  };
};
