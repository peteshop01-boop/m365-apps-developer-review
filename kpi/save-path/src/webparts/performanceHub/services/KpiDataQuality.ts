import type { ICoreKpiCatalogueItem } from '../models/ProductionModels';

export type KpiDataQualityPriority = 'P1' | 'P2' | 'P3';
export type KpiDataQualitySeverity = 'BlocksAuthoritativeScoring' | 'ReportingQuality' | 'PublicationConfiguration';
export type KpiDataQualityStatus = 'Open' | 'ControlDecisionRequired' | 'SourceDataRequired' | 'IntentionallyTBC';

export type KpiDataQualityIssueCode =
  | 'TBC_SCORING_DIRECTION'
  | 'TBC_METRIC_TYPE'
  | 'MISSING_TARGET'
  | 'MISSING_PERCENTAGE_SOURCE_SCALE'
  | 'MISSING_LOWER_BASELINE'
  | 'INVALID_LOWER_CONFIGURATION'
  | 'MISSING_MILESTONE_MAP'
  | 'INCOMPLETE_SCORE_CONFIGURATION'
  | 'INCOMPLETE_TARGET_RANGE_CONFIGURATION'
  | 'MISSING_UNIT_LABEL'
  | 'UNKNOWN_OWNER_CODE'
  | 'MISSING_HISTORIC_TARGET'
  | 'MISSING_ORGANISATIONAL_WEIGHT';

/** Read-only inputs: these do not change the production KPI model or live data. */
export interface IKpiMilestoneStageAssessment {
  performanceYear: number;
  kpiId: string;
  stageKey: string;
  stageName: string;
  sortOrder: number;
  completionPercent: number;
  active: boolean;
  approvalStatus: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  version: string;
  source: string;
}

export interface IKpiScoreConfigurationAssessment {
  scoreMinimum?: number;
  scoreMaximum?: number;
  targetScore?: number;
  scoringDirection?: string;
  approved?: boolean;
  sourceReference?: string;
}

export interface IKpiTargetRangeConfigurationAssessment {
  rangeMinimum?: number;
  rangeMaximum?: number;
  amberToleranceBelow?: number;
  amberToleranceAbove?: number;
  approved?: boolean;
  sourceReference?: string;
}

export interface IKpiDataQualityAssessment {
  /** Retained for one-policy callers; inferred scorer policies still compose. */
  requiredPolicy?: 'LowerIsBetter' | 'Milestone' | 'Score' | 'TargetRange';
  /** Optional explicit additions for configurations requiring multiple policies. */
  requiredPolicies?: ReadonlyArray<'LowerIsBetter' | 'Milestone' | 'Score' | 'TargetRange'>;
  lowerBaseline?: number;
  lowerTarget?: number;
  milestoneStages?: IKpiMilestoneStageAssessment[];
  scoreConfiguration?: IKpiScoreConfigurationAssessment;
  targetRangeConfiguration?: IKpiTargetRangeConfigurationAssessment;
  historicTargetGapPeriods?: string[];
  sourceReference?: string;
  statusOverrides?: Partial<Record<KpiDataQualityIssueCode, KpiDataQualityStatus>>;
}

export interface IWorkstreamWeightAssessment {
  pillar: string;
  workstream: string;
  performanceYear: number;
  version?: string;
  weight?: number;
  approved?: boolean;
  sourceReference?: string;
}

export interface IKpiDataQualityOptions {
  assessmentsByKpiId?: Readonly<Record<string, IKpiDataQualityAssessment>>;
  /** Workstream-grain findings remain outside the accepted 109-row P3 metric. */
  workstreamWeights?: readonly IWorkstreamWeightAssessment[];
}

