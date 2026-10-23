'use strict';
// Executes the actual TypeScript domain/service source offline. This strips types;
// it is NOT a TypeScript typecheck, React render, Heft build or SharePoint test.
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
if (typeof stripTypeScriptTypes !== 'function') throw new Error('Domain tests require Node with stripTypeScriptTypes (pinned Node 22.21.1 or diagnostic Node 24).');
const files = ['domain/contracts.ts', 'domain/expenseRules.ts', 'services/MockExpensesService.ts', 'services/MockMileageService.ts', 'domain/mileage.ts', 'data/nominals.ts'];
for (const relative of files) {
  const source = fs.readFileSync(path.join(root, 'src', relative), 'utf8');
  const js = stripTypeScriptTypes(source, { mode: 'strip' }).replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g, '$1$2.mjs$3');
  const target = path.join(root, '.tools/domain-tests', relative.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, js);
}
console.log(`Offline mock/domain tests on Node ${process.versions.node}. Native SPFx build credit: NONE.`);
const result = spawnSync(process.execPath, ['--test', 'tests/expense-domain.test.mjs', 'tests/palette.test.cjs', 'tests/dependency-security.test.cjs', 'tests/asset-provenance.test.cjs'], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
