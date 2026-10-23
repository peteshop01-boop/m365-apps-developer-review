/** @jest-environment jsdom */
/* eslint-disable @rushstack/pair-react-dom-render-unmount */

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMServer from 'react-dom/server';
import { act, Simulate } from 'react-dom/test-utils';
import AdminReportingControlPage, {
  type IAdminReportingControlPageSnapshot
} from './AdminReportingControlPage';
import {
  buildAdminReportingControlUatAudit,
  buildAdminReportingControlUatBehaviours,
  buildAdminReportingControlUatKpis,
  buildAdminReportingControlUatMaps,
  buildAdminReportingControlUatOutputs,
  buildAdminReportingControlUatTargets
} from './AdminReportingControlUatHarness';

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;

const snapshot = (): IAdminReportingControlPageSnapshot => ({
  performanceYear: 2026,
  loadedAt: '2026-08-22T12:00:00.000Z',
  kpis: buildAdminReportingControlUatKpis(),
  annualTargets: buildAdminReportingControlUatTargets(),
  behaviourDefinitions: buildAdminReportingControlUatBehaviours(),
  organisationalWeights: [],
  reportingMaps: buildAdminReportingControlUatMaps(),
  outputDefinitions: buildAdminReportingControlUatOutputs(),
  auditEvents: buildAdminReportingControlUatAudit(),
  auditReadRequest: {
    dateFrom: '2026-05-24T12:00:00.000Z',
    dateTo: '2026-08-22T12:00:00.000Z',
    maximumRangeDays: 90
  },
  warnings: ['Synthetic baseline warning remains visible.']
});

