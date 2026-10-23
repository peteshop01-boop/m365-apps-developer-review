import * as React from 'react';
import type { IManagerQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import type { BehaviourRating } from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_RATING_SCALE, getBehaviourRatingLabel } from '../services/BehaviourWorkplanPolicy';
import { BEHAVIOUR_V2_RATING_OPTIONS, getBehaviourV2RatingDisplay } from '../services/BehaviourFrameworkV2Policy';
import { PerformanceConceptGuide, quarterItemTypeLabel } from './PerformancePresentation';
import { CapturedQuarterDeliverySummary } from './ReportingViewsPage';
import styles from './PerformanceHub.module.scss';

export interface IManagerQuarterReviewPanelProps {
  contexts: IManagerQuarterReviewContext[];
  saving: boolean;
  nativeWritesHeld?: boolean;
  onRequestChanges(context: IManagerQuarterReviewContext, reason: string): Promise<void>;
  onApproveAndLock(context: IManagerQuarterReviewContext): Promise<void>;
  onOverrideRag(context: IManagerQuarterReviewContext, item: IQuarterReviewItem, rag: 'Green' | 'Amber' | 'Red', reason: string): Promise<void>;
  onAssessBehaviour(context: IManagerQuarterReviewContext, item: IQuarterReviewItem, assessment: BehaviourRating): Promise<void>;
}

const value = (numberValue?: number, textValue?: string, unit?: string): string => numberValue !== undefined
  ? `${numberValue}${unit ? ` ${unit}` : ''}`
  : textValue?.trim() || 'Not recorded';

const Row: React.FC<{ item: IQuarterReviewItem; evidenceCount: number }> = ({ item, evidenceCount }) => item.behaviourSnapshotV2 ? (
  <div className={styles.managerQuarterRow} data-behaviour-v2-value={item.behaviourSnapshotV2.valueId}>
    <div><strong>{item.behaviourSnapshotV2.valueId} · {item.behaviourSnapshotV2.valueTitle}</strong><span>{item.behaviourSnapshotV2.corporateValue}</span></div>
    <div><span>{item.behaviourSnapshotV2.roleTier} descriptor</span><strong>{item.behaviourSnapshotV2.descriptor}</strong></div>
    <div><span>{item.behaviourSnapshotV2.period} commitment</span><strong>{item.quarterTargetText || 'Not recorded'}</strong></div>
    <div><span>Employee evidence</span><strong>{item.employeeBehaviourEvidenceV2 || 'Not recorded'}</strong></div>
    <div><span>Employee self-assessment</span><strong>{getBehaviourV2RatingDisplay(item.employeeBehaviourAssessmentV2)}</strong></div>
    <div><span>Manager evidence</span><strong>{item.managerBehaviourEvidenceV2 || 'Not recorded'}</strong></div>
    <div><span>Manager assessment</span><strong>{getBehaviourV2RatingDisplay(item.managerBehaviourAssessmentV2)}</strong></div>
    <div><span>Agreed/final evidence</span><strong>{item.finalBehaviourEvidenceV2 || 'Not recorded'}</strong></div>
    <div><span>Agreed/final assessment</span><strong>{getBehaviourV2RatingDisplay(item.finalBehaviourAssessmentV2)}</strong></div>
    <div><span>Assessment labels</span><strong>1 Developing · 2 Effective · 3 Exceptional</strong></div>
  </div>
) : (
  <div className={styles.managerQuarterRow}>
    <div><strong>{item.kpiId || quarterItemTypeLabel(item.itemType)}</strong><span>{item.wording}</span></div>
    {item.itemType === 'LocalPersonal' && <>
      <div data-reporting-stream="Impact"><span>Reporting stream</span><strong>Impact (separate from Core/GOLD)</strong></div>
      <div><span>Business Contribution Area</span><strong>{item.impactAnnualDefinitionSnapshot?.classification?.businessContributionArea?.label || 'Not classified in this annual snapshot'}</strong></div>
      <div><span>Strategic Pillar</span><strong>{item.impactAnnualDefinitionSnapshot?.classification?.strategicPillar?.label || 'No Strategic Pillar'}</strong></div>
    </>}
    <div><span>{item.behaviourSnapshotV2 ? 'Period commitment' : 'Target'}</span><strong>{value(item.quarterTargetValue, item.quarterTargetText, item.unitLabel)}</strong></div>
    {!item.behaviourSnapshotV2 && <div><span>Actual</span><strong>{value(item.employeeActualValue, item.employeeActualText, item.unitLabel)}</strong></div>}
    {!item.behaviourSnapshotV2 && <div><span>Progress / RAG</span><strong>{item.progressPct !== undefined ? `${item.progressPct}% · ` : ''}{item.calculatedRag}</strong></div>}
    <div><span>Status / reflection</span><strong>{item.statusUpdate || item.behaviourReflection || 'Not recorded'}</strong></div>
    <div><span>Forecast</span><strong>{value(item.quarterEndForecastValue, item.quarterEndForecastText, item.unitLabel)}</strong></div>
    <div><span>Evidence</span><strong>{evidenceCount}</strong></div>
    <div><span>Recovery</span><strong>{item.recovery?.route ? `${item.recovery.route} · ${item.recovery.action || 'Action pending'}` : 'Not required/recorded'}</strong></div>
    <div><span>Manager override</span><strong>{item.managerOverride?.rag || 'None'}</strong></div>
    {item.itemType === 'Behaviour' && <>
      <div><span>Observable prompt</span><strong>{item.behaviourPrompt || 'Published Behaviour definition'}</strong></div>
      <div><span>Target rating</span><strong>{getBehaviourRatingLabel(item.behaviourTargetRating) || 'Not configured'}</strong></div>
      <div><span>Employee self-assessment</span><strong>{getBehaviourRatingLabel(item.employeeBehaviourRating) || 'Not assessed'}</strong></div>
      <div><span>Manager assessment</span><strong>{getBehaviourRatingLabel(item.managerBehaviourRating) || 'Not assessed'}</strong></div>
      <div><span>Agreed/final assessment</span><strong>{getBehaviourRatingLabel(item.finalBehaviourRating) || 'Pending manager decision'}</strong></div>
    </>}
  </div>
);

