import { createHash } from 'node:crypto';
import { TextEncoder, TextDecoder } from 'node:util';
import { APPROVED_BEHAVIOUR_V1_SOURCE_ROWS } from '../testing/BehaviourFrameworkV1ApprovedData';
import { createBehaviourFrameworkV2Catalogue, type IBehaviourFrameworkV2Catalogue } from './BehaviourFrameworkV2';
import {
  createBehaviourCatalogueAdministrationBaseline,
  BehaviourCatalogueAdministrationProcessor,
  BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT,
  type IBehaviourCatalogueAdminActor, type IBehaviourCatalogueAdminAuthority,
  type IBehaviourCatalogueAdminState, type IBehaviourCatalogueAdminVersion, type IBehaviourCatalogueAdminEvent
} from './BehaviourCatalogueAdministration';
import {
  SharePointBehaviourCatalogueAdministrationStore, encodeBehaviourCatalogueSharePointFields as encode,
  decodeBehaviourCatalogueSharePointFields as decode, BEHAVIOUR_STORE_CHUNK_FIELDS,
  BEHAVIOUR_STORE_MAX_UTF8_BYTES,
  type IBehaviourSharePointBinding, type IBehaviourSharePointRequest,
  type IBehaviourSharePointResponse, type IBehaviourCatalogueTrustedHostTransport
} from './SharePointBehaviourCatalogueAdministrationStore';

// jsdom omits these browser standard APIs; use Node22's implementations in synthetic tests.
Object.defineProperty(globalThis, 'TextEncoder', { value: TextEncoder, configurable: true });
Object.defineProperty(globalThis, 'TextDecoder', { value: TextDecoder, configurable: true });

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
type DeepMutable<T> = T extends readonly (infer U)[] ? Array<DeepMutable<U>>
  : T extends object ? { -readonly [P in keyof T]: DeepMutable<T[P]> } : T;
const sha = async (value: string): Promise<string> => createHash('sha256').update(value).digest('hex').toUpperCase();
const admin: IBehaviourCatalogueAdminActor = { personKey: 'PERSON-ADMIN', email: 'admin@example.invalid', appRoles: ['SystemAdmin'] };
const binding: IBehaviourSharePointBinding = { environment: 'TEST', webUrl: 'https://example.invalid/sites/REVIEW-TEST-SITE',
  siteId: 'fb1f6035-236e-434c-ae05-a78003badd47', webId: 'cbf5edb8-5d3b-46a5-a5ea-4564fa3ff43c',
  listId: 'cb02da80-d986-4034-a832-41d7b04e56ff', itemId: 17, entityType: 'SP.Data.KCFKPI_TEST_BehaviourCatalogueStateListItem' };
const coordinates = { siteId: binding.siteId, webId: binding.webId, listId: binding.listId, itemId: binding.itemId };
const itemUrl = `${binding.webUrl}/_api/web/lists(guid'${binding.listId}')/items(${binding.itemId})`;
let authority: IBehaviourCatalogueAdminAuthority;
let initial: IBehaviourCatalogueAdminState;

