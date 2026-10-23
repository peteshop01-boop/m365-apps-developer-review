import { canonicaliseOptionEDraft, canonicaliseOptionEPartialDraft, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import {
  OptionEDraftAmbiguousWriteError,
  OptionEDraftConflictError,
  OptionEDraftRouteError,
  type IOptionEDraftCanonicalRecord,
  type IOptionEDraftExactUpdate,
  type IOptionEDraftGateway,
  type IOptionEDraftPreparedPayload,
  type IOptionEProtectedDraftBinding
} from '../services/OptionEDraftSharePointGateway';
import { OptionEDraftSaveController, type OptionEDraftSaveStatus } from './OptionEDraftSaveController';

const context = { performanceYear: 2027 };
const governedExtension = (wording: string): NonNullable<IOptionEWorkplanDraftAggregate['behaviours']['governedExtension']> => ({
  schemaVersion: 'demo.option-e.behaviours/v02',
  authority: { catalogueId: 'DEMO-DEMO-BEHAVIOUR-FOCUS', catalogueVersion: 'DEMO-BHV-PD03-2026.09-v2',
    catalogueRevision: 7, catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
    approvalReference: 'DEMO-APP-PETE-BEH-V02-001' },
  roleLevelCode: 'L1',
  headlines: (['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const).map((behaviourKey, index) => ({
    behaviourKey, headlineTitle: `Headline ${index + 1}`, selections: [{
      selectionKey: `${behaviourKey}-OWN-ABCDEF`, source: 'Own', behaviourKey,
      headlineTitle: `Headline ${index + 1}`, focusKey: `${behaviourKey}-FOCUS-01`, focusTitle: `Focus ${index + 1}`,
      roleLevelCode: 'L1', selectedWording: `${wording} ${behaviourKey}`,
      catalogueId: 'DEMO-DEMO-BEHAVIOUR-FOCUS', catalogueVersion: 'DEMO-BHV-PD03-2026.09-v2',
      catalogueRevision: 7, catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
      myCommitment: `${wording} ${behaviourKey}`, howWillWeKnow: `Evidence ${behaviourKey}`
    }]
  })),
  immutableSelectionSnapshots: true, legacyTargetRatingWeightFieldsWritten: false,
  deliveryArithmeticAffected: false
});
const binding = (patch: Partial<IOptionEProtectedDraftBinding> = {}): IOptionEProtectedDraftBinding => ({
  peopleItemId: 3, peopleUniqueId: 'D827D77B-4676-45C9-8DD4-C5566221961F',
  email: 'employee@example.invalid', personKey: 'PERSON-001', workplanItemId: 8,
  workplanUniqueId: 'EFDE3826-84F3-488B-894D-A532E3FEF6A4', workplanEtag: '"control-4"',
  workplanKey: 'PERSON-001|2027', performanceYear: 2027, draftItemId: 17,
  draftSchemaVersion: 'demo.workplan-draft/v1', state: 'Draft', transitionStatus: 'Ready',
  pendingRequestKey: '', rowVersionToken: 4, ...patch
});
const aggregate = (wording: string): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'demo.workplan-draft/v1',
  core: { weightingMode: 'Custom', entries: [
    { coreId: 'CORE-1', kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2027|v1',
      role: 'Delivery', contributionMethod: 'AdditiveDirect', weightPercent: 40,
      annual: { value: 0 }, q1: { value: 0 }, q2: {}, q3: {}, q4: {} },
    { coreId: 'CORE-2', kpiId: 'KPI-2', kpiVersionKey: 'KPI-2|v1', targetVersionKey: 'KPI-2|2027|v1',
      role: 'Support', contributionMethod: 'CompletionOversight', weightPercent: 60,
      annual: { value: wording }, q1: {}, q2: {}, q3: {}, q4: {} }
  ] },
  impact: [],
  behaviours: { frameworkVersion: 'DEMO-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: (['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const).map(valueId => ({
      valueId, descriptorKey: `descriptor|${valueId}`,
      guidancePromptKeys: [1, 2, 3, 4, 5].map(index => `${valueId}|prompt|${index}`),
      selectedPromptKeys: [`${valueId}|prompt|1`], commitment: `${wording} ${valueId}`,
      periodCommitments: { Q1: 'one', Q2: 'two', Q3: 'three', Q4: 'four' }
    })), governedExtension: governedExtension(wording) }
});

const prepared = (value: IOptionEWorkplanDraftAggregate): IOptionEDraftPreparedPayload => {
  const payloadJson = canonicaliseOptionEPartialDraft(value);
  return { aggregate: JSON.parse(payloadJson) as IOptionEWorkplanDraftAggregate, payloadJson,
    payloadSha256: `${payloadJson.length.toString(16).toUpperCase().padStart(64, '0')}` };
};
const record = (value: IOptionEWorkplanDraftAggregate, etag = '"1"', clientSaveId = 'initial',
  protectedBinding = binding()): IOptionEDraftCanonicalRecord => {
  const payload = prepared(value);
  return { itemId: protectedBinding.draftItemId, etag, binding: protectedBinding,
    aggregate: payload.aggregate, payloadJson: payload.payloadJson, payloadSha256: payload.payloadSha256,
    clientSaveId, clientSavedAt: '2026-09-18T00:00:00.000Z', modified: '2026-09-18T00:00:01.000Z' };
};

