import { decodeRequest } from '../services/persistence/RequestLedgerExpensePort';
import { etag, positiveId } from '../services/persistence/PersistenceValidation';
import { sealedRequest } from './StandardExpenseProcessor';
import type { ISealedRequest } from './StandardExpenseProcessor';
import { readRequestContent, readRequestMetadata } from './SharePointStandardPlans';
import type { IStandardStoreIO } from './StandardStoreTransport';

/** Required own-data fields; extra OData system metadata is ignored. No getters
 * or inherited values can supply a field used as identity or write authority. */
export function row(value: unknown, fields: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_SERVER_ROW');
  const clean: Record<string, unknown> = {};
  for (const field of fields) {
    const d = Object.getOwnPropertyDescriptor(value, field);
    if (!d || !Object.prototype.hasOwnProperty.call(d, 'value')) throw new Error('INVALID_SERVER_ROW');
    clean[field] = d.value;
  }
  return clean;
}
export function serverEtag(value: unknown): string {
  if (!etag(value) || (value as string).startsWith('W/')) throw new Error('INVALID_SERVER_ETAG');
  return value as string;
}
function metadata(value: unknown, id: number, responseEtag?: string): { author: number; etag: string; uniqueId: string; size: number; fileEtag: string; name: string } {
  const r = row(value, ['Id', 'AuthorId', 'EditorId', 'OData__UIVersionString', 'File']);
  const f = row(r.File, ['UniqueId', 'Length', 'ETag', 'Name']);
  const token = serverEtag(responseEtag);
  if (r.Id !== id || !positiveId(r.AuthorId) || r.EditorId !== r.AuthorId || r.OData__UIVersionString !== '1.0' ||
    typeof f.UniqueId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(f.UniqueId) ||
    typeof f.Length !== 'string' || !/^[1-9]\d{0,8}$/.test(f.Length) || typeof f.Name !== 'string') throw new Error('UNSEALED_REQUEST');
  return { author: r.AuthorId, etag: token, uniqueId: f.UniqueId.toLowerCase(), size: Number(f.Length), fileEtag: serverEtag(f.ETag), name: f.Name };
}
export class SharePointRequestReader {
  public constructor(private readonly io: IStandardStoreIO, private readonly requestLibraryId: string) {}
  public async read(id: number): Promise<ISealedRequest> {
    const before = await this.io.execute(readRequestMetadata(this.requestLibraryId, id));
    if (before.status !== 200) throw new Error('REQUEST_UNAVAILABLE');
    const a = metadata(before.body, id, before.etag);
    const content = await this.io.binary(readRequestContent(this.requestLibraryId, id), true);
    const after = await this.io.execute(readRequestMetadata(this.requestLibraryId, id));
    if (after.status !== 200) throw new Error('REQUEST_UNAVAILABLE');
    const b = metadata(after.body, id, after.etag);
    if (JSON.stringify(a) !== JSON.stringify(b) || a.size !== content.byteLength) throw new Error('REQUEST_CHANGED');
    const payload = decodeRequest(content);
    if (a.name !== payload.command.operationId + '.json') throw new Error('REQUEST_NAME_MISMATCH');
    return sealedRequest({ id, authorId: a.author, editorId: a.author, version: 1, etag: a.etag, ...payload });
  }
}
