import type { ICoreKpiCatalogueItem } from '../models/ProductionModels';
import {
  assertCanonicalKeys,
  canonicalisePlainArray,
  canonicalisePlainRecord
} from './SecurityBoundaryCanonicalisation';

export const CORE_CATALOGUE_FILTER_PREFERENCE_KEY = 'kcf-performance-hub:core-catalogue-filters:v1';

export interface ICoreCatalogueFilters {
  search: string;
  pillars: string[];
  workstreams: string[];
}

export interface ICoreWorkstreamOption {
  key: string;
  pillar: string;
  name: string;
}

export interface ICoreCatalogueView {
  selected: ICoreKpiCatalogueItem[];
  results: ICoreKpiCatalogueItem[];
}

export type ICoreFilterPreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

const coreCatalogueItemKeys = Object.freeze([
  'kpiId', 'kpiVersionKey', 'targetVersionKey', 'wording', 'pillar', 'workstream', 'strategyTarget',
  'accountableOwnerEmail', 'aggregationMethod', 'scoringDirection', 'metricType', 'unitLabel',
  'percentageSourceScale', 'sourceScoringDirection', 'sourceMetricType', 'sourceUnitLabel',
  'classificationStatus', 'classificationSource', 'classificationRationale', 'ownerSourceCode',
  'dataQualityFlags', 'portfolioWeight', 'kpiWeightWithinWorkstream', 'ragParametersJson', 'baselineValue',
  'kpiThresholdOverride', 'approvedMilestonePolicy', 'approvedScorePolicy', 'approvedTargetRangePolicy',
  'scoringPolicyIssues', 'yearEndTarget', 'yearEndTargetValue', 'yearEndTargetText', 'q1Target',
  'q1TargetValue', 'q1TargetText', 'q2Target', 'q2TargetValue', 'q2TargetText', 'q3Target',
  'q3TargetValue', 'q3TargetText', 'q4Target', 'q4TargetValue', 'q4TargetText'
] as const);
const coreCatalogueFilterKeys = Object.freeze(['search', 'pillars', 'workstreams'] as const);

const canonicalCoreCatalogue = (
  items: readonly ICoreKpiCatalogueItem[]
): ReadonlyArray<Readonly<ICoreKpiCatalogueItem>> => {
  const snapshots = canonicalisePlainArray(items, 'Core catalogue');
  snapshots.forEach((item, index) => assertCanonicalKeys(
    item, coreCatalogueItemKeys, `Core catalogue[${index}]`
  ));
  return snapshots;
};

const canonicalStringList = (values: readonly string[], label: string): readonly string[] => {
  const snapshot = canonicalisePlainArray(values, label);
  if (snapshot.some(value => typeof value !== 'string')) throw new Error(`${label} must contain only text values.`);
  return snapshot as readonly string[];
};

const canonicalFilters = (filters: ICoreCatalogueFilters): Readonly<ICoreCatalogueFilters> => {
  const snapshot = canonicalisePlainRecord(filters, 'Core catalogue filters', coreCatalogueFilterKeys);
  if (typeof snapshot.search !== 'string' || !Array.isArray(snapshot.pillars)
    || !Array.isArray(snapshot.workstreams)
    || snapshot.pillars.some(value => typeof value !== 'string')
    || snapshot.workstreams.some(value => typeof value !== 'string')) {
    throw new Error('Core catalogue filters must contain one search string and string selection arrays.');
  }
  return snapshot;
};

const hasText = (value: string | undefined): boolean => Boolean(value?.trim());

/**
 * The production data service only returns Active/IsCurrent KPI definitions
 * joined to Approved/IsCurrent annual targets.  Retain that fail-closed
 * boundary in the view model: an item without both governed version identities
 * is not eligible to be loaded into the selectable catalogue.
 */
