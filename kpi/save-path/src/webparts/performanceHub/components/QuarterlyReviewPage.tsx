import { presentQuarterBehaviourTarget } from '../services/QuarterBehaviourTargetSnapshot';
import * as React from 'react';
import type { IAnnualWorkplan, IBehaviourWorkplanItem, IProductionConfig } from '../models/ProductionModels';
import type {
  IProgressEntry,
  IQuarterLifecycle,
  IQuarterReviewContext,
  IQuarterReviewItem,
  QuarterKey,
  RecoveryRoute
} from '../models/QuarterlyModels';
import type { BehaviourRating } from '../models/BehaviourWorkplanModels';
import { calculatePerformance } from '../services/PerformanceScoring';
import {
  BEHAVIOUR_RATING_SCALE,
  calculateBehaviourRating,
  getBehaviourRatingLabel
} from '../services/BehaviourWorkplanPolicy';
import { evaluateQuarterSubmissionReadiness } from '../services/QuarterSubmissionReadiness';
import { isAnnualWorkplanEligibleForQuarterlyDraft } from '../services/QuarterReviewFactory';
import { canEmployeeUpdateQuarterProgress } from '../services/QuarterReviewAuthorisation';
import { assertAuthoritativeCoreSnapshot } from '../services/QuarterReviewItemPersistence';
import { getProgressEvidenceHref } from '../services/ProgressLedgerValidation';
import { getLegacySubmittedQuarterBehaviourCompatibility } from '../services/LegacySubmittedBehaviourCompatibility';
import { BEHAVIOUR_V2_RATING_OPTIONS, getBehaviourV2RatingDisplay } from '../services/BehaviourFrameworkV2Policy';
import styles from './PerformanceHub.module.scss';
import ContextualHelp from './ContextualHelp';
import { PerformanceConceptGuide, presentImpactTerminology, quarterItemTypeLabel } from './PerformancePresentation';
import { CapturedQuarterDeliverySummary } from './ReportingViewsPage';

export interface IQuarterlyReviewPageProps {
  workplan?: IAnnualWorkplan;
  /** Canonical annual readback only; never used to initialise or change a quarter Target. */
  annualBehaviourItems?: readonly IBehaviourWorkplanItem[];
  config?: IProductionConfig;
  lifecycles: IQuarterLifecycle[];
  selectedQuarter?: QuarterKey;
  context?: IQuarterReviewContext;
  loading: boolean;
  saving: boolean;
  nativeWritesHeld?: boolean;
  message?: string;
  onSelectQuarter(quarter: QuarterKey): Promise<void>;
  onPrepare(): Promise<void>;
  onSaveItem(item: IQuarterReviewItem): Promise<void>;
  onAddProgress(item: IQuarterReviewItem, entry: IProgressEntry): Promise<void>;
  onSubmit(): Promise<void>;
}

const numericMetrics = ['Count', 'Number', 'Percentage', 'Currency', 'Rate', 'Days', 'Score'];
const isNumeric = (item: IQuarterReviewItem): boolean => numericMetrics.indexOf(item.metricType || '') >= 0;
type PercentageSourceScale = 'Fraction' | 'Whole';
const valueForDisplay = (value: number, scale?: PercentageSourceScale): number => scale === 'Fraction' ? value * 100 : value;
const valueForStorage = (value: number, scale?: PercentageSourceScale): number => scale === 'Fraction' ? value / 100 : value;
const displayValue = (value?: number, text?: string, unit?: string, scale?: PercentageSourceScale): string => value !== undefined
  ? `${valueForDisplay(value, scale)}${unit ? ` ${unit}` : ''}`
  : text?.trim() || 'Not configured';
const progressAndScore = (item: IQuarterReviewItem): string => item.progressPct === undefined
  ? 'Unassessed'
  : `${item.progressPct}% progress against target${item.scoredProgressPct === undefined ? '' : ` · ${item.scoredProgressPct}% delivery score`}`;
const today = (): string => new Date().toISOString().slice(0, 10);

const hasCurrentCoreSource = (item: IQuarterReviewItem, context: IQuarterReviewContext): boolean => {
  if (item.itemType !== 'CoreGold') return true;
  const matches = context.coreCatalogue.filter(kpi => kpi.kpiId === item.kpiId);
  if (matches.length !== 1) return false;
  try {
    assertAuthoritativeCoreSnapshot(item, matches[0]);
    return true;
  } catch {
    return false;
  }
};

