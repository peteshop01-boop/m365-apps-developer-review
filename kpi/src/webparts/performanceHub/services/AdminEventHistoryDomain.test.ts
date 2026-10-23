jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'admin-history-guid' }) }
}));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import {
  filterAuthorisedAdminEventHistoryView,
  investigateAdminEventHistory,
  type IAdminControlledEventHistoryRecord,
  type IAdminEventHistoryFilters
} from './AdminEventHistoryDomain';
import type { IAuthoritativeAdminEventHistoryCapability } from './IProductionDataService';
import SharePointProductionDataService from './SharePointProductionDataService';
import * as EventHistoryAuthorityApi from './AdminEventHistoryAuthority';

const adminEmail = 'admin.one@example.invalid';

const issueCapability = async (): Promise<IAuthoritativeAdminEventHistoryCapability> => {
  const response = {
    ok: true,
    status: 200,
    json: async () => ({ value: [{
      Id: 1,
      PersonKey: 'ADMIN-001',
      Title: 'Synthetic authorised Admin',
      Email: adminEmail,
      AppRoles: ['SystemAdmin'],
      Active: true
    }] })
  } as unknown as SPHttpClientResponse;
  const client = { get: jest.fn(async () => response), post: jest.fn() } as unknown as SPHttpClient;
  return new SharePointProductionDataService(client, 'https://example.invalid/sites/kpi', adminEmail)
    .getAuthoritativeAdminEventHistoryCapability();
};

const event = (
  patch: Partial<IAdminControlledEventHistoryRecord> = {}
): IAdminControlledEventHistoryRecord => ({
  id: 1,
  auditKey: 'AUDIT-001',
  eventType: 'WorkplanSubmitted',
  subjectKey: 'WP|PERSON-001|2026',
  performanceYear: 2026,
  quarter: 'Q1',
  actorEmail: 'admin.one@example.invalid',
  actorRole: 'SeniorManagerAdmin',
  eventAt: '2026-04-10T09:30:00.000Z',
  reason: 'Controlled submission',
  beforeJson: JSON.stringify({ state: 'Draft', status: 'NotReady' }),
  afterJson: JSON.stringify({ state: 'Submitted', status: 'Ready' }),
  correlationKey: 'CORR-001',
  source: 'SPFx',
  sourceReference: 'Workplan submission receipt',
  success: true,
  ...patch
});

const source = (): IAdminControlledEventHistoryRecord[] => [
  event(),
  event({
    id: 3,
    auditKey: 'AUDIT-003',
    eventType: 'QuarterApproved',
    subjectKey: 'QR|PERSON-001|2026|Q2',
    quarter: 'Q2',
    actorEmail: 'system.admin@example.invalid',
    actorRole: 'SystemAdmin',
    eventAt: '2026-07-20T14:00:00.000Z',
    afterJson: JSON.stringify({ State: 'Approved', Status: 'Green' }),
    correlationKey: 'CORR-003'
  }),
  event({
    id: 2,
    auditKey: 'AUDIT-002',
    eventType: 'AdminConfigChanged',
    subjectKey: 'CONFIG|PerformanceYear.End',
    performanceYear: 2025,
    quarter: undefined,
    actorEmail: 'admin.two@example.invalid',
    actorRole: 'SeniorManagerAdmin',
    eventAt: '2026-07-20T14:00:00.000Z',
    beforeJson: undefined,
    afterJson: JSON.stringify({ state: 'Active', status: 'Valid' }),
    correlationKey: 'CORR-002'
  })
];

