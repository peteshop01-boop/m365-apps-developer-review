/* eslint-disable @rushstack/no-new-null -- the accepted Reporting feed distinguishes unavailable numeric values with null. */
import * as React from 'react';
import type {
  CoverageState,
  IStrategicCoreCoverageDetailRow,
  IStrategicCoreCoverageFeed,
  IStrategicCoreCoverageFilter,
  ReportingMembership
} from '../services/StrategicCoreCoverageFeed';
import styles from './StrategicCoreCoveragePage.module.scss';

export type StrategicCoreCoverageView = 'summary' | 'under' | 'over' | 'unresolved' | 'unitMismatch' | 'pending';
export type StrategicCoreCoverageUatScenario = 'baseline' | 'duplicate' | 'futureEdi';

export interface IStrategicCoreCoverageFilterOptions {
  performanceYears: number[];
  pillars: string[];
  workstreams: string[];
  teams: Array<{ key: string; label: string }>;
  managers: Array<{ key: string; label: string }>;
  kpis: Array<{ key: string; label: string }>;
  memberships: Array<{ key: ReportingMembership; label: string; enabled: boolean }>;
}

export interface IStrategicCoreCoveragePageProps {
  productionIdentity: string;
  feed?: IStrategicCoreCoverageFeed;
  filter: IStrategicCoreCoverageFilter;
  filterOptions: IStrategicCoreCoverageFilterOptions;
  localUat: boolean;
  businessUat?: boolean;
  message?: string;
  onFilterChange?: (filter: IStrategicCoreCoverageFilter) => void;
  uatScenario?: StrategicCoreCoverageUatScenario;
  onUatScenarioChange?: (scenario: StrategicCoreCoverageUatScenario) => void;
}

const stateLabel = (state: CoverageState): string => state.replace(/_/g, ' ');
const value = (number: number | null): string => number === null ? '—' : number.toLocaleString('en-GB', { maximumFractionDigits: 2 });
const percentage = (number: number | null): string => number === null ? 'Not available' : `${value(number)}%`;
const contributionMethod = (row: IStrategicCoreCoverageDetailRow): string => row.contributionMethod
  ? row.contributionMethod.replace(/([a-z])([A-Z])/g, '$1 $2') : 'Unresolved';
const exclusionLabel = (reason: string): string => ({
  DUPLICATE_CONTRIBUTION_KEY: 'Duplicate contribution key — fail closed',
  PROVENANCE_INCOMPLETE: 'Required source/provenance is incomplete',
  CONTRACT_VERSION_MISMATCH: 'RPT-005 contract version mismatch',
  CONTRIBUTION_METHOD_NOT_ADDITIVE: 'Oversight only / non-additive method',
  KPI_COVERAGE_METHOD_NOT_ADDITIVE: 'Shared Target or Weighted/Denominator KPI',
  DIRECT_CONTRIBUTION_NOT_ELIGIBLE: 'No approved direct-delivery contribution',
  UNIT_MISMATCH: 'Unit mismatch',
  WORKPLAN_NOT_APPROVED: 'Draft/Pending',
  NON_OVERLAP_NOT_APPROVED: 'Non-overlap not approved',
  CONTRIBUTION_METHOD_MISSING: 'Contribution method unresolved',
  CONTRIBUTION_TARGET_MISSING: 'Contribution target incomplete',
  SCOPE_NOT_STRATEGIC_CORE: 'Not Strategic Core',
  WRONG_PERFORMANCE_YEAR: 'Wrong performance year',
  OUTSIDE_EFFECTIVE_DATES: 'Outside effective dates',
  WORKPLAN_NOT_ACTIVE: 'Workplan not active'
}[reason] || reason.replace(/_/g, ' '));

const viewLabels: Array<{ key: StrategicCoreCoverageView; label: string }> = [
  { key: 'summary', label: 'All Strategic Core KPIs' },
  { key: 'under', label: 'Under-allocated KPIs' },
  { key: 'over', label: 'Over-allocated KPIs' },
  { key: 'unresolved', label: 'Unresolved contribution methods' },
  { key: 'unitMismatch', label: 'Unit mismatches' },
  { key: 'pending', label: 'Pending Workplan contributions' }
];

