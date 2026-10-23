import { ExpensePersistenceService } from './ExpensePersistenceService';
import type { ICreateExpense } from './PersistenceContract';
import { MAX_RECEIPT_BYTES } from './PersistenceValidation';
import { reopenExpense } from './ExpenseReadback';
import type { IExpenseReadback } from './ExpenseReadback';
import { SharePointReadbackClient } from './SharePointReadbackClient';
import type { IReadbackFetchPlatform } from './SharePointReadbackClient';

function nativeClient(get: jest.Mock): SharePointReadbackClient {
  return new SharePointReadbackClient({ fetch: get as unknown as IReadbackFetchPlatform['fetch'],
    currentUrl: () => 'https://example.invalid/sites/REVIEW-TEST-SITE/SitePages/Synthetic.aspx' });
}

const expected: IExpenseReadback = { id: 7001, expenseLineKey: 'synthetic-key', parentId: 101, dateIso: '2026-10-13',
  supplier: 'Synthetic', description: 'Synthetic', nominalCode: '00010', nominalDescription: 'Synthetic', amountPence: 1250, notes: '', isVoided: false };
function stream(chunks: Uint8Array[]): { getReader: jest.Mock; read: jest.Mock; cancel: jest.Mock; release: jest.Mock } {
  let index = 0;
  const read = jest.fn(async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true });
  const cancel = jest.fn(async () => undefined); const release = jest.fn();
  return { getReader: jest.fn(() => ({ read, cancel, releaseLock: release })), read, cancel, release };
}
const jsonLine = (notes: string): string => JSON.stringify({ Id: 7001, ExpenseLineKey: 'synthetic-key', ClaimSubmissionRefId: 101,
  ExpenseDate: '2026-10-13T00:00:00Z', Supplier: 'Synthetic', ExpenseDescription: 'Synthetic', NominalCode: '00010',
  NominalDescription: 'Synthetic', GrossAmount: 12.50, ClaimantNotes: notes, IsVoided: false });
const manifest = { kind: 'file' as const, expenseId: 7001, fileName: 'receipt.pdf', mediaType: 'application/pdf', size: 5,
  sha256: 'a'.repeat(64), storage: { kind: 'list-attachment' as const } };

describe('independent P2 bounds regressions (fail on original frozen source)', () => {
  it('rejects intrinsic10MiB+1 receipt with shadowed length11 before submit', async () => {
    const bytes = new Uint8Array(MAX_RECEIPT_BYTES + 1);
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    Object.defineProperty(bytes, 'length', { value: 11 });
    Object.defineProperty(bytes, 'byteLength', { value: 11 });
    const submittedSizes: number[] = [];
    const submit = jest.fn(async (c: ICreateExpense) => {
      if (c.receipt.kind === 'file') submittedSizes.push(c.receipt.bytes.byteLength);
      return { state: 'Rejected' };
    });
    const resolve = jest.fn(async () => ({ state: 'Absent' })); const digest = jest.fn(async () => 'a'.repeat(64));
    const service = new ExpensePersistenceService({ submit, resolve,
      readExpense: async () => ({ state: 'Rejected' }), readReceipt: async () => new Uint8Array() }, digest);
    const result = await service.save({ operationId: 'synthetic-operation-001', parentId: 101, parentEtag: '"3"', date: '13-10-2026',
      supplier: 'Synthetic', description: 'Synthetic', nominalCode: '00010', amount: '12.50', notes: '',
      receipt: { kind: 'file', fileName: 'receipt.png', mediaType: 'image/png', bytes } });
    expect(submittedSizes).toEqual([]);
    expect(submit).not.toHaveBeenCalled(); expect(result.state).toBe('Rejected');
    expect(resolve).not.toHaveBeenCalled(); expect(digest).not.toHaveBeenCalled();
  });
  it('cancels expense JSON after first over-cap chunk without whole text buffering', async () => {
    const body = stream([new Uint8Array(40000), new Uint8Array(30000), new Uint8Array(90000)]);
    const text = jest.fn(async () => ' '.repeat(160000));
    const result = await reopenExpense({ get: async url => ({ status: 200, url, redirected: false, etag: '"1"', retryAfter: null, body, text }) }, expected);
    expect(result.state).toBe('Blocked'); expect(text).not.toHaveBeenCalled();
    expect(body.read).toHaveBeenCalledTimes(2); expect(body.cancel).toHaveBeenCalledTimes(1); expect(body.release).toHaveBeenCalledTimes(1);
  });
  it('cancels receipt exceeding actual size despite matching Content-Length without arrayBuffer', async () => {
    const body = stream([new Uint8Array(4), new Uint8Array(2), new Uint8Array(90000)]);
    const arrayBuffer = jest.fn(async () => new Uint8Array(MAX_RECEIPT_BYTES + 1).buffer);
    const get = jest.fn(async (url: string) => ({ status: 200, url, redirected: false, body, arrayBuffer,
      headers: { get: () => '5' } }));
    await expect(nativeClient(get).readReceipt({ kind: 'file', expenseId: 7001,
      fileName: 'receipt.pdf', mediaType: 'application/pdf', size: 5, sha256: 'a'.repeat(64), storage: { kind: 'list-attachment' } })).rejects.toThrow('RECEIPT_UNAVAILABLE');
    expect(arrayBuffer).not.toHaveBeenCalled(); expect(body.read).toHaveBeenCalledTimes(2);
    expect(body.cancel).toHaveBeenCalledTimes(1); expect(body.release).toHaveBeenCalledTimes(1); expect(get).toHaveBeenCalledTimes(1);
  });
});

