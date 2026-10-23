export type YearLifecycleImportKind = 'HistoricalGold2026' | 'ApprovedNewYearBaseline2027';
export type YearLifecycleRecordClassification = 'Core' | 'Impact' | 'NotApplicable';
export type YearLifecycleBaselineEntityType = 'KPI' | 'Strategy' | 'Framework' | 'Population';
export type YearLifecycleHistoricalEntityType =
  'GoldKpiSnapshot' | 'GoldTargetSnapshot' | 'GoldClassificationSnapshot';

export interface IHistoricalGoldImportRecord {
  readonly recordType: 'HistoricalGold';
  readonly recordKey: string;
  readonly performanceYear: 2026;
  readonly entityType: YearLifecycleHistoricalEntityType;
  readonly sourceRecordKey: string;
  readonly version: string;
  readonly classification: YearLifecycleRecordClassification;
  readonly closedYearSnapshot: true;
  readonly snapshotValue: string;
}

export interface IApprovedBaselineImportRecord {
  readonly recordType: 'ApprovedBaseline';
  readonly recordKey: string;
  readonly performanceYear: 2027;
  readonly entityType: YearLifecycleBaselineEntityType;
  readonly sourceRecordKey: string;
  readonly version: string;
  readonly classification: YearLifecycleRecordClassification;
  readonly approvalStatus: 'Approved';
  readonly lifecycleStatus: 'Current';
}

export type YearLifecycleImportRecord = IHistoricalGoldImportRecord | IApprovedBaselineImportRecord;

export interface IYearLifecycleImportSource {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceEtag: string;
  readonly contentSha256: string;
}

export interface IYearLifecycleImportManifest {
  readonly schema: 'DEMO.YearLifecycleImportManifest';
  readonly schemaVersion: '1.0.0';
  readonly manifestId: string;
  readonly importKind: YearLifecycleImportKind;
  readonly targetYear: 2026 | 2027;
  readonly configurationVersion: string;
  readonly complete: true;
  readonly approved: true;
  readonly approvalReference: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly source: Readonly<IYearLifecycleImportSource>;
  readonly recordCount: number;
  readonly recordsSha256: string;
  readonly manifestSha256: string;
  readonly records: ReadonlyArray<Readonly<YearLifecycleImportRecord>>;
}

export interface IYearLifecycleImportManifestDraft {
  readonly schema: 'DEMO.YearLifecycleImportManifest';
  readonly schemaVersion: '1.0.0';
  readonly manifestId: string;
  readonly importKind: YearLifecycleImportKind;
  readonly targetYear: 2026 | 2027;
  readonly configurationVersion: string;
  readonly complete: true;
  readonly approved: true;
  readonly approvalReference: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly source: Readonly<Omit<IYearLifecycleImportSource, 'contentSha256'>>;
  readonly records: ReadonlyArray<Readonly<YearLifecycleImportRecord>>;
}

export interface IYearLifecycleManifestExpectation {
  readonly manifestId: string;
  readonly manifestSha256: string;
  readonly importKind: YearLifecycleImportKind;
  readonly targetYear: 2026 | 2027;
  readonly configurationVersion: string;
  readonly approvalReference: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceEtag: string;
  readonly sourceContentSha256: string;
}

export interface IYearLifecycleActor {
  readonly actorId: string;
  readonly actorEmail: string;
  readonly role: 'LifecycleAdministrator';
  readonly active: true;
}

export interface IYearLifecycleImportRequest {
  readonly idempotencyKey: string;
  readonly requestedAt: string;
  readonly actor: Readonly<IYearLifecycleActor>;
}

export interface IYearLifecycleImportReceipt {
  readonly receiptId: string;
  readonly idempotencyKey: string;
  readonly manifestId: string;
  readonly manifestSha256: string;
  readonly importKind: YearLifecycleImportKind;
  readonly targetYear: 2026 | 2027;
  readonly configurationVersion: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceEtag: string;
  readonly sourceContentSha256: string;
  readonly recordCount: number;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly appliedAt: string;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly beforeStateSha256: string;
  readonly afterStateSha256: string;
}

