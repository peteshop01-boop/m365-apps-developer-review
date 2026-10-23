/* eslint-disable @rushstack/no-new-null -- null is the explicit SharePoint absence/CAS representation */
import { isEmployeeV2StableCommandKey } from './EmployeeWorkplanV2PersistencePolicy';
import {
  assertValidC2bEffectForPlan,
  assertValidC2bJournal,
  canonicaliseC2b,
  hashC2bCanonical,
  type C2bCommandEffect,
  type C2bCommandJournal,
  type C2bEffectPlan
} from './TestPilotCommandAdmissionC2b';
import {
  C2B_EFFECT_JSON_CHUNK_COUNT,
  C2B_JOURNAL_JSON_CHUNK_COUNT,
  C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS
} from './EmployeeWorkplanV2C2bSharePointSchema';

export interface IC2bSharePointRestRequest {
  method: 'GET' | 'POST' | 'PATCH';
  relativeUrl: string;
  headers: Readonly<Record<string, string>>;
  body?: Readonly<Record<string, unknown>>;
}

export interface IC2bSharePointRestResponse {
  status: number;
  headers?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
}

/** The injected transport owns authentication, site routing and the native SharePoint request. */
export interface IC2bSharePointTransportTargetIdentity {
  siteUrl: string;
  siteCollectionId: string;
  webId: string;
}

export interface IC2bSharePointRestTransport {
  readonly targetIdentity: IC2bSharePointTransportTargetIdentity;
  request(request: IC2bSharePointRestRequest): Promise<IC2bSharePointRestResponse>;
}

export interface IC2bSharePointJournalEffectBinding {
  enabled: boolean;
  environmentKind: 'NonProduction';
  environmentId: string | null;
  siteUrl: string | null;
  siteCollectionId: string | null;
  webId: string | null;
  connectionReference: string | null;
  commandJournalListId: string | null;
  commandEffectsListId: string | null;
}

export interface IC2bSharePointStored<T> {
  itemId: number;
  etag: string;
  value: T;
  stateSha256: string;
}

export type C2bPersistenceRecovery<T> =
  | { outcome: 'Applied'; stored: IC2bSharePointStored<T>; evidenceSha256: string }
  | { outcome: 'NotApplied'; stored?: IC2bSharePointStored<T>; evidenceSha256: string }
  | { outcome: 'StillUnknown'; stored: IC2bSharePointStored<T>; evidenceSha256: string };

export class C2bSharePointContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'C2bSharePointContractError';
    Object.setPrototypeOf(this, C2bSharePointContractError.prototype);
  }
}

export class C2bSharePointCasConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'C2bSharePointCasConflictError';
    Object.setPrototypeOf(this, C2bSharePointCasConflictError.prototype);
  }
}

export class C2bSharePointWriteUnknownError extends Error {
  public readonly operation: string;
  public readonly naturalKey: string;
  public constructor(operation: string, naturalKey: string) {
    super(`C2B_SHAREPOINT_WRITE_UNKNOWN: ${operation} for ${naturalKey} requires exact readback; no retry was attempted.`);
    this.name = 'C2bSharePointWriteUnknownError';
    this.operation = operation;
    this.naturalKey = naturalKey;
    Object.setPrototypeOf(this, C2bSharePointWriteUnknownError.prototype);
  }
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9A-F]{64}$/;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const fail = (message: string): never => { throw new C2bSharePointContractError(message); };
const normalGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const normalSiteUrl = (value: string): string | null => {
  if (!nonBlank(value)) return null;
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { return null; }
  if (parsed.protocol.toLowerCase() !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)
    return null;
  const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
  return `https://${parsed.host.toLowerCase()}${path}`;
};
const quote = (value: string): string => value.replace(/'/g, "''");

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('C2B_SHAREPOINT_READBACK_INVALID: object expected.');
  return value as Record<string, unknown>;
}

function exactInteger(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    return fail('C2B_SHAREPOINT_READBACK_INVALID: safe integer expected.');
  return value;
}

function exactString(value: unknown, field: string): string {
  if (!nonBlank(value)) return fail(`C2B_SHAREPOINT_READBACK_INVALID: ${field} is missing.`);
  return value;
}

function header(response: IC2bSharePointRestResponse, name: string): string | undefined {
  const key = Object.keys(response.headers || {}).find(value => value.toLowerCase() === name.toLowerCase());
  return key ? response.headers?.[key] : undefined;
}

