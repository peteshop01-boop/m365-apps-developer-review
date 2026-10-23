import { NOTIFICATION_EVENT_KINDS } from './NotificationModels';
import type {
  INotificationAttempt,
  INotificationOutboxRecord,
  INotificationOutcomeInput,
  INotificationSafeLinkPolicy,
  NotificationAttemptOutcome,
  NotificationOutboxState
} from './NotificationModels';

export const NOTIFICATION_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
export const NOTIFICATION_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
export const NOTIFICATION_SAFE_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export const NOTIFICATION_OUTCOME_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._:-]{0,127}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const WORKFLOW_STATES = Object.freeze(['NotStarted', 'Draft', 'ChangesRequested', 'Submitted', 'Approved', 'Locked', 'Complete']);
const ACTIONABLE_STATES = Object.freeze(['NotStarted', 'Draft', 'ChangesRequested']);
const OUTBOX_STATES = Object.freeze(['Queued', 'Attempting', 'Delivered', 'FailedTransient', 'FailedPermanent']);
const OUTCOMES: readonly NotificationAttemptOutcome[] = Object.freeze(['Delivered', 'TransientFailure', 'PermanentFailure']);

export type NotificationIdentityDomain =
  'outbox' | 'resend-outbox' | 'resend-authority' | 'attempt' | 'audit'
  | 'delivery-capability' | 'delivery-failure';

const NOTIFICATION_IDENTITY_COMPONENT_COUNTS: Readonly<Record<NotificationIdentityDomain, number>> = Object.freeze({
  outbox: 3,
  'resend-outbox': 5,
  'resend-authority': 7,
  attempt: 2,
  audit: 4,
  'delivery-capability': 6,
  'delivery-failure': 4
});

/** Encodes one governed identity tuple without normalising or delimiter-joining its components. */
export const encodeNotificationIdentity = (
  domain: NotificationIdentityDomain,
  components: ReadonlyArray<string>
): string => {
  if (!Object.prototype.hasOwnProperty.call(NOTIFICATION_IDENTITY_COMPONENT_COUNTS, domain)
    || !Array.isArray(components)
    || components.length !== NOTIFICATION_IDENTITY_COMPONENT_COUNTS[domain]
    || components.some(component => typeof component !== 'string')) {
    throw new Error('Notification identity domain or component tuple is invalid.');
  }
  return `DEMON2:${domain.length}:${domain}:${components.length}`
    + components.map(component => `:${component.length}:${component}`).join('');
};

type PlainRecord = Record<string, unknown>;

export interface INotificationProtectedCapture<T> {
  value: Readonly<T>;
  sourceOf: (snapshotValue: unknown) => object | undefined;
}

const protectedInputError = (path: string): Error =>
  new Error(`Protected notification input ${path} must be stable enumerable plain own data.`);

const sameKeys = (left: ReadonlyArray<PropertyKey>, right: ReadonlyArray<PropertyKey>): boolean =>
  left.length === right.length && left.every((key, index) => key === right[index]);

