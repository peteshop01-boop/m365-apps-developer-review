/** @jest-environment node */
"use strict";
jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import { TextEncoder, TextDecoder } from 'util';
if (typeof globalThis.TextEncoder === 'undefined') Object.defineProperty(globalThis, 'TextEncoder', { configurable: true, value: TextEncoder });
if (typeof globalThis.TextDecoder === 'undefined') Object.defineProperty(globalThis, 'TextDecoder', { configurable: true, value: TextDecoder });
import { webcrypto } from 'crypto';
import { writeFileSync } from 'fs';
import { join } from 'path';
import type { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { storageBytes, storageSHA256 } from '../C2bImmutableFileStorageV1';
import { type C2bStorageBindingV1, type C2bFileLocator } from '../../models/C2bFileStorageV1Models';
import { SharePointC2bImmutableFileStoreV1, type IC2bStorageNativeDependenciesV1,
  type C2bStorageRegisteredFileV1, type C2bStorageAttemptStateV1 } from './SharePointC2bImmutableFileStoreV1';

beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });
const guid = (n: number): string => '10000000-0000-4000-8000-' + n.toString().padStart(12, '0');
const hash = 'A'.repeat(64);
const fixture = (): C2bStorageBindingV1 => ({ k: 'kcf.kpi.storage-binding.v1',
  target: { site: guid(1), web: guid(2), library: guid(3), list: guid(4) },
  operation: { commandType: 'UpsertBehaviourCommitmentV2', purpose: 'history', stateVersion: 0 },
  identity: { commandKey: 'COMMAND-1', effectKey: null, attemptKey: guid(5), leaseEpoch: 1 },
  source: { phase: 'PreSource', expectedActor: 'SYNTHETIC-ACTOR', observed: null },
  subjects: { subjectType: 'WorkplanItem', subjectKey: 'ITEM-1', personKey: 'PERSON-1', workplanKey: 'PERSON-1|2027',
    performanceYear: 2027, itemKey: 'ITEM-1', behaviourValue: 'BHV-1' },
  roles: { actorPersonKey: 'PERSON-1', effectiveRole: 'Employee', rolePublicationSHA256: hash }, catalogue: null,
  candidate: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), storageDesignSHA256: hash },
  grant: { issuerPrincipal: 'SYNTHETIC-ISSUER', authorityRef: 'SYNTHETIC-ONLY', authoritySHA256: hash, scopeSHA256: hash }
});
const site = 'https://synthetic.invalid/sites/Test'; const root = '/sites/Test/Synthetic';
interface Stored { id: string; name: string; bytes: Uint8Array; etag: string; }
async function setup() {
  const binding = fixture(); const bindingSHA256 = await storageSHA256(storageBytes(binding));
  const context = { purpose: 'history' as const, bindingSHA256, kind: 'leaf' as const, level: -1, ordinal: 0 };
  const files = new Map<string, Stored>(); const registry = new Map<string, C2bStorageRegisteredFileV1>();
  const calls: { method: string; url: string; options: any }[] = [];
  const captured: { url: string; status: number; headers: readonly (readonly [string, string])[]; bytes: Uint8Array }[] = []; const holds: string[] = [];
  let etag = 1; let state: C2bStorageAttemptStateV1 = 'Reserved'; let fault = ''; let metadataReads = 0;
  let receivedOptions: { status?: number; contentType?: string | null; body?: (value: Record<string, unknown>) => Uint8Array } = {};
  const host = { binding, siteUrl: site, libraryRoot: root, authorPrincipalId: 10, issuerPrincipalId: 11,
    metadataResponseBytes: 20000, timeoutMs: 50 };
  const response = (url: string, status: number, bytes: Uint8Array, responseETag?: string): SPHttpClientResponse => {
    const headers = new Map<string, string>();
    if (!(fault === 'post-missing-length' && url.includes('/Files/add('))) {
      headers.set('content-length', String(bytes.length + (fault === 'post-length' && url.includes('/Files/add(') ? 1 : 0)));
    }
    const media = url.includes('/Files/add(') ? receivedOptions.contentType === undefined
      ? 'application/json;odata=' + (status === 409 ? 'verbose' : 'nometadata') : receivedOptions.contentType
      : url.endsWith('/$value') ? 'application/octet-stream' : 'application/json';
    if (media !== null) headers.set('content-type', media);
    if (responseETag) headers.set('etag', responseETag);
    return { url: fault === 'redirect' ? 'https://foreign.invalid/' : url, redirected: fault === 'redirect', status,
      ok: status >= 200 && status < 300, bodyUsed: fault === 'post-used' && url.includes('/Files/add('),
      arrayBuffer: fault === 'missing-complete-reader' ? undefined : async () => {
        if (fault === 'post-reader-failed' && url.includes('/Files/add(')) throw new Error('RECEIVED_BODY_READ_FAILED');
        return bytes.slice().buffer;
      },
      headers: { get: (key: string) => headers.get(key.toLowerCase()) ?? null,
        forEach: (callback: (value: string, key: string) => void) => headers.forEach(callback) }
    } as unknown as SPHttpClientResponse;
  };
  const metadata = (file: Stored): Record<string, unknown> => {
    metadataReads++;
    return { UniqueId: fault === 'wrong-guid' ? guid(999) : file.id,
      Length: fault === 'length-representation' ? file.bytes.length : String(file.bytes.length),
      ETag: fault === 'etag-change' && metadataReads > 1 ? '"changed"' : file.etag,
      MajorVersion: fault === 'version' ? 2 : 1, MinorVersion: 0, ServerRelativeUrl: root + '/' + file.name,
      ListItemAllFields: { Id: 1, AuthorId: fault === 'author' ? 999 : 10, OData__UIVersionString: '1.0',
        '@odata.etag': '"item-1"', ParentList: { Id: fault === 'wrong-library' ? guid(99) : binding.target.library } } };
  };
  const client = {
    get: jest.fn(async (url: string, _configuration: unknown, options: any): Promise<SPHttpClientResponse> => {
      calls.push({ method: 'GET', url, options });
      if (fault === 'metadata-too-large') return response(url, 200, new Uint8Array(20001));
      if (url.includes('/_api/site?')) return response(url, 200, storageBytes({ Id: binding.target.site }));
      if (url.includes('/_api/web?')) return response(url, 200, storageBytes({ Id: binding.target.web }));
      if (url.includes('/lists(')) return response(url, 200, storageBytes({ Id: binding.target.library, RootFolder: { ServerRelativeUrl: root } }));
      const match = /GetFileById\('([^']+)'\)/.exec(url);
      const byName = /GetFileByServerRelativeUrl\('([^']+)'\)/.exec(url);
      const file = match ? Array.from(files.values()).find(f => f.id === match[1])
        : byName ? files.get(byName[1].slice(root.length + 1)) : undefined;
      if (!file || fault === 'missing') return response(url, 404, storageBytes({ error: 'Missing' }));
      if (fault === 'stable-etag-switch' && url.includes('GetFileById')) file.etag = '"file-2"';
      if (url.endsWith('/$value')) {
        let bytes = file.bytes.slice();
        if (fault === 'body-change' && calls.filter(c => c.url.endsWith('/$value')).length > 1) bytes[0] ^= 1;
        if (fault === 'body-too-large') bytes = new Uint8Array(file.bytes.length + 1);
        return response(url, 200, bytes, file.etag);
      }
      const metadataBytes = storageBytes(metadata(file));
      return response(url, 200, fault === 'file-duplicate' ? new TextEncoder().encode(
        new TextDecoder().decode(metadataBytes).slice(0, -1) + ',"UniqueId":"' + file.id + '"}') : metadataBytes);
    }),
    post: jest.fn(async (url: string, _configuration: unknown, options: any): Promise<SPHttpClientResponse> => {
      calls.push({ method: 'POST', url, options });
      const name = /Files\/add\(url='([^']+)',overwrite=false\)/.exec(url)?.[1];
      if (!name) throw new Error('Unexpected POST URI');
      const bytes = new Uint8Array(await options.body.arrayBuffer());
      const existed = files.has(name);
      if (fault !== 'timeout-absent' && fault !== 'timeout-absent-delayed') files.set(name, existed ? files.get(name)! : {
        name, id: guid(100 + files.size), bytes: fault === 'collision-divergent' ? new Uint8Array(bytes.length).fill(99) : bytes, etag: '"file-1"'
      });
      if (fault === 'timeout-stored' || fault === 'timeout-absent') throw new Error('Lost create response');
      if (fault === 'timeout-stored-delayed' || fault === 'timeout-absent-delayed') return new Promise<SPHttpClientResponse>(() => { /* No response: the transport's actual deadline must execute. */ });
      const status = receivedOptions.status ?? (fault === 'post-denied' ? 403 : existed || fault.startsWith('collision') ? 409 : 201);
      const file = files.get(name)!;
      const value: Record<string, unknown> = status === 409 ? {
        error: { code: '-2130575257, Microsoft.SharePoint.SPException', message: { lang: 'en-US', value: 'File already exists.' } }
      } : { UniqueId: file.id, ServerRelativeUrl: root + '/' + file.name, Length: String(file.bytes.length),
        MajorVersion: 1, MinorVersion: 0, ETag: file.etag };
      const postBody = fault === 'post-malformed' ? new TextEncoder().encode('NOT JSON; invalid received create response')
        : fault === 'post-foreign-json' ? storageBytes({ UniqueId: guid(999), AuthorId: 999 })
          : receivedOptions.body ? receivedOptions.body(value) : storageBytes(value);
      return response(url, status, postBody);
    })
  } as unknown as Pick<SPHttpClient, 'get' | 'post'>;
  const ports: IC2bStorageNativeDependenciesV1 = {
    captureCurrentHostAndGrant: async () => fault === 'missing-host' ? undefined : host,
    assertReservedResources: async () => { if (fault === 'no-reservation') throw new Error('RESERVATION_UNAVAILABLE'); },
    readAttempt: async () => fault === 'missing-attempt' ? undefined : ({ bindingSHA256, etag: '"' + etag + '"', state }),
    prepareFile: async (_binding, expected, pending) => {
      if (fault === 'stale-cas' || expected !== '"' + etag + '"') throw new Error('STALE_CAS');
      const existing = registry.get(pending.name); const file = existing ?? { pending, locator: null, accepted: false };
      registry.set(pending.name, file); etag++; return { etag: '"' + etag + '"', file };
    },
    recordVerifiedFile: async (_binding, expected, file) => {
      if (fault === 'record-timeout' || expected !== '"' + etag + '"') throw new Error('REGISTRY_UNKNOWN');
      registry.set(file.pending.name, file); state = 'PrivateUploaded'; etag++;
    },
    findRegisteredFile: async (_binding, locator) => Array.from(registry.values()).find(r => r.locator?.u === locator.u),
    assertCapturedFileProvenance: async () => { if (fault === 'rights') throw new Error('IMMUTABILITY_PROVENANCE_UNAVAILABLE'); },
    retainCompleteRawResponse: async (_binding, url, status, headers, bytes) => {
      if (fault === 'post-retention' && url.includes('/Files/add(')) throw new Error('RAW_RETENTION_FAILED');
      captured.push({ url, status, headers: headers.map(h => [h[0], h[1]] as const), bytes: bytes.slice() });
    },
    holdAttempt: async (_binding, reason) => { holds.push(reason); state = 'UNKNOWN/Held'; }
  };
  const transport = new SharePointC2bImmutableFileStoreV1(client, { enabled: true, binding, readMode: 'private-stage' }, ports);
  return { binding, bindingSHA256, context, files, registry, calls, captured, holds, client, host, ports, transport,
    fault: (value: string) => { fault = value; }, state: (value: C2bStorageAttemptStateV1) => { state = value; },
    received: (options: typeof receivedOptions) => { receivedOptions = options; } };
}
async function preserveReceivedCase(name: string, s: Awaited<ReturnType<typeof setup>>, outcome: string): Promise<void> {
  if (!process.env.C2B_REPAIR_EVIDENCE) return;
  const run = process.env.C2B_REPAIR_RUN; if (!run || !/^[0-9]+$/.test(run)) throw new Error('Explicit repair run required');
  const received = s.captured.find(c => c.url.includes('/Files/add(')); if (!received) throw new Error('Complete received response absent');
  writeFileSync(join(process.env.C2B_REPAIR_EVIDENCE, name + '-received-' + run + '.bin'), received.bytes, { flag: 'wx' });
  writeFileSync(join(process.env.C2B_REPAIR_EVIDENCE, name + '-trace-' + run + '.json'), JSON.stringify({
    outcome, status: received.status, headers: received.headers, bytes: received.bytes.length, sha256: await storageSHA256(received.bytes),
    verified: Array.from(s.registry.values()).filter(f => f.locator !== null).length, holds: s.holds,
    privateFiles: s.files.size, calls: s.calls.map(c => ({ method: c.method, url: c.url })), liveCalls: 0
  }, null, 2), { flag: 'wx' });
}
describe('disabled concrete SPHttpClient immutable transport', () => {
  test.each(['post-malformed', 'post-foreign-json'])('SEC-PM99-A006-F01 received %s must HOLD before verification', async fault => {
    const s = await setup(); s.fault(fault); let outcome = 'FULFILLED'; let failure: string | null = null;
    try { await s.transport.create(new Uint8Array([1, 2]), s.context); }
    catch (error) { outcome = 'REJECTED'; failure = String(error); }
    const received = s.captured.find(c => c.url.includes('/Files/add('));
    expect(received).toBeDefined();
    const expected = fault === 'post-malformed' ? new TextEncoder().encode('NOT JSON; invalid received create response')
      : storageBytes({ UniqueId: guid(999), AuthorId: 999 });
    expect(received!.bytes).toEqual(expected);
    const verified = Array.from(s.registry.values()).filter(f => f.locator !== null).length;
    if (process.env.C2B_REPAIR_EVIDENCE) {
      const run = process.env.C2B_REPAIR_RUN; if (!run || !/^[0-9]+$/.test(run)) throw new Error('Explicit repair run required');
      writeFileSync(join(process.env.C2B_REPAIR_EVIDENCE, fault + '-received-' + run + '.bin'), received!.bytes, { flag: 'wx' });
      writeFileSync(join(process.env.C2B_REPAIR_EVIDENCE, fault + '-result-' + run + '.json'), JSON.stringify({
        fault, outcome, failure, receivedBytes: received!.bytes.length, receivedSHA256: await storageSHA256(received!.bytes),
        verified, holds: s.holds, calls: s.calls.map(c => ({ method: c.method, url: c.url })),
        privateFiles: s.files.size, registryEntries: s.registry.size, liveCalls: 0
      }, null, 2), { flag: 'wx' });
    }
    expect(outcome).toBe('REJECTED'); expect(verified).toBe(0); expect(s.holds).toHaveLength(1);
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1);
    expect(s.calls.some(c => c.url.includes('GetFileByServerRelativeUrl'))).toBe(false);
  });
  const invalidSuccess: [string, (value: Record<string, unknown>) => Uint8Array][] = [
    ['invalid-utf8', () => new Uint8Array([0xff])], ['bom', v => new TextEncoder().encode('\uFEFF' + JSON.stringify(v))],
    ['trailing', v => new TextEncoder().encode(JSON.stringify(v) + ' trailing')],
    ['escaped-duplicate', v => new TextEncoder().encode(JSON.stringify(v).slice(0, -1) + ',"\\u0055niqueId":"' + String(v.UniqueId) + '"}')],
    ['scalar', () => storageBytes('file')], ['array', v => storageBytes([v])], ['null', () => storageBytes(null)],
    ['empty-bytes', () => new Uint8Array()], ['empty-object', () => storageBytes({})],
    ['error', () => storageBytes({ error: { code: 'X', message: { lang: 'en', value: 'error' } } })],
    ['d-wrapper', v => storageBytes({ d: v })], ['value-wrapper', v => storageBytes({ value: v })],
    ['results-wrapper', v => storageBytes({ results: [v] })], ['annotation', v => storageBytes({ ...v, 'odata.metadata': 'foreign' })],
    ['extra-author', v => storageBytes({ ...v, AuthorId: 999 })], ['extra-list', v => storageBytes({ ...v, ListItemAllFields: {} })],
    ['extra-site', v => storageBytes({ ...v, SiteId: guid(99) })], ['extra-web', v => storageBytes({ ...v, WebId: guid(99) })],
    ['missing-etag', v => { const copy = { ...v }; delete copy.ETag; return storageBytes(copy); }],
    ['wrong-guid-type', v => storageBytes({ ...v, UniqueId: 100 })],
    ['uppercase-guid', v => storageBytes({ ...v, UniqueId: '9b56baaa-bed8-4892-a61a-8fd6df4b7f0a' })],
    ['wrong-path', v => storageBytes({ ...v, ServerRelativeUrl: '/sites/Foreign/file.bin' })],
    ['encoded-path', v => storageBytes({ ...v, ServerRelativeUrl: String(v.ServerRelativeUrl).replace('/sites/', '/%73ites/') })],
    ['length-number', v => storageBytes({ ...v, Length: 2 })], ['length-leading-zero', v => storageBytes({ ...v, Length: '02' })],
    ['length-wrong', v => storageBytes({ ...v, Length: '3' })], ['length-negative', v => storageBytes({ ...v, Length: '-2' })],
    ['length-unsafe', v => storageBytes({ ...v, Length: '9007199254740992' })],
    ['wrong-major', v => storageBytes({ ...v, MajorVersion: 2 })], ['major-string', v => storageBytes({ ...v, MajorVersion: '1' })],
    ['wrong-minor', v => storageBytes({ ...v, MinorVersion: 1 })], ['etag-blank', v => storageBytes({ ...v, ETag: '   ' })],
    ['etag-wildcard', v => storageBytes({ ...v, ETag: '*' })], ['etag-type', v => storageBytes({ ...v, ETag: 1 })],
    ['name-mismatch', v => storageBytes({ ...v, Name: 'foreign.bin' })],
    ['version-label', v => storageBytes({ ...v, UIVersionLabel: '2.0' })], ['exists-false', v => storageBytes({ ...v, Exists: false })],
    ['exists-type', v => storageBytes({ ...v, Exists: 'true' })]
  ];
  test.each(invalidSuccess)('received success rejects %s before any name lookup', async (name, body) => {
    const s = await setup(); s.received({ body });
    await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow();
    await preserveReceivedCase('success-' + name, s, 'REJECTED');
    expect(s.holds).toHaveLength(1); expect(s.files.size).toBe(1);
    expect(Array.from(s.registry.values()).filter(f => f.locator !== null)).toHaveLength(0);
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1);
    expect(s.calls.some(c => c.url.includes('GetFileBy'))).toBe(false);
  });
  test.each(['unique-id', 'etag'])('received %s disagreement cannot be erased by correct name readback', async key => {
    const s = await setup(); s.received({ body: v => storageBytes({ ...v, [key === 'unique-id' ? 'UniqueId' : 'ETag']:
      key === 'unique-id' ? guid(999) : '"foreign-etag"' }) });
    await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow('READBACK_DISAGREEMENT');
    await preserveReceivedCase('disagreement-' + key, s, 'REJECTED');
    expect(s.holds).toHaveLength(1); expect(s.files.size).toBe(1);
    expect(Array.from(s.registry.values()).filter(f => f.locator !== null)).toHaveLength(0);
    expect(s.calls.filter(c => c.url.includes('GetFileByServerRelativeUrl'))).toHaveLength(1);
    expect(s.calls.some(c => c.url.includes('GetFileById'))).toBe(false);
  });
  test('stable later readbacks cannot replace the ETag captured in the received response', async () => {
    const s = await setup(); s.fault('stable-etag-switch');
    await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow('READBACK_DISAGREEMENT');
    await preserveReceivedCase('final-capture-etag-disagreement', s, 'REJECTED');
    expect(s.calls.filter(c => c.url.endsWith('/$value'))).toHaveLength(2);
    expect(s.holds).toHaveLength(1); expect(s.files.size).toBe(1);
    expect(Array.from(s.registry.values()).filter(f => f.locator !== null)).toHaveLength(0);
  });
  test.each(['post-reader-failed', 'post-used', 'post-missing-length'])('received %s failure cannot enter lost-response reconciliation', async fault => {
    const s = await setup(); s.fault(fault);
    await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow();
    expect(s.holds).toHaveLength(1); expect(s.files.size).toBe(1);
    expect(Array.from(s.registry.values()).filter(f => f.locator !== null)).toHaveLength(0);
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1); expect(s.calls.some(c => c.url.includes('GetFileBy'))).toBe(false);
  });
  test.each(['timeout-stored-delayed', 'timeout-absent-delayed'])('actual no-response deadline %s retains one attempt and one POST', async fault => {
    const s = await setup(); s.fault(fault);
    if (fault === 'timeout-stored-delayed') {
      const locator = await s.transport.create(new Uint8Array([1, 2]), s.context);
      expect(locator.u).toBe(guid(100)); expect(s.holds).toHaveLength(0);
    } else {
      await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow(); expect(s.holds).toHaveLength(1);
      expect(Array.from(s.registry.values()).filter(f => f.locator !== null)).toHaveLength(0);
    }
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1); expect(s.registry.size).toBe(1);
    expect(s.captured.some(c => c.url.includes('/Files/add('))).toBe(false);
  });
  test.each([null, 'text/plain', 'application/json;odata=verbose', 'application/json;charset=utf-16',
    'application/json;odata=nometadata;odata=nometadata', 'application/json;encoding=gzip',
    'application/json;unknown=value', 'application/json;'])('received success rejects unsupported media %s', async contentType => {
    const s = await setup(); s.received({ contentType });
    await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow('MEDIA');
    expect(s.holds).toHaveLength(1); expect(s.files.size).toBe(1);
    expect(Array.from(s.registry.values()).filter(f => f.locator !== null)).toHaveLength(0);
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1); expect(s.calls.some(c => c.url.includes('GetFileBy'))).toBe(false);
  });
  test.each([200, 201])('valid complete HTTP%d File response binds the immutable readback', async status => {
    const s = await setup(); let original: Uint8Array | undefined;
    s.received({ status, contentType: 'Application/JSON; Charset="UTF-8"; OData=NoMetadata', body: v => {
      original = new TextEncoder().encode(' \n' + JSON.stringify({ Exists: true, UIVersionLabel: '1.0',
        Name: String(v.ServerRelativeUrl).split('/').pop(), ...v }, null, 2) + '\n'); return original;
    } });
    const locator = await s.transport.create(new Uint8Array([1, 2]), s.context);
    expect(locator.u).toBe(guid(100)); expect(s.holds).toHaveLength(0);
    expect(s.captured.find(c => c.url.includes('/Files/add('))!.bytes).toEqual(original);
    expect(s.calls.find(c => c.method === 'POST')!.options.headers['OData-Version']).toBe('3.0');
    await preserveReceivedCase('valid-' + status, s, 'FULFILLED');
  });
  const invalidConflict: [string, (value: Record<string, unknown>) => Uint8Array][] = [
    ['malformed', () => new TextEncoder().encode('not JSON')], ['empty', () => new Uint8Array()],
    ['foreign-body', () => storageBytes({ UniqueId: guid(999), AuthorId: 999 })],
    ['success-file', () => storageBytes({ UniqueId: guid(100), ServerRelativeUrl: root + '/f', Length: '2', MajorVersion: 1, MinorVersion: 0, ETag: '"x"' })],
    ['wrapper', v => storageBytes({ d: v })], ['extra-top', v => storageBytes({ ...v, target: 'foreign' })],
    ['missing-code', () => storageBytes({ error: { message: { lang: 'en', value: 'exists' } } })],
    ['blank-code', () => storageBytes({ error: { code: ' ', message: { lang: 'en', value: 'exists' } } })],
    ['extra-error', () => storageBytes({ error: { code: 'X', message: { lang: 'en', value: 'exists' }, target: 'foreign' } })],
    ['message-scalar', () => storageBytes({ error: { code: 'X', message: 'exists' } })],
    ['message-extra', () => storageBytes({ error: { code: 'X', message: { lang: 'en', value: 'exists', extra: 1 } } })],
    ['message-empty', () => storageBytes({ error: { code: 'X', message: { lang: '', value: 'exists' } } })],
    ['innererror-array', () => storageBytes({ error: { code: 'X', message: { lang: 'en', value: 'exists' }, innererror: [] } })],
    ['innererror-null', () => storageBytes({ error: { code: 'X', message: { lang: 'en', value: 'exists' }, innererror: null } })],
    ['duplicate-diagnostic', () => new TextEncoder().encode('{"error":{"code":"X","message":{"lang":"en","value":"exists"},"innererror":{"a":1,"a":2}}}')]
  ];
  test.each(invalidConflict)('received 409 rejects %s before reconciliation', async (name, body) => {
    const s = await setup(); s.received({ status: 409, body });
    await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow();
    await preserveReceivedCase('conflict-' + name, s, 'REJECTED');
    expect(s.files.size).toBe(1); expect(s.holds).toHaveLength(1);
    expect(Array.from(s.registry.values()).filter(f => f.locator !== null)).toHaveLength(0);
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1); expect(s.calls.some(c => c.url.includes('GetFileBy'))).toBe(false);
  });
  test('valid 409 diagnostic JSON remains opaque and requires exact same-file readback', async () => {
    const s = await setup(); s.received({ status: 409, contentType: 'application/json;charset=utf-8;odata=verbose', body: v => {
      const error = v.error as Record<string, unknown>;
      return new TextEncoder().encode(JSON.stringify({ error: { ...error, innererror: { AuthorId: 999, untrusted: ['diagnostic'] } } }, null, 1));
    } });
    const locator = await s.transport.create(new Uint8Array([1, 2]), s.context);
    expect(locator.u).toBe(guid(100)); expect(s.holds).toHaveLength(0); expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1);
    expect(s.calls.filter(c => c.url.endsWith('/$value'))).toHaveLength(2); await preserveReceivedCase('valid-conflict', s, 'FULFILLED');
  });
  test('409 with the success media profile is unsupported and cannot reconcile', async () => {
    const s = await setup(); s.received({ status: 409, contentType: 'application/json;odata=nometadata' });
    await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow('MEDIA_PROFILE');
    expect(s.holds).toHaveLength(1); expect(s.calls.some(c => c.url.includes('GetFileBy'))).toBe(false);
  });
  test('defaults, missing ports, missing grant/resource/registry and stale CAS make no REST call', async () => {
    const s = await setup(); const bytes = new Uint8Array([1, 2]);
    for (const transport of [new SharePointC2bImmutableFileStoreV1(s.client),
      new SharePointC2bImmutableFileStoreV1(s.client, { enabled: true, binding: s.binding, readMode: 'private-stage' })]) {
      await expect(transport.create(bytes, s.context)).rejects.toThrow();
    }
    for (const fault of ['missing-host', 'no-reservation', 'missing-attempt', 'stale-cas']) {
      s.fault(fault); await expect(s.transport.create(bytes, s.context)).rejects.toThrow();
    }
    expect(s.calls).toHaveLength(0);
  });
  test('actual create request is overwrite=false and complete binary double reads are retained', async () => {
    const s = await setup(); const bytes = new Uint8Array([0, 0xff, 0x41, 0x80]);
    const locator = await s.transport.create(bytes, s.context); expect(await s.transport.read(locator)).toEqual(bytes);
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1);
    expect(s.calls.find(c => c.method === 'POST')!.url).toContain('overwrite=false');
    expect(s.calls.every(c => c.url.startsWith(site + '/_api/') && c.options.redirect === 'error')).toBe(true);
    expect(s.calls.filter(c => c.url.endsWith('/$value')).length).toBe(4);
    expect(s.captured.filter(c => c.url.endsWith('/$value')).every(c => Buffer.from(c.bytes).equals(Buffer.from(bytes)))).toBe(true);
    expect(s.calls.filter(c => c.url.endsWith('/$value')).every(c => c.options.headers['If-Match'] === '"file-1"')).toBe(true);
    expect(s.holds).toHaveLength(0); expect(s.registry.size).toBe(1);
  });
  test('each missing native operation denies before network, including provenance and raw retention', async () => {
    for (const key of ['captureCurrentHostAndGrant', 'assertReservedResources', 'readAttempt', 'prepareFile',
      'recordVerifiedFile', 'findRegisteredFile', 'assertCapturedFileProvenance', 'retainCompleteRawResponse', 'holdAttempt']) {
      const s = await setup(); delete (s.ports as unknown as Record<string, unknown>)[key];
      await expect(s.transport.create(new Uint8Array([1]), s.context)).rejects.toThrow('DEPENDENCY_UNAVAILABLE');
      expect(s.calls).toHaveLength(0);
    }
  });
  test.each(['post-retention', 'post-length', 'post-denied'])('received POST %s failure cannot become recovered success', async fault => {
    const s = await setup(); s.fault(fault);
    await expect(s.transport.create(new Uint8Array([1]), s.context)).rejects.toThrow();
    expect(s.files.size).toBe(1); expect(s.registry.size).toBe(1); expect(s.holds).toHaveLength(1);
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1);
    expect(s.calls.some(c => c.url.includes('GetFileByServerRelativeUrl'))).toBe(false);
  });
  test('registered-file read failure retains and holds its attempt', async () => {
    const s = await setup(); const locator = await s.transport.create(new Uint8Array([1]), s.context);
    s.fault('rights'); await expect(s.transport.read(locator)).rejects.toThrow();
    expect(s.files.size).toBe(1); expect(s.registry.size).toBe(1); expect(s.holds).toHaveLength(1);
  });
  test('the same attempt reuses exact registered file without a second create', async () => {
    const s = await setup(); const bytes = new Uint8Array([1]);
    const first = await s.transport.create(bytes, s.context); const second = await s.transport.create(bytes, s.context);
    expect(second).toEqual(first); expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1);
  });
  test.each(['collision-match', 'timeout-stored'])('reconciles %s with one POST and complete same-identity readback', async fault => {
    const s = await setup(); s.fault(fault); const bytes = new Uint8Array([1, 2]);
    const locator = await s.transport.create(bytes, s.context); expect(locator.h).toBe(await storageSHA256(bytes));
    expect(s.calls.filter(c => c.method === 'POST')).toHaveLength(1); expect(s.holds).toHaveLength(0);
  });
  test.each(['redirect', 'author', 'version', 'wrong-library', 'wrong-guid', 'etag-change', 'body-change',
    'body-too-large', 'length-representation', 'missing', 'rights', 'timeout-absent', 'collision-divergent', 'record-timeout',
    'metadata-too-large', 'missing-complete-reader', 'file-duplicate'])('fails closed and retains private stage on %s', async fault => {
    const s = await setup(); s.fault(fault);
    await expect(s.transport.create(new Uint8Array([1, 2]), s.context)).rejects.toThrow();
    expect(s.registry.size).toBe(1); expect(s.holds.length).toBe(1);
    expect(s.calls.filter(c => c.method === 'POST').length).toBeLessThanOrEqual(1);
    expect(s.calls.some(c => c.method === 'DELETE' || c.options.headers?.['IF-MATCH'] === '*')).toBe(false);
  });
  test('private orphan survives lost registry confirmation and cannot be accepted or replayed', async () => {
    const s = await setup(); s.fault('record-timeout'); await expect(s.transport.create(new Uint8Array([1]), s.context)).rejects.toThrow();
    expect(s.files.size).toBe(1); expect(s.registry.size).toBe(1);
    const calls = s.calls.length; s.fault(''); await expect(s.transport.create(new Uint8Array([1]), s.context)).rejects.toThrow('HELD');
    expect(s.calls.length).toBe(calls);
  });
  test('unregistered, unsealed and missing-native reads cannot initiate network', async () => {
    const s = await setup(); const locator: C2bFileLocator = { u: guid(88), v: '1.0', n: 1, h: hash };
    await expect(s.transport.read(locator)).rejects.toThrow('UNREGISTERED');
    const accepted = new SharePointC2bImmutableFileStoreV1(s.client, { enabled: true, binding: s.binding, readMode: 'accepted' }, s.ports);
    await expect(accepted.read(locator)).rejects.toThrow('UNSEALED'); expect(s.calls).toHaveLength(0);
  });
  test.each(['actor', 'role', 'candidate', 'grant', 'uri', 'target'])('rejects captured host/context attack %s before REST', async attack => {
    const s = await setup();
    if (attack === 'actor') s.host.binding.source.expectedActor = 'FOREIGN';
    if (attack === 'role') s.host.binding.roles.effectiveRole = 'SystemAdmin';
    if (attack === 'candidate') s.host.binding.candidate.commit = 'f'.repeat(40);
    if (attack === 'grant') s.host.binding.grant.authoritySHA256 = 'F'.repeat(64);
    if (attack === 'uri') s.host.siteUrl = 'http://foreign.invalid';
    if (attack === 'target') s.host.binding.target.library = guid(99);
    await expect(s.transport.create(new Uint8Array([1]), s.context)).rejects.toThrow(); expect(s.calls).toHaveLength(0);
  });
});
