import type { EmployeeV2CommandType, EmployeeV2SubjectType } from '../../models/EmployeeWorkplanV2PersistenceModels';
import {
  isSec006DelegatedManagerCommand,
  resolveSec006GovernedResource
} from './Sec006DelegationScope';

export const SEC006_PERMISSION_LEVELS = {
  'KCF KPI Read': '0x000000300C031061',
  'KCF KPI Contribute No Delete': '0x000000300C031067',
  'KCF KPI Processor No Delete': '0x000000300C031067',
  'KCF KPI Append Only Automation': '0x000000300C031063',
  'KCF KPI ACL Automation': '0x400000300E031067'
} as const;

export const SEC006_PRIVATE_ROOTS = [
  'KCFKPI_EmployeeCommands',
  'KCFKPI_ManagerCommands',
  'KCFKPI_CommandReceipts',
  'KCFKPI_Workplans',
  'KCFKPI_WorkplanItems',
  'KCFKPI_QuarterReviews',
  'KCFKPI_QuarterReviewItems',
  'KCFKPI_Evidence',
  'KCFKPI_Audit'
] as const;

export type Sec006PrivateRoot = typeof SEC006_PRIVATE_ROOTS[number];
export type Sec006Partition = 'annual' | 'Q1' | 'Q2' | 'Q3' | 'Q4';
export type Sec006HumanRole = 'Employee' | 'Manager' | 'DelegatedManager' | 'BusinessAdmin' | 'SystemAdmin';

export interface ISec006AclPerson {
  personKey: string;
  email: string;
  active: boolean;
  managerPersonKey?: string;
  appRoles: readonly Sec006HumanRole[];
}

export const sec006ActivePeopleDirectoryError = (
  people: readonly Pick<ISec006AclPerson, 'personKey' | 'email' | 'active'>[]
): string | undefined => {
  const active = people.filter(person => person.active);
  const personKeys = active.map(person => person.personKey.trim().toLowerCase());
  const emails = active.map(person => person.email.trim().toLowerCase());
  if (personKeys.some(key => !key) || emails.some(email => !email)
    || new Set(personKeys).size !== personKeys.length || new Set(emails).size !== emails.length) {
    return 'Active People rows must have unique non-empty PersonKey and email values.';
  }
  return undefined;
};

export interface ISec006Delegation {
  delegationKey: string;
  delegatorPersonKey: string;
  delegatePersonKey: string;
  subjectPersonKey: string;
  performanceYear: number;
  partition: Sec006Partition;
  resourceType: Sec006PrivateRoot;
  resourceKey: string;
  subjectType: EmployeeV2SubjectType;
  subjectKey: string;
  commandTypes: readonly EmployeeV2CommandType[];
  readOnly: boolean;
  startUtc: string;
  endUtc: string;
  active: boolean;
  revoked: boolean;
  revokedAtUtc?: string;
  revocationReason?: string;
}

export interface ISec006AclGrant {
  principal: string;
  permission: 'Read' | 'ContributeNoDelete' | 'ProcessorNoDelete' | 'AppendOnlyAutomation';
  basis: 'OwnSubject' | 'CurrentManager' | 'Automation';
}

export interface ISec006PrivateRootPlan {
  root: Sec006PrivateRoot;
  breakRoleInheritance: true;
  copyRoleAssignments: false;
  clearSubscopes: true;
  humanBroadGrantAllowed: false;
}

export interface ISec006SubjectPartitionPlan {
  root: Sec006PrivateRoot;
  performanceYear: number;
  personKey: string;
  partition: Sec006Partition;
  serverRelativePattern: string;
  grants: readonly ISec006AclGrant[];
}

export interface ISec006DelegatedOperationPlan {
  delegationKey: string;
  delegatePrincipal: string;
  subjectPersonKey: string;
  performanceYear: number;
  partition: Sec006Partition;
  resourceType: Sec006PrivateRoot;
  resourceKey: string;
  subjectType: string;
  subjectKey: string;
  commandTypes: readonly string[];
  readbackAllowed: boolean;
  directPrivateRootGrant: false;
  mediatedByAutomation: true;
}

export interface ISec006SystemAdminDiagnosticPlan {
  principal: string;
  permission: 'ReadOnly';
  scopes: readonly ['Configuration', 'ProcessorHealth', 'RecoveryStatus'];
  privateCanonicalAccess: false;
  canonicalWriteAllowed: false;
}

