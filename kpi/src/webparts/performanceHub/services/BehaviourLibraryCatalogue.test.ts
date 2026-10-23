import { BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED as seed } from './provisioning/BehaviourRoleLevelLibrarySeed';
import { mapBehaviourCatalogueRow } from './BehaviourLibraryCatalogue';
import { getLocalBehaviourLibrarySuggestions } from './EmployeeBehaviourSelection';
import { BEHAVIOUR_KEYS } from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_ROLE_LEVELS, behaviourCatalogueLabel } from './BehaviourLibraryRoleMetadata';

describe('BHVLIB R02 exact catalogue and proposed date', () => {
  const records = seed.map(mapBehaviourCatalogueRow);
  it('has 75 unique keys, 15 per behaviour, 25 per role and five per pair with exact labels', () => {
    expect(new Set(records.map(row => row.behaviourObjectiveKey)).size).toBe(75);
    BEHAVIOUR_KEYS.forEach(key => {
      expect(records.filter(row => row.behaviourKey === key)).toHaveLength(15);
      BEHAVIOUR_ROLE_LEVELS.forEach(role => expect(records.filter(row => row.behaviourKey === key && row.roleLevelCode === role.code)).toHaveLength(5));
    });
    BEHAVIOUR_ROLE_LEVELS.forEach(role => expect(records.filter(row => row.roleLevelCode === role.code)).toHaveLength(25));
    records.forEach((row, index) => expect(behaviourCatalogueLabel(row)).toBe(seed[index].DropdownLabel));
  });
  it.each([['2026-10-31', 0], ['2026-11-01', 15], ['2026-11-02', 15]])('filters explicit %s to %s choices', (date, count) => {
    expect(getLocalBehaviourLibrarySuggestions(records, 'BHV-01', new Date(date))).toHaveLength(count as number);
  });
  it('excludes inactive and expired records and includes the last effective day', () => {
    const row = records[0];
    expect(getLocalBehaviourLibrarySuggestions([{ ...row, active: false }], 'BHV-01', new Date('2026-11-01'))).toHaveLength(0);
    expect(getLocalBehaviourLibrarySuggestions([{ ...row, effectiveTo: '2026-11-01' }], 'BHV-01', new Date('2026-11-02'))).toHaveLength(0);
    expect(getLocalBehaviourLibrarySuggestions([{ ...row, effectiveTo: '2026-11-01' }], 'BHV-01', new Date('2026-11-01'))).toHaveLength(1);
    const today = new Date().toISOString().slice(0, 10);
    expect(getLocalBehaviourLibrarySuggestions(records, 'BHV-01')).toHaveLength(today < '2026-11-01' ? 0 : 15);
  });
});
