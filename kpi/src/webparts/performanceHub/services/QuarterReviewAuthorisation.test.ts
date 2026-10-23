import type { IProductionPerson } from '../models/ProductionModels';
import type { IQuarterLifecycle, IQuarterReview, IQuarterReviewItem } from '../models/QuarterlyModels';
import {
  assertQuarterProgressWriteBoundary,
  assertQuarterReviewItemSnapshotCurrent,
  assertQuarterReviewItemWriteBoundary,
  assertQuarterReviewSnapshotCurrent,
  assertSpecificPersistedEtag,
  canEmployeeEditQuarterReview,
  canEmployeeReadQuarterReview,
  canEmployeeUpdateQuarterProgress,
  canManagerAssessQuarterBehaviour,
  canManagerReadQuarterReview,
  filterManagerQuarterReviews
} from './QuarterReviewAuthorisation';

const person = (personKey: string, email: string): IProductionPerson => ({
  id: 1, personKey, displayName: personKey, email, appRoles: [], active: true
});

const review = (patch: Partial<IQuarterReview> = {}): IQuarterReview => ({
  id: 1, etag: '*', quarterReviewKey: 'employee|2026|Q4', workplanKey: 'workplan', personKey: 'employee',
  employeeDisplayName: 'Employee', employeeEmail: 'person012@example.invalid', performanceYear: 2026, quarter: 'Q4',
  managerPersonKey: 'manager', managerDisplayName: 'Manager', managerEmail: 'person013@example.invalid',
  state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1,
  ...patch
});

const item = (patch: Partial<IQuarterReviewItem> = {}): IQuarterReviewItem => ({
  id: 7,
  etag: '"3"',
  quarterReviewItemKey: 'employee|2026|Q4|assignment-1',
  quarterReviewKey: 'employee|2026|Q4',
  workplanItemKey: 'assignment-1',
  workplanKey: 'workplan',
  personKey: 'employee',
  performanceYear: 2026,
  quarter: 'Q4',
  itemType: 'CoreGold',
  kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|v01',
  targetVersionKey: 'SO1-001|2026|v01',
  wording: 'Deliver the KPI',
  calculatedRag: 'Amber',
  evidenceCount: 0,
  managerApproved: false,
  locked: false,
  ...patch
});

const lifecycle = (patch: Partial<IQuarterLifecycle> = {}): IQuarterLifecycle => ({
  performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q4', quarterName: 'Q4',
  quarterStart: '2026-08-01', quarterEnd: '2026-10-31', isCurrentQuarter: true, isOpenForProgressUpdates: true,
  employeeSubmissionDeadline: '2026-11-07', managerReviewDeadline: '2026-11-14',
  reminderMilestones: { earlyReview: '2026-10-01', preparation: '2026-10-17', final: '2026-10-24' },
  status: 'Open', priorQuarter: 'Q3',
  ...patch
});

