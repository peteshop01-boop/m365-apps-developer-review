import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { OPTION_E_SUBMIT_CONTRACT_VERSION } from '../models/OptionEWorkplanSubmitModels';
import {
  OPTION_E_SUBMIT_SOLUTION,
  exerciseOptionEAclExecutablePagination,
  validateOptionESubmitPackage,
  type IOptionEAclExecutablePage,
  type IOptionESubmitPackageFiles
} from './OptionEWorkplanSubmitPackageContract';

const root = join(process.cwd(), 'power-platform', 'KCFKPIOptionESubmitV1');
const workflowStem = `${OPTION_E_SUBMIT_SOLUTION.workflowUniqueName}-${OPTION_E_SUBMIT_SOLUTION.workflowId}`;
const text = (relative: string): string => readFileSync(join(root, relative), 'utf8');
const parsed = (relative: string): unknown => JSON.parse(text(relative)) as unknown;
const packageFiles = (definition: unknown = parsed('Definitions/option-e-submit.disabled.definition.json')): IOptionESubmitPackageFiles => ({
  definition,
  binding: parsed('Configuration/option-e-submit.binding.template.json'),
  manifest: parsed('option-e-submit-manifest.json'),
  solutionXml: text('PackageSource/Other/Solution.xml'),
  workflowDataXml: text(`PackageSource/Workflows/${workflowStem}.json.data.xml`)
});
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sha = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex').toUpperCase();

type Action = Record<string, unknown> & { actions?: Record<string, Action>; else?: { actions?: Record<string, Action> } };
const findActionRecord = (
  definition: unknown,
  name: string
): { action: Action; container: Record<string, Action> } => {
  const rootActions = (((definition as Action).properties as Action).definition as Action).actions as Record<string, Action>;
  let found: { action: Action; container: Record<string, Action> } | undefined;
  const visit = (actions: Record<string, Action> | undefined): void => {
    if (!actions || found) return;
    if (actions[name]) { found = { action: actions[name], container: actions }; return; }
    Object.values(actions).forEach(action => { visit(action.actions); visit(action.else?.actions); });
  };
  visit(rootActions);
  if (!found) throw new Error(`Action ${name} not found.`);
  return found;
};
const deleteAction = (definition: unknown, name: string): void => {
  const found = findActionRecord(definition, name); delete found.container[name];
};
const replaceEvery = (value: unknown, from: string, to: string): unknown =>
  JSON.parse(JSON.stringify(value).split(from).join(to)) as unknown;
const errorsFor = (definition: unknown, binding?: unknown): readonly string[] => {
  const files = packageFiles(definition);
  if (binding !== undefined) files.binding = binding;
  return validateOptionESubmitPackage(files);
};

