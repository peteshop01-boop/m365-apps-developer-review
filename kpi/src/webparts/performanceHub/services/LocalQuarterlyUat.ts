import type {
  IAnnualWorkplan,
  ICoreKpiCatalogueItem,
  ICoreWorkplanItem,
  IPersonalWorkplanItem,
  IProductionConfig,
  IProductionPerson
} from '../models/ProductionModels';
import type {
  IProgressEntry,
  IProgressLedger,
  IQuarterEvidenceReference,
  IQuarterLifecycle,
  IQuarterReviewContext,
  IQuarterReviewItem,
  QuarterKey
} from '../models/QuarterlyModels';
import { buildQuarterReviewDraft } from './QuarterReviewFactory';
import { prepareAuthoritativeCoreQuarterSave, prepareAuthoritativePersonalQuarterSave } from './QuarterReviewItemPersistence';
import { evaluateQuarterSubmissionReadiness } from './QuarterSubmissionReadiness';
import { assertQuarterReviewItemWriteBoundary, canEmployeeEditQuarterReview } from './QuarterReviewAuthorisation';
import { upsertProgressEntry } from './ProgressLedgerValidation';
import { materialiseBehaviourSourceData } from './QuarterBehaviourTargetSnapshot';

export const LOCAL_QUARTERLY_CONFIG: IProductionConfig = {
  performanceYear: '2025/26',
  performanceYearStart: '2025-11-01',
  performanceYearEnd: '2026-10-31',
  performanceYearNumber: 2026,
  quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 },
  rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: ['DirectMetric'],
  retentionStatus: 'LOCAL-UAT'
};

const quarterDates: Record<QuarterKey, readonly [string, string]> = {
  Q1: ['2025-11-01', '2026-01-31'],
  Q2: ['2026-02-01', '2026-04-30'],
  Q3: ['2026-05-01', '2026-07-31'],
  Q4: ['2026-08-01', '2026-10-31']
};

export const buildLocalQuarterLifecycle = (quarter: QuarterKey, simulateOpenCurrent = false): IQuarterLifecycle => {
  const [quarterStart, quarterEnd] = quarterDates[quarter];
  return {
    performanceYear: LOCAL_QUARTERLY_CONFIG.performanceYear,
    performanceYearNumber: LOCAL_QUARTERLY_CONFIG.performanceYearNumber,
    quarterKey: quarter,
    quarterName: `${quarter} · browser-memory UAT`,
    quarterStart,
    quarterEnd,
    isCurrentQuarter: simulateOpenCurrent === true || quarter === 'Q4',
    isOpenForProgressUpdates: true,
    employeeSubmissionDeadline: quarterEnd,
    managerReviewDeadline: quarterEnd,
    reminderMilestones: { earlyReview: quarterStart, preparation: quarterStart, final: quarterEnd },
    status: simulateOpenCurrent === true ? 'Open' : 'Finalising'
  };
};

const acceptedSnapshot = (workplan: IAnnualWorkplan): IAnnualWorkplan => ({
  ...workplan,
  state: 'Submitted',
  accessState: 'ManagerDecision',
  transitionStatus: 'Ready'
});

