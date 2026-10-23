import type {
  IAnnualWorkplan,
  IBehaviourWorkplanItem,
  IProductionConfig,
  ICoreWorkplanItem,
  IPersonalWorkplanItem
} from '../models/ProductionModels';
import type { IQuarterReviewItem, RagStatus } from '../models/QuarterlyModels';

export type EmployeePerformanceState = 'Rated' | 'Provisional' | 'NotRated' | 'NotAvailable';

export interface IEmployeePerformanceIndicator {
  key: 'core' | 'personal' | 'behaviours' | 'overall';
  label: string;
  state: EmployeePerformanceState;
  progressPct?: number;
  rag?: RagStatus;
  explanation: string;
}

export interface IEmployeePerformanceSummary {
  core: IEmployeePerformanceIndicator;
  personal: IEmployeePerformanceIndicator;
  behaviours: IEmployeePerformanceIndicator;
  overall: IEmployeePerformanceIndicator;
}

const rounded = (value: number): number => Math.round(value * 100) / 100;

const ragFromProgress = (progress: number, config: IProductionConfig): Exclude<RagStatus, 'NotRated'> =>
  progress >= config.rag.greenThreshold ? 'Green' : progress >= config.rag.amberThreshold ? 'Amber' : 'Red';

const weightedIndicator = (
  key: 'core' | 'personal',
  label: string,
  assignments: Array<{ workplanItemKey: string; weight?: number }>,
  quarterItems: IQuarterReviewItem[],
  config: IProductionConfig | undefined
): IEmployeePerformanceIndicator => {
  const activeAssignments = assignments.filter(item => item.workplanItemKey);
  if (!activeAssignments.length) return {
    key, label, state: 'NotRated', rag: 'NotRated',
    explanation: key === 'personal' ? 'No active Personal KPI is in this Workplan.' : 'No selected Core KPI is available to rate.'
  };
  const matched = activeAssignments.map(assignment => ({
    assignment,
    result: quarterItems.find(item => item.workplanItemKey === assignment.workplanItemKey && item.itemType === (key === 'core' ? 'CoreGold' : 'LocalPersonal'))
  }));
  const rated = matched.filter(row => row.result?.calculatedRag !== 'NotRated'
    && row.result?.scoredProgressPct !== undefined
    && row.assignment.weight !== undefined
    && Number.isFinite(row.assignment.weight));
  if (!rated.length || !config) return {
    key, label, state: 'NotRated', rag: 'NotRated',
    explanation: 'No current-quarter rated result is available. Blank or unresolved values remain Not rated, not zero.'
  };
  const ratedWeight = rated.reduce((sum, row) => sum + (row.assignment.weight as number), 0);
  if (ratedWeight <= 0) return {
    key, label, state: 'NotRated', rag: 'NotRated',
    explanation: 'Rated items do not have a valid employee Workplan weight.'
  };
  const progressPct = rounded(rated.reduce((sum, row) => sum
    + (row.result?.scoredProgressPct as number) * (row.assignment.weight as number), 0) / ratedWeight);
  const complete = rated.length === activeAssignments.length && ratedWeight === 100;
  return {
    key, label, state: complete ? 'Rated' : 'Provisional', progressPct,
    rag: ragFromProgress(progressPct, config),
    explanation: complete
      ? `Current-quarter result uses ${key === 'core' ? 'employee Core Workplan' : 'Personal item'} weights. Organisational GOLD weights are not used.`
      : `${rated.length} of ${activeAssignments.length} active item(s) are rateable. The result is provisional and excludes Not rated items.`
  };
};

const behaviourIndicator = (
  assignments: IBehaviourWorkplanItem[],
  quarterItems: IQuarterReviewItem[],
  config: IProductionConfig | undefined
): IEmployeePerformanceIndicator => {
  const active = assignments.filter(item => item.activeInWorkplan);
  if (!active.length) return {
    key: 'behaviours', label: 'Behaviour performance', state: 'NotRated', rag: 'NotRated',
    explanation: 'No selected Behaviour objective is available to rate.'
  };
  const matched = active.map(assignment => ({
    assignment,
    result: quarterItems.find(item => item.workplanItemKey === assignment.workplanItemKey && item.itemType === 'Behaviour')
  }));
  const rated = matched.filter(row => {
    const target = row.result?.behaviourTargetRating;
    const actual = row.result?.finalBehaviourRating;
    return target !== undefined && target >= 1 && target <= 4
      && actual !== undefined && actual >= 1 && actual <= 4
      && row.assignment.behaviourItemWeight !== undefined
      && Number.isFinite(row.assignment.behaviourItemWeight);
  });
  if (!rated.length || !config) return {
    key: 'behaviours', label: 'Behaviour performance', state: 'NotRated', rag: 'NotRated',
    explanation: 'Final Behaviour assessments are incomplete. Employee and manager ratings remain separate and missing values are not treated as zero.'
  };
  const ratedWeight = rated.reduce((sum, row) => sum + (row.assignment.behaviourItemWeight as number), 0);
  if (ratedWeight <= 0) return {
    key: 'behaviours', label: 'Behaviour performance', state: 'NotRated', rag: 'NotRated',
    explanation: 'Rated Behaviour items do not have a valid Workplan weight.'
  };
  const progressPct = rounded(rated.reduce((sum, row) => {
    const actual = row.result?.finalBehaviourRating as number;
    const target = row.result?.behaviourTargetRating as number;
    return sum + Math.min(100, (actual / target) * 100) * (row.assignment.behaviourItemWeight as number);
  }, 0) / ratedWeight);
  const complete = active.length === 5 && rated.length === active.length && ratedWeight === 100;
  return {
    key: 'behaviours', label: 'Behaviour performance', state: complete ? 'Rated' : 'Provisional',
    progressPct, rag: ragFromProgress(progressPct, config),
    explanation: complete
      ? 'All five final Behaviour assessments are weighted within the Behaviour section. The staff-facing view continues to lead with rating labels and RAG.'
      : `${rated.length} of ${active.length} Behaviour objective(s) have a final assessment. The section result is provisional.`
  };
};

