export interface IScoringThresholds {
  greenThreshold: number;
  amberThreshold: number;
}

export type ScoringThresholdSource = 'KpiOverride' | 'Config' | 'Fallback';
export type PercentageSourceScale = 'Fraction' | 'Whole';

export interface IKpiScoringThresholdOverride extends IScoringThresholds {
  kpiId: string;
  kpiVersionKey: string;
  approvalReference?: string;
}

export interface IScoringKpiIdentity {
  kpiId: string;
  kpiVersionKey: string;
  performanceYear?: string;
}

export type ScoringMetadataApprovalStatus = 'Draft' | 'Approved' | 'Retired';

export interface IMilestoneStageRecord {
  performanceYear: string;
  kpiId: string;
  kpiVersionKey: string;
  stageKey: string;
  stageName: string;
  sortOrder: number;
  completionPercent: number;
  active: boolean;
  approvalStatus: ScoringMetadataApprovalStatus;
  effectiveFrom: string;
  effectiveTo?: string;
  version: string;
  source: string;
  approvalReference: string;
}

export type IApprovedMilestoneStage = Readonly<Pick<
  IMilestoneStageRecord,
  'stageKey' | 'stageName' | 'sortOrder' | 'completionPercent'
>>;

export interface IApprovedMilestonePolicy {
  performanceYear: string;
  kpiId: string;
  kpiVersionKey: string;
  version: string;
  source: string;
  approvalReference: string;
  effectiveFrom: string;
  effectiveTo?: string;
  resolvedEffectiveAt: string;
  stages: readonly IApprovedMilestoneStage[];
}

export interface IMilestonePolicyLookup {
  performanceYear: string;
  kpiId: string;
  kpiVersionKey: string;
  version: string;
  effectiveAt: string;
}

export interface IApprovedScorePolicy {
  approvalReference: string;
  scoreMinimum: number;
  scoreMaximum: number;
  targetScore: number;
  scoringDirection: 'HigherIsBetter' | 'LowerIsBetter' | 'TargetRange';
}

export interface IApprovedTargetRangePolicy {
  approvalReference: string;
  rangeMinimum: number;
  rangeMaximum: number;
  amberToleranceBelow: number;
  amberToleranceAbove: number;
}

export interface IScoringPolicyContext {
  kpiIdentity?: IScoringKpiIdentity;
  configThresholds?: IScoringThresholds;
  kpiThresholdOverride?: IKpiScoringThresholdOverride;
  percentageSourceScale?: PercentageSourceScale;
  approvedMilestonePolicy?: IApprovedMilestonePolicy;
  scoringEffectiveAt?: string;
  approvedScorePolicy?: IApprovedScorePolicy;
  approvedTargetRangePolicy?: IApprovedTargetRangePolicy;
}

export interface IResolvedScoringThresholds extends IScoringThresholds {
  source: ScoringThresholdSource;
  approvalReference?: string;
  ignoredOverrideReason?: 'NOT_APPROVED_OR_AUDITABLE';
}

export const KCF_SCORING_FALLBACK_THRESHOLDS: Readonly<IScoringThresholds> = Object.freeze({
  greenThreshold: 90,
  amberThreshold: 50
});

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const normaliseKey = (value: string): string => value.trim().toLowerCase();
const parseTimestamp = (value: string): number | undefined => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

const validateThresholds = (thresholds: IScoringThresholds, source: ScoringThresholdSource): IScoringThresholds => {
  if (!isFiniteNumber(thresholds.greenThreshold) || !isFiniteNumber(thresholds.amberThreshold)
    || thresholds.greenThreshold > 100 || thresholds.greenThreshold <= thresholds.amberThreshold
    || thresholds.amberThreshold < 0) {
    throw new Error(`${source} RAG thresholds must satisfy 100 >= Green > Amber >= 0.`);
  }
  return thresholds;
};