function exactEtag(value: unknown): string {
  if (!nonBlank(value) || value.trim() === '*' || value.length > 255)
    return fail('C2B_SHAREPOINT_ETAG_INVALID: a non-wildcard ETag is required.');
  return value;
}

function rowEtag(row: Record<string, unknown>, response?: IC2bSharePointRestResponse): string {
  return exactEtag(row['@odata.etag'] || row['odata.etag'] || (record(row.__metadata || {}).etag)
    || (response ? header(response, 'etag') : undefined));
}

function rows(response: IC2bSharePointRestResponse): Record<string, unknown>[] {
  if (response.status !== 200) return fail(`C2B_SHAREPOINT_READ_FAILED: HTTP ${response.status}.`);
  const body = record(response.body);
  const values = Array.isArray(body.value) ? body.value : record(body.d || {}).results;
  if (!Array.isArray(values)) return fail('C2B_SHAREPOINT_READBACK_INVALID: result rows are missing.');
  return values.map(value => record(value));
}

function splitCanonical(value: unknown, prefix: 'JournalChunk' | 'EffectChunk', maximumChunks: number): {
  canonical: string;
  stateSha256: string;
  fields: Record<string, string | null>;
  chunkCount: number;
} {
  const canonical = canonicaliseC2b(value);
  const result: string[] = [];
  let offset = 0;
  while (offset < canonical.length) {
    let end = Math.min(offset + C2B_SHAREPOINT_JSON_CHUNK_CODE_UNITS, canonical.length);
    const finalCode = canonical.charCodeAt(end - 1);
    if (end < canonical.length && finalCode >= 0xd800 && finalCode <= 0xdbff) end -= 1;
    result.push(canonical.slice(offset, end));
    offset = end;
  }
  if (!result.length) result.push('');
  if (result.length > maximumChunks) return fail(`C2B_SHAREPOINT_CAPACITY_EXCEEDED: ${prefix} needs ${result.length} chunks; no data was written.`);
  const fields: Record<string, string | null> = {};
  for (let index = 0; index < maximumChunks; index += 1)
    fields[`${prefix}${String(index + 1).padStart(2, '0')}`] = result[index] === undefined ? null : result[index];
  return { canonical, stateSha256: hashC2bCanonical(value), fields, chunkCount: result.length };
}

function joinCanonical(row: Record<string, unknown>, prefix: 'JournalChunk' | 'EffectChunk',
  countField: string, lengthField: string, shaField: string, maximumChunks: number): unknown {
  const count = exactInteger(row[countField], 1);
  if (count > maximumChunks) return fail(`C2B_SHAREPOINT_READBACK_INVALID: ${prefix} chunk count exceeds contract.`);
  const canonical = Array.from({ length: count }, (_, index) => exactString(
    row[`${prefix}${String(index + 1).padStart(2, '0')}`], `${prefix}${String(index + 1).padStart(2, '0')}`
  )).join('');
  if (canonical.length !== exactInteger(row[lengthField], 2))
    return fail(`C2B_SHAREPOINT_READBACK_INVALID: ${prefix} length differs.`);
  let parsed: unknown;
  try { parsed = JSON.parse(canonical) as unknown; } catch { return fail(`C2B_SHAREPOINT_READBACK_INVALID: ${prefix} JSON is invalid.`); }
  const expectedSha = exactString(row[shaField], shaField).toUpperCase();
  if (!SHA256.test(expectedSha) || canonicaliseC2b(parsed) !== canonical || hashC2bCanonical(parsed) !== expectedSha)
    return fail(`C2B_SHAREPOINT_READBACK_INVALID: ${prefix} canonical hash differs.`);
  return parsed;
}

function effectPlan(effect: C2bCommandEffect): C2bEffectPlan {
  const value = { ...effect } as Partial<C2bCommandEffect>;
  delete value.disposition;
  delete value.confirmation;
  delete value.confirmationSha256;
  return value as C2bEffectPlan;
}

