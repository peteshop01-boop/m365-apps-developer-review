import type { ICoreKpiCatalogueItem, IProductionConfig } from '../models/ProductionModels';
import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import { assertApprovedBehaviourTargetSource, assertFrozenBehaviourAnnualTarget,
  prepareAuthoritativeCoreQuarterSave, prepareAuthoritativePersonalQuarterSave } from './QuarterReviewItemPersistence';
import type { IAnnualWorkplan, IBehaviourWorkplanItem } from '../models/ProductionModels';
import { BEHAVIOUR_PLANNING_LEVELS_VERSION, BEHAVIOUR_FRAMEWORK_V2_VERSION } from '../models/BehaviourFrameworkV2Models';

const config: IProductionConfig = {
  performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31', performanceYearNumber: 2026,
  quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 }, rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: ['DirectMetric'], retentionStatus: 'TBC'
};
const kpi: ICoreKpiCatalogueItem = {
  kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01',
  wording: '200 Primary School Programmes delivered annually.', pillar: 'Pillar 1', workstream: 'National Programmes',
  strategyTarget: '200 Primary School Programmes delivered annually.', accountableOwnerEmail: 'person005@example.invalid',
  aggregationMethod: 'DirectMetric', scoringDirection: 'HigherIsBetter', metricType: 'Count', unitLabel: 'programmes',
  yearEndTarget: '200', yearEndTargetValue: 200, q1TargetValue: 70, q2TargetValue: 148, q3TargetValue: 200, q4TargetValue: 200
};
const persisted: IQuarterReviewItem = {
  id: 1, etag: '"4"', quarterReviewItemKey: 'person|2026|Q4|assignment', quarterReviewKey: 'person|2026|Q4',
  workplanItemKey: 'assignment', workplanKey: 'person|2026', personKey: 'person', performanceYear: 2026, quarter: 'Q4',
  itemType: 'CoreGold', kpiId: 'SO1-001', kpiVersionKey: kpi.kpiVersionKey, targetVersionKey: kpi.targetVersionKey,
  wording: kpi.wording, pillar: kpi.pillar, workstream: kpi.workstream, quarterTargetValue: 200,
  calculatedRag: 'NotRated', evidenceCount: 0, managerApproved: false, locked: false
};
const recover = {
  route: 'Recover' as const, action: 'KCF-KPI-015C synthetic recovery action.', ownerPersonKey: 'person',
  dueDate: '2026-09-15', nextReviewDate: '2026-09-01', status: 'Active' as const, expectedReturnToGreenDate: '2026-09-30'
};

