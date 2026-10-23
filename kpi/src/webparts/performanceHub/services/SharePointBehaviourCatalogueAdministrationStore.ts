import {
  BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT,
  snapshotBehaviourCatalogueAdministrationPlainData as snapshot,
  validateBehaviourCatalogueAdministrationCanonicalState as canonical,
  type BehaviourCatalogueSha256,
  type BehaviourCatalogueAdminAppendOutcome,
  type IBehaviourCatalogueAdminActor,
  type IBehaviourCatalogueAdminAuthority,
  type IBehaviourCatalogueAdminAppendIntegrity,
  type IBehaviourCatalogueAdminAppendReceipt,
  type IBehaviourCatalogueAdminVersion,
  type IBehaviourCatalogueAdminEvent,
  type IBehaviourCatalogueAdminState,
  type IBehaviourCatalogueAdministrationStore
} from './BehaviourCatalogueAdministration';
import { getAdminFoundationEntitlement } from './AdminFoundationEntitlement';
import type { IBehaviourCataloguePublisherExportHold } from './BehaviourCataloguePublisherExport';

/** Proposed physical mapping only. No provisioning, seeding or live transport is supplied. */
export const BEHAVIOUR_SHAREPOINT_STORE_CONTRACT = 'KCF.BehaviourCatalogueAdministration.SharePointStore/v1';
export const BEHAVIOUR_STORE_MAX_UTF8_BYTES = 576000;
export const BEHAVIOUR_STORE_CHUNK_CHARACTERS = 48000;
export const BEHAVIOUR_STORE_CHUNK_FIELDS: readonly string[] = Object.freeze(
  Array.from({ length: 16 }, (_, index) => `StateChunk${String(index + 1).padStart(2, '0')}`)
);
const scalarFields = ['CatalogueKey', 'StoreContractVersion', 'StateContractVersion', 'RowVersion',
  'CurrentVersionKey', 'ApprovalReference', 'ApprovedV1ContentSHA256', 'StateSHA256',
  'StateUtf8ByteLength', 'StateChunkCount'];
const envelopeKeys = ['contract', 'catalogueKey', 'rowVersion', 'currentVersionKey', 'versions', 'events'];
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hashPattern = /^[A-F0-9]{64}$/;
const nativeEtag = (value: unknown): value is string => typeof value === 'string'
  && /^(?:W\/)?"[^"\r\n]+"$/.test(value) && !/^(?:W\/)?"\*"$/.test(value);
const exactKeys = (value: object, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
const fail = (): never => { throw new Error('Behaviour catalogue physical store is unavailable or invalid.'); };
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const scalar = (value: unknown): value is string => typeof value === 'string'
  && value.length > 0 && value.length <= 255 && Boolean(value.trim());

export interface IBehaviourSharePointBinding {
  environment: 'TEST';
  webUrl: string;
  siteId: string;
  webId: string;
  listId: string;
  itemId: number;
  entityType: string;
}
export interface IBehaviourSharePointCoordinates {
  siteId: string; webId: string; listId: string; itemId: number;
}
export interface IBehaviourSharePointRequest {
  coordinates: Readonly<IBehaviourSharePointCoordinates>;
  url: string;
  method: 'GET' | 'POST';
  headers: Readonly<Record<string, string>>;
  body?: Readonly<Record<string, unknown>>;
}
export interface IBehaviourSharePointResponse {
  status: number;
  coordinates: Readonly<IBehaviourSharePointCoordinates>;
  etag?: string;
  body?: unknown;
}
/** Only a separately admitted trusted server host may implement this boundary.
 * resolveAuthenticatedAdminContext derives identity from server authentication/protected roles,
 * never the command body. request owns credentials/digest and reports actual target coordinates.
 * Local synthetic implementations do not establish authentication, ACL or native atomicity proof.
 */
export interface IBehaviourCatalogueTrustedHostTransport {
  resolveAuthenticatedAdminContext(): Promise<unknown>;
  request(request: Readonly<IBehaviourSharePointRequest>): Promise<IBehaviourSharePointResponse>;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
};
const fromBase64 = (text: string): Uint8Array => {
  if (!text || text.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text)) fail();
  const binary = atob(text);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  if (toBase64(bytes) !== text) fail();
  return bytes;
};
const envelope = (state: Readonly<IBehaviourCatalogueAdminState>): Record<string, unknown> => ({
  contract: state.contract, catalogueKey: state.catalogueKey, rowVersion: state.rowVersion,
  currentVersionKey: state.currentVersionKey, versions: state.versions, events: state.events
});

