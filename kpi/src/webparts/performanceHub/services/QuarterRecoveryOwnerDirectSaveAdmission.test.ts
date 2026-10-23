jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
jest.mock('@microsoft/sp-core-library', () => ({ Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'synthetic-guid' }) } }));

import type { SPHttpClient } from '@microsoft/sp-http';
import type { IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import type { IQuarterReview, IQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import SharePointProductionDataService from './SharePointProductionDataService';

const employeeEmail = 'employee@example.invalid';
const managerEmail = 'manager@example.invalid';
const employee = { id: 1, personKey: 'EMP-1', displayName: 'Synthetic Employee', email: employeeEmail, active: true, appRoles: [] } as IProductionPerson;
const manager = { id: 2, personKey: 'MGR-1', displayName: 'Synthetic Manager', email: managerEmail, active: true, appRoles: [] } as IProductionPerson;
const review = {
  id: 4, etag: '"2"', rowVersionToken: 2, quarterReviewKey: 'EMP-1|2026|Q4', workplanKey: 'EMP-1|2026',
  personKey: 'EMP-1', employeeDisplayName: employee.displayName, employeeEmail, performanceYear: 2026, quarter: 'Q4',
  managerPersonKey: 'MGR-1', managerDisplayName: manager.displayName, managerEmail,
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready'
} as IQuarterReview;
const context = {
  review, employee, manager, lifecycle: { quarterKey: 'Q4', performanceYearNumber: 2026, isOpenForProgressUpdates: true },
  dataFoundationReady: true
} as IQuarterReviewContext;
const config = {
  performanceYearNumber: 2026, rag: { greenThreshold: 90, amberThreshold: 50 }
} as IProductionConfig;
const kpi = {
  kpiId: 'SO1-001', kpiVersionKey: 'v1', targetVersionKey: 't1', wording: 'Synthetic delivery',
  scoringDirection: 'HigherIsBetter', metricType: 'Count', q4TargetValue: 200
};
const stored = {
  id: 7, etag: '"3"', quarterReviewItemKey: `${review.quarterReviewKey}|assignment`, quarterReviewKey: review.quarterReviewKey,
  workplanItemKey: 'assignment', workplanKey: review.workplanKey, personKey: review.personKey,
  performanceYear: 2026, quarter: 'Q4', itemType: 'CoreGold', kpiId: 'SO1-001',
  kpiVersionKey: 'v1', targetVersionKey: 't1', wording: 'Synthetic delivery',
  quarterTargetValue: 200, scoringDirection: 'HigherIsBetter', metricType: 'Count',
  calculatedRag: 'NotRated', evidenceCount: 0, managerApproved: false, locked: false
} as IQuarterReviewItem;
const incoming = (ownerPersonKey?: string): IQuarterReviewItem => ({
  ...stored, employeeActualValue: 130, statusUpdate: 'Controlled synthetic progress.',
  recovery: { route: 'Recover', action: 'Complete the plan.', ownerPersonKey,
    dueDate: '2026-09-15', nextReviewDate: '2026-09-01', status: 'Active', expectedReturnToGreenDate: '2026-09-30' }
});
const personRow = (key: string, active = true, managerKey?: string, email?: string): object => ({
  Id: key === 'EMP-1' ? 1 : 2, PersonKey: key, Title: key,
  Email: email || (key === 'EMP-1' ? employeeEmail : managerEmail),
  ManagerPersonKey: managerKey, ManagerEmail: key === 'EMP-1' ? managerEmail : undefined,
  AppRoles: [], Active: active
});

interface IHarness {
  service: SharePointProductionDataService;
  getItems: jest.Mock;
  mergeJson: jest.Mock;
  postJson: jest.Mock;
  appendQuarterAudit: jest.Mock;
}

const harness = (subjectRows: object[] = [personRow('EMP-1', true, 'MGR-1')], managerRows: object[] = [personRow('MGR-1')]): IHarness => {
  const service = new SharePointProductionDataService({} as SPHttpClient, 'https://example.invalid/site', employeeEmail);
  const getItems = jest.fn(async (_list: string, _select: string, filter: string): Promise<object[]> =>
    filter.includes("PersonKey eq 'EMP-1'") ? subjectRows : managerRows);
  const mergeJson = jest.fn(async (): Promise<void> => undefined);
  const postJson = jest.fn(async (): Promise<void> => undefined);
  const appendQuarterAudit = jest.fn(async (): Promise<void> => undefined);
  Object.assign(service, {
    getCurrentEditableQuarterReview: jest.fn(async (): Promise<IQuarterReview> => review),
    assertActiveQuarterAssignment: jest.fn(async (): Promise<object> => ({ WorkplanItemKey: 'assignment', ItemType: 'CoreGold', KPIID: 'SO1-001' })),
    getQuarterReviewItemsByKey: jest.fn(async (): Promise<object[]> => [{ Id: 7 }]),
    mapStoredQuarterReviewItem: jest.fn((): IQuarterReviewItem => stored),
    getProductionConfig: jest.fn(async (): Promise<IProductionConfig> => config),
    getCoreKpiCatalogue: jest.fn(async (): Promise<object[]> => [kpi]),
    getItems, mergeJson, postJson, appendQuarterAudit,
    mapQuarterReviewItem: jest.fn((): IQuarterReviewItem => stored)
  });
  return { service, getItems, mergeJson, postJson, appendQuarterAudit };
};

const expectNoWrite = (run: IHarness): void => {
  expect(run.mergeJson).not.toHaveBeenCalled();
  expect(run.postJson).not.toHaveBeenCalled();
  expect(run.appendQuarterAudit).not.toHaveBeenCalled();
};

describe('SEC-R046-F01 direct SharePoint Quarter Review save admission', () => {
  it.each(['EMP-1', 'MGR-1'])('accepts the unique active current owner %s and writes the exact key', async key => {
    const run = harness();
    await expect(run.service.saveQuarterReviewItem(context, incoming(key), employee, config)).resolves.toBeDefined();
    expect(run.mergeJson).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ BTGOwnerPersonKey: key }), stored.etag, expect.any(String));
    expect(run.getItems).toHaveBeenCalledWith('KCFKPI_People', expect.any(String), "PersonKey eq 'EMP-1'", 'Id', 2);
    if (key === 'MGR-1') expect(run.getItems).toHaveBeenCalledWith('KCFKPI_People', expect.any(String), "PersonKey eq 'MGR-1'", 'Id', 2);
  });

  it.each([
    ['forged unrelated', 'OTHER-1', [personRow('EMP-1', true, 'MGR-1')], [personRow('OTHER-1')]],
    ['stale former manager', 'MGR-1', [personRow('EMP-1', true, 'MGR-2')], [personRow('MGR-1')]],
    ['inactive manager', 'MGR-1', [personRow('EMP-1', true, 'MGR-1')], [personRow('MGR-1', false)]],
    ['ambiguous manager', 'MGR-1', [personRow('EMP-1', true, 'MGR-1')], [personRow('MGR-1'), personRow('MGR-1')]],
    ['unknown manager', 'MGR-1', [personRow('EMP-1', true, 'MGR-1')], []],
    ['ambiguous employee', 'EMP-1', [personRow('EMP-1', true, 'MGR-1'), personRow('EMP-1', true, 'MGR-1')], []],
    ['inactive employee', 'EMP-1', [personRow('EMP-1', false, 'MGR-1')], []]
  ])('rejects %s before item write or audit', async (_name, key, subjectRows, managerRows) => {
    const run = harness(subjectRows, managerRows);
    await expect(run.service.saveQuarterReviewItem(context, incoming(key), employee, config)).rejects.toThrow();
    expectNoWrite(run);
  });

  it('rejects a missing owner before item write or audit', async () => {
    const run = harness();
    await expect(run.service.saveQuarterReviewItem(context, incoming(), employee, config)).rejects.toThrow('Select a recovery owner.');
    expectNoWrite(run);
  });

  it('rejects a replayed item snapshot before owner lookup, item write or audit', async () => {
    const run = harness();
    await expect(run.service.saveQuarterReviewItem(context, { ...incoming('MGR-1'), etag: '"2"' }, employee, config)).rejects.toThrow(/changed/);
    expect(run.getItems).not.toHaveBeenCalled();
    expectNoWrite(run);
  });
});
