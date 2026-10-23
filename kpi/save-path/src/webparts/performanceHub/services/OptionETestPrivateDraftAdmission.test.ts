import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { OptionEDraftSaveController } from '../components/OptionEDraftSaveController';
import type { IOptionEDraftGateway, IOptionEDraftExactUpdate } from './OptionEDraftSharePointGateway';
import { OptionEDraftAmbiguousWriteError, OptionEDraftRouteError } from './OptionEDraftSharePointGateway';
import type { IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
import { createTestPrivateDraftAdmission, isAdmittedTestPrivateDraft, observeTestPrivateDraftUiScope,
  REVIEWED_TEST_PRIVATE_DRAFT_ADMISSION, subscribeTestPrivateDraftAdmission,
  nativePreparedTestDraftYear, isExactTestPrivateDraftWeb } from './OptionETestPrivateDraftAdmission';
import { bindTestPrivateDraftEditorSession, closeTestPrivateDraftEditorSession } from './OptionETestPrivateDraftAdmission';
import { PrivateDraftAdmissionFixture, ADMISSION_SITE, admissionFixtureBody, admissionFixturePerson,
  cloneAdmissionFixture, admissionFixtureHash } from './OptionETestPrivateDraftAdmission.testFixtures';

type Draft = IOptionEWorkplanDraftV3Aggregate;
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto'), originalEncoder = globalThis.TextEncoder;
const gateways: IOptionEDraftGateway<Draft>[] = [];
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
});
afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  globalThis.TextEncoder = originalEncoder;
});
afterEach(() => {
  for (const gateway of gateways.splice(0)) observeTestPrivateDraftUiScope(gateway, 'revoked@fixture.invalid', undefined);
  jest.restoreAllMocks();
});
const make = () => {
  const fixture = new PrivateDraftAdmissionFixture(), gateway = fixture.gateway(); gateways.push(gateway);
  const session = {}; bindTestPrivateDraftEditorSession(session, gateway);
  return { fixture, gateway, session };
};
const request = async (gateway: IOptionEDraftGateway<Draft>): Promise<IOptionEDraftExactUpdate<Draft>> => {
  const canonical = await gateway.read({ performanceYear: 2027 });
  const body = cloneAdmissionFixture(canonical.aggregate); body.impact[0].wording = 'Fictional edited outcome';
  return { context: { performanceYear: 2027 }, itemId: canonical.itemId, expectedEtag: canonical.etag,
    expectedBinding: canonical.binding, prepared: await gateway.prepare(body),
    clientSaveId: '1ac063b2-971c-4577-843c-88db39bac619', clientSavedAt: '2026-10-19T01:00:00.000Z' };
};
const deferred = () => {
  let release: () => void = () => undefined;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
};
type ObservedOperation = 'read' | 'updateExact';
interface IObservedError { operation: ObservedOperation; error: unknown }
const unavailableMessage = 'Private Draft Save admission is unavailable or changed. Your unsaved changes remain in this session.';
const uncertainDetail = 'Canonical protected readback could not determine the save outcome. ' + unavailableMessage;
const observeErrors = (gateway: IOptionEDraftGateway<Draft>, errors: IObservedError[], calls: ObservedOperation[]): IOptionEDraftGateway<Draft> => ({
  prepare: gateway.prepare,
  read: async (...args) => {
    calls.push('read');
    try { return await gateway.read(...args); } catch (error) { errors.push({ operation: 'read', error }); throw error; }
  },
  updateExact: async (...args) => {
    calls.push('updateExact');
    try { return await gateway.updateExact(...args); } catch (error) { errors.push({ operation: 'updateExact', error }); throw error; }
  }
});
const expectSingleUnavailable = (errors: IObservedError[], operation: ObservedOperation): void => {
  expect(errors).toHaveLength(1); expect(errors.map(event => event.operation)).toEqual([operation]);
  expect(errors[0].error).toBeInstanceOf(OptionEDraftRouteError);
  expect(errors[0].error).toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
};
const expectAmbiguousUnavailable = (errors: IObservedError[]): void => {
  expect(errors).toHaveLength(2); expect(errors.map(event => event.operation)).toEqual(['updateExact', 'read']);
  expect(errors[0].error).toBeInstanceOf(OptionEDraftAmbiguousWriteError);
  expect(errors[1].error).toBeInstanceOf(OptionEDraftRouteError);
  expect(errors[1].error).toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
};
const expectUnavailableRecovery = (controller: OptionEDraftSaveController<Draft>): void => {
  expect(controller.snapshot.status).toBe('NotSaved');
  expect(controller.snapshot.visibleStatus).toBe('Not saved — your changes are retained');
  expect(controller.snapshot.requiresCanonicalReopen).toBe(true); expect(controller.snapshot.canResolveConflict).toBe(false);
  expect(controller.snapshot.retainedBuffer).toBe(true); expect(controller.shouldWarnBeforeUnload()).toBe(true);
  expect(controller.reapplyRetainedBuffer()).toBeUndefined();
};

