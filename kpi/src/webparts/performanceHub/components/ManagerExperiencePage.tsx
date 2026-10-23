import * as React from 'react';
import type {
  IManagerExperience,
  IManagerQueueEntry,
  IManagerTeamRow
} from '../models/ManagerExperienceModels';
import type { IManagerWorkplanReviewContext } from '../models/ProductionModels';
import type { IManagerQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import type { BehaviourRating } from '../models/BehaviourWorkplanModels';
import type {
  IOptionEBehaviourManagerReadModel,
  OptionEBehaviourManagerDisposition
} from '../services/BehaviourOptionEBinding';
import ManagerReviewPage from './ManagerReviewPage';
import styles from './ManagerExperiencePage.module.scss';

export type ManagerExperienceMode = 'team' | 'queue';

export interface IManagerExperiencePageProps {
  experience: IManagerExperience;
  annualContexts: IManagerWorkplanReviewContext[];
  quarterContexts: IManagerQuarterReviewContext[];
  loading?: boolean;
  error?: string;
  message?: string;
  saving: boolean;
  nativeWritesHeld?: boolean;
  initialMode?: ManagerExperienceMode;
  initialSelectedPersonKey?: string;
  behaviourReadModels?: Readonly<Record<string, IOptionEBehaviourManagerReadModel>>;
  onBehaviourDisposition?(
    readModel: Extract<IOptionEBehaviourManagerReadModel, { state: 'Available' }>,
    selectionKey: string,
    disposition: OptionEBehaviourManagerDisposition,
    commentary?: string
  ): Promise<void>;
  onRequestChanges(context: IManagerWorkplanReviewContext, reason: string): Promise<void>;
  onApproveAndLock(context: IManagerWorkplanReviewContext): Promise<void>;
  onRequestQuarterChanges(context: IManagerQuarterReviewContext, reason: string): Promise<void>;
  onApproveAndLockQuarter(context: IManagerQuarterReviewContext): Promise<void>;
  onOverrideQuarterRag(
    context: IManagerQuarterReviewContext,
    item: IQuarterReviewItem,
    rag: 'Green' | 'Amber' | 'Red',
    reason: string
  ): Promise<void>;
  onAssessQuarterBehaviour(
    context: IManagerQuarterReviewContext,
    item: IQuarterReviewItem,
    assessment: BehaviourRating
  ): Promise<void>;
}

const formatDeadline = (value?: string): string => value
  ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  : 'Deadline not available';

const authorisedCounts = (
  row: IManagerTeamRow,
  contexts: IManagerWorkplanReviewContext[]
): { core?: number; personal?: number } => {
  const context = contexts.filter(candidate => candidate.employee.personKey === row.personKey)[0];
  if (!context) {
    return {};
  }
  return {
    core: context.coreItems.filter(item => item.activeInWorkplan).length,
    personal: context.personalItems.filter(item => item.activeInWorkplan).length
  };
};

const AttentionList: React.FC<{ row: IManagerTeamRow }> = ({ row }) => row.attentionFlags.length > 0
  ? <ul className={styles.attentionList} aria-label="Attention required">{row.attentionFlags.map(flag =>
    <li key={`${flag.code}|${flag.sourceKey}`} className={flag.code === 'OverdueManagerReview' || flag.code === 'RedPerformance' ? styles.highAttention : styles.mediumAttention}>
      {flag.label}
    </li>
  )}</ul>
  : <p className={styles.noAttention}>No current attention flag.</p>;

const TeamCard: React.FC<{
  row: IManagerTeamRow;
  annualContexts: IManagerWorkplanReviewContext[];
  onOpen(personKey: string): void;
}> = ({ row, annualContexts, onOpen }) => {
  const counts = authorisedCounts(row, annualContexts);
  const coreCount = row.coreKpiCount !== undefined ? row.coreKpiCount : counts.core;
  const personalCount = row.personalKpiCount !== undefined ? row.personalKpiCount : counts.personal;
  return <article className={styles.teamCard}>
    <header className={styles.cardHeader}>
      <div><h3>{row.displayName}</h3><p>{row.email}</p></div>
      {row.worstRag && <span className={`${styles.rag} ${styles[`rag${row.worstRag}`]}`}>{row.worstRag}</span>}
    </header>
    {(row.team || row.jobRole) && <p className={styles.roleLine}>{[row.team, row.jobRole].filter(Boolean).join(' · ')}</p>}
    <dl className={styles.cardFacts}>
      <div><dt>Annual Workplan</dt><dd>{row.workplanStatus}</dd></div>
      <div><dt>Current quarter</dt><dd>{row.currentQuarterStatus}</dd></div>
      {coreCount !== undefined && <div><dt>Core KPIs</dt><dd>{coreCount}</dd></div>}
      {personalCount !== undefined && <div><dt>Impact KPIs</dt><dd>{personalCount}</dd></div>}
      <div><dt>Amber/Red interventions</dt><dd>{row.amberRedInterventionCount}</dd></div>
      <div><dt>Manager action</dt><dd>{row.outstandingManagerAction ? 'Required' : 'None waiting'}</dd></div>
      <div><dt>Employee action</dt><dd>{row.outstandingEmployeeAction ? 'Waiting' : 'None waiting'}</dd></div>
      {row.reviewDeadline && <div><dt>Review deadline</dt><dd>{formatDeadline(row.reviewDeadline)}{row.overdue === true ? ' · Overdue' : ''}</dd></div>}
    </dl>
    <AttentionList row={row} />
    <button type="button" className={styles.openButton} onClick={() => onOpen(row.personKey)}>View employee</button>
  </article>;
};

const QueueCard: React.FC<{
  entry: IManagerQueueEntry;
  onOpen(personKey: string, targetKey: string): void;
}> = ({ entry, onOpen }) => <article className={styles.queueCard}>
  <header className={styles.cardHeader}>
    <div><span className={styles.eyebrow}>{entry.reviewTypeLabel}</span><h3>{entry.employeeDisplayName}</h3><p>{entry.employeeEmail}</p></div>
    <span className={styles.priority}>{entry.attentionFlags[0]?.label || 'Awaiting manager review'}</span>
  </header>
  <dl className={styles.cardFacts}>
    <div><dt>Status</dt><dd>{entry.status}</dd></div>
    <div><dt>Submission</dt><dd>{entry.submissionKind}</dd></div>
    <div><dt>Submitted</dt><dd>{entry.submittedAt ? new Date(entry.submittedAt).toLocaleString('en-GB') : 'Not recorded'}</dd></div>
    <div><dt>Performance year</dt><dd>{entry.performanceYear}</dd></div>
    <div><dt>Review deadline</dt><dd>{formatDeadline(entry.reviewDeadline)}{entry.overdue === true ? ' · Overdue' : ''}</dd></div>
    <div><dt>Submission checks</dt><dd>{entry.incomplete ? 'Incomplete' : 'Complete'}</dd></div>
  </dl>
  {entry.attentionFlags.length > 0 && <ul className={styles.attentionList}>{entry.attentionFlags.map(flag =>
    <li key={`${flag.code}|${flag.sourceKey}`} className={flag.code === 'OverdueManagerReview' || flag.code === 'RedPerformance' ? styles.highAttention : styles.mediumAttention}>{flag.label}</li>
  )}</ul>}
  <button type="button" className={styles.openButton} onClick={() => onOpen(entry.employeePersonKey, entry.openReviewTargetKey)}>Open Review</button>
</article>;

const ManagerExperiencePage: React.FC<IManagerExperiencePageProps> = props => {
  const [mode, setMode] = React.useState<ManagerExperienceMode>(props.initialMode || 'team');
  const [selectedPersonKey, setSelectedPersonKey] = React.useState<string | undefined>(props.initialSelectedPersonKey);
  const [selectedReviewTargetKey, setSelectedReviewTargetKey] = React.useState<string>();
  const [behaviourCommentary, setBehaviourCommentary] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    setMode(props.initialMode || 'team');
    setSelectedPersonKey(props.initialSelectedPersonKey);
    setSelectedReviewTargetKey(undefined);
  }, [props.initialMode, props.initialSelectedPersonKey]);
  const openEmployee = (personKey: string, reviewTargetKey?: string): void => {
    setSelectedPersonKey(personKey);
    setSelectedReviewTargetKey(reviewTargetKey);
  };
  const annualContexts = selectedPersonKey
    ? props.annualContexts.filter(context => context.employee.personKey === selectedPersonKey
      && (!selectedReviewTargetKey || context.workplan.workplanKey === selectedReviewTargetKey))
    : [];
  const quarterContexts = selectedPersonKey
    ? props.quarterContexts.filter(context => context.employee.personKey === selectedPersonKey
      && (!selectedReviewTargetKey || context.review.quarterReviewKey === selectedReviewTargetKey))
    : [];

  if (props.loading) {
    return <section className={styles.page} aria-busy="true"><div className={styles.statePanel}><strong>Loading My Team…</strong><p>Wait while current direct-report reviews are checked.</p></div></section>;
  }
  if (props.error) {
    return <section className={styles.page}><div className={styles.errorPanel} role="alert"><h2>Manager experience unavailable</h2><p>The current direct-report review data could not be loaded.</p><p><strong>Next step:</strong> Reload once. If the problem remains, contact KPI support before making a review decision.</p></div></section>;
  }
  if (props.experience.state !== 'Ready') {
    return <section className={styles.page}>
      <div className={styles.statePanel}>
        <h2>{props.experience.emptyTitle || 'My Team is not available'}</h2>
        <p>{props.experience.emptyMessage || 'No manager data is available for the signed-in identity.'}</p>
        <p><strong>Next step:</strong> Check the signed-in manager assignment, then reload this view.</p>
      </div>
    </section>;
  }
  if (selectedPersonKey) {
    const selected = props.experience.directReports.filter(person => person.personKey === selectedPersonKey)[0];
    const behaviourReadModel = props.behaviourReadModels?.[selectedPersonKey];
    return <section className={styles.page}>
      <button type="button" className={styles.backButton} onClick={() => { setSelectedPersonKey(undefined); setSelectedReviewTargetKey(undefined); }}>{mode === 'queue' ? 'Back to Reviews Awaiting Me' : 'Back to My Team'}</button>
      <header className={styles.detailHeader}>
        <span className={styles.eyebrow}>Direct report review</span>
        <h2>{selected ? selected.displayName : 'Employee review'}</h2>
      </header>
      {behaviourReadModel && <section className={styles.statePanel} aria-label="Per-commitment Behaviour review">
        <h3>Behaviour commitments</h3>
        {behaviourReadModel.state === 'Unavailable'
          ? <p role="status">{behaviourReadModel.reason}</p>
          : behaviourReadModel.snapshots.map(snapshot => {
            const history = behaviourReadModel.events.filter(event => event.selectionKey === snapshot.selectionKey)
              .sort((left, right) => left.sequence - right.sequence);
            const latest = history[history.length - 1];
            const comment = behaviourCommentary[snapshot.selectionKey] || '';
            return <article className={styles.teamCard} key={snapshot.selectionKey} data-behaviour-selection={snapshot.selectionKey}>
              <h4>{snapshot.headlineTitle}</h4>
              <p><strong>{snapshot.focusTitle}</strong></p>
              <p>{snapshot.selectedWording}</p>
              <p><strong>MY COMMITMENT:</strong> {snapshot.myCommitment}</p>
              <p><strong>HOW WILL WE KNOW?</strong> {snapshot.howWillWeKnow}</p>
              <p>Stored catalogue: {snapshot.catalogueVersion} · {snapshot.catalogueEtag}</p>
              <p>Manager status: {latest?.disposition || 'Awaiting review'}</p>
              {history.length > 0 && <ol aria-label={`Manager history for ${snapshot.selectionKey}`}>
                {history.map(event => <li key={event.auditKey}>{event.sequence}. {event.disposition}
                  {event.commentary ? ` — ${event.commentary}` : ''} · {event.changeReference}</li>)}
              </ol>}
              {props.onBehaviourDisposition && <div>
                <label htmlFor={`behaviour-comment-${snapshot.selectionKey}`}>Commentary for Changes Requested</label>
                <textarea id={`behaviour-comment-${snapshot.selectionKey}`} value={comment} disabled={props.nativeWritesHeld}
                  onChange={event => {
                    const value = event.currentTarget.value;
                    setBehaviourCommentary(current => ({ ...current, [snapshot.selectionKey]: value }));
                  }} />
                <button type="button" disabled={props.nativeWritesHeld || props.saving}
                  onClick={() => props.onBehaviourDisposition!(behaviourReadModel, snapshot.selectionKey, 'AGREED')}>
                  Agree commitment
                </button>
                <button type="button" disabled={props.nativeWritesHeld || props.saving || !comment.trim()}
                  onClick={() => props.onBehaviourDisposition!(behaviourReadModel, snapshot.selectionKey,
                    'CHANGES REQUESTED', comment)}>
                  Request changes
                </button>
              </div>}
            </article>;
          })}
      </section>}
      <fieldset disabled={props.nativeWritesHeld} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      {props.nativeWritesHeld && <p role="status">KCF TEST view-only: manager decisions are held. Saved reviews remain available.</p>}
      <ManagerReviewPage
        contexts={annualContexts}
        quarterContexts={quarterContexts}
        saving={props.saving}
        message={props.message}
        onRequestChanges={props.onRequestChanges}
        onApproveAndLock={props.onApproveAndLock}
        onRequestQuarterChanges={props.onRequestQuarterChanges}
        onApproveAndLockQuarter={props.onApproveAndLockQuarter}
        onOverrideQuarterRag={props.onOverrideQuarterRag}
        onAssessQuarterBehaviour={props.onAssessQuarterBehaviour}
      />
      </fieldset>
    </section>;
  }

  return <section className={styles.page} aria-labelledby="manager-experience-heading">
    <header className={styles.pageHeader}>
      <div><span className={styles.eyebrow}>{mode === 'queue' ? 'Manager action queue · current direct reports' : 'Manager experience · current direct reports'}</span><h2 id="manager-experience-heading">{mode === 'queue' ? 'Reviews Awaiting Me' : 'My Team'}</h2></div>
      <nav className={styles.modeTabs} aria-label="Manager view">
        <button type="button" aria-pressed={mode === 'team'} onClick={() => setMode('team')}>My Team</button>
        <button type="button" aria-pressed={mode === 'queue'} onClick={() => setMode('queue')}>Reviews Awaiting Me ({props.experience.reviewQueue.length})</button>
      </nav>
    </header>
    {props.message && <div className={styles.statePanel} role="status">{props.message}</div>}
    {mode === 'team'
      ? <div className={styles.cardGrid}>{props.experience.teamRows.map(row =>
        <TeamCard key={row.personKey} row={row} annualContexts={props.annualContexts} onOpen={personKey => openEmployee(personKey)} />
      )}</div>
      : props.experience.reviewQueue.length === 0
        ? <div className={styles.statePanel}><h3>No reviews are awaiting you</h3><p>Submitted annual and quarterly reviews will appear here.</p><p><strong>Next step:</strong> Return to My Team or check again after an employee submits a review.</p></div>
        : <div className={styles.queueList}>{props.experience.reviewQueue.map(entry =>
          <QueueCard key={entry.key} entry={entry} onOpen={openEmployee} />
        )}</div>}
  </section>;
};

export default ManagerExperiencePage;
