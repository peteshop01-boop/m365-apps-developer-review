import type { ICoreKpiCatalogueItem } from '../models/ProductionModels';
import {
  buildCoreCatalogueView,
  getApprovedCurrentCoreCatalogue
} from './CoreCatalogueFiltering';

const catalogueItem = (patch: Partial<ICoreKpiCatalogueItem> = {}): ICoreKpiCatalogueItem => ({
  kpiId: 'CORE-001',
  kpiVersionKey: 'CORE-001-v1',
  targetVersionKey: 'CORE-001-target-v1',
  wording: 'Synthetic governed KPI',
  pillar: 'People',
  workstream: 'Community',
  strategyTarget: 'Synthetic strategy',
  scoringDirection: 'HigherIsBetter',
  unitLabel: 'items',
  ...patch
});
describe('SEC-R034-F04 Core catalogue canonicalisation repair', () => {
  it('rejects a switching catalogue identity accessor without executing its getter', () => {
    let identityReads = 0;
    const hostile = catalogueItem({ kpiId: '' });
    Object.defineProperty(hostile, 'kpiId', {
      enumerable: true,
      configurable: true,
      get: () => { identityReads += 1; return identityReads <= 2 ? 'CORE-A' : 'CORE-B'; }
    });
    expect(() => getApprovedCurrentCoreCatalogue([
      hostile,
      catalogueItem({ kpiId: 'CORE-B' })
    ])).toThrow(/accessor/);
    expect(identityReads).toBe(0);
  });

  it('uses stable descriptors instead of a Proxy get trap for uniqueness and materialisation', () => {
    let getReads = 0;
    const target = catalogueItem({ kpiId: 'CORE-A' });
    const hostile = new Proxy(target, {
      get: (source, property, receiver): unknown => {
        getReads += 1;
        if (property === 'kpiId') return 'CORE-B';
        return Reflect.get(source, property, receiver) as unknown;
      }
    });
    const accepted = getApprovedCurrentCoreCatalogue([
      hostile,
      catalogueItem({ kpiId: 'CORE-B' })
    ]);
    expect(accepted.map(item => item.kpiId)).toEqual(['CORE-A', 'CORE-B']);
    expect(getReads).toBe(0);
    expect(Object.isFrozen(accepted[0])).toBe(true);
  });

  it('keeps duplicate approved/current identities out and rejects hostile descriptor shapes', () => {
    expect(getApprovedCurrentCoreCatalogue([
      catalogueItem({ kpiId: 'CORE-DUPLICATE' }),
      catalogueItem({ kpiId: 'CORE-DUPLICATE', kpiVersionKey: 'CORE-DUPLICATE-v2' }),
      catalogueItem({ kpiId: 'CORE-UNIQUE' })
    ]).map(item => item.kpiId)).toEqual(['CORE-UNIQUE']);

    const custom = Object.assign(Object.create({ inherited: true }), catalogueItem());
    expect(() => getApprovedCurrentCoreCatalogue([custom])).toThrow(/custom or null prototype/);

    const hidden = catalogueItem() as ICoreKpiCatalogueItem & { hidden?: string };
    Object.defineProperty(hidden, 'hidden', { enumerable: false, value: 'unsafe' });
    expect(() => getApprovedCurrentCoreCatalogue([hidden])).toThrow(/non-enumerable/);
  });

  it('filters and returns only the same immutable catalogue snapshots', () => {
    const source = [catalogueItem({ kpiId: 'CORE-A' }), catalogueItem({
      kpiId: 'CORE-B', pillar: 'Participation', workstream: 'Schools', wording: 'Schools participation'
    })];
    const view = buildCoreCatalogueView(source, ['CORE-A'], {
      search: 'schools', pillars: ['Participation'], workstreams: []
    });
    source[0].kpiId = 'FORGED-AFTER-FILTER';
    source[1].wording = 'Forged after filter';
    expect(view.selected.map(item => item.kpiId)).toEqual(['CORE-A']);
    expect(view.results.map(item => item.kpiId)).toEqual(['CORE-B']);
    expect(view.results[0].wording).toBe('Schools participation');
    expect(Object.isFrozen(view.selected[0])).toBe(true);
    expect(Object.isFrozen(view.results[0])).toBe(true);
  });
});
