import {
  KCF_PRODUCTION_SITE,
  SEC006_CANONICAL_ADDITIVE_FIELDS,
  SEC006_CONTROL_LISTS,
  SEC006_DISABLED_AUTOMATION_PROCESSORS,
  SEC006_RECEIPT_FIELDS,
  SEC006_UAT_IDENTITY_SLOTS,
  validateSec006NonProductionTarget,
  validateSec006RuntimeOwners
} from './Sec006NonProductionManifest';

describe('KCF-KPI-027B SEC-006 non-production manifest', () => {
  it('contains exactly the 27 approved additive fields at the governed list grain', () => {
    expect(SEC006_CANONICAL_ADDITIVE_FIELDS).toHaveLength(27);
    const byList = SEC006_CANONICAL_ADDITIVE_FIELDS.reduce<Record<string, number>>((counts, field) => {
      counts[field.listTitle] = (counts[field.listTitle] || 0) + 1;
      return counts;
    }, {});
    expect(byList).toEqual({ KCFKPI_Workplans: 2, KCFKPI_WorkplanItems: 24, KCFKPI_QuarterReviewItems: 1 });
    expect(new Set(SEC006_CANONICAL_ADDITIVE_FIELDS.map(field => `${field.listTitle}|${field.internalName}`)).size).toBe(27);
    expect(SEC006_CANONICAL_ADDITIVE_FIELDS.some(field => field.internalName === 'FileRef')).toBe(false);
  });

  it('does not repurpose automation-derived contribution fields as employee-authoritative', () => {
    const protectedFields = ['DirectContributionEligible', 'NonOverlapRequired', 'WorkplanVersion',
      'ContributionEffectiveFrom', 'ContributionApprovedAt', 'ContributionAuditReference'];
    protectedFields.forEach(name => {
      const matches = SEC006_CANONICAL_ADDITIVE_FIELDS.filter(field => field.internalName === name);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches.every(field => field.authority === 'AutomationOnly' || field.authority === 'AutomationDerived')).toBe(true);
    });
  });

  it('preserves the complete legacy and V2 Employee command union', () => {
    const choices = new Set(SEC006_CONTROL_LISTS[0].commandChoices);
    ['CreateWorkplanDraft', 'UpdateWorkplanDraft', 'UpsertWorkplanItem', 'DeactivateWorkplanItem',
      'SubmitWorkplan', 'CreateQuarterDraft', 'UpdateQuarterItem', 'SaveProgressEntry',
      'RegisterEvidence', 'SubmitQuarterReview', 'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2',
      'UpsertPersonalItemV2', 'UpsertBehaviourCommitmentV2', 'SetCoreWeightingV2',
      'UpdateQuarterItemV2'].forEach(choice => expect(choices.has(choice as never)).toBe(true));
    expect(choices.size).toBe(16);
  });

  it('preserves the complete legacy and V2 Manager command union', () => {
    const choices = new Set(SEC006_CONTROL_LISTS[1].commandChoices);
    ['RequestWorkplanChanges', 'ApproveAndLockWorkplan', 'RequestQuarterChanges',
      'SetQuarterManagerReview', 'SetQuarterRAGOverride', 'DecideReforecast',
      'ApproveAndLockQuarter', 'CreateWorkplanAmendmentV2']
      .forEach(choice => expect(choices.has(choice as never)).toBe(true));
    expect(choices.size).toBe(8);
  });

  it('corrects receipt provenance and keeps CommandKey non-unique correlation only', () => {
    expect(SEC006_RECEIPT_FIELDS).toEqual(expect.arrayContaining([
      'SourceListId', 'SourceItemId', 'SourceItemVersion'
    ]));
    const receipt = SEC006_CONTROL_LISTS[2];
    expect(receipt.uniqueFields).toEqual(['ReceiptKey']);
    expect(receipt.indexedNonUniqueFields).toContain('CommandKey');
  });

  it('fails the target gate closed when no environment is supplied', () => {
    expect(validateSec006NonProductionTarget()).toEqual(['NON_PRODUCTION_TARGET_NOT_IDENTIFIED']);
  });

  it('forbids the normal REVIEW-TEST-SITE Production site even if mislabelled', () => {
    expect(validateSec006NonProductionTarget({
      siteUrl: KCF_PRODUCTION_SITE,
      automationEnvironmentId: 'nonprod-environment-id',
      classification: 'NonProduction',
      isolationApprovalReference: 'CONTROL-TEST-ONLY',
      isolationApprovedBy: 'CONTROL',
      dedicatedSiteCollection: true
    })).toContain('PRODUCTION_SITE_FORBIDDEN');
  });

  it('accepts only complete evidence for a separately named tenant test site', () => {
    expect(validateSec006NonProductionTarget({
      siteUrl: 'https://example.invalid/sites/KCF-KPI-NonProd',
      automationEnvironmentId: 'environment-guid-from-it',
      classification: 'NonProduction',
      isolationApprovalReference: 'CONTROL-SEC006-NONPROD',
      isolationApprovedBy: 'CONTROL and IT',
      dedicatedSiteCollection: true
    })).toEqual([]);
  });

  it('keeps every Automation processor disabled until ownership is named', () => {
    expect(SEC006_DISABLED_AUTOMATION_PROCESSORS).toHaveLength(4);
    expect(SEC006_DISABLED_AUTOMATION_PROCESSORS.every(flow => flow.enabled === false
      && flow.identity === 'IT_CONTROL_REQUIRED' && flow.backupOwner === 'IT_CONTROL_REQUIRED')).toBe(true);
    expect(validateSec006RuntimeOwners({})).toEqual(expect.arrayContaining([
      'AUTOMATION_IDENTITY_NOT_NAMED', 'AUTOMATION_BACKUP_OWNER_NOT_NAMED',
      'AUTOMATION_OWNERSHIP_CONTROL_REFERENCE_MISSING'
    ]));
    expect(validateSec006RuntimeOwners({
      automationIdentity: 'person003@example.invalid',
      backupOwner: 'backup@example.invalid',
      controlReference: 'CONTROL-001'
    })).toContain('PETER_IDENTITY_FORBIDDEN');
  });

  it('prepares all eight UAT identity slots without inventing credentials', () => {
    expect(SEC006_UAT_IDENTITY_SLOTS.map(identity => identity.id)).toEqual(['E1', 'E2', 'M1', 'M2', 'D1', 'BA1', 'SA1', 'A1']);
    expect(SEC006_UAT_IDENTITY_SLOTS.every(identity => identity.credentialsSupplied === false)).toBe(true);
    expect(SEC006_UAT_IDENTITY_SLOTS.find(identity => identity.id === 'SA1')).toMatchObject({
      siteCollectionAdministratorPermitted: false, canonicalWritePermitted: false
    });
    expect(SEC006_UAT_IDENTITY_SLOTS.find(identity => identity.id === 'A1')).toMatchObject({
      interactiveSignInPermitted: false, businessDecisionAuthority: false
    });
  });
});
