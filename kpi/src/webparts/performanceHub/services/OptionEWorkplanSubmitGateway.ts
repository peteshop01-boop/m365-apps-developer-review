import {
  isCanonicalOptionESubmitUuid,
  optionERequestFieldsEqual,
  optionERequestKey,
  validateOptionESubmitPreconditions,
  type IOptionECanonicalDraftDto,
  type IOptionELocalDraftBuffer,
  type IOptionEProtectedWorkplanDto,
  type IOptionESubmitRequestFields,
  type IOptionESubmitRequestReadback,
  type IOptionESubmitValidationError
} from '../models/OptionEWorkplanSubmitModels';

export class OptionESubmitWriteTimeoutError extends Error {
  public constructor() {
    super('Option-E Submit Request create timed out.');
    this.name = 'OptionESubmitWriteTimeoutError';
    Object.setPrototypeOf(this, OptionESubmitWriteTimeoutError.prototype);
  }
}

export class OptionESubmitConflictError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'OptionESubmitConflictError';
    Object.setPrototypeOf(this, OptionESubmitConflictError.prototype);
  }
}

export class OptionESubmitValidationError extends Error {
  public constructor(public readonly details: readonly IOptionESubmitValidationError[]) {
    super(details.map(error => `${error.path}:${error.code}`).join('; '));
    this.name = 'OptionESubmitValidationError';
    Object.setPrototypeOf(this, OptionESubmitValidationError.prototype);
  }
}

export interface IOptionESubmitRequestTransport {
  /** Create-only. The immutable Request API intentionally exposes no patch or delete method. */
  createImmutableRequest(fields: IOptionESubmitRequestFields): Promise<void>;
  getRequestByUniqueKey(requestKey: string): Promise<IOptionESubmitRequestReadback | undefined>;
}

export interface IOptionESubmitIntent {
  clientSubmitId: string;
  clientSubmittedAt: string;
}

export interface IOptionESubmitGatewayInput {
  canonicalDraft: IOptionECanonicalDraftDto;
  localBuffer: IOptionELocalDraftBuffer;
  protectedWorkplan: IOptionEProtectedWorkplanDto;
  intent: IOptionESubmitIntent;
}

export interface IOptionESubmitRecordedResult {
  status: 'Recorded';
  message: 'Submission request recorded; processing.';
  request: IOptionESubmitRequestReadback;
}

const isCanonicalClientTimestamp = (value: string): boolean =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value));

const requestFrom = (input: IOptionESubmitGatewayInput): IOptionESubmitRequestFields => {
  const { canonicalDraft: draft, protectedWorkplan: control, intent } = input;
  if (!isCanonicalOptionESubmitUuid(intent.clientSubmitId)) {
    throw new OptionESubmitValidationError([{
      path: '$.clientSubmitId', code: 'ClientSubmitIdInvalid',
      message: 'ClientSubmitID must be one lowercase canonical RFC UUID per user intent.'
    }]);
  }
  if (!isCanonicalClientTimestamp(intent.clientSubmittedAt)) {
    throw new OptionESubmitValidationError([{
      path: '$.clientSubmittedAt', code: 'ClientSubmittedAtInvalid',
      message: 'ClientSubmittedAt is untrusted metadata and must be a canonical UTC timestamp.'
    }]);
  }
  return {
    RequestKey: optionERequestKey(control.personKey, control.performanceYear, intent.clientSubmitId),
    PersonKey: control.personKey,
    PerformanceYear: control.performanceYear,
    WorkplanKey: control.workplanKey,
    ClientSubmitID: intent.clientSubmitId,
    DraftItemID: draft.itemId,
    DraftETag: draft.etag,
    DraftVersion: draft.version,
    DraftSchemaVersion: draft.schemaVersion,
    PayloadJSON: draft.payloadJson,
    PayloadSHA256: draft.payloadSha256,
    FrameworkVersion: draft.frameworkVersion,
    CatalogueVersion: draft.catalogueVersion,
    ClientSubmittedAt: intent.clientSubmittedAt
  };
};

const assertCanonicalReadback = (
  expected: IOptionESubmitRequestFields,
  actual: IOptionESubmitRequestReadback | undefined
): IOptionESubmitRequestReadback => {
  if (!actual) throw new OptionESubmitConflictError('Immutable Request was not found after create.');
  if (!optionERequestFieldsEqual(expected, actual)) {
    throw new OptionESubmitConflictError('RequestKey exists with fields that do not exactly match this user intent.');
  }
  if (!Number.isInteger(actual.id) || actual.id <= 0 || !actual.etag.trim() || !actual.createdByEmail.trim()) {
    throw new OptionESubmitConflictError('Canonical Request readback lacks native ID, ETag or Created By authority.');
  }
  return actual;
};

export class OptionEWorkplanSubmitGateway {
  public constructor(private readonly transport: IOptionESubmitRequestTransport) {}

  public async record(input: IOptionESubmitGatewayInput): Promise<IOptionESubmitRecordedResult> {
    const validationErrors = validateOptionESubmitPreconditions(
      input.canonicalDraft, input.localBuffer, input.protectedWorkplan
    );
    if (validationErrors.length) throw new OptionESubmitValidationError(validationErrors);
    const expected = requestFrom(input);
    let timedOut = false;
    try {
      await this.transport.createImmutableRequest(expected);
    } catch (error) {
      if (!(error instanceof OptionESubmitWriteTimeoutError)) throw error;
      timedOut = true;
    }
    let readback = await this.transport.getRequestByUniqueKey(expected.RequestKey);
    if (readback) {
      return { status: 'Recorded', message: 'Submission request recorded; processing.', request: assertCanonicalReadback(expected, readback) };
    }
    if (!timedOut) throw new OptionESubmitConflictError('Request create returned without a canonical unique-key readback.');
    // Absence after an uncertain create permits exactly one retry with the same immutable key and fields.
    try {
      await this.transport.createImmutableRequest(expected);
    } catch (error) {
      if (!(error instanceof OptionESubmitWriteTimeoutError)) throw error;
    }
    readback = await this.transport.getRequestByUniqueKey(expected.RequestKey);
    return {
      status: 'Recorded',
      message: 'Submission request recorded; processing.',
      request: assertCanonicalReadback(expected, readback)
    };
  }
}
