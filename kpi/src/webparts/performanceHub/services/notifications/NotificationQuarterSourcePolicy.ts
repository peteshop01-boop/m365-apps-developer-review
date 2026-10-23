import type { IQuarterLifecycleDates, IQuarterTimingConfig } from '../../models/GovernanceModels';
import type { IProductionConfig, IProductionPerson } from '../../models/ProductionModels';
import type { QuarterKey } from '../../models/QuarterlyModels';
import { applicationEntryCapabilities, hasExactManagerIdentity } from '../ControlledApplicationRoles';
import { buildQuarterLifecycleDates, resolveManagerRelationship } from '../GovernanceValidation';
import { buildQuarterLifecycle } from '../QuarterLifecycle';
import { captureNotificationProtectedData, encodeNotificationIdentity, isCanonicalNotificationUtc, isSafeNotificationLink } from './NotificationBoundary';
import type { INotificationRecipientReference, INotificationSafeLinkPolicy, INotificationWorkflowSnapshot } from './NotificationModels';

/** Separate quarterly vocabulary: the five existing Annual/cycle event contracts stay unchanged. */
export const QUARTER_NOTIFICATION_SOURCE_EVENTS = Object.freeze([
  'QuarterReadiness', 'QuarterPreparation', 'QuarterFinalReminder', 'QuarterFinalisation',
  'EmployeeSubmissionDue', 'EmployeeSubmissionOverdue',
  'ManagerOutstandingReview', 'ManagerReviewDue', 'ManagerReviewOverdue'
] as const);
export type QuarterNotificationSourceEvent = typeof QUARTER_NOTIFICATION_SOURCE_EVENTS[number];

/** Supplied, versioned configuration for this occurrence. No default time, zone or cadence. */
export interface INotificationQuarterSchedule {
  readonly configKey: string;
  readonly configVersion: string;
  readonly governanceReference: string;
  readonly scheduledAt: string;
  readonly dayKey: string;
  readonly localTime: string;
  readonly timeZone: string;
  readonly eventKinds: readonly QuarterNotificationSourceEvent[];
}
export interface INotificationQuarterConfiguration {
  readonly configKey: string;
  readonly configVersion: string;
  readonly performance: Readonly<IProductionConfig>;
  readonly timing: Readonly<IQuarterTimingConfig>;
  readonly dates: Readonly<IQuarterLifecycleDates>;
}
export interface INotificationQuarterSourceInput {
  readonly now?: string;
  readonly schedule?: Readonly<INotificationQuarterSchedule>;
  readonly configuration?: Readonly<INotificationQuarterConfiguration>;
  readonly workflow?: Readonly<INotificationWorkflowSnapshot>;
  readonly people?: readonly IProductionPerson[];
  readonly actionLink?: string;
  readonly safeLinkPolicy?: Readonly<INotificationSafeLinkPolicy>;
}
export interface INotificationQuarterFacts {
  readonly subjectKey: string;
  readonly employeePersonKey: string;
  readonly employeeDisplayName: string;
  readonly performanceYear: string;
  readonly performanceYearNumber: number;
  readonly quarter: QuarterKey;
  readonly quarterName: string;
  readonly workflowState: INotificationWorkflowSnapshot['state'];
  readonly sourceVersion: number;
  readonly configKey: string;
  readonly configVersion: string;
  readonly timing: Readonly<IQuarterTimingConfig>;
  readonly dates: Readonly<IQuarterLifecycleDates>;
  readonly schedule: Readonly<INotificationQuarterSchedule>;
  readonly actionLink: string;
}
export interface INotificationQuarterPreview {
  readonly previewIdentity: string;
  readonly recipientRole: 'Employee' | 'Manager';
  readonly recipient: Readonly<INotificationRecipientReference>;
  readonly reasons: readonly QuarterNotificationSourceEvent[];
  readonly urgency: 'Upcoming' | 'Outstanding' | 'Due' | 'Overdue';
  readonly facts: Readonly<INotificationQuarterFacts>;
  readonly message: string;
}
export type NotificationQuarterHoldReason = 'SourceInputUnavailable' | 'ScheduleUnavailable'
  | 'QuarterConfigurationUnavailable' | 'WorkflowUnavailable' | 'PeopleRelationshipUnavailable' | 'SafeHubLinkUnavailable';
