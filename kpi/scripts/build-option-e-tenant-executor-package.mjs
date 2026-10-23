import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import JSZip from 'jszip';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const plannerContractVersion = 'KCF-KPI-OPTION-E-TENANT-EXECUTOR-V2';
const executorVersion = 'KCF-KPI-OPTION-E-TENANT-EXECUTOR-V2-R7';
const schemaVersion = 'KCF-KPI-B13-OPTION-E-V3';
const artifactBase = executorVersion;
const fixedDate = new Date(1980, 0, 1, 0, 0, 0);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      if (value[key] !== undefined) result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
};
const stableJson = value => `${JSON.stringify(stableValue(value), null, 2)}\n`;

const sourceFiles = [
  'src/webparts/performanceHub/services/OptionEWorkplanPhysicalSchema.ts',
  'src/webparts/performanceHub/services/OptionEWorkplanAclPlan.ts',
  'src/webparts/performanceHub/services/provisioning/OptionEWorkplanProvisioner.ts',
  'src/webparts/performanceHub/services/provisioning/OptionEWorkplanTenantExecutionPlan.ts',
  'tools/option-e-tenant-executor/Invoke-KcfOptionETenantExecutor.ps1',
  'tools/option-e-tenant-executor/Kcf.OptionE.TenantExecutor.psm1',
  'tools/option-e-tenant-executor/Contract/option-e-execution-input.schema.json',
  'tools/option-e-tenant-executor/Contract/option-e-authorisation.schema.json',
  'scripts/build-option-e-tenant-executor-package.mjs',
  'package.json',
  'package-lock.json'
];
const compileTargets = [
  ['src/webparts/performanceHub/services/OptionEWorkplanPhysicalSchema.ts', 'lib/OptionEWorkplanPhysicalSchema.js'],
  ['src/webparts/performanceHub/services/OptionEWorkplanAclPlan.ts', 'lib/OptionEWorkplanAclPlan.js'],
  ['src/webparts/performanceHub/services/provisioning/OptionEWorkplanProvisioner.ts', 'lib/provisioning/OptionEWorkplanProvisioner.js'],
  ['src/webparts/performanceHub/services/provisioning/OptionEWorkplanTenantExecutionPlan.ts',
    'lib/provisioning/OptionEWorkplanTenantExecutionPlan.js']
];

const transpile = relativePath => {
  const absolute = resolve(projectRoot, relativePath);
  const source = readFileSync(absolute, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
      strict: true,
      removeComments: false,
      newLine: ts.NewLineKind.LineFeed
    },
    fileName: absolute,
    reportDiagnostics: true
  });
  const diagnostics = result.diagnostics || [];
  if (diagnostics.length) {
    const details = diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'));
    throw new Error(`${relativePath} transpilation failed: ${details.join(' ')}`);
  }
  return Buffer.from(result.outputText.replace(/\r\n/g, '\n'), 'utf8');
};

const planCli = Buffer.from(`'use strict';
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const planner = require('./provisioning/OptionEWorkplanTenantExecutionPlan.js');
const args = process.argv.slice(2);
const value = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const inputPath = value('--input');
const outputPath = value('--out');
if (!inputPath || !outputPath) throw new Error('Usage: plan-cli.cjs --input <execution-input.json> --out <plan.json>');
const input = JSON.parse(readFileSync(inputPath, 'utf8'));
const canonical = planner.optionECanonicalJson(input);
const inputSha256 = createHash('sha256').update(canonical, 'utf8').digest('hex').toUpperCase();
const plan = planner.buildOptionETenantExecutionPlan(input, inputSha256);
writeFileSync(outputPath, JSON.stringify(planner.optionECanonicalValue(plan), null, 2) + '\\n', 'utf8');
process.stdout.write(JSON.stringify({ executorVersion: plan.executorVersion, inputSha256, mutationCount: plan.mutationCount }) + '\\n');
`, 'utf8');

const loadPhysicalSchema = () => {
  const bytes = transpile(compileTargets[0][0]);
  const module = { exports: {} };
  const execute = new Function('module', 'exports', 'require', bytes.toString('utf8'));
  execute(module, module.exports, () => { throw new Error('Physical schema must remain dependency-free.'); });
  return module.exports;
};

