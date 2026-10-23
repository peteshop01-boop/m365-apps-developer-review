import type {
  BehaviourClassification,
  IBehaviourAssessment,
  IBehaviourDistribution,
  IBehaviourHeadline,
  IBehaviourReportingFeed,
  ICoreReportingFeed,
  ICoreReportingRow,
  IImpactReportingRow,
  IReportingViewState,
  IReportingScope,
  IReportingViewsDataset,
  ReportingFilterState,
  ReportingSort,
  ReportingSubmissionState,
  ReportingView
} from '../models/ReportingModels';
import { validateReportingGovernance } from './ReportingGovernance';
import { buildQuarterPerformanceReadProjection, type IQuarterPerformanceReadSource } from './QuarterPerformanceReadProjection';
import { calculateCapturedQuarterOverallDelivery } from './QuarterOverallDelivery';
import type { IOverallDeliveryCalculationResult, IQuarterReview } from '../models/QuarterlyModels';
import { materializeQuarterlyData } from './QuarterlyTrustBoundary';
import { materialiseBehaviourSourceData } from './QuarterBehaviourTargetSnapshot';

/** Uses the existing issued projection and PD-01/PD-04 engine; does not create a report-run authority. */
export const buildCapturedQuarterDeliveryView = (source?: IQuarterPerformanceReadSource):
  { readonly state: 'Ready'; readonly result: Readonly<IOverallDeliveryCalculationResult>;
    readonly sourceIdentity: Readonly<Pick<IQuarterReview, 'performanceYear' | 'quarter' | 'quarterReviewKey' | 'rowVersionToken' | 'approvedAt' | 'lockedAt' | 'state' | 'accessState'>> }
  | { readonly state: 'Unavailable'; readonly message: string } => {
  try {
    // Capture before configuration, eligibility or year reads. Malformed source
    // data remains a recoverable unavailable view and must not invoke accessors.
    // The validator emits null-prototype records; the existing source copier
    // makes that checked snapshot compatible with projection input validation.
    source = source ? materialiseBehaviourSourceData(
      materializeQuarterlyData(source, 'Captured quarter Delivery source')
    ) : undefined;
    if (!source?.review?.overallDeliveryWeightConfigurationSnapshot) return {
      state: 'Unavailable', message: 'Overall Delivery is unavailable until this review has its captured governed weight configuration.'
    };
    if (source.review.transitionStatus !== 'Ready' || source.review.accessState !== 'ReadOnly'
      || (source.review.state !== 'Approved' && source.review.state !== 'Locked')) return {
      state: 'Unavailable', message: 'Overall Delivery is unavailable until this quarter has completed approval and is read-only.'
    };
    if ([source.review.approvedAt, source.review.lockedAt].some(value => value !== undefined && value !== '' &&
      (typeof value !== 'string' || !Number.isFinite(Date.parse(value))))) return {
      state: 'Unavailable', message: 'Overall Delivery is unavailable because recorded approval or lock history is malformed.'
    };
    const result = calculateCapturedQuarterOverallDelivery(buildQuarterPerformanceReadProjection(source.review.performanceYear, [source]));
    return result.ready ? { state: 'Ready', result, sourceIdentity: Object.freeze({
      performanceYear: source.review.performanceYear, quarter: source.review.quarter,
      quarterReviewKey: source.review.quarterReviewKey, rowVersionToken: source.review.rowVersionToken,
      approvedAt: source.review.approvedAt, lockedAt: source.review.lockedAt,
      state: source.review.state, accessState: source.review.accessState
    }) } : { state: 'Unavailable', message: result.errors.join(' ') };
  } catch (error) {
    return { state: 'Unavailable', message: error instanceof Error ? error.message : 'The governed Delivery source is unavailable.' };
  }
};

export const reportingViews: ReportingView[] = ['executive', 'pillar', 'portfolio', 'kpiDetail', 'impact', 'behaviour'];
export const reportingSubmissionStates: ReportingSubmissionState[] = ['Reportable', 'NotSubmitted', 'AwaitingApproval', 'NotRated', 'MissingData'];
export const reportingSorts: ReportingSort[] = ['StableKey', 'Title', 'Owner', 'SubmissionState'];

