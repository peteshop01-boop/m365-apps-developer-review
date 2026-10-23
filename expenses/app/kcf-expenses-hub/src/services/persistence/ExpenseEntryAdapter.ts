import type { INominal } from '../../domain/contracts';
import { nominalMaster } from '../../data/nominals';
import { parseAmountPence, parseUkDate } from '../../domain/expenseRules';
import { copyBoundedBytes } from './BoundedBody';
import { etag, expenseText, MAX_RECEIPT_BYTES, own, positiveId, snapshotCommand, snapshotStored } from './PersistenceValidation';
import { ExpensePersistenceService } from './ExpensePersistenceService';
import { ADMISSION_GATES, browserSha256, HeldSharePointExpensePort } from './PersistenceContract';
import type { ICreateExpense, IStoredExpense, PersistenceResult, ReceiptOpenResult } from './PersistenceContract';

/** Returned by a future authenticated, qualified context reader, never by form
 * controls, a query string, demo IDs or a web-part property. Not authorisation:
 * the protected processor must enforce every actor/parent/nominal decision. */
export interface IExpenseEntryContext {
  readonly parentId: number; readonly parentEtag: string; readonly month: string;
  readonly nominals: ReadonlyArray<INominal>; readonly eligibleNominalCodes: readonly string[];
  readonly existingExpenseIds: readonly number[];
  /** Protected ledger reconciliation must establish this after a browser close.
   * An unresolved prior attempt blocks new creation; no browser cache substitutes. */
  readonly creationClearance: 'Clear' | 'Unresolved';
}
export type EntryAdmission = { readonly state: 'Held'; readonly gates: readonly string[] }
  | { readonly state: 'Ready'; readonly context: IExpenseEntryContext };
export type EntryReceipt = { readonly kind: 'none'; readonly reason: string } | { readonly kind: 'file'; readonly file: File };
export interface IExpenseEntryDraft {
  readonly date: string; readonly supplier: string; readonly description: string;
  readonly nominalCode: string; readonly amount: string; readonly notes: string; readonly receipt: EntryReceipt;
}
const held = (): EntryAdmission => ({ state: 'Held', gates: ADMISSION_GATES });
const reject = (code: string): PersistenceResult => ({ state: 'Rejected', code, tenantWriteAllowed: false });
const pending = (): PersistenceResult => ({ state: 'Pending', code: 'SAVE_UNCONFIRMED', tenantWriteAllowed: false });

function operationId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('OPERATION_ID_UNAVAILABLE');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return 'expense-' + Array.from(bytes, v => v.toString(16).padStart(2, '0')).join('');
}

/** Size is checked through Blob's native getter before FileReader allocation.
 * The actual read is independently bounded; zero-byte/name-only substitutes
 * never become a receipt. Full server validation/scanning remains a gate. */
async function fileReceipt(file: File): Promise<Extract<ICreateExpense['receipt'], { kind: 'file' }>> {
  const sizeGetter = Object.getOwnPropertyDescriptor(Blob.prototype, 'size')?.get;
  const typeGetter = Object.getOwnPropertyDescriptor(Blob.prototype, 'type')?.get;
  const nameGetter = Object.getOwnPropertyDescriptor(File.prototype, 'name')?.get;
  if (!sizeGetter || !typeGetter || !nameGetter) throw new Error('FILE_UNAVAILABLE');
  const size: unknown = Reflect.apply(sizeGetter, file, []);
  const mediaType: unknown = Reflect.apply(typeGetter, file, []);
  const fileName: unknown = Reflect.apply(nameGetter, file, []);
  if (!positiveId(size) || size > MAX_RECEIPT_BYTES || typeof mediaType !== 'string' || typeof fileName !== 'string') throw new Error('INVALID_FILE');
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reader.onabort = () => reject(new Error('FILE_UNAVAILABLE'));
    reader.onload = () => {
      try {
        const copy = copyBoundedBytes(new Uint8Array(reader.result as ArrayBuffer), MAX_RECEIPT_BYTES);
        if (copy.byteLength !== size) throw new Error('INVALID_FILE');
        resolve(copy);
      } catch { reject(new Error('FILE_UNAVAILABLE')); }
    };
    reader.readAsArrayBuffer(file);
  });
  return { kind: 'file', fileName, mediaType, bytes };
}

