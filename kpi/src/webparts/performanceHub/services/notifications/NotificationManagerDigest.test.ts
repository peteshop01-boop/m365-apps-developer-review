import type { IProductionConfig, IProductionPerson } from '../../models/ProductionModels';
import { buildQuarterLifecycleDates } from '../GovernanceValidation';
import { projectNotificationManagerDigest, type INotificationManagerDigestInput } from './NotificationManagerDigest';
import type { INotificationQuarterSchedule, INotificationQuarterSourceInput } from './NotificationQuarterSourcePolicy';

const performance: IProductionConfig = {
  performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31', performanceYearNumber: 2026,
  quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' }, weights: { core: 70, personal: 20, behaviours: 10 },
  rag: { greenThreshold: 90, amberThreshold: 50 }, aggregationMethods: [], retentionStatus: 'TBC'
};
const timing = { earlyReviewReminderDays: 30, preparationReminderDays: 14, finalReminderDays: 7, employeeSubmissionDays: 7, managerReviewDays: 7 };
const schedule: INotificationQuarterSchedule = { configKey: 'ManagerDailyPreview', configVersion: 'schedule-v3', governanceReference: 'SUPPLIED-SYNTHETIC-CONFIG',
  dayKey: '2026-08-14', scheduledAt: '2026-08-14T09:00:00.000Z', localTime: '09:00:00', timeZone: 'UTC',
  eventKinds: ['ManagerOutstandingReview', 'ManagerReviewDue', 'ManagerReviewOverdue'] };
const source = (employeeKey: string, managerKey: string = 'M1', state: 'Submitted' | 'Approved' | 'Locked' = 'Submitted'): Omit<INotificationQuarterSourceInput, 'now' | 'schedule'> => {
  const people: IProductionPerson[] = [
    { id: 1, personKey: employeeKey, displayName: `Synthetic ${employeeKey}`, email: `${employeeKey}@example.invalid`, managerPersonKey: managerKey, managerEmail: `${managerKey}@example.invalid`, active: true, appRoles: ['Employee'] },
    { id: 2, personKey: managerKey, displayName: `Synthetic ${managerKey}`, email: `${managerKey}@example.invalid`, active: true, appRoles: ['Manager'] }
  ];
  return { configuration: { configKey: 'QuarterTiming', configVersion: 'timing-v1', performance, timing, dates: buildQuarterLifecycleDates('2026-07-31', timing) },
    workflow: { workflowKey: `REVIEW:${employeeKey}:2026:Q3`, employeePersonKey: employeeKey, performanceYearNumber: 2026, periodKey: 'Q3', state, sourceVersion: 6 }, people,
    actionLink: 'https://kpi.example.invalid/hub/quarter', safeLinkPolicy: { allowedOrigins: ['https://kpi.example.invalid'], allowedPathPrefixes: ['/hub'] } };
};
const input = (sources: INotificationManagerDigestInput['sources']): INotificationManagerDigestInput => ({ now: schedule.scheduledAt, schedule, sources });

