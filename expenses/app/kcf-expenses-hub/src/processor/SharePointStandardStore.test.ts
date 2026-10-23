import { StandardExpenseProcessor } from './StandardExpenseProcessor';
import { SharePointStandardStore } from './SharePointStandardStore';
import type { IStandardStoreSchema } from './SharePointStandardStore';
import { StandardStoreIO } from './StandardStoreTransport';
import type { IStandardStoreTransport, IStandardTransportResponse } from './StandardStoreTransport';
import type { IStandardRestPlan } from './SharePointStandardPlans';
import { createExpenseLine, createUniqueOperation, conditionalUpdate, reserveParent, TEST_SITE } from './SharePointStandardPlans';
import { encodeRequest } from '../services/persistence/RequestLedgerExpensePort';
import { decodeRequest, RequestLedgerExpensePort } from '../services/persistence/RequestLedgerExpensePort';
import { SharePointRequestChannel, createBoundExpenseEntry, createStaffExpenseEntry } from './SharePointRequestChannel';
import type { IExpenseEntryDraft } from '../services/persistence/ExpenseEntryAdapter';
import { ExpensePersistenceService } from '../services/persistence/ExpensePersistenceService';
import { creationIdentity } from '../services/persistence/PersistenceContract';
import type { IPreparedExpense } from '../services/persistence/PersistenceContract';
import { nominalMaster } from '../data/nominals';

const crypto = jest.requireActual('crypto') as { createHash(name: string): { update(bytes: Uint8Array): { digest(format: string): string } } };
const digest = (bytes: Uint8Array): string => crypto.createHash('sha256').update(bytes).digest('hex');
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
type Raw = Record<string, unknown>;
const guid = (i: number): string => `${String(i).padStart(8, '0')}-1111-1111-1111-111111111111`;
const schema: IStandardStoreSchema = { lists: { requests: guid(1), operations: guid(2), results: guid(3), audit: guid(4), expenses: guid(5), claims: guid(6), people: guid(7), months: guid(8), nominals: guid(9) },
  expense: { reason: 'ProposedReason', originator: 'ProposedOriginatorId', requestId: 'ProposedRequestId', canonicalOperation: 'ProposedOperation', receiptManifest: 'ProposedManifest', receiptRequiredForFile: true, receiptRequiredForNoReceipt: false },
  fingerprint: 'ProposedFingerprint', reservation: 'ProposedReservation', checkpoint: 'ProposedCheckpoint', personUser: 'ProposedUserId', personActive: 'ProposedActive', personActiveValue: true,
  nominalEligible: 'field_4', nominalEligibleValue: 1 };
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
const jpg = new Uint8Array([255, 216, 255, 1, 2]);
const pdf = new TextEncoder().encode('%PDF-1.4\nSynthetic\n%%EOF');
function command(bytes?: Uint8Array, ext = 'png', op = 'expense-synthetic-operation-0001', etag = '"1"'): IPreparedExpense {
  return { operationId: op, parentId: 101, parentEtag: etag, date: '21-10-2026', supplier: 'Fictional shop', description: 'Synthetic source test',
    nominalCode: '00010', amount: '12.34', notes: 'Kept notes', receipt: bytes ? { kind: 'file', fileName: `receipt.${ext}`, mediaType: ext === 'jpg' ? 'image/jpeg' : ext === 'pdf' ? 'application/pdf' : 'image/png', bytes, sha256: digest(bytes) } : { kind: 'none', reason: 'Synthetic missing receipt' } };
}
function stream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  let i = 0; return new ReadableStream({ pull(controller) { if (i >= bytes.length) controller.close(); else { controller.enqueue(bytes.slice(i, i + 8192)); i += 8192; } } });
}

/** Deterministic fake SharePoint HTTP server. Real store/processor run unchanged:
 * queries, system metadata, unique constraints, attachment ETags, CAS and lost
 * acknowledgements are simulated at transport level. This is NOT tenant ACL QA. */