/** Encode the complete immutable chain; the observed native ETag is deliberately not persisted. */
export const encodeBehaviourCatalogueSharePointFields = async (
  stateCarrier: unknown, authorityCarrier: unknown, sha256: BehaviourCatalogueSha256
): Promise<Readonly<Record<string, unknown>>> => {
  const state = snapshot<IBehaviourCatalogueAdminState>(stateCarrier);
  const authority = snapshot<IBehaviourCatalogueAdminAuthority>(authorityCarrier);
  if (!await canonical(state, authority, sha256) || !nativeEtag(state.etag)
    || !scalar(state.currentVersionKey) || !scalar(authority.approvalReference)
    || state.rowVersion > 2147483647) fail();
  const json = JSON.stringify(envelope(state));
  const bytes = new TextEncoder().encode(json);
  if (!bytes.length || bytes.length > BEHAVIOUR_STORE_MAX_UTF8_BYTES) fail();
  const encoded = toBase64(bytes);
  const count = Math.ceil(encoded.length / BEHAVIOUR_STORE_CHUNK_CHARACTERS);
  if (count > BEHAVIOUR_STORE_CHUNK_FIELDS.length) fail();
  const digest = (await sha256(json)).toUpperCase();
  if (!hashPattern.test(digest)) fail();
  const fields: Record<string, unknown> = {
    CatalogueKey: state.catalogueKey, StoreContractVersion: BEHAVIOUR_SHAREPOINT_STORE_CONTRACT,
    StateContractVersion: state.contract, RowVersion: state.rowVersion,
    CurrentVersionKey: state.currentVersionKey, ApprovalReference: authority.approvalReference,
    ApprovedV1ContentSHA256: authority.approvedV1ContentSha256, StateSHA256: digest,
    StateUtf8ByteLength: bytes.length, StateChunkCount: count
  };
  BEHAVIOUR_STORE_CHUNK_FIELDS.forEach((name, index) => {
    fields[name] = encoded.slice(index * BEHAVIOUR_STORE_CHUNK_CHARACTERS,
      (index + 1) * BEHAVIOUR_STORE_CHUNK_CHARACTERS);
  });
  return snapshot<Record<string, unknown>>(fields);
};

