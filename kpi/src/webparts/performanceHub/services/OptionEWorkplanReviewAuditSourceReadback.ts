import type { Native, ReviewJournalV1, ReviewJournalObservationV1, ReviewAuditV1, ReviewAuthorityV1 } from '../models/OptionEWorkplanReviewV1Models';
import type { IOptionEAutomationPrincipalIds, IOptionESubmitRoleIds, IOptionEAclAssignmentTuple,
  IOptionEAclTargetAssignmentSet } from '../models/OptionEWorkplanSubmitModels';
import { validateOptionENativeAssignmentReadback, type IOptionENativeRoleReadback } from './OptionEWorkplanAclPlan';
import type { FinalEffectiveReadback } from './OptionEWorkplanReviewSourceReadback';
import { OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE } from './OptionEWorkplanPhysicalSchema';
import { v4Etag, v4Equal } from './OptionEWorkplanSubmitExactBodyV4Wire';

/** Transient observations only; no stored frame, native permission or authentication claim. */
export type ReviewAuditSourceRow = Omit<ReviewAuditV1, 'eventType'> & {
  eventType: 'WorkplanApproved' | 'WorkplanLocked' | 'WorkplanChangesRequested';
};
export interface ReviewAuditBindings {
  readonly operationKey: string; readonly workplanKey: string; readonly hierarchyEpoch: number; readonly aclEpoch: number;
  readonly auditList: Pick<Native, 'siteId' | 'webId' | 'listId'>;
  readonly roleWeb: Pick<Native, 'siteId' | 'webId'>;
  readonly automationPrincipalIds: IOptionEAutomationPrincipalIds;
  readonly principalBindings: readonly Pick<IOptionEAclAssignmentTuple, 'principalId' | 'principalKey' | 'principalType'>[];
  readonly roleIds: IOptionESubmitRoleIds; readonly roleReadbacks: readonly IOptionENativeRoleReadback[];
  /** Only actual present expected items; absence never receives a prospective native item ID. */
  readonly items: readonly { readonly key: string; readonly target: string; readonly native: Native }[];
}
export interface ReviewAuditAclObservation {
  readonly operationKey: string; readonly workplanKey: string; readonly hierarchyEpoch: number; readonly aclEpoch: number;
  readonly targets: readonly { readonly key: string; readonly native: Native; readonly inherited: false;
    readonly assignments: IOptionEAclTargetAssignmentSet; readonly effective: readonly FinalEffectiveReadback[] }[];
}
export interface ReviewAuditReadPorts {
  readonly readReviewAuditBindings: (operationKey: string) => Promise<ReviewAuditBindings | undefined>;
  readonly readReviewAuditAcl: (operationKey: string) => Promise<ReviewAuditAclObservation | undefined>;
  readonly readCurrentAuthority: (workplan: string) => Promise<ReviewAuthorityV1>;
  readonly readAudit: (key: string) => Promise<ReviewAuditSourceRow | undefined>;
  readonly readJournal: (key: string) => Promise<ReviewJournalObservationV1 | undefined>;
  /** Standard SHA256 of precisely the supplied UTF8 text, uppercase hex, no BOM/newline. */
  readonly sha256: (exactUtf8: string) => Promise<string>;
}
export type ReviewAuditReadContext = Pick<ReviewJournalV1, 'operationKey' | 'before' | 'actorBinding' | 'commandSource'> & {
  readonly journal?: ReviewJournalObservationV1;
};
export type ReviewAuditExpected = Pick<ReviewAuditSourceRow, 'key' | 'eventType' | 'body'>;
export interface ReviewAuditSourceObservation {
  readonly bindings: ReviewAuditBindings; readonly acl: ReviewAuditAclObservation; readonly authority: ReviewAuthorityV1;
  readonly journal?: ReviewJournalObservationV1; readonly rows: readonly { readonly row: ReviewAuditSourceRow; readonly sha256: string }[];
}
export class ReviewAuditReadbackError extends Error {
  public constructor(public readonly code: string) { super(code); Object.setPrototypeOf(this, ReviewAuditReadbackError.prototype); }
}
const check = (okay: boolean, code: string): void => { if (!okay) throw new ReviewAuditReadbackError(code); };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const nativeOkay = (n: Native): boolean => !!n && [n.siteId, n.webId, n.listId, n.version].every(nonBlank) && positive(n.itemId) && v4Etag(n.etag);
const instant = (s: string): boolean => typeof s === 'string' && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s;
const exactRole = (a: IOptionENativeRoleReadback, b: IOptionENativeRoleReadback): boolean =>
  (['id', 'name', 'roleTypeKind', 'high', 'low'] as const).every(k => a[k] === b[k]);
