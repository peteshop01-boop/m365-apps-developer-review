import * as React from 'react';
import type { IAnnualWorkplan, IReadinessResult } from '../models/ProductionModels';
import type { ICoreWeightValidation } from '../services/CoreWorkplanValidation';
import { isWorkplanCreationDisabled } from '../services/ReadinessService';
import styles from './PerformanceHub.module.scss';

export interface IReadinessPanelProps {
  readiness: IReadinessResult;
}

export interface ICoreWorkplanReadinessPanelProps {
  workplan: IAnnualWorkplan;
  selectedCount: number;
  selectionLabel: string;
  weightValidation: ICoreWeightValidation;
}

const sectionCompletion = (selectedCount: number, weights: ICoreWeightValidation): string => {
  if (selectedCount === 0) return 'Not started';
  if (weights.state === 'complete') return 'Complete';
  if (weights.state === 'invalid') return 'Requires attention';
  return 'In progress';
};

export const CoreWorkplanReadinessPanel: React.FC<ICoreWorkplanReadinessPanelProps> = ({
  workplan, selectedCount, selectionLabel, weightValidation
}) => {
  const ready = workplan.transitionStatus === 'Ready';
  return (
    <section className={styles.coreReadinessPanel} aria-labelledby="core-readiness-heading">
      <div className={styles.coreReadinessHeading}>
        <div><span className={styles.sectionLabel}>Identity and readiness</span><h3 id="core-readiness-heading">Annual Workplan</h3></div>
        <span className={ready ? styles.readyBadge : styles.blockedBadge}>{ready ? 'Ready' : 'Not ready'}</span>
      </div>
      <dl className={styles.coreReadinessFacts}>
        <div><dt>Employee</dt><dd>{workplan.employeeDisplayName}<small>{workplan.employeeEmail}</small></dd></div>
        <div><dt>Performance year</dt><dd>{workplan.performanceYear}</dd></div>
        <div><dt>Manager</dt><dd>{workplan.managerDisplayName || workplan.managerEmail || 'Not assigned'}{workplan.managerDisplayName && workplan.managerEmail && <small>{workplan.managerEmail}</small>}</dd></div>
        <div><dt>State</dt><dd>{workplan.state}</dd></div>
        <div><dt>Readiness</dt><dd>{ready ? 'Ready' : `Transition ${workplan.transitionStatus}`}</dd></div>
        <div><dt>Core section completion</dt><dd>{sectionCompletion(selectedCount, weightValidation)}<small>{selectionLabel} · {weightValidation.total}% allocated</small></dd></div>
      </dl>
    </section>
  );
};

const ReadinessPanel: React.FC<IReadinessPanelProps> = ({ readiness }) => {
  const disabled = isWorkplanCreationDisabled(readiness);
  return (
    <section className={styles.readinessPanel} aria-labelledby="readiness-heading">
      <div className={styles.panelHeading}>
        <div>
          <span className={styles.sectionLabel}>Production readiness</span>
          <h2 id="readiness-heading">{readiness.ready ? 'Workplan ready' : 'Workplan not ready'}</h2>
        </div>
        <span className={readiness.ready ? styles.readyBadge : styles.blockedBadge}>
          {readiness.ready ? 'Ready' : `${readiness.blockers.length} blockers`}
        </span>
      </div>

      <div className={styles.readinessChecks}>
        {readiness.checks.map(item => (
          <div className={styles.readinessRow} key={item.key}>
            <span className={item.status === 'pass' ? styles.passIcon : styles.failIcon} aria-hidden="true">
              {item.status === 'pass' ? '✓' : '!'}
            </span>
            <div><strong>{item.label}</strong><p>{item.message}</p></div>
            <span className={item.status === 'pass' ? styles.passText : styles.failText}>{item.status.toUpperCase()}</span>
          </div>
        ))}
      </div>

      {readiness.warnings.length > 0 && <div className={styles.readinessWarnings}>
        <strong>Controlled data-quality warnings</strong>
        <ul>{readiness.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
      </div>}

      <div className={styles.nextAction}>
        <span>Next required action</span>
        <strong>{readiness.nextAction}</strong>
      </div>
      <p className={styles.disabledReason} id="create-disabled-reason">
        {disabled ? 'Foundational readiness checks must pass before Annual Workplan setup.' : 'Foundational checks pass. The separate cross-section panel controls submission.'}
      </p>
    </section>
  );
};

export default ReadinessPanel;