export const buildKpiDataQualityOptionsFromCatalogue = (
  catalogue: readonly ICoreKpiCatalogueItem[],
  performanceYear: number | undefined
): IKpiDataQualityOptions => {
  const normaliseValue = (value?: string): string => (value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  const assessmentsByKpiId: Record<string, IKpiDataQualityAssessment> = {};
  catalogue.forEach(kpi => {
    let requiredPolicy: IKpiDataQualityAssessment['requiredPolicy'];
    if (normaliseValue(kpi.scoringDirection) === 'targetrange') requiredPolicy = 'TargetRange';
    else if (normaliseValue(kpi.scoringDirection) === 'milestone' || normaliseValue(kpi.metricType) === 'milestone') requiredPolicy = 'Milestone';
    else if (normaliseValue(kpi.scoringDirection) === 'lowerisbetter') requiredPolicy = 'LowerIsBetter';
    else if (normaliseValue(kpi.metricType) === 'score') requiredPolicy = 'Score';
    if (!requiredPolicy) return;
    const milestone = kpi.approvedMilestonePolicy;
    const score = kpi.approvedScorePolicy;
    const range = kpi.approvedTargetRangePolicy;
    assessmentsByKpiId[kpi.kpiId] = {
      requiredPolicy,
      lowerBaseline: kpi.baselineValue,
      lowerTarget: kpi.yearEndTargetValue,
      milestoneStages: milestone?.stages.map(stage => ({
        performanceYear: Number(milestone.performanceYear),
        kpiId: milestone.kpiId,
        stageKey: stage.stageKey,
        stageName: stage.stageName,
        sortOrder: stage.sortOrder,
        completionPercent: stage.completionPercent,
        active: true,
        approvalStatus: 'Approved',
        effectiveFrom: milestone.effectiveFrom,
        effectiveTo: milestone.effectiveTo,
        version: milestone.version,
        source: milestone.source
      })),
      scoreConfiguration: score ? {
        scoreMinimum: score.scoreMinimum,
        scoreMaximum: score.scoreMaximum,
        targetScore: score.targetScore,
        scoringDirection: score.scoringDirection,
        approved: true,
        sourceReference: score.approvalReference
      } : undefined,
      targetRangeConfiguration: range ? {
        rangeMinimum: range.rangeMinimum,
        rangeMaximum: range.rangeMaximum,
        amberToleranceBelow: range.amberToleranceBelow,
        amberToleranceAbove: range.amberToleranceAbove,
        approved: true,
        sourceReference: range.approvalReference
      } : undefined,
      sourceReference: kpi.classificationSource || `DEMOAPP_KPIMaster ${kpi.kpiVersionKey}`
    };
  });
  const distinctWorkstreams = catalogue.filter((kpi, index, rows) => rows.findIndex(candidate =>
    normaliseValue(candidate.pillar) === normaliseValue(kpi.pillar) && normaliseValue(candidate.workstream) === normaliseValue(kpi.workstream)
  ) === index);
  return {
    assessmentsByKpiId,
    workstreamWeights: distinctWorkstreams.map(kpi => ({
      pillar: kpi.pillar,
      workstream: kpi.workstream,
      performanceYear: performanceYear ?? 0,
      sourceReference: 'DEMO-APP-015E organisational-weight governance: no approved Workstream weight row exists.'
    }))
  };
};

export interface IKpiDataQualityIssue {
  code: KpiDataQualityIssueCode;
  priority: KpiDataQualityPriority;
  severity: KpiDataQualitySeverity;
  detail: string;
  recommendedResolution: string;
  status: KpiDataQualityStatus;
  sourceReference: string;
}

export interface IKpiDataQualityRow {
  kpiId: string;
  /** Exact passed catalogue version; never inferred by the queue. */
  kpiVersionKey?: string;
  wording: string;
  pillar: string;
  workstream: string;
  ownerCode: string;
  classificationStatus: ICoreKpiCatalogueItem['classificationStatus'];
  issues: IKpiDataQualityIssue[];
}

export interface IKpiDataQualityGroup {
  priority: KpiDataQualityPriority;
  title: string;
  description: string;
  totalIssues: number;
  rows: IKpiDataQualityRow[];
}

export interface IKpiDataQualitySystemIssue {
  priority: 'P3';
  severity: 'PublicationConfiguration';
  pillar: string;
  workstream: string;
  issue: string;
  recommendedResolution: string;
  status: KpiDataQualityStatus;
  sourceReference: string;
}

export interface IKpiDataQualityQueue {
  rows: IKpiDataQualityRow[];
  groups: IKpiDataQualityGroup[];
  systemIssues: IKpiDataQualitySystemIssue[];
  totalIssues: number;
  counts: Record<KpiDataQualityIssueCode, number>;
  priorityCounts: Record<KpiDataQualityPriority, number>;
  /** 015D classification rules applied to the currently loaded catalogue. */
  legacyPriorityCounts: Record<KpiDataQualityPriority, number>;
}

const issueCodes: KpiDataQualityIssueCode[] = [
  'TBC_SCORING_DIRECTION', 'TBC_METRIC_TYPE', 'MISSING_TARGET', 'MISSING_PERCENTAGE_SOURCE_SCALE', 'MISSING_LOWER_BASELINE',
  'INVALID_LOWER_CONFIGURATION', 'MISSING_MILESTONE_MAP', 'INCOMPLETE_SCORE_CONFIGURATION',
  'INCOMPLETE_TARGET_RANGE_CONFIGURATION', 'MISSING_UNIT_LABEL', 'UNKNOWN_OWNER_CODE',
  'MISSING_HISTORIC_TARGET', 'MISSING_ORGANISATIONAL_WEIGHT'
];

const emptyCounts = (): Record<KpiDataQualityIssueCode, number> => issueCodes.reduce((result, code) => {
  result[code] = 0;
  return result;
}, {} as Record<KpiDataQualityIssueCode, number>);

const isTbc = (value?: string): boolean => !value?.trim() || value.trim().toUpperCase() === 'TBC';
const hasTarget = (value?: number, text?: string): boolean => typeof value === 'number' || Boolean(text?.trim());
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const normalise = (value?: string): string => (value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');

const defaultSource = (kpi: ICoreKpiCatalogueItem, assessment?: IKpiDataQualityAssessment): string =>
  assessment?.sourceReference || kpi.classificationSource || 'Production KPI Master / approved Annual Target';

export const milestoneMapIsApprovedAndValid = (kpiId: string, stages?: readonly IKpiMilestoneStageAssessment[]): boolean => {
  const active = (stages || []).filter(stage => stage.active);
  if (!active.length) return false;
  if (active.some(stage =>
    stage.kpiId !== kpiId || !Number.isInteger(stage.performanceYear) || !stage.stageKey.trim() ||
    !stage.stageName.trim() || !Number.isInteger(stage.sortOrder) || !isFiniteNumber(stage.completionPercent) ||
    stage.completionPercent < 0 || stage.completionPercent > 100 ||
    normalise(stage.approvalStatus) !== 'approved' || !stage.version.trim() || !stage.source.trim()
  )) return false;
  if (new Set(active.map(stage => stage.version)).size !== 1 ||
    new Set(active.map(stage => stage.performanceYear)).size !== 1) return false;
  const stageKeys = new Set(active.map(stage => `${stage.version}|${normalise(stage.stageKey)}`));
  const sortOrders = new Set(active.map(stage => `${stage.version}|${stage.sortOrder}`));
  if (stageKeys.size !== active.length || sortOrders.size !== active.length) return false;
  const finalStage = [...active].sort((left, right) => right.sortOrder - left.sortOrder)[0];
  return finalStage.completionPercent === 100;
};

const scoreConfigurationIsComplete = (config?: IKpiScoreConfigurationAssessment): boolean => Boolean(
  config?.approved && isFiniteNumber(config.scoreMinimum) && isFiniteNumber(config.scoreMaximum) &&
  isFiniteNumber(config.targetScore) && config.scoreMinimum < config.scoreMaximum &&
  config.targetScore >= config.scoreMinimum && config.targetScore <= config.scoreMaximum &&
  ['higherisbetter', 'lowerisbetter', 'targetrange'].indexOf(normalise(config.scoringDirection)) >= 0
);

const targetRangeConfigurationIsComplete = (config?: IKpiTargetRangeConfigurationAssessment): boolean => Boolean(
  config?.approved && isFiniteNumber(config.rangeMinimum) && isFiniteNumber(config.rangeMaximum) &&
  isFiniteNumber(config.amberToleranceBelow) && isFiniteNumber(config.amberToleranceAbove) &&
  config.rangeMinimum <= config.rangeMaximum && config.amberToleranceBelow >= 0 && config.amberToleranceAbove >= 0
);

const groupDefinitions: Record<KpiDataQualityPriority, Pick<IKpiDataQualityGroup, 'title' | 'description'>> = {
  P1: { title: 'P1 — Blocks authoritative scoring', description: 'Resolve or keep NotRated. No unresolved row may enter authoritative scoring or Recovery routing.' },
  P2: { title: 'P2 — Reporting quality', description: 'Correct source-backed labels, owners and historic target gaps without inferring business meaning.' },
  P3: { title: 'P3 — Organisational publication', description: 'Publication remains disabled until year-specific, versioned and approved weights are complete.' }
};

const buildSystemIssues = (workstreamWeights: readonly IWorkstreamWeightAssessment[] = []): IKpiDataQualitySystemIssue[] => {
  const distinctInvalid = workstreamWeights
    .filter(row => !isFiniteNumber(row.weight) || !row.approved || !row.version?.trim())
    .filter((row, index, source) => source.findIndex(candidate =>
      normalise(candidate.pillar) === normalise(row.pillar) && normalise(candidate.workstream) === normalise(row.workstream)
    ) === index);
  return distinctInvalid.map(row => ({
    priority: 'P3', severity: 'PublicationConfiguration', pillar: row.pillar, workstream: row.workstream,
    issue: 'WorkstreamWeightWithinPillar is missing, unapproved or unversioned.',
    recommendedResolution: 'CONTROL must approve a performance-year-specific, versioned Workstream weight; validate each active Pillar group totals 100%.',
    status: 'ControlDecisionRequired',
    sourceReference: row.sourceReference || `Organisational weighting ${row.performanceYear}`
  }));
};

export const isKpiDataQualityAdmin = (appRoles: readonly string[] = []): boolean => appRoles.some(role => {
  const normalised = normalise(role);
  return normalised === 'seniormanageradmin' || normalised === 'systemadmin';
});

export const buildKpiDataQualityQueue = (
  catalogue: ICoreKpiCatalogueItem[],
  options: IKpiDataQualityOptions = {}
): IKpiDataQualityQueue => {
  const counts = emptyCounts();
  const rows = catalogue.map(kpi => {
    const assessment = options.assessmentsByKpiId?.[kpi.kpiId];
    const issues: IKpiDataQualityIssue[] = [];
    const sourceReference = defaultSource(kpi, assessment);
    const add = (
      code: KpiDataQualityIssueCode,
      priority: KpiDataQualityPriority,
      severity: KpiDataQualitySeverity,
      detail: string,
      recommendedResolution: string,
      defaultStatus: KpiDataQualityStatus,
      issueSource: string = sourceReference
    ): void => {
      issues.push({ code, priority, severity, detail, recommendedResolution,
        status: assessment?.statusOverrides?.[code] || defaultStatus, sourceReference: issueSource });
      counts[code] += 1;
    };

    if (isTbc(kpi.scoringDirection)) add(
      'TBC_SCORING_DIRECTION', 'P1', 'BlocksAuthoritativeScoring',
      'ScoringDirection is unresolved; calculated RAG must remain NotRated.',
      'Obtain source-backed direction semantics and CONTROL approval for this exact KPI/version.', 'ControlDecisionRequired'
    );
    if (isTbc(kpi.metricType)) add(
      'TBC_METRIC_TYPE', 'P1', 'BlocksAuthoritativeScoring', 'MetricType is unresolved.',
      'Confirm the metric type from the authoritative source; do not infer it from wording.', 'SourceDataRequired'
    );

    const missingPeriods = [
      ['year end', kpi.yearEndTargetValue, kpi.yearEndTargetText], ['Q1', kpi.q1TargetValue, kpi.q1TargetText],
      ['Q2', kpi.q2TargetValue, kpi.q2TargetText], ['Q3', kpi.q3TargetValue, kpi.q3TargetText],
      ['Q4', kpi.q4TargetValue, kpi.q4TargetText]
    ].filter(([, value, text]) => !hasTarget(value as number | undefined, text as string | undefined)).map(([period]) => period as string);
    if (missingPeriods.length) add(
      'MISSING_TARGET', 'P1', 'BlocksAuthoritativeScoring',
      `Missing approved target value/text for ${missingPeriods.join(', ')}.`,
      'Supply or explicitly mark the affected period not applicable in an approved Annual Target version.', 'SourceDataRequired'
    );
    if (normalise(kpi.metricType) === 'percentage' && !kpi.percentageSourceScale) add(
      'MISSING_PERCENTAGE_SOURCE_SCALE', 'P1', 'BlocksAuthoritativeScoring',
      'PercentageSourceScale is missing, so fractional and whole-percentage values cannot be distinguished safely.',
      'Confirm Fraction or Whole from the authoritative source for this exact KPI/version; keep the KPI NotRated meanwhile.',
      'SourceDataRequired'
    );

    const requiredPolicies = new Set<IKpiDataQualityAssessment['requiredPolicy']>();
    if (assessment?.requiredPolicy) requiredPolicies.add(assessment.requiredPolicy);
    (assessment?.requiredPolicies || []).forEach(policy => requiredPolicies.add(policy));
    if (normalise(kpi.metricType) === 'score') requiredPolicies.add('Score');
    if (normalise(kpi.scoringDirection) === 'lowerisbetter') requiredPolicies.add('LowerIsBetter');
    if (normalise(kpi.scoringDirection) === 'targetrange') requiredPolicies.add('TargetRange');
    if (normalise(kpi.metricType) === 'milestone' || normalise(kpi.scoringDirection) === 'milestone') {
      requiredPolicies.add('Milestone');
    }

    if (requiredPolicies.has('LowerIsBetter')) {
      const target = isFiniteNumber(assessment?.lowerTarget) ? assessment.lowerTarget : kpi.yearEndTargetValue;
      if (!isFiniteNumber(assessment?.lowerBaseline)) add(
        'MISSING_LOWER_BASELINE', 'P1', 'BlocksAuthoritativeScoring',
        'Lower-Is-Better requires a valid approved Baseline.',
        'Supply a source-backed Baseline for this exact KPI/year/version; keep the KPI NotRated meanwhile.', 'SourceDataRequired'
      );
      else if (!isFiniteNumber(target) || assessment.lowerBaseline <= target) add(
        'INVALID_LOWER_CONFIGURATION', 'P1', 'BlocksAuthoritativeScoring',
        'Lower-Is-Better requires numeric Baseline and Target with Baseline greater than Target.',
        'Correct the source configuration or obtain a KPI-specific CONTROL rule; do not use Target ÷ Actual.', 'ControlDecisionRequired'
      );
    }
    if (requiredPolicies.has('Milestone') && !milestoneMapIsApprovedAndValid(kpi.kpiId, assessment?.milestoneStages)) add(
      'MISSING_MILESTONE_MAP', 'P1', 'BlocksAuthoritativeScoring',
      'No approved current ordered stage map is available for this Milestone KPI.',
      'Admin must create and CONTROL must approve a versioned, ordered stage map whose final active stage is 100%.', 'ControlDecisionRequired'
    );
    if (requiredPolicies.has('Score') && !scoreConfigurationIsComplete(assessment?.scoreConfiguration)) add(
      'INCOMPLETE_SCORE_CONFIGURATION', 'P1', 'BlocksAuthoritativeScoring',
      'ScoreMinimum, ScoreMaximum, TargetScore, ScoringDirection and approval are not all valid.',
      'Obtain authoritative scale/range and direction semantics, then approve the exact Score configuration.', 'ControlDecisionRequired',
      assessment?.scoreConfiguration?.sourceReference || sourceReference
    );
    if (requiredPolicies.has('TargetRange') && !targetRangeConfigurationIsComplete(assessment?.targetRangeConfiguration)) add(
      'INCOMPLETE_TARGET_RANGE_CONFIGURATION', 'P1', 'BlocksAuthoritativeScoring',
      'Approved range bounds and both Amber tolerances are incomplete or invalid.',
      'Supply and approve KPI-specific range and tolerance values; do not invent a universal tolerance.', 'ControlDecisionRequired',
      assessment?.targetRangeConfiguration?.sourceReference || sourceReference
    );

    if (isTbc(kpi.unitLabel)) add(
      'MISSING_UNIT_LABEL', 'P2', 'ReportingQuality', 'UnitLabel is missing or TBC.',
      'Confirm the unit and any required Percentage scale/currency metadata from an authoritative source.', 'SourceDataRequired'
    );
    if (kpi.dataQualityFlags?.toLowerCase().includes('unknown owner code')) add(
      'UNKNOWN_OWNER_CODE', 'P2', 'ReportingQuality',
      `Owner source ${kpi.ownerSourceCode || 'unknown'} has no approved People mapping.`,
      'CONTROL/People data owner must approve one active PersonKey mapping; do not infer identity from initials.', 'ControlDecisionRequired'
    );
    if (assessment?.historicTargetGapPeriods?.length) add(
      'MISSING_HISTORIC_TARGET', 'P2', 'ReportingQuality',
      `Historic target source is missing for ${assessment.historicTargetGapPeriods.join(', ')}.`,
      'Locate the authoritative historic target version or document the gap; do not backfill from another period.', 'SourceDataRequired'
    );
    if (typeof kpi.kpiWeightWithinWorkstream !== 'number') add(
      'MISSING_ORGANISATIONAL_WEIGHT', 'P3', 'PublicationConfiguration',
      'KPIWeightWithinWorkstream is not assigned; organisational weighted publication remains unavailable.',
      'CONTROL must approve performance-year-specific, versioned KPI weights and validate each Workstream totals 100%.',
      'ControlDecisionRequired', 'Production KPI Master organisational weighting'
    );

    return { kpiId: kpi.kpiId, ...(kpi.kpiVersionKey !== undefined ? { kpiVersionKey: kpi.kpiVersionKey } : {}), wording: kpi.wording, pillar: kpi.pillar, workstream: kpi.workstream,
      ownerCode: kpi.ownerSourceCode || 'TBC', classificationStatus: kpi.classificationStatus, issues };
  }).filter(row => row.issues.length > 0);

  rows.sort((left, right) => right.issues.length - left.issues.length || left.kpiId.localeCompare(right.kpiId));
  const groups = (['P1', 'P2', 'P3'] as KpiDataQualityPriority[]).map(priority => {
    const groupedRows = rows.map(row => ({ ...row, issues: row.issues.filter(issue => issue.priority === priority) }))
      .filter(row => row.issues.length > 0);
    return { priority, ...groupDefinitions[priority],
      totalIssues: groupedRows.reduce((sum, row) => sum + row.issues.length, 0), rows: groupedRows };
  });
  const priorityCounts = groups.reduce((result, group) => {
    result[group.priority] = group.totalIssues;
    return result;
  }, { P1: 0, P2: 0, P3: 0 } as Record<KpiDataQualityPriority, number>);
  const legacyPriorityCounts = {
    P1: counts.TBC_SCORING_DIRECTION + counts.TBC_METRIC_TYPE + counts.MISSING_TARGET + counts.UNKNOWN_OWNER_CODE,
    P2: counts.MISSING_UNIT_LABEL,
    P3: counts.MISSING_ORGANISATIONAL_WEIGHT
  };
  return { rows, groups, systemIssues: buildSystemIssues(options.workstreamWeights),
    totalIssues: issueCodes.reduce((sum, code) => sum + counts[code], 0), counts, priorityCounts, legacyPriorityCounts };
};