export interface ISec006BreakGlassPlan {
  standingHumanAccess: false;
  mediatedByAutomation: true;
  requiresActiveControlCase: true;
  requiresExactSubjectAndVersion: true;
  requiresValidityWindow: true;
  immutableAuditRequired: true;
}

export interface ISec006AutomationMutationPolicy {
  root: Sec006PrivateRoot;
  governedProcessorOnly: true;
  allowedVerbs: readonly Sec006MutationVerb[];
  immutableAfterCreate: boolean;
}

export interface ISec006AclPlan {
  generatedAtUtc: string;
  performanceYear: number;
  calculationBasis: 'CURRENT_PEOPLE_AND_DELEGATIONS';
  copiedFromPriorYear: false;
  roots: readonly ISec006PrivateRootPlan[];
  partitions: readonly ISec006SubjectPartitionPlan[];
  delegatedOperations: readonly ISec006DelegatedOperationPlan[];
  systemAdminDiagnostics: readonly ISec006SystemAdminDiagnosticPlan[];
  automationMutationPolicies: readonly ISec006AutomationMutationPolicy[];
  breakGlass: ISec006BreakGlassPlan;
}

const privateRootPlan = (root: Sec006PrivateRoot): ISec006PrivateRootPlan => ({
  root,
  breakRoleInheritance: true,
  copyRoleAssignments: false,
  clearSubscopes: true,
  humanBroadGrantAllowed: false
});

const roleForRoot = (
  root: Sec006PrivateRoot,
  basis: ISec006AclGrant['basis']
): ISec006AclGrant['permission'] | undefined => {
  if (basis === 'Automation') {
    if (root === 'KCFKPI_EmployeeCommands' || root === 'KCFKPI_ManagerCommands') return 'Read';
    if (root === 'KCFKPI_Audit' || root === 'KCFKPI_CommandReceipts') return 'AppendOnlyAutomation';
    return 'ProcessorNoDelete';
  }
  if (root === 'KCFKPI_EmployeeCommands') return basis === 'OwnSubject' ? 'ContributeNoDelete' : undefined;
  if (root === 'KCFKPI_ManagerCommands') return basis === 'CurrentManager' ? 'ContributeNoDelete' : undefined;
  if (root === 'KCFKPI_Evidence' && basis === 'OwnSubject') return 'ContributeNoDelete';
  return 'Read';
};

const exactDelegationInForce = (
  delegation: ISec006Delegation,
  year: number,
  asOfUtc: string,
  subject: ISec006AclPerson,
  delegate: ISec006AclPerson | undefined,
  manager: ISec006AclPerson | undefined
): boolean => {
  const resource = resolveSec006GovernedResource(
    delegation.subjectType, delegation.subjectKey, delegation.subjectPersonKey, delegation.performanceYear
  );
  return Boolean(resource)
  && delegation.active
  && delegation.revoked === false
  && !delegation.revokedAtUtc
  && !delegation.revocationReason
  && delegation.performanceYear === year
  && delegation.subjectPersonKey === subject.personKey
  && delegation.delegatorPersonKey === subject.managerPersonKey
  && manager?.personKey === delegation.delegatorPersonKey
  && manager.appRoles.indexOf('Manager') >= 0
  && delegate?.personKey === delegation.delegatePersonKey
  && delegate.appRoles.indexOf('DelegatedManager') >= 0
  && delegation.delegatePersonKey !== delegation.subjectPersonKey
  && delegation.delegatePersonKey !== delegation.delegatorPersonKey
  && !Number.isNaN(Date.parse(delegation.startUtc))
  && !Number.isNaN(Date.parse(delegation.endUtc))
  && Date.parse(delegation.startUtc) <= Date.parse(asOfUtc)
  && Date.parse(delegation.endUtc) >= Date.parse(asOfUtc)
  && delegation.partition === resource?.partition
  && delegation.resourceType === resource?.resourceType
  && delegation.resourceKey === resource?.resourceKey
  && delegation.subjectType === resource?.subjectType
  && delegation.subjectKey === resource?.subjectKey
  && delegation.commandTypes.every(commandType =>
    isSec006DelegatedManagerCommand(commandType, delegation.subjectType))
  && (delegation.readOnly ? delegation.commandTypes.length === 0 : delegation.commandTypes.length > 0)
  && new Set(delegation.commandTypes).size === delegation.commandTypes.length;
};

