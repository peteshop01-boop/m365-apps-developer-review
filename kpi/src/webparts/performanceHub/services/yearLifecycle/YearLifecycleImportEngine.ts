import type {
  IApprovedBaselineImportRecord,
  IHistoricalGoldImportRecord,
  IYearLifecycleActor,
  IYearLifecycleExceptionReport,
  IYearLifecycleImportManifest,
  IYearLifecycleImportPlan,
  IYearLifecycleImportReceipt,
  IYearLifecycleImportRequest,
  IYearLifecycleManifestExpectation,
  IYearLifecycleRecoveryToken,
  IYearLifecycleRollbackReceipt,
  IYearLifecycleState,
  IYearLifecycleYearState,
  YearLifecycleApplyResult,
  YearLifecycleExceptionCode,
  YearLifecycleImportRecord,
  YearLifecyclePlanResult,
  YearLifecycleRollbackResult
} from './YearLifecycleModels';

class YearLifecycleBoundaryError extends Error {
  public constructor(public readonly code: YearLifecycleExceptionCode, message: string) {
    super(message);
    this.name = 'YearLifecycleBoundaryError';
    Object.setPrototypeOf(this, YearLifecycleBoundaryError.prototype);
  }
}

const fail = (code: YearLifecycleExceptionCode, message: string): never => {
  throw new YearLifecycleBoundaryError(code, message);
};

const exactUtc = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    return fail('MalformedInput', `${label} must be an exact UTC timestamp.`);
  }
  return value;
};

const governedText = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()
    || Array.from(value).some(character => character.charCodeAt(0) <= 31)) {
    return fail('MalformedInput', `${label} must be non-empty canonical text.`);
  }
  return value;
};

const exactSha256 = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^[A-F0-9]{64}$/.test(value)) {
    return fail('HashMismatch', `${label} must be an uppercase SHA-256 value.`);
  }
  return value;
};

const wholeNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    return fail('MalformedInput', `${label} must be a non-negative safe whole number.`);
  }
  return value;
};

