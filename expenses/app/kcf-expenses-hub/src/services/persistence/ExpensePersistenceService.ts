import { parseAmountPence, parseUkDate } from '../../domain/expenseRules';
import { creationIdentity } from './PersistenceContract';
import type { Digest, ICreateExpense, IExpensePersistencePort, IPreparedExpense, IStoredExpense, PersistenceResult, ReceiptOpenResult } from './PersistenceContract';
import { hash, operation, own, positiveId, snapshotCommand, snapshotStored } from './PersistenceValidation';

const failure = (state: 'Held' | 'Rejected' | 'Pending', code: string): PersistenceResult => ({ state, code, tenantWriteAllowed: false });
type Outcome = { state: 'Ready'; record: IStoredExpense } | { state: 'Held' | 'Rejected' | 'Pending' | 'Absent' };
function outcome(value: unknown): Outcome {
  const state = Object.getOwnPropertyDescriptor(value, 'state')?.value;
  const v = own(value, state === 'Ready' ? ['state', 'record'] : ['state']);
  if (v.state === 'Ready') return { state: 'Ready', record: snapshotStored(v.record) };
  if (v.state === 'Held' || v.state === 'Rejected' || v.state === 'Pending' || v.state === 'Absent') return { state: v.state };
  throw new Error('INVALID_PROCESSOR_RESULT');
}
export function matchesPreparedExpense(command: IPreparedExpense, record: IStoredExpense): boolean {
  const l = record.line; const r = record.receipt; const c = command.receipt;
  return record.operationId === command.operationId && l.parentId === command.parentId &&
    l.dateIso === parseUkDate(command.date) && l.supplier === command.supplier && l.description === command.description &&
    l.nominalCode === command.nominalCode && l.amountPence === parseAmountPence(command.amount) && l.notes === command.notes &&
    (c.kind === 'none' ? r.kind === 'none' && c.reason === r.reason : r.kind === 'file' &&
      c.fileName === r.fileName && c.mediaType === r.mediaType && c.bytes.length === r.size && c.sha256 === r.sha256);
}
/** Service orchestration for the qualified processor boundary. The webpart's
 * separate D01 form uses the held port. Server decisions remain server responsibilities.
 * No browser state or cached result substitutes for a fresh expense/receipt read. */
export class ExpensePersistenceService {
  private readonly inFlight = new Map<string, { fingerprint: string; result: Promise<PersistenceResult> }>();
  public constructor(private readonly port: IExpensePersistencePort, private readonly digest: Digest) {}

  public async save(input: ICreateExpense): Promise<PersistenceResult> {
    let command: IPreparedExpense;
    let fingerprint: string;
    try {
      const copy = snapshotCommand(input);
      if (copy.receipt.kind === 'none') command = { ...copy, receipt: copy.receipt };
      else {
        const sha256 = await this.digest(new Uint8Array(copy.receipt.bytes));
        if (!hash(sha256)) throw new Error('INVALID_HASH');
        command = { ...copy, receipt: { ...copy.receipt, sha256 } };
      }
      fingerprint = await this.digest(new TextEncoder().encode(creationIdentity(command)));
      if (!hash(fingerprint)) throw new Error('INVALID_HASH');
    } catch { return failure('Rejected', 'INVALID_EXPENSE_OR_RECEIPT'); }
    const running = this.inFlight.get(command.operationId);
    if (running) return running.fingerprint === fingerprint ? running.result : failure('Rejected', 'OPERATION_REUSED');
    const result = this.submitOnce(command, fingerprint);
    this.inFlight.set(command.operationId, { fingerprint, result });
    try { return await result; } finally { this.inFlight.delete(command.operationId); }
  }

  /** Reconcile a retained creation attempt without ever submitting again.
   * Absent is still uncertain here: only the protected processor can establish
   * durable operation outcome. UI refresh/retry must not allocate another ID. */
  public async checkSave(input: ICreateExpense): Promise<PersistenceResult> {
    try {
      const copy = snapshotCommand(input);
      const command: IPreparedExpense = copy.receipt.kind === 'none' ? { ...copy, receipt: copy.receipt }
        : { ...copy, receipt: { ...copy.receipt, sha256: await this.digest(new Uint8Array(copy.receipt.bytes)) } };
      if (command.receipt.kind === 'file' && !hash(command.receipt.sha256)) throw new Error('INVALID_HASH');
      const fingerprint = await this.digest(new TextEncoder().encode(creationIdentity(command)));
      if (!hash(fingerprint)) throw new Error('INVALID_HASH');
      const value = outcome(await this.port.resolve(command.operationId));
      if (value.state !== 'Ready') return failure(value.state === 'Held' ? 'Held' : value.state === 'Rejected' ? 'Rejected' : 'Pending',
        value.state === 'Held' ? 'TENANT_ADMISSION_HELD' : value.state === 'Rejected' ? 'SERVER_REJECTED' : 'SAVE_UNCONFIRMED');
      if (value.record.requestFingerprint !== fingerprint || !matchesPreparedExpense(command, value.record)) return failure('Rejected', 'OPERATION_READBACK_MISMATCH');
      return await this.verify(value.record);
    } catch { return failure('Pending', 'SAVE_UNCONFIRMED'); }
  }

