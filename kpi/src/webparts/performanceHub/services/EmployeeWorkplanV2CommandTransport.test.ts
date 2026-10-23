jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import EmployeeWorkplanV2CommandTransport, {
  employeeV2AnnualOuterBinding,
  type IEmployeeV2AnnualCommandRequest,
  type IEmployeeV2CommandRequest
} from './EmployeeWorkplanV2CommandTransport';
import {
  assertKcfKpi036TestBindings,
  KCF_KPI_036_TEST_LIST_BINDINGS,
  KCF_KPI_036_TEST_RUN_KEY
} from './EmployeeWorkplanV2ListBindings';

const email = 'employee@example.invalid';
const site = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const commandKey = 'fb1f6035-236e-434c-ae05-a78003badd47';
const sourceListId = '7cd2b366-aa4d-4d2c-a046-a5ca92624918';

const response = (data: unknown, status = 200): SPHttpClientResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  text: async () => JSON.stringify(data)
} as unknown as SPHttpClientResponse);

const receipt = (patch: Record<string, unknown> = {}): object => ({
  ReceiptKey: `${sourceListId}|71`, SourceListId: sourceListId, SourceItemId: 71,
  SourceItemVersion: '1.0', CommandKey: commandKey, CommandType: 'UpdateWorkplanDraftV2',
  SubjectType: 'Workplan', SubjectKey: 'PERSON-001|2027', PersonKey: 'PERSON-001',
  PerformanceYear: 2027, AuthenticatedActorEmail: email,
  AuthenticatedActorPersonKey: 'PERSON-001', EffectiveRole: 'Employee',
  ProcessedByEmail: 'kcf-kpi-automation@example.invalid', ProcessedAt: '2026-08-24T10:00:01Z',
  Outcome: 'Accepted', ValidationCode: 'ACCEPTED', Message: 'Persisted and read back.',
  ProcessedPayloadSHA256: 'A'.repeat(64), ResultKeysJSON: '[{"subjectKey":"PERSON-001|2027","rowVersionToken":2}]',
  AuditKeysJSON: '["AUDIT-001"]', CorrelationKey: 'CORR-001', FlowRunReference: 'FLOW-001', ...patch
});

const request: IEmployeeV2CommandRequest = {
  route: 'Employee', commandKey, commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan',
  subjectKey: 'PERSON-001|2027', personKey: 'PERSON-001', performanceYear: 2027,
  expectedRowVersionToken: 1, expectedETag: '"1"', payload: {
    coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10
  }
};

