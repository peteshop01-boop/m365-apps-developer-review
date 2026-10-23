import {
  BEHAVIOUR_FRAMEWORK_V2_VERSION,
  BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourV2ValueId
} from '../models/BehaviourFrameworkV2Models';
import type {
  IOverallDeliveryWeightConfiguration,
  IQuarterBehaviourCatalogueIdentityV1,
  IQuarterBehaviourCommitmentSnapshotV1,
  IQuarterPerformanceReadProjection,
  IQuarterReview,
  IQuarterReviewItem
} from '../models/QuarterlyModels';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { consumeQuarterBehaviourCatalogue } from './QuarterBehaviourCatalogueConsumer';
import { composeQuarterYearEndDecisionInput } from './QuarterDecisionComposition';
import {
  calculateQuarterOverallDelivery,
  DEFAULT_OVERALL_DELIVERY_WEIGHTS
} from './QuarterOverallDelivery';
import {
  buildQuarterPerformanceReadProjection,
  quarterProjectionIdentityFor,
  type IQuarterPerformanceReadSource
} from './QuarterPerformanceReadProjection';

const catalogueIdentity: IQuarterBehaviourCatalogueIdentityV1 = {
  decisionReference: 'KCF-KPI-Sponsor-BEH-V1-001',
  catalogueVersion: '2026.1',
  contentHash: 'a'.repeat(64),
  sourceReference: 'synthetic-governed-catalogue.json',
  effectiveFrom: '2026-04-01T00:00:00.000Z'
};

const reviewFor = (): IQuarterReview => ({
  id: 1,
  etag: '"3"',
  quarterReviewKey: 'person-1|2026|Q4',
  workplanKey: 'person-1|2026',
  personKey: 'person-1',
  employeeDisplayName: 'Person One',
  employeeEmail: 'person-1@example.invalid',
  performanceYear: 2026,
  quarter: 'Q4',
  managerPersonKey: 'manager-1',
  managerDisplayName: 'Manager One',
  managerEmail: 'manager-1@example.invalid',
  coreCategoryWeightSnapshot: 70,
  personalCategoryWeightSnapshot: 30,
  state: 'Locked',
  accessState: 'ReadOnly',
  transitionStatus: 'Ready',
  managerDecisionComment: 'Synthetic manager decision input.',
  approvedAt: '2026-10-01T09:00:00.000Z',
  lockedAt: '2026-10-01T09:01:00.000Z',
  rowVersionToken: 5
});

const baseItem = (review: IQuarterReview, itemType: IQuarterReviewItem['itemType'], key: string): IQuarterReviewItem => ({
  id: 1,
  etag: '"2"',
  quarterReviewItemKey: `${review.quarterReviewKey}|${key}`,
  quarterReviewKey: review.quarterReviewKey,
  workplanItemKey: key,
  workplanKey: review.workplanKey,
  personKey: review.personKey,
  performanceYear: review.performanceYear,
  quarter: review.quarter,
  itemType,
  reportingStream: itemType === 'CoreGold' ? 'CoreGold' : itemType === 'LocalPersonal' ? 'Impact' : 'Behaviour',
  wording: `Synthetic ${key}`,
  calculatedRag: itemType === 'Behaviour' ? 'NotRated' : 'Green',
  evidenceCount: 0,
  managerApproved: true,
  locked: true
});

const coreItem = (review: IQuarterReview, actual = 80): IQuarterReviewItem => ({
  ...baseItem(review, 'CoreGold', 'core-1'),
  kpiId: 'SO1-001',
  metricType: 'Count',
  scoringDirection: 'HigherIsBetter',
  quarterTargetValue: 100,
  employeeActualValue: actual,
  progressPct: actual,
  scoredProgressPct: actual,
  calculatedRag: actual >= 90 ? 'Green' : actual >= 50 ? 'Amber' : 'Red',
  calculationRuleVersion: 'KCF-RAG-001',
  finalApprovedRag: actual >= 90 ? 'Green' : actual >= 50 ? 'Amber' : 'Red',
  contributionWeightSnapshot: 100,
  workplanItemWeightSnapshot: 100
});

