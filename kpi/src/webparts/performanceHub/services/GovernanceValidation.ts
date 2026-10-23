import type {
  IManagerResolutionPerson,
  IOrganisationalWeight,
  IQuarterLifecycleDates,
  IQuarterTimingConfig,
  IValidationResult,
  IWeightedItem,
  IWorkplanCategoryWeights,
  IWorkplanWeightingInput
} from '../models/GovernanceModels';

export const DEFAULT_CATEGORY_WEIGHTS: IWorkplanCategoryWeights = {
  core: 70,
  personal: 20,
  behaviours: 10
};

const isFinitePercent = (value: number): boolean => Number.isFinite(value) && value >= 0 && value <= 100;
const total = (items: IWeightedItem[]): number => items.reduce((sum, item) => sum + item.weight, 0);
const sameCategoryWeights = (left: IWorkplanCategoryWeights, right: IWorkplanCategoryWeights): boolean =>
  left.core === right.core && left.personal === right.personal && left.behaviours === right.behaviours;

const validateItemWeights = (label: string, items: IWeightedItem[], errors: string[]): void => {
  if (!items.length) return;
  if (items.some(item => !item.key.trim() || !isFinitePercent(item.weight))) {
    errors.push(`${label} item weights must use unique non-blank keys and values from 0 to 100.`);
    return;
  }
  if (new Set(items.map(item => item.key)).size !== items.length) errors.push(`${label} contains duplicate item keys.`);
  if (total(items) !== 100) errors.push(`${label} item weights must total 100.`);
};

export const validateWorkplanWeighting = (input: IWorkplanWeightingInput): IValidationResult => {
  const errors: string[] = [];
  const categoryValues: number[] = [input.categoryWeights.core, input.categoryWeights.personal, input.categoryWeights.behaviours];
  if (categoryValues.some(value => !isFinitePercent(value)) || categoryValues.reduce((sum, value) => sum + value, 0) !== 100) {
    errors.push('Core, Personal and Behaviour category weights must be between 0 and 100 and total 100.');
  }

  const isOverride = !sameCategoryWeights(input.categoryWeights, DEFAULT_CATEGORY_WEIGHTS);
  if (isOverride && !input.categoryOverrideReason?.trim()) errors.push('A category-weight override requires a reason.');
  if (isOverride && !input.categoryOverrideApproved) errors.push('A category-weight override requires manager or Admin approval.');
  validateItemWeights('Core', input.coreItems, errors);
  validateItemWeights('Personal', input.personalItems, errors);
  validateItemWeights('Behaviour', input.behaviourItems, errors);
  if (input.behaviourItems.length && input.behaviourItems.length !== 5) errors.push('A complete Workplan must contain exactly five Behaviour headings.');

  if (input.weightsChanged && ['ManagerApproved', 'Locked', 'Archived'].indexOf(input.state) >= 0 && !input.reopenAuthorised) {
    errors.push('Approved or locked Workplan weights can change only through an authorised reopen and reapproval.');
  }
  return { valid: errors.length === 0, errors };
};

export const validateOrganisationalWeights = (weights: IOrganisationalWeight[]): IValidationResult => {
  const errors: string[] = [];
  const groups = new Map<string, IOrganisationalWeight[]>();
  weights.forEach(weight => {
    const groupKey = `${weight.performanceYear}|${weight.parentKey}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), weight]);
  });
  groups.forEach((group, groupKey) => {
    if (group.some(item => item.weight === undefined)) {
      errors.push(`${groupKey} has unresolved organisational weights; values must not be invented.`);
      return;
    }
    if (group.some(item => !isFinitePercent(item.weight as number)) || group.reduce((sum, item) => sum + (item.weight as number), 0) !== 100) {
      errors.push(`${groupKey} organisational weights must total 100.`);
    }
    if (group.some(item => item.approvalStatus !== 'Approved')) errors.push(`${groupKey} includes an unapproved organisational weight.`);
  });
  return { valid: errors.length === 0, errors };
};

export const validateQuarterTiming = (timing: IQuarterTimingConfig): IValidationResult => {
  const errors: string[] = [];
  const values: number[] = [
    timing.earlyReviewReminderDays,
    timing.preparationReminderDays,
    timing.finalReminderDays,
    timing.employeeSubmissionDays,
    timing.managerReviewDays
  ];
  if (values.some(value => !Number.isInteger(value) || value <= 0)) errors.push('Quarter timing values must be positive whole calendar days.');
  if (!(timing.earlyReviewReminderDays > timing.preparationReminderDays && timing.preparationReminderDays > timing.finalReminderDays)) {
    errors.push('Quarter reminders must run in early, preparation and final order.');
  }
  return { valid: errors.length === 0, errors };
};

const parseDateOnly = (value: string): Date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Quarter end must use YYYY-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('Quarter end is invalid.');
  return date;
};
const addDays = (date: Date, days: number): string => new Date(date.getTime() + days * 86400000).toISOString().slice(0, 10);

export const buildQuarterLifecycleDates = (quarterEnd: string, timing: IQuarterTimingConfig): IQuarterLifecycleDates => {
  const timingResult = validateQuarterTiming(timing);
  if (!timingResult.valid) throw new Error(timingResult.errors.join(' '));
  const end = parseDateOnly(quarterEnd);
  const employeeDeadline = addDays(end, timing.employeeSubmissionDays);
  return {
    earlyReviewReminder: addDays(end, -timing.earlyReviewReminderDays),
    preparationReminder: addDays(end, -timing.preparationReminderDays),
    finalReminder: addDays(end, -timing.finalReminderDays),
    quarterEnd,
    employeeSubmissionDeadline: employeeDeadline,
    managerReviewDeadline: addDays(parseDateOnly(employeeDeadline), timing.managerReviewDays),
    nextQuarterOpens: addDays(end, 1)
  };
};

export const resolveManagerRelationship = (
  employee: IManagerResolutionPerson,
  people: IManagerResolutionPerson[]
): { manager?: IManagerResolutionPerson; result: IValidationResult } => {
  const errors: string[] = [];
  const normalisedEmail = employee.managerEmail?.trim().toLowerCase();
  const matches = people.filter(person => person.active && (
    (employee.managerPersonKey && person.personKey === employee.managerPersonKey)
    || (normalisedEmail && person.email.trim().toLowerCase() === normalisedEmail)
  ));
  const uniqueMatches = Array.from(new Map<string, IManagerResolutionPerson>(matches.map(person => [person.personKey, person])).values());
  if (!employee.managerPersonKey && !normalisedEmail) errors.push('The employee has no manager relationship.');
  else if (uniqueMatches.length !== 1) errors.push(`The manager relationship resolved to ${uniqueMatches.length} active People records.`);
  const manager = uniqueMatches.length === 1 ? uniqueMatches[0] : undefined;
  if (manager && employee.managerPersonKey && manager.personKey !== employee.managerPersonKey) errors.push('ManagerPersonKey does not match the resolved manager.');
  if (manager && normalisedEmail && manager.email.trim().toLowerCase() !== normalisedEmail) errors.push('ManagerEmail does not match the resolved manager.');
  return { manager, result: { valid: errors.length === 0, errors } };
};
