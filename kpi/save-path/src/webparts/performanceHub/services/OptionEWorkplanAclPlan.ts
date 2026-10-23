import {
  OPTION_E_ACL_RECONCILER_MASKS,
  OPTION_E_CONTENT_PROCESSOR_MASKS,
  OPTION_E_NATIVE_RIGHT_BITS,
  OPTION_E_NATIVE_ROLES,
  OPTION_E_PRIVATE_ROOTS,
  OPTION_E_RECOVERY_ROLE,
  type OptionEWorkplanListTitle
} from './OptionEWorkplanPhysicalSchema';

export type OptionEControlState = 'Draft' | 'ChangesRequested' | 'Submitted' | 'Approved' | 'Locked' | 'Archived';
export type OptionETransitionStatus = 'Ready' | 'Submitting' | 'AclPending' | 'RecoveryHold';
export type OptionEAclPhase =
  | 'PreserveRecovery'
  | 'PrivatiseRoots'
  | 'RevokeDraftEdit'
  | 'VerifyDraftReadOnly'
  | 'RegrantDraftEdit'
  | 'VerifyDraftEdit'
  | 'RevokeFormerManager'
  | 'VerifyFormerManagerDenied'
  | 'VerifyCurrentManagerDenied'
  | 'GrantEmployee'
  | 'GrantCurrentManager'
  | 'VerifyCurrentManagerRead'
  | 'RevokeUnverifiedManager'
  | 'VerifyExactAcl';
export type OptionEAclOperation =
  | 'AssertRecoveryFullControl'
  | 'BreakInheritanceNoCopy'
  | 'EnsureRoleAssignment'
  | 'RemoveRoleAssignment'
  | 'ReadBackRoleAssignments'
  | 'ReadBackEffectiveMask'
  | 'AssertEffectiveMask'
  | 'AssertDenied';
export type OptionENativeVerb = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'MANAGE_PERMISSIONS';

export interface IOptionENativeRoleReadback {
  id: number;
  name: string;
  roleTypeKind: number;
  high: number;
  low: number;
}

export interface IOptionENativeRoleConvergenceAction {
  action: 'ReuseExact' | 'AddMissingExact';
  name: string;
  roleTypeKind: 0;
  high: number;
  low: number;
  roleDefinitionId: number;
}

export interface IOptionENativeRoleConvergenceResult {
  ready: boolean;
  errors: readonly string[];
  actions: readonly IOptionENativeRoleConvergenceAction[];
  resolvedRoles: readonly IOptionENativeRoleReadback[];
  recoveryRole?: IOptionENativeRoleReadback;
}

export interface IOptionENativeAssignmentReadback {
  assignedRoles: readonly IOptionENativeRoleReadback[];
  effectiveHigh: number;
  effectiveLow: number;
}

export interface IOptionEManagerAclReadback extends IOptionENativeAssignmentReadback {
  target: string;
  principal: string;
  hierarchyEpoch: number;
  aclEpoch: number;
  assignedRoles: readonly IOptionENativeRoleReadback[];
  effectiveHigh: number;
  effectiveLow: number;
}

export interface IOptionEAclContext {
  personKey: string;
  performanceYear: number;
  controlState: OptionEControlState;
  transitionStatus: OptionETransitionStatus;
  hierarchyEpoch: number;
  aclEpoch: number;
  employeePrincipal: string;
  currentManagerPrincipal?: string;
  formerManagerPrincipals: readonly string[];
  otherEmployeePrincipals: readonly string[];
  visitorPrincipals: readonly string[];
  memberPrincipals: readonly string[];
  siteCollectionAdminPrincipals: readonly string[];
  contentProcessorPrincipal: string;
  aclReconcilerPrincipal: string;
  recoveryAdminPrincipal: string;
  requestCaptured: boolean;
  protectedStateReadbackVerified: boolean;
  noCompetingOperation: boolean;
  currentManagerReadbacks?: readonly IOptionEManagerAclReadback[];
  roleDefinitionFirstReadbacks: readonly IOptionENativeRoleReadback[];
  roleDefinitionCreationReceipts: readonly IOptionENativeRoleReadback[];
  roleDefinitionSecondReadbacks: readonly IOptionENativeRoleReadback[];
}

export interface IOptionEAclStep {
  sequence: number;
  phase: OptionEAclPhase;
  operation: OptionEAclOperation;
  target: string;
  principal: string;
  roleDefinitionId: number;
  roleName: string;
  roleTypeKind: number;
  high: number;
  low: number;
  reason: string;
  idempotencyKey: string;
}

export interface IOptionENegativeAclCase {
  principalClass: 'OwnEmployee' | 'OtherEmployee' | 'CurrentManager' | 'FormerManager' | 'Visitor' | 'Member' | 'AclReconciler';
  resource: string;
  forbidden: readonly OptionENativeVerb[];
  expected: 'Denied';
}

