import { canonicaliseOptionEDraft } from '../models/OptionEWorkplanDraftModels';
import { EXACT_BODY_V4, type V4Authority, type V4NativeRequest, type V4Request,
  type V4Store } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import type { IOptionEDraftSaveSnapshot } from '../components/OptionEDraftSaveController';
import { parseV4Request, parseV4Draft, v4Canonical, v4Equal, v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { validateV4References } from './OptionEWorkplanSubmitExactBodyV4';
import { validateV4SourceDomainBinding, v4InstalledReadiness } from './OptionEWorkplanSubmitExactBodyV4PackageContract';

export type V4ClientSource = Pick<V4Authority, 'draft' | 'references' | 'actor' | 'manager' | 'control'>;
/** Source interface only. No native adapter, credentials, binding issuer or canonical effects ship here. */
export interface IOptionEV4ClientPorts extends Pick<V4Store, 'binding' | 'readOperation' | 'readControl' | 'readReceipt'> {
  readCurrentSource(workplan: string): Promise<V4ClientSource>;
  createImmutableRequest(body: string): Promise<void>;
  readImmutableRequest(key: string): Promise<V4NativeRequest | undefined>;
}
export interface IOptionEV4ClientState {
  phase: 'HOLD' | 'Recording' | 'Processing' | 'Submitted';
  message: string;
  key?: string;
}
const copy = <T,>(value: T): T => JSON.parse(v4Canonical(value)) as T;
const requireThat = (ok: boolean, message: string): void => { if (!ok) throw new Error(message); };
const timestamp = (value: string): boolean => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const withoutEtag = (value: object): object => Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'etag'));
const uuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') throw new Error('A secure submission identifier is unavailable.');
  return globalThis.crypto.randomUUID();
};