/** Strict carrier/hash/scalar checks precede existing Product canonical validation. */
export const decodeBehaviourCatalogueSharePointFields = async (
  carrier: unknown, etag: string, authorityCarrier: unknown, sha256: BehaviourCatalogueSha256
): Promise<IBehaviourCatalogueAdminState> => {
  const fields = snapshot<Record<string, unknown>>(carrier);
  const authority = snapshot<IBehaviourCatalogueAdminAuthority>(authorityCarrier);
  if (!fields || !exactKeys(fields, [...scalarFields, ...BEHAVIOUR_STORE_CHUNK_FIELDS])
    || !nativeEtag(etag) || fields.CatalogueKey !== 'KCF-KCCC-BEHAVIOUR-FOCUS'
    || fields.StoreContractVersion !== BEHAVIOUR_SHAREPOINT_STORE_CONTRACT
    || fields.StateContractVersion !== BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT
    || fields.ApprovalReference !== authority.approvalReference
    || fields.ApprovedV1ContentSHA256 !== authority.approvedV1ContentSha256
    || !Number.isInteger(fields.StateChunkCount) || (fields.StateChunkCount as number) < 1
    || (fields.StateChunkCount as number) > 16
    || !Number.isInteger(fields.StateUtf8ByteLength) || (fields.StateUtf8ByteLength as number) < 1
    || (fields.StateUtf8ByteLength as number) > BEHAVIOUR_STORE_MAX_UTF8_BYTES
    || !Number.isInteger(fields.RowVersion) || (fields.RowVersion as number) < 1
    || (fields.RowVersion as number) > 2147483647 || !scalar(fields.CurrentVersionKey)
    || !scalar(fields.ApprovalReference) || !hashPattern.test(fields.StateSHA256 as string)) fail();
  const count = fields.StateChunkCount as number;
  let encoded = '';
  BEHAVIOUR_STORE_CHUNK_FIELDS.forEach((name, index) => {
    const chunk = fields[name];
    if (typeof chunk !== 'string' || chunk.length > BEHAVIOUR_STORE_CHUNK_CHARACTERS
      || (index < count - 1 && chunk.length !== BEHAVIOUR_STORE_CHUNK_CHARACTERS)
      || (index === count - 1 && chunk.length === 0) || (index >= count && chunk !== '')) fail();
    encoded += chunk;
  });
  const bytes = fromBase64(encoded);
  if (bytes.length !== fields.StateUtf8ByteLength) fail();
  // Preserve BOM characters during decoding: silently dropping bytes breaks full-byte integrity.
  const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const roundtripBytes = new TextEncoder().encode(json);
  if (json.charCodeAt(0) === 0xFEFF || roundtripBytes.length !== bytes.length
    || roundtripBytes.some((value, index) => value !== bytes[index])) fail();
  if ((await sha256(json)).toUpperCase() !== fields.StateSHA256) fail();
  const decoded = snapshot<Record<string, unknown>>(JSON.parse(json));
  if (!decoded || !exactKeys(decoded, envelopeKeys) || Object.keys(decoded).join('|') !== envelopeKeys.join('|')
    || JSON.stringify(decoded) !== json || decoded.rowVersion !== fields.RowVersion
    || decoded.currentVersionKey !== fields.CurrentVersionKey || decoded.contract !== fields.StateContractVersion
    || decoded.catalogueKey !== fields.CatalogueKey) fail();
  const state = snapshot<IBehaviourCatalogueAdminState>({ ...decoded, etag });
  if (!await canonical(state, authority, sha256)) fail();
  return state as IBehaviourCatalogueAdminState;
};

