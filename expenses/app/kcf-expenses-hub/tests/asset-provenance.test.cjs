'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { validateDerivedLogo } = require('../scripts/sync-design-assets.cjs');
const root = path.resolve(__dirname, '..');
const preview = fs.readFileSync(path.resolve(root, '../../design/preview/KCF_Expenses_Design_Review_v3.html'), 'utf8');
const approved = fs.readFileSync(path.join(root, 'src/assets/foundation-logo.png'));

test('Asset preparation accepts only exact approved derived crest bytes', () => {
  assert.deepEqual(validateDerivedLogo(preview, approved), approved);
  assert.deepEqual(validateDerivedLogo(preview), approved);
});
test('A different genuine PNG and corrupted bytes cannot replace the crest', () => {
  const otherPng = fs.readFileSync(path.join(root, 'src/webparts/kcfExpensesHub/assets/welcome-dark.png'));
  assert.throws(() => validateDerivedLogo(preview, otherPng), /differs/);
  const altered = Buffer.from(approved); altered[altered.length - 1] ^= 1;
  assert.throws(() => validateDerivedLogo(preview, altered), /differs/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'src/assets/foundation-logo.png')), approved);
});
test('Missing or altered preview provenance is rejected', () => {
  assert.throws(() => validateDerivedLogo('<header>No embedded PNG</header>'), /missing/);
  assert.throws(() => validateDerivedLogo('<header><img src="data:image/png;base64,aW52YWxpZA==" /></header>'), /provenance changed/);
});
test('CLI rejects a substituted PNG before writing any generated source', () => {
  const base = path.join(root, '.tools/asset-sync-tests');
  fs.mkdirSync(base, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(base, 'negative-'));
  const workspace = fs.realpathSync(root);
  const resolvedFixture = fs.realpathSync(fixtureRoot);
  assert.ok(resolvedFixture.startsWith(workspace + path.sep), 'Temporary fixture remains inside the app workspace');
  try {
    const fixtureApp = path.join(fixtureRoot, 'app/asset-sync-fixture');
    fs.mkdirSync(path.join(fixtureApp, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'design/data'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'design/preview'), { recursive: true });
    fs.mkdirSync(path.join(fixtureRoot, 'public/assets'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts/sync-design-assets.cjs'), path.join(fixtureApp, 'scripts/sync-design-assets.cjs'));
    fs.copyFileSync(path.resolve(root, '../../design/data/nominals_approved_195.json'), path.join(fixtureRoot, 'design/data/nominals_approved_195.json'));
    fs.writeFileSync(path.join(fixtureRoot, 'design/preview/KCF_Expenses_Design_Review_v3.html'), preview);
    fs.copyFileSync(path.join(root, 'src/webparts/kcfExpensesHub/assets/welcome-dark.png'), path.join(fixtureRoot, 'public/assets/foundation-logo.png'));
    const result = spawnSync(process.execPath, ['scripts/sync-design-assets.cjs'], { cwd: fixtureApp, encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /differs from approved/);
    assert.equal(fs.existsSync(path.join(fixtureApp, 'src')), false, 'No partial generated output');
  } finally {
    // Resolve/check the exact deletion target immediately before recursive cleanup.
    const target = fs.realpathSync(fixtureRoot);
    assert.ok(target.startsWith(workspace + path.sep));
    fs.rmSync(target, { recursive: true, force: true });
  }
});