export const defaultReportingViewState: IReportingViewState = {
  search: '',
  submissionState: 'All',
  sort: 'StableKey',
  person: '',
  team: '',
  manager: '',
  period: '',
  contributionAreaId: ''
};

const isSubmissionFilter = (value: unknown): value is ReportingFilterState =>
  value === 'All' || reportingSubmissionStates.some(candidate => candidate === value);

const isSort = (value: unknown): value is ReportingSort => reportingSorts.some(candidate => candidate === value);

export const normaliseReportingViewState = (value?: Partial<IReportingViewState>): IReportingViewState => ({
  search: typeof value?.search === 'string' ? value.search.slice(0, 200) : '',
  submissionState: isSubmissionFilter(value?.submissionState) ? value.submissionState : 'All',
  sort: isSort(value?.sort) ? value.sort : 'StableKey',
  person: typeof value?.person === 'string' ? value.person.slice(0, 100) : '',
  team: typeof value?.team === 'string' ? value.team.slice(0, 100) : '',
  manager: typeof value?.manager === 'string' ? value.manager.slice(0, 100) : '',
  period: typeof value?.period === 'string' ? value.period.slice(0, 100) : '',
  contributionAreaId: typeof value?.contributionAreaId === 'string' ? value.contributionAreaId.slice(0, 100) : ''
});

const matchesScope = (scope: IReportingScope | undefined, state: IReportingViewState): boolean =>
  (!state.person || scope?.person === state.person) &&
  (!state.team || scope?.team === state.team) &&
  (!state.manager || scope?.manager === state.manager) &&
  (!state.period || scope?.period === state.period);

const compareText = (left: string, right: string): number => {
  const leftValue = left.toLowerCase();
  const rightValue = right.toLowerCase();
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
};

const coreSortValue = (row: ICoreReportingRow, sort: ReportingSort): string => {
  switch (sort) {
    case 'Title': return row.title;
    case 'Owner': return row.owner;
    case 'SubmissionState': return row.submissionState;
    default: return row.rowKey;
  }
};

const impactSortValue = (row: IImpactReportingRow, sort: ReportingSort): string => {
  switch (sort) {
    case 'Title': return row.title;
    case 'Owner': return row.owner;
    case 'SubmissionState': return row.submissionState;
    default: return row.impactKey;
  }
};

export const getCoreReportingFeed = (dataset: IReportingViewsDataset, view: Exclude<ReportingView, 'impact' | 'behaviour'>): ICoreReportingFeed =>
  dataset.core[view];

export const selectCoreReportingRows = (feed: ICoreReportingFeed, rawState?: Partial<IReportingViewState>): ICoreReportingRow[] => {
  const state = normaliseReportingViewState(rawState);
  const search = state.search.trim().toLowerCase();
  return feed.rows
    .filter(row => state.submissionState === 'All' || row.submissionState === state.submissionState)
    .filter(row => matchesScope(row.scope, state))
    .filter(row => !search || [
      row.rowKey,
      row.kpiId,
      row.title,
      row.subtitle,
      row.owner,
      row.pillar,
      row.portfolio?.title,
      row.strategicOutcome?.title,
      row.classification?.title
    ].some(value => value?.toLowerCase().includes(search)))
    .slice()
    .sort((left, right) => compareText(coreSortValue(left, state.sort), coreSortValue(right, state.sort)) || compareText(left.rowKey, right.rowKey));
};

export const selectImpactReportingRows = (dataset: IReportingViewsDataset, rawState?: Partial<IReportingViewState>): IImpactReportingRow[] => {
  const state = normaliseReportingViewState(rawState);
  const search = state.search.trim().toLowerCase();
  return dataset.impact.rows
    .filter(row => state.submissionState === 'All' || row.submissionState === state.submissionState)
    .filter(row => matchesScope(row.scope, state))
    .filter(row => !state.contributionAreaId || row.businessContributionArea?.id === state.contributionAreaId)
    .filter(row => !search || [
      row.impactKey,
      row.title,
      row.owner,
      row.businessContributionArea?.title,
      row.pillar?.title,
      row.strategicOutcome?.title
    ].some(value => value?.toLowerCase().includes(search)))
    .slice()
    .sort((left, right) => compareText(impactSortValue(left, state.sort), impactSortValue(right, state.sort)) || compareText(left.impactKey, right.impactKey));
};