function assertEffectIntegrity(effect: C2bCommandEffect, journal: C2bCommandJournal): void {
  try { assertValidC2bEffectForPlan(journal, effect); }
  catch (error) {
    return fail(`C2B_EFFECT_INTEGRITY_INVALID: ${error instanceof Error ? error.message : 'logical validation failed.'}`);
  }
  if (!nonBlank(effect.effectKey) || !Number.isSafeInteger(effect.sequence) || effect.sequence < 1
    || !['Planned', 'Issued', 'Confirmed', 'Unknown', 'Held'].includes(effect.disposition)
    || effect.beforeSha256 !== hashC2bCanonical(effect.beforeFields)
    || effect.desiredSha256 !== hashC2bCanonical(effect.desiredFields))
    return fail('C2B_EFFECT_INTEGRITY_INVALID: identity, state or before/desired hashes differ.');
  const plan = effectPlan(effect);
  const hashInput = { ...plan } as Partial<C2bEffectPlan>;
  delete hashInput.effectSha256;
  if (effect.effectSha256 !== hashC2bCanonical(hashInput)
    || (effect.confirmation === null) !== (effect.confirmationSha256 === null)
    || (effect.confirmation && effect.confirmationSha256 !== hashC2bCanonical(effect.confirmation)))
    return fail('C2B_EFFECT_INTEGRITY_INVALID: immutable effect or confirmation hash differs.');
}

function assertJournalIntegrity(journal: C2bCommandJournal): void {
  try { assertValidC2bJournal(journal); }
  catch (error) {
    return fail(`C2B_JOURNAL_INTEGRITY_INVALID: ${error instanceof Error ? error.message : 'logical validation failed.'}`);
  }
  if (!isEmployeeV2StableCommandKey(journal.plan.commandKey) || !Number.isSafeInteger(journal.journalVersion)
    || journal.journalVersion < 1 || !Number.isSafeInteger(journal.leaseEpoch) || journal.leaseEpoch < 0
    || (journal.leaseOwner === null) !== (journal.leaseExpiresAt === null)
    || !['Planned', 'Leased', 'Claimed', 'Applying', 'Finalising', 'Ready', 'Held', 'Terminal'].includes(journal.state))
    return fail('C2B_JOURNAL_INTEGRITY_INVALID: identity, lease, version or state differs.');
  const planWithoutHash = { ...journal.plan } as Partial<C2bCommandJournal['plan']>;
  delete planWithoutHash.planSha256;
  if (journal.plan.planSha256 !== hashC2bCanonical(planWithoutHash)
    || journal.plan.intendedImageSha256 !== hashC2bCanonical(journal.plan.intendedImage))
    return fail('C2B_JOURNAL_INTEGRITY_INVALID: immutable plan or intended-image hash differs.');
  if (journal.effects.length !== journal.plan.effects.length) return fail('C2B_JOURNAL_INTEGRITY_INVALID: effect count differs.');
  journal.effects.forEach((effect, index) => {
    assertEffectIntegrity(effect, journal);
    if (effect.sequence !== index + 1 || canonicaliseC2b(effectPlan(effect)) !== canonicaliseC2b(journal.plan.effects[index]))
      return fail('C2B_JOURNAL_INTEGRITY_INVALID: ordered journal effect differs from immutable plan.');
  });
}

function terminalEvidenceSha256(journal: C2bCommandJournal): string | null {
  const evidence = { stableRead: journal.stableRead, receipt: journal.receipt,
    recoveryHold: journal.recoveryHold, outcomeAudits: journal.outcomeAudits };
  return Object.values(evidence).every(value => value === null || Array.isArray(value) && value.length === 0)
    ? null : hashC2bCanonical(evidence);
}

export function serialiseC2bJournalRow(journal: C2bCommandJournal): Readonly<Record<string, unknown>> {
  assertJournalIntegrity(journal);
  const state = splitCanonical(journal, 'JournalChunk', C2B_JOURNAL_JSON_CHUNK_COUNT);
  return Object.freeze({
    Title: journal.plan.commandKey, CommandKey: journal.plan.commandKey, State: journal.state,
    JournalVersion: journal.journalVersion, LeaseOwner: journal.leaseOwner, LeaseEpoch: journal.leaseEpoch,
    LeaseExpiresAt: journal.leaseExpiresAt, PlanSHA256: journal.plan.planSha256,
    PayloadSHA256: journal.plan.payloadSha256, IntendedImageSHA256: journal.plan.intendedImageSha256,
    JournalStateSHA256: state.stateSha256, JournalStateLength: state.canonical.length,
    JournalChunkCount: state.chunkCount, EffectCount: journal.effects.length,
    TerminalEvidenceSHA256: terminalEvidenceSha256(journal), ...state.fields
  });
}

