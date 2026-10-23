/** @jest-environment node */
"use strict";
import { snapshotConnectorTreeV2 as snapshot, parseConnectorObservationArtifactV2 as parse,
  encodeConnectorObservationV2 as encode, ConnectorObservationV2 } from './C2bConnectorObservationV2Models';

const E = 'INVALID_CONNECTOR_OBSERVATION_V2';
const textBytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const bytes = (v: unknown): Uint8Array => textBytes(JSON.stringify(v));
// Mutable literal fixture data is deliberately NOT an admissible public record identity.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Data = any;
function fixture(): Data {
  return {
    k: 'kcf.kpi.connector-observation.v2', profile: 'standard-sharepoint-connector-observation-protected-script-v2',
    operation: 'G1_SCOPE_GET', request: {
      target: { tenantId: '0dda491f-1e33-4087-a4a9-c3d70bf0a63f', environmentId: '71ed134f-6e0c-490f-ab2e-c0a750610944',
        siteId: '7ff9702a-85d0-4ba3-aca9-7022b22cc53a', webId: '92540e6b-68d1-486a-ac64-be2bbff38e7f',
        listId: '3d5c4416-92c8-4503-a8a9-b7e55b17f393', libraryId: null, scopeRowId: 1 },
      relativeEndpoint: '/_api/web/lists/items(1)', method: 'GET', locator: null, source: null, ifMatch: null,
      configuration: { connectionReferenceId: 'synthetic-connection', configurationSHA256: 'A'.repeat(64),
        protectedIssuerPrincipalId: null, scriptId: null, scriptSHA256: null, workbookDriveId: null, workbookItemId: null, workbookVersion: null },
      correlation: { executionKey: 'synthetic-execution', attemptKey: 'synthetic-attempt', actionKey: 'synthetic-action' } },
    captureOrdinal: 0, outcome: 'Completed',
    outputsTree: ['object', [['statusCode', ['number', '200']], ['headers', ['object', []]], ['body', ['null']]]],
    diagnosticsTree: null,
    availability: { outputs: { state: 'Observed', path: [] }, status: { state: 'Observed', path: ['statusCode'] },
      headers: { state: 'Observed', path: ['headers'] }, body: { state: 'Observed', path: ['body'] },
      diagnostics: { state: 'NotExposed', path: null } },
    candidate: { commit: 'a'.repeat(40), tree: 'b'.repeat(40) }
  };
}
function fail(v: unknown): void { expect(() => parse(bytes(v))).toThrow(E); }
function treeFixture(tree: unknown): Data {
  const f = fixture(); f.outputsTree = tree;
  for (const key of ['status', 'headers', 'body']) f.availability[key] = { state: 'NotExposed', path: null };
  return f;
}
function opFixture(operation: string): Data {
  const f = fixture(); f.operation = operation;
  f.request.method = operation.endsWith('_GET') ? 'GET' : 'POST';
  if (operation.endsWith('_CAS')) f.request.ifMatch = '"1"';
  if (operation === 'G9_SOURCE_GET') f.request.source = { itemId: 1, itemVersion: null, itemETag: null, sourceIdentity: 'synthetic-source' };
  if (operation === 'G6_METADATA_GET' || operation === 'G7_BINARY_GET') f.request.locator = {
    serverRelativeUrl: '/synthetic/file', uniqueId: null, version: null, bytes: null, sha256: null };
  if (operation === 'G7_SCRIPT_RUN') Object.assign(f.request.configuration, { scriptId: 'synthetic-script', scriptSHA256: 'C'.repeat(64),
    workbookDriveId: 'synthetic-drive', workbookItemId: 'synthetic-item', workbookVersion: 'synthetic-version' });
  return f;
}
const operations = ['G1_SCOPE_GET', 'G1_LEDGER_GET', 'G1_MEMBERSHIP_PAGE_GET', 'G3_LEDGER_CREATE', 'G3_SCOPE_CAS',
  'G4_PENDING_CREATE', 'G4_SCOPE_CAS', 'G5_BINARY_CREATE', 'G5_COLLISION_LOOKUP_GET', 'G6_METADATA_GET', 'G6_RIGHTS_GET',
  'G7_BINARY_GET', 'G7_SCRIPT_RUN', 'G8_LEDGER_CREATE', 'G8_SCOPE_CAS', 'G9_SOURCE_GET', 'G9_BINDING_CREATE',
  'G9_REFERENCE_CREATE', 'G9_INVENTORY_CREATE', 'G9_SEAL_CREATE', 'G10_REGISTRY_GET', 'G11_BEFORE_GET',
  'G11_EFFECT_CREATE', 'G11_EFFECT_CAS', 'G12_PROOF_CREATE', 'G12_SCOPE_CAS', 'GH_HOLD_CREATE', 'GH_SCOPE_CAS'];

