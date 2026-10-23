/* eslint-disable @rushstack/no-new-null -- C2b admitted absence is represented explicitly on the wire */
import { SPHttpClient, type SPHttpClientResponse } from '@microsoft/sp-http';
import type {
  EmployeeV2CommandType,
  EmployeeV2SubjectType,
  IEmployeeV2CommandReceipt
} from '../models/EmployeeWorkplanV2PersistenceModels';
import type { QuarterKey } from '../models/QuarterlyModels';
import {
  assertEmployeeV2BindingsForRuntime,
  EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS,
  type IEmployeeWorkplanV2ListBindings
} from './EmployeeWorkplanV2ListBindings';

export interface IEmployeeV2CommandRequest {
  route: 'Employee' | 'Manager';
  commandKey: string;
  commandType: EmployeeV2CommandType;
  subjectType: EmployeeV2SubjectType;
  subjectKey: string;
  personKey: string;
  performanceYear: number;
  quarter?: QuarterKey;
  expectedRowVersionToken?: number;
  expectedETag?: string;
  /** Exact canonical header ETag admitted by C2b; never a wildcard. */
  expectedHeaderETag?: string;
  /** Exact existing item ETag, or undefined for an admitted create. */
  expectedItemETag?: string;
  payload: object;
}

export type EmployeeV2AnnualImplementedCommandType =
  | 'CreateWorkplanDraft'
  | 'UpdateWorkplanDraftV2'
  | 'UpsertCoreContributionV2'
  | 'UpsertPersonalItemV2'
  | 'SetCoreWeightingV2'
  | 'SubmitWorkplan'
  | 'RequestWorkplanChanges'
  | 'ApproveAndLockWorkplan'
  | 'CreateWorkplanAmendmentV2';

export interface IEmployeeV2AnnualCommandRequest extends Omit<IEmployeeV2CommandRequest,
  'commandType' | 'subjectType' | 'quarter' | 'expectedETag'> {
  commandType: EmployeeV2AnnualImplementedCommandType;
  subjectType: 'Workplan' | 'WorkplanItem';
  quarter?: never;
  /** The legacy ambiguous ETag field is prohibited on the annual v2 boundary. */
  expectedETag?: never;
}

export interface IEmployeeV2AnnualAdmissionEnvelope {
  schemaVersion: 'kcf.kpi.test-command.v2';
  binding: {
    commandKey: string;
    commandType: EmployeeV2AnnualImplementedCommandType;
    subjectType: 'Workplan' | 'WorkplanItem';
    subjectKey: string;
    personKey: string;
    performanceYear: number;
    workplanKey: string;
  };
  expected: {
    header: { presence: 'Absent'; token: '0'; etag: null }
      | { presence: 'Present'; token: string; etag: string };
    item: { presence: 'NotApplicable' | 'Absent' } | { presence: 'Present'; etag: string };
  };
  payload: object;
}

export interface IEmployeeV2TransportResult {
  receipt: IEmployeeV2CommandReceipt;
  replayed: boolean;
}

interface ICommandPostReadback { Id: number; }
interface IODataCollection<T> { value: T[]; }

interface ICommandReceiptRow {
  ReceiptKey: string;
  SourceListId: string;
  SourceItemId: number;
  SourceItemVersion: string;
  CommandKey: string;
  CommandType: EmployeeV2CommandType;
  SubjectType: EmployeeV2SubjectType;
  SubjectKey: string;
  PersonKey: string;
  PerformanceYear: number;
  Quarter?: QuarterKey;
  AuthenticatedActorEmail: string;
  AuthenticatedActorPersonKey: string;
  EffectiveRole: IEmployeeV2CommandReceipt['effectiveRole'];
  ProcessedByEmail: string;
  ProcessedAt: string;
  Outcome: IEmployeeV2CommandReceipt['outcome'];
  ValidationCode: string;
  Message: string;
  ProcessedPayloadSHA256: string;
  ResultKeysJSON: string;
  AuditKeysJSON: string;
  CorrelationKey: string;
  FlowRunReference: string;
}

const RECEIPT_SELECT = [
  'ReceiptKey', 'SourceListId', 'SourceItemId', 'SourceItemVersion',
  'CommandKey', 'CommandType', 'SubjectType', 'SubjectKey',
  'PersonKey', 'PerformanceYear', 'Quarter', 'AuthenticatedActorEmail',
  'AuthenticatedActorPersonKey', 'EffectiveRole', 'ProcessedByEmail',
  'ProcessedAt', 'Outcome', 'ValidationCode', 'Message',
  'ProcessedPayloadSHA256', 'ResultKeysJSON', 'AuditKeysJSON',
  'CorrelationKey', 'FlowRunReference'
].join(',');

