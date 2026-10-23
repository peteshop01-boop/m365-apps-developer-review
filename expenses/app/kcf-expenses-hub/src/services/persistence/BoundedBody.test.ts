import { copyBoundedBytes, readBoundedBody } from './BoundedBody';
import { MAX_RECEIPT_BYTES, snapshotCommand } from './PersistenceValidation';

function source(chunks: Uint8Array[]): { body: unknown; read: jest.Mock; cancel: jest.Mock; release: jest.Mock } {
  let index = 0;
  const read = jest.fn(async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true });
  const cancel = jest.fn(async () => undefined); const release = jest.fn();
  return { body: { getReader: () => ({ read, cancel, releaseLock: release }) }, read, cancel, release };
}

describe('intrinsic receipt snapshot bounds', () => {
  it('never invokes shadowed size/buffer/iterator getters and copies independent bytes', () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const getter = jest.fn(() => { throw new Error('PRIVATE'); });
    for (const key of ['length', 'byteLength', 'buffer', Symbol.iterator]) Object.defineProperty(bytes, key, { get: getter });
    const copy = copyBoundedBytes(bytes, 8);
    bytes[0] = 0;
    expect(Array.from(copy)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(getter).not.toHaveBeenCalled();
  });
  it.each([MAX_RECEIPT_BYTES, MAX_RECEIPT_BYTES + 1])('validates actual receipt size %s with a valid PNG signature', size => {
    const bytes = new Uint8Array(size); bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const input = { operationId: 'synthetic-operation-001', parentId: 101, parentEtag: '"3"', date: '13-10-2026',
      supplier: 'Synthetic', description: 'Synthetic', nominalCode: '00010', amount: '12.50', notes: '',
      receipt: { kind: 'file', fileName: 'receipt.png', mediaType: 'image/png', bytes } };
    if (size > MAX_RECEIPT_BYTES) expect(() => snapshotCommand(input)).toThrow('BYTES_TOO_LARGE');
    else {
      const result = snapshotCommand(input);
      expect(result.receipt.kind).toBe('file');
      if (result.receipt.kind === 'file') { expect(result.receipt.bytes.byteLength).toBe(size); expect(result.receipt.bytes).not.toBe(bytes); }
    }
  });
  it.each([new Uint8Array(), new Uint16Array(2), new Proxy(new Uint8Array(2), {}),
    Object.create(Uint8Array.prototype), { length: 1, byteLength: 1, [Symbol.toStringTag]: 'Uint8Array' }])('rejects invalid byte view %#', bytes => {
    expect(() => copyBoundedBytes(bytes, 8)).toThrow('INVALID_BYTES');
  });
  it('rejects a detached buffer before any snapshot allocation', () => {
    const bytes = new Uint8Array(8);
    structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
    expect(() => copyBoundedBytes(bytes, 8)).toThrow('INVALID_BYTES');
  });
});

describe('bounded stream resource handling', () => {
  it('returns exact-cap bytes only after EOF, releases the lock and does not cancel a completed stream', async () => {
    const h = source([new Uint8Array([1, 2]), new Uint8Array([3, 4])]);
    expect(await readBoundedBody(h.body, 4)).toEqual({ ok: true, bytes: new Uint8Array([1, 2, 3, 4]) });
    expect(h.read).toHaveBeenCalledTimes(3); expect(h.cancel).not.toHaveBeenCalled(); expect(h.release).toHaveBeenCalledTimes(1);
  });
  it('stops after the crossing chunk without another read even when chunk length is shadowed', async () => {
    const chunk = new Uint8Array(5); const getter = jest.fn(() => 1);
    Object.defineProperty(chunk, 'length', { get: getter }); Object.defineProperty(chunk, 'byteLength', { get: getter });
    const h = source([chunk, new Uint8Array(100)]);
    expect(await readBoundedBody(h.body, 4)).toEqual({ ok: false, code: 'RESPONSE_TOO_LARGE' });
    expect(h.read).toHaveBeenCalledTimes(1); expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledTimes(1);
    expect(getter).not.toHaveBeenCalled();
  });
  it('rejects endless empty chunks immediately and cancels', async () => {
    const h = source([new Uint8Array(), new Uint8Array()]);
    expect(await readBoundedBody(h.body, 4)).toEqual({ ok: false, code: 'INVALID_RESPONSE_STREAM' });
    expect(h.read).toHaveBeenCalledTimes(1); expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, null, {}, { getReader: 1 }])('fails closed without usable stream %#', async body => {
    expect(await readBoundedBody(body, 4)).toEqual({ ok: false, code: 'BOUNDED_STREAM_UNAVAILABLE' });
  });
  it.each(['read', 'cancel', 'releaseLock'])('does not read when reader lacks %s', async missing => {
    const read = jest.fn(); const cancel = jest.fn(); const releaseLock = jest.fn();
    const reader: Record<string, unknown> = { read, cancel, releaseLock }; delete reader[missing];
    expect(await readBoundedBody({ getReader: () => reader }, 4)).toEqual({ ok: false, code: 'BOUNDED_STREAM_UNAVAILABLE' });
    expect(read).not.toHaveBeenCalled();
    if (missing !== 'cancel') expect(cancel).toHaveBeenCalledTimes(1);
    if (missing !== 'releaseLock') expect(releaseLock).toHaveBeenCalledTimes(1);
  });
  it('contains read and cancellation errors, still releases the lock', async () => {
    const h = source([]);
    h.read.mockRejectedValue(new Error('PRIVATE_READ_TOKEN')); h.cancel.mockRejectedValue(new Error('PRIVATE_CANCEL_TOKEN'));
    expect(await readBoundedBody(h.body, 4)).toEqual({ ok: false, code: 'INVALID_RESPONSE_STREAM' });
    expect(h.read).toHaveBeenCalledTimes(1); expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledTimes(1);
  });
  it('contains a release failure instead of returning bytes', async () => {
    const h = source([new Uint8Array([1])]); h.release.mockImplementation(() => { throw new Error('PRIVATE_RELEASE'); });
    expect(await readBoundedBody(h.body, 4)).toEqual({ ok: false, code: 'INVALID_RESPONSE_STREAM' });
  });
  it.each([{ done: 'true' }, { done: true, value: new Uint8Array([1]) }, { done: false, value: 'PRIVATE' }])('cancels malformed reader result %#', async value => {
    const h = source([]); h.read.mockResolvedValue(value);
    expect(await readBoundedBody(h.body, 4)).toEqual({ ok: false, code: 'INVALID_RESPONSE_STREAM' });
    expect(h.read).toHaveBeenCalledTimes(1); expect(h.cancel).toHaveBeenCalledTimes(1); expect(h.release).toHaveBeenCalledTimes(1);
  });
  it('consumes and cancels a native byte stream at the cap, releases its lock', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(5)); }, cancel });
    expect(await readBoundedBody(body, 4)).toEqual({ ok: false, code: 'RESPONSE_TOO_LARGE' });
    expect(cancel).toHaveBeenCalledTimes(1); expect(body.locked).toBe(false);
  });
  it('fails closed on an already locked native stream', async () => {
    const body = new ReadableStream<Uint8Array>(); const lock = body.getReader();
    try { expect(await readBoundedBody(body, 4)).toEqual({ ok: false, code: 'INVALID_RESPONSE_STREAM' }); }
    finally { lock.releaseLock(); }
  });
});
