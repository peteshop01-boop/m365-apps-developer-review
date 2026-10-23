import type { IQuarterEvidenceReference, IQuarterReviewItem } from '../models/QuarterlyModels';
import { reconcileEvidenceCount, validateEvidenceReference } from './QuarterEvidenceValidation';

const item: IQuarterReviewItem = {
  id: 1,
  etag: '"1"',
  quarterReviewItemKey: 'review|item',
  quarterReviewKey: 'workplan|Q3',
  workplanItemKey: 'item',
  workplanKey: 'person|2026',
  personKey: 'person',
  performanceYear: 2026,
  quarter: 'Q3',
  itemType: 'CoreGold',
  kpiId: 'SO1-001',
  wording: 'Approved KPI',
  calculatedRag: 'Green',
  evidenceCount: 1,
  managerApproved: false,
  locked: false
};
const evidence: IQuarterEvidenceReference = {
  evidenceKey: 'evidence-1',
  kind: 'Link',
  personKey: item.personKey,
  workplanKey: item.workplanKey,
  workplanItemKey: item.workplanItemKey,
  quarterReviewKey: item.quarterReviewKey,
  quarterReviewItemKey: item.quarterReviewItemKey,
  performanceYear: item.performanceYear,
  quarter: item.quarter,
  kpiId: item.kpiId,
  description: 'Published delivery evidence.',
  url: 'https://samplefoundation.co.uk/evidence',
  status: 'Draft'
};

describe('QuarterEvidenceValidation', () => {
  it('accepts a stable-key-linked text/link/file evidence contract', () => {
    expect(validateEvidenceReference(evidence, item)).toEqual([]);
    expect(validateEvidenceReference({ ...evidence, kind: 'Text', url: undefined, description: 'Session delivered.' }, item)).toEqual([]);
    expect(validateEvidenceReference({ ...evidence, kind: 'File', url: undefined, serverRelativeFileUrl: '/sites/REVIEW-TEST-SITE/KCFKPI_Evidence/2026/person/Q3/file.pdf' }, item)).toEqual([]);
  });

  it('rejects cross-employee/context evidence and unsafe links', () => {
    expect(validateEvidenceReference({ ...evidence, personKey: 'another', url: 'ftp://example.invalid/file' }, item)).toEqual(expect.arrayContaining([
      expect.stringContaining('stable keys'),
      expect.stringContaining('HTTP(S)')
    ]));
  });

  it('reconciles active evidence without counting withdrawn history', () => {
    expect(reconcileEvidenceCount(item, [evidence, { ...evidence, evidenceKey: 'withdrawn', status: 'Withdrawn' }])).toEqual({ activeCount: 1, matchesStoredCount: true, errors: [] });
  });
});