export function deserialiseC2bJournalRow(row: Readonly<Record<string, unknown>>): C2bCommandJournal {
  const value = joinCanonical(row as Record<string, unknown>, 'JournalChunk', 'JournalChunkCount',
    'JournalStateLength', 'JournalStateSHA256', C2B_JOURNAL_JSON_CHUNK_COUNT) as C2bCommandJournal;
  assertJournalIntegrity(value);
  if (row.Title !== value.plan.commandKey || row.CommandKey !== value.plan.commandKey || row.State !== value.state
    || row.JournalVersion !== value.journalVersion || row.LeaseOwner !== value.leaseOwner
    || row.LeaseEpoch !== value.leaseEpoch || row.LeaseExpiresAt !== value.leaseExpiresAt
    || row.PlanSHA256 !== value.plan.planSha256 || row.PayloadSHA256 !== value.plan.payloadSha256
    || row.IntendedImageSHA256 !== value.plan.intendedImageSha256 || row.EffectCount !== value.effects.length
    || row.TerminalEvidenceSHA256 !== terminalEvidenceSha256(value))
    return fail('C2B_JOURNAL_READBACK_MISMATCH: query fields differ from canonical state.');
  return value;
}

export function serialiseC2bEffectRow(commandKey: string, effect: C2bCommandEffect,
  journalETag: string, journal: C2bCommandJournal): Readonly<Record<string, unknown>> {
  if (!isEmployeeV2StableCommandKey(commandKey) || !effect.effectKey.startsWith(`${commandKey}|`))
    return fail('C2B_EFFECT_COMMAND_MISMATCH: deterministic effect identity is not bound to CommandKey.');
  assertEffectIntegrity(effect, journal);
  const state = splitCanonical(effect, 'EffectChunk', C2B_EFFECT_JSON_CHUNK_COUNT);
  return Object.freeze({
    Title: effect.effectKey, EffectKey: effect.effectKey, CommandKey: commandKey, Sequence: effect.sequence,
    Kind: effect.kind, Target: effect.target, Disposition: effect.disposition, JournalETag: exactEtag(journalETag),
    BeforeSHA256: effect.beforeSha256, DesiredSHA256: effect.desiredSha256, EffectSHA256: effect.effectSha256,
    ConfirmationSHA256: effect.confirmationSha256, EffectStateSHA256: state.stateSha256,
    EffectStateLength: state.canonical.length, EffectChunkCount: state.chunkCount, ...state.fields
  });
}

export function deserialiseC2bEffectRow(row: Readonly<Record<string, unknown>>,
  journal: C2bCommandJournal): C2bCommandEffect {
  const value = joinCanonical(row as Record<string, unknown>, 'EffectChunk', 'EffectChunkCount',
    'EffectStateLength', 'EffectStateSHA256', C2B_EFFECT_JSON_CHUNK_COUNT) as C2bCommandEffect;
  assertEffectIntegrity(value, journal);
  const commandKey = exactString(row.CommandKey, 'CommandKey');
  if (!isEmployeeV2StableCommandKey(commandKey) || !value.effectKey.startsWith(`${commandKey}|`)
    || row.Title !== value.effectKey || row.EffectKey !== value.effectKey || row.Sequence !== value.sequence
    || row.Kind !== value.kind || row.Target !== value.target || row.Disposition !== value.disposition
    || row.BeforeSHA256 !== value.beforeSha256 || row.DesiredSHA256 !== value.desiredSha256
    || row.EffectSHA256 !== value.effectSha256 || row.ConfirmationSHA256 !== value.confirmationSha256)
    return fail('C2B_EFFECT_READBACK_MISMATCH: query fields differ from canonical state.');
  exactEtag(row.JournalETag);
  return value;
}

/**
 * Native journal/effect persistence only. It intentionally has no embedded URL, credential, principal, retry,
 * activation or business-list mutation capability. All writes use injected non-production bindings and exact ETags.
 */
export class SharePointC2bJournalEffectStore {
  private readonly journalListId: string;
  private readonly effectListId: string;