export interface IYearLifecycleYearState {
  readonly performanceYear: 2026 | 2027;
  readonly configurationVersion: string;
  readonly historicalGoldRecords: ReadonlyArray<Readonly<IHistoricalGoldImportRecord>>;
  readonly approvedBaselineRecords: ReadonlyArray<Readonly<IApprovedBaselineImportRecord>>;
}

export interface IYearLifecycleState {
  readonly schema: 'DEMO.YearLifecycleState';
  readonly revision: number;
  readonly years: ReadonlyArray<Readonly<IYearLifecycleYearState>>;
  readonly receipts: ReadonlyArray<Readonly<IYearLifecycleImportReceipt>>;
}

export type YearLifecycleExceptionCode =
  | 'MalformedInput'
  | 'UnsupportedSchema'
  | 'WrongYear'
  | 'WorkplanImportForbidden'
  | 'UnapprovedContent'
  | 'CountMismatch'
  | 'HashMismatch'
  | 'SourceMismatch'
  | 'StaleManifest'
  | 'DuplicateImport'
  | 'IdempotencyConflict'
  | 'StateConflict'
  | 'ConfigurationConflict'
  | 'PreCloseBlocked'
  | 'TransitionInvalid'
  | 'ClosedYearImmutable'
  | 'TransitionReplay'
  | 'HistoryConflict'
  | 'Unauthorised'
  | 'RollbackConflict'
  | 'RollbackAlreadyUsed'
  | 'WrongCycle'
  | 'SourceConflict'
  | 'AutomaticCarryForwardForbidden'
  | 'ObsoleteContent'
  | 'ClassificationConversionForbidden'
  | 'DuplicateRecord'
  | 'MappingConflict';

export interface IYearLifecycleExceptionReport {
  readonly reportId: string;
  readonly phase: 'Validate' | 'Plan' | 'Apply' | 'Rollback';
  readonly code: YearLifecycleExceptionCode;
  readonly message: string;
  readonly manifestId: string;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly occurredAt: string;
}

export interface IYearLifecycleImportPlan {
  readonly planId: string;
  readonly manifestId: string;
  readonly manifestSha256: string;
  readonly importKind: YearLifecycleImportKind;
  readonly targetYear: 2026 | 2027;
  readonly configurationVersion: string;
  readonly recordCount: number;
  readonly idempotencyKey: string;
  readonly expectedStateRevision: number;
  readonly expectedStateSha256: string;
}

export interface IYearLifecycleRecoveryToken {
  readonly recoveryId: string;
  readonly receiptId: string;
  readonly appliedStateRevision: number;
  readonly appliedStateSha256: string;
  readonly priorStateSha256: string;
}

export interface IYearLifecycleRollbackReceipt {
  readonly rollbackReceiptId: string;
  readonly receiptId: string;
  readonly recoveryId: string;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly rolledBackAt: string;
  readonly reason: string;
  readonly removedStateSha256: string;
  readonly restoredStateSha256: string;
}

export type YearLifecyclePlanResult =
  | { readonly status: 'Planned'; readonly plan: Readonly<IYearLifecycleImportPlan> }
  | { readonly status: 'Idempotent'; readonly receipt: Readonly<IYearLifecycleImportReceipt> }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type YearLifecycleApplyResult =
  | {
    readonly status: 'Applied';
    readonly state: Readonly<IYearLifecycleState>;
    readonly receipt: Readonly<IYearLifecycleImportReceipt>;
    readonly recovery: Readonly<IYearLifecycleRecoveryToken>;
  }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type YearLifecycleRollbackResult =
  | {
    readonly status: 'RolledBack';
    readonly state: Readonly<IYearLifecycleState>;
    readonly receipt: Readonly<IYearLifecycleRollbackReceipt>;
  }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type YearLifecycleHistoryYear = 2027 | 2028;
