import type {
  IYearCloseBoundarySnapshot,
  IYearCloseExceptionAuthority,
  IYearLifecycleActor,
  IYearLifecycleTransitionCommand,
  IYearLifecycleTransitionState,
  IYearPreCloseValidation,
  YearCloseBoundary,
  YearLifecycleHistoryYear,
  YearLifecycleTransition
} from './YearLifecycleModels';
import { sha256Hex } from './YearLifecycleImportEngine';
import {
  applyYearLifecycleTransition,
  checkOrdinaryYearEdit,
  createEmptyYearLifecycleTransitionState,
  planCloseYear,
  planOpenYear,
  planReopenYear,
  readYearLifecycleHistory,
  readYearLifecycleVersion,
  rollbackYearLifecycleTransition,
  validateYearPreClose,
  yearLifecycleTransitionStateSha256
} from './YearLifecycleTransitionEngine';

const admin: Readonly<IYearLifecycleActor> = Object.freeze({
  actorId: 'synthetic-lifecycle-admin',
  actorEmail: 'lifecycle.admin@example.invalid',
  role: 'LifecycleAdministrator',
  active: true
});

const boundaryOrder: readonly YearCloseBoundary[] = [
  'Core', 'Impact', 'Behaviour', 'Evidence', 'ManagerAction'
];

const boundaries = (
  issues: Partial<Record<YearCloseBoundary, { incomplete?: number; unresolved?: number }>> = {}
): IYearCloseBoundarySnapshot[] => boundaryOrder.map((boundary, index) => ({
  boundary,
  sourceVersion: `${boundary.toUpperCase()}-SYNTH-V1`,
  sourceSha256: sha256Hex(`synthetic-${boundary}-${index}`),
  recordCount: 3,
  incompleteCount: issues[boundary]?.incomplete || 0,
  unresolvedCount: issues[boundary]?.unresolved || 0
}));

const closeException = (
  boundary: YearCloseBoundary,
  issueType: 'Incomplete' | 'Unresolved'
): IYearCloseExceptionAuthority => ({
  issueKey: `${boundary}:${issueType}`,
  boundary,
  issueType,
  reason: `Synthetic controlled ${issueType.toLowerCase()} exception.`,
  approvalReference: `SYNTH-EXCEPTION-${boundary}-${issueType}`,
  approvedBy: 'synthetic.sponsor@example.invalid',
  approvedAt: '2026-09-22T19:00:00.000Z',
  approved: true
});

const command = (
  transition: YearLifecycleTransition,
  year: YearLifecycleHistoryYear,
  configurationVersion: string,
  expectedYearVersion: number,
  sequence: number
): Readonly<IYearLifecycleTransitionCommand> => Object.freeze({
  commandId: `SYNTH-${transition.toUpperCase()}-${year}-${sequence}`,
  idempotencyKey: `SYNTH-IDEMPOTENCY-${transition.toUpperCase()}-${year}-${sequence}`,
  transition,
  performanceYear: year,
  configurationVersion,
  expectedYearVersion,
  actor: admin,
  occurredAt: `2026-09-22T20:${String(sequence).padStart(2, '0')}:00.000Z`,
  reason: `Synthetic governed ${transition.toLowerCase()} transition.`
});

const applyOpen = (
  state: Readonly<IYearLifecycleTransitionState>,
  year: YearLifecycleHistoryYear,
  configurationVersion: string,
  sequence = 1,
  initialBoundaries: ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>> = boundaries()
): Extract<ReturnType<typeof applyYearLifecycleTransition>, { status: 'Applied' }> => {
  const planned = planOpenYear(command('Open', year, configurationVersion, 0, sequence), state, initialBoundaries);
  expect(planned.status).toBe('Planned');
  if (planned.status !== 'Planned') throw new Error('Synthetic open plan was rejected.');
  const applied = applyYearLifecycleTransition(planned.plan, state);
  expect(applied.status).toBe('Applied');
  if (applied.status !== 'Applied') throw new Error('Synthetic open apply was rejected.');
  return applied;
};

