/** Closed, inactive B storage representation. No tenant authority is supplied by these records. */
export const C2B_FILE_LEAF_BYTES = 1000000;
export const C2B_FILE_PAGE_FANOUT = 64;
export const C2B_FILE_PAGE_BYTES = 9480;
export const C2B_FILE_PURPOSES = ['command', 'plan', 'journal', 'effect', 'before', 'desired',
  'selection', 'annual', 'period', 'selected-keys', 'confirmation', 'later-journal', 'recovery',
  'receipt', 'history', 'raw-observation', 'observation-projection', 'binding', 'acceptance'] as const;
export type C2bFilePurpose = typeof C2B_FILE_PURPOSES[number];
export interface C2bFileTarget { site: string; web: string; library: string; }
export interface C2bFileLocator { u: string; v: '1.0'; n: number; h: string; }
export interface C2bContentReferenceV1 {
  k: 'kcf.kpi.content-ref.v1'; p: C2bFilePurpose; t: C2bFileTarget; r: C2bFileLocator;
  z: number; n: number; h: string; b: string;
}
export interface C2bContentPageV1 {
  k: 'kcf.kpi.content-page.v1'; p: C2bFilePurpose; l: number; e: C2bFileLocator[];
}
export interface C2bFileStateV1 { k: 'kcf.kpi.file-state.v1'; p: 'journal' | 'effect'; r: C2bContentReferenceV1; }
export interface C2bStorageSourceV1 {
  list: string; itemId: number; authorPrincipal: string; version: string; etag: string;
  rawBytesSHA256: string; physicalFieldsSHA256: string;
}
export interface C2bStorageBindingV1 {
  k: 'kcf.kpi.storage-binding.v1';
  target: C2bFileTarget & { list: string };
  operation: { commandType: string; purpose: C2bFilePurpose; stateVersion: number };
  identity: { commandKey: string; effectKey: string | null; attemptKey: string; leaseEpoch: number };
  source: { phase: 'PreSource' | 'ObservedSource'; expectedActor: string; observed: C2bStorageSourceV1 | null };
  subjects: { subjectType: string; subjectKey: string; personKey: string; workplanKey: string;
    performanceYear: number; itemKey: string | null; behaviourValue: string | null };
  roles: { actorPersonKey: string; effectiveRole: string; rolePublicationSHA256: string };
  catalogue: { catalogueKey: string; version: string; publicationSHA256: string; rowsSHA256: string } | null;
  candidate: { commit: string; tree: string; storageDesignSHA256: string };
  grant: { issuerPrincipal: string; authorityRef: string; authoritySHA256: string; scopeSHA256: string };
}
export interface C2bStorageAcceptanceV1 {
  k: 'kcf.kpi.storage-acceptance.v1'; attempt: string; source: C2bStorageSourceV1;
  bindingSHA256: string; inventorySHA256: string; issuer: string; grantSHA256: string; createdAt: string;
}
/** The physical capture is never overwritten with hydrated logical values. */
export interface C2bPhysicalLogicalPairV1<TPhysical, TLogical> {
  readonly capturedRawBytes: Uint8Array;
  readonly capturedRawSHA256: string;
  readonly physical: Readonly<TPhysical>;
  readonly physicalFieldsSHA256: string;
  readonly logicalBytes: Uint8Array;
  readonly logicalBytesSHA256: string;
  readonly logical: Readonly<TLogical>;
}
export function storageRequire(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error('C2B_FILE_' + code);
}
export function storageInteger(value: unknown, minimum: number = 0): asserts value is number {
  storageRequire(typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum, 'INTEGER');
}
export function storageAdd(a: number, b: number): number {
  storageInteger(a); storageInteger(b); const n = a + b; storageInteger(n); return n;
}
export function storageGuid(value: unknown): asserts value is string {
  storageRequire(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'GUID');
}
export function storageDigest(value: unknown): asserts value is string {
  storageRequire(typeof value === 'string' && /^[0-9A-F]{64}$/.test(value), 'SHA256');
}
function text(value: unknown): asserts value is string {
  storageRequire(typeof value === 'string' && value.trim().length > 0, 'TEXT');
}
function nullableText(value: unknown): void { if (value !== null) text(value); }
export function storageRecord(value: unknown, keys: readonly string[]): Record<string, unknown> {
  storageRequire(value !== null && typeof value === 'object' && !Array.isArray(value), 'RECORD');
  const v = value as Record<string, unknown>;
  storageRequire(Object.getOwnPropertySymbols(v).length === 0 && Object.keys(v).sort().join('|') === keys.slice().sort().join('|'), 'KEYS');
  storageRequire(Object.keys(v).every(k => Object.getOwnPropertyDescriptor(v, k)?.get === undefined), 'ACCESSOR');
  return v;
}
export function storagePurpose(value: unknown): asserts value is C2bFilePurpose {
  storageRequire(typeof value === 'string' && (C2B_FILE_PURPOSES as readonly string[]).includes(value), 'PURPOSE');
}
export function assertStorageTarget(value: unknown): asserts value is C2bFileTarget {
  const x = storageRecord(value, ['site', 'web', 'library']); storageGuid(x.site); storageGuid(x.web); storageGuid(x.library);
}
export function assertStorageLocator(value: unknown, maxBytes: number = C2B_FILE_LEAF_BYTES): asserts value is C2bFileLocator {
  const x = storageRecord(value, ['u', 'v', 'n', 'h']); storageGuid(x.u); storageRequire(x.v === '1.0', 'VERSION');
  storageInteger(x.n); storageRequire(x.n <= maxBytes, 'FILE_LENGTH'); storageDigest(x.h);
}
/** Integer division avoids the unsafe n + divisor - 1 shortcut near MAX_SAFE_INTEGER. */
function ceilDiv(n: number, d: number): number { return Math.floor(n / d) + (n % d === 0 ? 0 : 1); }
export function storageFraming(length: number): { leaves: number; pages: number[]; depth: number; files: number } {
  storageInteger(length); const leaves = Math.max(1, ceilDiv(length, C2B_FILE_LEAF_BYTES));
  const pages: number[] = []; let count = leaves; let files = leaves;
  do { count = ceilDiv(count, C2B_FILE_PAGE_FANOUT); pages.push(count); files = storageAdd(files, count); } while (count > 1);
  return { leaves, pages, depth: pages.length, files };
}
export function assertContentReference(value: unknown, expected?: { purpose: C2bFilePurpose; target: C2bFileTarget; bindingSHA256: string }): asserts value is C2bContentReferenceV1 {
  const x = storageRecord(value, ['k', 'p', 't', 'r', 'z', 'n', 'h', 'b']);
  storageRequire(x.k === 'kcf.kpi.content-ref.v1', 'REFERENCE_VERSION'); storagePurpose(x.p); assertStorageTarget(x.t);
  assertStorageLocator(x.r, C2B_FILE_PAGE_BYTES); storageInteger(x.n); storageInteger(x.z, 1); storageDigest(x.h); storageDigest(x.b);
  storageRequire(x.z === storageFraming(x.n).depth, 'DEPTH');
  if (expected) storageRequire(x.p === expected.purpose && storageCanonical(x.t) === storageCanonical(expected.target)
    && x.b === expected.bindingSHA256, 'REFERENCE_CONTEXT');
}
export function assertContentPage(value: unknown, purpose: C2bFilePurpose, level: number): asserts value is C2bContentPageV1 {
  const x = storageRecord(value, ['k', 'p', 'l', 'e']);
  storageRequire(x.k === 'kcf.kpi.content-page.v1' && x.p === purpose && x.l === level, 'PAGE_CONTEXT');
  storageInteger(x.l); storageRequire(Array.isArray(x.e) && x.e.length >= 1 && x.e.length <= C2B_FILE_PAGE_FANOUT, 'PAGE_FANOUT');
  x.e.forEach(v => assertStorageLocator(v, level === 0 ? C2B_FILE_LEAF_BYTES : C2B_FILE_PAGE_BYTES));
}
export function assertStorageSource(value: unknown): asserts value is C2bStorageSourceV1 {
  const x = storageRecord(value, ['list', 'itemId', 'authorPrincipal', 'version', 'etag', 'rawBytesSHA256', 'physicalFieldsSHA256']);
  storageGuid(x.list); storageInteger(x.itemId, 1); text(x.authorPrincipal); text(x.version); text(x.etag);
  storageDigest(x.rawBytesSHA256); storageDigest(x.physicalFieldsSHA256);
}
export function assertStorageBinding(value: unknown, expected?: C2bStorageBindingV1): asserts value is C2bStorageBindingV1 {
  const x = storageRecord(value, ['k', 'target', 'operation', 'identity', 'source', 'subjects', 'roles', 'catalogue', 'candidate', 'grant']);
  storageRequire(x.k === 'kcf.kpi.storage-binding.v1', 'BINDING_VERSION');
  const t = storageRecord(x.target, ['site', 'web', 'library', 'list']); Object.values(t).forEach(storageGuid);
  const o = storageRecord(x.operation, ['commandType', 'purpose', 'stateVersion']); text(o.commandType); storagePurpose(o.purpose); storageInteger(o.stateVersion);
  const i = storageRecord(x.identity, ['commandKey', 'effectKey', 'attemptKey', 'leaseEpoch']); text(i.commandKey); nullableText(i.effectKey); storageGuid(i.attemptKey); storageInteger(i.leaseEpoch, 1);
  const s = storageRecord(x.source, ['phase', 'expectedActor', 'observed']); text(s.expectedActor);
  storageRequire(s.phase === 'PreSource' || s.phase === 'ObservedSource', 'SOURCE_PHASE');
  if (s.phase === 'PreSource') storageRequire(s.observed === null && i.effectKey === null, 'PRESOURCE');
  else { assertStorageSource(s.observed); storageRequire(s.observed.list === t.list && s.observed.authorPrincipal === s.expectedActor, 'SOURCE_BINDING'); }
  const sub = storageRecord(x.subjects, ['subjectType', 'subjectKey', 'personKey', 'workplanKey', 'performanceYear', 'itemKey', 'behaviourValue']);
  ['subjectType', 'subjectKey', 'personKey', 'workplanKey'].forEach(k => text(sub[k])); storageInteger(sub.performanceYear, 1); nullableText(sub.itemKey); nullableText(sub.behaviourValue);
  const roles = storageRecord(x.roles, ['actorPersonKey', 'effectiveRole', 'rolePublicationSHA256']); text(roles.actorPersonKey); text(roles.effectiveRole); storageDigest(roles.rolePublicationSHA256);
  if (x.catalogue !== null) { const c = storageRecord(x.catalogue, ['catalogueKey', 'version', 'publicationSHA256', 'rowsSHA256']); text(c.catalogueKey); text(c.version); storageDigest(c.publicationSHA256); storageDigest(c.rowsSHA256); }
  const c = storageRecord(x.candidate, ['commit', 'tree', 'storageDesignSHA256']);
  ['commit', 'tree'].forEach(k => storageRequire(typeof c[k] === 'string' && /^[0-9a-f]{40}$/.test(c[k] as string), 'CANDIDATE')); storageDigest(c.storageDesignSHA256);
  const g = storageRecord(x.grant, ['issuerPrincipal', 'authorityRef', 'authoritySHA256', 'scopeSHA256']); text(g.issuerPrincipal); text(g.authorityRef); storageDigest(g.authoritySHA256); storageDigest(g.scopeSHA256);
  if (expected) storageRequire(storageCanonical(value) === storageCanonical(expected), 'BINDING_CONTEXT');
}
export function assertStorageAcceptance(value: unknown): asserts value is C2bStorageAcceptanceV1 {
  const x = storageRecord(value, ['k', 'attempt', 'source', 'bindingSHA256', 'inventorySHA256', 'issuer', 'grantSHA256', 'createdAt']);
  storageRequire(x.k === 'kcf.kpi.storage-acceptance.v1', 'SEAL_VERSION'); storageGuid(x.attempt); assertStorageSource(x.source);
  storageDigest(x.bindingSHA256); storageDigest(x.inventorySHA256); storageDigest(x.grantSHA256); text(x.issuer); text(x.createdAt);
  storageRequire(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x.createdAt)
    && Number.isFinite(Date.parse(x.createdAt)), 'SEAL_TIME');
}
/** Canonical JSON is only for protocol records; raw source bodies never pass through this function. */
export function storageCanonical(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (v: unknown): string => {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') { storageRequire(Number.isFinite(v), 'JSON_NUMBER'); return JSON.stringify(v); }
    storageRequire(typeof v === 'object' && v !== null && !ancestors.has(v), 'JSON_VALUE_OR_CYCLE');
    ancestors.add(v); let result: string;
    if (Array.isArray(v)) { storageRequire(Object.keys(v).length === v.length, 'JSON_ARRAY'); result = '[' + v.map(visit).join(',') + ']'; }
    else { const record = v as Record<string, unknown>; storageRequire(Object.getOwnPropertySymbols(record).length === 0, 'JSON_SYMBOL');
      result = '{' + Object.keys(record).sort().map(k => JSON.stringify(k) + ':' + visit(record[k])).join(',') + '}'; }
    ancestors.delete(v); return result;
  };
  return visit(value);
}
/** Strict raw JSON read: duplicate decoded keys reject even when SharePoint metadata has ordinary whitespace. */
export function parseStorageJson(wire: string): unknown {
  let position = 0;
  const whitespace = (): void => { while (position < wire.length && /[\x20\t\r\n]/.test(wire[position])) position++; };
  const string = (): string => {
    storageRequire(wire[position] === '"', 'JSON_STRING'); const start = position++;
    while (position < wire.length) {
      const character = wire[position++];
      if (character === '"') return JSON.parse(wire.slice(start, position)) as string;
      if (character === '\\') position++;
    }
    throw new Error('C2B_FILE_JSON_STRING_END');
  };
  const value = (): unknown => {
    whitespace(); const character = wire[position];
    if (character === '"') return string();
    if (character === '{') {
      position++; whitespace(); const object = Object.create(null) as Record<string, unknown>; const keys = new Set<string>();
      if (wire[position] === '}') { position++; return object; }
      while (true) {
        whitespace(); const key = string(); storageRequire(!keys.has(key), 'DUPLICATE_JSON_KEY'); keys.add(key);
        whitespace(); storageRequire(wire[position++] === ':', 'JSON_COLON'); object[key] = value(); whitespace();
        const end = wire[position++]; if (end === '}') return object; storageRequire(end === ',', 'JSON_OBJECT_END');
      }
    }
    if (character === '[') {
      position++; whitespace(); const array: unknown[] = [];
      if (wire[position] === ']') { position++; return array; }
      while (true) { array.push(value()); whitespace(); const end = wire[position++];
        if (end === ']') return array; storageRequire(end === ',', 'JSON_ARRAY_END'); }
    }
    for (const literal of ['true', 'false', 'null']) if (wire.slice(position, position + literal.length) === literal) {
      position += literal.length; return literal === 'null' ? null : literal === 'true';
    }
    const token = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(wire.slice(position));
    storageRequire(token, 'JSON_VALUE'); position += token[0].length;
    const number = Number(token[0]); storageRequire(Number.isFinite(number), 'JSON_NUMBER'); return number;
  };
  const parsed = value(); whitespace(); storageRequire(position === wire.length, 'JSON_TRAILING'); return parsed;
}
/** Exact canonical comparison additionally rejects whitespace, BOM and alternate escapes in protocol records. */
export function parseStorageCanonical(bytes: Uint8Array): unknown {
  const wire = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  const value = parseStorageJson(wire); storageRequire(storageCanonical(value) === wire, 'NONCANONICAL_OR_DUPLICATE'); return value;
}
export function dispatchFileState(wire: string, marker: string | undefined, purpose: 'journal' | 'effect'):
  { kind: 'legacy-inline'; wire: string } | { kind: 'file'; state: C2bFileStateV1 } {
  if (marker === undefined) return { kind: 'legacy-inline', wire };
  storageRequire(marker === 'kcf.kpi.file-state.v1', 'STATE_VERSION');
  const value = parseStorageCanonical(new TextEncoder().encode(wire)); const x = storageRecord(value, ['k', 'p', 'r']);
  storageRequire(x.k === marker && x.p === purpose, 'STATE_DISPATCH'); assertContentReference(x.r);
  storageRequire(x.r.p === purpose, 'STATE_PURPOSE'); return { kind: 'file', state: value as C2bFileStateV1 };
}

