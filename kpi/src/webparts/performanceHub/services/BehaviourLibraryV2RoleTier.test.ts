import {
  assertBehaviourLibraryV2SourceRoleTier,
  mapBehaviourLibraryV2SourceRoleTier
} from './BehaviourLibraryV2RoleTier';

describe('Behaviour library v02 exact one-way role mapping', () => {
  it.each([
    ['L1', 'IC_OFFICER'],
    ['L2', 'PEOPLE_MANAGER'],
    ['L3', 'SENIOR_LEADER']
  ] as const)('maps source %s explicitly to assignment tier %s', (source, expected) => {
    expect(mapBehaviourLibraryV2SourceRoleTier(source)).toBe(expected);
    expect(assertBehaviourLibraryV2SourceRoleTier(source)).toBe(expected);
  });

  it.each([
    undefined, null, '', 'l1', 'L0', 'L4', 'IC_OFFICER', 'PEOPLE_MANAGER',
    'SENIOR_LEADER', 'Manager', 'Chief executive', ['L1'], { role: 'L1' }
  ])('does not infer a source role from %p', value => {
    expect(mapBehaviourLibraryV2SourceRoleTier(value)).toBeUndefined();
    expect(() => assertBehaviourLibraryV2SourceRoleTier(value)).toThrow(/exact L1, L2 or L3/);
  });
});
