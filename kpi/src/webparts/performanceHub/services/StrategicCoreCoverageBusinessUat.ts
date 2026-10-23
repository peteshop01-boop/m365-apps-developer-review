/* eslint-disable @rushstack/no-new-null -- the accepted Reporting feed represents unavailable numeric values as null. */
import type { IAdminReportingControlSnapshot } from './AdminReportingControlDataService';
import acceptedImportJson from '../../../../data/KCFKPI_MASTER_IMPORT_R3.json';
import {
  STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION,
  type ContributionMethod,
  type ICoverageTargets,
  type IReportingMembershipDefinition,
  type IStrategicCoreCoverageKpi,
  type IStrategicCoreCoverageSource,
  type IWorkplanContributionInput,
  type ReportingMembership
} from './StrategicCoreCoverageFeed';

interface IRealKpiImportRow {
  KPIID: string; KPIWording: string; Pillar: string; Workstream: string;
  AccountableOwnerEmail?: string | null; AccountableOwnerPersonKey?: string | null;
  DefinitionStatus: string; AggregationMethod: string; UnitLabel?: string | null; IsCurrent: boolean;
}
interface IRealTargetImportRow {
  KPIID: string; PerformanceYear: number; TargetStatus: string; IsCurrent: boolean;
  YearEndTargetValue?: number | null; YearEndTargetText?: string | null;
  Q1TargetValue?: number | null; Q2TargetValue?: number | null; Q3TargetValue?: number | null; Q4TargetValue?: number | null;
}
interface IRealKpiImport {
  source: { file: string; sha256: string; authoritativeSheet: string; authoritativeTable: string };
  payloadSHA256: string;
  kpiMaster: IRealKpiImportRow[];
  annualTargets: IRealTargetImportRow[];
}

const acceptedImport = acceptedImportJson as IRealKpiImport;

export const STRATEGIC_CORE_COVERAGE_BUSINESS_SOURCE = {
  file: acceptedImport.source.file,
  sha256: acceptedImport.source.sha256,
  table: acceptedImport.source.authoritativeTable,
  payloadSha256: acceptedImport.payloadSHA256
} as const;

const clean = (value: string | null | undefined): string => (value || '').trim();
const targets = (annual: number | null, q1: number | null, q2: number | null, q3: number | null, q4: number | null): ICoverageTargets =>
  ({ annual, q1, q2, q3, q4 });
const numberOrNull = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const coverageMethod = (value: string): ContributionMethod => {
  if (value === 'AccountableOwner') return 'AccountableOwner';
  if (value === 'Milestone') return 'CompletionOversight';
  if (value === 'WeightedContribution') return 'WeightedDenominator';
  return 'SharedTarget';
};

const membershipCode = (outputCode: string): ReportingMembership | undefined => ({
  MAIN_CWOP: 'CORE_CWOP', CORE_CWOP: 'CORE_CWOP',
  CITIES_CWOP: 'LONDON_CITIES_CWOP', LONDON_CITIES_CWOP: 'LONDON_CITIES_CWOP',
  WG_CWOP: 'WOMEN_GIRLS_CWOP', WOMEN_GIRLS_CWOP: 'WOMEN_GIRLS_CWOP',
  CWSP: 'CWSP'
} as Record<string, ReportingMembership>)[outputCode.trim().toUpperCase()];

const assertExactLiveCatalogue = (snapshot: IAdminReportingControlSnapshot): void => {
  const accepted = acceptedImport.kpiMaster.filter(row => row.IsCurrent && row.DefinitionStatus === 'Active');
  if (accepted.length !== 109 || new Set(accepted.map(row => clean(row.KPIID))).size !== 109) {
    throw new Error('The accepted KPI import does not contain exactly 109 distinct current Strategic Core KPIs.');
  }
  if (snapshot.kpis.length !== 109 || new Set(snapshot.kpis.map(row => clean(row.kpiId))).size !== 109) {
    throw new Error('KCF Automation did not return exactly 109 distinct current Strategic Core KPIs.');
  }
  const liveById = new Map(snapshot.kpis.map(row => [clean(row.kpiId), row]));
  accepted.forEach(row => {
    const live = liveById.get(clean(row.KPIID));
    if (!live || clean(live.wording) !== clean(row.KPIWording) || clean(live.pillar) !== clean(row.Pillar)
      || clean(live.workstream) !== clean(row.Workstream)) {
      throw new Error(`KCF Automation KPI ${clean(row.KPIID)} does not reconcile to the accepted 109-row source.`);
    }
  });
};