/** Classification only: the existing v2 command validator must still validate an inline/hydrated command. */
export function dispatchCommandStorage(wire: string):
  { kind: 'legacy-inline'; wire: string } | { kind: 'file'; reference: C2bContentReferenceV1 } {
  const parsed = parseStorageJson(wire);
  storageRequire(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'COMMAND_RECORD');
  const record = parsed as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(record, 'k')) {
    const reference = parseStorageCanonical(new TextEncoder().encode(wire)); assertContentReference(reference);
    storageRequire(reference.p === 'command', 'COMMAND_PURPOSE'); return { kind: 'file', reference };
  }
  storageRequire(record.schemaVersion === 'kcf.kpi.test-command.v2', 'COMMAND_VERSION');
  return { kind: 'legacy-inline', wire };
}

type BehaviourPurpose = 'annual' | 'period' | 'selection' | 'selected-keys';
export function dispatchBehaviourStorage(wires: Readonly<Record<BehaviourPurpose, string>>, marker: string | undefined,
  context: { target: C2bFileTarget; bindings: Readonly<Record<BehaviourPurpose, string>>;
    selectionSHA256: string; selectionUtf8Bytes: number }):
  { kind: 'legacy-inline'; wires: Readonly<Record<BehaviourPurpose, string>> }
  | { kind: 'file'; references: Readonly<Record<BehaviourPurpose, C2bContentReferenceV1>> } {
  if (marker === undefined) return { kind: 'legacy-inline', wires: { ...wires } };
  storageRequire(marker === 'kcf.kpi.behaviour-storage.v1', 'BEHAVIOUR_VERSION');
  const purposes: BehaviourPurpose[] = ['annual', 'period', 'selection', 'selected-keys'];
  storageRecord(wires, purposes); const references = {} as Record<BehaviourPurpose, C2bContentReferenceV1>;
  for (const purpose of purposes) {
    storageRequire(typeof wires[purpose] === 'string', 'BEHAVIOUR_FIELD');
    const reference = parseStorageCanonical(new TextEncoder().encode(wires[purpose]));
    assertContentReference(reference, { purpose, target: context.target, bindingSHA256: context.bindings[purpose] });
    references[purpose] = reference;
  }
  storageDigest(context.selectionSHA256); storageInteger(context.selectionUtf8Bytes);
  storageRequire(references.selection.h === context.selectionSHA256 && references.selection.n === context.selectionUtf8Bytes,
    'SELECTION_COMPANIONS'); return { kind: 'file', references };
}