const EMPLOYEE_COMMANDS = 'KCFKPI_EmployeeCommands';
const MANAGER_COMMANDS = 'KCFKPI_ManagerCommands';
const RECEIPTS = 'KCFKPI_CommandReceipts';
const CLIENT_VERSION = 'KCF-KPI-027A';
const DEFAULT_LIST_BINDINGS: Readonly<IEmployeeWorkplanV2ListBindings> = Object.freeze({
  ...EMPLOYEE_V2_PRODUCTION_LIST_BINDINGS,
  employeeCommands: EMPLOYEE_COMMANDS,
  managerCommands: MANAGER_COMMANDS,
  commandReceipts: RECEIPTS,
  clientVersion: CLIENT_VERSION
});

export interface IEmployeeV2TransportOptions {
  maxReceiptAttempts?: number;
  waitForNextReceiptAttempt?: () => Promise<void>;
  listBindings?: Readonly<IEmployeeWorkplanV2ListBindings>;
}

function exactJsonValue(value: unknown, path: string): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`The Employee V2 command payload contains a non-finite number at ${path}.`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((item, index) => {
    if (item === undefined) throw new Error(`The Employee V2 command payload contains undefined array data at ${path}[${index}].`);
    return exactJsonValue(item, `${path}[${index}]`);
  });
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    const result: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).forEach(key => {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) result[key] = exactJsonValue(child, `${path}.${key}`);
    });
    return result;
  }
  throw new Error(`The Employee V2 command payload contains non-JSON data at ${path}.`);
}

/** The exact JSON object placed in PayloadJSON; optional undefined object fields are omitted once. */
export const normaliseEmployeeV2CommandPayload = (payload: object): object => {
  const normal = exactJsonValue(payload, 'payload');
  if (!normal || typeof normal !== 'object' || Array.isArray(normal)) {
    throw new Error('The Employee V2 command payload must be one exact JSON object.');
  }
  return normal as object;
};

const ANNUAL_IMPLEMENTED_COMMANDS: readonly EmployeeV2AnnualImplementedCommandType[] = Object.freeze([
  'CreateWorkplanDraft', 'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2', 'UpsertPersonalItemV2',
  'SetCoreWeightingV2', 'SubmitWorkplan', 'RequestWorkplanChanges', 'ApproveAndLockWorkplan',
  'CreateWorkplanAmendmentV2'
]);

const isAnnualImplementedRequest = (request: IEmployeeV2CommandRequest): request is IEmployeeV2AnnualCommandRequest =>
  ANNUAL_IMPLEMENTED_COMMANDS.includes(request.commandType as EmployeeV2AnnualImplementedCommandType)
  && (request.subjectType === 'Workplan' || request.subjectType === 'WorkplanItem') && request.quarter === undefined;

export const createEmployeeV2AnnualAdmissionEnvelope = (
  request: IEmployeeV2AnnualCommandRequest
): IEmployeeV2AnnualAdmissionEnvelope => {
  const creating = request.commandType === 'CreateWorkplanDraft';
  const legacyETag = (request as IEmployeeV2CommandRequest).expectedETag;
  const headerETag = request.expectedHeaderETag;
  const itemETag = request.expectedItemETag;
  if (legacyETag !== undefined
    || creating && (request.expectedRowVersionToken !== undefined || headerETag !== undefined || itemETag !== undefined)
    || !creating && (!Number.isSafeInteger(request.expectedRowVersionToken)
      || (request.expectedRowVersionToken || 0) < 1 || !headerETag?.trim() || headerETag === '*')
    || request.subjectType === 'Workplan' && itemETag !== undefined
    || request.subjectType === 'WorkplanItem' && itemETag !== undefined && (!itemETag.trim() || itemETag === '*')) {
    throw new Error('The annual v2 command must use only its exact header token/ETag and item ETag fields.');
  }
  return {
    schemaVersion: 'kcf.kpi.test-command.v2',
    binding: {
      commandKey: request.commandKey, commandType: request.commandType,
      subjectType: request.subjectType, subjectKey: request.subjectKey,
      personKey: request.personKey, performanceYear: request.performanceYear,
      workplanKey: `${request.personKey}|${request.performanceYear}`
    },
    expected: {
      header: creating ? { presence: 'Absent', token: '0', etag: null }
        : { presence: 'Present', token: String(request.expectedRowVersionToken), etag: headerETag! },
      item: request.subjectType === 'Workplan' ? { presence: 'NotApplicable' }
        : itemETag ? { presence: 'Present', etag: itemETag } : { presence: 'Absent' }
    },
    payload: normaliseEmployeeV2CommandPayload(request.payload)
  };
};

