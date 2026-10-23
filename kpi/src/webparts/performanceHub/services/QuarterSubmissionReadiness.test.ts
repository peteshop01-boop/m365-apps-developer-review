import type { IQuarterLifecycle, IQuarterReview, IQuarterReviewItem } from '../models/QuarterlyModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION } from '../models/BehaviourFrameworkV2Models';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import {
  evaluateQuarterManagerApprovalReadiness,
  evaluateQuarterSubmissionReadiness
} from './QuarterSubmissionReadiness';

const lifecycle: IQuarterLifecycle = {
  performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q3', quarterName: 'Q3 · May–Jul',
  quarterStart: '2026-05-01', quarterEnd: '2026-07-31', isCurrentQuarter: false, isOpenForProgressUpdates: true,
  employeeSubmissionDeadline: '2026-08-07', managerReviewDeadline: '2026-08-14',
  reminderMilestones: { earlyReview: '2026-07-01', preparation: '2026-07-17', final: '2026-07-24' },
  status: 'Finalising', priorQuarter: 'Q2', nextQuarter: 'Q4'
};
const review: IQuarterReview = {
  id: 1, etag: '"1"', quarterReviewKey: 'workplan|Q3', workplanKey: 'workplan', personKey: 'person',
  employeeDisplayName: 'Employee', employeeEmail: 'person012@example.invalid', performanceYear: 2026, quarter: 'Q3',
  managerPersonKey: 'manager', managerDisplayName: 'Manager', managerEmail: 'person013@example.invalid',
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1
};
const core: IQuarterReviewItem = {
  id: 1, etag: '"1"', quarterReviewItemKey: 'review|core', quarterReviewKey: review.quarterReviewKey,
  workplanItemKey: 'core', workplanKey: review.workplanKey, personKey: review.personKey, performanceYear: 2026, quarter: 'Q3',
  itemType: 'CoreGold', kpiId: 'SO1-001', wording: 'Core KPI', employeeActualValue: 95, calculatedRag: 'Green',
  statusUpdate: 'Delivery is on track.', evidenceCount: 0, managerApproved: false, locked: false
};
const behaviour: IQuarterReviewItem = {
  ...core, id: 2, quarterReviewItemKey: 'review|behaviour', workplanItemKey: 'behaviour', itemType: 'Behaviour', kpiId: undefined,
  wording: 'Work as One Team', employeeActualValue: undefined, calculatedRag: 'NotRated', statusUpdate: undefined,
  behaviourTargetRating: 3, employeeBehaviourRating: 3, managerBehaviourRating: 3,
  behaviourReflection: 'Worked with colleagues to resolve delivery issues.'
};
const behaviourV2: IQuarterReviewItem = {
  ...behaviour, behaviourId: 'BHV-01', behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  behaviourTargetRating: undefined, employeeBehaviourRating: undefined, managerBehaviourRating: undefined,
  behaviourReflection: undefined, behaviourSnapshotV2: {
    frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId: 'BHV-01', valueTitle: 'Synthetic Value',
    corporateValue: 'Synthetic corporate Value', roleTier: 'IC_OFFICER', descriptor: 'Synthetic descriptor',
    cadence: 'Quarterly', periodKeys: ['Q1', 'Q2', 'Q3', 'Q4'], ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS,
    period: 'Q3'
  }, employeeBehaviourEvidenceV2: 'Employee evidence', employeeBehaviourAssessmentV2: 2
};

