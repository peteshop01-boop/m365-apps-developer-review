import type {
  BehaviourKey,
  IBehaviourObjectiveLibraryRecord
} from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_KEYS } from '../models/BehaviourWorkplanModels';
import type { IBehaviourLibraryV2Record } from '../models/BehaviourFrameworkV2Models';
import {
  behaviourLibraryV2RecordMatchesAssignment,
  isExactBehaviourLibraryV2SuggestionKey
} from './BehaviourLibraryV2Catalogue';
import { isExactRoleCatalogueKey, isRoleBehaviourObjectiveLibraryRecord } from './BehaviourLibraryRoleMetadata';

export const MAX_EMPLOYEE_BEHAVIOUR_CUSTOM_OBJECTIVE_LENGTH = 100000;

const customTextBoundaryIgnorable = new RegExp(
  '[\\p{White_Space}\\p{Default_Ignorable_Code_Point}\\p{Cc}\\p{Cf}]', 'u'
);
const customTextInteriorForbidden = new RegExp(
  '[\\p{Default_Ignorable_Code_Point}\\p{Cc}\\p{Cf}\\p{Cs}]', 'u'
);
const customTextWhitespace = new RegExp('^\\p{White_Space}$', 'u');
const customTextMark = new RegExp('^\\p{M}$', 'u');

export const isFixedEmployeeBehaviourKey = (value: string): value is BehaviourKey =>
  BEHAVIOUR_KEYS.indexOf(value as BehaviourKey) >= 0;

export const isExactLegacyEmployeeBehaviourSuggestionKey = (
  behaviourKey: string,
  suggestionKey: string
): boolean => isFixedEmployeeBehaviourKey(behaviourKey)
  && [1, 2, 3, 4, 5].some(index => suggestionKey === `${behaviourKey}-OBJ-0${index}`);

/** Structural v02 predicate; trusted catalogue and assignment checks are separate. */
export const isExactGovernedV2BehaviourSuggestionKey = (
  behaviourKey: string,
  suggestionKey: string,
  roleLevelCode: 'L1' | 'L2' | 'L3'
): boolean => isExactBehaviourLibraryV2SuggestionKey(behaviourKey, suggestionKey, roleLevelCode);

export const normaliseEmployeeBehaviourCustomObjective = (
  value: string | undefined
): string | undefined => {
  if (value === undefined || value.length > MAX_EMPLOYEE_BEHAVIOUR_CUSTOM_OBJECTIVE_LENGTH) return undefined;
  let normalised: string;
  try {
    normalised = value.normalize('NFC');
  } catch {
    return undefined;
  }
  if (normalised.length > MAX_EMPLOYEE_BEHAVIOUR_CUSTOM_OBJECTIVE_LENGTH) return undefined;
  const characters = Array.from(normalised);
  let first = 0;
  let last = characters.length;
  while (first < last && customTextBoundaryIgnorable.test(characters[first])) first += 1;
  while (last > first && customTextBoundaryIgnorable.test(characters[last - 1])) last -= 1;
  const bounded = characters.slice(first, last);
  if (!bounded.length || bounded.some(character => customTextInteriorForbidden.test(character))) return undefined;
  const hasVisibleBase = bounded.some(character =>
    !customTextWhitespace.test(character) && !customTextMark.test(character));
  return hasVisibleBase ? bounded.join('') : undefined;
};

export const getEmployeeBehaviourSuggestions = (
  objectives: ReadonlyArray<IBehaviourObjectiveLibraryRecord>,
  behaviourKey: BehaviourKey
): IBehaviourObjectiveLibraryRecord[] => objectives
  .filter(item => item.active && item.behaviourKey === behaviourKey
    && isExactLegacyEmployeeBehaviourSuggestionKey(behaviourKey, item.behaviourObjectiveKey))
  .sort((left, right) => left.sortOrder - right.sortOrder);

export const normaliseEmployeeBehaviourSelection = (
  suggestionKeys: ReadonlyArray<string>,
  objectives: ReadonlyArray<IBehaviourObjectiveLibraryRecord>,
  behaviourKey: BehaviourKey
): string[] => {
  const allowed = new Set(getEmployeeBehaviourSuggestions(objectives, behaviourKey)
    .map(item => item.behaviourObjectiveKey));
  return Array.from(new Set(suggestionKeys.map(key => key.trim()).filter(key => allowed.has(key))));
};

