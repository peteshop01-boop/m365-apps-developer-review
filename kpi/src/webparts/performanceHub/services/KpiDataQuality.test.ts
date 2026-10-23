import type { ICoreKpiCatalogueItem } from '../models/ProductionModels';
import styles from '../components/PerformanceHub.module.scss';
import {
  buildKpiDataQualityOptionsFromCatalogue,
  buildKpiDataQualityQueue,
  isKpiDataQualityAdmin,
  milestoneMapIsApprovedAndValid,
  type IKpiDataQualityAssessment,
  type IKpiDataQualityOptions
} from './KpiDataQuality';

const kpi = (overrides: Partial<ICoreKpiCatalogueItem> = {}): ICoreKpiCatalogueItem => ({
  kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01',
  wording: '200 Primary School Programmes delivered annually.', pillar: 'SO1', workstream: 'Schools Cricket',
  aggregationMethod: 'DirectMetric', scoringDirection: 'HigherIsBetter', metricType: 'Number', unitLabel: 'programmes',
  yearEndTargetValue: 200, q1TargetValue: 70, q2TargetValue: 148, q3TargetValue: 200, q4TargetValue: 200,
  classificationStatus: 'PilotApproved', classificationSource: 'Authoritative V6 / CONTROL',
  portfolioWeight: 10, kpiWeightWithinWorkstream: 10,
  ownerSourceCode: 'PH',
  ...overrides
});

const assessmentOptions = (kpiId: string, assessment: IKpiDataQualityAssessment): IKpiDataQualityOptions => ({
  assessmentsByKpiId: { [kpiId]: assessment }
});

