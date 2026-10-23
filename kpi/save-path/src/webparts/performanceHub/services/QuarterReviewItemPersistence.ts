import type { ICoreKpiCatalogueItem, IProductionConfig } from '../models/ProductionModels';
import type { IQuarterReviewItem, IScoringResult, QuarterKey } from '../models/QuarterlyModels';
import { calculatePerformance } from './PerformanceScoring';
import { validateQuarterDraftSave } from './QuarterDraftValidation';
import { validateRecoveryAction } from './RecoveryActionValidation';
import { assertQuarterImpactAnnualSnapshot } from './QuarterImpactSnapshot';
import { validateBehaviourPlanningLevelsV1 } from './BehaviourFrameworkV2Policy';
import type { IAnnualWorkplan, IBehaviourWorkplanItem } from '../models/ProductionModels';

import { materialiseQuarterBehaviourTarget, ownSnapshotValue, QUARTER_BEHAVIOUR_TARGET_FIELDS,
  isSpecificBehaviourSourceEtag } from './QuarterBehaviourTargetSnapshot';

/** Validate both images before comparing them; equality does not establish validity. */
export const assertFrozenBehaviourAnnualTarget = (
  expected: IQuarterReviewItem, persisted: IQuarterReviewItem
): void => {
  const expectedSnapshot = ownSnapshotValue(expected, 'behaviourSnapshotV2');
  const persistedSnapshot = ownSnapshotValue(persisted, 'behaviourSnapshotV2');
  const left = materialiseQuarterBehaviourTarget(expected);
  const right = materialiseQuarterBehaviourTarget(persisted);
  if (!expectedSnapshot && !persistedSnapshot && !left && !right) return;
  if (!left || !right
    || ['quarterReviewItemKey', 'workplanItemKey', 'workplanKey', 'personKey', 'performanceYear', 'quarter', 'behaviourId']
      .some(key => ownSnapshotValue(expected, key) !== ownSnapshotValue(persisted, key))
    || ['valueId', 'frameworkVersion', 'period'].some(key =>
      ownSnapshotValue(expectedSnapshot, key) !== ownSnapshotValue(persistedSnapshot, key))
    || QUARTER_BEHAVIOUR_TARGET_FIELDS.some(key => left[key] !== right[key])) {
    throw new Error('The frozen annual Behaviour Target or provenance is absent or changed. Reload and reconcile the Quarter Review.');
  }
};

/** Used only when creating an unsaved quarter item from an approved version. */
export const assertApprovedBehaviourTargetSource = (
  item: IQuarterReviewItem, workplan: IAnnualWorkplan, source: IBehaviourWorkplanItem
): void => {
  // Copy authority data descriptors into local values before any ordinary reads.
  const copy = (value: unknown, keys: string[]): Record<string, unknown> =>
    Object.fromEntries(keys.map(key => [key, ownSnapshotValue(value, key)]));
  workplan = copy(workplan, ['state', 'transitionCorrelationKey', 'rowVersionToken', 'workplanKey', 'personKey', 'performanceYear']) as unknown as IAnnualWorkplan;
  source = copy(source, ['behaviourPlanningLevelsV1', 'workplanKey', 'personKey', 'performanceYear', 'activeInWorkplan',
    'workplanItemKey', 'behaviourSnapshotV2', 'behaviourId', 'etag']) as unknown as IBehaviourWorkplanItem;
  const planning = copy(source.behaviourPlanningLevelsV1, Object.getOwnPropertyNames(source.behaviourPlanningLevelsV1 || {}));
  const sourceValueId = ownSnapshotValue(source.behaviourSnapshotV2, 'valueId');
  const levels = validateBehaviourPlanningLevelsV1(planning);
  const image = materialiseQuarterBehaviourTarget(item);
  if (!image) throw new Error('The Quarter Review requires the exact approved annual Behaviour Target source version.');
  item = { ...image, behaviourSnapshotV2: { valueId: ownSnapshotValue(ownSnapshotValue(item, 'behaviourSnapshotV2'), 'valueId') },
    ...copy(item, ['workplanItemKey', 'workplanKey', 'personKey', 'performanceYear']) } as unknown as IQuarterReviewItem;
  if (!item.behaviourSnapshotV2 || !levels?.targetLevel
    || (workplan.state !== 'Approved' && workplan.state !== 'Locked')
    || typeof workplan.transitionCorrelationKey !== 'string' || !workplan.transitionCorrelationKey.trim()
    || !Number.isSafeInteger(workplan.rowVersionToken) || workplan.rowVersionToken < 1
    || source.workplanKey !== workplan.workplanKey || source.personKey !== workplan.personKey
    || source.performanceYear !== workplan.performanceYear || !source.activeInWorkplan
    || source.workplanItemKey !== item.workplanItemKey
    || sourceValueId !== item.behaviourSnapshotV2.valueId
    || source.behaviourId !== item.behaviourSnapshotV2.valueId
    || !isSpecificBehaviourSourceEtag(source.etag)
    || item.workplanKey !== workplan.workplanKey || item.personKey !== workplan.personKey
    || item.performanceYear !== workplan.performanceYear
    || item.behaviourAnnualTargetLevelV2 !== levels.targetLevel
    || item.behaviourAnnualTargetJustificationV2 !== levels.targetJustification
    || item.behaviourAnnualTargetSourceWorkplanItemKeyV2 !== source.workplanItemKey
    || item.behaviourAnnualTargetSourceEtagV2 !== source.etag
    || item.behaviourAnnualTargetSourceWorkplanVersionV2 !== workplan.rowVersionToken
    || item.behaviourAnnualTargetSourceApprovalKeyV2 !== workplan.transitionCorrelationKey) {
    throw new Error('The Quarter Review requires the exact approved annual Behaviour Target source version.');
  }
};

