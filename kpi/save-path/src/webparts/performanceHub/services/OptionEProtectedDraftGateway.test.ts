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
  schemaVersion: 'demo.workplan-draft/v1',
  core: { weightingMode: 'Equal', entries: [{ coreId: 'CORE-1', kpiId: 'KPI-1',
    kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2027|v1', role: 'Delivery',
    contributionMethod: 'AdditiveDirect', weightPercent: 100, annual: { value: 1 }, q1: {}, q2: {}, q3: {}, q4: {} }] },
  impact: [],
  behaviours: { frameworkVersion: 'DEMO-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
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
  Id: 3, UniqueId: 'D827D77B-4676-45C9-8DD4-C5566221961F', PersonKey: 'PERSON-001',
  Email: employeeEmail, Active: true, ...patch
});
const control = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  Id: 8, UniqueId: 'EFDE3826-84F3-488B-894D-A532E3FEF6A4', '@odata.etag': '"control-4"',
  WorkplanKey: 'PERSON-001|2027', PersonKey: 'PERSON-001', PerformanceYear: 2027, DraftItemId: 17,
  DraftSchemaVersion: 'demo.workplan-draft/v1', State: 'Draft', TransitionStatus: 'Ready',
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
  new OptionEProtectedDraftGateway(sp as unknown as SPHttpClient, 'https://tenant.example.invalid/sites/demo-test',
    employeeEmail, OPTION_E_WORKPLAN_LIST_BINDINGS, {} as SPHttpClientConfiguration, draftStore);
const queueBinding = (sp: ReturnType<typeof client>, peopleRows = [people()], controlRows = [control()]): void => {
  sp.get.mockResolvedValueOnce(response(200, { value: peopleRows }))
    .mockResolvedValueOnce(response(200, { value: controlRows }));
};
const expectedBinding = (): IOptionEProtectedDraftBinding => ({
  peopleItemId: 3, peopleUniqueId: 'D827D77B-4676-45C9-8DD4-C5566221961F', email: employeeEmail,
  personKey: 'PERSON-001', workplanItemId: 8,
  workplanUniqueId: 'EFDE3826-84F3-488B-894D-A532E3FEF6A4', workplanEtag: '"control-4"',
  workplanKey: 'PERSON-001|2027', performanceYear: 2027, draftItemId: 17,
  draftSchemaVersion: 'demo.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready',
  pendingRequestKey: '', rowVersionToken: 4
});

