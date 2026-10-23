/** Pure arithmetic only. Issued identities establish local provenance, never native trust. */
export interface Sha256CheckpointV2 {
  readonly k: 'kcf.kpi.sha256-checkpoint.v2';
  readonly h: readonly number[];
  readonly tail: readonly number[];
  readonly bytes: number;
}

const INVALID = 'INVALID_SHA256_CHECKPOINT_V2';
const KIND = 'kcf.kpi.sha256-checkpoint.v2';
// Captured in the trusted application realm. Hostile or pre-patched realms are not admitted.
const ownNames = Object.getOwnPropertyNames;
const ownSymbols = Object.getOwnPropertySymbols;
function ownKeys(value: object): (string | symbol)[] {
  const result: (string | symbol)[] = ownNames(value);
  const symbols = ownSymbols(value);
  for (let i = 0; i < symbols.length; i++) result.push(symbols[i]);
  return result;
}
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const objectPrototype = Object.prototype;
const arrayPrototype = Array.prototype;
const bytePrototype = Uint8Array.prototype;
const bufferPrototype = ArrayBuffer.prototype;
const isView = ArrayBuffer.isView;
const isArray = Array.isArray;
const freeze = Object.freeze;
const parse = JSON.parse;
const stringify = JSON.stringify;
const finite = Number.isFinite;
const safeInteger = Number.isSafeInteger;
const is = Object.is;
const U8 = Uint8Array;
const typedPrototype = prototype(bytePrototype) as object;
const typedTag = descriptor(typedPrototype, (Symbol as SymbolConstructor & { readonly toStringTag: symbol }).toStringTag)!.get!;
const typedLength = descriptor(typedPrototype, 'byteLength')!.get!;
const typedBuffer = descriptor(typedPrototype, 'buffer')!.get!;
const typedOffset = descriptor(typedPrototype, 'byteOffset')!.get!;
const bufferLength = descriptor(bufferPrototype, 'byteLength')!.get!;
const typedSet = bytePrototype.set;
const decode = TextDecoder.prototype.decode;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const issued = new WeakMap<object, Sha256CheckpointV2>();
const weakGet = WeakMap.prototype.get;
const weakSet = WeakMap.prototype.set;

function deny(): never { throw INVALID; }

/** No reflection on a caller object until intrinsic receiver brands have succeeded. */
function copyBytes(input: unknown): Uint8Array {
  if (!isView(input)) return deny();
  if (typedTag.call(input) !== 'Uint8Array') return deny();
  const length = typedLength.call(input) as number;
  const buffer = typedBuffer.call(input) as ArrayBuffer;
  typedOffset.call(input);
  bufferLength.call(buffer); // Reject SharedArrayBuffer, without invoking its properties.
  if (prototype(input) !== bytePrototype || prototype(buffer) !== bufferPrototype || ownKeys(buffer).length) return deny();
  const keys = ownKeys(input as object);
  if (keys.length !== length) return deny();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== String(i)) return deny();
    const d = descriptor(input, keys[i]);
    if (!d || !('value' in d) || !d.enumerable || !d.writable || !d.configurable) return deny();
  }
  const copy = new U8(length);
  typedSet.call(copy, input as Uint8Array); // Also rejects detached zero-length views.
  return copy;
}

function integer(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && safeInteger(value) && !is(value, -0) && value >= 0 && value <= maximum;
}

/** Called only on private allocations, never as a public structural admission route. */
function values(value: unknown, names: readonly string[], array: boolean): unknown[] {
  if (!value || typeof value !== 'object' || prototype(value) !== (array ? arrayPrototype : objectPrototype)) return deny();
  const keys = ownKeys(value);
  if (keys.length !== names.length + (array ? 1 : 0)) return deny();
  const ds: PropertyDescriptor[] = [];
  for (let i = 0; i < names.length; i++) {
    if (keys[i] !== names[i]) return deny();
    const d = descriptor(value, names[i]);
    if (!d || !('value' in d) || !d.enumerable || !d.writable || !d.configurable) return deny();
    ds.push(d);
  }
  if (array) {
    const d = descriptor(value, 'length');
    if (keys[keys.length - 1] !== 'length' || !d || !('value' in d) || d.enumerable || d.configurable || !d.writable || d.value !== names.length) return deny();
  } else {
    for (const key in value) if (names.indexOf(key) < 0) return deny();
  }
  const result: unknown[] = [];
  for (let i = 0; i < ds.length; i++) result.push(ds[i].value);
  return result;
}

function numericArray(value: unknown, count: number | undefined, maximum: number): number[] {
  if (!isArray(value) || prototype(value) !== arrayPrototype) return deny();
  // Derive membership from keys, not even the private length descriptor's value.
  // values() first admits every index/length descriptor before exposing values.
  const length = ownKeys(value).length - 1;
  if (length < 0 || length > (count === undefined ? 63 : count) || (count !== undefined && length !== count)) return deny();
  const names: string[] = [];
  for (let i = 0; i < length; i++) names.push(String(i));
  const data = values(value, names, true);
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (!integer(data[i], maximum)) return deny();
    result.push(data[i] as number);
  }
  return result;
}

function validate(value: unknown): Sha256CheckpointV2 {
  const v = values(value, ['k', 'h', 'tail', 'bytes'], false);
  if (v[0] !== KIND || !integer(v[3], Number.MAX_SAFE_INTEGER)) return deny();
  const h = numericArray(v[1], 8, 0xffffffff);
  const tail = numericArray(v[2], undefined, 255);
  if (tail.length !== v[3] % 64) return deny();
  return { k: KIND, h, tail, bytes: v[3] };
}