const behaviourClasses: BehaviourClassification[] = ['Developing', 'Effective', 'Exceptional'];
const noPriorPeriod = 'No comparable prior period';
const hasText = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

const checkedBehaviourInput = (feed: IBehaviourReportingFeed): IBehaviourAssessment[] => {
  if (!hasText(feed.selectedPeriodKey) || !Array.isArray(feed.periods) || !Array.isArray(feed.assessments)) {
    throw new Error('Behaviour assessments, ordered periods and selected period are required.');
  }
  const cut = feed.provenance?.cutTimestamp;
  const cutTimestamp = typeof cut === 'string' ? Date.parse(cut) : NaN;
  if (!Number.isFinite(cutTimestamp)) {
    throw new Error('Behaviour reporting requires a valid governed cut timestamp.');
  }
  const periods = new Set<string>();
  const ordered = new Set<string>();
  const headlineKeys = new Set(feed.headlines.map(headline => headline.behaviourKey));
  feed.periods.forEach(period => {
    if (!hasText(period.periodKey) || !hasText(period.comparisonSeriesKey) || !hasText(period.provenanceRef) ||
      !Number.isSafeInteger(period.order) || typeof period.complete !== 'boolean' || periods.has(period.periodKey) ||
      ordered.has(`${period.comparisonSeriesKey}|${period.order}`)) {
      throw new Error('Behaviour period identity, provenance or order is ambiguous.');
    }
    periods.add(period.periodKey);
    ordered.add(`${period.comparisonSeriesKey}|${period.order}`);
  });
  if (!periods.has(feed.selectedPeriodKey)) throw new Error('Selected Behaviour period is absent.');
  const ids = new Map<string, string>();
  const distinct: IBehaviourAssessment[] = [];
  feed.assessments.forEach(record => {
    if (!hasText(record.assessmentId) || !hasText(record.personKey) || !headlineKeys.has(record.behaviourKey) ||
      !hasText(record.periodKey) || !hasText(record.provenanceRef) || !periods.has(record.periodKey) ||
      !Number.isSafeInteger(record.version) || record.version < 1 || !Number.isFinite(Date.parse(record.recordedAt)) ||
      Date.parse(record.recordedAt) > cutTimestamp ||
      !['Draft', 'AwaitingApproval', 'Final', 'ManagerApproved'].includes(record.state) ||
      (record.classification !== undefined && !behaviourClasses.includes(record.classification)) ||
      (record.scope?.period !== undefined && record.scope.period !== record.periodKey)) {
      throw new Error('Behaviour assessment identity, state, rating, period or provenance is invalid.');
    }
    const serialized = JSON.stringify(record);
    const previous = ids.get(record.assessmentId);
    if (previous !== undefined && previous !== serialized) throw new Error('Behaviour assessment ID has conflicting source records.');
    if (previous === undefined) {
      ids.set(record.assessmentId, serialized);
      distinct.push(record);
    }
  });
  return distinct;
};

const latestEligible = (records: IBehaviourAssessment[], periodKey: string, behaviourKey: string, state: IReportingViewState): IBehaviourAssessment[] => {
  const byPerson = new Map<string, IBehaviourAssessment[]>();
  records.filter(record => record.periodKey === periodKey && record.behaviourKey === behaviourKey)
    .filter(record => (record.state === 'Final' || record.state === 'ManagerApproved') && record.classification !== undefined)
    .forEach(record => byPerson.set(record.personKey, (byPerson.get(record.personKey) || []).concat(record)));
  return Array.from(byPerson.values()).map(versions => {
    const ordered = versions.slice().sort((left, right) => right.version - left.version ||
      Date.parse(right.recordedAt) - Date.parse(left.recordedAt));
    if (ordered.length > 1 && ordered[0].version === ordered[1].version && Date.parse(ordered[0].recordedAt) === Date.parse(ordered[1].recordedAt)) {
      throw new Error('Ambiguous latest eligible Behaviour assessment.');
    }
    return ordered[0];
  }).filter(record => !state.person || record.personKey === state.person)
    .filter(record => !state.team || record.scope?.team === state.team)
    .filter(record => !state.manager || record.scope?.manager === state.manager);
};