const tupleMatches = (a: IOptionEAclAssignmentTuple, b: IOptionEAclAssignmentTuple): boolean =>
  (['principalId', 'principalKey', 'principalType', 'roleDefinitionId', 'roleName', 'roleTypeKind', 'roleHigh', 'roleLow'] as const).every(k => a[k] === b[k]);
const observe = async <T>(query: () => Promise<T>): Promise<T> => {
  try { const v = await query(); return v === undefined ? v : copy(v); }
  catch { throw new ReviewAuditReadbackError('AuditReadUnavailable'); }
};
interface SourceReads {
  bindings?: ReviewAuditBindings; acl?: ReviewAuditAclObservation; authority: ReviewAuthorityV1;
  journal?: ReviewJournalObservationV1; rows: (ReviewAuditSourceRow | undefined)[];
}
const qualify = (context: ReviewAuditReadContext, expected: readonly Omit<ReviewAuditExpected, 'body'>[], reads: SourceReads,
  requireRows: boolean): { bindings: ReviewAuditBindings; acl: ReviewAuditAclObservation; rows: ReviewAuditSourceRow[] } => {
  const { before: b, actorBinding: actor, operationKey } = context, { authority: a } = reads;
  check(!!reads.bindings && !!reads.acl, 'AuditAclReadbackUnavailable'); const bindings = reads.bindings!, acl = reads.acl!;
  const c = a.control, h = a.header;
  const employee = a.people.filter(p => p.value.personKey === b.personKey), manager = a.people.filter(p => p.value.personKey === b.managerPersonKey);
  check(employee.length === 1 && manager.length === 1 && employee[0].value.active === true && manager[0].value.active === true
    && employee[0].value.personKey !== manager[0].value.personKey && employee[0].value.managerPersonKey === manager[0].value.personKey
    && a.people.every(p => nativeOkay(p.native) && positive(p.value.principalId) && nonBlank(p.value.email))
    && new Set(a.people.map(p => p.value.personKey)).size === a.people.length && new Set(a.people.map(p => p.value.principalId)).size === a.people.length
    && manager[0].value.principalId === actor.principalId && manager[0].value.personKey === actor.personKey
    && manager[0].value.email === actor.email && v4Equal(manager[0].native, actor.personNative), 'AuditBindingMismatch');
  check(nativeOkay(h.native) && h.value.id === h.native.itemId && h.value.etag === h.native.etag && c.etag === h.native.etag
    && h.value.workplanKey === c.workplanKey && h.value.personKey === c.personKey && h.value.performanceYear === c.performanceYear
    && h.value.managerPersonKey === c.managerPersonKey && h.value.state === c.state && h.value.transitionStatus === c.transitionStatus
    && h.value.rowVersionToken === c.rowVersionToken && positive(c.rowVersionToken)
    && (['workplanKey', 'personKey', 'performanceYear', 'managerPersonKey', 'hierarchyEpoch', 'aclEpoch', 'currentSubmittedSnapshotKey'] as const)
      .every(k => c[k] === b[k]) && positive(b.hierarchyEpoch) && positive(b.aclEpoch)
    && actor.subjectPersonKey === b.personKey && actor.managerPersonKey === b.managerPersonKey
    && actor.hierarchyEpoch === b.hierarchyEpoch && actor.aclEpoch === b.aclEpoch, 'AuditBindingMismatch');
  check(!a.pendingRequestKey || (a.pendingRequestKey === operationKey && a.lastOperationKey === operationKey), 'AuditBindingMismatch');
  check(bindings.operationKey === operationKey && bindings.workplanKey === b.workplanKey && bindings.hierarchyEpoch === b.hierarchyEpoch
    && bindings.aclEpoch === b.aclEpoch && acl.operationKey === operationKey && acl.workplanKey === b.workplanKey
    && acl.hierarchyEpoch === b.hierarchyEpoch && acl.aclEpoch === b.aclEpoch
    && bindings.auditList.siteId === h.native.siteId && bindings.auditList.webId === h.native.webId && nonBlank(bindings.auditList.listId)
    && bindings.roleWeb.siteId === h.native.siteId && bindings.roleWeb.webId === h.native.webId, 'AuditBindingMismatch');
  check(nativeOkay(context.commandSource.native) && /^[0-9A-F]{64}$/.test(context.commandSource.bodySha256), 'AuditSourceMismatch');
  if (context.journal) check(!!reads.journal && nativeOkay(reads.journal.native) && v4Equal(context.journal, reads.journal), 'AuditSourceChanged');
  else check(!reads.journal, 'AuditSourceChanged');
  const ids = [bindings.automationPrincipalIds.contentProcessor, bindings.automationPrincipalIds.aclReconciler,
    bindings.automationPrincipalIds.recoveryAdmin, employee[0].value.principalId, manager[0].value.principalId];
  check(ids.every(positive) && new Set(ids).size === 5 && bindings.principalBindings.length === 5
    && new Set(bindings.principalBindings.map(p => p.principalKey)).size === 5
    && ids.every(id => bindings.principalBindings.filter(p => p.principalId === id && nonBlank(p.principalKey) && positive(p.principalType)).length === 1), 'AuditBindingMismatch');
  const roleIds = [bindings.roleIds.itemReader, bindings.roleIds.addReadNoEdit, bindings.roleIds.draftEditor,
    bindings.roleIds.mutatorNoDelete, bindings.roleIds.aclReconciler, bindings.roleIds.fullControl];
  const definitions = [...OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE];
  check(roleIds.every(positive) && new Set(roleIds).size === 6 && bindings.roleReadbacks.length === 6, 'AuditBindingMismatch');
  const roles = definitions.map((r, i) => ({ id: roleIds[i], name: r.name, roleTypeKind: r.roleTypeKind, high: r.high, low: r.low }));
  check(roles.every(r => bindings.roleReadbacks.filter(observed => exactRole(observed, r)).length === 1), 'AuditBindingMismatch');
  const rows: ReviewAuditSourceRow[] = [];
  expected.forEach((e, i) => {
    const row = reads.rows[i]; if (!row) { check(!requireRows, 'AuditAclReadbackUnavailable'); return; }
    check(row.key === e.key && row.eventType === e.eventType && row.immutable === true && nonBlank(row.body) && instant(row.createdAt)
      && nativeOkay(row.native) && v4Equal(row.commandSource, context.commandSource), 'AuditSourceMismatch'); rows.push(row);
  });
  check(bindings.items.length === rows.length && acl.targets.length === rows.length && new Set(bindings.items.map(i => i.key)).size === rows.length
    && new Set(bindings.items.map(i => `${i.native.siteId}/${i.native.webId}/${i.native.listId}/${i.native.itemId}`)).size === rows.length, 'AuditBindingMismatch');
  const owners = [{ id: bindings.automationPrincipalIds.contentProcessor, role: roles[1] }, { id: bindings.automationPrincipalIds.recoveryAdmin, role: roles[5] }];
  for (const row of rows) {
    const matches = bindings.items.filter(i => i.key === row.key); check(matches.length === 1, 'AuditBindingMismatch'); const item = matches[0];
    const path = `KCFKPI_Audit/${b.performanceYear}/${b.personKey}/${row.key}`, collection = `${path}/RoleAssignments`;
    check(item.target === path && nativeOkay(item.native) && v4Equal(item.native, row.native)
      && (['siteId', 'webId', 'listId'] as const).every(k => item.native[k] === bindings.auditList[k]), 'AuditBindingMismatch');
    const targets = acl.targets.filter(t => t.key === row.key); check(targets.length === 1, 'AuditAclReadbackMismatch'); const target = targets[0], set = target.assignments;
    const expectedAssignments: IOptionEAclAssignmentTuple[] = owners.map(owner => ({
      ...bindings.principalBindings.find(p => p.principalId === owner.id)!, roleDefinitionId: owner.role.id, roleName: owner.role.name,
      roleTypeKind: owner.role.roleTypeKind, roleHigh: owner.role.high, roleLow: owner.role.low }));
    const continuationOkay = (uri: string): boolean => uri.startsWith(`${collection}?$skiptoken=`) && !uri.includes('://') && !/%2f|%5c/i.test(uri)
      && /^[A-Za-z0-9._~%-]+$/.test(uri.slice(`${collection}?$skiptoken=`.length));
    check(target.inherited === false && v4Equal(target.native, item.native) && set.target === path && set.canonicalCollectionPath === collection
      && set.complete === true && positive(set.pageCount) && set.pageCount === set.continuationUris.length + 1
      && set.totalCount === 2 && set.assignments.length === 2 && new Set(set.continuationUris).size === set.continuationUris.length
      && set.continuationUris.every(continuationOkay)
      && expectedAssignments.every(wanted => set.assignments.filter(actual => tupleMatches(actual, wanted)).length === 1), 'AuditAclReadbackMismatch');
    check(target.effective.length === 5 && ids.every(id => target.effective.filter(p => p.principalId === id).length === 1), 'AuditAclReadbackMismatch');
    for (const principal of target.effective) {
      const role = owners.find(owner => owner.id === principal.principalId)?.role;
      check(role ? validateOptionENativeAssignmentReadback(principal.assignment, role).length === 0
        : principal.assignment.assignedRoles.length === 0 && principal.assignment.effectiveHigh === 0 && principal.assignment.effectiveLow === 0, 'AuditAclReadbackMismatch');
    }
  }
  return { bindings, acl, rows };
};
/** Point-in-time source qualification only. Providers must independently resolve canonical
 * stores, principals, native roles and complete rights; this reader grants no capability. */
