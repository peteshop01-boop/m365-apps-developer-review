import { readFileSync } from 'fs';
import { createHash, randomUUID } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
import type { Native, ReviewPortsV1, ReviewAuthorityV1, ReviewAuditV1, ReviewJournalObservationV1, ReviewAclV1, EffectKindV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { ReviewAuditBindings, ReviewAuditAclObservation } from './OptionEWorkplanReviewAuditSourceReadback';
import { OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE } from './OptionEWorkplanPhysicalSchema';
import { parseReviewCommandV1, parseReviewJournalV1, parseReviewReceiptV1, parseReviewApprovedV1, encodeReviewCommandV1, canonicalReviewV1 } from './OptionEWorkplanReviewV1Wire';
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
      state: 'Submitted' as const, transitionStatus: 'Ready', accessState: 'ReadOnly', rowVersionToken: 7, workplanVersion: 2, managerPersonKey: 'manager' } },
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

import { createOptionEWorkplanApproveLockV1Client, type ApproveLockClientPorts } from './OptionEWorkplanApproveLockV1Client';
import type { IOptionEReviewIntent } from './OptionEWorkplanReviewContract';
import type { ManagerCommandObservationV1 } from '../models/OptionEWorkplanReviewV1Models';
const clientFixture = (): { f: ReturnType<typeof fixture>; intent: IOptionEReviewIntent; ports: ApproveLockClientPorts;
  store: { rows: Map<string, ManagerCommandObservationV1>; creates: number; processes: number; actorIndex: number;
    loseCreate?: 'before' | 'after'; denyRead?: boolean; finalDenied?: boolean; mutateResult?: boolean } } => {
  const f = fixture(), command = parseReviewCommandV1(f.state.commandBody);
  const intent: IOptionEReviewIntent = { ...command, commandKey: randomUUID(), actorPersonKey: 'manager' };
  const store = { rows: new Map<string, ManagerCommandObservationV1>(), creates: 0, processes: 0, actorIndex: 1 } as ReturnType<typeof clientFixture>['store'];
  const journal = (): ReturnType<typeof parseReviewJournalV1> => parseReviewJournalV1(Array.from(f.state.journals.values())[0].body);
  const ports: ApproveLockClientPorts = {
    readCurrentActor: async () => copy(f.state.authority.people[store.actorIndex].value), readCurrentAuthority: f.ports.readCurrentAuthority,
    createImmutableManagerCommand: async body => {
      store.creates += 1;
      if (store.loseCreate === 'before') throw new Error('Fictional uncertain create without visible row');
      const columns = parseReviewCommandV1(body);
      if (store.rows.has(columns.commandKey)) throw new Error('Fictional unique immutable command conflict');
      store.rows.set(columns.commandKey, { body, columns, native: copy(f.source), authorPrincipalId: 202,
        immutable: true, createdAt: f.state.createdAt }); f.state.commandBody = body;
      if (store.loseCreate === 'after') throw new Error('Fictional append committed; response lost');
    },
    readImmutableManagerCommand: async key => { if (store.denyRead) throw new Error('Fictional source denial');
      const row = store.rows.get(key); return row ? copy(row) : undefined; },
    processApproveLock: async native => {
      store.processes += 1; const row = store.rows.get(intent.commandKey)!;
      expect(native).toEqual(row.native); f.state.commandBody = row.body; f.state.author = row.authorPrincipalId;
      const result = await createOptionEWorkplanReviewV1Processor(f.ports, lease).process(native);
      if (store.mutateResult && result.outcome === 'Completed') result.readback.after.rowVersionToken += 1;
      return result;
    },
    finalReadPorts: {
      readCurrentActor: async () => copy(f.state.authority.people[store.actorIndex].value),
      readCurrentHeader: async () => { if (store.finalDenied) throw new Error('Fictional final source denial'); return copy(f.state.authority.header); },
      readReviewControl: async () => copy(f.state.authority.control), readSubmittedMetadata: async () => copy(journal().submitted),
      readApprovedMetadata: async key => { const row = f.state.audits.get(key); return row ? parseReviewApprovedV1(row.body).approved : undefined; },
      readReviewReceipt: async key => { const row = f.state.audits.get(`oe-review:${key}:receipt`);
        return row ? { ...parseReviewReceiptV1(row.body).receipt, nativeCreatedAt: row.createdAt } : undefined; },
      readReceipt: async () => f.state.captureReceipt, readSnapshot: async () => f.state.captureSnapshot,
      readAcl: async () => f.state.acl && copy(f.state.acl.submitted), sha256: f.ports.sha256
    }
  };
  return { f, intent, ports, store };
};
test('real immutable Approve command executes five effects and qualifies approved digest, two private artifacts and n+1', async () => {
  const x = clientFixture(), original = copy(x.f.state.authority.header.value);
  const client = createOptionEWorkplanApproveLockV1Client(x.intent, x.ports), result = await client.submit();
  expect(result.outcome).toBe('Completed'); if (result.outcome !== 'Completed') throw new Error(result.reason);
  expect(Array.from(x.f.state.effects.keys())).toEqual(['ControlClaim', 'ApprovedCreate', 'ReceiptCreate', 'Acl', 'ControlRelease']);
  expect(x.store.creates).toBe(1); expect(x.f.state.audits.size).toBe(2); expect(x.f.state.writes.filter(w => w === 'Release')).toHaveLength(1);
  expect(result.readback.after).toMatchObject({ state: 'Locked', transitionStatus: 'Ready', rowVersionToken: 8 });
  expect(result.readback.approved).toMatchObject({ immutable: true, version: 2, payloadSha256: result.readback.submitted.payloadSha256 });
  expect(result.readback.submitted.payloadSha256).toBe(hash(parseV5CapturedReceipt(receiptBytes).snapshot.body));
  expect(x.f.state.authority.header.value).toMatchObject({ accessState: 'ReadOnly', workplanVersion: original.workplanVersion });
  expect(Array.from(x.f.state.audits.values()).map(row => row.eventType)).toEqual(['WorkplanApproved', 'WorkplanLocked']);
  expect(x.f.state.acl!.artifacts.every(row => row.grants.length === 2 && row.grants.every(g => g.principal === 901 || g.principal === 903))).toBe(true);
  expect(parseReviewCommandV1(x.store.rows.get(x.intent.commandKey)!.body)).not.toHaveProperty('reason');
  expect(x.f.state.captureReceipt).toBe(receiptBytes);
  const writes = [...x.f.state.writes]; expect((await client.refresh()).outcome).toBe('Completed');
  expect(x.store.creates).toBe(1); expect(x.f.state.writes).toEqual(writes);
});
test('simultaneous Approve submits share the same pending promise and one append', async () => {
  const x = clientFixture(), client = createOptionEWorkplanApproveLockV1Client(x.intent, x.ports);
  const first = client.submit(); expect(client.submit()).toBe(first); expect(client.refresh()).toBe(first);
  expect((await first).outcome).toBe('Completed'); expect(x.store.creates).toBe(1); expect(x.store.processes).toBe(1);
});
test('lost create response rereads the committed exact immutable command', async () => {
  const x = clientFixture(); x.store.loseCreate = 'after';
  expect((await createOptionEWorkplanApproveLockV1Client(x.intent, x.ports).submit()).outcome).toBe('Completed');
  expect(x.store.creates).toBe(1); expect(x.store.rows.size).toBe(1);
});
test('unknown absent creation never repeats append and retains its UUID', async () => {
  const x = clientFixture(); x.store.loseCreate = 'before'; const client = createOptionEWorkplanApproveLockV1Client(x.intent, x.ports);
  expect(await client.submit()).toEqual({ outcome: 'RecoveryHold', reason: 'CommandCreateUncertain' }); x.store.loseCreate = undefined;
  expect(await client.refresh()).toEqual({ outcome: 'RecoveryHold', reason: 'CommandCreateUncertain' });
  expect(client.getIntent().commandKey).toBe(x.intent.commandKey); expect(x.store.creates).toBe(1); expect(x.store.processes).toBe(0);
});
test('delayed immutable source under the same retained UUID resumes without another append', async () => {
  const x = clientFixture(); x.store.loseCreate = 'before'; const client = createOptionEWorkplanApproveLockV1Client(x.intent, x.ports);
  expect((await client.submit()).outcome).toBe('RecoveryHold');
  const columns = { ...parseReviewCommandV1(x.f.state.commandBody), commandKey: x.intent.commandKey };
  x.store.rows.set(x.intent.commandKey, { body: encodeReviewCommandV1(columns), columns, native: copy(x.f.source), immutable: true,
    authorPrincipalId: 202, createdAt: x.f.state.createdAt });
  expect((await client.refresh()).outcome).toBe('Completed'); expect(x.store.creates).toBe(1);
});
test('denied source read holds before append or effects', async () => {
  const x = clientFixture(); x.store.denyRead = true;
  expect(await createOptionEWorkplanApproveLockV1Client(x.intent, x.ports).submit()).toEqual({ outcome: 'RecoveryHold', reason: 'ReadUnavailable' });
  expect(x.store.creates).toBe(0); expect(x.f.state.writes).toEqual([]);
});
test.each([0, 2])('current non-manager %s holds before append', async actorIndex => {
  const x = clientFixture(); x.store.actorIndex = actorIndex;
  expect((await createOptionEWorkplanApproveLockV1Client(x.intent, x.ports).submit()).outcome).toBe('RecoveryHold');
  expect(x.store.creates).toBe(0); expect(x.f.state.writes).toEqual([]);
});
test.each(['actor', 'pointer', 'header'] as const)('%s replacement after append prevents completed approval', async mode => {
  const x = clientFixture(), create = x.ports.createImmutableManagerCommand;
  const ports = { ...x.ports, createImmutableManagerCommand: async (body: string) => {
    await create(body);
    if (mode === 'actor') x.store.actorIndex = 2;
    else if (mode === 'pointer') x.f.state.authority.control.currentSubmittedSnapshotKey = 'replacement';
    else x.f.state.authority.header = { ...x.f.state.authority.header,
      native: { ...x.f.state.authority.header.native, itemId: x.f.state.authority.header.native.itemId + 1 } };
  } };
  expect((await createOptionEWorkplanApproveLockV1Client(x.intent, ports).submit()).outcome).toBe('RecoveryHold');
  expect(x.store.creates).toBe(1); expect(x.store.processes).toBe(0); expect(x.f.state.writes).toEqual([]);
});
test('current ETag replacement between admission reads holds before append', async () => {
  const x = clientFixture(); let reads = 0;
  const ports = { ...x.ports, readCurrentAuthority: async () => { reads += 1; if (reads === 2) {
    x.f.state.authority.control.etag = '"replacement"';
    x.f.state.authority.header = { native: { ...x.f.state.authority.header.native, etag: '"replacement"' },
      value: { ...x.f.state.authority.header.value, etag: '"replacement"' } }; } return copy(x.f.state.authority); } };
  expect(await createOptionEWorkplanApproveLockV1Client(x.intent, ports).submit()).toEqual({ outcome: 'RecoveryHold', reason: 'AuthorityChangedBeforeCommand' });
  expect(x.store.creates).toBe(0);
});
test('input/returned intent and port mutation cannot replace the retained attempt', async () => {
  const x = clientFixture(), expected = copy(x.intent), client = createOptionEWorkplanApproveLockV1Client(x.intent, x.ports);
  x.intent.expectedSubmittedSnapshotKey = 'changed'; client.getIntent().expectedControlVersion = 99;
  Object.assign(x.ports, { createImmutableManagerCommand: async () => { throw new Error('replacement port must not run'); } });
  // Processor fixture lookup uses its own declared command key; the immutable intent owns the original key.
  x.intent.commandKey = expected.commandKey;
  expect((await client.submit()).outcome).toBe('Completed'); expect(client.getIntent()).toEqual(expected);
  expect(x.store.creates).toBe(1);
});
test('Approve rejects a reason instead of persisting a manager reason field', async () => {
  const x = clientFixture(); x.intent.reason = 'Not an Approve field';
  expect((await createOptionEWorkplanApproveLockV1Client(x.intent, x.ports).submit()).outcome).toBe('RecoveryHold'); expect(x.store.creates).toBe(0);
});
test('missing final read port holds before append', async () => {
  const x = clientFixture(); Object.assign(x.ports.finalReadPorts, { readAcl: undefined });
  expect(await createOptionEWorkplanApproveLockV1Client(x.intent, x.ports).submit()).toEqual({ outcome: 'RecoveryHold', reason: 'ClientUnbound' });
  expect(x.store.creates).toBe(0); expect(x.store.processes).toBe(0);
});
test.each(['finalDenied', 'mutateResult'] as const)('%s leaves committed approval uncertain to the client', async mode => {
  const x = clientFixture(); x.store[mode] = true;
  expect((await createOptionEWorkplanApproveLockV1Client(x.intent, x.ports).submit()).outcome).toBe('RecoveryHold');
  expect(x.f.state.authority.control.rowVersionToken).toBe(8); expect(x.store.creates).toBe(1);
});
test('changed immutable Author blocks processor replay', async () => {
  const x = clientFixture(), client = createOptionEWorkplanApproveLockV1Client(x.intent, x.ports);
  expect((await client.submit()).outcome).toBe('Completed'); x.store.rows.get(x.intent.commandKey)!.authorPrincipalId = 203;
  expect(await client.refresh()).toEqual({ outcome: 'RecoveryHold', reason: 'CommandSourceMismatch' }); expect(x.store.processes).toBe(1);
});
test('unknown ACL and expired owner preserve pending state without append or blind effects', async () => {
  const x = clientFixture(); x.f.state.fail = { kind: 'Acl', when: 'unknown' };
  const client = createOptionEWorkplanApproveLockV1Client(x.intent, x.ports); expect((await client.submit()).outcome).toBe('RecoveryHold');
  const writes = x.f.state.writes.filter(w => w !== 'JournalCAS'); x.f.state.now = '2026-10-11T04:00:00.000Z';
  expect((await client.refresh()).outcome).toBe('RecoveryHold'); expect(x.store.creates).toBe(1);
  expect(x.f.state.writes.filter(w => w !== 'JournalCAS')).toEqual(writes); expect(x.f.state.authority.control.rowVersionToken).toBe(7);
});
test('actual processor mandatory private Audit seam cannot be replaced by a client success projection', async () => {
  const x = clientFixture(); Object.assign(x.f.ports, { readReviewAuditAcl: undefined });
  expect(await createOptionEWorkplanApproveLockV1Client(x.intent, x.ports).submit()).toEqual({ outcome: 'RecoveryHold', reason: 'AuditAclReadbackUnavailable' });
  expect(x.store.creates).toBe(1); expect(x.f.state.writes).toEqual([]);
});
test.each(['actor', 'header'] as const)('%s replacement during independent final hash holds a committed approval', async mode => {
  const x = clientFixture(), digest = x.ports.finalReadPorts.sha256;
  const ports = { ...x.ports, finalReadPorts: { ...x.ports.finalReadPorts, sha256: async (body: string) => {
    const actual = await digest(body);
    if (mode === 'actor') x.store.actorIndex = 2;
    else x.f.state.authority.header = { ...x.f.state.authority.header,
      native: { ...x.f.state.authority.header.native, itemId: x.f.state.authority.header.native.itemId + 1 } };
    return actual;
  } } };
  expect((await createOptionEWorkplanApproveLockV1Client(x.intent, ports).submit()).outcome).toBe('RecoveryHold');
  expect(x.f.state.authority.control.rowVersionToken).toBe(8); expect(x.store.creates).toBe(1);
});
test('same UUID with different valid command body holds without append or dispatch', async () => {
  const x = clientFixture(), columns = { ...parseReviewCommandV1(x.f.state.commandBody),
    commandKey: x.intent.commandKey, expectedControlVersion: 8 };
  x.store.rows.set(x.intent.commandKey, { body: encodeReviewCommandV1(columns), columns, native: copy(x.f.source),
    authorPrincipalId: 202, immutable: true, createdAt: x.f.state.createdAt });
  expect(await createOptionEWorkplanApproveLockV1Client(x.intent, x.ports).submit()).toEqual({ outcome: 'RecoveryHold', reason: 'CommandSourceMismatch' });
  expect(x.store.creates).toBe(0); expect(x.store.processes).toBe(0); expect(x.f.state.writes).toEqual([]);
});