interface IFakeGateway extends IOptionEDraftGateway {
  server: IOptionEDraftCanonicalRecord;
  prepare: jest.Mock<Promise<IOptionEDraftPreparedPayload>, [IOptionEWorkplanDraftAggregate]>;
  read: jest.Mock;
  updateExact: jest.Mock<Promise<void>, [IOptionEDraftExactUpdate]>;
}

const gateway = (initial: IOptionEWorkplanDraftAggregate): IFakeGateway => {
  const route = {
    server: record(initial),
    prepare: jest.fn(async (value: IOptionEWorkplanDraftAggregate) => prepared(value)),
    read: jest.fn(async () => route.server),
    updateExact: jest.fn(async (request: IOptionEDraftExactUpdate) => {
      route.server = { ...route.server, etag: `"${Number(route.server.etag.replace(/\D/g, '')) + 1}"`,
        aggregate: request.prepared.aggregate, payloadJson: request.prepared.payloadJson,
        payloadSha256: request.prepared.payloadSha256, clientSaveId: request.clientSaveId,
        clientSavedAt: request.clientSavedAt, modified: request.clientSavedAt };
    })
  } as IFakeGateway;
  return route;
};
const controller = (route: IFakeGateway,
  uuids = ['6C48236E-4055-4967-81CB-B77E4123431F']): OptionEDraftSaveController => {
  let index = 0;
  return new OptionEDraftSaveController(route, () => uuids[index++] || uuids[uuids.length - 1],
    () => new Date('2026-09-18T00:30:00.000Z'));
};

const deferred = (): { promise: Promise<void>; resolve(): void } => {
  let release = (): void => undefined;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, resolve: release };
};

