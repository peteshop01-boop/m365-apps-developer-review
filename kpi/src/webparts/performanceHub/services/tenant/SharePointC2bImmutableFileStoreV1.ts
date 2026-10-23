import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import { assertStorageBinding, assertStorageLocator, parseStorageJson, storageCanonical, storageDigest, storageGuid,
  storageInteger, storageRequire, type C2bFileLocator, type C2bStorageBindingV1 }
  from '../../models/C2bFileStorageV1Models';
import { storageSHA256, type IC2bImmutableFileStoreV1 } from '../C2bImmutableFileStorageV1';

type CreateContext = Parameters<IC2bImmutableFileStoreV1['create']>[1];
export interface C2bStoragePendingFileV1 {
  name: string; length: number; sha256: string; context: CreateContext;
}
export type C2bStorageAttemptStateV1 = 'Reserved' | 'PrivateUploaded' | 'Verified' | 'SourceObserved'
  | 'Sealed' | 'CanonicalApplied' | 'Confirmed' | 'NotApplied' | 'UNKNOWN/Held';
export interface C2bStorageRegisteredFileV1 {
  pending: C2bStoragePendingFileV1; locator: C2bFileLocator | null; accepted: boolean;
}
export interface C2bStorageFileCaptureV1 {
  locator: C2bFileLocator; name: string; fileETag: string; itemETag: string; itemId: number;
  authorPrincipalId: number; rawMetadata: Uint8Array;
}
/**
 * Required injected dependencies expressed ONLY in reviewed logical records/observations.
 * No native registry schema, wire, tenant configuration or supported implementation is asserted here.
 * Absence denies before any REST call. A later approved adapter must supply every operation.
 */
export interface IC2bStorageNativeDependenciesV1 {
  captureCurrentHostAndGrant(binding: Readonly<C2bStorageBindingV1>): Promise<{
    binding: C2bStorageBindingV1; siteUrl: string; libraryRoot: string;
    authorPrincipalId: number; issuerPrincipalId: number; metadataResponseBytes: number; timeoutMs: number;
  } | undefined>;
  assertReservedResources(binding: Readonly<C2bStorageBindingV1>, pending: Readonly<C2bStoragePendingFileV1> | null): Promise<void>;
  readAttempt(binding: Readonly<C2bStorageBindingV1>): Promise<{
    bindingSHA256: string; etag: string; state: C2bStorageAttemptStateV1;
  } | undefined>;
  prepareFile(binding: Readonly<C2bStorageBindingV1>, expectedETag: string,
    pending: Readonly<C2bStoragePendingFileV1>): Promise<{ etag: string; file: C2bStorageRegisteredFileV1 }>;
  recordVerifiedFile(binding: Readonly<C2bStorageBindingV1>, expectedETag: string,
    file: Readonly<C2bStorageRegisteredFileV1>, capture: Readonly<C2bStorageFileCaptureV1>): Promise<void>;
  findRegisteredFile(binding: Readonly<C2bStorageBindingV1>, locator: Readonly<C2bFileLocator>): Promise<C2bStorageRegisteredFileV1 | undefined>;
  assertCapturedFileProvenance(binding: Readonly<C2bStorageBindingV1>, capture: Readonly<C2bStorageFileCaptureV1>, accepted: boolean): Promise<void>;
  retainCompleteRawResponse(binding: Readonly<C2bStorageBindingV1>, requestUrl: string,
    status: number, headers: readonly (readonly [string, string])[], bytes: Uint8Array): Promise<void>;
  holdAttempt(binding: Readonly<C2bStorageBindingV1>, reason: string): Promise<void>;
}
type Host = NonNullable<Awaited<ReturnType<IC2bStorageNativeDependenciesV1['captureCurrentHostAndGrant']>>>;
const METADATA_SELECT = '?$select=UniqueId,Length,ETag,MajorVersion,MinorVersion,ServerRelativeUrl,'
  + 'ListItemAllFields/Id,ListItemAllFields/AuthorId,ListItemAllFields/OData__UIVersionString,'
  + 'ListItemAllFields/ParentList/Id&$expand=ListItemAllFields,ListItemAllFields/ParentList';
const equal = (a: unknown, b: unknown): boolean => storageCanonical(a) === storageCanonical(b);
function immutableCopy<T>(value: T): T { return JSON.parse(storageCanonical(value)) as T; }
/** Exact A007 source acceptance profile; actual provider compatibility remains a later native gate. */
interface ReceivedFileProjection {
  readonly UniqueId: string; readonly ServerRelativeUrl: string; readonly Length: string;
  readonly MajorVersion: 1; readonly MinorVersion: 0; readonly ETag: string;
}

