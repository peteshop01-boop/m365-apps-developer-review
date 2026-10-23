import { V5_CHECKPOINTS, type V5Admission, type V5JournalOperation, type V5Checkpoint,
  type V5Receipt, type V5Store } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { V4Control, V4AclReadback } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import type { V5CapturedBytePort, V5Result } from '../models/OptionEWorkplanSubmitExactBodyV5ExecutionModels';
import { v4Canonical, v4Equal, v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { validateV5Admission, makeV5Admission } from './OptionEWorkplanSubmitExactBodyV5Admission';
import { createV5CapturedDomainStore, measureV5Capacity, v5SnapshotFor } from './OptionEWorkplanSubmitExactBodyV5PackageContract';

const requireThat = (ok: boolean, reason: string): void => { if (!ok) throw new Error(reason); };
const copy = <T>(value: T): T => JSON.parse(v4Canonical(value)) as T;
const withoutEtag = (control: V4Control): Omit<V4Control, 'etag'> =>
  Object.fromEntries(Object.entries(control).filter(([key]) => key !== 'etag')) as Omit<V4Control, 'etag'>;
const nextControl = (a: V5Admission, phase: 'claimed' | 'pointed' | 'completed'): Omit<V4Control, 'etag'> => {
  const base = withoutEtag(a.authority.control);
  const claimed = { ...base, transition: 'Submitting' as const, command: a.key };
  const pointed = { ...claimed, state: 'Submitted' as const, transition: 'AclPending' as const, snapshot: a.key };
  if (phase === 'claimed') return claimed;
  if (phase === 'pointed') return pointed;
  const rest = Object.fromEntries(Object.entries(pointed).filter(([key]) => key !== 'command')) as Omit<V4Control, 'etag'>;
  return { ...rest, transition: 'Ready', aclEpoch: base.hierarchyEpoch };
};
const phaseControl = (a: V5Admission, checkpoint: V5Checkpoint): Omit<V4Control, 'etag'> => {
  if (checkpoint === 'Validated') return withoutEtag(a.authority.control);
  if (['ControlClaimed', 'SnapshotWritten', 'AuditWritten'].includes(checkpoint)) return nextControl(a, 'claimed');
  return nextControl(a, checkpoint === 'Completed' ? 'completed' : 'pointed');
};
function exactPhaseControl(op: V5JournalOperation, current: V4Control): boolean {
  if (!v4Etag(op.etag) || !v4Etag(op.controlReadback.etag)
    || !v4Equal(withoutEtag(op.controlReadback), phaseControl(op.admission, op.checkpoint))
    || (op.outcome === 'Completed' && op.checkpoint !== 'Completed')
    || (op.outcome === 'Running' && op.checkpoint === 'Completed')
    || (op.outcome === 'RecoveryHold' ? !op.holdReason : op.holdReason !== undefined)) return false;
  if (op.checkpoint === 'Validated' && !v4Equal(op.controlReadback, op.admission.authority.control)) return false;
  if (!op.controlIntent) return v4Equal(current, op.controlReadback);
  const next = op.checkpoint === 'Validated' ? 'claimed' : op.checkpoint === 'AuditWritten' ? 'pointed'
    : op.checkpoint === 'AclVerified' ? 'completed' : undefined;
  return !!next && v4Equal(op.controlIntent.before, op.controlReadback)
    && v4Equal(op.controlIntent.after, nextControl(op.admission, next))
    && (v4Equal(current, op.controlReadback) || (v4Etag(current.etag) && current.etag !== op.controlReadback.etag
      && v4Equal(withoutEtag(current), op.controlIntent.after)));
}
export function v5AclPlan(a: V5Admission, principals: V5Store['binding']['principals']): V4AclReadback {
  const ids = [principals.content, principals.acl, principals.recovery, a.authority.actor.principal, a.authority.manager.principal];
  requireThat(ids.every(id => Number.isSafeInteger(id) && id > 0) && new Set(ids).size === 5, 'AutomationPrincipalCollision');
  return { admissionKey: a.key, hierarchyEpoch: a.authority.control.hierarchyEpoch, aclEpoch: a.authority.control.hierarchyEpoch,
    targets: ['Draft', 'Snapshot', 'Operation', 'Control'].map(kind => ({ key: `${a.authority.control.workplan}/${kind}/${a.key}`,
      inherited: false, complete: true, grants: [
        { principal: principals.content, role: kind === 'Snapshot' ? 'AppendOnly' as const : 'MutatorNoDelete' as const },
        { principal: principals.acl, role: 'AclReconciler' as const }, { principal: principals.recovery, role: 'FullControl' as const },
        { principal: a.authority.actor.principal, role: 'Read' as const },
        ...(kind === 'Draft' ? [] : [{ principal: a.authority.manager.principal, role: 'Read' as const }])
      ] })) };
}
const receiptMatches = (receipt: V5Receipt | undefined, a: V5Admission): receipt is V5Receipt => !!receipt
  && receipt.key === a.key && v4Equal(receipt.snapshot, v5SnapshotFor(a))
  && Math.abs(Date.parse(receipt.nativeCreated) - Date.parse(a.eventAt)) <= 300000;

/** Source-only execution over synthetic byte ports; never accepts a logical store or native binding. */
export class OptionEWorkplanSubmitExactBodyV5 {
  public constructor(private readonly port: V5CapturedBytePort, private readonly hook?: (checkpoint: V5Checkpoint) => void) {}
  public async submit(key: string): Promise<V5Result> {
    let store: V5Store | undefined;
    let admission: V5Admission | undefined;
    let admitted = false;
    try {
      store = createV5CapturedDomainStore(this.port);
      const active = store;
      const first = copy(await active.readAuthority(key)), second = copy(await active.readAuthority(key));
      requireThat(v4Equal(first, second), 'AuthorityDoubleReadMismatch');
      let op = await active.readOperation(key);
      if (op) {
        validateV5Admission(op.admission);
        requireThat(op.admission.key === key, 'OperationKeyMismatch');
        admission = copy(op.admission);
      } else {
        admission = makeV5Admission(first, key, active.now());
        requireThat((first.control.state === 'Draft' || first.control.state === 'ChangesRequested')
          && first.control.transition === 'Ready' && !first.control.command && !first.control.snapshot
          && first.workplan.value.state === first.control.state, 'StateNotSubmittable');
      }
      const original = admission;
      const { control: originalControl, ...origins } = original.authority;
      const { control: observedControl, ...observedOrigins } = first;
      requireThat(v4Equal(origins, observedOrigins), 'CommandCollision');
      requireThat(v4Equal(observedControl, await active.readControl(originalControl.workplan)), 'AuthorityControlReadbackDivergence');
      v5AclPlan(original, active.binding.principals); // Principal collision refusal precedes ALL effects.
      measureV5Capacity(original);
      if (op) {
        admitted = true;
        requireThat(exactPhaseControl(op, observedControl), 'RecoveryControlDrift');
      } else {
        admitted = true; // Any ambiguous create is held/refused through readback, never retried blindly.
        const created = await active.createOperation(original);
        op = await active.readOperation(key);
        requireThat(!!op && v4Equal(op, created) && v4Equal(op.admission, original) && op.checkpoint === 'Validated' && op.outcome === 'Running'
          && !op.controlIntent && !op.holdReason && v4Equal(op.controlReadback, originalControl), 'UniqueClaimUncertainOrCollision');
        this.hook?.('Validated');
      }
      let known = copy(op!);
      const checkOrigin = async (): Promise<V4Control> => {
        const now = copy(await active.readAuthority(key)), again = copy(await active.readAuthority(key));
        requireThat(v4Equal(now, again), 'AuthorityDoubleReadMismatch');
        const { control, ...currentOrigins } = now;
        requireThat(v4Equal(currentOrigins, origins), 'AuthorityDrift');
        const actual = copy(await active.readControl(originalControl.workplan));
        const durable = await active.readOperation(key);
        requireThat(v4Equal(control, actual), 'AuthorityControlReadbackDivergence');
        requireThat(!!durable && v4Equal(durable, known) && v4Equal(durable.admission, original)
          && exactPhaseControl(durable, actual), 'PhaseControlDrift');
        return actual;
      };
      const advance = async (checkpoint: V5Checkpoint): Promise<void> => {
        const current = await checkOrigin(), before = known;
        requireThat(V5_CHECKPOINTS.indexOf(checkpoint) === V5_CHECKPOINTS.indexOf(before.checkpoint) + 1
          || (checkpoint === 'Completed' && before.checkpoint === 'Completed' && before.outcome === 'RecoveryHold'), 'CheckpointOrder');
        const written = await active.advance(key, before.etag, checkpoint, current);
        const after = await active.readOperation(key);
        requireThat(!!after && v4Equal(after, written) && v4Equal(after.admission, original) && after.checkpoint === checkpoint
          && after.outcome === (checkpoint === 'Completed' ? 'Completed' : 'Running')
          && v4Etag(after.etag) && after.etag !== before.etag && !after.controlIntent && !after.holdReason
          && v4Equal(after.controlReadback, current), 'CheckpointReadback');
        // Invocation-local state advances sequentially; the byte port independently enforces exact durable CAS.
        // eslint-disable-next-line require-atomic-updates
        known = copy(after!); this.hook?.(checkpoint);
      };
      const cas = async (phase: 'claimed' | 'pointed' | 'completed'): Promise<void> => {
        let control = await checkOrigin();
        const next = nextControl(original, phase);
        if (v4Equal(withoutEtag(control), next)) {
          requireThat(!!known.controlIntent, 'MissingDurableControlIntent'); return;
        }
        const intent = { before: control, after: next };
        if (!known.controlIntent) {
          const before = known;
          await active.prepareControl(key, before.etag, intent);
          const prepared = await active.readOperation(key);
          const beforeBody = Object.fromEntries(Object.entries(before).filter(([name]) => name !== 'etag' && name !== 'controlIntent'));
          const preparedBody = Object.fromEntries(Object.entries(prepared || {}).filter(([name]) => name !== 'etag' && name !== 'controlIntent'));
          requireThat(!!prepared && v4Equal(preparedBody, beforeBody)
            && v4Equal(prepared.controlIntent, intent) && prepared.etag !== before.etag, 'ControlIntentReadback');
          // Invocation-local state; cross-invocation concurrency is guarded by the exact operation ETag.
          // eslint-disable-next-line require-atomic-updates
          known = copy(prepared!);
        }
        requireThat(v4Equal(known.controlIntent, intent), 'ControlIntentMismatch');
        control = await checkOrigin();
        try { await active.casControl(originalControl.workplan, control.etag, next); } catch { /* no blind retry */ }
        const actual = await checkOrigin();
        requireThat(actual.etag !== control.etag && v4Equal(withoutEtag(actual), next), 'ControlReadback');
      };
      const reached = (checkpoint: V5Checkpoint): boolean => V5_CHECKPOINTS.indexOf(known.checkpoint) >= V5_CHECKPOINTS.indexOf(checkpoint);
      if (!reached('ControlClaimed')) { await cas('claimed'); await advance('ControlClaimed'); }
      await checkOrigin();
      const snapshot = v5SnapshotFor(original);
      let storedSnapshot = await active.readSnapshot(key);
      if (!storedSnapshot && !reached('SnapshotWritten')) {
        try { await active.createSnapshot(snapshot); } catch { /* exact readback below */ }
        storedSnapshot = await active.readSnapshot(key);
      }
      requireThat(v4Equal(storedSnapshot || null, snapshot), 'SnapshotReadback');
      if (!reached('SnapshotWritten')) await advance('SnapshotWritten');
      await checkOrigin();
      let receipt = await active.readReceipt(key);
      if (!receipt && !reached('AuditWritten')) {
        try { await active.createReceipt({ contract: 'immutable-receipt/v5', key, snapshot }); } catch { /* exact readback below */ }
        receipt = await active.readReceipt(key);
      }
      requireThat(receiptMatches(receipt, original), 'ReceiptReadback');
      if (!reached('AuditWritten')) await advance('AuditWritten');
      if (!reached('ControlPointed')) { await cas('pointed'); await advance('ControlPointed'); }
      await checkOrigin();
      const acl = v5AclPlan(original, active.binding.principals);
      requireThat(v4Equal(await active.expectedAcl(original), acl), 'AclPlanNotLeastPrivilege');
      let actualAcl = await active.readAcl(key);
      if (!v4Equal(actualAcl || null, acl) && !reached('AclVerified')) {
        try { await active.applyAcl(original); } catch { /* exact readback below */ }
        actualAcl = await active.readAcl(key);
      }
      requireThat(v4Equal(actualAcl || null, acl), 'AclReadback');
      if (!reached('AclVerified')) await advance('AclVerified');
      if (!reached('Completed')) { await cas('completed'); await advance('Completed'); }
      else if (known.outcome === 'RecoveryHold') await advance('Completed');
      const finalControl = await checkOrigin();
      const finalReceipt = await active.readReceipt(key);
      requireThat(v4Equal(withoutEtag(finalControl), nextControl(original, 'completed'))
        && v4Equal(await active.readSnapshot(key), snapshot) && receiptMatches(finalReceipt, original)
        && v4Equal(finalReceipt, receipt) && v4Equal(await active.readAcl(key), acl)
        && v4Equal(await active.readOperation(key), known) && known.outcome === 'Completed', 'CompletionReadback');
      requireThat(v4Equal(await checkOrigin(), finalControl) && v4Equal(await active.readSnapshot(key), snapshot)
        && v4Equal(await active.readReceipt(key), finalReceipt) && v4Equal(await active.readAcl(key), acl)
        && v4Equal(await active.readOperation(key), known), 'CompletionUnstable');
      return { outcome: 'Completed', receipt: copy(finalReceipt!) };
    } catch (error) {
      let reason = error instanceof Error ? error.message : 'Unknown';
      if (admitted && store && admission) {
        try {
          const current = await store.readOperation(key);
          requireThat(!!current && v4Equal(current.admission, admission), 'HoldAdmissionMismatch');
          try { await store.hold(key, current!.etag, reason); } catch { /* exact readback below */ }
          const held = await store.readOperation(key);
          requireThat(!!held && held.etag !== current!.etag && v4Equal({ ...held, etag: current!.etag },
            { ...current!, outcome: 'RecoveryHold', holdReason: reason }), 'HoldReadbackUncertain');
        } catch { reason = `HoldReadbackUncertain:${reason}`; }
      }
      return { outcome: admitted ? 'RecoveryHold' : 'Rejected', reason };
    }
  }
}
