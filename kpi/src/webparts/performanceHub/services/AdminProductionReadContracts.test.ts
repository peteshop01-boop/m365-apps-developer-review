jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'admin-read-contract-guid' }) }
}));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import type { ICoreKpiCatalogueItem, IProductionPerson } from '../models/ProductionModels';
import SharePointProductionDataService, {
  resolveAuthoritativeAdminKpiRemediationIssues
} from './SharePointProductionDataService';
import { isAuthoritativeAdminEventHistoryCapability } from './AdminEventHistoryAuthority';
import * as EventHistoryAuthorityApi from './AdminEventHistoryAuthority';
import {
  ADMIN_TEAMS_SELECT,
  PEOPLE_SELECT,
  PRODUCTION_QUERY_FIELD_CONTRACTS,
  assertProductionQueryFields
} from './ProductionQueryFieldContracts';
import { ADMIN_CONFIG_AUDIT_EXPAND, ADMIN_CONFIG_AUDIT_SELECT } from './AdminConfigProductionAdapter';

const site = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const email = 'person003@example.invalid';
const actor: IProductionPerson = {
  id: 1,
  personKey: 'ADMIN-001',
  displayName: 'Synthetic authorised Admin',
  email,
  appRoles: ['SystemAdmin'],
  active: true
};

const personRow = (roles: readonly string[] = ['SystemAdmin']): object => ({
  Id: 1,
  PersonKey: 'ADMIN-001',
  Title: 'Synthetic authorised Admin',
  Email: email,
  ManagerPersonKey: undefined,
  ManagerEmail: undefined,
  Team: undefined,
  JobRole: 'Synthetic Admin',
  AppRoles: roles,
  Active: true
});

const response = (data: unknown): SPHttpClientResponse => ({
  ok: true,
  status: 200,
  json: async () => data,
  text: async () => JSON.stringify(data)
} as unknown as SPHttpClientResponse);

const clientFor = (...collections: readonly object[][]): { client: SPHttpClient; get: jest.Mock; post: jest.Mock } => {
  const pending = collections.slice();
  const get = jest.fn(async () => response({ value: pending.shift() || [] }));
  const post = jest.fn();
  return { client: { get, post } as unknown as SPHttpClient, get, post };
};

const decodedUrls = (get: jest.Mock): string[] => get.mock.calls.map(call => decodeURIComponent(String(call[0])));

const historyRow = (id: number, patch: Record<string, unknown> = {}): object => ({
  Id: id, AuditKey: `SYN-AUDIT-${id}`, EventType: 'WorkplanApproved', SubjectType: 'Workplan',
  SubjectKey: `SYN-WORKPLAN-${id}`, PerformanceYear: 2026, Quarter: undefined,
  ActorEmail: email, ActorRole: 'SystemAdmin', EventAt: '2026-09-30T10:00:00.000Z',
  Reason: 'Synthetic test', BeforeJSON: '{"State":"Submitted"}', AfterJSON: '{"State":"Approved"}',
  CorrelationKey: `SYN-CORR-${id}`, Source: 'SPFx', SourceReference: 'SYN-REF', Success: true,
  ...patch
});

