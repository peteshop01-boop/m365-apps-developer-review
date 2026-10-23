import type { EmployeeV2CommandType, EmployeeV2SubjectType } from '../../models/EmployeeWorkplanV2PersistenceModels';
import {
  isSec006CommandAllowedForSource,
  isSec006CommandAllowedForSubject,
  isSec006DelegatedManagerCommand,
  resolveSec006GovernedResource,
  type Sec006GovernedPartition,
  type Sec006GovernedResourceType
} from './Sec006DelegationScope';
import type {
  ISec006AuthoritativeControlCaseStore,
  ISec006ControlCase,
  ISec006ControlCaseConsumption
} from './Sec006ControlCaseStore';
import { sec006ActivePeopleDirectoryError } from './Sec006AclPlan';
import { normaliseSec006HumanReason } from './Sec006HumanReason';

export type { ISec006ControlCase } from './Sec006ControlCaseStore';
export { normaliseSec006HumanReason } from './Sec006HumanReason';

export type Sec006EffectiveRole = 'Employee' | 'Manager' | 'DelegatedManager' | 'BusinessAdmin' | 'SystemAdmin';
export type Sec006ReceiptOutcome = 'Accepted' | 'Rejected' | 'Duplicate' | 'Failed' | 'RecoveryHold';

export interface ISec006TrustedSource {
  listId: string;
  listTitle: 'KCFKPI_EmployeeCommands' | 'KCFKPI_ManagerCommands';
  itemId: number;
  itemVersion: string;
  authorEmail: string;
  createdUtc: string;
}

export interface ISec006CommandEnvelope {
  commandKey: string;
  commandType: EmployeeV2CommandType;
  subjectType: EmployeeV2SubjectType;
  subjectKey: string;
  claimedPersonKey?: string;
  claimedPerformanceYear?: number;
  expectedETag: string;
  expectedRowVersionToken: number;
  payload: Readonly<Record<string, unknown>>;
  clientCorrelationKey: string;
}

export interface ISec006PersonRecord {
  personKey: string;
  email: string;
  managerPersonKey?: string;
  active: boolean;
  appRoles: readonly Sec006EffectiveRole[];
}

export interface ISec006DelegationRecord {
  delegationKey: string;
  delegatorPersonKey: string;
  delegatePersonKey: string;
  subjectPersonKey: string;
  performanceYear: number;
  partition: Sec006GovernedPartition;
  resourceType: Sec006GovernedResourceType;
  resourceKey: string;
  subjectType: EmployeeV2SubjectType;
  subjectKey: string;
  active: boolean;
  revoked: boolean;
  revokedAtUtc?: string;
  revocationReason?: string;
  startUtc: string;
  endUtc: string;
  subjectTypes: readonly EmployeeV2SubjectType[];
  subjectKeys: readonly string[];
  commandTypes: readonly EmployeeV2CommandType[];
  readbackAllowed: boolean;
}

export interface ISec006TrustedSourceListRegistry {
  KCFKPI_EmployeeCommands: string;
  KCFKPI_ManagerCommands: string;
}

export interface ISec006StableKeyBinding {
  fieldName: 'workplanItemKey' | 'fileUniqueId';
  value: string;
  subjectKey: string;
  personKey: string;
  performanceYear: number;
  active: boolean;
}

export interface ISec006RecoveryJournalRecord {
  recoveryKey: string;
  receiptKey: string;
  subjectKey: string;
  failureStage: string;
  message: string;
  recordedAtUtc: string;
  correlationKey: string;
}

export interface ISec006CanonicalSubject {
  subjectKey: string;
  subjectType: EmployeeV2SubjectType;
  personKey: string;
  performanceYear: number;
  etag: string;
  rowVersionToken: number;
  state: string;
  workplanVersion: number;
  locked: boolean;
  transitionStatus?: string;
  values: Readonly<Record<string, unknown>>;
}

export interface ISec006AuditRecord {
  auditKey: string;
  eventType: string;
  subjectKey: string;
  actorEmail: string;
  effectiveRole: Sec006EffectiveRole | 'Unresolved';
  eventAtUtc: string;
  sourceListId: string;
  sourceItemId: number;
  sourceItemVersion: string;
  payloadSha256: string;
  outcome: Sec006ReceiptOutcome;
  validationCode: string;
  before: Readonly<Record<string, unknown>>;
  after: Readonly<Record<string, unknown>>;
  correlationKey: string;
}

export interface ISec006CommandReceiptRecord {
  receiptKey: string;
  sourceListId: string;
  sourceItemId: number;
  sourceItemVersion: string;
  commandKey: string;
  commandType: EmployeeV2CommandType;
  subjectType: EmployeeV2SubjectType;
  subjectKey: string;
  personKey: string;
  performanceYear: number;
  authenticatedActorEmail: string;
  authenticatedActorPersonKey: string;
  effectiveRole: Sec006EffectiveRole | 'Unresolved';
  processedByEmail: string;
  processedAtUtc: string;
  outcome: Sec006ReceiptOutcome;
  validationCode: string;
  message: string;
  processedPayloadSha256: string;
  resultKeys: readonly string[];
  auditKeys: readonly string[];
  correlationKey: string;
  flowRunReference: string;
}

export interface ISec006ProcessorState {
  trustedSourceListIds: ISec006TrustedSourceListRegistry;
  people: ISec006PersonRecord[];
  delegations: ISec006DelegationRecord[];
  stableKeyBindings: ISec006StableKeyBinding[];
  controlCases: ISec006ControlCase[];
  controlCaseStore: ISec006AuthoritativeControlCaseStore;
  subjects: Map<string, ISec006CanonicalSubject>;
  approvedHistory: ISec006CanonicalSubject[];
  receipts: ISec006CommandReceiptRecord[];
  audit: ISec006AuditRecord[];
  recoveryJournal: ISec006RecoveryJournalRecord[];
}

export interface ISec006ProcessContext {
  source: ISec006TrustedSource;
  command: ISec006CommandEnvelope;
  automationIdentity: string;
  flowRunReference: string;
  trustedUtc: string;
}

export interface ISec006ProcessResult {
  receipt: ISec006CommandReceiptRecord;
  mutationApplied: boolean;
  replayed: boolean;
}

export interface ISec006MutationResult {
  next: ISec006CanonicalSubject;
  resultKeys: readonly string[];
}

export type Sec006MutationHandler = (
  subject: ISec006CanonicalSubject,
  command: ISec006CommandEnvelope,
  effectiveRole: Sec006EffectiveRole,
  trustedUtc: string
) => ISec006MutationResult;

export type Sec006IoStage = 'ControlCase' | 'Canonical' | 'ApprovedHistory' | 'Audit' | 'Receipt';

export interface ISec006IoHooks {
  beforeWrite?: (stage: Sec006IoStage) => void;
  afterWrite?: (stage: Sec006IoStage) => void;
}

export class Sec006PartialFailureError extends Error {
  public constructor(message: string, public readonly afterPartialWrite: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'Sec006PartialFailureError';
  }
}