const isApprovedCurrentCoreCatalogueSnapshot = (item: Readonly<ICoreKpiCatalogueItem>): boolean =>
  hasText(item.kpiId) && hasText(item.kpiVersionKey) && hasText(item.targetVersionKey);

export const isApprovedCurrentCoreCatalogueItem = (item: ICoreKpiCatalogueItem): boolean =>
  isApprovedCurrentCoreCatalogueSnapshot(canonicalCoreCatalogue([item])[0]);

export const getApprovedCurrentCoreCatalogue = (
  items: readonly ICoreKpiCatalogueItem[]
): ICoreKpiCatalogueItem[] => {
  const snapshots = canonicalCoreCatalogue(items);
  const identityCounts = new Map<string, number>();
  snapshots.forEach(item => {
    if (!isApprovedCurrentCoreCatalogueSnapshot(item)) return;
    identityCounts.set(item.kpiId, (identityCounts.get(item.kpiId) || 0) + 1);
  });
  return snapshots.filter(item => isApprovedCurrentCoreCatalogueSnapshot(item)
    && identityCounts.get(item.kpiId) === 1) as ICoreKpiCatalogueItem[];
};

export const emptyCoreCatalogueFilters = (): ICoreCatalogueFilters => ({
  search: '',
  pillars: [],
  workstreams: []
});

export const coreWorkstreamKey = (pillar: string, workstream: string): string =>
  `${pillar}\u001f${workstream}`;

const uniqueSorted = (values: string[]): string[] =>
  Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));

export const getCorePillarOptions = (items: ICoreKpiCatalogueItem[]): string[] =>
  uniqueSorted(canonicalCoreCatalogue(items).map(item => item.pillar));

const coreWorkstreamOptionsFromSnapshots = (
  items: ReadonlyArray<Readonly<ICoreKpiCatalogueItem>>,
  selectedPillars: readonly string[]
): ICoreWorkstreamOption[] => {
  const allowedPillars = new Set(selectedPillars);
  const options = new Map<string, ICoreWorkstreamOption>();
  items.forEach(item => {
    if (allowedPillars.size > 0 && !allowedPillars.has(item.pillar)) return;
    const key = coreWorkstreamKey(item.pillar, item.workstream);
    if (!options.has(key)) options.set(key, { key, pillar: item.pillar, name: item.workstream });
  });
  return Array.from(options.values()).sort((left, right) =>
    left.pillar.localeCompare(right.pillar) || left.name.localeCompare(right.name));
};

export const getCoreWorkstreamOptions = (
  items: ICoreKpiCatalogueItem[],
  selectedPillars: readonly string[]
): ICoreWorkstreamOption[] => {
  const snapshots = canonicalCoreCatalogue(items);
  const pillars = canonicalStringList(selectedPillars, 'Selected Core pillars');
  return coreWorkstreamOptionsFromSnapshots(snapshots, pillars);
};

export const reconcileCoreWorkstreams = (
  items: ICoreKpiCatalogueItem[],
  selectedPillars: readonly string[],
  selectedWorkstreams: readonly string[]
): string[] => {
  const snapshots = canonicalCoreCatalogue(items);
  const pillars = canonicalStringList(selectedPillars, 'Selected Core pillars');
  const workstreams = canonicalStringList(selectedWorkstreams, 'Selected Core workstreams');
  const allowed = new Set(coreWorkstreamOptionsFromSnapshots(snapshots, pillars).map(option => option.key));
  return uniqueSorted(workstreams.filter(key => allowed.has(key)));
};

const matchesSearch = (item: Readonly<ICoreKpiCatalogueItem>, search: string): boolean => {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return [item.kpiId, item.wording, item.pillar, item.workstream, item.strategyTarget]
    .some(value => value?.toLowerCase().includes(term));
};

