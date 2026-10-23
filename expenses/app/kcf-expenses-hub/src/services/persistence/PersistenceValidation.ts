import { parseAmountPence, parseUkDate } from '../../domain/expenseRules';
import type { ICreateExpense, IStoredExpense, ReceiptInput, StoredReceipt } from './PersistenceContract';
import { copyBoundedBytes } from './BoundedBody';

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // Existing prototype bound; tenant policy remains open.
// Captured native Supplier/ExpenseDescription Text capacity. Count UTF-16 units
// conservatively; never truncate or normalise an entered/stored financial value.
export const MAX_EXPENSE_TEXT_CHARS = 255;
export const expenseText = (v: unknown): v is string => typeof v === 'string' &&
  v.trim().length > 0 && v.length <= MAX_EXPENSE_TEXT_CHARS;
export const positiveId = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
export const etag = (v: unknown): v is string => typeof v === 'string' && /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"(?![\s\S])/.test(v);
export const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
export const operation = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9-]{16,80}$/.test(v);
export const fileName = (v: unknown): v is string => typeof v === 'string' && v.length <= 120 &&
  /^[\w ()-]+\.(?:png|jpe?g|pdf)$/i.test(v);
const media = (name: string, type: unknown): boolean => /\.png$/i.test(name) ? type === 'image/png'
  : /\.jpe?g$/i.test(name) ? type === 'image/jpeg' : type === 'application/pdf';
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= 2000;

/** Snapshot own data only: rejects getters, inherited fields, symbols and extras.
 * Proxy traps are contained; this is shape hygiene, never authentication. */
export function own(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_SHAPE');
  const proto = Object.getPrototypeOf(input);
  if (proto !== null && proto !== Object.prototype) throw new Error('INVALID_SHAPE');
  const ds = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(ds).length !== keys.length) throw new Error('INVALID_SHAPE');
  const copy: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = ds[key];
    if (!d || !Object.prototype.hasOwnProperty.call(d, 'value')) throw new Error('INVALID_SHAPE');
    copy[key] = d.value;
  }
  return copy;
}

export function snapshotCommand(input: unknown): ICreateExpense {
  const v = own(input, ['operationId', 'parentId', 'parentEtag', 'date', 'supplier', 'description', 'nominalCode', 'amount', 'notes', 'receipt']);
  if (!operation(v.operationId) || !positiveId(v.parentId) || !etag(v.parentEtag) || typeof v.date !== 'string' ||
      !parseUkDate(v.date) || !expenseText(v.supplier) || !expenseText(v.description) ||
      typeof v.nominalCode !== 'string' || !/^\d{5}$/.test(v.nominalCode) || typeof v.amount !== 'string' ||
      parseAmountPence(v.amount) === undefined || typeof v.notes !== 'string' || v.notes.length > 2000) throw new Error('INVALID_COMMAND');
  let receipt: ReceiptInput;
  // Inspect kind without invoking caller code; exact union allowlist follows.
  const kind = Object.getOwnPropertyDescriptor(v.receipt, 'kind')?.value;
  if (kind === 'none') {
    const r = own(v.receipt, ['kind', 'reason']);
    if (!nonempty(r.reason)) throw new Error('REASON_REQUIRED');
    receipt = { kind: 'none', reason: r.reason };
  } else {
    const r = own(v.receipt, ['kind', 'fileName', 'mediaType', 'bytes']);
    if (r.kind !== 'file' || !fileName(r.fileName) || typeof r.mediaType !== 'string' || !media(r.fileName, r.mediaType)) throw new Error('INVALID_RECEIPT');
    // Check intrinsic size BEFORE allocation, then validate the actual copy.
    const bytes = copyBoundedBytes(r.bytes, MAX_RECEIPT_BYTES);
    const signature = r.mediaType === 'image/png' ? [137, 80, 78, 71, 13, 10, 26, 10]
      : r.mediaType === 'image/jpeg' ? [255, 216, 255] : [37, 80, 68, 70, 45];
    if (!signature.every((b, i) => bytes[i] === b)) throw new Error('INVALID_RECEIPT');
    // Screening is NOT malware scanning, full parsing or permission proof.
    receipt = { kind: 'file', fileName: r.fileName, mediaType: r.mediaType, bytes };
  }
  return { ...v, receipt } as unknown as ICreateExpense;
}

export function snapshotStored(input: unknown): IStoredExpense {
  const v = own(input, ['operationId', 'requestFingerprint', 'line', 'etag', 'receipt']);
  const l = own(v.line, ['id', 'expenseLineKey', 'parentId', 'dateIso', 'supplier', 'description', 'nominalCode',
    'nominalDescription', 'amountPence', 'notes', 'isVoided']);
  const date = typeof l.dateIso === 'string' ? l.dateIso.split('-').reverse().join('-') : '';
  if (!operation(v.operationId) || !hash(v.requestFingerprint) || !etag(v.etag) || !positiveId(l.id) || !positiveId(l.parentId) ||
      !positiveId(l.amountPence) || parseUkDate(date) !== l.dateIso || !nonempty(l.expenseLineKey) ||
      !expenseText(l.supplier) || !expenseText(l.description) || !nonempty(l.nominalDescription) ||
      typeof l.nominalCode !== 'string' || !/^\d{5}$/.test(l.nominalCode) || typeof l.notes !== 'string' ||
      l.isVoided !== false) throw new Error('INVALID_RECORD');
  let receipt: StoredReceipt;
  const kind = Object.getOwnPropertyDescriptor(v.receipt, 'kind')?.value;
  if (kind === 'none') {
    const r = own(v.receipt, ['kind', 'reason']);
    if (!nonempty(r.reason)) throw new Error('INVALID_REASON_READBACK');
    receipt = { kind: 'none', reason: r.reason };
  } else {
    const r = own(v.receipt, ['kind', 'expenseId', 'fileName', 'mediaType', 'size', 'sha256', 'storage']);
    if (r.kind !== 'file' || r.expenseId !== l.id || !fileName(r.fileName) || typeof r.mediaType !== 'string' ||
        !media(r.fileName, r.mediaType) || !positiveId(r.size) || r.size > MAX_RECEIPT_BYTES || !hash(r.sha256)) throw new Error('INVALID_RECEIPT_BINDING');
    const storageKind = Object.getOwnPropertyDescriptor(r.storage, 'kind')?.value;
    const s = own(r.storage, storageKind === 'list-attachment' ? ['kind'] : ['kind', 'fileId']);
    if (s.kind !== 'list-attachment' && (s.kind !== 'library-file' || typeof s.fileId !== 'string' ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(s.fileId))) throw new Error('INVALID_STORAGE');
    receipt = { ...r, storage: { ...s } } as unknown as StoredReceipt;
  }
  return { operationId: v.operationId, requestFingerprint: v.requestFingerprint, line: { ...l }, etag: v.etag, receipt } as unknown as IStoredExpense;
}
