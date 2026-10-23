import * as fs from 'fs';
import * as path from 'path';
import {
  BEHAVIOUR_FRAMEWORK_V2_VERSION,
  BEHAVIOUR_V2_ROLE_TIERS,
  BEHAVIOUR_V2_VALUE_IDS,
  type IBehaviourLibraryV2SourceCatalogue,
  type IBehaviourLibraryV2SourceRow
} from '../models/BehaviourFrameworkV2Models';
import {
  BEHAVIOUR_LIBRARY_V2_SOURCE_FIELDS,
  inspectBehaviourLibraryV2SourceRow,
  mapBehaviourLibraryV2Catalogue,
  mapBehaviourLibraryV2SourceRow
} from './BehaviourLibraryV2Catalogue';
import {
  getEmployeeBehaviourV2Suggestions,
  isExactGovernedV2BehaviourSuggestionKey
} from './EmployeeBehaviourSelection';

const fixturePath = path.resolve(process.cwd(), 'data/test-pilot/behaviour-library-v2.synthetic.json');
const loadFixture = (): IBehaviourLibraryV2SourceCatalogue => JSON.parse(
  fs.readFileSync(fixturePath, 'utf8')
) as IBehaviourLibraryV2SourceCatalogue;
const selectableFixture = (): IBehaviourLibraryV2SourceCatalogue => ({
  ...loadFixture(), published: true, productionSafe: true, synthetic: false
});