const filterCoreCatalogueSnapshots = (
  items: ReadonlyArray<Readonly<ICoreKpiCatalogueItem>>,
  filters: Readonly<ICoreCatalogueFilters>
): ReadonlyArray<Readonly<ICoreKpiCatalogueItem>> => {
  const pillars = new Set(filters.pillars);
  const workstreams = new Set(filters.workstreams);
  return items.filter(item =>
    (pillars.size === 0 || pillars.has(item.pillar))
    && (workstreams.size === 0 || workstreams.has(coreWorkstreamKey(item.pillar, item.workstream)))
    && matchesSearch(item, filters.search));
};

export const filterCoreCatalogueByView = (
  items: ICoreKpiCatalogueItem[],
  filters: ICoreCatalogueFilters
): ICoreKpiCatalogueItem[] => {
  const snapshots = canonicalCoreCatalogue(items);
  const filterSnapshot = canonicalFilters(filters);
  return filterCoreCatalogueSnapshots(snapshots, filterSnapshot) as ICoreKpiCatalogueItem[];
};

export const buildCoreCatalogueView = (
  items: ICoreKpiCatalogueItem[],
  selectedKpiIds: readonly string[],
  filters: ICoreCatalogueFilters
): ICoreCatalogueView => {
  const snapshots = canonicalCoreCatalogue(items);
  const selectedIds = new Set(canonicalStringList(selectedKpiIds, 'Selected Core KPI IDs'));
  const filterSnapshot = canonicalFilters(filters);
  return {
    selected: snapshots.filter(item => selectedIds.has(item.kpiId)) as ICoreKpiCatalogueItem[],
    results: filterCoreCatalogueSnapshots(snapshots, filterSnapshot)
      .filter(item => !selectedIds.has(item.kpiId)) as ICoreKpiCatalogueItem[]
  };
};

export const clearCoreCatalogueFilters = (): ICoreCatalogueFilters => emptyCoreCatalogueFilters();

export const hasCoreCatalogueFilters = (filters: ICoreCatalogueFilters): boolean => {
  const snapshot = canonicalFilters(filters);
  return Boolean(snapshot.search.trim() || snapshot.pillars.length || snapshot.workstreams.length);
};

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? uniqueSorted(value.filter(item => typeof item === 'string') as string[]) : [];

export const readCoreCataloguePreference = (
  storage: ICoreFilterPreferenceStorage | undefined,
  items: ICoreKpiCatalogueItem[]
): ICoreCatalogueFilters => {
  if (!storage) return emptyCoreCatalogueFilters();
  try {
    const snapshots = canonicalCoreCatalogue(items);
    const raw = storage.getItem(CORE_CATALOGUE_FILTER_PREFERENCE_KEY);
    if (!raw) return emptyCoreCatalogueFilters();
    const parsed = JSON.parse(raw) as { pillars?: unknown; workstreams?: unknown };
    const availablePillars = new Set(uniqueSorted(snapshots.map(item => item.pillar)));
    const pillars = stringArray(parsed.pillars).filter(pillar => availablePillars.has(pillar));
    const requestedWorkstreams = stringArray(parsed.workstreams);
    const allowedWorkstreams = new Set(coreWorkstreamOptionsFromSnapshots(snapshots, pillars)
      .map(option => option.key));
    return {
      search: '',
      pillars,
      workstreams: uniqueSorted(requestedWorkstreams.filter(key => allowedWorkstreams.has(key)))
    };
  } catch {
    return emptyCoreCatalogueFilters();
  }
};

export const writeCoreCataloguePreference = (
  storage: ICoreFilterPreferenceStorage | undefined,
  filters: ICoreCatalogueFilters
): void => {
  if (!storage) return;
  try {
    const snapshot = canonicalFilters(filters);
    storage.setItem(CORE_CATALOGUE_FILTER_PREFERENCE_KEY, JSON.stringify({
      pillars: uniqueSorted(snapshot.pillars),
      workstreams: uniqueSorted(snapshot.workstreams)
    }));
  } catch {
    // Browser preference persistence is optional; filtering remains fully usable in memory.
  }
};