describe('authoritative Quarter Review item persistence', () => {
  it.each([
    [180, 90, 90, 'Green'],
    [100, 50, 50, 'Amber'],
    [99, 49.5, 49.5, 'Red'],
    [240, 120, 100, 'Green'],
    [130, 65, 65, 'Amber'],
  ])('scores SO1-001 Actual %s against authoritative target 200', (actual, raw, scored, rag) => {
    const result = prepareAuthoritativeCoreQuarterSave(persisted, {
      ...persisted, employeeActualValue: actual, statusUpdate: 'KCF-KPI-015C controlled Quarterly scoring UAT',
      recovery: rag === 'Amber' || rag === 'Red' ? recover : undefined
    }, kpi, config);
    expect(result.item).toEqual(expect.objectContaining({ progressPct: raw, scoredProgressPct: scored, calculatedRag: rag }));
    if (actual === 240) expect(result.item.scoringMessage).toMatch(/120%.*capped at 100%/);
  });

  it('ignores client attempts to change immutable target, classification, snapshots, config or evidence count', () => {
    const result = prepareAuthoritativeCoreQuarterSave(persisted, {
      ...persisted,
      wording: 'Tampered wording', quarterTargetValue: 1, scoringDirection: 'LowerIsBetter', metricType: 'Currency',
      unitLabel: 'tampered', evidenceCount: 99, employeeActualValue: 130, recovery: recover
    }, kpi, config);
    expect(result.item).toEqual(expect.objectContaining({
      wording: kpi.wording, quarterTargetValue: 200, scoringDirection: 'HigherIsBetter', metricType: 'Count',
      unitLabel: 'programmes', evidenceCount: 0, calculatedRag: 'Amber'
    }));
  });

  it('blocks target/version drift and incomplete Amber/Red Recovery', () => {
    expect(() => prepareAuthoritativeCoreQuarterSave({ ...persisted, quarterTargetValue: 199 }, persisted, kpi, config)).toThrow(/Annual Target/);
    expect(() => prepareAuthoritativeCoreQuarterSave(persisted, persisted, { ...kpi, targetVersionKey: 'other' }, config)).toThrow(/versions/);
    expect(() => prepareAuthoritativeCoreQuarterSave(persisted, { ...persisted, employeeActualValue: 130 }, kpi, config)).toThrow(/Recovery Route/);
  });

  it('keeps unresolved classification NotRated and never promotes it to Green', () => {
    const unresolved = { ...kpi, scoringDirection: 'TBC', metricType: 'Number', unitLabel: 'TBC' };
    const result = prepareAuthoritativeCoreQuarterSave(persisted, { ...persisted, employeeActualValue: 240 }, unresolved, config);
    expect(result.item).toEqual(expect.objectContaining({ calculatedRag: 'NotRated', progressPct: undefined }));
  });

  it.each([
    ['Fraction', 0.28, 0.252],
    ['Whole', 28, 25.2]
  ] as const)('applies explicit %s percentage source metadata through authoritative persistence', (percentageSourceScale, target, actual) => {
    const percentageKpi: ICoreKpiCatalogueItem = {
      ...kpi,
      kpiId: 'SO1-016',
      kpiVersionKey: 'SO1-016|v01',
      targetVersionKey: 'SO1-016|2026|v01',
      wording: 'Increase the number of girls in national programmes to 35%',
      metricType: 'Percentage',
      unitLabel: '%',
      percentageSourceScale,
      q4TargetValue: target
    };
    const percentagePersisted: IQuarterReviewItem = {
      ...persisted,
      kpiId: percentageKpi.kpiId,
      kpiVersionKey: percentageKpi.kpiVersionKey,
      targetVersionKey: percentageKpi.targetVersionKey,
      wording: percentageKpi.wording,
      quarterTargetValue: target
    };
    const result = prepareAuthoritativeCoreQuarterSave(percentagePersisted, {
      ...percentagePersisted,
      employeeActualValue: actual,
      statusUpdate: 'KCF-KPI-015D controlled percentage-scale test'
    }, percentageKpi, config);
    expect(result.item).toEqual(expect.objectContaining({
      employeeActualValue: actual,
      progressPct: 90,
      scoredProgressPct: 90,
      calculatedRag: 'Green'
    }));
  });

  it('scores an approved current Milestone map through authoritative persistence using its resolved timestamp', () => {
    const milestoneKpi: ICoreKpiCatalogueItem = {
      ...kpi,
      kpiId: 'TEST-MILESTONE',
      kpiVersionKey: 'TEST-MILESTONE|v01',
      targetVersionKey: 'TEST-MILESTONE|2026|v01',
      wording: 'Controlled Milestone scoring integration test',
      scoringDirection: 'Milestone',
      metricType: 'Milestone',
      unitLabel: 'milestone',
      q4TargetValue: undefined,
      q4TargetText: 'Complete',
      approvedMilestonePolicy: {
        performanceYear: '2026',
        kpiId: 'TEST-MILESTONE',
        kpiVersionKey: 'TEST-MILESTONE|v01',
        version: 'map-v01',
        source: 'CONTROL integration test',
        approvalReference: 'CONTROL-MILESTONE-INTEGRATION',
        effectiveFrom: '2026-04-01T00:00:00Z',
        resolvedEffectiveAt: '2026-08-20T00:00:00Z',
        stages: [
          { stageKey: 'START', stageName: 'Started', sortOrder: 1, completionPercent: 0 },
          { stageKey: 'DELIVER', stageName: 'Deliver', sortOrder: 2, completionPercent: 75 },
          { stageKey: 'COMPLETE', stageName: 'Complete', sortOrder: 3, completionPercent: 100 }
        ]
      }
    };
    const milestonePersisted: IQuarterReviewItem = {
      ...persisted,
      kpiId: milestoneKpi.kpiId,
      kpiVersionKey: milestoneKpi.kpiVersionKey,
      targetVersionKey: milestoneKpi.targetVersionKey,
      wording: milestoneKpi.wording,
      quarterTargetValue: undefined,
      quarterTargetText: 'Complete'
    };
    const result = prepareAuthoritativeCoreQuarterSave(milestonePersisted, {
      ...milestonePersisted,
      employeeActualText: 'Deliver',
      statusUpdate: 'Controlled approved Milestone persistence test',
      recovery: recover
    }, milestoneKpi, config);
    expect(result.item).toEqual(expect.objectContaining({
      employeeActualText: 'Deliver',
      progressPct: 75,
      scoredProgressPct: 75,
      calculatedRag: 'Amber'
    }));
  });

  it('clears stale Recovery fields when a Green save has no active route', () => {
    const result = prepareAuthoritativeCoreQuarterSave(persisted, {
      ...persisted,
      employeeActualValue: 240,
      recovery: { action: 'Stale synthetic action that must not persist.', ownerPersonKey: 'person' }
    }, kpi, config);
    expect(result.item.recovery).toBeUndefined();
    expect(result.item).toEqual(expect.objectContaining({ progressPct: 120, scoredProgressPct: 100, calculatedRag: 'Green' }));
  });
});