  private async submitOnce(command: IPreparedExpense, fingerprint: string): Promise<PersistenceResult> {
    try {
      // Resolve first, including after a new service instance (Close/Reopen).
      // Only an authoritative Absent permits one submission. Failures do NOT.
      let value = outcome(await this.port.resolve(command.operationId));
      if (value.state === 'Absent') {
        try {
          // The transport receives a separate copy, never the verification snapshot.
          const submitted: IPreparedExpense = { ...command, receipt: command.receipt.kind === 'none' ? { ...command.receipt }
            : { ...command.receipt, bytes: new Uint8Array(command.receipt.bytes) } };
          value = outcome(await this.port.submit(submitted));
        }
        catch {
          // Unknown write outcome: one read-only reconciliation, never another POST.
          value = outcome(await this.port.resolve(command.operationId));
          if (value.state === 'Absent') return failure('Pending', 'SAVE_UNCONFIRMED');
        }
      }
      if (value.state !== 'Ready') return failure(value.state === 'Held' ? 'Held' : value.state === 'Rejected' ? 'Rejected' : 'Pending',
        value.state === 'Held' ? 'TENANT_ADMISSION_HELD' : value.state === 'Rejected' ? 'SERVER_REJECTED' : 'SAVE_UNCONFIRMED');
      if (value.record.requestFingerprint !== fingerprint || !matchesPreparedExpense(command, value.record)) return failure('Rejected', 'OPERATION_READBACK_MISMATCH');
      return await this.verify(value.record);
    } catch { return failure('Pending', 'SAVE_UNCONFIRMED'); }
  }

  public async reopen(parentId: number, expenseId: number): Promise<PersistenceResult> {
    if (!positiveId(parentId) || !positiveId(expenseId)) return failure('Rejected', 'INVALID_LINE_ID');
    try {
      const value = outcome(await this.port.readExpense(parentId, expenseId));
      if (value.state === 'Held') return failure('Held', 'TENANT_ADMISSION_HELD');
      if (value.state !== 'Ready') return failure('Rejected', 'LINE_UNAVAILABLE');
      if (value.record.line.id !== expenseId || value.record.line.parentId !== parentId || !operation(value.record.operationId)) {
        return failure('Rejected', 'LINE_BINDING_MISMATCH');
      }
      return await this.verify(value.record);
    } catch { return failure('Rejected', 'LINE_UNAVAILABLE'); }
  }

  /** Cold-session recovery is read-only. Absence is not permission to resubmit
   * or clear admission; that decision belongs to the qualified context reader. */
  public async recoverPrevious(parentId: number): Promise<PersistenceResult> {
    if (!positiveId(parentId) || !this.port.recoverPrevious) return failure('Held', 'RECOVERY_NOT_QUALIFIED');
    try {
      const value = outcome(await this.port.recoverPrevious(parentId));
      if (value.state !== 'Ready') return failure(value.state === 'Rejected' ? 'Rejected' : value.state === 'Held' ? 'Held' : 'Pending', 'PRIOR_OPERATION_UNCONFIRMED');
      if (value.record.line.parentId !== parentId) return failure('Rejected', 'PRIOR_OPERATION_PARENT_MISMATCH');
      return await this.verify(value.record);
    } catch { return failure('Pending', 'PRIOR_OPERATION_UNCONFIRMED'); }
  }

  /** Returns verified bytes only. No external URL/new-window navigation is
   * generated; an eventual UI uses its contained viewer and revokes blob URLs. */
  public async openReceipt(parentId: number, expenseId: number, expected?: IStoredExpense): Promise<ReceiptOpenResult> {
    try {
      const reopened = await this.reopen(parentId, expenseId);
      if (reopened.state !== 'ReadbackVerified' || reopened.record.receipt.kind !== 'file') throw new Error('UNAVAILABLE');
      // A displayed line must not acquire a newer/different receipt silently.
      if (expected && JSON.stringify(reopened.record) !== JSON.stringify(expected)) throw new Error('UNAVAILABLE');
      const receipt = reopened.record.receipt;
      const bytes = new Uint8Array(await this.port.readReceipt({ ...receipt, storage: { ...receipt.storage } }));
      if (bytes.length !== receipt.size || await this.digest(new Uint8Array(bytes)) !== receipt.sha256) throw new Error('UNAVAILABLE');
      const final = outcome(await this.port.readExpense(parentId, expenseId));
      if (final.state !== 'Ready' || JSON.stringify(final.record) !== JSON.stringify(reopened.record)) throw new Error('UNAVAILABLE');
      return { state: 'ReceiptBytesVerified', expenseId, fileName: receipt.fileName, mediaType: receipt.mediaType, bytes, tenantWriteAllowed: false };
    } catch { return { state: 'Unavailable', tenantWriteAllowed: false }; }
  }

  private async verify(expected: IStoredExpense): Promise<PersistenceResult> {
    const current = outcome(await this.port.readExpense(expected.line.parentId, expected.line.id));
    if (current.state !== 'Ready' || JSON.stringify(current.record) !== JSON.stringify(expected)) return failure('Pending', 'LINE_CHANGED_OR_UNAVAILABLE');
    const receipt = current.record.receipt;
    if (receipt.kind === 'file') {
      const bytes = await this.port.readReceipt({ ...receipt, storage: { ...receipt.storage } });
      if (!(bytes instanceof Uint8Array) || bytes.length !== receipt.size || await this.digest(new Uint8Array(bytes)) !== receipt.sha256) {
        return failure('Pending', 'RECEIPT_NOT_VERIFIED');
      }
      const after = outcome(await this.port.readExpense(expected.line.parentId, expected.line.id));
      if (after.state !== 'Ready' || JSON.stringify(after.record) !== JSON.stringify(current.record)) return failure('Pending', 'LINE_CHANGED_OR_UNAVAILABLE');
    }
    return { state: 'ReadbackVerified', record: current.record, tenantWriteAllowed: false, securityProven: false };
  }
}
