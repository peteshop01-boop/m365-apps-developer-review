import type {
  BehaviourKey,
  BehaviourRating,
  IBehaviourQuarterAssessment,
  ISelectedBehaviourObjective
} from '../models/BehaviourWorkplanModels';
import {
  BEHAVIOUR_RATING_SCALE,
  behaviourObjectiveKeyCanBeSaved,
  buildBehaviourAssessmentView,
  calculateBehaviourRating,
  createDefaultBehaviourWeights,
  getBehaviourRatingLabel,
  makeBehaviourObjectiveKey,
  validateBehaviourObjectives,
  validateBehaviourWeights
} from './BehaviourWorkplanPolicy';

describe('Behaviour objective library identity', () => {
  it('namespaces new keys but preserves a stable persisted key when Admin reassigns the banner', () => {
    expect(behaviourObjectiveKeyCanBeSaved({ behaviourObjectiveKey: 'BHV-01-OBJ-31', behaviourKey: 'BHV-01' })).toBe(true);
    expect(behaviourObjectiveKeyCanBeSaved({ behaviourObjectiveKey: 'BHV-01-OBJ-31', behaviourKey: 'BHV-02' })).toBe(false);
    expect(behaviourObjectiveKeyCanBeSaved({ id: 31, behaviourObjectiveKey: 'BHV-01-OBJ-31', behaviourKey: 'BHV-02' })).toBe(true);
  });

  it('generates a production Admin key accepted by the new-record boundary', () => {
    const behaviourObjectiveKey = makeBehaviourObjectiveKey('BHV-03', new Date('2026-08-21T09:08:07Z'), 'ABC123');
    expect(behaviourObjectiveKey).toBe('BHV-03-KCF-20260821090807-ABC123');
    expect(behaviourObjectiveKeyCanBeSaved({ behaviourObjectiveKey, behaviourKey: 'BHV-03' })).toBe(true);
  });
});

const makeObjective = (
  behaviourKey: BehaviourKey,
  weight = 20,
  source: 'Library' | 'Custom' = 'Library'
): ISelectedBehaviourObjective => ({
  behaviourKey,
  source,
  sourceObjectiveKey: source === 'Library' ? `${behaviourKey}-OBJ-01` : undefined,
  objectiveTitle: `${behaviourKey} objective`,
  objectiveDescription: 'A clear observable commitment.',
  measure: 'Completed commitments',
  unit: 'Count',
  evidenceDefinition: 'Delivery record and feedback.',
  quarterTargets: {
    q1Target: 'Complete one commitment.',
    q2Target: 'Complete one commitment.',
    q3Target: 'Complete one commitment.',
    q4Target: 'Complete one commitment.'
  },
  targetRating: 3,
  behaviourWeight: weight,
  activeInWorkplan: true
});

const allObjectives = (): ISelectedBehaviourObjective[] => [
  makeObjective('BHV-01'),
  makeObjective('BHV-02'),
  makeObjective('BHV-03'),
  makeObjective('BHV-04'),
  makeObjective('BHV-05')
];

describe('KCF Behaviour rating policy', () => {
  it('uses the fixed employee-facing four-point scale', () => {
    expect(BEHAVIOUR_RATING_SCALE).toEqual([
      { value: 4, label: 'Exceeds expectations' },
      { value: 3, label: 'Meets expectations' },
      { value: 2, label: 'Developing' },
      { value: 1, label: 'Not demonstrated / insufficient evidence' }
    ]);
    expect(getBehaviourRatingLabel(3)).toBe('Meets expectations');
  });

  it.each<[BehaviourRating, string]>([
    [4, 'Green'],
    [3, 'Green'],
    [2, 'Amber'],
    [1, 'Red']
  ])('rates actual %s against the default target 3 as %s', (actual, rag) => {
    expect(calculateBehaviourRating(actual, 3).rag).toBe(rag);
  });

  it.each<[BehaviourRating, string]>([
    [4, 'Green'],
    [3, 'Amber'],
    [2, 'Red'],
    [1, 'Red']
  ])('rates actual %s against an agreed target 4 as %s', (actual, rag) => {
    expect(calculateBehaviourRating(actual, 4).rag).toBe(rag);
  });

  it('normalises deterministically and caps the scored contribution at 100%', () => {
    expect(calculateBehaviourRating(4, 3)).toEqual(expect.objectContaining({
      rawNormalisedScore: 4 / 3,
      scoredContribution: 1
    }));
    expect(calculateBehaviourRating(2, 3)).toEqual(expect.objectContaining({
      rawNormalisedScore: 2 / 3,
      scoredContribution: 2 / 3
    }));
  });

  it('returns NotRated rather than fabricating a result for missing or invalid ratings', () => {
    expect(calculateBehaviourRating(undefined, 3)).toEqual({ rateable: false, rag: 'NotRated' });
    expect(calculateBehaviourRating(4, undefined)).toEqual({ rateable: false, rag: 'NotRated' });
    expect(calculateBehaviourRating(5, 3)).toEqual({ rateable: false, rag: 'NotRated' });
    expect(calculateBehaviourRating(3, 0)).toEqual({ rateable: false, rag: 'NotRated' });
  });

  it('keeps employee, manager and agreed final assessments distinct', () => {
    const assessment: IBehaviourQuarterAssessment = {
      behaviourKey: 'BHV-01',
      targetRating: 3,
      employeeSelfRating: 4,
      employeeEvidence: 'Employee evidence',
      managerRating: 2,
      managerEvidence: 'Manager evidence',
      finalRating: 3,
      finalCommentary: 'Agreed outcome'
    };

    const view = buildBehaviourAssessmentView(assessment);
    expect(view.employee).toEqual({ value: 4, label: 'Exceeds expectations' });
    expect(view.manager).toEqual({ value: 2, label: 'Developing' });
    expect(view.final).toEqual({ value: 3, label: 'Meets expectations' });
    expect(view.rag).toBe('Green');
    expect(assessment.employeeSelfRating).toBe(4);
    expect(assessment.managerRating).toBe(2);
  });

  it('does not assign authoritative RAG until a final rating exists', () => {
    const view = buildBehaviourAssessmentView({
      behaviourKey: 'BHV-02',
      targetRating: 3,
      employeeSelfRating: 4,
      managerRating: 2
    });
    expect(view.rag).toBe('NotRated');
    expect(view.employee.value).toBe(4);
    expect(view.manager.value).toBe(2);
    expect(view.final.value).toBeUndefined();
  });
});

