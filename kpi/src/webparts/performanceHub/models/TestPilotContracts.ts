/** C1 / 2026-09-08. Pure LOCAL TEST contracts; not installed identities or an access adapter. */
export const TEST_SCHEMA_VERSION = 'kcf.test-pilot.v3' as const;
export const TEST_YEAR = 2027 as const;
export type TestCommand = 'CreateWorkplanDraft' | 'UpsertCoreContributionV2';
export type AppRole = 'Employee' | 'Manager' | 'SLT' | 'AppAdmin';
export type BusinessResource = 'Core' | 'Personal' | 'Behaviour' | 'Review' | 'Progress' | 'Evidence';
export type Resource = BusinessResource | 'Profile' | 'Status' | 'People' | 'Membership' | 'Audit' | 'Journal' | 'Connection' | 'Secret';
export type Disposition = 'Planned' | 'Issued' | 'Confirmed' | 'Unknown';
export interface TestProfile {
  Title: string; ProfileKey: string; PersonKey: string; Email: string; Active: boolean;
  PerformanceYear: 2027; ManagerPersonKey?: string; ManagerDisplayName?: string; ManagerEmail?: string;
  ManagerMappingValid: boolean; MappingRevision: number; SchemaVersion: typeof TEST_SCHEMA_VERSION;
}
export interface TrustedActor {
  personKey: string; email: string; active: boolean; roles: AppRole[]; managerPersonKey: string | null;
}
export interface AuthorisationState {
  environment: 'TEST'; year: 2027; revision: number; phase: 'Active' | 'Changing' | 'Held';
  actors: TrustedActor[];
}
export interface ReadRequest {
  environment: 'TEST'; year: 2027; actorKey: string; targetKey: string; resource: Resource; expectedRevision: number;
}
export interface ReadDecision {
  policy: 'Allowed' | 'Denied'; leanCapability: 'Included' | 'Unimplemented'; runtime: 'NotImplemented';
}
export interface TestBinding {
  environment: 'TEST'; performanceYear: 2027; schemaVersion: typeof TEST_SCHEMA_VERSION;
  profileListId: string | null; statusListId: string | null; commandListId: string | null;
  workplansListId: string | null; workplanItemsListId: string | null;
}
export interface TrustedCommandSource {
  listId: string; itemId: number; version: string; etag: string; commandKey: string; commandType: TestCommand;
  actorKey: string; actorEmail: string; year: 2027; correlationKey: string;
  subjectType: 'Workplan' | 'WorkplanItem'; subjectKey?: string; workplanKey?: string; resultKeys: string[];
}
export type StatusOutcome = 'Accepted' | 'Rejected' | 'Duplicate' | 'Failed' | 'RecoveryHold';
export type StatusEvent = 'SAVED' | 'REJECTED' | 'DUPLICATE' | 'FAILED' | 'HELD';
export interface TestStatus {
  Title: 'Command status'; StatusKey: string; PersonKey: string; CommandKey: string; CommandType: TestCommand;
  SourceListId: string; SourceItemId: number; SourceItemVersion: string; SourceItemETag: string;
  ActorEmail: string; ActorPersonKey: string; EffectiveRole: 'Employee'; SubjectType: 'Workplan' | 'WorkplanItem';
  SubjectKey?: string; PerformanceYear: 2027; WorkplanKey?: string; WorkplanVersion?: number; RowVersionToken?: number;
  ResultKeysJSON?: string; Outcome: StatusOutcome; EventCode: StatusEvent; SafeMessage: string;
  EventAt: string; SchemaVersion: typeof TEST_SCHEMA_VERSION; CorrelationKey: string;
}
export interface ModelHeader {
  id: number; etag: string; workplanKey: string; personKey: string; year: 2027; workplanVersion: 1;
  rowVersionToken: number; transition: 'Ready' | 'InProgress' | 'Failed'; access: 'EmployeeEdit' | 'RecoveryHold';
  correlation: string | null;
}
/** Only business fields. Physical rows must also exclude private linkage before any future grants. */
export interface SafeBusinessRow {
  key: string; naturalKey: string; workplanKey: string; personKey: string; year: 2027;
  category: 'CoreGold' | 'LocalPersonal' | 'Behaviour'; referenceKey: string; active: boolean; weight: number;
  target: number; BehaviourSelectedSuggestionKeysJ: string; BehaviourCustomObjective: string;
}
export interface StableSnapshot { before: ModelHeader; pages: SafeBusinessRow[][]; after: ModelHeader; complete: boolean; }
export type EffectKind = 'Claim' | 'Canonical' | 'Grant' | 'Finalise' | 'StatusCreate' | 'StatusGrant' | 'RoleMap' | 'CacheInvalidate' | 'Revoke';
export interface EffectIntent {
  id: string; kind: EffectKind; key: string; existingId: number | null; expectedETag: string | null;
  beforeImage: string | null; desiredImage: string; reader: string | null;
}
export interface JournalEffect extends EffectIntent { disposition: Disposition; response: string | null; }
/** Independent trusted resource observations, not an allow-list supplied by effect intents. */
export interface TrustedGrantResource {
  key: string; resource: BusinessResource | 'Status'; workplanKey: string; personKey: string; year: 2027;
}
export interface TrustedGrantContext {
  commandKey: string; correlation: string; subjectKey: string; actorKey: string; expectedRevision: number;
  state: AuthorisationState; resources: TrustedGrantResource[];
}
export interface JournalGrantDecision {
  effectId: string; kind: 'Grant' | 'StatusGrant'; key: string; reader: string;
}
export interface LocalJournal {
  commandKey: string; subjectKey: string; actorKey: string; correlation: string; expectedToken: number;
  phase: 'Planned' | 'InProgress' | 'Ready' | 'Held' | 'Terminal';
  effects: JournalEffect[]; intendedRows: SafeBusinessRow[]; completionReference: string | null;
  grantAuthorisation: TrustedGrantContext;
  grantDecisions: JournalGrantDecision[];
}
export interface RoleChangeRequest { actorKey: string; targetKey: string; role: 'SLT' | 'AppAdmin'; grant: boolean; expectedRevision: number; idempotencyKey: string; }
export interface RoleJournal {
  request: RoleChangeRequest; before: AuthorisationState; intended: AuthorisationState; effects: JournalEffect[];
  phase: 'Changing' | 'Held' | 'Confirmed';
}
