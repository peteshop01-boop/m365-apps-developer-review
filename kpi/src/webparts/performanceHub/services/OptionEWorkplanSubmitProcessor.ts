import {
  isCanonicalOptionESubmitUuid,
  optionERequestKey,
  optionERequestFieldsEqual,
  validateOptionESubmitPayload,
  type IOptionEAuthoritativeReferenceReadback,
  type IOptionEAutomationPrincipalIds,
  type IOptionEAclAssignmentTuple,
  type IOptionEAclTargetAssignmentSet,
  type IOptionEAclVerification,
  type IOptionECanonicalDraftDto,
  type IOptionEPeopleRow,
  type IOptionEProtectedWorkplanDto,
  type IOptionESubmitRoleIds,
  type IOptionESubmitAudit,
  type IOptionESubmitAuditWrite,
  type IOptionESubmitOperation,
  type IOptionESubmitRequestReadback,
  type IOptionESubmitSnapshot,
  type IOptionEWorkplanSubmitPayload,
  type OptionESubmitCheckpoint,
  type OptionESubmitOutcome
} from '../models/OptionEWorkplanSubmitModels';

export const OPTION_E_CONTENT_CONNECTION_REFERENCE = 'kcfkpi_optione_contentprocessor_sp' as const;
export const OPTION_E_ACL_CONNECTION_REFERENCE = 'kcfkpi_optione_aclreconciler_sp' as const;
export const OPTION_E_SUBMIT_PROCESSOR_IDENTITY = 'KCFKPIOptionESubmitProcessorV1' as const;

export interface IOptionEControlPatch {
  state?: 'Draft' | 'ChangesRequested' | 'Submitted';
  transitionStatus?: 'Ready' | 'Submitting' | 'AclPending' | 'RecoveryHold';
  pendingRequestKey?: string;
  currentSubmittedSnapshotKey?: string;
  aclEpoch?: number;
  lastOperationKey?: string;
}

export interface IOptionESubmitAclContext {
  request: IOptionESubmitRequestReadback;
  actor: IOptionEPeopleRow;
  manager: IOptionEPeopleRow;
  control: IOptionEProtectedWorkplanDto;
  snapshotKey: string;
  automationPrincipalIds: IOptionEAutomationPrincipalIds;
  roleIds: IOptionESubmitRoleIds;
  connectionReference: typeof OPTION_E_ACL_CONNECTION_REFERENCE;
}

export interface IOptionESubmitProcessorStore {
  sha256(value: string): Promise<string>;
  readRequest(requestKey: string): Promise<IOptionESubmitRequestReadback | undefined>;
  findActivePeopleByEmail(email: string): Promise<readonly IOptionEPeopleRow[]>;
  findActivePeopleByPersonKey(personKey: string): Promise<readonly IOptionEPeopleRow[]>;
  findWorkplanByActorAndDraft(personKey: string, draftItemId: number): Promise<readonly IOptionEProtectedWorkplanDto[]>;
  readAuthoritativeDraft(draftItemId: number): Promise<readonly IOptionECanonicalDraftDto[]>;
  readCurrentGovernedReferences(
    payload: IOptionEWorkplanSubmitPayload,
    personKey: string,
    performanceYear: number
  ): Promise<IOptionEAuthoritativeReferenceReadback>;
  readAutomationPrincipalIds(): Promise<IOptionEAutomationPrincipalIds>;
  readSubmitRoleIds(): Promise<IOptionESubmitRoleIds>;
  readOperation(operationKey: string): Promise<IOptionESubmitOperation | undefined>;
  createOperation(operation: Omit<IOptionESubmitOperation, 'etag'>): Promise<IOptionESubmitOperation>;
  updateOperation(
    operationKey: string,
    expectedEtag: string,
    patch: Partial<Omit<IOptionESubmitOperation, 'operationKey' | 'requestKey' | 'etag'>>
  ): Promise<IOptionESubmitOperation>;
  readControl(workplanKey: string): Promise<IOptionEProtectedWorkplanDto | undefined>;
  compareAndSwapControl(
    workplanKey: string,
    expectedEtag: string,
    patch: IOptionEControlPatch
  ): Promise<IOptionEProtectedWorkplanDto>;
  readSnapshot(snapshotKey: string): Promise<IOptionESubmitSnapshot | undefined>;
  createSnapshot(snapshot: IOptionESubmitSnapshot): Promise<IOptionESubmitSnapshot>;
  readAudit(auditKey: string): Promise<IOptionESubmitAudit | undefined>;
  createAudit(audit: IOptionESubmitAuditWrite): Promise<IOptionESubmitAudit>;
  frameworkSnapshot(version: string): Promise<string>;
  catalogueSnapshot(version: string): Promise<string>;
  applyAndReadBackAcl(context: IOptionESubmitAclContext): Promise<IOptionEAclVerification>;
  readBackAcl(context: IOptionESubmitAclContext): Promise<IOptionEAclVerification>;
  revokeUnverifiedManager(context: IOptionESubmitAclContext): Promise<void>;
  now(): string;
}

export interface IOptionESubmitProcessorHooks {
  afterCheckpoint?(checkpoint: OptionESubmitCheckpoint): void;
}

export interface IOptionESubmitProcessResult {
  requestKey: string;
  operationKey?: string;
  checkpoint?: OptionESubmitCheckpoint;
  outcome: OptionESubmitOutcome;
  errorCode?: string;
}

interface IAuthority {
  request: IOptionESubmitRequestReadback;
  payload: IOptionEWorkplanSubmitPayload;
  actor: IOptionEPeopleRow;
  manager: IOptionEPeopleRow;
  control: IOptionEProtectedWorkplanDto;
  automationPrincipalIds: IOptionEAutomationPrincipalIds;
  roleIds: IOptionESubmitRoleIds;
}

export class OptionESubmitNotDurablyTerminalError extends Error {
  public constructor(public readonly requestKey: string, public readonly errorCode: string) {
    super(`${errorCode}:${requestKey}`);
    this.name = 'OptionESubmitNotDurablyTerminalError';
    Object.setPrototypeOf(this, OptionESubmitNotDurablyTerminalError.prototype);
  }
}

const checkpoints: readonly OptionESubmitCheckpoint[] = [
  'Validated', 'ControlClaimed', 'SnapshotWritten', 'AuditWritten', 'ControlPointed', 'AclVerified', 'Completed'
];
const rank = (checkpoint: OptionESubmitCheckpoint): number => checkpoints.indexOf(checkpoint);
const operationFields: ReadonlyArray<keyof Omit<IOptionESubmitOperation, 'etag'>> = [
  'operationKey', 'requestKey', 'workplanKey', 'personKey', 'performanceYear', 'attemptCount',
  'processorIdentity', 'expectedControlEtag', 'observedControlEtag', 'checkpoint', 'outcome',
  'errorCode', 'errorDetail', 'createdSnapshotKey', 'createdAuditKey', 'createdAuditEventAt'
];
const normalise = (value: string): string => value.trim().toLowerCase();
const exactRequest = (left: IOptionESubmitRequestReadback, right: IOptionESubmitRequestReadback): boolean =>
  optionERequestFieldsEqual(left, right) && left.id === right.id && left.etag === right.etag
  && normalise(left.createdByEmail) === normalise(right.createdByEmail);
