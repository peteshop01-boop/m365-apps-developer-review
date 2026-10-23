import * as React from 'react';
import type { IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem } from '../models/ProductionModels';
import type {
  BehaviourKey,
  BehaviourRating,
  GovernedBehaviourRoleLevel,
  IGovernedBehaviourCatalogueContract,
  IGovernedBehaviourCatalogueExpectation,
  IGovernedBehaviourCommitmentCommand,
  IGovernedBehaviourCommitmentDraft,
  IGovernedBehaviourHeadlineRatingInput,
  IGovernedBehaviourManagerReviewEntry,
  IBehaviourObjectiveLibraryRecord,
  ISelectedBehaviourObjective
} from '../models/BehaviourWorkplanModels';
import type { QuarterKey } from '../models/QuarterlyModels';
import { BEHAVIOUR_KEYS } from '../models/BehaviourWorkplanModels';
import {
  BEHAVIOUR_RATING_SCALE,
  buildGovernedBehaviourCommitmentCommand,
  buildGovernedBehaviourHeadlineRatingSet,
  buildGovernedBehaviourSelectionView,
  calculateBehaviourRating,
  DEFAULT_BEHAVIOUR_TARGET_RATING,
  getBehaviourRatingLabel,
  isBehaviourRating,
  reopenGovernedBehaviourCommitmentReadModel,
  validateBehaviourObjectives
} from '../services/BehaviourWorkplanPolicy';
import { parseBehaviourGuidance } from '../services/BehaviourGuidance';
import { isEmployeeWorkplanEditable } from '../services/EmployeeWorkplanStatus';
import { getLegacySubmittedAnnualBehaviourCompatibility } from '../services/LegacySubmittedBehaviourCompatibility';
import {
  behaviourSelectionIsComplete,
  choosePrimaryBehaviourSuggestion,
  getEmployeeBehaviourSuggestions,
  getLocalBehaviourLibrarySuggestions
} from '../services/EmployeeBehaviourSelection';
import styles from './PerformanceHub.module.scss';
import ContextualHelp from './ContextualHelp';
import { PerformanceConceptGuide } from './PerformancePresentation';
import BehaviourFrameworkV2Panel, { type IBehaviourFrameworkV2PanelProps } from './BehaviourFrameworkV2Panel';
import BehaviourLibrarySelector from './BehaviourLibrarySelector';

export interface IBehaviourWorkplanPageProps {
  workplan: IAnnualWorkplan;
  behaviours: IBehaviourSummary[];
  library: ReadonlyArray<IBehaviourObjectiveLibraryRecord>;
  items: IBehaviourWorkplanItem[];
  saving: boolean;
  message?: string;
  localUat?: boolean;
  behaviourLibraryAsOf?: Date;
  behaviourFrameworkV2?: IBehaviourFrameworkV2PanelProps;
  governedShell?: Readonly<{
    catalogue: IGovernedBehaviourCatalogueContract;
    expectedAuthority: IGovernedBehaviourCatalogueExpectation;
    roleLevel: GovernedBehaviourRoleLevel;
    workplanVersion: string;
    actorEmail: string;
    changeReference: string;
    asOf: Date;
    initialCommitments: readonly IGovernedBehaviourCommitmentDraft[];
    historicReadModel?: IGovernedBehaviourCommitmentCommand;
    managerHistory?: readonly IGovernedBehaviourManagerReviewEntry[];
    headlineRatings?: readonly IGovernedBehaviourHeadlineRatingInput[];
  }>;
  onSave(items: IBehaviourWorkplanItem[]): Promise<void>;
  onGovernedCommand?(command: Readonly<IGovernedBehaviourCommitmentCommand>): Promise<void>;
}

const asBehaviourKey = (value: string): BehaviourKey | undefined =>
  BEHAVIOUR_KEYS.indexOf(value as BehaviourKey) >= 0 ? value as BehaviourKey : undefined;

