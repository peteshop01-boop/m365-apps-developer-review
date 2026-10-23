import type {
  EmployeeContributionMethodV2,
  EmployeeV2CommandType,
  IEmployeeBehaviourCommitmentInputV2,
  IEmployeeCoreContributionInputV2,
  IEmployeeCoreWeightingInputV2,
  IEmployeeEvidenceRegistrationInputV2,
  IEmployeePersonalItemInputV2,
  IEmployeeQuarterRecoveryInputV2,
  IEmployeeQuarterUpdateInputV2,
  IEmployeeV2WorkplanCommandContext,
  IEmployeeWorkplanDraftInputV2
} from '../models/EmployeeWorkplanV2PersistenceModels';
import { applicationEntryCapabilities, assertControlledApplicationRoles } from './ControlledApplicationRoles';
import {
  isFixedEmployeeBehaviourKey,
  normaliseEmployeeBehaviourCustomObjective
} from './EmployeeBehaviourSelection';
import { isExactBehaviourLibraryV2SuggestionKey } from './BehaviourLibraryV2Catalogue';
import { assertNoBehaviourV2ScoringFields, validateBehaviourPlanningLevelsV1 } from './BehaviourFrameworkV2Policy';

const contributionMethods: readonly EmployeeContributionMethodV2[] = [
  'AdditiveDirect', 'SharedTarget', 'WeightedDenominator',
  'AccountableOwner', 'CompletionOversight'
];
const roles = ['AccountableOwner', 'DeliveryLead', 'Contributor', 'Oversight', 'EvidenceProvider'];
const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
const commandKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const isEmployeeV2StableCommandKey = (value: unknown): value is string =>
  typeof value === 'string' && commandKeyPattern.test(value);

export const assertEmployeeV2StableCommandKey: (value: unknown) => asserts value is string = (value: unknown) => {
  if (!isEmployeeV2StableCommandKey(value)) {
    throw new Error('CommandKey must be a stable lower-case GUID for safe retry.');
  }
};

export const EMPLOYEE_V2_PROTECTED_CLIENT_FIELDS = [
  'id', 'etag', 'workplanKey', 'workplanItemKey', 'naturalKey', 'personKey',
  'performanceYear', 'state', 'accessState', 'transitionStatus',
  'transitionCorrelationKey', 'rowVersionToken', 'workplanVersion',
  'contributionUnit', 'unitLabelSnapshot', 'directContributionEligible',
  'additiveEligible', 'contributionApprovalState', 'approvalState',
  'additiveApproved', 'nonOverlapApproved', 'coverageAssignments',
  'officialActual', 'officialActuals', 'progressPct', 'calculatedRag',
  'calculationRuleVersion', 'finalManagerRag', 'finalRag',
  'finalBehaviourRating', 'managerOverrideActor', 'managerOverrideAt',
  'overrideByEmail', 'overrideAt', 'actorEmail', 'actorRole', 'eventAt',
  'submittedAt', 'submittedByEmail', 'approvedAt', 'approvedByEmail',
  'lockedAt', 'lockedByEmail', 'managerApproved', 'locked',
  'reforecastApprovalStatus', 'quarterRatings', 'configured',
  'evidenceCount', 'frameworkVersion', 'behaviourFrameworkVersion', 'roleTier',
  'descriptor', 'descriptorSnapshot', 'ratingOptions', 'ratingOptionsSnapshot',
  'valueTitle', 'corporateValue', 'cadence', 'periodKeys',
  'managerBehaviourEvidenceV2', 'managerBehaviourAssessmentV2',
  'finalBehaviourEvidenceV2', 'finalBehaviourAssessmentV2'
] as const;

const present = (value: string | undefined): boolean => Boolean(value && value.trim());
const finite = (value: number | undefined): boolean => value !== undefined && Number.isFinite(value);

const assertExactKeys = (value: object, allowed: readonly string[], label: string): void => {
  const unknown = Object.keys(value).filter(key => allowed.indexOf(key) < 0);
  if (unknown.length) throw new Error(`${label} contains unknown field(s): ${unknown.join(', ')}.`);
};

