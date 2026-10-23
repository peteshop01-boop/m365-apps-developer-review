import type { IYearLifecycleSyntheticFixture, IYearLifecycleSourceGuard, IYearLifecycleSyntheticSourceSession,
  IYearLifecycleSourceEvent, LifecycleSourceChoice, LifecycleSourceFamily } from '../../models/YearLifecycleSourceCallerModels';
import * as Import from './YearLifecycleImportEngine';
import * as Transition from './YearLifecycleTransitionEngine';
import * as Strategy from './StrategyCycleEngine';

const immutable = (value: unknown): boolean => !value || typeof value !== 'object'
  || (Object.isFrozen(value) && Object.keys(value).every(key => immutable((value as Record<string, unknown>)[key])));
const actor = (value: LifecycleSourceChoice['compensation']['actor']): boolean => !!value
  && value.role === 'LifecycleAdministrator' && value.active === true && !!value.actorId
  && typeof value.actorEmail === 'string' && value.actorEmail.endsWith('@example.invalid');
const date = (value: string): boolean => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
const projection = (value: unknown): unknown => {
  const freeze = (item: unknown): unknown => {
    if (item && typeof item === 'object') { Object.keys(item).forEach(key => freeze((item as Record<string, unknown>)[key])); Object.freeze(item); }
    return item;
  };
  return freeze(JSON.parse(JSON.stringify(value)));
};
const complete = (choice: LifecycleSourceChoice): boolean => {
  if (!choice.id || !choice.label || !choice.compensation || !actor(choice.compensation.actor)
    || !date(choice.compensation.occurredAt) || !choice.compensation.reason) return false;
  if (choice.family === 'Import') return !!choice.manifest?.source?.sourceId && !!choice.manifest.source.sourceVersion
    && !!choice.manifest.source.sourceEtag && !!choice.manifest.source.contentSha256 && !!choice.manifest.approvalReference
    && !!choice.expectation?.sourceId && !!choice.expectation.manifestSha256 && !!choice.manifest.configurationVersion
    && typeof choice.manifest.targetYear === 'number' && typeof choice.expectation.targetYear === 'number'
    && !!choice.request?.idempotencyKey && actor(choice.request.actor) && date(choice.request.requestedAt);
  if (choice.family !== 'Transition' && choice.family !== 'Strategy') return false;
  if (!choice.command?.commandId || !choice.command.idempotencyKey || !choice.command.reason
    || typeof choice.command.performanceYear !== 'number' || !actor(choice.command.actor) || !date(choice.command.occurredAt)) return false;
  if (choice.family === 'Transition') return !!choice.command.configurationVersion && typeof choice.command.expectedYearVersion === 'number'
    && (choice.command.transition === 'Open' ? !!choice.initialBoundaries
      : choice.command.transition === 'Close' ? !!choice.preClose : choice.command.transition === 'Reopen');
  return !!choice.command.cycleId && !!choice.command.source?.sourceId && !!choice.command.source.sourceVersion
    && typeof choice.command.expectedCycleVersion === 'number' && !!choice.command.source.sourceSha256
    && !!choice.command.source.approvalReference && (choice.command.operation === 'CreateCycle'
    || (choice.command.operation === 'RetireOutcome' ? !!choice.outcomeId
      : choice.command.operation === 'CarryForward' ? !!choice.selection : !!choice.outcome));
};

