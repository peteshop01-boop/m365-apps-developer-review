/** @jest-environment node */
"use strict";
import { calculateC2bKnownTransitionResourcesV1, measureC2bResourceBodyV1, snapshotC2bResourceOriginalV1,
  type C2bKnownTransitionResourceInputV1 } from './C2bTransitionResourceCertificateV1';
import { storageFraming, storageCanonical } from './C2bFileStorageV1Models';
import { acquireC2bLease, admitC2bPlan, C2B_SCHEMA_REVISION, issueNextC2bEffect,
  settleC2bEffect, confirmC2bStableRead, completeC2bReceipt, holdC2bPostFinaliseEffect,
  recoverC2bEffect, recoverC2bPostFinaliseEffect, hashC2bCanonical,
  type C2bCommandJournal, type C2bCommandEffect, type C2bEffectConfirmation,
  type C2bStableReadProof, type C2bTerminalReceipt, type C2bPostFinaliseHoldProof,
  type C2bRecoveryProof } from '../services/TestPilotCommandAdmissionC2b';
import type { C2bKnownResourceTransitionV1, C2bKnownTransitionResourceCalculationV1 } from './C2bTransitionResourceCertificateV1';
import { planCreateWorkplanDraftC2b, type C2bTrustedPerson } from '../services/TestPilotCommandAdmissionC2bHandlers';

describe('complete original resource body calculations', () => {
  test.each([0, 1, 1000000, 1000001, 64000000, 64000001, 65000001])('retains every byte at %i bytes', length => {
    const body = new Uint8Array(length); body.fill(65); if (length) body[length - 1] = 231;
    const result = measureC2bResourceBodyV1({ body, declaredUtf8Bytes: length, purpose: 'history' });
    expect(result.utf8Bytes).toBe(length);
    expect(Buffer.compare(Buffer.from(result.bytes.buffer), Buffer.from(body.buffer))).toBe(0);
    expect(Buffer.compare(Buffer.from((result.original as Uint8Array).buffer), Buffer.from(body.buffer))).toBe(0);
    expect(result.bytes).not.toBe(body); expect(result.original).not.toBe(body);
    expect(result.files).toBe(storageFraming(length).files);
    expect(result.nativeAuthorisation).toBe(false);
    if (length === 65000001) {
      expect(result.leaves).toBe(66); expect(result.pagesByLevel).toEqual([2, 1]); expect(result.files).toBe(69);
    }
  });
  test('independent hand-calculated empty and one-byte page/storage/verification counts', () => {
    const empty = measureC2bResourceBodyV1({ body: '', declaredUtf8Bytes: 0, purpose: 'history' });
    // {"e":[{"h":"<64>","n":0,"u":"<36>","v":"1.0"}],"k":"kcf.kpi.content-page.v1","l":0,"p":"history"}
    // 89 punctuation/key/value-literal bytes + fixed 36 GUID + 64 hash bytes = 189.
    expect(empty.manifestBytes).toBe(189); expect(empty.storedBytes).toBe(189);
    expect(empty.leaves).toBe(1); expect(empty.pagesByLevel).toEqual([1]); expect(empty.files).toBe(2);
    expect(empty.singleStableHydrationVerifications).toBe(3); expect(empty.doubleStableHydrationVerifications).toBe(6);
  });
  test('BOM, supplementary and combining Unicode are retained without normalisation', () => {
    const body = '\uFEFF{"__proto__":{"kept":"e\u0301 😀"}}';
    const result = measureC2bResourceBodyV1({ body, declaredUtf8Bytes: new TextEncoder().encode(body).length, purpose: 'command' });
    expect(result.original).toBe(body); expect(new TextDecoder('utf8', { ignoreBOM: true }).decode(result.bytes)).toBe(body);
  });
  test('data snapshot keeps own special keys and never freezes or mutates the caller', () => {
    const original = JSON.parse('{"__proto__":{"kept":true},"constructor":"original","a":[1,null]}');
    const result = snapshotC2bResourceOriginalV1(original);
    expect(Object.prototype.hasOwnProperty.call(result, '__proto__')).toBe(true);
    expect(JSON.stringify(result)).toBe(JSON.stringify(original));
    expect(Object.isFrozen(original)).toBe(false); original.__proto__.kept = false;
    expect(result.__proto__.kept).toBe(true);
  });
  test.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 2])('rejects incorrect declared bytes %s', declaredUtf8Bytes => {
    expect(() => measureC2bResourceBodyV1({ body: 'a', declaredUtf8Bytes, purpose: 'command' })).toThrow();
  });
  test('rejects getters without invoking them, hidden fields, sparse arrays and cycles', () => {
    let invoked = false; const accessor = { get value(): string { invoked = true; return 'x'; } };
    expect(() => snapshotC2bResourceOriginalV1(accessor)).toThrow(); expect(invoked).toBe(false);
    expect(() => snapshotC2bResourceOriginalV1(Object.defineProperty({}, 'hidden', { value: 1 }))).toThrow();
    expect(() => snapshotC2bResourceOriginalV1(new Array(2))).toThrow();
    const cyclic: { value?: unknown } = {}; cyclic.value = cyclic;
    expect(() => snapshotC2bResourceOriginalV1(cyclic)).toThrow();
  });
});

