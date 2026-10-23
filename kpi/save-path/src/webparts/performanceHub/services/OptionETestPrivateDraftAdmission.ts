import type { SPHttpClient, SPHttpClientConfiguration } from '@microsoft/sp-http';
import { OPTION_E_DRAFT_V3_SCHEMA_VERSION, type IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
import type { IAnnualWorkplan } from '../models/ProductionModels';
import OptionEDraftSharePointGateway, { OptionEDraftRouteError,
  type IOptionEDraftGateway, type IOptionEDraftCanonicalRecord, type IOptionEProtectedDraftBinding,
  type IOptionEDraftExactUpdate, type IOptionEDraftOpenContext, type OptionEPrivateDraftAggregate } from './OptionEDraftSharePointGateway';
import OptionEProtectedDraftGateway, { optionEProtectedBindingsEqual } from './OptionEProtectedDraftGateway';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './OptionEWorkplanListBindings';
import type { IOptionENativeRoleReadback } from './OptionEWorkplanAclPlan';
import { isExactOptionEPrivateDraftOwnerRole,
  hasExactOptionEPrivateDraftOwnerItemPermissions } from './OptionEPrivateDraftOwnerPermissions';

type Draft = IOptionEWorkplanDraftV3Aggregate;
type Binding = IOptionEProtectedDraftBinding<Draft['schemaVersion']>;
type Canonical = IOptionEDraftCanonicalRecord<Draft>;
const TEST_WEB = 'https://review-tenant.example.invalid/sites/demo-automation';
const TEST_WEB_SERVER = 'https://review-tenant.example.invalid/sites/DEMO-Automation';
/** Only the two observed representations of this exact TEST web are admitted. */
export const isExactTestPrivateDraftWeb = (value: unknown): boolean => value === TEST_WEB || value === TEST_WEB_SERVER;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ETAG = /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]+"$/;
const SAVE_FIELDS = ['ClientSaveID', 'ClientSavedAt', 'DraftPayloadJSON', 'DraftPayloadSHA256'];

/** Reviewed source input only. It is not a grant, a property-pane option or a native clearance. */
export interface IReviewedTestPrivateDraftAdmission {
  webUrl: string;
  webId: string;
  lists: { people: string; workplans: string; drafts: string };
  actor: { principalId: number; loginName: string; email: string; isSiteAdmin: boolean };
  binding: Binding;
  draftUniqueId: string;
  /** Sealed operator receipt for the exact owner-only item assignment; never a parent grant. */
  draftOwnerRole: IOptionENativeRoleReadback;
  reservation: { id: string; notBeforeUtc: string; expiresUtc: string };
  evidence: { authority: string; technical: string; security: string; pointerUniqueness: string; draftOwnerPermission: string };
}

/** Deliberately unbound. Activation requires a later reviewed source change and exact authority. */
export const REVIEWED_TEST_PRIVATE_DRAFT_ADMISSION: IReviewedTestPrivateDraftAdmission | undefined = undefined;

interface ICapability {
  email: string;
  state: 'Loading' | 'Admitted' | 'Checking' | 'Revoked';
  etag?: string;
  editorSession?: object;
  binding: Binding;
  notBefore: number;
  expires: number;
  current(): boolean;
  listeners: Set<() => void>;
  revoke(): void;
  discard(): void;
}
const capabilities = new WeakMap<object, ICapability>();
const editorSessions = new WeakMap<object, { gateway?: object; closed: boolean }>();
const held = (): OptionEDraftRouteError => new OptionEDraftRouteError('DRAFT_UNAVAILABLE',
  'Private Draft Save admission is unavailable or changed. Your unsaved changes remain in this session.');
const email = (value: string): string => value.trim().toLowerCase();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const notifyCapability = (capability: ICapability): void => { capability.listeners.forEach(listener => listener()); };
interface IWriteAttempt { readonly generation: number }
interface IPendingReceipt { readonly owner: IWriteAttempt; readonly request: IOptionEDraftExactUpdate<Draft> }
interface IReadOperation { readonly generation: number; readonly pending?: IPendingReceipt }
interface IWritePermit { readonly owner: IWriteAttempt; readonly receipt: IPendingReceipt; readonly body: string; readonly etag: string }

