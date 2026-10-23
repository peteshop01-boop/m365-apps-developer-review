jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));

import {
  OPTION_E_DRAFT_MAX_UTF8_BYTES,
  canonicaliseOptionEDraft,
  canonicaliseOptionEPartialDraft,
  optionEUtf8ByteLength,
  parseCanonicalOptionEDraft,
  parseCanonicalOptionEPartialDraft,
  type IOptionEWorkplanDraftAggregate
} from '../models/OptionEWorkplanDraftModels';
import {
  OptionEDraftAmbiguousWriteError,
  OptionEDraftConflictError,
  OptionEDraftRouteError,
  OptionEDraftSharePointGateway,
  type IOptionEDraftHasher
} from './OptionEDraftSharePointGateway';
import { OPTION_E_DRAFT_GATEWAY_BINDINGS } from './OptionEWorkplanListBindings';
import type { SPHttpClient, SPHttpClientConfiguration } from '@microsoft/sp-http';
import { createHash, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';

const hash = 'A'.repeat(64);
const hasher: IOptionEDraftHasher = { sha256Hex: async () => hash };

const aggregate = (commitment = 'Keep the exact employee commitment.'): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'kcf.workplan-draft/v1',
  core: { weightingMode: 'Equal', entries: [{
    coreId: 'CORE-STABLE-001', kpiId: 'KPI-001', kpiVersionKey: 'KPI-001|v03',
    targetVersionKey: 'KPI-001|2027|v02', role: 'Delivery', contributionMethod: 'AdditiveDirect',
    weightPercent: 100, annual: { value: 0 }, q1: { value: 0 }, q2: {}, q3: { value: 'On track' }, q4: {}
  }] },
  impact: [{ impactId: 'IMPACT-STABLE-001', wording: 'Deliver the bounded outcome', measure: 'Number / Quantity',
    unit: 'items', annual: 0, q1: 0, q3: 'Not numerically expressed', success: 'Exact annual result' }],
  behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: (['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const).map((valueId, index) => ({
      valueId, descriptorKey: `KCCC-BEHAVIOUR|v02|IC_OFFICER|${valueId}`,
      guidancePromptKeys: Array.from({ length: 5 }, (_, prompt) => `${valueId}-PROMPT-${prompt + 1}`),
      selectedPromptKeys: [`${valueId}-PROMPT-1`], commitment: index === 0 ? commitment : `Commitment ${index + 1}`,
      periodCommitments: { Q1: 'Q1', Q2: 'Q2', Q3: 'Q3', Q4: 'Q4' }
    })) }
});

const response = (status: number, body: unknown = {}): { status: number; ok: boolean; json(): Promise<unknown> } => ({
  status, ok: status >= 200 && status < 300, json: async () => body
});
const client = (): { get: jest.Mock; post: jest.Mock } => ({ get: jest.fn(), post: jest.fn() });
const gateway = (sp = client()): OptionEDraftSharePointGateway => new OptionEDraftSharePointGateway(
  sp as unknown as SPHttpClient, 'https://tenant.example.invalid/sites/kcf-test',
  OPTION_E_DRAFT_GATEWAY_BINDINGS, {} as SPHttpClientConfiguration, hasher
);
const row = (payloadJson: string, patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  Id: 17, '@odata.etag': '"2"', DraftPayloadJSON: payloadJson, DraftPayloadSHA256: hash,
  ClientSaveID: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1', ClientSavedAt: '2026-09-18T00:30:00.000Z',
  Modified: '2026-09-18T00:30:01.000Z',
  Editor: { EMail: 'employee@example.invalid', Title: 'Synthetic Employee' }, ...patch
});