const RecoveryEditor: React.FC<{
  item: IQuarterReviewItem;
  context: IQuarterReviewContext;
  disabled: boolean;
  onChange(item: IQuarterReviewItem): void;
}> = ({ item, context, disabled, onChange }) => {
  const recovery = item.recovery || {};
  const owners = [context.employee, context.manager].filter((person): person is NonNullable<typeof person> => Boolean(person?.active && person.displayName?.trim() && person.personKey?.trim()));
  const availableOwners = owners.filter((person, index) => owners.findIndex(candidate => candidate.personKey === person.personKey) === index);
  const ownerUnavailable = Boolean(recovery.ownerPersonKey && !availableOwners.some(person => person.personKey === recovery.ownerPersonKey));
  const change = (patch: Partial<NonNullable<IQuarterReviewItem['recovery']>>): void => onChange({ ...item, recovery: { ...recovery, ...patch } });
  return <fieldset className={styles.recoveryEditor} disabled={disabled}>
    <legend>Recovery action · required for Amber/Red</legend>
    <div className={styles.quarterFormGrid}>
      <label><span>Recovery Route</span><select value={recovery.route || ''} onChange={event => {
        const route = (event.target.value || undefined) as RecoveryRoute | undefined;
        onChange(route ? { ...item, recovery: { ...recovery, route } } : { ...item, recovery: undefined });
      }}>
        <option value="">Select route</option><option value="Recover">Recover</option><option value="Mitigate">Mitigate</option><option value="Reforecast">Reforecast</option><option value="Escalate">Escalate</option>
      </select></label>
      <label><span>Status</span><select value={recovery.status || ''} onChange={event => change({ status: (event.target.value || undefined) as NonNullable<IQuarterReviewItem['recovery']>['status'] })}>
        <option value="">Select status</option><option value="Draft">Draft</option><option value="Active">Active</option><option value="Complete">Complete</option><option value="Superseded">Superseded</option><option value="Escalated">Escalated</option>
      </select></label>
      <label className={styles.fullField}><span>Recovery Action</span><textarea rows={3} value={recovery.action || ''} onChange={event => change({ action: event.target.value })} /></label>
      <label><span>Recovery owner</span><select aria-label="Recovery owner" value={recovery.ownerPersonKey || ''} onChange={event => change({ ownerPersonKey: event.target.value || undefined })}>
        <option value="">Select a recovery owner</option>
        {ownerUnavailable && <option value={recovery.ownerPersonKey} disabled>Previously assigned owner unavailable — select a current owner</option>}
        {availableOwners.map(person => <option key={person.personKey} value={person.personKey}>{person.displayName} ({person.personKey === context.employee.personKey ? 'you' : 'manager'})</option>)}
      </select></label>
      <label><span>Due Date</span><input type="date" value={recovery.dueDate || ''} onInput={event => change({ dueDate: event.currentTarget.value })} /></label>
      <label><span>Next Review Date</span><input type="date" value={recovery.nextReviewDate || ''} onInput={event => change({ nextReviewDate: event.currentTarget.value })} /></label>
      {recovery.route === 'Recover' && <label><span>Expected return to Green</span><input type="date" value={recovery.expectedReturnToGreenDate || ''} onInput={event => change({ expectedReturnToGreenDate: event.currentTarget.value })} /></label>}
      {recovery.route === 'Mitigate' && <label className={styles.fullField}><span>Expected reduced outcome / impact</span><textarea rows={2} value={recovery.expectedReducedOutcome || ''} onChange={event => change({ expectedReducedOutcome: event.target.value })} /></label>}
      {recovery.route === 'Reforecast' && <>
        <label><span>Proposed revised target</span><input value={recovery.proposedRevisedTarget || ''} onChange={event => change({ proposedRevisedTarget: event.target.value })} /></label>
        <label><span>Proposed revised date</span><input type="date" value={recovery.proposedRevisedDate || ''} onInput={event => change({ proposedRevisedDate: event.currentTarget.value })} /></label>
        <label className={styles.fullField}><span>Reforecast reason</span><textarea rows={2} value={recovery.reforecastReason || ''} onChange={event => change({ reforecastReason: event.target.value })} /></label>
        <label><span>Formal approval status</span><select value={recovery.reforecastApprovalStatus || 'NotRequested'} onChange={event => change({ reforecastApprovalStatus: event.target.value as NonNullable<IQuarterReviewItem['recovery']>['reforecastApprovalStatus'] })}>
          <option value="NotRequested">Not requested</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Rejected">Rejected</option>
        </select></label>
      </>}
      {recovery.route === 'Escalate' && <>
        <label className={styles.fullField}><span>Dependency / decision required</span><textarea rows={2} value={recovery.dependencyOrDecision || ''} onChange={event => change({ dependencyOrDecision: event.target.value })} /></label>
        <label><span>Escalated to</span><input value={recovery.escalatedTo || ''} onChange={event => change({ escalatedTo: event.target.value })} /></label>
        <label><span>Target decision date</span><input type="date" value={recovery.targetDecisionDate || ''} onInput={event => change({ targetDecisionDate: event.currentTarget.value })} /></label>
      </>}
    </div>
    {recovery.route === 'Reforecast' && <p className={styles.controlledNotice}>A Reforecast records a request only. It never changes KPI Master or Annual Targets without formal approval.</p>}
  </fieldset>;
};

