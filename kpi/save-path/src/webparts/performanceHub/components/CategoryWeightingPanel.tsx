import * as React from 'react';
import type { CoreKpiRole } from '../models/ProductionModels';
import type { EmployeeContributionMethodV2, EmployeeCoreWeightingModeV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IWorkplanCategoryWeights } from '../models/GovernanceModels';
import type { IOverallDeliveryWeightConfiguration } from '../models/QuarterlyModels';
import { snapshotOverallDeliveryWeightConfiguration } from '../services/QuarterOverallDelivery';
import {
  APPROVED_CONTRIBUTION_METHODS,
  APPROVED_CORE_ROLES,
  DEFAULT_DELIVERY_CATEGORY_WEIGHTS,
  DEFAULT_WORKPLAN_CATEGORY_WEIGHTS,
  applyCoreWeightingMode,
  categoryWeightsAreManagerApproved,
  type DeliveryWeightingApprovalRole,
  type ICoreWeightingItem,
  type IDeliveryCategoryWeights,
  type IDeliveryWeightConfigurationSnapshot,
  validateCoreRoleAndContributionMethod,
  validateCoreWeightingSelection,
  validateDeliveryCategoryWeights,
  validateWorkplanCategoryWeights
} from '../services/CategoryWeightingPolicy';
import { PerformanceConceptGuide } from './PerformancePresentation';
import styles from './PerformanceHub.module.scss';

const roleLabels: Readonly<Record<CoreKpiRole, string>> = {
  AccountableOwner: 'Accountable owner',
  DeliveryLead: 'Delivery lead',
  Contributor: 'Contributor',
  Oversight: 'Oversight',
  EvidenceProvider: 'Evidence provider'
};

const methodLabels: Readonly<Record<EmployeeContributionMethodV2, string>> = {
  AdditiveDirect: 'Additive / direct delivery',
  SharedTarget: 'Shared target',
  WeightedDenominator: 'Weighted / denominator',
  AccountableOwner: 'Accountable owner',
  CompletionOversight: 'Completion / oversight'
};

export interface ICoreWeightingControlsProps {
  items: readonly ICoreWeightingItem[];
  mode: EmployeeCoreWeightingModeV2;
  editable?: boolean;
  onModeChange?(mode: EmployeeCoreWeightingModeV2): void;
  onItemsChange?(items: ICoreWeightingItem[]): void;
}

export const CoreWeightingControls: React.FC<ICoreWeightingControlsProps> = ({
  items,
  mode,
  editable = false,
  onModeChange,
  onItemsChange
}) => {
  const validation = validateCoreWeightingSelection(items, mode);
  const assignmentErrors = validateCoreRoleAndContributionMethod(items);
  const patch = (index: number, values: Partial<ICoreWeightingItem>): void => {
    onItemsChange?.(items.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : { ...item }));
  };
  const selectMode = (nextMode: EmployeeCoreWeightingModeV2): void => {
    onModeChange?.(nextMode);
    onItemsChange?.(applyCoreWeightingMode(items, nextMode));
  };

  return <section className={`${styles.categoryOverrideControls} ${styles.coreWeightingControls}`} aria-labelledby="core-weighting-heading">
    <div className={styles.sectionHeading}>
      <div><span className={styles.sectionLabel}>Core KPI weighting</span><h3 id="core-weighting-heading">Choose Equal or Custom deliberately</h3></div>
      <span className={validation.valid ? styles.totalWeight : styles.invalidWeight}>{validation.total}% total</span>
    </div>
    <div role="group" aria-label="Core KPI weighting method">
      <button type="button" aria-pressed={mode === 'Equal'} disabled={!editable} onClick={() => selectMode('Equal')}>Equal</button>{' '}
      <button type="button" aria-pressed={mode === 'Custom'} disabled={!editable} onClick={() => selectMode('Custom')}>Custom</button>
    </div>
    <p>Employee role and contribution method are separate governed choices. Changing one does not infer or replace the other.</p>
    <div className={styles.weightGrid}>
      {items.map((item, index) => <article key={item.kpiId}>
        <strong>{item.kpiId}</strong>
        <label><span>Employee role</span><select aria-label={`${item.kpiId} employee role`} disabled={!editable}
          value={item.employeeRole || ''} onChange={event => patch(index, { employeeRole: (event.currentTarget.value || undefined) as CoreKpiRole | undefined })}>
          <option value="">Select role</option>
          {APPROVED_CORE_ROLES.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}
        </select></label>
        <label><span>Contribution method</span><select aria-label={`${item.kpiId} contribution method`} disabled={!editable}
          value={item.contributionMethod || ''} onChange={event => patch(index, { contributionMethod: (event.currentTarget.value || undefined) as EmployeeContributionMethodV2 | undefined })}>
          <option value="">Select contribution method</option>
          {APPROVED_CONTRIBUTION_METHODS.map(method => <option key={method} value={method}>{methodLabels[method]}</option>)}
        </select></label>
        <label><span>Core weight %</span><input aria-label={`${item.kpiId} Core weight`} type="number" min="0" max="100" step="0.01"
          disabled={!editable || mode === 'Equal'} value={item.weight}
          onChange={event => patch(index, { weight: Number(event.currentTarget.value) })} /></label>
      </article>)}
    </div>
    {validation.errors.concat(assignmentErrors).map(error => <p key={error} role="alert" data-valid="false">{error}</p>)}
    {validation.valid && assignmentErrors.length === 0 && <p data-valid="true">Core role, contribution method and {mode} weights are complete at exactly 100%.</p>}
  </section>;
};

