import type { SPHttpClient, SPHttpClientConfiguration, SPHttpClientResponse } from '@microsoft/sp-http';
import {
  OPTION_E_DRAFT_SCHEMA_VERSION,
  canonicaliseOptionEPartialDraft,
  parseCanonicalOptionEPartialDraft,
  type IOptionEWorkplanDraftAggregate
} from '../models/OptionEWorkplanDraftModels';
import type { IOptionEDraftGatewayBindings } from './OptionEWorkplanListBindings';
import { OPTION_E_DRAFT_V3_SCHEMA_VERSION, type IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
import { canonicaliseOptionEPartialDraftV3, parseCanonicalOptionEPartialDraftV3,
  prepareOptionEPartialDraftV3, reopenOptionEPartialDraftV3, type IPreparedPrivateDraftV3 } from './OptionEWorkplanDraftV3Wire';

export type OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate | IOptionEWorkplanDraftV3Aggregate;
export type OptionEPrivateDraftSchema = OptionEPrivateDraftAggregate['schemaVersion'];
export type OptionEDraftPrepared<T extends OptionEPrivateDraftAggregate> =
  T extends IOptionEWorkplanDraftV3Aggregate ? IPreparedPrivateDraftV3 : IOptionEDraftPreparedPayload;

/** Fixed repository codecs; version selection is not native write admission. */
export const canonicalisePrivateDraftForSchema = (value: OptionEPrivateDraftAggregate, schema: OptionEPrivateDraftSchema): string => {
  if (value.schemaVersion !== schema) throw new Error('The private Draft body does not match its selected schema.');
  if (schema === OPTION_E_DRAFT_SCHEMA_VERSION) return canonicaliseOptionEPartialDraft(value);
  if (schema === OPTION_E_DRAFT_V3_SCHEMA_VERSION) return canonicaliseOptionEPartialDraftV3(value);
  throw new Error('Unsupported private Draft schema.');
};

export interface IOptionEDraftOpenContext {
  performanceYear: number;
}

export interface IOptionEDraftPreparedPayload {
  aggregate: IOptionEWorkplanDraftAggregate;
  payloadJson: string;
  payloadSha256: string;
}

export interface IOptionEDraftContentRecord<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> {
  itemId: number;
  etag: string;
  aggregate: T;
  payloadJson: string;
  payloadSha256: string;
  clientSaveId?: string;
  clientSavedAt?: string;
  modified?: string;
  editorEmail?: string;
  editorDisplayName?: string;
}

export interface IOptionEProtectedDraftBinding<S extends OptionEPrivateDraftSchema = typeof OPTION_E_DRAFT_SCHEMA_VERSION> {
  peopleItemId: number;
  peopleUniqueId: string;
  email: string;
  personKey: string;
  workplanItemId: number;
  workplanUniqueId: string;
  workplanEtag: string;
  workplanKey: string;
  performanceYear: number;
  draftItemId: number;
  draftSchemaVersion: S;
  state: 'Draft' | 'ChangesRequested';
  transitionStatus: 'Ready';
  pendingRequestKey: '';
  rowVersionToken: number;
}

export interface IOptionEDraftCanonicalRecord<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> extends IOptionEDraftContentRecord<T> {
  binding: Readonly<IOptionEProtectedDraftBinding<T['schemaVersion']>>;
}

export interface IOptionEDraftContentExactUpdate<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> {
  itemId: number;
  expectedEtag: string;
  prepared: OptionEDraftPrepared<T>;
  clientSaveId: string;
  clientSavedAt: string;
}

export interface IOptionEDraftExactUpdate<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> extends IOptionEDraftContentExactUpdate<T> {
  context: IOptionEDraftOpenContext;
  expectedBinding: Readonly<IOptionEProtectedDraftBinding<T['schemaVersion']>>;
}

export interface IOptionEDraftItemStore<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> {
  prepare(aggregate: T): Promise<OptionEDraftPrepared<T>>;
  readExact(itemId: number): Promise<IOptionEDraftContentRecord<T>>;
  updateExact(request: IOptionEDraftContentExactUpdate<T>): Promise<void>;
}

export interface IOptionEDraftGateway<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> {
  prepare(aggregate: T): Promise<OptionEDraftPrepared<T>>;
  read(context: IOptionEDraftOpenContext,
    expected?: Readonly<IOptionEProtectedDraftBinding<T['schemaVersion']>>): Promise<IOptionEDraftCanonicalRecord<T>>;
  updateExact(request: IOptionEDraftExactUpdate<T>): Promise<void>;
}

export interface IOptionEDraftHasher {
  sha256Hex(value: string): Promise<string>;
}

export type OptionEDraftRouteErrorCode =
  | 'EMPLOYEE_MISSING'
  | 'EMPLOYEE_DUPLICATE'
  | 'EMPLOYEE_INACTIVE'
  | 'EMPLOYEE_INACCESSIBLE'
  | 'CONTROL_MISSING'
  | 'CONTROL_DUPLICATE'
  | 'CONTROL_INACCESSIBLE'
  | 'CONTROL_BINDING_STALE'
  | 'CONTROL_IDENTITY_INVALID'
  | 'CONTROL_NON_EDITABLE'
  | 'CONTROL_NOT_READY'
  | 'CONTROL_PENDING'
  | 'CONTROL_SCHEMA_MISMATCH'
  | 'DRAFT_ITEM_INVALID'
  | 'DRAFT_UNAVAILABLE'
  | 'DRAFT_INVALID';

export class OptionEDraftRouteError extends Error {
  public constructor(public readonly code: OptionEDraftRouteErrorCode, message: string) {
    super(message);
    this.name = 'OptionEDraftRouteError';
    Object.setPrototypeOf(this, OptionEDraftRouteError.prototype);
  }
}

export class OptionEDraftConflictError extends Error {
  public constructor() {
    super('The Draft changed after it was loaded. Your changes are retained.');
    this.name = 'OptionEDraftConflictError';
    Object.setPrototypeOf(this, OptionEDraftConflictError.prototype);
  }
}

export class OptionEDraftAmbiguousWriteError extends Error {
  public constructor(message = 'The Draft update outcome is ambiguous and requires canonical readback.') {
    super(message);
    this.name = 'OptionEDraftAmbiguousWriteError';
    Object.setPrototypeOf(this, OptionEDraftAmbiguousWriteError.prototype);
  }
}

const SHA256 = /^[A-F0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const specificEtag = (value: unknown): value is string =>
  typeof value === 'string' && /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]+"$/.test(value);
const nonBlank = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
const escapeOData = (value: string): string => value.replace(/'/g, "''");

const defaultHasher: IOptionEDraftHasher = {
  async sha256Hex(value: string): Promise<string> {
    if (!globalThis.crypto?.subtle || typeof globalThis.TextEncoder !== 'function') {
      throw new Error('SHA-256 is unavailable in this browser. The Draft was not saved.');
    }
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
};

const assertBindings = (bindings: IOptionEDraftGatewayBindings): void => {
  if (bindings.draftsListTitle !== 'KCFKPI_WorkplanDrafts') {
    throw new OptionEDraftRouteError('DRAFT_INVALID', 'Option E Draft list title is not the accepted V2 binding.');
  }
  const expected = ['Id', 'DraftPayloadJSON', 'DraftPayloadSHA256', 'ClientSaveID', 'ClientSavedAt', 'Modified', 'Editor'];
  const actual = Object.values(bindings.fieldNames);
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new OptionEDraftRouteError('DRAFT_INVALID', 'Option E Draft fields are not the exact accepted four-field V2 binding.');
  }
};

interface IOptionEDraftRow extends Record<string, unknown> {
  Id?: number;
  '@odata.etag'?: string;
}

export class OptionEDraftSharePointGateway<T extends OptionEPrivateDraftAggregate = IOptionEWorkplanDraftAggregate> implements IOptionEDraftItemStore<T> {
  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly bindings: IOptionEDraftGatewayBindings,
    private readonly spHttpConfiguration: SPHttpClientConfiguration,
    private readonly hasher: IOptionEDraftHasher = defaultHasher,
    public readonly schemaVersion: T['schemaVersion'] = OPTION_E_DRAFT_SCHEMA_VERSION as T['schemaVersion']
  ) {
    assertBindings(bindings);
    if (schemaVersion !== OPTION_E_DRAFT_SCHEMA_VERSION && schemaVersion !== OPTION_E_DRAFT_V3_SCHEMA_VERSION) {
      throw new OptionEDraftRouteError('CONTROL_SCHEMA_MISMATCH', 'Unsupported private Draft schema.');
    }
    if (!/^https:\/\//i.test(webAbsoluteUrl)) {
      throw new OptionEDraftRouteError('DRAFT_INVALID', 'Option E Draft web URL must be an absolute HTTPS URL.');
    }
  }

  public async prepare(aggregate: T): Promise<OptionEDraftPrepared<T>> {
    if (this.schemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION) {
      if (aggregate.schemaVersion !== OPTION_E_DRAFT_V3_SCHEMA_VERSION) throw new Error('Private Draft schema mismatch.');
      return await prepareOptionEPartialDraftV3(aggregate as IOptionEWorkplanDraftV3Aggregate, this.hasher) as OptionEDraftPrepared<T>;
    }
    const payloadJson = canonicalisePrivateDraftForSchema(aggregate, this.schemaVersion);
    const payloadSha256 = (await this.hasher.sha256Hex(payloadJson)).toUpperCase();
    if (!SHA256.test(payloadSha256)) throw new Error('Option E Draft SHA-256 provider returned an invalid digest.');
    return { aggregate: JSON.parse(payloadJson) as IOptionEWorkplanDraftAggregate, payloadJson, payloadSha256 } as OptionEDraftPrepared<T>;
  }

  public async readExact(itemId: number): Promise<IOptionEDraftContentRecord<T>> {
    if (!Number.isSafeInteger(itemId) || itemId < 1) {
      throw new OptionEDraftRouteError('DRAFT_ITEM_INVALID', 'Option E Draft item ID must be a positive canonical integer.');
    }
    const fields = this.bindings.fieldNames;
    const select = [fields.id, '@odata.etag', fields.draftPayloadJson, fields.draftPayloadSha256,
      fields.clientSaveId, fields.clientSavedAt, fields.modified, `${fields.editor}/EMail`,
      `${fields.editor}/Title`].join(',');
    const url = `${this.listItemsUrl()}(${itemId})?$select=${select}&$expand=${fields.editor}`;
    let response: SPHttpClientResponse;
    try {
      response = await this.spHttpClient.get(url, this.spHttpConfiguration, {
        headers: { Accept: 'application/json;odata=nometadata' }
      });
    } catch {
      throw new OptionEDraftRouteError('DRAFT_UNAVAILABLE', 'The exact Option E Draft item is inaccessible.');
    }
    if (!response.ok) {
      throw new OptionEDraftRouteError('DRAFT_UNAVAILABLE',
        `The exact Option E Draft item could not be read (HTTP ${response.status}).`);
    }
    return this.parseRow(await response.json() as IOptionEDraftRow, itemId);
  }

  public async updateExact(request: IOptionEDraftContentExactUpdate<T>): Promise<void> {
    const { itemId, expectedEtag } = request;
    const saveIdDescriptor = Object.getOwnPropertyDescriptor(request, 'clientSaveId');
    const savedAtDescriptor = Object.getOwnPropertyDescriptor(request, 'clientSavedAt');
    const clientSaveId = saveIdDescriptor && Object.prototype.hasOwnProperty.call(saveIdDescriptor, 'value')
      ? saveIdDescriptor.value as string : undefined;
    const clientSavedAt = savedAtDescriptor && Object.prototype.hasOwnProperty.call(savedAtDescriptor, 'value')
      ? savedAtDescriptor.value as string : undefined;
    const { aggregate, payloadJson, payloadSha256 } = request.prepared;
    if (!Number.isSafeInteger(itemId) || itemId < 1 || !specificEtag(expectedEtag)
      || typeof clientSaveId !== 'string' || !UUID.test(clientSaveId)
      || typeof clientSavedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(clientSavedAt)
      || !Number.isFinite(Date.parse(clientSavedAt)) || new Date(clientSavedAt).toISOString() !== clientSavedAt) {
      throw new Error('Option E Draft update lacks an exact item, ETag, UUID or save time.');
    }
    // Revalidate at the mutation boundary, independently of an earlier prepare call.
    // Capture scalars before hashing so caller edits cannot redirect the checked request.
    if (typeof payloadSha256 !== 'string' || !SHA256.test(payloadSha256)
      || canonicalisePrivateDraftForSchema(aggregate, this.schemaVersion) !== payloadJson
      || (this.schemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION
        && (request.prepared as IPreparedPrivateDraftV3).schemaVersion !== OPTION_E_DRAFT_V3_SCHEMA_VERSION)) {
      throw new Error('Option E Draft prepared content does not match its exact canonical payload.');
    }
    const observedHash = (await this.hasher.sha256Hex(payloadJson)).toUpperCase();
    if (observedHash !== payloadSha256) {
      throw new Error('Option E Draft prepared payload hash did not match its exact bytes.');
    }
    const fields = this.bindings.fieldNames;
    const body: Record<string, string> = {
      [fields.draftPayloadJson]: payloadJson,
      [fields.draftPayloadSha256]: payloadSha256,
      [fields.clientSaveId]: clientSaveId,
      [fields.clientSavedAt]: clientSavedAt
    };
    let response: SPHttpClientResponse;
    try {
      response = await this.spHttpClient.post(`${this.listItemsUrl()}(${itemId})`, this.spHttpConfiguration, {
        headers: {
          Accept: 'application/json;odata=nometadata',
          'Content-Type': 'application/json;odata=nometadata',
          'IF-MATCH': expectedEtag,
          'X-HTTP-Method': 'MERGE'
        },
        body: JSON.stringify(body)
      });
    } catch {
      throw new OptionEDraftAmbiguousWriteError();
    }
    if (response.status === 412) throw new OptionEDraftConflictError();
    if (response.status >= 500) throw new OptionEDraftAmbiguousWriteError();
    if (!response.ok) throw new Error(`Option E Draft update failed with HTTP ${response.status}. Your changes are retained.`);
  }

  private async parseRow(row: IOptionEDraftRow, expectedItemId: number): Promise<IOptionEDraftContentRecord<T>> {
    const fields = this.bindings.fieldNames;
    const itemId = row[fields.id];
    const etag = row['@odata.etag'];
    const payloadJson = row[fields.draftPayloadJson];
    const payloadSha256 = row[fields.draftPayloadSha256];
    if (!Number.isSafeInteger(itemId) || itemId !== expectedItemId || !specificEtag(etag)
      || !nonBlank(payloadJson) || !nonBlank(payloadSha256)) {
      throw new OptionEDraftRouteError('DRAFT_INVALID',
        'Option E Draft exact-item identity, ETag or canonical content is invalid.');
    }
    let aggregate: T;
    try {
      aggregate = (this.schemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION
        ? parseCanonicalOptionEPartialDraftV3(payloadJson) : parseCanonicalOptionEPartialDraft(payloadJson)) as T;
    } catch (error) {
      throw new OptionEDraftRouteError('DRAFT_INVALID',
        error instanceof Error ? error.message : 'Option E Draft canonical payload is invalid.');
    }
    const observedHash = this.schemaVersion === OPTION_E_DRAFT_V3_SCHEMA_VERSION
      ? (await reopenOptionEPartialDraftV3(OPTION_E_DRAFT_V3_SCHEMA_VERSION, payloadJson, payloadSha256, this.hasher)).payloadSha256
      : (await this.hasher.sha256Hex(payloadJson)).toUpperCase();
    if (!SHA256.test(payloadSha256) || payloadSha256.toUpperCase() !== observedHash) {
      throw new OptionEDraftRouteError('DRAFT_INVALID',
        'Option E Draft canonical readback payload hash did not match its exact bytes.');
    }
    const editor = row[fields.editor] as { EMail?: unknown; Title?: unknown } | undefined;
    const clientSaveId = row[fields.clientSaveId];
    const clientSavedAt = row[fields.clientSavedAt];
    const modified = row[fields.modified];
    return {
      itemId: itemId as number, etag, aggregate, payloadJson, payloadSha256: observedHash,
      clientSaveId: nonBlank(clientSaveId) ? clientSaveId : undefined,
      clientSavedAt: nonBlank(clientSavedAt) ? clientSavedAt : undefined,
      modified: nonBlank(modified) ? modified : undefined,
      editorEmail: nonBlank(editor?.EMail) ? editor.EMail : undefined,
      editorDisplayName: nonBlank(editor?.Title) ? editor.Title : undefined
    };
  }

  private listItemsUrl(): string {
    return `${this.webAbsoluteUrl.replace(/\/$/, '')}/_api/web/lists/getbytitle('${escapeOData(this.bindings.draftsListTitle)}')/items`;
  }
}

export default OptionEDraftSharePointGateway;