function originalTransition(): C2bKnownTransitionResourceInputV1 {
  const employee: C2bTrustedPerson = { personKey: 'PERSON-001', email: 'employee@example.invalid', displayName: 'Synthetic Employee', active: true,
    roles: ['Employee'], managerPersonKey: 'PERSON-002', managerEmail: 'manager@example.invalid' };
  const manager: C2bTrustedPerson = { personKey: 'PERSON-002', email: 'manager@example.invalid', displayName: 'Synthetic Manager', active: true,
    roles: ['Employee', 'Manager'], managerPersonKey: null, managerEmail: null };
  const plan = planCreateWorkplanDraftC2b({ commandKey: '59271670-824e-4911-ac53-c1cd0c345072',
    commandType: 'CreateWorkplanDraft', personKey: employee.personKey, performanceYear: 2027, payload: {} }, employee.email,
  employee, manager, { schemaRevision: C2B_SCHEMA_REVISION, performanceYear: 2027,
    behaviourContractVersion: 'CONFIGURED-BEHAVIOUR-VERSION', initialState: 'Draft', initialAccessState: 'EmployeeEdit',
    initialTransitionStatus: 'Ready', processorPrincipalKey: 'PROCESSOR-001', adminPrincipalKeys: ['ADMIN-GROUP-001'] },
  { current: [{ listPurpose: 'Workplans', acl: { containerKey: 'PERSON-001', breaksInheritanceAtContainer: true,
    canonicalChildrenInherit: true, allowedPrincipals: [{ principalKey: 'SITE-MEMBERS', permission: 'Read', source: 'Admin' }],
    revokedPrincipalKeys: [] } }] });
  const current = admitC2bPlan(undefined, plan, '2026-10-03T21:00:00Z').journal;
  const args: ['owner', string, string, number] = ['owner', '2026-10-03T21:00:00Z', '2026-10-03T22:00:00Z', current.journalVersion];
  const next = acquireC2bLease(current, ...args);
  return { commandDomain: 'logical-payload', commandWire: plan.payloadCanonical, currentJournalWire: JSON.stringify(current), nextJournalWire: JSON.stringify(next),
    historyJournalWires: [], transition: { kind: 'AcquireLease', args }, syntheticBounds: { retainedStorageBytes: Number.MAX_SAFE_INTEGER,
      simultaneousBodyBytes: Number.MAX_SAFE_INTEGER, fileCreates: Number.MAX_SAFE_INTEGER, doubleStableHydrationVerifications: Number.MAX_SAFE_INTEGER } };
}

