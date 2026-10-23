'use strict';
// Committed, independently reviewed HISTORICAL evidence. No live capture or HTTP201.
const fs = require('node:fs'), path = require('node:path');
const base = path.resolve(__dirname, '../../../docs/evidence/EXP01_OWNER_ONLY_METADATA_20261022');
const files = {
  intent: 'normalized-before/intent.json', before: 'normalized-before/before.json',
  pre: 'normalized-before/snapshot.json', post: 'normalized-after/snapshot.json',
  creation: 'creation-provenance/CREATE_READBACK.json',
  security: 'independent-security/COLUMNS_FINAL_NATIVE_PROOF_SUPPLEMENT.md',
  qa: 'independent-qa/FINAL_METADATA_QA.md'
};
function evidence() { return Object.fromEntries(Object.entries(files).map(([k, p]) => [k, fs.readFileSync(path.join(base, p), 'utf8')])); }
function receipt() { return { key: 'months', method: 'reviewed-native-ui-v1', evidence: evidence() }; }
module.exports = { evidence, receipt };
