import * as React from 'react';
import styles from './PerformanceHub.module.scss';

export type PerformanceIndicatorKey = 'core' | 'personal' | 'behaviours' | 'overall';

const indicatorLabels: Record<PerformanceIndicatorKey, string> = {
  core: 'Core delivery score',
  personal: 'Impact delivery score',
  behaviours: 'Behaviour ratings',
  overall: 'Overall Delivery score'
};

const roleLabels: Record<string, string> = {
  AccountableOwner: 'Owns this Core KPI',
  DeliveryLead: 'Delivers this Core KPI',
  Contributor: 'Contributes to this Core KPI',
  Oversight: 'Supports / oversees this Core KPI',
  EvidenceProvider: 'Provides evidence for this Core KPI'
};

const itemTypeLabels: Record<string, string> = {
  CoreGold: 'Core KPI',
  LocalPersonal: 'Impact KPI',
  Behaviour: 'Behaviour'
};

export const performanceIndicatorLabel = (key: PerformanceIndicatorKey): string => indicatorLabels[key];

export const presentImpactTerminology = (value: string): string => value
  .replace(/Personal KPIs/g, 'Impact KPIs')
  .replace(/Personal KPI/g, 'Impact KPI')
  .replace(/Personal items/g, 'Impact items')
  .replace(/Personal item/g, 'Impact item')
  .replace(/Core, Personal and Behaviour/g, 'Core, Impact and Behaviour')
  .replace(/Personal section/g, 'Impact section')
  .replace(/Personal performance/g, 'Impact delivery')
  .replace(/Overall performance/g, 'Overall Delivery')
  .replace(/employee Core Workplan weights?/g, 'Core item weights')
  .replace(/Personal and Behaviour results/g, 'Impact and Behaviour results');

export const scoringApproachLabel = (value?: string): string => {
  if (value === 'HigherIsBetter') return 'Progress increases as the result rises';
  if (value === 'LowerIsBetter') return 'Progress increases as the result falls';
  if (value === 'TargetRange') return 'Progress is strongest within the approved target range';
  if (value === 'Milestone') return 'Progress follows approved milestone completion';
  return 'Assessment method not yet available';
};

export const workplanRoleLabel = (value?: string): string => value ? roleLabels[value] || 'Role needs review' : 'Role not recorded';

export const quarterItemTypeLabel = (value: string): string => itemTypeLabels[value] || 'Workplan item';

export const PerformanceConceptGuide: React.FC<{ audience?: 'employee' | 'manager' }> = ({ audience = 'employee' }) => (
  <section className={styles.performanceConceptGuide} aria-label="How Workplan weighting, Overall Delivery scoring and Behaviour ratings differ">
    <article>
      <strong>Core and Impact weighting</strong>
      <p>Planning percentages balance the annual Workplan. They are not performance scores.</p>
    </article>
    <article>
      <strong>Overall Delivery score</strong>
      <p>Calculated separately from approved delivery results and the approved category balance. It is not entered as a weight.</p>
    </article>
    <article>
      <strong>Behaviour ratings</strong>
      <p>{audience === 'manager' ? 'Employee, manager and agreed ratings remain separate labelled assessments.' : 'Descriptive self, manager and agreed ratings remain separate from weights and delivery scores.'}</p>
    </article>
  </section>
);
