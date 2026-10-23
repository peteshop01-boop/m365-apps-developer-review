import * as fs from 'fs';
import * as path from 'path';
import type {
  IBehaviourLibraryV2Record,
  IBehaviourLibraryV2SourceCatalogue
} from '../models/BehaviourFrameworkV2Models';
import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import { mapBehaviourLibraryV2Catalogue } from './BehaviourLibraryV2Catalogue';
import {
  createBehaviourLibraryV2LocalRecord,
  updateBehaviourLibraryV2LocalRecord,
  upsertBehaviourLibraryV2LocalCatalogue
} from './BehaviourLibraryV2LocalStore';

const loadRecords = (): IBehaviourLibraryV2Record[] => {
  const source = JSON.parse(fs.readFileSync(path.resolve(process.cwd(),
    'data/test-pilot/behaviour-library-v2.synthetic.json'), 'utf8')) as IBehaviourLibraryV2SourceCatalogue;
  return mapBehaviourLibraryV2Catalogue({ ...source, published: true, productionSafe: true });
};
const legacy: IBehaviourObjectiveLibraryRecord = {
  id: 1, etag: '"legacy-1"', behaviourObjectiveKey: 'BHV-01-OBJ-01', behaviourKey: 'BHV-01',
  objectiveTitle: 'Stored legacy objective', objectiveDescription: 'Stored legacy description',
  suggestedMeasure: 'Stored legacy measure', suggestedUnit: 'Stored legacy unit',
  suggestedEvidence: 'Stored legacy evidence', active: true, sortOrder: 1,
  effectiveFrom: '2026-01-01'
};

describe('Behaviour library v02 pure local store', () => {
  it('is idempotent and preserves unrelated legacy rows and immutable inputs byte-for-byte', () => {
    const records = loadRecords().map(record => Object.freeze({ ...record }));
    const existing = Object.freeze([Object.freeze({ ...legacy })]);
    const before = JSON.stringify({ existing, records });
    const first = upsertBehaviourLibraryV2LocalCatalogue(existing, records);
    const second = upsertBehaviourLibraryV2LocalCatalogue(first, records);
    expect(first).toHaveLength(76);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(JSON.stringify(second[0])).toBe(JSON.stringify(legacy));
    expect(JSON.stringify({ existing, records })).toBe(before);
  });

  it('retains existing identity metadata while updating the same exact v02 stable key', () => {
    const record = loadRecords()[0];
    const current = createBehaviourLibraryV2LocalRecord({ ...record, id: 40, etag: '"stored-4"' });
    const next = { ...record, objectiveTitle: 'Synthetic updated local wording', id: 99, etag: 'wrong' };
    expect(updateBehaviourLibraryV2LocalRecord(current, next)).toMatchObject({
      id: 40, etag: '"stored-4"', objectiveTitle: 'Synthetic updated local wording'
    });
  });

  it('deduplicates identical input and rejects conflicting or ambiguous keys without mutation', () => {
    const records = loadRecords();
    const record = records[0];
    expect(upsertBehaviourLibraryV2LocalCatalogue([], [record, record])).toHaveLength(1);
    expect(() => upsertBehaviourLibraryV2LocalCatalogue([], [record,
      { ...record, objectiveTitle: 'Synthetic conflict' }])).toThrow(/DUPLICATE_CONFLICT/);
    expect(() => upsertBehaviourLibraryV2LocalCatalogue([legacy, { ...legacy }], records)).toThrow(/EXISTING_AMBIGUOUS/);
    expect(() => upsertBehaviourLibraryV2LocalCatalogue([{ ...legacy,
      behaviourObjectiveKey: record.behaviourObjectiveKey }], [record])).toThrow(/EXISTING_KEY_CONFLICT/);
    expect(() => createBehaviourLibraryV2LocalRecord({ ...record,
      descriptor: 'Must not enter a suggestion record' } as unknown as IBehaviourLibraryV2Record))
      .toThrow(/unauthorised field/);
  });
});
