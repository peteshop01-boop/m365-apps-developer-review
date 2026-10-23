'use strict';
// LOCAL capture validation only. No HTTP, credentials, permission executor or
// runtime bindings. Owners-retained empty staging is not a private user fixture.
const { SITE } = require('./build-flow.cjs');
const { schema } = require('./private-fixture.cjs');
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const guid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
function must(ok, code) { if (!ok) throw Error('FIXTURE_STAGING_' + code); }
function exact(v, keys) {
  must(v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every(k => Object.hasOwn(v, k)), 'SHAPE');
}
function parse(value) {
  must(typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 2 * 1024 * 1024, 'INPUT_BOUND');
  try { return JSON.parse(value); } catch { throw Error('FIXTURE_STAGING_JSON'); }
}
function positive(v) { return Number.isInteger(v) && v > 0 && v <= 2147483647; }
function time(v) {
  must(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v, 'TIME');
  return Date.parse(v);
}
function feed(v, limit) { exact(v, ['value']); must(Array.isArray(v.value) && v.value.length <= limit, 'FEED'); return v.value; }
function inventory(v) {
  const rows = feed(v, 5000);
  for (const r of rows) {
    exact(r, ['Id', 'Title']);
    must(typeof r.Id === 'string' && guid.test(r.Id) && typeof r.Title === 'string' && r.Title.length > 0 && r.Title.length <= 255, 'INVENTORY');
  }
  must(new Set(rows.map(r => r.Id)).size === rows.length && new Set(rows.map(r => r.Title.toLowerCase())).size === rows.length, 'INVENTORY_DUPLICATE');
  return rows;
}
function validateMonthsSnapshot(intentJson, beforeJson, snapshotJson, metadataComplete) {
  const intent = parse(intentJson), before = parse(beforeJson), s = parse(snapshotJson);
  exact(intent, ['site', 'runId', 'listId', 'operatorId', 'ownerGroupId']);
  must(intent.site === SITE && typeof intent.runId === 'string' && /^[a-f0-9]{12}$/.test(intent.runId) && typeof intent.listId === 'string' && guid.test(intent.listId), 'TARGET');
  must(positive(intent.operatorId) && positive(intent.ownerGroupId) && intent.operatorId !== intent.ownerGroupId, 'ACTOR');
  const title = 'KCFEXP_TEST102_D01_' + intent.runId + '_months';
  const root = '/sites/REVIEW-TEST-SITE/Lists/' + title;
  const marker = 'KCF D01 private synthetic fixture ' + intent.runId + '; no real claims';
  exact(before, ['site', 'observedAt', 'lists']);
  must(before.site === SITE, 'SITE');
  const previous = inventory(before.lists);
  must(!previous.some(r => r.Id === intent.listId || r.Title.toLowerCase() === title.toLowerCase()), 'PREEXISTING');
  exact(s, ['site', 'observedAt', 'receipt', 'identity', 'list', 'acl', 'rows', 'fields']);
  must(s.site === SITE, 'SITE');
  const observedAt = time(s.observedAt);
  exact(s.receipt, ['method', 'observedAt', 'Id', 'Title', 'root', 'inventoryAfter']);
  must(s.receipt.method === 'native-ui-readback' && s.receipt.Id === intent.listId && s.receipt.Title === title && s.receipt.root === root, 'RECEIPT');
  must(time(before.observedAt) < time(s.receipt.observedAt) && time(s.receipt.observedAt) <= observedAt, 'ORDER');
  const after = inventory(s.receipt.inventoryAfter);
  must(after.length === previous.length + 1 && previous.every(r => after.some(a => a.Id === r.Id && a.Title === r.Title)) && after.some(r => r.Id === intent.listId && r.Title === title), 'INVENTORY_DELTA');
  exact(s.identity, ['Id', 'PrincipalType', 'IsSiteAdmin', 'responseAt']);
  must(s.identity.Id === intent.operatorId && s.identity.PrincipalType === 1 && s.identity.IsSiteAdmin === true, 'RECOVERY');
  exact(s.list, ['Id', 'Title', 'Description', 'BaseTemplate', 'ItemCount', 'HasUniqueRoleAssignments', 'RootFolder', 'EffectiveBasePermissions', 'responseAt']);
  for (const capture of [s.acl, s.rows, s.fields]) exact(capture, ['responseAt', 'feed']);
  // Reject cached body timestamps relative to the supplied collection window.
  // This consistency check is not independent clock/capture attestation.
  for (const capture of [s.identity, s.list, s.acl, s.rows, s.fields]) {
    const age = observedAt - time(capture.responseAt);
    must(age >= 0 && age <= 120000 && time(capture.responseAt) >= time(s.receipt.observedAt), 'STALE_CAPTURE');
  }
  exact(s.list.RootFolder, ['ServerRelativeUrl']);
  exact(s.list.EffectiveBasePermissions, ['High', 'Low']);
  const l = s.list;
  must(l.Id === intent.listId && l.Title === title && l.RootFolder.ServerRelativeUrl === root && l.BaseTemplate === 100, 'LIST');
  must(l.ItemCount === 0 && l.HasUniqueRoleAssignments === true && (l.Description === '' || l.Description === marker), 'EMPTY_UNIQUE');
  const rights = l.EffectiveBasePermissions;
  must([rights.High, rights.Low].every(v => typeof v === 'string' && /^(0|[1-9]\d{0,9})$/.test(v) && BigInt(v) <= 4294967295n), 'RIGHTS');
  const needed = 2048n | 33554432n | 65536n | 131072n;
  must((BigInt(rights.Low) & needed) === needed && (BigInt(rights.High) & 1073741824n) !== 0n, 'RECOVERY_RIGHTS');
  const acl = feed(s.acl.feed, 1);
  must(acl.length === 1, 'ACL');
  exact(acl[0], ['principalId', 'principalType', 'roles']);
  must(acl[0].principalId === intent.ownerGroupId && acl[0].principalType === 8 && Array.isArray(acl[0].roles) && acl[0].roles.length === 1, 'OWNER');
  const role = acl[0].roles[0]; exact(role, ['id', 'high', 'low']);
  must(role.id === 1073741829 && role.high === '2147483647' && role.low === '4294967295', 'OWNER_ROLE');
  must(feed(s.rows.feed, 0).length === 0, 'ROWS');
  const fields = feed(s.fields.feed, 250);
  const expected = schema().months;
  must(fields.length > 0, 'FIELDS');
  const names = [], ids = [];
  for (const f of fields) {
    exact(f, ['Id', 'InternalName', 'TypeAsString', 'Required', 'ReadOnlyField', 'Hidden', 'FromBaseType', 'MaxLength', 'DefaultValue', 'EnforceUniqueValues', 'Indexed']);
    must(typeof f.Id === 'string' && guid.test(f.Id) && typeof f.InternalName === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(f.InternalName), 'FIELD');
    must(['Required', 'ReadOnlyField', 'Hidden', 'FromBaseType', 'EnforceUniqueValues', 'Indexed'].every(k => typeof f[k] === 'boolean'), 'FIELD');
    must(typeof f.TypeAsString === 'string' && /^[A-Za-z]{1,32}$/.test(f.TypeAsString) && (f.MaxLength === null || (Number.isInteger(f.MaxLength) && f.MaxLength > 0 && f.MaxLength <= 65536)) && (f.DefaultValue === null || typeof f.DefaultValue === 'string'), 'FIELD');
    names.push(f.InternalName.toLowerCase()); ids.push(f.Id);
    const nativeCommentFields = { _CommentFlags: '81ac77b9-0181-4897-a8f7-c138054d3a61', _CommentCount: '6184b954-11c8-43d2-adf1-e9060f924a35' };
    const nativeComment = Object.hasOwn(nativeCommentFields, f.InternalName) && nativeCommentFields[f.InternalName] === f.Id && f.TypeAsString === 'Lookup' && f.Hidden && f.ReadOnlyField && !f.Required && !f.EnforceUniqueValues && !f.Indexed && f.DefaultValue === null;
    const contract = expected.find(e => e.name !== 'Title' && e.name === f.InternalName);
    if (metadataComplete && contract) {
      must(f.TypeAsString === 'Text' && f.Required === contract.required && !f.ReadOnlyField && !f.Hidden && !f.FromBaseType && f.MaxLength === contract.length && (f.DefaultValue === null || f.DefaultValue === '') && !f.EnforceUniqueValues && !f.Indexed, 'CONTRACT_FIELD');
    } else if (f.InternalName !== 'Title') must((f.FromBaseType === true || nativeComment) && !['claimmonth', 'monthstatus'].includes(f.InternalName.toLowerCase()), 'FIELD_COLLISION');
  }
  must(new Set(names).size === names.length && new Set(ids).size === ids.length, 'FIELD_DUPLICATE');
  const t = fields.find(f => f.InternalName === 'Title');
  must(t && t.Id === '33d5b10b-895f-40bc-ac7e-b0ab96f5aa5c' && t.FromBaseType && t.TypeAsString === 'Text' && !t.Hidden && !t.ReadOnlyField && t.MaxLength === 255 && !t.EnforceUniqueValues && !t.Indexed && (t.DefaultValue === null || t.DefaultValue === ''), 'TITLE');
  if (metadataComplete) must(l.Description === marker && t.Required === true && expected.every(e => fields.some(f => f.InternalName === e.name)), 'METADATA_INCOMPLETE');
  return { intent, before, s, marker, fields, t, expected };
}
function nativeMonthsStagingPlan(intentJson, beforeJson, snapshotJson) {
  const { intent, before, s, marker, t, expected } = validateMonthsSnapshot(intentJson, beforeJson, snapshotJson, false);
  const l = s.list;
  // Reuse the reviewed contract. These are normal-UI steps, not an executable
  // REST request, final nine-resource journal or writer activation token.
  const uiSteps = [];
  if (l.Description !== marker) uiSteps.push({ action: 'setDescription', listId: l.Id, value: marker });
  if (!t.Required) uiSteps.push({ action: 'editTitleRequired', listId: l.Id, fieldId: t.Id, required: true });
  for (const f of expected.filter(f => f.name !== 'Title')) uiSteps.push({ action: 'createTextColumn', listId: l.Id, internalName: f.name, required: f.required, maxLength: f.length, defaultValue: null, unique: false });
  return { state: 'OWNERS_RETAINED_EMPTY_METADATA_PLAN', tenantWriteAllowed: false, runtimeAdmission: false, site: SITE, listId: l.Id,
    inputHash: crypto.createHash('sha256').update(JSON.stringify({ intent, before, snapshot: s })).digest('hex'), uiSteps,
    gates: ['Independent native capture and exact-step qualification', 'Re-read immediately before each approved UI action; stop on any ambiguity', 'Current ordinary identities, effective rights and raw unrelated-user denial', 'Separate stricter nine-resource fixture and Standard processor admission'],
    warning: 'Owner-supplied JSON is not authenticated capture attestation. No rows, grants, flow, package or Save authority.' };
}
function nativeMonthsMetadataReadback(intentJson, beforeJson, preJson, postJson) {
  // Both snapshots independently pass the same containment/recovery guards.
  // This result cannot authorise a retry or stand in for a native action receipt.
  const pre = validateMonthsSnapshot(intentJson, beforeJson, preJson, false);
  const post = validateMonthsSnapshot(intentJson, beforeJson, postJson, true);
  must(time(post.s.observedAt) > time(pre.s.observedAt), 'READBACK_ORDER');
  for (const key of ['identity', 'list', 'acl', 'rows', 'fields']) must(time(post.s[key].responseAt) > time(pre.s.observedAt), 'READBACK_STALE');
  must(isDeepStrictEqual(pre.s.receipt, post.s.receipt), 'READBACK_RECEIPT');
  // Only Description, Title requiredness and the two reviewed columns may differ.
  const omitTime = value => { const { responseAt, ...rest } = value; return rest; };
  must(isDeepStrictEqual(omitTime(pre.s.identity), omitTime(post.s.identity)) && isDeepStrictEqual(pre.s.acl.feed, post.s.acl.feed) && isDeepStrictEqual(pre.s.rows.feed, post.s.rows.feed), 'READBACK_DRIFT');
  must(isDeepStrictEqual({ ...omitTime(pre.s.list), Description: post.marker }, omitTime(post.s.list)), 'READBACK_DRIFT');
  must(post.fields.length === pre.fields.length + 2, 'READBACK_FIELDS');
  for (const f of pre.fields) {
    const expected = f.InternalName === 'Title' ? { ...f, Required: true } : f;
    must(isDeepStrictEqual(expected, post.fields.find(p => p.Id === f.Id)), 'READBACK_FIELDS');
  }
  const columns = post.expected.map(e => post.fields.find(f => f.InternalName === e.name));
  return { state: 'OWNERS_RETAINED_EMPTY_METADATA_CAPTURE_MATCH', tenantWriteAllowed: false, runtimeAdmission: false,
    site: SITE, listId: post.s.list.Id, observedAt: post.s.observedAt,
    inputHash: crypto.createHash('sha256').update(JSON.stringify({ intent: pre.intent, before: pre.before, pre: pre.s, post: post.s })).digest('hex'),
    columns: columns.map(f => ({ id: f.Id, internalName: f.InternalName, required: f.Required, maxLength: f.MaxLength })),
    gates: ['Independent current native capture and action evidence', 'Ordinary identities, effective permissions and raw unrelated-user denial', 'Separate stricter nine-resource fixture and Standard processor admission'],
    warning: 'Supplied captures are not authenticated attestation. No action receipt, retry, rows, grants, bindings, flow, package or Save authority.' };
}
module.exports = { nativeMonthsStagingPlan, nativeMonthsMetadataReadback };
