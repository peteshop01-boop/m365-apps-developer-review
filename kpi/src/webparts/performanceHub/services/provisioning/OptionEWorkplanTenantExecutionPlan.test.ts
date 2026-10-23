import {
  OPTION_E_ACL_RECONCILER_MASKS,
  OPTION_E_CONTENT_PROCESSOR_MASKS,
  OPTION_E_NATIVE_ROLES,
  OPTION_E_RECOVERY_ROLE,
  OPTION_E_WORKPLAN_SCHEMA,
  type OptionEWorkplanListTitle
} from '../OptionEWorkplanPhysicalSchema';
import { optionEManagerProtectedTargets, type IOptionEAclContext, type IOptionENativeRoleReadback } from '../OptionEWorkplanAclPlan';
import { optionEExpectedReadback } from './OptionEWorkplanProvisioner';
import {
  OPTION_E_BINDING_VERSION,
  OPTION_E_EXECUTOR_ENVIRONMENT,
  OPTION_E_EXECUTOR_SITE_URL,
  OPTION_E_EXECUTOR_VERSION,
  OPTION_E_EXECUTOR_WEB_ID,
  OptionETenantExecutionPlanError,
  buildOptionETenantExecutionPlan,
  optionECanonicalJson,
  type IOptionEExecutorIdentity,
  type IOptionERootAssignmentReadback,
  type IOptionESubjectBinding,
  type IOptionETenantExecutionInput
} from './OptionEWorkplanTenantExecutionPlan';

const HASH_A = 'A'.repeat(64);
const HASH_B = 'B'.repeat(64);
const HASH_C = 'C'.repeat(64);
const HASH_D = 'D'.repeat(64);
const HASH_E = 'E'.repeat(64);
const HASH_F = 'F'.repeat(64);
const HASH_1 = '1'.repeat(64);
const ids = {
  tenant: 'bcbcff1a-88fd-4fc7-a95e-8301a57804d1',
  run: 'e1fcf799-5483-4fc1-ae29-aeb173e8b87d',
  E1: '996420f5-bef1-439c-a6df-fc2b00f17295',
  M1: 'b6b93635-15a5-43bd-ad8a-21b5d8dd62dd',
  M0: '10890161-bb09-4e2b-a3b9-822269d4e7e4',
  U1: '03d2d7a9-2113-44af-a3db-b1381c2f3f95',
  E2: '986b2c7b-4987-444b-a992-c67187bd4ff1',
  ContentProcessor: 'be76889c-a5ec-4e2a-ad8a-8af90361cb7a',
  AclReconciler: 'ff5e8ccf-97ca-4d1b-a2ed-923eeacd37a2',
  Recovery: 'd7d1ffb6-9f15-415d-af27-59d93da435a3',
  Operator: '8fe88f07-6d05-44e3-a50f-5ca45b245b7a'
};

const nativeRoles = (): IOptionENativeRoleReadback[] => [
  ...OPTION_E_NATIVE_ROLES.map((role, index) => ({ ...role, id: 101 + index })),
  { ...OPTION_E_RECOVERY_ROLE, id: 199 }
];

const identities = (): IOptionEExecutorIdentity[] =>
  (Object.keys(ids).filter(label => label !== 'tenant' && label !== 'run') as IOptionEExecutorIdentity['label'][])
    .map(label => ({
      label,
      objectId: ids[label],
      loginClaim: `i:0#.f|membership|${label.toLowerCase()}@example.test`,
      isSiteAdmin: label === 'Recovery' || label === 'Operator',
      currentUserReceiptSha256: HASH_A,
      membershipSha256: HASH_B
    }));

const roleForLow = (roles: readonly IOptionENativeRoleReadback[], low: number): IOptionENativeRoleReadback =>
  roles.find(role => role.roleTypeKind === 0 && role.low === low) as IOptionENativeRoleReadback;

