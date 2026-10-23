'use strict';
// Scoped source tests using installed TypeScript/Jest in a fresh output directory.
// No native package/Heft credit; avoids overwriting pre-existing generated files.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const { runCLI } = require('@jest/core');
const root = path.resolve(__dirname, '..');
const browser = process.argv.includes('--browser');
const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'kcf-persistence-check-'));
const folder = 'services/persistence';
const files = fs.readdirSync(path.join(root, 'src', folder)).filter(f => f.endsWith('.ts')).map(f => `${folder}/${f}`);
files.push('domain/expenseRules.ts', 'data/nominals.ts');
for (const file of files) {
  const output = ts.transpileModule(fs.readFileSync(path.join(root, 'src', file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS }, fileName: file
  }).outputText;
  const target = path.join(destination, file.replace(/\.ts$/, '.js'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, output);
}
console.log(`Scoped persistence tests (${browser ? 'configured jsdom browser' : 'node'}); output ${destination}; no tenant, native build or package credit.`);
runCLI({ config: JSON.stringify({ rootDir: root, roots: [destination], testMatch: ['**/*.test.js'],
  modulePaths: [path.join(root, 'node_modules')],
  testEnvironment: browser ? path.join(root, 'scripts/jest-browser-environment.cjs') : 'node',
  ...(browser ? { testEnvironmentOptions: { customExportConditions: ['require', 'node', 'umd'] } } : {}),
  transform: {}, clearMocks: true,
  cache: false, collectCoverage: false }), runInBand: true }, [root])
  .then(({ results }) => { process.exitCode = results.success ? 0 : 1; })
  .catch(() => { console.error('Scoped test runner failed.'); process.exitCode = 1; });
