import type {
  IApprovedScorePolicy,
  IApprovedTargetRangePolicy,
  IKpiScoringThresholdOverride,
  PercentageSourceScale
} from './ScoringPolicy';

export const PRODUCTION_SCORING_METADATA_SCHEMA = 'DEMO-SCORING-POLICY-001';

export interface IProductionScoringMetadata {
  schemaVersion: typeof PRODUCTION_SCORING_METADATA_SCHEMA;
  status: 'Approved' | 'Incomplete';
  approvalReference?: string;
  source: string;
  percentageSourceScale?: PercentageSourceScale;
  baselineValue?: number;
  greenThreshold?: number;
  amberThreshold?: number;
  scoreMinimum?: number;
  scoreMaximum?: number;
  targetScore?: number;
  scoreDirection?: 'HigherIsBetter' | 'LowerIsBetter' | 'TargetRange';
  rangeMinimum?: number;
  rangeMaximum?: number;
  amberToleranceBelow?: number;
  amberToleranceAbove?: number;
  milestoneVersion?: string;
}

export interface IResolvedProductionScoringMetadata {
  metadata?: IProductionScoringMetadata;
  percentageSourceScale?: PercentageSourceScale;
  baselineValue?: number;
  kpiThresholdOverride?: IKpiScoringThresholdOverride;
  approvedScorePolicy?: IApprovedScorePolicy;
  approvedTargetRangePolicy?: IApprovedTargetRangePolicy;
  milestoneVersion?: string;
  issues: string[];
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;

const readNumber = (record: Record<string, unknown>, key: string): number | undefined =>
  isFiniteNumber(record[key]) ? record[key] as number : undefined;

export const parseProductionScoringMetadata = (
  json: string | undefined,
  kpiId: string,
  kpiVersionKey: string
): IResolvedProductionScoringMetadata => {
  if (!json?.trim()) return { issues: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { issues: ['SCORING_METADATA_INVALID_JSON'] };
  }
  if (!isRecord(raw) || raw.schemaVersion !== PRODUCTION_SCORING_METADATA_SCHEMA
    || (raw.status !== 'Approved' && raw.status !== 'Incomplete') || !text(raw.source)) {
    return { issues: ['SCORING_METADATA_INVALID_SCHEMA'] };
  }
  const metadata = raw as unknown as IProductionScoringMetadata;
  const issues: string[] = [];
  const approvalReference = text(raw.approvalReference);
  const approved = raw.status === 'Approved' && Boolean(approvalReference);
  if (raw.status === 'Approved' && !approvalReference) issues.push('SCORING_METADATA_APPROVAL_REFERENCE_MISSING');

  const percentageSourceScale = raw.percentageSourceScale === 'Fraction' || raw.percentageSourceScale === 'Whole'
    ? raw.percentageSourceScale
    : undefined;
  if (raw.percentageSourceScale !== undefined && !percentageSourceScale) issues.push('PERCENTAGE_SOURCE_SCALE_INVALID');

  const baselineValue = readNumber(raw, 'baselineValue');
  const greenThreshold = readNumber(raw, 'greenThreshold');
  const amberThreshold = readNumber(raw, 'amberThreshold');
  let kpiThresholdOverride: IKpiScoringThresholdOverride | undefined;
  if (greenThreshold !== undefined || amberThreshold !== undefined) {
    if (approved && greenThreshold !== undefined && amberThreshold !== undefined) {
      kpiThresholdOverride = { kpiId, kpiVersionKey, greenThreshold, amberThreshold, approvalReference };
    } else issues.push('KPI_THRESHOLD_OVERRIDE_INCOMPLETE');
  }

  const scoreMinimum = readNumber(raw, 'scoreMinimum');
  const scoreMaximum = readNumber(raw, 'scoreMaximum');
  const targetScore = readNumber(raw, 'targetScore');
  const scoreDirection = raw.scoreDirection === 'HigherIsBetter' || raw.scoreDirection === 'LowerIsBetter'
    || raw.scoreDirection === 'TargetRange'
    ? raw.scoreDirection
    : undefined;
  const hasScoreMetadata = scoreMinimum !== undefined || scoreMaximum !== undefined || targetScore !== undefined || raw.scoreDirection !== undefined;
  let approvedScorePolicy: IApprovedScorePolicy | undefined;
  if (hasScoreMetadata) {
    if (approved && scoreMinimum !== undefined && scoreMaximum !== undefined && targetScore !== undefined && scoreDirection) {
      approvedScorePolicy = { approvalReference: approvalReference as string, scoreMinimum, scoreMaximum, targetScore, scoringDirection: scoreDirection };
    } else issues.push('SCORE_POLICY_INCOMPLETE');
  }

  const rangeMinimum = readNumber(raw, 'rangeMinimum');
  const rangeMaximum = readNumber(raw, 'rangeMaximum');
  const amberToleranceBelow = readNumber(raw, 'amberToleranceBelow');
  const amberToleranceAbove = readNumber(raw, 'amberToleranceAbove');
  const hasRangeMetadata = rangeMinimum !== undefined || rangeMaximum !== undefined
    || amberToleranceBelow !== undefined || amberToleranceAbove !== undefined;
  let approvedTargetRangePolicy: IApprovedTargetRangePolicy | undefined;
  if (hasRangeMetadata) {
    if (approved && rangeMinimum !== undefined && rangeMaximum !== undefined
      && amberToleranceBelow !== undefined && amberToleranceAbove !== undefined) {
      approvedTargetRangePolicy = {
        approvalReference: approvalReference as string,
        rangeMinimum,
        rangeMaximum,
        amberToleranceBelow,
        amberToleranceAbove
      };
    } else issues.push('TARGET_RANGE_POLICY_INCOMPLETE');
  }

  const milestoneVersion = text(raw.milestoneVersion);
  if (raw.status === 'Incomplete') issues.push('SCORING_METADATA_INCOMPLETE');
  return {
    metadata,
    percentageSourceScale: approved ? percentageSourceScale : undefined,
    baselineValue: approved ? baselineValue : undefined,
    kpiThresholdOverride,
    approvedScorePolicy,
    approvedTargetRangePolicy,
    milestoneVersion: approved ? milestoneVersion : undefined,
    issues
  };
};

export const serialiseProductionScoringMetadata = (metadata: IProductionScoringMetadata): string =>
  JSON.stringify(metadata);