/** Synchronous identity-owned transitions; no callback or await runs inside a state mutation. */
class AdmissionLifetime {
  private generation = 0;
  private active?: IWriteAttempt;
  private pending?: IPendingReceipt;
  private permit?: IWritePermit;
  public busy(): boolean { return Boolean(this.active || this.pending); }
  public reserve(): IWriteAttempt {
    if (this.busy()) throw held();
    const attempt = Object.freeze({ generation: ++this.generation });
    this.active = attempt; return attempt;
  }
  public owns(attempt: IWriteAttempt): boolean { return this.active === attempt && this.generation === attempt.generation; }
  public ownsReceipt(attempt: IWriteAttempt, receipt: IPendingReceipt): boolean {
    return this.owns(attempt) && this.pending === receipt && receipt.owner === attempt;
  }
  public publish(attempt: IWriteAttempt, request: IOptionEDraftExactUpdate<Draft>): void {
    if (!this.owns(attempt) || this.pending || this.permit) throw held();
    const receipt = Object.freeze({ owner: attempt, request });
    const permit = Object.freeze({ owner: attempt, receipt, etag: request.expectedEtag,
      body: JSON.stringify({ DraftPayloadJSON: request.prepared.payloadJson, DraftPayloadSHA256: request.prepared.payloadSha256,
        ClientSaveID: request.clientSaveId, ClientSavedAt: request.clientSavedAt }) });
    this.pending = receipt; this.permit = permit;
  }
  public consume(): IWritePermit {
    const permit = this.permit; this.permit = undefined;
    if (!permit || !this.ownsReceipt(permit.owner, permit.receipt)) throw held();
    return permit;
  }
  public release(attempt: IWriteAttempt): void {
    if (this.permit?.owner === attempt) this.permit = undefined;
    if (this.active === attempt) this.active = undefined;
    // A dispatched/uncertain receipt survives release until exact readback or discard.
  }
  public beginRead(): IReadOperation {
    if (this.active) throw held();
    return Object.freeze({ generation: this.generation, pending: this.pending });
  }
  public ownsRead(read: IReadOperation): boolean {
    return !this.active && read.generation === this.generation && read.pending === this.pending;
  }
  public finishRead(read: IReadOperation): void {
    if (!this.ownsRead(read)) throw held();
    this.pending = undefined; this.generation += 1;
  }
  public discard(): void {
    this.generation += 1; this.active = undefined; this.permit = undefined; this.pending = undefined;
  }
}

export function subscribeTestPrivateDraftAdmission(gateway: object | undefined, listener: () => void): () => void {
  const capability = gateway && capabilities.get(gateway);
  capability?.listeners.add(listener);
  return () => { capability?.listeners.delete(listener); };
}

/** One mounted editor is one session. Replacing a gateway cannot restart its admission. */
export function bindTestPrivateDraftEditorSession(session: object, gateway: object | undefined): void {
  const previous = editorSessions.get(session), capability = gateway && capabilities.get(gateway);
  if (previous?.closed || capability?.editorSession && capability.editorSession !== session) {
    capability?.discard(); return;
  }
  if (previous && previous.gateway !== gateway) {
    const oldCapability = previous.gateway && capabilities.get(previous.gateway);
    if (oldCapability || capability) {
      oldCapability?.discard(); capability?.discard(); previous.closed = true; return;
    }
  }
  editorSessions.set(session, { gateway, closed: false });
  if (capability) capability.editorSession = session;
}

/** Closing discards capability, not backend data. A new editor needs a new gateway. */
export function closeTestPrivateDraftEditorSession(session: object): void {
  const current = editorSessions.get(session);
  if (current) {
    current.closed = true;
    if (current.gateway) capabilities.get(current.gateway)?.discard();
  }
}

/** Read routing only, before canonical qualification; never grants Save or changes business configuration. */
export function nativePreparedTestDraftYear(gateway: object | undefined, actorEmail: string): number | undefined {
  const capability = gateway && capabilities.get(gateway);
  return capability && capability.current() && capability.email === email(actorEmail)
    && capability.binding.performanceYear === 2027 ? capability.binding.performanceYear : undefined;
}

