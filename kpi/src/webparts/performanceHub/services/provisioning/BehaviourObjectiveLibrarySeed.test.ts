import { BEHAVIOUR_KEYS } from '../../models/BehaviourWorkplanModels';
import { BEHAVIOUR_OBJECTIVE_LIBRARY_SEED } from './BehaviourObjectiveLibrarySeed';

describe('Behaviour Objective Library provisioning seed', () => {
  it('contains exactly 30 active objectives with unique idempotent keys', () => {
    expect(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED).toHaveLength(30);
    expect(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.every(row => row.active)).toBe(true);
    expect(new Set(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.map(row => row.behaviourObjectiveKey)).size).toBe(30);
  });

  it.each(BEHAVIOUR_KEYS)('contains exactly six objectives for %s', behaviourKey => {
    const records = BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.filter(row => row.behaviourKey === behaviourKey);
    expect(records).toHaveLength(6);
    expect(records.map(row => row.sortOrder)).toEqual([10, 20, 30, 40, 50, 60]);
  });

  it('has complete, observable and customisable seed content', () => {
    BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.forEach(row => {
      expect(row.behaviourObjectiveKey).toMatch(/^BHV-0[1-5]-OBJ-0[1-6]$/);
      expect(row.objectiveTitle.trim().length).toBeGreaterThan(5);
      expect(row.objectiveDescription.trim().length).toBeGreaterThan(20);
      expect(row.suggestedMeasure.trim().length).toBeGreaterThan(15);
      expect(row.suggestedUnit.trim().length).toBeGreaterThan(2);
      expect(row.suggestedEvidence.trim().length).toBeGreaterThan(15);
      expect(row.effectiveFrom).toBe('2025-11-01');
    });
  });

  it('has no cross-banner or duplicate title assignment', () => {
    const titleKeys = BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.map(row =>
      `${row.behaviourKey}|${row.objectiveTitle.trim().toLowerCase()}`
    );
    expect(new Set(titleKeys).size).toBe(30);
    expect(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.every(row =>
      row.behaviourObjectiveKey.startsWith(`${row.behaviourKey}-OBJ-`)
    )).toBe(true);
  });

});
