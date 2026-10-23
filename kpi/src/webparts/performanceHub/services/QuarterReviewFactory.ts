import { assertApprovedBehaviourTargetSource, resolveCoreQuarterTarget } from './QuarterReviewItemPersistence';
import { isSpecificBehaviourSourceEtag, materialiseQuarterBehaviourTarget, materialiseBehaviourSourceData, ownSnapshotValue } from './QuarterBehaviourTargetSnapshot';
import type {
  IAnnualWorkplan,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  ICoreKpiCatalogueItem,
  ICoreWorkplanItem,
  IPersonalWorkplanItem,
  IProductionPerson
} from '../models/ProductionModels';
import type {
  IQuarterLifecycle,
  IQuarterReview,
  IQuarterReviewItem,
  QuarterKey
} from '../models/QuarterlyModels';
import { personalQuarterTarget } from './PersonalWorkplanPolicy';
import { snapshotOverallDeliveryWeightConfiguration } from './QuarterOverallDelivery';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION } from '../models/BehaviourFrameworkV2Models';
import { createBehaviourPeriodSnapshotV2, validateBehaviourPlanningLevelsV1 }
  from './BehaviourFrameworkV2Policy';
import { validateBehaviourAssignments } from './AnnualWorkplanValidation';
import {
  createQuarterImpactAnnualDefinitionSnapshot,
  type IQuarterImpactAnnualSource
} from './QuarterImpactSnapshot';

const behaviourQuarterTarget = (item: IBehaviourWorkplanItem, quarter: QuarterKey): string | undefined => {
  if (quarter === 'Q1') return item.q1TargetText;
  if (quarter === 'Q2') return item.q2TargetText;
  if (quarter === 'Q3') return item.q3TargetText;
  return item.q4TargetText;
};

const behaviourQuarterTargetRating = (item: IBehaviourWorkplanItem, quarter: QuarterKey): IBehaviourWorkplanItem['targetRating'] => {
  if (quarter === 'Q1') return item.q1TargetRating || item.targetRating;
  if (quarter === 'Q2') return item.q2TargetRating || item.targetRating;
  if (quarter === 'Q3') return item.q3TargetRating || item.targetRating;
  return item.q4TargetRating || item.targetRating;
};

export interface IQuarterDraftSource {
  workplan: IAnnualWorkplan;
  employee: IProductionPerson;
  manager: IProductionPerson;
  lifecycle: IQuarterLifecycle;
  coreCatalogue: ICoreKpiCatalogueItem[];
  coreItems: ICoreWorkplanItem[];
  personalItems: Array<IPersonalWorkplanItem & IQuarterImpactAnnualSource>;
  behaviours: IBehaviourSummary[];
  behaviourItems: IBehaviourWorkplanItem[];
}

export const QUARTERLY_ELIGIBLE_ANNUAL_STATES: ReadonlyArray<IAnnualWorkplan['state']> = [
  'Submitted',
  'Approved',
  'Locked'
];

export const isAnnualWorkplanEligibleForQuarterlyDraft = (workplan: IAnnualWorkplan): boolean =>
  QUARTERLY_ELIGIBLE_ANNUAL_STATES.indexOf(ownSnapshotValue(workplan, 'state') as IAnnualWorkplan['state']) >= 0
  && ownSnapshotValue(workplan, 'transitionStatus') === 'Ready';

