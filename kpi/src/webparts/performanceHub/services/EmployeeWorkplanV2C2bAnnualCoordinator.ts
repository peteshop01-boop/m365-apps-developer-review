/**
 * Production tenant-neutral coordinator between the native adapter's immutable source read and
 * the settled annual planners. It performs no I/O except through the injected adapter and creates
 * no journal or effect until source, actor, route, subject and client CAS all reconcile.
 */
import type { IEmployeeV2AnnualAdmissionEnvelope } from './EmployeeWorkplanV2CommandTransport';
import { assertCommandSourcePairV1 } from './C2bCommandSourceStorageV1';
import type {
  IC2bNativePlanningObservations,
  IC2bNativeSourceObservation,
  IEmployeeWorkplanV2C2bNativeAdapter
} from './EmployeeWorkplanV2C2bNativeAdapter';
import { canonicaliseC2b, cloneC2b, type C2bCommandPlan } from './TestPilotCommandAdmissionC2b';
import {
  planApproveAndLockWorkplanC2b,
  planCreateWorkplanAmendmentC2b,
  planCreateWorkplanDraftC2b,
  planRequestWorkplanChangesC2b,
  planSetCoreWeightingC2b,
  planSubmitWorkplanC2b,
  planUpdateWorkplanDraftC2b,
  planUpsertBehaviourCommitmentC2b,
  planUpsertCoreContributionC2b,
  planUpsertPersonalItemC2b,
  type C2bTrustedCommandSource
} from './TestPilotCommandAdmissionC2bHandlers';

type C2bAnnualCommandType = IEmployeeV2AnnualAdmissionEnvelope['binding']['commandType']
  | 'UpsertBehaviourCommitmentV2';

const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const email = (value: string): string => value.trim().toLowerCase();
const same = (left: unknown, right: unknown): boolean => canonicaliseC2b(left) === canonicaliseC2b(right);
const fail = (message: string): never => { throw new Error(`C2B_ADMITTED_SOURCE_REJECTED: ${message}`); };
const required = <T,>(value: T | undefined, label: string): T => value === undefined
  ? fail(`trusted ${label} is missing.`) : value;

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function expectedRoute(commandType: C2bAnnualCommandType): 'Employee' | 'Manager' {
  return commandType === 'RequestWorkplanChanges' || commandType === 'ApproveAndLockWorkplan'
    || commandType === 'CreateWorkplanAmendmentV2' ? 'Manager' : 'Employee';
}

function expectedSubjectType(commandType: C2bAnnualCommandType): 'Workplan' | 'WorkplanItem' {
  return commandType === 'UpsertCoreContributionV2' || commandType === 'UpsertPersonalItemV2'
    || commandType === 'UpsertBehaviourCommitmentV2'
    ? 'WorkplanItem' : 'Workplan';
}

function sourceIdentity(value: IC2bNativeSourceObservation): unknown {
  const { commandSource, ...original } = value;
  if (!commandSource) return original;
  const identity = { version: commandSource.version, kind: commandSource.kind,
    response: { requestUrl: commandSource.response.requestUrl, responseUrl: commandSource.response.responseUrl,
      status: commandSource.response.status, headers: commandSource.response.headers.filter(([name]) =>
      ['content-type', 'content-length', 'content-encoding', 'etag'].includes(name.toLowerCase())) },
    capturedRawSHA256: commandSource.capturedRawSHA256, physicalFieldsSHA256: commandSource.physicalFieldsSHA256,
    logicalBytesSHA256: commandSource.logicalBytesSHA256, ...(commandSource.acceptance ? { acceptance: commandSource.acceptance } : {}) };
  // Byte domains are checked independently. Never serialise typed buffers as huge numeric-key JSON objects.
  return { ...original, commandSource: identity };
}