describe('GET-only stream ports after bounds repair', () => {
  it.each(['supplier', 'description'] as const)('R7 rejects over-capacity %s expectation and raw readback', async name => {
    const get = jest.fn();
    expect((await reopenExpense({ get }, { ...expected, [name]: 'x'.repeat(256) })).state).toBe('Blocked');
    expect(get).not.toHaveBeenCalled();
    const raw = JSON.parse(jsonLine('')) as Record<string, unknown>;
    raw[name === 'supplier' ? 'Supplier' : 'ExpenseDescription'] = 'x'.repeat(256);
    const body = stream([new TextEncoder().encode(JSON.stringify(raw))]);
    const result = await reopenExpense({ get: async url => ({ status: 200, url, redirected: false, etag: '"1"', retryAfter: null, body }) }, expected);
    expect(result).toEqual({ state: 'Blocked', code: 'INVALID_LINE_RESPONSE', tenantWriteAllowed: false });
  });
  it('decodes split multibyte UTF-8 and matches the same line at exactly 64 KiB', async () => {
    const json = jsonLine('£');
    const raw = new TextEncoder().encode(json);
    const padded = new TextEncoder().encode(json + ' '.repeat(65536 - raw.byteLength));
    const split = padded.indexOf(194) + 1; // Split the two-byte pound sign, not just ASCII whitespace.
    const body = stream([padded.slice(0, split), padded.slice(split)]);
    const text = jest.fn();
    const result = await reopenExpense({ get: async url => ({ status: 200, url, redirected: false, etag: '"1"', retryAfter: null, body, text }) }, { ...expected, notes: '£' });
    expect(result.state).toBe('MatchedReadback'); expect(text).not.toHaveBeenCalled();
    expect(body.read).toHaveBeenCalledTimes(3); expect(body.cancel).not.toHaveBeenCalled(); expect(body.release).toHaveBeenCalledTimes(1);
  });
  it('rejects JSON by actual UTF-8 byte length even when its character count is below 64 KiB', async () => {
    const json = jsonLine('£'.repeat(33000)); expect(json.length).toBeLessThan(65536);
    const bytes = new TextEncoder().encode(json); expect(bytes.byteLength).toBeGreaterThan(65536);
    const body = stream([bytes.slice(0, 65536), bytes.slice(65536), new Uint8Array(100)]);
    const result = await reopenExpense({ get: async url => ({ status: 200, url, redirected: false, etag: '"1"', retryAfter: null, body }) }, expected);
    expect(result).toEqual({ state: 'Blocked', code: 'RESPONSE_TOO_LARGE', tenantWriteAllowed: false });
    expect(body.read).toHaveBeenCalledTimes(2); expect(body.cancel).toHaveBeenCalledTimes(1); expect(body.release).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid UTF-8 instead of replacing bytes to manufacture a match', async () => {
    const body = stream([new Uint8Array([255])]);
    expect(await reopenExpense({ get: async url => ({ status: 200, url, redirected: false, etag: '"1"', retryAfter: null, body }) }, expected))
      .toEqual({ state: 'Blocked', code: 'INVALID_JSON_ENCODING', tenantWriteAllowed: false });
  });
  it.each([undefined, null, {}, { getReader: () => { throw new Error('PRIVATE_HOST_ERROR'); } }])('SPFx fails closed with no usable stream %# and no buffering fallback', async body => {
    const text = jest.fn(async () => jsonLine('')); const arrayBuffer = jest.fn(async () => new Uint8Array(5).buffer);
    const get = jest.fn(async (url: string) => ({ status: 200, url, redirected: false, body, text, arrayBuffer,
      headers: { get: (name: string) => name === 'ETag' ? '"1"' : '5' } }));
    const client = nativeClient(get);
    const result = await client.verifyLine(expected);
    expect(result.state).toBe('Blocked'); expect(JSON.stringify(result)).not.toContain('PRIVATE');
    await expect(client.readReceipt(manifest)).rejects.toThrow('RECEIPT_UNAVAILABLE');
    expect(text).not.toHaveBeenCalled(); expect(arrayBuffer).not.toHaveBeenCalled(); expect(get).toHaveBeenCalledTimes(2);
  });
  it.each([4, 5])('checks actual receipt size %s against the declared and manifest size 5', async size => {
    const body = stream([new Uint8Array(size)]); const arrayBuffer = jest.fn();
    const get = jest.fn(async (url: string) => ({ status: 200, url, redirected: false, body, arrayBuffer, headers: { get: () => '5' } }));
    const client = nativeClient(get);
    if (size === 5) expect(await client.readReceipt(manifest)).toEqual(new Uint8Array(5));
    else await expect(client.readReceipt(manifest)).rejects.toThrow('RECEIPT_UNAVAILABLE');
    expect(body.read).toHaveBeenCalledTimes(2); expect(body.release).toHaveBeenCalledTimes(1); expect(body.cancel).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled(); expect(get).toHaveBeenCalledTimes(1);
  });
  it('contains receipt stream and cancellation exception values', async () => {
    const body = stream([]); body.read.mockRejectedValue(new Error('PRIVATE_READ'));
    body.cancel.mockRejectedValue(new Error('PRIVATE_CANCEL'));
    const get = jest.fn(async (url: string) => ({ status: 200, url, redirected: false, body, headers: { get: () => '5' } }));
    await expect(nativeClient(get).readReceipt(manifest)).rejects.toEqual(new Error('RECEIPT_UNAVAILABLE'));
    expect(body.read).toHaveBeenCalledTimes(1); expect(body.cancel).toHaveBeenCalledTimes(1); expect(body.release).toHaveBeenCalledTimes(1);
  });
});
