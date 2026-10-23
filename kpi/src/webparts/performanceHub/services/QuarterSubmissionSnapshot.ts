import type { IProductionPerson } from '../models/ProductionModels';
import type {
  IProgressEntry,
  IProgressLedger,
  IQuarterEvidenceReference,
  IQuarterLifecycle,
  IQuarterReview,
  IQuarterReviewItem,
  IQuarterSubmissionItemSnapshot,
  IQuarterSubmissionSnapshot
} from '../models/QuarterlyModels';
import { canEmployeeEditQuarterReview, assertQuarterReviewItemWriteBoundary } from './QuarterReviewAuthorisation';
import { assertQuarterImpactAnnualSnapshot } from './QuarterImpactSnapshot';
import { createQuarterTransitionPlan, type IQuarterTransitionPlan } from './QuarterReviewLifecycle';
import { evaluateQuarterSubmissionReadiness } from './QuarterSubmissionReadiness';
import { ownSnapshotValue } from './QuarterBehaviourTargetSnapshot';

const managerOwnedItemFields = Object.freeze([
  'etag',
  'managerBehaviourRating',
  'finalBehaviourRating',
  'managerBehaviourEvidenceV2',
  'managerBehaviourAssessmentV2',
  'finalBehaviourEvidenceV2',
  'finalBehaviourAssessmentV2',
  'managerBehaviourAssessment',
  'managerComment',
  'managerOverride',
  'finalApprovedRag',
  'managerApproved',
  'locked'
] as const);

const invalidSnapshotData = (): never => {
  throw new Error('Quarter submission inputs must be finite plain data without accessors or cycles.');
};
/** Capture own plain data once; never execute accessors or inherit source authority. */
const deepFreezeCopy = <T>(value: T): Readonly<T> => {
  const ancestors = new WeakSet<object>();
  const detach = (candidate: unknown): unknown => {
    if (candidate === null || candidate === undefined || typeof candidate === 'string' || typeof candidate === 'boolean') return candidate;
    if (typeof candidate === 'number') return Number.isFinite(candidate) ? candidate : invalidSnapshotData();
    if (typeof candidate !== 'object') return invalidSnapshotData();
    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null && !(Array.isArray(candidate) && prototype === Array.prototype)
      || ancestors.has(candidate)) return invalidSnapshotData();
    ancestors.add(candidate);
    try {
      const copy: Record<string, unknown> | unknown[] = Array.isArray(candidate) ? new Array(candidate.length) : {};
      Object.keys(candidate).forEach(key => {
        const descriptor = Object.getOwnPropertyDescriptor(candidate, key)!;
        if (!('value' in descriptor)) return invalidSnapshotData();
        Object.defineProperty(copy, key, { value: detach(descriptor.value), enumerable: true });
      });
      return Object.freeze(copy);
    } finally { ancestors.delete(candidate); }
  };
  return detach(value) as Readonly<T>;
};

const employeeSubmissionItem = (item: IQuarterReviewItem): IQuarterSubmissionItemSnapshot => {
  const copy = { ...item } as unknown as Record<string, unknown>;
  managerOwnedItemFields.forEach(field => delete copy[field]);
  copy.reportingStream = item.reportingStream
    || (item.itemType === 'CoreGold' ? 'CoreGold' : item.itemType === 'LocalPersonal' ? 'Impact' : 'Behaviour');
  return deepFreezeCopy(copy) as IQuarterSubmissionItemSnapshot;
};

const exactIsoInstant = (value: string): boolean => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
};

const positiveSafeVersion = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const hasExpectedSnapshotKey = (value: unknown, reviewKey: string): boolean => {
  if (typeof value !== 'string' || typeof reviewKey !== 'string' || !reviewKey.trim()) return false;
  const prefix = reviewKey + '|submission|';
  if (!value.startsWith(prefix)) return false;
  const correlationKey = value.slice(prefix.length);
  return !!correlationKey.trim() && correlationKey === correlationKey.trim();
};

interface IQuarterSubmissionContent {
  items: ReadonlyArray<IQuarterSubmissionItemSnapshot>;
  evidence: ReadonlyArray<Readonly<IQuarterEvidenceReference>>;
  progressEntries: ReadonlyArray<Readonly<IProgressEntry>>;
}