const sameDescriptor = (left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean =>
  !!left && !!right && left.enumerable === right.enumerable && left.configurable === right.configurable
  && left.writable === right.writable && left.get === right.get && left.set === right.set
  && Object.is(left.value, right.value);

const ownKeys = (value: object): PropertyKey[] => {
  const getSymbols = (Object as unknown as { getOwnPropertySymbols?: (target: object) => symbol[] })
    .getOwnPropertySymbols;
  return (Object.getOwnPropertyNames(value) as PropertyKey[]).concat(getSymbols ? getSymbols(value) : []);
};

/** Canonicalises without executing accessors and never reads a source object after its snapshot is captured. */
export const captureNotificationProtectedData = <T>(input: T, label: string): INotificationProtectedCapture<T> => {
  const snapshots = new WeakMap<object, unknown>();
  const sources = new WeakMap<object, object>();
  const active = new Set<object>();
  const visit = (value: unknown, path: string): unknown => {
    if (value === null || typeof value === 'undefined' || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'object') throw protectedInputError(path);
    if (active.has(value)) throw protectedInputError(path);
    if (snapshots.has(value)) return snapshots.get(value);
    active.add(value);

    let prototypeA: object | null;
    let prototypeB: object | null;
    let keysA: PropertyKey[];
    let keysB: PropertyKey[];
    let descriptorsA: Array<PropertyDescriptor | undefined>;
    let descriptorsB: Array<PropertyDescriptor | undefined>;
    try {
      prototypeA = Object.getPrototypeOf(value);
      keysA = ownKeys(value);
      descriptorsA = keysA.map(key => Object.getOwnPropertyDescriptor(value, key));
      keysB = ownKeys(value);
      descriptorsB = keysB.map(key => Object.getOwnPropertyDescriptor(value, key));
      prototypeB = Object.getPrototypeOf(value);
    } catch {
      throw protectedInputError(path);
    }
    if (prototypeA !== prototypeB || !sameKeys(keysA, keysB) || keysA.some(key => typeof key === 'symbol')
      || keysA.some((_key, index) => !sameDescriptor(descriptorsA[index], descriptorsB[index]))) {
      throw protectedInputError(path);
    }
    const descriptor = (source: Array<PropertyDescriptor | undefined>, key: PropertyKey): PropertyDescriptor | undefined =>
      source[keysA.indexOf(key)];

    if (Array.isArray(value)) {
      if (prototypeA !== Array.prototype) throw protectedInputError(path);
      const lengthDescriptor = descriptor(descriptorsA, 'length');
      const length = lengthDescriptor && lengthDescriptor.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > 10000 || lengthDescriptor?.enumerable) {
        throw protectedInputError(path);
      }
      const expectedKeys = Array.from({ length }, (_unused, index) => `${index}`).concat('length');
      if (!sameKeys(keysA, expectedKeys)) throw protectedInputError(path);
      const copy = Array.from({ length }, (_unused, index) => {
        const item = descriptor(descriptorsA, `${index}`);
        if (!item?.enumerable || !Object.prototype.hasOwnProperty.call(item, 'value')) {
          throw protectedInputError(`${path}[${index}]`);
        }
        return visit(item.value, `${path}[${index}]`);
      });
      const frozen = Object.freeze(copy);
      snapshots.set(value, frozen); sources.set(frozen, value); active.delete(value);
      return frozen;
    }

    if (prototypeA !== Object.prototype) throw protectedInputError(path);
    const copy = Object.create(Object.prototype) as PlainRecord;
    keysA.forEach(key => {
      const item = descriptor(descriptorsA, key);
      if (typeof key !== 'string' || !item?.enumerable || !Object.prototype.hasOwnProperty.call(item, 'value')) {
        throw protectedInputError(`${path}.${String(key)}`);
      }
      Object.defineProperty(copy, key, {
        value: visit(item.value, `${path}.${key}`), enumerable: true, writable: true, configurable: true
      });
    });
    const frozen = Object.freeze(copy);
    snapshots.set(value, frozen); sources.set(frozen, value); active.delete(value);
    return frozen;
  };
  const result = visit(input, label) as Readonly<T>;
  return Object.freeze({
    value: result,
    sourceOf: (snapshotValue: unknown): object | undefined =>
      snapshotValue && typeof snapshotValue === 'object' ? sources.get(snapshotValue) : undefined
  });
};

export const assertNotificationRecordKeys: (
  value: unknown,
  required: ReadonlyArray<string>,
  optional?: ReadonlyArray<string>
) => asserts value is PlainRecord = (value, required, optional = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Protected notification record shape is invalid.');
  const keys = Object.keys(value);
  if (required.some(key => keys.indexOf(key) < 0)
    || keys.some(key => required.indexOf(key) < 0 && optional.indexOf(key) < 0)) {
    throw new Error('Protected notification record shape contains missing or extra fields.');
  }
};

export const exactNotificationData = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

export const isCanonicalNotificationUtc = (value: string | undefined): value is string => Boolean(
  value && UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value
);

const validSafeLinkPolicy = (policy: Readonly<INotificationSafeLinkPolicy> | undefined): boolean => {
  if (!policy) return false;
  try {
    assertNotificationRecordKeys(policy, ['allowedOrigins', 'allowedPathPrefixes']);
  } catch { return false; }
  return Array.isArray(policy.allowedOrigins) && Array.isArray(policy.allowedPathPrefixes)
    && policy.allowedOrigins.length > 0 && policy.allowedPathPrefixes.length > 0
    && new Set(policy.allowedOrigins).size === policy.allowedOrigins.length
    && new Set(policy.allowedPathPrefixes).size === policy.allowedPathPrefixes.length
    && policy.allowedOrigins.every(origin => {
      if (typeof origin !== 'string') return false;
      try {
        const parsed = new URL(origin);
        return parsed.protocol === 'https:' && parsed.origin === origin && parsed.pathname === '/'
          && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
      } catch { return false; }
    })
    && policy.allowedPathPrefixes.every(prefix => typeof prefix === 'string'
      && /^\/[A-Za-z0-9/_-]*$/.test(prefix) && !prefix.includes('//'));
};

const hasNotificationControlChars = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 32 || code === 127) return true;
  }
  return false;
};

