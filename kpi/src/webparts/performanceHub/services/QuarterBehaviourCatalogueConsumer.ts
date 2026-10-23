import {
  BEHAVIOUR_V2_ROLE_TIERS,
  BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourV2RatingLabel
} from '../models/BehaviourFrameworkV2Models';
import type {
  IQuarterBehaviourCatalogueConsumerResult,
  IQuarterBehaviourCatalogueIdentityV1,
  IQuarterBehaviourCatalogueRating,
  IQuarterBehaviourCommitmentSnapshotV1,
  IQuarterPerformanceReadProjection
} from '../models/QuarterlyModels';
import { assertIssuedQuarterPerformanceReadProjection } from './QuarterPerformanceReadProjection';

const CONSUMER_VERSION = 'KCF-PD03-001' as const;
const ISSUED_BEHAVIOUR_RESULTS = new WeakMap<object, object>();
const RATING_LABELS: ReadonlyArray<BehaviourV2RatingLabel> = Object.freeze(['Developing', 'Effective', 'Exceptional']);
const nonBlank = (value: string | undefined): value is string => typeof value === 'string' && value.trim().length > 0;
const validDate = (value: string | undefined): boolean => nonBlank(value) && Number.isFinite(Date.parse(value));

const deepFreezeCopy = <T>(value: T): Readonly<T> => {
  if (value === null || typeof value !== 'object') return value as Readonly<T>;
  if (Array.isArray(value)) return Object.freeze(value.map(item => deepFreezeCopy(item))) as unknown as Readonly<T>;
  const copy: Record<string, unknown> = {};
  Object.keys(value as Record<string, unknown>).forEach(key => {
    copy[key] = deepFreezeCopy((value as Record<string, unknown>)[key]);
  });
  return Object.freeze(copy) as Readonly<T>;
};

const sameIdentity = (
  left: Readonly<IQuarterBehaviourCatalogueIdentityV1>,
  right: Readonly<IQuarterBehaviourCatalogueIdentityV1>
): boolean => left.decisionReference === right.decisionReference
  && left.catalogueVersion === right.catalogueVersion
  && left.contentHash.toLowerCase() === right.contentHash.toLowerCase()
  && left.sourceReference === right.sourceReference
  && left.effectiveFrom === right.effectiveFrom;

const assertCatalogueIdentity = (identity: Readonly<IQuarterBehaviourCatalogueIdentityV1>): void => {
  if (identity.decisionReference !== 'KCF-KPI-Sponsor-BEH-V1-001') {
    throw new Error('Behaviour catalogue must cite KCF-KPI-Sponsor-BEH-V1-001.');
  }
  if (!nonBlank(identity.catalogueVersion) || !nonBlank(identity.sourceReference)
    || !/^[a-f0-9]{64}$/i.test(identity.contentHash) || !validDate(identity.effectiveFrom)) {
    throw new Error('Behaviour catalogue requires stable version, 64-hex content hash, source and effective date identity.');
  }
};