const readyPreClose = (
  year: YearLifecycleHistoryYear,
  configurationVersion: string,
  expectedYearVersion: number,
  snapshot: ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>> = boundaries(),
  exceptions: ReadonlyArray<Readonly<IYearCloseExceptionAuthority>> = []
): Readonly<IYearPreCloseValidation> => {
  const validation = validateYearPreClose({
    performanceYear: year,
    configurationVersion,
    expectedYearVersion,
    boundaries: snapshot,
    exceptions
  });
  expect(validation.status === 'Ready' || validation.status === 'ReadyWithExceptions').toBe(true);
  if (validation.status === 'Rejected' || validation.status === 'Blocked') {
    throw new Error('Synthetic pre-close validation was not ready.');
  }
  return validation;
};

const applyClose = (
  state: Readonly<IYearLifecycleTransitionState>,
  year: YearLifecycleHistoryYear,
  configurationVersion: string,
  expectedYearVersion: number,
  sequence = 2,
  validation: Readonly<IYearPreCloseValidation> = readyPreClose(
    year, configurationVersion, expectedYearVersion
  )
): Extract<ReturnType<typeof applyYearLifecycleTransition>, { status: 'Applied' }> => {
  const planned = planCloseYear(
    command('Close', year, configurationVersion, expectedYearVersion, sequence), state, validation
  );
  expect(planned.status).toBe('Planned');
  if (planned.status !== 'Planned') throw new Error('Synthetic close plan was rejected.');
  const applied = applyYearLifecycleTransition(planned.plan, state);
  expect(applied.status).toBe('Applied');
  if (applied.status !== 'Applied') throw new Error('Synthetic close apply was rejected.');
  return applied;
};

