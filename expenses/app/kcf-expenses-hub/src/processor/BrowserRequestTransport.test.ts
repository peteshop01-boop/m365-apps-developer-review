import { BrowserRequestTransport } from './BrowserRequestTransport';
import type { IRequestTransportBinding } from './BrowserRequestTransport';
import { StandardStoreIO } from './StandardStoreTransport';
import { createImmutableRequestFile, TEST_SITE } from './SharePointStandardPlans';
import type { IStandardRestPlan } from './SharePointStandardPlans';
import { encodeRequest, decodeRequest } from '../services/persistence/RequestLedgerExpensePort';
import type { IPreparedExpense } from '../services/persistence/PersistenceContract';

const guid = (n: number): string => `${String(n).padStart(8, '0')}-1111-1111-1111-111111111111`;
const binding = (): IRequestTransportBinding => ({ requestRoot: '/sites/REVIEW-TEST-SITE/Synthetic Requests',
  requestListId: guid(1), expenseListId: guid(5), readListIds: [1, 2, 3, 5, 6, 7, 8, 9].map(guid) });
const command = (): IPreparedExpense => ({ operationId: 'expense-synthetic-operation-0001', parentId: 101, parentEtag: '"1"',
  date: '21-10-2026', supplier: 'Synthetic', description: 'Synthetic', nominalCode: '00010', amount: '12.34', notes: '',
  receipt: { kind: 'none', reason: 'Synthetic missing receipt' } });
function plan(c = command(), actor = 11): IStandardRestPlan {
  const p = createImmutableRequestFile(binding().requestRoot + '/' + actor, c.operationId, encodeRequest(c, 'a'.repeat(64)));
  return { ...p, url: new URL(p.url).href };
}
interface IHarness {
  transport: BrowserRequestTransport; io: StandardStoreIO;
  fetcher: jest.Mock<Promise<Response>, [string, RequestInit]>; digest: jest.Mock<Promise<string>, [string]>;
  cancel: jest.Mock; whole: jest.Mock;
  set(v: { current?: string; web?: string; actor?: number; admin?: boolean; status?: number; otherUrl?: string }): void;
}
function harness(): IHarness {
  let current = TEST_SITE + '/SitePages/Synthetic.aspx', web = TEST_SITE, actor = 11, admin = false, status = 201;
  let otherUrl: string | undefined; const cancel = jest.fn(), whole = jest.fn();
  const fetcher = jest.fn(async (url: string, options: RequestInit) => {
    const isActor = url.includes('currentuser'), bytes = new TextEncoder().encode(JSON.stringify(isActor ? { Id: actor, IsSiteAdmin: admin } : { Id: 501 }));
    let sent = false;
    const body = new ReadableStream<Uint8Array>({ pull(c) { if (sent) c.close(); else { sent = true; c.enqueue(bytes); } }, cancel }, { highWaterMark: 0 });
    const r = new Response(body, { status: isActor ? 200 : status, headers: { ETag: '"1"' } });
    Object.defineProperty(r, 'url', { value: otherUrl || url });
    jest.spyOn(r, 'text').mockImplementation(whole); jest.spyOn(r, 'arrayBuffer').mockImplementation(whole);
    return r;
  });
  const digest = jest.fn(async (_web: string) => 'synthetic-digest');
  const transport = new BrowserRequestTransport({ currentUrl: () => current, webAbsoluteUrl: () => web, fetch: fetcher, fetchDigest: digest }, binding());
  return { transport, io: new StandardStoreIO(transport), fetcher, digest, cancel, whole,
    set: (v: { current?: string; web?: string; actor?: number; admin?: boolean; status?: number; otherUrl?: string }) => {
      current = v.current ?? current; web = v.web ?? web; actor = v.actor ?? actor; admin = v.admin ?? admin;
      status = v.status ?? status; otherUrl = v.otherUrl;
    } };
}

test('immutable request uses exact copied bytes, public digest, ordinary actor and no supplied credentials/Author', async () => {
  const h = harness(), p = plan(); expect((await h.io.execute(p)).status).toBe(201);
  expect(h.digest).toHaveBeenCalledTimes(1); expect(h.digest).toHaveBeenCalledWith(TEST_SITE);
  const [url, options] = h.fetcher.mock.calls[2]; expect(url).toBe(p.url); expect(h.fetcher).toHaveBeenCalledTimes(3);
  expect(options).toMatchObject({ method: 'POST', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store',
    headers: { 'X-RequestDigest': 'synthetic-digest', 'Content-Type': 'application/octet-stream' } });
  expect(new Uint8Array(options.body as ArrayBuffer)).toEqual(p.body);
  expect(Object.keys(decodeRequest(new Uint8Array(options.body as ArrayBuffer)).command)).not.toContain('actor');
  expect(h.whole).not.toHaveBeenCalled();
});