const exactPeople = (rows: readonly IOptionEPeopleRow[]): rows is readonly [IOptionEPeopleRow] =>
  rows.length === 1 && rows[0].active;
const exactSnapshot = (left: IOptionESubmitSnapshot, right: IOptionESubmitSnapshot): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const trustedTimestamp = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
};
const auditClockBound = (eventAt: string, nativeCreatedAt: string): boolean =>
  trustedTimestamp(eventAt) && trustedTimestamp(nativeCreatedAt)
  && Math.abs(Date.parse(eventAt) - Date.parse(nativeCreatedAt)) <= 300000;
const exactAudit = (actual: IOptionESubmitAudit, expected: IOptionESubmitAuditWrite): boolean => {
  const readback = actual as unknown as Record<string, unknown>;
  return auditClockBound(actual.eventAt, actual.nativeCreatedAt)
    && Object.keys(actual).length === Object.keys(expected).length + 1
    && Object.entries(expected).every(([key, value]) => readback[key] === value);
};
const canonicalOperation = (operation: IOptionESubmitOperation): boolean => {
  const checkpointRank = rank(operation.checkpoint);
  if (checkpointRank < 0 || !Number.isInteger(operation.attemptCount) || operation.attemptCount < 1
    || !operation.etag.trim() || !operation.expectedControlEtag?.trim()) return false;
  if (checkpointRank >= rank('SnapshotWritten')) {
    if (!operation.createdSnapshotKey?.trim()) return false;
  } else if (operation.createdSnapshotKey !== undefined) return false;
  if (checkpointRank >= rank('AuditWritten')) {
    if (!operation.createdAuditKey?.trim() || !operation.createdAuditEventAt
      || !trustedTimestamp(operation.createdAuditEventAt)) return false;
  } else if (operation.createdAuditKey !== undefined || operation.createdAuditEventAt !== undefined) return false;
  if (operation.outcome === 'Running' || operation.outcome === 'Completed') {
    if (operation.errorCode !== undefined || operation.errorDetail !== undefined) return false;
    return operation.outcome === 'Running' ? operation.checkpoint !== 'Completed' : operation.checkpoint === 'Completed';
  }
  return (operation.outcome === 'Rejected' || operation.outcome === 'RecoveryHold')
    && operation.checkpoint !== 'Completed'
    && Boolean(operation.errorCode?.trim()) && Boolean(operation.errorDetail?.trim());
};
const exactOperationState = (actual: IOptionESubmitOperation, expected: IOptionESubmitOperation): boolean =>
  canonicalOperation(actual) && operationFields.every(field => actual[field] === expected[field]);
const exactDraft = (left: IOptionECanonicalDraftDto, right: IOptionECanonicalDraftDto): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const exactControl = (left: IOptionEProtectedWorkplanDto, right: IOptionEProtectedWorkplanDto): boolean =>
  JSON.stringify(left) === JSON.stringify(right);
const positiveInteger = (value: number): boolean => Number.isInteger(value) && value > 0;

const selectedCoreReferenceDigestInput = (
  payload: IOptionEWorkplanSubmitPayload,
  performanceYear: number
): string => payload.core.entries.map(entry =>
  `${entry.kpiId}|${entry.kpiVersionKey}|${entry.targetVersionKey}|${performanceYear}`
).sort().join('\n');

const exactDate = (value: string | undefined): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const effectiveAt = (asOf: string, effectiveFrom: string, effectiveTo?: string): boolean =>
  exactDate(asOf) && exactDate(effectiveFrom) && effectiveFrom <= asOf
  && (effectiveTo === undefined || (exactDate(effectiveTo) && effectiveTo >= asOf));

const validateGovernedBehaviourExtensionReferences = (
  payload: IOptionEWorkplanSubmitPayload,
  actorPersonKey: string,
  readback: IOptionEAuthoritativeReferenceReadback
): boolean => {
  const extension = payload.behaviours.governedExtension;
  if (!extension) return true;
  const authority = readback.governedBehaviourAuthority;
  const headlines = readback.governedBehaviourHeadlines;
  const focuses = readback.governedBehaviourFocuses;
  const targets = readback.governedBehaviourTargets;
  const assignment = readback.personAssignments[0];
  if (!authority || !headlines || !focuses || !targets || !assignment
    || assignment.personKey !== actorPersonKey || assignment.roleLevelCode !== extension.roleLevelCode
    || authority.catalogueId !== extension.authority.catalogueId
    || authority.catalogueVersion !== extension.authority.catalogueVersion
    || authority.catalogueRevision !== extension.authority.catalogueRevision
    || authority.catalogueEtag !== extension.authority.catalogueEtag
    || authority.catalogueContentSha256 !== extension.authority.catalogueContentSha256
    || authority.approvalReference !== extension.authority.approvalReference
    || authority.published !== true || authority.immutable !== true
    || !effectiveAt(authority.asOfDate, authority.effectiveFrom, authority.effectiveTo)
    || extension.immutableSelectionSnapshots !== true
    || extension.legacyTargetRatingWeightFieldsWritten !== false
    || extension.deliveryArithmeticAffected !== false
    || headlines.length !== extension.headlines.length) return false;

  if (!extension.headlines.every((headline, index) => {
    const trusted = headlines[index];
    return trusted?.behaviourKey === headline.behaviourKey
      && trusted.headlineTitle === headline.headlineTitle && trusted.governedOrder === index + 1;
  })) return false;

  const snapshots = extension.headlines.flatMap(headline => headline.selections);
  return snapshots.every(snapshot => {
    if (snapshot.catalogueId !== authority.catalogueId
      || snapshot.catalogueVersion !== authority.catalogueVersion
      || snapshot.catalogueRevision !== authority.catalogueRevision
      || snapshot.catalogueEtag !== authority.catalogueEtag
      || snapshot.catalogueContentSha256 !== authority.catalogueContentSha256
      || snapshot.roleLevelCode !== extension.roleLevelCode) return false;
    const matchingFocus = focuses.filter(focus => focus.behaviourKey === snapshot.behaviourKey
      && focus.focusKey === snapshot.focusKey && focus.focusTitle === snapshot.focusTitle
      && focus.roleLevelCode === snapshot.roleLevelCode && focus.status === 'Published'
      && effectiveAt(authority.asOfDate, focus.effectiveFrom, focus.effectiveTo));
    if (matchingFocus.length !== 1) return false;
    if (snapshot.source === 'Own') {
      return snapshot.targetKey === undefined && snapshot.selectedWording === snapshot.myCommitment;
    }
    return targets.filter(target => target.targetKey === snapshot.targetKey
      && target.targetKey === snapshot.selectionKey && target.behaviourKey === snapshot.behaviourKey
      && target.focusKey === snapshot.focusKey && target.focusTitle === snapshot.focusTitle
      && target.roleLevelCode === snapshot.roleLevelCode && target.selectedWording === snapshot.selectedWording
      && target.status === 'Published'
      && effectiveAt(authority.asOfDate, target.effectiveFrom, target.effectiveTo)).length === 1;
  });
};