describe('KCF-KPI-027A SEC-002B command transport', () => {
  it('A016 queues the exact C2b admitted envelope and waits for its immutable terminal receipt', async () => {
    const get = jest.fn().mockResolvedValueOnce(response({ value: [] }))
      .mockResolvedValueOnce(response({ value: [receipt()] }));
    const post = jest.fn(async () => response({ Id: 71 }, 201));
    const service = new EmployeeWorkplanV2CommandTransport(
      { get, post } as unknown as SPHttpClient, site, email,
      { maxReceiptAttempts: 2, waitForNextReceiptAttempt: async () => undefined }
    );
    const annualRequest: IEmployeeV2AnnualCommandRequest = {
      route: 'Employee', commandKey, commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan',
      subjectKey: request.subjectKey, personKey: request.personKey, performanceYear: request.performanceYear,
      expectedRowVersionToken: request.expectedRowVersionToken, payload: request.payload,
      expectedHeaderETag: '"1"'
    };
    await expect(service.executeAnnual(annualRequest)).resolves.toEqual({
      receipt: expect.objectContaining({ outcome: 'Accepted', commandKey }), replayed: false
    });
    const postCalls = post.mock.calls as unknown as unknown[][];
    const posted = JSON.parse(String((postCalls[0][2] as { body: string }).body)) as Record<string, unknown>;
    expect(employeeV2AnnualOuterBinding(posted)).toBe(true);
    expect(posted).toEqual(expect.objectContaining({ ExpectedRowVersionToken: null, ExpectedETag: '"1"', Quarter: null }));
    expect(JSON.parse(String(posted.PayloadJSON))).toEqual({
      schemaVersion: 'kcf.kpi.test-command.v2',
      binding: { commandKey, commandType: 'UpdateWorkplanDraftV2', subjectType: 'Workplan',
        subjectKey: 'PERSON-001|2027', personKey: 'PERSON-001', performanceYear: 2027,
        workplanKey: 'PERSON-001|2027' },
      expected: { header: { presence: 'Present', token: '1', etag: '"1"' },
        item: { presence: 'NotApplicable' } },
      payload: request.payload
    });
  });

  it('uses header ETag outside and keeps item ETag only in the v2 payload for an item route', async () => {
    const get = jest.fn().mockResolvedValueOnce(response({ value: [] }))
      .mockResolvedValueOnce(response({ value: [receipt({ CommandType: 'UpsertCoreContributionV2',
        SubjectType: 'WorkplanItem', SubjectKey: 'KPI-001' })] }));
    const post = jest.fn(async () => response({ Id: 71 }, 201));
    const service = new EmployeeWorkplanV2CommandTransport(
      { get, post } as unknown as SPHttpClient, site, email,
      { maxReceiptAttempts: 2, waitForNextReceiptAttempt: async () => undefined }
    );
    const itemRequest: IEmployeeV2AnnualCommandRequest = {
      route: 'Employee', commandKey, commandType: 'UpsertCoreContributionV2', subjectType: 'WorkplanItem',
      subjectKey: 'KPI-001', personKey: 'PERSON-001', performanceYear: 2027,
      expectedRowVersionToken: 1, expectedHeaderETag: '"header-1"', expectedItemETag: '"item-1"',
      payload: { kpiId: 'KPI-001' }
    };
    await service.executeAnnual(itemRequest);
    const postCalls = post.mock.calls as unknown as unknown[][];
    const posted = JSON.parse(String((postCalls[0][2] as { body: string }).body)) as Record<string, unknown>;
    const envelope = JSON.parse(String(posted.PayloadJSON)) as { expected: { header: { etag: string }; item: { etag: string } } };
    expect(employeeV2AnnualOuterBinding(posted)).toBe(true);
    expect(posted).toMatchObject({ ExpectedRowVersionToken: null, ExpectedETag: '"header-1"', Quarter: null });
    expect(envelope.expected).toEqual({ header: { presence: 'Present', token: '1', etag: '"header-1"' },
      item: { presence: 'Present', etag: '"item-1"' } });
  });

  it('queues one typed Employee command, waits for an immutable receipt and never posts canonical data', async () => {
    const get = jest.fn()
      .mockResolvedValueOnce(response({ value: [] }))
      .mockResolvedValueOnce(response({ value: [receipt()] }));
    const post = jest.fn(async () => response({ Id: 71 }, 201));
    const service = new EmployeeWorkplanV2CommandTransport(
      { get, post } as unknown as SPHttpClient, site, email,
      { maxReceiptAttempts: 2, waitForNextReceiptAttempt: async () => undefined }
    );

    await expect(service.execute(request)).resolves.toEqual({
      receipt: expect.objectContaining({ commandKey, outcome: 'Accepted', authenticatedActorEmail: email }),
      replayed: false
    });
    expect(post).toHaveBeenCalledTimes(1);
    const postCalls = post.mock.calls as unknown as unknown[][];
    const postUrl = String(postCalls[0][0]);
    expect(postUrl).toContain("getbytitle('KCFKPI_EmployeeCommands')/items");
    expect(postUrl).not.toMatch(/KCFKPI_(Workplans|WorkplanItems|QuarterReviews|QuarterReviewItems|Audit)/);
    const posted = JSON.parse(String((postCalls[0][2] as { body: string }).body)) as Record<string, unknown>;
    expect(posted).toEqual(expect.objectContaining({
      CommandKey: commandKey, CommandType: 'UpdateWorkplanDraftV2',
      ExpectedRowVersionToken: 1, ExpectedETag: '"1"', ClientVersion: 'KCF-KPI-027A'
    }));
    expect(String(posted.ClientSubmittedAt)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.parse(String(posted.PayloadJSON))).toEqual(request.payload);
  });

  it('returns the original receipt on stable-key retry without creating another command row', async () => {
    const get = jest.fn(async () => response({ value: [receipt()] }));
    const post = jest.fn();
    const service = new EmployeeWorkplanV2CommandTransport({ get, post } as unknown as SPHttpClient, site, email);

    await expect(service.execute(request)).resolves.toEqual({ receipt: expect.objectContaining({ receiptKey: `${sourceListId}|71` }), replayed: true });
    expect(post).not.toHaveBeenCalled();
  });

  it('fails closed for rejected, mismatched-actor or incomplete accepted receipts', async () => {
    const run = async (row: object): Promise<void> => {
      const service = new EmployeeWorkplanV2CommandTransport({
        get: jest.fn(async () => response({ value: [row] })), post: jest.fn()
      } as unknown as SPHttpClient, site, email);
      await service.execute(request);
    };
    await expect(run(receipt({ Outcome: 'Rejected', ValidationCode: 'STALE_VERSION', Message: 'Reload.' }))).rejects.toThrow(/STALE_VERSION/);
    await expect(run(receipt({ AuthenticatedActorEmail: 'other@example.invalid' }))).rejects.toThrow(/actor does not match/);
    await expect(run(receipt({ EffectiveRole: 'Manager' }))).rejects.toThrow(/role does not match/);
    await expect(run(receipt({ ReceiptKey: 'arbitrary' }))).rejects.toThrow(/trusted source-list/);
    await expect(run(receipt({ ResultKeysJSON: '' }))).rejects.toThrow(/missing canonical readback/);
    await expect(run(receipt({ AuditKeysJSON: 'not-json' }))).rejects.toThrow(/invalid audit evidence JSON/);
  });

  it('never assumes success when the asynchronous receipt is not yet available', async () => {
    const get = jest.fn(async () => response({ value: [] }));
    const post = jest.fn(async () => response({ Id: 71 }, 201));
    const service = new EmployeeWorkplanV2CommandTransport(
      { get, post } as unknown as SPHttpClient, site, email,
      { maxReceiptAttempts: 2, waitForNextReceiptAttempt: async () => undefined }
    );
    await expect(service.execute(request)).rejects.toThrow(/still pending/);
  });

  it('uses only the explicit fail-closed KCF-KPI-036 TEST command boundary', async () => {
    const testRequest: IEmployeeV2CommandRequest = {
      ...request,
      commandKey: 'KCF-KPI-036|Sponsor|2026|DRAFT|V1',
      commandType: 'CreateWorkplanDraft',
      subjectKey: 'KCF-KPI-036-Sponsor|2026',
      personKey: 'KCF-KPI-036-Sponsor',
      performanceYear: 2026,
      expectedRowVersionToken: undefined,
      expectedETag: undefined
    };
    const testReceipt = receipt({
      ReceiptKey: `3e05ec37-95ce-4a30-a56c-ff2437bf9bed|72|1.0|ETAG|\"1\"`,
      SourceListId: '3e05ec37-95ce-4a30-a56c-ff2437bf9bed', SourceItemId: 72,
      CommandKey: testRequest.commandKey, CommandType: testRequest.commandType,
      SubjectKey: testRequest.subjectKey, PersonKey: testRequest.personKey,
      PerformanceYear: 2026, CorrelationKey: 'KCF036-FLOW-001',
      ResultKeysJSON: '[{"subjectKey":"KCF-KPI-036-Sponsor|2026","rowVersionToken":1}]'
    });
    const get = jest.fn()
      .mockResolvedValueOnce(response({ value: [] }))
      .mockResolvedValueOnce(response({ value: [testReceipt] }));
    const post = jest.fn(async () => response({ Id: 72 }, 201));
    const service = new EmployeeWorkplanV2CommandTransport(
      { get, post } as unknown as SPHttpClient, site, email,
      {
        maxReceiptAttempts: 2,
        waitForNextReceiptAttempt: async () => undefined,
        listBindings: KCF_KPI_036_TEST_LIST_BINDINGS
      }
    );

    expect(() => assertKcfKpi036TestBindings(KCF_KPI_036_TEST_LIST_BINDINGS)).not.toThrow();
    await expect(service.execute(testRequest)).resolves.toEqual({
      receipt: expect.objectContaining({ commandKey: testRequest.commandKey, outcome: 'Accepted' }),
      replayed: false
    });
    const postCalls = post.mock.calls as unknown as unknown[][];
    expect(String(postCalls[0][0])).toContain("getbytitle('KCFKPI_TEST_EmployeeCommands')/items");
    const posted = JSON.parse(String((postCalls[0][2] as { body: string }).body)) as Record<string, unknown>;
    expect(posted).toEqual(expect.objectContaining({
      ClientVersion: 'KCF-KPI-036', TestRunKey: KCF_KPI_036_TEST_RUN_KEY
    }));
    expect(get.mock.calls.map(call => decodeURIComponent(String(call[0]))).join('\n'))
      .toContain("getbytitle('KCFKPI_TEST_CommandReceipts')");
    expect(JSON.stringify({ post: post.mock.calls, get: get.mock.calls }))
      .not.toMatch(/getbytitle\('KCFKPI_(?!TEST_)/);
  });

  it('rejects invented TEST-like bindings in both the assertion and runtime constructor', () => {
    const invented = {
      ...KCF_KPI_036_TEST_LIST_BINDINGS,
      employeeCommands: 'KCFKPI_TEST_Gold'
    };
    expect(() => assertKcfKpi036TestBindings(invented)).toThrow(/exact KCF-KPI-035/);
    expect(() => new EmployeeWorkplanV2CommandTransport(
      { get: jest.fn(), post: jest.fn() } as unknown as SPHttpClient,
      site,
      email,
      { listBindings: invented }
    )).toThrow(/exact KCF-KPI-035/);
  });

  it('publishes all eleven exact KCF-KPI-035 title and GUID pairs', () => {
    const serialized = JSON.stringify(KCF_KPI_036_TEST_LIST_BINDINGS);
    const exactPairs: Array<[string, string]> = [
      ['KCFKPI_TEST_People', 'c89a7c3c-4ad7-45ca-ae17-5c108c318598'],
      ['KCFKPI_TEST_Workplans', '47210791-25f1-416e-ab24-832c8b6448ec'],
      ['KCFKPI_TEST_WorkplanItems', '98f2a280-46a7-40b5-a37d-db97b02fc826'],
      ['KCFKPI_TEST_QuarterReviews', '71d7058c-d85b-48bb-ac3c-611615fb39dc'],
      ['KCFKPI_TEST_QuarterReviewItems', 'd73c9d53-5ab8-4de3-a5a3-6f76afd05b30'],
      ['KCFKPI_TEST_ProgressNotes', 'e3cf10ad-f942-46fa-a40f-1484f8275a9c'],
      ['KCFKPI_TEST_Evidence', '31fe4b7f-f5a0-48fc-a5f4-398822acbdc4'],
      ['KCFKPI_TEST_Audit', '59a00c55-5ceb-4561-a5d5-0942edb5ad6d'],
      ['KCFKPI_TEST_EmployeeCommands', '3e05ec37-95ce-4a30-a56c-ff2437bf9bed'],
      ['KCFKPI_TEST_ManagerCommands', '40ec1c73-a802-40ec-a6a2-cde0cba1d182'],
      ['KCFKPI_TEST_CommandReceipts', '3eb157c8-6290-4e1b-ad6b-d41e4a2293b9']
    ];
    exactPairs.forEach(([title, id]) => {
      expect(serialized).toContain(title);
      expect(serialized).toContain(id);
    });
  });
});


describe('M145 legacy transport boundary', () => {
  it('refuses wire-v2 before receipt lookup or POST', async () => {
    const get = jest.fn(), post = jest.fn();
    const service = new EmployeeWorkplanV2CommandTransport({ get, post } as unknown as SPHttpClient, site, email);
    await expect(service.execute({ ...request, payload: { schemaVersion: 'kcf.kpi.test-command.v2' } })).rejects.toThrow('legacy transport');
    expect(get).not.toHaveBeenCalled(); expect(post).not.toHaveBeenCalled();
  });
});