test('GET OData filters canonicalise before native fetch; no digest obtained', async () => {
  const h = harness(); h.set({ status: 200 });
  const url = `${TEST_SITE}/_api/web/lists(guid'${guid(2)}')/items?$filter=OperationKey eq '11:expense-synthetic-operation-0001'&$top=2`;
  await h.io.execute({ method: 'GET', url, headers: { Accept: 'application/json;odata=nometadata' }, retry: 'none' });
  expect(h.fetcher.mock.calls[0][0]).toBe(new URL(url).href); expect(h.digest).not.toHaveBeenCalled();
});
test.each([400, 401, 403, 409, 429, 503])('HTTP%s never retries immutable upload and cancels its unused body', async status => {
  const h = harness(); h.set({ status }); expect((await h.io.execute(plan())).status).toBe(status);
  await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1); expect(h.cancel).toHaveBeenCalledTimes(1);
});
test.each([{ actor: 12 }, { admin: true }, { web: TEST_SITE + '/subweb' }, { current: 'https://other.invalid/' },
  { current: TEST_SITE + '-other/page.aspx' }])('identity/context mismatch rejects before digest/business write %j', async settings => {
  const h = harness(); h.set(settings); await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.digest).not.toHaveBeenCalled(); expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(0);
});
test.each(['', ' ', 'secret\r\nInjected: 1', 'x'.repeat(8193)])('invalid digest stays private and makes no business write', async value => {
  const h = harness(); h.digest.mockResolvedValue(value); await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(0);
});
test('context is rechecked after digest resolves', async () => {
  const h = harness(); h.digest.mockImplementation(async () => { h.set({ web: TEST_SITE + '/other' }); return 'synthetic'; });
  await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(0);
});
test('byte snapshot survives caller mutation while awaiting digest', async () => {
  const h = harness(), p = plan(), before = new Uint8Array(p.body as Uint8Array);
  h.digest.mockImplementation(async () => { (p.body as Uint8Array).fill(0); return 'synthetic'; });
  await h.io.execute(p); expect(new Uint8Array(h.fetcher.mock.calls[2][1].body as ArrayBuffer)).toEqual(before);
});
test('concurrent duplicate dispatch produces at most one business upload', async () => {
  const h = harness(); const results = await Promise.all([h.io.execute(plan()), h.io.execute(plan())].map(p => p.then(() => true, () => false)));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1);
});

