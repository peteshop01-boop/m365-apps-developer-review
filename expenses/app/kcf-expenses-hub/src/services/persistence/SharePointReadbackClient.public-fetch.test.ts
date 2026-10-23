import { SharePointReadbackClient } from './SharePointReadbackClient';
import type { IExpenseReadback } from './ExpenseReadback';
import type { StoredReceipt } from './PersistenceContract';

const site = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const expected: IExpenseReadback = { id: 7001, expenseLineKey: 'synthetic-key', parentId: 101, dateIso: '2026-10-13',
  supplier: 'Synthetic', description: 'Synthetic', nominalCode: '00010', nominalDescription: 'Synthetic', amountPence: 1250, notes: '', isVoided: false };
const record = { Id: 7001, ExpenseLineKey: 'synthetic-key', ClaimSubmissionRefId: 101, ExpenseDate: '2026-10-13T00:00:00Z',
  Supplier: 'Synthetic', ExpenseDescription: 'Synthetic', NominalCode: '00010', NominalDescription: 'Synthetic', GrossAmount: 12.5, ClaimantNotes: '', IsVoided: false };

test('public Fetch Response stream verifies the same line without an SPFx preview wrapper', async () => {
  const fetcher = jest.fn(async (url: string) => {
    const response = new Response(JSON.stringify(record), { status: 200, headers: { ETag: '"1"' } });
    // Synthetic HTTP fixture supplies the requested URL; bytes/stream/headers/
    // status/redirected are the actual native Response implementation.
    Object.defineProperty(response, 'url', { value: url });
    jest.spyOn(response, 'text').mockRejectedValue(new Error('WHOLE_BODY_FORBIDDEN'));
    jest.spyOn(response, 'arrayBuffer').mockRejectedValue(new Error('WHOLE_BODY_FORBIDDEN'));
    return response;
  });
  const client = new SharePointReadbackClient({ fetch: fetcher, currentUrl: () => site + '/SitePages/Synthetic.aspx' });
  expect((await client.verifyLine(expected)).state).toBe('MatchedReadback');
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((fetcher.mock.calls as unknown[][])[0][1]).toMatchObject({ method: 'GET', credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', redirect: 'error' });
});

const receipt = (): Extract<StoredReceipt, { kind: 'file' }> => ({ kind: 'file', expenseId: 7001, fileName: 'Receipt.pdf',
  mediaType: 'application/pdf', size: 5, sha256: 'a'.repeat(64), storage: { kind: 'list-attachment' } });
function streamed(options: { chunks?: Uint8Array[]; status?: number; length?: string; currentUrl?: string; redirected?: boolean; otherUrl?: string; noBody?: boolean } = {}): {
  client: SharePointReadbackClient; fetcher: jest.Mock; cancel: jest.Mock; pull: jest.Mock; buffered: jest.Mock;
} {
  const cancel = jest.fn(), pull = jest.fn(), buffered = jest.fn(async () => { throw new Error('WHOLE_BODY_FORBIDDEN'); });
  const fetcher = jest.fn(async (url: string) => {
    const chunks = options.chunks || [new Uint8Array([37, 80, 68, 70, 45])]; let index = 0;
    const body = new ReadableStream<Uint8Array>({ pull: c => { pull(); if (index < chunks.length) c.enqueue(chunks[index++]); else c.close(); }, cancel }, { highWaterMark: 0 });
    const response = new Response(options.noBody ? null : body, { status: options.status || 200,
      headers: { ETag: '"1"', 'Content-Length': options.length === undefined ? '5' : options.length } });
    Object.defineProperty(response, 'url', { value: options.otherUrl || url });
    if (options.redirected) Object.defineProperty(response, 'redirected', { value: true });
    jest.spyOn(response, 'text').mockImplementation(buffered);
    jest.spyOn(response, 'arrayBuffer').mockImplementation(buffered);
    return response;
  });
  return { client: new SharePointReadbackClient({ fetch: fetcher, currentUrl: () => options.currentUrl || site + '/SitePages/Synthetic.aspx' }), fetcher, cancel, pull, buffered };
}

test.each([
  'http://example.invalid/sites/REVIEW-TEST-SITE/SitePages/Synthetic.aspx',
  'https://other.invalid/sites/REVIEW-TEST-SITE/SitePages/Synthetic.aspx',
  'https://example.invalid/sites/REVIEW-PROD-SITE/SitePages/Synthetic.aspx',
  site + '-other/SitePages/Synthetic.aspx', site + '/../REVIEW-PROD-SITE/page.aspx',
  'https://account:synthetic.user@example.invalid/sites/REVIEW-TEST-SITE/page.aspx',
  'http://localhost:4321/'
])('native read is held outside the exact current TEST web: %s', async currentUrl => {
  const h = streamed({ currentUrl }); await expect(h.client.readReceipt(receipt())).rejects.toThrow('RECEIPT_UNAVAILABLE');
  expect(h.fetcher).not.toHaveBeenCalled();
});

test.each([401, 403, 404, 429, 503])('HTTP%s discards unread body without SDK auth refresh or replay', async status => {
  const h = streamed({ status }); await expect(h.client.readReceipt(receipt())).rejects.toThrow('RECEIPT_UNAVAILABLE');
  expect(h.fetcher).toHaveBeenCalledTimes(1); expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.pull).not.toHaveBeenCalled(); expect(h.buffered).not.toHaveBeenCalled();
});

test.each([{ redirected: true }, { otherUrl: 'https://elsewhere.invalid/receipt' }])('unsafe native response is cancelled before read %j', async options => {
  const h = streamed(options); await expect(h.client.readReceipt(receipt())).rejects.toThrow('RECEIPT_UNAVAILABLE');
  expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.pull).not.toHaveBeenCalled(); expect(h.fetcher).toHaveBeenCalledTimes(1);
});

