import type {
  IAnnualSubmissionReadiness,
  IAnnualWorkplan,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  IControlledSubmissionContext,
  ICoreWorkplanItem,
  IPersonalWorkplanItem,
  SectionCompletionState
} from '../models/ProductionModels';
import type { EmployeeContributionMethodV2, EmployeeCoreWeightingModeV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import { validateCoreWeights } from './CoreWorkplanValidation';
import {
  type ICoreWeightingItem,
  type IDeliveryCategoryWeights,
  validateCoreRoleAndContributionMethod,
  validateCoreWeightingSelection,
  validateDeliveryCategoryWeights,
  validateWorkplanCategoryWeights
} from './CategoryWeightingPolicy';
import { validatePersonalKpiDefinition } from './PersonalWorkplanPolicy';
import { BEHAVIOUR_KEYS, type BehaviourKey, type ISelectedBehaviourObjective } from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_FRAMEWORK_V2_VERSION, BEHAVIOUR_V2_VALUE_IDS } from '../models/BehaviourFrameworkV2Models';
import { validateBehaviourObjectives } from './BehaviourWorkplanPolicy';
import { createBehaviourPeriodSnapshotV2 } from './BehaviourFrameworkV2Policy';
import { validateBehaviourPlanningLevelsV1 } from './BehaviourFrameworkV2Policy';
import { assertBehaviourSelectionSnapshotEnvelopeV2, encodeBehaviourSelectionSnapshotsV2 }
  from './BehaviourSelectionSnapshotsV2';

export const MAX_PERSONAL_KPIS = 5;
const EXPECTED_BEHAVIOURS = 5;

export interface ISectionValidation {
  state: SectionCompletionState;
  total: number;
  messages: string[];
}

export type ISlice02CoreWorkplanItem = ICoreWorkplanItem & {
  contributionMethod?: EmployeeContributionMethodV2;
};

export type ISlice02AnnualWorkplan = IAnnualWorkplan & {
  coreWeightingMode?: EmployeeCoreWeightingModeV2;
  deliveryCategoryWeights?: IDeliveryCategoryWeights;
};

const coreWeightingItems = (items: readonly ISlice02CoreWorkplanItem[]): ICoreWeightingItem[] => items
  .filter(item => item.activeInWorkplan)
  .slice()
  .sort((left, right) => left.displayOrder - right.displayOrder || left.kpiId.localeCompare(right.kpiId))
  .map(item => ({
    kpiId: item.kpiId,
    weight: item.coreWorkplanWeight as number,
    employeeRole: item.employeeKpiRole,
    contributionMethod: item.contributionMethod
  }));

export const validateSlice02CoreControls = (
  items: readonly ISlice02CoreWorkplanItem[],
  mode: EmployeeCoreWeightingModeV2
): ISectionValidation => {
  const selected = coreWeightingItems(items);
  const weighting = validateCoreWeightingSelection(selected, mode);
  const messages = weighting.errors.concat(validateCoreRoleAndContributionMethod(selected));
  return {
    state: messages.length === 0 ? 'complete' : selected.length === 0 ? 'empty' : 'invalid',
    total: weighting.total,
    messages: Array.from(new Set(messages))
  };
};

const validWeight = (value: number | undefined): boolean =>
  value !== undefined && Number.isFinite(value) && value >= 0 && value <= 100;

