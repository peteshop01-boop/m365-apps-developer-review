import {
  canonicaliseOptionEDraft,
  parseCanonicalOptionEDraft,
  validateOptionEDraftAggregate,
  type OptionEBehaviourRoleLevelCode,
  type OptionEBehaviourValueId,
  type IOptionEWorkplanDraftAggregate
} from './OptionEWorkplanDraftModels';

export const OPTION_E_SUBMIT_CONTRACT_VERSION = 'kcf.kpi.option-e.submit.v3' as const;
export const OPTION_E_SUBMIT_MAX_UTF8_BYTES = 56000;

export type OptionEWorkplanState = 'Draft' | 'ChangesRequested' | 'Submitted';
export type OptionETransitionStatus = 'Ready' | 'Submitting' | 'AclPending' | 'RecoveryHold';
export type OptionESubmitCheckpoint =
  | 'Validated'
  | 'ControlClaimed'
  | 'SnapshotWritten'
  | 'AuditWritten'
  | 'ControlPointed'
  | 'AclVerified'
  | 'Completed';
export type OptionESubmitOutcome = 'Running' | 'Completed' | 'Rejected' | 'RecoveryHold';

/** Submit accepts the approved saved-Draft aggregate, not a second alias vocabulary. */
export type IOptionEWorkplanSubmitPayload = IOptionEWorkplanDraftAggregate;

export interface IOptionECanonicalDraftDto {
  itemId: number;
  etag: string;
  version: string;
  schemaVersion: string;
  payloadJson: string;
  payloadSha256: string;
  frameworkVersion: string;
  catalogueVersion: string;
}

export interface IOptionELocalDraftBuffer {
  itemId: number;
  etag: string;
  version: string;
  schemaVersion: string;
  payloadJson: string;
  payloadSha256: string;
}

export interface IOptionEProtectedWorkplanDto {
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  draftItemId: number;
  draftSchemaVersion: string;
  state: 'Draft' | 'ChangesRequested' | 'Submitted';
  transitionStatus: OptionETransitionStatus;
  pendingRequestKey?: string;
  currentSubmittedSnapshotKey?: string;
  managerPersonKey?: string;
  hierarchyEpoch: number;
  aclEpoch: number;
  etag: string;
  lastOperationKey?: string;
}

export interface IOptionESubmitValidationError {
  path: string;
  code: string;
  message: string;
}

export interface IOptionESubmitValidationResult {
  valid: boolean;
  byteLength: number;
  errors: readonly IOptionESubmitValidationError[];
  payload?: IOptionEWorkplanSubmitPayload;
  canonicalJson?: string;
}

export interface IOptionECoreKpiReferenceReadback {
  kpiId: string;
  kpiVersionKey: string;
  active: true;
}

export interface IOptionECoreTargetReferenceReadback {
  targetVersionKey: string;
  kpiId: string;
  performanceYear: number;
  status: 'Approved';
}

export interface IOptionEBehaviourFrameworkSetReadback {
  frameworkVersion: string;
  published: true;
  immutable: true;
}

export interface IOptionEBehaviourFrameworkValueReadback {
  frameworkValueKey: string;
  frameworkVersion: string;
  valueId: string;
  governedOrder: number;
  roleTier: string;
  descriptorKey: string;
}

export interface IOptionEPersonBehaviourAssignmentReadback {
  personKey: string;
  frameworkVersion: string;
  roleTier: string;
  roleLevelCode?: OptionEBehaviourRoleLevelCode;
  active: true;
}

export interface IOptionEBehaviourPromptReadback {
  promptKey: string;
  behaviourKey: string;
  roleTier: string;
  active: true;
}

