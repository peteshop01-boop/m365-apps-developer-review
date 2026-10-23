import type { IEmployeeV2CommandReceipt } from '../models/EmployeeWorkplanV2PersistenceModels';
import type {
  IEmployeeV2AnnualCommandRequest,
  IEmployeeV2TransportResult
} from './EmployeeWorkplanV2CommandTransport';
import { normaliseEmployeeV2CommandPayload } from './EmployeeWorkplanV2CommandTransport';
import { isEmployeeV2StableCommandKey } from './EmployeeWorkplanV2PersistencePolicy';
import { hashC2bCanonical, type C2bPreflightResult } from './TestPilotCommandAdmissionC2b';

export type IEmployeeV2C2bAnnualCommandRequest = Omit<IEmployeeV2AnnualCommandRequest, 'commandType'> & {
  commandType: IEmployeeV2AnnualCommandRequest['commandType'] | 'UpsertBehaviourCommitmentV2';
};

export interface IC2bAnnualCanonicalProof {
  workplanKey: string;
  rowVersionToken: number;
  etag: string;
  itemKeys: string[];
  auditKeys: string[];
}
export type IC2bCreateCanonicalProof = IC2bAnnualCanonicalProof;

export interface IC2bAnnualCommandResult {
  receipt: IEmployeeV2CommandReceipt;
  replayed: boolean;
  canonicalProof: IC2bAnnualCanonicalProof;
}
export type IC2bCreateCommandResult = IC2bAnnualCommandResult;

export interface IEmployeeWorkplanV2C2bCommandGateway {
  executeAnnualCommand(request: IEmployeeV2C2bAnnualCommandRequest): Promise<IC2bAnnualCommandResult>;
  executeCreateWorkplanDraft(request: IEmployeeV2AnnualCommandRequest): Promise<IC2bCreateCommandResult>;
}

export type C2bCommandSubmitter = (request: IEmployeeV2C2bAnnualCommandRequest) => Promise<IEmployeeV2TransportResult>;

interface IC2bEnvelopeContract {
  route: 'Employee' | 'Manager';
  subjectType: 'Workplan' | 'WorkplanItem';
  requiredPayload: readonly string[];
  optionalPayload: readonly string[];
}

const CONTRACTS: Readonly<Record<IEmployeeV2C2bAnnualCommandRequest['commandType'], IC2bEnvelopeContract>> = Object.freeze({
  CreateWorkplanDraft: { route: 'Employee', subjectType: 'Workplan', requiredPayload: [], optionalPayload: [] },
  UpdateWorkplanDraftV2: { route: 'Employee', subjectType: 'Workplan',
    requiredPayload: ['coreCategoryWeight', 'personalCategoryWeight', 'behaviourCategoryWeight'],
    optionalPayload: ['categoryWeightReason', 'zeroPersonalProposal'] },
  UpsertCoreContributionV2: { route: 'Employee', subjectType: 'WorkplanItem',
    requiredPayload: ['kpiId', 'role', 'contributionMethod', 'quarterTargets', 'displayOrder', 'activeInWorkplan'],
    optionalPayload: ['annualTargetValue', 'annualTargetText', 'sharedTargetRule', 'sharedApportionmentPercent',
      'governanceReference', 'denominatorNumerator', 'denominatorValue', 'denominatorUnit',
      'denominatorRuleReference', 'denominatorSourceReference'] },
  UpsertPersonalItemV2: { route: 'Employee', subjectType: 'WorkplanItem',
    requiredPayload: ['wording', 'measure', 'unitLabel', 'displayOrder', 'activeInWorkplan'],
    optionalPayload: ['description', 'measureType', 'scoringDirection', 'percentageSourceScale', 'baselineValue',
      'yearEndTargetValue', 'yearEndTargetText', 'q1TargetValue', 'q1TargetText', 'q2TargetValue', 'q2TargetText',
      'q3TargetValue', 'q3TargetText', 'q4TargetValue', 'q4TargetText', 'personalItemWeight'] },
  UpsertBehaviourCommitmentV2: { route: 'Employee', subjectType: 'WorkplanItem',
    requiredPayload: ['behaviourId', 'selectedSuggestionKeys', 'commitment', 'periodCommitments',
      'displayOrder', 'activeInWorkplan'], optionalPayload: ['selections'] },
  SetCoreWeightingV2: { route: 'Employee', subjectType: 'Workplan', requiredPayload: ['mode'], optionalPayload: ['customWeights'] },
  SubmitWorkplan: { route: 'Employee', subjectType: 'Workplan', requiredPayload: [], optionalPayload: [] },
  RequestWorkplanChanges: { route: 'Manager', subjectType: 'Workplan', requiredPayload: ['reason'], optionalPayload: [] },
  ApproveAndLockWorkplan: { route: 'Manager', subjectType: 'Workplan', requiredPayload: [], optionalPayload: [] },
  CreateWorkplanAmendmentV2: { route: 'Manager', subjectType: 'Workplan',
    requiredPayload: ['reason', 'controlReference'], optionalPayload: [] }
});

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const normalGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const fail = (message: string): never => { throw new Error(message); };

