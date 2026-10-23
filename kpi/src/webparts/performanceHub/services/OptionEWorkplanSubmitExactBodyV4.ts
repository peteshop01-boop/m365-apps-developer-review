import { V4_CHECKPOINTS, type V4Store, type V4Result, type V4Authority, type V4Admission,
  type V4Snapshot, type V4Receipt, type V4Control, type V4Checkpoint, type V4ReferenceSet, type V4AclReadback, type V4Operation as V4BaseOperation } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import type { IOptionEAuthoritativeReferenceReadback, IOptionEWorkplanSubmitPayload } from '../models/OptionEWorkplanSubmitModels';
import { parseV4Canonical, parseV4Draft, parseV4Request, v4Canonical, v4Equal, v4Etag, v4ExactKeys } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { validateV4SourceDomainBinding } from './OptionEWorkplanSubmitExactBodyV4PackageContract';

/** Repair-local durable journal contract; base models and their original consumers remain unchanged. */
export type V4JournalOperation = V4BaseOperation & {
  controlReadback: V4Control;
  controlIntent?: { before: V4Control; after: Omit<V4Control,'etag'> };
};
export type V4JournalStore = Omit<V4Store,'readOperation'|'createOperation'|'advance'> & {
  readOperation(key:string):Promise<V4JournalOperation|undefined>;
  createOperation(admission:V4Admission):Promise<V4JournalOperation>;
  advance(key:string,exactEtag:string,checkpoint:V4Checkpoint,controlReadback:V4Control):Promise<V4JournalOperation>;
  prepareControl(key:string,exactEtag:string,intent:NonNullable<V4JournalOperation['controlIntent']>):Promise<void>;
};
const requireThat = (ok: boolean, reason: string): void => { if (!ok) throw new Error(reason); };
const timestamp = (t: string): boolean => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(t) && Number.isFinite(Date.parse(t)) && new Date(t).toISOString() === t;
const copy = <T>(v: T): T => JSON.parse(v4Canonical(v)) as T;
const identityKey = (a: V4Authority): string => `${a.request.query.person}|${a.request.query.year}|${a.request.query.command}`;