export class OptionEWorkplanSubmitExactBodyV4Client {
  private current: IOptionEV4ClientState = { phase: 'HOLD', message: 'Trusted submission ports are unavailable. The Draft remains private.' };
  private frozen?: { source: V4ClientSource; request: V4Request; key: string; native?: V4NativeRequest };
  private pending?: Promise<IOptionEV4ClientState>;
  public constructor(private readonly ports?: IOptionEV4ClientPorts, private readonly command: () => string = uuid) {}
  public state(): IOptionEV4ClientState { return { ...this.current }; }
  /** The unchanged closed source contract has no admitted native loader. Never infer one from ports. */
  public installedAvailable(): boolean {
    const readiness: string = v4InstalledReadiness(this.ports?.binding);
    return readiness === 'ADMITTED';
  }
  private available(): boolean {
    try {
      if (!this.ports) return false;
      validateV4SourceDomainBinding(this.ports.binding);
      return ['readCurrentSource', 'createImmutableRequest', 'readImmutableRequest', 'readOperation', 'readControl', 'readReceipt']
        .every(key => typeof (this.ports as unknown as Record<string, unknown>)[key] === 'function');
    } catch { return false; }
  }
  private hold(message: string): IOptionEV4ClientState {
    this.current = { phase: 'HOLD', message, ...(this.frozen ? { key: this.frozen.key } : {}) };
    return this.state();
  }
  public submit(saved: IOptionEDraftSaveSnapshot): Promise<IOptionEV4ClientState> {
    if (this.pending) return this.pending;
    this.pending = this.perform(saved).finally(() => { this.pending = undefined; });
    return this.pending;
  }
  private async perform(saved: IOptionEDraftSaveSnapshot): Promise<IOptionEV4ClientState> {
    try {
      requireThat(this.available(), 'Trusted request, status and immutable receipt ports are unavailable. The Draft remains private.');
      const record = saved.canonical;
      if (this.frozen) {
        requireThat(!!record && record!.binding.personKey === this.frozen.request.person
          && record!.binding.workplanKey === this.frozen.request.workplan
          && record!.binding.performanceYear === this.frozen.request.year
          && record!.itemId === this.frozen.request.source.itemId
          && record!.etag === this.frozen.request.source.etag && record!.payloadJson === this.frozen.request.source.body,
        'Reopen the retained submission Draft before checking this submission.');
        return await this.refresh();
      }
      requireThat(saved.status === 'Saved' && !!record && !!saved.buffer && !saved.requiresCanonicalReopen
        && !saved.retainedBuffer && canonicaliseOptionEDraft(saved.buffer!) === record!.payloadJson,
      'Save Draft and reopen the current canonical Draft before submitting.');
      const source = copy(await this.ports!.readCurrentSource(record!.binding.workplanKey));
      const reread = copy(await this.ports!.readCurrentSource(record!.binding.workplanKey));
      requireThat(v4Equal(source, reread), 'Current protected Draft source is unavailable or changing.');
      const { actor, manager, control, draft, references } = source;
      requireThat(actor.active === true && manager.active === true && actor.manager === manager.key
        && control.manager === manager.key && actor.key === record!.binding.personKey
        && Number.isSafeInteger(actor.principal) && actor.principal > 0
        && Number.isSafeInteger(manager.principal) && manager.principal > 0 && actor.principal !== manager.principal
        && typeof actor.version === 'string' && !!actor.version
        && typeof manager.version === 'string' && !!manager.version, 'Protected employee or assigned manager principal is unavailable.');
      requireThat(control.workplan === record!.binding.workplanKey && control.person === actor.key
        && control.year === record!.binding.performanceYear && control.draftId === record!.itemId
        && (control.state === 'Draft' || control.state === 'ChangesRequested') && control.transition === 'Ready'
        && !control.command && !control.snapshot && v4Etag(control.etag)
        && Number.isSafeInteger(control.hierarchyEpoch) && control.hierarchyEpoch > 0
        && control.aclEpoch === control.hierarchyEpoch, 'Protected Workplan is not ready for submission.');
      requireThat(draft.itemId === record!.itemId && draft.etag === record!.etag && draft.body === record!.payloadJson
        && v4Etag(draft.etag) && typeof draft.version === 'string' && !!draft.version,
      'The actual current saved Draft version is unavailable or differs from the open Draft.');
      validateV4References(references, parseV4Draft(draft.body), actor.key, control.year);
      const request = parseV4Request(v4Canonical({ capability: EXACT_BODY_V4, action: 'Submit', command: this.command(),
        person: actor.key, year: control.year, workplan: control.workplan, source: draft, referenceBody: v4Canonical(references) }));
      const key = `${request.person}|${request.year}|${request.command}`;
      this.frozen = { source, request, key };
      this.current = { phase: 'Recording', key, message: 'Recording submission request…' };
      // Unique intent is retained even when create response is uncertain; no automatic write retry.
      const existing = await this.ports!.readImmutableRequest(key);
      if (!existing) {
        try { await this.ports!.createImmutableRequest(v4Canonical(request)); } catch { /* Read the same immutable intent below. */ }
      }
      return await this.refresh();
    } catch (error) { return this.hold(error instanceof Error ? error.message : 'Submission could not be confirmed.'); }
  }
  public async refresh(): Promise<IOptionEV4ClientState> {
    try {
      requireThat(this.available() && !!this.frozen, 'Trusted submission readback is unavailable.');
      const frozen = this.frozen!;
      const native = copy(await this.ports!.readImmutableRequest(frozen.key) || null);
      requireThat(!!native && v4Etag(native!.etag) && Number.isSafeInteger(native!.itemId) && native!.itemId > 0
        && typeof native!.version === 'string' && !!native!.version && native!.createdBy === frozen.source.actor.principal
        && native!.body === v4Canonical(frozen.request) && v4Equal(parseV4Request(native!.body), native!.query),
      'The immutable request native readback is unavailable or does not match the retained intent.');
      if (frozen.native) requireThat(v4Equal(frozen.native, native), 'Immutable request identity changed.');
      else frozen.native = native!;
      const [operation, control, receipt] = await Promise.all([
        this.ports!.readOperation(frozen.key), this.ports!.readControl(frozen.request.workplan), this.ports!.readReceipt(frozen.key)
      ]);
      if (operation?.outcome === 'RecoveryHold') return this.hold('Submission needs controlled recovery. No submitted status has been confirmed.');
      if (!operation || operation.outcome !== 'Completed' || operation.checkpoint !== 'Completed') {
        this.current = { phase: 'Processing', key: frozen.key, message: 'Submission request recorded; processing. Check submission again for confirmation.' };
        return this.state();
      }
      const admission = operation.admission;
      requireThat(v4Etag(operation.etag) && admission.key === frozen.key && timestamp(admission.eventAt)
        && v4Equal(admission.authority, { ...frozen.source, request: frozen.native }), 'Operation admission does not match the exact recorded request.');
      const terminalControl = { ...withoutEtag(frozen.source.control), state: 'Submitted', transition: 'Ready',
        snapshot: frozen.key, aclEpoch: frozen.source.control.hierarchyEpoch };
      requireThat(v4Etag(control.etag) && v4Equal(withoutEtag(control), terminalControl), 'Completed operation and protected Workplan do not agree.');
      requireThat(!!receipt && timestamp(receipt!.nativeCreated)
        && Math.abs(Date.parse(receipt!.nativeCreated) - Date.parse(admission.eventAt)) <= 300000
        && v4Equal(receipt, { key: frozen.key, admission, snapshot: { key: frozen.key, admission,
          body: frozen.request.source.body, referencesBody: frozen.request.referenceBody }, nativeCreated: receipt!.nativeCreated }),
      'Completed operation lacks the exact immutable receipt and complete snapshot.');
      const [finalOperation, finalControl, finalReceipt] = await Promise.all([
        this.ports!.readOperation(frozen.key), this.ports!.readControl(frozen.request.workplan), this.ports!.readReceipt(frozen.key)
      ]);
      requireThat(v4Equal(operation, finalOperation) && v4Equal(control, finalControl) && v4Equal(receipt, finalReceipt),
        'Submission readback is changing; confirmation is held.');
      this.current = { phase: 'Submitted', key: frozen.key, message: 'Workplan submitted and confirmed by the exact immutable receipt.' };
      return this.state();
    } catch (error) { return this.hold(error instanceof Error ? error.message : 'Submission status could not be confirmed.'); }
  }
}