/** In-memory transport only; none of these tests proves native authentication or atomicity. */
class SyntheticTransport implements IBehaviourCatalogueTrustedHostTransport {
  public actor: unknown = admin;
  public requests: Readonly<IBehaviourSharePointRequest>[] = [];
  public writes = 0;
  public committed = 0;
  public mode: 'normal' | '412' | 'lostCommitted' | 'timeoutUncommitted' | 'rereadFailure' | 'successNoCommit' | '403' = 'normal';
  public patchResponse: ((response: IBehaviourSharePointResponse, request: IBehaviourSharePointRequest) => void) | undefined;
  public afterCommit: (() => Promise<void>) | undefined;
  public beforeMerge: (() => void) | undefined;
  public etag = '"native-1"';
  public constructor(public fields: Readonly<Record<string, unknown>>) {}
  public installAfterCommit(callback: () => Promise<void>): void { this.afterCommit = callback; }
  public replaceFields(fields: Readonly<Record<string, unknown>>, etag: string): void {
    this.fields = fields;
    this.etag = etag;
  }
  public async resolveAuthenticatedAdminContext(): Promise<unknown> { return this.actor; }
  public async request(request: Readonly<IBehaviourSharePointRequest>): Promise<IBehaviourSharePointResponse> {
    this.requests.push(request);
    let response: IBehaviourSharePointResponse;
    if (request.method === 'POST') {
      this.writes += 1;
      this.beforeMerge?.();
      if (this.mode === 'timeoutUncommitted') throw new Error('Synthetic timeout before commit');
      if (this.mode === '403') return { status: 403, coordinates };
      if (request.headers['IF-MATCH'] !== this.etag || this.mode === '412') return { status: 412, coordinates };
      if (this.mode !== 'successNoCommit') {
        const fields = { ...request.body! };
        delete fields.__metadata;
        this.fields = clone(fields);
        this.committed += 1;
        this.etag = `"native-${this.committed + 1}"`;
        await this.afterCommit?.();
      }
      if (this.mode === 'lostCommitted') throw new Error('Synthetic committed response lost');
      response = { status: 204, coordinates };
    } else if (request.url.indexOf('?$select=Id,ListItemEntityTypeFullName') >= 0) {
      if (this.writes && this.mode === 'rereadFailure') throw new Error('Synthetic reread failure');
      response = { status: 200, coordinates, body: { d: { Id: binding.listId, ListItemEntityTypeFullName: binding.entityType } } };
    } else {
      response = { status: 200, coordinates, etag: this.etag, body: { d: {
        Id: binding.itemId, __metadata: { etag: this.etag, type: binding.entityType, uri: itemUrl },
        ...(request.url.includes('OData__UIVersionString') ? { OData__UIVersionString: '2.0' } : {}), ...this.fields
      } } };
    }
    this.patchResponse?.(response, request);
    return response;
  }
}
const fixture = async (): Promise<{ transport: SyntheticTransport; store: SharePointBehaviourCatalogueAdministrationStore }> => {
  const transport = new SyntheticTransport(await encode(initial, authority, sha));
  return { transport, store: new SharePointBehaviourCatalogueAdministrationStore(binding, authority, transport, sha) };
};
const pair = async (state: IBehaviourCatalogueAdminState = initial, index = 2): Promise<{
  version: IBehaviourCatalogueAdminVersion; event: IBehaviourCatalogueAdminEvent;
}> => {
  const catalogue = clone(state.versions[state.versions.length - 1].catalogue) as IBehaviourFrameworkV2Catalogue;
  catalogue.catalogueVersion = `KCF-BHV-PD03-2026.09-v${index}`;
  catalogue.revision += 1;
  const hash = await sha(JSON.stringify(catalogue));
  const version: IBehaviourCatalogueAdminVersion = {
    versionKey: catalogue.catalogueVersion, previousVersionKey: state.currentVersionKey, action: 'Correct',
    catalogue, contentSha256: hash, createdByPersonKey: admin.personKey, createdByEmail: admin.email,
    createdAt: `2026-10-01T12:00:0${index}.000Z`, reason: 'Correct proposed successor', changeReference: 'LOCAL-A006'
  };
  const previous = state.versions[state.versions.length - 1];
  const event: IBehaviourCatalogueAdminEvent = {
    auditKey: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    idempotencyKey: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    sequence: state.rowVersion + 1, action: version.action, actorPersonKey: admin.personKey, actorEmail: admin.email,
    occurredAt: version.createdAt, reason: version.reason, changeReference: version.changeReference,
    before: { catalogueVersion: previous.catalogue.catalogueVersion, catalogueRevision: previous.catalogue.revision,
      contentSha256: previous.contentSha256 },
    after: { catalogueVersion: catalogue.catalogueVersion, catalogueRevision: catalogue.revision, contentSha256: hash }
  };
  return { version, event };
};
const append = async (store: SharePointBehaviourCatalogueAdministrationStore, prepared: Awaited<ReturnType<typeof pair>>,
  expected = { etag: '"native-1"', rowVersion: initial.rowVersion, currentVersionKey: initial.currentVersionKey }
): Promise<unknown> => store.appendSuccessorExact(expected, prepared.version, prepared.event,
  { canonicalCatalogueJson: JSON.stringify(prepared.version.catalogue), contentSha256: prepared.version.contentSha256 });