const protectedFields = new Set([
  'id', 'personkey', 'managerkey', 'teamkey', 'performanceyear', 'state', 'accessstate',
  'transitionstatus', 'transitioncorrelationkey', 'workplanversion', 'rowversiontoken',
  'kpiversionkey', 'targetversionkey', 'directcontributioneligible',
  'contributionapprovalstate', 'additiveapproved', 'nonoverlaprequired',
  'nonoverlapapproved', 'contributioneffectivefrom', 'contributioneffectiveto',
  'contributionapprovalreference', 'contributionapprovedat', 'contributionauditreference',
  'progresspct', 'calculatedrag', 'calculationruleversion', 'managercomment',
  'manageroverriderag', 'overridereason', 'overridebyemail', 'overrideat', 'finalrag',
  'finalbehaviourrating', 'managerapproved', 'locked', 'submittedat', 'submittedbyemail',
  'approvedat', 'approvedbyemail', 'lockedat', 'lockedbyemail', 'evidencestatus',
  'evidencekey', 'evidencecount', 'auditactor', 'auditrole', 'audittime', 'auditsource',
  'coverageassignment', 'coverageeligibility', 'coveragetotal', 'reportingmembership',
  'officialactual', 'officialactualvalue', 'officialactualsource', 'officialactualstatus',
  'officialactualversion', 'actor', 'actorrole', 'clientrole',
  'controlcasekey', 'workplankey', 'expectedetag', 'expectedrowversiontoken',
  'authorisedaction', 'validfromutc', 'validtoutc', 'consumedatutc', 'consumedcommandkey',
  'consumedsourceidentity', 'consumedsourceitemid', 'consumedsourceitemversion',
  'revoked', 'revokedatutc', 'revocationreason'
]);

const allowedPayloadFields: Readonly<Record<string, readonly string[]>> = {
  CreateWorkplanDraft: [],
  UpdateWorkplanDraft: ['coreCategoryWeight', 'personalCategoryWeight', 'behaviourCategoryWeight', 'categoryWeightReason'],
  UpsertWorkplanItem: ['itemType', 'kpiId', 'wording', 'description', 'measure', 'targetValue', 'targetText', 'displayOrder', 'activeInWorkplan'],
  DeactivateWorkplanItem: ['workplanItemKey', 'activeInWorkplan'],
  UpdateWorkplanDraftV2: ['coreCategoryWeight', 'personalCategoryWeight', 'behaviourCategoryWeight', 'categoryWeightReason', 'zeroPersonalProposal'],
  UpsertCoreContributionV2: ['kpiId', 'role', 'contributionMethod', 'annualTargetValue', 'annualTargetText', 'quarterTargets', 'displayOrder', 'activeInWorkplan', 'sharedTargetRule', 'sharedApportionmentPercent', 'governanceReference', 'denominatorNumerator', 'denominatorValue', 'denominatorUnit', 'denominatorRuleReference', 'denominatorSourceReference'],
  UpsertPersonalItemV2: ['wording', 'description', 'measure', 'measureType', 'scoringDirection', 'percentageSourceScale', 'baselineValue', 'yearEndTargetValue', 'yearEndTargetText', 'q1TargetValue', 'q1TargetText', 'q2TargetValue', 'q2TargetText', 'q3TargetValue', 'q3TargetText', 'q4TargetValue', 'q4TargetText', 'unitLabel', 'personalItemWeight', 'displayOrder', 'activeInWorkplan'],
  UpsertBehaviourCommitmentV2: ['behaviourId', 'objectiveSource', 'sourceObjectiveKey', 'selectedSuggestionKeys', 'customObjective', 'objectiveTitle', 'objectiveDescription', 'measure', 'unit', 'evidenceDefinition', 'q1TargetText', 'q2TargetText', 'q3TargetText', 'q4TargetText', 'q1TargetRating', 'q2TargetRating', 'q3TargetRating', 'q4TargetRating', 'behaviourItemWeight', 'displayOrder', 'activeInWorkplan'],
  SetCoreWeightingV2: ['mode', 'customWeights'],
  SubmitWorkplan: ['comment', 'amendmentReason'],
  CreateQuarterDraft: ['quarter'],
  UpdateQuarterItem: ['employeeActualValue', 'employeeActualText', 'employeeUpdate', 'forecastValue', 'forecastText'],
  UpdateQuarterItemV2: ['employeeActualValue', 'employeeActualText', 'employeeUpdate', 'contextMitigation', 'forecastValue', 'forecastText', 'employeeBehaviourRating', 'behaviourExamples', 'recovery'],
  SaveProgressEntry: ['employeeActualValue', 'employeeActualText', 'employeeUpdate'],
  RegisterEvidence: ['fileUniqueId', 'description'],
  SubmitQuarterReview: ['comment'],
  RequestWorkplanChanges: ['reason'],
  ApproveAndLockWorkplan: ['comment'],
  RequestQuarterChanges: ['reason'],
  SetQuarterManagerReview: ['decisionComment', 'proposedAssessment'],
  SetQuarterRAGOverride: ['proposedOverrideRag', 'decisionReason'],
  DecideReforecast: ['decision', 'decisionComment'],
  ApproveAndLockQuarter: ['comment'],
  CreateWorkplanAmendmentV2: ['reason', 'controlReference']
};

const nestedPayloadFields: Readonly<Record<string, readonly string[]>> = {
  zeroPersonalProposal: [
    'employeeReason', 'coreCategoryWeight', 'personalCategoryWeight', 'behaviourCategoryWeight'
  ],
  quarterTargets: ['quarter', 'targetValue', 'targetText', 'commitment', 'successDefinition'],
  customWeights: ['kpiId', 'weight'],
  recovery: [
    'route', 'action', 'ownerPersonKey', 'dueDate', 'nextReviewDate',
    'expectedReturnToGreenDate', 'expectedReducedOutcome', 'proposedRevisedTarget',
    'proposedRevisedDate', 'reforecastReason', 'dependencyOrDecision', 'escalatedTo',
    'targetDecisionDate'
  ]
};

const allowedNestedContainers = new Set(['zeroPersonalProposal', 'quarterTargets', 'customWeights', 'recovery']);
const allowedStringArrayFields = new Set(['selectedSuggestionKeys']);
const MAX_PAYLOAD_DEPTH = 6;
const MAX_PAYLOAD_NODES = 1000;
const MAX_PAYLOAD_STRING_LENGTH = 100000;

const normaliseGuid = (value: string | undefined): string => String(value || '').replace(/[{}]/g, '').trim().toLowerCase();

export const buildSec006ReceiptKey = (sourceListId: string, sourceItemId: number): string =>
  `${normaliseGuid(sourceListId)}|${sourceItemId}`;

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stable(record[key])}`).join(',')}}`;
};

const rotateRight = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));

export const sec006Sha256 = (text: string): string => {
  const maxWord = 2 ** 32;
  const words: number[] = [];
  const hash: number[] = [];
  const constants: number[] = [];
  const composite: Record<number, boolean> = {};
  for (let candidate = 2, primeCount = 0; primeCount < 64; candidate += 1) {
    if (composite[candidate]) continue;
    for (let multiple = candidate * candidate; multiple < 313; multiple += candidate) composite[multiple] = true;
    if (primeCount < 8) hash[primeCount] = (Math.sqrt(candidate) * maxWord) | 0;
    constants[primeCount] = (Math.cbrt(candidate) * maxWord) | 0;
    primeCount += 1;
  }
  const utf8 = unescape(encodeURIComponent(text));
  const bitLength = utf8.length * 8;
  let binary = utf8;
  binary += '\x80';
  while ((binary.length % 64) !== 56) binary += '\x00';
  for (let index = 0; index < binary.length; index += 1) {
    words[index >> 2] = (words[index >> 2] || 0) | binary.charCodeAt(index) << ((3 - index) % 4) * 8;
  }
  words.push((bitLength / maxWord) | 0, bitLength | 0);
  for (let offset = 0; offset < words.length; offset += 16) {
    const schedule = words.slice(offset, offset + 16);
    const old = hash.slice(0);
    for (let round = 0; round < 64; round += 1) {
      const w15 = schedule[round - 15];
      const w2 = schedule[round - 2];
      if (round >= 16) schedule[round] = (
        schedule[round - 16]
        + (rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3))
        + schedule[round - 7]
        + (rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10))
      ) | 0;
      const e = hash[4];
      const a = hash[0];
      const temp1 = (hash[7] + (rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25))
        + ((e & hash[5]) ^ (~e & hash[6])) + constants[round] + schedule[round]) | 0;
      const temp2 = ((rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]))) | 0;
      hash.unshift((temp1 + temp2) | 0);
      hash[4] = (hash[4] + temp1) | 0;
      hash.pop();
    }
    hash.forEach((value, index) => { hash[index] = (value + old[index]) | 0; });
  }
  return hash.map(value => (`00000000${(value >>> 0).toString(16)}`).slice(-8)).join('');
};