describe('Option E protected People/Workplans Draft gateway', () => {
  it.each(['People', 'Workplans'] as const)(
    'rejects own and inherited OData3/OData4 continuation on %s before Draft access or update', async authority => {
      for (const marker of ['odata.nextLink', '@odata.nextLink']) {
        for (const inherited of [false, true]) {
          for (const operation of ['read', 'update'] as const) {
            const sp = client(), draftStore = store(), route = gateway(sp, draftStore);
            const envelope = { value: [authority === 'People' ? people() : control()] };
            const continuation = { [marker]: 'https://unexpected.example.invalid/next-page' };
            if (inherited) Object.setPrototypeOf(envelope, continuation);
            else Object.assign(envelope, continuation);
            if (authority === 'Workplans') sp.get.mockResolvedValueOnce(response(200, { value: [people()] }));
            sp.get.mockResolvedValueOnce(response(200, envelope));
            const result = operation === 'read' ? route.read(context) : route.updateExact({
              context, expectedBinding: expectedBinding(), itemId: 17, expectedEtag: '"draft-1"', prepared,
              clientSaveId: '86671E71-2D5C-4741-8F3A-DE1F94B80967', clientSavedAt: '2026-09-18T01:00:00.000Z'
            });
            await expect(result).rejects.toMatchObject({
              code: authority === 'People' ? 'EMPLOYEE_INACCESSIBLE' : 'CONTROL_INACCESSIBLE'
            });
            expect(draftStore.readExact).not.toHaveBeenCalled(); expect(draftStore.updateExact).not.toHaveBeenCalled();
            expect(sp.post).not.toHaveBeenCalled(); expect(sp.get).toHaveBeenCalledTimes(authority === 'People' ? 1 : 2);
            for (const [url] of sp.get.mock.calls) expect(new URL(url).searchParams.get('$top')).toBe('2');
            expect(sp.get.mock.calls.some(([url]) => url.includes('unexpected.example.invalid'))).toBe(false);
          }
        }
      }
    });

  it.each(['People', 'Workplans'] as const)(
    'rejects malformed continuation and legacy/mixed %s envelopes without evaluating their markers', async authority => {
      for (const marker of ['odata.nextLink', '@odata.nextLink', '__next', 'd', 'results']) {
        for (const markerValue of [undefined, null, '', false, 1, {}]) {
          const sp = client(), draftStore = store();
          if (authority === 'Workplans') sp.get.mockResolvedValueOnce(response(200, { value: [people()] }));
          sp.get.mockResolvedValueOnce(response(200, { value: [authority === 'People' ? people() : control()], [marker]: markerValue }));
          await expect(gateway(sp, draftStore).read(context)).rejects.toMatchObject({
            code: authority === 'People' ? 'EMPLOYEE_INACCESSIBLE' : 'CONTROL_INACCESSIBLE'
          });
          expect(draftStore.readExact).not.toHaveBeenCalled(); expect(draftStore.updateExact).not.toHaveBeenCalled();
        }
        for (const inherited of [false, true]) {
          const sp = client(), draftStore = store(), getter = jest.fn(() => 'unread continuation');
          const envelope = { value: [authority === 'People' ? people() : control()] };
          const holder = inherited ? {} : envelope;
          Object.defineProperty(holder, marker, { get: getter });
          if (inherited) Object.setPrototypeOf(envelope, holder);
          if (authority === 'Workplans') sp.get.mockResolvedValueOnce(response(200, { value: [people()] }));
          sp.get.mockResolvedValueOnce(response(200, envelope));
          await expect(gateway(sp, draftStore).read(context)).rejects.toMatchObject({
            code: authority === 'People' ? 'EMPLOYEE_INACCESSIBLE' : 'CONTROL_INACCESSIBLE'
          });
          expect(getter).not.toHaveBeenCalled(); expect(draftStore.readExact).not.toHaveBeenCalled();
          expect(draftStore.updateExact).not.toHaveBeenCalled();
        }
      }
    });

  it.each(['People', 'Workplans'] as const)(
    'requires own data-array rows in the supported %s collection envelope', async authority => {
      const row = authority === 'People' ? people() : control(), getter = jest.fn(() => [row]);
      const inherited = Object.create({ value: [row] });
      const accessor = Object.defineProperty({}, 'value', { get: getter });
      const malformed: unknown[] = [undefined, null, false, 'invalid', [], {}, { value: undefined }, { value: null },
        { value: row }, { value: [null] }, { value: [1] }, { value: [[]] }, inherited, accessor,
        { d: { results: [row] } }, { results: [row] }, { value: [row], d: { results: [row] } },
        { value: [row], results: [row] }];
      for (const envelope of malformed) {
        const sp = client(), draftStore = store();
        if (authority === 'Workplans') sp.get.mockResolvedValueOnce(response(200, { value: [people()] }));
        sp.get.mockResolvedValueOnce(response(200, envelope));
        await expect(gateway(sp, draftStore).read(context)).rejects.toMatchObject({
          code: authority === 'People' ? 'EMPLOYEE_INACCESSIBLE' : 'CONTROL_INACCESSIBLE'
        });
        expect(draftStore.readExact).not.toHaveBeenCalled(); expect(draftStore.updateExact).not.toHaveBeenCalled();
        expect(sp.get).toHaveBeenCalledTimes(authority === 'People' ? 1 : 2); expect(sp.post).not.toHaveBeenCalled();
      }
      expect(getter).not.toHaveBeenCalled();
    });

  it('reads OData3 protected row metadata with a real-field-only select', async () => {
    const sp = client(), actual = control(); delete actual['@odata.etag']; actual['odata.etag'] = '"control-4"';
    queueBinding(sp, [people()], [actual]);
    expect((await gateway(sp, store()).read(context)).binding.workplanEtag).toBe('"control-4"');
    const [url, , options] = sp.get.mock.calls[1];
    expect(new URL(url).searchParams.get('$select')!.split(',')).not.toContain('@odata.etag');
    expect(options.headers.Accept).toBe('application/json;odata.metadata=minimal');
  });

  it('never substitutes a collection HTTP ETag for missing entity metadata', async () => {
    const sp = client(), actual = control(); delete actual['@odata.etag'];
    sp.get.mockResolvedValueOnce(response(200, { value: [people()] })).mockResolvedValueOnce({
      ...response(200, { value: [actual] }), headers: { get: () => '"collection-1"' }
    });
    await expect(gateway(sp, store()).read(context)).rejects.toMatchObject({ code: 'CONTROL_IDENTITY_INVALID' });
  });

  it.each(['*', '"different"', undefined, null])('rejects inconsistent protected metadata %s', async etag => {
    const sp = client(); queueBinding(sp, [people()], [control({ 'odata.etag': etag })]);
    const draftStore = store();
    await expect(gateway(sp, draftStore).read(context)).rejects.toMatchObject({ code: 'CONTROL_IDENTITY_INVALID' });
    expect(draftStore.readExact).not.toHaveBeenCalled(); expect(draftStore.updateExact).not.toHaveBeenCalled();
  });

  it.each(['clientSaveId', 'clientSavedAt'] as const)(
    'rejects inherited/accessor/nonprimitive %s before authority reads or forwarding', async field => {
      for (const shape of ['inherited', 'accessor', 'coercible', 'missing'] as const) {
        const sp = client(); const draftStore = store(); queueBinding(sp);
        const request: IOptionEDraftExactUpdate = { context, expectedBinding: expectedBinding(), itemId: 17,
          expectedEtag: '"draft-1"', prepared, clientSaveId: '86671E71-2D5C-4741-8F3A-DE1F94B80967',
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
      expectedEtag: '"draft-1"', prepared, clientSaveId: '86671E71-2D5C-4741-8F3A-DE1F94B80967',
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
      clientSaveId: '86671E71-2D5C-4741-8F3A-DE1F94B80967', clientSavedAt: '2026-09-18T01:00:00.000Z'
    }));
  });

  it('opens through fresh exact People and Workplans authority before reading the exact Draft item', async () => {
    const sp = client(); const draftStore = store(); queueBinding(sp);
    const result = await gateway(sp, draftStore).read(context);
    expect(result.binding).toEqual(expectedBinding());
    expect(draftStore.readExact).toHaveBeenCalledWith(17);
    expect(sp.get).toHaveBeenCalledTimes(2);
    expect(sp.get.mock.calls[0][0]).toContain('DEMOAPP_People');
    expect(decodeURIComponent(sp.get.mock.calls[0][0])).toContain(`Email eq '${employeeEmail}' and Active eq 1`);
    expect(sp.get.mock.calls[1][0]).toContain('DEMOAPP_Workplans');
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
      { patch: { DraftSchemaVersion: 'demo.workplan-draft/v2' }, code: 'CONTROL_SCHEMA_MISMATCH' },
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
      { State: 'ChangesRequested' }, { DraftSchemaVersion: 'demo.workplan-draft/v2' }
    ];
    for (const change of changes) {
      const sp = client(); const draftStore = store(); queueBinding(sp, [people()], [control(change)]);
      await expect(gateway(sp, draftStore).updateExact({ context, expectedBinding: expectedBinding(), itemId: 17,
        expectedEtag: '"draft-1"', prepared, clientSaveId: '86671E71-2D5C-4741-8F3A-DE1F94B80967',
        clientSavedAt: '2026-09-18T01:00:00.000Z' })).rejects.toBeInstanceOf(Error);
      expect(draftStore.updateExact).not.toHaveBeenCalled();
    }
  });

  it('performs one exact Draft update only after a fresh matching binding', async () => {
    const sp = client(); const draftStore = store(); queueBinding(sp);
    await gateway(sp, draftStore).updateExact({ context, expectedBinding: expectedBinding(), itemId: 17,
      expectedEtag: '"draft-1"', prepared, clientSaveId: '86671E71-2D5C-4741-8F3A-DE1F94B80967',
      clientSavedAt: '2026-09-18T01:00:00.000Z' });
    expect(draftStore.updateExact).toHaveBeenCalledTimes(1);
    expect(draftStore.updateExact.mock.calls[0][0]).toEqual({ itemId: 17, expectedEtag: '"draft-1"', prepared,
      clientSaveId: '86671E71-2D5C-4741-8F3A-DE1F94B80967', clientSavedAt: '2026-09-18T01:00:00.000Z' });
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
