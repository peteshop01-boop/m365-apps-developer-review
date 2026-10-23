import { readBoundedBody } from './BoundedBody';
import { expenseText } from './PersistenceValidation';

/** Disconnected, GET-only TEST adapter. Matching readback is neither Save authority
 * nor owner/permission/audit proof. No request-list schema is invented here. */
export const TEST_EXPENSE_ITEMS = "https://example.invalid/sites/REVIEW-TEST-SITE/_api/web/lists/getbytitle('KCFEXP_TEST102_ExpenseLines')/items";
const fields = ['Id', 'ExpenseLineKey', 'ClaimSubmissionRefId', 'ExpenseDate', 'Supplier',
  'ExpenseDescription', 'NominalCode', 'NominalDescription', 'GrossAmount', 'ClaimantNotes', 'IsVoided'];

/** Integration must bind this port to authenticated same-origin native GET, disable
 * caching, and supply final URL/redirect information and a usable native byte
 * stream. No whole-body buffering fallback. Never substitute a POST. */
export interface IReadOnlySharePoint {
  get(url: string, options: { readonly headers: { readonly Accept: string }; readonly cache: 'no-store' }): Promise<{
    readonly status: number; readonly url: string; readonly redirected: boolean;
    readonly etag: string | null; readonly retryAfter: string | null;
    readonly body: unknown;
  }>;
}
export interface IExpenseReadback {
  readonly id: number;
  readonly expenseLineKey: string;
  readonly parentId: number;
  readonly dateIso: string;
  readonly supplier: string;
  readonly description: string;
  readonly nominalCode: string;
  readonly nominalDescription: string;
  readonly amountPence: number;
  readonly notes: string;
  readonly isVoided: false;
}
export type ReadbackResult =
  | { readonly state: 'Blocked'; readonly code: string; readonly tenantWriteAllowed: false }
  | { readonly state: 'Unavailable'; readonly code: string; readonly retryAfterSeconds?: number; readonly tenantWriteAllowed: false }
  | { readonly state: 'Mismatch'; readonly fields: ReadonlyArray<keyof IExpenseReadback>; readonly tenantWriteAllowed: false }
  | { readonly state: 'MatchedReadback'; readonly line: IExpenseReadback; readonly etag: string;
      readonly tenantWriteAllowed: false; readonly securityProven: false;
      readonly outstanding: readonly ['ReasonStorage', 'HumanOriginatorAudit', 'OwnerAndMonth', 'UniqueOperation', 'Permissions'] };

const id = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
function validDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + 'T00:00:00Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
function validExpected(v: unknown): v is IExpenseReadback {
  return record(v) && id(v.id) && id(v.parentId) && validDate(v.dateIso)
    && ['expenseLineKey', 'supplier', 'description', 'nominalCode', 'nominalDescription'].every(k => text(v[k]))
    && expenseText(v.supplier) && expenseText(v.description)
    && id(v.amountPence) && typeof v.notes === 'string' && v.isVoided === false;
}
/** An expected line is evidence, not a live view of UI state. Never read a
 * caller's properties twice or run getters while validating. Plain own-data
 * descriptors form the immutable comparison values for this request. Reflective
 * Proxy traps may throw; the caller receives a value-free rejection instead. */
const expectedKeys = ['id', 'expenseLineKey', 'parentId', 'dateIso', 'supplier',
  'description', 'nominalCode', 'nominalDescription', 'amountPence', 'notes', 'isVoided'] as const;
function snapshotExpected(input: unknown): IExpenseReadback | undefined {
  try {
    // Array.isArray itself throws for revoked Proxies; keep it within the guard.
    if (!record(input)) return undefined;
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.length !== expectedKeys.length ||
        keys.some(k => typeof k !== 'string' || !expectedKeys.some(n => n === k))) return undefined;
    const values: Record<string, unknown> = Object.create(null);
    for (const key of expectedKeys) {
      const d = descriptors[key];
      if (!d || !Object.prototype.hasOwnProperty.call(d, 'value')) return undefined;
      values[key] = d.value;
    }
    if (!validExpected(values)) return undefined;
    return { id: values.id, expenseLineKey: values.expenseLineKey, parentId: values.parentId,
      dateIso: values.dateIso, supplier: values.supplier, description: values.description,
      nominalCode: values.nominalCode, nominalDescription: values.nominalDescription,
      amountPence: values.amountPence, notes: values.notes, isVoided: false } as IExpenseReadback;
  } catch {
    // Never expose thrown getters, Proxy traps or private exception messages.
    return undefined;
  }
}

/** Called only after JSON.parse has validated the document's grammar. Tokenise
 * strings atomically (including escapes) and track nesting so only the root
 * GrossAmount property counts. Reject duplicate/escaped aliases rather than
 * letting JSON.parse's last-key-wins behaviour hide an invalid wire amount. */
