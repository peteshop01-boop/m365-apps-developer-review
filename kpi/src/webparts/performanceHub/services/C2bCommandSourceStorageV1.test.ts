jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
if (typeof globalThis.TextDecoder === 'undefined') Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: TextDecoder });
import { createHash, webcrypto } from 'crypto';
import { C2bCommandSourceStorageV1, assertCommandSourcePairV1, immutableCommandRawResponseV1,
  type C2bAcceptedCommandV1, type C2bCommandHostV1, type C2bCommandReadContextV1,
  type IC2bCommandSourceDependenciesV1 } from './C2bCommandSourceStorageV1';
import { C2bImmutableFileStorageV1, storageBytes, storageSHA256 } from './C2bImmutableFileStorageV1';
import { storageCanonical, type C2bFileLocator, type C2bStorageBindingV1 } from '../models/C2bFileStorageV1Models';
import { createEmployeeWorkplanV2C2bAnnualPlan } from './EmployeeWorkplanV2C2bAnnualCoordinator';
import type { IEmployeeWorkplanV2C2bNativeAdapter, IC2bNativePlanningObservations,
  IC2bNativeSourceObservation } from './EmployeeWorkplanV2C2bNativeAdapter';
import type { IEmployeeV2AnnualAdmissionEnvelope } from './EmployeeWorkplanV2CommandTransport';

beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });
const guid = (n: number): string => '10000000-0000-4000-8000-' + n.toString().padStart(12, '0');
const envelope = (): IEmployeeV2AnnualAdmissionEnvelope => ({ schemaVersion: 'kcf.kpi.test-command.v2',
  binding: { commandKey: guid(9), commandType: 'CreateWorkplanDraft', subjectType: 'Workplan', subjectKey: 'PERSON-001|2027',
    personKey: 'PERSON-001', performanceYear: 2027, workplanKey: 'PERSON-001|2027' },
  expected: { header: { presence: 'Absent', token: '0', etag: null }, item: { presence: 'NotApplicable' } }, payload: {} });

