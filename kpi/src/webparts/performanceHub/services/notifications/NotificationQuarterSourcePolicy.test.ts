import type { IProductionConfig, IProductionPerson } from '../../models/ProductionModels';
import type { QuarterKey } from '../../models/QuarterlyModels';
import { buildQuarterLifecycleDates } from '../GovernanceValidation';
import { buildQuarterLifecycle } from '../QuarterLifecycle';
import {
  checkNotificationQuarterSchedule, projectNotificationQuarterSource, QUARTER_NOTIFICATION_SOURCE_EVENTS,
  type INotificationQuarterSourceInput, type QuarterNotificationSourceEvent
} from './NotificationQuarterSourcePolicy';

const performance: IProductionConfig = {
  performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31', performanceYearNumber: 2026,
  quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 }, rag: { greenThreshold: 90, amberThreshold: 50 }, aggregationMethods: [], retentionStatus: 'TBC'
};
const timing = { earlyReviewReminderDays: 24, preparationReminderDays: 12, finalReminderDays: 5, employeeSubmissionDays: 7, managerReviewDays: 7 };
const people: IProductionPerson[] = [
  { id: 1, personKey: 'E1', displayName: 'Synthetic Employee', email: 'employee@example.invalid', managerPersonKey: 'M1', managerEmail: 'manager@example.invalid', active: true, appRoles: ['Employee'] },
  { id: 2, personKey: 'M1', displayName: 'Synthetic Manager', email: 'manager@example.invalid', active: true, appRoles: ['Manager'] }
];
const input = (day: string, events: readonly QuarterNotificationSourceEvent[], state: 'NotStarted' | 'Draft' | 'ChangesRequested' | 'Submitted' | 'Approved' | 'Locked' = 'Draft', quarter: QuarterKey = 'Q3'): INotificationQuarterSourceInput => {
  const end = buildQuarterLifecycle(performance, timing, day).find(value => value.quarterKey === quarter)!.quarterEnd;
  return {
    now: `${day}T09:00:00.000Z`, schedule: { configKey: 'Schedule.QuarterPreview', configVersion: 'schedule-v2', governanceReference: 'SUPPLIED-SYNTHETIC-CONFIG',
      scheduledAt: `${day}T09:00:00.000Z`, dayKey: day, localTime: '09:00:00', timeZone: 'UTC', eventKinds: events },
    configuration: { configKey: 'QuarterTiming', configVersion: 'timing-v4', performance, timing, dates: buildQuarterLifecycleDates(end, timing) },
    workflow: { workflowKey: `QUARTER:E1:2026:${quarter}`, employeePersonKey: 'E1', performanceYearNumber: 2026, periodKey: quarter, state, sourceVersion: 4 },
    people, actionLink: 'https://kpi.example.invalid/hub/quarter', safeLinkPolicy: { allowedOrigins: ['https://kpi.example.invalid'], allowedPathPrefixes: ['/hub'] }
  };
};

