import * as React from 'react';
import type { IRecoveryActionboardFilters, RecoveryRoute } from '../models/QuarterlyModels';
import { buildRecoveryActionboard, filterRecoveryActionboard, type IRecoveryActionboardContext } from '../services/RecoveryActionboard';
import styles from './PerformanceHub.module.scss';
import ContextualHelp from './ContextualHelp';

export interface IRecoveryActionboardPageProps {
  contexts: ReadonlyArray<IRecoveryActionboardContext>;
}

const unique = (values: Array<string | undefined>): string[] => Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();

const RecoveryActionboardPage: React.FC<IRecoveryActionboardPageProps> = ({ contexts }) => {
  const [filters, setFilters] = React.useState<IRecoveryActionboardFilters>({});
  const allItems = React.useMemo(() => buildRecoveryActionboard(contexts, new Date().toISOString().slice(0, 10)), [contexts]);
  const visible = filterRecoveryActionboard(allItems, filters);
  const set = (patch: Partial<IRecoveryActionboardFilters>): void => setFilters(current => ({ ...current, ...patch }));
  const pillars = unique(allItems.map(item => item.pillar));
  const workstreams = unique(allItems.map(item => item.workstream));
  const owners = unique(allItems.map(item => item.ownerPersonKey));
  return <section className={styles.actionboardPage} aria-labelledby="actionboard-heading">
    <span className={styles.sectionLabel}>Management action · read-only foundation</span>
    <h2 id="actionboard-heading">Recovery Actionboard</h2>
    <p>What requires management action? This read-only list contains active Amber/Red Core and Impact KPI interventions for the signed-in employee and genuinely authorised manager views.</p>
    <ContextualHelp
      purpose="Recovery brings active Amber/Red Core and Impact KPI interventions into one read-only action list."
      actions={["Use filters to focus on a quarter, Pillar, Workstream, owner, RAG or Recovery route.", "Review the action, owner, due date and next review date.", "Update the underlying KPI only through its authorised Quarterly Review editor."]}
      fields={["Recovery route describes how the issue will be addressed.", "Due and next-review dates show when action and follow-up are expected.", "Decision identifies whether a manager decision or approval is still required."]}
      next="Completed or superseded interventions leave the active Actionboard. This page does not grant manager edit powers."
    />
    <div className={styles.actionboardFilters} aria-label="Recovery Actionboard filters">
      <label><span>Quarter</span><select value={filters.quarter || ''} onChange={event => set({ quarter: (event.target.value || undefined) as IRecoveryActionboardFilters['quarter'] })}><option value="">All</option>{unique(allItems.map(item => item.quarter)).map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>Pillar</span><select value={filters.pillar || ''} onChange={event => set({ pillar: event.target.value || undefined })}><option value="">All</option>{pillars.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>Workstream</span><select value={filters.workstream || ''} onChange={event => set({ workstream: event.target.value || undefined })}><option value="">All</option>{workstreams.map(value => <option key={value}>{value}</option>)}</select></label>
      <label><span>Owner</span><select value={filters.ownerPersonKey || ''} onChange={event => set({ ownerPersonKey: event.target.value || undefined })}><option value="">All</option>{owners.map(value => <option key={value} value={value}>{allItems.find(item => item.ownerPersonKey === value)?.ownerInitials || '—'}</option>)}</select></label>
      <label><span>RAG</span><select value={filters.rag || ''} onChange={event => set({ rag: (event.target.value || undefined) as IRecoveryActionboardFilters['rag'] })}><option value="">All</option><option>Red</option><option>Amber</option></select></label>
      <label><span>Recovery Route</span><select value={filters.route || ''} onChange={event => set({ route: (event.target.value || undefined) as RecoveryRoute | undefined })}><option value="">All</option><option>Recover</option><option>Mitigate</option><option>Reforecast</option><option>Escalate</option></select></label>
      <label className={styles.checkFilter}><input type="checkbox" checked={Boolean(filters.overdueOnly)} onChange={event => set({ overdueOnly: event.target.checked })} /><span>Overdue only</span></label>
      <label className={styles.checkFilter}><input type="checkbox" checked={Boolean(filters.decisionRequiredOnly)} onChange={event => set({ decisionRequiredOnly: event.target.checked })} /><span>Decision required</span></label>
    </div>
    <div className={styles.actionboardSummary}><strong>{visible.length} active intervention{visible.length === 1 ? '' : 's'}</strong><span>Showing controlled current-quarter Recovery work.</span></div>
    {visible.length === 0 ? <div className={styles.emptyState}>No active Amber/Red recovery action matches these filters.</div> : <div className={styles.actionboardRows}>
      {visible.map(item => <article key={item.key} data-rag={item.rag}>
        <div className={styles.actionboardIdentity}><strong>{item.kpiId}</strong><span>{item.wording}</span><small>{item.employeeDisplayName} · {item.pillar} / {item.workstream}</small></div>
        <div><span>Owner</span><strong>{item.ownerInitials}</strong></div><div><span>RAG</span><strong>{item.rag}</strong></div><div><span>Route</span><strong>{item.route || 'Missing'}</strong></div>
        <div className={styles.actionboardAction}><span>Recovery Action</span><strong>{item.action || 'Required'}</strong></div>
        <div><span>Due</span><strong>{item.dueDate || 'Required'}{item.overdue ? ' · OVERDUE' : ''}</strong></div><div><span>Next Review</span><strong>{item.nextReviewDate || 'Required'}</strong></div>
        <div><span>Decision</span><strong>{item.decisionRequired ? item.decisionReason : item.managerDecisionStatus}</strong></div>
      </article>)}
    </div>}
  </section>;
};

export default RecoveryActionboardPage;
