import type { ICoreKpiCatalogueItem, ICoreWorkplanItem } from '../models/ProductionModels';

export const CURRENT_STRATEGIC_CORE_KPI_COUNT = 109;

export type CoreWeightState = 'empty' | 'incomplete' | 'complete' | 'invalid';

export interface ICoreWeightValidation {
  total: number;
  state: CoreWeightState;
  message: string;
}

export const validateCoreWeights = (items: ICoreWorkplanItem[]): ICoreWeightValidation => {
  const active = items.filter(item => item.activeInWorkplan);
  const weights = active.map(item => item.coreWorkplanWeight);
  if (weights.some(value => value !== undefined && (!Number.isFinite(value) || value < 0 || value > 100))) {
    return { total: 0, state: 'invalid', message: 'Each Core KPI weight must be a number from 0 to 100.' };
  }
  const total = weights.reduce<number>((sum, value) => sum + (value || 0), 0);
  if (active.length === 0) return { total, state: 'empty', message: 'Select at least one Core KPI to begin weighting.' };
  if (total > 100) return { total, state: 'invalid', message: 'Total Core Weight is above 100%. Reduce one or more weights.' };
  if (total < 100) return { total, state: 'incomplete', message: 'Total Core Weight is below 100%. Draft saving is available, but the section is incomplete.' };
  return { total, state: 'complete', message: 'Core KPI weighting is complete at 100%.' };
};

export const filterCoreCatalogue = (items: ICoreKpiCatalogueItem[], search: string): ICoreKpiCatalogueItem[] => {
  const term = search.trim().toLowerCase();
  if (!term) return items;
  return items.filter(item => [item.kpiId, item.wording, item.pillar, item.workstream, item.strategyTarget]
    .some(value => value?.toLowerCase().includes(term)));
};

export interface ICoreWorkstreamGroup { name: string; items: ICoreKpiCatalogueItem[]; }
export interface ICorePillarGroup { name: string; workstreams: ICoreWorkstreamGroup[]; }

export const groupCoreCatalogue = (items: ICoreKpiCatalogueItem[]): ICorePillarGroup[] => {
  const pillars = new Map<string, Map<string, ICoreKpiCatalogueItem[]>>();
  items.forEach(item => {
    if (!pillars.has(item.pillar)) pillars.set(item.pillar, new Map());
    const workstreams = pillars.get(item.pillar) as Map<string, ICoreKpiCatalogueItem[]>;
    if (!workstreams.has(item.workstream)) workstreams.set(item.workstream, []);
    (workstreams.get(item.workstream) as ICoreKpiCatalogueItem[]).push(item);
  });
  return Array.from(pillars.entries()).map(([name, workstreams]) => ({
    name,
    workstreams: Array.from(workstreams.entries()).map(([workstreamName, workstreamItems]) => ({
      name: workstreamName,
      items: workstreamItems.slice().sort((a, b) => a.kpiId.localeCompare(b.kpiId))
    }))
  }));
};

export const coreNaturalKey = (workplanKey: string, kpiId: string): string => `${workplanKey}|CoreGold|${kpiId}`;

/** The governed catalogue is the boundary; there is no additional employee selection cap. */
export const canSelectAnotherCoreKpi = (_items: readonly ICoreWorkplanItem[]): boolean => true;

export const formatCoreSelectionCount = (selectedCount: number): string =>
  `Selected ${selectedCount} of ${CURRENT_STRATEGIC_CORE_KPI_COUNT}`;
