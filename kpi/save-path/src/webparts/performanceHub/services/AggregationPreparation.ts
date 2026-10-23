import type {
  AggregationMethod,
  IAggregationInput,
  IAggregationPreparationResult
} from '../models/QuarterlyModels';

const VERSION = 'DEMO-AGG-001' as const;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const round = (value: number): number => Math.round(value * 100) / 100;
const percentTotal = (values: number[]): number => round(values.reduce((sum, value) => sum + value, 0));

export const prepareAggregation = (
  method: AggregationMethod,
  inputs: IAggregationInput[]
): IAggregationPreparationResult => {
  const errors: string[] = [];
  const excludedNonCoreKeys = inputs.filter(input => input.itemType !== 'CoreGold').map(input => input.key);
  const core = inputs.filter(input => input.itemType === 'CoreGold');
  const approvedAndLocked = core.filter(input => input.approved && input.locked);
  const excludedNotRatedKeys = approvedAndLocked
    .filter(input => input.finalRag === 'NotRated')
    .map(input => input.key);
  const eligible = approvedAndLocked.filter(input => input.finalRag !== 'NotRated');
  if (!core.length) errors.push('No Core KPI inputs were supplied; Personal KPIs and Behaviours are never GOLD inputs.');
  if (approvedAndLocked.length !== core.length) errors.push('Every GOLD aggregation input must be an Approved and Locked Core item.');
  if (excludedNotRatedKeys.length) errors.push('NotRated Core results are excluded from authoritative GOLD aggregation.');
  if (new Set(eligible.map(input => input.key)).size !== eligible.length) errors.push('GOLD aggregation inputs contain duplicate stable keys.');

  let rawValue: number | undefined;
  let rawProgressPct: number | undefined;
  const progressValues = eligible.map(input => input.progressPct).filter(finite);

  if (method === 'DirectMetric') {
    const authoritative = eligible.filter(input => input.authoritative);
    if (authoritative.length !== 1 || !finite(authoritative[0]?.actualValue)) errors.push('DirectMetric requires exactly one authoritative numeric Core input.');
    else {
      rawValue = authoritative[0].actualValue;
      rawProgressPct = authoritative[0].progressPct;
    }
  } else if (method === 'Additive') {
    if (eligible.some(input => !finite(input.actualValue))) errors.push('Additive requires a numeric Actual on every Core input.');
    else rawValue = round(eligible.reduce((sum, input) => sum + (input.actualValue as number), 0));
  } else if (method === 'WeightedContribution') {
    if (eligible.some(input => !finite(input.progressPct) || !finite(input.contributionWeight))) {
      errors.push('WeightedContribution requires progress and approved employee Contribution Weight on every Core input.');
    } else {
      const weights = eligible.map(input => input.contributionWeight as number);
      if (percentTotal(weights) !== 100) errors.push('WeightedContribution weights must total 100.');
      else rawProgressPct = round(eligible.reduce((sum, input) => sum + (input.progressPct as number) * (input.contributionWeight as number) / 100, 0));
    }
  } else if (method === 'Composite') {
    if (eligible.some(input => !finite(input.progressPct) || !finite(input.organisationalWeight))) {
      errors.push('Composite remains NOT READY until approved organisational component weights exist.');
    } else {
      const weights = eligible.map(input => input.organisationalWeight as number);
      if (percentTotal(weights) !== 100) errors.push('Composite organisational weights must total 100.');
      else rawProgressPct = round(eligible.reduce((sum, input) => sum + (input.progressPct as number) * (input.organisationalWeight as number) / 100, 0));
    }
  } else if (method === 'Milestone') {
    if (eligible.length !== 1 || progressValues.length !== 1) errors.push('Milestone aggregation requires one approved controlled-stage Core result.');
    else rawProgressPct = progressValues[0];
  } else if (method === 'AccountableOwner') {
    const owner = eligible.filter(input => input.accountableOwner);
    if (owner.length !== 1 || !finite(owner[0]?.progressPct)) errors.push('AccountableOwner requires exactly one approved accountable-owner Core result.');
    else {
      rawValue = owner[0].actualValue;
      rawProgressPct = owner[0].progressPct;
    }
  }

  return {
    ready: errors.length === 0,
    method,
    includedKeys: eligible.map(input => input.key),
    excludedNonCoreKeys,
    excludedNotRatedKeys,
    rawValue,
    rawProgressPct,
    scoredProgressPct: finite(rawProgressPct) ? round(Math.max(0, Math.min(100, rawProgressPct))) : undefined,
    errors,
    calculationVersion: VERSION
  };
};

export const validateOrganisationalWeightGroups = (
  weights: Array<{ key: string; parentKey: string; weight?: number; active: boolean }>
): { ready: boolean; errors: string[] } => {
  const errors: string[] = [];
  const groups = new Map<string, Array<{ key: string; weight?: number }>>();
  weights.filter(weight => weight.active).forEach(weight => groups.set(weight.parentKey, [
    ...(groups.get(weight.parentKey) || []),
    { key: weight.key, weight: weight.weight }
  ]));
  groups.forEach((group, parentKey) => {
    if (new Set(group.map(item => item.key)).size !== group.length) errors.push(`${parentKey} contains duplicate organisational weight keys.`);
    if (group.some(item => !finite(item.weight))) errors.push(`${parentKey} has unconfigured organisational weights; values must not be invented.`);
    else if (percentTotal(group.map(item => item.weight as number)) !== 100) errors.push(`${parentKey} organisational weights must total 100.`);
  });
  if (!groups.size) errors.push('No organisational weighting configuration exists; weighted GOLD publication remains NOT READY.');
  return { ready: errors.length === 0, errors };
};
