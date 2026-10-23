import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { TextEncoder } from 'util';
import type { Native, ReviewAuthorityV1 } from '../models/OptionEWorkplanReviewV1Models';
import { parseReviewJournalV1, parseReviewReceiptV1 } from './OptionEWorkplanReviewV1Wire';
import { parseV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE } from './OptionEWorkplanPhysicalSchema';
import { createOptionEWorkplanReviewAuditSourceReadback, type ReviewAuditReadPorts, type ReviewAuditBindings,
  type ReviewAuditAclObservation, type ReviewAuditReadContext, type ReviewAuditSourceRow, type ReviewAuditExpected,
  type ReviewAuditSourceObservation } from './OptionEWorkplanReviewAuditSourceReadback';
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hash = (body: string): string => createHash('sha256').update(body, 'utf8').digest('hex').toUpperCase();
Object.assign(globalThis, { TextEncoder });
const inputs: { goldens: { body: string }[] } = JSON.parse(readFileSync(
  'temp/test-fixtures/review/normal-goldens.json', 'utf8'));
const historical = parseV5CapturedReceipt(readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-global-r3-receipt.json', 'utf8'));
type MutableFixturePorts = { -readonly [K in keyof ReviewAuditReadPorts]: ReviewAuditReadPorts[K] };

/** Declared fictional canonical store, three people (201/202/203) and service/native role reads.
 * Ordinary read observations do not prove M365 sign-in, provider completeness or real rights. */
const fixture = (): { ports: MutableFixturePorts; context: ReviewAuditReadContext; expected: ReviewAuditExpected[];
  state: { authority: ReviewAuthorityV1; bindings: ReviewAuditBindings; acl: ReviewAuditAclObservation;
    rows: Map<string, ReviewAuditSourceRow>; journal: { body: string; native: Native } } } => {
  const j = parseReviewJournalV1(inputs.goldens[3].body), base = j.commandSource.native;
  const native = (itemId: number, listId = '5269ebee-565a-4093-a666-00c98cfc5f68'): Native => ({ ...base, itemId, listId });
  const context: ReviewAuditReadContext = { operationKey: j.operationKey, before: copy(j.before), actorBinding: copy(j.actorBinding), commandSource: copy(j.commandSource) };
  const authority: ReviewAuthorityV1 = { header: { native: copy(j.headerNative), value: { ...copy(historical.snapshot.admission.authority.workplan.value),
    id: j.headerNative.itemId, etag: j.headerNative.etag, workplanVersion: 2, state: 'Submitted', transitionStatus: 'Ready', rowVersionToken: 7, managerPersonKey: 'manager' } },
    control: copy(j.before), people: [
      { native: native(11), value: { personKey: 'employee', principalId: 201, email: 'employee@kcf-test.invalid', active: true, managerPersonKey: 'manager' } },
      { native: copy(j.actorBinding.personNative), value: { personKey: 'manager', principalId: 202, email: 'manager@kcf-test.invalid', active: true } },
      { native: native(13), value: { personKey: 'foreign', principalId: 203, email: 'foreign@kcf-test.invalid', active: true } }
    ] };
  const expected: ReviewAuditExpected[] = [{ key: `${j.operationKey}:approved`, eventType: 'WorkplanApproved', body: inputs.goldens[1].body },
    { key: `${j.operationKey}:receipt`, eventType: 'WorkplanLocked', body: inputs.goldens[2].body }];
  const rows = new Map(expected.map((e, i) => [e.key, { ...e, native: native(701 + i), immutable: true as const,
    createdAt: '2026-10-11T03:50:00.000Z', commandSource: copy(j.commandSource) }]));
  const bindings: ReviewAuditBindings = { operationKey: j.operationKey, workplanKey: j.before.workplanKey, hierarchyEpoch: 4, aclEpoch: 4,
    auditList: { siteId: base.siteId, webId: base.webId, listId: native(701).listId }, roleWeb: { siteId: base.siteId, webId: base.webId },
    automationPrincipalIds: { contentProcessor: 901, aclReconciler: 902, recoveryAdmin: 903 },
    principalBindings: [901, 902, 903, 201, 202].map(principalId => ({ principalId, principalKey: `fictional-observed-login-${principalId}`, principalType: 1 })),
    roleIds: { itemReader: 101, addReadNoEdit: 102, draftEditor: 103, mutatorNoDelete: 104, aclReconciler: 105, fullControl: 106 },
    roleReadbacks: [...OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE].map((r, i) => ({ id: 101 + i, name: r.name, roleTypeKind: r.roleTypeKind, high: r.high, low: r.low })),
    items: expected.map(e => ({ key: e.key, native: copy(rows.get(e.key)!.native), target: `KCFKPI_Audit/2026/employee/${e.key}` })) };
  const owners = [{ id: 901, role: bindings.roleReadbacks[1] }, { id: 903, role: bindings.roleReadbacks[5] }];
  const acl: ReviewAuditAclObservation = { operationKey: j.operationKey, workplanKey: j.before.workplanKey, hierarchyEpoch: 4, aclEpoch: 4,
    targets: bindings.items.map(item => ({ key: item.key, native: copy(item.native), inherited: false,
      assignments: { target: item.target, canonicalCollectionPath: `${item.target}/RoleAssignments`, pageCount: 1, totalCount: 2, complete: true,
        continuationUris: [], assignments: owners.map(owner => ({ ...bindings.principalBindings.find(p => p.principalId === owner.id)!,
          roleDefinitionId: owner.role.id, roleName: owner.role.name, roleTypeKind: owner.role.roleTypeKind, roleHigh: owner.role.high, roleLow: owner.role.low })) },
      effective: [901, 902, 903, 201, 202].map(principalId => { const role = owners.find(o => o.id === principalId)?.role;
        return { principalId, assignment: { assignedRoles: role ? [copy(role)] : [], effectiveHigh: role?.high || 0, effectiveLow: role?.low || 0 } }; }) })) };
  const state = { authority, bindings, acl, rows, journal: { body: inputs.goldens[3].body, native: native(500, '5814ad1f-0862-4c11-af3c-1826ec1250cb') } };
  const ports: MutableFixturePorts = { readReviewAuditBindings: async () => copy(state.bindings), readReviewAuditAcl: async () => copy(state.acl),
    readCurrentAuthority: async () => copy(state.authority), readAudit: async key => state.rows.has(key) ? copy(state.rows.get(key)!) : undefined,
    readJournal: async () => copy(state.journal), sha256: async body => hash(body) };
  return { ports, context: { ...context, journal: copy(state.journal) }, expected, state };
};
const confirm = (f: ReturnType<typeof fixture>): Promise<ReviewAuditSourceObservation> => createOptionEWorkplanReviewAuditSourceReadback(f.ports).confirm(f.context, f.expected);

test('proper private plan independently reads both exact rows and returns detached source observations', async () => {
  const f = fixture(), observation = await confirm(f); expect(observation.rows.map(r => r.row.body)).toEqual(f.expected.map(e => e.body));
  expect(observation.rows.map(r => r.sha256)).toEqual(f.expected.map(e => hash(e.body)));
  expect(observation.acl.targets).toHaveLength(2); expect(observation).not.toHaveProperty('readback');
  f.state.rows.get(f.expected[0].key)!.body = 'replacement'; expect(observation.rows[0].row.body).toBe(inputs.goldens[1].body);
});
test('preflight qualifies canonical/current bindings before creation without inventing absent item IDs', async () => {
  const f = fixture(); f.state.rows.clear(); f.state.bindings = { ...f.state.bindings, items: [] }; f.state.acl = { ...f.state.acl, targets: [] };
  const observed = await createOptionEWorkplanReviewAuditSourceReadback(f.ports).preflight(f.context, f.expected);
  expect(observed.rows).toEqual([]); expect(observed.bindings.items).toEqual([]); expect(observed.acl.targets).toEqual([]);
  await expect(confirm(f)).rejects.toThrow('AuditAclReadbackUnavailable');
});
test('WorkplanChangesRequested reuses readonly existing row shape without a V2 module or stored format change', async () => {
  const f = fixture(), key = `${f.context.operationKey}:receipt`;
  const design: { fixtures: { name: string; body: string }[] } = JSON.parse(readFileSync(
    'temp/test-fixtures/review/journal-v2-normal-fixtures.json', 'utf8'));
  const body = design.fixtures.find(g => g.name === 'RequestChangesReceiptV1')!.body, receipt = parseReviewReceiptV1(body);
  const journalBody = design.fixtures.find(g => g.name === 'DecisionReady')!.body;
  const decision: { currentControl: ReviewAuthorityV1['control']; headerNative: Native } = JSON.parse(journalBody);
  f.expected = [{ key, eventType: 'WorkplanChangesRequested', body }];
  f.context = { ...f.context, commandSource: copy(receipt.commandSource), journal: { ...f.state.journal, body: journalBody } };
  f.state.journal.body = journalBody;
  f.state.authority.control = copy(decision.currentControl);
  f.state.authority.header = { native: copy(decision.headerNative), value: { ...f.state.authority.header.value,
    state: 'ChangesRequested', transitionStatus: 'Ready', etag: decision.headerNative.etag, rowVersionToken: decision.currentControl.rowVersionToken,
    accessState: 'ReadOnly' } };
  f.state.authority.pendingRequestKey = f.context.operationKey; f.state.authority.lastOperationKey = f.context.operationKey;
  f.state.rows = new Map([[key, { ...f.state.rows.get(key)!, eventType: 'WorkplanChangesRequested', body, commandSource: copy(receipt.commandSource) }]]);
  f.state.bindings = { ...f.state.bindings, items: f.state.bindings.items.filter(i => i.key === key) };
  f.state.acl = { ...f.state.acl, targets: f.state.acl.targets.filter(i => i.key === key) };
  expect((await confirm(f)).rows[0].row.eventType).toBe('WorkplanChangesRequested');
});
test.each([0, 1])('artifact %i cannot borrow human or reconciler Snapshot rights', async index => {
  const f = fixture(); const target = f.state.acl.targets[index]; f.state.acl = { ...f.state.acl, targets: f.state.acl.targets.map((t, i) => i === index
    ? { ...t, assignments: { ...t.assignments, totalCount: 3, assignments: [...target.assignments.assignments, { ...target.assignments.assignments[0], principalId: 902 }] } } : t) };
  await expect(confirm(f)).rejects.toThrow();
});
test.each(['list', 'web', 'roleId', 'roleName', 'roleType', 'roleMask', 'roleWeb', 'principalId', 'principalType', 'principalKey', 'item', 'key', 'extraItem', 'epoch'])(
  'independent binding %s mismatch holds', async issue => {
    const f = fixture(), b = JSON.parse(JSON.stringify(f.state.bindings));
    if (issue === 'list') b.auditList.listId = 'wrong-list'; if (issue === 'web') b.auditList.webId = 'wrong-web';
    if (issue === 'roleId') b.roleReadbacks[1].id = 999; if (issue === 'roleName') b.roleReadbacks[1].name = 'wrong-name';
    if (issue === 'roleType') b.roleReadbacks[1].roleTypeKind = 5; if (issue === 'roleMask') b.roleReadbacks[1].low = 7;
    if (issue === 'roleWeb') b.roleWeb.webId = 'wrong-web'; if (issue === 'principalId') b.principalBindings[0].principalId = 999;
    if (issue === 'principalType') b.principalBindings[0].principalType = 0; if (issue === 'principalKey') b.principalBindings[0].principalKey = '';
    if (issue === 'item') b.items[0].native.itemId = 999; if (issue === 'key') b.items[0].key += ':other';
    if (issue === 'extraItem') b.items.push(copy(b.items[0])); if (issue === 'epoch') b.aclEpoch++;
    f.state.bindings = b; await expect(confirm(f)).rejects.toThrow();
  });
test.each(['inheritance', 'partial', 'collection', 'paging', 'continuation', 'missing', 'extra', 'roleId', 'roleType', 'mask', 'target', 'native',
  'missingEffective', 'extraEffective', 'contentBroad', 'recoveryBroad', 'employeeRights', 'managerRights', 'reconcilerRights'])(
  'actual assignment/effective %s mismatch holds', async issue => {
    const f = fixture(), acl = JSON.parse(JSON.stringify(f.state.acl)), t = acl.targets[0], set = t.assignments;
    if (issue === 'inheritance') t.inherited = true; if (issue === 'partial') set.complete = false;
    if (issue === 'collection') set.canonicalCollectionPath = 'wrong/RoleAssignments'; if (issue === 'paging') set.pageCount = 2;
    if (issue === 'continuation') { set.pageCount = 2; set.continuationUris = ['wrong?$skiptoken=2']; }
    if (issue === 'missing') set.assignments.pop(); if (issue === 'extra') { set.totalCount = 3; set.assignments.push(copy(set.assignments[0])); }
    if (issue === 'roleId') set.assignments[0].roleDefinitionId = 999; if (issue === 'roleType') set.assignments[0].roleTypeKind = 5;
    if (issue === 'mask') set.assignments[0].roleLow = 7; if (issue === 'target') set.target = 'wrong/item'; if (issue === 'native') t.native.itemId++;
    if (issue === 'missingEffective') t.effective.pop(); if (issue === 'extraEffective') t.effective.push(copy(t.effective[0]));
    const id = issue === 'contentBroad' ? 901 : issue === 'recoveryBroad' ? 903 : issue === 'employeeRights' ? 201 : issue === 'managerRights' ? 202 : 902;
    if (['contentBroad', 'recoveryBroad', 'employeeRights', 'managerRights', 'reconcilerRights'].includes(issue)) t.effective.find((p: {principalId: number}) => p.principalId === id).assignment.effectiveLow = 7;
    f.state.acl = acl; await expect(confirm(f)).rejects.toThrow();
  });
test('complete canonical multi-page assignment observation is admitted', async () => {
  const f = fixture(); f.state.acl = { ...f.state.acl, targets: f.state.acl.targets.map(t => ({ ...t, assignments: { ...t.assignments,
    pageCount: 2, continuationUris: [`${t.assignments.canonicalCollectionPath}?$skiptoken=Page2`] } })) };
  expect((await confirm(f)).rows).toHaveLength(2);
});
test.each(['body', 'Created', 'event', 'source', 'immutable', 'native', 'absent'])('actual immutable row %s holds', async issue => {
  const f = fixture(), row = f.state.rows.get(f.expected[1].key)!;
  if (issue === 'body') row.body += ' '; if (issue === 'Created') row.createdAt = 'invalid';
  if (issue === 'event') row.eventType = 'WorkplanApproved'; if (issue === 'source') row.commandSource.bodySha256 = 'A'.repeat(64);
  if (issue === 'immutable') Object.assign(row, { immutable: false }); if (issue === 'native') row.native.itemId = 999;
  if (issue === 'absent') f.state.rows.delete(row.key); await expect(confirm(f)).rejects.toThrow();
});
test.each(['readReviewAuditBindings', 'readReviewAuditAcl', 'readCurrentAuthority', 'readAudit', 'readJournal', 'sha256'] as const)(
  '%s denial is a HOLD, never absence or fallback', async method => {
    const f = fixture(); f.ports[method] = async () => { throw new Error('fictional denied query'); }; await expect(confirm(f)).rejects.toThrow();
  });
test('missing mandatory source ports holds named', async () => {
  await expect(createOptionEWorkplanReviewAuditSourceReadback().confirm(fixture().context, fixture().expected)).rejects.toThrow('AuditAclReadbackUnavailable');
});
test('lowercase digest is not a standard uppercase hash observation', async () => {
  const f = fixture(); f.ports.sha256 = async body => hash(body).toLowerCase(); await expect(confirm(f)).rejects.toThrow('AuditDigestUnavailable');
});
test('foreign current pending owner cannot qualify the immutable Audit source', async () => {
  const f = fixture(); f.state.authority.pendingRequestKey = 'foreign-operation';
  await expect(confirm(f)).rejects.toThrow('AuditBindingMismatch');
});
test('caller changes during hash do not replace detached expectations', async () => {
  const f = fixture(); let changed = false; f.ports.sha256 = async body => { if (!changed) {
    changed = true; f.context.before.personKey = 'foreign'; f.expected[0].body = 'caller replacement';
  } return hash(body); };
  expect((await confirm(f)).rows[0].row.body).toBe(inputs.goldens[1].body);
});
test.each(['actor', 'epoch', 'binding', 'row', 'journal', 'effective'])('%s replacement during real hash holds', async issue => {
  const f = fixture(); let changed = false; f.ports.sha256 = async body => { const result = hash(body); if (!changed) {
    changed = true;
    if (issue === 'actor') f.state.authority.people[1] = { ...f.state.authority.people[1], value: { ...f.state.authority.people[1].value, active: false } };
    if (issue === 'epoch') f.state.authority.control.aclEpoch++;
    if (issue === 'binding') f.state.bindings = { ...f.state.bindings, roleReadbacks: f.state.bindings.roleReadbacks.map(r => ({ ...r, id: r.id + 100 })) };
    if (issue === 'row') f.state.rows.get(f.expected[0].key)!.createdAt = '2026-10-11T03:50:01.000Z';
    if (issue === 'journal') f.state.journal.native.etag = '"new-owner"';
    if (issue === 'effective') f.state.acl = { ...f.state.acl, targets: [] };
  } return result; }; await expect(confirm(f)).rejects.toThrow('AuditSourceChanged');
});