describe('Admin event history investigation domain', () => {
  let capability: IAuthoritativeAdminEventHistoryCapability;

  beforeAll(async () => {
    capability = await issueCapability();
  });

  it('authorises only through authoritative signed-in People readback and returns the exact read-only physical view', () => {
    const view = investigateAdminEventHistory(capability, source());

    expect(view).toEqual(expect.objectContaining({
      mode: 'ReadOnly',
      editAllowed: false,
      deleteAllowed: false,
      sourceList: 'KCFKPI_Audit',
      authorisationSource: 'AuthoritativePeopleReadback',
      ordering: 'EventAtDescendingThenAuditKeyAscending'
    }));
    expect(view.allEvents.map(row => row.auditKey)).toEqual(['AUDIT-002', 'AUDIT-003', 'AUDIT-001']);
    expect(view.allEvents[1]).toEqual(expect.objectContaining({
      eventType: 'QuarterApproved',
      actorEmail: 'system.admin@example.invalid',
      state: 'Approved',
      status: 'Green',
      performanceYear: 2026,
      quarter: 'Q2'
    }));
  });

  it('filters by exact actor identity without changing stable ordering', () => {
    const view = investigateAdminEventHistory(capability, source(), {
      actors: ['SYSTEM.ADMIN@example.invalid']
    });
    expect(view.filteredEvents.map(row => row.auditKey)).toEqual(['AUDIT-003']);
  });

  it('filters by state and status values already stored in event JSON', () => {
    expect(investigateAdminEventHistory(capability, source(), {
      states: ['approved']
    }).filteredEvents.map(row => row.auditKey)).toEqual(['AUDIT-003']);

    expect(investigateAdminEventHistory(capability, source(), {
      statuses: ['READY']
    }).filteredEvents.map(row => row.auditKey)).toEqual(['AUDIT-001']);
  });

  it('filters the physical performance-year and quarter period deterministically', () => {
    const view = investigateAdminEventHistory(capability, source(), {
      performanceYears: [2026],
      quarters: ['Q2']
    });
    expect(view.filteredEvents.map(row => row.auditKey)).toEqual(['AUDIT-003']);
    expect(view.filterOptions).toEqual({
      actors: ['admin.one@example.invalid', 'admin.two@example.invalid', 'system.admin@example.invalid'],
      states: ['Active', 'Approved', 'Submitted'],
      statuses: ['Green', 'Ready', 'Valid'],
      performanceYears: [2026, 2025],
      quarters: ['Q1', 'Q2']
    });
  });

  it('keeps the source untouched and freezes the returned history, records, filters and options', () => {
    const records = source();
    const before = JSON.stringify(records);
    const filters: IAdminEventHistoryFilters = { actors: ['admin.one@example.invalid'] };
    const view = investigateAdminEventHistory(capability, records, filters);

    expect(JSON.stringify(records)).toBe(before);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.allEvents)).toBe(true);
    expect(Object.isFrozen(view.allEvents[0])).toBe(true);
    expect(Object.isFrozen(view.filteredEvents)).toBe(true);
    expect(Object.isFrozen(view.filters)).toBe(true);
    expect(Object.isFrozen(view.filters.actors)).toBe(true);
    expect(Object.isFrozen(view.filterOptions)).toBe(true);
    expect(Object.isFrozen(view.filterOptions.actors)).toBe(true);

    expect(() => { (view.allEvents as IAdminControlledEventHistoryRecord[]).push(event({ id: 9 })); }).toThrow();
    expect(() => { (view.allEvents[0] as { actorEmail: string }).actorEmail = 'changed@example.invalid'; }).toThrow();
    expect(view.allEvents[0].actorEmail).toBe('admin.two@example.invalid');
  });

  it('rejects a forged role-shaped capability before inspecting protected event data', () => {
    const protectedSource = new Proxy(source(), {
      get: () => { throw new Error('PROTECTED_SOURCE_WAS_INSPECTED'); }
    });
    const forged = {
      actorEmail: adminEmail,
      personKey: 'ADMIN-001',
      authorisationSource: 'AuthoritativePeopleReadback'
    } as IAuthoritativeAdminEventHistoryCapability;

    expect(() => investigateAdminEventHistory(forged, protectedSource)).toThrow(/opaque capability/);
  });

  it('does not export a caller-accessible capability issuer at the compiled module boundary', () => {
    expect(Object.keys(EventHistoryAuthorityApi).sort()).toEqual(['isAuthoritativeAdminEventHistoryCapability']);
    expect((EventHistoryAuthorityApi as Record<string, unknown>)
      .issueAdminEventHistoryCapabilityAfterPeopleReadback).toBeUndefined();
  });

  it('rejects a copied view before the UI can refilter or disclose it', () => {
    const authorised = investigateAdminEventHistory(capability, source());
    expect(() => filterAuthorisedAdminEventHistoryView({ ...authorised }))
      .toThrow(/already-authorised read-only view/);
  });

  it('accepts the shared narrow KPI remediation event emitted by ADM-003', () => {
    const view = investigateAdminEventHistory(capability, [event({ eventType: 'KpiRemediated' })]);
    expect(view.allEvents[0].eventType).toBe('KpiRemediated');
  });

  it('fails closed for malformed or unsupported source records', () => {
    expect(() => investigateAdminEventHistory(capability, [event({ id: 0 })])).toThrow(/positive physical item ID/);
    expect(() => investigateAdminEventHistory(capability, [event({ auditKey: ' ' })])).toThrow(/AuditKey/);
    expect(() => investigateAdminEventHistory(capability, [event({ eventType: 'UnexpectedAdminEvent' as never })]))
      .toThrow(/does not support EventType/);
    expect(() => investigateAdminEventHistory(capability, [event({ eventAt: 'not-a-date' })])).toThrow(/EventAt/);
    expect(() => investigateAdminEventHistory(capability, [event({ quarter: 'Q5' as never })])).toThrow(/Quarter/);
    expect(() => investigateAdminEventHistory(capability, [event({ afterJson: '{bad json' })])).toThrow(/valid JSON/);
    expect(() => investigateAdminEventHistory(capability, [event({ afterJson: JSON.stringify({ status: 7 }) })]))
      .toThrow(/status to be a non-blank string/);
  });

  it('rejects an ordinary unsupported event type with a generic diagnostic and no supplied value', () => {
    const rejectedType = 'OrdinaryUnrecognisedEvent';
    const investigate = (): unknown => investigateAdminEventHistory(capability, [event({ eventType: rejectedType as never })]);
    expect(investigate).toThrow(new Error('Admin event history does not support EventType.'));
    expect(investigate).not.toThrow(rejectedType);
  });

  it.each([
    '0',
    '2026-04-10T09:30:00.000',
    '2026-04-10T10:30:00.000+01:00',
    '2026-02-30T09:30:00.000Z',
    '2026-04-10T09:30:00Z'
  ])('rejects non-canonical EventAt %s', invalid => {
    expect(() => investigateAdminEventHistory(capability, [event({ eventAt: invalid })]))
      .toThrow(/canonical millisecond-precision UTC timestamp/);
  });

  it('fails closed for duplicate stable identities and malformed filters', () => {
    expect(() => investigateAdminEventHistory(capability, [
      event(),
      event({ id: 2 })
    ])).toThrow(/unique physical IDs and AuditKeys/);
    expect(() => investigateAdminEventHistory(capability, [
      event(),
      event({ auditKey: 'AUDIT-999' })
    ])).toThrow(/unique physical IDs and AuditKeys/);
    expect(() => investigateAdminEventHistory(capability, source(), {
      actors: ['Admin@One.invalid', 'admin@one.invalid']
    })).toThrow(/duplicate value/);
    expect(() => investigateAdminEventHistory(capability, source(), {
      performanceYears: [1999]
    })).toThrow(/PerformanceYear filter/);
    expect(() => investigateAdminEventHistory(capability, source(), {
      quarters: ['Q5' as never]
    })).toThrow(/Quarter filter/);
  });
});