const buildSubmissionContent = (
  review: IQuarterReview,
  items: IQuarterReviewItem[],
  evidence: IQuarterEvidenceReference[],
  progressLedgers: IProgressLedger[]
): IQuarterSubmissionContent => {
  const itemKeys = new Set<string>();
  items.forEach(item => {
    assertQuarterReviewItemWriteBoundary(review, item);
    if (itemKeys.has(item.quarterReviewItemKey)) throw new Error('Quarter submission contains a duplicate item key.');
    itemKeys.add(item.quarterReviewItemKey);
    if (item.itemType === 'LocalPersonal' && item.impactAnnualDefinitionSnapshot) assertQuarterImpactAnnualSnapshot(item);
  });

  const relevantEvidence = evidence.filter(reference => reference.quarterReviewKey === review.quarterReviewKey);
  if (new Set(relevantEvidence.map(reference => reference.evidenceKey)).size !== relevantEvidence.length) {
    throw new Error('Quarter submission contains duplicate evidence keys.');
  }
  relevantEvidence.forEach(reference => {
    if (reference.workplanKey !== review.workplanKey
      || reference.personKey !== review.personKey
      || reference.performanceYear !== review.performanceYear
      || reference.quarter !== review.quarter
      || !itemKeys.has(reference.quarterReviewItemKey)) {
      throw new Error('Quarter evidence is crossed outside the submitted review.');
    }
  });
  items.forEach(item => {
    const actualEvidenceCount = relevantEvidence.filter(reference => reference.quarterReviewItemKey === item.quarterReviewItemKey).length;
    if (item.evidenceCount !== actualEvidenceCount) {
      throw new Error(`${item.kpiId || item.wording} evidence count does not match the exact submitted references.`);
    }
  });

  const relevantProgress: IProgressEntry[] = [];
  progressLedgers.filter(ledger => ledger.workplanKey === review.workplanKey && ledger.personKey === review.personKey)
    .forEach(ledger => ledger.entries.forEach(entry => {
      if (entry.quarterReviewKey !== review.quarterReviewKey) return;
      if (entry.quarter !== review.quarter || !entry.quarterReviewItemKey || !itemKeys.has(entry.quarterReviewItemKey)) {
        throw new Error('Quarter progress is crossed outside the submitted review.');
      }
      relevantProgress.push(entry);
    }));
  if (new Set(relevantProgress.map(entry => entry.entryKey)).size !== relevantProgress.length) {
    throw new Error('Quarter submission contains duplicate progress entry keys.');
  }

  return {
    items: Object.freeze(items.map(employeeSubmissionItem)
      .sort((left, right) => left.quarterReviewItemKey.localeCompare(right.quarterReviewItemKey))),
    evidence: Object.freeze(relevantEvidence.map(reference => deepFreezeCopy(reference))
      .sort((left, right) => left.evidenceKey.localeCompare(right.evidenceKey))),
    progressEntries: Object.freeze(relevantProgress.map(entry => deepFreezeCopy(entry))
      .sort((left, right) => left.entryKey.localeCompare(right.entryKey)))
  };
};

export const createQuarterSubmissionSnapshot = (
  lifecycle: IQuarterLifecycle,
  review: IQuarterReview,
  items: IQuarterReviewItem[],
  evidence: IQuarterEvidenceReference[],
  progressLedgers: IProgressLedger[],
  actor: IProductionPerson,
  correlationKey: string,
  capturedAt: string
): Readonly<IQuarterSubmissionSnapshot> => {
  lifecycle = deepFreezeCopy(lifecycle);
  actor = deepFreezeCopy(actor);
  // Validate descriptors before readiness/identity checks can read caller-owned values.
  review = deepFreezeCopy(review);
  items = deepFreezeCopy(items) as IQuarterReviewItem[];
  evidence = deepFreezeCopy(evidence) as IQuarterEvidenceReference[];
  progressLedgers = deepFreezeCopy(progressLedgers) as IProgressLedger[];
  if (!canEmployeeEditQuarterReview(actor, review)) {
    throw new Error('Only the review employee may create the submission snapshot.');
  }
  if (!positiveSafeVersion(ownSnapshotValue(review, 'performanceYear'))
    || !positiveSafeVersion(ownSnapshotValue(lifecycle, 'performanceYearNumber'))
    || !['Q1', 'Q2', 'Q3', 'Q4'].includes(ownSnapshotValue(review, 'quarter') as string)
    || ownSnapshotValue(review, 'workplanKey') !== `${review.personKey}|${review.performanceYear}`
    || ownSnapshotValue(review, 'quarterReviewKey') !== `${review.workplanKey}|${review.quarter}`) {
    throw new Error('Quarter submission snapshot requires a positive safe year and its exact Workplan/Quarter keys.');
  }
  if (lifecycle.performanceYearNumber !== review.performanceYear || ownSnapshotValue(lifecycle, 'quarterKey') !== review.quarter
    || ownSnapshotValue(lifecycle, 'status') !== 'Finalising') {
    throw new Error('Quarter submission snapshotting is allowed only for the exact finalising quarter.');
  }
  if (!positiveSafeVersion(review.rowVersionToken) || review.rowVersionToken === Number.MAX_SAFE_INTEGER) {
    throw new Error('Quarter submission snapshot requires a positive safe source version that can advance.');
  }
  if (!correlationKey.trim() || !exactIsoInstant(capturedAt)) {
    throw new Error('Quarter submission snapshot requires a correlation key and exact UTC timestamp.');
  }
  const readiness = evaluateQuarterSubmissionReadiness(lifecycle, review, items);
  if (!readiness.ready) throw new Error(`Quarter submission is not ready: ${readiness.blockers.join(' ')}`);
  const content = buildSubmissionContent(review, items, evidence, progressLedgers);
  return deepFreezeCopy({
    snapshotVersion: 'KCF-QUARTER-SUBMISSION-001',
    snapshotKey: `${review.quarterReviewKey}|submission|${correlationKey.trim()}`,
    quarterReviewKey: review.quarterReviewKey,
    workplanKey: review.workplanKey,
    personKey: review.personKey,
    performanceYear: review.performanceYear,
    quarter: review.quarter,
    sourceReviewRowVersionToken: review.rowVersionToken,
    submittedByPersonKey: actor.personKey,
    submittedByEmail: actor.email.trim().toLowerCase(),
    capturedAt,
    ...content
  });
};

