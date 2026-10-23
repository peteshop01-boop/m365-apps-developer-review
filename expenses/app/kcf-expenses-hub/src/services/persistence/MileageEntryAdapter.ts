import type { IMileageDraft } from '../../domain/mileage';
import { calculateMileage } from '../../domain/mileage';
import { nominalMaster } from '../../data/nominals';
import { parseUkDate } from '../../domain/expenseRules';
import { mileageAmountPence, selectMileageRate } from '../../domain/mileageRates';
import type { IMileageRateSnapshot, ISelectedMileageRate } from '../../domain/mileageRates';
import { etag, expenseText, operation, own, positiveId } from './PersistenceValidation';

export interface IMileageProgramme { readonly key: string; readonly name: string; readonly nominalCodes: readonly string[]; }
/** Authenticated reader output only. It is not a form or web-part property. */
export interface IMileageEntryContext {
  readonly actorId: number; readonly parentId: number; readonly parentEtag: string; readonly month: string;
  readonly programmes: readonly IMileageProgramme[]; readonly rates: IMileageRateSnapshot;
  readonly existingIds: readonly number[]; readonly creationClearance: 'Clear' | 'Unresolved';
}
export type MileageAdmission = { readonly state: 'Held' } | { readonly state: 'Ready'; readonly context: IMileageEntryContext };
export interface ICreateMileage {
  readonly operationId: string; readonly parentId: number; readonly parentEtag: string;
  readonly expectedRateVersion: string; readonly draft: IMileageDraft;
}
export interface IStoredMileage {
  readonly id: number; readonly requestId: number; readonly originatorId: number; readonly etag: string;
  readonly command: ICreateMileage; readonly nominalDescription: string; readonly programmeName: string;
  readonly wholeMiles: number; readonly amountPence: number; readonly rate: ISelectedMileageRate;
}
export type MileageOutcome = { readonly state: 'Held' | 'Rejected' | 'Pending'; readonly tenantWriteAllowed: false }
  | { readonly state: 'ReadbackVerified'; readonly record: IStoredMileage; readonly tenantWriteAllowed: false };
/** A future qualified Standard processor owns actor, eligibility, amount and
 * parent CAS. No implementation of that writer or tenant binding exists here.
 * Test ports prove orchestration, never SharePoint authorisation. */
export interface IMileageEntryPort {
  context(): Promise<MileageAdmission>;
  submit(command: ICreateMileage): Promise<unknown>;
  reconcile(parentId: number, operationId: string): Promise<unknown>;
  recover(parentId: number): Promise<unknown>;
  read(parentId: number, mileageId: number): Promise<unknown>;
}
const result = (state: 'Held' | 'Rejected' | 'Pending'): MileageOutcome => ({ state, tenantWriteAllowed: false });
const draftKeys = ['date', 'programme', 'nominalCode', 'from', 'to', 'returnJourney', 'outwardMiles', 'returnMiles', 'purpose'];
function check(ok: unknown): asserts ok { if (!ok) throw new Error('MILEAGE_BOUNDARY_HELD'); }
function draftCopy(value: unknown): IMileageDraft {
  const d = own(value, draftKeys);
  check(typeof d.date === 'string' && parseUkDate(d.date) && typeof d.returnJourney === 'boolean');
  for (const k of ['programme', 'nominalCode', 'from', 'to', 'purpose']) check(expenseText(d[k]));
  check(typeof d.outwardMiles === 'string' && typeof d.returnMiles === 'string');
  // One-way keeps an explicit empty reverse leg; do not silently discard miles.
  check(d.returnJourney || d.returnMiles === '');
  check(calculateMileage(d as unknown as IMileageDraft, 1));
  return Object.freeze(d) as unknown as IMileageDraft;
}
function commandCopy(value: unknown): ICreateMileage {
  const c = own(value, ['operationId', 'parentId', 'parentEtag', 'expectedRateVersion', 'draft']);
  check(operation(c.operationId) && positiveId(c.parentId) && etag(c.parentEtag) && expenseText(c.expectedRateVersion));
  return Object.freeze({ ...c, draft: draftCopy(c.draft) }) as unknown as ICreateMileage;
}
function contextCopy(value: unknown): IMileageEntryContext {
  const c = own(value, ['actorId', 'parentId', 'parentEtag', 'month', 'programmes', 'rates', 'existingIds', 'creationClearance']);
  check(positiveId(c.actorId) && positiveId(c.parentId) && etag(c.parentEtag) && typeof c.month === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(c.month));
  check(c.creationClearance === 'Clear' || c.creationClearance === 'Unresolved');
  check(Array.isArray(c.existingIds) && c.existingIds.length <= 1000 && c.existingIds.every(positiveId) && new Set(c.existingIds).size === c.existingIds.length);
  check(Array.isArray(c.programmes) && c.programmes.length > 0 && c.programmes.length <= 195);
  const programmes = Array.from(c.programmes as unknown[], v => {
    const p = own(v, ['key', 'name', 'nominalCodes']);
    check(expenseText(p.key) && expenseText(p.name) && Array.isArray(p.nominalCodes) && p.nominalCodes.length > 0 && p.nominalCodes.length <= 195);
    const codes = Array.from(p.nominalCodes as unknown[]);
    check(new Set(codes).size === codes.length && codes.every(code => typeof code === 'string' && nominalMaster.some(n => n.code === code)));
    return Object.freeze({ key: p.key, name: p.name, nominalCodes: Object.freeze(codes as string[]) });
  });
  check(new Set(programmes.map(p => p.key)).size === programmes.length);
  const s = own(c.rates, ['listTitle', 'snapshotVersion', 'retrievedAtMs', 'complete', 'rows']);
  check(s.listTitle === 'KCFEXP_TEST102_MileageRates' && expenseText(s.snapshotVersion) && s.complete === true && Number.isSafeInteger(s.retrievedAtMs) && (s.retrievedAtMs as number) >= 0);
  check(Array.isArray(s.rows) && s.rows.length > 0 && s.rows.length <= 1000);
  const rows = Object.freeze(Array.from(s.rows as unknown[], r => Object.freeze(own(r, ['Title', 'Active', 'EffectiveFrom', 'EffectiveTo', 'RatePerMile']))));
  const rates = Object.freeze({ ...s, rows }) as unknown as IMileageRateSnapshot;
  return Object.freeze({ ...c, programmes: Object.freeze(programmes), rates, existingIds: Object.freeze([...(c.existingIds as number[])]) }) as unknown as IMileageEntryContext;
}
function newOperation(): string {
  check(globalThis.crypto?.getRandomValues);
  return 'mileage-' + Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, '0')).join('');
}

