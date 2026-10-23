jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {
  defaultODataVersion: jest.requireActual('@microsoft/sp-http-base/lib-commonjs/spHttpClient/ODataVersion').default.v4,
  jsonRequest: true, jsonResponse: true
} } } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { SPHttpClient, type SPHttpClientConfiguration, type SPHttpClientResponse } from '@microsoft/sp-http';
import { createTestPrivateDraftAdmission, bindTestPrivateDraftEditorSession,
  closeTestPrivateDraftEditorSession } from './OptionETestPrivateDraftAdmission';
import { PrivateDraftAdmissionFixture, ADMISSION_SITE, admissionFixturePerson,
  cloneAdmissionFixture } from './OptionETestPrivateDraftAdmission.testFixtures';

// Authored request-negotiation model only; no network or Microsoft runtime.
// The prior fixture ignored configuration/headers and could not expose mixed
// v4 configuration + v3 Accept. This boundary rejects that combination.
interface Configuration { defaultODataVersion: { toString(): string } }
interface Options { headers?: Record<string, string>; body?: string }
interface Call { method: string; url: string; headers: Headers }
const configuration = SPHttpClient.configurations.v1;
const sessions: object[] = [];
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
const originalEncoder = globalThis.TextEncoder;
beforeAll(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  globalThis.TextEncoder = TextEncoder as typeof globalThis.TextEncoder;
});
afterEach(() => { sessions.splice(0).forEach(closeTestPrivateDraftEditorSession); });
afterAll(() => {
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  globalThis.TextEncoder = originalEncoder;
});

function supported(configurationValue: SPHttpClientConfiguration, options: Options, write: boolean): Headers {
  const headers = new Headers(options.headers);
  if (!headers.has('OData-Version')) headers.set('OData-Version',
    (configurationValue as unknown as Configuration).defaultODataVersion.toString());
  if (headers.get('OData-Version') !== '4.0' ||
    !/^application\/json;odata\.metadata=(none|minimal)$/.test(headers.get('Accept') || '') ||
    (write && headers.get('Content-Type') !== 'application/json;odata.metadata=none')) {
    throw new Error('Synthetic negotiation rejects mixed OData versions');
  }
  return headers;
}

function make() {
  const fixture = new PrivateDraftAdmissionFixture(), calls: Call[] = [];
  const get = fixture.client.get.bind(fixture.client), post = fixture.client.post.bind(fixture.client);
  const transport = {
    get: (...args: Parameters<SPHttpClient['get']>) => {
      const [url, supplied, options] = args;
      expect(supplied).toBe(configuration);
      calls.push({ method: 'GET', url, headers: supported(supplied, options as Options, false) });
      return get(...args);
    },
    post: (...args: Parameters<SPHttpClient['post']>) => {
      const [url, supplied, options] = args;
      expect(supplied).toBe(configuration);
      calls.push({ method: 'POST', url, headers: supported(supplied, options as Options, true) });
      return post(...args);
    }
  } as unknown as SPHttpClient;
  const gateway = createTestPrivateDraftAdmission(transport, ADMISSION_SITE,
    admissionFixturePerson.email, configuration, fixture.scope);
  if (!gateway) throw new Error('Synthetic reviewed admission refused');
  const session = {}; sessions.push(session); bindTestPrivateDraftEditorSession(session, gateway);
  return { fixture, gateway, calls };
}

async function update(input: ReturnType<typeof make>) {
  const canonical = await input.gateway.read({ performanceYear: 2027 });
  const body = cloneAdmissionFixture(canonical.aggregate);
  body.impact[0].wording = 'Synthetic v4 retained edit';
  return { context: { performanceYear: 2027 }, itemId: canonical.itemId,
    expectedEtag: canonical.etag, expectedBinding: canonical.binding,
    prepared: await input.gateway.prepare(body),
    clientSaveId: '1ac063b2-971c-4577-843c-88db39bac619', clientSavedAt: '2026-10-23T13:00:00.000Z' };
}

