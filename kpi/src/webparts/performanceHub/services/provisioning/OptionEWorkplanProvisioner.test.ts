import { OPTION_E_WORKPLAN_SCHEMA } from '../OptionEWorkplanPhysicalSchema';
import {
  OptionEProvisioningPreflightError,
  buildOptionEWorkplanProvisioningPlan,
  optionEExpectedReadback,
  optionEProvisioningMutationCount,
  isOptionEWorkplanNativeSaveSchemaConverged,
  preflightOptionEWorkplanSchema,
  projectOptionEProvisioningResult,
  type IOptionEFieldReadback,
  type IOptionEListReadback
} from './OptionEWorkplanProvisioner';

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const legacyField = (internalName: string, type = 'Text'): IOptionEFieldReadback => ({
  internalName, type, required: false, indexed: false, enforceUniqueValues: false,
  decimalPlaces: type === 'Number' ? 0 : undefined, choices: type === 'Choice' ? ['Legacy'] : undefined
});

const knownBase = (): IOptionEListReadback[] => OPTION_E_WORKPLAN_SCHEMA
  .filter(definition => definition.existingAsset)
  .map(definition => {
    const expected = optionEExpectedReadback(definition);
    const legacyActions = new Set(['Reuse', 'ReuseOrAddIndex', 'ReuseOrAddChoices']);
    const fields: IOptionEFieldReadback[] = expected.fields.filter(field => {
      const contract = definition.fields.find(item => item.internalName === field.internalName);
      return contract && legacyActions.has(contract.action);
    }).map(field => ({ ...field, id: undefined, choices: field.choices?.slice() }));
    if (definition.title === 'KCFKPI_Workplans') {
      const transition = fields.find(field => field.internalName === 'TransitionStatus');
      if (transition) transition.choices = ['LegacyProcessing'];
      fields.push(
        legacyField('EmployeeDisplayName'), legacyField('EmployeeEmail'),
        legacyField('ManagerDisplayName'), legacyField('ManagerEmail'), legacyField('AccessState', 'Choice'),
        legacyField('TransitionCorrelationKey'), legacyField('CoreCategoryWeight', 'Number'),
        legacyField('PersonalCategoryWeight', 'Number'), legacyField('BehaviourCategoryWeight', 'Number'),
        legacyField('CategoryWeightingReason', 'Note'), legacyField('CoreWeightingMode'),
        legacyField('WorkplanVersion'), legacyField('SubmittedAt', 'DateTime'),
        legacyField('SubmittedByEmail'), legacyField('ManagerDecisionComment', 'Note'),
        legacyField('ApprovedAt', 'DateTime'), legacyField('ApprovedByEmail'),
        legacyField('LockedAt', 'DateTime'), legacyField('LockedByEmail')
      );
    }
    if (definition.title === 'KCFKPI_Audit') {
      const eventType = fields.find(field => field.internalName === 'EventType');
      if (eventType) eventType.indexed = false;
      const quarter = fields.find(field => field.internalName === 'Quarter');
      if (quarter) {
        quarter.type = 'Choice';
        quarter.maxLength = undefined;
        quarter.choices = ['Q1', 'Q2', 'Q3', 'Q4'];
      }
      const reason = fields.find(field => field.internalName === 'Reason');
      if (reason) {
        reason.type = 'Text';
        reason.maxLength = 255;
      }
    }
    if (definition.title === 'KCFKPI_People') {
      const managerEmail = fields.find(field => field.internalName === 'ManagerEmail');
      if (managerEmail) managerEmail.indexed = false;
      fields.push(
        legacyField('Title'), legacyField('Team'), legacyField('JobRole'), legacyField('AppRoles'),
        legacyField('BehaviourFrameworkVersionV2'), legacyField('BehaviourRoleTierV2'),
        legacyField('BehaviourCadenceV2')
      );
    }
    return { ...expected, fields, opaqueLegacyFingerprint: `${definition.title}|legacy-unchanged` };
  });

const twin = (readback: readonly IOptionEListReadback[]): IOptionEListReadback[] =>
  readback.map(item => clone(item));

