import { APPROVED_BEHAVIOUR_V1_SOURCE_ROWS } from './BehaviourFrameworkV1ApprovedData';
import {
  BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY,
  buildBehaviourFrameworkV2Readback,
  createBehaviourFrameworkV2Catalogue,
  createOwnBehaviourFrameworkV2Target,
  recordBehaviourFrameworkV2ManagerReview,
  selectBehaviourFrameworkV2Target
} from '../services/BehaviourFrameworkV2';
import type {
  IBehaviourFocusQuarterEvidence,
  IBehaviourFocusTargetSelection,
  IBehaviourFrameworkV2Readback,
  IBehaviourHeadlineQuarterAssessment,
  IBehaviourManagerReviewEvent
} from '../services/BehaviourFrameworkV2';

export const BEHAVIOUR_FRAMEWORK_V2_TEST_VERSION = 'KCF-BHV-PD03-2026.09-v1';

export const behaviourFrameworkV2TestCatalogue = createBehaviourFrameworkV2Catalogue(
  APPROVED_BEHAVIOUR_V1_SOURCE_ROWS,
  { catalogueVersion: BEHAVIOUR_FRAMEWORK_V2_TEST_VERSION, revision: 1, status: 'Published', effectiveFrom: '2026-11-01' }
);

export const createBehaviourFrameworkV2TestSelections = (): IBehaviourFocusTargetSelection[] => [
  selectBehaviourFrameworkV2Target(behaviourFrameworkV2TestCatalogue, 'L2', 'BHV-01-L2-01', new Date('2026-11-01'), {
    commitment: 'I will make ownership clear across my team and follow through weekly.',
    howWillWeKnow: 'Actions show one named owner, due date and weekly progress update.'
  }),
  selectBehaviourFrameworkV2Target(behaviourFrameworkV2TestCatalogue, 'L2', 'BHV-02-L2-02', new Date('2026-11-01'), {
    commitment: 'I will brief my team and relevant colleagues within one working day of a material decision.',
    howWillWeKnow: 'Colleagues can explain the decision, change and priority without contradictory versions.'
  }),
  selectBehaviourFrameworkV2Target(behaviourFrameworkV2TestCatalogue, 'L2', 'BHV-03-L2-03', new Date('2026-11-01'), {
    commitment: 'I will run two controlled experiments and document the decision from each result.',
    howWillWeKnow: 'Experiment records show the hypothesis, result and scale/change/stop decision.'
  }),
  createOwnBehaviourFrameworkV2Target({
    selectionKey: 'BHV-04-OWN-SYNTH01', behaviourKey: 'BHV-04', roleLevelCode: 'L2',
    commitment: 'I will complete four agreed coaching observations by quarter end.',
    howWillWeKnow: 'Dated observation notes show balanced feedback and agreed follow-up actions.'
  })
];

export const createBehaviourFrameworkV2TestReviews = (): IBehaviourManagerReviewEvent[] => {
  const selections = createBehaviourFrameworkV2TestSelections();
  const changed = recordBehaviourFrameworkV2ManagerReview([], selections, {
    reviewKey: 'BHV-REVIEW-SYNTH-001', selectionKey: selections[0].selectionKey, status: 'CHANGES REQUESTED',
    comment: 'Make the progress evidence more specific.', actorEmail: 'manager@example.invalid', occurredAt: '2026-10-01T09:00:00.000Z'
  });
  return recordBehaviourFrameworkV2ManagerReview(changed, selections, {
    reviewKey: 'BHV-REVIEW-SYNTH-002', selectionKey: selections[0].selectionKey, status: 'AGREED',
    comment: 'Updated wording agreed.', actorEmail: 'manager@example.invalid', occurredAt: '2026-10-02T09:00:00.000Z'
  }).map(row => ({ ...row }));
};

export const createBehaviourFrameworkV2TestEvidence = (): IBehaviourFocusQuarterEvidence[] => [{
  evidenceKey: 'BHV-EV-SYNTH-001', selectionKey: 'BHV-01-L2-01', behaviourKey: 'BHV-01', quarter: 'Q1',
  evidenceText: 'Synthetic evidence: two joint planning sessions completed and actions confirmed.',
  recordedAt: '2026-12-15T09:30:00.000Z', recordedBy: 'employee@example.invalid'
}];

export const createBehaviourFrameworkV2TestAssessments = (): IBehaviourHeadlineQuarterAssessment[] => [{
  assessmentKey: 'BHV-ASSESS-SYNTH-001', behaviourKey: 'BHV-01', quarter: 'Q1',
  employeeRating: 'Effective', managerRating: 'Exceptional', finalRating: 'Effective'
}];

export const createBehaviourFrameworkV2TestReadback = (): Readonly<IBehaviourFrameworkV2Readback> => buildBehaviourFrameworkV2Readback({
  view: 'History', catalogueKey: BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY,
  catalogueVersion: BEHAVIOUR_FRAMEWORK_V2_TEST_VERSION,
  selections: createBehaviourFrameworkV2TestSelections(), reviews: createBehaviourFrameworkV2TestReviews(),
  evidence: createBehaviourFrameworkV2TestEvidence(),
  assessments: createBehaviourFrameworkV2TestAssessments()
});