export const buildSec006CorrelationKey = (source: ISec006TrustedSource): string =>
  `CORR|${sec006Sha256(`${normaliseGuid(source.listId)}|${source.itemId}|${source.itemVersion}`).slice(0, 32)}`;

const cloneSubject = (subject: ISec006CanonicalSubject): ISec006CanonicalSubject => ({
  ...subject,
  values: { ...subject.values }
});

interface ISec006PayloadInspection {
  canonical: string;
  code?: string;
  message?: string;
}

const normalisePropertyKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const inspectPayload = (commandType: EmployeeV2CommandType, payload: unknown): ISec006PayloadInspection => {
  const seen = new WeakSet<object>();
  let nodes = 0;
  let protectedClaim: string | undefined;
  let topLevelUnknown: string | undefined;
  let nestedUnknown: string | undefined;
  let structureError: string | undefined;

  const visitPrimitive = (value: unknown, path: string): void => {
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') {
      if (value.length > MAX_PAYLOAD_STRING_LENGTH) structureError = structureError || `${path} exceeds the payload string limit.`;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return;
    structureError = structureError || `${path} contains a non-JSON or non-finite value.`;
  };

  const visitObject = (
    value: unknown,
    depth: number,
    path: string,
    allowedKeys: readonly string[],
    nested: boolean
  ): void => {
    if (depth > MAX_PAYLOAD_DEPTH) {
      structureError = structureError || `${path} exceeds the maximum payload depth.`;
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      structureError = structureError || `${path} must be a plain JSON object.`;
      return;
    }
    if (seen.has(value as object)) {
      structureError = structureError || `${path} contains a recursive reference.`;
      return;
    }
    seen.add(value as object);
    nodes += 1;
    if (nodes > MAX_PAYLOAD_NODES) {
      structureError = structureError || 'Payload exceeds the maximum node count.';
      return;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    const normalisedKeys = keys.map(normalisePropertyKey);
    if (new Set(normalisedKeys).size !== normalisedKeys.length) {
      structureError = structureError || `${path} contains duplicate normalised property names.`;
    }
    keys.forEach(key => {
      const normalised = normalisePropertyKey(key);
      const childPath = `${path}.${key}`;
      if (['__proto__', 'prototype', 'constructor'].indexOf(key.toLowerCase()) >= 0) {
        structureError = structureError || `${childPath} is not a permitted JSON property.`;
        return;
      }
      if (protectedFields.has(normalised)) protectedClaim = protectedClaim || key;
      if (allowedKeys.indexOf(key) < 0) {
        if (nested) nestedUnknown = nestedUnknown || childPath;
        else topLevelUnknown = topLevelUnknown || key;
        return;
      }
      const child = record[key];
      if (allowedNestedContainers.has(key)) {
        const nestedAllowed = nestedPayloadFields[key];
        if (key === 'quarterTargets' || key === 'customWeights') {
          if (!Array.isArray(child) || child.length > MAX_PAYLOAD_NODES) {
            structureError = structureError || `${childPath} must be a bounded JSON array.`;
            return;
          }
          if (seen.has(child)) {
            structureError = structureError || `${childPath} contains a recursive reference.`;
            return;
          }
          seen.add(child);
          nodes += 1;
          child.forEach((item, index) => visitObject(item, depth + 1, `${childPath}[${index}]`, nestedAllowed, true));
        } else if (child !== undefined) {
          visitObject(child, depth + 1, childPath, nestedAllowed, true);
        }
        return;
      }
      if (allowedStringArrayFields.has(key)) {
        if (!Array.isArray(child) || child.length > 25
          || child.some(item => typeof item !== 'string' || item.length > 200)) {
          structureError = structureError || `${childPath} must be a bounded string array.`;
        } else {
          nodes += child.length;
        }
        return;
      }
      if (child && typeof child === 'object') {
        structureError = structureError || `${childPath} contains an unexpected nested object.`;
        return;
      }
      visitPrimitive(child, childPath);
    });
  };

  const allowed = allowedPayloadFields[commandType] || [];
  visitObject(payload, 0, 'payload', allowed, false);
  const canonical = structureError ? `[REJECTED_INVALID_PAYLOAD:${structureError}]` : stable(payload);
  if (protectedClaim) return {
    canonical, code: 'PROTECTED_FIELD_CLAIM',
    message: `Payload attempted protected property: ${protectedClaim}.`
  };
  if (topLevelUnknown) return {
    canonical, code: 'UNKNOWN_FIELD_CLAIM',
    message: `Payload contains unknown property: ${topLevelUnknown}.`
  };
  if (nestedUnknown) return {
    canonical, code: 'UNKNOWN_NESTED_FIELD_CLAIM',
    message: `Payload contains unknown nested property: ${nestedUnknown}.`
  };
  if (structureError) return {
    canonical, code: 'PAYLOAD_STRUCTURE_INVALID', message: structureError
  };
  return { canonical };
};

const lifecycleError = (command: EmployeeV2CommandType, subject: ISec006CanonicalSubject): string | undefined => {
  const editable = subject.state === 'Draft' || subject.state === 'ChangesRequested';
  const annualEmployeeEdits = [
    'UpdateWorkplanDraft', 'UpsertWorkplanItem', 'DeactivateWorkplanItem',
    'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2', 'UpsertPersonalItemV2',
    'UpsertBehaviourCommitmentV2', 'SetCoreWeightingV2'
  ];
  const quarterEmployeeEdits = ['UpdateQuarterItem', 'UpdateQuarterItemV2', 'SaveProgressEntry', 'RegisterEvidence'];
  if (annualEmployeeEdits.indexOf(command) >= 0 && !editable) return 'ANNUAL_NOT_EDITABLE';
  if (command === 'SubmitWorkplan' && !editable) return 'WORKPLAN_NOT_SUBMITTABLE';
  if ((command === 'RequestWorkplanChanges' || command === 'ApproveAndLockWorkplan') && subject.state !== 'Submitted') {
    return 'WORKPLAN_NOT_AWAITING_MANAGER';
  }
  if (quarterEmployeeEdits.indexOf(command) >= 0 && !editable) return 'QUARTER_NOT_EDITABLE';
  if (command === 'SubmitQuarterReview' && !editable) return 'QUARTER_NOT_SUBMITTABLE';
  if (['RequestQuarterChanges', 'SetQuarterManagerReview', 'SetQuarterRAGOverride', 'DecideReforecast', 'ApproveAndLockQuarter'].indexOf(command) >= 0
    && subject.state !== 'Submitted') return 'QUARTER_NOT_AWAITING_MANAGER';
  if (command === 'CreateWorkplanAmendmentV2'
    && (subject.subjectType !== 'Workplan' || subject.state !== 'Locked' || !subject.locked)) {
    return 'AMENDMENT_APPROVED_WORKPLAN_REQUIRED';
  }
  return undefined;
};

const contributionError = (command: ISec006CommandEnvelope): string | undefined => {
  if (command.commandType !== 'UpsertCoreContributionV2') return undefined;
  const method = String(command.payload.contributionMethod || '');
  if (['AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight'].indexOf(method) < 0) {
    return 'CONTRIBUTION_METHOD_INVALID';
  }
  if (method === 'SharedTarget' && command.payload.sharedTargetRule === 'ApprovedApportionment') {
    const percent = Number(command.payload.sharedApportionmentPercent);
    if (!(percent > 0 && percent <= 100) || !String(command.payload.governanceReference || '').trim()) {
      return 'SHARED_APPORTIONMENT_GOVERNANCE_REQUIRED';
    }
  }
  if (method === 'WeightedDenominator') {
    const denominator = Number(command.payload.denominatorValue);
    if (!(denominator > 0) || !String(command.payload.denominatorUnit || '').trim()
      || !String(command.payload.denominatorRuleReference || '').trim()
      || !String(command.payload.denominatorSourceReference || '').trim()) {
      return 'WEIGHTED_DENOMINATOR_GOVERNANCE_REQUIRED';
    }
  }
  if (method === 'CompletionOversight') {
    const quarters = command.payload.quarterTargets as Array<{ successDefinition?: string }> | undefined;
    if (!quarters || quarters.length !== 4 || quarters.some(quarter => !String(quarter.successDefinition || '').trim())) {
      return 'COMPLETION_SUCCESS_DEFINITIONS_REQUIRED';
    }
  }
  return undefined;
};

const isActiveDelegation = (
  delegation: ISec006DelegationRecord,
  actorPersonKey: string,
  subject: ISec006CanonicalSubject,
  command: ISec006CommandEnvelope,
  trustedUtc: string
): boolean => {
  const resource = resolveSec006GovernedResource(
    subject.subjectType, subject.subjectKey, subject.personKey, subject.performanceYear
  );
  return Boolean(resource)
    && delegation.active
    && delegation.revoked === false
    && !delegation.revokedAtUtc
    && !delegation.revocationReason
    && delegation.delegatePersonKey === actorPersonKey
    && delegation.subjectPersonKey === subject.personKey
    && delegation.performanceYear === subject.performanceYear
    && !Number.isNaN(Date.parse(delegation.startUtc))
    && !Number.isNaN(Date.parse(delegation.endUtc))
    && Date.parse(delegation.startUtc) <= Date.parse(trustedUtc)
    && Date.parse(delegation.endUtc) >= Date.parse(trustedUtc)
    && delegation.delegatePersonKey !== delegation.subjectPersonKey
    && delegation.delegatePersonKey !== delegation.delegatorPersonKey
    && delegation.partition === resource?.partition
    && delegation.resourceType === resource?.resourceType
    && delegation.resourceKey === resource?.resourceKey
    && delegation.subjectType === resource?.subjectType
    && delegation.subjectKey === resource?.subjectKey
    && delegation.subjectTypes.length === 1
    && delegation.subjectTypes[0] === resource?.subjectType
    && delegation.subjectKeys.length === 1
    && delegation.subjectKeys[0] === resource?.subjectKey
    && delegation.commandTypes.indexOf(command.commandType) >= 0
    && delegation.commandTypes.every(candidate =>
      isSec006DelegatedManagerCommand(candidate, subject.subjectType))
    && delegation.readbackAllowed;
};

const resolveRole = (
  source: ISec006TrustedSource,
  actor: ISec006PersonRecord,
  subject: ISec006CanonicalSubject,
  command: ISec006CommandEnvelope,
  people: readonly ISec006PersonRecord[],
  delegations: readonly ISec006DelegationRecord[],
  trustedUtc: string
): Sec006EffectiveRole | undefined => {
  if (source.listTitle === 'KCFKPI_EmployeeCommands') {
    return actor.personKey === subject.personKey && actor.appRoles.indexOf('Employee') >= 0 ? 'Employee' : undefined;
  }
  if (actor.appRoles.indexOf('SystemAdmin') >= 0) return 'SystemAdmin';
  const subjectPerson = people.find(person => person.active && person.personKey === subject.personKey);
  if (subjectPerson?.managerPersonKey === actor.personKey && actor.personKey !== subject.personKey
    && actor.appRoles.indexOf('Manager') >= 0) return 'Manager';
  const currentManager = people.find(person => person.active && person.personKey === subjectPerson?.managerPersonKey
    && person.appRoles.indexOf('Manager') >= 0);
  if (currentManager && actor.appRoles.indexOf('DelegatedManager') >= 0
    && delegations.some(delegation => delegation.delegatorPersonKey === subjectPerson?.managerPersonKey
      && isActiveDelegation(delegation, actor.personKey, subject, command, trustedUtc))) {
    return 'DelegatedManager';
  }
  return undefined;
};

const canonicalSubjectIdentityValid = (subject: ISec006CanonicalSubject): boolean => {
  const segments = subject.subjectKey.split('|');
  return segments.indexOf(subject.personKey) >= 0 && segments.indexOf(String(subject.performanceYear)) >= 0;
};

const stableKeyError = (
  command: ISec006CommandEnvelope,
  subject: ISec006CanonicalSubject,
  state: ISec006ProcessorState
): { code: string; message: string } | undefined => {
  const claims: Array<{ fieldName: ISec006StableKeyBinding['fieldName']; value: unknown }> = [];
  if (Object.prototype.hasOwnProperty.call(command.payload, 'workplanItemKey')) {
    claims.push({ fieldName: 'workplanItemKey', value: command.payload.workplanItemKey });
  }
  if (Object.prototype.hasOwnProperty.call(command.payload, 'fileUniqueId')) {
    claims.push({ fieldName: 'fileUniqueId', value: command.payload.fileUniqueId });
  }
  for (const claim of claims) {
    if (typeof claim.value !== 'string' || !claim.value.trim()) {
      return { code: 'STABLE_KEY_NOT_TRUSTED', message: `${claim.fieldName} is not a valid trusted key.` };
    }
    const matches = state.stableKeyBindings.filter(binding => binding.active
      && binding.fieldName === claim.fieldName && binding.value === claim.value);
    if (matches.length !== 1) {
      return {
        code: matches.length > 1 ? 'STABLE_KEY_BINDING_AMBIGUOUS' : 'STABLE_KEY_NOT_TRUSTED',
        message: `${claim.fieldName} does not resolve to one trusted server binding.`
      };
    }
    const binding = matches[0];
    if (binding.personKey !== subject.personKey || binding.performanceYear !== subject.performanceYear
      || binding.subjectKey !== subject.subjectKey) {
      return { code: 'STABLE_KEY_SUBJECT_MISMATCH', message: `${claim.fieldName} belongs to another canonical subject.` };
    }
  }
  const recovery = command.payload.recovery as Record<string, unknown> | undefined;
  if (recovery && Object.prototype.hasOwnProperty.call(recovery, 'ownerPersonKey')) {
    const ownerKey = String(recovery.ownerPersonKey || '');
    const owners = state.people.filter(person => person.active && person.personKey === ownerKey);
    const subjectPeople = state.people.filter(person => person.active && person.personKey === subject.personKey);
    if (owners.length !== 1 || subjectPeople.length !== 1
      || (ownerKey !== subject.personKey && ownerKey !== subjectPeople[0].managerPersonKey)) {
      return { code: 'STABLE_KEY_SUBJECT_MISMATCH', message: 'Recovery owner is not the subject or current governed manager.' };
    }
  }
  return undefined;
};

interface ISec006ControlCaseResolution {
  controlCase?: ISec006ControlCase;
  code?: string;
  message?: string;
}

const authoritativeControlCaseRejectionCode = (code: string | undefined): string => {
  switch (code) {
    case 'CONTROL_CASE_STALE_WRITE': return 'AMENDMENT_CONTROL_CASE_STALE_WRITE';
    case 'CONTROL_CASE_INACTIVE': return 'AMENDMENT_CONTROL_CASE_INACTIVE';
    case 'CONTROL_CASE_ALREADY_CONSUMED': return 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED';
    case 'CONTROL_CASE_RECOVERY_HOLD': return 'AMENDMENT_CONTROL_CASE_RECOVERY_HOLD';
    case 'CONTROL_CASE_REVOKED': return 'AMENDMENT_CONTROL_CASE_REVOKED';
    case 'CONTROL_CASE_INVALID': return 'AMENDMENT_CONTROL_CASE_INVALID';
    case 'CONTROL_CASE_NOT_YET_VALID': return 'AMENDMENT_CONTROL_CASE_NOT_YET_VALID';
    case 'CONTROL_CASE_EXPIRED': return 'AMENDMENT_CONTROL_CASE_EXPIRED';
    case 'CONTROL_CASE_BINDING_MISMATCH': return 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH';
    default: return 'AMENDMENT_CONTROL_CASE_NOT_AUTHORISED';
  }
};

const resolveControlCase = (
  state: ISec006ProcessorState,
  subject: ISec006CanonicalSubject,
  command: ISec006CommandEnvelope,
  trustedUtc: string
): ISec006ControlCaseResolution => {
  const reference = typeof command.payload.controlReference === 'string'
    ? command.payload.controlReference.trim() : '';
  const matches = state.controlCases.filter(candidate => candidate.controlCaseKey === reference);
  if (matches.length !== 1) return {
    code: matches.length > 1 ? 'AMENDMENT_CONTROL_CASE_AMBIGUOUS' : 'AMENDMENT_CONTROL_CASE_NOT_AUTHORISED',
    message: 'The CONTROL case key does not resolve to one server-authorised case.'
  };
  const controlCase = matches[0];
  if (controlCase.controlReference !== reference
    || controlCase.authorisedAction !== 'CreateWorkplanAmendmentV2') return {
    code: 'AMENDMENT_CONTROL_CASE_BINDING_MISMATCH',
    message: 'The CONTROL case reference or authorised action does not match.'
  };
  if (!controlCase.active || controlCase.consumedAtUtc || controlCase.consumedCommandKey
    || controlCase.consumedSourceListId || controlCase.consumedSourceItemId
    || controlCase.consumedSourceItemVersion) return {
    code: 'AMENDMENT_CONTROL_CASE_ALREADY_CONSUMED',
    message: 'The CONTROL case is inactive or has already been consumed.'
  };
  if (controlCase.recoveryHoldAtUtc || controlCase.recoveryHoldReason) return {
    code: 'AMENDMENT_CONTROL_CASE_RECOVERY_HOLD',
    message: 'The CONTROL case is held for controlled recovery and cannot be reused.'
  };
  if (controlCase.revoked || controlCase.revokedAtUtc || controlCase.revocationReason) return {
    code: 'AMENDMENT_CONTROL_CASE_REVOKED', message: 'The CONTROL case has been revoked.'
  };
  if (Number.isNaN(Date.parse(controlCase.validFromUtc)) || Number.isNaN(Date.parse(controlCase.validToUtc))) return {
    code: 'AMENDMENT_CONTROL_CASE_INVALID', message: 'The CONTROL case validity window is invalid.'
  };
  if (Date.parse(controlCase.validFromUtc) > Date.parse(trustedUtc)) return {
    code: 'AMENDMENT_CONTROL_CASE_NOT_YET_VALID', message: 'The CONTROL case is not yet valid.'
  };
  if (Date.parse(controlCase.validToUtc) < Date.parse(trustedUtc)) return {
    code: 'AMENDMENT_CONTROL_CASE_EXPIRED', message: 'The CONTROL case has expired.'
  };
  if (controlCase.subjectKey !== subject.subjectKey || controlCase.workplanKey !== subject.subjectKey) return {
    code: 'AMENDMENT_CONTROL_CASE_SUBJECT_MISMATCH',
    message: 'The CONTROL case does not bind to the exact canonical Workplan.'
  };
  if (controlCase.workplanVersion !== subject.workplanVersion) return {
    code: 'AMENDMENT_CONTROL_CASE_VERSION_MISMATCH',
    message: 'The CONTROL case does not bind to the current Workplan version.'
  };
  if (controlCase.expectedETag !== subject.etag
    || controlCase.expectedRowVersionToken !== subject.rowVersionToken) return {
    code: 'AMENDMENT_CONTROL_CASE_CONCURRENCY_MISMATCH',
    message: 'The CONTROL case concurrency binding does not match the canonical Workplan.'
  };
  if (!controlCase.storageETag.trim() || controlCase.storageETag === '*'
    || !Number.isInteger(controlCase.storageRowVersionToken) || controlCase.storageRowVersionToken <= 0) return {
    code: 'AMENDMENT_CONTROL_CASE_STORAGE_CONCURRENCY_REQUIRED',
    message: 'The CONTROL case requires an exact authoritative storage ETag and RowVersionToken.'
  };
  return { controlCase };
};

const defaultMutation: Sec006MutationHandler = (subject, command, role) => {
  if (command.commandType === 'CreateWorkplanAmendmentV2') {
    const amendmentReason = normaliseSec006HumanReason(command.payload.reason) || '';
    const controlReference = String(command.payload.controlReference).trim();
    return {
      next: {
        ...cloneSubject(subject),
        workplanVersion: subject.workplanVersion + 1,
        rowVersionToken: subject.rowVersionToken + 1,
        etag: `\"${subject.rowVersionToken + 1}\"`,
        state: 'ChangesRequested',
        locked: false,
        transitionStatus: 'Ready',
        values: {
          ...subject.values,
          amendmentReason,
          amendmentControlReference: controlReference,
          amendmentRequestedByRole: role
        }
      },
      resultKeys: [`${subject.subjectKey}|v${subject.workplanVersion + 1}`]
    };
  }
  const nextState = command.commandType === 'SubmitWorkplan' || command.commandType === 'SubmitQuarterReview'
    ? 'Submitted'
    : command.commandType === 'RequestWorkplanChanges' || command.commandType === 'RequestQuarterChanges'
      ? 'ChangesRequested'
      : command.commandType === 'ApproveAndLockWorkplan' || command.commandType === 'ApproveAndLockQuarter'
        ? 'Locked'
        : subject.state;
  const lock = command.commandType === 'ApproveAndLockWorkplan' || command.commandType === 'ApproveAndLockQuarter';
  const contributionDerived = command.commandType === 'UpsertCoreContributionV2' ? {
    directContributionEligible: false,
    contributionApprovalState: 'Draft',
    additiveApproved: false,
    nonOverlapRequired: command.payload.contributionMethod === 'AdditiveDirect',
    nonOverlapApproved: false
  } : {};
  return {
    next: {
      ...cloneSubject(subject),
      rowVersionToken: subject.rowVersionToken + 1,
      etag: `\"${subject.rowVersionToken + 1}\"`,
      state: nextState,
      locked: lock ? true : subject.locked,
      transitionStatus: 'Ready',
      values: { ...subject.values, ...command.payload, ...contributionDerived, lastEffectiveRole: role }
    },
    resultKeys: [subject.subjectKey]
  };
};

export class Sec006AutomationProcessor {
  private lastIoStage: Sec006IoStage | undefined;

  public constructor(
    private readonly mutationHandler: Sec006MutationHandler = defaultMutation,
    private readonly ioHooks: ISec006IoHooks = {}
  ) {}

  public process(context: ISec006ProcessContext, state: ISec006ProcessorState): ISec006ProcessResult {
    this.lastIoStage = undefined;
    const inspection = inspectPayload(context.command.commandType, context.command.payload);
    const payloadSha = sec006Sha256(inspection.canonical);
    const rawAmendmentReason = context.command.commandType === 'CreateWorkplanAmendmentV2'
      ? context.command.payload.reason : undefined;
    const amendmentReason = normaliseSec006HumanReason(rawAmendmentReason) || '';
    let validatedCommand = context.command;
    let authorisedControlCase: ISec006ControlCase | undefined;
    let authorisedConsumption: ISec006ControlCaseConsumption | undefined;
    const receiptKey = buildSec006ReceiptKey(context.source.listId, context.source.itemId);
    const subject = state.subjects.get(context.command.subjectKey);
    const directoryError = sec006ActivePeopleDirectoryError(state.people);
    const actors = directoryError ? [] : state.people.filter(person => person.active
      && person.email.trim().toLowerCase() === context.source.authorEmail.trim().toLowerCase());
    const actor = actors.length === 1 ? actors[0] : undefined;
    const role = subject && actor
      ? resolveRole(context.source, actor, subject, context.command, state.people, state.delegations, context.trustedUtc)
      : undefined;
    const reject = (code: string, message: string, persist: boolean = true): ISec006ProcessResult => this.finalise(
      context, state, payloadSha, role || 'Unresolved', 'Rejected', code, message, subject, subject, [], false, false,
      persist
    );

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normaliseGuid(context.source.listId))
      || !Number.isInteger(context.source.itemId) || context.source.itemId <= 0 || !context.source.itemVersion.trim()) {
      return reject('INVALID_TRUSTED_SOURCE', 'The trusted SharePoint source identity is incomplete.');
    }
    if (context.source.listTitle !== 'KCFKPI_EmployeeCommands'
      && context.source.listTitle !== 'KCFKPI_ManagerCommands') {
      return reject('INVALID_TRUSTED_SOURCE', 'The trusted SharePoint list title is not an approved command root.');
    }
    const registeredEmployeeListId = normaliseGuid(state.trustedSourceListIds.KCFKPI_EmployeeCommands || '');
    const registeredManagerListId = normaliseGuid(state.trustedSourceListIds.KCFKPI_ManagerCommands || '');
    if (!registeredEmployeeListId || !registeredManagerListId || registeredEmployeeListId === registeredManagerListId
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registeredEmployeeListId)
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(registeredManagerListId)) {
      return reject('SOURCE_REGISTRY_INVALID', 'The server source-list registry is missing, ambiguous or invalid.');
    }
    if (normaliseGuid(context.source.listId) !== normaliseGuid(state.trustedSourceListIds[context.source.listTitle])) {
      return reject('SOURCE_LIST_IDENTITY_MISMATCH', 'The trusted source GUID is not bound to the supplied command-list title.');
    }
    const existingSourceReceipt = state.receipts.find(receipt => receipt.receiptKey === receiptKey);
    if (existingSourceReceipt) {
      this.appendAudit(context, state, existingSourceReceipt.processedPayloadSha256,
        existingSourceReceipt.effectiveRole, 'Duplicate', 'SOURCE_REPLAY', {}, {});
      const replayReceipt = context.command.commandType === 'CreateWorkplanAmendmentV2'
        ? {
          ...existingSourceReceipt,
          outcome: 'Duplicate' as const,
          validationCode: 'SOURCE_REPLAY',
          message: 'The trusted amendment source was already processed; no second amendment was created.'
        }
        : existingSourceReceipt;
      return { receipt: replayReceipt, mutationApplied: false, replayed: true };
    }
    if (!context.automationIdentity.trim() || context.automationIdentity.toLowerCase().includes('person003')) {
      return reject('AUTOMATION_IDENTITY_FORBIDDEN', 'A dedicated non-personal Automation identity is required.');
    }
    if (!context.flowRunReference.trim() || Number.isNaN(Date.parse(context.trustedUtc))
      || Number.isNaN(Date.parse(context.source.createdUtc))
      || Date.parse(context.source.createdUtc) > Date.parse(context.trustedUtc)) {
      return reject('TRUSTED_METADATA_INVALID', 'Trusted time or flow metadata is invalid.');
    }
    if (context.command.commandType === 'CreateWorkplanAmendmentV2') {
      if (!amendmentReason) {
        return reject('AMENDMENT_REASON_REQUIRED', 'A human-readable amendment reason is required.', false);
      }
      validatedCommand = {
        ...context.command,
        payload: {
          ...context.command.payload,
          reason: amendmentReason,
          controlReference: typeof context.command.payload.controlReference === 'string'
            ? context.command.payload.controlReference.trim() : context.command.payload.controlReference
        }
      };
    }
    if (inspection.code) return reject(inspection.code, inspection.message || 'Payload validation failed.');
    if (directoryError) return reject('PEOPLE_DIRECTORY_AMBIGUOUS', directoryError);
    if (!subject) return reject('SUBJECT_NOT_FOUND', 'The canonical subject does not exist.');
    if (!canonicalSubjectIdentityValid(subject)) {
      return reject('CANONICAL_SUBJECT_IDENTITY_INVALID', 'Canonical SubjectKey is not bound to PersonKey and PerformanceYear.');
    }
    if (!actor) return reject('ACTOR_NOT_ACTIVE', 'SharePoint Author does not resolve to one active People row.');
    if (!role) return reject('AUTHORITY_DENIED', 'Current People and exact Delegation scope do not authorise this actor for the subject.');
    if (!isSec006CommandAllowedForSource(
      context.command.commandType, context.command.subjectType, context.source.listTitle
    )) {
      return reject('COMMAND_SOURCE_MISMATCH', 'The command type is not permitted on this trusted source list.');
    }
    const previousCommand = state.receipts.find(receipt => receipt.commandKey === context.command.commandKey);
    if (previousCommand && (previousCommand.sourceListId !== normaliseGuid(context.source.listId)
      || previousCommand.sourceItemId !== context.source.itemId
      || previousCommand.processedPayloadSha256 !== payloadSha)) {
      return reject('COMMAND_KEY_COLLISION', 'CommandKey is correlation only and was reused by a different source or payload.');
    }
    if (context.command.claimedPersonKey && context.command.claimedPersonKey !== subject.personKey) {
      return reject('SUBJECT_PERSON_MISMATCH', 'Claimed PersonKey does not match the canonical subject.');
    }
    if (context.command.claimedPerformanceYear !== undefined
      && context.command.claimedPerformanceYear !== subject.performanceYear) {
      return reject('SUBJECT_YEAR_MISMATCH', 'Claimed year does not match the canonical subject.');
    }
    if (context.command.subjectType !== subject.subjectType) {
      return reject('SUBJECT_TYPE_MISMATCH', 'Subject type does not match canonical data.');
    }
    if (!isSec006CommandAllowedForSubject(context.command.commandType, subject.subjectType)) {
      return reject('COMMAND_SUBJECT_TYPE_MISMATCH', 'The command type is not permitted for this canonical subject type.');
    }
    if (!Number.isInteger(context.command.expectedRowVersionToken) || context.command.expectedRowVersionToken <= 0
      || !context.command.expectedETag.trim() || context.command.expectedETag.trim() === '*') {
      return reject('CONCURRENCY_REQUIRED', 'An exact ETag and positive RowVersionToken are required.');
    }
    if (context.command.expectedETag !== subject.etag
      || context.command.expectedRowVersionToken !== subject.rowVersionToken) {
      return reject('STALE_WRITE', 'The canonical subject changed; reload before retrying.');
    }
    if (subject.transitionStatus === 'RecoveryHold') {
      return reject('RECOVERY_HOLD_ACTIVE', 'The subject is in RecoveryHold until controlled reconciliation completes.');
    }
    const stableValidation = stableKeyError(validatedCommand, subject, state);
    if (stableValidation) return reject(stableValidation.code, stableValidation.message);
    if (subject.locked && context.command.commandType !== 'CreateWorkplanAmendmentV2') {
      return reject('APPROVED_HISTORY_IMMUTABLE', 'Locked approved history cannot be rewritten.');
    }
    const lifecycleValidation = lifecycleError(validatedCommand.commandType, subject);
    if (lifecycleValidation) return reject(lifecycleValidation, 'The canonical lifecycle state does not permit this command.');
    const contributionValidation = contributionError(validatedCommand);
    if (contributionValidation) return reject(contributionValidation, 'The contribution proposal is missing governed method evidence.');
    if (context.command.commandType === 'CreateWorkplanAmendmentV2') {
      if (role !== 'SystemAdmin') {
        return reject('AMENDMENT_SYSTEM_ADMIN_REQUIRED', 'Only an active SystemAdmin may create the CONTROL amendment.');
      }
      if (!/^CONTROL-[A-Z0-9][A-Z0-9-]{4,}$/i.test(String(validatedCommand.payload.controlReference || ''))) {
        return reject('AMENDMENT_CONTROL_REFERENCE_REQUIRED', 'An exact CONTROL amendment/recovery reference is required.');
      }
      const controlCaseResolution = resolveControlCase(state, subject, validatedCommand, context.trustedUtc);
      if (!controlCaseResolution.controlCase) return reject(
        controlCaseResolution.code || 'AMENDMENT_CONTROL_CASE_NOT_AUTHORISED',
        controlCaseResolution.message || 'The CONTROL case is not active, exact and server-authorised for this Workplan.'
      );
      authorisedControlCase = controlCaseResolution.controlCase;
    } else if (role === 'SystemAdmin') {
      return reject('SYSTEM_ADMIN_NO_BUSINESS_DECISION', 'System Admin has technical recovery authority and cannot make business decisions.');
    }

    const approvedHistoryStart = state.approvedHistory.length;
    const auditStart = state.audit.length;
    const receiptStart = state.receipts.length;
    let before: ISec006CanonicalSubject | undefined;
    try {
      before = cloneSubject(subject);
      const result = this.mutationHandler(before, validatedCommand, role, context.trustedUtc);
      let next = cloneSubject(result.next);
      if (next.subjectKey !== subject.subjectKey || next.personKey !== subject.personKey
        || next.performanceYear !== subject.performanceYear || next.subjectType !== subject.subjectType) {
        return reject('PROTECTED_IDENTITY_MUTATION', 'A canonical identity field changed during mutation.');
      }
      if (result.resultKeys.some(key => key !== subject.subjectKey && !key.startsWith(`${subject.subjectKey}|`))) {
        return reject('RESULT_KEY_SUBJECT_MISMATCH', 'Mutation result keys are not bound to the canonical subject.');
      }
      if (context.command.commandType === 'CreateWorkplanAmendmentV2') {
        if (!authorisedControlCase) {
          return reject('AMENDMENT_CONTROL_CASE_NOT_AUTHORISED', 'No authoritative CONTROL case was resolved.');
        }
        authorisedConsumption = {
          controlCaseKey: authorisedControlCase.controlCaseKey,
          controlReference: String(validatedCommand.payload.controlReference),
          authorisedAction: 'CreateWorkplanAmendmentV2',
          subjectKey: subject.subjectKey,
          workplanKey: subject.subjectKey,
          workplanVersion: subject.workplanVersion,
          expectedETag: subject.etag,
          expectedRowVersionToken: subject.rowVersionToken,
          expectedStorageETag: authorisedControlCase.storageETag,
          expectedStorageRowVersionToken: authorisedControlCase.storageRowVersionToken,
          trustedUtc: context.trustedUtc,
          consumedAtUtc: context.trustedUtc,
          consumedCommandKey: context.command.commandKey,
          consumedSourceListId: normaliseGuid(context.source.listId),
          consumedSourceItemId: context.source.itemId,
          consumedSourceItemVersion: context.source.itemVersion
        };
        let consumptionResult: ReturnType<ISec006AuthoritativeControlCaseStore['compareAndSwapConsume']> | undefined;
        this.writeStage('ControlCase', () => {
          consumptionResult = state.controlCaseStore.compareAndSwapConsume(authorisedConsumption!);
        });
        if (!consumptionResult?.accepted || !consumptionResult.controlCase) {
          return reject(
            authoritativeControlCaseRejectionCode(consumptionResult?.code),
            'The authoritative CONTROL case conditional consume did not succeed.',
            false
          );
        }
        authorisedControlCase = consumptionResult.controlCase;
        const localCaseIndex = state.controlCases.findIndex(candidate =>
          candidate.controlCaseKey === authorisedControlCase!.controlCaseKey);
        if (localCaseIndex >= 0) state.controlCases[localCaseIndex] = { ...authorisedControlCase };
        if (authorisedControlCase.active || authorisedControlCase.consumedAtUtc !== context.trustedUtc
          || authorisedControlCase.consumedCommandKey !== context.command.commandKey
          || authorisedControlCase.consumedSourceListId !== normaliseGuid(context.source.listId)
          || authorisedControlCase.consumedSourceItemId !== context.source.itemId
          || authorisedControlCase.consumedSourceItemVersion !== context.source.itemVersion) {
          throw new Error('CONTROL case consumption did not read back the exact trusted source identity.');
        }
        const controlEvidence = {
          amendmentReason,
          amendmentControlReference: authorisedControlCase.controlReference,
          amendmentControlCaseKey: authorisedControlCase.controlCaseKey,
          amendmentControlCaseConsumedAtUtc: authorisedControlCase.consumedAtUtc
        };
        next = { ...next, values: { ...next.values, ...controlEvidence } };
        const history = {
          ...cloneSubject(subject),
          values: { ...subject.values, ...controlEvidence }
        };
        this.writeStage('ApprovedHistory', () => { state.approvedHistory.push(history); });
        if (state.approvedHistory[state.approvedHistory.length - 1] !== history) {
          throw new Error('Approved history I/O did not read back the staged immutable version.');
        }
      }
      this.writeStage('Canonical', () => { state.subjects.set(next.subjectKey, next); });
      if (state.subjects.get(next.subjectKey) !== next) {
        throw new Error('Canonical I/O did not read back the staged mutation.');
      }
      return this.finalise(context, state, payloadSha, role, 'Accepted', 'ACCEPTED',
        'Canonical mutation, Audit and readback completed.', before, next, result.resultKeys, true, true);
    } catch (error) {
      const partial = error as { name?: string; message?: string; afterPartialWrite?: Readonly<Record<string, unknown>> };
      const explicitPartial = error instanceof Sec006PartialFailureError
        || (partial.name === 'Sec006PartialFailureError' && Boolean(partial.afterPartialWrite));
      const canonicalChanged = state.subjects.get(subject.subjectKey) !== subject;
      const controlCaseConsumed = Boolean(authorisedControlCase?.consumedAtUtc);
      const stagedIo = controlCaseConsumed || canonicalChanged || state.approvedHistory.length > approvedHistoryStart
        || state.audit.length > auditStart || state.receipts.length > receiptStart;
      if (explicitPartial || stagedIo) {
        state.approvedHistory.splice(approvedHistoryStart);
        state.audit.splice(auditStart);
        state.receipts.splice(receiptStart);
        const recovery = {
          ...cloneSubject(before || subject), transitionStatus: 'RecoveryHold',
          values: { ...(before || subject).values, ...(explicitPartial ? partial.afterPartialWrite || {} : {}) }
        };
        state.subjects.set(subject.subjectKey, recovery);
        const code = explicitPartial ? 'PARTIAL_FAILURE_RECOVERY_HOLD' : 'PARTIAL_IO_RECOVERY_HOLD';
        if (authorisedConsumption) {
          const held = state.controlCaseStore.markRecoveryHold(
            authorisedConsumption, partial.message || 'Partial processor I/O failure.'
          );
          if (held.controlCase) {
            const localCaseIndex = state.controlCases.findIndex(candidate =>
              candidate.controlCaseKey === held.controlCase!.controlCaseKey);
            if (localCaseIndex >= 0) state.controlCases[localCaseIndex] = { ...held.controlCase };
          }
        }
        state.recoveryJournal.push({
          recoveryKey: `RECOVERY|${receiptKey}|${state.recoveryJournal.length + 1}`,
          receiptKey, subjectKey: subject.subjectKey, failureStage: this.lastIoStage || 'Mutation',
          message: partial.message || 'Partial processor I/O failure.', recordedAtUtc: context.trustedUtc,
          correlationKey: buildSec006CorrelationKey(context.source)
        });
        return this.finalise(context, state, payloadSha, role, 'RecoveryHold', code,
          partial.message || 'Partial processor I/O failure.', subject, recovery, [], false);
      }
      return this.finalise(context, state, payloadSha, role, 'Failed', 'PROCESSOR_FAILURE',
        error instanceof Error ? error.message : 'Unknown processor failure.', subject, subject, [], false);
    }
  }

  private writeStage(stage: Sec006IoStage, write: () => void): void {
    this.lastIoStage = stage;
    this.ioHooks.beforeWrite?.(stage);
    write();
    this.ioHooks.afterWrite?.(stage);
  }

  private finalise(
    context: ISec006ProcessContext,
    state: ISec006ProcessorState,
    payloadSha: string,
    role: Sec006EffectiveRole | 'Unresolved',
    outcome: Sec006ReceiptOutcome,
    code: string,
    message: string,
    beforeSubject: ISec006CanonicalSubject | undefined,
    afterSubject: ISec006CanonicalSubject | undefined,
    resultKeys: readonly string[],
    mutationApplied: boolean,
    useIoHooks: boolean = false,
    persist: boolean = true
  ): ISec006ProcessResult {
    let audit: ISec006AuditRecord | undefined;
    const appendAudit = (): void => {
      audit = this.appendAudit(context, state, payloadSha, role, outcome, code,
        beforeSubject?.values || {}, afterSubject?.values || {});
    };
    if (persist) {
      if (useIoHooks) this.writeStage('Audit', appendAudit);
      else appendAudit();
      if (!audit) throw new Error('Audit append did not return an authoritative record.');
      if (state.audit[state.audit.length - 1] !== audit) throw new Error('Audit I/O did not read back the staged record.');
    }
    const actors = state.people.filter(person => person.active
      && person.email.toLowerCase() === context.source.authorEmail.toLowerCase());
    const actor = actors.length === 1 ? actors[0] : undefined;
    const subject = afterSubject || beforeSubject;
    const receipt: ISec006CommandReceiptRecord = {
      receiptKey: buildSec006ReceiptKey(context.source.listId, context.source.itemId),
      sourceListId: normaliseGuid(context.source.listId),
      sourceItemId: context.source.itemId,
      sourceItemVersion: context.source.itemVersion,
      commandKey: context.command.commandKey,
      commandType: context.command.commandType,
      subjectType: context.command.subjectType,
      subjectKey: context.command.subjectKey,
      personKey: subject?.personKey || '',
      performanceYear: subject?.performanceYear || 0,
      authenticatedActorEmail: context.source.authorEmail,
      authenticatedActorPersonKey: actor?.personKey || '',
      effectiveRole: role,
      processedByEmail: context.automationIdentity,
      processedAtUtc: context.trustedUtc,
      outcome,
      validationCode: code,
      message,
      processedPayloadSha256: payloadSha,
      resultKeys,
      auditKeys: audit ? [audit.auditKey] : [],
      correlationKey: buildSec006CorrelationKey(context.source),
      flowRunReference: context.flowRunReference
    };
    if (persist) {
      const appendReceipt = (): void => { state.receipts.push(receipt); };
      if (useIoHooks) this.writeStage('Receipt', appendReceipt);
      else appendReceipt();
      if (state.receipts[state.receipts.length - 1] !== receipt) {
        throw new Error('Receipt I/O did not read back the staged record.');
      }
    }
    return { receipt, mutationApplied, replayed: false };
  }

  private appendAudit(
    context: ISec006ProcessContext,
    state: ISec006ProcessorState,
    payloadSha: string,
    role: Sec006EffectiveRole | 'Unresolved',
    outcome: Sec006ReceiptOutcome,
    code: string,
    before: Readonly<Record<string, unknown>>,
    after: Readonly<Record<string, unknown>>
  ): ISec006AuditRecord {
    const audit: ISec006AuditRecord = {
      auditKey: `AUDIT|${buildSec006ReceiptKey(context.source.listId, context.source.itemId)}|${state.audit.length + 1}`,
      eventType: outcome === 'Accepted' ? 'CommandAccepted'
        : outcome === 'Duplicate' ? 'CommandDuplicate'
          : outcome === 'RecoveryHold' ? 'RecoveryHoldEntered'
            : outcome === 'Failed' ? 'CommandFailed' : 'CommandRejected',
      subjectKey: context.command.subjectKey,
      actorEmail: context.source.authorEmail,
      effectiveRole: role,
      eventAtUtc: context.trustedUtc,
      sourceListId: normaliseGuid(context.source.listId),
      sourceItemId: context.source.itemId,
      sourceItemVersion: context.source.itemVersion,
      payloadSha256: payloadSha,
      outcome,
      validationCode: code,
      before,
      after,
      correlationKey: buildSec006CorrelationKey(context.source)
    };
    state.audit.push(audit);
    return audit;
  }
}
