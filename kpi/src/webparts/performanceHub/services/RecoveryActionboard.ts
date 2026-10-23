import type {
  IQuarterReview,
  IRecoveryActionboardFilters,
  IRecoveryActionboardItem,
  IQuarterReviewItem,
  RagStatus
} from '../models/QuarterlyModels';
import type { IProductionPerson } from '../models/ProductionModels';
import { resolveFinalRag } from './PerformanceScoring';

/** The deliberately read-only subset needed to project an employee or manager review onto the Actionboard. */
export interface IRecoveryActionboardContext {
  readonly review: Pick<IQuarterReview, 'quarterReviewKey' | 'state'>;
  readonly employee: IProductionPerson;
  readonly manager?: IProductionPerson;
  readonly items: ReadonlyArray<IQuarterReviewItem>;
}

const initialsFromEmail = (email?: string): string => {
  const local = email?.trim().split('@')[0];
  if (!local) return '—';
  const parts = local.split(/[._\-\s]+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(0, 2).map(part => part[0]) : [parts[0]?.slice(0, 2)])
    .join('')
    .toUpperCase();
};

const effectiveRag = (item: IQuarterReviewItem): RagStatus => {
  const resolved = resolveFinalRag(item.calculatedRag, item.managerOverride);
  if (item.managerApproved && item.locked && item.finalApprovedRag
    && resolved.valid && item.finalApprovedRag === resolved.finalRag) {
    return item.finalApprovedRag;
  }
  return item.calculatedRag;
};

const activeRecovery = (item: IQuarterReviewItem): boolean =>
  item.recovery?.status !== 'Complete' && item.recovery?.status !== 'Superseded';

const isRecoveryKpi = (item: IQuarterReviewItem): boolean =>
  item.itemType === 'CoreGold' || item.itemType === 'LocalPersonal';

const recoveryOwnerEmail = (context: IRecoveryActionboardContext, item: IQuarterReviewItem): string | undefined => {
  const ownerPersonKey = item.recovery?.ownerPersonKey?.trim().toLowerCase();
  if (!ownerPersonKey) return undefined;
  if (context.employee.personKey.trim().toLowerCase() === ownerPersonKey) return context.employee.email;
  if (context.manager?.personKey.trim().toLowerCase() === ownerPersonKey) return context.manager.email;
  return undefined;
};

export const deduplicateRecoveryActionboardContexts = (
  contexts: ReadonlyArray<IRecoveryActionboardContext>
): IRecoveryActionboardContext[] => {
  const seen = new Set<string>();
  return contexts.filter(context => {
    const key = context.review.quarterReviewKey.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const buildRecoveryActionboard = (
  contexts: ReadonlyArray<IRecoveryActionboardContext>,
  todayDate: string
): IRecoveryActionboardItem[] => {
  const items: IRecoveryActionboardItem[] = [];
  const seenItems = new Set<string>();
  deduplicateRecoveryActionboardContexts(contexts).forEach(context => context.items.forEach(item => {
    const itemKey = item.quarterReviewItemKey.trim().toLowerCase();
    if (!itemKey || seenItems.has(itemKey)) return;
    seenItems.add(itemKey);
    const rag = effectiveRag(item);
    if (!isRecoveryKpi(item) || (rag !== 'Amber' && rag !== 'Red') || !activeRecovery(item)) return;
    const recovery = item.recovery;
    const personal = item.itemType === 'LocalPersonal';
    const overdue = Boolean(recovery?.dueDate && recovery.dueDate < todayDate);
    const reforecastDecision = recovery?.route === 'Reforecast'
      && recovery.reforecastApprovalStatus !== 'Approved'
      && recovery.reforecastApprovalStatus !== 'Rejected';
    const escalationDecision = recovery?.route === 'Escalate';
    const managerDecision = context.review.state === 'Submitted';
    const decisionRequired = reforecastDecision || escalationDecision || managerDecision;
    const decisionReason = reforecastDecision
      ? 'Reforecast approval required'
      : escalationDecision
        ? 'Escalated dependency/decision'
        : managerDecision
          ? 'Quarter Review awaiting manager decision'
          : undefined;
    items.push({
      key: item.quarterReviewItemKey,
      quarter: item.quarter,
      employeeDisplayName: context.employee.displayName,
      employeeEmail: context.employee.email,
      kpiId: item.kpiId?.trim() || (personal ? 'Personal KPI' : 'Unmapped KPI'),
      wording: item.wording,
      pillar: item.pillar?.trim() || (personal ? 'Personal KPIs' : 'Unassigned'),
      workstream: item.workstream?.trim() || (personal ? 'Individual objective' : 'Unassigned'),
      ownerPersonKey: recovery?.ownerPersonKey,
      ownerInitials: initialsFromEmail(recoveryOwnerEmail(context, item)),
      rag,
      route: recovery?.route,
      action: recovery?.action,
      dueDate: recovery?.dueDate,
      nextReviewDate: recovery?.nextReviewDate,
      recoveryStatus: recovery?.status,
      decisionRequired,
      decisionReason,
      overdue,
      priorityScore: (rag === 'Red' ? 100 : 60) + (overdue ? 25 : 0) + (decisionRequired ? 15 : 0),
      managerDecisionStatus: context.review.state
    });
  }));
  return items.sort((left, right) => right.priorityScore - left.priorityScore
    || (left.dueDate || '9999-12-31').localeCompare(right.dueDate || '9999-12-31')
    || left.kpiId.localeCompare(right.kpiId));
};

export const filterRecoveryActionboard = (
  items: IRecoveryActionboardItem[],
  filters: IRecoveryActionboardFilters
): IRecoveryActionboardItem[] => items.filter(item =>
  (!filters.quarter || item.quarter === filters.quarter)
  && (!filters.pillar || item.pillar === filters.pillar)
  && (!filters.workstream || item.workstream === filters.workstream)
  && (!filters.ownerPersonKey || item.ownerPersonKey === filters.ownerPersonKey)
  && (!filters.rag || item.rag === filters.rag)
  && (!filters.route || item.route === filters.route)
  && (!filters.overdueOnly || item.overdue)
  && (!filters.decisionRequiredOnly || item.decisionRequired)
);