const assertSnapshot = (
  snapshot: Readonly<IQuarterBehaviourCommitmentSnapshotV1>,
  observation: Readonly<IQuarterPerformanceReadProjection['behaviourObservations'][number]>,
  catalogueIdentity: Readonly<IQuarterBehaviourCatalogueIdentityV1>
): void => {
  if (!nonBlank(snapshot.selectionKey)) throw new Error('Behaviour selection requires a stable selection key.');
  if (!sameIdentity(snapshot.catalogueIdentity, catalogueIdentity)) {
    throw new Error('Behaviour selection catalogue identity does not match the declared versioned catalogue.');
  }
  if (BEHAVIOUR_V2_VALUE_IDS.indexOf(snapshot.headlineId) < 0 || snapshot.headlineId !== observation.headlineId) {
    throw new Error('Behaviour selection is crossed outside its approved headline identity.');
  }
  if (BEHAVIOUR_V2_ROLE_TIERS.indexOf(snapshot.roleTier) < 0) {
    throw new Error('Behaviour selection requires one of the three approved role levels.');
  }
  if (!nonBlank(snapshot.focusAreaKey) || !nonBlank(snapshot.focusAreaTitle)) {
    throw new Error('Behaviour selection requires a governed focus area identity and title.');
  }
  if (!nonBlank(snapshot.targetTextSnapshot) || !nonBlank(snapshot.myCommitment) || !nonBlank(snapshot.howWillWeKnow)) {
    throw new Error('Behaviour selection requires target snapshot, MY COMMITMENT and HOW WILL WE KNOW evidence.');
  }
  if (snapshot.selectionPath === 'SuggestedTarget') {
    if (!nonBlank(snapshot.suggestedTargetKey)) {
      throw new Error('Suggested-target Behaviour selection requires a governed target key.');
    }
  } else if (snapshot.selectionPath === 'OwnTarget') {
    if (snapshot.suggestedTargetKey !== undefined) {
      throw new Error('Own-target Behaviour selection must not claim a suggested target key.');
    }
  } else {
    throw new Error('Behaviour selection path must be SuggestedTarget or OwnTarget.');
  }
  if (snapshot.managerDecision !== undefined
    && snapshot.managerDecision !== 'Agreed' && snapshot.managerDecision !== 'ChangesRequested') {
    throw new Error('Behaviour manager decision must be Agreed or Changes Requested.');
  }
  const hasManagerAudit = snapshot.managerDecisionByPersonKey !== undefined
    || snapshot.managerDecisionAt !== undefined || snapshot.managerDecisionComment !== undefined;
  if (snapshot.managerDecision) {
    if (!nonBlank(snapshot.managerDecisionByPersonKey) || !validDate(snapshot.managerDecisionAt)) {
      throw new Error('Behaviour manager decision requires actor and decision timestamp.');
    }
    if (snapshot.managerDecision === 'ChangesRequested' && !nonBlank(snapshot.managerDecisionComment)) {
      throw new Error('Behaviour Changes Requested decision requires a manager comment.');
    }
  } else if (hasManagerAudit) {
    throw new Error('Behaviour manager decision audit cannot exist without a decision.');
  }
  if (snapshot.retiredAtSnapshot !== undefined && !validDate(snapshot.retiredAtSnapshot)) {
    throw new Error('Retired Behaviour target snapshot requires a valid retirement timestamp.');
  }
};

const assertRating = (value: BehaviourV2RatingLabel | undefined): void => {
  if (value !== undefined && RATING_LABELS.indexOf(value) < 0) {
    throw new Error('Behaviour rating must be headline-only Developing, Effective or Exceptional.');
  }
};

const sameSnapshot = (
  left: Readonly<IQuarterBehaviourCommitmentSnapshotV1>,
  right: Readonly<IQuarterBehaviourCommitmentSnapshotV1>
): boolean => left.selectionKey === right.selectionKey
  && sameIdentity(left.catalogueIdentity, right.catalogueIdentity)
  && left.headlineId === right.headlineId
  && left.roleTier === right.roleTier
  && left.focusAreaKey === right.focusAreaKey
  && left.focusAreaTitle === right.focusAreaTitle
  && left.selectionPath === right.selectionPath
  && left.suggestedTargetKey === right.suggestedTargetKey
  && left.targetTextSnapshot === right.targetTextSnapshot
  && left.myCommitment === right.myCommitment
  && left.howWillWeKnow === right.howWillWeKnow
  && left.managerDecision === right.managerDecision
  && left.managerDecisionByPersonKey === right.managerDecisionByPersonKey
  && left.managerDecisionAt === right.managerDecisionAt
  && left.managerDecisionComment === right.managerDecisionComment
  && left.retiredAtSnapshot === right.retiredAtSnapshot;

/**
 * Consumes stored, versioned catalogue snapshots. Detailed target wording is
 * data supplied by the governed catalogue/employee path and is never embedded
 * in this quarterly consumer.
 */
