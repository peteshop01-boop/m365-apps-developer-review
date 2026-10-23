import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(folder, '..', '..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const moduleCache = new Map();
const src = path.join(root, 'src/webparts/performanceHub');
const load = filename => {
  filename = path.resolve(filename); if (moduleCache.has(filename)) return moduleCache.get(filename);
  if (!filename.startsWith(src + path.sep)) throw Error('Source outside bounded domain');
  const exports = {}; moduleCache.set(filename, exports);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const scopedRequire = name => name.startsWith('.') ? load(path.resolve(path.dirname(filename), name + '.ts')) : require(name);
  vm.runInThisContext(`(function(exports,require){${code}\n})`, { filename })(exports, scopedRequire);
  return exports;
};
const contract = load(path.join(src, 'services/OptionEWorkplanSubmitExactBodyV4PackageContract.ts'));
const fixture = contract.v4Fixture(); contract.validateV4Fixture(fixture);
const sha = value => createHash('sha256').update(value).digest('hex').toUpperCase();
const files = [
  'models/OptionEWorkplanSubmitExactBodyV4Models.ts', 'services/OptionEWorkplanSubmitExactBodyV4Wire.ts',
  'services/OptionEWorkplanSubmitExactBodyV4.ts', 'services/OptionEWorkplanSubmitExactBodyV4PackageContract.ts',
  'models/OptionEWorkplanDraftModels.ts', 'models/OptionEWorkplanSubmitModels.ts'
];
const sourceInventory = files.map(relative => ({ path: 'src/webparts/performanceHub/' + relative, sha256: sha(fs.readFileSync(path.join(src, relative))) }));
const binding = { state: 'Unbound', capability: fixture.declaration.capability, storageEvidence: null, hostParityEvidence: null, installedReady: 'NOT_ADMITTED',
  required: ['Separately versioned v4 native storage', 'Protected host origin', 'Standard hosted complete wire parity', 'Independent gates', 'Native least privilege and immutable history'] };
const outputs = { 'exact-body-v4.disabled.fixture.json': fixture, 'exact-body-v4.binding.template.json': binding };
const manifest = { purpose: 'SourceDeclarationOnly', enabled: false, installedReady: 'NOT_ADMITTED', sourceInventory,
  generator: { path: 'Tools/build-option-e-exactbody-v4.mjs', sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))) },
  files: Object.entries(outputs).map(([name, body]) => ({ path: name, sha256: sha(JSON.stringify(body, null, 2) + '\n') })) };
outputs['exact-body-v4.manifest.json'] = manifest;
for (const [name, value] of Object.entries(outputs)) {
  const text = JSON.stringify(value, null, 2) + '\n'; const target = path.join(folder, name);
  if (process.argv.includes('--check')) { if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== text) throw Error('Fixture drift: ' + name); }
  else fs.writeFileSync(target, text);
}
console.log(JSON.stringify({ result: 'PASS', purpose: manifest.purpose, guards: Object.keys(fixture.declaration.guards).length, installedReady: 'NOT_ADMITTED', files: Object.keys(outputs) }));
