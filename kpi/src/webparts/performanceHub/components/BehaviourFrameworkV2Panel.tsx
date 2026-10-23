import * as React from 'react';
import type { BehaviourKey, BehaviourRoleLevelCode } from '../models/BehaviourWorkplanModels';
import type {
  BehaviourFrameworkV2Quarter,
  BehaviourFrameworkV2Rating,
  BehaviourFrameworkV2ManagerStatus,
  BehaviourFrameworkV2View,
  IBehaviourFocusQuarterEvidence,
  IBehaviourFocusTargetSelection,
  IBehaviourFrameworkV2Catalogue,
  IBehaviourHeadlineQuarterAssessment,
  IBehaviourManagerReviewEvent
} from '../services/BehaviourFrameworkV2';
import {
  BEHAVIOUR_FRAMEWORK_V2_COMMITMENT_PROMPT,
  BEHAVIOUR_FRAMEWORK_V2_EVIDENCE_PROMPT,
  BEHAVIOUR_FRAMEWORK_V2_RATINGS,
  BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS,
  getBehaviourFrameworkV2Choices,
  inspectBehaviourFrameworkV2Selections
} from '../services/BehaviourFrameworkV2';
import styles from './BehaviourFrameworkV2Panel.module.scss';

export interface IBehaviourFrameworkV2PanelProps {
  catalogue: IBehaviourFrameworkV2Catalogue;
  roleLevelCode: BehaviourRoleLevelCode;
  audience: 'Employee' | 'Manager';
  view: BehaviourFrameworkV2View;
  selections: ReadonlyArray<IBehaviourFocusTargetSelection>;
  evidence?: ReadonlyArray<IBehaviourFocusQuarterEvidence>;
  assessments?: ReadonlyArray<IBehaviourHeadlineQuarterAssessment>;
  reviews?: ReadonlyArray<IBehaviourManagerReviewEvent>;
  quarter?: BehaviourFrameworkV2Quarter;
  asOf?: Date;
  onToggleCatalogueTarget?(targetKey: string): void;
  onAddOwnTarget?(behaviourKey: BehaviourKey, focusKey: string, focusTitle: string): void;
  onCommitmentChange?(selectionKey: string, field: 'commitment' | 'howWillWeKnow', value: string): void;
  onManagerReview?(selectionKey: string, status: BehaviourFrameworkV2ManagerStatus, comment: string): void;
  onEvidenceChange?(selectionKey: string, value: string): void;
  onAssessmentChange?(
    behaviourKey: BehaviourKey,
    field: 'employeeRating' | 'managerRating' | 'finalRating',
    rating: BehaviourFrameworkV2Rating | undefined
  ): void;
}

const selectedByKey = (
  selections: ReadonlyArray<IBehaviourFocusTargetSelection>
): ReadonlyMap<string, IBehaviourFocusTargetSelection> => new Map(selections.map(row => [row.selectionKey, row]));

const readbackCard = (
  selection: IBehaviourFocusTargetSelection,
  evidence: ReadonlyArray<IBehaviourFocusQuarterEvidence>,
  reviews: ReadonlyArray<IBehaviourManagerReviewEvent>,
  quarter: BehaviourFrameworkV2Quarter | undefined,
  editable: boolean,
  managerReview: boolean,
  reviewComment: string,
  onReviewComment: (value: string) => void,
  onCommitmentChange?: IBehaviourFrameworkV2PanelProps['onCommitmentChange'],
  onManagerReview?: IBehaviourFrameworkV2PanelProps['onManagerReview']
): React.ReactElement => {
  const matchingEvidence = evidence.filter(row => row.selectionKey === selection.selectionKey
    && (!quarter || row.quarter === quarter));
  const matchingReviews = reviews.filter(row => row.selectionKey === selection.selectionKey);
  return <article className={styles.targetCard} key={selection.selectionKey}
    data-selected-target={selection.selectionKey} data-target-source={selection.source}>
    <div className={styles.targetHeading}>
      <strong>{selection.focusArea}</strong>
      <span>{selection.source === 'Own' ? 'Own commitment' : 'Approved example / prompt'}</span>
    </div>
    {selection.selectedExampleText && <p data-readback="example"><strong>Selected example:</strong> {selection.selectedExampleText}</p>}
    {editable ? <div className={styles.commitmentEditor}>
      <label><strong>MY COMMITMENT</strong><span>{BEHAVIOUR_FRAMEWORK_V2_COMMITMENT_PROMPT}</span>
        <textarea required rows={3} data-commitment-input={selection.selectionKey} value={selection.commitment}
          onChange={event => onCommitmentChange?.(selection.selectionKey, 'commitment', event.target.value)} /></label>
      <label><strong>HOW WILL WE KNOW?</strong><span>{BEHAVIOUR_FRAMEWORK_V2_EVIDENCE_PROMPT}</span>
        <textarea required rows={3} data-how-will-we-know-input={selection.selectionKey} value={selection.howWillWeKnow}
          onChange={event => onCommitmentChange?.(selection.selectionKey, 'howWillWeKnow', event.target.value)} /></label>
    </div> : <dl>
      <div><dt>MY COMMITMENT</dt><dd data-readback="commitment">{selection.commitment}</dd></div>
      <div><dt>HOW WILL WE KNOW?</dt><dd data-readback="how-will-we-know">{selection.howWillWeKnow}</dd></div>
      <div><dt>Version</dt><dd>{selection.catalogueVersion}</dd></div>
    </dl>}
    {matchingReviews.length > 0 && <ol className={styles.reviewHistory} aria-label={`${selection.focusArea} manager review history`}>
      {matchingReviews.map(review => <li key={review.reviewKey} data-review-status={review.status}>
        <strong>{review.status}</strong><span>{review.comment || 'No comment recorded.'}</span>
        <small>{review.actorEmail} · {review.occurredAt}</small>
      </li>)}
    </ol>}
    {managerReview && onManagerReview && <div className={styles.managerReview}>
      <label><strong>Manager review comment</strong><textarea rows={2} value={reviewComment}
        data-manager-review-comment={selection.selectionKey} onChange={event => onReviewComment(event.target.value)} /></label>
      <div><button type="button" onClick={() => onManagerReview(selection.selectionKey, 'AGREED', reviewComment)}>AGREED</button>
        <button type="button" disabled={!reviewComment.trim()}
          onClick={() => onManagerReview(selection.selectionKey, 'CHANGES REQUESTED', reviewComment)}>CHANGES REQUESTED</button></div>
    </div>}
    {matchingEvidence.map(row => <div className={styles.evidenceReadback} key={row.evidenceKey}
      data-evidence-readback={row.evidenceKey}><strong>{row.quarter} evidence</strong><p>{row.evidenceText}</p></div>)}
  </article>;
};

