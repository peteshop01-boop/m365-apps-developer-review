/** @jest-environment jsdom */
jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'coverage-route-test-guid' }) }
}));
jest.mock('../services/ProductionOverviewLoader', () => ({
  loadProductionOverview: jest.fn()
}));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { IProductionDataService } from '../services/IProductionDataService';
import { loadProductionOverview } from '../services/ProductionOverviewLoader';
import PerformanceHub from './PerformanceHub';

describe('KCF-KPI-025 guarded Strategic Core coverage route', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    jest.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('mounts the actual product page from synthetic memory before any production loader or data-service call', async () => {
    const forbiddenDataCall = jest.fn(() => { throw new Error('Production data service must not be called.'); });
    const dataService = new Proxy({}, { get: () => forbiddenDataCall }) as IProductionDataService;

    await act(async () => {
      ReactDOM.render(React.createElement(PerformanceHub, {
        dataService,
        currentUserEmail: 'person003@example.invalid',
        userDisplayName: 'Synthetic Person 02',
        strategicCoreCoverageUatMode: true
      }), container);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Strategic Core Workplan Coverage');
    expect(container.textContent).toContain('SAFE COVERAGE UAT');
    expect(container.textContent).toContain('Synthetic RPT-005 reconciliation PASS');
    expect(loadProductionOverview).not.toHaveBeenCalled();
    expect(forbiddenDataCall).not.toHaveBeenCalled();
  });
});
