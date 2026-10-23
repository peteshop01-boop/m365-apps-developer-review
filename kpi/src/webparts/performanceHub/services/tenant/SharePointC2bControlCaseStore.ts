import type { C2bCommandEffect } from '../TestPilotCommandAdmissionC2b';
import { canonicaliseC2b, hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import { assessSec006ControlCaseConsumption, type ISec006ControlCase,
  type ISec006ControlCaseConsumption } from '../sec006/Sec006ControlCaseStore';
export interface IC2bControlCasePhysicalRecord { itemId: number; etag: string; itemVersion: string;
  fields: Readonly<Record<string, unknown>>; }
export type C2bControlCasePatchOutcome = { outcome: 'Confirmed'; providerReference: string }
  | { outcome: 'Unknown'; safeCode: 'TIMEOUT_UNKNOWN' | 'PROVIDER_UNKNOWN' | 'CONNECTION_INTERRUPTED' };
export interface IC2bControlCasePhysicalPort { readByKey(key: string): Promise<readonly IC2bControlCasePhysicalRecord[]>;
  patchIfMatch(itemId: number, etag: string, fields: Readonly<Record<string, unknown>>): Promise<C2bControlCasePatchOutcome>; }
export const C2B_CONTROL_CASE_PHYSICAL_FIELDS = Object.freeze(['ControlCaseKey', 'ControlReference',
  'AuthorisedAction', 'SubjectKey', 'WorkplanKey', 'WorkplanVersion', 'ExpectedETag', 'ExpectedRowVersionToken',
  'Active', 'ValidFromUtc', 'ValidToUtc', 'Revoked', 'RevokedAtUtc', 'RevocationReason', 'ConsumedAtUtc',
  'ConsumedCommandKey', 'ConsumedSourceListId', 'ConsumedSourceItemId', 'ConsumedSourceItemVersion',
  'RecoveryHoldAtUtc', 'RecoveryHoldReason', 'RowVersionToken', 'ControlCaseContentSHA256'] as const);
const KEY = /^CONTROL-[A-Z0-9][A-Z0-9-]{4,}$/; const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const nonBlank = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const fail = (code: string, detail: string): never => { throw new Error(`${code}: ${detail}`); };
const optional = (v: unknown): unknown => v === undefined ? null : v;
const utc = (v: unknown): boolean => nonBlank(v) && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(v)
  && Number.isFinite(Date.parse(v));
const content = (r: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> => Object.freeze({
  ControlCaseKey: r.ControlCaseKey, ControlReference: r.ControlReference, AuthorisedAction: r.AuthorisedAction,
  SubjectKey: r.SubjectKey, WorkplanKey: r.WorkplanKey, WorkplanVersion: r.WorkplanVersion,
  ExpectedETag: r.ExpectedETag, ExpectedRowVersionToken: r.ExpectedRowVersionToken, Active: r.Active,
  ValidFromUtc: r.ValidFromUtc, ValidToUtc: r.ValidToUtc, Revoked: r.Revoked,
  RevokedAtUtc: optional(r.RevokedAtUtc), RevocationReason: optional(r.RevocationReason),
  ConsumedAtUtc: optional(r.ConsumedAtUtc), ConsumedCommandKey: optional(r.ConsumedCommandKey),
  ConsumedSourceListId: optional(r.ConsumedSourceListId), ConsumedSourceItemId: optional(r.ConsumedSourceItemId),
  ConsumedSourceItemVersion: optional(r.ConsumedSourceItemVersion), RecoveryHoldAtUtc: optional(r.RecoveryHoldAtUtc),
  RecoveryHoldReason: optional(r.RecoveryHoldReason), RowVersionToken: r.RowVersionToken });
export const c2bControlCaseContentSha256 = (r: Readonly<Record<string, unknown>>): string => hashC2bCanonical(content(r));
export function deserialiseC2bControlCase(record: IC2bControlCasePhysicalRecord): ISec006ControlCase {
  const r = record.fields;
  if (!Number.isSafeInteger(record.itemId) || record.itemId < 1 || !nonBlank(record.itemVersion)
    || !nonBlank(record.etag) || record.etag === '*' || !KEY.test(String(r.ControlCaseKey || ''))
    || r.ControlReference !== r.ControlCaseKey || r.AuthorisedAction !== 'CreateWorkplanAmendmentV2'
    || !nonBlank(r.SubjectKey) || r.WorkplanKey !== r.SubjectKey
    || ['WorkplanVersion', 'ExpectedRowVersionToken', 'RowVersionToken'].some(k => !Number.isSafeInteger(r[k]) || Number(r[k]) < 1)
    || !nonBlank(r.ExpectedETag) || r.ExpectedETag === '*' || typeof r.Active !== 'boolean' || typeof r.Revoked !== 'boolean'
    || !utc(r.ValidFromUtc) || !utc(r.ValidToUtc) || Date.parse(String(r.ValidFromUtc)) > Date.parse(String(r.ValidToUtc))
    || r.ConsumedSourceListId !== null && r.ConsumedSourceListId !== undefined && !GUID.test(String(r.ConsumedSourceListId))
    || r.ControlCaseContentSHA256 !== c2bControlCaseContentSha256(r)) return fail('C2B_CONTROL_CASE_PHYSICAL_INVALID', String(r.ControlCaseKey));
  const value: ISec006ControlCase = { controlCaseKey: String(r.ControlCaseKey), controlReference: String(r.ControlReference),
    authorisedAction: 'CreateWorkplanAmendmentV2', subjectKey: String(r.SubjectKey), workplanKey: String(r.WorkplanKey),
    workplanVersion: Number(r.WorkplanVersion), expectedETag: String(r.ExpectedETag),
    expectedRowVersionToken: Number(r.ExpectedRowVersionToken), storageETag: record.etag,
    storageRowVersionToken: Number(r.RowVersionToken), active: r.Active as boolean, validFromUtc: String(r.ValidFromUtc),
    validToUtc: String(r.ValidToUtc), revoked: r.Revoked as boolean };
  const pairs = [['RevokedAtUtc','revokedAtUtc'],['RevocationReason','revocationReason'],['ConsumedAtUtc','consumedAtUtc'],
    ['ConsumedCommandKey','consumedCommandKey'],['ConsumedSourceListId','consumedSourceListId'],
    ['ConsumedSourceItemId','consumedSourceItemId'],['ConsumedSourceItemVersion','consumedSourceItemVersion'],
    ['RecoveryHoldAtUtc','recoveryHoldAtUtc'],['RecoveryHoldReason','recoveryHoldReason']] as const;
  pairs.forEach(([p,l]) => { if (r[p] !== null && r[p] !== undefined) (value as unknown as Record<string, unknown>)[l] = r[p]; });
  return value;
}
const consumed = (c: ISec006ControlCaseConsumption, token: number): Record<string, unknown> => ({ Active: false,
  ConsumedAtUtc: c.consumedAtUtc, ConsumedCommandKey: c.consumedCommandKey,
  ConsumedSourceListId: c.consumedSourceListId, ConsumedSourceItemId: c.consumedSourceItemId,
  ConsumedSourceItemVersion: c.consumedSourceItemVersion, RowVersionToken: token + 1, ControlCaseContentSHA256: '' });
export class SharePointC2bControlCaseStore {
  public constructor(private readonly port: IC2bControlCasePhysicalPort) {}
  public async readExact(key: string): Promise<ISec006ControlCase | undefined> {
    if (!KEY.test(key)) fail('C2B_CONTROL_CASE_KEY_INVALID', key); const rows = await this.port.readByKey(key);
    if (rows.length > 1) fail('C2B_CONTROL_CASE_DUPLICATE', key); return rows.length ? deserialiseC2bControlCase(rows[0]) : undefined;
  }
  public async consume(effect: C2bCommandEffect): Promise<C2bControlCasePatchOutcome> {
    if (effect.kind !== 'ControlCaseConsume' || effect.target !== 'AuthoritativeControlCase'
      || effect.expectedETag === null || effect.expectedETag === '*' || !Number.isSafeInteger(effect.expectedRowVersionToken))
      return fail('C2B_CONTROL_CASE_EFFECT_INVALID', effect.effectKey);
    const rows = await this.port.readByKey(effect.naturalKey); if (rows.length !== 1)
      return fail(rows.length ? 'C2B_CONTROL_CASE_DUPLICATE' : 'C2B_CONTROL_CASE_ABSENT', effect.naturalKey);
    const record = rows[0]; const current = deserialiseC2bControlCase(record);
    if (record.etag !== effect.expectedETag || current.storageRowVersionToken !== effect.expectedRowVersionToken
      || canonicaliseC2b(current) !== canonicaliseC2b(effect.beforeFields)) return fail('C2B_CONTROL_CASE_CAS_STALE', effect.naturalKey);
    const desired = { ...effect.desiredFields } as Record<string, unknown>; if (desired.operation !== 'CompareAndSwapConsume')
      return fail('C2B_CONTROL_CASE_OPERATION_INVALID', effect.naturalKey); delete desired.operation;
    const c = desired as unknown as ISec006ControlCaseConsumption; const rejection = assessSec006ControlCaseConsumption(current, c);
    if (rejection) return fail('C2B_CONTROL_CASE_CONSUMPTION_REJECTED', rejection);
    const patch = consumed(c, current.storageRowVersionToken); patch.ControlCaseContentSHA256 = c2bControlCaseContentSha256({ ...record.fields, ...patch });
    return this.port.patchIfMatch(record.itemId, record.etag, Object.freeze(patch));
  }
  public async recover(effect: C2bCommandEffect): Promise<'Applied'|'NotApplied'|'StillUnknown'> {
    const rows = await this.port.readByKey(effect.naturalKey); if (rows.length !== 1) return 'StillUnknown';
    const record = rows[0]; const current = deserialiseC2bControlCase(record);
    if (canonicaliseC2b(current) === canonicaliseC2b(effect.beforeFields)) return 'NotApplied';
    const desired = { ...effect.desiredFields } as Record<string, unknown>; delete desired.operation;
    const expected = consumed(desired as unknown as ISec006ControlCaseConsumption,
      Number((effect.beforeFields as Readonly<Record<string, unknown>>).storageRowVersionToken));
    expected.ControlCaseContentSHA256 = c2bControlCaseContentSha256({ ...record.fields, ...expected });
    if (Object.keys(expected).every(k => canonicaliseC2b(record.fields[k]) === canonicaliseC2b(expected[k]))) return 'Applied';
    const hold = { Active: false, RecoveryHoldAtUtc: desired.trustedUtc,
      RecoveryHoldReason: 'C2B_CONTROL_CASE_RECOVERY_UNKNOWN', RowVersionToken: Number(record.fields.RowVersionToken) + 1,
      ControlCaseContentSHA256: '' };
    hold.ControlCaseContentSHA256 = c2bControlCaseContentSha256({ ...record.fields, ...hold });
    await this.port.patchIfMatch(record.itemId, record.etag, Object.freeze(hold)); return 'StillUnknown';
  }
}
