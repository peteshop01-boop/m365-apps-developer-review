import type { IAnnualWorkplan } from '../models/ProductionModels';
import { buildEmployeeWorkplanStatus, isEmployeeWorkplanEditable } from './EmployeeWorkplanStatus';

const workplan = (state: IAnnualWorkplan['state']): IAnnualWorkplan => ({
  id: 1, etag: '"1"', workplanKey: 'person|2026', personKey: 'person', employeeDisplayName: 'Synthetic Person 02',
  employeeEmail: 'person003@example.invalid', performanceYear: 2026, managerDisplayName: 'Synthetic Person 01',
  managerEmail: 'person002@example.invalid', state, accessState: state === 'Draft' || state === 'ChangesRequested' ? 'EmployeeEdit' : 'ManagerDecision',
  transitionStatus: 'Ready', coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10,
  submittedAt: '2026-08-20T12:00:00Z', submittedByEmail: 'person003@example.invalid', rowVersionToken: 1
});

const manager = { id: 2, personKey: 'manager', displayName: 'Synthetic Person 01', email: 'person002@example.invalid', appRoles: ['Employee'], active: true };

describe('employee Workplan status', () => {
  it('explains Submitted review, read-only cause and manager-controlled Request Changes route', () => {
    const status = buildEmployeeWorkplanStatus(workplan('Submitted'), manager, [], [], []);
    expect(status.editable).toBe(false);
    expect(status.reviewState).toContain('Synthetic Person 01');
    expect(status.nextAction).toContain('awaiting manager review');
    expect(status.explanation).toContain('Request Changes');
    expect(status.explanation).toContain('editing will then become available');
  });

  it('allows employee editing only for transition-ready Draft or Changes Requested', () => {
    expect(isEmployeeWorkplanEditable(workplan('Draft'))).toBe(true);
    expect(isEmployeeWorkplanEditable({ ...workplan('ChangesRequested'), managerDecisionComment: 'Please amend.' })).toBe(true);
    expect(isEmployeeWorkplanEditable(workplan('Submitted'))).toBe(false);
    expect(isEmployeeWorkplanEditable(workplan('Locked'))).toBe(false);
  });

  it('never offers employee self-unlock guidance for Locked content', () => {
    const status = buildEmployeeWorkplanStatus({ ...workplan('Locked'), accessState: 'ReadOnly' }, manager, [], [], []);
    expect(status.editable).toBe(false);
    expect(status.nextAction).toContain('approved and locked');
    expect(status.explanation).toContain('There is no employee Unlock action');
  });
});
