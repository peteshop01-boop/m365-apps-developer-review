import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';
import type { IOptionEPeopleRow } from '../models/OptionEWorkplanSubmitModels';
import type { IDeliveryPublicationObservation } from '../models/GovernedDeliveryPublicationV1Models';
import type { IAnnualWorkplan } from '../models/ProductionModels';
import type { V4AclReadback } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { createOptionEWorkplanReviewSourceReadback, createOptionEWorkplanRequestChangesFinalSourceReadback,
  type ReadPorts, type RequestChangesFinalReadPorts, type RequestChangesFinalAclBinding,
  type RequestChangesFinalAclObservation, type FinalAclKind } from './OptionEWorkplanReviewSourceReadback';
import { qualifyOptionEWorkplanRequestChangesOwnedReady, confirmOptionEWorkplanRequestChangesOwnedAcl,
  type RequestChangesOwnedReadPorts } from './OptionEWorkplanReviewSourceReadback';
import { OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE } from './OptionEWorkplanPhysicalSchema';
import { type IOptionEReviewControl, type IOptionEReviewIntent, type IOptionEReviewReceipt,
  type IOptionEReviewSnapshot, type OptionEReviewCommand } from './OptionEWorkplanReviewContract';
import { encodeV5CapturedSnapshot, parseV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
Object.assign(globalThis, { TextDecoder, TextEncoder });
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase();

describe('owned RequestChanges intermediate source admission', () => {
  const input: { fixtures: { name: string; body: string }[] } = JSON.parse(readFileSync(
    'temp/test-fixtures/review/journal-v2-normal-fixtures.json', 'utf8'));
  const context = (): import('./OptionEWorkplanReviewSourceReadback').RequestChangesOwnedContext => ({
    journal: { body: input.fixtures.find(f => f.name === 'DecisionReady')!.body,
      native: { siteId: 'fictional-site', webId: 'fictional-web', listId: 'fictional-journal', itemId: 500,
        version: 'opaque-journal-version', etag: '"journal-9"' } }, owner: 'fictional-owner' });
  it.each([qualifyOptionEWorkplanRequestChangesOwnedReady, confirmOptionEWorkplanRequestChangesOwnedAcl])(
    'holds unbound intermediate ports without projecting a terminal observation', async qualify => {
      await expect(qualify(undefined as unknown as RequestChangesOwnedReadPorts, context())).rejects.toMatchObject({ code: 'OwnedReadbackUnavailable' });
    });
  it.each(['expired', 'foreign', 'wrongPhase'] as const)('holds %s journal admission before source reads', async mode => {
    const ctx = { ...context() }, j = JSON.parse(ctx.journal.body);
    const read = jest.fn(async () => { throw new Error('must not query'); });
    const ports: RequestChangesOwnedReadPorts = { readCurrentAuthority: read, readManagerCommand: read, readHistoricalHeaderVersion: read,
      readCapturedSubmit: read, readJournal: read, readAudit: read, readRequestChangesAclBinding: read, readRequestChangesFinalAcl: read,
      sha256: async text => sha256(text), now: () => mode === 'expired' ? '2027-01-01T00:00:00.000Z' : '2026-10-11T05:10:00.000Z' };
    if (mode === 'wrongPhase') ctx.journal.body = input.fixtures.find(f => f.name === 'Validated')!.body;
    if (mode !== 'foreign') ctx.owner = j.lease.owner;
    await expect(qualifyOptionEWorkplanRequestChangesOwnedReady(ports, ctx)).rejects.toMatchObject({ code: 'OwnedJournalMismatch' });
    expect(read).not.toHaveBeenCalled();
  });
});

// Explicit fictional post-processor state, read through independent ports; not a client readback.
interface Fixture {
  before: IOptionEReviewControl; intent: IOptionEReviewIntent; ports: jest.Mocked<ReadPorts>;
  captured: ReturnType<typeof parseV5CapturedReceipt>; receiptBytes: string; snapshotBytes: string;
  state: { actor: IOptionEPeopleRow; header: IDeliveryPublicationObservation<IAnnualWorkplan>; control: IOptionEReviewControl;
    submitted: IOptionEReviewSnapshot | undefined; approved: IOptionEReviewSnapshot | undefined;
    receipt: IOptionEReviewReceipt | undefined; acl: V4AclReadback | undefined;
    receiptBytes: string | undefined; snapshotBytes: string | undefined };
}
const fixture = (command: OptionEReviewCommand = 'ApproveLock', manager = 'manager', principal = 202): Fixture => {
  const receiptBytes = readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-global-r3-receipt.json', 'utf8');
  const captured = parseV5CapturedReceipt(receiptBytes), snapshotBytes = encodeV5CapturedSnapshot(captured.snapshot);
  const a = captured.snapshot.admission.authority, pointer = captured.key;
  const before: IOptionEReviewControl = { workplanKey: a.control.workplan, personKey: a.control.person,
    performanceYear: a.control.year, managerPersonKey: manager, state: 'Submitted', transitionStatus: 'Ready',
    etag: '"review-17"', rowVersionToken: 17, currentSubmittedSnapshotKey: pointer, hierarchyEpoch: 2, aclEpoch: 3 };
  const control: IOptionEReviewControl = { ...before, state: command === 'ApproveLock' ? 'Locked' : 'ChangesRequested',
    etag: '"review-18"', rowVersionToken: 18, ...(command === 'ApproveLock' ? { currentApprovedSnapshotKey: 'APP-FICTIONAL-7' } : {}) };
  const actor: IOptionEPeopleRow = { personKey: manager, principalId: principal, email: `${manager}@example.invalid`, active: true };
  const header: IDeliveryPublicationObservation<IAnnualWorkplan> = {
    native: { ...a.workplan.native, etag: control.etag, version: 'native-current-42' },
    value: { ...a.workplan.value, state: control.state, transitionStatus: control.transitionStatus, etag: control.etag,
      rowVersionToken: control.rowVersionToken, managerPersonKey: manager, managerEmail: actor.email } };
  const submitted: IOptionEReviewSnapshot = { snapshotKey: pointer, sourceSubmittedSnapshotKey: pointer,
    workplanKey: before.workplanKey, personKey: before.personKey, performanceYear: before.performanceYear,
    immutable: true, version: 7, payloadSha256: sha256(captured.snapshot.body) };
  const approved: IOptionEReviewSnapshot | undefined = command === 'ApproveLock'
    ? { ...submitted, snapshotKey: control.currentApprovedSnapshotKey! } : undefined;
  const receipt: IOptionEReviewReceipt = { receiptKey: 'REVIEW-FICTIONAL-RECEIPT', commandKey: 'REVIEW-FICTIONAL-COMMAND', command,
    workplanKey: before.workplanKey, actorPersonKey: manager, submittedSnapshotKey: pointer,
    controlVersionBefore: 17, controlVersionAfter: 18, processorIdentity: 'FICTIONAL-PROCESSOR-ONLY',
    auditKey: 'FICTIONAL-AUDIT', nativeCreatedAt: '2026-10-11T02:00:00.000Z',
    ...(approved ? { approvedSnapshotKey: approved.snapshotKey } : {}) };
  const acl: V4AclReadback = { admissionKey: pointer, hierarchyEpoch: 2, aclEpoch: 3,
    targets: ['Draft', 'Snapshot', 'Operation', 'Control'].map(kind => ({
      key: `${before.workplanKey}/${kind}/${pointer}`, inherited: false, complete: true,
      grants: [{ principal: 901, role: kind === 'Snapshot' ? 'AppendOnly' : 'MutatorNoDelete' },
        { principal: 902, role: 'AclReconciler' }, { principal: 903, role: 'FullControl' },
        { principal: a.actor.principal, role: 'Read' }, ...(kind === 'Draft' ? [] : [{ principal, role: 'Read' as const }])] })) };
  const intent: IOptionEReviewIntent = { commandKey: receipt.commandKey, command, actorPersonKey: manager,
    expectedWorkplanKey: before.workplanKey, expectedControlEtag: before.etag, expectedControlVersion: 17,
    expectedSubmittedSnapshotKey: pointer, ...(command === 'RequestChanges' ? { reason: 'Revise the fictional target' } : {}) };
  const state = { actor, header, control, submitted: submitted as IOptionEReviewSnapshot | undefined,
    approved, receipt: receipt as IOptionEReviewReceipt | undefined, acl: acl as V4AclReadback | undefined,
    receiptBytes: receiptBytes as string | undefined, snapshotBytes: snapshotBytes as string | undefined };
  const ports: jest.Mocked<ReadPorts> = {
    readCurrentActor: jest.fn(async () => state.actor),
    readCurrentHeader: jest.fn<Promise<typeof header>, [string]>(async () => state.header),
    readReviewControl: jest.fn<Promise<IOptionEReviewControl>, [string]>(async () => state.control),
    readReviewReceipt: jest.fn<Promise<IOptionEReviewReceipt | undefined>, [string]>(async () => state.receipt),
    readSubmittedMetadata: jest.fn<Promise<IOptionEReviewSnapshot | undefined>, [string]>(async () => state.submitted),
    readApprovedMetadata: jest.fn<Promise<IOptionEReviewSnapshot | undefined>, [string]>(async () => state.approved),
    readAcl: jest.fn<Promise<V4AclReadback | undefined>, [string]>(async () => state.acl),
    readReceipt: jest.fn<Promise<string | undefined>, [string]>(async () => state.receiptBytes),
    readSnapshot: jest.fn<Promise<string | undefined>, [string]>(async () => state.snapshotBytes),
    sha256: jest.fn<Promise<string>, [string]>(async text => sha256(text))
  };
  return { before, intent, state, ports, captured, receiptBytes, snapshotBytes };
};
const confirm = (f: Fixture): ReturnType<ReturnType<typeof createOptionEWorkplanReviewSourceReadback>['confirm']> =>
  createOptionEWorkplanReviewSourceReadback(f.ports).confirm(f.intent, f.before);
const hold = async (f: Fixture, code: string): Promise<void> => {
  await expect(confirm(f)).rejects.toMatchObject({ name: 'OptionEReviewBoundaryError', code });
};

const finalFixture = (): { base: Fixture; state: { binding: RequestChangesFinalAclBinding; acl: RequestChangesFinalAclObservation };
  ports: jest.Mocked<RequestChangesFinalReadPorts> } => {
  const base = fixture('RequestChanges');
  base.before.aclEpoch = base.state.control.aclEpoch = 2;
  base.state.header = { ...base.state.header, value: { ...base.state.header.value, accessState: 'EmployeeEdit',
    managerDecisionComment: base.intent.reason } };
  const a = base.captured.snapshot.admission.authority;
  const roles = [...OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE].map((role, index) => ({
    id: index + 11, name: role.name, roleTypeKind: role.roleTypeKind, high: role.high, low: role.low }));
  const principalBindings = [a.actor.principal, 202, 901, 902, 903].map(principalId => ({
    principalId, principalKey: `fictional-native:${principalId}`, principalType: 1 }));
  const kinds: FinalAclKind[] = ['Draft', 'Snapshot', 'Operation', 'Control'];
  const listNames = ['WorkplanDrafts', 'WorkplanSubmittedSnapshots', 'WorkplanSubmitOperations', 'Workplans'];
  const leaves = ['DraftItem', base.captured.key, 'SafeOperation', 'ControlItem'];
  const targets = kinds.map((kind, index) => ({ kind,
    key: `${base.before.workplanKey}/${kind}/${base.captured.key}`,
    target: `KCFKPI_${listNames[index]}/${base.before.performanceYear}/${base.before.personKey}/${leaves[index]}`,
    native: { ...base.state.header.native, listId: kind === 'Control' ? base.state.header.native.listId : `fictional-list-${kind}`,
      itemId: kind === 'Draft' ? a.draft.itemId : kind === 'Control' ? base.state.header.native.itemId : 31 + index } }));
  const binding: RequestChangesFinalAclBinding = { control: { native: copy(base.state.header.native), value: {
    workplanKey: base.before.workplanKey, personKey: base.before.personKey, performanceYear: base.before.performanceYear,
    draftItemId: a.draft.itemId, draftSchemaVersion: a.draft.schema, state: 'ChangesRequested', transitionStatus: 'Ready',
    currentSubmittedSnapshotKey: base.captured.key, managerPersonKey: 'manager', hierarchyEpoch: 2, aclEpoch: 2,
    etag: base.state.control.etag, lastOperationKey: `oe-review:${base.intent.commandKey}` } },
    employee: { personKey: base.before.personKey, principalId: a.actor.principal, email: 'employee@kcf-test.invalid', active: true },
    automationPrincipalIds: { contentProcessor: 901, aclReconciler: 902, recoveryAdmin: 903 }, principalBindings,
    roleIds: { itemReader: 11, addReadNoEdit: 12, draftEditor: 13, mutatorNoDelete: 14, aclReconciler: 15, fullControl: 16 },
    roleWeb: { siteId: base.state.header.native.siteId, webId: base.state.header.native.webId }, roleReadbacks: roles, targets };
  const acl: RequestChangesFinalAclObservation = { workplanKey: base.before.workplanKey, submittedSnapshotKey: base.captured.key,
    hierarchyEpoch: 2, aclEpoch: 2, targets: targets.map(target => {
      const contentRole = target.kind === 'Snapshot' ? roles[1] : target.kind === 'Control' ? roles[2] : roles[3];
      const employeeRole = target.kind === 'Draft' ? roles[2] : roles[0];
      const assigned = [{ principalId: 901, role: contentRole }, { principalId: 902, role: roles[4] },
        { principalId: 903, role: roles[5] }, { principalId: a.actor.principal, role: employeeRole }];
      return { kind: target.kind, key: target.key, native: copy(target.native), inherited: false as const,
        assignments: { target: target.target, canonicalCollectionPath: `${target.target}/RoleAssignments`, complete: true,
          pageCount: 1, totalCount: 4, continuationUris: [], assignments: assigned.map(({ principalId, role }) => ({
            ...principalBindings.find(principal => principal.principalId === principalId)!, roleDefinitionId: role.id,
            roleName: role.name, roleTypeKind: role.roleTypeKind, roleHigh: role.high, roleLow: role.low })) },
        effective: principalBindings.map(principal => { const role = assigned.find(item => item.principalId === principal.principalId)?.role;
          return { principalId: principal.principalId, assignment: { assignedRoles: role ? [copy(role)] : [],
            effectiveHigh: role?.high || 0, effectiveLow: role?.low || 0 } }; }) };
    }) };
  const state = { binding, acl };
  const ports: jest.Mocked<RequestChangesFinalReadPorts> = { ...base.ports,
    readRequestChangesAclBinding: jest.fn<Promise<RequestChangesFinalAclBinding | undefined>, [string]>(async () => state.binding),
    readRequestChangesFinalAcl: jest.fn<Promise<RequestChangesFinalAclObservation | undefined>, [string]>(async () => state.acl) };
  return { base, state, ports };
};
const confirmFinal = (f: ReturnType<typeof finalFixture>): Promise<import('./OptionEWorkplanReviewContract').IOptionEReviewReadback> =>
  createOptionEWorkplanRequestChangesFinalSourceReadback(f.ports).confirm(f.base.intent, f.base.before);
const changeProtected = (f: ReturnType<typeof finalFixture>, patch: Partial<import('../models/OptionEWorkplanSubmitModels').IOptionEProtectedWorkplanDto>): void => {
  f.state.binding = { ...f.state.binding, control: { ...f.state.binding.control,
    value: { ...f.state.binding.control.value, ...patch } } };
};

describe('strict RequestChanges final employee-edit source readback', () => {
  it('confirms actual editable Draft observations and preserves original captured bytes', async () => {
    const f = finalFixture(), original = f.base.receiptBytes;
    const result = await confirmFinal(f);
    expect(result.after.state).toBe('ChangesRequested'); expect(result.after.rowVersionToken).toBe(18);
    expect(result.submitted.version).toBe(7); expect(result.approved).toBeUndefined();
    expect(f.base.state.receiptBytes).toBe(original); expect(f.base.ports.readAcl).not.toHaveBeenCalled();
    result.after.state = 'Draft'; expect(f.base.state.control.state).toBe('ChangesRequested');
  });
  it('holds when final source ports are not bound', async () => {
    const f = finalFixture(); await expect(createOptionEWorkplanRequestChangesFinalSourceReadback().confirm(f.base.intent, f.base.before))
      .rejects.toMatchObject({ code: 'RequestChangesFinalAclReadbackUnavailable' });
  });
  it('rejects ApproveLock before reading any source', async () => {
    const f = finalFixture(); f.base.intent.command = 'ApproveLock';
    await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'UnsupportedFinalAclCommand' });
    expect(f.base.ports.readCurrentActor).not.toHaveBeenCalled();
  });
  const badBinding: readonly [string, (f: ReturnType<typeof finalFixture>) => void, string][] = [
    ['unaligned edit epochs', f => { changeProtected(f, { aclEpoch: 3 }); }, 'FinalAclEpochNotAligned'],
    ['pending competitor', f => { changeProtected(f, { pendingRequestKey: 'other' }); }, 'FinalAclBindingMismatch'],
    ['foreign operation', f => { changeProtected(f, { lastOperationKey: 'other' }); }, 'FinalAclBindingMismatch'],
    ['wrong Draft item', f => { changeProtected(f, { draftItemId: f.state.binding.control.value.draftItemId + 1 }); }, 'FinalAclBindingMismatch'],
    ['wrong Draft schema', f => { changeProtected(f, { draftSchemaVersion: 'other' }); }, 'FinalAclBindingMismatch'],
    ['different protected native version', f => { f.state.binding = { ...f.state.binding, control: { ...f.state.binding.control,
      native: { ...f.state.binding.control.native, version: 'other' } } }; }, 'FinalAclBindingMismatch'],
    ['wrong subject principal', f => { f.state.binding.employee.principalId++; }, 'FinalAclBindingMismatch'],
    ['inactive employee', f => { f.state.binding.employee.active = false; }, 'FinalAclBindingMismatch'],
    ['service principal collision', f => { f.state.binding.automationPrincipalIds.contentProcessor = 202; }, 'FinalAclBindingMismatch'],
    ['wrong native role ID', f => { f.state.binding.roleIds.draftEditor = 99; }, 'FinalAclBindingMismatch'],
    ['wrong exact native role mask', f => { f.state.binding.roleReadbacks[2].low = 7; }, 'FinalAclBindingMismatch'],
    ['unbound role web', f => { f.state.binding = { ...f.state.binding, roleWeb: { ...f.state.binding.roleWeb, webId: 'other' } }; }, 'FinalAclBindingMismatch'],
    ['noneditable header', f => { f.base.state.header = { ...f.base.state.header, value: { ...f.base.state.header.value,
      accessState: 'Locked' } }; }, 'FinalAclBindingMismatch']
  ];
  it.each(badBinding)('holds %s', async (_name, change, code) => {
    const f = finalFixture(); change(f); await expect(confirmFinal(f)).rejects.toMatchObject({ code });
  });
  const badAcl: readonly [string, (f: ReturnType<typeof finalFixture>) => void][] = [
    ['readonly employee Draft', f => { f.state.acl.targets[0].assignments.assignments[3].roleLow = 1; }],
    ['employee Add/Edit mask7', f => { f.state.acl.targets[0].assignments.assignments[3].roleLow = 7; }],
    ['processor header mask7', f => { f.state.acl.targets[3].assignments.assignments[0].roleLow = 7; }],
    ['incomplete assignment paging', f => { f.state.acl.targets[0].assignments.complete = false; }],
    ['incorrect page count', f => { f.state.acl.targets[0].assignments.pageCount = 2; }],
    ['wrong canonical collection', f => { f.state.acl.targets[0].assignments.canonicalCollectionPath = 'other'; }],
    ['different native item', f => { f.state.acl.targets[0].native.itemId++; }],
    ['manager effective group Read', f => { f.state.acl.targets[0].effective[1].assignment.effectiveLow = 1; }],
    ['manager explicit Read', f => { f.state.acl.targets[0].effective[1].assignment.assignedRoles = [f.state.binding.roleReadbacks[0]]; }],
    ['broader employee effective mask', f => { f.state.acl.targets[0].effective[0].assignment.effectiveLow = 7; }],
    ['wrong canonical principal key', f => { f.state.acl.targets[0].assignments.assignments[3].principalKey = 'other'; }]
  ];
  it.each(badAcl)('holds %s', async (_name, change) => {
    const f = finalFixture(); change(f); await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'FinalAclObservationMismatch' });
  });
  it.each(['binding', 'acl'] as const)('detects %s replacement during actual digest await', async kind => {
    const f = finalFixture(); f.ports.sha256.mockImplementation(async text => {
      await Promise.resolve();
      if (kind === 'binding') f.state.binding = { ...f.state.binding, control: { ...f.state.binding.control,
        native: { ...f.state.binding.control.native, version: 'replacement' } } };
      else f.state.acl.targets[0].effective[0].assignment.effectiveLow = 1;
      return sha256(text);
    }); await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'SourceChanged' });
  });
  it('does not fall back to old readonly ACL after query denial', async () => {
    const f = finalFixture(); f.ports.readRequestChangesFinalAcl.mockRejectedValue(new Error('Denied fictional query'));
    await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'ReadUnavailable' });
    expect(f.base.ports.readAcl).not.toHaveBeenCalled();
  });
  it('holds an absent protected binding', async () => {
    const f = finalFixture(); f.ports.readRequestChangesAclBinding.mockResolvedValue(undefined);
    await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'FinalAclBindingUnavailable' });
    expect(f.base.ports.readAcl).not.toHaveBeenCalled();
  });
  it('holds a different stored decision reason', async () => {
    const f = finalFixture(); f.base.state.header = { ...f.base.state.header,
      value: { ...f.base.state.header.value, managerDecisionComment: 'A different stored decision' } };
    await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'FinalAclBindingMismatch' });
  });
  it('holds a missing stored decision reason', async () => {
    const f = finalFixture(); f.base.state.header = { ...f.base.state.header,
      value: { ...f.base.state.header.value, managerDecisionComment: undefined } };
    await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'FinalAclBindingMismatch' });
  });
  it('preserves exact matching raw reason whitespace', async () => {
    const f = finalFixture(), raw = '  Revise the annual target\n'; f.base.intent.reason = raw;
    f.base.state.header = { ...f.base.state.header, value: { ...f.base.state.header.value, managerDecisionComment: raw } };
    const result = await confirmFinal(f); expect(result.after.state).toBe('ChangesRequested');
    expect(f.base.state.header.value.managerDecisionComment).toBe(raw);
  });
  it('holds a normalized but different stored decision reason', async () => {
    const f = finalFixture(), raw = '  Revise the annual target\n'; f.base.intent.reason = raw;
    f.base.state.header = { ...f.base.state.header, value: { ...f.base.state.header.value, managerDecisionComment: raw.trim() } };
    await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'FinalAclBindingMismatch' });
  });
  it('holds late stored decision reason replacement during hash', async () => {
    const f = finalFixture(); f.ports.sha256.mockImplementation(async text => {
      await Promise.resolve(); f.base.state.header = { ...f.base.state.header,
        value: { ...f.base.state.header.value, managerDecisionComment: 'Late replacement' } }; return sha256(text);
    }); await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'SourceChanged' });
  });
  it('holds an absent final ACL observation', async () => {
    const f = finalFixture(); f.ports.readRequestChangesFinalAcl.mockResolvedValue(undefined);
    await expect(confirmFinal(f)).rejects.toMatchObject({ code: 'MissingFinalAclObservation' });
  });
  it('rejects inherited permissions and an extra other employee grant', async () => {
    const inherited = finalFixture(); Object.assign(inherited.state.acl.targets[0], { inherited: true });
    await expect(confirmFinal(inherited)).rejects.toMatchObject({ code: 'FinalAclObservationMismatch' });
    const extra = finalFixture(), target = extra.state.acl.targets[0];
    extra.state.acl = { ...extra.state.acl, targets: [{ ...target, assignments: { ...target.assignments, totalCount: 5,
      assignments: [...target.assignments.assignments, { ...target.assignments.assignments[3],
        principalId: 203, principalKey: 'other.employee@kcf-test.invalid' }] } }, ...extra.state.acl.targets.slice(1)] };
    await expect(confirmFinal(extra)).rejects.toMatchObject({ code: 'FinalAclObservationMismatch' });
  });
  it('holds incomplete effective access and duplicate targets', async () => {
    const incomplete = finalFixture(), target = incomplete.state.acl.targets[0];
    incomplete.state.acl = { ...incomplete.state.acl, targets: [{ ...target, effective: target.effective.slice(1) },
      ...incomplete.state.acl.targets.slice(1)] };
    await expect(confirmFinal(incomplete)).rejects.toMatchObject({ code: 'FinalAclObservationMismatch' });
    const duplicate = finalFixture(); duplicate.state.acl = { ...duplicate.state.acl,
      targets: [duplicate.state.acl.targets[0], duplicate.state.acl.targets[0], ...duplicate.state.acl.targets.slice(2)] };
    await expect(confirmFinal(duplicate)).rejects.toMatchObject({ code: 'FinalAclObservationMismatch' });
  });
  it('detaches coordinator inputs before an awaited source read', async () => {
    const f = finalFixture(); f.ports.readCurrentActor.mockImplementation(async () => {
      f.base.intent.commandKey = 'replacement'; f.base.before.etag = '"replacement"'; return f.base.state.actor;
    });
    const result = await confirmFinal(f);
    expect(result.before.etag).toBe('"review-17"'); expect(result.receipt.commandKey).toBe('REVIEW-FICTIONAL-COMMAND');
  });
});

