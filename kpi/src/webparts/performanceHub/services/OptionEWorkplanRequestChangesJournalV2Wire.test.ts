import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { TextEncoder } from 'util';
import type { RequestChangesJournalV2, RequestChangesControlPatch, RequestChangesEffectKindV2 } from '../models/OptionEWorkplanRequestChangesV2Models';
import { encodeRequestChangesJournalV2, parseRequestChangesJournalV2 } from './OptionEWorkplanRequestChangesJournalV2Wire';
import { canonicalReviewV1, encodeReviewCommandV1, parseReviewCommandV1, encodeReviewReceiptV1,
  parseReviewReceiptV1, parseReviewJournalV1 } from './OptionEWorkplanReviewV1Wire';

interface Golden { name: string; body: string; utf8Bytes: number; sha256: string }
const inputs: { fixtures: Golden[]; decisionAuthorityRequired: { pendingRequestKey: string; lastOperationKey: string;
  accessState: string; managerDecisionComment: string; logicalToken: number }; finalAuthorityRequired: {
  pendingRequestKey: string; lastOperationKey: string; accessState: string; managerDecisionComment: string; logicalToken: number } } = JSON.parse(readFileSync(
  'temp/test-fixtures/review/journal-v2-normal-fixtures.json', 'utf8'));
Object.assign(globalThis, { TextEncoder });
const golden = (name: string): Golden => inputs.fixtures.find(g => g.name === name)!;
const frame = (name = 'Validated'): RequestChangesJournalV2 => JSON.parse(golden(name).body);
const digest = (body: string): string => createHash('sha256').update(body, 'utf8').digest('hex').toUpperCase();
const plan: readonly RequestChangesEffectKindV2[] = ['ControlClaim', 'ReceiptCreate', 'DecisionReady', 'Acl', 'ControlRelease'];
const phases = [ ['Validated', 0], ['ControlClaimed', 1], ['ApprovedWritten', 1], ['DecisionRecorded', 2],
  ['DecisionReady', 3], ['AclVerified', 4], ['ControlReleased', 5], ['Completed', 5] ] as const;

/** Ordinary fictional observations only: employee/201, manager/202, foreign/203.
 * No source-domain fixture attests native identity, effective rights or completed effects. */
const phaseFrame = (phase: RequestChangesJournalV2['phase'], count: number): RequestChangesJournalV2 => {
  const v = frame('DecisionReady'); v.phase = phase; v.journalRevision = 10;
  v.confirmedEffects = plan.slice(0, count).map((kind, index) => {
    if (index < 3) return v.confirmedEffects[index];
    return { kind, key: kind === 'Acl' ? v.operationKey : v.before.workplanKey, bodySha256: 'A'.repeat(64),
      native: kind === 'Acl' ? { ...v.sourceCapture.native, itemId: 900 } : { ...v.headerNative, etag: '"review-control-10"', version: '10.0' } };
  });
  const stage = phases.findIndex(p => p[0] === phase);
  if (stage === 0) { v.currentControl = { ...v.before }; v.headerNative = { ...frame().headerNative }; }
  else if (stage < 4) { v.currentControl = { ...v.before, state: 'Submitted', transitionStatus: 'Reviewing', etag: '"review-control-8"' };
    v.headerNative = { ...v.headerNative, etag: v.currentControl.etag, version: '8.0' }; }
  else if (stage >= 6) { v.currentControl = { ...v.desired, etag: '"review-control-10"' };
    v.headerNative = { ...v.headerNative, etag: v.currentControl.etag, version: '10.0' }; }
  v.outcome = phase === 'Completed' ? 'Completed' : 'Running'; return v;
};
const hold = (mutate: (v: RequestChangesJournalV2) => void, name = 'Validated'): void => {
  const v = frame(name); mutate(v); expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
  expect(() => encodeRequestChangesJournalV2(v)).toThrow();
};

