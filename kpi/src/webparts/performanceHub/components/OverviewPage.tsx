import * as React from 'react';
import type { IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem, ICoreKpiCatalogueItem, ICoreWorkplanItem, IPersonalWorkplanItem, IProductionOverview, StorageAclStatus, WorkplanDataLoadState } from '../models/ProductionModels';
import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import type { IWorkplanCategoryWeights } from '../models/GovernanceModels';
import { validateCoreWeights } from '../services/CoreWorkplanValidation';
import { evaluateControlledSubmissionReadiness, validateBehaviourAssignments, validatePersonalItems } from '../services/AnnualWorkplanValidation';
import { buildEmployeeWorkplanStatus } from '../services/EmployeeWorkplanStatus';
import { getLegacySubmittedAnnualBehaviourCompatibility } from '../services/LegacySubmittedBehaviourCompatibility';
import { buildEmployeePerformanceSummary } from '../services/EmployeePerformanceSummary';
import styles from './PerformanceHub.module.scss';
import WorkplanDataUnavailablePanel from './WorkplanDataUnavailable';
import WorkplanStatusPanel from './WorkplanStatusPanel';
import CategoryWeightingPanel from './CategoryWeightingPanel';
import EmployeePerformancePanel from './EmployeePerformancePanel';
import ContextualHelp from './ContextualHelp';

export interface IOverviewPageProps {
  overview: IProductionOverview;
  fallbackDisplayName: string;
  currentUserEmail: string;
  workplan?: IAnnualWorkplan;
  coreCatalogue: ICoreKpiCatalogueItem[];
  coreItems: ICoreWorkplanItem[];
  personalItems: IPersonalWorkplanItem[];
  behaviours: IBehaviourSummary[];
  behaviourItems: IBehaviourWorkplanItem[];
  quarterItems?: IQuarterReviewItem[];
  workplanDataState: WorkplanDataLoadState;
  workplanDataMessage?: string;
  submitting: boolean;
  submissionMessage?: string;
  storageAclStatus: StorageAclStatus;
  onSubmit(): Promise<void>;
  onSaveCategoryWeights?(weights: IWorkplanCategoryWeights, reason?: string): Promise<void>;
}

const formatDate = (value: string): string => new Date(value).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC'
});

