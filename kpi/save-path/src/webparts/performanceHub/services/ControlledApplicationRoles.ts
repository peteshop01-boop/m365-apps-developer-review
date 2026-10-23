import type { IProductionPerson } from '../models/ProductionModels';

export const CONTROLLED_APPLICATION_ROLES = Object.freeze([
  'Employee', 'Manager', 'SeniorManagerAdmin', 'SystemAdmin', 'BoardReadOnly'
] as const);

export type ControlledApplicationRole = typeof CONTROLLED_APPLICATION_ROLES[number];

export interface IApplicationEntryCapabilities {
  valid: boolean;
  employee: boolean;
  manager: boolean;
  admin: boolean;
  reporting: boolean;
  boardReadOnly: boolean;
}

export function controlledApplicationRoles(roles: readonly string[]): ControlledApplicationRole[] | undefined {
  if (!Array.isArray(roles) || new Set(roles).size !== roles.length
    || roles.some(role => !CONTROLLED_APPLICATION_ROLES.includes(role as ControlledApplicationRole))) {
    return undefined;
  }
  return [...roles] as ControlledApplicationRole[];
}

export function applicationEntryCapabilities(person: IProductionPerson | undefined): IApplicationEntryCapabilities {
  const roles = person ? controlledApplicationRoles(person.appRoles) : undefined;
  const valid = Boolean(person?.active && roles && roles.length > 0);
  return {
    valid,
    employee: valid && Boolean(roles?.includes('Employee')),
    manager: valid && Boolean(roles?.includes('Manager')),
    admin: valid && Boolean(roles?.includes('SeniorManagerAdmin') || roles?.includes('SystemAdmin')),
    reporting: valid && Boolean(roles?.includes('SeniorManagerAdmin') || roles?.includes('SystemAdmin')
      || roles?.includes('BoardReadOnly')),
    boardReadOnly: valid && Boolean(roles?.includes('BoardReadOnly'))
  };
}

export function assertControlledApplicationRoles(person: IProductionPerson): void {
  const roles = controlledApplicationRoles(person.appRoles);
  if (!roles || roles.length < 1) {
    throw new Error('The People record contains an unknown, duplicated or empty application-role vocabulary.');
  }
}

export function hasExactManagerIdentity(employee: Pick<IProductionPerson, 'personKey' | 'managerPersonKey' | 'managerEmail'>,
  manager: Pick<IProductionPerson, 'personKey' | 'email' | 'active' | 'appRoles'>): boolean {
  const managerRoles = controlledApplicationRoles(manager.appRoles);
  return manager.active && Boolean(managerRoles?.includes('Manager'))
    && employee.personKey !== manager.personKey
    && Boolean(employee.managerPersonKey && employee.managerEmail)
    && employee.managerPersonKey === manager.personKey
    && employee.managerEmail?.trim().toLowerCase() === manager.email.trim().toLowerCase();
}
