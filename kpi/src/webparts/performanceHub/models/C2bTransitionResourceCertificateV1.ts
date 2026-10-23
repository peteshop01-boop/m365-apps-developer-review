import { C2B_FILE_LEAF_BYTES, C2B_FILE_PAGE_BYTES, C2B_FILE_PAGE_FANOUT,
  parseStorageJson, storageAdd, storageCanonical, storageFraming, storageInteger, storagePurpose, storageRequire,
  type C2bFilePurpose } from './C2bFileStorageV1Models';
import { acquireC2bLease, assertValidC2bJournal, completeC2bReceipt, confirmC2bStableRead,
  holdC2bPostFinaliseEffect, issueNextC2bEffect, recoverC2bEffect, recoverC2bPostFinaliseEffect,
  settleC2bEffect, type C2bCommandJournal } from '../services/TestPilotCommandAdmissionC2b';

/** A calculation is never a reservation, provider assertion or native authorisation. */
export interface C2bResourceBodyV1 {
  readonly body: string | Uint8Array;
  readonly declaredUtf8Bytes: number;
  readonly purpose: C2bFilePurpose;
}
export interface C2bResourceBodyCalculationV1 {
  readonly kind: 'kcf.kpi.body-resource-calculation.v1';
  readonly nativeAuthorisation: false;
  readonly original: string | Uint8Array;
  readonly bytes: Uint8Array;
  readonly utf8Bytes: number;
  readonly utf16Units: number | null;
  readonly leaves: number;
  readonly pagesByLevel: readonly number[];
  readonly files: number;
  readonly manifestBytes: number;
  readonly storedBytes: number;
  readonly fileCreates: number;
  readonly singleStableHydrationVerifications: number;
  readonly doubleStableHydrationVerifications: number;
  readonly nativeRequestCount: 'NOT_CALCULATED_WITHOUT_PROVIDER_CONTRACT';
}

function multiply(a: number, b: number): number {
  storageInteger(a); storageInteger(b); const result = a * b; storageInteger(result); return result;
}

/**
 * A data-only snapshot: no JSON round-trip, user accessors, toJSON, canonical clone,
 * caller mutation or freeze. In particular, own __proto__ keys remain own keys.
 */
export function snapshotC2bResourceOriginalV1<T>(input: T): T {
  const active = new Set<object>();
  const visit = (value: unknown): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      storageRequire(Number.isFinite(value), 'RESOURCE_NONFINITE'); return value;
    }
    storageRequire(typeof value === 'object' && value !== null && !active.has(value), 'RESOURCE_DATA_OR_CYCLE');
    if (value instanceof Uint8Array) {
      storageRequire(Object.getPrototypeOf(value) === Uint8Array.prototype
        && value.buffer instanceof ArrayBuffer, 'RESOURCE_BYTE_BUFFER');
      return new Uint8Array(value);
    }
    const array = Array.isArray(value);
    storageRequire(array ? Object.getPrototypeOf(value) === Array.prototype
      : Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
    'RESOURCE_PLAIN_DATA');
    storageRequire(Object.getOwnPropertySymbols(value).length === 0, 'RESOURCE_SYMBOL');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).filter(key => !(array && key === 'length'));
    if (array) storageRequire(keys.length === value.length
      && keys.every((key, i) => key === String(i)), 'RESOURCE_ARRAY');
    active.add(value);
    const result: unknown[] | Record<string, unknown> = array ? [] : Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = descriptors[key];
      storageRequire(descriptor.enumerable && 'value' in descriptor, 'RESOURCE_ACCESSOR_OR_HIDDEN');
      Object.defineProperty(result, key, { value: visit(descriptor.value), enumerable: true, writable: true, configurable: true });
    }
    active.delete(value); return result;
  };
  return visit(input) as T;
}

/**
 * Exact framing storage lengths are determined by fixed-width GUID/hash locators
 * and actual child lengths. These placeholder values are used ONLY to measure
 * canonical page widths; they are never exposed as file identities or descriptors.
 */