export const consumeQuarterBehaviourCatalogue = (
  projection: Readonly<IQuarterPerformanceReadProjection>
): Readonly<IQuarterBehaviourCatalogueConsumerResult> => {
  const trustedProjection = assertIssuedQuarterPerformanceReadProjection(projection);
  const storedSelections = trustedProjection.behaviourObservations
    .flatMap(observation => [...(observation.selectedCommitments || [])]);
  if (!storedSelections.length) {
    throw new Error('Behaviour catalogue consumer requires a stored governed catalogue identity.');
  }
  const catalogueIdentity = storedSelections[0].catalogueIdentity;
  assertCatalogueIdentity(catalogueIdentity);
  if (storedSelections.some(snapshot => !sameIdentity(snapshot.catalogueIdentity, catalogueIdentity))) {
    throw new Error('Behaviour projection contains mixed governed catalogue identities.');
  }
  const observedHeadlineIds = Array.from(new Set(trustedProjection.behaviourObservations.map(row => row.headlineId)));
  if (observedHeadlineIds.length !== BEHAVIOUR_V2_VALUE_IDS.length
    || BEHAVIOUR_V2_VALUE_IDS.some(headlineId => observedHeadlineIds.indexOf(headlineId) < 0)) {
    throw new Error('Behaviour projection must preserve the exact five approved headline identities.');
  }

  const selections = new Map<string, Readonly<IQuarterBehaviourCommitmentSnapshotV1>>();
  const ratings: IQuarterBehaviourCatalogueRating[] = [];
  trustedProjection.behaviourObservations.forEach(observation => {
    assertRating(observation.employeeRating);
    assertRating(observation.managerRating);
    assertRating(observation.finalRating);
    ratings.push({
      quarterReviewKey: observation.quarterReviewKey,
      personKey: observation.personKey,
      period: observation.period,
      headlineId: observation.headlineId,
      behaviourAnnualCurrentLevelV2: observation.behaviourAnnualCurrentLevelV2,
      behaviourAnnualTargetLevelV2: observation.behaviourAnnualTargetLevelV2,
      behaviourAnnualTargetJustificationV2: observation.behaviourAnnualTargetJustificationV2,
      behaviourAnnualTargetSourceWorkplanItemKeyV2: observation.behaviourAnnualTargetSourceWorkplanItemKeyV2,
      behaviourAnnualTargetSourceEtagV2: observation.behaviourAnnualTargetSourceEtagV2,
      behaviourAnnualTargetSourceWorkplanVersionV2: observation.behaviourAnnualTargetSourceWorkplanVersionV2,
      behaviourAnnualTargetSourceApprovalKeyV2: observation.behaviourAnnualTargetSourceApprovalKeyV2,
      employeeRating: observation.employeeRating,
      managerRating: observation.managerRating,
      finalRating: observation.finalRating,
      employeeEvidence: observation.employeeEvidence,
      managerEvidence: observation.managerEvidence,
      finalEvidence: observation.finalEvidence,
      supportingEvidence: observation.supportingEvidence
    });
    (observation.selectedCommitments || []).forEach(snapshot => {
      assertSnapshot(snapshot, observation, catalogueIdentity);
      const existing = selections.get(snapshot.selectionKey);
      if (existing && !sameSnapshot(existing, snapshot)) {
        throw new Error('Behaviour selection key has conflicting stored snapshots.');
      }
      selections.set(snapshot.selectionKey, snapshot);
    });
  });

  const selected = Array.from(selections.values()).sort((left, right) => left.selectionKey.localeCompare(right.selectionKey));
  const selectionGuidance: IQuarterBehaviourCatalogueConsumerResult['selectionGuidance'] = selected.length < 3
    ? 'BelowGuidance' : selected.length > 5 ? 'AboveGuidance' : 'WithinGuidance';
  const issued = deepFreezeCopy({
    consumerVersion: CONSUMER_VERSION,
    projectionIdentity: trustedProjection.projectionIdentity,
    catalogueIdentity,
    headlineIds: [...BEHAVIOUR_V2_VALUE_IDS],
    roleTiers: [...BEHAVIOUR_V2_ROLE_TIERS],
    selections: selected,
    selectionGuidance,
    ratings
  });
  ISSUED_BEHAVIOUR_RESULTS.set(issued as object, trustedProjection as object);
  return issued;
};

export const assertIssuedQuarterBehaviourResult = (
  candidate: Readonly<IQuarterBehaviourCatalogueConsumerResult>,
  projection: Readonly<IQuarterPerformanceReadProjection>
): Readonly<IQuarterBehaviourCatalogueConsumerResult> => {
  if (candidate === null || typeof candidate !== 'object'
    || ISSUED_BEHAVIOUR_RESULTS.get(candidate as object) !== projection) {
    throw new Error('Decision composition requires the exact internally issued Behaviour result for this projection.');
  }
  return candidate;
};
