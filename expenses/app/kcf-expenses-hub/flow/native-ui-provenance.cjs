'use strict';
// OFFLINE historical custody reconciliation, never authentication or authority.
// Closed to the one independently reviewed native creation. A caller cannot
// supply their own trust root, approved flag, digest or arbitrary existing list.
const crypto = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const pins = Object.freeze({
  intent: 'cac40a84294e86c55b5f0fd7c5e69f69c8281322cd42bd7f6ddbd6f2bf37df11',
  before: '58ad27b2f89567ba679188a8f216b5e0116876c1dc903de1d80f2feb5e2c31e7',
  pre: '6480992607751e1ab5154ab16904e4f4415d834d8329c983e8468f0f5177918f',
  post: '1a933acdfb70ed0bd1fd42c51cf4913be80ec59f40a21704b9518fb6d87d36da',
  creation: 'f6a0e34314bf0cb7199bce414b93b365467b3a80b4a3af68b6bbbdc82bd939d9',
  security: 'cc8bd9ecdc1c15ec19b3858d578ffddf4bb85e143a8522180f94f7a8e67756a9',
  qa: 'c931038725b244c0f11345c64151a1b58ebacca9a2137e36f8127fbc532b7d24'
});
function must(value, code) { if (!value) throw Error('FIXTURE_NATIVE_UI_' + code); }
function exact(value, keys) {
  must(value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k)), 'SHAPE');
}
function time(value) {
  must(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'TIME');
  return Date.parse(value);
}
function reconcileNativeUiReceipt(receipt, spec, row, before, current) {
  exact(receipt, ['key', 'method', 'evidence']);
  must(receipt.key === 'months' && receipt.method === 'reviewed-native-ui-v1', 'KIND');
  const e = receipt.evidence; exact(e, Object.keys(pins));
  for (const [key, digest] of Object.entries(pins)) {
    must(typeof e[key] === 'string' && Buffer.byteLength(e[key], 'utf8') <= 128 * 1024, 'BOUND');
    must(crypto.createHash('sha256').update(e[key], 'utf8').digest('hex') === digest, 'CUSTODY');
  }
  // Lazy import avoids the staging/schema dependency cycle. Preserve its full
  // absent-before, one-created-GUID, actor, complete-feed and sequence checks.
  const accepted = require('./native-staging.cjs').nativeMonthsMetadataReadback(e.intent, e.before, e.pre, e.post);
  const intent = JSON.parse(e.intent), previous = JSON.parse(e.before), post = JSON.parse(e.post), creation = JSON.parse(e.creation);
  must(accepted.inputHash === 'fec08d476eb8398d2257c5550c78a04d56c1058a3bcd8cb7d008f15c009d1c46', 'REVIEW_INPUT');
  must(creation.id === intent.listId && creation.title === post.list.Title && creation.root === post.list.RootFolder.ServerRelativeUrl &&
    creation.itemCount === 0 && creation.baseTemplate === 100 && creation.uniqueAcl === 'false' &&
    Date.parse(creation.observedAt) === Date.parse(post.receipt.observedAt), 'CREATION');
  must(spec.runId === intent.runId && spec.provisionerId === intent.operatorId, 'SPEC');
  // Bind the journal's global absence inventory as well as the historical one.
  const sorted = values => [...values].map(v => ({ Id: v.Id, Title: v.Title })).sort((a, b) => a.Id.localeCompare(b.Id));
  must(isDeepStrictEqual(sorted(before), sorted(previous.lists.value)), 'BEFORE');
  must(row.Id === intent.listId && row.Title === post.list.Title && row.Description === post.list.Description &&
    row.BaseTemplate === 100 && row.RootFolder?.ServerRelativeUrl === post.list.RootFolder.ServerRelativeUrl, 'TARGET');
  exact(row.fields, ['value']);
  // Do not silently adopt a replacement field, hidden default, extra custom
  // column or partial field feed during later fixture reconciliation.
  must(isDeepStrictEqual(row.fields.value, post.fields.feed.value), 'FIELDS');
  exact(current, ['observedAt', 'responseAt', 'currentUser']);
  exact(current.responseAt, ['identity', 'list', 'acl', 'rows', 'fields']);
  exact(current.currentUser, ['Id', 'PrincipalType', 'IsSiteAdmin']);
  must(current.currentUser.Id === intent.operatorId && current.currentUser.PrincipalType === 1 && current.currentUser.IsSiteAdmin === true, 'RECOVERY');
  const now = time(current.observedAt), prior = time(post.observedAt);
  for (const value of Object.values(current.responseAt)) {
    const at = time(value);
    must(at > prior && at <= now && now - at <= 120000, 'STALE');
  }
  // Timestamp consistency is not live attestation. The caller's CURRENT list,
  // ACL, rows and nine-resource guards are still independently checked by the
  // admission caller. Historical Owners-only ACL cannot satisfy that guard.
  return { state: 'REVIEWED_NATIVE_CREATION_RECONCILED', tenantWriteAllowed: false, runtimeAdmission: false,
    listId: intent.listId, evidenceCommit: '0cafed5f1a9f1962a9f34c65c9e92d1f1facd790', inputHash: accepted.inputHash };
}
module.exports = { reconcileNativeUiReceipt };