export interface IOptionEAclPlan {
  contractVersion: 'DEMO-APP-B13-OPTION-E-V3';
  subject: string;
  hierarchyEpoch: number;
  aclEpoch: number;
  ready: boolean;
  failClosedUntilReady: boolean;
  managerReadbackErrors: readonly string[];
  copiedFromPriorHierarchy: false;
  roleDefinitionActions: readonly IOptionENativeRoleConvergenceAction[];
  steps: readonly IOptionEAclStep[];
  negativeMatrix: readonly IOptionENegativeAclCase[];
}

const normalise = (value: string | undefined): string => (value || '').trim().toLowerCase();
const uniquePrincipals = (values: readonly string[]): string[] => Array.from(new Set(values
  .map(normalise).filter(Boolean))).sort();
const isPositiveRoleId = (value: number): boolean => Number.isInteger(value) && value > 0;
const isUint32 = (value: number): boolean => Number.isInteger(value) && value >= 0 && value <= 0xFFFFFFFF;
const sameRole = (
  actual: IOptionENativeRoleReadback,
  expected: Pick<IOptionENativeRoleReadback, 'name' | 'roleTypeKind' | 'high' | 'low'>
): boolean => actual.name === expected.name && actual.roleTypeKind === expected.roleTypeKind
  && actual.high === expected.high && actual.low === expected.low;
const expectedNameMatches = (actual: IOptionENativeRoleReadback, expectedName: string): boolean =>
  normalise(actual.name) === normalise(expectedName);

const validateRoleSnapshot = (
  readbacks: readonly IOptionENativeRoleReadback[],
  label: string,
  allowMissingCustom: boolean
): string[] => {
  const errors: string[] = [];
  const ids = new Set<number>();
  const names = new Set<string>();
  readbacks.forEach(role => {
    if (!isPositiveRoleId(role.id)) errors.push(`${label}: ${role.name} has no positive native role-definition ID.`);
    if (ids.has(role.id)) errors.push(`${label}: duplicate native role-definition ID ${role.id}.`);
    ids.add(role.id);
    const name = normalise(role.name);
    if (!name) errors.push(`${label}: native role name is empty.`);
    if (names.has(name)) errors.push(`${label}: duplicate/same-name native role ${role.name}.`);
    names.add(name);
    if (!isUint32(role.high) || !isUint32(role.low)) {
      errors.push(`${label}: ${role.name} has a non-unsigned High/Low mask.`);
    }
  });
  OPTION_E_NATIVE_ROLES.forEach(expected => {
    const matches = readbacks.filter(actual => expectedNameMatches(actual, expected.name));
    if (matches.length === 0) {
      if (!allowMissingCustom) errors.push(`${label}: ${expected.name} must resolve to exactly one live custom role.`);
    } else if (matches.length !== 1) {
      errors.push(`${label}: ${expected.name} must resolve to exactly one live custom role; found ${matches.length}.`);
    } else {
      const actual = matches[0];
      if (!sameRole(actual, expected)) {
        errors.push(`${label}: ${expected.name} readback is ${actual.roleTypeKind}/${actual.high}/${actual.low}; expected custom 0/${expected.high}/${expected.low}.`);
      }
    }
    const aliases = readbacks.filter(actual => !expectedNameMatches(actual, expected.name)
      && actual.high === expected.high && actual.low === expected.low);
    if (aliases.length) {
      errors.push(`${label}: ${expected.name} mask ${expected.high}/${expected.low} has same-mask alias(es): ${aliases.map(role => role.name).join(', ')}.`);
    }
  });
  const recoveryMatches = readbacks.filter(actual => expectedNameMatches(actual, OPTION_E_RECOVERY_ROLE.name));
  if (recoveryMatches.length !== 1) {
    errors.push(`${label}: recovery Full Control must resolve to exactly one built-in Administrator role; found ${recoveryMatches.length}.`);
  } else if (!sameRole(recoveryMatches[0], OPTION_E_RECOVERY_ROLE)) {
    const actual = recoveryMatches[0];
    errors.push(`${label}: recovery Full Control is ${actual.roleTypeKind}/${actual.high}/${actual.low}; expected Administrator 5/2147483647/4294967295.`);
  }
  return errors;
};
const target = (title: OptionEWorkplanListTitle, context: IOptionEAclContext, suffix: string): string =>
  `${title}/${context.performanceYear}/${context.personKey}/${suffix}`;
export const optionEManagerProtectedTargets = (context: IOptionEAclContext): readonly string[] => [
  target('DEMOAPP_WorkplanSubmittedSnapshots', context, 'CurrentSnapshot'),
  target('DEMOAPP_WorkplanSubmitOperations', context, 'SafeOperation'),
  target('DEMOAPP_Workplans', context, 'ControlItem')
];
const isReadyCandidate = (context: IOptionEAclContext): boolean => context.controlState === 'Submitted'
  && context.transitionStatus === 'Ready' && context.aclEpoch === context.hierarchyEpoch
  && context.protectedStateReadbackVerified;

