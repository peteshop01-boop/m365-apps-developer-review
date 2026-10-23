const mockAssertKcfAutomationTenantTarget = jest.fn(() => ({ deploymentClassification: 'NonProduction',
  platformEnvironmentType: 'Default', evidenceSha256: 'A'.repeat(64), authorityReference: 'KCF-KPI-Sponsor-M013' }));

jest.mock('./TenantTargetClassification', () => ({
  ...jest.requireActual('./TenantTargetClassification'),
  assertKcfAutomationTenantTarget: mockAssertKcfAutomationTenantTarget
}));

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WI_B12_BASE_SPFX_PRODUCT_ID,
  WI_B12_BASE_SPFX_SHA256,
  WI_B12_BASE_SPFX_VERSION,
  WI_B12_BASE_WORKFLOW_ID,
  WI_B12_BASE_WORKFLOW_NAME,
  WI_B12_COMPANION_SHA256,
  WI_B12_COMPANION_SOLUTION_NAME,
  WI_B12_COMPANION_SOLUTION_VERSION,
  WI_B12_COMPANION_WORKFLOW_ID,
  WI_B12_COMPANION_WORKFLOW_NAME,
  WI_B12_TENANT_MANIFEST_SHA256,
  preflightTenantPacket,
  assertTenantPackageRollbackIdentity,
  type ITenantCandidateIdentity,
  type ITenantPackageTransitionAuthority,
  type ITenantPacketBeforeState
} from './TenantPacketPreflight';

const packageBytes = readFileSync(resolve('power-platform', 'KCFKPIEmployeeTESTProcessor', 'TenantLayer', 'Package',
  'KCFKPIEmployeeC2bTenantLayerDisabled_1_0_1_0.zip'));
const packageSha = createHash('sha256').update(packageBytes).digest('hex').toUpperCase();
const manifestBytes = readFileSync(resolve('power-platform', 'KCFKPIEmployeeTESTProcessor', 'TenantLayer',
  'tenant-layer-manifest.json'));
const manifestSha = createHash('sha256').update(manifestBytes).digest('hex').toUpperCase();
const expectedCandidate: ITenantCandidateIdentity = {
  sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
  tenantPacketManifestSha256: WI_B12_TENANT_MANIFEST_SHA256,
  companionPackageSha256: WI_B12_COMPANION_SHA256
};
const transitionAuthority = (allowedPriorBasePackages: ITenantPackageTransitionAuthority['allowedPriorBasePackages'] = []):
ITenantPackageTransitionAuthority => ({
  contractVersion: 'kcf.kpi.wib12.package-transition-authority.v1', authorityReference: 'SYNTHETIC-PACKAGE-AUTHORITY',
  targetCandidate: { ...expectedCandidate }, targetBasePackage: { productId: WI_B12_BASE_SPFX_PRODUCT_ID,
    version: WI_B12_BASE_SPFX_VERSION, binarySha256: WI_B12_BASE_SPFX_SHA256 },
  allowedPriorBasePackages
});
const before = (): ITenantPacketBeforeState => ({
  targetEvidence: { platformEnvironmentType: 'Default', environmentId: 'synthetic', siteUrl: 'synthetic',
    siteCollectionId: 'synthetic', rootWebId: 'synthetic', appCatalogueScope: 'SiteCollection',
    authorityReference: 'KCF-KPI-Sponsor-M013', testOnlyBindings: true, productionExcluded: true },
  appCatalogueScope: 'SiteCollection', appCatalogueId: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1',
  globalAvailabilitySelected: false, basePackages: [], companionSolutions: [],
  flows: [
    { workflowId: WI_B12_BASE_WORKFLOW_ID, name: WI_B12_BASE_WORKFLOW_NAME, state: 'Off', triggerCount: 0,
      connectionReferenceCount: 0, unexpectedRunObserved: false, receiptReference: 'BASE-FLOW-RECEIPT' },
    { workflowId: WI_B12_COMPANION_WORKFLOW_ID, name: WI_B12_COMPANION_WORKFLOW_NAME, state: 'Off', triggerCount: 0,
      connectionReferenceCount: 0, unexpectedRunObserved: false, receiptReference: 'COMPANION-FLOW-RECEIPT' }
  ], productionReferenceObserved: false,
  candidate: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
    tenantPacketManifestSha256: WI_B12_TENANT_MANIFEST_SHA256, companionPackageSha256: WI_B12_COMPANION_SHA256,
    receiptReference: 'CANDIDATE-RECEIPT' }
});

