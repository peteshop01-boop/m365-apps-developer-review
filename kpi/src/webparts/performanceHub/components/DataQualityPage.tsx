import * as React from 'react';
import type {
  IKpiDataQualityQueue,
  KpiDataQualityIssueCode,
  KpiDataQualitySeverity,
  KpiDataQualityStatus
} from '../services/KpiDataQuality';
import styles from './PerformanceHub.module.scss';

export interface IDataQualityPageProps {
  queue: IKpiDataQualityQueue;
}

const labels: Record<KpiDataQualityIssueCode, string> = {
  TBC_SCORING_DIRECTION: 'Scoring direction unresolved',
  TBC_METRIC_TYPE: 'Metric type unresolved',
  MISSING_TARGET: 'Current target gap',
  MISSING_PERCENTAGE_SOURCE_SCALE: 'Percentage source scale missing',
  MISSING_LOWER_BASELINE: 'Lower baseline missing',
  INVALID_LOWER_CONFIGURATION: 'Lower configuration invalid',
  MISSING_MILESTONE_MAP: 'Milestone map unavailable',
  INCOMPLETE_SCORE_CONFIGURATION: 'Score configuration incomplete',
  INCOMPLETE_TARGET_RANGE_CONFIGURATION: 'Target-range configuration incomplete',
  MISSING_UNIT_LABEL: 'Reporting unit missing',
  UNKNOWN_OWNER_CODE: 'Owner code unresolved',
  MISSING_HISTORIC_TARGET: 'Historic target gap',
  MISSING_ORGANISATIONAL_WEIGHT: 'KPI organisational weight missing'
};

const statusLabels: Record<KpiDataQualityStatus, string> = {
  Open: 'Open',
  ControlDecisionRequired: 'CONTROL decision required',
  SourceDataRequired: 'Source data required',
  IntentionallyTBC: 'Intentionally TBC'
};

const severityLabels: Record<KpiDataQualitySeverity, string> = {
  BlocksAuthoritativeScoring: 'Blocks authoritative scoring',
  ReportingQuality: 'Reporting quality issue',
  PublicationConfiguration: 'Publication configuration'
};

const DataQualityPage: React.FC<IDataQualityPageProps> = ({ queue }) => (
  <section className={styles.dataQualityPage} aria-labelledby="data-quality-heading">
    <header>
      <span className={styles.sectionLabel}>Admin control · restricted route</span>
      <h2 id="data-quality-heading">KPI Data Quality</h2>
      <p>Actionable governance queues for scoring, reporting and organisational publication. Unresolved scoring metadata remains NotRated.</p>
    </header>

    <div className={styles.dataQualitySummary} aria-label="Data Quality priority summary">
      {queue.groups.map(group => (
        <div key={group.priority}>
          <span>{group.priority}</span>
          <strong>{group.totalIssues}</strong>
          <small>{group.rows.length} KPI{group.rows.length === 1 ? '' : 's'}</small>
        </div>
      ))}
    </div>

    <p className={styles.dataQualityBaseline}>
      Like-for-like 015D priority rules on the loaded catalogue: P1 {queue.legacyPriorityCounts.P1}, P2 {queue.legacyPriorityCounts.P2}, P3 {queue.legacyPriorityCounts.P3}.
      The 015E queue moves unknown owner codes to P2. Workstream-level publication findings are separate and do not inflate the KPI-level P3 count.
    </p>

    <div className={styles.dataQualityGroups}>
      {queue.groups.map(group => (
        <section key={group.priority} className={styles.dataQualityGroup} data-priority={group.priority} aria-labelledby={`data-quality-${group.priority.toLowerCase()}`}>
          <header>
            <div>
              <h3 id={`data-quality-${group.priority.toLowerCase()}`}>{group.title}</h3>
              <p>{group.description}</p>
            </div>
            <strong aria-label={`${group.totalIssues} issues`}>{group.totalIssues}</strong>
          </header>

          <div className={styles.dataQualityRows}>
            {group.rows.length === 0 ? <p>No current {group.priority} KPI issues.</p> : group.rows.map(row => (
              <article key={`${group.priority}-${row.kpiId}`}>
                <header>
                  <strong>{row.kpiId}</strong>
                  <span>{row.classificationStatus || 'Source classification'}</span>
                </header>
                <dl className={styles.dataQualityIdentity}>
                  <div><dt>Wording</dt><dd>{row.wording}</dd></div>
                  <div><dt>Pillar</dt><dd>{row.pillar}</dd></div>
                  <div><dt>Workstream</dt><dd>{row.workstream}</dd></div>
                  <div><dt>Owner code</dt><dd>{row.ownerCode}</dd></div>
                </dl>
                <ul className={styles.dataQualityIssues}>
                  {row.issues.map(issue => (
                    <li key={issue.code}>
                      <div className={styles.dataQualityIssueHeading}>
                        <strong>{labels[issue.code]}</strong>
                        <span>{statusLabels[issue.status]}</span>
                      </div>
                      <dl>
                        <div><dt>Issue</dt><dd>{issue.detail}</dd></div>
                        <div><dt>Severity</dt><dd>{group.priority} — {severityLabels[issue.severity]}</dd></div>
                        <div><dt>Recommended resolution</dt><dd>{issue.recommendedResolution}</dd></div>
                        <div><dt>Source / reference</dt><dd>{issue.sourceReference}</dd></div>
                      </dl>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          {group.priority === 'P3' && queue.systemIssues.length > 0 ? (
            <div className={styles.dataQualitySystemIssues}>
              <h4>Workstream-level publication blockers</h4>
              <p>{queue.systemIssues.length} distinct Workstream configuration issue{queue.systemIssues.length === 1 ? '' : 's'}; excluded from the KPI-level P3 baseline.</p>
              {queue.systemIssues.map(issue => (
                <article key={`${issue.pillar}-${issue.workstream}`}>
                  <strong>{issue.pillar} · {issue.workstream}</strong>
                  <p>{issue.issue}</p>
                  <small>{issue.recommendedResolution} Source: {issue.sourceReference}</small>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ))}
    </div>
  </section>
);

export default DataQualityPage;
