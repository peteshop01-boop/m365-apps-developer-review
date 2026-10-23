import * as React from 'react';
import type {
  IBehaviourHeadline,
  ICoreReportingFeed,
  ICoreReportingRow,
  IGovernedBehaviourCatalogueReference,
  IGovernedDeliveryResultContract,
  IGovernedReportingReference,
  IImpactReportingRow,
  IReportingCompleteness,
  IReportingProvenance,
  IReportingScope,
  IReportingViewState,
  IReportingViewsDataset,
  IReportingGovernanceConfiguration,
  ReportingSubmissionState,
  ReportingView
} from '../models/ReportingModels';
import {
  defaultReportingViewState,
  getCoreReportingFeed,
  getNextReportingView,
  reportingSubmissionStates,
  reportingViews,
  selectBehaviourFilterScopes,
  selectBehaviourHeadlines,
  selectBehaviourPersonOptions,
  selectCoreReportingRows,
  selectImpactReportingRows,
  validateReportingDataset
} from '../services/ReportingViewModels';
import { buildCapturedQuarterDeliveryView } from '../services/ReportingViewModels';
import type { IQuarterPerformanceReadSource } from '../services/QuarterPerformanceReadProjection';
import styles from './PerformanceHub.module.scss';

const viewLabels: Record<ReportingView, string> = {
  executive: 'Executive',
  pillar: 'Pillar',
  portfolio: 'Portfolio',
  kpiDetail: 'KPI detail',
  impact: 'Impact',
  behaviour: 'Behaviours'
};

const stateLabels: Record<ReportingSubmissionState, string> = {
  Reportable: 'Approved and reportable',
  NotSubmitted: 'Not submitted',
  AwaitingApproval: 'Awaiting approval',
  NotRated: 'Not rated',
  MissingData: 'Missing data'
};

const formatTimestamp = (value?: string): string => {
  if (!value) return 'Not available';
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? 'Invalid timestamp' : parsed.toLocaleString('en-GB', { timeZone: 'Europe/London' });
};

const GovernedReference: React.FC<{ label: string; value?: IGovernedReportingReference }> = ({ label, value }) => (
  <div className={styles.reportingReference}>
    <dt>{label}</dt>
    <dd>{value ? <><strong>{value.title}</strong><small>{value.id} · {value.versionKey} · {value.lifecycleState}</small></> : <span>Not assigned</span>}</dd>
  </div>
);

const CompletenessPanel: React.FC<{ completeness: IReportingCompleteness }> = ({ completeness }) => (
  <section className={styles.reportingCompleteness} aria-label="Completeness and freshness">
    <article><strong>{completeness.expected}</strong><span>Expected</span></article>
    <article><strong>{completeness.reportable}</strong><span>Reportable</span></article>
    <article><strong>{completeness.notSubmitted}</strong><span>Not submitted</span></article>
    <article><strong>{completeness.awaitingApproval}</strong><span>Awaiting approval</span></article>
    <article><strong>{completeness.notRated}</strong><span>Not rated</span></article>
    <article><strong>{completeness.missingData}</strong><span>Missing data</span></article>
    <p><strong>Freshness:</strong> {completeness.freshnessLabel}</p>
  </section>
);

const ProvenancePanel: React.FC<{ provenance: IReportingProvenance }> = ({ provenance }) => (
  <details className={styles.reportingProvenance}>
    <summary>Data provenance</summary>
    <dl>
      <div><dt>Report run</dt><dd>{provenance.reportRunId}</dd></div>
      <div><dt>Model version</dt><dd>{provenance.modelVersion}</dd></div>
      <div><dt>Source</dt><dd>{provenance.sourceReference}</dd></div>
      <div><dt>Cut timestamp</dt><dd>{formatTimestamp(provenance.cutTimestamp)}</dd></div>
    </dl>
  </details>
);

const StateBadge: React.FC<{ state: ReportingSubmissionState }> = ({ state }) => (
  <span className={styles.reportingState} data-state={state}>{stateLabels[state]}</span>
);