export const validateOptionENativeRoleReadbacks = (
  readbacks: readonly IOptionENativeRoleReadback[]
): string[] => validateRoleSnapshot(readbacks, 'role readback', false);

export const convergeOptionENativeRoleDefinitions = (
  firstReadbacks: readonly IOptionENativeRoleReadback[],
  creationReceipts: readonly IOptionENativeRoleReadback[],
  secondReadbacks: readonly IOptionENativeRoleReadback[]
): IOptionENativeRoleConvergenceResult => {
  const errors = [
    ...validateRoleSnapshot(firstReadbacks, 'first read', true),
    ...validateRoleSnapshot(secondReadbacks, 'second read', false)
  ];
  const actions: IOptionENativeRoleConvergenceAction[] = [];
  const expectedNames = new Set(OPTION_E_NATIVE_ROLES.map(role => normalise(role.name)));
  creationReceipts.forEach(receipt => {
    if (!expectedNames.has(normalise(receipt.name))) {
      errors.push(`Creation receipt ${receipt.name} is not an authorised missing custom role.`);
    }
  });
  OPTION_E_NATIVE_ROLES.forEach(expected => {
    const first = firstReadbacks.filter(actual => expectedNameMatches(actual, expected.name));
    const receipts = creationReceipts.filter(actual => expectedNameMatches(actual, expected.name));
    const second = secondReadbacks.filter(actual => expectedNameMatches(actual, expected.name));
    if (first.length === 0) {
      if (receipts.length !== 1) {
        errors.push(`${expected.name} was missing and must have exactly one add-only creation receipt; found ${receipts.length}.`);
        return;
      }
      const receipt = receipts[0];
      if (!isPositiveRoleId(receipt.id) || !sameRole(receipt, expected)) {
        errors.push(`${expected.name} creation receipt must contain the returned positive ID and exact custom 0/${expected.high}/${expected.low} tuple.`);
        return;
      }
      if (second.length !== 1 || second[0].id !== receipt.id || !sameRole(second[0], expected)) {
        errors.push(`${expected.name} second read must refetch the exact created role by returned ID ${receipt.id}.`);
        return;
      }
      actions.push({
        action: 'AddMissingExact', name: expected.name, roleTypeKind: 0,
        high: expected.high, low: expected.low, roleDefinitionId: receipt.id
      });
      return;
    }
    if (receipts.length !== 0) {
      errors.push(`${expected.name} already existed and must never be created, edited, renamed or replaced.`);
    }
    if (first.length === 1 && second.length === 1) {
      if (!sameRole(first[0], expected) || !sameRole(second[0], expected) || first[0].id !== second[0].id) {
        errors.push(`${expected.name} changed between first and second native readback.`);
      } else {
        actions.push({
          action: 'ReuseExact', name: expected.name, roleTypeKind: 0,
          high: expected.high, low: expected.low, roleDefinitionId: first[0].id
        });
      }
    }
  });
  const firstRecovery = firstReadbacks.filter(actual => expectedNameMatches(actual, OPTION_E_RECOVERY_ROLE.name));
  const secondRecovery = secondReadbacks.filter(actual => expectedNameMatches(actual, OPTION_E_RECOVERY_ROLE.name));
  if (creationReceipts.some(actual => expectedNameMatches(actual, OPTION_E_RECOVERY_ROLE.name))) {
    errors.push('Recovery Full Control is built-in Administrator and must never be created or substituted.');
  }
  if (firstRecovery.length === 1 && secondRecovery.length === 1
    && (firstRecovery[0].id !== secondRecovery[0].id
      || !sameRole(firstRecovery[0], OPTION_E_RECOVERY_ROLE)
      || !sameRole(secondRecovery[0], OPTION_E_RECOVERY_ROLE))) {
    errors.push('Recovery Full Control changed between first and second native readback.');
  }
  const resolvedRoles = OPTION_E_NATIVE_ROLES.map(expected => secondReadbacks.find(actual =>
    actual.id > 0 && sameRole(actual, expected))).filter((role): role is IOptionENativeRoleReadback => Boolean(role));
  const recoveryRole = secondReadbacks.find(actual => actual.id > 0 && sameRole(actual, OPTION_E_RECOVERY_ROLE));
  return {
    ready: errors.length === 0 && actions.length === OPTION_E_NATIVE_ROLES.length
      && resolvedRoles.length === OPTION_E_NATIVE_ROLES.length && Boolean(recoveryRole),
    errors, actions, resolvedRoles, recoveryRole
  };
};

export const validateOptionENativeAssignmentReadback = (
  readback: IOptionENativeAssignmentReadback,
  expected: IOptionENativeRoleReadback
): string[] => {
  const errors: string[] = [];
  if (!isPositiveRoleId(expected.id)) errors.push('Expected role has no positive native role-definition ID.');
  if (readback.assignedRoles.length !== 1) {
    errors.push(`Expected exactly one role binding; found ${readback.assignedRoles.length}.`);
  } else if (readback.assignedRoles[0].id !== expected.id || !sameRole(readback.assignedRoles[0], expected)) {
    errors.push(`Assigned role is not exact native role-definition ID ${expected.id} ${expected.name}.`);
  }
  if (!isUint32(readback.effectiveHigh) || !isUint32(readback.effectiveLow)
    || readback.effectiveHigh !== expected.high || readback.effectiveLow !== expected.low) {
    errors.push(`Effective mask is broader or different; expected exact ${expected.high}/${expected.low}.`);
  }
  return errors;
};