const exactRootAssignments = (roles: readonly IOptionENativeRoleReadback[]): IOptionERootAssignmentReadback[] => {
  const claim = (label: IOptionEExecutorIdentity['label']): string =>
    identities().find(identity => identity.label === label)?.loginClaim as string;
  const recovery = roles.find(role => role.roleTypeKind === 5) as IOptionENativeRoleReadback;
  return OPTION_E_WORKPLAN_SCHEMA.flatMap(definition => {
    const expected = [
      { principal: claim('ContentProcessor'), role: roleForLow(roles, OPTION_E_CONTENT_PROCESSOR_MASKS[definition.title]) },
      ...(OPTION_E_ACL_RECONCILER_MASKS[definition.title] === undefined ? [] : [{
        principal: claim('AclReconciler'),
        role: roleForLow(roles, OPTION_E_ACL_RECONCILER_MASKS[definition.title] as number)
      }]),
      { principal: claim('Recovery'), role: recovery }
    ];
    return expected.map(item => ({
      listTitle: definition.title,
      principal: item.principal,
      roleDefinition: item.role,
      effectiveHigh: item.role.high,
      effectiveLow: item.role.low
    }));
  });
};

const aclContext = (roles: readonly IOptionENativeRoleReadback[]): IOptionEAclContext => {
  const identity = (label: IOptionEExecutorIdentity['label']): string =>
    identities().find(item => item.label === label)?.loginClaim as string;
  const reader = roleForLow(roles, 1);
  const base: IOptionEAclContext = {
    personKey: 'person-1', performanceYear: 2026, controlState: 'Submitted', transitionStatus: 'Ready',
    hierarchyEpoch: 4, aclEpoch: 4,
    employeePrincipal: identity('E1'), currentManagerPrincipal: identity('M1'),
    formerManagerPrincipals: [identity('M0')], otherEmployeePrincipals: [identity('E2')],
    visitorPrincipals: [identity('U1')], memberPrincipals: [], siteCollectionAdminPrincipals: [identity('Recovery')],
    contentProcessorPrincipal: identity('ContentProcessor'), aclReconcilerPrincipal: identity('AclReconciler'),
    recoveryAdminPrincipal: identity('Recovery'), requestCaptured: true, protectedStateReadbackVerified: true,
    noCompetingOperation: true, roleDefinitionFirstReadbacks: roles,
    roleDefinitionCreationReceipts: [], roleDefinitionSecondReadbacks: roles
  };
  base.currentManagerReadbacks = optionEManagerProtectedTargets(base).map(target => ({
    target, principal: identity('M1'), hierarchyEpoch: 4, aclEpoch: 4,
    assignedRoles: [reader], effectiveHigh: 0, effectiveLow: 1
  }));
  return base;
};

const subjectBindings = (context: IOptionEAclContext): IOptionESubjectBinding[] => {
  const targets = [
    `KCFKPI_WorkplanDrafts/${context.performanceYear}/${context.personKey}/DraftItem`,
    `KCFKPI_WorkplanSubmitRequests/${context.performanceYear}/${context.personKey}/OwnFolder`,
    ...optionEManagerProtectedTargets(context)
  ];
  return targets.map((logicalTarget, index) => {
    const listTitle = logicalTarget.split('/')[0] as OptionEWorkplanListTitle;
    const listId = `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    return {
      logicalTarget, listTitle, listId, itemId: index + 1,
      uniqueId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      eTag: `\"${index + 1}\"`, beforeSha256: HASH_C,
      apiPath: `/_api/web/lists(guid'${listId}')/items(${index + 1})`,
      parentPrivate: true, recoveryProof: true, hierarchyEpoch: 4, aclEpoch: 4
    };
  });
};