test('P2: concurrent account invalidation before upload dispatch makes zero business POSTs', async () => {
  const h = harness(); let calls = 0; let other: Promise<boolean> | undefined;
  h.fetcher.mockImplementation(async (url, options) => {
    const n = options.method === 'POST' ? 0 : ++calls;
    if (n === 2) queueMicrotask(() => { other = h.transport.send(plan(command(), 22)).then(() => true, () => false); });
    const r = new Response(JSON.stringify(n ? { Id: n === 3 ? 22 : 11, IsSiteAdmin: false } : { Id: 501 }), { status: n ? 200 : 201 });
    Object.defineProperty(r, 'url', { value: url }); return r;
  });
  await expect(h.transport.send(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(await other).toBe(false);
  expect(h.fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
});

test('P2: upload acknowledgement after concurrent invalidation remains ambiguous and never retries', async () => {
  const h = harness(), original = h.fetcher.getMockImplementation()!;
  h.fetcher.mockImplementation(async (url, options) => {
    const r = await original(url, options);
    if (options.method === 'POST') {
      h.set({ actor: 22 });
      await expect(h.transport.send(plan(command(), 22))).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
    }
    return r;
  });
  await expect(h.transport.send(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  await expect(h.transport.send(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
  expect(h.cancel).toHaveBeenCalledTimes(1);
});

test('P2: a rejected different administrator identity permanently invalidates the prior ordinary session', async () => {
  const h = harness(); expect((await h.transport.send(plan())).status).toBe(201);
  h.set({ actor: 22, admin: true });
  await expect(h.transport.send(plan({ ...command(), operationId: 'expense-admin-switch-0002' }, 22))).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  h.set({ actor: 11, admin: false });
  await expect(h.transport.send(plan({ ...command(), operationId: 'expense-after-admin-0003' }))).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(1);
});
test.each(['Authorization', 'X-RequestDigest', 'X-HTTP-Method', 'IF-MATCH', 'Cookie'])('caller header %s cannot cross boundary', async name => {
  const h = harness(), p = plan(); await expect(h.io.execute({ ...p, headers: { ...p.headers, [name]: 'private' } })).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher).not.toHaveBeenCalled(); expect(h.digest).not.toHaveBeenCalled();
});
test.each([
  "/_api/web/lists(guid'fb2ee3cf-fb1e-4248-a3d0-504f4228a062')/items",
  "/_api/web/lists(guid'fb2ee3cf-fb1e-4248-a3d0-504f4228a062')/items(1)/AttachmentFiles/add(FileName='Receipt.pdf')",
  '/_api/web/roleassignments', '/_api/web/folders', '/_api/web/contextinfo'
])('direct mutation blocked before actor/digest %s', async path => {
  const h = harness(); await expect(h.io.execute({ ...plan(), url: TEST_SITE + path })).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher).not.toHaveBeenCalled(); expect(h.digest).not.toHaveBeenCalled();
});
test.each(['overwrite=true', 'other-folder', 'other-file'])('immutable request destination tampering %s denied', async change => {
  const h = harness(), p = plan(); const url = change === 'overwrite=true' ? p.url.replace('overwrite=false', change)
    : change === 'other-folder' ? p.url.replace('%2F11', '%2F12') : p.url.replace('expense-synthetic-operation-0001.json', 'expense-synthetic-operation-0002.json');
  await expect(h.io.execute({ ...p, url })).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher).toHaveBeenCalledTimes(change === 'other-folder' ? 1 : 0);
  expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(0); expect(h.digest).not.toHaveBeenCalled();
});
test.each([guid(4), guid(99)])('unbound/audit list %s not readable by channel', async id => {
  const h = harness(); await expect(h.io.execute({ method: 'GET', url: `${TEST_SITE}/_api/web/lists(guid'${id}')/items(1)`, headers: {}, retry: 'none' })).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher).not.toHaveBeenCalled();
});
test('native response destination mismatch cancels and never replays', async () => {
  const h = harness(); h.set({ otherUrl: TEST_SITE + '/other' });
  await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE'); expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.fetcher).toHaveBeenCalledTimes(1);
});
test('private fetch failure is not leaked and is not retried', async () => {
  const h = harness(); h.fetcher.mockRejectedValue(new Error('PRIVATE_ACTOR_TOKEN')); await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher).toHaveBeenCalledTimes(1); expect(h.digest).not.toHaveBeenCalled();
});
test.each([{}, { Id: 11 }, { Id: '11', IsSiteAdmin: false }, { Id: 11, IsSiteAdmin: 0 }, { Id: 11, IsSiteAdmin: null }, null, []])('malformed actor data cannot obtain digest or write %j', async value => {
  const h = harness(); h.fetcher.mockImplementation(async url => {
    const r = new Response(JSON.stringify(value), { status: 200 }); Object.defineProperty(r, 'url', { value: url }); return r;
  });
  await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.digest).not.toHaveBeenCalled(); expect(h.fetcher).toHaveBeenCalledTimes(1);
});
test('oversized actor response cancels on crossing cap before digest or upload', async () => {
  const h = harness(), cancel = jest.fn(), pull = jest.fn();
  h.fetcher.mockImplementation(async url => {
    const r = new Response(new ReadableStream<Uint8Array>({ pull(c) { pull(); c.enqueue(new Uint8Array(65537)); }, cancel }, { highWaterMark: 0 }));
    Object.defineProperty(r, 'url', { value: url }); return r;
  });
  await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(cancel).toHaveBeenCalledTimes(1); expect(pull).toHaveBeenCalledTimes(1); expect(h.digest).not.toHaveBeenCalled();
});
test.each([11, 22, 240])('one resource binding accepts signed-in ordinary actor %s only in their own prequalified folder', async actor => {
  const h = harness(); h.set({ actor }); const p = plan(command(), actor);
  expect((await h.io.execute(p)).status).toBe(201);
  expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(1);
  expect(h.fetcher.mock.calls[2][0]).toBe(p.url);
});
test('account change during digest acquisition cannot upload into the former account folder', async () => {
  const h = harness(); h.digest.mockImplementation(async () => { h.set({ actor: 22 }); return 'synthetic'; });
  await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(0);
  h.set({ actor: 22 }); h.digest.mockResolvedValue('synthetic');
  await expect(h.io.execute(plan(command(), 22))).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.fetcher.mock.calls.filter(([, o]) => o.method === 'POST')).toHaveLength(0);
});
test.each([0, -1, 2147483648, 1.5])('invalid current user %s cannot upload', async actor => {
  const h = harness(); h.set({ actor }); await expect(h.io.execute(plan())).rejects.toThrow('REQUEST_TRANSPORT_UNAVAILABLE');
  expect(h.digest).not.toHaveBeenCalled();
});