const ProgressEditor: React.FC<{
  item: IQuarterReviewItem;
  context: IQuarterReviewContext;
  disabled: boolean;
  onAdd(item: IQuarterReviewItem, entry: IProgressEntry): Promise<void>;
}> = ({ item, context, disabled, onAdd }) => {
  const [note, setNote] = React.useState('');
  const [entryDate, setEntryDate] = React.useState(today());
  const [link, setLink] = React.useState('');
  const draftRevision = React.useRef(0);
  React.useEffect(() => {
    draftRevision.current += 1;
    setNote(''); setLink(''); setEntryDate(today());
    // Invalidate pending completions on a source boundary or unmount.
    return () => { draftRevision.current += 1; };
  }, [item.quarterReviewItemKey, item.quarterReviewKey, item.workplanKey, item.personKey,
    item.performanceYear, item.quarter, item.etag,
    context.review?.rowVersionToken, context.review?.state, context.review?.accessState, context.review?.transitionStatus,
    context.employee.personKey, context.employee.email, context.lifecycle.status,
    context.lifecycle.isCurrentQuarter, context.lifecycle.isOpenForProgressUpdates]);
  const ledgers = context.progressLedgers.filter(row => row.workplanItemKey === item.workplanItemKey
    && row.workplanKey === item.workplanKey && row.personKey === item.personKey
    && row.performanceYear === item.performanceYear && row.itemType === item.itemType && row.kpiId === item.kpiId);
  const ambiguousHistory = ledgers.length > 1;
  const ledger = ledgers.length === 1 ? ledgers[0] : undefined;
  const entries = ledger?.entries.filter(entry => (entry.quarterReviewKey === item.quarterReviewKey
      && entry.quarterReviewItemKey === item.quarterReviewItemKey
      && entry.quarter === item.quarter)
    || (!entry.quarterReviewKey && !entry.quarterReviewItemKey && entry.quarter === item.quarter)) || [];
  const annualEntries = ledger?.entries.filter(entry => !entry.quarterReviewKey && !entry.quarterReviewItemKey && !entry.quarter) || [];
  const incompleteAssociation = ledger?.entries.some(entry => Boolean(entry.quarterReviewKey) !== Boolean(entry.quarterReviewItemKey)
    || (Boolean(entry.quarterReviewKey || entry.quarterReviewItemKey) && !entry.quarter));
  const progressDisabled = disabled || ambiguousHistory;
  const renderEntries = (history: IProgressEntry[]): React.ReactElement => <ol>{history.map(entry => {
    const evidenceHref = getProgressEvidenceHref(entry.evidenceLink);
    return <li key={entry.entryKey}><strong>{entry.date}</strong><span>{entry.note}</span>{entry.evidenceLink && (evidenceHref
      ? <a href={evidenceHref} target="_blank" rel="noopener noreferrer">Evidence link</a>
      : <span>Evidence link unavailable: {entry.evidenceLink}</span>)}</li>;
  })}</ol>;
  return <section className={styles.progressPanel}>
    <h4>Progress notes</h4>
    {ambiguousHistory && <p role="status">Progress history unavailable: multiple matching records. Reload the selected quarter; progress entry is withheld until the source is unambiguous.</p>}
    {incompleteAssociation && <p role="status">Some progress entries have incomplete review associations and are withheld from quarter results.</p>}
    <div data-progress-history="Quarter">{entries.length ? renderEntries(entries) : <p>No ongoing progress note has been recorded for this Quarter Review. Monthly notes are optional.</p>}</div>
    {annualEntries.length > 0 && <section data-progress-history="AnnualUnassigned"><h5>Annual progress history — quarter not recorded</h5><p>These retained annual notes have no recorded quarter association and are not attributed to this Quarter Review.</p>{renderEntries(annualEntries)}</section>}
    <div className={styles.progressEntryForm}>
      <label><span>Date</span><input type="date" value={entryDate} disabled={progressDisabled} onInput={event => { draftRevision.current += 1; setEntryDate(event.currentTarget.value); }} /></label>
      <label><span>Optional evidence link</span><input type="url" value={link} disabled={progressDisabled} onChange={event => { draftRevision.current += 1; setLink(event.target.value); }} placeholder="https://" /></label>
      <label className={styles.fullField}><span>Progress note</span><textarea rows={2} value={note} disabled={progressDisabled} onChange={event => { draftRevision.current += 1; setNote(event.target.value); }} /></label>
      <button type="button" className={styles.secondaryButton} disabled={progressDisabled || !note.trim()} onClick={() => {
        const entryKey = `${item.quarterReviewItemKey}|${entryDate}`;
        const submittedRevision = draftRevision.current;
        onAdd(item, {
          entryKey,
          quarterReviewKey: item.quarterReviewKey,
          quarterReviewItemKey: item.quarterReviewItemKey,
          quarter: item.quarter,
          date: entryDate,
          note: note.trim(),
          actorPersonKey: context.employee.personKey,
          actorEmail: context.employee.email,
          updatedAt: new Date().toISOString(),
          evidenceLink: link.trim() || undefined
        }).then(() => {
          if (draftRevision.current === submittedRevision) {
            draftRevision.current += 1;
            setNote(''); setLink('');
          }
        }).catch(() => undefined);
      }}>Add progress note</button>
    </div>
  </section>;
};

