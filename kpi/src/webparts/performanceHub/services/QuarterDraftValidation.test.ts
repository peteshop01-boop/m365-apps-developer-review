import type { IQuarterReviewItem } from '../models/QuarterlyModels';
import { validateQuarterDraftSave } from './QuarterDraftValidation';

const item: IQuarterReviewItem = {
  id: 0, etag: '*', quarterReviewItemKey: 'review|item', quarterReviewKey: 'review', workplanItemKey: 'item',
  workplanKey: 'workplan', personKey: 'person', performanceYear: 2026, quarter: 'Q4', itemType: 'CoreGold',
  kpiId: 'SO1-001', wording: 'Core KPI', employeeActualValue: 125, quarterEndForecastValue: 180,
  calculatedRag: 'NotRated', evidenceCount: 0, managerApproved: false, locked: false
};

describe('QuarterDraftValidation', () => {
  it('allows an incremental Draft save with blank StatusUpdate', () => {
    expect(validateQuarterDraftSave({ ...item, statusUpdate: undefined })).toEqual({ valid: true, errors: [] });
    expect(validateQuarterDraftSave({ ...item, statusUpdate: ' ' })).toEqual({ valid: true, errors: [] });
  });

  it('rejects invalid numeric data, missing stable keys and locked rows', () => {
    expect(validateQuarterDraftSave({ ...item, quarterReviewItemKey: '', employeeActualValue: Number.NaN, locked: true }).errors).toEqual(expect.arrayContaining([
      expect.stringContaining('stable'),
      expect.stringContaining('finite'),
      expect.stringContaining('locked')
    ]));
  });
});