function exactObject(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('C2b command gateway rejected an invalid object.');
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (required.some(key => !Object.prototype.hasOwnProperty.call(object, key))
    || keys.some(key => !required.includes(key) && !optional.includes(key))) {
    return fail('C2b command gateway rejected unknown or missing admitted-envelope fields.');
  }
  return object;
}

function normaliseAndValidateRequest(request: IEmployeeV2C2bAnnualCommandRequest): IEmployeeV2C2bAnnualCommandRequest {
  const contract = CONTRACTS[request.commandType];
  if (!contract) return fail('C2b annual command is not an implemented settled route.');
  const admittedKeys = ['route', 'commandKey', 'commandType', 'subjectType', 'subjectKey', 'personKey',
    'performanceYear', 'expectedRowVersionToken', 'expectedHeaderETag', 'expectedItemETag', 'payload'];
  const payload = normaliseEmployeeV2CommandPayload(request.payload) as Record<string, unknown>;
  exactObject(payload, contract.requiredPayload, contract.optionalPayload);
  const workplanKey = `${request.personKey}|${request.performanceYear}`;
  const creating = request.commandType === 'CreateWorkplanDraft';
  const headerSubject = contract.subjectType === 'Workplan';
  if (Object.keys(request).some(key => !admittedKeys.includes(key))
    || !isEmployeeV2StableCommandKey(request.commandKey) || request.route !== contract.route
    || request.subjectType !== contract.subjectType || !nonBlank(request.personKey)
    || !Number.isSafeInteger(request.performanceYear) || request.performanceYear < 2000
    || headerSubject && request.subjectKey !== workplanKey
    || !headerSubject && (!nonBlank(request.subjectKey) || request.subjectKey === workplanKey)
    || request.quarter !== undefined
    || creating && (request.expectedHeaderETag !== undefined
      || request.expectedItemETag !== undefined || request.expectedRowVersionToken !== undefined)
    || !creating && (!nonBlank(request.expectedHeaderETag) || request.expectedHeaderETag === '*'
      || headerSubject && request.expectedItemETag !== undefined
      || request.expectedItemETag === '*'
      || !Number.isSafeInteger(request.expectedRowVersionToken) || (request.expectedRowVersionToken || 0) < 1)) {
    return fail('C2b annual command request is forged, stale or outside its exact admitted envelope.');
  }
  return { ...request, payload };
}

function parseCanonicalProof(receipt: IEmployeeV2CommandReceipt): IC2bAnnualCanonicalProof {
  let rawResult: unknown;
  let rawAudit: unknown;
  try {
    rawResult = JSON.parse(receipt.resultKeysJson) as unknown;
    rawAudit = JSON.parse(receipt.auditKeysJson) as unknown;
  } catch {
    return fail('C2b terminal receipt contains invalid canonical or audit JSON.');
  }
  if (!Array.isArray(rawResult) || rawResult.length !== 1 || !Array.isArray(rawAudit) || rawAudit.length < 1
    || rawAudit.some(value => !nonBlank(value)) || new Set(rawAudit as string[]).size !== rawAudit.length) {
    return fail('C2b terminal receipt does not contain one canonical result and immutable audit evidence.');
  }
  const rawProof = rawResult[0] as Record<string, unknown>;
  const hasItems = Boolean(rawProof && Object.prototype.hasOwnProperty.call(rawProof, 'itemKeys'));
  const result = exactObject(rawProof, ['workplanKey', 'rowVersionToken', 'etag'], hasItems ? ['itemKeys'] : []);
  const itemKeys = hasItems ? result.itemKeys : [];
  if (!nonBlank(result.workplanKey) || !Number.isSafeInteger(result.rowVersionToken) || (result.rowVersionToken as number) < 1
    || !nonBlank(result.etag) || result.etag === '*' || !Array.isArray(itemKeys)
    || itemKeys.some(value => !nonBlank(value)) || new Set(itemKeys as string[]).size !== itemKeys.length) {
    return fail('C2b terminal receipt canonical result is incomplete.');
  }
  return {
    workplanKey: result.workplanKey,
    rowVersionToken: result.rowVersionToken as number,
    etag: result.etag,
    itemKeys: itemKeys as string[],
    auditKeys: rawAudit as string[]
  };
}

export class DisabledEmployeeWorkplanV2C2bCommandGateway implements IEmployeeWorkplanV2C2bCommandGateway {
  public executeAnnualCommand(_request: IEmployeeV2C2bAnnualCommandRequest): Promise<IC2bAnnualCommandResult> {
    return Promise.reject(new Error('C2B_DISABLED: the governed command processor composition is absent or disabled.'));
  }

