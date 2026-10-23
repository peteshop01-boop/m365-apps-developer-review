import type {
  IYearCloseBoundarySnapshot,
  IYearCloseExceptionAuthority,
  IYearCloseIssue,
  IYearLifecycleActor,
  IYearLifecycleExceptionReport,
  IYearLifecycleHistoryVersion,
  IYearLifecycleTransitionCommand,
  IYearLifecycleTransitionPlan,
  IYearLifecycleTransitionReceipt,
  IYearLifecycleTransitionRecoveryToken,
  IYearLifecycleTransitionRollbackReceipt,
  IYearLifecycleTransitionState,
  IYearLifecycleYearHistory,
  IYearPreCloseValidation,
  YearCloseBoundary,
  YearCloseIssueType,
  YearLifecycleEditCheckResult,
  YearLifecycleExceptionCode,
  YearLifecycleHistoryYear,
  YearLifecycleTransitionApplyResult,
  YearLifecycleTransitionPlanResult,
  YearLifecycleTransitionRollbackResult,
  YearPreCloseValidationResult
} from './YearLifecycleModels';
import { sha256Hex } from './YearLifecycleImportEngine';

class TransitionBoundaryError extends Error {
  public constructor(public readonly code: YearLifecycleExceptionCode, message: string) {
    super(message);
    this.name = 'TransitionBoundaryError';
    Object.setPrototypeOf(this, TransitionBoundaryError.prototype);
  }
}

const fail = (code: YearLifecycleExceptionCode, message: string): never => {
  throw new TransitionBoundaryError(code, message);
};

const text = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
    || Array.from(value).some(character => character.charCodeAt(0) <= 31)) {
    return fail('MalformedInput', `${label} must be non-empty canonical text.`);
  }
  return value;
};

const timestamp = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    return fail('MalformedInput', `${label} must be an exact UTC timestamp.`);
  }
  return value;
};

const sha = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^[A-F0-9]{64}$/.test(value)) {
    return fail('HashMismatch', `${label} must be an uppercase SHA-256 value.`);
  }
  return value;
};

const whole = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return fail('MalformedInput', `${label} must be a non-negative safe whole number.`);
  }
  return value;
};

