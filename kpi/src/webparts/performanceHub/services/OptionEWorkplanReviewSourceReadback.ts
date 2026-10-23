import type { IOptionEPeopleRow, IOptionEProtectedWorkplanDto, IOptionEAutomationPrincipalIds,
  IOptionESubmitRoleIds, IOptionEAclAssignmentTuple, IOptionEAclTargetAssignmentSet } from '../models/OptionEWorkplanSubmitModels';
import type { IDeliveryPublicationObservation, IDeliveryPublicationNativeCoordinates } from '../models/GovernedDeliveryPublicationV1Models';
import type { IOptionENativeRoleReadback, IOptionENativeAssignmentReadback } from './OptionEWorkplanAclPlan';
import { validateOptionENativeAssignmentReadback } from './OptionEWorkplanAclPlan';
import { OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE } from './OptionEWorkplanPhysicalSchema';
import type { IAnnualWorkplan } from '../models/ProductionModels';
import type { V5CapturedBytePort } from '../models/OptionEWorkplanSubmitExactBodyV5ExecutionModels';
import type { V4AclReadback } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import type { V5Snapshot } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import { OptionEReviewBoundaryError, type IOptionEReviewControl, type IOptionEReviewIntent,
  type IOptionEReviewSnapshot, type IOptionEReviewReceipt, type IOptionEReviewReadback,
  verifyOptionEReviewReadback } from './OptionEWorkplanReviewContract';
import { parseV5CapturedReceipt, parseV5CapturedSnapshot, encodeV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { v4Equal, v4Etag } from './OptionEWorkplanSubmitExactBodyV4Wire';
import type { RequestChangesPorts, RequestChangesJournalV2 } from '../models/OptionEWorkplanRequestChangesV2Models';
import type { ReviewJournalObservationV1 } from '../models/OptionEWorkplanReviewV1Models';
import { parseRequestChangesJournalV2, encodeRequestChangesJournalV2 } from './OptionEWorkplanRequestChangesJournalV2Wire';
import { parseReviewCommandV1, parseReviewReceiptV1 } from './OptionEWorkplanReviewV1Wire';

/** Transient source observations only. The actor provider must uniquely resolve its current
 * person/principal; typed rows and ACL plans do not attest native authentication or rights. */
export interface ReadPorts extends Readonly<Pick<V5CapturedBytePort, 'readReceipt' | 'readSnapshot'>> {
  readonly readCurrentActor: () => Promise<IOptionEPeopleRow>;
  readonly readCurrentHeader: (workplan: string) => Promise<IDeliveryPublicationObservation<IAnnualWorkplan>>;
  readonly readReviewControl: (workplan: string) => Promise<IOptionEReviewControl>;
  readonly readSubmittedMetadata: (key: string) => Promise<IOptionEReviewSnapshot | undefined>;
  readonly readApprovedMetadata: (key: string) => Promise<IOptionEReviewSnapshot | undefined>;
  readonly readReviewReceipt: (commandKey: string) => Promise<IOptionEReviewReceipt | undefined>;
  readonly readAcl: (workplan: string) => Promise<V4AclReadback | undefined>;
  /** Standard SHA256 of precisely the supplied text encoded as UTF8, uppercase hex. */
  readonly sha256: (exactUtf8Text: string) => Promise<string>;
}

export interface IOptionEReviewSourceReadback {
  readonly confirm: (intent: IOptionEReviewIntent, before: IOptionEReviewControl) => Promise<IOptionEReviewReadback>;
}

export type FinalAclKind = 'Draft' | 'Snapshot' | 'Operation' | 'Control';
export interface FinalTargetBinding {
  readonly kind: FinalAclKind;
  readonly key: string;
  readonly target: string;
  readonly native: IDeliveryPublicationNativeCoordinates;
}
export interface RequestChangesFinalAclBinding {
  readonly control: IDeliveryPublicationObservation<IOptionEProtectedWorkplanDto>;
  readonly employee: IOptionEPeopleRow;
  readonly automationPrincipalIds: IOptionEAutomationPrincipalIds;
  readonly principalBindings: readonly Pick<IOptionEAclAssignmentTuple, 'principalId' | 'principalKey' | 'principalType'>[];
  readonly roleIds: IOptionESubmitRoleIds;
  readonly roleWeb: { readonly siteId: string; readonly webId: string };
  readonly roleReadbacks: readonly IOptionENativeRoleReadback[];
  readonly targets: readonly FinalTargetBinding[];
}
export interface FinalEffectiveReadback {
  readonly principalId: number;
  readonly assignment: IOptionENativeAssignmentReadback;
}
export interface RequestChangesFinalAclTarget {
  readonly kind: FinalAclKind;
  readonly key: string;
  readonly native: IDeliveryPublicationNativeCoordinates;
  readonly inherited: false;
  readonly assignments: IOptionEAclTargetAssignmentSet;
  readonly effective: readonly FinalEffectiveReadback[];
}
export interface RequestChangesFinalAclObservation {
  readonly workplanKey: string;
  readonly submittedSnapshotKey: string;
  readonly hierarchyEpoch: number;
  readonly aclEpoch: number;
  readonly targets: readonly RequestChangesFinalAclTarget[];
}
export interface RequestChangesFinalReadPorts extends Readonly<Omit<ReadPorts, 'readAcl'>> {
  readonly readRequestChangesAclBinding: (workplan: string) => Promise<RequestChangesFinalAclBinding | undefined>;
  readonly readRequestChangesFinalAcl: (workplan: string) => Promise<RequestChangesFinalAclObservation | undefined>;
}

const fail = (code: string): never => { throw new OptionEReviewBoundaryError(code); };
const requireThat = (condition: boolean, code: string): void => { if (!condition) fail(code); };
// Transient detachment, never a stored encoding; optional undefined properties are omitted.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const observe = async <T>(query: () => Promise<T>): Promise<T> => {
  try { const value = await query(); return value === undefined ? value : copy(value); }
  catch { return fail('ReadUnavailable'); }
};