const StrategicCoreCoveragePage: React.FC<IStrategicCoreCoveragePageProps> = ({
  productionIdentity,
  feed,
  filter,
  filterOptions,
  localUat,
  businessUat = false,
  message,
  onFilterChange,
  uatScenario,
  onUatScenarioChange
}) => {
  const [activeView, setActiveView] = React.useState<StrategicCoreCoverageView>('summary');
  const [selectedKpiId, setSelectedKpiId] = React.useState<string>();

  React.useEffect(() => {
    if (selectedKpiId && feed && !feed.summary.some(row => row.kpiId === selectedKpiId)) setSelectedKpiId(undefined);
  }, [feed, selectedKpiId]);

  const patchFilter = (patch: Partial<IStrategicCoreCoverageFilter>): void => {
    if (onFilterChange) onFilterChange({ ...filter, ...patch });
  };
  const clearFilters = (): void => {
    if (onFilterChange) onFilterChange({ performanceYear: filterOptions.performanceYears[0] });
  };

  const selectedDetails = feed?.detail.filter(row => row.kpiId === selectedKpiId) || [];
  const exceptionDetails = activeView === 'unresolved' ? feed?.unresolvedContributionMethods
    : activeView === 'unitMismatch' ? feed?.unitMismatches
      : activeView === 'pending' ? feed?.pendingContributions : undefined;
  const summaryRows = activeView === 'under' ? feed?.underAllocated
    : activeView === 'over' ? feed?.overAllocated : feed?.summary;
  const counts = {
    all: feed?.summary.length || 0,
    under: feed?.underAllocated.length || 0,
    over: feed?.overAllocated.length || 0,
    unresolved: feed?.unresolvedContributionMethods.length || 0,
    mismatch: feed?.unitMismatches.length || 0,
    pending: feed?.pendingContributions.length || 0
  };

  const renderDetailRows = (rows: readonly IStrategicCoreCoverageDetailRow[]): React.ReactNode => (
    <div className={styles.detailList} data-testid="coverage-detail-list">
      {rows.length ? rows.map(row => (
        <article className={styles.detailCard} key={row.detailRecordKey}>
          <header>
            <div><strong>{row.personDisplayName}</strong><span>{row.teamDisplayName} · Manager: {row.managerDisplayName}</span></div>
            <span className={row.includedInNumericalCoverage === 'YES' ? styles.included : styles.excluded}>
              Included in numerical coverage: {row.includedInNumericalCoverage}
            </span>
          </header>
          <dl className={styles.detailGrid}>
            <div><dt>Role</dt><dd>{row.role}</dd></div>
            <div><dt>Contribution method</dt><dd>{contributionMethod(row)}</dd></div>
            <div><dt>Workplan status</dt><dd>{row.workplanStatus}</dd></div>
            <div><dt>Approval status</dt><dd>{row.managerApprovalStatus}</dd></div>
            <div><dt>Annual</dt><dd>{value(row.annualContribution)}</dd></div>
            <div><dt>Q1</dt><dd>{value(row.q1Contribution)}</dd></div>
            <div><dt>Q2</dt><dd>{value(row.q2Contribution)}</dd></div>
            <div><dt>Q3</dt><dd>{value(row.q3Contribution)}</dd></div>
            <div><dt>Q4</dt><dd>{value(row.q4Contribution)}</dd></div>
            <div><dt>Unit</dt><dd>{row.unit || 'Not applicable'}</dd></div>
            <div><dt>Workplan / version</dt><dd>{row.workplanKey} · v{row.version}</dd></div>
            <div><dt>Effective</dt><dd>{row.effectiveFrom || 'Missing'} to {row.effectiveTo || 'Missing'}</dd></div>
            <div><dt>Approval timestamp</dt><dd>{row.approvalTimestamp || 'Not supplied'}</dd></div>
            <div><dt>Source reference</dt><dd>{row.sourceReference || 'Not supplied'}</dd></div>
            <div><dt>Annual commitment</dt><dd>{row.annualCommitment || 'Not supplied'}</dd></div>
            <div><dt>Q1 commitment</dt><dd>{row.q1Commitment || 'Not supplied'}</dd></div>
            <div><dt>Q2 commitment</dt><dd>{row.q2Commitment || 'Not supplied'}</dd></div>
            <div><dt>Q3 commitment</dt><dd>{row.q3Commitment || 'Not supplied'}</dd></div>
            <div><dt>Q4 commitment</dt><dd>{row.q4Commitment || 'Not supplied'}</dd></div>
            <div><dt>What 100% looks like</dt><dd>{row.what100PercentLooksLike || 'Not supplied'}</dd></div>
            <div><dt>Employee completion</dt><dd>{row.employeeCompletionPercent === null ? 'Not supplied' : `${row.employeeCompletionPercent}%`}</dd></div>
            <div><dt>Calculated employee RAG</dt><dd>{row.calculatedEmployeeRag || 'Not supplied'}</dd></div>
            <div><dt>Employee Actual</dt><dd>{row.employeeActualValue === null ? 'Not supplied' : `${row.employeeActualValue} ${row.employeeActualUnit}`}</dd></div>
            <div><dt>Official Actual aggregation permitted</dt><dd>{row.officialActualAggregationPermitted ? 'YES' : 'NO'}</dd></div>
            <div><dt>Created audit</dt><dd>{row.auditCreatedAt || 'Missing'} · {row.auditCreatedBy || 'Missing'}</dd></div>
            <div><dt>Updated audit</dt><dd>{row.auditUpdatedAt || 'Missing'} · {row.auditUpdatedBy || 'Missing'}</dd></div>
          </dl>
          {row.exclusionReasons.length > 0 && <p className={styles.exclusionReason}>
            <strong>Exclusion reason:</strong> {row.exclusionReasons.map(exclusionLabel).join('; ')}
          </p>}
        </article>
      )) : <p className={styles.empty}>No contribution rows match this view and filter combination.</p>}
    </div>
  );

  return <section className={styles.shell} aria-label="Strategic Core Workplan coverage administration">
    <header className={styles.header}>
      <div><span>Administration · Planning coverage</span><h1>Strategic Core Workplan Coverage</h1>
        <p>System-derived from employee Workplans. This is not a central allocation-management screen.</p></div>
      <div className={styles.identity}><strong>{localUat ? 'SAFE COVERAGE UAT' : businessUat ? 'Signed in' : 'PRODUCTION READ-ONLY'}</strong><span>{productionIdentity}</span></div>
    </header>
    <div className={styles.boundary} role="note">
      {businessUat
        ? 'UAT — test changes will not affect live data.'
        : localUat
        ? 'Synthetic browser-memory Reporting feed only · NO production SharePoint data or writes · no notifications'
        : 'Read-only Reporting feed. No manual allocation fields are provided.'}
    </div>
    {message && <div className={styles.message} role="status">{message}</div>}
    {localUat && uatScenario && onUatScenarioChange && <section className={styles.uatScenarios} aria-label="Bounded QA fixture scenarios">
      <strong>Bounded QA fixture</strong>
      <span>Switches only the synthetic browser-memory feed.</span>
      <div role="group" aria-label="Coverage QA scenario">
        <button type="button" aria-pressed={uatScenario === 'baseline'} onClick={() => onUatScenarioChange('baseline')}>Baseline coverage</button>
        <button type="button" aria-pressed={uatScenario === 'duplicate'} onClick={() => onUatScenarioChange('duplicate')}>Duplicate key — fail closed</button>
        <button type="button" aria-pressed={uatScenario === 'futureEdi'} onClick={() => onUatScenarioChange('futureEdi')}>Future EDI — configuration required</button>
      </div>
    </section>}

    <main className={styles.content}>
      <section className={styles.intro}>
        <div><span>{businessUat ? 'Planning coverage' : 'RPT-005 feed contract'}</span><h2>Contribution coverage by Strategic Core KPI</h2>
          <p>Approved coverage uses only current effective, manager-approved additive contributions in the exact base unit. Draft/Pending and non-additive people remain visible separately.</p></div>
        {!businessUat && <aside><strong>{feed?.contractVersion || 'Feed unavailable'}</strong><span>Reporting source {feed?.sourceSha.substring(0, 12) || 'not loaded'}</span></aside>}
      </section>

      {!feed ? <div className={styles.unavailable} role="alert">
        <h3>Strategic Core coverage data unavailable</h3>
        <p>The versioned RPT-005 feed was not supplied. No figures are inferred and no production data is changed.</p>
      </div> : <>
        <section className={styles.stats} aria-label="Coverage summary counts">
          <article><strong>{counts.all}</strong><span>Strategic Core KPIs</span></article>
          <article><strong>{counts.under}</strong><span>Under allocated</span></article>
          <article><strong>{counts.over}</strong><span>Over allocated</span></article>
          <article><strong>{counts.pending}</strong><span>Pending contributions</span></article>
          <article><strong>{counts.unresolved}</strong><span>Unresolved methods</span></article>
          <article><strong>{counts.mismatch}</strong><span>Unit mismatches</span></article>
        </section>

        <section className={styles.filters} aria-label="Coverage filters">
          <label><span>Performance Year</span><select value={filter.performanceYear || ''} onChange={event => patchFilter({ performanceYear: Number(event.currentTarget.value) || undefined })}>
            {filterOptions.performanceYears.map(year => <option key={year} value={year}>{year - 1}/{String(year).slice(-2)}</option>)}
          </select></label>
          <label><span>Pillar</span><select value={filter.pillar || ''} onChange={event => patchFilter({ pillar: event.currentTarget.value || undefined, workstream: undefined })}>
            <option value="">All Pillars</option>{filterOptions.pillars.map(item => <option key={item}>{item}</option>)}
          </select></label>
          <label><span>Workstream</span><select value={filter.workstream || ''} onChange={event => patchFilter({ workstream: event.currentTarget.value || undefined })}>
            <option value="">All Workstreams</option>{filterOptions.workstreams.map(item => <option key={item}>{item}</option>)}
          </select></label>
          <label><span>Team</span><select value={filter.teamKey || ''} onChange={event => patchFilter({ teamKey: event.currentTarget.value || undefined })}>
            <option value="">All Teams</option>{filterOptions.teams.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select></label>
          <label><span>Manager</span><select value={filter.managerKey || ''} onChange={event => patchFilter({ managerKey: event.currentTarget.value || undefined })}>
            <option value="">All Managers</option>{filterOptions.managers.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select></label>
          <label><span>KPI</span><select value={filter.kpiId || ''} onChange={event => patchFilter({ kpiId: event.currentTarget.value || undefined })}>
            <option value="">All KPIs</option>{filterOptions.kpis.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select></label>
          <label><span>Reporting membership</span><select value={filter.reportingMembership || ''} onChange={event => patchFilter({ reportingMembership: (event.currentTarget.value || undefined) as ReportingMembership | undefined })}>
            <option value="">All current memberships</option>{filterOptions.memberships.map(item => <option key={item.key} value={item.key} disabled={!item.enabled}>{item.label}</option>)}
          </select></label>
          <button type="button" onClick={clearFilters}>Clear filters</button>
        </section>

        {feed.reportingMembershipState.state !== 'ACTIVE' && <div className={styles.unavailable} role="status">
          <h3>{feed.reportingMembershipState.state === 'FUTURE_UNCONFIGURED'
            ? 'Future EDI CWOP — configuration required' : 'Reporting membership unavailable'}</h3>
          <p>{feed.reportingMembershipState.message}</p>
        </div>}

        <nav className={styles.viewTabs} aria-label="Coverage and exception views">
          {viewLabels.map(view => <button key={view.key} type="button" className={activeView === view.key ? styles.activeView : ''} onClick={() => { setActiveView(view.key); setSelectedKpiId(undefined); }}>
            {view.label}
          </button>)}
        </nav>

        {exceptionDetails ? <section aria-label="Contribution exception detail">
          <header className={styles.sectionHeader}><h2>{viewLabels.filter(view => view.key === activeView)[0].label}</h2><span>{exceptionDetails.length} contribution rows</span></header>
          {renderDetailRows(exceptionDetails)}
        </section> : selectedKpiId ? <section aria-label="Selected KPI contribution detail">
          <button type="button" className={styles.backButton} onClick={() => setSelectedKpiId(undefined)}>← Back to KPI summary</button>
          <header className={styles.sectionHeader}><h2>{selectedKpiId} contribution detail</h2><span>{selectedDetails.length} contribution records inspected</span></header>
          {renderDetailRows(selectedDetails)}
        </section> : <section aria-label="Strategic Core coverage summary">
          <header className={styles.sectionHeader}><h2>{viewLabels.filter(view => view.key === activeView)[0].label}</h2><span>{summaryRows?.length || 0} KPI rows</span></header>
          <div className={styles.summaryList}>
            {summaryRows?.length ? summaryRows.map(row => <article className={styles.summaryCard} key={row.kpiId}>
              <button type="button" className={styles.kpiButton} onClick={() => setSelectedKpiId(row.kpiId)}>
                <span>KPI ID · {row.kpiId}</span><strong>{row.wording}</strong><small>{row.pillar} · {row.workstream}</small>
              </button>
              <dl className={styles.summaryGrid}>
                <div><dt>Organisation target</dt><dd>{row.annual.organisationTarget === null
                  ? row.organisationTargetText || 'Unavailable'
                  : `${value(row.annual.organisationTarget)} ${row.unit}`}</dd></div>
                <div><dt>Owner</dt><dd>{row.owner || 'Not assigned'}</dd></div>
                <div><dt>People attached</dt><dd>{row.peopleSelectingKpi}</dd></div>
                <div><dt>Direct contributors</dt><dd>{row.directContributors}</dd></div>
                <div><dt>Oversight</dt><dd>{row.oversightPeople}</dd></div>
                <div><dt>Accountable owners</dt><dd>{row.accountableOwners}</dd></div>
                <div><dt>Draft/Pending allocation</dt><dd>{value(row.annual.pendingContribution)} {row.unit}</dd></div>
                <div><dt>Approved allocation</dt><dd>{value(row.annual.approvedContribution)} {row.unit}</dd></div>
                <div><dt>Coverage</dt><dd>{percentage(row.annual.coveragePercent)}</dd></div>
                <div><dt>Gap / Surplus</dt><dd>{row.annual.gapOrSurplus === null ? 'Not applicable' : row.annual.gapOrSurplus >= 0 ? `${value(row.annual.gap)} gap` : `${value(row.annual.surplus)} surplus`}</dd></div>
                <div><dt>Official Actual</dt><dd>{row.officialActualValue === null ? 'Unavailable' : `${row.officialActualValue} ${row.officialActualUnit}`}</dd></div>
                <div><dt>Official Actual status</dt><dd>{row.officialActualSourceStatus}</dd></div>
                <div><dt>Official Actual source</dt><dd>{row.officialActualSourceKey || 'Unavailable'}</dd></div>
                <div><dt>Employee delivery information</dt><dd>{row.employeeDeliveryInformationAvailable ? 'Available separately' : 'Unavailable'}</dd></div>
              </dl>
              <footer><span className={styles[`state${row.annual.state}`]}>{stateLabel(row.annual.state)}</span>
                <small>{row.reportingMembership.length ? row.reportingMembership.map(item => item.replace(/_/g, ' ')).join(' · ') : 'No current reporting membership'}</small></footer>
            </article>) : <p className={styles.empty}>No KPI rows match this view and filter combination.</p>}
          </div>
        </section>}

        <aside className={styles.actualBoundary}><strong>Official Actual remains separate.</strong> {businessUat
          ? 'Employee results are not automatically treated as the official organisation result.'
          : 'Employee Actuals are not summed, `officialActualDerivedFromEmployeeActuals` is false, and this screen performs no organisation Actual write.'}</aside>
      </>}
    </main>
  </section>;
};

export default StrategicCoreCoveragePage;
