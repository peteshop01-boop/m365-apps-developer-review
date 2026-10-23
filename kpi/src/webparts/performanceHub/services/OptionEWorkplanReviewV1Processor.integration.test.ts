import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import type { Native, ReviewPortsV1, ReviewAuthorityV1, ReviewAuditV1, ReviewJournalObservationV1, ReviewAclV1, EffectKindV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { ReviewAuditBindings, ReviewAuditAclObservation } from './OptionEWorkplanReviewAuditSourceReadback';
import { OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE } from './OptionEWorkplanPhysicalSchema';
import { parseReviewCommandV1, parseReviewJournalV1, parseReviewReceiptV1, encodeReviewReceiptV1, canonicalReviewV1 } from './OptionEWorkplanReviewV1Wire';
import { parseV5CapturedReceipt, encodeV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { createOptionEWorkplanReviewV1Processor } from './OptionEWorkplanReviewV1Processor';
Object.assign(globalThis, { TextEncoder, TextDecoder });
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const hash = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex').toUpperCase();
const input: { goldens: { body: string }[] } = JSON.parse(readFileSync('temp/test-fixtures/review/normal-goldens.json', 'utf8'));
const receiptBytes = readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-global-r3-receipt.json', 'utf8');
const lease = { owner: 'fictional-local-owner', milliseconds: 120000 };
// Three fictional people and processor/store observations; no authenticated M365 claims.
const fixture = (): {
  ports: ReviewPortsV1; source: Native; state: {
    authority: ReviewAuthorityV1; commandBody: string; author: number; createdAt: string;
    journal?: ReviewJournalObservationV1; journals: Map<string, ReviewJournalObservationV1>; audits: Map<string, ReviewAuditV1>; acl?: ReviewAclV1;
    writes: string[]; fail?: { kind: EffectKindV1; when: 'before' | 'after' | 'unknown' };
    effects: Map<EffectKindV1, { bodySha256: string; native: Native }>; now: string;
    captureReceipt?: string; captureSnapshot?: string; historicalVersion: number;
  }
} => {
  const captured = parseV5CapturedReceipt(receiptBytes), a = captured.snapshot.admission.authority;
  const golden = parseReviewJournalV1(input.goldens[3].body), source = copy(golden.commandSource.native);
  const native = (id: number, list = source.listId): Native => ({ ...source, itemId: id, listId: list });
  const state = {
    authority: { header: { native: copy(golden.headerNative), value: { ...copy(a.workplan.value), etag: golden.before.etag,
      state: 'Submitted' as const, transitionStatus: 'Ready', rowVersionToken: 7, workplanVersion: 2, managerPersonKey: 'manager' } },
      control: copy(golden.before), people: [
        { native: native(11), value: { personKey: 'employee', email: 'employee@kcf-test.invalid', principalId: 201, active: true, managerPersonKey: 'manager' } },
        { native: copy(golden.actorBinding.personNative), value: { personKey: 'manager', email: 'manager@kcf-test.invalid', principalId: 202, active: true } },
        { native: native(13), value: { personKey: 'foreign', email: 'foreign@kcf-test.invalid', principalId: 203, active: true } }
      ] } as ReviewAuthorityV1,
    commandBody: input.goldens[0].body, author: 202, createdAt: '2026-10-11T03:40:00.000Z',
    journal: undefined as ReviewJournalObservationV1 | undefined, journals: new Map<string, ReviewJournalObservationV1>(), audits: new Map<string, ReviewAuditV1>(),
    acl: undefined as ReviewAclV1 | undefined, writes: [] as string[],
    fail: undefined as { kind: EffectKindV1; when: 'before' | 'after' | 'unknown' } | undefined,
    effects: new Map<EffectKindV1, { bodySha256: string; native: Native }>(), now: '2026-10-11T03:50:00.000Z',
    captureReceipt: receiptBytes as string | undefined, captureSnapshot: encodeV5CapturedSnapshot(captured.snapshot) as string | undefined, historicalVersion: 2
  };
  const checkFailure = (kind: EffectKindV1, when: 'before' | 'after'): void => {
    if (state.fail?.kind === kind && (state.fail.when === when || (when === 'before' && state.fail.when === 'unknown'))) throw new Error('fictional uncertain dispatch');
  };
  const grants = [{ principal: 901, role: 'AppendOnly' as const }, { principal: 902, role: 'AclReconciler' as const },
    { principal: 903, role: 'FullControl' as const }, { principal: 201, role: 'Read' as const }, { principal: 202, role: 'Read' as const }];
  state.acl = { submitted: { admissionKey: captured.key, hierarchyEpoch: 4, aclEpoch: 4,
    targets: ['Draft', 'Snapshot', 'Operation', 'Control'].map(kind => ({ key: `${golden.before.workplanKey}/${kind}/${captured.key}`, inherited: false, complete: true,
      grants: [{ principal: 901, role: kind === 'Snapshot' ? 'AppendOnly' : 'MutatorNoDelete' }, ...grants.slice(1, kind === 'Draft' ? 4 : 5)] })) },
    artifacts: [], native: native(703), operationKey: golden.operationKey, leaseEpoch: 1 };
  const ports: ReviewPortsV1 = {
    readManagerCommand: async () => ({ body: state.commandBody, native: source, authorPrincipalId: state.author, createdAt: state.createdAt,
      immutable: true, columns: parseReviewCommandV1(state.commandBody) }),
    readCurrentAuthority: async () => copy(state.authority),
    readHistoricalHeaderVersion: async () => ({ native: copy(a.workplan.native), value: { ...copy(a.workplan.value), workplanVersion: state.historicalVersion } }),
    readCapturedSubmit: async () => ({ ...(state.captureReceipt === undefined ? {} : { receipt: { body: state.captureReceipt, native: copy(golden.sourceCapture.native), immutable: true as const } }),
      ...(state.captureSnapshot === undefined ? {} : { snapshot: { body: state.captureSnapshot, native: native(704), immutable: true as const } }) }),
    readJournal: async key => state.journals.has(key) ? copy(state.journals.get(key)!) : undefined,
    createJournal: async (key, body) => {
      if (state.journals.has(key)) throw new Error('409 unique journal'); state.writes.push('JournalCreate');
      const row = { body, native: native(500 + state.journals.size) }; state.journals.set(key, row);
      if (key === 'oe-review:7cd2b366-aa4d-4d2c-a046-a5ca92624918') state.journal = row; return copy(row);
    },
    casJournal: async (key, expected, body) => {
      const current = state.journals.get(key); if (!current || current.native.etag !== expected) throw new Error('412 journal');
      state.writes.push('JournalCAS'); const row = { body, native: { ...current.native, etag: `"journal-${parseReviewJournalV1(body).journalRevision}"`, version: String(parseReviewJournalV1(body).journalRevision) } };
      state.journals.set(key, row); if (key === 'oe-review:7cd2b366-aa4d-4d2c-a046-a5ca92624918') state.journal = row; return copy(row);
    },
    casControl: async patch => {
      const current = state.authority, kind = patch.mode === 'Release' ? 'ControlRelease' : 'ControlClaim';
      checkFailure(kind, 'before');
      if (current.header.native.etag !== patch.expectedEtag || current.control.rowVersionToken !== patch.expectedVersion
        || current.control.hierarchyEpoch !== patch.hierarchyEpoch || current.control.aclEpoch !== patch.aclEpoch
        || (patch.mode !== 'Claim' && current.pendingRequestKey !== patch.operationKey)
        || (patch.mode === 'Claim' && current.pendingRequestKey)) throw new Error('412 control');
      state.writes.push(patch.mode);
      const nextEtag = `"header-${state.writes.length}"`;
      state.authority = { ...current, control: { ...patch.control, etag: nextEtag },
        header: { native: { ...current.header.native, etag: nextEtag, version: `native-${state.writes.length}` },
          value: { ...current.header.value, etag: nextEtag, state: patch.control.state, transitionStatus: patch.control.transitionStatus,
            rowVersionToken: patch.control.rowVersionToken, ...(patch.accessState ? { accessState: patch.accessState } : {}),
            ...(patch.approvedAt ? { approvedAt: patch.approvedAt, approvedByEmail: patch.approvedByEmail, lockedAt: patch.lockedAt, lockedByEmail: patch.lockedByEmail } : {}) } },
        ...(patch.mode === 'Release' ? { pendingRequestKey: undefined, lastOperationKey: patch.operationKey } : { pendingRequestKey: patch.operationKey, lastOperationKey: patch.operationKey }) };
      state.effects.set(kind, { bodySha256: hash(canonicalReviewV1(patch)), native: copy(state.authority.header.native) });
      checkFailure(kind, 'after'); return copy(state.authority);
    },
    readAudit: async key => state.audits.has(key) ? copy(state.audits.get(key)!) : undefined,
    readReviewAuditBindings: async (operationKey): Promise<ReviewAuditBindings> => {
      const c = state.authority.control;
      // Independently declared canonical fictional store/service/native role observations.
      // They are not inferred from Snapshot role labels or submitted ACL plans.
      return { operationKey, workplanKey: c.workplanKey, hierarchyEpoch: c.hierarchyEpoch, aclEpoch: c.aclEpoch,
        auditList: { siteId: source.siteId, webId: source.webId, listId: '5269ebee-565a-4093-a666-00c98cfc5f68' },
        roleWeb: { siteId: source.siteId, webId: source.webId },
        automationPrincipalIds: { contentProcessor: 901, aclReconciler: 902, recoveryAdmin: 903 },
        principalBindings: [901, 902, 903, 201, 202].map(principalId => ({ principalId, principalKey: `fictional-observed-login-${principalId}`, principalType: 1 })),
        roleIds: { itemReader: 101, addReadNoEdit: 102, draftEditor: 103, mutatorNoDelete: 104, aclReconciler: 105, fullControl: 106 },
        roleReadbacks: [...OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE].map((role, index) => ({ id: 101 + index,
          name: role.name, roleTypeKind: role.roleTypeKind, high: role.high, low: role.low })),
        items: Array.from(state.audits.values()).filter(row => row.key.startsWith(`${operationKey}:`)).map(row => ({ key: row.key,
          target: `KCFKPI_Audit/${c.performanceYear}/${c.personKey}/${row.key}`, native: copy(row.native) })) };
    },
    readReviewAuditAcl: async (operationKey): Promise<ReviewAuditAclObservation> => {
      const bindings = (await ports.readReviewAuditBindings(operationKey))!;
      const owners = [{ id: 901, role: bindings.roleReadbacks[1] }, { id: 903, role: bindings.roleReadbacks[5] }];
      return { operationKey, workplanKey: bindings.workplanKey, hierarchyEpoch: bindings.hierarchyEpoch, aclEpoch: bindings.aclEpoch,
        targets: bindings.items.map(item => ({ key: item.key, native: copy(item.native), inherited: false,
          assignments: { target: item.target, canonicalCollectionPath: `${item.target}/RoleAssignments`, assignments: owners.map(owner => {
            const p = bindings.principalBindings.find(principal => principal.principalId === owner.id)!;
            return { ...p, roleDefinitionId: owner.role.id, roleName: owner.role.name, roleTypeKind: owner.role.roleTypeKind,
              roleHigh: owner.role.high, roleLow: owner.role.low }; }), pageCount: 1, totalCount: 2, complete: true, continuationUris: [] },
          effective: [901, 902, 903, 201, 202].map(principalId => { const role = owners.find(owner => owner.id === principalId)?.role;
            return { principalId, assignment: { assignedRoles: role ? [copy(role)] : [], effectiveHigh: role?.high || 0, effectiveLow: role?.low || 0 } }; }) })) };
    },
    createAudit: async (key, eventType, body, commandSource) => {
      const kind = eventType === 'WorkplanApproved' ? 'ApprovedCreate' : 'ReceiptCreate'; checkFailure(kind, 'before');
      if (state.audits.has(key)) throw new Error('409 immutable key'); state.writes.push(kind);
      const row: ReviewAuditV1 = { key, eventType, body, native: native(eventType === 'WorkplanApproved' ? 701 : 702, '5269ebee-565a-4093-a666-00c98cfc5f68'), immutable: true, createdAt: state.now, commandSource: copy(commandSource) };
      state.audits.set(key, row); state.effects.set(kind, { bodySha256: hash(body), native: row.native }); checkFailure(kind, 'after'); return copy(row);
    },
    readFinalAcl: async () => state.acl && copy(state.acl),
    applyFinalAcl: async (j, artifacts, epoch) => {
      const durable = parseReviewJournalV1(state.journals.get(j.operationKey)!.body);
      if (durable.lease!.epoch !== epoch || durable.lease!.owner !== j.lease!.owner || Date.parse(durable.lease!.expiresAt) <= Date.parse(state.now)
        || durable.pendingEffect?.kind !== 'Acl' || durable.pendingEffect.leaseEpoch !== epoch || state.authority.pendingRequestKey !== j.operationKey) throw new Error('ACL fencing conflict');
      checkFailure('Acl', 'before'); state.writes.push('Acl');
      state.acl = { submitted: { admissionKey: captured.key, hierarchyEpoch: 4, aclEpoch: 4,
        targets: ['Draft', 'Snapshot', 'Operation', 'Control'].map(kind => ({ key: `${j.before.workplanKey}/${kind}/${captured.key}`, inherited: false, complete: true,
          grants: [{ principal: 901, role: kind === 'Snapshot' ? 'AppendOnly' : 'MutatorNoDelete' }, ...grants.slice(1, kind === 'Draft' ? 4 : 5)] })) },
        artifacts: artifacts.map(row => ({ key: row.key, inherited: false, complete: true, grants: copy([grants[0], grants[2]]) })),
        native: native(703), operationKey: j.operationKey, leaseEpoch: epoch };
      state.effects.set('Acl', { bodySha256: hash(canonicalReviewV1({ operationKey: j.operationKey, artifacts: artifacts.map(row => ({ key: row.key, sha256: hash(row.body), native: row.native })), hierarchyEpoch: j.before.hierarchyEpoch, aclEpoch: j.before.aclEpoch })), native: state.acl.native });
      checkFailure('Acl', 'after');
    },
    recoverEffect: async (_key, e) => {
      if (state.fail?.when === 'unknown') return { status: 'StillUnknown' };
      if (e.kind === 'ApprovedCreate' || e.kind === 'ReceiptCreate') { const row = state.audits.get(e.key);
        if (row) return { status: 'Applied', bodySha256: hash(row.body), native: copy(row.native) }; }
      if (state.effects.has(e.kind)) return { status: 'Applied', ...copy(state.effects.get(e.kind)!) };
      if (e.expectedEtag && state.authority.header.native.etag !== e.expectedEtag) return { status: 'StillUnknown' };
      return { status: 'NotApplied', noOutstandingDispatch: true, ...(e.expectedEtag ? { beforeEtag: state.authority.header.native.etag } : {}) };
    },
    now: () => state.now, sha256: async body => hash(body)
  };
  return { ports, source, state };
};
const run = (f: ReturnType<typeof fixture>): Promise<import('../models/OptionEWorkplanReviewV1Models').ReviewResultV1> => createOptionEWorkplanReviewV1Processor(f.ports, lease).process(f.source);

test('private Audit audience accepts the existing content and recovery owners only', async () => {
  const f = fixture(); expect((await run(f)).outcome).toBe('Completed');
  expect(f.state.acl!.artifacts).toHaveLength(2);
  for (const artifact of f.state.acl!.artifacts) expect(artifact.grants).toEqual([
    { principal: 901, role: 'AppendOnly' }, { principal: 903, role: 'FullControl' }]);
});
test('private Audit audience rejects borrowed Snapshot human and reconciler grants', async () => {
  const f = fixture(), readAcl = f.ports.readReviewAuditAcl;
  f.ports.readReviewAuditAcl = async key => {
    const acl = (await readAcl(key))!, b = (await f.ports.readReviewAuditBindings(key))!;
    return { ...acl, targets: acl.targets.map(target => ({ ...target, assignments: { ...target.assignments,
      totalCount: 5, assignments: [...target.assignments.assignments, ...[902, 201, 202].map(principalId => {
        const p = b.principalBindings.find(principal => principal.principalId === principalId)!, role = b.roleReadbacks[principalId === 902 ? 4 : 0];
        return { ...p, roleDefinitionId: role.id, roleName: role.name, roleTypeKind: role.roleTypeKind, roleHigh: role.high, roleLow: role.low };
      })] } })) };
  };
  expect((await run(f)).outcome).toBe('RecoveryHold');
  expect(f.state.writes).not.toContain('Release');
});
test('ApproveLock writes immutable decisions then independently confirms actual store reads through024', async () => {
  const f = fixture(), preserved = copy(f.state.authority.header.value);
  const r = await run(f); expect(r.outcome).toBe('Completed');
  if (r.outcome !== 'Completed') throw new Error(r.reason);
  expect(r.readback.after.rowVersionToken).toBe(8); expect(r.readback.approved!.version).toBe(2);
  expect(r.readback.after.currentSubmittedSnapshotKey!.length).toBe(302);
  expect(f.state.captureReceipt).toBe(receiptBytes); expect(f.state.audits.size).toBe(2);
  expect(f.state.audits.get('oe-review:7cd2b366-aa4d-4d2c-a046-a5ca92624918:approved')!.body).toBe(input.goldens[1].body);
  expect(f.state.audits.get('oe-review:7cd2b366-aa4d-4d2c-a046-a5ca92624918:receipt')!.body).toBe(input.goldens[2].body);
  expect(f.state.authority.header.value.workplanVersion).toBe(2);
  expect(f.state.authority.header.value.coreCategoryWeight).toBe(preserved.coreCategoryWeight);
  const preservedFields = ['id', 'workplanKey', 'personKey', 'employeeDisplayName', 'employeeEmail', 'performanceYear', 'managerPersonKey',
    'managerDisplayName', 'managerEmail', 'coreCategoryWeight', 'personalCategoryWeight', 'behaviourCategoryWeight', 'overallDeliveryWeightConfiguration',
    'categoryWeightReason', 'submittedAt', 'submittedByEmail', 'managerDecisionComment', 'workplanVersion'] as const;
  for (const field of preservedFields) expect(f.state.authority.header.value[field]).toEqual(preserved[field]);
  expect(f.state.writes.filter(w => w === 'Release')).toHaveLength(1);
});
test('identical terminal replay has zero effects and changed raw byte command collides', async () => {
  const f = fixture(); expect((await run(f)).outcome).toBe('Completed'); const writes = [...f.state.writes];
  expect((await run(f)).outcome).toBe('Completed'); expect(f.state.writes).toEqual(writes);
  f.state.commandBody = JSON.stringify(JSON.parse(f.state.commandBody), undefined, 2);
  expect(await run(f)).toEqual({ outcome: 'RecoveryHold', reason: 'CommandCollision' }); expect(f.state.writes).toEqual(writes);
});
test('RequestChanges named HOLD before any effect', async () => {
  const f = fixture(); f.state.commandBody = JSON.stringify({ ...JSON.parse(f.state.commandBody), command: 'RequestChanges', reason: ' Preserve this exact reason ' });
  expect(await run(f)).toEqual({ outcome: 'RecoveryHold', reason: 'RequestChangesFinalAclReadbackUnavailable' }); expect(f.state.writes).toEqual([]);
});
test.each(['foreignAuthor', 'inactiveManager', 'duplicateManager', 'wrongPointer', 'wrongYear', 'wrongItem', 'wrongVersion', 'missingOrdinal', 'pending', 'wrongState', 'badCapture', 'missingCapture'])(
  '%s fails before effects', async name => {
    const f = fixture(), a = f.state.authority;
    if (name === 'foreignAuthor') f.state.author = 203;
    if (name === 'inactiveManager') a.people[1] = { ...a.people[1], value: { ...a.people[1].value, active: false } };
    if (name === 'duplicateManager') a.people.push(copy(a.people[1]));
    if (name === 'wrongPointer') a.control.currentSubmittedSnapshotKey = 'wrong';
    if (name === 'wrongYear') a.control.performanceYear = 2025;
    if (name === 'wrongItem') a.header = { ...a.header, native: { ...a.header.native, itemId: 99 } };
    if (name === 'wrongVersion') a.header = { ...a.header, value: { ...a.header.value, workplanVersion: 3 } };
    if (name === 'missingOrdinal') f.state.historicalVersion = 0;
    if (name === 'pending') a.pendingRequestKey = 'other';
    if (name === 'wrongState') a.control.state = 'Locked';
    if (name === 'badCapture') f.state.captureReceipt = '{}';
    if (name === 'missingCapture') { f.state.captureReceipt = undefined; f.state.captureSnapshot = undefined; }
    expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
  });
test.each(['ControlClaim', 'ApprovedCreate', 'ReceiptCreate', 'Acl', 'ControlRelease'] as EffectKindV1[])('%s unknown dispatch retains Issued and never blindly retries', async kind => {
  const f = fixture(); f.state.fail = { kind, when: 'unknown' }; expect((await run(f)).outcome).toBe('RecoveryHold');
  const writes = [...f.state.writes]; expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes.filter(w => w !== 'JournalCAS')).toEqual(writes.filter(w => w !== 'JournalCAS'));
  expect(parseReviewJournalV1(f.state.journal!.body).pendingEffect!.kind).toBe(kind);
  expect(f.state.authority.control.state === 'Locked' && f.state.authority.control.transitionStatus === 'Ready').toBe(false);
});
test.each((['ControlClaim', 'ApprovedCreate', 'ReceiptCreate', 'Acl', 'ControlRelease'] as EffectKindV1[]).flatMap(kind => ['before', 'after'].map(when => ({ kind, when: when as 'before' | 'after' }))))(
  '$kind failure $when resolves only with independent Applied/definitive NotApplied proof', async fail => {
    const f = fixture(); f.state.fail = fail; expect((await run(f)).outcome).toBe('RecoveryHold');
    f.state.fail = undefined; expect((await run(f)).outcome).toBe('Completed'); expect(f.state.audits.size).toBe(2);
    expect(f.state.writes.filter(w => w === 'Release')).toHaveLength(1); expect(f.state.authority.control.rowVersionToken).toBe(8);
  });
test('two independent commands compete for one specific control ETag', async () => {
  const f = fixture(); const sourceTwo = { ...f.source, itemId: 6 };
  const read = f.ports.readManagerCommand;
  f.ports.readManagerCommand = async source => {
    const v = await read(source); if (source.itemId === 5) return v;
    const command = { ...v.columns, commandKey: 'c506d905-ec56-45ff-a2a0-2a4ee094fa4a' };
    return { ...v, native: sourceTwo, body: JSON.stringify(command), columns: command };
  };
  const outcomes = await Promise.all([run(f), createOptionEWorkplanReviewV1Processor(f.ports, { ...lease, owner: 'other-owner' }).process(sourceTwo)]);
  expect(outcomes.filter(r => r.outcome === 'Completed')).toHaveLength(1); expect(f.state.writes.filter(w => w === 'Release')).toHaveLength(1);
});
test('independent initial ACL absence holds before journal/header/audit/grant effects', async () => {
  const f = fixture(); f.ports.readFinalAcl = async () => undefined;
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
});
test('genuinely absent receipt can use the unchanged valid snapshot reference', async () => {
  const f = fixture(); f.state.captureReceipt = undefined;
  expect((await run(f)).outcome).toBe('Completed'); expect(parseReviewJournalV1(f.state.journal!.body).sourceCapture.kind).toBe('snapshot');
});
test('raw noncanonical immutable command bytes are hashed without replacing them', async () => {
  const f = fixture(); f.state.commandBody = JSON.stringify(JSON.parse(f.state.commandBody), undefined, 2); const original = f.state.commandBody;
  expect((await run(f)).outcome).toBe('Completed'); expect(parseReviewJournalV1(f.state.journal!.body).commandSource.bodySha256).toBe(hash(original));
  expect(f.state.commandBody).toBe(original);
});
test.each(['readManagerCommand', 'readCurrentAuthority', 'readHistoricalHeaderVersion', 'readCapturedSubmit', 'readJournal', 'readFinalAcl'] as const)('%s query denial never becomes absence or completion', async method => {
  const f = fixture(); const deny = async (): Promise<never> => { throw new Error('fictional query denied'); }; f.ports[method] = deny;
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
});
test('actor replacement after approved creation holds before receipt/release', async () => {
  const f = fixture(), create = f.ports.createAudit; f.ports.createAudit = async (...args) => {
    const row = await create(...args); f.state.authority.people[1] = { ...f.state.authority.people[1], value: { ...f.state.authority.people[1].value, active: false } }; return row;
  };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('ReceiptCreate'); expect(f.state.writes).not.toContain('Release');
});
test('native/header replacement between admission observations produces zero effects', async () => {
  const f = fixture(), query = f.ports.readCurrentAuthority; let reads = 0; f.ports.readCurrentAuthority = async workplan => {
    const v = await query(workplan); if (++reads === 2) return { ...v, header: { ...v.header, native: { ...v.header.native, version: 'replacement' } } }; return v;
  };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
});
test('expired lease preserves unknown effect and performs no takeover/redispatch', async () => {
  const f = fixture(); f.state.fail = { kind: 'Acl', when: 'unknown' }; expect((await run(f)).outcome).toBe('RecoveryHold');
  f.state.now = '2026-10-11T04:00:00.000Z'; const effects = f.state.writes.filter(w => w !== 'JournalCAS');
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes.filter(w => w !== 'JournalCAS')).toEqual(effects);
  expect(parseReviewJournalV1(f.state.journal!.body).pendingEffect!.kind).toBe('Acl');
});
test('terminal immutable artifact replacement cannot replace journal pins during replay', async () => {
  const f = fixture(); expect((await run(f)).outcome).toBe('Completed'); const writes = [...f.state.writes];
  const approved = f.state.audits.get('oe-review:7cd2b366-aa4d-4d2c-a046-a5ca92624918:approved')!; approved.native.itemId = 999;
  const receipt = f.state.audits.get('oe-review:7cd2b366-aa4d-4d2c-a046-a5ca92624918:receipt')!;
  const changed = parseReviewReceiptV1(receipt.body); changed.approvedReference!.native = approved.native; receipt.body = encodeReviewReceiptV1(changed);
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual(writes);
});
test('new command on already Locked header is a wrong-state hold without new effects', async () => {
  const f = fixture(); expect((await run(f)).outcome).toBe('Completed'); const writes = [...f.state.writes];
  f.state.commandBody = JSON.stringify({ ...JSON.parse(f.state.commandBody), commandKey: 'c506d905-ec56-45ff-a2a0-2a4ee094fa4a' });
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual(writes);
});
test('historical native version/state differ from current Submitted; hierarchy and ACL epochs remain independent', async () => {
  const f = fixture(); f.state.authority.control.hierarchyEpoch = 2; f.state.authority.control.aclEpoch = 3;
  f.state.acl!.submitted.hierarchyEpoch = 2; f.state.acl!.submitted.aclEpoch = 3;
  const apply = f.ports.applyFinalAcl; f.ports.applyFinalAcl = async (...args) => { await apply(...args);
    f.state.acl!.submitted.hierarchyEpoch = 2; f.state.acl!.submitted.aclEpoch = 3; };
  const r = await run(f); expect(r.outcome).toBe('Completed');
  if (r.outcome === 'Completed') { expect(r.readback.after.hierarchyEpoch).toBe(2); expect(r.readback.after.aclEpoch).toBe(3); }
  expect(f.state.captureReceipt).toBe(receiptBytes);
});
test('present individually valid but mismatched captured frames cannot use receipt preference as fallback', async () => {
  const f = fixture(), snapshot = copy(parseV5CapturedReceipt(receiptBytes).snapshot);
  snapshot.admission.eventAt = '2026-10-10T12:00:00.000Z'; f.state.captureSnapshot = encodeV5CapturedSnapshot(snapshot);
  expect(await run(f)).toEqual({ outcome: 'RecoveryHold', reason: 'CapturedPairMismatch' }); expect(f.state.writes).toEqual([]);
});
test('actual Audit Created supplies logical receipt time independently of processor decision time', async () => {
  const f = fixture(), create = f.ports.createAudit; f.ports.createAudit = async (...args) => {
    const row = await create(...args); if (row.eventType === 'WorkplanLocked') {
      row.createdAt = '2026-10-11T03:50:05.000Z'; f.state.audits.get(row.key)!.createdAt = row.createdAt;
    } return row;
  };
  const r = await run(f); expect(r.outcome).toBe('Completed');
  if (r.outcome === 'Completed') expect(r.readback.receipt.nativeCreatedAt).toBe('2026-10-11T03:50:05.000Z');
  expect(f.state.authority.header.value.approvedAt).toBe(f.state.now);
});
test('committed immutable create with denied subsequent read stays Issued until independently proved/read', async () => {
  const f = fixture(), query = f.ports.readAudit, create = f.ports.createAudit; let denial = false;
  f.ports.createAudit = async (...args) => { const row = await create(...args); denial = true; return row; };
  f.ports.readAudit = async key => { if (denial && f.state.audits.has(key)) throw new Error('fictional committed read denied'); return query(key); };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(parseReviewJournalV1(f.state.journal!.body).pendingEffect!.kind).toBe('ApprovedCreate');
  denial = false; f.ports.createAudit = create; expect((await run(f)).outcome).toBe('Completed');
  expect(f.state.writes.filter(w => w === 'ApprovedCreate')).toHaveLength(1);
});
test('immutable unique-key collision retains hold and never writes receipt/release', async () => {
  const f = fixture(), key = 'oe-review:7cd2b366-aa4d-4d2c-a046-a5ca92624918:approved';
  f.state.audits.set(key, { key, body: '{}', eventType: 'WorkplanApproved', immutable: true, native: { ...f.source, itemId: 701 }, createdAt: f.state.now,
    commandSource: { native: f.source, bodySha256: hash(f.state.commandBody) } });
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('ApprovedCreate');
  expect(f.state.writes).not.toContain('ReceiptCreate'); expect(f.state.writes).not.toContain('Release');
});
test('actual private Audit broader effective rights block final release', async () => {
  const f = fixture(), query = f.ports.readReviewAuditAcl;
  f.ports.readReviewAuditAcl = async key => { const acl = (await query(key))!;
    return { ...acl, targets: acl.targets.map(target => ({ ...target, effective: target.effective.map(p => p.principalId === 901
      ? { ...p, assignment: { ...p.assignment, effectiveLow: 7 } } : p) })) }; };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Release');
});

