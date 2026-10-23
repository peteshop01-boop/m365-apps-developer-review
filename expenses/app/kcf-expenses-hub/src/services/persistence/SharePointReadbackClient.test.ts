import { SharePointReadbackClient } from './SharePointReadbackClient';
import type { IReadbackFetchPlatform } from './SharePointReadbackClient';
import type { IExpenseReadback } from './ExpenseReadback';
import type { StoredReceipt } from './PersistenceContract';

const expected: IExpenseReadback = { id: 7001, expenseLineKey: 'synthetic-key', parentId: 101, dateIso: '2026-10-13',
  supplier: 'Synthetic', description: 'Synthetic', nominalCode: '00010', nominalDescription: 'Synthetic', amountPence: 1250, notes: '', isVoided: false };
const receipt = (): Extract<StoredReceipt, { kind: 'file' }> => ({ kind: 'file', expenseId: 7001, fileName: 'Receipt 1.pdf',
  mediaType: 'application/pdf', size: 5, sha256: 'a'.repeat(64), storage: { kind: 'list-attachment' } });
function harness(overrides: Record<string, unknown> = {}): { client: SharePointReadbackClient; get: jest.Mock; readBytes: jest.Mock; readText: jest.Mock; read: jest.Mock } {
  const readBytes = jest.fn(async () => new Uint8Array([37, 80, 68, 70, 45]).buffer);
  const readText = jest.fn(async () => 'MUST_NOT_BUFFER');
  const read = jest.fn();
  const json = JSON.stringify({ Id: 7001, ExpenseLineKey: 'synthetic-key', ClaimSubmissionRefId: 101,
      ExpenseDate: '2026-10-13T00:00:00Z', Supplier: 'Synthetic', ExpenseDescription: 'Synthetic', NominalCode: '00010',
      NominalDescription: 'Synthetic', GrossAmount: 12.50, ClaimantNotes: '', IsVoided: false });
  const get = jest.fn(async (url: string) => {
    const bytes = url.endsWith('/$value') ? new Uint8Array([37, 80, 68, 70, 45]) : new TextEncoder().encode(json);
    let delivered = false;
    read.mockImplementation(async () => {
      if (delivered) return { done: true };
      delivered = true; return { done: false, value: bytes };
    });
    return { status: 200, url, redirected: false,
      headers: { get: (name: string) => name === 'ETag' ? '"1"' : name === 'Content-Length' ? '5' : null },
      body: { getReader: () => ({ read, cancel: async () => undefined, releaseLock: () => undefined }) },
      arrayBuffer: readBytes, text: readText, ...overrides };
  });
  return { client: new SharePointReadbackClient({ fetch: get as unknown as IReadbackFetchPlatform['fetch'],
    currentUrl: () => 'https://example.invalid/sites/REVIEW-TEST-SITE/SitePages/Synthetic.aspx' }), get, readBytes, readText, read };
}
describe('unwired authenticated same-origin GET adapter', () => {
  it('uses reviewed exact-line comparison with public native Fetch and uncached no-redirect GET', async () => {
    const h = harness(); expect((await h.client.verifyLine(expected)).state).toBe('MatchedReadback');
    expect(h.get).toHaveBeenCalledTimes(1);
    expect(h.get.mock.calls[0][0]).toContain("KCFEXP_TEST102_ExpenseLines')/items(7001)?$select=");
    expect((h.get.mock.calls as unknown[][])[0][1]).toMatchObject({ method: 'GET', mode: 'same-origin', credentials: 'same-origin', cache: 'no-store', redirect: 'error', headers: { 'OData-Version': '' } });
    expect(h.readText).not.toHaveBeenCalled(); expect(h.read).toHaveBeenCalledTimes(2);
  });
  it('rejects getter expectation before authenticated transport', async () => {
    const h = harness(); const c = { ...expected }; const getter = jest.fn(() => 999);
    Object.defineProperty(c, 'id', { get: getter });
    expect((await h.client.verifyLine(c)).state).toBe('Blocked'); expect(getter).not.toHaveBeenCalled(); expect(h.get).not.toHaveBeenCalled();
  });
  it('addresses attachment by fixed TEST list + expense ID and encoded filename', async () => {
    const h = harness(); expect(await h.client.readReceipt(receipt())).toHaveLength(5);
    expect(h.get.mock.calls[0][0]).toContain("/items(7001)/AttachmentFiles('Receipt%201.pdf')/$value");
    expect(h.readBytes).not.toHaveBeenCalled(); expect(h.read).toHaveBeenCalledTimes(2);
  });
  it('addresses library file by immutable GUID without following ReceiptUrl', async () => {
    const h = harness(); await h.client.readReceipt({ ...receipt(), storage: { kind: 'library-file', fileId: '0f5d8240-a060-4f7a-a798-b6e2b61b4ac0' } });
    expect(h.get.mock.calls[0][0]).toContain("/GetFileById('0f5d8240-a060-4f7a-a798-b6e2b61b4ac0')/$value");
  });
  it.each([401, 403, 404, 429, 503])('does not buffer or retry receipt HTTP %s', async status => {
    const h = harness({ status }); await expect(h.client.readReceipt(receipt())).rejects.toThrow('RECEIPT_UNAVAILABLE');
    expect(h.get).toHaveBeenCalledTimes(1); expect(h.readBytes).not.toHaveBeenCalled();
    expect(h.read).not.toHaveBeenCalled();
  });
  it.each([{ redirected: true }, { url: 'https://elsewhere.invalid/file' }, { headers: { get: () => null } }, { headers: { get: () => '999999999' } }])('rejects unsafe response before buffering %j', async override => {
    const h = harness(override); await expect(h.client.readReceipt(receipt())).rejects.toThrow('RECEIPT_UNAVAILABLE');
    expect(h.readBytes).not.toHaveBeenCalled();
    expect(h.read).not.toHaveBeenCalled();
  });
  it.each(['../receipt.pdf', "evil').pdf", 'receipt.svg', 'a%2fb.pdf'])('rejects unsafe file name %s before GET', async fileName => {
    const h = harness(); await expect(h.client.readReceipt({ ...receipt(), fileName })).rejects.toThrow('RECEIPT_UNAVAILABLE');
    expect(h.get).not.toHaveBeenCalled();
  });
});