async function assertMatchedSource(first: IC2bNativeSourceObservation, second: IC2bNativeSourceObservation,
  requestedSource: C2bTrustedCommandSource): Promise<Readonly<IC2bNativeSourceObservation>> {
  if ((first.commandSource === undefined) !== (second.commandSource === undefined)) return fail('mixed command source versions.');
  if (first.commandSource !== undefined) {
    await assertCommandSourcePairV1(first); await assertCommandSourcePairV1(second);
  }
  if (!same(sourceIdentity(first), sourceIdentity(second))) return fail('the immutable source changed between its two reads.');
  if (!same(first.source, requestedSource) || first.sourceRowVersion !== requestedSource.itemVersion
    || !nonBlank(first.sourceETag) || first.sourceETag === '*' || !nonBlank(first.authorEmail)) {
    return fail('the observed source identity, version, ETag or Author is stale or incomplete.');
  }
  const binding = first.envelope?.binding;
  if (first.envelope?.schemaVersion !== 'kcf.kpi.test-command.v2' || !binding
    || first.route !== expectedRoute(binding.commandType)
    || binding.subjectType !== expectedSubjectType(binding.commandType)) {
    return fail('the admitted command route or subject type is crossed or unsupported.');
  }
  if (first.commandSource) {
    const { commandSource, ...original } = first;
    return Object.freeze({ ...freeze(cloneC2b(original)), commandSource });
  }
  return freeze(cloneC2b(first));
}

function assertPlanningBinding(admitted: Readonly<IC2bNativeSourceObservation>,
  observations: IC2bNativePlanningObservations): void {
  const binding = admitted.envelope.binding;
  const expected = admitted.envelope.expected;
  const workplanKey = `${binding.personKey}|${binding.performanceYear}`;
  if (binding.workplanKey !== workplanKey || binding.personKey !== observations.employee.personKey
    || binding.performanceYear !== observations.configuration.performanceYear
    || email(admitted.authorEmail) !== email(observations.actor.email)) {
    return fail('source Author, employee identity or annual configuration does not reconcile.');
  }
  const actorKey = admitted.route === 'Employee' ? observations.employee.personKey
    : binding.commandType === 'CreateWorkplanAmendmentV2' ? observations.actor.personKey
      : observations.manager.personKey;
  if (observations.actor.personKey !== actorKey) return fail('the trusted actor is crossed with another route.');

  if (binding.commandType === 'CreateWorkplanDraft') {
    if (binding.subjectKey !== workplanKey || expected.header.presence !== 'Absent'
      || expected.header.token !== '0' || expected.header.etag !== null
      || expected.item.presence !== 'NotApplicable' || observations.header !== undefined
      || observations.currentItem !== undefined || observations.allocatedItemKey !== undefined) {
      return fail('Create header absence, subject or CAS observations do not reconcile.');
    }
    return;
  }

  const header = required(observations.header, 'Workplan header observation');
  if (expected.header.presence !== 'Present' || expected.header.token !== String(header.rowVersionToken)
    || expected.header.etag !== header.etag || header.workplanKey !== workplanKey
    || header.personKey !== binding.personKey || header.performanceYear !== binding.performanceYear) {
    return fail('the client header CAS is stale or crossed with another Workplan.');
  }
  if (binding.subjectType === 'Workplan') {
    if (binding.subjectKey !== workplanKey || expected.item.presence !== 'NotApplicable'
      || observations.currentItem !== undefined || observations.allocatedItemKey !== undefined) {
      return fail('the Workplan subject or non-applicable item CAS is crossed.');
    }
    return;
  }

  const matchingItems = observations.allItems.filter(item => item.workplanItemKey === binding.subjectKey);
  if (expected.item.presence === 'Present') {
    const item = required(observations.currentItem, 'current Workplan Item observation');
    if (item.workplanItemKey !== binding.subjectKey || item.workplanKey !== workplanKey
      || item.personKey !== binding.personKey || item.performanceYear !== binding.performanceYear
      || item.etag !== expected.item.etag || matchingItems.length !== 1 || !same(item, matchingItems[0])) {
      return fail('the client item CAS or Workplan Item subject is stale or crossed.');
    }
  } else if (expected.item.presence === 'Absent') {
    if (observations.currentItem !== undefined || matchingItems.length !== 0
      || observations.allocatedItemKey !== binding.subjectKey) {
      return fail('the admitted item create is not bound to one trusted allocated subject key.');
    }
  } else {
    return fail('the Workplan Item route has no authoritative item CAS state.');
  }
}