/** Concrete SPHttpClient transport; construction/default configuration cannot issue a native call. */
export class SharePointC2bImmutableFileStoreV1 implements IC2bImmutableFileStoreV1 {
  private readonly binding: C2bStorageBindingV1 | undefined;
  public constructor(private readonly client: Pick<SPHttpClient, 'get' | 'post'>,
    options?: { enabled?: boolean; binding?: C2bStorageBindingV1; readMode?: 'private-stage' | 'accepted' },
    private readonly dependencies?: IC2bStorageNativeDependenciesV1) {
    this.enabled = options?.enabled === true;
    this.readMode = options?.readMode;
    this.binding = options?.binding ? immutableCopy(options.binding) : undefined;
  }
  private readonly enabled: boolean;
  private readonly readMode: 'private-stage' | 'accepted' | undefined;

  private async admit(pending: C2bStoragePendingFileV1 | null): Promise<{
    binding: C2bStorageBindingV1; host: Host; ports: IC2bStorageNativeDependenciesV1;
    attempt: NonNullable<Awaited<ReturnType<IC2bStorageNativeDependenciesV1['readAttempt']>>>;
  }> {
    storageRequire(this.enabled && this.binding && this.dependencies
      && (this.readMode === 'private-stage' || this.readMode === 'accepted'), 'NATIVE_UNAVAILABLE_OR_DISABLED');
    const binding = immutableCopy(this.binding); assertStorageBinding(binding);
    const ports = this.dependencies;
    const required: (keyof IC2bStorageNativeDependenciesV1)[] = ['captureCurrentHostAndGrant', 'assertReservedResources',
      'readAttempt', 'prepareFile', 'recordVerifiedFile', 'findRegisteredFile', 'assertCapturedFileProvenance',
      'retainCompleteRawResponse', 'holdAttempt'];
    storageRequire(required.every(key => typeof ports[key] === 'function'), 'NATIVE_DEPENDENCY_UNAVAILABLE');
    const hostResult = await ports.captureCurrentHostAndGrant(binding);
    storageRequire(hostResult !== undefined, 'HOST_GRANT_UNAVAILABLE');
    const host = immutableCopy(hostResult); assertStorageBinding(host.binding, binding);
    storageRequire(/^https:\/\/[a-z0-9.-]+\/sites\/[A-Za-z0-9_-]+$/.test(host.siteUrl), 'HOST_URI');
    const sitePath = new URL(host.siteUrl).pathname;
    storageRequire(new RegExp('^' + sitePath + '/[A-Za-z0-9_-]+$').test(host.libraryRoot), 'LIBRARY_ROOT');
    storageInteger(host.authorPrincipalId, 1); storageInteger(host.issuerPrincipalId, 1);
    storageInteger(host.metadataResponseBytes, 1); storageInteger(host.timeoutMs, 1);
    await ports.assertReservedResources(binding, pending);
    const attempt = await ports.readAttempt(binding);
    storageRequire(attempt && attempt.bindingSHA256 === await storageSHA256(new TextEncoder().encode(storageCanonical(binding)))
      && typeof attempt.etag === 'string' && attempt.etag.length > 0 && attempt.etag !== '*', 'ATTEMPT_UNAVAILABLE');
    storageRequire(['Reserved', 'PrivateUploaded', 'Verified', 'SourceObserved', 'Sealed', 'CanonicalApplied',
      'Confirmed', 'NotApplied', 'UNKNOWN/Held'].includes(attempt.state), 'ATTEMPT_STATE');
    storageRequire(attempt.state !== 'UNKNOWN/Held' && attempt.state !== 'NotApplied', 'ATTEMPT_HELD');
    if (pending) storageRequire(this.readMode === 'private-stage'
      && (attempt.state === 'Reserved' || attempt.state === 'PrivateUploaded'), 'ATTEMPT_NOT_PRIVATE');
    if (this.readMode === 'accepted') storageRequire(['Sealed', 'CanonicalApplied', 'Confirmed'].includes(attempt.state), 'UNSEALED');
    return { binding, host, ports, attempt };
  }

