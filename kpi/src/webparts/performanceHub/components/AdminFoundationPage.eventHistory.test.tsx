jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'admin-page-history-guid' }) }
}));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { buildKpiDataQualityQueue } from '../services/KpiDataQuality';
import { createAdminPeopleUatState } from '../services/AdminPeopleUat';
import { createAdminTeamsUatState } from '../services/AdminTeamsUat';
import {
  investigateAdminEventHistory,
  type IAdminControlledEventHistoryRecord,
  type IAdminEventHistoryView
} from '../services/AdminEventHistoryDomain';
import SharePointProductionDataService from '../services/SharePointProductionDataService';
import AdminFoundationPage from './AdminFoundationPage';

const historyRecord = (
  patch: Partial<IAdminControlledEventHistoryRecord> = {}
): IAdminControlledEventHistoryRecord => ({
  id: 1,
  auditKey: 'AUDIT-001',
  eventType: 'WorkplanSubmitted',
  subjectKey: 'WP-001',
  performanceYear: 2026,
  quarter: 'Q1',
  actorEmail: 'admin.one@example.invalid',
  actorRole: 'SeniorManagerAdmin',
  eventAt: '2026-04-10T09:30:00.000Z',
  afterJson: JSON.stringify({ state: 'Submitted', status: 'Ready' }),
  correlationKey: 'CORR-001',
  source: 'SPFx',
  sourceReference: 'Controlled workplan transition',
  success: true,
  ...patch
});

const records = (): IAdminControlledEventHistoryRecord[] => [
  historyRecord(),
  historyRecord({
    id: 2,
    auditKey: 'AUDIT-002',
    eventType: 'QuarterApproved',
    subjectKey: 'QR-002',
    performanceYear: 2026,
    quarter: 'Q2',
    actorEmail: 'system.admin@example.invalid',
    actorRole: 'SystemAdmin',
    eventAt: '2026-07-20T14:00:00.000Z',
    afterJson: JSON.stringify({ state: 'Approved', status: 'Green' }),
    correlationKey: 'CORR-002'
  })
];

const loadAuthorisedHistoryView = async (): Promise<IAdminEventHistoryView> => {
  const response = {
    ok: true,
    status: 200,
    json: async () => ({ value: [{
      Id: 1,
      PersonKey: 'ADMIN-001',
      Title: 'Synthetic authorised Admin',
      Email: 'admin.one@example.invalid',
      AppRoles: ['SystemAdmin'],
      Active: true
    }] })
  } as unknown as SPHttpClientResponse;
  const client = { get: jest.fn(async () => response), post: jest.fn() } as unknown as SPHttpClient;
  const capability = await new SharePointProductionDataService(
    client,
    'https://example.invalid/sites/kpi',
    'admin.one@example.invalid'
  ).getAuthoritativeAdminEventHistoryCapability();
  return investigateAdminEventHistory(capability, records());
};

let authorisedHistoryView: IAdminEventHistoryView;

const renderPage = (
  container: HTMLDivElement,
  includeAuthorisedHistory: boolean
): void => {
  act(() => {
    ReactDOM.render(<AdminFoundationPage
      peopleState={createAdminPeopleUatState([])}
      teamsState={createAdminTeamsUatState([])}
      behaviourLibrary={[]}
      configRecords={[]}
      kpiDataQualityQueue={buildKpiDataQualityQueue([])}
      eventHistory={includeAuthorisedHistory ? { view: authorisedHistoryView } : undefined}
      localUat={false}
      productionIdentity="Synthetic Admin"
      actorEmail="admin.one@example.invalid"
    />, container);
  });
};

const click = (container: HTMLElement, label: string): void => {
  const button = Array.from(container.querySelectorAll('button')).find(candidate => candidate.textContent?.includes(label));
  if (!button) throw new Error(`Missing button ${label}`);
  act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

const changeSelect = (container: HTMLElement, label: string, value: string): void => {
  const select = container.querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement | null;
  if (!select) throw new Error(`Missing select ${label}`);
  act(() => {
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

describe('Admin Foundation controlled event-history surface', () => {
  let container: HTMLDivElement;

  beforeAll(async () => {
    authorisedHistoryView = await loadAuthorisedHistoryView();
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('renders immutable attributed history and transitions through actor/state/status/period filters', () => {
    renderPage(container, true);
    click(container, 'Event History');

    expect(container.textContent).toContain('Controlled event history');
    expect(container.textContent).toContain('AUDIT-002');
    expect(container.textContent).toContain('AUDIT-001');
    expect(container.textContent).toContain('Read-only · edit/delete unavailable');

    changeSelect(container, 'Event history actor', 'system.admin@example.invalid');
    changeSelect(container, 'Event history state', 'Approved');
    changeSelect(container, 'Event history status', 'Green');
    changeSelect(container, 'Event history performance year', '2026');
    changeSelect(container, 'Event history quarter', 'Q2');

    expect(container.textContent).toContain('AUDIT-002');
    expect(container.textContent).not.toContain('AUDIT-001');
    expect(container.textContent).toContain('1 shown');

    click(container, 'Clear history filters');
    expect(container.textContent).toContain('AUDIT-002');
    expect(container.textContent).toContain('AUDIT-001');
    expect(container.textContent).toContain('2 shown');
  });

  it('does not expose an event-history route without an already-authorised view', () => {
    renderPage(container, false);

    expect(container.textContent).not.toContain('Event History');
    expect(container.textContent).not.toContain('AUDIT-001');
    expect(container.textContent).not.toContain('WP-001');
  });
});