// Complete synthetic host fixture. Its in-memory file calls cannot issue a network request.
export async function commandSourceFixtureV1(logical = envelope(), inline = false, suppliedWire?: Uint8Array,
  suppliedContext?: C2bCommandReadContextV1) {
  const context: C2bCommandReadContextV1 = suppliedContext || { source: { listId: guid(4), itemId: 17, itemVersion: '1.0' }, route: 'Employee',
    payloadField: 'PayloadJSON', siteUrl: 'https://synthetic.invalid/sites/kcf-test', site: guid(1), web: guid(2),
    candidate: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) } };
  const binding: C2bStorageBindingV1 = { k: 'kcf.kpi.storage-binding.v1',
    target: { site: context.site, web: context.web, library: guid(3), list: context.source.listId },
    operation: { commandType: logical.binding.commandType, purpose: 'command', stateVersion: 1 },
    identity: { commandKey: logical.binding.commandKey, effectKey: null, attemptKey: guid(8), leaseEpoch: 1 },
    source: { phase: 'PreSource', expectedActor: '11', observed: null },
    subjects: { ...logical.binding, itemKey: logical.binding.subjectType === 'WorkplanItem' ? logical.binding.subjectKey : null,
      behaviourValue: null } as unknown as C2bStorageBindingV1['subjects'],
    roles: { actorPersonKey: logical.binding.personKey, effectiveRole: 'Employee', rolePublicationSHA256: 'A'.repeat(64) },
    catalogue: null, candidate: { ...context.candidate, storageDesignSHA256: 'B'.repeat(64) },
    grant: { issuerPrincipal: '99', authorityRef: 'synthetic-only', authoritySHA256: 'C'.repeat(64), scopeSHA256: 'D'.repeat(64) } };
  delete (binding.subjects as unknown as Record<string, unknown>).commandKey;
  delete (binding.subjects as unknown as Record<string, unknown>).commandType;
  const wire = suppliedWire?.slice() || new TextEncoder().encode(JSON.stringify(logical));
  const files = new Map<string, Uint8Array>(); let next = 100; let fileReads = 0;
  const store = { create: async (bytes: Uint8Array): Promise<C2bFileLocator> => {
    const u = guid(next++); files.set(u, bytes.slice()); return { u, v: '1.0', n: bytes.length, h: await storageSHA256(bytes) };
  }, read: async (locator: C2bFileLocator): Promise<Uint8Array> => {
    fileReads++; const bytes = files.get(locator.u); if (!bytes) throw new Error('SYNTHETIC_UNREGISTERED_FILE'); return bytes.slice();
  } };
  const bindingBytes = storageBytes(binding); const bindingSHA256 = await storageSHA256(bindingBytes);
  const reference = await new C2bImmutableFileStorageV1(store).storeBytes(wire,
    { purpose: 'command', target: { site: context.site, web: context.web, library: guid(3) }, bindingSHA256 });
  const row: Record<string, unknown> = { Id: 17, OData__UIVersionString: '1.0', AuthorId: 11, EditorId: 11,
    '@odata.etag': '"source-1"', RowVersionToken: 7, Author: { EMail: 'employee@example.invalid' },
    PayloadJSON: inline ? new TextDecoder().decode(wire) : storageCanonical(reference),
    CommandKey: logical.binding.commandKey, CommandType: logical.binding.commandType, SubjectType: logical.binding.subjectType,
    SubjectKey: logical.binding.subjectKey, PersonKey: logical.binding.personKey, PerformanceYear: logical.binding.performanceYear,
    ExpectedRowVersionToken: null, Quarter: null, ClientCorrelationKey: logical.binding.commandKey, ExpectedETag: logical.expected.header.etag };
  const rawBytes = new TextEncoder().encode(JSON.stringify(row));
  const source = { list: context.source.listId, itemId: 17, authorPrincipal: '11', version: '1.0', etag: '"source-1"',
    rawBytesSHA256: await storageSHA256(rawBytes), physicalFieldsSHA256: await storageSHA256(storageBytes(row)) };
  const host: C2bCommandHostV1 = { context, binding, providerProfile: 'sphttpclient-arraybuffer-odata3-nometadata-v1',
    responseByteBound: 10000000, completeBufferBytes: 10000000, timeoutMs: 10000, providerEvidence: 'synthetic-provider',
    resourceReservation: 'synthetic-reservation', retentionAuthority: 'synthetic-retention', registryAuthority: 'synthetic-registry',
    provenanceAuthority: 'synthetic-provenance', readRightsAuthority: 'synthetic-rights', issuer: '99', grantSHA256: 'E'.repeat(64) };
  const seal = { k: 'kcf.kpi.storage-acceptance.v1', attempt: binding.identity.attemptKey, source,
    bindingSHA256, inventorySHA256: 'F'.repeat(64), issuer: host.issuer, grantSHA256: host.grantSHA256, createdAt: '2026-10-03T19:00:00Z' };
  const accepted: C2bAcceptedCommandV1 = { state: 'Sealed', registryAuthority: host.registryAuthority,
    provenanceAuthority: host.provenanceAuthority, source, reference, commandKey: binding.identity.commandKey,
    attemptKey: binding.identity.attemptKey, inventorySHA256: seal.inventorySHA256, issuer: host.issuer,
    grantSHA256: host.grantSHA256, bindingBytes, sealBytes: storageBytes(seal) };
  const retained: Uint8Array[] = []; const holds: string[] = [];
  const dependencies: IC2bCommandSourceDependenciesV1 = {
    captureCurrentHostAndGrant: async () => host,
    retainCompleteRawResponse: async (_c, value) => { retained.push(value.bytes.slice());
      return { reference: 'synthetic-retained', sha256: value.sha256, bytes: value.bytes.length }; },
    readAuthenticatedAcceptedCommand: async () => accepted,
    assertAcceptedReadResources: async () => undefined,
    acceptedFiles: store, hold: async (_c, reason) => { holds.push(reason); }
  };
  const reader = new C2bCommandSourceStorageV1(dependencies); const admission = await reader.prepare(context);
  const url = new URL(`${context.siteUrl}/_api/web/lists(guid'${context.source.listId}')/items(17)?`
    + '$select=*,OData__UIVersionString,AuthorId,EditorId,Author/EMail&$expand=Author').toString();
  const capture = async (bytes = rawBytes) => immutableCommandRawResponseV1({ requestUrl: url, responseUrl: url, status: 200,
    headers: [['content-length', String(bytes.length)], ['content-type', 'application/json;odata=nometadata'], ['etag', '"source-1"']],
    sha256: await storageSHA256(bytes), retentionReference: 'synthetic-retained' }, bytes);
  return { context, binding, reference, wire, row, rawBytes, source, host, accepted, dependencies, reader, admission, files,
    retained, holds, capture, fileReads: () => fileReads };
}

