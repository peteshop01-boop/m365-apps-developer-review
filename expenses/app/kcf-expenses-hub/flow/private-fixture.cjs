'use strict';
// Offline release tooling. Produces reviewable requests and validates captured
// metadata; has no HTTP, credential, import, activation or tenant-write client.
const crypto = require('node:crypto');
const { SITE } = require('./build-flow.cjs');
const approved = require('../../../design/data/nominals_approved_195.json').nominals;
const keys = ['requests', 'operations', 'results', 'audit', 'expenses', 'claims', 'people', 'months', 'nominals'];
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function must(ok, code) { if (!ok) throw new Error('FIXTURE_' + code); }
function json(text, max = 2 * 1024 * 1024) {
  must(typeof text === 'string' && Buffer.byteLength(text, 'utf8') <= max, 'INPUT_BOUND');
  try { return JSON.parse(text); } catch { throw new Error('FIXTURE_JSON'); }
}
function object(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function integer(v) { return Number.isInteger(v) && v > 0 && v <= 2147483647; }
function exactKeys(v, allowed) { must(object(v) && Object.keys(v).length === allowed.length && allowed.every(k => own(v, k)), 'KEYS'); }
function hash(v) { return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex'); }
function text(name, required = true, length = 255, unique = false) { return { name, type: 'Text', required, length, unique }; }
function number(name, required = true) { return { name, type: 'Number', required, decimals: 0, unique: false }; }
function note(name) { return { name, type: 'Note', required: false, richText: false, appendOnly: false, unique: false }; }
function other(name, type, required = true, extra = {}) { return { name, type, required, unique: false, ...extra }; }
const common = () => [text('Title'), text('OperationKey', true, 255, true), number('RequestId'), number('D01ActorId'), number('ParentId')];
function schema() {
  return {
    requests: [text('Title', false)],
    operations: [...common(), number('ResultId', false), text('State', true, 16)],
    results: [...common(), text('State', true, 16), note('RecordJson')],
    audit: [...common(), number('ExpenseId'), note('RecordJson'), text('Event', true, 32)],
    expenses: [text('Title'), text('ExpenseLineKey', true, 255, true), other('ClaimSubmissionRef', 'Lookup', true, { lookup: 'claims' }),
      other('ExpenseDate', 'DateTime', true, { format: 'DateOnly' }), text('Supplier'), text('ExpenseDescription'), text('NominalCode', true, 5),
      text('NominalDescription'), other('GrossAmount', 'Currency', true, { decimals: 2, lcid: 2057 }), note('ClaimantNotes'),
      other('ReceiptRequired', 'Boolean'), other('IsVoided', 'Boolean'), text('LineValidationStatus', true, 32),
      number('D01Originator'), number('D01RequestId'), text('D01OperationKey', true, 255, true), text('D01Fingerprint', true, 64),
      note('D01NoReceiptReason'), note('D01ReceiptManifest')],
    claims: [text('Title'), other('ClaimantRecord', 'Lookup', true, { lookup: 'people' }), other('ClaimMonthRecord', 'Lookup', true, { lookup: 'months' }),
      text('ClaimMonth', true, 7), text('SubmissionStatus', true, 32), ...['ExpenseTotal', 'MileageTotal', 'OverallTotal'].map(n => other(n, 'Currency', true, { decimals: 2, lcid: 2057 })),
      number('SubmissionVersion'), note('D01Reservation'), text('D01Checkpoint', false)],
    // Native Yes/No forms cannot express Required; never inherit their Yes
    // default. Roster eligibility still requires an explicit native true row.
    people: [text('Title'), number('D01UserId'), other('D01Active', 'Boolean', false, { defaultValue: '0' })],
    months: [text('Title'), text('ClaimMonth', true, 7), text('MonthStatus', true, 16)],
    nominals: [text('Title'), text('field_1', true, 5, true), text('field_2'), number('D01Eligible')]
  };
}
function roleMask(key, actor) { return actor === 'claimant' ? (key === 'requests' ? 3 : 1) : ['expenses', 'operations'].includes(key) ? 7 : key === 'claims' ? 5 : ['results', 'audit'].includes(key) ? 3 : 1; }
// Closed SOURCE policy, not native permission qualification. The processor's
// existing roleassignments GETs require EnumeratePermissions and its documented
// read dependencies. Those rights must never leak into claimant profiles.
const roleProfiles = { claimant: ['1', '3'], processor: ['1', '3', '5', '7'] };
const openAndPages = 65536n | 131072n;
const enumerationReads = openAndPages | 32n | 64n | 67108864n | 134217728n;
const enumeratePermissions = 1073741824n; // High word (PermissionKind 63).
function checkRoles(roles) {
  exactKeys(roles, Object.keys(roleProfiles));
  const ids = [];
  for (const [actor, masks] of Object.entries(roleProfiles)) {
    exactKeys(roles[actor], masks);
    for (const mask of masks) {
      const r = roles[actor][mask];
      exactKeys(r, ['id', 'high', 'low']);
      must(integer(r.id) && [r.high, r.low].every(v => typeof v === 'string' && /^(0|[1-9]\d{0,9})$/.test(v) && BigInt(v) <= 4294967295n), 'ROLE_SHAPE');
      const low = BigInt(r.low), high = BigInt(r.high);
      const required = (actor === 'processor' ? enumerationReads : openAndPages) | BigInt(mask);
      // Claimant may open PDF source/application views. No version browsing,
      // directory/user enumeration, alerts, customisation or administrative bits.
      const allowed = required | (actor === 'claimant' ? 32n | 4096n : 0n);
      must((low & required) === required && (low & ~allowed) === 0n && high === (actor === 'processor' ? enumeratePermissions : 0n), 'ROLE_RIGHTS');
      ids.push(r.id);
    }
  }
  must(new Set(ids).size === 6, 'ROLE_DISTINCTION');
}
function specFrom(textValue) {
  const s = json(textValue, 128 * 1024);
  exactKeys(s, ['runId', 'month', 'claimantId', 'processorId', 'unrelatedId', 'provisionerId', 'roles', 'eligibleCodes']);
  must(typeof s.runId === 'string' && /^[a-f0-9]{12}$/.test(s.runId) && typeof s.month === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(s.month), 'IDENTITY');
  const ids = [s.claimantId, s.processorId, s.unrelatedId, s.provisionerId];
  must(ids.every(integer) && new Set(ids).size === 4, 'ACTOR_DISTINCTION');
  checkRoles(s.roles);
  must(Array.isArray(s.eligibleCodes) && s.eligibleCodes.length === 195 && new Set(s.eligibleCodes).size === 195 && approved.every(n => s.eligibleCodes.includes(n.code)), 'NOMINAL_POLICY');
  return s;
}
function title(s, key) { return `KCFEXP_TEST102_D01_${s.runId}_${key}`; }
function marker(s) { return `KCF D01 private synthetic fixture ${s.runId}; no real claims`; }
function root(s, key) { return `/sites/REVIEW-TEST-SITE/${key === 'requests' ? '' : 'Lists/'}${title(s, key)}`; }
function expectedAcl(s, key) {
  return ['claimant', 'processor'].map(actor => {
    const r = s.roles[actor][String(roleMask(key, actor))];
    return { principalId: s[actor + 'Id'], roleId: r.id, high: r.high, low: r.low };
  });
}
function feed(v, max, code) {
  must(object(v) && Array.isArray(v.value) && v.value.length <= max && !own(v, '@odata.nextLink') && !own(v, 'odata.nextLink') && !own(v, '__next'), code);
  return v.value;
}
function inventory(textValue) {
  const v = json(textValue); must(v.site === SITE, 'SITE');
  const rows = feed(v.lists, 2000, 'INVENTORY');
  must(rows.every(r => object(r) && typeof r.Id === 'string' && guid.test(r.Id) && typeof r.Title === 'string') && new Set(rows.map(r => r.Id.toLowerCase())).size === rows.length, 'INVENTORY');
  return rows;
}
function createPlan(specJson, inventoryJson) {
  const s = specFrom(specJson), before = inventory(inventoryJson);
  must(keys.every(k => !before.some(r => r.Title.toLowerCase() === title(s, k).toLowerCase())), 'EXISTING_CONTAINER');
  return { state: 'SOURCE_PLAN_ONLY', tenantWriteAllowed: false, site: SITE, specHash: hash(s), beforeIds: before.map(r => r.Id.toLowerCase()),
    phases: ['Create empty containers', 'Break inheritance without copying; native ACL qualification', 'Configure schema while empty', 'Seed private synthetic references', 'Capture and validate admission', 'Independent runtime Security/QA before enable'],
    requests: keys.map(k => ({ key: k, method: 'POST', uri: '_api/web/lists', body: { __metadata: { type: 'SP.List' }, Title: title(s, k), Description: marker(s), BaseTemplate: k === 'requests' ? 101 : 100, EnableVersioning: true,
      ...(k === 'requests' ? { EnableFolderCreation: true, EnableMinorVersions: false, ForceCheckout: false, EnableModeration: false } : { EnableAttachments: true }) },
      afterCreate: { requireEmpty: true, breakInheritance: 'breakroleinheritance(copyRoleAssignments=false,clearSubscopes=false)', acl: expectedAcl(s, k), removeOnlyProvisionerAssignmentAfterReadback: s.provisionerId, noRowsBeforePrivateAcl: true } })),
    fieldContract: schema(), rollback: 'Quarantine while flow Off. Recycle only new empty, marker-bound, journalled containers; never delete existing lists or any populated fixture.' };
}
function fieldXml(f, ids) {
  // All names/types come from the closed source schema; lookup IDs are validated.
  const attrs = { Type: f.type, Name: f.name, StaticName: f.name, DisplayName: f.name, Required: f.required ? 'TRUE' : 'FALSE', EnforceUniqueValues: f.unique ? 'TRUE' : 'FALSE', Indexed: f.unique ? 'TRUE' : 'FALSE' };
  if (f.length) attrs.MaxLength = String(f.length);
  if (f.decimals !== undefined) attrs.Decimals = String(f.decimals);
  if (f.lcid) attrs.LCID = String(f.lcid);
  if (f.format) attrs.Format = f.format;
  if (f.type === 'Note') Object.assign(attrs, { RichText: 'FALSE', AppendOnly: 'FALSE', NumLines: '6' });
  if (f.lookup) Object.assign(attrs, { List: `{${ids[f.lookup]}}`, ShowField: 'Title', Mult: 'FALSE' });
  const field = '<Field ' + Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
  if (own(f, 'defaultValue')) {
    must(f.name === 'D01Active' && f.type === 'Boolean' && f.defaultValue === '0', 'DEFAULT_CONTRACT');
    return field + '><Default>0</Default></Field>';
  }
  return field + ' />';
}
function sameAcl(s, key, actual) {
  const rows = feed(actual, 2, 'ACL_FEED');
  must(rows.length === 2, 'ACL_COUNT');
  const expected = expectedAcl(s, key);
  const found = rows.map(r => {
    must(object(r) && object(r.Member) && r.Member.PrincipalType === 1 && Array.isArray(r.RoleDefinitionBindings) && r.RoleDefinitionBindings.length === 1, 'ACL_DIRECT_USER');
    const role = r.RoleDefinitionBindings[0]; must(object(role) && object(role.BasePermissions), 'ACL_ROLE');
    return { principalId: r.Member.Id, roleId: role.Id, high: role.BasePermissions.High, low: role.BasePermissions.Low };
  });
  must(expected.every(e => found.filter(r => JSON.stringify(r) === JSON.stringify(e)).length === 1), 'ACL_EXACT');
}
function containers(s, snap, before, requireEmpty) {
  must(object(snap) && snap.site === SITE && object(snap.lists), 'SITE');
  exactKeys(snap.lists, keys);
  must(object(snap.flow) && snap.flow.id === 'faaa734e-4706-467c-a7e6-b188b9b3fbae' && snap.flow.state === 'Off' && snap.flow.runCount === 0, 'FLOW_HELD');
  const ids = {};
  must(object(snap.creationJournal) && snap.creationJournal.specHash === hash(s) && Array.isArray(snap.creationJournal.receipts) && snap.creationJournal.receipts.length === 9, 'CREATION_JOURNAL');
  for (const k of keys) {
    const row = snap.lists[k];
    must(object(row) && typeof row.Id === 'string' && guid.test(row.Id) && !before.some(v => v.Id.toLowerCase() === row.Id.toLowerCase()), 'NEW_CONTAINER');
    must(row.Title === title(s, k) && row.Description === marker(s) && row.BaseTemplate === (k === 'requests' ? 101 : 100), 'CONTAINER_IDENTITY');
    const receipts = snap.creationJournal.receipts.filter(r => object(r) && r.key === k);
    must(receipts.length === 1, 'CREATION_RECEIPT');
    const receipt = receipts[0];
    if (own(receipt, 'method')) {
      must(k === 'months', 'NATIVE_UI_RESOURCE');
      exactKeys(snap.nativeUiReconciliation, ['months']);
      require('./native-ui-provenance.cjs').reconcileNativeUiReceipt(receipt, s, row, before, snap.nativeUiReconciliation.months);
    } else {
      must(receipt.status === 201 && receipt.Id === row.Id && receipt.Title === row.Title && receipt.Description === row.Description && receipt.site === SITE, 'CREATION_RECEIPT');
    }
    must(row.EnableVersioning === true && row.HasUniqueRoleAssignments === true && row.ReadSecurity === 1 && row.WriteSecurity === 1 && (k !== 'expenses' || row.EnableAttachments === true), 'CONTAINER_SECURITY');
    must(object(row.RootFolder) && row.RootFolder.ServerRelativeUrl === root(s, k), 'CONTAINER_ROOT');
    if (k === 'requests') must(row.EnableMinorVersions === false && row.ForceCheckout === false && row.EnableModeration === false, 'REQUEST_VERSION_SETTINGS');
    must(Number.isInteger(row.ItemCount) && row.ItemCount >= 0 && (!requireEmpty || row.ItemCount === 0), 'CONTAINER_NOT_EMPTY');
    sameAcl(s, k, row.acl); ids[k] = row.Id.toLowerCase();
  }
  must(new Set(Object.values(ids)).size === 9, 'DISTINCT_LISTS');
  if (requireEmpty) {
    // Aggregate ItemCount can be stale. Every captured complete item feed must
    // independently be empty; missing, paged or contradictory captures hold all
    // schema/seed/recycle plans, including a previously seeded empty folder.
    exactKeys(snap.rows, keys);
    for (const k of keys) must(feed(snap.rows[k], 0, 'EMPTY_ROW_FEED').length === 0, 'EMPTY_ROW_FEED');
    must(own(snap, 'requestFolder') && snap.requestFolder === null, 'EMPTY_REQUEST_FOLDER');
    must(feed(snap.claimantRequestFeed, 0, 'EMPTY_REQUEST_FEED').length === 0, 'EMPTY_REQUEST_FEED');
  }
  return ids;
}
function schemaPlan(specJson, inventoryJson, snapshotJson) {
  const s = specFrom(specJson), snap = json(snapshotJson), ids = containers(s, snap, inventory(inventoryJson), true);
  for (const k of keys) {
    const fields = feed(snap.lists[k].fields, 200, 'FIELD_FEED');
    must(fields.every(f => object(f) && typeof f.InternalName === 'string'), 'FIELD_TYPES');
    must(!fields.some(f => schema()[k].some(e => e.name !== 'Title' && e.name.toLowerCase() === f.InternalName.toLowerCase())), 'CONTRACT_FIELD_EXISTS');
  }
  return { state: 'SOURCE_PLAN_ONLY', tenantWriteAllowed: false, site: SITE, requests: keys.flatMap(k => schema()[k].filter(f => f.name !== 'Title').map(f => ({
    method: 'POST', uri: `_api/web/lists(guid'${ids[k]}')/fields/createfieldasxml`, body: { parameters: { __metadata: { type: 'SP.XmlSchemaFieldCreationInformation' }, SchemaXml: fieldXml(f, ids), Options: 0 } }
  }))), titleRequirements: keys.map(k => ({ list: ids[k], required: k !== 'requests', maxLength: 255 })),
    note: 'Title is a built-in field: qualify/update its exact captured ETag separately. Do not replay createfieldasxml after an ambiguous response; read back first.' };
}
function checkFields(key, row, ids) {
  const fields = feed(row.fields, 200, 'FIELD_FEED'), expected = schema()[key];
  must(fields.every(f => object(f) && typeof f.InternalName === 'string' && typeof f.Required === 'boolean' && typeof f.ReadOnlyField === 'boolean'), 'FIELD_TYPES');
  must(new Set(fields.map(f => f.InternalName.toLowerCase())).size === fields.length, 'DUPLICATE_FIELD');
  for (const f of fields) {
    must(f.InternalName.toLowerCase() !== 'expensecategory', 'CATEGORY');
    must(!f.Required || f.ReadOnlyField || expected.some(e => e.name === f.InternalName) || (key === 'requests' && f.InternalName === 'FileLeafRef'), 'EXTRA_REQUIRED_FIELD');
  }
  for (const e of expected) {
    const f = fields.find(v => v.InternalName === e.name);
    must(f && f.TypeAsString === e.type && f.Required === e.required && f.ReadOnlyField === false && f.EnforceUniqueValues === e.unique, 'FIELD_' + e.name);
    if (own(e, 'defaultValue')) must(own(f, 'DefaultValue') && f.DefaultValue === e.defaultValue && f.Hidden === false && f.Indexed === false, 'INACTIVE_DEFAULT');
    if (e.length) must(Number.isInteger(f.MaxLength) && f.MaxLength >= e.length && f.MaxLength <= 255, 'CAPACITY_' + e.name);
    if (e.unique) must(f.Indexed === true, 'UNIQUE_INDEX');
    if (e.type === 'Note') must(f.RichText === false && f.AppendOnly === false, 'PLAIN_NOTE');
    if (e.decimals !== undefined) must(f.DisplayFormat === e.decimals, 'DECIMALS');
    if (e.lcid) must(f.CurrencyLocaleId === e.lcid, 'CURRENCY');
    if (e.format) must(f.DisplayFormat === 0, 'DATE_ONLY');
    if (e.lookup) must(typeof f.LookupList === 'string' && [ids[e.lookup], `{${ids[e.lookup]}}`].includes(f.LookupList.toLowerCase()) && f.LookupField === 'Title' && f.AllowMultipleValues === false, 'LOOKUP_TARGET');
  }
}
function seedPlan(specJson, inventoryJson, snapshotJson) {
  const s = specFrom(specJson), snap = json(snapshotJson), ids = containers(s, snap, inventory(inventoryJson), true);
  for (const k of keys) checkFields(k, snap.lists[k], ids);
  const item = (key, body) => ({ key, method: 'POST', uri: `_api/web/lists(guid'${ids[key]}')/items`, body });
  return { state: 'SOURCE_PLAN_ONLY', tenantWriteAllowed: false, site: SITE, executeAs: s.provisionerId,
    requests: [
      { key: 'requests', method: 'POST', uri: '_api/web/folders', body: { __metadata: { type: 'SP.Folder' }, ServerRelativeUrl: root(s, 'requests') + '/' + s.claimantId } },
      item('people', { Title: 'D01 synthetic claimant', D01UserId: s.claimantId, D01Active: true }),
      item('months', { Title: 'D01 synthetic month ' + s.month, ClaimMonth: s.month, MonthStatus: 'Open' }),
      ...approved.map(n => item('nominals', { Title: 'D01 reference ' + n.code, field_1: n.code, field_2: n.description, D01Eligible: 1 }))
    ], next: 'Read native IDs and exact references; parentSeedPlan generates the single draft parent only after that readback. Never replay ambiguous seed POSTs.' };
}
function parentSeedPlan(specJson, inventoryJson, snapshotJson) {
  const s = specFrom(specJson), snap = json(snapshotJson), ids = containers(s, snap, inventory(inventoryJson), false);
  for (const k of keys) checkFields(k, snap.lists[k], ids);
  exactKeys(snap.rows, keys);
  for (const k of ['requests', 'operations', 'results', 'audit', 'expenses', 'claims']) must(feed(snap.rows[k], 0, 'EMPTY_PRE_PARENT').length === 0 && snap.lists[k].ItemCount === (k === 'requests' ? 1 : 0), 'EMPTY_PRE_PARENT');
  const people = feed(snap.rows.people, 1, 'PERSON'), months = feed(snap.rows.months, 1, 'MONTH'), nominals = feed(snap.rows.nominals, 195, 'NOMINALS');
  must(people.length === 1 && months.length === 1, 'ONE_REFERENCE');
  const p = people[0], m = months[0];
  must([p, m].every(r => object(r) && integer(r.Id) && r.AuthorId === s.provisionerId && r.HasUniqueRoleAssignments === false), 'REFERENCE_CUSTODY');
  must(p.D01UserId === s.claimantId && p.D01Active === true && m.ClaimMonth === s.month && m.MonthStatus === 'Open', 'REFERENCE_VALUE');
  must(nominals.length === 195 && new Set(nominals.map(n => n.Id)).size === 195 && approved.every(n => nominals.filter(r => r.field_1 === n.code && r.field_2 === n.description && r.D01Eligible === 1 && integer(r.Id) && r.AuthorId === s.provisionerId && r.HasUniqueRoleAssignments === false).length === 1), 'EXACT_NOMINALS');
  must(snap.lists.people.ItemCount === 1 && snap.lists.months.ItemCount === 1 && snap.lists.nominals.ItemCount === 195, 'REFERENCE_COUNTS');
  must(object(snap.requestFolder) && snap.requestFolder.ServerRelativeUrl === root(s, 'requests') + '/' + s.claimantId && snap.requestFolder.AuthorId === s.provisionerId && snap.requestFolder.HasUniqueRoleAssignments === false && snap.requestFolder.ItemCount === 0, 'REQUEST_FOLDER');
  must(feed(snap.claimantRequestFeed, 0, 'CLAIMANT_REQUEST_FEED').length === 0, 'CLAIMANT_REQUEST_FEED');
  return { state: 'SOURCE_PLAN_ONLY', tenantWriteAllowed: false, site: SITE, executeAs: s.provisionerId, requests: [{ method: 'POST', uri: `_api/web/lists(guid'${ids.claims}')/items`, body: {
    Title: 'D01 synthetic claim ' + s.month, ClaimantRecordId: p.Id, ClaimMonthRecordId: m.Id, ClaimMonth: s.month, SubmissionStatus: 'Draft', ExpenseTotal: 0, MileageTotal: 0, OverallTotal: 0, SubmissionVersion: 1, D01Reservation: null, D01Checkpoint: null
  } }] };
}
function inspectFixture(specJson, inventoryJson, snapshotJson) {
  const s = specFrom(specJson), snap = json(snapshotJson), ids = containers(s, snap, inventory(inventoryJson), false);
  exactKeys(snap.principals, ['claimant', 'processor', 'unrelated', 'provisioner']);
  for (const name of ['claimant', 'processor', 'unrelated', 'provisioner']) {
    const p = snap.principals[name]; must(object(p) && p.Id === s[name + 'Id'] && p.PrincipalType === 1 && typeof p.IsSiteAdmin === 'boolean', 'PRINCIPAL');
    if (name !== 'provisioner') must(p.IsSiteAdmin === false, 'ORDINARY_PRINCIPAL');
  }
  for (const k of keys) checkFields(k, snap.lists[k], ids);
  exactKeys(snap.rows, keys);
  const rows = Object.fromEntries(keys.map(k => [k, feed(snap.rows[k], k === 'nominals' ? 195 : 1, 'ROW_FEED')]));
  for (const k of ['requests', 'operations', 'results', 'audit', 'expenses']) must(rows[k].length === 0, 'NONEMPTY_FINANCIAL_FIXTURE');
  for (const k of ['people', 'months', 'claims']) must(rows[k].length === 1, 'ONE_REFERENCE');
  const person = rows.people[0], month = rows.months[0], parent = rows.claims[0];
  must([person, month, parent].every(r => object(r) && integer(r.Id) && r.HasUniqueRoleAssignments === false && r.AuthorId === s.provisionerId), 'REFERENCE_CUSTODY');
  must(person.D01UserId === s.claimantId && person.D01Active === true && month.ClaimMonth === s.month && month.MonthStatus === 'Open', 'REFERENCE_VALUE');
  must(parent.ClaimantRecordId === person.Id && parent.ClaimMonthRecordId === month.Id && parent.ClaimMonth === s.month && parent.SubmissionStatus === 'Draft' && parent.SubmissionVersion === 1 && [parent.ExpenseTotal, parent.MileageTotal, parent.OverallTotal].every(v => v === 0) && (parent.D01Reservation === '' || parent.D01Reservation === null) && (parent.D01Checkpoint === '' || parent.D01Checkpoint === null) && typeof parent['odata.etag'] === 'string' && /^"[1-9]\d*"$/.test(parent['odata.etag']), 'PARENT');
  must(rows.nominals.length === 195 && new Set(rows.nominals.map(n => n.field_1)).size === 195 && new Set(rows.nominals.map(n => n.Id)).size === 195, 'NOMINAL_COUNT');
  must(approved.every(n => rows.nominals.some(r => integer(r.Id) && r.field_1 === n.code && r.field_2 === n.description && r.D01Eligible === 1 && r.HasUniqueRoleAssignments === false && r.AuthorId === s.provisionerId)), 'EXACT_NOMINALS');
  const folder = snap.requestFolder;
  must(object(folder) && folder.ServerRelativeUrl === root(s, 'requests') + '/' + s.claimantId && folder.HasUniqueRoleAssignments === false && folder.AuthorId === s.provisionerId && folder.ItemCount === 0, 'REQUEST_FOLDER');
  must(feed(snap.claimantRequestFeed, 0, 'CLAIMANT_REQUEST_FEED').length === 0, 'CLAIMANT_REQUEST_FEED');
  for (const k of keys) must(snap.lists[k].ItemCount === (k === 'requests' ? 1 : rows[k].length), 'ITEM_COUNT');
  return { state: 'METADATA_MATCH_ONLY', tenantWriteAllowed: false, specHash: hash(s), snapshotHash: hash(snap), bindings: {
    ...ids, fixtureActorId: s.claimantId, processorActorId: s.processorId, fixtureParentId: parent.Id, requestRoot: root(s, 'requests'), acl: Object.fromEntries(keys.map(k => [k, expectedAcl(s, k)]))
  }, remainingGates: ['Independent native role/effective-permission and raw unrelated-user denial', 'Qualified Standard owner entitlement and dedicated processor connection', 'Single serialized processor and same-request re-drive', 'Native JPG/PNG/PDF same-ID/byte and duplicate/recovery tests', 'Separate reviewed SPFx binding and installed QA/Sponsor UAT'] };
}
function rollbackPlan(specJson, inventoryJson, snapshotJson) {
  const s = specFrom(specJson), snap = json(snapshotJson), ids = containers(s, snap, inventory(inventoryJson), true);
  return { state: 'SOURCE_PLAN_ONLY', tenantWriteAllowed: false, site: SITE, requests: [...keys].reverse().map(k => ({ method: 'POST', uri: `_api/web/lists(guid'${ids[k]}')/recycle()` })),
    note: 'Only exact empty owned containers. A seeded or used fixture is held for explicit quarantine/recovery review; no delete, purge, role-definition removal or history destruction.' };
}
module.exports = { createPlan, schemaPlan, seedPlan, parentSeedPlan, inspectFixture, rollbackPlan, schema, keys };