const inspectOwnData = (
  value: unknown,
  label: string,
  required: readonly string[],
  optional: readonly string[] = []
): Readonly<Record<string, unknown>> => {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return fail('MalformedInput', `${label} must be a plain object.`);
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return fail('MalformedInput', `${label} must not use a custom prototype.`);
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      return fail('MalformedInput', `${label} must not contain symbol properties.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Object.getOwnPropertyNames(value);
    const allowed = new Set(required.concat(optional));
    const extra = names.filter(name => !allowed.has(name));
    const missing = required.filter(name => !Object.prototype.hasOwnProperty.call(descriptors, name));
    if (extra.length > 0 || missing.length > 0) {
      return fail('MalformedInput', `${label} has missing or unexpected properties.`);
    }
    const output: Record<string, unknown> = {};
    names.forEach(name => {
      const descriptor = descriptors[name];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        fail('MalformedInput', `${label}.${name} must be an enumerable data property.`);
      }
      output[name] = descriptor.value;
    });
    return output;
  } catch (error) {
    if (error instanceof YearLifecycleBoundaryError) throw error;
    return fail('MalformedInput', `${label} could not be inspected safely.`);
  }
};

const inspectDenseArray = (value: unknown, label: string): readonly unknown[] => {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
      || Object.getOwnPropertySymbols(value).length > 0) {
      return fail('MalformedInput', `${label} must be a standard dense array.`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
    if (!lengthDescriptor || !('value' in lengthDescriptor)
      || typeof lengthDescriptor.value !== 'number' || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0 || lengthDescriptor.value > 10000) {
      return fail('MalformedInput', `${label} has an invalid length.`);
    }
    const length = lengthDescriptor.value;
    const expectedNames = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    const names = Object.getOwnPropertyNames(value);
    if (names.length !== expectedNames.size || names.some(name => !expectedNames.has(name))) {
      return fail('MalformedInput', `${label} must be dense and contain no custom properties.`);
    }
    return Object.freeze(Array.from({ length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
        return fail('MalformedInput', `${label}[${index}] must be an enumerable data property.`);
      }
      return descriptor.value;
    }));
  } catch (error) {
    if (error instanceof YearLifecycleBoundaryError) throw error;
    return fail('MalformedInput', `${label} could not be inspected safely.`);
  }
};

const utf8 = (value: string): number[] => {
  const bytes: number[] = [];
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x7f) bytes.push(codePoint);
    else if (codePoint <= 0x7ff) bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    else if (codePoint <= 0xffff) bytes.push(
      0xe0 | (codePoint >>> 12), 0x80 | ((codePoint >>> 6) & 0x3f), 0x80 | (codePoint & 0x3f)
    );
    else bytes.push(
      0xf0 | (codePoint >>> 18), 0x80 | ((codePoint >>> 12) & 0x3f),
      0x80 | ((codePoint >>> 6) & 0x3f), 0x80 | (codePoint & 0x3f)
    );
  }
  return bytes;
};

const rotateRight = (value: number, amount: number): number => (value >>> amount) | (value << (32 - amount));

/** Browser-safe synchronous SHA-256 used only over canonical local import material. */
export const sha256Hex = (text: string): string => {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const bytes = utf8(text);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const position = offset + index * 4;
      words[index] = ((bytes[position] << 24) | (bytes[position + 1] << 16)
        | (bytes[position + 2] << 8) | bytes[position + 3]) | 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + constants[index] + words[index]) | 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    hash[0] = (hash[0] + a) | 0; hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0; hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0; hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0; hash[7] = (hash[7] + h) | 0;
  }
  return hash.map(value => (value >>> 0).toString(16).padStart(8, '0')).join('').toUpperCase();
};

const historicalRecordKeys = Object.freeze([
  'recordType', 'recordKey', 'performanceYear', 'entityType', 'sourceRecordKey', 'version',
  'classification', 'closedYearSnapshot', 'snapshotValue'
]);
const baselineRecordKeys = Object.freeze([
  'recordType', 'recordKey', 'performanceYear', 'entityType', 'sourceRecordKey', 'version',
  'classification', 'approvalStatus', 'lifecycleStatus'
]);
const historicalEntityTypes = Object.freeze([
  'GoldKpiSnapshot', 'GoldTargetSnapshot', 'GoldClassificationSnapshot'
]);
const baselineEntityTypes = Object.freeze(['KPI', 'Strategy', 'Framework', 'Population']);
const classifications = Object.freeze(['Core', 'Impact', 'NotApplicable']);

const canonicalRecord = (value: unknown, index: number): Readonly<YearLifecycleImportRecord> => {
  const envelope = inspectOwnData(value, `Import record ${index + 1}`, [],
    Array.from(new Set(historicalRecordKeys.concat(baselineRecordKeys))));
  const recordType = envelope.recordType;
  if (typeof recordType === 'string' && /workplan/i.test(recordType)) {
    return fail('WorkplanImportForbidden', 'Lifecycle import must never contain a Workplan record.');
  }
  if (recordType === 'HistoricalGold') {
    const source = inspectOwnData(value, `Historical GOLD record ${index + 1}`, historicalRecordKeys);
    if (source.performanceYear !== 2026) return fail('WrongYear', 'Historical GOLD records must be for 2026.');
    if (historicalEntityTypes.indexOf(source.entityType as string) < 0) {
      return fail('WorkplanImportForbidden', 'Historical GOLD import contains an unsupported entity type.');
    }
    if (classifications.indexOf(source.classification as string) < 0 || source.closedYearSnapshot !== true) {
      return fail('MalformedInput', 'Historical GOLD records must preserve a closed-year classification snapshot.');
    }
    return Object.freeze({
      recordType: 'HistoricalGold' as const,
      recordKey: governedText(source.recordKey, 'Historical record key'),
      performanceYear: 2026 as const,
      entityType: source.entityType as IHistoricalGoldImportRecord['entityType'],
      sourceRecordKey: governedText(source.sourceRecordKey, 'Historical source record key'),
      version: governedText(source.version, 'Historical record version'),
      classification: source.classification as IHistoricalGoldImportRecord['classification'],
      closedYearSnapshot: true as const,
      snapshotValue: governedText(source.snapshotValue, 'Historical snapshot value')
    });
  }
  if (recordType === 'ApprovedBaseline') {
    const source = inspectOwnData(value, `Approved baseline record ${index + 1}`, baselineRecordKeys);
    if (source.performanceYear !== 2027) return fail('WrongYear', 'Approved baseline records must be for 2027.');
    if (baselineEntityTypes.indexOf(source.entityType as string) < 0) {
      return fail('WorkplanImportForbidden', 'New-year baseline import contains an unsupported entity type.');
    }
    if (classifications.indexOf(source.classification as string) < 0
      || source.approvalStatus !== 'Approved' || source.lifecycleStatus !== 'Current') {
      return fail('UnapprovedContent', 'New-year baseline records must be approved and current.');
    }
    return Object.freeze({
      recordType: 'ApprovedBaseline' as const,
      recordKey: governedText(source.recordKey, 'Baseline record key'),
      performanceYear: 2027 as const,
      entityType: source.entityType as IApprovedBaselineImportRecord['entityType'],
      sourceRecordKey: governedText(source.sourceRecordKey, 'Baseline source record key'),
      version: governedText(source.version, 'Baseline record version'),
      classification: source.classification as IApprovedBaselineImportRecord['classification'],
      approvalStatus: 'Approved' as const,
      lifecycleStatus: 'Current' as const
    });
  }
  return fail('WorkplanImportForbidden', 'Lifecycle import contains an unsupported or forbidden record type.');
};

const canonicalRecords = (value: unknown): ReadonlyArray<Readonly<YearLifecycleImportRecord>> => {
  const records = inspectDenseArray(value, 'Import records').map(canonicalRecord);
  const keys = records.map(record => record.recordKey);
  const sourceKeys = records.map(record => record.sourceRecordKey);
  if (new Set(keys).size !== keys.length || new Set(sourceKeys).size !== sourceKeys.length) {
    return fail('DuplicateImport', 'Import records contain duplicate record or source identities.');
  }
  return Object.freeze(records);
};

const manifestMaterial = (manifest: Omit<IYearLifecycleImportManifest, 'manifestSha256'>): object => ({
  schema: manifest.schema,
  schemaVersion: manifest.schemaVersion,
  manifestId: manifest.manifestId,
  importKind: manifest.importKind,
  targetYear: manifest.targetYear,
  configurationVersion: manifest.configurationVersion,
  complete: manifest.complete,
  approved: manifest.approved,
  approvalReference: manifest.approvalReference,
  approvedBy: manifest.approvedBy,
  approvedAt: manifest.approvedAt,
  source: manifest.source,
  recordCount: manifest.recordCount,
  recordsSha256: manifest.recordsSha256,
  records: manifest.records
});

const canonicalManifest = (value: unknown): Readonly<IYearLifecycleImportManifest> => {
  const source = inspectOwnData(value, 'Lifecycle import manifest', [
    'schema', 'schemaVersion', 'manifestId', 'importKind', 'targetYear', 'configurationVersion',
    'complete', 'approved', 'approvalReference', 'approvedBy', 'approvedAt', 'source',
    'recordCount', 'recordsSha256', 'manifestSha256', 'records'
  ]);
  if (source.schema !== 'KCF.YearLifecycleImportManifest' || source.schemaVersion !== '1.0.0') {
    return fail('UnsupportedSchema', 'Lifecycle import schema or schema version is unsupported.');
  }
  if (source.complete !== true) return fail('CountMismatch', 'Partial lifecycle imports are forbidden.');
  if (source.approved !== true) return fail('UnapprovedContent', 'Lifecycle import manifest is not approved.');
  const importKind = source.importKind;
  const targetYear = source.targetYear;
  if ((importKind !== 'HistoricalGold2026' || targetYear !== 2026)
    && (importKind !== 'ApprovedNewYearBaseline2027' || targetYear !== 2027)) {
    return fail('WrongYear', 'Lifecycle import kind and target year do not match the controlled 2026/2027 routes.');
  }
  const sourceIdentity = inspectOwnData(source.source, 'Lifecycle import source', [
    'sourceId', 'sourceVersion', 'sourceEtag', 'contentSha256'
  ]);
  const sourceEtag = governedText(sourceIdentity.sourceEtag, 'Source ETag');
  if (sourceEtag === '*') return fail('SourceMismatch', 'Lifecycle import requires an exact source ETag.');
  const records = canonicalRecords(source.records);
  if (records.some(record => importKind === 'HistoricalGold2026'
    ? record.recordType !== 'HistoricalGold' : record.recordType !== 'ApprovedBaseline')) {
    return fail('WrongYear', 'Lifecycle import records do not match the manifest route.');
  }
  const recordCount = wholeNumber(source.recordCount, 'Manifest record count');
  if (recordCount !== records.length) return fail('CountMismatch', 'Manifest record count does not match content.');
  const recordsSha256 = exactSha256(source.recordsSha256, 'Records SHA-256');
  const contentSha256 = exactSha256(sourceIdentity.contentSha256, 'Source content SHA-256');
  const actualRecordsSha256 = sha256Hex(JSON.stringify(records));
  if (recordsSha256 !== actualRecordsSha256 || contentSha256 !== actualRecordsSha256) {
    return fail('HashMismatch', 'Manifest record or source content hash does not match canonical content.');
  }
  const withoutManifestHash: Omit<IYearLifecycleImportManifest, 'manifestSha256'> = Object.freeze({
    schema: 'KCF.YearLifecycleImportManifest' as const,
    schemaVersion: '1.0.0' as const,
    manifestId: governedText(source.manifestId, 'Manifest ID'),
    importKind: importKind as IYearLifecycleImportManifest['importKind'],
    targetYear: targetYear as IYearLifecycleImportManifest['targetYear'],
    configurationVersion: governedText(source.configurationVersion, 'Configuration version'),
    complete: true as const,
    approved: true as const,
    approvalReference: governedText(source.approvalReference, 'Approval reference'),
    approvedBy: governedText(source.approvedBy, 'Approver'),
    approvedAt: exactUtc(source.approvedAt, 'Approval time'),
    source: Object.freeze({
      sourceId: governedText(sourceIdentity.sourceId, 'Source ID'),
      sourceVersion: governedText(sourceIdentity.sourceVersion, 'Source version'),
      sourceEtag,
      contentSha256
    }),
    recordCount,
    recordsSha256,
    records
  });
  const manifestSha256 = exactSha256(source.manifestSha256, 'Manifest SHA-256');
  if (manifestSha256 !== sha256Hex(JSON.stringify(manifestMaterial(withoutManifestHash)))) {
    return fail('HashMismatch', 'Manifest SHA-256 does not match canonical manifest content.');
  }
  return Object.freeze({ ...withoutManifestHash, manifestSha256 });
};

/** Creates a canonical manifest; authority is still enforced separately by the expected identity at plan time. */
export const sealYearLifecycleImportManifest = (draft: unknown): Readonly<IYearLifecycleImportManifest> => {
  const source = inspectOwnData(draft, 'Lifecycle import draft', [
    'schema', 'schemaVersion', 'manifestId', 'importKind', 'targetYear', 'configurationVersion',
    'complete', 'approved', 'approvalReference', 'approvedBy', 'approvedAt', 'source', 'records'
  ]);
  const sourceIdentity = inspectOwnData(source.source, 'Lifecycle import draft source', [
    'sourceId', 'sourceVersion', 'sourceEtag'
  ]);
  const records = canonicalRecords(source.records);
  const recordsSha256 = sha256Hex(JSON.stringify(records));
  const unsigned = {
    schema: source.schema,
    schemaVersion: source.schemaVersion,
    manifestId: source.manifestId,
    importKind: source.importKind,
    targetYear: source.targetYear,
    configurationVersion: source.configurationVersion,
    complete: source.complete,
    approved: source.approved,
    approvalReference: source.approvalReference,
    approvedBy: source.approvedBy,
    approvedAt: source.approvedAt,
    source: { ...sourceIdentity, contentSha256: recordsSha256 },
    recordCount: records.length,
    recordsSha256,
    records
  };
  const manifestSha256 = sha256Hex(JSON.stringify(manifestMaterial(
    unsigned as Omit<IYearLifecycleImportManifest, 'manifestSha256'>
  )));
  return canonicalManifest({ ...unsigned, manifestSha256 });
};

const canonicalActor = (value: unknown): Readonly<IYearLifecycleActor> => {
  const source = inspectOwnData(value, 'Lifecycle actor', ['actorId', 'actorEmail', 'role', 'active']);
  if (source.role !== 'LifecycleAdministrator' || source.active !== true) {
    return fail('Unauthorised', 'An active Lifecycle Administrator is required.');
  }
  const email = governedText(source.actorEmail, 'Lifecycle actor email').toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Unauthorised', 'Lifecycle actor email is invalid.');
  return Object.freeze({
    actorId: governedText(source.actorId, 'Lifecycle actor ID'),
    actorEmail: email,
    role: 'LifecycleAdministrator' as const,
    active: true as const
  });
};

const canonicalRequest = (value: unknown): Readonly<IYearLifecycleImportRequest> => {
  const source = inspectOwnData(value, 'Lifecycle import request', ['idempotencyKey', 'requestedAt', 'actor']);
  return Object.freeze({
    idempotencyKey: governedText(source.idempotencyKey, 'Idempotency key'),
    requestedAt: exactUtc(source.requestedAt, 'Requested time'),
    actor: canonicalActor(source.actor)
  });
};

const canonicalExpectation = (value: unknown): Readonly<IYearLifecycleManifestExpectation> => {
  const source = inspectOwnData(value, 'Lifecycle manifest expectation', [
    'manifestId', 'manifestSha256', 'importKind', 'targetYear', 'configurationVersion',
    'approvalReference', 'sourceId', 'sourceVersion', 'sourceEtag', 'sourceContentSha256'
  ]);
  if ((source.importKind !== 'HistoricalGold2026' || source.targetYear !== 2026)
    && (source.importKind !== 'ApprovedNewYearBaseline2027' || source.targetYear !== 2027)) {
    return fail('WrongYear', 'Expected import kind and year are invalid.');
  }
  return Object.freeze({
    manifestId: governedText(source.manifestId, 'Expected manifest ID'),
    manifestSha256: exactSha256(source.manifestSha256, 'Expected manifest SHA-256'),
    importKind: source.importKind as IYearLifecycleManifestExpectation['importKind'],
    targetYear: source.targetYear as IYearLifecycleManifestExpectation['targetYear'],
    configurationVersion: governedText(source.configurationVersion, 'Expected configuration version'),
    approvalReference: governedText(source.approvalReference, 'Expected approval reference'),
    sourceId: governedText(source.sourceId, 'Expected source ID'),
    sourceVersion: governedText(source.sourceVersion, 'Expected source version'),
    sourceEtag: governedText(source.sourceEtag, 'Expected source ETag'),
    sourceContentSha256: exactSha256(source.sourceContentSha256, 'Expected source content SHA-256')
  });
};

const receiptKeys = Object.freeze([
  'receiptId', 'idempotencyKey', 'manifestId', 'manifestSha256', 'importKind', 'targetYear',
  'configurationVersion', 'sourceId', 'sourceVersion', 'sourceEtag', 'sourceContentSha256',
  'recordCount', 'actorId', 'actorEmail', 'appliedAt', 'beforeRevision', 'afterRevision',
  'beforeStateSha256', 'afterStateSha256'
]);

const canonicalReceipt = (value: unknown): Readonly<IYearLifecycleImportReceipt> => {
  const source = inspectOwnData(value, 'Lifecycle receipt', receiptKeys);
  if ((source.importKind !== 'HistoricalGold2026' || source.targetYear !== 2026)
    && (source.importKind !== 'ApprovedNewYearBaseline2027' || source.targetYear !== 2027)) {
    return fail('MalformedInput', 'Lifecycle receipt kind and year are invalid.');
  }
  return Object.freeze({
    receiptId: governedText(source.receiptId, 'Receipt ID'),
    idempotencyKey: governedText(source.idempotencyKey, 'Receipt idempotency key'),
    manifestId: governedText(source.manifestId, 'Receipt manifest ID'),
    manifestSha256: exactSha256(source.manifestSha256, 'Receipt manifest SHA-256'),
    importKind: source.importKind as IYearLifecycleImportReceipt['importKind'],
    targetYear: source.targetYear as IYearLifecycleImportReceipt['targetYear'],
    configurationVersion: governedText(source.configurationVersion, 'Receipt configuration version'),
    sourceId: governedText(source.sourceId, 'Receipt source ID'),
    sourceVersion: governedText(source.sourceVersion, 'Receipt source version'),
    sourceEtag: governedText(source.sourceEtag, 'Receipt source ETag'),
    sourceContentSha256: exactSha256(source.sourceContentSha256, 'Receipt source content SHA-256'),
    recordCount: wholeNumber(source.recordCount, 'Receipt record count'),
    actorId: governedText(source.actorId, 'Receipt actor ID'),
    actorEmail: governedText(source.actorEmail, 'Receipt actor email'),
    appliedAt: exactUtc(source.appliedAt, 'Receipt applied time'),
    beforeRevision: wholeNumber(source.beforeRevision, 'Receipt before revision'),
    afterRevision: wholeNumber(source.afterRevision, 'Receipt after revision'),
    beforeStateSha256: exactSha256(source.beforeStateSha256, 'Receipt before-state SHA-256'),
    afterStateSha256: exactSha256(source.afterStateSha256, 'Receipt after-state SHA-256')
  });
};

const canonicalYear = (value: unknown): Readonly<IYearLifecycleYearState> => {
  const source = inspectOwnData(value, 'Lifecycle year state', [
    'performanceYear', 'configurationVersion', 'historicalGoldRecords', 'approvedBaselineRecords'
  ]);
  if (source.performanceYear !== 2026 && source.performanceYear !== 2027) {
    return fail('WrongYear', 'Lifecycle state contains an unsupported year.');
  }
  const historicalGoldRecords = Object.freeze(inspectDenseArray(
    source.historicalGoldRecords, 'Historical state records'
  ).map(canonicalRecord).map(record => {
    if (record.recordType !== 'HistoricalGold') return fail('MalformedInput', 'Historical state contains a baseline record.');
    return record;
  }));
  const approvedBaselineRecords = Object.freeze(inspectDenseArray(
    source.approvedBaselineRecords, 'Baseline state records'
  ).map(canonicalRecord).map(record => {
    if (record.recordType !== 'ApprovedBaseline') return fail('MalformedInput', 'Baseline state contains a historical record.');
    return record;
  }));
  if ((source.performanceYear === 2026 && approvedBaselineRecords.length > 0)
    || (source.performanceYear === 2027 && historicalGoldRecords.length > 0)) {
    return fail('WrongYear', 'Lifecycle state mixes historical and new-year records.');
  }
  return Object.freeze({
    performanceYear: source.performanceYear,
    configurationVersion: governedText(source.configurationVersion, 'Year configuration version'),
    historicalGoldRecords,
    approvedBaselineRecords
  });
};

const canonicalState = (value: unknown): Readonly<IYearLifecycleState> => {
  const source = inspectOwnData(value, 'Lifecycle state', ['schema', 'revision', 'years', 'receipts']);
  if (source.schema !== 'KCF.YearLifecycleState') return fail('UnsupportedSchema', 'Lifecycle state schema is invalid.');
  const years = Object.freeze(inspectDenseArray(source.years, 'Lifecycle years').map(canonicalYear)
    .sort((left, right) => left.performanceYear - right.performanceYear));
  if (new Set(years.map(year => year.performanceYear)).size !== years.length) {
    return fail('StateConflict', 'Lifecycle state contains duplicate years.');
  }
  const receipts = Object.freeze(inspectDenseArray(source.receipts, 'Lifecycle receipts').map(canonicalReceipt));
  if (new Set(receipts.map(receipt => receipt.receiptId)).size !== receipts.length
    || new Set(receipts.map(receipt => receipt.idempotencyKey)).size !== receipts.length) {
    return fail('StateConflict', 'Lifecycle state contains duplicate receipt identity.');
  }
  return Object.freeze({
    schema: 'KCF.YearLifecycleState' as const,
    revision: wholeNumber(source.revision, 'Lifecycle state revision'),
    years,
    receipts
  });
};

const receiptHashMaterial = (receipt: Readonly<IYearLifecycleImportReceipt>): object => ({
  receiptId: receipt.receiptId,
  idempotencyKey: receipt.idempotencyKey,
  manifestId: receipt.manifestId,
  manifestSha256: receipt.manifestSha256,
  importKind: receipt.importKind,
  targetYear: receipt.targetYear,
  configurationVersion: receipt.configurationVersion,
  sourceId: receipt.sourceId,
  sourceVersion: receipt.sourceVersion,
  sourceEtag: receipt.sourceEtag,
  sourceContentSha256: receipt.sourceContentSha256,
  recordCount: receipt.recordCount,
  actorId: receipt.actorId,
  actorEmail: receipt.actorEmail,
  appliedAt: receipt.appliedAt,
  beforeRevision: receipt.beforeRevision,
  afterRevision: receipt.afterRevision
});

export const yearLifecycleStateSha256 = (value: unknown): string => {
  const state = canonicalState(value);
  return sha256Hex(JSON.stringify({
    schema: state.schema,
    revision: state.revision,
    years: state.years,
    receipts: state.receipts.map(receiptHashMaterial)
  }));
};

export const createEmptyYearLifecycleState = (): Readonly<IYearLifecycleState> => Object.freeze({
  schema: 'KCF.YearLifecycleState' as const,
  revision: 0,
  years: Object.freeze([]),
  receipts: Object.freeze([])
});

const report = (
  phase: IYearLifecycleExceptionReport['phase'],
  code: YearLifecycleExceptionCode,
  message: string,
  context: { manifestId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string }
): Readonly<IYearLifecycleExceptionReport> => {
  const manifestId = context.manifestId || 'UNKNOWN';
  const idempotencyKey = context.idempotencyKey || 'UNKNOWN';
  const actorId = context.actorId || 'UNKNOWN';
  const occurredAt = context.occurredAt || '1970-01-01T00:00:00.000Z';
  return Object.freeze({
    reportId: `EXC-${sha256Hex(`${phase}|${code}|${manifestId}|${idempotencyKey}|${actorId}|${occurredAt}`).slice(0, 20)}`,
    phase,
    code,
    message,
    manifestId,
    idempotencyKey,
    actorId,
    occurredAt
  });
};

const errorResult = (
  phase: IYearLifecycleExceptionReport['phase'],
  error: unknown,
  context: { manifestId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string }
): { readonly status: 'Rejected'; readonly exception: Readonly<IYearLifecycleExceptionReport> } => {
  const code = error instanceof YearLifecycleBoundaryError ? error.code : 'MalformedInput';
  const message = error instanceof YearLifecycleBoundaryError
    ? error.message : 'Lifecycle input could not be inspected safely.';
  return Object.freeze({ status: 'Rejected' as const, exception: report(phase, code, message, context) });
};

interface IPlanCapability {
  readonly manifest: Readonly<IYearLifecycleImportManifest>;
  readonly request: Readonly<IYearLifecycleImportRequest>;
  readonly expectedStateSha256: string;
}

interface IRecoveryCapability {
  readonly priorState: Readonly<IYearLifecycleState>;
  readonly appliedStateSha256: string;
  readonly receipt: Readonly<IYearLifecycleImportReceipt>;
}

const planCapabilities = new WeakMap<object, Readonly<IPlanCapability>>();
const recoveryCapabilities = new WeakMap<object, Readonly<IRecoveryCapability>>();
const usedRecoveryTokens = new WeakSet<object>();

const matchesExpectation = (
  manifest: Readonly<IYearLifecycleImportManifest>,
  expected: Readonly<IYearLifecycleManifestExpectation>
): void => {
  if (manifest.source.sourceId !== expected.sourceId) return fail('SourceMismatch', 'Manifest source identity is unexpected.');
  if (manifest.manifestId !== expected.manifestId || manifest.importKind !== expected.importKind
    || manifest.targetYear !== expected.targetYear || manifest.configurationVersion !== expected.configurationVersion
    || manifest.approvalReference !== expected.approvalReference
    || manifest.source.sourceVersion !== expected.sourceVersion || manifest.source.sourceEtag !== expected.sourceEtag
    || manifest.source.contentSha256 !== expected.sourceContentSha256
    || manifest.manifestSha256 !== expected.manifestSha256) {
    return fail('StaleManifest', 'Manifest version, approval, hash or expected provenance changed after load.');
  }
};

export const planYearLifecycleImport = (
  manifestValue: unknown,
  expectationValue: unknown,
  stateValue: unknown,
  requestValue: unknown
): YearLifecyclePlanResult => {
  let context: { manifestId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    const request = canonicalRequest(requestValue);
    context = {
      idempotencyKey: request.idempotencyKey,
      actorId: request.actor.actorId,
      occurredAt: request.requestedAt
    };
    const manifest = canonicalManifest(manifestValue);
    context.manifestId = manifest.manifestId;
    const expectation = canonicalExpectation(expectationValue);
    matchesExpectation(manifest, expectation);
    const state = canonicalState(stateValue);
    const sameKey = state.receipts.find(receipt => receipt.idempotencyKey === request.idempotencyKey);
    if (sameKey) {
      if (sameKey.manifestId === manifest.manifestId && sameKey.manifestSha256 === manifest.manifestSha256) {
        return Object.freeze({ status: 'Idempotent' as const, receipt: sameKey });
      }
      return fail('IdempotencyConflict', 'Idempotency key was already used for different content.');
    }
    if (state.receipts.some(receipt => receipt.manifestId === manifest.manifestId
      || receipt.manifestSha256 === manifest.manifestSha256)) {
      return fail('DuplicateImport', 'Manifest was already applied under another idempotency key.');
    }
    const existingYear = state.years.find(year => year.performanceYear === manifest.targetYear);
    if (existingYear && existingYear.configurationVersion !== manifest.configurationVersion) {
      return fail('ConfigurationConflict', 'Target year already has a different governed configuration version.');
    }
    if (existingYear && (existingYear.historicalGoldRecords.length > 0
      || existingYear.approvedBaselineRecords.length > 0)) {
      return fail('DuplicateImport', 'Target year already contains governed imported records.');
    }
    if (manifest.targetYear === 2027 && state.years.some(year => year.performanceYear === 2026
      && year.configurationVersion === manifest.configurationVersion)) {
      return fail('ConfigurationConflict', 'New year must use its own governed configuration version.');
    }
    const expectedStateSha256 = yearLifecycleStateSha256(state);
    const plan: Readonly<IYearLifecycleImportPlan> = Object.freeze({
      planId: `PLAN-${manifest.manifestSha256.slice(0, 16)}-${sha256Hex(request.idempotencyKey).slice(0, 12)}`,
      manifestId: manifest.manifestId,
      manifestSha256: manifest.manifestSha256,
      importKind: manifest.importKind,
      targetYear: manifest.targetYear,
      configurationVersion: manifest.configurationVersion,
      recordCount: manifest.recordCount,
      idempotencyKey: request.idempotencyKey,
      expectedStateRevision: state.revision,
      expectedStateSha256
    });
    planCapabilities.set(plan, Object.freeze({ manifest, request, expectedStateSha256 }));
    return Object.freeze({ status: 'Planned' as const, plan });
  } catch (error) {
    return errorResult('Plan', error, context);
  }
};

const buildYearState = (
  manifest: Readonly<IYearLifecycleImportManifest>
): Readonly<IYearLifecycleYearState> => Object.freeze({
  performanceYear: manifest.targetYear,
  configurationVersion: manifest.configurationVersion,
  historicalGoldRecords: Object.freeze(manifest.records.filter(
    (record): record is Readonly<IHistoricalGoldImportRecord> => record.recordType === 'HistoricalGold'
  )),
  approvedBaselineRecords: Object.freeze(manifest.records.filter(
    (record): record is Readonly<IApprovedBaselineImportRecord> => record.recordType === 'ApprovedBaseline'
  ))
});

export const applyYearLifecycleImport = (
  planValue: unknown,
  stateValue: unknown
): YearLifecycleApplyResult => {
  let context: { manifestId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    if (!planValue || typeof planValue !== 'object') return fail('MalformedInput', 'A genuine import plan is required.');
    const capability = planCapabilities.get(planValue);
    if (!capability) return fail('Unauthorised', 'Import plan is forged, stale or was not created by this engine.');
    const { manifest, request, expectedStateSha256 } = capability;
    context = {
      manifestId: manifest.manifestId,
      idempotencyKey: request.idempotencyKey,
      actorId: request.actor.actorId,
      occurredAt: request.requestedAt
    };
    const state = canonicalState(stateValue);
    const beforeStateSha256 = yearLifecycleStateSha256(state);
    if (beforeStateSha256 !== expectedStateSha256 || state.revision !== (planValue as IYearLifecycleImportPlan).expectedStateRevision) {
      return fail('StateConflict', 'Lifecycle state changed after the import was planned.');
    }
    const nextYear = buildYearState(manifest);
    const nextYears = Object.freeze(state.years.filter(year => year.performanceYear !== manifest.targetYear)
      .concat([nextYear]).sort((left, right) => left.performanceYear - right.performanceYear));
    const receiptBase = {
      receiptId: `RECEIPT-${manifest.manifestSha256.slice(0, 20)}`,
      idempotencyKey: request.idempotencyKey,
      manifestId: manifest.manifestId,
      manifestSha256: manifest.manifestSha256,
      importKind: manifest.importKind,
      targetYear: manifest.targetYear,
      configurationVersion: manifest.configurationVersion,
      sourceId: manifest.source.sourceId,
      sourceVersion: manifest.source.sourceVersion,
      sourceEtag: manifest.source.sourceEtag,
      sourceContentSha256: manifest.source.contentSha256,
      recordCount: manifest.recordCount,
      actorId: request.actor.actorId,
      actorEmail: request.actor.actorEmail,
      appliedAt: request.requestedAt,
      beforeRevision: state.revision,
      afterRevision: state.revision + 1,
      beforeStateSha256,
      afterStateSha256: '0'.repeat(64)
    };
    const provisionalReceipt = canonicalReceipt(receiptBase);
    const provisionalState = canonicalState({
      schema: 'KCF.YearLifecycleState',
      revision: state.revision + 1,
      years: nextYears,
      receipts: state.receipts.concat([provisionalReceipt])
    });
    const afterStateSha256 = yearLifecycleStateSha256(provisionalState);
    const receipt = canonicalReceipt({ ...receiptBase, afterStateSha256 });
    const nextState = canonicalState({
      schema: 'KCF.YearLifecycleState',
      revision: state.revision + 1,
      years: nextYears,
      receipts: state.receipts.concat([receipt])
    });
    if (yearLifecycleStateSha256(nextState) !== afterStateSha256) {
      return fail('StateConflict', 'Lifecycle state hash did not stabilise after apply.');
    }
    const recovery: Readonly<IYearLifecycleRecoveryToken> = Object.freeze({
      recoveryId: `RECOVERY-${receipt.receiptId}`,
      receiptId: receipt.receiptId,
      appliedStateRevision: nextState.revision,
      appliedStateSha256: afterStateSha256,
      priorStateSha256: beforeStateSha256
    });
    recoveryCapabilities.set(recovery, Object.freeze({
      priorState: state,
      appliedStateSha256: afterStateSha256,
      receipt
    }));
    return Object.freeze({ status: 'Applied' as const, state: nextState, receipt, recovery });
  } catch (error) {
    return errorResult('Apply', error, context);
  }
};

export const readYearLifecycleYear = (
  stateValue: unknown,
  performanceYear: 2026 | 2027
): Readonly<IYearLifecycleYearState> | undefined => canonicalState(stateValue).years.find(
  year => year.performanceYear === performanceYear
);

export const rollbackYearLifecycleImport = (
  currentStateValue: unknown,
  recoveryValue: unknown,
  actorValue: unknown,
  rolledBackAtValue: unknown,
  reasonValue: unknown
): YearLifecycleRollbackResult => {
  let context: { manifestId?: string; idempotencyKey?: string; actorId?: string; occurredAt?: string } = {};
  try {
    const actor = canonicalActor(actorValue);
    const rolledBackAt = exactUtc(rolledBackAtValue, 'Rollback time');
    const reason = governedText(reasonValue, 'Rollback reason');
    context = { actorId: actor.actorId, occurredAt: rolledBackAt };
    if (!recoveryValue || typeof recoveryValue !== 'object') return fail('MalformedInput', 'A genuine recovery token is required.');
    const capability = recoveryCapabilities.get(recoveryValue);
    if (!capability) return fail('Unauthorised', 'Recovery token is forged or was not created by this engine.');
    context.manifestId = capability.receipt.manifestId;
    context.idempotencyKey = capability.receipt.idempotencyKey;
    if (usedRecoveryTokens.has(recoveryValue)) return fail('RollbackAlreadyUsed', 'Recovery token was already used.');
    const currentState = canonicalState(currentStateValue);
    const currentSha256 = yearLifecycleStateSha256(currentState);
    if (currentSha256 !== capability.appliedStateSha256
      || currentState.revision !== (recoveryValue as IYearLifecycleRecoveryToken).appliedStateRevision) {
      return fail('RollbackConflict', 'Lifecycle state changed after apply; recovery token is stale.');
    }
    if (yearLifecycleStateSha256(capability.priorState)
      !== (recoveryValue as IYearLifecycleRecoveryToken).priorStateSha256) {
      return fail('RollbackConflict', 'Recovery token prior-state identity is invalid.');
    }
    const receipt: Readonly<IYearLifecycleRollbackReceipt> = Object.freeze({
      rollbackReceiptId: `ROLLBACK-${capability.receipt.receiptId}`,
      receiptId: capability.receipt.receiptId,
      recoveryId: (recoveryValue as IYearLifecycleRecoveryToken).recoveryId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      rolledBackAt,
      reason,
      removedStateSha256: currentSha256,
      restoredStateSha256: yearLifecycleStateSha256(capability.priorState)
    });
    usedRecoveryTokens.add(recoveryValue);
    return Object.freeze({ status: 'RolledBack' as const, state: capability.priorState, receipt });
  } catch (error) {
    return errorResult('Rollback', error, context);
  }
};
