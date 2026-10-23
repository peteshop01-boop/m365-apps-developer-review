/** Passive observation data only; no native source, issuer, resource or lifecycle authority. */
export type ConnectorTreeV2 = readonly ['null'] | readonly ['boolean', boolean] |
  readonly ['string', string] | readonly ['number', string] |
  readonly ['array', readonly ConnectorTreeV2[]] |
  readonly ['object', readonly (readonly [string, ConnectorTreeV2])[]];
export type ConnectorOperationV2 = 'G1_SCOPE_GET' | 'G1_LEDGER_GET' | 'G1_MEMBERSHIP_PAGE_GET' |
  'G3_LEDGER_CREATE' | 'G3_SCOPE_CAS' | 'G4_PENDING_CREATE' | 'G4_SCOPE_CAS' |
  'G5_BINARY_CREATE' | 'G5_COLLISION_LOOKUP_GET' | 'G6_METADATA_GET' | 'G6_RIGHTS_GET' |
  'G7_BINARY_GET' | 'G7_SCRIPT_RUN' | 'G8_LEDGER_CREATE' | 'G8_SCOPE_CAS' | 'G9_SOURCE_GET' |
  'G9_BINDING_CREATE' | 'G9_REFERENCE_CREATE' | 'G9_INVENTORY_CREATE' | 'G9_SEAL_CREATE' |
  'G10_REGISTRY_GET' | 'G11_BEFORE_GET' | 'G11_EFFECT_CREATE' | 'G11_EFFECT_CAS' |
  'G12_PROOF_CREATE' | 'G12_SCOPE_CAS' | 'GH_HOLD_CREATE' | 'GH_SCOPE_CAS';
export interface ConnectorAvailabilityV2 {
  readonly state: 'Observed' | 'NotExposed';
  readonly path: readonly (string | number)[] | null;
}
export interface ConnectorObservationV2 {
  readonly k: 'kcf.kpi.connector-observation.v2';
  readonly profile: 'standard-sharepoint-connector-observation-protected-script-v2';
  readonly operation: ConnectorOperationV2;
  readonly request: {
    readonly target: { readonly tenantId: string; readonly environmentId: string; readonly siteId: string;
      readonly webId: string; readonly listId: string | null; readonly libraryId: string | null; readonly scopeRowId: number | null };
    readonly relativeEndpoint: string;
    readonly method: 'GET' | 'POST';
    readonly locator: { readonly serverRelativeUrl: string; readonly uniqueId: string | null;
      readonly version: string | null; readonly bytes: number | null; readonly sha256: string | null } | null;
    readonly source: { readonly itemId: number; readonly itemVersion: string | null;
      readonly itemETag: string | null; readonly sourceIdentity: string } | null;
    readonly ifMatch: string | null;
    readonly configuration: { readonly connectionReferenceId: string; readonly configurationSHA256: string;
      readonly protectedIssuerPrincipalId: string | null; readonly scriptId: string | null; readonly scriptSHA256: string | null;
      readonly workbookDriveId: string | null; readonly workbookItemId: string | null; readonly workbookVersion: string | null };
    readonly correlation: { readonly executionKey: string; readonly attemptKey: string; readonly actionKey: string };
  };
  readonly captureOrdinal: number;
  readonly outcome: 'Completed' | 'Failed' | 'TimedOut' | 'OutcomeUnknown';
  readonly outputsTree: ConnectorTreeV2 | null;
  readonly diagnosticsTree: ConnectorTreeV2 | null;
  readonly availability: { readonly outputs: ConnectorAvailabilityV2; readonly status: ConnectorAvailabilityV2;
    readonly headers: ConnectorAvailabilityV2; readonly body: ConnectorAvailabilityV2; readonly diagnostics: ConnectorAvailabilityV2 };
  readonly candidate: { readonly commit: string; readonly tree: string };
}

