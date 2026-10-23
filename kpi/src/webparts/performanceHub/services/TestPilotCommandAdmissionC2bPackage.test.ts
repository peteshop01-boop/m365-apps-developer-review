import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve('.');
const processor = resolve(root, 'power-platform', 'KCFKPIEmployeeTESTProcessor');
const definitionPath = resolve(processor, 'Definitions', 'C2b.disabled.definition.json');
const workflowPath = resolve(processor, 'C2bPackage', 'Workflows', 'KCFKPIEmployeeC2bDisabled-32b971df-fde0-460d-a9a7-5967e21d0711.json');
const dataPath = `${workflowPath}.data.xml`;
const customisationsPath = resolve(processor, 'C2bPackage', 'Other', 'Customizations.xml');
const generatorPath = resolve(processor, 'Tools', 'build-c2b-disabled.mjs');
const sharePointContractPath = resolve(processor, 'Configuration', 'C2b.sharepoint.schema.json');
const unboundPath = resolve(processor, 'Configuration', 'C2b.unbound.configuration.json');

describe('A006 disabled Power Platform composition package', () => {
  it('regenerates byte-identically and preserves exact source/package definition parity', () => {
    const result = spawnSync(process.execPath, [generatorPath, '--check'], { cwd: root, encoding: 'utf8' });
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: '--check', disabled: true, triggerCount: 0, connectionReferenceCount: 0, c2aDoubleReadPreserved: true,
      settledAnnualRouteCount: 10, deferredBehaviourRouteCount: 0, nativeAdapterOperationCount: 17,
      provisioningMode: 'Disabled', networkExecutionPermitted: false,
      sharePointPhysicalContractSha256: expect.stringMatching(/^[0-9A-F]{64}$/)
    });
    const definition = JSON.parse(readFileSync(definitionPath, 'utf8')) as Record<string, unknown>;
    const workflow = JSON.parse(readFileSync(workflowPath, 'utf8')) as Record<string, unknown>;
    expect(workflow.properties).toEqual(definition.properties);
    expect(workflow.schemaVersion).toBe('1.0.0.0');
  });

  it('is Off, triggerless, unbound, tenant-neutral and cannot bypass the C2b disabled stop', () => {
    const definition = JSON.parse(readFileSync(definitionPath, 'utf8')) as {
      properties: { connectionReferences: Record<string, unknown>; definition: {
        triggers: Record<string, unknown>; actions: Record<string, { runAfter?: Record<string, string[]>; actions?: Record<string, unknown> }>;
      } };
    };
    const text = readFileSync(workflowPath, 'utf8');
    const data = readFileSync(dataPath, 'utf8');
    const customisations = readFileSync(customisationsPath, 'utf8');
    const solution = readFileSync(resolve(processor, 'C2bPackage', 'Other', 'Solution.xml'), 'utf8');
    const unbound = JSON.parse(readFileSync(unboundPath, 'utf8')) as {
      enabled: boolean; environmentId: unknown; siteUrl: unknown; siteCollectionId: unknown; webId: unknown;
      connectionReference: unknown;
      capabilities: { nativeAdapterContractVersion: string; behaviourCatalogueStableRead: boolean };
    };
    expect(definition.properties.connectionReferences).toEqual({});
    expect(definition.properties.definition.triggers).toEqual({});
    expect(data).toMatch(/<StateCode>0<\/StateCode>[\s\S]*<StatusCode>1<\/StatusCode>/);
    expect(customisations).toContain('<connectionreferences />');
    expect(customisations).not.toMatch(/connectionreferencelogicalname|connectorid/);
    expect(solution).toContain('id="{32b971df-fde0-460d-a9a7-5967e21d0711}"');
    expect(solution).not.toContain('fce11d54-525e-4281-afd5-f4023317d09b');
    expect(text).not.toMatch(/samplefoundation|new_sharedsharepointonline|"environmentKind": "Production"/i);
    expect(unbound).toMatchObject({ enabled: false, environmentId: null, siteUrl: null, siteCollectionId: null,
      webId: null, connectionReference: null,
      capabilities: { nativeAdapterContractVersion: 'kcf.kpi.c2b.native-adapter.v2',
        behaviourCatalogueStableRead: true } });
    expect(definition.properties.definition.actions.Canonical_Process.runAfter).toEqual({ C2B_Absent_Stop: ['Succeeded'] });
    expect(definition.properties.definition.actions.C2B_Absent_Stop).toMatchObject({
      runAfter: { Initialise_Internal: ['Succeeded'] }
    });
    expect(definition.properties.definition.actions.C2B_SharePoint_Physical_Contract).toMatchObject({
      type: 'Compose', inputs: { contractVersion: 'kcf.kpi.c2b.sharepoint.v1', schemaRevision: 'c2b-annual-v2',
        provisioningMode: 'Disabled', journalListTitle: 'KCFKPI_TEST_CommandJournal',
        effectListTitle: 'KCFKPI_TEST_CommandEffects', runtimeIdentityEvidenceRequired: true,
        principalAndRoleBindingsRequired: true, networkExecutionPermitted: false }
    });
    const sharePointContract = JSON.parse(readFileSync(sharePointContractPath, 'utf8')) as {
      lists: Array<{ purpose: string; indexes: string[]; uniqueFields: string[] }>;
      existingListRemediations: unknown[];
    };
    expect(sharePointContract.lists.find(value => value.purpose === 'CommandJournal')).toMatchObject({
      indexes: ['CommandKey', 'State', 'LeaseExpiresAt'], uniqueFields: ['CommandKey']
    });
    expect(sharePointContract.lists.find(value => value.purpose === 'CommandEffects')).toMatchObject({
      indexes: ['EffectKey', 'CommandKey', 'Sequence', 'Disposition'], uniqueFields: ['EffectKey']
    });
    expect(sharePointContract.existingListRemediations).toHaveLength(7);
    const canonical = definition.properties.definition.actions.Canonical_Process.actions || {};
    expect(canonical).toEqual(expect.objectContaining({
      Source_A: expect.any(Object), Source_B: expect.any(Object), Source_Observations_Match: expect.any(Object)
    }));
    expect(canonical.C2B_Settled_Annual_Route_Contract).toMatchObject({
      type: 'Compose',
      inputs: {
        contractVersion: 'kcf.kpi.c2b.native-adapter.v2',
        implementedRoutes: expect.arrayContaining([
          { commandType: 'CreateWorkplanDraft', route: 'Employee', subjectType: 'Workplan' },
          { commandType: 'UpsertBehaviourCommitmentV2', route: 'Employee', subjectType: 'WorkplanItem' },
          { commandType: 'CreateWorkplanAmendmentV2', route: 'Manager', subjectType: 'Workplan' }
        ]),
        deferredRoutes: [],
        requiredNativeAdapterOperations: expect.arrayContaining(['BehaviourCatalogueStableRead']),
        requireStableCanonicalAuditReceiptProof: true
      }
    });
    expect(Object.keys((canonical.C2B_Annual_Route_Select as { cases: Record<string, unknown> }).cases)).toHaveLength(10);
    expect(canonical.C2B_Native_Annual_Plan).toMatchObject({
      type: 'ParseJson', inputs: { content: null }, runAfter: { C2B_Annual_Route_Select: ['Succeeded'] }
    });
    expect((canonical.Dispatch as { runAfter: Record<string, string[]> }).runAfter)
      .toEqual({ C2B_Native_Annual_Plan: ['Succeeded'] });
  });

  it('denies browser Start until physical admission and keeps the old direct canonical Workplan create removed', () => {
    const component = readFileSync(resolve(root, 'src', 'webparts', 'performanceHub', 'components', 'IntegratedPerformanceHub.tsx'), 'utf8');
    const production = readFileSync(resolve(root, 'src', 'webparts', 'performanceHub', 'services', 'SharePointProductionDataService.ts'), 'utf8');
    const gateway = readFileSync(resolve(root, 'src', 'webparts', 'performanceHub', 'services', 'EmployeeWorkplanV2C2bCommandGateway.ts'), 'utf8');
    const startBody = component.slice(component.indexOf('const startWorkplan'), component.indexOf('const saveDraft'));
    const legacyBody = production.slice(production.indexOf('public async getOrCreateDraftWorkplan'), production.indexOf('public async saveWorkplanCategoryWeights'));
    expect(startBody).not.toContain('createEmployeeWorkplanDraftV2');
    const admission = component.slice(component.indexOf('const canStartWorkplan'), component.indexOf('const startWorkplan'));
    expect(admission).toContain('!nativeWritesHeld');
    expect(admission).toContain('readOptionEDraftCreateAdmission(optionEDraftCreateIntegration).admitted');
    expect(startBody).toContain('!canStartWorkplan');
    expect(startBody).toContain('startAndOpenVerifiedDraft');
    expect(startBody).toContain('!matchesPrivateDraftHeader(current.workplan, canonical, user, currentUserEmail, year)');
    const protectedHeaderBody = component.slice(component.indexOf('const matchesPrivateDraftHeader'), component.indexOf('const equalWeights'));
    expect(protectedHeaderBody).toContain('header.etag === binding.workplanEtag');
    expect(protectedHeaderBody).toContain('header.employeeEmail.trim().toLowerCase() === email');
    expect(protectedHeaderBody).toContain('binding.email.trim().toLowerCase() === email');
    expect(protectedHeaderBody).toContain('header.rowVersionToken === binding.rowVersionToken');
    expect(startBody).not.toContain('getOrCreateDraftWorkplan');
    expect(legacyBody).toContain('createEmployeeWorkplanDraftV2');
    expect(legacyBody).not.toMatch(/postJson|mergeJson|spHttpClient\.post|KCFKPI_Workplans/);
    expect(gateway).not.toMatch(/SPHttpClient|_api\/web|KCFKPI_|samplefoundation|Production/);
  });
});
