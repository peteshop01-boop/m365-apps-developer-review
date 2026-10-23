/** @jest-environment node */
"use strict";
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { initialSha256CheckpointV2 as initial, advanceSha256CheckpointV2 as advance,
  finishSha256CheckpointV2 as finish, parseSha256CheckpointV2 as parse, Sha256CheckpointV2 } from './C2bIncrementalByteHashV2';

const E = 'INVALID_SHA256_CHECKPOINT_V2';
const b = (s: string): Uint8Array => new TextEncoder().encode(s);
const wire = (v: unknown): Uint8Array => b(JSON.stringify(v));
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const read = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8').replace(/^\ufeff/, '')) as unknown;
interface OriginalCase { path?: string; name: string; bytes: number; sha256: string }
interface Locator { u: string; n: number; h: string }
interface Descriptor { r: Locator; z: number; h: string; n: number; p: string }
interface Page { l: number; p: string; e: Locator[] }
const originalCases = (read('.test-fixtures/hash/full-byte-hash-results.json') as { rows: OriginalCase[] }).rows;
function originalBytes(row: OriginalCase): Uint8Array {
  if (row.path) return new Uint8Array(readFileSync(row.path));
  if (row.name.indexOf('full-boundary-') === 0) {
    const input = new Uint8Array(row.bytes); for (let i = 0; i < input.length; i++) input[i] = i & 255; return input;
  }
  return b(['', 'abc', 'Ω😀\r\n{"__proto__":{"history":["same","same"]}}'][Number(row.name.split('-').pop())]);
}