export const buildLocalPersonalQuarterContext = (
  workplan: IAnnualWorkplan,
  employee: IProductionPerson,
  manager: IProductionPerson,
  personalItems: IPersonalWorkplanItem[],
  quarter: QuarterKey,
  coreCatalogue: ICoreKpiCatalogueItem[] = [],
  coreItems: ICoreWorkplanItem[] = [],
  simulateOpenCurrent = false
): IQuarterReviewContext => {
  const coreSource = materialiseBehaviourSourceData({ coreCatalogue, coreItems });
  coreSource.coreItems.filter(item => item.activeInWorkplan).forEach(item => {
    const matches = coreSource.coreCatalogue.filter(kpi => kpi.kpiId === item.kpiId);
    const definition = matches[0];
    if (matches.length !== 1 || typeof item.kpiVersionKey !== 'string' || !item.kpiVersionKey.trim()
      || typeof item.targetVersionKey !== 'string' || !item.targetVersionKey.trim()
      || item.kpiVersionKey !== definition.kpiVersionKey || item.targetVersionKey !== definition.targetVersionKey) {
      throw new Error('Local Core preparation requires one exact supplied KPI and target version source.');
    }
  });
  const lifecycle = buildLocalQuarterLifecycle(quarter, simulateOpenCurrent);
  const draft = buildQuarterReviewDraft({
    workplan: acceptedSnapshot(workplan),
    employee,
    manager,
    lifecycle,
    coreCatalogue: coreSource.coreCatalogue,
    coreItems: coreSource.coreItems,
    personalItems,
    behaviours: [],
    behaviourItems: []
  });
  const review = { ...draft.review, id: -1900, etag: 'LOCAL-UAT' };
  const items = draft.items.map((item, index) => ({ ...item, id: -(1901 + index), etag: 'LOCAL-UAT' }));
  return {
    lifecycle,
    review,
    employee,
    manager,
    coreCatalogue: coreSource.coreCatalogue,
    behaviours: [],
    items,
    progressLedgers: [],
    evidence: [],
    readiness: evaluateQuarterSubmissionReadiness(lifecycle, review, items),
    dataFoundationReady: true,
    messages: ['LOCAL UAT: Quarterly edits, progress and evidence references remain in browser memory only.']
  };
};

const assertLocalEditableItem = (
  context: IQuarterReviewContext,
  item: IQuarterReviewItem
): IQuarterReviewItem => {
  if (!context.review) throw new Error('The local Quarter Review is unavailable.');
  const matches = context.items.filter(row => row.quarterReviewItemKey === item.quarterReviewItemKey);
  const canonical = matches[0];
  // This browser-memory simulation supports its existing Finalising quarters.
  // It does not grant the production current-Open progress permission.
  if (matches.length !== 1 || context.dataFoundationReady !== true
    || context.employee.active !== true || typeof context.employee.email !== 'string'
    || !canEmployeeEditQuarterReview(context.employee, context.review)
    || context.lifecycle.performanceYearNumber !== context.review.performanceYear
    || context.lifecycle.quarterKey !== context.review.quarter
    || context.lifecycle.isOpenForProgressUpdates !== true
    || (context.lifecycle.status !== 'Open' && context.lifecycle.status !== 'Finalising')
    || canonical.locked !== false
    || canonical.etag !== item.etag || canonical.id !== item.id
    || canonical.workplanKey !== item.workplanKey || canonical.workplanItemKey !== item.workplanItemKey
    || canonical.personKey !== item.personKey || canonical.performanceYear !== item.performanceYear
    || canonical.quarterReviewKey !== item.quarterReviewKey || canonical.quarter !== item.quarter
    || canonical.itemType !== item.itemType || canonical.kpiId !== item.kpiId) {
    throw new Error('The local progress context is unavailable, read-only or changed. Reload before updating.');
  }
  assertQuarterReviewItemWriteBoundary(context.review, canonical);
  return canonical;
};

export const saveLocalPersonalQuarterItem = (
  context: IQuarterReviewContext,
  incoming: IQuarterReviewItem,
  config: IProductionConfig = LOCAL_QUARTERLY_CONFIG
): IQuarterReviewContext => {
  const persisted = assertLocalEditableItem(context, incoming);
  if (persisted.itemType !== 'LocalPersonal') {
    throw new Error('The local Quarterly item does not resolve to one Personal KPI snapshot.');
  }
  const saved = prepareAuthoritativePersonalQuarterSave(persisted, incoming, config).item;
  const items = context.items.map(item => item === persisted ? saved : item);
  return {
    ...context,
    items,
    readiness: evaluateQuarterSubmissionReadiness(context.lifecycle, context.review, items)
  };
};