/** One form session, one immutable creation attempt. It never accepts an actor,
 * parent ID, ETag, Category, receipt URL or activation flag from entered data.
 * A failed/ambiguous submitted attempt stays locked and can only reconcile.
 * No storage of financial fields or receipt bytes in local/sessionStorage. */
export class ExpenseEntryAdapter {
  private context: IExpenseEntryContext | undefined;
  private loading: Promise<EntryAdmission> | undefined;
  private attempt: ICreateExpense | undefined;
  private flight: Promise<PersistenceResult> | undefined;
  private verifiedId: number | undefined;
  private verifiedRecord: IStoredExpense | undefined;
  public constructor(private readonly service: ExpensePersistenceService,
    private readonly contextReader: () => Promise<EntryAdmission>, private readonly newOperation: () => string = operationId) {}

  public get hasAttempt(): boolean { return this.attempt !== undefined; }
  public get currentOperationId(): string | undefined { return this.attempt?.operationId; }

  public load(): Promise<EntryAdmission> {
    if (!this.loading) this.loading = this.loadContext();
    return this.loading;
  }
  private async loadContext(): Promise<EntryAdmission> {
    this.context = undefined;
    try {
      const admission = await this.contextReader();
      if (admission.state !== 'Ready') return held();
      const c = own(admission.context, ['parentId', 'parentEtag', 'month', 'nominals', 'eligibleNominalCodes', 'existingExpenseIds', 'creationClearance']);
      if (!positiveId(c.parentId) || !etag(c.parentEtag) || typeof c.month !== 'string' || !parseUkDate(`01-${c.month.slice(5)}-${c.month.slice(0, 4)}`) ||
          !/^\d{4}-\d{2}$/.test(c.month) || !Array.isArray(c.nominals) || c.nominals.length !== 195 ||
          !Array.isArray(c.eligibleNominalCodes) || !Array.isArray(c.existingExpenseIds) ||
          (c.creationClearance !== 'Clear' && c.creationClearance !== 'Unresolved')) return held();
      const master = c.nominals as INominal[];
      if (new Set(master.map(n => n.code)).size !== 195 || nominalMaster.some(n => !master.some(m => m.code === n.code && m.description === n.description)) ||
          c.eligibleNominalCodes.some(code => typeof code !== 'string' || !master.some(n => n.code === code)) || c.existingExpenseIds.some(id => !positiveId(id))) return held();
      this.context = Object.freeze({ parentId: c.parentId, parentEtag: c.parentEtag, month: c.month,
        nominals: Object.freeze(nominalMaster.map(n => Object.freeze({ ...n }))),
        eligibleNominalCodes: Object.freeze([...c.eligibleNominalCodes] as string[]), existingExpenseIds: Object.freeze([...c.existingExpenseIds] as number[]), creationClearance: c.creationClearance });
      return { state: 'Ready', context: this.context };
    } catch { return held(); }
  }

