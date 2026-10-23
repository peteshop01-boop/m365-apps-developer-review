import type { IQuarterTimingConfig } from '../models/GovernanceModels';
import type { IProductionConfig } from '../models/ProductionModels';
import type { IQuarterLifecycle, QuarterKey, QuarterReviewState } from '../models/QuarterlyModels';
import { validateQuarterTiming } from './GovernanceValidation';

const DAY_MS = 86400000;
const QUARTERS: QuarterKey[] = ['Q1', 'Q2', 'Q3', 'Q4'];

const parseDateOnly = (value: string, label: string): Date => {
  const dateOnly = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) throw new Error(`${label} must use a valid ISO date.`);
  const date = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOnly) throw new Error(`${label} is invalid.`);
  return date;
};

const dateOnly = (date: Date): string => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * DAY_MS);
const addMonths = (date: Date, months: number): Date => new Date(Date.UTC(
  date.getUTCFullYear(),
  date.getUTCMonth() + months,
  date.getUTCDate()
));
const asUtcDate = (value: Date | string): Date => value instanceof Date
  ? parseDateOnly(value.toISOString(), 'As-of date')
  : parseDateOnly(value, 'As-of date');

const persistedStatus = (state?: QuarterReviewState): IQuarterLifecycle['status'] | undefined => {
  if (state === 'Locked') return 'Locked';
  if (state === 'Approved') return 'Approved';
  if (state === 'Submitted') return 'AwaitingManagerReview';
  return undefined;
};

const deriveStatus = (
  asOf: Date,
  start: Date,
  end: Date,
  employeeDeadline: Date,
  state?: QuarterReviewState
): IQuarterLifecycle['status'] => {
  const stored = persistedStatus(state);
  if (stored) return stored;
  if (asOf.getTime() < start.getTime()) return 'Upcoming';
  if (asOf.getTime() <= end.getTime()) return 'Open';
  if (asOf.getTime() <= employeeDeadline.getTime()) return 'Finalising';
  return 'AwaitingManagerReview';
};

export const buildQuarterLifecycle = (
  config: IProductionConfig,
  timing: IQuarterTimingConfig,
  asOf: Date | string,
  reviewStates: Partial<Record<QuarterKey, QuarterReviewState>> = {}
): IQuarterLifecycle[] => {
  const timingValidation = validateQuarterTiming(timing);
  if (!timingValidation.valid) throw new Error(timingValidation.errors.join(' '));
  const yearStart = parseDateOnly(config.performanceYearStart, 'Performance Year start');
  const yearEnd = parseDateOnly(config.performanceYearEnd, 'Performance Year end');
  const current = asUtcDate(asOf);
  const labels: Record<QuarterKey, string> = {
    Q1: config.quarters.q1,
    Q2: config.quarters.q2,
    Q3: config.quarters.q3,
    Q4: config.quarters.q4
  };

  const results = QUARTERS.map((quarterKey, index): IQuarterLifecycle => {
    const start = addMonths(yearStart, index * 3);
    const end = addDays(addMonths(start, 3), -1);
    const employeeDeadline = addDays(end, timing.employeeSubmissionDays);
    const managerDeadline = addDays(employeeDeadline, timing.managerReviewDays);
    const state = reviewStates[quarterKey];
    const status = deriveStatus(current, start, end, employeeDeadline, state);
    const editableState = !state || state === 'Draft' || state === 'ChangesRequested';
    // Progress is a current-quarter activity. The post-quarter employee window
    // is reserved for submitting the already saved snapshot, not rewriting it.
    const isWithinUpdateWindow = current.getTime() >= start.getTime() && current.getTime() <= end.getTime();
    return {
      performanceYear: config.performanceYear,
      performanceYearNumber: config.performanceYearNumber,
      quarterKey,
      quarterName: `${quarterKey} · ${labels[quarterKey]}`,
      quarterStart: dateOnly(start),
      quarterEnd: dateOnly(end),
      isCurrentQuarter: current.getTime() >= start.getTime() && current.getTime() <= end.getTime(),
      isOpenForProgressUpdates: editableState && isWithinUpdateWindow,
      employeeSubmissionDeadline: dateOnly(employeeDeadline),
      managerReviewDeadline: dateOnly(managerDeadline),
      reminderMilestones: {
        earlyReview: dateOnly(addDays(end, -timing.earlyReviewReminderDays)),
        preparation: dateOnly(addDays(end, -timing.preparationReminderDays)),
        final: dateOnly(addDays(end, -timing.finalReminderDays))
      },
      status,
      priorQuarter: index > 0 ? QUARTERS[index - 1] : undefined,
      nextQuarter: index < QUARTERS.length - 1 ? QUARTERS[index + 1] : undefined
    };
  });

  if (dateOnly(results[0] ? parseDateOnly(results[0].quarterStart, 'Q1 start') : yearStart) !== dateOnly(yearStart)
    || results[3].quarterEnd !== dateOnly(yearEnd)) {
    throw new Error('The configured Performance Year does not form four contiguous three-month quarters.');
  }
  return results;
};

export const getCurrentQuarter = (quarters: IQuarterLifecycle[]): IQuarterLifecycle | undefined => {
  const current = quarters.filter(quarter => quarter.isCurrentQuarter);
  if (current.length > 1) throw new Error('More than one current quarter was calculated.');
  return current[0];
};