const checkCurrent = (intent: IOptionEReviewIntent, before: IOptionEReviewControl, actor: IOptionEPeopleRow,
  header: IDeliveryPublicationObservation<IAnnualWorkplan>, control: IOptionEReviewControl): void => {
  requireThat(actor.active === true && positive(actor.principalId) && nonBlank(actor.email)
    && actor.personKey === intent.actorPersonKey && actor.personKey === before.managerPersonKey
    && actor.personKey === control.managerPersonKey && actor.personKey !== before.personKey
    && actor.personKey !== control.personKey, 'ActorAuthorityMismatch');
  const { native, value } = header;
  requireThat(control.workplanKey === before.workplanKey && control.personKey === before.personKey
    && control.performanceYear === before.performanceYear && value.workplanKey === control.workplanKey
    && value.personKey === control.personKey && value.performanceYear === control.performanceYear
    && value.managerPersonKey === control.managerPersonKey && value.state === control.state
    && value.transitionStatus === 'Ready' && control.transitionStatus === 'Ready'
    && control.state === (intent.command === 'ApproveLock' ? 'Locked' : 'ChangesRequested')
    && positive(control.rowVersionToken) && value.rowVersionToken === control.rowVersionToken
    && v4Etag(control.etag) && native.etag === control.etag && value.etag === control.etag
    && nonBlank(native.siteId) && nonBlank(native.webId) && nonBlank(native.listId) && nonBlank(native.version)
    && positive(native.itemId) && value.id === native.itemId, 'CurrentHeaderMismatch');
  requireThat(nonBlank(before.currentSubmittedSnapshotKey) && before.currentSubmittedSnapshotKey === intent.expectedSubmittedSnapshotKey
    && control.currentSubmittedSnapshotKey === before.currentSubmittedSnapshotKey, 'SubmittedAuthorityAbsent');
};
const checkCaptured = (snapshot: V5Snapshot, before: IOptionEReviewControl,
  header: IDeliveryPublicationObservation<IAnnualWorkplan>): void => {
  const a = snapshot.admission.authority, q = a.request.query, captured = a.workplan;
  requireThat(snapshot.key === before.currentSubmittedSnapshotKey && snapshot.admission.key === snapshot.key
    && q.workplan === before.workplanKey && q.person === before.personKey && q.year === before.performanceYear
    && a.actor.key === before.personKey && a.control.workplan === before.workplanKey
    && a.control.person === before.personKey && a.control.year === before.performanceYear
    && captured.value.workplanKey === before.workplanKey && captured.value.personKey === before.personKey
    && captured.value.performanceYear === before.performanceYear
    && (['siteId', 'webId', 'listId', 'itemId'] as const).every(key => captured.native[key] === header.native[key]), 'CaptureIdentityMismatch');
};
const checkMetadata = (metadata: IOptionEReviewSnapshot, key: string, before: IOptionEReviewControl,
  payloadDigest: string, code: string): void => {
  requireThat(nonBlank(key) && metadata.snapshotKey === key && metadata.sourceSubmittedSnapshotKey === before.currentSubmittedSnapshotKey
    && metadata.workplanKey === before.workplanKey && metadata.personKey === before.personKey
    && metadata.performanceYear === before.performanceYear && metadata.immutable === true && positive(metadata.version)
    && /^[0-9A-F]{64}$/.test(metadata.payloadSha256) && metadata.payloadSha256 === payloadDigest, code);
};

/** Check the existing V5 four-target source plan and grant meanings, using observed service
 * principals and the independently read manager. Epochs remain separate review observations;
 * neither plan consistency nor these labels certify actual native permissions. */