describe('RequestChanges journal/v2 exact ordinary bytes', () => {
  test.each(['Validated', 'DecisionReady'])('%s golden roundtrip', name => {
    const g = golden(name); const v = parseRequestChangesJournalV2(g.body);
    expect(encodeRequestChangesJournalV2(v)).toBe(g.body); expect(Buffer.byteLength(g.body, 'utf8')).toBe(g.utf8Bytes);
    expect(digest(g.body)).toBe(g.sha256); expect(v.command.reason).toBe('  Keep unfinished target; clarify its evidence.  ');
  });
  test.each(inputs.fixtures)('$name standard UTF8 and uppercase SHA256 declaration', g => {
    expect(Buffer.byteLength(g.body, 'utf8')).toBe(g.utf8Bytes); expect(digest(g.body)).toBe(g.sha256);
  });
  test('existing command/v1 and receipt/v1 bytes are reused unchanged', () => {
    const v = frame(); const body = encodeReviewCommandV1(v.command);
    expect(parseReviewCommandV1(body)).toEqual(v.command); expect(digest(body)).toBe(v.commandSource.bodySha256);
    const receipt = golden('RequestChangesReceiptV1');
    expect(encodeReviewReceiptV1(parseReviewReceiptV1(receipt.body))).toBe(receipt.body);
    expect(digest(receipt.body)).toBe(frame('DecisionReady').confirmedEffects[1].bodySha256);
  });
  test('ordinary input order is sorted without trimming reason or changing array order', () => {
    const v = frame('DecisionReady'); const raw = JSON.stringify(Object.fromEntries(Object.entries(v).reverse()), undefined, 2);
    expect(encodeRequestChangesJournalV2(parseRequestChangesJournalV2(raw))).toBe(golden('DecisionReady').body);
  });
  test('no v1/v2 fallback or migration', () => {
    expect(() => parseReviewJournalV1(golden('Validated').body)).toThrow();
    const v = frame(); expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, schemaVersion: 'kcf.kpi.option-e.review-journal/v1' }))).toThrow();
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, schemaVersion: 'unknown/v3' }))).toThrow();
  });
});

describe('fixed five effects and protected intermediate state', () => {
  test.each(phases)('%s requires exactly %i ordered proofs and actual current control', (phase, count) => {
    const v = phaseFrame(phase, count); expect(parseRequestChangesJournalV2(encodeRequestChangesJournalV2(v))).toEqual(v);
    const wrongCount = { ...v, confirmedEffects: count ? v.confirmedEffects.slice(0, -1) : [frame('DecisionReady').confirmedEffects[0]] };
    expect(() => parseRequestChangesJournalV2(JSON.stringify(wrongCount))).toThrow();
    const wrongCurrent = { ...v, currentControl: { ...v.currentControl, rowVersionToken: v.currentControl.rowVersionToken + 1 } };
    expect(() => parseRequestChangesJournalV2(JSON.stringify(wrongCurrent))).toThrow();
  });
  test.each(phases.slice(0, 6))('%s admits only its next pending effect with exact current ETag/lease', (phase, count) => {
    const v = phaseFrame(phase, count); const kind = plan[count];
    v.pendingEffect = { kind, key: kind === 'ReceiptCreate' ? `${v.operationKey}:receipt` : kind === 'Acl' ? v.operationKey : v.before.workplanKey,
      desiredSha256: 'B'.repeat(64), issuedAt: '2026-10-11T04:20:00.000Z', leaseEpoch: 1,
      ...(['ControlClaim', 'DecisionReady', 'ControlRelease'].includes(kind) ? { expectedEtag: v.currentControl.etag } : {}) };
    expect(parseRequestChangesJournalV2(encodeRequestChangesJournalV2(v)).pendingEffect).toEqual(v.pendingEffect);
    v.pendingEffect.kind = kind === 'ControlClaim' ? 'DecisionReady' : 'ControlClaim';
    expect(() => encodeRequestChangesJournalV2(v)).toThrow();
  });
  test('unknown ACL retains pending effect, owner, original token and exact hold reason', () => {
    const v = frame('DecisionReady'); v.outcome = 'RecoveryHold'; v.holdReason = 'AclCompletionUnknown';
    v.pendingEffect = { kind: 'Acl', key: v.operationKey, desiredSha256: 'B'.repeat(64), issuedAt: '2026-10-11T04:20:00.000Z', leaseEpoch: 1 };
    const read = parseRequestChangesJournalV2(encodeRequestChangesJournalV2(v));
    expect(read).toEqual(v); expect(read.currentControl.rowVersionToken).toBe(7); expect(read.desired.rowVersionToken).toBe(8);
    expect(read.lease).toEqual(v.lease); expect(read.confirmedEffects.map(e => e.kind)).toEqual(plan.slice(0, 3));
  });
  test.each(['order', 'duplicate', 'key', 'native'])('DecisionReady rejects wrong proof %s', issue => {
    hold(v => { if (issue === 'order') v.confirmedEffects.reverse();
      else if (issue === 'duplicate') v.confirmedEffects[2] = v.confirmedEffects[0];
      else if (issue === 'key') v.confirmedEffects[2].key += ':alias';
      else v.confirmedEffects[2].native.itemId += 1; }, 'DecisionReady');
  });
  test('native header version, historical ordinal and logical token stay separate', () => {
    const v = parseRequestChangesJournalV2(golden('DecisionReady').body);
    expect(v.headerNative.version).toBe('9.0'); expect(v.ordinalSource.native.version).toBe('3.0');
    expect(v.ordinalSource.value).toBe(2); expect(v.currentControl.rowVersionToken).toBe(7);
    hold(w => { w.ordinalSource.value = 0; }); hold(w => { w.ordinalSource.native.itemId++; });
    hold(w => { w.submitted.version = 7; });
  });
  test('declarations preserve owned ReadOnly/n decision and cleared EmployeeEdit/n+1 terminal boundary', () => {
    const v = frame('DecisionReady'); const decision: RequestChangesControlPatch = JSON.parse(golden('DecisionReadyPatch').body);
    const claim: RequestChangesControlPatch = JSON.parse(golden('ClaimPatch').body);
    if (decision.mode !== 'DecisionReady') throw new Error('Wrong declared decision fixture');
    const release: RequestChangesControlPatch = { ...decision, mode: 'Release', accessState: 'EmployeeEdit',
      control: { ...v.desired, state: 'ChangesRequested', transitionStatus: 'Ready' } };
    expect(canonicalReviewV1(claim)).toBe(golden('ClaimPatch').body);
    expect(canonicalReviewV1(decision)).toBe(golden('DecisionReadyPatch').body);
    expect(decision.control.rowVersionToken).toBe(inputs.decisionAuthorityRequired.logicalToken);
    expect(release.control.rowVersionToken).toBe(inputs.finalAuthorityRequired.logicalToken);
    expect(inputs.decisionAuthorityRequired.pendingRequestKey).toBe(v.operationKey);
    expect(inputs.decisionAuthorityRequired.lastOperationKey).toBe(v.operationKey);
    expect(inputs.finalAuthorityRequired.pendingRequestKey).toBe('');
    expect(release.managerDecisionComment).toBe(v.command.reason);
  });
});