const selectedPeriodEligible = (dataset: IReportingViewsDataset, rawState?: Partial<IReportingViewState>): IBehaviourAssessment[] => {
  const state = normaliseReportingViewState(rawState);
  const periodKey = state.period || dataset.behaviour.selectedPeriodKey;
  const records = checkedBehaviourInput(dataset.behaviour);
  return dataset.behaviour.headlines.flatMap(headline =>
    latestEligible(records, periodKey, headline.behaviourKey, defaultReportingViewState)
  );
};

export const selectBehaviourFilterScopes = (dataset: IReportingViewsDataset, rawState?: Partial<IReportingViewState>): IReportingScope[] =>
  selectedPeriodEligible(dataset, rawState).map(record => ({
      ...record.scope,
      person: record.personKey,
      period: record.periodKey
  }));

export const selectBehaviourPersonOptions = (dataset: IReportingViewsDataset, rawState?: Partial<IReportingViewState>): Array<{ value: string; label: string }> => {
  const labels = new Map<string, string>();
  selectedPeriodEligible(dataset, rawState).forEach(record => {
    const label = record.scope?.person?.trim() || record.personKey;
    if (!labels.has(record.personKey)) labels.set(record.personKey, label);
  });
  const labelCounts = new Map<string, number>();
  labels.forEach(label => labelCounts.set(label, (labelCounts.get(label) || 0) + 1));
  return Array.from(labels, ([value, label]) => ({ value, label: labelCounts.get(label)! > 1 ? `${label} (${value})` : label }))
    .sort((left, right) => compareText(left.label, right.label) || compareText(left.value, right.value));
};

const distribution = (records: IBehaviourAssessment[], prior: IBehaviourAssessment[] | undefined, currentComplete: boolean): IBehaviourDistribution[] =>
  behaviourClasses.map(classification => {
    const count = records.filter(record => record.classification === classification).length;
    if (!currentComplete) return { classification, count: 0, display: 'Current period incomplete' };
    if (records.length === 0) return { classification, count: 0, display: '0 (No eligible assessed records)' };
    const percentage = count / records.length * 100;
    const movementPercentagePoints = prior?.length ? percentage - prior.filter(record => record.classification === classification).length / prior.length * 100 : undefined;
    return { classification, count, percentage, movementPercentagePoints, display: `${count} (${percentage.toFixed(1)}%)` };
  });

export const calculateBehaviourHeadlines = (dataset: IReportingViewsDataset, rawState?: Partial<IReportingViewState>): IBehaviourHeadline[] => {
  const state = normaliseReportingViewState(rawState);
  const feed = dataset.behaviour;
  const records = checkedBehaviourInput(feed);
  const periodKey = state.period || feed.selectedPeriodKey;
  const current = feed.periods.find(period => period.periodKey === periodKey);
  if (!current) throw new Error('Selected Behaviour period is absent.');
  const prior = feed.periods.filter(period => period.comparisonSeriesKey === current.comparisonSeriesKey && period.order < current.order)
    .sort((left, right) => right.order - left.order)[0];
  return feed.headlines.map(headline => {
    const currentRecords = current.complete ? latestEligible(records, periodKey, headline.behaviourKey, state) : [];
    const priorRecords = current.complete && prior?.complete ? latestEligible(records, prior.periodKey, headline.behaviourKey, state) : undefined;
    const distributions = distribution(currentRecords, priorRecords, current.complete);
    const hasComparison = current.complete && currentRecords.length > 0 && prior?.complete === true && Boolean(priorRecords?.length);
    const movementDisplay = !current.complete ? 'Current period incomplete' : hasComparison
      ? distributions.map(item => `${item.classification} ${item.movementPercentagePoints! >= 0 ? '+' : ''}${item.movementPercentagePoints!.toFixed(1)} pp`).join(' · ')
      : noPriorPeriod;
    return {
      ...headline,
      submissionState: !current.complete ? 'MissingData' : currentRecords.length ? 'Reportable' : 'NotRated',
      distributions,
      movementDisplay,
      scope: { ...headline.scope, period: periodKey }
    };
  });
};

