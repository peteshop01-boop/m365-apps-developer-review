import type { IConfigRecord } from '../models/ProductionModels';
import { mapProductionConfig, mapQuarterTimingConfig } from './ProductionConfigMapper';

const records: IConfigRecord[] = [
  { id: 1, key: 'PerformanceYear.Current', valueType: 'Text', textValue: '2025/26', active: true },
  { id: 2, key: 'PerformanceYear.Start', valueType: 'Date', dateValue: '2025-11-01T00:00:00Z', active: true },
  { id: 3, key: 'PerformanceYear.End', valueType: 'Date', dateValue: '2026-10-31T00:00:00Z', active: true },
  { id: 4, key: 'Period.Q1', valueType: 'Text', textValue: 'Nov-Jan', active: true },
  { id: 5, key: 'Period.Q2', valueType: 'Text', textValue: 'Feb-Apr', active: true },
  { id: 6, key: 'Period.Q3', valueType: 'Text', textValue: 'May-Jul', active: true },
  { id: 7, key: 'Period.Q4', valueType: 'Text', textValue: 'Aug-Oct', active: true },
  { id: 8, key: 'Workplan.Weight.Core', valueType: 'Number', numberValue: 70, active: true },
  { id: 9, key: 'Workplan.Weight.LocalPersonal', valueType: 'Number', numberValue: 20, active: true },
  { id: 10, key: 'Workplan.Weight.Behaviours', valueType: 'Number', numberValue: 10, active: true },
  { id: 11, key: 'RAG.GreenThresholdPct', valueType: 'Number', numberValue: 90, active: true },
  { id: 12, key: 'RAG.AmberThresholdPct', valueType: 'Number', numberValue: 50, active: true },
  { id: 13, key: 'Aggregation.PermittedMethods', valueType: 'JSON', jsonValue: '["DirectMetric","Additive","WeightedContribution","Composite","Milestone","AccountableOwner"]', active: true },
  { id: 14, key: 'Retention.PolicyStatus', valueType: 'Text', textValue: 'TBC — KCF HR/Data Retention Policy before production go-live', active: true }
];

describe('Production Config mapping', () => {
  it('resolves Performance Year 2025/26 and the configured quarter structure', () => {
    const config = mapProductionConfig(records);
    expect(config.performanceYear).toBe('2025/26');
    expect(config.performanceYearStart).toBe('2025-11-01T00:00:00Z');
    expect(config.performanceYearEnd).toBe('2026-10-31T00:00:00Z');
    expect(config.performanceYearNumber).toBe(2026);
    expect(config.quarters).toEqual({ q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' });
  });

  it('resolves category weighting as 70/20/10 and the remaining controlled values', () => {
    const config = mapProductionConfig(records);
    expect(config.weights).toEqual({ core: 70, personal: 20, behaviours: 10 });
    expect(config.rag).toEqual({ greenThreshold: 90, amberThreshold: 50 });
    expect(config.aggregationMethods).toHaveLength(6);
    expect(config.retentionStatus).toContain('TBC');
  });

  it('rejects duplicate active Config keys', () => {
    expect(() => mapProductionConfig([...records, { ...records[0], id: 99 }])).toThrow('more than one active');
  });

  it('maps the five independently configurable quarter timing values', () => {
    const timingRecords: IConfigRecord[] = [
      { id: 20, key: 'QuarterEarlyReviewReminderDays', valueType: 'Number', numberValue: 30, active: true },
      { id: 21, key: 'QuarterPreparationReminderDays', valueType: 'Number', numberValue: 14, active: true },
      { id: 22, key: 'QuarterFinalReminderDays', valueType: 'Number', numberValue: 7, active: true },
      { id: 23, key: 'EmployeeSubmissionDaysAfterQuarter', valueType: 'Number', numberValue: 7, active: true },
      { id: 24, key: 'ManagerReviewDaysAfterSubmissionDeadline', valueType: 'Number', numberValue: 7, active: true }
    ];
    expect(mapQuarterTimingConfig(timingRecords)).toEqual({
      earlyReviewReminderDays: 30,
      preparationReminderDays: 14,
      finalReminderDays: 7,
      employeeSubmissionDays: 7,
      managerReviewDays: 7
    });
  });
});