const serializeEmployeeV2Row = (request: IEmployeeV2CommandRequest,
  bindings: Readonly<IEmployeeWorkplanV2ListBindings>, submittedAt: string, payload: object,
  annualEnvelope?: IEmployeeV2AnnualAdmissionEnvelope): string => JSON.stringify({
    Title: `${request.commandType} ${request.subjectKey}`,
    CommandKey: request.commandKey,
    CommandType: request.commandType,
    SubjectType: request.subjectType,
    SubjectKey: request.subjectKey,
    PersonKey: request.personKey,
    PerformanceYear: request.performanceYear,
    Quarter: annualEnvelope ? null : request.quarter,
    ExpectedRowVersionToken: annualEnvelope ? null : request.expectedRowVersionToken,
    ExpectedETag: annualEnvelope ? annualEnvelope.expected.header.etag : request.expectedETag,
    PayloadJSON: JSON.stringify(payload),
    ClientVersion: bindings.clientVersion || CLIENT_VERSION,
    ClientSubmittedAt: submittedAt,
    ClientCorrelationKey: request.commandKey,
    ...(bindings.testRunKey ? { TestRunKey: bindings.testRunKey } : {})
  });

/** Executable equivalent of the generated C2b Outer_Binding gate for one actual posted row. */
export function employeeV2AnnualOuterBinding(row: Readonly<Record<string, unknown>>): boolean {
  let envelope: IEmployeeV2AnnualAdmissionEnvelope;
  try {
    envelope = JSON.parse(String(row.PayloadJSON)) as IEmployeeV2AnnualAdmissionEnvelope;
  } catch {
    return false;
  }
  const binding = envelope?.binding;
  const header = envelope?.expected?.header;
  return envelope?.schemaVersion === 'kcf.kpi.test-command.v2'
    && row.CommandKey === binding?.commandKey && row.CommandType === binding?.commandType
    && row.SubjectType === binding?.subjectType && row.SubjectKey === binding?.subjectKey
    && row.PersonKey === binding?.personKey && row.PerformanceYear === binding?.performanceYear
    && row.ExpectedRowVersionToken === null && row.Quarter === null
    && row.ClientCorrelationKey === binding?.commandKey && row.ExpectedETag === header?.etag;
}

/** Pure legacy/shared serializer. Calling it neither queues a command nor supplies server authority. */
export const serializeEmployeeV2Command = (request: IEmployeeV2CommandRequest,
  bindings: Readonly<IEmployeeWorkplanV2ListBindings>, submittedAt: string): string =>
  serializeEmployeeV2Row(request, bindings, submittedAt,
    (request.payload as { schemaVersion?: string }).schemaVersion === 'kcf.kpi.test-command.v2'
      ? request.payload : normaliseEmployeeV2CommandPayload(request.payload));

/** Pure C2b serializer: PayloadJSON is the exact admitted envelope, not only the business payload. */
export const serializeEmployeeV2AnnualCommand = (request: IEmployeeV2AnnualCommandRequest,
  bindings: Readonly<IEmployeeWorkplanV2ListBindings>, submittedAt: string): string => {
  const envelope = createEmployeeV2AnnualAdmissionEnvelope(request);
  const serialized = serializeEmployeeV2Row(request, bindings, submittedAt, envelope, envelope);
  if (!employeeV2AnnualOuterBinding(JSON.parse(serialized) as Record<string, unknown>)) {
    throw new Error('The annual v2 command row does not cross the authoritative C2b Outer_Binding contract.');
  }
  return serialized;
};

export default class EmployeeWorkplanV2CommandTransport {
  private readonly maxReceiptAttempts: number;
  private readonly waitForNextReceiptAttempt: () => Promise<void>;
  private readonly listBindings: Readonly<IEmployeeWorkplanV2ListBindings>;

  public constructor(
    private readonly spHttpClient: SPHttpClient,
    private readonly webAbsoluteUrl: string,
    private readonly authenticatedEmail: string,
    options: IEmployeeV2TransportOptions = {}
  ) {
    this.maxReceiptAttempts = options.maxReceiptAttempts || 40;
    this.waitForNextReceiptAttempt = options.waitForNextReceiptAttempt || (() => new Promise(resolve => setTimeout(resolve, 250)));
    this.listBindings = options.listBindings || DEFAULT_LIST_BINDINGS;
    assertEmployeeV2BindingsForRuntime(this.listBindings);
  }