describe('passive observation v2 codec', () => {
  test('exact synthetic example roundtrips and issues deeply frozen private copies', () => {
    const input = bytes(fixture()), original = input.slice(), record = parse(input);
    expect(encode(record)).toEqual(original);
    expect(Object.isFrozen(record)).toBe(true); expect(Object.isFrozen(record.request.configuration)).toBe(true);
    expect(Object.isFrozen(record.outputsTree)).toBe(true);
    input.fill(0); const emitted = encode(record); emitted.fill(0);
    expect(encode(record)).toEqual(original);
    expect(() => { (record as Data).candidate.commit = 'c'.repeat(40); }).toThrow();
    expect(encode(record)).toEqual(original);
  });
  test.each(operations)('all closed operations accepted: %s', operation => {
    const f = opFixture(operation); expect(encode(parse(bytes(f)))).toEqual(bytes(f));
  });
  test.each(operations)('opposite HTTP method refused: %s', operation => {
    const f = opFixture(operation); f.request.method = f.request.method === 'GET' ? 'POST' : 'GET'; fail(f);
  });
  test.each(['Completed', 'Failed', 'TimedOut', 'OutcomeUnknown'])('all consistent availability combinations: %s', outcome => {
    for (let mask = 0; mask < 8; mask++) for (const diagnostics of [false, true]) {
      const f = fixture(); f.outcome = outcome;
      ['status', 'headers', 'body'].forEach((key, i) => { if (!(mask & (1 << i))) f.availability[key] = { state: 'NotExposed', path: null }; });
      if (diagnostics) { f.diagnosticsTree = ['array', [['string', 'complete synthetic failure'], ['null']]]; f.availability.diagnostics = { state: 'Observed', path: [] }; }
      expect(encode(parse(bytes(f)))).toEqual(bytes(f));
    }
    for (const diagnostics of [false, true]) {
      const unavailable = treeFixture(null); unavailable.outcome = outcome; unavailable.availability.outputs = { state: 'NotExposed', path: null };
      if (diagnostics) { unavailable.diagnosticsTree = ['null']; unavailable.availability.diagnostics = { state: 'Observed', path: [] }; }
      expect(parse(bytes(unavailable)).outputsTree).toBeNull();
    }
    const observedNull = treeFixture(['null']); observedNull.outcome = outcome;
    expect(parse(bytes(observedNull)).outputsTree).toEqual(['null']);
  });
  const levels = ['', 'request', 'request.target', 'request.locator', 'request.source', 'request.configuration', 'request.correlation',
    'availability', 'availability.outputs', 'availability.status', 'availability.headers', 'availability.body', 'availability.diagnostics', 'candidate'];
  function fullFixture(): Data {
    const f = fixture(); f.request.locator = { serverRelativeUrl: '/file', uniqueId: null, version: null, bytes: null, sha256: null };
    f.request.source = { itemId: 1, itemVersion: null, itemETag: null, sourceIdentity: 'source' }; return f;
  }
  function at(f: Data, path: string): Data { return path ? path.split('.').reduce((v: Data, k) => v[k], f) : f; }
  test.each(levels)('extra, missing, duplicate, reordered schema members: %s', path => {
    const a = fullFixture(), av = at(a, path); av.extra = null; fail(a);
    const b = fullFixture(), bv = at(b, path); delete bv[Object.keys(bv)[0]]; fail(b);
    const c = fullFixture(), cv = at(c, path), body = JSON.stringify(cv), key = Object.keys(cv)[0];
    const duplicate = '{' + JSON.stringify(key) + ':' + JSON.stringify(cv[key]) + ',' + body.slice(1);
    expect(() => parse(textBytes(JSON.stringify(c).replace(body, duplicate)))).toThrow(E);
    const d = fullFixture(), dv = at(d, path), names = Object.keys(dv), reversed: Data = {};
    names.reverse().forEach(k => { reversed[k] = dv[k]; });
    expect(() => parse(textBytes(JSON.stringify(d).replace(JSON.stringify(dv), JSON.stringify(reversed))))).toThrow(E);
  });
  test('lexically different duplicate keys deny before materialisation, at nested levels', () => {
    const s = JSON.stringify(fixture());
    expect(() => parse(textBytes(s.replace('"captureOrdinal":0', '"captureOrdinal":0,"capture\\u004frdinal":0')))).toThrow(E);
    expect(() => snapshot('{"__proto__":1,"__proto__":2}')).toThrow(E);
    expect(() => snapshot('{"nested":{"a":1,"\\u0061":2}}')).toThrow(E);
  });
  test.each(['G0', 'G2', 'GET', 'free-form'])('unknown operation %s', op => { const f = fixture(); f.operation = op; fail(f); });
  test.each(['k', 'profile'])('old domain discriminator %s', key => { const f = fixture(); f[key] = 'raw-http-v1'; fail(f); });
  test.each([null, {}, { commit: 'A'.repeat(40), tree: 'b'.repeat(40) }, { commit: 'a'.repeat(39), tree: 'b'.repeat(40) },
    { commit: 'a'.repeat(40), tree: 'b'.repeat(41) }, { commit: 'a'.repeat(40), tree: 'b'.repeat(40), script: 'x' }])('candidate rejects %j', candidate => {
    const f = fixture(); f.candidate = candidate; fail(f);
  });
  test.each([-1, 0.1, Number.MAX_SAFE_INTEGER + 1, '0', null])('invalid ordinal %j', ordinal => { const f = fixture(); f.captureOrdinal = ordinal; fail(f); });
  test('negative zero ordinal is refused even though JSON.stringify would erase it', () => {
    expect(() => parse(textBytes(JSON.stringify(fixture()).replace('"captureOrdinal":0', '"captureOrdinal":-0')))).toThrow(E);
  });
  test('max safe ordinal, nullable identifiers and all fully populated request fields', () => {
    const f = fullFixture(); f.captureOrdinal = Number.MAX_SAFE_INTEGER;
    f.request.target.listId = null; f.request.target.libraryId = f.request.target.siteId; f.request.target.scopeRowId = null;
    Object.assign(f.request.locator, { uniqueId: f.request.target.siteId, version: '1.0', bytes: 0, sha256: 'D'.repeat(64) });
    Object.assign(f.request.source, { itemVersion: '1.0', itemETag: '"1"' }); f.request.configuration.protectedIssuerPrincipalId = 'recorded-only';
    expect(parse(bytes(f)).captureOrdinal).toBe(Number.MAX_SAFE_INTEGER);
  });
  test('guid, SHA, positive IDs and empty configuration/correlation/source identity', () => {
    const mutations: ((f: Data) => void)[] = [f => { f.request.target.tenantId = '47a28eea-3c8a-4f2d-a732-7e56bc20c9a3'; },
      f => { f.request.configuration.configurationSHA256 = 'a'.repeat(64); }, f => { f.request.target.scopeRowId = 0; },
      f => { f.request.source.itemId = 0; }, f => { f.request.configuration.connectionReferenceId = ''; },
      f => { f.request.correlation.executionKey = ''; }, f => { f.request.correlation.attemptKey = ''; },
      f => { f.request.correlation.actionKey = ''; }, f => { f.request.source.sourceIdentity = ''; }];
    for (const mutate of mutations) { const f = fullFixture(); mutate(f); fail(f); }
  });
  test('all CAS require exact non-wildcard data; other operations require null', () => {
    for (const op of operations.filter(o => o.endsWith('_CAS'))) for (const etag of [null, '', '*', 1]) { const f = opFixture(op); f.request.ifMatch = etag; fail(f); }
    for (const op of operations.filter(o => !o.endsWith('_CAS'))) { const f = opFixture(op); f.request.ifMatch = '"1"'; fail(f); }
  });
  test('all partial script/workbook pin combinations refused; script operation requires both groups', () => {
    for (let mask = 1; mask < 4; mask++) {
      const f = fixture(); if (mask & 1) f.request.configuration.scriptId = 'x'; if (mask & 2) f.request.configuration.scriptSHA256 = 'A'.repeat(64);
      if (mask === 3) expect(parse(bytes(f))).toBeDefined(); else fail(f);
    }
    for (let mask = 1; mask < 8; mask++) {
      const f = fixture(); ['workbookDriveId', 'workbookItemId', 'workbookVersion'].forEach((k, i) => { if (mask & (1 << i)) f.request.configuration[k] = 'x'; });
      if (mask === 7) expect(parse(bytes(f))).toBeDefined(); else fail(f);
    }
    const script = opFixture('G7_SCRIPT_RUN'); script.request.configuration.scriptId = script.request.configuration.scriptSHA256 = null; fail(script);
    const source = opFixture('G9_SOURCE_GET'); source.request.source = null; fail(source);
    for (const op of ['G6_METADATA_GET', 'G7_BINARY_GET']) { const f = opFixture(op); f.request.locator = null; fail(f); }
  });
  test.each(['', 'http://x', '//x', '/x://y', '/x\r', '/x\n', '/x\\y', '/x#y'])('relative endpoint rejects %j', endpoint => {
    const f = fixture(); f.request.relativeEndpoint = endpoint; fail(f);
  });
  test('locator forbids query while endpoint keeps exact query and percent spelling', () => {
    const f = fullFixture(); f.request.locator.serverRelativeUrl = '/x?q=1'; fail(f);
    const good = fixture(); good.request.relativeEndpoint = '/%2F?x=%23'; expect(parse(bytes(good)).request.relativeEndpoint).toBe('/%2F?x=%23');
  });
  test('availability contradictions deny, including tree-null versus observed-null', () => {
    const changes: ((f: Data) => void)[] = [f => { f.availability.outputs.path = null; }, f => { f.availability.outputs.path = ['body']; },
      f => { f.availability.status.state = 'NotExposed'; }, f => { f.outputsTree = null; },
      f => { f.outputsTree = null; f.availability.outputs = { state: 'NotExposed', path: null }; },
      f => { f.availability.diagnostics = { state: 'Observed', path: [] }; }, f => { f.diagnosticsTree = ['null']; },
      f => { f.availability.body.path = ['absent']; }, f => { f.availability.body.path = [0]; },
      f => { f.availability.body.path = ['body', 'x']; }, f => { f.availability.body.path = [true]; },
      f => { f.availability.body.path = [-1]; }];
    for (const change of changes) { const f = fixture(); change(f); fail(f); }
  });
  test('array paths resolve only numeric in-range indices; empty paths observe whole output', () => {
    const f = treeFixture(['array', [['null']]]); f.availability.body = { state: 'Observed', path: [0] };
    expect(parse(bytes(f))).toBeDefined();
    for (const path of [[1], ['0'], [0, 'x'], [false]]) { f.availability.body.path = path; fail(f); }
    f.availability.body.path = []; expect(parse(bytes(f))).toBeDefined();
    expect(() => parse(textBytes(JSON.stringify(f).replace('"body":{"state":"Observed","path":[]}', '"body":{"state":"Observed","path":[-0]}')))).toThrow(E);
  });
  test('all valid tuples, special keys, numeric enumeration and duplicate array values', () => {
    for (const tree of [['null'], ['boolean', false], ['string', ''], ['array', [['null'], ['null']]],
      ['object', [['0', ['null']], ['2', ['null']], ['', ['string', '']], ['__proto__', ['null']], ['constructor', ['null']],
        ['prototype', ['null']], ['01', ['null']], ['-0', ['null']], ['4294967295', ['null']]]]]) expect(parse(bytes(treeFixture(tree)))).toBeDefined();
    expect(({} as Data).polluted).toBeUndefined();
  });
  test.each(['0', '-0', '1', '1e+21', '1e-7', '0.5'])('canonical number %s', n => { expect(parse(bytes(treeFixture(['number', n])))).toBeDefined(); });
  test.each(['1.0', '01', '1e0', '1E+21', '-0.0', '+1', ' 1', 'NaN', 'Infinity', '1e9999'])('noncanonical number %s', n => { fail(treeFixture(['number', n])); });
  test.each([
    ['null', null], ['boolean'], ['boolean', 0], ['string', {}], ['number', 1], ['array', [], 0], ['object', {}],
    ['object', [['a']]], ['object', [['a', ['null'], 0]]], ['unknown'], { 0: 'null' },
    ['object', [['a', ['number', '1']], ['a', ['number', '2']]]], ['object', [['', ['null']], ['', ['null']]]],
    ['object', [['__proto__', ['null']], ['__proto__', ['null']]]], ['object', [['2', ['null']], ['0', ['null']]]],
    ['object', [['x', ['null']], ['0', ['null']]]]
  ].map((tree, i) => ({ i, tree })))('invalid tagged tree $i', ({ tree }) => fail(treeFixture(tree)));
  test('Unicode distinctions, BOM content, pairs and lone surrogates retain exact code units', () => {
    const tree = ['object', [['é', ['string', 'e\u0301']], ['e\u0301', ['string', '\ufeffΩ😀\ud800-\udfff']]]];
    const b = bytes(treeFixture(tree)), record = parse(b); expect(encode(record)).toEqual(b);
    expect(new TextDecoder().decode(b)).toContain('\\ud800-\\udfff');
  });
  test('isolated surrogate strings are escaped canonically', () => {
    const f = treeFixture(['array', [['string', '\ud800'], ['string', '\udfff']]]), b = bytes(f);
    expect(new TextDecoder().decode(b)).toContain('\\ud800'); expect(new TextDecoder().decode(b)).toContain('\\udfff');
    expect(encode(parse(b))).toEqual(b);
  });
  test('snapshot canonicalises only passive source text and retains provider enumeration', () => {
    expect(snapshot(' {"a":1.0,"b":-0} \n')).toEqual(['object', [['a', ['number', '1']], ['b', ['number', '-0']]]]);
    expect(snapshot('{"2":null,"0":null,"__proto__":1,"01":true}')).toEqual(['object', [['0', ['null']], ['2', ['null']], ['__proto__', ['number', '1']], ['01', ['boolean', true]]]]);
    expect(snapshot('[null,null]')).toEqual(['array', [['null'], ['null']]]);
  });
  test.each(['', 'undefined', '1e9999', '[1,]', '{"a":1,}', '{"a":1,"a":2}', '1 2', '\ufeffnull', 'NaN', '+1', '01', '"\n"'])('malformed snapshot text %j', input => {
    expect(() => snapshot(input)).toThrow(E);
  });
  test('artifact canonical spelling rejects whitespace, alternate escapes, envelope number and second value', () => {
    const s = JSON.stringify(fixture());
    for (const v of [' ' + s, s + '\n', s + ' ', s + '{}', s.replace('synthetic-connection', 'synthetic-\\u0063onnection'), s.replace('"captureOrdinal":0', '"captureOrdinal":0.0')]) expect(() => parse(textBytes(v))).toThrow(E);
    const bom = new Uint8Array(textBytes(s).length + 3); bom.set([0xef, 0xbb, 0xbf]); bom.set(textBytes(s), 3);
    expect(() => parse(bom)).toThrow(E);
  });
  test.each([[0xef, 0xbb, 0xbf], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf4, 0x90, 0x80, 0x80], [0xe2, 0x82]])('strict UTF8 refuses %j', (...octets) => {
    expect(() => parse(new Uint8Array(octets))).toThrow(E);
  });
  test('arbitrary caller identities including active/revoked/wrapped proxies refuse with zero hooks', () => {
    let hooks = 0;
    const handler: ProxyHandler<object> = { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); }, ownKeys() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); },
      getPrototypeOf() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); }, getOwnPropertyDescriptor() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } };
    const live = new Proxy({}, handler), wrapped = new Proxy(parse(bytes(fixture())), handler), revoked = Proxy.revocable({}, handler); revoked.revoke();
    const accessor = Object.defineProperty({}, 'value', { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } });
    const cyclic: Data = {}; cyclic.self = cyclic;
    for (const value of [fixture(), live, wrapped, revoked.proxy, accessor, cyclic, new String('{}'), new Boolean(false), new Date(), /x/,
      [], Array(1), Object.assign([], { x: 1 }), Object.create(null), Symbol('x'), () => 1, undefined, 1, null]) {
      expect(() => snapshot(value)).toThrow(E); expect(() => encode(value as ConnectorObservationV2)).toThrow(E);
    }
    expect(hooks).toBe(0);
    const reflection = new Proxy({}, { ownKeys() { hooks++; return []; } }); Object.getOwnPropertyNames(reflection);
    expect(hooks).toBe(1); // Reflection is not universally hook-free; public admission never attempts it.
  });
  test('strict byte brand admission ignores caller methods and refuses all exotic views', () => {
    let hooks = 0; const valid = bytes(fixture());
    const trapped = new Proxy(valid, { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); }, getPrototypeOf() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); }, ownKeys() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } });
    const accessor = valid.slice(); Object.defineProperty(accessor, 'extra', { get() { hooks++; throw new Error('UNEXPECTED_CALLER_HOOK'); } });
    const custom = valid.slice(); (custom as Data).x = 1;
    const symbol = valid.slice(); (symbol as Data)[Symbol('x')] = 1;
    const exotic = valid.slice(); Object.setPrototypeOf(exotic, Object.create(Uint8Array.prototype));
    for (const input of [trapped, accessor, custom, symbol, exotic, new DataView(new ArrayBuffer(8)), new Uint16Array(8), new Uint8Array(new SharedArrayBuffer(8))])
      expect(() => parse(input as Uint8Array)).toThrow(E);
    expect(hooks).toBe(0);
  });
});
