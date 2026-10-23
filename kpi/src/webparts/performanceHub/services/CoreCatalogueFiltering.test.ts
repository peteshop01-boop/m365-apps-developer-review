import type { ICoreKpiCatalogueItem } from '../models/ProductionModels';
import {
  buildCoreCatalogueView,
  clearCoreCatalogueFilters,
  coreWorkstreamKey,
  filterCoreCatalogueByView,
  getApprovedCurrentCoreCatalogue,
  getCoreWorkstreamOptions,
  hasCoreCatalogueFilters,
  readCoreCataloguePreference,
  reconcileCoreWorkstreams,
  writeCoreCataloguePreference
} from './CoreCatalogueFiltering';

const catalogue: ICoreKpiCatalogueItem[] = [
  { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01', wording: 'Grow schools participation', pillar: 'Participation', workstream: 'Schools', scoringDirection: 'HigherIsBetter', unitLabel: 'programmes' },
  { kpiId: 'SO1-002', kpiVersionKey: 'SO1-002|v01', targetVersionKey: 'SO1-002|2026|v01', wording: 'Improve community reach', pillar: 'Participation', workstream: 'Community', scoringDirection: 'HigherIsBetter', unitLabel: 'people' },
  { kpiId: 'SO2-001', kpiVersionKey: 'SO2-001|v01', targetVersionKey: 'SO2-001|2026|v01', wording: 'Club support visits', pillar: 'Clubs', workstream: 'Club Development', scoringDirection: 'HigherIsBetter', unitLabel: 'visits' },
  { kpiId: 'SO2-002', kpiVersionKey: 'SO2-002|v01', targetVersionKey: 'SO2-002|2026|v01', wording: 'Club schools pathway', pillar: 'Clubs', workstream: 'Schools', scoringDirection: 'HigherIsBetter', unitLabel: 'clubs' },
  { kpiId: 'SO3-001', kpiVersionKey: 'SO3-001|v01', targetVersionKey: 'SO3-001|2026|v01', wording: 'People development', pillar: 'People', workstream: 'Learning', scoringDirection: 'HigherIsBetter', unitLabel: 'people' }
];

describe('Core KPI catalogue filtering', () => {
  it('loads only uniquely identified current approved catalogue rows without mutating the source', () => {
    const source = Object.freeze([
      ...catalogue,
      { ...catalogue[0], kpiId: 'NO-KPI-VERSION', kpiVersionKey: '' },
      { ...catalogue[0], kpiId: 'NO-APPROVED-TARGET', targetVersionKey: '' },
      { ...catalogue[0], kpiId: 'DUPLICATE-CURRENT' },
      { ...catalogue[1], kpiId: 'DUPLICATE-CURRENT' }
    ]);
    const loaded = getApprovedCurrentCoreCatalogue(source);
    expect(loaded.map(item => item.kpiId)).toEqual(catalogue.map(item => item.kpiId));
    expect(source).toHaveLength(9);
  });

  it('supports Pillar multi-select without changing KPI eligibility', () => {
    const results = filterCoreCatalogueByView(catalogue, {
      search: '', pillars: ['Participation', 'Clubs'], workstreams: []
    });
    expect(results.map(item => item.kpiId)).toEqual(['SO1-001', 'SO1-002', 'SO2-001', 'SO2-002']);
    expect(catalogue).toHaveLength(5);
  });

  it('limits Workstream options to selected Pillars and removes stale dependent selections', () => {
    expect(getCoreWorkstreamOptions(catalogue, ['Participation']).map(option => option.key)).toEqual([
      coreWorkstreamKey('Participation', 'Community'),
      coreWorkstreamKey('Participation', 'Schools')
    ]);
    expect(reconcileCoreWorkstreams(catalogue, ['Participation'], [
      coreWorkstreamKey('Participation', 'Schools'),
      coreWorkstreamKey('Clubs', 'Club Development')
    ])).toEqual([coreWorkstreamKey('Participation', 'Schools')]);
  });

  it('combines search, Pillar and Workstream criteria', () => {
    const results = filterCoreCatalogueByView(catalogue, {
      search: 'schools',
      pillars: ['Clubs'],
      workstreams: [coreWorkstreamKey('Clubs', 'Schools')]
    });
    expect(results.map(item => item.kpiId)).toEqual(['SO2-002']);
  });

  it('clears search, Pillar and Workstream filters together', () => {
    const cleared = clearCoreCatalogueFilters();
    expect(cleared).toEqual({ search: '', pillars: [], workstreams: [] });
    expect(hasCoreCatalogueFilters(cleared)).toBe(false);
  });

  it('keeps selected KPIs visible even when catalogue filters exclude them', () => {
    const view = buildCoreCatalogueView(catalogue, ['SO1-001'], {
      search: 'club support', pillars: ['Clubs'], workstreams: [coreWorkstreamKey('Clubs', 'Club Development')]
    });
    expect(view.selected.map(item => item.kpiId)).toEqual(['SO1-001']);
    expect(view.results.map(item => item.kpiId)).toEqual(['SO2-001']);
  });

  it('never mutates or deselects the supplied Workplan selection while filtering', () => {
    const selected = Object.freeze(['SO1-001', 'SO3-001']);
    const view = buildCoreCatalogueView(catalogue, selected, {
      search: 'club', pillars: ['Clubs'], workstreams: []
    });
    expect(selected).toEqual(['SO1-001', 'SO3-001']);
    expect(view.selected.map(item => item.kpiId)).toEqual(['SO1-001', 'SO3-001']);
    expect(view.results.map(item => item.kpiId)).toEqual(['SO2-001', 'SO2-002']);
  });

  it('persists only valid browser-local Pillar and Workstream preferences, never search text', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string): string | null => values.get(key) || null,
      setItem: (key: string, value: string): void => { values.set(key, value); }
    };
    writeCoreCataloguePreference(storage, {
      search: 'private temporary search',
      pillars: ['Participation'],
      workstreams: [coreWorkstreamKey('Participation', 'Schools')]
    });
    expect(readCoreCataloguePreference(storage, catalogue)).toEqual({
      search: '',
      pillars: ['Participation'],
      workstreams: [coreWorkstreamKey('Participation', 'Schools')]
    });
  });
});