describe('current completion after actual processor and strict factory', () => {
  type Replacement = 'version' | 'state' | 'access' | 'pointer' | 'actor' | 'pending' | 'lastOperation' | 'nativeVersion' | 'denial';
  const change = (x: ReturnType<typeof clientFixture>, mode: Replacement): void => {
    const a = x.f.state.authority;
    if (mode === 'version') {
      a.control = { ...a.control, etag: '"later-control-9"', rowVersionToken: 9 };
      a.header = { native: { ...a.header.native, etag: '"later-control-9"', version: 'opaque-later-native' },
        value: { ...a.header.value, etag: '"later-control-9"', rowVersionToken: 9 } };
    } else if (mode === 'state') a.control = { ...a.control, state: 'Submitted' };
    else if (mode === 'access') a.header = { ...a.header, value: { ...a.header.value, accessState: 'EmployeeEdit' } };
    else if (mode === 'pointer') a.control = { ...a.control, currentApprovedSnapshotKey: 'later-approved' };
    else if (mode === 'actor') x.store.actorIndex = 2;
    else if (mode === 'pending') a.pendingRequestKey = 'foreign-pending';
    else if (mode === 'lastOperation') a.lastOperationKey = 'foreign-last-operation';
    else if (mode === 'nativeVersion') a.header = { ...a.header, native: { ...a.header.native, version: 'opaque-concurrent-native' } };
  };
  test.each(['beforeSource', 'duringSource'] as const)('C06 later actual version9 at %s holds instead of Completed8', async stage => {
    const x = clientFixture(); let finalAclReads = 0, replaced = false, sourceReads = 0;
    const ports: ApproveLockClientPorts = { ...x.ports,
      finalReadPorts: { ...x.ports.finalReadPorts, readAcl: async workplan => { finalAclReads += 1; return x.ports.finalReadPorts.readAcl(workplan); } },
      readCurrentAuthority: async workplan => {
        if (stage === 'beforeSource' && finalAclReads >= 2 && !replaced) { change(x, 'version'); replaced = true; }
        return x.ports.readCurrentAuthority(workplan);
      },
      readImmutableManagerCommand: async key => {
        sourceReads += 1;
        if (stage === 'duringSource' && finalAclReads >= 2 && !replaced) { change(x, 'version'); replaced = true; }
        return x.ports.readImmutableManagerCommand(key);
      }
    };
    const client = createOptionEWorkplanApproveLockV1Client(x.intent, ports), result = await client.submit();
    expect(replaced).toBe(true); expect(x.f.state.authority.control.rowVersionToken).toBe(9);
    expect(x.f.state.authority.header.native.version).toBe('opaque-later-native');
    expect(result.outcome).toBe('RecoveryHold'); expect(client.getIntent()).toEqual(x.intent);
    expect(x.store.creates).toBe(1); expect(x.store.processes).toBe(1);
    expect(sourceReads).toBeGreaterThanOrEqual(2); expect(x.f.state.writes.filter(w => w === 'Release')).toHaveLength(1);
  });
  test.each(['state', 'access', 'pointer', 'actor', 'pending', 'lastOperation', 'nativeVersion', 'denial'] as const)
  ('%s replacement during last command reread cannot confirm the old final result', async mode => {
    const x = clientFixture(); let finalAclReads = 0, changed = false, deny = false;
    const ports: ApproveLockClientPorts = { ...x.ports,
      finalReadPorts: { ...x.ports.finalReadPorts, readAcl: async workplan => { finalAclReads += 1; return x.ports.finalReadPorts.readAcl(workplan); } },
      readImmutableManagerCommand: async key => {
        if (finalAclReads >= 2 && !changed) { changed = true; if (mode === 'denial') deny = true; else change(x, mode); }
        return x.ports.readImmutableManagerCommand(key);
      },
      readCurrentAuthority: async workplan => { if (deny) throw new Error('Fictional current completion observation denied'); return x.ports.readCurrentAuthority(workplan); }
    };
    const client = createOptionEWorkplanApproveLockV1Client(x.intent, ports);
    expect((await client.submit()).outcome).toBe('RecoveryHold'); expect(changed).toBe(true);
    expect(x.store.creates).toBe(1); expect(x.f.state.writes.filter(w => w === 'Release')).toHaveLength(1);
  });
  test('unchanged exact n+1 with opaque native version completes and replay has no effects', async () => {
    const x = clientFixture();
    x.f.state.authority.header = { ...x.f.state.authority.header,
      native: { ...x.f.state.authority.header.native, version: 'opaque-initial-version' } };
    const client = createOptionEWorkplanApproveLockV1Client(x.intent, x.ports);
    expect((await client.submit()).outcome).toBe('Completed');
    const writes = [...x.f.state.writes]; expect((await client.refresh()).outcome).toBe('Completed');
    expect(x.f.state.writes).toEqual(writes); expect(x.store.creates).toBe(1);
    expect(x.f.state.authority.control.rowVersionToken).toBe(8);
    expect(x.f.state.authority.header.native.version).toMatch(/^native-/);
  });
});