/** Genuine hashes with controlled caller mutation timing; also used by the full-capture evidence runner. */
export async function commandSourceTimingProbeV1(inline: boolean, field: string, digestAt: number,
  coordinator = false, microtaskHops = 0) {
  const f = await commandSourceFixtureV1(undefined, inline);
  const one = await f.reader.read(await f.capture(), f.admission);
  const two = await f.reader.read(await f.capture(), f.admission);
  const shared = { ...one.source };
  const events: { event: string; at: number; stack?: string }[] = [];
  const started = performance.now();
  const record = (event: string, stack?: string) => events.push({ event, at: performance.now() - started, ...(stack ? { stack } : {}) });
  // A read-only trace distinguishes the final validator assertion from its consumer's continuation.
  const traced = (o: IC2bNativeSourceObservation): IC2bNativeSourceObservation => ({ ...o,
    get source() { record('source-read', new Error().stack); return shared; } });
  const first = traced(one), second = traced(two);
  const requested = { ...shared };
  if (field === 'list') requested.listId = guid(999);
  else if (field === 'item') requested.itemId = 18;
  else if (field === 'version') requested.itemVersion = '2.0';
  const capture = (o: IC2bNativeSourceObservation) => ({ ...o, source: { ...shared }, commandSource: {
    ...o.commandSource!, capturedRawBytes: Array.from(o.commandSource!.capturedRawBytes),
    logicalBytes: Array.from(o.commandSource!.logicalBytes) } });
  const before = [capture(first), capture(second)];
  const mutate = () => {
    record('mutation:' + field);
    if (field === 'list') shared.listId = guid(999);
    else if (field === 'item') shared.itemId = 18;
    else if (field === 'version') { shared.itemVersion = '2.0'; first.sourceRowVersion = second.sourceRowVersion = '2.0'; }
    else if (field === 'sourceRowVersion') first.sourceRowVersion = second.sourceRowVersion = '2.0';
    else if (field === 'route') first.route = second.route = 'Manager';
    else if (field === 'Author') first.authorEmail = second.authorEmail = 'foreign@example.invalid';
    else if (field === 'ETag') first.sourceETag = second.sourceETag = '"source-2"';
  };
  let calls = 0, planning = 0, completedPlans = 0, effects = 0, mutationFinished = false;
  const hashes: { call: number; expected: string; actual: string }[] = [];
  const originalDigest = webcrypto.subtle.digest;
  webcrypto.subtle.digest = async (algorithm, data) => {
    const answer = await originalDigest.call(webcrypto.subtle, algorithm, data);
    const call = ++calls;
    hashes.push({ call, expected: createHash('sha256').update(Buffer.from(data as ArrayBuffer)).digest('hex'),
      actual: Buffer.from(answer).toString('hex') });
    record('digest:' + call);
    if (call === digestAt) {
      const scheduled = (hops: number) => { if (hops) queueMicrotask(() => { record('microtask:' + hops); scheduled(hops - 1); });
        else { mutate(); mutationFinished = true; } };
      scheduled(microtaskHops);
    }
    return answer;
  };
  let error: string | undefined;
  try {
    if (coordinator) {
      const adapter = { readCommandSourceTwice: async () => ({ first, second }),
        readPlanningObservations: async () => { planning++; record('planning'); return {}; } } as unknown as IEmployeeWorkplanV2C2bNativeAdapter;
      const plan = await createEmployeeWorkplanV2C2bAnnualPlan(adapter, requested, '2026-10-03T19:00:00Z');
      completedPlans++; effects = plan.effects.length;
    } else await assertCommandSourcePairV1(first);
  } catch (caught) { error = String(caught); record('rejection:' + error); }
  finally { Object.assign(webcrypto.subtle, { digest: originalDigest }); }
  while (!mutationFinished) await Promise.resolve();
  const after = [capture(first), capture(second)];
  return { inline, field, digestAt, coordinator, microtaskHops, error, calls, hashes, events, before, after,
    requested, planning, posts: 0, effects, completedPlans, executedEffects: 0, nativeCalls: 0, elapsedMs: performance.now() - started };
}

