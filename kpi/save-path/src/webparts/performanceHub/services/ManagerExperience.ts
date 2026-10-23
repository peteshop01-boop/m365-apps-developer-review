import type {
  IManagerAttentionFlag,
  IManagerDeadline,
  IManagerEmployeeDrillThrough,
  IManagerExperience,
  IManagerExperienceInput,
  IManagerQueueEntry,
  IManagerTeamRow,
  ManagerSubmissionKind,
  ManagerQueueKind
} from '../models/ManagerExperienceModels';
import type { IAnnualWorkplan, IProductionPerson } from '../models/ProductionModels';
import type { IQuarterReview, IQuarterReviewItem } from '../models/QuarterlyModels';
import { resolveFinalRag } from './PerformanceScoring';
import { applicationEntryCapabilities, hasExactManagerIdentity } from './ControlledApplicationRoles';

function normalise(value: string | undefined): string {
  return (value || '').replace(/^\s+|\s+$/g, '').toLowerCase();
}

function sameIdentity(left: string | undefined, right: string | undefined): boolean {
  return normalise(left) !== '' && normalise(left) === normalise(right);
}

export function isCurrentPeopleIdentity(
  authenticatedPerson: IProductionPerson | undefined,
  people: IProductionPerson[]
): boolean {
  if (!authenticatedPerson || !applicationEntryCapabilities(authenticatedPerson).valid) {
    return false;
  }
  return people.some((person) =>
    person.active &&
    sameIdentity(person.personKey, authenticatedPerson.personKey) &&
    sameIdentity(person.email, authenticatedPerson.email)
  );
}

export function isDirectReport(manager: IProductionPerson, employee: IProductionPerson): boolean {
  if (!applicationEntryCapabilities(manager).manager || !employee.active
    || sameIdentity(manager.personKey, employee.personKey)) {
    return false;
  }
  return hasExactManagerIdentity(employee, manager);
}