describe('frozen annual Behaviour Target persistence boundary', () => {
  const annual = { workplanKey: 'person|2026', personKey: 'person', performanceYear: 2026,
    state: 'Approved', transitionCorrelationKey: 'approval-1', rowVersionToken: 3 } as IAnnualWorkplan;
  const source = { workplanItemKey: 'BHV-01', workplanKey: annual.workplanKey,
    personKey: annual.personKey, performanceYear: annual.performanceYear, activeInWorkplan: true,
    behaviourId: 'BHV-01', behaviourSnapshotV2: { valueId: 'BHV-01' }, etag: '"source-3"',
    behaviourPlanningLevelsV1: { contractVersion: BEHAVIOUR_PLANNING_LEVELS_VERSION,
      currentLevel: 'Developing', targetLevel: 'Effective' } } as IBehaviourWorkplanItem;
  const frozen = { ...persisted, itemType: 'Behaviour', workplanItemKey: 'BHV-01',
    behaviourId: 'BHV-01', behaviourSnapshotV2: { valueId: 'BHV-01', frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, period: 'Q4' },
    behaviourAnnualTargetLevelV2: 'Effective',
    behaviourAnnualTargetSourceWorkplanItemKeyV2: 'BHV-01',
    behaviourAnnualTargetSourceEtagV2: '"source-3"',
    behaviourAnnualTargetSourceWorkplanVersionV2: 3,
    behaviourAnnualTargetSourceApprovalKeyV2: 'approval-1' } as IQuarterReviewItem;

  it('accepts exact approved provenance and rejects a changed or missing readback image', () => {
    expect(() => assertApprovedBehaviourTargetSource(frozen, annual, source)).not.toThrow();
    expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen })).not.toThrow();
    expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen,
      behaviourAnnualTargetLevelV2: 'Exceptional' })).toThrow(/frozen annual/);
    expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen,
      behaviourAnnualTargetSourceEtagV2: undefined })).toThrow(/frozen annual/);
    expect(() => assertFrozenBehaviourAnnualTarget(frozen, { ...frozen,
      behaviourSnapshotV2: undefined })).toThrow(/frozen annual/);
    expect(() => assertApprovedBehaviourTargetSource(frozen, annual, { ...source,
      etag: '"later-amendment"' })).toThrow(/exact approved/);
    expect(() => assertApprovedBehaviourTargetSource(frozen, { ...annual, state: 'Draft' }, source))
      .toThrow(/exact approved/);
    expect(() => assertApprovedBehaviourTargetSource(frozen, annual, { ...source,
      behaviourId: 'BHV-02' })).toThrow(/exact approved/);
    expect(() => assertApprovedBehaviourTargetSource(frozen, { ...annual,
      rowVersionToken: 4 }, source)).toThrow(/exact approved/);
  });
});