describe('known original current/next transition population', () => {
  test('derives complete inventories, retains every original and counts shared representations once', () => {
    const input = originalTransition(); const result = calculateC2bKnownTransitionResourcesV1(input);
    const current = JSON.parse(input.currentJournalWire); const effects = current.plan.effects.length;
    // Shared: 4 command/plan/intended + 3 per effect. Each version: journal + effects + audit array.
    expect(result.current.objects).toBe(6 + 4 * effects);
    expect(result.next.objects).toBe(6 + 4 * effects);
    // The consumed transition arguments form one additional retained body.
    expect(result.retained.objects).toBe(9 + 5 * effects);
    expect(result.retained.fileCreates).toBe(2 * result.retained.objects);
    expect(result.retained.doubleStableHydrationVerifications).toBe(6 * result.retained.objects);
    const independentBytes = result.inventory.reduce((n, row) => n + Buffer.byteLength(row.calculation.original as string), 0);
    expect(result.retained.bodyBytes).toBe(independentBytes);
    expect(result.simultaneousBodyBytes).toBe(independentBytes);
    expect(result.original).toEqual(input); expect(result.original).not.toBe(input);
    expect(result.fullTransitionCertificate.status).toBe('HOLD'); expect(result.hostCapacityProved).toBe(false);
    expect(result.nativeAuthorisation).toBe(false);
  });
  test('retains all earlier complete versions while advancing an actual ordered effect', () => {
    const input = originalTransition(); const current = JSON.parse(input.nextJournalWire);
    const args: [string, string, number, string, number] = [current.effects[0].effectKey, 'owner', current.leaseEpoch,
      '2026-10-03T21:01:00Z', current.journalVersion];
    const next = issueNextC2bEffect(current, ...args);
    const result = calculateC2bKnownTransitionResourcesV1({ ...input,
      historyJournalWires: [input.currentJournalWire], currentJournalWire: input.nextJournalWire,
      nextJournalWire: JSON.stringify(next), transition: { kind: 'IssueEffect', args } });
    expect(result.retainedIds).toContain('journal/1'); expect(result.currentIds).toContain('journal/2');
    expect(result.nextIds).toContain('journal/3'); expect(result.retainedIds.length).toBe(new Set(result.retainedIds).size);
  });
  test.each(['retainedStorageBytes', 'simultaneousBodyBytes', 'fileCreates', 'doubleStableHydrationVerifications'] as const)(
    'denies insufficient or unknown synthetic %s', key => {
      const input = originalTransition();
      expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, syntheticBounds: { ...input.syntheticBounds, [key]: 0 } })).toThrow();
      expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, syntheticBounds: { ...input.syntheticBounds, [key]: NaN } })).toThrow();
    });
  test('denies unknown transition, wrong CAS, next mismatch and command mismatch', () => {
    const input = originalTransition();
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, transition: { kind: 'Anything', args: [] } } as unknown as C2bKnownTransitionResourceInputV1)).toThrow();
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, transition: { kind: 'AcquireLease', args: ['owner', '2026-10-03T21:00:00Z', '2026-10-03T22:00:00Z', 2] } })).toThrow();
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, nextJournalWire: input.currentJournalWire })).toThrow();
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, commandWire: '{"omitted":true}' })).toThrow();
  });
  test('denies omitted, duplicate or conflicting retained history and extra caller inventory assertions', () => {
    const input = originalTransition();
    for (const historyJournalWires of [[input.currentJournalWire], [input.currentJournalWire, input.currentJournalWire], ['{}']]) {
      expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, historyJournalWires })).toThrow();
    }
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, inventoryComplete: true } as C2bKnownTransitionResourceInputV1)).toThrow();
    const next = JSON.parse(input.nextJournalWire); next.effects.pop();
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, nextJournalWire: JSON.stringify(next) })).toThrow();
  });
});

const replayNow = '2026-10-03T21:01:00Z';
const replayExpiry = '2026-10-03T22:00:00Z';
type Replay = { state: C2bCommandJournal; wires: string[]; input: C2bKnownTransitionResourceInputV1;
  last?: C2bKnownTransitionResourceCalculationV1 };