  public async create(input: Uint8Array, contextInput: CreateContext): Promise<C2bFileLocator> {
    const bytes = input.slice(); const context = immutableCopy(contextInput);
    storageDigest(context.bindingSHA256); storageInteger(context.ordinal);
    storageRequire((context.kind === 'leaf' && context.level === -1 && bytes.length <= 1000000)
      || (context.kind === 'page' && Number.isSafeInteger(context.level) && context.level >= 0 && context.level <= 5 && bytes.length <= 9480), 'FRAME');
    const pending: C2bStoragePendingFileV1 = { name: context.bindingSHA256.toLowerCase() + '-'
      + context.kind + '-' + context.ordinal + '.bin', length: bytes.length, sha256: await storageSHA256(bytes), context };
    const a = await this.admit(pending);
    storageRequire(context.bindingSHA256 === a.attempt.bindingSHA256 && context.purpose === a.binding.operation.purpose, 'CREATE_BINDING');
    // The exact pending name/body identity is durably reserved with CAS before Files/add.
    const prepared = immutableCopy(await a.ports.prepareFile(a.binding, a.attempt.etag, immutableCopy(pending)));
    storageRequire(prepared.etag && prepared.etag !== '*' && equal(prepared.file.pending, pending) && !prepared.file.accepted, 'PREPARE_CAS');
    let capture: C2bStorageFileCaptureV1;
    try {
      await this.assertTarget(a.host, a.binding, a.ports);
      if (prepared.file.locator) {
        assertStorageLocator(prepared.file.locator);
        const result = await this.readStable(prepared.file.locator, pending, false, a);
        capture = result.capture;
      } else {
        const endpoint = a.host.siteUrl + "/_api/web/GetFolderByServerRelativeUrl('" + a.host.libraryRoot
          + "')/Files/add(url='" + pending.name + "',overwrite=false)";
        let uncertain = false; let response: SPHttpClientResponse | undefined;
        let receivedFile: Readonly<ReceivedFileProjection> | undefined;
        try {
          response = await this.deadline(this.client.post(endpoint, SPHttpClient.configurations.v1, {
            headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/octet-stream', 'OData-Version': '3.0' },
            body: new Blob([bytes.slice().buffer]), redirect: 'error'
          }), a.host.timeoutMs);
        } catch {
          // A lost response never leads to another create. Reconcile the same deterministic identity.
          uncertain = true;
        }
        if (response) {
          // A received but unretained/invalid/foreign response is a HOLD, never a successful lost-response recovery.
          const raw = await this.responseBytes(response, endpoint, a.host.metadataResponseBytes, a);
          storageRequire(response.status === 200 || response.status === 201 || response.status === 409, 'CREATE_STATUS');
          if (response.status === 409) this.validateReceivedConflict(response, raw);
          else receivedFile = this.validateReceivedFile(response, raw, a.host, pending);
        }
        const named = a.host.siteUrl + "/_api/web/GetFileByServerRelativeUrl('" + a.host.libraryRoot + '/' + pending.name + "')";
        const metadata = await this.metadata(named, pending, a);
        if (receivedFile) this.assertReceivedReadback(receivedFile, metadata, pending);
        const locator: C2bFileLocator = { u: metadata.locator.u, v: '1.0', n: bytes.length, h: pending.sha256 };
        const result = await this.readStable(locator, pending, false, a);
        capture = result.capture;
        if (receivedFile) this.assertReceivedReadback(receivedFile, capture, pending);
        storageRequire(result.bytes.length === bytes.length && result.bytes.every((v, i) => v === bytes[i]), uncertain ? 'UNKNOWN_READBACK' : 'CREATE_READBACK');
      }
      const file = { pending, locator: capture.locator, accepted: false };
      await a.ports.recordVerifiedFile(a.binding, prepared.etag, file, capture);
      return { ...capture.locator };
    } catch (error) {
      // No delete API exists. Pending files, complete captured responses and private orphans are retained.
      try { await a.ports.holdAttempt(a.binding, String(error)); } catch { /* Failure to record HOLD cannot turn failure into success. */ }
      throw new Error('C2B_FILE_UNKNOWN_OR_HELD: ' + String(error));
    }
  }

