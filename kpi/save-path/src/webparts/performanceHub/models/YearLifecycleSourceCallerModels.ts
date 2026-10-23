import type * as M from '../services/yearLifecycle/YearLifecycleModels';

export type LifecycleSourceFamily = 'Import' | 'Transition' | 'Strategy';
interface ISourceChoice {
  readonly id: string;
  readonly label: string;
  readonly compensation: { readonly actor: M.IYearLifecycleActor; readonly occurredAt: string; readonly reason: string };
}
export type LifecycleSourceChoice = ISourceChoice & (
  | { readonly family: 'Import'; readonly manifest: M.IYearLifecycleImportManifest; readonly expectation: M.IYearLifecycleManifestExpectation; readonly request: M.IYearLifecycleImportRequest }
  | { readonly family: 'Transition'; readonly command: M.IYearLifecycleTransitionCommand; readonly initialBoundaries?: readonly M.IYearCloseBoundarySnapshot[]; readonly preClose?: M.IYearPreCloseInput }
  | { readonly family: 'Strategy'; readonly command: M.IStrategyCycleCommand; readonly outcome?: M.IStrategyOutcomeInput; readonly outcomeId?: string; readonly selection?: M.IStrategyCarryForwardSelection }
);

/** Explicit immutable demonstration capture. Never issued from an application role. */
export interface IYearLifecycleSyntheticFixture {
  readonly kind: 'SyntheticLifecycleSource';
  readonly fixtureId: string;
  readonly sessionId: string;
  readonly signedInEmail: string;
  readonly imports: M.IYearLifecycleState;
  readonly transitions: M.IYearLifecycleTransitionState;
  readonly strategy: M.IStrategyCycleState;
  readonly choices: readonly LifecycleSourceChoice[];
}
export interface IYearLifecycleSourceGuard {
  readonly hostname: string;
  readonly isAdmin: boolean;
  readonly signedInEmail: string;
  readonly sessionId: string;
}
export interface IYearLifecycleSourceEvent {
  readonly family: LifecycleSourceFamily | 'Session';
  readonly choiceId: string;
  readonly status: 'Planned' | 'Idempotent' | 'Applied' | 'Rejected' | 'RolledBack';
  readonly detail: unknown;
}
export interface IYearLifecycleSourceSnapshot {
  readonly available: boolean;
  readonly message: string;
  readonly choices: readonly { readonly id: string; readonly label: string; readonly family: LifecycleSourceFamily; readonly input: unknown }[];
  readonly pending: readonly string[];
  readonly compensation: readonly { readonly id: string; readonly family: LifecycleSourceFamily; readonly receiptId: string }[];
  readonly events: readonly IYearLifecycleSourceEvent[];
  readonly imports: readonly (M.IYearLifecycleYearState | undefined)[];
  readonly transitions: readonly { readonly history: M.IYearLifecycleYearHistory; readonly versions: readonly (M.IYearLifecycleHistoryVersion | undefined)[] }[];
  readonly strategy: readonly { readonly history: M.IStrategyCycleHistory; readonly versions: readonly (M.IStrategyCycleVersion | undefined)[]; readonly outcomes: readonly (M.IStrategyOutcomeVersion | undefined)[] }[];
}
export interface IYearLifecycleSyntheticSourceSession {
  read(): IYearLifecycleSourceSnapshot;
  plan(choiceId: string): void;
  apply(choiceId: string): void;
  compensate(selectionId: string): void;
  discard(): void;
}
