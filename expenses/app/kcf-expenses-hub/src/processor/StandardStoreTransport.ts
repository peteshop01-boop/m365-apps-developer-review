import { copyBoundedBytes, intrinsicByteLength, readBoundedBody } from '../services/persistence/BoundedBody';
import { MAX_RECEIPT_BYTES } from '../services/persistence/PersistenceValidation';
import { MAX_ENVELOPE_BYTES } from '../services/persistence/RequestLedgerExpensePort';
import type { IStandardActionExecutor, IStandardResponse } from './StandardConditionalWriter';
import type { IStandardRestPlan } from './SharePointStandardPlans';
import { TEST_SITE } from './SharePointStandardPlans';

/** Server connection boundary. It must execute under the protected Standard
 * SharePoint connection, not a caller/browser service credential. No deployed
 * implementation/connection is supplied by this module. Body is a bounded-
 * stream-capable transport response, never a pre-buffered text/ArrayBuffer. */
export interface IStandardTransportResponse {
    readonly status: number; readonly url: string; readonly redirected: boolean;
    readonly etag?: string; readonly body: unknown;
}
export interface IStandardStoreTransport {
  send(plan: IStandardRestPlan): Promise<IStandardTransportResponse>;
}
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object'; }

/** Release an abandoned binary response without draining/allocating its body.
 * Cancellation errors cannot expose private transport details or turn a rejected
 * HTTP status into success. The reader lock is released even if cancel fails. */
async function discardBinary(body: unknown): Promise<void> {
  let reader: unknown;
  try {
    if (!object(body) || typeof body.getReader !== 'function') return;
    reader = Reflect.apply(body.getReader, body, []);
    if (object(reader) && typeof reader.cancel === 'function') await Reflect.apply(reader.cancel, reader, []);
  } catch { /* Private; retain the original BINARY_UNAVAILABLE outcome. */ }
  finally {
    try { if (object(reader) && typeof reader.releaseLock === 'function') Reflect.apply(reader.releaseLock, reader, []); }
    catch { /* Private. */ }
  }
}

/** Only the sealed base64 request envelope has this larger wire cap. Existing
 * receipt and JSON limits stay10MiB/64KiB. No header is trusted for actual size. */
async function envelopeStream(body: unknown): Promise<Uint8Array> {
  if (!object(body) || typeof body.getReader !== 'function') throw new Error('BOUNDED_STREAM_REQUIRED');
  const reader: unknown = Reflect.apply(body.getReader, body, []);
  if (!object(reader)) throw new Error('INVALID_STREAM');
  const read = reader.read, cancel = reader.cancel, release = reader.releaseLock;
  let finished = false, failed = false; let output: Uint8Array | undefined;
  try {
    if (typeof read !== 'function' || typeof cancel !== 'function' || typeof release !== 'function') throw new Error('INVALID_STREAM');
    const parts: Uint8Array[] = []; let total = 0;
    for (;;) {
      const chunk: unknown = await Reflect.apply(read, reader, []);
      if (!object(chunk) || typeof chunk.done !== 'boolean') throw new Error('INVALID_STREAM');
      if (chunk.done) {
        if (chunk.value !== undefined || !total) throw new Error('INVALID_STREAM');
        finished = true; break;
      }
      const size = intrinsicByteLength(chunk.value);
      if (size > MAX_ENVELOPE_BYTES - total || size > MAX_RECEIPT_BYTES) throw new Error('ENVELOPE_TOO_LARGE');
      parts.push(copyBoundedBytes(chunk.value, Math.min(MAX_RECEIPT_BYTES, MAX_ENVELOPE_BYTES - total))); total += size;
    }
    const bytes = new Uint8Array(total); let position = 0;
    parts.forEach(p => { bytes.set(p, position); position += p.byteLength; }); output = bytes;
  } catch {
    failed = true;
  } finally {
    if (!finished && typeof cancel === 'function') { try { await Reflect.apply(cancel, reader, []); } catch { /* private */ } }
    if (typeof release === 'function') { try { Reflect.apply(release, reader, []); } catch { failed = true; } }
  }
  if (failed || !output) throw new Error('BOUNDED_ENVELOPE_REQUIRED'); return output;
}

export interface IStandardStoreIO extends IStandardActionExecutor {
  binary(plan: IStandardRestPlan, envelope?: boolean): Promise<Uint8Array>;
}

export class StandardStoreIO implements IStandardStoreIO {
  public constructor(private readonly transport: IStandardStoreTransport) {}
  private async response(plan: IStandardRestPlan): Promise<IStandardTransportResponse> {
    if (!plan.url.startsWith(`${TEST_SITE}/_api/`) || /[\r\n#]/.test(plan.url) || plan.retry !== 'none') throw new Error('DESTINATION_HELD');
    // Fetch serialises spaces in OData filters as %20. Canonicalise the outgoing
    // plan first; never rewrite a received URL to conceal a destination mismatch.
    const url = new URL(plan.url).href;
    if (!url.startsWith(`${TEST_SITE}/_api/`)) throw new Error('DESTINATION_HELD');
    const result = await this.transport.send({ ...plan, url, headers: { ...plan.headers, 'Cache-Control': 'no-store' } });
    if (result.url !== url || result.redirected !== false) throw new Error('RESPONSE_DESTINATION');
    return result;
  }
  public async execute(plan: IStandardRestPlan): Promise<IStandardResponse> {
    const r = await this.response(plan);
    if (r.status === 204 || r.status < 200 || r.status >= 300) return { status: r.status, etag: r.etag };
    const body = await readBoundedBody(r.body, 65536);
    if (!body.ok) throw new Error('BOUNDED_JSON_REQUIRED');
    try { return { status: r.status, etag: r.etag, body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.bytes)) }; }
    catch { throw new Error('INVALID_JSON_RESPONSE'); }
  }
  public async binary(plan: IStandardRestPlan, envelope = false): Promise<Uint8Array> {
    const r = await this.response(plan);
    if (r.status !== 200) { await discardBinary(r.body); throw new Error('BINARY_UNAVAILABLE'); }
    if (envelope) return envelopeStream(r.body);
    const body = await readBoundedBody(r.body, MAX_RECEIPT_BYTES);
    if (!body.ok || !body.bytes.length) throw new Error('BOUNDED_BINARY_REQUIRED');
    return body.bytes;
  }
}