export interface IApprovedDeliveryWeightingPanelProps {
  weights: IDeliveryCategoryWeights;
  configuration?: Readonly<IDeliveryWeightConfigurationSnapshot>;
  workplanState: string;
  editable?: boolean;
  reason?: string;
  overrideApproved?: boolean;
  approvalRole?: DeliveryWeightingApprovalRole;
  saving?: boolean;
  coreItems?: readonly ICoreWeightingItem[];
  coreWeightingMode?: EmployeeCoreWeightingModeV2;
  onChange?(weights: IDeliveryCategoryWeights): void;
  onReasonChange?(reason: string): void;
  onCoreModeChange?(mode: EmployeeCoreWeightingModeV2): void;
  onCoreItemsChange?(items: ICoreWeightingItem[]): void;
  onSave?(): Promise<void>;
}

export const ApprovedDeliveryWeightingPanel: React.FC<IApprovedDeliveryWeightingPanelProps> = ({
  weights,
  configuration,
  workplanState,
  editable = false,
  reason,
  overrideApproved = false,
  approvalRole,
  saving = false,
  coreItems,
  coreWeightingMode = 'Equal',
  onChange,
  onReasonChange,
  onCoreModeChange,
  onCoreItemsChange,
  onSave
}) => {
  const configuredDefault = configuration?.defaultWeights || DEFAULT_DELIVERY_CATEGORY_WEIGHTS;
  const validation = validateDeliveryCategoryWeights(weights, reason, configuredDefault);
  const configurationMatches = !configuration || (weights.core === configuration.activeWeights.core
    && weights.impact === configuration.activeWeights.impact);
  const locked = workplanState === 'Approved' || workplanState === 'Locked' || workplanState === 'Archived';
  const canEdit = editable && !locked;
  const approvedByAuthority = overrideApproved && (approvalRole === 'Manager' || approvalRole === 'SystemAdmin');
  const approvalReady = validation.valid && configurationMatches
    && (!validation.managerApprovalRequired || approvedByAuthority);
  const set = (key: keyof IDeliveryCategoryWeights, value: number): void => onChange?.({ ...weights, [key]: value });

  return <section className={styles.weightSection} aria-labelledby="delivery-weight-heading" data-policy="PD-01">
    <div className={styles.sectionHeading}>
      <div><span className={styles.sectionLabel}>Overall Delivery weighting</span><h2 id="delivery-weight-heading">Core + Impact</h2></div>
      <span className={validation.valid ? styles.totalWeight : styles.invalidWeight}>{validation.total}% total</span>
    </div>
    <p className={styles.weightingExplanation}>Overall Delivery uses Core × configured Core weight + Impact × configured Impact weight. Behaviours are assessed separately and are never included in this arithmetic.</p>
    <div className={styles.weightGrid}>
      {([
        ['core', 'Core', 'The approved Core KPI score.'],
        ['impact', 'Impact', 'Additional, stretch or cross-team contribution.']
      ] as const).map(([key, label, description]) => <article key={key}>
        {canEdit ? <label><span>{label} weight %</span><input aria-label={`${label} Delivery weight`} type="number" min="0" max="100" step="0.01"
          value={weights[key]} onChange={event => set(key, Number(event.currentTarget.value))} /></label>
          : <span className={styles.weightValue}>{weights[key]}%</span>}
        <strong>{label}</strong><p>{description}</p><small>Configured default {configuredDefault[key]}%</small>
      </article>)}
    </div>
    {canEdit ? <div className={styles.categoryOverrideControls}>
      <strong>Controlled Delivery-weight override</strong>
      <label><span>Required reason when balance differs from {configuredDefault.core}/{configuredDefault.impact}</span><textarea rows={2} value={reason || ''} onChange={event => onReasonChange?.(event.currentTarget.value)} /></label>
      {!validation.valid && validation.errors.map(error => <p key={error} role="alert" data-valid="false">{error}</p>)}
      {!configurationMatches && <p role="alert" data-valid="false">Delivery weights do not match the loaded governed configuration version. Reload before saving.</p>}
      {validation.valid && validation.managerApprovalRequired && !approvedByAuthority && <p data-valid="false">The override still requires approval by the assigned manager or System Admin and a durable audit event.</p>}
      {approvalReady && <p data-valid="true">{validation.managerApprovalRequired
        ? `${approvalRole} approval is recorded; save must append the versioned audit event.`
        : `The governed ${configuredDefault.core}/${configuredDefault.impact} configuration is active${configuration ? ` · ${configuration.authority.version} · ${configuration.authority.changeReference}` : ''}.`}</p>}
      {onSave && <button type="button" className={styles.saveButton} disabled={saving || !approvalReady}
        onClick={() => onSave().catch(() => undefined)}>{saving ? 'Saving…' : 'Save Delivery weighting'}</button>}
    </div> : <p className={styles.readOnlyNotice}>{workplanState} Workplan · Delivery weights are read-only. Approved history keeps its captured Core/Impact snapshot.</p>}
    {coreItems && <CoreWeightingControls items={coreItems} mode={coreWeightingMode} editable={canEdit}
      onModeChange={onCoreModeChange} onItemsChange={onCoreItemsChange} />}
  </section>;
};

