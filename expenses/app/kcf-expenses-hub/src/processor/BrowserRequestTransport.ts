import { readBoundedBody } from '../services/persistence/BoundedBody';
import { own, positiveId } from '../services/persistence/PersistenceValidation';
import { copyRequestEnvelope, decodeRequest } from '../services/persistence/RequestLedgerExpensePort';
import { createImmutableRequestFile, TEST_SITE } from './SharePointStandardPlans';
import type { IStandardRestPlan } from './SharePointStandardPlans';
import type { IStandardStoreTransport, IStandardTransportResponse } from './StandardStoreTransport';

/** Deployment-owned qualification, never form/query-string/web-part properties.
 * These identifiers do not prove schema, actor rights, licence or raw ACLs. */
export interface IRequestTransportBinding {
  readonly requestRoot: string;
  readonly requestListId: string; readonly expenseListId: string;
  readonly readListIds: readonly string[];
}
/** Supported browser/SPFx capabilities; injection is for source composition and
 * deterministic tests, not user configuration or an approval Boolean. */
export interface IRequestBrowserPlatform {
  currentUrl(): string;
  webAbsoluteUrl(): string;
  fetch(url: string, options: RequestInit): Promise<Response>;
  fetchDigest(webUrl: string): Promise<string>;
}
const json = 'application/json;odata=nometadata';
const currentActor = TEST_SITE + '/_api/web/currentuser?$select=Id,IsSiteAdmin';
const guid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(v);
async function discard(r: Response | undefined): Promise<void> {
  try { if (r?.bodyUsed === false) await r.body?.cancel(); } catch { /* Private. */ }
}

/** Authenticated caller transport, never the processor's service connection.
 * The only permitted business write is a complete immutable request file in
 * the already-qualified caller folder. No expense/ledger/receipt/ACL mutation.
 * Actual server Author and raw SharePoint ACLs remain authoritative. */