const validateAuthoritativeReferences = (
  payload: IOptionEWorkplanSubmitPayload,
  actorPersonKey: string,
  performanceYear: number,
  readback: IOptionEAuthoritativeReferenceReadback
): boolean => {
  if (readback.coreKpis.length !== payload.core.entries.length
    || readback.coreTargets.length !== payload.core.entries.length
    || !payload.core.entries.every(entry => readback.coreKpis.filter(candidate =>
      candidate.kpiId === entry.kpiId && candidate.kpiVersionKey === entry.kpiVersionKey
      && candidate.active === true).length === 1)
    || !payload.core.entries.every(entry => readback.coreTargets.filter(candidate =>
      candidate.targetVersionKey === entry.targetVersionKey && candidate.kpiId === entry.kpiId
      && candidate.performanceYear === performanceYear && candidate.status === 'Approved').length === 1)) return false;

  if (readback.frameworkSets.length !== 1
    || readback.frameworkSets[0].frameworkVersion !== payload.behaviours.frameworkVersion
    || readback.frameworkSets[0].published !== true || readback.frameworkSets[0].immutable !== true
    || readback.personAssignments.length !== 1
    || readback.personAssignments[0].personKey !== actorPersonKey
    || readback.personAssignments[0].frameworkVersion !== payload.behaviours.frameworkVersion
    || readback.personAssignments[0].roleTier !== payload.behaviours.roleTier
    || readback.personAssignments[0].active !== true
    || readback.behaviourValues.length !== payload.behaviours.entries.length) return false;

  if (!payload.behaviours.entries.every((entry, index) => readback.behaviourValues.filter(candidate =>
    candidate.frameworkValueKey === `${payload.behaviours.frameworkVersion}|${entry.valueId}`
    && candidate.frameworkVersion === payload.behaviours.frameworkVersion
    && candidate.valueId === entry.valueId && candidate.governedOrder === index + 1
    && candidate.roleTier === payload.behaviours.roleTier
    && candidate.descriptorKey === entry.descriptorKey).length === 1)) return false;

  const promptCoordinates = payload.behaviours.entries.flatMap(entry =>
    entry.guidancePromptKeys.map(promptKey => ({ promptKey, behaviourKey: entry.valueId }))
  );
  if (new Set(promptCoordinates.map(item => item.promptKey)).size !== promptCoordinates.length
    || readback.prompts.length !== promptCoordinates.length) return false;
  if (!promptCoordinates.every(expected => readback.prompts.filter(candidate =>
    candidate.promptKey === expected.promptKey && candidate.behaviourKey === expected.behaviourKey
    && candidate.roleTier === payload.behaviours.roleTier && candidate.active === true).length === 1)) return false;
  return validateGovernedBehaviourExtensionReferences(payload, actorPersonKey, readback);
};

const managerTargets = (control: IOptionEProtectedWorkplanDto, snapshotKey: string): readonly string[] => [
  `KCFKPI_WorkplanSubmittedSnapshots/${control.performanceYear}/${control.personKey}/${snapshotKey}`,
  `KCFKPI_WorkplanSubmitOperations/${control.performanceYear}/${control.personKey}/SafeOperation`,
  `KCFKPI_Workplans/${control.performanceYear}/${control.personKey}/ControlItem`
];

const assignmentKey = (value: IOptionEAclAssignmentTuple): string => [
  value.principalId, value.principalKey, value.principalType, value.roleDefinitionId,
  value.roleName, value.roleTypeKind, value.roleHigh, value.roleLow
].join('|');
const safeContinuation = (collection: string, value: string): boolean => {
  const prefix = `${collection}?$skiptoken=`;
  return !value.includes('#') && !value.includes('://') && !/%2f|%5c/i.test(value)
    && value.startsWith(prefix) && /^[A-Za-z0-9._~%-]+$/.test(value.slice(prefix.length));
};

const exactAssignmentSet = (
  actual: IOptionEAclTargetAssignmentSet,
  target: string,
  expected: readonly IOptionEAclAssignmentTuple[]
): boolean => {
  const collection = `${target}/RoleAssignments`;
  const actualKeys = actual.assignments.map(assignmentKey);
  const expectedKeys = expected.map(assignmentKey);
  return actual.target === target && actual.canonicalCollectionPath === collection
    && actual.complete === true && Number.isInteger(actual.pageCount) && actual.pageCount >= 1
    && actual.pageCount === actual.continuationUris.length + 1
    && actual.totalCount === actual.assignments.length
    && new Set(actual.continuationUris).size === actual.continuationUris.length
    && actual.continuationUris.every(value => safeContinuation(collection, value))
    && new Set(actualKeys).size === actualKeys.length
    && JSON.stringify(actualKeys.sort()) === JSON.stringify(expectedKeys.sort());
};

const roleTuple = (
  id: number,
  name: string,
  roleTypeKind: number,
  roleHigh: number,
  roleLow: number
): Pick<IOptionEAclAssignmentTuple, 'roleDefinitionId' | 'roleName' | 'roleTypeKind' | 'roleHigh' | 'roleLow'> => ({
  roleDefinitionId: id, roleName: name, roleTypeKind, roleHigh, roleLow
});

const assignment = (
  principalId: number,
  principalKey: string,
  role: Pick<IOptionEAclAssignmentTuple, 'roleDefinitionId' | 'roleName' | 'roleTypeKind' | 'roleHigh' | 'roleLow'>
): IOptionEAclAssignmentTuple => ({ principalId, principalKey, principalType: 1, ...role });