describe('pure incremental SHA256 v2', () => {
  test('published empty and abc vectors', () => {
    expect(finish(initial())).toEqual({ bytes: 0, sha256: 'E3B0C44298FC1C149AFBF4C8996FB92427AE41E4649B934CA495991B7852B855' });
    expect(finish(advance(initial(), b('abc')))).toEqual({ bytes: 3, sha256: 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD' });
  });
  test.each([0, 1, 2, 7, 31, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129, 255, 1024])('padding/partition/reference %i bytes', length => {
    const input = new Uint8Array(length); for (let i = 0; i < length; i++) input[i] = (i * 37 + 11) & 255;
    for (const width of [1, 7, 55, 56, 63, 64, 65, 997]) {
      let state = initial();
      for (let i = 0; i < length; i += width) { state = advance(state, input.subarray(i, Math.min(length, i + width))); state = advance(state, new Uint8Array(0)); }
      expect(finish(state)).toEqual({ bytes: length, sha256: sha(input) });
      expect(finish(state)).toEqual(finish(state));
    }
  });
  test('canonical checkpoint import resumes a prefix; branch and finished state stay reusable', () => {
    const prefix = advance(initial(), b('prefix')), imported = parse(wire(prefix));
    expect(finish(imported)).toEqual(finish(prefix));
    expect(finish(advance(imported, b('-a'))).sha256).toBe(sha(b('prefix-a')));
    expect(finish(advance(imported, b('-b'))).sha256).toBe(sha(b('prefix-b')));
    expect(finish(imported).sha256).toBe(sha(b('prefix')));
  });
  test('private view/input/copy isolation, frozen data and no mutation of older state', () => {
    const input = b('abc'), before = initial(), state = advance(before, input), importedBytes = wire(state), imported = parse(importedBytes);
    input.fill(0); importedBytes.fill(0);
    expect(Object.isFrozen(state)).toBe(true); expect(Object.isFrozen(state.h)).toBe(true); expect(Object.isFrozen(state.tail)).toBe(true);
    expect(() => { (state.h as number[])[0] = 1; }).toThrow();
    expect(() => { (state.tail as number[]).push(1); }).toThrow();
    expect(finish(state).sha256).toBe(sha(b('abc'))); expect(finish(imported)).toEqual(finish(state));
    expect(before.bytes).toBe(0); expect(before.tail).toEqual([]); expect(finish(before).sha256).toBe(sha(new Uint8Array(0)));
    const result = finish(state); result.sha256 = 'changed'; result.bytes = 100;
    expect(finish(state).bytes).toBe(3);
  });
  test('all closed checkpoint fields and strict byte canonicalisation', () => {
    const text = JSON.stringify(initial());
    for (const altered of [text + '\n', ' ' + text, text + '{}', text.replace('"bytes":0', '"bytes":0.0'),
      text.replace('"bytes":0', '"bytes":-0'), text.replace('"bytes":0', '"bytes":0,"bytes":0'),
      text.replace('"bytes":0', '"bytes":0,"byt\\u0065s":0'), text.replace('checkpoint', 'check\\u0070oint'),
      text.replace('"tail":[],"bytes":0', '"bytes":0,"tail":[]'), text.replace('"bytes":0', '"extra":0,"bytes":0')]) expect(() => parse(b(altered))).toThrow(E);
    for (const key of ['k', 'h', 'tail', 'bytes']) {
      const v = JSON.parse(text) as Record<string, unknown>; delete v[key]; expect(() => parse(wire(v))).toThrow(E);
    }
    const bom = new Uint8Array(b(text).length + 3); bom.set([0xef, 0xbb, 0xbf]); bom.set(b(text), 3); expect(() => parse(bom)).toThrow(E);
    for (const bytes of [[0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]]) expect(() => parse(new Uint8Array(bytes))).toThrow(E);
  });
  test.each([
    { h: [0, 0, 0, 0, 0, 0, 0] }, { h: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
    { h: [-1, 0, 0, 0, 0, 0, 0, 0] }, { h: [0.5, 0, 0, 0, 0, 0, 0, 0] }, { h: [4294967296, 0, 0, 0, 0, 0, 0, 0] },
    { h: [null, 0, 0, 0, 0, 0, 0, 0] }, { h: { 0: 0, length: 8 } }, { tail: [256], bytes: 1 },
    { tail: [-1], bytes: 1 }, { tail: [0.5], bytes: 1 }, { tail: [null], bytes: 1 }, { tail: new Array(64).fill(0), bytes: 64 },
    { tail: [0], bytes: 0 }, { tail: [], bytes: 1 }, { bytes: -1 }, { bytes: 0.1 }, { bytes: '0' }, { bytes: Number.MAX_SAFE_INTEGER + 1 }, { k: 'raw-http-v1' }
  ].map((mutation, i) => ({ mutation, i })))('malformed checkpoint $i', ({ mutation }) => {
    expect(() => parse(wire(Object.assign({}, initial(), mutation)))).toThrow(E);
  });
  test('negative zero h/tail values deny, and safe representability is the only counter bound', () => {
    const start = JSON.stringify(initial()); expect(() => parse(b(start.replace('1779033703', '-0')))).toThrow(E);
    expect(() => parse(b(start.replace('"tail":[],"bytes":0', '"tail":[-0],"bytes":1')))).toThrow(E);
    const maximum = parse(wire({ k: initial().k, h: initial().h, tail: new Array(63).fill(0), bytes: Number.MAX_SAFE_INTEGER }));
    expect(finish(maximum).bytes).toBe(Number.MAX_SAFE_INTEGER);
    expect(finish(advance(maximum, new Uint8Array(0)))).toEqual(finish(maximum));
    expect(() => advance(maximum, new Uint8Array([1]))).toThrow(E);
    expect(finish(maximum).bytes).toBe(Number.MAX_SAFE_INTEGER);
    const last = parse(wire({ k: initial().k, h: initial().h, tail: new Array(62).fill(0), bytes: Number.MAX_SAFE_INTEGER - 1 }));
    expect(advance(last, new Uint8Array([1])).bytes).toBe(Number.MAX_SAFE_INTEGER);
  });
  test('unissued states reject holes, inherited/hidden/symbol/accessor/exotic/cyclic/Proxy graphs without hooks', () => {
    let hooks = 0;
    const handler: ProxyHandler<object> = { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); }, ownKeys() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); },
      getPrototypeOf() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); }, getOwnPropertyDescriptor() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } };
    const revoked = Proxy.revocable({}, handler); revoked.revoke();
    const holes = new Array(8); const inherited = Object.create([1]); inherited.length = 8;
    const accessor = Object.defineProperty({}, 'bytes', { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } });
    const wordGetter: number[] = []; Object.defineProperty(wordGetter, '0', { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } });
    const cyclic: Record<string, unknown> = {}; cyclic.h = cyclic;
    const hidden = Object.defineProperty({}, 'extra', { value: 1 });
    const symbol = { [Symbol('extra')]: 1 };
    const values: unknown[] = [Object.assign({}, initial()), Object.assign({}, initial(), { h: holes }), Object.assign({}, initial(), { h: inherited }),
      Object.assign({}, initial(), { tail: Array(1), bytes: 1 }), Object.assign({}, initial(), { h: wordGetter }), accessor,
      hidden, symbol, cyclic, Object.create({ extra: 1 }), Object.assign([], { x: 1 }), new Proxy({}, handler),
      new Proxy(initial(), handler), new Proxy(initial().h, handler), new Proxy(initial().tail, handler), revoked.proxy, null, undefined, 1, 'state'];
    for (const value of values) {
      expect(() => finish(value as Sha256CheckpointV2)).toThrow(E);
      expect(() => advance(value as Sha256CheckpointV2, b('x'))).toThrow(E);
      expect(() => parse(value as Uint8Array)).toThrow(E);
    }
    expect(hooks).toBe(0);
    Object.getOwnPropertyNames(new Proxy({}, { ownKeys() { hooks++; return []; } })); expect(hooks).toBe(1);
  });
  test('byte receiver brands reject shared/detached/subclass/exotic/accessor/Proxy inputs with zero hooks', () => {
    let hooks = 0;
    const input = b('abc'), proxy = new Proxy(input, { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); }, ownKeys() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); }, getPrototypeOf() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } });
    const revoked = Proxy.revocable(input, {}); revoked.revoke();
    const extra = b('abc'); Object.defineProperty(extra, 'x', { value: 1 });
    const symbol = b('abc'); Object.defineProperty(symbol, Symbol('x'), { value: 1 });
    const getter = b('abc'); Object.defineProperty(getter, 'x', { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } });
    const exotic = b('abc'); Object.setPrototypeOf(exotic, Object.create(Uint8Array.prototype));
    const detached = b('abc'); structuredClone(detached.buffer, { transfer: [detached.buffer] });
    const detachedEmpty = new Uint8Array(0); structuredClone(detachedEmpty.buffer, { transfer: [detachedEmpty.buffer] });
    const buffer = new ArrayBuffer(3); Object.defineProperty(buffer, 'x', { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } });
    for (const value of [proxy, revoked.proxy, extra, symbol, getter, exotic, detached, detachedEmpty, Buffer.from('abc'),
      new DataView(new ArrayBuffer(3)), new Uint16Array(3), new Uint8ClampedArray(3), new Uint8Array(new SharedArrayBuffer(3)), new Uint8Array(buffer)]) {
      expect(() => advance(initial(), value as Uint8Array)).toThrow(E); expect(() => parse(value as Uint8Array)).toThrow(E);
    }
    expect(hooks).toBe(0);
    const valid = new Uint8Array([0, 97, 98, 99, 0]); expect(finish(advance(initial(), valid.subarray(1, 4))).sha256).toBe(sha(b('abc')));
  });
  test('portable synthetic suite retains all 48 original byte-size cases', () => { expect(originalCases).toHaveLength(48); });
  test.each(originalCases)('portable complete synthetic: $name ($bytes bytes)', row => {
    const input = originalBytes(row); expect(input.length).toBe(row.bytes); expect(sha(input)).toBe(row.sha256);
    let state = initial();
    for (let i = 0; i < input.length; i += 997) state = advance(state, input.subarray(i, Math.min(input.length, i + 997)));
    expect(finish(state)).toEqual({ bytes: input.length, sha256: row.sha256 }); expect(state.tail.length).toBeLessThan(64);
  }, 120000);
  test('complete synthetic 65000001-byte history, all 66 leaves/3 manifest files, whole ordered reference SHA', () => {
    const root = '.test-fixtures/hash/history';
    const descriptor = read(root + '/descriptor.json') as Descriptor, seen = new Set<string>(), reference = createHash('sha256');
    let state = initial(), leaves = 0, actualBytes = 0;
    function walk(locator: Locator, level: number): void {
      expect(seen.has(locator.u)).toBe(false); seen.add(locator.u);
      const input = new Uint8Array(readFileSync(root + '/' + locator.u + '.bin'));
      expect(input.length).toBe(locator.n); expect(sha(input)).toBe(locator.h);
      if (level < 0) { state = advance(state, input); reference.update(input); leaves++; actualBytes += input.length; return; }
      const page = JSON.parse(new TextDecoder().decode(input)) as Page;
      expect(page.l).toBe(level); expect(page.p).toBe(descriptor.p);
      for (const child of page.e) walk(child, level - 1);
    }
    walk(descriptor.r, descriptor.z - 1);
    expect(leaves).toBe(66); expect(seen.size).toBe(69); expect(actualBytes).toBe(65000001);
    const expected = reference.digest('hex').toUpperCase(); expect(expected).toBe(descriptor.h);
    expect(finish(state)).toEqual({ bytes: 65000001, sha256: expected }); expect(state.tail.length).toBeLessThan(64);
  }, 180000);
});
