import type { BehaviourRoleLevelCode, IBehaviourObjectiveLibraryRecord, IRoleBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';

export const BEHAVIOUR_ROLE_LEVELS: ReadonlyArray<{ code: BehaviourRoleLevelCode; label: string }> = [
  { code: 'L1', label: 'Colleague' }, { code: 'L2', label: 'People manager' }, { code: 'L3', label: 'Senior leader' }
];

export const isBehaviourRoleLevel = (value: unknown): value is BehaviourRoleLevelCode =>
  value === 'L1' || value === 'L2' || value === 'L3';

export const isExactRoleCatalogueKey = (behaviourKey: string, key: string): boolean =>
  /^BHV-0[1-5]$/.test(behaviourKey) && /^BHV-0[1-5]-L[1-3]-0[1-9][0-9]*$/.test(key)
  && key.slice(0, 6) === behaviourKey;

// Reserve even malformed/lowercase role-prefixed keys; removing metadata cannot make them legacy.
export const needsBehaviourRoleMetadata = (item: IBehaviourObjectiveLibraryRecord): boolean =>
  item.roleLevelCode !== undefined || /^BHV-[^-]+-L(?!OCAL-)/i.test(item.behaviourObjectiveKey.trim());

export const isRoleBehaviourObjectiveLibraryRecord = (
  item: IBehaviourObjectiveLibraryRecord
): item is IRoleBehaviourObjectiveLibraryRecord => isBehaviourRoleLevel(item.roleLevelCode)
  && isExactRoleCatalogueKey(item.behaviourKey, item.behaviourObjectiveKey)
  && item.behaviourObjectiveKey.split('-')[2] === item.roleLevelCode;

export const behaviourCatalogueLabel = (item: IRoleBehaviourObjectiveLibraryRecord): string =>
  `[${BEHAVIOUR_ROLE_LEVELS.find(role => role.code === item.roleLevelCode)?.label}] ${item.objectiveTitle}`;