const rootInput = (): IOptionETenantExecutionInput => {
  const roles = nativeRoles();
  const lists = OPTION_E_WORKPLAN_SCHEMA.map(optionEExpectedReadback);
  const capture = { lists, roles, rows: [], rootAssignments: exactRootAssignments(roles) };
  return {
    executorVersion: OPTION_E_EXECUTOR_VERSION,
    schemaVersion: 'KCF-KPI-B13-OPTION-E-V3',
    bindingVersion: OPTION_E_BINDING_VERSION,
    mode: 'Plan', scope: 'RootSchemaAcl', runId: ids.run,
    target: { tenantId: ids.tenant, siteUrl: OPTION_E_EXECUTOR_SITE_URL, webId: OPTION_E_EXECUTOR_WEB_ID,
      environmentLabel: OPTION_E_EXECUTOR_ENVIRONMENT, powerPlatformEnvironmentId: null },
    candidate: { commit: 'a'.repeat(40), tree: 'b'.repeat(40), sppkgSha256: HASH_A,
      schemaManifestSha256: HASH_B, bindingManifestSha256: HASH_C, executorPackageSha256: HASH_D,
      f03EvidenceSha256: HASH_E },
    operatorObjectId: ids.Operator,
    transportModule: { name: 'PnP.PowerShell', version: '3.2.0' },
    identities: identities(), firstCapture: capture, secondCapture: JSON.parse(JSON.stringify(capture)),
    allowListedCreateableRows: [],
    existingStoreAggregateSha256: {
      KCFKPI_Workplans: HASH_A, KCFKPI_Audit: HASH_B, KCFKPI_People: HASH_C
    },
    immediateDuplicateChecks: [
      { listTitle: 'KCFKPI_People', field: 'Email', nonBlankDuplicateCount: 0,
        querySha256: HASH_F, observedAtUtc: '2026-09-18T08:00:00.000Z' },
      { listTitle: 'KCFKPI_Workplans', field: 'DraftItemId', nonBlankDuplicateCount: 0,
        querySha256: HASH_1, observedAtUtc: '2026-09-18T08:00:01.000Z' }
    ]
  };
};

const subjectInput = (): IOptionETenantExecutionInput => {
  const input = rootInput();
  const context = aclContext(input.firstCapture.roles);
  input.scope = 'SubjectAcl';
  input.aclContext = context;
  input.subjectBindings = subjectBindings(context);
  return input;
};

const expectBlocked = (input: IOptionETenantExecutionInput, pattern: RegExp): void => {
  try {
    buildOptionETenantExecutionPlan(input, HASH_A);
    throw new Error('Expected the plan to fail closed.');
  } catch (error) {
    expect(error).toBeInstanceOf(OptionETenantExecutionPlanError);
    expect((error as Error).message).toMatch(pattern);
  }
};