const validNotificationPathSegments = (pathname: string): boolean => {
  if (pathname.normalize('NFKC') !== pathname || !/^\/[A-Za-z0-9 ._~%/-]*$/.test(pathname)) return false;
  const segments = pathname.split('/');
  return segments.every((segment, index) => index === 0
    ? segment === ''
    : (index === segments.length - 1 || segment.length > 0) && segment !== '.' && segment !== '..');
};

const canonicalNotificationPath = (pathname: string): string | undefined => {
  let current = pathname;
  // A fixed ceiling fails closed on deliberately nested encodings rather than comparing a partly decoded path.
  for (let layer = 0; layer <= 16; layer++) {
    if (!current.startsWith('/') || current.includes('\\') || /%2f|%5c/i.test(current)
      || hasNotificationControlChars(current)
      || !validNotificationPathSegments(current)) return undefined;
    let encodedLayer = '';
    let hasEncodedByte = false;
    for (let index = 0; index < current.length; index++) {
      if (current[index] !== '%') { encodedLayer += current[index]; continue; }
      const escape = current.slice(index + 1, index + 3);
      if (/^[0-9a-f]{2}$/i.test(escape)) {
        encodedLayer += `%${escape}`;
        hasEncodedByte = true;
        index += 2;
        continue;
      }
      // A literal percent may only come from an earlier %25 and end here or precede safe punctuation.
      // Raw malformed escapes and decoded percent followed by a letter/digit remain invalid.
      const next = current[index + 1];
      if (layer === 0 || (next !== undefined && !/[ ._~/-]/.test(next))) return undefined;
      encodedLayer += '%25';
    }
    if (!hasEncodedByte) return current;
    if (layer === 16) return undefined;
    try { current = decodeURIComponent(encodedLayer); }
    catch { return undefined; }
  }
  return undefined;
};