describe('KCF Behaviour objective and weighting policy', () => {
  it('creates the approved default 20/20/20/20/20 weighting', () => {
    const weights = createDefaultBehaviourWeights();
    expect(weights).toHaveLength(5);
    expect(weights.map(row => row.weight)).toEqual([20, 20, 20, 20, 20]);
    expect(validateBehaviourWeights(weights)).toEqual({ valid: true, total: 100, errors: [] });
  });

  it('supports a controlled alternative weighting when all five remain and total 100%', () => {
    expect(validateBehaviourWeights([
      { behaviourKey: 'BHV-01', weight: 30 },
      { behaviourKey: 'BHV-02', weight: 25 },
      { behaviourKey: 'BHV-03', weight: 20 },
      { behaviourKey: 'BHV-04', weight: 15 },
      { behaviourKey: 'BHV-05', weight: 10 }
    ]).valid).toBe(true);
  });

  it('rejects missing, duplicate, invalid and non-100 weighting', () => {
    const result = validateBehaviourWeights([
      { behaviourKey: 'BHV-01', weight: 60 },
      { behaviourKey: 'BHV-01', weight: 50 },
      { behaviourKey: 'BHV-03', weight: -10 }
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Exactly five Behaviour weights are required.',
      'Each Behaviour may have only one weight.',
      'BHV-02 needs a Behaviour weight.',
      'BHV-03 weight must be from 0 to 100%.'
    ]));
  });

  it('accepts exactly one complete selected objective per Behaviour', () => {
    expect(validateBehaviourObjectives(allObjectives())).toEqual({ valid: true, total: 100, errors: [] });
  });

  it('rejects a concatenated controlled key in the annual Workplan policy', () => {
    const objectives = allObjectives();
    objectives[0].selectedSuggestionKeys = ['BHV-01-OBJ-01-OBJ-02'];
    expect(validateBehaviourObjectives(objectives).valid).toBe(false);
  });

  it('supports a complete employee-created objective without a library key', () => {
    const objectives = allObjectives();
    objectives[0] = makeObjective('BHV-01', 20, 'Custom');
    const result = validateBehaviourObjectives(objectives);
    expect(result.valid).toBe(true);
    expect(objectives[0].sourceObjectiveKey).toBeUndefined();
  });

  it('requires all five annual objectives and prevents duplicate banner selection', () => {
    const objectives = allObjectives();
    objectives[4] = makeObjective('BHV-04');
    const result = validateBehaviourObjectives(objectives);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'BHV-04 must have exactly one active objective.',
      'BHV-05 must have exactly one active objective.'
    ]));
  });

  it('validates custom wording, measure, evidence and all four quarter targets', () => {
    const objectives = allObjectives();
    objectives[0] = {
      ...makeObjective('BHV-01', 20, 'Custom'),
      objectiveDescription: '',
      measure: '',
      evidenceDefinition: '',
      quarterTargets: { q1Target: 'One', q2Target: '', q3Target: 'One', q4Target: '' }
    };
    const result = validateBehaviourObjectives(objectives);
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'BHV-01 needs a description.',
      'BHV-01 needs a measure.',
      'BHV-01 needs an evidence definition.',
      'BHV-01 needs Q2, Q4 targets.'
    ]));
  });

  it('requires a library source key for copied library objectives', () => {
    const objectives = allObjectives();
    objectives[0].sourceObjectiveKey = undefined;
    expect(validateBehaviourObjectives(objectives).errors).toContain('BHV-01 library selection needs its source objective key.');
  });
});