/** One immutable manual creation attempt. Repeated/ambiguous saves only read
 * the same operation. No browser storage, actor input, default rate or Maps. */
export class MileageEntryAdapter {
  private contextGeneration = 0;
  private sessionIdentity: string | undefined;
  private attemptContext: IMileageEntryContext | undefined;
  private attempt: ICreateMileage | undefined;
  private expectedRate: ISelectedMileageRate | undefined;
  private flight: Promise<MileageOutcome> | undefined;
  private readonly verifiedById = new Map<number, IStoredMileage>();
  private readonly verifiedByOperation = new Map<string, IStoredMileage>();
  public constructor(private readonly port: IMileageEntryPort, private readonly operationFactory: () => string = newOperation) {}
  public get hasAttempt(): boolean { return this.attempt !== undefined; }
  public get currentOperationId(): string | undefined { return this.attempt?.operationId; }
  public async load(): Promise<MileageAdmission> {
    if (this.attemptContext) return { state: 'Ready', context: this.attemptContext };
    const generation = ++this.contextGeneration;
    try {
      const a = await this.port.context();
      // A load started before Save may finish after its actor/parent was pinned.
      // It must neither replace that binding nor resurrect a superseded context.
      if (this.attemptContext) return { state: 'Ready', context: this.attemptContext };
      if (generation !== this.contextGeneration) return { state: 'Held' };
      if (a.state !== 'Ready') return { state: 'Held' };
      const c = contextCopy(a.context), identity = `${c.actorId}:${c.parentId}:${c.month}`;
      if (this.sessionIdentity && identity !== this.sessionIdentity) return { state: 'Held' };
      this.sessionIdentity = identity;
      return { state: 'Ready', context: c };
    } catch { return { state: 'Held' }; }
  }
  public save(input: IMileageDraft): Promise<MileageOutcome> {
    if (this.flight) return this.flight;
    this.flight = (this.attempt ? this.reconcile() : this.create(input)).catch(() => result(this.attempt ? 'Pending' : 'Rejected'))
      .then(value => { this.flight = undefined; return value; });
    return this.flight;
  }
  private async create(input: IMileageDraft): Promise<MileageOutcome> {
    const draft = draftCopy(input); // Snapshot synchronously before first await.
    const admission = await this.load();
    if (admission.state !== 'Ready' || admission.context.creationClearance !== 'Clear') return result('Held');
    const c = admission.context, date = parseUkDate(draft.date)!;
    check(date.slice(0, 7) === c.month && c.programmes.some(p => p.key === draft.programme && p.nominalCodes.includes(draft.nominalCode)));
    const rate = selectMileageRate(c.rates, date);
    this.attempt = commandCopy({ operationId: this.operationFactory(), parentId: c.parentId, parentEtag: c.parentEtag,
      expectedRateVersion: rate.snapshotVersion, draft });
    this.expectedRate = rate; this.attemptContext = c;
    // Never turn submit acknowledgement into Save success. Only an independent
    // same-operation readback can complete; transport failure keeps the attempt.
    await this.port.submit(this.attempt);
    return this.reconcile();
  }
  private async reconcile(): Promise<MileageOutcome> {
    if (!this.attempt || !this.attemptContext) return result('Rejected');
    return this.readResult(await this.port.reconcile(this.attempt.parentId, this.attempt.operationId), this.attemptContext, this.attempt);
  }
  public checkSave(): Promise<MileageOutcome> {
    return this.attempt ? this.save({} as IMileageDraft) : Promise.resolve(result('Rejected'));
  }
  public async checkPreviousSave(): Promise<MileageOutcome> {
    if (this.attempt) return this.checkSave();
    const admission = await this.load();
    if (admission.state !== 'Ready') return result('Held');
    const c = admission.context;
    // This contract has no separately admitted pending operation identity. An
    // unresolved cold history cannot be satisfied by an arbitrary older line.
    if (c.creationClearance !== 'Clear') return result('Pending');
    try { return this.readResult(await this.port.recover(c.parentId), c); } catch { return result('Pending'); }
  }
  public async reopen(id: number): Promise<MileageOutcome> {
    const admission = await this.load();
    if (admission.state !== 'Ready') return result('Held');
    const c = admission.context;
    if (!positiveId(id) || (!c.existingIds.includes(id) && !this.verifiedById.has(id))) return result('Rejected');
    try { return this.readResult(await this.port.read(c.parentId, id), c, undefined, id); } catch { return result('Rejected'); }
  }
  private readResult(raw: unknown, c: IMileageEntryContext, expected?: ICreateMileage, requestedId?: number): MileageOutcome {
    try {
      const state = Object.getOwnPropertyDescriptor(raw, 'state')?.value;
      if (state !== 'Ready') { own(raw, ['state']); return result(state === 'Rejected' ? 'Rejected' : 'Pending'); }
      const r = own(own(raw, ['state', 'record']).record, ['id', 'requestId', 'originatorId', 'etag', 'command', 'nominalDescription', 'programmeName', 'wholeMiles', 'amountPence', 'rate']);
      const command = commandCopy(r.command);
      check(positiveId(r.id) && positiveId(r.requestId) && r.originatorId === c.actorId && etag(r.etag));
      check(!requestedId || r.id === requestedId);
      check(command.parentId === c.parentId && parseUkDate(command.draft.date)?.slice(0, 7) === c.month);
      check(!expected || JSON.stringify(command) === JSON.stringify(expected));
      check(c.programmes.some(p => p.key === command.draft.programme && p.name === r.programmeName && p.nominalCodes.includes(command.draft.nominalCode)));
      check(nominalMaster.some(n => n.code === command.draft.nominalCode && n.description === r.nominalDescription));
      const rate = own(r.rate, ['listTitle', 'snapshotVersion', 'rowIndex', 'title', 'journeyDate', 'effectiveFrom', 'effectiveTo', 'ratePerMileGbp', 'rateTenThousandthsGbp']);
      check(rate.listTitle === 'KCFEXP_TEST102_MileageRates' && rate.snapshotVersion === command.expectedRateVersion && rate.journeyDate === parseUkDate(command.draft.date) && Number.isSafeInteger(rate.rowIndex) && (rate.rowIndex as number) >= 0);
      // A result cannot certify its own rate. Require the independently admitted
      // versioned rate snapshot; unavailable historical versions fail closed.
      check(c.rates.snapshotVersion === command.expectedRateVersion);
      const selected = selectMileageRate(c.rates, rate.journeyDate as string);
      check(JSON.stringify(selected) === JSON.stringify(rate));
      if (expected) check(this.expectedRate && JSON.stringify(rate) === JSON.stringify(this.expectedRate));
      const miles = calculateMileage(command.draft, 1)!.miles;
      check(r.wholeMiles === miles && r.amountPence === mileageAmountPence(miles, selected));
      const record = Object.freeze({ ...r, command, rate: Object.freeze(rate) }) as unknown as IStoredMileage;
      // Each verified operation owns one durable item/request pair. Reopening a
      // different existing line must retain its own command, not borrow the
      // current form's attempt; later reads cannot silently swap either identity.
      for (const known of [this.verifiedById.get(record.id), this.verifiedByOperation.get(command.operationId)]) {
        if (known) check(known.id === record.id && known.requestId === record.requestId && known.originatorId === record.originatorId
          && JSON.stringify(known.command) === JSON.stringify(command) && JSON.stringify(known.rate) === JSON.stringify(record.rate));
      }
      this.verifiedById.set(record.id, record); this.verifiedByOperation.set(command.operationId, record);
      return { state: 'ReadbackVerified', record, tenantWriteAllowed: false };
    } catch { return result('Rejected'); }
  }
}

/** Immutable runtime admission. No UI flag, demo ID or browser property can
 * replace missing schema, raw ACL, ledger, Standard processor or rate approval. */
export function createHeldMileageEntry(): MileageEntryAdapter {
  const held = async (): Promise<unknown> => ({ state: 'Held' });
  return new MileageEntryAdapter({ context: async () => ({ state: 'Held' }), submit: held, reconcile: held, recover: held, read: held });
}
