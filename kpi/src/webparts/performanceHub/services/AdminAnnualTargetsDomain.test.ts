import * as AnnualTargetsApi from './AdminAnnualTargetsDomain';
import {
  type IAdminAnnualTargetRecord,
  type IAdminAnnualTargetsUatState,
  addAnnualTargetSafeUat,
  createAnnualTargetsUatState,
  editAnnualTargetSafeUat,
  filterAnnualTargetsByYear,
  validateAdminAnnualTarget
} from './AdminAnnualTargetsDomain';

const context = {
  actorEmail: 'admin.uat@example.invalid',
  occurredAt: '2026-08-22T10:00:00.000Z'
};

const targets: IAdminAnnualTargetRecord[] = [
  {
    id: 1,
    kpiId: 'SYN-001',
    performanceYear: '2025/26',
    targetVersionKey: 'SYN-001-2025-v1',
    annualTarget: 100,
    q1Target: 25,
    q2Target: 50,
    q3Target: 75,
    q4Target: 100,
    status: 'Approved',
    owner: 'owner@example.invalid',
    modifiedAt: '2025-08-01T09:00:00.000Z',
    modifiedBy: 'historic.admin@example.invalid'
  },
  {
    id: 2,
    kpiId: 'SYN-001',
    performanceYear: '2026/27',
    targetVersionKey: 'SYN-001-2026-v1',
    annualTarget: 120,
    q1Target: 30,
    q2Target: 60,
    q3Target: 90,
    q4Target: 120,
    status: 'Draft',
    owner: 'owner@example.invalid',
    modifiedAt: '2026-08-01T09:00:00.000Z',
    modifiedBy: 'admin@example.invalid'
  }
];

describe('KCF-KPI-020B Annual Targets Admin pure domain', () => {
  it('filters exact Performance Years without mixing target versions', () => {
    expect(filterAnnualTargetsByYear(targets, '2025/26').map(record => record.targetVersionKey))
      .toEqual(['SYN-001-2025-v1']);
    expect(filterAnnualTargetsByYear(targets, '2026/27').map(record => record.targetVersionKey))
      .toEqual(['SYN-001-2026-v1']);
  });

  it('edits only the selected current-year version and preserves historic-year values exactly', () => {
    const before = JSON.stringify(targets);
    const state = createAnnualTargetsUatState(targets, '2026/27');
    const changed = editAnnualTargetSafeUat(
      state,
      'SYN-001',
      '2026/27',
      'SYN-001-2026-v1',
      { annualTarget: 130, q1Target: 32, status: 'Submitted' },
      context
    );

    expect(filterAnnualTargetsByYear(changed.records, '2025/26')[0]).toEqual(targets[0]);
    expect(filterAnnualTargetsByYear(changed.records, '2026/27')[0]).toMatchObject({
      annualTarget: 130,
      q1Target: 32,
      q2Target: 60,
      status: 'Submitted',
      modifiedBy: context.actorEmail,
      modifiedAt: context.occurredAt
    });
    expect(changed.audit).toHaveLength(1);
    expect(changed.audit[0].beforeJson).toContain('"annualTarget":120');
    expect(changed.audit[0].afterJson).toContain('"annualTarget":130');
    expect(JSON.stringify(targets)).toBe(before);
  });

  it('blocks historic-year edits even when the KPI ID is also present in the editable year', () => {
    const state = createAnnualTargetsUatState(targets, '2026/27');

    expect(() => editAnnualTargetSafeUat(
      state,
      'SYN-001',
      '2025/26',
      'SYN-001-2025-v1',
      { annualTarget: 999 },
      context
    )).toThrow('Historic Performance Year targets are read-only');
  });

  it('clears a selected quarter explicitly without changing other target fields', () => {
    const state = createAnnualTargetsUatState(targets, '2026/27');
    const changed = editAnnualTargetSafeUat(
      state,
      'SYN-001',
      '2026/27',
      'SYN-001-2026-v1',
      { clearQ1Target: true },
      context
    );

    expect(changed.records[1].q1Target).toBeUndefined();
    expect(changed.records[1].annualTarget).toBe(120);
    expect(changed.records[1].q2Target).toBe(60);
    expect(() => editAnnualTargetSafeUat(
      state,
      'SYN-001',
      '2026/27',
      'SYN-001-2026-v1',
      { q1Target: 31, clearQ1Target: true },
      context
    )).toThrow('either a Q1 Target value or clear it');
  });

  it('adds a new target version only to the explicitly editable year', () => {
    const state = createAnnualTargetsUatState(targets, '2026/27');
    const changed = addAnnualTargetSafeUat(state, {
      kpiId: 'SYN-002',
      performanceYear: '2026/27',
      targetVersionKey: 'SYN-002-2026-v1',
      annualTarget: 'Complete signed stage',
      q1Target: 'Stage 1',
      status: 'Draft',
      owner: 'owner.two@example.invalid'
    }, context);

    expect(changed.records).toHaveLength(3);
    expect(changed.records[2]).toMatchObject({
      id: 3,
      kpiId: 'SYN-002',
      performanceYear: '2026/27',
      annualTarget: 'Complete signed stage',
      modifiedBy: context.actorEmail
    });
    expect(() => addAnnualTargetSafeUat(state, {
      kpiId: 'SYN-002',
      performanceYear: '2025/26',
      targetVersionKey: 'SYN-002-2025-v1',
      status: 'Draft',
      owner: 'owner.two@example.invalid'
    }, context)).toThrow('Historic Performance Year targets are read-only');
  });

  it('does not silently replace an existing exact target version', () => {
    const state = createAnnualTargetsUatState(targets, '2026/27');

    expect(() => addAnnualTargetSafeUat(state, {
      kpiId: 'SYN-001',
      performanceYear: '2026/27',
      targetVersionKey: 'SYN-001-2026-v1',
      annualTarget: 999,
      status: 'Draft',
      owner: 'owner@example.invalid'
    }, context)).toThrow('historic target rows cannot be replaced');
  });

  it('validates identity, owner and target values', () => {
    expect(validateAdminAnnualTarget({
      ...targets[1],
      owner: '',
      annualTarget: Number.POSITIVE_INFINITY,
      q1Target: '   '
    })).toEqual([
      'Target owner is required.',
      'Annual Target is invalid.',
      'Q1 Target is invalid.'
    ]);
  });

  it('has no delete API and blocks a forged production persistence boundary', () => {
    expect(Object.keys(AnnualTargetsApi).filter(key => key.toLowerCase().indexOf('delete') >= 0)).toEqual([]);
    const safe = createAnnualTargetsUatState(targets, '2026/27');
    const forged = { ...safe, persistence: 'SharePoint' } as unknown as IAdminAnnualTargetsUatState;

    expect(() => editAnnualTargetSafeUat(
      forged,
      'SYN-001',
      '2026/27',
      'SYN-001-2026-v1',
      { annualTarget: 130 },
      context
    )).toThrow('safe local UAT boundary');
  });
});