describe('manager local-day digest preview', () => {
  test('two employees produce one manager/day bucket, grouped members and combined reasons', () => {
    const result = projectNotificationManagerDigest(input([source('E2'), source('E1')]));
    expect(result.status).toBe('PREVIEW'); expect(result.digests).toHaveLength(1);
    expect(result.digests[0]).toMatchObject({ recipient: { personKey: 'M1' }, dayKey: '2026-08-14', timeZone: 'UTC', employeeCount: 2, outstandingReviewCount: 2 });
    expect(result.digests[0].members.map(member => member.facts.employeePersonKey)).toEqual(['E1', 'E2']);
    expect(result.digests[0].members[0]).toMatchObject({ reasons: ['ManagerOutstandingReview', 'ManagerReviewDue'], urgency: 'Due' });
  });
  test('repeated observations are one subject member, not one message per reason', () => {
    const result = projectNotificationManagerDigest(input([source('E1'), source('E1')]));
    expect(result.digests[0]).toMatchObject({ employeeCount: 1, outstandingReviewCount: 1 });
    expect(result.digests[0].members[0].reasons).toHaveLength(2);
  });
  test('different managers receive separate buckets', () => {
    expect(projectNotificationManagerDigest(input([source('E1'), source('E2', 'M2')])).digests).toHaveLength(2);
  });
  test('one employee with two distinct quarter subjects retains both but counts one employee', () => {
    const next = source('E1');
    const q4 = { ...next, configuration: { ...next.configuration!, dates: buildQuarterLifecycleDates('2026-10-31', timing) },
      workflow: { ...next.workflow!, workflowKey: 'REVIEW:E1:2026:Q4', periodKey: 'Q4' as const } };
    const result = projectNotificationManagerDigest(input([source('E1'), q4]));
    expect(result.digests[0]).toMatchObject({ employeeCount: 1, outstandingReviewCount: 2 });
    expect(result.digests[0].members.map(member => member.facts.quarter)).toEqual(['Q3', 'Q4']);
  });
  test.each([{ sources: [] }, { sources: [source('E1', 'M1', 'Approved')] }, { sources: [source('E1', 'M1', 'Locked')] }])('empty or completed teams suppress', ({ sources }) => {
    expect(projectNotificationManagerDigest(input(sources))).toMatchObject({ status: 'SUPPRESSED', reason: 'EmptyDigest', digests: [] });
  });
  test('overdue reasons replace due while merging with outstanding review', () => {
    const result = projectNotificationManagerDigest({ ...input([source('E1')]), now: '2026-08-15T09:00:00.000Z',
      schedule: { ...schedule, dayKey: '2026-08-15', scheduledAt: '2026-08-15T09:00:00.000Z' } });
    expect(result.digests[0].members[0]).toMatchObject({ reasons: ['ManagerOutstandingReview', 'ManagerReviewOverdue'], urgency: 'Overdue' });
  });
  test.each(['Approved', 'Locked'] as const)('a newer %s observation prevents a stale Submitted member', state => {
    const newer = source('E1', 'M1', state);
    expect(projectNotificationManagerDigest(input([source('E1'), { ...newer, workflow: { ...newer.workflow!, sourceVersion: 7 } }])).reason).toBe('ConflictingSubjectObservations');
  });
  test('conflicting source version or manager assignment holds rather than selecting a winner', () => {
    const changed = source('E1');
    expect(projectNotificationManagerDigest(input([source('E1'), { ...changed, workflow: { ...changed.workflow!, sourceVersion: 7 } }])).status).toBe('HOLD');
    expect(projectNotificationManagerDigest(input([source('E1'), source('E1', 'M2')])).reason).toBe('ConflictingSubjectObservations');
  });
  test('missing schedule is HOLD even for an empty team', () => {
    expect(projectNotificationManagerDigest({ sources: [] }).reason).toBe('ScheduleUnavailable');
  });
  test('a missing source config holds the aggregate without a partial digest', () => {
    expect(projectNotificationManagerDigest(input([source('E1'), { ...source('E2'), configuration: undefined }]))).toMatchObject({ status: 'HOLD', digests: [] });
  });
  test('preserves supplied date/zone and deterministic output without mutation or delivery dedup claims', () => {
    const request = input([source('E2'), source('E1')]), before = JSON.stringify(request);
    const first = projectNotificationManagerDigest(request), second = projectNotificationManagerDigest(input([source('E1'), source('E2')]));
    expect(first).toEqual(second); expect(JSON.stringify(request)).toBe(before); expect(first.nativeDeliveryEnabled).toBe(false);
    expect(projectNotificationManagerDigest(request)).toEqual(first);
    expect(Object.isFrozen(first.digests[0].members[0].facts.timing)).toBe(true);
    expect(first.digests[0].scheduleConfigVersion).toBe('schedule-v3');
  });
});

describe('amendment v1 digest propagation', () => {
  test.each(['false', 'true', 1, {}, []] as readonly unknown[])('malformed manager active %j holds the whole aggregate', active => {
    const invalid=source('E2');const changed={...invalid,people:invalid.people!.map((person,index)=>index===1?{...person,active:active as boolean}:person)};
    expect(projectNotificationManagerDigest(input([source('E1'),changed]))).toMatchObject({status:'HOLD',reason:'SourceObservationUnavailable',nativeDeliveryEnabled:false,digests:[]});
  });
  test('empty event selection suppresses while a sparse selection holds', () => {
    const request=input([source('E1')]);
    expect(projectNotificationManagerDigest({...request,schedule:{...schedule,eventKinds:[]}})).toMatchObject({status:'SUPPRESSED',reason:'EmptyDigest',nativeDeliveryEnabled:false,digests:[]});
    expect(projectNotificationManagerDigest({...request,schedule:{...schedule,eventKinds:Array(1)}})).toMatchObject({status:'HOLD',nativeDeliveryEnabled:false,digests:[]});
  });
});
