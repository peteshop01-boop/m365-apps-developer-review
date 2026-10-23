import type {
  BehaviourLibraryV2SourceRoleLevel,
  BehaviourV2RoleTier
} from '../models/BehaviourFrameworkV2Models';

const sourceRoleTierMap: Readonly<Record<BehaviourLibraryV2SourceRoleLevel, BehaviourV2RoleTier>> = Object.freeze({
  L1: 'IC_OFFICER',
  L2: 'PEOPLE_MANAGER',
  L3: 'SENIOR_LEADER'
});

export const isBehaviourLibraryV2SourceRoleLevel = (
  value: unknown
): value is BehaviourLibraryV2SourceRoleLevel => value === 'L1' || value === 'L2' || value === 'L3';

/** Deliberately one-way: titles, seniority text and application roles are not assignment evidence. */
export const mapBehaviourLibraryV2SourceRoleTier = (
  value: unknown
): BehaviourV2RoleTier | undefined => isBehaviourLibraryV2SourceRoleLevel(value)
  ? sourceRoleTierMap[value]
  : undefined;

export const assertBehaviourLibraryV2SourceRoleTier = (
  value: unknown
): BehaviourV2RoleTier => {
  const roleTier = mapBehaviourLibraryV2SourceRoleTier(value);
  if (!roleTier) throw new Error('BEHAVIOUR_LIBRARY_V2_ROLE_INVALID: an exact L1, L2 or L3 source role is required.');
  return roleTier;
};
