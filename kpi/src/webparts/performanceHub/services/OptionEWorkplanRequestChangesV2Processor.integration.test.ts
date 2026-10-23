import { readFileSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import type { Native, ReviewAuthorityV1, ReviewJournalObservationV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { RequestChangesJournalV2, RequestChangesAudit, RequestChangesEffectKindV2 } from '../models/OptionEWorkplanRequestChangesV2Models';
import { createOptionEWorkplanRequestChangesV2Processor, type RequestChangesProcessorPorts } from './OptionEWorkplanRequestChangesV2Processor';
import { parseRequestChangesJournalV2 } from './OptionEWorkplanRequestChangesJournalV2Wire';
import { parseReviewCommandV1, parseReviewReceiptV1, canonicalReviewV1 } from './OptionEWorkplanReviewV1Wire';
import { parseV5CapturedReceipt, encodeV5CapturedSnapshot, encodeV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { v5Canonical } from './OptionEWorkplanSubmitExactBodyV5Wire';
import { OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE } from './OptionEWorkplanPhysicalSchema';
import type { RequestChangesFinalAclBinding, RequestChangesFinalAclObservation, FinalAclKind } from './OptionEWorkplanReviewSourceReadback';
import type { ReviewAuditBindings, ReviewAuditAclObservation } from './OptionEWorkplanReviewAuditSourceReadback';
import { qualifyOptionEWorkplanRequestChangesOwnedReady, confirmOptionEWorkplanRequestChangesOwnedAcl,
  createOptionEWorkplanRequestChangesFinalSourceReadback } from './OptionEWorkplanReviewSourceReadback';
import { OptionEProtectedDraftGateway } from './OptionEProtectedDraftGateway';
import { OPTION_E_WORKPLAN_LIST_BINDINGS } from './OptionEWorkplanListBindings';
import type { IOptionEDraftItemStore, IOptionEDraftPreparedPayload, IOptionEProtectedDraftBinding } from './OptionEDraftSharePointGateway';
import type { SPHttpClient, SPHttpClientConfiguration } from '@microsoft/sp-http';
Object.assign(globalThis, { TextEncoder, TextDecoder });
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const hash = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase();
const normals: { fixtures: { name: string; body: string }[] } = JSON.parse(readFileSync(
  'temp/test-fixtures/review/journal-v2-normal-fixtures.json', 'utf8'));
const receiptBytes = readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-global-r3-receipt.json', 'utf8');
const lease = { owner: 'fictional-local-owner', milliseconds: 120000 };
type MutablePorts = { -readonly [K in keyof RequestChangesProcessorPorts]: RequestChangesProcessorPorts[K] };
const fixture = (canonicalGatewayCoordinates = false): { ports: MutablePorts; source: Native; state: {
  authority: ReviewAuthorityV1; commandBody: string; author: number; journals: Map<string, ReviewJournalObservationV1>;
  audits: Map<string, RequestChangesAudit>; effects: Map<RequestChangesEffectKindV2, { bodySha256: string; native: Native }>;
  writes: string[]; traces: { kind: RequestChangesEffectKindV2; journal: RequestChangesJournalV2; authority: ReviewAuthorityV1 }[];
  now: string; aclApplied: boolean; captureReceipt?: string; captureSnapshot?: string; historicalVersion: number;
  fail?: { kind: RequestChangesEffectKindV2; when: 'before' | 'after' | 'unknown' };
} } => {
  const g = parseRequestChangesJournalV2(normals.fixtures.find(f => f.name === 'Validated')!.body);
  const capture = parseV5CapturedReceipt(receiptBytes), a = capture.snapshot.admission.authority;
  // Separate ordinary fictional fixture for the existing gateway's canonical person|year route.
  // Complete r3 frames are encoded once at fixture declaration; the processor retains them exactly.
  if (canonicalGatewayCoordinates) {
    const key = `${a.actor.key}|${a.control.year}`, query = { ...a.request.query, workplan: key };
    a.request = { ...a.request, query, body: v5Canonical(query) };
    a.control = { ...a.control, workplan: key };
    a.workplan = { ...a.workplan, value: { ...a.workplan.value, workplanKey: key } };
    g.before.workplanKey = key; g.command.expectedWorkplanKey = key;
  }
  const declaredReceiptBytes = canonicalGatewayCoordinates ? encodeV5CapturedReceipt(capture) : receiptBytes;
  const source = copy(g.commandSource.native);
  const native = (itemId: number, listId = source.listId): Native => ({ ...source, itemId, listId });
  const state = {
    authority: { header: { native: copy(g.headerNative), value: { ...copy(a.workplan.value), etag: g.before.etag,
      state: 'Submitted', transitionStatus: 'Ready', rowVersionToken: 7, workplanVersion: 2, accessState: 'ReadOnly', managerPersonKey: 'manager' } },
      control: copy(g.before), people: [
        { native: native(11), value: { personKey: 'employee', email: 'employee@kcf-test.invalid', principalId: 201, active: true, managerPersonKey: 'manager' } },
        { native: copy(g.actorBinding.personNative), value: { personKey: 'manager', email: 'manager@kcf-test.invalid', principalId: 202, active: true } },
        { native: native(13), value: { personKey: 'foreign', email: 'foreign@kcf-test.invalid', principalId: 203, active: true } }
      ] } as ReviewAuthorityV1,
    commandBody: canonicalReviewV1(g.command), author: 202, journals: new Map<string, ReviewJournalObservationV1>(),
    audits: new Map<string, RequestChangesAudit>(), effects: new Map<RequestChangesEffectKindV2, { bodySha256: string; native: Native }>(),
    writes: [] as string[], traces: [] as { kind: RequestChangesEffectKindV2; journal: RequestChangesJournalV2; authority: ReviewAuthorityV1 }[],
    now: '2026-10-11T05:10:00.000Z', aclApplied: false, captureReceipt: declaredReceiptBytes as string | undefined,
    captureSnapshot: encodeV5CapturedSnapshot(capture.snapshot) as string | undefined, historicalVersion: 2,
    fail: undefined as { kind: RequestChangesEffectKindV2; when: 'before' | 'after' | 'unknown' } | undefined
  };
  const roles = [...OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE].map((r, i) => ({ id: 101 + i,
    name: r.name, roleTypeKind: r.roleTypeKind, high: r.high, low: r.low }));
  const principals = [201, 202, 901, 902, 903].map(principalId => ({ principalId,
    principalKey: `fictional-observed-login-${principalId}`, principalType: 1 }));
  const bind = (): RequestChangesFinalAclBinding | undefined => {
    const c = state.authority.control, h = state.authority.header;
    if ((c.state !== 'Draft' && c.state !== 'ChangesRequested' && c.state !== 'Submitted')
      || c.transitionStatus !== 'Ready') return undefined;
    const kinds: FinalAclKind[] = ['Draft', 'Snapshot', 'Operation', 'Control'];
    return { control: { native: copy(h.native), value: { workplanKey: c.workplanKey, personKey: c.personKey,
      performanceYear: c.performanceYear, managerPersonKey: c.managerPersonKey, draftItemId: a.draft.itemId, draftSchemaVersion: a.draft.schema,
      state: c.state, transitionStatus: c.transitionStatus, etag: c.etag, hierarchyEpoch: c.hierarchyEpoch, aclEpoch: c.aclEpoch,
      currentSubmittedSnapshotKey: c.currentSubmittedSnapshotKey, pendingRequestKey: state.authority.pendingRequestKey,
      lastOperationKey: state.authority.lastOperationKey } },
      employee: copy(state.authority.people[0].value), automationPrincipalIds: { contentProcessor: 901, aclReconciler: 902, recoveryAdmin: 903 },
      principalBindings: copy(principals), roleIds: { itemReader: 101, addReadNoEdit: 102, draftEditor: 103, mutatorNoDelete: 104, aclReconciler: 105, fullControl: 106 },
      roleWeb: { siteId: h.native.siteId, webId: h.native.webId }, roleReadbacks: copy(roles),
      targets: kinds.map((kind, i) => ({ kind, key: `${c.workplanKey}/${kind}/${capture.key}`,
        target: `KCFKPI_${['WorkplanDrafts', 'WorkplanSubmittedSnapshots', 'WorkplanSubmitOperations', 'Workplans'][i]}/${c.performanceYear}/${c.personKey}/${['DraftItem', capture.key, 'SafeOperation', 'ControlItem'][i]}`,
        native: { ...h.native, listId: kind === 'Control' ? h.native.listId : `fictional-list-${kind}`,
          itemId: kind === 'Draft' ? a.draft.itemId : kind === 'Control' ? h.native.itemId : 31 + i } })) };
  };
  const aclRead = (): RequestChangesFinalAclObservation => {
    const b = bind()!, c = state.authority.control;
    return { workplanKey: c.workplanKey, submittedSnapshotKey: capture.key, hierarchyEpoch: c.hierarchyEpoch, aclEpoch: c.aclEpoch,
      targets: b.targets.map(t => {
        const assigned = [{ id: 901, role: t.kind === 'Snapshot' ? roles[1] : t.kind === 'Control' ? roles[2] : roles[3] },
          { id: 902, role: roles[4] }, { id: 903, role: roles[5] }, { id: 201, role: t.kind === 'Draft' && state.aclApplied ? roles[2] : roles[0] }];
        return { kind: t.kind, key: t.key, native: copy(t.native), inherited: false,
          assignments: { target: t.target, canonicalCollectionPath: `${t.target}/RoleAssignments`, complete: true, pageCount: 1, totalCount: 4,
            continuationUris: [], assignments: assigned.map(({ id, role }) => ({ ...principals.find(p => p.principalId === id)!,
              roleDefinitionId: role.id, roleName: role.name, roleTypeKind: role.roleTypeKind, roleHigh: role.high, roleLow: role.low })) },
          effective: principals.map(p => { const role = assigned.find(x => x.id === p.principalId)?.role;
            return { principalId: p.principalId, assignment: { assignedRoles: role ? [copy(role)] : [], effectiveHigh: role?.high || 0, effectiveLow: role?.low || 0 } }; }) };
      }) };
  };
  const fence = (kind: RequestChangesEffectKindV2, op: string): void => {
    const j = parseRequestChangesJournalV2(state.journals.get(op)!.body), c = state.authority;
    if (j.pendingEffect?.kind !== kind || j.pendingEffect.leaseEpoch !== j.lease!.epoch || j.lease!.owner !== lease.owner
      || Date.parse(j.lease!.expiresAt) <= Date.parse(state.now) || j.headerNative.etag !== c.header.native.etag
      || j.before.hierarchyEpoch !== c.control.hierarchyEpoch || j.before.aclEpoch !== c.control.aclEpoch
      || (kind === 'ControlClaim' ? !!c.pendingRequestKey : c.pendingRequestKey !== op)
      || c.control.managerPersonKey !== j.actorBinding.personKey) throw new Error('fictional fenced store conflict');
    state.traces.push({ kind, journal: copy(j), authority: copy(c) });
    if (state.fail?.kind === kind && (state.fail.when === 'before' || state.fail.when === 'unknown')) throw new Error('fictional dispatch loss');
  };
  const after = (kind: RequestChangesEffectKindV2): void => { if (state.fail?.kind === kind && state.fail.when === 'after') throw new Error('fictional committed response loss'); };
  const ports: MutablePorts = {
    readManagerCommand: async () => ({ body: state.commandBody, native: copy(source), authorPrincipalId: state.author,
      createdAt: '2026-10-11T05:00:00.000Z', immutable: true, columns: parseReviewCommandV1(state.commandBody) }),
    readCurrentAuthority: async () => copy(state.authority),
    readHistoricalHeaderVersion: async () => ({ native: copy(a.workplan.native), value: { ...copy(a.workplan.value), workplanVersion: state.historicalVersion } }),
    readCapturedSubmit: async () => ({ ...(state.captureReceipt === undefined ? {} : { receipt: { body: state.captureReceipt, native: copy(g.sourceCapture.native), immutable: true as const } }),
      ...(state.captureSnapshot === undefined ? {} : { snapshot: { body: state.captureSnapshot, native: native(704), immutable: true as const } }) }),
    readJournal: async key => state.journals.has(key) ? copy(state.journals.get(key)!) : undefined,
    createJournal: async (key, body) => { if (state.journals.has(key)) throw new Error('409 unique journal');
      const row = { body, native: native(500 + state.journals.size) }; state.journals.set(key, row); state.writes.push('JournalCreate'); return copy(row); },
    casJournal: async (key, etag, body) => { const previous = state.journals.get(key); if (!previous || previous.native.etag !== etag) throw new Error('412 journal');
      const j = parseRequestChangesJournalV2(body), row = { body, native: { ...previous.native, etag: `"journal-${j.journalRevision}"`, version: `journal-${j.journalRevision}` } };
      state.journals.set(key, row); state.writes.push('JournalCAS'); return copy(row); },
    casControl: async p => {
      const kind = p.mode === 'Claim' ? 'ControlClaim' : p.mode === 'DecisionReady' ? 'DecisionReady' : 'ControlRelease'; fence(kind, p.operationKey);
      const c = state.authority; if (c.header.native.etag !== p.expectedEtag || c.control.rowVersionToken !== p.expectedVersion
        || c.control.hierarchyEpoch !== p.hierarchyEpoch || c.control.aclEpoch !== p.aclEpoch) throw new Error('412 control');
      state.writes.push(p.mode); const etag = `"header-${state.writes.length}"`;
      state.authority = { ...c, control: { ...copy(p.control), etag }, header: { native: { ...c.header.native, etag, version: `native-${state.writes.length}` },
        value: { ...c.header.value, etag, state: p.control.state, transitionStatus: p.control.transitionStatus, rowVersionToken: p.control.rowVersionToken,
          accessState: p.accessState, ...(p.mode === 'Claim' ? {} : { managerDecisionComment: p.managerDecisionComment }) } },
        pendingRequestKey: p.mode === 'Release' ? undefined : p.operationKey, lastOperationKey: p.operationKey };
      state.effects.set(kind, { bodySha256: hash(canonicalReviewV1(p)), native: copy(state.authority.header.native) }); after(kind); return copy(state.authority);
    },
    readAudit: async key => state.audits.has(key) ? copy(state.audits.get(key)!) : undefined,
    createAudit: async (key, eventType, body, commandSource) => { const op = key.slice(0, -':receipt'.length); fence('ReceiptCreate', op);
      if (state.audits.has(key)) throw new Error('409 immutable receipt'); state.writes.push('ReceiptCreate');
      const row: RequestChangesAudit = { key, eventType, body, commandSource: copy(commandSource), immutable: true, createdAt: state.now,
        native: native(702, '5269ebee-565a-4093-a666-00c98cfc5f68') }; state.audits.set(key, row);
      state.effects.set('ReceiptCreate', { bodySha256: hash(body), native: copy(row.native) }); after('ReceiptCreate'); return copy(row); },
    readRequestChangesAclBinding: async () => bind(), readRequestChangesFinalAcl: async () => aclRead(),
    applyRequestChangesAcl: async (j, receipt, epoch) => { fence('Acl', j.operationKey);
      if (epoch !== j.lease!.epoch || state.authority.control.state !== 'ChangesRequested' || state.authority.header.value.accessState !== 'ReadOnly'
        || state.authority.control.rowVersionToken !== j.before.rowVersionToken || receipt.body !== state.audits.get(receipt.key)!.body) throw new Error('fictional ACL fence');
      state.writes.push('Acl'); state.aclApplied = true; state.effects.set('Acl', { bodySha256: j.pendingEffect!.desiredSha256, native: copy(state.authority.header.native) }); after('Acl'); },
    recoverEffect: async (_op, e) => { if (state.fail?.when === 'unknown') return { status: 'StillUnknown' };
      const proof = state.effects.get(e.kind); if (proof) return { status: 'Applied', ...copy(proof) };
      if (e.expectedEtag && e.expectedEtag !== state.authority.header.native.etag) return { status: 'StillUnknown' };
      return { status: 'NotApplied', noOutstandingDispatch: true, ...(e.expectedEtag ? { beforeEtag: e.expectedEtag } : {}) }; },
    readReviewAuditBindings: async (operationKey): Promise<ReviewAuditBindings> => { const c = state.authority.control;
      return { operationKey, workplanKey: c.workplanKey, hierarchyEpoch: c.hierarchyEpoch, aclEpoch: c.aclEpoch,
        auditList: { siteId: source.siteId, webId: source.webId, listId: '5269ebee-565a-4093-a666-00c98cfc5f68' },
        roleWeb: { siteId: source.siteId, webId: source.webId }, automationPrincipalIds: { contentProcessor: 901, aclReconciler: 902, recoveryAdmin: 903 },
        principalBindings: copy(principals), roleIds: { itemReader: 101, addReadNoEdit: 102, draftEditor: 103,
          mutatorNoDelete: 104, aclReconciler: 105, fullControl: 106 }, roleReadbacks: copy(roles),
        items: Array.from(state.audits.values()).filter(row => row.key.startsWith(`${operationKey}:`)).map(row => ({ key: row.key,
          target: `KCFKPI_Audit/${c.performanceYear}/${c.personKey}/${row.key}`, native: copy(row.native) })) }; },
    readReviewAuditAcl: async (operationKey): Promise<ReviewAuditAclObservation> => { const b = (await ports.readReviewAuditBindings(operationKey))!;
      const assigned = [{ id: 901, role: roles[1] }, { id: 903, role: roles[5] }];
      return { operationKey, workplanKey: b.workplanKey, hierarchyEpoch: b.hierarchyEpoch, aclEpoch: b.aclEpoch, targets: b.items.map(t => ({
        key: t.key, native: copy(t.native), inherited: false, assignments: { target: t.target, canonicalCollectionPath: `${t.target}/RoleAssignments`,
          complete: true, pageCount: 1, totalCount: 2, continuationUris: [], assignments: assigned.map(({ id, role }) => ({ ...principals.find(p => p.principalId === id)!,
            roleDefinitionId: role.id, roleName: role.name, roleTypeKind: role.roleTypeKind, roleHigh: role.high, roleLow: role.low })) },
        effective: principals.map(p => { const r = assigned.find(x => x.id === p.principalId)?.role;
          return { principalId: p.principalId, assignment: { assignedRoles: r ? [copy(r)] : [], effectiveHigh: r?.high || 0, effectiveLow: r?.low || 0 } }; }) })) }; },
    now: () => state.now, sha256: async text => hash(text)
  };
  return { ports, source, state };
};
const run = (f: ReturnType<typeof fixture>): ReturnType<ReturnType<typeof createOptionEWorkplanRequestChangesV2Processor>['process']> =>
  createOptionEWorkplanRequestChangesV2Processor(f.ports, lease).process(f.source);

test('real RequestChanges effects follow owned decision-ready ordering before one terminal increment', async () => {
  const f = fixture(); const result = await run(f);
  expect(result).toMatchObject({ outcome: 'Completed' });
  expect(f.state.traces.map(t => t.kind)).toEqual(['ControlClaim', 'ReceiptCreate', 'DecisionReady', 'Acl', 'ControlRelease']);
  const handoff = f.state.traces.find(t => t.kind === 'Acl')!;
  expect(handoff.authority.control).toMatchObject({ state: 'ChangesRequested', transitionStatus: 'Ready', rowVersionToken: 7 });
  expect(handoff.authority.pendingRequestKey).toBe(handoff.journal.operationKey);
  expect(handoff.authority.header.value.accessState).toBe('ReadOnly');
  expect(handoff.journal.pendingEffect?.kind).toBe('Acl');
  expect(f.state.authority.control.rowVersionToken).toBe(8); expect(f.state.authority.pendingRequestKey).toBeUndefined();
  expect(f.state.authority.header.value.accessState).toBe('EmployeeEdit'); expect(f.state.authority.header.value.workplanVersion).toBe(2);
  expect(f.state.captureReceipt).toBe(receiptBytes); expect(f.state.audits.size).toBe(1);
  expect(f.state.authority.header.value.managerDecisionComment).toBe(parseReviewCommandV1(f.state.commandBody).reason);
});

const effects: readonly RequestChangesEffectKindV2[] = ['ControlClaim', 'ReceiptCreate', 'DecisionReady', 'Acl', 'ControlRelease'];
test.each(effects.flatMap(kind => (['before', 'after'] as const).map(when => ({ kind, when }))))(
  '$kind $when failure preserves the durable marker and recovers without duplicated effects', async fault => {
    const f = fixture(); f.state.fail = fault;
    expect((await run(f)).outcome).toBe('RecoveryHold');
    const j = parseRequestChangesJournalV2(Array.from(f.state.journals.values())[0].body);
    expect(j.pendingEffect?.kind).toBe(fault.kind); expect(j.outcome).toBe('RecoveryHold');
    if (fault.kind !== 'ControlClaim' || fault.when === 'after') expect(f.state.authority.lastOperationKey).toBe(j.operationKey);
    f.state.fail = undefined; const r = await run(f); expect(r).toMatchObject({ outcome: 'Completed' });
    for (const name of ['Claim', 'ReceiptCreate', 'DecisionReady', 'Acl', 'Release']) expect(f.state.writes.filter(w => w === name)).toHaveLength(1);
    expect(f.state.authority.control.rowVersionToken).toBe(8); expect(f.state.audits.size).toBe(1);
    const writes = [...f.state.writes]; expect((await run(f)).outcome).toBe('Completed'); expect(f.state.writes).toEqual(writes);
  });
test.each(effects)('%s unknown effects remain owned, with no retry or second increment', async kind => {
  const f = fixture(); f.state.fail = { kind, when: 'unknown' }; expect((await run(f)).outcome).toBe('RecoveryHold');
  const writes = [...f.state.writes]; expect(await run(f)).toEqual({ outcome: 'RecoveryHold', reason: 'EffectStillUnknown' });
  expect(f.state.writes.filter(w => w !== 'JournalCAS')).toEqual(writes.filter(w => w !== 'JournalCAS'));
  const j = parseRequestChangesJournalV2(Array.from(f.state.journals.values())[0].body);
  expect(j.pendingEffect?.kind).toBe(kind); expect(f.state.authority.control.rowVersionToken).toBe(7);
  if (kind !== 'ControlClaim') expect(f.state.authority.pendingRequestKey).toBe(j.operationKey);
});
test.each(effects)('%s committed response loss with unknown recovery never redispatches', async kind => {
  const f = fixture(); f.state.fail = { kind, when: 'after' }; await run(f);
  f.state.fail = { kind, when: 'unknown' }; const writes = [...f.state.writes], version = f.state.authority.control.rowVersionToken;
  expect(await run(f)).toEqual({ outcome: 'RecoveryHold', reason: 'EffectStillUnknown' });
  expect(f.state.writes.filter(w => w !== 'JournalCAS')).toEqual(writes.filter(w => w !== 'JournalCAS'));
  expect(f.state.authority.control.rowVersionToken).toBe(version);
});
test.each(['expired', 'foreign'] as const)('%s lease does not cancel an unknown ACL dispatch', async mode => {
  const f = fixture(); f.state.fail = { kind: 'Acl', when: 'unknown' }; await run(f);
  if (mode === 'expired') f.state.now = '2026-10-11T05:20:00.000Z';
  const writes = [...f.state.writes]; const processor = createOptionEWorkplanRequestChangesV2Processor(f.ports,
    mode === 'foreign' ? { ...lease, owner: 'other-owner' } : lease);
  expect(await processor.process(f.source)).toEqual({ outcome: 'RecoveryHold', reason: 'LeaseExpiredOrForeign' });
  expect(f.state.writes).toEqual(writes); expect(f.state.authority.pendingRequestKey).toBeTruthy();
  expect(f.state.authority.header.value.accessState).toBe('ReadOnly'); expect(f.state.authority.control.rowVersionToken).toBe(7);
});
test('terminal replay rereads actual source with zero effects and exact body/source collision holds', async () => {
  const f = fixture(); expect((await run(f)).outcome).toBe('Completed'); const writes = [...f.state.writes];
  f.state.now = '2026-10-11T05:20:00.000Z'; expect((await run(f)).outcome).toBe('Completed'); expect(f.state.writes).toEqual(writes);
  f.state.commandBody = JSON.stringify(JSON.parse(f.state.commandBody), undefined, 2);
  expect(await run(f)).toEqual({ outcome: 'RecoveryHold', reason: 'CommandCollision' }); expect(f.state.writes).toEqual(writes);
});
test.each(['foreignAuthor', 'inactiveManager', 'inactiveSubject', 'duplicateManager', 'wrongPointer', 'wrongYear', 'wrongNativeItem',
  'wrongLogicalVersion', 'wrongEtag', 'missingOrdinal', 'stringOrdinal', 'pending', 'wrongState', 'badCapture', 'missingCapture', 'unalignedEpochs'])(
  '%s holds before effects', async name => {
    const f = fixture(), a = f.state.authority;
    if (name === 'foreignAuthor') f.state.author = 203;
    if (name === 'inactiveManager') a.people[1] = { ...a.people[1], value: { ...a.people[1].value, active: false } };
    if (name === 'inactiveSubject') a.people[0] = { ...a.people[0], value: { ...a.people[0].value, active: false } };
    if (name === 'duplicateManager') a.people.push(copy(a.people[1]));
    if (name === 'wrongPointer') a.control.currentSubmittedSnapshotKey = 'other';
    if (name === 'wrongYear') a.header = { ...a.header, value: { ...a.header.value, performanceYear: a.header.value.performanceYear + 1 } };
    if (name === 'wrongNativeItem') a.header = { ...a.header, native: { ...a.header.native, itemId: a.header.native.itemId + 1 } };
    if (name === 'wrongLogicalVersion') a.control.rowVersionToken++;
    if (name === 'wrongEtag') a.control.etag = '"other"';
    if (name === 'missingOrdinal') f.state.historicalVersion = 0;
    if (name === 'stringOrdinal') Object.assign(f.state, { historicalVersion: '2' });
    if (name === 'pending') a.pendingRequestKey = 'foreign-operation';
    if (name === 'wrongState') a.control.state = 'Draft';
    if (name === 'badCapture') f.state.captureReceipt = '{}';
    if (name === 'missingCapture') f.state.captureReceipt = f.state.captureSnapshot = undefined;
    if (name === 'unalignedEpochs') a.control.aclEpoch++;
    expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
  });
test.each(['readReviewAuditBindings', 'readReviewAuditAcl', 'readRequestChangesAclBinding', 'readRequestChangesFinalAcl'] as const)(
  'missing mandatory %s yields HOLD without effects', async method => {
    const f = fixture(); delete (f.ports as Partial<MutablePorts>)[method];
    expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
  });
test.each(['readManagerCommand', 'readCurrentAuthority', 'readHistoricalHeaderVersion', 'readCapturedSubmit', 'readJournal',
  'readAudit', 'readRequestChangesAclBinding', 'readRequestChangesFinalAcl', 'readReviewAuditBindings', 'readReviewAuditAcl'] as const)(
  '%s denial before admission is never absence or fallback', async method => {
    const f = fixture(); f.ports[method] = async () => { throw new Error('fictional denied source query'); };
    expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
  });
test('real snapshot-only admission remains an unchanged historical reference', async () => {
  const f = fixture(); f.state.captureReceipt = undefined; expect((await run(f)).outcome).toBe('Completed');
  const j = parseRequestChangesJournalV2(Array.from(f.state.journals.values())[0].body); expect(j.sourceCapture.kind).toBe('snapshot');
  expect(f.state.captureSnapshot).toBe(encodeV5CapturedSnapshot(parseV5CapturedReceipt(receiptBytes).snapshot));
});
test.each(['encoding', 'pair'] as const)('present captured %s mismatch holds before effects', async kind => {
  const f = fixture();
  if (kind === 'encoding') { const raw = JSON.parse(f.state.captureReceipt!); raw.snapshot.admission.encoding = 'captured-native-request/v2';
    f.state.captureReceipt = canonicalReviewV1(raw); }
  else { const snapshot = parseV5CapturedReceipt(receiptBytes).snapshot; snapshot.admission.eventAt = '2026-10-07T09:00:00.000Z';
    f.state.captureSnapshot = encodeV5CapturedSnapshot(snapshot); }
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
});
test.each(['emptyReason', 'ApproveLock'] as const)('%s is not admitted to this RequestChanges writer', async kind => {
  const f = fixture(), command = parseReviewCommandV1(f.state.commandBody);
  const { reason, ...approve } = command;
  f.state.commandBody = canonicalReviewV1(kind === 'emptyReason' ? { ...command, reason: ' \n ' }
    : { ...approve, command: 'ApproveLock' });
  expect(reason).toBeTruthy();
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
});
test.each(['actor', 'epoch', 'native', 'foreignPending'] as const)('%s replacement immediately before ACL dispatch prevents that effect', async kind => {
  const f = fixture(), cas = f.ports.casJournal;
  f.ports.casJournal = async (key, etag, body) => { const actual = await cas(key, etag, body), j = parseRequestChangesJournalV2(body);
    if (j.pendingEffect?.kind === 'Acl' && j.outcome === 'Running') {
      if (kind === 'actor') f.state.authority.people[1] = { ...f.state.authority.people[1], native: { ...f.state.authority.people[1].native, version: 'replacement' } };
      if (kind === 'epoch') f.state.authority.control.aclEpoch++;
      if (kind === 'native') f.state.authority.header = { ...f.state.authority.header, native: { ...f.state.authority.header.native, version: 'replacement' } };
      if (kind === 'foreignPending') f.state.authority.pendingRequestKey = 'foreign-owner';
    } return actual; };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Acl'); expect(f.state.writes).not.toContain('Release');
});
test.each(['employeeMask', 'managerRights', 'incomplete', 'wrongNative', 'wrongRole'] as const)(
  'independent post-grant %s observation prevents release', async kind => {
    const f = fixture(), readAcl = f.ports.readRequestChangesFinalAcl, readBinding = f.ports.readRequestChangesAclBinding;
    f.ports.readRequestChangesFinalAcl = async key => { const acl = (await readAcl(key))!;
      if (f.state.aclApplied) {
        if (kind === 'employeeMask') acl.targets[0].effective.find(e => e.principalId === 201)!.assignment.effectiveLow = 7;
        if (kind === 'managerRights') acl.targets[0].effective.find(e => e.principalId === 202)!.assignment.effectiveLow = 1;
        if (kind === 'incomplete') acl.targets[0].assignments.complete = false;
        if (kind === 'wrongNative') return { ...acl, targets: acl.targets.map((t, i) => i ? t : { ...t, native: { ...t.native, itemId: t.native.itemId + 1 } }) };
      } return acl; };
    f.ports.readRequestChangesAclBinding = async key => { const b = await readBinding(key);
      return kind === 'wrongRole' && f.state.aclApplied && b ? { ...b, roleReadbacks: b.roleReadbacks.map((r, i) => i === 2 ? { ...r, id: 999 } : r) } : b; };
    expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Release');
    expect(f.state.authority.pendingRequestKey).toBeTruthy(); expect(f.state.authority.control.rowVersionToken).toBe(7);
  });
test.each(['unknownProof', 'wrongDigest', 'wrongNative'] as const)('%s recovery proof cannot clear an outstanding decision marker', async kind => {
  const f = fixture(); f.state.fail = { kind: 'DecisionReady', when: 'after' }; await run(f); f.state.fail = undefined;
  const recover = f.ports.recoverEffect;
  f.ports.recoverEffect = async (op, e) => { const proof = await recover(op, e);
    if (kind === 'unknownProof') return { status: 'StillUnknown' };
    if (proof.status === 'Applied') return kind === 'wrongDigest' ? { ...proof, bodySha256: 'A'.repeat(64) }
      : { ...proof, native: { ...proof.native, itemId: proof.native.itemId + 1 } }; return proof; };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Acl');
  expect(parseRequestChangesJournalV2(Array.from(f.state.journals.values())[0].body).pendingEffect?.kind).toBe('DecisionReady');
});
test.each(['actor', 'epoch', 'binding', 'native'] as const)('%s replacement during source hash holds before effects', async kind => {
  const f = fixture(); let changed = false;
  f.ports.sha256 = async text => { if (!changed) { changed = true;
    if (kind === 'actor') f.state.authority.people[1] = { ...f.state.authority.people[1], native: { ...f.state.authority.people[1].native, version: 'replacement' } };
    if (kind === 'epoch') f.state.authority.control.hierarchyEpoch++;
    if (kind === 'binding') f.state.authority.people[0] = { ...f.state.authority.people[0], value: { ...f.state.authority.people[0].value, principalId: 204 } };
    if (kind === 'native') f.state.authority.header = { ...f.state.authority.header, native: { ...f.state.authority.header.native, version: 'replacement' } };
  } return hash(text); };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
});
test.each(['employee', 'manager', 'reconciler'] as const)('receipt effective %s rights prevent terminal release', async principal => {
  const f = fixture(), original = f.ports.readReviewAuditAcl;
  f.ports.readReviewAuditAcl = async op => { const value = (await original(op))!;
    const id = principal === 'employee' ? 201 : principal === 'manager' ? 202 : 902;
    for (const t of value.targets) t.effective.find(e => e.principalId === id)!.assignment.effectiveLow = 1;
    return value; };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Release'); expect(f.state.authority.control.rowVersionToken).toBe(7);
});
test.each(['body', 'Created', 'source', 'native'] as const)('immutable receipt %s replacement blocks recovered completion', async pin => {
  const f = fixture(); f.state.fail = { kind: 'DecisionReady', when: 'before' }; await run(f); f.state.fail = undefined;
  const r = Array.from(f.state.audits.values())[0];
  if (pin === 'body') r.body += ' ';
  if (pin === 'Created') r.createdAt = 'invalid';
  if (pin === 'source') r.commandSource.bodySha256 = 'A'.repeat(64);
  if (pin === 'native') r.native.itemId++;
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Release');
});
test('owned qualifiers return actual n/ReadOnly/pending observations and cannot finish the review', async () => {
  const f = fixture(); f.state.fail = { kind: 'Acl', when: 'before' }; await run(f);
  const journal = Array.from(f.state.journals.values())[0], context = { journal, owner: lease.owner };
  const q = await qualifyOptionEWorkplanRequestChangesOwnedReady(f.ports, context);
  expect(q.authority.control.rowVersionToken).toBe(7); expect(q.authority.header.value.accessState).toBe('ReadOnly');
  expect(q.authority.pendingRequestKey).toBe(parseRequestChangesJournalV2(journal.body).operationKey);
  expect(q).not.toHaveProperty('readback'); expect(q).not.toHaveProperty('after'); expect(q.acl).toBeUndefined();
  await expect(confirmOptionEWorkplanRequestChangesOwnedAcl(f.ports, context)).rejects.toMatchObject({ code: 'FinalAclObservationMismatch' });
  const j = parseRequestChangesJournalV2(journal.body);
  const strictFinal = createOptionEWorkplanRequestChangesFinalSourceReadback({
    readCurrentActor: async () => f.state.authority.people[1].value,
    readCurrentHeader: async () => f.state.authority.header, readReviewControl: async () => f.state.authority.control,
    readSubmittedMetadata: async () => j.submitted, readApprovedMetadata: async () => undefined,
    readReviewReceipt: async () => { const r = Array.from(f.state.audits.values())[0]; return { ...parseReviewReceiptV1(r.body).receipt, nativeCreatedAt: r.createdAt }; },
    readReceipt: async () => f.state.captureReceipt, readSnapshot: async () => f.state.captureSnapshot,
    readRequestChangesAclBinding: f.ports.readRequestChangesAclBinding, readRequestChangesFinalAcl: f.ports.readRequestChangesFinalAcl,
    sha256: f.ports.sha256
  });
  await expect(strictFinal.confirm({ ...j.command, actorPersonKey: j.actorBinding.personKey }, j.before))
    .rejects.toMatchObject({ code: 'FinalAclBindingMismatch' });
  const original = f.state.authority.control.state; q.authority.control.state = 'Draft'; expect(f.state.authority.control.state).toBe(original);
});
test.each(['actor', 'epoch', 'journal', 'header', 'receipt', 'binding'] as const)(
  'owned %s replacement during real journal hash is held', async kind => {
    const f = fixture(); f.state.fail = { kind: 'Acl', when: 'before' }; await run(f);
    const journal = copy(Array.from(f.state.journals.values())[0]); const initial = f.ports.readRequestChangesAclBinding;
    let replacement = false;
    f.ports.sha256 = async text => { if (text === journal.body && !replacement) { replacement = true;
      if (kind === 'actor') f.state.authority.people[1] = { ...f.state.authority.people[1], native: { ...f.state.authority.people[1].native, version: 'replacement' } };
      if (kind === 'epoch') f.state.authority.control.aclEpoch++;
      if (kind === 'journal') Array.from(f.state.journals.values())[0].native.etag = '"replacement"';
      if (kind === 'header') f.state.authority.header = { ...f.state.authority.header, native: { ...f.state.authority.header.native, version: 'replacement' } };
      if (kind === 'receipt') Array.from(f.state.audits.values())[0].createdAt = '2026-10-11T05:11:00.000Z';
    } return hash(text); };
    f.ports.readRequestChangesAclBinding = async key => { const b = (await initial(key))!;
      if (kind === 'binding' && replacement) return { ...b, roleIds: { ...b.roleIds, draftEditor: 999 } }; return b; };
    await expect(qualifyOptionEWorkplanRequestChangesOwnedReady(f.ports, { journal, owner: lease.owner }))
      .rejects.toMatchObject({ code: 'OwnedSourceChanged' });
  });
test('two independently observed UUID commands compete for the actual claim CAS', async () => {
  const f = fixture(), second = fixture(); const secondNative = { ...second.source, itemId: second.source.itemId + 1 };
  second.state.commandBody = canonicalReviewV1({ ...parseReviewCommandV1(second.state.commandBody), commandKey: randomUUID() });
  const ownCommandRead = second.ports.readManagerCommand;
  second.ports = { ...f.ports, readManagerCommand: async () => ({ ...await ownCommandRead(secondNative), native: secondNative }) };
  let unblock: () => void = () => undefined; let claimed: () => void = () => undefined;
  const gate = new Promise<void>(resolve => { unblock = resolve; }), arrived = new Promise<void>(resolve => { claimed = resolve; });
  const cas = f.ports.casControl;
  f.ports.casControl = async p => { if (p.mode === 'Claim') { claimed(); await gate; } return cas(p); };
  const first = run(f); await arrived;
  const winner = await createOptionEWorkplanRequestChangesV2Processor(second.ports, lease).process(secondNative);
  unblock(); expect(winner.outcome).toBe('Completed'); expect((await first).outcome).toBe('RecoveryHold');
  expect(f.state.writes.filter(w => w === 'Claim')).toHaveLength(1); expect(f.state.writes.filter(w => w === 'Release')).toHaveLength(1);
  expect(f.state.authority.control.rowVersionToken).toBe(8); expect(f.state.audits.size).toBe(1);
});
test('a different UUID after completion is a wrong-state HOLD, not an invented replay', async () => {
  const f = fixture(); await run(f); f.state.commandBody = canonicalReviewV1({ ...parseReviewCommandV1(f.state.commandBody), commandKey: randomUUID() });
  const writes = [...f.state.writes]; expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual(writes);
});
test('immutable journal creation response loss is recovered from the independently stored exact row', async () => {
  const f = fixture(), create = f.ports.createJournal;
  f.ports.createJournal = async (key, body) => { await create(key, body); throw new Error('fictional journal creation response loss'); };
  expect((await run(f)).outcome).toBe('Completed'); expect(f.state.writes.filter(w => w === 'JournalCreate')).toHaveLength(1);
  expect(f.state.authority.control.rowVersionToken).toBe(8); expect(f.state.audits.size).toBe(1);
});
test('every committed journal CAS response loss refreshes actual context before subsequent Audit reads', async () => {
  const f = fixture(), cas = f.ports.casJournal;
  f.ports.casJournal = async (key, etag, body) => { await cas(key, etag, body); throw new Error('fictional journal CAS response loss'); };
  expect((await run(f)).outcome).toBe('Completed');
  expect(f.state.traces.map(t => t.kind)).toEqual(effects); expect(f.state.authority.control.rowVersionToken).toBe(8);
});
test('native command source replacement under the same UUID collides without changing the completed journal', async () => {
  const f = fixture(); await run(f); const writes = [...f.state.writes], oldRead = f.ports.readManagerCommand;
  const replaced = { ...f.source, etag: '"new-command-source"', version: 'new-opaque-version' };
  f.ports.readManagerCommand = async () => ({ ...await oldRead(replaced), native: replaced });
  expect(await createOptionEWorkplanRequestChangesV2Processor(f.ports, lease).process(replaced))
    .toEqual({ outcome: 'RecoveryHold', reason: 'CommandCollision' }); expect(f.state.writes).toEqual(writes);
});
test('late final ACL replacement during private receipt hashing cannot mark a released review Completed', async () => {
  const f = fixture(), readAcl = f.ports.readRequestChangesFinalAcl; let replaced = false;
  f.ports.sha256 = async text => {
    const actual = Array.from(f.state.journals.values())[0], receipt = Array.from(f.state.audits.values())[0];
    if (actual && receipt && parseRequestChangesJournalV2(actual.body).phase === 'ControlReleased' && text === receipt.body) replaced = true;
    return hash(text);
  };
  f.ports.readRequestChangesFinalAcl = async key => { const acl = (await readAcl(key))!;
    if (replaced) acl.targets[0].effective.find(e => e.principalId === 201)!.assignment.effectiveLow = 7; return acl; };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes.filter(w => w === 'Release')).toHaveLength(1);
  expect(f.state.authority.control.rowVersionToken).toBe(8);
  expect(parseRequestChangesJournalV2(Array.from(f.state.journals.values())[0].body).phase).toBe('ControlReleased');
});
test('raw whitespace reason and all original unowned header fields remain exact', async () => {
  const f = fixture(), before = copy(f.state.authority.header.value), command = parseReviewCommandV1(f.state.commandBody);
  const raw = '  Clarify this unfinished target.\nKeep its historical definition.  ';
  f.state.commandBody = canonicalReviewV1({ ...command, reason: raw }); expect((await run(f)).outcome).toBe('Completed');
  expect(f.state.authority.header.value.managerDecisionComment).toBe(raw);
  const r = JSON.parse(Array.from(f.state.audits.values())[0].body); expect(r.reason).toBe(raw); expect(r.approvedReference).toBeUndefined();
  const changed = ['etag', 'state', 'transitionStatus', 'rowVersionToken', 'accessState', 'managerDecisionComment'];
  for (const key of Object.keys(before)) if (!changed.includes(key)) expect(f.state.authority.header.value[key as keyof typeof before]).toEqual(before[key as keyof typeof before]);
});
test.each(['Claim', 'DecisionReady'] as const)('actual private gateway denies open and Save throughout owned %s', async phase => {
  const f = fixture(true), originalBytes = f.state.captureReceipt;
  f.state.fail = { kind: phase === 'Claim' ? 'ReceiptCreate' : 'Acl', when: 'unknown' }; await run(f);
  const a = f.state.authority, c = a.control, employee = a.people[0].value;
  const declaredDraft = parseV5CapturedReceipt(originalBytes!).snapshot.admission.authority.draft;
  const sp = { get: jest.fn(async (url: string) => ({ status: 200, ok: true, json: async () => ({ value: url.includes("getbytitle('KCFKPI_People')")
    ? [{ Id: 3, UniqueId: '6906d187-3451-467a-a362-10ddc87449f7', PersonKey: employee.personKey, Email: employee.email, Active: true }]
    : [{ Id: a.header.native.itemId, UniqueId: 'bc86e3b4-7317-4c6f-ac4d-099462cee169', '@odata.etag': c.etag,
      WorkplanKey: c.workplanKey, PersonKey: c.personKey, PerformanceYear: c.performanceYear,
      DraftItemId: declaredDraft.itemId, DraftSchemaVersion: declaredDraft.schema,
      State: c.state, TransitionStatus: c.transitionStatus,
      PendingRequestKey: a.pendingRequestKey, RowVersionToken: c.rowVersionToken }] }) })), post: jest.fn() };
  const prepared: IOptionEDraftPreparedPayload = { aggregate: { schemaVersion: 'kcf.workplan-draft/v1', core: { weightingMode: 'Equal', entries: [] }, impact: [],
    behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER', entries: [] } }, payloadJson: '{}', payloadSha256: hash('{}') };
  const store: IOptionEDraftItemStore = { prepare: jest.fn(async () => prepared), readExact: jest.fn(async () => { throw new Error('must not reach private body'); }),
    updateExact: jest.fn(async () => undefined) };
  const gateway = new OptionEProtectedDraftGateway(sp as unknown as SPHttpClient, 'https://tenant.example.invalid/sites/fictional', employee.email,
    OPTION_E_WORKPLAN_LIST_BINDINGS, {} as SPHttpClientConfiguration, store);
  const code = phase === 'Claim' ? 'CONTROL_NON_EDITABLE' : 'CONTROL_PENDING';
  await expect(gateway.read({ performanceYear: c.performanceYear })).rejects.toMatchObject({ code });
  const binding: IOptionEProtectedDraftBinding = { peopleItemId: 3, peopleUniqueId: '6906d187-3451-467a-a362-10ddc87449f7', email: employee.email,
    personKey: employee.personKey, workplanItemId: a.header.native.itemId, workplanUniqueId: 'bc86e3b4-7317-4c6f-ac4d-099462cee169', workplanEtag: c.etag,
    workplanKey: `${employee.personKey}|${c.performanceYear}`, performanceYear: c.performanceYear, draftItemId: 17, draftSchemaVersion: 'kcf.workplan-draft/v1',
    state: 'ChangesRequested', transitionStatus: 'Ready', pendingRequestKey: '', rowVersionToken: 7 };
  await expect(gateway.updateExact({ context: { performanceYear: c.performanceYear }, expectedBinding: binding, itemId: 17, expectedEtag: '"draft-1"',
    prepared, clientSaveId: randomUUID(), clientSavedAt: f.state.now })).rejects.toMatchObject({ code });
  expect(store.readExact).not.toHaveBeenCalled(); expect(store.updateExact).not.toHaveBeenCalled(); expect(sp.post).not.toHaveBeenCalled();
  expect(f.state.captureReceipt).toBe(originalBytes);
});