export class BrowserRequestTransport implements IStandardStoreTransport {
  private readonly binding: IRequestTransportBinding;
  private readonly dispatched = new Set<string>();
  private sessionActor: number | undefined;
  private identityInvalid = false;
  private assertActor(actor: number): void {
    if (this.identityInvalid || this.sessionActor !== actor) throw new Error('ACTOR_CHANGED');
  }
  public constructor(private readonly platform: IRequestBrowserPlatform, binding: IRequestTransportBinding) {
    const b = own(binding, ['requestRoot', 'requestListId', 'expenseListId', 'readListIds']);
    if (typeof b.requestRoot !== 'string' || !/^\/sites\/REVIEW-TEST-SITE\/[A-Za-z0-9 _-]+$/.test(b.requestRoot) ||
        !guid(b.requestListId) || !guid(b.expenseListId) ||
        !Array.isArray(b.readListIds) || b.readListIds.length !== 8 || !b.readListIds.every(guid) ||
        new Set(b.readListIds.map(v => (v as string).toLowerCase())).size !== 8 ||
        !b.readListIds.includes(b.requestListId) || !b.readListIds.includes(b.expenseListId) || b.requestListId === b.expenseListId) {
      throw new Error('REQUEST_BINDING_HELD');
    }
    this.binding = Object.freeze({ requestRoot: b.requestRoot,
      requestListId: b.requestListId, expenseListId: b.expenseListId, readListIds: Object.freeze([...b.readListIds] as string[]) });
  }
  private context(): void {
    const current = new URL(this.platform.currentUrl()), fixed = new URL(TEST_SITE);
    if (this.platform.webAbsoluteUrl() !== TEST_SITE || current.origin !== fixed.origin || current.username || current.password ||
        (current.pathname !== fixed.pathname && !current.pathname.startsWith(fixed.pathname + '/'))) throw new Error('REQUEST_CONTEXT_HELD');
  }
  private allowRead(url: string): void {
    if (url === TEST_SITE + '/_api/web/currentuser?$select=Id' || url === currentActor) return;
    const u = new URL(url), rest = url.slice(TEST_SITE.length);
    const match = /^\/_api\/web\/lists\(guid'([a-f0-9-]+)'\)\/items(?:\(([1-9]\d*)\))?(.*)$/i.exec(u.pathname.slice(new URL(TEST_SITE).pathname.length));
    if (!rest.startsWith('/_api/web/lists(') || !match || !this.binding.readListIds.includes(match[1])) throw new Error('READ_DESTINATION_HELD');
    const suffix = match[3];
    if (suffix !== '' && !(match[2] && match[1] === this.binding.requestListId && suffix === '/File/$value') &&
        !(match[2] && match[1] === this.binding.expenseListId && (suffix === '/AttachmentFiles' ||
          /^\/AttachmentFiles\/getByFileName\('[\w%() -]+\.(png|jpe?g|pdf)'\)\/\$value$/i.test(suffix)))) throw new Error('READ_DESTINATION_HELD');
    const keys: string[] = []; u.searchParams.forEach((_v, k) => keys.push(k));
    if (new Set(keys).size !== keys.length || keys.some(k => !['$select', '$filter', '$expand', '$top'].includes(k)) ||
        (!match[2] && (!/^[1-9]\d{0,2}$/.test(u.searchParams.get('$top') || '') || Number(u.searchParams.get('$top')) > 201))) throw new Error('READ_QUERY_HELD');
  }
  private async fetch(url: string, options: RequestInit): Promise<Response> {
    this.context();
    const r = await this.platform.fetch(url, { ...options, credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store' });
    if (r.url !== url || r.redirected !== false) { await discard(r); throw new Error('REQUEST_DESTINATION_HELD'); }
    return r;
  }
  private async checkActor(): Promise<number> {
    let r: Response | undefined;
    try {
      r = await this.fetch(currentActor, { method: 'GET', headers: { Accept: json, 'OData-Version': '' } });
      if (r.status !== 200) throw new Error('ACTOR_HELD');
      const body = await readBoundedBody(r.body, 65536);
      if (!body.ok) throw new Error('ACTOR_HELD');
      const actor: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.bytes));
      const actorId: unknown = actor && typeof actor === 'object' ? Object.getOwnPropertyDescriptor(actor, 'Id')?.value : undefined;
      if (!actor || typeof actor !== 'object' || Array.isArray(actor) || !positiveId(actorId) || actorId > 2147483647) throw new Error('ACTOR_HELD');
      // A different authenticated identity invalidates the retained session
      // even when that identity is subsequently refused as an administrator.
      if (this.identityInvalid || (this.sessionActor !== undefined && this.sessionActor !== actorId)) {
        this.identityInvalid = true; throw new Error('ACTOR_CHANGED');
      }
      if (Object.getOwnPropertyDescriptor(actor, 'IsSiteAdmin')?.value !== false) throw new Error('ACTOR_HELD');
      this.sessionActor = actorId; return actorId;
    } finally { await discard(r); }
  }
  public async send(input: IStandardRestPlan): Promise<IStandardTransportResponse> {
    let response: Response | undefined;
    try {
      const p = own(input, Object.prototype.hasOwnProperty.call(input, 'body') ? ['method', 'url', 'headers', 'retry', 'body'] : ['method', 'url', 'headers', 'retry']);
      if (p.retry !== 'none' || typeof p.url !== 'string' || !p.url.startsWith(TEST_SITE + '/_api/web/') ||
          /[\r\n#]/.test(p.url) || new URL(p.url).href !== p.url) throw new Error('REQUEST_PLAN_HELD');
      const url = p.url;
      const hs = Object.getOwnPropertyDescriptors(p.headers);
      if (Reflect.ownKeys(hs).some(k => typeof k !== 'string' || !['Accept', 'Content-Type', 'Cache-Control'].includes(k) ||
          !Object.prototype.hasOwnProperty.call(hs[k], 'value')) ||
          (hs.Accept && hs.Accept.value !== json) || (hs['Cache-Control'] && hs['Cache-Control'].value !== 'no-store') ||
          (hs['Content-Type'] && ![json, 'application/octet-stream'].includes(hs['Content-Type'].value))) throw new Error('REQUEST_HEADERS_HELD');
      const headers: Record<string, string> = { Accept: json, 'OData-Version': '' };
      let bytes: Uint8Array | undefined;
      let requestActor: number | undefined;
      if (p.method === 'GET' && !Object.prototype.hasOwnProperty.call(p, 'body')) this.allowRead(url);
      else if (p.method === 'POST') {
        bytes = copyRequestEnvelope(p.body); const request = decodeRequest(bytes);
        const pathMatch = /GetFolderByServerRelativePath\(decodedurl='([^']+)'\)/.exec(decodeURIComponent(url));
        const candidate = pathMatch?.[1].slice(pathMatch[1].lastIndexOf('/') + 1);
        if (!candidate || !/^[1-9]\d{0,9}$/.test(candidate) || Number(candidate) > 2147483647 ||
            url !== new URL(createImmutableRequestFile(`${this.binding.requestRoot}/${candidate}`, request.command.operationId, bytes).url).href ||
            hs['Content-Type']?.value !== 'application/octet-stream') throw new Error('REQUEST_WRITE_HELD');
        // Actor is read from this authenticated session, never a deployment's
        // test claimant, request body, URL parameter or caller-supplied identity.
        this.context(); const actor = await this.checkActor();
        const exact = createImmutableRequestFile(`${this.binding.requestRoot}/${actor}`, request.command.operationId, bytes);
        if (url !== new URL(exact.url).href || hs['Content-Type']?.value !== 'application/octet-stream') throw new Error('REQUEST_WRITE_HELD');
        // Public SPFx DigestCache manages contextinfo internally. Its response
        // buffering/redirect policy is not covered by our business-body bound.
        const digest = await this.platform.fetchDigest(TEST_SITE);
        if (typeof digest !== 'string' || !digest.trim() || digest.length > 8192 || /[^\x20-\x7e]/.test(digest)) throw new Error('DIGEST_HELD');
        this.context();
        if (await this.checkActor() !== actor) throw new Error('ACTOR_CHANGED');
        this.assertActor(actor);
        if (this.dispatched.has(url)) throw new Error('REQUEST_ALREADY_DISPATCHED');
        this.dispatched.add(url); // Never replay a possibly committed upload.
        requestActor = actor;
        headers['Content-Type'] = 'application/octet-stream'; headers['X-RequestDigest'] = digest;
      } else throw new Error('REQUEST_METHOD_HELD');
      // No await between this session check and dispatch. A concurrent caller
      // may have invalidated the session while the final identity read settled.
      if (requestActor !== undefined) this.assertActor(requestActor);
      response = await this.fetch(url, { method: p.method as 'GET' | 'POST', headers, ...(bytes ? { body: bytes.buffer as ArrayBuffer } : {}) });
      if (requestActor !== undefined) this.assertActor(requestActor);
      if (response.status === 204 || response.status < 200 || response.status >= 300) await discard(response);
      return { status: response.status, url: response.url, redirected: response.redirected, etag: response.headers.get('ETag') || undefined,
        body: response.body };
    } catch { await discard(response); throw new Error('REQUEST_TRANSPORT_UNAVAILABLE'); }
  }
}