const impactItem = (review: IQuarterReview): IQuarterReviewItem => ({
  ...baseItem(review, 'LocalPersonal', 'impact-1'),
  wording: 'Synthetic Impact result',
  itemDescription: 'Improve a controlled outcome.',
  measure: 'Completed cases',
  unitLabel: 'cases',
  metricType: 'Count',
  scoringDirection: 'HigherIsBetter',
  yearEndTargetValueSnapshot: 400,
  quarterTargetValue: 100,
  employeeActualValue: 100,
  progressPct: 100,
  scoredProgressPct: 100,
  calculatedRag: 'Green',
  calculationRuleVersion: 'KCF-RAG-001',
  finalApprovedRag: 'Green',
  workplanItemWeightSnapshot: 100,
  impactAnnualDefinitionSnapshot: {
    sourceWorkplanItemKey: 'impact-1',
    wording: 'Synthetic Impact result',
    intendedOutcome: 'Improve a controlled outcome.',
    measure: 'Completed cases',
    unitLabel: 'cases',
    metricType: 'Count',
    scoringDirection: 'HigherIsBetter',
    yearEndTargetValue: 400,
    quarterTargetValue: 100,
    workplanItemWeight: 100,
    classification: {
      businessContributionArea: { key: 'area-1', label: 'Synthetic area', source: 'TEST-GOVERNED' }
    }
  }
});

const selectionFor = (
  index: number,
  headlineId: BehaviourV2ValueId,
  identity: IQuarterBehaviourCatalogueIdentityV1 = catalogueIdentity
): IQuarterBehaviourCommitmentSnapshotV1 => ({
  selectionKey: `selection-${index}`,
  catalogueIdentity: identity,
  headlineId,
  roleTier: index % 3 === 1 ? 'IC_OFFICER' : index % 3 === 2 ? 'PEOPLE_MANAGER' : 'SENIOR_LEADER',
  focusAreaKey: `focus-${index}`,
  focusAreaTitle: `Synthetic focus ${index}`,
  selectionPath: index % 2 ? 'SuggestedTarget' : 'OwnTarget',
  suggestedTargetKey: index % 2 ? `suggestion-${index}` : undefined,
  targetTextSnapshot: `Synthetic stored target ${index}`,
  myCommitment: `My measurable commitment ${index}`,
  howWillWeKnow: `Observable evidence ${index}`,
  managerDecision: 'Agreed',
  managerDecisionByPersonKey: 'manager-1',
  managerDecisionAt: '2026-05-01T09:00:00.000Z'
});

const behaviourItem = (
  review: IQuarterReview,
  headlineId: BehaviourV2ValueId,
  index: number,
  commitments: IQuarterBehaviourCommitmentSnapshotV1[]
): IQuarterReviewItem => ({
  ...baseItem(review, 'Behaviour', `behaviour-${index + 1}`),
  behaviourId: headlineId,
  behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  quarterTargetText: `Stored commitment ${index + 1}`,
  behaviourSnapshotV2: {
    frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    valueId: headlineId,
    valueTitle: `Synthetic headline ${index + 1}`,
    corporateValue: `Synthetic corporate value ${index + 1}`,
    roleTier: 'IC_OFFICER',
    descriptor: `Synthetic descriptor ${index + 1}`,
    cadence: 'Quarterly',
    periodKeys: ['Q1', 'Q2', 'Q3', 'Q4'],
    ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS,
    period: 'Q4'
  },
  employeeBehaviourEvidenceV2: `Employee evidence ${index + 1}`,
  employeeBehaviourAssessmentV2: 1,
  managerBehaviourEvidenceV2: `Manager evidence ${index + 1}`,
  managerBehaviourAssessmentV2: 2,
  finalBehaviourEvidenceV2: `Final evidence ${index + 1}`,
  finalBehaviourAssessmentV2: 3,
  behaviourCommitmentSnapshotsV1: commitments
});

const sourceFor = (selectionCount = 3, coreActual = 80): IQuarterPerformanceReadSource => {
  const review = reviewFor();
  let remaining = selectionCount;
  let selectionIndex = 1;
  const behaviours = BEHAVIOUR_V2_VALUE_IDS.map((headlineId, index) => {
    const commitments: IQuarterBehaviourCommitmentSnapshotV1[] = [];
    while (remaining > 0 && (commitments.length === 0 || index === BEHAVIOUR_V2_VALUE_IDS.length - 1)) {
      commitments.push(selectionFor(selectionIndex, headlineId));
      selectionIndex += 1;
      remaining -= 1;
      if (index !== BEHAVIOUR_V2_VALUE_IDS.length - 1) break;
    }
    return behaviourItem(review, headlineId, index, commitments);
  });
  return { review, items: [coreItem(review, coreActual), impactItem(review), ...behaviours], evidence: [] };
};

