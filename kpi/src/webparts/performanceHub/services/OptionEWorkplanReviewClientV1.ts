import type { RequestChangesClientPorts } from './OptionEWorkplanRequestChangesV1Client';
import type { ApproveLockClientPorts } from './OptionEWorkplanApproveLockV1Client';
import type { IOptionEPeopleRow } from '../models/OptionEWorkplanSubmitModels';
import type { Native, ReviewAuthorityV1, ManagerCommandObservationV1, ReviewResultV1, ReviewCommandV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { IOptionEReviewIntent, IOptionEReviewControl, IOptionEReviewReadback } from './OptionEWorkplanReviewContract';
import { verifyOptionEReviewReadback } from './OptionEWorkplanReviewContract';
import { encodeReviewCommandV1, canonicalReviewV1 } from './OptionEWorkplanReviewV1Wire';
import { createOptionEWorkplanRequestChangesFinalSourceReadback, createOptionEWorkplanReviewSourceReadback, type RequestChangesFinalReadPorts, type ReadPorts } from './OptionEWorkplanReviewSourceReadback';
import { v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';

class ClientHold extends Error {
  public constructor(public readonly code: string) { super(code); Object.setPrototypeOf(this, ClientHold.prototype); }
}
const check = (okay: boolean, code: string): void => { if (!okay) throw new ClientHold(code); };
const copy = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value)) as T;
const equal = (a: unknown, b: unknown): boolean => canonicalReviewV1(copy(a)) === canonicalReviewV1(copy(b));
const positive = (n: number): boolean => Number.isSafeInteger(n) && n > 0;
const nativeOkay = (n: Native): boolean => !!n && [n.siteId, n.webId, n.listId, n.version].every(s => typeof s === 'string' && !!s.trim())
  && positive(n.itemId) && v4Etag(n.etag);
const sameItem = (a: Native, b: Native): boolean => (['siteId', 'webId', 'listId', 'itemId'] as const).every(k => a[k] === b[k]);

/** One client lifetime owns one immutable logical command. Refresh rereads its SAME key;
 * an uncertain create is never repeated. A replacement selection requires a fresh client. */
