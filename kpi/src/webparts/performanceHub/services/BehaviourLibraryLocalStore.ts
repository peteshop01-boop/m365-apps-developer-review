import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import { validateBehaviourObjectiveLibraryRecord } from './BehaviourWorkplanPolicy';

/** Pure local mappings. No SharePoint transport, schema installation or history rewriting. */
export const readLocalBehaviourRecord = (record: IBehaviourObjectiveLibraryRecord): IBehaviourObjectiveLibraryRecord => ({ ...record });
export const createLocalBehaviourRecord = (record: IBehaviourObjectiveLibraryRecord): IBehaviourObjectiveLibraryRecord => {
  const errors = validateBehaviourObjectiveLibraryRecord(record);
  if (errors.length) throw new Error(errors.join(' '));
  return readLocalBehaviourRecord(record);
};
export const updateLocalBehaviourRecord = (
  current: IBehaviourObjectiveLibraryRecord, next: IBehaviourObjectiveLibraryRecord
): IBehaviourObjectiveLibraryRecord => {
  if (current.behaviourObjectiveKey !== next.behaviourObjectiveKey) throw new Error('Stable keys cannot change.');
  return createLocalBehaviourRecord({ ...next, ...(current.id !== undefined ? { id: current.id } : {}),
    ...(current.etag !== undefined ? { etag: current.etag } : {}) });
};
const sameRecord = (left: IBehaviourObjectiveLibraryRecord, right: IBehaviourObjectiveLibraryRecord): boolean => {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])) as Array<keyof IBehaviourObjectiveLibraryRecord>;
  return keys.every(key => left[key] === right[key]);
};
export const upsertLocalBehaviourCatalogue = (
  existing: ReadonlyArray<IBehaviourObjectiveLibraryRecord>, incoming: ReadonlyArray<IBehaviourObjectiveLibraryRecord>
): IBehaviourObjectiveLibraryRecord[] => {
  const unique = new Map<string, IBehaviourObjectiveLibraryRecord>();
  incoming.forEach(record => {
    const valid = createLocalBehaviourRecord(record);
    const previous = unique.get(valid.behaviourObjectiveKey);
    if (previous && !sameRecord(previous, valid)) throw new Error('Conflicting duplicate input key.');
    unique.set(valid.behaviourObjectiveKey, valid);
  });
  if (new Set(existing.map(record => record.behaviourObjectiveKey)).size !== existing.length) throw new Error('Ambiguous existing stable key.');
  const output = existing.map(record => {
    const next = unique.get(record.behaviourObjectiveKey);
    unique.delete(record.behaviourObjectiveKey);
    return next ? updateLocalBehaviourRecord(record, next) : readLocalBehaviourRecord(record);
  });
  return [...output, ...Array.from(unique.values()).map(readLocalBehaviourRecord)];
};
