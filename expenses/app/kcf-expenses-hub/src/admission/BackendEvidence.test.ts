import { reviewBackendEvidence } from './BackendEvidence';
import type { IBackendEvidence, IListMetadata } from './BackendEvidence';

const now = '2026-10-12T00:00:00Z';
function fixture(): IBackendEvidence {
  return {
    environment: 'KCF Automation TEST', capturedAtUtc: '2026-10-11T23:45:00Z', metadataOnly: true,
    observationComplete: true, actorContext: 'MULTI_ACTOR',
    expenseList: { title: 'KCFEXP_TEST102_ExpenseLines', uniqueAcl: true, readSecurity: 2, writeSecurity: 2, versioning: true },
    expenseFields: [
      { internalName: 'ExpenseLineKey', type: 'Text', required: true, unique: true, readOnly: false },
      { internalName: 'NominalCode', type: 'Text', required: false, unique: false, readOnly: false }
    ],
    evidence: { secureOriginator: 'SYNTHETIC-PROOF-1', claimantAndManagerNegativeTests: 'SYNTHETIC-PROOF-2',
      ownerAndMonthBinding: 'SYNTHETIC-PROOF-3', standardLicenceAndCost: 'SYNTHETIC-PROOF-4',
      liveNominalEqualityAndEligibility: 'SYNTHETIC-PROOF-5', appendOnlyAudit: 'SYNTHETIC-PROOF-6', idempotencyAndStaleVersion: 'SYNTHETIC-PROOF-7' }
  };
}
describe('Backend evidence review (delivery tooling; never write authority)', () => {
  it('never grants writes even with all synthetic evidence markers present', () => {
    const report = reviewBackendEvidence(fixture(), now, 60);
    expect(report.decision).toBe('INDEPENDENT_REVIEW_REQUIRED');
    expect(report.tenantWritesAuthorised).toBe(false); expect(Object.isFrozen(report)).toBe(true);
  });
  it('flags the observed required Category and inherited all-items TEST settings', () => {
    const base = fixture();
    const report = reviewBackendEvidence({ ...base, actorContext: 'UNVERIFIED', evidence: {},
      observationComplete: false,
      expenseList: { ...base.expenseList, uniqueAcl: false, readSecurity: 1, writeSecurity: 1 },
      expenseFields: [...base.expenseFields, { internalName: 'ExpenseCategory', type: 'Text', required: true, unique: false, readOnly: false }]
    }, now, 60);
    expect(report.decision).toBe('BLOCKED'); expect(report.tenantWritesAuthorised).toBe(false);
    expect(report.blockers).toContain('REQUIRED_CATEGORY_CONFLICTS_WITH_WEB_006');
    expect(report.blockers).toContain('INHERITED_ACL_REQUIRES_LEAST_PRIVILEGE_PROOF');
    expect(report.blockers).toContain('ALL_ITEMS_SETTING_REQUIRES_SCOPE_PROOF');
    expect(report.blockers).toContain('OBSERVATION_INCOMPLETE');
    expect(report.blockers).toContain('MISSING_EVIDENCE_secureOriginator');
  });
  it.each(['invalid', '2026-10-12T01:00:00Z', '2026-10-11T20:00:00Z'])('rejects invalid/future/stale capture %s', capturedAtUtc => {
    expect(reviewBackendEvidence({ ...fixture(), capturedAtUtc }, now, 60).blockers).toContain('CURRENT_EVIDENCE_UNVERIFIED');
  });
  it.each([0, -1, NaN, Infinity])('refuses an invalid caller-supplied freshness interval %s', maxAge => {
    expect(reviewBackendEvidence(fixture(), now, maxAge).blockers).toContain('CURRENT_EVIDENCE_UNVERIFIED');
  });
  it('does not default missing list or field metadata to safe values', () => {
    const base = fixture();
    const list: IListMetadata = { title: base.expenseList.title };
    const report = reviewBackendEvidence({ ...base, expenseList: list,
      expenseFields: [{ internalName: 'NominalCode', type: 'Text' }] }, now, 60);
    expect(report.blockers).toContain('LIST_SETTINGS_INCOMPLETE');
    expect(report.blockers).toContain('FIELD_SETTINGS_INCOMPLETE');
    expect(report.blockers).toContain('LINE_KEY_IDEMPOTENCY_UNPROVEN');
  });
  it('rejects Production and a different list without rewriting either target', () => {
    const report = reviewBackendEvidence({ ...fixture(), environment: 'KCF Digital Operations Production',
      expenseList: { ...fixture().expenseList, title: 'KCFEXP_ExpenseLines' } }, now, 60);
    expect(report.blockers).toContain('WRONG_ENVIRONMENT'); expect(report.blockers).toContain('WRONG_EXPENSE_LIST');
    expect(report.tenantWritesAuthorised).toBe(false);
  });
  it('does not treat a privileged/one-actor session as negative security proof', () => {
    for (const actorContext of ['ADMIN', 'CLAIMANT', 'UNVERIFIED'] as const) {
      expect(reviewBackendEvidence({ ...fixture(), actorContext }, now, 60).blockers).toContain('ACTOR_NEGATIVE_TESTS_UNPROVEN');
    }
  });
  it('rejects duplicate field metadata, numeric nominal binding and nonunique keys', () => {
    const base = fixture();
    const report = reviewBackendEvidence({ ...base, expenseFields: [
      { internalName: 'NominalCode', type: 'Number', required: false, readOnly: false, unique: false },
      { internalName: 'ExpenseLineKey', type: 'Text', required: true, readOnly: false, unique: false },
      base.expenseFields[0]
    ] }, now, 60);
    expect(report.blockers).toContain('DUPLICATE_FIELD_METADATA');
    expect(report.blockers).toContain('NOMINAL_TEXT_BINDING_UNPROVEN');
    expect(report.blockers).toContain('LINE_KEY_IDEMPOTENCY_UNPROVEN');
  });
});