describe('QuarterSubmissionReadiness', () => {
  it('accepts meaningful complete Core and Behaviour inputs during finalisation', () => {
    expect(evaluateQuarterSubmissionReadiness(lifecycle, review, [core, behaviour])).toEqual(expect.objectContaining({ ready: true, coreComplete: 1, behavioursComplete: 1 }));
  });

  it('uses separate unscored v02 employee and manager evidence/assessments', () => {
    expect(evaluateQuarterSubmissionReadiness(lifecycle, review, [core, behaviourV2]))
      .toEqual(expect.objectContaining({ ready: true, behavioursComplete: 1 }));
    const submitted = { ...review, state: 'Submitted' as const, accessState: 'ManagerDecision' as const };
    expect(evaluateQuarterManagerApprovalReadiness(submitted, [core, behaviourV2]).blockers)
      .toEqual(expect.arrayContaining([expect.stringContaining('manager assessment'), expect.stringContaining('manager evidence')]));
    expect(evaluateQuarterManagerApprovalReadiness(submitted, [core, {
      ...behaviourV2, managerBehaviourEvidenceV2: 'Manager evidence', managerBehaviourAssessmentV2: 3
    }])).toEqual(expect.objectContaining({ ready: true, behavioursComplete: 1 }));
    expect(evaluateQuarterSubmissionReadiness(lifecycle, review, [core, {
      ...behaviourV2, behaviourTargetRating: 3
    }]).blockers).toEqual(expect.arrayContaining([expect.stringContaining('prohibited v02 target')]));
  });

  it('requires Amber/Red recovery completeness and evidence only when configured', () => {
    const amber = { ...core, calculatedRag: 'Amber' as const, evidenceRequired: true };
    const result = evaluateQuarterSubmissionReadiness(lifecycle, review, [amber, behaviour]);
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([expect.stringContaining('Recovery Route'), expect.stringContaining('linked evidence')]));
  });

  it('applies the same Recovery requirement to Amber/Red Personal KPI results', () => {
    const personal: IQuarterReviewItem = {
      ...core,
      id: 3,
      quarterReviewItemKey: 'review|personal',
      workplanItemKey: 'personal',
      itemType: 'LocalPersonal',
      kpiId: undefined,
      wording: 'Personal KPI',
      calculatedRag: 'Amber'
    };
    expect(evaluateQuarterSubmissionReadiness(lifecycle, review, [personal, behaviour]).blockers)
      .toEqual(expect.arrayContaining([expect.stringContaining('Personal KPI: Amber/Red KPI requires a Recovery Route')]));

    const complete = evaluateQuarterSubmissionReadiness(lifecycle, review, [{
      ...personal,
      recovery: {
        route: 'Recover', action: 'Complete the controlled recovery work', ownerPersonKey: 'person',
        dueDate: '2026-08-05', nextReviewDate: '2026-08-01', status: 'Active', expectedReturnToGreenDate: '2026-08-05'
      }
    }, behaviour]);
    expect(complete).toEqual(expect.objectContaining({ ready: true, personalComplete: 1 }));
  });

  it('allows TBC scoring Actual/status entry but reports RAG as unassessed', () => {
    const unrated = { ...core, calculatedRag: 'NotRated' as const, scoringMessage: 'RAG pending KPI scoring configuration.' };
    const result = evaluateQuarterSubmissionReadiness(lifecycle, review, [unrated, behaviour]);
    expect(result.ready).toBe(true);
    expect(result.warnings).toContain('SO1-001: RAG is unassessed; Actual/status is retained pending approved scoring configuration.');
  });

  it('blocks submission outside finalisation and rejects missing meaningful inputs', () => {
    const result = evaluateQuarterSubmissionReadiness({ ...lifecycle, status: 'Open' }, review, [{ ...core, employeeActualValue: undefined, statusUpdate: ' ' }]);
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('submission opens after quarter end'),
      expect.stringContaining('valid Actual'),
      expect.stringContaining('meaningful Status Update')
    ]));
  });
});

describe('Quarter manager approval readiness', () => {
  const submitted: IQuarterReview = {
    ...review,
    state: 'Submitted',
    accessState: 'ManagerDecision'
  };

  it('accepts complete stored content for a transition-ready Submitted review', () => {
    const result = evaluateQuarterManagerApprovalReadiness(submitted, [core, behaviour]);
    expect(result).toEqual(expect.objectContaining({
      ready: true,
      blockers: [],
      coreComplete: 1,
      behavioursComplete: 1
    }));
    expect(evaluateQuarterSubmissionReadiness(lifecycle, submitted, [core, behaviour]).ready).toBe(false);
  });

  it('requires the manager-decision state without imposing the employee finalisation window', () => {
    expect(evaluateQuarterManagerApprovalReadiness({ ...submitted, state: 'Draft', accessState: 'EmployeeEdit' }, [core, behaviour]).blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('Submitted'),
      expect.stringContaining('manager-decision')
    ]));
    expect(evaluateQuarterManagerApprovalReadiness({ ...submitted, transitionStatus: 'Failed' }, [core, behaviour]).ready).toBe(false);
  });

  it('preserves Actual, Status Update, evidence and Amber/Red Recovery completeness rules', () => {
    const incomplete = {
      ...core,
      employeeActualValue: undefined,
      statusUpdate: ' ',
      calculatedRag: 'Amber' as const,
      evidenceRequired: true
    };
    const result = evaluateQuarterManagerApprovalReadiness(submitted, [incomplete, behaviour]);
    expect(result.ready).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('valid Actual'),
      expect.stringContaining('meaningful Status Update'),
      expect.stringContaining('linked evidence'),
      expect.stringContaining('Recovery Route')
    ]));
  });

  it('preserves controlled NotRated warnings and duplicate/lock protection', () => {
    const unrated = { ...core, calculatedRag: 'NotRated' as const };
    const controlled = evaluateQuarterManagerApprovalReadiness(submitted, [unrated, behaviour]);
    expect(controlled.ready).toBe(true);
    expect(controlled.warnings).toContain('SO1-001: RAG is unassessed; Actual/status is retained pending approved scoring configuration.');

    const invalid = evaluateQuarterManagerApprovalReadiness(submitted, [unrated, { ...unrated, id: 2, locked: true }]);
    expect(invalid.ready).toBe(false);
    expect(invalid.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicate item keys'),
      expect.stringContaining('unexpectedly locked')
    ]));
  });
});
