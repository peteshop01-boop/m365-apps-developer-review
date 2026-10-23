/** Local resource bounds, not an approved tenant receipt policy. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLengthGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength')?.get;
const tagGetter = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get;

/** Read internal typed-array slots, never caller-shadowable length/byteLength/
 * buffer properties. Proxies, detached/empty arrays and other views fail closed.
 * The native Uint8Array copy also ignores custom iterators and own length fields. */
export function intrinsicByteLength(value: unknown): number {
  if (!byteLengthGetter || !tagGetter || Reflect.apply(tagGetter, value, []) !== 'Uint8Array') throw new Error('INVALID_BYTES');
  const size: unknown = Reflect.apply(byteLengthGetter, value, []);
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0) throw new Error('INVALID_BYTES');
  return size;
}

export function copyBoundedBytes(value: unknown, limit: number): Uint8Array {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_BODY_BYTES) throw new Error('INVALID_BOUND');
  const size = intrinsicByteLength(value);
  if (size > limit) throw new Error('BYTES_TOO_LARGE'); // Before allocating the copy.
  const copy = new Uint8Array(value as Uint8Array);
  const copiedSize = intrinsicByteLength(copy);
  if (copiedSize !== size || copiedSize > limit) throw new Error('INVALID_BYTES');
  return copy;
}

export type BoundedBodyResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly code: 'BOUNDED_STREAM_UNAVAILABLE' | 'RESPONSE_TOO_LARGE' | 'INVALID_RESPONSE_STREAM' };
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** No text()/arrayBuffer() fallback. Retains at most limit bytes, then cancels
 * on the first crossing chunk without copying it or requesting another chunk.
 * A host may already have allocated that delivered chunk/network buffers: this
 * bounds application accumulation, not the browser's internal network memory.
 * Empty chunks are rejected to avoid an unbounded zero-progress read loop. */
export async function readBoundedBody(body: unknown, limit: number): Promise<BoundedBodyResult> {
  let result: BoundedBodyResult = { ok: false, code: 'BOUNDED_STREAM_UNAVAILABLE' };
  let reader: unknown;
  let cancel: (() => Promise<unknown>) | undefined;
  let release: (() => unknown) | undefined;
  let finished = false;
  try {
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_BODY_BYTES || !object(body)) return result;
    const getReader = body.getReader;
    if (typeof getReader !== 'function') return result;
    reader = Reflect.apply(getReader, body, []);
    if (!object(reader)) return result;
    const readMethod = reader.read; const cancelMethod = reader.cancel; const releaseMethod = reader.releaseLock;
    if (typeof cancelMethod === 'function') cancel = () => Reflect.apply(cancelMethod, reader, []);
    if (typeof releaseMethod === 'function') release = () => Reflect.apply(releaseMethod, reader, []);
    if (typeof readMethod !== 'function' || !cancel || !release) return result;
    result = { ok: false, code: 'INVALID_RESPONSE_STREAM' };
    const buffer = new Uint8Array(limit);
    let total = 0;
    for (;;) {
      const next: unknown = await Reflect.apply(readMethod, reader, []);
      if (!object(next) || typeof next.done !== 'boolean') break;
      if (next.done) {
        if (next.value !== undefined) break;
        finished = true;
        result = { ok: true, bytes: buffer.slice(0, total) };
        break;
      }
      const chunk = next.value;
      const size = intrinsicByteLength(chunk);
      if (size > limit - total) { result = { ok: false, code: 'RESPONSE_TOO_LARGE' }; break; }
      // Native typed-array copy, checked again before retention. No shadowed
      // length, byteLength, buffer or iterator property participates.
      const copied = copyBoundedBytes(chunk, limit - total);
      buffer.set(copied, total);
      total += copied.byteLength;
    }
  } catch {
    result = { ok: false, code: 'INVALID_RESPONSE_STREAM' };
  } finally {
    if (!finished && cancel) {
      try { await cancel(); } catch { /* Never echo private transport errors. */ }
    }
    if (release) {
      try { release(); } catch { result = { ok: false, code: 'INVALID_RESPONSE_STREAM' }; }
    }
  }
  return result;
}