const DecisionPanel: React.FC<{
  context: IManagerQuarterReviewContext;
  saving: boolean;
  nativeWritesHeld?: boolean;
  onRequestChanges(context: IManagerQuarterReviewContext, reason: string): Promise<void>;
  onApproveAndLock(context: IManagerQuarterReviewContext): Promise<void>;
  onOverrideRag(context: IManagerQuarterReviewContext, item: IQuarterReviewItem, rag: 'Green' | 'Amber' | 'Red', reason: string): Promise<void>;
  onAssessBehaviour(context: IManagerQuarterReviewContext, item: IQuarterReviewItem, assessment: BehaviourRating): Promise<void>;
}> = ({ context, saving, nativeWritesHeld = false, onRequestChanges, onApproveAndLock, onOverrideRag, onAssessBehaviour }) => {
  const core = context.items.filter(item => item.itemType === 'CoreGold');
  const behaviours = context.items.filter(item => item.itemType === 'Behaviour');
  const [comment, setComment] = React.useState('');
  const [itemKey, setItemKey] = React.useState(core[0]?.quarterReviewItemKey || '');
  const [rag, setRag] = React.useState<'Green' | 'Amber' | 'Red'>('Amber');
  const [overrideReason, setOverrideReason] = React.useState('');
  const [behaviourKey, setBehaviourKey] = React.useState(behaviours[0]?.quarterReviewItemKey || '');
  const [assessment, setAssessment] = React.useState<BehaviourRating>(3);
  const [managerEvidence, setManagerEvidence] = React.useState('');
  const selected = core.find(item => item.quarterReviewItemKey === itemKey);
  const selectedBehaviour = behaviours.find(item => item.quarterReviewItemKey === behaviourKey);
  const mayDecide = context.review.state === 'Submitted' && context.review.accessState === 'ManagerDecision' && context.review.transitionStatus === 'Ready';
  return <div className={styles.managerDecisionPreview}>
    <p><strong>Submission readiness:</strong> {context.readiness.ready ? 'Ready' : `${context.readiness.blockers.length} blocker(s)`}</p>
    <label><span>Manager comment / change-request reason</span><textarea rows={2} value={comment} disabled={nativeWritesHeld || !mayDecide || saving} onChange={event => setComment(event.target.value)} /></label>
    <div>
      <button type="button" className={styles.secondaryButton} disabled={nativeWritesHeld || !mayDecide || saving || !comment.trim()} onClick={() => onRequestChanges(context, comment).catch(() => undefined)}>Request Changes</button>
      <button type="button" className={styles.saveButton} disabled={nativeWritesHeld || !mayDecide || saving || !context.readiness.ready} onClick={() => onApproveAndLock(context).catch(() => undefined)}>Approve and Lock</button>
    </div>
    <label><span>Core KPI for separate RAG Override</span><select value={itemKey} disabled={nativeWritesHeld || !mayDecide || saving} onChange={event => setItemKey(event.target.value)}>{core.map(item => <option key={item.quarterReviewItemKey} value={item.quarterReviewItemKey}>{item.kpiId} · {item.calculatedRag}</option>)}</select></label>
    <label><span>Manager RAG Override</span><select value={rag} disabled={nativeWritesHeld || !mayDecide || saving} onChange={event => setRag(event.target.value as 'Green' | 'Amber' | 'Red')}><option>Green</option><option>Amber</option><option>Red</option></select></label>
    <label><span>Override reason (mandatory)</span><textarea rows={2} value={overrideReason} disabled={nativeWritesHeld || !mayDecide || saving} onChange={event => setOverrideReason(event.target.value)} /></label>
    <button type="button" className={styles.secondaryButton} disabled={nativeWritesHeld || !mayDecide || saving || !selected || !overrideReason.trim()} onClick={() => selected && onOverrideRag(context, selected, rag, overrideReason).catch(() => undefined)}>Save RAG Override</button>
    {behaviours.length > 0 && <>
      <label><span>Behaviour for separate manager assessment</span><select value={behaviourKey} disabled={nativeWritesHeld || !mayDecide || saving} onChange={event => setBehaviourKey(event.target.value)}>{behaviours.map(item => <option key={item.quarterReviewItemKey} value={item.quarterReviewItemKey}>{item.wording}</option>)}</select></label>
      {!selectedBehaviour?.behaviourSnapshotV2 && <label><span>Manager Behaviour assessment</span><select value={assessment} disabled={nativeWritesHeld || !mayDecide || saving} onChange={event => setAssessment(Number(event.target.value) as BehaviourRating)}>{BEHAVIOUR_RATING_SCALE.map(option => <option key={option.value} value={option.value}>{option.value} — {option.label}</option>)}</select></label>}
      {selectedBehaviour?.behaviourSnapshotV2 && <label><span>Manager evidence</span><textarea rows={3} value={managerEvidence} disabled={nativeWritesHeld || !mayDecide || saving} onChange={event => setManagerEvidence(event.target.value)} /></label>}
      {selectedBehaviour?.behaviourSnapshotV2 && <label><span>Manager Behaviour assessment</span><select value={assessment > 3 ? 3 : assessment} disabled={nativeWritesHeld || !mayDecide || saving} onChange={event => setAssessment(Number(event.target.value) as BehaviourRating)}>{BEHAVIOUR_V2_RATING_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.displayLabel}</option>)}</select></label>}
      <button type="button" className={styles.secondaryButton} disabled={nativeWritesHeld || !mayDecide || saving || !selectedBehaviour || Boolean(selectedBehaviour.behaviourSnapshotV2 && !managerEvidence.trim())} onClick={() => selectedBehaviour && onAssessBehaviour(context, selectedBehaviour.behaviourSnapshotV2 ? { ...selectedBehaviour, managerBehaviourEvidenceV2: managerEvidence.trim() } : selectedBehaviour, assessment > 3 ? 3 : assessment).catch(() => undefined)}>Save Behaviour assessment</button>
    </>}
    {!mayDecide && <p>Manager decisions become available only when the submitted review is ready and assigned to you.</p>}
  </div>;
};

