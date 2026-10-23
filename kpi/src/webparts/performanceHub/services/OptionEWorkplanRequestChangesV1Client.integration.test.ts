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

import { createOptionEWorkplanRequestChangesV1Client, type RequestChangesClientPorts } from './OptionEWorkplanRequestChangesV1Client';
import type { IOptionEReviewIntent } from './OptionEWorkplanReviewContract';
import type { ManagerCommandObservationV1 } from '../models/OptionEWorkplanReviewV1Models';
import { encodeReviewCommandV1 } from './OptionEWorkplanReviewV1Wire';
const clientFixture = (): {
  f: ReturnType<typeof fixture>; intent: IOptionEReviewIntent; ports: RequestChangesClientPorts;
  store: { rows: Map<string, ManagerCommandObservationV1>; creates: number; processes: number;
    loseCreate?: 'before' | 'after'; denyRead?: boolean; mutateResult?: boolean; finalDenied?: boolean; actorIndex: number };
} => {
  const f = fixture(), command = parseReviewCommandV1(f.state.commandBody);
  const intent: IOptionEReviewIntent = { ...command, actorPersonKey: 'manager' };
  const store = { rows: new Map<string, ManagerCommandObservationV1>(), creates: 0, processes: 0, actorIndex: 1 } as ReturnType<typeof clientFixture>['store'];
  const journal = (): RequestChangesJournalV2 => parseRequestChangesJournalV2(Array.from(f.state.journals.values())[0].body);
  const ports: RequestChangesClientPorts = {
    readCurrentActor: async () => copy(f.state.authority.people[store.actorIndex].value),
    readCurrentAuthority: f.ports.readCurrentAuthority,
    createImmutableManagerCommand: async body => {
      store.creates += 1;
      if (store.loseCreate === 'before') throw new Error('Fictional create response unavailable; no row visible');
      const columns = parseReviewCommandV1(body);
      if (store.rows.has(columns.commandKey)) throw new Error('Fictional unique command constraint');
      const row: ManagerCommandObservationV1 = { body, columns, native: copy(f.source), authorPrincipalId: 202,
        immutable: true, createdAt: '2026-10-11T05:00:00.000Z' };
      store.rows.set(columns.commandKey, copy(row)); f.state.commandBody = body;
      if (store.loseCreate === 'after') throw new Error('Fictional immutable append committed; response lost');
    },
    readImmutableManagerCommand: async key => {
      if (store.denyRead) throw new Error('Fictional current source read denied');
      const row = store.rows.get(key); return row ? copy(row) : undefined;
    },
    processRequestChanges: async native => {
      store.processes += 1;
      const row = store.rows.get(intent.commandKey)!;
      f.state.commandBody = row.body; f.state.author = row.authorPrincipalId;
      const result = await createOptionEWorkplanRequestChangesV2Processor(f.ports, lease).process(native);
      if (store.mutateResult && result.outcome === 'Completed') result.readback.after.rowVersionToken += 1;
      return result;
    },
    finalReadPorts: {
      readCurrentActor: async () => copy(f.state.authority.people[store.actorIndex].value),
      readCurrentHeader: async () => { if (store.finalDenied) throw new Error('Fictional final read denied'); return copy(f.state.authority.header); },
      readReviewControl: async () => copy(f.state.authority.control),
      readSubmittedMetadata: async () => copy(journal().submitted), readApprovedMetadata: async () => undefined,
      readReviewReceipt: async () => { const r = Array.from(f.state.audits.values())[0]; return { ...parseReviewReceiptV1(r.body).receipt, nativeCreatedAt: r.createdAt }; },
      readReceipt: async () => f.state.captureReceipt, readSnapshot: async () => f.state.captureSnapshot,
      readRequestChangesAclBinding: f.ports.readRequestChangesAclBinding, readRequestChangesFinalAcl: f.ports.readRequestChangesFinalAcl,
      sha256: f.ports.sha256
    }
  };
  return { f, intent, ports, store };
};