describe('Behaviour library v02 catalogue contract', () => {
  it('maps the synthetic exact 75-key and sixteen-field shape without activating it', () => {
    const source = loadFixture();
    expect(source).toMatchObject({ frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      synthetic: true, published: false, productionSafe: false });
    expect(source.records).toHaveLength(75);
    source.records.forEach(row => {
      expect(Object.keys(row).sort()).toEqual([...BEHAVIOUR_LIBRARY_V2_SOURCE_FIELDS].sort());
      expect(inspectBehaviourLibraryV2SourceRow(row)).toEqual([]);
    });
    const records = mapBehaviourLibraryV2Catalogue(source);
    expect(new Set(records.map(record => record.behaviourObjectiveKey)).size).toBe(75);
    expect(getEmployeeBehaviourV2Suggestions(records, 'BHV-01', {
      frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, roleTier: 'IC_OFFICER'
    }, new Date('2099-01-01T12:00:00.000Z'))).toEqual([]);
  });

  it('has exactly five choices for every Value and mapped assignment tier', () => {
    const records = mapBehaviourLibraryV2Catalogue(selectableFixture());
    BEHAVIOUR_V2_VALUE_IDS.forEach(behaviourKey => {
      BEHAVIOUR_V2_ROLE_TIERS.forEach(roleTier => {
        const suggestions = getEmployeeBehaviourV2Suggestions(records, behaviourKey, {
          frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, roleTier
        }, new Date('2099-01-01T12:00:00.000Z'));
        expect(suggestions).toHaveLength(5);
        expect(new Set(suggestions.map(record => record.roleTier))).toEqual(new Set([roleTier]));
      });
    });
    expect(isExactGovernedV2BehaviourSuggestionKey('BHV-01', 'BHV-01-L1-01', 'L1')).toBe(true);
    expect(isExactGovernedV2BehaviourSuggestionKey('BHV-01', 'BHV-01-L2-06', 'L1')).toBe(false);
    expect(isExactGovernedV2BehaviourSuggestionKey('BHV-01', 'BHV-02-L1-01', 'L1')).toBe(false);
  });

  it('rejects synthetic records even when publication and production-safety flags contradict them', () => {
    const contradictory = { ...loadFixture(), published: true, productionSafe: true };
    expect(contradictory.synthetic).toBe(true);
    const records = mapBehaviourLibraryV2Catalogue(contradictory);
    expect(getEmployeeBehaviourV2Suggestions(records, 'BHV-01', {
      frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, roleTier: 'IC_OFFICER'
    }, new Date('2099-01-01T12:00:00.000Z'))).toEqual([]);
  });

  it('fails closed for wrong version, publication, production safety and assignment tier', () => {
    const trusted = selectableFixture();
    const records = mapBehaviourLibraryV2Catalogue(trusted);
    const filter = (frameworkVersion: unknown, roleTier: unknown): number =>
      getEmployeeBehaviourV2Suggestions(records, 'BHV-01', { frameworkVersion, roleTier },
        new Date('2099-01-01T12:00:00.000Z')).length;
    expect(filter('KCCC-BEHAVIOUR|v01', 'IC_OFFICER')).toBe(0);
    expect(filter(BEHAVIOUR_FRAMEWORK_V2_VERSION, 'Manager')).toBe(0);
    expect(getEmployeeBehaviourV2Suggestions(mapBehaviourLibraryV2Catalogue({ ...trusted, published: false }),
      'BHV-01', { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, roleTier: 'IC_OFFICER' },
      new Date('2099-01-01T12:00:00.000Z'))).toEqual([]);
    expect(getEmployeeBehaviourV2Suggestions(mapBehaviourLibraryV2Catalogue({ ...trusted, productionSafe: false }),
      'BHV-01', { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, roleTier: 'IC_OFFICER' },
      new Date('2099-01-01T12:00:00.000Z'))).toEqual([]);
    expect(() => mapBehaviourLibraryV2Catalogue({ ...trusted,
      frameworkVersion: 'KCCC-BEHAVIOUR|v03' })).toThrow(/version is not trusted/);
  });

  it('includes exact effective-date boundaries and excludes either side', () => {
    const records = mapBehaviourLibraryV2Catalogue(selectableFixture());
    const assignment = { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, roleTier: 'IC_OFFICER' };
    expect(getEmployeeBehaviourV2Suggestions(records, 'BHV-01', assignment,
      new Date('2098-12-31T23:59:59.000Z'))).toHaveLength(0);
    expect(getEmployeeBehaviourV2Suggestions(records, 'BHV-01', assignment,
      new Date('2099-01-01T00:00:00.000Z'))).toHaveLength(5);
    const ending = records.map((record, index) => index === 0 ? { ...record, effectiveTo: '2099-01-01' } : record);
    expect(getEmployeeBehaviourV2Suggestions(ending, 'BHV-01', assignment,
      new Date('2099-01-01T23:59:59.000Z'))).toHaveLength(5);
    expect(getEmployeeBehaviourV2Suggestions(ending, 'BHV-01', assignment,
      new Date('2099-01-02T00:00:00.000Z'))).toHaveLength(4);
    expect(getEmployeeBehaviourV2Suggestions(records, 'BHV-01', assignment, new Date('invalid'))).toEqual([]);
  });

  it('rejects missing, extra, malformed and conflicting source rows', () => {
    const source = selectableFixture();
    const row = source.records[0];
    const extra = { ...row, target: 3 };
    const missing = { ...row } as Partial<IBehaviourLibraryV2SourceRow>;
    delete missing.SuggestedEvidence;
    [extra, missing, { ...row, BehaviourObjectiveKey: 'BHV-01-L1-00' },
      { ...row, BehaviourKey: 'BHV-02' }, { ...row, EffectiveFrom: '2099-02-30' },
      { ...row, EffectiveTo: '2098-12-31' }].forEach(candidate => {
      expect(inspectBehaviourLibraryV2SourceRow(candidate).length).toBeGreaterThan(0);
    });
    expect(() => mapBehaviourLibraryV2Catalogue({ ...source,
      records: [...source.records, { ...row }] })).toThrow(/unique/);
    expect(() => mapBehaviourLibraryV2Catalogue({ ...source,
      records: source.records.map((candidate, index) => index === 1 ? { ...candidate,
        BehaviourObjectiveKey: row.BehaviourObjectiveKey } : candidate) })).toThrow(/key must exactly match|unique/);
    expect(mapBehaviourLibraryV2Catalogue({ ...source,
      records: [...source.records, { ...row, BehaviourObjectiveKey: 'BHV-01-L1-06', SortOrder: 6 }] }))
      .toHaveLength(76);
  });

  it('maps role only from the exact source code, never from role or objective wording', () => {
    const source = selectableFixture();
    const row = source.records[0];
    const misleading = { ...row, RoleLevelName: 'Synthetic senior leader title',
      DropdownLabel: `[Synthetic senior leader title] ${row.ObjectiveTitle}` };
    expect(mapBehaviourLibraryV2SourceRow(misleading, source).roleTier).toBe('IC_OFFICER');
    expect(() => mapBehaviourLibraryV2SourceRow(row, { ...source,
      published: 'true' as unknown as boolean })).toThrow(/explicit booleans/);
  });
});
