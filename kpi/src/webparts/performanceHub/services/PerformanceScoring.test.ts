import type { IScoringInput } from '../models/QuarterlyModels';
import { calculatePerformance, resolveFinalRag } from './PerformanceScoring';

const numeric = {
  metricType: 'Number',
  scoringDirection: 'HigherIsBetter',
  greenThreshold: 90,
  amberThreshold: 50
};

const approvedMilestonePolicy = {
  performanceYear: '2025/26',
  kpiId: 'SO2-026',
  kpiVersionKey: 'SO2-026|v01',
  version: 'map-v01',
  source: 'CONTROL approved test map',
  approvalReference: 'CONTROL-MILESTONE-MAP-TEST',
  effectiveFrom: '2025-04-01T00:00:00Z',
  resolvedEffectiveAt: '2025-08-01T00:00:00Z',
  stages: [
    { stageKey: 'not-started', stageName: 'Not started', sortOrder: 1, completionPercent: 0 },
    { stageKey: 'plan', stageName: 'Plan', sortOrder: 2, completionPercent: 25 },
    { stageKey: 'deliver', stageName: 'Deliver', sortOrder: 3, completionPercent: 75 },
    { stageKey: 'complete', stageName: 'Complete', sortOrder: 4, completionPercent: 100 }
  ]
} as const;

