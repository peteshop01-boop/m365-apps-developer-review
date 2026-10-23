import type { IManagerQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import { buildRecoveryActionboard, deduplicateRecoveryActionboardContexts, filterRecoveryActionboard } from './RecoveryActionboard';

const item = (patch: Partial<IQuarterReviewItem>): IQuarterReviewItem => ({
  id: 1, etag: '*', quarterReviewItemKey: 'review|item', quarterReviewKey: 'review', workplanItemKey: 'item',
  workplanKey: 'workplan', personKey: 'employee', performanceYear: 2026, quarter: 'Q4', itemType: 'CoreGold',
  kpiId: 'SO1-001', wording: 'Controlled KPI', pillar: 'Pillar 1', workstream: 'WS 1', ownerEmail: 'kpi.owner@example.invalid',
  calculatedRag: 'Red', evidenceCount: 0, managerApproved: false, locked: false,
  recovery: { route: 'Recover', action: 'Controlled action', ownerPersonKey: 'employee', dueDate: '2026-08-10', nextReviewDate: '2026-08-21', status: 'Active', expectedReturnToGreenDate: '2026-09-01' },
  ...patch
});

const context = (items: IQuarterReviewItem[]): IManagerQuarterReviewContext => ({
  lifecycle: {
    performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q4', quarterName: 'Q4 (Aug–Oct)',
    quarterStart: '2026-08-01', quarterEnd: '2026-10-31', isCurrentQuarter: true, isOpenForProgressUpdates: true,
    employeeSubmissionDeadline: '2026-11-07', managerReviewDeadline: '2026-11-14',
    reminderMilestones: { earlyReview: '2026-10-01', preparation: '2026-10-17', final: '2026-10-24' }, status: 'Open', priorQuarter: 'Q3'
  },
  review: {
    id: 1, etag: '*', quarterReviewKey: 'review', workplanKey: 'workplan', personKey: 'employee',
    employeeDisplayName: 'Employee One', employeeEmail: 'person012@example.invalid', performanceYear: 2026, quarter: 'Q4',
    managerPersonKey: 'manager', managerDisplayName: 'Manager One', managerEmail: 'person013@example.invalid',
    state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready', rowVersionToken: 1
  },
  employee: { id: 1, personKey: 'employee', displayName: 'Synthetic Person 02', email: 'alex.employee@example.invalid', appRoles: [], active: true },
  manager: { id: 2, personKey: 'manager', displayName: 'Synthetic Person 01', email: 'morgan.manager@example.invalid', appRoles: ['Manager'], active: true },
  items, evidence: [],
  readiness: { ready: false, blockers: [], warnings: [], coreComplete: 0, personalComplete: 0, behavioursComplete: 0 },
  dataFoundationReady: true, messages: []
});

describe('Recovery Actionboard', () => {
  it('returns active Amber/Red Core interventions in management priority order', () => {
    const rows = buildRecoveryActionboard([context([
      item({ quarterReviewItemKey: 'green', calculatedRag: 'Green' }),
      item({ quarterReviewItemKey: 'behaviour', itemType: 'Behaviour' }),
      item({ quarterReviewItemKey: 'amber', calculatedRag: 'Amber', recovery: { route: 'Mitigate', action: 'Reduce impact', ownerPersonKey: 'owner-2', dueDate: '2026-09-01', nextReviewDate: '2026-09-05', status: 'Active', expectedReducedOutcome: 'Reduced impact' } }),
      item({ quarterReviewItemKey: 'red', recovery: { route: 'Reforecast', action: 'Seek revision', ownerPersonKey: 'employee', dueDate: '2026-08-10', nextReviewDate: '2026-08-21', status: 'Active', proposedRevisedTarget: '8', reforecastReason: 'Dependency', reforecastApprovalStatus: 'Pending' } })
    ])], '2026-08-20');
    expect(rows.map(row => row.key)).toEqual(['red', 'amber']);
    expect(rows[0]).toMatchObject({ rag: 'Red', overdue: true, decisionRequired: true, ownerInitials: 'AE' });
  });

  it('includes active Amber/Red Personal interventions with safe Personal fallback labels', () => {
    const rows = buildRecoveryActionboard([context([
      item({
        quarterReviewItemKey: 'personal-recovery',
        itemType: 'LocalPersonal',
        kpiId: undefined,
        pillar: undefined,
        workstream: undefined,
        ownerEmail: undefined,
        wording: 'Improve controlled local outcome',
        calculatedRag: 'Amber',
        recovery: {
          route: 'Recover',
          action: 'Complete the agreed personal recovery step',
          ownerPersonKey: 'manager',
          dueDate: '2026-09-10',
          nextReviewDate: '2026-09-12',
          status: 'Active',
          expectedReturnToGreenDate: '2026-09-30'
        }
      })
    ])], '2026-08-20');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      key: 'personal-recovery',
      kpiId: 'Personal KPI',
      wording: 'Improve controlled local outcome',
      pillar: 'Personal KPIs',
      workstream: 'Individual objective',
      ownerPersonKey: 'manager',
      ownerInitials: 'MM',
      rag: 'Amber'
    }));
  });

  it('filters the management action list without changing its order', () => {
    const rows = buildRecoveryActionboard([context([
      item({ quarterReviewItemKey: 'recover' }),
      item({ quarterReviewItemKey: 'escalate', calculatedRag: 'Amber', recovery: { route: 'Escalate', action: 'Decision', ownerPersonKey: 'other', dueDate: '2026-09-10', nextReviewDate: '2026-09-12', status: 'Escalated', dependencyOrDecision: 'Board decision', escalatedTo: 'Board', targetDecisionDate: '2026-09-15' } })
    ])], '2026-08-20');
    expect(filterRecoveryActionboard(rows, { route: 'Escalate', decisionRequiredOnly: true }).map(row => row.key)).toEqual(['escalate']);
    expect(filterRecoveryActionboard(rows, { overdueOnly: true }).map(row => row.key)).toEqual(['recover']);
  });

  it('applies every supported filter to a live-shaped intervention', () => {
    const rows = buildRecoveryActionboard([context([
      item({ quarterReviewItemKey: 'Synthetic User-q4-so1-001' }),
      item({
        quarterReviewItemKey: 'other-q3', quarter: 'Q3', pillar: 'Pillar 2', workstream: 'WS 2', calculatedRag: 'Amber',
        recovery: { route: 'Mitigate', action: 'Limit impact', ownerPersonKey: 'manager', dueDate: '2026-09-10', nextReviewDate: '2026-09-12', status: 'Active', expectedReducedOutcome: 'Reduced impact' }
      })
    ])], '2026-08-20');
    expect(filterRecoveryActionboard(rows, {
      quarter: 'Q4', pillar: 'Pillar 1', workstream: 'WS 1', ownerPersonKey: 'employee', rag: 'Red',
      route: 'Recover', overdueOnly: true, decisionRequiredOnly: true
    }).map(row => row.key)).toEqual(['Synthetic User-q4-so1-001']);
  });

  it('resolves initials from the assigned recovery owner rather than the KPI owner', () => {
    const rows = buildRecoveryActionboard([context([
      item({ quarterReviewItemKey: 'manager-owned', recovery: { route: 'Recover', action: 'Manager action', ownerPersonKey: 'manager', dueDate: '2026-09-10', nextReviewDate: '2026-09-12', status: 'Active', expectedReturnToGreenDate: '2026-09-30' } }),
      item({ quarterReviewItemKey: 'unresolved-owner', recovery: { route: 'Recover', action: 'Unknown action', ownerPersonKey: 'unknown-person', dueDate: '2026-09-10', nextReviewDate: '2026-09-12', status: 'Active', expectedReturnToGreenDate: '2026-09-30' } })
    ])], '2026-08-20');
    expect(rows.find(row => row.key === 'manager-owned')?.ownerInitials).toBe('MM');
    expect(rows.find(row => row.key === 'unresolved-owner')?.ownerInitials).toBe('—');
  });

  it('deduplicates the employee read-only projection and matching manager context', () => {
    const live = context([item({ quarterReviewItemKey: 'review|SO1-001' })]);
    live.review.quarterReviewKey = 'de8fc527-fa58-4b8a-ae63-818822015746|2026|Q4';
    const contexts = deduplicateRecoveryActionboardContexts([live, { ...live, items: [...live.items] }]);
    expect(contexts).toHaveLength(1);
    expect(buildRecoveryActionboard(contexts, '2026-08-20')).toHaveLength(1);
  });

  it('does not route NotRated or stale unapproved override metadata onto the Actionboard', () => {
    const rows = buildRecoveryActionboard([context([
      item({
        quarterReviewItemKey: 'not-rated',
        calculatedRag: 'NotRated',
        managerOverride: { rag: 'Red', reason: 'Missing manager identity and UTC evidence.' }
      }),
      item({
        quarterReviewItemKey: 'stale-final',
        calculatedRag: 'Green',
        finalApprovedRag: 'Red',
        managerApproved: false,
        locked: false
      })
    ])], '2026-08-20');
    expect(rows).toEqual([]);
  });

  it('fails closed to calculated RAG when a locked approved FinalRAG is stale or mismatched', () => {
    const rows = buildRecoveryActionboard([context([
      item({
        quarterReviewItemKey: 'stale-locked-final',
        calculatedRag: 'Green',
        managerOverride: {
          rag: 'Amber',
          reason: 'Valid override evidence whose result no longer matches FinalRAG.',
          actorPersonKey: 'manager',
          actorEmail: 'person013@example.invalid',
          overriddenAt: '2026-08-20T10:00:00Z'
        },
        finalApprovedRag: 'Red',
        managerApproved: true,
        locked: true
      })
    ])], '2026-08-20');

    expect(rows).toEqual([]);
  });

  it('fails closed when locked approved FinalRAG matches an override with missing audit evidence', () => {
    const rows = buildRecoveryActionboard([context([
      item({
        quarterReviewItemKey: 'invalid-override-final',
        calculatedRag: 'Green',
        managerOverride: {
          rag: 'Red',
          reason: 'Actor identity and UTC evidence are deliberately missing.'
        },
        finalApprovedRag: 'Red',
        managerApproved: true,
        locked: true
      })
    ])], '2026-08-20');

    expect(rows).toEqual([]);
  });

  it('uses a locked approved FinalRAG only when it matches the valid resolved result', () => {
    const rows = buildRecoveryActionboard([context([
      item({
        quarterReviewItemKey: 'valid-locked-final',
        calculatedRag: 'Green',
        managerOverride: {
          rag: 'Amber',
          reason: 'Approved manager judgement supported by recorded evidence.',
          actorPersonKey: 'manager',
          actorEmail: 'person013@example.invalid',
          overriddenAt: '2026-08-20T10:00:00Z'
        },
        finalApprovedRag: 'Amber',
        managerApproved: true,
        locked: true
      })
    ])], '2026-08-20');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ key: 'valid-locked-final', rag: 'Amber' }));
  });
});