/** Branding and current canonical pairing are both required; a boolean or lookalike cannot enable Save. */
export function isAdmittedTestPrivateDraft(gateway: object | undefined, actorEmail: string,
  header: IAnnualWorkplan | undefined, canonical: IOptionEDraftCanonicalRecord<OptionEPrivateDraftAggregate> | undefined): boolean {
  const capability = gateway && capabilities.get(gateway);
  if (!capability || Date.now() < capability.notBefore || Date.now() >= capability.expires || capability.state !== 'Admitted'
    || capability.email !== email(actorEmail) || !header || !canonical) return false;
  const binding = capability.binding;
  return optionEProtectedBindingsEqual(binding, canonical.binding) && canonical.etag === capability.etag
    && canonical.itemId === binding.draftItemId && header.id === binding.workplanItemId
    && header.workplanKey === binding.workplanKey && header.personKey === binding.personKey
    && header.performanceYear === binding.performanceYear && header.etag === binding.workplanEtag
    && header.rowVersionToken === binding.rowVersionToken && header.state === binding.state
    && header.transitionStatus === 'Ready' && typeof header.employeeEmail === 'string'
    && header.employeeEmail.trim().toLowerCase() === capability.email;
}

/** A changed UI actor/header cannot later regain this lease by switching back. */
export function observeTestPrivateDraftUiScope(gateway: object | undefined, actorEmail: string,
  header: IAnnualWorkplan | undefined): void {
  const capability = gateway && capabilities.get(gateway);
  if (!capability) return;
  const binding = capability.binding;
  if (email(actorEmail) !== capability.email || header && (header.id !== binding.workplanItemId
    || header.workplanKey !== binding.workplanKey || header.personKey !== binding.personKey
    || typeof header.employeeEmail !== 'string' || header.employeeEmail.trim().toLowerCase() !== capability.email || header.performanceYear !== binding.performanceYear
    || header.etag !== binding.workplanEtag || header.rowVersionToken !== binding.rowVersionToken
    || header.state !== binding.state || header.transitionStatus !== 'Ready')) capability.revoke();
}