describe('default-denied exact TEST private Draft source capability', () => {
  it.each(['legacy-role', 'wrong-role-id', 'missing-permission-evidence', 'site-admin'])(
    'denies %s before any read or write', kind => {
      const fixture = new PrivateDraftAdmissionFixture();
      if (kind === 'legacy-role') fixture.scope.draftOwnerRole = { ...fixture.scope.draftOwnerRole, name: 'DEMO KPI Option E Draft Editor v1', low: 5 };
      if (kind === 'wrong-role-id') fixture.scope.draftOwnerRole.id = 0;
      if (kind === 'missing-permission-evidence') fixture.scope.evidence.draftOwnerPermission = '';
      if (kind === 'site-admin') fixture.scope.actor.isSiteAdmin = true;
      expect(createTestPrivateDraftAdmission(fixture.client, ADMISSION_SITE, admissionFixturePerson.email,
        fixture.configuration, fixture.scope)).toBeUndefined();
      expect(fixture.gets).toEqual([]); expect(fixture.posts).toEqual([]);
    });

  it.each([5, 65541, 131077, 196615, 196621, 196613 + 33554432])(
    'denies incomplete or broader effective Low=%s before private payload access', async low => {
      const { fixture, gateway } = make(); fixture.draft.EffectiveBasePermissions = { High: '0', Low: String(low) };
      await expect(gateway.read({ performanceYear: 2027 })).rejects.toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
      expect(fixture.gets.some(url => url.includes('DraftPayloadJSON'))).toBe(false);
      expect(fixture.posts).toEqual([]);
    });

  it.each(['missing', 'inherited', 'wrapped', 'wrong-item', 'wrong-unique', 'high-bit', 'continued'])(
    'rejects %s item permission metadata before admission', async kind => {
      const { fixture, gateway } = make();
      if (kind === 'missing') delete fixture.draft.EffectiveBasePermissions;
      if (kind === 'inherited') fixture.draft.HasUniqueRoleAssignments = false;
      if (kind === 'wrapped') fixture.draft.d = { ...fixture.draft };
      if (kind === 'wrong-item') fixture.draft.Id = 72;
      if (kind === 'wrong-unique') fixture.draft.UniqueId = '91462896-f7c5-468c-87bb-e281af44ccb2';
      if (kind === 'high-bit') fixture.draft.EffectiveBasePermissions = { High: '1', Low: '196613' };
      if (kind === 'continued') fixture.draft['odata.nextLink'] = 'https://unexpected.example.invalid/next';
      await expect(gateway.read({ performanceYear: 2027 })).rejects.toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
      expect(fixture.gets.some(url => url.includes('DraftPayloadJSON'))).toBe(false);
      expect(fixture.gets.some(url => url.includes('unexpected.example.invalid'))).toBe(false);
      expect(fixture.posts).toEqual([]);
    });

  it.each(['update-preflight', 'final-dispatch'])(
    'revokes changed item permissions during %s without sending a write', async stage => {
      const { fixture, gateway } = make(), update = await request(gateway);
      let permissionReads = 0;
      fixture.beforeGet = url => {
        if (!url.endsWith('?$select=Id,UniqueId,HasUniqueRoleAssignments,EffectiveBasePermissions')) return;
        permissionReads++;
        if (permissionReads === (stage === 'update-preflight' ? 1 : 2)) {
          fixture.draft.EffectiveBasePermissions = { High: '0', Low: '196615' };
        }
      };
      await expect(gateway.updateExact(update)).rejects.toThrow();
      expect(permissionReads).toBe(stage === 'update-preflight' ? 1 : 2);
      expect(fixture.posts).toEqual([]);
      expect(nativePreparedTestDraftYear(gateway, admissionFixturePerson.email)).toBeUndefined();
    });

  it('uses exact-item rights for owner Save, fresh reopen and second Save while refusing a different actor', async () => {
    const { fixture, gateway, session } = make(), first = await request(gateway);
    await gateway.updateExact(first); await gateway.read({ performanceYear: 2027 }); closeTestPrivateDraftEditorSession(session);
    const fresh = fixture.gateway(); gateways.push(fresh); bindTestPrivateDraftEditorSession({}, fresh);
    const second = await request(fresh); second.clientSaveId = '4216fbff-0ec6-490a-8b01-1a97bb6e12ff';
    await fresh.updateExact(second); await fresh.read({ performanceYear: 2027 });
    expect(fixture.posts).toHaveLength(2);
    expect(fixture.gets.filter(url => url.includes('EffectiveBasePermissions')).every(url =>
      url === `${ADMISSION_SITE}/_api/web/lists/getbytitle('DEMOAPP_WorkplanDrafts')/items(71)?$select=Id,UniqueId,HasUniqueRoleAssignments,EffectiveBasePermissions`)).toBe(true);
    const before = fixture.gets.length;
    expect(createTestPrivateDraftAdmission(fixture.client, ADMISSION_SITE, 'other@fixture.invalid', fixture.configuration, fixture.scope)).toBeUndefined();
    expect(fixture.gets).toHaveLength(before); expect(fixture.posts).toHaveLength(2);
  });

  it.each(['People', 'Workplans'] as const)(
    'holds initial admission for OData3/OData4 continued %s authority before canonical Draft access', async authority => {
      for (const marker of ['odata.nextLink', '@odata.nextLink']) {
        const { fixture, gateway } = make(), rawGet = fixture.client.get.bind(fixture.client);
        const post = jest.spyOn(fixture.client, 'post'); let continued = 0;
        jest.spyOn(fixture.client, 'get').mockImplementation(async url => {
          const result = await rawGet(url);
          if (!url.includes(`getbytitle('DEMOAPP_${authority}')/items?`)) return result;
          continued++;
          const body = await result.json() as Record<string, unknown>;
          return Object.assign(result, { json: async () => ({ ...body, [marker]: 'https://unexpected.example.invalid/next-page' }) });
        });
        await expect(gateway.read({ performanceYear: 2027 })).rejects.toMatchObject({
          code: authority === 'People' ? 'EMPLOYEE_INACCESSIBLE' : 'CONTROL_INACCESSIBLE'
        });
        expect(continued).toBe(1);
        expect(fixture.gets.some(url => url.includes('/items(71)?') && url.includes('DraftPayloadJSON'))).toBe(false);
        expect(fixture.gets.some(url => url.includes('unexpected.example.invalid'))).toBe(false);
        expect(post).not.toHaveBeenCalled(); expect(fixture.posts).toEqual([]);
        expect(nativePreparedTestDraftYear(gateway, admissionFixturePerson.email)).toBeUndefined();
      }
    });

  it.each(['People', 'Workplans'] as const)(
    'revokes complete initial admission when the final pre-dispatch %s reread has OData3/OData4 continuation', async authority => {
      for (const marker of ['odata.nextLink', '@odata.nextLink']) {
        const { fixture, gateway } = make(), prepared = await request(gateway);
        const payloadReads = (): number => fixture.gets.filter(url => url.includes('/items(71)?') && url.includes('DraftPayloadJSON')).length;
        expect(payloadReads()).toBe(1); expect(fixture.posts).toEqual([]);
        const rawGet = fixture.client.get.bind(fixture.client), post = jest.spyOn(fixture.client, 'post');
        let authorityReads = 0, getsAtContinuation = -1, metadataReads = 0;
        jest.spyOn(fixture.client, 'get').mockImplementation(async url => {
          const result = await rawGet(url);
          if (url.endsWith('?$select=Id,Url')) metadataReads++;
          if (!url.includes(`getbytitle('DEMOAPP_${authority}')/items?`) || ++authorityReads !== 3) return result;
          // The first two reads belong to preparation/update authority resolution.
          // Only the third is inside the scoped transport's final dispatch guard.
          getsAtContinuation = fixture.gets.length;
          const body = await result.json() as Record<string, unknown>;
          return Object.assign(result, { json: async () => ({ ...body, [marker]: 'https://unexpected.example.invalid/next-page' }) });
        });
        await expect(gateway.updateExact(prepared)).rejects.toBeInstanceOf(OptionEDraftAmbiguousWriteError);
        expect(authorityReads).toBe(3); expect(metadataReads).toBe(2); expect(getsAtContinuation).toBeGreaterThan(0);
        expect(fixture.gets).toHaveLength(getsAtContinuation); expect(payloadReads()).toBe(2);
        expect(post).not.toHaveBeenCalled(); expect(fixture.posts).toEqual([]);
        expect(fixture.gets.some(url => url.includes('unexpected.example.invalid'))).toBe(false);
        expect(nativePreparedTestDraftYear(gateway, admissionFixturePerson.email)).toBeUndefined();
      }
    });

  it('admits only the two verified TEST URL representations with the exact web GUID', async () => {
    const fixture = new PrivateDraftAdmissionFixture();
    const serverUrl = ADMISSION_SITE.replace('/demo-automation', '/DEMO-Automation');
    fixture.scope.webUrl = serverUrl; fixture.serverScope.webUrl = serverUrl;
    const gateway = createTestPrivateDraftAdmission(fixture.client, serverUrl, admissionFixturePerson.email, fixture.configuration, fixture.scope)!;
    gateways.push(gateway); bindTestPrivateDraftEditorSession({}, gateway);
    expect(await gateway.read({ performanceYear: 2027 })).toMatchObject({ itemId: 71 });
    fixture.serverScope.webId = 'abed05bc-023b-4509-81f5-a4328d854192';
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
    expect(fixture.posts).toEqual([]);
  });

  it.each([ADMISSION_SITE + '/', ADMISSION_SITE + '/subweb', ADMISSION_SITE + '?x=1', ADMISSION_SITE + '#x',
    ADMISSION_SITE.replace('https:', 'http:'), ADMISSION_SITE.replace('.sharepoint.com', '.sharepoint.com.evil.invalid'),
    ADMISSION_SITE.replace('demo-automation', 'DEMO-AUTOMATION'), ' ' + ADMISSION_SITE])('rejects unverified TEST URL %s', url => {
    const fixture = new PrivateDraftAdmissionFixture();
    expect(isExactTestPrivateDraftWeb(url)).toBe(false);
    expect(createTestPrivateDraftAdmission(fixture.client, url, admissionFixturePerson.email, fixture.configuration, fixture.scope)).toBeUndefined();
    expect(fixture.gets).toEqual([]); expect(fixture.posts).toEqual([]);
  });

  it('routes only a current branded own-2027 gateway without granting initial Save', () => {
    const { fixture, gateway, session } = make();
    expect(nativePreparedTestDraftYear(gateway, admissionFixturePerson.email)).toBe(2027);
    expect(nativePreparedTestDraftYear(gateway, 'another@fixture.invalid')).toBeUndefined();
    expect(nativePreparedTestDraftYear({ ...gateway }, admissionFixturePerson.email)).toBeUndefined();
    expect(nativePreparedTestDraftYear(undefined, admissionFixturePerson.email)).toBeUndefined();
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, undefined)).toBe(false);
    expect(fixture.gets).toEqual([]); closeTestPrivateDraftEditorSession(session);
    expect(nativePreparedTestDraftYear(gateway, admissionFixturePerson.email)).toBeUndefined();
  });

  it('does not restore own-year routing after expiry and a clock reset', () => {
    const { fixture, gateway } = make(), now = Date.now();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(fixture.scope.reservation.expiresUtc));
    expect(nativePreparedTestDraftYear(gateway, admissionFixturePerson.email)).toBeUndefined();
    clock.mockReturnValue(now);
    expect(nativePreparedTestDraftYear(gateway, admissionFixturePerson.email)).toBeUndefined();
    expect(fixture.gets).toEqual([]); expect(fixture.posts).toEqual([]);
  });

  it.each([
    { Indexed: false }, { EnforceUniqueValues: false }, { Indexed: undefined }, { EnforceUniqueValues: undefined },
    { Indexed: 'true' }, { EnforceUniqueValues: 1 }, { TypeAsString: 'Number' }, { MaxLength: 255 },
    { InternalName: 'PendingRequestKey' }
  ])('rejects mandatory pointer schema drift despite a nonempty evidence reference: %j', async patch => {
    const { fixture, gateway } = make(); Object.assign(fixture.pointerField, patch);
    expect(fixture.scope.evidence.pointerUniqueness).toBeTruthy();
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
    expect(fixture.posts).toEqual([]);
    expect(fixture.gets.some(url => url.includes(`lists(guid'${fixture.scope.lists.workplans}')/fields/getbyinternalnameortitle('DraftItemId')`))).toBe(true);
  });

  it('rechecks pointer flags after initial admission and immediately before dispatch', async () => {
    const { fixture, gateway } = make(), prepared = await request(gateway);
    let pointerReads = 0;
    fixture.beforeGet = url => {
      if (url.includes("getbyinternalnameortitle('DraftItemId')") && ++pointerReads === 2) fixture.pointerField.EnforceUniqueValues = false;
    };
    await expect(gateway.updateExact(prepared)).rejects.toBeDefined();
    expect(pointerReads).toBe(2); expect(fixture.posts).toEqual([]);
    expect(nativePreparedTestDraftYear(gateway, admissionFixturePerson.email)).toBeUndefined();
  });

  it('constructs a reviewed gateway without any GET or POST and grants no initial admission', () => {
    const { fixture, gateway } = make();
    expect(fixture.gets).toEqual([]); expect(fixture.posts).toEqual([]);
    expect(Object.keys(gateway).sort()).toEqual(['prepare', 'read', 'updateExact']);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, undefined)).toBe(false);
  });
  it('a rejected competing write cannot revoke or unlock the accepted metadata-paused attempt', async () => {
    const { fixture, gateway } = make(), update = await request(gateway), started = deferred(), resume = deferred();
    const header = cloneAdmissionFixture(fixture.header); let first = true;
    fixture.waitBeforeGet = async url => { if (first && url.endsWith('?$select=Id,Url')) { first = false; started.release(); await resume.promise; } };
    const accepted = gateway.updateExact(update); await started.promise;
    await expect(gateway.updateExact(update)).rejects.toThrow();
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow();
    expect(fixture.posts).toHaveLength(0); resume.release(); await accepted;
    expect(fixture.posts).toHaveLength(1); expect(fixture.posts[0].headers['IF-MATCH']).toBe(update.expectedEtag);
    expect(JSON.parse(fixture.posts[0].body.DraftPayloadJSON)).toEqual(update.prepared.aggregate);
    const canonical = await gateway.read({ performanceYear: 2027 });
    expect(canonical.aggregate).toEqual(update.prepared.aggregate); expect(canonical.etag).toBe('"draft-2"');
    expect(fixture.header).toEqual(header); expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(true);
  });
  it.each([false, true])('obsolete read success/error cannot revoke newer pending write, obsoleteError=%s', async obsoleteError => {
    const { fixture, gateway } = make(), update = await request(gateway), readStarted = deferred(), resumeRead = deferred();
    const postStarted = deferred(), resumePost = deferred(), header = cloneAdmissionFixture(fixture.header); let first = true;
    fixture.waitBeforeGet = async url => {
      if (first && url.endsWith('?$select=Id,Url')) {
        first = false; readStarted.release(); await resumeRead.promise;
        if (obsoleteError) throw Error('Obsolete metadata read failed');
      }
    };
    const rawPost = fixture.client.post.bind(fixture.client);
    const post = jest.spyOn(fixture.client, 'post').mockImplementation(async (...args) => {
      postStarted.release(); await resumePost.promise; return rawPost(...args);
    });
    const obsolete = gateway.read({ performanceYear: 2027 }); await readStarted.promise;
    const accepted = gateway.updateExact(update); await postStarted.promise;
    expect(fixture.posts).toHaveLength(0); expect(post).toHaveBeenCalledTimes(1);
    resumeRead.release(); await expect(obsolete).rejects.toThrow();
    await expect(gateway.updateExact(update)).rejects.toThrow();
    resumePost.release(); await accepted;
    const canonical = await gateway.read({ performanceYear: 2027 });
    expect(canonical.aggregate).toEqual(update.prepared.aggregate); expect(canonical.etag).toBe('"draft-2"');
    expect(canonical.clientSaveId).toBe(update.clientSaveId); expect(canonical.clientSavedAt).toBe(update.clientSavedAt);
    expect(fixture.posts).toHaveLength(1); expect(post).toHaveBeenCalledTimes(1);
    expect(fixture.posts[0].headers['IF-MATCH']).toBe('"draft-1"'); expect(JSON.parse(fixture.posts[0].body.DraftPayloadJSON)).toEqual(update.prepared.aggregate);
    expect(fixture.header).toEqual(header); expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(true);
  });
  it.each(['body', 'hash', 'save-id', 'saved-at', 'etag', 'header', 'read-error'] as const)('current-owner %s failure still revokes and retains the full clicked body', async kind => {
    const { fixture, gateway } = make(), controller = new OptionEDraftSaveController<Draft>(gateway,
      () => '1ac063b2-971c-4577-843c-88db39bac619', () => new Date('2026-10-19T01:00:00.000Z'), 'demo.workplan-draft/v3');
    await controller.open({ performanceYear: 2027 });
    const edited = admissionFixtureBody(); edited.impact[0].wording = `Retained current-owner ${kind}`;
    controller.replaceBuffer(edited);
    const foreign = cloneAdmissionFixture(edited); foreign.impact[0].wording = 'Different complete receipt';
    const prepared = await gateway.prepare(foreign); let injected = false;
    fixture.beforeGet = () => {
      if (!fixture.posts.length || injected) return; injected = true;
      if (kind === 'body') Object.assign(fixture.draft, { DraftPayloadJSON: prepared.payloadJson, DraftPayloadSHA256: prepared.payloadSha256 });
      if (kind === 'hash') fixture.draft.DraftPayloadSHA256 = '0'.repeat(64);
      if (kind === 'save-id') fixture.draft.ClientSaveID = 'abed05bc-023b-4509-81f5-a4328d854192';
      if (kind === 'saved-at') fixture.draft.ClientSavedAt = '2026-10-19T01:00:01.000Z';
      if (kind === 'etag') fixture.draft['@odata.etag'] = '"draft-1"';
      if (kind === 'header') fixture.header.State = 'Submitted';
    };
    fixture.waitBeforeGet = async () => { if (kind === 'read-error' && fixture.posts.length) throw Error('Current metadata read unavailable'); };
    await controller.save();
    expect(controller.snapshot.status).not.toBe('Saved'); expect(controller.snapshot.retainedBuffer).toBe(true);
    expect(controller.snapshot.buffer).toEqual(edited); expect(fixture.posts).toHaveLength(1);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, controller.snapshot.canonical)).toBe(false);
    await controller.save(); expect(fixture.posts).toHaveLength(1);
  });
  it('closed attempt late error/finally cannot revoke or clear a fresh session successful attempt', async () => {
    const { fixture, gateway, session } = make(), old = await request(gateway), started = deferred(), resume = deferred();
    const header = cloneAdmissionFixture(fixture.header), rawPost = fixture.client.post.bind(fixture.client); let first = true;
    jest.spyOn(fixture.client, 'post').mockImplementation(async (...args) => {
      if (first) { first = false; started.release(); await resume.promise; }
      return rawPost(...args);
    });
    const oldWrite = gateway.updateExact(old); await started.promise; closeTestPrivateDraftEditorSession(session);
    const fresh = fixture.gateway(); gateways.push(fresh); bindTestPrivateDraftEditorSession({}, fresh);
    const next = await request(fresh), body = cloneAdmissionFixture(next.prepared.aggregate);
    body.impact[0].wording = 'Fresh session wins'; next.prepared = await fresh.prepare(body);
    next.clientSaveId = '4216fbff-0ec6-490a-8b01-1a97bb6e12ff';
    await fresh.updateExact(next); const canonical = await fresh.read({ performanceYear: 2027 });
    resume.release(); await expect(oldWrite).rejects.toThrow();
    expect((await fresh.read({ performanceYear: 2027 })).aggregate).toEqual(body);
    expect(JSON.parse(String(fixture.draft.DraftPayloadJSON))).toEqual(body); expect(fixture.header).toEqual(header);
    expect(fixture.posts).toHaveLength(2); expect(fixture.posts.map(row => row.headers['IF-MATCH'])).toEqual(['"draft-1"', '"draft-1"']);
    expect(canonical.etag).toBe('"draft-2"'); expect(isAdmittedTestPrivateDraft(fresh, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(true);
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow();
  });
  it('initial admission notification reentrant read/write cannot let obsolete read cleanup revoke the writer', async () => {
    const { fixture, gateway } = make(), body = admissionFixtureBody(); body.impact[0].wording = 'Reentrant accepted body';
    const update: IOptionEDraftExactUpdate<Draft> = { context: { performanceYear: 2027 }, itemId: fixture.scope.binding.draftItemId,
      expectedBinding: cloneAdmissionFixture(fixture.scope.binding), expectedEtag: '"draft-1"', prepared: await gateway.prepare(body),
      clientSaveId: '1ac063b2-971c-4577-843c-88db39bac619', clientSavedAt: '2026-10-19T01:00:00.000Z' };
    let nestedRead: ReturnType<typeof gateway.read> | undefined, write: ReturnType<typeof gateway.updateExact> | undefined;
    let release = (): void => undefined;
    release = subscribeTestPrivateDraftAdmission(gateway, () => { release(); nestedRead = gateway.read({ performanceYear: 2027 }); write = gateway.updateExact(update); });
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow();
    if (!nestedRead || !write) throw Error('Admission observer did not start its operations');
    await expect(nestedRead).rejects.toThrow(); await write;
    const canonical = await gateway.read({ performanceYear: 2027 });
    expect(canonical.aggregate).toEqual(body); expect(canonical.etag).toBe('"draft-2"'); expect(fixture.posts).toHaveLength(1);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(true);
  });
  it('receipt notification cannot clear a reentrant reader or admit a duplicate pending write', async () => {
    const { fixture, gateway } = make(), first = await request(gateway); await gateway.updateExact(first);
    const second = { ...first, expectedEtag: '"draft-2"', clientSaveId: '4216fbff-0ec6-490a-8b01-1a97bb6e12ff' };
    let nestedRead: ReturnType<typeof gateway.read> | undefined, nestedWrite: ReturnType<typeof gateway.updateExact> | undefined;
    let release = (): void => undefined;
    release = subscribeTestPrivateDraftAdmission(gateway, () => { release(); nestedRead = gateway.read({ performanceYear: 2027 }); nestedWrite = gateway.updateExact(second); });
    const canonical = await gateway.read({ performanceYear: 2027 });
    if (!nestedRead || !nestedWrite) throw Error('Receipt observer did not start its operations');
    await expect(nestedRead).rejects.toThrow(); await expect(nestedWrite).rejects.toThrow();
    expect(fixture.posts).toHaveLength(1); expect(canonical.aggregate).toEqual(first.prepared.aggregate);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(true);
    await gateway.updateExact(second); const final = await gateway.read({ performanceYear: 2027 });
    expect(final.aggregate).toEqual(second.prepared.aggregate); expect(final.etag).toBe('"draft-3"');
    expect(fixture.posts).toHaveLength(2); expect(fixture.posts.map(row => row.headers['IF-MATCH'])).toEqual(['"draft-1"', '"draft-2"']);
  });
  it('ships no admission and never consults page/query/property booleans', () => {
    const fixture = new PrivateDraftAdmissionFixture();
    expect(REVIEWED_TEST_PRIVATE_DRAFT_ADMISSION).toBeUndefined();
    expect(createTestPrivateDraftAdmission(fixture.client, ADMISSION_SITE, admissionFixturePerson.email, fixture.configuration)).toBeUndefined();
    expect(fixture.gets).toEqual([]); expect(fixture.posts).toEqual([]);
    expect(isAdmittedTestPrivateDraft({ admitted: true }, admissionFixturePerson.email, fixture.readback().workplan, undefined)).toBe(false);
  });
  it.each(['http://review-tenant.example.invalid/sites/demo-automation', ADMISSION_SITE + '/child',
    ADMISSION_SITE + '?admitted=true', 'https://other.invalid/sites/demo-automation', 'http://127.0.0.1/package-host/'])('refuses route %s without broadening HTTPS/host/path/loopback', route => {
    const fixture = new PrivateDraftAdmissionFixture(); fixture.scope.webUrl = route;
    expect(createTestPrivateDraftAdmission(fixture.client, route, admissionFixturePerson.email, fixture.configuration, fixture.scope)).toBeUndefined();
    expect(fixture.gets).toEqual([]); expect(fixture.posts).toEqual([]);
  });
  it.each(['assigned.manager@fixture.invalid', 'unrelated.employee@fixture.invalid', 'unrelated.manager@fixture.invalid',
    'administrator.nonowner@fixture.invalid', 'superadmin.nonowner@fixture.invalid'])('no non-owner grant is inferred for %s', actor => {
    const fixture = new PrivateDraftAdmissionFixture();
    expect(createTestPrivateDraftAdmission(fixture.client, ADMISSION_SITE, actor, fixture.configuration, fixture.scope)).toBeUndefined();
    expect(fixture.posts).toEqual([]);
  });
  it.each(['expired', 'future', 'empty-reservation', 'empty-review', 'wildcard-etag', 'wrong-schema'])( 'denies %s source scope', kind => {
    const fixture = new PrivateDraftAdmissionFixture();
    if (kind === 'expired') fixture.scope.reservation.expiresUtc = new Date(Date.now() - 1).toISOString();
    if (kind === 'future') fixture.scope.reservation.notBeforeUtc = new Date(Date.now() + 1000).toISOString();
    if (kind === 'empty-reservation') fixture.scope.reservation.id = '';
    if (kind === 'empty-review') fixture.scope.evidence.security = '';
    if (kind === 'wildcard-etag') fixture.scope.binding.workplanEtag = '*';
    if (kind === 'wrong-schema') fixture.scope.binding.draftSchemaVersion = 'demo.workplan-draft/v1' as Draft['schemaVersion'];
    expect(createTestPrivateDraftAdmission(fixture.client, ADMISSION_SITE, admissionFixturePerson.email, fixture.configuration, fixture.scope)).toBeUndefined();
    expect(fixture.posts).toEqual([]);
  });
  it.each(['web', 'list', 'principal', 'login', 'siteAdmin', 'draftUnique', 'schema-field'])('revokes a fresh %s mismatch before dispatch', async kind => {
    const { fixture, gateway } = make();
    if (kind === 'web') fixture.serverScope.webId = 'f54dbb4a-b67b-42e8-8720-dcf8b0333730';
    if (kind === 'list') fixture.serverScope.lists.drafts = 'f54dbb4a-b67b-42e8-8720-dcf8b0333730';
    if (kind === 'principal') fixture.serverScope.actor.principalId = 999;
    if (kind === 'login') fixture.serverScope.actor.loginName = 'unrelated-claim';
    if (kind === 'siteAdmin') fixture.serverScope.actor.isSiteAdmin = true;
    if (kind === 'draftUnique') fixture.draft.UniqueId = 'f54dbb4a-b67b-42e8-8720-dcf8b0333730';
    if (kind === 'schema-field') fixture.fields[0].RichText = true;
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow();
    expect(fixture.posts).toEqual([]);
  });
  it.each(['actor', 'year', 'header', 'header-etag', 'pointer', 'state', 'pending', 'row-version', 'draft-etag'])('revokes %s changes with no native-shaped write', async kind => {
    const { fixture, gateway } = make(), update = await request(gateway);
    if (kind === 'actor') fixture.serverScope.actor.email = 'manager@fixture.invalid';
    if (kind === 'year') fixture.header.PerformanceYear = 2028;
    if (kind === 'header') fixture.header.UniqueId = 'f54dbb4a-b67b-42e8-8720-dcf8b0333730';
    if (kind === 'header-etag') fixture.header['@odata.etag'] = '"header-2"';
    if (kind === 'pointer') fixture.header.DraftItemId = '72';
    if (kind === 'state') fixture.header.State = 'Submitted';
    if (kind === 'pending') fixture.header.PendingRequestKey = 'FICTION-PENDING';
    if (kind === 'row-version') fixture.header.RowVersionToken = 2;
    if (kind === 'draft-etag') fixture.draft['@odata.etag'] = '"external-2"';
    await expect(gateway.updateExact(update)).rejects.toThrow(); expect(fixture.posts).toEqual([]);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, undefined)).toBe(false);
  });
  it.each(['item', 'year', 'etag', 'binding', 'body-field'])('rejects forbidden %s request and exposes no create/delete/Submit surface', async kind => {
    const { fixture, gateway } = make(), update = await request(gateway);
    if (kind === 'item') update.itemId = 72;
    if (kind === 'year') update.context.performanceYear = 2028;
    if (kind === 'etag') update.expectedEtag = '*';
    if (kind === 'binding') update.expectedBinding = { ...update.expectedBinding, workplanItemId: 62 };
    if (kind === 'body-field') Object.assign(update.prepared.aggregate, { ManagerDecision: 'Approved' });
    await expect(gateway.updateExact(update)).rejects.toThrow(); expect(fixture.posts).toEqual([]);
    expect(Object.keys(gateway).sort()).toEqual(['prepare', 'read', 'updateExact']);
  });
  it('checks again at dispatch, not just at initial admission', async () => {
    const { fixture, gateway } = make(), update = await request(gateway);
    let actorReads = 0;
    fixture.beforeGet = url => { if (url.includes('/currentuser?') && ++actorReads === 2) fixture.serverScope.actor.principalId = 999; };
    await expect(gateway.updateExact(update)).rejects.toThrow(); expect(fixture.posts).toEqual([]);
  });
  it('expiry revokes without losing the controller buffer or permitting a renewed source object', async () => {
    const { fixture, gateway } = make();
    const errors: IObservedError[] = [], calls: ObservedOperation[] = [];
    const controller = new OptionEDraftSaveController<Draft>(observeErrors(gateway, errors, calls), undefined, undefined, 'demo.workplan-draft/v3');
    await controller.open({ performanceYear: 2027 }); const edited = admissionFixtureBody(); edited.impact[0].wording = 'Unsaved retained text';
    controller.replaceBuffer(edited);
    jest.spyOn(Date, 'now').mockReturnValue(Date.parse(fixture.scope.reservation.expiresUtc) + 1);
    fixture.scope.reservation.expiresUtc = new Date(Date.now() + 60000).toISOString();
    await controller.save();
    expect(controller.snapshot.status).toBe('NotSaved'); expect(controller.snapshot.buffer).toEqual(edited);
    expect(controller.snapshot.retainedBuffer).toBe(true); expect(fixture.posts).toEqual([]);
    expectSingleUnavailable(errors, 'updateExact'); expectUnavailableRecovery(controller);
    expect(controller.snapshot.detail).toBe('The protected Save checks could not be completed. No Draft write was issued. ' + unavailableMessage);
    await controller.save(); expect(fixture.posts).toHaveLength(0); expect(errors).toHaveLength(1);
    expectSingleUnavailable(errors, 'updateExact');
  });
  it('notifies the UI on irreversible same-gateway actor/header revocation', async () => {
    const { fixture, gateway } = make(), canonical = await gateway.read({ performanceYear: 2027 });
    const listener = jest.fn(), release = subscribeTestPrivateDraftAdmission(gateway, listener);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(true);
    observeTestPrivateDraftUiScope(gateway, 'assigned.manager@fixture.invalid', undefined);
    expect(listener).toHaveBeenCalledTimes(1);
    observeTestPrivateDraftUiScope(gateway, admissionFixturePerson.email, fixture.readback().workplan);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(false);
    release();
  });
  it('rejects before raw POST when Checking notification closes the bound editor', async () => {
    const { fixture, gateway, session } = make(), update = await request(gateway);
    const beforeDraft = cloneAdmissionFixture(fixture.draft), beforeHeader = cloneAdmissionFixture(fixture.header);
    let release = (): void => { /* assigned before Save */ };
    release = subscribeTestPrivateDraftAdmission(gateway, () => { release(); closeTestPrivateDraftEditorSession(session); });
    try { await expect(gateway.updateExact(update)).rejects.toThrow(); } finally { release(); }
    expect(fixture.posts).toHaveLength(0); expect(fixture.draft).toEqual(beforeDraft); expect(fixture.header).toEqual(beforeHeader);
  });
  it.each(['close', 'replace', 'actor', 'header', 'expiry', 'clock-rollback'] as const)('Checking notification %s stops dispatch and retains unsaved intent', async kind => {
    const { fixture, gateway, session } = make();
    const frozenNow = Date.now(), rollbackClock = kind === 'clock-rollback' ? jest.spyOn(Date, 'now').mockReturnValue(frozenNow) : undefined;
    const errors: IObservedError[] = [], calls: ObservedOperation[] = [];
    const controller = new OptionEDraftSaveController<Draft>(observeErrors(gateway, errors, calls), undefined, undefined, 'demo.workplan-draft/v3');
    await controller.open({ performanceYear: 2027 });
    const prior = controller.snapshot.canonical;
    const edited = admissionFixtureBody(); edited.impact[0].wording = `Retained ${kind} intent`; controller.replaceBuffer(edited);
    const beforeDraft = cloneAdmissionFixture(fixture.draft), beforeHeader = cloneAdmissionFixture(fixture.header);
    let actions = 0, release = (): void => { /* assigned before Save */ };
    release = subscribeTestPrivateDraftAdmission(gateway, () => {
      // Remove this observer before revoking, so nested revocation notification cannot repeat it.
      release(); actions++;
      if (kind === 'close') closeTestPrivateDraftEditorSession(session);
      if (kind === 'replace') { const replacement = fixture.gateway(); gateways.push(replacement); bindTestPrivateDraftEditorSession(session, replacement); }
      if (kind === 'actor') observeTestPrivateDraftUiScope(gateway, 'other@fixture.invalid', undefined);
      if (kind === 'header') observeTestPrivateDraftUiScope(gateway, admissionFixturePerson.email, { ...fixture.readback().workplan, etag: '"changed-header"' });
      if (kind === 'expiry') jest.spyOn(Date, 'now').mockReturnValue(Date.parse(fixture.scope.reservation.expiresUtc) + 1);
      if (kind === 'clock-rollback') rollbackClock?.mockReturnValue(frozenNow - 1);
    });
    try { await controller.save(); } finally { release(); }
    expect(actions).toBe(1); expect(fixture.posts).toHaveLength(0);
    expect(fixture.draft).toEqual(beforeDraft); expect(fixture.header).toEqual(beforeHeader);
    expect(controller.snapshot.status).toBe('NotSaved'); expect(controller.snapshot.retainedBuffer).toBe(true);
    expect(controller.snapshot.buffer).toEqual(edited);
    expectAmbiguousUnavailable(errors); expectUnavailableRecovery(controller);
    expect(controller.snapshot.canonical).toEqual(prior);
    expect(controller.snapshot.detail).toBe(uncertainDetail);
    expect(controller.snapshot.detail).not.toContain('The Draft write was issued');
    const beforeRetryCalls = [...calls];
    await controller.save(); expect(fixture.posts).toHaveLength(0);
    expect(calls).toEqual(beforeRetryCalls); expectAmbiguousUnavailable(errors);
    expect(controller.snapshot.buffer).toEqual(edited); expect(controller.snapshot.canonical).toEqual(prior);
    expectUnavailableRecovery(controller);
  });
  it('admits only the exact four-field MERGE and advances ETag after correlated canonical readback', async () => {
    const { fixture, gateway } = make(), update = await request(gateway);
    const originalHeader = cloneAdmissionFixture(fixture.header);
    await gateway.updateExact(update);
    expect(fixture.posts).toHaveLength(1);
    expect(fixture.posts[0].headers['IF-MATCH']).toBe('"draft-1"');
    expect(Object.keys(fixture.posts[0].body).sort()).toEqual(['ClientSaveID', 'ClientSavedAt', 'DraftPayloadJSON', 'DraftPayloadSHA256']);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan,
      { ...await gateway.read({ performanceYear: 2027 }), etag: '"draft-1"' })).toBe(false);
    const readback = await gateway.read({ performanceYear: 2027 });
    expect(readback.etag).toBe('"draft-2"'); expect(readback.aggregate).toEqual(update.prepared.aggregate);
    expect(fixture.header).toEqual(originalHeader);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, readback)).toBe(true);
    const second = await request(gateway); second.clientSaveId = '4216fbff-0ec6-490a-8b01-1a97bb6e12ff';
    await gateway.updateExact(second); await gateway.read({ performanceYear: 2027 });
    expect(fixture.posts).toHaveLength(2); expect(fixture.posts[1].headers['IF-MATCH']).toBe('"draft-2"');
  });
  it.each(['deny', 'commitThen500', 'uncertainNoCommit', 'wrongReadback'] as const)('%s never renews admission or loses the clicked buffer', async outcome => {
    const { fixture, gateway } = make();
    const errors: IObservedError[] = [], calls: ObservedOperation[] = [];
    const controller = new OptionEDraftSaveController<Draft>(observeErrors(gateway, errors, calls),
      () => '1ac063b2-971c-4577-843c-88db39bac619', () => new Date('2026-10-19T01:00:00.000Z'), 'demo.workplan-draft/v3');
    await controller.open({ performanceYear: 2027 });
    const prior = controller.snapshot.canonical;
    const edited = admissionFixtureBody(); edited.impact[0].wording = 'Retain this clicked body'; controller.replaceBuffer(edited);
    fixture.outcome = outcome; await controller.save();
    expect(fixture.posts).toHaveLength(1);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, controller.snapshot.canonical)).toBe(false);
    if (outcome === 'commitThen500') {
      expect(controller.snapshot.status).toBe('Saved'); expect(controller.snapshot.canonical?.aggregate).toEqual(edited);
      expect(errors).toHaveLength(1); expect(errors.map(event => event.operation)).toEqual(['updateExact']);
      expect(errors[0].error).toBeInstanceOf(OptionEDraftAmbiguousWriteError);
      const canonical = controller.snapshot.canonical!;
      expect(JSON.parse(canonical.payloadJson)).toEqual(edited);
      expect(canonical.payloadSha256).toBe(admissionFixtureHash(canonical.payloadJson));
      expect(canonical.clientSaveId).toBe('1ac063b2-971c-4577-843c-88db39bac619');
      expect(canonical.clientSavedAt).toBe('2026-10-19T01:00:00.000Z'); expect(canonical.etag).toBe('"draft-2"');
      expect(fixture.posts[0].headers['IF-MATCH']).toBe('"draft-1"');
      expect(fixture.posts[0].body).toEqual({ DraftPayloadJSON: canonical.payloadJson, DraftPayloadSHA256: canonical.payloadSha256,
        ClientSaveID: canonical.clientSaveId, ClientSavedAt: canonical.clientSavedAt });
    } else {
      expect(controller.snapshot.status).not.toBe('Saved'); expect(controller.snapshot.retainedBuffer).toBe(true);
      expect(controller.snapshot.buffer).toEqual(edited);
    }
    if (outcome === 'uncertainNoCommit') {
      expectAmbiguousUnavailable(errors); expectUnavailableRecovery(controller);
      expect(controller.snapshot.canonical).toEqual(prior); expect(controller.snapshot.detail).toBe(uncertainDetail);
    }
    const beforeRetryCalls = [...calls];
    await controller.save(); expect(fixture.posts).toHaveLength(1);
    if (outcome === 'uncertainNoCommit') {
      expect(calls).toEqual(beforeRetryCalls); expectAmbiguousUnavailable(errors);
      expect(controller.snapshot.buffer).toEqual(edited); expect(controller.snapshot.canonical).toEqual(prior);
      expectUnavailableRecovery(controller);
    }
    if (outcome === 'commitThen500') {
      expect(calls).toEqual([...beforeRetryCalls, 'updateExact']);
      expect(errors).toHaveLength(2); expect(errors.map(event => event.operation)).toEqual(['updateExact', 'updateExact']);
      expect(errors[0].error).toBeInstanceOf(OptionEDraftAmbiguousWriteError);
      expect(errors[1].error).toBeInstanceOf(OptionEDraftRouteError); expect(errors[1].error).toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
      expect(controller.snapshot.status).toBe('NotSaved'); expect(controller.snapshot.buffer).toEqual(edited);
      expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, controller.snapshot.canonical)).toBe(false);
    }
  });
  it('unavailable readback retains recovery and cannot issue a blind retry', async () => {
    const { fixture, gateway } = make();
    const errors: IObservedError[] = [], calls: ObservedOperation[] = [];
    const controller = new OptionEDraftSaveController<Draft>(observeErrors(gateway, errors, calls),
      () => '1ac063b2-971c-4577-843c-88db39bac619', () => new Date('2026-10-19T01:00:00.000Z'), 'demo.workplan-draft/v3');
    await controller.open({ performanceYear: 2027 }); const edited = admissionFixtureBody(); edited.employeeNotes = { categoryWeightReason: 'Unconfirmed retained edit' };
    controller.replaceBuffer(edited); fixture.denyReadsAfterWrite = true;
    await controller.save(); expect(controller.snapshot.status).toBe('NotSaved');
    expect(controller.snapshot.buffer).toEqual(edited); expect(controller.snapshot.requiresCanonicalReopen).toBe(true);
    expectSingleUnavailable(errors, 'read'); expectUnavailableRecovery(controller); expect(fixture.posts).toHaveLength(1);
    expect(controller.snapshot.detail).toBe('The Draft write was issued but the protected binding could not be re-confirmed. ' + unavailableMessage);
    await controller.save(); expect(fixture.posts).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expectSingleUnavailable(errors, 'read');
  });
  it('a wholly fresh session resolves its own server ETag under unchanged reviewed scope, without inheriting a capability', async () => {
    const { fixture, gateway, session } = make(), update = await request(gateway), reviewed = cloneAdmissionFixture(fixture.scope);
    await gateway.updateExact(update); await gateway.read({ performanceYear: 2027 });
    closeTestPrivateDraftEditorSession(session);
    const fresh = fixture.gateway(); gateways.push(fresh);
    bindTestPrivateDraftEditorSession({}, fresh);
    expect(isAdmittedTestPrivateDraft(fresh, admissionFixturePerson.email, fixture.readback().workplan, undefined)).toBe(false);
    const canonical = await fresh.read({ performanceYear: 2027 });
    expect(canonical.etag).toBe('"draft-2"'); expect(canonical.aggregate).toEqual(update.prepared.aggregate);
    expect(isAdmittedTestPrivateDraft(fresh, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(true);
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(false);
    expect(fixture.scope).toEqual(reviewed); expect(fixture.posts).toHaveLength(1);
  });
  it.each([undefined, '', '*', 'not-an-etag'])('a missing/malformed initial server ETag %s permanently revokes that gateway', async etag => {
    const { fixture, gateway } = make(); fixture.draft['@odata.etag'] = etag;
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow();
    fixture.draft['@odata.etag'] = '"fixed-2"';
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow(); expect(fixture.posts).toEqual([]);
  });
  it('a foreign read cannot refresh an already loaded session', async () => {
    const { fixture, gateway } = make(); await gateway.read({ performanceYear: 2027 });
    fixture.draft['@odata.etag'] = '"foreign-2"';
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow();
    fixture.draft['@odata.etag'] = '"draft-1"';
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow(); expect(fixture.posts).toEqual([]);
  });
  it('a preflight-to-MERGE competing write preserves the foreign version and retained intent', async () => {
    const { fixture, gateway } = make();
    const controller = new OptionEDraftSaveController<Draft>(gateway, undefined, undefined, 'demo.workplan-draft/v3');
    await controller.open({ performanceYear: 2027 }); const edited = admissionFixtureBody(); edited.impact[0].wording = 'Retained competing edit';
    controller.replaceBuffer(edited); const before = String(fixture.draft.DraftPayloadJSON);
    fixture.beforePost = () => { fixture.draft['@odata.etag'] = '"foreign-2"'; };
    await controller.save(); expect(controller.snapshot.status).not.toBe('Saved');
    expect(controller.snapshot.buffer).toEqual(edited); expect(controller.snapshot.retainedBuffer).toBe(true);
    expect(fixture.draft.DraftPayloadJSON).toBe(before); await controller.save(); expect(fixture.posts).toHaveLength(1);
  });
  it('same-editor gateway replacement cannot retry retained intent or initialise a new baseline', async () => {
    const { fixture, gateway, session } = make();
    const controller = new OptionEDraftSaveController<Draft>(gateway, undefined, undefined, 'demo.workplan-draft/v3');
    await controller.open({ performanceYear: 2027 }); const edited = admissionFixtureBody(); edited.impact[0].wording = 'Do not replay'; controller.replaceBuffer(edited);
    fixture.outcome = 'uncertainNoCommit'; await controller.save();
    const replacement = fixture.gateway(); gateways.push(replacement); bindTestPrivateDraftEditorSession(session, replacement);
    await expect(replacement.read({ performanceYear: 2027 })).rejects.toThrow();
    expect(controller.snapshot.buffer).toEqual(edited); expect(controller.snapshot.retainedBuffer).toBe(true);
    await controller.save(); expect(fixture.posts).toHaveLength(1);
  });
  it('a late initial read from a closed session cannot arm itself or a new session', async () => {
    const { fixture, gateway, session } = make();
    let release!: () => void, signal!: () => void;
    const started = new Promise<void>(resolve => { signal = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    fixture.waitBeforeGet = async url => { if (url.endsWith('?$select=Id,UniqueId,HasUniqueRoleAssignments,EffectiveBasePermissions')) { signal(); await pause; } };
    const pendingRead = gateway.read({ performanceYear: 2027 }); await started;
    closeTestPrivateDraftEditorSession(session); fixture.waitBeforeGet = undefined;
    const fresh = fixture.gateway(); gateways.push(fresh); bindTestPrivateDraftEditorSession({}, fresh);
    const canonical = await fresh.read({ performanceYear: 2027 }); release();
    await expect(pendingRead).rejects.toThrow();
    expect(isAdmittedTestPrivateDraft(gateway, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(false);
    expect(isAdmittedTestPrivateDraft(fresh, admissionFixturePerson.email, fixture.readback().workplan, canonical)).toBe(true);
    expect(fixture.posts).toHaveLength(0);
  });
  it('a late correlated Save readback cannot rearm after same-editor gateway replacement', async () => {
    const { fixture, gateway, session } = make(), update = await request(gateway); await gateway.updateExact(update);
    let release!: () => void, signal!: () => void;
    const started = new Promise<void>(resolve => { signal = resolve; }), pause = new Promise<void>(resolve => { release = resolve; });
    fixture.waitBeforeGet = async url => { if (url.endsWith('?$select=Id,UniqueId,HasUniqueRoleAssignments,EffectiveBasePermissions')) { signal(); await pause; } };
    const readback = gateway.read({ performanceYear: 2027 }); await started;
    const replacement = fixture.gateway(); gateways.push(replacement); bindTestPrivateDraftEditorSession(session, replacement);
    fixture.waitBeforeGet = undefined; release();
    await expect(readback).rejects.toThrow();
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow();
    await expect(replacement.read({ performanceYear: 2027 })).rejects.toThrow(); expect(fixture.posts).toHaveLength(1);
  });
  it('incomplete Draft content saves and freshly reopens with no Submit or create prerequisite', async () => {
    const body = admissionFixtureBody(); body.core.entries = []; body.impact = []; body.behaviours.entries = [];
    const fixture = new PrivateDraftAdmissionFixture(body), reviewed = cloneAdmissionFixture(fixture.scope), gateway = fixture.gateway(); gateways.push(gateway);
    const session = {}; bindTestPrivateDraftEditorSession(session, gateway);
    const controller = new OptionEDraftSaveController<Draft>(gateway, undefined, undefined, 'demo.workplan-draft/v3');
    await controller.open({ performanceYear: 2027 }); body.employeeNotes = { categoryWeightReason: 'Unfinished private planning' };
    controller.replaceBuffer(body); await controller.save(); expect(controller.snapshot.status).toBe('Saved'); closeTestPrivateDraftEditorSession(session);
    const fresh = fixture.gateway(); gateways.push(fresh); bindTestPrivateDraftEditorSession({}, fresh);
    expect((await fresh.read({ performanceYear: 2027 })).aggregate).toEqual(body);
    expect(fixture.scope).toEqual(reviewed); expect(fixture.posts).toHaveLength(1);
  });
});