const protectedFieldsIn = (value: unknown, path = ''): string[] => {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) {
    const arrayResult: string[] = [];
    value.forEach((item: unknown, index: number) => arrayResult.push(...protectedFieldsIn(item, `${path}[${index}]`)));
    return arrayResult;
  }
  const record = value as Record<string, unknown>;
  const result: string[] = [];
  Object.keys(record).forEach((key: string) => {
    const current = path ? `${path}.${key}` : key;
    if ((EMPLOYEE_V2_PROTECTED_CLIENT_FIELDS as readonly string[]).indexOf(key) >= 0) result.push(current);
    result.push(...protectedFieldsIn(record[key], current));
  });
  return result;
};

const assertNoProtectedFields = (payload: unknown): void => {
  const protectedFields = protectedFieldsIn(payload);
  if (protectedFields.length) {
    throw new Error(`Protected Employee V2 field(s) are not accepted from the client: ${protectedFields.join(', ')}.`);
  }
};

export const assertEmployeeV2CommandContext = (
  context: IEmployeeV2WorkplanCommandContext,
  mode: 'Employee' | 'Manager' | 'SystemAdmin'
): void => {
  assertEmployeeV2StableCommandKey(context.commandKey);
  if (!context.actor.active) throw new Error('The authenticated People record is inactive.');
  if (context.actor.email.trim().toLowerCase() === '') throw new Error('The authenticated People email is required.');
  assertControlledApplicationRoles(context.actor);
  if (!context.workplan.etag || context.workplan.etag === '*') throw new Error('An exact Workplan ETag is required.');
  if (!Number.isInteger(context.workplan.rowVersionToken) || context.workplan.rowVersionToken < 1) {
    throw new Error('An exact positive Workplan RowVersionToken is required.');
  }
  if (mode === 'Employee') {
    if (context.actor.personKey !== context.workplan.personKey
      || context.actor.email.trim().toLowerCase() !== context.workplan.employeeEmail.trim().toLowerCase()) {
      throw new Error('Only the authenticated employee may submit an Employee V2 command for this Workplan.');
    }
    if (!applicationEntryCapabilities(context.actor).employee) throw new Error('The authenticated People record does not carry the Employee role.');
  }
  if (mode === 'Manager') {
    if (!applicationEntryCapabilities(context.actor).manager
      || context.actor.email.trim().toLowerCase() === context.workplan.employeeEmail.trim().toLowerCase()
      || context.workplan.managerPersonKey !== context.actor.personKey
      || context.workplan.managerEmail?.trim().toLowerCase() !== context.actor.email.trim().toLowerCase()) {
      throw new Error('Only the exact assigned active Manager key-plus-email may perform this transition; self-review is prohibited.');
    }
  }
  if (mode === 'SystemAdmin' && !context.actor.appRoles.includes('SystemAdmin')) {
    throw new Error('Only the controlled SystemAdmin route may request an approved-plan amendment version.');
  }
};