  public constructor(private readonly transport: IC2bSharePointRestTransport,
    binding: IC2bSharePointJournalEffectBinding) {
    const journal = normalGuid(binding.commandJournalListId || '');
    const effect = normalGuid(binding.commandEffectsListId || '');
    const bindingSiteUrl = normalSiteUrl(binding.siteUrl || '');
    const bindingSiteCollectionId = normalGuid(binding.siteCollectionId || '');
    const bindingWebId = normalGuid(binding.webId || '');
    const targetSiteUrl = normalSiteUrl(transport.targetIdentity?.siteUrl || '');
    const targetSiteCollectionId = normalGuid(transport.targetIdentity?.siteCollectionId || '');
    const targetWebId = normalGuid(transport.targetIdentity?.webId || '');
    if (!binding.enabled || binding.environmentKind !== 'NonProduction' || !nonBlank(binding.environmentId)
      || !bindingSiteUrl || !GUID.test(bindingSiteCollectionId) || !GUID.test(bindingWebId)
      || bindingSiteCollectionId === bindingWebId || !nonBlank(binding.connectionReference) || !GUID.test(journal)
      || !GUID.test(effect) || journal === effect || !targetSiteUrl || !GUID.test(targetSiteCollectionId)
      || !GUID.test(targetWebId) || targetSiteCollectionId === targetWebId) {
      fail('C2B_NATIVE_STORE_DISABLED_UNBOUND: verified non-production journal/effect bindings are required.');
    }
    if (targetSiteUrl !== bindingSiteUrl || targetSiteCollectionId !== bindingSiteCollectionId
      || targetWebId !== bindingWebId)
      fail('C2B_NATIVE_STORE_TARGET_MISMATCH: transport site URL, site-collection GUID or web GUID differs from the binding.');
    this.journalListId = journal;
    this.effectListId = effect;
  }

  private listItems(listId: string): string {
    return `/_api/web/lists(guid'${listId}')/items`;
  }

  private async find(listId: string, keyField: 'CommandKey' | 'EffectKey', key: string): Promise<{
    response: IC2bSharePointRestResponse;
    row?: Record<string, unknown>;
  }> {
    const response = await this.transport.request({ method: 'GET',
      relativeUrl: `${this.listItems(listId)}?$filter=${keyField}%20eq%20'${quote(key)}'&$top=2`,
      headers: { Accept: 'application/json;odata=nometadata' } });
    const values = rows(response);
    if (values.length > 1) return fail(`C2B_SHAREPOINT_DUPLICATE_KEY: ${keyField} is not unique.`);
    return { response, row: values[0] };
  }

  public async readJournal(commandKey: string): Promise<{ journal?: C2bCommandJournal; etag: string | null }> {
    const stored = await this.readStoredJournal(commandKey);
    return stored ? { journal: stored.value, etag: stored.etag } : { etag: null };
  }

  public async readStoredJournal(commandKey: string): Promise<IC2bSharePointStored<C2bCommandJournal> | undefined> {
    if (!isEmployeeV2StableCommandKey(commandKey)) return fail('C2B_JOURNAL_KEY_INVALID: stable lower-case GUID required.');
    const result = await this.find(this.journalListId, 'CommandKey', commandKey);
    if (!result.row) return undefined;
    const value = deserialiseC2bJournalRow(result.row);
    return { itemId: exactInteger(result.row.Id || result.row.ID, 1), etag: rowEtag(result.row, result.response),
      value, stateSha256: exactString(result.row.JournalStateSHA256, 'JournalStateSHA256') };
  }

  public async readStoredEffect(effectKey: string): Promise<IC2bSharePointStored<C2bCommandEffect> | undefined> {
    if (!nonBlank(effectKey) || effectKey.length > 255) return fail('C2B_EFFECT_KEY_INVALID: bounded key required.');
    const result = await this.find(this.effectListId, 'EffectKey', effectKey);
    if (!result.row) return undefined;
    const commandKey = exactString(result.row.CommandKey, 'CommandKey');
    const journal = await this.readStoredJournal(commandKey);
    if (!journal) return fail('C2B_EFFECT_JOURNAL_MISSING: effect readback is not bound to an immutable journal.');
    const value = deserialiseC2bEffectRow(result.row, journal.value);
    return { itemId: exactInteger(result.row.Id || result.row.ID, 1), etag: rowEtag(result.row, result.response),
      value, stateSha256: exactString(result.row.EffectStateSHA256, 'EffectStateSHA256') };
  }

  public async readEffect(effectKey: string): Promise<{ effect?: C2bCommandEffect; etag: string | null }> {
    const stored = await this.readStoredEffect(effectKey);
    return stored ? { effect: stored.value, etag: stored.etag } : { etag: null };
  }

