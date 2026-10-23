import * as React from 'react';
import type { IAdminReportingControlSnapshot } from '../services/AdminReportingControlDataService';
import { calculateStrategicCoreCoverageFeed, type IStrategicCoreCoverageFilter } from '../services/StrategicCoreCoverageFeed';
import { buildStrategicCoreCoverageBusinessUatSource } from '../services/StrategicCoreCoverageBusinessUat';
import StrategicCoreCoveragePage from './StrategicCoreCoveragePage';
import { buildStrategicCoreCoverageFilterOptions } from './StrategicCoreCoverageUatHarness';

export interface IStrategicCoreCoverageBusinessUatHarnessProps {
  productionIdentity: string;
  snapshot: IAdminReportingControlSnapshot;
}

const StrategicCoreCoverageBusinessUatHarness: React.FC<IStrategicCoreCoverageBusinessUatHarnessProps> = ({
  productionIdentity,
  snapshot
}) => {
  const result = React.useMemo(() => {
    try {
      return { business: buildStrategicCoreCoverageBusinessUatSource(snapshot), error: undefined };
    } catch {
      return { business: undefined, error: 'The current KCF reference data did not reconcile to the accepted 109-KPI source.' };
    }
  }, [snapshot]);
  const [filter, setFilter] = React.useState<IStrategicCoreCoverageFilter>({ performanceYear: snapshot.performanceYear });
  const feed = React.useMemo(() => result.business
    ? calculateStrategicCoreCoverageFeed(result.business.source, filter) : undefined, [filter, result.business]);
  const options = React.useMemo(() => result.business
    ? buildStrategicCoreCoverageFilterOptions(result.business.source, filter)
    : { performanceYears: [snapshot.performanceYear], pillars: [], workstreams: [], teams: [], managers: [], kpis: [], memberships: [] },
  [filter, result.business, snapshot.performanceYear]);

  return <StrategicCoreCoveragePage
    productionIdentity={productionIdentity}
    feed={feed}
    filter={filter}
    filterOptions={options}
    localUat={false}
    businessUat
    message={result.error}
    onFilterChange={setFilter}
  />;
};

export default StrategicCoreCoverageBusinessUatHarness;
