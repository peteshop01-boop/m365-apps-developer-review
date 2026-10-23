import type { IAnnualWorkplan, IBehaviourWorkplanItem, IProductionPerson } from '../models/ProductionModels';
import type { IQuarterLifecycle } from '../models/QuarterlyModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_PLANNING_LEVELS_VERSION,
  BEHAVIOUR_V2_VALUE_IDS } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, encodeBehaviourSelectionSnapshotsV2 }
  from './BehaviourSelectionSnapshotsV2';
import { buildQuarterPerformanceReadProjection } from './QuarterPerformanceReadProjection';
import { buildQuarterReviewDraft } from './QuarterReviewFactory';
import type { IQuarterDraftSource } from './QuarterReviewFactory';
import { assertAuthoritativeCoreSnapshot } from './QuarterReviewItemPersistence';

const employee: IProductionPerson = { id: 1, personKey: 'employee', displayName: 'Employee', email: 'person012@example.invalid', appRoles: ['Employee'], active: true };
const manager: IProductionPerson = { id: 2, personKey: 'manager', displayName: 'Manager', email: 'person013@example.invalid', appRoles: ['Employee'], active: true };
const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'employee|2026', personKey: employee.personKey, employeeDisplayName: employee.displayName,
  employeeEmail: employee.email, performanceYear: 2026, managerPersonKey: manager.personKey, managerDisplayName: manager.displayName,
  managerEmail: manager.email, state: 'Locked', accessState: 'ReadOnly', transitionStatus: 'Ready', transitionCorrelationKey: 'annual-approval-1', coreCategoryWeight: 70,
  personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
};
const lifecycle: IQuarterLifecycle = {
  performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q3', quarterName: 'Q3 · May–Jul',
  quarterStart: '2026-05-01', quarterEnd: '2026-07-31', isCurrentQuarter: true, isOpenForProgressUpdates: true,
  employeeSubmissionDeadline: '2026-08-07', managerReviewDeadline: '2026-08-14',
  reminderMilestones: { earlyReview: '2026-07-01', preparation: '2026-07-17', final: '2026-07-24' }, status: 'Open'
};