/** Compare validated content independently of record-key order; never rewrite the stored snapshot. */
const comparableSnapshotJson = (value: unknown): string => {
  const order = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) return candidate.map(order);
    if (candidate === null || typeof candidate !== 'object') return candidate;
    const copy: Record<string, unknown> = {};
    Object.keys(candidate).sort().forEach(key => Object.defineProperty(copy, key,
      { value: order((candidate as Record<string, unknown>)[key]), enumerable: true }));
    return copy;
  };
  return JSON.stringify(order(value));
};

export const assertQuarterSubmissionSnapshotCurrent = (
  review: IQuarterReview,
  items: IQuarterReviewItem[],
  evidence: IQuarterEvidenceReference[],
  progressLedgers: IProgressLedger[]
): void => {
  // Validate descriptors before readiness/identity checks can read caller-owned values.
  review = deepFreezeCopy(review);
  items = deepFreezeCopy(items) as IQuarterReviewItem[];
  evidence = deepFreezeCopy(evidence) as IQuarterEvidenceReference[];
  progressLedgers = deepFreezeCopy(progressLedgers) as IProgressLedger[];
  const snapshot = review.submissionSnapshot;
  if (!snapshot
    || !positiveSafeVersion(ownSnapshotValue(review, 'performanceYear'))
    || !positiveSafeVersion(ownSnapshotValue(snapshot, 'performanceYear'))
    || ownSnapshotValue(review, 'workplanKey') !== `${review.personKey}|${review.performanceYear}`
    || ownSnapshotValue(review, 'quarterReviewKey') !== `${review.workplanKey}|${review.quarter}`
    || snapshot.snapshotVersion !== 'KCF-QUARTER-SUBMISSION-001'
    || !hasExpectedSnapshotKey(snapshot.snapshotKey, review.quarterReviewKey)
    || typeof snapshot.submittedByPersonKey !== 'string' || !snapshot.submittedByPersonKey.trim()
    || snapshot.submittedByPersonKey !== review.personKey
    || typeof snapshot.submittedByEmail !== 'string' || !snapshot.submittedByEmail.trim()
    || typeof review.employeeEmail !== 'string'
    || snapshot.submittedByEmail.trim().toLowerCase() !== review.employeeEmail.trim().toLowerCase()
    || typeof snapshot.capturedAt !== 'string' || !exactIsoInstant(snapshot.capturedAt)
    || !positiveSafeVersion(snapshot.sourceReviewRowVersionToken) || !positiveSafeVersion(review.rowVersionToken)
    || snapshot.quarterReviewKey !== review.quarterReviewKey
    || snapshot.workplanKey !== review.workplanKey
    || snapshot.personKey !== review.personKey
    || snapshot.performanceYear !== review.performanceYear
    || snapshot.quarter !== review.quarter
    || snapshot.sourceReviewRowVersionToken >= review.rowVersionToken) {
    throw new Error('The Quarter Review has no valid immutable employee submission snapshot.');
  }
  const content = buildSubmissionContent(review, items, evidence, progressLedgers);
  if (comparableSnapshotJson(content.items) !== comparableSnapshotJson(snapshot.items)
    || comparableSnapshotJson(content.evidence) !== comparableSnapshotJson(snapshot.evidence)
    || comparableSnapshotJson(content.progressEntries) !== comparableSnapshotJson(snapshot.progressEntries)) {
    throw new Error('The submitted Quarter Review inputs changed after employee submission.');
  }
};

export interface IQuarterSubmissionTransitionPlan extends IQuarterTransitionPlan {
  snapshot: Readonly<IQuarterSubmissionSnapshot>;
}

export const createQuarterSubmissionTransitionPlan = (
  lifecycle: IQuarterLifecycle,
  review: IQuarterReview,
  items: IQuarterReviewItem[],
  evidence: IQuarterEvidenceReference[],
  progressLedgers: IProgressLedger[],
  actor: IProductionPerson,
  correlationKey: string,
  eventAt: string,
  comment?: string
): IQuarterSubmissionTransitionPlan => {
  const snapshot = createQuarterSubmissionSnapshot(
    lifecycle, review, items, evidence, progressLedgers, actor, correlationKey, eventAt
  );
  const action = review.state === 'ChangesRequested' ? 'Resubmit' : 'Submit';
  const plan = createQuarterTransitionPlan(review, actor, action, correlationKey, eventAt, comment, snapshot);
  return { ...plan, snapshot };
};