const INVALID = 'INVALID_CONNECTOR_OBSERVATION_V2';
const KIND = 'kcf.kpi.connector-observation.v2';
const PROFILE = 'standard-sharepoint-connector-observation-protected-script-v2';
// Realm integrity is an application admission prerequisite, not something this codec proves.
const ownNames = Object.getOwnPropertyNames;
const ownSymbols = Object.getOwnPropertySymbols;
const descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf;
const objectPrototype = Object.prototype, arrayPrototype = Array.prototype;
const bytePrototype = Uint8Array.prototype, bufferPrototype = ArrayBuffer.prototype;
const isView = ArrayBuffer.isView, isArray = Array.isArray;
const parse = JSON.parse, stringify = JSON.stringify, freeze = Object.freeze;
const finite = Number.isFinite, safeInteger = Number.isSafeInteger, is = Object.is;
const U8 = Uint8Array;
const typedPrototype = prototype(bytePrototype) as object;
const typedTag = descriptor(typedPrototype, (Symbol as SymbolConstructor & { readonly toStringTag: symbol }).toStringTag)!.get!;
const typedLength = descriptor(typedPrototype, 'byteLength')!.get!;
const typedBuffer = descriptor(typedPrototype, 'buffer')!.get!;
const typedOffset = descriptor(typedPrototype, 'byteOffset')!.get!;
const bufferLength = descriptor(bufferPrototype, 'byteLength')!.get!;
const typedSet = bytePrototype.set;
const decode = TextDecoder.prototype.decode, encode = TextEncoder.prototype.encode;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }), encoder = new TextEncoder();
const issued = new WeakMap<object, { record: ConnectorObservationV2; text: string }>();
const weakGet = WeakMap.prototype.get, weakSet = WeakMap.prototype.set;
function deny(): never { throw INVALID; }
function ownKeys(value: object): (string | symbol)[] {
  const result: (string | symbol)[] = ownNames(value), symbols = ownSymbols(value);
  for (let i = 0; i < symbols.length; i++) result.push(symbols[i]);
  return result;
}

function copyBytes(input: unknown): Uint8Array {
  if (!isView(input) || typedTag.call(input) !== 'Uint8Array') return deny();
  const length = typedLength.call(input) as number, buffer = typedBuffer.call(input) as ArrayBuffer;
  typedOffset.call(input); bufferLength.call(buffer);
  if (prototype(input) !== bytePrototype || prototype(buffer) !== bufferPrototype || ownKeys(buffer).length) return deny();
  const keys = ownKeys(input as object);
  if (keys.length !== length) return deny();
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] !== String(i)) return deny();
    const d = descriptor(input, keys[i]);
    if (!d || !('value' in d) || !d.enumerable || !d.writable || !d.configurable) return deny();
  }
  const copy = new U8(length);
  typedSet.call(copy, input as Uint8Array);
  return copy;
}

