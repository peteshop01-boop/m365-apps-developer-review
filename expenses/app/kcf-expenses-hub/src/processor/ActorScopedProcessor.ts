import type { IStandardRestPlan } from './SharePointStandardPlans';
import { TEST_SITE } from './SharePointStandardPlans';
import type { IStandardStoreIO } from './StandardStoreTransport';
import type { IStandardResponse } from './StandardConditionalWriter';
import { row, SharePointRequestReader } from './SharePointRequestReader';
import { listRoot, SharePointStandardStore } from './SharePointStandardStore';
import type { IStandardStoreSchema } from './SharePointStandardStore';
import { equalBytes, sameRequest, StandardExpenseProcessor } from './StandardExpenseProcessor';
import type { ISealedRequest, ProcessorResult } from './StandardExpenseProcessor';
import { positiveId } from '../services/persistence/PersistenceValidation';

/** Server/Standard-connector candidate, NOT a browser or deployment switch.
 * Provisioning must independently qualify these bindings and the protected
 * roster's folder registry. This module never creates a folder or changes ACLs.
 * The emitted cloud workflow still needs the matching boundary before use. */
const resources = ['requests', 'operations', 'results', 'audit', 'expenses', 'claims', 'people', 'months', 'nominals'] as const;
type Resource = typeof resources[number];
const scoped = ['requests', 'operations', 'results', 'expenses', 'claims', 'people'] as const;
type Scoped = typeof scoped[number];
const writable = ['operations', 'results', 'audit', 'expenses'] as const;
type Writable = typeof writable[number];
export interface IScopeRole { readonly id: number; readonly high: string; readonly low: string; }
export interface IScopePrincipal { readonly id: number; readonly type: 1 | 8; readonly roles: readonly IScopeRole[]; }
export interface IFolderField { readonly name: string; readonly kind: 'Text' | 'Note' | 'Number' | 'Boolean' | 'Date' | 'Lookup'; readonly empty: boolean; }
export interface IActorScopePolicy {
  readonly processorId: number;
  readonly recovery: IScopePrincipal;
  readonly roots: Readonly<Record<Resource, string>>;
  readonly rootAcl: Readonly<Record<Resource, readonly IScopePrincipal[]>>;
  readonly processorRoles: Readonly<Record<Resource, IScopeRole>>;
  readonly employeeRead: IScopeRole;
  readonly employeeRequest: IScopeRole;
  /** Proposed protected plain-Note field, not a claim that it exists in TEST.
   * Its JSON maps each sensitive resource to a qualified folder item ID/GUID.
   * Only trusted onboarding may write it. Never accepted from an expense body. */
  readonly registryField: string;
  readonly fields: Readonly<Record<Writable, Readonly<Record<string, IFolderField>>>>;
}
interface FolderIdentity { readonly id: number; readonly uniqueId: string; }
type Registry = Record<Scoped, FolderIdentity>;
const headers = { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' };
const guidPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
function requireValue(ok: unknown): asserts ok { if (!ok) throw new Error('PRIVATE_SCOPE_HELD'); }
function int(v: unknown): number { requireValue(positiveId(v) && v <= 2147483647); return v as number; }
function exact(v: unknown, keys: readonly string[]): Record<string, unknown> {
  const r = row(v, keys); requireValue(Object.keys(v as object).length === keys.length); return r;
}
/** Copy only inert own data. No getters, inherited values, toJSON or undefined
 * can manufacture a deployment policy during snapshotting. */
function copy(v: unknown): unknown {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') { requireValue(Number.isFinite(v)); return v; }
  requireValue(!!v && typeof v === 'object');
  if (Array.isArray(v)) {
    const keys = Object.keys(v); requireValue(keys.length === v.length && keys.every((k, i) => k === String(i)));
    return keys.map(k => { const d = Object.getOwnPropertyDescriptor(v, k); requireValue(d && 'value' in d); return copy(d.value); });
  }
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v)) {
    requireValue(k !== '__proto__' && k !== 'constructor' && k !== 'prototype');
    const d = Object.getOwnPropertyDescriptor(v, k); requireValue(d && 'value' in d); out[k] = copy(d.value);
  }
  return out;
}
function freeze(v: unknown): void {
  if (v && typeof v === 'object' && !(v instanceof Uint8Array)) {
    Object.values(v).forEach(freeze); Object.freeze(v);
  }
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).sort().join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonical((v as Record<string, unknown>)[k])).join(',') + '}';
  return JSON.stringify(v);
}
function role(r: IScopeRole): void {
  exact(r, ['id', 'high', 'low']); int(r.id);
  for (const word of [r.high, r.low]) requireValue(typeof word === 'string' && /^(0|[1-9]\d{0,9})$/.test(word) && Number(word) <= 4294967295);
}
function principal(p: IScopePrincipal): void {
  exact(p, ['id', 'type', 'roles']); int(p.id); requireValue(p.type === 1 || p.type === 8);
  requireValue(Array.isArray(p.roles) && p.roles.length > 0 && p.roles.length <= 3);
  p.roles.forEach(role); requireValue(new Set(p.roles.map(r => r.id)).size === p.roles.length);
}
function employeeRole(r: IScopeRole, mask: number): void {
  role(r); const low = Number(r.low), required = 65536 + 131072 + mask, allowed = required + 32 + 4096;
  requireValue(r.high === '0' && (low & required) === required && (low & ~allowed) === 0);
}
function processorRole(r: IScopeRole, name: Resource): void {
  role(r); const mask = name === 'claims' ? 5 : ['expenses', 'operations'].includes(name) ? 7 : ['results', 'audit'].includes(name) ? 3 : 1;
  const required = 65536 + 131072 + 32 + 64 + 67108864 + 134217728 + mask, low = Number(r.low);
  // Same closed read/enumeration dependencies as the reviewed fixture policy.
  // No ManagePermissions, ManageLists, delete, alerts or customisation bits.
  requireValue(r.high === '1073741824' && low === required);
}
function get(url: string): IStandardRestPlan { return { method: 'GET', url, headers, retry: 'none' }; }
function pathLiteral(s: string): string { return encodeURIComponent(s.replace(/'/g, "''")); }
function objectBody(r: IStandardResponse): Record<string, unknown> { requireValue(r.status === 200); requireValue(r.body && typeof r.body === 'object' && !Array.isArray(r.body)); return r.body as Record<string, unknown>; }
function feed(r: IStandardResponse, cap: number): Record<string, unknown>[] {
  const b = objectBody(r), d = row(b, ['value']);
  requireValue(Array.isArray(d.value) && d.value.length < cap && !['@odata.nextLink', 'odata.nextLink', '__next'].some(k => Object.prototype.hasOwnProperty.call(b, k)));
  return d.value.map(v => { requireValue(v && typeof v === 'object' && !Array.isArray(v)); return v as Record<string, unknown>; });
}
function noContinuation(v: unknown, depth = 0): void {
  requireValue(depth < 32);
  if (!v || typeof v !== 'object') return;
  for (const [key, value] of Object.entries(v)) {
    requireValue(key !== '__next' && !/(?:@odata\.nextLink|odata\.nextLink)$/i.test(key));
    noContinuation(value, depth + 1);
  }
}
function isScoped(n: Resource): n is Scoped { return (scoped as readonly string[]).includes(n); }
function isWritable(n: Resource): n is Writable { return (writable as readonly string[]).includes(n); }

/** One request-local capability. Never reused for another actor, parent or run.
 * All existing Store calls (including CAS/recovery and binary attachment reads)
 * pass through it. Internal proof GETs use the protected processor connection.
 * Ordinary browser composition deliberately does not construct this class. */
export class ActorScopedProcessorIO implements IStandardStoreIO {
  private constructor(private readonly base: IStandardStoreIO, private readonly schema: IStandardStoreSchema,
    private readonly policy: IActorScopePolicy, private readonly request: ISealedRequest,
    private readonly personId: number, private readonly registry: Registry, private readonly registryText: string) {}

  public static async open(base: IStandardStoreIO, schemaInput: IStandardStoreSchema, policyInput: IActorScopePolicy, requestId: number): Promise<ActorScopedProcessorIO> {
    const s = copy(schemaInput) as IStandardStoreSchema, p = copy(policyInput) as IActorScopePolicy; int(requestId);
    exact(p, ['processorId', 'recovery', 'roots', 'rootAcl', 'processorRoles', 'employeeRead', 'employeeRequest', 'registryField', 'fields']);
    int(p.processorId); principal(p.recovery); requireValue(p.recovery.id !== p.processorId);
    requireValue(s.personActiveValue === true);
    exact(p.roots, resources); exact(p.rootAcl, resources); exact(p.processorRoles, resources); exact(p.fields, writable);
    requireValue(/^[A-Za-z][A-Za-z0-9_]*$/.test(p.registryField) && ![s.personUser, s.personActive, 'Author', 'Editor', 'Title'].includes(p.registryField));
    employeeRole(p.employeeRead, 1); employeeRole(p.employeeRequest, 3);
    for (const n of resources) {
      listRoot(s.lists[n]);
      requireValue(p.roots[n] === `/sites/REVIEW-TEST-SITE/${n === 'requests' ? '' : 'Lists/'}KCFEXP_TEST102_D01_${p.roots[n].match(/D01_([a-f0-9]{12})_/)?.[1]}_${n}`);
      processorRole(p.processorRoles[n], n);
      requireValue(Array.isArray(p.rootAcl[n]) && p.rootAcl[n].length >= 2 && p.rootAcl[n].length < 257);
      p.rootAcl[n].forEach(principal);
      requireValue(new Set(p.rootAcl[n].map(a => a.id)).size === p.rootAcl[n].length);
      requireValue(p.rootAcl[n].some(a => canonical(a) === canonical(p.recovery)));
      requireValue(p.rootAcl[n].some(a => a.id === p.processorId && a.type === 1 && canonical(a.roles) === canonical([p.processorRoles[n]])));
      for (const a of p.rootAcl[n]) if (a.id !== p.processorId && a.id !== p.recovery.id) {
        if (isScoped(n) || n === 'audit') requireValue(a.roles.length === 1 && a.roles[0].id === 1073741825 && a.roles[0].high === '48' && a.roles[0].low === '134287360' && n !== 'audit');
        else a.roles.forEach((r: IScopeRole) => employeeRole(r, 1));
      }
    }
    requireValue(new Set(resources.map(n => s.lists[n].toLowerCase())).size === 9 && new Set(resources.map(n => p.roots[n])).size === 9);
    requireValue(new Set(resources.map(n => p.roots[n].match(/D01_([a-f0-9]{12})_/)?.[1])).size === 1);
    for (const n of writable) {
      requireValue(p.fields[n] && typeof p.fields[n] === 'object' && Object.keys(p.fields[n]).length > 0);
      for (const [input, f] of Object.entries(p.fields[n])) {
        exact(f, ['name', 'kind', 'empty']);
        requireValue(/^[A-Za-z][A-Za-z0-9_]*$/.test(input) && /^[A-Za-z][A-Za-z0-9_]*$/.test(f.name) &&
          !/^(Author|Editor|Created|Modified|Originator|ExpenseCategory|File|FSObj|ContentType|Id$|GUID$|__)/i.test(f.name) &&
          ['Text', 'Note', 'Number', 'Boolean', 'Date', 'Lookup'].includes(f.kind) && typeof f.empty === 'boolean');
      }
      requireValue(new Set(Object.values(p.fields[n]).map(f => f.name.toLowerCase())).size === Object.keys(p.fields[n]).length);
    }
    freeze(s); freeze(p);
    const identity = objectBody(await base.execute(get(`${TEST_SITE}/_api/web/currentuser?$select=Id,IsSiteAdmin`)));
    const processor = row(identity, ['Id', 'IsSiteAdmin']); requireValue(processor.Id === p.processorId && processor.IsSiteAdmin === false);
    const incoming = objectBody(await base.execute(get(`${listRoot(s.lists.requests)}/items(${requestId})?$select=Id,AuthorId`)));
    const native = row(incoming, ['Id', 'AuthorId']); requireValue(native.Id === requestId);
    const actor = int(native.AuthorId); requireValue(actor !== p.processorId && !(p.recovery.type === 1 && actor === p.recovery.id));
    const ordinary = row(objectBody(await base.execute(get(`${TEST_SITE}/_api/web/siteusers/getbyid(${actor})?$select=Id,PrincipalType,IsSiteAdmin`))), ['Id', 'PrincipalType', 'IsSiteAdmin']);
    requireValue(ordinary.Id === actor && ordinary.PrincipalType === 1 && ordinary.IsSiteAdmin === false);
    // Bootstrap only protected metadata; no request bytes or financial write is
    // consumed before native actor, roots/folders and the protected registry.
    const provisional = new ActorScopedProcessorIO(base, s, p, { authorId: actor } as ISealedRequest, 0, {} as Registry, '');
    await provisional.prove('requests', false); await provisional.prove('people', false);
    const people = feed(await base.execute(get(`${listRoot(s.lists.people)}/items?$select=Id,${s.personUser},${s.personActive},${p.registryField},FileDirRef,FileRef,FileSystemObjectType,HasUniqueRoleAssignments&$filter=${s.personUser} eq ${actor}&$top=2`)), 2);
    requireValue(people.length === 1); const person = row(people[0], ['Id', s.personUser, s.personActive, p.registryField]);
    requireValue(person[s.personUser] === actor && person[s.personActive] === true && typeof person[p.registryField] === 'string');
    provisional.child('people', people[0]);
    const text = person[p.registryField] as string; requireValue(text.length > 0 && text.length <= 8192);
    const registry = JSON.parse(text) as Registry; exact(registry, scoped);
    for (const n of scoped) { exact(registry[n], ['id', 'uniqueId']); int(registry[n].id); requireValue(typeof registry[n].uniqueId === 'string' && guidPattern.test(registry[n].uniqueId)); }
    requireValue(new Set(scoped.map(n => registry[n].uniqueId.toLowerCase())).size === scoped.length); freeze(registry);
    const bootstrap = new ActorScopedProcessorIO(base, s, p, { authorId: actor } as ISealedRequest, int(person.Id), registry, text);
    const sealed = await new SharePointRequestReader(bootstrap, s.lists.requests).read(requestId);
    requireValue(sealed.authorId === actor); freeze(sealed);
    const ready = new ActorScopedProcessorIO(base, s, p, sealed, int(person.Id), registry, text);
    // Qualify ALL destinations before the first ledger/financial publication,
    // not only the one immediately about to be read or written.
    for (const n of resources) await ready.prove(n);
    await ready.fieldAdmission();
    // Processor sees the complete matching roster/Draft feed, unlike an
    // ordinary security-trimmed browser. A command parent is never authority.
    const store = new SharePointStandardStore(ready, s);
    const month = `${sealed.command.date.slice(6)}-${sealed.command.date.slice(3, 5)}`;
    const operation = await store.findOperation(`${actor}:${sealed.command.operationId}`);
    if (!operation || operation.state === 'Pending') {
      const parent = await store.resolveOwnDraftParent(actor, month); requireValue(parent === sealed.command.parentId);
    } else {
      // A completed saved operation stays readable after submission/closure;
      // it must not be rebound to a newer Draft merely to replay its result.
      const policy = (await store.readPolicy(actor, sealed.command.parentId)).policy;
      requireValue(operation.originatorId === actor && operation.parentId === sealed.command.parentId && policy.ownerId === actor && policy.active && policy.month === month);
    }
    return ready;
  }
  public store(): SharePointStandardStore { return new SharePointStandardStore(this, this.schema); }
  public async verifyTerminalScope(result: ProcessorResult): Promise<void> {
    for (const n of resources) await this.prove(n);
    await this.roster(); await this.fieldAdmission();
    if (result.state === 'StorageVerified') {
      const store = this.store(), k = `${this.request.authorId}:${this.request.command.operationId}`;
      const ledger = await store.findOperation(k);
      requireValue(ledger && ledger.state === 'Completed' && ledger.originatorId === this.request.authorId &&
        ledger.parentId === this.request.command.parentId && JSON.stringify(ledger.record) === JSON.stringify(result.record));
      const original = await store.readRequest(ledger.requestId);
      requireValue(sameRequest(this.request, original));
      const line = await store.readLine(result.record.line.id);
      requireValue(JSON.stringify(line) === JSON.stringify(result.record) && await store.verifyLineProvenance(line, original));
      const bytes = await store.readReceipt(line);
      requireValue(original.command.receipt.kind === 'none' ? line.receipt.kind === 'none' && bytes === undefined :
        line.receipt.kind === 'file' && bytes && equalBytes(original.command.receipt.bytes, bytes));
      const audits = feed(await this.execute(get(`${listRoot(this.schema.lists.audit)}/items?$filter=OperationKey eq '${k}'&$top=2`)), 2);
      requireValue(audits.length === 1);
      const audit = row(audits[0], ['OperationKey', 'RequestId', 'D01ActorId', 'ParentId', 'ExpenseId', 'RecordJson', 'Event', 'Created']);
      requireValue(audit.OperationKey === k && audit.RequestId === ledger.requestId && audit.D01ActorId === this.request.authorId &&
        audit.ParentId === ledger.parentId && audit.ExpenseId === line.line.id && audit.RecordJson === JSON.stringify(line) && audit.Event === 'ExpenseCreated');
      requireValue(typeof audit.Created === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(audit.Created) && Number.isFinite(Date.parse(audit.Created)));
      requireValue(await store.operationReleased(ledger.parentId, k));
      // The terminal ledger, result, request, expense, attachment and audit were
      // freshly read through child-scope proof. Recheck their enclosing scopes
      // too; this still does not claim a transaction against later admin edits.
      for (const n of resources) await this.prove(n);
      await this.roster();
    } else if (result.state === 'Rejected') {
      const store = this.store(), k = `${this.request.authorId}:${this.request.command.operationId}`;
      const ledger = await store.findOperation(k);
      requireValue(!await store.findLine(k));
      if (ledger) {
        requireValue(ledger.state === 'Rejected' && ledger.originatorId === this.request.authorId && ledger.parentId === this.request.command.parentId);
        requireValue(sameRequest(this.request, await store.readRequest(ledger.requestId)) && await store.operationReleased(ledger.parentId, k));
      }
      for (const n of resources) await this.prove(n);
      await this.roster();
    }
  }
  private async fieldAdmission(): Promise<void> {
    const s = this.schema;
    for (const n of writable) {
      const key = n === 'expenses' ? s.expense.canonicalOperation : 'OperationKey';
      const values = feed(await this.base.execute(get(`${listRoot(s.lists[n])}/fields?$select=InternalName,TypeAsString,Required,ReadOnlyField,EnforceUniqueValues&$filter=InternalName eq '${key}'&$top=2`)), 2);
      requireValue(values.length === 1); const field = row(values[0], ['InternalName', 'TypeAsString', 'Required', 'ReadOnlyField', 'EnforceUniqueValues']);
      requireValue(field.InternalName === key && field.TypeAsString === 'Text' && field.Required === true && field.ReadOnlyField === false && field.EnforceUniqueValues === true);
    }
    const people = feed(await this.base.execute(get(`${listRoot(s.lists.people)}/fields?$select=InternalName,TypeAsString,Required,ReadOnlyField,RichText,AppendOnly&$filter=InternalName eq '${s.personUser}' or InternalName eq '${this.policy.registryField}'&$top=3`)), 3);
    requireValue(people.length === 2);
    const user = people.filter(f => f.InternalName === s.personUser), registry = people.filter(f => f.InternalName === this.policy.registryField);
    requireValue(user.length === 1 && registry.length === 1 && user[0].TypeAsString === 'Number' && user[0].Required === true && user[0].ReadOnlyField === false &&
      registry[0].TypeAsString === 'Note' && registry[0].ReadOnlyField === false && registry[0].RichText === false && registry[0].AppendOnly === false);
    const fields = feed(await this.base.execute(get(`${listRoot(s.lists.expenses)}/fields?$select=InternalName,TypeAsString,Required,ReadOnlyField,RichText,AppendOnly&$top=201`)), 201);
    requireValue(!fields.some(f => typeof f.InternalName !== 'string' || typeof f.Required !== 'boolean' || typeof f.ReadOnlyField !== 'boolean' ||
      (f.InternalName.toLowerCase() === 'expensecategory' && f.Required !== false)));
    const reason = fields.filter(f => f.InternalName === s.expense.reason);
    requireValue(reason.length === 1 && reason[0].TypeAsString === 'Note' && reason[0].ReadOnlyField === false && reason[0].RichText === false && reason[0].AppendOnly === false);
    for (const f of fields) if (f.Required === true && f.ReadOnlyField === false) {
      requireValue(Object.values(this.policy.fields.expenses).some(v => v.name === f.InternalName));
    }
  }

  private folder(n: Scoped): string { return `${this.policy.roots[n]}/${this.request.authorId}`; }
  private async acl(url: string, expected: readonly IScopePrincipal[]): Promise<void> {
    const response = await this.base.execute(get(url + '?$select=Member/Id,Member/PrincipalType,RoleDefinitionBindings/Id,RoleDefinitionBindings/BasePermissions&$expand=Member,RoleDefinitionBindings&$top=257'));
    noContinuation(response.body);
    const rows = feed(response, 257);
    const actual = rows.map(r => {
      const a = row(r, ['Member', 'RoleDefinitionBindings']), m = row(a.Member, ['Id', 'PrincipalType']);
      requireValue(Array.isArray(a.RoleDefinitionBindings));
      const roles = a.RoleDefinitionBindings.map(v => { const d = row(v, ['Id', 'BasePermissions']), b = row(d.BasePermissions, ['High', 'Low']); return { id: d.Id, high: b.High, low: b.Low }; });
      return { id: m.Id, type: m.PrincipalType, roles };
    });
    requireValue(canonical(actual) === canonical(expected));
  }
  private async prove(n: Resource, pin = true): Promise<string> {
    const root = listRoot(this.schema.lists[n]);
    const meta = row(objectBody(await this.base.execute(get(root + '?$select=Id,HasUniqueRoleAssignments,EnableVersioning,EnableAttachments,EnableFolderCreation,RootFolder/ServerRelativeUrl&$expand=RootFolder'))), ['Id', 'HasUniqueRoleAssignments', 'EnableVersioning', 'EnableAttachments', 'EnableFolderCreation', 'RootFolder']);
    requireValue(typeof meta.Id === 'string' && meta.Id.toLowerCase() === this.schema.lists[n].toLowerCase() && meta.HasUniqueRoleAssignments === true && meta.EnableVersioning === true);
    requireValue(row(meta.RootFolder, ['ServerRelativeUrl']).ServerRelativeUrl === this.policy.roots[n]);
    if (n === 'expenses') requireValue(meta.EnableAttachments === true);
    await this.acl(root + '/roleassignments', this.policy.rootAcl[n]);
    const rootIdentity = { id: meta.Id, root: this.policy.roots[n], unique: meta.HasUniqueRoleAssignments, versioning: meta.EnableVersioning, attachments: meta.EnableAttachments, folders: meta.EnableFolderCreation };
    if (!isScoped(n)) return canonical(rootIdentity);
    requireValue(meta.EnableFolderCreation === true);
    const url = `${TEST_SITE}/_api/web/GetFolderByServerRelativePath(decodedurl='${pathLiteral(this.folder(n))}')`;
    const folder = row(objectBody(await this.base.execute(get(url + '?$select=UniqueId,ServerRelativeUrl,ListItemAllFields/Id,ListItemAllFields/HasUniqueRoleAssignments,ListItemAllFields/FileSystemObjectType&$expand=ListItemAllFields'))), ['UniqueId', 'ServerRelativeUrl', 'ListItemAllFields']);
    const item = row(folder.ListItemAllFields, ['Id', 'HasUniqueRoleAssignments', 'FileSystemObjectType']);
    requireValue(folder.ServerRelativeUrl === this.folder(n) && typeof folder.UniqueId === 'string' && guidPattern.test(folder.UniqueId) && item.HasUniqueRoleAssignments === true && item.FileSystemObjectType === 1);
    int(item.Id);
    if (pin) requireValue(item.Id === this.registry[n].id && folder.UniqueId.toLowerCase() === this.registry[n].uniqueId.toLowerCase());
    const expected = [this.policy.recovery, { id: this.policy.processorId, type: 1 as const, roles: [this.policy.processorRoles[n]] },
      { id: this.request.authorId, type: 1 as const, roles: [n === 'requests' ? this.policy.employeeRequest : this.policy.employeeRead] }];
    await this.acl(`${root}/items(${item.Id})/roleassignments`, expected);
    // Exclude incidental OData annotations/ETags. Creating a child can advance
    // a folder's ETag legitimately without changing its identity or scope.
    return canonical({ rootIdentity, uniqueId: folder.UniqueId.toLowerCase(), id: item.Id, path: folder.ServerRelativeUrl, unique: item.HasUniqueRoleAssignments });
  }
  private child(n: Resource, v: unknown): void {
    const r = row(v, ['Id', 'FileDirRef', 'FileRef', 'FileSystemObjectType', 'HasUniqueRoleAssignments']); int(r.Id);
    const parent = isScoped(n) ? this.folder(n) : this.policy.roots[n];
    requireValue(r.HasUniqueRoleAssignments === false && r.FileSystemObjectType === 0 && r.FileDirRef === parent &&
      typeof r.FileRef === 'string' && r.FileRef.startsWith(parent + '/') && /^[A-Za-z0-9_. -]+$/.test(r.FileRef.slice(parent.length + 1)) && !['.', '..'].includes(r.FileRef.slice(parent.length + 1)));
    if (n === 'requests') {
      const req = row(v, ['AuthorId', 'EditorId', 'File']), file = row(req.File, ['Name', 'ServerRelativeUrl']);
      requireValue(req.AuthorId === this.request.authorId && req.EditorId === this.request.authorId && file.ServerRelativeUrl === r.FileRef && file.Name === r.FileRef.slice(parent.length + 1));
    }
    if (['operations', 'results', 'audit'].includes(n)) requireValue(row(v, ['D01ActorId', 'ParentId']).D01ActorId === this.request.authorId && (!this.request.command || row(v, ['ParentId']).ParentId === this.request.command.parentId));
    if (['operations', 'results', 'audit', 'expenses'].includes(n)) requireValue(row(v, ['AuthorId']).AuthorId === this.policy.processorId);
    if (n === 'expenses') requireValue(row(v, [this.schema.expense.originator, 'ClaimSubmissionRefId'])[this.schema.expense.originator] === this.request.authorId && (!this.request.command || row(v, ['ClaimSubmissionRefId']).ClaimSubmissionRefId === this.request.command.parentId));
    if (n === 'people') requireValue(row(v, [this.schema.personUser])[this.schema.personUser] === this.request.authorId);
    if (n === 'claims' && this.personId) requireValue(row(v, ['ClaimantRecordId']).ClaimantRecordId === this.personId && (!this.request.command || r.Id === this.request.command.parentId));
  }
  private async roster(): Promise<void> {
    if (!this.personId) return; // Only while the protected bootstrap is incomplete.
    const s = this.schema, p = this.policy;
    const values = feed(await this.base.execute(get(`${listRoot(s.lists.people)}/items?$select=Id,${s.personUser},${s.personActive},${p.registryField},FileDirRef,FileRef,FileSystemObjectType,HasUniqueRoleAssignments&$filter=${s.personUser} eq ${this.request.authorId}&$top=2`)), 2);
    requireValue(values.length === 1); this.child('people', values[0]);
    const r = row(values[0], ['Id', s.personUser, s.personActive, p.registryField]);
    requireValue(r.Id === this.personId && r[s.personUser] === this.request.authorId && r[s.personActive] === true && r[p.registryField] === this.registryText);
  }
  private parse(plan: IStandardRestPlan): { n: Resource; url: URL; itemId?: number; tail: string } {
    requireValue(plan.retry === 'none' && (plan.method === 'GET' || plan.method === 'POST'));
    const url = new URL(plan.url), match = /^\/_api\/web\/lists\(guid'([^']+)'\)\/items(?:\(([1-9]\d*)\))?(.*)$/.exec(url.pathname.slice('/sites/REVIEW-TEST-SITE'.length));
    requireValue(url.origin + '/sites/REVIEW-TEST-SITE' === TEST_SITE && url.username === '' && url.password === '' && url.hash === '' && match);
    const n = resources.find(name => this.schema.lists[name].toLowerCase() === match[1].toLowerCase()); requireValue(n);
    const itemId = match[2] ? int(Number(match[2])) : undefined;
    return { n, url, itemId, tail: match[3] };
  }
  private expanded(plan: IStandardRestPlan, n: Resource): IStandardRestPlan {
    const url = new URL(plan.url), selection = url.searchParams.get('$select');
    const fields = ['Id', 'FileDirRef', 'FileRef', 'FileSystemObjectType', 'HasUniqueRoleAssignments'];
    if (n === 'requests') { fields.push('AuthorId', 'EditorId', 'File/Name', 'File/ServerRelativeUrl'); url.searchParams.set('$expand', 'File'); }
    if (['operations', 'results', 'audit'].includes(n)) fields.push('D01ActorId', 'ParentId');
    if (['operations', 'results', 'audit', 'expenses'].includes(n)) fields.push('AuthorId');
    if (n === 'expenses') fields.push(this.schema.expense.originator, 'ClaimSubmissionRefId');
    if (n === 'people') fields.push(this.schema.personUser);
    if (n === 'claims') fields.push('ClaimantRecordId');
    url.searchParams.set('$select', Array.from(new Set([...(selection ? selection.split(',') : ['*']), ...fields])).join(','));
    return { ...plan, url: url.href };
  }
  private async itemProof(n: Resource, itemId: number): Promise<void> {
    const r = await this.base.execute(this.expanded(get(`${listRoot(this.schema.lists[n])}/items(${itemId})`), n));
    this.child(n, objectBody(r)); requireValue(row(r.body, ['Id']).Id === itemId);
  }
  private formValues(n: Writable, body: unknown): { FieldName: string; FieldValue: string }[] {
    const mapping = this.policy.fields[n], data = exact(body, Object.keys(body as object));
    requireValue(Object.keys(data).length > 0 && Object.keys(data).every(k => Object.prototype.hasOwnProperty.call(mapping, k)));
    if (n === 'expenses') requireValue(data[this.schema.expense.originator] === this.request.authorId && data.ClaimSubmissionRefId === this.request.command.parentId);
    else requireValue(data.D01ActorId === this.request.authorId && data.ParentId === this.request.command.parentId);
    return Object.entries(data).map(([key, value]) => {
      const f = mapping[key]; let text: string;
      if (value === null || value === '') { requireValue(f.empty); text = ''; }
      else if (f.kind === 'Number') { requireValue(typeof value === 'number' && Number.isFinite(value) && /^-?\d+(\.\d+)?$/.test(String(value))); text = String(value); }
      else if (f.kind === 'Lookup') { text = String(int(value)); }
      else if (f.kind === 'Boolean') { requireValue(typeof value === 'boolean'); text = value ? '1' : '0'; }
      else { requireValue(typeof value === 'string'); text = value; if (f.kind === 'Date') { requireValue(/^20\d{2}-\d{2}-\d{2}$/.test(text) && new Date(text).toISOString().slice(0, 10) === text); text += 'T00:00:00Z'; } }
      return { FieldName: f.name, FieldValue: text };
    });
  }
  private acknowledgement(r: IStandardResponse, expected: readonly { FieldName: string; FieldValue: string }[]): number {
    const values = feed(r, expected.length + 2); requireValue(values.length === expected.length + 1);
    const ids = values.filter(v => v.FieldName === 'Id'); requireValue(ids.length === 1);
    const assigned = row(ids[0], ['FieldValue']); requireValue(typeof assigned.FieldValue === 'string' && /^[1-9]\d*$/.test(assigned.FieldValue)); const itemId = int(Number(assigned.FieldValue));
    const seen = new Set<string>();
    for (const v of values) {
      const d = row(v, ['FieldName', 'FieldValue', 'HasException', 'ErrorMessage', 'ItemId']);
      requireValue(typeof d.FieldName === 'string' && !seen.has(d.FieldName) && d.HasException === false && (d.ErrorMessage === null || d.ErrorMessage === '') && (d.ItemId === 0 || d.ItemId === itemId));
      seen.add(d.FieldName);
      if (d.FieldName !== 'Id') requireValue(expected.some(e => e.FieldName === d.FieldName && e.FieldValue === d.FieldValue));
    }
    return itemId;
  }
  public async execute(plan: IStandardRestPlan): Promise<IStandardResponse> {
    const { n, url, itemId, tail } = this.parse(plan);
    requireValue(tail === '' || (!!itemId && (tail === '/File/$value' || /^\/AttachmentFiles(?:\?.*)?$/.test(tail) || /^\/AttachmentFiles\/(?:add\(FileName='[A-Za-z0-9%_. ()-]+'\)|getByFileName\('[A-Za-z0-9%_. ()-]+'\)\/\$value)$/.test(tail))));
    const stamp = await this.prove(n); await this.prove('people'); await this.roster();
    if (itemId) await this.itemProof(n, itemId);
    let result: IStandardResponse;
    if (plan.method === 'GET') {
      requireValue(!tail.endsWith('/$value')); // Binary path has separate bounded handling.
      const actual = tail === '' ? this.expanded(plan, n) : plan;
      result = await this.base.execute(actual);
      if (result.status === 200 && tail === '') {
        const b = objectBody(result); if (itemId) this.child(n, b);
        else feed(result, Number(url.searchParams.get('$top') || '0')).forEach(v => this.child(n, v));
      }
    } else {
      requireValue(n === 'claims' || isWritable(n));
      // A removed unique index or newly required hidden Category must not gain
      // a publication window between initial admission and later checkpoints.
      await this.fieldAdmission();
      if (!itemId) {
        requireValue(isWritable(n) && tail === '' && plan.headers['X-HTTP-Method'] === undefined);
        const values = this.formValues(n, plan.body), destination = n === 'audit' ? this.policy.roots[n] : this.folder(n);
        result = await this.base.execute({ ...plan, url: `${listRoot(this.schema.lists[n])}/AddValidateUpdateItemUsingPath`,
          body: { listItemCreateInfo: { FolderPath: { DecodedUrl: 'https://example.invalid' + destination }, UnderlyingObjectType: 0 }, formValues: values, bNewDocumentUpdate: false } });
        if (result.status === 200) {
          const created = this.acknowledgement(result, values); await this.itemProof(n, created);
          const read = objectBody(await this.base.execute(this.expanded(get(`${listRoot(this.schema.lists[n])}/items(${created})`), n)));
          requireValue(row(read, ['AuthorId']).AuthorId === this.policy.processorId);
          const expected = plan.body as Record<string, unknown>;
          for (const [k, v] of Object.entries(expected)) {
            const field = this.policy.fields[n][k];
            // SharePoint serialises an empty optional plain Note as null. The
            // established rejected-result contract already handles that exact
            // representation; do not extend it to numbers, IDs or other types.
            const emptyNote = field.kind === 'Note' && field.empty && (v === null || v === '') && (read[k] === null || read[k] === '');
            requireValue(read[k] === v || emptyNote || (field.kind === 'Date' && read[k] === String(v) + 'T00:00:00Z'));
          }
        } else requireValue(result.status === 409);
      } else {
        if (tail === '') {
          const allowed = n === 'claims' ? [this.schema.reservation, this.schema.checkpoint, 'ExpenseTotal', 'OverallTotal', 'SubmissionVersion'] : n === 'operations' ? ['State', 'ResultId'] : [];
          requireValue(allowed.length > 0 && plan.headers['X-HTTP-Method'] === 'MERGE' && /^"[^"\r\n]+"$/.test(plan.headers['IF-MATCH']) && Object.keys(plan.body as object).length > 0 && Object.keys(plan.body as object).every(k => allowed.includes(k)));
        }
        else requireValue(n === 'expenses' && tail.startsWith('/AttachmentFiles/add(') && plan.headers['X-HTTP-Method'] === undefined);
        result = await this.base.execute(plan);
      }
    }
    await this.roster(); requireValue(await this.prove(n) === stamp); await this.prove('people');
    if (itemId && result.status >= 200 && result.status < 300) await this.itemProof(n, itemId);
    return result;
  }
  public async binary(plan: IStandardRestPlan, envelope = false): Promise<Uint8Array> {
    const { n, itemId, tail } = this.parse(plan); requireValue(plan.method === 'GET' && itemId &&
      ((n === 'requests' && tail === '/File/$value' && envelope) || (n === 'expenses' && /^\/AttachmentFiles\/getByFileName\('[A-Za-z0-9%_. ()-]+'\)\/\$value$/.test(tail) && !envelope)));
    const stamp = await this.prove(n); await this.prove('people'); await this.roster(); await this.itemProof(n, itemId);
    const bytes = await this.base.binary(plan, envelope);
    await this.roster(); requireValue(await this.prove(n) === stamp); await this.prove('people'); await this.itemProof(n, itemId); return bytes;
  }
}

/** Used server composition. No hosting, credentials, activation or tenant
 * authority is supplied. The Standard cloud workflow must be separately
 * adapted/reviewed; this is not an Azure/Node runtime deployment proposal. */
export async function processActorScopedExpense(base: IStandardStoreIO, schema: IStandardStoreSchema,
  policy: IActorScopePolicy, requestId: number): Promise<ProcessorResult> {
  let started = false;
  try {
    const scopedIO = await ActorScopedProcessorIO.open(base, schema, policy, requestId);
    started = true;
    const result = await new StandardExpenseProcessor(scopedIO.store()).process(requestId);
    await scopedIO.verifyTerminalScope(result); return result;
  } catch { return { state: started ? 'Pending' : 'Held', tenantWriteAllowed: false }; }
}