const exactDate = (value: string | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const effectiveAt = (asOf: string, effectiveFrom: string, effectiveTo?: string): boolean =>
  exactDate(asOf) && exactDate(effectiveFrom) && effectiveFrom <= asOf
  && (effectiveTo === undefined || (exactDate(effectiveTo) && effectiveTo >= asOf));

const validateGovernedBehaviourExtensionReferences = (
  payload: IOptionEWorkplanSubmitPayload,
  actorPersonKey: string,
  readback: IOptionEAuthoritativeReferenceReadback
): boolean => {
  const extension = payload.behaviours.governedExtension;
  if (!extension) return true;
  const authority = readback.governedBehaviourAuthority;
  const headlines = readback.governedBehaviourHeadlines;
  const focuses = readback.governedBehaviourFocuses;
  const targets = readback.governedBehaviourTargets;
  const assignment = readback.personAssignments[0];
  if (!authority || !headlines || !focuses || !targets || !assignment
    || assignment.personKey !== actorPersonKey || assignment.roleLevelCode !== extension.roleLevelCode
    || authority.catalogueId !== extension.authority.catalogueId
    || authority.catalogueVersion !== extension.authority.catalogueVersion
    || authority.catalogueRevision !== extension.authority.catalogueRevision
    || authority.catalogueEtag !== extension.authority.catalogueEtag
    || authority.catalogueContentSha256 !== extension.authority.catalogueContentSha256
    || authority.approvalReference !== extension.authority.approvalReference
    || authority.published !== true || authority.immutable !== true
    || !effectiveAt(authority.asOfDate, authority.effectiveFrom, authority.effectiveTo)
    || extension.immutableSelectionSnapshots !== true
    || extension.legacyTargetRatingWeightFieldsWritten !== false
    || extension.deliveryArithmeticAffected !== false
    || headlines.length !== extension.headlines.length) return false;

  if (!extension.headlines.every((headline, index) => {
    const trusted = headlines[index];
    return trusted?.behaviourKey === headline.behaviourKey
      && trusted.headlineTitle === headline.headlineTitle && trusted.governedOrder === index + 1;
  })) return false;

  const snapshots = extension.headlines.flatMap(headline => headline.selections);
  return snapshots.every(snapshot => {
    if (snapshot.catalogueId !== authority.catalogueId
      || snapshot.catalogueVersion !== authority.catalogueVersion
      || snapshot.catalogueRevision !== authority.catalogueRevision
      || snapshot.catalogueEtag !== authority.catalogueEtag
      || snapshot.catalogueContentSha256 !== authority.catalogueContentSha256
      || snapshot.roleLevelCode !== extension.roleLevelCode) return false;
    const matchingFocus = focuses.filter(focus => focus.behaviourKey === snapshot.behaviourKey
      && focus.focusKey === snapshot.focusKey && focus.focusTitle === snapshot.focusTitle
      && focus.roleLevelCode === snapshot.roleLevelCode && focus.status === 'Published'
      && effectiveAt(authority.asOfDate, focus.effectiveFrom, focus.effectiveTo));
    if (matchingFocus.length !== 1) return false;
    if (snapshot.source === 'Own') {
      return snapshot.targetKey === undefined && snapshot.selectedWording === snapshot.myCommitment;
    }
    return targets.filter(target => target.targetKey === snapshot.targetKey
      && target.targetKey === snapshot.selectionKey && target.behaviourKey === snapshot.behaviourKey
      && target.focusKey === snapshot.focusKey && target.focusTitle === snapshot.focusTitle
      && target.roleLevelCode === snapshot.roleLevelCode && target.selectedWording === snapshot.selectedWording
      && target.status === 'Published'
      && effectiveAt(authority.asOfDate, target.effectiveFrom, target.effectiveTo)).length === 1;
  });
};

const validateAuthoritativeReferences = (
  payload: IOptionEWorkplanSubmitPayload,
  actorPersonKey: string,
  performanceYear: number,
  readback: IOptionEAuthoritativeReferenceReadback
): boolean => {
  if (readback.coreKpis.length !== payload.core.entries.length
    || readback.coreTargets.length !== payload.core.entries.length
    || !payload.core.entries.every(entry => readback.coreKpis.filter(candidate =>
      candidate.kpiId === entry.kpiId && candidate.kpiVersionKey === entry.kpiVersionKey
      && candidate.active === true).length === 1)
    || !payload.core.entries.every(entry => readback.coreTargets.filter(candidate =>
      candidate.targetVersionKey === entry.targetVersionKey && candidate.kpiId === entry.kpiId
      && candidate.performanceYear === performanceYear && candidate.status === 'Approved').length === 1)) return false;

  if (readback.frameworkSets.length !== 1
    || readback.frameworkSets[0].frameworkVersion !== payload.behaviours.frameworkVersion
    || readback.frameworkSets[0].published !== true || readback.frameworkSets[0].immutable !== true
    || readback.personAssignments.length !== 1
    || readback.personAssignments[0].personKey !== actorPersonKey
    || readback.personAssignments[0].frameworkVersion !== payload.behaviours.frameworkVersion
    || readback.personAssignments[0].roleTier !== payload.behaviours.roleTier
    || readback.personAssignments[0].active !== true
    || readback.behaviourValues.length !== payload.behaviours.entries.length) return false;

  if (!payload.behaviours.entries.every((entry, index) => readback.behaviourValues.filter(candidate =>
    candidate.frameworkValueKey === `${payload.behaviours.frameworkVersion}|${entry.valueId}`
    && candidate.frameworkVersion === payload.behaviours.frameworkVersion
    && candidate.valueId === entry.valueId && candidate.governedOrder === index + 1
    && candidate.roleTier === payload.behaviours.roleTier
    && candidate.descriptorKey === entry.descriptorKey).length === 1)) return false;

  const promptCoordinates = payload.behaviours.entries.flatMap(entry =>
    entry.guidancePromptKeys.map(promptKey => ({ promptKey, behaviourKey: entry.valueId }))
  );
  if (new Set(promptCoordinates.map(item => item.promptKey)).size !== promptCoordinates.length
    || readback.prompts.length !== promptCoordinates.length) return false;
  if (!promptCoordinates.every(expected => readback.prompts.filter(candidate =>
    candidate.promptKey === expected.promptKey && candidate.behaviourKey === expected.behaviourKey
    && candidate.roleTier === payload.behaviours.roleTier && candidate.active === true).length === 1)) return false;
  return validateGovernedBehaviourExtensionReferences(payload, actorPersonKey, readback);
};

// Full closed native row bodies are retained. Catalogue artifact hashes inside the unchanged
// Draft catalogue vocabulary are preserved data, never used as a runtime digest substitute.
const referenceSchemas: Readonly<Record<string, readonly string[]>> = {
  Kpi: ['kpiId','kpiVersionKey','active'],
  Target: ['targetVersionKey','kpiId','performanceYear','status','role','annual','q1','q2','q3','q4'],
  Framework: ['frameworkVersion','published','immutable'],
  Assignment: ['personKey','frameworkVersion','roleTier','roleLevelCode','active'],
  Value: ['frameworkValueKey','frameworkVersion','valueId','governedOrder','roleTier','descriptorKey'],
  Prompt: ['promptKey','behaviourKey','roleTier','active'],
  Catalogue: ['catalogueId','catalogueVersion','catalogueRevision','catalogueEtag','catalogueContentSha256','approvalReference','published','immutable','asOfDate','effectiveFrom'],
  Headline: ['behaviourKey','headlineTitle','governedOrder'],
  Focus: ['behaviourKey','focusKey','focusTitle','roleLevelCode','status','effectiveFrom'],
  BehaviourTarget: ['behaviourKey','focusKey','focusTitle','roleLevelCode','status','effectiveFrom','targetKey','selectedWording']
};
export function validateV4References(set: V4ReferenceSet, payload: IOptionEWorkplanSubmitPayload, actor: string, year: number): void {
  v4ExactKeys(set, ['rows','asOf']); requireThat(timestamp(set.asOf), 'ReferenceClock');
  const groups: Record<string, Record<string, unknown>[]> = {};
  requireThat(Array.isArray(set.rows) && new Set(set.rows.map(r => `${r.kind}|${r.key}`)).size === set.rows.length, 'ReferenceUniqueness');
  set.rows.forEach(row => {
    v4ExactKeys(row, ['kind','key','itemId','etag','version','body']);
    requireThat(typeof row.kind === 'string' && !!referenceSchemas[row.kind] && typeof row.key === 'string' && !!row.key
      && Number.isSafeInteger(row.itemId) && row.itemId > 0 && v4Etag(row.etag) && typeof row.version === 'string' && !!row.version, 'ReferenceCoordinates');
    const body = parseV4Canonical(row.body);
    const optionalEnd = (row.kind === 'Catalogue' || row.kind === 'Focus' || row.kind === 'BehaviourTarget') && !!body && Object.prototype.hasOwnProperty.call(body, 'effectiveTo');
    v4ExactKeys(body, [...referenceSchemas[row.kind], ...(optionalEnd ? ['effectiveTo'] : [])]);
    (groups[row.kind] || (groups[row.kind] = [])).push(body);
  });
  const refs = {
    coreKpis: groups.Kpi || [], coreTargets: groups.Target || [], frameworkSets: groups.Framework || [],
    personAssignments: groups.Assignment || [], behaviourValues: groups.Value || [], prompts: groups.Prompt || [],
    governedBehaviourAuthority: groups.Catalogue?.[0], governedBehaviourHeadlines: groups.Headline,
    governedBehaviourFocuses: groups.Focus, governedBehaviourTargets: groups.BehaviourTarget
  } as unknown as IOptionEAuthoritativeReferenceReadback;
  requireThat((groups.Catalogue || []).length === (payload.behaviours.governedExtension ? 1 : 0), 'CatalogueCardinality');
  requireThat(validateAuthoritativeReferences(payload, actor, year, refs), 'ProtectedReferencesMismatch');
  payload.core.entries.forEach(entry => {
    const targets = (groups.Target || []).filter(t => t.targetVersionKey === entry.targetVersionKey);
    requireThat(targets.length === 1 && ['role','annual','q1','q2','q3','q4'].every(k => v4Equal(targets[0][k], (entry as unknown as Record<string, unknown>)[k])), 'TargetBodyMismatch');
  });
}

function validateAuthority(a: V4Authority, key: string): void {
  v4ExactKeys(a, ['request','draft','references','actor','manager','control']);
  v4ExactKeys(a.request, ['itemId','etag','version','createdBy','body','query']);
  [a.actor,a.manager].forEach(p => {
    v4ExactKeys(p, ['key','principal','active','version',...(Object.prototype.hasOwnProperty.call(p,'manager') ? ['manager'] : [])]);
    requireThat(typeof p.key === 'string' && !!p.key && typeof p.version === 'string' && !!p.version
      && Number.isSafeInteger(p.principal) && p.principal > 0 && (!Object.prototype.hasOwnProperty.call(p,'manager') || typeof p.manager === 'string'), 'PeopleTypes');
  });
  v4ExactKeys(a.control, ['workplan','person','year','draftId','manager','hierarchyEpoch','aclEpoch','etag','state','transition',
    ...(Object.prototype.hasOwnProperty.call(a.control,'command') ? ['command'] : []),...(Object.prototype.hasOwnProperty.call(a.control,'snapshot') ? ['snapshot'] : [])]);
  const request = parseV4Request(a.request.body);
  requireThat(v4Equal(request, a.request.query) && identityKey(a) === key, 'RequestQueryMismatch');
  requireThat(v4Equal(a.draft, request.source), 'SourceMismatch');
  requireThat(v4Equal(a.references, parseV4Canonical(request.referenceBody)), 'ReferenceBodyMismatch');
  requireThat(v4Etag(a.request.etag) && a.request.itemId > 0 && Number.isSafeInteger(a.request.itemId) && typeof a.request.version === 'string' && !!a.request.version, 'RequestCoordinates');
  requireThat(a.actor.active === true && a.manager.active === true && a.request.createdBy === a.actor.principal
    && a.actor.key === request.person && a.actor.manager === a.manager.key && a.control.manager === a.manager.key
    && a.actor.principal > 0 && a.manager.principal > 0 && a.actor.principal !== a.manager.principal
    && !!a.actor.version && !!a.manager.version, 'ProtectedActorManagerMismatch');
  const c = a.control;
  requireThat(c.workplan === request.workplan && c.person === request.person && c.year === request.year && c.draftId === a.draft.itemId
    && v4Etag(c.etag) && Number.isSafeInteger(c.hierarchyEpoch) && c.hierarchyEpoch > 0 && Number.isSafeInteger(c.aclEpoch) && c.aclEpoch >= 0 && c.aclEpoch <= c.hierarchyEpoch, 'ProtectedControlMismatch');
  validateV4References(a.references, parseV4Draft(a.draft.body), a.actor.key, c.year);
}
const withoutEtag = (c: V4Control): Omit<V4Control, 'etag'> => Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'etag')) as unknown as Omit<V4Control,'etag'>;
function nextControl(admission: V4Admission, phase: 'claimed' | 'pointed' | 'completed'): Omit<V4Control, 'etag'> {
  const base = withoutEtag(admission.authority.control);
  const claimed = { ...base, transition: 'Submitting' as const, command: admission.key };
  const pointed = { ...claimed, state: 'Submitted' as const, transition: 'AclPending' as const, snapshot: admission.key };
  if (phase === 'claimed') return claimed; if (phase === 'pointed') return pointed;
  const rest = Object.fromEntries(Object.entries(pointed).filter(([k]) => k !== 'command')) as unknown as Omit<V4Control,'etag'>;
  return { ...rest, transition: 'Ready', aclEpoch: base.hierarchyEpoch };
}
const snapshotFor = (a: V4Admission): V4Snapshot => ({ key: a.key, admission: a, body: a.authority.draft.body, referencesBody: v4Canonical(a.authority.references) });
function phaseControl(a:V4Admission, cp:V4Checkpoint):Omit<V4Control,'etag'> {
  if(cp === 'Validated') return withoutEtag(a.authority.control);
  if(cp === 'ControlClaimed' || cp === 'SnapshotWritten' || cp === 'AuditWritten') return nextControl(a,'claimed');
  if(cp === 'ControlPointed' || cp === 'AclVerified') return nextControl(a,'pointed');
  return nextControl(a,'completed');
}
function exactPhaseControl(op:V4JournalOperation,current:V4Control):boolean {
  if(!v4Etag(op.controlReadback.etag) || !v4Equal(withoutEtag(op.controlReadback),phaseControl(op.admission,op.checkpoint))) return false;
  if(op.checkpoint === 'Validated' && !v4Equal(op.controlReadback,op.admission.authority.control)) return false;
  if(!op.controlIntent) return v4Equal(current,op.controlReadback);
  const next = op.checkpoint === 'Validated' ? 'claimed' : op.checkpoint === 'AuditWritten' ? 'pointed' : op.checkpoint === 'AclVerified' ? 'completed' : undefined;
  if(!next || !v4Equal(op.controlIntent.before,op.controlReadback) || !v4Equal(op.controlIntent.after,nextControl(op.admission,next))) return false;
  // Changed ETag is admitted only beside our prior durable exact-CAS intent and its complete planned body.
  return v4Equal(current,op.controlReadback) || (v4Etag(current.etag) && current.etag !== op.controlReadback.etag && v4Equal(withoutEtag(current),op.controlIntent.after));
}
export function v4AclPlan(a: V4Admission, principals: V4Store['binding']['principals']): V4AclReadback {
  const ids = [principals.content, principals.acl, principals.recovery, a.authority.actor.principal, a.authority.manager.principal];
  requireThat(ids.every(n => Number.isSafeInteger(n) && n > 0) && new Set(ids).size === 5, 'AutomationPrincipalCollision');
  return { admissionKey:a.key, hierarchyEpoch:a.authority.control.hierarchyEpoch, aclEpoch:a.authority.control.hierarchyEpoch,
    targets:['Draft','Snapshot','Operation','Control'].map(kind => ({ key:`${a.authority.control.workplan}/${kind}/${a.key}`, inherited:false, complete:true,
      grants:[{principal:principals.content,role:kind === 'Snapshot' ? 'AppendOnly' as const : 'MutatorNoDelete' as const},
        {principal:principals.acl,role:'AclReconciler' as const},{principal:principals.recovery,role:'FullControl' as const},
        {principal:a.authority.actor.principal,role:'Read' as const},
        ...(kind === 'Draft' ? [] : [{principal:a.authority.manager.principal,role:'Read' as const}])]
    })) };
}
function receiptMatches(r: V4Receipt | undefined, a: V4Admission): r is V4Receipt {
  if (!r) return false; const { nativeCreated, ...rest } = r;
  return timestamp(nativeCreated) && Math.abs(Date.parse(nativeCreated) - Date.parse(a.eventAt)) <= 300000
    && v4Equal(rest, { key: a.key, admission: a, snapshot: snapshotFor(a) });
}