describe('annual to quarter source identity boundary', () => {
  const source = (): IQuarterDraftSource => {
    const item = { id: 1, etag: '"1"', naturalKey: 'synthetic', workplanKey: workplan.workplanKey,
      personKey: employee.personKey, performanceYear: 2026, displayOrder: 1, activeInWorkplan: true };
    return { workplan: { ...workplan }, employee, manager, lifecycle: { ...lifecycle },
      coreCatalogue: [{ kpiId: 'SO1-001', kpiVersionKey: 'core-v1', targetVersionKey: 'target-v1', wording: 'Synthetic core',
        pillar: 'Pillar', workstream: 'Workstream', unitLabel: 'cases', scoringDirection: 'HigherIsBetter', aggregationMethod: 'DirectMetric' }],
      coreItems: [{ ...item, workplanItemKey: 'core', kpiId: 'SO1-001', kpiVersionKey: 'core-v1', targetVersionKey: 'target-v1' }],
      personalItems: [{ ...item, workplanItemKey: 'impact', wording: 'Synthetic Impact', measure: 'Delivery', unitLabel: 'cases' }],
      behaviours: [{ behaviourId: 'BHV-01', behaviourVersionKey: 'behaviour-v1', title: 'Synthetic behaviour',
        description: 'Approved', defaultWorkplanWeight: 100, displayOrder: 1 }],
      behaviourItems: [{ ...item, workplanItemKey: 'behaviour', behaviourId: 'BHV-01', behaviourVersionKey: 'behaviour-v1' }] };
  };
  describe.each(['coreItems', 'personalItems', 'behaviourItems'] as const)('active %s identity', collection => {
    it.each([{ workplanKey: 'other-workplan' }, { personKey: 'other-person' }, { performanceYear: 2027 }])('rejects crossed source %j', patch => {
      const input = source();
      Object.assign(input[collection][0], patch);
      expect(() => buildQuarterReviewDraft(input)).toThrow(/annual source/);
      expect(input[collection][0]).toEqual(expect.objectContaining(patch));
    });
  });
  it.each(['coreItems', 'personalItems', 'behaviourItems'] as const)('rejects blank keys in active %s', collection => {
    const input = source(); input[collection][0].workplanItemKey = '   ';
    expect(() => buildQuarterReviewDraft(input)).toThrow(/annual source/);
  });
  it.each(['coreItems', 'personalItems', 'behaviourItems'] as const)('rejects duplicate active keys within %s', collection => {
    const input = source();
    // Deliberately inject duplicate persisted rows, retaining the exact category type.
    if (collection === 'coreItems') input.coreItems.push({ ...input.coreItems[0], id: 2 });
    if (collection === 'personalItems') input.personalItems.push({ ...input.personalItems[0], id: 2 });
    if (collection === 'behaviourItems') input.behaviourItems.push({ ...input.behaviourItems[0], id: 2 });
    expect(() => buildQuarterReviewDraft(input)).toThrow(/duplicate annual/);
  });
  it('rejects collisions between active categories before assigning quarterly keys', () => {
    const input = source(); input.personalItems[0].workplanItemKey = input.coreItems[0].workplanItemKey;
    expect(() => buildQuarterReviewDraft(input)).toThrow(/duplicate annual/);
  });
  it.each([{ performanceYearNumber: 2027 }, { quarterKey: 'Q5' as IQuarterLifecycle['quarterKey'] }])(
    'rejects a mismatched or unsupported quarterly period %j', patch => {
      const input = source(); Object.assign(input.lifecycle, patch);
      expect(() => buildQuarterReviewDraft(input)).toThrow(/exact Workplan year and quarter/);
    });
  it('ignores inactive retained foreign rows while retaining exact active Core/Impact/Behaviour identity', () => {
    const input = source();
    input.personalItems.push({ ...input.personalItems[0], workplanKey: 'old-workplan', personKey: 'old-person',
      performanceYear: 2025, activeInWorkplan: false });
    const result = buildQuarterReviewDraft(input);
    expect(result.items).toHaveLength(3);
    expect(new Set(result.items.map(item => item.quarterReviewItemKey)).size).toBe(3);
    expect(result.items.every(item => item.workplanKey === workplan.workplanKey && item.personKey === employee.personKey
      && item.performanceYear === 2026 && item.quarter === 'Q3')).toBe(true);
  });
  describe.each(['kpiVersionKey', 'targetVersionKey'] as const)('%s accepted Annual Core pin', pin => {
    it.each(['stale', '', '   ', undefined])('rejects an unavailable accepted version (%s)', value => {
      const input = source(); input.coreItems[0][pin] = value as string;
      expect(() => buildQuarterReviewDraft(input)).toThrow(/accepted Annual Core version/);
    });
    it('preserves a matching historical version without adopting a newer definition', () => {
      const input = source(); input.coreItems[0][pin] = 'accepted-history-v0';
      input.coreCatalogue[0][pin] = 'accepted-history-v0';
      expect(buildQuarterReviewDraft(input).items[0][pin]).toBe('accepted-history-v0');
    });
    it('ignores an inactive old annual row with an unavailable version', () => {
      const input = source(); input.coreItems.push({ ...input.coreItems[0], activeInWorkplan: false, [pin]: 'stale' });
      expect(buildQuarterReviewDraft(input).items).toHaveLength(3);
    });
  });
  describe.each(['employee', 'manager'] as const)('%s preparation authority', person => {
    it.each(['false', 'true', 1, {}])('rejects nonboolean active %s', active => {
      const input = source(); input[person] = { ...input[person], active: active as unknown as boolean };
      expect(() => buildQuarterReviewDraft(input)).toThrow(/active Workplan/);
    });
    it('rejects inherited active without reading its getter', () => {
      const input = source(); input[person] = { ...input[person] }; delete (input[person] as Partial<IProductionPerson>).active;
      let reads = 0;
      Object.defineProperty(Object.prototype, 'active', { configurable: true, get: () => { reads++; return true; } });
      try { expect(() => buildQuarterReviewDraft(input)).toThrow(/active Workplan/); expect(reads).toBe(0); }
      finally { delete (Object.prototype as Partial<IProductionPerson>).active; }
    });
  });
  it('rejects inherited accepted annual state without reading its getter', () => {
    const input = source(); delete (input.workplan as Partial<IAnnualWorkplan>).state;
    let reads = 0;
    Object.defineProperty(Object.prototype, 'state', { configurable: true, get: () => { reads++; return 'Locked'; } });
    try { expect(() => buildQuarterReviewDraft(input)).toThrow(/transition-ready/); expect(reads).toBe(0); }
    finally { delete (Object.prototype as Partial<IAnnualWorkplan>).state; }
  });
  describe.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('%s Core target compatibility', quarter => {
    it.each(['empty', 'legacy', 'zero', 'text'] as const)('creates a %s target that passes its own authoritative save check', scenario => {
      const input = source(); input.lifecycle.quarterKey = quarter;
      const prefix = quarter.toLowerCase(); const kpi = input.coreCatalogue[0];
      const value = scenario === 'zero' ? 0 : undefined;
      const text = scenario === 'empty' ? '' : scenario === 'text' ? 'Approved text' : undefined;
      Object.assign(kpi, { [`${prefix}TargetValue`]: value, [`${prefix}TargetText`]: text, [`${prefix}Target`]: 'Legacy display' });
      const item = buildQuarterReviewDraft(input).items[0];
      expect(item.quarterTargetValue).toBe(value);
      expect(item.quarterTargetText).toBe(scenario === 'legacy' ? 'Legacy display' : text);
      expect(() => assertAuthoritativeCoreSnapshot(item, kpi)).not.toThrow();
      expect(() => assertAuthoritativeCoreSnapshot({ ...item, quarterTargetText: 'Changed target' }, kpi)).toThrow(/Annual Target/);
    });
  });
  it('does not interpret an unsupported persisted quarter as Q4', () => {
    const input = source(); const item = buildQuarterReviewDraft(input).items[0];
    expect(() => assertAuthoritativeCoreSnapshot({ ...item, quarter: 'Q5' as IQuarterLifecycle['quarterKey'] }, input.coreCatalogue[0])).toThrow(/quarter/);
  });
  it.each([false, true])('rejects duplicate assigned Core definitions (changed=%s)', changed => {
    const input = source(); const kpi = input.coreCatalogue[0];
    input.coreCatalogue.push({ ...kpi, ...(changed ? { targetVersionKey: 'other-target-version', q3TargetValue: 999 } : {}) });
    expect(() => buildQuarterReviewDraft(input)).toThrow(/ambiguous Core/);
  });
  it.each([false, true])('rejects duplicate assigned legacy Behaviour definitions (changed=%s)', changed => {
    const input = source(); const definition = input.behaviours[0];
    input.behaviours.push({ ...definition, ...(changed ? { behaviourVersionKey: 'other-version', title: 'Other definition' } : {}) });
    expect(() => buildQuarterReviewDraft(input)).toThrow(/ambiguous Behaviour/);
  });
  it('does not block a Workplan because of unrelated unassigned catalogue duplicates', () => {
    const input = source();
    input.coreCatalogue.push({ ...input.coreCatalogue[0], kpiId: 'unassigned' }, { ...input.coreCatalogue[0], kpiId: 'unassigned' });
    input.behaviours.push({ ...input.behaviours[0], behaviourId: 'unassigned' }, { ...input.behaviours[0], behaviourId: 'unassigned' });
    expect(buildQuarterReviewDraft(input).items).toHaveLength(3);
  });
  it.each(['coreItem', 'coreCatalogue', 'impact', 'employee', 'manager', 'lifecycle', 'root'] as const)(
    'rejects %s accessors without invoking them', location => {
      const input = source(); input.employee = { ...input.employee }; input.manager = { ...input.manager };
      const selected = location === 'coreItem' ? [input.coreItems[0], 'workplanItemKey'] as const
        : location === 'coreCatalogue' ? [input.coreCatalogue[0], 'wording'] as const
          : location === 'impact' ? [input.personalItems[0], 'wording'] as const
            : location === 'employee' ? [input.employee, 'active'] as const
              : location === 'manager' ? [input.manager, 'email'] as const
                : location === 'lifecycle' ? [input.lifecycle, 'quarterKey'] as const : [input, 'coreItems'] as const;
      const value = Object.getOwnPropertyDescriptor(selected[0], selected[1])!.value;
      let calls = 0;
      Object.defineProperty(selected[0], selected[1], { enumerable: true, get: () => { calls++; return value; } });
      let rejected = false;
      try { buildQuarterReviewDraft(input); } catch { rejected = true; }
      expect({ rejected, calls }).toEqual({ rejected: true, calls: 0 });
    });
  it.each(['coreItems', 'personalItems', 'coreCatalogue'] as const)('rejects inherited %s authority fields', collection => {
    const input = source(); input[collection][0] = Object.create(input[collection][0]);
    expect(() => buildQuarterReviewDraft(input)).toThrow();
  });
  it('retains plain null-prototype and shared acyclic annual catalogue inputs', () => {
    const input = source(); input.coreCatalogue[0] = Object.assign(Object.create(null), input.coreCatalogue[0]);
    const area = { key: 'synthetic-area', label: 'Synthetic area', source: 'TEST-GOVERNED' };
    input.personalItems[0].impactClassification = { businessContributionArea: area, strategicPillar: area };
    const result = buildQuarterReviewDraft(input);
    expect(result.items).toHaveLength(3);
    expect(result.items[1].impactAnnualDefinitionSnapshot?.classification?.businessContributionArea).toEqual(area);
    expect(result.items[1].impactAnnualDefinitionSnapshot?.classification?.strategicPillar).toEqual(area);
  });
});

