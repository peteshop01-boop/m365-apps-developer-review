import * as React from 'react';
import type { IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem } from '../models/ProductionModels';
import { validateBehaviourAssignments } from '../services/AnnualWorkplanValidation';
import { parseBehaviourGuidance } from '../services/BehaviourGuidance';
import { isEmployeeWorkplanEditable } from '../services/EmployeeWorkplanStatus';
import styles from './PerformanceHub.module.scss';
import ContextualHelp from './ContextualHelp';
import { PerformanceConceptGuide } from './PerformancePresentation';

export interface IBehavioursPageProps {
  workplan: IAnnualWorkplan;
  behaviours: IBehaviourSummary[];
  items: IBehaviourWorkplanItem[];
  saving: boolean;
  message?: string;
  onAssign(): Promise<void>;
  onRemove(): Promise<void>;
}

const BehavioursPage: React.FC<IBehavioursPageProps> = ({ workplan, behaviours, items, saving, message, onAssign, onRemove }) => {
  const activeItems = items.filter(item => item.activeInWorkplan);
  const v2Items = activeItems.filter(item => Boolean(item.behaviourSnapshotV2))
    .sort((left, right) => left.displayOrder - right.displayOrder);
  if (v2Items.length > 0) return <section className={styles.behavioursPage} aria-labelledby="behaviours-v2-heading">
    <div className={styles.coreHeader}><div><span className={styles.sectionLabel}>KCCC-BEHAVIOUR|v02 · {workplan.state}</span><h2 id="behaviours-v2-heading">Behaviours</h2><p>Five separate KCCC Values using the stored descriptor for the explicitly assigned tier.</p></div></div>
    {v2Items.length !== 5 && <div className={styles.errorMessage} role="alert">The stored v02 set is incomplete; exactly five Value snapshots are required.</div>}
    <div className={styles.readOnlyNotice}><strong>1 Developing · 2 Effective · 3 Exceptional</strong><span>Effective is guidance, not a target. Undefined means not assessed; no weight, average or RAG is produced.</span></div>
    <div className={styles.behaviourList}>{v2Items.map(item => <article key={item.naturalKey} data-behaviour-v2-value={item.behaviourSnapshotV2!.valueId}>
      <span>{item.behaviourSnapshotV2!.valueId}</span><div><div className={styles.behaviourTitle}><strong>{item.behaviourSnapshotV2!.valueTitle}</strong><span className={styles.assignedBadge}>{item.behaviourSnapshotV2!.roleTier}</span></div><p>{item.behaviourSnapshotV2!.descriptor}</p><p>{item.behaviourCommitmentV2 || 'Commitment not recorded'}</p><small>Stored immutable framework {item.behaviourSnapshotV2!.frameworkVersion} · {item.behaviourSnapshotV2!.cadence}</small></div>
    </article>)}</div>
    {message && <div className={styles.successMessage} role="status">{message}</div>}
  </section>;
  const validation = validateBehaviourAssignments(behaviours, items);
  const editable = isEmployeeWorkplanEditable(workplan);
  return <section className={styles.behavioursPage} aria-labelledby="behaviours-heading">
    <div className={styles.coreHeader}>
      <div><span className={styles.sectionLabel}>Annual Workplan · {workplan.state}</span><h2 id="behaviours-heading">Behaviours</h2><p>{editable ? 'All five KCF Behaviour headings apply. Assign the signed framework to this Draft; wording and prompts remain controlled master data.' : 'Review the five assessed Behaviour headings and their observable prompts. Assignment and removal controls are locked.'}</p></div>
      {editable && <div className={styles.headerActions}>
        {activeItems.length > 0 && <button type="button" className={styles.secondaryButton} disabled={!editable || saving} onClick={() => onRemove().catch(() => undefined)}>Remove assignments</button>}
        <button type="button" className={styles.saveButton} disabled={!editable || saving || behaviours.length !== 5} onClick={() => onAssign().catch(() => undefined)}>{saving ? 'Saving…' : activeItems.length === 5 ? 'Refresh assignments' : 'Assign all five'}</button>
      </div>}
    </div>
    {!editable && <div className={styles.readOnlyNotice}>{workplan.state} Workplan · this section is read-only while your manager reviews it. If changes are needed, your manager must use Request Changes.</div>}
    <ContextualHelp
      purpose="Behaviours describe how work is delivered and form five assessed dimensions in the KCF Workplan."
      actions={["Read each of the five headings and its five observable prompts.", "Use the prompts as guidance and evidence criteria; do not treat them as separate selectable KPIs.", "All five headings apply to every Workplan."]}
      fields={["Corporate value links the Behaviour to KCF's signed values.", "Observable prompts describe what good behaviour looks like.", "Behaviour planning weights total 100% within this section; descriptive ratings remain separate assessments."]}
      next="Quarterly Review captures employee reflection and manager assessment separately. No numeric Behaviour-to-RAG conversion is currently approved."
    />
    <PerformanceConceptGuide />
    {message && <div className={message.toLowerCase().includes('could not') ? styles.errorMessage : styles.successMessage} role="status">{message}</div>}
    <div className={styles.sectionCounter} data-state={validation.state}><strong>{activeItems.length} / 5</strong><span>Assigned Behaviours</span><strong>{validation.total}%</strong><span>Planning weight total</span></div>
    <p className={styles.weightMessage} data-state={validation.state}>{validation.messages[0]}</p>
    <div className={styles.behaviourList}>{behaviours.map(behaviour => {
      const assigned = activeItems.find(item => item.behaviourId === behaviour.behaviourId);
      const guidance = parseBehaviourGuidance(behaviour.assessmentGuidance);
      return <article key={behaviour.behaviourId}>
        <span>{behaviour.behaviourId}</span>
        <div>
          <div className={styles.behaviourTitle}><strong>{behaviour.title}</strong><span className={assigned ? styles.assignedBadge : styles.unassignedBadge}>{assigned ? `Assigned · ${assigned.behaviourItemWeight}%` : 'Not assigned'}</span></div>
          {guidance.corporateValue && <p className={styles.corporateValue}>Corporate value: <strong>{guidance.corporateValue}</strong></p>}
          <p>{behaviour.description}</p>
          <details open><summary>Five observable prompts</summary>
            {guidance.complete ? <ol className={styles.behaviourPrompts}>{guidance.prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ol>
              : <p className={styles.tbcNotice}>The published guidance does not contain exactly five observable prompts. Contact the KPI system owner; prompts have not been invented.</p>}
            {guidance.ratingOptions && <p><strong>Assessment options:</strong> {guidance.ratingOptions}</p>}
          </details>
          <small>Behaviour section planning weight {assigned?.behaviourItemWeight ?? behaviour.defaultWorkplanWeight}%</small>
        </div>
      </article>;
    })}</div>
    <span className={styles.readOnlyNotice}>Definitions are read-only · this action does not assess or approve Behaviours</span>
  </section>;
};

export default BehavioursPage;
