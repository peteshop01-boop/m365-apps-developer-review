'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { nativeMonthsStagingPlan: plan, nativeMonthsMetadataReadback: inspect } = require('./native-staging.cjs');
const { SITE } = require('./build-flow.cjs');
const { main } = require('./private-fixture-cli.cjs');
const { schema } = require('./private-fixture.cjs');
const id = n => n.toString(16).padStart(8, '0') + '-aaaa-bbbb-cccc-000000000001';
const j = JSON.stringify;
function specimen() {
  const intent = { site: SITE, runId: '123456abcdef', listId: id(20), operatorId: 12, ownerGroupId: 3 };
  const title = 'KCFEXP_TEST102_D01_' + intent.runId + '_months', root = '/sites/REVIEW-TEST-SITE/Lists/' + title;
  const before = { site: SITE, observedAt: '2026-10-22T10:00:00.000Z', lists: { value: [{ Id: id(1), Title: 'Unchanged original fixture' }] } };
  const stamp = '2026-10-22T10:23:32.000Z';
  const field = { Id: '33d5b10b-895f-40bc-ac7e-b0ab96f5aa5c', InternalName: 'Title', TypeAsString: 'Text', Required: false, ReadOnlyField: false, Hidden: false, FromBaseType: true, MaxLength: 255, DefaultValue: null, EnforceUniqueValues: false, Indexed: false };
  const snapshot = { site: SITE, observedAt: '2026-10-22T10:24:00.000Z', receipt: { method: 'native-ui-readback', observedAt: '2026-10-22T10:01:00.000Z', Id: intent.listId, Title: title, root, inventoryAfter: { value: [...before.lists.value, { Id: intent.listId, Title: title }] } },
    identity: { Id: 12, PrincipalType: 1, IsSiteAdmin: true, responseAt: stamp },
    list: { Id: intent.listId, Title: title, Description: '', BaseTemplate: 100, ItemCount: 0, HasUniqueRoleAssignments: true, RootFolder: { ServerRelativeUrl: root }, EffectiveBasePermissions: { High: '2147483647', Low: '4294705151' }, responseAt: stamp },
    acl: { responseAt: stamp, feed: { value: [{ principalId: 3, principalType: 8, roles: [{ id: 1073741829, high: '2147483647', low: '4294967295' }] }] } }, rows: { responseAt: stamp, feed: { value: [] } }, fields: { responseAt: stamp, feed: { value: [field] } } };
  return { intent, before, snapshot };
}
const run = f => plan(j(f.intent), j(f.before), j(f.snapshot));
test('native UI receipt remains distinct and produces only held same-list metadata steps', () => {
  const f = specimen(), p = run(f);
  assert.equal(p.tenantWriteAllowed, false); assert.equal(p.runtimeAdmission, false);
  assert.equal(p.state, 'OWNERS_RETAINED_EMPTY_METADATA_PLAN'); assert.equal(p.uiSteps.length, 4);
  assert(p.uiSteps.every(s => s.listId === f.intent.listId)); assert(!Object.hasOwn(p, 'bindings')); assert(!Object.hasOwn(p, 'requests'));
  assert.equal(p.uiSteps[1].fieldId, f.snapshot.fields.feed.value[0].Id);
  assert.deepEqual(p.uiSteps.filter(s => s.action === 'createTextColumn').map(s => [s.internalName, s.maxLength, s.required, s.defaultValue]), schema().months.slice(1).map(s => [s.name, s.length, s.required, null]));
  assert(!j(p).includes('ExpenseCategory')); assert(!j(p).includes('201'));
});
const negatives = {
  wrongSite: f => { f.snapshot.site += '-Production'; },
  wrongIntentSite: f => { f.intent.site += '-Production'; },
  wrongBeforeSite: f => { f.before.site += '-Production'; },
  forgedId: f => { f.snapshot.list.Id = id(99); },
  wrongRoot: f => { f.snapshot.list.RootFolder.ServerRelativeUrl += 'wrong'; },
  wrongTitle: f => { f.snapshot.list.Title += 'wrong'; },
  wrongTemplate: f => { f.snapshot.list.BaseTemplate = 101; },
  inherited: f => { f.snapshot.list.HasUniqueRoleAssignments = false; },
  stringBoolean: f => { f.snapshot.list.HasUniqueRoleAssignments = 'true'; },
  countNonzero: f => { f.snapshot.list.ItemCount = 1; },
  hiddenRow: f => { f.snapshot.rows.feed.value.push({ Id: 1 }); },
  pagedRows: f => { f.snapshot.rows.feed['@odata.nextLink'] = 'next'; },
  pagedAcl: f => { f.snapshot.acl.feed['odata.nextLink'] = 'next'; },
  broadMembers: f => { f.snapshot.acl.feed.value.push({ principalId: 5, principalType: 8, roles: [{ id: 1073741830, high: '432', low: '1011030767' }] }); },
  broadVisitors: f => { f.snapshot.acl.feed.value.push({ principalId: 4, principalType: 8, roles: [{ id: 1073741826, high: '176', low: '138612833' }] }); },
  missingOwner: f => { f.snapshot.acl.feed.value = []; },
  wrongOwner: f => { f.snapshot.acl.feed.value[0].principalId = 7; },
  userNotGroup: f => { f.snapshot.acl.feed.value[0].principalType = 1; },
  wrongOwnerMask: f => { f.snapshot.acl.feed.value[0].roles[0].low = '1011030767'; },
  extraOwnerRole: f => { f.snapshot.acl.feed.value[0].roles.push({ id: 1073741826, high: '176', low: '138612833' }); },
  forgedOperator: f => { f.snapshot.identity.Id = 99; },
  noRecovery: f => { f.snapshot.identity.IsSiteAdmin = false; },
  noManageRights: f => { f.snapshot.list.EffectiveBasePermissions.Low = '196609'; },
  noEnumeration: f => { f.snapshot.list.EffectiveBasePermissions.High = '0'; },
  cachedList: f => { f.snapshot.list.responseAt = '2026-10-22T09:58:43.000Z'; },
  cachedIdentity: f => { f.snapshot.identity.responseAt = '2026-10-22T10:20:00.000Z'; },
  futureAcl: f => { f.snapshot.acl.responseAt = '2026-10-22T10:25:00.000Z'; },
  badTime: f => { f.snapshot.rows.responseAt = '2026-02-31T10:23:32.000Z'; },
  missingCapture: f => { f.snapshot.fields = null; },
  oldGuid: f => { f.before.lists.value.push({ Id: f.intent.listId, Title: 'old' }); },
  caseCollision: f => { f.before.lists.value[0].Title = f.snapshot.list.Title.toUpperCase(); },
  removedOriginal: f => { f.snapshot.receipt.inventoryAfter.value.shift(); },
  renamedOriginal: f => { f.snapshot.receipt.inventoryAfter.value[0] = { Id: id(1), Title: 'changed' }; },
  extraCreatedList: f => { f.snapshot.receipt.inventoryAfter.value.push({ Id: id(90), Title: 'extra' }); },
  pagedInventory: f => { f.before.lists.nextLink = 'more'; },
  inventedHttp201: f => { f.snapshot.receipt.status = 201; },
  wrongReceiptMethod: f => { f.snapshot.receipt.method = 'http-201'; },
  receiptBeforeInventory: f => { f.snapshot.receipt.observedAt = f.before.observedAt; },
  badMarker: f => { f.snapshot.list.Description = 'another fixture'; },
  existingClaimMonth: f => { f.snapshot.fields.feed.value.push({ ...f.snapshot.fields.feed.value[0], Id: id(50), InternalName: 'ClaimMonth' }); },
  existingMonthStatus: f => { f.snapshot.fields.feed.value.push({ ...f.snapshot.fields.feed.value[0], Id: id(50), InternalName: 'monthstatus' }); },
  customField: f => { f.snapshot.fields.feed.value.push({ ...f.snapshot.fields.feed.value[0], Id: id(50), InternalName: 'ExpenseCategory', FromBaseType: false }); },
  duplicateField: f => { f.snapshot.fields.feed.value.push({ ...f.snapshot.fields.feed.value[0] }); },
  wrongTitleId: f => { f.snapshot.fields.feed.value[0].Id = id(50); },
  wrongTitleType: f => { f.snapshot.fields.feed.value[0].TypeAsString = 'Note'; },
  titleDefault: f => { f.snapshot.fields.feed.value[0].DefaultValue = 'hidden default'; },
  titleLength: f => { f.snapshot.fields.feed.value[0].MaxLength = 100; },
  pagedFields: f => { f.snapshot.fields.feed.nextLink = 'more'; },
  invalidFieldFlag: f => { f.snapshot.fields.feed.value[0].Required = 'false'; },
  unknownInput: f => { f.intent.activate = true; }
};
for (const [name, change] of Object.entries(negatives)) test('native empty staging holds ' + name, () => { const f = specimen(); change(f); assert.throws(() => run(f), /^Error: FIXTURE_STAGING_/); });
test('already correct marker and required Title avoid repeated updates', () => {
  const f = specimen(); f.snapshot.list.Description = 'KCF D01 private synthetic fixture 123456abcdef; no real claims'; f.snapshot.fields.feed.value[0].Required = true;
  assert.equal(run(f).uiSteps.length, 2);
});
test('observed native comment fields require exact hidden readonly identities', () => {
  const f = specimen(); const comment = { ...f.snapshot.fields.feed.value[0], Id: '81ac77b9-0181-4897-a8f7-c138054d3a61', InternalName: '_CommentFlags', TypeAsString: 'Lookup', Hidden: true, ReadOnlyField: true, FromBaseType: false, MaxLength: null };
  f.snapshot.fields.feed.value.push(comment); assert.equal(run(f).runtimeAdmission, false);
  comment.ReadOnlyField = false; assert.throws(() => run(f), /FIXTURE_STAGING_FIELD_COLLISION/);
});
test('existing local CLI consumes the staging boundary without a writer', () => {
  const f = specimen(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kcf-native-staging-'));
  try { const files = ['intent', 'before', 'snapshot'].map(k => { const p = path.join(dir, k + '.json'); fs.writeFileSync(p, j(f[k])); return p; });
    assert.deepEqual(main(['staging-months', ...files]), run(f));
    f.snapshot.acl.feed.value.push({ principalId: 4 }); fs.writeFileSync(files[2], j(f.snapshot));
    assert.throws(() => main(['staging-months', ...files]), /^Error: FIXTURE_STAGING_/);
  } finally { for (const name of ['intent', 'before', 'snapshot']) { const p = path.join(dir, name + '.json'); if (fs.existsSync(p)) fs.unlinkSync(p); } fs.rmdirSync(dir); }
});
test('staging rejects nonstring and oversized input without coercion', () => {
  const f = specimen(); assert.throws(() => plan({ toString() { throw Error('called'); } }, j(f.before), j(f.snapshot)), /FIXTURE_STAGING_INPUT_BOUND/);
  assert.throws(() => plan(' '.repeat(2 * 1024 * 1024 + 1), j(f.before), j(f.snapshot)), /FIXTURE_STAGING_INPUT_BOUND/);
});

function completedSpecimen() {
  const f = specimen(), post = JSON.parse(j(f.snapshot));
  post.observedAt = '2026-10-22T10:25:30.000Z';
  for (const key of ['identity', 'list', 'acl', 'rows', 'fields']) post[key].responseAt = '2026-10-22T10:25:29.000Z';
  post.list.Description = 'KCF D01 private synthetic fixture 123456abcdef; no real claims';
  post.fields.feed.value[0].Required = true;
  post.fields.feed.value.push(...schema().months.slice(1).map((c, n) => ({ ...post.fields.feed.value[0], Id: id(60 + n), InternalName: c.name, FromBaseType: false, MaxLength: c.length })));
  return { ...f, post };
}
const inspectRun = f => inspect(j(f.intent), j(f.before), j(f.snapshot), j(f.post));
test('metadata readback binds exact required fields and original IDs with both write gates false', () => {
  const f = completedSpecimen(), before = j(f), result = inspectRun(f);
  assert.equal(result.state, 'OWNERS_RETAINED_EMPTY_METADATA_CAPTURE_MATCH');
  assert.equal(result.tenantWriteAllowed, false); assert.equal(result.runtimeAdmission, false);
  assert.equal(result.listId, f.intent.listId); assert.equal(result.observedAt, f.post.observedAt);
  assert.deepEqual(result.columns.map(c => [c.internalName, c.required, c.maxLength]), schema().months.map(c => [c.name, c.required, c.length]));
  for (const key of ['uiSteps', 'requests', 'bindings', 'status', 'creationJournal']) assert(!Object.hasOwn(result, key));
  assert.equal(j(f), before); assert.equal(inspectRun(f).inputHash, result.inputHash);
});
test('readback accepts reordered field entries and explicit empty defaults on the two new columns', () => {
  const f = completedSpecimen(); f.post.fields.feed.value.reverse();
  for (const c of f.post.fields.feed.value.filter(c => c.InternalName !== 'Title')) c.DefaultValue = '';
  assert.equal(inspectRun(f).runtimeAdmission, false);
});
const readbackNegatives = {
  unchangedPreCapture: f => { f.post = JSON.parse(j(f.snapshot)); },
  preBroadAccess: f => { f.snapshot.acl.feed.value.push({ principalId: 5 }); },
  preAlreadyHasColumn: f => { f.snapshot.fields.feed.value.push(f.post.fields.feed.value[1]); },
  postMembers: f => { f.post.acl.feed.value.push({ principalId: 5 }); },
  postVisitors: f => { f.post.acl.feed.value.push({ principalId: 4 }); },
  postNoOwner: f => { f.post.acl.feed.value = []; },
  postOwnerChanged: f => { f.post.acl.feed.value[0].principalId = 99; },
  postInherited: f => { f.post.list.HasUniqueRoleAssignments = false; },
  postActorChanged: f => { f.post.identity.Id = 99; },
  postAdminLost: f => { f.post.identity.IsSiteAdmin = false; },
  postRightsDrift: f => { f.post.list.EffectiveBasePermissions.Low = '4294967295'; },
  postIdChanged: f => { f.post.list.Id = id(88); },
  postReceiptChanged: f => { f.post.receipt.observedAt = '2026-10-22T10:02:00.000Z'; },
  postReceiptInventedStatus: f => { f.post.receipt.status = 201; },
  postMissingMarker: f => { f.post.list.Description = ''; },
  postWrongMarker: f => { f.post.list.Description += 'altered'; },
  postNotEmpty: f => { f.post.list.ItemCount = 1; },
  postContradictoryRow: f => { f.post.rows.feed.value.push({ Id: 1 }); },
  postPagedItems: f => { f.post.rows.feed.nextLink = 'more'; },
  postPagedAcl: f => { f.post.acl.feed['@odata.nextLink'] = 'more'; },
  postPagedFields: f => { f.post.fields.feed.nextLink = 'more'; },
  postMissingTitleRequired: f => { f.post.fields.feed.value[0].Required = false; },
  postTitleDefaultRepresentationChanged: f => { f.post.fields.feed.value[0].DefaultValue = ''; },
  postMissingClaimMonth: f => { f.post.fields.feed.value.splice(1, 1); },
  postMissingMonthStatus: f => { f.post.fields.feed.value.pop(); },
  postDuplicateId: f => { f.post.fields.feed.value[1].Id = f.post.fields.feed.value[0].Id; },
  postDuplicateName: f => { f.post.fields.feed.value[2].InternalName = 'ClaimMonth'; },
  postLowercaseName: f => { f.post.fields.feed.value[1].InternalName = 'claimmonth'; },
  postExtraCustom: f => { f.post.fields.feed.value.push({ ...f.post.fields.feed.value[1], Id: id(88), InternalName: 'ExpenseCategory' }); },
  postExtraClaimedBaseField: f => { f.post.fields.feed.value.push({ ...f.post.fields.feed.value[0], Id: id(88), InternalName: 'UnexpectedBase' }); },
  postWrongType: f => { f.post.fields.feed.value[1].TypeAsString = 'Note'; },
  postWrongLength: f => { f.post.fields.feed.value[1].MaxLength = 255; },
  postStatusWrongLength: f => { f.post.fields.feed.value[2].MaxLength = 255; },
  postOptional: f => { f.post.fields.feed.value[1].Required = false; },
  postHidden: f => { f.post.fields.feed.value[1].Hidden = true; },
  postReadOnly: f => { f.post.fields.feed.value[1].ReadOnlyField = true; },
  postFromBase: f => { f.post.fields.feed.value[1].FromBaseType = true; },
  postDefault: f => { f.post.fields.feed.value[1].DefaultValue = '2026-10'; },
  postIndexed: f => { f.post.fields.feed.value[1].Indexed = true; },
  postUnique: f => { f.post.fields.feed.value[1].EnforceUniqueValues = true; },
  postSameCollectionTime: f => { f.post.observedAt = f.snapshot.observedAt; },
  postStaleFieldResponse: f => { f.post.fields.responseAt = f.snapshot.observedAt; },
  postStaleAclResponse: f => { f.post.acl.responseAt = f.snapshot.observedAt; },
  postFutureResponse: f => { f.post.list.responseAt = '2026-10-22T10:26:00.000Z'; }
};
for (const [name, change] of Object.entries(readbackNegatives)) test('post-metadata readback holds ' + name, () => { const f = completedSpecimen(); change(f); assert.throws(() => inspectRun(f), /^Error: FIXTURE_STAGING_/); });
test('readback preserves every original base field by ID and definition, not just field counts', () => {
  const f = completedSpecimen(), base = { ...f.snapshot.fields.feed.value[0], Id: id(80), InternalName: 'OriginalBase' };
  f.snapshot.fields.feed.value.push(base); f.post.fields.feed.value.push({ ...base }); assert.equal(inspectRun(f).runtimeAdmission, false);
  f.post.fields.feed.value.at(-1).Id = id(81); assert.throws(() => inspectRun(f), /FIXTURE_STAGING_READBACK_FIELDS/);
  f.post.fields.feed.value.at(-1).Id = base.Id; f.post.fields.feed.value.at(-1).MaxLength = 100; assert.throws(() => inspectRun(f), /FIXTURE_STAGING_READBACK_FIELDS/);
});
test('existing CLI inspect-months requires four bounded input files and never emits a retry', () => {
  const f = completedSpecimen(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kcf-native-inspect-'));
  try {
    const files = ['intent', 'before', 'snapshot', 'post'].map(k => { const p = path.join(dir, k + '.json'); fs.writeFileSync(p, j(f[k])); return p; });
    assert.deepEqual(main(['inspect-months', ...files]), inspectRun(f));
    assert.throws(() => main(['inspect-months', ...files.slice(0, 3)]), /USAGE/);
    assert.throws(() => main(['inspect-months', ...files, files[0]]), /USAGE/);
    assert.throws(() => main(['staging-months', ...files]), /USAGE/);
    fs.writeFileSync(files[3], j(f.snapshot)); assert.throws(() => main(['inspect-months', ...files]), /^Error: FIXTURE_STAGING_/);
    fs.writeFileSync(files[3], ' '.repeat(2 * 1024 * 1024 + 1)); assert.throws(() => main(['inspect-months', ...files]), /INPUT_BOUND/);
  } finally { for (const name of ['intent', 'before', 'snapshot', 'post']) { const p = path.join(dir, name + '.json'); if (fs.existsSync(p)) fs.unlinkSync(p); } fs.rmdirSync(dir); }
});