describe('independent canonical manager source readback', () => {
  it('names the absent read binding without claiming completion', async () => {
    const f = fixture(); await expect(createOptionEWorkplanReviewSourceReadback().confirm(f.intent, f.before))
      .rejects.toMatchObject({ name: 'OptionEReviewBoundaryError', code: 'ReadbackUnbound' });
  });
  it.each((['RequestChanges', 'ApproveLock'] as const).flatMap(command => [
    { command, manager: 'manager', principal: 202 }, { command, manager: 'fictional-manager-two', principal: 203 },
    { command, manager: 'fictional-manager-three', principal: 204 }
  ]))('confirms $command for $manager from separate source observations and real digest', async ({ command, manager, principal }) => {
    const f = fixture(command, manager, principal), bytesBefore = { receipt: f.state.receiptBytes, snapshot: f.state.snapshotBytes };
    const result = await confirm(f);
    expect(result.before).toEqual(f.before); expect(result.after).toEqual(f.state.control);
    expect(result.submitted).toEqual(f.state.submitted); expect(result.approved).toEqual(f.state.approved);
    expect(result.receipt).toEqual(f.state.receipt);
    expect(result.submitted.version).toBe(7);
    expect(result.submitted.payloadSha256).toBe(sha256(f.captured.snapshot.body));
    expect(f.ports.sha256).toHaveBeenCalledWith(f.captured.snapshot.body);
    expect(f.state.receiptBytes).toBe(bytesBefore.receipt); expect(f.state.snapshotBytes).toBe(bytesBefore.snapshot);
    expect(f.captured.snapshot.admission.authority.workplan.value.state).toBe('Draft');
    expect(result.after.hierarchyEpoch).toBe(2); expect(result.after.aclEpoch).toBe(3);
    expect(f.ports.readReceipt).toHaveBeenCalledWith(f.before.currentSubmittedSnapshotKey);
    expect(f.ports.readSnapshot).toHaveBeenCalledWith(f.before.currentSubmittedSnapshotKey);
    expect(f.ports.readReviewReceipt).toHaveBeenCalledWith(f.intent.commandKey);
    expect(f.ports.readCurrentActor).toHaveBeenCalledTimes(2); expect(f.ports.readAcl).toHaveBeenCalledTimes(2);
    expect(f.ports.readApprovedMetadata).toHaveBeenCalledTimes(command === 'ApproveLock' ? 2 : 0);
    f.state.control.etag = '"changed-after-return"'; f.state.submitted!.version = 9; f.state.receipt!.auditKey = 'changed';
    expect(result.after.etag).toBe('"review-18"'); expect(result.submitted.version).toBe(7); expect(result.receipt.auditKey).toBe('FICTIONAL-AUDIT');
  });
  it.each(['receipt', 'snapshot'])('accepts a genuinely absent separate %s while preserving the other frame', async missing => {
    const f = fixture(); if (missing === 'receipt') f.state.receiptBytes = undefined; else f.state.snapshotBytes = undefined;
    expect((await confirm(f)).after.state).toBe('Locked');
  });
  const currentFailures: Array<[string, (f: Fixture) => void, string]> = [
    ['wrong actor', f => { f.state.actor.personKey = 'other'; }, 'ActorAuthorityMismatch'],
    ['inactive actor', f => { f.state.actor.active = false; }, 'ActorAuthorityMismatch'],
    ['missing principal', f => { f.state.actor.principalId = 0; }, 'ActorAuthorityMismatch'],
    ['subject acting as manager', f => { f.state.actor.personKey = f.before.personKey; }, 'ActorAuthorityMismatch'],
    ['control manager', f => { f.state.control.managerPersonKey = 'other'; }, 'ActorAuthorityMismatch'],
    ['header manager', f => { f.state.header.value = { ...f.state.header.value, managerPersonKey: 'other' }; }, 'CurrentHeaderMismatch'],
    ['header subject', f => { f.state.header.value = { ...f.state.header.value, personKey: 'other' }; }, 'CurrentHeaderMismatch'],
    ['header year', f => { f.state.header.value = { ...f.state.header.value, performanceYear: 2027 }; }, 'CurrentHeaderMismatch'],
    ['header workplan', f => { f.state.header.value = { ...f.state.header.value, workplanKey: 'other' }; }, 'CurrentHeaderMismatch'],
    ['header ETag', f => { f.state.header.value = { ...f.state.header.value, etag: '"different"' }; }, 'CurrentHeaderMismatch'],
    ['header version', f => { f.state.header.value = { ...f.state.header.value, rowVersionToken: 19 }; }, 'CurrentHeaderMismatch'],
    ['header item', f => { f.state.header.value = { ...f.state.header.value, id: 999 }; }, 'CurrentHeaderMismatch'],
    ['header state', f => { f.state.header.value = { ...f.state.header.value, state: 'Submitted' }; }, 'CurrentHeaderMismatch'],
    ['pending header', f => { f.state.header.value = { ...f.state.header.value, transitionStatus: 'Reviewing' }; }, 'CurrentHeaderMismatch'],
    ['control pointer', f => { f.state.control.currentSubmittedSnapshotKey = 'OTHER'; }, 'SubmittedAuthorityAbsent'],
    ['missing receipt', f => { f.state.receipt = undefined; }, 'ReceiptAbsentOrMismatched'],
    ['both absent', f => { f.state.receiptBytes = undefined; f.state.snapshotBytes = undefined; }, 'MissingCapturedSubmit'],
    ['missing submitted metadata', f => { f.state.submitted = undefined; }, 'MissingSubmittedMetadata'],
    ['missing approved metadata', f => { f.state.approved = undefined; }, 'MissingApprovedMetadata'],
    ['missing ACL', f => { f.state.acl = undefined; }, 'MissingAclObservation'],
    ['metadata version', f => { f.state.submitted!.version = 0; }, 'SubmittedMetadataMismatch'],
    ['metadata fractional version', f => { f.state.submitted!.version = 1.5; }, 'SubmittedMetadataMismatch'],
    ['metadata provenance', f => { f.state.submitted!.sourceSubmittedSnapshotKey = 'OTHER'; }, 'SubmittedMetadataMismatch'],
    ['metadata digest', f => { f.state.submitted!.payloadSha256 = 'A'.repeat(64); }, 'SubmittedMetadataMismatch'],
    ['approved provenance', f => { f.state.approved!.sourceSubmittedSnapshotKey = 'OTHER'; }, 'ApprovedMetadataMismatch'],
    ['approved version', f => { f.state.approved!.version++; }, 'ApprovedMetadataMismatch'],
    ['approved immutable', f => { f.state.approved!.immutable = false as true; }, 'ApprovedMetadataMismatch'],
    ['approved digest', f => { f.state.approved!.payloadSha256 = 'B'.repeat(64); }, 'ApprovedMetadataMismatch'],
    ['ACL epoch', f => { f.state.acl!.aclEpoch++; }, 'AclObservationMismatch'],
    ['ACL pointer', f => { f.state.acl!.admissionKey = 'OTHER'; }, 'AclObservationMismatch'],
    ['ACL completeness', f => { f.state.acl!.targets[0].complete = false as true; }, 'AclObservationMismatch'],
    ['ACL inheritance', f => { f.state.acl!.targets[0].inherited = true as false; }, 'AclObservationMismatch'],
    ['ACL missing target', f => { f.state.acl!.targets.pop(); }, 'AclObservationMismatch'],
    ['ACL manager role', f => { f.state.acl!.targets[1].grants[4].role = 'FullControl'; }, 'AclObservationMismatch'],
    ['ACL extra grant', f => { f.state.acl!.targets[0].grants.push({ principal: 999, role: 'Read' }); }, 'AclObservationMismatch']
  ];
  it.each(currentFailures)('holds %s', async (_label, change, code) => { const f = fixture(); change(f); await hold(f, code); });
  it.each(['receipt', 'snapshot'])('holds invalid present %s without fallback', async frame => {
    const f = fixture(); if (frame === 'receipt') f.state.receiptBytes = 'invalid'; else f.state.snapshotBytes = 'invalid';
    await hold(f, 'InvalidCapturedSubmit');
  });
  it('holds ordinary wrong encoding and mismatched valid frames', async () => {
    const f = fixture(); f.state.receiptBytes = f.receiptBytes.replace('captured-native-request/v1', 'captured-native-request/v0');
    await hold(f, 'InvalidCapturedSubmit');
    const g = fixture(), snapshot = copy(g.captured.snapshot);
    snapshot.admission.eventAt = new Date(Date.parse(snapshot.admission.eventAt) + 60000).toISOString();
    g.state.snapshotBytes = encodeV5CapturedSnapshot(snapshot); await hold(g, 'CapturedPairMismatch');
  });
  it.each(['siteId', 'webId', 'listId', 'itemId'] as const)('holds current native %s replacement', async key => {
    const f = fixture(), native = { ...f.state.header.native, [key]: key === 'itemId' ? 999 : '46b799c4-c9c1-4473-a82a-38a30d16dc9e' };
    f.state.header = { native, value: { ...f.state.header.value, id: native.itemId } };
    await hold(f, 'CaptureIdentityMismatch');
  });
  it.each(['commandKey', 'command', 'actorPersonKey', 'submittedSnapshotKey', 'processorIdentity', 'auditKey', 'nativeCreatedAt'] as const)(
    'passes wrong receipt %s to the unchanged verifier and holds', async key => {
      const f = fixture();
      if (key === 'command') f.state.receipt!.command = 'RequestChanges';
      else f.state.receipt = { ...f.state.receipt!, [key]: ['commandKey', 'actorPersonKey', 'submittedSnapshotKey'].includes(key) ? 'OTHER' : '' };
      await hold(f, 'ReceiptAbsentOrMismatched');
    });
  it('holds stale versions and specific ETags with the sealed verifier', async () => {
    const f = fixture(); f.state.control.rowVersionToken = 19;
    f.state.header.value = { ...f.state.header.value, rowVersionToken: 19 }; await hold(f, 'VersionConflict');
    const g = fixture(); g.before.etag = '*'; g.intent.expectedControlEtag = '*'; await hold(g, 'VersionConflict');
    const h = fixture(); h.state.control.etag = h.before.etag;
    h.state.header = { native: { ...h.state.header.native, etag: h.before.etag }, value: { ...h.state.header.value, etag: h.before.etag } };
    await hold(h, 'VersionConflict');
  });
  it('requires a RequestChanges reason and forbids an approved pointer', async () => {
    const f = fixture('RequestChanges'); f.intent.reason = ''; await hold(f, 'ChangesTransitionInvalid');
    const g = fixture('RequestChanges'); g.state.control.currentApprovedSnapshotKey = 'OTHER'; await hold(g, 'ChangesTransitionInvalid');
  });
  it.each(['readCurrentActor', 'readCurrentHeader', 'readReviewControl', 'readReviewReceipt', 'readReceipt', 'readSnapshot',
    'readSubmittedMetadata', 'readApprovedMetadata', 'readAcl', 'sha256'] as const)('holds a denied %s without retry', async name => {
    const f = fixture(); f.ports[name].mockRejectedValue(new Error('Fictional query denied'));
    await hold(f, 'ReadUnavailable'); expect(f.ports[name]).toHaveBeenCalledTimes(1);
  });
  it('holds a denied final actor query without retrying', async () => {
    const f = fixture(); f.ports.readCurrentActor.mockResolvedValueOnce(f.state.actor).mockRejectedValueOnce(new Error('Fictional final read denied'));
    await hold(f, 'ReadUnavailable'); expect(f.ports.readCurrentActor).toHaveBeenCalledTimes(2);
  });
  it.each(['submitted', 'approved', 'acl'] as const)('holds a disappearing final %s observation', async name => {
    const f = fixture(); f.ports.sha256.mockImplementation(async text => {
      f.state[name] = undefined; return sha256(text);
    }); await hold(f, 'SourceChanged');
  });
  it('holds captured subject mismatch even when current sources agree with each other', async () => {
    const f = fixture(); f.before.personKey = 'other-subject'; f.state.control.personKey = 'other-subject';
    f.state.header.value = { ...f.state.header.value, personKey: 'other-subject' };
    await hold(f, 'CaptureIdentityMismatch');
  });
  it.each(['actor', 'header', 'control', 'receipt', 'submitted', 'approved', 'acl'] as const)(
    'holds in-place %s replacement after hashing', async name => {
      const f = fixture(); f.ports.sha256.mockImplementation(async text => {
        if (name === 'actor') f.state.actor.email = 'replacement@example.invalid';
        if (name === 'header') f.state.header = { ...f.state.header, native: { ...f.state.header.native, version: 'replacement' } };
        if (name === 'control') f.state.control.etag = '"replacement"';
        if (name === 'receipt') f.state.receipt!.auditKey = 'replacement';
        if (name === 'submitted') f.state.submitted!.version++;
        if (name === 'approved') f.state.approved!.version++;
        if (name === 'acl') f.state.acl!.aclEpoch++;
        return sha256(text);
      }); await hold(f, 'SourceChanged');
    });
  it('detaches intent and coordinator before before the first awaited source query', async () => {
    const f = fixture(); f.ports.readCurrentActor.mockImplementation(async () => {
      f.intent.commandKey = 'replaced'; f.before.etag = '"replaced"'; return f.state.actor;
    });
    const result = await confirm(f); expect(result.before.etag).toBe('"review-17"');
    expect(result.receipt.commandKey).toBe('REVIEW-FICTIONAL-COMMAND');
  });
});
