import type {
  IStrategyCarryForwardItem,
  IStrategyCycleCommand,
  IStrategyCycleState,
  IStrategyOutcomeInput,
  IYearLifecycleActor,
  StrategyCycleEntityType,
  StrategyCycleOperation
} from './YearLifecycleModels';
import { sha256Hex } from './YearLifecycleImportEngine';
import {
  applyStrategyCyclePlan,
  createEmptyStrategyCycleState,
  hasStrategyCyclePermission,
  planCreateStrategyCycle,
  planCreateStrategyOutcome,
  planRetireStrategyOutcome,
  planStrategyCarryForward,
  planUpdateStrategyOutcome,
  readStrategyCycle,
  readStrategyCycleVersion,
  readStrategyOutcomeVersion,
  rollbackStrategyCycle,
  STRATEGY_CYCLE_PERMISSION_MATRIX,
  strategyCycleStateSha256
} from './StrategyCycleEngine';

const admin: Readonly<IYearLifecycleActor> = Object.freeze({
  actorId: 'synthetic-lifecycle-admin',
  actorEmail: 'lifecycle.admin@example.invalid',
  role: 'LifecycleAdministrator',
  active: true
});

const command = (
  operation: StrategyCycleOperation,
  expectedCycleVersion: number,
  sequence: number,
  overrides: Partial<IStrategyCycleCommand> = {}
): Readonly<IStrategyCycleCommand> => Object.freeze({
  commandId: `SYNTH-STRATEGY-${operation}-${sequence}`,
  idempotencyKey: `SYNTH-STRATEGY-IDEMPOTENCY-${operation}-${sequence}`,
  operation,
  cycleId: 'STRATEGY-CYCLE-2029',
  performanceYear: 2029,
  expectedCycleVersion,
  actor: admin,
  occurredAt: new Date(Date.UTC(2026, 8, 22, 10, sequence)).toISOString(),
  reason: `Synthetic governed ${operation} operation.`,
  source: Object.freeze({
    sourceId: `SYNTH-SOURCE-${operation}`,
    sourceVersion: `SYNTH-SOURCE-V${sequence}`,
    sourceSha256: sha256Hex(`synthetic-source-${operation}-${sequence}`),
    approvalReference: `SYNTH-APPROVAL-${operation}-${sequence}`,
    approved: true
  }),
  ...overrides
});

const outcome = (title = 'Trusted services', description = 'Synthetic 2029 strategy outcome.'): IStrategyOutcomeInput => ({
  outcomeId: 'OUTCOME-2029-001',
  title,
  description,
  effectiveCycle: 2029,
  effectivePeriod: '2029-01-01/2029-12-31'
});

const carryItem = (
  entityType: StrategyCycleEntityType,
  sequence: number,
  overrides: Partial<IStrategyCarryForwardItem> = {}
): IStrategyCarryForwardItem => ({
  entityType,
  sourceStableId: `SOURCE-${entityType.toUpperCase()}-${sequence}`,
  targetStableId: `TARGET-${entityType.toUpperCase()}-${sequence}`,
  sourceVersion: `APPROVED-2028-V${sequence}`,
  sourceSha256: sha256Hex(`source-${entityType}-${sequence}`),
  approvalStatus: 'Approved',
  lifecycleStatus: 'Active',
  obsolete: false,
  sourceClassification: entityType === 'Mapping' ? 'NotApplicable' : 'Core',
  targetClassification: entityType === 'Mapping' ? 'NotApplicable' : 'Core',
  ...(entityType === 'Mapping' ? { outcomeId: 'OUTCOME-2029-001', outcomeVersion: 1 } : {}),
  ...overrides
});

type Applied = Extract<ReturnType<typeof applyStrategyCyclePlan>, { status: 'Applied' }>;

const mustApply = (
  planned: ReturnType<typeof planCreateStrategyCycle>,
  state: Readonly<IStrategyCycleState>
): Applied => {
  expect(planned.status).toBe('Planned');
  if (planned.status !== 'Planned') throw new Error('Synthetic strategy plan was rejected.');
  const applied = applyStrategyCyclePlan(planned.plan, state);
  expect(applied.status).toBe('Applied');
  if (applied.status !== 'Applied') throw new Error('Synthetic strategy apply was rejected.');
  return applied;
};

const createCycle = (sequence = 1): Applied => {
  const state = createEmptyStrategyCycleState();
  return mustApply(planCreateStrategyCycle(command('CreateCycle', 0, sequence), state), state);
};