export type YearLifecycleTransition = 'Open' | 'Close' | 'Reopen';
export type YearLifecycleYearStatus = 'Open' | 'Closed';
export type YearCloseBoundary = 'Core' | 'Impact' | 'Behaviour' | 'Evidence' | 'ManagerAction';
export type YearCloseIssueType = 'Incomplete' | 'Unresolved';

export interface IYearCloseBoundarySnapshot {
  readonly boundary: YearCloseBoundary;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly recordCount: number;
  readonly incompleteCount: number;
  readonly unresolvedCount: number;
}

export interface IYearCloseExceptionAuthority {
  readonly issueKey: string;
  readonly boundary: YearCloseBoundary;
  readonly issueType: YearCloseIssueType;
  readonly reason: string;
  readonly approvalReference: string;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly approved: true;
}

export interface IYearCloseIssue {
  readonly issueKey: string;
  readonly boundary: YearCloseBoundary;
  readonly issueType: YearCloseIssueType;
  readonly count: number;
}

export interface IYearPreCloseInput {
  readonly performanceYear: YearLifecycleHistoryYear;
  readonly configurationVersion: string;
  readonly expectedYearVersion: number;
  readonly boundaries: ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>>;
  readonly exceptions: ReadonlyArray<Readonly<IYearCloseExceptionAuthority>>;
}

export interface IYearPreCloseValidation {
  readonly validationId: string;
  readonly performanceYear: YearLifecycleHistoryYear;
  readonly configurationVersion: string;
  readonly expectedYearVersion: number;
  readonly status: 'Ready' | 'ReadyWithExceptions' | 'Blocked';
  readonly boundarySnapshotSha256: string;
  readonly issues: ReadonlyArray<Readonly<IYearCloseIssue>>;
  readonly acceptedExceptionKeys: readonly string[];
}

export type YearPreCloseValidationResult =
  | Readonly<IYearPreCloseValidation>
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export interface IYearLifecycleTransitionCommand {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly transition: YearLifecycleTransition;
  readonly performanceYear: YearLifecycleHistoryYear;
  readonly configurationVersion: string;
  readonly expectedYearVersion: number;
  readonly actor: Readonly<IYearLifecycleActor>;
  readonly occurredAt: string;
  readonly reason: string;
}

export interface IYearLifecycleHistoryVersion {
  readonly yearVersion: number;
  readonly status: YearLifecycleYearStatus;
  readonly transition: YearLifecycleTransition;
  readonly configurationVersion: string;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly boundarySnapshotSha256: string;
  readonly boundaries: ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>>;
  readonly acceptedExceptions: ReadonlyArray<Readonly<IYearCloseExceptionAuthority>>;
  readonly versionSha256: string;
}

export interface IYearLifecycleYearHistory {
  readonly performanceYear: YearLifecycleHistoryYear;
  readonly configurationVersion: string;
  readonly currentVersion: number;
  readonly versions: ReadonlyArray<Readonly<IYearLifecycleHistoryVersion>>;
}

export interface IYearLifecycleTransitionReceipt {
  readonly receiptId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly transition: YearLifecycleTransition;
  readonly performanceYear: YearLifecycleHistoryYear;
  readonly configurationVersion: string;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly beforeStateRevision: number;
  readonly afterStateRevision: number;
  readonly beforeYearVersion: number;
  readonly afterYearVersion: number;
  readonly beforeStateSha256: string;
  readonly afterStateSha256: string;
}

export interface IYearLifecycleTransitionState {
  readonly schema: 'DEMO.YearLifecycleTransitionState';
  readonly revision: number;
  readonly years: ReadonlyArray<Readonly<IYearLifecycleYearHistory>>;
  readonly receipts: ReadonlyArray<Readonly<IYearLifecycleTransitionReceipt>>;
}

export interface IYearLifecycleTransitionPlan {
  readonly planId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly transition: YearLifecycleTransition;
  readonly performanceYear: YearLifecycleHistoryYear;
  readonly configurationVersion: string;
  readonly expectedYearVersion: number;
  readonly expectedStateRevision: number;
  readonly expectedStateSha256: string;
}