const projectionFor = (selectionCount = 3, coreActual = 80): Readonly<IQuarterPerformanceReadProjection> =>
  buildQuarterPerformanceReadProjection(2026, [sourceFor(selectionCount, coreActual)]);

const withObjectPrototypeProperty = <T>(
  key: string,
  descriptor: PropertyDescriptor,
  action: () => T
): T => {
  const objectPrototype = Object.getPrototypeOf({}) as object;
  const original = Object.getOwnPropertyDescriptor(objectPrototype, key);
  if (!Reflect.defineProperty(objectPrototype, key, descriptor)) {
    throw new Error(`Test setup could not define Object.prototype.${key}.`);
  }
  let result!: T;
  try {
    result = action();
  } finally {
    if (original) Reflect.defineProperty(objectPrototype, key, original);
    else Reflect.deleteProperty(objectPrototype, key);
  }
  if (!original && Object.prototype.hasOwnProperty.call(objectPrototype, key)) {
    throw new Error(`Test cleanup did not remove Object.prototype.${key}.`);
  }
  return result;
};

const pollutedManagerFlow = (
  key: 'managerDecisionComment' | 'managerComment' | 'recovery' | 'managerOverride',
  descriptor: PropertyDescriptor
): Readonly<{
  projection: Readonly<IQuarterPerformanceReadProjection>;
  composed: ReturnType<typeof composeQuarterYearEndDecisionInput>;
}> => {
  const source = sourceFor();
  if (key === 'managerDecisionComment') delete source.review.managerDecisionComment;
  return withObjectPrototypeProperty(key, descriptor, () => {
    const projection = buildQuarterPerformanceReadProjection(2026, [source]);
    const overall = calculateQuarterOverallDelivery(projection);
    const behaviours = consumeQuarterBehaviourCatalogue(projection);
    const composed = composeQuarterYearEndDecisionInput(projection, overall, behaviours);
    return { projection, composed };
  });
};