function replay(): Replay {
  const input = originalTransition();
  return { state: JSON.parse(input.currentJournalWire) as C2bCommandJournal, wires: [], input };
}
function advance(run: Replay, transition: C2bKnownResourceTransitionV1): C2bKnownTransitionResourceCalculationV1 {
  let next: C2bCommandJournal;
  switch (transition.kind) {
    case 'AcquireLease': next = acquireC2bLease(run.state, ...transition.args); break;
    case 'IssueEffect': next = issueNextC2bEffect(run.state, ...transition.args); break;
    case 'SettleEffect': next = settleC2bEffect(run.state, ...transition.args); break;
    case 'ConfirmStableRead': next = confirmC2bStableRead(run.state, ...transition.args); break;
    case 'CompleteReceipt': next = completeC2bReceipt(run.state, ...transition.args); break;
    case 'HoldPostFinalise': next = holdC2bPostFinaliseEffect(run.state, ...transition.args); break;
    case 'RecoverEffect': next = recoverC2bEffect(run.state, ...transition.args); break;
    case 'RecoverPostFinalise': next = recoverC2bPostFinaliseEffect(run.state, ...transition.args); break;
  }
  const input = { ...run.input, currentJournalWire: JSON.stringify(run.state), nextJournalWire: JSON.stringify(next),
    historyJournalWires: run.wires.slice(), transition };
  const result = calculateC2bKnownTransitionResourcesV1(input);
  reconcileFullCopies(input, result);
  expect(result.original).toEqual(input);
  expect(result.currentVersion + 1).toBe(result.nextVersion);
  for (const [index, wire] of Array.from([...run.wires, input.currentJournalWire, input.nextJournalWire].entries())) {
    expect(result.inventory.find(row => row.id === 'journal/' + (index + 1))!.calculation.original).toBe(wire);
  }
  expect(result.fullTransitionCertificate.status).toBe('HOLD');
  expect(result.nativeAuthorisation).toBe(false); expect(result.hostCapacityProved).toBe(false);
  run.wires.push(input.currentJournalWire); run.state = next; run.input = input; run.last = result;
  return result;
}
function acquire(run: Replay): void {
  advance(run, { kind: 'AcquireLease', args: ['owner', replayNow, replayExpiry, run.state.journalVersion] });
}
function issue(run: Replay): C2bCommandEffect {
  const effect = run.state.effects.find(value => value.disposition !== 'Confirmed')!;
  advance(run, { kind: 'IssueEffect', args: [effect.effectKey, 'owner', run.state.leaseEpoch, replayNow, run.state.journalVersion] });
  return run.state.effects.find(value => value.effectKey === effect.effectKey)!;
}
function confirmationFor(state: C2bCommandJournal, effect: C2bCommandEffect): C2bEffectConfirmation {
  const source = state.effects.find(value => value.effectKey === effect.expectedETagFromEffectKey);
  const writesCanonical = ['Claim', 'CanonicalUpsert', 'Finalise'].includes(effect.kind);
  return { providerReference: 'PROOF-' + effect.sequence, naturalKey: effect.naturalKey,
    requestETag: source ? source.confirmation!.observedETag : effect.expectedETag,
    observedETag: writesCanonical ? '"written-' + effect.sequence + '"' : null,
    observedRowVersionToken: writesCanonical ? effect.desiredFields.RowVersionToken as number : null,
    readback: effect.desiredFields };
}
function observationFor(state: C2bCommandJournal): C2bStableReadProof {
  const stable = state.effects.find(value => value.kind === 'StableRead')!;
  const prior = state.effects.filter(value => value.sequence < stable.sequence);
  const observation = { header: { ...state.plan.intendedImage.header, etag: '"stable-header"',
    rowVersionToken: state.plan.intendedImage.header.fields.RowVersionToken as number },
  items: state.plan.intendedImage.items.map((item, i) => ({ ...item, etag: '"item-' + i + '"',
    rowVersionToken: item.fields.RowVersionToken as number })), acls: [...state.plan.intendedImage.acls],
  pagination: { complete: true, pageCount: 1, totalCount: state.plan.intendedImage.items.length, nextLink: null,
    affectedNaturalKeys: state.plan.intendedImage.items.map(item => item.naturalKey) },
  auditKeys: prior.filter(value => value.kind === 'AuditAppend').map(value => value.naturalKey),
  effectEvidenceSha256: prior.map(value => value.confirmationSha256!), processorEpoch: state.leaseEpoch };
  return { first: observation, second: snapshotC2bResourceOriginalV1(observation) };
}
function receiptFor(state: C2bCommandJournal): C2bTerminalReceipt {
  return { receiptKey: state.plan.commandKey, commandKey: state.plan.commandKey, outcome: 'Accepted',
    planSha256: state.plan.planSha256, payloadSha256: state.plan.payloadSha256,
    canonicalSha256: state.stableRead!.readbackSha256,
    resultKeys: [state.plan.subjectKey, ...state.plan.intendedImage.items.map(item => item.naturalKey)].sort(),
    auditKeys: state.effects.filter(value => value.kind === 'AuditAppend').map(value => value.naturalKey),
    actorAccess: state.effects.find(value => value.kind === 'ReceiptGrant')!.desiredFields.actorAccess as C2bTerminalReceipt['actorAccess'],
    processorReference: 'FULL-RECEIPT', completedAt: replayNow };
}
function settle(run: Replay, effect: C2bCommandEffect): void {
  const state = run.state;
  if (effect.kind === 'StableRead') {
    advance(run, { kind: 'ConfirmStableRead', args: [effect.effectKey, observationFor(state), 'owner',
      state.leaseEpoch, replayNow, state.journalVersion] });
  } else if (effect.kind === 'ReceiptGrant') {
    const created = state.effects.find(value => value.kind === 'ReceiptCreate')!;
    const receipt = created.confirmation!.readback.receipt as C2bTerminalReceipt;
    const proof: C2bEffectConfirmation = { providerReference: 'RECEIPT-ACCESS', naturalKey: effect.naturalKey,
      requestETag: created.confirmation!.observedETag, observedETag: '"receipt-2"', observedRowVersionToken: null,
      readback: { operation: 'GrantReceiptRead', receiptKey: receipt.receiptKey,
        receiptSha256: hashC2bCanonical(receipt), actorAccess: receipt.actorAccess } };
    advance(run, { kind: 'CompleteReceipt', args: [effect.effectKey, receipt, proof, 'owner',
      state.leaseEpoch, replayNow, state.journalVersion] });
  } else {
    const proof = effect.kind === 'ReceiptCreate' ? { providerReference: 'RECEIPT-CREATE', naturalKey: effect.naturalKey,
      requestETag: null, observedETag: '"receipt-1"', observedRowVersionToken: null,
      readback: { operation: 'CreateAfterStableRead', receipt: receiptFor(state) } } : confirmationFor(state, effect);
    advance(run, { kind: 'SettleEffect', args: [effect.effectKey, { outcome: 'Confirmed', proof }, 'owner',
      state.leaseEpoch, replayNow, state.journalVersion] });
  }
}
function issueThrough(run: Replay, kind: C2bCommandEffect['kind']): C2bCommandEffect {
  acquire(run);
  while (true) { const effect = issue(run); if (effect.kind === kind) return effect; settle(run, effect); }
}
function holdProofFor(state: C2bCommandJournal): C2bPostFinaliseHoldProof {
  return { providerReference: 'COMPLETE-HOLD', naturalKey: state.plan.subjectKey,
    requestETag: state.effects.find(value => value.kind === 'Finalise')!.confirmation!.observedETag!,
    observedETag: '"held-header"', observedRowVersionToken: state.plan.intendedImage.header.fields.RowVersionToken as number,
    processorEpoch: state.leaseEpoch, beforeFields: state.plan.intendedImage.header.fields,
    readback: { ...state.plan.intendedImage.header.fields, AccessState: 'RecoveryHold',
      TransitionStatus: 'Held', TransitionCorrelationKey: state.plan.commandKey } };
}

