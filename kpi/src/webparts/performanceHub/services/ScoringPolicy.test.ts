import {
  KCF_SCORING_FALLBACK_THRESHOLDS,
  type IMilestoneStageRecord,
  isApprovedScorePolicy,
  isApprovedTargetRangePolicy,
  normalisePercentageSourceValue,
  resolveApprovedMilestonePolicy,
  resolveScoringThresholds
} from './ScoringPolicy';

const milestoneRecord = (
  stageKey: string,
  stageName: string,
  sortOrder: number,
  completionPercent: number,
  version = 'map-v01'
): IMilestoneStageRecord => ({
  performanceYear: '2025/26',
  kpiId: 'SO2-026',
  kpiVersionKey: 'SO2-026|v01',
  stageKey,
  stageName,
  sortOrder,
  completionPercent,
  active: true,
  approvalStatus: 'Approved',
  effectiveFrom: '2025-04-01T00:00:00Z',
  version,
  source: 'CONTROL approved stage map',
  approvalReference: 'KCF-KPI-CONTROL-MILESTONE-TEST'
});

describe('ScoringPolicy', () => {
  it('uses the frozen 90/50 fallback when no central Config is available', () => {
    expect(resolveScoringThresholds()).toEqual({
      ...KCF_SCORING_FALLBACK_THRESHOLDS,
      source: 'Fallback',
      ignoredOverrideReason: undefined
    });
  });

  it('uses central Config before the matching code fallback', () => {
    expect(resolveScoringThresholds({ configThresholds: { greenThreshold: 90, amberThreshold: 50 } })).toEqual({
      greenThreshold: 90,
      amberThreshold: 50,
      source: 'Config',
      ignoredOverrideReason: undefined
    });
  });

  it('uses only an explicitly approved, auditable KPI override ahead of Config', () => {
    expect(resolveScoringThresholds({
      kpiIdentity: { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01' },
      configThresholds: { greenThreshold: 90, amberThreshold: 50 },
      kpiThresholdOverride: {
        kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', greenThreshold: 95, amberThreshold: 70,
        approvalReference: 'CONTROL-KPI-OVERRIDE-001'
      }
    })).toEqual({
      greenThreshold: 95,
      amberThreshold: 70,
      source: 'KpiOverride',
      approvalReference: 'CONTROL-KPI-OVERRIDE-001'
    });

    expect(resolveScoringThresholds({
      kpiIdentity: { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01' },
      configThresholds: { greenThreshold: 90, amberThreshold: 50 },
      kpiThresholdOverride: { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', greenThreshold: 95, amberThreshold: 70 }
    })).toEqual(expect.objectContaining({
      greenThreshold: 90,
      amberThreshold: 50,
      source: 'Config',
      ignoredOverrideReason: 'NOT_APPROVED_OR_AUDITABLE'
    }));
  });

  it('ignores an approved override when the KPI/version identity does not match', () => {
    expect(resolveScoringThresholds({
      kpiIdentity: { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01' },
      configThresholds: { greenThreshold: 90, amberThreshold: 50 },
      kpiThresholdOverride: {
        kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v02', greenThreshold: 95, amberThreshold: 70,
        approvalReference: 'CONTROL-KPI-OVERRIDE-OTHER-VERSION'
      }
    })).toEqual(expect.objectContaining({
      greenThreshold: 90,
      amberThreshold: 50,
      source: 'Config',
      ignoredOverrideReason: 'NOT_APPROVED_OR_AUDITABLE'
    }));
  });

  it('rejects invalid approved or Config thresholds instead of silently changing policy', () => {
    expect(() => resolveScoringThresholds({
      kpiIdentity: { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01' },
      kpiThresholdOverride: {
        kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', greenThreshold: 50, amberThreshold: 90,
        approvalReference: 'CONTROL-INVALID'
      }
    })).toThrow(/KpiOverride RAG thresholds/);
    expect(() => resolveScoringThresholds({
      configThresholds: { greenThreshold: 101, amberThreshold: 50 }
    })).toThrow(/Config RAG thresholds/);
  });

  it('normalises explicit fractional and whole percentage source scales without guessing', () => {
    expect(normalisePercentageSourceValue(0.65, 'Fraction')).toBe(65);
    expect(normalisePercentageSourceValue(65, 'Whole')).toBe(65);
  });

  it('resolves only the explicit approved current Milestone KPI/version map', () => {
    const records: IMilestoneStageRecord[] = [
      milestoneRecord('not-started', 'Not started', 1, 0),
      milestoneRecord('plan', 'Plan', 2, 25),
      milestoneRecord('deliver', 'Deliver', 3, 75),
      milestoneRecord('complete', 'Complete', 4, 100),
      { ...milestoneRecord('other', 'Other version', 1, 0, 'map-v02'), approvalStatus: 'Draft' }
    ];
    const policy = resolveApprovedMilestonePolicy(records, {
      performanceYear: '2025/26',
      kpiId: 'SO2-026',
      kpiVersionKey: 'SO2-026|v01',
      version: 'map-v01',
      effectiveAt: '2025-08-01T00:00:00Z'
    });
    expect(policy).toEqual(expect.objectContaining({
      kpiId: 'SO2-026',
      kpiVersionKey: 'SO2-026|v01',
      version: 'map-v01',
      approvalReference: 'KCF-KPI-CONTROL-MILESTONE-TEST'
    }));
    expect(policy?.stages.map(stage => [stage.stageKey, stage.completionPercent])).toEqual([
      ['not-started', 0], ['plan', 25], ['deliver', 75], ['complete', 100]
    ]);
    expect(resolveApprovedMilestonePolicy(records, {
      performanceYear: '2025/26',
      kpiId: 'SO2-026',
      kpiVersionKey: 'SO2-026|v01',
      version: 'map-v02',
      effectiveAt: '2025-08-01T00:00:00Z'
    })).toBeUndefined();
  });

  it('rejects ambiguous or invalid Milestone maps rather than inventing progress', () => {
    const duplicateOrder = [
      milestoneRecord('start', 'Start', 1, 0),
      milestoneRecord('middle', 'Middle', 1, 50),
      milestoneRecord('finish', 'Finish', 3, 100)
    ];
    const incompleteFinalStage = [
      milestoneRecord('start', 'Start', 1, 0),
      milestoneRecord('finish', 'Finish', 2, 90)
    ];
    const lookup = {
      performanceYear: '2025/26', kpiId: 'SO2-026', kpiVersionKey: 'SO2-026|v01',
      version: 'map-v01', effectiveAt: '2025-08-01T00:00:00Z'
    };
    expect(resolveApprovedMilestonePolicy(duplicateOrder, lookup)).toBeUndefined();
    expect(resolveApprovedMilestonePolicy(incompleteFinalStage, lookup)).toBeUndefined();
  });

  it('allows ordered stages to share a CompletionPercent because CONTROL did not require unique percentages', () => {
    const stagedPlateau = [
      milestoneRecord('start', 'Start', 1, 0),
      milestoneRecord('planning', 'Planning', 2, 0),
      milestoneRecord('finish', 'Finish', 3, 100)
    ];
    expect(resolveApprovedMilestonePolicy(stagedPlateau, {
      performanceYear: '2025/26', kpiId: 'SO2-026', kpiVersionKey: 'SO2-026|v01',
      version: 'map-v01', effectiveAt: '2025-08-01T00:00:00Z'
    })?.stages).toHaveLength(3);
  });

  it('requires complete approved Score and TargetRange metadata', () => {
    expect(isApprovedScorePolicy({
      approvalReference: 'CONTROL-SCORE-001', scoreMinimum: 0, scoreMaximum: 10,
      targetScore: 9.5, scoringDirection: 'HigherIsBetter'
    })).toBe(true);
    expect(isApprovedScorePolicy({
      approvalReference: 'CONTROL-SCORE-001', scoreMinimum: 0, scoreMaximum: 10,
      targetScore: 11, scoringDirection: 'HigherIsBetter'
    })).toBe(false);

    expect(isApprovedTargetRangePolicy({
      approvalReference: 'CONTROL-RANGE-001', rangeMinimum: 9.4, rangeMaximum: 9.6,
      amberToleranceBelow: 0.2, amberToleranceAbove: 0.2
    })).toBe(true);
    expect(isApprovedTargetRangePolicy({
      approvalReference: 'CONTROL-RANGE-001', rangeMinimum: 9.6, rangeMaximum: 9.4,
      amberToleranceBelow: 0.2, amberToleranceAbove: 0.2
    })).toBe(false);
  });
});
