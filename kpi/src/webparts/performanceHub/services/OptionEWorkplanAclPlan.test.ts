import { OPTION_E_NATIVE_ROLES, OPTION_E_RECOVERY_ROLE } from './OptionEWorkplanPhysicalSchema';
import {
  allowsOptionENativeOperation,
  assertOptionEWorkplanAclPlan,
  buildOptionEWorkplanAclPlan,
  convergeOptionENativeRoleDefinitions,
  optionEManagerProtectedTargets,
  validateOptionECurrentManagerReadbacks,
  validateOptionENativeAssignmentReadback,
  validateOptionENativeRoleReadbacks,
  type IOptionEAclContext,
  type IOptionEManagerAclReadback,
  type IOptionENativeRoleReadback
} from './OptionEWorkplanAclPlan';

const roleReadbacks = (): readonly IOptionENativeRoleReadback[] => [
  ...OPTION_E_NATIVE_ROLES.map((role, index) => ({ id: index + 100, ...role })),
  { id: 900, ...OPTION_E_RECOVERY_ROLE }
];

const context = (overrides: Partial<IOptionEAclContext> = {}): IOptionEAclContext => ({
  personKey: 'EMP-001', performanceYear: 2027, controlState: 'Draft', transitionStatus: 'Ready',
  hierarchyEpoch: 4, aclEpoch: 4, employeePrincipal: 'employee@example.invalid',
  currentManagerPrincipal: 'manager.new@example.invalid', formerManagerPrincipals: ['manager.old@example.invalid'],
  otherEmployeePrincipals: ['other@example.invalid'], visitorPrincipals: ['KCF Visitors'],
  memberPrincipals: ['KCF Members'], siteCollectionAdminPrincipals: ['site.admin@example.invalid'],
  contentProcessorPrincipal: 'processor@app.example.invalid', aclReconcilerPrincipal: 'acl@app.example.invalid',
  recoveryAdminPrincipal: 'recovery.admin@example.invalid', requestCaptured: true,
  protectedStateReadbackVerified: true, noCompetingOperation: true,
  roleDefinitionFirstReadbacks: roleReadbacks(), roleDefinitionCreationReceipts: [],
  roleDefinitionSecondReadbacks: roleReadbacks(), ...overrides
});

const exactManagerReadbacks = (current: IOptionEAclContext): IOptionEManagerAclReadback[] =>
  optionEManagerProtectedTargets(current).map(itemTarget => ({
    target: itemTarget,
    principal: current.currentManagerPrincipal || '',
    hierarchyEpoch: current.hierarchyEpoch,
    aclEpoch: current.aclEpoch,
    assignedRoles: [roleReadbacks()[0]],
    effectiveHigh: 0,
    effectiveLow: 1
  }));

const submittedReadyContext = (): IOptionEAclContext => {
  const current = context({ controlState: 'Submitted', transitionStatus: 'Ready' });
  return { ...current, currentManagerReadbacks: exactManagerReadbacks(current) };
};