export const saveLocalCoreQuarterItem = (
  context: IQuarterReviewContext,
  incoming: IQuarterReviewItem,
  config: IProductionConfig = LOCAL_QUARTERLY_CONFIG
): IQuarterReviewContext => {
  const persisted = assertLocalEditableItem(context, incoming);
  if (persisted.itemType !== 'CoreGold' || !persisted.kpiId) throw new Error('The local Quarterly item is not a Core KPI snapshot.');
  const definitions = context.coreCatalogue.filter(kpi => kpi.kpiId === persisted.kpiId);
  if (definitions.length !== 1) throw new Error('The local Core save requires one exact supplied catalogue source.');
  const saved = prepareAuthoritativeCoreQuarterSave(persisted, incoming, definitions[0], config).item;
  const items = context.items.map(item => item === persisted ? saved : item);
  return { ...context, items, readiness: evaluateQuarterSubmissionReadiness(context.lifecycle, context.review, items) };
};

export const addLocalQuarterProgress = (
  context: IQuarterReviewContext,
  item: IQuarterReviewItem,
  entry: IProgressEntry
): IQuarterReviewContext => {
  const canonical = assertLocalEditableItem(context, item);
  if (entry.quarterReviewKey !== canonical.quarterReviewKey
    || entry.quarterReviewItemKey !== canonical.quarterReviewItemKey || entry.quarter !== canonical.quarter) {
    throw new Error('Local progress must belong to the selected quarter item.');
  }
  const sameAnnualSource = (row: IProgressLedger): boolean => row.workplanItemKey === canonical.workplanItemKey
    && row.workplanKey === canonical.workplanKey && row.personKey === canonical.personKey
    && row.performanceYear === canonical.performanceYear && row.itemType === canonical.itemType
    && row.kpiId === canonical.kpiId;
  const matchingLedgers = context.progressLedgers.filter(sameAnnualSource);
  if (matchingLedgers.length > 1) throw new Error('The local annual progress source is ambiguous.');
  const existing = matchingLedgers[0];
  const initial: IProgressLedger = existing || {
    id: -2000,
    etag: 'LOCAL-UAT',
    progressLedgerKey: `${canonical.workplanItemKey}|${canonical.performanceYear}`,
    workplanItemKey: canonical.workplanItemKey,
    workplanKey: canonical.workplanKey,
    personKey: canonical.personKey,
    performanceYear: canonical.performanceYear,
    itemType: canonical.itemType,
    kpiId: canonical.kpiId,
    entries: [],
    locked: false,
    rowVersionToken: 1
  };
  const ledger = upsertProgressEntry(initial, entry, context.employee).ledger;
  const progressLedgers = existing
    ? context.progressLedgers.map(row => row === existing ? ledger : row)
    : [...context.progressLedgers, ledger];
  const sameEvidenceSource = (row: IQuarterEvidenceReference): boolean => row.workplanKey === canonical.workplanKey
    && row.workplanItemKey === canonical.workplanItemKey && row.personKey === canonical.personKey
    && row.performanceYear === canonical.performanceYear && row.quarter === canonical.quarter
    && row.quarterReviewKey === canonical.quarterReviewKey && row.quarterReviewItemKey === canonical.quarterReviewItemKey
    && row.kpiId === canonical.kpiId;
  let evidence = context.evidence;
  if (entry.evidenceLink) {
    const reference: IQuarterEvidenceReference = {
      evidenceKey: `${entry.entryKey}|LINK`,
      kind: 'Link',
      personKey: item.personKey,
      workplanKey: item.workplanKey,
      workplanItemKey: item.workplanItemKey,
      quarterReviewKey: item.quarterReviewKey,
      quarterReviewItemKey: item.quarterReviewItemKey,
      performanceYear: item.performanceYear,
      quarter: item.quarter,
      kpiId: canonical.kpiId,
      description: entry.note,
      url: entry.evidenceLink,
      status: 'Draft'
    };
    evidence = [...evidence.filter(row => row.evidenceKey !== reference.evidenceKey || !sameEvidenceSource(row)), reference];
  }
  const items = context.items.map(row => row.quarterReviewItemKey === item.quarterReviewItemKey
    ? { ...row, evidenceCount: evidence.filter(reference => sameEvidenceSource(reference) && reference.status !== 'Withdrawn').length }
    : row);
  return {
    ...context,
    progressLedgers,
    evidence,
    items,
    readiness: evaluateQuarterSubmissionReadiness(context.lifecycle, context.review, items)
  };
};
