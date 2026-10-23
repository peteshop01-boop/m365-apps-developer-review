jest.mock('@microsoft/sp-http', () => ({
  SPHttpClient: { configurations: { v1: {} } }
}));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import SharePointAdminReportingControlDataService, {
  ADMIN_ANNUAL_TARGET_SELECT,
  ADMIN_AUDIT_VIEW_SELECT,
  ADMIN_BEHAVIOUR_DEFINITION_SELECT,
  ADMIN_KPI_MASTER_SELECT,
  ADMIN_OFFICIAL_RESULT_SELECT,
  ADMIN_ORGANISATIONAL_WEIGHT_SELECT,
  ADMIN_OUTPUT_DEFINITION_SELECT,
  ADMIN_REPORTING_MAP_SELECT
} from './SharePointAdminReportingControlDataService';

const site = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const email = 'person003@example.invalid';
const dayMs = 24 * 60 * 60 * 1000;

type RowsByList = Readonly<Record<string, readonly object[]>>;

interface IServiceClientMock {
  client: SPHttpClient;
  get: jest.Mock;
  post: jest.Mock;
  fetch: jest.Mock;
  put: jest.Mock;
  patch: jest.Mock;
  deleteRequest: jest.Mock;
}

const response = (data: unknown, status: number = 200): SPHttpClientResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data)
} as unknown as SPHttpClientResponse);

const listFromUrl = (url: string): string => {
  const match = /getbytitle\('([^']+)'\)/.exec(decodeURIComponent(url));
  if (!match) throw new Error(`Unexpected SharePoint URL: ${url}`);
  return match[1];
};

const clientFor = (
  rowsByList: RowsByList,
  missingLists: readonly string[] = []
): IServiceClientMock => {
  const get = jest.fn(async (url: string) => {
    const list = listFromUrl(url);
    if (missingLists.indexOf(list) >= 0) return response({}, 404);
    return response({ value: rowsByList[list] || [] });
  });
  const post = jest.fn();
  const fetch = jest.fn();
  const put = jest.fn();
  const patch = jest.fn();
  const deleteRequest = jest.fn();
  return {
    client: { get, post, fetch, put, patch, delete: deleteRequest } as unknown as SPHttpClient,
    get,
    post,
    fetch,
    put,
    patch,
    deleteRequest
  };
};

const adminRow = (roles: readonly string[] | { results: readonly string[] } = { results: ['SystemAdmin'] }): object => ({
  Email: email,
  AppRoles: roles,
  Active: true
});

const emptyRows = (people: readonly object[] = [adminRow()]): RowsByList => ({
  KCFKPI_People: people,
  KCFKPI_Config: [],
  KCFKPI_KPIMaster: [],
  KCFKPI_AnnualTargets: [],
  KCFKPI_Behaviours: [],
  KCFKPI_OrganisationalWeights: [],
  KCFKPI_ReportingMap: [],
  KCFKPI_OutputDefinitions: [],
  KCFKPI_KPIResults: [],
  KCFKPI_Audit: []
});

const decodedUrls = (get: jest.Mock): string[] => get.mock.calls
  .map(call => decodeURIComponent(String(call[0])));

const urlForList = (get: jest.Mock, list: string): string => {
  const url = decodedUrls(get).find(candidate => candidate.indexOf(`getbytitle('${list}')`) >= 0);
  if (!url) throw new Error(`No GET was made for ${list}.`);
  return url;
};

const expectNoWriteVerb = (mock: IServiceClientMock): void => {
  expect(mock.post).not.toHaveBeenCalled();
  expect(mock.fetch).not.toHaveBeenCalled();
  expect(mock.put).not.toHaveBeenCalled();
  expect(mock.patch).not.toHaveBeenCalled();
  expect(mock.deleteRequest).not.toHaveBeenCalled();
};

afterEach(() => {
  jest.useRealTimers();
});

