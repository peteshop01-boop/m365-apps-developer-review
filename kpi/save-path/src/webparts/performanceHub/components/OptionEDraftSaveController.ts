import { OPTION_E_DRAFT_SCHEMA_VERSION, assertOptionEPartialDraftWritable, canonicaliseOptionEPartialDraft, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import {
  OptionEDraftAmbiguousWriteError,
  OptionEDraftConflictError,
  OptionEDraftRouteError,
  type IOptionEDraftCanonicalRecord,
  type IOptionEDraftGateway,
  type IOptionEDraftOpenContext,
  canonicalisePrivateDraftForSchema,
  type OptionEDraftPrepared,
  type OptionEPrivateDraftAggregate
} from '../services/OptionEDraftSharePointGateway';

export type OptionEDraftSaveStatus =
  | 'Idle'
  | 'Loading'
  | 'Unsaved'
  | 'Saving'
  | 'Checking'
  | 'Saved'
  | 'Conflict'
  | 'NotSaved';

export interface IOptionEDraftSaveSnapshot<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> {
  status: OptionEDraftSaveStatus;
  visibleStatus: string;
  context?: IOptionEDraftOpenContext;
  canonical?: IOptionEDraftCanonicalRecord<T>;
  buffer?: T;
  retainedBuffer: boolean;
  canResolveConflict: boolean;
  requiresCanonicalReopen: boolean;
  detail?: string;
}

type Listener<T extends OptionEPrivateDraftAggregate> = (snapshot: IOptionEDraftSaveSnapshot<T>) => void;
type UuidFactory = () => string;
type NowFactory = () => Date;

interface IOptionEDraftSubmittedBuffer<T extends OptionEPrivateDraftAggregate> {
  buffer: T;
  generation: number;
  fingerprint: string;
}

const cloneAggregate = <T extends OptionEPrivateDraftAggregate>(value: T): T => JSON.parse(JSON.stringify(value)) as T;


/** Observers and gateway-owned records must not mutate retained Save state or its checked binding. */
const cloneSnapshot = <T extends OptionEPrivateDraftAggregate>(snapshot: IOptionEDraftSaveSnapshot<T>): IOptionEDraftSaveSnapshot<T> => ({
  ...snapshot,
  context: snapshot.context ? { ...snapshot.context } : undefined,
  canonical: snapshot.canonical ? { ...snapshot.canonical, binding: { ...snapshot.canonical.binding },
    aggregate: cloneAggregate(snapshot.canonical.aggregate) } : undefined,
  buffer: snapshot.buffer ? cloneAggregate(snapshot.buffer) : undefined
});

const defaultUuid: UuidFactory = () => {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('A secure client save identifier is unavailable. The Draft was not saved.');
  }
  return globalThis.crypto.randomUUID();
};

const savedLabel = (record: IOptionEDraftCanonicalRecord<OptionEPrivateDraftAggregate>): string => {
  const timestamp = record.clientSavedAt || record.modified;
  return timestamp ? `Saved ${new Date(timestamp).toLocaleString('en-GB')}` : 'Saved (canonical Draft loaded)';
};

const visibleStatus = (status: OptionEDraftSaveStatus, record?: IOptionEDraftCanonicalRecord<OptionEPrivateDraftAggregate>): string => {
  if (status === 'Loading') return 'Loading Draft…';
  if (status === 'Unsaved') return 'Unsaved';
  if (status === 'Saving') return 'Saving…';
  if (status === 'Checking') return 'Checking save…';
  if (status === 'Saved' && record) return savedLabel(record);
  if (status === 'Conflict') return 'Conflict — your changes are retained';
  if (status === 'NotSaved') return 'Not saved — your changes are retained';
  return 'Draft Save unavailable';
};