  public executeCreateWorkplanDraft(request: IEmployeeV2AnnualCommandRequest): Promise<IC2bCreateCommandResult> {
    return this.executeAnnualCommand(request);
  }
}

export const DISABLED_EMPLOYEE_WORKPLAN_C2B_GATEWAY: IEmployeeWorkplanV2C2bCommandGateway =
  Object.freeze(new DisabledEmployeeWorkplanV2C2bCommandGateway());

/**
 * Locally validated gateway. It owns no HTTP client, tenant URL, list title, connector or credential.
 * Its injected submitter is usable only after a complete independently observed C2b preflight.
 */
export class LocallyValidatedEmployeeWorkplanV2C2bCommandGateway implements IEmployeeWorkplanV2C2bCommandGateway {
  public constructor(private readonly preflight: C2bPreflightResult, private readonly submit: C2bCommandSubmitter) {}

  public executeCreateWorkplanDraft(request: IEmployeeV2AnnualCommandRequest): Promise<IC2bCreateCommandResult> {
    if (request.commandType !== 'CreateWorkplanDraft') {
      return Promise.reject(new Error('C2b CreateWorkplanDraft gateway received a different command type.'));
    }
    return this.executeAnnualCommand(request);
  }

  public async executeAnnualCommand(requestValue: IEmployeeV2C2bAnnualCommandRequest): Promise<IC2bAnnualCommandResult> {
    if (!this.preflight.ready) return fail(`${this.preflight.code}: C2b preflight did not establish a complete local composition.`);
    const request = normaliseAndValidateRequest(requestValue);
    const purpose = request.route === 'Employee' ? 'EmployeeCommands' : 'ManagerCommands';
    const commandList = this.preflight.configuration.lists.find(list => list.purpose === purpose);
    if (!commandList?.listId) return fail(`C2B_UNBOUND: ${purpose} list identity is absent.`);

    const submitted = await this.submit(request);
    const receipt = submitted.receipt;
    const sourceListId = normalGuid(receipt.sourceListId);
    const receiptPrefix = `${sourceListId}|${receipt.sourceItemId}|${receipt.sourceItemVersion}`;
    const expectedRole = request.commandType === 'CreateWorkplanAmendmentV2' ? 'SystemAdmin'
      : request.route === 'Manager' ? 'Manager' : 'Employee';
    if (receipt.commandKey !== request.commandKey || receipt.commandType !== request.commandType
      || receipt.subjectType !== request.subjectType || receipt.subjectKey !== request.subjectKey
      || receipt.personKey !== request.personKey || receipt.performanceYear !== request.performanceYear
      || (receipt.quarter || undefined) !== undefined || receipt.effectiveRole !== expectedRole
      || (expectedRole === 'Employee'
        ? receipt.authenticatedActorPersonKey !== request.personKey
        : receipt.authenticatedActorPersonKey === request.personKey)
      || (receipt.outcome !== 'Accepted' && receipt.outcome !== 'Duplicate')
      || !nonBlank(receipt.receiptKey) || !GUID.test(sourceListId)
      || sourceListId !== normalGuid(commandList.listId) || !receipt.receiptKey.toLowerCase().startsWith(receiptPrefix.toLowerCase())
      || !Number.isSafeInteger(receipt.sourceItemId) || receipt.sourceItemId < 1 || !nonBlank(receipt.sourceItemVersion)
      || !nonBlank(receipt.authenticatedActorEmail) || !nonBlank(receipt.processedByEmail)
      || !Number.isFinite(Date.parse(receipt.processedAt)) || !SHA256.test(receipt.processedPayloadSha256)
      || receipt.processedPayloadSha256.toUpperCase() !== hashC2bCanonical(request.payload)
      || (receipt.outcome === 'Accepted' ? receipt.validationCode !== 'ACCEPTED' : receipt.validationCode !== 'DUPLICATE_ACCEPTED')
      || !nonBlank(receipt.correlationKey) || receipt.correlationKey === request.commandKey || !nonBlank(receipt.flowRunReference)) {
      return fail('C2b command did not return a reconciled terminal accepted receipt.');
    }
    const canonicalProof = parseCanonicalProof(receipt);
    const expectedWorkplanKey = `${request.personKey}|${request.performanceYear}`;
    const expectedToken = request.commandType === 'CreateWorkplanDraft'
      ? 2 : (request.expectedRowVersionToken as number) + 2;
    if (canonicalProof.workplanKey !== expectedWorkplanKey || canonicalProof.rowVersionToken !== expectedToken
      || request.subjectType === 'WorkplanItem' && !canonicalProof.itemKeys.includes(request.subjectKey)) {
      return fail('C2b terminal receipt does not prove the exact expected+2 canonical Workplan and affected item.');
    }
    return { receipt, replayed: submitted.replayed || receipt.outcome === 'Duplicate', canonicalProof };
  }
}