export const isSafeNotificationLink = (
  value: string,
  policy: Readonly<INotificationSafeLinkPolicy> | undefined
): boolean => {
  if (typeof value !== 'string' || !validSafeLinkPolicy(policy)
    || hasNotificationControlChars(value)) return false;
  try {
    const raw = /^https:\/\/[^/\\?#]+(\/[^?#]*)?$/i.exec(value);
    if (!raw) return false;
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !policy?.allowedOrigins.includes(parsed.origin)
      || parsed.username || parsed.password || parsed.search || parsed.hash) return false;
    const canonicalRawPath = canonicalNotificationPath(raw[1] || '/');
    const canonicalParsedPath = canonicalNotificationPath(parsed.pathname);
    if (!canonicalRawPath || canonicalRawPath !== canonicalParsedPath) return false;
    const encodedPath = canonicalRawPath.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const reparsed = new URL(encodedPath, parsed.origin);
    if (reparsed.protocol !== 'https:' || reparsed.origin !== parsed.origin
      || reparsed.username || reparsed.password || reparsed.search || reparsed.hash
      || canonicalNotificationPath(reparsed.pathname) !== canonicalRawPath) return false;
    return policy.allowedPathPrefixes.some(prefix => canonicalRawPath === prefix
      || canonicalRawPath.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
  } catch { return false; }
};

export const assertNotificationOutboxShape = (
  record: Readonly<INotificationOutboxRecord>,
  safeLinkPolicy: Readonly<INotificationSafeLinkPolicy> | undefined
): void => {
  assertNotificationRecordKeys(record, [
    'outboxKey', 'eventKey', 'recipientIdempotencyKey', 'recipientReference', 'kind', 'channel', 'scheduledAt',
    'digest', 'provenance', 'state', 'attemptCount', 'version'
  ], ['resendDistinction', 'lastAttemptAt', 'lastOutcomeAt', 'lastOutcomeCode']);
  assertNotificationRecordKeys(record.digest,
    ['kind', 'performanceYear', 'periodKey', 'periodLabel', 'deadlineAt'], ['actionLink']);
  assertNotificationRecordKeys(record.provenance, [
    'configKey', 'configVersion', 'workflowKey', 'workflowVersion', 'workflowState', 'performanceYearNumber', 'periodKey'
  ]);
  if (record.resendDistinction !== undefined) {
    assertNotificationRecordKeys(record.resendDistinction, ['distinctionKey', 'governanceReference']);
  }
  if (typeof record.eventKey !== 'string' || !NOTIFICATION_KEY_PATTERN.test(record.eventKey)
    || typeof record.recipientReference !== 'string' || !NOTIFICATION_KEY_PATTERN.test(record.recipientReference)
    || typeof record.provenance.workflowKey !== 'string'
    || !NOTIFICATION_KEY_PATTERN.test(record.provenance.workflowKey)
    || (record.resendDistinction !== undefined
      && (typeof record.resendDistinction.distinctionKey !== 'string'
        || !NOTIFICATION_SAFE_CODE_PATTERN.test(record.resendDistinction.distinctionKey)
        || typeof record.resendDistinction.governanceReference !== 'string'
        || !NOTIFICATION_KEY_PATTERN.test(record.resendDistinction.governanceReference)))) {
    throw new Error('Notification outbox safe-link, recipient, workflow or identity contract is invalid.');
  }
  const expectedKey = record.resendDistinction
    ? encodeNotificationIdentity('resend-outbox', [
      record.eventKey,
      record.recipientReference,
      record.provenance.workflowKey,
      record.resendDistinction.distinctionKey,
      record.resendDistinction.governanceReference
    ])
    : encodeNotificationIdentity('outbox', [
      record.eventKey, record.recipientReference, record.provenance.workflowKey
    ]);
  if (!record.outboxKey || record.outboxKey !== expectedKey || record.recipientIdempotencyKey !== expectedKey
    || record.recipientReference.includes('@') || !NOTIFICATION_EVENT_KINDS.includes(record.kind)
    || (record.channel !== 'Email' && record.channel !== 'Teams') || !isCanonicalNotificationUtc(record.scheduledAt)
    || record.digest.kind !== record.kind || !/^\d{4}\/\d{2}$/.test(record.digest.performanceYear)
    || !record.digest.periodLabel.trim() || !isCanonicalNotificationUtc(record.digest.deadlineAt)
    || record.digest.periodKey !== record.provenance.periodKey
    || !NOTIFICATION_KEY_PATTERN.test(record.provenance.configKey)
    || !NOTIFICATION_VERSION_PATTERN.test(record.provenance.configVersion)
    || !Number.isInteger(record.provenance.workflowVersion) || record.provenance.workflowVersion < 1
    || !ACTIONABLE_STATES.includes(record.provenance.workflowState)
    || !WORKFLOW_STATES.includes(record.provenance.workflowState)
    || !Number.isInteger(record.provenance.performanceYearNumber)
    || record.provenance.performanceYearNumber !== Number(record.digest.performanceYear.slice(0, 4))
    || !OUTBOX_STATES.includes(record.state) || !Number.isInteger(record.attemptCount) || record.attemptCount < 0
    || !Number.isInteger(record.version) || record.version < 1
    || (record.digest.actionLink !== undefined && !isSafeNotificationLink(record.digest.actionLink, safeLinkPolicy))
    || (record.lastAttemptAt !== undefined && !isCanonicalNotificationUtc(record.lastAttemptAt))
    || (record.lastOutcomeAt !== undefined && !isCanonicalNotificationUtc(record.lastOutcomeAt))
    || (record.lastOutcomeCode !== undefined && !NOTIFICATION_OUTCOME_CODE_PATTERN.test(record.lastOutcomeCode))) {
    throw new Error('Notification outbox safe-link, recipient, workflow or identity contract is invalid.');
  }
};

export const assertNotificationAttemptShape = (attempt: Readonly<INotificationAttempt>): void => {
  assertNotificationRecordKeys(attempt,
    ['attemptKey', 'outboxKey', 'attemptNumber', 'attemptedAt', 'expectedOutboxVersion']);
  if (typeof attempt.outboxKey !== 'string' || !attempt.outboxKey
    || !Number.isInteger(attempt.attemptNumber) || attempt.attemptNumber < 1
    || !isCanonicalNotificationUtc(attempt.attemptedAt)
    || !Number.isInteger(attempt.expectedOutboxVersion) || attempt.expectedOutboxVersion < 1) {
    throw new Error('Notification attempt identity is invalid.');
  }
  const expectedKey = encodeNotificationIdentity('attempt', [attempt.outboxKey, String(attempt.attemptNumber)]);
  if (attempt.attemptKey !== expectedKey) throw new Error('Notification attempt identity is invalid.');
};

export const assertNotificationOutcomeShape = (outcome: Readonly<INotificationOutcomeInput>): void => {
  assertNotificationRecordKeys(outcome, ['outcome', 'outcomeAt', 'outcomeCode']);
  if (!OUTCOMES.includes(outcome.outcome)) {
    throw new Error('Notification outcome is outside the governed exhaustive set.');
  }
  if (!isCanonicalNotificationUtc(outcome.outcomeAt)
    || !NOTIFICATION_OUTCOME_CODE_PATTERN.test(outcome.outcomeCode)) {
    throw new Error('Notification outcome time or code is invalid.');
  }
};

export const notificationStateForOutcome = (outcome: NotificationAttemptOutcome): NotificationOutboxState => {
  if (outcome === 'Delivered') return 'Delivered';
  if (outcome === 'TransientFailure') return 'FailedTransient';
  if (outcome === 'PermanentFailure') return 'FailedPermanent';
  throw new Error('Notification outcome is outside the governed exhaustive set.');
};