const ownData = (
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = []
): Readonly<Record<string, unknown>> => {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fail('MalformedInput', `${label} must be a plain object.`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return fail('MalformedInput', `${label} must not use a custom prototype.`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return fail('MalformedInput', `${label} must not contain symbol properties.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Object.getOwnPropertyNames(value);
    const allowed = new Set(required.concat(optional));
    if (required.some(name => !Object.prototype.hasOwnProperty.call(descriptors, name))
      || names.some(name => !allowed.has(name))) {
      return fail('MalformedInput', `${label} has missing or unexpected properties.`);
    }
    const output: Record<string, unknown> = {};
    names.forEach(name => {
      const descriptor = descriptors[name];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        fail('MalformedInput', `${label}.${name} must be an enumerable data property.`);
      }
      output[name] = descriptor.value;
    });
    return output;
  } catch (error) {
    if (error instanceof TransitionBoundaryError) throw error;
    return fail('MalformedInput', `${label} could not be inspected safely.`);
  }
};

const denseArray = (value: unknown, label: string): readonly unknown[] => {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length > 0) {
      return fail('MalformedInput', `${label} must be a standard dense array.`);
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0 || lengthDescriptor.value > 10000) {
      return fail('MalformedInput', `${label} has an invalid length.`);
    }
    const length = lengthDescriptor.value as number;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const expected = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    if (Object.getOwnPropertyNames(value).some(name => !expected.has(name))
      || Object.getOwnPropertyNames(value).length !== expected.size) {
      return fail('MalformedInput', `${label} must be dense and contain no custom properties.`);
    }
    return Object.freeze(Array.from({ length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        return fail('MalformedInput', `${label}[${index}] must be an enumerable data property.`);
      }
      return descriptor.value;
    }));
  } catch (error) {
    if (error instanceof TransitionBoundaryError) throw error;
    return fail('MalformedInput', `${label} could not be inspected safely.`);
  }
};

const lifecycleYear = (value: unknown, label: string): YearLifecycleHistoryYear => {
  if (value !== 2027 && value !== 2028) return fail('WrongYear', `${label} must be 2027 or 2028.`);
  return value;
};

const actor = (value: unknown): Readonly<IYearLifecycleActor> => {
  const source = ownData(value, 'Lifecycle transition actor', ['actorId', 'actorEmail', 'role', 'active']);
  if (source.role !== 'LifecycleAdministrator' || source.active !== true) {
    return fail('Unauthorised', 'An active Lifecycle Administrator is required.');
  }
  const email = text(source.actorEmail, 'Lifecycle actor email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Unauthorised', 'Lifecycle actor email is invalid.');
  return Object.freeze({
    actorId: text(source.actorId, 'Lifecycle actor ID'),
    actorEmail: email,
    role: 'LifecycleAdministrator' as const,
    active: true as const
  });
};

const boundaryOrder: readonly YearCloseBoundary[] = Object.freeze([
  'Core', 'Impact', 'Behaviour', 'Evidence', 'ManagerAction'
]);

const canonicalBoundary = (value: unknown): Readonly<IYearCloseBoundarySnapshot> => {
  const source = ownData(value, 'Year-close boundary', [
    'boundary', 'sourceVersion', 'sourceSha256', 'recordCount', 'incompleteCount', 'unresolvedCount'
  ]);
  if (boundaryOrder.indexOf(source.boundary as YearCloseBoundary) < 0) {
    return fail('MalformedInput', 'Year-close boundary name is unsupported.');
  }
  const recordCount = whole(source.recordCount, 'Boundary record count');
  const incompleteCount = whole(source.incompleteCount, 'Boundary incomplete count');
  const unresolvedCount = whole(source.unresolvedCount, 'Boundary unresolved count');
  if (incompleteCount > recordCount || unresolvedCount > recordCount) {
    return fail('MalformedInput', 'Boundary issue counts cannot exceed its record count.');
  }
  return Object.freeze({
    boundary: source.boundary as YearCloseBoundary,
    sourceVersion: text(source.sourceVersion, 'Boundary source version'),
    sourceSha256: sha(source.sourceSha256, 'Boundary source SHA-256'),
    recordCount,
    incompleteCount,
    unresolvedCount
  });
};

const canonicalBoundaries = (value: unknown): ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>> => {
  const inputs = denseArray(value, 'Year-close boundaries').map(canonicalBoundary);
  if (inputs.length !== boundaryOrder.length
    || new Set(inputs.map(boundary => boundary.boundary)).size !== boundaryOrder.length) {
    return fail('MalformedInput', 'Year-close input requires exactly one Core, Impact, Behaviour, Evidence and ManagerAction boundary.');
  }
  return Object.freeze(boundaryOrder.map(name => inputs.find(boundary => boundary.boundary === name)!));
};

const canonicalException = (value: unknown): Readonly<IYearCloseExceptionAuthority> => {
  const source = ownData(value, 'Year-close exception authority', [
    'issueKey', 'boundary', 'issueType', 'reason', 'approvalReference', 'approvedBy', 'approvedAt', 'approved'
  ]);
  if (boundaryOrder.indexOf(source.boundary as YearCloseBoundary) < 0
    || (source.issueType !== 'Incomplete' && source.issueType !== 'Unresolved') || source.approved !== true) {
    return fail('UnapprovedContent', 'Year-close exception authority is invalid or unapproved.');
  }
  const issueKey = text(source.issueKey, 'Exception issue key');
  if (issueKey !== `${source.boundary}:${source.issueType}`) {
    return fail('MalformedInput', 'Exception issue key does not match its boundary and issue type.');
  }
  return Object.freeze({
    issueKey,
    boundary: source.boundary as YearCloseBoundary,
    issueType: source.issueType as YearCloseIssueType,
    reason: text(source.reason, 'Exception reason'),
    approvalReference: text(source.approvalReference, 'Exception approval reference'),
    approvedBy: text(source.approvedBy, 'Exception approver'),
    approvedAt: timestamp(source.approvedAt, 'Exception approval time'),
    approved: true as const
  });
};

const canonicalExceptions = (value: unknown): ReadonlyArray<Readonly<IYearCloseExceptionAuthority>> => {
  const exceptions = Object.freeze(denseArray(value, 'Year-close exceptions').map(canonicalException));
  if (new Set(exceptions.map(exception => exception.issueKey)).size !== exceptions.length) {
    return fail('DuplicateImport', 'Year-close exceptions contain duplicate issue authority.');
  }
  return exceptions;
};

const exceptionReport = (
  phase: IYearLifecycleExceptionReport['phase'],
  code: YearLifecycleExceptionCode,
  message: string,
  context: { commandId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string }
): Readonly<IYearLifecycleExceptionReport> => {
  const commandId = context.commandId || 'UNKNOWN';
  const idempotencyKey = context.idempotencyKey || 'UNKNOWN';
  const actorId = context.actorId || 'UNKNOWN';
  const occurredAt = context.occurredAt || '1970-01-01T00:00:00.000Z';
  return Object.freeze({
    reportId: `EXC-${sha256Hex(`${phase}|${code}|${commandId}|${idempotencyKey}|${actorId}|${occurredAt}`).slice(0, 20)}`,
    phase,
    code,
    message,
    manifestId: commandId,
    idempotencyKey,
    actorId,
    occurredAt
  });
};

const rejected = (
  phase: IYearLifecycleExceptionReport['phase'],
  error: unknown,
  context: { commandId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string }
): { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> } => {
  const code = error instanceof TransitionBoundaryError ? error.code : 'MalformedInput';
  const message = error instanceof TransitionBoundaryError
    ? error.message : 'Year-lifecycle transition input could not be inspected safely.';
  return Object.freeze({ status: 'Rejected' as const, exception: exceptionReport(phase, code, message, context) });
};

interface IPreCloseCapability {
  readonly boundaries: ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>>;
  readonly exceptions: ReadonlyArray<Readonly<IYearCloseExceptionAuthority>>;
}

const preCloseCapabilities = new WeakMap<object, Readonly<IPreCloseCapability>>();

export const validateYearPreClose = (value: unknown): YearPreCloseValidationResult => {
  try {
    const source = ownData(value, 'Year pre-close input', [
      'performanceYear', 'configurationVersion', 'expectedYearVersion', 'boundaries', 'exceptions'
    ]);
    const performanceYear = lifecycleYear(source.performanceYear, 'Pre-close year');
    const configurationVersion = text(source.configurationVersion, 'Pre-close configuration version');
    const expectedYearVersion = whole(source.expectedYearVersion, 'Pre-close expected year version');
    if (expectedYearVersion < 1) return fail('HistoryConflict', 'Pre-close requires an existing year version.');
    const boundaries = canonicalBoundaries(source.boundaries);
    const exceptions = canonicalExceptions(source.exceptions);
    const issues: ReadonlyArray<Readonly<IYearCloseIssue>> = Object.freeze(boundaries.flatMap(boundary => {
      const output: IYearCloseIssue[] = [];
      if (boundary.incompleteCount > 0) output.push(Object.freeze({
        issueKey: `${boundary.boundary}:Incomplete`, boundary: boundary.boundary,
        issueType: 'Incomplete' as const, count: boundary.incompleteCount
      }));
      if (boundary.unresolvedCount > 0) output.push(Object.freeze({
        issueKey: `${boundary.boundary}:Unresolved`, boundary: boundary.boundary,
        issueType: 'Unresolved' as const, count: boundary.unresolvedCount
      }));
      return output;
    }));
    const issueKeys = new Set(issues.map(issue => issue.issueKey));
    if (exceptions.some(exception => !issueKeys.has(exception.issueKey))) {
      return fail('MalformedInput', 'Year-close exception does not correspond to a current issue.');
    }
    const covered = new Set(exceptions.map(exception => exception.issueKey));
    const status = issues.length === 0 ? 'Ready'
      : issues.every(issue => covered.has(issue.issueKey)) ? 'ReadyWithExceptions' : 'Blocked';
    const validation: Readonly<IYearPreCloseValidation> = Object.freeze({
      validationId: `PRECLOSE-${performanceYear}-${sha256Hex(JSON.stringify(boundaries)).slice(0, 16)}`,
      performanceYear,
      configurationVersion,
      expectedYearVersion,
      status,
      boundarySnapshotSha256: sha256Hex(JSON.stringify(boundaries)),
      issues,
      acceptedExceptionKeys: Object.freeze(exceptions.map(exception => exception.issueKey))
    });
    if (status !== 'Blocked') preCloseCapabilities.set(validation, Object.freeze({ boundaries, exceptions }));
    return validation;
  } catch (error) {
    return rejected('Validate', error, {});
  }
};

const canonicalCommand = (value: unknown): Readonly<IYearLifecycleTransitionCommand> => {
  const source = ownData(value, 'Year transition command', [
    'commandId', 'idempotencyKey', 'transition', 'performanceYear', 'configurationVersion',
    'expectedYearVersion', 'actor', 'occurredAt', 'reason'
  ]);
  if (source.transition !== 'Open' && source.transition !== 'Close' && source.transition !== 'Reopen') {
    return fail('TransitionInvalid', 'Year transition command is unsupported.');
  }
  return Object.freeze({
    commandId: text(source.commandId, 'Transition command ID'),
    idempotencyKey: text(source.idempotencyKey, 'Transition idempotency key'),
    transition: source.transition,
    performanceYear: lifecycleYear(source.performanceYear, 'Transition year'),
    configurationVersion: text(source.configurationVersion, 'Transition configuration version'),
    expectedYearVersion: whole(source.expectedYearVersion, 'Expected year version'),
    actor: actor(source.actor),
    occurredAt: timestamp(source.occurredAt, 'Transition time'),
    reason: text(source.reason, 'Transition reason')
  });
};

const versionMaterial = (version: Omit<IYearLifecycleHistoryVersion, 'versionSha256'>): object => ({
  yearVersion: version.yearVersion,
  status: version.status,
  transition: version.transition,
  configurationVersion: version.configurationVersion,
  actorId: version.actorId,
  actorEmail: version.actorEmail,
  occurredAt: version.occurredAt,
  reason: version.reason,
  boundarySnapshotSha256: version.boundarySnapshotSha256,
  boundaries: version.boundaries,
  acceptedExceptions: version.acceptedExceptions
});

const canonicalVersion = (value: unknown): Readonly<IYearLifecycleHistoryVersion> => {
  const source = ownData(value, 'Year history version', [
    'yearVersion', 'status', 'transition', 'configurationVersion', 'actorId', 'actorEmail',
    'occurredAt', 'reason', 'boundarySnapshotSha256', 'boundaries', 'acceptedExceptions', 'versionSha256'
  ]);
  const transition = source.transition;
  const status = source.status;
  if ((transition !== 'Open' && transition !== 'Close' && transition !== 'Reopen')
    || (status !== 'Open' && status !== 'Closed')
    || (transition === 'Close' ? status !== 'Closed' : status !== 'Open')) {
    return fail('HistoryConflict', 'Year history transition/status pairing is invalid.');
  }
  const boundaries = canonicalBoundaries(source.boundaries);
  const acceptedExceptions = canonicalExceptions(source.acceptedExceptions);
  const boundarySnapshotSha256 = sha(source.boundarySnapshotSha256, 'History boundary SHA-256');
  if (boundarySnapshotSha256 !== sha256Hex(JSON.stringify(boundaries))) {
    return fail('HashMismatch', 'Year history boundary hash is invalid.');
  }
  const withoutHash: Omit<IYearLifecycleHistoryVersion, 'versionSha256'> = Object.freeze({
    yearVersion: whole(source.yearVersion, 'Year history version'),
    status,
    transition,
    configurationVersion: text(source.configurationVersion, 'History configuration version'),
    actorId: text(source.actorId, 'History actor ID'),
    actorEmail: text(source.actorEmail, 'History actor email'),
    occurredAt: timestamp(source.occurredAt, 'History transition time'),
    reason: text(source.reason, 'History transition reason'),
    boundarySnapshotSha256,
    boundaries,
    acceptedExceptions
  });
  const versionSha256 = sha(source.versionSha256, 'History version SHA-256');
  if (versionSha256 !== sha256Hex(JSON.stringify(versionMaterial(withoutHash)))) {
    return fail('HashMismatch', 'Year history version hash is invalid.');
  }
  return Object.freeze({ ...withoutHash, versionSha256 });
};

const receiptKeys = Object.freeze([
  'receiptId', 'commandId', 'idempotencyKey', 'transition', 'performanceYear', 'configurationVersion',
  'actorId', 'actorEmail', 'occurredAt', 'reason', 'beforeStateRevision', 'afterStateRevision',
  'beforeYearVersion', 'afterYearVersion', 'beforeStateSha256', 'afterStateSha256'
]);

const canonicalReceipt = (value: unknown): Readonly<IYearLifecycleTransitionReceipt> => {
  const source = ownData(value, 'Year transition receipt', receiptKeys);
  if (source.transition !== 'Open' && source.transition !== 'Close' && source.transition !== 'Reopen') {
    return fail('HistoryConflict', 'Receipt transition is invalid.');
  }
  return Object.freeze({
    receiptId: text(source.receiptId, 'Receipt ID'),
    commandId: text(source.commandId, 'Receipt command ID'),
    idempotencyKey: text(source.idempotencyKey, 'Receipt idempotency key'),
    transition: source.transition,
    performanceYear: lifecycleYear(source.performanceYear, 'Receipt year'),
    configurationVersion: text(source.configurationVersion, 'Receipt configuration version'),
    actorId: text(source.actorId, 'Receipt actor ID'),
    actorEmail: text(source.actorEmail, 'Receipt actor email'),
    occurredAt: timestamp(source.occurredAt, 'Receipt transition time'),
    reason: text(source.reason, 'Receipt reason'),
    beforeStateRevision: whole(source.beforeStateRevision, 'Receipt before-state revision'),
    afterStateRevision: whole(source.afterStateRevision, 'Receipt after-state revision'),
    beforeYearVersion: whole(source.beforeYearVersion, 'Receipt before-year version'),
    afterYearVersion: whole(source.afterYearVersion, 'Receipt after-year version'),
    beforeStateSha256: sha(source.beforeStateSha256, 'Receipt before-state SHA-256'),
    afterStateSha256: sha(source.afterStateSha256, 'Receipt after-state SHA-256')
  });
};

const canonicalHistory = (value: unknown): Readonly<IYearLifecycleYearHistory> => {
  const source = ownData(value, 'Year lifecycle history', [
    'performanceYear', 'configurationVersion', 'currentVersion', 'versions'
  ]);
  const performanceYear = lifecycleYear(source.performanceYear, 'History year');
  const configurationVersion = text(source.configurationVersion, 'History configuration version');
  const currentVersion = whole(source.currentVersion, 'Current year version');
  const versions = Object.freeze(denseArray(source.versions, 'Year history versions').map(canonicalVersion));
  if (currentVersion < 1 || versions.length !== currentVersion
    || versions.some((version, index) => version.yearVersion !== index + 1
      || version.configurationVersion !== configurationVersion)) {
    return fail('HistoryConflict', 'Year history versions are missing, reordered or configuration-mismatched.');
  }
  versions.forEach((version, index) => {
    if (index === 0 && version.transition !== 'Open') fail('HistoryConflict', 'Year history must begin with Open.');
    if (index > 0) {
      const previous = versions[index - 1];
      if ((version.transition === 'Close' && previous.status !== 'Open')
        || (version.transition === 'Reopen' && previous.status !== 'Closed')
        || version.transition === 'Open'
        || Date.parse(version.occurredAt) <= Date.parse(previous.occurredAt)) {
        fail('HistoryConflict', 'Year history transition order is invalid.');
      }
    }
  });
  return Object.freeze({ performanceYear, configurationVersion, currentVersion, versions });
};

const canonicalState = (value: unknown): Readonly<IYearLifecycleTransitionState> => {
  const source = ownData(value, 'Year lifecycle transition state', ['schema', 'revision', 'years', 'receipts']);
  if (source.schema !== 'DEMO.YearLifecycleTransitionState') {
    return fail('UnsupportedSchema', 'Year lifecycle transition state schema is invalid.');
  }
  const years = Object.freeze(denseArray(source.years, 'Year lifecycle histories').map(canonicalHistory)
    .sort((left, right) => left.performanceYear - right.performanceYear));
  if (new Set(years.map(history => history.performanceYear)).size !== years.length) {
    return fail('HistoryConflict', 'Transition state contains duplicate year histories.');
  }
  const receipts = Object.freeze(denseArray(source.receipts, 'Year transition receipts').map(canonicalReceipt));
  if (new Set(receipts.map(receipt => receipt.receiptId)).size !== receipts.length
    || new Set(receipts.map(receipt => receipt.commandId)).size !== receipts.length
    || new Set(receipts.map(receipt => receipt.idempotencyKey)).size !== receipts.length) {
    return fail('HistoryConflict', 'Transition state contains duplicate receipt identity.');
  }
  return Object.freeze({
    schema: 'DEMO.YearLifecycleTransitionState' as const,
    revision: whole(source.revision, 'Transition state revision'),
    years,
    receipts
  });
};

const receiptHashMaterial = (receipt: Readonly<IYearLifecycleTransitionReceipt>): object => ({
  receiptId: receipt.receiptId,
  commandId: receipt.commandId,
  idempotencyKey: receipt.idempotencyKey,
  transition: receipt.transition,
  performanceYear: receipt.performanceYear,
  configurationVersion: receipt.configurationVersion,
  actorId: receipt.actorId,
  actorEmail: receipt.actorEmail,
  occurredAt: receipt.occurredAt,
  reason: receipt.reason,
  beforeStateRevision: receipt.beforeStateRevision,
  afterStateRevision: receipt.afterStateRevision,
  beforeYearVersion: receipt.beforeYearVersion,
  afterYearVersion: receipt.afterYearVersion
});

export const yearLifecycleTransitionStateSha256 = (value: unknown): string => {
  const state = canonicalState(value);
  return sha256Hex(JSON.stringify({
    schema: state.schema,
    revision: state.revision,
    years: state.years,
    receipts: state.receipts.map(receiptHashMaterial)
  }));
};

export const createEmptyYearLifecycleTransitionState = (): Readonly<IYearLifecycleTransitionState> => Object.freeze({
  schema: 'DEMO.YearLifecycleTransitionState' as const,
  revision: 0,
  years: Object.freeze([]),
  receipts: Object.freeze([])
});

interface IPlanCapability {
  readonly command: Readonly<IYearLifecycleTransitionCommand>;
  readonly stateSha256: string;
  readonly boundaries: ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>>;
  readonly exceptions: ReadonlyArray<Readonly<IYearCloseExceptionAuthority>>;
}

interface IRecoveryCapability {
  readonly priorState: Readonly<IYearLifecycleTransitionState>;
  readonly appliedStateSha256: string;
  readonly receipt: Readonly<IYearLifecycleTransitionReceipt>;
}

const planCapabilities = new WeakMap<object, Readonly<IPlanCapability>>();
const consumedPlans = new WeakSet<object>();
const recoveryCapabilities = new WeakMap<object, Readonly<IRecoveryCapability>>();
const consumedRecovery = new WeakSet<object>();

const planTransition = (
  commandValue: unknown,
  stateValue: unknown,
  boundariesValue?: unknown,
  validationValue?: unknown
): YearLifecycleTransitionPlanResult => {
  let context: { commandId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    const command = canonicalCommand(commandValue);
    context = {
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      actorId: command.actor.actorId,
      occurredAt: command.occurredAt
    };
    const state = canonicalState(stateValue);
    const sameKey = state.receipts.find(receipt => receipt.idempotencyKey === command.idempotencyKey);
    if (sameKey) {
      if (sameKey.commandId === command.commandId && sameKey.transition === command.transition
        && sameKey.performanceYear === command.performanceYear
        && sameKey.configurationVersion === command.configurationVersion) {
        return Object.freeze({ status: 'Idempotent' as const, receipt: sameKey });
      }
      return fail('IdempotencyConflict', 'Transition idempotency key was used for a different command.');
    }
    if (state.receipts.some(receipt => receipt.commandId === command.commandId)) {
      return fail('DuplicateImport', 'Transition command ID was already applied under another idempotency key.');
    }
    const history = state.years.find(year => year.performanceYear === command.performanceYear);
    let boundaries: ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>>;
    let exceptions: ReadonlyArray<Readonly<IYearCloseExceptionAuthority>> = Object.freeze([]);
    if (command.transition === 'Open') {
      if (history || command.expectedYearVersion !== 0 || boundariesValue === undefined) {
        return fail('TransitionInvalid', 'Open requires a new year, version zero and an initial boundary snapshot.');
      }
      boundaries = canonicalBoundaries(boundariesValue);
    } else {
      if (!history || history.configurationVersion !== command.configurationVersion
        || history.currentVersion !== command.expectedYearVersion) {
        return fail('HistoryConflict', 'Transition year/configuration/version does not match current history.');
      }
      const current = history.versions[history.versions.length - 1];
      if (Date.parse(command.occurredAt) <= Date.parse(current.occurredAt)) {
        return fail('StaleManifest', 'Transition timestamp must be later than the current year version.');
      }
      if (command.transition === 'Close') {
        if (current.status !== 'Open') return fail('TransitionInvalid', 'Only an open year may close.');
        if (!validationValue || typeof validationValue !== 'object') {
          return fail('PreCloseBlocked', 'Close requires a genuine ready pre-close validation.');
        }
        const preClose = validationValue as IYearPreCloseValidation;
        const capability = preCloseCapabilities.get(validationValue);
        if (!capability || preClose.status === 'Blocked'
          || preClose.performanceYear !== command.performanceYear
          || preClose.configurationVersion !== command.configurationVersion
          || preClose.expectedYearVersion !== command.expectedYearVersion) {
          return fail('PreCloseBlocked', 'Pre-close validation is blocked, forged, stale or mismatched.');
        }
        boundaries = capability.boundaries;
        exceptions = capability.exceptions;
        if (exceptions.some(exception => Date.parse(exception.approvedAt) > Date.parse(command.occurredAt))) {
          return fail('StaleManifest', 'Close exception approval must exist before the close transition.');
        }
      } else {
        if (current.status !== 'Closed') return fail('TransitionInvalid', 'Only a closed year may reopen.');
        boundaries = current.boundaries;
      }
    }
    const stateSha256 = yearLifecycleTransitionStateSha256(state);
    const plan: Readonly<IYearLifecycleTransitionPlan> = Object.freeze({
      planId: `TRANSITION-${sha256Hex(`${command.commandId}|${stateSha256}`).slice(0, 20)}`,
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      transition: command.transition,
      performanceYear: command.performanceYear,
      configurationVersion: command.configurationVersion,
      expectedYearVersion: command.expectedYearVersion,
      expectedStateRevision: state.revision,
      expectedStateSha256: stateSha256
    });
    planCapabilities.set(plan, Object.freeze({ command, stateSha256, boundaries, exceptions }));
    return Object.freeze({ status: 'Planned' as const, plan });
  } catch (error) {
    return rejected('Plan', error, context);
  }
};

export const planOpenYear = (
  commandValue: unknown,
  stateValue: unknown,
  initialBoundariesValue: unknown
): YearLifecycleTransitionPlanResult => planTransition(commandValue, stateValue, initialBoundariesValue);

export const planCloseYear = (
  commandValue: unknown,
  stateValue: unknown,
  preCloseValidationValue: unknown
): YearLifecycleTransitionPlanResult => planTransition(commandValue, stateValue, undefined, preCloseValidationValue);

export const planReopenYear = (
  commandValue: unknown,
  stateValue: unknown
): YearLifecycleTransitionPlanResult => planTransition(commandValue, stateValue);

const buildVersion = (
  command: Readonly<IYearLifecycleTransitionCommand>,
  yearVersion: number,
  boundaries: ReadonlyArray<Readonly<IYearCloseBoundarySnapshot>>,
  exceptions: ReadonlyArray<Readonly<IYearCloseExceptionAuthority>>
): Readonly<IYearLifecycleHistoryVersion> => {
  const withoutHash: Omit<IYearLifecycleHistoryVersion, 'versionSha256'> = Object.freeze({
    yearVersion,
    status: command.transition === 'Close' ? 'Closed' as const : 'Open' as const,
    transition: command.transition,
    configurationVersion: command.configurationVersion,
    actorId: command.actor.actorId,
    actorEmail: command.actor.actorEmail,
    occurredAt: command.occurredAt,
    reason: command.reason,
    boundarySnapshotSha256: sha256Hex(JSON.stringify(boundaries)),
    boundaries,
    acceptedExceptions: exceptions
  });
  return canonicalVersion({
    ...withoutHash,
    versionSha256: sha256Hex(JSON.stringify(versionMaterial(withoutHash)))
  });
};

export const applyYearLifecycleTransition = (
  planValue: unknown,
  stateValue: unknown
): YearLifecycleTransitionApplyResult => {
  let context: { commandId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    if (!planValue || typeof planValue !== 'object') return fail('MalformedInput', 'A genuine transition plan is required.');
    const capability = planCapabilities.get(planValue);
    if (!capability) return fail('Unauthorised', 'Transition plan is forged or was not created by this engine.');
    const { command, stateSha256, boundaries, exceptions } = capability;
    context = {
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      actorId: command.actor.actorId,
      occurredAt: command.occurredAt
    };
    if (consumedPlans.has(planValue)) return fail('TransitionReplay', 'Transition plan is single-use and was already applied.');
    const state = canonicalState(stateValue);
    const beforeStateSha256 = yearLifecycleTransitionStateSha256(state);
    if (beforeStateSha256 !== stateSha256
      || state.revision !== (planValue as IYearLifecycleTransitionPlan).expectedStateRevision) {
      return fail('StateConflict', 'Transition state changed after planning.');
    }
    const existing = state.years.find(year => year.performanceYear === command.performanceYear);
    const beforeYearVersion = existing?.currentVersion || 0;
    const afterYearVersion = beforeYearVersion + 1;
    const version = buildVersion(command, afterYearVersion, boundaries, exceptions);
    const nextHistory = canonicalHistory({
      performanceYear: command.performanceYear,
      configurationVersion: command.configurationVersion,
      currentVersion: afterYearVersion,
      versions: (existing?.versions || []).concat([version])
    });
    const nextYears = Object.freeze(state.years.filter(year => year.performanceYear !== command.performanceYear)
      .concat([nextHistory]).sort((left, right) => left.performanceYear - right.performanceYear));
    const receiptBase = {
      receiptId: `TRANSITION-RECEIPT-${sha256Hex(command.commandId).slice(0, 20)}`,
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      transition: command.transition,
      performanceYear: command.performanceYear,
      configurationVersion: command.configurationVersion,
      actorId: command.actor.actorId,
      actorEmail: command.actor.actorEmail,
      occurredAt: command.occurredAt,
      reason: command.reason,
      beforeStateRevision: state.revision,
      afterStateRevision: state.revision + 1,
      beforeYearVersion,
      afterYearVersion,
      beforeStateSha256,
      afterStateSha256: '0'.repeat(64)
    };
    const provisionalReceipt = canonicalReceipt(receiptBase);
    const provisionalState = canonicalState({
      schema: 'DEMO.YearLifecycleTransitionState',
      revision: state.revision + 1,
      years: nextYears,
      receipts: state.receipts.concat([provisionalReceipt])
    });
    const afterStateSha256 = yearLifecycleTransitionStateSha256(provisionalState);
    const receipt = canonicalReceipt({ ...receiptBase, afterStateSha256 });
    const nextState = canonicalState({
      schema: 'DEMO.YearLifecycleTransitionState',
      revision: state.revision + 1,
      years: nextYears,
      receipts: state.receipts.concat([receipt])
    });
    if (yearLifecycleTransitionStateSha256(nextState) !== afterStateSha256) {
      return fail('StateConflict', 'Transition state hash did not stabilise after apply.');
    }
    const recovery: Readonly<IYearLifecycleTransitionRecoveryToken> = Object.freeze({
      recoveryId: `RECOVERY-${receipt.receiptId}`,
      receiptId: receipt.receiptId,
      appliedStateRevision: nextState.revision,
      appliedStateSha256: afterStateSha256,
      priorStateSha256: beforeStateSha256
    });
    consumedPlans.add(planValue);
    recoveryCapabilities.set(recovery, Object.freeze({
      priorState: state,
      appliedStateSha256: afterStateSha256,
      receipt
    }));
    return Object.freeze({ status: 'Applied' as const, state: nextState, receipt, recovery });
  } catch (error) {
    return rejected('Apply', error, context);
  }
};

export const readYearLifecycleHistory = (
  stateValue: unknown,
  performanceYear: YearLifecycleHistoryYear
): Readonly<IYearLifecycleYearHistory> | undefined => canonicalState(stateValue).years.find(
  year => year.performanceYear === performanceYear
);

export const readYearLifecycleVersion = (
  stateValue: unknown,
  performanceYear: YearLifecycleHistoryYear,
  yearVersion: number
): Readonly<IYearLifecycleHistoryVersion> | undefined => readYearLifecycleHistory(
  stateValue, performanceYear
)?.versions.find(version => version.yearVersion === yearVersion);

export const checkOrdinaryYearEdit = (
  stateValue: unknown,
  performanceYearValue: unknown,
  configurationVersionValue: unknown,
  expectedYearVersionValue: unknown
): YearLifecycleEditCheckResult => {
  try {
    const state = canonicalState(stateValue);
    const performanceYear = lifecycleYear(performanceYearValue, 'Edit year');
    const configurationVersion = text(configurationVersionValue, 'Edit configuration version');
    const expectedYearVersion = whole(expectedYearVersionValue, 'Edit expected year version');
    const history = state.years.find(year => year.performanceYear === performanceYear);
    if (!history || history.configurationVersion !== configurationVersion
      || history.currentVersion !== expectedYearVersion) {
      return fail('HistoryConflict', 'Edit year/configuration/version does not match current history.');
    }
    if (history.versions[history.versions.length - 1].status === 'Closed') {
      return fail('ClosedYearImmutable', 'Ordinary editing is forbidden after year close.');
    }
    return Object.freeze({ status: 'Allowed' as const, performanceYear, configurationVersion, yearVersion: expectedYearVersion });
  } catch (error) {
    return rejected('Validate', error, {});
  }
};

export const rollbackYearLifecycleTransition = (
  currentStateValue: unknown,
  recoveryValue: unknown,
  actorValue: unknown,
  rolledBackAtValue: unknown,
  reasonValue: unknown
): YearLifecycleTransitionRollbackResult => {
  let context: { commandId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    const rollbackActor = actor(actorValue);
    const rolledBackAt = timestamp(rolledBackAtValue, 'Transition rollback time');
    const reason = text(reasonValue, 'Transition rollback reason');
    context = { actorId: rollbackActor.actorId, occurredAt: rolledBackAt };
    if (!recoveryValue || typeof recoveryValue !== 'object') return fail('MalformedInput', 'A genuine transition recovery token is required.');
    const capability = recoveryCapabilities.get(recoveryValue);
    if (!capability) return fail('Unauthorised', 'Transition recovery token is forged.');
    context.commandId = capability.receipt.commandId;
    context.idempotencyKey = capability.receipt.idempotencyKey;
    if (consumedRecovery.has(recoveryValue)) return fail('RollbackAlreadyUsed', 'Transition recovery token was already used.');
    const currentState = canonicalState(currentStateValue);
    const currentSha256 = yearLifecycleTransitionStateSha256(currentState);
    if (currentSha256 !== capability.appliedStateSha256
      || currentState.revision !== (recoveryValue as IYearLifecycleTransitionRecoveryToken).appliedStateRevision
      || yearLifecycleTransitionStateSha256(capability.priorState)
        !== (recoveryValue as IYearLifecycleTransitionRecoveryToken).priorStateSha256) {
      return fail('RollbackConflict', 'Transition recovery token is stale or state identity changed.');
    }
    const receipt: Readonly<IYearLifecycleTransitionRollbackReceipt> = Object.freeze({
      rollbackReceiptId: `ROLLBACK-${capability.receipt.receiptId}`,
      receiptId: capability.receipt.receiptId,
      recoveryId: (recoveryValue as IYearLifecycleTransitionRecoveryToken).recoveryId,
      actorId: rollbackActor.actorId,
      actorEmail: rollbackActor.actorEmail,
      rolledBackAt,
      reason,
      removedStateSha256: currentSha256,
      restoredStateSha256: yearLifecycleTransitionStateSha256(capability.priorState)
    });
    consumedRecovery.add(recoveryValue);
    return Object.freeze({ status: 'RolledBack' as const, state: capability.priorState, receipt });
  } catch (error) {
    return rejected('Rollback', error, context);
  }
};