/** Private parsed graphs only. Accept all descriptors before obtaining any field value. */
function fields(value: unknown, names: readonly string[], array = false): unknown[] {
  if (!value || typeof value !== 'object' || prototype(value) !== (array ? arrayPrototype : objectPrototype)) return deny();
  const keys = ownKeys(value), ds: PropertyDescriptor[] = [];
  if (keys.length !== names.length + (array ? 1 : 0)) return deny();
  for (let i = 0; i < names.length; i++) {
    if (keys[i] !== names[i]) return deny();
    const d = descriptor(value, names[i]);
    if (!d || !('value' in d) || !d.enumerable || !d.writable || !d.configurable) return deny();
    ds.push(d);
  }
  if (array) {
    const d = descriptor(value, 'length');
    if (keys[keys.length - 1] !== 'length' || !d || !('value' in d) || d.enumerable || d.configurable || !d.writable || d.value !== names.length) return deny();
  } else {
    for (const key in value) if (names.indexOf(key) < 0) return deny();
  }
  const result: unknown[] = [];
  for (let i = 0; i < ds.length; i++) result.push(ds[i].value);
  return result;
}
function dense(value: unknown, count?: number): unknown[] {
  if (!isArray(value) || prototype(value) !== arrayPrototype) return deny();
  // Obtain membership first; fields() admits all descriptors before reading values.
  const length = ownKeys(value).length - 1;
  if (length < 0 || (count !== undefined && length !== count)) return deny();
  const names: string[] = [];
  for (let i = 0; i < length; i++) names.push(String(i));
  return fields(value, names, true);
}
function integer(value: unknown): value is number {
  return typeof value === 'number' && safeInteger(value) && value >= 0 && !is(value, -0);
}
function nonempty(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function guid(value: unknown): boolean { return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value); }
function sha(value: unknown): boolean { return typeof value === 'string' && /^[0-9A-F]{64}$/.test(value); }
function git(value: unknown): boolean { return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value); }
function nullable(value: unknown, predicate: (input: unknown) => boolean): boolean { return value === null || predicate(value); }
function positive(value: unknown): boolean { return integer(value) && value > 0; }
function relative(value: unknown, locator = false): boolean {
  return nonempty(value) && value[0] === '/' && value.substring(0, 2) !== '//' &&
    value.indexOf('://') < 0 && !/[\r\n\\#]/.test(value) && (!locator || value.indexOf('?') < 0);
}
function numberSpelling(value: unknown): boolean {
  if (typeof value !== 'string' || !/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/.test(value)) return false;
  const n = parse(value) as number;
  return finite(n) && (is(n, -0) ? '-0' : stringify(n)) === value;
}
function indexKey(key: string): number | undefined {
  if (!/^(?:0|[1-9][0-9]*)$/.test(key)) return undefined;
  const n = Number(key);
  return n <= 4294967294 && stringify(n) === key ? n : undefined;
}

function validateTree(value: unknown): void {
  const node = dense(value);
  if (node[0] === 'null') { if (node.length !== 1) return deny(); return; }
  if (node.length !== 2) return deny();
  if (node[0] === 'boolean') { if (typeof node[1] !== 'boolean') return deny(); return; }
  if (node[0] === 'string') { if (typeof node[1] !== 'string') return deny(); return; }
  if (node[0] === 'number') { if (!numberSpelling(node[1])) return deny(); return; }
  const items = dense(node[1]);
  if (node[0] === 'array') {
    for (let i = 0; i < items.length; i++) validateTree(items[i]);
    return;
  }
  if (node[0] !== 'object') return deny();
  const keys = new Set<string>();
  let lastIndex = -1, nonIndexSeen = false;
  for (let i = 0; i < items.length; i++) {
    const pair = dense(items[i], 2);
    if (typeof pair[0] !== 'string' || keys.has(pair[0])) return deny();
    keys.add(pair[0]);
    const index = indexKey(pair[0]);
    if (index !== undefined) {
      if (nonIndexSeen || index <= lastIndex) return deny();
      lastIndex = index;
    } else nonIndexSeen = true;
    validateTree(pair[1]);
  }
}

const GET_OPERATIONS = ['G1_SCOPE_GET', 'G1_LEDGER_GET', 'G1_MEMBERSHIP_PAGE_GET', 'G5_COLLISION_LOOKUP_GET',
  'G6_METADATA_GET', 'G6_RIGHTS_GET', 'G7_BINARY_GET', 'G9_SOURCE_GET', 'G10_REGISTRY_GET', 'G11_BEFORE_GET'];
const POST_OPERATIONS = ['G3_LEDGER_CREATE', 'G3_SCOPE_CAS', 'G4_PENDING_CREATE', 'G4_SCOPE_CAS', 'G5_BINARY_CREATE',
  'G7_SCRIPT_RUN', 'G8_LEDGER_CREATE', 'G8_SCOPE_CAS', 'G9_BINDING_CREATE', 'G9_REFERENCE_CREATE', 'G9_INVENTORY_CREATE',
  'G9_SEAL_CREATE', 'G11_EFFECT_CREATE', 'G11_EFFECT_CAS', 'G12_PROOF_CREATE', 'G12_SCOPE_CAS', 'GH_HOLD_CREATE', 'GH_SCOPE_CAS'];
function validateRequest(value: unknown, operation: string): void {
  const r = fields(value, ['target', 'relativeEndpoint', 'method', 'locator', 'source', 'ifMatch', 'configuration', 'correlation']);
  const t = fields(r[0], ['tenantId', 'environmentId', 'siteId', 'webId', 'listId', 'libraryId', 'scopeRowId']);
  for (let i = 0; i < 4; i++) if (!guid(t[i])) return deny();
  if (!nullable(t[4], guid) || !nullable(t[5], guid) || !nullable(t[6], positive) || !relative(r[1])) return deny();
  const method = GET_OPERATIONS.indexOf(operation) >= 0 ? 'GET' : POST_OPERATIONS.indexOf(operation) >= 0 ? 'POST' : undefined;
  if (!method || r[2] !== method) return deny();
  if (r[3] !== null) {
    const l = fields(r[3], ['serverRelativeUrl', 'uniqueId', 'version', 'bytes', 'sha256']);
    if (!relative(l[0], true) || !nullable(l[1], guid) || !nullable(l[2], nonempty) || !nullable(l[3], integer) || !nullable(l[4], sha)) return deny();
  }
  if (r[4] !== null) {
    const s = fields(r[4], ['itemId', 'itemVersion', 'itemETag', 'sourceIdentity']);
    if (!positive(s[0]) || !nullable(s[1], nonempty) || !nullable(s[2], nonempty) || !nonempty(s[3])) return deny();
  }
  if (operation.slice(-4) === '_CAS') {
    if (!nonempty(r[5]) || r[5] === '*') return deny();
  } else if (r[5] !== null) return deny();
  const c = fields(r[6], ['connectionReferenceId', 'configurationSHA256', 'protectedIssuerPrincipalId', 'scriptId',
    'scriptSHA256', 'workbookDriveId', 'workbookItemId', 'workbookVersion']);
  if (!nonempty(c[0]) || !sha(c[1]) || !nullable(c[2], nonempty) || !nullable(c[3], nonempty) || !nullable(c[4], sha)) return deny();
  for (let i = 5; i < 8; i++) if (!nullable(c[i], nonempty)) return deny();
  if ((c[3] === null) !== (c[4] === null) || (c[5] === null) !== (c[6] === null) || (c[5] === null) !== (c[7] === null)) return deny();
  if (operation === 'G7_SCRIPT_RUN' && (c[3] === null || c[5] === null)) return deny();
  if (operation === 'G9_SOURCE_GET' && r[4] === null) return deny();
  if ((operation === 'G6_METADATA_GET' || operation === 'G7_BINARY_GET') && r[3] === null) return deny();
  const correlation = fields(r[7], ['executionKey', 'attemptKey', 'actionKey']);
  for (let i = 0; i < 3; i++) if (!nonempty(correlation[i])) return deny();
}

function available(value: unknown): unknown[] | null {
  const a = fields(value, ['state', 'path']);
  if (a[0] === 'NotExposed') { if (a[1] !== null) return deny(); return null; }
  if (a[0] !== 'Observed') return deny();
  const path = dense(a[1]);
  for (let i = 0; i < path.length; i++) if (typeof path[i] !== 'string' && !integer(path[i])) return deny();
  return path;
}
function resolvePath(tree: unknown, path: unknown[]): void {
  let value = tree;
  for (let i = 0; i < path.length; i++) {
    const node = dense(value);
    if (node[0] === 'array' && integer(path[i])) {
      const children = dense(node[1]), index = path[i] as number;
      if (index >= children.length) return deny();
      value = children[index];
    } else if (node[0] === 'object' && typeof path[i] === 'string') {
      const pairs = dense(node[1]);
      let found = false;
      for (let j = 0; j < pairs.length; j++) {
        const pair = dense(pairs[j], 2);
        if (pair[0] === path[i]) { value = pair[1]; found = true; break; }
      }
      if (!found) return deny();
    } else return deny();
  }
}
function validateRecord(value: unknown): ConnectorObservationV2 {
  const v = fields(value, ['k', 'profile', 'operation', 'request', 'captureOrdinal', 'outcome', 'outputsTree', 'diagnosticsTree', 'availability', 'candidate']);
  if (v[0] !== KIND || v[1] !== PROFILE || typeof v[2] !== 'string' || !integer(v[4]) ||
    ['Completed', 'Failed', 'TimedOut', 'OutcomeUnknown'].indexOf(v[5] as string) < 0) return deny();
  validateRequest(v[3], v[2]);
  if (v[6] !== null) validateTree(v[6]);
  if (v[7] !== null) validateTree(v[7]);
  const a = fields(v[8], ['outputs', 'status', 'headers', 'body', 'diagnostics']);
  const outputPath = available(a[0]), diagnosticsPath = available(a[4]);
  if ((v[6] === null) !== (outputPath === null) || (outputPath !== null && outputPath.length !== 0) ||
    (v[7] === null) !== (diagnosticsPath === null) || (diagnosticsPath !== null && diagnosticsPath.length !== 0)) return deny();
  for (let i = 1; i < 4; i++) {
    const path = available(a[i]);
    if (path !== null) { if (v[6] === null) return deny(); resolvePath(v[6], path); }
  }
  const candidate = fields(v[9], ['commit', 'tree']);
  if (!git(candidate[0]) || !git(candidate[1])) return deny();
  return value as ConnectorObservationV2;
}

/** Duplicate decoded object keys are denied by scanning before JSON.parse materialisation. */
function passiveJson(text: string): unknown {
  let at = 0;
  function whitespace(): void { while (at < text.length && /[\x20\t\r\n]/.test(text[at])) at++; }
  function stringToken(): string {
    const start = at++;
    while (at < text.length) {
      const ch = text.charCodeAt(at++);
      if (ch === 34) return parse(text.substring(start, at)) as string;
      if (ch < 32) return deny();
      if (ch === 92) {
        const escape = text[at++];
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.substring(at, at + 4))) return deny();
          at += 4;
        } else if (!escape || '"\\/bfnrt'.indexOf(escape) < 0) return deny();
      }
    }
    return deny();
  }
  function value(): void {
    whitespace(); const ch = text[at];
    if (ch === '"') { stringToken(); return; }
    if (ch === '{' || ch === '[') {
      const object = ch === '{', end = object ? '}' : ']', seen = new Set<string>();
      at++; whitespace();
      if (text[at] === end) { at++; return; }
      while (true) {
        if (object) {
          if (text[at] !== '"') return deny();
          const key = stringToken();
          if (seen.has(key)) return deny();
          seen.add(key); whitespace();
          if (text[at++] !== ':') return deny();
        }
        value(); whitespace();
        if (text[at] === end) { at++; return; }
        if (text[at++] !== ',') return deny();
        whitespace();
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.substring(at));
    if (!token) return deny();
    const parsed = parse(token[0]) as unknown;
    if (typeof parsed === 'number' && !finite(parsed)) return deny();
    at += token[0].length;
  }
  value(); whitespace();
  if (at !== text.length) return deny();
  return parse(text) as unknown;
}

