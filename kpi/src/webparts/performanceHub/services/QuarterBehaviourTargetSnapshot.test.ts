import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import type { IAnnualWorkplan, IBehaviourWorkplanItem } from '../models/ProductionModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_PLANNING_LEVELS_VERSION } from '../models/BehaviourFrameworkV2Models';
import { assertApprovedBehaviourTargetSource, assertFrozenBehaviourAnnualTarget } from './QuarterReviewItemPersistence';
import { materialiseQuarterBehaviourTarget, presentQuarterBehaviourTarget, QUARTER_BEHAVIOUR_TARGET_FIELDS, materialiseBehaviourSourceData } from './QuarterBehaviourTargetSnapshot';

const annual = { workplanKey: 'synthetic|2026', personKey: 'synthetic', performanceYear: 2026,
  state: 'Approved', transitionCorrelationKey: 'approval-3', rowVersionToken: 3 } as IAnnualWorkplan;
const snapshot = { valueId: 'BHV-01', frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, period: 'Q1' };
const source = { workplanItemKey: 'BHV-01', workplanKey: annual.workplanKey, personKey: annual.personKey,
  performanceYear: 2026, activeInWorkplan: true, behaviourId: 'BHV-01', behaviourSnapshotV2: snapshot,
  etag: '"source-3"', behaviourPlanningLevelsV1: { contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
    currentLevel: 'Developing', targetLevel: 'Effective' } } as unknown as IBehaviourWorkplanItem;
const frozen = { quarterReviewItemKey: 'synthetic|2026|Q1|BHV-01', workplanItemKey: 'BHV-01',
  workplanKey: annual.workplanKey, personKey: annual.personKey, performanceYear: 2026, quarter: 'Q1',
  behaviourId: 'BHV-01', behaviourSnapshotV2: snapshot, behaviourAnnualTargetLevelV2: 'Effective',
  behaviourAnnualTargetSourceWorkplanItemKeyV2: 'BHV-01', behaviourAnnualTargetSourceEtagV2: '"source-3"',
  behaviourAnnualTargetSourceWorkplanVersionV2: 3, behaviourAnnualTargetSourceApprovalKeyV2: 'approval-3' } as IQuarterReviewItem;

describe('quarter provenance defensive acceptance scenarios (Security 27 expectations)', () => {
  it('accepts the approved source', () => expect(() => assertApprovedBehaviourTargetSource(frozen, annual, source)).not.toThrow());
  it('accepts the persisted image', () => expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen })).not.toThrow());
  it.each(QUARTER_BEHAVIOUR_TARGET_FIELDS.filter(key => key !== 'behaviourAnnualTargetJustificationV2'))('rejects missing persisted %s', key => {
    expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen, [key]: undefined })).toThrow();
  });
  it.each([['behaviourAnnualTargetLevelV2', 'Exceptional'], ['behaviourAnnualTargetSourceEtagV2', '"source-4"'],
    ['behaviourAnnualTargetSourceWorkplanVersionV2', 4], ['behaviourAnnualTargetSourceApprovalKeyV2', 'approval-4']])('rejects changed persisted %s', (key, value) => {
    expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen, [key]: value })).toThrow();
  });
  it.each([['personKey', 'foreign'], ['performanceYear', 2027], ['behaviourId', 'BHV-02'], ['etag', '"source-4"']])('rejects foreign/stale source %s', (key, value) => {
    expect(() => assertApprovedBehaviourTargetSource(frozen, annual, { ...source, [key]: value })).toThrow();
  });
  it('rejects unapproved source', () => expect(() => assertApprovedBehaviourTargetSource(frozen, { ...annual, state: 'Draft' }, source)).toThrow());
  it('rejects changed approval', () => expect(() => assertApprovedBehaviourTargetSource(frozen, { ...annual, transitionCorrelationKey: 'changed' }, source)).toThrow());
  it.each([['behaviourAnnualTargetLevelV2', 'Unrecognised'], ['behaviourAnnualTargetSourceEtagV2', '*'],
    ['behaviourAnnualTargetSourceEtagV2', ' '], ['behaviourAnnualTargetSourceWorkplanVersionV2', -1],
    ['behaviourAnnualTargetSourceWorkplanVersionV2', '3'], ['behaviourAnnualTargetSourceApprovalKeyV2', ' '],
    ['behaviourAnnualTargetJustificationV2', 17]])('rejects matching malformed %s %s', (key, value) => {
    const malformed = { ...frozen, [key]: value };
    expect(() => assertFrozenBehaviourAnnualTarget(malformed, { ...malformed })).toThrow();
  });
  it.each([' * ', ' ', 'unquoted'])('rejects malformed approved source ETag %s', etag => {
    expect(() => assertApprovedBehaviourTargetSource({ ...frozen, behaviourAnnualTargetSourceEtagV2: etag }, annual, { ...source, etag })).toThrow();
  });
});

