import type { IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import { evaluateReadiness, isWorkplanCreationDisabled } from './ReadinessService';

const syntheticUser: IProductionPerson = {
  id: 1,
  personKey: 'de8fc527-fa58-4b8a-ae63-818822015746',
  displayName: 'Synthetic Person 02',
  email: 'person003@example.invalid',
  managerPersonKey: 'manager-key',
  managerEmail: 'person002@example.invalid',
  appRoles: ['Employee'],
  active: true
};

const config: IProductionConfig = {
  performanceYear: '2025/26',
  performanceYearStart: '2025-11-01T00:00:00Z',
  performanceYearEnd: '2026-10-31T00:00:00Z',
  performanceYearNumber: 2026,
  quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 },
  rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: ['DirectMetric', 'Additive', 'WeightedContribution', 'Composite', 'Milestone', 'AccountableOwner'],
  retentionStatus: 'TBC — KCF HR/Data Retention Policy before production go-live'
};

describe('Production Workplan readiness', () => {
  it('detects the current controlled blockers and keeps Workplan creation disabled', () => {
    const result = evaluateReadiness({
      employee: syntheticUser,
      manager: undefined,
      config,
      counts: { activeKpis: 0, approvedAnnualTargets: 0, publishedBehaviours: 0 }
    });

    expect(result.ready).toBe(false);
    expect(isWorkplanCreationDisabled(result)).toBe(true);
    expect(result.checks.find(item => item.key === 'employee')?.status).toBe('pass');
    expect(result.checks.find(item => item.key === 'managerEmail')?.status).toBe('pass');
    expect(result.checks.find(item => item.key === 'performanceYear')?.status).toBe('pass');
    expect(result.checks.find(item => item.key === 'weighting')?.status).toBe('pass');
    expect(result.checks.find(item => item.key === 'manager')?.status).toBe('fail');
    expect(result.checks.find(item => item.key === 'kpiMaster')?.status).toBe('fail');
    expect(result.checks.find(item => item.key === 'annualTargets')?.status).toBe('fail');
    expect(result.checks.find(item => item.key === 'behaviours')?.status).toBe('fail');
  });

  it('returns ready only when all eight checks pass', () => {
    const result = evaluateReadiness({
      employee: syntheticUser,
      manager: { ...syntheticUser, id: 2, personKey: 'manager-key', displayName: 'Approved Manager', email: syntheticUser.managerEmail || '',
        managerPersonKey: undefined, managerEmail: undefined, appRoles: ['Manager'] },
      config,
      counts: { activeKpis: 1, approvedAnnualTargets: 1, publishedBehaviours: 5 }
    });
    expect(result.ready).toBe(true);
    expect(result.checks.every(item => item.status === 'pass')).toBe(true);
  });
});