export function measureC2bResourceBodyV1(input: C2bResourceBodyV1): C2bResourceBodyCalculationV1 {
  const captured = snapshotC2bResourceOriginalV1(input);
  storageRequire(Object.keys(captured).sort().join('|') === 'body|declaredUtf8Bytes|purpose', 'RESOURCE_BODY_KEYS');
  storagePurpose(captured.purpose); storageInteger(captured.declaredUtf8Bytes);
  storageRequire(typeof captured.body === 'string' || captured.body instanceof Uint8Array, 'RESOURCE_BODY');
  const bytes = typeof captured.body === 'string' ? new TextEncoder().encode(captured.body) : new Uint8Array(captured.body);
  storageRequire(bytes.length === captured.declaredUtf8Bytes, 'RESOURCE_DECLARED_BYTES');
  const framing = storageFraming(bytes.length);
  let lengths = Array.from({ length: framing.leaves }, (_, i) =>
    Math.min(C2B_FILE_LEAF_BYTES, bytes.length - i * C2B_FILE_LEAF_BYTES));
  let manifestBytes = 0;
  for (let level = 0; level < framing.depth; level++) {
    const next: number[] = [];
    for (let offset = 0; offset < lengths.length; offset += C2B_FILE_PAGE_FANOUT) {
      const page = { k: 'kcf.kpi.content-page.v1', p: captured.purpose, l: level,
        e: lengths.slice(offset, offset + C2B_FILE_PAGE_FANOUT).map(n => ({
          u: '00000000-0000-0000-0000-000000000000', v: '1.0', n, h: '0'.repeat(64) })) };
      const length = new TextEncoder().encode(storageCanonical(page)).length;
      storageRequire(length <= C2B_FILE_PAGE_BYTES, 'RESOURCE_PAGE_BYTES');
      manifestBytes = storageAdd(manifestBytes, length); next.push(length);
    }
    storageRequire(next.length === framing.pages[level], 'RESOURCE_PAGE_POPULATION'); lengths = next;
  }
  const single = storageAdd(framing.files, 1);
  return { kind: 'kcf.kpi.body-resource-calculation.v1', nativeAuthorisation: false,
    original: captured.body, bytes, utf8Bytes: bytes.length,
    utf16Units: typeof captured.body === 'string' ? captured.body.length : null,
    leaves: framing.leaves, pagesByLevel: framing.pages, files: framing.files, manifestBytes,
    storedBytes: storageAdd(bytes.length, manifestBytes), fileCreates: framing.files,
    singleStableHydrationVerifications: single, doubleStableHydrationVerifications: multiply(single, 2),
    nativeRequestCount: 'NOT_CALCULATED_WITHOUT_PROVIDER_CONTRACT' };
}

type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer R] ? R : never;
export type C2bKnownResourceTransitionV1 =
  | { readonly kind: 'AcquireLease'; readonly args: Tail<Parameters<typeof acquireC2bLease>> }
  | { readonly kind: 'IssueEffect'; readonly args: Tail<Parameters<typeof issueNextC2bEffect>> }
  | { readonly kind: 'SettleEffect'; readonly args: Tail<Parameters<typeof settleC2bEffect>> }
  | { readonly kind: 'ConfirmStableRead'; readonly args: Tail<Parameters<typeof confirmC2bStableRead>> }
  | { readonly kind: 'CompleteReceipt'; readonly args: Tail<Parameters<typeof completeC2bReceipt>> }
  | { readonly kind: 'HoldPostFinalise'; readonly args: Tail<Parameters<typeof holdC2bPostFinaliseEffect>> }
  | { readonly kind: 'RecoverEffect'; readonly args: Tail<Parameters<typeof recoverC2bEffect>> }
  | { readonly kind: 'RecoverPostFinalise'; readonly args: Tail<Parameters<typeof recoverC2bPostFinaliseEffect>> };