describe('PM82 annual to quarter retained configuration', () => {
  const source = (): IQuarterDraftSource => ({ workplan: { ...workplan, overallDeliveryWeightConfiguration: {
    configurationKey: 'SYNTH-CONFIG-2026', configurationVersion: 'SYNTH-V1', coreWeight: 60, impactWeight: 40,
    sourceReference: 'KCF-KPI-Sponsor-PD-01'
  } }, employee, manager, lifecycle, coreCatalogue: [], coreItems: [], personalItems: [], behaviours: [], behaviourItems: [] });
  it('copies the annual governed weights without changing the legacy proposal or applying future configuration', () => {
    const annual = source(); const review = buildQuarterReviewDraft(annual).review;
    annual.workplan.overallDeliveryWeightConfiguration = { ...annual.workplan.overallDeliveryWeightConfiguration!, configurationVersion: 'SYNTH-V2', coreWeight: 70, impactWeight: 30 };
    expect(review.overallDeliveryWeightConfigurationSnapshot).toMatchObject({ configurationVersion: 'SYNTH-V1', coreWeight: 60, impactWeight: 40 });
    expect(Object.isFrozen(review.overallDeliveryWeightConfigurationSnapshot)).toBe(true);
    expect(review.coreCategoryWeightSnapshot).toBe(workplan.coreCategoryWeight);
  });
  it('keeps absent native weights absent and rejects an invalid total', () => {
    const annual = source(); delete annual.workplan.overallDeliveryWeightConfiguration;
    expect(buildQuarterReviewDraft(annual).review).not.toHaveProperty('overallDeliveryWeightConfigurationSnapshot');
    const invalid = source(); invalid.workplan.overallDeliveryWeightConfiguration = { ...invalid.workplan.overallDeliveryWeightConfiguration!, impactWeight: 20 };
    expect(() => buildQuarterReviewDraft(invalid)).toThrow(/100/);
  });
  it('copies governed classification versions from the annual item without rewriting them after a taxonomy change', () => {
    const annual = source();
    annual.personalItems = [{ id: 9, etag: '"1"', workplanItemKey: 'impact', naturalKey: 'employee|2026|impact',
      workplanKey: annual.workplan.workplanKey, personKey: employee.personKey, performanceYear: 2026,
      wording: 'Synthetic classified Impact', description: 'Annual definition', measure: 'Cases', measureType: 'Count',
      scoringDirection: 'HigherIsBetter', unitLabel: 'cases', yearEndTargetValue: 40, q3TargetValue: 10,
      personalItemWeight: 100, displayOrder: 1, activeInWorkplan: true, impactClassification: {
        businessContributionArea: { key: 'area-1', label: 'Original area', source: 'SYNTH', sourceReference: 'AREA-V1',
          taxonomyId: 'SYNTH-TAXONOMY', taxonomyVersion: 'v1', taxonomyEtag: '"1"', taxonomyApprovalReference: 'KCF-KPI-Sponsor-PD-02' }
      } }];
    const result = buildQuarterReviewDraft(annual).items[0];
    annual.personalItems[0].impactClassification = { businessContributionArea: {
      ...annual.personalItems[0].impactClassification!.businessContributionArea!, label: 'New area', taxonomyVersion: 'v2' } };
    expect(result.impactAnnualDefinitionSnapshot?.classification?.businessContributionArea).toMatchObject({
      label: 'Original area', taxonomyId: 'SYNTH-TAXONOMY', taxonomyVersion: 'v1', taxonomyEtag: '"1"',
      taxonomyApprovalReference: 'KCF-KPI-Sponsor-PD-02', sourceReference: 'AREA-V1' });
    expect(result.yearEndTargetValueSnapshot).toBe(40); expect(result.quarterTargetValue).toBe(10);
    expect(result.employeeActualValue).toBeUndefined();
  });
});

