import type { IStoredExpense } from '../services/persistence/PersistenceContract';
import { hash, own, positiveId, snapshotStored } from '../services/persistence/PersistenceValidation';
import type { IOperationLedger, ISealedRequest, IServerPolicy, IStandardProcessorStore } from './StandardExpenseProcessor';
import { equalBytes, operationKey } from './StandardExpenseProcessor';
import type { IExpenseFieldBindings, IStandardRestPlan } from './SharePointStandardPlans';
import { assertDedicatedFields, attachment, conditionalUpdate, createExpenseLine, TEST_SITE } from './SharePointStandardPlans';
import { row, serverEtag, SharePointRequestReader } from './SharePointRequestReader';
import type { IStandardStoreIO } from './StandardStoreTransport';

/** Deployment-owned bindings, never accepted from a request or UI. These names
 * describe required schemas, not existing/provisioned lists or permissions.
 * All-writer CAS, unique keys, immutable requests/results/audit and raw ACLs
 * must be independently qualified before a connection is composed. */
export interface IStandardStoreSchema {
  readonly lists: Readonly<Record<'requests' | 'operations' | 'results' | 'audit' | 'expenses' | 'claims' | 'people' | 'months' | 'nominals', string>>;
  readonly expense: IExpenseFieldBindings;
  readonly fingerprint: string; readonly reservation: string; readonly checkpoint: string;
  readonly personUser: string; readonly personActive: string; readonly personActiveValue: boolean | number;
  readonly nominalEligible: string; readonly nominalEligibleValue: number;
}
interface Reservation { mode: 'Creating' | 'Rejecting'; key: string; originalEtag: string; }
interface Parent { data: Record<string, unknown>; etag: string; reservation?: Reservation; }
interface LedgerRow { data: Record<string, unknown>; etag: string; value: IOperationLedger; }
const headers = { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' };
const keyPattern = /^\d+:[A-Za-z0-9-]{16,80}$/;
function id(value: unknown): number { if (!positiveId(value)) throw new Error('INVALID_ID'); return value; }
function key(value: string): string { if (!keyPattern.test(value)) throw new Error('INVALID_KEY'); return value; }
function field(value: string): string { if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)) throw new Error('UNQUALIFIED_FIELD'); return value; }
function money(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('INVALID_TOTAL');
  const p = Math.round(value * 100); if (!Number.isSafeInteger(p)) throw new Error('INVALID_TOTAL'); return p;
}
export function listRoot(guid: string): string {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(guid)) throw new Error('UNQUALIFIED_LIST');
  return `${TEST_SITE}/_api/web/lists(guid'${guid}')`;
}
function get(url: string): IStandardRestPlan { return { method: 'GET', url, headers, retry: 'none' }; }
function post(url: string, body: Record<string, unknown>): IStandardRestPlan { return { method: 'POST', url, headers, body, retry: 'none' }; }
function token(data: Record<string, unknown>, header?: string): string {
  const a = Object.getOwnPropertyDescriptor(data, '@odata.etag')?.value;
  const b = Object.getOwnPropertyDescriptor(data, 'odata.etag')?.value;
  const values = [header, a, b].filter(v => v !== undefined);
  if (!values.length || values.some(v => v !== values[0])) throw new Error('AMBIGUOUS_ETAG'); return serverEtag(values[0]);
}
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function sameReservation(a: Reservation | undefined, b: Reservation): boolean {
  return !!a && a.mode === b.mode && a.key === b.key && a.originalEtag === b.originalEtag;
}

/** Concrete REST-backed store for the reviewed processor. No Map-backed
 * persistence, fabricated actor or network retry. Executor is a server-side
 * Standard action boundary; there is still no deployed flow/connection here. */