class FakeSharePoint implements IStandardStoreTransport {
  public tables = new Map<string, Map<number, Raw>>(); public requestBytes = new Map<number, Uint8Array>();
  public attachments = new Map<number, { name: string; bytes: Uint8Array }>(); public calls: IStandardRestPlan[] = [];
  public crash = ''; public before?: (plan: IStandardRestPlan) => void;
  public identityOverride?: Raw; public deferProcessor = false;
  public transform?: (plan: IStandardRestPlan, data: unknown) => unknown;
  public nativeSystemFields = true;
  public constructor() {
    Object.values(schema.lists).forEach(g => this.tables.set(g, new Map()));
    this.put('claims', 101, { ClaimantRecordId: 11, ClaimMonthRecordId: 10, ClaimMonth: '2026-10', SubmissionStatus: 'Draft',
      ExpenseTotal: 0, MileageTotal: 9, OverallTotal: 9, SubmissionVersion: 0, ProposedReservation: '', ProposedCheckpoint: '' });
    this.put('people', 11, { ProposedUserId: 11, ProposedActive: true }); this.put('months', 10, { ClaimMonth: '2026-10', MonthStatus: 'Open' });
    nominalMaster.forEach((n, i) => this.put('nominals', i + 1, { field_1: n.code, field_2: n.description, field_4: 1 }));
  }
  public put(name: keyof IStandardStoreSchema['lists'], itemId: number, data: Raw): void { this.tables.get(schema.lists[name])!.set(itemId, { ...data, Id: itemId, 'odata.etag': '"1"' }); }
  public table(name: keyof IStandardStoreSchema['lists']): Map<number, Raw> { return this.tables.get(schema.lists[name])!; }
  public parent(): Raw { return this.table('claims').get(101)!; }
  public bump(r: Raw): void { r['odata.etag'] = `"${Number(String(r['odata.etag']).slice(1, -1)) + 1}"`; }
  private fail(stage: string): void { if (this.crash === stage) { this.crash = ''; throw new Error('private server error'); } }
  public request(c = command(), actor = 11): number {
    const id = this.table('requests').size + 1; const bytes = encodeRequest(c, digest(new TextEncoder().encode(creationIdentity(c))));
    this.requestBytes.set(id, bytes);
    this.put('requests', id, { AuthorId: actor, EditorId: actor, OData__UIVersionString: '1.0', File: { UniqueId: guid(100 + id), Length: String(bytes.length), ETag: '"file-1"', Name: c.operationId + '.json' } }); return id;
  }
  public store(): SharePointStandardStore { return new SharePointStandardStore(new StandardStoreIO(this), schema); }
  public processor(): StandardExpenseProcessor { return new StandardExpenseProcessor(this.store()); }
  public caller(actor: number): IStandardStoreTransport {
    return { send: async plan => {
      if (plan.url === TEST_SITE + '/_api/web/currentuser?$select=Id' || plan.url === TEST_SITE + '/_api/web/currentuser?$select=Id,IsSiteAdmin') {
        return this.response(plan, 200, this.identityOverride || { Id: actor, IsSiteAdmin: false });
      }
      if (plan.method === 'POST' && plan.url.includes('/Files/AddUsingPath')) {
        if (!decodeURIComponent(plan.url).includes(`decodedurl='/sites/REVIEW-TEST-SITE/ProposedRequests/${actor}'`)) return this.response(plan, 403);
        const payload = decodeRequest(plan.body as Uint8Array);
        if (Array.from(this.table('requests').values()).some(r => r.AuthorId === actor && (r.File as Raw).Name === payload.command.operationId + '.json')) return this.response(plan, 409);
        const request = this.request(payload.command, actor); this.calls.push(plan);
        if (!this.deferProcessor) await this.processor().process(request); return this.response(plan, 201, {});
      }
      if (plan.method !== 'GET') return this.response(plan, 403); // employee cannot mutate financial/protected lists
      const match = /lists\(guid'([^']+)'\)\/items(?:\((\d+)\))?/.exec(plan.url);
      if (!match) return this.response(plan, 403);
      const [, list, rawId] = match, r = this.tables.get(list)?.get(Number(rawId));
      if (rawId) {
        const owner = list === schema.lists.requests ? r?.AuthorId : list === schema.lists.expenses ? r?.ProposedOriginatorId
          : list === schema.lists.operations || list === schema.lists.results || list === schema.lists.audit ? r?.D01ActorId
            : list === schema.lists.claims ? this.table('people').get(Number(r?.ClaimantRecordId))?.ProposedUserId
              : list === schema.lists.people ? r?.ProposedUserId : actor;
        if (owner !== actor) return this.response(plan, 403);
      } else if (list === schema.lists.operations || list === schema.lists.results || list === schema.lists.audit || list === schema.lists.expenses || list === schema.lists.requests || list === schema.lists.people || list === schema.lists.claims) {
        // Fake raw security trimming is separate from the channel's filters.
        const old = this.tables.get(list)!;
        const allowed = new Map(Array.from(old).filter(([, value]) => (list === schema.lists.requests ? value.AuthorId : list === schema.lists.expenses ? value.ProposedOriginatorId
          : list === schema.lists.people ? value.ProposedUserId : list === schema.lists.claims ? this.table('people').get(Number(value.ClaimantRecordId))?.ProposedUserId : value.D01ActorId) === actor));
        this.tables.set(list, allowed); try { return await this.send(plan); } finally { this.tables.set(list, old); }
      }
      return this.send(plan);
    } };
  }
  public channel(actor = 11): SharePointRequestChannel {
    const io = new StandardStoreIO(this.caller(actor)); return new SharePointRequestChannel(io, new SharePointStandardStore(io, schema), '/sites/REVIEW-TEST-SITE/ProposedRequests');
  }
  public service(actor = 11): ExpensePersistenceService {
    const hashBytes = async (b: Uint8Array): Promise<string> => digest(b);
    return new ExpensePersistenceService(new RequestLedgerExpensePort(this.channel(actor), hashBytes), hashBytes);
  }
  public entry(actor = 11): ReturnType<typeof createBoundExpenseEntry> {
    return createBoundExpenseEntry(this.channel(actor), 101, 11, async b => digest(b));
  }
  private response(plan: IStandardRestPlan, status: number, data?: unknown, etag?: string, bytes?: Uint8Array): IStandardTransportResponse {
    const value = this.transform ? this.transform(plan, data) : data;
    return { status, url: plan.url, redirected: false, etag, body: stream(bytes || new TextEncoder().encode(JSON.stringify(value ?? {}))) };
  }
  public async send(plan: IStandardRestPlan): Promise<IStandardTransportResponse> {
    this.calls.push(plan); this.before?.(plan);
    if (this.nativeSystemFields && plan.method === 'POST' && plan.body && Object.keys(plan.body).some(k => /^OriginatorId$/i.test(k))) return this.response(plan, 400);
    const parsed = /lists\(guid'([^']+)'\)\/items(?:\((\d+)\))?(.*)$/.exec(plan.url); if (!parsed) throw new Error('UNEXPECTED_ENDPOINT');
    const [, list, rawId, suffix] = parsed, rows = this.tables.get(list); if (!rows) return this.response(plan, 404);
    const itemId = Number(rawId), current = rows.get(itemId);
    if (suffix === '/File/$value') return this.response(plan, this.requestBytes.has(itemId) ? 200 : 404, undefined, undefined, this.requestBytes.get(itemId));
    if (suffix.includes('/AttachmentFiles')) {
      if (!current) return this.response(plan, 404);
      const file = this.attachments.get(itemId);
      if (plan.method === 'POST') {
        if (file) return this.response(plan, 409);
        const name = decodeURIComponent(/FileName='([^']+)'/.exec(suffix)![1]);
        this.attachments.set(itemId, { name, bytes: new Uint8Array(plan.body as Uint8Array) }); this.bump(current); this.fail('receipt'); return this.response(plan, 201, {});
      }
      if (suffix.endsWith('/$value')) return this.response(plan, file ? 200 : 404, undefined, undefined, file?.bytes);
      return this.response(plan, 200, { value: file ? [{ FileName: file.name }] : [] });
    }
    if (plan.headers['X-HTTP-Method'] === 'MERGE') {
      if (!current) return this.response(plan, 404);
      if (plan.headers['IF-MATCH'] !== current['odata.etag']) return this.response(plan, 412);
      const body = plan.body as Raw; Object.assign(current, clone(body)); this.bump(current);
      if ('ProposedCheckpoint' in body) this.fail('parent-commit');
      else if (body.ProposedReservation === '') this.fail('release');
      else if ('ProposedReservation' in body) this.fail('reservation');
      if (body.State === 'Completed') this.fail('ledger-complete');
      if (body.State === 'Rejected') this.fail('ledger-reject');
      return this.response(plan, 204);
    }
    if (plan.method === 'POST') {
      const body = clone(plan.body as Raw), uniqueField = list === schema.lists.expenses ? 'ProposedOperation' : 'OperationKey';
      if (Array.from(rows.values()).some(r => r[uniqueField] === body[uniqueField])) return this.response(plan, 409);
      const newId = rows.size + 1;
      if (list === schema.lists.expenses) body.ExpenseDate = String(body.ExpenseDate) + 'T00:00:00Z';
      const created = { Id: newId, ...body, Created: '2026-10-21T14:30:00Z', AuthorId: 99, 'odata.etag': '"1"' }; rows.set(newId, created);
      this.fail(list === schema.lists.expenses ? 'line' : list === schema.lists.operations ? 'ledger' : list === schema.lists.results ? 'result' : 'audit');
      return this.response(plan, 201, created, '"1"');
    }
    if (rawId) return current ? this.response(plan, 200, clone(current), String(current['odata.etag'])) : this.response(plan, 404);
    const query = new URL(plan.url).searchParams, filter = query.get('$filter'); let values = Array.from(rows.values());
    if (filter) {
      const actorParent = /^D01ActorId eq (\d+) and ParentId eq (\d+)$/.exec(filter);
      const author = /^AuthorId eq (\d+)$/.exec(filter);
      const roster = /^ProposedUserId eq (\d+)$/.exec(filter);
      const draft = /^ClaimantRecordId eq (\d+) and ClaimMonth eq '(20\d{2}-\d{2})' and SubmissionStatus eq 'Draft'$/.exec(filter);
      if (actorParent) values = values.filter(r => r.D01ActorId === Number(actorParent[1]) && r.ParentId === Number(actorParent[2]));
      else if (author) values = values.filter(r => r.AuthorId === Number(author[1]));
      else if (roster) values = values.filter(r => r.ProposedUserId === Number(roster[1]));
      else if (draft) values = values.filter(r => r.ClaimantRecordId === Number(draft[1]) && r.ClaimMonth === draft[2] && r.SubmissionStatus === 'Draft');
      else { const match = /^([A-Za-z0-9_]+) eq '([A-Za-z0-9:-]+)'$/.exec(filter); if (!match) throw new Error('UNEXPECTED_FILTER'); values = values.filter(r => r[match[1]] === match[2]); }
    }
    return this.response(plan, 200, { value: clone(values.slice(0, Number(query.get('$top')))) });
  }
}

