import type { IBehaviourLibraryV2Record } from '../models/BehaviourFrameworkV2Models';
import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import { assertBehaviourLibraryV2Record, inspectBehaviourLibraryV2Record } from './BehaviourLibraryV2Catalogue';

export type BehaviourLibraryV2StoredRecord = IBehaviourObjectiveLibraryRecord | IBehaviourLibraryV2Record;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const readBehaviourLibraryV2LocalRecord = <T extends BehaviourLibraryV2StoredRecord>(record: T): T => clone(record);

export const createBehaviourLibraryV2LocalRecord = (
  record: IBehaviourLibraryV2Record
): IBehaviourLibraryV2Record => assertBehaviourLibraryV2Record(record);

export const updateBehaviourLibraryV2LocalRecord = (
  current: BehaviourLibraryV2StoredRecord,
  next: IBehaviourLibraryV2Record
): IBehaviourLibraryV2Record => {
  if (current.behaviourObjectiveKey !== next.behaviourObjectiveKey) {
    throw new Error('BEHAVIOUR_LIBRARY_V2_STABLE_KEY: stable keys cannot change.');
  }
  if (inspectBehaviourLibraryV2Record(current).length > 0) {
    throw new Error('BEHAVIOUR_LIBRARY_V2_EXISTING_KEY_CONFLICT: a v02 key cannot replace a legacy-shaped record.');
  }
  const created = createBehaviourLibraryV2LocalRecord(next);
  return {
    ...created,
    ...(current.id !== undefined ? { id: current.id } : {}),
    ...(current.etag !== undefined ? { etag: current.etag } : {})
  };
};

const sameRecord = (left: IBehaviourLibraryV2Record, right: IBehaviourLibraryV2Record): boolean => {
  const keys = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])) as Array<keyof IBehaviourLibraryV2Record>;
  return keys.every(key => left[key] === right[key]);
};

/** Additive pure-local upsert. Unrelated and legacy rows retain their order and bytes. */
export const upsertBehaviourLibraryV2LocalCatalogue = (
  existing: ReadonlyArray<BehaviourLibraryV2StoredRecord>,
  incoming: ReadonlyArray<IBehaviourLibraryV2Record>
): BehaviourLibraryV2StoredRecord[] => {
  const unique = new Map<string, IBehaviourLibraryV2Record>();
  incoming.forEach(recordValue => {
    const record = createBehaviourLibraryV2LocalRecord(recordValue);
    const previous = unique.get(record.behaviourObjectiveKey);
    if (previous && !sameRecord(previous, record)) {
      throw new Error('BEHAVIOUR_LIBRARY_V2_DUPLICATE_CONFLICT: conflicting duplicate input key.');
    }
    unique.set(record.behaviourObjectiveKey, record);
  });
  if (new Set(existing.map(record => record.behaviourObjectiveKey)).size !== existing.length) {
    throw new Error('BEHAVIOUR_LIBRARY_V2_EXISTING_AMBIGUOUS: existing stable keys must be unique.');
  }
  const output = existing.map(record => {
    const next = unique.get(record.behaviourObjectiveKey);
    unique.delete(record.behaviourObjectiveKey);
    return next ? updateBehaviourLibraryV2LocalRecord(record, next) : readBehaviourLibraryV2LocalRecord(record);
  });
  return [...output, ...Array.from(unique.values()).map(readBehaviourLibraryV2LocalRecord)];
};
