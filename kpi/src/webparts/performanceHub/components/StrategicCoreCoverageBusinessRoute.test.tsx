/** @jest-environment jsdom */
/* eslint-disable @rushstack/pair-react-dom-render-unmount */

jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'coverage-business-route-test-guid' }) }
}));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { IProductionDataService } from '../services/IProductionDataService';
import type { IAdminReportingControlDataService, IAdminReportingControlSnapshot } from '../services/AdminReportingControlDataService';
import PerformanceHub from './PerformanceHub';
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

describe('KCF-KPI-025-R2 guarded Sponsor business route', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('loads only the authorised read-only reference snapshot and never enters the production overview/write path', async () => {
    const productionDataService = new Proxy({}, {
      get: (_target, property) => jest.fn(() => { throw new Error(`Unexpected production data call ${String(property)}`); })
    }) as IProductionDataService;
    const reportingService: IAdminReportingControlDataService = {
      getAdminReportingControlSnapshot: jest.fn().mockResolvedValue(snapshot())
    };

    await act(async () => {
      ReactDOM.render(React.createElement(PerformanceHub, {
        dataService: productionDataService,
        adminReportingDataService: reportingService,
        currentUserEmail: 'person003@example.invalid',
        userDisplayName: 'Synthetic Person 25',
        strategicCoreCoverageBusinessUatMode: true
      }), container);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(reportingService.getAdminReportingControlSnapshot).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('UAT — test changes will not affect live data.');
    expect(container.textContent).toContain('109Strategic Core KPIs');
    expect(container.textContent).not.toContain('Bounded QA fixture');
  });

  it('fails closed when the real read-only reference snapshot cannot be verified', async () => {
    const reportingService: IAdminReportingControlDataService = {
      getAdminReportingControlSnapshot: jest.fn().mockRejectedValue(new Error('Read failed'))
    };

    await act(async () => {
      ReactDOM.render(React.createElement(PerformanceHub, {
        dataService: {} as IProductionDataService,
        adminReportingDataService: reportingService,
        currentUserEmail: 'person003@example.invalid', userDisplayName: 'Synthetic Person 25',
        strategicCoreCoverageBusinessUatMode: true
      }), container);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Business UAT remains unavailable and no data was changed.');
    expect(container.textContent).not.toContain('Strategic Core KPIs');
  });
});
