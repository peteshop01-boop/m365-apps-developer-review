import {
  assertContentReference, assertStorageBinding, dispatchCommandStorage, parseStorageJson,
  storageCanonical, storageDigest, storageInteger, storageRequire,
  type C2bContentReferenceV1, type C2bStorageBindingV1, type C2bStorageSourceV1
} from '../models/C2bFileStorageV1Models';
import { C2bImmutableFileStorageV1, pairStorageProjectionV1, storageBytes, storageSHA256,
  verifyStorageAcceptanceV1, type IC2bImmutableFileStoreV1 } from './C2bImmutableFileStorageV1';
import type { IEmployeeV2AnnualAdmissionEnvelope } from './EmployeeWorkplanV2CommandTransport';
import type { C2bTrustedCommandSource } from './TestPilotCommandAdmissionC2bHandlers';
import type { IC2bCommandSourcePairV1, IC2bNativeSourceObservation } from './EmployeeWorkplanV2C2bNativeAdapter';

export interface C2bCommandReadContextV1 {
  source: C2bTrustedCommandSource; route: 'Employee' | 'Manager'; payloadField: 'PayloadJSON';
  siteUrl: string; site: string; web: string; candidate: { commit: string; tree: string };
}
/** Authenticated host observations, not a native registry schema or a caller's descriptor. */
export interface C2bCommandHostV1 {
  context: C2bCommandReadContextV1; binding: C2bStorageBindingV1;
  providerProfile: 'sphttpclient-arraybuffer-odata3-nometadata-v1';
  responseByteBound: number; completeBufferBytes: number; timeoutMs: number;
  providerEvidence: string; resourceReservation: string; retentionAuthority: string;
  registryAuthority: string; provenanceAuthority: string; readRightsAuthority: string;
  issuer: string; grantSHA256: string;
}
export interface C2bCommandRawResponseV1 {
  readonly requestUrl: string; readonly responseUrl: string; readonly status: number;
  readonly headers: readonly (readonly [string, string])[];
  readonly bytes: Uint8Array; readonly sha256: string; readonly retentionReference: string;
}
export interface C2bAcceptedCommandV1 {
  state: 'Sealed' | 'CanonicalApplied' | 'Confirmed'; registryAuthority: string; provenanceAuthority: string;
  source: C2bStorageSourceV1; reference: C2bContentReferenceV1; commandKey: string; attemptKey: string;
  inventorySHA256: string; issuer: string; grantSHA256: string;
  bindingBytes: Uint8Array; sealBytes: Uint8Array;
}
/** Every dependency must exist before the first command GET or file read. No default native implementation. */
export interface IC2bCommandSourceDependenciesV1 {
  captureCurrentHostAndGrant(context: Readonly<C2bCommandReadContextV1>): Promise<C2bCommandHostV1 | undefined>;
  retainCompleteRawResponse(context: Readonly<C2bCommandReadContextV1>, response: {
    requestUrl: string; responseUrl: string; status: number; headers: readonly (readonly [string, string])[];
    bytes: Uint8Array; sha256: string;
  }): Promise<{ reference: string; sha256: string; bytes: number }>;
  readAuthenticatedAcceptedCommand(context: Readonly<C2bCommandReadContextV1>,
    source: Readonly<C2bStorageSourceV1>, root: Readonly<C2bContentReferenceV1>): Promise<C2bAcceptedCommandV1 | undefined>;
  assertAcceptedReadResources(host: Readonly<C2bCommandHostV1>, root: Readonly<C2bContentReferenceV1>): Promise<void>;
  hold(context: Readonly<C2bCommandReadContextV1>, reason: string): Promise<void>;
  acceptedFiles: Pick<IC2bImmutableFileStoreV1, 'read'>;
}
export interface C2bCommandCaptureAdmissionV1 {
  readonly host: Readonly<C2bCommandHostV1>;
  retain(response: Parameters<IC2bCommandSourceDependenciesV1['retainCompleteRawResponse']>[1]):
    ReturnType<IC2bCommandSourceDependenciesV1['retainCompleteRawResponse']>;
}
const nonBlank = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const same = (a: unknown, b: unknown): boolean => storageCanonical(a) === storageCanonical(b);
// An arbitrary caller-created pair, even with self-consistent hashes, carries no reader provenance.
const verifiedPairs = new WeakMap<object, Readonly<{
  context: C2bCommandReadContextV1; source: C2bStorageSourceV1; authorEmail: string;
}>>();
function freeze<T>(v: T): T {
  if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
function copy<T>(v: T): T { return freeze(JSON.parse(storageCanonical(v)) as T); }
function object(v: unknown): Record<string, unknown> {
  storageRequire(v !== null && typeof v === 'object' && !Array.isArray(v), 'COMMAND_OBJECT');
  return v as Record<string, unknown>;
}
function decode(bytes: Uint8Array): unknown {
  return parseStorageJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
}
export function assertCommandCaptureAdmissionV1(value: C2bCommandCaptureAdmissionV1 | undefined):
  asserts value is C2bCommandCaptureAdmissionV1 {
  storageRequire(value && typeof value.retain === 'function' && value.host, 'COMMAND_CAPTURE_UNAVAILABLE');
  const h = value.host;
  assertStorageBinding(h.binding);
  storageRequire(h.providerProfile === 'sphttpclient-arraybuffer-odata3-nometadata-v1', 'COMMAND_PROVIDER_PROFILE');
  storageInteger(h.responseByteBound, 1); storageInteger(h.completeBufferBytes, 1); storageInteger(h.timeoutMs, 1);
  storageRequire(h.completeBufferBytes >= h.responseByteBound && h.timeoutMs <= 120000
    && [h.providerEvidence, h.resourceReservation, h.retentionAuthority, h.registryAuthority,
      h.provenanceAuthority, h.readRightsAuthority, h.issuer].every(nonBlank), 'COMMAND_HOST_UNAVAILABLE');
  storageDigest(h.grantSHA256);
}
/** Complete raw bytes and response metadata are copied before any source JSON is parsed. */
export function immutableCommandRawResponseV1(value: Omit<C2bCommandRawResponseV1, 'bytes'>,
  input: Uint8Array): C2bCommandRawResponseV1 {
  const bytes = input.slice();
  // The copy helper freezes values; make an extensible metadata shell, then add
  // the getter LAST so ES5 Object.assign cannot turn it into mutable data.
  const meta = { ...copy(value) };
  return Object.freeze(Object.defineProperty(meta, 'bytes', {
    enumerable: true, configurable: false, get: (): Uint8Array => bytes.slice()
  })) as C2bCommandRawResponseV1;
}
function rawHeader(raw: C2bCommandRawResponseV1, name: string): string | undefined {
  const found = raw.headers.filter(([key]) => key.toLowerCase() === name.toLowerCase());
  storageRequire(found.length <= 1, 'COMMAND_DUPLICATE_HEADER'); return found[0]?.[1];
}
function physicalSource(raw: C2bCommandRawResponseV1, context: C2bCommandReadContextV1): Record<string, unknown> {
  storageRequire(raw.status === 200 && raw.requestUrl === raw.responseUrl && nonBlank(raw.retentionReference), 'COMMAND_RESPONSE');
  const expectedUrl = new URL(`${context.siteUrl}/_api/web/lists(guid'${context.source.listId}')/items(${context.source.itemId})?`
    + '$select=*,OData__UIVersionString,AuthorId,EditorId,Author/EMail&$expand=Author').toString();
  const media = rawHeader(raw, 'content-type'); const length = rawHeader(raw, 'content-length');
  const encoding = rawHeader(raw, 'content-encoding');
  storageRequire(raw.requestUrl === expectedUrl && typeof media === 'string'
    && /^application\/json(?:\s*;\s*(?:odata=nometadata|charset=utf-8))*$/i.test(media)
    && typeof length === 'string' && /^(0|[1-9][0-9]*)$/.test(length) && Number(length) === raw.bytes.length
    && (encoding === undefined || encoding === 'identity'), 'COMMAND_RAW_REPRESENTATION');
  const row = object(decode(raw.bytes));
  const etag = rawHeader(raw, 'etag');
  const rowETags = ['@odata.etag', 'odata.etag'].filter(k => Object.prototype.hasOwnProperty.call(row, k));
  storageRequire(rowETags.length === 1 && row[rowETags[0]] === etag && nonBlank(etag) && etag !== '*', 'COMMAND_ETAG');
  storageRequire(row.Id === context.source.itemId && row.OData__UIVersionString === context.source.itemVersion,
    'COMMAND_SOURCE_IDENTITY');
  storageInteger(row.AuthorId, 1); storageInteger(row.EditorId, 1);
  // Preserve absence separately; never synthesise a RowVersionToken or coerce an actual provider value.
  if (Object.prototype.hasOwnProperty.call(row, 'RowVersionToken')) storageInteger(row.RowVersionToken, 1);
  storageRequire(nonBlank(object(row.Author).EMail) && typeof row[context.payloadField] === 'string', 'COMMAND_FIELDS');
  return copy(row);
}
function logicalEnvelope(wire: Uint8Array, physical: Record<string, unknown>): IEmployeeV2AnnualAdmissionEnvelope {
  const value = object(decode(wire)); const binding = object(value.binding); const expected = object(value.expected);
  object(value.payload); object(expected.header); object(expected.item);
  storageRequire(value.schemaVersion === 'kcf.kpi.test-command.v2'
    && !Object.prototype.hasOwnProperty.call(value, 'k')
    && ['commandKey', 'commandType', 'subjectType', 'subjectKey', 'personKey', 'workplanKey'].every(k => nonBlank(binding[k]))
    && Number.isSafeInteger(binding.performanceYear), 'COMMAND_LOGICAL_VERSION');
  // Reconcile the original transport's outer-binding fields without rewriting PayloadJSON or loading its SDK.
  storageRequire(physical.CommandKey === binding.commandKey && physical.CommandType === binding.commandType
    && physical.SubjectType === binding.subjectType && physical.SubjectKey === binding.subjectKey
    && physical.PersonKey === binding.personKey && physical.PerformanceYear === binding.performanceYear
    && physical.ExpectedRowVersionToken === null && physical.Quarter === null
    && physical.ClientCorrelationKey === binding.commandKey && physical.ExpectedETag === object(expected.header).etag,
  'COMMAND_OUTER_BINDING');
  return copy(value) as unknown as IEmployeeV2AnnualAdmissionEnvelope;
}
/** Reader-only composition. Construction does not activate any producer, startup or native route. */
export class C2bCommandSourceStorageV1 {
  public constructor(private readonly dependencies?: IC2bCommandSourceDependenciesV1) {}

  public async prepare(input: C2bCommandReadContextV1): Promise<C2bCommandCaptureAdmissionV1> {
    const context = copy(input); const d = this.dependencies;
    const required: (keyof IC2bCommandSourceDependenciesV1)[] = ['captureCurrentHostAndGrant', 'retainCompleteRawResponse',
      'readAuthenticatedAcceptedCommand', 'assertAcceptedReadResources', 'hold'];
    storageRequire(d && required.every(k => typeof d[k] === 'function') && typeof d.acceptedFiles?.read === 'function',
      'COMMAND_DEPENDENCIES_UNAVAILABLE');
    const observed = await d.captureCurrentHostAndGrant(context);
    storageRequire(observed, 'COMMAND_HOST_UNAVAILABLE'); const host = copy(observed);
    const admission = Object.freeze({ host, retain: (response: Parameters<IC2bCommandSourceDependenciesV1['retainCompleteRawResponse']>[1]) =>
      d.retainCompleteRawResponse(context, response) });
    assertCommandCaptureAdmissionV1(admission);
    const b = host.binding;
    storageRequire(same(host.context, context) && context.payloadField === 'PayloadJSON'
      && b.operation.purpose === 'command' && b.identity.effectKey === null
      && b.target.list === context.source.listId && b.target.site === context.site && b.target.web === context.web
      && b.candidate.commit === context.candidate.commit && b.candidate.tree === context.candidate.tree
      && b.grant.issuerPrincipal === host.issuer && /^https:\/\/[a-z0-9.-]+\/sites\/[A-Za-z0-9_-]+$/.test(context.siteUrl),
    'COMMAND_CONTEXT');
    return admission;
  }

  public async hold(admission: C2bCommandCaptureAdmissionV1, error: unknown): Promise<never> {
    try { await this.dependencies!.hold(admission.host.context, String(error)); } catch { /* No failed HOLD can admit a command. */ }
    throw error;
  }

  public async read(raw: C2bCommandRawResponseV1, admission: C2bCommandCaptureAdmissionV1): Promise<IC2bNativeSourceObservation> {
    try {
      assertCommandCaptureAdmissionV1(admission);
      const h = admission.host; const context = h.context; const bytes = raw.bytes;
      storageRequire(bytes.length <= h.responseByteBound && await storageSHA256(bytes) === raw.sha256, 'COMMAND_RAW_DIGEST');
      const physical = physicalSource(raw, context); const physicalSHA256 = await storageSHA256(storageBytes(physical));
      const source: C2bStorageSourceV1 = { list: context.source.listId, itemId: context.source.itemId,
        version: context.source.itemVersion, authorPrincipal: String(physical.AuthorId),
        etag: rawHeader(raw, 'etag')!, rawBytesSHA256: raw.sha256, physicalFieldsSHA256: physicalSHA256 };
      storageRequire(source.authorPrincipal === h.binding.source.expectedActor, 'COMMAND_AUTHOR');
      const dispatch = dispatchCommandStorage(physical[context.payloadField] as string);
      let logicalBytes: Uint8Array; let accepted: IC2bCommandSourcePairV1['acceptance'];
      if (dispatch.kind === 'legacy-inline') logicalBytes = new TextEncoder().encode(dispatch.wire);
      else {
        const b = h.binding; const bindingSHA256 = await storageSHA256(storageBytes(b));
        const target = { site: b.target.site, web: b.target.web, library: b.target.library };
        assertContentReference(dispatch.reference, { purpose: 'command', target, bindingSHA256 });
        const received = await this.dependencies!.readAuthenticatedAcceptedCommand(context, copy(source), copy(dispatch.reference));
        storageRequire(received, 'COMMAND_NOT_REGISTERED');
        const bindingBytes = received.bindingBytes.slice(); const sealBytes = received.sealBytes.slice();
        const registration = copy({ state: received.state, registryAuthority: received.registryAuthority,
          provenanceAuthority: received.provenanceAuthority, source: received.source, reference: received.reference,
          commandKey: received.commandKey, attemptKey: received.attemptKey, inventorySHA256: received.inventorySHA256,
          issuer: received.issuer, grantSHA256: received.grantSHA256 });
        storageDigest(registration.inventorySHA256);
        storageRequire(['Sealed', 'CanonicalApplied', 'Confirmed'].includes(registration.state)
          && registration.registryAuthority === h.registryAuthority && registration.provenanceAuthority === h.provenanceAuthority
          && same(registration.source, source) && same(registration.reference, dispatch.reference)
          && registration.commandKey === b.identity.commandKey && registration.attemptKey === b.identity.attemptKey
          && registration.issuer === h.issuer && registration.grantSHA256 === h.grantSHA256, 'COMMAND_REGISTRY_CONTEXT');
        await verifyStorageAcceptanceV1(bindingBytes, sealBytes, { binding: b,
          source: { source, rawBytes: bytes, physicalFields: physical }, inventorySHA256: registration.inventorySHA256,
          issuer: h.issuer, grantSHA256: h.grantSHA256 });
        await this.dependencies!.assertAcceptedReadResources(h, copy(dispatch.reference));
        const files = this.dependencies!.acceptedFiles;
        const storage = new C2bImmutableFileStorageV1({ read: locator => files.read(locator),
          create: async () => { throw new Error('C2B_FILE_COMMAND_READER_ONLY'); } });
        logicalBytes = await storage.hydrate(dispatch.reference, { purpose: 'command', target, bindingSHA256 });
        accepted = copy({ ...registration, bindingSHA256, sealSHA256: await storageSHA256(sealBytes) });
      }
      const logicalSHA256 = await storageSHA256(logicalBytes);
      const pair = await pairStorageProjectionV1({ rawBytes: bytes, rawSHA256: raw.sha256, physical,
        physicalFieldsSHA256: physicalSHA256 }, logicalBytes, logicalSHA256, wire => logicalEnvelope(wire, physical));
      const logical = copy(pair.logical); const b = h.binding;
      storageRequire(logical.binding.commandKey === b.identity.commandKey && logical.binding.commandType === b.operation.commandType
        && logical.binding.subjectType === b.subjects.subjectType && logical.binding.subjectKey === b.subjects.subjectKey
        && logical.binding.personKey === b.subjects.personKey && logical.binding.performanceYear === b.subjects.performanceYear
        && logical.binding.workplanKey === b.subjects.workplanKey, 'COMMAND_LOGICAL_CONTEXT');
      const pairFields = { version: 'kcf.kpi.command-source.v1' as const, kind: dispatch.kind,
        response: copy({ requestUrl: raw.requestUrl, responseUrl: raw.responseUrl, status: raw.status,
          headers: raw.headers, retentionReference: raw.retentionReference }),
        physical: pair.physical, capturedRawSHA256: pair.capturedRawSHA256, physicalFieldsSHA256: pair.physicalFieldsSHA256,
        logicalBytesSHA256: pair.logicalBytesSHA256, logical, ...(accepted ? { acceptance: accepted } : {}) };
      // Downlevel object-spread evaluates getter properties: add them AFTER all spreads.
      const paired: IC2bCommandSourcePairV1 = Object.freeze(Object.defineProperties(pairFields, {
        capturedRawBytes: { enumerable: true, get: (): Uint8Array => pair.capturedRawBytes },
        logicalBytes: { enumerable: true, get: (): Uint8Array => pair.logicalBytes }
      })) as IC2bCommandSourcePairV1;
      const authorEmail = (object(physical.Author).EMail as string).trim().toLowerCase();
      verifiedPairs.set(paired, copy({ context, source, authorEmail }));
      return Object.freeze({ source: copy(context.source), sourceETag: source.etag, sourceRowVersion: source.version,
        route: context.route, authorEmail,
        envelope: logical, commandSource: paired });
    } catch (error) { return this.hold(admission, error); }
  }
}

/** Compare mutable enclosing observations only against the reader's private original context. */
function assertOriginalCommandSourceContext(observation: IC2bNativeSourceObservation,
  p: IC2bCommandSourcePairV1 | undefined): asserts p is IC2bCommandSourcePairV1 {
  storageRequire(p && observation.commandSource === p && verifiedPairs.has(p) && p.version === 'kcf.kpi.command-source.v1'
    && ['file', 'legacy-inline'].includes(p.kind), 'COMMAND_PAIR_VERSION');
  const original = verifiedPairs.get(p)!;
  storageRequire(same(observation.source, original.context.source) && observation.route === original.context.route
    && observation.sourceETag === original.source.etag && observation.sourceRowVersion === original.source.version
    && observation.authorEmail === original.authorEmail
    && String(p.physical.AuthorId) === original.source.authorPrincipal, 'COMMAND_PAIR_SOURCE_CONTEXT');
}

/** Revalidate the pair's bytes and every projection before any planning read. A version or hash is not authority. */
export async function assertCommandSourcePairV1(observation: IC2bNativeSourceObservation): Promise<void> {
  const p = observation.commandSource;
  assertOriginalCommandSourceContext(observation, p);
  storageRequire(await storageSHA256(p.capturedRawBytes) === p.capturedRawSHA256
    && await storageSHA256(storageBytes(p.physical)) === p.physicalFieldsSHA256
    && await storageSHA256(p.logicalBytes) === p.logicalBytesSHA256, 'COMMAND_PAIR_BYTES');
  const row = object(decode(p.capturedRawBytes));
  storageRequire(same(row, p.physical) && same(logicalEnvelope(p.logicalBytes, row), p.logical)
    && same(p.logical, observation.envelope) && row.Id === observation.source.itemId
    && row.OData__UIVersionString === observation.source.itemVersion && observation.sourceRowVersion === observation.source.itemVersion
    && object(row.Author).EMail && (object(row.Author).EMail as string).trim().toLowerCase() === observation.authorEmail,
  'COMMAND_PAIR_RECONCILIATION');
  const descriptor = dispatchCommandStorage(row.PayloadJSON as string);
  const response = p.response;
  storageRequire(response.status === 200 && response.requestUrl === response.responseUrl && nonBlank(response.retentionReference)
    && response.headers.filter(([key, value]) => key.toLowerCase() === 'etag' && value === observation.sourceETag).length === 1
    && (row['@odata.etag'] || row['odata.etag']) === observation.sourceETag && descriptor.kind === p.kind, 'COMMAND_PAIR_RESPONSE');
  if (descriptor.kind === 'file') {
    const a = p.acceptance;
    storageRequire(a && same(a.reference, descriptor.reference) && a.reference.h === p.logicalBytesSHA256
      && ['Sealed', 'CanonicalApplied', 'Confirmed'].includes(a.state)
      && a.commandKey === p.logical.binding.commandKey && a.source.list === observation.source.listId
      && a.source.itemId === observation.source.itemId && a.source.version === observation.source.itemVersion
      && a.source.etag === observation.sourceETag && a.source.authorPrincipal === String(row.AuthorId)
      && a.source.rawBytesSHA256 === p.capturedRawSHA256 && a.source.physicalFieldsSHA256 === p.physicalFieldsSHA256,
    'COMMAND_PAIR_ACCEPTANCE');
  } else storageRequire(p.acceptance === undefined
    && new TextDecoder().decode(p.logicalBytes) === descriptor.wire, 'COMMAND_PAIR_INLINE');
  // Digest awaits allow caller-owned observations to change. No await may follow this final assertion.
  assertOriginalCommandSourceContext(observation, p);
}