export const allowsOptionENativeOperation = (
  role: Pick<IOptionENativeRoleReadback, 'id' | 'name' | 'roleTypeKind' | 'high' | 'low'>,
  verb: OptionENativeVerb
): boolean => {
  if (!isPositiveRoleId(role.id)) return false;
  const exact = OPTION_E_NATIVE_ROLES.find(item => item.name === role.name && item.roleTypeKind === role.roleTypeKind
    && item.high === role.high && item.low === role.low);
  if (!exact) return false;
  const required = verb === 'GET' ? OPTION_E_NATIVE_RIGHT_BITS.ViewListItems
    : verb === 'POST' ? OPTION_E_NATIVE_RIGHT_BITS.AddListItems
      : verb === 'PATCH' ? OPTION_E_NATIVE_RIGHT_BITS.EditListItems
        : verb === 'DELETE' ? OPTION_E_NATIVE_RIGHT_BITS.DeleteListItems
          : OPTION_E_NATIVE_RIGHT_BITS.ManagePermissions;
  return (exact.low & required) === required;
};

export const validateOptionECurrentManagerReadbacks = (context: IOptionEAclContext): string[] => {
  if (!isReadyCandidate(context)) return [];
  const errors: string[] = [];
  const convergence = convergeOptionENativeRoleDefinitions(
    context.roleDefinitionFirstReadbacks,
    context.roleDefinitionCreationReceipts,
    context.roleDefinitionSecondReadbacks
  );
  if (!convergence.ready) {
    return convergence.errors.map(error => `Role-definition convergence: ${error}`);
  }
  const manager = normalise(context.currentManagerPrincipal);
  const expectedTargets = optionEManagerProtectedTargets(context);
  const readbacks = context.currentManagerReadbacks || [];
  readbacks.forEach(readback => {
    if (expectedTargets.indexOf(readback.target) < 0) {
      errors.push(`Unexpected current-manager readback item ${readback.target}.`);
    }
    if (normalise(readback.principal) !== manager) {
      errors.push(`${readback.target} readback principal is not the exact current manager.`);
    }
    if (readback.hierarchyEpoch !== context.hierarchyEpoch || readback.aclEpoch !== context.aclEpoch) {
      errors.push(`${readback.target} readback epoch is stale or crossed.`);
    }
  });
  const reader = convergence.resolvedRoles.find(role => role.high === 0 && role.low === 1);
  if (!reader) return ['Role-definition convergence did not resolve Item Reader.'];
  expectedTargets.forEach(itemTarget => {
    const matches = readbacks.filter(readback => readback.target === itemTarget);
    if (matches.length !== 1) {
      errors.push(`${itemTarget} must have exactly one current-manager ACL readback; found ${matches.length}.`);
      return;
    }
    const readback = matches[0];
    validateOptionENativeAssignmentReadback(readback, reader)
      .forEach(error => errors.push(`${itemTarget} current-manager ${error}`));
  });
  return errors;
};

const negativeCases = (): readonly IOptionENegativeAclCase[] => [
  { principalClass: 'OtherEmployee', resource: 'AllOptionEPrivateRootsAndSubjectScopes', forbidden: ['GET', 'POST', 'PATCH', 'DELETE', 'MANAGE_PERMISSIONS'], expected: 'Denied' },
  { principalClass: 'FormerManager', resource: 'AllOptionESubjectScopes', forbidden: ['GET', 'POST', 'PATCH', 'DELETE', 'MANAGE_PERMISSIONS'], expected: 'Denied' },
  { principalClass: 'Visitor', resource: 'AllOptionEPrivateRootsAndSubjectScopes', forbidden: ['GET', 'POST', 'PATCH', 'DELETE', 'MANAGE_PERMISSIONS'], expected: 'Denied' },
  { principalClass: 'Member', resource: 'AllOptionEPrivateRootsAndSubjectScopes', forbidden: ['GET', 'POST', 'PATCH', 'DELETE', 'MANAGE_PERMISSIONS'], expected: 'Denied' },
  { principalClass: 'CurrentManager', resource: 'DraftAndSubmitRequest', forbidden: ['GET', 'POST', 'PATCH', 'DELETE', 'MANAGE_PERMISSIONS'], expected: 'Denied' },
  { principalClass: 'OwnEmployee', resource: 'OwnRequestFolder', forbidden: ['PATCH', 'DELETE', 'MANAGE_PERMISSIONS'], expected: 'Denied' },
  { principalClass: 'OwnEmployee', resource: 'ReadySnapshotControlSafeOperation', forbidden: ['POST', 'PATCH', 'DELETE', 'MANAGE_PERMISSIONS'], expected: 'Denied' },
  { principalClass: 'AclReconciler', resource: 'Audit', forbidden: ['GET', 'POST', 'PATCH', 'DELETE', 'MANAGE_PERMISSIONS'], expected: 'Denied' }
];