const checkAcl = (acl: V4AclReadback, control: IOptionEReviewControl, actor: IOptionEPeopleRow, snapshot: V5Snapshot): void => {
  const pointer = snapshot.key, subject = snapshot.admission.authority.actor.principal;
  requireThat(acl.admissionKey === pointer && positive(control.hierarchyEpoch) && positive(control.aclEpoch)
    && acl.hierarchyEpoch === control.hierarchyEpoch && acl.aclEpoch === control.aclEpoch
    && Array.isArray(acl.targets) && acl.targets.length === 4, 'AclObservationMismatch');
  const snapshotTarget = acl.targets.find(target => target.key === `${control.workplanKey}/Snapshot/${pointer}`);
  requireThat(!!snapshotTarget && Array.isArray(snapshotTarget.grants), 'AclObservationMismatch');
  const content = snapshotTarget!.grants.find(grant => grant.role === 'AppendOnly')?.principal;
  const reconciler = snapshotTarget!.grants.find(grant => grant.role === 'AclReconciler')?.principal;
  const recovery = snapshotTarget!.grants.find(grant => grant.role === 'FullControl')?.principal;
  const principals = [content, reconciler, recovery, subject, actor.principalId];
  requireThat(principals.every(positive) && new Set(principals).size === 5, 'AclObservationMismatch');
  for (const kind of ['Draft', 'Snapshot', 'Operation', 'Control']) {
    const matches = acl.targets.filter(target => target.key === `${control.workplanKey}/${kind}/${pointer}`);
    requireThat(matches.length === 1, 'AclObservationMismatch');
    const target = matches[0];
    const expected = [{ principal: content, role: kind === 'Snapshot' ? 'AppendOnly' : 'MutatorNoDelete' },
      { principal: reconciler, role: 'AclReconciler' }, { principal: recovery, role: 'FullControl' },
      { principal: subject, role: 'Read' }, ...(kind === 'Draft' ? [] : [{ principal: actor.principalId, role: 'Read' }])];
    requireThat(target.inherited === false && target.complete === true && Array.isArray(target.grants)
      && target.grants.length === expected.length && expected.every(wanted => target.grants.filter(grant =>
        grant.principal === wanted.principal && grant.role === wanted.role).length === 1), 'AclObservationMismatch');
  }
};

interface CurrentSource {
  readonly intent: IOptionEReviewIntent;
  readonly actor: IOptionEPeopleRow;
  readonly header: IDeliveryPublicationObservation<IAnnualWorkplan>;
  readonly control: IOptionEReviewControl;
  readonly snapshot: V5Snapshot;
}
interface AclProfile<B, A> {
  readonly readBinding?: (workplan: string) => Promise<B | undefined>;
  readonly readAcl: (workplan: string) => Promise<A | undefined>;
  readonly missingBinding?: string;
  readonly missingAcl: string;
  readonly check: (binding: B | undefined, acl: A, source: CurrentSource) => void;
}
const validNative = (native: IDeliveryPublicationNativeCoordinates): boolean =>
  !!native && nonBlank(native.siteId) && nonBlank(native.webId) && nonBlank(native.listId)
  && positive(native.itemId) && nonBlank(native.version) && v4Etag(native.etag);
const exactRole = (actual: IOptionENativeRoleReadback, expected: IOptionENativeRoleReadback): boolean =>
  actual.id === expected.id && actual.name === expected.name && actual.roleTypeKind === expected.roleTypeKind
  && actual.high === expected.high && actual.low === expected.low;
const finalKinds: readonly FinalAclKind[] = ['Draft', 'Snapshot', 'Operation', 'Control'];

/** Exact final edit profile over independently resolved source bindings. No native grant or
 * authentication certificate is supplied here; completeness remains a provider obligation. */