describe('semantic materialisation and historical preservation', () => {
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('preserves five Value images for %s after a later amendment', quarter => {
    for (const valueId of ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const) {
      const image = { ...frozen, quarter, workplanItemKey: valueId, behaviourId: valueId,
        behaviourAnnualTargetSourceWorkplanItemKeyV2: valueId, behaviourSnapshotV2: { ...frozen.behaviourSnapshotV2!, valueId, period: quarter } };
      expect(() => assertFrozenBehaviourAnnualTarget(image, { ...image })).not.toThrow();
      expect(presentQuarterBehaviourTarget(image)?.behaviourAnnualTargetLevelV2).toBe('Effective');
      expect(() => assertApprovedBehaviourTargetSource(image, { ...annual, rowVersionToken: 4 }, source)).toThrow();
    }
  });
  it.each(['*', ' W/"3"', '""', '"space tag"', '"line\n"'])('rejects nonspecific/malformed ETag %s', etag => {
    expect(() => materialiseQuarterBehaviourTarget({ ...frozen, behaviourAnnualTargetSourceEtagV2: etag })).toThrow();
  });
  it('accepts a weak specific ETag and preserves bounded justification exactly', () => {
    const image = materialiseQuarterBehaviourTarget({ ...frozen, behaviourAnnualTargetSourceEtagV2: 'W/"3"', behaviourAnnualTargetJustificationV2: 'Visible reason' });
    expect(Object.isFrozen(image)).toBe(true);
    expect(image?.behaviourAnnualTargetJustificationV2).toBe('Visible reason');
  });
  it.each([' ', 'x'.repeat(1001), null, 17])('rejects invalid supplied justification %s', reason => {
    expect(() => materialiseQuarterBehaviourTarget({ ...frozen, behaviourAnnualTargetJustificationV2: reason })).toThrow();
  });
  it.each([0, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN])('rejects unsafe version %s', version => {
    expect(() => materialiseQuarterBehaviourTarget({ ...frozen, behaviourAnnualTargetSourceWorkplanVersionV2: version })).toThrow();
  });
  it('preserves fully absent history and rejects partial, crossed and accessor authority', () => {
    const historic = { ...frozen }; QUARTER_BEHAVIOUR_TARGET_FIELDS.forEach(key => { delete historic[key]; });
    expect(materialiseQuarterBehaviourTarget(historic)).toBeUndefined();
    expect(presentQuarterBehaviourTarget({ ...frozen, behaviourAnnualTargetSourceEtagV2: undefined })).toBeUndefined();
    expect(presentQuarterBehaviourTarget({ ...frozen, behaviourAnnualTargetSourceWorkplanItemKeyV2: 'crossed' })).toBeUndefined();
    expect(() => materialiseQuarterBehaviourTarget(Object.create(frozen))).toThrow();
    const getter = jest.fn(() => 'Effective'); const accessor = { ...frozen };
    Object.defineProperty(accessor, 'behaviourAnnualTargetLevelV2', { get: getter });
    expect(() => materialiseQuarterBehaviourTarget(accessor)).toThrow(); expect(getter).not.toHaveBeenCalled();
    const mutable = { ...frozen }; const materialised = materialiseQuarterBehaviourTarget(mutable);
    mutable.behaviourAnnualTargetLevelV2 = 'Exceptional'; expect(materialised?.behaviourAnnualTargetLevelV2).toBe('Effective');
  });
});