const addGrant = (
  grants: ISec006AclGrant[],
  root: Sec006PrivateRoot,
  principal: string,
  basis: ISec006AclGrant['basis']
): void => {
  const permission = roleForRoot(root, basis);
  if (!permission || !principal.trim()) return;
  if (!grants.some(grant => grant.principal.toLowerCase() === principal.toLowerCase()
    && grant.permission === permission && grant.basis === basis)) {
    grants.push({ principal, permission, basis });
  }
};

export const buildSec006AclPlan = (
  performanceYear: number,
  asOfUtc: string,
  people: readonly ISec006AclPerson[],
  delegations: readonly ISec006Delegation[],
  automationPrincipal: string
): ISec006AclPlan => {
  if (!Number.isInteger(performanceYear) || performanceYear < 2026) throw new Error('A valid internal performance year is required.');
  if (!automationPrincipal.trim()) throw new Error('A dedicated Automation principal is required to calculate ACLs.');
  const directoryError = sec006ActivePeopleDirectoryError(people);
  const active = directoryError ? [] : people.filter(person => person.active);
  const byKey = new Map(active.map(person => [person.personKey, person]));
  const partitions: ISec006SubjectPartitionPlan[] = [];
  const delegatedOperations: ISec006DelegatedOperationPlan[] = [];
  const automationMutationPolicies: ISec006AutomationMutationPolicy[] = SEC006_PRIVATE_ROOTS.map(root => ({
    root,
    governedProcessorOnly: true,
    allowedVerbs: root === 'KCFKPI_Audit' || root === 'KCFKPI_CommandReceipts'
      ? ['POST'] as const
      : root === 'KCFKPI_EmployeeCommands' || root === 'KCFKPI_ManagerCommands'
        ? [] as const
        : ['POST', 'PATCH'] as const,
    immutableAfterCreate: root === 'KCFKPI_Audit' || root === 'KCFKPI_CommandReceipts'
  }));

  active.forEach(subject => {
    const currentManager = subject.managerPersonKey ? byKey.get(subject.managerPersonKey) : undefined;
    SEC006_PRIVATE_ROOTS.forEach(root => {
      (['annual', 'Q1', 'Q2', 'Q3', 'Q4'] as const).forEach(partition => {
        const grants: ISec006AclGrant[] = [];
        if (subject.appRoles.indexOf('Employee') >= 0) addGrant(grants, root, subject.email, 'OwnSubject');
        if (currentManager && currentManager.personKey !== subject.personKey
          && currentManager.appRoles.indexOf('Manager') >= 0) {
          addGrant(grants, root, currentManager.email, 'CurrentManager');
        }
        addGrant(grants, root, automationPrincipal, 'Automation');
        partitions.push({
          root,
          performanceYear,
          personKey: subject.personKey,
          partition,
          serverRelativePattern: `${root}/${performanceYear}/${subject.personKey}/${partition}`,
          grants: grants.sort((left, right) => `${left.principal}|${left.permission}|${left.basis}`
            .localeCompare(`${right.principal}|${right.permission}|${right.basis}`))
        });
      });
    });

    delegations.filter(delegation => delegation.subjectPersonKey === subject.personKey)
      .forEach(delegation => {
        const delegate = byKey.get(delegation.delegatePersonKey);
        if (!exactDelegationInForce(delegation, performanceYear, asOfUtc, subject, delegate, currentManager)) return;
        delegatedOperations.push({
          delegationKey: delegation.delegationKey,
          delegatePrincipal: delegate!.email,
          subjectPersonKey: subject.personKey,
          performanceYear,
          partition: delegation.partition,
          resourceType: delegation.resourceType,
          resourceKey: delegation.resourceKey,
          subjectType: delegation.subjectType,
          subjectKey: delegation.subjectKey,
          commandTypes: delegation.commandTypes.slice(),
          readbackAllowed: true,
          directPrivateRootGrant: false,
          mediatedByAutomation: true
        });
      });
  });

  const systemAdminDiagnostics = active
    .filter(person => person.appRoles.indexOf('SystemAdmin') >= 0)
    .map(person => ({
      principal: person.email,
      permission: 'ReadOnly' as const,
      scopes: ['Configuration', 'ProcessorHealth', 'RecoveryStatus'] as const,
      privateCanonicalAccess: false as const,
      canonicalWriteAllowed: false as const
    }));

  return {
    generatedAtUtc: asOfUtc,
    performanceYear,
    calculationBasis: 'CURRENT_PEOPLE_AND_DELEGATIONS',
    copiedFromPriorYear: false,
    roots: SEC006_PRIVATE_ROOTS.map(privateRootPlan),
    partitions,
    delegatedOperations: delegatedOperations.sort((left, right) => left.delegationKey.localeCompare(right.delegationKey)),
    systemAdminDiagnostics,
    automationMutationPolicies,
    breakGlass: {
      standingHumanAccess: false,
      mediatedByAutomation: true,
      requiresActiveControlCase: true,
      requiresExactSubjectAndVersion: true,
      requiresValidityWindow: true,
      immutableAuditRequired: true
    }
  };
};

