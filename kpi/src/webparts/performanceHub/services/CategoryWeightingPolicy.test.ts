import {
  DEFAULT_DELIVERY_CATEGORY_WEIGHTS,
  DEFAULT_WORKPLAN_CATEGORY_WEIGHTS,
  applyCoreWeightingMode,
  approveDeliveryWeightOverride,
  bindAuthoritativeDeliveryWeightOverrideCapability,
  calculateOverallDeliveryScore,
  categoryWeightsAreManagerApproved,
  equalCoreWeights,
  resolveGovernedDeliveryWeightConfiguration,
  resolveDeliveryWeightSnapshot,
  validateCoreRoleAndContributionMethod,
  validateCoreWeightingSelection,
  validateDeliveryCategoryWeights,
  validateWorkplanCategoryWeights,
  type IGovernedDeliveryWeightConfigurationContract
} from './CategoryWeightingPolicy';

const governedDeliveryConfiguration = (): IGovernedDeliveryWeightConfigurationContract => ({
  schema: 'KCF.DeliveryWeightConfiguration' as const,
  immutable: true as const,
  published: true as const,
  authority: {
    configurationId: 'DELIVERY-WEIGHTS-2027', version: 'PD01-V1', etag: '"weights-v1"',
    approvalReference: 'KCF-KPI-Sponsor-PD-01' as const, contentSha256: 'A'.repeat(64),
    effectiveFrom: '2026-09-21', publishedAt: '2026-09-21T09:00:00.000Z',
    publishedBy: 'sponsor@example.invalid', changeReference: 'KCF-KPI-Sponsor-PD-01'
  },
  defaultWeights: { core: 70, impact: 30 },
  activeWeights: { core: 70, impact: 30 }
});

const overrideSubject = Object.freeze({
  personKey: 'employee-001',
  managerPersonKey: 'manager',
  managerEmail: 'manager@example.invalid'
});
const managerCapability = (): ReturnType<typeof bindAuthoritativeDeliveryWeightOverrideCapability> =>
  bindAuthoritativeDeliveryWeightOverrideCapability(Object.freeze({
    personKey: 'manager', email: 'manager@example.invalid', appRoles: Object.freeze(['Manager']) as string[], active: true
  }), overrideSubject);
const adminCapability = (): ReturnType<typeof bindAuthoritativeDeliveryWeightOverrideCapability> =>
  bindAuthoritativeDeliveryWeightOverrideCapability(Object.freeze({
    personKey: 'admin', email: 'admin@example.invalid', appRoles: Object.freeze(['SystemAdmin']) as string[], active: true
  }), overrideSubject);

