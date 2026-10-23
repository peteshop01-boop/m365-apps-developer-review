import { copyBoundedBytes, intrinsicByteLength } from './BoundedBody';
import { creationIdentity } from './PersistenceContract';
import type { Digest, IExpensePersistencePort, IPreparedExpense, StoredReceipt } from './PersistenceContract';
import { hash, MAX_RECEIPT_BYTES, own, snapshotCommand } from './PersistenceValidation';

// Separate wire-format bound: a 10MiB receipt expands in base64, plus bounded
// metadata. This does not raise the reviewed receipt or HTTP readback caps.
export const MAX_ENVELOPE_BYTES = 4 * Math.ceil(MAX_RECEIPT_BYTES / 3) + 64 * 1024;
export function copyRequestEnvelope(value: unknown): Uint8Array {
  const size = intrinsicByteLength(value);
  if (size > MAX_ENVELOPE_BYTES) throw new Error('ENVELOPE_TOO_LARGE');
  const copy = new Uint8Array(value as Uint8Array);
  if (intrinsicByteLength(copy) !== size) throw new Error('INVALID_ENVELOPE');
  return copy;
}
function base64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...Array.from(bytes.subarray(i, i + 8192)));
  return btoa(text);
}
export function encodeRequest(command: IPreparedExpense, clientFingerprint: string): Uint8Array {
  if (!hash(clientFingerprint)) throw new Error('INVALID_FINGERPRINT');
  const receipt = command.receipt.kind === 'none' ? command.receipt : { ...command.receipt, bytes: base64(copyBoundedBytes(command.receipt.bytes, MAX_RECEIPT_BYTES)) };
  return copyRequestEnvelope(new TextEncoder().encode(JSON.stringify({ schema: 1, command: { ...command, receipt }, clientFingerprint })));
}
export function decodeRequest(bytes: Uint8Array): { command: IPreparedExpense; clientFingerprint: string } {
  const value = own(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(copyRequestEnvelope(bytes))), ['schema', 'command', 'clientFingerprint']);
  if (value.schema !== 1 || !hash(value.clientFingerprint)) throw new Error('INVALID_ENVELOPE');
  const c = own(value.command, ['operationId', 'parentId', 'parentEtag', 'date', 'supplier', 'description', 'nominalCode', 'amount', 'notes', 'receipt']);
  const kind = Object.getOwnPropertyDescriptor(c.receipt, 'kind')?.value;
  const r = own(c.receipt, kind === 'none' ? ['kind', 'reason'] : ['kind', 'fileName', 'mediaType', 'bytes', 'sha256']);
  let receipt: unknown;
  if (kind === 'none') receipt = r;
  else {
    if (!hash(r.sha256) || typeof r.bytes !== 'string' || r.bytes.length > 4 * Math.ceil(MAX_RECEIPT_BYTES / 3) ||
        r.bytes.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(r.bytes)) throw new Error('INVALID_BYTES');
    const text = atob(r.bytes); const actual = Uint8Array.from(text, c => c.charCodeAt(0));
    if (base64(actual) !== r.bytes) throw new Error('NONCANONICAL_BYTES');
    receipt = { kind: r.kind, fileName: r.fileName, mediaType: r.mediaType, bytes: actual };
  }
  const clean = snapshotCommand({ ...c, receipt });
  return { command: { ...clean, receipt: clean.receipt.kind === 'none' ? clean.receipt : { ...clean.receipt, sha256: r.sha256 as string } }, clientFingerprint: value.clientFingerprint };
}

/** All access is under the actual authenticated caller. The channel must enforce
 * raw request/result/line/file ACLs; no actor parameter or application role flag.
 * A whole immutable request file avoids a created-item/late-attachment race.
 * No live implementation is composed until Standard/identity/schema qualification. */
export interface IAuthenticatedRequestLedgerChannel {
  createImmutableRequest(operationId: string, envelope: Uint8Array): Promise<void>;
  readOwnOperation(operationId: string): Promise<unknown>;
  readOwnPrevious(parentId: number): Promise<unknown>;
  readOwnLine(parentId: number, expenseId: number): Promise<unknown>;
  readOwnReceipt(receipt: Extract<StoredReceipt, { kind: 'file' }>): Promise<Uint8Array>;
}
export class RequestLedgerExpensePort implements IExpensePersistencePort {
  public constructor(private readonly channel: IAuthenticatedRequestLedgerChannel, private readonly digest: Digest) {}
  public async submit(command: IPreparedExpense): Promise<unknown> {
    const fingerprint = await this.digest(new TextEncoder().encode(creationIdentity(command)));
    const envelope = encodeRequest(command, fingerprint);
    // Exactly one request write. Uncertain acknowledgement is reconciled by the
    // caller's existing persistence service, never a transport-level POST retry.
    await this.channel.createImmutableRequest(command.operationId, envelope);
    return this.resolve(command.operationId);
  }
  public resolve(operationId: string): Promise<unknown> { return this.channel.readOwnOperation(operationId); }
  public recoverPrevious(parentId: number): Promise<unknown> { return this.channel.readOwnPrevious(parentId); }
  public readExpense(parentId: number, expenseId: number): Promise<unknown> { return this.channel.readOwnLine(parentId, expenseId); }
  public readReceipt(receipt: Extract<StoredReceipt, { kind: 'file' }>): Promise<Uint8Array> { return this.channel.readOwnReceipt(receipt); }
}
