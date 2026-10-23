import type {
  IStrategyCarryForwardItem,
  IStrategyCarryForwardRecord,
  IStrategyCarryForwardSelection,
  IStrategyCycleCommand,
  IStrategyCycleHistory,
  IStrategyCyclePlan,
  IStrategyCycleReceipt,
  IStrategyCycleRecoveryToken,
  IStrategyCycleRollbackReceipt,
  IStrategyCycleSourceAuthority,
  IStrategyCycleState,
  IStrategyCycleVersion,
  IStrategyOutcomeHistory,
  IStrategyOutcomeInput,
  IStrategyOutcomeVersion,
  IYearLifecycleActor,
  IYearLifecycleExceptionReport,
  StrategyCycleApplyResult,
  StrategyCycleEntityType,
  StrategyCycleOperation,
  StrategyCyclePlanResult,
  StrategyCycleRollbackResult,
  YearLifecycleExceptionCode
} from './YearLifecycleModels';
import { sha256Hex } from './YearLifecycleImportEngine';

class StrategyCycleBoundaryError extends Error {
  public constructor(public readonly code: YearLifecycleExceptionCode, message: string) {
    super(message);
    this.name = 'StrategyCycleBoundaryError';
    Object.setPrototypeOf(this, StrategyCycleBoundaryError.prototype);
  }
}

