import type { ISealedRequest } from './StandardExpenseProcessor';
import { etag, operation, positiveId } from '../services/persistence/PersistenceValidation';
import { parseAmountPence, parseUkDate } from '../domain/expenseRules';
import { copyBoundedBytes } from '../services/persistence/BoundedBody';
import { copyRequestEnvelope } from '../services/persistence/RequestLedgerExpensePort';

/** Concrete REST operations for the Standard SharePoint connector's
 * Send an HTTP request to SharePoint action. Plans perform NO network I/O.
 * Names below are explicit binding requirements, not provisioned tenant schema.
 * Author/Editor remain SharePoint system fields: human originator is separate.
 * There is no category mapping/default and no field/schema/ACL provisioning. */
export const TEST_SITE = 'https://example.invalid/sites/REVIEW-TEST-SITE';
export interface IStandardRestPlan {
  readonly method: 'GET' | 'POST'; readonly url: string; readonly headers: Readonly<Record<string, string>>;
  readonly body?: Readonly<Record<string, unknown>> | Uint8Array;
  readonly retry: 'none';
}
export interface IExpenseFieldBindings {
  readonly reason: string; readonly originator: string; readonly requestId: string;
  readonly canonicalOperation: string; readonly receiptManifest: string;
  readonly receiptRequiredForFile: boolean; readonly receiptRequiredForNoReceipt: boolean;
}
// Historical TEST102 names plus SharePoint base fields are a minimum exclusion
// set, NOT qualification of a current tenant schema. New storage bindings must
// be dedicated fields. Reject case/lookup aliases as well as exact collisions.
const baseFields = ('ID Title Author Editor Created Modified Originator OriginatorId ContentType ContentTypeId Attachments GUID FileRef FileDirRef FileLeafRef FileSystemObjectType FSObjType UniqueId OData__UIVersionString _UIVersionString _UIVersion _CommentCount _CommentFlags ComplianceAssetId').split(' ');
const parentFields = ('ApprovedAt ApprovedBy ApproverEmail ApproverPerson ClaimantEmail ClaimantKey ClaimantName ClaimantPerson ClaimantRecord ClaimantSourceItemId ClaimMonth ClaimMonthRecord ExpenseTotal FinanceCheckedAt FinanceCheckedBy FinanceNotes FinanceReturnedAt FinanceReturnedBy FinanceStatus FirstSubmittedAt IsZeroClaim LastSubmittedAt LastSubmittedBy LedgerCodesChecked LifecycleAuditCompletedAt LifecycleAuditState LifecyclePendingEventKey LifecyclePendingPayload ManagerNotes ManagerReviewedAt ManagerReviewedBy MileageChecked MileageTotal MissingReceiptCount OverallTotal PayrollExportedAt PayrollExportRunId PayrollReadyAt PayrollReadyBy PayrollStatus ProvisioningRunId ReceiptFolderUrl ReceiptsChecked RowsNeedingAttention SourceSnapshotRunId SubmissionKey SubmissionStatus SubmissionVersion ValidationStatus ZeroClaimConfirmedAt').split(' ');
const expenseFields = ('ExpenseLineKey ExpenseDate Supplier ExpenseDescription ExpenseCategory NominalCode NominalDescription GrossAmount ReceiptRequired ReceiptUrl ReceiptFileName LineValidationStatus ValidationMessage ClaimantNotes ManagerLineNotes IsVoided ClaimSubmissionRef').split(' ');
export function assertDedicatedFields(names: readonly string[], scope: 'parent' | 'expense'): void {
  const reserved = new Set([...baseFields, ...(scope === 'parent' ? parentFields : expenseFields)]
    .reduce<string[]>((all, n) => all.concat(n.toLowerCase(), (n + 'Id').toLowerCase()), []));
  if (names.some(n => typeof n !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(n) || reserved.has(n.toLowerCase()) ||
      (scope === 'parent' && /^Lifecycle/i.test(n))) || new Set(names.map(n => n.toLowerCase())).size !== names.length) {
    throw new Error('UNQUALIFIED_FIELD_BINDINGS');
  }
}
const guid = (value: string): string => {
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) throw new Error('UNQUALIFIED_LIST');
  return value;
};
const literal = (value: string): string => encodeURIComponent(value.replace(/'/g, "''"));
const list = (id: string): string => `${TEST_SITE}/_api/web/lists(guid'${guid(id)}')`;
const jsonHeaders = { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata' };
function get(url: string): IStandardRestPlan { return { method: 'GET', url, headers: { Accept: jsonHeaders.Accept }, retry: 'none' }; }
function post(url: string, body: Readonly<Record<string, unknown>> | Uint8Array): IStandardRestPlan { return { method: 'POST', url, headers: jsonHeaders, body, retry: 'none' }; }
function item(id: number): number { if (!positiveId(id)) throw new Error('INVALID_ID'); return id; }
export function readRequestMetadata(requestLibraryId: string, requestId: number): IStandardRestPlan {
  return get(`${list(requestLibraryId)}/items(${item(requestId)})?$select=Id,AuthorId,EditorId,OData__UIVersionString,File/UniqueId,File/Length,File/ETag,File/Name&$expand=File`);
}
export function readRequestContent(requestLibraryId: string, requestId: number): IStandardRestPlan {
  return get(`${list(requestLibraryId)}/items(${item(requestId)})/File/$value`);
}
export function createImmutableRequestFile(qualifiedCallerFolder: string, operationId: string, envelope: Uint8Array): IStandardRestPlan {
  if (!/^\/sites\/REVIEW-TEST-SITE\/[A-Za-z0-9 _/-]+$/.test(qualifiedCallerFolder) || qualifiedCallerFolder.includes('//') ||
      !operation(operationId)) throw new Error('INVALID_REQUEST_DESTINATION');
  const bounded = copyRequestEnvelope(envelope);
  return { ...post(`${TEST_SITE}/_api/web/GetFolderByServerRelativePath(decodedurl='${literal(qualifiedCallerFolder)}')/Files/AddUsingPath(decodedurl='${literal(operationId + '.json')}',overwrite=false)`, bounded),
    headers: { Accept: jsonHeaders.Accept, 'Content-Type': 'application/octet-stream' } };
}
export function readUniqueOperation(ledgerListId: string, key: string): IStandardRestPlan {
  if (!/^\d+:[A-Za-z0-9-]{16,80}$/.test(key)) throw new Error('INVALID_OPERATION_KEY');
  return get(`${list(ledgerListId)}/items?$filter=OperationKey eq '${literal(key)}'&$top=2`);
}
export function createUniqueOperation(ledgerListId: string, key: string, requestId: number, originatorId: number, parentId: number): IStandardRestPlan {
  readUniqueOperation(ledgerListId, key);
  // OriginatorId is a native read-only Lookup. D01ActorId is a separately
  // qualified Number field; never fall back to the system lookup on readback.
  return post(`${list(ledgerListId)}/items`, { Title: key, OperationKey: key, RequestId: item(requestId), D01ActorId: item(originatorId), ParentId: item(parentId), State: 'Pending' });
}
export function conditionalUpdate(listId: string, id: number, expectedEtag: string, fields: Readonly<Record<string, unknown>>): IStandardRestPlan {
  if (!etag(expectedEtag) || Object.keys(fields).some(k => /^(Author|Editor|Created|Modified|Originator|__metadata|ExpenseCategory)/i.test(k))) throw new Error('INVALID_CONDITIONAL_UPDATE');
  return { ...post(`${list(listId)}/items(${item(id)})`, fields), headers: { ...jsonHeaders, 'IF-MATCH': expectedEtag, 'X-HTTP-Method': 'MERGE' } };
}
export function reserveParent(parentListId: string, parentId: number, expectedEtag: string, key: string, approvedReservationField: string): IStandardRestPlan {
  assertDedicatedFields([approvedReservationField], 'parent');
  if (!/^\d+:[A-Za-z0-9-]{16,80}$/.test(key)) throw new Error('UNQUALIFIED_RESERVATION_FIELD');
  return conditionalUpdate(parentListId, parentId, expectedEtag, { [approvedReservationField]: key });
}
export function createExpenseLine(expenseListId: string, request: ISealedRequest, nominalDescription: string, bindings: IExpenseFieldBindings): IStandardRestPlan {
  const names = [bindings.reason, bindings.originator, bindings.requestId, bindings.canonicalOperation, bindings.receiptManifest];
  assertDedicatedFields(names, 'expense');
  if (typeof bindings.receiptRequiredForFile !== 'boolean' || typeof bindings.receiptRequiredForNoReceipt !== 'boolean') throw new Error('UNQUALIFIED_FIELD_BINDINGS');
  const c = request.command, r = c.receipt;
  return post(`${list(expenseListId)}/items`, {
    Title: `D01-${request.authorId}-${c.operationId}`, ExpenseLineKey: `D01-${request.authorId}-${c.operationId}`,
    ExpenseDate: parseUkDate(c.date), Supplier: c.supplier, ExpenseDescription: c.description,
    ClaimSubmissionRefId: item(c.parentId), NominalCode: c.nominalCode, NominalDescription: nominalDescription,
    GrossAmount: (parseAmountPence(c.amount) || 0) / 100, ClaimantNotes: c.notes,
    ReceiptRequired: r.kind === 'file' ? bindings.receiptRequiredForFile : bindings.receiptRequiredForNoReceipt,
    LineValidationStatus: 'Not Checked', IsVoided: false,
    [bindings.reason]: r.kind === 'none' ? r.reason : null, [bindings.originator]: item(request.authorId),
    [bindings.requestId]: item(request.id), [bindings.canonicalOperation]: `${request.authorId}:${c.operationId}`,
    [bindings.receiptManifest]: r.kind === 'none' ? null : JSON.stringify({ fileName: r.fileName, mediaType: r.mediaType, size: r.bytes.length, clientSha256: r.sha256 })
  });
}
export function attachment(expenseListId: string, lineId: number, name: string, bytes?: Uint8Array): IStandardRestPlan {
  if (!/^[\w ()-]+\.(png|jpe?g|pdf)$/i.test(name)) throw new Error('INVALID_FILE_NAME');
  const root = `${list(expenseListId)}/items(${item(lineId)})/AttachmentFiles`;
  return bytes ? { ...post(`${root}/add(FileName='${literal(name)}')`, copyBoundedBytes(bytes, 10 * 1024 * 1024)), headers: { Accept: jsonHeaders.Accept, 'Content-Type': 'application/octet-stream' } }
    : get(`${root}/getByFileName('${literal(name)}')/$value`);
}

/** Fixed admission: no connector, list IDs, role flag or "approved" Boolean can
 * install/enable a processor. Deployment composition is deliberately absent. */
export const CURRENT_STANDARD_DEPLOYMENT = Object.freeze({ state: 'Held', tenantWriteAllowed: false,
  missing: ['CurrentSchemaBindings', 'ImmutableRequestLibraryAndActorACL', 'UniqueLedgerAndExpenseKeys', 'AllWriterParentCAS',
    'ReasonAndCategoryDecision', 'NominalEqualityAndPostingPolicy', 'ReceiptStorageAndRawDenial', 'StandardFlowTranslationAndLicence', 'IndependentSecurityAndTestConsent'] });