export interface IQuarterTargetSnapshot {
  value?: number;
  text?: string;
}

export const resolveCoreQuarterTarget = (kpi: ICoreKpiCatalogueItem, quarter: QuarterKey): IQuarterTargetSnapshot => {
  let target: { value?: number; text?: string; display?: string };
  if (quarter === 'Q1') target = { value: kpi.q1TargetValue, text: kpi.q1TargetText, display: kpi.q1Target };
  else if (quarter === 'Q2') target = { value: kpi.q2TargetValue, text: kpi.q2TargetText, display: kpi.q2Target };
  else if (quarter === 'Q3') target = { value: kpi.q3TargetValue, text: kpi.q3TargetText, display: kpi.q3Target };
  else if (quarter === 'Q4') target = { value: kpi.q4TargetValue, text: kpi.q4TargetText, display: kpi.q4Target };
  else throw new Error('Core target requires a supported quarter.');
  // Explicit text (including empty text) is authoritative. Legacy display is
  // used only when both typed target fields are absent; numeric zero is present.
  return { value: target.value, text: target.text === undefined && target.value === undefined ? target.display : target.text };
};

const normaliseText = (value?: string): string => value?.trim() || '';

export const assertAuthoritativeCoreSnapshot = (
  persisted: IQuarterReviewItem,
  kpi: ICoreKpiCatalogueItem
): void => {
  if (persisted.itemType !== 'CoreGold'
    || !persisted.kpiId
    || persisted.kpiId !== kpi.kpiId
    || persisted.kpiVersionKey !== kpi.kpiVersionKey
    || persisted.targetVersionKey !== kpi.targetVersionKey) {
    throw new Error('The saved Core KPI snapshot no longer matches the current approved KPI/target versions. Admin reconciliation is required.');
  }
  const authoritative = resolveCoreQuarterTarget(kpi, persisted.quarter);
  if (persisted.quarterTargetValue !== authoritative.value
    || normaliseText(persisted.quarterTargetText) !== normaliseText(authoritative.text)) {
    throw new Error('The saved Quarter target no longer matches the approved Annual Target. Admin reconciliation is required.');
  }
};