export const selectBehaviourHeadlines = (dataset: IReportingViewsDataset, rawState?: Partial<IReportingViewState>): IBehaviourHeadline[] => {
  const state = normaliseReportingViewState(rawState);
  const search = state.search.trim().toLowerCase();
  const scopeFilterSelected = Boolean(state.person || state.team || state.manager);
  const records = scopeFilterSelected ? checkedBehaviourInput(dataset.behaviour) : [];
  const periodKey = state.period || dataset.behaviour.selectedPeriodKey;
  return calculateBehaviourHeadlines(dataset, state)
    .filter(row => state.submissionState === 'All' || row.submissionState === state.submissionState)
    .filter(row => !scopeFilterSelected || latestEligible(records, periodKey, row.behaviourKey, state).length > 0)
    .filter(row => !search || [row.behaviourKey, row.title, row.movementDisplay].some(value => value.toLowerCase().includes(search)))
    .slice()
    .sort((left, right) => {
      const leftValue = state.sort === 'SubmissionState' ? left.submissionState : state.sort === 'StableKey' ? left.behaviourKey : left.title;
      const rightValue = state.sort === 'SubmissionState' ? right.submissionState : state.sort === 'StableKey' ? right.behaviourKey : right.title;
      return compareText(leftValue, rightValue) || compareText(left.behaviourKey, right.behaviourKey);
    });
};

export const getNextReportingView = (current: ReportingView, key: string): ReportingView => {
  const index = reportingViews.indexOf(current);
  if (key === 'Home') return reportingViews[0];
  if (key === 'End') return reportingViews[reportingViews.length - 1];
  if (key === 'ArrowRight' || key === 'ArrowDown') return reportingViews[(index + 1) % reportingViews.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return reportingViews[(index - 1 + reportingViews.length) % reportingViews.length];
  return current;
};

export type ReportingLayoutMode = 'desktop' | 'tablet' | 'phone';

export interface IReportingLayoutContract {
  mode: ReportingLayoutMode;
  tabColumns: number;
  summaryColumns: number;
  contentColumns: number;
}

export const getReportingLayoutContract = (viewportWidth: number): IReportingLayoutContract => {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) throw new Error('A positive finite viewport width is required.');
  if (viewportWidth <= 600) return { mode: 'phone', tabColumns: 1, summaryColumns: 1, contentColumns: 1 };
  if (viewportWidth <= 980) return { mode: 'tablet', tabColumns: 3, summaryColumns: 3, contentColumns: 1 };
  return { mode: 'desktop', tabColumns: 6, summaryColumns: 6, contentColumns: 2 };
};