const checkFinalAcl = (binding: RequestChangesFinalAclBinding | undefined, acl: RequestChangesFinalAclObservation | undefined,
  { intent, actor, header, control, snapshot }: CurrentSource, stage: 'Final' | 'Owned' = 'Final'): void => {
  if (!binding) return fail('FinalAclBindingUnavailable');
  const b = binding, dto = b.control.value, a = snapshot.admission.authority;
  requireThat(positive(dto.hierarchyEpoch) && dto.hierarchyEpoch === dto.aclEpoch
    && control.hierarchyEpoch === control.aclEpoch, 'FinalAclEpochNotAligned');
  const bindingOkay = header.value.accessState === (stage === 'Final' ? 'EmployeeEdit' : 'ReadOnly') && nonBlank(intent.reason)
    && header.value.managerDecisionComment === intent.reason && dto.workplanKey === control.workplanKey
    && dto.personKey === control.personKey && dto.performanceYear === control.performanceYear
    && dto.managerPersonKey === control.managerPersonKey && dto.state === 'ChangesRequested'
    && dto.transitionStatus === 'Ready' && dto.etag === control.etag && v4Equal(b.control.native, header.native)
    && dto.hierarchyEpoch === control.hierarchyEpoch && dto.aclEpoch === control.aclEpoch
    && (stage === 'Final' ? (dto.pendingRequestKey === undefined || dto.pendingRequestKey === '')
      : dto.pendingRequestKey === `oe-review:${intent.commandKey}`)
    && dto.lastOperationKey === `oe-review:${intent.commandKey}`
    && dto.currentSubmittedSnapshotKey === control.currentSubmittedSnapshotKey
    && dto.draftItemId === a.draft.itemId && dto.draftSchemaVersion === a.draft.schema
    && b.employee.active === true && b.employee.personKey === control.personKey
    && b.employee.principalId === a.actor.principal && nonBlank(b.employee.email)
    && b.roleWeb.siteId === header.native.siteId && b.roleWeb.webId === header.native.webId;
  requireThat(bindingOkay, 'FinalAclBindingMismatch');
  const principals = [b.employee.principalId, actor.principalId, b.automationPrincipalIds.contentProcessor,
    b.automationPrincipalIds.aclReconciler, b.automationPrincipalIds.recoveryAdmin];
  requireThat(principals.every(positive) && new Set(principals).size === 5
    && b.principalBindings.length === 5 && new Set(b.principalBindings.map(p => p.principalKey)).size === 5
    && principals.every(id => b.principalBindings.filter(p => p.principalId === id && nonBlank(p.principalKey)
      && positive(p.principalType)).length === 1), 'FinalAclBindingMismatch');
  const roleIds = [b.roleIds.itemReader, b.roleIds.addReadNoEdit, b.roleIds.draftEditor,
    b.roleIds.mutatorNoDelete, b.roleIds.aclReconciler, b.roleIds.fullControl];
  const definitions = [...OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE];
  requireThat(roleIds.every(positive) && new Set(roleIds).size === 6 && b.roleReadbacks.length === 6,
    'FinalAclBindingMismatch');
  const roles = definitions.map((definition, index): IOptionENativeRoleReadback => ({ id: roleIds[index],
    name: definition.name, roleTypeKind: definition.roleTypeKind, high: definition.high, low: definition.low }));
  requireThat(roles.every(role => b.roleReadbacks.filter(observed => exactRole(observed, role)).length === 1),
    'FinalAclBindingMismatch');
  requireThat(b.targets.length === 4 && new Set(b.targets.map(t =>
    `${t.native.siteId}/${t.native.webId}/${t.native.listId}/${t.native.itemId}`)).size === 4, 'FinalAclBindingMismatch');
  if (acl) requireThat(acl.workplanKey === control.workplanKey && acl.submittedSnapshotKey === snapshot.key
    && acl.hierarchyEpoch === control.hierarchyEpoch && acl.aclEpoch === control.aclEpoch
    && acl.targets.length === 4, 'FinalAclObservationMismatch');
  for (const kind of finalKinds) {
    const boundTargets = b.targets.filter(t => t.kind === kind);
    requireThat(boundTargets.length === 1, 'FinalAclBindingMismatch');
    const target = boundTargets[0], key = `${control.workplanKey}/${kind}/${snapshot.key}`;
    const list = kind === 'Draft' ? 'WorkplanDrafts' : kind === 'Snapshot' ? 'WorkplanSubmittedSnapshots'
      : kind === 'Operation' ? 'WorkplanSubmitOperations' : 'Workplans';
    const leaf = kind === 'Draft' ? 'DraftItem' : kind === 'Snapshot' ? snapshot.key : kind === 'Operation' ? 'SafeOperation' : 'ControlItem';
    const path = `KCFKPI_${list}/${control.performanceYear}/${control.personKey}/${leaf}`;
    requireThat(target.key === key && target.target === path && validNative(target.native)
      && target.native.siteId === header.native.siteId && target.native.webId === header.native.webId
      && (kind !== 'Control' || v4Equal(target.native, header.native))
      && (kind !== 'Draft' || target.native.itemId === dto.draftItemId), 'FinalAclBindingMismatch');
    // Pre-grant qualification checks real native bindings without claiming final edit rights.
    if (!acl) continue;
    const observed = acl.targets.filter(t => t.kind === kind && t.key === key);
    requireThat(observed.length === 1, 'FinalAclObservationMismatch');
    const actual = observed[0], set = actual.assignments, collection = `${path}/RoleAssignments`;
    const assigned = [{ id: b.automationPrincipalIds.contentProcessor, role: kind === 'Snapshot' ? roles[1] : kind === 'Control' ? roles[2] : roles[3] },
      { id: b.automationPrincipalIds.aclReconciler, role: roles[4] }, { id: b.automationPrincipalIds.recoveryAdmin, role: roles[5] },
      { id: b.employee.principalId, role: kind === 'Draft' ? roles[2] : roles[0] }];
    const expected = assigned.map(({ id, role }): IOptionEAclAssignmentTuple => ({
      ...b.principalBindings.find(p => p.principalId === id)!, roleDefinitionId: role.id,
      roleName: role.name, roleTypeKind: role.roleTypeKind, roleHigh: role.high, roleLow: role.low }));
    const safeContinuation = (value: string): boolean => value.startsWith(`${collection}?$skiptoken=`)
      && !value.includes('#') && !value.includes('://') && !/%2f|%5c/i.test(value)
      && /^[A-Za-z0-9._~%-]+$/.test(value.slice(`${collection}?$skiptoken=`.length));
    const tupleMatches = (left: IOptionEAclAssignmentTuple, right: IOptionEAclAssignmentTuple): boolean =>
      (['principalId', 'principalKey', 'principalType', 'roleDefinitionId', 'roleName', 'roleTypeKind', 'roleHigh', 'roleLow'] as const)
        .every(field => left[field] === right[field]);
    requireThat(actual.inherited === false && v4Equal(actual.native, target.native) && set.target === path
      && set.canonicalCollectionPath === collection && set.complete === true && positive(set.pageCount)
      && set.pageCount === set.continuationUris.length + 1 && set.totalCount === 4 && set.assignments.length === 4
      && new Set(set.continuationUris).size === set.continuationUris.length && set.continuationUris.every(safeContinuation)
      && expected.every(wanted => set.assignments.filter(item => tupleMatches(item, wanted)).length === 1), 'FinalAclObservationMismatch');
    requireThat(actual.effective.length === 5 && principals.every(id => actual.effective.filter(p => p.principalId === id).length === 1),
      'FinalAclObservationMismatch');
    for (const principal of actual.effective) {
      const role = assigned.find(item => item.id === principal.principalId)?.role;
      requireThat(role ? validateOptionENativeAssignmentReadback(principal.assignment, role).length === 0
        : principal.principalId === actor.principalId && principal.assignment.assignedRoles.length === 0
          && principal.assignment.effectiveHigh === 0 && principal.assignment.effectiveLow === 0, 'FinalAclObservationMismatch');
    }
  }
};