const itemFromBehaviour = (
  workplan: IAnnualWorkplan,
  behaviour: IBehaviourSummary,
  existing: IBehaviourWorkplanItem | undefined,
  index: number
): IBehaviourWorkplanItem => existing ? { ...existing, activeInWorkplan: true } : {
  id: -(2100 + index),
  etag: 'LOCAL-DRAFT',
  workplanItemKey: '',
  naturalKey: '',
  workplanKey: workplan.workplanKey,
  personKey: workplan.personKey,
  performanceYear: workplan.performanceYear,
  behaviourId: behaviour.behaviourId,
  behaviourVersionKey: behaviour.behaviourVersionKey,
  objectiveSource: 'Library',
  selectedSuggestionKeys: [],
  customObjective: '',
  targetRating: DEFAULT_BEHAVIOUR_TARGET_RATING,
  q1TargetRating: DEFAULT_BEHAVIOUR_TARGET_RATING,
  q2TargetRating: DEFAULT_BEHAVIOUR_TARGET_RATING,
  q3TargetRating: DEFAULT_BEHAVIOUR_TARGET_RATING,
  q4TargetRating: DEFAULT_BEHAVIOUR_TARGET_RATING,
  behaviourItemWeight: 20,
  displayOrder: behaviour.displayOrder,
  activeInWorkplan: true
};

const toSelected = (item: IBehaviourWorkplanItem): ISelectedBehaviourObjective | undefined => {
  const behaviourKey = asBehaviourKey(item.behaviourId);
  if (!behaviourKey) return undefined;
  return {
    behaviourKey,
    source: item.objectiveSource || 'Library',
    sourceObjectiveKey: item.sourceObjectiveKey,
    selectedSuggestionKeys: item.selectedSuggestionKeys || (item.sourceObjectiveKey ? [item.sourceObjectiveKey] : []),
    customObjective: item.customObjective,
    objectiveTitle: item.objectiveTitle || '',
    objectiveDescription: item.objectiveDescription || '',
    measure: item.measure || '',
    unit: item.unit || '',
    evidenceDefinition: item.evidenceDefinition || '',
    quarterTargets: {
      q1Target: item.q1TargetText || '', q2Target: item.q2TargetText || '',
      q3Target: item.q3TargetText || '', q4Target: item.q4TargetText || ''
    },
    targetRating: item.q1TargetRating || item.targetRating,
    behaviourWeight: item.behaviourItemWeight ?? 20,
    activeInWorkplan: item.activeInWorkplan
  };
};

const ratingForQuarter = (item: IBehaviourWorkplanItem, quarter: QuarterKey): BehaviourRating | undefined => {
  if (quarter === 'Q1') return item.q1TargetRating || item.targetRating;
  if (quarter === 'Q2') return item.q2TargetRating || item.targetRating;
  if (quarter === 'Q3') return item.q3TargetRating || item.targetRating;
  return item.q4TargetRating || item.targetRating;
};

const ratingPatch = (quarter: QuarterKey, rating: BehaviourRating | undefined): Partial<IBehaviourWorkplanItem> => {
  if (quarter === 'Q1') return { q1TargetRating: rating };
  if (quarter === 'Q2') return { q2TargetRating: rating };
  if (quarter === 'Q3') return { q3TargetRating: rating };
  return { q4TargetRating: rating };
};

interface IGovernedBehaviourCommitmentShellProps {
  workplan: IAnnualWorkplan;
  saving: boolean;
  message?: string;
  shell: NonNullable<IBehaviourWorkplanPageProps['governedShell']>;
  onCommand?: IBehaviourWorkplanPageProps['onGovernedCommand'];
}