export const buildQuarterReviewDraft = (source: IQuarterDraftSource): { review: IQuarterReview; items: IQuarterReviewItem[] } => {
  // Capture all annual authority inputs before identity, target or eligibility
  // reads. Core/Impact/catalogue/people/period data obey the same plain-data rule.
  source = materialiseBehaviourSourceData(source);
  const { workplan, behaviourItems, employee, manager, lifecycle } = source;
  if (ownSnapshotValue(employee, 'active') !== true || ownSnapshotValue(manager, 'active') !== true
    || typeof ownSnapshotValue(employee, 'personKey') !== 'string' || !employee.personKey.trim()
    || typeof ownSnapshotValue(manager, 'personKey') !== 'string' || !manager.personKey.trim()
    || typeof ownSnapshotValue(employee, 'email') !== 'string' || !employee.email.trim()
    || typeof ownSnapshotValue(manager, 'email') !== 'string' || !manager.email.trim()
    || ownSnapshotValue(workplan, 'personKey') !== employee.personKey
    || ownSnapshotValue(workplan, 'managerPersonKey') !== manager.personKey) {
    throw new Error('Quarter Review preparation requires the active Workplan employee and assigned manager.');
  }
  if (!isAnnualWorkplanEligibleForQuarterlyDraft(workplan)) {
    throw new Error('Quarter Review preparation requires a transition-ready Submitted, Approved or Locked Annual Workplan.');
  }
  if (!Number.isSafeInteger(workplan.performanceYear) || workplan.performanceYear <= 0
    || lifecycle.performanceYearNumber !== workplan.performanceYear
    || ['Q1', 'Q2', 'Q3', 'Q4'].indexOf(lifecycle.quarterKey) < 0) {
    throw new Error('Quarter Review preparation requires the exact Workplan year and quarter.');
  }
  const quarterReviewKey = `${workplan.workplanKey}|${lifecycle.quarterKey}`;
  const activeBehaviours = behaviourItems.filter(item => item.activeInWorkplan);
  const behaviourV02 = activeBehaviours.some(item => Boolean(item.behaviourSnapshotV2)
    || item.behaviourVersionKey === BEHAVIOUR_FRAMEWORK_V2_VERSION);
  if (behaviourV02 && validateBehaviourAssignments(source.behaviours, behaviourItems).state !== 'complete')
    throw new Error('Quarter Review requires the complete accepted v02 annual Behaviour snapshot.');
  if (behaviourV02 && (workplan.state !== 'Approved' && workplan.state !== 'Locked'
    || !workplan.transitionCorrelationKey?.trim()
    || !Number.isSafeInteger(workplan.rowVersionToken) || workplan.rowVersionToken < 1
    || activeBehaviours.some(item => !isSpecificBehaviourSourceEtag(ownSnapshotValue(item, 'etag'))
      || item.workplanKey !== workplan.workplanKey || item.personKey !== employee.personKey
      || item.performanceYear !== workplan.performanceYear
      || !item.workplanItemKey?.trim() || !item.behaviourSnapshotV2
      || item.behaviourSnapshotV2.valueId !== item.behaviourId
      || !validateBehaviourPlanningLevelsV1(item.behaviourPlanningLevelsV1)?.targetLevel)))
    throw new Error('Quarter Review requires an approved, attributed annual v02 Behaviour version.');
  // Do not relabel foreign annual rows as this employee's quarter inputs. Keys
  // must also be unique across streams because all share the quarterly key space.
  const annualKeys = new Set<string>();
  [...source.coreItems, ...source.personalItems, ...behaviourItems].filter(item => item.activeInWorkplan).forEach(item => {
    if (item.workplanKey !== workplan.workplanKey || item.personKey !== workplan.personKey
      || item.performanceYear !== workplan.performanceYear
      || typeof item.workplanItemKey !== 'string' || !item.workplanItemKey.trim()) {
      throw new Error('Quarter Review requires an exact annual source identity and nonblank item key.');
    }
    if (annualKeys.has(item.workplanItemKey)) throw new Error('Quarter Review cannot contain duplicate annual source item keys.');
    annualKeys.add(item.workplanItemKey);
  });
  const review: IQuarterReview = {
    id: 0,
    etag: '*',
    quarterReviewKey,
    workplanKey: workplan.workplanKey,
    personKey: employee.personKey,
    employeeDisplayName: employee.displayName,
    employeeEmail: employee.email.trim().toLowerCase(),
    performanceYear: workplan.performanceYear,
    quarter: lifecycle.quarterKey,
    managerPersonKey: manager.personKey,
    managerDisplayName: manager.displayName,
    managerEmail: manager.email.trim().toLowerCase(),
    ...(workplan.overallDeliveryWeightConfiguration ? {
      overallDeliveryWeightConfigurationSnapshot: snapshotOverallDeliveryWeightConfiguration(workplan.overallDeliveryWeightConfiguration)
    } : {}),
    ...(behaviourV02 ? {} : { coreCategoryWeightSnapshot: workplan.coreCategoryWeight,
      personalCategoryWeightSnapshot: workplan.personalCategoryWeight,
      behaviourCategoryWeightSnapshot: workplan.behaviourCategoryWeight }),
    workplanApprovalCorrelationKey: workplan.state === 'Approved' || workplan.state === 'Locked'
      ? workplan.transitionCorrelationKey
      : undefined,
    state: 'Draft',
    accessState: 'EmployeeEdit',
    transitionStatus: 'Ready',
    rowVersionToken: 1
  };

  const catalogue = new Map<string, ICoreKpiCatalogueItem>();
  const ambiguousKpis = new Set<string>();
  source.coreCatalogue.forEach(kpi => {
    if (catalogue.has(kpi.kpiId)) ambiguousKpis.add(kpi.kpiId);
    catalogue.set(kpi.kpiId, kpi);
  });
  const definitions = new Map<string, IBehaviourSummary>();
  const ambiguousBehaviours = new Set<string>();
  source.behaviours.forEach(behaviour => {
    if (definitions.has(behaviour.behaviourId)) ambiguousBehaviours.add(behaviour.behaviourId);
    definitions.set(behaviour.behaviourId, behaviour);
  });
  const items: IQuarterReviewItem[] = [];
  source.coreItems.filter(item => item.activeInWorkplan).forEach(item => {
    if (ambiguousKpis.has(item.kpiId)) throw new Error(`Quarter Review cannot resolve ambiguous Core KPI ${item.kpiId}.`);
    const kpi = catalogue.get(item.kpiId);
    if (!kpi) throw new Error(`Quarter Review cannot resolve active Core KPI ${item.kpiId}.`);
    // The accepted Annual row owns both version pins. Resolving by KPI ID
    // alone must never silently substitute a later catalogue or target version.
    if (typeof item.kpiVersionKey !== 'string' || !item.kpiVersionKey.trim()
      || typeof item.targetVersionKey !== 'string' || !item.targetVersionKey.trim()
      || item.kpiVersionKey !== kpi.kpiVersionKey || item.targetVersionKey !== kpi.targetVersionKey) {
      throw new Error(`Quarter Review cannot resolve the accepted Annual Core version for ${item.kpiId}. Reconcile its exact KPI and target versions before preparation.`);
    }
    const target = resolveCoreQuarterTarget(kpi, lifecycle.quarterKey);
    items.push({
      id: 0,
      etag: '*',
      quarterReviewItemKey: `${quarterReviewKey}|${item.workplanItemKey}`,
      quarterReviewKey,
      workplanItemKey: item.workplanItemKey,
      workplanKey: workplan.workplanKey,
      personKey: employee.personKey,
      performanceYear: workplan.performanceYear,
      quarter: lifecycle.quarterKey,
      itemType: 'CoreGold',
      reportingStream: 'CoreGold',
      kpiId: kpi.kpiId,
      kpiVersionKey: kpi.kpiVersionKey,
      targetVersionKey: kpi.targetVersionKey,
      wording: kpi.wording,
      pillar: kpi.pillar,
      workstream: kpi.workstream,
      ownerEmail: kpi.accountableOwnerEmail,
      unitLabel: kpi.unitLabel,
      metricType: kpi.metricType || 'Other',
      scoringDirection: kpi.scoringDirection,
      strategyTarget: kpi.strategyTarget,
      yearEndTarget: kpi.yearEndTarget,
      yearEndTargetValueSnapshot: kpi.yearEndTargetValue,
      yearEndTargetTextSnapshot: kpi.yearEndTargetText,
      quarterTargetValue: target.value,
      quarterTargetText: target.text,
      calculatedRag: 'NotRated',
      scoringMessage: 'Actual not yet recorded.',
      contributionWeightSnapshot: item.coreWorkplanWeight,
      workplanItemWeightSnapshot: item.coreWorkplanWeight,
      evidenceCount: 0,
      managerApproved: false,
      locked: false
    });
  });
  source.personalItems.filter(item => item.activeInWorkplan).forEach(item => {
    const target = personalQuarterTarget(item, lifecycle.quarterKey);
    const annualSnapshot = createQuarterImpactAnnualDefinitionSnapshot(item, target);
    items.push({
      id: 0,
      etag: '*',
      quarterReviewItemKey: `${quarterReviewKey}|${item.workplanItemKey}`,
      quarterReviewKey,
      workplanItemKey: item.workplanItemKey,
      workplanKey: workplan.workplanKey,
      personKey: employee.personKey,
      performanceYear: workplan.performanceYear,
      quarter: lifecycle.quarterKey,
      itemType: 'LocalPersonal',
      reportingStream: 'Impact',
      wording: item.wording,
      itemDescription: item.description,
      measure: item.measure,
      unitLabel: item.unitLabel,
      yearEndTarget: item.yearEndTargetValue !== undefined ? String(item.yearEndTargetValue) : item.yearEndTargetText,
      yearEndTargetValueSnapshot: item.yearEndTargetValue,
      yearEndTargetTextSnapshot: item.yearEndTargetText,
      metricType: item.measureType || 'Other',
      scoringDirection: item.scoringDirection || 'TBC',
      percentageSourceScale: item.percentageSourceScale,
      baselineValue: item.baselineValue,
      quarterTargetValue: target.value,
      quarterTargetText: target.text,
      calculatedRag: 'NotRated',
      scoringMessage: 'Actual not yet recorded.',
      workplanItemWeightSnapshot: item.personalItemWeight,
      impactAnnualDefinitionSnapshot: annualSnapshot,
      evidenceCount: 0,
      managerApproved: false,
      locked: false
    });
  });
  behaviourItems.filter(item => item.activeInWorkplan).forEach(item => {
    if (behaviourV02) {
      const snapshot = item.behaviourSnapshotV2!;
      const period = snapshot.cadence === 'Quarterly' ? lifecycle.quarterKey
        : lifecycle.quarterKey === 'Q1' || lifecycle.quarterKey === 'Q2' ? 'H1' : 'H2';
      const periodSnapshot = createBehaviourPeriodSnapshotV2(snapshot, period);
      const levels = validateBehaviourPlanningLevelsV1(item.behaviourPlanningLevelsV1);
      const quarterItem: IQuarterReviewItem = { id: 0, etag: '*', quarterReviewItemKey: `${quarterReviewKey}|${item.workplanItemKey}`,
        quarterReviewKey, workplanItemKey: item.workplanItemKey, workplanKey: workplan.workplanKey,
        personKey: employee.personKey, performanceYear: workplan.performanceYear, quarter: lifecycle.quarterKey,
        itemType: 'Behaviour', reportingStream: 'Behaviour', wording: snapshot.valueTitle,
        itemDescription: item.behaviourCommitmentV2, behaviourPrompt: snapshot.descriptor,
        behaviourId: snapshot.valueId, behaviourVersionKey: snapshot.frameworkVersion,
        behaviourTitle: snapshot.valueTitle, behaviourSnapshotV2: periodSnapshot,
        behaviourAnnualCurrentLevelV2: levels?.currentLevel,
        behaviourAnnualTargetLevelV2: levels?.targetLevel,
        behaviourAnnualTargetJustificationV2: levels?.targetJustification,
        behaviourAnnualTargetSourceWorkplanItemKeyV2: item.workplanItemKey,
        behaviourAnnualTargetSourceEtagV2: item.etag,
        behaviourAnnualTargetSourceWorkplanVersionV2: workplan.rowVersionToken,
        behaviourAnnualTargetSourceApprovalKeyV2: workplan.transitionCorrelationKey,
        calculatedRag: 'NotRated', evidenceCount: 0, managerApproved: false, locked: false };
      assertApprovedBehaviourTargetSource(quarterItem, workplan, item);
      items.push({ ...quarterItem, ...materialiseQuarterBehaviourTarget(quarterItem) });
      return;
    }
    const definition = definitions.get(item.behaviourId);
    if (ambiguousBehaviours.has(item.behaviourId)) throw new Error(`Quarter Review cannot resolve ambiguous Behaviour ${item.behaviourId}.`);
    if (!definition) throw new Error(`Quarter Review cannot resolve active Behaviour ${item.behaviourId}.`);
    items.push({
      id: 0,
      etag: '*',
      quarterReviewItemKey: `${quarterReviewKey}|${item.workplanItemKey}`,
      quarterReviewKey,
      workplanItemKey: item.workplanItemKey,
      workplanKey: workplan.workplanKey,
      personKey: employee.personKey,
      performanceYear: workplan.performanceYear,
      quarter: lifecycle.quarterKey,
      itemType: 'Behaviour',
      reportingStream: 'Behaviour',
      wording: definition.title,
      itemDescription: item.objectiveDescription,
      measure: item.measure,
      unitLabel: item.unit,
      behaviourPrompt: definition.description,
      behaviourAssessmentGuidance: definition.assessmentGuidance,
      behaviourId: item.behaviourId,
      behaviourVersionKey: item.behaviourVersionKey,
      behaviourTitle: definition.title,
      behaviourObjectiveKey: item.sourceObjectiveKey,
      behaviourObjectiveSource: item.objectiveSource,
      behaviourObjectiveTitle: item.objectiveTitle,
      behaviourObjectiveDescription: item.objectiveDescription,
      behaviourEvidenceDefinition: item.evidenceDefinition,
      behaviourTargetRating: behaviourQuarterTargetRating(item, lifecycle.quarterKey),
      quarterTargetText: behaviourQuarterTarget(item, lifecycle.quarterKey),
      calculatedRag: 'NotRated',
      scoringMessage: 'Employee Behaviour rating not yet recorded.',
      workplanItemWeightSnapshot: item.behaviourItemWeight,
      evidenceCount: 0,
      managerApproved: false,
      locked: false
    });
  });
  if (new Set(items.map(item => item.quarterReviewItemKey)).size !== items.length) throw new Error('Quarter Review preparation produced duplicate item keys.');
  return { review, items };
};