describe('B13-03 corrected Option-E V3 native ACL contract', () => {
  it('requires positive native IDs, five exact custom tuples and exact Administrator recovery', () => {
    expect(validateOptionENativeRoleReadbacks(roleReadbacks())).toEqual([]);
    expect(validateOptionENativeRoleReadbacks(roleReadbacks().map((role, index) =>
      index === 0 ? { ...role, low: 3 } : role))).toEqual(expect.arrayContaining([
      expect.stringContaining('expected custom 0/0/1')
    ]));
    const duplicated = roleReadbacks().map((role, index) => index === 1 ? { ...role, id: 100 } : role);
    expect(validateOptionENativeRoleReadbacks(duplicated)).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicate native role-definition ID 100')
    ]));
    expect(validateOptionENativeRoleReadbacks(roleReadbacks().map((role, index) =>
      index === 0 ? { ...role, id: 0 } : role))).toEqual(expect.arrayContaining([
      expect.stringContaining('no positive native role-definition ID')
    ]));
    expect(validateOptionENativeRoleReadbacks(roleReadbacks().map(role =>
      role.name === 'Full Control' ? { ...role, roleTypeKind: 0 } : role))).toEqual(expect.arrayContaining([
      expect.stringContaining('expected Administrator 5/2147483647/4294967295')
    ]));
  });

  it('reuses exact roles and add-only creates a missing custom role by captured/refetched ID', () => {
    const exact = roleReadbacks();
    const reused = convergeOptionENativeRoleDefinitions(exact, [], exact);
    expect(reused.ready).toBe(true);
    expect(reused.actions).toHaveLength(5);
    expect(reused.actions.every(action => action.action === 'ReuseExact'
      && action.roleTypeKind === 0 && action.roleDefinitionId > 0)).toBe(true);

    const missing = exact[2];
    const first = exact.filter(role => role.id !== missing.id);
    const created = convergeOptionENativeRoleDefinitions(first, [missing], exact);
    expect(created.ready).toBe(true);
    expect(created.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: 'AddMissingExact', name: missing.name, roleTypeKind: 0,
        high: 0, low: 5, roleDefinitionId: missing.id
      })
    ]));
  });

  it('fails closed on duplicate/same-name, wrong-mask, wrong-type and same-mask aliases', () => {
    const exact = roleReadbacks();
    const duplicateName = [...exact, { ...exact[0], id: 801 }];
    expect(validateOptionENativeRoleReadbacks(duplicateName)).toEqual(expect.arrayContaining([
      expect.stringContaining('duplicate/same-name')
    ]));
    expect(validateOptionENativeRoleReadbacks(exact.map((role, index) =>
      index === 0 ? { ...role, low: 3 } : role))).toEqual(expect.arrayContaining([
      expect.stringContaining('expected custom 0/0/1')
    ]));
    expect(validateOptionENativeRoleReadbacks(exact.map((role, index) =>
      index === 0 ? { ...role, roleTypeKind: 5 } : role))).toEqual(expect.arrayContaining([
      expect.stringContaining('expected custom 0/0/1')
    ]));
    const sameMaskAlias = [...exact, {
      id: 802, name: 'Alias Reader', roleTypeKind: 0, high: 0, low: 1
    }];
    expect(validateOptionENativeRoleReadbacks(sameMaskAlias)).toEqual(expect.arrayContaining([
      expect.stringContaining('same-mask alias')
    ]));
  });

  it('fails closed when the second read changes or creation is attempted for an existing role', () => {
    const exact = roleReadbacks();
    const changedSecond = exact.map((role, index) => index === 0 ? { ...role, id: 777 } : role);
    expect(convergeOptionENativeRoleDefinitions(exact, [], changedSecond)).toEqual(expect.objectContaining({
      ready: false,
      errors: expect.arrayContaining([expect.stringContaining('changed between first and second')])
    }));
    expect(convergeOptionENativeRoleDefinitions(exact, [exact[0]], exact)).toEqual(expect.objectContaining({
      ready: false,
      errors: expect.arrayContaining([expect.stringContaining('already existed and must never be created')])
    }));

    const first = exact.slice(1);
    const wrongReturnedId = { ...exact[0], id: 778 };
    expect(convergeOptionENativeRoleDefinitions(first, [wrongReturnedId], exact)).toEqual(expect.objectContaining({
      ready: false,
      errors: expect.arrayContaining([expect.stringContaining('refetch the exact created role by returned ID 778')])
    }));
  });

  it('proves permissions from exact masks rather than role-name semantics', () => {
    const reader = roleReadbacks()[0];
    const addReader = roleReadbacks()[1];
    const editor = roleReadbacks()[2];
    const reconciler = roleReadbacks()[4];
    expect(allowsOptionENativeOperation(reader, 'GET')).toBe(true);
    expect(allowsOptionENativeOperation(addReader, 'POST')).toBe(true);
    expect(allowsOptionENativeOperation(addReader, 'PATCH')).toBe(false);
    expect(allowsOptionENativeOperation(editor, 'PATCH')).toBe(true);
    expect(allowsOptionENativeOperation(editor, 'POST')).toBe(false);
    expect(allowsOptionENativeOperation(reconciler, 'MANAGE_PERMISSIONS')).toBe(true);
    expect(allowsOptionENativeOperation(reconciler, 'DELETE')).toBe(false);
    expect(allowsOptionENativeOperation({ ...reader, low: 3 }, 'GET')).toBe(false);
    expect(allowsOptionENativeOperation({ ...reader, id: 0 }, 'GET')).toBe(false);
  });

  it('fails closed on multiple bindings, wrong role IDs and broader effective rights', () => {
    const reader = roleReadbacks()[0];
    expect(validateOptionENativeAssignmentReadback({
      assignedRoles: [reader], effectiveHigh: 0, effectiveLow: 1
    }, reader)).toEqual([]);
    expect(validateOptionENativeAssignmentReadback({
      assignedRoles: [reader, roleReadbacks()[1]], effectiveHigh: 0, effectiveLow: 3
    }, reader)).toEqual(expect.arrayContaining([
      expect.stringContaining('exactly one role binding'),
      expect.stringContaining('broader or different')
    ]));
    expect(validateOptionENativeAssignmentReadback({
      assignedRoles: [{ ...reader, id: 999 }], effectiveHigh: 0, effectiveLow: 1
    }, reader)).toEqual(expect.arrayContaining([
      expect.stringContaining(`exact native role-definition ID ${reader.id}`)
    ]));
  });

  it('separates processors, reconciler, recovery, humans and site admins', () => {
    expect(() => buildOptionEWorkplanAclPlan(context({
      aclReconcilerPrincipal: 'employee@example.invalid'
    }))).toThrow(/cannot substitute human/i);
    expect(() => buildOptionEWorkplanAclPlan(context({
      contentProcessorPrincipal: 'site.admin@example.invalid'
    }))).toThrow(/site-collection-admin/i);
    expect(() => buildOptionEWorkplanAclPlan(context({
      recoveryAdminPrincipal: 'manager.new@example.invalid'
    }))).toThrow(/ordinary subject or manager/i);
  });

  it('grants exact root masks while keeping the ACL reconciler out of Audit', () => {
    const current = context();
    const plan = buildOptionEWorkplanAclPlan(current);
    expect(assertOptionEWorkplanAclPlan(plan, current)).toEqual([]);
    expect(plan.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({
        target: 'KCFKPI_Audit', principal: 'processor@app.example.invalid',
        roleDefinitionId: 101, roleTypeKind: 0, high: 0, low: 3
      }),
      expect.objectContaining({ target: 'KCFKPI_Audit', principal: 'recovery.admin@example.invalid',
        roleDefinitionId: 900, roleTypeKind: 5, high: 2147483647, low: 4294967295 })
    ]));
    expect(plan.steps.some(step => step.target === 'KCFKPI_Audit'
      && step.principal === 'acl@app.example.invalid')).toBe(false);
  });

  it('removes Draft edit and proves effective Low=1 during Submit/lock', () => {
    const current = context({ controlState: 'Submitted', transitionStatus: 'AclPending' });
    const plan = buildOptionEWorkplanAclPlan(current);
    expect(assertOptionEWorkplanAclPlan(plan, current)).toEqual([]);
    expect(plan.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'RevokeDraftEdit', operation: 'RemoveRoleAssignment', low: 5 }),
      expect.objectContaining({ phase: 'VerifyDraftReadOnly', operation: 'ReadBackRoleAssignments', low: 1 }),
      expect.objectContaining({ phase: 'VerifyDraftReadOnly', operation: 'ReadBackEffectiveMask', low: 1 }),
      expect.objectContaining({ phase: 'VerifyDraftReadOnly', operation: 'AssertEffectiveMask', low: 1 })
    ]));
    expect(() => buildOptionEWorkplanAclPlan(context({
      controlState: 'Submitted', transitionStatus: 'AclPending', requestCaptured: false
    }))).toThrow(/request A/i);
  });

  it('regrants Draft edit only after protected ChangesRequested safety checks', () => {
    const safe = buildOptionEWorkplanAclPlan(context({ controlState: 'ChangesRequested' }));
    expect(safe.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ phase: 'RegrantDraftEdit', operation: 'EnsureRoleAssignment', low: 5 }),
      expect.objectContaining({ phase: 'VerifyDraftEdit', operation: 'ReadBackEffectiveMask', low: 5 })
    ]));
    const unsafe = buildOptionEWorkplanAclPlan(context({
      controlState: 'ChangesRequested', protectedStateReadbackVerified: false
    }));
    expect(unsafe.steps.some(step => step.phase === 'RegrantDraftEdit')).toBe(false);
    expect(unsafe.steps.some(step => step.phase === 'VerifyDraftReadOnly' && step.low === 1)).toBe(true);
  });

  it('denies first, then grants and verifies exact current-manager Low=1 on all three protected items', () => {
    const current = submittedReadyContext();
    const plan = buildOptionEWorkplanAclPlan(current);
    expect(plan.ready).toBe(true);
    expect(plan.managerReadbackErrors).toEqual([]);
    expect(validateOptionECurrentManagerReadbacks(current)).toEqual([]);
    const revoke = plan.steps.findIndex(step => step.phase === 'RevokeFormerManager');
    const denied = plan.steps.findIndex(step => step.phase === 'VerifyFormerManagerDenied');
    const grant = plan.steps.findIndex(step => step.phase === 'GrantCurrentManager'
      && step.operation === 'EnsureRoleAssignment');
    expect(revoke).toBeGreaterThan(-1);
    expect(denied).toBeGreaterThan(revoke);
    expect(grant).toBeGreaterThan(denied);
    expect(plan.steps.filter(step => step.phase === 'VerifyCurrentManagerDenied'
      && step.operation === 'AssertDenied')).toHaveLength(3);
    expect(plan.steps.filter(step => step.phase === 'GrantCurrentManager'
      && step.operation === 'EnsureRoleAssignment').map(step => step.low)).toEqual([1, 1, 1]);
    expect(plan.steps.filter(step => step.phase === 'VerifyCurrentManagerRead'
      && step.operation === 'ReadBackRoleAssignments')).toHaveLength(3);
    expect(plan.steps.filter(step => step.phase === 'VerifyCurrentManagerRead'
      && step.operation === 'ReadBackEffectiveMask')).toHaveLength(3);
    expect(plan.steps.filter(step => step.phase === 'VerifyCurrentManagerRead'
      && step.operation === 'AssertEffectiveMask').every(step => step.high === 0 && step.low === 1)).toBe(true);
    expect(assertOptionEWorkplanAclPlan(plan, current)).toEqual([]);
    expect(() => buildOptionEWorkplanAclPlan(context({
      controlState: 'Submitted', transitionStatus: 'Ready', currentManagerPrincipal: undefined
    }))).toThrow(/current-manager/i);
  });

  it('detects an omitted protected-control denial before the manager grant', () => {
    const current = submittedReadyContext();
    const plan = buildOptionEWorkplanAclPlan(current);
    const controlTarget = optionEManagerProtectedTargets(current)[2];
    const tampered = {
      ...plan,
      steps: plan.steps.filter(step => !(step.phase === 'VerifyCurrentManagerDenied'
        && step.target === controlTarget))
    };
    expect(assertOptionEWorkplanAclPlan(tampered, current)).toEqual(expect.arrayContaining([
      expect.stringContaining(`${controlTarget} lacks current-manager denial before grant`)
    ]));
  });

  it('detects an absent post-grant current-manager role/effective-mask readback', () => {
    const current = submittedReadyContext();
    const plan = buildOptionEWorkplanAclPlan(current);
    const operationTarget = optionEManagerProtectedTargets(current)[1];
    const tampered = {
      ...plan,
      steps: plan.steps.filter(step => !(step.phase === 'VerifyCurrentManagerRead'
        && step.operation === 'ReadBackEffectiveMask' && step.target === operationTarget))
    };
    expect(assertOptionEWorkplanAclPlan(tampered, current)).toEqual(expect.arrayContaining([
      expect.stringContaining(`${operationTarget} lacks ordered exact current-manager role/effective-mask readback`)
    ]));
  });

  it('fails closed on broader manager masks and revokes the unverified grant', () => {
    const current = submittedReadyContext();
    const readbacks = exactManagerReadbacks(current);
    readbacks[0] = { ...readbacks[0], effectiveLow: 3 };
    const adverse = { ...current, currentManagerReadbacks: readbacks };
    const plan = buildOptionEWorkplanAclPlan(adverse);
    expect(plan.ready).toBe(false);
    expect(plan.managerReadbackErrors).toEqual(expect.arrayContaining([
      expect.stringContaining('Effective mask is broader or different; expected exact 0/1')
    ]));
    expect(plan.steps.filter(step => step.phase === 'RevokeUnverifiedManager'
      && step.operation === 'RemoveRoleAssignment')).toHaveLength(3);
  });

  it('fails closed on missing, duplicate, wrong-principal, wrong-item or wrong-epoch readback', () => {
    const base = submittedReadyContext();
    const cases: Array<(items: IOptionEManagerAclReadback[]) => IOptionEManagerAclReadback[]> = [
      items => items.slice(1),
      items => [...items, { ...items[0] }],
      items => [{ ...items[0], principal: 'other@example.invalid' }, ...items.slice(1)],
      items => [{ ...items[0], target: 'KCFKPI_Workplans/2027/EMP-999/ControlItem' }, ...items.slice(1)],
      items => [{ ...items[0], aclEpoch: items[0].aclEpoch - 1 }, ...items.slice(1)]
    ];
    cases.forEach(mutate => {
      const adverse = { ...base, currentManagerReadbacks: mutate(exactManagerReadbacks(base)) };
      const plan = buildOptionEWorkplanAclPlan(adverse);
      expect(plan.ready).toBe(false);
      expect(plan.managerReadbackErrors.length).toBeGreaterThan(0);
    });
  });

  it('carries explicit negative cases for broad, cross-user, manager and mutation denial', () => {
    const plan = buildOptionEWorkplanAclPlan(context());
    expect(plan.negativeMatrix.map(item => item.principalClass)).toEqual(expect.arrayContaining([
      'OtherEmployee', 'FormerManager', 'Visitor', 'Member', 'CurrentManager', 'OwnEmployee', 'AclReconciler'
    ]));
    expect(plan.negativeMatrix.find(item => item.principalClass === 'OwnEmployee'
      && item.resource === 'OwnRequestFolder')?.forbidden).toEqual(['PATCH', 'DELETE', 'MANAGE_PERMISSIONS']);
  });
});