/** This factory is used only by governed source composition. No caller-supplied transport is exposed. */
export function createTestPrivateDraftAdmission(client: SPHttpClient, webUrl: string, actorEmail: string,
  configuration: SPHttpClientConfiguration,
  reviewed: IReviewedTestPrivateDraftAdmission | undefined = REVIEWED_TEST_PRIVATE_DRAFT_ADMISSION
): IOptionEDraftGateway<Draft> | undefined {
  if (!reviewed) return undefined;
  // Capture the reviewed tuple. Later object mutation cannot renew or redirect this capability.
  let scope: IReviewedTestPrivateDraftAdmission;
  try { scope = clone(reviewed); } catch { return undefined; }
  if (!scope || !scope.actor || !scope.binding || !scope.lists || !scope.reservation || !scope.evidence
    || typeof actorEmail !== 'string' || typeof scope.actor.email !== 'string' || typeof scope.binding.email !== 'string'
    || typeof scope.reservation.id !== 'string') return undefined;
  const start = Date.parse(scope.reservation.notBeforeUtc), expiry = Date.parse(scope.reservation.expiresUtc);
  const valid = isExactTestPrivateDraftWeb(webUrl) && isExactTestPrivateDraftWeb(scope.webUrl) && email(actorEmail) === scope.actor.email
    && scope.actor.email === email(scope.binding.email) && scope.binding.email === email(scope.binding.email)
    && Number.isSafeInteger(scope.actor.principalId) && scope.actor.principalId > 0
    && typeof scope.actor.loginName === 'string' && Boolean(scope.actor.loginName.trim())
    && scope.actor.isSiteAdmin === false && GUID.test(scope.webId) && GUID.test(scope.draftUniqueId)
    && isExactOptionEPrivateDraftOwnerRole(scope.draftOwnerRole)
    && Object.keys(scope.lists).sort().join(',') === 'drafts,people,workplans'
    && Object.values(scope.lists).every(value => GUID.test(value)) && new Set(Object.values(scope.lists)).size === 3
    && GUID.test(scope.binding.peopleUniqueId) && GUID.test(scope.binding.workplanUniqueId)
    && [scope.binding.peopleItemId, scope.binding.workplanItemId, scope.binding.draftItemId].every(value => Number.isSafeInteger(value) && value > 0)
    && Number.isSafeInteger(scope.binding.performanceYear) && scope.binding.performanceYear >= 1000 && scope.binding.performanceYear <= 9999
    && typeof scope.binding.personKey === 'string' && Boolean(scope.binding.personKey.trim())
    && scope.binding.workplanKey === `${scope.binding.personKey}|${scope.binding.performanceYear}`
    && scope.binding.draftSchemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION
    && (scope.binding.state === 'Draft' || scope.binding.state === 'ChangesRequested')
    && scope.binding.transitionStatus === 'Ready' && scope.binding.pendingRequestKey === ''
    && Number.isSafeInteger(scope.binding.rowVersionToken) && scope.binding.rowVersionToken >= 0
    && ETAG.test(scope.binding.workplanEtag)
    && Boolean(scope.reservation.id.trim()) && Number.isFinite(start) && Number.isFinite(expiry) && start < expiry
    && Object.keys(scope.evidence).sort().join(',') === 'authority,draftOwnerPermission,pointerUniqueness,security,technical'
    && Object.values(scope.evidence).every(value => typeof value === 'string' && Boolean(value.trim()));
  if (!valid) return undefined;

  let lastClock = Date.now(), discarded = false;
  const lifetime = new AdmissionLifetime();
  const capability: ICapability = { email: scope.actor.email, state: 'Loading',
    binding: scope.binding, notBefore: start, expires: expiry, listeners: new Set(),
    revoke: () => { if (capability.state !== 'Revoked') { capability.state = 'Revoked'; notifyCapability(capability); } },
    discard: () => { discarded = true; lifetime.discard(); capability.revoke(); },
    current: () => {
      const now = Date.now();
      if (now < lastClock || now < start || now >= expiry) capability.revoke();
      lastClock = now;
      return capability.state !== 'Revoked';
    } };
  if (!capability.current()) return undefined;
  // A timer only revokes. It never renews a reservation or performs a native request.
  const timer = setTimeout(() => capability.revoke(), Math.min(expiry - lastClock, 2147483647));
  capability.listeners.add(() => { if (capability.state === 'Revoked') clearTimeout(timer); });
  const listUrl = (title: string): string => `${TEST_WEB}/_api/web/lists/getbytitle('${title}')`;
  const draftUrl = `${listUrl('DEMOAPP_WorkplanDrafts')}/items(${scope.binding.draftItemId})`;
  const readJson = async (url: string): Promise<Record<string, unknown>> => {
    const response = await client.get(url, configuration, { headers: { Accept: 'application/json;odata.metadata=none' } });
    if (!response.ok) throw held();
    return await response.json() as Record<string, unknown>;
  };
  const metadata = async (): Promise<void> => {
    const web = await readJson(`${TEST_WEB}/_api/web?$select=Id,Url`);
    const actor = await readJson(`${TEST_WEB}/_api/web/currentuser?$select=Id,LoginName,Email,IsSiteAdmin`);
    if (web.Id !== scope.webId || !isExactTestPrivateDraftWeb(web.Url) || actor.Id !== scope.actor.principalId
      || actor.LoginName !== scope.actor.loginName || actor.Email !== scope.actor.email || actor.IsSiteAdmin !== scope.actor.isSiteAdmin) throw held();
    for (const [title, id] of [['DEMOAPP_People', scope.lists.people], ['DEMOAPP_Workplans', scope.lists.workplans], ['DEMOAPP_WorkplanDrafts', scope.lists.drafts]]) {
      const list = await readJson(`${listUrl(title)}?$select=Id`);
      if (list.Id !== id) throw held();
    }
    // Query the mandatory pointer field on the exact GUID-verified Workplans list.
    // An evidence reference or a currently unique row is not server uniqueness.
    const pointer = await readJson(`${TEST_WEB}/_api/web/lists(guid'${scope.lists.workplans}')/fields/getbyinternalnameortitle('DraftItemId')?$select=InternalName,TypeAsString,MaxLength,Indexed,EnforceUniqueValues`);
    const pointerValue = (name: string): unknown => {
      const descriptor = Object.getOwnPropertyDescriptor(pointer, name);
      return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value as unknown : undefined;
    };
    if (pointerValue('InternalName') !== 'DraftItemId' || pointerValue('TypeAsString') !== 'Text' || pointerValue('MaxLength') !== 20
      || pointerValue('Indexed') !== true || pointerValue('EnforceUniqueValues') !== true) throw held();
    const fields = await readJson(`${listUrl('DEMOAPP_WorkplanDrafts')}/fields?$select=InternalName,TypeAsString,MaxLength,RichText&$filter=${encodeURIComponent(SAVE_FIELDS.map(name => `InternalName eq '${name}'`).join(' or '))}`);
    const rows = fields.value as Record<string, unknown>[] | undefined;
    if (!Array.isArray(rows) || rows.length !== 4 || new Set(rows.map(row => row.InternalName)).size !== 4
      || rows.some(row => row.InternalName === 'DraftPayloadJSON' ? row.TypeAsString !== 'Note' || row.RichText !== false
        : row.InternalName === 'DraftPayloadSHA256' || row.InternalName === 'ClientSaveID'
          ? row.TypeAsString !== 'Text' || row.MaxLength !== 64
          : row.InternalName !== 'ClientSavedAt' || row.TypeAsString !== 'DateTime')) throw held();
    // Current-user permissions at this exact item, never a web/list permission substitute.
    // The operator's reviewed evidence must separately prove complete item assignments,
    // parent traversal/common access and unrelated-user denial; this read cannot do that.
    const draft = await readJson(`${draftUrl}?$select=Id,UniqueId,HasUniqueRoleAssignments,EffectiveBasePermissions`);
    if (!hasExactOptionEPrivateDraftOwnerItemPermissions(draft, scope.binding.draftItemId, scope.draftUniqueId)) throw held();
  };
  const scopedTransport: Pick<SPHttpClient, 'get' | 'post'> = {
    get: (...args: Parameters<SPHttpClient['get']>) => client.get(...args), post: async () => { throw held(); }
  };
  const scopedClient = scopedTransport as SPHttpClient;
  const store = new OptionEDraftSharePointGateway<Draft>(scopedClient, TEST_WEB, OPTION_E_WORKPLAN_LIST_BINDINGS,
    configuration, undefined, OPTION_E_DRAFT_V3_SCHEMA_VERSION);
  const protectedGateway = new OptionEProtectedDraftGateway<Draft>(scopedClient, TEST_WEB, scope.actor.email,
    OPTION_E_WORKPLAN_LIST_BINDINGS, configuration, store, OPTION_E_DRAFT_V3_SCHEMA_VERSION);
  const assertIdentity = (record: Canonical): void => {
    if (!optionEProtectedBindingsEqual(record.binding, scope.binding) || record.itemId !== scope.binding.draftItemId
      || record.aggregate.schemaVersion !== OPTION_E_DRAFT_V3_SCHEMA_VERSION || !ETAG.test(record.etag)) throw held();
  };
  const assertCanonical = (record: Canonical): void => {
    assertIdentity(record);
    if (!capability.etag || record.etag !== capability.etag) throw held();
  };
  const gateway: IOptionEDraftGateway<Draft> = Object.freeze({
    prepare: (aggregate: Draft) => protectedGateway.prepare(aggregate),
    read: async (context: IOptionEDraftOpenContext, expected?: Readonly<Binding>): Promise<Canonical> => {
      const operation = lifetime.beginRead();
      try {
        if (context.performanceYear !== scope.binding.performanceYear
          || expected && !optionEProtectedBindingsEqual(expected, scope.binding)) throw held();
        if (!capability.current() && !operation.pending) throw held();
        await metadata();
        if (!lifetime.ownsRead(operation)) throw held();
        const record = await protectedGateway.read(context, scope.binding);
        if (discarded || !lifetime.ownsRead(operation)) throw held();
        if (operation.pending) {
          const pending = operation.pending.request;
          // Only this dispatched Save may account for an ETag change. A failed or uncertain
          // dispatch may be reconciled for truthful receipt, but can never renew capability.
          if (!optionEProtectedBindingsEqual(record.binding, scope.binding) || record.itemId !== scope.binding.draftItemId
            || !ETAG.test(record.etag) || record.etag === capability.etag
            || record.payloadJson !== pending.prepared.payloadJson || record.payloadSha256 !== pending.prepared.payloadSha256
            || record.clientSaveId !== pending.clientSaveId || record.clientSavedAt !== pending.clientSavedAt) throw held();
          if (capability.current() && capability.state === 'Checking') {
            capability.etag = record.etag; capability.state = 'Admitted'; notifyCapability(capability);
          }
        } else {
          // Initial admission is a one-way state transition. A failed/revoked/loaded
          // session can never acquire a different baseline by calling read again.
          assertIdentity(record);
          if (!capability.current()) throw held();
          if (capability.state === 'Loading' && capability.etag === undefined) capability.etag = record.etag;
          else assertCanonical(record);
          capability.state = 'Admitted'; notifyCapability(capability);
        }
        lifetime.finishRead(operation);
        return record;
      } catch (error) { if (lifetime.ownsRead(operation)) capability.revoke(); throw error; }
    },
    updateExact: async (request: IOptionEDraftExactUpdate<Draft>): Promise<void> => {
      if (lifetime.busy() || !capability.current() || capability.state !== 'Admitted') throw held();
      const attempt = lifetime.reserve();
      try {
        for (const key of ['clientSaveId', 'clientSavedAt']) {
          const descriptor = Object.getOwnPropertyDescriptor(request, key);
          if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || typeof descriptor.value !== 'string') throw held();
        }
        const captured = clone(request);
        if (captured.context.performanceYear !== scope.binding.performanceYear || captured.itemId !== scope.binding.draftItemId
          || captured.expectedEtag !== capability.etag || !optionEProtectedBindingsEqual(captured.expectedBinding, scope.binding)) throw held();
        await metadata();
        if (!lifetime.owns(attempt) || !capability.current() || discarded) throw held();
        assertCanonical(await protectedGateway.read(captured.context, scope.binding));
        if (!lifetime.owns(attempt) || !capability.current() || discarded || capability.state !== 'Admitted'
          || captured.expectedEtag !== capability.etag || !optionEProtectedBindingsEqual(captured.expectedBinding, scope.binding)) throw held();
        lifetime.publish(attempt, captured);
        await protectedGateway.updateExact(captured);
      } catch (error) { if (lifetime.owns(attempt)) capability.revoke(); throw error; }
      finally { lifetime.release(attempt); }
    }
  });
  // Deny-first construction ends only after every real dependency and public identity exists.
  scopedTransport.post = async (...args: Parameters<SPHttpClient['post']>) => {
    const [url, suppliedConfiguration, options] = args;
    const admitted = lifetime.consume(), attempt = admitted.receipt.request, session = capability.editorSession;
    const headers = options?.headers as Record<string, string> | undefined;
    if (!lifetime.ownsReceipt(admitted.owner, admitted.receipt) || !capability.current() || url !== draftUrl || suppliedConfiguration !== configuration
      || !headers || Object.keys(headers).sort().join(',') !== 'Accept,Content-Type,IF-MATCH,X-HTTP-Method'
      || headers['X-HTTP-Method'] !== 'MERGE' || headers['IF-MATCH'] !== admitted.etag || !ETAG.test(headers['IF-MATCH'])
      || headers.Accept !== 'application/json;odata.metadata=none' || headers['Content-Type'] !== 'application/json;odata.metadata=none'
      || options?.body !== admitted.body || Object.keys(JSON.parse(admitted.body)).sort().join(',') !== SAVE_FIELDS.join(',')) throw held();
    await metadata();
    if (!lifetime.ownsReceipt(admitted.owner, admitted.receipt) || !capability.current() || discarded) throw held();
    const fresh = await protectedGateway.read({ performanceYear: scope.binding.performanceYear }, scope.binding);
    assertCanonical(fresh);
    if (!lifetime.ownsReceipt(admitted.owner, admitted.receipt) || !capability.current() || discarded) throw held();
    capability.state = 'Checking'; notifyCapability(capability);
    // Notification is synchronous and may close/revoke/rebind this editor. Nothing
    // observed before that callback supplies permission to dispatch afterwards.
    const currentSession = session && editorSessions.get(session);
    if (!capability.current() || discarded || !lifetime.ownsReceipt(admitted.owner, admitted.receipt) || capability.state !== 'Checking'
      || attempt.expectedEtag !== admitted.etag || capability.etag !== admitted.etag
      || !session || capability.editorSession !== session || !currentSession
      || currentSession.closed || currentSession.gateway !== gateway) throw held();
    return client.post(url, configuration, { headers: { ...headers }, body: admitted.body });
  };
  capabilities.set(gateway, capability);
  return gateway;
}