test.each(['readReviewAuditBindings', 'readReviewAuditAcl'] as const)('%s missing mandatory port holds before effects', async method => {
  const f = fixture(); delete (f.ports as Partial<ReviewPortsV1>)[method];
  expect(await run(f)).toEqual({ outcome: 'RecoveryHold', reason: 'AuditAclReadbackUnavailable' }); expect(f.state.writes).toEqual([]);
});
test.each(['readReviewAuditBindings', 'readReviewAuditAcl'] as const)('%s denial holds before effects', async method => {
  const f = fixture(); f.ports[method] = async () => { throw new Error('fictional denied Audit query'); };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual([]);
});
test('legacy artifact labels cannot substitute for independently missing private Audit observations', async () => {
  const f = fixture(), query = f.ports.readReviewAuditAcl; f.ports.readReviewAuditAcl = async key => {
    const acl = (await query(key))!; return acl.targets.length ? undefined : acl;
  };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Release');
});
test.each([0, 1])('Audit artifact %i is independently qualified before release and on replay', async index => {
  const f = fixture(); expect((await run(f)).outcome).toBe('Completed'); const writes = [...f.state.writes], query = f.ports.readReviewAuditAcl;
  f.ports.readReviewAuditAcl = async key => { const acl = (await query(key))!;
    return { ...acl, targets: acl.targets.filter((_, i) => i !== index) }; };
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).toEqual(writes);
});
test('private Audit observations are independent of legacy artifacts labels', async () => {
  const f = fixture(), query = f.ports.readFinalAcl; f.ports.readFinalAcl = async key => {
    const acl = (await query(key))!; return { ...acl, artifacts: [] };
  };
  expect((await run(f)).outcome).toBe('Completed');
});
test.each(['ApprovedCreate', 'ReceiptCreate', 'Acl', 'ControlRelease'] as const)('%s dispatch rechecks canonical Audit observations after effect hashing', async kind => {
  const f = fixture(), cas = f.ports.casJournal, query = f.ports.readReviewAuditBindings; let replaced = false;
  f.ports.casJournal = async (...args) => { const row = await cas(...args);
    if (parseReviewJournalV1(row.body).pendingEffect?.kind === kind) replaced = true; return row; };
  f.ports.readReviewAuditBindings = async key => { const b = (await query(key))!; return replaced ? { ...b, roleWeb: { ...b.roleWeb, webId: 'replacement-web' } } : b; };
  expect((await run(f)).outcome).toBe('RecoveryHold');
  expect(f.state.writes).not.toContain(kind === 'ControlRelease' ? 'Release' : kind);
  expect(parseReviewJournalV1(f.state.journal!.body).pendingEffect!.kind).toBe(kind);
});
test('NotApplied without the exact mutable before ETag cannot redispatch', async () => {
  const f = fixture(); f.state.fail = { kind: 'ControlClaim', when: 'before' }; expect((await run(f)).outcome).toBe('RecoveryHold');
  f.ports.recoverEffect = async () => ({ status: 'NotApplied', noOutstandingDispatch: true, beforeEtag: '"different"' });
  f.state.fail = undefined; expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Claim');
});
test('wrong native identity in an Applied proof cannot advance recovery', async () => {
  const f = fixture(); f.state.fail = { kind: 'ApprovedCreate', when: 'after' }; expect((await run(f)).outcome).toBe('RecoveryHold');
  f.ports.recoverEffect = async (_key, e) => ({ status: 'Applied', bodySha256: e.desiredSha256, native: { ...f.source, itemId: 999 } });
  expect((await run(f)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('ReceiptCreate');
});
test('replaced lease fences a stale ACL job before grants or release', async () => {
  const f = fixture(), apply = f.ports.applyFinalAcl;
  const fencedPorts: ReviewPortsV1 = { ...f.ports, applyFinalAcl: async (j, rows, epoch) => {
    const key = j.operationKey, old = f.state.journals.get(key)!, changed = parseReviewJournalV1(old.body);
    changed.lease = { owner: 'foreign-owner', epoch: 2, expiresAt: '2026-10-11T04:10:00.000Z' };
    const row = { body: canonicalReviewV1(changed), native: { ...old.native, etag: '"foreign-fence"' } };
    f.state.journals.set(key, row); f.state.journal = row; await apply(j, rows, epoch);
  } };
  expect((await createOptionEWorkplanReviewV1Processor(fencedPorts, lease).process(f.source)).outcome).toBe('RecoveryHold'); expect(f.state.writes).not.toContain('Acl'); expect(f.state.writes).not.toContain('Release');
  const effects = f.state.writes.filter(w => w !== 'JournalCAS'); expect((await run(f)).outcome).toBe('RecoveryHold');
  expect(f.state.writes.filter(w => w !== 'JournalCAS')).toEqual(effects);
});
test('specific native header fence rejects an already-issued stale release without a business increment', async () => {
  const f = fixture(), cas = f.ports.casControl;
  const fencedPorts: ReviewPortsV1 = { ...f.ports, casControl: async patch => {
    if (patch.mode === 'Release') {
      const a = f.state.authority, etag = '"foreign-header-fence"';
      f.state.authority = { ...a, control: { ...a.control, etag }, header: { native: { ...a.header.native, etag, version: 'fenced' }, value: { ...a.header.value, etag } } };
    } return cas(patch);
  } };
  expect((await createOptionEWorkplanReviewV1Processor(fencedPorts, lease).process(f.source)).outcome).toBe('RecoveryHold');
  expect(f.state.writes).not.toContain('Release'); expect(f.state.authority.control.rowVersionToken).toBe(7);
  expect(parseReviewJournalV1(f.state.journal!.body).pendingEffect!.kind).toBe('ControlRelease');
  const effects = f.state.writes.filter(w => w !== 'JournalCAS'); expect((await run(f)).outcome).toBe('RecoveryHold');
  expect(f.state.writes.filter(w => w !== 'JournalCAS')).toEqual(effects);
});
