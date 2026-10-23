import type { ICoreKpiCatalogueItem, ICoreWorkplanItem } from '../models/ProductionModels';
import {
  canSelectAnotherCoreKpi,
  CURRENT_STRATEGIC_CORE_KPI_COUNT,
  filterCoreCatalogue,
  formatCoreSelectionCount,
  groupCoreCatalogue,
  validateCoreWeights
} from './CoreWorkplanValidation';

const item = (id: number, weight: number | undefined = 0): ICoreWorkplanItem => ({
  id, etag: '"1"', workplanItemKey: `item-${id}`, naturalKey: `wp|CoreGold|KPI-${id}`,
  workplanKey: 'person|2026', personKey: 'person', performanceYear: 2026,
  kpiId: `KPI-${id}`, kpiVersionKey: `KPI-${id}|v01`, targetVersionKey: `KPI-${id}|2026|v01`,
  coreWorkplanWeight: weight, displayOrder: id, activeInWorkplan: true
});

const catalogue: ICoreKpiCatalogueItem[] = [
  { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01', wording: 'Increase participation', pillar: 'Participation', workstream: 'Schools', scoringDirection: 'TBC', unitLabel: 'TBC' },
  { kpiId: 'SO2-033', kpiVersionKey: 'SO2-033|v01', targetVersionKey: 'SO2-033|2026|v01', wording: 'Support clubs', pillar: 'Community', workstream: 'Clubs', scoringDirection: 'HigherIsBetter', unitLabel: 'clubs' }
];

describe('Core Workplan validation', () => {
  it('classifies weight totals below, equal to and above 100', () => {
    expect(validateCoreWeights([item(1, 60)]).state).toBe('incomplete');
    expect(validateCoreWeights([item(1, 60), item(2, 40)])).toEqual(expect.objectContaining({ state: 'complete', total: 100 }));
    expect(validateCoreWeights([item(1, 60), item(2, 50)])).toEqual(expect.objectContaining({ state: 'invalid', total: 110 }));
    expect(validateCoreWeights([item(1, -1)]).state).toBe('invalid');
  });

  it('filters and groups the catalogue without failing on TBC metadata', () => {
    expect(filterCoreCatalogue(catalogue, 'schools').map(row => row.kpiId)).toEqual(['SO1-001']);
    expect(filterCoreCatalogue(catalogue, 'SO2-033')).toHaveLength(1);
    expect(groupCoreCatalogue(catalogue)).toEqual([
      expect.objectContaining({ name: 'Participation', workstreams: [expect.objectContaining({ name: 'Schools' })] }),
      expect.objectContaining({ name: 'Community', workstreams: [expect.objectContaining({ name: 'Clubs' })] })
    ]);
  });

  it('has no artificial selection cap and reports the governed 109-item boundary accurately', () => {
    const allCurrent = Array.from({ length: CURRENT_STRATEGIC_CORE_KPI_COUNT }, (_, index) => item(index + 1));
    expect(canSelectAnotherCoreKpi(allCurrent)).toBe(true);
    expect(formatCoreSelectionCount(allCurrent.length)).toBe('Selected 109 of 109');
  });
});