export const CapturedDeliveryWeightingPanel: React.FC<{
  configuration?: Readonly<IOverallDeliveryWeightConfiguration>;
  workplanState: string;
}> = ({ configuration, workplanState }) => {
  if (!configuration) return <p role="status">Overall Delivery weights are unavailable until the governed configuration is captured with this Workplan. Behaviours remain separate.</p>;
  try {
    const weights = snapshotOverallDeliveryWeightConfiguration(configuration);
    return <><ApprovedDeliveryWeightingPanel weights={{ core: weights.coreWeight, impact: weights.impactWeight }}
      workplanState={workplanState} reason="Captured governed configuration" />
      <p>Weight configuration: {weights.configurationKey} · {weights.configurationVersion}</p></>;
  } catch {
    return <p role="alert">The captured Overall Delivery configuration is invalid. Core and Impact must total 100%; reload the governed version.</p>;
  }
};

export interface ICategoryWeightingPanelProps {
  weights: IWorkplanCategoryWeights;
  workplanState: string;
  editable?: boolean;
  localUat?: boolean;
  activePersonalKpiCount?: number;
  reason?: string;
  simulatedApproval?: boolean;
  saving?: boolean;
  onChange?(weights: IWorkplanCategoryWeights): void;
  onReasonChange?(reason: string): void;
  onApprovalChange?(approved: boolean): void;
  onSave?(): Promise<void>;
}