export const validatePersonalItems = (items: IPersonalWorkplanItem[]): ISectionValidation => {
  const active = items.filter(item => item.activeInWorkplan);
  if (active.length === 0) return { state: 'empty', total: 0, messages: ['No Personal KPI is currently selected. This section is optional.'] };

  const messages: string[] = [];
  if (active.length > MAX_PERSONAL_KPIS) messages.push(`A maximum of ${MAX_PERSONAL_KPIS} Personal KPIs is allowed.`);
  if (new Set(active.map(item => item.naturalKey).filter(Boolean)).size !== active.filter(item => item.naturalKey).length) {
    messages.push('Duplicate Personal KPI item keys were found.');
  }
  active.forEach((item, index) => {
    const label = `Personal KPI ${index + 1}`;
    validatePersonalKpiDefinition(item).errors.forEach(error => messages.push(`${label}: ${error}`));
  });

  const total = active.reduce((sum, item) => sum + (validWeight(item.personalItemWeight) ? item.personalItemWeight as number : 0), 0);
  if (total > 100) messages.push('Personal KPI weights are above 100%.');
  if (messages.length > 0) return { state: 'invalid', total, messages };
  if (total < 100) return { state: 'incomplete', total, messages: ['Personal KPI weights must total 100% before submission.'] };
  return { state: 'complete', total, messages: ['Personal KPI weighting is complete at 100%.'] };
};