export interface IYearLifecycleTransitionRecoveryToken {
  readonly recoveryId: string;
  readonly receiptId: string;
  readonly appliedStateRevision: number;
  readonly appliedStateSha256: string;
  readonly priorStateSha256: string;
}

export interface IYearLifecycleTransitionRollbackReceipt {
  readonly rollbackReceiptId: string;
  readonly receiptId: string;
  readonly recoveryId: string;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly rolledBackAt: string;
  readonly reason: string;
  readonly removedStateSha256: string;
  readonly restoredStateSha256: string;
}

export type YearLifecycleTransitionPlanResult =
  | { readonly status: 'Planned'; readonly plan: Readonly<IYearLifecycleTransitionPlan> }
  | { readonly status: 'Idempotent'; readonly receipt: Readonly<IYearLifecycleTransitionReceipt> }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type YearLifecycleTransitionApplyResult =
  | {
    readonly status: 'Applied';
    readonly state: Readonly<IYearLifecycleTransitionState>;
    readonly receipt: Readonly<IYearLifecycleTransitionReceipt>;
    readonly recovery: Readonly<IYearLifecycleTransitionRecoveryToken>;
  }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type YearLifecycleTransitionRollbackResult =
  | {
    readonly status: 'RolledBack';
    readonly state: Readonly<IYearLifecycleTransitionState>;
    readonly receipt: Readonly<IYearLifecycleTransitionRollbackReceipt>;
  }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type YearLifecycleEditCheckResult =
  | {
    readonly status: 'Allowed';
    readonly performanceYear: YearLifecycleHistoryYear;
    readonly configurationVersion: string;
    readonly yearVersion: number;
  }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type StrategyCycleOperation =
  | 'CreateCycle'
  | 'CreateOutcome'
  | 'UpdateOutcome'
  | 'RetireOutcome'
  | 'CarryForward';
export type StrategyCycleEntityType = 'Hierarchy' | 'KPI' | 'Target' | 'Mapping';
export type StrategyCycleClassification = 'Core' | 'Impact' | 'NotApplicable';
export type StrategyOutcomeStatus = 'Active' | 'Retired';

export interface IStrategyCycleSourceAuthority {
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly approvalReference: string;
  readonly approved: true;
}

export interface IStrategyOutcomeInput {
  readonly outcomeId: string;
  readonly title: string;
  readonly description: string;
  readonly effectiveCycle: 2029;
  readonly effectivePeriod: string;
}

export interface IStrategyCarryForwardItem {
  readonly entityType: StrategyCycleEntityType;
  readonly sourceStableId: string;
  readonly targetStableId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly approvalStatus: 'Approved';
  readonly lifecycleStatus: 'Active';
  readonly obsolete: false;
  readonly sourceClassification: StrategyCycleClassification;
  readonly targetClassification: StrategyCycleClassification;
  readonly outcomeId?: string;
  readonly outcomeVersion?: number;
}

export interface IStrategyCarryForwardSelection {
  readonly selectionMode: 'Explicit';
  readonly items: ReadonlyArray<Readonly<IStrategyCarryForwardItem>>;
}

export interface IStrategyCycleCommand {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly operation: StrategyCycleOperation;
  readonly cycleId: string;
  readonly performanceYear: 2029;
  readonly expectedCycleVersion: number;
  readonly actor: Readonly<IYearLifecycleActor>;
  readonly occurredAt: string;
  readonly reason: string;
  readonly source: Readonly<IStrategyCycleSourceAuthority>;
}

export interface IStrategyOutcomeVersion {
  readonly outcomeId: string;
  readonly outcomeVersion: number;
  readonly title: string;
  readonly description: string;
  readonly effectiveCycle: 2029;
  readonly effectivePeriod: string;
  readonly status: StrategyOutcomeStatus;
  readonly operation: 'CreateOutcome' | 'UpdateOutcome' | 'RetireOutcome';
  readonly actorId: string;
  readonly actorEmail: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly beforeSha256: string;
  readonly afterSha256: string;
  readonly versionSha256: string;
}