describe('Option E protected retained-buffer save controller', () => {
  it.each([
    ['open', 'edit'], ['open', 'hold'], ['reload', 'edit'], ['reload', 'hold']
  ])('does not return an older %s buffer after a Saved observer makes an %s', async (operation, change) => {
    const route = gateway(aggregate('Initial')); const save = controller(route);
    if (operation === 'reload') await save.open(context);
    const newer = aggregate('Newer callback edit'); let enabled = false;
    save.subscribe(snapshot => {
      if (!enabled || snapshot.status !== 'Saved') return;
      enabled = false;
      if (change === 'edit') save.replaceBuffer(newer);
      else save.holdUnserializableChanges('Retain the newer editor source');
    });
    enabled = true;
    if (operation === 'open') await expect(save.open(context)).rejects.toThrow(/newer session changes/i);
    else expect(await save.reloadCanonical()).toBeUndefined();
    expect(save.snapshot.status).not.toBe('Saved');
    expect(save.snapshot.canonical!.aggregate).toEqual(prepared(aggregate('Initial')).aggregate);
    expect(save.snapshot.buffer).toEqual(change === 'edit' ? newer : undefined);
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(route.updateExact).not.toHaveBeenCalled();
  });
  it.each([
    ['readback', 'edit'], ['readback', 'hold'], ['ambiguous', 'edit'], ['ambiguous', 'hold']
  ])('returns current retained state after a %s Saved observer makes an %s', async (outcome, change) => {
    const route = gateway(aggregate('Initial')); const save = controller(route); await save.open(context);
    const submitted = aggregate('Submitted'); const newer = aggregate('Newer callback edit');
    save.replaceBuffer(submitted);
    let enabled = false;
    save.subscribe(snapshot => {
      if (!enabled || snapshot.status !== 'Saved') return;
      enabled = false;
      if (change === 'edit') save.replaceBuffer(newer);
      else save.holdUnserializableChanges('Retain the newer editor source');
    });
    if (outcome === 'ambiguous') route.updateExact.mockImplementationOnce(async request => {
      route.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId), clientSavedAt: request.clientSavedAt };
      throw new OptionEDraftAmbiguousWriteError();
    });
    enabled = true;
    const result = await save.save();
    expect(result.status).toBe(change === 'edit' ? 'Unsaved' : 'NotSaved');
    expect(result).toEqual(save.snapshot);
    expect(result.canonical!.aggregate).toEqual(prepared(submitted).aggregate);
    expect(result.buffer).toEqual(change === 'edit' ? newer : undefined);
    expect(result.retainedBuffer).toBe(true);
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });
  it('does not notify a listener twice when it is added during Saving publication', async () => {
    const route = gateway(aggregate('Initial')); const save = controller(route); await save.open(context);
    save.replaceBuffer(aggregate('Edited'));
    const states: OptionEDraftSaveStatus[] = [];
    save.subscribe(snapshot => {
      if (snapshot.status === 'Saving') save.subscribe(next => states.push(next.status));
    });
    expect((await save.save()).status).toBe('Saved');
    expect(states).toEqual(['Saving', 'Saved']);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });
  it('does not revisit a listener re-subscribed during the same Saving publication', async () => {
    const route = gateway(aggregate('Initial')); const save = controller(route); await save.open(context);
    save.replaceBuffer(aggregate('Edited'));
    let calls = 0; let resubscribing = false; let unsubscribe = (): void => undefined;
    const listener = (snapshot: { status: OptionEDraftSaveStatus }): void => {
      if (snapshot.status !== 'Saving' || resubscribing) return;
      calls += 1;
      // Bound the defective live-Set traversal so the before regression cannot hang.
      if (calls < 3) {
        unsubscribe(); resubscribing = true;
        unsubscribe = save.subscribe(listener); resubscribing = false;
      }
    };
    unsubscribe = save.subscribe(listener);
    expect((await save.save()).status).toBe('Saved');
    expect(calls).toBe(1);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
  it.each(['Idle', 'Loading', 'Saving', 'Checking', 'Saved', 'NotSaved'] as const)(
    'isolates a throwing %s observer while preserving operation and healthy-observer truth', async faultState => {
      const diagnostic = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      try {
        const route = gateway(aggregate('Initial')); const save = controller(route);
        let enabled = faultState === 'Idle' || faultState === 'Loading';
        let unsubscribe: (() => void) | undefined;
        expect(() => { unsubscribe = save.subscribe(snapshot => {
          if (enabled && snapshot.status === faultState) throw new Error('Synthetic private observer detail');
        }); }).not.toThrow();
        const states: OptionEDraftSaveStatus[] = [];
        save.subscribe(snapshot => states.push(snapshot.status));
        await save.open(context); enabled = true;
        save.replaceBuffer(aggregate('Edited'));
        if (faultState === 'Checking') route.updateExact.mockImplementationOnce(async request => {
          route.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId), clientSavedAt: request.clientSavedAt };
          throw new OptionEDraftAmbiguousWriteError();
        });
        if (faultState === 'NotSaved') route.updateExact.mockRejectedValueOnce(new Error('Synthetic write failed'));
        const result = await save.save();
        expect(result.status).toBe(faultState === 'NotSaved' ? 'NotSaved' : 'Saved');
        expect(states[states.length - 1]).toBe(result.status);
        expect(route.updateExact).toHaveBeenCalledTimes(1);
        expect(result.buffer).toEqual(prepared(aggregate('Edited')).aggregate);
        expect(diagnostic).toHaveBeenCalledWith('Option E Draft subscriber failed.');
        expect(diagnostic.mock.calls.flat().join(' ')).not.toContain('Synthetic private observer detail');
        expect(typeof unsubscribe).toBe('function'); unsubscribe!();
      } finally { diagnostic.mockRestore(); }
    });
  it('isolates getter snapshots from protected target, context and buffer mutation', async () => {
    const route = gateway(aggregate('Initial')); const save = controller(route); await save.open(context);
    const exposed = save.snapshot;
    exposed.context!.performanceYear = 2030; exposed.canonical!.itemId = 99; exposed.canonical!.etag = '"99"';
    Object.assign(exposed.canonical!.binding, { draftItemId: 99, personKey: 'OTHER' });
    exposed.canonical!.aggregate.core.entries[0].annual.value = 999;
    exposed.buffer!.core.entries[0].annual.value = 999;
    expect(save.snapshot.context).toEqual(context);
    expect(save.snapshot.canonical).toEqual(record(aggregate('Initial')));
    expect(save.snapshot.buffer).toEqual(prepared(aggregate('Initial')).aggregate);
    await save.save();
    expect(route.updateExact.mock.calls[0][0]).toMatchObject({ itemId: 17, expectedEtag: '"1"',
      context, expectedBinding: { draftItemId: 17, personKey: 'PERSON-001' } });
  });
  it('gives each subscriber its own snapshot without allowing observer edits into Save', async () => {
    const route = gateway(aggregate('Initial')); const save = controller(route); await save.open(context);
    save.subscribe(snapshot => {
      if (snapshot.buffer) snapshot.buffer.core.entries[0].annual.value = 999;
      if (snapshot.context) snapshot.context.performanceYear = 2030;
      if (snapshot.canonical) snapshot.canonical.etag = '"99"';
    });
    const observed: number[] = [];
    save.subscribe(snapshot => { if (snapshot.buffer) observed.push(snapshot.buffer.core.entries[0].annual.value as number); });
    save.replaceBuffer(aggregate('Edited')); await save.save();
    expect(observed.every(value => value === 0)).toBe(true);
    expect(save.snapshot.buffer!.core.entries[0].annual.value).toBe(0);
    expect(route.updateExact.mock.calls[0][0]).toMatchObject({ expectedEtag: '"1"', context });
  });
  it('detaches a loaded canonical record from later gateway-owned object mutation', async () => {
    const route = gateway(aggregate('Initial')); const save = controller(route); await save.open(context);
    route.server.etag = '"9"'; route.server.aggregate.core.entries[0].annual.value = 999;
    Object.assign(route.server.binding, { draftItemId: 99 });
    expect(save.snapshot.canonical).toEqual(record(aggregate('Initial')));
    await save.save();
    expect(route.updateExact.mock.calls[0][0]).toMatchObject({ itemId: 17, expectedEtag: '"1"',
      expectedBinding: { draftItemId: 17 } });
  });
  it('returns a detached Save result so consumers cannot rewrite the settled state', async () => {
    const route = gateway(aggregate('Initial')); const save = controller(route); await save.open(context);
    save.replaceBuffer(aggregate('Edited')); const result = await save.save();
    result.status = 'NotSaved'; result.context!.performanceYear = 2030;
    result.canonical!.etag = '"99"'; result.buffer!.core.entries[0].annual.value = 999;
    expect(save.snapshot.status).toBe('Saved'); expect(save.snapshot.context).toEqual(context);
    expect(save.snapshot.canonical!.etag).toBe('"2"');
    expect(save.snapshot.buffer).toEqual(prepared(aggregate('Edited')).aggregate);
  });
  it('detaches the immediate Save result while a canonical load is pending', async () => {
    const route = gateway(aggregate('Initial')); const save = controller(route); const pending = deferred();
    route.read.mockImplementationOnce(async () => { await pending.promise; return route.server; });
    const opening = save.open(context); const result = await save.save();
    result.context!.performanceYear = 2030; result.status = 'Saved';
    expect(save.snapshot.context).toEqual(context); expect(save.snapshot.status).toBe('NotSaved');
    pending.resolve(); await opening;
    expect(save.snapshot.context).toEqual(context);
  });
  it('ignores an older reload completion after a newer reload has settled', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const pending = deferred();
    route.read.mockImplementationOnce(async () => { await pending.promise; return record(aggregate('Old')); });
    const older = save.reloadCanonical();
    route.read.mockResolvedValueOnce(record(aggregate('New'), '"2"'));
    await save.reloadCanonical();
    pending.resolve();
    expect(await older).toBeUndefined();
    expect(save.snapshot.buffer).toEqual(prepared(aggregate('New')).aggregate);
    expect(save.snapshot.status).toBe('Saved');
  });

  it('retains newer unserializable editor changes when a reload settles', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const pending = deferred();
    route.read.mockImplementationOnce(async () => { await pending.promise; return record(aggregate('Server'), '"2"'); });
    const reload = save.reloadCanonical();
    save.holdUnserializableChanges('Retain classified Impact in the editor');
    pending.resolve();
    expect(await reload).toBeUndefined();
    expect(save.snapshot.buffer).toBeUndefined();
    expect(save.snapshot.detail).toBe('Retain classified Impact in the editor');
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    await save.save();
    expect(route.updateExact).not.toHaveBeenCalled();
  });

  it('detaches the requested year from a caller mutation while opening', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    const pending = deferred();
    route.read.mockImplementationOnce(async () => { await pending.promise; return route.server; });
    const requested = { performanceYear: 2027 };
    const opening = save.open(requested);
    requested.performanceYear = 2028;
    pending.resolve(); await opening;
    expect(save.snapshot.context).toEqual({ performanceYear: 2027 });
    expect(route.read.mock.calls[0][0]).toEqual({ performanceYear: 2027 });
  });

  it('rejects an older open completion without replacing the newer Draft or context', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    const oldRead = deferred();
    route.read.mockImplementationOnce(async () => { await oldRead.promise; return record(aggregate('Old')); });
    const oldOpen = save.open(context);
    const oldOutcome = oldOpen.then(() => 'resolved', error => (error as Error).message);
    const newerContext = { performanceYear: 2028 };
    route.read.mockResolvedValueOnce(record(aggregate('New'), '"2"', 'new', binding({ performanceYear: 2028 })));
    await save.open(newerContext);
    oldRead.resolve();
    expect(await oldOutcome).toMatch(/superseded/i);
    expect(save.snapshot.context).toEqual(newerContext);
    expect(save.snapshot.buffer).toEqual(prepared(aggregate('New')).aggregate);
  });

  it('does not publish an older read failure over a newer successful open', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    const oldRead = deferred();
    route.read.mockImplementationOnce(async () => { await oldRead.promise; throw new Error('Old request failed'); });
    const oldOutcome = save.open(context).catch(error => error);
    route.read.mockResolvedValueOnce(record(aggregate('New'), '"2"'));
    await save.open(context);
    oldRead.resolve(); await oldOutcome;
    expect(save.snapshot.status).toBe('Saved');
    expect(save.snapshot.buffer).toEqual(prepared(aggregate('New')).aggregate);
  });

  it('does not replace newer edits made while a canonical reload is pending', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const pending = deferred();
    route.read.mockImplementationOnce(async () => { await pending.promise; return record(aggregate('Server'), '"2"'); });
    const reload = save.reloadCanonical();
    const edited = aggregate('Edited during reload');
    save.replaceBuffer(edited);
    pending.resolve();
    expect(await reload).toBeUndefined();
    expect(save.snapshot.status).toBe('NotSaved');
    expect(save.snapshot.buffer).toEqual(edited);
    expect(save.snapshot.canonical?.etag).toBe('"2"');
    expect(save.shouldWarnBeforeUnload()).toBe(true);
  });

  it('prevents Save from writing against a canonical reload still in progress', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const pending = deferred();
    route.read.mockImplementationOnce(async () => { await pending.promise; return route.server; });
    const reload = save.reloadCanonical();
    save.replaceBuffer(aggregate('New unsaved'));
    await save.save();
    expect(route.updateExact).not.toHaveBeenCalled();
    pending.resolve(); await reload;
  });

  it('prevents open and reload from changing context while a protected Save is pending', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const preparing = deferred(), allowPrepare = deferred();
    route.prepare.mockImplementationOnce(async value => { preparing.resolve(); await allowPrepare.promise; return prepared(value); });
    save.replaceBuffer(aggregate('Save A'));
    const attempt = save.save(); await preparing.promise;
    await expect(save.open({ performanceYear: 2028 })).rejects.toThrow(/save.*progress/i);
    expect(await save.reloadCanonical()).toBeUndefined();
    expect(save.snapshot.context).toEqual(context);
    allowPrepare.resolve();
    expect((await attempt).status).toBe('Saved');
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });

  it('coalesces a synchronous Save requested by a Saving-state subscriber', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    save.replaceBuffer(aggregate('Draft A'));
    let nested: Promise<unknown> | undefined;
    let reacted = false;
    save.subscribe(snapshot => {
      if (snapshot.status === 'Saving' && !reacted) {
        reacted = true;
        nested = save.save();
      }
    });
    const attempt = save.save();
    expect((await attempt).status).toBe('Saved');
    expect(nested).toBe(attempt);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });

  it('coalesces simultaneous Save clicks into one protected ETag write and permits later Save', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route, [
      '6C48236E-4055-4967-81CB-B77E4123431F', '2D638EA5-94A6-4941-813B-D40D128F29DE'
    ]);
    await save.open(context);
    const writeStarted = deferred(), allowWrite = deferred();
    route.updateExact.mockImplementationOnce(async request => {
      writeStarted.resolve();
      await allowWrite.promise;
      route.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt, payloadJson: request.prepared.payloadJson,
        payloadSha256: request.prepared.payloadSha256 };
    });
    save.replaceBuffer(aggregate('Draft A'));
    const first = save.save();
    const duplicate = save.save();
    expect(duplicate).toBe(first);
    await writeStarted.promise;
    expect(route.updateExact).toHaveBeenCalledTimes(1);
    allowWrite.resolve();
    expect((await first).status).toBe('Saved');
    expect((await duplicate).status).toBe('Saved');
    expect(route.updateExact).toHaveBeenCalledTimes(1);
    save.replaceBuffer(aggregate('Draft B'));
    expect((await save.save()).status).toBe('Saved');
    expect(route.updateExact).toHaveBeenCalledTimes(2);
    expect(route.server.aggregate.core.entries[1].annual.value).toBe('Draft B');
  });

  it('does not silently save newer edits added while a duplicate Save is pending', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route, [
      '6C48236E-4055-4967-81CB-B77E4123431F', '2D638EA5-94A6-4941-813B-D40D128F29DE'
    ]);
    await save.open(context);
    const writeStarted = deferred(), allowWrite = deferred();
    route.updateExact.mockImplementationOnce(async request => {
      writeStarted.resolve();
      await allowWrite.promise;
      route.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt, payloadJson: request.prepared.payloadJson,
        payloadSha256: request.prepared.payloadSha256 };
    });
    save.replaceBuffer(aggregate('Draft A'));
    const first = save.save();
    await writeStarted.promise;
    const newer = aggregate('Draft B is still unsaved');
    save.replaceBuffer(newer);
    expect(save.save()).toBe(first);
    allowWrite.resolve();
    expect((await first).status).toBe('NotSaved');
    expect(save.snapshot.buffer).toEqual(newer);
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
    expect((await save.save()).status).toBe('Saved');
    expect(route.updateExact).toHaveBeenCalledTimes(2);
    expect(route.server.aggregate).toEqual(prepared(newer).aggregate);
  });

  it('saves unfinished Core Impact and Behaviours then reloads on another session', async () => {
    const route = gateway(aggregate('Initial'));
    const first = controller(route);
    await first.open(context);
    const unfinished = aggregate('Work in progress');
    unfinished.core.entries[0].role = '' as IOptionEWorkplanDraftAggregate['core']['entries'][number]['role'];
    unfinished.core.entries[0].weightPercent = 35;
    unfinished.core.entries[1].weightPercent = 0;
    unfinished.impact = [{
      impactId: 'IMPACT-001', wording: '', measure: 'Number / Quantity', unit: '', success: ''
    }];
    unfinished.behaviours.entries[0].commitment = '';
    unfinished.behaviours.governedExtension = undefined;
    expect(() => canonicaliseOptionEDraft(unfinished)).toThrow();
    first.replaceBuffer(unfinished);
    const result = await first.save();
    expect(result.status).toBe('Saved');
    expect(result.canonical?.aggregate).toEqual(unfinished);
    const second = controller(route);
    expect(await second.open(context)).toEqual(unfinished);
    expect(second.snapshot.status).toBe('Saved');
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });
  it('PM82 never saves an older buffer while the editor cannot serialize its current source values', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    save.replaceBuffer(aggregate('Older buffer'));
    save.holdUnserializableChanges('The captured source cannot be retained by this save contract.');
    expect((await save.save()).status).toBe('NotSaved');
    expect(save.snapshot.buffer).toBeUndefined();
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(route.prepare).not.toHaveBeenCalled();
    expect(route.updateExact).not.toHaveBeenCalled();
    save.replaceBuffer(aggregate('Current supported content'));
    expect((await save.save()).status).toBe('Saved');
    expect(route.server.aggregate.core.entries[1].annual.value).toBe('Current supported content');
  });

  it('PM82 preserves the source hold when an older asynchronous preparation finishes', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    save.replaceBuffer(aggregate('Preparing buffer'));
    const pending = deferred();
    route.prepare.mockImplementationOnce(async value => { await pending.promise; return prepared(value); });
    const result = save.save();
    save.holdUnserializableChanges('The latest source cannot be retained.');
    pending.resolve();
    expect((await result).status).toBe('NotSaved');
    expect(save.snapshot.buffer).toBeUndefined();
    expect(save.snapshot.detail).toBe('The latest source cannot be retained.');
    await save.save();
    expect(route.updateExact).not.toHaveBeenCalled();
    expect(route.prepare).toHaveBeenCalledTimes(1);
  });

  it('allows incomplete content, confirms exact Save, then close/reopen, continue and repeated Save recover A then B', async () => {
    const route = gateway(aggregate('Initial'));
    const first = controller(route, [
      '6C48236E-4055-4967-81CB-B77E4123431F', '2D638EA5-94A6-4941-813B-D40D128F29DE'
    ]);
    await first.open(context);
    first.replaceBuffer(aggregate('Draft A'));
    expect((await first.save()).status).toBe('Saved');
    expect(route.updateExact).toHaveBeenCalledTimes(1);
    expect(route.read).toHaveBeenCalledTimes(2);
    expect(route.updateExact.mock.calls[0][0]).toMatchObject({ context, expectedBinding: binding(), itemId: 17 });
    const reopenedA = controller(route);
    expect(await reopenedA.open(context)).toEqual(prepared(aggregate('Draft A')).aggregate);
    reopenedA.replaceBuffer(aggregate('Draft B'));
    expect((await reopenedA.save()).status).toBe('Saved');
    reopenedA.replaceBuffer(aggregate('Draft B'));
    expect((await reopenedA.save()).status).toBe('Saved');
    const reopenedB = controller(route);
    expect(await reopenedB.open(context)).toEqual(prepared(aggregate('Draft B')).aggregate);
    expect(route.updateExact).toHaveBeenCalledTimes(3);
  });

  it('turns 412 into Conflict only after protected readback, retains the buffer and permits explicit reapply', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const retained = aggregate('My retained change');
    save.replaceBuffer(retained);
    route.updateExact.mockImplementationOnce(async () => {
      route.server = record(aggregate('Other session'), '"2"', 'other-session');
      throw new OptionEDraftConflictError();
    });
    const conflict = await save.save();
    expect(conflict.status).toBe('Conflict');
    expect(conflict.buffer).toEqual(retained);
    expect(conflict.canResolveConflict).toBe(true);
    expect(conflict.requiresCanonicalReopen).toBe(false);
    expect(route.read).toHaveBeenLastCalledWith(context, binding());
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(save.reapplyRetainedBuffer()).toEqual(retained);
    expect((await save.save()).status).toBe('Saved');
    expect(route.updateExact.mock.calls[1][0].expectedEtag).toBe('"2"');
  });

  it('requires canonical reopen and disables reapply when protected binding changes during 412 readback', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    save.replaceBuffer(aggregate('Retained'));
    route.updateExact.mockRejectedValueOnce(new OptionEDraftConflictError());
    route.read.mockRejectedValueOnce(new OptionEDraftRouteError('CONTROL_BINDING_STALE', 'changed'));
    const result = await save.save();
    expect(result.status).toBe('Conflict');
    expect(result.requiresCanonicalReopen).toBe(true);
    expect(result.canResolveConflict).toBe(false);
    expect(save.reapplyRetainedBuffer()).toBeUndefined();
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });

  it('makes a fresh asynchronous protected reopen before explicitly discarding retained edits', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    save.replaceBuffer(aggregate('Retained'));
    route.server = record(aggregate('Fresh canonical'), '"2"', 'other-session');
    const readsBefore = route.read.mock.calls.length;
    expect(await save.reloadCanonical()).toEqual(prepared(aggregate('Fresh canonical')).aggregate);
    expect(route.read).toHaveBeenCalledTimes(readsBefore + 1);
    expect(route.read).toHaveBeenLastCalledWith(context);
    expect(save.snapshot.status).toBe('Saved');
    expect(save.shouldWarnBeforeUnload()).toBe(false);
  });

  it('retains the buffer with zero Save-route write after a pre-write protected binding failure', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const retained = aggregate('Local only'); save.replaceBuffer(retained);
    route.updateExact.mockRejectedValueOnce(new OptionEDraftRouteError('CONTROL_BINDING_STALE', 'changed before write'));
    const result = await save.save();
    expect(result.status).toBe('Conflict');
    expect(result.buffer).toEqual(retained);
    expect(result.requiresCanonicalReopen).toBe(true);
    expect(result.canResolveConflict).toBe(false);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });

  it.each(['prewrite', 'postwrite'] as const)('keeps %s admission unavailable NotSaved with full recovery and no blind retry', async phase => {
    const route = gateway(aggregate('Initial')), save = controller(route);
    await save.open(context);
    const prior = save.snapshot.canonical, retained = aggregate('Complete retained admission failure');
    save.replaceBuffer(retained);
    const states: OptionEDraftSaveStatus[] = [];
    const release = save.subscribe(snapshot => states.push(snapshot.status));
    const unavailable = new OptionEDraftRouteError('DRAFT_UNAVAILABLE', 'Private Save admission unavailable');
    if (phase === 'prewrite') route.updateExact.mockRejectedValueOnce(unavailable);
    else route.read.mockRejectedValueOnce(unavailable);
    const result = await save.save(); release();
    expect(result.status).toBe('NotSaved'); expect(result.visibleStatus).toBe('Not saved — your changes are retained');
    expect(states).not.toContain('Saved'); expect(result.buffer).toEqual(retained); expect(result.canonical).toEqual(prior);
    expect(result.retainedBuffer).toBe(true); expect(result.requiresCanonicalReopen).toBe(true);
    expect(result.canResolveConflict).toBe(false); expect(save.reapplyRetainedBuffer()).toBeUndefined();
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(result.detail).toBe(phase === 'prewrite'
      ? 'The protected Save checks could not be completed. No Draft write was issued. Private Save admission unavailable'
      : 'The Draft write was issued but the protected binding could not be re-confirmed. Private Save admission unavailable');
    expect(route.server.aggregate).toEqual(prepared(phase === 'prewrite' ? aggregate('Initial') : retained).aggregate);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
    const reads = route.read.mock.calls.length;
    await save.save(); expect(route.updateExact).toHaveBeenCalledTimes(1); expect(route.read).toHaveBeenCalledTimes(reads);
    expect(save.snapshot.buffer).toEqual(retained); expect(save.snapshot.status).toBe('NotSaved');
  });

  it('never reports Saved when protected control changes after one MERGE and requires canonical reopen without retry', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const retained = aggregate('Written but unconfirmed'); save.replaceBuffer(retained);
    route.read.mockRejectedValueOnce(new OptionEDraftRouteError('CONTROL_BINDING_STALE', 'changed after write'));
    const result = await save.save();
    expect(result.status).not.toBe('Saved');
    expect(result.buffer).toEqual(retained);
    expect(result.requiresCanonicalReopen).toBe(true);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });

  it('shows Checking save and recognises an ambiguous exact write with one maximum MERGE', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    const states: OptionEDraftSaveStatus[] = [];
    save.subscribe(snapshot => states.push(snapshot.status));
    await save.open(context);
    save.replaceBuffer(aggregate('Committed despite timeout'));
    route.updateExact.mockImplementationOnce(async request => {
      route.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt, payloadJson: request.prepared.payloadJson,
        payloadSha256: request.prepared.payloadSha256 };
      throw new OptionEDraftAmbiguousWriteError();
    });
    expect((await save.save()).status).toBe('Saved');
    expect(states).toEqual(expect.arrayContaining(['Saving', 'Checking', 'Saved']));
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });

  it('SESSION-01 preserves newer buffer B when exact Save A completes in flight and refuses a false Saved state', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route, [
      '6C48236E-4055-4967-81CB-B77E4123431F', '2D638EA5-94A6-4941-813B-D40D128F29DE'
    ]);
    await save.open(context);
    const updateEntered = deferred();
    const allowUpdate = deferred();
    route.updateExact.mockImplementationOnce(async request => {
      updateEntered.resolve();
      await allowUpdate.promise;
      route.server = { ...record(request.prepared.aggregate, '"2"', request.clientSaveId),
        clientSavedAt: request.clientSavedAt, payloadJson: request.prepared.payloadJson,
        payloadSha256: request.prepared.payloadSha256 };
    });
    const submitted = aggregate('Submitted A');
    const editedDuringFlight = aggregate('Edited B during exact readback');
    save.replaceBuffer(submitted);
    const pending = save.save();
    await updateEntered.promise;
    save.replaceBuffer(editedDuringFlight);
    allowUpdate.resolve();
    const result = await pending;
    expect(result.status).toBe('NotSaved');
    expect(result.buffer).toEqual(editedDuringFlight);
    expect(result.retainedBuffer).toBe(true);
    expect(result.canonical?.aggregate).toEqual(prepared(submitted).aggregate);
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
    expect((await save.save()).status).toBe('Saved');
    expect(route.updateExact).toHaveBeenCalledTimes(2);
    expect(route.server.aggregate).toEqual(prepared(editedDuringFlight).aggregate);
    expect(save.shouldWarnBeforeUnload()).toBe(false);
  });

  it('cancels before MERGE when buffer B replaces A while asynchronous preparation is in flight', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const prepareEntered = deferred();
    const allowPrepare = deferred();
    route.prepare.mockImplementationOnce(async value => {
      prepareEntered.resolve();
      await allowPrepare.promise;
      return prepared(value);
    });
    const submitted = aggregate('Submitted A');
    const editedDuringFlight = aggregate('Edited B during preparation');
    save.replaceBuffer(submitted);
    const pending = save.save();
    await prepareEntered.promise;
    save.replaceBuffer(editedDuringFlight);
    allowPrepare.resolve();
    const result = await pending;
    expect(result.status).toBe('NotSaved');
    expect(result.buffer).toEqual(editedDuringFlight);
    expect(result.detail).toContain('older buffer was not written');
    expect(route.updateExact).not.toHaveBeenCalled();
    expect(save.shouldWarnBeforeUnload()).toBe(true);
  });

  it('SESSION-02 preserves newer buffer B through an in-flight 412 conflict', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const updateEntered = deferred();
    const allowFailure = deferred();
    route.updateExact.mockImplementationOnce(async () => {
      updateEntered.resolve();
      await allowFailure.promise;
      route.server = record(aggregate('Other session'), '"2"', 'other-session');
      throw new OptionEDraftConflictError();
    });
    const submitted = aggregate('Submitted A');
    const editedDuringFlight = aggregate('Edited B during conflict readback');
    save.replaceBuffer(submitted);
    const pending = save.save();
    await updateEntered.promise;
    save.replaceBuffer(editedDuringFlight);
    allowFailure.resolve();
    const result = await pending;
    expect(result.status).toBe('Conflict');
    expect(result.buffer).toEqual(editedDuringFlight);
    expect(result.retainedBuffer).toBe(true);
    expect(result.canResolveConflict).toBe(true);
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });

  it('SESSION-03 preserves newer buffer B through an ambiguous unchanged readback', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    await save.open(context);
    const updateEntered = deferred();
    const allowFailure = deferred();
    route.updateExact.mockImplementationOnce(async () => {
      updateEntered.resolve();
      await allowFailure.promise;
      throw new OptionEDraftAmbiguousWriteError();
    });
    const submitted = aggregate('Submitted A');
    const editedDuringFlight = aggregate('Edited B during ambiguous readback');
    save.replaceBuffer(submitted);
    const pending = save.save();
    await updateEntered.promise;
    save.replaceBuffer(editedDuringFlight);
    allowFailure.resolve();
    const result = await pending;
    expect(result.status).toBe('NotSaved');
    expect(result.buffer).toEqual(editedDuringFlight);
    expect(result.retainedBuffer).toBe(true);
    expect(result.requiresCanonicalReopen).toBe(false);
    expect(save.shouldWarnBeforeUnload()).toBe(true);
    expect(route.updateExact).toHaveBeenCalledTimes(1);
  });

  it('classifies ambiguous unchanged and divergent readbacks without blind retry', async () => {
    const unchangedRoute = gateway(aggregate('Initial'));
    const unchangedSave = controller(unchangedRoute);
    await unchangedSave.open(context);
    unchangedSave.replaceBuffer(aggregate('Still local'));
    unchangedRoute.updateExact.mockRejectedValueOnce(new OptionEDraftAmbiguousWriteError());
    const unchanged = await unchangedSave.save();
    expect(unchanged.status).toBe('NotSaved');
    expect(unchanged.requiresCanonicalReopen).toBe(false);
    expect(unchangedRoute.updateExact).toHaveBeenCalledTimes(1);

    const divergentRoute = gateway(aggregate('Initial'));
    const divergentSave = controller(divergentRoute);
    await divergentSave.open(context);
    divergentSave.replaceBuffer(aggregate('My change'));
    divergentRoute.updateExact.mockImplementationOnce(async () => {
      divergentRoute.server = record(aggregate('Concurrent change'), '"3"', 'different-save');
      throw new OptionEDraftAmbiguousWriteError();
    });
    const divergent = await divergentSave.save();
    expect(divergent.status).toBe('Conflict');
    expect(divergent.canResolveConflict).toBe(true);
    expect(divergentRoute.updateExact).toHaveBeenCalledTimes(1);
  });

  it('keeps Save unavailable after initial protected open failure', async () => {
    const route = gateway(aggregate('Initial'));
    const save = controller(route);
    route.read.mockRejectedValueOnce(new OptionEDraftRouteError('EMPLOYEE_MISSING', 'missing'));
    await expect(save.open(context)).rejects.toMatchObject({ code: 'EMPLOYEE_MISSING' });
    save.replaceBuffer(aggregate('Session edit'));
    const result = await save.save();
    expect(result.status).toBe('NotSaved');
    expect(result.requiresCanonicalReopen).toBe(true);
    expect(route.updateExact).not.toHaveBeenCalled();
    expect(save.shouldWarnBeforeUnload()).toBe(true);
  });
});
