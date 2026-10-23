import * as React from 'react';
import type { IEmployeeWorkplanStatus } from '../services/EmployeeWorkplanStatus';
import { presentImpactTerminology } from './PerformancePresentation';
import styles from './PerformanceHub.module.scss';

export interface IWorkplanStatusPanelProps { status: IEmployeeWorkplanStatus; }

const WorkplanStatusPanel: React.FC<IWorkplanStatusPanelProps> = ({ status }) => (
  <section className={styles.workplanStatusPanel} aria-labelledby="my-workplan-status-heading">
    <div className={styles.sectionHeading}>
      <div><span className={styles.sectionLabel}>My Workplan status</span><h2 id="my-workplan-status-heading">{status.status}</h2></div>
      <span className={styles.statusPill}>{status.editable ? 'Editable' : 'Read only'}</span>
    </div>
    <div className={styles.workplanStatusGrid}>
      <div><span>Manager</span><strong>{status.managerName}</strong></div>
      <div><span>Core KPI selection</span><strong>{status.coreStatus}</strong></div>
      <div><span>Impact KPI status</span><strong>{presentImpactTerminology(status.personalStatus)}</strong></div>
      <div><span>Behaviour status</span><strong>{status.behaviourStatus}</strong></div>
      <div className={styles.fullStatus}><span>Approval / review state</span><strong>{status.reviewState}</strong></div>
    </div>
    <div className={styles.nextAction}><span>What you need to do next</span><strong>{presentImpactTerminology(status.nextAction)}</strong><p>{presentImpactTerminology(status.explanation)}</p></div>
  </section>
);

export default WorkplanStatusPanel;