export function createOptionEWorkplanRequestChangesFinalSourceReadback(
  ports?: RequestChangesFinalReadPorts
): IOptionEReviewSourceReadback {
  const bound = !!ports && typeof ports.readRequestChangesAclBinding === 'function'
    && typeof ports.readRequestChangesFinalAcl === 'function';
  const reader = createSourceReadback(ports, bound ? {
    readBinding: workplan => ports!.readRequestChangesAclBinding(workplan),
    readAcl: workplan => ports!.readRequestChangesFinalAcl(workplan),
    missingBinding: 'FinalAclBindingUnavailable', missingAcl: 'MissingFinalAclObservation',
    check: checkFinalAcl
  } : undefined, 'RequestChangesFinalAclReadbackUnavailable');
  return Object.freeze({ confirm: async (intent: IOptionEReviewIntent, before: IOptionEReviewControl) => {
    if (intent.command !== 'RequestChanges') return fail('UnsupportedFinalAclCommand');
    return reader.confirm(intent, before);
  } });
}

export type RequestChangesOwnedReadPorts = Readonly<Pick<RequestChangesPorts,
  'readCurrentAuthority' | 'readManagerCommand' | 'readHistoricalHeaderVersion' | 'readCapturedSubmit'
  | 'readJournal' | 'readAudit' | 'readRequestChangesAclBinding' | 'readRequestChangesFinalAcl' | 'sha256' | 'now'>>;
export interface RequestChangesOwnedContext {
  readonly journal: ReviewJournalObservationV1;
  readonly owner: string;
}
/** Actual owned observations, never a completed review readback or projected terminal DTO. */
export interface RequestChangesOwnedObservation {
  readonly journal: ReviewJournalObservationV1;
  readonly journalSha256: string;
  readonly authority: Awaited<ReturnType<RequestChangesPorts['readCurrentAuthority']>>;
  readonly binding: RequestChangesFinalAclBinding;
  readonly acl?: RequestChangesFinalAclObservation;
}

export function qualifyOptionEWorkplanRequestChangesOwnedReady(ports: RequestChangesOwnedReadPorts,
  context: RequestChangesOwnedContext): Promise<RequestChangesOwnedObservation> {
  return qualifyOwned(ports, context, false);
}
export function confirmOptionEWorkplanRequestChangesOwnedAcl(ports: RequestChangesOwnedReadPorts,
  context: RequestChangesOwnedContext): Promise<RequestChangesOwnedObservation> {
  return qualifyOwned(ports, context, true);
}