export interface IOptionEGovernedBehaviourAuthorityReadback {
  catalogueId: string;
  catalogueVersion: string;
  catalogueRevision: number;
  catalogueEtag: string;
  catalogueContentSha256: string;
  approvalReference: string;
  published: boolean;
  immutable: boolean;
  asOfDate: string;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface IOptionEGovernedBehaviourHeadlineReadback {
  behaviourKey: OptionEBehaviourValueId;
  headlineTitle: string;
  governedOrder: number;
}

export interface IOptionEGovernedBehaviourFocusReadback {
  behaviourKey: OptionEBehaviourValueId;
  focusKey: string;
  focusTitle: string;
  roleLevelCode: OptionEBehaviourRoleLevelCode;
  status: 'Published' | 'Retired';
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface IOptionEGovernedBehaviourTargetReadback extends IOptionEGovernedBehaviourFocusReadback {
  targetKey: string;
  selectedWording: string;
}

/** One protected read transaction across the six existing governed reference assets. */
export interface IOptionEAuthoritativeReferenceReadback {
  coreKpis: readonly IOptionECoreKpiReferenceReadback[];
  coreTargets: readonly IOptionECoreTargetReferenceReadback[];
  frameworkSets: readonly IOptionEBehaviourFrameworkSetReadback[];
  behaviourValues: readonly IOptionEBehaviourFrameworkValueReadback[];
  personAssignments: readonly IOptionEPersonBehaviourAssignmentReadback[];
  prompts: readonly IOptionEBehaviourPromptReadback[];
  governedBehaviourAuthority?: IOptionEGovernedBehaviourAuthorityReadback;
  governedBehaviourHeadlines?: readonly IOptionEGovernedBehaviourHeadlineReadback[];
  governedBehaviourFocuses?: readonly IOptionEGovernedBehaviourFocusReadback[];
  governedBehaviourTargets?: readonly IOptionEGovernedBehaviourTargetReadback[];
}

export interface IOptionESubmitRequestFields {
  RequestKey: string;
  PersonKey: string;
  PerformanceYear: number;
  WorkplanKey: string;
  ClientSubmitID: string;
  DraftItemID: number;
  DraftETag: string;
  DraftVersion: string;
  DraftSchemaVersion: string;
  PayloadJSON: string;
  PayloadSHA256: string;
  FrameworkVersion: string;
  CatalogueVersion: string;
  ClientSubmittedAt: string;
}

export interface IOptionESubmitRequestReadback extends IOptionESubmitRequestFields {
  id: number;
  etag: string;
  createdByEmail: string;
}

export interface IOptionEPeopleRow {
  personKey: string;
  email: string;
  principalId: number;
  managerPersonKey?: string;
  managerEmail?: string;
  active: boolean;
}

export interface IOptionESubmitSnapshot {
  snapshotKey: string;
  requestKey: string;
  personKey: string;
  performanceYear: number;
  workplanKey: string;
  payloadJson: string;
  payloadSha256: string;
  sourceDraftItemId: number;
  sourceDraftEtag: string;
  sourceDraftVersion: string;
  requestItemId: number;
  requestEtag: string;
  authenticatedEmployeePersonKey: string;
  authenticatedEmployeeEmail: string;
  managerPersonKey: string;
  managerEmail: string;
  hierarchyEpoch: number;
  frameworkSnapshotJson: string;
  catalogueSnapshotJson: string;
}

export interface IOptionESubmitAudit {
  auditKey: string;
  eventType: 'WorkplanSubmitted';
  subjectKey: string;
  performanceYear: number;
  actorEmail: string;
  actorRole: 'Employee';
  eventAt: string;
  nativeCreatedAt: string;
  correlationKey: string;
  source: 'KCFKPIOptionESubmitProcessorV1';
  sourceReference: string;
  success: true;
  requestKey: string;
  snapshotKey: string;
  payloadSha256: string;
  actorPersonKey: string;
  processorIdentity: string;
}

export type IOptionESubmitAuditWrite = Omit<IOptionESubmitAudit, 'nativeCreatedAt'>;

export interface IOptionESubmitOperation {
  operationKey: string;
  requestKey: string;
  workplanKey: string;
  personKey: string;
  performanceYear: number;
  attemptCount: number;
  processorIdentity: string;
  expectedControlEtag?: string;
  observedControlEtag?: string;
  checkpoint: OptionESubmitCheckpoint;
  outcome: OptionESubmitOutcome;
  errorCode?: string;
  errorDetail?: string;
  createdSnapshotKey?: string;
  createdAuditKey?: string;
  createdAuditEventAt?: string;
  etag: string;
}

export interface IOptionEAutomationPrincipalIds {
  contentProcessor: number;
  aclReconciler: number;
  recoveryAdmin: number;
}

export interface IOptionESubmitRoleIds {
  itemReader: number;
  addReadNoEdit: number;
  draftEditor: number;
  mutatorNoDelete: number;
  aclReconciler: number;
  fullControl: number;
}

export interface IOptionEAclAssignmentTuple {
  principalId: number;
  principalKey: string;
  principalType: number;
  roleDefinitionId: number;
  roleName: string;
  roleTypeKind: number;
  roleHigh: number;
  roleLow: number;
}

export interface IOptionEAclTargetAssignmentSet {
  target: string;
  canonicalCollectionPath: string;
  assignments: readonly IOptionEAclAssignmentTuple[];
  pageCount: number;
  totalCount: number;
  complete: boolean;
  continuationUris: readonly string[];
}

export interface IOptionEAclVerification {
  targets: readonly IOptionEAclTargetAssignmentSet[];
  hierarchyEpoch: number;
  aclEpoch: number;
}

const add = (errors: IOptionESubmitValidationError[], path: string, code: string, message: string): void => {
  errors.push({ path, code, message });
};

export const optionEUtf8ByteLength = (value: string): number => {
  let length = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) length += 1;
    else if (code < 0x800) length += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      length += 4;
      index += 1;
    } else length += 3;
  }
  return length;
};

