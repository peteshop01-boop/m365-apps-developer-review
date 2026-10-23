jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import { canonicaliseOptionEDraft, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import {
  type IOptionEDraftContentRecord,
  type IOptionEDraftExactUpdate,
  type IOptionEDraftItemStore,
  type IOptionEDraftPreparedPayload,
  type IOptionEProtectedDraftBinding
} from './OptionEDraftSharePointGateway';
import { OptionEProtectedDraftGateway } from './OptionEProtectedDraftGateway';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './OptionEWorkplanListBindings';
import type { SPHttpClient, SPHttpClientConfiguration } from '@microsoft/sp-http';

const employeeEmail = 'employee@example.invalid';
const context = { performanceYear: 2027 };
const aggregate: IOptionEWorkplanDraftAggregate = {
  schemaVersion: 'kcf.workplan-draft/v1',
  core: { weightingMode: 'Equal', entries: [{ coreId: 'CORE-1', kpiId: 'KPI-1',
    kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2027|v1', role: 'Delivery',
    contributionMethod: 'AdditiveDirect', weightPercent: 100, annual: { value: 1 }, q1: {}, q2: {}, q3: {}, q4: {} }] },
  impact: [],
  behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: (['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const).map(valueId => ({
      valueId, descriptorKey: `D|${valueId}`, guidancePromptKeys: [1, 2, 3, 4, 5].map(index => `${valueId}|${index}`),
      selectedPromptKeys: [`${valueId}|1`], commitment: `Commit ${valueId}`,
      periodCommitments: { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4' }
    })) }
};
const payloadJson = canonicaliseOptionEDraft(aggregate);
const prepared: IOptionEDraftPreparedPayload = { aggregate, payloadJson, payloadSha256: 'A'.repeat(64) };
const content: IOptionEDraftContentRecord = { itemId: 17, etag: '"draft-1"', aggregate, payloadJson,
  payloadSha256: prepared.payloadSha256, clientSaveId: 'initial', clientSavedAt: '2026-09-18T00:00:00.000Z' };

const people = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  Id: 3, UniqueId: '6906d187-3451-467a-a362-10ddc87449f7', PersonKey: 'PERSON-001',
  Email: employeeEmail, Active: true, ...patch
});
const control = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  Id: 8, UniqueId: 'bc86e3b4-7317-4c6f-ac4d-099462cee169', '@odata.etag': '"control-4"',
  WorkplanKey: 'PERSON-001|2027', PersonKey: 'PERSON-001', PerformanceYear: 2027, DraftItemId: 17,
  DraftSchemaVersion: 'kcf.workplan-draft/v1', State: 'Draft', TransitionStatus: 'Ready',
  PendingRequestKey: null, RowVersionToken: 4, ...patch
});
const response = (status: number, body: unknown = {}): { status: number; ok: boolean; json(): Promise<unknown> } => ({
  status, ok: status >= 200 && status < 300, json: async () => body
});
const client = (): { get: jest.Mock; post: jest.Mock } => ({ get: jest.fn(), post: jest.fn() });
interface IFakeStore extends IOptionEDraftItemStore {
  prepare: jest.Mock;
  readExact: jest.Mock;
  updateExact: jest.Mock;
}
const store = (): IFakeStore => ({
  prepare: jest.fn(async () => prepared), readExact: jest.fn(async () => content), updateExact: jest.fn(async () => undefined)
});
const gateway = (sp: ReturnType<typeof client>, draftStore: IFakeStore): OptionEProtectedDraftGateway =>
  new OptionEProtectedDraftGateway(sp as unknown as SPHttpClient, 'https://tenant.example.invalid/sites/kcf-test',
    employeeEmail, OPTION_E_WORKPLAN_LIST_BINDINGS, {} as SPHttpClientConfiguration, draftStore);
const queueBinding = (sp: ReturnType<typeof client>, peopleRows = [people()], controlRows = [control()]): void => {
  sp.get.mockResolvedValueOnce(response(200, { value: peopleRows }))
    .mockResolvedValueOnce(response(200, { value: controlRows }));
};
const expectedBinding = (): IOptionEProtectedDraftBinding => ({
  peopleItemId: 3, peopleUniqueId: '6906d187-3451-467a-a362-10ddc87449f7', email: employeeEmail,
  personKey: 'PERSON-001', workplanItemId: 8,
  workplanUniqueId: 'bc86e3b4-7317-4c6f-ac4d-099462cee169', workplanEtag: '"control-4"',
  workplanKey: 'PERSON-001|2027', performanceYear: 2027, draftItemId: 17,
  draftSchemaVersion: 'kcf.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready',
  pendingRequestKey: '', rowVersionToken: 4
});

