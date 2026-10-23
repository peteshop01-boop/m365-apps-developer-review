/** @jest-environment jsdom */
/* eslint-disable @rushstack/pair-react-dom-render-unmount */

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMServer from 'react-dom/server';
import { act, Simulate } from 'react-dom/test-utils';
import { buildStrategicCoreCoverageUatSource, calculateStrategicCoreCoverageFeed } from '../services/StrategicCoreCoverageFeed';
import StrategicCoreCoveragePage, { type IStrategicCoreCoveragePageProps } from './StrategicCoreCoveragePage';
import { buildStrategicCoreCoverageFilterOptions } from './StrategicCoreCoverageUatHarness';

const source = buildStrategicCoreCoverageUatSource();
const filter = { performanceYear: 2027 };
const feed = calculateStrategicCoreCoverageFeed(source, filter);
const options = buildStrategicCoreCoverageFilterOptions(source, filter);

const props = (): IStrategicCoreCoveragePageProps => ({
  productionIdentity: 'Display-only Synthetic User · Synthetic actor',
  feed,
  filter,
  filterOptions: options,
  localUat: true,
  message: 'Synthetic reconciliation PASS',
  onFilterChange: jest.fn()
});

describe('KCF-KPI-025 Strategic Core coverage page', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('renders the full Admin summary contract with planning states and no allocation editor', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(StrategicCoreCoveragePage, props()));
    [
      'KPI ID', 'Number of schools engaged', 'Participation', 'Schools', 'Organisation target',
      'People attached', 'Direct contributors', 'Oversight', 'Accountable owners',
      'Draft/Pending allocation', 'Approved allocation', 'Coverage', 'Gap / Surplus',
      'Official Actual', '72 schools', 'ORG-ACTUAL|SC-SCHOOLS-200|2027|Q1', 'Authoritative',
      'NOT READY', 'UNDER ALLOCATED', 'COVERED', 'OVER ALLOCATED', 'NOT APPLICABLE'
    ].forEach(label => expect(html).toContain(label));
    expect(html).toContain('This is not a central allocation-management screen');
    expect(html).not.toContain('Green');
    expect(html).not.toContain('Amber');
    expect(html).not.toContain('Red');
    expect(html).not.toContain('Save allocation');
    expect(html).not.toContain('Add allocation');
  });

  it('shows the exact person-level detail contract when a KPI is opened', () => {
    act(() => { ReactDOM.render(React.createElement(StrategicCoreCoveragePage, props()), container); });
    const button = Array.from(container.querySelectorAll('button'))
      .filter(candidate => (candidate.textContent || '').indexOf('SC-SCHOOLS-200') >= 0)[0];
    expect(button).toBeDefined();
    act(() => Simulate.click(button));
    expect(container.textContent).toContain('10 contribution records inspected');
    [
      'Synthetic P-A', 'Synthetic North Team', 'Synthetic Manager North', 'DeliveryLead', 'Additive',
      'ManagerApproved', 'Approved', 'Annual', 'Q1', 'Q2', 'Q3', 'Q4', 'schools',
      'Included in numerical coverage: YES', 'Included in numerical coverage: NO', 'Oversight only',
      'Workplan / version', 'Effective', 'Approval timestamp', 'Source reference',
      'Annual commitment', 'What 100% looks like', 'Employee completion', 'Calculated employee RAG',
      'Employee Actual', 'Official Actual aggregation permitted', 'Created audit', 'Updated audit'
    ].forEach(label => expect(container.textContent).toContain(label));
  });

  it('renders all five exception views and exact exclusion reasons', () => {
    act(() => { ReactDOM.render(React.createElement(StrategicCoreCoveragePage, props()), container); });
    const click = (label: string): void => {
      const button = Array.from(container.querySelectorAll('button'))
        .filter(candidate => (candidate.textContent || '').indexOf(label) >= 0)[0];
      expect(button).toBeDefined();
      act(() => Simulate.click(button));
    };
    click('Unresolved contribution methods');
    expect(container.textContent).toContain('Contribution method unresolved');
    click('Unit mismatches');
    expect(container.textContent).toContain('Unit mismatch');
    click('Pending Workplan contributions');
    expect(container.textContent).toContain('Draft/Pending');
    click('Under-allocated KPIs');
    expect(container.textContent).toContain('SC-SCHOOLS-200');
    click('Over-allocated KPIs');
    expect(container.textContent).toContain('SC-OVER-50');
  });

  it('sends the seven supported filters to the feed provider and clears them', () => {
    const pageProps = props();
    act(() => { ReactDOM.render(React.createElement(StrategicCoreCoveragePage, pageProps), container); });
    const selects = Array.from(container.querySelectorAll('select')) as HTMLSelectElement[];
    const change = (index: number, value: string): void => {
      selects[index].value = value;
      act(() => Simulate.change(selects[index]));
    };
    change(0, '2027');
    change(1, 'Participation');
    change(2, 'Schools');
    change(3, 'TEAM-NORTH');
    change(4, 'M-01');
    change(5, 'SC-SCHOOLS-200');
    change(6, 'CORE_CWOP');
    expect(pageProps.onFilterChange).toHaveBeenCalledTimes(7);
    expect(pageProps.onFilterChange).toHaveBeenLastCalledWith(expect.objectContaining({ reportingMembership: 'CORE_CWOP' }));
    const clear = Array.from(container.querySelectorAll('button')).filter(button => button.textContent === 'Clear filters')[0];
    act(() => Simulate.click(clear));
    expect(pageProps.onFilterChange).toHaveBeenLastCalledWith({ performanceYear: 2027 });
  });

  it('fails closed when the versioned Reporting feed is absent', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(StrategicCoreCoveragePage, {
      productionIdentity: 'Authorised Admin',
      filter: { performanceYear: 2027 },
      filterOptions: { performanceYears: [2027], pillars: [], workstreams: [], teams: [], managers: [], kpis: [], memberships: [] },
      localUat: false,
      message: 'Production feed not activated'
    }));
    expect(html).toContain('Strategic Core coverage data unavailable');
    expect(html).toContain('No figures are inferred');
    expect(html).toContain('PRODUCTION READ-ONLY');
  });

  it('renders duplicate-key failure visibly without a misleading percentage or gap', () => {
    const original = source.contributions.filter(row => row.contributionKey === 'COV-001')[0];
    const duplicateFeed = calculateStrategicCoreCoverageFeed({
      ...source,
      contributions: source.contributions.concat([{ ...original, contributionTargets: { ...original.contributionTargets } }])
    }, { performanceYear: 2027, kpiId: 'SC-SCHOOLS-200' });
    act(() => { ReactDOM.render(React.createElement(StrategicCoreCoveragePage, {
      ...props(), feed: duplicateFeed, filter: { performanceYear: 2027, kpiId: 'SC-SCHOOLS-200' }
    }), container); });
    expect(container.textContent).toContain('NOT READY');
    expect(container.textContent).toContain('Not available');
    expect(container.textContent).toContain('Not applicable');
    const button = Array.from(container.querySelectorAll('button'))
      .filter(candidate => (candidate.textContent || '').indexOf('SC-SCHOOLS-200') >= 0)[0];
    act(() => Simulate.click(button));
    expect(container.textContent).toContain('11 contribution records inspected');
    expect(container.textContent?.match(/Duplicate contribution key — fail closed/g)).toHaveLength(2);
  });

  it('renders a controlled zero-result state for a stale Future EDI deep link', () => {
    const futureFeed = calculateStrategicCoreCoverageFeed(source, {
      performanceYear: 2027,
      reportingMembership: 'EDI_CWOP'
    });
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(StrategicCoreCoveragePage, {
      ...props(), feed: futureFeed, filter: { performanceYear: 2027, reportingMembership: 'EDI_CWOP' }
    }));
    expect(html).toContain('Future EDI CWOP — configuration required');
    expect(html).toContain('Zero current KPI mappings');
    expect(html).toContain('0 KPI rows');
  });
});
