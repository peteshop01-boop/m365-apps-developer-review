import { canonicaliseOptionEDraft, parseCanonicalOptionEDraft } from '../models/OptionEWorkplanDraftModels';
import { EXACT_BODY_MAX_BYTES, EXACT_BODY_V4, type V4Request, type V4DraftBody } from '../models/OptionEWorkplanSubmitExactBodyV4Models';

const fail = (): never => { throw new Error('ExactBodyWireInvalid'); };
const textSchema = { type: 'string' };
const numberSchema = { type: 'number', minimum: -Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER };
const scalarSchema = { anyOf: [textSchema, numberSchema] };
const closed = (required: Record<string, unknown>, optional: Record<string, unknown> = {}): object => ({
  type: 'object', additionalProperties: false, required: Object.keys(required).sort(), properties: { ...required, ...optional }
});
const array = (items: unknown): object => ({ type: 'array', items });
const coreTargetSchema = closed({}, { value: scalarSchema, success: textSchema });
const catalogueFields = { catalogueId:textSchema,catalogueVersion:textSchema,catalogueRevision:numberSchema,catalogueEtag:textSchema,catalogueContentSha256:textSchema };
/** Shared complete ParseJSON declaration; domain validators add semantic uniqueness/ranges. */
export const V4_DRAFT_SCHEMA = closed({
  schemaVersion: {const:'kcf.workplan-draft/v1',type:'string'},
  core: closed({weightingMode:{type:'string',enum:['Equal','Custom']},entries:array(closed({
    coreId:textSchema,kpiId:textSchema,kpiVersionKey:textSchema,targetVersionKey:textSchema,
    role:{type:'string',enum:['Owner','Delivery','Support']}, contributionMethod:{type:'string',enum:['AdditiveDirect','SharedTarget','WeightedDenominator','AccountableOwner','CompletionOversight']},
    weightPercent:numberSchema,annual:coreTargetSchema,q1:coreTargetSchema,q2:coreTargetSchema,q3:coreTargetSchema,q4:coreTargetSchema
  }))}),
  impact:array(closed({impactId:textSchema,wording:textSchema,measure:textSchema,unit:textSchema,success:textSchema},{annual:scalarSchema,q1:scalarSchema,q2:scalarSchema,q3:scalarSchema,q4:scalarSchema})),
  behaviours:closed({frameworkVersion:{const:'KCCC-BEHAVIOUR|v02',type:'string'},roleTier:textSchema,entries:array(closed({
    valueId:textSchema,descriptorKey:textSchema,guidancePromptKeys:array(textSchema),selectedPromptKeys:array(textSchema),commitment:textSchema,
    periodCommitments:closed({Q1:textSchema,Q2:textSchema,Q3:textSchema,Q4:textSchema})
  }))},{governedExtension:closed({schemaVersion:{type:'string',const:'kcf.option-e.behaviours/v02'},
    authority:closed({...catalogueFields,approvalReference:{type:'string',const:'KCF-KPI-Sponsor-BEH-V02-001'}}),roleLevelCode:{type:'string',enum:['L1','L2','L3']},
    headlines:array(closed({behaviourKey:textSchema,headlineTitle:textSchema,selections:array(closed({
      selectionKey:textSchema,source:{type:'string',enum:['Catalogue','Own']},behaviourKey:textSchema,headlineTitle:textSchema,focusKey:textSchema,focusTitle:textSchema,
      roleLevelCode:{type:'string',enum:['L1','L2','L3']},selectedWording:textSchema,...catalogueFields,myCommitment:textSchema,howWillWeKnow:textSchema
    },{targetKey:textSchema}))})),immutableSelectionSnapshots:{type:'boolean',const:true},legacyTargetRatingWeightFieldsWritten:{type:'boolean',const:false},deliveryArithmeticAffected:{type:'boolean',const:false}
  })})
});
export const V4_WIRE_SCHEMA = closed({
  capability:closed(Object.fromEntries(Object.entries(EXACT_BODY_V4).map(([k,v]) => [k,{type:'string',const:v}]))),action:{type:'string',const:'Submit'},
  command:textSchema,person:textSchema,year:{type:'integer',minimum:2000,maximum:9999},workplan:textSchema,
  source:closed({itemId:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},etag:textSchema,version:textSchema,schema:{type:'string',const:'kcf.workplan-draft/v1'},body:textSchema}),referenceBody:textSchema
});
export function assertV4Schema(value: unknown, schema: unknown): void {
  const s = schema as Record<string, unknown>;
  if (s.anyOf) {
    const valid = (s.anyOf as unknown[]).some(child => { try { assertV4Schema(value,child); return true; } catch { return false; } });
    if (!valid) fail(); return;
  }
  if (s.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
    const v = value as Record<string,unknown>, props = s.properties as Record<string,unknown>;
    if (Object.keys(v).some(k => !Object.prototype.hasOwnProperty.call(props,k)) || (s.required as string[]).some(k => !Object.prototype.hasOwnProperty.call(v,k))) fail();
    Object.keys(v).forEach(k => assertV4Schema(v[k],props[k]));
  } else if (s.type === 'array') { if (!Array.isArray(value)) fail(); (value as unknown[]).forEach(v => assertV4Schema(v,s.items)); }
  else if (s.type === 'integer' || s.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (s.type === 'integer' && !Number.isInteger(value)) || value < (s.minimum as number) || value > (s.maximum as number)) fail();
  } else if (typeof value !== s.type) fail();
  if (Object.prototype.hasOwnProperty.call(s,'const') && value !== s.const) fail();
  if (s.enum && !(s.enum as unknown[]).includes(value)) fail();
}
/** Check scalars before JSON parsing can discard duplicate keys or replace encoding. */
export function assertV4Unicode(text: string): void {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const low = text.charCodeAt(++i); if (!(low >= 0xdc00 && low <= 0xdfff)) fail();
    } else if (c >= 0xdc00 && c <= 0xdfff) fail();
  }
}
export function v4Canonical(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') { assertV4Unicode(v); return v; }
    if (typeof v === 'number') { if (!Number.isFinite(v) || Math.abs(v) > Number.MAX_SAFE_INTEGER || Object.is(v, -0)) fail(); return v; }
    if (v === null || typeof v === 'boolean') return v;
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out = Object.create(null) as Record<string, unknown>;
      Object.keys(v).sort().forEach(k => { assertV4Unicode(k); out[k] = walk((v as Record<string, unknown>)[k]); }); return out;
    }
    return fail();
  };
  return JSON.stringify(walk(value));
}
/** Independent token walk tracks decoded keys at every depth; JSON.parse is only the final decoder. */
export function parseV4Canonical(text: string): unknown {
  if (typeof text !== 'string' || text.charCodeAt(0) === 0xfeff || BufferByteLength(text) > EXACT_BODY_MAX_BYTES) fail();
  assertV4Unicode(text);
  let i = 0;
  const string = (): string => {
    if (text[i++] !== '"') return fail(); const start = i - 1;
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') { const value = JSON.parse(text.slice(start, i)) as string; assertV4Unicode(value); return value; }
      if (c === '\\') { if (text[i++] === 'u') i += 4; }
    }
    return fail();
  };
  const value = (depth: number): void => {
    if (depth > 64) fail();
    if (text[i] === '"') { string(); return; }
    if (text[i] === '{') {
      i++; const keys = new Set<string>(); if (text[i] === '}') { i++; return; }
      do { const key = string(); if (keys.has(key)) fail(); keys.add(key); if (text[i++] !== ':') fail(); value(depth + 1); if (text[i] !== ',') break; i++; } while (i < text.length);
      if (text[i++] !== '}') fail(); return;
    }
    if (text[i] === '[') { i++; if (text[i] === ']') { i++; return; } do { value(depth + 1); if (text[i] !== ',') break; i++; } while (i < text.length); if (text[i++] !== ']') fail(); return; }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!token) fail(); i += token![0].length;
  };
  value(0); if (i !== text.length) fail();
  const parsed = JSON.parse(text) as unknown; if (v4Canonical(parsed) !== text) fail(); return parsed;
}
export function BufferByteLength(text: string): number {
  assertV4Unicode(text); let count = 0;
  for (const scalar of Array.from(text)) { const cp = scalar.codePointAt(0)!; count += cp < 128 ? 1 : cp < 2048 ? 2 : cp < 65536 ? 3 : 4; }
  return count;
}
export function decodeV4Utf8(bytes: Uint8Array): string {
  if (bytes.length > EXACT_BODY_MAX_BYTES || (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191)) fail();
  // Fatal TextDecoder excludes overlong sequences, encoded surrogates and truncation.
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const again = new TextEncoder().encode(text);
  if (again.length !== bytes.length || !again.every((b, i) => b === bytes[i])) fail();
  parseV4Canonical(text); return text;
}
export function parseV4Draft(body: string): V4DraftBody {
  const parsed = parseV4Canonical(body); assertV4Schema(parsed,V4_DRAFT_SCHEMA); const draft = parseCanonicalOptionEDraft(body);
  if (canonicaliseOptionEDraft(draft) !== body) fail(); return draft;
}
export function v4ExactKeys(v: unknown, keys: readonly string[]): asserts v is Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) fail();
}
export const v4Etag = (v: unknown): v is string => typeof v === 'string' && /^"[^"\r\n]+"$/.test(v) && v !== '"*"';
export function parseV4Request(body: string): V4Request {
  const r = parseV4Canonical(body); assertV4Schema(r,V4_WIRE_SCHEMA); v4ExactKeys(r, ['capability','action','command','person','year','workplan','source','referenceBody']);
  if (v4Canonical(r.capability) !== v4Canonical(EXACT_BODY_V4) || r.action !== 'Submit'
    || typeof r.command !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.command)
    || typeof r.person !== 'string' || !r.person || r.person.includes('|') || typeof r.workplan !== 'string' || !r.workplan
    || typeof r.year !== 'number' || !Number.isInteger(r.year) || r.year < 2000 || r.year > 9999 || typeof r.referenceBody !== 'string') fail();
  v4ExactKeys(r.source, ['itemId','etag','version','schema','body']);
  const d = r.source;
  if (!Number.isSafeInteger(d.itemId) || (d.itemId as number) < 1 || !v4Etag(d.etag)
    || typeof d.version !== 'string' || !d.version || d.schema !== 'kcf.workplan-draft/v1' || typeof d.body !== 'string') fail();
  parseV4Draft(d.body as string); parseV4Canonical(r.referenceBody as string); return r as unknown as V4Request;
}
export const v4Equal = (a: unknown, b: unknown): boolean => v4Canonical(a) === v4Canonical(b);