describe('K05 private Save uses the production v4 configuration end to end (K04)', () => {
  it.each(['minimalmetadata', 'nometadata'])(
    'models rejection of the prior v3 Accept directive %s under default v4', legacy => {
      expect(() => supported(configuration, { headers: { Accept: `application/json;odata=${legacy}` } }, false)).toThrow();
    });

  it('negotiates metadata, People, header, Draft, guarded MERGE and canonical v4 readback', async () => {
    const input = make(), request = await update(input);
    await input.gateway.updateExact(request);
    const reopened = await input.gateway.read({ performanceYear: 2027 });
    expect(reopened.etag).toBe('"draft-2"');
    expect(reopened.aggregate).toEqual(request.prepared.aggregate);
    expect(reopened.payloadSha256).toBe(request.prepared.payloadSha256);
    expect(reopened.clientSaveId).toBe(request.clientSaveId);
    for (const title of ['DEMOAPP_People', 'DEMOAPP_Workplans', 'DEMOAPP_WorkplanDrafts']) {
      expect(input.calls.some(call => call.method === 'GET' && call.url.includes(`getbytitle('${title}')`))).toBe(true);
    }
    expect(input.calls.some(call => call.url.includes('/currentuser?'))).toBe(true);
    expect(input.calls.some(call => call.url.includes('/fields?'))).toBe(true);
    const writes = input.calls.filter(call => call.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(writes[0].headers.get('IF-MATCH')).toBe('"draft-1"');
    expect(writes[0].headers.get('X-HTTP-Method')).toBe('MERGE');
    expect(Object.keys(input.fixture.posts[0].body).sort()).toEqual([
      'ClientSaveID', 'ClientSavedAt', 'DraftPayloadJSON', 'DraftPayloadSHA256'
    ]);
    expect(Object.keys(input.fixture.posts[0].headers).sort()).toEqual([
      'Accept', 'Content-Type', 'IF-MATCH', 'X-HTTP-Method'
    ]);
  });

  it('retains 412 conflict with v4 negotiation and no successful write', async () => {
    const input = make(), request = await update(input);
    input.fixture.beforePost = () => { input.fixture.draft['@odata.etag'] = '"concurrent"'; };
    await expect(input.gateway.updateExact(request)).rejects.toThrow();
    expect(input.fixture.draft.ClientSaveID).not.toBe(request.clientSaveId);
  });

  it('still refuses changed owner permissions before dispatch', async () => {
    const input = make(), request = await update(input);
    input.fixture.draft.EffectiveBasePermissions = { High: '0', Low: '196615' };
    await expect(input.gateway.updateExact(request)).rejects.toThrow();
    expect(input.calls.filter(call => call.method === 'POST')).toHaveLength(0);
  });

  it('still refuses v4 continuation rather than treating one returned header as unique', async () => {
    const input = make();
    const original = input.fixture.client.get.bind(input.fixture.client);
    // Change only the synthetic server envelope; the real protected reader is exercised.
    input.fixture.client.get = (async (...args: Parameters<SPHttpClient['get']>) => {
      const response = await original(...args);
      if (!args[0].includes("getbytitle('DEMOAPP_Workplans')/items?")) return response;
      return { ...response, json: async () => ({ ...await response.json(), '@odata.nextLink': 'https://fixture.invalid/next' }) } as SPHttpClientResponse;
    }) as SPHttpClient['get'];
    // make() captured its original transport; construct a new admission over this modified server.
    const gateway = createTestPrivateDraftAdmission(input.fixture.client, ADMISSION_SITE,
      admissionFixturePerson.email, configuration, input.fixture.scope)!;
    await expect(gateway.read({ performanceYear: 2027 })).rejects.toThrow();
    expect(input.fixture.posts).toHaveLength(0);
  });

  it('keeps production configuration v1 and unbound activation, with the strict four-header guard', () => {
    const webpart = readFileSync(join(__dirname, '../PerformanceHubWebPart.ts'), 'utf8');
    expect(webpart).toMatch(/createTestPrivateDraftAdmission\(this\.context\.spHttpClient,[\s\S]*?SPHttpClient\.configurations\.v1\)/);
    const admission = readFileSync(join(__dirname, 'OptionETestPrivateDraftAdmission.ts'), 'utf8');
    expect(admission).toContain("Object.keys(headers).sort().join(',') !== 'Accept,Content-Type,IF-MATCH,X-HTTP-Method'");
    expect(admission).toContain('REVIEWED_TEST_PRIVATE_DRAFT_ADMISSION: IReviewedTestPrivateDraftAdmission | undefined = undefined');
    expect(admission).not.toMatch(/application\/json;odata=/);
  });
});
