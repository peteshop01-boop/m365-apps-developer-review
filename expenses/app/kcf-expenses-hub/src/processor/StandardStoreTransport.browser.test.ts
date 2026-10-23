import { StandardStoreIO } from './StandardStoreTransport';
import { TEST_SITE } from './SharePointStandardPlans';

test('native browser canonical URL is compared to canonical OData query without hiding the response URL', async () => {
  const url = TEST_SITE + "/_api/web/lists(guid'b4e61774-0eb8-4868-a874-b892c744a2c0')/items?$filter=OperationKey eq '11:expense-synthetic-operation-0001'&$top=2";
  const send = jest.fn(async plan => ({ status: 200, url: new URL(plan.url).href, redirected: false,
    body: new Response('{"value":[]}').body }));
  const result = await new StandardStoreIO({ send }).execute({ method: 'GET', url, headers: {}, retry: 'none' });
  expect(result.body).toEqual({ value: [] });
  expect(send.mock.calls[0][0].url).toBe(new URL(url).href);
});

test.each([201, 202, 206])('binary HTTP%s rejects and cancels its unused native stream without reading', async status => {
  const cancel = jest.fn(), pull = jest.fn();
  const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  const url = TEST_SITE + '/_api/web/synthetic';
  const io = new StandardStoreIO({ send: async () => ({ status, url, redirected: false, body }) });
  await expect(io.binary({ method: 'GET', url, headers: {}, retry: 'none' })).rejects.toThrow('BINARY_UNAVAILABLE');
  expect(cancel).toHaveBeenCalledTimes(1); expect(pull).not.toHaveBeenCalled(); expect(body.locked).toBe(false);
});

test('rejected request envelope also cancels before consuming bytes', async () => {
  const cancel = jest.fn(), pull = jest.fn(), url = TEST_SITE + '/_api/web/synthetic';
  const body = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 });
  const io = new StandardStoreIO({ send: async () => ({ status: 206, url, redirected: false, body }) });
  await expect(io.binary({ method: 'GET', url, headers: {}, retry: 'none' }, true)).rejects.toThrow('BINARY_UNAVAILABLE');
  expect(cancel).toHaveBeenCalledTimes(1); expect(pull).not.toHaveBeenCalled(); expect(body.locked).toBe(false);
});

test('cancellation failure stays private and cannot change a rejected binary status', async () => {
  const cancel = jest.fn(async () => { throw new Error('private storage detail'); }), url = TEST_SITE + '/_api/web/synthetic';
  const body = new ReadableStream<Uint8Array>({ cancel }, { highWaterMark: 0 });
  const io = new StandardStoreIO({ send: async () => ({ status: 202, url, redirected: false, body }) });
  await expect(io.binary({ method: 'GET', url, headers: {}, retry: 'none' })).rejects.toThrow('BINARY_UNAVAILABLE');
  expect(cancel).toHaveBeenCalledTimes(1); expect(body.locked).toBe(false);
});
