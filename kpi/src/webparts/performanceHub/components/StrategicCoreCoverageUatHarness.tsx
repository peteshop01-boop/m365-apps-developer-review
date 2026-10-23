import * as React from 'react';
import {
  buildStrategicCoreCoverageUatSource,
  calculateStrategicCoreCoverageFeed,
  reconcileStrategicCoreCoverageUat,
  type IStrategicCoreCoverageFilter,
  type IStrategicCoreCoverageSource
} from '../services/StrategicCoreCoverageFeed';
import StrategicCoreCoveragePage, {
  type IStrategicCoreCoverageFilterOptions,
  type StrategicCoreCoverageUatScenario
} from './StrategicCoreCoveragePage';

export const STRATEGIC_CORE_COVERAGE_UAT_ACTOR = 'synthetic.coverage.admin@example.invalid';
export const STRATEGIC_CORE_COVERAGE_R1_MARKER = 'KCF-KPI-025-R1-BOUNDED-QA-4329';

const unique = (values: readonly string[]): string[] => values
  .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index)
  .sort((left, right) => left.localeCompare(right));

export const buildStrategicCoreCoverageFilterOptions = (
  source: IStrategicCoreCoverageSource,
  filter: IStrategicCoreCoverageFilter
): IStrategicCoreCoverageFilterOptions => ({
  performanceYears: source.kpis.map(row => row.performanceYear)
    .filter((value, index, all) => all.indexOf(value) === index).sort((left, right) => right - left),
  pillars: unique(source.kpis.map(row => row.pillar)),
  workstreams: unique(source.kpis.filter(row => !filter.pillar || row.pillar === filter.pillar).map(row => row.workstream)),
  teams: unique(source.contributions.map(row => row.teamKey)).map(key => ({
    key,
    label: source.contributions.filter(row => row.teamKey === key)[0]?.teamDisplayName || key
  })),
  managers: unique(source.contributions.map(row => row.managerKey)).map(key => ({
    key,
    label: source.contributions.filter(row => row.managerKey === key)[0]?.managerDisplayName || key
  })),
  kpis: source.kpis.map(row => ({ key: row.kpiId, label: `${row.kpiId} — ${row.wording}` }))
    .sort((left, right) => left.key.localeCompare(right.key)),
  memberships: source.membershipDefinitions.map(definition => ({
    key: definition.code,
    enabled: definition.lifecycle === 'Current' && definition.configured && definition.approvalStatus === 'Approved'
      && definition.effectiveFrom <= source.asOfDate && definition.effectiveTo >= source.asOfDate,
    label: definition.code === 'EDI_CWOP'
      ? 'Future EDI CWOP — configuration required'
      : definition.code.replace(/_/g, ' ')
  }))
});

export interface IStrategicCoreCoverageUatHarnessProps {
  productionIdentity: string;
}

export const reconcileFullStrategicCoreCoverageUatSource = (
  source: IStrategicCoreCoverageSource
): string[] => reconcileStrategicCoreCoverageUat(calculateStrategicCoreCoverageFeed(source, {
  performanceYear: source.performanceYear
}));

export const buildDuplicateContributionCoverageUatSource = (
  baseline: IStrategicCoreCoverageSource = buildStrategicCoreCoverageUatSource()
): IStrategicCoreCoverageSource => ({
  ...baseline,
  contributions: [...baseline.contributions, { ...baseline.contributions[0] }]
});

const StrategicCoreCoverageUatHarness: React.FC<IStrategicCoreCoverageUatHarnessProps> = ({ productionIdentity }) => {
  const [source] = React.useState<IStrategicCoreCoverageSource>(() => buildStrategicCoreCoverageUatSource());
  const [scenario, setScenario] = React.useState<StrategicCoreCoverageUatScenario>('baseline');
  const [filter, setFilter] = React.useState<IStrategicCoreCoverageFilter>({ performanceYear: source.performanceYear });
  const scenarioSource = React.useMemo(() => scenario === 'duplicate'
    ? buildDuplicateContributionCoverageUatSource(source) : source, [scenario, source]);
  const feed = React.useMemo(() => calculateStrategicCoreCoverageFeed(scenarioSource, filter), [scenarioSource, filter]);
  // Reconcile the immutable full fixture. View filters must never alter the signed
  // RPT-005 scenario proof shown by the UAT banner.
  const reconciliationFailures = React.useMemo(() => reconcileFullStrategicCoreCoverageUatSource(source), [source]);
  const options = React.useMemo(() => buildStrategicCoreCoverageFilterOptions(scenarioSource, filter), [scenarioSource, filter]);
  const changeScenario = (next: StrategicCoreCoverageUatScenario): void => {
    setScenario(next);
    setFilter({
      performanceYear: source.performanceYear,
      reportingMembership: next === 'futureEdi' ? 'EDI_CWOP' : undefined
    });
  };
  const scenarioMessage = scenario === 'duplicate'
    ? 'DEF-022 fixture · exact duplicate ContributionKey COV-001 · both rows excluded · KPI coverage NOT READY'
    : scenario === 'futureEdi'
      ? 'DEF-024 fixture · EDI_CWOP is FUTURE · UNCONFIGURED · CONFIGURATION REQUIRED · zero current mappings'
      : reconciliationFailures.length
        ? `Synthetic RPT-005 reconciliation failed: ${reconciliationFailures.join('; ')}`
        : `${STRATEGIC_CORE_COVERAGE_R1_MARKER} · Synthetic RPT-005 reconciliation PASS · 200 schools = 70 approved + 20 pending · 35% coverage · 130 gap`;

  return <StrategicCoreCoveragePage
    productionIdentity={`Display-only production identity: ${productionIdentity} · Synthetic actor: ${STRATEGIC_CORE_COVERAGE_UAT_ACTOR}`}
    feed={feed}
    filter={filter}
    filterOptions={options}
    localUat
    message={scenarioMessage}
    onFilterChange={setFilter}
    uatScenario={scenario}
    onUatScenarioChange={changeScenario}
  />;
};

export default StrategicCoreCoverageUatHarness;