const ItemEditor: React.FC<{
  item: IQuarterReviewItem;
  context: IQuarterReviewContext;
  config: IProductionConfig;
  saving: boolean;
  nativeWritesHeld?: boolean;
  onChange(item: IQuarterReviewItem): void;
  onSave(item: IQuarterReviewItem): Promise<void>;
  onAddProgress(item: IQuarterReviewItem, entry: IProgressEntry): Promise<void>;
}> = ({ item, context, config, saving, nativeWritesHeld = false, onChange, onSave, onAddProgress }) => {
  const authorised = canEmployeeUpdateQuarterProgress(context.employee, context.lifecycle, context.review, item);
  const coreSourceReady = !authorised || hasCurrentCoreSource(item, context);
  const configYearReady = !authorised || (Boolean(config) && Number.isSafeInteger(config?.performanceYearNumber)
    && config.performanceYearNumber === item.performanceYear);
  const editable = authorised && coreSourceReady && configYearReady;
  // Current policy may preview an editable draft. Saved noneditable results
  // retain their captured scores and units rather than adopting live policy.
  const catalogueKpi = editable && item.kpiId ? context.coreCatalogue.find(kpi => kpi.kpiId === item.kpiId && kpi.kpiVersionKey === item.kpiVersionKey) : undefined;
  const percentageSourceScale = catalogueKpi?.percentageSourceScale || item.percentageSourceScale;
  const score = editable && item.itemType !== 'Behaviour' ? calculatePerformance({
    scoringDirection: item.scoringDirection || 'TBC', metricType: item.metricType || 'Other', targetValue: item.quarterTargetValue,
    actualValue: item.employeeActualValue, targetText: item.quarterTargetText, actualText: item.employeeActualText,
    baselineValue: catalogueKpi?.baselineValue ?? item.baselineValue
  }, {
    kpiIdentity: catalogueKpi ? {
      kpiId: catalogueKpi.kpiId,
      kpiVersionKey: catalogueKpi.kpiVersionKey,
      performanceYear: String(config.performanceYearNumber)
    } : undefined,
    configThresholds: config.rag,
    percentageSourceScale,
    kpiThresholdOverride: catalogueKpi?.kpiThresholdOverride,
    approvedMilestonePolicy: catalogueKpi?.approvedMilestonePolicy,
    scoringEffectiveAt: catalogueKpi?.approvedMilestonePolicy?.resolvedEffectiveAt,
    approvedScorePolicy: catalogueKpi?.approvedScorePolicy,
    approvedTargetRangePolicy: catalogueKpi?.approvedTargetRangePolicy
  }) : undefined;
  const behaviourScore = editable && item.itemType === 'Behaviour' && !item.behaviourSnapshotV2
    ? calculateBehaviourRating(item.employeeBehaviourRating, item.behaviourTargetRating)
    : undefined;
  const current = score
    ? { ...item, progressPct: score.rawProgressPct, scoredProgressPct: score.scoredProgressPct, calculatedRag: score.calculatedRag, scoringMessage: score.message }
    : behaviourScore
      ? {
        ...item,
        progressPct: behaviourScore.rawNormalisedScore === undefined ? undefined : behaviourScore.rawNormalisedScore * 100,
        scoredProgressPct: behaviourScore.scoredContribution === undefined ? undefined : behaviourScore.scoredContribution * 100,
        calculatedRag: behaviourScore.rag
      }
      : item;
  const annualTarget = presentQuarterBehaviourTarget(current);
  const annualTargetLevel = annualTarget?.behaviourAnnualTargetLevelV2;
  const quarterAssessment = current.finalBehaviourAssessmentV2 ?? current.employeeBehaviourAssessmentV2;
  const quarterActualLevel = BEHAVIOUR_V2_RATING_OPTIONS.find(option => option.value === quarterAssessment)?.label;
  const levelOrder = ['Developing', 'Effective', 'Exceptional'];
  const annualProgress = !annualTargetLevel ? 'Annual Target Level not recorded; progress cannot be compared.'
    : !quarterActualLevel ? 'Quarterly Current/Actual has not been assessed.'
      : levelOrder.indexOf(quarterActualLevel) < levelOrder.indexOf(annualTargetLevel)
        ? 'Below the full-year Annual Target Level.' : 'At or above the full-year Annual Target Level.';
  const evidenceStates = Array.from(new Set(context.evidence
    .filter(reference => reference.quarterReviewItemKey === current.quarterReviewItemKey
      && reference.quarterReviewKey === current.quarterReviewKey && reference.quarter === current.quarter
      && reference.workplanItemKey === current.workplanItemKey && reference.workplanKey === current.workplanKey
      && reference.personKey === current.personKey && reference.performanceYear === current.performanceYear
      && reference.kpiId === current.kpiId)
    .map(reference => reference.status)));
  const evidenceState = evidenceStates.length > 0 ? evidenceStates.join(', ') : 'None linked';
  const update = (patch: Partial<IQuarterReviewItem>): void => onChange({ ...current, ...patch });
  const showRecovery = current.itemType !== 'Behaviour' && (current.calculatedRag === 'Amber' || current.calculatedRag === 'Red' || Boolean(current.recovery?.route));
  return <details className={styles.quarterItemDetail}>
    <summary>
      <span className={styles.quarterKpiId}>{current.kpiId || quarterItemTypeLabel(current.itemType)}</span>
      <span className={styles.quarterWording}>{current.wording}</span>
      <span className={styles.quarterMetric}>{current.itemType === 'Behaviour'
        ? current.behaviourSnapshotV2 ? getBehaviourV2RatingDisplay(current.employeeBehaviourAssessmentV2)
          : getBehaviourRatingLabel(current.employeeBehaviourRating) || 'Not rated'
        : displayValue(current.employeeActualValue, current.employeeActualText, current.unitLabel, percentageSourceScale)}</span>
      {!current.behaviourSnapshotV2 && <span className={styles.ragBadge} data-rag={current.calculatedRag}>{current.calculatedRag}</span>}
    </summary>
    <div className={styles.quarterItemBody}>
      {!configYearReady && <p role="status">Scoring configuration does not match this saved quarter year. Reload the matching year configuration before updating. Updates are withheld.</p>}
      {!coreSourceReady && <p role="status">Current Core KPI or target source is unavailable or changed. Reload the approved source before updating this item. Updates are withheld.</p>}
      {current.itemType === 'CoreGold' && <div className={styles.quarterTargetFacts}>
        <div><span>Strategy target</span><strong>{current.strategyTarget || 'Not supplied'}</strong></div>
        <div><span>End-of-year target</span><strong>{current.yearEndTarget || 'Not supplied'}</strong></div>
        <div><span>{current.quarter} target</span><strong>{displayValue(current.quarterTargetValue, current.quarterTargetText, current.unitLabel, percentageSourceScale)}</strong></div>
        <div><span>Previous Actual</span><strong>{displayValue(current.previousQuarterActualValue, current.previousQuarterActualText, current.unitLabel, percentageSourceScale)}</strong></div>
        <div><span>Progress and delivery score</span><strong>{progressAndScore(current)}</strong></div>
      </div>}
      {current.itemType === 'Behaviour' && current.behaviourSnapshotV2 ? <div className={styles.quarterFormGrid} data-behaviour-v2-value={current.behaviourSnapshotV2.valueId}>
        <p className={styles.fullField}><strong>{current.behaviourSnapshotV2.valueId} · {current.behaviourSnapshotV2.valueTitle}</strong><br />{current.behaviourSnapshotV2.corporateValue}</p>
        <p className={styles.fullField}><strong>{current.behaviourSnapshotV2.roleTier} descriptor:</strong> {current.behaviourSnapshotV2.descriptor}</p>
        <p className={styles.fullField}><strong>{current.behaviourSnapshotV2.period} commitment:</strong> {current.quarterTargetText || 'Not recorded'}</p>
        <div className={styles.fullField} data-annual-planning-source={current.behaviourSnapshotV2.valueId}>
          <strong>Accepted annual planning source (read only)</strong>
          {annualTarget
            ? <p>Frozen approved Workplan {current.workplanKey}, version {annualTarget.behaviourAnnualTargetSourceWorkplanVersionV2};
              item {annualTarget.behaviourAnnualTargetSourceWorkplanItemKeyV2}; source ETag {annualTarget.behaviourAnnualTargetSourceEtagV2};
              approval {annualTarget.behaviourAnnualTargetSourceApprovalKeyV2}; full-year Target Level {annualTargetLevel}.
              {annualTarget.behaviourAnnualTargetJustificationV2
                ? ` Justification: ${annualTarget.behaviourAnnualTargetJustificationV2}` : ''}</p>
            : <p>Frozen annual Target Level and provenance are unavailable for this historic row. No level has been inferred.</p>}
          <p>Quarterly Current/Actual: {quarterActualLevel || 'Not assessed'}
            {current.finalBehaviourAssessmentV2 ? ' (agreed/final)' : quarterActualLevel ? ' (employee self-assessment; pending agreement)' : ''}.
            {' '}{annualProgress} The Annual Target stays unchanged here; any midyear change requires a controlled Workplan amendment.</p>
        </div>
        <label><span>Employee self-assessment</span><select value={current.employeeBehaviourAssessmentV2 || ''} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ employeeBehaviourAssessmentV2: event.target.value ? Number(event.target.value) as 1 | 2 | 3 : undefined })}><option value="">Not assessed</option>{BEHAVIOUR_V2_RATING_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.displayLabel}</option>)}</select></label>
        <label className={styles.fullField}><span>Employee evidence</span><textarea rows={4} value={current.employeeBehaviourEvidenceV2 || ''} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ employeeBehaviourEvidenceV2: event.target.value })} /></label>
        <div><span>Manager evidence</span><strong>{current.managerBehaviourEvidenceV2 || 'Not recorded'}</strong></div>
        <div><span>Manager assessment</span><strong>{getBehaviourV2RatingDisplay(current.managerBehaviourAssessmentV2)}</strong></div>
        <div><span>Agreed/final evidence</span><strong>{current.finalBehaviourEvidenceV2 || 'Not recorded'}</strong></div>
        <div><span>Agreed/final assessment</span><strong>{getBehaviourV2RatingDisplay(current.finalBehaviourAssessmentV2)}</strong></div>
        <p className={styles.controlledNotice}>1 Developing · 2 Effective · 3 Exceptional. Effective is role guidance, not a target. Employee, manager and final evidence/assessments remain separate; no weight, average or RAG is calculated.</p>
      </div> : current.itemType === 'Behaviour' ? <div className={styles.quarterFormGrid}>
        <p className={styles.fullField}><strong>Selected objective:</strong> {current.behaviourObjectiveTitle || 'Not configured — missing from legacy Workplan'}</p>
        {current.behaviourObjectiveDescription && <p className={styles.fullField}>{current.behaviourObjectiveDescription}</p>}
        <p className={styles.fullField}><strong>{current.quarter} measurable target:</strong> {current.quarterTargetText || 'Not configured'}</p>
        <p className={styles.fullField}><strong>Observable prompts:</strong> {current.behaviourPrompt || 'Use the published Behaviour definition and examples.'}</p>
        {current.behaviourAssessmentGuidance && <p className={styles.fullField}><strong>Assessment guidance:</strong> {current.behaviourAssessmentGuidance}</p>}
        <div><span>Target rating</span><strong>{getBehaviourRatingLabel(current.behaviourTargetRating) || 'Not configured'}</strong></div>
        <label><span>Employee self-assessment</span><select value={current.employeeBehaviourRating || ''} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ employeeBehaviourRating: event.target.value ? Number(event.target.value) as BehaviourRating : undefined })}><option value="">Not rated</option>{BEHAVIOUR_RATING_SCALE.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className={styles.fullField}><span>Progress / evidence commentary</span><textarea rows={4} value={current.behaviourReflection || ''} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ behaviourReflection: event.target.value, statusUpdate: event.target.value })} /></label>
        <label className={styles.fullField}><span>Observable examples</span><textarea rows={2} value={current.behaviourExamples || ''} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ behaviourExamples: event.target.value })} /></label>
        <div><span>Employee Behaviour RAG</span><strong>{current.calculatedRag}</strong></div>
        <div><span>Manager assessment</span><strong>{getBehaviourRatingLabel(current.managerBehaviourRating) || 'Pending manager review'}</strong></div>
        <div><span>Agreed/final assessment</span><strong>{getBehaviourRatingLabel(current.finalBehaviourRating) || 'Pending manager decision'}</strong></div>
        <p className={styles.controlledNotice}>Employee, manager and agreed Behaviour ratings remain separate labelled assessments. They are not planning weights or an Overall Delivery score.</p>
      </div> : <div className={styles.quarterFormGrid}>
        {current.itemType === 'LocalPersonal' && <>
          <div className={styles.fullField} data-reporting-stream="Impact"><span>Approved annual Impact definition</span><strong>{current.impactAnnualDefinitionSnapshot?.wording || current.wording}</strong></div>
          <div className={styles.fullField}><span>Intended outcome</span><strong>{current.impactAnnualDefinitionSnapshot?.intendedOutcome || current.itemDescription || 'Not supplied'}</strong></div>
          <div><span>Business Contribution Area</span><strong>{current.impactAnnualDefinitionSnapshot?.classification?.businessContributionArea?.label || 'Not classified in this annual snapshot'}</strong></div>
          <div><span>Strategic Pillar</span><strong>{current.impactAnnualDefinitionSnapshot?.classification?.strategicPillar?.label || 'No Strategic Pillar'}</strong></div>
          <div><span>{current.quarter} approved target</span><strong>{displayValue(current.quarterTargetValue, current.quarterTargetText, current.unitLabel, percentageSourceScale)}</strong></div>
          <div><span>Progress and delivery score</span><strong>{progressAndScore(current)}</strong></div>
        </>}
        {isNumeric(current) ? <label><span>Current Actual{percentageSourceScale ? ' (%)' : ''}</span><input type="number" value={current.employeeActualValue === undefined ? '' : valueForDisplay(current.employeeActualValue, percentageSourceScale)} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ employeeActualValue: event.target.value === '' ? undefined : valueForStorage(Number(event.target.value), percentageSourceScale) })} /></label>
          : <label><span>Current Actual / status</span><input value={current.employeeActualText || ''} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ employeeActualText: event.target.value })} /></label>}
        <label><span>Quarter-end forecast{percentageSourceScale ? ' (%)' : ' (number)'}</span><input type="number" value={current.quarterEndForecastValue === undefined ? '' : valueForDisplay(current.quarterEndForecastValue, percentageSourceScale)} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ quarterEndForecastValue: event.target.value === '' ? undefined : valueForStorage(Number(event.target.value), percentageSourceScale) })} /></label>
        <label><span>Quarter-end forecast (text/status)</span><input value={current.quarterEndForecastText || ''} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ quarterEndForecastText: event.target.value })} /></label>
        <label className={styles.fullField}><span>Status Update / Notes</span><textarea rows={3} value={current.statusUpdate || ''} disabled={nativeWritesHeld || !editable || saving} onChange={event => update({ statusUpdate: event.target.value })} /></label>
      </div>}
      {!current.behaviourSnapshotV2 && <div className={current.calculatedRag === 'NotRated' ? styles.ragPending : styles.ragExplanation}>{current.scoringMessage || score?.message || (editable ? 'Calculated RAG will update from validated inputs.' : 'Saved scoring explanation was not recorded.')}</div>}
      {showRecovery && <RecoveryEditor item={current} context={context} disabled={nativeWritesHeld || !editable || saving} onChange={onChange} />}
      <div className={styles.evidenceStrip}><strong>Evidence: {current.evidenceCount}</strong><span>Evidence state: {evidenceState}. Text/link evidence may accompany progress notes. File upload remains a controlled Evidence-library action and was not live-tested.</span></div>
      <ProgressEditor item={current} context={context} disabled={nativeWritesHeld || !editable || saving} onAdd={onAddProgress} />
      <button type="button" className={styles.saveButton} disabled={nativeWritesHeld || !editable || saving} onClick={() => onSave(current).catch(() => undefined)}>{saving ? 'Saving…' : 'Save update'}</button>
    </div>
  </details>;
};