beforeEach(async () => {
  const approved = createBehaviourFrameworkV2Catalogue(APPROVED_BEHAVIOUR_V1_SOURCE_ROWS,
    { catalogueVersion: 'KCF-BHV-PD03-2026.09-v1', revision: 1, status: 'Published', effectiveFrom: '2026-11-01' });
  authority = { approvalReference: 'LOCAL-SYNTHETIC-APPROVAL', approvedV1Catalogue: approved,
    approvedV1ContentSha256: await sha(JSON.stringify(approved)) };
  initial = await createBehaviourCatalogueAdministrationBaseline(authority,
    { personKey: admin.personKey, email: admin.email },
    '2026-10-01T12:00:00.000Z', 'LOCAL-A006', 'de8fc527-fa58-4b8a-ae63-818822015746', sha);
  initial.etag = '"native-1"';
});

test('wire roundtrip preserves complete nested representation and native ETag, excludes persisted ETag', async () => {
  const fields = await encode(initial, authority, sha);
  const restored = await decode(fields, 'W/"native-item-99"', authority, sha);
  expect(restored.versions).toEqual(initial.versions);
  expect(JSON.stringify(restored.versions)).toBe(JSON.stringify(initial.versions));
  expect(restored.etag).toBe('W/"native-item-99"');
  const json = Buffer.from(BEHAVIOUR_STORE_CHUNK_FIELDS.map(key => fields[key]).join(''), 'base64').toString('utf8');
  expect(Object.keys(JSON.parse(json))).toEqual(['contract', 'catalogueKey', 'rowVersion', 'currentVersionKey', 'versions', 'events']);
  expect(json).not.toContain('native-1');
});

test('one exact native MERGE contains all sixteen chunks, pointer and scalars, preserves immutable prefix', async () => {
  const { transport, store } = await fixture();
  const prepared = await pair();
  expect(await append(store, prepared)).toMatchObject({ outcome: 'Appended', atomic: 'Committed' });
  expect(transport.writes).toBe(1);
  const request = transport.requests.find(item => item.method === 'POST')!;
  expect(request.url).toBe(itemUrl);
  expect(request.coordinates).toEqual(coordinates);
  expect(request.headers['IF-MATCH']).toBe('"native-1"');
  expect(request.headers['X-HTTP-Method']).toBe('MERGE');
  expect(request.body!.__metadata).toEqual({ type: binding.entityType });
  expect(Object.keys(request.body!)).toHaveLength(27);
  BEHAVIOUR_STORE_CHUNK_FIELDS.forEach(field => expect(request.body!).toHaveProperty(field));
  const state = (await store.readCanonical())!;
  expect(JSON.stringify(state.versions[0])).toBe(JSON.stringify(initial.versions[0]));
  expect(JSON.stringify(state.events[0])).toBe(JSON.stringify(initial.events[0]));
  expect(state.versions[1]).toEqual(prepared.version);
  expect(state.events[1]).toEqual(prepared.event);
});