const buildEntries = () => {
  const entries = new Map();
  compileTargets.forEach(([source, target]) => entries.set(target, transpile(source)));
  entries.set('lib/plan-cli.cjs', planCli);
  entries.set('Invoke-KcfOptionETenantExecutor.ps1', readFileSync(resolve(projectRoot,
    'tools/option-e-tenant-executor/Invoke-KcfOptionETenantExecutor.ps1')));
  entries.set('Kcf.OptionE.TenantExecutor.psm1', readFileSync(resolve(projectRoot,
    'tools/option-e-tenant-executor/Kcf.OptionE.TenantExecutor.psm1')));
  entries.set('Contract/option-e-execution-input.schema.json', readFileSync(resolve(projectRoot,
    'tools/option-e-tenant-executor/Contract/option-e-execution-input.schema.json')));
  entries.set('Contract/option-e-authorisation.schema.json', readFileSync(resolve(projectRoot,
    'tools/option-e-tenant-executor/Contract/option-e-authorisation.schema.json')));
  entries.set('README.txt', Buffer.from([
    executorVersion,
    'TEST site only. Plan and Readback never mutate.',
    'Apply and Rollback require an exact one-time authorisation no longer than 120 minutes.',
    'PnP.PowerShell 3.2.0 is the only supported SharePoint REST transport.',
    'No application upload, installation, tenant-wide route, external messaging or release action is included.',
    ''
  ].join('\n'), 'utf8'));
  return entries;
};

const validateContract = () => {
  const schema = loadPhysicalSchema();
  const errors = schema.validateOptionEPhysicalSchema(schema.OPTION_E_WORKPLAN_SCHEMA);
  if (errors.length) throw new Error(errors.join(' '));
  const stores = schema.OPTION_E_WORKPLAN_SCHEMA;
  const fieldCount = stores.reduce((sum, item) => sum + item.fields.length, 0);
  const uniqueCount = stores.reduce((sum, item) => sum + item.fields.filter(field => field.enforceUniqueValues).length, 0);
  if (schema.OPTION_E_SCHEMA_CONTRACT_VERSION !== schemaVersion || stores.length !== 7
    || fieldCount !== 98 || uniqueCount !== 10 || schema.OPTION_E_NATIVE_ROLES.length !== 5
    || schema.OPTION_E_NATIVE_ROLES.some(role => role.roleTypeKind !== 0)
    || schema.OPTION_E_RECOVERY_ROLE.roleTypeKind !== 5) {
    throw new Error('Compiled pure schema does not match the V3 seven-store/98-field/10-uniqueness/five-custom-role contract.');
  }
  return { storeCount: stores.length, fieldCount, uniqueCount, customRoleCount: schema.OPTION_E_NATIVE_ROLES.length };
};