// Only employee input may cross a confirmed per-item response; server controls stay canonical.
const employeeDraftFields: ReadonlyArray<keyof IQuarterReviewItem> = [
  'employeeActualValue', 'employeeActualText', 'statusUpdate', 'contextMitigation',
  'quarterEndForecastValue', 'quarterEndForecastText', 'recovery', 'employeeBehaviourRating',
  'behaviourReflection', 'behaviourExamples', 'employeeBehaviourEvidenceV2', 'employeeBehaviourAssessmentV2'
];
const recoveryDraft = (recovery: IQuarterReviewItem['recovery']): object | undefined => recovery && {
  route: recovery.route, action: recovery.action, ownerPersonKey: recovery.ownerPersonKey,
  dueDate: recovery.dueDate, nextReviewDate: recovery.nextReviewDate, status: recovery.status,
  expectedReturnToGreenDate: recovery.expectedReturnToGreenDate, expectedReducedOutcome: recovery.expectedReducedOutcome,
  proposedRevisedTarget: recovery.proposedRevisedTarget, proposedRevisedDate: recovery.proposedRevisedDate,
  reforecastReason: recovery.reforecastReason, dependencyOrDecision: recovery.dependencyOrDecision,
  escalatedTo: recovery.escalatedTo, targetDecisionDate: recovery.targetDecisionDate
};
const draftValue = (item: IQuarterReviewItem, field: keyof IQuarterReviewItem): unknown =>
  field === 'recovery' ? recoveryDraft(item.recovery) : item[field];