export const resolveScoringThresholds = (context: IScoringPolicyContext = {}): IResolvedScoringThresholds => {
  const override = context.kpiThresholdOverride;
  const approvalReference = override?.approvalReference?.trim();
  const exactKpiVersion = Boolean(override && context.kpiIdentity
    && override.kpiId.trim().toLowerCase() === context.kpiIdentity.kpiId.trim().toLowerCase()
    && override.kpiVersionKey.trim().toLowerCase() === context.kpiIdentity.kpiVersionKey.trim().toLowerCase());
  if (override && approvalReference && exactKpiVersion) {
    const validated = validateThresholds(override, 'KpiOverride');
    return {
      greenThreshold: validated.greenThreshold,
      amberThreshold: validated.amberThreshold,
      source: 'KpiOverride',
      approvalReference
    };
  }

  if (context.configThresholds) {
    const validated = validateThresholds(context.configThresholds, 'Config');
    return {
      greenThreshold: validated.greenThreshold,
      amberThreshold: validated.amberThreshold,
      source: 'Config',
      ignoredOverrideReason: override ? 'NOT_APPROVED_OR_AUDITABLE' : undefined
    };
  }

  return {
    ...KCF_SCORING_FALLBACK_THRESHOLDS,
    source: 'Fallback',
    ignoredOverrideReason: override ? 'NOT_APPROVED_OR_AUDITABLE' : undefined
  };
};

export const normalisePercentageSourceValue = (value: number, scale: PercentageSourceScale): number =>
  scale === 'Fraction' ? value * 100 : value;

const hasValidMilestoneStages = (stages: readonly IApprovedMilestoneStage[]): boolean => {
  if (stages.length < 2) return false;
  const ordered = [...stages].sort((left, right) => left.sortOrder - right.sortOrder);
  const stageKeys = new Set<string>();
  const stageNames = new Set<string>();
  const sortOrders = new Set<number>();
  let previousCompletion = -1;
  for (const stage of ordered) {
    const stageKey = normaliseKey(stage.stageKey);
    const stageName = normaliseKey(stage.stageName);
    if (!stageKey || !stageName || !Number.isInteger(stage.sortOrder) || stage.sortOrder < 1
      || !isFiniteNumber(stage.completionPercent) || stage.completionPercent < 0 || stage.completionPercent > 100
      || stage.completionPercent < previousCompletion || stageKeys.has(stageKey) || stageNames.has(stageName)
      || sortOrders.has(stage.sortOrder)) return false;
    stageKeys.add(stageKey);
    stageNames.add(stageName);
    sortOrders.add(stage.sortOrder);
    previousCompletion = stage.completionPercent;
  }
  return ordered[ordered.length - 1].completionPercent === 100;
};

export const isApprovedMilestonePolicy = (
  policy?: IApprovedMilestonePolicy,
  identity?: IScoringKpiIdentity,
  effectiveAt?: string
): boolean => {
  const effectiveFrom = policy ? parseTimestamp(policy.effectiveFrom) : undefined;
  const effectiveTo = policy?.effectiveTo ? parseTimestamp(policy.effectiveTo) : undefined;
  const resolvedEffectiveAt = policy ? parseTimestamp(policy.resolvedEffectiveAt) : undefined;
  if (!policy || !policy.approvalReference.trim() || !policy.source.trim() || !policy.version.trim()
    || !policy.performanceYear.trim() || !policy.kpiId.trim() || !policy.kpiVersionKey.trim()
    || effectiveFrom === undefined || (policy.effectiveTo && effectiveTo === undefined)
    || resolvedEffectiveAt === undefined
    || (effectiveTo !== undefined && effectiveTo < effectiveFrom)
    || !hasValidMilestoneStages(policy.stages)) return false;
  if (!identity) return true;
  const effectiveTimestamp = effectiveAt ? parseTimestamp(effectiveAt) : undefined;
  return Boolean(identity.performanceYear) && effectiveTimestamp !== undefined
    && normaliseKey(identity.kpiId) === normaliseKey(policy.kpiId)
    && normaliseKey(identity.kpiVersionKey) === normaliseKey(policy.kpiVersionKey)
    && normaliseKey(identity.performanceYear as string) === normaliseKey(policy.performanceYear)
    && resolvedEffectiveAt === effectiveTimestamp
    && effectiveFrom <= effectiveTimestamp && (!policy.effectiveTo || (effectiveTo as number) >= effectiveTimestamp);
};

