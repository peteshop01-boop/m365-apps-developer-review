import type { IProductionPerson } from '../models/ProductionModels';
import { buildManagerExperience, deriveDirectReports } from './ManagerExperience';
import {
  CONTROLLED_APPLICATION_ROLES,
  applicationEntryCapabilities,
  controlledApplicationRoles,
  hasExactManagerIdentity
} from './ControlledApplicationRoles';

const manager: IProductionPerson = {
  id: 1, personKey: 'MANAGER-001', displayName: 'Synthetic Manager', email: 'manager@example.invalid',
  appRoles: ['Manager'], active: true
};
const employee: IProductionPerson = {
  id: 2, personKey: 'PERSON-001', displayName: 'Synthetic Employee', email: 'employee@example.invalid',
  managerPersonKey: manager.personKey, managerEmail: manager.email, appRoles: ['Employee'], active: true
};

describe('A016 controlled role and key-plus-email hierarchy behaviour', () => {
  it('admits only the five controlled roles and gives BoardReadOnly reporting-only entry', () => {
    expect(CONTROLLED_APPLICATION_ROLES).toEqual([
      'Employee', 'Manager', 'SeniorManagerAdmin', 'SystemAdmin', 'BoardReadOnly'
    ]);
    expect(controlledApplicationRoles([...CONTROLLED_APPLICATION_ROLES])).toEqual(CONTROLLED_APPLICATION_ROLES);
    expect(controlledApplicationRoles(['Employee', 'UnknownRole'])).toBeUndefined();
    expect(controlledApplicationRoles(['Employee', 'Employee'])).toBeUndefined();
    expect(applicationEntryCapabilities({ ...employee, appRoles: ['BoardReadOnly'] })).toEqual({
      valid: true, employee: false, manager: false, admin: false, reporting: true, boardReadOnly: true
    });
  });

  it('requires both the exact manager PersonKey and normalised email; either value alone grants nothing', () => {
    expect(hasExactManagerIdentity(employee, manager)).toBe(true);
    expect(hasExactManagerIdentity({ ...employee, managerPersonKey: undefined }, manager)).toBe(false);
    expect(hasExactManagerIdentity({ ...employee, managerEmail: undefined }, manager)).toBe(false);
    expect(hasExactManagerIdentity({ ...employee, managerEmail: 'other@example.invalid' }, manager)).toBe(false);
    expect(hasExactManagerIdentity(employee, { ...manager, appRoles: ['BoardReadOnly'] })).toBe(false);
    expect(deriveDirectReports(manager, [manager, employee])).toEqual([employee]);
    expect(deriveDirectReports(manager, [manager, { ...employee, managerEmail: undefined }])).toEqual([]);
  });

  it('does not use UI filtering as a manager boundary when the People role is uncontrolled', () => {
    const forged = { ...manager, appRoles: ['LegacyManager'] };
    const result = buildManagerExperience({ authenticatedPerson: forged, people: [forged, employee],
      workplans: [], quarterReviews: [], quarterReviewItems: [], nowIso: '2026-09-12T08:00:00Z' });
    expect(result.state).toBe('NotAuthorised');
    expect(result.directReports).toEqual([]);
  });
});