describe('BT-02 slice 02 approved Delivery and Core weighting policy', () => {
  it('uses configurable 70/30 Core/Impact arithmetic and never consumes Behaviour data', () => {
    expect(DEFAULT_DELIVERY_CATEGORY_WEIGHTS).toEqual({ core: 70, impact: 30 });
    expect(validateDeliveryCategoryWeights(DEFAULT_DELIVERY_CATEGORY_WEIGHTS)).toMatchObject({
      valid: true, total: 100, changedFromDefault: false, behaviourIncluded: false
    });
    expect(calculateOverallDeliveryScore(80, 120, DEFAULT_DELIVERY_CATEGORY_WEIGHTS)).toBe(92);
    expect(calculateOverallDeliveryScore(80, 120, {
      core: 70, impact: 30, behaviours: 999
    } as unknown as { core: number; impact: number })).toBe(92);
  });

  it('consumes an immutable version/provenance-bound PD-01 configuration through the existing scorer', () => {
    const source = governedDeliveryConfiguration();
    const snapshot = resolveGovernedDeliveryWeightConfiguration(source, source.authority, new Date('2026-09-22T12:00:00.000Z'));
    expect(snapshot).toEqual(expect.objectContaining({
      defaultWeights: { core: 70, impact: 30 }, activeWeights: { core: 70, impact: 30 }, behaviourIncluded: false
    }));
    expect(snapshot.authority).toEqual(expect.objectContaining({ version: 'PD01-V1', etag: '"weights-v1"' }));
    expect(calculateOverallDeliveryScore(80, 120, snapshot.activeWeights)).toBe(92);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.activeWeights)).toBe(true);
  });

  it('fails closed on stale provenance, ineffective configuration and invalid defaults/totals', () => {
    const source = governedDeliveryConfiguration();
    expect(() => resolveGovernedDeliveryWeightConfiguration(source, {
      ...source.authority, version: 'STALE'
    }, new Date('2026-09-22T12:00:00.000Z'))).toThrow(/changed after it was loaded/);
    expect(() => resolveGovernedDeliveryWeightConfiguration(source, source.authority,
      new Date('2026-09-20T12:00:00.000Z'))).toThrow(/not effective/);
    const wrongDefault = { ...source, defaultWeights: { core: 60, impact: 40 } };
    expect(() => resolveGovernedDeliveryWeightConfiguration(wrongDefault, wrongDefault.authority,
      new Date('2026-09-22T12:00:00.000Z'))).toThrow(/approved 70\/30 default/);
    const invalidTotal = { ...source, activeWeights: { core: 70, impact: 29 } };
    expect(() => resolveGovernedDeliveryWeightConfiguration(invalidTotal, invalidTotal.authority,
      new Date('2026-09-22T12:00:00.000Z'))).toThrow(/total exactly 100/);
  });

  it('enforces exact two-category totals and reasoned configurable overrides', () => {
    expect(validateDeliveryCategoryWeights({ core: 65, impact: 35 }).errors)
      .toContain('A reason is required when Delivery weighting differs from the configured 70% Core / 30% Impact default.');
    expect(validateDeliveryCategoryWeights({ core: 65, impact: 35 }, 'Approved annual configuration.').valid).toBe(true);
    expect(validateDeliveryCategoryWeights({ core: 65, impact: 34.99 }, 'Reason').valid).toBe(false);
    expect(validateDeliveryCategoryWeights({ core: 65.001, impact: 34.999 }, 'Reason').valid).toBe(false);
    expect(() => calculateOverallDeliveryScore(80, 90, { core: 60, impact: 30 })).toThrow(/exactly 100/);
  });

  it('creates deterministic Equal weights and preserves explicit Custom weights without mutating input', () => {
    const source = Object.freeze([
      Object.freeze({ kpiId: 'CORE-001', weight: 60, employeeRole: 'Contributor' as const, contributionMethod: 'AdditiveDirect' as const }),
      Object.freeze({ kpiId: 'CORE-002', weight: 40, employeeRole: 'AccountableOwner' as const, contributionMethod: 'CompletionOversight' as const }),
      Object.freeze({ kpiId: 'CORE-003', weight: 0, employeeRole: 'Oversight' as const, contributionMethod: 'SharedTarget' as const })
    ]);
    const before = JSON.stringify(source);
    const equal = applyCoreWeightingMode(source, 'Equal');
    expect(equal.map(item => item.weight)).toEqual([33.34, 33.33, 33.33]);
    expect(equalCoreWeights(109).reduce((sum, weight) => sum + Math.round(weight * 100), 0)).toBe(10000);
    expect(validateCoreWeightingSelection(equal, 'Equal')).toMatchObject({ valid: true, total: 100 });
    expect(validateCoreWeightingSelection(source, 'Custom')).toMatchObject({ valid: true, total: 100 });
    expect(applyCoreWeightingMode(source, 'Custom')).toEqual(source);
    expect(JSON.stringify(source)).toBe(before);
    expect(applyCoreWeightingMode(source, 'Custom')).not.toBe(source);
  });

  it('keeps role and contribution method independent and rejects either missing choice', () => {
    expect(validateCoreRoleAndContributionMethod([
      { kpiId: 'CORE-001', weight: 50, employeeRole: 'EvidenceProvider', contributionMethod: 'AdditiveDirect' },
      { kpiId: 'CORE-002', weight: 50, employeeRole: 'AccountableOwner', contributionMethod: 'CompletionOversight' }
    ])).toEqual([]);
    expect(validateCoreRoleAndContributionMethod([
      { kpiId: 'CORE-001', weight: 100, employeeRole: 'Contributor' }
    ])).toEqual([expect.stringContaining('contribution method selected separately')]);
    expect(validateCoreRoleAndContributionMethod([
      { kpiId: 'CORE-001', weight: 100, contributionMethod: 'SharedTarget' }
    ])).toEqual([expect.stringContaining('employee role')]);
  });

  it('accepts only exact assigned-manager or System Admin approval and emits complete immutable audit evidence', () => {
    const request = Object.freeze({
      auditKey: 'workplan|2027|delivery-weight|v3', existingAuditKeys: Object.freeze([] as string[]),
      current: Object.freeze({ core: 70, impact: 30 }), proposed: Object.freeze({ core: 65, impact: 35 }),
      reason: 'Approved balance for the annual plan.', actorEmail: 'manager@example.invalid', actorRole: 'Manager' as const,
      actorPersonKey: 'manager', subjectPersonKey: 'employee-001', assignedManagerPersonKey: 'manager',
      eventAt: '2026-09-21T00:30:00.000Z',
      sourceVersion: 3, state: 'Submitted' as const
    });
    const before = JSON.stringify(request);
    const result = approveDeliveryWeightOverride(request, managerCapability());
    expect(result).toEqual(expect.objectContaining({ accepted: true, weights: { core: 65, impact: 35 }, errors: [] }));
    expect(result.audit).toEqual(expect.objectContaining({
      auditKey: request.auditKey, actorEmail: request.actorEmail, actorRole: 'Manager', sourceVersion: 3,
      eventAt: request.eventAt, resultingState: 'Submitted', before: { core: 70, impact: 30 }, after: { core: 65, impact: 35 }
    }));
    expect(JSON.stringify(request)).toBe(before);
    expect(result.weights).not.toBe(request.proposed);
    expect(result.audit?.after).not.toBe(result.weights);

    const admin = approveDeliveryWeightOverride({
      ...request,
      auditKey: 'admin-approval',
      actorEmail: 'admin@example.invalid',
      actorRole: 'SystemAdmin',
      actorPersonKey: 'admin',
      assignedManagerPersonKey: undefined
    }, adminCapability());
    expect(admin.accepted).toBe(true);
  });

  it('fails closed for unauthorised, unaudited, duplicate, invalid or locked overrides without changing the last valid weights', () => {
    const base = {
      auditKey: 'approval-1', current: { core: 70, impact: 30 }, proposed: { core: 60, impact: 40 },
      reason: 'Synthetic governed reason.', actorEmail: 'other@example.invalid', actorRole: 'Manager' as const,
      actorPersonKey: 'other', subjectPersonKey: 'employee-001', assignedManagerPersonKey: 'manager',
      eventAt: '2026-09-21T00:30:00.000Z',
      sourceVersion: 4, state: 'Submitted' as const
    };
    [
      approveDeliveryWeightOverride(base, managerCapability()),
      approveDeliveryWeightOverride({ ...base, actorEmail: 'admin@example.invalid', actorRole: 'SystemAdmin', actorPersonKey: 'admin', auditKey: '' }, adminCapability()),
      approveDeliveryWeightOverride({ ...base, actorEmail: 'admin@example.invalid', actorRole: 'SystemAdmin', actorPersonKey: 'admin', existingAuditKeys: ['approval-1'] }, adminCapability()),
      approveDeliveryWeightOverride({ ...base, actorEmail: 'admin@example.invalid', actorRole: 'SystemAdmin', actorPersonKey: 'admin', proposed: { core: 60, impact: 39 } }, adminCapability()),
      approveDeliveryWeightOverride({ ...base, actorEmail: 'admin@example.invalid', actorRole: 'SystemAdmin', actorPersonKey: 'admin', proposed: { core: 70, impact: 30 }, reason: '' }, adminCapability()),
      approveDeliveryWeightOverride({ ...base, actorRole: 'Employee' as never }, managerCapability()),
      approveDeliveryWeightOverride({ ...base, actorEmail: 'admin@example.invalid', actorRole: 'SystemAdmin', actorPersonKey: 'admin', state: 'Locked' }, adminCapability())
    ].forEach(result => {
      expect(result.accepted).toBe(false);
      expect(result.weights).toEqual(base.current);
      expect(result.audit).toBeUndefined();
    });
  });

  it('keeps approved historical snapshots unchanged when active configuration moves', () => {
    const historic = Object.freeze({ core: 70, impact: 30 });
    const active = Object.freeze({ core: 60, impact: 40 });
    const resolved = resolveDeliveryWeightSnapshot(active, historic);
    expect(resolved).toEqual(historic);
    expect(resolved).not.toBe(historic);
    expect(resolveDeliveryWeightSnapshot(active)).toEqual(active);
  });
});

