import { BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED } from './provisioning/BehaviourRoleLevelLibrarySeed';
import { BEHAVIOUR_OBJECTIVE_LIBRARY_SEED } from './provisioning/BehaviourObjectiveLibrarySeed';
import { mapBehaviourCatalogueRow } from './BehaviourLibraryCatalogue';
import { validateBehaviourObjectiveLibraryRecord } from './BehaviourWorkplanPolicy';
import { isExactLegacyEmployeeBehaviourSuggestionKey } from './EmployeeBehaviourSelection';
import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';

describe('BHVLIB R01 strict metadata and compatibility', () => {
  it.each(BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED)('accepts $BehaviourObjectiveKey', row => {
    expect(validateBehaviourObjectiveLibraryRecord(mapBehaviourCatalogueRow(row))).toEqual([]);
    expect(isExactLegacyEmployeeBehaviourSuggestionKey(row.BehaviourKey, row.BehaviourObjectiveKey)).toBe(false);
  });
  it.each([undefined, '', 'L0', 'L4', 'l1', 1, null, 'L2'])('rejects invalid or mismatched role %s', level => {
    const row = { ...mapBehaviourCatalogueRow(BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED[0]), roleLevelCode: level } as unknown as IBehaviourObjectiveLibraryRecord;
    expect(validateBehaviourObjectiveLibraryRecord(row).length).toBeGreaterThan(0);
  });
  it.each(['BHV-02-L1-01', 'BHV-01-L1-00', 'BHV-01-L1-1', 'BHV-01-l1-01', 'BHV-01-L4-01', 'BHV-01-L1-01-extra', 'BHV-01-L', ' BHV-01-L1-01'])('rejects malformed key %s even without metadata and with persisted identity', key => {
    const row = mapBehaviourCatalogueRow(BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED[0]);
    [row.roleLevelCode, undefined].forEach(roleLevelCode => expect(validateBehaviourObjectiveLibraryRecord({ ...row, id: 14, behaviourObjectiveKey: key, roleLevelCode }).length).toBeGreaterThan(0));
  });
  it('retains generic validation and required date, measure, unit and evidence checks', () => {
    expect(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED).toHaveLength(30);
    BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.forEach(row => expect(validateBehaviourObjectiveLibraryRecord(row)).toEqual([]));
    const row = mapBehaviourCatalogueRow(BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED[0]);
    ['suggestedMeasure', 'suggestedUnit', 'suggestedEvidence', 'effectiveFrom'].forEach(field => {
      expect(validateBehaviourObjectiveLibraryRecord({ ...row, [field]: '' }).length).toBeGreaterThan(0);
    });
  });
  it('preserves existing LOCAL-prefixed and generated KCF legacy keys without inventing roles', () => {
    ['BHV-01-LOCAL-1788700193518', 'BHV-01-KCF-20260906140000-L12345'].forEach(key => {
      expect(validateBehaviourObjectiveLibraryRecord({ ...BEHAVIOUR_OBJECTIVE_LIBRARY_SEED[0], behaviourObjectiveKey: key })).toEqual([]);
    });
  });
});