describe('Option-E V2 tenant execution planner', () => {
  it('plans the exact seven-store, 98-field, ten-unique and five-custom-role zero-delta root contract', () => {
    const plan = buildOptionETenantExecutionPlan(rootInput(), HASH_A);
    expect(plan.assertions).toEqual(expect.objectContaining({
      storeCount: 7, fieldCount: 98, uniqueContractCount: 10, customRoleCount: 5,
      capturesEqual: true, principalsSeparated: true, noWildcardEtag: true
    }));
    expect(plan.mutationCount).toBe(0);
    expect(plan.executable).toBe(false);
    expect(plan.requiresBoundedResume).toBe(false);
  });

  it('is deterministic for the same immutable input and canonical hash', () => {
    const input = rootInput();
    expect(optionECanonicalJson(buildOptionETenantExecutionPlan(input, HASH_A)))
      .toBe(optionECanonicalJson(buildOptionETenantExecutionPlan(input, HASH_A)));
  });

  it('keeps Plan and Readback non-executable even when a delta exists', () => {
    const input = rootInput();
    const missing = input.firstCapture.lists.find(item => item.title === 'KCFKPI_WorkplanDrafts');
    if (missing) missing.exists = false;
    input.secondCapture = JSON.parse(JSON.stringify(input.firstCapture));
    const plan = buildOptionETenantExecutionPlan(input, HASH_A);
    expect(plan.mutationCount).toBeGreaterThan(0);
    expect(plan.executable).toBe(false);
    input.mode = 'Readback';
    const readback = buildOptionETenantExecutionPlan(input, HASH_A);
    expect(readback.executable).toBe(false);
    expect(readback.requiresBoundedResume).toBe(true);
    expect(readback.resumeReasons.join(' ')).toMatch(/Native Save schema NOT READY/);
  });

  it('reports a pending Workplans field as NOT READY in native readback', () => {
    const input = rootInput();
    input.mode = 'Readback';
    const workplans = input.firstCapture.lists.find(item => item.title === 'KCFKPI_Workplans');
    if (!workplans) throw new Error('Missing Workplans fixture.');
    workplans.fields = workplans.fields.filter(field => field.internalName !== 'PendingRequestKey');
    input.secondCapture = JSON.parse(JSON.stringify(input.firstCapture));
    const report = buildOptionETenantExecutionPlan(input, HASH_A);
    expect(report.executable).toBe(false);
    expect(report.requiresBoundedResume).toBe(true);
    expect(report.resumeReasons.join(' ')).toContain('CreateField:KCFKPI_Workplans.PendingRequestKey');
  });

  it('uses add-only role creation and requires a bounded replan before any ID-bound ACL', () => {
    const input = rootInput();
    input.firstCapture.roles = input.firstCapture.roles.filter(role => role.roleTypeKind === 5);
    input.secondCapture.roles = JSON.parse(JSON.stringify(input.firstCapture.roles));
    input.firstCapture.rootAssignments = [];
    input.secondCapture.rootAssignments = [];
    const plan = buildOptionETenantExecutionPlan(input, HASH_A);
    const adds = plan.steps.filter(step => step.operation === 'AddMissingExactRole');
    expect(adds).toHaveLength(5);
    expect(adds.every(step => step.roleTypeKind === 0 && step.roleDefinitionId === undefined)).toBe(true);
    expect(plan.requiresBoundedResume).toBe(true);
  });

  it('rejects a non-TEST site, web or environment before planning', () => {
    const input = rootInput();
    input.target.siteUrl = 'https://example.test/sites/Production';
    expectBlocked(input, /outside the exact TEST allow-list/);
  });

  it.each([
    ['web', (input: IOptionETenantExecutionInput): void => { input.target.webId = '59271670-824e-4911-ac53-c1cd0c345072'; }],
    ['environment', (input: IOptionETenantExecutionInput): void => { input.target.environmentLabel = 'Unexpected'; }]
  ])('rejects a non-allow-listed %s binding', (_label, mutate) => {
    const input = rootInput();
    mutate(input);
    expectBlocked(input, /outside the exact TEST allow-list/);
  });

  it('rejects unequal double captures as TOCTOU drift', () => {
    const input = rootInput();
    input.secondCapture.lists[0].enableVersioning = false;
    expectBlocked(input, /complete before captures differ/);
  });

  it('rejects a pre-existing createable-store row that is not exactly allow-listed', () => {
    const input = rootInput();
    const row = { listTitle: 'KCFKPI_WorkplanDrafts' as const, id: 1,
      uniqueId: '575d0745-eb5b-418e-a659-4b18cbc08ab1', eTag: '\"1\"', rowSha256: HASH_A,
      conflictsWithOptionE: false };
    input.firstCapture.rows = [row];
    input.secondCapture.rows = [row];
    expectBlocked(input, /not exactly allow-listed/);
  });

  it('rejects immediate uniqueness evidence with duplicates', () => {
    const input = rootInput();
    input.immediateDuplicateChecks[0].nonBlankDuplicateCount = 1;
    expectBlocked(input, /requires one immediate zero-duplicate query receipt/);
  });

  it('rejects overlapping operator, service and human principal identities', () => {
    const input = rootInput();
    input.identities[0].objectId = input.identities[1].objectId;
    expectBlocked(input, /object IDs must be distinct/);
  });

  it.each([
    ['wrong type', (role: IOptionENativeRoleReadback): void => { role.roleTypeKind = 5; }],
    ['wrong mask', (role: IOptionENativeRoleReadback): void => { role.low = 9; }]
  ])('rejects a custom role with %s', (_label, mutate) => {
    const input = rootInput();
    mutate(input.firstCapture.roles[0]);
    mutate(input.secondCapture.roles[0]);
    expectBlocked(input, /expected custom|wrong|Recovery Full Control/);
  });

  it('rejects a same-mask alias', () => {
    const input = rootInput();
    const alias = { ...input.firstCapture.roles[0], id: 501, name: 'Alias Reader' };
    input.firstCapture.roles = [...input.firstCapture.roles, alias];
    input.secondCapture.roles = JSON.parse(JSON.stringify(input.firstCapture.roles));
    expectBlocked(input, /same-mask alias/);
  });

  it('rejects Administrator substitution for a custom role', () => {
    const input = rootInput();
    const role = input.firstCapture.roles[0];
    role.roleTypeKind = 5;
    input.secondCapture = JSON.parse(JSON.stringify(input.firstCapture));
    expectBlocked(input, /expected custom/);
  });

  it('rejects an unexplained broader root right', () => {
    const input = rootInput();
    input.firstCapture.rootAssignments[0].effectiveLow = 15;
    input.secondCapture = JSON.parse(JSON.stringify(input.firstCapture));
    expectBlocked(input, /broader root assignment/);
  });

  it('rejects a wildcard subject ETag', () => {
    const input = subjectInput();
    if (input.subjectBindings) input.subjectBindings[0].eTag = '*';
    expectBlocked(input, /invalid ID, ETag or safe relative API path/);
  });

  it('rejects a missing exact subject binding', () => {
    const input = subjectInput();
    input.subjectBindings = input.subjectBindings?.slice(1);
    expectBlocked(input, /has no exact receipted binding/);
  });

  it('preserves former-manager denial, no-copy break and exact ID-bound manager grant order', () => {
    const input = subjectInput();
    const plan = buildOptionETenantExecutionPlan(input, HASH_A);
    const formerRemove = plan.steps.findIndex(step => step.operation === 'RemoveRoleAssignment');
    const formerDenied = plan.steps.findIndex(step => step.operation === 'AssertDenied');
    const managerGrant = plan.steps.findIndex(step => step.operation === 'EnsureRoleAssignment'
      && step.target.indexOf('CurrentSnapshot') >= 0 && step.low === 1);
    const breakIndex = plan.steps.findIndex(step => step.operation === 'BreakInheritanceNoCopy'
      && step.target.indexOf('CurrentSnapshot') >= 0);
    expect(formerRemove).toBeGreaterThanOrEqual(0);
    expect(formerDenied).toBeGreaterThan(formerRemove);
    expect(breakIndex).toBeGreaterThan(formerDenied);
    expect(managerGrant).toBeGreaterThan(breakIndex);
    expect(plan.steps.filter(step => step.operation === 'EnsureRoleAssignment')
      .every(step => Number.isInteger(step.roleDefinitionId) && (step.roleDefinitionId as number) > 0)).toBe(true);
  });

  it('proves recovery before the first subject inheritance break', () => {
    const plan = buildOptionETenantExecutionPlan(subjectInput(), HASH_A);
    const recovery = plan.steps.findIndex(step => step.operation === 'AssertRecoveryFullControl');
    const firstBreak = plan.steps.findIndex(step => step.operation === 'BreakInheritanceNoCopy');
    expect(recovery).toBeGreaterThanOrEqual(0);
    expect(firstBreak).toBeGreaterThan(recovery);
    expect(plan.steps.filter(step => step.mutatesTenant).every(step => Boolean(step.request))).toBe(true);
  });

  it('breaks a zero-row receipted newly created root only after recovery proof and before exact grants', () => {
    const input = rootInput();
    const title = 'KCFKPI_WorkplanDrafts';
    const update = (capture: typeof input.firstCapture): void => {
      const list = capture.lists.find(item => item.title === title) as typeof capture.lists[number] & {
        listId: string; eTag: string; createdByExecutorReceiptSha256: string;
      };
      list.rootHasUniqueRoleAssignments = false;
      list.listId = '8467eb8f-4b72-45be-a099-de139c3b7bcf';
      list.eTag = '\"3\"';
      list.createdByExecutorReceiptSha256 = HASH_F;
      capture.rootAssignments = capture.rootAssignments.filter(item => item.listTitle !== title);
    };
    update(input.firstCapture);
    update(input.secondCapture);
    const plan = buildOptionETenantExecutionPlan(input, HASH_A);
    const recovery = plan.steps.findIndex(step => step.operation === 'AssertRecoveryFullControl' && step.scope === 'RootSchemaAcl');
    const inheritanceBreak = plan.steps.findIndex(step => step.operation === 'BreakInheritanceNoCopy' && step.target === title);
    const firstGrant = plan.steps.findIndex(step => step.operation === 'EnsureRoleAssignment' && step.target === title);
    expect(recovery).toBeGreaterThanOrEqual(0);
    expect(inheritanceBreak).toBeGreaterThan(recovery);
    expect(firstGrant).toBeGreaterThan(inheritanceBreak);
    expect(plan.steps[firstGrant].roleTypeKind).toBe(5);
  });

  it('allows Apply only for a fully resolved zero-resume subject plan', () => {
    const input = subjectInput();
    input.mode = 'Apply';
    const plan = buildOptionETenantExecutionPlan(input, HASH_A);
    expect(plan.requiresAuthorisation).toBe(true);
    expect(plan.executable).toBe(true);
    expect(plan.mutationCount).toBeGreaterThan(0);
  });
});
