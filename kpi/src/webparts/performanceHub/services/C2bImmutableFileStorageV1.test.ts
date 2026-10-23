/** @jest-environment node */
"use strict";
import { webcrypto } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { C2bImmutableFileStorageV1, pairStorageProjectionV1, storageBytes, storageSHA256,
  verifyStorageAcceptanceV1, type IC2bImmutableFileStoreV1 } from './C2bImmutableFileStorageV1';
import { storageCanonical, type C2bFileLocator, type C2bContentReferenceV1, type C2bStorageBindingV1 }
  from '../models/C2bFileStorageV1Models';

beforeAll(() => { Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true }); });
const guid = (n: number): string => '10000000-0000-4000-8000-' + n.toString().padStart(12, '0');
const context = { purpose: 'history' as const, target: { site: guid(1), web: guid(2), library: guid(3) }, bindingSHA256: 'A'.repeat(64) };
class MemoryFiles implements IC2bImmutableFileStoreV1 {
  public files = new Map<string, Uint8Array>(); public next = 10; public readCount = 0;
  public async create(bytes: Uint8Array): Promise<C2bFileLocator> {
    const u = guid(this.next++); this.files.set(u, bytes.slice()); return { u, v: '1.0', n: bytes.length, h: await storageSHA256(bytes) };
  }
  public async read(ref: C2bFileLocator): Promise<Uint8Array> {
    this.readCount++; const bytes = this.files.get(ref.u); if (!bytes) throw new Error('MISSING'); return bytes.slice();
  }
}
async function rewriteRoot(files: MemoryFiles, ref: C2bContentReferenceV1, change: (p: any) => void): Promise<C2bContentReferenceV1> {
  const page = JSON.parse(new TextDecoder().decode(files.files.get(ref.r.u)!)); change(page);
  const bytes = storageBytes(page); files.files.set(ref.r.u, bytes);
  return { ...ref, r: { ...ref.r, n: bytes.length, h: await storageSHA256(bytes) } };
}
describe('complete immutable storage bytes', () => {
  test.each([0, 1, 1000000, 1000001, 64000000, 64000001, 65000001])('round trips full %d byte specimen', async length => {
    const store = new MemoryFiles(); const codec = new C2bImmutableFileStorageV1(store);
    const bytes = new Uint8Array(length).fill(0x41); const ref = await codec.storeBytes(bytes, context);
    const got = await codec.hydrate(ref, context); expect(Buffer.compare(Buffer.from(bytes), Buffer.from(got))).toBe(0);
    if (length === 65000001) expect([store.files.size, ref.z]).toEqual([69, 2]);
  }, 120000);
  test('cross-leaf UTF8, BOM and noncanonical raw wire survive without normalisation', async () => {
    const bytes = new TextEncoder().encode('\uFEFF' + 'A'.repeat(999995) + '😀e\u0301' + '{ "z":1, "a":2 }');
    const store = new MemoryFiles(); const codec = new C2bImmutableFileStorageV1(store);
    const ref = await codec.storeBytes(bytes, context); expect(await codec.hydrate(ref, context)).toEqual(bytes);
  });
  test('raw captured fields and hydrated logical fields retain distinct immutable identities', async () => {
    const raw = new TextEncoder().encode('{ "PayloadJSON": "descriptor" }');
    const physical = { PayloadJSON: 'descriptor', etag: '"1"', rowVersionToken: 9 };
    const logical = new TextEncoder().encode('{"actual":"😀"}');
    const pair = await pairStorageProjectionV1({ rawBytes: raw, rawSHA256: await storageSHA256(raw), physical,
      physicalFieldsSHA256: await storageSHA256(storageBytes(physical)) }, logical, await storageSHA256(logical), bytes => {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)); bytes.fill(0); return parsed;
    });
    raw.fill(0); physical.PayloadJSON = 'tampered'; logical.fill(0);
    expect(pair.physical.PayloadJSON).toBe('descriptor'); expect(pair.logical.actual).toBe('😀');
    expect(await storageSHA256(pair.logicalBytes)).toBe(pair.logicalBytesSHA256);
    expect(await storageSHA256(pair.capturedRawBytes)).toBe(pair.capturedRawSHA256);
    expect(Object.isFrozen(pair.physical)).toBe(true);
    pair.capturedRawBytes.fill(0); pair.logicalBytes.fill(0);
    expect(await storageSHA256(pair.capturedRawBytes)).toBe(pair.capturedRawSHA256);
    expect(await storageSHA256(pair.logicalBytes)).toBe(pair.logicalBytesSHA256);
    await expect(pairStorageProjectionV1({ rawBytes: pair.capturedRawBytes, rawSHA256: 'F'.repeat(64),
      physical: pair.physical, physicalFieldsSHA256: pair.physicalFieldsSHA256 }, pair.logicalBytes,
      pair.logicalBytesSHA256, b => b)).rejects.toThrow();
  });
  test.each(['purpose', 'extra-key', 'wrong-level', 'cycle', 'repeated-leaf', 'extra-leaf', 'short-leaf', 'bad-file-hash', 'bad-logical-hash', 'missing-leaf'])(
    'rejects self-consistently rehashed hostile tree: %s', async attack => {
      const store = new MemoryFiles(); const codec = new C2bImmutableFileStorageV1(store);
      const storedRef = await codec.storeBytes(new Uint8Array(1000001).fill(7), context);
      let ref = storedRef;
      const root = JSON.parse(new TextDecoder().decode(store.files.get(storedRef.r.u)!));
      if (attack === 'bad-logical-hash') ref = { ...storedRef, h: 'F'.repeat(64) };
      else if (attack === 'missing-leaf') store.files.delete(root.e[0].u);
      else ref = await rewriteRoot(store, storedRef, p => {
        if (attack === 'purpose') p.p = 'command';
        if (attack === 'extra-key') p.url = '/evil';
        if (attack === 'wrong-level') p.l = 1;
        if (attack === 'cycle') p.e[0] = { ...storedRef.r };
        if (attack === 'repeated-leaf') p.e[1] = p.e[0];
        if (attack === 'extra-leaf') p.e.push(p.e[1]);
        if (attack === 'short-leaf') p.e[0].n--;
        if (attack === 'bad-file-hash') p.e[0].h = 'F'.repeat(64);
      });
      await expect(codec.hydrate(ref, context)).rejects.toThrow();
    });
  test('rejects changed root after otherwise complete traversal', async () => {
    const store = new MemoryFiles(); const codec = new C2bImmutableFileStorageV1(store);
    const ref = await codec.storeBytes(new Uint8Array([1]), context); const original = store.read.bind(store); let rootReads = 0;
    store.read = async r => { const b = await original(r); if (r.u === ref.r.u && ++rootReads === 2) b[0] ^= 1; return b; };
    await expect(codec.hydrate(ref, context)).rejects.toThrow('ROOT_CHANGED');
  });
  const evidence = process.env.C2B_FROZEN_EVIDENCE;
  (evidence ? test : test.skip)('retains the complete original 13,102,256-byte six-history aggregate', async () => {
    const bytes = new Uint8Array(readFileSync(join(evidence!, 'complete-six-history-aggregate.json')));
    expect(bytes.length).toBe(13102256); const codec = new C2bImmutableFileStorageV1(new MemoryFiles());
    const ref = await codec.storeBytes(bytes, context); const output = await codec.hydrate(ref, context);
    expect(Buffer.compare(Buffer.from(output), Buffer.from(bytes))).toBe(0);
  }, 120000);
  (evidence ? test : test.skip)('trusted source captures govern seal acceptance; hashes alone do not', async () => {
    const binding = JSON.parse(readFileSync(join(evidence!, 'closed-binding-example.json'), 'utf8')) as C2bStorageBindingV1;
    const bindingBytes = storageBytes(binding); const raw = new TextEncoder().encode('{ "source":1 }'); const fields = { source: 1 };
    const source = { list: binding.target.list, itemId: 1, authorPrincipal: binding.source.expectedActor, version: '1.0', etag: '"1"',
      rawBytesSHA256: await storageSHA256(raw), physicalFieldsSHA256: await storageSHA256(storageBytes(fields)) };
    const seal = { k: 'kcf.kpi.storage-acceptance.v1', attempt: binding.identity.attemptKey, source,
      bindingSHA256: await storageSHA256(bindingBytes), inventorySHA256: 'A'.repeat(64), issuer: binding.grant.issuerPrincipal,
      grantSHA256: 'B'.repeat(64), createdAt: '2026-10-03T17:00:00Z' };
    const trusted = { binding, source: { source, rawBytes: raw, physicalFields: fields }, inventorySHA256: seal.inventorySHA256,
      issuer: seal.issuer, grantSHA256: seal.grantSHA256 };
    await expect(verifyStorageAcceptanceV1(bindingBytes, storageBytes(seal), trusted)).resolves.toBeUndefined();
    for (const change of [{ issuer: 'FOREIGN' }, { grantSHA256: 'C'.repeat(64) }, { inventorySHA256: 'D'.repeat(64) },
      { source: { ...source, authorPrincipal: 'FOREIGN' } }, { attempt: guid(99) }]) {
      await expect(verifyStorageAcceptanceV1(bindingBytes, storageBytes({ ...seal, ...change }), trusted)).rejects.toThrow();
    }
    await expect(verifyStorageAcceptanceV1(bindingBytes, storageBytes(seal), { ...trusted,
      source: { ...trusted.source, rawBytes: new Uint8Array([0]) } })).rejects.toThrow('CAPTURE');
    expect(storageCanonical(trusted.binding)).toBe(storageCanonical(binding));
  });
});