export const validateBehaviourAssignments = (
  definitions: IBehaviourSummary[],
  items: IBehaviourWorkplanItem[]
): ISectionValidation => {
  const active = items.filter(item => item.activeInWorkplan);
  const v2 = active.filter(item => Boolean(item.behaviourSnapshotV2)
    || item.behaviourVersionKey === BEHAVIOUR_FRAMEWORK_V2_VERSION);
  if (v2.length > 0) {
    const messages: string[] = [];
    if (v2.length !== active.length) messages.push('Historic v01 and current v02 Behaviour items cannot be mixed in one active Workplan.');
    if (v2.length !== EXPECTED_BEHAVIOURS) messages.push(`Assign all ${EXPECTED_BEHAVIOURS} v02 Values before submission.`);
    if (new Set(v2.map(item => item.naturalKey)).size !== v2.length) messages.push('Duplicate Behaviour v02 assignments were found.');
    const valueIds = v2.map(item => item.behaviourSnapshotV2?.valueId);
    BEHAVIOUR_V2_VALUE_IDS.forEach(valueId => {
      if (valueIds.filter(candidate => candidate === valueId).length !== 1) messages.push(`${valueId} must have exactly one v02 snapshot.`);
    });
    const first = v2[0]?.behaviourSnapshotV2;
    v2.forEach(item => {
      const snapshot = item.behaviourSnapshotV2;
      let snapshotValid = false;
      if (snapshot?.periodKeys[0]) {
        try { createBehaviourPeriodSnapshotV2(snapshot, snapshot.periodKeys[0]); snapshotValid = true; }
        catch { snapshotValid = false; }
      }
      const commitmentKeys = Object.keys(item.behaviourPeriodCommitmentsV2 || {}).sort();
      if (!snapshot || !snapshotValid || snapshot.frameworkVersion !== BEHAVIOUR_FRAMEWORK_V2_VERSION
        || item.behaviourVersionKey !== snapshot.frameworkVersion || snapshot.valueId !== item.behaviourId
        || snapshot.frameworkVersion !== first?.frameworkVersion || snapshot.roleTier !== first.roleTier
        || snapshot.cadence !== first.cadence || !item.behaviourCommitmentV2?.trim()
        || JSON.stringify(commitmentKeys) !== JSON.stringify([...snapshot.periodKeys].sort())
        || snapshot.periodKeys.some(period => !item.behaviourPeriodCommitmentsV2?.[period]?.trim())) {
        messages.push(`${item.behaviourId || 'A Behaviour'} has an incomplete, mixed or crossed v02 snapshot/commitment.`);
      }
      if (item.behaviourItemWeight !== undefined || item.q1TargetRating !== undefined
        || item.q2TargetRating !== undefined || item.q3TargetRating !== undefined
        || item.q4TargetRating !== undefined || item.targetRating !== undefined
        || item.q1TargetText !== undefined || item.q2TargetText !== undefined
        || item.q3TargetText !== undefined || item.q4TargetText !== undefined) {
        messages.push(`${item.behaviourId || 'A Behaviour'} contains prohibited v02 target or weight data.`);
      }
      try {
        validateBehaviourPlanningLevelsV1(item.behaviourPlanningLevelsV1);
      } catch {
        messages.push(`${item.behaviourId || 'A Behaviour'} has invalid annual Current/Target provenance.`);
      }
      try {
        const selections = assertBehaviourSelectionSnapshotEnvelopeV2(item.behaviourSelectionSnapshotsV2);
        const encoded = encodeBehaviourSelectionSnapshotsV2(selections);
        const catalogueKeys = selections.selections.filter(row => row.source === 'Catalogue')
          .map(row => row.selectionKey);
        if (selections.valueId !== snapshot?.valueId
          || item.behaviourSelectionSnapshotsSha256 !== encoded.sha256
          || item.behaviourSelectionSnapshotsUtf8ByteLength !== encoded.utf8ByteLength
          || JSON.stringify(item.selectedSuggestionKeys || []) !== JSON.stringify(catalogueKeys)) {
          messages.push(`${item.behaviourId || 'A Behaviour'} has crossed focus or selection provenance.`);
        }
      } catch {
        messages.push(`${item.behaviourId || 'A Behaviour'} has missing or invalid focus/selection provenance.`);
      }
    });
    return messages.length ? { state: 'invalid', total: 0, messages: Array.from(new Set(messages)) }
      : { state: 'complete', total: 0, messages: ['All five Behaviour v02 Value snapshots and commitments are complete; no item weighting is applied.'] };
  }
  const total = active.reduce((sum, item) => sum + (validWeight(item.behaviourItemWeight) ? item.behaviourItemWeight as number : 0), 0);
  const messages: string[] = [];
  if (definitions.length !== EXPECTED_BEHAVIOURS) messages.push(`Exactly ${EXPECTED_BEHAVIOURS} published Behaviour definitions are required.`);
  if (active.length !== EXPECTED_BEHAVIOURS) messages.push(`Assign all ${EXPECTED_BEHAVIOURS} Behaviours before submission.`);
  if (new Set(active.map(item => item.naturalKey)).size !== active.length) messages.push('Duplicate Behaviour assignments were found.');
  active.forEach(item => {
    const definition = definitions.find(row => row.behaviourId === item.behaviourId);
    if (!definition || definition.behaviourVersionKey !== item.behaviourVersionKey) {
      messages.push(`${item.behaviourId || 'A Behaviour'} does not reference the current published version.`);
    }
    if (!validWeight(item.behaviourItemWeight)) messages.push(`${item.behaviourId || 'A Behaviour'} needs a weight from 0 to 100.`);
    const quarterRatings = [item.q1TargetRating, item.q2TargetRating, item.q3TargetRating, item.q4TargetRating];
    quarterRatings.forEach((rating, quarterIndex) => {
      if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) {
        messages.push(`${item.behaviourId || 'A Behaviour'} needs a Q${quarterIndex + 1} target rating from 1 to 4.`);
      }
    });
  });
  const objectives: ISelectedBehaviourObjective[] = active
    .filter(item => BEHAVIOUR_KEYS.indexOf(item.behaviourId as BehaviourKey) >= 0)
    .map(item => ({
      behaviourKey: item.behaviourId as BehaviourKey,
      source: item.objectiveSource || 'Custom',
      sourceObjectiveKey: item.sourceObjectiveKey,
      objectiveTitle: item.objectiveTitle || '',
      objectiveDescription: item.objectiveDescription || '',
      measure: item.measure || '',
      unit: item.unit || '',
      evidenceDefinition: item.evidenceDefinition || '',
      quarterTargets: {
        q1Target: item.q1TargetText || '',
        q2Target: item.q2TargetText || '',
        q3Target: item.q3TargetText || '',
        q4Target: item.q4TargetText || ''
      },
      targetRating: item.q1TargetRating || item.targetRating,
      behaviourWeight: item.behaviourItemWeight || 0,
      activeInWorkplan: item.activeInWorkplan
    }));
  messages.push(...validateBehaviourObjectives(objectives).errors);
  if (total !== 100 && active.length > 0) messages.push('Behaviour weights must total 100%.');
  if (active.length === 0 && definitions.length === EXPECTED_BEHAVIOURS) return { state: 'empty', total, messages };
  if (messages.length > 0) return { state: 'invalid', total, messages };
  return { state: 'complete', total, messages: ['All five published Behaviours are assigned at a total of 100%.'] };
};