describe('concrete SharePoint Standard store through HTTP protocol (synthetic)', () => {
  it.each([11, 22, 240])('same staff composition discovers actor %s and their own Draft without fixed IDs', async actor => {
    const t = new FakeSharePoint();
    t.put('people', 800, { ProposedUserId: actor, ProposedActive: true });
    if (actor === 11) t.table('people').delete(11);
    t.put('claims', 900, { ...t.parent(), ClaimantRecordId: 800 });
    if (actor === 11) t.table('claims').delete(101);
    const entry = createStaffExpenseEntry(t.channel(actor), () => '2026-10', async b => digest(b));
    const result = await entry.load(); expect(result.state).toBe('Ready');
    if (result.state === 'Ready') expect(result.context.parentId).toBe(900);
    expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it.each(['missing person', 'inactive', 'duplicate person', 'missing draft', 'duplicate draft', 'locked', 'other month', 'paged person', 'forged parent', 'changed actor'])('staff discovery holds %s without a write', async defect => {
    const t = new FakeSharePoint();
    if (defect === 'missing person') t.table('people').clear();
    if (defect === 'inactive') t.table('people').get(11)!.ProposedActive = false;
    if (defect === 'duplicate person') t.put('people', 12, { ProposedUserId: 11, ProposedActive: true });
    if (defect === 'missing draft') t.table('claims').clear();
    if (defect === 'duplicate draft') t.put('claims', 102, { ...t.parent() });
    if (defect === 'locked') t.parent().SubmissionStatus = 'Submitted';
    if (defect === 'other month') t.parent().ClaimMonth = '2026-11';
    if (defect === 'paged person') t.transform = (p, data) => p.url.includes('ProposedUserId%20eq') || p.url.includes('ProposedUserId eq') ? { ...data as Raw, '@odata.nextLink': 'unread' } : data;
    if (defect === 'forged parent') t.transform = (p, data) => p.url.includes('ClaimantRecordId') && p.url.includes('$filter') ? { value: [{ Id: 999, ClaimantRecordId: 22, ClaimMonth: '2026-10', SubmissionStatus: 'Draft' }] } : data;
    if (defect === 'changed actor') {
      let n = 0; t.transform = (p, data) => p.url.includes('currentuser') && ++n > 1 ? { Id: 22, IsSiteAdmin: false } : data;
    }
    expect((await createStaffExpenseEntry(t.channel(), () => '2026-10', async b => digest(b)).load()).state).toBe('Held');
    expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it.each(['2026-00', '2026-13', "2026-10' or 1 eq 1", 'October'])('staff discovery refuses invalid period %s', async month => {
    const t = new FakeSharePoint(); expect((await t.channel().readSignedInEntryContext(month)).state).toBe('Held');
    expect(t.calls).toHaveLength(0);
  });
  it('A/B independent synthetic Save, cold reopen same bytes and duplicate control use one composition', async () => {
    const t = new FakeSharePoint(); t.put('people', 22, { ProposedUserId: 22, ProposedActive: true });
    t.put('claims', 202, { ...t.parent(), ClaimantRecordId: 22 });
    for (const [actor, bytes, ext] of [[11, jpg, 'jpg'], [22, pdf, 'pdf']] as const) {
      const entry = createStaffExpenseEntry(t.channel(actor), () => '2026-10', async b => digest(b));
      const file = new File([bytes], `receipt.${ext}`, { type: ext === 'jpg' ? 'image/jpeg' : 'application/pdf' });
      const draft: IExpenseEntryDraft = { date: '21-10-2026', supplier: 'Synthetic shop', description: 'Two staff source integration', nominalCode: '00010', amount: '12.34', notes: '', receipt: { kind: 'file', file } };
      expect((await entry.save(draft)).state).toBe('ReadbackVerified');
      expect((await entry.save(draft)).state).toBe('ReadbackVerified');
      const lineId = actor === 11 ? 1 : 2;
      const cold = createStaffExpenseEntry(t.channel(actor), () => '2026-10', async b => digest(b));
      expect((await cold.reopen(lineId)).state).toBe('ReadbackVerified');
      const receipt = await cold.openReceipt(lineId); expect(receipt.state).toBe('ReceiptBytesVerified');
      if (receipt.state === 'ReceiptBytesVerified') expect(receipt.bytes).toEqual(bytes);
    }
    expect(t.table('expenses').size).toBe(2); expect(t.table('requests').size).toBe(2);
    expect(t.table('claims').get(101)!.ExpenseTotal).toBe(12.34); expect(t.table('claims').get(202)!.ExpenseTotal).toBe(12.34);
    for (const [actor, otherId] of [[11, 2], [22, 1]]) for (const name of ['expenses', 'requests', 'results', 'operations'] as const) {
      const response = await t.caller(actor).send({ method: 'GET', url: `${TEST_SITE}/_api/web/lists(guid'${schema.lists[name]}')/items(${otherId})`, headers: {}, retry: 'none' });
      expect(response.status).toBe(403);
    }
    // These 403s exercise the fake server's ACL model, NOT native SharePoint.
  });
  it.each([false, true])('an already resolved staff form cannot revive after another account (admin=%s)', async IsSiteAdmin => {
    const t = new FakeSharePoint(), channel = t.channel();
    t.put('people', 22, { ProposedUserId: 22, ProposedActive: true }); t.put('claims', 202, { ...t.parent(), ClaimantRecordId: 22 });
    const entry = createStaffExpenseEntry(channel, () => '2026-10', async b => digest(b));
    expect((await entry.load()).state).toBe('Ready'); t.identityOverride = { Id: 22, IsSiteAdmin };
    const draft: IExpenseEntryDraft = { date: '21-10-2026', supplier: 'Retain A', description: 'Retain A', nominalCode: '00010', amount: '12.34', notes: 'Retain A', receipt: { kind: 'none', reason: 'Retain A' } };
    expect((await entry.save(draft)).state).toBe('Held'); expect(entry.hasAttempt).toBe(false);
    t.identityOverride = { Id: 11, IsSiteAdmin: false };
    expect((await channel.readSignedInEntryContext('2026-10')).state).toBe('Held');
    expect(draft.supplier).toBe('Retain A'); expect(t.table('requests').size).toBe(0);
  });
  it.each([true, false])('P2: final staff context holds account change (concurrent invalidator=%s)', async concurrent => {
    const t = new FakeSharePoint(), io = new StandardStoreIO(t.caller(11)), reads = new SharePointStandardStore(io, schema);
    // Deliberate test-controlled session transitions, independent of any read
    // result; no read/modify/write assignment spans an awaited operation.
    const switchActor = (Id: number): void => { t.identityOverride = { Id, IsSiteAdmin: false }; };
    const channel = new SharePointRequestChannel(io, reads, '/sites/REVIEW-TEST-SITE/ProposedRequests');
    const original = reads.readPolicy.bind(reads); let count = 0;
    jest.spyOn(reads, 'readPolicy').mockImplementation(async (actor, parent) => {
      const result = await original(actor, parent);
      if (++count === 3) {
        switchActor(22);
        if (concurrent) expect((await channel.readSignedInEntryContext('2026-10')).state).toBe('Held');
      }
      return result;
    });
    expect((await channel.readSignedInEntryContext('2026-10')).state).toBe('Held');
    switchActor(11);
    expect((await channel.readSignedInEntryContext('2026-10')).state).toBe('Held');
    expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it('P2: receipt bytes completing after account invalidation are withheld', async () => {
    const t = new FakeSharePoint(); expect((await t.processor().process(t.request(command(png)))).state).toBe('StorageVerified');
    const record = (await t.store().findOperation('11:expense-synthetic-operation-0001'))!.record!;
    if (record.receipt.kind !== 'file') throw new Error('Missing fixture receipt');
    const io = new StandardStoreIO(t.caller(11)), reads = new SharePointStandardStore(io, schema);
    const channel = new SharePointRequestChannel(io, reads, '/sites/REVIEW-TEST-SITE/ProposedRequests');
    const original = reads.readReceipt.bind(reads);
    jest.spyOn(reads, 'readReceipt').mockImplementation(async r => {
      const result = await original(r); t.identityOverride = { Id: 22, IsSiteAdmin: false };
      expect((await channel.readSignedInEntryContext('2026-10')).state).toBe('Held'); return result;
    });
    const priorPosts = t.calls.filter(p => p.method === 'POST').length;
    await expect(channel.readOwnReceipt(record.receipt)).rejects.toThrow('SESSION_IDENTITY_CHANGED');
    expect(t.calls.filter(p => p.method === 'POST')).toHaveLength(priorPosts);
  });
  it.each([true, false])('mixed completed/rejected history cannot identify the previous Save (completed first=%s)', async completedFirst => {
    const t = new FakeSharePoint();
    const complete = async (): Promise<void> => {
      expect((await t.processor().process(t.request(command(pdf, 'pdf', 'expense-completed-operation-0001', String(t.parent()['odata.etag']))))).state).toBe('StorageVerified');
    };
    const reject = async (): Promise<void> => {
      const id = t.request(command(undefined, 'png', 'expense-rejected-operation-0002', String(t.parent()['odata.etag'])));
      t.crash = 'ledger'; expect((await t.processor().process(id)).state).toBe('Pending'); t.bump(t.parent());
      expect((await t.processor().process(id)).state).toBe('Rejected');
    };
    if (completedFirst) { await complete(); await reject(); } else { await reject(); await complete(); }
    expect((await t.store().ownHistory(11, 101)).map(v => v.state).sort()).toEqual(['Completed', 'Rejected']);
    const cold = t.entry(), context = await cold.load();
    expect(context.state === 'Ready' && context.context.creationClearance).toBe('Unresolved');
    expect(context.state === 'Ready' && context.context.existingExpenseIds).toEqual([1]);
    const before = t.calls.length;
    expect(await t.channel().readOwnPrevious(101)).toEqual({ state: 'Pending' });
    expect((await cold.checkPreviousSave()).state).toBe('Pending');
    // Explicit known-ID readback is still valid, including its original bytes.
    expect((await cold.reopen(1)).state).toBe('ReadbackVerified');
    const receipt = await cold.openReceipt(1); expect(receipt.state).toBe('ReceiptBytesVerified');
    if (receipt.state === 'ReceiptBytesVerified') expect(receipt.bytes).toEqual(pdf);
    expect(t.calls.slice(before).every(p => p.method === 'GET')).toBe(true);
    expect(t.table('requests').size).toBe(2); expect(t.table('expenses').size).toBe(1);
  });
  it('cold history is Pending for an uploaded request before any processor ledger exists', async () => {
    const t = new FakeSharePoint(); t.request(command(png));
    expect(t.table('operations').size).toBe(0);
    expect(await t.channel().readOwnPrevious(101)).toEqual({ state: 'Pending' });
    expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it('an older completed expense cannot hide a newly uploaded unallocated request', async () => {
    const t = new FakeSharePoint(); await t.processor().process(t.request(command(pdf, 'pdf')));
    t.request(command(undefined, 'png', 'expense-synthetic-operation-0002', String(t.parent()['odata.etag'])));
    expect(t.table('operations').size).toBe(1);
    expect(await t.channel().readOwnPrevious(101)).toEqual({ state: 'Pending' });
  });
  it('qualified fixed-parent context loads195 authoritative pairs with no writes', async () => {
    const t = new FakeSharePoint(), value = await t.entry().load();
    expect(value.state).toBe('Ready');
    if (value.state !== 'Ready') throw new Error('Expected source admission');
    expect(value.context).toMatchObject({ parentId: 101, parentEtag: '"1"', month: '2026-10', creationClearance: 'Clear', existingExpenseIds: [] });
    expect(value.context.nominals).toHaveLength(195); expect(value.context.eligibleNominalCodes).toHaveLength(195);
    expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it.each([
    ['owner', (t: FakeSharePoint) => { t.table('people').get(11)!.ProposedUserId = 12; }],
    ['inactive', (t: FakeSharePoint) => { t.table('people').get(11)!.ProposedActive = false; }],
    ['locked', (t: FakeSharePoint) => { t.parent().SubmissionStatus = 'Submitted'; }],
    ['closed month', (t: FakeSharePoint) => { t.table('months').get(10)!.MonthStatus = 'Closed'; }],
    ['month mismatch', (t: FakeSharePoint) => { t.table('months').get(10)!.ClaimMonth = '2026-09'; }],
    ['missing nominal', (t: FakeSharePoint) => { t.table('nominals').delete(195); }],
    ['changed description', (t: FakeSharePoint) => { t.table('nominals').get(1)!.field_2 = 'Unapproved'; }],
    ['admin', (t: FakeSharePoint) => { t.identityOverride = { Id: 11, IsSiteAdmin: true }; }],
    ['unknown admin', (t: FakeSharePoint) => { t.identityOverride = { Id: 11 }; }],
    ['wrong actor', (t: FakeSharePoint) => { t.identityOverride = { Id: 12, IsSiteAdmin: false }; }]
  ] as const)('context refuses %s without allocating request/operation', async (_name, change) => {
    const t = new FakeSharePoint(); change(t);
    expect((await t.entry().load()).state).toBe('Held');
    expect(t.table('requests').size).toBe(0); expect(t.table('operations').size).toBe(0);
    expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it.each(['Creating', 'Rejecting'])('a different %s reservation blocks creation but not old-record readback', async mode => {
    const t = new FakeSharePoint(); await t.processor().process(t.request());
    t.parent().ProposedReservation = JSON.stringify({ mode, key: '11:expense-other-operation-0002', originalEtag: String(t.parent()['odata.etag']) });
    const c = await t.channel().readEntryContext(101, 11);
    expect(c.state === 'Ready' && c.context.creationClearance).toBe('Unresolved');
    expect((await t.service().reopen(101, 1)).state).toBe('ReadbackVerified');
  });
  it('checkpoint survives completed release without preventing a new admitted context', async () => {
    const t = new FakeSharePoint(); await t.processor().process(t.request());
    expect(t.parent().ProposedCheckpoint).not.toBe('');
    const c = await t.entry().load();
    expect(c.state === 'Ready' && c.context.creationClearance).toBe('Clear');
    expect(c.state === 'Ready' && c.context.existingExpenseIds).toEqual([1]);
  });
  it('a cold form keeps an uploaded pre-ledger attempt unresolved and performs no second upload', async () => {
    const t = new FakeSharePoint(), request = t.request(command(png));
    const entry = t.entry(), loaded = await entry.load();
    expect(loaded.state === 'Ready' && loaded.context.creationClearance).toBe('Unresolved');
    const draft: IExpenseEntryDraft = { date: '21-10-2026', supplier: 'Retained', description: 'Retained', nominalCode: '00010', amount: '12.34', notes: '', receipt: { kind: 'none', reason: 'Synthetic' } };
    expect(await entry.save(draft)).toMatchObject({ state: 'Held', code: 'PRIOR_OPERATION_UNRESOLVED' });
    expect(entry.hasAttempt).toBe(false); expect(t.table('requests').size).toBe(1); expect(t.table('operations').size).toBe(0);
    expect(t.calls.every(p => p.method === 'GET')).toBe(true);
    await t.processor().process(request);
    const reopened = t.entry(); expect((await reopened.reopen(1)).state).toBe('ReadbackVerified');
    const receipt = await reopened.openReceipt(1);
    expect(receipt.state).toBe('ReceiptBytesVerified'); if (receipt.state === 'ReceiptBytesVerified') expect(receipt.bytes).toEqual(png);
    expect(t.table('requests').size).toBe(1); expect(t.table('expenses').size).toBe(1);
  });
  it('cached Clear is refreshed before first operation allocation and keeps the entered file', async () => {
    const t = new FakeSharePoint(), entry = t.entry();
    expect((await entry.load()).state).toBe('Ready'); t.request();
    const file = new File([png], 'retained.png', { type: 'image/png' });
    const draft: IExpenseEntryDraft = { date: '21-10-2026', supplier: 'Retained', description: 'Retained', nominalCode: '00010', amount: '12.34', notes: 'Retained', receipt: { kind: 'file', file } };
    expect(await entry.save(draft)).toMatchObject({ state: 'Held', code: 'PRIOR_OPERATION_UNRESOLVED' });
    expect(entry.hasAttempt).toBe(false); expect(entry.currentOperationId).toBeUndefined();
    expect(draft.receipt.kind === 'file' && draft.receipt.file).toBe(file); expect(draft.supplier).toBe('Retained');
    expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it.each([[undefined, 'none'], [png, 'png'], [jpg, 'jpg'], [pdf, 'pdf']] as const)('bound form creates and cold-reopens same expense and bytes (%s,%s)', async (bytes, ext) => {
    const t = new FakeSharePoint(), entry = t.entry(), type = ext === 'jpg' ? 'image/jpeg' : ext === 'pdf' ? 'application/pdf' : 'image/png';
    const draft: IExpenseEntryDraft = { date: '21-10-2026', supplier: 'Synthetic shop', description: 'Synthetic form integration', nominalCode: '00010', amount: '12.34', notes: 'Keep',
      receipt: bytes ? { kind: 'file', file: new File([bytes], 'original.' + ext, { type }) } : { kind: 'none', reason: 'Separate synthetic reason' } };
    const saved = await entry.save(draft); expect(saved.state).toBe('ReadbackVerified');
    expect((await entry.save(draft)).state).toBe('ReadbackVerified'); expect(t.table('requests').size).toBe(1);
    const cold = t.entry(); expect((await cold.reopen(1)).state).toBe('ReadbackVerified');
    if (bytes) { const receipt = await cold.openReceipt(1); expect(receipt.state).toBe('ReceiptBytesVerified');
      if (receipt.state === 'ReceiptBytesVerified') expect(receipt.bytes).toEqual(bytes); }
    else expect(t.table('expenses').get(1)!.ProposedReason).toBe('Separate synthetic reason');
    expect((await t.entry(12).load()).state).toBe('Held'); expect(t.table('expenses').size).toBe(1);
  });
  it('pending first form cannot replace its immutable operation after the processor is delayed', async () => {
    const t = new FakeSharePoint(); t.deferProcessor = true; const entry = t.entry();
    const draft: IExpenseEntryDraft = { date: '21-10-2026', supplier: 'Original', description: 'Synthetic', nominalCode: '00010', amount: '12.34', notes: '', receipt: { kind: 'none', reason: 'Synthetic' } };
    expect((await entry.save(draft)).state).toBe('Pending'); const op = entry.currentOperationId;
    expect((await entry.save({ ...draft, supplier: 'Changed' })).state).toBe('Pending');
    expect(entry.currentOperationId).toBe(op); expect(t.table('requests').size).toBe(1); expect(t.table('expenses').size).toBe(0);
    await t.processor().process(1);
    expect((await entry.checkSave()).state).toBe('ReadbackVerified'); expect(t.table('expenses').get(1)!.Supplier).toBe('Original');
    expect(t.table('requests').size).toBe(1);
  });
  it.each([
    ['next link', { value: [], 'odata.nextLink': 'private continuation' }],
    ['duplicate IDs', { value: [{ Id: 1, AuthorId: 11 }, { Id: 1, AuthorId: 11 }] }],
    ['foreign author', { value: [{ Id: 1, AuthorId: 12 }] }],
    ['string ID', { value: [{ Id: '1', AuthorId: 11 }] }],
    ['missing author', { value: [{ Id: 1 }] }],
    ['missing request', { value: [{ Id: 99, AuthorId: 11 }] }],
    ['capacity', { value: Array.from({ length: 201 }, (_, i) => ({ Id: i + 1, AuthorId: 11 })) }]
  ] as const)('incomplete or forged request enumeration (%s) cannot clear creation', async (_name, response) => {
    const t = new FakeSharePoint(); t.request();
    t.transform = (plan, data) => new URL(plan.url).searchParams.get('$filter') === 'AuthorId eq 11' ? response : data;
    expect((await t.entry().load()).state).toBe('Held'); expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it.each(['folder', 'corrupt bytes', 'changed version', 'changed editor', 'wrong name'])('unknown immutable request (%s) cannot be silently skipped', async damage => {
    const t = new FakeSharePoint(), id = t.request(), row = t.table('requests').get(id)!;
    if (damage === 'folder') delete row.File;
    if (damage === 'corrupt bytes') t.requestBytes.set(id, new TextEncoder().encode('not json'));
    if (damage === 'changed version') row.OData__UIVersionString = '2.0';
    if (damage === 'changed editor') row.EditorId = 12;
    if (damage === 'wrong name') (row.File as Raw).Name = 'expense-other-operation-0002.json';
    expect((await t.entry().load()).state).toBe('Held'); expect(t.table('operations').size).toBe(0);
  });
  it('a request appearing during reconciliation prevents a Clear snapshot', async () => {
    const t = new FakeSharePoint(); await t.processor().process(t.request()); let added = false;
    t.before = plan => { if (!added && plan.url.includes(`guid'${schema.lists.requests}'`) && plan.url.endsWith('/File/$value')) {
      added = true; t.request(command(undefined, 'png', 'expense-arriving-operation-0002', String(t.parent()['odata.etag'])));
    } };
    const context = await t.entry().load(); expect(added).toBe(true);
    expect(context.state === 'Ready' && context.context.creationClearance).toBe('Unresolved');
  });
  it('policy changes during admission do not return stale owner/month/ETag', async () => {
    const t = new FakeSharePoint(); let reads = 0;
    t.before = plan => { if (plan.url.includes(`guid'${schema.lists.claims}'`) && ++reads === 2) t.table('people').get(11)!.ProposedUserId = 12; };
    expect((await t.entry().load()).state).toBe('Held'); expect(t.calls.every(p => p.method === 'GET')).toBe(true);
  });
  it('ordinary actor is rechecked after the scan', async () => {
    const t = new FakeSharePoint(); let identities = 0;
    t.transform = (plan, data) => plan.url.endsWith('currentuser?$select=Id,IsSiteAdmin') && ++identities === 2 ? { Id: 12, IsSiteAdmin: false } : data;
    expect((await t.entry().load()).state).toBe('Held'); expect(identities).toBe(2);
  });
  it.each(['RequestId', 'missing request', 'record fields', 'Rejected'])('terminal operation with %s cannot grant fresh creation', async damage => {
    const t = new FakeSharePoint(); await t.processor().process(t.request());
    if (damage === 'RequestId') { t.table('operations').get(1)!.RequestId = 99; t.table('results').get(1)!.RequestId = 99; }
    if (damage === 'missing request') t.table('requests').clear();
    if (damage === 'record fields') {
      t.table('expenses').get(1)!.Supplier = 'Changed after request';
      const result = t.table('results').get(1)!, value = JSON.parse(String(result.RecordJson));
      value.line.supplier = 'Changed after request'; result.RecordJson = JSON.stringify(value);
    }
    if (damage === 'Rejected') { t.table('operations').get(1)!.State = 'Rejected'; const r = t.table('results').get(1)!; r.State = 'Rejected'; r.RecordJson = ''; }
    const context = await t.entry().load();
    expect(context.state === 'Ready' ? context.context.creationClearance : 'Unresolved').toBe('Unresolved');
  });
  it('a valid sealed request for a different parent is read but cannot replace fixed parent context', async () => {
    const t = new FakeSharePoint(); t.request({ ...command(), parentId: 102 });
    const c = await t.entry().load(); expect(c.state === 'Ready' && c.context.parentId).toBe(101);
    expect(c.state === 'Ready' && c.context.creationClearance).toBe('Clear');
  });
  it.each(['missing', 'different bytes'])('a completed record with %s receipt cannot clear fresh creation', async damage => {
    const t = new FakeSharePoint(); await t.processor().process(t.request(command(png)));
    if (damage === 'missing') t.attachments.clear(); else t.attachments.get(1)!.bytes[9] ^= 1;
    const c = await t.entry().load(); expect(c.state === 'Ready' && c.context.creationClearance).toBe('Unresolved');
  });
  it('returned context references cannot mutate the approved source master', async () => {
    const t = new FakeSharePoint(), c = await t.channel().readEntryContext(101, 11), expected = nominalMaster[0].description;
    if (c.state !== 'Ready') throw new Error('Expected source context');
    (c.context.nominals[0] as unknown as Raw).description = 'Caller mutation';
    expect(nominalMaster[0].description).toBe(expected);
    expect((await t.entry().load()).state).toBe('Ready');
  });
  it('R6 writes dedicated ledger actor and cold history when native OriginatorId is read-only', async () => {
    const t = new FakeSharePoint(); t.nativeSystemFields = true;
    const saved = await t.service().save({ ...command(png), receipt: { kind: 'file', fileName: 'receipt.png', mediaType: 'image/png', bytes: png } });
    expect(saved.state).toBe('ReadbackVerified');
    for (const name of ['operations', 'results', 'audit'] as const) {
      expect(t.table(name).get(1)!.D01ActorId).toBe(11);
      t.table(name).get(1)!.OriginatorId = 99; // native system lookup is unrelated to the human claimant
    }
    expect((await t.service().recoverPrevious(101)).state).toBe('ReadbackVerified');
    expect((await t.service().reopen(101, 1)).state).toBe('ReadbackVerified');
  });
  it('R6 standalone operation plans cannot write the native system lookup', () => {
    const plan = createUniqueOperation(guid(2), '11:expense-synthetic-operation-0001', 1, 11, 101);
    expect(plan.body).toMatchObject({ D01ActorId: 11 }); expect(plan.body).not.toHaveProperty('OriginatorId');
    for (const name of ['OriginatorId', 'originatorid', 'ORIGINATORID', 'OriginatorIdId']) {
      expect(() => conditionalUpdate(guid(2), 1, '"1"', { [name]: 11 })).toThrow();
      const io = new StandardStoreIO(new FakeSharePoint());
      expect(() => new SharePointStandardStore(io, { ...schema, checkpoint: name })).toThrow();
      expect(() => new SharePointStandardStore(io, { ...schema, expense: { ...schema.expense, originator: name } })).toThrow();
    }
  });
  it.each(['operations', 'results'] as const)('R6 ignores system lookup and rejects missing %s dedicated actor', async name => {
    const t = new FakeSharePoint();
    expect((await t.service().save({ ...command(pdf, 'pdf'), receipt: { kind: 'file', fileName: 'receipt.pdf', mediaType: 'application/pdf', bytes: pdf } })).state).toBe('ReadbackVerified');
    t.table(name).get(1)!.OriginatorId = 11; delete t.table(name).get(1)!.D01ActorId;
    await expect(t.store().findOperation('11:expense-synthetic-operation-0001')).rejects.toThrow();
  });
  it('rejects the independently reproduced ClaimMonth checkpoint collision before any HTTP call', () => {
    const t = new FakeSharePoint();
    expect(() => new SharePointStandardStore(new StandardStoreIO(t), { ...schema, checkpoint: 'ClaimMonth' })).toThrow();
    expect(t.calls).toHaveLength(0); expect(t.parent().ClaimMonth).toBe('2026-10');
  });
  it.each(['checkpoint', 'reservation'] as const)('protects every captured parent/base field from %s binding, including case and lookup aliases', binding => {
    // Independent fixture from the historical capture, not the implementation's guard list.
    const captured = ('_CommentCount _CommentFlags ApprovedAt ApprovedBy ApproverEmail ApproverPerson ClaimantEmail ClaimantKey ClaimantName ClaimantPerson ClaimantRecord ClaimantSourceItemId ClaimMonth ClaimMonthRecord ExpenseTotal FinanceCheckedAt FinanceCheckedBy FinanceNotes FinanceReturnedAt FinanceReturnedBy FinanceStatus FirstSubmittedAt IsZeroClaim LastSubmittedAt LastSubmittedBy LedgerCodesChecked LifecycleAuditCompletedAt LifecycleAuditState LifecyclePendingEventKey LifecyclePendingPayload ManagerNotes ManagerReviewedAt ManagerReviewedBy MileageChecked MileageTotal MissingReceiptCount OverallTotal PayrollExportedAt PayrollExportRunId PayrollReadyAt PayrollReadyBy PayrollStatus ProvisioningRunId ReceiptFolderUrl ReceiptsChecked RowsNeedingAttention SourceSnapshotRunId SubmissionKey SubmissionStatus SubmissionVersion ValidationStatus ZeroClaimConfirmedAt ID Title Author Editor Created Modified ContentTypeId Attachments GUID FileRef FileLeafRef').split(' ');
    const t = new FakeSharePoint();
    for (const name of captured) for (const alias of [name, name.toLowerCase(), name.toUpperCase(), name + 'Id']) {
      expect(() => new SharePointStandardStore(new StandardStoreIO(t), { ...schema, [binding]: alias })).toThrow();
    }
    expect(t.calls).toHaveLength(0);
  });
  it('rejects case-insensitive aliases between dedicated fields and list GUIDs', () => {
    const t = new FakeSharePoint(), io = new StandardStoreIO(t);
    expect(() => new SharePointStandardStore(io, { ...schema, checkpoint: schema.reservation.toLowerCase() })).toThrow();
    expect(() => new SharePointStandardStore(io, { ...schema, fingerprint: schema.expense.reason.toLowerCase() })).toThrow();
    expect(() => new SharePointStandardStore(io, { ...schema, expense: { ...schema.expense, requestId: schema.expense.originator.toLowerCase() } })).toThrow();
    const a = 'cb455c59-c7a0-49a4-adf7-f3e2eea58dc3';
    expect(() => new SharePointStandardStore(io, { ...schema, lists: { ...schema.lists, claims: a, expenses: a.toUpperCase() } })).toThrow();
    expect(t.calls).toHaveLength(0);
  });
  it('protects every captured expense/base field for every dedicated binding and standalone create plan', async () => {
    const captured = ('ExpenseLineKey ExpenseDate Supplier ExpenseDescription ExpenseCategory NominalCode NominalDescription GrossAmount ReceiptRequired ReceiptUrl ReceiptFileName LineValidationStatus ValidationMessage ClaimantNotes ManagerLineNotes IsVoided ClaimSubmissionRef _CommentFlags _CommentCount ID Title Author Editor Created Modified ContentTypeId Attachments GUID FileRef FileLeafRef').split(' ');
    const t = new FakeSharePoint(), request = await t.store().readRequest(t.request()); const prior = t.calls.length;
    for (const name of captured) for (const alias of [name, name.toLowerCase(), name.toUpperCase(), name + 'Id']) {
      expect(() => new SharePointStandardStore(new StandardStoreIO(t), { ...schema, fingerprint: alias })).toThrow();
      for (const binding of ['reason', 'originator', 'requestId', 'canonicalOperation', 'receiptManifest'] as const) {
        const expense = { ...schema.expense, [binding]: alias };
        expect(() => new SharePointStandardStore(new StandardStoreIO(t), { ...schema, expense })).toThrow();
        expect(() => createExpenseLine(schema.lists.expenses, request, nominalMaster[0].description, expense)).toThrow();
      }
    }
    expect(t.calls).toHaveLength(prior);
  });
  it('rejects standalone reservation plans targeting captured receipt or payroll parent fields', () => {
    for (const name of ['ReceiptFolderUrl', 'PayrollExportRunId', 'ClaimMonthRecordId', 'Title', 'GUID']) {
      expect(() => reserveParent(schema.lists.claims, 101, '"1"', '11:expense-synthetic-operation-0001', name)).toThrow();
    }
  });
  it('holds an unsafe next SubmissionVersion without completing or changing parent financial fields', async () => {
    const t = new FakeSharePoint(), request = t.request(command(png)); t.parent().SubmissionVersion = Number.MAX_SAFE_INTEGER;
    expect((await t.processor().process(request)).state).toBe('Pending');
    expect(t.parent()).toMatchObject({ ClaimMonth: '2026-10', SubmissionVersion: Number.MAX_SAFE_INTEGER, ExpenseTotal: 0, OverallTotal: 9, ProposedCheckpoint: '' });
    expect(t.table('expenses').size).toBe(1); expect(t.attachments.size).toBe(1); // partial durable write, never report Rejected/success
    expect(t.table('operations').get(1)!.State).toBe('Pending'); expect(t.table('results').size).toBe(0);
    expect(t.calls.filter(p => p.method === 'POST' && p.body && 'SubmissionVersion' in p.body)).toHaveLength(0);
    expect((await t.processor().process(request)).state).toBe('Pending'); expect(t.table('expenses').size).toBe(1);
  });
  it.each([['jpg', jpg], ['png', png], ['pdf', pdf]])('writes and reopens same %s line/bytes with fresh store', async (extension, bytes) => {
    const t = new FakeSharePoint(), request = t.request(command(bytes as Uint8Array, extension as string));
    const result = await t.processor().process(request); expect(result.state).toBe('StorageVerified');
    const reopened = await t.store().findOperation('11:expense-synthetic-operation-0001'); expect(reopened?.state).toBe('Completed');
    const record = reopened!.record!; expect(record.line.id).toBe(1); expect(record.etag).toBe('"2"');
    expect(await t.store().readReceipt(record)).toEqual(bytes); expect(t.table('expenses').size).toBe(1);
    expect(t.parent()).toMatchObject({ ExpenseTotal: 12.34, OverallTotal: 21.34, SubmissionVersion: 1, ProposedReservation: '' });
    expect((await t.processor().process(request)).state).toBe('StorageVerified'); expect(t.table('expenses').size).toBe(1);
  });
  it('stores separate no-receipt reason/notes without Category or author spoofing', async () => {
    const t = new FakeSharePoint(); expect((await t.processor().process(t.request())).state).toBe('StorageVerified');
    const line = t.table('expenses').get(1)!;
    expect(line).toMatchObject({ ClaimantNotes: 'Kept notes', ProposedReason: 'Synthetic missing receipt', ProposedOriginatorId: 11 });
    expect(line).not.toHaveProperty('ExpenseCategory'); expect(line.AuthorId).toBe(99); expect(t.attachments.size).toBe(0);
    const create = t.calls.find(p => p.method === 'POST' && p.url === `${TEST_SITE}/_api/web/lists(guid'${schema.lists.expenses}')/items`)!;
    expect(create.body).not.toHaveProperty('AuthorId');
  });
  it.each(['ledger', 'reservation', 'line', 'receipt', 'audit', 'parent-commit', 'result', 'ledger-complete', 'release'])('reconciles lost %s acknowledgement with one line/receipt/total increment', async stage => {
    const t = new FakeSharePoint(), request = t.request(command(png)); t.crash = stage;
    expect((await t.processor().process(request)).state).toBe('Pending');
    expect((await t.processor().process(request)).state).toBe('StorageVerified');
    expect([t.table('expenses').size, t.attachments.size, t.table('audit').size, t.table('results').size]).toEqual([1, 1, 1, 1]);
    expect(t.parent()).toMatchObject({ ExpenseTotal: 12.34, OverallTotal: 21.34, SubmissionVersion: 1, ProposedReservation: '' });
  });
  it('rejects stale operation without a line and does not treat rejection custody as creation ownership', async () => {
    const t = new FakeSharePoint(), request = t.request(); t.crash = 'ledger'; await t.processor().process(request);
    t.bump(t.parent()); const k = '11:expense-synthetic-operation-0001';
    t.parent().ProposedReservation = JSON.stringify({ mode: 'Rejecting', key: k, originalEtag: '"1"' });
    expect(await t.store().acquireParent(101, '"1"', k)).toBe('Stale');
    const original = await t.store().readRequest(request);
    await expect(t.store().createLineUnique(k, original, nominalMaster[0].description)).rejects.toThrow('NO_CREATION_CUSTODY');
    expect((await t.processor().process(request)).state).toBe('Rejected'); expect(t.table('expenses').size).toBe(0); expect(t.parent().ProposedReservation).toBe('');
  });
  it('recovers lost rejection completion/release without creating or stealing custody', async () => {
    const t = new FakeSharePoint(), request = t.request(); t.crash = 'ledger'; await t.processor().process(request); t.bump(t.parent()); t.crash = 'ledger-reject';
    expect((await t.processor().process(request)).state).toBe('Pending'); expect((await t.processor().process(request)).state).toBe('Rejected');
    expect(t.parent().ProposedReservation).toBe(''); expect(t.table('expenses').size).toBe(0);
  });
  it.each(['', 'ledger-reject', 'release'])('normalises native null rejected RecordJson through first completion and recovery %s', async lostAck => {
    const t = new FakeSharePoint(), request = t.request(); t.crash = 'ledger'; await t.processor().process(request); t.bump(t.parent());
    t.before = () => { for (const r of Array.from(t.table('results').values())) if (r.State === 'Rejected') r.RecordJson = null; };
    if (lostAck) { t.crash = lostAck; expect((await t.processor().process(request)).state).toBe('Pending'); }
    expect((await t.processor().process(request)).state).toBe('Rejected');
    const writes = t.calls.filter(p => p.method === 'POST').length;
    expect((await t.processor().process(request)).state).toBe('Rejected');
    expect(t.calls.filter(p => p.method === 'POST')).toHaveLength(writes);
    expect(t.table('results').size).toBe(1); expect(t.table('expenses').size).toBe(0); expect(t.parent().ProposedReservation).toBe('');
  });
  it('does not normalise a null Completed record or nonempty Rejected record', async () => {
    const t = new FakeSharePoint(), request = t.request(); await t.processor().process(request);
    t.table('results').get(1)!.RecordJson = null;
    await expect(t.store().findOperation('11:expense-synthetic-operation-0001')).rejects.toThrow('INVALID_RESULT');
    const r = new FakeSharePoint(), req = r.request(); r.crash = 'ledger'; await r.processor().process(req); r.bump(r.parent()); await r.processor().process(req);
    r.table('results').get(1)!.RecordJson = '{}';
    await expect(r.store().findOperation('11:expense-synthetic-operation-0001')).rejects.toThrow('INVALID_REJECTION');
  });
  it('replays completed operation after month closure without another write', async () => {
    const t = new FakeSharePoint(), request = t.request(); await t.processor().process(request);
    t.table('months').get(10)!.MonthStatus = 'Closed'; t.parent().SubmissionStatus = 'Submitted'; const count = t.calls.filter(p => p.method === 'POST').length;
    expect((await t.processor().process(request)).state).toBe('StorageVerified'); expect(t.calls.filter(p => p.method === 'POST')).toHaveLength(count);
  });
  it.each(['actor', 'month', 'nominal', 'parent-etag', 'master'])('blocks invalid %s before line creation', async variant => {
    const t = new FakeSharePoint(); const request = t.request(command(undefined, 'png', undefined, variant === 'parent-etag' ? '"0"' : '"1"'), variant === 'actor' ? 22 : 11);
    if (variant === 'month') t.table('months').get(10)!.ClaimMonth = '2026-11';
    if (variant === 'nominal') t.table('nominals').get(1)!.field_4 = 0;
    if (variant === 'master') t.table('nominals').delete(195);
    expect((await t.processor().process(request)).state).not.toBe('StorageVerified'); expect(t.table('expenses').size).toBe(0);
  });
  it.each(['file-etag', 'file-id', 'length', 'name', 'author', 'version'])('rejects request metadata/content %s mismatch with no writes', async variant => {
    const t = new FakeSharePoint(), request = t.request();
    t.before = p => { if (!p.url.endsWith('/File/$value')) return; const r = t.table('requests').get(request)!, f = r.File as Raw;
      if (variant === 'file-etag') f.ETag = '"file-2"'; if (variant === 'file-id') f.UniqueId = guid(999);
      if (variant === 'length') f.Length = '1'; if (variant === 'name') f.Name = 'wrong.json';
      if (variant === 'author') r.AuthorId = 22; if (variant === 'version') r.OData__UIVersionString = '2.0'; };
    expect((await t.processor().process(request)).state).toBe('Pending'); expect(t.calls.filter(p => p.method === 'POST')).toHaveLength(0);
  });
  it('never clears another operation reservation', async () => {
    const t = new FakeSharePoint(); t.parent().ProposedReservation = JSON.stringify({ mode: 'Creating', key: '11:expense-other-operation-0002', originalEtag: '"1"' });
    await t.store().releaseParent(101, '11:expense-synthetic-operation-0001'); expect(t.calls.filter(p => p.method === 'POST')).toHaveLength(0);
  });
  it('races separate store instances for the same operation without duplicate receipt or parent increment', async () => {
    const t = new FakeSharePoint(), request = t.request(command(png));
    await Promise.all([t.processor().process(request), t.processor().process(request)]);
    expect((await t.processor().process(request)).state).toBe('StorageVerified');
    expect([t.table('expenses').size, t.attachments.size, t.table('audit').size, t.table('results').size]).toEqual([1, 1, 1, 1]);
    expect(t.parent()).toMatchObject({ ExpenseTotal: 12.34, OverallTotal: 21.34, SubmissionVersion: 1 });
  });
  it('races distinct operation IDs against one parent version then durably rejects the unwritten loser', async () => {
    const t = new FakeSharePoint(), a = t.request(), b = t.request(command(undefined, 'png', 'expense-synthetic-operation-0002'));
    await Promise.all([t.processor().process(a), t.processor().process(b)]);
    const states = [(await t.processor().process(a)).state, (await t.processor().process(b)).state].sort();
    expect(states).toEqual(['Rejected', 'StorageVerified']); expect(t.table('expenses').size).toBe(1); expect(t.parent().SubmissionVersion).toBe(1);
  });
  it('holds completion if an audit has no server-stamped time or technical actor', async () => {
    const t = new FakeSharePoint(), request = t.request(); t.crash = 'audit'; await t.processor().process(request);
    delete t.table('audit').get(1)!.Created;
    expect((await t.processor().process(request)).state).toBe('Pending'); expect(t.table('results').size).toBe(0); expect(t.parent().SubmissionVersion).toBe(0);
  });
  it.each([401, 403, 404, 429, 503])('does not create on lookup HTTP%s', async status => {
    const t = new FakeSharePoint(), request = t.request(), send = t.send.bind(t);
    t.send = async p => p.url.includes(schema.lists.operations) ? { status, url: p.url, redirected: false, body: undefined } : send(p);
    expect((await t.processor().process(request)).state).toBe('Pending'); expect(t.calls.filter(p => p.method === 'POST')).toHaveLength(0);
  });
  it('rejects paginated operation lookup instead of granting absence', async () => {
    const t = new FakeSharePoint(), request = t.request(), send = t.send.bind(t);
    t.send = async p => p.url.includes(schema.lists.operations) ? { status: 200, url: p.url, redirected: false, body: stream(new TextEncoder().encode(JSON.stringify({ value: [], 'odata.nextLink': 'more' }))) } : send(p);
    expect((await t.processor().process(request)).state).toBe('Pending'); expect(t.calls.filter(p => p.method === 'POST')).toHaveLength(0);
  });
  it.each([['jpg', jpg], ['png', png], ['pdf', pdf]])('runs actual service/channel/store Save Close Reopen %s with same raw IDs and bytes', async (extension, bytes) => {
    const t = new FakeSharePoint(), prepared = command(bytes as Uint8Array, extension as string);
    const input = { ...prepared, receipt: { kind: 'file' as const, fileName: `receipt.${extension}`, mediaType: prepared.receipt.kind === 'file' ? prepared.receipt.mediaType : '', bytes: bytes as Uint8Array } };
    const first = await t.service().save(input); expect(first.state).toBe('ReadbackVerified');
    const cold = t.service(); expect((await cold.recoverPrevious(101)).state).toBe('ReadbackVerified'); expect((await cold.reopen(101, 1)).state).toBe('ReadbackVerified');
    const file = await cold.openReceipt(101, 1); expect(file.state).toBe('ReceiptBytesVerified');
    if (file.state === 'ReceiptBytesVerified') expect(file.bytes).toEqual(bytes);
    expect((await cold.save(input)).state).toBe('ReadbackVerified');
    expect([t.table('requests').size, t.table('operations').size, t.table('expenses').size, t.table('results').size, t.attachments.size]).toEqual([1, 1, 1, 1, 1]);
  });
  it('exposes explicit saved IDs for multiple operations and reopens each exact line', async () => {
    const t = new FakeSharePoint(); await t.service().save(command());
    await t.service().save(command(undefined, 'png', 'expense-synthetic-operation-0002', String(t.parent()['odata.etag'])));
    expect(await t.channel().readOwnSavedIds(101)).toEqual([1, 2]);
    expect((await t.service().reopen(101, 1)).state).toBe('ReadbackVerified'); expect((await t.service().reopen(101, 2)).state).toBe('ReadbackVerified');
    expect((await t.service().recoverPrevious(101)).state).toBe('Pending'); // no arbitrary choice/automatic creation clearance
  });
  it('keeps mixed outcomes unconfirmed after closing but exposes the explicit completed ID', async () => {
    const t = new FakeSharePoint(), a = t.request(), b = t.request(command(undefined, 'png', 'expense-synthetic-operation-0002'));
    const original = await t.store().readRequest(b);
    await t.store().reserveOperation({ key: '11:' + original.command.operationId, requestId: b, originatorId: 11, parentId: 101, state: 'Pending' });
    await t.processor().process(a); expect((await t.processor().process(b)).state).toBe('Rejected');
    expect((await t.service().recoverPrevious(101)).state).toBe('Pending'); expect(await t.channel().readOwnSavedIds(101)).toEqual([1]);
    expect((await t.service().reopen(101, 1)).state).toBe('ReadbackVerified');
  });
  it('denies unrelated raw employee GETs and any employee direct POST even with forged URLs', async () => {
    const t = new FakeSharePoint(); await t.service().save({ ...command(), receipt: { kind: 'file', fileName: 'receipt.png', mediaType: 'image/png', bytes: png } });
    for (const name of ['requests', 'operations', 'results', 'audit', 'expenses'] as const) {
      const url = `${TEST_SITE}/_api/web/lists(guid'${schema.lists[name]}')/items(1)`;
      expect((await t.caller(22).send({ method: 'GET', url, headers: {}, retry: 'none' })).status).toBe(403);
    }
    const line = `${TEST_SITE}/_api/web/lists(guid'${schema.lists.expenses}')/items(1)`;
    expect((await t.caller(22).send({ method: 'GET', url: line + "/AttachmentFiles/getByFileName('receipt.png')/$value", headers: {}, retry: 'none' })).status).toBe(403);
    expect((await t.caller(11).send({ method: 'POST', url: line, headers: {}, body: { AuthorId: 11 }, retry: 'none' })).status).toBe(403);
    expect((await t.service(22).reopen(101, 1)).state).toBe('Rejected'); expect((await t.service(22).openReceipt(101, 1)).state).toBe('Unavailable');
    expect(t.table('expenses').size).toBe(1);
  });
});

describe('Standard bounded transport', () => {
  const plan: IStandardRestPlan = { method: 'GET', url: TEST_SITE + '/_api/test', headers: {}, retry: 'none' };
  it('cancels oversized actual JSON body without a whole-body fallback', async () => {
    let reads = 0, cancelled = 0;
    const io = new StandardStoreIO({ send: async p => ({ status: 200, url: p.url, redirected: false, body: { getReader: () => ({
      read: async () => { reads++; return { done: false, value: new Uint8Array(65537) }; }, cancel: async () => { cancelled++; }, releaseLock: () => undefined }) } }) });
    await expect(io.execute(plan)).rejects.toThrow('BOUNDED_JSON_REQUIRED'); expect([reads, cancelled]).toEqual([1, 1]);
  });
  it('requires bounded streams and exact TEST response destination', async () => {
    const io = new StandardStoreIO({ send: async () => ({ status: 200, url: 'https://example.com', redirected: true, body: { text: async () => '{}' } }) });
    await expect(io.execute(plan)).rejects.toThrow('RESPONSE_DESTINATION');
    await expect(io.execute({ ...plan, url: 'https://example.com/_api/test' })).rejects.toThrow('DESTINATION_HELD');
  });
  it('bounds request-envelope accumulation by intrinsic chunk lengths and cancels at crossing', async () => {
    let reads = 0, cancelled = 0; const chunk = new Uint8Array(8 * 1024 * 1024); Object.defineProperty(chunk, 'length', { value: 1 });
    const io = new StandardStoreIO({ send: async p => ({ status: 200, url: p.url, redirected: false, body: { getReader: () => ({
      read: async () => { reads++; return { done: false, value: chunk }; }, cancel: async () => { cancelled++; }, releaseLock: () => undefined }) } }) });
    await expect(io.binary(plan, true)).rejects.toThrow('BOUNDED_ENVELOPE_REQUIRED'); expect([reads, cancelled]).toEqual([2, 1]);
  });
  it('fails closed if request-envelope stream release fails without leaking private errors', async () => {
    let reads = 0;
    const io = new StandardStoreIO({ send: async p => ({ status: 200, url: p.url, redirected: false, body: { getReader: () => ({
      read: async () => ++reads === 1 ? { done: false, value: new Uint8Array([1]) } : { done: true }, cancel: async () => undefined,
      releaseLock: () => { throw new Error('private server detail'); } }) } }) });
    await expect(io.binary(plan, true)).rejects.toThrow('BOUNDED_ENVELOPE_REQUIRED');
  });
  it('does not use a whole buffered request-body fallback', async () => {
    const arrayBuffer = jest.fn(async () => new ArrayBuffer(1));
    const io = new StandardStoreIO({ send: async p => ({ status: 200, url: p.url, redirected: false, body: { arrayBuffer } }) });
    await expect(io.binary(plan, true)).rejects.toThrow('BOUNDED_STREAM_REQUIRED'); expect(arrayBuffer).not.toHaveBeenCalled();
  });
});