export class OptionEDraftSaveController<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> {
  private readonly listeners = new Set<Listener<T>>();
  private bufferGeneration = 0;
  private unserializableChanges?: string;
  private saveInFlight?: Promise<IOptionEDraftSaveSnapshot<T>>;
  private loadSequence = 0;
  private loadInFlight?: number;
  private snapshotValue: IOptionEDraftSaveSnapshot<T> = {
    status: 'Idle', visibleStatus: visibleStatus('Idle'), retainedBuffer: false,
    canResolveConflict: false, requiresCanonicalReopen: false
  };

  public constructor(
    private readonly gateway: IOptionEDraftGateway<T>,
    private readonly uuid: UuidFactory = defaultUuid,
    private readonly now: NowFactory = () => new Date(),
    public readonly schemaVersion: T['schemaVersion'] = OPTION_E_DRAFT_SCHEMA_VERSION as T['schemaVersion']
  ) {}

  public get snapshot(): IOptionEDraftSaveSnapshot<T> { return cloneSnapshot(this.snapshotValue); }

  public subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    this.notify(listener);
    return () => this.listeners.delete(listener);
  }

  public async open(context: IOptionEDraftOpenContext): Promise<T> {
    if (this.saveInFlight) throw new Error('A protected Save is in progress. Wait before opening another Draft.');
    const request = ++this.loadSequence;
    this.loadInFlight = request;
    const generation = this.bufferGeneration;
    context = { performanceYear: context.performanceYear };
    this.unserializableChanges = undefined;
    this.publish({ status: 'Loading', visibleStatus: visibleStatus('Loading'), context,
      retainedBuffer: false, canResolveConflict: false, requiresCanonicalReopen: false });
    try {
      const canonical = await this.gateway.read(context);
      if (this.loadInFlight !== request) throw new Error('This Draft open was superseded by a newer request.');
      const buffer = this.completeLoad(context, canonical, generation);
      if (!buffer) throw new Error('Newer session changes are retained. The older Draft was not applied to the editor.');
      return buffer;
    } catch (error) {
      if (this.loadInFlight !== request) throw error;
      this.publish({ ...this.snapshotValue, status: 'NotSaved', visibleStatus: visibleStatus('NotSaved'), context,
        retainedBuffer: this.snapshotValue.retainedBuffer, canResolveConflict: false, requiresCanonicalReopen: true,
        detail: error instanceof Error ? error.message : 'The canonical Draft could not be loaded.' });
      throw error;
    } finally {
      if (this.loadInFlight === request) this.loadInFlight = undefined;
    }
  }

  public replaceBuffer(buffer: T): void {
    const current = this.snapshotValue;
    const retained = cloneAggregate(buffer);
    this.unserializableChanges = undefined;
    this.bufferGeneration += 1;
    this.publish({ ...current, status: 'Unsaved', visibleStatus: visibleStatus('Unsaved'),
      buffer: retained, retainedBuffer: true, canResolveConflict: false,
      detail: current.canonical ? undefined : 'Save is unavailable until the canonical protected Draft is opened.' });
  }

  /** The editor still owns the changes; an older serializable buffer must not be saved in their place. */
  public holdUnserializableChanges(detail: string): void {
    this.unserializableChanges = detail;
    this.bufferGeneration += 1;
    this.publish({ ...this.snapshotValue, status: 'NotSaved', visibleStatus: visibleStatus('NotSaved'),
      buffer: undefined, retainedBuffer: true, canResolveConflict: false, detail });
  }

  /** Treat repeated Save clicks as the same attempt until canonical readback settles.
   * Any edits made during that attempt stay unsaved until a subsequent explicit Save.
   */
  public save(): Promise<IOptionEDraftSaveSnapshot<T>> {
    if (this.saveInFlight) return this.saveInFlight;
    if (this.loadInFlight !== undefined) {
      this.publish({ ...this.snapshotValue, status: 'NotSaved', visibleStatus: visibleStatus('NotSaved'),
        detail: 'Wait for the canonical Draft to finish loading before Save.' });
      return Promise.resolve(this.snapshot);
    }
    // Install the barrier before publishing, while capturing the clicked buffer synchronously.
    let resolveAttempt!: (snapshot: IOptionEDraftSaveSnapshot<T>) => void;
    let rejectAttempt!: (reason: unknown) => void;
    const attempt = new Promise<IOptionEDraftSaveSnapshot<T>>((resolve, reject) => {
      resolveAttempt = resolve;
      rejectAttempt = reject;
    });
    this.saveInFlight = attempt;
    const clear = (): void => {
      if (this.saveInFlight === attempt) this.saveInFlight = undefined;
    };
    attempt.then(clear, clear);
    // Publication can synchronously retain newer editor changes. Return the
    // current state, including those changes, rather than the pre-callback result.
    this.executeSave().then(() => resolveAttempt(this.snapshot), rejectAttempt);
    return attempt;
  }

  private async executeSave(): Promise<IOptionEDraftSaveSnapshot<T>> {
    if (this.unserializableChanges !== undefined) return this.snapshotValue;
    const before = this.snapshotValue;
    if (!before.context || !before.canonical || !before.buffer || before.requiresCanonicalReopen) {
      const next = { ...before, status: 'NotSaved' as const, visibleStatus: visibleStatus('NotSaved'),
        retainedBuffer: Boolean(before.buffer), canResolveConflict: false, requiresCanonicalReopen: true,
        detail: 'A fresh exact protected Draft must be opened before Save.' };
      this.publish(next);
      return next;
    }
    let submitted: IOptionEDraftSubmittedBuffer<T>;
    try {
      this.assertWritable(before.buffer);
      submitted = { buffer: cloneAggregate(before.buffer), generation: this.bufferGeneration,
        fingerprint: this.canonicalise(before.buffer) };
    } catch (error) {
      const next = { ...before, status: 'NotSaved' as const, visibleStatus: visibleStatus('NotSaved'),
        retainedBuffer: true, canResolveConflict: false,
        detail: error instanceof Error ? error.message : 'Draft validation failed before mutation.' };
      this.publish(next);
      return next;
    }
    const prior = before.canonical;
    this.publish({ ...before, status: 'Saving', visibleStatus: visibleStatus('Saving'), retainedBuffer: true,
      canResolveConflict: false, detail: undefined });
    let prepared: OptionEDraftPrepared<T>;
    try {
      prepared = await this.gateway.prepare(submitted.buffer);
    } catch (error) {
      const next = { ...this.snapshotValue, status: 'NotSaved' as const, visibleStatus: visibleStatus('NotSaved'),
        canonical: prior, buffer: this.latestBuffer(submitted), retainedBuffer: true, canResolveConflict: false,
        detail: error instanceof Error ? error.message : 'Draft validation failed before mutation.' };
      this.publish(next);
      return next;
    }
    if (!this.submittedBufferIsCurrent(submitted)) {
      return this.supersededBeforeWrite(submitted, prior);
    }
    let clientSaveId: string;
    let clientSavedAt: string;
    try {
      clientSaveId = this.uuid();
      clientSavedAt = this.now().toISOString();
    } catch (error) {
      const next = { ...this.snapshotValue, status: 'NotSaved' as const, visibleStatus: visibleStatus('NotSaved'),
        canonical: prior, buffer: this.latestBuffer(submitted), retainedBuffer: true, canResolveConflict: false,
        detail: error instanceof Error ? error.message : 'A safe client save identity could not be created.' };
      this.publish(next);
      return next;
    }
    let mergeCompleted = false;
    try {
      await this.gateway.updateExact({ context: before.context, expectedBinding: prior.binding,
        itemId: prior.itemId, expectedEtag: prior.etag, prepared, clientSaveId, clientSavedAt });
      mergeCompleted = true;
      const observed = await this.gateway.read(before.context, prior.binding);
      return this.reconcile(submitted, prior, observed, prepared, clientSaveId, false);
    } catch (error) {
      if (error instanceof OptionEDraftConflictError) {
        return this.observeConflict(before.context, submitted, prior);
      }
      if (error instanceof OptionEDraftAmbiguousWriteError) {
        this.publish({ ...this.snapshotValue, status: 'Checking', visibleStatus: visibleStatus('Checking'),
          retainedBuffer: true, canResolveConflict: false, detail: undefined });
        try {
          const observed = await this.gateway.read(before.context, prior.binding);
          return this.reconcile(submitted, prior, observed, prepared, clientSaveId, true);
        } catch (readError) {
          return this.requireFreshCanonical(submitted, prior, readError,
            'Canonical protected readback could not determine the save outcome.');
        }
      }
      if (error instanceof OptionEDraftRouteError || mergeCompleted) {
        return this.requireFreshCanonical(submitted, prior, error,
          mergeCompleted
            ? 'The Draft write was issued but the protected binding could not be re-confirmed.'
            : 'The protected Save checks could not be completed. No Draft write was issued.');
      }
      const next = { ...this.snapshotValue, status: 'NotSaved' as const, visibleStatus: visibleStatus('NotSaved'),
        canonical: prior, buffer: this.latestBuffer(submitted), retainedBuffer: true,
        canResolveConflict: false, requiresCanonicalReopen: false,
        detail: error instanceof Error ? error.message : 'The Draft was not saved.' };
      this.publish(next);
      return next;
    }
  }

  public async reloadCanonical(): Promise<T | undefined> {
    if (this.saveInFlight) return undefined;
    const current = this.snapshotValue;
    if (!current.context) return undefined;
    const request = ++this.loadSequence;
    this.loadInFlight = request;
    const generation = this.bufferGeneration;
    this.publish({ ...current, status: 'Loading', visibleStatus: visibleStatus('Loading'),
      canResolveConflict: false });
    try {
      const canonical = await this.gateway.read(current.context);
      if (this.loadInFlight !== request) return undefined;
      return this.completeLoad(current.context, canonical, generation);
    } catch (error) {
      if (this.loadInFlight !== request) return undefined;
      this.publish({ ...this.snapshotValue, status: 'NotSaved', visibleStatus: visibleStatus('NotSaved'),
        retainedBuffer: Boolean(this.snapshotValue.buffer) || this.snapshotValue.retainedBuffer,
        canResolveConflict: false, requiresCanonicalReopen: true,
        detail: error instanceof Error ? error.message : 'The canonical protected Draft could not be reopened.' });
      return undefined;
    } finally {
      if (this.loadInFlight === request) this.loadInFlight = undefined;
    }
  }

  private completeLoad(context: IOptionEDraftOpenContext, canonical: IOptionEDraftCanonicalRecord<T>,
    generation: number): T | undefined {
    if (this.schemaVersion !== OPTION_E_DRAFT_SCHEMA_VERSION) {
      this.canonicalise(canonical.aggregate);
      if (canonical.binding.draftSchemaVersion !== this.schemaVersion) throw new Error('The private body and protected binding use different schemas.');
    }
    if (this.bufferGeneration !== generation) {
      this.publish({ ...this.snapshotValue, context, canonical, status: 'NotSaved', visibleStatus: visibleStatus('NotSaved'),
        retainedBuffer: true, canResolveConflict: false, requiresCanonicalReopen: false,
        detail: 'The canonical Draft loaded, but newer session changes are retained and remain unsaved.' });
      return undefined;
    }
    const buffer = cloneAggregate(canonical.aggregate);
    const appliedGeneration = ++this.bufferGeneration;
    this.publish({ status: 'Saved', visibleStatus: visibleStatus('Saved', canonical), context, canonical, buffer,
      retainedBuffer: false, canResolveConflict: false, requiresCanonicalReopen: false });
    // A synchronous observer may retain a newer editor buffer or an unsavable
    // source. Do not return the loaded buffer for a caller to apply over it.
    if (this.bufferGeneration !== appliedGeneration) return undefined;
    return cloneAggregate(buffer);
  }

  /** Explicitly chooses the freshly observed Draft ETag while preserving the employee buffer. */
  public reapplyRetainedBuffer(): T | undefined {
    const current = this.snapshotValue;
    if (!current.canonical || !current.buffer || !current.canResolveConflict || current.requiresCanonicalReopen) {
      return undefined;
    }
    const buffer = cloneAggregate(current.buffer);
    this.bufferGeneration += 1;
    this.publish({ ...current, status: 'Unsaved', visibleStatus: visibleStatus('Unsaved'), buffer,
      retainedBuffer: true, canResolveConflict: false,
      detail: 'Retained changes are ready for an explicit Save against the freshly checked canonical version.' });
    return cloneAggregate(buffer);
  }

  public shouldWarnBeforeUnload(): boolean {
    return this.snapshotValue.retainedBuffer && this.snapshotValue.status !== 'Saved';
  }

  private async observeConflict(
    context: IOptionEDraftOpenContext,
    submitted: IOptionEDraftSubmittedBuffer<T>,
    prior: IOptionEDraftCanonicalRecord<T>
  ): Promise<IOptionEDraftSaveSnapshot<T>> {
    try {
      const observed = await this.gateway.read(context, prior.binding);
      const next = { ...this.snapshotValue, status: 'Conflict' as const, visibleStatus: visibleStatus('Conflict'),
        canonical: observed, buffer: this.latestBuffer(submitted), retainedBuffer: true,
        canResolveConflict: true, requiresCanonicalReopen: false,
        detail: 'A newer canonical Draft was found. Reload it or explicitly reapply your retained changes.' };
      this.publish(next);
      return next;
    } catch (error) {
      return this.requireFreshCanonical(submitted, prior, error,
        'The Draft conflicted and the protected binding could not be re-confirmed. Reopen the canonical Draft.');
    }
  }

  private reconcile(
    submitted: IOptionEDraftSubmittedBuffer<T>,
    prior: IOptionEDraftCanonicalRecord<T>,
    observed: IOptionEDraftCanonicalRecord<T>,
    prepared: OptionEDraftPrepared<T>,
    clientSaveId: string,
    ambiguous: boolean
  ): IOptionEDraftSaveSnapshot<T> {
    const exactAttempt = observed.clientSaveId === clientSaveId
      && observed.payloadSha256 === prepared.payloadSha256
      && observed.payloadJson === prepared.payloadJson
      && observed.etag !== prior.etag;
    if (exactAttempt) {
      if (!this.submittedBufferIsCurrent(submitted)) {
        const next = { ...this.snapshotValue, status: 'NotSaved' as const, visibleStatus: visibleStatus('NotSaved'),
          canonical: observed, buffer: this.latestBuffer(submitted), retainedBuffer: true,
          canResolveConflict: false, requiresCanonicalReopen: false,
          detail: 'The submitted Draft was confirmed, but newer session changes are retained and remain unsaved.' };
        this.publish(next);
        return next;
      }
      const next = { ...this.snapshotValue, status: 'Saved' as const, visibleStatus: visibleStatus('Saved', observed),
        canonical: observed, buffer: cloneAggregate(observed.aggregate), retainedBuffer: false,
        canResolveConflict: false, requiresCanonicalReopen: false, detail: undefined };
      this.publish(next);
      return next;
    }
    const unchanged = observed.etag === prior.etag && observed.payloadJson === prior.payloadJson
      && observed.payloadSha256 === prior.payloadSha256;
    if (ambiguous && unchanged) {
      const next = { ...this.snapshotValue, status: 'NotSaved' as const, visibleStatus: visibleStatus('NotSaved'),
        canonical: observed, buffer: this.latestBuffer(submitted), retainedBuffer: true,
        canResolveConflict: false, requiresCanonicalReopen: false,
        detail: 'The prior canonical Draft ETag is unchanged. Retry only by an explicit Save.' };
      this.publish(next);
      return next;
    }
    const next = { ...this.snapshotValue, status: 'Conflict' as const, visibleStatus: visibleStatus('Conflict'),
      canonical: observed, buffer: this.latestBuffer(submitted), retainedBuffer: true,
      canResolveConflict: true, requiresCanonicalReopen: false,
      detail: 'Canonical readback did not match the exact attempted save. Reload it or explicitly reapply retained changes.' };
    this.publish(next);
    return next;
  }

  private requireFreshCanonical(
    submitted: IOptionEDraftSubmittedBuffer<T>,
    prior: IOptionEDraftCanonicalRecord<T>,
    error: unknown,
    fallback: string
  ): IOptionEDraftSaveSnapshot<T> {
    const message = error instanceof Error ? `${fallback} ${error.message}` : fallback;
    const next = { ...this.snapshotValue,
      status: error instanceof OptionEDraftRouteError && error.code === 'CONTROL_BINDING_STALE'
        ? 'Conflict' as const : 'NotSaved' as const,
      visibleStatus: error instanceof OptionEDraftRouteError && error.code === 'CONTROL_BINDING_STALE'
        ? visibleStatus('Conflict') : visibleStatus('NotSaved'),
      canonical: prior, buffer: this.latestBuffer(submitted), retainedBuffer: true,
      canResolveConflict: false, requiresCanonicalReopen: true, detail: message };
    this.publish(next);
    return next;
  }

  private submittedBufferIsCurrent(submitted: IOptionEDraftSubmittedBuffer<T>): boolean {
    if (this.bufferGeneration !== submitted.generation || !this.snapshotValue.buffer) return false;
    try {
      return this.canonicalise(this.snapshotValue.buffer) === submitted.fingerprint;
    } catch {
      return false;
    }
  }

  private latestBuffer(submitted: IOptionEDraftSubmittedBuffer<T>): T {
    return cloneAggregate(this.snapshotValue.buffer || submitted.buffer);
  }

  private supersededBeforeWrite(
    submitted: IOptionEDraftSubmittedBuffer<T>,
    prior: IOptionEDraftCanonicalRecord<T>
  ): IOptionEDraftSaveSnapshot<T> {
    const next = { ...this.snapshotValue, status: 'NotSaved' as const, visibleStatus: visibleStatus('NotSaved'),
      canonical: prior, buffer: this.latestBuffer(submitted), retainedBuffer: true,
      canResolveConflict: false, requiresCanonicalReopen: false,
      detail: 'The Draft changed while Save was preparing. The older buffer was not written; newer session changes are retained.' };
    this.publish(next);
    return next;
  }

  private canonicalise(value: T): string { return canonicalisePrivateDraftForSchema(value, this.schemaVersion); }
  private assertWritable(value: T): void {
    const aggregate: OptionEPrivateDraftAggregate = value;
    if (aggregate.schemaVersion === OPTION_E_DRAFT_SCHEMA_VERSION) assertOptionEPartialDraftWritable(aggregate);
    else this.canonicalise(value);
  }

  private publish(snapshot: IOptionEDraftSaveSnapshot<T>): void {
    if (this.unserializableChanges !== undefined) snapshot = { ...snapshot,
      status: 'NotSaved', visibleStatus: visibleStatus('NotSaved'), buffer: undefined,
      retainedBuffer: true, canResolveConflict: false, detail: this.unserializableChanges };
    this.snapshotValue = cloneSnapshot(snapshot);
    // subscribe already supplies an initial snapshot. Live Set traversal would
    // repeat that notification and can revisit listeners removed and re-added.
    Array.from(this.listeners).forEach(listener => {
      if (this.listeners.has(listener)) this.notify(listener);
    });
  }

  /** A view failure must not interrupt protected persistence or other observers. */
  private notify(listener: Listener<T>): void {
    try {
      listener(this.snapshot);
    } catch {
      console.error('Option E Draft subscriber failed.');
    }
  }
}

export const optionEDraftBuffersEqual = (
  left: IOptionEWorkplanDraftAggregate,
  right: IOptionEWorkplanDraftAggregate
): boolean => canonicaliseOptionEPartialDraft(left) === canonicaliseOptionEPartialDraft(right);

export default OptionEDraftSaveController;