/** Genuine engine capabilities stay in these closures; no token/plan JSON is accepted or returned. */
export const createYearLifecycleSyntheticSourceSession = (
  fixture: IYearLifecycleSyntheticFixture | undefined, guard: IYearLifecycleSourceGuard
): IYearLifecycleSyntheticSourceSession => {
  let available = false;
  try {
    available = !!fixture && fixture.kind === 'SyntheticLifecycleSource' && fixture.fixtureId.startsWith('SYNTH-')
      && !!fixture.sessionId && guard.sessionId === fixture.sessionId && guard.isAdmin
      && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(guard.hostname)
      && fixture.signedInEmail === guard.signedInEmail && fixture.signedInEmail.endsWith('@example.invalid')
      && immutable(fixture) && fixture.choices.length > 0 && fixture.choices.every(complete)
      && new Set(fixture.choices.map(choice => choice.id)).size === fixture.choices.length;
    if (available) {
      Import.yearLifecycleStateSha256(fixture!.imports);
      Transition.yearLifecycleTransitionStateSha256(fixture!.transitions);
      Strategy.strategyCycleStateSha256(fixture!.strategy);
    }
  } catch { available = false; }
  let imports = available ? fixture!.imports : Import.createEmptyYearLifecycleState();
  let transitions = available ? fixture!.transitions : Transition.createEmptyYearLifecycleTransitionState();
  let strategy = available ? fixture!.strategy : Strategy.createEmptyStrategyCycleState();
  const pending = new Map<string, () => void>();
  const recoveries = new Map<string, { family: LifecycleSourceFamily; receiptId: string; run: () => void }>();
  let events: IYearLifecycleSourceEvent[] = [];
  const record = (choice: LifecycleSourceChoice, status: IYearLifecycleSourceEvent['status'], detail: unknown): void => {
    events = [...events, Object.freeze({ family: choice.family, choiceId: choice.id, status, detail: projection(detail) })];
  };
  const reject = (choiceId: string): void => {
    events = [...events, Object.freeze({ family: 'Session' as const, choiceId, status: 'Rejected' as const,
      detail: 'UNBOUND / HOLD: selection or same-process capability unavailable.' })];
  };
  const plan = (choiceId: string): void => {
    const choice = available && fixture!.choices.find(item => item.id === choiceId);
    if (!choice) { reject(choiceId); return; }
    pending.delete(choiceId);
    const capture = choice.compensation;
    if (choice.family === 'Import') {
      const result = Import.planYearLifecycleImport(choice.manifest, choice.expectation, imports, choice.request);
      record(choice, result.status, result.status === 'Planned' ? result.plan : result.status === 'Idempotent' ? result.receipt : result.exception);
      if (result.status === 'Planned') pending.set(choiceId, () => {
        const applied = Import.applyYearLifecycleImport(result.plan, imports);
        record(choice, applied.status, applied.status === 'Applied' ? applied.receipt : applied.exception);
        if (applied.status !== 'Applied') return;
        imports = applied.state;
        const id = `Import:${applied.receipt.receiptId}`;
        recoveries.set(id, { family: choice.family, receiptId: applied.receipt.receiptId, run: () => {
          const result = Import.rollbackYearLifecycleImport(imports, applied.recovery, capture.actor, capture.occurredAt, capture.reason);
          record(choice, result.status, result.status === 'RolledBack' ? result.receipt : result.exception);
          if (result.status === 'RolledBack') { imports = result.state; recoveries.delete(id); }
        } });
      });
    } else if (choice.family === 'Transition') {
      const validation = choice.command.transition === 'Close' ? Transition.validateYearPreClose(choice.preClose) : undefined;
      const result = choice.command.transition === 'Open' ? Transition.planOpenYear(choice.command, transitions, choice.initialBoundaries)
        : choice.command.transition === 'Close' ? Transition.planCloseYear(choice.command, transitions, validation)
          : Transition.planReopenYear(choice.command, transitions);
      record(choice, result.status, result.status === 'Planned' ? result.plan : result.status === 'Idempotent' ? result.receipt : result.exception);
      if (result.status === 'Planned') pending.set(choiceId, () => {
        const applied = Transition.applyYearLifecycleTransition(result.plan, transitions);
        record(choice, applied.status, applied.status === 'Applied' ? applied.receipt : applied.exception);
        if (applied.status !== 'Applied') return;
        transitions = applied.state;
        const id = `Transition:${applied.receipt.receiptId}`;
        recoveries.set(id, { family: choice.family, receiptId: applied.receipt.receiptId, run: () => {
          const result = Transition.rollbackYearLifecycleTransition(transitions, applied.recovery, capture.actor, capture.occurredAt, capture.reason);
          record(choice, result.status, result.status === 'RolledBack' ? result.receipt : result.exception);
          if (result.status === 'RolledBack') { transitions = result.state; recoveries.delete(id); }
        } });
      });
    } else {
      const command = choice.command;
      const result = command.operation === 'CreateCycle' ? Strategy.planCreateStrategyCycle(command, strategy)
        : command.operation === 'CreateOutcome' ? Strategy.planCreateStrategyOutcome(command, strategy, choice.outcome)
          : command.operation === 'UpdateOutcome' ? Strategy.planUpdateStrategyOutcome(command, strategy, choice.outcome)
            : command.operation === 'RetireOutcome' ? Strategy.planRetireStrategyOutcome(command, strategy, choice.outcomeId)
              : Strategy.planStrategyCarryForward(command, strategy, choice.selection);
      record(choice, result.status, result.status === 'Planned' ? result.plan : result.status === 'Idempotent' ? result.receipt : result.exception);
      if (result.status === 'Planned') pending.set(choiceId, () => {
        const applied = Strategy.applyStrategyCyclePlan(result.plan, strategy);
        record(choice, applied.status, applied.status === 'Applied' ? applied.receipt : applied.exception);
        if (applied.status !== 'Applied') return;
        strategy = applied.state;
        const id = `Strategy:${applied.receipt.receiptId}`;
        recoveries.set(id, { family: choice.family, receiptId: applied.receipt.receiptId, run: () => {
          const result = Strategy.rollbackStrategyCycle(strategy, applied.recovery, capture.actor, capture.occurredAt, capture.reason);
          record(choice, result.status, result.status === 'RolledBack' ? result.receipt : result.exception);
          if (result.status === 'RolledBack') { strategy = result.state; recoveries.delete(id); }
        } });
      });
    }
  };
  return Object.freeze({
    plan,
    apply: (id: string): void => { const operation = available && pending.get(id); pending.delete(id); if (operation) operation(); else reject(id); },
    compensate: (id: string): void => { const recovery = available && recoveries.get(id); if (recovery) recovery.run(); else reject(id); },
    discard: (): void => { available = false; pending.clear(); recoveries.clear(); events = [];
      imports = Import.createEmptyYearLifecycleState(); transitions = Transition.createEmptyYearLifecycleTransitionState(); strategy = Strategy.createEmptyStrategyCycleState(); },
    read: () => Object.freeze({ available,
      message: available ? 'SYNTHETIC LOCAL DEMONSTRATION — three independent source families; same-process compensation only.'
        : 'UNBOUND / HOLD — immutable synthetic capture and authorised local session required. Compensation unavailable after reload or session change.',
      choices: Object.freeze(available ? fixture!.choices.map(choice => Object.freeze({ id: choice.id, label: choice.label, family: choice.family, input: choice })) : []),
      pending: Object.freeze(Array.from(pending.keys())),
      compensation: Object.freeze(Array.from(recoveries.entries()).map(([id, value]) => Object.freeze({ id, family: value.family, receiptId: value.receiptId }))),
      events: Object.freeze(events.slice()),
      imports: Object.freeze([Import.readYearLifecycleYear(imports, 2026), Import.readYearLifecycleYear(imports, 2027)]),
      transitions: Object.freeze(transitions.years.map(year => Object.freeze({ history: Transition.readYearLifecycleHistory(transitions, year.performanceYear)!,
        versions: Object.freeze(year.versions.map(version => Transition.readYearLifecycleVersion(transitions, year.performanceYear, version.yearVersion))) }))),
      strategy: Object.freeze(strategy.cycles.map(cycle => Object.freeze({ history: Strategy.readStrategyCycle(strategy, cycle.cycleId)!,
        versions: Object.freeze(cycle.versions.map(version => Strategy.readStrategyCycleVersion(strategy, cycle.cycleId, version.cycleVersion))),
        outcomes: Object.freeze(cycle.versions.slice(-1)[0].outcomes.flatMap(outcome => outcome.versions.map(version =>
          Strategy.readStrategyOutcomeVersion(strategy, cycle.cycleId, outcome.outcomeId, version.outcomeVersion)))) })))
    })
  });
};
