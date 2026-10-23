import type { IAnnualWorkplan, IBehaviourWorkplanItem, IProductionPerson } from '../models/ProductionModels';
import type { IQuarterLifecycle } from '../models/QuarterlyModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_PLANNING_LEVELS_VERSION,
  BEHAVIOUR_V2_VALUE_IDS } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { BEHAVIOUR_V2_SELECTION_SNAPSHOT_SCHEMA, encodeBehaviourSelectionSnapshotsV2 }
  from './BehaviourSelectionSnapshotsV2';
import { consumeQuarterBehaviourCatalogue, assertIssuedQuarterBehaviourResult } from './QuarterBehaviourCatalogueConsumer';
import { buildQuarterPerformanceReadProjection } from './QuarterPerformanceReadProjection';
import { buildQuarterReviewDraft } from './QuarterReviewFactory';

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

describe('factory annual Target to issued catalogue consumer', () => {
  it('retains factory Target provenance in issued read-only ratings across Q1 and Q2', () => {
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

    const ratings = (['Q1', 'Q2'] as const).map((quarterKey, quarterIndex) => {
      const draft = buildQuarterReviewDraft({ ...source, lifecycle: { ...lifecycle, quarterKey } });
      // The existing catalogue consumer separately requires governed selection snapshots.
      // Ordinary synthetic selections exercise that existing read contract only.
      const items = draft.items.map((item, index) => ({ ...item,
        employeeBehaviourAssessmentV2: quarterIndex === 0 ? 1 as const : 3 as const,
        managerBehaviourAssessmentV2: quarterIndex === 0 ? 1 as const : 3 as const,
        finalBehaviourAssessmentV2: quarterIndex === 0 ? 1 as const : 3 as const,
        behaviourCommitmentSnapshotsV1: [{ selectionKey: `selection-${index}`,
          catalogueIdentity: { decisionReference: 'KCF-KPI-Sponsor-BEH-V1-001' as const,
            catalogueVersion: '2026.1', contentHash: 'a'.repeat(64), sourceReference: 'synthetic-catalogue',
            effectiveFrom: '2026-04-01T00:00:00.000Z' },
          headlineId: item.behaviourSnapshotV2!.valueId, roleTier: 'IC_OFFICER' as const,
          focusAreaKey: `focus-${index}`, focusAreaTitle: 'Synthetic focus', selectionPath: 'OwnTarget' as const,
          targetTextSnapshot: 'Annual commitment', myCommitment: 'Observable commitment', howWillWeKnow: 'Observable evidence' }]
      }));
      const projection = buildQuarterPerformanceReadProjection(2026, [{ review: draft.review, items, evidence: [] }]);
      const result = consumeQuarterBehaviourCatalogue(projection);
      expect(assertIssuedQuarterBehaviourResult(result, projection)).toBe(result);
      expect(result.ratings).toHaveLength(5);
      expect(() => assertIssuedQuarterBehaviourResult({ ...result }, projection)).toThrow(/exact internally issued/);
      return result.ratings;
    });
    ratings[0].forEach((row, index) => {
      const later = ratings[1][index];
      expect(row.finalRating).toBe('Developing');
      expect(later.finalRating).toBe('Exceptional');
      expect(row.behaviourAnnualCurrentLevelV2).toBe('Developing');
      expect(later.behaviourAnnualCurrentLevelV2).toBe('Developing');
      expect(row.behaviourAnnualTargetLevelV2).toBe('Effective');
      expect(later.behaviourAnnualTargetLevelV2).toBe('Effective');
      expect(row.behaviourAnnualTargetSourceWorkplanItemKeyV2).toBe(later.behaviourAnnualTargetSourceWorkplanItemKeyV2);
      expect(row.behaviourAnnualTargetSourceEtagV2).toBe('"annual-v1"');
      expect(later.behaviourAnnualTargetSourceEtagV2).toBe('"annual-v1"');
      expect(row.behaviourAnnualTargetSourceWorkplanVersionV2).toBe(1);
      expect(later.behaviourAnnualTargetSourceWorkplanVersionV2).toBe(1);
      expect(row.behaviourAnnualTargetSourceApprovalKeyV2).toBe('annual-approval-1');
      expect(later.behaviourAnnualTargetSourceApprovalKeyV2).toBe('annual-approval-1');
      expect(Object.isFrozen(later)).toBe(true);
    });
  });
});
