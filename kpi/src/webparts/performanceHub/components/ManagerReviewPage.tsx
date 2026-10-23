import * as React from 'react';
import type { IManagerWorkplanReviewContext } from '../models/ProductionModels';
import type { IManagerQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import type { BehaviourRating } from '../models/BehaviourWorkplanModels';
import { annualWorkplanLifecycleNotice } from '../services/WorkplanLifecycle';
import { getBehaviourRatingLabel } from '../services/BehaviourWorkplanPolicy';
import ManagerQuarterReviewPanel from './ManagerQuarterReviewPanel';
import { CapturedDeliveryWeightingPanel } from './CategoryWeightingPanel';
import { ImpactClassificationFields } from './ImpactClassificationFields';
import { PerformanceConceptGuide, scoringApproachLabel, workplanRoleLabel } from './PerformancePresentation';
import styles from './PerformanceHub.module.scss';

export interface IManagerReviewPageProps {
  contexts: IManagerWorkplanReviewContext[];
  quarterContexts: IManagerQuarterReviewContext[];
  saving: boolean;
  message?: string;
  onRequestChanges(context: IManagerWorkplanReviewContext, reason: string): Promise<void>;
  onApproveAndLock(context: IManagerWorkplanReviewContext): Promise<void>;
  onRequestQuarterChanges(context: IManagerQuarterReviewContext, reason: string): Promise<void>;
  onApproveAndLockQuarter(context: IManagerQuarterReviewContext): Promise<void>;
  onOverrideQuarterRag(context: IManagerQuarterReviewContext, item: IQuarterReviewItem, rag: 'Green' | 'Amber' | 'Red', reason: string): Promise<void>;
  onAssessQuarterBehaviour(context: IManagerQuarterReviewContext, item: IQuarterReviewItem, assessment: BehaviourRating): Promise<void>;
}

const formatDateTime = (value?: string): string => value
  ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'Not recorded';

const formatTarget = (numberValue?: number, textValue?: string, unit?: string): string => numberValue !== undefined
  ? `${numberValue}${unit?.trim() ? ` ${unit.trim()}` : ''}`
  : textValue?.trim() || 'Not recorded';

const eventLabel: Record<string, string> = {
  WorkplanSubmitted: 'Submitted',
  WorkplanChangesRequested: 'Changes requested',
  WorkplanResubmitted: 'Resubmitted',
  WorkplanApproved: 'Approved',
  WorkplanLocked: 'Locked'
};

const labelForAuditEvent = (event: IManagerWorkplanReviewContext['auditEvents'][number]): string =>
  event.eventType === 'WorkplanChangesRequested' && event.actorRole === 'SystemAdmin'
    && Boolean(event.sourceReference?.startsWith('CONTROL-'))
    ? 'Controlled correction opened'
    : eventLabel[event.eventType] || event.eventType;

const ManagerWorkplanCard: React.FC<{
  context: IManagerWorkplanReviewContext;
  saving: boolean;
  onRequestChanges(context: IManagerWorkplanReviewContext, reason: string): Promise<void>;
  onApproveAndLock(context: IManagerWorkplanReviewContext): Promise<void>;
}> = ({ context, saving, onRequestChanges, onApproveAndLock }) => {
  const [reason, setReason] = React.useState('');
  const activeCore = context.coreItems.filter(item => item.activeInWorkplan);
  const activePersonal = context.personalItems.filter(item => item.activeInWorkplan);
  const activeBehaviours = context.behaviourItems.filter(item => item.activeInWorkplan);
  const behaviourV2 = activeBehaviours.some(item => Boolean(item.behaviourSnapshotV2));
  const catalogue = new Map(context.coreCatalogue.map(item => [item.kpiId, item]));
  const definitions = new Map(context.behaviours.map(item => [item.behaviourId, item]));
  const mayDecide = context.workplan.state === 'Submitted'
    && context.workplan.accessState === 'ManagerDecision'
    && context.workplan.transitionStatus === 'Ready';
  const auditEvents = context.auditEvents.slice().sort((left, right) => left.eventAt.localeCompare(right.eventAt));

  return <article className={styles.managerWorkplan}>
    <header><div><strong>{context.employee.displayName}</strong><span>{context.employee.email}</span></div><span className={styles.statusPill}>{context.workplan.state}</span></header>
    <dl className={styles.managerFacts}>
      <div><dt>Manager</dt><dd>{context.manager.displayName}<br /><small>{context.manager.email}</small></dd></div>
      <div><dt>Performance year</dt><dd>{context.workplan.performanceYear}</dd></div>
      <div><dt>Submitted / resubmitted</dt><dd>{formatDateTime(context.workplan.submittedAt)}</dd></div>
      {!behaviourV2 && <div><dt>Workplan planning weights</dt><dd>{context.workplan.coreCategoryWeight}% Core · {context.workplan.personalCategoryWeight}% Impact · {context.workplan.behaviourCategoryWeight}% Behaviours</dd></div>}
      {!behaviourV2 && <div><dt>Category weighting reason</dt><dd>{context.workplan.categoryWeightReason?.trim() || 'No variance reason recorded.'}</dd></div>}
      {behaviourV2 && <div><dt>Behaviour category treatment</dt><dd>Unweighted in KCCC-BEHAVIOUR|v02; the legacy category balance is not applied.</dd></div>}
      <div><dt>Validation</dt><dd>{context.readiness.ready ? 'Submission content valid' : `${context.readiness.blockers.length} integrity blocker(s)`}</dd></div>
      <div><dt>Storage access</dt><dd>Controlled by your assigned workspace permissions</dd></div>
    </dl>
    <PerformanceConceptGuide audience="manager" />
    <CapturedDeliveryWeightingPanel configuration={context.workplan.overallDeliveryWeightConfiguration} workplanState={context.workplan.state} />
    {context.workplan.managerDecisionComment && <div className={styles.changeRequestNotice}><span className={styles.sectionLabel}>Latest change-request comment</span><strong>{context.workplan.managerDecisionComment}</strong></div>}
    <section><h3>Core</h3>{activeCore.map(item => <div className={styles.managerRow} key={item.naturalKey}><strong>{item.kpiId} · {catalogue.get(item.kpiId)?.wording || 'Controlled KPI wording unavailable'}</strong><span>{item.coreWorkplanWeight}% planning weight · {workplanRoleLabel(item.employeeKpiRole)}</span></div>)}</section>
    <section aria-label="Read-only Impact KPI definitions">
      <h3>Impact</h3>
      {activePersonal.length === 0 ? <p>No Impact KPI is included in this Workplan.</p> : activePersonal.map((item, index) => <article className={styles.managerDefinitionCard} key={item.naturalKey}>
        <header><div><span className={styles.sectionLabel}>Impact KPI {index + 1}</span><strong>{item.wording || 'Wording not recorded'}</strong></div><span>{item.personalItemWeight ?? 0}% planning weight</span></header>
        <dl className={styles.managerDetailGrid}>
          <div><dt>Description</dt><dd>{item.description?.trim() || 'Not recorded'}</dd></div>
          <div><dt>How progress is measured</dt><dd>{item.measure?.trim() || 'Not recorded'}</dd></div>
          <div><dt>Unit</dt><dd>{item.unitLabel?.trim() || 'Not recorded'}</dd></div>
          <div><dt>How delivery is assessed</dt><dd>{scoringApproachLabel(item.scoringDirection)}</dd></div>
          {item.baselineValue !== undefined && <div><dt>Starting point</dt><dd>{formatTarget(item.baselineValue, undefined, item.unitLabel)}</dd></div>}
          <div><dt>Annual target</dt><dd>{formatTarget(item.yearEndTargetValue, item.yearEndTargetText, item.unitLabel)}</dd></div>
        </dl>
        <ImpactClassificationFields id={`manager-impact-${encodeURIComponent(item.workplanItemKey)}`} classification={item.impactClassification} disabled />
        <div className={styles.managerQuarterTargets}>
          <h4>Quarter targets</h4>
          <dl>
            <div><dt>Q1</dt><dd>{formatTarget(item.q1TargetValue, item.q1TargetText, item.unitLabel)}</dd></div>
            <div><dt>Q2</dt><dd>{formatTarget(item.q2TargetValue, item.q2TargetText, item.unitLabel)}</dd></div>
            <div><dt>Q3</dt><dd>{formatTarget(item.q3TargetValue, item.q3TargetText, item.unitLabel)}</dd></div>
            <div><dt>Q4</dt><dd>{formatTarget(item.q4TargetValue, item.q4TargetText, item.unitLabel)}</dd></div>
          </dl>
        </div>
      </article>)}
    </section>
    <section aria-label="Read-only Behaviour assignments">
      <h3>Behaviours</h3>
      {activeBehaviours.length === 0 ? <p>No active Behaviour assignment is recorded.</p> : activeBehaviours.map(item => {
        if (item.behaviourSnapshotV2) return <article className={styles.managerDefinitionCard} key={item.naturalKey} data-behaviour-v2-value={item.behaviourSnapshotV2.valueId}>
          <header><div><span className={styles.sectionLabel}>{item.behaviourSnapshotV2.valueId} · {item.behaviourSnapshotV2.corporateValue}</span><strong>{item.behaviourSnapshotV2.valueTitle}</strong></div><span>{item.behaviourSnapshotV2.roleTier}</span></header>
          <p>{item.behaviourSnapshotV2.descriptor}</p><dl className={styles.managerDetailGrid}><div><dt>Employee commitment</dt><dd>{item.behaviourCommitmentV2 || 'Not recorded'}</dd></div><div><dt>Assessment labels</dt><dd>1 Developing · 2 Effective · 3 Exceptional</dd></div></dl>
          <div className={styles.managerQuarterTargets}><h4>{item.behaviourSnapshotV2.cadence} commitments</h4><dl>{item.behaviourSnapshotV2.periodKeys.map(period => <div key={period}><dt>{period}</dt><dd>{item.behaviourPeriodCommitmentsV2?.[period] || 'Not recorded'}</dd></div>)}</dl></div>
          <small>Stored immutable framework {item.behaviourSnapshotV2.frameworkVersion}. Effective is guidance, not a target; no weight, average or RAG is calculated.</small>
        </article>;
        const definition = definitions.get(item.behaviourId);
        return <article className={styles.managerDefinitionCard} key={item.naturalKey}>
          <header><div><span className={styles.sectionLabel}>Behaviour commitment</span><strong>{definition?.title || 'Controlled Behaviour unavailable'}</strong></div><span>{item.behaviourItemWeight ?? 0}% planning weight</span></header>
          <dl className={styles.managerDetailGrid}>
            <div><dt>Published Behaviour definition</dt><dd>{definition?.description || 'Not recorded'}</dd></div>
            <div><dt>Objective title</dt><dd>{item.objectiveTitle?.trim() || 'Not recorded'}</dd></div>
            <div><dt>Objective description</dt><dd>{item.objectiveDescription?.trim() || 'Not recorded'}</dd></div>
            <div><dt>Measure</dt><dd>{item.measure?.trim() || 'Not recorded'}</dd></div>
            <div><dt>Unit</dt><dd>{item.unit?.trim() || 'Not recorded'}</dd></div>
            <div><dt>Evidence definition</dt><dd>{item.evidenceDefinition?.trim() || 'Not recorded'}</dd></div>
          </dl>
          <div className={styles.managerQuarterTargets}>
            <h4>Quarter commitments and target ratings</h4>
            <dl>
              <div><dt>Q1</dt><dd>{item.q1TargetText?.trim() || 'Not recorded'}<small>Target rating: {getBehaviourRatingLabel(item.q1TargetRating ?? item.targetRating) || 'Not recorded'}</small></dd></div>
              <div><dt>Q2</dt><dd>{item.q2TargetText?.trim() || 'Not recorded'}<small>Target rating: {getBehaviourRatingLabel(item.q2TargetRating ?? item.targetRating) || 'Not recorded'}</small></dd></div>
              <div><dt>Q3</dt><dd>{item.q3TargetText?.trim() || 'Not recorded'}<small>Target rating: {getBehaviourRatingLabel(item.q3TargetRating ?? item.targetRating) || 'Not recorded'}</small></dd></div>
              <div><dt>Q4</dt><dd>{item.q4TargetText?.trim() || 'Not recorded'}<small>Target rating: {getBehaviourRatingLabel(item.q4TargetRating ?? item.targetRating) || 'Not recorded'}</small></dd></div>
            </dl>
          </div>
        </article>;
      })}
    </section>
    <section className={styles.auditSummary} aria-label="Workplan transition audit summary">
      <h3>Transition history</h3>
      {auditEvents.length === 0 ? <p>No Workplan audit event is available.</p> : <ol>{auditEvents.map(event => <li key={event.id}><strong>{labelForAuditEvent(event)}</strong><span>{formatDateTime(event.eventAt)} · {event.actorEmail}</span>{event.reason && <small>{event.reason}</small>}</li>)}</ol>}
    </section>
    {mayDecide ? <section className={styles.managerDecisionPanel} aria-label="Manager review actions">
      <div><span className={styles.sectionLabel}>Manager decision</span><h3>Review submitted Workplan</h3><p>Approve the submitted Workplan or request specific employee changes. These actions do not edit employee content.</p></div>
      <label><span>Change request reason</span><textarea rows={3} value={reason} disabled={saving} onChange={event => setReason(event.target.value)} placeholder="Required when requesting changes" /></label>
      <div className={styles.managerActionButtons}>
        <button type="button" className={styles.secondaryButton} disabled={saving || !reason.trim()} onClick={() => onRequestChanges(context, reason).catch(() => undefined)}>{saving ? 'Processing…' : 'Request Changes'}</button>
        <button type="button" className={styles.saveButton} disabled={saving || !context.readiness.ready} onClick={() => onApproveAndLock(context).catch(() => undefined)}>{saving ? 'Processing…' : 'Approve Workplan'}</button>
      </div>
      {!context.readiness.ready && <p className={styles.securityWarning}>Approval is blocked until the submitted content passes every readiness check.</p>}
    </section> : <div className={styles.readOnlyNotice}>{annualWorkplanLifecycleNotice(context.workplan)}</div>}
  </article>;
};

const ManagerReviewPage: React.FC<IManagerReviewPageProps> = ({ contexts, quarterContexts, saving, message, onRequestChanges, onApproveAndLock, onRequestQuarterChanges, onApproveAndLockQuarter, onOverrideQuarterRag, onAssessQuarterBehaviour }) => (
  <section className={styles.managerPage} aria-labelledby="manager-heading">
    <ManagerQuarterReviewPanel contexts={quarterContexts} saving={saving} onRequestChanges={onRequestQuarterChanges} onApproveAndLock={onApproveAndLockQuarter} onOverrideRag={onOverrideQuarterRag} onAssessBehaviour={onAssessQuarterBehaviour} />
    <span className={styles.sectionLabel}>Manager review · Direct reports only</span>
    <h2 id="manager-heading">Annual Workplan review</h2>
    <p>Only Workplans for current direct reports assigned to the signed-in manager are shown.</p>
    <PerformanceConceptGuide audience="manager" />
    {message && <div className={message.toLowerCase().includes('could not') ? styles.errorMessage : styles.successMessage} role="status">{message}</div>}
    {contexts.length === 0 ? <div className={styles.emptyState}><strong>No direct-report Workplan is available for review.</strong><span>Return to My Team or check again after an employee submits a Workplan.</span></div> : contexts.map(context => <ManagerWorkplanCard
      key={context.workplan.workplanKey}
      context={context}
      saving={saving}
      onRequestChanges={onRequestChanges}
      onApproveAndLock={onApproveAndLock}
    />)}
  </section>
);

export default ManagerReviewPage;