export const prepareAuthoritativeCoreQuarterSave = (
  persisted: IQuarterReviewItem,
  incoming: IQuarterReviewItem,
  kpi: ICoreKpiCatalogueItem,
  config: IProductionConfig
): { item: IQuarterReviewItem; scoring: IScoringResult } => {
  assertAuthoritativeCoreSnapshot(persisted, kpi);
  if (config.performanceYearNumber !== persisted.performanceYear) {
    throw new Error('The production Config year does not match this Quarter Review.');
  }

  const controlled: IQuarterReviewItem = {
    ...persisted,
    scoringDirection: kpi.scoringDirection,
    metricType: kpi.metricType,
    unitLabel: kpi.unitLabel,
    strategyTarget: kpi.strategyTarget,
    yearEndTarget: kpi.yearEndTarget,
    employeeActualValue: incoming.employeeActualValue,
    employeeActualText: incoming.employeeActualText,
    statusUpdate: incoming.statusUpdate,
    quarterEndForecastValue: incoming.quarterEndForecastValue,
    quarterEndForecastText: incoming.quarterEndForecastText,
    recovery: incoming.recovery?.route ? incoming.recovery : undefined,
    evidenceCount: persisted.evidenceCount
  };
  const draftValidation = validateQuarterDraftSave(controlled);
  if (!draftValidation.valid) throw new Error(draftValidation.errors.join(' '));

  const scoring = calculatePerformance({
    scoringDirection: controlled.scoringDirection || 'TBC',
    metricType: controlled.metricType || 'Other',
    targetValue: persisted.quarterTargetValue,
    actualValue: controlled.employeeActualValue,
    targetText: persisted.quarterTargetText,
    actualText: controlled.employeeActualText,
    baselineValue: kpi.baselineValue
  }, {
    kpiIdentity: { kpiId: kpi.kpiId, kpiVersionKey: kpi.kpiVersionKey, performanceYear: String(config.performanceYearNumber) },
    configThresholds: config.rag,
    percentageSourceScale: kpi.percentageSourceScale,
    kpiThresholdOverride: kpi.kpiThresholdOverride,
    approvedMilestonePolicy: kpi.approvedMilestonePolicy,
    scoringEffectiveAt: kpi.approvedMilestonePolicy?.resolvedEffectiveAt,
    approvedScorePolicy: kpi.approvedScorePolicy,
    approvedTargetRangePolicy: kpi.approvedTargetRangePolicy
  });
  const recoveryValidation = validateRecoveryAction(scoring.calculatedRag, controlled.recovery);
  if (!recoveryValidation.valid) throw new Error(recoveryValidation.errors.join(' '));

  return {
    item: {
      ...controlled,
      progressPct: scoring.rawProgressPct,
      scoredProgressPct: scoring.scoredProgressPct,
      calculatedRag: scoring.calculatedRag,
      calculationRuleVersion: scoring.calculationVersion,
      scoringMessage: scoring.message
    },
    scoring
  };
};

export const prepareAuthoritativePersonalQuarterSave = (
  persisted: IQuarterReviewItem,
  incoming: IQuarterReviewItem,
  config: IProductionConfig
): { item: IQuarterReviewItem; scoring: IScoringResult } => {
  if (persisted.itemType !== 'LocalPersonal') {
    throw new Error('The saved Quarterly item is not a Personal KPI snapshot.');
  }
  if (persisted.impactAnnualDefinitionSnapshot || persisted.reportingStream) {
    assertQuarterImpactAnnualSnapshot(persisted);
  }
  if (config.performanceYearNumber !== persisted.performanceYear) {
    throw new Error('The production Config year does not match this Quarter Review.');
  }

  const controlled: IQuarterReviewItem = {
    ...persisted,
    reportingStream: persisted.reportingStream || 'Impact',
    employeeActualValue: incoming.employeeActualValue,
    employeeActualText: incoming.employeeActualText,
    statusUpdate: incoming.statusUpdate,
    quarterEndForecastValue: incoming.quarterEndForecastValue,
    quarterEndForecastText: incoming.quarterEndForecastText,
    recovery: incoming.recovery?.route ? incoming.recovery : undefined,
    evidenceCount: persisted.evidenceCount
  };
  const draftValidation = validateQuarterDraftSave(controlled);
  if (!draftValidation.valid) throw new Error(draftValidation.errors.join(' '));

  const scoring = calculatePerformance({
    scoringDirection: controlled.scoringDirection || 'TBC',
    metricType: controlled.metricType || 'Other',
    targetValue: controlled.quarterTargetValue,
    targetText: controlled.quarterTargetText,
    actualValue: controlled.employeeActualValue,
    actualText: controlled.employeeActualText,
    baselineValue: controlled.baselineValue
  }, {
    configThresholds: config.rag,
    percentageSourceScale: controlled.percentageSourceScale
  });

  // Personal Recovery is authoritative only while action is required. A KPI
  // that scores Green must clear any Recovery payload left by an earlier save.
  const recovery = scoring.calculatedRag === 'Green' ? undefined : controlled.recovery;
  const recoveryValidation = validateRecoveryAction(scoring.calculatedRag, recovery);
  if (!recoveryValidation.valid) throw new Error(recoveryValidation.errors.join(' '));

  return {
    item: {
      ...controlled,
      recovery,
      progressPct: scoring.rawProgressPct,
      scoredProgressPct: scoring.scoredProgressPct,
      calculatedRag: scoring.calculatedRag,
      calculationRuleVersion: scoring.calculationVersion,
      scoringMessage: scoring.message
    },
    scoring
  };
};