const ManagerQuarterReviewPanel: React.FC<IManagerQuarterReviewPanelProps> = ({ contexts, saving, nativeWritesHeld = false, onRequestChanges, onApproveAndLock, onOverrideRag, onAssessBehaviour }) => (
  <section className={styles.managerQuarterPanel} aria-labelledby="manager-quarter-heading">
    <span className={styles.sectionLabel}>Quarterly manager preparation</span>
    <h2 id="manager-quarter-heading">Quarter Review view</h2>
    <p>Only current direct-report results assigned to the signed-in manager are shown. Decision controls appear when a submitted review is ready for manager action.</p>
    <PerformanceConceptGuide audience="manager" />
    {contexts.length === 0 ? <div className={styles.emptyState}><strong>No direct-report Quarter Review is available.</strong><span>Return to My Team or check again after an employee submits a quarterly review.</span></div> : contexts.map(context => (
      <article className={styles.managerQuarterReview} key={context.review.quarterReviewKey}>
        <header><div><strong>{context.employee.displayName}</strong><span>{context.employee.email}</span></div><div><strong>{context.lifecycle.quarterName}</strong><span>{context.review.state}</span></div></header>
        <CapturedQuarterDeliverySummary source={{ review: context.review, items: context.items, evidence: context.evidence }} />
        {context.messages.map(message => <p className={styles.securityWarning} key={message}>{message}</p>)}
        <section><h3>Core KPI results</h3>{context.items.filter(item => item.itemType === 'CoreGold').map(item => <Row key={item.quarterReviewItemKey} item={item} evidenceCount={context.evidence.filter(row => row.quarterReviewItemKey === item.quarterReviewItemKey).length} />)}</section>
        <section data-reporting-stream="Impact"><h3>Impact KPI results</h3><p>Impact remains separate from organisational Core/GOLD reporting.</p>{context.items.filter(item => item.itemType === 'LocalPersonal').length === 0 ? <p>No Impact KPI result is stored.</p> : context.items.filter(item => item.itemType === 'LocalPersonal').map(item => <Row key={item.quarterReviewItemKey} item={item} evidenceCount={context.evidence.filter(row => row.quarterReviewItemKey === item.quarterReviewItemKey).length} />)}</section>
        <section><h3>Behaviour reflections</h3>{context.items.filter(item => item.itemType === 'Behaviour').map(item => <Row key={item.quarterReviewItemKey} item={item} evidenceCount={context.evidence.filter(row => row.quarterReviewItemKey === item.quarterReviewItemKey).length} />)}</section>
        <DecisionPanel context={context} saving={saving} nativeWritesHeld={nativeWritesHeld} onRequestChanges={onRequestChanges} onApproveAndLock={onApproveAndLock} onOverrideRag={onOverrideRag} onAssessBehaviour={onAssessBehaviour} />
      </article>
    ))}
  </section>
);

export default ManagerQuarterReviewPanel;
