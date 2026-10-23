import * as React from 'react';
import * as ReactDOM from 'react-dom';
import BehaviourFrameworkV2Panel from '../components/BehaviourFrameworkV2Panel';
import type {
  BehaviourFrameworkV2Rating,
  BehaviourFrameworkV2View,
  IBehaviourFocusQuarterEvidence,
  IBehaviourFocusTargetSelection,
  IBehaviourHeadlineQuarterAssessment,
  IBehaviourManagerReviewEvent,
  BehaviourFrameworkV2ManagerStatus
} from '../services/BehaviourFrameworkV2';
import {
  createOwnBehaviourFrameworkV2Target,
  recordBehaviourFrameworkV2ManagerReview,
  selectBehaviourFrameworkV2Target
} from '../services/BehaviourFrameworkV2';
import {
  behaviourFrameworkV2TestCatalogue,
  createBehaviourFrameworkV2TestAssessments,
  createBehaviourFrameworkV2TestEvidence,
  createBehaviourFrameworkV2TestReviews,
  createBehaviourFrameworkV2TestSelections
} from './BehaviourFrameworkV2TestData';

interface IBehaviourFrameworkV2HarnessState {
  view: BehaviourFrameworkV2View;
  selections: IBehaviourFocusTargetSelection[];
  reviews: IBehaviourManagerReviewEvent[];
  evidence: IBehaviourFocusQuarterEvidence[];
  assessments: IBehaviourHeadlineQuarterAssessment[];
}

let lastState: IBehaviourFrameworkV2HarnessState | undefined;

const Harness: React.FC<{ initialView: BehaviourFrameworkV2View }> = ({ initialView }) => {
  const [view, setView] = React.useState<BehaviourFrameworkV2View>(initialView);
  const [selections, setSelections] = React.useState<IBehaviourFocusTargetSelection[]>(createBehaviourFrameworkV2TestSelections);
  const [reviews, setReviews] = React.useState<IBehaviourManagerReviewEvent[]>(createBehaviourFrameworkV2TestReviews);
  const [evidence, setEvidence] = React.useState<IBehaviourFocusQuarterEvidence[]>(createBehaviourFrameworkV2TestEvidence);
  const [assessments, setAssessments] = React.useState<IBehaviourHeadlineQuarterAssessment[]>(createBehaviourFrameworkV2TestAssessments);
  lastState = { view, selections, reviews, evidence, assessments };
  const toggle = (targetKey: string): void => setSelections(current => current.some(row => row.selectionKey === targetKey)
    ? current.filter(row => row.selectionKey !== targetKey)
    : [...current, selectBehaviourFrameworkV2Target(behaviourFrameworkV2TestCatalogue, 'L2', targetKey, new Date('2026-11-01'))]);
  const addOwn = (behaviourKey: IBehaviourFocusTargetSelection['behaviourKey']): void => setSelections(current => [
    ...current,
    createOwnBehaviourFrameworkV2Target({
      selectionKey: `${behaviourKey}-OWN-HARNESS${current.length + 1}`, behaviourKey, roleLevelCode: 'L2',
      commitment: 'I will complete the employee-authored local commitment.',
      howWillWeKnow: 'A dated local record and colleague feedback show progress.'
    })
  ]);
  const updateCommitment = (selectionKey: string, field: 'commitment' | 'howWillWeKnow', value: string): void =>
    setSelections(current => current.map(selection => selection.selectionKey === selectionKey
      ? { ...selection, [field]: value } : selection));
  const review = (selectionKey: string, status: BehaviourFrameworkV2ManagerStatus, comment: string): void => setReviews(current =>
    recordBehaviourFrameworkV2ManagerReview(current, selections, {
      reviewKey: `BHV-REVIEW-HARNESS-${current.length + 1}`, selectionKey, status, comment,
      actorEmail: 'manager@example.invalid', occurredAt: `2026-10-${(`0${current.length + 3}`).slice(-2)}T09:00:00.000Z`
    }).map(row => ({ ...row })));
  const updateEvidence = (selectionKey: string, value: string): void => setEvidence(current => {
    const existing = current.find(row => row.selectionKey === selectionKey && row.quarter === 'Q1');
    if (existing) return current.map(row => row === existing ? { ...row, evidenceText: value } : row);
    const selection = selections.find(row => row.selectionKey === selectionKey);
    return selection ? [...current, { evidenceKey: `BHV-EV-${selectionKey}`, selectionKey,
      behaviourKey: selection.behaviourKey, quarter: 'Q1', evidenceText: value,
      recordedAt: '2026-12-15T09:30:00.000Z', recordedBy: 'employee@example.invalid' }] : current;
  });
  const updateAssessment = (
    behaviourKey: IBehaviourHeadlineQuarterAssessment['behaviourKey'],
    field: 'employeeRating' | 'managerRating' | 'finalRating',
    rating: BehaviourFrameworkV2Rating | undefined
  ): void => setAssessments(current => {
    const existing = current.find(row => row.behaviourKey === behaviourKey && row.quarter === 'Q1');
    if (existing) return current.map(row => row === existing ? { ...row, [field]: rating } : row);
    return [...current, { assessmentKey: `BHV-ASSESS-${behaviourKey}-Q1`, behaviourKey, quarter: 'Q1', [field]: rating }];
  });
  const manager = view === 'Review' || view === 'QuarterlyManager';
  return <main style={{ maxWidth: 1180, margin: '0 auto', padding: 16 }}>
    <nav aria-label="Behaviour framework views">
      {(['Draft', 'Review', 'History', 'QuarterlyEmployee', 'QuarterlyManager'] as BehaviourFrameworkV2View[])
        .map(option => <button type="button" key={option} onClick={() => setView(option)}>{option}</button>)}
    </nav>
    <BehaviourFrameworkV2Panel catalogue={behaviourFrameworkV2TestCatalogue} roleLevelCode="L2"
      audience={manager ? 'Manager' : 'Employee'} view={view} selections={selections} reviews={reviews} evidence={evidence}
      assessments={assessments} quarter="Q1" asOf={new Date('2026-11-01')}
      onToggleCatalogueTarget={toggle} onAddOwnTarget={addOwn} onCommitmentChange={updateCommitment} onManagerReview={review}
      onEvidenceChange={updateEvidence} onAssessmentChange={updateAssessment} />
  </main>;
};

export const mountBehaviourFrameworkV2Harness = (
  host: HTMLElement,
  initialView: BehaviourFrameworkV2View = 'Draft'
): void => { ReactDOM.render(React.createElement(Harness, { initialView }), host); };

export const unmountBehaviourFrameworkV2Harness = (host: HTMLElement): void => {
  ReactDOM.unmountComponentAtNode(host);
};

export const getBehaviourFrameworkV2HarnessState = (): IBehaviourFrameworkV2HarnessState | undefined => lastState
  ? JSON.parse(JSON.stringify(lastState)) as IBehaviourFrameworkV2HarnessState
  : undefined;