describe('ordinary closed declaration and immutable source pins', () => {
  test.each(['', ' ', '\n\t'])('blank reason %j holds', reason => hold(v => { v.command.reason = reason; }));
  test.each(['workplanKey', 'personKey', 'performanceYear', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch', 'currentSubmittedSnapshotKey'])('%s cannot drift between before/current/desired', field => {
    const v = frame(); const current = { ...v.currentControl, [field]: typeof v.currentControl[field as keyof typeof v.currentControl] === 'number' ? 99 : 'foreign' };
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, currentControl: current }))).toThrow();
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, desired: { ...v.desired, [field]: current[field as keyof typeof current] } }))).toThrow();
  });
  test.each(['foreign', 'employee'])('fictional %s cannot replace assigned manager/202', personKey => hold(v => { v.actorBinding.personKey = personKey; v.actorBinding.principalId = personKey === 'foreign' ? 203 : 201; }));
  test('epochs must align and remain positive, no approved pointer, exact initial coordinates', () => {
    hold(v => { v.before.aclEpoch++; v.currentControl.aclEpoch++; v.desired.aclEpoch++; v.actorBinding.aclEpoch++; });
    hold(v => { v.before.hierarchyEpoch = 0; }); hold(v => { v.before.currentApprovedSnapshotKey = 'old-approved'; });
    hold(v => { v.command.expectedControlEtag = '"foreign"'; }); hold(v => { v.command.expectedControlVersion++; });
    hold(v => { v.command.expectedSubmittedSnapshotKey += 'foreign'; });
    hold(v => { v.headerNative.etag = '"foreign"'; }); hold(v => { v.currentControl.state = 'Draft'; });
  });
  const paths = ['command', 'commandSource', 'commandSource.native', 'actorBinding', 'actorBinding.personNative', 'before', 'currentControl',
    'desired', 'headerNative', 'submitted', 'sourceCapture', 'sourceCapture.native', 'ordinalSource', 'ordinalSource.native', 'lease', 'confirmedEffects.0', 'confirmedEffects.0.native'];
  test.each(paths)('%s rejects an undeclared ordinary field', path => {
    const v = JSON.parse(golden('DecisionReady').body);
    const node = path.split('.').reduce((parent, key) => parent[key], v); node.undeclared = 'unsupported';
    expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
  });
  test.each(['schemaVersion', 'operationKey', 'journalRevision', 'command', 'commandSource', 'actorBinding', 'before', 'currentControl', 'headerNative',
    'desired', 'submitted', 'sourceCapture', 'ordinalSource', 'phase', 'outcome', 'confirmedEffects'])('%s is required, not null or defaulted', field => {
    const v = JSON.parse(golden('Validated').body); delete v[field]; expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
    v[field] = null; expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
  });
  test('pending mutable ETag, lease epoch and unknown outcome declarations are exact', () => {
    const v = frame('DecisionReady'); v.pendingEffect = { kind: 'Acl', key: v.operationKey, desiredSha256: 'A'.repeat(64), issuedAt: '2026-10-11T04:20:00.000Z', leaseEpoch: 1 };
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, pendingEffect: { ...v.pendingEffect, expectedEtag: '"9"' } }))).toThrow();
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, pendingEffect: { ...v.pendingEffect, leaseEpoch: 2 } }))).toThrow();
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, lease: null }))).toThrow();
    hold(w => { w.outcome = 'RecoveryHold'; }); hold(w => { w.holdReason = 'unused'; });
    hold(w => { w.commandSource.bodySha256 = w.commandSource.bodySha256.toLowerCase(); });
  });
  test.each(['etag', 'missing-etag', 'lease', 'extra', 'timestamp'])('pending DecisionReady holds incorrect %s', issue => {
    const v = phaseFrame('DecisionRecorded', 2);
    v.pendingEffect = { kind: 'DecisionReady', key: v.before.workplanKey, desiredSha256: 'B'.repeat(64),
      issuedAt: '2026-10-11T04:20:00.000Z', leaseEpoch: 1, expectedEtag: v.currentControl.etag };
    const ordinary = JSON.parse(JSON.stringify(v));
    if (issue === 'etag') ordinary.pendingEffect.expectedEtag = '"foreign-control"';
    else if (issue === 'missing-etag') delete ordinary.pendingEffect.expectedEtag;
    else if (issue === 'lease') delete ordinary.lease;
    else if (issue === 'extra') ordinary.pendingEffect.undeclared = 'unsupported';
    else ordinary.pendingEffect.issuedAt = '2026-10-11';
    expect(() => parseRequestChangesJournalV2(JSON.stringify(ordinary))).toThrow();
  });
  test('retained older unknown dispatch epoch is not silently replaced by current lease', () => {
    const v = frame('DecisionReady'); v.outcome = 'RecoveryHold'; v.holdReason = 'PriorDispatchUnknown';
    v.lease = { ...v.lease!, epoch: 2 }; v.pendingEffect = { kind: 'Acl', key: v.operationKey, desiredSha256: 'B'.repeat(64),
      issuedAt: '2026-10-11T04:20:00.000Z', leaseEpoch: 1 };
    expect(parseRequestChangesJournalV2(encodeRequestChangesJournalV2(v))).toEqual(v);
  });
  test('terminal frame cannot contain pending dispatch or an unfinished outcome', () => {
    const v = phaseFrame('Completed', 5);
    expect(() => encodeRequestChangesJournalV2({ ...v, outcome: 'Running' })).toThrow();
    expect(() => encodeRequestChangesJournalV2({ ...v, phase: 'ControlReleased' })).toThrow();
    expect(() => encodeRequestChangesJournalV2({ ...v, pendingEffect: { kind: 'ControlRelease', key: v.before.workplanKey,
      expectedEtag: v.currentControl.etag, desiredSha256: 'B'.repeat(64), issuedAt: '2026-10-11T04:20:00.000Z', leaseEpoch: 1 } })).toThrow();
  });
  test('RequestChanges excludes approval fields/effects and fabricated authority fields', () => {
    const v = JSON.parse(golden('DecisionReady').body);
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, nativeOrigin: true }))).toThrow();
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, command: { ...v.command, command: 'ApproveLock' } }))).toThrow();
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, confirmedEffects: v.confirmedEffects.map((e: unknown, index: number) =>
      index === 2 ? { ...v.confirmedEffects[2], kind: 'ApprovedCreate' } : e) }))).toThrow();
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, desired: { ...v.desired, currentApprovedSnapshotKey: 'approved' } }))).toThrow();
    expect(() => parseRequestChangesJournalV2(JSON.stringify({ ...v, currentControl: { ...v.currentControl, pendingRequestKey: v.operationKey } }))).toThrow();
  });
  test('mandatory raw reason, native coordinates and numeric ordinal are never defaulted', () => {
    const v = JSON.parse(golden('Validated').body); delete v.command.reason;
    expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
    v.command.reason = null; expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
    v.command.reason = ' exact '; v.ordinalSource.value = '2'; expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
    v.ordinalSource.value = 2; v.headerNative.etag = '*'; expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
    v.headerNative.etag = v.currentControl.etag; delete v.sourceCapture.native.version;
    expect(() => parseRequestChangesJournalV2(JSON.stringify(v))).toThrow();
  });
  test('56000 exact UTF8 bytes admit multibyte raw reason, one byte more holds', () => {
    const v = frame(); v.command.reason = '  Café 🧭\nEvidence  ';
    const remaining = 56000 - Buffer.byteLength(encodeRequestChangesJournalV2(v), 'utf8'); v.command.reason += 'x'.repeat(remaining);
    const body = encodeRequestChangesJournalV2(v); expect(Buffer.byteLength(body, 'utf8')).toBe(56000);
    expect(parseRequestChangesJournalV2(body).command.reason).toBe(v.command.reason);
    expect(() => encodeRequestChangesJournalV2({ ...v, command: { ...v.command, reason: v.command.reason + 'x' } })).toThrow('RequestChangesJournalCapacity');
    expect(() => parseRequestChangesJournalV2(body + ' ')).toThrow('RequestChangesJournalCapacity');
  });
});
