'use strict';
// Source-only runner. Reads an existing pinned toolchain, writes ONLY this
// worktree's ignored .tools directory. No install, Heft/package or tenant credit.
// Usage: node scripts/test-mileage-offline.cjs <installed-node_modules> [--baseline|--focused|--typecheck]
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const dependencies = path.resolve(process.argv[2] || path.join(root, 'node_modules'));
const installed = createRequire(path.join(dependencies, '__offline_resolver__.cjs'));
const ts = installed('typescript');
if (process.versions.node !== '22.21.1' || ts.version !== '5.8.3') throw new Error('Use pinned Node 22.21.1 and TypeScript 5.8.3.');
for (const [name, version] of [['react', '17.0.1'], ['react-dom', '17.0.1'], ['@microsoft/sp-core-library', '1.23.2']]) {
  if (installed(`${name}/package.json`).version !== version) throw new Error(`Pinned dependency mismatch: ${name}`);
}
const mode = process.argv.includes('--typecheck') ? 'typecheck' : process.argv.includes('--baseline') ? 'baseline' : process.argv.includes('--focused') ? 'focused' : 'all';
const parent = path.join(root, '.tools/mileage-offline');
fs.mkdirSync(parent, { recursive: true });
const output = fs.mkdtempSync(path.join(parent, `${mode}-`));
function walk(folder) { return fs.readdirSync(folder, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(folder, e.name)) : [path.join(folder, e.name)]); }
const source = path.join(root, 'src');
const files = walk(source).filter(f => /\.tsx?$/.test(f));
const hashes = files.map(f => ({ file: path.relative(root, f).replace(/\\/g, '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') }));
fs.writeFileSync(path.join(output, 'source-hashes.json'), JSON.stringify(hashes, null, 2));
console.log(`Offline ${mode}: Node ${process.versions.node}; TypeScript ${ts.version}; installed dependencies read from ${dependencies}; evidence ${output}`);
if (mode === 'typecheck') {
  const sharedApp = path.dirname(dependencies);
  const generated = ['sass-ts', 'static-asset-ts', 'loc-ts'].map(d => path.join(sharedApp, 'temp', d)).filter(d => fs.existsSync(d));
  const options = { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Node10,
    jsx: ts.JsxEmit.React, strict: true, noImplicitReturns: true, noFallthroughCasesInSwitch: true, noEmit: true,
    skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, experimentalDecorators: true,
    lib: ['lib.es2017.d.ts', 'lib.dom.d.ts'], types: ['jest', 'webpack-env'], typeRoots: [path.join(dependencies, '@types')],
    baseUrl: root, paths: { '*': [path.join(dependencies, '*'), path.join(dependencies, '@types', '*')] }, rootDirs: [source, ...generated] };
  const program = ts.createProgram(files, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const report = ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: f => f, getCurrentDirectory: () => root, getNewLine: () => '\n' });
  fs.writeFileSync(path.join(output, 'typecheck.txt'), report || 'PASS: strict noEmit across all source and native test TypeScript/TSX.\n');
  console.log(report || 'PASS: strict noEmit across all source and native test TypeScript/TSX.');
  process.exitCode = diagnostics.length ? 1 : 0;
} else {
  for (const file of files.filter(f => !f.endsWith('.d.ts'))) {
    const destination = path.join(output, 'src', path.relative(source, file).replace(/\.tsx?$/, '.js'));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2017, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText);
  }
  // Read the same custom jsdom host used by native SPFx tests. Resolve its imports
  // from the read-only installed dependencies; no shared worktree writes.
  const environment = path.join(output, 'environment.cjs');
  fs.writeFileSync(environment, fs.readFileSync(path.join(root, 'scripts/jest-browser-environment.cjs'), 'utf8')
    .replace("require('jest-environment-jsdom')", `require(${JSON.stringify(installed.resolve('jest-environment-jsdom'))})`));
  const style = path.join(output, 'style.cjs');
  fs.writeFileSync(style, "module.exports = new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) });\n");
  const asset = path.join(output, 'asset.cjs'); fs.writeFileSync(asset, "module.exports = 'offline-asset';\n");
  const { runCLI } = installed('@jest/core');
  const testMatch = mode === 'focused' ? ['**/mileageRouting.test.js'] : ['**/*.test.js'];
  runCLI({ config: JSON.stringify({ rootDir: root, roots: [path.join(output, 'src')], testMatch,
    ...(mode === 'baseline' ? { testPathIgnorePatterns: ['mileageRouting.test.js'] } : {}),
    modulePaths: [dependencies], moduleNameMapper: { '\\.scss$': style, '\\.(png|jpg|svg)$': asset },
    testEnvironment: environment, testEnvironmentOptions: { customExportConditions: ['require', 'node', 'umd'] },
    transform: {}, clearMocks: true, cache: false, cacheDirectory: path.join(output, 'cache'), collectCoverage: false }),
    runInBand: true, json: true, outputFile: path.join(output, 'results.json') }, [root])
    .then(({ results }) => { process.exitCode = results.success ? 0 : 1; })
    .catch(error => { fs.writeFileSync(path.join(output, 'runner-error.txt'), String(error)); console.error(error); process.exitCode = 1; });
}