export const validateEmployeeWorkplanDraftInputV2 = (input: IEmployeeWorkplanDraftInputV2): void => {
  assertNoProtectedFields(input);
  assertExactKeys(input, ['coreCategoryWeight', 'personalCategoryWeight', 'behaviourCategoryWeight', 'categoryWeightReason', 'zeroPersonalProposal'], 'Workplan Draft command');
  const weights = [input.coreCategoryWeight, input.personalCategoryWeight, input.behaviourCategoryWeight];
  if (weights.some(value => !Number.isFinite(value) || value < 0) || Math.round(weights.reduce((sum, value) => sum + value, 0) * 100) !== 10000) {
    throw new Error('Core, Personal and Behaviour category weights must be non-negative and total exactly 100%.');
  }
  const changed = input.coreCategoryWeight !== 70 || input.personalCategoryWeight !== 20 || input.behaviourCategoryWeight !== 10;
  if (changed && !present(input.categoryWeightReason)) throw new Error('A category-weight reason is required when the approved 70/20/10 default changes.');
  if (input.zeroPersonalProposal) {
    const proposal = input.zeroPersonalProposal;
    assertExactKeys(proposal, ['employeeReason', 'coreCategoryWeight', 'personalCategoryWeight', 'behaviourCategoryWeight'], 'Zero-Personal proposal');
    if (!present(proposal.employeeReason) || proposal.personalCategoryWeight !== 0
      || proposal.coreCategoryWeight !== input.coreCategoryWeight
      || proposal.behaviourCategoryWeight !== input.behaviourCategoryWeight
      || Math.round((proposal.coreCategoryWeight + proposal.behaviourCategoryWeight) * 100) !== 10000) {
      throw new Error('The zero-Personal proposal must record the exact employee-selected split, Personal 0% and a reason.');
    }
  } else if (input.personalCategoryWeight === 0) {
    throw new Error('Personal 0% requires an explicit employee zero-Personal proposal; no balance is applied silently.');
  }
};

const validateQuarterTargets = (input: IEmployeeCoreContributionInputV2): void => {
  input.quarterTargets.forEach(target => assertExactKeys(target, ['quarter', 'targetValue', 'targetText', 'commitment', 'successDefinition'], `${target.quarter} contribution target`));
  const supplied = input.quarterTargets.map(target => target.quarter);
  if (supplied.length !== 4 || quarters.some(quarter => supplied.filter(value => value === quarter).length !== 1)) {
    throw new Error('Exactly one separate Q1, Q2, Q3 and Q4 contribution target is required.');
  }
};

export const validateEmployeeCoreContributionInputV2 = (input: IEmployeeCoreContributionInputV2): void => {
  assertNoProtectedFields(input);
  assertExactKeys(input, [
    'kpiId', 'role', 'contributionMethod', 'annualTargetValue', 'annualTargetText',
    'quarterTargets', 'displayOrder', 'activeInWorkplan', 'sharedTargetRule',
    'sharedApportionmentPercent', 'governanceReference', 'denominatorNumerator',
    'denominatorValue', 'denominatorUnit', 'denominatorRuleReference',
    'denominatorSourceReference'
  ], 'Core contribution command');
  if (!present(input.kpiId)) throw new Error('KPIID is required.');
  if (roles.indexOf(input.role) < 0) throw new Error('Employee KPI role is not an approved value.');
  if (contributionMethods.indexOf(input.contributionMethod) < 0) throw new Error('Contribution Method is not an approved value.');
  if (!Number.isInteger(input.displayOrder) || input.displayOrder < 0) throw new Error('Display order must be a non-negative whole number.');
  validateQuarterTargets(input);
  if (!input.activeInWorkplan) return;

  if (input.contributionMethod === 'AdditiveDirect') {
    if (!finite(input.annualTargetValue) || input.quarterTargets.some(target => !finite(target.targetValue))) {
      throw new Error('Additive / Direct Delivery requires numeric annual and Q1–Q4 contribution targets.');
    }
  } else if (input.contributionMethod === 'CompletionOversight') {
    if (input.quarterTargets.some(target => !present(target.commitment) || !present(target.successDefinition))) {
      throw new Error('Completion / Oversight requires each quarter commitment and “What 100% looks like” definition.');
    }
  } else if (input.contributionMethod === 'SharedTarget') {
    if (!present(input.annualTargetText) || !input.sharedTargetRule || !present(input.governanceReference)) {
      throw new Error('Shared Target requires an annual contribution, explicit treatment and governance reference.');
    }
    if (input.sharedTargetRule === 'ApprovedApportionment'
      && (!finite(input.sharedApportionmentPercent) || (input.sharedApportionmentPercent as number) <= 0 || (input.sharedApportionmentPercent as number) > 100)) {
      throw new Error('Approved shared apportionment must be greater than 0 and at most 100%.');
    }
  } else if (input.contributionMethod === 'WeightedDenominator') {
    if (!present(input.annualTargetText) || !finite(input.denominatorNumerator)
      || !finite(input.denominatorValue) || (input.denominatorValue as number) <= 0
      || !present(input.denominatorUnit) || !present(input.denominatorRuleReference)
      || !present(input.denominatorSourceReference)) {
      throw new Error('Weighted / Denominator requires its annual contribution, numerator, positive denominator, unit, rule and source.');
    }
  } else if (input.contributionMethod === 'AccountableOwner') {
    if (input.role !== 'AccountableOwner' || !present(input.annualTargetText)) {
      throw new Error('Accountable Owner treatment requires the Accountable Owner role and an annual accountability contribution.');
    }
  }
};