function snapshot(value: unknown): ConnectorTreeV2 {
  if (value === null) return freeze(['null'] as ['null']);
  if (typeof value === 'boolean') return freeze(['boolean', value] as ['boolean', boolean]);
  if (typeof value === 'string') return freeze(['string', value] as ['string', string]);
  if (typeof value === 'number') {
    if (!finite(value)) return deny();
    return freeze(['number', is(value, -0) ? '-0' : stringify(value)] as ['number', string]);
  }
  if (isArray(value)) {
    const data = dense(value), children: ConnectorTreeV2[] = [];
    for (let i = 0; i < data.length; i++) children.push(snapshot(data[i]));
    return freeze(['array', freeze(children)] as ['array', readonly ConnectorTreeV2[]]);
  }
  if (!value || typeof value !== 'object') return deny();
  const names = ownNames(value), data = fields(value, names), entries: (readonly [string, ConnectorTreeV2])[] = [];
  for (let i = 0; i < names.length; i++) entries.push(freeze([names[i], snapshot(data[i])] as [string, ConnectorTreeV2]));
  return freeze(['object', freeze(entries)] as ['object', readonly (readonly [string, ConnectorTreeV2])[]]);
}
function freezeGraph(value: unknown): void {
  if (value === null || typeof value !== 'object') return;
  const data = isArray(value) ? dense(value) : fields(value, ownNames(value));
  for (let i = 0; i < data.length; i++) freezeGraph(data[i]);
  freeze(value);
}
function canonicalBytes(text: string): Uint8Array {
  // TextEncoder replaces lone literal surrogates, so reject them before encoding.
  for (let i = 0; i < text.length; i++) {
    const n = text.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const low = text.charCodeAt(++i);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return deny();
    } else if (n >= 0xdc00 && n <= 0xdfff) return deny();
  }
  return encode.call(encoder, text);
}