describe('B13-03 corrected Option-E additive convergence', () => {
  it('plans only declared additions, indexes and choices from the known base', () => {
    const before = knownBase();
    const plan = buildOptionEWorkplanProvisioningPlan(before, twin(before));
    expect(plan.preflight).toEqual(expect.objectContaining({
      ready: true, canonicalReadbacksEqual: true,
      missingCreateableStores: [
        'KCFKPI_WorkplanDrafts', 'KCFKPI_WorkplanSubmitRequests',
        'KCFKPI_WorkplanSubmittedSnapshots', 'KCFKPI_WorkplanSubmitOperations'
      ]
    }));
    expect(new Set(plan.preflight.plannedMutations.map(item => item.operation))).toEqual(
      new Set(['CreateList', 'CreateField', 'AddIndex', 'AddChoice'])
    );
    expect(plan.preflight.plannedMutations.filter(item => item.operation === 'AddChoice').map(item => item.target)).toEqual([
      'KCFKPI_Workplans.TransitionStatus.Ready', 'KCFKPI_Workplans.TransitionStatus.Submitting',
      'KCFKPI_Workplans.TransitionStatus.AclPending', 'KCFKPI_Workplans.TransitionStatus.RecoveryHold'
    ]);
    expect(plan.preflight.plannedMutations.filter(item => item.operation === 'AddIndex').map(item => item.target)).toEqual([
      'KCFKPI_Audit.EventType', 'KCFKPI_People.ManagerEmail'
    ]);
    expect(plan.steps.map(step => step.operation)).toEqual(expect.arrayContaining([
      'BackfillOptionERowsExactETag', 'ReadBackOptionERows', 'EnableOptionERoute'
    ]));
    expect(plan.applyAuthorised).toBe(false);
  });

  it('projects convergence, preserves unrelated legacy state, and repeats with zero mutations', () => {
    const before = knownBase();
    const first = buildOptionEWorkplanProvisioningPlan(before, twin(before));
    const after = projectOptionEProvisioningResult(before, first);
    const workplansBefore = before.find(item => item.title === 'KCFKPI_Workplans');
    const workplansAfter = after.find(item => item.title === 'KCFKPI_Workplans');
    expect(workplansAfter?.opaqueLegacyFingerprint).toBe(workplansBefore?.opaqueLegacyFingerprint);
    const contractNames = new Set(OPTION_E_WORKPLAN_SCHEMA.find(item => item.title === 'KCFKPI_Workplans')
      ?.fields.map(field => field.internalName));
    expect(workplansAfter?.fields.filter(field => !contractNames.has(field.internalName))).toEqual(
      workplansBefore?.fields.filter(field => !contractNames.has(field.internalName))
    );
    const repeat = buildOptionEWorkplanProvisioningPlan(after, twin(after));
    expect(repeat.preflight).toEqual(expect.objectContaining({ ready: true, mismatches: [], plannedMutations: [] }));
    expect(optionEProvisioningMutationCount(repeat)).toBe(0);
  });

  it('does not confuse migration-plan readiness with a native Save-ready schema', () => {
    const before = knownBase();
    const plan = buildOptionEWorkplanProvisioningPlan(before, twin(before));
    expect(plan.preflight.ready).toBe(true);
    expect(plan.preflight.plannedMutations.length).toBeGreaterThan(0);
    expect(isOptionEWorkplanNativeSaveSchemaConverged(plan.preflight)).toBe(false);

    const after = projectOptionEProvisioningResult(before, plan);
    const converged = preflightOptionEWorkplanSchema(after, twin(after));
    expect(converged.plannedMutations).toEqual([]);
    expect(isOptionEWorkplanNativeSaveSchemaConverged(converged)).toBe(true);

    const inherited = twin(after);
    const workplans = inherited.find(item => item.title === 'KCFKPI_Workplans');
    if (!workplans) throw new Error('Workplans fixture missing.');
    workplans.rootHasUniqueRoleAssignments = false;
    const insecure = preflightOptionEWorkplanSchema(inherited, twin(inherited));
    expect(insecure.ready).toBe(false);
    expect(isOptionEWorkplanNativeSaveSchemaConverged(insecure)).toBe(false);
  });

  it('stops with zero planned mutations on TOCTOU change', () => {
    const first = knownBase();
    const second = twin(first);
    const workplans = second.find(item => item.title === 'KCFKPI_Workplans');
    if (workplans) workplans.opaqueLegacyFingerprint = 'changed-between-readbacks';
    const evidence = preflightOptionEWorkplanSchema(first, second);
    expect(evidence.ready).toBe(false);
    expect(evidence.canonicalReadbacksEqual).toBe(false);
    expect(evidence.plannedMutations).toEqual([]);
    expect(evidence.remediation).toEqual(expect.arrayContaining([expect.stringContaining('TOCTOU')]));
  });

  it('stops wrong type, fixed-ID collision, duplicate field and duplicate key cases', () => {
    const cases = [
      (readback: IOptionEListReadback[]) => {
        const people = readback.find(item => item.title === 'KCFKPI_People');
        const email = people?.fields.find(field => field.internalName === 'Email');
        if (email) email.type = 'Note';
      },
      (readback: IOptionEListReadback[]) => {
        const complete = projectOptionEProvisioningResult(readback,
          buildOptionEWorkplanProvisioningPlan(readback, twin(readback)));
        readback.splice(0, readback.length, ...clone(complete));
        const workplans = readback.find(item => item.title === 'KCFKPI_Workplans');
        const draftId = workplans?.fields.find(field => field.internalName === 'DraftItemId');
        if (draftId) draftId.id = '7cd2b366-aa4d-4d2c-a046-a5ca92624918';
      },
      (readback: IOptionEListReadback[]) => {
        const people = readback.find(item => item.title === 'KCFKPI_People');
        if (people) people.fields = [...people.fields, { ...people.fields[0] }];
      },
      (readback: IOptionEListReadback[]) => {
        const people = readback.find(item => item.title === 'KCFKPI_People');
        const email = people?.fields.find(field => field.internalName === 'Email');
        if (email) {
          email.enforceUniqueValues = false;
          email.nonBlankDuplicateCount = 2;
        }
      }
    ];
    cases.forEach(mutate => {
      const readback = knownBase();
      mutate(readback);
      const evidence = preflightOptionEWorkplanSchema(readback, twin(readback));
      expect(evidence.ready).toBe(false);
      expect(evidence.plannedMutations).toEqual([]);
    });
  });

  it('stops missing governed stores and every unsafe migration condition', () => {
    const cases: Array<(readback: IOptionEListReadback[]) => void> = [
      readback => { readback.splice(readback.findIndex(item => item.title === 'KCFKPI_People'), 1); },
      readback => { const item = readback.find(value => value.title === 'KCFKPI_Workplans'); if (item) item.enableFolderCreation = false; },
      readback => { const item = readback.find(value => value.title === 'KCFKPI_Workplans'); if (item) item.lifecycleIssues = ['legacy lifecycle mismatch']; },
      readback => { const item = readback.find(value => value.title === 'KCFKPI_Audit'); if (item) item.broadRootPrincipals = ['KCF Members']; },
      readback => { const item = readback.find(value => value.title === 'KCFKPI_Audit'); if (item) item.recoveryRoutePresent = false; },
      readback => { const item = readback.find(value => value.title === 'KCFKPI_People'); if (item) item.authorityMappingIssues = ['crossed manager pair']; }
    ];
    cases.forEach(mutate => {
      const readback = knownBase();
      mutate(readback);
      expect(() => buildOptionEWorkplanProvisioningPlan(readback, twin(readback)))
        .toThrow(OptionEProvisioningPreflightError);
      expect(preflightOptionEWorkplanSchema(readback, twin(readback)).plannedMutations).toEqual([]);
    });
  });

  it('repairs indexed-but-not-unique People.Email, reads back exact uniqueness, then repeats with zero mutations', () => {
    const before = knownBase();
    const people = before.find(item => item.title === 'KCFKPI_People');
    const email = people?.fields.find(field => field.internalName === 'Email');
    if (!email) throw new Error('Known-base People.Email fixture is missing.');
    email.indexed = true;
    email.enforceUniqueValues = false;
    email.nonBlankDuplicateCount = 0;
    const plan = buildOptionEWorkplanProvisioningPlan(before, twin(before));
    expect(plan.preflight.ready).toBe(true);
    expect(plan.preflight.plannedMutations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'EnforceUniqueValues', target: 'KCFKPI_People.Email',
        expectedReadback: expect.stringContaining('EnforceUniqueValues=true')
      })
    ]));
    const after = projectOptionEProvisioningResult(before, plan);
    expect(after.find(item => item.title === 'KCFKPI_People')?.fields
      .find(field => field.internalName === 'Email')).toEqual(expect.objectContaining({
      indexed: true, enforceUniqueValues: true
    }));
    expect(optionEProvisioningMutationCount(buildOptionEWorkplanProvisioningPlan(after, twin(after)))).toBe(0);
  });

  it('repairs indexed-but-not-unique Workplans.DraftItemId and does not let projection mask a missing mutation', () => {
    const base = knownBase();
    const converged = projectOptionEProvisioningResult(base,
      buildOptionEWorkplanProvisioningPlan(base, twin(base)));
    const before = clone(converged) as IOptionEListReadback[];
    const draftItemId = before.find(item => item.title === 'KCFKPI_Workplans')?.fields
      .find(field => field.internalName === 'DraftItemId');
    if (!draftItemId) throw new Error('Converged Workplans.DraftItemId fixture is missing.');
    draftItemId.indexed = true;
    draftItemId.enforceUniqueValues = false;
    draftItemId.nonBlankDuplicateCount = 0;
    const plan = buildOptionEWorkplanProvisioningPlan(before, twin(before));
    expect(plan.preflight.plannedMutations).toEqual(expect.arrayContaining([
      expect.objectContaining({ operation: 'EnforceUniqueValues', target: 'KCFKPI_Workplans.DraftItemId' })
    ]));
    const withoutExecutableMutation = {
      ...plan,
      preflight: {
        ...plan.preflight,
        plannedMutations: plan.preflight.plannedMutations.filter(item => item.operation !== 'EnforceUniqueValues')
      }
    };
    expect(projectOptionEProvisioningResult(before, withoutExecutableMutation)
      .find(item => item.title === 'KCFKPI_Workplans')?.fields
      .find(field => field.internalName === 'DraftItemId')?.enforceUniqueValues).toBe(false);
    const after = projectOptionEProvisioningResult(before, plan);
    expect(after.find(item => item.title === 'KCFKPI_Workplans')?.fields
      .find(field => field.internalName === 'DraftItemId')?.enforceUniqueValues).toBe(true);
    expect(optionEProvisioningMutationCount(buildOptionEWorkplanProvisioningPlan(after, twin(after)))).toBe(0);
  });

  it('requires explicit duplicate-free proof before emitting a uniqueness mutation', () => {
    const before = knownBase();
    const email = before.find(item => item.title === 'KCFKPI_People')?.fields
      .find(field => field.internalName === 'Email');
    if (!email) throw new Error('Known-base People.Email fixture is missing.');
    email.enforceUniqueValues = false;
    email.nonBlankDuplicateCount = undefined;
    const evidence = preflightOptionEWorkplanSchema(before, twin(before));
    expect(evidence.ready).toBe(false);
    expect(evidence.plannedMutations).toEqual([]);
    expect(evidence.remediation).toEqual(expect.arrayContaining([
      expect.stringContaining('explicit non-blank duplicate count readback')
    ]));
  });

  it('keeps rollback non-destructive', () => {
    const before = knownBase();
    const plan = buildOptionEWorkplanProvisioningPlan(before, twin(before));
    expect(plan.rollback.every(step => !step.deletesListOrField && !step.deletesItemFileAuditOrSnapshot)).toBe(true);
  });
});
