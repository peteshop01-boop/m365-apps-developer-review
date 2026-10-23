import type { IProductionPerson } from '../models/ProductionModels';
import type { IQuarterLifecycle, IQuarterReview, IQuarterReviewItem } from '../models/QuarterlyModels';

// Authority is supplied by own primitive data, never a getter, inherited field
// or truthy value from an untrusted persisted image.
const ownAuthorityValue = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined;
};
const nonblankText = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const sameEmail = (left: unknown, right: unknown): boolean => nonblankText(left) && nonblankText(right)
  && left.trim().toLowerCase() === right.trim().toLowerCase();

export const isActiveQuarterActor = (actor: IProductionPerson | undefined): boolean =>
  ownAuthorityValue(actor, 'active') === true
  && nonblankText(ownAuthorityValue(actor, 'personKey'))
  && nonblankText(ownAuthorityValue(actor, 'email'));

export const canEmployeeReadQuarterReview = (actor: IProductionPerson | undefined, review: IQuarterReview | undefined): boolean =>
  Boolean(isActiveQuarterActor(actor) && actor && review && actor.personKey === ownAuthorityValue(review, 'personKey')
    && sameEmail(actor.email, ownAuthorityValue(review, 'employeeEmail')));

export const canEmployeeEditQuarterReview = (actor: IProductionPerson | undefined, review: IQuarterReview | undefined): boolean =>
  canEmployeeReadQuarterReview(actor, review)
  && (ownAuthorityValue(review, 'state') === 'Draft' || ownAuthorityValue(review, 'state') === 'ChangesRequested')
  && ownAuthorityValue(review, 'accessState') === 'EmployeeEdit'
  && ownAuthorityValue(review, 'transitionStatus') === 'Ready';

export const canEmployeeUpdateQuarterProgress = (
  actor: IProductionPerson | undefined,
  lifecycle: IQuarterLifecycle | undefined,
  review: IQuarterReview | undefined,
  item: IQuarterReviewItem | undefined
): boolean => Boolean(canEmployeeEditQuarterReview(actor, review)
  && lifecycle
  && item
  && lifecycle.performanceYearNumber === review?.performanceYear
  && lifecycle.quarterKey === review?.quarter
  && lifecycle.status === 'Open'
  && lifecycle.isCurrentQuarter
  && lifecycle.isOpenForProgressUpdates
  && item.quarterReviewKey === review?.quarterReviewKey
  && item.personKey === review?.personKey
  && !item.locked);

export const canManagerReadQuarterReview = (actor: IProductionPerson | undefined, review: IQuarterReview | undefined): boolean =>
  Boolean(isActiveQuarterActor(actor) && actor
    && review
    && actor.personKey !== ownAuthorityValue(review, 'personKey')
    && actor.personKey === ownAuthorityValue(review, 'managerPersonKey')
    && sameEmail(actor.email, ownAuthorityValue(review, 'managerEmail')));

export const canManagerDecideQuarterReview = (actor: IProductionPerson | undefined, review: IQuarterReview | undefined): boolean =>
  canManagerReadQuarterReview(actor, review)
  && ownAuthorityValue(review, 'state') === 'Submitted'
  && ownAuthorityValue(review, 'accessState') === 'ManagerDecision'
  && ownAuthorityValue(review, 'transitionStatus') === 'Ready';

export const canManagerAssessQuarterBehaviour = (
  actor: IProductionPerson | undefined,
  review: IQuarterReview | undefined,
  item: IQuarterReviewItem | undefined
): boolean => Boolean(canManagerDecideQuarterReview(actor, review)
  && item
  && item.itemType === 'Behaviour'
  && item.quarterReviewKey === review?.quarterReviewKey
  && item.personKey === review?.personKey
  && !item.locked);

export const canManagerOverrideQuarterRag = (
  actor: IProductionPerson | undefined,
  review: IQuarterReview | undefined,
  item: IQuarterReviewItem | undefined
): boolean => Boolean(canManagerDecideQuarterReview(actor, review)
  && item
  && (item.itemType === 'CoreGold' || item.itemType === 'LocalPersonal')
  && item.quarterReviewKey === review?.quarterReviewKey
  && item.personKey === review?.personKey
  && !item.locked);

export const filterManagerQuarterReviews = (actor: IProductionPerson, reviews: IQuarterReview[]): IQuarterReview[] =>
  reviews.filter(review => canManagerReadQuarterReview(actor, review));

