import { OPTION_E_DRAFT_SCHEMA_VERSION } from '../models/OptionEWorkplanDraftModels';

/** Source contract only. No tenant transport or WebPart binding is supplied here. */
export type OptionEDraftCreateFailure =
  'IDENTITY_INVALID' | 'IDENTITY_AMBIGUOUS' | 'CAPABILITY_MISSING' | 'ALREADY_EXISTS' |
  'CREATE_CONFLICT' | 'CREATE_UNCERTAIN' | 'READBACK_DENIED' | 'READBACK_MISMATCH';

export class OptionEDraftCreateError extends Error {
  public constructor(public readonly code: OptionEDraftCreateFailure) {
    super(code);
    this.name = 'OptionEDraftCreateError';
    Object.setPrototypeOf(this, OptionEDraftCreateError.prototype);
  }
}

export interface IOptionEDraftPerson {
  itemId: number;
  email: string;
  personKey: string;
  managerPersonKey: string;
  active: boolean;
}

export interface IOptionEDraftExisting {
  itemId: number;
  correlationKey: string;
  personKey: string;
  performanceYear: number;
}

export interface IOptionEDraftCreateAuthority {
  people: readonly IOptionEDraftPerson[];
  existing: readonly IOptionEDraftExisting[];
  ownDraftCreate: boolean;
  privateDraftReadback: boolean;
  /** Zero denotes absence of a current Workplan at this employee/year key. */
  rowVersionBefore: number;
}

export interface IOptionEDraftCreateInput {
  authenticatedEmail: string;
  performanceYear: number;
  correlationKey: string;
}

export interface IOptionEDraftCreateFields {
  workplanKey: string;
  personKey: string;
  managerPersonKey: string;
  performanceYear: number;
  state: 'DRAFT';
  draftSchemaVersion: typeof OPTION_E_DRAFT_SCHEMA_VERSION;
  correlationKey: string;
  managerReviewEligible: false;
  goldEligible: false;
}

export interface IOptionEDraftNativeReceipt {
  itemId: number;
  etag: string;
  rowVersionToken: number;
}

export interface IOptionEDraftCanonicalReadback extends IOptionEDraftNativeReceipt, IOptionEDraftCreateFields {}

export interface IOptionEDraftCreateRequest {
  /** Transport must atomically deduplicate this employee/year key and correlation. */
  idempotencyKey: string;
  fields: Readonly<IOptionEDraftCreateFields>;
}

export interface IOptionEDraftCreateAuthorityResolver {
  resolve(authenticatedEmail: string, performanceYear: number): Promise<IOptionEDraftCreateAuthority>;
}

export interface IOptionEDraftCreateOnlyTransport {
  /** Create only; no update, fallback or separate unguarded POST is in this interface. */
  createOnce(request: Readonly<IOptionEDraftCreateRequest>): Promise<IOptionEDraftNativeReceipt>;
  readCanonical(itemId: number): Promise<IOptionEDraftCanonicalReadback>;
}

export interface IOptionEDraftCreateVerified {
  readonly itemId: number;
  readonly etag: string;
  readonly rowVersionToken: number;
  readonly fields: Readonly<IOptionEDraftCreateFields>;
  readonly recovered: boolean;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CORRELATION = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const PERSON_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NATIVE_ENTITY_TAG = /^(?:W\/)?"[\x21\x23-\x7E\x80-\xFF]+"$/;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const nativeEntityTag = (value: unknown): value is string =>
  typeof value === 'string' && NATIVE_ENTITY_TAG.test(value);

/** Descriptor reads avoid invoking getters and bind every authority value only once. */
const snapshotRecord = <T extends object>(value: unknown, keys: readonly (keyof T)[],
  code: OptionEDraftCreateFailure): Readonly<T> => {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Not a record');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error('Unexpected prototype');
    const expectedKeys = keys.map(key => String(key));
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== expectedKeys.length ||
      ownKeys.some(key => typeof key !== 'string' || !expectedKeys.includes(key)))
      throw new Error('Unexpected own key');
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(key));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
        throw new Error('Missing own data property');
      snapshot[String(key)] = descriptor.value;
    }
    return Object.freeze(snapshot) as unknown as Readonly<T>;
  } catch { throw new OptionEDraftCreateError(code); }
};