const currentMemberships = (
  snapshot: IAdminReportingControlSnapshot,
  asOfDate: string
): { byKpi: Map<string, ReportingMembership[]>; definitions: IReportingMembershipDefinition[] } => {
  const publishedOutputs = new Set(snapshot.outputDefinitions.filter(output => output.active
    && output.publicationStatus === 'Published'
    && output.effectiveFrom <= asOfDate && (!output.effectiveTo || output.effectiveTo >= asOfDate))
    .map(output => clean(output.outputCode).toUpperCase()));
  const byKpi = new Map<string, ReportingMembership[]>();
  snapshot.reportingMaps.filter(map => map.active && map.approvalStatus === 'Approved'
    && map.effectiveFrom <= asOfDate && (!map.effectiveTo || map.effectiveTo >= asOfDate)
    && publishedOutputs.has(clean(map.outputCode).toUpperCase())).forEach(map => {
    const code = membershipCode(map.outputCode);
    if (!code) return;
    const values = byKpi.get(clean(map.kpiId)) || [];
    if (values.indexOf(code) < 0) values.push(code);
    byKpi.set(clean(map.kpiId), values);
  });
  const codes: ReportingMembership[] = [];
  byKpi.forEach(values => values.forEach(value => { if (codes.indexOf(value) < 0) codes.push(value); }));
  return {
    byKpi,
    definitions: codes.sort((left, right) => left.localeCompare(right)).map(code => ({
      code, lifecycle: 'Current', configured: true, approvalStatus: 'Approved',
      effectiveFrom: asOfDate, effectiveTo: asOfDate
    }))
  };
};

const officialActualFor = (snapshot: IAdminReportingControlSnapshot, kpiId: string): {
  value: number | string | null; sourceKey: string; status: 'Authoritative' | 'Unavailable';
} => {
  const order = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 } as const;
  const candidates = snapshot.officialResults.filter(row => clean(row.kpiId) === kpiId
    && row.performanceYear === snapshot.performanceYear && row.finalActual !== undefined);
  if (!candidates.length) return { value: null, sourceKey: '', status: 'Unavailable' };
  const latestQuarter = Math.max(...candidates.map(row => order[row.quarter]));
  const latest = candidates.filter(row => order[row.quarter] === latestQuarter);
  if (latest.length !== 1) return { value: null, sourceKey: '', status: 'Unavailable' };
  return { value: latest[0].finalActual as number | string, sourceKey: latest[0].kpiResultKey, status: 'Authoritative' };
};

const localContribution = (
  contributionKey: string,
  kpiId: string,
  personKey: string,
  displayName: string,
  role: IWorkplanContributionInput['role'],
  method: ContributionMethod,
  values: ICoverageTargets,
  unit: string,
  performanceYear: number,
  asOfDate: string,
  pending: boolean = false
): IWorkplanContributionInput => ({
  contributionKey, kpiId, performanceYear, itemScope: 'StrategicCore', personKey,
  personDisplayName: displayName, managerKey: 'BUSINESS-UAT-MANAGER', managerDisplayName: 'Test Manager',
  teamKey: 'BUSINESS-UAT-TEAM', teamDisplayName: 'Coverage Test Team',
  workplanKey: `BUSINESS-UAT|${personKey}|${performanceYear}`,
  workplanStatus: pending ? 'Submitted' : 'ManagerApproved', managerApprovalStatus: pending ? 'Pending' : 'Approved',
  role, contributionMethod: method, directContributionEligible: method === 'Additive',
  nonOverlapRequired: method === 'Additive', nonOverlapApproved: method === 'Additive', contributionTargets: values, unit,
  annualCommitment: '', q1Commitment: '', q2Commitment: '', q3Commitment: '', q4Commitment: '',
  what100PercentLooksLike: '', employeeCompletionPercent: null, calculatedEmployeeRag: null,
  employeeActualValue: null, employeeActualUnit: '', officialActualAggregationPermitted: false,
  effectiveFrom: asOfDate, effectiveTo: asOfDate,
  approvalTimestamp: pending ? '' : `${asOfDate}T12:00:00Z`, version: 1,
  sourceReference: `Business UAT local scenario ${contributionKey}`, auditCreatedAt: `${asOfDate}T12:00:00Z`,
  auditCreatedBy: 'person003@example.invalid', auditUpdatedAt: `${asOfDate}T12:00:00Z`,
  auditUpdatedBy: 'person003@example.invalid'
});

