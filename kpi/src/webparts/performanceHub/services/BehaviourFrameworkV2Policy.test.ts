import {
  BEHAVIOUR_FRAMEWORK_V2_VERSION,
  BEHAVIOUR_V2_ROLE_TIERS,
  BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourV2RoleTier,
  type IBehaviourFrameworkV2PublishedSet,
  type IBehaviourPersonAssignmentV2
} from '../models/BehaviourFrameworkV2Models';
import {
  BEHAVIOUR_V2_RATING_OPTIONS,
  applyBehaviourAssessmentPatchV2,
  assertNoBehaviourV2ScoringFields,
  createBehaviourAnnualSnapshotV2,
  createBehaviourPeriodSnapshotV2,
  getBehaviourV2RatingDisplay,
  inspectBehaviourPersonAssignmentV2,
  inspectPublishedBehaviourFrameworkV2,
  readBehaviourPlanningLevelsV1,
  suggestedBehaviourTargetLevel,
  validateBehaviourPlanningLevelsV1
} from './BehaviourFrameworkV2Policy';

const set = (): IBehaviourFrameworkV2PublishedSet => ({
  frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  published: true,
  immutable: true,
  ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS.map(option => ({ ...option })),
  values: BEHAVIOUR_V2_VALUE_IDS.map((valueId, index) => ({
    frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    valueId,
    title: `Synthetic Value ${index + 1}`,
    corporateValue: `Synthetic corporate value ${index + 1}`,
    descriptors: Object.fromEntries(BEHAVIOUR_V2_ROLE_TIERS.map(tier => [tier,
      `SYNTHETIC TEST ONLY ${valueId} ${tier}`])) as Record<BehaviourV2RoleTier, string>
  }))
});

const assignment = (cadence: 'Quarterly' | 'TwiceYearly' = 'Quarterly'): IBehaviourPersonAssignmentV2 => ({
  personKey: 'SYNTHETIC-PERSON-001',
  frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  roleTier: 'IC_OFFICER',
  cadence,
  periodKeys: cadence === 'Quarterly' ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['H1', 'H2']
});