export const validateEmployeeCoreWeightingInputV2 = (input: IEmployeeCoreWeightingInputV2): void => {
  assertNoProtectedFields(input);
  assertExactKeys(input, ['mode', 'customWeights'], 'Core weighting command');
  if (input.mode === 'Equal') {
    if (input.customWeights !== undefined) throw new Error('Equal weights are Automation-derived and must not be supplied by the employee.');
    return;
  }
  if (input.mode !== 'Custom' || !input.customWeights?.length) throw new Error('Choose Equal or provide explicit Custom Core Workplan weights.');
  input.customWeights.forEach(item => assertExactKeys(item, ['kpiId', 'weight'], 'Custom Core weight'));
  const keys = input.customWeights.map(item => item.kpiId);
  if (new Set(keys).size !== keys.length || input.customWeights.some(item => !present(item.kpiId) || !Number.isFinite(item.weight) || item.weight < 0 || item.weight > 100)) {
    throw new Error('Custom Core weights require unique KPI IDs and values from 0 to 100.');
  }
  if (Math.round(input.customWeights.reduce((sum, item) => sum + item.weight, 0) * 100) !== 10000) {
    throw new Error('Custom Core Workplan weights must total exactly 100%.');
  }
};

export const validateEmployeePersonalItemInputV2 = (input: IEmployeePersonalItemInputV2): void => {
  assertNoProtectedFields(input);
  assertExactKeys(input, [
    'wording', 'description', 'measure', 'measureType', 'scoringDirection',
    'percentageSourceScale', 'baselineValue', 'yearEndTargetValue',
    'yearEndTargetText', 'q1TargetValue', 'q1TargetText', 'q2TargetValue',
    'q2TargetText', 'q3TargetValue', 'q3TargetText', 'q4TargetValue',
    'q4TargetText', 'unitLabel', 'personalItemWeight', 'displayOrder',
    'activeInWorkplan'
  ], 'Personal KPI command');
  if (!present(input.wording) || !present(input.measure) || !present(input.unitLabel)) {
    throw new Error('Personal KPI wording, measure and unit are required.');
  }
  const annualPresent = finite(input.yearEndTargetValue) || present(input.yearEndTargetText);
  const quarterPresent = [
    finite(input.q1TargetValue) || present(input.q1TargetText),
    finite(input.q2TargetValue) || present(input.q2TargetText),
    finite(input.q3TargetValue) || present(input.q3TargetText),
    finite(input.q4TargetValue) || present(input.q4TargetText)
  ];
  if (!annualPresent || quarterPresent.some(value => !value)) throw new Error('Personal KPI annual and Q1–Q4 targets must be entered explicitly.');
  if (input.personalItemWeight !== undefined && (!Number.isFinite(input.personalItemWeight) || input.personalItemWeight < 0 || input.personalItemWeight > 100)) {
    throw new Error('Personal KPI weight must be from 0 to 100.');
  }
};