function planFromTrustedObservations(admitted: Readonly<IC2bNativeSourceObservation>,
  observations: IC2bNativePlanningObservations, processedAt: string): C2bCommandPlan {
  const binding = admitted.envelope.binding;
  const commandType = binding.commandType as C2bAnnualCommandType;
  const command = { commandKey: binding.commandKey, commandType,
    personKey: binding.personKey, performanceYear: binding.performanceYear, payload: cloneC2b(admitted.envelope.payload) };
  const acl = { current: observations.currentAcls };
  switch (commandType) {
    case 'CreateWorkplanDraft':
      return planCreateWorkplanDraftC2b(command, admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, acl);
    case 'UpdateWorkplanDraftV2':
      return planUpdateWorkplanDraftC2b(command, admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, required(observations.header, 'header'),
        observations.allItems, processedAt, acl);
    case 'UpsertCoreContributionV2':
      return planUpsertCoreContributionC2b(command, admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, required(observations.header, 'header'),
        observations.currentItem, observations.allItems, processedAt, acl, observations.catalogueItem,
        observations.allocatedItemKey ? { workplanItemKey: observations.allocatedItemKey } : undefined);
    case 'UpsertPersonalItemV2':
      return planUpsertPersonalItemC2b(command, admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, required(observations.header, 'header'),
        observations.currentItem, observations.allItems, processedAt, acl,
        observations.allocatedItemKey ? { workplanItemKey: observations.allocatedItemKey } : undefined);
    case 'UpsertBehaviourCommitmentV2': {
      return planUpsertBehaviourCommitmentC2b(command, admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, required(observations.header, 'header'),
        observations.currentItem, observations.allItems, processedAt, acl,
        required(observations.behaviourV2, 'Behaviour v02 framework/person assignment/catalogue'),
        observations.allocatedItemKey ? { workplanItemKey: observations.allocatedItemKey } : undefined);
    }
    case 'SetCoreWeightingV2':
      return planSetCoreWeightingC2b(command, admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, required(observations.header, 'header'),
        observations.allItems, processedAt, acl);
    case 'SubmitWorkplan':
      return planSubmitWorkplanC2b(canonicaliseC2b(command), admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, required(observations.header, 'header'),
        observations.allItems, required(observations.readiness, 'submission readiness'), processedAt, acl);
    case 'RequestWorkplanChanges':
      return planRequestWorkplanChangesC2b(command, admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, required(observations.header, 'header'),
        observations.allItems, processedAt, acl);
    case 'ApproveAndLockWorkplan':
      return planApproveAndLockWorkplanC2b(command, admitted.authorEmail, observations.employee,
        observations.manager, observations.configuration, required(observations.header, 'header'),
        observations.allItems, required(observations.readiness, 'approval readiness'), processedAt, acl);
    case 'CreateWorkplanAmendmentV2':
      return planCreateWorkplanAmendmentC2b(command, admitted.authorEmail, observations.actor,
        observations.employee, observations.manager, observations.configuration,
        required(observations.header, 'header'), observations.allItems, processedAt, acl,
        observations.controlCases, admitted.source);
  }
}

export async function createEmployeeWorkplanV2C2bAnnualPlan(
  adapter: IEmployeeWorkplanV2C2bNativeAdapter,
  source: C2bTrustedCommandSource,
  processedAt: string
): Promise<C2bCommandPlan> {
  const doubleRead = await adapter.readCommandSourceTwice(source);
  const admitted = await assertMatchedSource(doubleRead.first, doubleRead.second, source);
  const immutableAdmission = canonicaliseC2b(sourceIdentity(admitted));
  // The native reader's enclosing observations may remain mutable across async SHA-256 checks.
  // Revalidate BOTH original observations and their final identities before any planning I/O.
  if (admitted.commandSource) {
    await assertCommandSourcePairV1(doubleRead.first);
    await assertCommandSourcePairV1(doubleRead.second);
    if (!same(sourceIdentity(doubleRead.first), sourceIdentity(admitted))
      || !same(sourceIdentity(doubleRead.second), sourceIdentity(admitted))) {
      return fail('the original source drifted after the immutable admission snapshot.');
    }
  }
  const observations = await adapter.readPlanningObservations(admitted);
  if (canonicaliseC2b(sourceIdentity(admitted)) !== immutableAdmission) return fail('the admitted source mutated during planning reads.');
  if (admitted.commandSource) await assertCommandSourcePairV1(admitted);
  assertPlanningBinding(admitted, observations);
  return planFromTrustedObservations(admitted, observations, processedAt);
}