export const assertSec006AclPlan = (plan: ISec006AclPlan): string[] => {
  const errors: string[] = [];
  SEC006_PRIVATE_ROOTS.forEach(root => {
    const match = plan.roots.find(candidate => candidate.root === root);
    if (!match || !match.breakRoleInheritance || match.copyRoleAssignments || !match.clearSubscopes) {
      errors.push(`PRIVATE_ROOT_NOT_ISOLATED:${root}`);
    }
  });
  plan.partitions.forEach(partition => {
    if (partition.performanceYear !== plan.performanceYear) errors.push(`CROSS_YEAR_PARTITION:${partition.serverRelativePattern}`);
    if (partition.grants.some(grant => grant.basis === 'OwnSubject'
      && partition.root === 'KCFKPI_ManagerCommands')) errors.push(`EMPLOYEE_MANAGER_COMMAND_GRANT:${partition.personKey}`);
    if (partition.grants.some(grant => grant.basis === 'CurrentManager'
      && partition.root === 'KCFKPI_EmployeeCommands')) errors.push(`MANAGER_EMPLOYEE_COMMAND_GRANT:${partition.personKey}`);
  });
  plan.delegatedOperations.forEach(operation => {
    if (operation.directPrivateRootGrant || !operation.mediatedByAutomation) {
      errors.push(`DELEGATION_NOT_MEDIATED:${operation.delegationKey}`);
    }
    if (!operation.readbackAllowed || (!operation.commandTypes.length && operation.resourceKey !== operation.subjectKey)) {
      errors.push(`DELEGATION_SCOPE_INVALID:${operation.delegationKey}`);
    }
  });
  if (!plan.breakGlass.mediatedByAutomation || plan.breakGlass.standingHumanAccess
    || !plan.breakGlass.immutableAuditRequired) errors.push('BREAK_GLASS_NOT_CONTROLLED');
  if (plan.systemAdminDiagnostics.some(scope => scope.privateCanonicalAccess || scope.canonicalWriteAllowed
    || scope.permission !== 'ReadOnly')) errors.push('SYSTEM_ADMIN_STANDING_PRIVATE_ACCESS');
  const immutableRoots: Sec006PrivateRoot[] = ['KCFKPI_Audit', 'KCFKPI_CommandReceipts'];
  immutableRoots.forEach(root => {
    const policy = plan.automationMutationPolicies.find(candidate => candidate.root === root);
    if (!policy || !policy.governedProcessorOnly || !policy.immutableAfterCreate
      || policy.allowedVerbs.length !== 1 || policy.allowedVerbs[0] !== 'POST') {
      errors.push(`IMMUTABLE_AUTOMATION_ROOT_POLICY_INVALID:${root}`);
    }
  });
  return errors;
};

export type Sec006MutationVerb = 'POST' | 'PATCH' | 'DELETE';

export const isSec006DirectMutationAllowed = (
  plan: ISec006AclPlan,
  principal: string,
  root: Sec006PrivateRoot,
  verb: Sec006MutationVerb
): boolean => {
  if (root === 'KCFKPI_Audit' || root === 'KCFKPI_CommandReceipts') return false;
  return plan.partitions.some(partition => partition.root === root
    && partition.grants.some(grant => grant.principal.toLowerCase() === principal.toLowerCase()
      && grant.permission === 'ContributeNoDelete' && verb !== 'DELETE'));
};

export const isSec006GovernedProcessorMutationAllowed = (
  plan: ISec006AclPlan,
  principal: string,
  root: Sec006PrivateRoot,
  verb: Sec006MutationVerb
): boolean => {
  const automationGrant = plan.partitions.some(partition => partition.root === root
    && partition.grants.some(grant => grant.principal.toLowerCase() === principal.toLowerCase()
      && (grant.permission === 'ProcessorNoDelete' || grant.permission === 'AppendOnlyAutomation')));
  const policy = plan.automationMutationPolicies.find(candidate => candidate.root === root);
  return Boolean(automationGrant && policy?.governedProcessorOnly && policy.allowedVerbs.indexOf(verb) >= 0);
};