function amountToken(body: string): string | undefined {
  const tokens = body.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|[^\s{}\[\]:,"]+/g) || [];
  let depth = 0; let found: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{' || token === '[') depth++;
    else if (token === '}' || token === ']') depth--;
    else if (depth === 1 && token.startsWith('"') && tokens[i + 1] === ':' && JSON.parse(token) === 'GrossAmount') {
      if (found !== undefined) return undefined;
      found = tokens[i + 2];
    }
  }
  return found;
}
/** Validate original decimal text before any numeric conversion. Construct the
 * integer pence text first so even the safe-integer boundary stays exact. */
function pence(v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1] + ((m[2] || '') + '00').slice(0, 2));
  return id(n) ? n : undefined;
}
function decode(v: unknown, rawAmount: string | undefined): IExpenseReadback | undefined {
  if (!record(v) || fields.some(k => !Object.prototype.hasOwnProperty.call(v, k))) return undefined;
  // UTC midnight is a candidate date-only wire contract, still requiring TEST
  // timezone qualification. Never silently truncate a shifted timestamp.
  if (typeof v.ExpenseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}T00:00:00(?:\.000)?Z$/.test(v.ExpenseDate)) return undefined;
  const line = { id: v.Id, expenseLineKey: v.ExpenseLineKey, parentId: v.ClaimSubmissionRefId,
    dateIso: v.ExpenseDate.slice(0, 10), supplier: v.Supplier, description: v.ExpenseDescription,
    nominalCode: v.NominalCode, nominalDescription: v.NominalDescription,
    amountPence: pence(rawAmount), notes: v.ClaimantNotes === null ? '' : v.ClaimantNotes, isVoided: v.IsVoided };
  return validExpected(line) ? line : undefined;
}
const blocked = (code: string): ReadbackResult => ({ state: 'Blocked', code, tenantWriteAllowed: false });
const unavailable = (code: string): ReadbackResult => ({ state: 'Unavailable', code, tenantWriteAllowed: false });

/** Exactly one uncached read of the supplied synthetic line ID. The expectation
 * must come from retained approved fixture evidence, never UI security claims.
 * No automatic retry, list scan, fallback endpoint or response-body logging. */
export async function reopenExpense(port: IReadOnlySharePoint, expected: IExpenseReadback): Promise<ReadbackResult> {
  // Capture and validate once, BEFORE any transport. Accessors and inherited
  // properties cannot change the request destination or throw private messages.
  const snapshot = snapshotExpected(expected);
  if (!snapshot) return blocked('INVALID_EXPECTATION');
  const url = `${TEST_EXPENSE_ITEMS}(${snapshot.id})?$select=${fields.join(',')}`;
  try {
    const response = await port.get(url, { headers: { Accept: 'application/json;odata=nometadata' }, cache: 'no-store' });
    if (response.url !== url || response.redirected !== false) return blocked('UNEXPECTED_RESPONSE_DESTINATION');
    if (response.status === 401 || response.status === 403) return blocked('ACCESS_DENIED');
    if (response.status === 404) return unavailable('NOT_FOUND');
    if (response.status === 429 || response.status === 503) {
      // Bounded delta-seconds only; caller decides when to offer another GET.
      const retry = typeof response.retryAfter === 'string' && /^\d{1,5}$/.test(response.retryAfter) ? Number(response.retryAfter) : undefined;
      return { state: 'Unavailable', code: 'THROTTLED', tenantWriteAllowed: false,
        ...(retry !== undefined && retry <= 86400 ? { retryAfterSeconds: retry } : {}) };
    }
    if (response.status !== 200) return unavailable('HTTP_FAILURE');
    // Same RFC 9110 entity-tag grammar as SaveContract: empty opaque tags and
    // obs-text octets are valid; non-octet Unicode and trailing line breaks are not.
    // Preserve the token verbatim. Syntax is neither freshness nor write authority.
    if (typeof response.etag !== 'string' || !/^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"(?![\s\S])/.test(response.etag)) return blocked('MISSING_OR_INVALID_ETAG');
    const streamed = await readBoundedBody(response.body, 65536); // 64 KiB of actual bytes, not characters or header claims.
    if (!streamed.ok) return blocked(streamed.code);
    let body: string;
    try { body = new TextDecoder('utf-8', { fatal: true }).decode(streamed.bytes); }
    catch { return blocked('INVALID_JSON_ENCODING'); }
    if (body.length > 65536) return blocked('RESPONSE_TOO_LARGE');
    let value: unknown;
    try { value = JSON.parse(body); } catch { return blocked('INVALID_JSON'); }
    const line = decode(value, amountToken(body));
    if (!line) return blocked('INVALID_LINE_RESPONSE');
    const differences = (Object.keys(snapshot) as Array<keyof IExpenseReadback>).filter(k => snapshot[k] !== line[k]);
    if (differences.length) return { state: 'Mismatch', fields: differences, tenantWriteAllowed: false };
    return { state: 'MatchedReadback', line, etag: response.etag, tenantWriteAllowed: false, securityProven: false,
      outstanding: ['ReasonStorage', 'HumanOriginatorAudit', 'OwnerAndMonth', 'UniqueOperation', 'Permissions'] };
  } catch {
    // A transport error may contain tenant data or credentials. Never echo it.
    return unavailable('TRANSPORT_FAILURE');
  }
}