export const validateEmployeeBehaviourCommitmentInputV2 = (input: IEmployeeBehaviourCommitmentInputV2): void => {
  assertNoProtectedFields(input);
  assertNoBehaviourV2ScoringFields(input);
  assertExactKeys(input, [
    'behaviourId', 'selectedSuggestionKeys', 'selections', 'commitment', 'periodCommitments',
    'displayOrder', 'activeInWorkplan', 'planningLevels'
  ], 'Behaviour commitment command');
  if (!isFixedEmployeeBehaviourKey(input.behaviourId)) {
    throw new Error('Behaviour identity must reference one of the five fixed Behaviours.');
  }
  validateBehaviourPlanningLevelsV1(input.planningLevels);
  if (!Array.isArray(input.selectedSuggestionKeys)
    || new Set(input.selectedSuggestionKeys).size !== input.selectedSuggestionKeys.length
    || input.selectedSuggestionKeys.some(key => !isExactBehaviourLibraryV2SuggestionKey(input.behaviourId, key))) {
    throw new Error('Behaviour v02 suggestion keys must be unique governed role-level keys for the fixed Value; legacy OBJ, crossed or untrusted keys are unavailable.');
  }
  if (input.selections !== undefined) {
    if (!Array.isArray(input.selections) || new Set(input.selections.map(row => row?.selectionKey)).size !== input.selections.length) {
      throw new Error('Behaviour v02 selections must have unique stable keys.');
    }
    input.selections.forEach(row => {
      if (!row || typeof row !== 'object') throw new Error('Behaviour v02 selection is malformed.');
      assertExactKeys(row, ['source', 'selectionKey', 'commitment', 'howWillWeKnow'], 'Behaviour v02 selection');
      const catalogue = row.source === 'Catalogue'
        && isExactBehaviourLibraryV2SuggestionKey(input.behaviourId, row.selectionKey);
      const own = row.source === 'Own'
        && /^BHV-0[1-5]-OWN-[A-Z0-9][A-Z0-9-]{5,39}$/.test(row.selectionKey)
        && row.selectionKey.startsWith(input.behaviourId);
      if ((!catalogue && !own) || normaliseEmployeeBehaviourCustomObjective(row.commitment) === undefined
        || normaliseEmployeeBehaviourCustomObjective(row.howWillWeKnow) === undefined) {
        throw new Error('Behaviour v02 selection key or employee text is invalid.');
      }
    });
    const selectedCatalogueKeys = input.selections.filter(row => row.source === 'Catalogue')
      .map(row => row.selectionKey).sort();
    if (JSON.stringify(selectedCatalogueKeys) !== JSON.stringify([...input.selectedSuggestionKeys].sort())) {
      throw new Error('Behaviour v02 selection keys must match the catalogue selections exactly.');
    }
  }
  if (normaliseEmployeeBehaviourCustomObjective(input.commitment) === undefined || !Number.isInteger(input.displayOrder)
    || input.displayOrder < 1 || input.displayOrder > 5 || typeof input.activeInWorkplan !== 'boolean') {
    throw new Error('Behaviour v02 requires a visible commitment, display order 1–5 and explicit active state.');
  }
  if (!Array.isArray(input.periodCommitments)) throw new Error('Behaviour v02 period commitments are required.');
  input.periodCommitments.forEach(entry => {
    assertExactKeys(entry, ['period', 'commitment'], 'Behaviour period commitment');
    if (normaliseEmployeeBehaviourCustomObjective(entry.commitment) === undefined) {
      throw new Error('Each Behaviour v02 period needs safe visible commitment text of at most 100,000 characters.');
    }
  });
  const periods = input.periodCommitments.map(entry => entry.period);
  const quarterly = periods.length === 4 && ['Q1', 'Q2', 'Q3', 'Q4']
    .every(period => periods.filter(value => value === period).length === 1);
  const twiceYearly = periods.length === 2 && ['H1', 'H2']
    .every(period => periods.filter(value => value === period).length === 1);
  if (!quarterly && !twiceYearly) {
    throw new Error('Behaviour v02 commitments must match exactly Quarterly Q1–Q4 or TwiceYearly H1–H2.');
  }
};