  public execute(request: IEmployeeV2CommandRequest): Promise<IEmployeeV2TransportResult> {
    return this.executeRequest(request, false);
  }

  public executeAnnual(request: IEmployeeV2AnnualCommandRequest): Promise<IEmployeeV2TransportResult> {
    return this.executeRequest({ ...request, payload: normaliseEmployeeV2CommandPayload(request.payload) }, true);
  }

  private async executeRequest(request: IEmployeeV2CommandRequest, annual: boolean): Promise<IEmployeeV2TransportResult> {
    if (!annual && (request.payload as { schemaVersion?: string }).schemaVersion === 'kcf.kpi.test-command.v2') {
      throw new Error('TEST wire-v2 requires its uninstalled trusted processor route; legacy transport cannot enqueue it.');
    }
    if (request.route !== 'Employee' && request.route !== 'Manager') {
      throw new Error('The Employee V2 command route is not authorised.');
    }
    const existing = await this.findReceipt(request.commandKey);
    if (existing) return { receipt: this.assertReceipt(request, existing), replayed: true };

    const listTitle = request.route === 'Employee'
      ? this.listBindings.employeeCommands : this.listBindings.managerCommands;
    const response = await this.spHttpClient.post(this.listItemsUrl(listTitle), SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        Prefer: 'return=representation'
      },
      body: annual && isAnnualImplementedRequest(request)
        ? serializeEmployeeV2AnnualCommand(request, this.listBindings, new Date().toISOString())
        : serializeEmployeeV2Command(request, this.listBindings, new Date().toISOString())
    });
    if (!response.ok && response.status !== 409) {
      throw new Error('The Employee V2 command could not be queued safely. No persisted success is assumed.');
    }
    let postedSourceItemId: number | undefined;
    if (response.ok) {
      const posted = await response.json() as ICommandPostReadback;
      if (!posted.Id) throw new Error('The Employee V2 command did not return its SharePoint item identity.');
      postedSourceItemId = posted.Id;
    }

    const receipt = await this.waitForReceipt(request.commandKey);
    const reconciled = this.assertReceipt(request, receipt, postedSourceItemId);
    return { receipt: reconciled, replayed: reconciled.outcome === 'Duplicate' };
  }

  private async waitForReceipt(commandKey: string): Promise<IEmployeeV2CommandReceipt> {
    for (let attempt = 0; attempt < this.maxReceiptAttempts; attempt += 1) {
      const receipt = await this.findReceipt(commandKey);
      if (receipt) return receipt;
      if (attempt < this.maxReceiptAttempts - 1) await this.waitForNextReceiptAttempt();
    }
    throw new Error('The Employee V2 command is still pending. Reload its receipt before assuming any persisted change.');
  }

  private async findReceipt(commandKey: string): Promise<IEmployeeV2CommandReceipt | undefined> {
    const filter = encodeURIComponent(`CommandKey eq '${this.escapeOData(commandKey)}'`);
    const url = `${this.listItemsUrl(this.listBindings.commandReceipts || RECEIPTS)}?$select=${RECEIPT_SELECT}&$filter=${filter}&$orderby=ProcessedAt desc&$top=2`;
    const response = await this.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' }
    });
    await this.ensureSuccess(response, 'The Employee V2 command receipt could not be read.');
    const result = await response.json() as IODataCollection<ICommandReceiptRow>;
    if (result.value.length > 1) throw new Error('More than one immutable receipt exists for this command.');
    return result.value[0] ? this.mapReceipt(result.value[0]) : undefined;
  }

  private assertReceipt(
    request: IEmployeeV2CommandRequest,
    receipt: IEmployeeV2CommandReceipt,
    postedSourceItemId?: number
  ): IEmployeeV2CommandReceipt {
    if (receipt.commandKey !== request.commandKey || receipt.commandType !== request.commandType
      || receipt.subjectType !== request.subjectType || receipt.subjectKey !== request.subjectKey
      || receipt.personKey !== request.personKey || receipt.performanceYear !== request.performanceYear
      || (receipt.quarter || undefined) !== (request.quarter || undefined)) {
      throw new Error('The command receipt does not reconcile to the submitted Employee V2 request.');
    }
    const sourceListId = receipt.sourceListId.replace(/[{}]/g, '').trim().toLowerCase();
    const expectedReceiptKey = `${sourceListId}|${receipt.sourceItemId}`;
    const expectedTestSourceId = request.route === 'Employee'
      ? this.listBindings.listIds?.employeeCommands : this.listBindings.listIds?.managerCommands;
    const testReceiptPrefix = `${expectedReceiptKey}|${receipt.sourceItemVersion}|ETAG|`;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(sourceListId)
      || !Number.isInteger(receipt.sourceItemId) || receipt.sourceItemId <= 0
      || !receipt.sourceItemVersion.trim()
      || (expectedTestSourceId
        ? sourceListId !== expectedTestSourceId.toLowerCase()
          || !receipt.receiptKey.trim().toLowerCase().startsWith(testReceiptPrefix.toLowerCase())
          || receipt.receiptKey.trim().length <= testReceiptPrefix.length
        : receipt.receiptKey.trim().toLowerCase() !== expectedReceiptKey)
      || (postedSourceItemId !== undefined && postedSourceItemId !== receipt.sourceItemId)) {
      throw new Error('The command receipt is missing its trusted source-list, item or version identity.');
    }
    if (receipt.authenticatedActorEmail.trim().toLowerCase() !== this.authenticatedEmail.trim().toLowerCase()) {
      throw new Error('The command receipt actor does not match the signed-in identity.');
    }
    if ((request.route === 'Employee' && receipt.effectiveRole !== 'Employee')
      || (request.route === 'Manager'
        && receipt.effectiveRole !== 'Manager'
        && receipt.effectiveRole !== 'DelegatedManager'
        && receipt.effectiveRole !== 'SystemAdmin')) {
      throw new Error('The command receipt role does not match the authorised command route.');
    }
    if (receipt.outcome !== 'Accepted' && receipt.outcome !== 'Duplicate') {
      throw new Error(`${receipt.validationCode}: ${receipt.message || 'The Employee V2 command was not accepted.'}`);
    }
    if (!receipt.resultKeysJson.trim() || !receipt.auditKeysJson.trim()
      || !/^[0-9a-f]{64}$/i.test(receipt.processedPayloadSha256)
      || !receipt.processedByEmail.trim() || !receipt.processedAt.trim()
      || !receipt.correlationKey.trim() || !receipt.flowRunReference.trim()) {
      throw new Error('The accepted command receipt is missing canonical readback, audit or payload-hash evidence.');
    }
    if (expectedTestSourceId && receipt.correlationKey.trim() === request.commandKey.trim()) {
      throw new Error('The TEST command receipt correlation must be generated by the processor.');
    }
    this.assertJsonEvidence(receipt.resultKeysJson, 'canonical result');
    this.assertJsonEvidence(receipt.auditKeysJson, 'audit');
    return receipt;
  }

  private assertJsonEvidence(value: string, label: string): void {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed === undefined || parsed === null || (Array.isArray(parsed) && parsed.length === 0)) {
        throw new Error('empty');
      }
    } catch {
      throw new Error(`The accepted command receipt contains invalid ${label} evidence JSON.`);
    }
  }

  private mapReceipt(row: ICommandReceiptRow): IEmployeeV2CommandReceipt {
    return {
      receiptKey: row.ReceiptKey,
      sourceListId: row.SourceListId,
      sourceItemId: row.SourceItemId,
      sourceItemVersion: row.SourceItemVersion,
      commandKey: row.CommandKey,
      commandType: row.CommandType,
      subjectType: row.SubjectType,
      subjectKey: row.SubjectKey,
      personKey: row.PersonKey,
      performanceYear: row.PerformanceYear,
      quarter: row.Quarter,
      authenticatedActorEmail: row.AuthenticatedActorEmail,
      authenticatedActorPersonKey: row.AuthenticatedActorPersonKey,
      effectiveRole: row.EffectiveRole,
      processedByEmail: row.ProcessedByEmail,
      processedAt: row.ProcessedAt,
      outcome: row.Outcome,
      validationCode: row.ValidationCode,
      message: row.Message,
      processedPayloadSha256: row.ProcessedPayloadSHA256,
      resultKeysJson: row.ResultKeysJSON,
      auditKeysJson: row.AuditKeysJSON,
      correlationKey: row.CorrelationKey,
      flowRunReference: row.FlowRunReference
    };
  }

  private listItemsUrl(listTitle: string): string {
    return `${this.webAbsoluteUrl}/_api/web/lists/getbytitle('${this.escapeOData(listTitle)}')/items`;
  }

  private escapeOData(value: string): string {
    return value.replace(/'/g, "''");
  }

  private async ensureSuccess(response: SPHttpClientResponse, message: string): Promise<void> {
    if (!response.ok) throw new Error(message);
  }
}

export const EMPLOYEE_V2_RECEIPT_SELECT = RECEIPT_SELECT;
