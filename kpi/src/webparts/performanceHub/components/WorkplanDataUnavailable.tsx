import * as React from 'react';
import type { IProductionOverview, WorkplanDataLoadState } from '../models/ProductionModels';
import styles from './PerformanceHub.module.scss';

export interface IWorkplanDataUnavailableProps {
  state: Exclude<WorkplanDataLoadState, 'available'>;
  overview: IProductionOverview;
  currentUserEmail: string;
  sectionName: string;
  message?: string;
}

const statusLabel = (state: Exclude<WorkplanDataLoadState, 'available'>): string => {
  if (state === 'notReady') return 'Setup not ready';
  if (state === 'loading') return 'Loading';
  return 'Read failed';
};

const heading = (state: Exclude<WorkplanDataLoadState, 'available'>): string => {
  if (state === 'notReady') return 'Workplan data not loaded';
  if (state === 'loading') return 'Workplan data is loading';
  return 'Workplan data unavailable';
};

const defaultMessage = (state: Exclude<WorkplanDataLoadState, 'available'>): string => {
  if (state === 'notReady') {
    return 'Your Annual Workplan is not ready to open. Retry after setup is complete or contact KPI support.';
  }
  if (state === 'loading') return 'Your Annual Workplan is still being checked.';
  return 'Your Annual Workplan could not be verified. Reload once; if this continues, send the support details below to KPI support.';
};

const WorkplanDataUnavailablePanel: React.FC<IWorkplanDataUnavailableProps> = ({ state, overview, currentUserEmail, sectionName, message }) => {
  return (
    <div className={styles.workplanUnavailablePanel} role={state === 'unavailable' ? 'alert' : 'status'}>
      <div className={styles.workplanUnavailableHeading}>
        <div>
          <span className={styles.sectionLabel}>Current Workplan required</span>
          <strong>{heading(state)}</strong>
        </div>
        <span className={styles.unavailableBadge}>{statusLabel(state)}</span>
      </div>
      <p>{message || defaultMessage(state)}</p>
      <dl className={styles.workplanSupportContext} aria-label="Workplan support details">
        <div><dt>Area</dt><dd>{sectionName}</dd></div>
        <div><dt>Signed-in account</dt><dd>{overview.employee?.email || currentUserEmail}</dd></div>
        <div><dt>Performance year</dt><dd>{overview.config?.performanceYear || 'Not configured'}</dd></div>
      </dl>
      <small>No Workplan values or actions are shown until the current data is confirmed.</small>
    </div>
  );
};

export interface IWorkplanSectionUnavailableProps extends IWorkplanDataUnavailableProps {
  description: string;
}

export const WorkplanSectionUnavailable: React.FC<IWorkplanSectionUnavailableProps> = ({ sectionName, description, ...panelProps }) => {
  const headingId = `workplan-${sectionName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-unavailable`;
  return (
    <section className={styles.workplanUnavailablePage} aria-labelledby={headingId}>
      <span className={styles.sectionLabel}>Annual Workplan</span>
      <h2 id={headingId}>{sectionName}</h2>
      <p>{description}</p>
      <WorkplanDataUnavailablePanel {...panelProps} sectionName={sectionName} />
    </section>
  );
};

export default WorkplanDataUnavailablePanel;