export const evaluateAnnualSubmissionReadiness = (
  workplan: IAnnualWorkplan | undefined,
  coreItems: ICoreWorkplanItem[],
  personalItems: IPersonalWorkplanItem[],
  definitions: IBehaviourSummary[],
  behaviourItems: IBehaviourWorkplanItem[],
  requireEditableDraft = true
): IAnnualSubmissionReadiness => {
  const blockers: string[] = [];
  const activeCore = coreItems.filter(item => item.activeInWorkplan);
  const coreWeights = validateCoreWeights(coreItems);
  const slice02Workplan = workplan as ISlice02AnnualWorkplan | undefined;
  const slice02Core = slice02Workplan?.coreWeightingMode
    ? validateSlice02CoreControls(coreItems as ISlice02CoreWorkplanItem[], slice02Workplan.coreWeightingMode)
    : undefined;
  const personal = validatePersonalItems(personalItems);
  const behaviours = validateBehaviourAssignments(definitions, behaviourItems);

  let core: SectionCompletionState = slice02Core?.state || coreWeights.state;
  if (new Set(activeCore.map(item => item.naturalKey)).size !== activeCore.length) core = 'invalid';
  if (!workplan || (requireEditableDraft && (
    (workplan.state !== 'Draft' && workplan.state !== 'ChangesRequested')
    || workplan.accessState !== 'EmployeeEdit'
    || workplan.transitionStatus !== 'Ready'
  ))) {
    blockers.push('The Annual Workplan is not in an editable, transition-ready Draft or Changes Requested state.');
  }
  if (activeCore.length === 0) blockers.push('Select at least one Core Strategy KPI.');
  else if (core !== 'complete') blockers.push(...(slice02Core?.messages.length
    ? slice02Core.messages
    : ['Core KPI weights must be valid and total 100%.']));
  if (personal.state === 'invalid' || personal.state === 'incomplete') blockers.push(...personal.messages);
  if (behaviours.state !== 'complete') blockers.push(...behaviours.messages);

  return {
    ready: blockers.length === 0,
    core,
    personal: personal.state,
    behaviours: behaviours.state,
    blockers: Array.from(new Set(blockers))
  };
};

const sameEmail = (left: string | undefined, right: string | undefined): boolean =>
  Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());