const snapshotList = <T>(value: unknown, parse: (item: unknown) => T,
  code: OptionEDraftCreateFailure): readonly T[] => {
  try {
    if (!Array.isArray(value)) throw new Error('Not an array');
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Array.prototype) throw new Error('Unexpected array prototype');
    const length = Object.getOwnPropertyDescriptor(value, 'length');
    if (!length || !Number.isSafeInteger(length.value) || length.value < 0 || length.value > 2)
      throw new Error('Invalid array length');
    const expectedKeys = ['length', ...Array.from({ length: length.value }, (_item, index) => String(index))];
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== expectedKeys.length ||
      ownKeys.some(key => typeof key !== 'string' || !expectedKeys.includes(key)))
      throw new Error('Unexpected array own key');
    const items: T[] = [];
    for (let index = 0; index < length.value; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value'))
        throw new Error('Missing own array item');
      items.push(parse(descriptor.value));
    }
    return Object.freeze(items);
  } catch { throw new OptionEDraftCreateError(code); }
};

const snapshotPerson = (value: unknown): Readonly<IOptionEDraftPerson> =>
  snapshotRecord<IOptionEDraftPerson>(value,
    ['itemId', 'email', 'personKey', 'managerPersonKey', 'active'], 'IDENTITY_INVALID');

const snapshotExisting = (value: unknown): Readonly<IOptionEDraftExisting> =>
  snapshotRecord<IOptionEDraftExisting>(value,
    ['itemId', 'correlationKey', 'personKey', 'performanceYear'], 'IDENTITY_INVALID');

const snapshotAuthority = (value: unknown): Readonly<IOptionEDraftCreateAuthority> => {
  const raw = snapshotRecord<IOptionEDraftCreateAuthority>(value,
    ['people', 'existing', 'ownDraftCreate', 'privateDraftReadback', 'rowVersionBefore'], 'IDENTITY_INVALID');
  return Object.freeze({ people: snapshotList(raw.people, snapshotPerson, 'IDENTITY_INVALID'),
    existing: snapshotList(raw.existing, snapshotExisting, 'IDENTITY_INVALID'),
    ownDraftCreate: raw.ownDraftCreate, privateDraftReadback: raw.privateDraftReadback,
    rowVersionBefore: raw.rowVersionBefore });
};

const snapshotReceipt = (value: unknown): Readonly<IOptionEDraftNativeReceipt> =>
  snapshotRecord<IOptionEDraftNativeReceipt>(value,
    ['itemId', 'etag', 'rowVersionToken'], 'READBACK_MISMATCH');

const snapshotCanonical = (value: unknown): Readonly<IOptionEDraftCanonicalReadback> =>
  snapshotRecord<IOptionEDraftCanonicalReadback>(value, ['itemId', 'etag', 'rowVersionToken',
    'workplanKey', 'personKey', 'managerPersonKey', 'performanceYear', 'state',
    'draftSchemaVersion', 'correlationKey', 'managerReviewEligible', 'goldEligible'], 'READBACK_MISMATCH');

const exactFields = (left: IOptionEDraftCreateFields, right: IOptionEDraftCreateFields): boolean =>
  left.workplanKey === right.workplanKey && left.personKey === right.personKey &&
  left.managerPersonKey === right.managerPersonKey && left.performanceYear === right.performanceYear &&
  left.state === right.state && left.draftSchemaVersion === right.draftSchemaVersion &&
  left.correlationKey === right.correlationKey &&
  left.managerReviewEligible === right.managerReviewEligible && left.goldEligible === right.goldEligible;