const validateContext = (context: IOptionEAclContext): void => {
  const roleConvergence = convergeOptionENativeRoleDefinitions(
    context.roleDefinitionFirstReadbacks,
    context.roleDefinitionCreationReceipts,
    context.roleDefinitionSecondReadbacks
  );
  if (!roleConvergence.ready) {
    throw new Error(`Native role-definition convergence failed: ${roleConvergence.errors.join(' ')}`);
  }
  const employee = normalise(context.employeePrincipal);
  const manager = normalise(context.currentManagerPrincipal);
  const processor = normalise(context.contentProcessorPrincipal);
  const reconciler = normalise(context.aclReconcilerPrincipal);
  const recovery = normalise(context.recoveryAdminPrincipal);
  const human = uniquePrincipals([
    context.employeePrincipal, context.currentManagerPrincipal || '', ...context.formerManagerPrincipals,
    ...context.otherEmployeePrincipals, ...context.visitorPrincipals, ...context.memberPrincipals
  ]);
  const siteAdmins = uniquePrincipals(context.siteCollectionAdminPrincipals);
  if (!context.personKey.trim() || !Number.isInteger(context.performanceYear) || context.performanceYear < 2000) {
    throw new Error('Option-E ACL planning requires an exact PersonKey and internal performance year.');
  }
  if (!employee || !processor || !reconciler || !recovery) {
    throw new Error('Employee, content processor, ACL reconciler and reviewed recovery principals are required.');
  }
  if (new Set([processor, reconciler, recovery]).size !== 3) {
    throw new Error('Content processor, ACL reconciler and recovery principal must be distinct.');
  }
  if (human.indexOf(processor) >= 0 || human.indexOf(reconciler) >= 0
    || siteAdmins.indexOf(processor) >= 0 || siteAdmins.indexOf(reconciler) >= 0) {
    throw new Error('Non-interactive processor principals cannot substitute human or site-collection-admin identities.');
  }
  if (human.indexOf(recovery) >= 0) throw new Error('Recovery principal cannot be an ordinary subject or manager identity.');
  if (manager && uniquePrincipals(context.formerManagerPrincipals).indexOf(manager) >= 0) {
    throw new Error('The exact current manager cannot also be a former-manager denial principal.');
  }
  if (context.aclEpoch > context.hierarchyEpoch) throw new Error('ACL epoch cannot exceed hierarchy epoch.');
  const claimInProgress = context.transitionStatus === 'Submitting' || context.transitionStatus === 'AclPending'
    || context.controlState === 'Submitted' || context.controlState === 'Approved' || context.controlState === 'Locked';
  if (claimInProgress && !context.requestCaptured) {
    throw new Error('Immutable request A must be captured before Submit/lock ACL reconciliation.');
  }
  if (context.controlState === 'Submitted' && context.transitionStatus === 'Ready' && !manager) {
    throw new Error('Submitted/Ready access requires the exact current-manager principal from People.');
  }
};

