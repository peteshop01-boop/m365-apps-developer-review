import * as React from 'react';
import type { CoreKpiRole, ICoreKpiCatalogueItem, ICoreWorkplanItem } from '../models/ProductionModels';
import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import { scoringApproachLabel } from './PerformancePresentation';
import styles from './PerformanceHub.module.scss';

export interface ICoreKpiCatalogueRowProps {
  kpi: ICoreKpiCatalogueItem;
  selected?: ICoreWorkplanItem;
  currentResult?: IQuarterReviewItem;
  editable: boolean;
  saving: boolean;
  canAdd: boolean;
  onAdd(): void;
  onUpdate(patch: Partial<ICoreWorkplanItem>): void;
}

const roles: Array<{ value: CoreKpiRole; label: string }> = [
  { value: 'AccountableOwner', label: 'Accountable Owner' },
  { value: 'DeliveryLead', label: 'Delivery Lead' },
  { value: 'Contributor', label: 'Contributor' },
  { value: 'Oversight', label: 'Oversight' },
  { value: 'EvidenceProvider', label: 'Evidence Provider' }
];

const ownerInitials = (email?: string): string => {
  if (!email) return '—';
  return email.split('@')[0].split(/[._-]/).filter(Boolean).map(part => part.charAt(0).toUpperCase()).join('').slice(0, 3) || '—';
};

const target = (value?: string): string => value === undefined || value === '' ? 'Not supplied' : value;

const resultValue = (value: number | undefined, text: string | undefined, unit: string | undefined): string => {
  if (value !== undefined) return `${value}${unit ? ` ${unit}` : ''}`;
  return text?.trim() || 'Not rated';
};

const CoreKpiCatalogueRow: React.FC<ICoreKpiCatalogueRowProps> = ({
  kpi, selected, currentResult, editable, saving, canAdd, onAdd, onUpdate
}) => (
  <article className={selected ? styles.selectedKpiRow : styles.kpiRow}>
    <div className={styles.kpiMain}>
      <div className={styles.kpiIdentity}><span>{kpi.kpiId}</span><strong>{kpi.wording}</strong></div>
      <div className={styles.kpiMeta}><span>Pillar <strong>{kpi.pillar}</strong></span><span>Workstream <strong>{kpi.workstream}</strong></span><span>Owner <strong>{ownerInitials(kpi.accountableOwnerEmail)}</strong></span><span>Measure <strong>{kpi.metricType || kpi.unitLabel || 'Not supplied'}</strong></span><span>Unit <strong>{kpi.unitLabel === 'TBC' ? 'Not yet confirmed' : kpi.unitLabel}</strong></span><span>How delivery is assessed <strong>{scoringApproachLabel(kpi.scoringDirection)}</strong></span></div>
      <div className={styles.strategyTarget}><span>Strategy / 2028 target</span><p>{target(kpi.strategyTarget)}</p></div>
      <dl className={styles.targetGrid}>
        <div><dt>End of year</dt><dd>{target(kpi.yearEndTarget)}</dd></div>
        <div><dt>Q1</dt><dd>{target(kpi.q1Target)}</dd></div>
        <div><dt>Q2</dt><dd>{target(kpi.q2Target)}</dd></div>
        <div><dt>Q3</dt><dd>{target(kpi.q3Target)}</dd></div>
        <div><dt>Q4</dt><dd>{target(kpi.q4Target)}</dd></div>
      </dl>
      {selected && <dl className={styles.currentKpiResult}>
        <div><dt>Current-quarter target</dt><dd>{resultValue(currentResult?.quarterTargetValue, currentResult?.quarterTargetText, currentResult?.unitLabel || kpi.unitLabel)}</dd></div>
        <div><dt>Actual</dt><dd>{resultValue(currentResult?.employeeActualValue, currentResult?.employeeActualText, currentResult?.unitLabel || kpi.unitLabel)}</dd></div>
        <div><dt>Progress</dt><dd>{currentResult?.progressPct !== undefined ? `${currentResult.progressPct}%` : 'Not rated'}</dd></div>
        <div><dt>Calculated RAG</dt><dd data-rag={currentResult?.calculatedRag}>{currentResult?.calculatedRag || 'Not rated'}</dd></div>
        <div><dt>Forecast</dt><dd>{resultValue(currentResult?.quarterEndForecastValue, currentResult?.quarterEndForecastText, currentResult?.unitLabel || kpi.unitLabel)}</dd></div>
        <div><dt>Recovery</dt><dd>{currentResult?.recovery?.route ? `${currentResult.recovery.route} · ${currentResult.recovery.status || 'Draft'}` : currentResult?.calculatedRag === 'Amber' || currentResult?.calculatedRag === 'Red' ? 'Required' : 'Not required'}</dd></div>
      </dl>}
      {(kpi.scoringDirection === 'TBC' || kpi.unitLabel === 'TBC') && <p className={styles.tbcNotice}>The assessment method or unit is not yet confirmed. You can add this Core KPI to a Draft, but it cannot produce a delivery score until the approved definition is complete.</p>}
    </div>
    <div className={styles.kpiAction}>
      {selected ? <>
        <label><span>Core item planning weight %</span><input aria-label={`${kpi.kpiId} Core Workplan Weight`} type="number" min="0" max="100" step="0.01" disabled={!editable || saving} value={selected.coreWorkplanWeight ?? ''} onChange={event => onUpdate({ coreWorkplanWeight: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
        <label><span>KPI role</span><select aria-label={`${kpi.kpiId} KPI role`} disabled={!editable || saving} value={selected.employeeKpiRole || ''} onChange={event => onUpdate({ employeeKpiRole: (event.target.value || undefined) as CoreKpiRole | undefined })}><option value="">Select role</option>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <button type="button" className={styles.removeButton} disabled={!editable || saving} onClick={() => onUpdate({ activeInWorkplan: false })}>Remove</button>
      </> : <button type="button" className={styles.addButton} disabled={!editable || !canAdd} onClick={onAdd}>Add</button>}
    </div>
  </article>
);

export default CoreKpiCatalogueRow;