describe('KPI Data Quality queue', () => {
  it('keeps a controlled pilot classification out of TBC and target queues', () => {
    const queue = buildKpiDataQualityQueue([kpi()]);
    expect(queue.rows).toEqual([]);
    expect(queue.totalIssues).toBe(0);
    expect(queue.groups.map(group => group.priority)).toEqual(['P1', 'P2', 'P3']);
  });

  it('treats an undefined KPIWeightWithinWorkstream as missing even when legacy PortfolioWeight is present', () => {
    const queue = buildKpiDataQualityQueue([kpi({ portfolioWeight: 25, kpiWeightWithinWorkstream: undefined })]);
    expect(queue.counts.MISSING_ORGANISATIONAL_WEIGHT).toBe(1);
    expect(queue.priorityCounts.P3).toBe(1);
  });

  it('does not misclassify an explicit numeric zero KPIWeightWithinWorkstream as missing', () => {
    const queue = buildKpiDataQualityQueue([kpi({ portfolioWeight: undefined, kpiWeightWithinWorkstream: 0 })]);
    expect(queue.counts.MISSING_ORGANISATIONAL_WEIGHT).toBe(0);
    expect(queue.rows).toEqual([]);
  });

  it('adds a P1 issue when a Percentage KPI has no explicit source scale without changing 015D counts', () => {
    const queue = buildKpiDataQualityQueue([kpi({
      metricType: 'Percentage', unitLabel: '%', percentageSourceScale: undefined
    })]);
    expect(queue.counts.MISSING_PERCENTAGE_SOURCE_SCALE).toBe(1);
    expect(queue.priorityCounts).toEqual({ P1: 1, P2: 0, P3: 0 });
    expect(queue.legacyPriorityCounts).toEqual({ P1: 0, P2: 0, P3: 0 });
    expect(queue.groups[0].rows[0].issues[0]).toMatchObject({
      code: 'MISSING_PERCENTAGE_SOURCE_SCALE',
      priority: 'P1',
      severity: 'BlocksAuthoritativeScoring',
      status: 'SourceDataRequired',
      sourceReference: 'Authoritative V6 / CONTROL'
    });
    expect(queue.groups[0].rows[0].issues[0].recommendedResolution).toContain('Fraction or Whole');
  });

  it.each(['Fraction', 'Whole'] as const)('accepts an explicit %s Percentage source scale', scale => {
    const queue = buildKpiDataQualityQueue([kpi({
      metricType: 'Percentage', unitLabel: '%', percentageSourceScale: scale
    })]);
    expect(queue.counts.MISSING_PERCENTAGE_SOURCE_SCALE).toBe(0);
    expect(queue.rows).toEqual([]);
  });

  it('retains the accepted 015D baseline while presenting unknown owner as 015E P2', () => {
    const queue = buildKpiDataQualityQueue([kpi({
      kpiId: 'SO4-066', scoringDirection: 'TBC', metricType: 'TBC', unitLabel: 'TBC',
      q2TargetValue: undefined, q3TargetValue: undefined, q4TargetValue: undefined,
      ownerSourceCode: 'JH', dataQualityFlags: 'Unknown owner code — JH; Classification review required',
      kpiWeightWithinWorkstream: undefined, classificationStatus: 'UnresolvedTBC'
    })]);
    expect(queue.rows[0].issues.map(issue => issue.code)).toEqual([
      'TBC_SCORING_DIRECTION', 'TBC_METRIC_TYPE', 'MISSING_TARGET', 'MISSING_UNIT_LABEL',
      'UNKNOWN_OWNER_CODE', 'MISSING_ORGANISATIONAL_WEIGHT'
    ]);
    expect(queue.legacyPriorityCounts).toEqual({ P1: 4, P2: 1, P3: 1 });
    expect(queue.priorityCounts).toEqual({ P1: 3, P2: 2, P3: 1 });
    expect(queue.groups[1].rows[0].ownerCode).toBe('JH');
    expect(queue.groups[1].rows[0].issues[1]).toMatchObject({
      code: 'UNKNOWN_OWNER_CODE', priority: 'P2', status: 'ControlDecisionRequired'
    });
  });

  it('flags missing and invalid Lower-Is-Better baselines but accepts Baseline greater than Target', () => {
    const lower = kpi({ kpiId: 'LOWER-01', scoringDirection: 'LowerIsBetter', yearEndTargetValue: 10 });
    const missing = buildKpiDataQualityQueue([lower], assessmentOptions('LOWER-01', { requiredPolicy: 'LowerIsBetter' }));
    expect(missing.counts.MISSING_LOWER_BASELINE).toBe(1);

    const invalid = buildKpiDataQualityQueue([lower], assessmentOptions('LOWER-01', {
      requiredPolicy: 'LowerIsBetter', lowerBaseline: 10, lowerTarget: 10
    }));
    expect(invalid.counts.INVALID_LOWER_CONFIGURATION).toBe(1);
    expect(invalid.counts.MISSING_LOWER_BASELINE).toBe(0);

    const valid = buildKpiDataQualityQueue([lower], assessmentOptions('LOWER-01', {
      requiredPolicy: 'LowerIsBetter', lowerBaseline: 20, lowerTarget: 10
    }));
    expect(valid.rows).toEqual([]);
  });

  it('requires a current approved, ordered and versioned map for every Milestone KPI', () => {
    const milestone = kpi({ kpiId: 'SO2-026', metricType: 'Milestone', scoringDirection: 'Milestone' });
    expect(buildKpiDataQualityQueue([milestone], assessmentOptions('SO2-026', {
      requiredPolicy: 'Milestone'
    })).counts.MISSING_MILESTONE_MAP).toBe(1);

    const stages = [
      { performanceYear: 2026, kpiId: 'SO2-026', stageKey: 'START', stageName: 'Started', sortOrder: 1,
        completionPercent: 0, active: true, approvalStatus: 'Approved', version: 'v01', source: 'CONTROL-015E' },
      { performanceYear: 2026, kpiId: 'SO2-026', stageKey: 'DONE', stageName: 'Complete', sortOrder: 2,
        completionPercent: 100, active: true, approvalStatus: 'Approved', version: 'v01', source: 'CONTROL-015E' }
    ];
    expect(milestoneMapIsApprovedAndValid('SO2-026', stages)).toBe(true);
    expect(buildKpiDataQualityQueue([milestone], assessmentOptions('SO2-026', {
      requiredPolicy: 'Milestone', milestoneStages: stages
    })).rows).toEqual([]);

    expect(milestoneMapIsApprovedAndValid('SO2-026', [{ ...stages[0] }, { ...stages[1], sortOrder: 1 }])).toBe(false);
    expect(milestoneMapIsApprovedAndValid('SO2-026', [{ ...stages[0] }, { ...stages[1], completionPercent: 90 }])).toBe(false);
    expect(milestoneMapIsApprovedAndValid('SO2-026', [{ ...stages[0] }, { ...stages[1], version: 'v02' }])).toBe(false);
  });

  it('keeps Score and TargetRange NotRated queues open until exact approved metadata is complete', () => {
    const score = kpi({ kpiId: 'SCORE-01', metricType: 'Score' });
    const range = kpi({ kpiId: 'RANGE-01', scoringDirection: 'TargetRange' });
    const incomplete = buildKpiDataQualityQueue([score, range], {
      assessmentsByKpiId: {
        'SCORE-01': { requiredPolicy: 'Score' },
        'RANGE-01': { requiredPolicy: 'TargetRange' }
      }
    });
    expect(incomplete.counts.INCOMPLETE_SCORE_CONFIGURATION).toBe(1);
    expect(incomplete.counts.INCOMPLETE_TARGET_RANGE_CONFIGURATION).toBe(1);

    const complete = buildKpiDataQualityQueue([score, range], {
      assessmentsByKpiId: {
        'SCORE-01': { requiredPolicy: 'Score', scoreConfiguration: {
          scoreMinimum: 0, scoreMaximum: 5, targetScore: 4, scoringDirection: 'HigherIsBetter', approved: true
        } },
        'RANGE-01': { requiredPolicy: 'TargetRange', targetRangeConfiguration: {
          rangeMinimum: 90, rangeMaximum: 100, amberToleranceBelow: 10, amberToleranceAbove: 5, approved: true
        } }
      }
    });
    expect(complete.rows).toEqual([]);
  });

  it('composes Score and TargetRange requirements instead of selecting only one policy', () => {
    const scoreRange = kpi({ kpiId: 'SCORE-RANGE-01', metricType: 'Score', scoringDirection: 'TargetRange' });
    const incomplete = buildKpiDataQualityQueue([scoreRange]);
    expect(incomplete.groups[0].rows[0].issues.map(issue => issue.code)).toEqual([
      'INCOMPLETE_SCORE_CONFIGURATION',
      'INCOMPLETE_TARGET_RANGE_CONFIGURATION'
    ]);

    const complete = buildKpiDataQualityQueue([scoreRange], assessmentOptions('SCORE-RANGE-01', {
      scoreConfiguration: {
        scoreMinimum: 0, scoreMaximum: 10, targetScore: 9.5, scoringDirection: 'TargetRange', approved: true
      },
      targetRangeConfiguration: {
        rangeMinimum: 9, rangeMaximum: 10, amberToleranceBelow: 1, amberToleranceAbove: 0, approved: true
      }
    }));
    expect(complete.rows).toEqual([]);
  });

  it('composes Score and Lower-Is-Better requirements instead of skipping Score validation', () => {
    const lowerScore = kpi({
      kpiId: 'SCORE-LOWER-01', metricType: 'Score', scoringDirection: 'LowerIsBetter', yearEndTargetValue: 10
    });
    const incomplete = buildKpiDataQualityQueue([lowerScore]);
    expect(incomplete.groups[0].rows[0].issues.map(issue => issue.code)).toEqual([
      'MISSING_LOWER_BASELINE',
      'INCOMPLETE_SCORE_CONFIGURATION'
    ]);

    const complete = buildKpiDataQualityQueue([lowerScore], assessmentOptions('SCORE-LOWER-01', {
      lowerBaseline: 20,
      lowerTarget: 10,
      scoreConfiguration: {
        scoreMinimum: 0, scoreMaximum: 20, targetScore: 10, scoringDirection: 'LowerIsBetter', approved: true
      }
    }));
    expect(complete.rows).toEqual([]);
  });

  it('reports historic targets in P2 and keeps Workstream weights outside the KPI-level P3 baseline', () => {
    const queue = buildKpiDataQualityQueue([kpi({ kpiWeightWithinWorkstream: undefined })], {
      assessmentsByKpiId: {
        'SO1-001': { historicTargetGapPeriods: ['2024/25 Q2'], sourceReference: 'V6 target reconciliation' }
      },
      workstreamWeights: [{ pillar: 'SO1', workstream: 'Schools Cricket', performanceYear: 2026 }]
    });
    expect(queue.counts.MISSING_HISTORIC_TARGET).toBe(1);
    expect(queue.priorityCounts).toEqual({ P1: 0, P2: 1, P3: 1 });
    expect(queue.legacyPriorityCounts.P3).toBe(1);
    expect(queue.systemIssues).toHaveLength(1);
    expect(queue.systemIssues[0].issue).toContain('WorkstreamWeightWithinPillar');
  });

  it('builds live policy assessments from catalogue metadata without exposing employee routes', () => {
    const milestone = kpi({ kpiId: 'SO2-026', kpiVersionKey: 'SO2-026|v01', scoringDirection: 'Milestone', metricType: 'Milestone' });
    const score = kpi({ kpiId: 'SO1-002', kpiVersionKey: 'SO1-002|v01', scoringDirection: 'TBC', metricType: 'Score' });
    const options = buildKpiDataQualityOptionsFromCatalogue([milestone, score], 2026);
    const queue = buildKpiDataQualityQueue([milestone, score], options);
    expect(queue.counts.MISSING_MILESTONE_MAP).toBe(1);
    expect(queue.counts.INCOMPLETE_SCORE_CONFIGURATION).toBe(1);
    expect(queue.systemIssues).toHaveLength(1);
    expect(options.assessmentsByKpiId?.['SO2-026'].requiredPolicy).toBe('Milestone');
    expect(options.assessmentsByKpiId?.['SO1-002'].requiredPolicy).toBe('Score');
  });

  it('carries actionable Admin fields and preserves an explicitly controlled TBC status', () => {
    const queue = buildKpiDataQualityQueue([kpi({ scoringDirection: 'TBC' })], assessmentOptions('SO1-001', {
      sourceReference: 'GOLD N3:Y112',
      statusOverrides: { TBC_SCORING_DIRECTION: 'IntentionallyTBC' }
    }));
    const issue = queue.groups[0].rows[0].issues[0];
    expect(queue.groups[0].rows[0]).toMatchObject({
      kpiId: 'SO1-001', pillar: 'SO1', workstream: 'Schools Cricket', ownerCode: 'PH'
    });
    expect(issue).toMatchObject({
      priority: 'P1', severity: 'BlocksAuthoritativeScoring', status: 'IntentionallyTBC',
      sourceReference: 'GOLD N3:Y112'
    });
    expect(issue.recommendedResolution).toContain('CONTROL approval');
  });
});