export class SharePointBehaviourCatalogueAdministrationStore implements IBehaviourCatalogueAdministrationStore {
  private readonly binding: Readonly<IBehaviourSharePointBinding> | undefined;
  private readonly authority: Readonly<IBehaviourCatalogueAdminAuthority>;
  public constructor(
    binding: IBehaviourSharePointBinding | undefined,
    authority: IBehaviourCatalogueAdminAuthority,
    private readonly transport: IBehaviourCatalogueTrustedHostTransport,
    private readonly sha256: BehaviourCatalogueSha256
  ) {
    this.binding = binding === undefined ? undefined : snapshot<IBehaviourSharePointBinding>(binding);
    this.authority = snapshot<IBehaviourCatalogueAdminAuthority>(authority);
  }
  private coordinates(): Readonly<IBehaviourSharePointCoordinates> {
    const binding = this.binding!;
    return Object.freeze({ siteId: binding.siteId, webId: binding.webId, listId: binding.listId, itemId: binding.itemId });
  }
  private itemUrl(): string {
    return `${this.binding!.webUrl}/_api/web/lists(guid'${this.binding!.listId}')/items(${this.binding!.itemId})`;
  }
  private async actor(): Promise<Readonly<IBehaviourCatalogueAdminActor>> {
    const binding = this.binding;
    if (!binding || !exactKeys(binding, ['environment', 'webUrl', 'siteId', 'webId', 'listId', 'itemId', 'entityType'])
      || binding.environment !== 'TEST' || !/^https:\/\/[^/?#]+\/[^?#]*[^/]$/.test(binding.webUrl)
      || !guid.test(binding.siteId) || !guid.test(binding.webId) || !guid.test(binding.listId)
      || !Number.isSafeInteger(binding.itemId) || binding.itemId < 1 || binding.itemId > 2147483647
      || !/^SP\.Data\.[A-Za-z0-9_]+ListItem$/.test(binding.entityType)) fail();
    const actor = snapshot<IBehaviourCatalogueAdminActor>(await this.transport.resolveAuthenticatedAdminContext());
    if (!actor || !exactKeys(actor, ['personKey', 'email', 'appRoles']) || !scalar(actor.personKey)
      || typeof actor.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor.email)
      || !Array.isArray(actor.appRoles) || !actor.appRoles.every(role => typeof role === 'string' && Boolean(role.trim()))
      || !getAdminFoundationEntitlement(actor.appRoles).entitled) fail();
    // The existing processor records audit email in lower case; preserve that identity convention.
    return snapshot<IBehaviourCatalogueAdminActor>({ ...actor, email: actor.email.trim().toLowerCase() });
  }
  private async request(request: IBehaviourSharePointRequest,
    requiredActor?: Readonly<{ personKey: string; email: string }>
  ): Promise<Readonly<IBehaviourSharePointResponse>> {
    const authenticated = await this.actor();
    if (requiredActor && (authenticated.personKey !== requiredActor.personKey
      || authenticated.email !== requiredActor.email)) fail();
    const response = snapshot<IBehaviourSharePointResponse>(await this.transport.request(snapshot<IBehaviourSharePointRequest>(request)));
    if (!response || !same(response.coordinates, this.coordinates()) || !Number.isInteger(response.status)) fail();
    return response;
  }
  public async readCanonical(): Promise<IBehaviourCatalogueAdminState | undefined> {
    await this.actor();
    const headers = { Accept: 'application/json;odata=verbose' };
    const metadata = await this.request({ coordinates: this.coordinates(),
      url: `${this.binding!.webUrl}/_api/web/lists(guid'${this.binding!.listId}')?$select=Id,ListItemEntityTypeFullName`,
      method: 'GET', headers });
    const list = (metadata.body as { d?: { Id?: string; ListItemEntityTypeFullName?: string } } | undefined)?.d;
    if (metadata.status !== 200 || !list || list.Id !== this.binding!.listId
      || list.ListItemEntityTypeFullName !== this.binding!.entityType) fail();
    const response = await this.request({ coordinates: this.coordinates(),
      url: `${this.itemUrl()}?$select=Id,${[...scalarFields, ...BEHAVIOUR_STORE_CHUNK_FIELDS].join(',')}`,
      method: 'GET', headers });
    if (response.status === 404) return undefined;
    const item = (response.body as { d?: Record<string, unknown> } | undefined)?.d;
    if (response.status !== 200 || !item || !exactKeys(item, ['Id', '__metadata', ...scalarFields, ...BEHAVIOUR_STORE_CHUNK_FIELDS])
      || item.Id !== this.binding!.itemId) fail();
    const native = item!.__metadata as { etag: string; type: string; uri: string };
    if (!native || !nativeEtag(native.etag) || native.type !== this.binding!.entityType
      || native.uri !== this.itemUrl() || (response.etag !== undefined && response.etag !== native.etag)) fail();
    const fields: Record<string, unknown> = {};
    [...scalarFields, ...BEHAVIOUR_STORE_CHUNK_FIELDS].forEach(name => { fields[name] = item![name]; });
    return decodeBehaviourCatalogueSharePointFields(fields, native.etag, this.authority, this.sha256);
  }
  /** Companion source readback only. The existing transport has neither a protected numeric
   * publisher mapping nor an admitted immutable receipt port; no caller input can fill them.
   * Preserve the native fields/body, validate with the genuine codec, and remain disabled.
   */
  public async readPublisherExportCandidate(): Promise<Readonly<IBehaviourCataloguePublisherExportHold>> {
    const missingInputs = ['ProtectedPublisherPrincipalMappingUnavailable', 'ImmutablePublisherReceiptPortUnavailable'];
    try {
      const actor = await this.actor();
      const state = await this.readCanonical();
      if (!state) return snapshot({ status: 'HOLD', missingInputs: ['CatalogueReadbackUnavailable', ...missingInputs] });
      const response = await this.request({ coordinates: this.coordinates(),
        url: `${this.itemUrl()}?$select=Id,OData__UIVersionString,${[...scalarFields, ...BEHAVIOUR_STORE_CHUNK_FIELDS].join(',')}`,
        method: 'GET', headers: { Accept: 'application/json;odata=verbose' } }, actor);
      const item = (response.body as { d?: Record<string, unknown> } | undefined)?.d;
      if (response.status !== 200 || !item
        || !exactKeys(item, ['Id', '__metadata', 'OData__UIVersionString', ...scalarFields, ...BEHAVIOUR_STORE_CHUNK_FIELDS])
        || item.Id !== this.binding!.itemId || !scalar(item.OData__UIVersionString)) fail();
      const native = item!.__metadata as { etag: string; type: string; uri: string };
      if (!native || !nativeEtag(native.etag) || native.type !== this.binding!.entityType
        || native.uri !== this.itemUrl() || (response.etag !== undefined && response.etag !== native.etag)) fail();
      const fields: Record<string, unknown> = {};
      [...scalarFields, ...BEHAVIOUR_STORE_CHUNK_FIELDS].forEach(name => { fields[name] = item![name]; });
      const decoded = await decodeBehaviourCatalogueSharePointFields(fields, native.etag, this.authority, this.sha256);
      // Full canonical reread must agree with the original physical readback, including ETag.
      const nativeReread = await this.request({ coordinates: this.coordinates(),
        url: `${this.itemUrl()}?$select=Id,OData__UIVersionString,${[...scalarFields, ...BEHAVIOUR_STORE_CHUNK_FIELDS].join(',')}`,
        method: 'GET', headers: { Accept: 'application/json;odata=verbose' } }, actor);
      const final = await this.readCanonical();
      const finalActor = await this.actor();
      if (!final || !same(response, nativeReread) || !same(state, decoded) || !same(decoded, final)
        || finalActor.personKey !== actor.personKey || finalActor.email !== actor.email
        || this.authority.approvalReference !== 'KCF-KPI-Sponsor-BEH-V02-001') fail();
      const canonicalBody = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
        fromBase64(BEHAVIOUR_STORE_CHUNK_FIELDS.map(name => fields[name] as string).join('')));
      return snapshot({ status: 'HOLD', missingInputs, canonicalBody, candidate: {
        contract: 'kcf.option-e.catalogue-publisher-readback/v4',
        native: { ...response.coordinates, version: item!.OData__UIVersionString as string, etag: native.etag },
        fields, authority: this.authority,
        counts: { versions: decoded.versions.length, events: decoded.events.length,
          targets: decoded.versions[decoded.versions.length - 1].catalogue.rows.length }
      } });
    } catch {
      return snapshot({ status: 'HOLD', missingInputs: ['CompleteNativeCatalogueReadbackUnavailable', ...missingInputs] });
    }
  }
  public async appendSuccessorExact(
    expectedCarrier: Readonly<{ etag: string; rowVersion: number; currentVersionKey: string }>,
    versionCarrier: Readonly<IBehaviourCatalogueAdminVersion>, eventCarrier: Readonly<IBehaviourCatalogueAdminEvent>,
    integrityCarrier: Readonly<IBehaviourCatalogueAdminAppendIntegrity>
  ): Promise<Readonly<IBehaviourCatalogueAdminAppendReceipt>> {
    // No attacker-owned property is evaluated before the descriptor-safe snapshot.
    const version = snapshot<IBehaviourCatalogueAdminVersion>(versionCarrier);
    const event = snapshot<IBehaviourCatalogueAdminEvent>(eventCarrier);
    const expected = snapshot<{ etag: string; rowVersion: number; currentVersionKey: string }>(expectedCarrier);
    const integrity = snapshot<IBehaviourCatalogueAdminAppendIntegrity>(integrityCarrier);
    const receipt = (outcome: BehaviourCatalogueAdminAppendOutcome): Readonly<IBehaviourCatalogueAdminAppendReceipt> =>
      Object.freeze({ outcome, atomic: outcome === 'Appended' || outcome === 'Replay' ? 'Committed'
        : outcome === 'UnknownEffect' ? 'Unknown' : 'NotCommitted', versionKey: version?.versionKey,
      auditKey: event?.auditKey, contentSha256: version?.contentSha256 });
    const existing = (state: IBehaviourCatalogueAdminState): BehaviourCatalogueAdminAppendOutcome | undefined => {
      const index = state.events.findIndex(item => item.auditKey === event.auditKey);
      return index < 0 ? undefined : same(state.events[index], event) && same(state.versions[index], version) ? 'Replay' : 'Collision';
    };
    let initial: IBehaviourCatalogueAdminState;
    let body: Readonly<Record<string, unknown>>;
    try {
      const actor = await this.actor();
      if (!version || !event || !integrity || !expected
        || version.createdByPersonKey !== actor.personKey || version.createdByEmail !== actor.email
        || event.actorPersonKey !== actor.personKey || event.actorEmail !== actor.email
        || !exactKeys(expected, ['etag', 'rowVersion', 'currentVersionKey']) || !nativeEtag(expected.etag)
        || !exactKeys(integrity, ['canonicalCatalogueJson', 'contentSha256'])
        || integrity.canonicalCatalogueJson !== JSON.stringify(version.catalogue)
        || integrity.contentSha256 !== version.contentSha256
        || (await this.sha256(integrity.canonicalCatalogueJson)).toUpperCase() !== version.contentSha256) return receipt('IntegrityFailure');
      const observed = await this.readCanonical();
      if (!observed) return receipt('IntegrityFailure');
      initial = observed;
      const replay = existing(initial);
      if (replay) return receipt(replay);
      if (initial.etag !== expected.etag || initial.rowVersion !== expected.rowVersion
        || initial.currentVersionKey !== expected.currentVersionKey) return receipt('Conflict');
      const next = { ...initial, rowVersion: initial.rowVersion + 1, currentVersionKey: version.versionKey,
        versions: [...initial.versions, version], events: [...initial.events, event] };
      body = snapshot<Record<string, unknown>>({ __metadata: { type: this.binding!.entityType },
        ...await encodeBehaviourCatalogueSharePointFields(next, this.authority, this.sha256) });
    } catch { return receipt('IntegrityFailure'); }
    let status: number | undefined;
    try {
      status = (await this.request({ coordinates: this.coordinates(), url: this.itemUrl(), method: 'POST',
        headers: { Accept: 'application/json;odata=verbose', 'Content-Type': 'application/json;odata=verbose',
          'X-HTTP-Method': 'MERGE', 'IF-MATCH': expected.etag }, body },
      { personKey: version.createdByPersonKey, email: version.createdByEmail })).status;
    } catch { /* Uncertain response: canonical reread below, never a blind write retry. */ }
    try {
      const observed = await this.readCanonical();
      if (!observed) return receipt('UnknownEffect');
      const prefixPreserved = same(observed.versions.slice(0, initial.versions.length), initial.versions)
        && same(observed.events.slice(0, initial.events.length), initial.events);
      if (!prefixPreserved) return receipt('UnknownEffect');
      const result = existing(observed);
      if (result === 'Replay' && observed.etag !== initial.etag) return receipt(status === 412 ? 'Replay' : 'Appended');
      if (result === 'Collision') return receipt('Collision');
      if (status === 412) return receipt('Conflict');
      if (status !== undefined && status >= 400 && status < 500 && status !== 408) return receipt('IntegrityFailure');
    } catch { /* Full reread failure cannot be promoted to committed. */ }
    return receipt('UnknownEffect');
  }
}