async function qualifyOwned(ports: RequestChangesOwnedReadPorts, context: RequestChangesOwnedContext,
  afterGrant: boolean): Promise<RequestChangesOwnedObservation> {
  const methods: readonly (keyof RequestChangesOwnedReadPorts)[] = ['readCurrentAuthority', 'readManagerCommand',
    'readHistoricalHeaderVersion', 'readCapturedSubmit', 'readJournal', 'readAudit', 'readRequestChangesAclBinding',
    'readRequestChangesFinalAcl', 'sha256', 'now'];
  requireThat(!!ports && methods.every(k => typeof ports[k] === 'function'), 'OwnedReadbackUnavailable');
  const pinned = copy(context), j: RequestChangesJournalV2 = parseRequestChangesJournalV2(pinned.journal.body);
  requireThat(encodeRequestChangesJournalV2(j) === pinned.journal.body && validNative(pinned.journal.native)
    && nonBlank(pinned.owner) && j.lease?.owner === pinned.owner && positive(j.lease.epoch)
    && Number.isFinite(Date.parse(ports.now())) && Date.parse(j.lease.expiresAt) > Date.parse(ports.now())
    && (j.phase === 'DecisionReady' || (afterGrant && j.phase === 'AclVerified'))
    && (j.pendingEffect === undefined || (j.pendingEffect.leaseEpoch === j.lease.epoch
      && j.pendingEffect.kind === (j.phase === 'AclVerified' ? 'ControlRelease' : 'Acl'))), 'OwnedJournalMismatch');
  const readAll = async (): Promise<{
    journal: ReviewJournalObservationV1 | undefined;
    authority: Awaited<ReturnType<RequestChangesPorts['readCurrentAuthority']>>;
    command: Awaited<ReturnType<RequestChangesPorts['readManagerCommand']>>;
    bytes: Awaited<ReturnType<RequestChangesPorts['readCapturedSubmit']>>;
    historical: Awaited<ReturnType<RequestChangesPorts['readHistoricalHeaderVersion']>>;
    receipt: Awaited<ReturnType<RequestChangesPorts['readAudit']>>;
    binding: RequestChangesFinalAclBinding | undefined; acl?: RequestChangesFinalAclObservation;
  }> => ({ journal: await observe(() => ports.readJournal(j.operationKey)),
    authority: await observe(() => ports.readCurrentAuthority(j.before.workplanKey)),
    command: await observe(() => ports.readManagerCommand(j.commandSource.native)),
    bytes: await observe(() => ports.readCapturedSubmit(j.sourceCapture.key)),
    historical: await observe(() => ports.readHistoricalHeaderVersion(j.ordinalSource.native)),
    receipt: await observe(() => ports.readAudit(`${j.operationKey}:receipt`)),
    binding: await observe(() => ports.readRequestChangesAclBinding(j.before.workplanKey)),
    ...(afterGrant ? { acl: await observe(() => ports.readRequestChangesFinalAcl(j.before.workplanKey)) } : {}) });
  const first = await readAll(), { authority: a, command, bytes, historical, receipt, binding } = first;
  requireThat(!!first.journal && v4Equal(first.journal, pinned.journal), 'OwnedJournalChanged');
  const c = a.control, h = a.header, b = j.before;
  const actors = a.people.filter(p => p.value.personKey === j.actorBinding.personKey);
  const subjects = a.people.filter(p => p.value.personKey === b.personKey);
  requireThat(actors.length === 1 && subjects.length === 1 && actors[0].value.active === true && subjects[0].value.active === true
    && subjects[0].value.managerPersonKey === actors[0].value.personKey
    && a.people.every(p => p.value.active === true && positive(p.value.principalId) && validNative(p.native))
    && new Set(a.people.map(p => p.value.personKey)).size === a.people.length
    && new Set(a.people.map(p => p.value.principalId)).size === a.people.length
    && actors[0].value.personKey !== b.personKey && actors[0].value.personKey === b.managerPersonKey
    && actors[0].value.principalId === j.actorBinding.principalId && actors[0].value.email === j.actorBinding.email
    && v4Equal(actors[0].native, j.actorBinding.personNative), 'OwnedActorMismatch');
  requireThat(v4Equal(c, j.currentControl) && v4Equal(h.native, j.headerNative) && validNative(h.native)
    && h.value.id === h.native.itemId && h.value.etag === c.etag && h.value.state === c.state
    && h.value.transitionStatus === c.transitionStatus && h.value.rowVersionToken === b.rowVersionToken
    && c.state === 'ChangesRequested' && c.transitionStatus === 'Ready' && c.rowVersionToken === b.rowVersionToken
    && h.value.accessState === 'ReadOnly' && h.value.managerDecisionComment === j.command.reason
    && a.pendingRequestKey === j.operationKey && a.lastOperationKey === j.operationKey
    && h.value.workplanKey === b.workplanKey && h.value.personKey === b.personKey && h.value.performanceYear === b.performanceYear
    && h.value.managerPersonKey === b.managerPersonKey && h.value.workplanVersion === j.ordinalSource.value
    && c.hierarchyEpoch === c.aclEpoch && !c.currentApprovedSnapshotKey, 'OwnedControlMismatch');
  requireThat(command.immutable === true && validNative(command.native) && v4Equal(command.native, j.commandSource.native)
    && command.authorPrincipalId === j.actorBinding.principalId && v4Equal(parseReviewCommandV1(command.body), j.command)
    && v4Equal(command.columns, j.command) && /^\d{4}-.*Z$/.test(command.createdAt)
    && Number.isFinite(Date.parse(command.createdAt)), 'OwnedCommandMismatch');
  let r: ReturnType<typeof parseV5CapturedReceipt> | undefined, s: V5Snapshot | undefined;
  try { r = bytes.receipt ? parseV5CapturedReceipt(bytes.receipt.body) : undefined;
    s = bytes.snapshot ? parseV5CapturedSnapshot(bytes.snapshot.body) : undefined; }
  catch { return fail('InvalidCapturedSubmit'); }
  requireThat(!!r || !!s, 'MissingCapturedSubmit');
  if (r) checkCaptured(r.snapshot, b, h); if (s) checkCaptured(s, b, h);
  if (r && s) requireThat(v4Equal(r.snapshot, s) && encodeV5CapturedSnapshot(r.snapshot) === bytes.snapshot!.body, 'CapturedPairMismatch');
  const snapshot = r?.snapshot || s!, preferred = bytes.receipt || bytes.snapshot!;
  requireThat(snapshot.admission.authority.actor.principal === subjects[0].value.principalId
    && (bytes.receipt ? 'receipt' : 'snapshot') === j.sourceCapture.kind
    && [bytes.receipt, bytes.snapshot].every(row => !row || (row.immutable === true && validNative(row.native)))
    && v4Equal(preferred.native, j.sourceCapture.native)
    && v4Equal(historical.native, j.ordinalSource.native) && historical.value.workplanVersion === j.ordinalSource.value
    && positive(historical.value.workplanVersion) && v4Equal(historical.native, snapshot.admission.authority.workplan.native)
    && Object.keys(snapshot.admission.authority.workplan.value).every(k =>
      v4Equal(historical.value[k as keyof typeof historical.value], snapshot.admission.authority.workplan.value[k as keyof typeof snapshot.admission.authority.workplan.value])), 'OwnedCaptureMismatch');
  requireThat(!!receipt && receipt.key === `${j.operationKey}:receipt` && receipt.eventType === 'WorkplanChangesRequested'
    && receipt.immutable === true && validNative(receipt.native) && Number.isFinite(Date.parse(receipt.createdAt))
    && new Date(receipt.createdAt).toISOString() === receipt.createdAt && v4Equal(receipt.commandSource, j.commandSource), 'OwnedReceiptMismatch');
  const frame = parseReviewReceiptV1(receipt!.body), receiptPin = j.confirmedEffects.find(e => e.kind === 'ReceiptCreate');
  requireThat(frame.reason === j.command.reason && frame.receipt.command === 'RequestChanges'
    && frame.receipt.commandKey === j.command.commandKey && frame.receipt.receiptKey === receipt!.key
    && frame.receipt.auditKey === receipt!.key && frame.receipt.workplanKey === b.workplanKey
    && frame.receipt.actorPersonKey === j.actorBinding.personKey && frame.receipt.submittedSnapshotKey === j.sourceCapture.key
    && frame.receipt.controlVersionBefore === b.rowVersionToken && frame.receipt.controlVersionAfter === b.rowVersionToken + 1
    && v4Equal(frame.commandSource, j.commandSource) && v4Equal(frame.sourceCapture, j.sourceCapture)
    && !frame.approvedReference && !frame.receipt.approvedSnapshotKey && !!receiptPin
    && v4Equal(receiptPin.native, receipt!.native), 'OwnedReceiptMismatch');
  const journalSha256 = await observe(() => ports.sha256(pinned.journal.body));
  const commandSha = await observe(() => ports.sha256(command.body));
  const captureSha = await observe(() => ports.sha256(preferred.body));
  const payloadSha = await observe(() => ports.sha256(snapshot.body));
  const receiptSha = await observe(() => ports.sha256(receipt!.body));
  requireThat([journalSha256, commandSha, captureSha, payloadSha, receiptSha].every(d => /^[0-9A-F]{64}$/.test(d))
    && commandSha === j.commandSource.bodySha256 && captureSha === j.sourceCapture.sha256
    && payloadSha === j.submitted.payloadSha256 && receiptSha === receiptPin!.bodySha256, 'OwnedDigestMismatch');
  checkMetadata(j.submitted, snapshot.key, b, payloadSha, 'SubmittedMetadataMismatch');
  requireThat(!!binding && (!afterGrant || !!first.acl), 'OwnedAclUnavailable');
  const intent: IOptionEReviewIntent = { ...j.command, actorPersonKey: j.actorBinding.personKey };
  checkFinalAcl(binding, first.acl, { intent, actor: actors[0].value, header: h, control: c, snapshot }, 'Owned');
  const second = await readAll();
  requireThat(v4Equal(copy(first), copy(second)) && Date.parse(j.lease!.expiresAt) > Date.parse(ports.now()), 'OwnedSourceChanged');
  return copy({ journal: pinned.journal, journalSha256, authority: a, binding: binding!, ...(first.acl ? { acl: first.acl } : {}) });
}