const verifyReadback = (
  canonical: IOptionEDraftCanonicalReadback,
  receipt: IOptionEDraftNativeReceipt,
  fields: IOptionEDraftCreateFields,
  rowVersionBefore: number,
  recovered: boolean
): IOptionEDraftCreateVerified => {
  if (!positive(receipt.itemId) || !nativeEntityTag(receipt.etag) ||
    !Number.isSafeInteger(receipt.rowVersionToken) || receipt.rowVersionToken < 1 ||
    (recovered ? receipt.rowVersionToken < rowVersionBefore : receipt.rowVersionToken <= rowVersionBefore) ||
    !positive(canonical.itemId) || canonical.itemId !== receipt.itemId ||
    !nativeEntityTag(canonical.etag) ||
    canonical.etag !== receipt.etag || canonical.rowVersionToken !== receipt.rowVersionToken ||
    !exactFields(canonical, fields)) throw new OptionEDraftCreateError('READBACK_MISMATCH');
  return Object.freeze({ itemId: canonical.itemId, etag: canonical.etag,
    rowVersionToken: canonical.rowVersionToken, fields: Object.freeze({ ...fields }), recovered });
};

/** One instance also prevents an uncertain local retry while the backing create result is unknown. */
export class OptionEDraftCreateContract {
  private readonly attempts = new Map<string, { correlationKey: string; result: Promise<IOptionEDraftCreateVerified> }>();

