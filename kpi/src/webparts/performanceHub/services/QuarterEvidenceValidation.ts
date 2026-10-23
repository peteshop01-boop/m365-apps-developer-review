import type { IQuarterEvidenceReference, IQuarterReviewItem } from '../models/QuarterlyModels';

const isWebUrl = (value?: string): boolean => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

export const validateEvidenceReference = (
  evidence: IQuarterEvidenceReference,
  item: IQuarterReviewItem
): string[] => {
  const errors: string[] = [];
  if (!evidence.evidenceKey.trim()) errors.push('EvidenceKey is required.');
  if (evidence.personKey !== item.personKey
    || evidence.workplanKey !== item.workplanKey
    || evidence.workplanItemKey !== item.workplanItemKey
    || evidence.quarterReviewKey !== item.quarterReviewKey
    || evidence.quarterReviewItemKey !== item.quarterReviewItemKey
    || evidence.performanceYear !== item.performanceYear
    || evidence.quarter !== item.quarter) {
    errors.push('Evidence context must match the employee Quarter Review Item stable keys.');
  }
  if (item.itemType === 'CoreGold' && evidence.kpiId !== item.kpiId) errors.push('Core evidence KPIID must match the Quarter Review Item.');
  if (!evidence.description.trim()) errors.push('Evidence requires an accessible description.');
  if (evidence.kind === 'Link' && !isWebUrl(evidence.url)) errors.push('Link evidence requires a valid HTTP(S) URL.');
  if (evidence.kind === 'File' && !evidence.serverRelativeFileUrl?.trim()) errors.push('File evidence requires a server-relative Evidence library URL.');
  if (evidence.kind === 'Text' && evidence.description.trim().length < 3) errors.push('Text evidence must contain meaningful content.');
  return errors;
};

export const reconcileEvidenceCount = (
  item: IQuarterReviewItem,
  evidence: IQuarterEvidenceReference[]
): { activeCount: number; matchesStoredCount: boolean; errors: string[] } => {
  const linked = evidence.filter(reference => reference.quarterReviewItemKey === item.quarterReviewItemKey && reference.status !== 'Withdrawn');
  const errors = linked.reduce<string[]>((all, reference) => [...all, ...validateEvidenceReference(reference, item)], []);
  return { activeCount: linked.length, matchesStoredCount: linked.length === item.evidenceCount, errors };
};