describe('KCF-KPI-020A Admin production read adapters and query contracts', () => {
  it.each(['Quarter', 'Reason', 'BeforeJSON', 'AfterJSON', 'SourceReference'])
  ('accepts legitimate REST null %s absence alongside a valid row', async field => {
    const mock = clientFor([personRow()], [historyRow(1, { [field]: null }), historyRow(2)]);
    const service = new SharePointProductionDataService(mock.client, site, email);
    const view = await service.getAuthoritativeAdminEventHistoryView(2026);
    expect(view.allEvents).toHaveLength(2);
    expect(view.allEvents[0].quarter).toBeUndefined();
    expect(mock.post).not.toHaveBeenCalled();
  });

  it.each([
    { Quarter: 42 }, { Reason: 42 }, { BeforeJSON: '{' }, { AfterJSON: '[]' }, { SourceReference: 42 },
    { AuditKey: null }, { Success: null }, { EventType: 'UnknownEvent' },
    { EventAt: '2026-09-30T10:00:00+00:00' }, { PerformanceYear: 2025 }
  ])('rejects malformed non-null optional or required data %p without a partial view', async patch => {
    const mock = clientFor([personRow()], [historyRow(1), historyRow(2, patch)]);
    const service = new SharePointProductionDataService(mock.client, site, email);
    await expect(service.getAuthoritativeAdminEventHistoryView(2026)).rejects.toThrow();
    expect(mock.post).not.toHaveBeenCalled();
  });

  it.each([0, 499, 500, 501, 1000, 5000])('returns a complete terminal collection of %s rows', async total => {
    const auditUrl = `${site}/_api/web/lists/getbytitle('KCFKPI_Audit')/items`;
    const pages: object[] = [];
    for (let offset = 0; offset < total || (offset === 0 && total === 0); offset += 500) {
      const value = Array.from({ length: Math.min(500, total - offset) }, (_, index) => historyRow(offset + index + 1));
      pages.push(offset + 500 < total ? { value, '@odata.nextLink': `${auditUrl}?$skiptoken=${offset + 500}` } : { value });
    }
    const get = jest.fn().mockResolvedValueOnce(response({ value: [personRow()] }));
    pages.forEach(page => get.mockResolvedValueOnce(response(page)));
    const post = jest.fn();
    const service = new SharePointProductionDataService({ get, post } as unknown as SPHttpClient, site, email);
    const view = await service.getAuthoritativeAdminEventHistoryView(2026);
    expect(view.allEvents).toHaveLength(total);
    expect(get).toHaveBeenCalledTimes(pages.length + 1);
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['oversized', 'capacity-continuation', '5001', 'repeated', 'cross-source', 'invalid', 'malformed', 'empty-continuation'])
  ('rejects %s pages without returning partial history', async variant => {
    const auditUrl = `${site}/_api/web/lists/getbytitle('KCFKPI_Audit')/items`;
    const link = `${auditUrl}?$skiptoken=next`;
    const page = (offset: number): object[] => Array.from({ length: 500 }, (_, index) => historyRow(offset + index + 1));
    let pages: object[];
    if (variant === 'oversized') pages = [{ value: [...page(0), historyRow(501)] }];
    else if (variant === 'capacity-continuation' || variant === '5001') {
      pages = Array.from({ length: 10 }, (_, index) => ({ value: page(index * 500),
        'odata.nextLink': `${auditUrl}?$skiptoken=${index + 1}` }));
      if (variant === '5001') pages.push({ value: [historyRow(5001)] });
    } else if (variant === 'repeated') pages = [{ value: [historyRow(1)], 'odata.nextLink': link },
      { value: [historyRow(2)], 'odata.nextLink': link }];
    else if (variant === 'cross-source') pages = [{ value: [historyRow(1)], 'odata.nextLink': `${site}/_api/web/lists/other/items?next=1` }];
    else if (variant === 'invalid') pages = [{ value: [historyRow(1)], 'odata.nextLink': 42 }];
    else if (variant === 'malformed') pages = [{ value: [historyRow(1)], 'odata.nextLink': link }, { value: 'invalid' }];
    else pages = [{ value: [], 'odata.nextLink': link }];
    const get = jest.fn().mockResolvedValueOnce(response({ value: [personRow()] }));
    pages.forEach(item => get.mockResolvedValueOnce(response(item)));
    const post = jest.fn();
    const service = new SharePointProductionDataService({ get, post } as unknown as SPHttpClient, site, email);
    await expect(service.getAuthoritativeAdminEventHistoryView(2026)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('reads and maps People through only the approved physical People fields', async () => {
    const secondPerson = {
      Id: 2, PersonKey: 'PERSON-002', Title: 'Synthetic employee', Email: 'person.002@example.invalid',
      ManagerPersonKey: 'ADMIN-001', ManagerEmail: email, Team: 'TEAM-01', JobRole: 'Synthetic role',
      AppRoles: ['Employee'], Active: true
    };
    const mock = clientFor([personRow()], [personRow(), secondPerson]);
    const service = new SharePointProductionDataService(mock.client, site, email);

    const result = await service.getAdminPeople(actor);

    expect(result).toEqual([
      expect.objectContaining({ id: 1, personKey: 'ADMIN-001', appRoles: ['SystemAdmin'] }),
      expect.objectContaining({
        id: 2, personKey: 'PERSON-002', displayName: 'Synthetic employee',
        managerPersonKey: 'ADMIN-001', managerEmail: email, team: 'TEAM-01', appRoles: ['Employee']
      })
    ]);
    expect(PEOPLE_SELECT.split(',')).toEqual(PRODUCTION_QUERY_FIELD_CONTRACTS.people.requiredFields);
    expect(decodedUrls(mock.get)[1]).toContain("getbytitle('KCFKPI_People')/items?$select=" + PEOPLE_SELECT);
    expect(decodedUrls(mock.get)[1]).toContain('$filter=Id gt 0&$orderby=Title&$top=500');
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('reads and maps the separately provisioned Teams dimension without inferring it from hierarchy', async () => {
    const mock = clientFor([personRow()], [{
      Id: 7,
      TeamKey: 'TEAM-APPROVED',
      TeamName: 'Approved Team',
      TeamLeadPersonKey: 'ADMIN-001',
      Active: true,
      SortOrder: 20
    }]);
    const service = new SharePointProductionDataService(mock.client, site, email);

    await expect(service.getAdminTeams(actor)).resolves.toEqual([{
      id: 7,
      teamKey: 'TEAM-APPROVED',
      teamName: 'Approved Team',
      teamLeadPersonKey: 'ADMIN-001',
      active: true,
      sortOrder: 20
    }]);
    expect(ADMIN_TEAMS_SELECT.split(',')).toEqual(PRODUCTION_QUERY_FIELD_CONTRACTS.teams.requiredFields);
    expect(decodedUrls(mock.get)[1]).toContain("getbytitle('KCFKPI_Teams')/items?$select=" + ADMIN_TEAMS_SELECT);
    expect(decodedUrls(mock.get)[1]).toContain('$filter=Id gt 0&$orderby=SortOrder,TeamName&$top=500');
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('reads typed Config with built-in Modified/Editor audit metadata and no write call', async () => {
    const mock = clientFor([personRow()], [{
      Id: 9,
      '@odata.etag': '"9"',
      ConfigKey: 'RAG.GreenThreshold',
      ValueType: 'Number',
      NumberValue: 90,
      Environment: 'Production',
      Active: true,
      ChangeReference: 'KCF-KPI-CFG-009',
      Modified: '2026-08-22T09:30:00Z',
      Editor: { EMail: 'person016@example.invalid', Title: 'Config Owner' }
    }]);
    const service = new SharePointProductionDataService(mock.client, site, email);

    await expect(service.getAdminConfigRecords(actor)).resolves.toEqual([
      expect.objectContaining({
        id: 9,
        etag: '"9"',
        key: 'RAG.GreenThreshold',
        environment: 'Production',
        changeReference: 'KCF-KPI-CFG-009',
        valueType: 'Number',
        numberValue: 90,
        modifiedAt: '2026-08-22T09:30:00Z',
        modifiedBy: 'person016@example.invalid'
      })
    ]);
    expect(() => assertProductionQueryFields(
      'KCFKPI_Config', ADMIN_CONFIG_AUDIT_SELECT, "Environment eq 'Production'", 'ConfigKey'
    )).not.toThrow();
    expect(decodedUrls(mock.get)[1]).toContain("getbytitle('KCFKPI_Config')/items?$select=" + ADMIN_CONFIG_AUDIT_SELECT);
    expect(decodedUrls(mock.get)[1]).toContain(`$expand=${ADMIN_CONFIG_AUDIT_EXPAND}`);
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('fails closed after authoritative People readback when the current role is ordinary Employee', async () => {
    const mock = clientFor([personRow(['Employee'])]);
    const service = new SharePointProductionDataService(mock.client, site, email);

    await expect(service.getAdminTeams(actor)).rejects.toThrow('does not carry an authorised Admin application role');
    expect(mock.get).toHaveBeenCalledTimes(1);
    expect(decodedUrls(mock.get)[0]).toContain("getbytitle('KCFKPI_People')");
    expect(mock.post).not.toHaveBeenCalled();
  });

  it('issues event-history capability only from authoritative People readback and rejects copied objects', async () => {
    const authorisedMock = clientFor([personRow()]);
    const authorised = new SharePointProductionDataService(authorisedMock.client, site, email);
    const capability = await authorised.getAuthoritativeAdminEventHistoryCapability();

    expect(capability).toEqual({
      actorEmail: email,
      personKey: 'ADMIN-001',
      authorisationSource: 'AuthoritativePeopleReadback'
    });
    expect(Object.isFrozen(capability)).toBe(true);
    expect(isAuthoritativeAdminEventHistoryCapability(capability)).toBe(true);
    expect(isAuthoritativeAdminEventHistoryCapability({ ...capability })).toBe(false);
    expect(authorisedMock.get).toHaveBeenCalledTimes(1);
    expect(Object.keys(EventHistoryAuthorityApi)).toEqual(['isAuthoritativeAdminEventHistoryCapability']);

    const employeeMock = clientFor([personRow(['Employee'])]);
    const employee = new SharePointProductionDataService(employeeMock.client, site, email);
    await expect(employee.getAuthoritativeAdminEventHistoryCapability())
      .rejects.toThrow('exactly one active SystemAdmin identity');
    expect(employeeMock.get).toHaveBeenCalledTimes(1);
  });

  it('reads all controlled Audit pages for the bound year and returns an opaque frozen view', async () => {
    const auditUrl = `${site}/_api/web/lists/getbytitle('KCFKPI_Audit')/items`;
    const get = jest.fn()
      .mockResolvedValueOnce(response({ value: [personRow()] }))
      .mockResolvedValueOnce(response({ value: [historyRow(1)], 'odata.nextLink': `${auditUrl}?$skiptoken=Paged%3DTRUE%26p_ID%3D1` }))
      .mockResolvedValueOnce(response({ value: [historyRow(2)] }));
    const service = new SharePointProductionDataService({ get, post: jest.fn() } as unknown as SPHttpClient, site, email);
    const view = await service.getAuthoritativeAdminEventHistoryView(2026);
    expect(view.mode).toBe('ReadOnly');
    expect(Object.isFrozen(view)).toBe(true);
    expect(view.allEvents).toHaveLength(2);
    expect(view.allEvents[0]).toEqual(expect.objectContaining({ state: 'Approved', performanceYear: 2026 }));
    expect(decodedUrls(get)[1]).toContain("getbytitle('KCFKPI_Audit')/items?$select=");
    expect(decodedUrls(get)[1]).toContain('$filter=PerformanceYear eq 2026&$orderby=Id asc&$top=500');
    expect(get).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['KPIAdmin', [personRow(['KPIAdmin'])]],
    ['inactive', [{ ...personRow(), Active: false }]],
    ['missing', []]
  ])('denies %s before protected Audit access', async (_name, people) => {
    const mock = clientFor(people);
    const service = new SharePointProductionDataService(mock.client, site, email);
    await expect(service.getAuthoritativeAdminEventHistoryView(2026)).rejects.toThrow();
    expect(decodedUrls(mock.get)).toHaveLength(1);
    expect(decodedUrls(mock.get)[0]).toContain("getbytitle('KCFKPI_People')");
  });

  it('rejects a malformed controlled row and an out-of-year row without a partial view', async () => {
    for (const patch of [{ EventAt: '0' }, { PerformanceYear: 2025 }]) {
      const mock = clientFor([personRow()], [historyRow(1, patch)]);
      const service = new SharePointProductionDataService(mock.client, site, email);
      await expect(service.getAuthoritativeAdminEventHistoryView(2026)).rejects.toThrow();
    }
  });

  it('reports an Audit read error without treating it as an empty successful view', async () => {
    const get = jest.fn().mockResolvedValueOnce(response({ value: [personRow()] }))
      .mockResolvedValueOnce({ ok: false } as SPHttpClientResponse);
    const service = new SharePointProductionDataService({ get, post: jest.fn() } as unknown as SPHttpClient, site, email);
    await expect(service.getAuthoritativeAdminEventHistoryView(2026)).rejects.toThrow('Controlled Admin event history could not load');
  });

  it.each([
    ['ordinary Employee', { AppRoles: ['Employee'] }],
    ['Senior Manager Admin', { AppRoles: ['SeniorManagerAdmin'] }],
    ['inactive SystemAdmin', { Active: false }],
    ['blank PersonKey', { PersonKey: ' ' }],
    ['mismatched email readback', { Email: 'different.admin@example.invalid' }]
  ])('rejects %s before issuing event-history authority', async (_label, patch) => {
    const mock = clientFor([{ ...personRow(), ...patch }]);
    const service = new SharePointProductionDataService(mock.client, site, email);

    await expect(service.getAuthoritativeAdminEventHistoryCapability())
      .rejects.toThrow('exactly one active SystemAdmin identity');
    expect(mock.get).toHaveBeenCalledTimes(1);
  });

  it('rejects missing or duplicate exact-email People readback before issuing event-history authority', async () => {
    const missingMock = clientFor([]);
    const missing = new SharePointProductionDataService(missingMock.client, site, email);
    await expect(missing.getAuthoritativeAdminEventHistoryCapability())
      .rejects.toThrow('exactly one active SystemAdmin identity');

    const duplicateMock = clientFor([personRow(), { ...personRow(), Id: 2, PersonKey: 'ADMIN-002' }]);
    const duplicate = new SharePointProductionDataService(duplicateMock.client, site, email);
    await expect(duplicate.getAuthoritativeAdminEventHistoryCapability())
      .rejects.toThrow('More than one production People record matches this email');
  });

  it.each([
    // eslint-disable-next-line @rushstack/no-new-null -- Legacy People readback may contain an ordinary null field.
    ['Email', null],
    ['Email', undefined],
    ['Email', 42],
    // eslint-disable-next-line @rushstack/no-new-null -- Legacy People readback may contain an ordinary null field.
    ['PersonKey', null],
    ['PersonKey', undefined],
    ['PersonKey', 42],
    ['Email', ' '],
    ['PersonKey', ' ']
  ])('rejects invalid authoritative %s identity %s generically before either capability or protected read', async (field, value) => {
    for (const route of ['history', 'remediation']) {
      const mock = clientFor([{ ...personRow(), [String(field)]: value }]);
      const service = new SharePointProductionDataService(mock.client, site, email);
      const protectedRead = jest.spyOn(service, 'getCoreKpiCatalogue').mockResolvedValue([]);
      const result = route === 'history'
        ? service.getAuthoritativeAdminEventHistoryCapability()
        : service.getAuthoritativeAdminKpiRemediationQueueCapability(2026);

      await expect(result).rejects.toThrow(new Error(
        'The signed-in People readback does not resolve to exactly one active SystemAdmin identity.'
      ));
      expect(mock.get).toHaveBeenCalledTimes(1);
      expect(decodedUrls(mock.get)[0]).toContain("getbytitle('KCFKPI_People')");
      expect(mock.post).not.toHaveBeenCalled();
      expect(protectedRead).not.toHaveBeenCalled();
    }
  });

  it('preserves normalised bound identities and opaque capability provenance on both valid routes', async () => {
    for (const route of ['history', 'remediation']) {
      const mock = clientFor([{ ...personRow(), Email: ` ${email.toUpperCase()} `, PersonKey: ' ADMIN-001 ' }]);
      const service = new SharePointProductionDataService(mock.client, site, email);
      jest.spyOn(service, 'getCoreKpiCatalogue').mockResolvedValue([]);
      const capability = route === 'history'
        ? await service.getAuthoritativeAdminEventHistoryCapability()
        : await service.getAuthoritativeAdminKpiRemediationQueueCapability(2026);

      expect(capability.actorEmail).toBe(email.toUpperCase());
      expect(capability.personKey).toBe('ADMIN-001');
      expect(Object.isFrozen(capability)).toBe(true);
      if (route === 'history') {
        expect(isAuthoritativeAdminEventHistoryCapability(capability)).toBe(true);
        expect(isAuthoritativeAdminEventHistoryCapability({ ...capability })).toBe(false);
      } else {
        expect(resolveAuthoritativeAdminKpiRemediationIssues(capability).authoritativeActorEmail).toBe(email.toUpperCase());
        expect(() => resolveAuthoritativeAdminKpiRemediationIssues({ ...capability })).toThrow(/opaque authoritative/);
      }
      expect(mock.post).not.toHaveBeenCalled();
    }
  });

  it('binds remediation authority to a production-derived KPI issue queue and rejects copied capabilities', async () => {
    const mock = clientFor([personRow()]);
    const service = new SharePointProductionDataService(mock.client, site, email);
    const catalogue: ICoreKpiCatalogueItem[] = [{
      kpiId: 'SYN-001',
      kpiVersionKey: 'SYN-001-2026-v1',
      targetVersionKey: 'SYN-001-2026-target-v1',
      wording: 'Synthetic KPI',
      pillar: 'Synthetic pillar',
      workstream: 'Synthetic workstream',
      accountableOwnerEmail: 'old.owner@example.invalid',
      scoringDirection: 'HigherIsBetter',
      metricType: 'Count',
      unitLabel: 'Count',
      classificationSource: 'Controlled owner register row 17',
      ownerSourceCode: 'UNKNOWN',
      dataQualityFlags: 'Unknown owner code',
      kpiWeightWithinWorkstream: 100,
      yearEndTargetValue: 1,
      q1TargetValue: 1,
      q2TargetValue: 1,
      q3TargetValue: 1,
      q4TargetValue: 1
    }];
    jest.spyOn(service, 'getCoreKpiCatalogue').mockResolvedValue(catalogue);

    const capability = await service.getAuthoritativeAdminKpiRemediationQueueCapability(2026);
    expect(capability).toEqual(expect.objectContaining({
      actorEmail: email,
      personKey: 'ADMIN-001',
      performanceYear: 2026,
      issueCount: 1,
      sourceList: 'KCFKPI_KPIMaster',
      authorisationSource: 'AuthoritativeKpiDataQualityReadback'
    }));
    const issues = resolveAuthoritativeAdminKpiRemediationIssues(capability);
    expect(issues.authoritativeActorEmail).toBe(email);
    expect(issues).toEqual([expect.objectContaining({
      issueKey: 'KPI|SYN-001|UNKNOWN_OWNER_CODE',
      status: 'ControlDecisionRequired',
      sourceReference: 'Controlled owner register row 17'
    })]);
    expect(Object.isFrozen(capability)).toBe(true);
    expect(Object.isFrozen(issues)).toBe(true);
    expect(Object.isFrozen(issues[0])).toBe(true);
    expect(() => resolveAuthoritativeAdminKpiRemediationIssues({ ...capability }))
      .toThrow(/opaque authoritative queue readback capability/);
  });
});