describe('quarter notification source preview', () => {
  test.each([
    ['2026-07-07', 'QuarterReadiness'], ['2026-07-19', 'QuarterPreparation'], ['2026-07-26', 'QuarterFinalReminder']
  ] as const)('uses supplied quarter-end offsets on %s for %s', (day, event) => {
    const result = projectNotificationQuarterSource(input(day, [event]));
    expect(result.status).toBe('PREVIEW');
    expect(result.notifications[0]).toMatchObject({ recipientRole: 'Employee', reasons: [event], facts: {
      performanceYear: '2025/26', quarter: 'Q3', configVersion: 'timing-v4', sourceVersion: 4, timing,
      dates: { quarterEnd: '2026-07-31', employeeSubmissionDeadline: '2026-08-07', managerReviewDeadline: '2026-08-14' }
    } });
  });
  test('does not reuse Annual deadline-minus-30 or hard-code current quarter offsets', () => {
    expect(projectNotificationQuarterSource(input('2026-07-01', ['QuarterReadiness'])).status).toBe('SUPPRESSED');
    expect(projectNotificationQuarterSource(input('2026-07-08', ['QuarterReadiness'])).status).toBe('SUPPRESSED');
  });
  test('requires an explicitly selected event even on its milestone', () => {
    expect(projectNotificationQuarterSource(input('2026-07-07', [])).status).toBe('SUPPRESSED');
  });
  test('supports a supplied NotStarted observation without inventing a persisted quarter review', () => {
    expect(projectNotificationQuarterSource(input('2026-07-07', ['QuarterReadiness'], 'NotStarted')).status).toBe('PREVIEW');
  });
  test.each([
    ['2026-07-31', 'SUPPRESSED'], ['2026-08-01', 'PREVIEW'], ['2026-08-07', 'PREVIEW'], ['2026-08-08', 'SUPPRESSED']
  ] as const)('quarter finalisation follows the existing window on %s', (day, status) => {
    expect(projectNotificationQuarterSource(input(day, ['QuarterFinalisation'])).status).toBe(status);
  });
  test.each([['2026-08-07', 'EmployeeSubmissionDue'], ['2026-08-08', 'EmployeeSubmissionOverdue']] as const)('employee %s boundary selects %s', (day, event) => {
    expect(projectNotificationQuarterSource(input(day, [event])).notifications[0].reasons).toEqual([event]);
  });
  test.each(['Submitted', 'Approved', 'Locked'] as const)('employee reminders stop at %s', state => {
    expect(projectNotificationQuarterSource(input('2026-08-08', ['EmployeeSubmissionOverdue'], state)).status).toBe('SUPPRESSED');
  });
  test('ChangesRequested is actionable employee work', () => {
    expect(projectNotificationQuarterSource(input('2026-08-08', ['EmployeeSubmissionOverdue'], 'ChangesRequested')).notifications[0].recipientRole).toBe('Employee');
  });
  test.each([['2026-08-14', 'ManagerReviewDue'], ['2026-08-15', 'ManagerReviewOverdue']] as const)('manager %s boundary selects %s', (day, event) => {
    expect(projectNotificationQuarterSource(input(day, [event], 'Submitted')).notifications[0]).toMatchObject({ recipientRole: 'Manager', recipient: { personKey: 'M1' }, reasons: [event] });
  });
  test.each(['Draft', 'ChangesRequested', 'Approved', 'Locked'] as const)('manager review reminders suppress %s', state => {
    expect(projectNotificationQuarterSource(input('2026-08-15', ['ManagerOutstandingReview', 'ManagerReviewOverdue'], state)).status).toBe('SUPPRESSED');
  });
  test('retains Q1 year crossing and Q4 deadlines after performance-year end', () => {
    const first = projectNotificationQuarterSource(input('2026-02-01', ['QuarterFinalisation'], 'Draft', 'Q1'));
    expect(first.notifications[0].facts.dates.quarterEnd).toBe('2026-01-31');
    const last = projectNotificationQuarterSource(input('2026-11-14', ['ManagerReviewDue'], 'Submitted', 'Q4'));
    expect(last.notifications[0].facts).toMatchObject({ performanceYear: '2025/26', performanceYearNumber: 2026, quarter: 'Q4', dates: { quarterEnd: '2026-10-31' } });
  });
  test('validates the supplied London clock across the daylight-saving date without scheduling a native run', () => {
    const source = input('2026-03-29', ['ManagerOutstandingReview'], 'Submitted', 'Q2');
    const result = projectNotificationQuarterSource({ ...source, now: '2026-03-29T08:00:00.000Z', schedule: { ...source.schedule!, timeZone: 'Europe/London', scheduledAt: '2026-03-29T08:00:00.000Z' } });
    expect(result.status).toBe('PREVIEW'); expect(result.notifications[0].facts.schedule.timeZone).toBe('Europe/London');
  });
  test('suppresses early evaluation and later local days', () => {
    const source = input('2026-07-07', ['QuarterReadiness']);
    expect(projectNotificationQuarterSource({ ...source, now: '2026-07-07T08:59:59.000Z' }).reason).toBe('NotDue');
    expect(projectNotificationQuarterSource({ ...source, now: '2026-07-08T09:00:00.000Z' }).reason).toBe('OutsideScheduledDay');
  });
  test.each(['schedule', 'configuration', 'workflow', 'people', 'actionLink'] as const)('missing %s holds without output', key => {
    const result = projectNotificationQuarterSource({ ...input('2026-07-07', ['QuarterReadiness']), [key]: undefined });
    expect(result.status).toBe('HOLD'); expect(result.notifications).toHaveLength(0);
  });
  test.each([{ timeZone: 'Invalid/Zone' }, { dayKey: '2026-07-08' }, { localTime: '10:00:00' }, { governanceReference: '' }, { configVersion: '' }])('invalid supplied schedule holds: %j', change => {
    const source = input('2026-07-07', ['QuarterReadiness']);
    expect(projectNotificationQuarterSource({ ...source, schedule: { ...source.schedule!, ...change } }).reason).toBe('ScheduleUnavailable');
  });
  test('invalid timing, inconsistent supplied dates and historical year mismatch hold', () => {
    const source = input('2026-07-07', ['QuarterReadiness']);
    expect(projectNotificationQuarterSource({ ...source, configuration: { ...source.configuration!, timing: { ...timing, finalReminderDays: 0 } } }).status).toBe('HOLD');
    expect(projectNotificationQuarterSource({ ...source, configuration: { ...source.configuration!, dates: { ...source.configuration!.dates, quarterEnd: '2026-07-30' } } }).status).toBe('HOLD');
    expect(projectNotificationQuarterSource({ ...source, workflow: { ...source.workflow!, performanceYearNumber: 2027 } }).status).toBe('HOLD');
  });
  test.each([0, 1])('inactive employee/manager relationship %s holds', index => {
    const source = input('2026-07-07', ['QuarterReadiness']);
    expect(projectNotificationQuarterSource({ ...source, people: people.map((person, i) => ({ ...person, active: i !== index })) }).status).toBe('HOLD');
  });
  test('missing assigned-manager key or conflicting People identity holds', () => {
    const source = input('2026-07-07', ['QuarterReadiness']);
    expect(projectNotificationQuarterSource({ ...source, people: [{ ...people[0], managerPersonKey: undefined }, people[1]] }).status).toBe('HOLD');
    expect(projectNotificationQuarterSource({ ...source, people: [...people, { ...people[1] }] }).status).toBe('HOLD');
  });
  test('retains historical provenance, stable preview identity and detached frozen facts without mutation', () => {
    const source = input('2026-08-14', QUARTER_NOTIFICATION_SOURCE_EVENTS, 'Submitted');
    const before = JSON.stringify(source), first = projectNotificationQuarterSource(source), second = projectNotificationQuarterSource(source);
    expect(first).toEqual(second); expect(first.nativeDeliveryEnabled).toBe(false); expect(JSON.stringify(source)).toBe(before);
    expect(first.notifications[0].reasons).toEqual(['ManagerOutstandingReview', 'ManagerReviewDue']);
    expect(Object.isFrozen(first.notifications[0].facts.dates)).toBe(true);
    expect(first.notifications[0].facts.timing).not.toBe(timing);
    const changed = projectNotificationQuarterSource({ ...source, configuration: { ...source.configuration!, configVersion: 'timing-v5' } });
    expect(changed.notifications[0].previewIdentity).not.toBe(first.notifications[0].previewIdentity);
    expect(first.notifications[0].facts.configVersion).toBe('timing-v4');
  });
});