export const canonicalOptionESubmitPayload = (payload: IOptionEWorkplanSubmitPayload): string =>
  canonicaliseOptionEDraft(payload);

export const validateOptionESubmitPayload = (payloadJson: string): IOptionESubmitValidationResult => {
  const errors: IOptionESubmitValidationError[] = [];
  const byteLength = optionEUtf8ByteLength(payloadJson);
  if (byteLength > OPTION_E_SUBMIT_MAX_UTF8_BYTES) {
    add(errors, '$', 'PayloadTooLarge', `Payload is ${byteLength} UTF-8 bytes; maximum is 56000.`);
  }
  let payload: IOptionEWorkplanSubmitPayload | undefined;
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    validateOptionEDraftAggregate(parsed);
    payload = parseCanonicalOptionEDraft(payloadJson);
  } catch (error) {
    add(errors, '$', 'DraftPayloadInvalid', error instanceof Error ? error.message : 'Saved Draft payload is invalid.');
  }
  return {
    valid: errors.length === 0,
    byteLength,
    errors,
    payload: errors.length === 0 ? payload : undefined,
    canonicalJson: errors.length === 0 ? payloadJson : undefined
  };
};

export const validateOptionESubmitPreconditions = (
  draft: IOptionECanonicalDraftDto,
  local: IOptionELocalDraftBuffer,
  control: IOptionEProtectedWorkplanDto
): readonly IOptionESubmitValidationError[] => {
  const errors: IOptionESubmitValidationError[] = [];
  const exactDraft = draft.itemId === local.itemId && draft.etag === local.etag
    && draft.version === local.version && draft.schemaVersion === local.schemaVersion
    && draft.payloadJson === local.payloadJson && draft.payloadSha256 === local.payloadSha256;
  if (!exactDraft) add(errors, '$.draft', 'CanonicalDraftMismatch',
    'Canonical Draft readback must exactly match the local buffer, coordinates, ETag, version and hash.');
  if (control.draftItemId !== draft.itemId || control.draftSchemaVersion !== draft.schemaVersion) {
    add(errors, '$.control.draft', 'ProtectedDraftBindingMismatch', 'Protected Workplans Draft binding does not match the canonical Draft.');
  }
  if (control.state !== 'Draft' && control.state !== 'ChangesRequested') {
    add(errors, '$.control.state', 'StateNotSubmittable', 'Protected Workplans state is not Draft or ChangesRequested.');
  }
  if (control.transitionStatus !== 'Ready') add(errors, '$.control.transitionStatus', 'TransitionNotReady', 'Protected Workplans is not Ready.');
  if ((control.pendingRequestKey || '').trim()) add(errors, '$.control.pendingRequestKey', 'PendingRequestExists', 'Another Submit request is pending.');
  const validation = validateOptionESubmitPayload(draft.payloadJson);
  if (validation.payload) {
    if (draft.schemaVersion !== validation.payload.schemaVersion) {
      add(errors, '$.draft.schemaVersion', 'DraftSchemaCoordinateMismatch', 'Draft schema coordinate must equal the saved aggregate schema.');
    }
    if (draft.frameworkVersion !== validation.payload.behaviours.frameworkVersion) {
      add(errors, '$.draft.frameworkVersion', 'FrameworkCoordinateMismatch', 'Framework coordinate must equal the saved aggregate framework.');
    }
    if (!/^[0-9A-F]{64}$/.test(draft.catalogueVersion)) {
      add(errors, '$.draft.catalogueVersion', 'CatalogueDigestInvalid', 'CatalogueVersion must be the uppercase canonical selected-Core digest.');
    }
  }
  return [...errors, ...validation.errors];
};

export const optionERequestKey = (personKey: string, performanceYear: number, clientSubmitId: string): string =>
  `${personKey}|${performanceYear}|${clientSubmitId}`;

export const isCanonicalOptionESubmitUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);

export const optionERequestFieldsEqual = (
  left: IOptionESubmitRequestFields,
  right: IOptionESubmitRequestFields
): boolean => {
  const keys: Array<keyof IOptionESubmitRequestFields> = [
    'RequestKey', 'PersonKey', 'PerformanceYear', 'WorkplanKey', 'ClientSubmitID', 'DraftItemID',
    'DraftETag', 'DraftVersion', 'DraftSchemaVersion', 'PayloadJSON', 'PayloadSHA256',
    'FrameworkVersion', 'CatalogueVersion', 'ClientSubmittedAt'
  ];
  return keys.every(key => left[key] === right[key]);
};