  private async write(operation: string, naturalKey: string, request: IC2bSharePointRestRequest): Promise<void> {
    let response: IC2bSharePointRestResponse;
    try { response = await this.transport.request(request); }
    catch { throw new C2bSharePointWriteUnknownError(operation, naturalKey); }
    if (response.status === 409 || response.status === 412)
      throw new C2bSharePointCasConflictError(`C2B_SHAREPOINT_CAS_CONFLICT: ${operation} for ${naturalKey}; no retry was attempted.`);
    if (![200, 201, 204].includes(response.status))
      return fail(`C2B_SHAREPOINT_WRITE_FAILED: ${operation} returned HTTP ${response.status}; no retry was attempted.`);
  }

  public async compareExchangeJournal(journal: C2bCommandJournal,
    expectedETag: string | null): Promise<{ etag: string }> {
    const body = serialiseC2bJournalRow(journal);
    const existing = await this.readStoredJournal(journal.plan.commandKey);
    if (expectedETag === null) {
      if (existing) throw new C2bSharePointCasConflictError('C2B_SHAREPOINT_CAS_CONFLICT: journal create found an existing key.');
      await this.write('JournalCreate', journal.plan.commandKey, { method: 'POST', relativeUrl: this.listItems(this.journalListId),
        headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata',
          'If-None-Match': '*' }, body });
    } else {
      const expected = exactEtag(expectedETag);
      if (!existing || existing.etag !== expected)
        throw new C2bSharePointCasConflictError('C2B_SHAREPOINT_CAS_CONFLICT: journal ETag changed before update.');
      if (existing.stateSha256 === body.JournalStateSHA256) return { etag: existing.etag };
      await this.write('JournalUpdate', journal.plan.commandKey, { method: 'PATCH',
        relativeUrl: `${this.listItems(this.journalListId)}(${existing.itemId})`,
        headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata',
          'If-Match': expected }, body });
    }
    const readback = await this.readStoredJournal(journal.plan.commandKey);
    if (!readback || readback.stateSha256 !== body.JournalStateSHA256)
      return fail('C2B_JOURNAL_STABLE_READBACK_FAILED: exact post-write state was not observed.');
    return { etag: readback.etag };
  }

  public async createEffect(commandKey: string, effect: C2bCommandEffect,
    journalETag: string): Promise<{ etag: string }> {
    const expectedJournalETag = exactEtag(journalETag);
    const journal = await this.readStoredJournal(commandKey);
    if (!journal || journal.etag !== expectedJournalETag)
      throw new C2bSharePointCasConflictError('C2B_SHAREPOINT_CAS_CONFLICT: effect create is not bound to the current journal.');
    const body = serialiseC2bEffectRow(commandKey, effect, expectedJournalETag, journal.value);
    if (await this.readStoredEffect(effect.effectKey))
      throw new C2bSharePointCasConflictError('C2B_SHAREPOINT_CAS_CONFLICT: effect create found an existing key.');
    await this.write('EffectCreate', effect.effectKey, { method: 'POST', relativeUrl: this.listItems(this.effectListId),
      headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata',
        'If-None-Match': '*' }, body });
    const readback = await this.readStoredEffect(effect.effectKey);
    if (!readback || readback.stateSha256 !== body.EffectStateSHA256)
      return fail('C2B_EFFECT_STABLE_READBACK_FAILED: exact post-create state was not observed.');
    return { etag: readback.etag };
  }

  public async compareExchangeEffect(commandKey: string, effect: C2bCommandEffect,
    expectedEffectETag: string, journalETag: string): Promise<{ etag: string }> {
    const expectedJournalETag = exactEtag(journalETag);
    const journal = await this.readStoredJournal(commandKey);
    if (!journal || journal.etag !== expectedJournalETag)
      throw new C2bSharePointCasConflictError('C2B_SHAREPOINT_CAS_CONFLICT: effect update is not bound to the current journal.');
    const body = serialiseC2bEffectRow(commandKey, effect, expectedJournalETag, journal.value);
    const expected = exactEtag(expectedEffectETag);
    const existing = await this.readStoredEffect(effect.effectKey);
    if (!existing || existing.etag !== expected)
      throw new C2bSharePointCasConflictError('C2B_SHAREPOINT_CAS_CONFLICT: effect ETag changed before update.');
    if (existing.stateSha256 === body.EffectStateSHA256) return { etag: existing.etag };
    await this.write('EffectUpdate', effect.effectKey, { method: 'PATCH',
      relativeUrl: `${this.listItems(this.effectListId)}(${existing.itemId})`,
      headers: { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata',
        'If-Match': expected }, body });
    const readback = await this.readStoredEffect(effect.effectKey);
    if (!readback || readback.stateSha256 !== body.EffectStateSHA256)
      return fail('C2B_EFFECT_STABLE_READBACK_FAILED: exact post-update state was not observed.');
    return { etag: readback.etag };
  }

  public async persistEffectState(effect: C2bCommandEffect, journalETag: string): Promise<{ etag: string }> {
    const separator = effect.effectKey.indexOf('|');
    const commandKey = separator > 0 ? effect.effectKey.slice(0, separator) : '';
    if (!isEmployeeV2StableCommandKey(commandKey)) return fail('C2B_EFFECT_COMMAND_MISMATCH: CommandKey cannot be derived safely.');
    const journal = await this.readStoredJournal(commandKey);
    const expectedJournalETag = exactEtag(journalETag);
    if (!journal || journal.etag !== expectedJournalETag
      || !journal.value.plan.effects.some(value => value.effectKey === effect.effectKey
        && value.effectSha256 === effect.effectSha256))
      throw new C2bSharePointCasConflictError('C2B_SHAREPOINT_CAS_CONFLICT: effect is not bound to the current immutable journal.');
    const existing = await this.readStoredEffect(effect.effectKey);
    const result = existing
      ? await this.compareExchangeEffect(commandKey, effect, existing.etag, expectedJournalETag)
      : await this.createEffect(commandKey, effect, expectedJournalETag);
    const journalAfter = await this.readStoredJournal(commandKey);
    if (!journalAfter || journalAfter.etag !== expectedJournalETag)
      return fail('C2B_EFFECT_PARTIAL_WRITE_HELD: journal changed during effect persistence; exact recovery is required.');
    return result;
  }

  public async recoverJournalPersistence(commandKey: string, intended: C2bCommandJournal,
    before?: C2bCommandJournal): Promise<C2bPersistenceRecovery<C2bCommandJournal>> {
    const stored = await this.readStoredJournal(commandKey);
    const evidence = { kind: 'JournalRecovery', commandKey, intendedSha256: hashC2bCanonical(intended),
      beforeSha256: before ? hashC2bCanonical(before) : null,
      observedSha256: stored?.stateSha256 || null, observedETag: stored?.etag || null };
    const evidenceSha256 = hashC2bCanonical(evidence);
    if (stored?.stateSha256 === hashC2bCanonical(intended)) return { outcome: 'Applied', stored, evidenceSha256 };
    if (!stored && !before) return { outcome: 'NotApplied', evidenceSha256 };
    if (stored && before && stored.stateSha256 === hashC2bCanonical(before))
      return { outcome: 'NotApplied', stored, evidenceSha256 };
    if (!stored) return { outcome: 'NotApplied', evidenceSha256 };
    return { outcome: 'StillUnknown', stored, evidenceSha256 };
  }

  public async recoverEffectPersistence(effect: C2bCommandEffect,
    before?: C2bCommandEffect): Promise<C2bPersistenceRecovery<C2bCommandEffect>> {
    const stored = await this.readStoredEffect(effect.effectKey);
    const evidence = { kind: 'EffectRecovery', effectKey: effect.effectKey,
      intendedSha256: hashC2bCanonical(effect), beforeSha256: before ? hashC2bCanonical(before) : null,
      observedSha256: stored?.stateSha256 || null, observedETag: stored?.etag || null };
    const evidenceSha256 = hashC2bCanonical(evidence);
    if (stored?.stateSha256 === hashC2bCanonical(effect)) return { outcome: 'Applied', stored, evidenceSha256 };
    if (!stored && !before) return { outcome: 'NotApplied', evidenceSha256 };
    if (stored && before && stored.stateSha256 === hashC2bCanonical(before))
      return { outcome: 'NotApplied', stored, evidenceSha256 };
    if (!stored) return { outcome: 'NotApplied', evidenceSha256 };
    return { outcome: 'StillUnknown', stored, evidenceSha256 };
  }
}