test('a misleading native Content-Length cannot permit an oversized streamed receipt', async () => {
  const h = streamed({ chunks: [new Uint8Array(6), new Uint8Array(6)], length: '5' });
  await expect(h.client.readReceipt(receipt())).rejects.toThrow('RECEIPT_UNAVAILABLE');
  expect(h.pull).toHaveBeenCalledTimes(1); expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.buffered).not.toHaveBeenCalled();
});

test('native JSON read cancels on the first chunk over64KiB without whole-body methods', async () => {
  const h = streamed({ chunks: [new Uint8Array(65537), new Uint8Array(10)] });
  expect((await h.client.verifyLine(expected)).state).toBe('Blocked');
  expect(h.pull).toHaveBeenCalledTimes(1); expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.buffered).not.toHaveBeenCalled();
});

test('receipt header mismatch cancels without reading or buffering', async () => {
  const h = streamed({ length: '6' }); await expect(h.client.readReceipt(receipt())).rejects.toThrow('RECEIPT_UNAVAILABLE');
  expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.pull).not.toHaveBeenCalled();
});

test('missing native body fails closed without a text or arrayBuffer fallback', async () => {
  const h = streamed({ noBody: true }); await expect(h.client.readReceipt(receipt())).rejects.toThrow('RECEIPT_UNAVAILABLE'); expect(h.buffered).not.toHaveBeenCalled();
});

test('native receipt stream returns exact stored bytes with no private SDK wrapper', async () => {
  const h = streamed(); expect(Array.from(await h.client.readReceipt(receipt()))).toEqual([37, 80, 68, 70, 45]);
  expect(h.fetcher).toHaveBeenCalledTimes(1); expect(h.pull).toHaveBeenCalledTimes(2); expect(h.buffered).not.toHaveBeenCalled();
});

test('native network failure neither replays nor leaks private diagnostics', async () => {
  const fetcher = jest.fn(async () => { throw new Error('PRIVATE-CREDENTIAL-DIAGNOSTIC'); });
  const client = new SharePointReadbackClient({ fetch: fetcher, currentUrl: () => site });
  const result = await client.verifyLine(expected); expect(result.state).toBe('Unavailable');
  expect(JSON.stringify(result)).not.toContain('PRIVATE'); expect(fetcher).toHaveBeenCalledTimes(1);
});