export interface IStrategyOutcomeHistory {
  readonly outcomeId: string;
  readonly currentVersion: number;
  readonly versions: ReadonlyArray<Readonly<IStrategyOutcomeVersion>>;
}

export interface IStrategyCarryForwardRecord {
  readonly carryForwardId: string;
  readonly entityType: StrategyCycleEntityType;
  readonly sourceStableId: string;
  readonly targetStableId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly approvalReference: string;
  readonly classification: StrategyCycleClassification;
  readonly outcomeId?: string;
  readonly outcomeVersion?: number;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly carriedAt: string;
  readonly reason: string;
  readonly recordSha256: string;
}

export interface IStrategyCycleVersion {
  readonly cycleVersion: number;
  readonly operation: StrategyCycleOperation;
  readonly cycleId: string;
  readonly performanceYear: 2029;
  readonly status: 'Active';
  readonly actorId: string;
  readonly actorEmail: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly beforeCycleSha256: string;
  readonly outcomes: ReadonlyArray<Readonly<IStrategyOutcomeHistory>>;
  readonly carriedRecords: ReadonlyArray<Readonly<IStrategyCarryForwardRecord>>;
  readonly versionSha256: string;
}

export interface IStrategyCycleHistory {
  readonly cycleId: string;
  readonly performanceYear: 2029;
  readonly currentVersion: number;
  readonly versions: ReadonlyArray<Readonly<IStrategyCycleVersion>>;
}

export interface IStrategyCycleReceipt {
  readonly receiptId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly operation: StrategyCycleOperation;
  readonly cycleId: string;
  readonly performanceYear: 2029;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly occurredAt: string;
  readonly reason: string;
  readonly sourceId: string;
  readonly sourceVersion: string;
  readonly sourceSha256: string;
  readonly beforeStateRevision: number;
  readonly afterStateRevision: number;
  readonly beforeCycleVersion: number;
  readonly afterCycleVersion: number;
  readonly beforeStateSha256: string;
  readonly afterStateSha256: string;
}

export interface IStrategyCycleState {
  readonly schema: 'DEMO.StrategyCycleState';
  readonly revision: number;
  readonly cycles: ReadonlyArray<Readonly<IStrategyCycleHistory>>;
  readonly receipts: ReadonlyArray<Readonly<IStrategyCycleReceipt>>;
}

export interface IStrategyCyclePlan {
  readonly planId: string;
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly operation: StrategyCycleOperation;
  readonly cycleId: string;
  readonly performanceYear: 2029;
  readonly expectedCycleVersion: number;
  readonly expectedStateRevision: number;
  readonly expectedStateSha256: string;
}

export interface IStrategyCycleRecoveryToken {
  readonly recoveryId: string;
  readonly receiptId: string;
  readonly appliedStateRevision: number;
  readonly appliedStateSha256: string;
  readonly priorStateSha256: string;
}

export interface IStrategyCycleRollbackReceipt {
  readonly rollbackReceiptId: string;
  readonly receiptId: string;
  readonly recoveryId: string;
  readonly actorId: string;
  readonly actorEmail: string;
  readonly rolledBackAt: string;
  readonly reason: string;
  readonly removedStateSha256: string;
  readonly restoredStateSha256: string;
}

export type StrategyCyclePlanResult =
  | { readonly status: 'Planned'; readonly plan: Readonly<IStrategyCyclePlan> }
  | { readonly status: 'Idempotent'; readonly receipt: Readonly<IStrategyCycleReceipt> }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type StrategyCycleApplyResult =
  | {
    readonly status: 'Applied';
    readonly state: Readonly<IStrategyCycleState>;
    readonly receipt: Readonly<IStrategyCycleReceipt>;
    readonly recovery: Readonly<IStrategyCycleRecoveryToken>;
  }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };

export type StrategyCycleRollbackResult =
  | {
    readonly status: 'RolledBack';
    readonly state: Readonly<IStrategyCycleState>;
    readonly receipt: Readonly<IStrategyCycleRollbackReceipt>;
  }
  | { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> };