const validateAcl = (authority: IAuthority, proof: IOptionEAclVerification): boolean => {
  const { control, actor, manager, request } = authority;
  if (proof.hierarchyEpoch !== control.hierarchyEpoch || proof.aclEpoch !== control.hierarchyEpoch) return false;
  const principals = authority.automationPrincipalIds;
  const roles = authority.roleIds;
  const ids = [principals.contentProcessor, principals.aclReconciler, principals.recoveryAdmin,
    actor.principalId, manager.principalId];
  const roleIds = [roles.itemReader, roles.addReadNoEdit, roles.draftEditor, roles.mutatorNoDelete,
    roles.aclReconciler, roles.fullControl];
  if (!ids.every(positiveInteger) || new Set(ids).size !== ids.length
    || !roleIds.every(positiveInteger) || new Set(roleIds).size !== roleIds.length) return false;

  const reader = roleTuple(roles.itemReader, 'KCF KPI Option E Item Reader v1', 0, 0, 1);
  const addReader = roleTuple(roles.addReadNoEdit, 'KCF KPI Option E Add Read No Edit v1', 0, 0, 3);
  const draftEditor = roleTuple(roles.draftEditor, 'KCF KPI Option E Draft Editor v1', 0, 0, 5);
  const mutator = roleTuple(roles.mutatorNoDelete, 'KCF KPI Option E Mutator No Delete v1', 0, 0, 7);
  const reconciler = roleTuple(roles.aclReconciler, 'KCF KPI Option E ACL Reconciler v1', 0, 0, 33554433);
  const fullControl = roleTuple(roles.fullControl, 'Full Control', 5, 2147483647, 4294967295);
  const system = (contentRole: ReturnType<typeof roleTuple>): IOptionEAclAssignmentTuple[] => [
    assignment(principals.contentProcessor, 'contentProcessor', contentRole),
    assignment(principals.aclReconciler, 'aclReconciler', reconciler),
    assignment(principals.recoveryAdmin, 'recoveryAdmin', fullControl)
  ];
  const subject = `${control.performanceYear}/${control.personKey}`;
  const draftTarget = `KCFKPI_WorkplanDrafts/${subject}/${request.DraftItemID}`;
  const [snapshotTarget, operationTarget, controlTarget] = managerTargets(control, request.RequestKey);
  const expected: ReadonlyArray<readonly [string, readonly IOptionEAclAssignmentTuple[]]> = [
    [draftTarget, [...system(mutator), assignment(actor.principalId, normalise(actor.email), reader)]],
    [snapshotTarget, [...system(addReader), assignment(actor.principalId, normalise(actor.email), reader),
      assignment(manager.principalId, normalise(manager.email), reader)]],
    [operationTarget, [...system(mutator), assignment(actor.principalId, normalise(actor.email), reader),
      assignment(manager.principalId, normalise(manager.email), reader)]],
    [controlTarget, [...system(draftEditor), assignment(actor.principalId, normalise(actor.email), reader),
      assignment(manager.principalId, normalise(manager.email), reader)]]
  ];
  if (proof.targets.length !== expected.length
    || new Set(proof.targets.map(item => item.target)).size !== proof.targets.length) return false;
  return expected.every(([target, assignments]) => {
    const matches = proof.targets.filter(item => item.target === target);
    return matches.length === 1 && exactAssignmentSet(matches[0], target, assignments);
  });
};

const controlClaimed = (control: IOptionEProtectedWorkplanDto, requestKey: string): boolean =>
  control.transitionStatus === 'Submitting' && control.pendingRequestKey === requestKey
  && control.lastOperationKey === requestKey;
const controlPointed = (control: IOptionEProtectedWorkplanDto, requestKey: string): boolean =>
  control.state === 'Submitted' && control.transitionStatus === 'AclPending'
  && control.pendingRequestKey === requestKey && control.currentSubmittedSnapshotKey === requestKey
  && control.lastOperationKey === requestKey;
const controlCompleted = (control: IOptionEProtectedWorkplanDto, requestKey: string): boolean =>
  control.state === 'Submitted' && control.transitionStatus === 'Ready' && !control.pendingRequestKey
  && control.currentSubmittedSnapshotKey === requestKey && control.lastOperationKey === requestKey
  && control.aclEpoch === control.hierarchyEpoch;
const recoveryControl = (control: IOptionEProtectedWorkplanDto, operation: IOptionESubmitOperation): boolean =>
  control.transitionStatus === 'RecoveryHold' && control.pendingRequestKey === operation.requestKey
  && control.lastOperationKey === operation.operationKey;
const competingControl = (control: IOptionEProtectedWorkplanDto, requestKey: string): boolean =>
  (Boolean(control.pendingRequestKey) && control.pendingRequestKey !== requestKey)
  || (Boolean(control.lastOperationKey) && control.lastOperationKey !== requestKey
    && (control.state === 'Submitted' || control.transitionStatus !== 'Ready'));
const exactOperationAuthority = (operation: IOptionESubmitOperation, authority: IAuthority): boolean =>
  canonicalOperation(operation)
  && operation.operationKey === authority.request.RequestKey && operation.requestKey === authority.request.RequestKey
  && operation.workplanKey === authority.control.workplanKey && operation.personKey === authority.actor.personKey
  && operation.performanceYear === authority.control.performanceYear
  && operation.processorIdentity === OPTION_E_SUBMIT_PROCESSOR_IDENTITY;

type IOptionEOperationAdvancePatch = Pick<Partial<IOptionESubmitOperation>,
  'observedControlEtag' | 'createdSnapshotKey' | 'createdAuditKey' | 'createdAuditEventAt'>;

export class OptionEWorkplanSubmitProcessor {
  public constructor(
    private readonly store: IOptionESubmitProcessorStore,
    private readonly hooks: IOptionESubmitProcessorHooks = {}
  ) {}

  private rejectWithoutMutation(requestKey: string, errorCode: string): never {
    throw new OptionESubmitNotDurablyTerminalError(requestKey, errorCode);
  }

  private async authority(requestKey: string): Promise<IAuthority> {
    const requestA = await this.store.readRequest(requestKey);
    const requestB = await this.store.readRequest(requestKey);
    if (!requestA || !requestB || !exactRequest(requestA, requestB) || requestA.RequestKey !== requestKey) {
      this.rejectWithoutMutation(requestKey, 'RequestDoubleReadMismatch');
    }
    const payloadValidation = validateOptionESubmitPayload(requestA.PayloadJSON);
    if (!payloadValidation.valid || !payloadValidation.payload) {
      this.rejectWithoutMutation(requestKey, 'RequestPayloadInvalid');
    }
    const calculatedHash = (await this.store.sha256(requestA.PayloadJSON)).toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(requestA.PayloadSHA256)
      || calculatedHash !== requestA.PayloadSHA256) {
      this.rejectWithoutMutation(requestKey, 'RequestPayloadHashMismatch');
    }
    const actors = await this.store.findActivePeopleByEmail(requestA.createdByEmail);
    if (!exactPeople(actors)) this.rejectWithoutMutation(requestKey, 'ActorPeopleAmbiguous');
    const actor = actors[0];
    if (normalise(actor.email) !== normalise(requestA.createdByEmail) || !positiveInteger(actor.principalId)) {
      this.rejectWithoutMutation(requestKey, 'ActorCreatedByMismatch');
    }
    const controls = await this.store.findWorkplanByActorAndDraft(actor.personKey, requestA.DraftItemID);
    if (controls.length !== 1) this.rejectWithoutMutation(requestKey, 'ProtectedWorkplanAmbiguous');
    const control = controls[0];
    if (!isCanonicalOptionESubmitUuid(requestA.ClientSubmitID)
      || requestA.RequestKey !== optionERequestKey(requestA.PersonKey, requestA.PerformanceYear, requestA.ClientSubmitID)) {
      this.rejectWithoutMutation(requestKey, 'RequestKeyAuthorityMismatch');
    }
    if (requestA.PersonKey !== actor.personKey || requestA.PersonKey !== control.personKey
      || requestA.PerformanceYear !== control.performanceYear || requestA.WorkplanKey !== control.workplanKey
      || requestA.DraftItemID !== control.draftItemId || requestA.DraftSchemaVersion !== control.draftSchemaVersion
      || payloadValidation.payload.schemaVersion !== requestA.DraftSchemaVersion
      || payloadValidation.payload.behaviours.frameworkVersion !== requestA.FrameworkVersion) {
      this.rejectWithoutMutation(requestKey, 'ProtectedAuthorityMismatch');
    }