export function createOptionEWorkplanReviewClientV1(input: IOptionEReviewIntent, commandKind: 'RequestChanges' | 'ApproveLock', supplied?: RequestChangesClientPorts | ApproveLockClientPorts): {
  submit(): Promise<ReviewResultV1>; refresh(): Promise<ReviewResultV1>; getIntent(): IOptionEReviewIntent;
} {
  const intent = copy(input), ports = supplied ? Object.freeze({ ...supplied, finalReadPorts: Object.freeze({ ...supplied.finalReadPorts }) }) : undefined;
  let body: string | undefined, before: IOptionEReviewControl | undefined;
  let pinnedAuthority: ReviewAuthorityV1 | undefined, pinnedActor: IOptionEPeopleRow | undefined;
  let source: ManagerCommandObservationV1 | undefined, createAttempted = false;
  let pending: Promise<ReviewResultV1> | undefined;
  const retain = (actual: { actor: IOptionEPeopleRow; authority: ReviewAuthorityV1 }, encoded: string): void => {
    check(body === undefined, 'AttemptAlreadyPinned');
    pinnedActor = copy(actual.actor); pinnedAuthority = copy(actual.authority);
    before = copy(actual.authority.control); body = encoded;
  };
  const read = async <T>(query: () => Promise<T>): Promise<T> => {
    try { return copy(await query()); } catch { throw new ClientHold('ReadUnavailable'); }
  };
  const observation = async (): Promise<{ actor: IOptionEPeopleRow; authority: ReviewAuthorityV1 }> => ({
    actor: await read(() => ports!.readCurrentActor()),
    authority: await read(() => ports!.readCurrentAuthority(intent.expectedWorkplanKey))
  });
  const actors = (actual: Awaited<ReturnType<typeof observation>>): void => {
    const { actor, authority: a } = actual, c = a.control, h = a.header;
    const managers = a.people.filter(p => p.value.personKey === c.managerPersonKey);
    const employees = a.people.filter(p => p.value.personKey === c.personKey);
    check(managers.length === 1 && employees.length === 1 && managers[0].value.active && employees[0].value.active, 'CurrentHierarchyUnavailable');
    check(actor.active && positive(actor.principalId) && actor.personKey === intent.actorPersonKey
      && actor.personKey === c.managerPersonKey && equal(actor, managers[0].value)
      && employees[0].value.managerPersonKey === actor.personKey, 'CurrentManagerMismatch');
    check(nativeOkay(h.native) && managers.every(p => nativeOkay(p.native)) && employees.every(p => nativeOkay(p.native))
      && c.workplanKey === intent.expectedWorkplanKey && h.value.workplanKey === c.workplanKey
      && h.value.personKey === c.personKey && h.value.performanceYear === c.performanceYear
      && h.value.managerPersonKey === c.managerPersonKey
      && positive(c.hierarchyEpoch) && positive(c.aclEpoch), 'AuthorityMismatch');
    if (pinnedAuthority && pinnedActor) {
      check(equal(actor, pinnedActor) && equal(a.people, pinnedAuthority.people)
        && sameItem(h.native, pinnedAuthority.header.native) && c.personKey === before!.personKey
        && c.performanceYear === before!.performanceYear && c.managerPersonKey === before!.managerPersonKey
        && c.hierarchyEpoch === before!.hierarchyEpoch && c.aclEpoch === before!.aclEpoch
        && c.currentSubmittedSnapshotKey === before!.currentSubmittedSnapshotKey, 'AuthorityReplaced');
    }
  };
  const qualifySource = (row: ManagerCommandObservationV1): void => {
    check(row.immutable === true && nativeOkay(row.native) && row.authorPrincipalId === pinnedActor!.principalId
      && typeof row.createdAt === 'string' && Number.isFinite(Date.parse(row.createdAt))
      && new Date(row.createdAt).toISOString() === row.createdAt && row.body === body
      && encodeReviewCommandV1(row.columns) === body, 'CommandSourceMismatch');
    if (source) check(equal(source, row), 'ImmutableCommandChanged');
  };
  const currentCompletion = (actual: Awaited<ReturnType<typeof observation>>, confirmed: IOptionEReviewReadback): void => {
    actors(actual);
    const a = actual.authority, c = a.control, h = a.header;
    check(equal(c, confirmed.after) && c.transitionStatus === 'Ready'
      && h.value.id === pinnedAuthority!.header.value.id
      && h.value.state === c.state && h.value.transitionStatus === c.transitionStatus
      && h.value.rowVersionToken === c.rowVersionToken && h.value.etag === c.etag && h.native.etag === c.etag
      && a.pendingRequestKey === undefined && a.lastOperationKey === `oe-review:${intent.commandKey}`,
      'CurrentConfirmationChanged');
    check(commandKind === 'RequestChanges'
      ? c.state === 'ChangesRequested' && h.value.accessState === 'EmployeeEdit' && h.value.managerDecisionComment === intent.reason
      : c.state === 'Locked' && h.value.accessState === 'ReadOnly', 'CurrentDecisionMismatch');
  };
  const run = async (): Promise<ReviewResultV1> => {
    if (!ports || !ports.finalReadPorts || !['readCurrentActor', 'readCurrentAuthority', 'createImmutableManagerCommand',
      'readImmutableManagerCommand', commandKind === 'RequestChanges' ? 'processRequestChanges' : 'processApproveLock'].every(k => typeof ports[k as keyof typeof ports] === 'function'))
      return { outcome: 'RecoveryHold', reason: 'ClientUnbound' };
    const finalMethods: readonly string[] = ['readCurrentActor', 'readCurrentHeader', 'readReviewControl',
      'readSubmittedMetadata', 'readApprovedMetadata', 'readReviewReceipt', 'readReceipt', 'readSnapshot',
      ...(commandKind === 'RequestChanges' ? ['readRequestChangesAclBinding', 'readRequestChangesFinalAcl'] : ['readAcl']), 'sha256'];
    if (!finalMethods.every(k => typeof ports.finalReadPorts[k as keyof typeof ports.finalReadPorts] === 'function'))
      return { outcome: 'RecoveryHold', reason: 'ClientUnbound' };
    check(intent.command === commandKind && (commandKind === 'RequestChanges'
      ? typeof intent.reason === 'string' && !!intent.reason.trim() : intent.reason === undefined),
      commandKind === 'RequestChanges' ? 'InvalidRequestChangesIntent' : 'InvalidApproveLockIntent');
    if (!body) {
      const command: ReviewCommandV1 = { schemaVersion: 'kcf.kpi.option-e.review-command/v1', commandKey: intent.commandKey,
        command: commandKind, expectedWorkplanKey: intent.expectedWorkplanKey, expectedControlEtag: intent.expectedControlEtag,
        expectedControlVersion: intent.expectedControlVersion, expectedSubmittedSnapshotKey: intent.expectedSubmittedSnapshotKey, ...(commandKind === 'RequestChanges' ? { reason: intent.reason } : {}) };
      const encoded = encodeReviewCommandV1(command);
      const first = await observation(); actors(first);
      const c = first.authority.control, h = first.authority.header.value;
      check(c.state === 'Submitted' && c.transitionStatus === 'Ready' && h.state === 'Submitted' && h.transitionStatus === 'Ready'
        && h.accessState === 'ReadOnly' && !first.authority.pendingRequestKey
        && c.etag === intent.expectedControlEtag && h.etag === c.etag && v4Etag(c.etag)
        && c.rowVersionToken === intent.expectedControlVersion && h.rowVersionToken === c.rowVersionToken && positive(c.rowVersionToken)
        && c.currentSubmittedSnapshotKey === intent.expectedSubmittedSnapshotKey, 'SubmittedAuthorityMismatch');
      const second = await observation(); actors(second); check(equal(first, second), 'AuthorityChangedBeforeCommand');
      retain(first, encoded);
    }
    if (typeof body !== 'string') throw new ClientHold('AttemptUnbound');
    const exactBody = body;
    const current = await observation(); actors(current);
    let row = await read(() => ports.readImmutableManagerCommand(intent.commandKey));
    if (!row) {
      check(!createAttempted, 'CommandCreateUncertain');
      // The actual pre-create source must still be the exact qualified Submitted observation.
      check(equal(current.authority, pinnedAuthority), 'AuthorityChangedBeforeCommand');
      createAttempted = true;
      try { await ports.createImmutableManagerCommand(exactBody); } catch { /* Reread same key; never repeat append. */ }
      row = await read(() => ports.readImmutableManagerCommand(intent.commandKey));
      check(!!row, 'CommandCreateUncertain');
    }
    qualifySource(row!); source = copy(row!);
    actors(await observation());
    const result = copy(await (commandKind === 'RequestChanges'
      ? (ports as RequestChangesClientPorts).processRequestChanges(copy(source.native))
      : (ports as ApproveLockClientPorts).processApproveLock(copy(source.native))));
    if (result.outcome !== 'Completed') return result;
    verifyOptionEReviewReadback(intent, result.readback);
    const reader = commandKind === 'RequestChanges'
      ? createOptionEWorkplanRequestChangesFinalSourceReadback(ports.finalReadPorts as RequestChangesFinalReadPorts)
      : createOptionEWorkplanReviewSourceReadback(ports.finalReadPorts as ReadPorts);
    const final = await reader.confirm(copy(intent), copy(before!));
    check(equal(final, result.readback), 'FinalReadbackChanged');
    const firstFinal = await observation(); currentCompletion(firstFinal, final);
    const lastSource = await read(() => ports.readImmutableManagerCommand(intent.commandKey));
    check(!!lastSource, 'CommandSourceUnavailable'); qualifySource(lastSource!);
    const secondFinal = await observation(); currentCompletion(secondFinal, final);
    // Native version is an opaque observed pin, never the logical row counter. These
    // detached observations establish current consistency, not a native transaction.
    check(equal(firstFinal, secondFinal), 'CurrentAuthorityChanged');
    return { outcome: 'Completed', readback: copy(final) };
  };
  const execute = (): Promise<ReviewResultV1> => {
    if (pending) return pending;
    const promise = run().catch((error: unknown): ReviewResultV1 => ({
      outcome: 'RecoveryHold', reason: error instanceof ClientHold ? error.code : 'ConfirmationUnavailable'
    })).finally(() => { if (pending === promise) pending = undefined; });
    pending = promise; return promise;
  };
  return Object.freeze({ submit: execute, refresh: execute, getIntent: () => copy(intent) });
}
