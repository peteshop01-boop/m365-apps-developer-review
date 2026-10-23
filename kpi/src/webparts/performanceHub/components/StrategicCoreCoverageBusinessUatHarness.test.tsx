/** @jest-environment jsdom */

import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type { IAdminReportingControlSnapshot } from '../services/AdminReportingControlDataService';
import StrategicCoreCoverageBusinessUatHarness from './StrategicCoreCoverageBusinessUatHarness';
import StrategicCoreCoverageUatHarness from './StrategicCoreCoverageUatHarness';
import importedJson from '../../../../data/KCFKPI_MASTER_IMPORT_R3.json';

interface IImportRow {
  KPIID: string; KPIVersionKey: string; KPIWording: string; Pillar: string; Workstream: string;
  AccountableOwnerEmail?: string; AccountableOwnerPersonKey?: string; MetricType: string; UnitLabel: string;
  ScoringDirection: string; AggregationMethod: string; ReportingStatus: string; DefinitionStatus: string; IsCurrent: boolean;
}
const imported = importedJson as { kpiMaster: IImportRow[] };

const snapshot = (): IAdminReportingControlSnapshot => ({
  mode: 'ProductionReadOnly', performanceYear: 2026, loadedAt: '2026-08-23T12:00:00.000Z',
  kpis: imported.kpiMaster.filter(row => row.IsCurrent && row.DefinitionStatus === 'Active').map((row, index) => ({
    id: index + 1, kpiId: row.KPIID, kpiVersionKey: row.KPIVersionKey, wording: row.KPIWording,
    wordingSourceReference: 'accepted-import', pillar: row.Pillar, workstream: row.Workstream, active: true,
    owner: row.AccountableOwnerEmail || row.AccountableOwnerPersonKey || '', measureType: row.MetricType,
    unit: row.UnitLabel, direction: row.ScoringDirection, aggregationMethod: row.AggregationMethod,
    reportingStatus: row.ReportingStatus
  })),
  annualTargets: [], behaviourDefinitions: [], organisationalWeights: [], reportingMaps: [], outputDefinitions: [],
  officialResults: [], auditEvents: [],
  auditReadRequest: { dateFrom: '2026-05-25T12:00:00Z', dateTo: '2026-08-23T12:00:00Z', operation: 'ReadOnly', maximumRangeDays: 90 },
  warnings: []
});

describe('KCF-KPI-025-R2 Sponsor business UAT presentation', () => {
  it('renders the intended product with 109 real KPIs and no technical QA fixture controls', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(StrategicCoreCoverageBusinessUatHarness, {
      productionIdentity: 'Synthetic Person 25 · person003@example.invalid', snapshot: snapshot()
    }));
    expect(html).toContain('UAT — test changes will not affect live data.');
    expect(html).toContain('<strong>109</strong><span>Strategic Core KPIs</span>');
    expect(html).toContain('KPI ID · SO1-001');
    expect(html).toContain('200 Primary School Programmes delivered annually.');
    [
      'SC-', 'Synthetic actor', 'SAFE COVERAGE UAT', 'Bounded QA fixture', 'Duplicate key — fail closed',
      'Future EDI — configuration required', 'RPT-005 feed contract', 'Reporting source e64961727b7c',
      'KCF-KPI-025-R1-BOUNDED-QA-4329'
    ].forEach(forbidden => expect(html).not.toContain(forbidden));
  });

  it('retains the separate technical QA fixture route unchanged', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(StrategicCoreCoverageUatHarness, {
      productionIdentity: 'Synthetic Person 25 · person003@example.invalid'
    }));
    expect(html).toContain('SAFE COVERAGE UAT');
    expect(html).toContain('Bounded QA fixture');
    expect(html).toContain('Duplicate key — fail closed');
    expect(html).toContain('Future EDI — configuration required');
  });
});