const GovernedBehaviourCommitmentShell: React.FC<IGovernedBehaviourCommitmentShellProps> = ({
  workplan, saving, message, shell, onCommand
}) => {
  const [drafts, setDrafts] = React.useState<IGovernedBehaviourCommitmentDraft[]>(() =>
    shell.initialCommitments.map(item => ({ ...item })));
  React.useEffect(() => setDrafts(shell.initialCommitments.map(item => ({ ...item }))), [shell.initialCommitments]);

  if (workplan.state !== 'Draft' && workplan.state !== 'ChangesRequested') {
    if (!shell.historicReadModel) return <section className={styles.behavioursPage} aria-labelledby="governed-behaviour-heading">
      <div className={styles.errorMessage} role="alert">Governed Behaviour history is unavailable. Submitted and later Workplans remain read-only and fail closed.</div>
    </section>;
    try {
      const historic = reopenGovernedBehaviourCommitmentReadModel(shell.historicReadModel);
      return <section className={styles.behavioursPage} aria-labelledby="governed-behaviour-heading">
        <div className={styles.coreHeader}><div><span className={styles.sectionLabel}>Governed Behaviour commitments · {workplan.state}</span><h2 id="governed-behaviour-heading">Behaviour commitments</h2><p>Historic wording and catalogue identity are preserved exactly as submitted.</p></div></div>
        <div className={styles.readOnlyNotice}>Read-only · catalogue {historic.catalogueAuthority.version} · {historic.catalogueAuthority.changeReference} · Behaviours excluded from Delivery arithmetic</div>
        <div className={styles.behaviourList}>{historic.commitments.map(item => <article key={item.commitmentKey}>
          <span>{item.behaviourKey}</span><div><div className={styles.behaviourTitle}><strong>{item.headlineTitle}</strong><span className={styles.assignedBadge}>{item.roleLevel}</span></div>
            <p><strong>{item.focusTitle}</strong> · {item.targetWording}</p><dl className={styles.currentKpiResult}><div><dt>MY COMMITMENT</dt><dd>{item.myCommitment}</dd></div><div><dt>HOW WILL WE KNOW?</dt><dd>{item.howWillWeKnow}</dd></div></dl>
            <small>{item.targetKey} · {item.catalogueVersion} · {item.catalogueEtag}</small></div>
        </article>)}</div>
      </section>;
    } catch (error) {
      return <section className={styles.behavioursPage} aria-labelledby="governed-behaviour-heading"><div className={styles.errorMessage} role="alert">{error instanceof Error ? error.message : 'Governed Behaviour history failed closed.'}</div></section>;
    }
  }

  let view: ReturnType<typeof buildGovernedBehaviourSelectionView> = [];
  let boundaryIssue = '';
  try {
    view = buildGovernedBehaviourSelectionView(
      shell.catalogue,
      shell.expectedAuthority,
      shell.roleLevel,
      shell.asOf,
      drafts.filter(item => item.source === 'GovernedTarget' && item.targetKey).map(item => item.targetKey!)
    );
  } catch (error) {
    boundaryIssue = error instanceof Error ? error.message : 'Governed Behaviour catalogue failed closed.';
  }
  const buildCommand = (action: 'Save' | 'Submit'): Readonly<IGovernedBehaviourCommitmentCommand> | undefined => {
    try {
      return buildGovernedBehaviourCommitmentCommand(shell.catalogue, shell.expectedAuthority, {
        action,
        workplanKey: workplan.workplanKey,
        expectedWorkplanVersion: shell.workplanVersion,
        currentWorkplanVersion: workplan.etag,
        state: workplan.state,
        roleLevel: shell.roleLevel,
        actorEmail: shell.actorEmail,
        occurredAt: new Date().toISOString(),
        changeReference: shell.changeReference
      }, drafts, shell.asOf);
    } catch {
      return undefined;
    }
  };
  const saveCommand = boundaryIssue ? undefined : buildCommand('Save');
  const submitCommand = boundaryIssue ? undefined : buildCommand('Submit');
  let ratingIssue = '';
  let ratingSet: ReturnType<typeof buildGovernedBehaviourHeadlineRatingSet> | undefined;
  if (shell.headlineRatings) {
    try {
      ratingSet = buildGovernedBehaviourHeadlineRatingSet(
        shell.catalogue, shell.expectedAuthority, shell.headlineRatings
      );
    } catch (error) {
      ratingIssue = error instanceof Error ? error.message : 'Headline Behaviour ratings failed closed.';
    }
  }
  const selected = (behaviourKey: BehaviourKey, focusKey: string, targetKey: string): boolean =>
    drafts.some(item => item.source === 'GovernedTarget' && item.behaviourKey === behaviourKey
      && item.focusKey === focusKey && item.targetKey === targetKey);
  const toggleTarget = (behaviourKey: BehaviourKey, focusKey: string, targetKey: string): void => {
    setDrafts(current => {
      const existing = current.filter(item => item.source === 'GovernedTarget' && item.targetKey === targetKey)[0];
      if (existing) return current.filter(item => item.commitmentKey !== existing.commitmentKey);
      if (current.length >= 5) return current;
      return [...current, {
        commitmentKey: `COMMIT-${targetKey}`,
        source: 'GovernedTarget',
        behaviourKey,
        focusKey,
        roleLevel: shell.roleLevel,
        targetKey,
        catalogueVersion: shell.expectedAuthority.version,
        catalogueEtag: shell.expectedAuthority.etag,
        myCommitment: '',
        howWillWeKnow: ''
      }];
    });
  };
  const addOwn = (behaviourKey: BehaviourKey, focusKey: string): void => {
    setDrafts(current => current.length >= 5 ? current : [...current, {
      commitmentKey: `OWN-${behaviourKey}-${focusKey}-${current.length + 1}`,
      source: 'OwnTarget',
      behaviourKey,
      focusKey,
      roleLevel: shell.roleLevel,
      ownTarget: '',
      catalogueVersion: shell.expectedAuthority.version,
      catalogueEtag: shell.expectedAuthority.etag,
      myCommitment: '',
      howWillWeKnow: ''
    }]);
  };
  const updateDraft = (commitmentKey: string, patch: Partial<IGovernedBehaviourCommitmentDraft>): void => {
    setDrafts(current => current.map(item => item.commitmentKey === commitmentKey ? { ...item, ...patch } : item));
  };
  const issueCommand = (command: Readonly<IGovernedBehaviourCommitmentCommand> | undefined): void => {
    if (command && onCommand) onCommand(command).catch(() => undefined);
  };

  return <section className={styles.behavioursPage} aria-labelledby="governed-behaviour-heading">
    <div className={styles.coreHeader}><div><span className={styles.sectionLabel}>Governed Behaviour commitments · {workplan.state}</span><h2 id="governed-behaviour-heading">Behaviour commitments</h2><p>Normally choose 3–5 total commitments. Suggestions are role-filtered prompts; you may also write your own measurable target.</p></div><div className={styles.headerActions}><button type="button" className={styles.secondaryButton} disabled={saving || !saveCommand || !onCommand} onClick={() => issueCommand(saveCommand)}>Save Behaviour Draft</button><button type="button" className={styles.saveButton} disabled={saving || !submitCommand || !onCommand} onClick={() => issueCommand(submitCommand)}>Submit Behaviour commitments</button></div></div>
    <div className={styles.readOnlyNotice}><strong>{drafts.length} / 5 selected</strong><span>MY COMMITMENT and HOW WILL WE KNOW? are required for every item. Behaviours produce no numeric/per-target score, RAG or Delivery contribution.</span></div>
    {boundaryIssue && <div className={styles.errorMessage} role="alert">{boundaryIssue}</div>}
    {ratingIssue && <div className={styles.errorMessage} role="alert">{ratingIssue}</div>}
    {ratingSet && <div className={styles.readOnlyNotice} aria-label="Headline Behaviour ratings">{ratingSet.ratings.map(item => <span key={item.behaviourKey}>{item.behaviourKey}: {item.rating}</span>)}</div>}
    {message && <div className={styles.successMessage} role="status">{message}</div>}
    {!boundaryIssue && <div className={styles.behaviourList}>{view.map(headline => <article key={headline.behaviourKey}>
      <span>{headline.behaviourKey}</span><div><div className={styles.behaviourTitle}><strong>{headline.headlineTitle}</strong><span className={styles.assignedBadge}>{shell.roleLevel}</span></div>
        {headline.focuses.map(focus => <fieldset key={focus.focusKey} className={styles.behaviourObjectiveOptions}><legend>{focus.focusTitle}</legend>{focus.targets.map(target => <label key={target.targetKey}><input type="checkbox" disabled={saving || !target.selectable || (!selected(headline.behaviourKey, focus.focusKey, target.targetKey) && drafts.length >= 5)} checked={selected(headline.behaviourKey, focus.focusKey, target.targetKey)} onChange={() => toggleTarget(headline.behaviourKey, focus.focusKey, target.targetKey)} /><span><strong>{target.targetKey}</strong>{target.wording}{target.historicallySelected ? ' · Historic selection' : ''}</span></label>)}<button type="button" className={styles.secondaryButton} disabled={saving || drafts.length >= 5} onClick={() => addOwn(headline.behaviourKey, focus.focusKey)}>+ WRITE MY OWN BEHAVIOUR COMMITMENT</button></fieldset>)}
      </div>
    </article>)}</div>}
    <div className={styles.behaviourList}>{drafts.map(item => <article key={item.commitmentKey}>
      <span>{item.behaviourKey}</span><div><div className={styles.behaviourTitle}><strong>{item.commitmentKey}</strong><button type="button" className={styles.secondaryButton} disabled={saving} onClick={() => setDrafts(current => current.filter(candidate => candidate.commitmentKey !== item.commitmentKey))}>Remove</button></div>
        {item.source === 'OwnTarget' && <label><span>MY OWN MEASURABLE TARGET</span><textarea rows={2} disabled={saving} value={item.ownTarget || ''} onChange={event => updateDraft(item.commitmentKey, { ownTarget: event.target.value })} /></label>}
        <label><span>MY COMMITMENT</span><textarea rows={3} disabled={saving} value={item.myCommitment} onChange={event => updateDraft(item.commitmentKey, { myCommitment: event.target.value })} /></label>
        <label><span>HOW WILL WE KNOW?</span><textarea rows={3} disabled={saving} value={item.howWillWeKnow} onChange={event => updateDraft(item.commitmentKey, { howWillWeKnow: event.target.value })} /></label>
        <small>{item.source} · {item.focusKey} · {item.catalogueVersion} · {item.catalogueEtag}</small></div>
    </article>)}</div>
    {shell.managerHistory && shell.managerHistory.length > 0 && <div className={styles.readOnlyNotice} aria-label="Manager Behaviour review history">{shell.managerHistory.map(entry => <span key={entry.auditKey}>{entry.sequence}. {entry.disposition} · {entry.managerEmail} · {entry.changeReference}</span>)}</div>}
  </section>;
};