    const draftRowsA = await this.store.readAuthoritativeDraft(requestA.DraftItemID);
    const draftRowsB = await this.store.readAuthoritativeDraft(requestA.DraftItemID);
    if (draftRowsA.length !== 1 || draftRowsB.length !== 1
      || !exactDraft(draftRowsA[0], draftRowsB[0])) {
      this.rejectWithoutMutation(requestKey, 'AuthoritativeDraftDoubleReadMismatch');
    }
    const draft = draftRowsA[0];
    if (draft.itemId !== requestA.DraftItemID || draft.etag !== requestA.DraftETag
      || draft.version !== requestA.DraftVersion || draft.schemaVersion !== requestA.DraftSchemaVersion
      || draft.payloadJson !== requestA.PayloadJSON || draft.payloadSha256 !== requestA.PayloadSHA256
      || draft.frameworkVersion !== requestA.FrameworkVersion
      || draft.catalogueVersion !== requestA.CatalogueVersion) {
      this.rejectWithoutMutation(requestKey, 'DraftRequestBytesAndCoordinatesMismatch');
    }
    const draftHash = (await this.store.sha256(draft.payloadJson)).toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(draft.payloadSha256)
      || draftHash !== draft.payloadSha256 || draftHash !== requestA.PayloadSHA256) {
      this.rejectWithoutMutation(requestKey, 'AuthoritativeDraftHashMismatch');
    }

    if (!actor.managerPersonKey) this.rejectWithoutMutation(requestKey, 'CurrentManagerMissing');
    const managers = await this.store.findActivePeopleByPersonKey(actor.managerPersonKey);
    if (!exactPeople(managers)) this.rejectWithoutMutation(requestKey, 'CurrentManagerAmbiguous');
    const manager = managers[0];
    if (manager.personKey !== actor.managerPersonKey || !manager.email.trim() || !positiveInteger(manager.principalId)
      || (control.managerPersonKey && control.managerPersonKey !== manager.personKey)) {
      this.rejectWithoutMutation(requestKey, 'CurrentManagerAuthorityMismatch');
    }
    if (control.hierarchyEpoch < 1 || control.aclEpoch > control.hierarchyEpoch) {
      this.rejectWithoutMutation(requestKey, 'HierarchyEpochInvalid');
    }
    const referencesA = await this.store.readCurrentGovernedReferences(
      payloadValidation.payload, actor.personKey, control.performanceYear
    );
    const referencesB = await this.store.readCurrentGovernedReferences(
      payloadValidation.payload, actor.personKey, control.performanceYear
    );
    if (JSON.stringify(referencesA) !== JSON.stringify(referencesB)
      || !validateAuthoritativeReferences(payloadValidation.payload, actor.personKey,
        control.performanceYear, referencesA)) {
      this.rejectWithoutMutation(requestKey, 'ProtectedAssignedCurrentReferencesMismatch');
    }
    const catalogueDigest = (await this.store.sha256(selectedCoreReferenceDigestInput(
      payloadValidation.payload, control.performanceYear
    ))).toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(requestA.CatalogueVersion)
      || catalogueDigest !== requestA.CatalogueVersion) {
      this.rejectWithoutMutation(requestKey, 'SelectedCoreReferenceDigestMismatch');
    }

    const automationPrincipalIds = await this.store.readAutomationPrincipalIds();
    const roleIds = await this.store.readSubmitRoleIds();
    const principalIds = [automationPrincipalIds.contentProcessor, automationPrincipalIds.aclReconciler,
      automationPrincipalIds.recoveryAdmin, actor.principalId, manager.principalId];
    const configuredRoleIds = [roleIds.itemReader, roleIds.addReadNoEdit, roleIds.draftEditor,
      roleIds.mutatorNoDelete, roleIds.aclReconciler, roleIds.fullControl];
    if (!principalIds.every(positiveInteger) || new Set(principalIds).size !== principalIds.length
      || !configuredRoleIds.every(positiveInteger) || new Set(configuredRoleIds).size !== configuredRoleIds.length) {
      this.rejectWithoutMutation(requestKey, 'AclBindingIdentityInvalid');
    }
    return {
      request: requestA,
      payload: payloadValidation.payload,
      actor,
      manager,
      control,
      automationPrincipalIds,
      roleIds
    };
  }

  private async getOrCreateOperation(authority: IAuthority): Promise<IOptionESubmitOperation> {
    const key = authority.request.RequestKey;
    const existing = await this.store.readOperation(key);
    if (existing) {
      if (!exactOperationAuthority(existing, authority)) throw new Error('OperationIdentityMismatch');
      return existing;
    }
    const freshControl = await this.store.readControl(authority.control.workplanKey);
    if (!freshControl || !exactControl(freshControl, authority.control)
      || (freshControl.state !== 'Draft' && freshControl.state !== 'ChangesRequested')
      || freshControl.transitionStatus !== 'Ready' || Boolean(freshControl.pendingRequestKey)) {
      this.rejectWithoutMutation(key, 'ProtectedControlStaleBeforeOperation');
    }
    const proposed: Omit<IOptionESubmitOperation, 'etag'> = {
      operationKey: key, requestKey: key, workplanKey: authority.control.workplanKey,
      personKey: authority.actor.personKey, performanceYear: authority.control.performanceYear,
      attemptCount: 1, processorIdentity: OPTION_E_SUBMIT_PROCESSOR_IDENTITY,
      expectedControlEtag: authority.control.etag, observedControlEtag: authority.control.etag,
      checkpoint: 'Validated', outcome: 'Running'
    };
    try {
      await this.store.createOperation(proposed);
    } catch { /* exact unique-key readback below resolves timeout/duplicate uncertainty */ }
    const readback = await this.store.readOperation(key);
    const expected = readback ? { ...proposed, etag: readback.etag } : undefined;
    if (!readback || !expected || !exactOperationAuthority(readback, authority)
      || !exactOperationState(readback, expected)) {
      throw new Error('OperationCreateOrReadMismatch');
    }
    return readback;
  }

  private async advance(
    operation: IOptionESubmitOperation,
    checkpoint: OptionESubmitCheckpoint,
    patch: IOptionEOperationAdvancePatch = {}
  ): Promise<IOptionESubmitOperation> {
    const currentRank = rank(operation.checkpoint);
    const nextRank = rank(checkpoint);
    if (operation.outcome !== 'Running' || nextRank !== currentRank + 1) {
      throw new Error(`OperationTransitionInvalid:${operation.checkpoint}:${operation.outcome}->${checkpoint}`);
    }
    const expectedOutcome: OptionESubmitOutcome = checkpoint === 'Completed' ? 'Completed' : 'Running';
    if (!canonicalOperation(operation)) throw new Error(`OperationTransitionSourceInvalid:${checkpoint}`);
    try {
      await this.store.updateOperation(operation.operationKey, operation.etag, {
        ...patch, checkpoint, outcome: expectedOutcome, attemptCount: operation.attemptCount + 1
      });
    } catch { /* canonical readback below resolves a timeout after commit */ }
    const readback = await this.store.readOperation(operation.operationKey);
    const expected = readback ? {
      ...operation, ...patch, checkpoint, outcome: expectedOutcome,
      attemptCount: operation.attemptCount + 1, etag: readback.etag
    } : undefined;
    if (!readback || !expected || readback.etag === operation.etag
      || !exactOperationState(readback, expected)) {
      throw new Error(`OperationCheckpointUncertain:${checkpoint}`);
    }
    this.hooks.afterCheckpoint?.(checkpoint);
    return readback;
  }

  private snapshot(authority: IAuthority, frameworkSnapshotJson: string, catalogueSnapshotJson: string): IOptionESubmitSnapshot {
    const requestKey = authority.request.RequestKey;
    return {
      snapshotKey: requestKey, requestKey, personKey: authority.actor.personKey,
      performanceYear: authority.control.performanceYear, workplanKey: authority.control.workplanKey,
      payloadJson: authority.request.PayloadJSON, payloadSha256: authority.request.PayloadSHA256,
      sourceDraftItemId: authority.request.DraftItemID, sourceDraftEtag: authority.request.DraftETag,
      sourceDraftVersion: authority.request.DraftVersion, requestItemId: authority.request.id,
      requestEtag: authority.request.etag, authenticatedEmployeePersonKey: authority.actor.personKey,
      authenticatedEmployeeEmail: authority.actor.email, managerPersonKey: authority.manager.personKey,
      managerEmail: authority.manager.email, hierarchyEpoch: authority.control.hierarchyEpoch,
      frameworkSnapshotJson, catalogueSnapshotJson
    };
  }

  private audit(authority: IAuthority, eventAt: string): IOptionESubmitAuditWrite {
    const requestKey = authority.request.RequestKey;
    return {
      auditKey: `${requestKey}|WorkplanSubmitted`, eventType: 'WorkplanSubmitted',
      subjectKey: authority.control.workplanKey, performanceYear: authority.control.performanceYear,
      actorEmail: authority.actor.email, actorRole: 'Employee', eventAt, correlationKey: requestKey,
      source: OPTION_E_SUBMIT_PROCESSOR_IDENTITY, sourceReference: requestKey, success: true,
      requestKey, snapshotKey: requestKey, payloadSha256: authority.request.PayloadSHA256,
      actorPersonKey: authority.actor.personKey, processorIdentity: OPTION_E_SUBMIT_PROCESSOR_IDENTITY
    };
  }

  private async proveImmutableEvidence(
    authority: IAuthority,
    operation: IOptionESubmitOperation,
    expectedSnapshot: IOptionESubmitSnapshot
  ): Promise<void> {
    if (rank(operation.checkpoint) >= rank('SnapshotWritten')) {
      const durableSnapshot = await this.store.readSnapshot(authority.request.RequestKey);
      if (operation.createdSnapshotKey !== authority.request.RequestKey
        || !durableSnapshot || !exactSnapshot(durableSnapshot, expectedSnapshot)) {
        throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'ResumeSnapshotEvidenceMismatch');
      }
    }
    if (rank(operation.checkpoint) >= rank('AuditWritten')) {
      const auditKey = `${authority.request.RequestKey}|WorkplanSubmitted`;
      const durableAudit = await this.store.readAudit(auditKey);
      if (operation.createdAuditKey !== auditKey || !operation.createdAuditEventAt || !durableAudit
        || durableAudit.eventAt !== operation.createdAuditEventAt
        || !exactAudit(durableAudit, this.audit(authority, operation.createdAuditEventAt))) {
        throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'ResumeAuditEvidenceMismatch');
      }
    }
  }

  private async proveRunningResume(
    authority: IAuthority,
    operation: IOptionESubmitOperation,
    expectedSnapshot: IOptionESubmitSnapshot
  ): Promise<void> {
    if (operation.outcome !== 'Running' || operation.checkpoint === 'Completed') {
      throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'RunningCheckpointOutcomeMismatch');
    }
    const current = await this.store.readControl(operation.workplanKey);
    if (!current) throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'ResumeControlMissing');
    if (operation.checkpoint === 'ControlClaimed' || operation.checkpoint === 'SnapshotWritten') {
      if (!controlClaimed(current, operation.requestKey) || operation.observedControlEtag !== current.etag) {
        throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'ResumeClaimEvidenceMismatch');
      }
    } else if (operation.checkpoint === 'AuditWritten') {
      if (!controlClaimed(current, operation.requestKey) && !controlPointed(current, operation.requestKey)) {
        throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'ResumeAuditControlMismatch');
      }
    } else if (operation.checkpoint === 'ControlPointed') {
      if (!controlPointed(current, operation.requestKey) || operation.observedControlEtag !== current.etag) {
        throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'ResumePointerEvidenceMismatch');
      }
    } else if (operation.checkpoint === 'AclVerified'
      && !controlPointed(current, operation.requestKey) && !controlCompleted(current, operation.requestKey)) {
      throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'ResumeAclControlMismatch');
    }
    await this.proveImmutableEvidence(authority, operation, expectedSnapshot);
    if (operation.checkpoint === 'AclVerified') {
      const context: IOptionESubmitAclContext = {
        request: authority.request, actor: authority.actor, manager: authority.manager,
        control: { ...current }, snapshotKey: authority.request.RequestKey,
        automationPrincipalIds: authority.automationPrincipalIds, roleIds: authority.roleIds,
        connectionReference: OPTION_E_ACL_CONNECTION_REFERENCE
      };
      const proof = await this.store.readBackAcl(context);
      if (!validateAcl(authority, proof)) {
        throw new OptionESubmitNotDurablyTerminalError(authority.request.RequestKey, 'ResumeAclEvidenceMismatch');
      }
    }
  }

  private async terminal(
    operation: IOptionESubmitOperation,
    outcome: 'Rejected' | 'RecoveryHold',
    errorCode: string,
    errorDetail: string,
    controlProof: (control: IOptionEProtectedWorkplanDto) => boolean
  ): Promise<IOptionESubmitProcessResult> {
    if (!canonicalOperation(operation) || operation.outcome !== 'Running'
      || !errorCode.trim() || !errorDetail.trim()) {
      throw new OptionESubmitNotDurablyTerminalError(operation.requestKey, `${outcome}SourceNotCanonical:${errorCode}`);
    }
    try {
      await this.store.updateOperation(operation.operationKey, operation.etag, {
        outcome, errorCode, errorDetail, attemptCount: operation.attemptCount + 1
      });
    } catch { /* canonical readback below determines whether the terminal write committed */ }
    const [durable, control] = await Promise.all([
      this.store.readOperation(operation.operationKey),
      this.store.readControl(operation.workplanKey)
    ]);
    const expected = durable ? {
      ...operation, outcome, errorCode, errorDetail,
      attemptCount: operation.attemptCount + 1, etag: durable.etag
    } : undefined;
    if (!durable || !expected || !control || durable.etag === operation.etag
      || !exactOperationState(durable, expected)
      || !controlProof(control)) {
      throw new OptionESubmitNotDurablyTerminalError(operation.requestKey, `${outcome}NotDurable:${errorCode}`);
    }
    return {
      requestKey: operation.requestKey, operationKey: operation.operationKey,
      checkpoint: durable.checkpoint, outcome: durable.outcome, errorCode: durable.errorCode
    };
  }

  private async recovery(
    operation: IOptionESubmitOperation,
    errorCode: string,
    errorDetail: string
  ): Promise<IOptionESubmitProcessResult> {
    const current = await this.store.readControl(operation.workplanKey);
    if (!current || (current.pendingRequestKey && current.pendingRequestKey !== operation.requestKey)) {
      throw new OptionESubmitNotDurablyTerminalError(operation.requestKey, `RecoveryControlUnavailable:${errorCode}`);
    }
    if (!recoveryControl(current, operation)) {
      try {
        await this.store.compareAndSwapControl(current.workplanKey, current.etag, {
          transitionStatus: 'RecoveryHold', pendingRequestKey: operation.requestKey,
          lastOperationKey: operation.operationKey
        });
      } catch { /* canonical readback below determines whether the hold write committed */ }
    }
    const held = await this.store.readControl(operation.workplanKey);
    if (!held || !recoveryControl(held, operation)) {
      throw new OptionESubmitNotDurablyTerminalError(operation.requestKey, `RecoveryHoldControlNotDurable:${errorCode}`);
    }
    return this.terminal(operation, 'RecoveryHold', errorCode, errorDetail,
      control => recoveryControl(control, operation));
  }

  public async process(requestKey: string): Promise<IOptionESubmitProcessResult> {
    const authority = await this.authority(requestKey);
    let operation = await this.getOrCreateOperation(authority);
    if (operation.operationKey !== requestKey || operation.requestKey !== requestKey
      || operation.workplanKey !== authority.control.workplanKey) {
      return this.recovery(operation, 'OperationIdentityMismatch', 'Unique Operation does not match immutable Request authority.');
    }
    const frameworkSnapshotJson = await this.store.frameworkSnapshot(authority.request.FrameworkVersion);
    const catalogueSnapshotJson = await this.store.catalogueSnapshot(authority.request.CatalogueVersion);
    const snapshot = this.snapshot(authority, frameworkSnapshotJson, catalogueSnapshotJson);
    if (operation.outcome !== 'Running') {
      const control = await this.store.readControl(operation.workplanKey);
      let verified = Boolean(control) && (operation.outcome === 'Completed'
        ? operation.checkpoint === 'Completed' && controlCompleted(control as IOptionEProtectedWorkplanDto, requestKey)
        : operation.outcome === 'RecoveryHold'
          ? recoveryControl(control as IOptionEProtectedWorkplanDto, operation)
          : competingControl(control as IOptionEProtectedWorkplanDto, requestKey));
      if (verified && operation.outcome === 'Completed' && control) {
        await this.proveImmutableEvidence(authority, operation, snapshot);
        const aclContext: IOptionESubmitAclContext = {
          request: authority.request, actor: authority.actor, manager: authority.manager,
          control: { ...control }, snapshotKey: requestKey,
          automationPrincipalIds: authority.automationPrincipalIds, roleIds: authority.roleIds,
          connectionReference: OPTION_E_ACL_CONNECTION_REFERENCE
        };
        const freshProof = await this.store.readBackAcl(aclContext);
        verified = validateAcl(authority, freshProof);
      }
      if (!verified) {
        throw new OptionESubmitNotDurablyTerminalError(requestKey, `Existing${operation.outcome}NotDurable`);
      }
      return {
        requestKey, operationKey: operation.operationKey, checkpoint: operation.checkpoint,
        outcome: operation.outcome, errorCode: operation.errorCode
      };
    }
    await this.proveRunningResume(authority, operation, snapshot);
    if (operation.checkpoint === 'Validated') this.hooks.afterCheckpoint?.('Validated');

    if (rank(operation.checkpoint) < rank('ControlClaimed')) {
      let control = await this.store.readControl(authority.control.workplanKey);
      if (!control) return this.recovery(operation, 'ControlMissing', 'Protected Workplans readback is absent.');
      if (control.pendingRequestKey && control.pendingRequestKey !== requestKey) {
        return this.terminal(operation, 'Rejected', 'ConcurrentRequestLostCas',
          'A different Request owns the protected Workplans CAS.', current => competingControl(current, requestKey));
      }
      if (control.lastOperationKey && control.lastOperationKey !== requestKey
        && (control.state === 'Submitted' || control.transitionStatus !== 'Ready')) {
        return this.terminal(operation, 'Rejected', 'ConcurrentRequestLostCas',
          'A different Request completed or advanced the protected Workplans CAS.',
          current => competingControl(current, requestKey));
      }
      if (!controlClaimed(control, requestKey)) {
        if ((control.state !== 'Draft' && control.state !== 'ChangesRequested') || control.transitionStatus !== 'Ready'
          || control.etag !== operation.expectedControlEtag) {
          return this.recovery(operation, 'ControlClaimPreconditionMismatch', 'Workplans ETag/state changed before ControlClaimed.');
        }
        try {
          await this.store.compareAndSwapControl(control.workplanKey, control.etag, {
            transitionStatus: 'Submitting', pendingRequestKey: requestKey, lastOperationKey: requestKey
          });
        } catch { /* reconcile below; never blind retry */ }
        control = await this.store.readControl(control.workplanKey);
      }
      if (!control || !controlClaimed(control, requestKey)) {
        return this.recovery(operation, 'ControlClaimUncertain', 'ControlClaimed canonical readback did not verify.');
      }
      operation = await this.advance(operation, 'ControlClaimed', { observedControlEtag: control.etag });
    }

    if (rank(operation.checkpoint) < rank('SnapshotWritten')) {
      let durable = await this.store.readSnapshot(requestKey);
      if (!durable) {
        try { durable = await this.store.createSnapshot(snapshot); } catch { durable = await this.store.readSnapshot(requestKey); }
      }
      if (!durable || !exactSnapshot(durable, snapshot)) {
        return this.recovery(operation, 'SnapshotMismatchOrUncertain', 'Immutable Snapshot unique-key readback differs from Request A.');
      }
      operation = await this.advance(operation, 'SnapshotWritten', { createdSnapshotKey: requestKey });
    }

    const auditKey = `${requestKey}|WorkplanSubmitted`;
    if (rank(operation.checkpoint) < rank('AuditWritten')) {
      let durable = await this.store.readAudit(auditKey);
      if (!durable) {
        const eventAt = this.store.now();
        if (!trustedTimestamp(eventAt)) {
          return this.recovery(operation, 'TrustedAuditClockInvalid', 'Processor clock did not return a canonical UTC timestamp.');
        }
        const proposedAudit = this.audit(authority, eventAt);
        try { durable = await this.store.createAudit(proposedAudit); } catch { durable = await this.store.readAudit(auditKey); }
      }
      if (!durable || !exactAudit(durable, this.audit(authority, durable.eventAt))) {
        return this.recovery(operation, 'AuditMismatchOrUncertain', 'Append-only Audit unique-key readback did not verify.');
      }
      operation = await this.advance(operation, 'AuditWritten', {
        createdAuditKey: auditKey,
        createdAuditEventAt: durable.eventAt
      });
    }

    if (rank(operation.checkpoint) < rank('ControlPointed')) {
      let control = await this.store.readControl(authority.control.workplanKey);
      if (!control) return this.recovery(operation, 'ControlMissingAtPointer', 'Protected Workplans vanished before pointer write.');
      if (!controlPointed(control, requestKey)) {
        if (!controlClaimed(control, requestKey)) {
          return this.recovery(operation, 'ControlPointerPreconditionMismatch', 'Workplans no longer contains the exact claimed Request.');
        }
        try {
          await this.store.compareAndSwapControl(control.workplanKey, control.etag, {
            state: 'Submitted', transitionStatus: 'AclPending', currentSubmittedSnapshotKey: requestKey,
            pendingRequestKey: requestKey, lastOperationKey: requestKey
          });
        } catch { /* reconcile below */ }
        control = await this.store.readControl(control.workplanKey);
      }
      if (!control || !controlPointed(control, requestKey)) {
        return this.recovery(operation, 'ControlPointerUncertain', 'Submitted/AclPending pointer readback did not verify.');
      }
      operation = await this.advance(operation, 'ControlPointed', { observedControlEtag: control.etag });
    }

    const aclControl = await this.store.readControl(authority.control.workplanKey);
    if (!aclControl) {
      return this.recovery(operation, 'ControlMissingAtAcl', 'Protected Workplans vanished before ACL reconciliation.');
    }
    const aclContext: IOptionESubmitAclContext = {
      request: authority.request, actor: authority.actor, manager: authority.manager,
      control: { ...aclControl },
      snapshotKey: requestKey,
      automationPrincipalIds: authority.automationPrincipalIds, roleIds: authority.roleIds,
      connectionReference: OPTION_E_ACL_CONNECTION_REFERENCE
    };
    if (rank(operation.checkpoint) < rank('AclVerified')) {
      let proof: IOptionEAclVerification;
      try { proof = await this.store.applyAndReadBackAcl(aclContext); }
      catch {
        try { await this.store.revokeUnverifiedManager(aclContext); } catch { /* fail closed */ }
        return this.recovery(operation, 'AclApplyOrReadbackFailed', 'ACL mutation or canonical native readback failed.');
      }
      if (!validateAcl(authority, proof)) {
        try { await this.store.revokeUnverifiedManager(aclContext); } catch { /* fail closed */ }
        return this.recovery(operation, 'AclProofMismatch', 'Exact principal, native role, mask or epoch proof failed.');
      }
      operation = await this.advance(operation, 'AclVerified');
    }

    let freshProof: IOptionEAclVerification;
    try { freshProof = await this.store.readBackAcl(aclContext); }
    catch {
      try { await this.store.revokeUnverifiedManager(aclContext); } catch { /* fail closed */ }
      return this.recovery(operation, 'FreshAclReadbackFailed', 'Fresh native ACL readback failed before completion.');
    }
    if (!validateAcl(authority, freshProof)) {
      try { await this.store.revokeUnverifiedManager(aclContext); } catch { /* fail closed */ }
      return this.recovery(operation, 'FreshAclProofMismatch',
        'Fresh principal, role, effective-mask, denial or epoch proof failed before completion.');
    }

    if (rank(operation.checkpoint) < rank('Completed')) {
      let control = await this.store.readControl(authority.control.workplanKey);
      if (!control) return this.recovery(operation, 'ControlMissingAtCompletion', 'Protected Workplans vanished before completion.');
      if (!controlCompleted(control, requestKey)) {
        if (!controlPointed(control, requestKey)) {
          return this.recovery(operation, 'CompletionPreconditionMismatch', 'Workplans pointer/ACL-pending state is not exact.');
        }
        try {
          await this.store.compareAndSwapControl(control.workplanKey, control.etag, {
            state: 'Submitted', transitionStatus: 'Ready', pendingRequestKey: '',
            currentSubmittedSnapshotKey: requestKey, aclEpoch: control.hierarchyEpoch,
            lastOperationKey: requestKey
          });
        } catch { /* reconcile below */ }
        control = await this.store.readControl(control.workplanKey);
      }
      if (!control || !controlCompleted(control, requestKey)) {
        return this.recovery(operation, 'CompletionUncertain', 'Submitted/Ready Workplans readback did not verify.');
      }
      operation = await this.advance(operation, 'Completed', { observedControlEtag: control.etag });
    }
    const [durableOperation, durableControl] = await Promise.all([
      this.store.readOperation(operation.operationKey),
      this.store.readControl(operation.workplanKey)
    ]);
    if (!durableOperation || !exactOperationAuthority(durableOperation, authority)
      || durableOperation.outcome !== 'Completed' || durableOperation.checkpoint !== 'Completed'
      || !durableControl || !controlCompleted(durableControl, requestKey)) {
      throw new OptionESubmitNotDurablyTerminalError(requestKey, 'CompletedNotDurable');
    }
    await this.proveImmutableEvidence(authority, durableOperation, snapshot);
    const finalAclContext: IOptionESubmitAclContext = {
      request: authority.request, actor: authority.actor, manager: authority.manager,
      control: { ...durableControl }, snapshotKey: requestKey,
      automationPrincipalIds: authority.automationPrincipalIds, roleIds: authority.roleIds,
      connectionReference: OPTION_E_ACL_CONNECTION_REFERENCE
    };
    const finalAclProof = await this.store.readBackAcl(finalAclContext);
    if (!validateAcl(authority, finalAclProof)) {
      throw new OptionESubmitNotDurablyTerminalError(requestKey, 'CompletedAclEvidenceMismatch');
    }
    return {
      requestKey, operationKey: durableOperation.operationKey,
      checkpoint: durableOperation.checkpoint, outcome: durableOperation.outcome
    };
  }
}
