import {
  C2B_FILE_LEAF_BYTES, C2B_FILE_PAGE_BYTES, C2B_FILE_PAGE_FANOUT,
  assertContentPage, assertContentReference, assertStorageAcceptance, assertStorageBinding,
  assertStorageLocator, assertStorageSource, assertStorageTarget, parseStorageCanonical,
  storageAdd, storageCanonical, storageDigest, storageFraming, storagePurpose, storageRequire,
  type C2bContentPageV1, type C2bContentReferenceV1, type C2bFileLocator, type C2bFilePurpose,
  type C2bFileTarget, type C2bPhysicalLogicalPairV1, type C2bStorageBindingV1,
  type C2bStorageSourceV1
} from '../models/C2bFileStorageV1Models';

/** Implementations must admit/reserve the complete attempt before an external upload. */
export interface IC2bImmutableFileStoreV1 {
  create(bytes: Uint8Array, context: { purpose: C2bFilePurpose; bindingSHA256: string;
    kind: 'leaf' | 'page'; level: number; ordinal: number }): Promise<C2bFileLocator>;
  read(locator: Readonly<C2bFileLocator>): Promise<Uint8Array>;
}
export interface C2bStorageReadContextV1 { purpose: C2bFilePurpose; target: C2bFileTarget; bindingSHA256: string; }
export async function storageSHA256(bytes: Uint8Array): Promise<string> {
  storageRequire(globalThis.crypto?.subtle, 'HASH_HOST_UNAVAILABLE');
  // A new ArrayBuffer prevents mutable caller buffers (and SharedArrayBuffer) entering the hash operation.
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function storageBytes(value: unknown): Uint8Array { return new TextEncoder().encode(storageCanonical(value)); }
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
/** Concrete multi-level framing. Every repeated copy in the input remains present in the output. */
export class C2bImmutableFileStorageV1 {
  public constructor(private readonly store: IC2bImmutableFileStoreV1) {}

  public async storeBytes(input: Uint8Array, context: C2bStorageReadContextV1): Promise<C2bContentReferenceV1> {
    assertStorageTarget(context.target); storagePurpose(context.purpose); storageDigest(context.bindingSHA256);
    const captured = input.slice(); const target = { ...context.target }; const purpose = context.purpose;
    const bindingSHA256 = context.bindingSHA256; const counts = storageFraming(captured.length);
    let refs: C2bFileLocator[] = []; let ordinal = 0; const identities = new Set<string>();
    const create = async (body: Uint8Array, kind: 'leaf' | 'page', level: number): Promise<C2bFileLocator> => {
      const expectedHash = await storageSHA256(body);
      const locator = await this.store.create(body.slice(), { purpose, bindingSHA256, kind, level, ordinal: ordinal++ });
      assertStorageLocator(locator, kind === 'page' ? C2B_FILE_PAGE_BYTES : C2B_FILE_LEAF_BYTES);
      storageRequire(locator.n === body.length && locator.h === expectedHash && !identities.has(locator.u), 'CREATE_IDENTITY');
      identities.add(locator.u); return { ...locator };
    };
    for (let leaf = 0; leaf < counts.leaves; leaf++) {
      const offset = leaf * C2B_FILE_LEAF_BYTES;
      refs.push(await create(captured.subarray(offset, Math.min(offset + C2B_FILE_LEAF_BYTES, captured.length)), 'leaf', -1));
    }
    let level = 0;
    do {
      const next: C2bFileLocator[] = [];
      for (let i = 0; i < refs.length; i += C2B_FILE_PAGE_FANOUT) {
        const page: C2bContentPageV1 = { k: 'kcf.kpi.content-page.v1', p: purpose, l: level, e: refs.slice(i, i + C2B_FILE_PAGE_FANOUT) };
        const bytes = storageBytes(page); storageRequire(bytes.length <= C2B_FILE_PAGE_BYTES, 'PAGE_BYTE_BOUND');
        next.push(await create(bytes, 'page', level));
      }
      refs = next; level++;
    } while (refs.length > 1);
    storageRequire(level === counts.depth && identities.size === counts.files, 'FRAMING_COUNTS');
    const reference: C2bContentReferenceV1 = { k: 'kcf.kpi.content-ref.v1', p: purpose, t: target,
      r: refs[0], z: level, n: captured.length, h: await storageSHA256(captured), b: bindingSHA256 };
    assertContentReference(reference, { purpose, target, bindingSHA256 }); return reference;
  }

  public async hydrate(input: unknown, suppliedContext: C2bStorageReadContextV1): Promise<Uint8Array> {
    const context = { purpose: suppliedContext.purpose, target: { ...suppliedContext.target }, bindingSHA256: suppliedContext.bindingSHA256 };
    assertContentReference(input, context);
    const ref: C2bContentReferenceV1 = JSON.parse(storageCanonical(input)) as C2bContentReferenceV1;
    const counts = storageFraming(ref.n); const seen = new Set<string>(); const pages = counts.pages.map(() => 0);
    const leaves: Uint8Array[] = []; let total = 0; let rootBytes: Uint8Array | undefined;
    const read = async (locator: C2bFileLocator, level: number): Promise<void> => {
      storageRequire(!seen.has(locator.u), 'CYCLE_OR_REPEATED_FILE'); seen.add(locator.u);
      const body = (await this.store.read({ ...locator })).slice();
      storageRequire(body.length === locator.n && await storageSHA256(body) === locator.h, 'FILE_BYTES');
      if (level < 0) {
        const expected = leaves.length + 1 === counts.leaves ? ref.n - C2B_FILE_LEAF_BYTES * (counts.leaves - 1) : C2B_FILE_LEAF_BYTES;
        storageRequire(leaves.length < counts.leaves && body.length === expected, 'PACKED_LEAF_LENGTH');
        total = storageAdd(total, body.length); leaves.push(body); return;
      }
      if (level === ref.z - 1) rootBytes = body.slice();
      storageRequire(body.length <= C2B_FILE_PAGE_BYTES, 'PAGE_BYTE_BOUND');
      const page = parseStorageCanonical(body); assertContentPage(page, ref.p, level);
      const index = pages[level]++; const childCount = level === 0 ? counts.leaves : counts.pages[level - 1];
      storageRequire(index < counts.pages[level] && page.e.length === Math.min(C2B_FILE_PAGE_FANOUT,
        childCount - index * C2B_FILE_PAGE_FANOUT), 'PACKED_PAGE_COUNT');
      for (const entry of page.e) await read(entry, level - 1);
    };
    await read(ref.r, ref.z - 1);
    storageRequire(total === ref.n && seen.size === counts.files && leaves.length === counts.leaves
      && pages.every((n, i) => n === counts.pages[i]), 'COMPLETE_TREE');
    // Root stability closes traversal; transport independently double-reads each file's body and metadata.
    const rootAgain = await this.store.read({ ...ref.r });
    storageRequire(rootBytes !== undefined && sameBytes(rootBytes, rootAgain), 'ROOT_CHANGED');
    const output = new Uint8Array(total); let offset = 0;
    for (const leaf of leaves) { output.set(leaf, offset); offset += leaf.length; }
    storageRequire(await storageSHA256(output) === ref.h, 'LOGICAL_DIGEST'); return output;
  }
}

/** Native capture is a required host dependency, not a caller's supplied binding or seal JSON. */
export interface C2bCapturedStorageSourceV1 {
  readonly source: Readonly<C2bStorageSourceV1>;
  readonly rawBytes: Uint8Array;
  readonly physicalFields: Readonly<Record<string, unknown>>;
}
/** Pure byte/context verification; the transport/host must independently authenticate the capture issuer. */
export async function verifyStorageAcceptanceV1(bindingBytes: Uint8Array, sealBytes: Uint8Array,
  trusted: { binding: C2bStorageBindingV1; source: C2bCapturedStorageSourceV1;
    inventorySHA256: string; issuer: string; grantSHA256: string }): Promise<void> {
  const bindingWire = bindingBytes.slice(); const sealWire = sealBytes.slice();
  const captured = { binding: JSON.parse(storageCanonical(trusted.binding)) as C2bStorageBindingV1,
    source: JSON.parse(storageCanonical(trusted.source.source)) as C2bStorageSourceV1,
    rawBytes: trusted.source.rawBytes.slice(), physicalBytes: storageBytes(trusted.source.physicalFields),
    inventorySHA256: trusted.inventorySHA256, issuer: trusted.issuer, grantSHA256: trusted.grantSHA256 };
  const binding = parseStorageCanonical(bindingWire); assertStorageBinding(binding, captured.binding);
  const seal = parseStorageCanonical(sealWire); assertStorageAcceptance(seal); assertStorageSource(captured.source);
  storageRequire(await storageSHA256(captured.rawBytes) === captured.source.rawBytesSHA256
    && await storageSHA256(captured.physicalBytes) === captured.source.physicalFieldsSHA256, 'CAPTURE_BYTES');
  storageRequire(seal.bindingSHA256 === await storageSHA256(bindingWire) && seal.inventorySHA256 === captured.inventorySHA256
    && seal.issuer === captured.issuer && seal.issuer === binding.grant.issuerPrincipal && seal.grantSHA256 === captured.grantSHA256
    && seal.attempt === binding.identity.attemptKey && storageCanonical(seal.source) === storageCanonical(captured.source)
    && seal.source.authorPrincipal === binding.source.expectedActor && seal.source.list === binding.target.list, 'ACCEPTANCE_CONTEXT');
  if (binding.source.phase === 'ObservedSource') storageRequire(storageCanonical(binding.source.observed) === storageCanonical(seal.source), 'ACCEPTED_SOURCE');
}

export async function pairStorageProjectionV1<TPhysical, TLogical>(capture: {
  rawBytes: Uint8Array; rawSHA256: string; physical: TPhysical; physicalFieldsSHA256: string;
}, logicalBytes: Uint8Array, expectedLogicalSHA256: string, decode: (bytes: Uint8Array) => TLogical):
Promise<C2bPhysicalLogicalPairV1<TPhysical, TLogical>> {
  const raw = capture.rawBytes.slice(); const logical = logicalBytes.slice();
  const rawSHA256 = capture.rawSHA256; const physicalFieldsSHA256 = capture.physicalFieldsSHA256;
  const physical = JSON.parse(storageCanonical(capture.physical)) as TPhysical;
  storageRequire(await storageSHA256(raw) === rawSHA256
    && await storageSHA256(storageBytes(physical)) === physicalFieldsSHA256
    && await storageSHA256(logical) === expectedLogicalSHA256, 'PAIRED_DOMAINS');
  const freeze = (v: unknown): void => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } };
  freeze(physical);
  // Decode receives a third copy: neither application decoder nor source caller can alter retained bytes.
  return Object.freeze({ get capturedRawBytes() { return raw.slice(); }, capturedRawSHA256: rawSHA256, physical,
    physicalFieldsSHA256, get logicalBytes() { return logical.slice(); },
    logicalBytesSHA256: expectedLogicalSHA256, logical: decode(logical.slice()) });
}