const BehaviourWorkplanPage: React.FC<IBehaviourWorkplanPageProps> = ({ workplan, behaviours, library, items, saving, message, localUat, behaviourLibraryAsOf, behaviourFrameworkV2, governedShell, onSave, onGovernedCommand }) => {
  const initial = React.useCallback((): IBehaviourWorkplanItem[] => behaviours.map((behaviour, index) => itemFromBehaviour(
    workplan,
    behaviour,
    items.find(item => item.behaviourId === behaviour.behaviourId),
    index
  )), [behaviours, items, workplan]);
  const [draftItems, setDraftItems] = React.useState<IBehaviourWorkplanItem[]>(initial);
  const [selfRatings, setSelfRatings] = React.useState<Record<string, BehaviourRating | undefined>>({});
  const [assessmentQuarter, setAssessmentQuarter] = React.useState<QuarterKey>('Q1');

  React.useEffect(() => setDraftItems(initial()), [initial]);

  if (behaviourFrameworkV2) return <BehaviourFrameworkV2Panel {...behaviourFrameworkV2} />;
  if (governedShell) return <GovernedBehaviourCommitmentShell
    workplan={workplan}
    saving={saving}
    message={message}
    shell={governedShell}
    onCommand={onGovernedCommand}
  />;

  const v2Items = items.filter(item => item.activeInWorkplan && Boolean(item.behaviourSnapshotV2))
    .sort((left, right) => left.displayOrder - right.displayOrder);
  if (v2Items.length > 0) {
    return <section className={styles.behavioursPage} aria-labelledby="behaviour-workplan-v2-heading">
      <div className={styles.coreHeader}><div><span className={styles.sectionLabel}>KCCC-BEHAVIOUR|v02 · {workplan.state}</span><h2 id="behaviour-workplan-v2-heading">Behaviour commitments</h2><p>Five separate KCCC Values. Effective is expected-role guidance, not a target.</p></div></div>
      {v2Items.length !== 5 && <div className={styles.errorMessage} role="alert">The stored v02 set is incomplete. Exactly five snapshotted Values are required.</div>}
      <div className={styles.readOnlyNotice} aria-label="Behaviour v02 assessment labels"><strong>1 Developing · 2 Effective · 3 Exceptional</strong><span>Undefined means not assessed. No Behaviour target, weight, average or RAG is calculated.</span></div>
      <div className={styles.behaviourList}>{v2Items.map(item => {
        const snapshot = item.behaviourSnapshotV2!;
        return <article key={item.naturalKey} data-behaviour-v2-value={snapshot.valueId}>
          <span>{snapshot.valueId}</span><div><div className={styles.behaviourTitle}><strong>{snapshot.valueTitle}</strong><span className={styles.assignedBadge}>{snapshot.roleTier}</span></div>
            <p>{snapshot.corporateValue}</p><p>{snapshot.descriptor}</p>
            <dl className={styles.currentKpiResult}><div><dt>Annual commitment</dt><dd>{item.behaviourCommitmentV2 || 'Not recorded'}</dd></div>{snapshot.periodKeys.map(period => <div key={period}><dt>{period}</dt><dd>{item.behaviourPeriodCommitmentsV2?.[period] || 'Not recorded'}</dd></div>)}</dl>
            {item.behaviourSelectionSnapshotsV2?.selections.map(selection => <section key={selection.selectionKey}
              data-behaviour-v2-selection={selection.selectionKey}>
              <h3>{selection.source === 'Catalogue' ? selection.focusArea : 'Own commitment'}</h3>
              {selection.source === 'Catalogue' && <p><strong>Approved example:</strong> {selection.selectedExampleText}</p>}
              <dl><div><dt>MY COMMITMENT</dt><dd>{selection.commitment}</dd></div>
                <div><dt>HOW WILL WE KNOW?</dt><dd>{selection.howWillWeKnow}</dd></div></dl>
              {selection.source === 'Catalogue' && <small>Stored catalogue {selection.catalogueVersion}
                {' '}revision {selection.catalogueRevision}</small>}
            </section>)}
            <small>Stored immutable framework {snapshot.frameworkVersion} · {snapshot.cadence}</small>
          </div>
        </article>;
      })}</div>
      {message && <div className={styles.successMessage} role="status">{message}</div>}
    </section>;
  }

  const editable = isEmployeeWorkplanEditable(workplan);
  const legacyBehaviour = getLegacySubmittedAnnualBehaviourCompatibility(workplan, items);
  const selected = draftItems.map(toSelected).filter((value): value is ISelectedBehaviourObjective => Boolean(value));
  const policyValidation = validateBehaviourObjectives(selected);
  const applicablePolicyErrors = localUat && behaviourLibraryAsOf
    ? policyValidation.errors.filter(error => !error.includes('suggestion keys must be unique approved OBJ-01 to OBJ-05'))
    : policyValidation.errors;
  const quarterlyRatingsValid = draftItems.every(item => ['Q1', 'Q2', 'Q3', 'Q4'].every(quarter => {
    const rating = ratingForQuarter(item, quarter as QuarterKey);
    return isBehaviourRating(rating);
  }));
  const validation = {
    ...policyValidation,
    valid: applicablePolicyErrors.length === 0 && quarterlyRatingsValid,
    errors: quarterlyRatingsValid ? applicablePolicyErrors : [...applicablePolicyErrors, 'Each Behaviour needs a Q1–Q4 rating target from 1 to 4.']
  };

  const update = (behaviourId: string, patch: Partial<IBehaviourWorkplanItem>): void => {
    setDraftItems(current => current.map(item => item.behaviourId === behaviourId ? { ...item, ...patch } : item));
  };

  const toggleLibrary = (behaviour: IBehaviourSummary, item: IBehaviourWorkplanItem, key: string): void => {
    const current = item.selectedSuggestionKeys || (item.sourceObjectiveKey ? [item.sourceObjectiveKey] : []);
    const selectedSuggestionKeys = current.indexOf(key) >= 0 ? current.filter(value => value !== key) : [...current, key];
    const primaryKey = choosePrimaryBehaviourSuggestion(selectedSuggestionKeys, item.sourceObjectiveKey);
    const source = primaryKey ? library.find(row => row.behaviourObjectiveKey === primaryKey && row.behaviourKey === behaviour.behaviourId && row.active) : undefined;
    update(behaviour.behaviourId, {
      objectiveSource: selectedSuggestionKeys.length > 0 ? 'Library' : 'Custom',
      sourceObjectiveKey: primaryKey, selectedSuggestionKeys,
      objectiveTitle: source?.objectiveTitle || item.customObjective || '',
      objectiveDescription: source?.objectiveDescription || item.customObjective || '',
      measure: source?.suggestedMeasure || item.measure || 'Quarterly Behaviour commitment',
      unit: source?.suggestedUnit || item.unit || 'Rating',
      evidenceDefinition: source?.suggestedEvidence || item.evidenceDefinition || 'Quarterly examples and agreed review evidence.'
    });
  };

  return <section className={styles.behavioursPage} aria-labelledby="behaviour-workplan-heading">
    <div className={styles.coreHeader}>
      <div>
        <span className={styles.sectionLabel}>Annual Workplan · {workplan.state}</span>
        <h2 id="behaviour-workplan-heading">Behaviour objectives</h2>
        <p>Select one or more approved suggestions beneath each fixed KCF Behaviour. You can add custom wording alongside them; each heading remains one assessed Behaviour.</p>
      </div>
      {editable && <button type="button" className={styles.saveButton} disabled={saving || !validation.valid} onClick={() => onSave(draftItems).catch(() => undefined)}>{saving ? 'Saving…' : localUat ? 'Save locally' : 'Save Behaviour Draft'}</button>}
    </div>

    <ContextualHelp
      purpose="All five fixed KCF Behaviours apply. Select one or more approved suggestions for each heading, with optional custom wording alongside them."
      actions={["Choose at least one controlled suggestion or enter custom wording under each Behaviour.", "Review saved wording after edits.", "Set Q1–Q4 commitments, target ratings and the five Behaviour planning weights."]}
      fields={["Library suggestions are copied into the Workplan, so later Admin edits do not alter an approved plan.", "Choose the descriptive target rating that best states the expected Behaviour.", "Employee self-rating, manager rating and agreed rating remain separate at quarter review."]}
      next="Save all five objectives at a combined Behaviour planning weight of 100%, then submit the complete Workplan for manager approval."
      scoringNote="Behaviour ratings are standalone labelled assessments. Planning weights balance the Behaviour section; they are not the ratings or an Overall Delivery score."
    />
    <PerformanceConceptGuide />

    {!editable && (legacyBehaviour ? <div className={styles.readOnlyNotice} role="status">
      <strong>{legacyBehaviour.completionSummary}</strong>
      <p>{legacyBehaviour.annualNotice}</p>
      <p>{legacyBehaviour.managerAction}</p>
    </div> : <div className={styles.readOnlyNotice}>This {workplan.state} Workplan is read-only. Approved Behaviour objectives and targets can change only through controlled reopen and reapproval.</div>)}
    {message && <div className={styles.successMessage} role="status">{message}</div>}
    {localUat && <div className={styles.uatControls}>
      <label><span>Local assessment preview quarter</span><select value={assessmentQuarter} onChange={event => setAssessmentQuarter(event.target.value as QuarterKey)}>{(['Q1', 'Q2', 'Q3', 'Q4'] as QuarterKey[]).map(quarter => <option key={quarter}>{quarter}</option>)}</select></label>
      <span>Self-assessment and RAG stay in the local preview and do not change live data.</span>
    </div>}
    <div className={styles.sectionCounter} data-state={validation.valid ? 'complete' : 'invalid'}>
      <strong>{selected.filter(item => behaviourSelectionIsComplete(item.selectedSuggestionKeys || [], item.customObjective || '')).length} / 5</strong><span>Configured Behaviours</span>
      <strong>{validation.total}%</strong><span>Behaviour item weight total</span>
    </div>
    {!validation.valid && !legacyBehaviour && <p className={styles.weightMessage} data-state="invalid">{validation.errors.join(' ')}</p>}

    <div className={styles.behaviourList}>{behaviours.map((behaviour, index) => {
      const item = draftItems.find(row => row.behaviourId === behaviour.behaviourId) || itemFromBehaviour(workplan, behaviour, undefined, index);
      const guidance = parseBehaviourGuidance(behaviour.assessmentGuidance);
       const options = behaviourLibraryAsOf
         ? getLocalBehaviourLibrarySuggestions(library, behaviour.behaviourId as BehaviourKey, behaviourLibraryAsOf)
         : getEmployeeBehaviourSuggestions(library, behaviour.behaviourId as BehaviourKey);
       const selectedKeys = item.selectedSuggestionKeys || (item.sourceObjectiveKey ? [item.sourceObjectiveKey] : []);
       const configured = behaviourSelectionIsComplete(selectedKeys, item.customObjective || '');
      const selfRating = selfRatings[behaviour.behaviourId];
      const previewTarget = ratingForQuarter(item, assessmentQuarter);
      const preview = calculateBehaviourRating(selfRating, previewTarget);
      return <article key={behaviour.behaviourId}>
        <span>{behaviour.behaviourId}</span>
        <div>
          <div className={styles.behaviourTitle}><strong>{behaviour.title}</strong><span className={configured ? styles.assignedBadge : styles.unassignedBadge}>{configured ? 'Configured' : 'Selection or wording required'}</span></div>
          <p>{behaviour.description}</p>
          <details><summary>Five observable prompts / help</summary>{guidance.complete
            ? <ol className={styles.behaviourPrompts}>{guidance.prompts.map(prompt => <li key={prompt}>{prompt}</li>)}</ol>
            : <p className={styles.tbcNotice}>The controlled Behaviour guidance is incomplete. No prompts have been invented.</p>}</details>

          <div className={styles.personalForm}>
            {behaviourLibraryAsOf ? <BehaviourLibrarySelector
              behaviourKey={behaviour.behaviourId as BehaviourKey} library={library} selectedKeys={selectedKeys}
              disabled={!editable || saving} asOf={behaviourLibraryAsOf}
              copiedContent={<><p>{item.objectiveTitle}</p><p>{item.objectiveDescription}</p><p>{item.measure}</p><p>{item.unit}</p><p>{item.evidenceDefinition}</p></>}
              onToggle={key => toggleLibrary(behaviour, item, key)} />
              : <fieldset className={styles.behaviourObjectiveOptions}><legend>Controlled suggestions — choose one or more</legend>{options.map(option => <label key={option.behaviourObjectiveKey}><input type="checkbox" data-behaviour-suggestion={option.behaviourObjectiveKey} disabled={!editable || saving} checked={selectedKeys.indexOf(option.behaviourObjectiveKey) >= 0} onChange={() => toggleLibrary(behaviour, item, option.behaviourObjectiveKey)} /><span><strong>{option.behaviourObjectiveKey.replace(`${behaviour.behaviourId}-`, '')}</strong>{option.objectiveTitle}</span></label>)}</fieldset>}
            <label><span>My additional or alternative wording</span><textarea rows={3} disabled={!editable || saving} value={item.customObjective || ''} onChange={event => update(behaviour.behaviourId, {
              customObjective: event.target.value,
              objectiveSource: selectedKeys.length > 0 ? 'Library' : 'Custom',
              objectiveTitle: selectedKeys.length > 0 ? item.objectiveTitle : event.target.value,
              objectiveDescription: selectedKeys.length > 0 ? item.objectiveDescription : event.target.value,
              measure: item.measure || 'Quarterly Behaviour commitment', unit: item.unit || 'Rating',
              evidenceDefinition: item.evidenceDefinition || 'Quarterly examples and agreed review evidence.'
            })} /></label>
            <label><span>Description</span><textarea rows={3} disabled={!editable || saving} value={item.objectiveDescription || ''} onChange={event => update(behaviour.behaviourId, { objectiveDescription: event.target.value })} /></label>
            <label><span>Measure</span><textarea rows={3} disabled={!editable || saving} value={item.measure || ''} onChange={event => update(behaviour.behaviourId, { measure: event.target.value })} /></label>
            <label><span>Unit</span><input type="text" disabled={!editable || saving} value={item.unit || ''} onChange={event => update(behaviour.behaviourId, { unit: event.target.value })} /></label>
            <label><span>Evidence definition</span><textarea rows={3} disabled={!editable || saving} value={item.evidenceDefinition || ''} onChange={event => update(behaviour.behaviourId, { evidenceDefinition: event.target.value })} /></label>
            {(['Q1', 'Q2', 'Q3', 'Q4'] as const).map(quarter => {
              const field = `${quarter.toLowerCase()}TargetText` as 'q1TargetText' | 'q2TargetText' | 'q3TargetText' | 'q4TargetText';
              return <React.Fragment key={quarter}>
                <label><span>{quarter} measurable commitment</span><textarea rows={2} disabled={!editable || saving} value={item[field] || ''} onChange={event => update(behaviour.behaviourId, { [field]: event.target.value })} /></label>
                <label><span>{quarter} rating target</span><select disabled={!editable || saving} value={ratingForQuarter(item, quarter) || ''} onChange={event => update(behaviour.behaviourId, ratingPatch(quarter, event.target.value ? Number(event.target.value) as BehaviourRating : undefined))}><option value="">Choose a target rating…</option>{BEHAVIOUR_RATING_SCALE.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
              </React.Fragment>;
            })}
            <label><span>Behaviour section planning weight %</span><input type="number" min="0" max="100" disabled={!editable || saving} value={item.behaviourItemWeight ?? ''} onChange={event => update(behaviour.behaviourId, { behaviourItemWeight: event.target.value === '' ? undefined : Number(event.target.value) })} /></label>
            {localUat && <label><span>Local employee self-assessment</span><select value={selfRating || ''} onChange={event => setSelfRatings(current => ({ ...current, [behaviour.behaviourId]: event.target.value ? Number(event.target.value) as BehaviourRating : undefined }))}><option value="">Not rated</option>{BEHAVIOUR_RATING_SCALE.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
          </div>
          {localUat && <dl className={styles.currentKpiResult}>
            <div><dt>Employee rating</dt><dd>{getBehaviourRatingLabel(selfRating) || 'Not rated'}</dd></div>
            <div><dt>{assessmentQuarter} target rating</dt><dd>{getBehaviourRatingLabel(previewTarget) || 'Not configured'}</dd></div>
            <div><dt>Behaviour RAG</dt><dd>{preview.rag}</dd></div>
          </dl>}
          <small>{selectedKeys.length ? `Controlled selections: ${selectedKeys.join(', ')}` : 'No controlled suggestion selected'}{item.customObjective?.trim() ? ' · Custom wording included' : ''} · Published Behaviour {behaviour.behaviourVersionKey}</small>
        </div>
      </article>;
    })}</div>
  </section>;
};

export default BehaviourWorkplanPage;
