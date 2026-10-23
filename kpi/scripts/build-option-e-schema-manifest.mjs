import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaSourcePath = resolve(projectRoot,
  'src/webparts/performanceHub/services/OptionEWorkplanPhysicalSchema.ts');

const loadPhysicalSchema = () => {
  const source = readFileSync(schemaSourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true
    },
    fileName: schemaSourcePath,
    reportDiagnostics: true
  });
  const diagnostics = transpiled.diagnostics || [];
  if (diagnostics.length) {
    const details = diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    throw new Error(`Option-E schema transpilation failed: ${details.join(' ')}`);
  }
  const module = { exports: {} };
  const execute = new Function('module', 'exports', 'require', transpiled.outputText);
  execute(module, module.exports, () => { throw new Error('Option-E physical schema must remain dependency-free.'); });
  return module.exports;
};

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = stableValue(value[key]);
      return result;
    }, {});
  }
  return value;
};

const stableJson = value => `${JSON.stringify(stableValue(value), null, 2)}\n`;

const schemaModule = loadPhysicalSchema();
const schemaErrors = schemaModule.validateOptionEPhysicalSchema(schemaModule.OPTION_E_WORKPLAN_SCHEMA);
if (schemaErrors.length) throw new Error(schemaErrors.join(' '));

const manifest = {
  contractVersion: schemaModule.OPTION_E_SCHEMA_CONTRACT_VERSION,
  tenantNeutral: true,
  applyAuthorised: false,
  storeCount: schemaModule.OPTION_E_WORKPLAN_SCHEMA.length,
  stores: schemaModule.OPTION_E_WORKPLAN_SCHEMA,
  draft: {
    schemaVersion: schemaModule.OPTION_E_DRAFT_SCHEMA_VERSION,
    employeeWritableUntrustedFields: schemaModule.OPTION_E_DRAFT_EMPLOYEE_WRITABLE_FIELDS,
    exactEtagRequired: true,
    wildcardIfMatchProhibited: true
  },
  migration: {
    existingStores: schemaModule.OPTION_E_WORKPLAN_SCHEMA.filter(store => store.existingAsset).map(store => store.title),
    actions: schemaModule.OPTION_E_WORKPLAN_SCHEMA.flatMap(store => store.fields.map(field => ({
      store: store.title, field: field.internalName, action: field.action, id: field.id
    }))),
    canonicalReadbackCount: 2,
    exactEtagBackfillAndReadbackBeforeRouteEnable: true,
    preservesUnrelatedFieldsAndLegacyRows: true
  },
  submitOperationCheckpoints: schemaModule.OPTION_E_OPERATION_CHECKPOINTS,
  security: {
    privateRoots: schemaModule.OPTION_E_PRIVATE_ROOTS,
    nativeRoles: schemaModule.OPTION_E_NATIVE_ROLES,
    recoveryRole: schemaModule.OPTION_E_RECOVERY_ROLE,
    contentProcessorMasks: schemaModule.OPTION_E_CONTENT_PROCESSOR_MASKS,
    aclReconcilerMasks: schemaModule.OPTION_E_ACL_RECONCILER_MASKS,
    aclReconcilerHasNoAuditAssignment: true,
    broadVisitorsMembersProhibited: true,
    processorAndRecoveryNoLockoutRequired: true,
    hierarchySequence: ['RevokeFormerManager', 'VerifyFormerManagerDenied', 'GrantCurrentManager', 'VerifyCurrentManagerRead'],
    readyManagerViewOnly: true,
    defaultFormMutationDisabled: true
  },
  rollback: {
    configurationAndPermissionReversalOnly: true,
    deleteListsFieldsItemsFilesSnapshotsAudit: false,
    evidencePreserved: true
  }
};

if (manifest.storeCount !== 7) throw new Error(`Expected seven Option-E stores; found ${manifest.storeCount}.`);
const fieldCount = manifest.stores.reduce((total, store) => total + store.fields.length, 0);
const newStoreFieldCount = manifest.stores.filter(store => !store.existingAsset)
  .reduce((total, store) => total + store.fields.length, 0);
if (fieldCount !== 98 || newStoreFieldCount !== 59 || fieldCount - newStoreFieldCount !== 39) {
  throw new Error(`Expected 98 contracted fields (59 new-store and 39 existing-store); found ${fieldCount}.`);
}
if (manifest.stores.filter(store => store.createIfMissing).length !== 4) {
  throw new Error('Expected exactly four createable Option-E stores and three governed existing assets.');
}
if (manifest.stores.some(store => !store.enableVersioning || !store.privateRoot
  || !store.defaultFormMutationDisabled || store.retention !== 'NoAutomaticDeletion')) {
  throw new Error('Every Option-E store must be versioned, private, form-disabled and non-destructive.');
}

const first = stableJson(manifest);
const second = stableJson(manifest);
if (first !== second) throw new Error('Option-E manifest generation is not deterministic.');
const sha256 = createHash('sha256').update(first, 'utf8').digest('hex');

const args = process.argv.slice(2);
const check = args.includes('--check');
const outIndex = args.indexOf('--out');
if (outIndex >= 0) {
  const outputPath = args[outIndex + 1];
  if (!outputPath) throw new Error('--out requires a file path.');
  const resolvedOutput = resolve(outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, first, 'utf8');
  process.stdout.write(`Option-E schema manifest written: ${resolvedOutput}\n`);
}
if (check || outIndex < 0) {
  process.stdout.write(`Option-E schema manifest PASS: stores=${manifest.storeCount}; sha256=${sha256}; bytes=${Buffer.byteLength(first, 'utf8')}\n`);
}