export const assertQuarterReviewSnapshotCurrent = (expected: IQuarterReview, current: IQuarterReview): void => {
  if (expected.quarterReviewKey !== current.quarterReviewKey
    || expected.etag !== current.etag
    || expected.rowVersionToken !== current.rowVersionToken) {
    throw new Error('The Quarter Review changed after this page loaded. Reload before saving.');
  }
};

/**
 * A persisted update must use the concrete SharePoint row version that was read
 * by the caller. A wildcard would turn an optimistic-concurrency update into an
 * unconditional overwrite.
 */
export const assertSpecificPersistedEtag = (etag: string | undefined): void => {
  if (!etag || etag.trim() === '' || etag.trim() === '*') {
    throw new Error('The Quarterly item has no valid saved version. Reload before saving.');
  }
};

/**
 * Verifies that an item is anchored to the supplied persisted Quarter Review
 * and that its natural key cannot address a different review or Workplan item.
 */
export const assertQuarterReviewItemWriteBoundary = (
  review: IQuarterReview,
  item: IQuarterReviewItem
): void => {
  const deterministicItemKey = `${review.quarterReviewKey}|${item.workplanItemKey}`;

  if (item.quarterReviewItemKey !== deterministicItemKey
    || item.quarterReviewKey !== review.quarterReviewKey
    || item.workplanKey !== review.workplanKey
    || item.personKey !== review.personKey
    || item.performanceYear !== review.performanceYear
    || item.quarter !== review.quarter) {
    throw new Error('The Quarterly item does not belong to this Quarter Review. Reload before saving.');
  }
};

export const assertQuarterProgressWriteBoundary = (
  actor: IProductionPerson,
  lifecycle: IQuarterLifecycle,
  review: IQuarterReview,
  item: IQuarterReviewItem
): void => {
  assertQuarterReviewItemWriteBoundary(review, item);
  if (!canEmployeeUpdateQuarterProgress(actor, lifecycle, review, item)) {
    throw new Error('Quarter progress is editable only by the employee during the exact open current quarter.');
  }
};

/**
 * Compares the caller's persisted item snapshot with the freshly read row.
 * Mutable progress fields are intentionally excluded; immutable row identity,
 * assignment, type and version bindings must remain exact.
 */
export const assertQuarterReviewItemSnapshotCurrent = (
  expected: IQuarterReviewItem,
  current: IQuarterReviewItem
): void => {
  assertSpecificPersistedEtag(expected.etag);
  assertSpecificPersistedEtag(current.etag);

  if (!Number.isInteger(expected.id)
    || expected.id <= 0
    || expected.id !== current.id
    || expected.etag !== current.etag
    || expected.quarterReviewItemKey !== current.quarterReviewItemKey
    || expected.quarterReviewKey !== current.quarterReviewKey
    || expected.workplanItemKey !== current.workplanItemKey
    || expected.workplanKey !== current.workplanKey
    || expected.personKey !== current.personKey
    || expected.performanceYear !== current.performanceYear
    || expected.quarter !== current.quarter
    || expected.itemType !== current.itemType
    || expected.reportingStream !== current.reportingStream
    || expected.kpiId !== current.kpiId
    || expected.kpiVersionKey !== current.kpiVersionKey
    || expected.targetVersionKey !== current.targetVersionKey
    || expected.wording !== current.wording
    || expected.itemDescription !== current.itemDescription
    || expected.measure !== current.measure
    || expected.pillar !== current.pillar
    || expected.workstream !== current.workstream
    || expected.unitLabel !== current.unitLabel
    || expected.metricType !== current.metricType
    || expected.scoringDirection !== current.scoringDirection
    || expected.percentageSourceScale !== current.percentageSourceScale
    || expected.baselineValue !== current.baselineValue
    || expected.yearEndTargetValueSnapshot !== current.yearEndTargetValueSnapshot
    || expected.yearEndTargetTextSnapshot !== current.yearEndTargetTextSnapshot
    || expected.quarterTargetValue !== current.quarterTargetValue
    || expected.quarterTargetText !== current.quarterTargetText
    || expected.workplanItemWeightSnapshot !== current.workplanItemWeightSnapshot
    || JSON.stringify(expected.impactAnnualDefinitionSnapshot) !== JSON.stringify(current.impactAnnualDefinitionSnapshot)) {
    throw new Error('The Quarterly item changed after this page loaded. Reload before saving.');
  }
};