describe('quarter security-bound Overall, Behaviour and composition', () => {
  it('issues deterministic frozen projection capabilities while exact Behaviour changes alter identity only', () => {
    const first = projectionFor();
    const repeated = projectionFor();
    const changedSource = sourceFor();
    changedSource.items[2] = {
      ...changedSource.items[2],
      finalBehaviourAssessmentV2: 1,
      finalBehaviourEvidenceV2: 'Changed exact final evidence.'
    };
    const changed = buildQuarterPerformanceReadProjection(2026, [changedSource]);
    expect(first.projectionIdentity).toMatch(/^[A-F0-9]{64}$/);
    expect(repeated.projectionIdentity).toBe(first.projectionIdentity);
    expect(changed.projectionIdentity).not.toBe(first.projectionIdentity);
    expect(quarterProjectionIdentityFor(first)).toBe(first.projectionIdentity);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.managerCompositionInputs[0])).toBe(true);
  });

  it('binds Core and Impact to exact KCF-RAG-001 and KCF-AGG-001 outputs and applies PD-04', () => {
    const projection = projectionFor();
    const result = calculateQuarterOverallDelivery(projection);
    expect(result.core).toEqual(expect.objectContaining({
      score: 80,
      authoritativeRag: 'Amber',
      weight: 70,
      weightedContribution: 56,
      scoreCalculationVersion: 'KCF-RAG-001',
      aggregationCalculationVersion: 'KCF-AGG-001'
    }));
    expect(result.impact).toEqual(expect.objectContaining({
      score: 100,
      authoritativeRag: 'Green',
      weight: 30,
      weightedContribution: 30,
      scoreCalculationVersion: 'KCF-RAG-001',
      aggregationCalculationVersion: 'KCF-AGG-001'
    }));
    expect(result).toEqual(expect.objectContaining({
      ready: true,
      overallScore: 86,
      coreProtectionState: 'Acceptable',
      coreProtectionApplied: false,
      exceptionalOutcomePermitted: true
    }));
    expect(result.errors).toEqual([]);

    const customWeights: IOverallDeliveryWeightConfiguration = {
      configurationKey: 'config-2026', configurationVersion: '2', coreWeight: 60, impactWeight: 40,
      sourceReference: 'KCF-KPI-Sponsor-PD-01'
    };
    const custom = calculateQuarterOverallDelivery(projection, customWeights);
    expect(custom.core?.weightedContribution).toBe(48);
    expect(custom.impact?.weightedContribution).toBe(40);
    expect(custom.ready).toBe(true);
    expect(custom.overallScore).toBe(88);
  });

  it('maps authoritative Core Red to Poor, Amber/Green to Acceptable and NotRated to NotRated', () => {
    const red = calculateQuarterOverallDelivery(projectionFor(3, 40));
    expect(red).toEqual(expect.objectContaining({
      ready: true,
      overallScore: 58,
      coreProtectionState: 'Poor',
      coreProtectionApplied: true,
      exceptionalOutcomePermitted: false
    }));
    expect(red.core?.authoritativeRag).toBe('Red');

    const amber = calculateQuarterOverallDelivery(projectionFor(3, 80));
    expect(amber.core?.authoritativeRag).toBe('Amber');
    expect(amber.coreProtectionState).toBe('Acceptable');
    expect(amber.exceptionalOutcomePermitted).toBe(true);

    const green = calculateQuarterOverallDelivery(projectionFor(3, 95));
    expect(green.core?.authoritativeRag).toBe('Green');
    expect(green.coreProtectionState).toBe('Acceptable');
    expect(green.exceptionalOutcomePermitted).toBe(true);

    const notRatedSource = sourceFor();
    notRatedSource.items[0] = {
      ...notRatedSource.items[0],
      scoringDirection: 'TBC',
      progressPct: undefined,
      scoredProgressPct: undefined,
      calculatedRag: 'NotRated',
      calculationRuleVersion: 'KCF-RAG-001',
      finalApprovedRag: 'NotRated'
    };
    const notRated = calculateQuarterOverallDelivery(
      buildQuarterPerformanceReadProjection(2026, [notRatedSource])
    );
    expect(notRated).toEqual(expect.objectContaining({
      ready: false,
      overallScore: undefined,
      coreProtectionState: 'NotRated',
      coreProtectionApplied: false,
      exceptionalOutcomePermitted: false
    }));
    expect(notRated.errors.join(' ')).toMatch(/NotRated/);
  });

  it('rejects caller-selected score/version/protection inputs and detects stored score substitution', () => {
    const projection = projectionFor();
    const legacyCall = calculateQuarterOverallDelivery as unknown as (...args: unknown[]) => unknown;
    expect(() => legacyCall(projection, {
      stream: 'CoreGold', state: 'Rated', score: 99, calculationVersion: 'ATTACKER', sourceResultKeys: []
    }, {
      stream: 'Impact', state: 'Rated', score: 99, calculationVersion: 'ATTACKER', sourceResultKeys: []
    }, 'Acceptable')).toThrow(/invalid exact shape/);
    const ignoredLegacyAuthority = legacyCall(
      projection, DEFAULT_OVERALL_DELIVERY_WEIGHTS, { score: 99 }, { score: 99 }, 'Acceptable'
    ) as ReturnType<typeof calculateQuarterOverallDelivery>;
    expect(ignoredLegacyAuthority.core?.score).toBe(80);
    expect(ignoredLegacyAuthority.coreProtectionState).toBe('Acceptable');
    expect(ignoredLegacyAuthority.exceptionalOutcomePermitted).toBe(true);

    const source = sourceFor();
    source.items[0] = { ...source.items[0], scoredProgressPct: 99, calculationRuleVersion: 'ATTACKER' };
    const substituted = calculateQuarterOverallDelivery(buildQuarterPerformanceReadProjection(2026, [source]));
    expect(substituted.core?.score).toBe(80);
    expect(substituted.errors.join(' ')).toMatch(/does not match its exact KCF-RAG-001 governed output/);
  });

  it('keeps Behaviour content outside governed Delivery arithmetic', () => {
    const standard = projectionFor();
    const changedSource = sourceFor();
    changedSource.items[2] = {
      ...changedSource.items[2],
      finalBehaviourAssessmentV2: 1,
      finalBehaviourEvidenceV2: 'Changed Behaviour evidence only.'
    };
    const changed = buildQuarterPerformanceReadProjection(2026, [changedSource]);
    const standardOverall = calculateQuarterOverallDelivery(standard);
    const changedOverall = calculateQuarterOverallDelivery(changed);
    expect(changedOverall.core).toEqual(standardOverall.core);
    expect(changedOverall.impact).toEqual(standardOverall.impact);
    expect(changedOverall.projectionIdentity).not.toBe(standardOverall.projectionIdentity);
    expect(changedOverall.exceptionalOutcomePermitted).toBe(true);
  });

  it('materialises exact weight configuration without getter execution and rejects extras or unstable Proxy descriptors', () => {
    const projection = projectionFor();
    let getterExecutions = 0;
    const accessor = { ...DEFAULT_OVERALL_DELIVERY_WEIGHTS } as Record<string, unknown>;
    Object.defineProperty(accessor, 'coreWeight', {
      enumerable: true,
      configurable: true,
      get() { getterExecutions += 1; return 70; }
    });
    expect(() => calculateQuarterOverallDelivery(
      projection, accessor as unknown as IOverallDeliveryWeightConfiguration
    )).toThrow(/rejects accessors/);
    expect(getterExecutions).toBe(0);
    expect(() => calculateQuarterOverallDelivery(projection, {
      ...DEFAULT_OVERALL_DELIVERY_WEIGHTS, unauthorised: true
    } as unknown as IOverallDeliveryWeightConfiguration)).toThrow(/extra keys/);

    let descriptorReads = 0;
    const unstable = new Proxy({ ...DEFAULT_OVERALL_DELIVERY_WEIGHTS }, {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property)!;
        if (property === 'coreWeight') {
          descriptorReads += 1;
          return { ...descriptor, value: descriptorReads === 1 ? 70 : 60 };
        }
        return descriptor;
      }
    });
    expect(() => calculateQuarterOverallDelivery(projection, unstable)).toThrow(/unstable object or Proxy surface/);
  });

  it('derives the complete Behaviour result from one issued projection and preserves PD-03 semantics', () => {
    const projection = projectionFor(3);
    const result = consumeQuarterBehaviourCatalogue(projection);
    expect(result.catalogueIdentity).toEqual(catalogueIdentity);
    expect(result.headlineIds).toEqual(BEHAVIOUR_V2_VALUE_IDS);
    expect(result.roleTiers).toEqual(['IC_OFFICER', 'PEOPLE_MANAGER', 'SENIOR_LEADER']);
    expect(result.selectionGuidance).toBe('WithinGuidance');
    expect(result.selections).toHaveLength(3);
    expect(result.ratings[0]).toEqual(expect.objectContaining({
      employeeRating: 'Developing', managerRating: 'Effective', finalRating: 'Exceptional',
      finalEvidence: 'Final evidence 1'
    }));
    expect(result.ratings[0]).not.toHaveProperty('score');
    expect(consumeQuarterBehaviourCatalogue(projectionFor(2)).selectionGuidance).toBe('BelowGuidance');
    expect(consumeQuarterBehaviourCatalogue(projectionFor(6)).selectionGuidance).toBe('AboveGuidance');
    expect(Object.isFrozen(result.selections[0].catalogueIdentity)).toBe(true);
  });

  it('rejects hand-built/copied projections and copied identities before hostile accessors or Proxy reads', () => {
    const issued = projectionFor();
    const copied = { ...issued } as IQuarterPerformanceReadProjection;
    expect(() => quarterProjectionIdentityFor(copied)).toThrow(/internally issued/);
    expect(() => calculateQuarterOverallDelivery(copied)).toThrow(/internally issued/);
    expect(() => consumeQuarterBehaviourCatalogue(copied)).toThrow(/internally issued/);

    let getterExecutions = 0;
    const accessor = { ...issued } as Record<string, unknown>;
    Object.defineProperty(accessor, 'performanceYear', {
      enumerable: true,
      configurable: true,
      get() { getterExecutions += 1; return 2026; }
    });
    expect(() => calculateQuarterOverallDelivery(
      accessor as unknown as IQuarterPerformanceReadProjection
    )).toThrow(/internally issued/);
    expect(getterExecutions).toBe(0);

    let proxyReads = 0;
    const proxied = new Proxy(issued, {
      get(target, property, receiver) {
        proxyReads += 1;
        return Reflect.get(target, property, receiver);
      }
    });
    expect(() => consumeQuarterBehaviourCatalogue(proxied)).toThrow(/internally issued/);
    expect(proxyReads).toBe(0);
  });

  it('rejects forged Overall and Behaviour outputs and crossed genuine outputs by module-private capability', () => {
    const projectionA = projectionFor(3, 80);
    const projectionB = projectionFor(3, 99);
    const overallA = calculateQuarterOverallDelivery(projectionA);
    const overallB = calculateQuarterOverallDelivery(projectionB);
    const behavioursA = consumeQuarterBehaviourCatalogue(projectionA);
    const behavioursB = consumeQuarterBehaviourCatalogue(projectionB);

    expect(() => composeQuarterYearEndDecisionInput(projectionA, {
      ...overallA,
      ready: true,
      overallScore: 999,
      exceptionalOutcomePermitted: true
    }, behavioursA)).toThrow(/exact internally issued Overall/);
    expect(() => composeQuarterYearEndDecisionInput(projectionA, overallA, {
      ...behavioursA,
      ratings: behavioursA.ratings.map((rating, index) => index === 0
        ? { ...rating, finalEvidence: 'FORGED' } : rating)
    })).toThrow(/exact internally issued Behaviour/);
    expect(() => composeQuarterYearEndDecisionInput(projectionA, overallB, behavioursA))
      .toThrow(/exact internally issued Overall/);
    expect(() => composeQuarterYearEndDecisionInput(projectionA, overallA, behavioursB))
      .toThrow(/exact internally issued Behaviour/);
    const composed = composeQuarterYearEndDecisionInput(projectionA, overallA, behavioursA);
    expect(composed).toEqual(expect.objectContaining({
      compositionVersion: 'KCF-BT07-DECISION-001',
      projectionIdentity: projectionA.projectionIdentity,
      performanceYear: 2026
    }));
    expect(composed).not.toHaveProperty('finalOutcome');
    expect(composed.behaviours.ratings[0]).not.toHaveProperty('calculatedRag');
    expect(Object.isFrozen(composed)).toBe(true);
  });

  it('rejects sparse, extra-key, symbol, custom-prototype and accessor source shapes before projection effects', () => {
    const sparse = sourceFor();
    sparse.items = new Array<IQuarterReviewItem>(sparse.items.length);
    expect(() => buildQuarterPerformanceReadProjection(2026, [sparse])).toThrow(/sparse arrays/);

    const extraManager = sourceFor();
    extraManager.review = {
      ...extraManager.review,
      unauthorisedFinalOutcome: 'Exceptional'
    } as unknown as IQuarterReview;
    expect(() => buildQuarterPerformanceReadProjection(2026, [extraManager])).toThrow(/extra keys/);

    const extraItem = sourceFor();
    extraItem.items[0] = { ...extraItem.items[0], extra: true } as unknown as IQuarterReviewItem;
    expect(() => buildQuarterPerformanceReadProjection(2026, [extraItem])).toThrow(/extra keys/);

    const customPrototype = sourceFor();
    customPrototype.items[0] = Object.assign(Object.create({ inherited: true }), customPrototype.items[0]);
    expect(() => buildQuarterPerformanceReadProjection(2026, [customPrototype])).toThrow(/custom object prototypes/);

    const symbolArray = sourceFor();
    (symbolArray.items as unknown as Record<symbol, unknown>)[Symbol('unauthorised')] = true;
    expect(() => buildQuarterPerformanceReadProjection(2026, [symbolArray])).toThrow(/symbol keys/);

    const accessorSource = sourceFor();
    let getterExecutions = 0;
    Object.defineProperty(accessorSource.review, 'performanceYear', {
      enumerable: true,
      configurable: true,
      get() { getterExecutions += 1; return 2026; }
    });
    expect(() => buildQuarterPerformanceReadProjection(2026, [accessorSource])).toThrow(/rejects accessors/);
    expect(getterExecutions).toBe(0);
  });

  it('rejects unstable descriptor Proxies and neutralises get-time substitution by using one frozen snapshot', () => {
    const unstableSource = sourceFor();
    let descriptorReads = 0;
    unstableSource.review = new Proxy(unstableSource.review, {
      getOwnPropertyDescriptor(target, property) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, property)!;
        if (property === 'performanceYear') {
          descriptorReads += 1;
          return { ...descriptor, value: descriptorReads === 1 ? 2026 : 2027 };
        }
        return descriptor;
      }
    });
    expect(() => buildQuarterPerformanceReadProjection(2026, [unstableSource]))
      .toThrow(/unstable object or Proxy surface/);

    const switchingSource = sourceFor();
    let getReads = 0;
    switchingSource.review = new Proxy(switchingSource.review, {
      get(target, property, receiver) {
        getReads += 1;
        if (property === 'managerDecisionComment') return 'POST-VALIDATION SUBSTITUTION';
        return Reflect.get(target, property, receiver);
      }
    });
    const projection = buildQuarterPerformanceReadProjection(2026, [switchingSource]);
    expect(getReads).toBe(0);
    expect(projection.managerCompositionInputs[0].managerCommentary).toBe('Synthetic manager decision input.');

    switchingSource.review.managerDecisionComment = 'MUTATED AFTER VALIDATION';
    switchingSource.items[0].employeeActualValue = 999;
    expect(projection.managerCompositionInputs[0].managerCommentary).toBe('Synthetic manager decision input.');
    expect(projection.core.results[0].item.employeeActualValue).toBe(80);
  });

  it('blocks the exact SEC-R043-F01 inherited non-enumerable manager-comment reproduction', () => {
    const injected = 'GLOBAL-PROTOTYPE-MANAGER-AUTHORITY';
    const { projection, composed } = pollutedManagerFlow('managerComment', {
      value: injected,
      enumerable: false,
      configurable: true,
      writable: true
    });
    expect(projection.managerCompositionInputs[0].itemActions
      .filter(action => action.managerComment === injected)).toHaveLength(0);
    expect(composed.managerCompositionInputs[0].itemActions
      .filter(action => action.managerComment === injected)).toHaveLength(0);
    expect(Object.getPrototypeOf(projection)).toBeNull();
    expect(Object.getPrototypeOf(composed)).toBeNull();
  });

  it('ignores inherited data and accessors for manager commentary, recovery and override through composition', () => {
    const cases: ReadonlyArray<Readonly<{
      key: 'managerDecisionComment' | 'managerComment' | 'recovery' | 'managerOverride';
      injected: unknown;
    }>> = [
      { key: 'managerDecisionComment', injected: 'INHERITED MANAGER COMMENTARY' },
      { key: 'managerComment', injected: 'INHERITED ITEM MANAGER COMMENT' },
      { key: 'recovery', injected: { route: 'Recover', action: 'INHERITED RECOVERY' } },
      { key: 'managerOverride', injected: { rag: 'Red', reason: 'INHERITED OVERRIDE' } }
    ];
    cases.forEach(({ key, injected }) => {
      const expectedCommentary = key === 'managerDecisionComment' ? undefined : 'Synthetic manager decision input.';
      const dataResult = pollutedManagerFlow(key, {
        value: injected,
        enumerable: false,
        configurable: true,
        writable: true
      });
      expect(dataResult.projection.managerCompositionInputs[0].managerCommentary).toBe(expectedCommentary);
      expect(dataResult.projection.managerCompositionInputs[0].itemActions).toHaveLength(0);
      expect(dataResult.composed.managerCompositionInputs[0].managerCommentary).toBe(expectedCommentary);
      expect(dataResult.composed.managerCompositionInputs[0].itemActions).toHaveLength(0);

      let getterExecutions = 0;
      const accessorResult = pollutedManagerFlow(key, {
        get() {
          getterExecutions += 1;
          return injected;
        },
        enumerable: false,
        configurable: true
      });
      expect(getterExecutions).toBe(0);
      expect(accessorResult.projection.managerCompositionInputs[0].managerCommentary).toBe(expectedCommentary);
      expect(accessorResult.projection.managerCompositionInputs[0].itemActions).toHaveLength(0);
      expect(accessorResult.composed.managerCompositionInputs[0].managerCommentary).toBe(expectedCommentary);
      expect(accessorResult.composed.managerCompositionInputs[0].itemActions).toHaveLength(0);
    });
  });

  it('rejects mixed catalogue, invalid focus and unapproved Behaviour rating content on issued projections', () => {
    const mixed = sourceFor();
    const otherIdentity = { ...catalogueIdentity, catalogueVersion: '2026.2', contentHash: 'b'.repeat(64) };
    mixed.items[3] = {
      ...mixed.items[3],
      behaviourCommitmentSnapshotsV1: [selectionFor(2, 'BHV-02', otherIdentity)]
    };
    expect(() => consumeQuarterBehaviourCatalogue(buildQuarterPerformanceReadProjection(2026, [mixed])))
      .toThrow(/mixed governed catalogue identities/);

    const invalidFocus = sourceFor();
    invalidFocus.items[2] = {
      ...invalidFocus.items[2],
      behaviourCommitmentSnapshotsV1: [{
        ...invalidFocus.items[2].behaviourCommitmentSnapshotsV1![0], focusAreaKey: ''
      }]
    };
    expect(() => consumeQuarterBehaviourCatalogue(buildQuarterPerformanceReadProjection(2026, [invalidFocus])))
      .toThrow(/focus area/);

    const invalidRating = sourceFor();
    invalidRating.items[2] = { ...invalidRating.items[2], finalBehaviourAssessmentV2: 4 as 1 };
    expect(() => buildQuarterPerformanceReadProjection(2026, [invalidRating]))
      .toThrow(/Developing, Effective or Exceptional/);
  });
});