export const CapturedQuarterDeliverySummary: React.FC<{ source?: IQuarterPerformanceReadSource }> = ({ source }) => {
  const view = buildCapturedQuarterDeliveryView(source);
  if (view.state === 'Unavailable') return <section className={styles.deliverySummary} aria-label="Overall Delivery summary">
    <h3>Core, Impact and Overall Delivery</h3><p role="status">{view.message}</p>
    <p>Behaviours remain separate and are excluded from Delivery arithmetic.</p>
  </section>;
  const result = view.result;
  return <section className={styles.deliverySummary} aria-label="Overall Delivery summary">
    <h3>Core, Impact and Overall Delivery</h3>
    <dl className={styles.deliveryContractFacts}>
      <div><dt>Reporting period</dt><dd>{view.sourceIdentity.performanceYear} · {view.sourceIdentity.quarter}</dd></div>
      <div><dt>Review source</dt><dd>{view.sourceIdentity.quarterReviewKey}</dd></div>
      <div><dt>Review version</dt><dd>{view.sourceIdentity.rowVersionToken}</dd></div>
      <div><dt>Review status</dt><dd>{view.sourceIdentity.state} · {view.sourceIdentity.accessState === 'ReadOnly' ? 'Read only' : view.sourceIdentity.accessState}</dd></div>
      <div><dt>Approval recorded</dt><dd>{formatTimestamp(view.sourceIdentity.approvedAt)}</dd></div>
      <div><dt>Lock recorded</dt><dd>{formatTimestamp(view.sourceIdentity.lockedAt)}</dd></div>
    </dl>
    <div className={styles.deliverySummaryGrid}>
      <article data-delivery-domain="core">
        <span>Core</span><strong>{result.core!.score}</strong><small>{result.weights.coreWeight}% configured weight</small>
        <small>Classification: <span className={styles.reportingRag} data-rag={result.core!.authoritativeRag}>{result.core!.authoritativeRag}</span></small>
        <small>Weighted contribution: {result.core!.weightedContribution}</small>
        <small>Included result sources: {result.core!.sourceResultKeys.length}</small>
      </article>
      <article data-delivery-domain="impact">
        <span>Impact</span><strong>{result.impact!.score}</strong><small>{result.weights.impactWeight}% configured weight</small>
        <small>Classification: <span className={styles.reportingRag} data-rag={result.impact!.authoritativeRag}>{result.impact!.authoritativeRag}</span></small>
        <small>Weighted contribution: {result.impact!.weightedContribution}</small>
        <small>Included result sources: {result.impact!.sourceResultKeys.length}</small>
      </article>
      <article data-delivery-domain="overall"><span>Overall Delivery</span><strong>{result.overallScore}</strong><small>Score only; no Overall Delivery band</small></article>
    </div>
    <p>{result.coreProtectionApplied ? 'Poor Core protection applies. Impact cannot mask poor Core into an Exceptional outcome.'
      : 'Core protection is evaluated from the authoritative Core RAG.'}</p>
    <p>Captured weights: {result.weights.configurationKey} · {result.weights.configurationVersion}. Calculation: {result.calculationVersion}.</p>
    <details className={styles.reportingProvenance}>
      <summary>Calculation provenance</summary>
      <dl>
        <div><dt>Projection identity</dt><dd data-projection-identity>{result.projectionIdentity}</dd></div>
        <div><dt>Overall calculation</dt><dd>{result.calculationVersion}</dd></div>
      </dl>
      {([['core', 'Core', result.core!], ['impact', 'Impact', result.impact!]] as const).map(([domain, label, stream]) => (
        <section key={domain} data-provenance-domain={domain}>
          <h4>{label} result sources</h4>
          <ul>{stream.sourceResultKeys.map(key => <li key={key}>{key}</li>)}</ul>
          <dl>
            <div><dt>Score calculation</dt><dd>{stream.scoreCalculationVersion}</dd></div>
            <div><dt>Aggregation calculation</dt><dd>{stream.aggregationCalculationVersion}</dd></div>
          </dl>
        </section>
      ))}
    </details>
    <p>Behaviours remain separate and are excluded from Delivery arithmetic.</p>
  </section>;
};