export const buildOptionEWorkplanAclPlan = (context: IOptionEAclContext): IOptionEAclPlan => {
  validateContext(context);
  const roleConvergence = convergeOptionENativeRoleDefinitions(
    context.roleDefinitionFirstReadbacks,
    context.roleDefinitionCreationReceipts,
    context.roleDefinitionSecondReadbacks
  );
  const steps: IOptionEAclStep[] = [];
  const processor = normalise(context.contentProcessorPrincipal);
  const reconciler = normalise(context.aclReconcilerPrincipal);
  const recovery = normalise(context.recoveryAdminPrincipal);
  const employee = normalise(context.employeePrincipal);
  const manager = normalise(context.currentManagerPrincipal);
  const formerManagers = uniquePrincipals(context.formerManagerPrincipals);
  const broadOrUnrelated = uniquePrincipals([
    ...context.otherEmployeePrincipals, ...context.visitorPrincipals, ...context.memberPrincipals
  ]);
  const roleForLow = (low: number): IOptionENativeRoleReadback => {
    const role = roleConvergence.resolvedRoles.find(item => item.low === low && item.high === 0
      && item.roleTypeKind === 0);
    if (!role) throw new Error(`No exact resolved Option-E custom role exists for High=0 Low=${low}.`);
    return role;
  };
  const subjectPrefix = `${context.performanceYear}|${context.personKey}|${context.hierarchyEpoch}|${context.aclEpoch}`;
  const add = (
    phase: OptionEAclPhase,
    operation: OptionEAclOperation,
    stepTarget: string,
    principal: string,
    role: IOptionENativeRoleReadback,
    reason: string
  ): void => {
    const sequence = steps.length + 1;
    steps.push({
      sequence, phase, operation, target: stepTarget, principal,
      roleDefinitionId: role.id, roleName: role.name, roleTypeKind: role.roleTypeKind,
      high: role.high, low: role.low, reason,
      idempotencyKey: `${subjectPrefix}|${sequence}|${phase}|${operation}|${stepTarget}|${principal}|${role.id}|${role.high}:${role.low}`
    });
  };
  const recoveryRole = roleConvergence.recoveryRole;
  if (!recoveryRole) throw new Error('No exact resolved recovery Administrator role exists.');
  const reader = roleForLow(1);
  const addReader = roleForLow(3);
  const draftEditor = roleForLow(5);

  add('PreserveRecovery', 'AssertRecoveryFullControl', 'OptionERecoveryBoundary', recovery, recoveryRole,
    'Verify exact live Full Control and capture assignments before any inheritance break.');

  OPTION_E_PRIVATE_ROOTS.forEach(root => {
    const breakPrincipal = root === 'DEMOAPP_Audit' ? recovery : reconciler;
    const breakRole = root === 'DEMOAPP_Audit' ? recoveryRole : roleForLow(33554433);
    add('PrivatiseRoots', 'BreakInheritanceNoCopy', root, breakPrincipal, breakRole,
      'Break inheritance without copying broad assignments.');
    add('PrivatiseRoots', 'EnsureRoleAssignment', root, processor, roleForLow(OPTION_E_CONTENT_PROCESSOR_MASKS[root]),
      'Bind the distinct content processor to the exact store-specific native mask.');
    const reconcilerMask = OPTION_E_ACL_RECONCILER_MASKS[root];
    if (reconcilerMask !== undefined) {
      add('PrivatiseRoots', 'EnsureRoleAssignment', root, reconciler, roleForLow(reconcilerMask),
        'Bind the distinct ACL reconciler only where authorised.');
    }
    add('PrivatiseRoots', 'EnsureRoleAssignment', root, recovery, recoveryRole,
      'Preserve reviewed recovery Full Control.');
    broadOrUnrelated.forEach(principal => add(
      'PrivatiseRoots', 'AssertDenied', root, principal, reader,
      'Verify unrelated employees, Visitors and Members have no root assignment.'
    ));
  });

  formerManagers.forEach(principal => add(
    'RevokeFormerManager', 'RemoveRoleAssignment', 'AllOptionESubjectScopes', principal, reader,
    'Remove every former-manager grant before current-manager access.'
  ));
  formerManagers.forEach(principal => add(
    'VerifyFormerManagerDenied', 'AssertDenied', 'AllOptionESubjectScopes', principal, reader,
    'Read back former-manager denial before granting a new manager.'
  ));

  const draftTarget = target('DEMOAPP_WorkplanDrafts', context, 'DraftItem');
  const requestFolder = target('DEMOAPP_WorkplanSubmitRequests', context, 'OwnFolder');
  const controlTarget = target('DEMOAPP_Workplans', context, 'ControlItem');
  const protectedEditable = (context.controlState === 'Draft' || context.controlState === 'ChangesRequested')
    && context.transitionStatus === 'Ready' && context.noCompetingOperation
    && context.protectedStateReadbackVerified && context.aclEpoch === context.hierarchyEpoch;
  const regrant = context.controlState === 'ChangesRequested' && protectedEditable;

  if (!protectedEditable) {
    add('RevokeDraftEdit', 'RemoveRoleAssignment', draftTarget, employee, draftEditor,
      'Remove Draft edit at Submit/lock or any unsafe protected state.');
    add('RevokeDraftEdit', 'EnsureRoleAssignment', draftTarget, employee, reader,
      'Retain read-only Draft access after edit revocation.');
    add('VerifyDraftReadOnly', 'ReadBackRoleAssignments', draftTarget, employee, reader,
      'Read back item role assignments after revocation.');
    add('VerifyDraftReadOnly', 'ReadBackEffectiveMask', draftTarget, employee, reader,
      'Read the employee effective native permission mask.');
    add('VerifyDraftReadOnly', 'AssertEffectiveMask', draftTarget, employee, reader,
      'Prove Add/Edit/Delete/ManagePermissions are all absent before AclVerified/Ready.');
  } else {
    add(regrant ? 'RegrantDraftEdit' : 'GrantEmployee', 'EnsureRoleAssignment', draftTarget, employee, draftEditor,
      regrant
        ? 'Regrant exact Draft edit only after ChangesRequested protected-state/readback and no competing operation.'
        : 'Grant exact initial Draft edit after protected binding/readback.');
    add(regrant ? 'VerifyDraftEdit' : 'VerifyExactAcl', 'ReadBackEffectiveMask', draftTarget, employee, draftEditor,
      'Read back exact Draft Editor High=0 Low=5.');
  }

  add('GrantEmployee', 'EnsureRoleAssignment', requestFolder, employee, addReader,
    'Own request folder allows add/read but no edit/delete/manage permissions.');
  add('GrantEmployee', 'EnsureRoleAssignment', controlTarget, employee, reader,
    'Employee reads the uniquely secured protected control item.');

  const managerTargets = optionEManagerProtectedTargets(context);
  if (manager) {
    managerTargets.forEach(itemTarget => add(
      'VerifyCurrentManagerDenied', 'AssertDenied', itemTarget, manager, reader,
      'Prove the current manager has no pre-existing access on every protected manager-readable item before grant.'
    ));
  }
  const readyCandidate = isReadyCandidate(context);
  const managerReadbackErrors = validateOptionECurrentManagerReadbacks(context);
  if (readyCandidate) {
    managerTargets.forEach(itemTarget => {
      add('GrantEmployee', 'EnsureRoleAssignment', itemTarget, employee, reader,
        'Employee receives Ready-only read access.');
      add('GrantCurrentManager', 'EnsureRoleAssignment', itemTarget, manager, reader,
        'Exact current manager receives Ready-only read access after former-manager denial.');
      add('VerifyCurrentManagerRead', 'ReadBackRoleAssignments', itemTarget, manager, reader,
        'Read back exactly one Item Reader role assignment for the exact current manager and item.');
      add('VerifyCurrentManagerRead', 'ReadBackEffectiveMask', itemTarget, manager, reader,
        'Read back the exact current-manager effective permission mask for this item and epoch.');
      add('VerifyCurrentManagerRead', 'AssertEffectiveMask', itemTarget, manager, reader,
        'Prove High=0 Low=1 so add/edit/delete/manage-permissions are absent.');
    });
    if (managerReadbackErrors.length) {
      managerTargets.forEach(itemTarget => {
        add('RevokeUnverifiedManager', 'RemoveRoleAssignment', itemTarget, manager, reader,
          'Fail closed because exact post-grant current-manager readback did not verify.');
        add('RevokeUnverifiedManager', 'AssertDenied', itemTarget, manager, reader,
          'Verify denial after revoking an unverified current-manager grant.');
      });
    }
  }
  const ready = readyCandidate && managerReadbackErrors.length === 0;

  uniquePrincipals([...broadOrUnrelated, ...formerManagers]).forEach(principal => add(
    'VerifyExactAcl', 'AssertDenied', 'AllOptionEPrivateRootsAndSubjectScopes', principal, reader,
    'Verify cross-user, former-manager and broad-principal denial.'
  ));

  return {
    contractVersion: 'DEMO-APP-B13-OPTION-E-V3', subject: `${context.personKey}|${context.performanceYear}`,
    hierarchyEpoch: context.hierarchyEpoch, aclEpoch: context.aclEpoch,
    ready, failClosedUntilReady: !ready, managerReadbackErrors, copiedFromPriorHierarchy: false,
    roleDefinitionActions: roleConvergence.actions,
    steps, negativeMatrix: negativeCases()
  };
};