describe('WI-B12 site-scoped package no-overwrite preflight', () => {
  beforeEach(() => mockAssertKcfAutomationTenantTarget.mockClear());

  it('permits only an add with a complete rollback receipt when no identity exists', () => {
    expect(packageSha).toBe(WI_B12_COMPANION_SHA256);
    expect(manifestSha).toBe(WI_B12_TENANT_MANIFEST_SHA256);
    expect(preflightTenantPacket(before(), expectedCandidate, transitionAuthority())).toEqual({
      ready: true, code: 'TENANT_PACKET_ADD_ONLY_READY', basePackageAction: 'Add', companionSolutionAction: 'Add',
      rollback: { flowFirst: 'Off', priorBasePackage: null, removeCompanionOnlyIfActionCreated: true,
        restoreReceiptedPriorOnly: true }
    });
    expect(mockAssertKcfAutomationTenantTarget).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['stale exported identity', 'F57004B03D7B1D26D51DCCEDEB033F72D1EAB4C78DBC2536C309501582A40056'],
    ['substituted identity', '0'.repeat(64)]
  ])('rejects a self-consistent %s before package action', (_name, tenantPacketManifestSha256) => {
    const state = before();
    const attackedCandidate = { ...expectedCandidate, tenantPacketManifestSha256 };
    state.candidate.tenantPacketManifestSha256 = tenantPacketManifestSha256;
    const authority = { ...transitionAuthority(), targetCandidate: { ...attackedCandidate } };
    const stateBefore = JSON.stringify(state);

    expect(preflightTenantPacket(state, attackedCandidate, authority)).toEqual({
      ready: false, code: 'TENANT_PACKET_MANIFEST_IDENTITY_INVALID',
      reasons: ['The executable candidate identity does not match the generated tenant manifest.']
    });
    expect(JSON.stringify(state)).toBe(stateBefore);
  });

  it.each([
    ['substituted', '1'.repeat(64)],
    ['stale', 'F57004B03D7B1D26D51DCCEDEB033F72D1EAB4C78DBC2536C309501582A40056'],
    ['malformed', ` ${WI_B12_TENANT_MANIFEST_SHA256}`],
    ['missing', undefined]
  ])('rejects %s observed manifest identity before target classification or package action',
    (_name, tenantPacketManifestSha256) => {
      const state = before();
      const authority = transitionAuthority();
      if (tenantPacketManifestSha256 === undefined) {
        delete (state.candidate as Partial<ITenantPacketBeforeState['candidate']>).tenantPacketManifestSha256;
      } else {
        state.candidate.tenantPacketManifestSha256 = tenantPacketManifestSha256;
      }
      const stateBefore = JSON.stringify(state);
      const authorityBefore = JSON.stringify(authority);

      const result = preflightTenantPacket(state, expectedCandidate, authority);

      expect(result).toEqual({ ready: false, code: 'TENANT_PACKET_NO_OVERWRITE_BLOCKED',
        reasons: ['The candidate commit/tree/manifest/companion receipt is not the frozen packet identity.'] });
      expect(result).not.toHaveProperty('basePackageAction');
      expect(mockAssertKcfAutomationTenantTarget).not.toHaveBeenCalled();
      expect(JSON.stringify(state)).toBe(stateBefore);
      expect(JSON.stringify(authority)).toBe(authorityBefore);
    });

  it('accepts a case-variant exact observed manifest identity before one target classification', () => {
    const state = before();
    state.candidate.tenantPacketManifestSha256 = WI_B12_TENANT_MANIFEST_SHA256.toLowerCase();

    expect(preflightTenantPacket(state, expectedCandidate, transitionAuthority())).toMatchObject({
      ready: true, basePackageAction: 'Add', companionSolutionAction: 'Add'
    });
    expect(mockAssertKcfAutomationTenantTarget).toHaveBeenCalledTimes(1);
  });

  it('rejects a substituted authority manifest identity before target classification', () => {

    const authorityAttack = { ...transitionAuthority(), targetCandidate: {
      ...expectedCandidate, tenantPacketManifestSha256: '2'.repeat(64)
    } };
    expect(preflightTenantPacket(before(), expectedCandidate, authorityAttack)).toMatchObject({
      ready: false, code: 'TENANT_PACKET_TRANSITION_AUTHORITY_INVALID'
    });
    expect(mockAssertKcfAutomationTenantTarget).not.toHaveBeenCalled();
  });

  it('turns exact receipted same-version binaries into no-ops', () => {
    const state = before();
    state.basePackages = [{ productId: WI_B12_BASE_SPFX_PRODUCT_ID, version: WI_B12_BASE_SPFX_VERSION,
      binarySha256: WI_B12_BASE_SPFX_SHA256, receiptReference: 'SYNTHETIC-RECEIPT', installed: true }];
    state.companionSolutions = [{ uniqueName: WI_B12_COMPANION_SOLUTION_NAME,
      version: WI_B12_COMPANION_SOLUTION_VERSION, binarySha256: packageSha,
      receiptReference: 'SYNTHETIC-RECEIPT', installed: true }];
    expect(preflightTenantPacket(state, expectedCandidate, transitionAuthority())).toMatchObject({ ready: true,
      basePackageAction: 'NoOp', companionSolutionAction: 'NoOp' });
  });

  it.each([
    ['unreceipted base collision', (state: ITenantPacketBeforeState) => { state.basePackages = [{
      productId: WI_B12_BASE_SPFX_PRODUCT_ID, version: WI_B12_BASE_SPFX_VERSION,
      binarySha256: '0'.repeat(64), receiptReference: null, installed: true }]; }],
    ['unreceipted solution collision', (state: ITenantPacketBeforeState) => { state.companionSolutions = [{
      uniqueName: WI_B12_COMPANION_SOLUTION_NAME, version: WI_B12_COMPANION_SOLUTION_VERSION,
      binarySha256: '0'.repeat(64), receiptReference: null, installed: true }]; }],
    ['tenant catalogue', (state: ITenantPacketBeforeState) => { state.appCatalogueScope = 'Tenant'; }],
    ['global availability', (state: ITenantPacketBeforeState) => { state.globalAvailabilitySelected = true; }],
    ['Production reference', (state: ITenantPacketBeforeState) => { state.productionReferenceObserved = true; }],
    ['active flow', (state: ITenantPacketBeforeState) => { state.flows[0].state = 'On'; }],
    ['empty flow evidence', (state: ITenantPacketBeforeState) => { state.flows = []; }],
    ['wrong candidate package', (state: ITenantPacketBeforeState) => { state.candidate.companionPackageSha256 = '0'.repeat(64); }],
    ['wrong candidate commit', (state: ITenantPacketBeforeState) => { state.candidate.sourceCommit = 'f'.repeat(40); }],
    ['wrong candidate tree', (state: ITenantPacketBeforeState) => { state.candidate.sourceTree = 'e'.repeat(40); }],
    ['wrong candidate manifest', (state: ITenantPacketBeforeState) => {
      state.candidate.tenantPacketManifestSha256 = 'D'.repeat(64); }],
    ['installed-false no-op', (state: ITenantPacketBeforeState) => { state.basePackages = [{
      productId: WI_B12_BASE_SPFX_PRODUCT_ID, version: WI_B12_BASE_SPFX_VERSION,
      binarySha256: WI_B12_BASE_SPFX_SHA256, receiptReference: 'SYNTHETIC-RECEIPT', installed: false }]; }],
    ['unreceipted prior base', (state: ITenantPacketBeforeState) => { state.basePackages = [{
      productId: WI_B12_BASE_SPFX_PRODUCT_ID, version: '0.9.0.0', binarySha256: null,
      receiptReference: null, installed: true }]; }],
    ['same-name solution version collision', (state: ITenantPacketBeforeState) => { state.companionSolutions = [{
      uniqueName: WI_B12_COMPANION_SOLUTION_NAME, version: '1.0.0.0', binarySha256: packageSha,
      receiptReference: 'SYNTHETIC-RECEIPT', installed: true }]; }],
    ['exact desired plus older base ambiguity', (state: ITenantPacketBeforeState) => { state.basePackages = [{
      productId: WI_B12_BASE_SPFX_PRODUCT_ID, version: WI_B12_BASE_SPFX_VERSION,
      binarySha256: WI_B12_BASE_SPFX_SHA256, receiptReference: 'EXACT', installed: true }, {
      productId: WI_B12_BASE_SPFX_PRODUCT_ID, version: '0.9.0.0',
      binarySha256: 'F'.repeat(64), receiptReference: 'OLDER', installed: true }]; }]
  ])('fails closed for %s', (_name, mutate) => {
    const state = before(); mutate(state);
    expect(preflightTenantPacket(state, expectedCandidate, transitionAuthority())).toMatchObject({ ready: false,
      code: 'TENANT_PACKET_NO_OVERWRITE_BLOCKED' });
  });

  it('rejects downgrade, unknown prior and caller mutation; owns one expressly allowed monotonic upgrade', () => {
    const downgradeState = before();
    downgradeState.basePackages = [{ productId: WI_B12_BASE_SPFX_PRODUCT_ID, version: '9.9.9.9',
      binarySha256: 'D'.repeat(64), receiptReference: 'DOWNGRADE', installed: true }];
    expect(preflightTenantPacket(downgradeState, expectedCandidate, transitionAuthority([downgradeState.basePackages[0]])))
      .toMatchObject({ ready: false });
    const prior = { productId: WI_B12_BASE_SPFX_PRODUCT_ID, version: '0.9.0.0', binarySha256: 'E'.repeat(64),
      receiptReference: 'ALLOWED-PRIOR', installed: true };
    const state = before(); state.basePackages = [prior];
    const authority = transitionAuthority([prior]);
    const result = preflightTenantPacket(state, expectedCandidate, authority);
    expect(result).toMatchObject({ ready: true, basePackageAction: 'Upgrade',
      rollback: { priorBasePackage: { version: '0.9.0.0', binarySha256: 'E'.repeat(64) } } });
    prior.binarySha256 = '0'.repeat(64); prior.receiptReference = 'MUTATED';
    expect(result.ready && result.rollback.priorBasePackage).toMatchObject({ binarySha256: 'E'.repeat(64),
      receiptReference: 'ALLOWED-PRIOR' });
    expect(() => assertTenantPackageRollbackIdentity(result, authority))
      .toThrow(/TENANT_PACKET_ROLLBACK_IDENTITY_CHANGED/);
  });
});
