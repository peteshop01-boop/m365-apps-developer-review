import type { IQuarterReviewItem } from '../models/QuarterlyModels';

export const validateQuarterDraftSave = (item: IQuarterReviewItem): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  if (!item.quarterReviewKey.trim() || !item.quarterReviewItemKey.trim() || !item.workplanItemKey.trim()) {
    errors.push('Quarterly Draft save requires stable review and Workplan Item keys.');
  }
  if (item.locked) errors.push('A locked Quarter Review Item cannot be saved.');
  if (item.employeeActualValue !== undefined && !Number.isFinite(item.employeeActualValue)) errors.push('Numeric Actual must be finite when supplied.');
  if (item.quarterEndForecastValue !== undefined && !Number.isFinite(item.quarterEndForecastValue)) errors.push('Numeric forecast must be finite when supplied.');
  return { valid: errors.length === 0, errors };
};
