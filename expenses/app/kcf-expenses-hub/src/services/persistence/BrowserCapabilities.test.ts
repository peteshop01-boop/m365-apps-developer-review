import { copyBoundedBytes, readBoundedBody } from './BoundedBody';
import { snapshotCommand } from './PersistenceValidation';
import { browserSha256 } from './PersistenceContract';
import { ExpensePersistenceService } from './ExpensePersistenceService';

describe('standards-backed persistence test capabilities in Node and SPFx jsdom', () => {
  it('encodes UTF-8 bytes and decodes split multibyte input with fatal error checking', () => {
    const bytes = new TextEncoder().encode('£');
    expect(Array.from(bytes)).toEqual([194, 163]);
    // The Node encoder can return another realm's typed array. Do not relax
    // plain-record checks or replace Uint8Array merely to accommodate it.
    expect(Array.from(copyBoundedBytes(bytes, 2))).toEqual([194, 163]);
    const decoder = new TextDecoder('utf-8', { fatal: true });
    expect(decoder.decode(bytes.slice(0, 1), { stream: true })).toBe('');
    expect(decoder.decode(bytes.slice(1))).toBe('£');
    expect(() => new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array([255]))).toThrow();
  });
  it('retains same-realm plain record snapshots and reaches the protected processor gate', async () => {
    const input = { operationId: 'synthetic-operation-001', parentId: 101, parentEtag: '"3"', date: '13-10-2026',
      supplier: 'Synthetic', description: 'Synthetic', nominalCode: '00010', amount: '12.50', notes: '',
      receipt: { kind: 'none' as const, reason: 'Synthetic reason' } };
    expect(Object.getPrototypeOf(JSON.parse(JSON.stringify(input)))).toBe(Object.prototype);
    expect(snapshotCommand(input)).toEqual(input);
    const resolve = jest.fn(async () => ({ state: 'Held' })); const submit = jest.fn();
    const digest = jest.fn(async () => 'a'.repeat(64));
    const service = new ExpensePersistenceService({ resolve, submit, readExpense: jest.fn(), readReceipt: jest.fn() }, digest);
    expect(await service.save(input)).toEqual({ state: 'Held', code: 'TENANT_ADMISSION_HELD', tenantWriteAllowed: false });
    expect(digest).toHaveBeenCalledTimes(1); expect(resolve).toHaveBeenCalledTimes(1); expect(submit).not.toHaveBeenCalled();
  });
  it('uses a real cancellable byte stream without weakening size checks', async () => {
    const cancel = jest.fn();
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(3)); }, cancel });
    expect(await readBoundedBody(body, 2)).toEqual({ ok: false, code: 'RESPONSE_TOO_LARGE' });
    expect(cancel).toHaveBeenCalledTimes(1); expect(body.locked).toBe(false);
  });
  it('really detaches transferred buffers instead of mocking structuredClone', () => {
    const bytes = new Uint8Array([1, 2]); const moved = structuredClone(bytes.buffer, { transfer: [bytes.buffer] });
    expect(bytes.byteLength).toBe(0); expect(Array.from(new Uint8Array(moved))).toEqual([1, 2]);
    expect(() => copyBoundedBytes(bytes, 2)).toThrow('INVALID_BYTES');
  });
  it('still refuses browser hashing when genuine SubtleCrypto is unavailable', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: {} });
    try { await expect(browserSha256(new Uint8Array([1]))).rejects.toThrow('DIGEST_UNAVAILABLE'); }
    finally {
      if (original) Object.defineProperty(globalThis, 'crypto', original);
      else Reflect.deleteProperty(globalThis, 'crypto');
    }
  });
});