const DeliverySummaryPanel: React.FC<{ delivery: IGovernedDeliveryResultContract }> = ({ delivery }) => (
  <section className={styles.deliverySummary} aria-labelledby="overall-delivery-heading">
    <header><div><span className={styles.sectionLabel}>Governed result contract</span><h4 id="overall-delivery-heading">Overall Delivery summary</h4></div><span className={styles.reportingState} data-state={delivery.overall.state}>{delivery.overall.state}</span></header>
    <div className={styles.deliverySummaryGrid}>
      <article data-delivery-domain="core"><span>Core</span><strong>{delivery.core.resultDisplay}</strong><small>{delivery.core.configuredWeightPercent}% configured weight · {delivery.core.weightedContributionDisplay}</small></article>
      <article data-delivery-domain="impact"><span>Impact</span><strong>{delivery.impact.resultDisplay}</strong><small>{delivery.impact.configuredWeightPercent}% configured weight · {delivery.impact.weightedContributionDisplay}</small></article>
      <article data-delivery-domain="overall"><span>Overall Delivery</span><strong>{delivery.overall.resultDisplay}</strong><small>Score only; no Overall Delivery band</small></article>
    </div>
    <div className={styles.deliveryGuard} data-guard-disposition={delivery.poorCoreMaskingGuard.disposition}>
      <div><span className={styles.sectionLabel}>Poor-Core masking guard</span><strong>{delivery.poorCoreMaskingGuard.disposition}</strong></div>
      <p>{delivery.poorCoreMaskingGuard.display}</p>
      <small>Policy: {delivery.poorCoreMaskingGuard.policyReference}</small>
    </div>
    <dl className={styles.deliveryContractFacts}>
      <div><dt>Weight configuration</dt><dd>{delivery.weightingConfiguration.title} · {delivery.weightingConfiguration.versionKey}{delivery.isDefaultWeighting ? ' · default' : ' · authorised alternative'}</dd></div>
      <div><dt>Result contract</dt><dd>{delivery.contractId} · {delivery.contractVersion}</dd></div>
      <div><dt>Snapshot</dt><dd>{delivery.snapshotKey}</dd></div>
    </dl>
    <p className={styles.reportingBoundaryNotice}>Behaviours are displayed separately and are excluded from Overall Delivery arithmetic.</p>
  </section>
);

const ImpactGovernancePanel: React.FC<{ governance: IReportingGovernanceConfiguration }> = ({ governance }) => (
  <aside className={styles.reportingGovernanceNotice} aria-label="Impact taxonomy governance">
    <strong>{governance.businessContributionAreas.defaultReferences.length} governed Business Contribution Areas</strong>
    <span>{governance.configurationReference.title} · {governance.configurationReference.versionKey}</span>
    <small>Labels and historic versions are supplied by governed configuration. Strategic Pillar remains optional.</small>
  </aside>
);

const BehaviourCataloguePanel: React.FC<{ catalogue: IGovernedBehaviourCatalogueReference }> = ({ catalogue }) => (
  <aside className={styles.reportingGovernanceNotice} aria-label="Behaviour catalogue governance">
    <strong>{catalogue.headlineReferences.length} governed headline Behaviours · {catalogue.detailedTargetCount} detailed target references</strong>
    <span>{catalogue.catalogueId} · {catalogue.versionKey}</span>
    <small>Approved content SHA-256: {catalogue.contentSha256}. Detailed target wording remains governed reference data and is not embedded in reporting arithmetic.</small>
  </aside>
);

interface IReportingFilterOptions {
  people: Array<string | { value: string; label: string }>;
  teams: string[];
  managers: string[];
  periods: string[];
  contributionAreas: Array<{ id: string; title: string }>;
}

const uniqueValues = (values: Array<string | undefined>): string[] =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort();

const buildFilterOptions = (scopes: Array<IReportingScope | undefined>, contributionAreas: Array<{ id: string; title: string }> = []): IReportingFilterOptions => ({
  people: uniqueValues(scopes.map(scope => scope?.person)),
  teams: uniqueValues(scopes.map(scope => scope?.team)),
  managers: uniqueValues(scopes.map(scope => scope?.manager)),
  periods: uniqueValues(scopes.map(scope => scope?.period)),
  contributionAreas: contributionAreas.filter((value, index, all) => all.findIndex(candidate => candidate.id === value.id) === index).sort((left, right) => left.title < right.title ? -1 : left.title > right.title ? 1 : 0)
});

export const reconcileBehaviourPeriodFilters = (dataset: IReportingViewsDataset, state: IReportingViewState, period: string): IReportingViewState => {
  const nextPeriod = { ...state, period };
  const scopes = selectBehaviourFilterScopes(dataset, nextPeriod);
  const options = buildFilterOptions(scopes);
  const people = selectBehaviourPersonOptions(dataset, nextPeriod);
  return {
    ...nextPeriod,
    person: people.some(option => option.value === state.person) ? state.person : '',
    team: options.teams.includes(state.team) ? state.team : '',
    manager: options.managers.includes(state.manager) ? state.manager : ''
  };
};