export const validateReportingDataset = (dataset: IReportingViewsDataset): string[] => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!isRecord(dataset) || !isRecord(dataset.core)) {
    return ['Core reporting feeds are absent or malformed.'];
  }
  if (!hasText(dataset.performanceYear)) {
    return ['Reporting performance year is absent or malformed.'];
  }
  const structuralFeeds: Array<[string, unknown, string[]]> = [
    ['Executive Core', dataset.core.executive, ['rows']],
    ['Pillar Core', dataset.core.pillar, ['rows']],
    ['Portfolio Core', dataset.core.portfolio, ['rows']],
    ['KPI detail Core', dataset.core.kpiDetail, ['rows']],
    ['Impact', dataset.impact, ['rows']],
    ['Behaviour', dataset.behaviour, ['headlines', 'periods', 'assessments']]
  ];
  for (const [name, value, arrays] of structuralFeeds) {
    if (!isRecord(value) || !isRecord(value.provenance) || !isRecord(value.completeness) ||
      arrays.some(key => !Array.isArray(value[key]) || (value[key] as unknown[]).some(item => !isRecord(item)))) {
      return [`${name}: reporting feed structure, rows, provenance or completeness is absent or malformed.`];
    }
    if (typeof value.title !== 'string' || !value.title.trim()) {
      return [`${name}: reporting feed title is absent or malformed.`];
    }
  }
  const rowIssues: string[] = [];
  const validOptionalReference = (value: unknown): boolean => value === undefined ||
    (isRecord(value) && ['id', 'versionKey', 'title', 'lifecycleState'].every(key =>
      typeof value[key] === 'string' && (value[key] as string).trim().length > 0));
  const validOptionalTimestamp = (value: unknown): boolean => value === undefined || value === '' ||
    (typeof value === 'string' && Number.isFinite(Date.parse(value)));
  const validRowState = (state: unknown): boolean => reportingSubmissionStates.some(value => value === state);
  [dataset.core.executive, dataset.core.pillar, dataset.core.portfolio, dataset.core.kpiDetail].forEach(feed => {
    feed.rows.forEach(row => {
      if (!validOptionalTimestamp(row.latestApprovedAt)) rowIssues.push(`${feed.title}: latest-approved timestamp is malformed.`);
      if (![row.portfolio, row.strategicOutcome, row.classification].every(validOptionalReference)) {
        rowIssues.push(`${feed.title}: optional reporting reference is malformed.`);
      }
      if (!hasText(row.rowKey)) rowIssues.push(`${feed.title}: every Core row requires a stable rowKey.`);
      if (!hasText(row.title) || !hasText(row.owner) || !hasText(row.provenanceRef) ||
        typeof row.resultDisplay !== 'string' || !validRowState(row.submissionState) ||
        !['Red', 'Amber', 'Green', 'NotRated'].some(value => value === row.rag) ||
        [row.subtitle, row.targetDisplay, row.kpiId, row.pillar].some(value => value !== undefined && typeof value !== 'string')) {
        rowIssues.push(`${feed.title}: Core row identity, text or state is absent or malformed.`);
      }
    });
  });
  const impactKeys = new Set<string>();
  dataset.impact.rows.forEach(row => {
    if (!validOptionalTimestamp(row.latestApprovedAt)) rowIssues.push('Impact: latest-approved timestamp is malformed.');
    if (!validOptionalReference(row.strategicOutcome)) rowIssues.push('Impact: optional reporting reference is malformed.');
    if (!hasText(row.impactKey) || !hasText(row.title) || !hasText(row.owner) || !hasText(row.provenanceRef) ||
      [row.progressDisplay, row.resultDisplay, row.contributionDisplay].some(value => typeof value !== 'string') ||
      !validRowState(row.submissionState)) {
      rowIssues.push('Impact: row identity, text or state is absent or malformed.');
    } else if (impactKeys.has(row.impactKey)) {
      rowIssues.push(`Impact: duplicate Impact impactKey ${row.impactKey}.`);
    } else {
      impactKeys.add(row.impactKey);
    }
  });
  // Validate consumer inputs before governance diagnostics interpolate row IDs.
  if (rowIssues.length) return rowIssues;
  for (const headline of dataset.behaviour.headlines) {
    if (!isRecord(headline.headlineReference)) {
      return ['Behaviour: headline reference is absent or malformed.'];
    }
    if (typeof headline.behaviourKey !== 'string' || !headline.behaviourKey.trim() ||
      typeof headline.title !== 'string' || !headline.title.trim() ||
      typeof headline.movementDisplay !== 'string' || typeof headline.provenanceRef !== 'string' ||
      !headline.provenanceRef.trim()) {
      return ['Behaviour: headline identity, display or provenance is absent or malformed.'];
    }
    if (!Array.isArray(headline.distributions) || headline.distributions.some(item => !isRecord(item))) {
      return ['Behaviour: headline distributions are absent or malformed.'];
    }
    for (const item of headline.distributions) {
      if (typeof item.display !== 'string' ||
        (item.percentage !== undefined && (typeof item.percentage !== 'number' || !Number.isFinite(item.percentage))) ||
        (item.movementPercentagePoints !== undefined &&
          (typeof item.movementPercentagePoints !== 'number' || !Number.isFinite(item.movementPercentagePoints)))) {
        return ['Behaviour: distribution display or optional movement is malformed.'];
      }
    }
  }
  if (isRecord(dataset.governance) && isRecord(dataset.governance.behaviourCatalogue)) {
    const references = dataset.governance.behaviourCatalogue.headlineReferences;
    if (!Array.isArray(references) || references.some(item => !isRecord(item))) {
      return ['Behaviour: governed headline references are absent or malformed.'];
    }
  }
  const issues: string[] = validateReportingGovernance(dataset);
  const feeds = [dataset.core.executive, dataset.core.pillar, dataset.core.portfolio, dataset.core.kpiDetail, dataset.impact, dataset.behaviour];
  feeds.forEach(feed => {
    const cutTimestamp = feed.provenance.cutTimestamp;
    const timestamp = typeof cutTimestamp === 'string' ? Date.parse(cutTimestamp) : NaN;
    if ([feed.provenance.reportRunId, feed.provenance.modelVersion, feed.provenance.sourceReference,
      feed.provenance.snapshotKey].some(value => !hasText(value)) || !Number.isFinite(timestamp)) {
      issues.push(`${feed.title}: complete provenance and a valid cut timestamp are required.`);
    }
    const counts = feed.completeness;
    if (!hasText(counts.freshnessLabel)) {
      issues.push(`${feed.title}: reporting freshness label is absent or malformed.`);
    }
    if ([counts.expected, counts.reportable, counts.notSubmitted, counts.awaitingApproval, counts.notRated, counts.missingData].some(value => !Number.isSafeInteger(value) || value < 0)) {
      issues.push(`${feed.title}: completeness counts must be non-negative safe integers.`);
    } else if (counts.reportable + counts.notSubmitted + counts.awaitingApproval + counts.notRated + counts.missingData !== counts.expected) {
      issues.push(`${feed.title}: completeness states must total the expected count.`);
    }
  });
  const selectedPeriod = dataset.behaviour.selectedPeriodKey;
  if (typeof selectedPeriod !== 'string' || !selectedPeriod.trim()) {
    issues.push('Core reporting requires an explicit selected report period.');
  }
  const validFilterScope = (scope: unknown): boolean => scope === undefined ||
    (isRecord(scope) && ['person', 'team', 'manager', 'period'].every(key =>
      scope[key] === undefined || typeof scope[key] === 'string'));
  dataset.impact.rows.forEach(row => {
    if (!validFilterScope(row.scope)) issues.push('Impact: reporting filter scope is malformed.');
  });
  [dataset.core.executive, dataset.core.pillar, dataset.core.portfolio, dataset.core.kpiDetail].forEach(feed => {
    const seenKeys = new Set<string>();
    feed.rows.forEach(row => {
      if (!validFilterScope(row.scope)) issues.push(`${feed.title}: reporting filter scope is malformed.`);
      if (typeof row.rowKey !== 'string' || !row.rowKey.trim()) {
        issues.push(`${feed.title}: every Core row requires a stable rowKey.`);
      } else if (seenKeys.has(row.rowKey)) {
        issues.push(`${feed.title}: duplicate Core rowKey ${row.rowKey}.`);
      } else {
        seenKeys.add(row.rowKey);
      }
      if (!isRecord(row.scope) || typeof row.scope.period !== 'string' || !row.scope.period.trim() ||
        (typeof selectedPeriod === 'string' && selectedPeriod.trim() && row.scope.period !== selectedPeriod)) {
        issues.push(`${feed.title}: ${row.rowKey || 'Core row'} has an invalid or inconsistent report period.`);
      }
      if (row.submissionState !== 'Reportable' && row.rag !== 'NotRated') {
        issues.push(`${feed.title}: ${row.rowKey} cannot present a RAG while ${row.submissionState}.`);
      }
    });
  });
  if (dataset.behaviour.headlines.length !== 5) issues.push('Behaviour reporting requires exactly five governed headline rows.');
  dataset.behaviour.headlines.forEach(headline => {
    const classifications = headline.distributions.map(item => item.classification).sort();
    if (classifications.join('|') !== 'Developing|Effective|Exceptional') {
      issues.push(`${dataset.behaviour.title}: ${headline.behaviourKey} must contain one Developing, Effective and Exceptional distribution.`);
    }
    if (headline.distributions.some(item => !Number.isSafeInteger(item.count) || item.count < 0)) {
      issues.push(`${dataset.behaviour.title}: ${headline.behaviourKey} distribution counts must be non-negative safe integers.`);
    }
  });
  try {
    checkedBehaviourInput(dataset.behaviour);
    calculateBehaviourHeadlines(dataset);
  } catch (error) {
    issues.push(`${dataset.behaviour.title}: ${error instanceof Error ? error.message : 'Behaviour assessment input is invalid.'}`);
  }
  return issues;
};