describe('Option E protected People/Workplans Draft gateway', () => {
  it.each(['clientSaveId', 'clientSavedAt'] as const)(
    'rejects inherited/accessor/nonprimitive %s before authority reads or forwarding', async field => {
      for (const shape of ['inherited', 'accessor', 'coercible', 'missing'] as const) {
        const sp = client(); const draftStore = store(); queueBinding(sp);
        const request: IOptionEDraftExactUpdate = { context, expectedBinding: expectedBinding(), itemId: 17,
          expectedEtag: '"draft-1"', prepared, clientSaveId: 'a43afb76-f56b-4016-a860-8b8039ace574',
          clientSavedAt: '2026-09-18T01:00:00.000Z' };
        const value = request[field]; const getter = jest.fn(() => value);
        const coerce = jest.fn(() => value);
        if (shape === 'inherited') {
          delete (request as unknown as Record<string, unknown>)[field];
          const prototype = Object.create(null);
          Object.defineProperty(prototype, field, { get: getter });
          Object.setPrototypeOf(request, prototype);
        } else if (shape === 'accessor') Object.defineProperty(request, field, { get: getter });
        else if (shape === 'coercible') Object.defineProperty(request, field, { value: { toString: coerce } });
        else delete (request as unknown as Record<string, unknown>)[field];
        await expect(gateway(sp, draftStore).updateExact(request)).rejects.toMatchObject({ code: 'DRAFT_INVALID' });
        expect(getter).not.toHaveBeenCalled(); expect(coerce).not.toHaveBeenCalled();
        expect(sp.get).not.toHaveBeenCalled(); expect(draftStore.updateExact).not.toHaveBeenCalled();
      }
    });

  it('forwards captured own save metadata when the caller replaces it during authority resolution', async () => {
    const sp = client(); const draftStore = store();
    const request: IOptionEDraftExactUpdate = { context, expectedBinding: expectedBinding(), itemId: 17,
      expectedEtag: '"draft-1"', prepared, clientSaveId: 'a43afb76-f56b-4016-a860-8b8039ace574',
      clientSavedAt: '2026-09-18T01:00:00.000Z' };
    const getter = jest.fn(() => 'replacement');
    sp.get.mockImplementationOnce(async () => {
      Object.defineProperty(request, 'clientSaveId', { get: getter });
      Object.defineProperty(request, 'clientSavedAt', { get: getter });
      return response(200, { value: [people()] });
    }).mockResolvedValueOnce(response(200, { value: [control()] }));
    await gateway(sp, draftStore).updateExact(request);
    expect(getter).not.toHaveBeenCalled();
    expect(draftStore.updateExact).toHaveBeenCalledWith(expect.objectContaining({
      clientSaveId: 'a43afb76-f56b-4016-a860-8b8039ace574', clientSavedAt: '2026-09-18T01:00:00.000Z'
    }));
  });

  it('opens through fresh exact People and Workplans authority before reading the exact Draft item', async () => {
    const sp = client(); const draftStore = store(); queueBinding(sp);
    const result = await gateway(sp, draftStore).read(context);
    expect(result.binding).toEqual(expectedBinding());
    expect(draftStore.readExact).toHaveBeenCalledWith(17);
    expect(sp.get).toHaveBeenCalledTimes(2);
    expect(sp.get.mock.calls[0][0]).toContain('KCFKPI_People');
    expect(decodeURIComponent(sp.get.mock.calls[0][0])).toContain(`Email eq '${employeeEmail}' and Active eq 1`);
    expect(sp.get.mock.calls[1][0]).toContain('KCFKPI_Workplans');
    expect(decodeURIComponent(sp.get.mock.calls[1][0])).toContain("PersonKey eq 'PERSON-001' and PerformanceYear eq 2027");
  });

  it('exposes no caller PersonKey or DraftItemId and rejects a forged expected binding before Draft access', async () => {
    const sp = client(); const draftStore = store(); queueBinding(sp);
    const forged = { ...expectedBinding(), personKey: 'PERSON-OTHER', draftItemId: 999 };
    await expect(gateway(sp, draftStore).read(context, forged)).rejects.toMatchObject({ code: 'CONTROL_BINDING_STALE' });
    expect(draftStore.readExact).not.toHaveBeenCalled();
  });

  it('fails closed for missing, duplicate, inactive and inaccessible People', async () => {
    const cases: Array<{ status: number; rows?: Record<string, unknown>[]; code: string }> = [
      { status: 200, rows: [], code: 'EMPLOYEE_MISSING' },
      { status: 200, rows: [people(), people({ Id: 4 })], code: 'EMPLOYEE_DUPLICATE' },
      { status: 200, rows: [people({ Active: false })], code: 'EMPLOYEE_INACTIVE' },
      { status: 403, code: 'EMPLOYEE_INACCESSIBLE' }
    ];
    for (const item of cases) {
      const sp = client(); const draftStore = store();
      sp.get.mockResolvedValue(response(item.status, { value: item.rows }));
      await expect(gateway(sp, draftStore).read(context)).rejects.toMatchObject({ code: item.code });
      expect(draftStore.readExact).not.toHaveBeenCalled();
    }
  });

  it('fails closed for missing, duplicate and inaccessible protected Workplans', async () => {
    const cases: Array<{ status: number; rows?: Record<string, unknown>[]; code: string }> = [
      { status: 200, rows: [], code: 'CONTROL_MISSING' },
      { status: 200, rows: [control(), control({ Id: 9 })], code: 'CONTROL_DUPLICATE' },
      { status: 403, code: 'CONTROL_INACCESSIBLE' }
    ];
    for (const item of cases) {
      const sp = client(); const draftStore = store();
      sp.get.mockResolvedValueOnce(response(200, { value: [people()] }))
        .mockResolvedValueOnce(response(item.status, { value: item.rows }));
      await expect(gateway(sp, draftStore).read(context)).rejects.toMatchObject({ code: item.code });
      expect(draftStore.readExact).not.toHaveBeenCalled();
    }
  });

  it('rejects wrong cross-person/key/year and invalid or swapped Draft item bindings before Draft access', async () => {
    const cases: Array<{ patch: Record<string, unknown>; code: string }> = [
      { patch: { WorkplanKey: 'PERSON-OTHER|2027' }, code: 'CONTROL_IDENTITY_INVALID' },
      { patch: { PersonKey: 'PERSON-OTHER' }, code: 'CONTROL_IDENTITY_INVALID' },
      { patch: { PerformanceYear: 2026 }, code: 'CONTROL_IDENTITY_INVALID' },
      { patch: { DraftItemId: 0 }, code: 'DRAFT_ITEM_INVALID' },
      { patch: { DraftItemId: '017' }, code: 'DRAFT_ITEM_INVALID' },
      { patch: { DraftItemId: '18.0' }, code: 'DRAFT_ITEM_INVALID' }
    ];
    for (const item of cases) {
      const sp = client(); const draftStore = store(); queueBinding(sp, [people()], [control(item.patch)]);
      await expect(gateway(sp, draftStore).read(context)).rejects.toMatchObject({ code: item.code });
      expect(draftStore.readExact).not.toHaveBeenCalled();
    }
  });

  it('rejects non-editable state, non-Ready transition, pending request and schema mismatch', async () => {
    const cases: Array<{ patch: Record<string, unknown>; code: string }> = [
      { patch: { State: 'Submitted' }, code: 'CONTROL_NON_EDITABLE' },
      { patch: { TransitionStatus: 'AclPending' }, code: 'CONTROL_NOT_READY' },
      { patch: { PendingRequestKey: 'REQUEST-1' }, code: 'CONTROL_PENDING' },
      { patch: { DraftSchemaVersion: 'kcf.workplan-draft/v2' }, code: 'CONTROL_SCHEMA_MISMATCH' },
      { patch: { RowVersionToken: 4.5 }, code: 'CONTROL_IDENTITY_INVALID' },
      { patch: { '@odata.etag': '*' }, code: 'CONTROL_IDENTITY_INVALID' }
    ];
    for (const item of cases) {
      const sp = client(); const draftStore = store(); queueBinding(sp, [people()], [control(item.patch)]);
      await expect(gateway(sp, draftStore).read(context)).rejects.toMatchObject({ code: item.code });
      expect(draftStore.readExact).not.toHaveBeenCalled();
    }
  });

  it('re-resolves authority before update and makes zero Draft writes for any stale fingerprint', async () => {
    const changes: Array<Record<string, unknown>> = [
      { '@odata.etag': '"control-5"' }, { RowVersionToken: 5 }, { DraftItemId: 18 },
      { State: 'ChangesRequested' }, { DraftSchemaVersion: 'kcf.workplan-draft/v2' }
    ];
    for (const change of changes) {
      const sp = client(); const draftStore = store(); queueBinding(sp, [people()], [control(change)]);
      await expect(gateway(sp, draftStore).updateExact({ context, expectedBinding: expectedBinding(), itemId: 17,
        expectedEtag: '"draft-1"', prepared, clientSaveId: 'a43afb76-f56b-4016-a860-8b8039ace574',
        clientSavedAt: '2026-09-18T01:00:00.000Z' })).rejects.toBeInstanceOf(Error);
      expect(draftStore.updateExact).not.toHaveBeenCalled();
    }
  });

  it('performs one exact Draft update only after a fresh matching binding', async () => {
    const sp = client(); const draftStore = store(); queueBinding(sp);
    await gateway(sp, draftStore).updateExact({ context, expectedBinding: expectedBinding(), itemId: 17,
      expectedEtag: '"draft-1"', prepared, clientSaveId: 'a43afb76-f56b-4016-a860-8b8039ace574',
      clientSavedAt: '2026-09-18T01:00:00.000Z' });
    expect(draftStore.updateExact).toHaveBeenCalledTimes(1);
    expect(draftStore.updateExact.mock.calls[0][0]).toEqual({ itemId: 17, expectedEtag: '"draft-1"', prepared,
      clientSaveId: 'a43afb76-f56b-4016-a860-8b8039ace574', clientSavedAt: '2026-09-18T01:00:00.000Z' });
  });

  it('freshly resolves People and Workplans on every read and never caches protected authority', async () => {
    const sp = client(); const draftStore = store();
    queueBinding(sp); queueBinding(sp);
    const route = gateway(sp, draftStore);
    await route.read(context);
    await route.read(context, expectedBinding());
    expect(sp.get).toHaveBeenCalledTimes(4);
    expect(draftStore.readExact).toHaveBeenCalledTimes(2);
  });
});
