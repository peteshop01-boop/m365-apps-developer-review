import { hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import {
  KCF_AUTOMATION_TARGET_EVIDENCE_SHA256,
  canonicalTenantTargetEvidence,
  classifyKcfAutomationTenantTarget,
  evaluateTenantTargetEvidence,
  type ITenantTargetEvidence
} from './TenantTargetClassification';

const evidence = (): ITenantTargetEvidence => ({
  platformEnvironmentType: 'Default',
  environmentId: 'Default-bcbcff1a-88fd-4fc7-a95e-8301a57804d1',
  siteUrl: 'https://example.invalid/sites/synthetic-test',
  siteCollectionId: 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d',
  rootWebId: '6906d187-3451-467a-a362-10ddc87449f7',
  appCatalogueScope: 'SiteCollection',
  authorityReference: 'KCF-KPI-Sponsor-M013',
  testOnlyBindings: true,
  productionExcluded: true
});

describe('WI-B12 evidence-bound target classification', () => {
  it('preserves native Default separately from a digest-bound NonProduction classification', () => {
    const input = evidence();
    const digest = hashC2bCanonical(canonicalTenantTargetEvidence(input));
    expect(evaluateTenantTargetEvidence(input, digest)).toEqual({
      deploymentClassification: 'NonProduction', platformEnvironmentType: 'Default',
      evidenceSha256: digest, authorityReference: 'KCF-KPI-Sponsor-M013'
    });
  });

  it.each([
    ['environment identity', (input: ITenantTargetEvidence) => { input.environmentId = input.environmentId.replace(/1$/, '9'); }],
    ['site identity', (input: ITenantTargetEvidence) => { input.siteCollectionId = input.siteCollectionId.replace(/2$/, '9'); }],
    ['web identity', (input: ITenantTargetEvidence) => { input.rootWebId = input.rootWebId.replace(/3$/, '9'); }],
    ['authority', (input: ITenantTargetEvidence) => { input.authorityReference = 'FORGED'; }],
    ['catalogue scope', (input: ITenantTargetEvidence) => { input.appCatalogueScope = 'Tenant'; }],
    ['TEST isolation', (input: ITenantTargetEvidence) => { input.testOnlyBindings = false; }],
    ['Production exclusion', (input: ITenantTargetEvidence) => { input.productionExcluded = false; }]
  ])('fails closed when %s is forged', (_label, mutate) => {
    const approved = evidence();
    const digest = hashC2bCanonical(canonicalTenantTargetEvidence(approved));
    const forged = evidence(); mutate(forged);
    expect(evaluateTenantTargetEvidence(forged, digest).deploymentClassification).toBe('Unknown');
  });

  it('cannot classify caller-selected evidence through the fixed KCF entry point', () => {
    const result = classifyKcfAutomationTenantTarget(evidence());
    expect(result.deploymentClassification).toBe('Unknown');
    expect(KCF_AUTOMATION_TARGET_EVIDENCE_SHA256).toMatch(/^[0-9A-F]{64}$/);
  });
});