export function snapshotConnectorTreeV2(input: unknown): ConnectorTreeV2 {
  if (typeof input !== 'string') return deny();
  try { return snapshot(passiveJson(input)); } catch (_) { return deny(); }
}
export function parseConnectorObservationArtifactV2(bytes: Uint8Array): ConnectorObservationV2 {
  try {
    const copy = copyBytes(bytes);
    if (copy[0] === 0xef && copy[1] === 0xbb && copy[2] === 0xbf) return deny();
    const text = decode.call(decoder, copy), record = validateRecord(passiveJson(text));
    const canonical = stringify(record), encoded = canonicalBytes(canonical);
    if (canonical !== text || copy.length !== encoded.length) return deny();
    for (let i = 0; i < copy.length; i++) if (copy[i] !== encoded[i]) return deny();
    const view = validateRecord(parse(canonical));
    freezeGraph(view);
    weakSet.call(issued, view, { record, text: canonical });
    return view;
  } catch (_) { return deny(); }
}
export function encodeConnectorObservationV2(record: ConnectorObservationV2): Uint8Array {
  try {
    const privateState = weakGet.call(issued, record) as { record: ConnectorObservationV2; text: string } | undefined;
    if (!privateState) return deny();
    validateRecord(privateState.record);
    return canonicalBytes(privateState.text);
  } catch (_) { return deny(); }
}