export function deriveDirectReports(
  manager: IProductionPerson | undefined,
  people: IProductionPerson[]
): IProductionPerson[] {
  if (!manager || !isCurrentPeopleIdentity(manager, people)) {
    return [];
  }
  return people.filter((person) => isDirectReport(manager, person)).sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

function isPast(date: string | undefined, nowIso: string): boolean {
  if (!date) {
    return false;
  }
  const due = Date.parse(date);
  const now = Date.parse(nowIso);
  return !isNaN(due) && !isNaN(now) && due < now;
}

function deadlineFor(
  deadlines: IManagerDeadline[] | undefined,
  kind: ManagerQueueKind,
  subjectKey: string
): string | undefined {
  const match = (deadlines || []).filter((deadline) =>
    deadline.kind === kind && deadline.subjectKey === subjectKey
  )[0];
  return match ? match.deadline : undefined;
}

function annualSubmissionKind(input: IManagerExperienceInput, workplanKey: string): ManagerSubmissionKind {
  const eventType = input.lastAnnualEventTypeByWorkplanKey
    ? input.lastAnnualEventTypeByWorkplanKey[workplanKey]
    : undefined;
  if (eventType === 'WorkplanResubmitted') { return 'Resubmitted'; }
  if (eventType === 'WorkplanSubmitted') { return 'Submitted'; }
  return 'Unknown';
}

function quarterSubmissionKind(input: IManagerExperienceInput, reviewKey: string): ManagerSubmissionKind {
  const eventType = input.lastQuarterEventTypeByReviewKey
    ? input.lastQuarterEventTypeByReviewKey[reviewKey]
    : undefined;
  if (eventType === 'QuarterReviewResubmitted') { return 'Resubmitted'; }
  if (eventType === 'QuarterReviewSubmitted') { return 'Submitted'; }
  if (eventType === 'QuarterReviewReopened') { return 'Reopened'; }
  return 'Unknown';
}

function attentionLabel(flag: IManagerAttentionFlag): string {
  switch (flag.code) {
    case 'OverdueManagerReview': return 'Manager review overdue';
    case 'WaitingManagerReview': return 'Submitted review waiting for manager decision';
    case 'WaitingSubmission': return 'Waiting for employee submission';
    case 'RedPerformance': return 'Red performance';
    case 'AmberPerformance': return 'Amber performance';
    case 'ActiveEscalation': return 'Active escalation';
    case 'ActiveReforecast': return 'Active reforecast';
    case 'OverdueRecovery': return 'Recovery action overdue';
    case 'IncompleteSubmission': return 'Submission is incomplete';
    default: return flag.code;
  }
}

function flag(
  code: IManagerAttentionFlag['code'],
  sortRank: number,
  sourceKey: string,
  item?: IQuarterReviewItem,
  dueDate?: string
): IManagerAttentionFlag {
  const result: IManagerAttentionFlag = {
    code,
    label: '',
    sortRank,
    sourceKey,
    quarter: item ? item.quarter : undefined,
    kpiId: item ? item.kpiId : undefined,
    dueDate,
    rag: item ? effectiveRag(item) : undefined,
    route: item && item.recovery ? item.recovery.route : undefined
  };
  result.label = attentionLabel(result);
  return result;
}

function effectiveRag(item: IQuarterReviewItem): IQuarterReviewItem['calculatedRag'] {
  const resolved = resolveFinalRag(item.calculatedRag, item.managerOverride);
  return item.managerApproved && item.locked && item.finalApprovedRag
    && resolved.valid && item.finalApprovedRag === resolved.finalRag
    ? item.finalApprovedRag
    : item.calculatedRag;
}

function itemAttention(item: IQuarterReviewItem, nowIso: string): IManagerAttentionFlag[] {
  const flags: IManagerAttentionFlag[] = [];
  const rag = effectiveRag(item);
  if (rag === 'Red') {
    flags.push(flag('RedPerformance', 80, item.quarterReviewItemKey, item));
  } else if (rag === 'Amber') {
    flags.push(flag('AmberPerformance', 70, item.quarterReviewItemKey, item));
  }
  const recovery = item.recovery;
  const recoveryActive = !!recovery && recovery.status !== 'Complete' && recovery.status !== 'Superseded';
  if (recoveryActive && recovery && recovery.route === 'Escalate') {
    flags.push(flag('ActiveEscalation', 60, item.quarterReviewItemKey, item));
  }
  if (recoveryActive && recovery && recovery.route === 'Reforecast') {
    flags.push(flag('ActiveReforecast', 60, item.quarterReviewItemKey, item));
  }
  if (recoveryActive && recovery && isPast(recovery.dueDate, nowIso)) {
    flags.push(flag('OverdueRecovery', 50, item.quarterReviewItemKey, item, recovery.dueDate));
  }
  return flags;
}

function uniqueFlags(flags: IManagerAttentionFlag[]): IManagerAttentionFlag[] {
  const seen: { [key: string]: boolean } = {};
  return flags.filter((current) => {
    const key = current.code + '|' + current.sourceKey;
    if (seen[key]) {
      return false;
    }
    seen[key] = true;
    return true;
  }).sort((left, right) => right.sortRank - left.sortRank);
}

function sumPriority(flags: IManagerAttentionFlag[]): number {
  if (flags.length === 0) {
    return 0;
  }
  return flags.reduce((highest, current) => Math.max(highest, current.sortRank), 0);
}

function annualQueueEntry(
  employee: IProductionPerson,
  workplan: IAnnualWorkplan,
  input: IManagerExperienceInput
): IManagerQueueEntry | undefined {
  if (workplan.state !== 'Submitted'
    || workplan.accessState !== 'ManagerDecision'
    || workplan.transitionStatus !== 'Ready') {
    return undefined;
  }
  const deadline = deadlineFor(input.managerDeadlines, 'AnnualWorkplan', workplan.workplanKey);
  const overdue = deadline ? isPast(deadline, input.nowIso) : undefined;
  const readiness = input.annualReadinessByWorkplanKey
    ? input.annualReadinessByWorkplanKey[workplan.workplanKey]
    : undefined;
  const incomplete = !!readiness && !readiness.ready;
  const flags: IManagerAttentionFlag[] = [];
  if (overdue === true) {
    flags.push(flag('OverdueManagerReview', 100, workplan.workplanKey, undefined, deadline));
  }
  if (incomplete) {
    flags.push(flag('IncompleteSubmission', 40, workplan.workplanKey));
  }
  flags.push(flag('WaitingManagerReview', 90, workplan.workplanKey));
  const sortRank = sumPriority(flags);
  return {
    key: 'annual|' + workplan.workplanKey,
    kind: 'AnnualWorkplan',
    employeePersonKey: employee.personKey,
    employeeDisplayName: employee.displayName,
    employeeEmail: employee.email,
    subjectKey: workplan.workplanKey,
    performanceYear: workplan.performanceYear,
    submittedAt: workplan.submittedAt,
    reviewDeadline: deadline,
    overdue,
    incomplete,
    status: workplan.state,
    reviewTypeLabel: 'Annual Workplan',
    submissionKind: annualSubmissionKind(input, workplan.workplanKey),
    openReviewTargetKey: workplan.workplanKey,
    attentionFlags: flags,
    sortRank
  };
}

function quarterQueueEntry(
  employee: IProductionPerson,
  review: IQuarterReview,
  items: IQuarterReviewItem[],
  input: IManagerExperienceInput
): IManagerQueueEntry | undefined {
  if (review.state !== 'Submitted'
    || review.accessState !== 'ManagerDecision'
    || review.transitionStatus !== 'Ready') {
    return undefined;
  }
  const deadline = deadlineFor(input.managerDeadlines, 'QuarterReview', review.quarterReviewKey);
  const overdue = deadline ? isPast(deadline, input.nowIso) : undefined;
  const readiness = input.quarterReadinessByReviewKey
    ? input.quarterReadinessByReviewKey[review.quarterReviewKey]
    : undefined;
  const incomplete = !!readiness && !readiness.ready;
  let flags: IManagerAttentionFlag[] = [];
  items.filter((item) => item.quarterReviewKey === review.quarterReviewKey).forEach((item) => {
    flags = flags.concat(itemAttention(item, input.nowIso));
  });
  if (overdue === true) {
    flags.push(flag('OverdueManagerReview', 100, review.quarterReviewKey, undefined, deadline));
  }
  if (incomplete) {
    flags.push(flag('IncompleteSubmission', 40, review.quarterReviewKey));
  }
  flags.push(flag('WaitingManagerReview', 90, review.quarterReviewKey));
  flags = uniqueFlags(flags);
  const sortRank = sumPriority(flags);
  return {
    key: 'quarter|' + review.quarterReviewKey,
    kind: 'QuarterReview',
    employeePersonKey: employee.personKey,
    employeeDisplayName: employee.displayName,
    employeeEmail: employee.email,
    subjectKey: review.quarterReviewKey,
    performanceYear: review.performanceYear,
    quarter: review.quarter,
    submittedAt: review.submittedAt,
    reviewDeadline: deadline,
    overdue,
    incomplete,
    status: review.state,
    reviewTypeLabel: review.quarter + ' Quarterly Review',
    submissionKind: quarterSubmissionKind(input, review.quarterReviewKey),
    openReviewTargetKey: review.quarterReviewKey,
    attentionFlags: flags,
    sortRank
  };
}

function waitingSubmissionFlags(
  employee: IProductionPerson,
  workplans: IAnnualWorkplan[],
  reviews: IQuarterReview[]
): IManagerAttentionFlag[] {
  const flags: IManagerAttentionFlag[] = [];
  workplans.filter((workplan) => workplan.personKey === employee.personKey).forEach((workplan) => {
    if (workplan.state === 'Draft' || workplan.state === 'ChangesRequested') {
      flags.push(flag('WaitingSubmission', 20, workplan.workplanKey));
    }
  });
  reviews.filter((review) => review.personKey === employee.personKey).forEach((review) => {
    if (review.state === 'Draft' || review.state === 'ChangesRequested') {
      flags.push(flag('WaitingSubmission', 20, review.quarterReviewKey));
    }
  });
  return flags;
}

function employeeQueue(
  employee: IProductionPerson,
  input: IManagerExperienceInput
): IManagerQueueEntry[] {
  const entries: IManagerQueueEntry[] = [];
  input.workplans.filter((workplan) => workplan.personKey === employee.personKey).forEach((workplan) => {
    const entry = annualQueueEntry(employee, workplan, input);
    if (entry) { entries.push(entry); }
  });
  input.quarterReviews.filter((review) => review.personKey === employee.personKey).forEach((review) => {
    const entry = quarterQueueEntry(employee, review, input.quarterReviewItems, input);
    if (entry) { entries.push(entry); }
  });
  return entries;
}

function employeeAttention(
  employee: IProductionPerson,
  input: IManagerExperienceInput,
  queue: IManagerQueueEntry[]
): IManagerAttentionFlag[] {
  let flags = waitingSubmissionFlags(employee, input.workplans, input.quarterReviews);
  queue.forEach((entry) => { flags = flags.concat(entry.attentionFlags); });
  const currentReview = latestReview(employee, input);
  input.quarterReviewItems.filter((item) => currentReview
    && item.quarterReviewKey === currentReview.quarterReviewKey).forEach((item) => {
    flags = flags.concat(itemAttention(item, input.nowIso));
  });
  return uniqueFlags(flags);
}

function latestWorkplan(employee: IProductionPerson, input: IManagerExperienceInput): IAnnualWorkplan | undefined {
  return input.workplans.filter((workplan) => workplan.personKey === employee.personKey)
    .sort((left, right) => right.performanceYear - left.performanceYear)[0];
}

function latestReview(employee: IProductionPerson, input: IManagerExperienceInput): IQuarterReview | undefined {
  const order: { [quarter: string]: number } = { Q1: 1, Q2: 2, Q3: 3, Q4: 4 };
  return input.quarterReviews.filter((review) => review.personKey === employee.personKey
    && (!input.currentQuarter || review.quarter === input.currentQuarter))
    .sort((left, right) => {
      const yearDifference = right.performanceYear - left.performanceYear;
      return yearDifference !== 0 ? yearDifference : order[right.quarter] - order[left.quarter];
    })[0];
}

function buildTeamRow(employee: IProductionPerson, input: IManagerExperienceInput): IManagerTeamRow {
  const queue = employeeQueue(employee, input);
  const attentionFlags = employeeAttention(employee, input, queue);
  const sortRank = sumPriority(attentionFlags);
  const annualWorkplan = latestWorkplan(employee, input);
  const currentQuarterReview = latestReview(employee, input);
  const employeeItems = currentQuarterReview
    ? input.quarterReviewItems.filter((item) => item.quarterReviewKey === currentQuarterReview.quarterReviewKey)
    : [];
  const redCount = employeeItems.filter((item) => effectiveRag(item) === 'Red').length;
  const amberCount = employeeItems.filter((item) => effectiveRag(item) === 'Amber').length;
  const greenCount = employeeItems.filter((item) => effectiveRag(item) === 'Green').length;
  const reviewWithDeadline = queue.filter((entry) => !!entry.reviewDeadline).sort((left, right) =>
    Date.parse(left.reviewDeadline || '') - Date.parse(right.reviewDeadline || '')
  )[0];
  const outstandingEmployeeAction = attentionFlags.some((entry) => entry.code === 'WaitingSubmission');
  return {
    personKey: employee.personKey,
    displayName: employee.displayName,
    email: employee.email,
    team: employee.team,
    jobRole: employee.jobRole,
    annualWorkplan,
    latestQuarterReview: currentQuarterReview,
    workplanStatus: annualWorkplan ? annualWorkplan.state : 'NotStarted',
    currentQuarterStatus: currentQuarterReview ? currentQuarterReview.state : 'NotStarted',
    coreKpiCount: annualWorkplan && input.activeCoreCountByWorkplanKey
      ? input.activeCoreCountByWorkplanKey[annualWorkplan.workplanKey]
      : undefined,
    personalKpiCount: annualWorkplan && input.activePersonalCountByWorkplanKey
      ? input.activePersonalCountByWorkplanKey[annualWorkplan.workplanKey]
      : undefined,
    worstRag: redCount > 0 ? 'Red' : (amberCount > 0 ? 'Amber' : (greenCount > 0 ? 'Green' : undefined)),
    amberRedInterventionCount: redCount + amberCount,
    outstandingEmployeeAction,
    outstandingManagerAction: queue.length > 0,
    reviewDeadline: reviewWithDeadline ? reviewWithDeadline.reviewDeadline : undefined,
    overdue: reviewWithDeadline ? reviewWithDeadline.overdue : undefined,
    attentionFlags,
    sortRank,
    pendingReviewCount: queue.length
  };
}

function sortQueue(entries: IManagerQueueEntry[]): IManagerQueueEntry[] {
  return entries.sort((left, right) => {
    const priorityDifference = right.sortRank - left.sortRank;
    if (priorityDifference !== 0) { return priorityDifference; }
    const submittedDifference = Date.parse(left.submittedAt || '') - Date.parse(right.submittedAt || '');
    if (!isNaN(submittedDifference) && submittedDifference !== 0) { return submittedDifference; }
    return left.employeeDisplayName.localeCompare(right.employeeDisplayName);
  });
}

export function buildManagerExperience(input: IManagerExperienceInput): IManagerExperience {
  const manager = input.authenticatedPerson;
  if (!isCurrentPeopleIdentity(manager, input.people) || !applicationEntryCapabilities(manager).manager) {
    return {
      state: 'NotAuthorised',
      manager,
      directReports: [],
      teamRows: [],
      reviewQueue: [],
      emptyTitle: 'Manager access is not available',
      emptyMessage: 'Your authenticated identity does not match an active People record.'
    };
  }
  const directReports = deriveDirectReports(manager, input.people);
  if (directReports.length === 0) {
    return {
      state: 'NoDirectReports',
      manager,
      directReports: [],
      teamRows: [],
      reviewQueue: [],
      emptyTitle: 'No direct reports found',
      emptyMessage: 'No active People records currently identify you as their manager.'
    };
  }
  let reviewQueue: IManagerQueueEntry[] = [];
  directReports.forEach((employee) => { reviewQueue = reviewQueue.concat(employeeQueue(employee, input)); });
  const teamRows = directReports.map((employee) => buildTeamRow(employee, input)).sort((left, right) => {
    const priorityDifference = right.sortRank - left.sortRank;
    return priorityDifference !== 0 ? priorityDifference : left.displayName.localeCompare(right.displayName);
  });
  return {
    state: 'Ready',
    manager,
    directReports,
    teamRows,
    reviewQueue: sortQueue(reviewQueue)
  };
}

export function projectManagerEmployeeDrillThrough(
  input: IManagerExperienceInput,
  employeePersonKey: string
): IManagerEmployeeDrillThrough | undefined {
  const manager = input.authenticatedPerson;
  if (!manager || !isCurrentPeopleIdentity(manager, input.people)) {
    return undefined;
  }
  const employee = input.people.filter((person) => person.personKey === employeePersonKey)[0];
  if (!employee || !isDirectReport(manager, employee)) {
    return undefined;
  }
  const annualWorkplans = input.workplans.filter((workplan) => workplan.personKey === employee.personKey);
  const quarterReviews = input.quarterReviews.filter((review) => review.personKey === employee.personKey);
  const quarterReviewItems = input.quarterReviewItems.filter((item) => item.personKey === employee.personKey);
  const queueEntries = employeeQueue(employee, input);
  return {
    employee,
    annualWorkplans,
    quarterReviews,
    quarterReviewItems,
    queueEntries,
    attentionFlags: employeeAttention(employee, input, queueEntries)
  };
}