describe('Quarter Review application authorisation', () => {
  it('rejects a stale Quarter Review snapshot before any mutation', () => {
    const expected = review({ etag: '"1"', rowVersionToken: 1 });
    expect(() => assertQuarterReviewSnapshotCurrent(expected, { ...expected, etag: '"2"', rowVersionToken: 2 })).toThrow(/Reload/);
    expect(() => assertQuarterReviewSnapshotCurrent(expected, expected)).not.toThrow();
  });

  it('accepts an exact persisted item row anchored to the current Quarter Review', () => {
    const expectedReview = review({ etag: '"4"' });
    const expectedItem = item();

    expect(() => assertQuarterReviewItemWriteBoundary(expectedReview, expectedItem)).not.toThrow();
    expect(() => assertQuarterReviewItemSnapshotCurrent(expectedItem, { ...expectedItem })).not.toThrow();
  });

  it('rejects a tampered or non-deterministic Quarter Review Item key', () => {
    expect(() => assertQuarterReviewItemWriteBoundary(review(), item({ quarterReviewItemKey: 'other-review|assignment-1' })))
      .toThrow(/does not belong/);
  });

  it('rejects cross-review, cross-person and cross-year item boundaries', () => {
    expect(() => assertQuarterReviewItemWriteBoundary(review(), item({ quarterReviewKey: 'other|2026|Q4' }))).toThrow(/does not belong/);
    expect(() => assertQuarterReviewItemWriteBoundary(review(), item({ workplanKey: 'other-workplan' }))).toThrow(/does not belong/);
    expect(() => assertQuarterReviewItemWriteBoundary(review(), item({ personKey: 'other-person' }))).toThrow(/does not belong/);
    expect(() => assertQuarterReviewItemWriteBoundary(review(), item({ performanceYear: 2025 }))).toThrow(/does not belong/);
    expect(() => assertQuarterReviewItemWriteBoundary(review(), item({ quarter: 'Q3' }))).toThrow(/does not belong/);
  });

  it('rejects stale row IDs or ETags before a persisted update', () => {
    const expected = item();
    expect(() => assertQuarterReviewItemSnapshotCurrent(expected, item({ id: 8 }))).toThrow(/changed/);
    expect(() => assertQuarterReviewItemSnapshotCurrent(expected, item({ etag: '"4"' }))).toThrow(/changed/);
    expect(() => assertSpecificPersistedEtag('*')).toThrow(/no valid saved version/);
    expect(() => assertSpecificPersistedEtag('')).toThrow(/no valid saved version/);
    expect(() => assertQuarterReviewItemSnapshotCurrent(item({ etag: '*' }), expected)).toThrow(/no valid saved version/);
  });

  it('rejects immutable assignment, KPI and target-version changes', () => {
    const expected = item();
    expect(() => assertQuarterReviewItemSnapshotCurrent(expected, item({ itemType: 'LocalPersonal' }))).toThrow(/changed/);
    expect(() => assertQuarterReviewItemSnapshotCurrent(expected, item({ workplanItemKey: 'assignment-2' }))).toThrow(/changed/);
    expect(() => assertQuarterReviewItemSnapshotCurrent(expected, item({ kpiId: 'SO1-002' }))).toThrow(/changed/);
    expect(() => assertQuarterReviewItemSnapshotCurrent(expected, item({ kpiVersionKey: 'SO1-001|v02' }))).toThrow(/changed/);
    expect(() => assertQuarterReviewItemSnapshotCurrent(expected, item({ targetVersionKey: 'SO1-001|2026|v02' }))).toThrow(/changed/);
  });

  it('isolates employee read/edit access to the exact PersonKey and professional email', () => {
    const employee = person('employee', 'person012@example.invalid');
    expect(canEmployeeReadQuarterReview(employee, review())).toBe(true);
    expect(canEmployeeEditQuarterReview(employee, review())).toBe(true);
    expect(canEmployeeReadQuarterReview(person('other', 'person012@example.invalid'), review())).toBe(false);
    expect(canEmployeeReadQuarterReview(person('employee', 'person017@example.invalid'), review())).toBe(false);
    expect(canEmployeeEditQuarterReview(employee, review({ state: 'Submitted', accessState: 'ManagerDecision' }))).toBe(false);
  });

  it('permits progress writes only in the exact open current quarter', () => {
    const employee = person('employee', 'person012@example.invalid');
    expect(canEmployeeUpdateQuarterProgress(employee, lifecycle(), review(), item())).toBe(true);
    expect(() => assertQuarterProgressWriteBoundary(employee, lifecycle(), review(), item())).not.toThrow();
    expect(canEmployeeUpdateQuarterProgress(employee, lifecycle({ status: 'Finalising', isCurrentQuarter: false, isOpenForProgressUpdates: false }), review(), item())).toBe(false);
    expect(canEmployeeUpdateQuarterProgress(employee, lifecycle({ quarterKey: 'Q3' }), review(), item())).toBe(false);
    expect(canEmployeeUpdateQuarterProgress(employee, lifecycle(), review({ state: 'Approved', accessState: 'ReadOnly' }), item())).toBe(false);
    expect(() => assertQuarterProgressWriteBoundary(employee, lifecycle({ status: 'Finalising', isCurrentQuarter: false, isOpenForProgressUpdates: false }), review(), item()))
      .toThrow(/open current quarter/);
  });

  it('filters manager access to assigned direct-report Quarter Reviews only', () => {
    const manager = person('manager', 'person013@example.invalid');
    const assigned = review({ state: 'Submitted', accessState: 'ManagerDecision' });
    const unrelated = review({ quarterReviewKey: 'other|2026|Q4', personKey: 'other', employeeEmail: 'person017@example.invalid', managerPersonKey: 'different-manager', managerEmail: 'person018@example.invalid' });
    expect(canManagerReadQuarterReview(manager, assigned)).toBe(true);
    expect(canManagerReadQuarterReview(manager, unrelated)).toBe(false);
    expect(filterManagerQuarterReviews(manager, [assigned, unrelated])).toEqual([assigned]);
  });

  it('allows a genuine assigned manager to assess only an unlocked Behaviour in the current Submitted review', () => {
    const manager = person('manager', 'person013@example.invalid');
    const submitted = review({ state: 'Submitted', accessState: 'ManagerDecision' });
    const behaviour = {
      id: 1, etag: '*', quarterReviewItemKey: 'employee|2026|Q4|behaviour', quarterReviewKey: submitted.quarterReviewKey,
      workplanItemKey: 'behaviour', workplanKey: submitted.workplanKey, personKey: submitted.personKey, performanceYear: 2026,
      quarter: 'Q4' as const, itemType: 'Behaviour' as const, wording: 'Work as One Team', calculatedRag: 'NotRated' as const,
      evidenceCount: 0, managerApproved: false, locked: false
    };
    expect(canManagerAssessQuarterBehaviour(manager, submitted, behaviour)).toBe(true);
    expect(canManagerAssessQuarterBehaviour(manager, submitted, { ...behaviour, itemType: 'CoreGold' })).toBe(false);
    expect(canManagerAssessQuarterBehaviour(manager, submitted, { ...behaviour, locked: true })).toBe(false);
    expect(canManagerAssessQuarterBehaviour(manager, review(), behaviour)).toBe(false);
  });
});