describe('Technical eight persisted-image expectations', () => {
  it('accepts the valid image', () => expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen })).not.toThrow());
  it.each([
    ['missing ETag', { behaviourAnnualTargetSourceEtagV2: undefined }],
    ['changed Target', { behaviourAnnualTargetLevelV2: 'Exceptional' }],
    ['crossed source key', { behaviourAnnualTargetSourceWorkplanItemKeyV2: 'crossed' }]
  ])('rejects %s', (_name, patch) => expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen, ...patch } as IQuarterReviewItem)).toThrow());
  it.each([
    ['non-categorical Target', { behaviourAnnualTargetLevelV2: 'Unrecognised' }],
    ['negative version', { behaviourAnnualTargetSourceWorkplanVersionV2: -1 }],
    ['wildcard ETag', { behaviourAnnualTargetSourceEtagV2: '*' }],
    ['blank approval', { behaviourAnnualTargetSourceApprovalKeyV2: ' ' }]
  ])('rejects matching %s', (_name, patch) => {
    const image = { ...frozen, ...patch } as IQuarterReviewItem;
    expect(() => assertFrozenBehaviourAnnualTarget(image, { ...image })).toThrow();
  });
  it('detaches nested annual data and rejects getters before reading', () => {
    const input = { ...source, behaviourPlanningLevelsV1: { ...source.behaviourPlanningLevelsV1! } };
    const copy = materialiseBehaviourSourceData(input);
    input.behaviourPlanningLevelsV1.targetLevel = 'Exceptional';
    expect(copy.behaviourPlanningLevelsV1.targetLevel).toBe('Effective');
    expect(Object.isFrozen(copy.behaviourPlanningLevelsV1)).toBe(true);
    const getter = jest.fn(() => '"source-3"');
    Object.defineProperty(input, 'etag', { get: getter });
    expect(() => materialiseBehaviourSourceData(input)).toThrow(); expect(getter).not.toHaveBeenCalled();
  });
});


it('retains exact annual planning envelope validation after safe copying', () => {
  const malformed = { ...source, behaviourPlanningLevelsV1: { ...source.behaviourPlanningLevelsV1!, extra: 'invalid' } };
  expect(() => assertApprovedBehaviourTargetSource(frozen, annual, malformed)).toThrow(/exact v01/);
});

it('rejects a cyclic annual source with the domain error before exhausting the stack', () => {
  const cyclic: Record<string, unknown> = { source };
  cyclic.self = cyclic;
  expect(() => materialiseBehaviourSourceData(cyclic)).toThrow(
    'The frozen annual Behaviour Target or provenance is invalid, absent or changed.');
});

it('preserves trailing array slots when detaching annual source data', () => {
  const values = new Array<string>(3);
  values[0] = 'Approved';
  const result = materialiseBehaviourSourceData({ values });
  expect(result.values.length).toBe(3);
  expect(Object.keys(result.values)).toEqual(['0']);
  expect(Object.isFrozen(result.values)).toBe(true);
});

it('detaches repeated acyclic references without mistaking them for a cycle', () => {
  const shared = { targetLevel: 'Effective' };
  const copy = materialiseBehaviourSourceData({ first: shared, second: shared });
  shared.targetLevel = 'Exceptional';
  expect(copy.first.targetLevel).toBe('Effective');
  expect(copy.second.targetLevel).toBe('Effective');
  expect(Object.isFrozen(copy.first)).toBe(true);
  expect(Object.isFrozen(copy.second)).toBe(true);
});

it('retains an own object length field so copying cannot hide an invalid planning envelope', () => {
  const malformed = { ...source, behaviourPlanningLevelsV1: { ...source.behaviourPlanningLevelsV1!, length: 3 } };
  const copy = materialiseBehaviourSourceData(malformed);
  expect(copy.behaviourPlanningLevelsV1.length).toBe(3);
  expect(() => assertApprovedBehaviourTargetSource(frozen, annual, copy)).toThrow(/exact v01/);
});
