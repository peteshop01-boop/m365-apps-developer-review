import { BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED } from './provisioning/BehaviourRoleLevelLibrarySeed';
import { BEHAVIOUR_OBJECTIVE_LIBRARY_SEED } from './provisioning/BehaviourObjectiveLibrarySeed';
import { mapBehaviourCatalogueRow } from './BehaviourLibraryCatalogue';
import { createLocalBehaviourRecord, readLocalBehaviourRecord, updateLocalBehaviourRecord, upsertLocalBehaviourCatalogue } from './BehaviourLibraryLocalStore';

describe('BHVLIB R01/R02 pure local mappings and idempotent upsert', () => {
  const records = BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED.map(mapBehaviourCatalogueRow);
  it('preserves every role through create/read/update and keeps ID/ETag', () => {
    records.forEach((record, index) => {
      const current = createLocalBehaviourRecord({ ...record, id: index + 1, etag: '"7"' });
      expect(readLocalBehaviourRecord(current)).toEqual(current);
      expect(updateLocalBehaviourRecord(current, { ...record, id: 1000, etag: 'wrong' })).toEqual(current);
    });
  });
  it('repeats identically, preserving legacy/unrelated bytes and immutable inputs', () => {
    const legacy = BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.map(row => Object.freeze({ ...row }));
    const source = records.map(row => Object.freeze({ ...row }));
    const before = JSON.stringify({ legacy, source });
    const first = upsertLocalBehaviourCatalogue(Object.freeze(legacy), Object.freeze(source));
    const second = upsertLocalBehaviourCatalogue(first, source);
    expect(first).toHaveLength(105);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(second.slice(0, 30))).toBe(JSON.stringify(legacy));
    expect(JSON.stringify({ legacy, source })).toBe(before);
  });
  it('deduplicates identical input and rejects conflicts without mutation', () => {
    expect(upsertLocalBehaviourCatalogue([], [records[0], records[0]])).toHaveLength(1);
    expect(() => upsertLocalBehaviourCatalogue([], [records[0], { ...records[0], objectiveTitle: 'Conflict' }])).toThrow(/Conflicting/);
    expect(() => updateLocalBehaviourRecord(records[0], records[1])).toThrow(/Stable/);
  });
});
