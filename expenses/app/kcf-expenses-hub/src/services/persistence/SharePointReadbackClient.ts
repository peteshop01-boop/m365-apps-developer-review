import { reopenExpense, TEST_EXPENSE_ITEMS } from './ExpenseReadback';
import type { IExpenseReadback, IReadOnlySharePoint, ReadbackResult } from './ExpenseReadback';
import type { StoredReceipt } from './PersistenceContract';
import { fileName, hash, MAX_RECEIPT_BYTES, own, positiveId } from './PersistenceValidation';
import { readBoundedBody } from './BoundedBody';

const site = 'https://example.invalid/sites/REVIEW-TEST-SITE';
/** Public browser primitives only. Injection is for source tests/composition,
 * never a web-part property, request body or tenant activation flag. */
export interface IReadbackFetchPlatform {
  currentUrl(): string;
  fetch(url: string, options: RequestInit): Promise<Response>;
}
const browserPlatform: IReadbackFetchPlatform = {
  currentUrl: () => globalThis.location.href,
  fetch: (url, options) => globalThis.fetch(url, options)
};
async function discard(response: Response | undefined): Promise<void> {
  // The bounded consumer owns a stream once read. Cancel only an unused native
  // response, including HTTP/metadata rejection before the first body read.
  try { if (response?.bodyUsed === false) await response.body?.cancel(); } catch { /* No private diagnostics. */ }
}

/** Uses the current same-origin SharePoint session and public Fetch Response
 * streams. SPHttpClientResponse body/redirected are preview-only SDK members;
 * do not unwrap private SDK fields or buffer a whole response as a fallback.
 * GET-only and unwired in the demo; scoped read/fixture authority is still required. */
export class SharePointReadbackClient {
  public constructor(private readonly platform: IReadbackFetchPlatform = browserPlatform) {}

  private async get(url: string, accept: string): Promise<Response> {
    const current = new URL(this.platform.currentUrl()), target = new URL(url), fixed = new URL(site);
    if (current.origin !== fixed.origin || current.username || current.password ||
        (current.pathname !== fixed.pathname && !current.pathname.startsWith(fixed.pathname + '/')) ||
        target.href !== url || !url.startsWith(site + '/_api/web/') || target.username || target.password || target.hash) {
      throw new Error('READBACK_CONTEXT_HELD');
    }
    // Each caller below constructs its own fixed, validated read endpoint.
    // No SDK 401 cookie-refresh/replay path, token, digest, POST or redirect.
    const response = await this.platform.fetch(url, { method: 'GET', mode: 'same-origin', credentials: 'same-origin',
      cache: 'no-store', redirect: 'error', headers: { Accept: accept, 'OData-Version': '' } });
    if (response.url !== url || response.redirected !== false) {
      await discard(response); throw new Error('READBACK_DESTINATION');
    }
    return response;
  }

  public async verifyLine(expected: IExpenseReadback): Promise<ReadbackResult> {
    let response: Response | undefined;
    const port: IReadOnlySharePoint = { get: async url => {
      // reopenExpense constructs only the fixed TEST102 line endpoint.
      response = await this.get(url, 'application/json;odata=nometadata');
      return { status: response.status, url: response.url, redirected: response.redirected,
        etag: response.headers.get('ETag'), retryAfter: response.headers.get('Retry-After'),
        body: response.body };
    } };
    try { return await reopenExpense(port, expected); }
    finally { await discard(response); }
  }

  /** Downloads from the exact manifest-bound item or library GUID. Does not open
   * an active URL/window. Caller must check SHA256 and use the existing contained
   * image/PDF viewer; download success is not receipt-authorisation proof. */
  public async readReceipt(input: Extract<StoredReceipt, { kind: 'file' }>): Promise<Uint8Array> {
    let response: Response | undefined;
    try {
      const r = own(input, ['kind', 'expenseId', 'fileName', 'mediaType', 'size', 'sha256', 'storage']);
      if (r.kind !== 'file' || !positiveId(r.expenseId) || !fileName(r.fileName) || !positiveId(r.size) ||
          r.size > MAX_RECEIPT_BYTES || !hash(r.sha256)) throw new Error('INVALID_RECEIPT');
      const kind = Object.getOwnPropertyDescriptor(r.storage, 'kind')?.value;
      const storage = own(r.storage, kind === 'list-attachment' ? ['kind'] : ['kind', 'fileId']);
      let url: string;
      if (storage.kind === 'list-attachment') {
        url = `${TEST_EXPENSE_ITEMS}(${r.expenseId})/AttachmentFiles('${encodeURIComponent(r.fileName)}')/$value`;
      } else {
        if (storage.kind !== 'library-file' || typeof storage.fileId !== 'string' ||
            !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(storage.fileId)) throw new Error('INVALID_STORAGE');
        url = `${site}/_api/web/GetFileById('${storage.fileId}')/$value`;
      }
      response = await this.get(url, 'application/octet-stream');
      if (response.status !== 200) throw new Error('RECEIPT_UNAVAILABLE');
      const length = response.headers.get('Content-Length');
      // Header is only an early consistency check. It never permits buffering
      // the whole response; enforce the bound independently on actual chunks.
      if (length === null || !/^\d+$/.test(length) || Number(length) !== r.size) throw new Error('RECEIPT_SIZE_MISMATCH');
      const body = await readBoundedBody(response.body, r.size);
      if (!body.ok || body.bytes.byteLength !== r.size) throw new Error('RECEIPT_SIZE_MISMATCH');
      return body.bytes;
    } catch { throw new Error('RECEIPT_UNAVAILABLE'); }
    finally { await discard(response); }
  }
}
