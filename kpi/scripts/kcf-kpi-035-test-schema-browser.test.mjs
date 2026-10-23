import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

await import('./kcf-kpi-035-test-schema-browser.js');

const schema = globalThis.KcfKpi035Schema;

test('KPI035-SCH-001 fixes the exact eleven-list TEST boundary', () => {
  assert.deepEqual(schema.MANAGED_ASSETS.map(asset => `KCFKPI_TEST_${asset.suffix}`), [
    'KCFKPI_TEST_People', 'KCFKPI_TEST_Workplans', 'KCFKPI_TEST_WorkplanItems',
    'KCFKPI_TEST_QuarterReviews', 'KCFKPI_TEST_QuarterReviewItems',
    'KCFKPI_TEST_ProgressNotes', 'KCFKPI_TEST_Evidence', 'KCFKPI_TEST_Audit',
    'KCFKPI_TEST_EmployeeCommands', 'KCFKPI_TEST_ManagerCommands',
    'KCFKPI_TEST_CommandReceipts'
  ]);
});

test('KPI035-SCH-002 includes the accepted 033 Behaviour fields', () => {
  const fields = schema.SEC006_ADDITIONS.WorkplanItems.map(field => field.name);
  assert.ok(fields.includes('BehaviourSelectedSuggestionKeysJson'));
  assert.ok(fields.includes('BehaviourCustomObjective'));
  const longName = schema.SEC006_ADDITIONS.WorkplanItems.find(field => field.name === 'BehaviourSelectedSuggestionKeysJson');
  assert.equal(longName.internalName, 'BehaviourSelectedSuggestionKeysJ');
  assert.equal(longName.staticName, 'BehaviourSelectedSuggestionKeysJson');
});

test('KPI035-SCH-003 includes the complete accepted SEC-006 additive contract', () => {
  assert.equal(schema.SEC006_ADDITIONS.Workplans.length, 2);
  assert.equal(schema.SEC006_ADDITIONS.WorkplanItems.length, 26);
  assert.equal(schema.SEC006_ADDITIONS.QuarterReviewItems.length, 1);
  assert.equal(schema.RECEIPT_FIELDS.length, 24);
  assert.deepEqual(schema.RECEIPT_FIELDS.filter(field => field.unique).map(field => field.name), ['ReceiptKey']);
  for (const name of ['SourceListId', 'SourceItemId', 'SourceItemVersion']) {
    assert.ok(schema.RECEIPT_FIELDS.some(field => field.name === name));
  }
});

test('KPI035-SCH-004 is parameterised and rejects canonical/self targeting', () => {
  const custom = schema.normaliseOptions({
    siteUrl: 'https://example.invalid/sites/KCF-Sandbox',
    sourcePrefix: 'KCFKPI_', targetPrefix: 'KCFKPI_UAT_'
  });
  assert.equal(custom.targetPrefix, 'KCFKPI_UAT_');
  assert.throws(() => schema.normaliseOptions({ siteUrl: custom.siteUrl, sourcePrefix: 'KCFKPI_', targetPrefix: 'KCFKPI_' }), /must differ/);
  assert.throws(() => schema.normaliseOptions({ siteUrl: 'http://127.0.0.1/test', sourcePrefix: 'KCFKPI_', targetPrefix: 'KCFKPI_TEST_' }), /governed HTTPS/);
});

test('KPI035-SCH-004 can reuse the exported contract on a different site and prefix', () => {
  const manifest = {
    targetPrefix: 'KCFKPI_TEST_',
    physicalNameMapping: {
      acceptedName: 'BehaviourSelectedSuggestionKeysJson',
      sharePointInternalName: 'BehaviourSelectedSuggestionKeysJ'
    },
    lists: [{
      title: 'KCFKPI_TEST_WorkplanItems', baseTemplate: 100,
      fields: [
        { displayName: 'Title', internalName: 'Title', staticName: 'Title', type: 'Text', required: false, indexed: false, unique: false, choices: [] },
        { displayName: 'BehaviourSelectedSuggestionKeysJson', internalName: 'BehaviourSelectedSuggestionKeysJ', staticName: 'BehaviourSelectedSuggestionKeysJson', type: 'Note', required: false, indexed: false, unique: false, choices: [] }
      ]
    }]
  };
  const contract = schema.contractFromManifest(manifest, { suffix: 'WorkplanItems', baseTemplate: 100 });
  assert.equal(contract.fields[0].name, 'BehaviourSelectedSuggestionKeysJson');
  assert.equal(contract.fields[0].internalName, 'BehaviourSelectedSuggestionKeysJ');
});

test('KPI035-SCH-006 uses deterministic isolated TEST field IDs and safe XML', async () => {
  const one = await schema.deterministicGuid('KCFKPI_TEST_Workplans.WorkplanKey');
  const two = await schema.deterministicGuid('KCFKPI_TEST_Workplans.WorkplanKey');
  const other = await schema.deterministicGuid('KCFKPI_TEST_WorkplanItems.WorkplanKey');
  assert.equal(one, two);
  assert.notEqual(one, other);
  const xml = await schema.fieldSchemaXml('KCFKPI_TEST_Workplans', {
    name: 'WorkplanKey', type: 'Text', required: true, indexed: true, unique: true
  });
  assert.match(xml, /Group="KCF KPI TEST"/);
  assert.doesNotMatch(xml, /SourceID|ColName|RowOrdinal/);
  const longXml = await schema.fieldSchemaXml('KCFKPI_TEST_WorkplanItems', {
    name: 'BehaviourSelectedSuggestionKeysJson',
    internalName: 'BehaviourSelectedSuggestionKeysJ',
    staticName: 'BehaviourSelectedSuggestionKeysJson',
    type: 'Note'
  });
  assert.match(longXml, /Name="BehaviourSelectedSuggestionKeysJ"/);
  assert.match(longXml, /StaticName="BehaviourSelectedSuggestionKeysJson"/);
});

test('KPI035-SCH-009 provisions no synthetic or real rows', async () => {
  const source = await readFile(new URL('./kcf-kpi-035-test-schema-browser.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\/items(?:\?|\(|')/);
  assert.doesNotMatch(source, /ListItemEntityTypeFullName/);
});

test('KPI035-SCH-011 exposes an exact canonical before/after comparator', () => {
  const snapshot = { canonicalListCount: 1, lists: [{ id: '1', title: 'KCFKPI_One', baseTemplate: 100, itemCount: 0, modified: 'x', uniquePermissions: false, hidden: false, url: '/x', fields: [] }] };
  assert.equal(schema.compareCanonical(snapshot, structuredClone(snapshot)).pass, true);
  const changed = structuredClone(snapshot);
  changed.lists[0].itemCount = 1;
  assert.equal(schema.compareCanonical(snapshot, changed).pass, false);
});
