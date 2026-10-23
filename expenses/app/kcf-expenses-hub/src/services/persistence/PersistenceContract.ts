import type { IExpenseReadback } from './ExpenseReadback';

/** Proposed processor DTOs, NOT names of provisioned SharePoint columns/lists.
 * Actor, owner, role, nominal description and destination are never client input. */
export type ReceiptInput =
  | { readonly kind: 'none'; readonly reason: string }
  | { readonly kind: 'file'; readonly fileName: string; readonly mediaType: string; readonly bytes: Uint8Array };
export interface ICreateExpense {
  readonly operationId: string;
  readonly parentId: number;
  readonly parentEtag: string;
  readonly date: string;
  readonly supplier: string;
  readonly description: string;
  readonly nominalCode: string;
  readonly amount: string;
  readonly notes: string;
  readonly receipt: ReceiptInput;
}
export type PreparedReceipt =
  | { readonly kind: 'none'; readonly reason: string }
  | { readonly kind: 'file'; readonly fileName: string; readonly mediaType: string;
      readonly bytes: Uint8Array; readonly sha256: string };
export interface IPreparedExpense extends Omit<ICreateExpense, 'receipt'> { readonly receipt: PreparedReceipt; }
/** Both historical storage mechanisms exist. Only a qualified processor may
 * bind one to a line. No caller-supplied ReceiptUrl is followed. */
export type ReceiptStorage =
  | { readonly kind: 'list-attachment' }
  | { readonly kind: 'library-file'; readonly fileId: string };
export type StoredReceipt =
  | { readonly kind: 'none'; readonly reason: string }
  | { readonly kind: 'file'; readonly expenseId: number; readonly fileName: string;
      readonly mediaType: string; readonly size: number; readonly sha256: string; readonly storage: ReceiptStorage };
export interface IStoredExpense {
  readonly operationId: string;
  readonly requestFingerprint: string;
  readonly line: IExpenseReadback;
  readonly etag: string;
  readonly receipt: StoredReceipt;
}
/** Ports must use authenticated server identity and enforce every permission on
 * every request. Implementations must NOT take UI role/owner flags as authority.
 * This source batch supplies a held live port and a test-only fake processor. */
export interface IExpensePersistencePort {
  submit(command: IPreparedExpense): Promise<unknown>;
  resolve(operationId: string): Promise<unknown>;
  readExpense(parentId: number, expenseId: number): Promise<unknown>;
  readReceipt(receipt: Extract<StoredReceipt, { kind: 'file' }>): Promise<Uint8Array>;
  /** Authenticated protected-ledger lookup; no browser-retained operation needed. */
  recoverPrevious?(parentId: number): Promise<unknown>;
}
export type PersistenceResult =
  | { readonly state: 'Held' | 'Rejected' | 'Pending'; readonly code: string; readonly tenantWriteAllowed: false }
  | { readonly state: 'ReadbackVerified'; readonly record: IStoredExpense; readonly tenantWriteAllowed: false;
      readonly securityProven: false };
export type Digest = (bytes: Uint8Array) => Promise<string>;
/** Versioned canonical creation identity. Processor recomputes this from its
 * immutable request; it must never trust a caller-supplied digest as authority. */
export function creationIdentity(c: IPreparedExpense): string {
  return JSON.stringify(['expense-create-v1', c.operationId, c.parentId, c.parentEtag, c.date,
    c.supplier, c.description, c.nominalCode, c.amount, c.notes,
    c.receipt.kind === 'none' ? ['none', c.receipt.reason]
      : ['file', c.receipt.fileName, c.receipt.mediaType, c.receipt.bytes.length, c.receipt.sha256]]);
}
export type ReceiptOpenResult =
  | { readonly state: 'Unavailable'; readonly tenantWriteAllowed: false }
  | { readonly state: 'ReceiptBytesVerified'; readonly expenseId: number; readonly fileName: string;
      readonly mediaType: string; readonly bytes: Uint8Array; readonly tenantWriteAllowed: false };

export async function browserSha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('DIGEST_UNAVAILABLE');
  const result = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
}

export const ADMISSION_GATES = Object.freeze([
  'CategoryContract', 'DistinctReasonStorage', '195NominalEqualityAndPostingPolicy',
  'ProtectedRequestResultLedger', 'OriginatorAndRawUnrelatedUserDenial',
  'ReceiptStorageBindingAndRawAccess', 'StandardLicenceZeroCost', 'AtomicDuplicateAndRecovery'
]);

/** Deliberately no configurable "approved" boolean, POST method or live writer.
 * A reviewed implementation and exact tenant authority must replace this class. */
export class HeldSharePointExpensePort implements IExpensePersistencePort {
  public async submit(_command: IPreparedExpense): Promise<unknown> { return { state: 'Held' }; }
  public async resolve(_operationId: string): Promise<unknown> { return { state: 'Held' }; }
  public async readExpense(_parentId: number, _expenseId: number): Promise<unknown> { return { state: 'Held' }; }
  public async readReceipt(_receipt: Extract<StoredReceipt, { kind: 'file' }>): Promise<Uint8Array> {
    throw new Error('TENANT_ADMISSION_HELD');
  }
}
