/** @jest-environment jsdom */

import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import StrategicCoreCoverageUatHarness, {
  STRATEGIC_CORE_COVERAGE_UAT_ACTOR,
  STRATEGIC_CORE_COVERAGE_R1_MARKER,
  buildDuplicateContributionCoverageUatSource,
  buildStrategicCoreCoverageFilterOptions,
  reconcileFullStrategicCoreCoverageUatSource
} from './StrategicCoreCoverageUatHarness';
import {
  buildStrategicCoreCoverageUatSource,
  calculateStrategicCoreCoverageFeed,
  reconcileStrategicCoreCoverageUat
} from '../services/StrategicCoreCoverageFeed';

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;

describe('KCF-KPI-025 safe coverage UAT harness', () => {
  it('renders the actual product page with the synthetic RPT-005 reconciliation', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(StrategicCoreCoverageUatHarness, {
      productionIdentity: 'Synthetic Person 25 · person003@example.invalid'
    }));
    expect(html).toContain('Strategic Core Workplan Coverage');
    expect(html).toContain('SAFE COVERAGE UAT');
    expect(html).toContain(STRATEGIC_CORE_COVERAGE_UAT_ACTOR);
    expect(html).toContain(STRATEGIC_CORE_COVERAGE_R1_MARKER);
    expect(html).toContain('Synthetic RPT-005 reconciliation PASS');
    expect(html).toContain('200 schools = 70 approved + 20 pending');
    expect(html).toContain('NO production SharePoint data or writes');
    expect(html).toContain('Duplicate key — fail closed');
    expect(html).toContain('Future EDI — configuration required');
  });

  it('exposes the exact duplicate fixture as a visible fail-closed feed', () => {
    const source = buildDuplicateContributionCoverageUatSource();
    const feed = calculateStrategicCoreCoverageFeed(source, { performanceYear: source.performanceYear });
    const duplicateRows = feed.detail.filter(row => row.contributionKey === 'COV-001');
    const schools = feed.summary.filter(row => row.kpiId === 'SC-SCHOOLS-200')[0];
    expect(duplicateRows).toHaveLength(2);
    expect(duplicateRows.every(row => row.includedInNumericalCoverage === 'NO'
      && row.exclusionReasons.indexOf('DUPLICATE_CONTRIBUTION_KEY') >= 0)).toBe(true);
    expect(schools.annual.state).toBe('NOT_READY');
    expect(schools.annual.approvedContribution).toBe(40);
    expect(schools.annual.coveragePercent).toBeNull();
  });

  it('keeps workstreams dependent on the selected Pillar and leaves Future EDI disabled', () => {
    const source = buildStrategicCoreCoverageUatSource();
    const participation = buildStrategicCoreCoverageFilterOptions(source, { pillar: 'Participation' });
    expect(participation.workstreams).toEqual(['Schools']);
    expect(participation.memberships.filter(option => option.enabled).map(option => option.key)).toEqual([
      'CORE_CWOP', 'LONDON_CITIES_CWOP', 'WOMEN_GIRLS_CWOP', 'CWSP'
    ]);
    expect(participation.memberships.filter(option => option.key === 'EDI_CWOP')[0]).toEqual({
      key: 'EDI_CWOP',
      enabled: false,
      label: 'Future EDI CWOP — configuration required'
    });
  });

  it('keeps full-fixture reconciliation valid when the visible feed is filtered', () => {
    const source = buildStrategicCoreCoverageUatSource();
    const filtered = calculateStrategicCoreCoverageFeed(source, {
      performanceYear: source.performanceYear,
      pillar: 'Participation',
      workstream: 'Schools'
    });
    expect(reconcileStrategicCoreCoverageUat(filtered).length).toBeGreaterThan(0);
    expect(reconcileFullStrategicCoreCoverageUatSource(source)).toEqual([]);
  });

  it('contains no production service, REST, persistence or notification dependency', () => {
    const harnessSource = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'components', 'StrategicCoreCoverageUatHarness.tsx'), 'utf8');
    const feedSource = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'services', 'StrategicCoreCoverageFeed.ts'), 'utf8');
    const combined = `${harnessSource}\n${feedSource}`;
    [
      'IProductionDataService', 'SharePointProductionDataService', 'SPHttpClient', '/_api/',
      'fetch(', 'postJson', 'mergeJson', 'localStorage', 'sessionStorage', 'sendNotification'
    ].forEach(forbidden => expect(combined).not.toContain(forbidden));
  });

  it('keeps named detail synthetic and leaves the normal production route without a raw contribution feed', () => {
    const source = buildStrategicCoreCoverageUatSource();
    source.contributions.forEach(row => {
      expect(row.personDisplayName).toMatch(/^Synthetic /);
      expect(row.managerDisplayName).toMatch(/^Synthetic /);
      expect(row.sourceReference).toMatch(/^SYNTHETIC\|/);
    });
    const performanceHubSource = readFileSync(resolve('.', 'src', 'webparts', 'performanceHub', 'components', 'PerformanceHub.tsx'), 'utf8');
    const productionCoverageBranch = performanceHubSource.slice(
      performanceHubSource.indexOf("activeSection === 'strategicCoverage'"),
      performanceHubSource.indexOf("activeSection === 'dataQuality'")
    );
    expect(productionCoverageBranch).toContain('<StrategicCoreCoveragePage');
    expect(productionCoverageBranch).not.toContain('feed=');
    expect(productionCoverageBranch).toContain('production RPT-005 contribution feed is not yet provisioned or activated');
  });
});