const fail = (code: YearLifecycleExceptionCode, message: string): never => {
  throw new StrategyCycleBoundaryError(code, message);
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

const sha256 = (value: unknown, label: string): string => {
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
    if (names.some(name => !allowed.has(name))
      || required.some(name => !Object.prototype.hasOwnProperty.call(descriptors, name))) {
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
    if (error instanceof StrategyCycleBoundaryError) throw error;
    return fail('MalformedInput', `${label} could not be inspected safely.`);
  }
};

const denseArray = (value: unknown, label: string): readonly unknown[] => {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length > 0) {
      return fail('MalformedInput', `${label} must be a standard dense array.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || !('value' in lengthDescriptor) || typeof lengthDescriptor.value !== 'number'
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0 || lengthDescriptor.value > 10000) {
      return fail('MalformedInput', `${label} has an invalid length.`);
    }
    const length = lengthDescriptor.value as number;
    const expected = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== expected.size || names.some(name => !expected.has(name))) {
      return fail('MalformedInput', `${label} must be dense and contain no extra properties.`);
    }
    return Object.freeze(Array.from({ length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        return fail('MalformedInput', `${label}[${index}] must be an enumerable data property.`);
      }
      return descriptor.value;
    }));
  } catch (error) {
    if (error instanceof StrategyCycleBoundaryError) throw error;
    return fail('MalformedInput', `${label} could not be inspected safely.`);
  }
};

const actor = (value: unknown): Readonly<IYearLifecycleActor> => {
  const source = ownData(value, 'Strategy cycle actor', ['actorId', 'actorEmail', 'role', 'active']);
  if (source.role !== 'LifecycleAdministrator' || source.active !== true) {
    return fail('Unauthorised', 'An active LifecycleAdministrator is required.');
  }
  const actorId = text(source.actorId, 'Actor ID');
  const actorEmail = text(source.actorEmail, 'Actor email');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(actorEmail)) {
    return fail('MalformedInput', 'Actor email is invalid.');
  }
  return Object.freeze({ actorId, actorEmail, role: 'LifecycleAdministrator' as const, active: true as const });
};

const sourceAuthority = (value: unknown): Readonly<IStrategyCycleSourceAuthority> => {
  const source = ownData(value, 'Strategy source authority', [
    'sourceId', 'sourceVersion', 'sourceSha256', 'approvalReference', 'approved'
  ]);
  if (source.approved !== true) return fail('UnapprovedContent', 'Strategy source must be explicitly approved.');
  return Object.freeze({
    sourceId: text(source.sourceId, 'Strategy source ID'),
    sourceVersion: text(source.sourceVersion, 'Strategy source version'),
    sourceSha256: sha256(source.sourceSha256, 'Strategy source SHA-256'),
    approvalReference: text(source.approvalReference, 'Strategy source approval reference'),
    approved: true as const
  });
};

const operations: readonly StrategyCycleOperation[] = Object.freeze([
  'CreateCycle', 'CreateOutcome', 'UpdateOutcome', 'RetireOutcome', 'CarryForward'
]);
const entityTypes: readonly StrategyCycleEntityType[] = Object.freeze(['Hierarchy', 'KPI', 'Target', 'Mapping']);
const classifications = Object.freeze(['Core', 'Impact', 'NotApplicable'] as const);

export const STRATEGY_CYCLE_PERMISSION_MATRIX: Readonly<Record<StrategyCycleOperation, readonly string[]>> =
  Object.freeze(operations.reduce((matrix, operation) => ({
    ...matrix,
    [operation]: Object.freeze(['LifecycleAdministrator'])
  }), {} as Record<StrategyCycleOperation, readonly string[]>));

export const hasStrategyCyclePermission = (actorValue: unknown, operation: StrategyCycleOperation): boolean => {
  try {
    return operations.includes(operation) && actor(actorValue).role === 'LifecycleAdministrator';
  } catch {
    return false;
  }
};

const command = (value: unknown): Readonly<IStrategyCycleCommand> => {
  const source = ownData(value, 'Strategy cycle command', [
    'commandId', 'idempotencyKey', 'operation', 'cycleId', 'performanceYear', 'expectedCycleVersion',
    'actor', 'occurredAt', 'reason', 'source'
  ]);
  if (!operations.includes(source.operation as StrategyCycleOperation)) {
    return fail('MalformedInput', 'Strategy operation is invalid.');
  }
  if (source.performanceYear !== 2029) return fail('WrongCycle', 'Only the governed 2029 cycle is supported.');
  const canonicalActor = actor(source.actor);
  const operation = source.operation as StrategyCycleOperation;
  if (!hasStrategyCyclePermission(canonicalActor, operation)) {
    return fail('Unauthorised', `Actor is not permitted to perform ${operation}.`);
  }
  return Object.freeze({
    commandId: text(source.commandId, 'Command ID'),
    idempotencyKey: text(source.idempotencyKey, 'Idempotency key'),
    operation,
    cycleId: text(source.cycleId, 'Cycle ID'),
    performanceYear: 2029 as const,
    expectedCycleVersion: whole(source.expectedCycleVersion, 'Expected cycle version'),
    actor: canonicalActor,
    occurredAt: timestamp(source.occurredAt, 'Command time'),
    reason: text(source.reason, 'Command reason'),
    source: sourceAuthority(source.source)
  });
};

const outcomeInput = (value: unknown): Readonly<IStrategyOutcomeInput> => {
  const source = ownData(value, 'Strategy outcome input', [
    'outcomeId', 'title', 'description', 'effectiveCycle', 'effectivePeriod'
  ]);
  if (source.effectiveCycle !== 2029) return fail('WrongCycle', 'Outcome effective cycle must be 2029.');
  return Object.freeze({
    outcomeId: text(source.outcomeId, 'Outcome ID'),
    title: text(source.title, 'Outcome title'),
    description: text(source.description, 'Outcome description'),
    effectiveCycle: 2029 as const,
    effectivePeriod: text(source.effectivePeriod, 'Outcome effective period')
  });
};

const carryItem = (value: unknown): Readonly<IStrategyCarryForwardItem> => {
  const source = ownData(value, 'Carry-forward item', [
    'entityType', 'sourceStableId', 'targetStableId', 'sourceVersion', 'sourceSha256',
    'approvalStatus', 'lifecycleStatus', 'obsolete', 'sourceClassification', 'targetClassification'
  ], ['outcomeId', 'outcomeVersion']);
  if (!entityTypes.includes(source.entityType as StrategyCycleEntityType)) {
    return fail('MalformedInput', 'Carry-forward entity type is invalid.');
  }
  if (source.approvalStatus !== 'Approved') return fail('UnapprovedContent', 'Carry-forward item is not approved.');
  if (source.lifecycleStatus !== 'Active' || source.obsolete !== false) {
    return fail('ObsoleteContent', 'Retired or obsolete items cannot be carried forward.');
  }
  if (!classifications.includes(source.sourceClassification as typeof classifications[number])
    || !classifications.includes(source.targetClassification as typeof classifications[number])) {
    return fail('MalformedInput', 'Carry-forward classification is invalid.');
  }
  if (source.sourceClassification !== source.targetClassification) {
    return fail('ClassificationConversionForbidden', 'Carry-forward cannot convert classification, including Impact to Core.');
  }
  const entityType = source.entityType as StrategyCycleEntityType;
  const outcomeId = source.outcomeId === undefined ? undefined : text(source.outcomeId, 'Mapping outcome ID');
  const outcomeVersion = source.outcomeVersion === undefined ? undefined : whole(source.outcomeVersion, 'Mapping outcome version');
  if ((entityType === 'Mapping') !== (outcomeId !== undefined && outcomeVersion !== undefined && outcomeVersion > 0)) {
    return fail('MappingConflict', 'Only mappings require an exact outcome ID and positive outcome version.');
  }
  return Object.freeze({
    entityType,
    sourceStableId: text(source.sourceStableId, 'Carry-forward source stable ID'),
    targetStableId: text(source.targetStableId, 'Carry-forward target stable ID'),
    sourceVersion: text(source.sourceVersion, 'Carry-forward source version'),
    sourceSha256: sha256(source.sourceSha256, 'Carry-forward source SHA-256'),
    approvalStatus: 'Approved' as const,
    lifecycleStatus: 'Active' as const,
    obsolete: false as const,
    sourceClassification: source.sourceClassification as typeof classifications[number],
    targetClassification: source.targetClassification as typeof classifications[number],
    ...(outcomeId === undefined ? {} : { outcomeId, outcomeVersion })
  });
};

const carrySelection = (value: unknown): Readonly<IStrategyCarryForwardSelection> => {
  const source = ownData(value, 'Carry-forward selection', ['selectionMode', 'items']);
  if (source.selectionMode !== 'Explicit') {
    return fail('AutomaticCarryForwardForbidden', 'Carry-forward selection must be explicit; automatic copying is forbidden.');
  }
  const items = Object.freeze(denseArray(source.items, 'Carry-forward items').map(carryItem));
  if (items.length === 0) return fail('MalformedInput', 'At least one explicit carry-forward item is required.');
  if (new Set(items.map(item => `${item.entityType}|${item.sourceStableId}`)).size !== items.length
    || new Set(items.map(item => `${item.entityType}|${item.targetStableId}`)).size !== items.length) {
    return fail('DuplicateRecord', 'Carry-forward selection contains duplicate source or target identity.');
  }
  return Object.freeze({ selectionMode: 'Explicit' as const, items });
};

const outcomeMaterial = (version: Omit<IStrategyOutcomeVersion, 'versionSha256'>): object => ({ ...version });
const carryMaterial = (record: Omit<IStrategyCarryForwardRecord, 'recordSha256'>): object => ({ ...record });
const cycleMaterial = (version: Omit<IStrategyCycleVersion, 'versionSha256'>): object => ({ ...version });

const canonicalOutcomeVersion = (value: unknown): Readonly<IStrategyOutcomeVersion> => {
  const source = ownData(value, 'Strategy outcome version', [
    'outcomeId', 'outcomeVersion', 'title', 'description', 'effectiveCycle', 'effectivePeriod', 'status',
    'operation', 'actorId', 'actorEmail', 'occurredAt', 'reason', 'sourceId', 'sourceVersion',
    'sourceSha256', 'beforeSha256', 'afterSha256', 'versionSha256'
  ]);
  if (source.effectiveCycle !== 2029 || !['Active', 'Retired'].includes(source.status as string)
    || !['CreateOutcome', 'UpdateOutcome', 'RetireOutcome'].includes(source.operation as string)) {
    return fail('HistoryConflict', 'Outcome version lifecycle metadata is invalid.');
  }
  const withoutHash: Omit<IStrategyOutcomeVersion, 'versionSha256'> = Object.freeze({
    outcomeId: text(source.outcomeId, 'Outcome version ID'),
    outcomeVersion: whole(source.outcomeVersion, 'Outcome version number'),
    title: text(source.title, 'Outcome version title'),
    description: text(source.description, 'Outcome version description'),
    effectiveCycle: 2029 as const,
    effectivePeriod: text(source.effectivePeriod, 'Outcome version effective period'),
    status: source.status as 'Active' | 'Retired',
    operation: source.operation as 'CreateOutcome' | 'UpdateOutcome' | 'RetireOutcome',
    actorId: text(source.actorId, 'Outcome version actor ID'),
    actorEmail: text(source.actorEmail, 'Outcome version actor email'),
    occurredAt: timestamp(source.occurredAt, 'Outcome version time'),
    reason: text(source.reason, 'Outcome version reason'),
    sourceId: text(source.sourceId, 'Outcome version source ID'),
    sourceVersion: text(source.sourceVersion, 'Outcome version source version'),
    sourceSha256: sha256(source.sourceSha256, 'Outcome version source SHA-256'),
    beforeSha256: sha256(source.beforeSha256, 'Outcome before SHA-256'),
    afterSha256: sha256(source.afterSha256, 'Outcome after SHA-256')
  });
  const versionSha256 = sha256(source.versionSha256, 'Outcome version SHA-256');
  if (sha256Hex(JSON.stringify(outcomeMaterial(withoutHash))) !== versionSha256) {
    return fail('HashMismatch', 'Outcome version hash does not match its canonical content.');
  }
  return Object.freeze({ ...withoutHash, versionSha256 });
};

const canonicalOutcomeHistory = (value: unknown): Readonly<IStrategyOutcomeHistory> => {
  const source = ownData(value, 'Strategy outcome history', ['outcomeId', 'currentVersion', 'versions']);
  const outcomeId = text(source.outcomeId, 'Outcome history ID');
  const currentVersion = whole(source.currentVersion, 'Outcome current version');
  const versions = Object.freeze(denseArray(source.versions, 'Outcome versions').map(canonicalOutcomeVersion));
  if (currentVersion < 1 || versions.length !== currentVersion
    || versions.some((version, index) => version.outcomeId !== outcomeId || version.outcomeVersion !== index + 1)) {
    return fail('HistoryConflict', 'Outcome history is missing, reordered or identity-mismatched.');
  }
  versions.forEach((version, index) => {
    if (index === 0 && version.operation !== 'CreateOutcome') fail('HistoryConflict', 'Outcome history must begin with create.');
    if (index > 0 && (version.operation === 'CreateOutcome'
      || Date.parse(version.occurredAt) <= Date.parse(versions[index - 1].occurredAt)
      || versions[index - 1].status === 'Retired')) {
      fail('HistoryConflict', 'Outcome history transition order is invalid.');
    }
  });
  return Object.freeze({ outcomeId, currentVersion, versions });
};

const canonicalCarryRecord = (value: unknown): Readonly<IStrategyCarryForwardRecord> => {
  const source = ownData(value, 'Carry-forward record', [
    'carryForwardId', 'entityType', 'sourceStableId', 'targetStableId', 'sourceVersion', 'sourceSha256',
    'approvalReference', 'classification', 'actorId', 'actorEmail', 'carriedAt', 'reason', 'recordSha256'
  ], ['outcomeId', 'outcomeVersion']);
  if (!entityTypes.includes(source.entityType as StrategyCycleEntityType)
    || !classifications.includes(source.classification as typeof classifications[number])) {
    return fail('HistoryConflict', 'Carry-forward record type or classification is invalid.');
  }
  const entityType = source.entityType as StrategyCycleEntityType;
  const outcomeId = source.outcomeId === undefined ? undefined : text(source.outcomeId, 'Carried mapping outcome ID');
  const outcomeVersion = source.outcomeVersion === undefined ? undefined : whole(source.outcomeVersion, 'Carried mapping outcome version');
  if ((entityType === 'Mapping') !== (outcomeId !== undefined && outcomeVersion !== undefined && outcomeVersion > 0)) {
    return fail('MappingConflict', 'Carried mapping outcome identity is invalid.');
  }
  const withoutHash: Omit<IStrategyCarryForwardRecord, 'recordSha256'> = Object.freeze({
    carryForwardId: text(source.carryForwardId, 'Carry-forward record ID'),
    entityType,
    sourceStableId: text(source.sourceStableId, 'Carried source stable ID'),
    targetStableId: text(source.targetStableId, 'Carried target stable ID'),
    sourceVersion: text(source.sourceVersion, 'Carried source version'),
    sourceSha256: sha256(source.sourceSha256, 'Carried source SHA-256'),
    approvalReference: text(source.approvalReference, 'Carried approval reference'),
    classification: source.classification as typeof classifications[number],
    ...(outcomeId === undefined ? {} : { outcomeId, outcomeVersion }),
    actorId: text(source.actorId, 'Carry-forward actor ID'),
    actorEmail: text(source.actorEmail, 'Carry-forward actor email'),
    carriedAt: timestamp(source.carriedAt, 'Carry-forward time'),
    reason: text(source.reason, 'Carry-forward reason')
  });
  const recordSha256 = sha256(source.recordSha256, 'Carry-forward record SHA-256');
  if (sha256Hex(JSON.stringify(carryMaterial(withoutHash))) !== recordSha256) {
    return fail('HashMismatch', 'Carry-forward record hash does not match its canonical content.');
  }
  return Object.freeze({ ...withoutHash, recordSha256 });
};

const canonicalCycleVersion = (value: unknown): Readonly<IStrategyCycleVersion> => {
  const source = ownData(value, 'Strategy cycle version', [
    'cycleVersion', 'operation', 'cycleId', 'performanceYear', 'status', 'actorId', 'actorEmail',
    'occurredAt', 'reason', 'sourceId', 'sourceVersion', 'sourceSha256', 'beforeCycleSha256',
    'outcomes', 'carriedRecords', 'versionSha256'
  ]);
  if (!operations.includes(source.operation as StrategyCycleOperation)
    || source.performanceYear !== 2029 || source.status !== 'Active') {
    return fail('HistoryConflict', 'Strategy cycle version lifecycle metadata is invalid.');
  }
  const outcomes = Object.freeze(denseArray(source.outcomes, 'Cycle outcomes').map(canonicalOutcomeHistory)
    .sort((left, right) => left.outcomeId.localeCompare(right.outcomeId)));
  const carriedRecords = Object.freeze(denseArray(source.carriedRecords, 'Cycle carry-forward records')
    .map(canonicalCarryRecord).sort((left, right) => left.carryForwardId.localeCompare(right.carryForwardId)));
  if (new Set(outcomes.map(item => item.outcomeId)).size !== outcomes.length
    || new Set(carriedRecords.map(item => item.carryForwardId)).size !== carriedRecords.length
    || new Set(carriedRecords.map(item => `${item.entityType}|${item.targetStableId}`)).size !== carriedRecords.length) {
    return fail('HistoryConflict', 'Cycle version contains duplicate governed identity.');
  }
  carriedRecords.filter(item => item.entityType === 'Mapping').forEach(item => {
    const mapped = outcomes.find(outcome => outcome.outcomeId === item.outcomeId);
    if (!mapped || !mapped.versions.some(version => version.outcomeVersion === item.outcomeVersion)) {
      fail('MappingConflict', 'Mapping does not refer to a preserved outcome version.');
    }
  });
  const withoutHash: Omit<IStrategyCycleVersion, 'versionSha256'> = Object.freeze({
    cycleVersion: whole(source.cycleVersion, 'Cycle version number'),
    operation: source.operation as StrategyCycleOperation,
    cycleId: text(source.cycleId, 'Cycle version ID'),
    performanceYear: 2029 as const,
    status: 'Active' as const,
    actorId: text(source.actorId, 'Cycle version actor ID'),
    actorEmail: text(source.actorEmail, 'Cycle version actor email'),
    occurredAt: timestamp(source.occurredAt, 'Cycle version time'),
    reason: text(source.reason, 'Cycle version reason'),
    sourceId: text(source.sourceId, 'Cycle source ID'),
    sourceVersion: text(source.sourceVersion, 'Cycle source version'),
    sourceSha256: sha256(source.sourceSha256, 'Cycle source SHA-256'),
    beforeCycleSha256: sha256(source.beforeCycleSha256, 'Before cycle SHA-256'),
    outcomes,
    carriedRecords
  });
  const versionSha256 = sha256(source.versionSha256, 'Cycle version SHA-256');
  if (sha256Hex(JSON.stringify(cycleMaterial(withoutHash))) !== versionSha256) {
    return fail('HashMismatch', 'Cycle version hash does not match its canonical content.');
  }
  return Object.freeze({ ...withoutHash, versionSha256 });
};

const canonicalCycleHistory = (value: unknown): Readonly<IStrategyCycleHistory> => {
  const source = ownData(value, 'Strategy cycle history', ['cycleId', 'performanceYear', 'currentVersion', 'versions']);
  if (source.performanceYear !== 2029) return fail('WrongCycle', 'Strategy cycle history is not for 2029.');
  const cycleId = text(source.cycleId, 'Cycle history ID');
  const currentVersion = whole(source.currentVersion, 'Cycle current version');
  const versions = Object.freeze(denseArray(source.versions, 'Cycle versions').map(canonicalCycleVersion));
  if (currentVersion < 1 || versions.length !== currentVersion
    || versions.some((version, index) => version.cycleId !== cycleId || version.cycleVersion !== index + 1)) {
    return fail('HistoryConflict', 'Cycle history is missing, reordered or identity-mismatched.');
  }
  versions.forEach((version, index) => {
    if (index === 0 && version.operation !== 'CreateCycle') fail('HistoryConflict', 'Cycle must begin with CreateCycle.');
    if (index > 0 && (version.operation === 'CreateCycle'
      || Date.parse(version.occurredAt) <= Date.parse(versions[index - 1].occurredAt)
      || version.beforeCycleSha256 !== versions[index - 1].versionSha256)) {
      fail('HistoryConflict', 'Cycle history audit chain is invalid.');
    }
  });
  return Object.freeze({ cycleId, performanceYear: 2029 as const, currentVersion, versions });
};

const canonicalReceipt = (value: unknown): Readonly<IStrategyCycleReceipt> => {
  const source = ownData(value, 'Strategy cycle receipt', [
    'receiptId', 'commandId', 'idempotencyKey', 'operation', 'cycleId', 'performanceYear', 'actorId',
    'actorEmail', 'occurredAt', 'reason', 'sourceId', 'sourceVersion', 'sourceSha256', 'beforeStateRevision',
    'afterStateRevision', 'beforeCycleVersion', 'afterCycleVersion', 'beforeStateSha256', 'afterStateSha256'
  ]);
  if (!operations.includes(source.operation as StrategyCycleOperation) || source.performanceYear !== 2029) {
    return fail('HistoryConflict', 'Strategy receipt operation or cycle is invalid.');
  }
  return Object.freeze({
    receiptId: text(source.receiptId, 'Receipt ID'),
    commandId: text(source.commandId, 'Receipt command ID'),
    idempotencyKey: text(source.idempotencyKey, 'Receipt idempotency key'),
    operation: source.operation as StrategyCycleOperation,
    cycleId: text(source.cycleId, 'Receipt cycle ID'),
    performanceYear: 2029 as const,
    actorId: text(source.actorId, 'Receipt actor ID'),
    actorEmail: text(source.actorEmail, 'Receipt actor email'),
    occurredAt: timestamp(source.occurredAt, 'Receipt time'),
    reason: text(source.reason, 'Receipt reason'),
    sourceId: text(source.sourceId, 'Receipt source ID'),
    sourceVersion: text(source.sourceVersion, 'Receipt source version'),
    sourceSha256: sha256(source.sourceSha256, 'Receipt source SHA-256'),
    beforeStateRevision: whole(source.beforeStateRevision, 'Receipt before state revision'),
    afterStateRevision: whole(source.afterStateRevision, 'Receipt after state revision'),
    beforeCycleVersion: whole(source.beforeCycleVersion, 'Receipt before cycle version'),
    afterCycleVersion: whole(source.afterCycleVersion, 'Receipt after cycle version'),
    beforeStateSha256: sha256(source.beforeStateSha256, 'Receipt before state SHA-256'),
    afterStateSha256: sha256(source.afterStateSha256, 'Receipt after state SHA-256')
  });
};

const canonicalState = (value: unknown): Readonly<IStrategyCycleState> => {
  const source = ownData(value, 'Strategy cycle state', ['schema', 'revision', 'cycles', 'receipts']);
  if (source.schema !== 'DEMO.StrategyCycleState') return fail('UnsupportedSchema', 'Strategy cycle state schema is invalid.');
  const cycles = Object.freeze(denseArray(source.cycles, 'Strategy cycles').map(canonicalCycleHistory)
    .sort((left, right) => left.cycleId.localeCompare(right.cycleId)));
  const receipts = Object.freeze(denseArray(source.receipts, 'Strategy receipts').map(canonicalReceipt));
  if (new Set(cycles.map(item => item.cycleId)).size !== cycles.length
    || new Set(receipts.map(item => item.receiptId)).size !== receipts.length
    || new Set(receipts.map(item => item.commandId)).size !== receipts.length
    || new Set(receipts.map(item => item.idempotencyKey)).size !== receipts.length) {
    return fail('HistoryConflict', 'Strategy state contains duplicate identity.');
  }
  return Object.freeze({
    schema: 'DEMO.StrategyCycleState' as const,
    revision: whole(source.revision, 'Strategy state revision'),
    cycles,
    receipts
  });
};

const receiptHashMaterial = (receipt: Readonly<IStrategyCycleReceipt>): object => ({
  receiptId: receipt.receiptId,
  commandId: receipt.commandId,
  idempotencyKey: receipt.idempotencyKey,
  operation: receipt.operation,
  cycleId: receipt.cycleId,
  performanceYear: receipt.performanceYear,
  actorId: receipt.actorId,
  actorEmail: receipt.actorEmail,
  occurredAt: receipt.occurredAt,
  reason: receipt.reason,
  sourceId: receipt.sourceId,
  sourceVersion: receipt.sourceVersion,
  sourceSha256: receipt.sourceSha256,
  beforeStateRevision: receipt.beforeStateRevision,
  afterStateRevision: receipt.afterStateRevision,
  beforeCycleVersion: receipt.beforeCycleVersion,
  afterCycleVersion: receipt.afterCycleVersion
});

export const strategyCycleStateSha256 = (value: unknown): string => {
  const state = canonicalState(value);
  return sha256Hex(JSON.stringify({
    schema: state.schema,
    revision: state.revision,
    cycles: state.cycles,
    receipts: state.receipts.map(receiptHashMaterial)
  }));
};

export const createEmptyStrategyCycleState = (): Readonly<IStrategyCycleState> => Object.freeze({
  schema: 'DEMO.StrategyCycleState' as const,
  revision: 0,
  cycles: Object.freeze([]),
  receipts: Object.freeze([])
});

type StrategyPayload =
  | { readonly kind: 'None' }
  | { readonly kind: 'Outcome'; readonly outcome: Readonly<IStrategyOutcomeInput> }
  | { readonly kind: 'Retire'; readonly outcomeId: string }
  | { readonly kind: 'CarryForward'; readonly selection: Readonly<IStrategyCarryForwardSelection> };

interface IPlanCapability {
  readonly command: Readonly<IStrategyCycleCommand>;
  readonly stateSha256: string;
  readonly payload: StrategyPayload;
}

interface IRecoveryCapability {
  readonly priorState: Readonly<IStrategyCycleState>;
  readonly appliedStateSha256: string;
  readonly receipt: Readonly<IStrategyCycleReceipt>;
}

const planCapabilities = new WeakMap<object, Readonly<IPlanCapability>>();
const consumedPlans = new WeakSet<object>();
const recoveryCapabilities = new WeakMap<object, Readonly<IRecoveryCapability>>();
const consumedRecovery = new WeakSet<object>();

const rejected = (
  phase: 'Validate' | 'Plan' | 'Apply' | 'Rollback',
  error: unknown,
  context: { cycleId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string }
): { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> } => {
  const boundary = error instanceof StrategyCycleBoundaryError
    ? error
    : new StrategyCycleBoundaryError('MalformedInput', 'Strategy cycle input could not be processed safely.');
  const occurredAt = context.occurredAt && !Number.isNaN(Date.parse(context.occurredAt))
    ? new Date(context.occurredAt).toISOString()
    : '1970-01-01T00:00:00.000Z';
  return Object.freeze({
    status: 'Rejected' as const,
    exception: Object.freeze({
      reportId: `STRATEGY-EXCEPTION-${sha256Hex(`${phase}|${boundary.code}|${context.cycleId || 'UNKNOWN'}|${context.idempotencyKey || 'UNKNOWN'}`).slice(0, 20)}`,
      phase,
      code: boundary.code,
      message: boundary.message,
      manifestId: context.cycleId || 'UNKNOWN',
      idempotencyKey: context.idempotencyKey || 'UNKNOWN',
      actorId: context.actorId || 'UNKNOWN',
      occurredAt
    })
  });
};

const planOperation = (
  commandValue: unknown,
  stateValue: unknown,
  expectedOperation: StrategyCycleOperation,
  payloadFactory: () => StrategyPayload
): StrategyCyclePlanResult => {
  let context: { cycleId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    const governedCommand = command(commandValue);
    context = {
      cycleId: governedCommand.cycleId,
      idempotencyKey: governedCommand.idempotencyKey,
      actorId: governedCommand.actor.actorId,
      occurredAt: governedCommand.occurredAt
    };
    if (governedCommand.operation !== expectedOperation) return fail('MalformedInput', 'Command operation does not match plan operation.');
    const state = canonicalState(stateValue);
    const sameKey = state.receipts.find(receipt => receipt.idempotencyKey === governedCommand.idempotencyKey);
    if (sameKey) {
      if (sameKey.commandId === governedCommand.commandId && sameKey.operation === governedCommand.operation
        && sameKey.cycleId === governedCommand.cycleId && sameKey.sourceId === governedCommand.source.sourceId
        && sameKey.sourceVersion === governedCommand.source.sourceVersion
        && sameKey.sourceSha256 === governedCommand.source.sourceSha256) {
        return Object.freeze({ status: 'Idempotent' as const, receipt: sameKey });
      }
      return fail('IdempotencyConflict', 'Strategy idempotency key was used for a different command.');
    }
    if (state.receipts.some(receipt => receipt.commandId === governedCommand.commandId)) {
      return fail('DuplicateImport', 'Strategy command ID was already applied under another idempotency key.');
    }
    const cycle = state.cycles.find(item => item.cycleId === governedCommand.cycleId);
    if (expectedOperation === 'CreateCycle') {
      if (cycle || governedCommand.expectedCycleVersion !== 0) {
        return fail('DuplicateRecord', 'CreateCycle requires a new cycle at version zero.');
      }
    } else {
      if (!cycle || cycle.currentVersion !== governedCommand.expectedCycleVersion) {
        return fail('HistoryConflict', 'Cycle ID/version does not match current governed history.');
      }
      const current = cycle.versions[cycle.versions.length - 1];
      if (Date.parse(governedCommand.occurredAt) <= Date.parse(current.occurredAt)) {
        return fail('StaleManifest', 'Strategy command time must follow the current cycle version.');
      }
    }
    const payload = payloadFactory();
    const currentVersion = cycle?.versions[cycle.versions.length - 1];
    if (payload.kind === 'Outcome') {
      const existing = currentVersion?.outcomes.find(item => item.outcomeId === payload.outcome.outcomeId);
      if (expectedOperation === 'CreateOutcome' && existing) return fail('DuplicateRecord', 'Outcome stable ID already exists.');
      if (expectedOperation === 'UpdateOutcome' && (!existing || existing.versions[existing.versions.length - 1].status !== 'Active')) {
        return fail('HistoryConflict', 'Only an existing active outcome may be updated.');
      }
    }
    if (payload.kind === 'Retire') {
      const existing = currentVersion?.outcomes.find(item => item.outcomeId === payload.outcomeId);
      if (!existing || existing.versions[existing.versions.length - 1].status !== 'Active') {
        return fail('HistoryConflict', 'Only an existing active outcome may be retired.');
      }
    }
    if (payload.kind === 'CarryForward') {
      const existingTargets = new Set(currentVersion?.carriedRecords.map(item => `${item.entityType}|${item.targetStableId}`) || []);
      payload.selection.items.forEach(item => {
        if (existingTargets.has(`${item.entityType}|${item.targetStableId}`)) {
          fail('DuplicateRecord', 'Carry-forward target stable ID already exists.');
        }
        if (item.entityType === 'Mapping') {
          const mapped = currentVersion?.outcomes.find(outcome => outcome.outcomeId === item.outcomeId);
          if (!mapped || !mapped.versions.some(version => version.outcomeVersion === item.outcomeVersion)) {
            fail('MappingConflict', 'Mapping must bind to an existing exact outcome version.');
          }
        }
      });
    }
    const stateSha256 = strategyCycleStateSha256(state);
    const plan: Readonly<IStrategyCyclePlan> = Object.freeze({
      planId: `STRATEGY-PLAN-${sha256Hex(`${governedCommand.commandId}|${stateSha256}`).slice(0, 20)}`,
      commandId: governedCommand.commandId,
      idempotencyKey: governedCommand.idempotencyKey,
      operation: governedCommand.operation,
      cycleId: governedCommand.cycleId,
      performanceYear: 2029 as const,
      expectedCycleVersion: governedCommand.expectedCycleVersion,
      expectedStateRevision: state.revision,
      expectedStateSha256: stateSha256
    });
    planCapabilities.set(plan, Object.freeze({ command: governedCommand, stateSha256, payload }));
    return Object.freeze({ status: 'Planned' as const, plan });
  } catch (error) {
    return rejected('Plan', error, context);
  }
};

export const planCreateStrategyCycle = (commandValue: unknown, stateValue: unknown): StrategyCyclePlanResult =>
  planOperation(commandValue, stateValue, 'CreateCycle', () => Object.freeze({ kind: 'None' as const }));

export const planCreateStrategyOutcome = (
  commandValue: unknown,
  stateValue: unknown,
  outcomeValue: unknown
): StrategyCyclePlanResult => planOperation(commandValue, stateValue, 'CreateOutcome', () => Object.freeze({
  kind: 'Outcome' as const,
  outcome: outcomeInput(outcomeValue)
}));

export const planUpdateStrategyOutcome = (
  commandValue: unknown,
  stateValue: unknown,
  outcomeValue: unknown
): StrategyCyclePlanResult => planOperation(commandValue, stateValue, 'UpdateOutcome', () => Object.freeze({
  kind: 'Outcome' as const,
  outcome: outcomeInput(outcomeValue)
}));

export const planRetireStrategyOutcome = (
  commandValue: unknown,
  stateValue: unknown,
  outcomeIdValue: unknown
): StrategyCyclePlanResult => planOperation(commandValue, stateValue, 'RetireOutcome', () => Object.freeze({
  kind: 'Retire' as const,
  outcomeId: text(outcomeIdValue, 'Retired outcome ID')
}));

export const planStrategyCarryForward = (
  commandValue: unknown,
  stateValue: unknown,
  selectionValue: unknown
): StrategyCyclePlanResult => planOperation(commandValue, stateValue, 'CarryForward', () => Object.freeze({
  kind: 'CarryForward' as const,
  selection: carrySelection(selectionValue)
}));

const outcomeContentSha256 = (input: Readonly<IStrategyOutcomeInput>, status: 'Active' | 'Retired'): string =>
  sha256Hex(JSON.stringify({
    outcomeId: input.outcomeId,
    title: input.title,
    description: input.description,
    effectiveCycle: input.effectiveCycle,
    effectivePeriod: input.effectivePeriod,
    status
  }));

const buildOutcomeVersion = (
  governedCommand: Readonly<IStrategyCycleCommand>,
  input: Readonly<IStrategyOutcomeInput>,
  prior?: Readonly<IStrategyOutcomeVersion>,
  retire = false
): Readonly<IStrategyOutcomeVersion> => {
  const status = retire ? 'Retired' as const : 'Active' as const;
  const effective: Readonly<IStrategyOutcomeInput> = retire && prior
    ? Object.freeze({
      outcomeId: prior.outcomeId,
      title: prior.title,
      description: prior.description,
      effectiveCycle: 2029 as const,
      effectivePeriod: prior.effectivePeriod
    })
    : input;
  const withoutHash: Omit<IStrategyOutcomeVersion, 'versionSha256'> = Object.freeze({
    outcomeId: effective.outcomeId,
    outcomeVersion: (prior?.outcomeVersion || 0) + 1,
    title: effective.title,
    description: effective.description,
    effectiveCycle: 2029 as const,
    effectivePeriod: effective.effectivePeriod,
    status,
    operation: governedCommand.operation as 'CreateOutcome' | 'UpdateOutcome' | 'RetireOutcome',
    actorId: governedCommand.actor.actorId,
    actorEmail: governedCommand.actor.actorEmail,
    occurredAt: governedCommand.occurredAt,
    reason: governedCommand.reason,
    sourceId: governedCommand.source.sourceId,
    sourceVersion: governedCommand.source.sourceVersion,
    sourceSha256: governedCommand.source.sourceSha256,
    beforeSha256: prior?.afterSha256 || '0'.repeat(64),
    afterSha256: outcomeContentSha256(effective, status)
  });
  return canonicalOutcomeVersion({
    ...withoutHash,
    versionSha256: sha256Hex(JSON.stringify(outcomeMaterial(withoutHash)))
  });
};

const buildCarryRecord = (
  governedCommand: Readonly<IStrategyCycleCommand>,
  item: Readonly<IStrategyCarryForwardItem>
): Readonly<IStrategyCarryForwardRecord> => {
  const withoutHash: Omit<IStrategyCarryForwardRecord, 'recordSha256'> = Object.freeze({
    carryForwardId: `CARRY-${sha256Hex(`${governedCommand.commandId}|${item.entityType}|${item.sourceStableId}|${item.targetStableId}`).slice(0, 20)}`,
    entityType: item.entityType,
    sourceStableId: item.sourceStableId,
    targetStableId: item.targetStableId,
    sourceVersion: item.sourceVersion,
    sourceSha256: item.sourceSha256,
    approvalReference: governedCommand.source.approvalReference,
    classification: item.targetClassification,
    ...(item.outcomeId === undefined ? {} : { outcomeId: item.outcomeId, outcomeVersion: item.outcomeVersion }),
    actorId: governedCommand.actor.actorId,
    actorEmail: governedCommand.actor.actorEmail,
    carriedAt: governedCommand.occurredAt,
    reason: governedCommand.reason
  });
  return canonicalCarryRecord({
    ...withoutHash,
    recordSha256: sha256Hex(JSON.stringify(carryMaterial(withoutHash)))
  });
};

const buildCycleVersion = (
  governedCommand: Readonly<IStrategyCycleCommand>,
  payload: StrategyPayload,
  prior?: Readonly<IStrategyCycleVersion>
): Readonly<IStrategyCycleVersion> => {
  let outcomes = prior?.outcomes || Object.freeze([]) as ReadonlyArray<Readonly<IStrategyOutcomeHistory>>;
  let carriedRecords = prior?.carriedRecords || Object.freeze([]) as ReadonlyArray<Readonly<IStrategyCarryForwardRecord>>;
  if (payload.kind === 'Outcome') {
    const existing = outcomes.find(item => item.outcomeId === payload.outcome.outcomeId);
    const previousVersion = existing?.versions[existing.versions.length - 1];
    const nextVersion = buildOutcomeVersion(governedCommand, payload.outcome, previousVersion);
    const nextHistory = canonicalOutcomeHistory({
      outcomeId: payload.outcome.outcomeId,
      currentVersion: (existing?.currentVersion || 0) + 1,
      versions: (existing?.versions || []).concat([nextVersion])
    });
    outcomes = Object.freeze(outcomes.filter(item => item.outcomeId !== payload.outcome.outcomeId)
      .concat([nextHistory]).sort((left, right) => left.outcomeId.localeCompare(right.outcomeId)));
  } else if (payload.kind === 'Retire') {
    const existing = outcomes.find(item => item.outcomeId === payload.outcomeId);
    if (!existing) return fail('HistoryConflict', 'Outcome retirement history disappeared after planning.');
    const previousVersion = existing.versions[existing.versions.length - 1];
    const retirementInput: Readonly<IStrategyOutcomeInput> = Object.freeze({
      outcomeId: previousVersion.outcomeId,
      title: previousVersion.title,
      description: previousVersion.description,
      effectiveCycle: 2029 as const,
      effectivePeriod: previousVersion.effectivePeriod
    });
    const nextVersion = buildOutcomeVersion(governedCommand, retirementInput, previousVersion, true);
    const nextHistory = canonicalOutcomeHistory({
      outcomeId: existing.outcomeId,
      currentVersion: existing.currentVersion + 1,
      versions: existing.versions.concat([nextVersion])
    });
    outcomes = Object.freeze(outcomes.filter(item => item.outcomeId !== payload.outcomeId)
      .concat([nextHistory]).sort((left, right) => left.outcomeId.localeCompare(right.outcomeId)));
  } else if (payload.kind === 'CarryForward') {
    carriedRecords = Object.freeze(carriedRecords.concat(payload.selection.items.map(item =>
      buildCarryRecord(governedCommand, item))).sort((left, right) => left.carryForwardId.localeCompare(right.carryForwardId)));
  }
  const withoutHash: Omit<IStrategyCycleVersion, 'versionSha256'> = Object.freeze({
    cycleVersion: (prior?.cycleVersion || 0) + 1,
    operation: governedCommand.operation,
    cycleId: governedCommand.cycleId,
    performanceYear: 2029 as const,
    status: 'Active' as const,
    actorId: governedCommand.actor.actorId,
    actorEmail: governedCommand.actor.actorEmail,
    occurredAt: governedCommand.occurredAt,
    reason: governedCommand.reason,
    sourceId: governedCommand.source.sourceId,
    sourceVersion: governedCommand.source.sourceVersion,
    sourceSha256: governedCommand.source.sourceSha256,
    beforeCycleSha256: prior?.versionSha256 || '0'.repeat(64),
    outcomes,
    carriedRecords
  });
  return canonicalCycleVersion({
    ...withoutHash,
    versionSha256: sha256Hex(JSON.stringify(cycleMaterial(withoutHash)))
  });
};

export const applyStrategyCyclePlan = (planValue: unknown, stateValue: unknown): StrategyCycleApplyResult => {
  let context: { cycleId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    if (!planValue || typeof planValue !== 'object') return fail('MalformedInput', 'A genuine strategy plan is required.');
    const capability = planCapabilities.get(planValue);
    if (!capability) return fail('Unauthorised', 'Strategy plan is forged or was not created by this engine.');
    const governedCommand = capability.command;
    context = {
      cycleId: governedCommand.cycleId,
      idempotencyKey: governedCommand.idempotencyKey,
      actorId: governedCommand.actor.actorId,
      occurredAt: governedCommand.occurredAt
    };
    if (consumedPlans.has(planValue)) return fail('TransitionReplay', 'Strategy plan is single-use and was already applied.');
    const state = canonicalState(stateValue);
    const beforeStateSha256 = strategyCycleStateSha256(state);
    const typedPlan = planValue as IStrategyCyclePlan;
    if (beforeStateSha256 !== capability.stateSha256
      || typedPlan.expectedStateSha256 !== capability.stateSha256
      || state.revision !== typedPlan.expectedStateRevision) {
      return fail('StateConflict', 'Strategy state changed after planning.');
    }
    const existing = state.cycles.find(item => item.cycleId === governedCommand.cycleId);
    const priorVersion = existing?.versions[existing.versions.length - 1];
    const nextVersion = buildCycleVersion(governedCommand, capability.payload, priorVersion);
    const nextHistory = canonicalCycleHistory({
      cycleId: governedCommand.cycleId,
      performanceYear: 2029,
      currentVersion: (existing?.currentVersion || 0) + 1,
      versions: (existing?.versions || []).concat([nextVersion])
    });
    const nextCycles = Object.freeze(state.cycles.filter(item => item.cycleId !== governedCommand.cycleId)
      .concat([nextHistory]).sort((left, right) => left.cycleId.localeCompare(right.cycleId)));
    const receiptBase = {
      receiptId: `STRATEGY-RECEIPT-${sha256Hex(governedCommand.commandId).slice(0, 20)}`,
      commandId: governedCommand.commandId,
      idempotencyKey: governedCommand.idempotencyKey,
      operation: governedCommand.operation,
      cycleId: governedCommand.cycleId,
      performanceYear: 2029,
      actorId: governedCommand.actor.actorId,
      actorEmail: governedCommand.actor.actorEmail,
      occurredAt: governedCommand.occurredAt,
      reason: governedCommand.reason,
      sourceId: governedCommand.source.sourceId,
      sourceVersion: governedCommand.source.sourceVersion,
      sourceSha256: governedCommand.source.sourceSha256,
      beforeStateRevision: state.revision,
      afterStateRevision: state.revision + 1,
      beforeCycleVersion: existing?.currentVersion || 0,
      afterCycleVersion: (existing?.currentVersion || 0) + 1,
      beforeStateSha256,
      afterStateSha256: '0'.repeat(64)
    };
    const provisionalReceipt = canonicalReceipt(receiptBase);
    const provisionalState = canonicalState({
      schema: 'DEMO.StrategyCycleState',
      revision: state.revision + 1,
      cycles: nextCycles,
      receipts: state.receipts.concat([provisionalReceipt])
    });
    const afterStateSha256 = strategyCycleStateSha256(provisionalState);
    const receipt = canonicalReceipt({ ...receiptBase, afterStateSha256 });
    const nextState = canonicalState({
      schema: 'DEMO.StrategyCycleState',
      revision: state.revision + 1,
      cycles: nextCycles,
      receipts: state.receipts.concat([receipt])
    });
    if (strategyCycleStateSha256(nextState) !== afterStateSha256) {
      return fail('StateConflict', 'Strategy state hash did not stabilise after apply.');
    }
    const recovery: Readonly<IStrategyCycleRecoveryToken> = Object.freeze({
      recoveryId: `RECOVERY-${receipt.receiptId}`,
      receiptId: receipt.receiptId,
      appliedStateRevision: nextState.revision,
      appliedStateSha256: afterStateSha256,
      priorStateSha256: beforeStateSha256
    });
    consumedPlans.add(planValue);
    recoveryCapabilities.set(recovery, Object.freeze({ priorState: state, appliedStateSha256: afterStateSha256, receipt }));
    return Object.freeze({ status: 'Applied' as const, state: nextState, receipt, recovery });
  } catch (error) {
    return rejected('Apply', error, context);
  }
};

export const readStrategyCycle = (
  stateValue: unknown,
  cycleId: string
): Readonly<IStrategyCycleHistory> | undefined => canonicalState(stateValue).cycles.find(item => item.cycleId === cycleId);

export const readStrategyCycleVersion = (
  stateValue: unknown,
  cycleId: string,
  cycleVersion: number
): Readonly<IStrategyCycleVersion> | undefined => readStrategyCycle(stateValue, cycleId)?.versions.find(
  version => version.cycleVersion === cycleVersion
);

export const readStrategyOutcomeVersion = (
  stateValue: unknown,
  cycleId: string,
  outcomeId: string,
  outcomeVersion: number
): Readonly<IStrategyOutcomeVersion> | undefined => readStrategyCycle(stateValue, cycleId)
  ?.versions.slice(-1)[0].outcomes.find(outcome => outcome.outcomeId === outcomeId)
  ?.versions.find(version => version.outcomeVersion === outcomeVersion);

export const rollbackStrategyCycle = (
  currentStateValue: unknown,
  recoveryValue: unknown,
  actorValue: unknown,
  rolledBackAtValue: unknown,
  reasonValue: unknown
): StrategyCycleRollbackResult => {
  let context: { cycleId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    const rollbackActor = actor(actorValue);
    const rolledBackAt = timestamp(rolledBackAtValue, 'Strategy rollback time');
    const reason = text(reasonValue, 'Strategy rollback reason');
    context = { actorId: rollbackActor.actorId, occurredAt: rolledBackAt };
    if (!recoveryValue || typeof recoveryValue !== 'object') return fail('MalformedInput', 'A genuine strategy recovery token is required.');
    const capability = recoveryCapabilities.get(recoveryValue);
    if (!capability) return fail('Unauthorised', 'Strategy recovery token is forged.');
    context.cycleId = capability.receipt.cycleId;
    context.idempotencyKey = capability.receipt.idempotencyKey;
    if (consumedRecovery.has(recoveryValue)) return fail('RollbackAlreadyUsed', 'Strategy recovery token was already used.');
    const currentState = canonicalState(currentStateValue);
    const currentSha256 = strategyCycleStateSha256(currentState);
    const typedRecovery = recoveryValue as IStrategyCycleRecoveryToken;
    if (currentSha256 !== capability.appliedStateSha256
      || currentState.revision !== typedRecovery.appliedStateRevision
      || strategyCycleStateSha256(capability.priorState) !== typedRecovery.priorStateSha256) {
      return fail('RollbackConflict', 'Strategy recovery token is stale or state identity changed.');
    }
    const receipt: Readonly<IStrategyCycleRollbackReceipt> = Object.freeze({
      rollbackReceiptId: `ROLLBACK-${capability.receipt.receiptId}`,
      receiptId: capability.receipt.receiptId,
      recoveryId: typedRecovery.recoveryId,
      actorId: rollbackActor.actorId,
      actorEmail: rollbackActor.actorEmail,
      rolledBackAt,
      reason,
      removedStateSha256: currentSha256,
      restoredStateSha256: strategyCycleStateSha256(capability.priorState)
    });
    consumedRecovery.add(recoveryValue);
    return Object.freeze({ status: 'RolledBack' as const, state: capability.priorState, receipt });
  } catch (error) {
    return rejected('Rollback', error, context);
  }
};