/** Independent expected copy list from the full supplied typed states. No
 * calculator IDs, byte totals, body measurements or framing results are inputs. */
function reconcileFullCopies(input: C2bKnownTransitionResourceInputV1, result: C2bKnownTransitionResourceCalculationV1): void {
  const states = [...input.historyJournalWires, input.currentJournalWire, input.nextJournalWire]
    .map(wire => JSON.parse(wire) as C2bCommandJournal);
  const plan = states[0].plan;
  const expected = new Map<string, unknown>(); const wires = new Map<string, string>();
  expected.set('command/original', JSON.parse(input.commandWire.replace(/^\uFEFF/, '')));
  wires.set('command/original', input.commandWire);
  expected.set('command/logical', JSON.parse(plan.payloadCanonical)); wires.set('command/logical', plan.payloadCanonical);
  expected.set('plan', plan); expected.set('intended', plan.intendedImage);
  plan.effects.forEach((effect, i) => {
    expected.set('plan/effects/' + i, effect); expected.set('plan/effects/' + i + '/before', effect.beforeFields);
    expected.set('plan/effects/' + i + '/desired', effect.desiredFields);
  });
  const commonCount = 4 + 3 * plan.effects.length;
  const counts = states.map((state, ordinal) => {
    const root = 'journal/' + state.journalVersion;
    expected.set(root, state); wires.set(root, [...input.historyJournalWires, input.currentJournalWire, input.nextJournalWire][ordinal]);
    state.effects.forEach((effect, i) => {
      const p = root + '/effects/' + i; expected.set(p, effect);
      if (effect.confirmation) { expected.set(p + '/confirmation', effect.confirmation); expected.set(p + '/readback', effect.confirmation.readback); }
    });
    if (state.stableRead) {
      expected.set(root + '/stable-read', state.stableRead);
      expected.set(root + '/stable-read/first', state.stableRead.first); expected.set(root + '/stable-read/second', state.stableRead.second);
    }
    if (state.receipt) {
      expected.set(root + '/receipt', state.receipt); expected.set(root + '/receipt/actor-access', state.receipt.actorAccess);
      expected.set(root + '/receipt/result-keys', state.receipt.resultKeys); expected.set(root + '/receipt/audit-keys', state.receipt.auditKeys);
    }
    if (state.recoveryHold) {
      expected.set(root + '/recovery', state.recoveryHold); expected.set(root + '/recovery/before', state.recoveryHold.proof.beforeFields);
      expected.set(root + '/recovery/readback', state.recoveryHold.proof.readback);
    }
    expected.set(root + '/outcome-audits', state.outcomeAudits);
    state.outcomeAudits.forEach((audit, i) => expected.set(root + '/outcome-audits/' + i, audit));
    return 2 + state.effects.length + 2 * state.effects.filter(effect => effect.confirmation !== null).length
      + (state.stableRead ? 3 : 0) + (state.receipt ? 4 : 0) + (state.recoveryHold ? 3 : 0) + state.outcomeAudits.length;
  });
  expected.set('transition/original', input.transition);
  expect(result.retained.objects).toBe(commonCount + counts.reduce((n, x) => n + x, 0) + 1);
  expect(result.current.objects).toBe(commonCount + counts[counts.length - 2]);
  expect(result.next.objects).toBe(commonCount + counts[counts.length - 1]);
  expect([...result.retainedIds].sort()).toEqual(Array.from(expected.keys()).sort());
  expect(result.sharedIds.length).toBe(commonCount);
  expect(result.transitionIds).toEqual(['transition/original']);
  expect(result.currentIds).not.toContain('transition/original'); expect(result.nextIds).not.toContain('transition/original');
  // Sorting JSON keys independently retains special own keys via entry tuples.
  const ordered = (v: unknown): unknown => Array.isArray(v) ? v.map(ordered)
    : v !== null && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, value]) => [key, ordered(value)])) : v;
  let bytes = 0; let leaves = 0; let pages = 0;
  for (const [id, body] of Array.from(expected)) {
    const entry = result.inventory.find(row => row.id === id)!;
    const wire = wires.get(id) ?? JSON.stringify(ordered(body));
    const encoded = Buffer.from(wire, 'utf8'); bytes += encoded.length;
    expect(entry.calculation.original).toBe(wire); expect(Buffer.from(entry.calculation.bytes).equals(encoded)).toBe(true);
    expect(entry.calculation.utf8Bytes).toBe(encoded.length); expect(entry.copyBasis).toBe('COMPLETE_BODY_WITH_EMBEDDED_VALUES');
    let nodes = Math.max(1, Math.ceil(encoded.length / 1000000)); leaves += nodes;
    do { nodes = Math.ceil(nodes / 64); pages += nodes; } while (nodes > 1);
    const expectedPaths: string[] = []; const pending: Array<[unknown, string]> = [[body, '']];
    while (pending.length) {
      const [value, pointer] = pending.pop()!; expectedPaths.push(pointer);
      if (value !== null && typeof value === 'object') for (const [key, child] of Object.entries(value))
        pending.push([child, pointer + '/' + key.split('~').join('~0').split('/').join('~1')]);
    }
    expect([...entry.valuePaths].sort()).toEqual(expectedPaths.sort());
    expect(new Set(entry.valuePaths).size).toBe(entry.valuePaths.length);
  }
  expect(result.retained.bodyBytes).toBe(bytes); expect(result.simultaneousBodyBytes).toBe(bytes);
  expect(result.retained.leaves).toBe(leaves); expect(result.retained.pages).toBe(pages);
  expect(result.retained.fileCreates).toBe(leaves + pages);
  expect(result.retained.doubleStableHydrationVerifications).toBe(2 * (leaves + pages + expected.size));
  expect(result.retained.retainedStorageBytes).toBe(bytes + result.retained.manifestBytes);
}