export class SharePointStandardStore implements IStandardProcessorStore {
  private readonly schema: IStandardStoreSchema;
  private readonly requests: SharePointRequestReader;
  public constructor(private readonly io: IStandardStoreIO, schema: IStandardStoreSchema) {
    this.schema = JSON.parse(JSON.stringify(schema)) as IStandardStoreSchema;
    const s = this.schema;
    Object.values(s.lists).forEach(listRoot);
    if (new Set(Object.values(s.lists).map(v => v.toLowerCase())).size !== 9) throw new Error('ALIASED_LISTS');
    [s.fingerprint, s.reservation, s.checkpoint, s.personUser, s.personActive, s.nominalEligible].forEach(field);
    assertDedicatedFields([s.reservation, s.checkpoint], 'parent');
    assertDedicatedFields([s.expense.reason, s.expense.originator, s.expense.requestId, s.expense.canonicalOperation, s.expense.receiptManifest, s.fingerprint], 'expense');
    if (typeof s.expense.receiptRequiredForFile !== 'boolean' || typeof s.expense.receiptRequiredForNoReceipt !== 'boolean' ||
        ![true, false, 0, 1].includes(s.personActiveValue) || !Number.isFinite(s.nominalEligibleValue)) throw new Error('UNQUALIFIED_BINDINGS');
    this.requests = new SharePointRequestReader(io, s.lists.requests);
  }
  private async item(list: string, itemId: number, fields: readonly string[]): Promise<{ data: Record<string, unknown>; etag: string }> {
    const response = await this.io.execute(get(`${listRoot(list)}/items(${id(itemId)})?$select=${['Id', ...fields].join(',')}`));
    if (response.status !== 200) throw new Error('ITEM_UNAVAILABLE');
    const raw = response.body as Record<string, unknown>, data = row(raw, ['Id', ...fields]);
    if (data.Id !== itemId) throw new Error('ITEM_ID_MISMATCH'); return { data, etag: token(raw, response.etag) };
  }
  private async collection(list: string, query: string, cap: number): Promise<Record<string, unknown>[]> {
    const r = await this.io.execute(get(`${listRoot(list)}/items?${query}&$top=${cap}`));
    if (r.status !== 200) throw new Error('COLLECTION_UNAVAILABLE');
    const data = row(r.body, ['value']);
    if (!Array.isArray(data.value) || data.value.length >= cap ||
        ['@odata.nextLink', 'odata.nextLink', '__next'].some(k => Object.prototype.hasOwnProperty.call(r.body, k))) throw new Error('INCOMPLETE_COLLECTION');
    return data.value.map(v => { row(v, ['Id']); return v as Record<string, unknown>; });
  }
  private async unique(list: string, keyField: string, expected: string): Promise<Record<string, unknown> | undefined> {
    field(keyField);
    // All keys here are generated identifiers, never free-form OData content.
    if (!/^[A-Za-z0-9:-]{1,160}$/.test(expected)) throw new Error('INVALID_LOOKUP_KEY');
    const values = await this.collection(list, `$filter=${keyField} eq '${expected}'`, 2);
    if (!values.length) return undefined;
    const result = values[0]; if (row(result, [keyField])[keyField] !== expected) throw new Error('LOOKUP_MISMATCH'); token(result); return result;
  }
  private async createUnique(list: string, keyField: string, expected: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const before = await this.unique(list, keyField, expected); if (before) return before;
    const result = await this.io.execute(post(`${listRoot(list)}/items`, body));
    if (![200, 201, 409].includes(result.status)) throw new Error('CREATE_UNCONFIRMED');
    const after = await this.unique(list, keyField, expected); if (!after) throw new Error('CREATE_UNCONFIRMED'); return after;
  }
  private async cas(list: string, itemId: number, etag: string, body: Record<string, unknown>): Promise<boolean> {
    const r = await this.io.execute(conditionalUpdate(list, itemId, etag, body));
    if (r.status === 412) return false; if (r.status !== 204) throw new Error('CAS_UNCONFIRMED'); return true;
  }
  public readRequest(requestId: number): Promise<ISealedRequest> { return this.requests.read(requestId); }
  private async parent(parentId: number): Promise<Parent> {
    const s = this.schema, p = await this.item(s.lists.claims, parentId,
      ['ClaimantRecordId', 'ClaimMonthRecordId', 'ClaimMonth', 'SubmissionStatus', 'ExpenseTotal', 'MileageTotal', 'OverallTotal', 'SubmissionVersion', s.reservation, s.checkpoint]);
    const raw = p.data[s.reservation]; let reservation: Reservation | undefined;
    if (raw !== null && raw !== '') {
      if (typeof raw !== 'string') throw new Error('INVALID_RESERVATION');
      const v = own(JSON.parse(raw), ['mode', 'key', 'originalEtag']);
      if ((v.mode !== 'Creating' && v.mode !== 'Rejecting') || typeof v.key !== 'string') throw new Error('INVALID_RESERVATION');
      reservation = { mode: v.mode, key: key(v.key), originalEtag: serverEtag(v.originalEtag) };
    }
    return { ...p, reservation };
  }
  public async readPolicy(actor: number, parentId: number): Promise<{ state: 'Ready'; policy: IServerPolicy }> {
    const s = this.schema, p = await this.parent(parentId);
    const person = await this.item(s.lists.people, id(p.data.ClaimantRecordId), [s.personUser, s.personActive]);
    const month = await this.item(s.lists.months, id(p.data.ClaimMonthRecordId), ['ClaimMonth', 'MonthStatus']);
    if (typeof p.data.ClaimMonth !== 'string' || p.data.ClaimMonth !== month.data.ClaimMonth) throw new Error('MONTH_BINDING');
    const master = await this.collection(s.lists.nominals, `$select=Id,field_1,field_2,${s.nominalEligible}`, 196);
    const nominals = master.map(v => { const n = row(v, ['field_1', 'field_2', s.nominalEligible]);
      if (typeof n.field_1 !== 'string' || typeof n.field_2 !== 'string' || typeof n[s.nominalEligible] !== 'number') throw new Error('NOMINAL_CONTRACT');
      return { code: n.field_1, description: n.field_2, eligible: n[s.nominalEligible] === s.nominalEligibleValue }; });
    return { state: 'Ready', policy: { actorId: id(actor), parentId, ownerId: id(person.data[s.personUser]), parentEtag: p.etag,
      month: p.data.ClaimMonth, status: p.data.SubmissionStatus === 'Draft' ? 'Draft' : 'Locked',
      active: person.data[s.personActive] === s.personActiveValue, monthOpen: month.data.MonthStatus === 'Open',
      nominals: nominals.map(n => ({ code: n.code, description: n.description })), eligibleCodes: nominals.filter(n => n.eligible).map(n => n.code) } };
  }
  /** Resolve one protected roster member and one Draft for the selected month.
   * No actor/parent mapping is taken from browser storage or request fields.
   * Filters select candidates; exact returned values and cardinality still have
   * to match. Raw server ACLs and immutable roster ownership remain admission
   * requirements, not permissions conferred by this read-only resolver. */
  public async resolveOwnDraftParent(actor: number, month: string): Promise<number> {
    id(actor);
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('DRAFT_MONTH_HELD');
    const s = this.schema;
    const people = await this.collection(s.lists.people, `$select=Id,${s.personUser},${s.personActive}&$filter=${s.personUser} eq ${actor}`, 2);
    if (people.length !== 1) throw new Error('ROSTER_AMBIGUOUS');
    const person = row(people[0], ['Id', s.personUser, s.personActive]);
    if (person[s.personUser] !== actor || person[s.personActive] !== s.personActiveValue) throw new Error('ROSTER_HELD');
    const personId = id(person.Id);
    const parents = await this.collection(s.lists.claims,
      `$select=Id,ClaimantRecordId,ClaimMonth,SubmissionStatus&$filter=ClaimantRecordId eq ${personId} and ClaimMonth eq '${month}' and SubmissionStatus eq 'Draft'`, 2);
    if (parents.length !== 1) throw new Error('DRAFT_AMBIGUOUS');
    const parent = row(parents[0], ['Id', 'ClaimantRecordId', 'ClaimMonth', 'SubmissionStatus']);
    if (parent.ClaimantRecordId !== personId || parent.ClaimMonth !== month || parent.SubmissionStatus !== 'Draft') throw new Error('DRAFT_BINDING_HELD');
    return id(parent.Id);
  }
  private async ledger(keyValue: string): Promise<LedgerRow | undefined> {
    const raw = await this.unique(this.schema.lists.operations, 'OperationKey', key(keyValue)); if (!raw) return undefined;
    const d = row(raw, ['Id', 'OperationKey', 'RequestId', 'D01ActorId', 'ParentId', 'State', 'ResultId']);
    if (!['Pending', 'Completed', 'Rejected'].includes(d.State as string)) throw new Error('INVALID_LEDGER');
    let record: IStoredExpense | undefined;
    if (d.State !== 'Pending') {
      const result = await this.item(this.schema.lists.results, id(d.ResultId), ['OperationKey', 'RequestId', 'D01ActorId', 'ParentId', 'State', 'RecordJson']);
      for (const f of ['OperationKey', 'RequestId', 'D01ActorId', 'ParentId', 'State']) if (result.data[f] !== d[f]) throw new Error('RESULT_BINDING');
      if (d.State === 'Completed') { if (typeof result.data.RecordJson !== 'string') throw new Error('INVALID_RESULT'); record = snapshotStored(JSON.parse(result.data.RecordJson)); }
      // SharePoint returns an empty multiline field as null. This exception is
      // only for a Rejected result; a Completed record must remain exact JSON.
      else if (result.data.RecordJson !== '' && result.data.RecordJson !== null) throw new Error('INVALID_REJECTION');
    } else if (d.ResultId !== null && d.ResultId !== 0) throw new Error('INVALID_PENDING_RESULT');
    return { data: d, etag: token(raw), value: { key: keyValue, requestId: id(d.RequestId), originatorId: id(d.D01ActorId), parentId: id(d.ParentId), state: d.State as IOperationLedger['state'], ...(record ? { record } : {}) } };
  }
  public async findOperation(k: string): Promise<IOperationLedger | undefined> { return (await this.ledger(k))?.value; }
  public async operationReleased(parentId: number, k: string): Promise<boolean> { return (await this.parent(parentId)).reservation?.key !== k; }
  /** New creation needs the whole parent free, not merely another operation's
   * reservation. The retained checkpoint is valid history, not an active lock. */
  public async creationParentAvailable(parentId: number, expectedEtag: string): Promise<boolean> {
    const p = await this.parent(parentId); return !p.reservation && p.etag === serverEtag(expectedEtag);
  }
  /** Complete bounded discovery, under the caller's real raw ACLs. No proposed
   * ParentId library column: the parent is read from each sealed request body. */
  public async ownRequestIds(actor: number): Promise<readonly number[]> {
    const values = await this.collection(this.schema.lists.requests, `$select=Id,AuthorId&$filter=AuthorId eq ${id(actor)}`, 201);
    const ids = values.map(value => {
      const r = row(value, ['Id', 'AuthorId']);
      if (r.AuthorId !== actor) throw new Error('REQUEST_ACTOR_MISMATCH'); return id(r.Id);
    });
    if (new Set(ids).size !== ids.length) throw new Error('DUPLICATE_REQUEST_IDS'); return ids.sort((a, b) => a - b);
  }
  public async ownHistory(actor: number, parentId: number): Promise<IOperationLedger[]> {
    const values = await this.collection(this.schema.lists.operations, `$select=Id,OperationKey&$filter=D01ActorId eq ${id(actor)} and ParentId eq ${id(parentId)}`, 201);
    const history: IOperationLedger[] = [];
    for (const value of values) {
      const k = row(value, ['OperationKey']).OperationKey;
      if (typeof k !== 'string' || !k.startsWith(`${actor}:`)) throw new Error('HISTORY_ACTOR_MISMATCH');
      const op = await this.findOperation(k);
      if (!op || op.originatorId !== actor || op.parentId !== parentId) throw new Error('HISTORY_BINDING'); history.push(op);
    }
    if (new Set(history.map(v => v.key)).size !== history.length) throw new Error('DUPLICATE_HISTORY'); return history;
  }
  public async reserveOperation(v: IOperationLedger): Promise<IOperationLedger> {
    if (v.state !== 'Pending' || v.record || !v.key.startsWith(`${id(v.originatorId)}:`)) throw new Error('INVALID_RESERVATION');
    await this.createUnique(this.schema.lists.operations, 'OperationKey', key(v.key), { Title: v.key, OperationKey: v.key,
      RequestId: id(v.requestId), D01ActorId: v.originatorId, ParentId: id(v.parentId), State: 'Pending', ResultId: null });
    const stored = await this.ledger(v.key); if (!stored) throw new Error('LEDGER_UNAVAILABLE'); return stored.value;
  }
  public async acquireParent(parentId: number, expected: string, k: string): Promise<'Acquired' | 'Owned' | 'Busy' | 'Stale'> {
    key(k); serverEtag(expected); const p = await this.parent(parentId), held = p.reservation;
    if (held) return held.key === k && held.originalEtag === expected ? held.mode === 'Creating' ? 'Owned' : 'Stale' : 'Busy';
    if (p.etag !== expected) return 'Stale';
    const reservation: Reservation = { mode: 'Creating', key: k, originalEtag: expected };
    if (!await this.cas(this.schema.lists.claims, parentId, p.etag, { [this.schema.reservation]: JSON.stringify(reservation) })) return 'Busy';
    const after = await this.parent(parentId); if (!sameReservation(after.reservation, reservation)) throw new Error('CUSTODY_UNCONFIRMED'); return 'Acquired';
  }
  public async recheckParent(parentId: number, k: string, author: number, month: string): Promise<boolean> {
    const p = await this.parent(parentId), policy = await this.readPolicy(author, parentId);
    return p.reservation?.key === k && p.reservation.mode === 'Creating' && policy.policy.ownerId === author && policy.policy.active &&
      policy.policy.month === month && policy.policy.monthOpen && policy.policy.status === 'Draft';
  }
  private decodeLine(raw: Record<string, unknown>, etag?: string): IStoredExpense {
    const s = this.schema, e = s.expense;
    const d = row(raw, ['Id', 'ExpenseLineKey', 'ClaimSubmissionRefId', 'ExpenseDate', 'Supplier', 'ExpenseDescription', 'NominalCode', 'NominalDescription',
      'GrossAmount', 'ClaimantNotes', 'IsVoided', e.reason, e.receiptManifest, e.canonicalOperation, s.fingerprint]);
    if (typeof d[e.canonicalOperation] !== 'string' || !hash(d[s.fingerprint]) || typeof d.ExpenseDate !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(d.ExpenseDate)) throw new Error('INVALID_LINE');
    const op = key(d[e.canonicalOperation] as string).split(':')[1], itemId = id(d.Id);
    let receipt: unknown;
    if (d[e.receiptManifest] === null || d[e.receiptManifest] === '') receipt = { kind: 'none', reason: d[e.reason] };
    else {
      if (typeof d[e.receiptManifest] !== 'string' || (d[e.reason] !== null && d[e.reason] !== '')) throw new Error('INVALID_RECEIPT_BINDING');
      const manifest = own(JSON.parse(d[e.receiptManifest] as string), ['fileName', 'mediaType', 'size', 'clientSha256']);
      receipt = { kind: 'file', expenseId: itemId, fileName: manifest.fileName, mediaType: manifest.mediaType, size: manifest.size,
        sha256: manifest.clientSha256, storage: { kind: 'list-attachment' } };
    }
    return snapshotStored({ operationId: op, requestFingerprint: d[s.fingerprint], etag: etag || token(raw),
      line: { id: itemId, parentId: d.ClaimSubmissionRefId, expenseLineKey: d.ExpenseLineKey, dateIso: d.ExpenseDate.slice(0, 10), supplier: d.Supplier,
        description: d.ExpenseDescription, nominalCode: d.NominalCode, nominalDescription: d.NominalDescription, amountPence: money(d.GrossAmount), notes: d.ClaimantNotes === null ? '' : d.ClaimantNotes, isVoided: d.IsVoided }, receipt });
  }
  private lineFields(): string[] { const s = this.schema; return ['ExpenseLineKey', 'ClaimSubmissionRefId', 'ExpenseDate', 'Supplier', 'ExpenseDescription', 'NominalCode', 'NominalDescription',
    'GrossAmount', 'ClaimantNotes', 'IsVoided', ...Object.values(s.expense).filter(v => typeof v === 'string') as string[], s.fingerprint]; }
  public async findLine(k: string): Promise<IStoredExpense | undefined> {
    const raw = await this.unique(this.schema.lists.expenses, this.schema.expense.canonicalOperation, key(k)); return raw && this.decodeLine(raw);
  }
  public async readLine(itemId: number): Promise<IStoredExpense> {
    const r = await this.item(this.schema.lists.expenses, itemId, this.lineFields()); return this.decodeLine(r.data, r.etag);
  }
  public async createLineUnique(k: string, request: ISealedRequest, description: string): Promise<IStoredExpense> {
    if (k !== operationKey(request.authorId, request.command.operationId)) throw new Error('REQUEST_KEY');
    const p = await this.parent(request.command.parentId);
    if (p.reservation?.key !== k || p.reservation.mode !== 'Creating' || p.reservation.originalEtag !== request.command.parentEtag) throw new Error('NO_CREATION_CUSTODY');
    const op = await this.ledger(k); if (!op || op.value.state !== 'Pending' || op.value.requestId !== request.id) throw new Error('NO_PENDING_OPERATION');
    const plan = createExpenseLine(this.schema.lists.expenses, request, description, this.schema.expense);
    const body = { ...plan.body as Record<string, unknown>, [this.schema.fingerprint]: request.clientFingerprint };
    return this.decodeLine(await this.createUnique(this.schema.lists.expenses, this.schema.expense.canonicalOperation, k, body));
  }
  public async verifyLineProvenance(record: IStoredExpense, original: ISealedRequest): Promise<boolean> {
    const e = this.schema.expense, r = await this.item(this.schema.lists.expenses, record.line.id, [e.originator, e.requestId, e.canonicalOperation, 'ClaimSubmissionRefId']);
    return r.data[e.originator] === original.authorId && r.data[e.requestId] === original.id && r.data[e.canonicalOperation] === operationKey(original.authorId, original.command.operationId) && r.data.ClaimSubmissionRefId === original.command.parentId;
  }
  public async readReceipt(record: IStoredExpense): Promise<Uint8Array | undefined> {
    if (record.receipt.kind === 'none') return undefined;
    const r = record.receipt, files = await this.io.execute(get(`${listRoot(this.schema.lists.expenses)}/items(${id(record.line.id)})/AttachmentFiles?$select=FileName&$top=2`));
    if (files.status !== 200) throw new Error('ATTACHMENTS_UNAVAILABLE');
    const collection = row(files.body, ['value']);
    if (!Array.isArray(collection.value) || collection.value.length > 1 || ['@odata.nextLink', 'odata.nextLink', '__next'].some(k => Object.prototype.hasOwnProperty.call(files.body, k))) throw new Error('UNEXPECTED_ATTACHMENTS');
    if (!collection.value.length) return undefined;
    if (row(collection.value[0], ['FileName']).FileName !== r.fileName || r.expenseId !== record.line.id) throw new Error('RECEIPT_LINKAGE');
    return this.io.binary(attachment(this.schema.lists.expenses, record.line.id, r.fileName));
  }
  public async addReceiptNoOverwrite(record: IStoredExpense, bytes: Uint8Array): Promise<void> {
    if (record.receipt.kind !== 'file') throw new Error('NO_FILE_RECEIPT');
    const existing = await this.readReceipt(record); if (existing) { if (!equalBytes(existing, bytes)) throw new Error('RECEIPT_CONFLICT'); return; }
    const r = await this.io.execute(attachment(this.schema.lists.expenses, record.line.id, record.receipt.fileName, bytes));
    if (![200, 201, 409].includes(r.status)) throw new Error('RECEIPT_UNCONFIRMED');
    const after = await this.readReceipt(record); if (!after || !equalBytes(after, bytes)) throw new Error('RECEIPT_UNCONFIRMED');
  }
  public async appendAuditUnique(k: string, requestId: number, author: number, record: IStoredExpense): Promise<void> {
    const expected = { OperationKey: key(k), RequestId: id(requestId), D01ActorId: id(author), ParentId: record.line.parentId,
      ExpenseId: record.line.id, RecordJson: JSON.stringify(record), Event: 'ExpenseCreated' };
    const stored = await this.createUnique(this.schema.lists.audit, 'OperationKey', k, { Title: k, ...expected });
    if (!same(row(stored, Object.keys(expected)), expected)) throw new Error('AUDIT_CONFLICT');
    const stamp = row(stored, ['Created', 'AuthorId']);
    if (typeof stamp.Created !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?Z$/.test(stamp.Created) ||
        !Number.isFinite(Date.parse(stamp.Created)) || !positiveId(stamp.AuthorId)) throw new Error('AUDIT_STAMP_UNCONFIRMED');
  }
  private async terminal(op: LedgerRow, state: 'Completed' | 'Rejected', record?: IStoredExpense): Promise<void> {
    const v = op.value, expected = { OperationKey: v.key, RequestId: v.requestId, D01ActorId: v.originatorId, ParentId: v.parentId,
      State: state, RecordJson: record ? JSON.stringify(record) : '' };
    const result = await this.createUnique(this.schema.lists.results, 'OperationKey', v.key, { Title: v.key, ...expected });
    const actual = row(result, Object.keys(expected));
    if (state === 'Rejected' && actual.RecordJson === null) actual.RecordJson = '';
    if (!same(actual, expected)) throw new Error('RESULT_CONFLICT');
    if (!await this.cas(this.schema.lists.operations, id(op.data.Id), op.etag, { State: state, ResultId: id(result.Id) })) {
      const current = await this.ledger(v.key);
      if (!current || current.value.state !== state || !same(current.value.record, record)) throw new Error('TERMINAL_CONFLICT');
    }
    const after = await this.ledger(v.key);
    if (!after || after.value.state !== state || !same(after.value.record, record)) throw new Error('TERMINAL_UNCONFIRMED');
  }
  public async completeOperation(k: string, record: IStoredExpense): Promise<void> {
    const op = await this.ledger(k); if (!op) throw new Error('LEDGER_UNAVAILABLE');
    if (op.value.state === 'Completed') { if (!same(op.value.record, record)) throw new Error('COMPLETION_CONFLICT'); return; }
    if (op.value.state !== 'Pending') throw new Error('OPERATION_REJECTED');
    const p = await this.parent(op.value.parentId), s = this.schema;
    if (p.reservation?.key !== k || p.reservation.mode !== 'Creating' || p.data.SubmissionStatus !== 'Draft') throw new Error('NO_COMPLETION_CUSTODY');
    if (p.data[s.checkpoint] !== k) {
      const expense = money(p.data.ExpenseTotal), mileage = money(p.data.MileageTotal), overall = money(p.data.OverallTotal), version = p.data.SubmissionVersion;
      const nextVersion = (version as number) + 1;
      if (expense + mileage !== overall || !Number.isSafeInteger(version) || (version as number) < 0 || !Number.isSafeInteger(nextVersion) ||
          !Number.isSafeInteger(overall + record.line.amountPence)) throw new Error('PARENT_TOTALS_CONFLICT');
      if (!await this.cas(s.lists.claims, op.value.parentId, p.etag, { ExpenseTotal: (expense + record.line.amountPence) / 100,
        OverallTotal: (overall + record.line.amountPence) / 100, SubmissionVersion: nextVersion, [s.checkpoint]: k })) throw new Error('PARENT_COMMIT_CONFLICT');
    }
    const after = await this.parent(op.value.parentId); if (after.reservation?.key !== k || after.data[s.checkpoint] !== k) throw new Error('PARENT_COMMIT_UNCONFIRMED');
    await this.terminal(op, 'Completed', record);
  }
  public async rejectUnwrittenStale(parentId: number, originalEtag: string, k: string): Promise<boolean> {
    let p = await this.parent(parentId);
    const rejection: Reservation = { key: key(k), originalEtag: serverEtag(originalEtag), mode: 'Rejecting' };
    if (p.reservation && !sameReservation(p.reservation, rejection)) return false;
    if (!p.reservation) {
      if (p.etag === originalEtag || !await this.cas(this.schema.lists.claims, parentId, p.etag, { [this.schema.reservation]: JSON.stringify(rejection) })) return false;
      p = await this.parent(parentId); if (!sameReservation(p.reservation, rejection)) throw new Error('REJECTION_CUSTODY_UNCONFIRMED');
    }
    const op = await this.ledger(k);
    if (!op || op.value.parentId !== parentId || op.value.state !== 'Pending' || await this.findLine(k)) return false;
    await this.terminal(op, 'Rejected'); await this.releaseParent(parentId, k); return true;
  }
  public async releaseParent(parentId: number, k: string): Promise<void> {
    const p = await this.parent(parentId); if (!p.reservation) return;
    if (p.reservation.key !== k) return; // never release a subsequent operation
    const op = await this.ledger(k);
    if (!op || op.value.parentId !== parentId || (p.reservation.mode === 'Creating' ? op.value.state !== 'Completed' : op.value.state !== 'Rejected')) throw new Error('RELEASE_NOT_TERMINAL');
    if (!await this.cas(this.schema.lists.claims, parentId, p.etag, { [this.schema.reservation]: '' })) throw new Error('RELEASE_CONFLICT');
    const after = await this.parent(parentId); if (after.reservation?.key === k) throw new Error('RELEASE_UNCONFIRMED');
  }
}