const ScopeSelect: React.FC<{ label: string; value: string; options: Array<string | { value: string; label: string }>; onChange: (value: string) => void }> = ({ label, value, options, onChange }) => (
  <label><span>{label}</span><select value={value} onChange={event => onChange(event.target.value)}><option value="">All</option>{options.map(option => typeof option === 'string'
    ? <option value={option} key={option}>{option}</option>
    : <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
);

const Filters: React.FC<{ state: IReportingViewState; options: IReportingFilterOptions; onChange: (state: IReportingViewState) => void }> = ({ state, options, onChange }) => (
  <div className={styles.reportingFilters} aria-label="Reporting filters and sort">
    <label className={styles.reportingSearchFilter}><span>Search this view</span><input type="search" value={state.search} onChange={event => onChange({ ...state, search: event.target.value })} /></label>
    <label><span>Submission state</span><select value={state.submissionState} onChange={event => onChange({ ...state, submissionState: event.target.value as IReportingViewState['submissionState'] })}>
      <option value="All">All states</option>
      {reportingSubmissionStates.map(status => <option key={status} value={status}>{stateLabels[status]}</option>)}
    </select></label>
    <label><span>Sort</span><select value={state.sort} onChange={event => onChange({ ...state, sort: event.target.value as IReportingViewState['sort'] })}>
      <option value="StableKey">Stable reference</option>
      <option value="Title">Title</option>
      <option value="Owner">Owner</option>
      <option value="SubmissionState">Submission state</option>
    </select></label>
    <ScopeSelect label="Person" value={state.person} options={options.people} onChange={person => onChange({ ...state, person })} />
    <ScopeSelect label="Team" value={state.team} options={options.teams} onChange={team => onChange({ ...state, team })} />
    <ScopeSelect label="Manager" value={state.manager} options={options.managers} onChange={manager => onChange({ ...state, manager })} />
    <ScopeSelect label="Period" value={state.period} options={options.periods} onChange={period => onChange({ ...state, period })} />
    {options.contributionAreas.length > 0 && <label><span>Contribution area</span><select value={state.contributionAreaId} onChange={event => onChange({ ...state, contributionAreaId: event.target.value })}><option value="">All</option>{options.contributionAreas.map(option => <option value={option.id} key={option.id}>{option.title}</option>)}</select></label>}
  </div>
);

const EmptyResult: React.FC = () => <div className={styles.emptyState} role="status">No rows match the governed filters. No status has been inferred.</div>;

const CoreRow: React.FC<{ row: ICoreReportingRow; detail: boolean }> = ({ row, detail }) => (
  <article className={styles.reportingRow} data-reporting-domain="core">
    <header>
      <div><span>{row.kpiId || row.rowKey}</span><h3>{row.title}</h3>{row.subtitle && <p>{row.subtitle}</p>}</div>
      <div className={styles.reportingBadges}><StateBadge state={row.submissionState} /><span className={styles.reportingRag} data-rag={row.rag}>{row.rag}</span></div>
    </header>
    <dl className={styles.reportingFacts}>
      <div><dt>Owner</dt><dd>{row.owner}</dd></div>
      <div><dt>Result</dt><dd>{row.resultDisplay}</dd></div>
      {detail && <div><dt>Target</dt><dd>{row.targetDisplay || 'Not supplied'}</dd></div>}
      <div><dt>Latest approved</dt><dd>{formatTimestamp(row.latestApprovedAt)}</dd></div>
      <div><dt>Provenance ref</dt><dd>{row.provenanceRef}</dd></div>
    </dl>
    {row.submissionState !== 'Reportable' && <p className={styles.reportingBoundaryNotice}>No approved result is presented for this row. Its non-reportable state remains visible.</p>}
    {detail && <dl className={styles.reportingReferences}>
      <GovernedReference label="Portfolio" value={row.portfolio} />
      <GovernedReference label="Strategic Outcome" value={row.strategicOutcome} />
      <GovernedReference label="Classification" value={row.classification} />
    </dl>}
  </article>
);

const CoreFeed: React.FC<{ feed: ICoreReportingFeed; view: Exclude<ReportingView, 'impact' | 'behaviour'>; filterState: IReportingViewState }> = ({ feed, view, filterState }) => {
  const rows = selectCoreReportingRows(feed, filterState);
  return <>
    <CompletenessPanel completeness={feed.completeness} />
    <div className={styles.reportingRows}>{rows.length ? rows.map(row => <CoreRow key={row.rowKey} row={row} detail={view === 'kpiDetail'} />) : <EmptyResult />}</div>
    <ProvenancePanel provenance={feed.provenance} />
  </>;
};

const ImpactRow: React.FC<{ row: IImpactReportingRow }> = ({ row }) => (
  <article className={styles.reportingRow} data-reporting-domain="impact">
    <header><div><span>{row.impactKey}</span><h3>{row.title}</h3></div><StateBadge state={row.submissionState} /></header>
    <dl className={styles.reportingFacts}>
      <div><dt>Owner</dt><dd>{row.owner}</dd></div>
      <div><dt>Progress</dt><dd>{row.progressDisplay}</dd></div>
      <div><dt>Result</dt><dd>{row.resultDisplay}</dd></div>
      <div><dt>Contribution</dt><dd>{row.contributionDisplay}</dd></div>
      <div><dt>Latest approved</dt><dd>{formatTimestamp(row.latestApprovedAt)}</dd></div>
      <div><dt>Provenance ref</dt><dd>{row.provenanceRef}</dd></div>
    </dl>
    {row.submissionState !== 'Reportable' && <p className={styles.reportingBoundaryNotice}>No approved Impact result is presented for this row. Its non-reportable state remains visible.</p>}
    <dl className={styles.reportingReferences}>
      <GovernedReference label="Business Contribution Area" value={row.businessContributionArea} />
      <GovernedReference label="Optional Pillar" value={row.pillar} />
      <GovernedReference label="Strategic Outcome" value={row.strategicOutcome} />
    </dl>
  </article>
);

const BehaviourHeadline: React.FC<{ headline: IBehaviourHeadline }> = ({ headline }) => (
  <article className={styles.behaviourHeadline} data-reporting-domain="behaviour">
    <header><div><span>{headline.behaviourKey}</span><h3>{headline.title}</h3></div><StateBadge state={headline.submissionState} /></header>
    <div className={styles.behaviourDistribution} aria-label={`${headline.title} classification distribution`}>
      {headline.distributions.map(item => <div key={item.classification}><strong>{item.display}</strong><span>{item.classification}</span>{item.movementPercentagePoints !== undefined && <small data-movement-indicator="true">{item.movementPercentagePoints >= 0 ? '+' : ''}{item.movementPercentagePoints.toFixed(1)} pp</small>}</div>)}
    </div>
    <dl className={styles.reportingFacts}>
      <div><dt>Movement</dt><dd>{headline.movementDisplay}</dd></div>
      <div><dt>Provenance ref</dt><dd>{headline.provenanceRef}</dd></div>
    </dl>
    <p className={styles.reportingBoundaryNotice}>Classification profile only. Behaviour is kept outside Core and Impact arithmetic.</p>
  </article>
);

export interface IReportingViewsPageProps {
  dataset?: IReportingViewsDataset;
  initialView?: ReportingView;
}

const ReportingViewsPage: React.FC<IReportingViewsPageProps> = ({ dataset, initialView = 'executive' }) => {
  const [activeView, setActiveView] = React.useState<ReportingView>(initialView);
  const [filterState, setFilterState] = React.useState<IReportingViewState>(defaultReportingViewState);
  const issues = dataset ? validateReportingDataset(dataset) : [];

  const filterOptions = (): IReportingFilterOptions => {
    if (!dataset) return buildFilterOptions([]);
    if (activeView === 'impact') return buildFilterOptions(
      dataset.impact.rows.map(row => row.scope),
      dataset.governance
        ? dataset.governance.businessContributionAreas.defaultReferences.map(reference => ({ id: reference.id, title: reference.title }))
        : dataset.impact.rows
          .map(row => row.businessContributionArea ? { id: row.businessContributionArea.id, title: row.businessContributionArea.title } : undefined)
          .filter((value): value is { id: string; title: string } => Boolean(value))
    );
    if (activeView === 'behaviour') return { ...buildFilterOptions([
      ...selectBehaviourFilterScopes(dataset, filterState),
      ...dataset.behaviour.periods.map(period => ({ period: period.periodKey }))
    ]), people: selectBehaviourPersonOptions(dataset, filterState) };
    return buildFilterOptions(getCoreReportingFeed(dataset, activeView).rows.map(row => row.scope));
  };

  const selectView = (view: ReportingView): void => {
    setActiveView(view);
    setFilterState(defaultReportingViewState);
  };

  const updateFilters = (nextState: IReportingViewState): void => {
    setFilterState(activeView === 'behaviour' && dataset && nextState.period !== filterState.period
      ? reconcileBehaviourPeriodFilters(dataset, nextState, nextState.period)
      : nextState);
  };

  const handleTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, current: ReportingView): void => {
    const next = getNextReportingView(current, event.key);
    if (next === current) return;
    event.preventDefault();
    selectView(next);
    const tab = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-reporting-tab="${next}"]`);
    tab?.focus();
  };

  const renderActiveView = (): React.ReactNode => {
    if (!dataset) return <div className={styles.reportingUnavailable} role="status"><strong>Reporting data is not connected.</strong><p>The reporting shells are ready for a governed feed. No placeholder result, status, classification or timestamp has been invented.</p></div>;
    if (issues.length) return <div className={styles.errorMessage} role="alert"><strong>The reporting feed failed closed.</strong><ul>{issues.map(issue => <li key={issue}>{issue}</li>)}</ul></div>;
    if (activeView === 'impact') {
      const rows = selectImpactReportingRows(dataset, filterState);
      return <>{dataset.governance && <ImpactGovernancePanel governance={dataset.governance} />}<CompletenessPanel completeness={dataset.impact.completeness} /><div className={styles.reportingRows}>{rows.length ? rows.map(row => <ImpactRow key={row.impactKey} row={row} />) : <EmptyResult />}</div><ProvenancePanel provenance={dataset.impact.provenance} /></>;
    }
    if (activeView === 'behaviour') {
      const headlines = selectBehaviourHeadlines(dataset, filterState);
      return <>{dataset.governance && <BehaviourCataloguePanel catalogue={dataset.governance.behaviourCatalogue} />}<CompletenessPanel completeness={dataset.behaviour.completeness} /><div className={styles.reportingRows}>{headlines.length ? headlines.map(headline => <BehaviourHeadline key={headline.behaviourKey} headline={headline} />) : <EmptyResult />}</div><ProvenancePanel provenance={dataset.behaviour.provenance} /></>;
    }
    return <>{activeView === 'executive' && dataset.deliverySummary && <DeliverySummaryPanel delivery={dataset.deliverySummary} />}<CoreFeed feed={getCoreReportingFeed(dataset, activeView)} view={activeView} filterState={filterState} /></>;
  };

  return (
    <section className={styles.reportingPage} aria-labelledby="reporting-heading">
      <header className={styles.reportingHeader}>
        <div><span className={styles.sectionLabel}>Decision-neutral reporting</span><h2 id="reporting-heading">Performance reporting views</h2><p>Approved inputs are displayed with explicit state, freshness and provenance. Core, Impact and Behaviour remain separate.</p></div>
        <span className={styles.readOnlyNotice}>Read only{dataset && issues.length === 0 ? ` · ${dataset.performanceYear}` : ''}</span>
      </header>

      <div className={styles.reportingTabs} role="tablist" aria-label="Reporting view">
        {reportingViews.map(view => <button
          key={view}
          id={`reporting-tab-${view}`}
          type="button"
          role="tab"
          data-reporting-tab={view}
          aria-selected={activeView === view}
          aria-controls={`reporting-panel-${view}`}
          tabIndex={activeView === view ? 0 : -1}
          onClick={() => selectView(view)}
          onKeyDown={event => handleTabKey(event, view)}
        >{viewLabels[view]}</button>)}
      </div>

      <section id={`reporting-panel-${activeView}`} role="tabpanel" aria-labelledby={`reporting-tab-${activeView}`} tabIndex={0} className={styles.reportingPanel}>
        <div className={styles.reportingPanelHeading}><div><span className={styles.sectionLabel}>{activeView === 'impact' ? 'Separate Impact reporting' : activeView === 'behaviour' ? 'Separate Behaviour profile' : 'Core reporting'}</span><h3>{!dataset || issues.length ? viewLabels[activeView] : activeView === 'impact' ? dataset.impact.title : activeView === 'behaviour' ? dataset.behaviour.title : getCoreReportingFeed(dataset, activeView).title}</h3></div></div>
        {dataset && issues.length === 0 && <Filters state={filterState} options={filterOptions()} onChange={updateFilters} />}
        {renderActiveView()}
      </section>
    </section>
  );
};

export default ReportingViewsPage;
