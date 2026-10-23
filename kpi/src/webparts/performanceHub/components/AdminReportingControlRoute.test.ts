/** @jest-environment jsdom */
/* eslint-disable @rushstack/pair-react-dom-render-unmount */

jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'admin-reporting-route-test-guid' }) }
}));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { IProductionDataService } from '../services/IProductionDataService';
import type {
  IAdminReportingControlDataService,
  IAdminReportingControlSnapshot
} from '../services/AdminReportingControlDataService';
import PerformanceHub from './PerformanceHub';
import { buildAdminReportingControlUatKpis } from './AdminReportingControlUatHarness';

const dataService = {} as IProductionDataService;

const snapshot = (): IAdminReportingControlSnapshot => ({
  mode: 'ProductionReadOnly',
  performanceYear: 2026,
  loadedAt: '2026-08-22T12:00:00.000Z',
  kpis: buildAdminReportingControlUatKpis(),
  annualTargets: [],
  behaviourDefinitions: [],
  organisationalWeights: [],
  reportingMaps: [],
  outputDefinitions: [],
  officialResults: [],
  auditEvents: [],
  auditReadRequest: {
    dateFrom: '2026-05-24T12:00:00.000Z',
    dateTo: '2026-08-22T12:00:00.000Z',
    operation: 'ReadOnly',
    maximumRangeDays: 90
  },
  warnings: []
});

const props = (service: IAdminReportingControlDataService): React.ComponentProps<typeof PerformanceHub> => ({
  dataService,
  adminReportingDataService: service,
  currentUserEmail: 'person003@example.invalid',
  userDisplayName: 'Synthetic Person 02',
  adminReportingUatMode: true
});

describe('KCF-KPI-020B guarded Admin Reporting route', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('withholds the mutable browser-memory harness until the live read-only baseline is verified', async () => {
    let resolveSnapshot: ((value: IAdminReportingControlSnapshot) => void) | undefined;
    const service: IAdminReportingControlDataService = {
      getAdminReportingControlSnapshot: jest.fn(() => new Promise(resolve => { resolveSnapshot = resolve; }))
    };

    await act(async () => {
      ReactDOM.render(React.createElement(PerformanceHub, props(service)), container);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Verifying the authorised read-only production baseline');
    expect(container.textContent).not.toContain('SAFE ADMIN UAT');

    await act(async () => {
      if (!resolveSnapshot) throw new Error('The read-only snapshot request did not start.');
      resolveSnapshot(snapshot());
      await Promise.resolve();
    });

    expect(container.textContent).toContain('SAFE ADMIN UAT');
    expect(container.textContent).toContain('Browser memory only');
    expect(container.textContent).toContain('109 versioned definitions');
  });

  it('fails closed without mounting synthetic edit controls when the read-only baseline fails', async () => {
    const service: IAdminReportingControlDataService = {
      getAdminReportingControlSnapshot: jest.fn().mockRejectedValue(new Error('Read failed'))
    };

    await act(async () => {
      ReactDOM.render(React.createElement(PerformanceHub, props(service)), container);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Safe Admin Reporting UAT is blocked');
    expect(container.textContent).toContain('no data was changed');
    expect(container.textContent).not.toContain('SAFE ADMIN UAT');
  });
});
