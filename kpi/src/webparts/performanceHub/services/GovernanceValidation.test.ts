import {
  buildQuarterLifecycleDates,
  resolveManagerRelationship,
  validateOrganisationalWeights,
  validateQuarterTiming,
  validateWorkplanWeighting
} from './GovernanceValidation';

describe('GovernanceValidation', () => {
  it('accepts the approved default layered Workplan weighting', () => {
    const result = validateWorkplanWeighting({
      categoryWeights: { core: 70, personal: 20, behaviours: 10 },
      categoryOverrideApproved: false,
      coreItems: [{ key: 'SO1-001', weight: 60 }, { key: 'SO1-002', weight: 40 }],
      personalItems: [{ key: 'P1', weight: 100 }],
      behaviourItems: [1, 2, 3, 4, 5].map(index => ({ key: `BHV-0${index}`, weight: 20 })),
      state: 'Draft',
      weightsChanged: true,
      reopenAuthorised: false
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('blocks invalid totals and an unauthorised locked change', () => {
    const result = validateWorkplanWeighting({
      categoryWeights: { core: 60, personal: 20, behaviours: 10 },
      categoryOverrideApproved: false,
      coreItems: Array.from({ length: 41 }, (_, index) => ({ key: `K${index}`, weight: index === 0 ? 100 : 0 })),
      personalItems: [{ key: 'P1', weight: 90 }],
      behaviourItems: [],
      state: 'Locked',
      weightsChanged: true,
      reopenAuthorised: false
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('total 100'),
      expect.stringContaining('override requires a reason'),
      expect.stringContaining('authorised reopen')
    ]));
  });

  it('accepts all 109 governed Core KPIs when their weights remain valid', () => {
    const result = validateWorkplanWeighting({
      categoryWeights: { core: 70, personal: 20, behaviours: 10 },
      categoryOverrideApproved: false,
      coreItems: Array.from({ length: 109 }, (_, index) => ({ key: `K${index + 1}`, weight: index === 0 ? 100 : 0 })),
      personalItems: [], behaviourItems: [], state: 'Draft', weightsChanged: true, reopenAuthorised: false
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('does not accept unresolved or non-100 organisational weight groups', () => {
    expect(validateOrganisationalWeights([
      { key: 'SO1-001', parentKey: 'WS1', performanceYear: 2026, approvalStatus: 'Approved' }
    ]).valid).toBe(false);
    expect(validateOrganisationalWeights([
      { key: 'SO1-001', parentKey: 'WS1', performanceYear: 2026, weight: 70, approvalStatus: 'Approved' },
      { key: 'SO1-002', parentKey: 'WS1', performanceYear: 2026, weight: 20, approvalStatus: 'Approved' }
    ]).valid).toBe(false);
  });

  it('validates Config-driven quarter timing and derives date-only boundaries', () => {
    const timing = {
      earlyReviewReminderDays: 30,
      preparationReminderDays: 14,
      finalReminderDays: 7,
      employeeSubmissionDays: 7,
      managerReviewDays: 7
    };
    expect(validateQuarterTiming(timing)).toEqual({ valid: true, errors: [] });
    expect(buildQuarterLifecycleDates('2026-07-31', timing)).toEqual({
      earlyReviewReminder: '2026-07-01',
      preparationReminder: '2026-07-17',
      finalReminder: '2026-07-24',
      quarterEnd: '2026-07-31',
      employeeSubmissionDeadline: '2026-08-07',
      managerReviewDeadline: '2026-08-14',
      nextQuarterOpens: '2026-08-01'
    });
  });

  it('resolves a manager without inferring Team leadership', () => {
    const manager = { personKey: 'JR', email: 'person002@example.invalid', active: true, isTeamLead: false };
    const employee = {
      personKey: 'SH',
      email: 'person007@example.invalid',
      managerPersonKey: 'JR',
      managerEmail: 'person002@example.invalid',
      active: true,
      isTeamLead: false
    };
    const resolved = resolveManagerRelationship(employee, [employee, manager]);
    expect(resolved.result.valid).toBe(true);
    expect(resolved.manager).toBe(manager);
    expect(employee.isTeamLead).toBe(false);
  });
});