test('one real immutable command drives all five effects, raw reason and fresh canonical reopen', async () => {
  const x = clientFixture(); x.intent.commandKey = randomUUID(); x.intent.reason = '  Please retain this exact reason.  ';
  const client = createOptionEWorkplanRequestChangesV1Client(x.intent, x.ports);
  const result = await client.submit(); expect(result.outcome).toBe('Completed');
  expect(x.store.creates).toBe(1); expect(x.f.state.traces.map(t => t.kind)).toEqual(['ControlClaim','ReceiptCreate','DecisionReady','Acl','ControlRelease']);
  expect(parseReviewCommandV1(x.store.rows.get(x.intent.commandKey)!.body).reason).toBe(x.intent.reason);
  const reopened = await x.ports.readCurrentAuthority(x.intent.expectedWorkplanKey);
  expect(reopened.control).toMatchObject({state:'ChangesRequested',transitionStatus:'Ready',rowVersionToken:8});
  expect(reopened.header.value).toMatchObject({accessState:'EmployeeEdit',managerDecisionComment:x.intent.reason});
  expect(x.f.state.captureReceipt).toBe(receiptBytes); expect(x.f.state.audits.size).toBe(1);
  const writes = [...x.f.state.writes]; expect((await client.refresh()).outcome).toBe('Completed');
  expect(x.store.creates).toBe(1); expect(x.f.state.writes).toEqual(writes);
});
test('simultaneous submits share one retained promise and one immutable append', async () => {
  const x = clientFixture(), client = createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports);
  const first = client.submit(), second = client.submit(); expect(second).toBe(first);
  expect((await first).outcome).toBe('Completed'); expect(x.store.creates).toBe(1); expect(x.store.processes).toBe(1);
});
test('committed immutable create with lost response rereads the same key', async () => {
  const x = clientFixture(); x.store.loseCreate='after';
  expect((await createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports).submit()).outcome).toBe('Completed');
  expect(x.store.creates).toBe(1); expect(x.store.rows.size).toBe(1);
});
test('unknown absent create is retained and never automatically repeated', async () => {
  const x=clientFixture();x.store.loseCreate='before';const client=createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports);
  expect(await client.submit()).toEqual({outcome:'RecoveryHold',reason:'CommandCreateUncertain'});
  x.store.loseCreate=undefined;
  expect(await client.refresh()).toEqual({outcome:'RecoveryHold',reason:'CommandCreateUncertain'});
  expect(client.getIntent().commandKey).toBe(x.intent.commandKey);expect(x.store.creates).toBe(1);expect(x.store.processes).toBe(0);
});
test('a delayed source becomes visible under the retained key without another create',async()=>{
  const x=clientFixture();x.store.loseCreate='before';const client=createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports);
  expect((await client.submit()).outcome).toBe('RecoveryHold');
  const columns=parseReviewCommandV1(x.f.state.commandBody);
  x.store.rows.set(x.intent.commandKey,{body:encodeReviewCommandV1(columns),columns,native:copy(x.f.source),authorPrincipalId:202,immutable:true,createdAt:'2026-10-11T05:00:00.000Z'});
  expect((await client.refresh()).outcome).toBe('Completed');expect(x.store.creates).toBe(1);expect(x.store.processes).toBe(1);
});
test('actor replacement after append holds the actual command without processor dispatch',async()=>{
  const x=clientFixture(),original=x.ports.createImmutableManagerCommand;
  const ports={...x.ports,createImmutableManagerCommand:async(body:string)=>{await original(body);x.store.actorIndex=2;}};
  expect(await createOptionEWorkplanRequestChangesV1Client(x.intent,ports).submit()).toEqual({outcome:'RecoveryHold',reason:'CurrentManagerMismatch'});
  expect(x.store.creates).toBe(1);expect(x.store.rows.size).toBe(1);expect(x.store.processes).toBe(0);expect(x.f.state.writes).toEqual([]);
});
test('source version replacement between admission reads stops before command creation',async()=>{
  const x=clientFixture();let reads=0;
  const ports={...x.ports,readCurrentAuthority:async()=>{reads+=1;if(reads===2){x.f.state.authority.control.rowVersionToken+=1;x.f.state.authority.header={...x.f.state.authority.header,value:{...x.f.state.authority.header.value,rowVersionToken:x.f.state.authority.control.rowVersionToken}};}return copy(x.f.state.authority);}};
  expect(await createOptionEWorkplanRequestChangesV1Client(x.intent,ports).submit()).toEqual({outcome:'RecoveryHold',reason:'AuthorityChangedBeforeCommand'});
  expect(x.store.creates).toBe(0);expect(x.store.processes).toBe(0);expect(x.f.state.writes).toEqual([]);
});
test('denied source read does not append or claim success', async () => {
  const x=clientFixture();x.store.denyRead=true;
  expect(await createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports).submit()).toEqual({outcome:'RecoveryHold',reason:'ReadUnavailable'});
  expect(x.store.creates).toBe(0);expect(x.store.processes).toBe(0);
});
test('missing strict final read port holds before any append or processor dispatch',async()=>{
  const x=clientFixture();Object.assign(x.ports.finalReadPorts,{readReviewReceipt:undefined});
  expect(await createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports).submit()).toEqual({outcome:'RecoveryHold',reason:'ClientUnbound'});
  expect(x.store.creates).toBe(0);expect(x.store.processes).toBe(0);
});
test.each([0,2])('fictional non-manager identity %s cannot create a decision',async actorIndex=>{
  const x=clientFixture();x.store.actorIndex=actorIndex;
  expect((await createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports).submit()).outcome).toBe('RecoveryHold');
  expect(x.store.creates).toBe(0);expect(x.f.state.writes).toEqual([]);
});
test('changed source Author on retained command blocks processor replay',async()=>{
  const x=clientFixture(),client=createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports);
  expect((await client.submit()).outcome).toBe('Completed');
  x.store.rows.get(x.intent.commandKey)!.authorPrincipalId=203;
  expect(await client.refresh()).toEqual({outcome:'RecoveryHold',reason:'CommandSourceMismatch'});expect(x.store.processes).toBe(1);
});
test('ordinary same-key body mismatch cannot be dispatched',async()=>{
  const x=clientFixture(),changed={...parseReviewCommandV1(x.f.state.commandBody),reason:'Different reason'};
  x.store.rows.set(x.intent.commandKey,{body:encodeReviewCommandV1(changed),columns:changed,native:copy(x.f.source),authorPrincipalId:202,immutable:true,createdAt:'2026-10-11T05:00:00.000Z'});
  expect(await createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports).submit()).toEqual({outcome:'RecoveryHold',reason:'CommandSourceMismatch'});
  expect(x.store.creates).toBe(0);expect(x.store.processes).toBe(0);
});
test.each(['finalDenied','mutateResult'] as const)('%s cannot promote processor completion to client success',async mode=>{
  const x=clientFixture();x.store[mode]=true;
  expect((await createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports).submit()).outcome).toBe('RecoveryHold');
  expect(x.f.state.authority.control.rowVersionToken).toBe(8);expect(x.store.creates).toBe(1);
});
test('unknown ACL is retained without duplicate append or grant',async()=>{
  const x=clientFixture();x.f.state.fail={kind:'Acl',when:'unknown'};
  const client=createOptionEWorkplanRequestChangesV1Client(x.intent,x.ports);expect((await client.submit()).outcome).toBe('RecoveryHold');
  const writes=x.f.state.writes.filter(w=>w!=='JournalCAS');
  expect((await client.refresh()).outcome).toBe('RecoveryHold');expect(x.store.creates).toBe(1);
  expect(x.f.state.writes.filter(w=>w!=='JournalCAS')).toEqual(writes);expect(x.f.state.authority.control.rowVersionToken).toBe(7);
});