describe('KCF-KPI-020B SharePoint Admin Reporting Control read service', () => {
  it('authorises first and resolves the current numeric year from the accepted PerformanceYear.End Date record', async () => {
    const rows: RowsByList = {
      ...emptyRows(),
      KCFKPI_Config: [{
        DateValue: '2026-10-31T00:00:00Z',
        ValueType: 'Date'
      }]
    };
    const mock = clientFor(rows);
    const service = new SharePointAdminReportingControlDataService(mock.client, site, email);

    const snapshot = await service.getAdminReportingControlSnapshot();

    expect(snapshot.performanceYear).toBe(2026);
    const urls = decodedUrls(mock.get);
    expect(urls[0]).toContain("getbytitle('KCFKPI_People')");
    const configUrl = urlForList(mock.get, 'KCFKPI_Config');
    expect(configUrl).toContain('$select=DateValue,ValueType');
    expect(configUrl).toContain("$filter=ConfigKey eq 'PerformanceYear.End' and Active eq 1");
    expectNoWriteVerb(mock);
  });

  it('rechecks the exact current People Admin and maps every production dataset through GET only', async () => {
    const rows: RowsByList = {
      KCFKPI_People: [adminRow()],
      KCFKPI_KPIMaster: [{
        Id: 11,
        KPIID: 'SO1-001',
        KPIVersionKey: 'SO1-001|v01',
        KPIWording: 'Synthetic controlled KPI',
        Pillar: 'SO1',
        Workstream: 'Participation',
        AccountableOwnerPersonKey: 'PERSON-001',
        AccountableOwnerEmail: 'owner@example.invalid',
        DefinitionStatus: 'Active',
        AggregationMethod: 'DirectMetric',
        ScoringDirection: 'HigherIsBetter',
        MetricType: 'Count',
        UnitLabel: 'programmes',
        ReportingStatus: 'Included',
        SourceOrigin: 'KPI GOLD',
        ChangeReference: 'CONTROL-020B',
        Modified: '2026-08-21T09:00:00Z',
        Editor: { EMail: 'editor@example.invalid' }
      }],
      KCFKPI_AnnualTargets: [{
        Id: 21,
        KPIID: 'so1-001',
        PerformanceYear: 2026,
        TargetVersionKey: 'SO1-001|2026|v01',
        YearEndTargetValue: 0,
        Q1TargetText: 'Stage one',
        Q2TargetValue: 2,
        Q3TargetValue: 3,
        Q4TargetValue: 4,
        TargetStatus: 'Approved',
        ApprovedByEmail: 'approver@example.invalid',
        Modified: '2026-08-21T10:00:00Z',
        Editor: { Title: 'Target Editor' }
      }],
      KCFKPI_Behaviours: [{
        Id: 31,
        BehaviourID: 'B01',
        BehaviourVersionKey: 'B01|v01',
        Title: 'We act with integrity',
        Description: 'Synthetic published definition',
        AssessmentGuidance: '1. Prompt one\n2) Prompt two\nSupporting guidance is not a prompt.',
        Status: 'Published',
        IsCurrent: true,
        Modified: '2026-08-21T11:00:00Z',
        Editor: { EMail: 'behaviour.editor@example.invalid' }
      }],
      KCFKPI_OrganisationalWeights: [{
        OrganisationalWeightKey: '2026|v01|KPIWithinWorkstream|SO1|Participation|SO1-001',
        WeightGroupKey: '2026|v01|KPIWithinWorkstream|SO1|Participation',
        PerformanceYear: 2026,
        WeightLevel: 'KPIWithinWorkstream',
        ParentKey: 'SO1|Participation',
        ChildKey: 'SO1-001',
        WeightPercent: 100,
        Active: true,
        ApprovalStatus: 'Approved',
        EffectiveFrom: '2026-04-01',
        Version: 'v01',
        ApprovalReference: 'CONTROL-020B',
        Source: 'CONTROL fixture',
        HistoricSnapshotLocked: false
      }],
      KCFKPI_ReportingMap: [{
        Id: 41,
        ReportingMapVersionKey: 'SO1-001|MAIN_CWOP|v01',
        ReportingMapNaturalKey: 'SO1-001|MAIN_CWOP',
        KPIID: 'SO1-001',
        OutputCode: 'MAIN_CWOP',
        ExternalKey: 'PARTICIPATION.PROGRAMMES',
        AllocationPct: 60,
        Treatment: 'Allocated',
        TreatmentRuleJSON: '{"basis":"headcount"}',
        ReportingCadence: 'Quarterly',
        EffectiveFrom: '2026-04-01',
        Status: 'Active',
        VersionNumber: 1,
        ChangeReference: 'CONTROL-020B',
        ApprovedByEmail: 'mapping.approver@example.invalid',
        ApprovedAt: '2026-03-31T12:00:00Z'
      }],
      KCFKPI_OutputDefinitions: [{
        Id: 51,
        OutputCode: 'MAIN_CWOP',
        Title: 'Main CWOP',
        Description: 'Controlled output definition.',
        ReportingCadence: 'Quarterly',
        MappingRequirement: 'Required',
        OutputFormat: 'XLSX',
        EffectiveFrom: '2026-04-01',
        SchemaVersion: 'v01',
        Status: 'Active',
        OwnerEmail: 'output.owner@example.invalid',
        ChangeReference: 'CONTROL-020B',
        ApprovedByEmail: 'output.approver@example.invalid',
        ApprovedAt: '2026-03-31T12:30:00Z'
      }],
      KCFKPI_KPIResults: [{
        KPIResultKey: 'SO1-001|2026|Q2',
        KPIID: 'SO1-001',
        PerformanceYear: 2026,
        Quarter: 'Q2',
        FinalActualValue: 72,
        ResultStatus: 'Published',
        ApprovedByEmail: 'result.approver@example.invalid',
        ApprovedAt: '2026-07-01T10:00:00Z',
        PublishedAt: '2026-07-02T10:00:00Z'
      }],
      KCFKPI_Audit: [{
        Id: 61,
        AuditKey: 'AUDIT-001',
        EventType: 'ReportingMapChanged',
        SubjectType: 'ReportingMap',
        SubjectKey: 'SO1-001|MAIN_CWOP|v01',
        ActorEmail: email,
        ActorRole: 'SystemAdmin',
        EventAt: '2026-08-21T12:00:00Z',
        Reason: 'Synthetic read fixture',
        BeforeJSON: '{"status":"Draft"}',
        AfterJSON: '{"status":"Active"}',
        CorrelationKey: 'CORR-001',
        Source: 'SPFx',
        SourceReference: 'CONTROL-020B',
        Success: true
      }]
    };
    const mock = clientFor(rows);
    const service = new SharePointAdminReportingControlDataService(mock.client, `${site}/`, email);

    const snapshot = await service.getAdminReportingControlSnapshot(2026);

    expect(snapshot).toMatchObject({ mode: 'ProductionReadOnly', performanceYear: 2026 });
    expect(snapshot.kpis).toEqual([expect.objectContaining({
      id: 11,
      kpiId: 'SO1-001',
      owner: 'owner@example.invalid',
      active: true
    })]);
    expect(snapshot.annualTargets).toEqual([expect.objectContaining({
      id: 21,
      kpiId: 'so1-001',
      performanceYear: '2026',
      annualTarget: 0,
      q1Target: 'Stage one',
      owner: 'owner@example.invalid',
      modifiedBy: 'Target Editor'
    })]);
    expect(snapshot.behaviourDefinitions).toEqual([expect.objectContaining({
      behaviourId: 'B01',
      guidancePrompts: ['Prompt one', 'Prompt two'],
      active: true,
      published: true
    })]);
    expect(snapshot.organisationalWeights).toEqual([expect.objectContaining({
      organisationalWeightKey: '2026|v01|KPIWithinWorkstream|SO1|Participation|SO1-001',
      performanceYear: 2026,
      weightPercent: 100,
      approvalStatus: 'Approved'
    })]);
    expect(snapshot.reportingMaps).toEqual([expect.objectContaining({
      mappingKey: 'SO1-001|MAIN_CWOP|v01',
      naturalKey: 'SO1-001|MAIN_CWOP',
      outputCode: 'MAIN_CWOP',
      externalKey: 'PARTICIPATION.PROGRAMMES',
      allocationPercent: 60,
      treatment: 'Allocated',
      treatmentRuleJson: '{"basis":"headcount"}',
      reportingCadence: 'Quarterly',
      active: true,
      approvalStatus: 'Approved',
      changeReference: 'CONTROL-020B',
      approvedByEmail: 'mapping.approver@example.invalid',
      approvedAt: '2026-03-31T12:00:00Z'
    })]);
    expect(snapshot.outputDefinitions).toEqual([expect.objectContaining({
      outputCode: 'MAIN_CWOP',
      outputName: 'Main CWOP',
      description: 'Controlled output definition.',
      mappingRequirement: 'Required',
      outputFormat: 'XLSX',
      publicationStatus: 'Published',
      ownerEmail: 'output.owner@example.invalid',
      changeReference: 'CONTROL-020B',
      approvedByEmail: 'output.approver@example.invalid',
      approvedAt: '2026-03-31T12:30:00Z'
    })]);
    expect(snapshot.officialResults).toEqual([expect.objectContaining({
      kpiResultKey: 'SO1-001|2026|Q2',
      kpiId: 'SO1-001',
      finalActual: 72,
      resultStatus: 'Published'
    })]);
    expect(snapshot.auditEvents).toEqual([expect.objectContaining({
      auditKey: 'AUDIT-001',
      actor: email,
      entityType: 'ReportingMap',
      correlationKey: 'CORR-001',
      beforeJson: '{"status":"Draft"}',
      afterJson: '{"status":"Active"}'
    })]);

    const urls = decodedUrls(mock.get);
    expect(urls).toHaveLength(9);
    expect(urls[0]).toContain("getbytitle('KCFKPI_People')/items?$select=Email,AppRoles,Active");
    expect(urls[0]).toContain(`$filter=Email eq '${email}' and Active eq 1&$orderby=Id&$top=2`);
    expect(urlForList(mock.get, 'KCFKPI_KPIMaster')).toContain(`$select=${ADMIN_KPI_MASTER_SELECT}`);
    expect(urlForList(mock.get, 'KCFKPI_AnnualTargets')).toContain(`$select=${ADMIN_ANNUAL_TARGET_SELECT}`);
    expect(urlForList(mock.get, 'KCFKPI_Behaviours')).toContain(`$select=${ADMIN_BEHAVIOUR_DEFINITION_SELECT}`);
    expect(urlForList(mock.get, 'KCFKPI_OrganisationalWeights')).toContain(`$select=${ADMIN_ORGANISATIONAL_WEIGHT_SELECT}`);
    expect(urlForList(mock.get, 'KCFKPI_ReportingMap')).toContain(`$select=${ADMIN_REPORTING_MAP_SELECT}`);
    expect(ADMIN_REPORTING_MAP_SELECT.split(',')).toEqual(expect.arrayContaining([
      'ReportingMapNaturalKey', 'AllocationPct', 'Treatment', 'TreatmentRuleJSON', 'ReportingCadence',
      'ChangeReference', 'ApprovedByEmail', 'ApprovedAt'
    ]));
    expect(urlForList(mock.get, 'KCFKPI_OutputDefinitions')).toContain(`$select=${ADMIN_OUTPUT_DEFINITION_SELECT}`);
    expect(ADMIN_OUTPUT_DEFINITION_SELECT.split(',')).toEqual(expect.arrayContaining([
      'Description', 'MappingRequirement', 'OutputFormat', 'OwnerEmail', 'ChangeReference',
      'ApprovedByEmail', 'ApprovedAt'
    ]));
    expect(urlForList(mock.get, 'KCFKPI_KPIResults')).toContain(`$select=${ADMIN_OFFICIAL_RESULT_SELECT}`);
    expect(urlForList(mock.get, 'KCFKPI_KPIResults')).toContain("ResultStatus eq 'Approved' or ResultStatus eq 'Published'");
    expect(urlForList(mock.get, 'KCFKPI_Audit')).toContain(`$select=${ADMIN_AUDIT_VIEW_SELECT}`);
    expectNoWriteVerb(mock);
  });

  it('fails closed after the exact People recheck when the current record is not an Admin', async () => {
    const mock = clientFor(emptyRows([adminRow({ results: ['Employee'] })]));
    const service = new SharePointAdminReportingControlDataService(mock.client, site, email);

    await expect(service.getAdminReportingControlSnapshot(2026)).rejects.toThrow(
      'The current authenticated People record is not authorised for Admin Reporting Control.'
    );
    expect(mock.get).toHaveBeenCalledTimes(1);
    expect(decodedUrls(mock.get)[0]).toContain("getbytitle('KCFKPI_People')");
    expectNoWriteVerb(mock);
  });

  it('allows only Sponsor on exact REVIEW-TEST-SITE to load the GET-only safe-UAT baseline', async () => {
    const employeeRows = emptyRows([adminRow({ results: ['Employee'] })]);
    const accepted = clientFor(employeeRows);
    const acceptedService = new SharePointAdminReportingControlDataService(
      accepted.client, site, email, true
    );

    await expect(acceptedService.getAdminReportingControlSnapshot(2026)).resolves.toMatchObject({
      mode: 'ProductionReadOnly',
      performanceYear: 2026
    });
    expectNoWriteVerb(accepted);

    const wrongSite = clientFor(employeeRows);
    const wrongSiteService = new SharePointAdminReportingControlDataService(
      wrongSite.client, 'https://example.invalid/sites/Other', email, true
    );
    await expect(wrongSiteService.getAdminReportingControlSnapshot(2026)).rejects.toThrow(
      'The current authenticated People record is not authorised for Admin Reporting Control.'
    );

    const wrongActor = clientFor(employeeRows);
    const wrongActorService = new SharePointAdminReportingControlDataService(
      wrongActor.client, site, 'person009@example.invalid', true
    );
    await expect(wrongActorService.getAdminReportingControlSnapshot(2026)).rejects.toThrow(
      'The current authenticated People record is not authorised for Admin Reporting Control.'
    );
  });

  it('treats a missing organisational-weights list as an intentionally empty read result', async () => {
    const mock = clientFor(emptyRows(), ['KCFKPI_OrganisationalWeights']);
    const service = new SharePointAdminReportingControlDataService(mock.client, site, email);

    const snapshot = await service.getAdminReportingControlSnapshot(2026);

    expect(snapshot.organisationalWeights).toEqual([]);
    expect(urlForList(mock.get, 'KCFKPI_OrganisationalWeights')).toContain('$top=5000');
    expectNoWriteVerb(mock);
  });

  it('does not silently reinterpret a blank MappingRequirement as Optional', async () => {
    const rows: RowsByList = {
      ...emptyRows(),
      KCFKPI_OutputDefinitions: [{
        Id: 51,
        OutputCode: 'MAIN_CWOP',
        Title: 'Main CWOP',
        ReportingCadence: 'Quarterly',
        MappingRequirement: '',
        EffectiveFrom: '2026-04-01',
        SchemaVersion: 'v01',
        Status: 'Draft'
      }]
    };
    const mock = clientFor(rows);
    const service = new SharePointAdminReportingControlDataService(mock.client, site, email);

    const snapshot = await service.getAdminReportingControlSnapshot(2026);

    expect(snapshot.outputDefinitions[0].mappingRequirement).toBeUndefined();
    expect(snapshot.outputDefinitions[0].mappingRequirement).not.toBe('Optional');
    expectNoWriteVerb(mock);
  });

  it('bounds Audit to exactly 90 days, caps the GET at 500 and warns at the cap', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    const auditRows = Array.from({ length: 500 }, (_value, index) => ({
      Id: index + 1,
      AuditKey: `AUDIT-${index + 1}`,
      EventType: 'ConfigChanged',
      SubjectType: 'Config',
      SubjectKey: `CONFIG-${index + 1}`,
      ActorEmail: email,
      EventAt: '2026-08-21T12:00:00.000Z',
      CorrelationKey: `CORR-${index + 1}`,
      Success: true
    }));
    const rows: RowsByList = { ...emptyRows(), KCFKPI_Audit: auditRows };
    const mock = clientFor(rows);
    const service = new SharePointAdminReportingControlDataService(mock.client, site, email);

    const snapshot = await service.getAdminReportingControlSnapshot(2026);

    expect(snapshot.auditEvents).toHaveLength(500);
    expect(snapshot.auditReadRequest).toMatchObject({
      dateFrom: '2026-05-24T12:00:00.000Z',
      dateTo: '2026-08-22T12:00:00.000Z',
      operation: 'ReadOnly',
      maximumRangeDays: 90
    });
    expect(Date.parse(snapshot.auditReadRequest.dateTo as string)
      - Date.parse(snapshot.auditReadRequest.dateFrom as string)).toBe(90 * dayMs);
    expect(snapshot.warnings).toEqual([
      'Audit Viewer is capped at the newest 500 events inside the bounded 90-day read window.'
    ]);
    const auditUrl = urlForList(mock.get, 'KCFKPI_Audit');
    expect(auditUrl).toContain("$filter=EventAt ge datetime'2026-05-24T12:00:00.000Z' and EventAt le datetime'2026-08-22T12:00:00.000Z'");
    expect(auditUrl).toContain('$orderby=EventAt desc&$top=500');
    expectNoWriteVerb(mock);
  });
});