export const validateEmployeeQuarterRecoveryInputV2 = (input: IEmployeeQuarterRecoveryInputV2): void => {
  assertNoProtectedFields(input);
  assertExactKeys(input, [
    'route', 'action', 'ownerPersonKey', 'dueDate', 'nextReviewDate',
    'expectedReturnToGreenDate', 'expectedReducedOutcome',
    'proposedRevisedTarget', 'proposedRevisedDate', 'reforecastReason',
    'dependencyOrDecision', 'escalatedTo', 'targetDecisionDate'
  ], 'Recovery command');
  if (!present(input.action) || !present(input.ownerPersonKey) || !present(input.dueDate) || !present(input.nextReviewDate)) {
    throw new Error('Recovery requires action, authorised owner, due date and review date.');
  }
  if (input.route === 'Recover' && !present(input.expectedReturnToGreenDate)) throw new Error('Get back on track requires the expected return-to-Green date.');
  if (input.route === 'Mitigate' && !present(input.expectedReducedOutcome)) throw new Error('Reduce the shortfall requires the expected reduced outcome.');
  if (input.route === 'Reforecast' && (!present(input.proposedRevisedTarget) || !present(input.proposedRevisedDate) || !present(input.reforecastReason))) {
    throw new Error('Change target/date requires a proposed target, proposed date and reason.');
  }
  if (input.route === 'Escalate' && (!present(input.dependencyOrDecision) || !present(input.escalatedTo) || !present(input.targetDecisionDate))) {
    throw new Error('Decision/help requires the dependency or decision, escalation owner and target decision date.');
  }
};

export const validateEmployeeQuarterUpdateInputV2 = (input: IEmployeeQuarterUpdateInputV2): void => {
  assertNoProtectedFields(input);
  assertExactKeys(input, [
    'employeeActualValue', 'employeeActualText', 'employeeUpdate',
    'contextMitigation', 'forecastValue', 'forecastText',
    'employeeBehaviourRating', 'behaviourExamples', 'employeeBehaviourEvidenceV2',
    'employeeBehaviourAssessmentV2', 'recovery'
  ], 'Quarter update command');
  if (!present(input.employeeUpdate)) throw new Error('Employee Update is required.');
  if (input.employeeActualValue !== undefined && !Number.isFinite(input.employeeActualValue)) throw new Error('Employee Actual must be a finite number.');
  if (input.forecastValue !== undefined && !Number.isFinite(input.forecastValue)) throw new Error('Forecast must be a finite number.');
  if (input.employeeBehaviourAssessmentV2 !== undefined
    && input.employeeBehaviourAssessmentV2 !== 1 && input.employeeBehaviourAssessmentV2 !== 2
    && input.employeeBehaviourAssessmentV2 !== 3) {
    throw new Error('Behaviour v02 employee assessment must be 1, 2 or 3; undefined means not assessed.');
  }
  if (input.employeeBehaviourEvidenceV2 !== undefined
    && normaliseEmployeeBehaviourCustomObjective(input.employeeBehaviourEvidenceV2) === undefined) {
    throw new Error('Behaviour v02 employee evidence must be safe visible text of at most 100,000 characters.');
  }
  if (input.employeeBehaviourRating !== undefined && input.employeeBehaviourAssessmentV2 !== undefined) {
    throw new Error('Legacy v01 and v02 Behaviour assessment fields cannot be mixed.');
  }
  if (input.recovery) validateEmployeeQuarterRecoveryInputV2(input.recovery);
};

export const validateEmployeeEvidenceRegistrationInputV2 = (input: IEmployeeEvidenceRegistrationInputV2): void => {
  assertNoProtectedFields(input);
  assertExactKeys(input, ['fileUniqueId', 'description'], 'Evidence registration command');
  if (!present(input.fileUniqueId) || !present(input.description)) throw new Error('Evidence file identity and description are required.');
};

export const assertEmployeeV2PayloadAllowed = (commandType: EmployeeV2CommandType, payload: unknown): void => {
  assertNoProtectedFields(payload);
  if (!commandType) throw new Error('Employee V2 command type is required.');
};
