/** @jest-environment jsdom */
/* eslint-disable @rushstack/pair-react-dom-render-unmount */

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import AdminReportingControlUatHarness, {
  ADMIN_REPORTING_CONTROL_UAT_ACTOR,
  ADMIN_REPORTING_CONTROL_UAT_MUTATION_AT,
  buildAdminReportingControlUatKpis,
  type IAdminReportingControlReadOnlySnapshot
} from './AdminReportingControlUatHarness';

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;

const clickButton = (container: HTMLElement, label: string): HTMLButtonElement => {
  const button = Array.from(container.querySelectorAll('button'))
    .filter(candidate => (candidate.textContent || '').indexOf(label) >= 0)[0] as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Button containing "${label}" was not rendered.`);
  act(() => Simulate.click(button));
  return button;
};

const controlFor = (
  container: HTMLElement,
  label: string
): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement => {
  const wrapper = Array.from(container.querySelectorAll('label'))
    .filter(candidate => (candidate.textContent || '').indexOf(label) >= 0)[0];
  const control = wrapper?.querySelector('input, select, textarea') as (
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null
  );
  if (!control) throw new Error(`Control labelled "${label}" was not rendered.`);
  return control;
};

const setControl = (
  container: HTMLElement,
  label: string,
  value: string
): void => {
  const control = controlFor(container, label);
  control.value = value;
  act(() => Simulate.change(control));
};

const mountHarness = (
  container: HTMLElement,
  baseline?: IAdminReportingControlReadOnlySnapshot
): void => {
  act(() => {
    ReactDOM.render(React.createElement(AdminReportingControlUatHarness, {
      productionIdentity: 'Real signed-in identity · admin@samplefoundation.example.invalid',
      baseline,
      loadMessage: baseline ? 'Optional live read-only baseline loaded' : undefined
    }), container);
  });
};

describe('KCF-KPI-020B Admin Reporting Control safe-UAT harness', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('shows the exact isolated no-production-write boundary and synthetic mutation actor', () => {
    mountHarness(container);

    expect(container.textContent).toContain('SAFE ADMIN UAT');
    expect(container.textContent).toContain('Browser memory only');
    expect(container.textContent).toContain('NO production SharePoint writes');
    expect(container.textContent).toContain('NO saves, submits, approvals, deployment or notifications');
    expect(container.textContent).toContain(ADMIN_REPORTING_CONTROL_UAT_ACTOR);
    expect(container.textContent).toContain('refresh naturally resets all local changes');
  });

  it('demonstrates isolated KPI, target and Behaviour revision operations without rewriting history', () => {
    mountHarness(container);

    clickButton(container, 'KPI Master');
    clickButton(container, 'SYN-002 · Active');
    setControl(container, 'Owner', 'synthetic.changed.owner@example.invalid');
    clickButton(container, 'Save KPI metadata');
    expect(container.textContent).toContain('KPI metadata saved in browser memory only');
    expect(container.textContent).toContain('No production SharePoint write occurred');

    clickButton(container, 'Deactivate KPI');
    expect(container.textContent).toContain('KPI deactivated in browser memory only');
    expect(container.textContent).toContain('No historic definition was deleted');
    clickButton(container, 'Add KPI version');
    expect(container.textContent).toContain('New KPI version added in browser memory only');
    expect(container.textContent).toContain('110 KPI(s) shown');

    clickButton(container, 'Annual Targets');
    clickButton(container, 'SYN-001 · 2026/27');
    setControl(container, 'Annual Target', '125');
    clickButton(container, 'Save year-specific target');
    expect(container.textContent).toContain('Historic years and production SharePoint were unchanged');
    expect(controlFor(container, 'Annual Target').value).toBe('125');
    setControl(container, 'KPI ID', 'SYN-NEW');
    setControl(container, 'New Annual Target', '50');
    setControl(container, 'New Q1 TARGET', '10');
    setControl(container, 'New Q2 TARGET', '20');
    setControl(container, 'New Q3 TARGET', '35');
    setControl(container, 'New Q4 TARGET', '50');
    clickButton(container, 'Add Annual Target version');
    expect(container.textContent).toContain('Annual Target version added in browser memory only');
    expect(container.textContent).toContain('2 target version(s)');

    clickButton(container, 'Behaviour Definitions');
    clickButton(container, 'BEH-1');
    setControl(container, 'Behaviour title', 'Synthetic Behaviour 1 revised draft');
    clickButton(container, 'Create draft revision');
    expect(container.textContent).toContain('published source version remains in history');
    expect(container.textContent).toContain('BEH-1|v01-DRAFT');
    expect(container.textContent).toContain('5 current definitions · 25 prompts');
  });

  it('demonstrates manual weighting plus Reporting Map and Output Definition add/edit with audit evidence', () => {
    mountHarness(container);

    clickButton(container, 'Organisational Weighting');
    const weight = container.querySelector('input[aria-label="Weight SYN-001"]') as HTMLInputElement;
    expect(weight).toBeTruthy();
    weight.value = '60';
    act(() => Simulate.change(weight));
    clickButton(container, 'Save weight');
    expect(container.textContent).toContain('No equal-weight autofill or production write occurred');

    clickButton(container, 'Reporting Map');
    clickButton(container, 'SYN-001|SYN_OUTPUT|v01');
    setControl(container, 'External Key', 'SyntheticExternalFieldRevised');
    clickButton(container, 'Save mapping');
    expect(container.textContent).toContain('Reporting Map row saved in browser memory only');
    clickButton(container, 'Add Reporting Map draft');
    expect(container.textContent).toContain('Reporting Map draft added in browser memory only');
    expect(container.textContent).toContain('2 mapping row(s)');

    clickButton(container, 'Output Definitions');
    clickButton(container, 'SYN_OUTPUT');
    setControl(container, 'Output Name', 'Synthetic UAT output revised');
    clickButton(container, 'Save Output Definition');
    expect(container.textContent).toContain('Output Definition saved in browser memory only');
    clickButton(container, 'Add Output Definition draft');
    expect(container.textContent).toContain('Output Definition draft added in browser memory only');
    expect(container.textContent).toContain('2 output definition(s)');

    clickButton(container, 'Audit Viewer');
    expect(container.textContent).toContain(ADMIN_REPORTING_CONTROL_UAT_ACTOR);
    expect(container.textContent).toContain('WeightSet');
    expect(container.textContent).toContain('ReportingMapEdited');
    expect(container.textContent).toContain('ReportingMapAdded');
    expect(container.textContent).toContain('OutputDefinitionEdited');
    expect(container.textContent).toContain('OutputDefinitionAdded');
    expect(container.textContent).toContain('BrowserMemoryOnly');
  });

  it('contains invalid organisational-weight drafts without crashing, resetting or auditing them', () => {
    mountHarness(container);
    clickButton(container, 'Organisational Weighting');
    const weight = container.querySelector('input[aria-label="Weight SYN-001"]') as HTMLInputElement;

    ['0', '90', '99.99', '100'].forEach(value => {
      weight.value = value;
      act(() => Simulate.change(weight));
      clickButton(container, 'Save weight');
      expect(container.textContent).toContain('No equal-weight autofill or production write occurred');
    });

    ['100.01', '110', '', 'not-a-number'].forEach(value => {
      weight.value = value;
      act(() => Simulate.change(weight));
      clickButton(container, 'Save weight');
      expect(weight.value).toBe(value);
      expect(container.textContent).toContain('nothing was saved');
      expect(container.textContent).toContain('Admin Configuration & Reporting Control');
      if (value === '110') {
        expect(container.textContent).toContain('These KPI weights total 110%. They must total exactly 100%.');
      }
    });

    clickButton(container, 'Audit Viewer');
    const weightEvents = Array.from(container.querySelectorAll('article h3'))
      .filter(heading => heading.textContent === 'WeightSet');
    expect(weightEvents).toHaveLength(4);
    const eventCards = weightEvents.map(heading => heading.closest('article'));
    eventCards.forEach(card => {
      expect(card?.textContent).toContain(ADMIN_REPORTING_CONTROL_UAT_ACTOR);
      expect(card?.textContent).toContain(ADMIN_REPORTING_CONTROL_UAT_MUTATION_AT);
      expect(card?.textContent).toContain('BrowserMemoryOnly');
    });
  });

  it('rejects invalid Output Definitions and preserves exact Owner Email through navigation readback', () => {
    mountHarness(container);
    clickButton(container, 'Output Definitions');
    expect(container.textContent).toContain('1 output definition(s)');

    setControl(container, 'Mapping state', '');
    clickButton(container, 'Add Output Definition draft');
    expect(container.textContent).toContain('Output Definition draft was not added');
    expect(container.textContent).toContain('Choose Required or Optional');
    expect(container.textContent).toContain('1 output definition(s)');

    setControl(container, 'Mapping state', 'Required');
    clickButton(container, 'Add Output Definition draft');
    expect(container.textContent).toContain('2 output definition(s)');
    clickButton(container, 'SYN_OUTPUT_NEW');
    expect(controlFor(container, 'Owner email').value)
      .toBe('synthetic.reporting.owner@example.invalid');

    const exactOwner = 'person010@example.invalid';
    setControl(container, 'Owner email', exactOwner);
    clickButton(container, 'Save Output Definition');
    clickButton(container, 'Reporting readiness');
    clickButton(container, 'Output Definitions');
    clickButton(container, 'SYN_OUTPUT_NEW');
    expect(controlFor(container, 'Owner email').value).toBe(exactOwner);

    setControl(container, 'Owner email', 'not-an-email');
    clickButton(container, 'Save Output Definition');
    expect(container.textContent).toContain('Enter a valid Owner Email');
    clickButton(container, 'Reporting readiness');
    clickButton(container, 'Output Definitions');
    clickButton(container, 'SYN_OUTPUT_NEW');
    expect(controlFor(container, 'Owner email').value).toBe(exactOwner);
  });

  it('filters the two known Audit timestamps inclusively from current date state and clears deterministically', () => {
    mountHarness(container, {
      performanceYear: 2026,
      loadedAt: '2026-08-22T12:00:00.000Z',
      auditReadRequest: {
        dateFrom: '2026-08-01T00:00:00.000Z',
        dateTo: '2026-08-22T12:00:00.000Z',
        maximumRangeDays: 90
      },
      auditRecords: [
        { id: 1, auditKey: 'LIVE-19', eventAt: '2026-08-19T22:44:39.000Z', actor: 'one@example.invalid', eventType: 'WorkplanSubmitted', entityType: 'Workplan', entityKey: 'WP-1' },
        { id: 2, auditKey: 'LIVE-21', eventAt: '2026-08-21T09:15:00.000Z', actor: 'two@example.invalid', eventType: 'QuarterReviewSubmitted', entityType: 'QuarterReview', entityKey: 'QR-1' }
      ]
    });
    clickButton(container, 'Audit Viewer');
    const displayedEventTypes = (): string[] => Array.from(container.querySelectorAll('main article h3'))
      .map(heading => heading.textContent || '');
    expect(displayedEventTypes()).toEqual(['QuarterReviewSubmitted', 'WorkplanSubmitted']);

    setControl(container, 'Date from', '2026-08-21');
    expect(displayedEventTypes()).toEqual(['QuarterReviewSubmitted']);

    setControl(container, 'Date from', '2026-08-19');
    setControl(container, 'Date to', '2026-08-19');
    expect(displayedEventTypes()).toEqual(['WorkplanSubmitted']);

    setControl(container, 'Date from', '2026-08-21');
    expect(container.textContent).toContain('Audit dateTo must be on or after dateFrom');
    expect(container.textContent).toContain('No Audit events match');

    clickButton(container, 'Clear Audit filters');
    expect(displayedEventTypes()).toEqual(['QuarterReviewSubmitted', 'WorkplanSubmitted']);
  });

  it('clones an optional live read-only baseline and resets local edits on a fresh mount', () => {
    const baseline: IAdminReportingControlReadOnlySnapshot = {
      performanceYear: 2026,
      loadedAt: '2026-08-22T12:00:00.000Z',
      kpis: buildAdminReportingControlUatKpis()
    };
    const before = JSON.stringify(baseline);
    mountHarness(container, baseline);
    clickButton(container, 'KPI Master');
    clickButton(container, 'SYN-002 · Active');
    setControl(container, 'Owner', 'synthetic.temporary.owner@example.invalid');
    clickButton(container, 'Save KPI metadata');
    expect(controlFor(container, 'Owner').value).toBe('synthetic.temporary.owner@example.invalid');
    expect(JSON.stringify(baseline)).toBe(before);

    act(() => { ReactDOM.unmountComponentAtNode(container); });
    mountHarness(container, baseline);
    clickButton(container, 'KPI Master');
    clickButton(container, 'SYN-002 · Active');
    expect(controlFor(container, 'Owner').value).toBe('synthetic.owner.two@example.invalid');
    expect(JSON.stringify(baseline)).toBe(before);
  });

  it('contains no persistence, connector, service or network path', () => {
    const source = readFileSync(resolve(
      '.', 'src', 'webparts', 'performanceHub', 'components', 'AdminReportingControlUatHarness.tsx'
    ), 'utf8');
    expect(source).toContain("synthetic.reporting.admin@example.invalid");
    expect(source).toContain('BrowserMemoryOnly');
    expect(source).not.toMatch(
      /localStorage|sessionStorage|AdminReportingControlDataService|SharePoint|SPHttpClient|fetch\s*\(|XMLHttpRequest/
    );
  });
});