export interface IStrategicCoreCoverageBusinessCounts {
  kpis: number; numericTargets: number; textTargets: number; officialActuals: number; confirmedMembershipMappings: number;
}

export const buildStrategicCoreCoverageBusinessUatSource = (
  snapshot: IAdminReportingControlSnapshot
): { source: IStrategicCoreCoverageSource; counts: IStrategicCoreCoverageBusinessCounts } => {
  assertExactLiveCatalogue(snapshot);
  const asOfDate = snapshot.loadedAt.slice(0, 10);
  const targetRows = acceptedImport.annualTargets.filter(row => row.IsCurrent && row.TargetStatus === 'Approved'
    && row.PerformanceYear === snapshot.performanceYear);
  const targetById = new Map(targetRows.map(row => [clean(row.KPIID), row]));
  const memberships = currentMemberships(snapshot, asOfDate);
  const kpis: IStrategicCoreCoverageKpi[] = acceptedImport.kpiMaster
    .filter(row => row.IsCurrent && row.DefinitionStatus === 'Active')
    .map(row => {
      const kpiId = clean(row.KPIID);
      const target = targetById.get(kpiId);
      const actual = officialActualFor(snapshot, kpiId);
      return {
        kpiId, wording: clean(row.KPIWording), pillar: clean(row.Pillar), workstream: clean(row.Workstream),
        owner: clean(row.AccountableOwnerEmail) || clean(row.AccountableOwnerPersonKey) || undefined,
        performanceYear: snapshot.performanceYear, lifecycleStatus: 'Active' as const,
        coverageMethod: kpiId === 'SO1-001' ? 'Additive' as const : coverageMethod(clean(row.AggregationMethod)),
        organisationTargets: targets(numberOrNull(target?.YearEndTargetValue), numberOrNull(target?.Q1TargetValue),
          numberOrNull(target?.Q2TargetValue), numberOrNull(target?.Q3TargetValue), numberOrNull(target?.Q4TargetValue)),
        organisationTargetText: clean(target?.YearEndTargetText) || undefined,
        unit: clean(row.UnitLabel), reportingMembership: memberships.byKpi.get(kpiId) || [],
        officialActualValue: actual.value, officialActualUnit: clean(row.UnitLabel),
        officialActualSourceKey: actual.sourceKey, officialActualSourceStatus: actual.status
      };
    });
  const primary = kpis.filter(row => row.kpiId === 'SO1-001')[0];
  const contributions = primary ? [
    localContribution('UAT-SO1-001-A', primary.kpiId, 'UAT-P1', 'Test Contributor A', 'DeliveryLead', 'Additive',
      targets(40, 14, 14, 6, 6), primary.unit, snapshot.performanceYear, asOfDate),
    localContribution('UAT-SO1-001-B', primary.kpiId, 'UAT-P2', 'Test Contributor B', 'Contributor', 'Additive',
      targets(30, 10, 10, 5, 5), primary.unit, snapshot.performanceYear, asOfDate),
    localContribution('UAT-SO1-001-C', primary.kpiId, 'UAT-P3', 'Pending Test Contributor', 'Contributor', 'Additive',
      targets(20, 6, 6, 4, 4), primary.unit, snapshot.performanceYear, asOfDate, true),
    localContribution('UAT-SO1-001-D', primary.kpiId, 'UAT-P4', 'Test Accountable Owner', 'AccountableOwner',
      'AccountableOwner', targets(null, null, null, null, null), '', snapshot.performanceYear, asOfDate)
  ] : [];
  return {
    source: { contractVersion: STRATEGIC_CORE_COVERAGE_CONTRACT_VERSION, kpis, contributions,
      membershipDefinitions: memberships.definitions, performanceYear: snapshot.performanceYear, asOfDate },
    counts: {
      kpis: kpis.length,
      numericTargets: targetRows.filter(row => typeof row.YearEndTargetValue === 'number').length,
      textTargets: targetRows.filter(row => typeof row.YearEndTargetValue !== 'number' && Boolean(clean(row.YearEndTargetText))).length,
      officialActuals: snapshot.officialResults.filter(row => row.performanceYear === snapshot.performanceYear
        && row.finalActual !== undefined).length,
      confirmedMembershipMappings: Array.from(memberships.byKpi.values()).reduce((total, values) => total + values.length, 0)
    }
  };
};
