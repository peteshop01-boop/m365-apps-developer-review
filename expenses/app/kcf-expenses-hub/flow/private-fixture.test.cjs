'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createPlan, schemaPlan, seedPlan, parentSeedPlan, inspectFixture, rollbackPlan, schema, keys } = require('./private-fixture.cjs');
const { fixtureSolutionFiles, solutionFiles, filename } = require('./build-solution.cjs');
const { SITE } = require('./build-flow.cjs');
const approved = require('../../../design/data/nominals_approved_195.json').nominals;
const j = JSON.stringify;
// Synthetic IDs/role masks are test inputs, NOT a native role recommendation.
function fixture(options = {}) {
  const spec = { runId: options.runId || '22abcdef0001', month: '2026-10', claimantId: 11, processorId: 99, unrelatedId: 22, provisionerId: 12,
    roles: {
      claimant: Object.fromEntries([1, 3].map(n => [String(n), { id: 100 + n, high: '0', low: String(196608 + n) }])),
      processor: Object.fromEntries([1, 3, 5, 7].map(n => [String(n), { id: 200 + n, high: '1073741824', low: String(201523296 + n) }]))
    }, eligibleCodes: approved.map(n => n.code) };
  const before = options.before || { site: SITE, lists: { value: [{ Id: 'c08b90d9-ab89-47e6-aac4-84a0da423a73', Title: 'KCFEXP_TEST102_ExpenseLines' }] } };
  const plan = createPlan(j(spec), j(before));
  const ids = Object.fromEntries(keys.map((k, i) => [k, `10000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
  if (options.monthsId) ids.months = options.monthsId;
  const snap = { site: SITE, flow: { id: 'faaa734e-4706-467c-a7e6-b188b9b3fbae', state: 'Off', runCount: 0 }, lists: {}, rows: {},
    creationJournal: { specHash: plan.specHash, receipts: [] }, principals: {}, requestFolder: null, claimantRequestFeed: { value: [] } };
  for (const name of ['claimant', 'processor', 'unrelated', 'provisioner']) snap.principals[name] = { Id: spec[name + 'Id'], PrincipalType: 1, IsSiteAdmin: name === 'provisioner' };
  for (const k of keys) {
    const p = plan.requests.find(v => v.key === k), root = `/sites/REVIEW-TEST-SITE/${k === 'requests' ? '' : 'Lists/'}${p.body.Title}`;
    const fields = schema()[k].map(e => ({ InternalName: e.name, TypeAsString: e.type, Required: e.required, ReadOnlyField: false, Hidden: false, EnforceUniqueValues: e.unique,
      ...(e.length ? { MaxLength: e.length } : {}), ...(e.unique ? { Indexed: true } : {}), ...(e.type === 'Note' ? { RichText: false, AppendOnly: false } : {}),
      ...(e.decimals !== undefined ? { DisplayFormat: e.decimals } : {}), ...(e.lcid ? { CurrencyLocaleId: e.lcid } : {}), ...(e.format ? { DisplayFormat: 0 } : {}),
      ...(e.lookup ? { LookupList: `{${ids[e.lookup]}}`, LookupField: 'Title', AllowMultipleValues: false } : {}),
      ...(Object.hasOwn(e, 'defaultValue') ? { DefaultValue: e.defaultValue, Indexed: false } : {}) }));
    snap.lists[k] = { ...p.body, Id: ids[k], ItemCount: 0, ReadSecurity: 1, WriteSecurity: 1, HasUniqueRoleAssignments: true, EnableMinorVersions: false, EnableModeration: false, ForceCheckout: false,
      RootFolder: { ServerRelativeUrl: root }, fields: { value: fields }, acl: { value: p.afterCreate.acl.map(r => ({ Member: { Id: r.principalId, PrincipalType: 1 }, RoleDefinitionBindings: [{ Id: r.roleId, BasePermissions: { High: r.high, Low: r.low } }] })) } };
    snap.rows[k] = { value: [] };
    snap.creationJournal.receipts.push({ key: k, status: 201, Id: ids[k], Title: p.body.Title, Description: p.body.Description, site: SITE });
  }
  return { spec, before, snap, plan, ids };
}
function seeded() {
  const f = fixture(), { spec: s, snap } = f;
  const row = (Id, data) => ({ Id, AuthorId: s.provisionerId, HasUniqueRoleAssignments: false, ...data });
  snap.rows.people.value = [row(21, { D01UserId: s.claimantId, D01Active: true })];
  snap.rows.months.value = [row(31, { ClaimMonth: s.month, MonthStatus: 'Open' })];
  snap.rows.nominals.value = approved.map((n, i) => row(i + 1, { field_1: n.code, field_2: n.description, D01Eligible: 1 }));
  snap.rows.claims.value = [row(101, { ClaimantRecordId: 21, ClaimMonthRecordId: 31, ClaimMonth: s.month, SubmissionStatus: 'Draft', ExpenseTotal: 0, MileageTotal: 0, OverallTotal: 0, SubmissionVersion: 1, D01Reservation: null, D01Checkpoint: null, 'odata.etag': '"1"' })];
  snap.requestFolder = { ServerRelativeUrl: snap.lists.requests.RootFolder.ServerRelativeUrl + '/11', AuthorId: s.provisionerId, HasUniqueRoleAssignments: false, ItemCount: 0 };
  snap.claimantRequestFeed = { value: [] };
  for (const k of keys) snap.lists[k].ItemCount = k === 'requests' ? 1 : snap.rows[k].value.length;
  return f;
}
const inspect = f => inspectFixture(j(f.spec), j(f.before), j(f.snap));
const hold = f => assert.throws(() => inspect(f), /^Error: FIXTURE_/);
function nativeMonthsFixture() {
  const receipt = require('./native-ui-evidence.test-helper.cjs').receipt();
  const intent = JSON.parse(receipt.evidence.intent), post = JSON.parse(receipt.evidence.post);
  const f = fixture({ runId: intent.runId, monthsId: intent.listId, before: JSON.parse(receipt.evidence.before) });
  f.snap.creationJournal.receipts = f.snap.creationJournal.receipts.map(r => r.key === 'months' ? receipt : r);
  f.snap.lists.months.fields = post.fields.feed;
  // Only historical months provenance is native. All other resources and this
  // later two-actor ACL/readback are deliberately SYNTHETIC; not tenant admission.
  f.snap.nativeUiReconciliation = { months: {
    observedAt: '2026-10-22T13:30:00.000Z',
    responseAt: Object.fromEntries(['identity', 'list', 'acl', 'rows', 'fields'].map(k => [k, '2026-10-22T13:29:50.000Z'])),
    currentUser: { Id: 12, PrincipalType: 1, IsSiteAdmin: true }
  } };
  return f;
}
test('native UI captured creation is reconciled without inventing HTTP201, still source only', () => {
  const f = nativeMonthsFixture();
  const r = f.snap.creationJournal.receipts.find(r => r.key === 'months');
  assert.equal(Object.hasOwn(r, 'status'), false);
  const result = seedPlan(j(f.spec), j(f.before), j(f.snap));
  assert.equal(result.tenantWriteAllowed, false);
  assert.equal(result.requests.length, 198);
});
const nativeMutations = {
  'invented HTTP201': f => { f.snap.creationJournal.receipts[7].status = 201; },
  'unreviewed method': f => { f.snap.creationJournal.receipts[7].method = 'native-ui'; },
  'missing provenance': f => { delete f.snap.creationJournal.receipts[7].evidence; },
  'self approved trust root': f => { f.snap.creationJournal.receipts[7].approved = true; },
  'foreign run': f => { f.spec.runId = '000000000000'; },
  'foreign creation actor': f => { f.spec.provisionerId = 13; },
  'duplicate receipt': f => { f.snap.creationJournal.receipts[0] = f.snap.creationJournal.receipts[7]; },
  'different absence inventory': f => { f.before.lists.value.pop(); },
  'paged absence inventory': f => { f.before.lists.__next = 'unread'; },
  'different created GUID': f => { f.snap.lists.months.Id = f.ids.claims; },
  'different root': f => { f.snap.lists.months.RootFolder.ServerRelativeUrl += '-other'; },
  'marker drift': f => { f.snap.lists.months.Description = ''; },
  'field replacement': f => { f.snap.lists.months.fields.value.find(v => v.InternalName === 'ClaimMonth').Id = f.ids.people; },
  'field default': f => { f.snap.lists.months.fields.value.find(v => v.InternalName === 'MonthStatus').DefaultValue = 'Open'; },
  'paged fields': f => { f.snap.lists.months.fields['@odata.nextLink'] = 'unread'; },
  'incomplete fields': f => { f.snap.lists.months.fields.value.pop(); },
  'missing current capture': f => { delete f.snap.nativeUiReconciliation; },
  'unknown current capture': f => { f.snap.nativeUiReconciliation.people = {}; },
  'stale body': f => { f.snap.nativeUiReconciliation.months.responseAt.acl = '2026-10-22T13:27:59.000Z'; },
  'historical body reused as current': f => { f.snap.nativeUiReconciliation.months.responseAt.acl = '2026-10-22T12:57:30.000Z'; },
  'future body': f => { f.snap.nativeUiReconciliation.months.responseAt.acl = '2026-10-22T13:30:01.000Z'; },
  'ambiguous timestamp': f => { f.snap.nativeUiReconciliation.months.observedAt = '22/10/2026 14:30'; },
  'missing recovery': f => { f.snap.nativeUiReconciliation.months.currentUser.IsSiteAdmin = false; },
  'wrong recovery user': f => { f.snap.nativeUiReconciliation.months.currentUser.Id = 99; },
  'Owners-only is not final actor admission': f => { f.snap.lists.months.acl.value = [{ Member: { Id: 3, PrincipalType: 8 }, RoleDefinitionBindings: [{ Id: 1073741829, BasePermissions: { High: '2147483647', Low: '4294967295' } }] }]; },
  'missing ninth resource': f => { delete f.snap.lists.people; },
  'unrelated resource broad ACL': f => { f.snap.lists.results.acl.value[0].Member.PrincipalType = 8; },
  'hidden row': f => { f.snap.rows.months.value.push({ Id: 1 }); },
  'paged rows': f => { f.snap.rows.months.__next = 'unread'; },
  'flow on': f => { f.snap.flow.state = 'On'; }
};
for (const [name, change] of Object.entries(nativeMutations)) test('native UI reconciliation holds ' + name, () => {
  const f = nativeMonthsFixture(); change(f);
  assert.throws(() => seedPlan(j(f.spec), j(f.before), j(f.snap)), /^Error: FIXTURE_/);
});
for (const name of ['intent', 'before', 'pre', 'post', 'creation', 'security', 'qa']) test('native UI custody rejects changed ' + name, () => {
  const f = nativeMonthsFixture(); f.snap.creationJournal.receipts[7].evidence[name] += ' ';
  assert.throws(() => seedPlan(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_NATIVE_UI_CUSTODY/);
});
test('native UI already-created months fields cannot be recreated through schema mode', () => {
  const f = nativeMonthsFixture();
  assert.throws(() => schemaPlan(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_CONTRACT_FIELD_EXISTS/);
});
test('private fixture emits nine new empty resources without touching captured expense GUID', () => {
  const f = fixture(); assert.equal(f.plan.requests.length, 9); assert.equal(f.plan.tenantWriteAllowed, false);
  assert(f.plan.requests.every(r => r.uri === '_api/web/lists' && r.method === 'POST'));
  assert(!j(f.plan.requests).includes(f.before.lists.value[0].Id));
  assert(!j(f.plan.fieldContract).includes('ExpenseCategory'));
});
for (const change of ['collision', 'incomplete', 'wrongSite', 'missingPolicy', 'duplicatePolicy', 'actorEqual', 'roleDelete', 'roleManage', 'numericMask', 'unknownInput']) test('creation holds ' + change, () => {
  const f = fixture();
  if (change === 'collision') f.before.lists.value[0].Title = f.plan.requests[0].body.Title.toUpperCase();
  if (change === 'incomplete') f.before.lists['@odata.nextLink'] = 'unread';
  if (change === 'wrongSite') f.before.site = SITE + '-Production';
  if (change === 'missingPolicy') delete f.spec.eligibleCodes;
  if (change === 'duplicatePolicy') f.spec.eligibleCodes[0] = f.spec.eligibleCodes[1];
  if (change === 'actorEqual') f.spec.processorId = f.spec.claimantId;
  if (change === 'roleDelete') f.spec.roles.claimant['1'].low = '196617';
  if (change === 'roleManage') f.spec.roles.claimant['1'].low = '33751041';
  if (change === 'numericMask') f.spec.roles.claimant['1'].high = 0;
  if (change === 'unknownInput') f.spec.enable = true;
  assert.throws(() => createPlan(j(f.spec), j(f.before)), /^Error: FIXTURE_/);
});
test('metadata matched binding is still held and ordinary unrelated user is never assigned', () => {
  const a = inspect(seeded()); assert.equal(a.state, 'METADATA_MATCH_ONLY'); assert.equal(a.tenantWriteAllowed, false); assert(a.remainingGates.length >= 5);
  assert(Object.values(a.bindings.acl).flat().every(r => r.principalId !== 22));
});
test('schema plan uses new lookup GUIDs and preserves optional pending/result/receipt fields', () => {
  const f = fixture(); for (const k of keys) f.snap.lists[k].fields.value = f.snap.lists[k].fields.value.filter(v => v.InternalName === 'Title');
  const p = schemaPlan(j(f.spec), j(f.before), j(f.snap));
  assert(p.requests.some(r => r.body.parameters.SchemaXml.includes(`List="{${f.ids.claims}}"`)));
  assert(p.requests.some(r => /Name="ResultId".*Required="FALSE"/.test(r.body.parameters.SchemaXml)));
  assert(p.requests.some(r => /Name="RecordJson".*Required="FALSE".*RichText="FALSE" AppendOnly="FALSE"/.test(r.body.parameters.SchemaXml)));
  assert(!j(p).includes('ExpenseCategory')); assert.equal(p.tenantWriteAllowed, false);
});
test('schema creation refuses replay against an already configured fixture', () => {
  const f = fixture(); assert.throws(() => schemaPlan(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_CONTRACT_FIELD_EXISTS/);
});
test('schema and seeding cannot be generated while any resource inherits broad rights', () => {
  const f = fixture(); f.snap.lists.nominals.HasUniqueRoleAssignments = false;
  for (const fn of [schemaPlan, seedPlan]) assert.throws(() => fn(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_CONTAINER_SECURITY/);
});
test('synthetic seeding preserves all 195 exact pairs and sets no Author/Editor override', () => {
  const f = fixture(), p = seedPlan(j(f.spec), j(f.before), j(f.snap));
  assert.equal(p.requests.length, 198); assert.equal(p.executeAs, 12);
  assert(p.requests.every(r => !ownActor(r.body)));
  assert.deepEqual(p.requests.filter(r => r.key === 'nominals').map(r => [r.body.field_1, r.body.field_2]), approved.map(n => [n.code, n.description]));
  assert(p.requests[0].body.ServerRelativeUrl.endsWith('/11'));
});
function ownActor(body) { return ['Author', 'AuthorId', 'Editor', 'EditorId'].some(k => Object.hasOwn(body, k)); }
test('single parent uses actual freshly read reference IDs and cannot replay after parent exists', () => {
  const f = seeded(); assert.throws(() => parentSeedPlan(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_EMPTY_PRE_PARENT/);
  f.snap.rows.claims.value = []; f.snap.lists.claims.ItemCount = 0;
  const p = parentSeedPlan(j(f.spec), j(f.before), j(f.snap)); assert.equal(p.requests.length, 1);
  assert.equal(p.requests[0].body.ClaimantRecordId, 21); assert.equal(p.requests[0].body.ClaimMonthRecordId, 31); assert.equal(p.requests[0].body.ExpenseTotal, 0);
});
const mutations = {
  'required Category': f => f.snap.lists.expenses.fields.value.push({ InternalName: 'ExpenseCategory', TypeAsString: 'Text', Required: true, ReadOnlyField: false }),
  'optional hidden Category is not part of new fixture': f => f.snap.lists.expenses.fields.value.push({ InternalName: 'expensecategory', TypeAsString: 'Text', Required: false, ReadOnlyField: false, Hidden: true }),
  'no reason': f => f.snap.lists.expenses.fields.value = f.snap.lists.expenses.fields.value.filter(r => r.InternalName !== 'D01NoReceiptReason'),
  'rich reason': f => f.snap.lists.expenses.fields.value.find(r => r.InternalName === 'D01NoReceiptReason').RichText = true,
  'append receipt': f => f.snap.lists.expenses.fields.value.find(r => r.InternalName === 'D01ReceiptManifest').AppendOnly = true,
  'foreign parent lookup': f => f.snap.lists.expenses.fields.value.find(r => r.InternalName === 'ClaimSubmissionRef').LookupList = f.before.lists.value[0].Id,
  'short supplier': f => f.snap.lists.expenses.fields.value.find(r => r.InternalName === 'Supplier').MaxLength = 254,
  'numeric Boolean metadata': f => f.snap.lists.expenses.fields.value[0].Required = 1,
  'duplicate case field': f => f.snap.lists.expenses.fields.value.push({ ...f.snap.lists.expenses.fields.value[0], InternalName: 'title' }),
  'unread fields': f => f.snap.lists.expenses.fields['odata.nextLink'] = 'unread',
  'extra mandatory library metadata': f => f.snap.lists.requests.fields.value.push({ InternalName: 'Unprovided', Required: true, ReadOnlyField: false }),
  'minor versions': f => f.snap.lists.requests.EnableMinorVersions = true,
  'checkout': f => f.snap.lists.requests.ForceCheckout = true,
  'moderation': f => f.snap.lists.requests.EnableModeration = true,
  'attachments off': f => f.snap.lists.expenses.EnableAttachments = false,
  'existing list GUID': f => f.snap.lists.expenses.Id = f.before.lists.value[0].Id,
  'foreign list title': f => f.snap.lists.expenses.Title = 'Unrelated',
  'missing creation journal': f => delete f.snap.creationJournal,
  'unproved create': f => f.snap.creationJournal.receipts[0].status = 200,
  'wrong journal ID': f => f.snap.creationJournal.receipts[0].Id = f.ids.expenses,
  'foreign marker': f => f.snap.lists.expenses.Description = 'other fixture',
  'wrong root': f => f.snap.lists.requests.RootFolder.ServerRelativeUrl += '/other',
  'inherited ACL': f => f.snap.lists.expenses.HasUniqueRoleAssignments = false,
  'extra ACL': f => f.snap.lists.results.acl.value.push(f.snap.lists.results.acl.value[0]),
  'group ACL': f => f.snap.lists.results.acl.value[0].Member.PrincipalType = 8,
  'extra role': f => f.snap.lists.audit.acl.value[1].RoleDefinitionBindings.push(f.snap.lists.audit.acl.value[1].RoleDefinitionBindings[0]),
  'altered High mask': f => f.snap.lists.audit.acl.value[1].RoleDefinitionBindings[0].BasePermissions.High = '1',
  'unread ACL': f => f.snap.lists.requests.acl['@odata.nextLink'] = 'unread',
  'admin claimant': f => f.snap.principals.claimant.IsSiteAdmin = true,
  'admin negative tester': f => f.snap.principals.unrelated.IsSiteAdmin = true,
  'wrong processor': f => f.snap.principals.processor.Id = 12,
  'wrong parent claimant': f => f.snap.rows.claims.value[0].ClaimantRecordId = 55,
  'wrong month': f => f.snap.rows.claims.value[0].ClaimMonth = '2026-11',
  'submitted': f => f.snap.rows.claims.value[0].SubmissionStatus = 'Submitted',
  'nonzero financial total': f => f.snap.rows.claims.value[0].ExpenseTotal = 1,
  'reservation': f => f.snap.rows.claims.value[0].D01Reservation = 'held',
  'missing ETag': f => delete f.snap.rows.claims.value[0]['odata.etag'],
  'shared parent': f => f.snap.rows.claims.value[0].HasUniqueRoleAssignments = true,
  'claimant authored folder': f => f.snap.requestFolder.AuthorId = 11,
  'own request exists': f => f.snap.claimantRequestFeed.value.push({ Id: 44 }),
  'request folder populated': f => f.snap.requestFolder.ItemCount = 1,
  'native three nominal rows': f => f.snap.rows.nominals.value = f.snap.rows.nominals.value.slice(0, 3),
  'leading zero removed': f => f.snap.rows.nominals.value[0].field_1 = '10',
  'nominal name mismatch': f => f.snap.rows.nominals.value[0].field_2 += ' changed',
  'ineligible nominal': f => f.snap.rows.nominals.value[0].D01Eligible = 0,
  'Boolean eligibility': f => f.snap.rows.nominals.value[0].D01Eligible = true,
  'hidden extra row count': f => f.snap.lists.nominals.ItemCount = 196,
  'existing expense row': f => f.snap.rows.expenses.value.push({ Id: 1 }),
  'flow running': f => f.snap.flow.state = 'On',
  'run history exists': f => f.snap.flow.runCount = 1
};
for (const [name, mutate] of Object.entries(mutations)) test('admission rejects ' + name, () => { const f = seeded(); mutate(f); hold(f); });
test('empty rollback requires exact new ownership; seeded fixture is quarantined', () => {
  const f = fixture(), p = rollbackPlan(j(f.spec), j(f.before), j(f.snap)); assert.equal(p.requests.length, 9); assert.equal(p.tenantWriteAllowed, false);
  assert(p.requests.every(r => r.method === 'POST' && r.uri.endsWith('/recycle()') && !r.uri.includes(f.before.lists.value[0].Id)));
  const used = seeded(); assert.throws(() => rollbackPlan(j(used.spec), j(used.before), j(used.snap)), /FIXTURE_CONTAINER_NOT_EMPTY/);
  f.snap.creationJournal.receipts[0].Id = f.ids.expenses; assert.throws(() => rollbackPlan(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_CREATION_RECEIPT/);
});
for (const fn of [schemaPlan, seedPlan, rollbackPlan]) for (const key of keys) test('R1 contradiction: ' + fn.name + ' refuses captured ' + key + ' rows despite zero count', () => {
  const f = fixture(); for (const k of keys) if (fn === schemaPlan) f.snap.lists[k].fields.value = f.snap.lists[k].fields.value.filter(v => v.InternalName === 'Title');
  f.snap.rows[key].value.push({ Id: 999, AuthorId: 77, Title: 'FOREIGN_ROW' });
  assert.throws(() => fn(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_EMPTY_ROW_FEED/);
});
for (const key of ['month', 'runId']) test('R1 typing: ' + key + ' must be a primitive string', () => {
  const f = fixture(); f.spec[key] = [f.spec[key]];
  assert.throws(() => createPlan(j(f.spec), j(f.before)), /FIXTURE_IDENTITY/);
});
test('R1 package identity: bound candidate differs from imported R10', () => {
  const f = seeded(), candidate = fixtureSolutionFiles(j(f.spec), j(f.before), j(f.snap));
  assert(candidate.files['Other/Solution.xml'].includes('<Version>0.1.0.8</Version>'));
  assert(candidate.files['Workflows/' + filename + '.data.xml'].includes('<IntroducedVersion>0.1.0.8</IntroducedVersion>'));
  assert(solutionFiles()['Other/Solution.xml'].includes('<Version>0.1.0.7</Version>'));
});
for (const fn of [schemaPlan, seedPlan, rollbackPlan]) for (const defect of ['rows absent', 'feed absent', 'paged', 'folder present', 'folder unknown', 'request present', 'request unknown', 'request paged']) test('empty capture fails closed: ' + fn.name + ' ' + defect, () => {
  const f = fixture(); if (fn === schemaPlan) for (const k of keys) f.snap.lists[k].fields.value = f.snap.lists[k].fields.value.filter(v => v.InternalName === 'Title');
  if (defect === 'rows absent') delete f.snap.rows;
  if (defect === 'feed absent') delete f.snap.rows.people;
  if (defect === 'paged') f.snap.rows.expenses['odata.nextLink'] = 'unread';
  if (defect === 'folder present') f.snap.requestFolder = { ItemCount: 0 };
  if (defect === 'folder unknown') delete f.snap.requestFolder;
  if (defect === 'request present') f.snap.claimantRequestFeed.value.push({ Id: 9 });
  if (defect === 'request unknown') delete f.snap.claimantRequestFeed;
  if (defect === 'request paged') f.snap.claimantRequestFeed.__next = 'unread';
  assert.throws(() => fn(j(f.spec), j(f.before), j(f.snap)), /^Error: FIXTURE_/);
});
test('fully seeded capture cannot be recycled or seeded again by forging all counts to zero', () => {
  const f = seeded(); for (const k of keys) f.snap.lists[k].ItemCount = 0;
  for (const fn of [seedPlan, rollbackPlan]) assert.throws(() => fn(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_EMPTY_ROW_FEED/);
});
test('packager consumes admitted bindings but stays Draft/Off and default R10 output stays byte identical', () => {
  const f = seeded(), before = solutionFiles(), candidate = fixtureSolutionFiles(j(f.spec), j(f.before), j(f.snap));
  assert.equal(candidate.admission.tenantWriteAllowed, false);
  const flow = JSON.parse(candidate.files['Workflows/' + filename]); assert.deepEqual(flow.properties.definition.parameters.Bindings.defaultValue, inspect(f).bindings);
  assert(candidate.files['Workflows/' + filename + '.data.xml'].includes('<StateCode>0</StateCode><StatusCode>1</StatusCode>'));
  assert.deepEqual(solutionFiles(), before);
  f.snap.lists.expenses.fields.value = []; assert.throws(() => fixtureSolutionFiles(j(f.spec), j(f.before), j(f.snap)), /FIXTURE_FIELD_/);
});
for (const kind of ['none', 'jpg', 'png', 'pdf']) test('admitted bindings execute emitted WDL ' + kind + ' with one line and replay', async () => {
  const { FakeSharePoint, command } = require('./fake-sharepoint.cjs');
  const { Harness } = require('./wdl-harness.cjs');
  const f = seeded(), candidate = fixtureSolutionFiles(j(f.spec), j(f.before), j(f.snap)), flow = JSON.parse(candidate.files['Workflows/' + filename]);
  const server = new FakeSharePoint(command(kind)); server.bindings = candidate.admission.bindings;
  server.tables.requests = []; server.files.clear(); server.putRequest(501, command(kind));
  const run = () => new Harness(flow, flow.properties.definition.parameters.Bindings.defaultValue, server.transport.bind(server)).run({ ID: 501 });
  assert.equal((await run()).outputs.Storage_Verified?.state, 'StorageVerified');
  assert.equal(server.tables.expenses.length, 1); const count = server.writes.length;
  assert.equal((await run()).outputs.Storage_Verified?.state, 'StorageVerified'); assert.equal(server.writes.length, count);
  assert.equal(server.attachments.size, kind === 'none' ? 0 : 1);
});
test('fresh captured native TEST102 fails required Category and cannot be substituted as a new resource', () => {
  const evidence = fs.readFileSync(path.resolve(__dirname, '../../../docs/evidence/D01_PRIVATE_FIXTURE_20261022/native-expense-fields.xml'), 'utf8');
  assert(/<d:InternalName>ExpenseCategory<\/d:InternalName>[\s\S]*?<d:Required[^>]*>true<\/d:Required>/.test(evidence));
  assert(!evidence.includes('<d:InternalName>D01NoReceiptReason</d:InternalName>'));
  const f = seeded(); f.snap.lists.expenses.Id = f.before.lists.value[0].Id; hold(f);
});
test('bounded local CLI emits matched held package and never changes its input captures', () => {
  const os = require('node:os'), { main } = require('./private-fixture-cli.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kcf-fixture-cli-')), f = seeded();
  const files = ['spec.json', 'before.json', 'snapshot.json'].map(n => path.join(dir, n));
  const values = [j(f.spec), j(f.before), j(f.snap)];
  try {
    files.forEach((file, i) => fs.writeFileSync(file, values[i], { flag: 'wx' }));
    assert.equal(main(['inspect', ...files]).state, 'METADATA_MATCH_ONLY');
    assert.equal(main(['package', ...files]).admission.tenantWriteAllowed, false);
    assert.equal(main(['create', ...files.slice(0, 2)]).requests.length, 9);
    files.forEach((file, i) => assert.equal(fs.readFileSync(file, 'utf8'), values[i]));
    assert.throws(() => main(['enable', ...files]), /USAGE/);
    assert.throws(() => main(['inspect', ...files, 'extra']), /USAGE/);
    fs.writeFileSync(files[0], ' '.repeat(128 * 1024 + 1));
    assert.throws(() => main(['inspect', ...files]), /INPUT_BOUND/);
  } finally { for (const file of files) if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
});
test('CLI errors disclose no file contents, path or credentials', () => {
  const { spawnSync } = require('node:child_process');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'private-fixture-cli.cjs'), 'inspect', 'PRIVATE-NONEXISTENT', 'other', 'another'], { encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'FIXTURE_INPUT_OR_USAGE\n');
});

// The normal native Boolean form has no Required control and starts at Yes.
// Proposed No/default '0' is a future native readback gate, not a captured field.
test('protected roster active contract is optional Boolean with explicit inactive default', () => {
  const active = schema().people.find(f => f.name === 'D01Active');
  assert.equal(active.type, 'Boolean');
  assert.equal(active.required, false);
  assert.equal(active.defaultValue, '0');
});
test('explicit native inactive-default metadata can match without changing active eligibility', () => {
  const f = seeded(), field = f.snap.lists.people.fields.value.find(v => v.InternalName === 'D01Active');
  field.Required = false; field.DefaultValue = '0';
  assert.equal(inspect(f).tenantWriteAllowed, false);
});
test('source schema plan emits only an explicit inactive default for D01Active', () => {
  const f = fixture();
  for (const key of keys) f.snap.lists[key].fields.value = f.snap.lists[key].fields.value.filter(v => v.InternalName === 'Title');
  const plan = schemaPlan(j(f.spec), j(f.before), j(f.snap));
  const active = plan.requests.find(v => v.body.parameters.SchemaXml.includes('Name="D01Active"'));
  assert(active);
  assert.match(active.body.parameters.SchemaXml, /Required="FALSE"/);
  assert.match(active.body.parameters.SchemaXml, /<Default>0<\/Default><\/Field>$/);
  assert.equal(plan.tenantWriteAllowed, false);
  assert.equal(plan.requests.filter(v => v.body.parameters.SchemaXml.includes('<Default>')).length, 1);
});
for (const defaultValue of [undefined, null, '', '1', 'true', 'false', '0.0', false, 0, '=FALSE()']) {
  test('protected roster rejects nonexact inactive default ' + String(defaultValue), () => {
    const f = seeded(), field = f.snap.lists.people.fields.value.find(v => v.InternalName === 'D01Active');
    field.Required = false;
    if (defaultValue === undefined) delete field.DefaultValue; else field.DefaultValue = defaultValue;
    assert.throws(() => inspect(f), /^Error: FIXTURE_/);
  });
}
for (const activeValue of [false, null, undefined, 'true', 'false', 1, 0]) {
  test('roster rows never infer activity from default or coercion ' + String(activeValue), () => {
    const f = seeded();
    if (activeValue === undefined) delete f.snap.rows.people.value[0].D01Active;
    else f.snap.rows.people.value[0].D01Active = activeValue;
    assert.throws(() => inspect(f), /^Error: FIXTURE_/);
  });
}
