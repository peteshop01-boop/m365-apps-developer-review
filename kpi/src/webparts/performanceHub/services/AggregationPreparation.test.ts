import type { IAggregationInput } from '../models/QuarterlyModels';
import { prepareAggregation, validateOrganisationalWeightGroups } from './AggregationPreparation';

const core = (key: string, progressPct: number, extra: Partial<IAggregationInput> = {}): IAggregationInput => ({
  key, itemType: 'CoreGold', kpiId: 'SO1-001', progressPct, approved: true, locked: true, ...extra
});

describe('AggregationPreparation', () => {
  it('prepares all six approved methods without publishing', () => {
    expect(prepareAggregation('DirectMetric', [core('a', 120, { actualValue: 12, authoritative: true })])).toEqual(expect.objectContaining({ ready: true, rawValue: 12, rawProgressPct: 120, scoredProgressPct: 100 }));
    expect(prepareAggregation('Additive', [core('a', 80, { actualValue: 4 }), core('b', 90, { actualValue: 6 })])).toEqual(expect.objectContaining({ ready: true, rawValue: 10 }));
    expect(prepareAggregation('WeightedContribution', [core('a', 80, { contributionWeight: 25 }), core('b', 100, { contributionWeight: 75 })])).toEqual(expect.objectContaining({ ready: true, rawProgressPct: 95 }));
    expect(prepareAggregation('Composite', [core('a', 80, { organisationalWeight: 50 }), core('b', 100, { organisationalWeight: 50 })])).toEqual(expect.objectContaining({ ready: true, rawProgressPct: 90 }));
    expect(prepareAggregation('Milestone', [core('a', 66.67)])).toEqual(expect.objectContaining({ ready: true, rawProgressPct: 66.67 }));
    expect(prepareAggregation('AccountableOwner', [core('a', 90, { accountableOwner: true, actualValue: 9 }), core('b', 30)])).toEqual(expect.objectContaining({ ready: true, rawProgressPct: 90 }));
  });

  it('isolates Personal and Behaviour inputs from GOLD', () => {
    const personal: IAggregationInput = { key: 'personal', itemType: 'LocalPersonal', progressPct: 1000, approved: true, locked: true, employeeWorkplanWeight: 100 };
    const behaviour: IAggregationInput = { key: 'behaviour', itemType: 'Behaviour', progressPct: 1000, approved: true, locked: true, employeeWorkplanWeight: 100 };
    const result = prepareAggregation('DirectMetric', [core('core', 50, { actualValue: 5, authoritative: true, employeeWorkplanWeight: 1 }), personal, behaviour]);
    expect(result).toEqual(expect.objectContaining({ ready: true, rawValue: 5, rawProgressPct: 50, excludedNonCoreKeys: ['personal', 'behaviour'] }));
  });

  it('excludes NotRated Core results from every authoritative aggregation path', () => {
    const result = prepareAggregation('DirectMetric', [core('unrated', 100, {
      actualValue: 10,
      authoritative: true,
      finalRag: 'NotRated'
    })]);
    expect(result).toEqual(expect.objectContaining({
      ready: false,
      includedKeys: [],
      excludedNotRatedKeys: ['unrated'],
      rawValue: undefined,
      rawProgressPct: undefined
    }));
    expect(result.errors).toContain('NotRated Core results are excluded from authoritative GOLD aggregation.');
  });

  it('never treats employee Workplan weight as organisational contribution weight', () => {
    const result = prepareAggregation('WeightedContribution', [
      core('a', 80, { employeeWorkplanWeight: 50 }),
      core('b', 100, { employeeWorkplanWeight: 50 })
    ]);
    expect(result.ready).toBe(false);
    expect(result.errors).toContain('WeightedContribution requires progress and approved employee Contribution Weight on every Core input.');
  });

  it('keeps organisational weighted publication NOT READY until each active group totals 100', () => {
    expect(validateOrganisationalWeightGroups([]).ready).toBe(false);
    expect(validateOrganisationalWeightGroups([{ key: 'K1', parentKey: 'WS1', active: true }]).errors[0]).toContain('must not be invented');
    expect(validateOrganisationalWeightGroups([
      { key: 'K1', parentKey: 'WS1', weight: 60, active: true },
      { key: 'K2', parentKey: 'WS1', weight: 40, active: true },
      { key: 'WS1', parentKey: 'P1', weight: 100, active: true }
    ])).toEqual({ ready: true, errors: [] });
  });

  it('requires Approved/Locked Core inputs and unique keys', () => {
    const result = prepareAggregation('Additive', [core('a', 50, { actualValue: 1 }), core('a', 60, { actualValue: 2, locked: false })]);
    expect(result.ready).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringContaining('Approved and Locked')]));
  });
});