function issue(value: Sha256CheckpointV2): Sha256CheckpointV2 {
  const privateState = validate(value);
  const view = freeze({ k: KIND, h: freeze(privateState.h.slice()), tail: freeze(privateState.tail.slice()), bytes: privateState.bytes });
  weakSet.call(issued, view, privateState);
  return view;
}

function admitted(value: unknown): Sha256CheckpointV2 {
  // WeakMap.get is identity-only, including active/revoked proxies and wrapped views.
  const privateState = weakGet.call(issued, value as object) as Sha256CheckpointV2 | undefined;
  if (!privateState) return deny();
  return validate(privateState);
}

/** Scan the complete JSON grammar and duplicate decoded keys before materialising objects. */
function passiveJson(text: string): unknown {
  let at = 0;
  function whitespace(): void { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; }
  function stringToken(): string {
    const start = at++;
    while (at < text.length) {
      const ch = text.charCodeAt(at++);
      if (ch === 34) return parse(text.substring(start, at)) as string;
      if (ch < 32) return deny();
      if (ch === 92) {
        const escape = text[at++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.substring(at, at + 4))) return deny();
          at += 4;
        } else if (!escape || '"\\/bfnrt'.indexOf(escape) < 0) return deny();
      }
    }
    return deny();
  }
  function value(): void {
    whitespace();
    const ch = text[at];
    if (ch === '"') { stringToken(); return; }
    if (ch === '{' || ch === '[') {
      const object = ch === '{';
      const end = object ? '}' : ']';
      const seen = new Set<string>();
      at++; whitespace();
      if (text[at] === end) { at++; return; }
      while (true) {
        if (object) {
          if (text[at] !== '"') return deny();
          const key = stringToken();
          if (seen.has(key)) return deny();
          seen.add(key); whitespace();
          if (text[at++] !== ':') return deny();
        }
        value(); whitespace();
        if (text[at] === end) { at++; return; }
        if (text[at++] !== ',') return deny();
        whitespace();
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.substring(at));
    if (!token) return deny();
    const parsed = parse(token[0]) as unknown;
    if (typeof parsed === 'number' && !finite(parsed)) return deny();
    at += token[0].length;
  }
  value(); whitespace();
  if (at !== text.length) return deny();
  return parse(text) as unknown;
}

export function parseSha256CheckpointV2(bytes: Uint8Array): Sha256CheckpointV2 {
  try {
    const copy = copyBytes(bytes);
    if (copy[0] === 0xef && copy[1] === 0xbb && copy[2] === 0xbf) return deny();
    const text = decode.call(decoder, copy);
    const state = validate(passiveJson(text));
    if (stringify(state) !== text) return deny();
    return issue(state);
  } catch (_) { return deny(); }
}

const INITIAL = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
function rotate(x: number, n: number): number { return (x >>> n) | (x << (32 - n)); }
function compress(h: number[], block: ArrayLike<number>, offset: number): void {
  const w: number[] = [];
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4;
    w[i] = ((block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3]) >>> 0;
  }
  for (let i = 16; i < 64; i++) {
    const a = w[i - 15], b = w[i - 2];
    w[i] = (w[i - 16] + (rotate(a, 7) ^ rotate(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotate(b, 17) ^ rotate(b, 19) ^ (b >>> 10))) >>> 0;
  }
  let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], z = h[7];
  for (let i = 0; i < 64; i++) {
    const t1 = (z + (rotate(e, 6) ^ rotate(e, 11) ^ rotate(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0;
    const t2 = ((rotate(a, 2) ^ rotate(a, 13) ^ rotate(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
    z = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
  }
  const working = [a, b, c, d, e, f, g, z];
  for (let i = 0; i < 8; i++) h[i] = (h[i] + working[i]) >>> 0;
}

export function initialSha256CheckpointV2(): Sha256CheckpointV2 {
  try { return issue({ k: KIND, h: INITIAL.slice(), tail: [], bytes: 0 }); } catch (_) { return deny(); }
}

export function advanceSha256CheckpointV2(state: Sha256CheckpointV2, bytes: Uint8Array): Sha256CheckpointV2 {
  try {
    const prior = admitted(state);
    const input = copyBytes(bytes);
    if (input.length > Number.MAX_SAFE_INTEGER - prior.bytes) return deny();
    const h = prior.h.slice(), tail = prior.tail.slice();
    let at = 0;
    if (tail.length) {
      while (tail.length < 64 && at < input.length) tail.push(input[at++]);
      if (tail.length === 64) { compress(h, tail, 0); tail.length = 0; }
    }
    while (at + 64 <= input.length) { compress(h, input, at); at += 64; }
    while (at < input.length) tail.push(input[at++]);
    return issue({ k: KIND, h, tail, bytes: prior.bytes + input.length });
  } catch (_) { return deny(); }
}

export function finishSha256CheckpointV2(state: Sha256CheckpointV2): { bytes: number; sha256: string } {
  try {
    const prior = admitted(state), h = prior.h.slice(), tail = prior.tail.slice();
    tail.push(128);
    while (tail.length % 64 !== 56) tail.push(0);
    // Split before multiplying, retaining exact bits throughout the safe byte-counter range.
    const high = Math.floor(prior.bytes / 0x20000000);
    const low = (prior.bytes % 0x20000000) * 8;
    for (let shift = 24; shift >= 0; shift -= 8) tail.push((high >>> shift) & 255);
    for (let shift = 24; shift >= 0; shift -= 8) tail.push((low >>> shift) & 255);
    for (let at = 0; at < tail.length; at += 64) compress(h, tail, at);
    let sha256 = '';
    for (let i = 0; i < 8; i++) sha256 += ('00000000' + h[i].toString(16)).slice(-8).toUpperCase();
    return { bytes: prior.bytes, sha256 };
  } catch (_) { return deny(); }
}
