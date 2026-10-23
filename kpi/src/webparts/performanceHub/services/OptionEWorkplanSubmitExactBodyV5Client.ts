import { EXACT_BODY_V5, V5_CHECKPOINTS } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { V5ClientPorts, V5ClientState, V5RetainedIntent, V5SavedDraftEvidence } from '../models/OptionEWorkplanSubmitExactBodyV5ClientModels';
import { parseCanonicalOptionEDraftV2 } from './OptionEWorkplanDraftV2Wire';
import { v4Canonical, v4Equal, v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { parseV5Request, v5Canonical, v5IdentityKey } from './OptionEWorkplanSubmitExactBodyV5Wire';
import { makeV5Admission, validateV5Admission } from './OptionEWorkplanSubmitExactBodyV5Admission';
import { encodeV5CapturedAdmission, parseV5CapturedAdmission, parseV5CapturedJournalOperation,
  parseV5CapturedSnapshot, parseV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { validateV5SourceDomainBinding, measureV5Capacity, v5SnapshotFor } from './OptionEWorkplanSubmitExactBodyV5PackageContract';
import { v5AclPlan } from './OptionEWorkplanSubmitExactBodyV5';

const copy = <T>(value: T): T => JSON.parse(v4Canonical(value)) as T;
const requireThat = (ok: boolean, reason: string): void => { if (!ok) throw new Error(reason); };
const uuid = (): string => globalThis.crypto.randomUUID();

/** Single-flight is per-instance only; native/cross-instance uniqueness is unproved. */
export class OptionEWorkplanSubmitExactBodyV5Client {
  private current: V5ClientState = { phase: 'HOLD', message: 'Submission is unavailable. The Draft remains private.' };
  private retained?: V5RetainedIntent;
  private pending?: Promise<V5ClientState>;
  public constructor(private readonly ports?: V5ClientPorts, private readonly command: () => string = uuid) {}
  public installedAvailable(): boolean { return false; }
  public state(): V5ClientState { return { ...this.current }; }
  public retainedAdmissionBody(): string | undefined { return this.retained?.admissionBody; }
  private update(phase: V5ClientState['phase'], message: string): V5ClientState {
    this.current = { phase, message, ...(this.retained ? { key: this.retained.admission.key } : {}) }; return this.state();
  }
  private checkPorts(): V5ClientPorts {
    if (!this.ports) throw new Error('Submission ports unavailable');
    validateV5SourceDomainBinding(this.ports.binding);
    const methods: (keyof V5ClientPorts)[] = ['readCurrentSource', 'readSyntheticRequestProposal', 'createImmutableRequest',
      'readImmutableRequest', 'readOperation', 'readControl', 'readSnapshot', 'readReceipt', 'readAcl', 'now'];
    requireThat(methods.every(name => typeof this.ports![name] === 'function'), 'Incomplete synthetic client ports');
    return this.ports;
  }
  private singleFlight(run: () => Promise<V5ClientState>): Promise<V5ClientState> {
    if (!this.pending) this.pending = run().catch(error => this.update('HOLD', error instanceof Error ? error.message : 'Submission uncertain'))
      .finally(() => { this.pending = undefined; });
    return this.pending;
  }
  public submit(saved: V5SavedDraftEvidence): Promise<V5ClientState> {
    // Snapshot evidence synchronously so edits during awaits cannot change the admitted intent.
    let frozen: V5SavedDraftEvidence;
    try { frozen = copy(saved); } catch { return Promise.resolve(this.update('HOLD', 'Saved Draft evidence unavailable')); }
    return this.singleFlight(async () => {
      const p = this.checkPorts();
      requireThat(frozen.schema === 'kcf.workplan-draft/v2' && frozen.status === 'Saved' && frozen.privateDraft === true
        && frozen.requiresCanonicalReopen === false && frozen.staleBuffer === false
        && frozen.currentBufferBody === frozen.source.body && frozen.canonicalReopenBody === frozen.source.body,
      'Save and canonically reopen the current private DraftV2');
      parseCanonicalOptionEDraftV2(frozen.source.body);
      if (this.retained) {
        const q = this.retained.admission.authority.request.query;
        requireThat(v4Equal(q.source, frozen.source) && q.person === frozen.person && q.year === frozen.year && q.workplan === frozen.workplan,
          'Retained submission differs from the open Draft');
        return this.readStatus();
      }
      const source = copy(await p.readCurrentSource(frozen.workplan));
      requireThat(v4Equal(source, await p.readCurrentSource(frozen.workplan)), 'Current authority is changing');
      requireThat(v4Equal(source.draft, frozen.source) && source.actor.key === frozen.person
        && source.control.year === frozen.year && source.control.workplan === frozen.workplan
        && source.control.aclEpoch === source.control.hierarchyEpoch, 'Saved Draft is stale');
      const query = parseV5Request(v5Canonical({ capability: EXACT_BODY_V5, action: 'Submit', command: this.command(),
        person: frozen.person, year: frozen.year, workplan: frozen.workplan, source: frozen.source,
        referenceBody: v5Canonical(source.references) }));
      const request = copy(await p.readSyntheticRequestProposal(copy(query)));
      requireThat(v4Equal(request, await p.readSyntheticRequestProposal(copy(query))) && v4Equal(request.query, query)
        && request.body === v5Canonical(query), 'Synthetic request proposal differs or is changing');
      const admission = makeV5Admission({ ...source, request }, v5IdentityKey(query), p.now());
      v5AclPlan(admission, p.binding.principals); measureV5Capacity(admission);
      const admissionBody = encodeV5CapturedAdmission(admission);
      this.retained = { admission: parseV5CapturedAdmission(admissionBody), admissionBody };
      this.update('Recording', 'Recording submission request');
      // Once attempted, this exact command remains retained even if create/readback is uncertain.
      try { await p.createImmutableRequest(copy(request)); } catch { /* Resolve by readback only. */ }
      return this.readStatus();
    });
  }
  public refresh(): Promise<V5ClientState> { return this.singleFlight(() => this.readStatus()); }
  private async readStatus(): Promise<V5ClientState> {
    const p = this.checkPorts(), a = this.retained?.admission;
    requireThat(!!a, 'No retained submission');
    const admission = a!;
    validateV5Admission(admission); measureV5Capacity(admission);
    const read = async (): Promise<{
      request: Awaited<ReturnType<V5ClientPorts['readImmutableRequest']>>;
      source: Awaited<ReturnType<V5ClientPorts['readCurrentSource']>>;
      operation: string | null; snapshot: string | null; receipt: string | null;
      control: Awaited<ReturnType<V5ClientPorts['readControl']>>;
      acl: Awaited<ReturnType<V5ClientPorts['readAcl']>> | null;
    }> => ({ request: await p.readImmutableRequest(admission.key), source: copy(await p.readCurrentSource(admission.authority.control.workplan)),
      operation: await p.readOperation(admission.key) ?? null, snapshot: await p.readSnapshot(admission.key) ?? null,
      receipt: await p.readReceipt(admission.key) ?? null, control: copy(await p.readControl(admission.authority.control.workplan)),
      acl: await p.readAcl(admission.key) ?? null });
    const first = await read();
    requireThat(!!first.request && v4Equal(first.request, admission.authority.request), 'Request recording uncertain or conflicting');
    const stable = copy(first);
    requireThat(v4Equal(stable, await read()), 'Submission readback is changing');
    const { request: originalRequest, control: originalControl, ...origins } = admission.authority;
    requireThat(v4Equal(originalRequest, stable.request), 'Original request differs');
    const { control: observedControl, ...observed } = stable.source;
    requireThat(v4Equal(origins, observed) && v4Equal(observedControl, stable.control), 'Submission authority differs');
    if (!stable.operation) {
      requireThat(v4Equal(stable.control, originalControl) && !stable.snapshot && !stable.receipt && !stable.acl, 'Missing operation with effects');
      return this.update('Processing', 'Submission request recorded');
    }
    const op = parseV5CapturedJournalOperation(stable.operation);
    requireThat(v4Equal(op.admission, admission) && v4Etag(op.etag), 'Original admission or operation ETag differs');
    requireThat(op.outcome !== 'RecoveryHold', op.holdReason || 'Submission held');
    if (op.outcome !== 'Completed') {
      requireThat(!op.controlIntent && !op.holdReason && v4Equal(op.controlReadback, stable.control), 'Processing control uncertain');
      const { etag, ...base } = originalControl;
      const { etag: currentEtag, ...current } = stable.control;
      const pointed = ['ControlPointed', 'AclVerified'].includes(op.checkpoint);
      const expected = op.checkpoint === 'Validated' ? base
        : { ...base, command: admission.key, transition: pointed ? 'AclPending' : 'Submitting',
          ...(pointed ? { state: 'Submitted', snapshot: admission.key } : {}) };
      requireThat(op.checkpoint !== 'Completed' && v4Equal(current, expected)
        && (op.checkpoint === 'Validated' ? currentEtag === etag : currentEtag !== etag), 'Processing checkpoint differs');
      const reached = (checkpoint: typeof op.checkpoint): boolean => V5_CHECKPOINTS.indexOf(op.checkpoint) >= V5_CHECKPOINTS.indexOf(checkpoint);
      requireThat(!reached('SnapshotWritten') || !!stable.snapshot, 'Processing snapshot missing');
      requireThat(!reached('AuditWritten') || !!stable.receipt, 'Processing receipt missing');
      if (stable.snapshot) requireThat(v4Equal(parseV5CapturedSnapshot(stable.snapshot), v5SnapshotFor(admission)), 'Processing snapshot differs');
      if (stable.receipt) {
        const receipt = parseV5CapturedReceipt(stable.receipt);
        requireThat(v4Equal(receipt.snapshot, v5SnapshotFor(admission))
          && Math.abs(Date.parse(receipt.nativeCreated) - Date.parse(admission.eventAt)) <= 300000, 'Processing receipt differs');
      }
      requireThat(!reached('AclVerified') || !!stable.acl, 'Processing ACL missing');
      if (stable.acl) requireThat(v4Equal(stable.acl, v5AclPlan(admission, p.binding.principals)), 'Processing ACL differs');
      return this.update('Processing', 'Submission processing');
    }
    const { etag: originalEtag, ...terminalBase } = originalControl;
    const terminal = { ...terminalBase, state: 'Submitted', transition: 'Ready', snapshot: admission.key, aclEpoch: originalControl.hierarchyEpoch };
    const { etag: actualEtag, ...actual } = stable.control;
    requireThat(op.checkpoint === 'Completed' && !op.controlIntent && !op.holdReason && v4Etag(actualEtag) && actualEtag !== originalEtag
      && v4Equal(actual, terminal) && v4Equal(op.controlReadback, stable.control), 'Terminal control incomplete');
    requireThat(!!stable.snapshot && !!stable.receipt, 'Completed captured records missing');
    const snapshot = parseV5CapturedSnapshot(stable.snapshot!), receipt = parseV5CapturedReceipt(stable.receipt!);
    requireThat(v4Equal(snapshot, v5SnapshotFor(admission)) && receipt.key === admission.key && v4Equal(receipt.snapshot, snapshot)
      && Math.abs(Date.parse(receipt.nativeCreated) - Date.parse(admission.eventAt)) <= 300000, 'Completed receipt differs');
    requireThat(v4Equal(stable.acl, v5AclPlan(admission, p.binding.principals)), 'Complete exact ACL readback unavailable');
    return this.update('Submitted', 'Submission completed in the synthetic source contract');
  }
}