describe('Data Quality Admin and responsive contracts', () => {
  it('allows only the two approved Admin roles without inventing an Admin identity', () => {
    expect(isKpiDataQualityAdmin()).toBe(false);
    expect(isKpiDataQualityAdmin(['Employee'])).toBe(false);
    expect(isKpiDataQualityAdmin(['Manager'])).toBe(false);
    expect(isKpiDataQualityAdmin(['Senior Manager Admin'])).toBe(true);
    expect(isKpiDataQualityAdmin(['SystemAdmin'])).toBe(true);
    expect(isKpiDataQualityAdmin(['SystemAdministrator'])).toBe(false);
  });

  it('exposes bounded layout hooks for grouped desktop and phone-width Admin queues', () => {
    expect(styles.dataQualityPage).toBeDefined();
    expect(styles.dataQualitySummary).toBeDefined();
    expect(styles.dataQualityGroups).toBeDefined();
    expect(styles.dataQualityGroup).toBeDefined();
    expect(styles.dataQualityIdentity).toBeDefined();
    expect(styles.dataQualityIssues).toBeDefined();
    expect(styles.dataQualitySystemIssues).toBeDefined();
  });
});

describe('NOT013 version retention in KPI queue', () => {
  it('retains the exact passed version without changing scoring, groups or source facts', () => {
    const original = kpi({ metricType: 'Percentage', percentageSourceScale: undefined });
    const before = JSON.stringify(original);
    const first = buildKpiDataQualityQueue([original]);
    const later = buildKpiDataQualityQueue([{ ...original, kpiVersionKey: 'SYNTHETIC:next-version' }]);
    expect(first.rows[0].kpiVersionKey).toBe(original.kpiVersionKey);
    expect(later.rows[0].kpiVersionKey).toBe('SYNTHETIC:next-version');
    const withoutVersion = (value: unknown): string => JSON.stringify(value, (key, item) => key === 'kpiVersionKey' ? undefined : item);
    expect(withoutVersion(first)).toBe(withoutVersion(later));
    expect(JSON.stringify(original)).toBe(before);
    // Labelled malformed synthetic boundary input; no version is manufactured for it.
    const absent = buildKpiDataQualityQueue([{ ...original, kpiVersionKey: undefined as unknown as string }]);
    expect(Object.prototype.hasOwnProperty.call(absent.rows[0], 'kpiVersionKey')).toBe(false);
  });
});
