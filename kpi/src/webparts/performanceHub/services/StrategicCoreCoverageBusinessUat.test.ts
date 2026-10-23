import type { IAdminReportingControlSnapshot } from './AdminReportingControlDataService';
import { calculateStrategicCoreCoverageFeed } from './StrategicCoreCoverageFeed';
import {
  STRATEGIC_CORE_COVERAGE_BUSINESS_SOURCE,
  buildStrategicCoreCoverageBusinessUatSource
} from './StrategicCoreCoverageBusinessUat';
import importedJson from '../../../../data/KCFKPI_MASTER_IMPORT_R3.json';

interface IImportRow {
  KPIID: string; KPIVersionKey: string; KPIWording: string; Pillar: string; Workstream: string;
  AccountableOwnerEmail?: string; AccountableOwnerPersonKey?: string; MetricType: string; UnitLabel: string;
  ScoringDirection: string; AggregationMethod: string; ReportingStatus: string;
  DefinitionStatus: string; IsCurrent: boolean;
}
interface IImportData { kpiMaster: IImportRow[]; }
const imported = importedJson as IImportData;

const snapshot = (): IAdminReportingControlSnapshot => ({
  mode: 'ProductionReadOnly', performanceYear: 2026, loadedAt: '2026-08-23T12:00:00.000Z',
  kpis: imported.kpiMaster.filter(row => row.IsCurrent && row.DefinitionStatus === 'Active').map((row, index) => ({
    id: index + 1, kpiId: row.KPIID, kpiVersionKey: row.KPIVersionKey, wording: row.KPIWording,
    wordingSourceReference: 'accepted-import', pillar: row.Pillar, workstream: row.Workstream, active: true,
    owner: row.AccountableOwnerEmail || row.AccountableOwnerPersonKey || '', measureType: row.MetricType,
    unit: row.UnitLabel, direction: row.ScoringDirection, aggregationMethod: row.AggregationMethod,
    reportingStatus: row.ReportingStatus
  })),
  annualTargets: [], behaviourDefinitions: [], organisationalWeights: [],
  reportingMaps: [{
    id: 1, mappingKey: 'SO1-001|MAIN_CWOP|V1', naturalKey: 'SO1-001|MAIN_CWOP', kpiId: 'SO1-001',
    outputCode: 'MAIN_CWOP', externalKey: 'SO1-001', treatment: 'Direct', reportingCadence: 'Quarterly',
    effectiveFrom: '2025-11-01', effectiveTo: '2026-10-31', active: true, version: '1',
    approvalStatus: 'Approved', changeReference: 'CONTROL-TEST', approvedByEmail: 'approver@example.invalid',
    approvedAt: '2025-10-31T12:00:00Z'
  }],
  outputDefinitions: [{
    id: 1, outputCode: 'MAIN_CWOP', outputName: 'Core CWOP', active: true, reportingFrequency: 'Quarterly',
    mappingRequirement: 'Optional', outputFormat: 'XLSX', effectiveFrom: '2025-11-01',
    effectiveTo: '2026-10-31', version: '1', publicationStatus: 'Published'
  }],
  officialResults: [{
    kpiResultKey: 'SO1-001|2026|Q2', kpiId: 'SO1-001', performanceYear: 2026, quarter: 'Q2',
    finalActual: 72, resultStatus: 'Published', publishedAt: '2026-07-02T10:00:00Z'
  }],
  auditEvents: [],
  auditReadRequest: { dateFrom: '2026-05-25T12:00:00Z', dateTo: '2026-08-23T12:00:00Z', operation: 'ReadOnly', maximumRangeDays: 90 },
  warnings: []
});

describe('KCF-KPI-025-R2 Sponsor business UAT source', () => {
  it('reconciles the exact real 109-KPI source and uses real targets, owner, membership and Official Actual', () => {
    const result = buildStrategicCoreCoverageBusinessUatSource(snapshot());
    expect(STRATEGIC_CORE_COVERAGE_BUSINESS_SOURCE).toEqual({
      file: 'KCFKPI_KPI_GOLD_SOURCE.xlsx',
      sha256: '01B8961D8C3A20A96E7E7F24E86ECE7C5FD0922D739C17B4B20863D58E6893FB',
      table: 'KpiGoldLiveSource',
      payloadSha256: expect.any(String)
    });
    expect(result.counts).toEqual({
      kpis: 109, numericTargets: 104, textTargets: 5, officialActuals: 1, confirmedMembershipMappings: 1
    });
    expect(result.source.kpis).toHaveLength(109);
    expect(result.source.kpis.some(row => /^SC-/.test(row.kpiId))).toBe(false);
    const schools = result.source.kpis.filter(row => row.kpiId === 'SO1-001')[0];
    expect(schools).toMatchObject({
      wording: '200 Primary School Programmes delivered annually.',
      organisationTargets: { annual: 200, q1: 70, q2: 148, q3: 200, q4: 200 },
      owner: 'person005@example.invalid', reportingMembership: ['CORE_CWOP'],
      officialActualValue: 72, officialActualSourceStatus: 'Authoritative'
    });
  });

  it('keeps the local interaction on real KPI IDs and preserves RPT-005 coverage arithmetic', () => {
    const result = buildStrategicCoreCoverageBusinessUatSource(snapshot());
    expect(result.source.contributions).toHaveLength(4);
    expect(result.source.contributions.every(row => row.kpiId === 'SO1-001'
      && row.sourceReference.indexOf('Business UAT local scenario') === 0)).toBe(true);
    const feed = calculateStrategicCoreCoverageFeed(result.source, { performanceYear: 2026, kpiId: 'SO1-001' });
    expect(feed.summary[0].annual).toMatchObject({
      organisationTarget: 200, approvedContribution: 70, pendingContribution: 20,
      coveragePercent: 35, gap: 130, state: 'UNDER_ALLOCATED'
    });
    expect(feed.summary[0].officialActualDerivedFromEmployeeActuals).toBe(false);
  });

  it('fails closed rather than showing a drifted or incomplete KCF Automation catalogue', () => {
    const short = snapshot();
    short.kpis = short.kpis.slice(0, 108);
    expect(() => buildStrategicCoreCoverageBusinessUatSource(short)).toThrow(/exactly 109 distinct/);
    const changed = snapshot();
    changed.kpis = changed.kpis.map((row, index) => index === 0 ? { ...row, wording: 'Changed wording' } : row);
    expect(() => buildStrategicCoreCoverageBusinessUatSource(changed)).toThrow(/does not reconcile/);
  });

  it('does not invent an Official Actual when none is approved or published', () => {
    const noActual = snapshot();
    noActual.officialResults = [];
    const result = buildStrategicCoreCoverageBusinessUatSource(noActual);
    const schools = result.source.kpis.filter(row => row.kpiId === 'SO1-001')[0];
    expect(result.counts.officialActuals).toBe(0);
    expect(schools.officialActualValue).toBeNull();
    expect(schools.officialActualSourceStatus).toBe('Unavailable');
  });
});