const ratingValue = (
  assessments: ReadonlyArray<IBehaviourHeadlineQuarterAssessment>,
  behaviourKey: BehaviourKey,
  quarter: BehaviourFrameworkV2Quarter,
  field: 'employeeRating' | 'managerRating' | 'finalRating'
): BehaviourFrameworkV2Rating | undefined => assessments.find(row => row.behaviourKey === behaviourKey
  && row.quarter === quarter)?.[field];

const BehaviourFrameworkV2Panel: React.FC<IBehaviourFrameworkV2PanelProps> = ({
  catalogue, roleLevelCode, audience, view, selections, reviews = [], evidence = [], assessments = [], quarter = 'Q1', asOf,
  onToggleCatalogueTarget, onAddOwnTarget, onCommitmentChange, onManagerReview, onEvidenceChange, onAssessmentChange
}) => {
  const [reviewComments, setReviewComments] = React.useState<Record<string, string>>({});
  const role = BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS.find(row => row.code === roleLevelCode);
  const selected = selectedByKey(selections);
  const inspection = inspectBehaviourFrameworkV2Selections(selections);
  const selectionEditable = audience === 'Employee' && view === 'Draft'
    && Boolean(onToggleCatalogueTarget) && Boolean(onCommitmentChange);
  const managerReview = audience === 'Manager' && view === 'Review';
  const employeeQuarterly = audience === 'Employee' && view === 'QuarterlyEmployee';
  const managerQuarterly = audience === 'Manager' && view === 'QuarterlyManager';

  return <section className={styles.framework} aria-labelledby="behaviour-framework-v2-heading"
    data-behaviour-framework-v2={view} data-audience={audience}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>KCCC Behaviours · {catalogue.catalogueVersion}</span>
        <h2 id="behaviour-framework-v2-heading">Behaviour commitments</h2>
        <p>Five headline Behaviours, filtered for {role?.name}. Approved catalogue entries are examples/prompts, not mandatory targets.</p></div>
      <div className={styles.guidance} data-selection-guidance={inspection.guidance}>
        <strong>{inspection.selectedCount} selected</strong>
        <span>Normally about 3–5 overall. This is guidance, not a hard cap.</span>
      </div>
    </header>
    {inspection.issues.length > 0 && <p className={styles.validationNotice} role="alert">
      Complete MY COMMITMENT and HOW WILL WE KNOW for every selected Behaviour commitment.
    </p>}

    {catalogue.headlineBehaviours.map(headline => {
      const choices = getBehaviourFrameworkV2Choices(catalogue, roleLevelCode, headline.behaviourKey, asOf);
      const focuses = Array.from(new Map(choices.map(choice => [choice.focusKey, {
        focusKey: choice.focusKey, focusTitle: choice.focusArea
      }])).values());
      const selectedForHeadline = selections.filter(row => row.behaviourKey === headline.behaviourKey);
      const employeeRating = ratingValue(assessments, headline.behaviourKey, quarter, 'employeeRating');
      const managerRating = ratingValue(assessments, headline.behaviourKey, quarter, 'managerRating');
      const finalRating = ratingValue(assessments, headline.behaviourKey, quarter, 'finalRating');
      return <article className={styles.behaviour} key={headline.behaviourKey} data-headline-behaviour={headline.behaviourKey}>
        <div className={styles.behaviourHeading}><span>{headline.behaviourKey}</span><h3>{headline.title}</h3></div>
        <ul className={styles.focusCues} aria-label={`${headline.title} focus cues`}>
          {focuses.map(focus => <li key={focus.focusKey}>{focus.focusTitle}</li>)}
        </ul>

        <fieldset className={styles.choices} disabled={!selectionEditable}>
          <legend>{role?.name} focus areas and approved examples / prompts</legend>
          {choices.map(choice => <label className={styles.choice} key={choice.targetKey}>
            <input type="checkbox" data-focus-choice={choice.targetKey}
              disabled={!selectionEditable}
              checked={selected.has(choice.targetKey)}
              onChange={() => onToggleCatalogueTarget?.(choice.targetKey)} />
            <span><strong>{choice.focusArea}</strong><small>{choice.suggestedTarget}</small></span>
          </label>)}
        </fieldset>

        {selectionEditable && onAddOwnTarget && focuses.map(focus => <button type="button"
          className={styles.ownTargetButton} key={focus.focusKey} data-add-own-target={focus.focusKey}
          onClick={() => onAddOwnTarget(headline.behaviourKey, focus.focusKey, focus.focusTitle)}>
          + WRITE MY OWN BEHAVIOUR COMMITMENT FOR {focus.focusTitle}
        </button>)}

        <section className={styles.readback} aria-label={`${headline.title} selected commitment readback`}>
          <h4>{view === 'Draft' ? 'Draft selection readback' : view === 'History' ? 'Historical readback' : 'Review readback'}</h4>
          {!selectedForHeadline.length && <p>No Behaviour commitment selected under this headline.</p>}
          <div className={styles.targetGrid}>{selectedForHeadline.map(row => readbackCard(
            row, evidence, reviews, quarter, selectionEditable, managerReview, reviewComments[row.selectionKey] || '',
            value => setReviewComments(current => ({ ...current, [row.selectionKey]: value })),
            onCommitmentChange, onManagerReview
          ))}</div>
        </section>

        {(employeeQuarterly || managerQuarterly) && selectedForHeadline.map(selection => {
          const value = evidence.find(row => row.selectionKey === selection.selectionKey && row.quarter === quarter)?.evidenceText || '';
          return <label className={styles.quarterEvidence} key={selection.selectionKey}>
            <span>{quarter} evidence for {selection.focusArea}</span>
            <textarea rows={3} data-evidence-input={selection.selectionKey} value={value}
              readOnly={!employeeQuarterly || !onEvidenceChange}
              onChange={event => onEvidenceChange?.(selection.selectionKey, event.target.value)} />
          </label>;
        })}

        {(employeeQuarterly || managerQuarterly) && <div className={styles.assessment} data-headline-assessment={headline.behaviourKey}>
          <label><span>Employee assessment</span><select data-rating-field="employeeRating"
            value={employeeRating || ''} disabled={!employeeQuarterly || !onAssessmentChange}
            onChange={event => onAssessmentChange?.(headline.behaviourKey, 'employeeRating', event.target.value
              ? event.target.value as BehaviourFrameworkV2Rating : undefined)}>
            <option value="">Not assessed</option>{BEHAVIOUR_FRAMEWORK_V2_RATINGS.map(rating => <option key={rating}>{rating}</option>)}
          </select></label>
          <label><span>Manager assessment</span><select data-rating-field="managerRating"
            value={managerRating || ''} disabled={!managerQuarterly || !onAssessmentChange}
            onChange={event => onAssessmentChange?.(headline.behaviourKey, 'managerRating', event.target.value
              ? event.target.value as BehaviourFrameworkV2Rating : undefined)}>
            <option value="">Not assessed</option>{BEHAVIOUR_FRAMEWORK_V2_RATINGS.map(rating => <option key={rating}>{rating}</option>)}
          </select></label>
          <label><span>Final headline rating</span><select data-rating-field="finalRating"
            value={finalRating || ''} disabled={!managerQuarterly || !onAssessmentChange}
            onChange={event => onAssessmentChange?.(headline.behaviourKey, 'finalRating', event.target.value
              ? event.target.value as BehaviourFrameworkV2Rating : undefined)}>
            <option value="">Not assessed</option>{BEHAVIOUR_FRAMEWORK_V2_RATINGS.map(rating => <option key={rating}>{rating}</option>)}
          </select></label>
        </div>}
      </article>;
    })}
  </section>;
};

export default BehaviourFrameworkV2Panel;