export const assertOptionEWorkplanAclPlan = (plan: IOptionEAclPlan, context: IOptionEAclContext): string[] => {
  const errors: string[] = [];
  const roleConvergence = convergeOptionENativeRoleDefinitions(
    context.roleDefinitionFirstReadbacks,
    context.roleDefinitionCreationReceipts,
    context.roleDefinitionSecondReadbacks
  );
  if (!roleConvergence.ready) {
    errors.push(...roleConvergence.errors.map(error => `Role-definition convergence: ${error}`));
    return errors;
  }
  if (JSON.stringify(plan.roleDefinitionActions) !== JSON.stringify(roleConvergence.actions)) {
    errors.push('Role-definition convergence actions do not match the two native reads and creation receipts.');
  }
  const exactRoles = [...roleConvergence.resolvedRoles, roleConvergence.recoveryRole as IOptionENativeRoleReadback];
  plan.steps.forEach(step => {
    const exact = exactRoles.find(role => role.id === step.roleDefinitionId);
    if (!exact || step.roleName !== exact.name || step.roleTypeKind !== exact.roleTypeKind
      || step.high !== exact.high || step.low !== exact.low) {
      errors.push(`ACL step ${step.sequence} does not bind one exact positive native role-definition ID and tuple.`);
    }
  });
  const processor = normalise(context.contentProcessorPrincipal);
  const reconciler = normalise(context.aclReconcilerPrincipal);
  const recovery = normalise(context.recoveryAdminPrincipal);
  OPTION_E_PRIVATE_ROOTS.forEach(root => {
    const processorMask = OPTION_E_CONTENT_PROCESSOR_MASKS[root];
    if (!plan.steps.some(step => step.target === root && step.principal === processor
      && step.operation === 'EnsureRoleAssignment' && step.roleDefinitionId > 0
      && step.roleTypeKind === 0 && step.high === 0 && step.low === processorMask)) {
      errors.push(`${root} content-processor mask is missing or wrong.`);
    }
    const reconcilerMask = OPTION_E_ACL_RECONCILER_MASKS[root];
    const reconcilerGrant = plan.steps.some(step => step.target === root && step.principal === reconciler
      && step.operation === 'EnsureRoleAssignment');
    if ((reconcilerMask !== undefined && !reconcilerGrant) || (reconcilerMask === undefined && reconcilerGrant)) {
      errors.push(`${root} ACL-reconciler assignment is wrong.`);
    }
    if (!plan.steps.some(step => step.target === root && step.principal === recovery
      && step.roleDefinitionId === roleConvergence.recoveryRole?.id && step.roleTypeKind === 5
      && step.high === OPTION_E_RECOVERY_ROLE.high && step.low === OPTION_E_RECOVERY_ROLE.low)) {
      errors.push(`${root} recovery Full Control is missing.`);
    }
  });
  const managerGrantIndex = plan.steps.findIndex(step => step.phase === 'GrantCurrentManager'
    && step.operation === 'EnsureRoleAssignment');
  uniquePrincipals(context.formerManagerPrincipals).forEach(principal => {
    const revoke = plan.steps.findIndex(step => step.phase === 'RevokeFormerManager' && step.principal === principal);
    const verify = plan.steps.findIndex(step => step.phase === 'VerifyFormerManagerDenied' && step.principal === principal);
    if (revoke < 0 || verify <= revoke || (managerGrantIndex >= 0 && verify >= managerGrantIndex)) {
      errors.push(`Former-manager revoke/verify ordering is unsafe for ${principal}.`);
    }
  });
  if (plan.steps.some(step => step.target === 'DEMOAPP_Audit' && step.principal === reconciler)) {
    errors.push('ACL reconciler must have no Audit assignment.');
  }
  if (new Set(plan.steps.map(step => step.idempotencyKey)).size !== plan.steps.length) {
    errors.push('ACL step idempotency keys are not unique.');
  }
  const nonEditable = !((context.controlState === 'Draft' || context.controlState === 'ChangesRequested')
    && context.transitionStatus === 'Ready' && context.noCompetingOperation
    && context.protectedStateReadbackVerified && context.aclEpoch === context.hierarchyEpoch);
  if (nonEditable && !plan.steps.some(step => step.phase === 'VerifyDraftReadOnly'
    && step.operation === 'AssertEffectiveMask' && step.low === 1)) {
    errors.push('Draft edit revocation lacks effective-mask proof.');
  }
  const manager = normalise(context.currentManagerPrincipal);
  const managerTargets = optionEManagerProtectedTargets(context);
  const expectedReader = roleConvergence.resolvedRoles.find(role => role.high === 0 && role.low === 1);
  if (manager) {
    managerTargets.forEach(itemTarget => {
      const denialIndex = plan.steps.findIndex(step => step.phase === 'VerifyCurrentManagerDenied'
        && step.operation === 'AssertDenied' && step.target === itemTarget && step.principal === manager);
      const grantIndex = plan.steps.findIndex(step => step.phase === 'GrantCurrentManager'
        && step.operation === 'EnsureRoleAssignment' && step.target === itemTarget && step.principal === manager);
      if (denialIndex < 0 || (grantIndex >= 0 && denialIndex >= grantIndex)) {
        errors.push(`${itemTarget} lacks current-manager denial before grant.`);
      }
      if (isReadyCandidate(context)) {
        const roleReadIndex = plan.steps.findIndex(step => step.phase === 'VerifyCurrentManagerRead'
          && step.operation === 'ReadBackRoleAssignments' && step.target === itemTarget
          && step.principal === manager && step.roleDefinitionId === expectedReader?.id
          && step.roleTypeKind === 0 && step.high === 0 && step.low === 1);
        const maskReadIndex = plan.steps.findIndex(step => step.phase === 'VerifyCurrentManagerRead'
          && step.operation === 'ReadBackEffectiveMask' && step.target === itemTarget
          && step.principal === manager && step.roleDefinitionId === expectedReader?.id
          && step.roleTypeKind === 0 && step.high === 0 && step.low === 1);
        const maskAssertIndex = plan.steps.findIndex(step => step.phase === 'VerifyCurrentManagerRead'
          && step.operation === 'AssertEffectiveMask' && step.target === itemTarget
          && step.principal === manager && step.roleDefinitionId === expectedReader?.id
          && step.roleTypeKind === 0 && step.high === 0 && step.low === 1);
        if (grantIndex < 0 || roleReadIndex <= grantIndex || maskReadIndex <= roleReadIndex
          || maskAssertIndex <= maskReadIndex) {
          errors.push(`${itemTarget} lacks ordered exact current-manager role/effective-mask readback.`);
        }
      }
    });
  }
  const expectedReadbackErrors = validateOptionECurrentManagerReadbacks(context);
  if (plan.managerReadbackErrors.join('|') !== expectedReadbackErrors.join('|')) {
    errors.push('Current-manager readback errors do not match the supplied exact evidence.');
  }
  if (plan.ready !== (isReadyCandidate(context) && expectedReadbackErrors.length === 0)) {
    errors.push('Ready does not fail closed on current-manager readback evidence.');
  }
  return errors;
};