describe('issued annual Target decision provenance', () => {
  it('preserves fixed annual fields through changing quarter ratings without changing Delivery arithmetic', () => {
    const compose = (rating: 1 | 3): Readonly<{
      projection: Readonly<IQuarterPerformanceReadProjection>;
      behaviour: ReturnType<typeof consumeQuarterBehaviourCatalogue>;
      overall: ReturnType<typeof calculateQuarterOverallDelivery>;
      decision: ReturnType<typeof composeQuarterYearEndDecisionInput>;
    }> => {
      const source = sourceFor();
      source.review.workplanApprovalCorrelationKey = 'annual-approved';
      source.items = source.items.map(item => item.itemType !== 'Behaviour' ? item : ({ ...item,
        behaviourAnnualCurrentLevelV2: 'Developing', behaviourAnnualTargetLevelV2: 'Effective',
        behaviourAnnualTargetJustificationV2: 'Annual approved Target.',
        behaviourAnnualTargetSourceWorkplanItemKeyV2: item.workplanItemKey,
        behaviourAnnualTargetSourceEtagV2: '"annual-1"', behaviourAnnualTargetSourceWorkplanVersionV2: 1,
        behaviourAnnualTargetSourceApprovalKeyV2: 'annual-approved',
        employeeBehaviourAssessmentV2: rating, managerBehaviourAssessmentV2: rating, finalBehaviourAssessmentV2: rating }));
      const projection = buildQuarterPerformanceReadProjection(2026, [source]);
      const behaviour = consumeQuarterBehaviourCatalogue(projection);
      const overall = calculateQuarterOverallDelivery(projection);
      const decision = composeQuarterYearEndDecisionInput(projection, overall, behaviour);
      return { projection, behaviour, overall, decision };
    };
    const first = compose(1);
    const changed = compose(3);
    const annual = {
      behaviourAnnualCurrentLevelV2: 'Developing', behaviourAnnualTargetLevelV2: 'Effective',
      behaviourAnnualTargetJustificationV2: 'Annual approved Target.',
      behaviourAnnualTargetSourceEtagV2: '"annual-1"', behaviourAnnualTargetSourceWorkplanVersionV2: 1,
      behaviourAnnualTargetSourceApprovalKeyV2: 'annual-approved'
    };
    [first, changed].forEach(result => {
      expect(result.behaviour.ratings).toHaveLength(5);
      result.behaviour.ratings.forEach((row, index) => {
        expect(row).toEqual(expect.objectContaining(annual));
        expect(row.behaviourAnnualTargetSourceWorkplanItemKeyV2)
          .toBe(result.projection.behaviourObservations[index].behaviourAnnualTargetSourceWorkplanItemKeyV2);
        expect(Object.isFrozen(row)).toBe(true);
      });
      expect(result.decision.behaviours).toEqual(result.behaviour);
    });
    expect(first.behaviour.ratings[0].finalRating).toBe('Developing');
    expect(changed.behaviour.ratings[0].finalRating).toBe('Exceptional');
    expect(first.overall.overallScore).toEqual(changed.overall.overallScore);
    expect(first.overall.core).toEqual(changed.overall.core);
    expect(first.overall.impact).toEqual(changed.overall.impact);
  });
});
