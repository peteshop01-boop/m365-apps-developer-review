import type { IProductionConfig } from '../models/ProductionModels';
import { buildQuarterLifecycle, getCurrentQuarter } from './QuarterLifecycle';

const config: IProductionConfig = {
  performanceYear: '2025/26',
  performanceYearStart: '2025-11-01T00:00:00Z',
  performanceYearEnd: '2026-10-31T00:00:00Z',
  performanceYearNumber: 2026,
  quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 },
  rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: [],
  retentionStatus: 'TBC'
};
const timing = {
  earlyReviewReminderDays: 30,
  preparationReminderDays: 14,
  finalReminderDays: 7,
  employeeSubmissionDays: 7,
  managerReviewDays: 7
};

describe('QuarterLifecycle', () => {
  it('builds the controlled 2025/26 four-quarter calendar and reminders', () => {
    const quarters = buildQuarterLifecycle(config, timing, '2026-06-15');
    expect(quarters).toHaveLength(4);
    expect(quarters[0]).toEqual(expect.objectContaining({
      quarterKey: 'Q1', quarterStart: '2025-11-01', quarterEnd: '2026-01-31', priorQuarter: undefined, nextQuarter: 'Q2'
    }));
    expect(quarters[2]).toEqual(expect.objectContaining({
      quarterKey: 'Q3',
      quarterStart: '2026-05-01',
      quarterEnd: '2026-07-31',
      isCurrentQuarter: true,
      isOpenForProgressUpdates: true,
      employeeSubmissionDeadline: '2026-08-07',
      managerReviewDeadline: '2026-08-14',
      reminderMilestones: { earlyReview: '2026-07-01', preparation: '2026-07-17', final: '2026-07-24' }
    }));
    expect(quarters[3]).toEqual(expect.objectContaining({ quarterStart: '2026-08-01', quarterEnd: '2026-10-31', nextQuarter: undefined }));
    expect(getCurrentQuarter(quarters)?.quarterKey).toBe('Q3');
  });

  it('opens the next quarter immediately while the prior quarter finalises', () => {
    const quarters = buildQuarterLifecycle(config, timing, '2026-08-05');
    expect(quarters[2]).toEqual(expect.objectContaining({ status: 'Finalising', isCurrentQuarter: false, isOpenForProgressUpdates: false }));
    expect(quarters[3]).toEqual(expect.objectContaining({ status: 'Open', isCurrentQuarter: true, isOpenForProgressUpdates: true }));
  });

  it('derives the manager-review window and respects stored Approved/Locked states', () => {
    const quarters = buildQuarterLifecycle(config, timing, '2026-08-10', { Q1: 'Locked', Q2: 'Approved', Q3: 'Submitted' });
    expect(quarters[0]).toEqual(expect.objectContaining({ status: 'Locked', isOpenForProgressUpdates: false }));
    expect(quarters[1]).toEqual(expect.objectContaining({ status: 'Approved', isOpenForProgressUpdates: false }));
    expect(quarters[2]).toEqual(expect.objectContaining({ status: 'AwaitingManagerReview', isOpenForProgressUpdates: false }));
  });

  it('rejects a Performance Year that does not contain four exact three-month quarters', () => {
    expect(() => buildQuarterLifecycle({ ...config, performanceYearEnd: '2026-09-30' }, timing, '2026-06-15')).toThrow(/four contiguous/);
  });
});