describe('authoritative Personal Quarter Review item persistence', () => {
  const personal: IQuarterReviewItem = {
    ...persisted,
    id: 0,
    etag: '*',
    quarterReviewItemKey: 'person|2026|Q4|personal-assignment',
    workplanItemKey: 'personal-assignment',
    itemType: 'LocalPersonal',
    reportingStream: 'Impact',
    kpiId: undefined,
    kpiVersionKey: undefined,
    targetVersionKey: undefined,
    wording: 'Controlled Personal KPI',
    measure: 'Deliveries completed',
    unitLabel: 'deliveries',
    metricType: 'Count',
    scoringDirection: 'HigherIsBetter',
    quarterTargetValue: 200,
    evidenceCount: 2,
    impactAnnualDefinitionSnapshot: Object.freeze({
      sourceWorkplanItemKey: 'personal-assignment', wording: 'Controlled Personal KPI',
      measure: 'Deliveries completed', unitLabel: 'deliveries', metricType: 'Count',
      scoringDirection: 'HigherIsBetter', quarterTargetValue: 200,
      classification: Object.freeze({
        businessContributionArea: Object.freeze({ key: 'area-1', label: 'Synthetic area', source: 'TEST-GOVERNED', sourceReference: 'area-v1' })
      })
    })
  };

  it('preserves the exact annual Impact definition/classification and authoritative RAG on save', () => {
    const result = prepareAuthoritativePersonalQuarterSave(personal, {
      ...personal,
      wording: 'Caller-forged wording',
      quarterTargetValue: 1,
      evidenceCount: 999,
      calculatedRag: 'Red',
      employeeActualValue: 200,
      statusUpdate: 'Exact employee quarterly commentary.',
      impactAnnualDefinitionSnapshot: {
        ...personal.impactAnnualDefinitionSnapshot!, wording: 'Caller-forged snapshot',
        classification: { businessContributionArea: { key: 'evil', label: 'Forged', source: 'CALLER' } }
      }
    }, config).item;
    expect(result).toEqual(expect.objectContaining({
      wording: 'Controlled Personal KPI', quarterTargetValue: 200, evidenceCount: 2,
      calculatedRag: 'Green', employeeActualValue: 200, statusUpdate: 'Exact employee quarterly commentary.'
    }));
    expect(result.impactAnnualDefinitionSnapshot).toBe(personal.impactAnnualDefinitionSnapshot);
    expect(result.impactAnnualDefinitionSnapshot?.classification?.businessContributionArea?.key).toBe('area-1');
  });

  it('retains complete Recovery on create and replaces it on update', () => {
    const created = prepareAuthoritativePersonalQuarterSave(personal, {
      ...personal,
      employeeActualValue: 130,
      recovery: recover
    }, config).item;
    expect(created).toEqual(expect.objectContaining({
      calculatedRag: 'Amber',
      progressPct: 65,
      scoredProgressPct: 65,
      recovery: recover,
      evidenceCount: 2
    }));

    const replacement = {
      ...recover,
      action: 'Updated Personal KPI Recovery action.',
      dueDate: '2026-09-22'
    };
    const updated = prepareAuthoritativePersonalQuarterSave({ ...created, id: 9, etag: '"5"' }, {
      ...created,
      id: 9,
      etag: '"5"',
      employeeActualValue: 100,
      recovery: replacement
    }, config).item;
    expect(updated).toEqual(expect.objectContaining({
      calculatedRag: 'Amber',
      progressPct: 50,
      recovery: replacement
    }));
  });

  it('clears stale Personal Recovery after the authoritative result becomes Green', () => {
    const result = prepareAuthoritativePersonalQuarterSave({ ...personal, recovery: recover }, {
      ...personal,
      employeeActualValue: 200,
      recovery: recover
    }, config).item;
    expect(result).toEqual(expect.objectContaining({
      calculatedRag: 'Green',
      progressPct: 100,
      scoredProgressPct: 100
    }));
    expect(result.recovery).toBeUndefined();
  });

  it('fails closed when post-scoring Amber/Red Personal Recovery is missing or incomplete', () => {
    expect(() => prepareAuthoritativePersonalQuarterSave({ ...personal, id: 9, etag: '"5"', recovery: recover }, {
      ...personal,
      id: 9,
      etag: '"5"',
      employeeActualValue: 130
    }, config)).toThrow(/Recovery Route/);
    expect(() => prepareAuthoritativePersonalQuarterSave(personal, {
      ...personal,
      employeeActualValue: 99,
      recovery: { route: 'Recover', action: 'Incomplete Recovery' }
    }, config)).toThrow(/Select a recovery owner/);
  });
});