describe('concrete mixed command source reader', () => {
  test.each([false, true].flatMap(inline => ['list', 'item', 'version', 'sourceRowVersion', 'route', 'Author', 'ETag']
    .map(field => ({ inline, field }))))('binds genuine inline=$inline pair to original $field before planning', async ({ inline, field }) => {
    const f = await commandSourceFixtureV1(undefined, inline);
    const original = await f.reader.read(await f.capture(), f.admission);
    const changed: IC2bNativeSourceObservation = { ...original, source: { ...original.source } };
    if (field === 'list') changed.source.listId = guid(999);
    else if (field === 'item') changed.source.itemId = 18;
    else if (field === 'version') { changed.source.itemVersion = '2.0'; changed.sourceRowVersion = '2.0'; }
    else if (field === 'sourceRowVersion') changed.sourceRowVersion = '2.0';
    else if (field === 'route') changed.route = 'Manager';
    else if (field === 'Author') changed.authorEmail = 'foreign@example.invalid';
    else changed.sourceETag = '"source-2"';
    await expect(assertCommandSourcePairV1(changed)).rejects.toThrow('COMMAND_PAIR_SOURCE_CONTEXT');
    const planning = jest.fn();
    const adapter = { readCommandSourceTwice: async () => ({ first: changed, second: changed }),
      readPlanningObservations: planning } as unknown as IEmployeeWorkplanV2C2bNativeAdapter;
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(adapter, changed.source, '2026-10-03T19:00:00Z')).rejects.toThrow();
    expect(planning).not.toHaveBeenCalled();
    await assertCommandSourcePairV1(original);
  });
  test.each([false, true])('owns original context independently of later host mutation inline=%s', async inline => {
    const f = await commandSourceFixtureV1(undefined, inline);
    const original = await f.reader.read(await f.capture(), f.admission);
    f.context.source.listId = guid(999); f.context.source.itemVersion = '2.0'; f.context.route = 'Manager';
    f.row.Author = { EMail: 'foreign@example.invalid' }; f.source.etag = '"source-2"';
    await assertCommandSourcePairV1(original);
  });
  test.each([false, true])('retains complete immutable domains and dispatches inline=%s', async inline => {
    const f = await commandSourceFixtureV1(undefined, inline); const raw = await f.capture();
    const got = await f.reader.read(raw, f.admission); await assertCommandSourcePairV1(got);
    expect(got.envelope).toEqual(envelope()); expect(got.commandSource!.kind).toBe(inline ? 'legacy-inline' : 'file');
    expect(got.commandSource!.physical.PayloadJSON).toBe(f.row.PayloadJSON);
    expect(got.commandSource!.physical.RowVersionToken).toBe(7);
    expect(Buffer.from(got.commandSource!.logicalBytes)).toEqual(Buffer.from(f.wire));
    expect(typeof Object.getOwnPropertyDescriptor(got.commandSource!, 'capturedRawBytes')?.get).toBe('function');
    expect(typeof Object.getOwnPropertyDescriptor(got.commandSource!, 'logicalBytes')?.get).toBe('function');
    f.rawBytes.fill(0); f.wire.fill(0); f.row.PayloadJSON = 'altered'; f.accepted.source.etag = 'altered';
    got.commandSource!.capturedRawBytes.fill(0); got.commandSource!.logicalBytes.fill(0);
    expect(() => { (got.envelope.payload as Record<string, unknown>).altered = true; }).toThrow();
    expect(Object.isFrozen(got.envelope.binding)).toBe(true); await assertCommandSourcePairV1(got);
    expect(f.fileReads() > 0).toBe(!inline);
  });
  test.each(['captureCurrentHostAndGrant', 'retainCompleteRawResponse', 'readAuthenticatedAcceptedCommand',
    'assertAcceptedReadResources', 'hold', 'acceptedFiles'])('absent dependency %s denies before read', async key => {
    const f = await commandSourceFixtureV1(); delete (f.dependencies as unknown as Record<string, unknown>)[key];
    await expect(new C2bCommandSourceStorageV1(f.dependencies).prepare(f.context)).rejects.toThrow(); expect(f.fileReads()).toBe(0);
  });
  test.each(['responseByteBound', 'completeBufferBytes', 'providerProfile', 'providerEvidence', 'resourceReservation',
    'retentionAuthority', 'registryAuthority', 'provenanceAuthority', 'readRightsAuthority', 'grantSHA256'])('partial host %s denies', async key => {
    const f = await commandSourceFixtureV1(); delete (f.host as unknown as Record<string, unknown>)[key];
    await expect(f.reader.prepare(f.context)).rejects.toThrow(); expect(f.fileReads()).toBe(0);
  });
  test.each(['state', 'registryAuthority', 'provenanceAuthority', 'commandKey', 'attemptKey', 'issuer', 'grantSHA256',
    'inventorySHA256', 'root', 'source', 'seal', 'binding'])('rejects crossed accepted %s before file read', async attack => {
    const f = await commandSourceFixtureV1(); const a = f.accepted as unknown as Record<string, unknown>;
    if (attack === 'root') f.accepted.reference = { ...f.reference, r: { ...f.reference.r, u: guid(999) } };
    else if (attack === 'source') f.accepted.source = { ...f.source, authorPrincipal: '12' };
    else if (attack === 'seal') f.accepted.sealBytes[0] = 0;
    else if (attack === 'binding') f.accepted.bindingBytes[0] = 0;
    else a[attack] = attack === 'inventorySHA256' ? '1'.repeat(64) : 'wrong';
    await expect(f.reader.read(await f.capture(), f.admission)).rejects.toThrow(); expect(f.fileReads()).toBe(0); expect(f.holds.length).toBe(1);
  });
  test.each(['Reserved', 'PrivateUploaded', 'Verified', 'SourceObserved', 'NotApplied', 'UNKNOWN/Held'])(
    'retains private/orphan %s evidence and denies its root', async state => {
      const f = await commandSourceFixtureV1(); const count = f.files.size;
      (f.accepted as { state: string }).state = state;
      await expect(f.reader.read(await f.capture(), f.admission)).rejects.toThrow('COMMAND_REGISTRY_CONTEXT');
      expect(f.fileReads()).toBe(0); expect(f.files.size).toBe(count); expect(f.holds.length).toBe(1);
    });
  test.each(['site', 'web', 'library', 'list', 'candidate', 'issuer', 'purpose'])(
    'crossed trusted binding %s denies before source/file I/O', async field => {
      const f = await commandSourceFixtureV1();
      if (field === 'candidate') f.host.binding.candidate.commit = 'c'.repeat(40);
      else if (field === 'issuer') f.host.issuer = 'crossed';
      else if (field === 'purpose') f.host.binding.operation.purpose = 'history';
      else if (field === 'library') {
        // A different library cannot read the already captured root even with a valid new host observation.
        f.host.binding.target.library = guid(999);
        const admission = await f.reader.prepare(f.context);
        await expect(f.reader.read(await f.capture(), admission)).rejects.toThrow('REFERENCE_CONTEXT');
        expect(f.fileReads()).toBe(0); return;
      } else (f.host.binding.target as unknown as Record<string, string>)[field] = guid(999);
      await expect(f.reader.prepare(f.context)).rejects.toThrow(); expect(f.fileReads()).toBe(0);
    });
  test('numeric source token drift and altered Author email fail the registered physical capture', async () => {
    for (const field of ['RowVersionToken', 'Author']) {
      const f = await commandSourceFixtureV1();
      f.row[field] = field === 'RowVersionToken' ? 8 : { EMail: 'foreign@example.invalid' };
      await expect(f.reader.read(await f.capture(new TextEncoder().encode(JSON.stringify(f.row))), f.admission)).rejects.toThrow('COMMAND_REGISTRY_CONTEXT');
      expect(f.fileReads()).toBe(0);
    }
  });
  test.each(['Id', 'AuthorId', 'OData__UIVersionString', 'RowVersionToken', '@odata.etag', 'CommandKey', 'ExpectedETag', 'PersonKey'])('rejects altered source %s', async field => {
    const f = await commandSourceFixtureV1(undefined, true); f.row[field] = 'crossed';
    await expect(f.reader.read(await f.capture(new TextEncoder().encode(JSON.stringify(f.row))), f.admission)).rejects.toThrow();
    expect(f.fileReads()).toBe(0);
  });
  test.each(['unknown', 'mixed', 'duplicate', 'utf8', 'partial'])('rejects received %s without recovery', async attack => {
    const f = await commandSourceFixtureV1(); let raw: Uint8Array;
    if (attack === 'duplicate') raw = new TextEncoder().encode(JSON.stringify(f.row).replace('"AuthorId":11', '"AuthorId":11,"Author\\u0049d":11'));
    else if (attack === 'utf8') raw = new Uint8Array([0xff, 0xfe]);
    else { f.row.PayloadJSON = attack === 'unknown' ? '{"schemaVersion":"unknown"}' : attack === 'mixed'
      ? JSON.stringify({ ...envelope(), k: 'kcf.kpi.content-ref.v1' }) : '{"k":"kcf.kpi.content-ref.v1"}';
      raw = new TextEncoder().encode(JSON.stringify(f.row)); }
    await expect(f.reader.read(await f.capture(raw), f.admission)).rejects.toThrow(); expect(f.fileReads()).toBe(0);
  });
  test('unregistered/private root and self-consistently rehashed forged pair have no authority', async () => {
    const f = await commandSourceFixtureV1(); f.dependencies.readAuthenticatedAcceptedCommand = async () => undefined;
    await expect(f.reader.read(await f.capture(), f.admission)).rejects.toThrow('COMMAND_NOT_REGISTERED'); expect(f.fileReads()).toBe(0);
    const good = await commandSourceFixtureV1(); const got = await good.reader.read(await good.capture(), good.admission);
    await expect(assertCommandSourcePairV1({ ...got, commandSource: { ...got.commandSource! } })).rejects.toThrow('COMMAND_PAIR_VERSION');
    await expect(assertCommandSourcePairV1({ ...got, envelope: { ...got.envelope, payload: { hostile: true } } })).rejects.toThrow();
  });
  test('copied logical original is admitted to the actual planner with unchanged result', async () => {
    const f = await commandSourceFixtureV1(); const first = await f.reader.read(await f.capture(), f.admission);
    const second = await f.reader.read(await f.capture(), f.admission);
    const person = { personKey: 'PERSON-001', email: 'employee@example.invalid', managerPersonKey: 'MANAGER-001',
      managerEmail: 'manager@example.invalid', active: true, displayName: 'Synthetic Employee', roles: ['Employee'] };
    const manager = { personKey: 'MANAGER-001', email: 'manager@example.invalid', active: true,
      displayName: 'Synthetic Manager', roles: ['Employee', 'Manager'], managerPersonKey: null, managerEmail: null };
    const observations = { employee: person, actor: person, manager,
      configuration: { schemaRevision: 'c2b-annual-v2', behaviourContractVersion: 'BEHAVIOUR-CONTRACT-OPAQUE',
        performanceYear: 2027, initialState: 'Draft', initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready',
        processorPrincipalKey: 'processor', adminPrincipalKeys: ['admin'] },
      allItems: [], currentAcls: ['Workplans', 'WorkplanItems'].map(listPurpose => ({ listPurpose,
        acl: { containerKey: 'PERSON-001', breaksInheritanceAtContainer: true, canonicalChildrenInherit: true, allowedPrincipals: [], revokedPrincipalKeys: [] } })),
      controlCases: [] } as unknown as IC2bNativePlanningObservations;
    let planning = 0; const adapter = { readCommandSourceTwice: async () => ({ first, second }),
      readPlanningObservations: async () => { planning++; return observations; } } as unknown as IEmployeeWorkplanV2C2bNativeAdapter;
    const actual = await createEmployeeWorkplanV2C2bAnnualPlan(adapter, f.context.source, '2026-10-03T19:00:00Z');
    const { commandSource: ignored, ...old } = first;
    const legacy = { ...adapter, readCommandSourceTwice: async () => ({ first: old, second: old }) };
    expect(actual).toEqual(await createEmployeeWorkplanV2C2bAnnualPlan(legacy, f.context.source, '2026-10-03T19:00:00Z'));
    expect(actual.effects.length).toBeGreaterThan(0); expect(planning).toBe(2);
    const crossed = { ...adapter, readCommandSourceTwice: async () => ({ first, second: { ...second, sourceETag: '"changed"' } }) };
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(crossed, f.context.source, '2026-10-03T19:00:00Z')).rejects.toThrow();
    expect(planning).toBe(2);
    const mutation = { ...adapter, readPlanningObservations: async (admitted: typeof first) => {
      (admitted.envelope.payload as Record<string, unknown>).hostile = true; return observations;
    } };
    await expect(createEmployeeWorkplanV2C2bAnnualPlan(mutation, f.context.source, '2026-10-03T19:00:00Z')).rejects.toThrow();
  });

  test.each([false, true].flatMap(inline => [1, 2, 3].map(digestAt => ({ inline, digestAt }))))(
    'timing positive inline=$inline digest=$digestAt retains genuine immutable domains', async ({ inline, digestAt }) => {
      const result = await commandSourceTimingProbeV1(inline, 'unchanged', digestAt);
      expect(result.error).toBeUndefined(); expect(result.calls).toBe(3);
      expect(result.hashes.every(h => h.actual === h.expected)).toBe(true);
      expect(result.after).toEqual(result.before);
    });
  test.each([false, true].flatMap(inline => ['list', 'item', 'version', 'sourceRowVersion', 'route', 'Author', 'ETag']
    .flatMap(field => [1, 2, 3].map(digestAt => ({ inline, field, digestAt }))))) (
    'timing rejection inline=$inline field=$field digest=$digestAt precedes planning', async ({ inline, field, digestAt }) => {
      const result = await commandSourceTimingProbeV1(inline, field, digestAt);
      expect(result.error).toBeDefined(); expect(result.hashes.every(h => h.actual === h.expected)).toBe(true);
      expect([result.planning, result.posts, result.effects]).toEqual([0, 0, 0]);
    });
  test.each([false, true].flatMap(inline => [1, 6].map(digestAt => ({ inline, digestAt }))))(
    'timing original coordinator witness inline=$inline digest=$digestAt denies before planning', async ({ inline, digestAt }) => {
      const result = await commandSourceTimingProbeV1(inline, 'list', digestAt, true);
      expect(result.error).toContain(inline ? 'COMMAND_PAIR_SOURCE_CONTEXT' : 'COMMAND_PAIR_ACCEPTANCE');
      expect(result.hashes.every(h => h.actual === h.expected)).toBe(true);
      expect([result.planning, result.posts, result.effects]).toEqual([0, 0, 0]);
    });
  test.each([false, true])('consumer continuation inline=%s must reject before planning', async inline => {
    const result = await commandSourceTimingProbeV1(inline, 'list', 6, true, 3);
    expect(result.error).toContain('COMMAND_PAIR_SOURCE_CONTEXT');
    expect(result.hashes.every(h => h.actual === h.expected)).toBe(true);
    expect([result.planning, result.posts, result.effects]).toEqual([0, 0, 0]);
  });
});