const createOutcome = (state: Readonly<IStrategyCycleState>, sequence = 2): Applied => {
  const version = readStrategyCycle(state, 'STRATEGY-CYCLE-2029')?.currentVersion || 0;
  return mustApply(planCreateStrategyOutcome(command('CreateOutcome', version, sequence), state, outcome()), state);
};

describe('BT-05 governed 2029 strategy cycle', () => {
  it('creates and versions the 2029 cycle and Strategic Outcome master data without rewriting history', () => {
    const cycle = createCycle();
    const created = createOutcome(cycle.state);
    const createdVersionJson = JSON.stringify(readStrategyOutcomeVersion(
      created.state, 'STRATEGY-CYCLE-2029', 'OUTCOME-2029-001', 1
    ));
    const updatePlan = planUpdateStrategyOutcome(
      command('UpdateOutcome', 2, 3),
      created.state,
      outcome('Trusted public services', 'Updated synthetic 2029 outcome description.')
    );
    const updated = mustApply(updatePlan, created.state);
    const retirePlan = planRetireStrategyOutcome(
      command('RetireOutcome', 3, 4), updated.state, 'OUTCOME-2029-001'
    );
    const retired = mustApply(retirePlan, updated.state);
    const history = readStrategyCycle(retired.state, 'STRATEGY-CYCLE-2029');
    const outcomeHistory = history?.versions[3].outcomes[0];

    expect(history).toMatchObject({ performanceYear: 2029, currentVersion: 4 });
    expect(history?.versions.map(version => version.operation)).toEqual([
      'CreateCycle', 'CreateOutcome', 'UpdateOutcome', 'RetireOutcome'
    ]);
    expect(outcomeHistory?.versions.map(version => [version.outcomeVersion, version.status])).toEqual([
      [1, 'Active'], [2, 'Active'], [3, 'Retired']
    ]);
    expect(JSON.stringify(readStrategyOutcomeVersion(
      retired.state, 'STRATEGY-CYCLE-2029', 'OUTCOME-2029-001', 1
    ))).toBe(createdVersionJson);
    expect(outcomeHistory?.versions[1].beforeSha256).toBe(outcomeHistory?.versions[0].afterSha256);
    expect(outcomeHistory?.versions[2].beforeSha256).toBe(outcomeHistory?.versions[1].afterSha256);
    expect(retired.receipt).toMatchObject({
      operation: 'RetireOutcome', actorId: admin.actorId, beforeCycleVersion: 3, afterCycleVersion: 4
    });
    expect(retired.receipt.afterStateSha256).toBe(strategyCycleStateSha256(retired.state));
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(outcomeHistory?.versions)).toBe(true);
  });

  it('selectively carries approved hierarchy, KPI, target and mapping records and preserves mapping version', () => {
    const created = createOutcome(createCycle().state);
    const selection = {
      selectionMode: 'Explicit' as const,
      items: [
        carryItem('Hierarchy', 1),
        carryItem('KPI', 2),
        carryItem('Target', 3),
        carryItem('Mapping', 4)
      ]
    };
    const carried = mustApply(planStrategyCarryForward(
      command('CarryForward', 2, 3), created.state, selection
    ), created.state);
    const carriedJson = JSON.stringify(readStrategyCycleVersion(carried.state, 'STRATEGY-CYCLE-2029', 3)?.carriedRecords);
    const updated = mustApply(planUpdateStrategyOutcome(
      command('UpdateOutcome', 3, 4), carried.state, outcome('Updated outcome', 'Still synthetic.')
    ), carried.state);
    const retired = mustApply(planRetireStrategyOutcome(
      command('RetireOutcome', 4, 5), updated.state, 'OUTCOME-2029-001'
    ), updated.state);
    const records = readStrategyCycle(retired.state, 'STRATEGY-CYCLE-2029')?.versions[4].carriedRecords;

    expect(records?.map(record => record.entityType).sort()).toEqual(['Hierarchy', 'KPI', 'Mapping', 'Target']);
    expect(records?.find(record => record.entityType === 'Mapping')).toMatchObject({
      outcomeId: 'OUTCOME-2029-001', outcomeVersion: 1
    });
    expect(JSON.stringify(readStrategyCycleVersion(
      retired.state, 'STRATEGY-CYCLE-2029', 3
    )?.carriedRecords)).toBe(carriedJson);
    expect(records?.every(record => record.classification !== 'Impact')).toBe(true);
  });

  it('rejects automatic, obsolete, retired, unapproved and classification-converting carry-forward', () => {
    const state = createOutcome(createCycle().state).state;
    expect(planStrategyCarryForward(command('CarryForward', 2, 3), state, {
      selectionMode: 'Automatic', items: [carryItem('KPI', 1)]
    })).toMatchObject({ status: 'Rejected', exception: { code: 'AutomaticCarryForwardForbidden' } });
    expect(planStrategyCarryForward(command('CarryForward', 2, 4), state, {
      selectionMode: 'Explicit', items: [carryItem('KPI', 2, { obsolete: true as false })]
    })).toMatchObject({ status: 'Rejected', exception: { code: 'ObsoleteContent' } });
    expect(planStrategyCarryForward(command('CarryForward', 2, 5), state, {
      selectionMode: 'Explicit', items: [carryItem('KPI', 3, { lifecycleStatus: 'Retired' as 'Active' })]
    })).toMatchObject({ status: 'Rejected', exception: { code: 'ObsoleteContent' } });
    expect(planStrategyCarryForward(command('CarryForward', 2, 6), state, {
      selectionMode: 'Explicit', items: [carryItem('KPI', 4, { approvalStatus: 'Draft' as 'Approved' })]
    })).toMatchObject({ status: 'Rejected', exception: { code: 'UnapprovedContent' } });
    expect(planStrategyCarryForward(command('CarryForward', 2, 7), state, {
      selectionMode: 'Explicit', items: [carryItem('KPI', 5, {
        sourceClassification: 'Impact', targetClassification: 'Core'
      })]
    })).toMatchObject({ status: 'Rejected', exception: { code: 'ClassificationConversionForbidden' } });
  });

  it('enforces the synthetic LifecycleAdministrator permission matrix and exact 2029/source authority', () => {
    const operations: readonly StrategyCycleOperation[] = [
      'CreateCycle', 'CreateOutcome', 'UpdateOutcome', 'RetireOutcome', 'CarryForward'
    ];
    expect(Object.isFrozen(STRATEGY_CYCLE_PERMISSION_MATRIX)).toBe(true);
    operations.forEach(operation => {
      expect(STRATEGY_CYCLE_PERMISSION_MATRIX[operation]).toEqual(['LifecycleAdministrator']);
      expect(hasStrategyCyclePermission(admin, operation)).toBe(true);
    });
    const state = createEmptyStrategyCycleState();
    const unauthorised = command('CreateCycle', 0, 1, {
      actor: { ...admin, role: 'Reader' as 'LifecycleAdministrator' }
    });
    expect(planCreateStrategyCycle(unauthorised, state)).toMatchObject({
      status: 'Rejected', exception: { code: 'Unauthorised' }
    });
    expect(planCreateStrategyCycle({ ...command('CreateCycle', 0, 2), performanceYear: 2028 }, state))
      .toMatchObject({ status: 'Rejected', exception: { code: 'WrongCycle' } });
    expect(planCreateStrategyCycle({
      ...command('CreateCycle', 0, 3),
      source: { ...command('CreateCycle', 0, 3).source, approved: false }
    }, state)).toMatchObject({ status: 'Rejected', exception: { code: 'UnapprovedContent' } });
    expect(planCreateStrategyCycle({
      ...command('CreateCycle', 0, 4),
      source: { ...command('CreateCycle', 0, 4).source, sourceSha256: 'BAD' }
    }, state)).toMatchObject({ status: 'Rejected', exception: { code: 'HashMismatch' } });
  });

  it('binds exact source version/hash to attributable receipt and rejects stale cycle/version operations', () => {
    const applied = createCycle();
    expect(applied.receipt).toMatchObject({
      sourceId: 'SYNTH-SOURCE-CreateCycle',
      sourceVersion: 'SYNTH-SOURCE-V1',
      sourceSha256: sha256Hex('synthetic-source-CreateCycle-1'),
      actorId: admin.actorId,
      actorEmail: admin.actorEmail,
      reason: 'Synthetic governed CreateCycle operation.'
    });
    expect(planCreateStrategyOutcome(command('CreateOutcome', 0, 2), applied.state, outcome()))
      .toMatchObject({ status: 'Rejected', exception: { code: 'HistoryConflict' } });
    expect(planCreateStrategyOutcome({
      ...command('CreateOutcome', 1, 3), cycleId: 'WRONG-CYCLE-2029'
    }, applied.state, outcome())).toMatchObject({ status: 'Rejected', exception: { code: 'HistoryConflict' } });
  });

  it('provides idempotence and rejects duplicate, conflicting, replayed, stale and forged plans', () => {
    const initial = createEmptyStrategyCycleState();
    const createCommand = command('CreateCycle', 0, 1);
    const planned = planCreateStrategyCycle(createCommand, initial);
    expect(planned.status).toBe('Planned');
    if (planned.status !== 'Planned') throw new Error('Synthetic create plan missing.');
    const applied = applyStrategyCyclePlan(planned.plan, initial);
    expect(applied.status).toBe('Applied');
    if (applied.status !== 'Applied') throw new Error('Synthetic create apply missing.');
    expect(planCreateStrategyCycle(createCommand, applied.state)).toMatchObject({
      status: 'Idempotent', receipt: { receiptId: applied.receipt.receiptId }
    });
    expect(planCreateStrategyCycle({
      ...createCommand, commandId: 'DIFFERENT-COMMAND'
    }, applied.state)).toMatchObject({ status: 'Rejected', exception: { code: 'IdempotencyConflict' } });
    expect(planCreateStrategyCycle({
      ...createCommand, idempotencyKey: 'DIFFERENT-KEY'
    }, applied.state)).toMatchObject({ status: 'Rejected', exception: { code: 'DuplicateImport' } });
    expect(applyStrategyCyclePlan(planned.plan, initial)).toMatchObject({
      status: 'Rejected', exception: { code: 'TransitionReplay' }
    });
    expect(applyStrategyCyclePlan({ ...planned.plan }, initial)).toMatchObject({
      status: 'Rejected', exception: { code: 'Unauthorised' }
    });

    const outcomePlan = planCreateStrategyOutcome(command('CreateOutcome', 1, 2), applied.state, outcome());
    const alternatePlan = planCreateStrategyOutcome(command('CreateOutcome', 1, 3), applied.state, {
      ...outcome(), outcomeId: 'OUTCOME-2029-002'
    });
    const advanced = mustApply(alternatePlan, applied.state);
    expect(outcomePlan.status).toBe('Planned');
    if (outcomePlan.status !== 'Planned') throw new Error('Synthetic stale plan missing.');
    expect(applyStrategyCyclePlan(outcomePlan.plan, advanced.state)).toMatchObject({
      status: 'Rejected', exception: { code: 'StateConflict' }
    });
  });

  it('rejects duplicate carry identity and mappings without a preserved exact outcome version', () => {
    const state = createOutcome(createCycle().state).state;
    expect(planStrategyCarryForward(command('CarryForward', 2, 3), state, {
      selectionMode: 'Explicit',
      items: [carryItem('KPI', 1), carryItem('KPI', 2, { targetStableId: 'TARGET-KPI-1' })]
    })).toMatchObject({ status: 'Rejected', exception: { code: 'DuplicateRecord' } });
    expect(planStrategyCarryForward(command('CarryForward', 2, 4), state, {
      selectionMode: 'Explicit',
      items: [carryItem('Mapping', 3, { outcomeVersion: 99 })]
    })).toMatchObject({ status: 'Rejected', exception: { code: 'MappingConflict' } });
    expect(planStrategyCarryForward(command('CarryForward', 2, 5), state, {
      selectionMode: 'Explicit',
      items: [carryItem('KPI', 4, { outcomeId: 'OUTCOME-2029-001', outcomeVersion: 1 })]
    })).toMatchObject({ status: 'Rejected', exception: { code: 'MappingConflict' } });
  });

  it('isolates mutable inputs and readback from caller aliasing', () => {
    const cycle = createCycle();
    const mutable = outcome() as { -readonly [K in keyof IStrategyOutcomeInput]: IStrategyOutcomeInput[K] };
    const planned = planCreateStrategyOutcome(command('CreateOutcome', 1, 2), cycle.state, mutable);
    mutable.title = 'Caller mutation after planning';
    const applied = mustApply(planned, cycle.state);
    expect(readStrategyOutcomeVersion(
      applied.state, 'STRATEGY-CYCLE-2029', 'OUTCOME-2029-001', 1
    )?.title).toBe('Trusted services');
    expect(Object.isFrozen(applied.state)).toBe(true);
    expect(Object.isFrozen(applied.state.cycles)).toBe(true);
    expect(Object.isFrozen(applied.state.cycles[0].versions[1].outcomes)).toBe(true);
  });

  it('fails closed for malformed, prototype, accessor and Proxy boundary inputs', () => {
    const state = createEmptyStrategyCycleState();
    expect(planCreateStrategyCycle(null, state)).toMatchObject({
      status: 'Rejected', exception: { code: 'MalformedInput' }
    });
    expect(planCreateStrategyCycle(Object.create(command('CreateCycle', 0, 1)), state)).toMatchObject({
      status: 'Rejected', exception: { code: 'MalformedInput' }
    });
    const accessor = { ...command('CreateCycle', 0, 2) } as Record<string, unknown>;
    Object.defineProperty(accessor, 'reason', { enumerable: true, get: () => 'Unsafe getter' });
    expect(planCreateStrategyCycle(accessor, state)).toMatchObject({
      status: 'Rejected', exception: { code: 'MalformedInput' }
    });
    const proxy = new Proxy(command('CreateCycle', 0, 3), {
      ownKeys: () => { throw new Error('Synthetic hostile proxy'); }
    });
    expect(planCreateStrategyCycle(proxy, state)).toMatchObject({
      status: 'Rejected', exception: { code: 'MalformedInput' }
    });
    const cycle = createCycle();
    const sparse: IStrategyCarryForwardItem[] = [];
    sparse.length = 1;
    expect(planStrategyCarryForward(command('CarryForward', 1, 4), cycle.state, {
      selectionMode: 'Explicit', items: sparse
    })).toMatchObject({ status: 'Rejected', exception: { code: 'MalformedInput' } });
  });

  it('performs exact single-use compensating rollback and rejects stale or forged recovery', () => {
    const cycle = createCycle();
    const beforeJson = JSON.stringify(cycle.state);
    const beforeSha = strategyCycleStateSha256(cycle.state);
    const created = createOutcome(cycle.state);
    expect(rollbackStrategyCycle(created.state, { ...created.recovery }, admin,
      '2026-09-22T12:00:00.000Z', 'Synthetic forged rollback.')).toMatchObject({
      status: 'Rejected', exception: { code: 'Unauthorised' }
    });
    const advanced = mustApply(planCreateStrategyOutcome(
      command('CreateOutcome', 2, 3), created.state, { ...outcome(), outcomeId: 'OUTCOME-2029-002' }
    ), created.state);
    expect(rollbackStrategyCycle(advanced.state, created.recovery, admin,
      '2026-09-22T12:01:00.000Z', 'Synthetic stale rollback.')).toMatchObject({
      status: 'Rejected', exception: { code: 'RollbackConflict' }
    });
    const rolledBack = rollbackStrategyCycle(created.state, created.recovery, admin,
      '2026-09-22T12:02:00.000Z', 'Synthetic exact rollback.');
    expect(rolledBack.status).toBe('RolledBack');
    if (rolledBack.status !== 'RolledBack') throw new Error('Synthetic rollback was rejected.');
    expect(JSON.stringify(rolledBack.state)).toBe(beforeJson);
    expect(strategyCycleStateSha256(rolledBack.state)).toBe(beforeSha);
    expect(rolledBack.receipt).toMatchObject({
      actorId: admin.actorId,
      removedStateSha256: strategyCycleStateSha256(created.state),
      restoredStateSha256: beforeSha
    });
    expect(rollbackStrategyCycle(created.state, created.recovery, admin,
      '2026-09-22T12:03:00.000Z', 'Synthetic replay rollback.')).toMatchObject({
      status: 'Rejected', exception: { code: 'RollbackAlreadyUsed' }
    });
  });

  it('rejects caller-mutated history, source hash and mapping-history rewrite attempts', () => {
    const created = createOutcome(createCycle().state);
    const carried = mustApply(planStrategyCarryForward(
      command('CarryForward', 2, 3), created.state,
      { selectionMode: 'Explicit', items: [carryItem('Mapping', 1)] }
    ), created.state);
    const mutated = JSON.parse(JSON.stringify(carried.state)) as IStrategyCycleState;
    const mutableCycles = mutated.cycles as unknown as Array<{
      versions: Array<{ carriedRecords: Array<{ outcomeVersion: number }> }>;
    }>;
    mutableCycles[0].versions[2].carriedRecords[0].outcomeVersion = 2;
    expect(() => strategyCycleStateSha256(mutated)).toThrow();
    const sourceMutated = JSON.parse(JSON.stringify(carried.state)) as IStrategyCycleState;
    const sourceCycles = sourceMutated.cycles as unknown as Array<{
      versions: Array<{ sourceSha256: string }>;
    }>;
    sourceCycles[0].versions[2].sourceSha256 = sha256Hex('tampered-source');
    expect(() => strategyCycleStateSha256(sourceMutated)).toThrow();
  });
});
