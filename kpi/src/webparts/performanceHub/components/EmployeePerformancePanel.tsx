import * as React from 'react';
import type { IEmployeePerformanceSummary } from '../services/EmployeePerformanceSummary';
import { PerformanceConceptGuide, performanceIndicatorLabel, presentImpactTerminology } from './PerformancePresentation';
import styles from './PerformanceHub.module.scss';

const EmployeePerformancePanel: React.FC<{ summary: IEmployeePerformanceSummary }> = ({ summary }) => (
  <section className={styles.employeePerformance} aria-labelledby="employee-performance-heading">
    <div className={styles.sectionHeading}>
      <div><span className={styles.sectionLabel}>Current-quarter delivery</span><h2 id="employee-performance-heading">My delivery</h2></div>
      <span className={styles.performanceQualifier}>Scores are separate from Workplan weighting</span>
    </div>
    <PerformanceConceptGuide />
    <div className={styles.performanceGrid}>{[summary.core, summary.personal, summary.behaviours, summary.overall].map(item => (
      <article key={item.key} data-state={item.state}>
        <span>{performanceIndicatorLabel(item.key)}</span>
        <strong>{item.rag && item.rag !== 'NotRated' ? item.rag : item.state === 'NotAvailable' ? 'Not yet available' : item.state === 'Provisional' ? 'Provisional' : 'Not rated'}</strong>
        {item.progressPct !== undefined && item.key !== 'behaviours' && <b>{item.progressPct}% {item.key === 'overall' ? 'Overall Delivery score' : 'delivery score'}</b>}
        <small>{presentImpactTerminology(item.explanation)}</small>
      </article>
    ))}</div>
  </section>
);

export default EmployeePerformancePanel;