export const resolveApprovedMilestonePolicy = (
  records: readonly IMilestoneStageRecord[],
  lookup: IMilestonePolicyLookup
): IApprovedMilestonePolicy | undefined => {
  const effectiveAt = parseTimestamp(lookup.effectiveAt);
  if (effectiveAt === undefined) return undefined;
  const exactVersion = records.filter(record =>
    record.active
    && normaliseKey(record.performanceYear) === normaliseKey(lookup.performanceYear)
    && normaliseKey(record.kpiId) === normaliseKey(lookup.kpiId)
    && normaliseKey(record.kpiVersionKey) === normaliseKey(lookup.kpiVersionKey)
    && normaliseKey(record.version) === normaliseKey(lookup.version));
  const current = exactVersion.filter(record => {
    const effectiveFrom = parseTimestamp(record.effectiveFrom);
    const effectiveTo = record.effectiveTo ? parseTimestamp(record.effectiveTo) : undefined;
    return effectiveFrom !== undefined && effectiveFrom <= effectiveAt
      && (!record.effectiveTo || (effectiveTo !== undefined && effectiveTo >= effectiveAt));
  });
  if (current.some(record => record.approvalStatus !== 'Approved')) return undefined;
  const matching = current.filter(record => record.approvalStatus === 'Approved');
  if (!matching.length) return undefined;
  const first = matching[0];
  if (matching.some(record => normaliseKey(record.approvalReference) !== normaliseKey(first.approvalReference)
    || normaliseKey(record.source) !== normaliseKey(first.source)
    || record.effectiveFrom !== first.effectiveFrom || record.effectiveTo !== first.effectiveTo)) return undefined;
  const policy: IApprovedMilestonePolicy = {
    performanceYear: first.performanceYear,
    kpiId: first.kpiId,
    kpiVersionKey: first.kpiVersionKey,
    version: first.version,
    source: first.source,
    approvalReference: first.approvalReference,
    effectiveFrom: first.effectiveFrom,
    effectiveTo: first.effectiveTo,
    resolvedEffectiveAt: lookup.effectiveAt,
    stages: matching
      .map(record => ({
        stageKey: record.stageKey,
        stageName: record.stageName,
        sortOrder: record.sortOrder,
        completionPercent: record.completionPercent
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder)
  };
  return isApprovedMilestonePolicy(policy, lookup, lookup.effectiveAt) ? policy : undefined;
};

export const isApprovedScorePolicy = (policy?: IApprovedScorePolicy): boolean =>
  Boolean(policy?.approvalReference.trim())
  && Boolean(policy && isFiniteNumber(policy.scoreMinimum) && isFiniteNumber(policy.scoreMaximum)
    && isFiniteNumber(policy.targetScore) && policy.scoreMaximum > policy.scoreMinimum
    && policy.targetScore >= policy.scoreMinimum && policy.targetScore <= policy.scoreMaximum
    && (policy.scoringDirection === 'HigherIsBetter' || policy.scoringDirection === 'LowerIsBetter'
      || policy.scoringDirection === 'TargetRange'));

export const isApprovedTargetRangePolicy = (policy?: IApprovedTargetRangePolicy): boolean =>
  Boolean(policy?.approvalReference.trim())
  && Boolean(policy && isFiniteNumber(policy.rangeMinimum) && isFiniteNumber(policy.rangeMaximum)
    && isFiniteNumber(policy.amberToleranceBelow) && isFiniteNumber(policy.amberToleranceAbove)
    && policy.rangeMaximum >= policy.rangeMinimum && policy.amberToleranceBelow >= 0
    && policy.amberToleranceAbove >= 0);