export const choosePrimaryBehaviourSuggestion = (
  suggestionKeys: ReadonlyArray<string>,
  currentPrimaryKey?: string
): string | undefined => currentPrimaryKey && suggestionKeys.indexOf(currentPrimaryKey) >= 0
  ? currentPrimaryKey
  : suggestionKeys[0];

export const behaviourSelectionIsComplete = (
  suggestionKeys: ReadonlyArray<string>,
  customObjective: string
): boolean => suggestionKeys.length > 0 || normaliseEmployeeBehaviourCustomObjective(customObjective) !== undefined;

export interface IBehaviourLibraryV2AssignmentFilter {
  frameworkVersion?: unknown;
  roleTier?: unknown;
}

export const getEmployeeBehaviourV2Suggestions = (
  objectives: ReadonlyArray<IBehaviourObjectiveLibraryRecord>,
  behaviourKey: BehaviourKey,
  assignment: IBehaviourLibraryV2AssignmentFilter,
  asOf: Date = new Date()
): IBehaviourLibraryV2Record[] => objectives
  .filter((item): item is IBehaviourLibraryV2Record => behaviourLibraryV2RecordMatchesAssignment(
    item as IBehaviourLibraryV2Record,
    behaviourKey,
    assignment.frameworkVersion,
    assignment.roleTier,
    asOf
  ))
  .sort((left, right) => left.sortOrder - right.sortOrder
    || left.behaviourObjectiveKey.localeCompare(right.behaviourObjectiveKey));

export const getUnavailableEmployeeBehaviourV2SelectionKeys = (
  storedKeys: ReadonlyArray<string>,
  available: ReadonlyArray<IBehaviourLibraryV2Record>
): string[] => {
  const availableKeys = new Set(available.map(record => record.behaviourObjectiveKey));
  return Array.from(new Set(storedKeys.filter(key => !availableKeys.has(key))));
};

/** Preserve stored unavailable keys while applying only current trusted selection changes. */
export const retainUnavailableEmployeeBehaviourV2Selection = (
  storedKeys: ReadonlyArray<string>,
  requestedAvailableKeys: ReadonlyArray<string>,
  available: ReadonlyArray<IBehaviourLibraryV2Record>
): string[] => {
  const availableKeys = new Set(available.map(record => record.behaviourObjectiveKey));
  const unavailable = getUnavailableEmployeeBehaviourV2SelectionKeys(storedKeys, available);
  const requested = requestedAvailableKeys.filter(key => availableKeys.has(key));
  return Array.from(new Set([...unavailable, ...requested]));
};

/** Donor local UI support; neither predicate authorises a governed v02 write. */
export const isExactLocalBehaviourSuggestionKey = (behaviourKey: string, key: string): boolean =>
  isExactLegacyEmployeeBehaviourSuggestionKey(behaviourKey, key) || isExactRoleCatalogueKey(behaviourKey, key);

export const getLocalBehaviourLibrarySuggestions = (
  objectives: ReadonlyArray<IBehaviourObjectiveLibraryRecord>, behaviourKey: BehaviourKey, asOf: Date = new Date()
): IBehaviourObjectiveLibraryRecord[] => {
  const date = asOf.toISOString().slice(0, 10);
  return objectives.filter(item => item.active && item.behaviourKey === behaviourKey
    && (isExactLegacyEmployeeBehaviourSuggestionKey(behaviourKey, item.behaviourObjectiveKey)
      || isRoleBehaviourObjectiveLibraryRecord(item))
    && (!item.effectiveFrom || item.effectiveFrom <= date) && (!item.effectiveTo || item.effectiveTo >= date))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.behaviourObjectiveKey.localeCompare(right.behaviourObjectiveKey));
};

export const normaliseLocalBehaviourSelection = (
  keys: ReadonlyArray<string>, objectives: ReadonlyArray<IBehaviourObjectiveLibraryRecord>, behaviourKey: BehaviourKey,
  asOf: Date = new Date()
): string[] => {
  const allowed = new Set(getLocalBehaviourLibrarySuggestions(objectives, behaviourKey, asOf).map(item => item.behaviourObjectiveKey));
  return Array.from(new Set(keys.filter(key => allowed.has(key))));
};