  public save(input: IExpenseEntryDraft): Promise<PersistenceResult> {
    if (this.flight) return this.flight; // UI fields are locked before the first await.
    // A repeated click after ANY submitted outcome can only read reconciliation.
    const work = this.attempt ? this.service.checkSave(this.attempt) : this.create(input);
    this.flight = work.then(result => { this.remember(result); this.flight = undefined; return result; }, () => { this.flight = undefined; return pending(); });
    return this.flight;
  }
  private async create(input: IExpenseEntryDraft): Promise<PersistenceResult> {
    try {
      const d = own(input, ['date', 'supplier', 'description', 'nominalCode', 'amount', 'notes', 'receipt']);
      const kind = Object.getOwnPropertyDescriptor(d.receipt, 'kind')?.value;
      const r = own(d.receipt, kind === 'none' ? ['kind', 'reason'] : ['kind', 'file']);
      if ((await this.load()).state !== 'Ready') return { state: 'Held', code: 'TENANT_ADMISSION_HELD', tenantWriteAllowed: false };
      // A displayed Clear snapshot can age while the user edits. Refresh before
      // the first operation/file read; a submitted attempt only reconciles and
      // never refreshes its immutable parent/ETag or allocates a replacement.
      this.loading = this.loadContext();
      if ((await this.loading).state !== 'Ready' || !this.context) return { state: 'Held', code: 'TENANT_ADMISSION_HELD', tenantWriteAllowed: false };
      if (this.context.creationClearance !== 'Clear') return { state: 'Held', code: 'PRIOR_OPERATION_UNRESOLVED', tenantWriteAllowed: false };
      // Reject before reading/copying receipt bytes or allocating an operation.
      // No attempt exists yet, so the same retained form/file can be corrected.
      if (!expenseText(d.supplier) || !expenseText(d.description)) return reject('INVALID_EXPENSE_TEXT');
      const dateIso = typeof d.date === 'string' ? parseUkDate(d.date) : undefined;
      if (!dateIso?.startsWith(this.context.month + '-') || typeof d.amount !== 'string' || !parseAmountPence(d.amount) ||
          typeof d.nominalCode !== 'string' || !this.context.eligibleNominalCodes.includes(d.nominalCode)) return reject('INVALID_FORM');
      if (r.kind !== 'none' && r.kind !== 'file') return reject('INVALID_FORM');
      const receipt = r.kind === 'file' ? await fileReceipt(r.file as File) : { kind: 'none' as const, reason: r.reason };
      const command = snapshotCommand({ ...d, receipt, operationId: this.newOperation(), parentId: this.context.parentId, parentEtag: this.context.parentEtag });
      this.attempt = command;
      return await this.service.save(command);
    } catch { return this.attempt ? pending() : reject('INVALID_FORM_OR_RECEIPT'); }
  }
  public checkSave(): Promise<PersistenceResult> {
    return this.attempt ? this.save({} as IExpenseEntryDraft) : Promise.resolve(reject('NO_RETAINED_OPERATION'));
  }
  public async checkPreviousSave(): Promise<PersistenceResult> {
    if ((await this.load()).state !== 'Ready' || !this.context) return { state: 'Held', code: 'TENANT_ADMISSION_HELD', tenantWriteAllowed: false };
    const result = await this.service.recoverPrevious(this.context.parentId);
    this.remember(result); return result;
  }
  private remember(result: PersistenceResult): void {
    this.verifiedRecord = result.state === 'ReadbackVerified' ? snapshotStored(result.record) : undefined;
    if (this.verifiedRecord) this.verifiedId = this.verifiedRecord.line.id;
  }
  public async reopen(expenseId: number): Promise<PersistenceResult> {
    if ((await this.load()).state !== 'Ready' || !this.context) return { state: 'Held', code: 'TENANT_ADMISSION_HELD', tenantWriteAllowed: false };
    if (!positiveId(expenseId) || (!this.context.existingExpenseIds.includes(expenseId) && expenseId !== this.verifiedId)) return reject('UNBOUND_LINE');
    try { const result = await this.service.reopen(this.context.parentId, expenseId); this.remember(result); return result; }
    catch { return reject('LINE_UNAVAILABLE'); }
  }
  public async openReceipt(expenseId: number): Promise<ReceiptOpenResult> {
    if (!this.context || !this.verifiedRecord || !positiveId(expenseId) || expenseId !== this.verifiedId) return { state: 'Unavailable', tenantWriteAllowed: false };
    return this.service.openReceipt(this.context.parentId, expenseId, this.verifiedRecord);
  }
}

/** Sole runtime construction path. No URL/property/button/boolean can enable it.
 * A qualified Standard processor + authenticated context implementation and a
 * separately reviewed source change are required to replace this held wiring. */
export function createHeldExpenseEntry(): ExpenseEntryAdapter {
  return new ExpenseEntryAdapter(new ExpensePersistenceService(new HeldSharePointExpensePort(), browserSha256), async () => held());
}