const OverviewPage: React.FC<IOverviewPageProps> = ({ overview, fallbackDisplayName, currentUserEmail, workplan, coreCatalogue, coreItems, personalItems, behaviours, behaviourItems, quarterItems = [], workplanDataState, workplanDataMessage, submitting, submissionMessage, onSubmit, onSaveCategoryWeights }) => {
  const { employee, manager, config } = overview;
  const coreWeight = validateCoreWeights(coreItems);
  const personalValidation = validatePersonalItems(personalItems);
  const behaviourValidation = validateBehaviourAssignments(behaviours, behaviourItems);
  const submissionReadiness = evaluateControlledSubmissionReadiness({ workplan, employee, manager, config, coreCatalogue, coreItems, personalItems, behaviours, behaviourItems });
  const activeCoreCount = coreItems.filter(item => item.activeInWorkplan).length;
  const activePersonalCount = personalItems.filter(item => item.activeInWorkplan).length;
  const activeBehaviourCount = behaviourItems.filter(item => item.activeInWorkplan).length;
  const isEditable = workplan?.state === 'Draft' || workplan?.state === 'ChangesRequested';
  const isSubmitted = workplan?.state === 'Submitted';
  const isLocked = workplan?.state === 'Locked';
  const isApproved = workplan?.state === 'Approved';
  const hasVerifiedWorkplanData = workplanDataState === 'available' && Boolean(workplan);
  const unavailableState: Exclude<WorkplanDataLoadState, 'available'> = workplanDataState === 'available' ? 'unavailable' : workplanDataState;
  const employeeStatus = buildEmployeeWorkplanStatus(workplan, manager, coreItems, personalItems, behaviourItems);
  const legacyBehaviour = getLegacySubmittedAnnualBehaviourCompatibility(workplan, behaviourItems);
  const performance = buildEmployeePerformanceSummary(coreItems, personalItems, quarterItems, config, behaviourItems, workplan);
  const categoryWeights = workplan ? {
    core: workplan.coreCategoryWeight,
    personal: workplan.personalCategoryWeight,
    behaviours: workplan.behaviourCategoryWeight
  } : {
    core: config?.weights.core || 0,
    personal: config?.weights.personal || 0,
    behaviours: config?.weights.behaviours || 0
  };
  const [draftCategoryWeights, setDraftCategoryWeights] = React.useState<IWorkplanCategoryWeights>(categoryWeights);
  const [categoryReason, setCategoryReason] = React.useState(workplan?.categoryWeightReason || '');
  React.useEffect(() => {
    setDraftCategoryWeights(categoryWeights);
    setCategoryReason(workplan?.categoryWeightReason || '');
  }, [workplan?.workplanKey, workplan?.etag, categoryWeights.core, categoryWeights.personal, categoryWeights.behaviours]);
  const lifecycleReady = isEditable ? submissionReadiness.ready : isSubmitted || isApproved || isLocked;
  const lifecycleHeading = isLocked
    ? 'Manager approved and locked — content is read-only'
    : isApproved
      ? 'Manager approved — lock finalisation is pending'
      : isSubmitted
        ? 'Workplan submitted — employee editing is locked'
        : submissionReadiness.ready
          ? workplan?.state === 'ChangesRequested' ? 'Amendments are ready to resubmit' : 'Draft content is submission-ready'
          : `${submissionReadiness.blockers.length} submission-readiness blocker${submissionReadiness.blockers.length === 1 ? '' : 's'}`;
  return (
    <>
      {overview.loadMessages.map(message => <div className={styles.errorMessage} role="alert" key={message}>{message}</div>)}

      <section className={styles.overviewHero} aria-labelledby="overview-heading">
        <div>
          <span className={styles.sectionLabel}>Annual Workplan</span>
          <h2 id="overview-heading">Welcome, {employee?.displayName || fallbackDisplayName}</h2>
          <p>See where your Workplan stands, what is already complete and what you need to do next.</p>
        </div>
        <div className={styles.yearBlock}>
          <span>Performance Year</span>
          <strong>{config?.performanceYear || 'Not configured'}</strong>
          {config && <small>{formatDate(config.performanceYearStart)} – {formatDate(config.performanceYearEnd)}</small>}
        </div>
      </section>

      <ContextualHelp
        purpose="Use Overview to understand your Workplan status, current manager, category balance and current-quarter performance."
        actions={["Read the next action shown under My Workplan status.", "Use the section navigation to review or edit content when your Workplan is editable.", "Treat performance indicators separately from category weights."]}
        fields={["Workplan status controls whether content is editable.", "Current category weights show Workplan balance, not performance.", "Current-quarter RAG uses rated KPI results; blank or unresolved results remain Not rated."]}
        next="A Draft is submitted to your manager. A Submitted Workplan remains read-only unless your manager requests changes."
        scoringNote={config ? `How scoring works: current policy is Green at ${config.rag.greenThreshold}% or above and Amber at ${config.rag.amberThreshold}% or above. NotRated items are not treated as zero.` : undefined}
      />

      <div className={styles.overviewGrid}>
        {hasVerifiedWorkplanData ? <WorkplanStatusPanel status={employeeStatus} /> : <WorkplanDataUnavailablePanel
          state={unavailableState}
          overview={overview}
          currentUserEmail={currentUserEmail}
          sectionName="Overview"
          message={workplanDataMessage}
        />}

        <aside className={styles.identityPanel} aria-label="Employee and Workplan summary">
          <div className={styles.identityHeading}>
            <span className={styles.avatar}>{(employee?.displayName || fallbackDisplayName).charAt(0)}</span>
            <div><span className={styles.sectionLabel}>Employee</span><h2>{employee?.displayName || fallbackDisplayName}</h2></div>
          </div>
          <dl className={styles.identityDetails}>
            <div><dt>Email</dt><dd>{employee?.email || currentUserEmail}</dd></div>
            <div><dt>Manager</dt><dd>{manager?.displayName || employee?.managerEmail || 'Not configured'}</dd></div>
            <div><dt>Team</dt><dd>{employee?.team || 'Not configured'}</dd></div>
            <div><dt>Workplan status</dt><dd><span className={styles.statusPill}>{overview.workplanStatus}</span></dd></div>
          </dl>
        </aside>
      </div>

      {hasVerifiedWorkplanData && <CategoryWeightingPanel
        weights={isEditable ? draftCategoryWeights : categoryWeights}
        workplanState={workplan?.state || 'Unavailable'}
        editable={isEditable}
        activePersonalKpiCount={activePersonalCount}
        reason={categoryReason}
        saving={submitting}
        onChange={setDraftCategoryWeights}
        onReasonChange={setCategoryReason}
        onSave={onSaveCategoryWeights ? () => onSaveCategoryWeights(draftCategoryWeights, categoryReason || undefined) : undefined}
      />}

      {hasVerifiedWorkplanData && <EmployeePerformancePanel summary={performance} />}

      <section className={styles.workplanSummary} aria-labelledby="draft-summary-heading">
        <div className={styles.sectionHeading}><div><span className={styles.sectionLabel}>Submission and review</span><h2 id="draft-summary-heading">Workplan completion</h2></div><span className={styles.statusPill}>{hasVerifiedWorkplanData ? workplan?.state : unavailableState === 'notReady' ? 'Not loaded' : 'Unavailable'}</span></div>
        {hasVerifiedWorkplanData ? <>
          {workplan?.managerDecisionComment && <div className={styles.changeRequestNotice} role="status">
            <span className={styles.sectionLabel}>{workplan.state === 'ChangesRequested' ? 'Manager changes requested' : 'Latest manager change-request comment'}</span>
            <strong>{workplan.managerDecisionComment}</strong>
            {workplan.state === 'ChangesRequested' && <p>Amend the relevant sections, confirm the validation checks, then resubmit this same Workplan.</p>}
          </div>}
          <div className={styles.summaryGrid}>
            <article><strong>{activeCoreCount}</strong><span>Core KPIs selected</span><small>Any of 109 approved current KPIs</small></article>
            <article><strong>{coreWeight.total}%</strong><span>Core planning weight</span><small>{coreWeight.state === 'complete' ? 'Complete' : coreWeight.state === 'invalid' ? 'Invalid' : 'Incomplete'}</small></article>
            <article><strong>{activePersonalCount}</strong><span>Impact KPIs</span><small>{personalValidation.state === 'invalid' || personalValidation.state === 'incomplete' ? `${personalValidation.total}% planning weight · incomplete` : personalValidation.state === 'complete' ? '100% planning weight · complete' : 'Optional · none selected'}</small></article>
            <article><strong>{activeBehaviourCount} / 5</strong><span>Behaviours assigned</span><small>{legacyBehaviour?.completionSummary || (behaviourValidation.state === 'complete' ? '100% · complete' : 'Framework assignment incomplete')}</small></article>
          </div>
          {legacyBehaviour && <div className={styles.readOnlyNotice} role="status">
            <strong>{legacyBehaviour.completionSummary}</strong>
            <p>{legacyBehaviour.annualNotice}</p>
            <p>{legacyBehaviour.managerAction}</p>
          </div>}
          {submissionMessage && <div className={submissionMessage.toLowerCase().includes('could not') ? styles.errorMessage : styles.successMessage} role="status">{submissionMessage}</div>}
          <div className={lifecycleReady ? styles.submissionReady : styles.submissionBlocked}>
            <div><span className={styles.sectionLabel}>Cross-section validation</span><strong>{lifecycleHeading}</strong></div>
            {isEditable && !submissionReadiness.ready && <ul>{submissionReadiness.blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul>}
            {isSubmitted && <p>Submitted {workplan?.submittedAt ? new Date(workplan.submittedAt).toLocaleString('en-GB') : 'at an unavailable time'} by {workplan?.submittedByEmail || 'the employee'}.</p>}
            {isLocked && <p>Approved {workplan?.approvedAt ? new Date(workplan.approvedAt).toLocaleString('en-GB') : 'at an unavailable time'} and locked {workplan?.lockedAt ? new Date(workplan.lockedAt).toLocaleString('en-GB') : 'at an unavailable time'} by {workplan?.lockedByEmail || workplan?.approvedByEmail || 'the assigned manager'}.</p>}
            {isEditable && <button
              type="button"
              disabled={submitting || !submissionReadiness.ready}
              onClick={() => onSubmit().catch(() => undefined)}
            >
              {submitting ? 'Checking…' : workplan?.state === 'ChangesRequested' ? 'Resubmit Workplan' : 'Submit Workplan'}
            </button>}
            <small>Only the assigned manager can Request Changes, approve or lock. Employees cannot unlock their own Workplan.</small>
          </div>
          <p className={styles.overviewNextAction}>{isLocked
            ? 'This approved Workplan is read-only. Any future change must use the controlled Request Workplan Change route.'
            : isSubmitted || isApproved
              ? 'The employee can view this Workplan but cannot change its Core, Impact or Behaviour content.'
              : workplan?.state === 'ChangesRequested'
                ? 'Next action: make the requested amendments and resubmit. The original submission audit remains unchanged.'
                : 'Next action: complete any sections listed above. Submission stays disabled until every mandatory check passes.'}</p>
        </> : <WorkplanDataUnavailablePanel
          state={unavailableState}
          overview={overview}
          currentUserEmail={currentUserEmail}
          sectionName="Overview"
          message={workplanDataMessage}
        />}
      </section>

    </>
  );
};

export default OverviewPage;