describe('complete source-defined later transition copies', () => {
  test('retains BOM/special-key command fields and includes the consumed proof in synthetic bounds', () => {
    const input = originalTransition(); const plan = (JSON.parse(input.currentJournalWire) as C2bCommandJournal).plan;
    const envelope = { schemaVersion: 'kcf.kpi.test-command.v2', binding: { commandKey: plan.commandKey,
      commandType: plan.commandType, personKey: plan.personKey, performanceYear: plan.performanceYear },
    expected: JSON.parse('{"__proto__":{"a/b~c":"e\\u0301 😀"}}'), payload: JSON.parse(plan.payloadCanonical) };
    const full = { ...input, commandDomain: 'annual-admission-envelope-v2' as const,
      commandWire: '\uFEFF' + JSON.stringify(envelope, null, 2) };
    const result = calculateC2bKnownTransitionResourcesV1(full); reconcileFullCopies(full, result);
    expect(result.inventory.find(row => row.id === 'command/original')!.valuePaths).toContain('/expected/__proto__/a~1b~0c');
    const consumed = result.inventory.find(row => row.id === 'transition/original')!;
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...full, syntheticBounds: { ...full.syntheticBounds,
      simultaneousBodyBytes: result.retained.bodyBytes - consumed.calculation.utf8Bytes } })).toThrow('RESOURCE_SYNTHETIC_BOUND');
  });
  test('executes positive SettleEffect, ConfirmStableRead and CompleteReceipt with full ordered history', () => {
    const run = replay(); acquire(run);
    while (run.state.state !== 'Terminal') settle(run, issue(run));
    expect(run.state.effects.every(value => value.disposition === 'Confirmed')).toBe(true);
    expect(run.state.stableRead).not.toBeNull(); expect(run.state.receipt).not.toBeNull();
    expect(run.state.outcomeAudits.map(value => value.outcome)).toEqual(['Accepted']);
    expect(run.last!.inventory.find(row => row.id === 'journal/' + run.state.journalVersion + '/receipt')!.calculation.original)
      .toBe(storageCanonical(run.state.receipt));
  });
  test.each(['Confirmed', 'NotApplied'] as const)('executes RecoverEffect %s and retains exact complete Held history', outcome => {
    const run = replay(); acquire(run); const effect = issue(run);
    advance(run, { kind: 'SettleEffect', args: [effect.effectKey, { outcome: 'Unknown', safeCode: 'TIMEOUT_UNKNOWN' },
      'owner', run.state.leaseEpoch, replayNow, run.state.journalVersion] });
    const proof: C2bRecoveryProof = outcome === 'Confirmed' ? { ...confirmationFor(run.state, effect), outcome }
      : { outcome, providerReference: 'NOT-APPLIED', naturalKey: effect.naturalKey, requestETag: effect.expectedETag,
        observedETag: effect.expectedETag, observedRowVersionToken: effect.expectedRowVersionToken, readback: effect.beforeFields };
    advance(run, { kind: 'RecoverEffect', args: [effect.effectKey, proof, replayNow, run.state.journalVersion] });
    expect(run.state.state).toBe('Planned');
    expect(run.state.outcomeAudits.map(value => value.outcome)).toEqual(['Held', 'Recovery']);
    expect(run.last!.inventory.some(row => row.id === 'transition/original')).toBe(true);
    const malformed = snapshotC2bResourceOriginalV1(run.input) as unknown as { transition: { args: Array<{ outcome: string }> } };
    malformed.transition.args[1].outcome = 'UNSUPPORTED';
    expect(() => calculateC2bKnownTransitionResourcesV1(malformed as unknown as C2bKnownTransitionResourceInputV1)).toThrow('RESOURCE_RECOVERY_OUTCOME');
  });
  test.each(['AuditAppend', 'StableRead', 'ReceiptCreate', 'ReceiptGrant'] as const)(
    'executes HoldPostFinalise and RecoverPostFinalise at %s preserving earlier receipt/readback bodies', kind => {
      const run = replay(); const effect = issueThrough(run, kind); const state = run.state;
      const hold = holdProofFor(state);
      advance(run, { kind: 'HoldPostFinalise', args: [effect.effectKey, { outcome: kind === 'StableRead' ? 'DefinitiveFailure' : 'Unknown',
        safeCode: 'POST_FINALISE_FAILURE', safeReason: 'Complete synthetic original failure e\u0301 😀' }, hold,
      'owner', state.leaseEpoch, replayNow, state.journalVersion] });
      expect(run.state.recoveryHold!.proof).toEqual(hold);
      const source = state.effects.find(value => value.effectKey === effect.expectedETagFromEffectKey);
      const expected = source ? source.confirmation!.observedETag : effect.expectedETag;
      const proof: C2bRecoveryProof & { outcome: 'NotApplied' } = { outcome: 'NotApplied', providerReference: 'RECOVERY-NOT-APPLIED',
        naturalKey: effect.naturalKey, requestETag: expected, observedETag: expected,
        observedRowVersionToken: effect.expectedRowVersionToken, readback: effect.beforeFields };
      const restore = { ...hold, providerReference: 'RESTORE-READY', requestETag: hold.observedETag,
        observedETag: '"restored-header"', beforeFields: hold.readback, readback: state.plan.intendedImage.header.fields };
      advance(run, { kind: 'RecoverPostFinalise', args: [effect.effectKey, proof, restore, 'owner',
        state.leaseEpoch, replayNow, run.state.journalVersion] });
      expect(run.state.recoveryHold).toBeNull(); expect(run.state.state).toBe('Planned');
      expect(run.state.outcomeAudits.map(value => value.outcome)).toEqual(['Held', 'Recovery']);
      expect(run.last!.inventory.some(row => row.id === 'transition/original')).toBe(true);
    });
  test('rejects missing/duplicate/conflicting complete versions and altered retained audit history', () => {
    const run = replay(); acquire(run); const effect = issue(run);
    advance(run, { kind: 'SettleEffect', args: [effect.effectKey, { outcome: 'Unknown', safeCode: 'FIRST_HELD' },
      'owner', run.state.leaseEpoch, replayNow, run.state.journalVersion] });
    advance(run, { kind: 'RecoverEffect', args: [effect.effectKey, { ...confirmationFor(run.state, effect), outcome: 'Confirmed' },
      replayNow, run.state.journalVersion] });
    acquire(run);
    const input = run.input;
    for (const historyJournalWires of [input.historyJournalWires.slice(1),
      [...input.historyJournalWires.slice(0, -1), input.historyJournalWires[0]],
      [...input.historyJournalWires, input.currentJournalWire]])
      expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, historyJournalWires })).toThrow();
    const altered = JSON.parse(input.historyJournalWires[3]) as C2bCommandJournal;
    const audit = altered.outcomeAudits[0]; audit.safeCode = 'CONFLICTING_HELD';
    const { evidenceSha256: _old, ...base } = audit; audit.evidenceSha256 = hashC2bCanonical(base);
    const historyJournalWires = input.historyJournalWires.slice(); historyJournalWires[3] = JSON.stringify(altered);
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, historyJournalWires })).toThrow('RESOURCE_HISTORY_AUDIT_CHANGED');
  });
  test('rejects incomplete later proofs, changed versions, duplicate JSON keys and unsafe counts', () => {
    const run = replay(); const effect = issueThrough(run, 'StableRead'); settle(run, effect);
    const input = run.input; const proof = observationFor(JSON.parse(input.currentJournalWire) as C2bCommandJournal);
    proof.first.pagination.complete = false;
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, transition: { kind: 'ConfirmStableRead',
      args: [effect.effectKey, proof, 'owner', run.state.leaseEpoch, replayNow, run.state.journalVersion - 1] } })).toThrow();
    const next = JSON.parse(input.nextJournalWire) as C2bCommandJournal; next.journalVersion += 1;
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input, nextJournalWire: JSON.stringify(next) })).toThrow('RESOURCE_NEXT_VERSION');
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...input,
      currentJournalWire: input.currentJournalWire.replace('{', '{"journalVersion":1,') })).toThrow('DUPLICATE_JSON_KEY');
    for (const key of Object.keys(input.syntheticBounds)) expect(() => calculateC2bKnownTransitionResourcesV1({ ...input,
      syntheticBounds: { ...input.syntheticBounds, [key]: Number.MAX_SAFE_INTEGER + 1 } })).toThrow();
    const tooMany = snapshotC2bResourceOriginalV1(input);
    if (tooMany.transition.kind !== 'ConfirmStableRead') throw new Error('Expected stable transition');
    tooMany.transition.args[1].first.pagination.pageCount = Number.MAX_SAFE_INTEGER + 1;
    tooMany.transition.args[1].second.pagination.pageCount = Number.MAX_SAFE_INTEGER + 1;
    const unsafeNext = confirmC2bStableRead(JSON.parse(input.currentJournalWire) as C2bCommandJournal,
      ...tooMany.transition.args);
    expect(() => calculateC2bKnownTransitionResourcesV1({ ...tooMany, nextJournalWire: JSON.stringify(unsafeNext) })).toThrow();
  });
});
