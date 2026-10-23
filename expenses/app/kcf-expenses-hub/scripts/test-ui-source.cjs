'use strict';
// Source regression fallback when protected native generated outputs cannot be
// rebuilt. Same installed TS options + Heft Jest configuration; fresh OS temp.
// NOT a Heft/package/viewport/deployment result. Run strict noEmit separately.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const { runCLI } = require('@jest/core');
const { Terminal, ConsoleTerminalProvider } = require('@rushstack/terminal');
const root = path.resolve(__dirname, '..');
const JestPlugin = require(path.join(root, 'node_modules/@rushstack/heft-jest-plugin/lib-commonjs/JestPlugin.js')).default;
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'kcf-source-ui-'));
const parsed = ts.getParsedCommandLineOfConfigFile(path.join(root, 'tsconfig.json'), {}, {
  ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => { throw new Error('TSCONFIG_INVALID'); }
});
function emit(relative = '') {
  for (const entry of fs.readdirSync(path.join(root, 'src', relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name); const source = path.join(root, 'src', name);
    if (entry.isDirectory()) { emit(name); continue; }
    if (name.endsWith('.d.ts')) continue;
    const target = path.join(output, name.replace(/\.tsx?$/, '.js'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (/\.tsx?$/.test(name)) fs.writeFileSync(target, ts.transpileModule(fs.readFileSync(source, 'utf8'), {
      fileName: source, compilerOptions: { ...parsed.options, module: ts.ModuleKind.CommonJS, declaration: false, sourceMap: false }
    }).outputText);
    else fs.copyFileSync(source, target);
  }
}
(async () => {
  emit();
  const config = await JestPlugin._getJestConfigurationLoader(root, 'config/jest.config.json')
    .loadConfigurationFileForProjectAsync(new Terminal(new ConsoleTerminalProvider()), root);
  Object.assign(config, { rootDir: root, roots: [output], testMatch: ['**/*.test.js'],
    modulePaths: [path.join(root, 'node_modules')], cache: false, cacheDirectory: path.join(output, '.cache'),
    collectCoverage: false, reporters: ['default'], coverageDirectory: path.join(output, '.coverage') });
  console.log('Source-only ES5/CommonJS + configured jsdom; output:', output);
  const { results } = await runCLI({ config: JSON.stringify(config), runInBand: true, collectCoverage: false,
    ...(process.argv[2] ? { testPathPatterns: [process.argv[2]] } : {}) }, [root]);
  console.log(JSON.stringify({ output, total: results.numTotalTests, passed: results.numPassedTests, failed: results.numFailedTests, nativeBuild: false }));
  process.exitCode = results.success ? 0 : 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