  public constructor(
    private readonly authority: IOptionEDraftCreateAuthorityResolver,
    private readonly transport: IOptionEDraftCreateOnlyTransport,
    private readonly timeoutMs: number = 5000
  ) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000)
      throw new OptionEDraftCreateError('IDENTITY_INVALID');
  }

  public create(input: Readonly<IOptionEDraftCreateInput>): Promise<IOptionEDraftCreateVerified> {
    let stable: Readonly<IOptionEDraftCreateInput>;
    try { stable = snapshotRecord<IOptionEDraftCreateInput>(input,
      ['authenticatedEmail', 'performanceYear', 'correlationKey'], 'IDENTITY_INVALID'); }
    catch (error) { return Promise.reject(error); }
    const email = typeof stable.authenticatedEmail === 'string'
      ? stable.authenticatedEmail.trim().toLowerCase() : '';
    const year = stable.performanceYear;
    const correlationKey = stable.correlationKey;
    if (!EMAIL.test(email) || !Number.isSafeInteger(year) ||
      year < 1000 || year > 9999 ||
      typeof correlationKey !== 'string' || !CORRELATION.test(correlationKey))
      return Promise.reject(new OptionEDraftCreateError('IDENTITY_INVALID'));
    const key = `${email}|${year}`;
    const prior = this.attempts.get(key);
    if (prior) return prior.correlationKey === correlationKey ? prior.result
      : Promise.reject(new OptionEDraftCreateError('CREATE_UNCERTAIN'));
    const result = this.execute(email, year, correlationKey);
    this.attempts.set(key, { correlationKey, result });
    return result;
  }

  private async execute(email: string, year: number, correlationKey: string): Promise<IOptionEDraftCreateVerified> {
    let raw: IOptionEDraftCreateAuthority;
    try { raw = await this.withTimeout(this.authority.resolve(email, year)); }
    catch { throw new OptionEDraftCreateError('CREATE_UNCERTAIN'); }
    const resolved = snapshotAuthority(raw);
    if (!resolved || resolved.people.length !== 1) throw new OptionEDraftCreateError('IDENTITY_AMBIGUOUS');
    const person = resolved.people[0];
    if (person.active !== true || !positive(person.itemId) || !nonBlank(person.personKey) ||
      !PERSON_KEY.test(person.personKey) ||
      person.personKey !== person.personKey.trim() || !nonBlank(person.managerPersonKey) ||
      !PERSON_KEY.test(person.managerPersonKey) ||
      person.managerPersonKey !== person.managerPersonKey.trim() ||
      person.managerPersonKey === person.personKey ||
      !nonBlank(person.email) || person.email.trim().toLowerCase() !== email ||
      !Number.isSafeInteger(resolved.rowVersionBefore) || resolved.rowVersionBefore < 0)
      throw new OptionEDraftCreateError('IDENTITY_INVALID');
    if (resolved.ownDraftCreate !== true || resolved.privateDraftReadback !== true)
      throw new OptionEDraftCreateError('CAPABILITY_MISSING');
    const fields: IOptionEDraftCreateFields = Object.freeze({
      workplanKey: `${person.personKey}|${year}`, personKey: person.personKey,
      managerPersonKey: person.managerPersonKey, performanceYear: year, state: 'DRAFT',
      draftSchemaVersion: OPTION_E_DRAFT_SCHEMA_VERSION, correlationKey,
      managerReviewEligible: false, goldEligible: false
    });
    if (resolved.existing.length > 1) throw new OptionEDraftCreateError('IDENTITY_AMBIGUOUS');
    const existing = resolved.existing[0];
    if (existing) {
      if (!positive(existing.itemId) || existing.personKey !== person.personKey ||
        existing.performanceYear !== year || existing.correlationKey !== correlationKey)
        throw new OptionEDraftCreateError('ALREADY_EXISTS');
      return this.readAndVerify(existing.itemId, fields, resolved.rowVersionBefore, true);
    }
    if (resolved.rowVersionBefore !== 0) throw new OptionEDraftCreateError('IDENTITY_INVALID');
    const request: IOptionEDraftCreateRequest = Object.freeze({ idempotencyKey: fields.workplanKey,
      fields });
    let rawReceipt: IOptionEDraftNativeReceipt;
    try { rawReceipt = await this.withTimeout(this.transport.createOnce(request)); }
    catch (error) {
      if (error instanceof OptionEDraftCreateError && error.code === 'CREATE_CONFLICT')
        return this.recoverConflict(email, year, correlationKey, fields);
      throw new OptionEDraftCreateError('CREATE_UNCERTAIN');
    }
    const receipt = snapshotReceipt(rawReceipt);
    if (!positive(receipt.itemId)) throw new OptionEDraftCreateError('READBACK_MISMATCH');
    return this.readAndVerify(receipt.itemId, fields, resolved.rowVersionBefore, false, receipt);
  }

  private async recoverConflict(email: string, year: number, correlationKey: string,
    fields: IOptionEDraftCreateFields): Promise<IOptionEDraftCreateVerified> {
    let raw: IOptionEDraftCreateAuthority;
    try { raw = await this.withTimeout(this.authority.resolve(email, year)); }
    catch { throw new OptionEDraftCreateError('CREATE_CONFLICT'); }
    let refreshed: Readonly<IOptionEDraftCreateAuthority>;
    try { refreshed = snapshotAuthority(raw); }
    catch { throw new OptionEDraftCreateError('CREATE_CONFLICT'); }
    if (!refreshed || refreshed.people.length !== 1 || refreshed.people[0].active !== true ||
      !nonBlank(refreshed.people[0].email) || refreshed.people[0].email.trim().toLowerCase() !== email ||
      refreshed.people[0].personKey !== fields.personKey ||
      refreshed.people[0].managerPersonKey !== fields.managerPersonKey ||
      refreshed.ownDraftCreate !== true || refreshed.privateDraftReadback !== true ||
      refreshed.existing.length !== 1 || !Number.isSafeInteger(refreshed.rowVersionBefore) ||
      refreshed.rowVersionBefore < 0)
      throw new OptionEDraftCreateError('CREATE_CONFLICT');
    const existing = refreshed.existing[0];
    if (!positive(existing.itemId) || existing.correlationKey !== correlationKey ||
      existing.personKey !== fields.personKey || existing.performanceYear !== year)
      throw new OptionEDraftCreateError('CREATE_CONFLICT');
    return this.readAndVerify(existing.itemId, fields, refreshed.rowVersionBefore, true);
  }

  private async readAndVerify(itemId: number, fields: IOptionEDraftCreateFields,
    before: number, recovered: boolean, createdReceipt?: IOptionEDraftNativeReceipt): Promise<IOptionEDraftCreateVerified> {
    if (!positive(itemId)) throw new OptionEDraftCreateError('READBACK_MISMATCH');
    let raw: IOptionEDraftCanonicalReadback;
    try { raw = await this.withTimeout(this.transport.readCanonical(itemId)); }
    catch { throw new OptionEDraftCreateError('READBACK_DENIED'); }
    const canonical = snapshotCanonical(raw);
    const receipt = createdReceipt || { itemId: canonical.itemId, etag: canonical.etag,
      rowVersionToken: canonical.rowVersionToken };
    return verifyReadback(canonical, receipt, fields, before, recovered);
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new OptionEDraftCreateError('CREATE_UNCERTAIN')), this.timeoutMs);
      operation.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
    });
  }
}