/** Readonly prerequisite for a future coordinator: before is its captured control, never
 * employee authority. No retry, dispatch, writer, approval format or native binding is supplied.
 * The final result is observed point-in-time source consistency, not an atomic/native certificate. */
export function createOptionEWorkplanReviewSourceReadback(ports?: ReadPorts): IOptionEReviewSourceReadback {
  return createSourceReadback(ports, ports ? { readAcl: workplan => ports.readAcl(workplan), missingAcl: 'MissingAclObservation',
    check: (_binding, acl, source) => checkAcl(acl, source.control, source.actor, source.snapshot) } : undefined, 'ReadbackUnbound');
}

/** Shared capture/current-observation pipeline; ACL profiles never project one set of rights
 * into another profile. The default factory retains its historical source contract. */
function createSourceReadback<B, A>(ports: Readonly<Omit<ReadPorts, 'readAcl'>> | undefined,
  profile: AclProfile<B, A> | undefined, unbound: string): IOptionEReviewSourceReadback {
  return Object.freeze({ confirm: async (intent: IOptionEReviewIntent, before: IOptionEReviewControl) => {
    if (!ports || !profile) return fail(unbound);
    let expected: IOptionEReviewIntent, prior: IOptionEReviewControl;
    try { expected = copy(intent); prior = copy(before); } catch { return fail('InvalidIntent'); }
    requireThat(nonBlank(expected.commandKey) && nonBlank(expected.expectedWorkplanKey)
      && (expected.command === 'RequestChanges' || expected.command === 'ApproveLock'), 'InvalidIntent');
    const workplan = expected.expectedWorkplanKey;
    const actor = await observe(() => ports.readCurrentActor());
    const header = await observe(() => ports.readCurrentHeader(workplan));
    const control = await observe(() => ports.readReviewControl(workplan));
    const receipt = await observe(() => ports.readReviewReceipt(expected.commandKey));
    checkCurrent(expected, prior, actor, header, control);
    if (!receipt) return fail('ReceiptAbsentOrMismatched');
    const binding = profile.readBinding ? await observe(() => profile.readBinding!(workplan)) : undefined;
    if (profile.readBinding && !binding) return fail(profile.missingBinding!);
    const pointer = prior.currentSubmittedSnapshotKey!;
    const receiptBytes = await observe(() => ports.readReceipt(pointer));
    const snapshotBytes = await observe(() => ports.readSnapshot(pointer));
    if (receiptBytes === undefined && snapshotBytes === undefined) return fail('MissingCapturedSubmit');
    let capturedReceipt: ReturnType<typeof parseV5CapturedReceipt> | undefined, capturedSnapshot: V5Snapshot | undefined;
    try {
      capturedReceipt = receiptBytes === undefined ? undefined : parseV5CapturedReceipt(receiptBytes);
      capturedSnapshot = snapshotBytes === undefined ? undefined : parseV5CapturedSnapshot(snapshotBytes);
    } catch { return fail('InvalidCapturedSubmit'); }
    if (capturedReceipt) checkCaptured(capturedReceipt.snapshot, prior, header);
    if (capturedSnapshot) checkCaptured(capturedSnapshot, prior, header);
    if (capturedReceipt && capturedSnapshot) requireThat(v4Equal(capturedReceipt.snapshot, capturedSnapshot)
      && encodeV5CapturedSnapshot(capturedReceipt.snapshot) === snapshotBytes, 'CapturedPairMismatch');
    const snapshot = capturedReceipt?.snapshot || capturedSnapshot!;
    const submitted = await observe(() => ports.readSubmittedMetadata(pointer));
    if (!submitted) return fail('MissingSubmittedMetadata');
    const approvedKey = control.currentApprovedSnapshotKey;
    const approved = expected.command === 'ApproveLock'
      ? (nonBlank(approvedKey) ? await observe(() => ports.readApprovedMetadata(approvedKey)) : undefined) : undefined;
    if (expected.command === 'ApproveLock' && !approved) return fail('MissingApprovedMetadata');
    const acl = await observe(() => profile.readAcl(workplan));
    if (!acl) return fail(profile.missingAcl);
    const payloadDigest = await observe(() => ports.sha256(snapshot.body));
    requireThat(/^[0-9A-F]{64}$/.test(payloadDigest), 'InvalidPayloadDigest');
    const finalActor = await observe(() => ports.readCurrentActor());
    const finalHeader = await observe(() => ports.readCurrentHeader(workplan));
    const finalControl = await observe(() => ports.readReviewControl(workplan));
    const finalReceipt = await observe(() => ports.readReviewReceipt(expected.commandKey));
    const finalSubmitted = await observe(() => ports.readSubmittedMetadata(pointer));
    const finalApproved = expected.command === 'ApproveLock'
      ? await observe(() => ports.readApprovedMetadata(approvedKey!)) : undefined;
    const finalBinding = profile.readBinding ? await observe(() => profile.readBinding!(workplan)) : undefined;
    const finalAcl = await observe(() => profile.readAcl(workplan));
    requireThat(v4Equal(actor, finalActor) && v4Equal(header, finalHeader) && v4Equal(control, finalControl)
      && !!finalReceipt && v4Equal(receipt, finalReceipt) && !!finalSubmitted && v4Equal(submitted, finalSubmitted)
      && (expected.command !== 'ApproveLock' || (!!finalApproved && v4Equal(approved, finalApproved)))
      && (!profile.readBinding || (!!finalBinding && v4Equal(binding, finalBinding)))
      && !!finalAcl && v4Equal(acl, finalAcl), 'SourceChanged');
    checkMetadata(submitted, pointer, prior, payloadDigest, 'SubmittedMetadataMismatch');
    if (approved) {
      checkMetadata(approved, approvedKey!, prior, payloadDigest, 'ApprovedMetadataMismatch');
      requireThat(approved.version === submitted.version, 'ApprovedMetadataMismatch');
    }
    profile.check(binding, acl, { intent: expected, actor, header, control, snapshot });
    const readback = copy({ before: prior, after: control, submitted, ...(approved ? { approved } : {}), receipt });
    verifyOptionEReviewReadback(expected, readback);
    return readback;
  } });
}