test('publisher export candidate retains ordinary complete publication fields, body, baseline and history while native producers hold', async () => {
  authority = { ...authority, approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' };
  const { transport, store } = await fixture();
  const prepared = await pair();
  expect(await append(store, prepared)).toMatchObject({ outcome: 'Appended', atomic: 'Committed' });
  const originalFields = clone(transport.fields);
  const result = await store.readPublisherExportCandidate();
  expect(result.status).toBe('HOLD');
  expect(result.missingInputs).toEqual(['ProtectedPublisherPrincipalMappingUnavailable', 'ImmutablePublisherReceiptPortUnavailable']);
  expect(result.candidate!.native).toEqual({ ...coordinates, version: '2.0', etag: '"native-2"' });
  expect(result.candidate!.fields).toEqual(originalFields);
  expect(Object.keys(result.candidate!.fields)).toHaveLength(26);
  expect(result.candidate!.authority).toEqual(authority);
  expect(result.candidate!.counts).toEqual({ versions: 2, events: 2, targets: 75 });
  expect(result.candidate).not.toHaveProperty('publisherPrincipal');
  const body = JSON.parse(result.canonicalBody!);
  expect(body.versions).toEqual([initial.versions[0], prepared.version]);
  expect(body.events).toEqual([initial.events[0], prepared.event]);
  expect(await sha(result.canonicalBody!)).toBe(originalFields.StateSHA256);
  expect(await decode(result.candidate!.fields, result.candidate!.native.etag, authority, sha)).toEqual(await store.readCanonical());
  expect(transport.writes).toBe(1);
});

test.each(['version', 'etag', 'authority', 'hash'])('publisher export holds ordinary unavailable %s readback input', async missing => {
  authority = { ...authority, approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' };
  if (missing === 'authority') authority.approvalReference = 'LOCAL-SYNTHETIC-APPROVAL';
  const { transport, store } = await fixture();
  if (missing === 'version' || missing === 'etag') transport.patchResponse = (response, request) => {
    if (!request.url.includes('OData__UIVersionString')) return;
    const item = (response.body as { d: Record<string, unknown> }).d;
    if (missing === 'version') delete item.OData__UIVersionString;
    else { delete (item.__metadata as { etag?: string }).etag; delete response.etag; }
  };
  if (missing === 'hash') transport.fields = { ...transport.fields, StateSHA256: undefined };
  const result = await store.readPublisherExportCandidate();
  expect(result.status).toBe('HOLD');
  expect(result.candidate).toBeUndefined();
  expect(result.missingInputs).toContain('CompleteNativeCatalogueReadbackUnavailable');
  expect(transport.writes).toBe(0);
});

test.each([undefined, { ...admin, appRoles: ['Employee'] }, { ...admin, personKey: 'OTHER' },
  { ...admin, email: 'other@example.invalid' }])('direct denied/wrong actor has zero storage requests: %p', async actor => {
  const { transport, store } = await fixture();
  transport.actor = actor;
  expect(await append(store, await pair())).toMatchObject({ outcome: 'IntegrityFailure', atomic: 'NotCommitted' });
  expect(transport.requests).toHaveLength(0);
});

test.each([undefined, { ...binding, environment: 'Production' }, { ...binding, listId: '*' },
  { ...binding, itemId: 0 }, { ...binding, webUrl: 'http://example.invalid/sites/TEST' }])('unbound/invalid binding has zero requests: %p', async target => {
  const { transport } = await fixture();
  const store = new SharePointBehaviourCatalogueAdministrationStore(target as IBehaviourSharePointBinding, authority, transport, sha);
  await expect(store.readCanonical()).rejects.toThrow();
  expect(await append(store, await pair())).toMatchObject({ outcome: 'IntegrityFailure' });
  expect(transport.requests).toHaveLength(0);
});

test.each(['StateSHA256', 'StateChunkCount', 'StateUtf8ByteLength', 'RowVersion', 'CurrentVersionKey',
  'CatalogueKey', 'ApprovalReference', 'ApprovedV1ContentSHA256', 'StateChunk01', 'StateChunk16'])('crossed wire %s rejected', async field => {
  const fields = { ...await encode(initial, authority, sha) };
  fields[field] = typeof fields[field] === 'number' ? Number(fields[field]) + 1 : 'crossed';
  await expect(decode(fields, initial.etag, authority, sha)).rejects.toThrow();
});

test('accessor wire/version/actor snapshots never invoke getters or send requests', async () => {
  const { transport, store } = await fixture();
  let calls = 0;
  const malicious = { ...await encode(initial, authority, sha) };
  Object.defineProperty(malicious, 'StateChunk01', { enumerable: true, get: () => { calls += 1; return ''; } });
  await expect(decode(malicious, initial.etag, authority, sha)).rejects.toThrow();
  const prepared = await pair();
  Object.defineProperty(prepared.version, 'catalogue', { enumerable: true, get: () => { calls += 1; return {}; } });
  await expect(store.appendSuccessorExact({ etag: initial.etag, rowVersion: 1, currentVersionKey: initial.currentVersionKey },
    prepared.version, prepared.event, { canonicalCatalogueJson: '', contentSha256: '' })).rejects.toThrow();
  const actor = { ...admin };
  Object.defineProperty(actor, 'appRoles', { enumerable: true, get: () => { calls += 1; return ['SystemAdmin']; } });
  transport.actor = actor;
  await expect(store.readCanonical()).rejects.toThrow();
  expect(calls).toBe(0);
  expect(transport.requests).toHaveLength(0);
});

test.each(['coordinate', 'list', 'entity', 'item', 'uri', 'etag', 'wildcard'])('crossed native response %s rejected', async kind => {
  const { transport, store } = await fixture();
  transport.patchResponse = response => {
    if (kind === 'coordinate') response.coordinates = { ...coordinates, webId: binding.siteId };
    const data = (response.body as { d: Record<string, unknown> }).d;
    if (data.ListItemEntityTypeFullName) {
      if (kind === 'list') data.Id = binding.webId;
      if (kind === 'entity') data.ListItemEntityTypeFullName = 'SP.Data.WrongListItem';
    } else {
      const native = data.__metadata as Record<string, unknown>;
      if (kind === 'item') data.Id = 18;
      if (kind === 'uri') native.uri = `${itemUrl}/other`;
      if (kind === 'etag') response.etag = '"crossed"';
      if (kind === 'wildcard') { native.etag = '*'; response.etag = '*'; }
    }
  };
  await expect(store.readCanonical()).rejects.toThrow();
  expect(transport.writes).toBe(0);
});

test.each(['etag', 'rowVersion', 'currentVersionKey'])('stale expected %s gives conflict without write', async key => {
  const { transport, store } = await fixture();
  const expected = { etag: initial.etag, rowVersion: 1, currentVersionKey: initial.currentVersionKey };
  if (key === 'etag') expected.etag = '"old"';
  if (key === 'rowVersion') expected.rowVersion = 9;
  if (key === 'currentVersionKey') expected.currentVersionKey = 'old';
  expect(await append(store, await pair(), expected)).toMatchObject({ outcome: 'Conflict', atomic: 'NotCommitted' });
  expect(transport.writes).toBe(0);
});

test('412 canonical reread gives conflict; two prepared writers permit only one synthetic commit', async () => {
  const a = await fixture();
  a.transport.mode = '412';
  expect(await append(a.store, await pair())).toMatchObject({ outcome: 'Conflict' });
  const b = await fixture();
  const prepared = await pair();
  const second = await pair(initial, 3);
  const outcomes = await Promise.all([append(b.store, prepared), append(b.store, second)]);
  expect(outcomes.filter(value => (value as { atomic: string }).atomic === 'Committed')).toHaveLength(1);
  expect(b.transport.committed).toBe(1);
  expect(b.transport.writes).toBe(2);
});

test('exact replay avoids write; same audit key with changed content is collision', async () => {
  const { transport, store } = await fixture();
  const prepared = await pair();
  await append(store, prepared);
  expect(await append(store, prepared)).toMatchObject({ outcome: 'Replay', atomic: 'Committed' });
  prepared.version.reason = 'Collision'; prepared.event.reason = 'Collision';
  expect(await append(store, prepared)).toMatchObject({ outcome: 'Collision', atomic: 'NotCommitted' });
  expect(transport.writes).toBe(1);
});

test.each([['lostCommitted', 'Appended'], ['timeoutUncommitted', 'UnknownEffect'], ['rereadFailure', 'UnknownEffect'],
  ['successNoCommit', 'UnknownEffect'], ['403', 'IntegrityFailure']])('uncertain %s decides %s only by reread', async (mode, outcome) => {
  const { transport, store } = await fixture();
  transport.mode = mode as SyntheticTransport['mode'];
  expect(await append(store, await pair())).toMatchObject({ outcome });
  expect(transport.writes).toBe(1);
  if (mode === 'lostCommitted') {
    expect(await append(store, await pair())).toMatchObject({ outcome: 'Replay' });
    expect(transport.writes).toBe(1);
  }
});

test('uncertain absent pair allows only a subsequent explicit invocation, never automatic retry', async () => {
  const { transport, store } = await fixture();
  const prepared = await pair();
  transport.mode = 'timeoutUncommitted';
  expect(await append(store, prepared)).toMatchObject({ outcome: 'UnknownEffect' });
  expect(transport.writes).toBe(1);
  transport.mode = 'normal';
  expect(await append(store, prepared)).toMatchObject({ outcome: 'Appended' });
  expect(transport.writes).toBe(2);
});

test('later valid successor still confirms the exact earlier pair without losing prefix', async () => {
  const { transport, store } = await fixture();
  transport.installAfterCommit(async () => {
    const state = await decode(transport.fields, transport.etag, authority, sha);
    const successor = await pair(state, 3);
    const fields = await encode({ ...state, rowVersion: 3, currentVersionKey: successor.version.versionKey,
      versions: [...state.versions, successor.version], events: [...state.events, successor.event] }, authority, sha);
    transport.replaceFields(fields, '"native-3"');
  });
  expect(await append(store, await pair())).toMatchObject({ outcome: 'Appended' });
  expect((await store.readCanonical())!.rowVersion).toBe(3);
});

test('capacity exact UTF8 boundary accepted; one byte overflow blocks write preserving state', async () => {
  const { transport, store } = await fixture();
  const prepared = await pair();
  const next = { ...initial, rowVersion: 2, currentVersionKey: prepared.version.versionKey,
    versions: [...initial.versions, prepared.version], events: [...initial.events, prepared.event] };
  let fields = await encode(next, authority, sha);
  const padding = BEHAVIOUR_STORE_MAX_UTF8_BYTES - Number(fields.StateUtf8ByteLength);
  // Pad the free-text reason in both immutable records without altering catalogue identity.
  const half = Math.floor(padding / 2);
  prepared.version.reason += 'x'.repeat(half);
  prepared.event.reason = prepared.version.reason;
  const paddedCatalogue = prepared.version.catalogue as DeepMutable<IBehaviourFrameworkV2Catalogue>;
  if (padding % 2) paddedCatalogue.rows[0].suggestedEvidence += 'x';
  prepared.version.contentSha256 = await sha(JSON.stringify(prepared.version.catalogue));
  prepared.event.after.contentSha256 = prepared.version.contentSha256;
  fields = await encode(next, authority, sha);
  expect(fields.StateUtf8ByteLength).toBe(BEHAVIOUR_STORE_MAX_UTF8_BYTES);
  expect(fields.StateChunkCount).toBe(16);
  expect(await append(store, prepared)).toMatchObject({ outcome: 'Appended' });
  const overflowFixture = await fixture();
  paddedCatalogue.rows[0].suggestedEvidence += 'x';
  prepared.version.contentSha256 = await sha(JSON.stringify(prepared.version.catalogue));
  prepared.event.after.contentSha256 = prepared.version.contentSha256;
  expect(await append(overflowFixture.store, prepared)).toMatchObject({ outcome: 'IntegrityFailure', atomic: 'NotCommitted' });
  expect(overflowFixture.transport.writes).toBe(0);
  expect(await overflowFixture.store.readCanonical()).toEqual(initial);
  expect(transport.writes).toBe(1);
});

test('existing Admin processor can publish through injected adapter without new authority or semantics', async () => {
  const { transport, store } = await fixture();
  const prepared = await pair();
  const processor = new BehaviourCatalogueAdministrationProcessor(store, authority, async () => admin,
    () => '2026-10-01T12:01:00.000Z', () => 'LOCAL-A006', sha);
  const result = await processor.publish({ contract: BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT,
    idempotencyKey: prepared.event.auditKey, action: 'Correct', expectedEtag: initial.etag,
    expectedRowVersion: 1, expectedCurrentVersionKey: initial.currentVersionKey, reason: 'Correction',
    candidate: prepared.version.catalogue });
  expect(result.outcome).toBe('Confirmed');
  expect(transport.writes).toBe(1);
});

test('missing seed remains unavailable with no create/seed fallback', async () => {
  const { transport, store } = await fixture();
  transport.patchResponse = (response, request) => {
    if (request.url.indexOf('/items(') >= 0) { response.status = 404; response.body = undefined; }
  };
  expect(await store.readCanonical()).toBeUndefined();
  expect(await append(store, await pair())).toMatchObject({ outcome: 'IntegrityFailure' });
  expect(transport.writes).toBe(0);
});

test.each(['sequence', 'previous', 'before', 'hash', 'canonicalJson', 'wildcard'])('malformed prepared %s never writes', async field => {
  const { transport, store } = await fixture();
  const prepared = await pair();
  const expected = { etag: initial.etag, rowVersion: 1, currentVersionKey: initial.currentVersionKey };
  const integrity = { canonicalCatalogueJson: JSON.stringify(prepared.version.catalogue), contentSha256: prepared.version.contentSha256 };
  if (field === 'sequence') prepared.event.sequence = 9;
  if (field === 'previous') prepared.version.previousVersionKey = 'crossed';
  if (field === 'before') prepared.event.before!.catalogueRevision = 9;
  if (field === 'hash') integrity.contentSha256 = 'A'.repeat(64);
  if (field === 'canonicalJson') integrity.canonicalCatalogueJson += ' ';
  if (field === 'wildcard') expected.etag = '*';
  expect(await store.appendSuccessorExact(expected, prepared.version, prepared.event, integrity))
    .toMatchObject({ outcome: 'IntegrityFailure', atomic: 'NotCommitted' });
  expect(transport.writes).toBe(0);
});

test('immutable read snapshot and carrier descriptors reject symbols, sparse arrays and extra wire keys', async () => {
  const { store } = await fixture();
  const state = (await store.readCanonical())!;
  expect(Object.isFrozen(state)).toBe(true);
  expect(Object.isFrozen(state.versions[0].catalogue.rows[0])).toBe(true);
  const fields = { ...await encode(initial, authority, sha), extra: 'unexpected' };
  await expect(decode(fields, initial.etag, authority, sha)).rejects.toThrow();
  const symbolic = { ...await encode(initial, authority, sha), [Symbol('hidden')]: 'unexpected' };
  await expect(decode(symbolic, initial.etag, authority, sha)).rejects.toThrow();
  const sparse = clone(initial);
  delete (sparse.versions as IBehaviourCatalogueAdminVersion[])[0];
  await expect(encode(sparse, authority, sha)).rejects.toThrow();
});

test('canonical wire rejects reordered envelope, noncanonical base64 and invalid JSON even with replaced hash', async () => {
  const fields = { ...await encode(initial, authority, sha) };
  const json = Buffer.from(BEHAVIOUR_STORE_CHUNK_FIELDS.map(key => fields[key]).join(''), 'base64').toString('utf8');
  const parsed = JSON.parse(json) as Record<string, unknown>;
  const invalid = [JSON.stringify({ catalogueKey: parsed.catalogueKey, contract: parsed.contract,
    rowVersion: parsed.rowVersion, currentVersionKey: parsed.currentVersionKey, versions: parsed.versions, events: parsed.events }),
  '{malformed'];
  for (const input of invalid) {
    const encoded = Buffer.from(input, 'utf8').toString('base64');
    const crossed = { ...fields, StateSHA256: await sha(input), StateUtf8ByteLength: Buffer.byteLength(input),
      StateChunkCount: Math.ceil(encoded.length / 48000) };
    BEHAVIOUR_STORE_CHUNK_FIELDS.forEach((key, index) => { (crossed as Record<string, unknown>)[key] = encoded.slice(index * 48000, (index + 1) * 48000); });
    await expect(decode(crossed, initial.etag, authority, sha)).rejects.toThrow();
  }
  fields.StateChunk01 = `${String(fields.StateChunk01).slice(0, -1)}!`;
  await expect(decode(fields, initial.etag, authority, sha)).rejects.toThrow();
});

test('response accessors are rejected without executing attacker code', async () => {
  const { transport, store } = await fixture();
  let invoked = 0;
  transport.patchResponse = response => {
    Object.defineProperty(response, 'body', { enumerable: true, get: () => { invoked += 1; return {}; } });
  };
  await expect(store.readCanonical()).rejects.toThrow();
  expect(invoked).toBe(0);
  expect(transport.writes).toBe(0);
});

test('trusted email case follows existing processor audit normalization', async () => {
  const { transport, store } = await fixture();
  transport.actor = { ...admin, email: admin.email.toUpperCase() };
  expect(await append(store, await pair())).toMatchObject({ outcome: 'Appended' });
  expect(transport.writes).toBe(1);
});

test('UTF8 wire counts multibyte text exactly and preserves it through canonical decode', async () => {
  const prepared = await pair();
  prepared.version.reason = '日本 😀 é'; prepared.event.reason = prepared.version.reason;
  const state = { ...initial, rowVersion: 2, currentVersionKey: prepared.version.versionKey,
    versions: [...initial.versions, prepared.version], events: [...initial.events, prepared.event] };
  const fields = await encode(state, authority, sha);
  const bytes = Buffer.from(BEHAVIOUR_STORE_CHUNK_FIELDS.map(key => fields[key]).join(''), 'base64');
  expect(fields.StateUtf8ByteLength).toBe(bytes.length);
  expect(bytes.length).toBeGreaterThan(bytes.toString('utf8').length);
  expect((await decode(fields, initial.etag, authority, sha)).events[1].reason).toBe(prepared.event.reason);
});

test.each(['canonical-text-digest', 'complete-byte-digest'])('leading UTF8 BOM is rejected before hash acceptance: %s', async digestKind => {
  const fields = { ...await encode(initial, authority, sha) };
  const canonicalBytes = Buffer.from(BEHAVIOUR_STORE_CHUNK_FIELDS.map(key => fields[key]).join(''), 'base64');
  const bytes = Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), canonicalBytes]);
  const encoded = bytes.toString('base64');
  fields.StateUtf8ByteLength = bytes.length;
  fields.StateChunkCount = Math.ceil(encoded.length / 48000);
  if (digestKind === 'complete-byte-digest') fields.StateSHA256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  BEHAVIOUR_STORE_CHUNK_FIELDS.forEach((key, index) => { fields[key] = encoded.slice(index * 48000, (index + 1) * 48000); });
  let digestCalls = 0;
  const observedSha = async (value: string): Promise<string> => { digestCalls += 1; return sha(value); };
  await expect(decode(fields, initial.etag, authority, observedSha)).rejects.toThrow();
  expect(digestCalls).toBe(0);
  const { transport, store } = await fixture();
  transport.replaceFields(fields, initial.etag);
  await expect(store.readCanonical()).rejects.toThrow();
  expect(await append(store, await pair())).toMatchObject({ outcome: 'IntegrityFailure', atomic: 'NotCommitted' });
  expect(transport.writes).toBe(0);
});

test.each(['C080', '80', 'EDA080'])('invalid/noncanonical UTF8 bytes are rejected: %s', async prefix => {
  const fields = { ...await encode(initial, authority, sha) };
  const canonicalBytes = Buffer.from(BEHAVIOUR_STORE_CHUNK_FIELDS.map(key => fields[key]).join(''), 'base64');
  const bytes = Buffer.concat([Buffer.from(prefix, 'hex'), canonicalBytes]);
  const encoded = bytes.toString('base64');
  fields.StateUtf8ByteLength = bytes.length;
  fields.StateChunkCount = Math.ceil(encoded.length / 48000);
  fields.StateSHA256 = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  BEHAVIOUR_STORE_CHUNK_FIELDS.forEach((key, index) => { fields[key] = encoded.slice(index * 48000, (index + 1) * 48000); });
  await expect(decode(fields, initial.etag, authority, sha)).rejects.toThrow();
});