const CategoryWeightingPanel: React.FC<ICategoryWeightingPanelProps> = ({
  weights,
  workplanState,
  editable,
  localUat,
  activePersonalKpiCount,
  reason,
  simulatedApproval,
  saving,
  onChange,
  onReasonChange,
  onApprovalChange,
  onSave
}) => {
  const personalCount = activePersonalKpiCount === undefined ? (weights.personal > 0 ? 1 : 0) : activePersonalKpiCount;
  const validation = validateWorkplanCategoryWeights(weights, personalCount, reason);
  const managerApproved = categoryWeightsAreManagerApproved(workplanState as 'Draft' | 'Submitted' | 'ChangesRequested' | 'Approved' | 'Locked' | 'Archived') || Boolean(localUat && simulatedApproval);
  const approvalReady = validation.valid && (!validation.managerApprovalRequired || managerApproved);
  const set = (key: keyof IWorkplanCategoryWeights, value: number): void => onChange?.({ ...weights, [key]: value });
  return <section className={styles.weightSection} aria-labelledby="weight-heading">
    <div className={styles.sectionHeading}>
      <div><span className={styles.sectionLabel}>Your Workplan weighting</span><h2 id="weight-heading">Current category weights</h2></div>
      <span className={validation.total === 100 ? styles.totalWeight : styles.invalidWeight}>{validation.total}% total</span>
    </div>
    <p className={styles.weightingExplanation}>These percentages describe how your annual Workplan is balanced. They are <strong>planning weights, not delivery scores</strong>.</p>
    <PerformanceConceptGuide />
    <div className={styles.weightGrid}>
      {([
        ['core', 'Core', 'DEMO strategic priorities selected for your Workplan.'],
        ['personal', 'Impact', 'Your measurable role contribution, where used.'],
        ['behaviours', 'Behaviours', 'The five DEMO Behaviour commitments; their ratings remain separate.']
      ] as const).map(([key, label, description]) => <article key={key}>
        {editable ? <label><span>{label} planning weight %</span><input type="number" min={key === 'core' ? 60 : key === 'behaviours' ? 10 : 0} max={key === 'core' ? 90 : key === 'behaviours' ? 20 : 30} value={weights[key]} onChange={event => set(key, Number(event.target.value))} /></label> : <span className={styles.weightValue}>{weights[key]}%</span>}
        <strong>{label}</strong><p>{description}</p><small>Default {DEFAULT_WORKPLAN_CATEGORY_WEIGHTS[key]}% · permitted {key === 'core' ? '60–90%' : key === 'personal' ? '0–30%' : '10–20%'}</small>
      </article>)}
    </div>
    {editable ? <div className={styles.categoryOverrideControls}>
      <strong>{localUat ? 'Local UAT category proposal' : 'Category-weight proposal'}</strong>
      <label><span>Required reason when balance differs from 70/20/10</span><textarea rows={2} value={reason || ''} onChange={event => onReasonChange?.(event.target.value)} /></label>
      {personalCount === 0 && <p><strong>No active Impact KPIs:</strong> Impact must be 0%. Agree how to redistribute that planning weight; the application will not infer it.</p>}
      {localUat && <label className={styles.checkFilter}><input type="checkbox" checked={Boolean(simulatedApproval)} onChange={event => onApprovalChange?.(event.target.checked)} /><span>Simulate manager/Admin approval locally</span></label>}
      {!validation.valid && <p data-valid="false">{validation.errors.join(' ')}</p>}
      {validation.valid && validation.managerApprovalRequired && !managerApproved && <p data-valid="false">Proposal passes employee guardrails. Manager approval is still required with the complete Workplan.</p>}
      {approvalReady && <p data-valid="true">{localUat ? 'Manager-approval readiness passes locally. No live data will be changed.' : 'Category weighting is valid for the current Workplan state.'}</p>}
      {onSave && <button type="button" className={styles.saveButton} disabled={saving || !validation.valid} onClick={() => onSave().catch(() => undefined)}>{saving ? 'Saving…' : localUat ? 'Save proposal locally' : 'Save proposal'}</button>}
    </div> : <p className={styles.readOnlyNotice}>{workplanState} Workplan · category weights are read-only. Manager approval of the Workplan approves this balance; later changes require controlled reopen, reason, audit and reapproval.</p>}
  </section>;
};

export default CategoryWeightingPanel;