/** No native adapter ships here. Every effect is unique-key, exact-body readback or exact ETag CAS. */
export class OptionEWorkplanSubmitExactBodyV4 {
  public constructor(private readonly store: V4JournalStore, private readonly hook?: (checkpoint: V4Checkpoint) => void) {}
  public async submit(key: string): Promise<V4Result> {
    let admitted = false;
    try {
      const binding = this.store.binding;
      validateV4SourceDomainBinding(binding);
      const first = copy(await this.store.readAuthority(key)); const second = copy(await this.store.readAuthority(key));
      requireThat(v4Equal(first, second), 'AuthorityDoubleReadMismatch'); validateAuthority(first, key);
      let op = await this.store.readOperation(key);
      if (op) {
        admitted = true; requireThat(v4Etag(op.etag) && V4_CHECKPOINTS.includes(op.checkpoint), 'CheckpointInvalid');
        const original = op.admission.authority;
        const { control: currentControl, ...currentOrigins } = first;
        const { control: originalControl, ...originalOrigins } = original;
        requireThat(v4Equal(currentOrigins,originalOrigins), 'CommandCollision');
        requireThat(v4Equal(currentControl,await this.store.readControl(originalControl.workplan)) && exactPhaseControl(op,currentControl), 'RecoveryControlDrift');
        requireThat(op.admission.key === key && timestamp(op.admission.eventAt), 'AdmissionInvalid');
      } else {
        requireThat((first.control.state === 'Draft' || first.control.state === 'ChangesRequested') && first.control.transition === 'Ready'
          && !first.control.command && !first.control.snapshot, 'StateNotSubmittable');
        const eventAt = this.store.now(); requireThat(timestamp(eventAt), 'TrustedClockInvalid');
        const admission = copy({ key, authority: first, eventAt });
        const created = await (async () => { try { return await this.store.createOperation(admission); } catch { return await this.store.readOperation(key); } })();
        // This variable belongs to this submit invocation. Unique storage/CAS, not this local variable, arbitrate concurrent calls.
        // eslint-disable-next-line require-atomic-updates
        op = created;
        admitted = true; requireThat(!!op && v4Equal(op!.admission, admission) && op!.checkpoint === 'Validated' && v4Etag(op!.etag), 'UniqueClaimUncertainOrCollision');
        this.hook?.('Validated');
      }
      const admission = copy(op!.admission);
      const checkOrigin = async (): Promise<V4Control> => {
        const now = copy(await this.store.readAuthority(key)); validateAuthority(now, key);
        const { control: current, ...origins } = now;
        const { control: original, ...admittedOrigins } = admission.authority;
        requireThat(v4Equal(origins,admittedOrigins), 'AuthorityDrift');
        const actual = copy(await this.store.readControl(original.workplan));
        const durable = await this.store.readOperation(key);
        requireThat(v4Equal(current,actual), 'AuthorityControlReadbackDivergence');
        requireThat(!!durable && v4Equal(durable!.admission,admission) && v4Etag(durable!.etag) && exactPhaseControl(durable!,actual), 'PhaseControlDrift');
        return actual;
      };
      const advance = async (checkpoint: V4Checkpoint): Promise<void> => {
        const current = await checkOrigin(); const before = await this.store.readOperation(key);
        requireThat(!!before && v4Equal(before!.admission, admission) && v4Etag(before!.etag), 'OperationDrift');
        if (V4_CHECKPOINTS.indexOf(before!.checkpoint) < V4_CHECKPOINTS.indexOf(checkpoint) || (checkpoint === 'Completed' && before!.outcome !== 'Completed')) {
          try { await this.store.advance(key, before!.etag, checkpoint, current); } catch { /* Resolve only by exact durable readback. */ }
        }
        const after = await this.store.readOperation(key);
        requireThat(!!after && v4Equal(after!.admission, admission) && after!.checkpoint === checkpoint && v4Etag(after!.etag)
          && v4Equal(after!.controlReadback,current) && !after!.controlIntent, 'CheckpointReadback');
        op = after; this.hook?.(checkpoint);
      };
      const cas = async (from: Omit<V4Control, 'etag'>, to: Omit<V4Control, 'etag'>): Promise<void> => {
        let c = await checkOrigin();
        if (v4Equal(withoutEtag(c), to)) return;
        requireThat(v4Etag(c.etag) && v4Equal(withoutEtag(c), from), 'ControlCASMismatch');
        if (v4Equal(from, withoutEtag(admission.authority.control))) requireThat(c.etag === admission.authority.control.etag, 'ControlSourceETagChanged');
        const before = await this.store.readOperation(key);
        requireThat(!!before && v4Equal(before!.admission,admission), 'ControlIntentOperation');
        const intent={before:c,after:to};
        if(!before!.controlIntent) { try { await this.store.prepareControl(key,before!.etag,intent); } catch { /* exact intent readback below */ } }
        const prepared = await this.store.readOperation(key);
        requireThat(!!prepared && v4Equal(prepared!.controlIntent,intent) && v4Equal(prepared!.controlReadback,c), 'ControlIntentReadback');
        c = await checkOrigin();
        try { await this.store.casControl(c.workplan, c.etag, to); } catch { /* no blind retry */ }
        c = await checkOrigin(); requireThat(v4Etag(c.etag) && v4Equal(withoutEtag(c), to), 'ControlReadback');
      };
      const reached = (c: V4Checkpoint): boolean => V4_CHECKPOINTS.indexOf(op!.checkpoint) >= V4_CHECKPOINTS.indexOf(c);
      const snap = snapshotFor(admission);
      if (!reached('ControlClaimed')) { await cas(withoutEtag(admission.authority.control), nextControl(admission, 'claimed')); await advance('ControlClaimed'); }
      else await checkOrigin();
      await checkOrigin();
      let actualSnapshot = await this.store.readSnapshot(key);
      if (!actualSnapshot && !reached('SnapshotWritten')) { try { await this.store.createSnapshot(snap); } catch { /* uncertain response */ } actualSnapshot = await this.store.readSnapshot(key); }
      requireThat(!!actualSnapshot && v4Equal(actualSnapshot, snap), 'SnapshotReadback');
      if (!reached('SnapshotWritten')) await advance('SnapshotWritten');
      await checkOrigin(); let receipt = await this.store.readReceipt(key);
      if (!receipt && !reached('AuditWritten')) {
        try { await this.store.createReceipt({ key, admission, snapshot: snap }); } catch { /* uncertain response */ }
        receipt = await this.store.readReceipt(key);
      }
      requireThat(receiptMatches(receipt, admission), 'ReceiptReadback'); if (!reached('AuditWritten')) await advance('AuditWritten');
      if (!reached('ControlPointed')) { await cas(nextControl(admission,'claimed'), nextControl(admission,'pointed')); await advance('ControlPointed'); }
      await checkOrigin(); const expectedAcl = await this.store.expectedAcl(admission);
      requireThat(v4Equal(expectedAcl, v4AclPlan(admission, binding.principals)), 'AclPlanNotLeastPrivilege');
      requireThat(expectedAcl.admissionKey === key && expectedAcl.hierarchyEpoch === admission.authority.control.hierarchyEpoch
        && expectedAcl.aclEpoch === expectedAcl.hierarchyEpoch && expectedAcl.targets.length === 4
        && new Set(expectedAcl.targets.map(t => t.key)).size === 4 && expectedAcl.targets.every(t => t.complete === true && t.inherited === false
          && new Set(t.grants.map(g => g.principal)).size === t.grants.length && t.grants.every(g => Number.isSafeInteger(g.principal) && g.principal > 0)), 'AclPlanInvalid');
      let acl = await this.store.readAcl(key);
      if (!v4Equal(acl || null, expectedAcl) && !reached('AclVerified')) { try { await this.store.applyAcl(admission); } catch { /* exact readback below */ } acl = await this.store.readAcl(key); }
      requireThat(v4Equal(acl || null, expectedAcl), 'AclReadback'); if (!reached('AclVerified')) await advance('AclVerified');
      if (!reached('Completed')) { await cas(nextControl(admission,'pointed'),nextControl(admission,'completed')); await advance('Completed'); }
      await checkOrigin(); requireThat(v4Equal(withoutEtag(await this.store.readControl(first.control.workplan)),nextControl(admission,'completed'))
        && v4Equal(await this.store.readSnapshot(key), snap) && receiptMatches(await this.store.readReceipt(key), admission)
        && v4Equal(await this.store.readAcl(key), expectedAcl), 'CompletionReadback');
      if ((await this.store.readOperation(key))?.outcome !== 'Completed') await advance('Completed');
      return { outcome: 'Completed', receipt: copy(receipt!) };
    } catch (error) {
      let reason = error instanceof Error ? error.message : 'Unknown';
      if (admitted) {
        try {
          const current = await this.store.readOperation(key);
          requireThat(!!current && v4Etag(current!.etag), 'HoldOperationMissing');
          try { await this.store.hold(key,current!.etag,reason); } catch { /* uncertain hold response */ }
          const held = await this.store.readOperation(key);
          requireThat(!!held && held!.outcome === 'RecoveryHold' && held!.holdReason === reason && v4Equal(held!.admission,current!.admission), 'HoldReadbackUncertain');
        } catch { reason = `HoldReadbackUncertain:${reason}`; }
      }
      return { outcome: admitted ? 'RecoveryHold' : 'Rejected', reason };
    }
  }
}