export interface INotificationQuarterSourceResult {
  readonly status: 'PREVIEW' | 'HOLD' | 'SUPPRESSED';
  readonly reason: NotificationQuarterHoldReason | 'NotDue' | 'OutsideScheduledDay' | 'NoEligibleEvents' | 'QuarterSourceProjected';
  readonly nativeDeliveryEnabled: false;
  readonly notifications: readonly Readonly<INotificationQuarterPreview>[];
}
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const email = (value: string): string => value.trim().toLowerCase();
const validEmail = (value: unknown): value is string => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const dateOnly = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;

const localClock = (utc: string, timeZone: string): { day: string; time: string } => {
  // Node22/browser Intl supports these options; the repository's TS lib list predates formatToParts.
  const options: Intl.DateTimeFormatOptions & { hourCycle: 'h23' } = {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  };
  const formatter = new Intl.DateTimeFormat('en-GB', options) as Intl.DateTimeFormat & {
    formatToParts(date: Date): Array<{ type: string; value: string }>;
  };
  const parts = formatter.formatToParts(new Date(utc));
  const part = (name: string): string => parts.find(value => value.type === name)?.value || '';
  return { day: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}:${part('second')}` };
};

/** Validates only supplied preview configuration. This does not issue native scheduling authority. */
export const checkNotificationQuarterSchedule = (
  schedule: Readonly<INotificationQuarterSchedule> | undefined, now: string | undefined
): 'Eligible' | 'ScheduleUnavailable' | 'NotDue' | 'OutsideScheduledDay' => {
  try {
    // Direct calls use the same stable plain-data boundary as the enclosing projector.
    const captured = captureNotificationProtectedData({ schedule, now }, 'quarterSchedule').value;
    schedule = captured.schedule; now = captured.now;
    if (!schedule || !nonempty(schedule.configKey) || !nonempty(schedule.configVersion) || !nonempty(schedule.governanceReference)
      || !nonempty(schedule.timeZone) || !dateOnly(schedule.dayKey) || !/^\d{2}:\d{2}:\d{2}$/.test(schedule.localTime)
      || !isCanonicalNotificationUtc(schedule.scheduledAt) || !isCanonicalNotificationUtc(now)
      || new Date(schedule.scheduledAt).getUTCMilliseconds() !== 0 || !Array.isArray(schedule.eventKinds)
      || new Set(schedule.eventKinds).size !== schedule.eventKinds.length
      || schedule.eventKinds.some(kind => !QUARTER_NOTIFICATION_SOURCE_EVENTS.includes(kind))) return 'ScheduleUnavailable';
    const scheduled = localClock(schedule.scheduledAt, schedule.timeZone);
    if (scheduled.day !== schedule.dayKey || scheduled.time !== schedule.localTime) return 'ScheduleUnavailable';
    if (now < schedule.scheduledAt) return 'NotDue';
    return localClock(now, schedule.timeZone).day === schedule.dayKey ? 'Eligible' : 'OutsideScheduledDay';
  } catch { return 'ScheduleUnavailable'; }
};
const empty = (status: INotificationQuarterSourceResult['status'], reason: INotificationQuarterSourceResult['reason']): Readonly<INotificationQuarterSourceResult> =>
  Object.freeze({ status, reason, nativeDeliveryEnabled: false, notifications: Object.freeze([]) });

/** Pure source preview using current supplied observations. No sender, outbox, audit or workflow mutation. */
export const projectNotificationQuarterSource = (
  supplied: Readonly<INotificationQuarterSourceInput>
): Readonly<INotificationQuarterSourceResult> => {
  let input: Readonly<INotificationQuarterSourceInput>;
  try { input = captureNotificationProtectedData(supplied, 'quarterSource').value; }
  catch { return empty('HOLD', 'SourceInputUnavailable'); }
  if (!input) return empty('HOLD', 'SourceInputUnavailable');
  const scheduleState = checkNotificationQuarterSchedule(input.schedule, input.now);
  if (scheduleState !== 'Eligible') return empty(scheduleState === 'ScheduleUnavailable' ? 'HOLD' : 'SUPPRESSED', scheduleState);
  const schedule = input.schedule!;
  const workflow = input.workflow;
  if (!workflow || !nonempty(workflow.workflowKey) || !nonempty(workflow.employeePersonKey)
    || !['Q1', 'Q2', 'Q3', 'Q4'].includes(workflow.periodKey)
    || !['NotStarted', 'Draft', 'ChangesRequested', 'Submitted', 'Approved', 'Locked'].includes(workflow.state)
    || !Number.isSafeInteger(workflow.sourceVersion) || workflow.sourceVersion <= 0
    || !Number.isSafeInteger(workflow.performanceYearNumber) || workflow.performanceYearNumber <= 0) return empty('HOLD', 'WorkflowUnavailable');

  const config = input.configuration;
  let quarter: ReturnType<typeof buildQuarterLifecycle>[number];
  let dates: IQuarterLifecycleDates;
  try {
    if (!config || !nonempty(config.configKey) || !nonempty(config.configVersion) || !nonempty(config.performance.performanceYear)
      || config.performance.performanceYearNumber !== workflow.performanceYearNumber
      || Number(config.performance.performanceYearEnd.slice(0, 4)) !== workflow.performanceYearNumber) throw new Error('Quarter config unavailable');
    const quarters = buildQuarterLifecycle(config.performance, config.timing, schedule.dayKey);
    quarter = quarters.find(value => value.quarterKey === workflow.periodKey)!;
    dates = buildQuarterLifecycleDates(quarter.quarterEnd, config.timing);
    if (!nonempty(quarter.quarterName) || !config.dates || Object.keys(dates).some(key =>
      dates[key as keyof IQuarterLifecycleDates] !== config.dates[key as keyof IQuarterLifecycleDates])) throw new Error('Quarter dates do not match Config');
  } catch { return empty('HOLD', 'QuarterConfigurationUnavailable'); }

  const people = input.people;
  if (!Array.isArray(people) || people.some(person => !person || typeof person.active !== 'boolean' || !nonempty(person.personKey)
    || !validEmail(person.email) || !Array.isArray(person.appRoles))) return empty('HOLD', 'PeopleRelationshipUnavailable');
  const employees = people.filter(person => person.personKey === workflow.employeePersonKey);
  const employee = employees[0];
  if (employees.length !== 1 || !applicationEntryCapabilities(employee).employee || !validEmail(employee.email)
    || !nonempty(employee.displayName) || people.filter(person => email(person.email) === email(employee.email)).length !== 1) return empty('HOLD', 'PeopleRelationshipUnavailable');
  const resolved = resolveManagerRelationship(employee, people as IProductionPerson[]);
  const managers = people.filter(person => person.personKey === resolved.manager?.personKey);
  const manager = managers[0];
  if (!resolved.result.valid || managers.length !== 1 || !validEmail(manager.email)
    || !hasExactManagerIdentity(employee, manager) || people.filter(person => email(person.email) === email(manager.email)).length !== 1) return empty('HOLD', 'PeopleRelationshipUnavailable');
  if (!input.actionLink || !isSafeNotificationLink(input.actionLink, input.safeLinkPolicy)) return empty('HOLD', 'SafeHubLinkUnavailable');

  const day = schedule.dayKey;
  const employeeOpen = ['NotStarted', 'Draft', 'ChangesRequested'].includes(workflow.state);
  const managerOpen = workflow.state === 'Submitted';
  const eligible: Readonly<Record<QuarterNotificationSourceEvent, boolean>> = {
    QuarterReadiness: employeeOpen && day === dates.earlyReviewReminder,
    QuarterPreparation: employeeOpen && day === dates.preparationReminder,
    QuarterFinalReminder: employeeOpen && day === dates.finalReminder,
    // The supplied occurrence chooses when within the existing finalisation window to notify.
    QuarterFinalisation: employeeOpen && day >= dates.nextQuarterOpens && day <= dates.employeeSubmissionDeadline,
    EmployeeSubmissionDue: employeeOpen && day === dates.employeeSubmissionDeadline,
    EmployeeSubmissionOverdue: employeeOpen && day > dates.employeeSubmissionDeadline,
    ManagerOutstandingReview: managerOpen && day >= quarter.quarterStart,
    ManagerReviewDue: managerOpen && day === dates.managerReviewDeadline,
    ManagerReviewOverdue: managerOpen && day > dates.managerReviewDeadline
  };
  const reasons = QUARTER_NOTIFICATION_SOURCE_EVENTS.filter(kind => schedule.eventKinds.includes(kind) && eligible[kind]);
  if (!reasons.length) return empty('SUPPRESSED', 'NoEligibleEvents');
  const role = managerOpen ? 'Manager' : 'Employee';
  const recipient = role === 'Manager' ? manager : employee;
  const urgency: INotificationQuarterPreview['urgency'] = reasons.some(kind => kind.endsWith('Overdue')) ? 'Overdue'
    : reasons.some(kind => kind.endsWith('Due')) ? 'Due' : managerOpen ? 'Outstanding' : 'Upcoming';
  const facts: INotificationQuarterFacts = {
    subjectKey: workflow.workflowKey, employeePersonKey: employee.personKey, employeeDisplayName: employee.displayName,
    performanceYear: config!.performance.performanceYear, performanceYearNumber: workflow.performanceYearNumber,
    quarter: quarter.quarterKey, quarterName: quarter.quarterName, workflowState: workflow.state, sourceVersion: workflow.sourceVersion,
    configKey: config!.configKey, configVersion: config!.configVersion,
    timing: { earlyReviewReminderDays: config!.timing.earlyReviewReminderDays,
      preparationReminderDays: config!.timing.preparationReminderDays, finalReminderDays: config!.timing.finalReminderDays,
      employeeSubmissionDays: config!.timing.employeeSubmissionDays, managerReviewDays: config!.timing.managerReviewDays },
    dates: { ...dates }, schedule: {
      configKey: schedule.configKey, configVersion: schedule.configVersion, governanceReference: schedule.governanceReference,
      scheduledAt: schedule.scheduledAt, dayKey: schedule.dayKey, localTime: schedule.localTime, timeZone: schedule.timeZone,
      eventKinds: [...schedule.eventKinds]
    }, actionLink: input.actionLink
  };
  const previewIdentity = `QuarterSourcePreviewV1:${encodeNotificationIdentity('outbox', [
    JSON.stringify([facts.subjectKey, facts.employeePersonKey, facts.performanceYearNumber, facts.quarter, facts.sourceVersion]),
    JSON.stringify([role, recipient.personKey]), JSON.stringify([facts.configKey, facts.configVersion, facts.schedule, reasons])
  ])}`;
  return captureNotificationProtectedData<INotificationQuarterSourceResult>({
    status: 'PREVIEW', reason: 'QuarterSourceProjected', nativeDeliveryEnabled: false,
    notifications: [{ previewIdentity, recipientRole: role, recipient: { personKey: recipient.personKey, email: recipient.email }, reasons, urgency, facts,
      message: `${quarter.quarterName}: ${role === 'Manager' ? 'quarter review awaiting your decision' : 'quarter review requires your attention'}. Open the Hub.` }]
  }, 'quarterSourcePreview').value;
};