export interface C2bSyntheticResourceBoundsV1 {
  readonly retainedStorageBytes: number;
  readonly simultaneousBodyBytes: number;
  readonly fileCreates: number;
  readonly doubleStableHydrationVerifications: number;
}
export interface C2bKnownTransitionResourceInputV1 {
  /** Exact original wire in an explicit logical domain; never a trusted physical source row. */
  readonly commandDomain: 'logical-payload' | 'annual-admission-envelope-v2';
  readonly commandWire: string;
  readonly currentJournalWire: string;
  readonly nextJournalWire: string;
  /** Complete earlier versions 1 .. current.journalVersion-1 in order. No retry/history cap. */
  readonly historyJournalWires: readonly string[];
  readonly transition: C2bKnownResourceTransitionV1;
  readonly syntheticBounds: C2bSyntheticResourceBoundsV1;
}
export interface C2bKnownResourceInventoryEntryV1 {
  readonly id: string;
  readonly domain: 'original-command-wire' | 'original-journal-wire' | 'derived-logical-copy';
  readonly purpose: C2bFilePurpose;
  /** Every JSON value occurrence in this complete body, using RFC 6901 pointers.
   * An embedded field is covered by its owning body's bytes, not a second file.
   * Equal values in different body IDs remain separately counted copies. */
  readonly valuePaths: readonly string[];
  readonly copyBasis: 'COMPLETE_BODY_WITH_EMBEDDED_VALUES';
  readonly calculation: C2bResourceBodyCalculationV1;
}
export interface C2bKnownResourceTotalsV1 {
  readonly objects: number;
  readonly bodyBytes: number;
  readonly manifestBytes: number;
  readonly retainedStorageBytes: number;
  readonly leaves: number;
  readonly pages: number;
  readonly fileCreates: number;
  readonly doubleStableHydrationVerifications: number;
}
export interface C2bKnownTransitionResourceCalculationV1 {
  readonly kind: 'kcf.kpi.known-logical-transition-calculation.v1';
  readonly scope: 'KNOWN_ORIGINAL_LOGICAL_TRANSITION_ONLY';
  readonly nativeAuthorisation: false;
  readonly hostCapacityProved: false;
  readonly fullTransitionCertificate: { readonly status: 'HOLD'; readonly missingDefinitions: readonly string[] };
  readonly original: C2bKnownTransitionResourceInputV1;
  readonly commandKey: string;
  readonly currentVersion: number;
  readonly nextVersion: number;
  readonly inventory: readonly C2bKnownResourceInventoryEntryV1[];
  readonly currentIds: readonly string[];
  readonly nextIds: readonly string[];
  readonly retainedIds: readonly string[];
  /** Same named immutable representations used by both projections; never content-based deduplication. */
  readonly sharedIds: readonly string[];
  /** Consumed arguments include recovery evidence which is absent from the next journal. */
  readonly transitionIds: readonly string[];
  readonly current: C2bKnownResourceTotalsV1;
  readonly next: C2bKnownResourceTotalsV1;
  readonly retained: C2bKnownResourceTotalsV1;
  /** All distinct serialised body copies present simultaneously, not measured JS heap. */
  readonly simultaneousBodyBytes: number;
  readonly syntheticBounds: C2bSyntheticResourceBoundsV1;
}

function journal(wire: string): C2bCommandJournal {
  storageRequire(typeof wire === 'string', 'RESOURCE_JOURNAL_WIRE');
  const result = parseStorageJson(wire) as C2bCommandJournal;
  assertValidC2bJournal(result); storageInteger(result.journalVersion, 1); return result;
}