export const evaluateControlledSubmissionReadiness = (
  context: IControlledSubmissionContext,
  requireEditableDraft = true
): IAnnualSubmissionReadiness => {
  const { workplan, employee, manager, config, coreCatalogue, coreItems, personalItems, behaviours, behaviourItems } = context;
  const result = evaluateAnnualSubmissionReadiness(workplan, coreItems, personalItems, behaviours, behaviourItems, requireEditableDraft);
  const blockers = result.blockers.slice();
  const activeCore = coreItems.filter(item => item.activeInWorkplan);
  const activePersonal = personalItems.filter(item => item.activeInWorkplan);
  const activeBehaviours = behaviourItems.filter(item => item.activeInWorkplan);
  const hasBehaviourV2 = activeBehaviours.some(item => Boolean(item.behaviourSnapshotV2)
    || item.behaviourVersionKey === BEHAVIOUR_FRAMEWORK_V2_VERSION);

  if (!employee?.active) blockers.push('The employee must have one active production People record.');
  if (!manager?.active) blockers.push('The assigned manager must have one active production People record.');
  if (employee && manager && (employee.managerPersonKey !== manager.personKey || !sameEmail(employee.managerEmail, manager.email))) {
    blockers.push('The employee manager relationship does not match the active manager People record.');
  }
  if (workplan && employee && (
    workplan.personKey !== employee.personKey
    || !sameEmail(workplan.employeeEmail, employee.email)
    || workplan.managerPersonKey !== manager?.personKey
    || !sameEmail(workplan.managerEmail, manager?.email)
  )) blockers.push('The Workplan identity or manager snapshot does not match production People.');
  if (!config || !workplan || workplan.performanceYear !== config.performanceYearNumber) {
    blockers.push('The Workplan Performance Year does not match the active production configuration.');
  }
  const slice02Workplan = workplan as ISlice02AnnualWorkplan | undefined;
  if (hasBehaviourV2 && workplan) {
    if (!slice02Workplan?.deliveryCategoryWeights) {
      blockers.push('The current governed Core/Impact Delivery configuration is missing.');
    } else {
      const category = validateDeliveryCategoryWeights(slice02Workplan.deliveryCategoryWeights,
        workplan.categoryWeightReason);
      blockers.push(...category.errors);
    }
  } else if (workplan && config) {
    const category = validateWorkplanCategoryWeights({
      core: workplan.coreCategoryWeight,
      personal: workplan.personalCategoryWeight,
      behaviours: workplan.behaviourCategoryWeight
    }, activePersonal.length, workplan.categoryWeightReason);
    blockers.push(...category.errors);
  }

  const catalogueById = new Map(coreCatalogue.map(item => [item.kpiId, item]));
  const slice02ControlsRequired = Boolean(slice02Workplan?.coreWeightingMode)
    || activeCore.some(item => Object.prototype.hasOwnProperty.call(item, 'contributionMethod'));
  if (slice02ControlsRequired) {
    blockers.push(...validateCoreRoleAndContributionMethod(coreWeightingItems(activeCore as ISlice02CoreWorkplanItem[])));
  }
  activeCore.forEach(item => {
    const catalogueItem = catalogueById.get(item.kpiId);
    if (!item.employeeKpiRole) blockers.push(`${item.kpiId} needs an approved KPI relationship role.`);
    if (!catalogueItem || catalogueItem.kpiVersionKey !== item.kpiVersionKey || catalogueItem.targetVersionKey !== item.targetVersionKey) {
      blockers.push(`${item.kpiId} does not reference the current approved KPI and target versions.`);
    }
    if (workplan && (item.workplanKey !== workplan.workplanKey || item.personKey !== workplan.personKey || item.performanceYear !== workplan.performanceYear)) {
      blockers.push(`${item.kpiId} does not belong to this employee Workplan.`);
    }
  });
  activePersonal.forEach((item, index) => {
    if (workplan && (item.workplanKey !== workplan.workplanKey || item.personKey !== workplan.personKey || item.performanceYear !== workplan.performanceYear)) {
      blockers.push(`Personal KPI ${index + 1} does not belong to this employee Workplan.`);
    }
  });
  activeBehaviours.forEach(item => {
    if (workplan && (item.workplanKey !== workplan.workplanKey || item.personKey !== workplan.personKey || item.performanceYear !== workplan.performanceYear)) {
      blockers.push(`${item.behaviourId} does not belong to this employee Workplan.`);
    }
  });
  const v2Snapshots = activeBehaviours.map(item => item.behaviourSnapshotV2)
    .filter((snapshot): snapshot is NonNullable<typeof snapshot> => Boolean(snapshot));
  if (v2Snapshots.length > 0 && employee) {
    const first = v2Snapshots[0];
    if (employee.behaviourFrameworkVersionV2 !== first.frameworkVersion
      || employee.behaviourRoleTierV2 !== first.roleTier || employee.behaviourCadenceV2 !== first.cadence) {
      blockers.push('The explicit employee Behaviour v02 framework/tier/cadence assignment does not match the immutable Workplan snapshots.');
    }
  }

  return { ...result, ready: blockers.length === 0, blockers: Array.from(new Set(blockers)) };
};