describe('Option E exact-item four-field Draft store', () => {
  it.each(['getter', 'setter', 'readonly'] as const)(
    'preserves exact valid payload bytes and hash under inherited value %s pollution', async mode => {
      const sp = client(); sp.post.mockResolvedValue(response(204));
      const hashBytes = jest.fn(async (text: string) => createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase());
      const route = new OptionEDraftSharePointGateway(sp as unknown as SPHttpClient,
        'https://tenant.example.invalid/sites/kcf-test', OPTION_E_DRAFT_GATEWAY_BINDINGS,
        {} as SPHttpClientConfiguration, { sha256Hex: hashBytes });
      const prepared = await route.prepare(aggregate('Keep exact Unicode: café 🏏.'));
      const expectedJson = prepared.payloadJson, expectedHash = prepared.payloadSha256;
      hashBytes.mockClear();
      const hook = jest.fn(() => 'inherited value must not be consumed');
      const original = Object.getOwnPropertyDescriptor(Object.prototype, 'value');
      const descriptor: PropertyDescriptor = Object.create(null) as PropertyDescriptor;
      descriptor.configurable = true;
      if (mode === 'getter') descriptor.get = hook;
      else if (mode === 'setter') descriptor.set = hook;
      else { descriptor.value = 'inherited'; descriptor.writable = false; }
      let failure: unknown;
      // Intentional synthetic pollution fixture; restored in finally before assertions.
      // eslint-disable-next-line no-extend-native
      Object.defineProperty(Object.prototype, 'value', descriptor);
      try {
        await route.updateExact({ itemId: 17, expectedEtag: '"2"', prepared,
          clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' });
      } catch (error) { failure = error; }
      finally {
        if (original) Object.defineProperty(Object.prototype, 'value', original);
        // eslint-disable-next-line no-extend-native -- Restore the original absence after the fixture.
        else delete (Object.prototype as { value?: unknown }).value;
      }
      expect(failure).toBeUndefined(); expect(hook).not.toHaveBeenCalled();
      expect(hashBytes).toHaveBeenCalledTimes(1); expect(hashBytes).toHaveBeenCalledWith(expectedJson);
      expect(sp.post).toHaveBeenCalledTimes(1);
      const options = sp.post.mock.calls[0][2];
      expect(options.headers['IF-MATCH']).toBe('"2"');
      expect(JSON.parse(options.body)).toEqual({ DraftPayloadJSON: expectedJson, DraftPayloadSHA256: expectedHash,
        ClientSaveID: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', ClientSavedAt: '2026-09-18T00:31:00.000Z' });
      expect(prepared.payloadJson).toBe(expectedJson); expect(prepared.payloadSha256).toBe(expectedHash);
      expect(parseCanonicalOptionEPartialDraft(expectedJson)).toEqual(prepared.aggregate);
    }
  );
  it.each(['clientSaveId', 'clientSavedAt'] as const)('rejects %s getters without reading them or posting', async field => {
    const sp = client(); const route = gateway(sp); const prepared = await route.prepare(aggregate());
    const request = { itemId: 17, expectedEtag: '"2"', prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' };
    const getter = jest.fn(() => { throw new Error('Getter must never execute'); });
    Object.defineProperty(request, field, { enumerable: true, get: getter });
    await expect(route.updateExact(request)).rejects.toThrow(/save time/);
    expect(getter).not.toHaveBeenCalled(); expect(sp.post).not.toHaveBeenCalled();
  });
  it.each(['clientSaveId', 'clientSavedAt'] as const)('rejects coercible %s before hashing or POST', field => {
    return (async () => {
      const sp = client(); const hashBytes = jest.fn().mockResolvedValue(hash);
      const route = new OptionEDraftSharePointGateway(sp as unknown as SPHttpClient,
        'https://tenant.example.invalid/sites/kcf-test', OPTION_E_DRAFT_GATEWAY_BINDINGS, {} as SPHttpClientConfiguration, { sha256Hex: hashBytes });
      const prepared = await route.prepare(aggregate()); hashBytes.mockClear();
      const request = { itemId: 17, expectedEtag: '"2"', prepared,
        clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' };
      const original = request[field]; const toString = jest.fn(() => original); request[field] = { toString } as unknown as string;
      await expect(route.updateExact(request)).rejects.toThrow(/save time/);
      expect(toString).not.toHaveBeenCalled(); expect(hashBytes).not.toHaveBeenCalled(); expect(sp.post).not.toHaveBeenCalled();
    })();
  });
  it.each(['2026-02-30T12:00:00.000Z', '2026-09-18', '2026-09-18T00:31:00+01:00'])('rejects noncanonical UTC save time %s without POST', async clientSavedAt => {
    const sp = client(); const route = gateway(sp); const prepared = await route.prepare(aggregate());
    await expect(route.updateExact({ itemId: 17, expectedEtag: '"2"', prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt })).rejects.toThrow(/save time/);
    expect(sp.post).not.toHaveBeenCalled();
  });
  it('revalidates exact payload bytes with genuine WebCrypto on the default write path', async () => {
    const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const originalEncoder = Object.getOwnPropertyDescriptor(globalThis, 'TextEncoder');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
    try {
    const sp = client(); sp.post.mockResolvedValue(response(204));
    const route = new OptionEDraftSharePointGateway(sp as unknown as SPHttpClient,
      'https://tenant.example.invalid/sites/kcf-test', OPTION_E_DRAFT_GATEWAY_BINDINGS, {} as SPHttpClientConfiguration);
    const prepared = await route.prepare(aggregate('Unicode 😀 commitment'));
    const expectedHash = createHash('sha256').update(prepared.payloadJson, 'utf8').digest('hex').toUpperCase();
    expect(prepared.payloadSha256).toBe(expectedHash);
    await route.updateExact({ itemId: 17, expectedEtag: '"2"', prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' });
    const posted = JSON.parse(sp.post.mock.calls[0][2].body);
    expect(posted.DraftPayloadJSON).toBe(prepared.payloadJson);
    expect(posted.DraftPayloadSHA256).toBe(expectedHash);
    } finally {
      if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
      else Reflect.deleteProperty(globalThis, 'crypto');
      if (originalEncoder) Object.defineProperty(globalThis, 'TextEncoder', originalEncoder);
      else Reflect.deleteProperty(globalThis, 'TextEncoder');
    }
  });

  it('keeps the checked target, ETag and bytes when caller inputs change during hashing', async () => {
    const sp = client(); sp.post.mockResolvedValue(response(204));
    let release!: (value: string) => void;
    const pendingHash = new Promise<string>(resolve => { release = resolve; });
    const hashBytes = jest.fn().mockResolvedValueOnce(hash).mockReturnValueOnce(pendingHash);
    const route = new OptionEDraftSharePointGateway(sp as unknown as SPHttpClient,
      'https://tenant.example.invalid/sites/kcf-test', OPTION_E_DRAFT_GATEWAY_BINDINGS, {} as SPHttpClientConfiguration,
      { sha256Hex: hashBytes });
    const prepared = await route.prepare(aggregate());
    const originalJson = prepared.payloadJson;
    const request = { itemId: 17, expectedEtag: '"2"', prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' };
    const saving = route.updateExact(request);
    expect(hashBytes).toHaveBeenCalledTimes(2);
    request.itemId = 999; request.expectedEtag = '*'; request.clientSaveId = 'changed';
    prepared.payloadJson = '{}'; prepared.payloadSha256 = 'B'.repeat(64);
    prepared.aggregate.impact[0].wording = 'Changed';
    release(hash); await saving;
    expect(sp.post.mock.calls[0][0]).toContain('/items(17)');
    expect(sp.post.mock.calls[0][2].headers['IF-MATCH']).toBe('"2"');
    expect(JSON.parse(sp.post.mock.calls[0][2].body)).toMatchObject({ DraftPayloadJSON: originalJson,
      DraftPayloadSHA256: hash, ClientSaveID: '8f3ae803-2f7c-48e9-a177-de8d5280bd08' });
  });

  it('retains a specific weak ETag for an exact optimistic-concurrency write', async () => {
    const sp = client(); sp.post.mockResolvedValue(response(204));
    const route = gateway(sp), prepared = await route.prepare(aggregate());
    await route.updateExact({ itemId: 17, expectedEtag: 'W/"2"', prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' });
    expect(sp.post.mock.calls[0][2].headers['IF-MATCH']).toBe('W/"2"');
  });

  it.each(['json', 'hash', 'aggregate', 'unknown'] as const)('rejects a mismatched prepared %s before any HTTP mutation', async field => {
    const sp = client(); sp.post.mockResolvedValue(response(204));
    const route = gateway(sp);
    const prepared = await route.prepare(aggregate());
    if (field === 'json') prepared.payloadJson += ' ';
    if (field === 'hash') prepared.payloadSha256 = 'B'.repeat(64);
    if (field === 'aggregate') prepared.aggregate.impact[0].wording = 'Changed after preparation';
    if (field === 'unknown') prepared.aggregate = { ...prepared.aggregate, personKey: 'forged' } as IOptionEWorkplanDraftAggregate;
    await expect(route.updateExact({ itemId: 17, expectedEtag: '"2"', prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' })).rejects.toThrow();
    expect(sp.post).not.toHaveBeenCalled();
  });

  it.each([' * ', 'unquoted', '"has space"', '"line\n"'])('rejects a nonspecific or malformed write ETag %p', async expectedEtag => {
    const sp = client(); sp.post.mockResolvedValue(response(204));
    const route = gateway(sp);
    const prepared = await route.prepare(aggregate());
    await expect(route.updateExact({ itemId: 17, expectedEtag, prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' })).rejects.toThrow();
    expect(sp.post).not.toHaveBeenCalled();
  });

  it.each([' * ', 'unquoted', '"has space"', '"line\n"'])('rejects a malformed canonical read ETag %p', async etag => {
    const sp = client();
    sp.get.mockResolvedValue(response(200, row(canonicaliseOptionEPartialDraft(aggregate()), { '@odata.etag': etag })));
    await expect(gateway(sp).readExact(17)).rejects.toMatchObject({ code: 'DRAFT_INVALID' });
  });

  it('saves and reads a genuinely incomplete draft without relaxing Submit validation', async () => {
    const unfinished = aggregate();
    unfinished.core.entries[0].role = '' as IOptionEWorkplanDraftAggregate['core']['entries'][number]['role'];
    unfinished.core.entries[0].contributionMethod = '' as IOptionEWorkplanDraftAggregate['core']['entries'][number]['contributionMethod'];
    unfinished.core.entries[0].weightPercent = 35;
    unfinished.impact[0].wording = '';
    unfinished.behaviours.entries[0].commitment = '';
    unfinished.behaviours.entries.pop();
    const safeDraftJson = canonicaliseOptionEPartialDraft(unfinished);
    expect(() => canonicaliseOptionEDraft(unfinished)).toThrow();
    expect(parseCanonicalOptionEPartialDraft(safeDraftJson)).toEqual(unfinished);
    const sp = client();
    const store = gateway(sp);
    const prepared = await store.prepare(unfinished);
    expect(prepared.payloadJson).toBe(safeDraftJson);
    sp.get.mockResolvedValue(response(200, row(safeDraftJson)));
    const reloaded = await store.readExact(17);
    expect(reloaded.aggregate).toEqual(unfinished);
    expect(reloaded.etag).toBe('"2"');
  });
  it('preserves stable IDs and zero-versus-missing through deterministic canonical readback', () => {
    const canonical = canonicaliseOptionEDraft(aggregate());
    const readback = parseCanonicalOptionEDraft(canonical);
    expect(readback.core.entries[0].coreId).toBe('CORE-STABLE-001');
    expect(readback.impact[0]).toMatchObject({ impactId: 'IMPACT-STABLE-001', annual: 0, q1: 0 });
    expect(Object.prototype.hasOwnProperty.call(readback.impact[0], 'q2')).toBe(false);
    expect(canonicaliseOptionEDraft(readback)).toBe(canonical);
  });

  it('accepts the proved 47,027-byte representative aggregate and fails closed above 56,000 bytes', () => {
    const base = canonicaliseOptionEDraft(aggregate(''));
    const exact = canonicaliseOptionEDraft(aggregate('x'.repeat(47027 - optionEUtf8ByteLength(base))));
    expect(optionEUtf8ByteLength(exact)).toBe(47027);
    const oversizedBase = canonicaliseOptionEDraft(aggregate(''));
    expect(() => canonicaliseOptionEDraft(aggregate('x'.repeat(
      OPTION_E_DRAFT_MAX_UTF8_BYTES + 1 - optionEUtf8ByteLength(oversizedBase)
    )))).toThrow(/DraftPayloadTooLarge.*56001.*56000/);
  });

  it('rejects out-of-range Core weights, broken Behaviour identities and forged authority fields before HTTP', async () => {
    const sp = client();
    const route = gateway(sp);
    const invalidWeight = aggregate(); invalidWeight.core.entries[0].weightPercent = 100.01;
    await expect(route.prepare(invalidWeight)).rejects.toThrow(/non-negative percentage/);
    const invalidValue = aggregate(); invalidValue.behaviours.entries[1].valueId = 'BHV-01';
    await expect(route.prepare(invalidValue)).rejects.toThrow(/governed order/);
    const forged = { ...aggregate(), personKey: 'FORGED', managerEmail: 'forged@example.invalid' };
    await expect(route.prepare(forged as IOptionEWorkplanDraftAggregate)).rejects.toThrow(/unknown personKey, managerEmail/);
    expect(sp.post).not.toHaveBeenCalled();
  });

  it('reads only the exact protected item ID and never queries Draft authority or a natural key', async () => {
    const sp = client();
    const payloadJson = canonicaliseOptionEDraft(aggregate());
    sp.get.mockResolvedValue(response(200, row(payloadJson)));
    const result = await gateway(sp).readExact(17);
    expect(result).toMatchObject({ itemId: 17, etag: '"2"', payloadJson, payloadSha256: hash });
    expect(sp.get).toHaveBeenCalledTimes(1);
    const url = sp.get.mock.calls[0][0] as string;
    expect(url).toContain('/items(17)?$select=Id,@odata.etag,DraftPayloadJSON,DraftPayloadSHA256');
    expect(url).not.toContain('$filter');
    expect(url).not.toMatch(/DraftKey|PersonKey|PerformanceYear|DraftSchemaVersion|State/);
  });

  it('fails closed for invalid, inaccessible and malformed exact Draft items', async () => {
    const sp = client();
    await expect(gateway(sp).readExact(0)).rejects.toMatchObject({ code: 'DRAFT_ITEM_INVALID' });
    sp.get.mockResolvedValueOnce(response(403));
    await expect(gateway(sp).readExact(17)).rejects.toMatchObject({ code: 'DRAFT_UNAVAILABLE' });
    const payloadJson = canonicaliseOptionEDraft(aggregate());
    sp.get.mockResolvedValueOnce(response(200, row(payloadJson, { Id: 18 })));
    await expect(gateway(sp).readExact(17)).rejects.toBeInstanceOf(OptionEDraftRouteError);
  });

  it('issues one exact IF-MATCH update containing only the four approved Draft fields', async () => {
    const sp = client(); sp.post.mockResolvedValue(response(204));
    const route = gateway(sp);
    const prepared = await route.prepare(aggregate());
    await route.updateExact({ itemId: 17, expectedEtag: '"2"', prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' });
    expect(sp.post).toHaveBeenCalledTimes(1);
    const request = sp.post.mock.calls[0][2];
    expect(request.headers).toMatchObject({ 'IF-MATCH': '"2"', 'X-HTTP-Method': 'MERGE' });
    expect(Object.keys(JSON.parse(request.body))).toEqual([
      'DraftPayloadJSON', 'DraftPayloadSHA256', 'ClientSaveID', 'ClientSavedAt'
    ]);
    expect(request.body).not.toMatch(/PersonKey|Manager|WorkplanKey|State|DraftSchemaVersion/);
  });

  it('surfaces 412 as conflict and network/5xx as ambiguous without a retry', async () => {
    const prepared = await gateway().prepare(aggregate());
    const request = { itemId: 17, expectedEtag: '"2"', prepared,
      clientSaveId: '8f3ae803-2f7c-48e9-a177-de8d5280bd08', clientSavedAt: '2026-09-18T00:31:00.000Z' };
    const conflictClient = client(); conflictClient.post.mockResolvedValue(response(412));
    await expect(gateway(conflictClient).updateExact(request)).rejects.toBeInstanceOf(OptionEDraftConflictError);
    expect(conflictClient.post).toHaveBeenCalledTimes(1);
    const networkClient = client(); networkClient.post.mockRejectedValue(new Error('timeout'));
    await expect(gateway(networkClient).updateExact(request)).rejects.toBeInstanceOf(OptionEDraftAmbiguousWriteError);
    expect(networkClient.post).toHaveBeenCalledTimes(1);
    const serverClient = client(); serverClient.post.mockResolvedValue(response(503));
    await expect(gateway(serverClient).updateExact(request)).rejects.toBeInstanceOf(OptionEDraftAmbiguousWriteError);
    expect(serverClient.post).toHaveBeenCalledTimes(1);
  });
});