describe('B13-05 deterministic disabled Option-E Submit package contract', () => {
  it('keeps solution/workflow identity, cross-layer v3 marker and disabled unbound posture exact', () => {
    const files = packageFiles();
    expect(validateOptionESubmitPackage(files)).toEqual([]);
    expect((files.manifest as { submitContractVersion: string }).submitContractVersion)
      .toBe(OPTION_E_SUBMIT_CONTRACT_VERSION);
    expect((files.definition as { properties: { governedSubmitContract: { submitContractVersion: string } } })
      .properties.governedSubmitContract.submitContractVersion)
      .toBe(OPTION_E_SUBMIT_CONTRACT_VERSION);
    expect((files.manifest as { disabled: boolean; unbound: boolean })).toMatchObject({ disabled: true, unbound: true });
  });

  it.each([
    ['missing reference binding', (binding: Record<string, unknown>) => {
      delete (binding.referenceListIds as Record<string, unknown>).KCFKPI_KPIMaster;
    }],
    ['extra reference binding', (binding: Record<string, unknown>) => {
      (binding.referenceListIds as Record<string, unknown>).KCFKPI_Extra = null;
    }],
    ['crossed reference binding', (binding: Record<string, unknown>) => {
      const refs = binding.referenceListIds as Record<string, unknown>;
      delete refs.KCFKPI_KPIMaster; refs.KCFKPI_Workplans = null;
    }],
    ['bound reference identity', (binding: Record<string, unknown>) => {
      (binding.referenceListIds as Record<string, unknown>).KCFKPI_KPIMaster = '8555b9e3-fa94-4fd0-af98-1977f20689b2';
    }]
  ])('rejects %s', (_name, mutate) => {
    const definition = parsed('Definitions/option-e-submit.disabled.definition.json');
    const binding = clone(parsed('Configuration/option-e-submit.binding.template.json')) as Record<string, unknown>;
    mutate(binding);
    expect(errorsFor(definition, binding)).not.toEqual([]);
  });

  it.each([
    'Read_Authoritative_Draft_A', 'Read_Authoritative_Draft_B',
    'Draft_Request_Bytes_And_Hash_Are_Exact'
  ])('rejects removal of F02 executable action %s', name => {
    const definition = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    deleteAction(definition, name);
    expect(errorsFor(definition)).toContain(`RepairActionMissing:${name}`);
  });

  it('rejects weakened Draft bytes/hash proof and operation creation outside the fresh protected-state guard', () => {
    const definition = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    (findActionRecord(definition, 'Draft_Request_Bytes_And_Hash_Are_Exact').action as { expression: unknown }).expression = {
      equals: [true, true]
    };
    expect(errorsFor(definition)).toContain('DraftRequestProvenanceGuardInvalid');

    const relocated = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    const create = findActionRecord(relocated, 'Create_Unique_Operation');
    delete create.container.Create_Unique_Operation;
    const pre = findActionRecord(relocated, 'Pre_Operation_Authority_Proof').action;
    pre.actions = { ...(pre.actions || {}), Create_Unique_Operation: create.action };
    expect(errorsFor(relocated)).toContain('PreOperationAuthorityOrderInvalid');
  });

  it.each([
    'Read_Current_Core_KPI_References', 'Read_Current_Core_Target_References',
    'Read_Current_Behaviour_Framework_Set', 'Read_Current_Behaviour_Framework_Values',
    'Read_Current_Person_Behaviour_Assignment', 'Read_Current_Behaviour_Prompts',
    'Protected_Assigned_Current_References_Are_Exact'
  ])('rejects removal of F03 executable action %s', name => {
    const definition = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    deleteAction(definition, name);
    expect(errorsFor(definition)).toContain(`RepairActionMissing:${name}`);
  });

  it('rejects crossed reference namespace, reference read-drift bypass and wrong prompt tier binding', () => {
    const crossed = replaceEvery(
      parsed('Definitions/option-e-submit.disabled.definition.json'),
      "parameters('referenceListIds')?['KCFKPI_KPIMaster']",
      "parameters('referenceListIds')?['KCFKPI_Workplans']"
    );
    expect(errorsFor(crossed)).toContain('ExecutableBindingClosureInvalid');

    const bypass = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    (findActionRecord(bypass, 'Protected_Assigned_Current_References_Are_Exact').action as { expression: unknown }).expression = {
      equals: [true, true]
    };
    expect(errorsFor(bypass)).toContain('ProtectedCurrentReferenceGuardInvalid');

    const wrongTier = replaceEvery(
      parsed('Definitions/option-e-submit.disabled.definition.json'), 'RoleLevelCode', 'RoleLevelName'
    );
    expect(errorsFor(wrongTier)).toContain('BehaviourPromptTierBindingInvalid');
  });

  it.each([
    ['Read_Draft_Native_ACL_Assignments_After_Apply', 'Apply_Draft'],
    ['Read_Snapshot_Native_ACL_Assignments_After_Apply', 'Apply_Snapshot'],
    ['Read_Safe_Operation_Native_ACL_Assignments_After_Apply', 'Apply_Operation'],
    ['Read_Native_ACL_Assignments_After_Apply', 'Apply_Control'],
    ['Fresh_Read_Draft_Native_ACL_Assignments', 'Fresh_Draft'],
    ['Fresh_Read_Snapshot_Native_ACL_Assignments', 'Fresh_Snapshot'],
    ['Fresh_Read_Safe_Operation_Native_ACL_Assignments', 'Fresh_Operation'],
    ['Fresh_Read_Native_ACL_Assignments', 'Fresh_Control']
  ])('rejects missing explicit complete canonical pagination on %s', (name, tag) => {
    const definition = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    delete findActionRecord(definition, `Enumerate_${tag}_ACL_Pages`).action.limit;
    expect(errorsFor(definition)).toContain(`AclExplicitPaginationInvalid:${name}`);
  });

  it('rejects a weakened executable continuation decision and non-terminating unsafe branch', () => {
    const weakened = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    findActionRecord(weakened, 'Validate_Apply_Draft_ACL_Page').action.expression = { equals: [true, true] };
    expect(errorsFor(weakened)).toContain('AclExplicitPaginationInvalid:Read_Draft_Native_ACL_Assignments_After_Apply');
    expect(errorsFor(weakened)).toContain('AclContinuationGuardInvalid:Read_Draft_Native_ACL_Assignments_After_Apply');

    const fallThrough = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    findActionRecord(fallThrough, 'Reject_Fresh_Control_Unsafe_ACL_Page').action.type = 'Compose';
    expect(errorsFor(fallThrough)).toContain('AclExplicitPaginationInvalid:Fresh_Read_Native_ACL_Assignments');

    const rawHistory = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
    const rawRecordInputs = findActionRecord(rawHistory, 'Record_Apply_Draft_ACL_Continuation').action.inputs as Record<string, unknown>;
    rawRecordInputs.value = "@coalesce(body('GET_Apply_Draft_ACL_Page')?['@odata.nextLink'],'')";
    expect(errorsFor(rawHistory)).toContain('AclExplicitPaginationInvalid:Read_Draft_Native_ACL_Assignments_After_Apply');
  });

  it('exhausts canonical relative and exact same-origin absolute ACL continuations before a protected write', () => {
    const site = 'https://tenant.example/sites/kcf';
    const collection = "/_api/web/lists(guid'fb1f6035-236e-434c-ae05-a78003badd47')/items(7)/RoleAssignments";
    const relative = `${collection}?$skiptoken=Paged%3DTRUE%26p_ID%3D7`;
    const relativeTrace = exerciseOptionEAclExecutablePagination(site, collection, [
      { value: [{ id: 1 }], '@odata.nextLink': relative }, { value: [{ id: 2 }] }
    ]);
    expect(relativeTrace).toMatchObject({
      accepted: true, reason: 'Complete', pageReads: 2, postPaginationProtectedWrites: 1,
      followedContinuations: [relative], accumulatedValues: [{ id: 1 }, { id: 2 }]
    });

    const absolute = `${site}${collection}?$expand=Member,RoleDefinitionBindings&$top=5000&$skiptoken=Paged%3DTRUE%26p_ID%3D7`;
    const absoluteTrace = exerciseOptionEAclExecutablePagination(site, collection, [
      { value: [], '@odata.nextLink': absolute }, { value: [] }
    ]);
    expect(absoluteTrace.accepted).toBe(true);
    expect(absoluteTrace.followedContinuations).toEqual([
      `${collection}?$expand=Member,RoleDefinitionBindings&$top=5000&$skiptoken=Paged%3DTRUE%26p_ID%3D7`
    ]);
  });

  const site = 'https://tenant.example/sites/kcf';
  const collection = "/_api/web/lists(guid'fb1f6035-236e-434c-ae05-a78003badd47')/items(7)/RoleAssignments";
  const safe = `${collection}?$skiptoken=Paged%3DTRUE%26p_ID%3D7`;
  const safeAbsolute = `${site}${safe}`;
  const attacks: ReadonlyArray<readonly [string, readonly IOptionEAclExecutablePage[]]> = [
    ['fragment', [{ value: [], '@odata.nextLink': `${safe}#fragment` }]],
    ['cross-collection', [{ value: [], '@odata.nextLink': safe.replace('/items(7)/', '/items(8)/') }]],
    ['off-origin', [{ value: [], '@odata.nextLink': `https://evil.example${safe}` }]],
    ['ambiguous representation', [{ value: [], '@odata.nextLink': safe, __next: safe }]],
    ['encoded path confusion', [{ value: [], '@odata.nextLink': `${collection}?$skiptoken=page%2Fescape` }]],
    ['double-encoded path confusion', [{ value: [], '@odata.nextLink': `${collection}?$skiptoken=page%252Fescape` }]],
    ['malformed percent encoding', [{ value: [], '@odata.nextLink': `${collection}?$skiptoken=page%ZZ` }]],
    ['skiptoken query confusion', [{ value: [], '@odata.nextLink': `${safe}&$filter=Injected` }]],
    ['blank continuation', [{ value: [], '@odata.nextLink': '' }]],
    ['partial continuation chain', [{ value: [], '@odata.nextLink': safe }]],
    ['partial page body', [{ '@odata.nextLink': safe }]],
    ['replayed continuation', [
      { value: [], '@odata.nextLink': safe }, { value: [], '@odata.nextLink': safe }, { value: [] }
    ]]
  ];
  it.each(['apply phase', 'fresh resume phase'])('%s fails closed for the continuation attack matrix before protected writes', () => {
    for (const [label, pages] of attacks) {
      const trace = exerciseOptionEAclExecutablePagination(site, collection, pages);
      expect({ label, accepted: trace.accepted, protectedWrites: trace.postPaginationProtectedWrites })
        .toEqual({ label, accepted: false, protectedWrites: 0 });
    }
    const unexhausted = Array.from({ length: 101 }, (_value, index): IOptionEAclExecutablePage => ({
      value: [],
      ...(index < 100 ? { '@odata.nextLink': `${collection}?$skiptoken=page-${index + 1}` } : {})
    }));
    expect(exerciseOptionEAclExecutablePagination(site, collection, unexhausted))
      .toMatchObject({ accepted: false, reason: 'PageLimitNotExhausted', postPaginationProtectedWrites: 0 });
  });

  it.each([
    ['ACL_APPLY', 'absolute -> relative', safeAbsolute, safe],
    ['ACL_APPLY', 'relative -> absolute', safe, safeAbsolute],
    ['FRESH_RESUME', 'absolute -> relative', safeAbsolute, safe],
    ['FRESH_RESUME', 'relative -> absolute', safe, safeAbsolute]
  ])('%s rejects %s canonical-alias replay before the repeated follow and protected writes',
    (_phase, _order, first, replay) => {
      const trace = exerciseOptionEAclExecutablePagination(site, collection, [
        { value: [{ id: 1 }], '@odata.nextLink': first },
        { value: [{ id: 2 }], '@odata.nextLink': replay },
        { value: [{ id: 3 }] }
      ]);
      expect(trace).toMatchObject({
        accepted: false,
        reason: 'UnsafeContinuation',
        pageReads: 2,
        followedContinuations: [safe],
        postPaginationProtectedWrites: 0
      });
    });

  it('rejects partial/unsafe ACL guards and wrong target-specific assignment tuples', () => {
    for (const name of [
      'ACL_Apply_Complete_Assignment_Sets_Are_Exact', 'Fresh_ACL_Complete_Assignment_Sets_Are_Exact'
    ]) {
      const definition = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
      (findActionRecord(definition, name).action as { expression: unknown }).expression = { equals: [true, true] };
      expect(errorsFor(definition)).toContain(`CompleteAclAssignmentGuardInvalid:${name}`);
    }
    const crossedTarget = replaceEvery(
      parsed('Definitions/option-e-submit.disabled.definition.json'),
      "variables('DraftItemUri'),'/RoleAssignments",
      "variables('ProtectedControlItemUri'),'/RoleAssignments"
    );
    expect(errorsFor(crossedTarget)).toContain('AclExplicitPaginationInvalid:Read_Draft_Native_ACL_Assignments_After_Apply');

    const wrongRole = replaceEvery(
      parsed('Definitions/option-e-submit.disabled.definition.json'),
      'KCF KPI Option E Mutator No Delete v1', 'KCF KPI Option E Item Reader v1'
    );
    expect(errorsFor(wrongRole)).toContain('ExpectedAclSetInvalid:Expected_Draft_Complete_Assignment_Tuples');
  });

  it('rejects Snapshot reconstruction, write retries, PUT/DELETE and bound material', () => {
    const draftSnapshot = replaceEvery(
      parsed('Definitions/option-e-submit.disabled.definition.json'),
      "@body('Read_Request_A')?['PayloadJSON']", "@first(body('Read_Authoritative_Draft_A')?['value'])?['DraftPayloadJSON']"
    );
    expect(errorsFor(draftSnapshot)).toContain('SnapshotNotSourcedFromRequestA');

    for (const attack of ['retry', 'PUT', 'DELETE']) {
      const definition = clone(parsed('Definitions/option-e-submit.disabled.definition.json'));
      const action = findActionRecord(definition, 'Create_Unique_Operation').action;
      const inputs = action.inputs as Record<string, unknown>;
      if (attack === 'retry') inputs.retryPolicy = { type: 'exponential' };
      else (inputs.parameters as Record<string, unknown>)['parameters/method'] = attack;
      expect(errorsFor(definition)).not.toEqual([]);
    }
  });

  it('keeps package ZIP inventory safe and byte-identical to PackageSource', async () => {
    const zipBytes = readFileSync(join(root, 'Package', OPTION_E_SUBMIT_SOLUTION.packageName));
    const archive = await JSZip.loadAsync(zipBytes);
    const names = Object.keys(archive.files).filter(name => !archive.files[name].dir).sort();
    const expected = [
      '[Content_Types].xml', 'Other/Customizations.xml', 'Other/Solution.xml',
      `Workflows/${workflowStem}.json`, `Workflows/${workflowStem}.json.data.xml`
    ].sort();
    expect(names).toEqual(expected);
    for (const name of names) {
      expect(name.startsWith('/') || name.includes('..') || /^[A-Za-z]:/.test(name)).toBe(false);
      expect(await archive.file(name)!.async('nodebuffer')).toEqual(readFileSync(join(root, 'PackageSource', ...name.split('/'))));
    }
  }, 30_000);

  it('records exact generated artefact hashes and excludes only the self-referential manifest hash', () => {
    const manifest = parsed('option-e-submit-manifest.json') as {
      generatedFiles: Array<{ file: string; bytes: number; sha256: string }>;
    };
    expect(manifest.generatedFiles).toHaveLength(8);
    manifest.generatedFiles.forEach(record => {
      const bytes = readFileSync(join(root, ...record.file.split('/')));
      expect(record.bytes).toBe(bytes.length);
      expect(record.sha256).toBe(sha(bytes));
    });
  });

  it('contains no bound tenant/list/principal/role identity, activation, secret or non-schema absolute URL', () => {
    const files = packageFiles();
    const all = JSON.stringify(files);
    expect(all).not.toMatch(/KCFKPI_ApprovedWorkplanReferences|KCFKPI_SubmitAclNegativePrincipals/);
    expect(all).not.toMatch(/coreMethodId|coreRoleId|behaviourId|promptId/);
    expect(all).not.toMatch(/(?:client_secret|access_token|refresh_token|password)\s*["':=]+\s*(?!null)/i);
    expect(all).not.toMatch(/https:\/\/(?!schema\.management\.azure\.com\b)[^"\s]+/i);
    expect(validateOptionESubmitPackage(files)).toEqual([]);
  });
});