const clickButton = (container: HTMLElement, label: string): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button'))
    .filter(candidate => (candidate.textContent || '').indexOf(label) >= 0)[0] as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Button containing "${label}" was not rendered.`);
  act(() => Simulate.click(button));
  return button;
};

const controlFor = (container: HTMLElement, label: string): HTMLInputElement | HTMLSelectElement => {
  const wrapper = Array.from(container.querySelectorAll('label'))
    .filter(candidate => (candidate.textContent || '').indexOf(label) >= 0)[0];
  const control = wrapper?.querySelector('input, select') as HTMLInputElement | HTMLSelectElement | null;
  if (!control) throw new Error(`Control labelled "${label}" was not rendered.`);
  return control;
};

describe('KCF-KPI-020B Admin Reporting Control page', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('renders all eight controlled areas and fails publication closed when reporting eligibility is unknown', () => {
    const readOnlySnapshot = snapshot();
    const unknownEligibilitySnapshot: IAdminReportingControlPageSnapshot = {
      ...readOnlySnapshot,
      kpis: readOnlySnapshot.kpis.map((kpi, index) => index === 1
        ? { ...kpi, reportingStatus: undefined }
        : { ...kpi })
    };
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(AdminReportingControlPage, {
      productionIdentity: 'Authorised Admin · admin@example.invalid',
      snapshot: unknownEligibilitySnapshot,
      loadMessage: 'Read-only baseline loaded',
      localUat: false
    }));

    [
      'Reporting readiness', 'KPI Master', 'Annual Targets', 'Behaviour Definitions',
      'Organisational Weighting', 'Reporting Map', 'Output Definitions', 'Audit Viewer'
    ].forEach(label => expect(html).toContain(label));
    expect(html).toContain('PRODUCTION READ-ONLY');
    expect(html).toContain('Synthetic baseline warning remains visible.');
    expect(html).toContain('NOT READY');
    expect(html).toContain('KPI ReportingStatus Included/ContextOnly/Excluded is unknown');
    expect(html).not.toContain('SAFE ADMIN UAT');
  });

  it('requires mappings only for explicitly Included active KPIs and never treats Exclude as Included', () => {
    act(() => {
      ReactDOM.render(React.createElement(AdminReportingControlPage, {
        productionIdentity: 'Authorised Admin · admin@example.invalid',
        snapshot: snapshot(),
        localUat: false
      }), container);
    });
    clickButton(container, 'Reporting Map');
    expect(container.textContent).not.toContain('UnmappedRequiredKpi');
    expect(container.textContent).not.toContain('Required KPI SYN-002');
    expect(container.textContent).not.toContain('ReportingStatus Included/ContextOnly/Excluded is unavailable');
  });

  it('keeps production mutation controls disabled while leaving KPI search and filters usable', () => {
    act(() => {
      ReactDOM.render(React.createElement(AdminReportingControlPage, {
        productionIdentity: 'Authorised Admin · admin@example.invalid',
        snapshot: snapshot(),
        localUat: false
      }), container);
    });

    clickButton(container, 'KPI Master');
    const search = controlFor(container, 'Search KPIs') as HTMLInputElement;
    search.value = 'SYN-109';
    act(() => Simulate.change(search));
    expect(container.textContent).toContain('1 KPI(s) shown');
    expect(container.textContent).toContain('SYN-109');

    clickButton(container, 'Clear filters');
    expect(container.textContent).toContain('109 KPI(s) shown');
    clickButton(container, 'SYN-001 · Active');

    const save = Array.from(container.querySelectorAll('button'))
      .filter(button => button.textContent === 'Save KPI metadata')[0] as HTMLButtonElement;
    const toggle = Array.from(container.querySelectorAll('button'))
      .filter(button => button.textContent === 'Deactivate KPI')[0] as HTMLButtonElement;
    const add = Array.from(container.querySelectorAll('button'))
      .filter(button => button.textContent === 'Add KPI version')[0] as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(toggle.disabled).toBe(true);
    expect(add.disabled).toBe(true);
    expect(controlFor(container, 'Owner').disabled).toBe(true);
  });

  it('caps large organisational-weighting issue summaries instead of rendering an unbounded warning wall', () => {
    const pageSource = readFileSync(resolve(
      '.', 'src', 'webparts', 'performanceHub', 'components', 'AdminReportingControlPage.tsx'
    ), 'utf8');
    expect(pageSource).toContain('summariseWeightingIssues(weighting.errors)');
    expect(pageSource).toContain('Individual repeated issues are capped here');
    expect(pageSource).toContain('use the level/state filters and remediation rows below');
    expect(pageSource).toContain('No equal-weight autofill is available');
    expect(pageSource).toContain('weighting.publicationReady && weighting.workstreamKpiTotals.length');
    expect(pageSource).toContain('Group validation');
    expect(pageSource).toContain('Current total');
    expect(pageSource).toContain('Missing weights');
    expect(pageSource).toContain('Invalid weights');
  });

  it('uses exact physical KPI choices and keeps derived target ownership read-only', () => {
    act(() => {
      ReactDOM.render(React.createElement(AdminReportingControlPage, {
        productionIdentity: 'Authorised Admin · admin@example.invalid',
        snapshot: snapshot(),
        localUat: true
      }), container);
    });
    clickButton(container, 'KPI Master');
    clickButton(container, 'SYN-001 · Active');
    expect(Array.from((controlFor(container, 'Measure Type') as HTMLSelectElement).options)
      .map(option => option.value)).toEqual(expect.arrayContaining(['Count', 'Percentage', 'Milestone', 'TextStatus']));
    expect(Array.from((controlFor(container, 'Direction') as HTMLSelectElement).options)
      .map(option => option.value)).toEqual(expect.arrayContaining(['HigherIsBetter', 'LowerIsBetter', 'TargetRange', 'TBC']));
    expect(Array.from((controlFor(container, 'Aggregation Method') as HTMLSelectElement).options)
      .map(option => option.value)).toEqual(expect.arrayContaining(['DirectMetric', 'Additive', 'Composite']));

    clickButton(container, 'Annual Targets');
    clickButton(container, 'SYN-001 · 2026/27');
    expect((controlFor(container, 'Owner (derived') as HTMLInputElement).readOnly).toBe(true);
  });

  it('provides the responsive phone and 44px-control contracts without service or network coupling', () => {
    const componentRoot = resolve('.', 'src', 'webparts', 'performanceHub', 'components');
    const pageSource = readFileSync(resolve(componentRoot, 'AdminReportingControlPage.tsx'), 'utf8');
    const harnessSource = readFileSync(resolve(componentRoot, 'AdminReportingControlUatHarness.tsx'), 'utf8');
    const scss = readFileSync(resolve(componentRoot, 'AdminReportingControlPage.module.scss'), 'utf8');

    expect(scss).toMatch(/@media\s*\(max-width:\s*600px\)/);
    expect(scss).toMatch(/\.actions button,\s*\.filters button\s*\{[^}]*min-height:\s*44px/);
    expect(scss).toMatch(/\.nav\s*\{[^}]*overflow-x:\s*auto/);
    expect(pageSource).toContain('data-layout="admin-reporting-control-responsive"');
    expect(pageSource + harnessSource).not.toMatch(
      /SharePointAdminReportingControlDataService|SPHttpClient|fetch\s*\(|postJson|mergeJson|deleteJson/
    );
  });

  it('clips date-only Audit filters to the exact preloaded timestamp window', () => {
    act(() => {
      ReactDOM.render(React.createElement(AdminReportingControlPage, {
        productionIdentity: 'Authorised Admin · admin@example.invalid',
        snapshot: snapshot(),
        localUat: false
      }), container);
    });

    clickButton(container, 'Audit Viewer');
    expect(container.textContent).toContain('ReadOnlyBaselineLoaded');
    expect(container.textContent).not.toContain('Audit read range exceeds');
    expect(container.textContent).not.toContain('outside the preloaded read-only snapshot window');
  });

  it('applies inclusive one-sided, same-day, cleared and inverted Audit bounds deterministically', () => {
    const auditSnapshot: IAdminReportingControlPageSnapshot = {
      ...snapshot(),
      auditEvents: [{
        id: 19, auditKey: 'AUDIT-19', eventAt: '2026-08-19T23:59:59.999Z', actor: 'admin@example.invalid',
        eventType: 'EventOnNineteenth', entityType: 'Config', entityKey: 'A'
      }, {
        id: 20, auditKey: 'AUDIT-20', eventAt: '2026-08-20T00:00:00.000Z', actor: 'admin@example.invalid',
        eventType: 'EventOnTwentieth', entityType: 'Config', entityKey: 'B'
      }]
    };
    act(() => {
      ReactDOM.render(React.createElement(AdminReportingControlPage, {
        productionIdentity: 'Authorised Admin · admin@example.invalid',
        snapshot: auditSnapshot,
        localUat: false
      }), container);
    });
    clickButton(container, 'Audit Viewer');
    const dateFrom = controlFor(container, 'Date from') as HTMLInputElement;
    const dateTo = controlFor(container, 'Date to') as HTMLInputElement;
    const input = (control: HTMLInputElement, value: string): void => {
      act(() => {
        control.value = value;
        Simulate.input(control);
      });
    };
    const displayedEventTypes = (): string[] => Array.from(container.querySelectorAll('article h3'))
      .map(heading => heading.textContent || '');

    input(dateFrom, '2026-08-20');
    input(dateTo, '');
    expect(displayedEventTypes()).toEqual(['EventOnTwentieth']);

    input(dateFrom, '');
    input(dateTo, '2026-08-19');
    expect(displayedEventTypes()).toEqual(['EventOnNineteenth']);

    input(dateFrom, '2026-08-20');
    input(dateTo, '2026-08-20');
    expect(displayedEventTypes()).toEqual(['EventOnTwentieth']);

    clickButton(container, 'Clear Audit filters');
    expect(dateFrom.value).toBe('');
    expect(dateTo.value).toBe('');
    expect(displayedEventTypes()).toEqual(['EventOnTwentieth', 'EventOnNineteenth']);

    input(dateFrom, '2026-08-21');
    input(dateTo, '2026-08-20');
    expect(container.textContent).toContain('Audit dateTo must be on or after dateFrom.');
    expect(container.textContent).toContain('No Audit events match the bounded read-only filters.');
    expect(displayedEventTypes()).toEqual([]);
  });
});