describe('QuarterReviewFactory', () => {
  it('creates stable Core, Impact and five Behaviour draft snapshots without GOLD contamination', () => {
    const result = buildQuarterReviewDraft({
      workplan, employee, manager, lifecycle,
      coreCatalogue: [{
        kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01', wording: 'Approved KPI',
        pillar: 'Pillar', workstream: 'Workstream', scoringDirection: 'HigherIsBetter', metricType: 'Number', aggregationMethod: 'DirectMetric',
        unitLabel: 'people', strategyTarget: 'Strategy target', yearEndTarget: '100', q3Target: '75', q3TargetValue: 75
      }],
      coreItems: [{ id: 1, etag: '"1"', workplanItemKey: 'core', naturalKey: 'core-natural', workplanKey: workplan.workplanKey, personKey: employee.personKey, performanceYear: 2026, kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01', displayOrder: 1, activeInWorkplan: true }],
      personalItems: [{
        id: 2, etag: '"1"', workplanItemKey: 'personal', naturalKey: 'personal-natural', workplanKey: workplan.workplanKey,
        personKey: employee.personKey, performanceYear: 2026, wording: 'Personal KPI', description: 'Improve controlled delivery',
        measure: 'Delivery', measureType: 'Count', scoringDirection: 'HigherIsBetter', baselineValue: 0,
        yearEndTargetValue: 4, q1TargetValue: 1, q2TargetValue: 2, q3TargetValue: 3, q4TargetValue: 4,
        unitLabel: 'validated', personalItemWeight: 100, displayOrder: 1, activeInWorkplan: true,
        impactClassification: {
          strategicPillar: { key: 'pillar-1', label: 'Synthetic pillar', source: 'TEST-GOVERNED', sourceReference: 'pillar-v1' },
          businessContributionArea: { key: 'area-1', label: 'Synthetic area', source: 'TEST-GOVERNED', sourceReference: 'area-v1' }
        }
      }],
      behaviours: Array.from({ length: 5 }, (_, index) => ({ behaviourId: `BHV-0${index + 1}`, behaviourVersionKey: `BHV-0${index + 1}|v01`, title: `Behaviour ${index + 1}`, description: 'Approved', defaultWorkplanWeight: 20, displayOrder: index + 1 })),
      behaviourItems: Array.from({ length: 5 }, (_, index) => ({
        id: index + 3, etag: '"1"', workplanItemKey: `behaviour-${index + 1}`, naturalKey: `behaviour-${index + 1}`,
        workplanKey: workplan.workplanKey, personKey: employee.personKey, performanceYear: 2026,
        behaviourId: `BHV-0${index + 1}`, behaviourVersionKey: `BHV-0${index + 1}|v01`, objectiveSource: 'Library' as const,
        sourceObjectiveKey: `BHV-0${index + 1}-OBJ-01`, objectiveTitle: `Objective ${index + 1}`,
        objectiveDescription: 'Controlled behaviour objective', measure: 'Observed examples', unit: 'rating', evidenceDefinition: 'Quarterly examples',
        q1TargetText: 'Q1 commitment', q2TargetText: 'Q2 commitment', q3TargetText: 'Q3 commitment', q4TargetText: 'Q4 commitment',
        q1TargetRating: 3 as const, q2TargetRating: 3 as const, q3TargetRating: 4 as const, q4TargetRating: 3 as const,
        behaviourItemWeight: 20, displayOrder: index + 1, activeInWorkplan: true
      }))
    });
    expect(result.review.quarterReviewKey).toBe('employee|2026|Q3');
    expect(result.items).toHaveLength(7);
    expect(result.items.filter(item => item.itemType === 'CoreGold')[0]).toEqual(expect.objectContaining({ reportingStream: 'CoreGold', quarterTargetValue: 75, metricType: 'Number', scoringDirection: 'HigherIsBetter' }));
    expect(result.review).toEqual(expect.objectContaining({
      coreCategoryWeightSnapshot: 70,
      personalCategoryWeightSnapshot: 20,
      behaviourCategoryWeightSnapshot: 10,
      workplanApprovalCorrelationKey: 'annual-approval-1'
    }));
    expect(result.items.filter(item => item.itemType === 'LocalPersonal')[0]).toEqual(expect.objectContaining({
      reportingStream: 'Impact',
      itemDescription: 'Improve controlled delivery', metricType: 'Count', scoringDirection: 'HigherIsBetter',
      quarterTargetValue: 3, workplanItemWeightSnapshot: 100
    }));
    const impact = result.items.filter(item => item.itemType === 'LocalPersonal')[0];
    expect(impact.impactAnnualDefinitionSnapshot).toEqual(expect.objectContaining({
      sourceWorkplanItemKey: 'personal', wording: 'Personal KPI', intendedOutcome: 'Improve controlled delivery',
      quarterTargetValue: 3, classification: expect.objectContaining({
        strategicPillar: expect.objectContaining({ key: 'pillar-1', sourceReference: 'pillar-v1' }),
        businessContributionArea: expect.objectContaining({ key: 'area-1', sourceReference: 'area-v1' })
      })
    }));
    expect(Object.isFrozen(impact.impactAnnualDefinitionSnapshot)).toBe(true);
    expect(Object.isFrozen(impact.impactAnnualDefinitionSnapshot?.classification)).toBe(true);
    expect(Object.isFrozen(impact.impactAnnualDefinitionSnapshot?.classification?.businessContributionArea)).toBe(true);
    expect(result.items.filter(item => item.itemType === 'Behaviour')).toHaveLength(5);
    expect(result.items.filter(item => item.itemType === 'Behaviour')[0]).toEqual(expect.objectContaining({
      reportingStream: 'Behaviour',
      behaviourId: 'BHV-01', behaviourObjectiveKey: 'BHV-01-OBJ-01', behaviourTargetRating: 4,
      behaviourObjectiveDescription: 'Controlled behaviour objective', itemDescription: 'Controlled behaviour objective',
      quarterTargetText: 'Q3 commitment', workplanItemWeightSnapshot: 20
    }));
  });

  it('accepts a transition-ready Submitted Workplan for Quarterly Draft activity', () => {
    expect(() => buildQuarterReviewDraft({
      workplan: { ...workplan, state: 'Submitted', accessState: 'ManagerDecision' }, employee, manager, lifecycle,
      coreCatalogue: [], coreItems: [], personalItems: [], behaviours: [], behaviourItems: []
    })).not.toThrow();
  });

  it('rejects annual states outside the approved Submitted/Approved/Locked eligibility set', () => {
    expect(() => buildQuarterReviewDraft({
      workplan: { ...workplan, state: 'Draft' }, employee, manager, lifecycle,
      coreCatalogue: [], coreItems: [], personalItems: [], behaviours: [], behaviourItems: []
    })).toThrow(/Submitted, Approved or Locked/);
    expect(() => buildQuarterReviewDraft({
      workplan: { ...workplan, state: 'Submitted', transitionStatus: 'Failed' }, employee, manager, lifecycle,
      coreCatalogue: [], coreItems: [], personalItems: [], behaviours: [], behaviourItems: []
    })).toThrow(/transition-ready/);
  });

  it('projects one fixed annual categorical Target through Q1–Q4 without v01 weights or quarterly Targets', () => {
    const behaviourItems: IBehaviourWorkplanItem[] = BEHAVIOUR_V2_VALUE_IDS.map((valueId, index) => {
      const selection = { schemaVersion: BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA,
        frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId, selections: [] };
      const encoded = encodeBehaviourSelectionSnapshotsV2(selection);
      return { id: index + 1, etag: '"annual-v1"', workplanItemKey: valueId,
        naturalKey: `${workplan.workplanKey}|Behaviour|${valueId}`,
        workplanKey: workplan.workplanKey, personKey: employee.personKey, performanceYear: 2026,
        behaviourId: valueId, behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
        behaviourSnapshotV2: { frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId,
          valueTitle: `Value ${index + 1}`, corporateValue: `Corporate ${index + 1}`,
          roleTier: 'IC_OFFICER', descriptor: `Descriptor ${index + 1}`,
          cadence: 'Quarterly', periodKeys: ['Q1', 'Q2', 'Q3', 'Q4'], ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS },
        behaviourCommitmentV2: `Annual commitment ${index + 1}`,
        behaviourPlanningLevelsV1: { contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
          currentLevel: 'Developing', targetLevel: 'Effective' },
        behaviourPeriodCommitmentsV2: { Q1: 'First', Q2: 'Second', Q3: 'Third', Q4: 'Fourth' },
        behaviourSelectionSnapshotsV2: selection, behaviourSelectionSnapshotsSha256: encoded.sha256,
        behaviourSelectionSnapshotsUtf8ByteLength: encoded.utf8ByteLength,
        selectedSuggestionKeys: [], displayOrder: index + 1, activeInWorkplan: true };
    });
    const source = { workplan, employee, manager, lifecycle, coreCatalogue: [], coreItems: [],
      personalItems: [], behaviours: [], behaviourItems };
    const drafts = (['Q1', 'Q2', 'Q3', 'Q4'] as const).map(quarterKey =>
      buildQuarterReviewDraft({ ...source, lifecycle: { ...lifecycle, quarterKey } }));
    drafts.forEach((draft, index) => {
      const projected = buildQuarterPerformanceReadProjection(2026, [{ ...draft, evidence: [] }]);
      expect(projected.behaviourObservations).toHaveLength(5);
      expect(projected.behaviourObservations.every(row => row.behaviourAnnualTargetSourceApprovalKeyV2 === 'annual-approval-1'
        && row.behaviourAnnualTargetLevelV2 === 'Effective')).toBe(true);
      const first = draft.items.find(item => item.behaviourId === 'BHV-01')!;
      expect(first.behaviourAnnualTargetLevelV2).toBe('Effective');
      expect(first.behaviourAnnualCurrentLevelV2).toBe('Developing');
      expect(first.behaviourQuarterCurrentActualLevelV2).toBeUndefined();
      expect(first.behaviourSnapshotV2?.period).toBe((['Q1', 'Q2', 'Q3', 'Q4'] as const)[index]);
      expect(first.behaviourAnnualTargetSourceEtagV2).toBe('"annual-v1"');
      expect(first.behaviourAnnualTargetSourceWorkplanVersionV2).toBe(1);
      expect(first.behaviourAnnualTargetSourceApprovalKeyV2).toBe('annual-approval-1');
      expect(first.behaviourTargetRating).toBeUndefined();
      expect(first.quarterTargetText).toBeUndefined();
      expect(first.workplanItemWeightSnapshot).toBeUndefined();
      expect(draft.review.behaviourCategoryWeightSnapshot).toBeUndefined();
      expect(draft.review.coreCategoryWeightSnapshot).toBeUndefined();
    });
    const amendedItems = behaviourItems.map((item, index) => index === 0 ? { ...item,
      etag: '"annual-v2"', behaviourPlanningLevelsV1: { contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
        currentLevel: 'Developing' as const, targetLevel: 'Exceptional' as const,
        targetJustification: 'Approved versioned amendment.' } } : item);
    const amended = buildQuarterReviewDraft({ ...source,
      workplan: { ...workplan, rowVersionToken: 2, transitionCorrelationKey: 'annual-approval-2' }, behaviourItems: amendedItems,
      lifecycle: { ...lifecycle, quarterKey: 'Q4' } });
    expect(drafts[0].items[0].behaviourAnnualTargetLevelV2).toBe('Effective');
    expect(amended.items[0].behaviourAnnualTargetLevelV2).toBe('Exceptional');
    expect(amended.items[0].behaviourAnnualTargetSourceEtagV2).toBe('"annual-v2"');
    expect(amended.items[0].behaviourAnnualTargetSourceWorkplanVersionV2).toBe(2);
    expect(amended.items[0].behaviourAnnualTargetSourceApprovalKeyV2).toBe('annual-approval-2');
    expect(drafts[0].items[0].behaviourAnnualTargetSourceApprovalKeyV2).toBe('annual-approval-1');
    expect(() => buildQuarterReviewDraft({ ...source, behaviourItems: [{ ...behaviourItems[0], personKey: 'foreign' }, ...behaviourItems.slice(1)] }))
      .toThrow();
    expect(() => buildQuarterReviewDraft({ ...source, behaviourItems: [{ ...behaviourItems[0], performanceYear: 2027 }, ...behaviourItems.slice(1)] }))
      .toThrow();
    expect(() => buildQuarterReviewDraft({ ...source, behaviourItems: [{ ...behaviourItems[0], etag: '*' }, ...behaviourItems.slice(1)] }))
      .toThrow(/approved, attributed/);
  });
});