function valuePaths(value: unknown): readonly string[] {
  const paths: string[] = [];
  const visit = (item: unknown, pointer: string): void => {
    paths.push(pointer);
    if (item !== null && typeof item === 'object') {
      Object.keys(item).forEach(key => visit((item as Record<string, unknown>)[key],
        pointer + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1')));
    }
  };
  visit(value, ''); return paths;
}
function transitionNext(current: C2bCommandJournal, transition: C2bKnownResourceTransitionV1): C2bCommandJournal {
  storageRequire(Object.keys(transition).sort().join('|') === 'args|kind' && Array.isArray(transition.args), 'RESOURCE_TRANSITION');
  const arity: Readonly<Record<string, number>> = { AcquireLease: 4, IssueEffect: 5, SettleEffect: 6,
    ConfirmStableRead: 6, CompleteReceipt: 7, HoldPostFinalise: 7, RecoverEffect: 4, RecoverPostFinalise: 7 };
  storageRequire(Object.prototype.hasOwnProperty.call(arity, transition.kind)
    && transition.args.length === arity[transition.kind], 'RESOURCE_TRANSITION_ARGS');
  // The imported APIs are typed, but this data-only boundary also receives
  // runtime values. An unknown outcome must not fall through to NotApplied or
  // Unknown merely because a source transition uses an else branch.
  if (transition.kind === 'SettleEffect') storageRequire(
    transition.args[1].outcome === 'Confirmed' || transition.args[1].outcome === 'Unknown', 'RESOURCE_SETTLEMENT_OUTCOME');
  if (transition.kind === 'HoldPostFinalise') storageRequire(
    transition.args[1].outcome === 'DefinitiveFailure' || transition.args[1].outcome === 'Unknown', 'RESOURCE_HOLD_OUTCOME');
  if (transition.kind === 'RecoverEffect') storageRequire(
    transition.args[1].outcome === 'Confirmed' || transition.args[1].outcome === 'NotApplied', 'RESOURCE_RECOVERY_OUTCOME');
  if (transition.kind === 'RecoverPostFinalise') storageRequire(
    transition.args[1].outcome === 'NotApplied', 'RESOURCE_RECOVERY_OUTCOME');
  switch (transition.kind) {
    case 'AcquireLease': return acquireC2bLease(current, ...transition.args);
    case 'IssueEffect': return issueNextC2bEffect(current, ...transition.args);
    case 'SettleEffect': return settleC2bEffect(current, ...transition.args);
    case 'ConfirmStableRead': return confirmC2bStableRead(current, ...transition.args);
    case 'CompleteReceipt': return completeC2bReceipt(current, ...transition.args);
    case 'HoldPostFinalise': return holdC2bPostFinaliseEffect(current, ...transition.args);
    case 'RecoverEffect': return recoverC2bEffect(current, ...transition.args);
    case 'RecoverPostFinalise': return recoverC2bPostFinaliseEffect(current, ...transition.args);
    default: throw new Error('C2B_FILE_RESOURCE_UNKNOWN_TRANSITION');
  }
}

/**
 * Derives membership from complete original journals and the real existing pure
 * transition function. No caller inventory/completeness flag is accepted. This
 * deliberately does not issue the whole-transition certificate: physical/raw,
 * orphan-registry and host-buffer membership have no admitted closed definition.
 */
export function calculateC2bKnownTransitionResourcesV1(input: C2bKnownTransitionResourceInputV1): C2bKnownTransitionResourceCalculationV1 {
  const original = snapshotC2bResourceOriginalV1(input);
  storageRequire(Object.keys(original).sort().join('|') ===
    'commandDomain|commandWire|currentJournalWire|historyJournalWires|nextJournalWire|syntheticBounds|transition', 'RESOURCE_INPUT_KEYS');
  storageRequire(Object.keys(original.syntheticBounds).sort().join('|') ===
    'doubleStableHydrationVerifications|fileCreates|retainedStorageBytes|simultaneousBodyBytes', 'RESOURCE_BOUND_KEYS');
  Object.values(original.syntheticBounds).forEach(v => storageInteger(v));
  const current = journal(original.currentJournalWire); const next = journal(original.nextJournalWire);
  storageRequire(next.journalVersion === storageAdd(current.journalVersion, 1), 'RESOURCE_NEXT_VERSION');
  const plan = storageCanonical(current.plan);
  storageRequire(storageCanonical(next.plan) === plan, 'RESOURCE_PLAN_CHANGED');
  storageRequire(storageCanonical(transitionNext(current, original.transition)) === storageCanonical(next), 'RESOURCE_NEXT_TRANSITION_MISMATCH');
  storageRequire(typeof original.commandWire === 'string', 'RESOURCE_COMMAND_WIRE');
  const command = parseStorageJson(original.commandWire.charCodeAt(0) === 0xFEFF ? original.commandWire.slice(1) : original.commandWire);
  let payload: unknown = command;
  if (original.commandDomain === 'annual-admission-envelope-v2') {
    storageRequire(command !== null && typeof command === 'object' && !Array.isArray(command), 'RESOURCE_COMMAND_ENVELOPE');
    const envelope = command as Record<string, unknown>;
    storageRequire(Object.keys(envelope).sort().join('|') === 'binding|expected|payload|schemaVersion'
      && envelope.schemaVersion === 'kcf.kpi.test-command.v2', 'RESOURCE_COMMAND_ENVELOPE');
    storageRequire(envelope.binding !== null && typeof envelope.binding === 'object' && !Array.isArray(envelope.binding), 'RESOURCE_COMMAND_BINDING');
    const binding = envelope.binding as Record<string, unknown>;
    storageRequire(binding.commandKey === current.plan.commandKey && binding.commandType === current.plan.commandType
      && binding.personKey === current.plan.personKey && binding.performanceYear === current.plan.performanceYear, 'RESOURCE_COMMAND_BINDING');
    payload = envelope.payload;
  } else storageRequire(original.commandDomain === 'logical-payload', 'RESOURCE_COMMAND_DOMAIN');
  storageRequire(storageCanonical(payload) === storageCanonical(parseStorageJson(current.plan.payloadCanonical)), 'RESOURCE_COMMAND_MISMATCH');
  storageRequire(Array.isArray(original.historyJournalWires)
    && original.historyJournalWires.length === current.journalVersion - 1, 'RESOURCE_INCOMPLETE_HISTORY');
  const history = original.historyJournalWires.map((wire, index) => {
    const state = journal(wire);
    storageRequire(state.journalVersion === index + 1 && storageCanonical(state.plan) === plan, 'RESOURCE_HISTORY_IDENTITY');
    return state;
  });
  // Every admitted source transition preserves existing outcome audits and may
  // append new ones. Individually valid versions cannot conceal a lost/rewritten
  // earlier audit population. This is not a claim of authenticated history.
  const versions = [...history, current, next];
  versions.slice(1).forEach((state, index) => {
    const before = versions[index].outcomeAudits;
    storageRequire(state.outcomeAudits.length >= before.length
      && before.every((audit, ordinal) => storageCanonical(audit) === storageCanonical(state.outcomeAudits[ordinal])),
    'RESOURCE_HISTORY_AUDIT_CHANGED');
  });
  const entries = new Map<string, C2bKnownResourceInventoryEntryV1>();
  const add = (id: string, purpose: C2bFilePurpose, value: unknown,
    domain: C2bKnownResourceInventoryEntryV1['domain'] = 'derived-logical-copy', exactWire = false): string => {
    const body = exactWire ? value as string : storageCanonical(value);
    storageRequire(typeof body === 'string', 'RESOURCE_COPY_BODY');
    const previous = entries.get(id);
    if (previous) {
      storageRequire(previous.purpose === purpose && previous.domain === domain
        && previous.calculation.original === body, 'RESOURCE_CONFLICTING_COPY'); return id;
    }
    const decoded = exactWire ? parseStorageJson(body.charCodeAt(0) === 0xFEFF ? body.slice(1) : body) : value;
    entries.set(id, { id, purpose, domain, valuePaths: valuePaths(decoded), copyBasis: 'COMPLETE_BODY_WITH_EMBEDDED_VALUES',
      calculation: measureC2bResourceBodyV1({ body, purpose, declaredUtf8Bytes: new TextEncoder().encode(body).length }) });
    return id;
  };
  const common: string[] = [add('command/original', 'command', original.commandWire, 'original-command-wire', true),
    add('command/logical', 'command', current.plan.payloadCanonical, 'derived-logical-copy', true),
    add('plan', 'plan', current.plan), add('intended', 'desired', current.plan.intendedImage)];
  const keys = new Set<string>();
  current.plan.effects.forEach((effect, index) => {
    storageRequire(!keys.has(effect.effectKey), 'RESOURCE_DUPLICATE_EFFECT'); keys.add(effect.effectKey);
    const prefix = 'plan/effects/' + index;
    common.push(add(prefix, 'effect', effect), add(prefix + '/before', 'before', effect.beforeFields),
      add(prefix + '/desired', 'desired', effect.desiredFields));
  });
  const stateIds = (state: C2bCommandJournal, wire: string): string[] => {
    const prefix = 'journal/' + state.journalVersion; const ids = common.slice();
    ids.push(add(prefix, 'journal', wire, 'original-journal-wire', true));
    state.effects.forEach((effect, index) => {
      const p = prefix + '/effects/' + index; ids.push(add(p, 'effect', effect));
      if (effect.confirmation !== null) ids.push(add(p + '/confirmation', 'confirmation', effect.confirmation),
        add(p + '/readback', 'observation-projection', effect.confirmation.readback));
    });
    if (state.stableRead !== null) {
      ids.push(add(prefix + '/stable-read', 'confirmation', state.stableRead));
      (['first', 'second'] as const).forEach(side => {
        const observation = state.stableRead![side];
        storageRequire(observation.pagination.complete === true && observation.pagination.nextLink === null
          && observation.pagination.totalCount === observation.items.length
          && observation.items.length === state.plan.intendedImage.items.length, 'RESOURCE_PARTIAL_OBSERVATION');
        storageInteger(observation.pagination.pageCount, 1);
        ids.push(add(prefix + '/stable-read/' + side, 'observation-projection', observation));
      });
    }
    if (state.receipt !== null) {
      ids.push(add(prefix + '/receipt', 'receipt', state.receipt), add(prefix + '/receipt/actor-access', 'receipt', state.receipt.actorAccess),
        add(prefix + '/receipt/result-keys', 'receipt', state.receipt.resultKeys), add(prefix + '/receipt/audit-keys', 'receipt', state.receipt.auditKeys));
    }
    if (state.recoveryHold !== null) ids.push(add(prefix + '/recovery', 'recovery', state.recoveryHold),
      add(prefix + '/recovery/before', 'before', state.recoveryHold.proof.beforeFields),
      add(prefix + '/recovery/readback', 'observation-projection', state.recoveryHold.proof.readback));
    ids.push(add(prefix + '/outcome-audits', 'history', state.outcomeAudits));
    state.outcomeAudits.forEach((audit, index) => ids.push(add(prefix + '/outcome-audits/' + index, 'history', audit)));
    storageRequire(new Set(ids).size === ids.length, 'RESOURCE_DUPLICATE_ROLE'); return ids;
  };
  history.forEach((state, index) => stateIds(state, original.historyJournalWires[index]));
  const currentIds = stateIds(current, original.currentJournalWire);
  const nextIds = stateIds(next, original.nextJournalWire);
  // The typed transition is a complete retained logical value. In particular,
  // NotApplied and Ready-restoration proofs are consumed but not stored by the
  // existing state machine. Do not let them disappear from the resource sum.
  const transitionIds = [add('transition/original', 'history', original.transition)];
  const sharedIds = currentIds.filter(id => nextIds.includes(id));
  const retainedIds = Array.from(entries.keys());
  const total = (ids: readonly string[]): C2bKnownResourceTotalsV1 => {
    let bodyBytes = 0; let manifestBytes = 0; let leaves = 0; let pages = 0; let fileCreates = 0; let verifications = 0;
    ids.forEach(id => {
      const entry = entries.get(id)!; const c = entry.calculation;
      bodyBytes = storageAdd(bodyBytes, c.utf8Bytes); manifestBytes = storageAdd(manifestBytes, c.manifestBytes);
      leaves = storageAdd(leaves, c.leaves); pages = storageAdd(pages, c.pagesByLevel.reduce(storageAdd, 0));
      fileCreates = storageAdd(fileCreates, c.files); verifications = storageAdd(verifications, c.doubleStableHydrationVerifications);
    });
    return { objects: ids.length, bodyBytes, manifestBytes, retainedStorageBytes: storageAdd(bodyBytes, manifestBytes),
      leaves, pages, fileCreates, doubleStableHydrationVerifications: verifications };
  };
  const retained = total(retainedIds); const bounds = original.syntheticBounds;
  storageRequire(retained.retainedStorageBytes <= bounds.retainedStorageBytes
    && retained.bodyBytes <= bounds.simultaneousBodyBytes && retained.fileCreates <= bounds.fileCreates
    && retained.doubleStableHydrationVerifications <= bounds.doubleStableHydrationVerifications, 'RESOURCE_SYNTHETIC_BOUND');
  return { kind: 'kcf.kpi.known-logical-transition-calculation.v1', scope: 'KNOWN_ORIGINAL_LOGICAL_TRANSITION_ONLY',
    nativeAuthorisation: false, hostCapacityProved: false,
    fullTransitionCertificate: { status: 'HOLD', missingDefinitions: [
      'Closed complete physical/raw response and failure-copy population per native operation',
      'Authoritative private/accepted/orphan/binding/inventory/seal/attempt retained membership',
      'Provider read/write/request counts and simultaneous host buffer lifetimes' ] },
    original, commandKey: current.plan.commandKey, currentVersion: current.journalVersion, nextVersion: next.journalVersion,
    inventory: Array.from(entries.values()), currentIds, nextIds, retainedIds, sharedIds, transitionIds,
    current: total(currentIds), next: total(nextIds), retained,
    simultaneousBodyBytes: retained.bodyBytes, syntheticBounds: bounds };
}
