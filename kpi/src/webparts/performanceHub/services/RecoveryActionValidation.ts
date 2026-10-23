import type { IRecoveryAction, IRecoveryValidationResult, RagStatus } from '../models/QuarterlyModels';

const isDateOnly = (value?: string): boolean => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const requireText = (value: string | undefined, message: string, errors: string[]): void => {
  if (!value?.trim()) errors.push(message);
};
const requireDate = (value: string | undefined, message: string, errors: string[]): void => {
  if (!isDateOnly(value)) errors.push(message);
};

export const validateRecoveryAction = (rag: RagStatus, action?: IRecoveryAction): IRecoveryValidationResult => {
  const required = rag === 'Amber' || rag === 'Red';
  if (!action?.route && !required) return { required: false, valid: true, errors: [], warnings: [], targetChangeAuthorised: false };

  const errors: string[] = [];
  const warnings: string[] = [];
  if (!action?.route) errors.push('Amber/Red KPI requires a Recovery Route.');
  requireText(action?.action, 'Recovery Action is required.', errors);
  requireText(action?.ownerPersonKey, 'Select a recovery owner.', errors);
  requireDate(action?.dueDate, 'Recovery Due Date must be a valid date.', errors);
  requireDate(action?.nextReviewDate, 'Recovery Next Review Date must be a valid date.', errors);
  if (!action?.status) errors.push('Recovery Status is required.');

  if (action?.route === 'Recover') {
    requireDate(action.expectedReturnToGreenDate, 'Recover requires an expected return-to-Green date.', errors);
  } else if (action?.route === 'Mitigate') {
    requireText(action.expectedReducedOutcome, 'Mitigate requires the expected reduced outcome, residual shortfall or impact.', errors);
  } else if (action?.route === 'Reforecast') {
    if (!action.proposedRevisedTarget?.trim() && !isDateOnly(action.proposedRevisedDate)) {
      errors.push('Reforecast requires a proposed revised target and/or valid revised date.');
    }
    requireText(action.reforecastReason, 'Reforecast requires a reason.', errors);
    if (!action.reforecastApprovalStatus || action.reforecastApprovalStatus === 'NotRequested') {
      errors.push('Reforecast requires a formal approval request status.');
    } else if (action.reforecastApprovalStatus === 'Pending') {
      warnings.push('Reforecast is pending formal approval; KPI Master and Annual Targets must remain unchanged.');
    } else if (action.reforecastApprovalStatus === 'Rejected') {
      warnings.push('Reforecast was rejected; the approved target remains authoritative.');
    }
  } else if (action?.route === 'Escalate') {
    requireText(action.dependencyOrDecision, 'Escalate requires the dependency or decision needed.', errors);
    requireText(action.escalatedTo, 'Escalate requires an escalated-to party.', errors);
    requireDate(action.targetDecisionDate, 'Escalate requires a valid target decision date.', errors);
  }

  if (!required && action?.route) warnings.push('Green/NotRated KPI Recovery information is optional but will be retained as entered.');
  return {
    required,
    valid: errors.length === 0,
    errors,
    warnings,
    targetChangeAuthorised: action?.route === 'Reforecast' && action.reforecastApprovalStatus === 'Approved' && errors.length === 0
  };
};