describe('BT-05 governed year close/open and history', () => {
  it('opens, closes and reproducibly reads immutable 2027 history', () => {
    const opened = applyOpen(createEmptyYearLifecycleTransitionState(), 2027, 'GOVERNED-2027-V1');
    const version1 = readYearLifecycleVersion(opened.state, 2027, 1);
    const version1Json = JSON.stringify(version1);
    const closed = applyClose(opened.state, 2027, 'GOVERNED-2027-V1', 1);
    const history = readYearLifecycleHistory(closed.state, 2027);
    expect(history).toMatchObject({
      performanceYear: 2027,
      configurationVersion: 'GOVERNED-2027-V1',
      currentVersion: 2
    });
    expect(history?.versions.map(version => [version.yearVersion, version.transition, version.status]))
      .toEqual([[1, 'Open', 'Open'], [2, 'Close', 'Closed']]);
    expect(JSON.stringify(readYearLifecycleVersion(closed.state, 2027, 1))).toBe(version1Json);
    expect(closed.receipt).toMatchObject({
      transition: 'Close', performanceYear: 2027, configurationVersion: 'GOVERNED-2027-V1',
      actorId: admin.actorId, actorEmail: admin.actorEmail, beforeYearVersion: 1, afterYearVersion: 2
    });
    expect(closed.receipt.afterStateSha256).toBe(yearLifecycleTransitionStateSha256(closed.state));
    expect(Object.isFrozen(history)).toBe(true);
    expect(Object.isFrozen(history?.versions)).toBe(true);
    expect(Object.isFrozen(history?.versions[1].boundaries)).toBe(true);
  });

  it('blocks ordinary edits after close and permits only governed reopen', () => {
    const opened = applyOpen(createEmptyYearLifecycleTransitionState(), 2027, 'GOVERNED-2027-V1');
    expect(checkOrdinaryYearEdit(opened.state, 2027, 'GOVERNED-2027-V1', 1)).toMatchObject({
      status: 'Allowed', yearVersion: 1
    });
    const closed = applyClose(opened.state, 2027, 'GOVERNED-2027-V1', 1);
    expect(checkOrdinaryYearEdit(closed.state, 2027, 'GOVERNED-2027-V1', 2)).toMatchObject({
      status: 'Rejected', exception: { code: 'ClosedYearImmutable' }
    });
    const reopenCommand = command('Reopen', 2027, 'GOVERNED-2027-V1', 2, 3);
    const planned = planReopenYear(reopenCommand, closed.state);
    expect(planned.status).toBe('Planned');
    if (planned.status !== 'Planned') throw new Error('Synthetic reopen plan was rejected.');
    const reopened = applyYearLifecycleTransition(planned.plan, closed.state);
    expect(reopened.status).toBe('Applied');
    if (reopened.status !== 'Applied') throw new Error('Synthetic reopen apply was rejected.');
    expect(readYearLifecycleHistory(reopened.state, 2027)?.versions.map(version => version.status))
      .toEqual(['Open', 'Closed', 'Open']);
    expect(checkOrdinaryYearEdit(reopened.state, 2027, 'GOVERNED-2027-V1', 3)).toMatchObject({
      status: 'Allowed', yearVersion: 3
    });
  });

  it('preserves closed 2027 while opening and closing isolated 2028 history', () => {
    const opened2027 = applyOpen(createEmptyYearLifecycleTransitionState(), 2027, 'GOVERNED-2027-V1');
    const closed2027 = applyClose(opened2027.state, 2027, 'GOVERNED-2027-V1', 1);
    const history2027Json = JSON.stringify(readYearLifecycleHistory(closed2027.state, 2027));
    const opened2028 = applyOpen(closed2027.state, 2028, 'GOVERNED-2028-V1', 4);
    const closed2028 = applyClose(opened2028.state, 2028, 'GOVERNED-2028-V1', 1, 5);
    expect(JSON.stringify(readYearLifecycleHistory(closed2028.state, 2027))).toBe(history2027Json);
    expect(readYearLifecycleHistory(closed2028.state, 2028)).toMatchObject({
      performanceYear: 2028, configurationVersion: 'GOVERNED-2028-V1', currentVersion: 2
    });
    expect(readYearLifecycleHistory(closed2028.state, 2027)).not.toBe(
      readYearLifecycleHistory(closed2028.state, 2028)
    );
  });

  it('blocks incomplete or unresolved close until every issue has governed exception authority', () => {
    const snapshot = boundaries({ Core: { incomplete: 1 }, Evidence: { unresolved: 2 } });
    const blocked = validateYearPreClose({
      performanceYear: 2027,
      configurationVersion: 'GOVERNED-2027-V1',
      expectedYearVersion: 1,
      boundaries: snapshot,
      exceptions: [closeException('Core', 'Incomplete')]
    });
    expect(blocked).toMatchObject({
      status: 'Blocked',
      issues: expect.arrayContaining([
        expect.objectContaining({ issueKey: 'Core:Incomplete', count: 1 }),
        expect.objectContaining({ issueKey: 'Evidence:Unresolved', count: 2 })
      ])
    });
    const opened = applyOpen(createEmptyYearLifecycleTransitionState(), 2027, 'GOVERNED-2027-V1');
    expect(planCloseYear(command('Close', 2027, 'GOVERNED-2027-V1', 1, 2), opened.state, blocked))
      .toMatchObject({ status: 'Rejected', exception: { code: 'PreCloseBlocked' } });

    const futureException = {
      ...closeException('Evidence', 'Unresolved'),
      approvedAt: '2026-09-22T20:03:00.000Z'
    };
    const futureApproved = readyPreClose(2027, 'GOVERNED-2027-V1', 1, snapshot, [
      closeException('Core', 'Incomplete'), futureException
    ]);
    expect(planCloseYear(command('Close', 2027, 'GOVERNED-2027-V1', 1, 2), opened.state, futureApproved))
      .toMatchObject({ status: 'Rejected', exception: { code: 'StaleManifest' } });

    const ready = readyPreClose(2027, 'GOVERNED-2027-V1', 1, snapshot, [
      closeException('Core', 'Incomplete'), closeException('Evidence', 'Unresolved')
    ]);
    expect(ready).toMatchObject({
      status: 'ReadyWithExceptions',
      acceptedExceptionKeys: ['Core:Incomplete', 'Evidence:Unresolved']
    });
    const closed = applyClose(opened.state, 2027, 'GOVERNED-2027-V1', 1, 2, ready);
    expect(readYearLifecycleVersion(closed.state, 2027, 2)?.acceptedExceptions).toHaveLength(2);
  });

  it('keeps Core, Impact, Behaviour, Evidence and ManagerAction separate without an outcome', () => {
    const opened = applyOpen(createEmptyYearLifecycleTransitionState(), 2027, 'GOVERNED-2027-V1');
    const closed = applyClose(opened.state, 2027, 'GOVERNED-2027-V1', 1);
    const version = readYearLifecycleVersion(closed.state, 2027, 2)!;
    expect(version.boundaries.map(boundary => boundary.boundary)).toEqual(boundaryOrder);
    expect(version.boundaries.every(boundary => boundary.sourceVersion && boundary.sourceSha256)).toBe(true);
    expect(Object.keys(version)).toEqual([
      'yearVersion', 'status', 'transition', 'configurationVersion', 'actorId', 'actorEmail',
      'occurredAt', 'reason', 'boundarySnapshotSha256', 'boundaries', 'acceptedExceptions', 'versionSha256'
    ]);
  });

  it('rejects unauthorised actor, wrong year, wrong configuration and stale version', () => {
    const empty = createEmptyYearLifecycleTransitionState();
    const unauthorised = planOpenYear({
      ...command('Open', 2027, 'GOVERNED-2027-V1', 0, 1),
      actor: { ...admin, role: 'Employee' }
    }, empty, boundaries());
    expect(unauthorised).toMatchObject({ status: 'Rejected', exception: { code: 'Unauthorised' } });
    expect(planOpenYear({
      ...command('Open', 2027, 'GOVERNED-2027-V1', 0, 1), performanceYear: 2026
    }, empty, boundaries())).toMatchObject({ status: 'Rejected', exception: { code: 'WrongYear' } });

    const opened = applyOpen(empty, 2027, 'GOVERNED-2027-V1');
    const valid = readyPreClose(2027, 'GOVERNED-2027-V1', 1);
    expect(planCloseYear(command('Close', 2027, 'WRONG-CONFIG', 1, 2), opened.state, valid))
      .toMatchObject({ status: 'Rejected', exception: { code: 'HistoryConflict' } });
    expect(planCloseYear(command('Close', 2027, 'GOVERNED-2027-V1', 99, 2), opened.state, valid))
      .toMatchObject({ status: 'Rejected', exception: { code: 'HistoryConflict' } });
    expect(planCloseYear(command('Close', 2027, 'GOVERNED-2027-V1', 1, 0), opened.state, valid))
      .toMatchObject({ status: 'Rejected', exception: { code: 'StaleManifest' } });
  });

  it('uses single-use transition authority and rejects stale or forged plans', () => {
    const empty = createEmptyYearLifecycleTransitionState();
    const openCommand = command('Open', 2027, 'GOVERNED-2027-V1', 0, 1);
    const planned = planOpenYear(openCommand, empty, boundaries());
    expect(planned.status).toBe('Planned');
    if (planned.status !== 'Planned') throw new Error('Synthetic plan was rejected.');
    expect(applyYearLifecycleTransition({ ...planned.plan }, empty)).toMatchObject({
      status: 'Rejected', exception: { code: 'Unauthorised' }
    });
    const applied = applyYearLifecycleTransition(planned.plan, empty);
    expect(applied.status).toBe('Applied');
    expect(applyYearLifecycleTransition(planned.plan, empty)).toMatchObject({
      status: 'Rejected', exception: { code: 'TransitionReplay' }
    });

    const otherOpen = applyOpen(createEmptyYearLifecycleTransitionState(), 2028, 'GOVERNED-2028-V1', 2);
    const stalePlan = planOpenYear(command('Open', 2027, 'GOVERNED-2027-V1', 0, 3), empty, boundaries());
    expect(stalePlan.status).toBe('Planned');
    if (stalePlan.status !== 'Planned') throw new Error('Synthetic stale plan was rejected before state change.');
    expect(applyYearLifecycleTransition(stalePlan.plan, otherOpen.state)).toMatchObject({
      status: 'Rejected', exception: { code: 'StateConflict' }
    });
  });

  it('is idempotent for exact commands and rejects duplicate/conflicting replay', () => {
    const empty = createEmptyYearLifecycleTransitionState();
    const openCommand = command('Open', 2027, 'GOVERNED-2027-V1', 0, 1);
    const opened = applyOpen(empty, 2027, 'GOVERNED-2027-V1');
    expect(planOpenYear(openCommand, opened.state, boundaries())).toMatchObject({
      status: 'Idempotent', receipt: { commandId: openCommand.commandId }
    });
    expect(planOpenYear({ ...openCommand, idempotencyKey: 'SYNTH-DIFFERENT-KEY' }, opened.state, boundaries()))
      .toMatchObject({ status: 'Rejected', exception: { code: 'DuplicateImport' } });
    expect(planOpenYear({
      ...openCommand,
      commandId: 'SYNTH-DIFFERENT-COMMAND',
      performanceYear: 2028,
      configurationVersion: 'GOVERNED-2028-V1'
    }, opened.state, boundaries())).toMatchObject({
      status: 'Rejected', exception: { code: 'IdempotencyConflict' }
    });
  });

  it('clones boundary input and rejects mutation, accessor, prototype and Proxy attacks', () => {
    const input = boundaries();
    const validation = readyPreClose(2027, 'GOVERNED-2027-V1', 1, input);
    (input[0] as { sourceVersion: string }).sourceVersion = 'CALLER-MUTATION';
    const opened = applyOpen(createEmptyYearLifecycleTransitionState(), 2027, 'GOVERNED-2027-V1');
    const closed = applyClose(opened.state, 2027, 'GOVERNED-2027-V1', 1, 2, validation);
    expect(readYearLifecycleVersion(closed.state, 2027, 2)?.boundaries[0].sourceVersion)
      .toBe('CORE-SYNTH-V1');

    let getterExecuted = false;
    const accessor = { ...command('Open', 2028, 'GOVERNED-2028-V1', 0, 4) } as Record<string, unknown>;
    Object.defineProperty(accessor, 'commandId', {
      enumerable: true,
      get: () => {
        getterExecuted = true;
        return 'SYNTH-ACCESSOR';
      }
    });
    expect(planOpenYear(accessor, createEmptyYearLifecycleTransitionState(), boundaries()))
      .toMatchObject({ status: 'Rejected', exception: { code: 'MalformedInput' } });
    expect(getterExecuted).toBe(false);
    const prototyped = Object.assign(Object.create({ inherited: true }),
      command('Open', 2028, 'GOVERNED-2028-V1', 0, 5));
    expect(planOpenYear(prototyped, createEmptyYearLifecycleTransitionState(), boundaries()))
      .toMatchObject({ status: 'Rejected', exception: { code: 'MalformedInput' } });
    const proxy = new Proxy(command('Open', 2028, 'GOVERNED-2028-V1', 0, 6), {
      ownKeys: () => { throw new Error('Hostile transition proxy'); }
    });
    expect(planOpenYear(proxy, createEmptyYearLifecycleTransitionState(), boundaries()))
      .toMatchObject({ status: 'Rejected', exception: { code: 'MalformedInput' } });
  });

  it('performs exact compensating rollback and rejects stale or replayed recovery', () => {
    const before = createEmptyYearLifecycleTransitionState();
    const beforeSha = yearLifecycleTransitionStateSha256(before);
    const opened = applyOpen(before, 2027, 'GOVERNED-2027-V1');
    const laterState = applyOpen(opened.state, 2028, 'GOVERNED-2028-V1', 7);
    expect(rollbackYearLifecycleTransition(laterState.state, opened.recovery, admin,
      '2026-09-22T20:39:00.000Z', 'Stale synthetic recovery.')).toMatchObject({
      status: 'Rejected', exception: { code: 'RollbackConflict' }
    });
    const rolledBack = rollbackYearLifecycleTransition(
      opened.state,
      opened.recovery,
      admin,
      '2026-09-22T20:40:00.000Z',
      'Synthetic controlled transition recovery.'
    );
    expect(rolledBack.status).toBe('RolledBack');
    if (rolledBack.status !== 'RolledBack') throw new Error('Synthetic rollback was rejected.');
    expect(rolledBack.state).toEqual(before);
    expect(yearLifecycleTransitionStateSha256(rolledBack.state)).toBe(beforeSha);
    expect(rolledBack.receipt).toMatchObject({
      actorId: admin.actorId,
      actorEmail: admin.actorEmail,
      restoredStateSha256: beforeSha
    });
    expect(rollbackYearLifecycleTransition(opened.state, opened.recovery, admin,
      '2026-09-22T20:41:00.000Z', 'Replay synthetic recovery.')).toMatchObject({
      status: 'Rejected', exception: { code: 'RollbackAlreadyUsed' }
    });

  });

  it('rejects forged pre-close validation and forged recovery authority', () => {
    const opened = applyOpen(createEmptyYearLifecycleTransitionState(), 2027, 'GOVERNED-2027-V1');
    const genuine = readyPreClose(2027, 'GOVERNED-2027-V1', 1);
    expect(planCloseYear(command('Close', 2027, 'GOVERNED-2027-V1', 1, 2), opened.state, {
      ...genuine
    })).toMatchObject({ status: 'Rejected', exception: { code: 'PreCloseBlocked' } });
    expect(rollbackYearLifecycleTransition(opened.state, {
      recoveryId: 'FORGED', appliedStateRevision: 1
    }, admin, '2026-09-22T20:43:00.000Z', 'Forged recovery.')).toMatchObject({
      status: 'Rejected', exception: { code: 'Unauthorised' }
    });
  });
});
