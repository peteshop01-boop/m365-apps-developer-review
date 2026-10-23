import { materialiseQuarterBehaviourTarget } from '../QuarterBehaviourTargetSnapshot';
import { C2B_ANNUAL_HEADER_FIELDS, C2B_ITEM_CONCURRENCY_FIELDS }
  from './C2bPhysicalConvergenceContract';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
const tenantRoot = resolve(root, 'power-platform', 'KCFKPIEmployeeTESTProcessor', 'TenantLayer');
const packagePath = resolve(tenantRoot, 'Package', 'KCFKPIEmployeeC2bTenantLayerDisabled_1_0_1_0.zip');
const sha256 = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex').toUpperCase();

function storedZipEntries(bytes: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let offset = 0;
  while (offset + 4 <= bytes.length && bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    if (method !== 0) throw new Error('Expected deterministic stored ZIP entries.');
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    entries.set(bytes.subarray(nameStart, nameStart + nameLength).toString('utf8'),
      bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size;
  }
  return entries;
}

describe('guarded tenant generator writes in isolated fixtures', () => {
  function fixture(run: (f: { base: string; tenant: string; pin: string; generator: string;
    manifest: string; prior: string; outputs: string[] }) => void): void {
    const base = mkdtempSync(join(tmpdir(), 'kcf-kpi-guarded-generator-'));
    try {
      const processor = resolve(base, 'power-platform', 'KCFKPIEmployeeTESTProcessor');
      const tenant = resolve(processor, 'TenantLayer');
      cpSync(tenantRoot, tenant, { recursive: true });
      mkdirSync(resolve(processor, 'Definitions'), { recursive: true });
      cpSync(resolve(root, 'power-platform', 'KCFKPIEmployeeTESTProcessor', 'Definitions',
        'C2b.disabled.definition.json'), resolve(processor, 'Definitions', 'C2b.disabled.definition.json'));
      const pin = resolve(base, 'src/webparts/performanceHub/services/tenant/TenantPacketPreflight.ts');
      mkdirSync(dirname(pin), { recursive: true });
      cpSync(resolve(root, 'src/webparts/performanceHub/services/tenant/TenantPacketPreflight.ts'), pin);
      const manifest = resolve(tenant, 'tenant-layer-manifest.json');
      const prior = sha256(readFileSync(manifest));
      const entries = JSON.parse(readFileSync(manifest, 'utf8')) as { generatedFiles: Array<{ file: string }> };
      run({ base, tenant, pin, generator: resolve(tenant, 'Tools/build-tenant-layer.mjs'), manifest,
        prior, outputs: [...entries.generatedFiles.map(entry => resolve(tenant, entry.file)), manifest, pin] });
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  }
  function execute(generator: string, args: string[]): ReturnType<typeof spawnSync> {
    return spawnSync(process.execPath, [generator, ...args], { encoding: 'utf8' });
  }
  function snapshot(outputs: string[]): Array<string | undefined> {
    return outputs.map(file => existsSync(file) ? sha256(readFileSync(file)) : undefined);
  }
  function edit(file: string, transform: (text: string) => string): void {
    const prior = readFileSync(file, 'utf8');
    const next = transform(prior);
    expect(next).not.toBe(prior);
    writeFileSync(file, next, 'utf8');
  }
  it('transitions a changed contract, preserves all source bytes outside the pin and companion, and repeats identically', () => {
    fixture(f => {
      const oldSource = readFileSync(f.pin);
      const companion = readFileSync(resolve(f.tenant, 'Package/KCFKPIEmployeeC2bTenantLayerDisabled_1_0_1_0.zip'));
      edit(resolve(f.tenant, 'Tools/tenant-layer-contract.mjs'), text =>
        text.replace("text('BehaviourContractVersion', false)", "text('BehaviourContractVersion', false, { maxLength: 254 })"));
      const failedCheck = execute(f.generator, ['--check']);
      expect(failedCheck.status).not.toBe(0);
      expect(String(failedCheck.stderr)).toContain('TENANT_LAYER_EXECUTABLE_MANIFEST_IDENTITY_MISMATCH');
      const result = execute(f.generator, ['--write', '--expected-current-manifest-sha256', f.prior]);
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      const next = sha256(readFileSync(f.manifest));
      expect(next).not.toBe(f.prior);
      const offset = oldSource.indexOf(Buffer.from(f.prior));
      expect(offset).toBeGreaterThan(0);
      expect(readFileSync(f.pin)).toEqual(Buffer.concat([oldSource.subarray(0, offset),
        Buffer.from(next), oldSource.subarray(offset + 64)]));
      expect(readFileSync(resolve(f.tenant, 'Package/KCFKPIEmployeeC2bTenantLayerDisabled_1_0_1_0.zip'))).toEqual(companion);
      expect(execute(f.generator, ['--check']).status).toBe(0);
      const first = snapshot(f.outputs);
      expect(execute(f.generator, ['--write', '--expected-current-manifest-sha256', next]).status).toBe(0);
      expect(snapshot(f.outputs)).toEqual(first);
      expect(execute(f.generator, ['--check']).status).toBe(0);
    });
  });
  it.each(['missing', 'wrong', 'malformed', 'duplicate', 'unknown', 'unknown-mode', 'check-extra'])
  ('rejects %s arguments before mutation', variant => {
    fixture(f => {
      const valid = ['--write', '--expected-current-manifest-sha256', f.prior];
      const cases: Record<string, string[]> = {
        missing: ['--write'], wrong: ['--write', '--expected-current-manifest-sha256', '0'.repeat(64)],
        malformed: ['--write', '--expected-current-manifest-sha256', 'invalid'],
        duplicate: [...valid, '--expected-current-manifest-sha256', f.prior], unknown: [...valid, '--force'],
        'unknown-mode': ['--force'], 'check-extra': ['--check', '--expected-current-manifest-sha256', f.prior]
      };
      const before = snapshot(f.outputs);
      expect(execute(f.generator, cases[variant]).status).not.toBe(0);
      expect(snapshot(f.outputs)).toEqual(before);
    });
  });
  it.each(['absent-pin', 'malformed-pin', 'duplicate-pin', 'manual-pin', 'truncated-manifest',
    'altered-manifest', 'missing-inventory', 'extra-inventory', 'duplicate-inventory', 'escaping-inventory',
    'absolute-inventory', 'corrupt-output', 'missing-output', 'safety-assertion', 'personal-binding'])
  ('rejects %s before writes and preserves the fixture state', variant => {
    fixture(f => {
      let prior = f.prior;
      if (variant.endsWith('-pin')) edit(f.pin, text => {
        if (variant === 'absent-pin') return text.replace('WI_B12_TENANT_MANIFEST_SHA256', 'ABSENT_MANIFEST_PIN');
        if (variant === 'malformed-pin') return text.replace(f.prior, 'invalid');
        if (variant === 'manual-pin') return text.replace(f.prior, '0'.repeat(64));
        return `${text}\nexport const WI_B12_TENANT_MANIFEST_SHA256 = '${f.prior}' as const;\n`;
      });
      else if (variant.endsWith('-manifest') || variant.endsWith('-inventory')) {
        const manifest = JSON.parse(readFileSync(f.manifest, 'utf8')) as {
          generationEpoch: string; generatedFiles: Array<{ file: string; bytes: number; sha256: string }> };
        if (variant === 'truncated-manifest') writeFileSync(f.manifest, '{');
        else {
          if (variant === 'altered-manifest') manifest.generationEpoch = 'changed';
          if (variant === 'missing-inventory') manifest.generatedFiles.pop();
          if (variant === 'extra-inventory') manifest.generatedFiles.push({ file: 'extra', bytes: 0, sha256: f.prior });
          if (variant === 'duplicate-inventory') manifest.generatedFiles[1] = manifest.generatedFiles[0];
          if (variant === 'escaping-inventory') manifest.generatedFiles[0].file = '../escape';
          if (variant === 'absolute-inventory') manifest.generatedFiles[0].file = resolve(f.base, 'absolute');
          writeFileSync(f.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
        }
        // Exercise inventory/JSON validation even with an explicitly authorised matching fixture pin.
        if (variant !== 'altered-manifest') {
          prior = sha256(readFileSync(f.manifest));
          edit(f.pin, text => text.replace(f.prior, prior));
        }
      } else if (variant === 'corrupt-output') writeFileSync(f.outputs[0], 'corrupt');
      else if (variant === 'missing-output') rmSync(f.outputs[0]);
      else edit(resolve(f.tenant, 'Tools/tenant-layer-contract.mjs'), text => variant === 'safety-assertion'
        ? text.replace('enabled: false', 'enabled: true')
        : text.replace("text('BehaviourContractVersion', false)",
          "text('https://example.invalid/sites/test', false)"));
      const before = snapshot(f.outputs);
      const result = execute(f.generator, ['--write', '--expected-current-manifest-sha256', prior]);
      expect(result.status).not.toBe(0);
      if (variant === 'personal-binding')
        expect(String(result.stderr)).toContain('TENANT_LAYER_SOURCE_CONTAINS_TARGET_OR_PERSONAL_BINDING');
      expect(String(result.stdout)).not.toContain('"valid": true');
      expect(snapshot(f.outputs)).toEqual(before);
    });
  });
  it('rejects stale generated files in check mode without mutation', () => {
    fixture(f => {
      writeFileSync(f.outputs[0], 'stale');
      const before = snapshot(f.outputs);
      const result = execute(f.generator, ['--check']);
      expect(result.status).not.toBe(0);
      expect(String(result.stderr)).toContain('TENANT_LAYER_GENERATION_MISMATCH');
      expect(snapshot(f.outputs)).toEqual(before);
    });
  });
  it('reports an injected filesystem write failure without success or pin advancement', () => {
    fixture(f => {
      edit(f.generator, text => text.replace('await writeFile(path, bytes);',
        "await writeFile(join(path, 'impossible-child'), bytes);"));
      const before = snapshot(f.outputs);
      const result = execute(f.generator, ['--write', '--expected-current-manifest-sha256', f.prior]);
      expect(result.status).not.toBe(0);
      expect(String(result.stdout)).not.toContain('"valid": true');
      expect(snapshot(f.outputs)).toEqual(before);
    });
  });
});

describe('WI-B12 generated tenant-layer package', () => {
  it('preserves 15 quarter descriptors and adds exactly six nullable proposal fields', () => {
    const schema = JSON.parse(readFileSync(resolve(tenantRoot, 'Schema', 'behaviour-v2-sharepoint-schema.json'), 'utf8')) as {
      lists: Array<{ purpose: string; fields: Array<Record<string, unknown> & { internalName: string }> }> };
    const fields = schema.lists.find(list => list.purpose === 'QuarterReviewItems')!.fields;
    const original = ['BehaviourFrameworkVersionSnapshot', 'BehaviourValueTitleSnapshot', 'BehaviourCorporateValueSnapshot',
      'BehaviourRoleTierSnapshot', 'BehaviourCadenceSnapshot', 'BehaviourPeriodSnapshot', 'BehaviourDescriptorSnapshot',
      'BehaviourPeriodKeysSnapshotJSON', 'BehaviourRatingLabelsSnapshotJSON', 'EmployeeBehaviourEvidenceV2',
      'EmployeeBehaviourAssessmentV2', 'ManagerBehaviourEvidenceV2', 'ManagerBehaviourAssessmentV2',
      'FinalBehaviourEvidenceV2', 'FinalBehaviourAssessmentV2'];
    expect(fields.slice(0, 15).map(field => field.internalName)).toEqual(original);
    const additions = fields.slice(15);
    expect(additions.map(field => field.internalName)).toEqual(['BehaviourAnnualTargetLevelV2',
      'BehaviourAnnualTargetJustificationV2', 'BehaviourAnnualTargetSourceWorkplanItemKeyV2',
      'BehaviourAnnualTargetSourceEtagV2', 'BehaviourAnnualTargetSourceWorkplanVersionV2', 'BehaviourAnnualTargetSourceApprovalKeyV2']);
    expect(fields).toHaveLength(21);
    additions.forEach(field => {
      expect(field).toMatchObject({ required: false, indexed: false, unique: false });
      expect(Object.prototype.hasOwnProperty.call(field, 'defaultValue')).toBe(false);
    });
    expect(additions.map(field => field.type)).toEqual(['Text', 'Note', 'Text', 'Text', 'Number', 'Text']);
    additions.filter(field => field.type === 'Text').forEach(field => expect(field.maxLength).toBe(255));
    expect(additions[1]).toMatchObject({ plainText: true, appendOnly: false, versionHistory: false });
    expect(additions[4]).toMatchObject({ decimals: 0, minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
    const annual = schema.lists.find(list => list.purpose === 'WorkplanItems')!.fields;
    expect(annual).toHaveLength(16);
    expect(annual.slice(15)).toEqual(C2B_ITEM_CONCURRENCY_FIELDS);
    expect(annual.every(field => field.required === false)).toBe(true);
    expect(annual.some(field => field.internalName.startsWith('BehaviourAnnualTarget'))).toBe(false);
  });

  it('generates nullable header and integer token storage without defaults or historical backfill', () => {
    const schema = JSON.parse(readFileSync(resolve(tenantRoot, 'Schema', 'behaviour-v2-sharepoint-schema.json'), 'utf8')) as {
      lists: Array<{ purpose: string; createIfMissing: boolean; fields: Array<Record<string, unknown>> }> };
    const header = schema.lists.find(list => list.purpose === 'Workplans')!;
    const items = schema.lists.find(list => list.purpose === 'WorkplanItems')!;
    expect(header.createIfMissing).toBe(false);
    expect(items.createIfMissing).toBe(false);
    expect(header.fields).toEqual(C2B_ANNUAL_HEADER_FIELDS);
    expect(items.fields.slice(15)).toEqual(C2B_ITEM_CONCURRENCY_FIELDS);
    [...header.fields, ...items.fields].forEach(field => {
      expect(field).toMatchObject({ required: false, indexed: false, unique: false });
      expect(Object.prototype.hasOwnProperty.call(field, 'defaultValue')).toBe(false);
    });
    expect(items.fields.slice(0, 15).map(field => field.internalName)).toEqual([
      'BehaviourFrameworkVersion', 'BehaviourValueTitleSnapshot', 'BehaviourCorporateValueSnapshot',
      'BehaviourRoleTierSnapshot', 'BehaviourCadenceSnapshot', 'BehaviourDescriptorSnapshot',
      'BehaviourPeriodKeysSnapshotJSON', 'BehaviourRatingLabelsSnapshotJSON', 'BehaviourCommitmentV2',
      'BehaviourPeriodCommitmentsV2JSON', 'BehaviourV2SelectedSuggestionKeysJSON',
      'BehaviourPlanningContractVersion', 'BehaviourCurrentLevelV2', 'BehaviourTargetLevelV2',
      'BehaviourTargetLevelReasonV2'
    ]);
    expect(items.fields.some(field => String(field.internalName).startsWith('BehaviourV2SelectionSnapshots'))).toBe(false);
  });

  it('keeps mixed and historic rows unavailable while requiring five values for a new v02 image', () => {
    const snapshot = { valueId: 'BHV-01', frameworkVersion: 'KCCC-BEHAVIOUR|v02', period: 'Q1' };
    for (const itemType of ['CoreGold', 'LocalPersonal', 'Behaviour']) {
      expect(materialiseQuarterBehaviourTarget({ itemType })).toBeUndefined();
    }
    expect(materialiseQuarterBehaviourTarget({ itemType: 'Behaviour', behaviourSnapshotV2: snapshot })).toBeUndefined();
    const complete = { itemType: 'Behaviour', behaviourSnapshotV2: snapshot, behaviourId: 'BHV-01', quarter: 'Q1',
      quarterReviewItemKey: 'synthetic|2026|Q1|BHV-01', workplanKey: 'synthetic|2026', workplanItemKey: 'BHV-01', personKey: 'synthetic',
      behaviourAnnualTargetLevelV2: 'Effective', behaviourAnnualTargetSourceWorkplanItemKeyV2: 'BHV-01',
      behaviourAnnualTargetSourceEtagV2: '"3"', behaviourAnnualTargetSourceWorkplanVersionV2: 3,
      behaviourAnnualTargetSourceApprovalKeyV2: 'approval-3' };
    expect(materialiseQuarterBehaviourTarget(complete)?.behaviourAnnualTargetJustificationV2).toBeUndefined();
    expect(() => materialiseQuarterBehaviourTarget({ ...complete, behaviourAnnualTargetSourceEtagV2: undefined })).toThrow();
    expect(() => materialiseQuarterBehaviourTarget({ ...complete, behaviourAnnualTargetJustificationV2: 'x'.repeat(1001) })).toThrow();
  });

  it('is deterministic and matches every self-excluding manifest hash', () => {
    const result = spawnSync(process.execPath, [resolve(tenantRoot, 'Tools', 'build-tenant-layer.mjs'), '--check'],
      { cwd: root, encoding: 'utf8' });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    const output = JSON.parse(result.stdout) as { valid: boolean; deterministic: boolean; disabled: boolean;
      triggerCount: number; connectionReferenceCount: number; productRowCount: number; packageSha256: string;
      manifestSha256: string; executableManifestSha256: string };
    expect(output).toMatchObject({ valid: true, deterministic: true, disabled: true, triggerCount: 0,
      connectionReferenceCount: 0, productRowCount: 0 });
    expect(output.packageSha256).toBe(sha256(readFileSync(packagePath)));
    expect(output.executableManifestSha256).toBe(output.manifestSha256);

    const manifest = JSON.parse(readFileSync(resolve(tenantRoot, 'tenant-layer-manifest.json'), 'utf8')) as {
      selfExcluded: boolean; generatedFiles: Array<{ file: string; bytes: number; sha256: string }>;
    };
    expect(manifest.selfExcluded).toBe(true);
    expect(manifest.generatedFiles.every(entry => {
      const bytes = readFileSync(resolve(tenantRoot, entry.file));
      return bytes.length === entry.bytes && sha256(bytes) === entry.sha256;
    })).toBe(true);
    expect(output.manifestSha256).toBe(sha256(readFileSync(resolve(tenantRoot, 'tenant-layer-manifest.json'))));
  });

  it('rejects a stale executable manifest identity during generation checks', () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), 'kcf-kpi-tenant-manifest-'));
    try {
      const copiedProcessorRoot = resolve(temporaryRoot, 'power-platform', 'KCFKPIEmployeeTESTProcessor');
      const copiedTenantRoot = resolve(copiedProcessorRoot, 'TenantLayer');
      cpSync(tenantRoot, copiedTenantRoot, { recursive: true });
      mkdirSync(resolve(copiedProcessorRoot, 'Definitions'), { recursive: true });
      cpSync(resolve(root, 'power-platform', 'KCFKPIEmployeeTESTProcessor', 'Definitions',
        'C2b.disabled.definition.json'), resolve(copiedProcessorRoot, 'Definitions', 'C2b.disabled.definition.json'));

      const sourcePreflightPath = resolve(root, 'src', 'webparts', 'performanceHub', 'services', 'tenant',
        'TenantPacketPreflight.ts');
      const copiedPreflightPath = resolve(temporaryRoot, 'src', 'webparts', 'performanceHub', 'services', 'tenant',
        'TenantPacketPreflight.ts');
      mkdirSync(dirname(copiedPreflightPath), { recursive: true });
      const source = readFileSync(sourcePreflightPath, 'utf8');
      const attacked = source.replace(
        /(?<=export const WI_B12_TENANT_MANIFEST_SHA256\s*=\s*')[0-9a-f]{64}(?='\s+as const;)/i,
        'F57004B03D7B1D26D51DCCEDEB033F72D1EAB4C78DBC2536C309501582A40056');
      expect(attacked).not.toBe(source);
      writeFileSync(copiedPreflightPath, attacked, 'utf8');

      const result = spawnSync(process.execPath, [resolve(copiedTenantRoot, 'Tools', 'build-tenant-layer.mjs'), '--check'],
        { cwd: temporaryRoot, encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('TENANT_LAYER_EXECUTABLE_MANIFEST_IDENTITY_MISMATCH');
    } finally {
      rmSync(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('packages a distinct Off, triggerless, connection-unbound companion flow', () => {
    const entries = storedZipEntries(readFileSync(packagePath));
    expect(Array.from(entries.keys()).sort()).toEqual([
      'Other/Customizations.xml', 'Other/Solution.xml',
      'Workflows/KCFKPIEmployeeC2bTenantLayerDisabled-3db97504-0731-4134-af1a-27e467d23b28.json',
      'Workflows/KCFKPIEmployeeC2bTenantLayerDisabled-3db97504-0731-4134-af1a-27e467d23b28.json.data.xml',
      '[Content_Types].xml'
    ].sort());
    const flow = JSON.parse(entries.get(Array.from(entries.keys()).find(name => name.endsWith('.json'))!)!.toString('utf8')) as {
      properties: { connectionReferences: Record<string, unknown>; definition: {
        triggers: Record<string, unknown>; parameters: { $connections: { defaultValue: Record<string, unknown> } };
        actions: Record<string, { inputs?: unknown }>; } };
    };
    expect(flow.properties.definition.triggers).toEqual({});
    expect(flow.properties.connectionReferences).toEqual({});
    expect(flow.properties.definition.parameters.$connections.defaultValue).toEqual({});
    expect(flow.properties.definition.actions.C2B_Tenant_Layer_Packet_Contract.inputs).toMatchObject({
      provisioning: { modeDefault: 'DryRun', applyExplicitlyEnabled: false, addOnly: true,
        overwriteAllowed: false, rollbackReceiptRequired: true },
      authorityRequirements: {
        binding: { contractVersion: 'kcf.kpi.wib12.binding-authority.v1', required: true },
        schema: { required: true }, product: { required: true },
        receipt: { contractVersion: 'kcf.kpi.wib12.receipt-authority.v1', required: true,
          providerListSchemaRequired: true, providerWriterVersionEtagRequired: true },
        packageTransition: { contractVersion: 'kcf.kpi.wib12.package-transition-authority.v1', required: true },
        acl: { identitySeparationEvidenceRequired: true, rollbackRegistryRequired: true }
      },
      receiptPolicy: { receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1',
        appendOnlyDigestChain: true, validateEveryRevision: true, flowMustRemainOff: true },
      targetClassification: { platformEnvironmentType: 'Default', deploymentClassification: 'NonProduction' },
      triggerInstalled: false, activated: false
    });
    const state = entries.get(Array.from(entries.keys()).find(name => name.endsWith('.json.data.xml'))!)!.toString('utf8');
    expect(state).toContain('<StateCode>0</StateCode>');
    expect(state).toContain('<StatusCode>1</StatusCode>');
    const solution = entries.get('Other/Solution.xml')!.toString('utf8');
    expect(solution).toContain('<UniqueName>KCFKPIEmployeeC2bTenantLayerDisabled</UniqueName>');
    expect(solution).toContain('<Version>1.0.1.0</Version>');
    expect(solution).not.toContain('KCFKPIEmployeeC2bDisabledFoundation');
  });

  it('keeps binding identities null and Product rows empty in committed templates', () => {
    const binding = JSON.parse(readFileSync(resolve(tenantRoot, 'Configuration', 'tenant-binding.template.json'), 'utf8')) as {
      enabled: boolean; targetEvidence: unknown; connectionReference: Record<string, unknown>;
      lists: Array<{ listId: unknown }>; activated: boolean; bindingAuthority: Record<string, unknown>;
      schemaAuthority: Record<string, unknown>; receiptAuthority: Record<string, unknown>;
      packageTransitionAuthority: Record<string, unknown>;
    };
    const data = JSON.parse(readFileSync(resolve(tenantRoot, 'Data', 'product-data.template.json'), 'utf8')) as
      Record<string, unknown>;
    expect(binding).toMatchObject({ enabled: false, targetEvidence: null, activated: false });
    expect(binding.lists.every(list => list.listId === null)).toBe(true);
    expect(binding.connectionReference).toMatchObject({ connector: 'shared_sharepointonline' });
    expect(Object.entries(binding.connectionReference).filter(([key]) => key !== 'connector')
      .every(([, value]) => value === null)).toBe(true);
    expect(binding.bindingAuthority).toEqual({
      contractVersion: 'kcf.kpi.wib12.binding-authority.v1', authorityReference: null,
      expectedBindingSha256: null, expectedBinding: null,
      aclAuthority: { authorised: false, identitySeparationEvidenceSha256: null,
        rollbackActorPrincipalId: null, rollbackRegistryReference: null }
    });
    expect(binding.schemaAuthority).toEqual({ authorityReference: null, schemaSha256: null,
      listInventorySha256: null });
    expect(binding.receiptAuthority).toEqual({
      contractVersion: 'kcf.kpi.wib12.receipt-authority.v1', authorityReference: null,
      receiptListId: null, receiptListTitle: null, schemaRevision: null, baseTemplate: null,
      majorVersioningEnabled: null, foldersEnabled: null, keyField: 'ReceiptRevisionKey', seriesKeyField: 'ReceiptKey',
      chunkPrefix: 'ReceiptChunk', chunkCount: 16, maximumCodeUnits: 960000,
      fieldInventory: [], fieldInventorySha256: null, writerPrincipalKey: null, writerPrincipalId: null
    });
    expect(binding.packageTransitionAuthority).toEqual({
      contractVersion: 'kcf.kpi.wib12.package-transition-authority.v1', authorityReference: null,
      targetCandidate: { sourceCommit: null, sourceTree: null, tenantPacketManifestSha256: null,
        companionPackageSha256: null },
      targetBasePackage: { productId: null, version: null, binarySha256: null }, allowedPriorBasePackages: []
    });
    expect(data.productAuthority).toEqual({ authorityReference: null, productDataSha256: null,
      frameworkVersion: null, catalogueDigestSha256: null, fixtureRange: null,
      actorPrincipalMapSha256: null, historicEvidenceReferences: [] });
    expect(['frameworkSets', 'frameworkValues', 'personAssignments', 'behaviourObjectiveLibrary', 'peopleBindings',
      'historicEvidence', 'positiveActors', 'negativeActors'].every(key => Array.isArray(data[key]) && !(data[key] as unknown[]).length))
      .toBe(true);
    const generated = readFileSync(resolve(tenantRoot, 'Definitions', 'C2b.tenant-layer.disabled.definition.json'), 'utf8');
    expect(generated).not.toMatch(/https:\/\/[^"' ]+\.sharepoint\.com\/sites\/|Default-[0-9a-f]{8}-|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
  });

  it('carries exact TEST identities and lossless control/receipt physical schemas without legacy aliases', () => {
    const schema = JSON.parse(readFileSync(resolve(tenantRoot, 'Schema', 'behaviour-v2-sharepoint-schema.json'),
      'utf8')) as { lists: Array<{ purpose: string; title: string; schemaRevision: string;
      fields: Array<{ internalName: string }> }> };
    const binding = JSON.parse(readFileSync(resolve(tenantRoot, 'Configuration', 'tenant-binding.template.json'),
      'utf8')) as { lists: Array<{ purpose: string; title: string }>; nativeStorageFields: Record<string, string>;
      planningAuthority: Record<string, unknown>; provisioningLists: Array<{ purpose: string; schemaRevision: string }> };
    expect(binding.lists).toHaveLength(15);
    expect(binding.lists.filter(list => ['People', 'EmployeeCommands', 'ManagerCommands', 'CommandJournal',
      'CommandEffects', 'CommandReceipts', 'Workplans', 'WorkplanItems', 'Audit'].includes(list.purpose))
      .every(list => list.title.startsWith('KCFKPI_TEST_'))).toBe(true);
    expect(binding.nativeStorageFields).toEqual({ sourcePayloadJson: 'PayloadJSON', journalKey: 'CommandKey',
      effectKey: 'EffectKey', workplanKey: 'WorkplanKey', workplanItemKey: 'WorkplanItemNaturalKey',
      auditKey: 'AuditKey', receiptKey: 'ReceiptKey', controlCaseKey: 'ControlCaseKey',
      provisioningReceiptKey: 'ReceiptRevisionKey' });
    expect(binding.planningAuthority).toMatchObject({ schemaRevision: 'c2b-annual-v2', initialState: 'Draft',
      initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready' });
    const control = schema.lists.find(list => list.purpose === 'ControlCases')!;
    const receipts = schema.lists.find(list => list.purpose === 'TenantProvisioningReceipts')!;
    const terminal = schema.lists.find(list => list.purpose === 'CommandReceipts')!;
    expect(control).toMatchObject({ title: 'KCFKPI_TEST_ControlCases', schemaRevision: 'c2b-control-case-v1' });
    expect(receipts).toMatchObject({ title: 'KCFKPI_TEST_TenantProvisioningReceipts',
      schemaRevision: 'kcf-wib12-provisioning-receipt-v1' });
    expect(receipts.fields.filter(field => /^ReceiptChunk\d{2}$/.test(field.internalName))).toHaveLength(16);
    expect(terminal.fields.filter(field => /^NativeReceiptChunk\d{2}$/.test(field.internalName))).toHaveLength(8);
    expect(JSON.stringify({ schema, binding })).not.toMatch(/C2bPlanningBundleJSON|JournalJSON|EffectJSON|CanonicalJSON|ReceiptJSON/);
  });

  it('rejects stale receipt and rollback authority template schemas', () => {
    const operation = JSON.parse(readFileSync(resolve(tenantRoot, 'Receipts',
      'operation-receipt.template.json'), 'utf8')) as Record<string, unknown>;
    expect(Object.keys(operation).sort()).toEqual([
      'afterStateSha256', 'applyExplicitlyEnabled', 'beforeStateSha256', 'completedAt', 'confirmations',
      'contractVersion', 'mode', 'pendingOperation', 'plan', 'planSha256', 'previousReceiptSha256', 'receiptKey',
      'receiptSchemaVersion', 'receiptSha256', 'revision', 'rollback', 'startedAt', 'status', 'stopCode',
      'unknownOperation'
    ].sort());
    expect(operation).toMatchObject({ receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1',
      revision: null, previousReceiptSha256: null, receiptSha256: null,
      rollback: { requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true,
        ambiguityOutcome: 'BLOCKED_OFF' } });
    expect(operation).not.toHaveProperty('stopped');
    const rollback = JSON.parse(readFileSync(resolve(tenantRoot, 'Receipts',
      'rollback-manifest.template.json'), 'utf8')) as Record<string, unknown>;
    expect(rollback.rollbackRegistryAuthority).toEqual({ authorityReference: null, registryReference: null,
      identitySeparationEvidenceSha256: null, rollbackActorPrincipalId: null });
  });
});