describe('PerformanceScoring', () => {
  it.each([
    [0, 'Red'],
    [40, 'Red'],
    [49.99, 'Red'],
    [50, 'Amber'],
    [50.01, 'Amber'],
    [80, 'Amber'],
    [89.99, 'Amber'],
    [90, 'Green'],
    [90.01, 'Green'],
    [100, 'Green']
  ])('applies the frozen boundary policy at %s%%', (actual, expectedRag) => {
    expect(calculatePerformance({ ...numeric, targetValue: 100, actualValue: actual })).toEqual(expect.objectContaining({
      rateable: true,
      rawProgressPct: actual,
      scoredProgressPct: actual,
      calculatedRag: expectedRag
    }));
  });

  it('preserves 120% raw overachievement while capping scored contribution at 100%', () => {
    expect(calculatePerformance({ ...numeric, targetValue: 100, actualValue: 120 })).toEqual(expect.objectContaining({
      rawProgressPct: 120,
      scoredProgressPct: 100,
      calculatedRag: 'Green'
    }));
  });

  it('keeps blank Actual unassessed rather than treating it as zero', () => {
    expect(calculatePerformance({ ...numeric, targetValue: 100, actualValue: undefined })).toEqual(expect.objectContaining({
      rateable: false,
      calculatedRag: 'NotRated',
      reason: 'ACTUAL_MISSING_OR_INVALID'
    }));
  });

  it('scores target zero / Actual zero Green and signals Data Quality for target zero / non-zero Actual', () => {
    expect(calculatePerformance({ ...numeric, targetValue: 0, actualValue: 0 })).toEqual(expect.objectContaining({
      rateable: true,
      rawProgressPct: 100,
      scoredProgressPct: 100,
      calculatedRag: 'Green'
    }));
    expect(calculatePerformance({ ...numeric, targetValue: 0, actualValue: 1 })).toEqual(expect.objectContaining({
      rateable: false,
      calculatedRag: 'NotRated',
      reason: 'TARGET_ZERO_UNASSESSABLE',
      message: expect.stringMatching(/Data Quality issue/)
    }));
  });

  it('keeps unresolved direction and metric type outside authoritative scoring', () => {
    expect(calculatePerformance({ ...numeric, scoringDirection: 'TBC', targetValue: 100, actualValue: 100 })).toEqual(expect.objectContaining({
      rateable: false,
      calculatedRag: 'NotRated',
      reason: 'SCORING_CONFIGURATION_TBC'
    }));
    expect(calculatePerformance({ ...numeric, metricType: 'TBC', targetValue: 100, actualValue: 100 })).toEqual(expect.objectContaining({
      rateable: false,
      calculatedRag: 'NotRated',
      reason: 'UNSUPPORTED_METRIC'
    }));
  });

  it('normalises fractional and whole percentage sources only from explicit scale metadata', () => {
    expect(calculatePerformance({ ...numeric, metricType: 'Percentage', targetValue: 0.28, actualValue: 0.252 }, {
      percentageSourceScale: 'Fraction'
    })).toEqual(expect.objectContaining({ rawProgressPct: 90, scoredProgressPct: 90, calculatedRag: 'Green' }));

    expect(calculatePerformance({ ...numeric, metricType: 'Percentage', targetValue: 28, actualValue: 25.2 }, {
      percentageSourceScale: 'Whole'
    })).toEqual(expect.objectContaining({ rawProgressPct: 90, scoredProgressPct: 90, calculatedRag: 'Green' }));

    expect(calculatePerformance({ ...numeric, metricType: 'Percentage', targetValue: 0.28, actualValue: 0.252 })).toEqual(expect.objectContaining({
      calculatedRag: 'NotRated',
      reason: 'SCORING_CONFIGURATION_TBC',
      message: expect.stringMatching(/PercentageSourceScale/)
    }));
  });

  it('applies KPI override, Config and matching fallback precedence', () => {
    const atNinety = { ...numeric, targetValue: 100, actualValue: 90 };
    expect(calculatePerformance(atNinety, {
      configThresholds: { greenThreshold: 90, amberThreshold: 50 }
    }).calculatedRag).toBe('Green');

    expect(calculatePerformance(atNinety, {
      kpiIdentity: { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01' },
      configThresholds: { greenThreshold: 90, amberThreshold: 50 },
      kpiThresholdOverride: {
        kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', greenThreshold: 95, amberThreshold: 70,
        approvalReference: 'CONTROL-KPI-OVERRIDE-001'
      }
    }).calculatedRag).toBe('Amber');

    const fallbackInput: IScoringInput = {
      metricType: 'Number', scoringDirection: 'HigherIsBetter', targetValue: 100, actualValue: 50
    };
    expect(calculatePerformance(fallbackInput).calculatedRag).toBe('Amber');
  });

  it('keeps milestone and Score metrics NotRated until their specific policies are approved', () => {
    expect(calculatePerformance({
      ...numeric,
      metricType: 'Milestone',
      scoringDirection: 'Milestone',
      targetText: 'Complete',
      actualText: 'Deliver',
      milestoneStages: ['Not started', 'Plan', 'Deliver', 'Complete']
    })).toEqual(expect.objectContaining({ reason: 'MILESTONE_MAPPING_REQUIRED', calculatedRag: 'NotRated' }));

    expect(calculatePerformance({ ...numeric, metricType: 'Score', targetValue: 9.5, actualValue: 9.5 })).toEqual(expect.objectContaining({
      reason: 'SCORING_CONFIGURATION_TBC',
      calculatedRag: 'NotRated'
    }));
  });

  it('uses an explicitly approved milestone map but never treats an unapproved input array as approval', () => {
    expect(calculatePerformance({
      ...numeric,
      metricType: 'Milestone',
      scoringDirection: 'Milestone',
      targetText: 'Complete',
      actualText: 'Deliver'
    }, {
      kpiIdentity: { kpiId: 'SO2-026', kpiVersionKey: 'SO2-026|v01', performanceYear: '2025/26' },
      scoringEffectiveAt: '2025-08-01T00:00:00Z',
      approvedMilestonePolicy
    })).toEqual(expect.objectContaining({ rawProgressPct: 75, calculatedRag: 'Amber' }));

    expect(calculatePerformance({
      ...numeric,
      metricType: 'Milestone',
      scoringDirection: 'Milestone',
      targetText: 'Complete',
      actualText: 'Deliver'
    }, {
      kpiIdentity: { kpiId: 'SO2-026', kpiVersionKey: 'SO2-026|v02', performanceYear: '2025/26' },
      scoringEffectiveAt: '2025-08-01T00:00:00Z',
      approvedMilestonePolicy
    })).toEqual(expect.objectContaining({ reason: 'MILESTONE_MAPPING_REQUIRED', calculatedRag: 'NotRated' }));

    expect(calculatePerformance({
      ...numeric,
      metricType: 'Milestone',
      scoringDirection: 'Milestone',
      targetText: 'Complete',
      actualText: 'Deliver'
    }, {
      kpiIdentity: { kpiId: 'SO2-026', kpiVersionKey: 'SO2-026|v01', performanceYear: '2025/26' },
      scoringEffectiveAt: '2025-08-01T00:00:00Z',
      approvedMilestonePolicy: { ...approvedMilestonePolicy, effectiveTo: '2025-06-30T23:59:59Z' }
    })).toEqual(expect.objectContaining({ reason: 'MILESTONE_MAPPING_REQUIRED', calculatedRag: 'NotRated' }));
  });

  it('does not infer a scoring direction merely because the unit/metric is Currency', () => {
    expect(calculatePerformance({
      ...numeric,
      metricType: 'Currency',
      scoringDirection: 'TBC',
      targetValue: 1000,
      actualValue: 1200
    })).toEqual(expect.objectContaining({ calculatedRag: 'NotRated', reason: 'SCORING_CONFIGURATION_TBC' }));
  });

  it('uses the approved LowerIsBetter baseline formula for achieved, proportional and overachieved results', () => {
    const lower = { ...numeric, scoringDirection: 'LowerIsBetter' };
    expect(calculatePerformance({ ...lower, baselineValue: 20, targetValue: 10, actualValue: 10 })).toEqual(expect.objectContaining({
      rawProgressPct: 100, scoredProgressPct: 100, calculatedRag: 'Green'
    }));
    expect(calculatePerformance({ ...lower, baselineValue: 20, targetValue: 10, actualValue: 15 })).toEqual(expect.objectContaining({
      rawProgressPct: 50, scoredProgressPct: 50, calculatedRag: 'Amber'
    }));
    expect(calculatePerformance({ ...lower, baselineValue: 20, targetValue: 10, actualValue: 5 })).toEqual(expect.objectContaining({
      rawProgressPct: 150, scoredProgressPct: 100, calculatedRag: 'Green'
    }));
  });

  it('floors LowerIsBetter scored contribution after deterioration and rejects incomplete/invalid context', () => {
    const lower = { ...numeric, scoringDirection: 'LowerIsBetter' };
    expect(calculatePerformance({ ...lower, baselineValue: 20, targetValue: 10, actualValue: 25 })).toEqual(expect.objectContaining({
      rawProgressPct: -50, scoredProgressPct: 0, calculatedRag: 'Red'
    }));
    expect(calculatePerformance({ ...lower, targetValue: 10, actualValue: 11 })).toEqual(expect.objectContaining({
      reason: 'LOWER_IS_BETTER_BASELINE_REQUIRED', calculatedRag: 'NotRated'
    }));
    expect(calculatePerformance({ ...lower, baselineValue: 20, actualValue: 11 })).toEqual(expect.objectContaining({
      reason: 'TARGET_MISSING', calculatedRag: 'NotRated'
    }));
    expect(calculatePerformance({ ...lower, baselineValue: 10, targetValue: 10, actualValue: 10 })).toEqual(expect.objectContaining({
      reason: 'LOWER_IS_BETTER_CONTEXT_INVALID', calculatedRag: 'NotRated'
    }));
    expect(calculatePerformance({ ...lower, baselineValue: 9, targetValue: 10, actualValue: 9 })).toEqual(expect.objectContaining({
      reason: 'LOWER_IS_BETTER_CONTEXT_INVALID', calculatedRag: 'NotRated'
    }));
  });

  it('scores a Score metric only when Minimum, Maximum, Target and direction are approved and consistent', () => {
    const scoreInput = { ...numeric, metricType: 'Score', targetValue: 9.5, actualValue: 9.5 };
    const approvedScorePolicy = {
      approvalReference: 'CONTROL-SCORE-TEST', scoreMinimum: 0, scoreMaximum: 10,
      targetScore: 9.5, scoringDirection: 'HigherIsBetter' as const
    };
    expect(calculatePerformance(scoreInput, { approvedScorePolicy })).toEqual(expect.objectContaining({
      rawProgressPct: 100, calculatedRag: 'Green'
    }));
    expect(calculatePerformance({ ...scoreInput, targetValue: 9 }, { approvedScorePolicy })).toEqual(expect.objectContaining({
      reason: 'SCORING_CONFIGURATION_TBC', calculatedRag: 'NotRated'
    }));
    expect(calculatePerformance({ ...scoreInput, actualValue: 11 }, { approvedScorePolicy })).toEqual(expect.objectContaining({
      reason: 'ACTUAL_MISSING_OR_INVALID', calculatedRag: 'NotRated'
    }));
  });

  it('applies only explicit TargetRange boundaries and asymmetric Amber tolerances', () => {
    const targetRange = { ...numeric, metricType: 'Number', scoringDirection: 'TargetRange' };
    const approvedTargetRangePolicy = {
      approvalReference: 'CONTROL-RANGE-TEST', rangeMinimum: 9.4, rangeMaximum: 9.6,
      amberToleranceBelow: 0.2, amberToleranceAbove: 0.1
    };
    expect(calculatePerformance({ ...targetRange, actualValue: 9.5 }, { approvedTargetRangePolicy })).toEqual(expect.objectContaining({
      calculatedRag: 'Green', rateable: true
    }));
    expect(calculatePerformance({ ...targetRange, actualValue: 9.2 }, { approvedTargetRangePolicy })).toEqual(expect.objectContaining({
      calculatedRag: 'Amber', rateable: true
    }));
    expect(calculatePerformance({ ...targetRange, actualValue: 9.7 }, { approvedTargetRangePolicy })).toEqual(expect.objectContaining({
      calculatedRag: 'Amber', rateable: true
    }));
    expect(calculatePerformance({ ...targetRange, actualValue: 9.71 }, { approvedTargetRangePolicy })).toEqual(expect.objectContaining({
      calculatedRag: 'Red', rateable: true
    }));
    expect(calculatePerformance({ ...targetRange, actualValue: 9.5 })).toEqual(expect.objectContaining({
      reason: 'SCORING_CONFIGURATION_TBC', calculatedRag: 'NotRated'
    }));

    const scoreRange = { ...targetRange, metricType: 'Score', targetValue: 9.5, actualValue: 9.5 };
    expect(calculatePerformance(scoreRange, { approvedTargetRangePolicy })).toEqual(expect.objectContaining({
      reason: 'SCORING_CONFIGURATION_TBC', calculatedRag: 'NotRated'
    }));
    expect(calculatePerformance(scoreRange, {
      approvedTargetRangePolicy,
      approvedScorePolicy: {
        approvalReference: 'CONTROL-SCORE-RANGE-TEST', scoreMinimum: 0, scoreMaximum: 10,
        targetScore: 9.5, scoringDirection: 'TargetRange'
      }
    })).toEqual(expect.objectContaining({ calculatedRag: 'Green', rateable: true }));
  });

  it('uses explicit status mappings and never invents them', () => {
    expect(calculatePerformance({ ...numeric, metricType: 'TextStatus', actualText: 'On track' })).toEqual(expect.objectContaining({ reason: 'TEXT_STATUS_MAPPING_REQUIRED', calculatedRag: 'NotRated' }));
    expect(calculatePerformance({ ...numeric, metricType: 'TextStatus', actualText: 'On track', statusProgressMap: { 'On track': 100 } }).calculatedRag).toBe('Green');
  });

  it('keeps manager override separate, reasoned and unable to repair NotRated', () => {
    expect(resolveFinalRag('Amber', {
      rag: 'Green', reason: 'Validated recovery evidence.', actorPersonKey: 'manager', actorEmail: 'person013@example.invalid', overriddenAt: '2026-08-20T10:00:00Z'
    })).toEqual({ finalRag: 'Green', overrideApplied: true, valid: true, errors: [] });
    expect(resolveFinalRag('Amber', { rag: 'Green' })).toEqual(expect.objectContaining({ finalRag: 'Amber', overrideApplied: false, valid: false }));
    expect(resolveFinalRag('NotRated', {
      rag: 'Green', reason: 'No inputs.', actorPersonKey: 'manager', actorEmail: 'person013@example.invalid', overriddenAt: '2026-08-20T10:00:00Z'
    })).toEqual(expect.objectContaining({ finalRag: 'NotRated', overrideApplied: false, valid: false }));
  });
});