// Notification amendment v1: independent A003 counterexamples remain explicit.
describe('amendment v1 runtime People and direct schedule boundaries', () => {
  const malformed: readonly unknown[] = ['false', 'true', 1, 0, {}, [], null, undefined];
  for (const roleIndex of [0, 1]) {
    test.each(malformed)('refuses malformed active %j before role/relationship projection for index '+roleIndex, active => {
      const original = input('2026-08-14', ['ManagerReviewDue'], 'Submitted');
      const result = projectNotificationQuarterSource({ ...original,
        people: original.people!.map((person, index) => index === roleIndex ? { ...person, active: active as boolean } : person) });
      expect(result).toMatchObject({ status: 'HOLD', reason: 'PeopleRelationshipUnavailable', nativeDeliveryEnabled: false, notifications: [] });
    });
  }
  test('retains genuine true preview and false employee/manager refusal', () => {
    const original = input('2026-08-14', ['ManagerReviewDue'], 'Submitted');
    expect(projectNotificationQuarterSource(original).status).toBe('PREVIEW');
    for (const roleIndex of [0, 1]) expect(projectNotificationQuarterSource({ ...original,
      people: original.people!.map((person, index) => index === roleIndex ? { ...person, active: false } : person)
    })).toMatchObject({ status: 'HOLD', nativeDeliveryEnabled: false, notifications: [] });
  });
  test('direct checker refuses one-hole and mixed sparse arrays with no event default', () => {
    const original = input('2026-08-14', ['ManagerReviewDue'], 'Submitted');
    const mixedSparse: QuarterNotificationSourceEvent[] = ['ManagerReviewDue', 'ManagerReviewDue', 'ManagerOutstandingReview'];
    delete mixedSparse[1];
    for (const eventKinds of [Array(1), mixedSparse]) {
      const schedule = { ...original.schedule!, eventKinds: eventKinds as QuarterNotificationSourceEvent[] };
      expect(checkNotificationQuarterSchedule(schedule, original.now)).toBe('ScheduleUnavailable');
      expect(projectNotificationQuarterSource({ ...original, schedule })).toMatchObject({ status: 'HOLD', nativeDeliveryEnabled: false, notifications: [] });
    }
    const schedule = { ...original.schedule!, eventKinds: [] };
    expect(checkNotificationQuarterSchedule(schedule, original.now)).toBe('Eligible');
    expect(projectNotificationQuarterSource({ ...original, schedule }).reason).toBe('NoEligibleEvents');
  });
  test('direct checker refuses accessors without evaluating the accessor', () => {
    const original = input('2026-08-14', ['ManagerReviewDue'], 'Submitted');let hits=0;
    const schedule = { ...original.schedule! };
    Object.defineProperty(schedule, 'eventKinds', { enumerable: true, get: () => { hits++;return ['ManagerReviewDue']; } });
    expect(checkNotificationQuarterSchedule(schedule, original.now)).toBe('ScheduleUnavailable');expect(hits).toBe(0);
  });
});