export const createOptionEWorkplanReviewAuditSourceReadback = (ports?: ReviewAuditReadPorts): {
  preflight(context: ReviewAuditReadContext, expected: readonly Omit<ReviewAuditExpected, 'body'>[]): Promise<ReviewAuditSourceObservation>;
  confirm(context: ReviewAuditReadContext, expected: readonly ReviewAuditExpected[]): Promise<ReviewAuditSourceObservation>;
} => {
  const read = async (input: ReviewAuditReadContext, wanted: readonly (Omit<ReviewAuditExpected, 'body'> & { body?: string })[], requireRows: boolean): Promise<ReviewAuditSourceObservation> => {
    check(!!ports && ['readReviewAuditBindings', 'readReviewAuditAcl', 'readCurrentAuthority', 'readAudit', 'readJournal', 'sha256']
      .every(method => typeof ports[method as keyof ReviewAuditReadPorts] === 'function'), 'AuditAclReadbackUnavailable');
    const context = copy(input), expected = copy(wanted);
    check(/^oe-review:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(context.operationKey)
      && expected.length > 0 && new Set(expected.map(e => e.key)).size === expected.length && expected.every(e =>
        ['WorkplanApproved', 'WorkplanLocked', 'WorkplanChangesRequested'].includes(e.eventType)
        && e.key === `${context.operationKey}:${e.eventType === 'WorkplanApproved' ? 'approved' : 'receipt'}`
        && (!requireRows || nonBlank(e.body))), 'AuditSourceMismatch');
    const load = async (): Promise<SourceReads> => ({ authority: await observe(() => ports!.readCurrentAuthority(context.before.workplanKey)),
      bindings: await observe(() => ports!.readReviewAuditBindings(context.operationKey)), acl: await observe(() => ports!.readReviewAuditAcl(context.operationKey)),
      journal: await observe(() => ports!.readJournal(context.operationKey)), rows: await Promise.all(expected.map(e => observe(() => ports!.readAudit(e.key)))) });
    const first = await load(), qualified = qualify(context, expected, first, requireRows);
    const rows: { row: ReviewAuditSourceRow; sha256: string }[] = [];
    for (const row of qualified.rows) {
      const wantedRow = expected.find(e => e.key === row.key)!;
      check(wantedRow.body === undefined || row.body === wantedRow.body, 'AuditSourceMismatch');
      const sha256 = await observe(() => ports!.sha256(row.body)); check(/^[0-9A-F]{64}$/.test(sha256), 'AuditDigestUnavailable'); rows.push({ row, sha256 });
    }
    // Detach optional absence before comparing transient reads; the sealed frame comparator
    // deliberately rejects undefined. No stored byte or failed query is converted to absence.
    const second = await load(); check(v4Equal(copy(first), copy(second)), 'AuditSourceChanged'); qualify(context, expected, second, requireRows);
    return copy({ bindings: qualified.bindings, acl: qualified.acl, authority: first.authority, ...(first.journal ? { journal: first.journal } : {}), rows });
  };
  return Object.freeze({ preflight: (context, expected) => read(context, expected, false), confirm: (context, expected) => read(context, expected, true) });
};