describe('Workplan category weighting policy', () => {
  it('accepts the default balance when Personal KPIs exist', () => {
    expect(validateWorkplanCategoryWeights(DEFAULT_WORKPLAN_CATEGORY_WEIGHTS, 1)).toMatchObject({ valid: true, total: 100, changedFromDefault: false });
  });

  it('requires Personal to be zero when no Personal KPI exists', () => {
    const invalid = validateWorkplanCategoryWeights(DEFAULT_WORKPLAN_CATEGORY_WEIGHTS, 0);
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.join(' ')).toMatch(/must be 0%/);
    expect(validateWorkplanCategoryWeights({ core: 85, personal: 0, behaviours: 15 }, 0, 'No Personal objectives this year.').valid).toBe(true);
  });

  it('enforces signed guardrails, exact total and a reason for a changed balance', () => {
    expect(validateWorkplanCategoryWeights({ core: 59, personal: 21, behaviours: 20 }, 1, 'Reason').valid).toBe(false);
    expect(validateWorkplanCategoryWeights({ core: 70, personal: 15, behaviours: 14 }, 1, 'Reason').valid).toBe(false);
    expect(validateWorkplanCategoryWeights({ core: 70, personal: 15, behaviours: 15 }, 1).valid).toBe(false);
    expect(validateWorkplanCategoryWeights({ core: 70, personal: 15, behaviours: 15 }, 1, 'Agreed role balance.').valid).toBe(true);
  });

  it('treats manager approval as part of the controlled Workplan lifecycle', () => {
    expect(categoryWeightsAreManagerApproved('Draft')).toBe(false);
    expect(categoryWeightsAreManagerApproved('Submitted')).toBe(false);
    expect(categoryWeightsAreManagerApproved('Locked')).toBe(true);
  });
});