  private receivedJson(response: SPHttpClientResponse, raw: Uint8Array, profile: 'nometadata' | 'verbose'):
  Record<string, unknown> {
    const contentType = response.headers.get('Content-Type');
    storageRequire(typeof contentType === 'string', 'CREATE_MEDIA_UNAVAILABLE');
    const parts = contentType.split(';').map(part => part.trim());
    storageRequire(parts.shift()!.toLowerCase() === 'application/json', 'CREATE_MEDIA');
    const parameters = new Set<string>();
    for (const part of parts) {
      const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*(?:"([^"]*)"|([^\s";]+))$/.exec(part);
      storageRequire(match, 'CREATE_MEDIA_PARAMETER');
      const key = match[1].toLowerCase(); const value = (match[2] ?? match[3]).toLowerCase();
      storageRequire(!parameters.has(key), 'CREATE_MEDIA_DUPLICATE_PARAMETER'); parameters.add(key);
      storageRequire((key === 'charset' && value === 'utf-8') || (key === 'odata' && value === profile), 'CREATE_MEDIA_PROFILE');
    }
    const value = parseStorageJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw));
    storageRequire(value !== null && typeof value === 'object' && !Array.isArray(value), 'CREATE_JSON_OBJECT');
    return value as Record<string, unknown>;
  }

  private validateReceivedFile(response: SPHttpClientResponse, raw: Uint8Array, host: Host,
    pending: C2bStoragePendingFileV1): Readonly<ReceivedFileProjection> {
    const value = this.receivedJson(response, raw, 'nometadata');
    const required = ['UniqueId', 'ServerRelativeUrl', 'Length', 'MajorVersion', 'MinorVersion', 'ETag'];
    const optional = ['Name', 'UIVersionLabel', 'Exists']; const keys = Object.keys(value);
    storageRequire(required.every(key => Object.prototype.hasOwnProperty.call(value, key))
      && keys.every(key => required.includes(key) || optional.includes(key)), 'CREATE_FILE_KEYS');
    storageGuid(value.UniqueId);
    storageRequire(value.ServerRelativeUrl === host.libraryRoot + '/' + pending.name, 'CREATE_FILE_PATH');
    storageRequire(typeof value.Length === 'string' && /^(0|[1-9][0-9]*)$/.test(value.Length), 'CREATE_FILE_LENGTH_REPRESENTATION');
    const length = Number(value.Length); storageInteger(length); storageRequire(length === pending.length, 'CREATE_FILE_LENGTH');
    storageRequire(value.MajorVersion === 1 && value.MinorVersion === 0, 'CREATE_FILE_VERSION');
    storageRequire(typeof value.ETag === 'string' && value.ETag.trim().length > 0 && value.ETag.trim() !== '*', 'CREATE_FILE_ETAG');
    if (Object.prototype.hasOwnProperty.call(value, 'Name')) storageRequire(value.Name === pending.name, 'CREATE_FILE_NAME');
    if (Object.prototype.hasOwnProperty.call(value, 'UIVersionLabel')) storageRequire(value.UIVersionLabel === '1.0', 'CREATE_FILE_VERSION_LABEL');
    if (Object.prototype.hasOwnProperty.call(value, 'Exists')) storageRequire(value.Exists === true, 'CREATE_FILE_EXISTS');
    return Object.freeze({ UniqueId: value.UniqueId, ServerRelativeUrl: value.ServerRelativeUrl,
      Length: value.Length, MajorVersion: 1, MinorVersion: 0, ETag: value.ETag });
  }

  private assertReceivedReadback(received: Readonly<ReceivedFileProjection>, capture: C2bStorageFileCaptureV1,
    pending: C2bStoragePendingFileV1): void {
    storageRequire(received.UniqueId === capture.locator.u && received.ETag === capture.fileETag
      && capture.locator.v === received.MajorVersion + '.' + received.MinorVersion
      && Number(received.Length) === capture.locator.n && capture.locator.n === pending.length,
      'CREATE_RESPONSE_READBACK_DISAGREEMENT');
  }

  private validateReceivedConflict(response: SPHttpClientResponse, raw: Uint8Array): void {
    const value = this.receivedJson(response, raw, 'verbose');
    storageRequire(Object.keys(value).length === 1 && Object.prototype.hasOwnProperty.call(value, 'error'), 'CONFLICT_KEYS');
    const error = value.error;
    storageRequire(error !== null && typeof error === 'object' && !Array.isArray(error), 'CONFLICT_ERROR');
    const detail = error as Record<string, unknown>;
    storageRequire(Object.keys(detail).every(key => ['code', 'message', 'innererror'].includes(key))
      && typeof detail.code === 'string' && detail.code.trim().length > 0, 'CONFLICT_CODE');
    storageRequire(detail.message !== null && typeof detail.message === 'object' && !Array.isArray(detail.message), 'CONFLICT_MESSAGE');
    const message = detail.message as Record<string, unknown>;
    storageRequire(Object.keys(message).sort().join('|') === 'lang|value'
      && typeof message.lang === 'string' && message.lang.trim().length > 0
      && typeof message.value === 'string' && message.value.trim().length > 0, 'CONFLICT_MESSAGE_FIELDS');
    if (Object.prototype.hasOwnProperty.call(detail, 'innererror')) storageRequire(detail.innererror !== null
      && typeof detail.innererror === 'object' && !Array.isArray(detail.innererror), 'CONFLICT_INNERERROR');
    // Diagnostic text never authorises reuse: the caller must still prove the same private file and bytes.
  }

  public async read(input: Readonly<C2bFileLocator>): Promise<Uint8Array> {
    const locator = { ...input }; assertStorageLocator(locator); const a = await this.admit(null);
    const registered = await a.ports.findRegisteredFile(a.binding, locator);
    storageRequire(registered && registered.locator && equal(registered.locator, locator), 'UNREGISTERED_FILE');
    storageRequire(this.readMode !== 'accepted' || registered.accepted, 'PRIVATE_REFERENCE');
    storageRequire(registered.pending.context.bindingSHA256 === a.attempt.bindingSHA256
      && registered.pending.context.purpose === a.binding.operation.purpose
      && registered.pending.length === locator.n && registered.pending.sha256 === locator.h, 'REGISTERED_CONTEXT');
    try {
      await this.assertTarget(a.host, a.binding, a.ports);
      return (await this.readStable(locator, registered.pending, registered.accepted, a)).bytes;
    } catch (error) {
      try { await a.ports.holdAttempt(a.binding, String(error)); } catch { /* No accepted read follows a failed HOLD. */ }
      throw error;
    }
  }

  private async assertTarget(host: Host, binding: C2bStorageBindingV1, ports: IC2bStorageNativeDependenciesV1): Promise<void> {
    const a = { host, binding, ports };
    const site = await this.json(host.siteUrl + '/_api/site?$select=Id', a);
    const web = await this.json(host.siteUrl + '/_api/web?$select=Id', a);
    const library = await this.json(host.siteUrl + "/_api/web/lists(guid'" + binding.target.library
      + "')?$select=Id,RootFolder/ServerRelativeUrl&$expand=RootFolder", a);
    storageRequire(site.value.Id === binding.target.site && web.value.Id === binding.target.web
      && library.value.Id === binding.target.library, 'NATIVE_TARGET');
    const folder = library.value.RootFolder as Record<string, unknown> | undefined;
    storageRequire(folder?.ServerRelativeUrl === host.libraryRoot, 'NATIVE_ROOT');
  }

  private async readStable(locator: C2bFileLocator, pending: C2bStoragePendingFileV1, accepted: boolean,
    a: { host: Host; binding: C2bStorageBindingV1; ports: IC2bStorageNativeDependenciesV1 }):
  Promise<{ bytes: Uint8Array; capture: C2bStorageFileCaptureV1 }> {
    const endpoint = a.host.siteUrl + "/_api/web/GetFileById('" + locator.u + "')";
    const first = await this.metadata(endpoint, pending, a); storageRequire(equal(first.locator, locator), 'UNIQUE_ID');
    const body = await this.body(endpoint, first.fileETag, locator.n, a);
    const second = await this.metadata(endpoint, pending, a);
    const again = await this.body(endpoint, second.fileETag, locator.n, a);
    const final = await this.metadata(endpoint, pending, a);
    const comparable = (v: C2bStorageFileCaptureV1): unknown => ({ ...v, rawMetadata: Array.from(v.rawMetadata) });
    storageRequire(equal(comparable(first), comparable(second)) && equal(comparable(second), comparable(final))
      && body.length === locator.n && again.length === locator.n && body.every((v, i) => v === again[i])
      && await storageSHA256(body) === locator.h, 'UNSTABLE_FILE');
    await a.ports.assertCapturedFileProvenance(a.binding, final, accepted);
    return { bytes: body, capture: final };
  }

  private async metadata(endpoint: string, pending: C2bStoragePendingFileV1,
    a: { host: Host; binding: C2bStorageBindingV1; ports: IC2bStorageNativeDependenciesV1 }): Promise<C2bStorageFileCaptureV1> {
    const { value: v, bytes } = await this.json(endpoint + METADATA_SELECT, a);
    storageGuid(v.UniqueId);
    storageRequire(typeof v.Length === 'string' && /^(0|[1-9][0-9]*)$/.test(v.Length), 'LENGTH_REPRESENTATION');
    const length = Number(v.Length); storageInteger(length);
    const item = v.ListItemAllFields as Record<string, unknown> | undefined;
    storageRequire(item !== undefined && typeof item === 'object' && item !== null, 'FILE_ITEM');
    const parent = item.ParentList as Record<string, unknown> | undefined;
    storageRequire(parent?.Id === a.binding.target.library && v.MajorVersion === 1 && v.MinorVersion === 0
      && item.OData__UIVersionString === '1.0' && length === pending.length
      && v.ServerRelativeUrl === a.host.libraryRoot + '/' + pending.name, 'IMMUTABLE_FILE_IDENTITY');
    storageInteger(item.Id, 1); storageInteger(item.AuthorId, 1);
    storageRequire(item.AuthorId === (pending.context.purpose === 'acceptance' ? a.host.issuerPrincipalId : a.host.authorPrincipalId), 'AUTHOR');
    storageRequire(typeof v.ETag === 'string' && v.ETag.length > 0 && v.ETag !== '*'
      && typeof item['@odata.etag'] === 'string' && item['@odata.etag'].length > 0, 'ETAG');
    return { locator: { u: v.UniqueId, v: '1.0', n: length, h: pending.sha256 }, name: pending.name,
      fileETag: v.ETag, itemETag: item['@odata.etag'], itemId: item.Id, authorPrincipalId: item.AuthorId, rawMetadata: bytes };
  }
  private async body(endpoint: string, etag: string, length: number,
    a: { host: Host; binding: C2bStorageBindingV1; ports: IC2bStorageNativeDependenciesV1 }): Promise<Uint8Array> {
    const url = endpoint + '/$value'; const response = await this.deadline(this.client.get(url, SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/octet-stream', 'If-Match': etag }, redirect: 'error' }), a.host.timeoutMs);
    const bytes = await this.responseBytes(response, url, length, a);
    storageRequire(response.status === 200 && response.headers.get('ETag') === etag && bytes.length === length, 'BODY_READ'); return bytes;
  }
  private async json(url: string,
    a: { host: Host; binding: C2bStorageBindingV1; ports: IC2bStorageNativeDependenciesV1 }): Promise<{ value: Record<string, unknown>; bytes: Uint8Array }> {
    const response = await this.deadline(this.client.get(url, SPHttpClient.configurations.v1,
      { headers: { Accept: 'application/json;odata=nometadata' }, redirect: 'error' }), a.host.timeoutMs);
    const bytes = await this.responseBytes(response, url, a.host.metadataResponseBytes, a);
    storageRequire(response.status === 200, 'METADATA_STATUS');
    const value = parseStorageJson(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
    storageRequire(value !== null && typeof value === 'object' && !Array.isArray(value), 'METADATA_OBJECT');
    return { value: value as Record<string, unknown>, bytes };
  }
  private async responseBytes(response: SPHttpClientResponse, url: string, bound: number,
    a: { host: Host; binding: C2bStorageBindingV1; ports: IC2bStorageNativeDependenciesV1 }): Promise<Uint8Array> {
    storageRequire(response.url === url && (response.status < 300 || response.status >= 400), 'REDIRECT');
    // Public SPHttpClientResponse supports arrayBuffer(), not the alpha body/redirected members.
    // Native admission must certify provider bounds and complete-buffer memory. No streaming claim.
    // The observed wire must expose an exact uncompressed length; unsupported representations HOLD.
    const declared = response.headers.get('Content-Length');
    storageRequire(declared !== null && /^(0|[1-9][0-9]*)$/.test(declared), 'RESPONSE_LENGTH_UNAVAILABLE');
    const length = Number(declared); storageInteger(length); storageRequire(length <= bound, 'RESPONSE_BOUND');
    storageRequire(!response.bodyUsed && typeof response.arrayBuffer === 'function', 'COMPLETE_BODY_HOST_UNAVAILABLE');
    const bytes = new Uint8Array(await this.deadline(response.arrayBuffer(), a.host.timeoutMs));
    storageRequire(bytes.length === length && bytes.length <= bound, 'COMPLETE_RESPONSE_LENGTH');
    const headers: [string, string][] = []; response.headers.forEach((v, k) => headers.push([k, v]));
    await a.ports.retainCompleteRawResponse(a.binding, url, response.status, headers, bytes.slice()); return bytes;
  }
  private async deadline<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
    let handle: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([promise, new Promise<T>((_resolve, reject) => {
      handle = setTimeout(() => reject(new Error('C2B_FILE_TIMEOUT_UNKNOWN')), milliseconds);
    })]); } finally { if (handle !== undefined) clearTimeout(handle); }
  }
}
