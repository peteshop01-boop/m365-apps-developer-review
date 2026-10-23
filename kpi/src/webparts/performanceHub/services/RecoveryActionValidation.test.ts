import type { IRecoveryAction } from '../models/QuarterlyModels';
import { validateRecoveryAction } from './RecoveryActionValidation';

const common: IRecoveryAction = {
  route: 'Recover',
  action: 'Deliver the recovery plan.',
  ownerPersonKey: 'owner',
  dueDate: '2026-08-28',
  nextReviewDate: '2026-08-25',
  status: 'Active'
};

describe('RecoveryActionValidation', () => {
  it('makes BTG optional for Green but mandatory for Amber and Red', () => {
    expect(validateRecoveryAction('Green')).toEqual({ required: false, valid: true, errors: [], warnings: [], targetChangeAuthorised: false });
    expect(validateRecoveryAction('Amber')).toEqual(expect.objectContaining({ required: true, valid: false }));
    expect(validateRecoveryAction('Red')).toEqual(expect.objectContaining({ required: true, valid: false }));
  });

  it('validates Recover route-specific return-to-Green evidence', () => {
    expect(validateRecoveryAction('Amber', { ...common, expectedReturnToGreenDate: '2026-09-15' })).toEqual(expect.objectContaining({ valid: true, targetChangeAuthorised: false }));
    expect(validateRecoveryAction('Amber', common).errors).toContain('Recover requires an expected return-to-Green date.');
  });

  it('validates Mitigate expected reduced outcome', () => {
    const mitigate: IRecoveryAction = { ...common, route: 'Mitigate', expectedReducedOutcome: 'Shortfall reduced from 20 to 5 participants.' };
    expect(validateRecoveryAction('Red', mitigate).valid).toBe(true);
    expect(validateRecoveryAction('Red', { ...mitigate, expectedReducedOutcome: ' ' }).valid).toBe(false);
  });

  it('models Reforecast as a request and authorises target change only after approval', () => {
    const pending: IRecoveryAction = {
      ...common,
      route: 'Reforecast',
      proposedRevisedTarget: '80 participants',
      reforecastReason: 'Approved venue capacity changed.',
      reforecastApprovalStatus: 'Pending'
    };
    expect(validateRecoveryAction('Red', pending)).toEqual(expect.objectContaining({ valid: true, targetChangeAuthorised: false, warnings: [expect.stringContaining('pending formal approval')] }));
    expect(validateRecoveryAction('Red', { ...pending, reforecastApprovalStatus: 'Approved' })).toEqual(expect.objectContaining({ valid: true, targetChangeAuthorised: true }));
    expect(validateRecoveryAction('Red', { ...pending, proposedRevisedTarget: undefined, proposedRevisedDate: undefined }).valid).toBe(false);
  });

  it('validates Escalate dependency, destination and decision date', () => {
    const escalate: IRecoveryAction = {
      ...common,
      route: 'Escalate',
      status: 'Escalated',
      dependencyOrDecision: 'Leadership decision on replacement venue.',
      escalatedTo: 'Executive Team',
      targetDecisionDate: '2026-08-26'
    };
    expect(validateRecoveryAction('Amber', escalate).valid).toBe(true);
    expect(validateRecoveryAction('Amber', { ...escalate, escalatedTo: undefined }).errors).toContain('Escalate requires an escalated-to party.');
  });
});