const buildPackage = async outRoot => {
  const contractCounts = validateContract();
  const entries = buildEntries();
  const sources = sourceFiles.map(path => {
    const bytes = readFileSync(resolve(projectRoot, path));
    return { path, bytes: bytes.length, sha256: sha256(bytes) };
  });
  const entryInventory = Array.from(entries.entries()).map(([path, bytes]) => ({
    path, bytes: bytes.length, sha256: sha256(bytes)
  })).sort((a, b) => a.path.localeCompare(b.path));
  const inputSchema = entries.get('Contract/option-e-execution-input.schema.json');
  const authorisationSchema = entries.get('Contract/option-e-authorisation.schema.json');
  JSON.parse(inputSchema.toString('utf8'));
  JSON.parse(authorisationSchema.toString('utf8'));
  const manifest = {
    executorVersion,
    plannerContractVersion,
    schemaVersion,
    bindingVersion: 'KCF-KPI-B13-02-PACKAGE-2-INTEGRATION-V1',
    defaultMode: 'Plan',
    applyAuthorisedByDefault: false,
    target: {
      siteUrl: 'https://example.invalid/sites/REVIEW-TEST-SITE',
      webId: '4ebc956f-bc50-42e0-ac05-59a032569075',
      environmentLabel: 'REVIEW-TEST-SITE-TEST',
      powerPlatformEnvironmentId: null
    },
    transport: { module: 'PnP.PowerShell', version: '3.2.0', boundary: 'SharePoint REST' },
    authorisation: { oneTime: true, maximumLifetimeMinutes: 120, immutableInputHashBound: true },
    counts: contractCounts,
    hashes: {
      inputSchemaSha256: sha256(inputSchema),
      authorisationSchemaSha256: sha256(authorisationSchema),
      sppkgRequiredSha256: '7C1AB40135BD98CAE6B6C87BC30DDD4AABDDC0BE95F9B8732D354702834607C6'
    },
    rollback: { receiptLimited: true, destructiveSchemaOrDataRemoval: false },
    sources,
    entries: entryInventory
  };
  const manifestBytes = Buffer.from(stableJson(manifest), 'utf8');
  entries.set('manifest.json', manifestBytes);
  const zip = new JSZip();
  for (const [path, bytes] of Array.from(entries.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    zip.file(path, bytes, {
      binary: true,
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
      createFolders: false,
      date: fixedDate
    });
  }
  const zipBytes = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    platform: 'DOS',
    streamFiles: false
  });
  const output = resolve(projectRoot, outRoot);
  mkdirSync(output, { recursive: true });
  const zipPath = resolve(output, `${artifactBase}.zip`);
  const manifestPath = resolve(output, `${artifactBase}.manifest.json`);
  const hashPath = resolve(output, `${artifactBase}.sha256`);
  writeFileSync(zipPath, zipBytes);
  writeFileSync(manifestPath, manifestBytes);
  writeFileSync(hashPath, `${sha256(zipBytes)}  ${artifactBase}.zip\n`, 'utf8');
  return {
    zipPath,
    manifestPath,
    hashPath,
    zipSha256: sha256(zipBytes),
    zipBytes: zipBytes.length,
    manifestSha256: sha256(manifestBytes),
    inputSchemaSha256: manifest.hashes.inputSchemaSha256,
    authorisationSchemaSha256: manifest.hashes.authorisationSchemaSha256,
    entryCount: entries.size
  };
};

const args = process.argv.slice(2);
const argValue = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const planInput = argValue('--plan');
if (planInput) {
  const planOutput = argValue('--plan-out');
  if (!planOutput) throw new Error('--plan requires --plan-out.');
  const compiled = new Map(compileTargets.map(([source, target]) => [target, transpile(source)]));
  const modules = new Map();
  const executeModule = name => {
    if (modules.has(name)) return modules.get(name).exports;
    const bytes = compiled.get(name);
    if (!bytes) throw new Error(`Compiled module not found: ${name}`);
    const module = { exports: {} };
    modules.set(name, module);
    const base = name.slice(0, name.lastIndexOf('/') + 1);
    const localRequire = request => {
      if (!request.startsWith('.')) return require(request);
      const normalised = posix.normalize(posix.join(base, request));
      const candidate = normalised.endsWith('.js') ? normalised : `${normalised}.js`;
      return executeModule(candidate);
    };
    new Function('module', 'exports', 'require', bytes.toString('utf8'))(module, module.exports, localRequire);
    return module.exports;
  };
  const planner = executeModule('lib/provisioning/OptionEWorkplanTenantExecutionPlan.js');
  const input = JSON.parse(readFileSync(resolve(planInput), 'utf8'));
  const canonical = planner.optionECanonicalJson(input);
  const inputSha256 = sha256(Buffer.from(canonical, 'utf8'));
  const plan = planner.buildOptionETenantExecutionPlan(input, inputSha256);
  writeFileSync(resolve(planOutput), stableJson(plan), 'utf8');
  process.stdout.write(`${stableJson({ executorVersion: plannerContractVersion, inputSha256, mutationCount: plan.mutationCount })}`);
} else {
  const out = argValue('--out') || 'dist/option-e-tenant-executor';
  process.stdout.write(stableJson(await buildPackage(out)));
}