const retainDraftField = (server: IQuarterReviewItem, local: IQuarterReviewItem, field: keyof IQuarterReviewItem): void => {
  Object.assign(server, { [field]: field === 'recovery' && local.recovery
    ? { ...server.recovery, ...recoveryDraft(local.recovery) } : local[field] });
};
const sameDraftValue = (left: unknown, right: unknown): boolean => JSON.stringify(left) === JSON.stringify(right);
const sourceFields = (value: object): object => Object.keys(value).sort().reduce((result, key) => {
  if (![...employeeDraftFields, 'etag', 'rowVersionToken', 'progressPct', 'scoredProgressPct',
    'calculatedRag', 'scoringMessage', 'evidenceCount'].includes(key as keyof IQuarterReviewItem)) {
    result[key] = (value as Record<string, unknown>)[key];
  }
  return result;
}, {} as Record<string, unknown>);
const QuarterlyReviewPage: React.FC<IQuarterlyReviewPageProps> = ({
  workplan, config, lifecycles, selectedQuarter, context: suppliedContext, loading, saving, nativeWritesHeld = false, message, onSelectQuarter, onPrepare, onSaveItem, onAddProgress, onSubmit
}) => {
  const lifecycle = lifecycles.find(quarter => quarter.quarterKey === selectedQuarter);
  const preparationYearReady = Boolean(config && workplan && lifecycle
    && Number.isSafeInteger(config.performanceYearNumber)
    && config.performanceYearNumber === workplan.performanceYear
    && config.performanceYearNumber === lifecycle.performanceYearNumber);
  const suppliedReview = suppliedContext?.review;
  // A pending selection/read may leave a valid review for a different source
  // in props. Withhold that whole context rather than treating it as absent
  // and accidentally offering preparation against the new selection.
  const contextMismatch = Boolean(suppliedContext && (!workplan || !lifecycle
    || suppliedContext.employee.personKey !== workplan.personKey
    || suppliedContext.lifecycle.quarterKey !== selectedQuarter
    || suppliedContext.lifecycle.performanceYearNumber !== workplan.performanceYear
    || lifecycle.performanceYearNumber !== workplan.performanceYear
    || suppliedContext.lifecycle.status !== lifecycle.status
    || suppliedContext.lifecycle.isCurrentQuarter !== lifecycle.isCurrentQuarter
    || suppliedContext.lifecycle.isOpenForProgressUpdates !== lifecycle.isOpenForProgressUpdates
    || (suppliedReview && (suppliedReview.quarter !== selectedQuarter
      || suppliedReview.workplanKey !== workplan.workplanKey
      || suppliedReview.personKey !== workplan.personKey
      || suppliedReview.performanceYear !== workplan.performanceYear
      || suppliedReview.quarterReviewKey !== `${workplan.workplanKey}|${selectedQuarter}`
      || suppliedContext.items.some(item => item.quarterReviewKey !== suppliedReview.quarterReviewKey
        || item.workplanKey !== workplan.workplanKey || item.personKey !== workplan.personKey
        || item.performanceYear !== workplan.performanceYear || item.quarter !== selectedQuarter)))));
  const context = contextMismatch ? undefined : suppliedContext;
  const [draftItems, setDraftItems] = React.useState<IQuarterReviewItem[]>(context?.items || []);
  const canonicalItems = context?.items;
  const [conflict, setConflict] = React.useState(false);
  const [saveCompletion, setSaveCompletion] = React.useState(0);
  const binding = JSON.stringify({ workplan, config, selectedQuarter, lifecycle,
    review: context?.review && sourceFields(context.review), employee: context?.employee,
    manager: context?.manager, coreCatalogue: context?.coreCatalogue, behaviours: context?.behaviours,
    dataFoundationReady: context?.dataFoundationReady, items: canonicalItems?.map(item => ({ ...sourceFields(item), recoveryApproval: item.recovery?.reforecastApprovalStatus })) });
  const previous = React.useRef({ binding, items: canonicalItems, version: context?.review?.rowVersionToken });
  const drafts = React.useRef(draftItems);
  drafts.current = draftItems;
  const ownSave = React.useRef<{ binding: string; item: IQuarterReviewItem; status: 'pending' | 'resolved' | 'rejected' }>();
  React.useEffect(() => {
    const prior = previous.current;
    const intent = ownSave.current;
    if (prior.binding !== binding) {
      ownSave.current = undefined;
      setConflict(false);
      setDraftItems(canonicalItems || []);
    } else if (prior.items !== canonicalItems || prior.version !== context?.review?.rowVersionToken) {
      if (intent?.binding === binding && intent.status === 'pending') return;
      if (intent?.binding === binding) {
        const confirmed = canonicalItems?.find(item => item.quarterReviewItemKey === intent.item.quarterReviewItemKey);
        const matched = intent.status === 'resolved' && confirmed && employeeDraftFields.every(field =>
          sameDraftValue(draftValue(confirmed, field), draftValue(intent.item, field)));
        let hasConflict = !matched;
        const retained = (canonicalItems || []).map(server => {
          const base = prior.items?.find(item => item.quarterReviewItemKey === server.quarterReviewItemKey);
          const local = drafts.current.find(item => item.quarterReviewItemKey === server.quarterReviewItemKey);
          const merged = { ...server };
          if (base && local) employeeDraftFields.forEach(field => {
            // The submitted item may also have acquired newer edits while the promise was pending.
            const comparison = server.quarterReviewItemKey === intent.item.quarterReviewItemKey ? intent.item : base;
            if (!sameDraftValue(draftValue(local, field), draftValue(comparison, field))) {
              if (!sameDraftValue(draftValue(server, field), draftValue(base, field)) && !sameDraftValue(draftValue(server, field), draftValue(local, field))
                && !(matched && sameDraftValue(draftValue(server, field), draftValue(comparison, field)))) hasConflict = true;
              retainDraftField(merged, local, field);
            } else if (!matched && !sameDraftValue(draftValue(local, field), draftValue(base, field))) {
              retainDraftField(merged, local, field);
            }
          });
          return merged;
        });
        setDraftItems(retained);
        setConflict(hasConflict);
        ownSave.current = undefined;
      } else {
        setDraftItems(canonicalItems || []);
        setConflict(false);
      }
    }
    previous.current = { binding, items: canonicalItems, version: context?.review?.rowVersionToken };
  }, [canonicalItems, binding, context?.review?.rowVersionToken, saveCompletion]);
  const saveItem = async (item: IQuarterReviewItem): Promise<void> => {
    if (conflict || ownSave.current?.status === 'pending') return;
    const intent = { binding, item, status: 'pending' as 'pending' | 'resolved' | 'rejected' };
    ownSave.current = intent;
    try { await onSaveItem(item); intent.status = 'resolved'; }
    catch (error) { intent.status = 'rejected'; throw error; }
    finally {
      if (ownSave.current === intent) setSaveCompletion(value => value + 1);
    }
  };  const groups = new Map<string, IQuarterReviewItem[]>();
  draftItems.filter(item => item.itemType === 'CoreGold').forEach(item => {
    const key = `${item.pillar || 'Unassigned'}|${item.workstream || 'Unassigned'}`;
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  const readiness = context && lifecycle ? evaluateQuarterSubmissionReadiness(lifecycle, context.review, draftItems) : undefined;
  const legacyBehaviour = getLegacySubmittedQuarterBehaviourCompatibility(workplan, draftItems);
  const update = (item: IQuarterReviewItem): void => setDraftItems(items => items.map(current => current.quarterReviewItemKey === item.quarterReviewItemKey ? item : current));
  const mayPrepare = Boolean(workplan && isAnnualWorkplanEligibleForQuarterlyDraft(workplan));
  return <section className={styles.quarterPage} aria-labelledby="quarter-review-heading">
    {nativeWritesHeld && <p role="status">DEMO TEST view-only: quarterly changes are held. Select a quarter to read saved information.</p>}
    <header className={styles.quarterHeader}>
      <div><span className={styles.sectionLabel}>Production section 05</span><h2 id="quarter-review-heading">Quarterly Review</h2><p>Record progress against your approved Workplan. Calculated RAG remains controlled and Recovery is required for Amber/Red Core or Impact KPIs.</p></div>
      <label><span>Quarter</span><select value={selectedQuarter || ''} disabled={loading} onChange={event => onSelectQuarter(event.target.value as QuarterKey).catch(() => undefined)}>{lifecycles.map(quarter => <option key={quarter.quarterKey} value={quarter.quarterKey}>{quarter.quarterName}</option>)}</select></label>
    </header>
    <ContextualHelp
      purpose="Quarterly Review records progress against the accepted annual Workplan for the selected quarter."
      actions={["Expand a KPI to review its target and current saved result.", "During the open current quarter, enter Actual, Forecast and a concise Status Update, then save.", "For Amber/Red Core or Impact KPI results, complete the appropriate Recovery route and dates."]}
      fields={["Progress is calculated from approved target and Actual where policy is available.", "Calculated RAG remains authoritative unless a valid manager override is separately audited.", "Not rated means the value or scoring policy is unavailable; it is not zero."]}
      next="A complete Quarter Review is submitted to the assigned manager. Manager assessment and approval remain separate."
      scoringNote="Core and Impact planning weights are not scores. Overall Delivery is calculated separately. Behaviour ratings remain standalone labelled assessments."
    />
    <PerformanceConceptGuide />
    <CapturedQuarterDeliverySummary source={context?.review ? { review: context.review, items: context.items, evidence: context.evidence } : undefined} />
    {conflict && <div className={styles.submissionBlocked} role="alert"><strong>Quarter update conflict: unsaved edits are retained.</strong><p>A saved source field changed or this Save could not be confirmed. Further changes are held. Copy your unsaved inputs, then use the Quarter selector to reload and review the saved values before editing again.</p></div>}
    {message && !conflict && <div className={styles.successMessage} role="status">{message}</div>}
    {legacyBehaviour && <div className={styles.readOnlyNotice} role="status">
      <strong>{legacyBehaviour.completionSummary}</strong>
      <p>{legacyBehaviour.quarterlyNotice}</p>
      <p>{legacyBehaviour.managerAction}</p>
    </div>}
    {lifecycle && <div className={styles.quarterTimeline}>
      <div><span>Status</span><strong>{lifecycle.status}</strong></div><div><span>Quarter</span><strong>{lifecycle.quarterStart} → {lifecycle.quarterEnd}</strong></div>
      <div><span>Employee deadline</span><strong>{lifecycle.employeeSubmissionDeadline}</strong></div><div><span>Manager deadline</span><strong>{lifecycle.managerReviewDeadline}</strong></div>
    </div>}
    {contextMismatch ? <div className={styles.submissionBlocked} role="status"><strong>Quarter Review source does not match this selection</strong><p>Reload the selected quarter using the Quarter selector to read its saved review. Updates and preparation are withheld until the selected quarter and accepted Workplan match.</p></div>
      : !workplan || !mayPrepare ? <div className={styles.submissionBlocked}><strong>Accepted Annual Workplan required</strong><p>This Workplan is {workplan?.state || 'unavailable'}. Quarterly updates require an eligible Submitted, Approved or Locked Annual Workplan.</p></div>
      : !context?.review ? <div className={styles.quarterPrepare}>
        <strong>Quarter Review not yet prepared</strong><p>Preparation creates one duplicate-safe employee/quarter header. Impact inputs retain the approved annual definition and classification as an immutable quarterly snapshot.</p>
        {!preparationYearReady && <p role="status">Quarter preparation requires matching Workplan, lifecycle and configuration years. Reload the matching year sources before preparing.</p>}
        <button type="button" className={styles.saveButton} disabled={nativeWritesHeld || loading || saving || !lifecycle?.isOpenForProgressUpdates || !preparationYearReady} onClick={() => onPrepare().catch(() => undefined)}>Prepare {selectedQuarter} review</button>
      </div> : <>
        {context.messages.map(item => <div className={styles.readOnlyNotice} key={item}>{presentImpactTerminology(item)}</div>)}
        <div className={styles.quarterReadiness} data-ready={readiness?.ready ? 'true' : 'false'}>
          <strong>{readiness?.ready ? 'Ready for controlled submission' : `${readiness?.blockers.length || 0} submission blocker(s)`}</strong>
          <span>Draft saves may omit Status Update. Formal submission requires complete commentary, valid inputs and Recovery details where applicable.</span>
          {(readiness?.blockers || []).map(blocker => <small key={blocker}>{blocker}</small>)}
          <button type="button" className={styles.saveButton} disabled={nativeWritesHeld || loading || saving || conflict || !readiness?.ready} onClick={() => onSubmit().catch(() => undefined)}>{context.review.state === 'ChangesRequested' ? 'Resubmit Quarter Review' : 'Submit Quarter Review'}</button>
        </div>
        <section className={styles.quarterSection}><h3>Core Strategy KPIs</h3>{Array.from(groups.entries()).map(([key, items]) => {
          const [pillar, workstream] = key.split('|');
          return <section className={styles.quarterGroup} key={key}><header><strong>{pillar}</strong><span>{workstream}</span></header>{items.map(item => <ItemEditor key={item.quarterReviewItemKey} item={item} context={context} config={config as IProductionConfig} saving={saving} nativeWritesHeld={nativeWritesHeld || loading || conflict} onChange={update} onSave={saveItem} onAddProgress={onAddProgress} />)}</section>;
        })}</section>
        <section className={styles.quarterSection} data-reporting-stream="Impact"><h3>Impact KPIs</h3><p>Impact results remain separate from Core/GOLD reporting; this review records only the approved annual snapshot and quarterly progress inputs.</p>{draftItems.filter(item => item.itemType === 'LocalPersonal').map(item => <ItemEditor key={item.quarterReviewItemKey} item={item} context={context} config={config as IProductionConfig} saving={saving} nativeWritesHeld={nativeWritesHeld || loading || conflict} onChange={update} onSave={saveItem} onAddProgress={onAddProgress} />)}</section>
        <section className={styles.quarterSection}><h3>Behaviours</h3><p>Employee self-assessment, manager assessment and agreed/final assessment remain separate.</p>{draftItems.filter(item => item.itemType === 'Behaviour').map(item => <ItemEditor key={item.quarterReviewItemKey} item={item} context={context} config={config as IProductionConfig} saving={saving} nativeWritesHeld={nativeWritesHeld || loading || conflict}
          onChange={update} onSave={saveItem} onAddProgress={onAddProgress} />)}</section>
      </>}
  </section>;
};

export default QuarterlyReviewPage;