describe('KCCC Behaviour framework v02 policy', () => {
  it('keeps categorical annual planning distinct from numeric assessment and older blank rows', () => {
    expect(suggestedBehaviourTargetLevel('Developing')).toBe('Effective');
    expect(suggestedBehaviourTargetLevel('Effective')).toBe('Exceptional');
    expect(suggestedBehaviourTargetLevel('Exceptional')).toBeUndefined();
    expect(readBehaviourPlanningLevelsV1({})).toBeUndefined();
    expect(validateBehaviourPlanningLevelsV1({ contractVersion: 'BHV-LEVELS|v01' })).toEqual({ contractVersion: 'BHV-LEVELS|v01' });
    expect(validateBehaviourPlanningLevelsV1({ contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Developing', targetLevel: 'Effective' }))
      .toEqual({ contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Developing', targetLevel: 'Effective' });
    expect(validateBehaviourPlanningLevelsV1({ contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Exceptional', targetLevel: 'Exceptional', targetJustification: 'Maintain the agreed level' })?.targetLevel).toBe('Exceptional');
    for (const value of [1, '1', 'Outstanding']) {
      expect(() => validateBehaviourPlanningLevelsV1({ contractVersion: 'BHV-LEVELS|v01', currentLevel: value })).toThrow(/labels/);
    }
    expect(() => validateBehaviourPlanningLevelsV1({ contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Effective', targetLevel: 'Developing' })).toThrow(/below/);
    expect(() => validateBehaviourPlanningLevelsV1({ contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Developing', targetLevel: 'Exceptional' })).toThrow(/justification/);
    expect(() => readBehaviourPlanningLevelsV1({ BehaviourCurrentLevelV2: 'Developing' })).toThrow(/contract/);
  });
  it('accepts exactly five stable Values, all tiers and the label-first 1–3 scale', () => {
    expect(inspectPublishedBehaviourFrameworkV2(set())).toEqual({ valid: true, errors: [] });
    expect(BEHAVIOUR_V2_RATING_OPTIONS.map(option => option.displayLabel)).toEqual([
      '1 Developing', '2 Effective', '3 Exceptional'
    ]);
    expect(getBehaviourV2RatingDisplay(undefined)).toBe('Not assessed');
  });

  it('fails closed for missing/duplicate Values, missing tier descriptors and a forged fourth rating', () => {
    const duplicate = set();
    duplicate.values = duplicate.values.map((value, index) => index === 4 ? { ...value, valueId: 'BHV-04' } : value);
    expect(inspectPublishedBehaviourFrameworkV2(duplicate).valid).toBe(false);
    const missingTier = set();
    missingTier.values[0].descriptors = { IC_OFFICER: 'one', PEOPLE_MANAGER: 'two' } as Record<BehaviourV2RoleTier, string>;
    expect(inspectPublishedBehaviourFrameworkV2(missingTier).valid).toBe(false);
    const fourth = set();
    (fourth.ratingOptions as Array<{ value: number; label: string; displayLabel: string }>).push({
      value: 4, label: 'Forged', displayLabel: '4 Forged'
    });
    expect(inspectPublishedBehaviourFrameworkV2(fourth).valid).toBe(false);
    const extendedLabel = set();
    (extendedLabel.ratingOptions[0] as unknown as Record<string, unknown>).target = true;
    expect(inspectPublishedBehaviourFrameworkV2(extendedLabel).valid).toBe(false);
  });

  it('represents Quarterly and TwiceYearly exactly without inferring a population', () => {
    expect(inspectBehaviourPersonAssignmentV2(assignment('Quarterly')).valid).toBe(true);
    expect(inspectBehaviourPersonAssignmentV2(assignment('TwiceYearly')).valid).toBe(true);
    const crossed = { ...assignment('Quarterly'), periodKeys: ['H1', 'H2'] as const };
    expect(inspectBehaviourPersonAssignmentV2(crossed).valid).toBe(false);
  });

  it('creates immutable annual and period snapshots that do not change with master wording', () => {
    const framework = set();
    const annual = createBehaviourAnnualSnapshotV2(framework, assignment(), 'BHV-01');
    const period = createBehaviourPeriodSnapshotV2(annual, 'Q1');
    (framework.values[0].descriptors as Record<BehaviourV2RoleTier, string>).IC_OFFICER = 'Changed current master wording';
    expect(annual.descriptor).toBe('SYNTHETIC TEST ONLY BHV-01 IC_OFFICER');
    expect(period.descriptor).toBe('SYNTHETIC TEST ONLY BHV-01 IC_OFFICER');
    expect(Object.isFrozen(annual)).toBe(true);
    expect(() => createBehaviourPeriodSnapshotV2(annual, 'H1')).toThrow('PERIOD_SNAPSHOT_INVALID');
    expect(() => createBehaviourPeriodSnapshotV2({ ...annual, ratingOptions: [] }, 'Q1'))
      .toThrow('PERIOD_SNAPSHOT_INVALID');
    expect(() => createBehaviourPeriodSnapshotV2({ ...annual, cadence: 'Monthly' as 'Quarterly' }, 'Q1'))
      .toThrow('PERIOD_SNAPSHOT_INVALID');
  });

  it('keeps employee, manager and final evidence/assessments independently owned', () => {
    const employee = applyBehaviourAssessmentPatchV2({}, {
      employeeEvidence: 'Employee example', employeeAssessment: 2
    }, 'Employee');
    const manager = applyBehaviourAssessmentPatchV2(employee, {
      managerEvidence: 'Manager observation', managerAssessment: 1
    }, 'Manager');
    const final = applyBehaviourAssessmentPatchV2(manager, {
      finalEvidence: 'Agreed evidence', finalAssessment: 3
    }, 'Final');
    expect(final).toEqual({ employeeEvidence: 'Employee example', employeeAssessment: 2,
      managerEvidence: 'Manager observation', managerAssessment: 1,
      finalEvidence: 'Agreed evidence', finalAssessment: 3 });
    expect(() => applyBehaviourAssessmentPatchV2(employee, { managerAssessment: 2 }, 'Employee'))
      .toThrow('ASSESSMENT_OWNER_INVALID');
    expect(() => applyBehaviourAssessmentPatchV2({}, { employeeAssessment: 4 as 3 }, 'Employee'))
      .toThrow('ASSESSMENT_INVALID');
  });

  it.each(['targetRating', 'behaviourItemWeight', 'average', 'calculatedRag', 'normalisedScore', 'peerScore'])(
    'rejects the forbidden v02 scoring field %s', field => {
      expect(() => assertNoBehaviourV2ScoringFields({ nested: { [field]: 1 } })).toThrow('PROTECTED_FIELD');
    }
  );
});
