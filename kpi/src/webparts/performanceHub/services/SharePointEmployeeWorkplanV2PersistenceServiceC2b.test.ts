jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import type { IEmployeeV2CommandReceipt } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IProductionPerson } from '../models/ProductionModels';
import type EmployeeWorkplanV2CommandTransport from './EmployeeWorkplanV2CommandTransport';
import type { IEmployeeWorkplanV2C2bCommandGateway } from './EmployeeWorkplanV2C2bCommandGateway';
import { KCF_KPI_036_TEST_LIST_BINDINGS } from './EmployeeWorkplanV2ListBindings';
import SharePointEmployeeWorkplanV2PersistenceService from './SharePointEmployeeWorkplanV2PersistenceService';

const employee: IProductionPerson = {
  id: 1, personKey: 'PERSON-001', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
  managerPersonKey: 'MANAGER-001', managerEmail: 'manager@example.invalid', appRoles: ['Employee'], active: true
};
const manager: IProductionPerson = {
  id: 2, personKey: 'MANAGER-001', displayName: 'Synthetic Manager', email: 'manager@example.invalid',
  appRoles: ['Manager'], active: true
};
const workplanKey = 'PERSON-001|2027';
const response = (data: unknown): SPHttpClientResponse => ({
  ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data)
} as unknown as SPHttpClientResponse);
const receipt: IEmployeeV2CommandReceipt = {
  receiptKey: 'RECEIPT-001', sourceListId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', sourceItemId: 17,
  sourceItemVersion: '1.0', commandKey: 'CMD-001', commandType: 'CreateWorkplanDraft', subjectType: 'Workplan',
  subjectKey: workplanKey, personKey: employee.personKey, performanceYear: 2027,
  authenticatedActorEmail: employee.email, authenticatedActorPersonKey: employee.personKey, effectiveRole: 'Employee',
  processedByEmail: 'processor@example.invalid', processedAt: '2026-09-12T03:00:00Z', outcome: 'Accepted',
  validationCode: 'ACCEPTED', message: 'Terminal accepted.', processedPayloadSha256: 'a'.repeat(64),
  resultKeysJson: JSON.stringify([{ workplanKey, rowVersionToken: 2, etag: '"canonical-2"' }]),
  auditKeysJson: JSON.stringify(['AUDIT-001']), correlationKey: 'CORR-001', flowRunReference: 'RUN-001'
};
const workplanRow = {
  '@odata.etag': '"canonical-2"', Id: 10, WorkplanKey: workplanKey, PersonKey: employee.personKey,
  EmployeeDisplayName: employee.displayName, EmployeeEmail: employee.email, PerformanceYear: 2027,
  ManagerPersonKey: manager.personKey, ManagerDisplayName: manager.displayName, ManagerEmail: manager.email,
  State: 'Draft', AccessState: 'EmployeeEdit', TransitionStatus: 'Ready', WorkplanVersion: 1, RowVersionToken: 2
};
const auditRow = {
  Id: 1, AuditKey: 'AUDIT-001', EventType: 'WorkplanDraftCreated', SubjectKey: workplanKey,
  ActorEmail: employee.email, ActorRole: 'Employee', EventAt: '2026-09-12T03:00:00Z',
  CorrelationKey: 'CORR-001', Source: 'PowerAutomate', SourceReference: 'RUN-001', Success: true
};

describe('A006 SharePoint Employee V2 governed CreateWorkplanDraft route', () => {
  it('does not call any browser HTTP when the default C2b composition is disabled', async () => {
    const client = { get: jest.fn(), post: jest.fn() } as unknown as SPHttpClient;
    const service = new SharePointEmployeeWorkplanV2PersistenceService(client, 'https://local.invalid', employee.email,
      {} as EmployeeWorkplanV2CommandTransport, KCF_KPI_036_TEST_LIST_BINDINGS);
    await expect(service.createEmployeeWorkplanDraftV2({ commandKey: 'CMD-001', actor: employee, manager, performanceYear: 2027 }))
      .rejects.toThrow(/C2B_DISABLED/);
    expect((client.get as jest.Mock)).not.toHaveBeenCalled();
    expect((client.post as jest.Mock)).not.toHaveBeenCalled();
  });

  it('returns success only after terminal receipt, canonical Workplan and audit readback reconcile', async () => {
    const get = jest.fn(async (url: string) => {
      const decoded = decodeURIComponent(url);
      if (decoded.includes("getbytitle('KCFKPI_TEST_Workplans')")) return response({ value: [workplanRow] });
      if (decoded.includes("getbytitle('KCFKPI_TEST_Audit')")) return response({ value: [auditRow] });
      if (decoded.includes("getbytitle('KCFKPI_TEST_WorkplanItems')")) return response({ value: [] });
      throw new Error(`Unexpected read ${decoded}`);
    });
    const post = jest.fn();
    const execute = jest.fn(async () => ({
        receipt, replayed: false,
        canonicalProof: { workplanKey, rowVersionToken: 2, etag: '"canonical-2"', itemKeys: [], auditKeys: ['AUDIT-001'] }
      }));
    const gateway: IEmployeeWorkplanV2C2bCommandGateway = {
      executeAnnualCommand: execute,
      executeCreateWorkplanDraft: execute
    };
    const service = new SharePointEmployeeWorkplanV2PersistenceService({ get, post } as unknown as SPHttpClient,
      'https://local.invalid', employee.email, {} as EmployeeWorkplanV2CommandTransport,
      KCF_KPI_036_TEST_LIST_BINDINGS, gateway);
    await expect(service.createEmployeeWorkplanDraftV2({ commandKey: 'CMD-001', actor: employee, manager, performanceYear: 2027 }))
      .resolves.toEqual({ receipt, duplicate: false, readback: expect.objectContaining({
        workplan: expect.objectContaining({ workplanKey, state: 'Draft', etag: '"canonical-2"' }),
        audits: [expect.objectContaining({ auditKey: 'AUDIT-001' })]
      }) });
    expect(post).not.toHaveBeenCalled();
  });

  it('rejects forged manager mapping and mismatched stable proof before claiming persistence', async () => {
    const execute = jest.fn(async () => ({
      receipt, replayed: false,
      canonicalProof: { workplanKey, rowVersionToken: 2, etag: '"wrong"', itemKeys: [], auditKeys: ['AUDIT-001'] }
    }));
    const gateway: IEmployeeWorkplanV2C2bCommandGateway = {
      executeAnnualCommand: execute,
      executeCreateWorkplanDraft: execute
    };
    const client = { get: jest.fn(async (url: string) => decodeURIComponent(url).includes('Workplans')
      ? response({ value: [workplanRow] }) : response({ value: decodeURIComponent(url).includes('Audit') ? [auditRow] : [] })), post: jest.fn() } as unknown as SPHttpClient;
    const service = new SharePointEmployeeWorkplanV2PersistenceService(client, 'https://local.invalid', employee.email,
      {} as EmployeeWorkplanV2CommandTransport, KCF_KPI_036_TEST_LIST_BINDINGS, gateway);
    await expect(service.createEmployeeWorkplanDraftV2({ commandKey: 'CMD-001', actor: employee,
      manager: { ...manager, email: 'other@example.invalid' }, performanceYear: 2027 })).rejects.toThrow(/key-plus-email/);
    await expect(service.createEmployeeWorkplanDraftV2({ commandKey: 'CMD-001', actor: employee, manager, performanceYear: 2027 }))
      .rejects.toThrow(/did not reconcile/);
  });
});