const overallIndicator = (
  core: IEmployeePerformanceIndicator,
  personal: IEmployeePerformanceIndicator,
  behaviours: IEmployeePerformanceIndicator,
  workplan: IAnnualWorkplan | undefined,
  config: IProductionConfig | undefined
): IEmployeePerformanceIndicator => {
  if (!config) return {
    key: 'overall', label: 'Overall performance', state: 'NotAvailable',
    explanation: 'Overall performance is unavailable because the active scoring configuration could not be loaded.'
  };
  if (!workplan || (workplan.state !== 'Approved' && workplan.state !== 'Locked')) return {
    key: 'overall', label: 'Overall performance', state: 'NotAvailable', rag: 'NotRated',
    explanation: 'Overall performance is unavailable until the annual Workplan and its category weights are manager-approved. Submitted proposals are not treated as approved.'
  };
  const weights = {
    core: workplan.coreCategoryWeight,
    personal: workplan.personalCategoryWeight,
    behaviours: workplan.behaviourCategoryWeight
  };
  if (![weights.core, weights.personal, weights.behaviours].every(value => Number.isFinite(value) && value >= 0)
    || weights.core + weights.personal + weights.behaviours !== 100) return {
    key: 'overall', label: 'Overall performance', state: 'NotAvailable',
    explanation: 'Overall performance is unavailable until the approved Workplan category weights are valid and total 100%.'
  };
  const weightedSections = [
    { indicator: core, weight: weights.core },
    { indicator: personal, weight: weights.personal },
    { indicator: behaviours, weight: weights.behaviours }
  ].filter(row => row.weight > 0);
  const missing = weightedSections.filter(row => row.indicator.progressPct === undefined);
  if (missing.length) return {
    key: 'overall', label: 'Overall performance', state: 'Provisional', rag: 'NotRated',
    explanation: `Overall performance remains provisional because ${missing.map(row => row.indicator.label).join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not fully rateable. No missing section score has been fabricated.`
  };
  const progressPct = rounded(weightedSections.reduce((sum, row) =>
    sum + (row.indicator.progressPct as number) * row.weight, 0) / 100);
  const complete = weightedSections.every(row => row.indicator.state === 'Rated');
  return {
    key: 'overall', label: 'Overall performance', state: complete ? 'Rated' : 'Provisional',
    progressPct, rag: ragFromProgress(progressPct, config),
    explanation: `${complete ? 'Final' : 'Provisional'} weighted result uses the approved Workplan category balance (${weights.core}/${weights.personal}/${weights.behaviours}). Personal and Behaviour results never enter organisational GOLD.`
  };
};

export const buildEmployeePerformanceSummary = (
  coreItems: ICoreWorkplanItem[],
  personalItems: IPersonalWorkplanItem[],
  quarterItems: IQuarterReviewItem[],
  config: IProductionConfig | undefined,
  behaviourItems: IBehaviourWorkplanItem[] = [],
  workplan?: IAnnualWorkplan
): IEmployeePerformanceSummary => {
  const core = weightedIndicator('core', 'Core performance', coreItems.filter(item => item.activeInWorkplan).map(item => ({ workplanItemKey: item.workplanItemKey, weight: item.coreWorkplanWeight })), quarterItems, config);
  const personal = weightedIndicator('personal', 'Personal performance', personalItems.filter(item => item.activeInWorkplan).map(item => ({ workplanItemKey: item.workplanItemKey, weight: item.personalItemWeight })), quarterItems, config);
  const behaviours = behaviourIndicator(behaviourItems, quarterItems, config);
  return { core, personal, behaviours, overall: overallIndicator(core, personal, behaviours, workplan, config) };
};
