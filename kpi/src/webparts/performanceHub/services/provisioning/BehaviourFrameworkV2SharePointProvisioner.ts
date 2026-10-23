import type { IBehaviourCataloguePublicationRecord } from '../AdminBehaviourDefinitionsDomainV2';
import type { IBehaviourCatalogueSourceRow } from '../BehaviourLibraryCatalogue';
import type {
  IBehaviourFrameworkV2Catalogue,
  IBehaviourFrameworkV2CatalogueRow,
  IBehaviourFrameworkV2RoleLevel
} from '../BehaviourFrameworkV2';
import {
  BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY,
  BEHAVIOUR_FRAMEWORK_V2_RATINGS,
  BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS,
  BEHAVIOUR_FRAMEWORK_V2_SCHEMA_VERSION,
  createBehaviourFrameworkV2Catalogue,
  inspectBehaviourFrameworkV2Catalogue
} from '../BehaviourFrameworkV2';
import {
  APPROVED_BEHAVIOUR_V1_CATALOGUE_BLOCK_SHA256,
  APPROVED_BEHAVIOUR_V1_DECISION_CONTENT_SHA256,
  APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROW_CANONICAL_FORMAT,
  APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROW_FIELDS,
  APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256,
  APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH,
  APPROVED_BEHAVIOUR_V1_INSTRUCTION_SHA256,
  APPROVED_BEHAVIOUR_V1_SOURCE_ROWS
} from '../../testing/BehaviourFrameworkV1ApprovedData';

export const BEHAVIOUR_FRAMEWORK_V2_EXECUTION_LOCK = 'PACKAGE_ONLY_NO_TENANT_MUTATION';

export interface IBehaviourFrameworkV2SharePointField {
  internalName: string;
  type: 'Text' | 'Note' | 'Number' | 'Boolean' | 'DateTime';
  required: boolean;
  indexed: boolean;
}

export interface IBehaviourFrameworkV2SharePointListSchema {
  title: string;
  schemaVersion: '2.0';
  fields: ReadonlyArray<Readonly<IBehaviourFrameworkV2SharePointField>>;
}

export const BEHAVIOUR_FRAMEWORK_V2_SHAREPOINT_SCHEMAS: ReadonlyArray<Readonly<IBehaviourFrameworkV2SharePointListSchema>> = [
  {
    title: 'KCFKPI_BehaviourRoleLevels', schemaVersion: '2.0', fields: [
      { internalName: 'RoleLevelCode', type: 'Text', required: true, indexed: true },
      { internalName: 'RoleLevelName', type: 'Text', required: true, indexed: false },
      { internalName: 'SchemaVersion', type: 'Text', required: true, indexed: true },
      { internalName: 'SortOrder', type: 'Number', required: true, indexed: false },
      { internalName: 'Active', type: 'Boolean', required: true, indexed: true }
    ]
  },
  {
    title: 'KCFKPI_BehaviourFocusCatalogue', schemaVersion: '2.0', fields: [
      { internalName: 'TargetKey', type: 'Text', required: true, indexed: true },
      { internalName: 'CatalogueVersion', type: 'Text', required: true, indexed: true },
      { internalName: 'ContentSha256', type: 'Text', required: true, indexed: true },
      { internalName: 'ContentCanonicalUtf8ByteLength', type: 'Number', required: true, indexed: false },
      { internalName: 'BehaviourKey', type: 'Text', required: true, indexed: true },
      { internalName: 'RoleLevelCode', type: 'Text', required: true, indexed: true },
      { internalName: 'FocusArea', type: 'Text', required: true, indexed: false },
      { internalName: 'SuggestedTarget', type: 'Note', required: true, indexed: false },
      { internalName: 'SuggestedMeasure', type: 'Note', required: true, indexed: false },
      { internalName: 'SuggestedUnit', type: 'Text', required: true, indexed: false },
      { internalName: 'SuggestedEvidence', type: 'Note', required: true, indexed: false },
      { internalName: 'EffectiveStatus', type: 'Text', required: true, indexed: true },
      { internalName: 'EffectiveFrom', type: 'DateTime', required: true, indexed: true },
      { internalName: 'EffectiveTo', type: 'DateTime', required: false, indexed: true },
      { internalName: 'SortOrder', type: 'Number', required: true, indexed: false }
    ]
  },
  {
    title: 'KCFKPI_BehaviourCataloguePublications', schemaVersion: '2.0', fields: [
      { internalName: 'CatalogueVersion', type: 'Text', required: true, indexed: true },
      { internalName: 'Revision', type: 'Number', required: true, indexed: true },
      { internalName: 'SourcePath', type: 'Text', required: true, indexed: false },
      { internalName: 'SourceSha256', type: 'Text', required: true, indexed: true },
      { internalName: 'ContentSha256', type: 'Text', required: true, indexed: true },
      { internalName: 'ContentCanonicalUtf8ByteLength', type: 'Number', required: true, indexed: false },
      { internalName: 'RowCount', type: 'Number', required: true, indexed: false },
      { internalName: 'ActorEmail', type: 'Text', required: true, indexed: true },
      { internalName: 'OccurredAt', type: 'DateTime', required: true, indexed: true },
      { internalName: 'Result', type: 'Text', required: true, indexed: true }
    ]
  }
];

export interface IBehaviourFrameworkV2TenantSnapshot {
  bindingKey: string;
  environment: 'LocalSynthetic';
  schemaVersion?: string;
  catalogueVersion?: string;
  revision?: number;
  sourceSha256?: string;
  roleLevels: ReadonlyArray<Readonly<IBehaviourFrameworkV2RoleLevel>>;
  rows: ReadonlyArray<Readonly<IBehaviourFrameworkV2CatalogueRow>>;
  legacyRows: ReadonlyArray<Readonly<Record<string, unknown>>>;
  publication?: Readonly<IApprovedBehaviourCataloguePublicationRecord>;
}

interface IApprovedBehaviourCataloguePublicationRecord extends IBehaviourCataloguePublicationRecord {
  contentSha256: string;
  contentCanonicalUtf8ByteLength: number;
}

export interface IBehaviourFrameworkV2ProvisioningPlan {
  planKey: string;
  bindingKey: string;
  environment: 'LocalSynthetic';
  executionLock: typeof BEHAVIOUR_FRAMEWORK_V2_EXECUTION_LOCK;
  operation: 'Install' | 'Upgrade' | 'NoChange';
  catalogue: Readonly<IBehaviourFrameworkV2Catalogue>;
  publication: Readonly<IApprovedBehaviourCataloguePublicationRecord>;
  schemas: typeof BEHAVIOUR_FRAMEWORK_V2_SHAREPOINT_SCHEMAS;
  previous: Readonly<IBehaviourFrameworkV2TenantSnapshot>;
  expected: Readonly<IBehaviourFrameworkV2TenantSnapshot>;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ACTOR_PATTERN = /^[^\s@]+@[^\s@]+$/;
const issuedPlans = new WeakSet<object>();
const issuedStates = new WeakSet<object>();

declare const publicationCapabilityBrand: unique symbol;

export type BehaviourFrameworkV2PublicationCapability = Readonly<{
  readonly [publicationCapabilityBrand]: true;
}>;

export interface IBehaviourFrameworkV2TestPublicationTrustAdapter {
  issue(): BehaviourFrameworkV2PublicationCapability;
}

export interface IBehaviourFrameworkV2TestPlatformAuthority {
  getAuthenticatedEmail(): string;
  getUtcNow(): Date;
}

interface ITrustedPublicationAuthority {
  actorEmail: string;
  occurredAt: string;
}

const issuedPublicationCapabilities = new WeakMap<object, Readonly<ITrustedPublicationAuthority>>();
const consumedPublicationCapabilities = new WeakSet<object>();

const APPROVED_CATALOGUE_VERSION = 'KCF-BHV-PD03-2026.09-v1';
const APPROVED_CATALOGUE_REVISION = 1;
const APPROVED_EFFECTIVE_FROM = '2026-11-01';
const APPROVED_SOURCE_PATH = 'data/test-pilot/behaviour-catalogue.v2.json';
const APPROVED_SOURCE_SHA256 = '851ba6c4c315986adb17f3fc0adcfdafba59b225bd97201918462cc85ad338a4';
const APPROVED_INSTRUCTION_SHA256 = '74f2ae0a7fdb33b72419cbf8897eef0b45b23978583abbf27dbf66581f504e8f';
const APPROVED_DECISION_CONTENT_SHA256 = '1f8827c906a31701bffd56a5ce9d072b676754f20aae67d016bf57e11669f8f7';
const APPROVED_CATALOGUE_BLOCK_SHA256 = '483e6a9ba2594b4b0aaef6d856076b7995142254d063b5f76ba5c72d97f98ae5';
const APPROVED_GENERATED_ROW_SHA256 = '3420f5d1fdf3e427f65e2f54fb86545dfc94699992f818921ae7783d790f15e4';
const APPROVED_GOVERNED_SOURCE_ROW_CANONICAL_FORMAT = 'KCF-KPI-BEHAVIOUR-V1-GOVERNED-ROWS-V1';
const APPROVED_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256 = 'fadbc5d795ab7f092d984ef19f91b936bc23337f828f53eb5b0c86cadbce709c';
const APPROVED_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH = 35668;
const APPROVED_GOVERNED_SOURCE_ROW_FIELDS: ReadonlyArray<keyof IBehaviourCatalogueSourceRow> = Object.freeze([
  'BehaviourObjectiveKey', 'BehaviourKey', 'BehaviourTitle', 'CorporateValue',
  'RoleLevelCode', 'RoleLevelName', 'DropdownLabel', 'ObjectiveTitle',
  'ObjectiveDescription', 'SuggestedMeasure', 'SuggestedUnit', 'SuggestedEvidence',
  'Active', 'SortOrder', 'EffectiveFrom', 'EffectiveTo'
]);
const APPROVED_HEADLINES = Object.freeze([
  Object.freeze({ behaviourKey: 'BHV-01', title: 'WE TAKE RESPONSIBILITY', sortOrder: 1 }),
  Object.freeze({ behaviourKey: 'BHV-02', title: 'WE UNITE AS ONE CLUB', sortOrder: 2 }),
  Object.freeze({ behaviourKey: 'BHV-03', title: 'WE BUILD THE NEXT CHAPTER', sortOrder: 3 }),
  Object.freeze({ behaviourKey: 'BHV-04', title: 'WE RESPECT THE GAME & EACH OTHER', sortOrder: 4 }),
  Object.freeze({ behaviourKey: 'BHV-05', title: 'WE WORK & PLAY WITH ENERGY', sortOrder: 5 })
]);

type PlainRecord = Record<string, unknown>;

const protectedInputError = (path: string): Error =>
  new Error(`Protected input ${path} must be stable enumerable plain own data.`);
const protectedAccessorError = (path: string): Error =>
  new Error(`Protected input ${path} accessor is not stable enumerable plain own data.`);

const sameKeys = (left: ReadonlyArray<PropertyKey>, right: ReadonlyArray<PropertyKey>): boolean =>
  left.length === right.length && left.every((key, index) => key === right[index]);

const sameDescriptor = (left: PropertyDescriptor | undefined, right: PropertyDescriptor | undefined): boolean =>
  !!left && !!right
  && left.enumerable === right.enumerable
  && left.configurable === right.configurable
  && left.writable === right.writable
  && left.get === right.get
  && left.set === right.set
  && Object.is(left.value, right.value);

const ownKeys = (value: object): PropertyKey[] => {
  const getSymbols = (Object as unknown as { getOwnPropertySymbols?: (target: object) => symbol[] })
    .getOwnPropertySymbols;
  return (Object.getOwnPropertyNames(value) as PropertyKey[]).concat(getSymbols ? getSymbols(value) : []);
};

/** Reads descriptors only: accessors are rejected without invoking them, and source objects are never read again. */
const snapshotPlainOwnData = <T>(input: T, label: string): Readonly<T> => {
  const snapshots = new WeakMap<object, unknown>();
  const active = new Set<object>();
  const visit = (value: unknown, path: string): unknown => {
    if (typeof value === 'undefined') throw protectedInputError(path);
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
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
    if (prototypeA !== prototypeB || !sameKeys(keysA, keysB) || keysA.some(key => typeof key === 'symbol')) {
      throw protectedInputError(path);
    }
    const descriptor = (source: Array<PropertyDescriptor | undefined>, key: PropertyKey): PropertyDescriptor | undefined =>
      source[keysA.indexOf(key)];
    if (keysA.some((key, index) => !sameDescriptor(descriptorsA[index], descriptorsB[index]))) {
      throw protectedInputError(path);
    }

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
        if (item && !Object.prototype.hasOwnProperty.call(item, 'value') && (item.get || item.set)) {
          throw protectedAccessorError(`${path}[${index}]`);
        }
        if (!item?.enumerable || !Object.prototype.hasOwnProperty.call(item, 'value')) throw protectedInputError(`${path}[${index}]`);
        return visit(item.value, `${path}[${index}]`);
      });
      const frozen = Object.freeze(copy);
      snapshots.set(value, frozen);
      active.delete(value);
      return frozen;
    }

    if (prototypeA !== Object.prototype) throw protectedInputError(path);
    const copy = Object.create(Object.prototype) as PlainRecord;
    keysA.forEach(key => {
      const item = descriptor(descriptorsA, key);
      if (item && !Object.prototype.hasOwnProperty.call(item, 'value') && (item.get || item.set)) {
        throw protectedAccessorError(`${path}.${String(key)}`);
      }
      if (typeof key !== 'string' || !item?.enumerable || !Object.prototype.hasOwnProperty.call(item, 'value')) {
        throw protectedInputError(`${path}.${String(key)}`);
      }
      Object.defineProperty(copy, key, {
        value: visit(item.value, `${path}.${key}`), enumerable: true, writable: true, configurable: true
      });
    });
    const frozen = Object.freeze(copy);
    snapshots.set(value, frozen);
    active.delete(value);
    return frozen;
  };
  return visit(input, label) as Readonly<T>;
};

/** Compares only canonical snapshots. Original protected objects are never property-read here. */
const exactProtectedEqual = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftIsArray = Array.isArray(left);
  if (leftIsArray !== Array.isArray(right)) return false;
  const leftRecord = left as PlainRecord;
  const rightRecord = right as PlainRecord;
  if (leftIsArray && (left as unknown[]).length !== (right as unknown[]).length) return false;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (!sameKeys(leftKeys, rightKeys)) return false;
  return leftKeys.every(key => exactProtectedEqual(leftRecord[key], rightRecord[key]));
};

const assertRecordKeys: (
  value: unknown,
  required: ReadonlyArray<string>,
  optional?: ReadonlyArray<string>
) => asserts value is PlainRecord = (value, required, optional = []) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Protected record shape is invalid.');
  const keys = Object.keys(value);
  if (required.some(key => keys.indexOf(key) < 0)
    || keys.some(key => required.indexOf(key) < 0 && optional.indexOf(key) < 0)) {
    throw new Error('Protected record shape contains missing or extra fields.');
  }
};

const assertCatalogueShape = (catalogue: IBehaviourFrameworkV2Catalogue): void => {
  assertRecordKeys(catalogue, [
    'catalogueKey', 'catalogueVersion', 'revision', 'schemaVersion', 'status', 'effectiveFrom',
    'headlineBehaviours', 'roleLevels', 'ratingScale', 'selectionGuidance', 'rows'
  ], ['effectiveTo']);
  if (!Array.isArray(catalogue.headlineBehaviours) || !Array.isArray(catalogue.roleLevels)
    || !Array.isArray(catalogue.ratingScale) || !Array.isArray(catalogue.rows)) throw new Error('Catalogue arrays are invalid.');
  catalogue.headlineBehaviours.forEach(row => assertRecordKeys(row, ['behaviourKey', 'title', 'sortOrder']));
  catalogue.roleLevels.forEach(row => assertRecordKeys(row, ['code', 'name', 'sortOrder']));
  assertRecordKeys(catalogue.selectionGuidance, ['recommendedMinimum', 'recommendedMaximum', 'hardMaximum']);
  catalogue.rows.forEach(row => assertRecordKeys(row, [
    'targetKey', 'behaviourKey', 'roleLevelCode', 'focusKey', 'focusArea', 'suggestedTarget',
    'suggestedMeasure', 'suggestedUnit', 'suggestedEvidence', 'status', 'sortOrder', 'effectiveFrom'
  ], ['effectiveTo']));
};

const utf8Bytes = (value: string): number[] => {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let codePoint = value.charCodeAt(index);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      codePoint = 0xfffd;
    }
    if (codePoint <= 0x7f) bytes.push(codePoint);
    else if (codePoint <= 0x7ff) bytes.push(0xc0 | (codePoint >>> 6), 0x80 | (codePoint & 0x3f));
    else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >>> 12), 0x80 | ((codePoint >>> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >>> 18), 0x80 | ((codePoint >>> 12) & 0x3f),
        0x80 | ((codePoint >>> 6) & 0x3f), 0x80 | (codePoint & 0x3f));
    }
  }
  return bytes;
};

const SHA256_INITIAL = Object.freeze([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);
const SHA256_ROUND = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
const rotateRight = (value: number, bits: number): number =>
  ((value >>> bits) | (value << (32 - bits))) >>> 0;

const sha256Hex = (value: string): { readonly digest: string; readonly utf8ByteLength: number } => {
  const bytes = utf8Bytes(value);
  const originalByteLength = bytes.length;
  const bitLength = originalByteLength * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  const highBitLength = Math.floor(bitLength / 0x100000000);
  const lowBitLength = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((highBitLength >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((lowBitLength >>> shift) & 0xff);

  const hash = SHA256_INITIAL.slice();
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const byteOffset = offset + (index * 4);
      words[index] = ((bytes[byteOffset] << 24) | (bytes[byteOffset + 1] << 16)
        | (bytes[byteOffset + 2] << 8) | bytes[byteOffset + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + SHA256_ROUND[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0; hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0; hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0; hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0; hash[7] = (hash[7] + h) >>> 0;
  }
  return Object.freeze({
    digest: hash.map(part => (`00000000${part.toString(16)}`).slice(-8)).join(''),
    utf8ByteLength: originalByteLength
  });
};

const canonicalScalar = (value: unknown): string => {
  if (typeof value === 'string') return `S${utf8Bytes(value).length}:${value};`;
  if (typeof value === 'boolean') return value ? 'B1;' : 'B0;';
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    const text = Object.is(value, -0) ? '-0' : String(value);
    return `N${text.length}:${text};`;
  }
  if (value === null) return 'Z;';
  throw new Error('Governed source rows may contain only strings, safe integers, booleans and null.');
};

const canonicaliseGovernedSourceRows = (rows: ReadonlyArray<Readonly<IBehaviourCatalogueSourceRow>>): string =>
  `${canonicalScalar(APPROVED_GOVERNED_SOURCE_ROW_CANONICAL_FORMAT)}`
  + `F${APPROVED_GOVERNED_SOURCE_ROW_FIELDS.length};${APPROVED_GOVERNED_SOURCE_ROW_FIELDS.map(canonicalScalar).join('')}`
  + `R${rows.length};${rows.map(row => `O${APPROVED_GOVERNED_SOURCE_ROW_FIELDS.length};`
    + APPROVED_GOVERNED_SOURCE_ROW_FIELDS.map(field => canonicalScalar(row[field])).join('')).join('')}`;

interface IApprovedCatalogueAnchor {
  catalogue: Readonly<IBehaviourFrameworkV2Catalogue>;
  contentSha256: string;
  contentCanonicalUtf8ByteLength: number;
}

const buildApprovedCatalogueAnchor = (): Readonly<IApprovedCatalogueAnchor> => {
  if (APPROVED_BEHAVIOUR_V1_INSTRUCTION_SHA256.toLowerCase() !== APPROVED_INSTRUCTION_SHA256
    || APPROVED_BEHAVIOUR_V1_DECISION_CONTENT_SHA256.toLowerCase() !== APPROVED_DECISION_CONTENT_SHA256
    || APPROVED_BEHAVIOUR_V1_CATALOGUE_BLOCK_SHA256.toLowerCase() !== APPROVED_CATALOGUE_BLOCK_SHA256
    || APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROW_CANONICAL_FORMAT
      !== APPROVED_GOVERNED_SOURCE_ROW_CANONICAL_FORMAT
    || APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256
      !== APPROVED_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256
    || APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH
      !== APPROVED_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH
    || !SHA256_PATTERN.test(APPROVED_GENERATED_ROW_SHA256)
    || !SHA256_PATTERN.test(APPROVED_SOURCE_SHA256)
    || !SHA256_PATTERN.test(APPROVED_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256)) {
    throw new Error('Approved Behaviour v1 authority hashes do not match the frozen decision anchor.');
  }
  const governedFields = snapshotPlainOwnData(
    APPROVED_BEHAVIOUR_V1_GOVERNED_SOURCE_ROW_FIELDS,
    'approvedGovernedSourceFields'
  );
  if (!exactProtectedEqual(governedFields, APPROVED_GOVERNED_SOURCE_ROW_FIELDS)) {
    throw new Error('Approved Behaviour v1 governed field set differs from the frozen canonical contract.');
  }
  const approvedSourceRows = snapshotPlainOwnData(
    APPROVED_BEHAVIOUR_V1_SOURCE_ROWS,
    'approvedGovernedSourceRows'
  ) as ReadonlyArray<Readonly<IBehaviourCatalogueSourceRow>>;
  if (!Array.isArray(approvedSourceRows) || approvedSourceRows.length !== 75) {
    throw new Error('Approved Behaviour v1 canonical content must contain exactly 75 rows.');
  }
  approvedSourceRows.forEach(row => assertRecordKeys(row, APPROVED_GOVERNED_SOURCE_ROW_FIELDS));
  const canonicalIdentity = sha256Hex(canonicaliseGovernedSourceRows(approvedSourceRows));
  if (canonicalIdentity.digest !== APPROVED_GOVERNED_SOURCE_ROWS_CANONICAL_SHA256
    || canonicalIdentity.utf8ByteLength !== APPROVED_GOVERNED_SOURCE_ROWS_CANONICAL_UTF8_BYTE_LENGTH) {
    throw new Error('Approved Behaviour v1 canonical content digest differs from the fixed Sponsor decision anchor.');
  }
  const generated = createBehaviourFrameworkV2Catalogue(approvedSourceRows, {
    catalogueVersion: APPROVED_CATALOGUE_VERSION,
    revision: APPROVED_CATALOGUE_REVISION,
    status: 'Published',
    effectiveFrom: APPROVED_EFFECTIVE_FROM
  });
  const canonical = snapshotPlainOwnData({
    catalogueKey: generated.catalogueKey,
    catalogueVersion: generated.catalogueVersion,
    revision: generated.revision,
    schemaVersion: generated.schemaVersion,
    status: generated.status,
    effectiveFrom: generated.effectiveFrom,
    headlineBehaviours: generated.headlineBehaviours.map(row => ({ ...row })),
    roleLevels: generated.roleLevels.map(row => ({ ...row })),
    ratingScale: generated.ratingScale.slice(),
    selectionGuidance: { ...generated.selectionGuidance },
    rows: generated.rows.map(row => ({
      targetKey: row.targetKey,
      behaviourKey: row.behaviourKey,
      roleLevelCode: row.roleLevelCode,
      focusKey: row.focusKey,
      focusArea: row.focusArea,
      suggestedTarget: row.suggestedTarget,
      suggestedMeasure: row.suggestedMeasure,
      suggestedUnit: row.suggestedUnit,
      suggestedEvidence: row.suggestedEvidence,
      status: row.status,
      sortOrder: row.sortOrder,
      effectiveFrom: row.effectiveFrom,
      ...(row.effectiveTo === undefined ? {} : { effectiveTo: row.effectiveTo })
    }))
  }, 'approvedCatalogueAnchor') as Readonly<IBehaviourFrameworkV2Catalogue>;
  assertCatalogueShape(canonical);
  if (canonical.catalogueKey !== BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY
    || canonical.catalogueVersion !== APPROVED_CATALOGUE_VERSION
    || canonical.revision !== APPROVED_CATALOGUE_REVISION
    || canonical.schemaVersion !== BEHAVIOUR_FRAMEWORK_V2_SCHEMA_VERSION
    || canonical.status !== 'Published'
    || canonical.effectiveFrom !== APPROVED_EFFECTIVE_FROM
    || Object.prototype.hasOwnProperty.call(canonical, 'effectiveTo')
    || !exactProtectedEqual(canonical.headlineBehaviours, APPROVED_HEADLINES)
    || !exactProtectedEqual(canonical.roleLevels, BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS)
    || !exactProtectedEqual(canonical.ratingScale, BEHAVIOUR_FRAMEWORK_V2_RATINGS)
    || !exactProtectedEqual(canonical.selectionGuidance,
      { recommendedMinimum: 3, recommendedMaximum: 5, hardMaximum: null })) {
    throw new Error('Approved Behaviour v1 metadata does not match the frozen decision anchor.');
  }

  const sourceByTarget = new Map(approvedSourceRows.map(row => [row.BehaviourObjectiveKey, row]));
  const catalogueByTarget = new Map(canonical.rows.map(row => [row.targetKey, row]));
  if (approvedSourceRows.length !== 75 || sourceByTarget.size !== 75
    || canonical.rows.length !== 75 || catalogueByTarget.size !== 75) {
    throw new Error('Approved Behaviour v1 must contain exactly 75 unique generated rows.');
  }
  for (let behaviour = 1; behaviour <= 5; behaviour += 1) {
    const behaviourKey = `BHV-0${behaviour}`;
    const headline = APPROVED_HEADLINES[behaviour - 1];
    for (let focus = 1; focus <= 5; focus += 1) {
      const focusKey = `${behaviourKey}-FOCUS-0${focus}`;
      for (let role = 1; role <= 3; role += 1) {
        const roleCode = `L${role}`;
        const targetKey = `${behaviourKey}-${roleCode}-0${focus}`;
        const source = sourceByTarget.get(targetKey);
        const row = catalogueByTarget.get(targetKey);
        const roleIdentity = BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS[role - 1];
        if (!source || !row || !headline || !roleIdentity
          || source.BehaviourObjectiveKey !== targetKey
          || source.BehaviourKey !== behaviourKey
          || source.BehaviourTitle !== headline.title
          || source.CorporateValue !== headline.title
          || source.RoleLevelCode !== roleCode
          || source.RoleLevelName !== roleIdentity.name
          || source.Active !== true
          || source.EffectiveFrom !== APPROVED_EFFECTIVE_FROM
          || source.EffectiveTo !== null
          || row.targetKey !== targetKey
          || row.behaviourKey !== behaviourKey
          || row.focusKey !== focusKey
          || row.roleLevelCode !== roleCode
          || row.focusArea !== source.ObjectiveTitle
          || row.suggestedTarget !== source.ObjectiveDescription
          || row.suggestedMeasure !== source.SuggestedMeasure
          || row.suggestedUnit !== source.SuggestedUnit
          || row.suggestedEvidence !== source.SuggestedEvidence
          || row.status !== 'Published'
          || row.sortOrder !== source.SortOrder
          || row.effectiveFrom !== source.EffectiveFrom
          || Object.prototype.hasOwnProperty.call(row, 'effectiveTo')) {
          throw new Error(`Approved Behaviour v1 tuple or exact source wording differs at ${targetKey}.`);
        }
      }
    }
  }
  return Object.freeze({
    catalogue: canonical,
    contentSha256: canonicalIdentity.digest,
    contentCanonicalUtf8ByteLength: canonicalIdentity.utf8ByteLength
  });
};

const APPROVED_ANCHOR = buildApprovedCatalogueAnchor();
const APPROVED_CATALOGUE_ANCHOR = APPROVED_ANCHOR.catalogue;

const assertPublicationBinding = (
  publication: IApprovedBehaviourCataloguePublicationRecord,
  catalogue: IBehaviourFrameworkV2Catalogue
): void => {
  assertRecordKeys(publication, [
    'sequence', 'catalogueKey', 'catalogueVersion', 'revision', 'schemaVersion', 'sourcePath', 'sourceSha256',
    'contentSha256', 'contentCanonicalUtf8ByteLength', 'rowCount', 'headlineCount', 'roleLevelCount',
    'actorEmail', 'occurredAt', 'result'
  ], ['rollbackFromVersion']);
  const timestamp = typeof publication.occurredAt === 'string' ? Date.parse(publication.occurredAt) : NaN;
  if (!Number.isInteger(publication.sequence) || publication.sequence < 1
    || publication.catalogueKey !== catalogue.catalogueKey
    || publication.catalogueVersion !== catalogue.catalogueVersion
    || publication.revision !== catalogue.revision
    || publication.schemaVersion !== catalogue.schemaVersion
    || publication.rowCount !== catalogue.rows.length
    || publication.headlineCount !== catalogue.headlineBehaviours.length
    || publication.roleLevelCount !== catalogue.roleLevels.length
    || publication.sourcePath !== APPROVED_SOURCE_PATH
    || publication.sourceSha256 !== APPROVED_SOURCE_SHA256
    || publication.contentSha256 !== APPROVED_ANCHOR.contentSha256
    || publication.contentCanonicalUtf8ByteLength !== APPROVED_ANCHOR.contentCanonicalUtf8ByteLength
    || typeof publication.actorEmail !== 'string' || publication.actorEmail !== publication.actorEmail.trim()
    || publication.actorEmail !== publication.actorEmail.toLowerCase()
    || !ACTOR_PATTERN.test(publication.actorEmail)
    || !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== publication.occurredAt
    || publication.result !== 'Published' || publication.rollbackFromVersion !== undefined) {
    throw new Error('Publication evidence does not bind the exact published catalogue and audit state.');
  }
};

const assertExactApprovedCatalogue = (catalogue: IBehaviourFrameworkV2Catalogue): void => {
  if (!exactProtectedEqual(catalogue, APPROVED_CATALOGUE_ANCHOR)) {
    throw new Error('Provisioning requires the exact decision-derived approved Behaviour v1 anchor and all 75 tuples.');
  }
};

const assertSnapshotShape = (snapshot: IBehaviourFrameworkV2TenantSnapshot): void => {
  assertRecordKeys(snapshot, ['bindingKey', 'environment', 'roleLevels', 'rows', 'legacyRows'], [
    'schemaVersion', 'catalogueVersion', 'revision', 'sourceSha256', 'publication'
  ]);
  if (snapshot.environment !== 'LocalSynthetic' || typeof snapshot.bindingKey !== 'string'
    || snapshot.bindingKey !== snapshot.bindingKey.trim() || !snapshot.bindingKey
    || !Array.isArray(snapshot.roleLevels) || !Array.isArray(snapshot.rows) || !Array.isArray(snapshot.legacyRows)) {
    throw new Error('Synthetic snapshot identity or arrays are invalid; the local binding is locked.');
  }
  snapshot.roleLevels.forEach(row => assertRecordKeys(row, ['code', 'name', 'sortOrder']));
  snapshot.rows.forEach(row => assertRecordKeys(row, [
    'targetKey', 'behaviourKey', 'roleLevelCode', 'focusKey', 'focusArea', 'suggestedTarget',
    'suggestedMeasure', 'suggestedUnit', 'suggestedEvidence', 'status', 'sortOrder', 'effectiveFrom'
  ], ['effectiveTo']));
  snapshot.legacyRows.forEach(row => assertRecordKeys(row, [], Object.keys(row)));
};

const isEmptySnapshot = (snapshot: IBehaviourFrameworkV2TenantSnapshot): boolean =>
  snapshot.schemaVersion === undefined && snapshot.catalogueVersion === undefined
  && snapshot.revision === undefined && snapshot.sourceSha256 === undefined && snapshot.publication === undefined
  && snapshot.roleLevels.length === 0 && snapshot.rows.length === 0;

const assertSnapshotState = (snapshot: IBehaviourFrameworkV2TenantSnapshot): void => {
  if (isEmptySnapshot(snapshot)) return;
  const publication = snapshot.publication;
  if (!publication) throw new Error('Synthetic snapshot catalogue state is incomplete.');
  assertRecordKeys(publication, [
    'sequence', 'catalogueKey', 'catalogueVersion', 'revision', 'schemaVersion', 'sourcePath', 'sourceSha256',
    'contentSha256', 'contentCanonicalUtf8ByteLength', 'rowCount', 'headlineCount', 'roleLevelCount',
    'actorEmail', 'occurredAt', 'result'
  ], ['rollbackFromVersion']);
  const timestamp = typeof publication.occurredAt === 'string' ? Date.parse(publication.occurredAt) : NaN;
  if (snapshot.schemaVersion !== BEHAVIOUR_FRAMEWORK_V2_SCHEMA_VERSION
    || snapshot.catalogueVersion !== APPROVED_CATALOGUE_VERSION
    || snapshot.revision !== APPROVED_CATALOGUE_REVISION
    || snapshot.sourceSha256 !== APPROVED_SOURCE_SHA256
    || !exactProtectedEqual(snapshot.roleLevels, APPROVED_CATALOGUE_ANCHOR.roleLevels)
    || !exactProtectedEqual(snapshot.rows, APPROVED_CATALOGUE_ANCHOR.rows)
    || !Number.isInteger(publication.sequence) || publication.sequence < 1
    || publication.catalogueKey !== BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY
    || publication.catalogueVersion !== snapshot.catalogueVersion
    || publication.revision !== snapshot.revision || publication.schemaVersion !== snapshot.schemaVersion
    || publication.sourceSha256 !== snapshot.sourceSha256 || publication.rowCount !== snapshot.rows.length
    || publication.contentSha256 !== APPROVED_ANCHOR.contentSha256
    || publication.contentCanonicalUtf8ByteLength !== APPROVED_ANCHOR.contentCanonicalUtf8ByteLength
    || publication.headlineCount !== 5 || publication.roleLevelCount !== snapshot.roleLevels.length
    || publication.sourcePath !== APPROVED_SOURCE_PATH
    || typeof publication.actorEmail !== 'string' || publication.actorEmail !== publication.actorEmail.trim()
    || publication.actorEmail !== publication.actorEmail.toLowerCase()
    || !ACTOR_PATTERN.test(publication.actorEmail)
    || !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== publication.occurredAt
    || publication.result !== 'Published' || publication.rollbackFromVersion !== undefined) {
    throw new Error('Synthetic snapshot catalogue, content or publication state is foreign or incomplete.');
  }
};

const exactSnapshotMatch = (
  snapshot: IBehaviourFrameworkV2TenantSnapshot
): boolean => snapshot.schemaVersion === APPROVED_CATALOGUE_ANCHOR.schemaVersion
  && snapshot.catalogueVersion === APPROVED_CATALOGUE_ANCHOR.catalogueVersion
  && snapshot.revision === APPROVED_CATALOGUE_ANCHOR.revision
  && snapshot.sourceSha256 === APPROVED_SOURCE_SHA256
  && exactProtectedEqual(snapshot.roleLevels, APPROVED_CATALOGUE_ANCHOR.roleLevels)
  && exactProtectedEqual(snapshot.rows, APPROVED_CATALOGUE_ANCHOR.rows);

const planKeyFor = (
  bindingKey: string,
  catalogue: IBehaviourFrameworkV2Catalogue,
  publication: IApprovedBehaviourCataloguePublicationRecord
): string => [
  bindingKey, catalogue.catalogueKey, catalogue.catalogueVersion, catalogue.revision, catalogue.schemaVersion,
  APPROVED_INSTRUCTION_SHA256, APPROVED_DECISION_CONTENT_SHA256, APPROVED_CATALOGUE_BLOCK_SHA256,
  APPROVED_GENERATED_ROW_SHA256,
  publication.sourcePath, publication.sourceSha256, publication.contentSha256,
  publication.contentCanonicalUtf8ByteLength, publication.rowCount, publication.headlineCount,
  publication.roleLevelCount, publication.actorEmail, publication.occurredAt, publication.result
].join('|');

const assertPlanIntegrity = (plan: IBehaviourFrameworkV2ProvisioningPlan): void => {
  assertRecordKeys(plan, [
    'planKey', 'bindingKey', 'environment', 'executionLock', 'operation', 'catalogue', 'publication',
    'schemas', 'previous', 'expected'
  ]);
  assertCatalogueShape(plan.catalogue);
  assertPublicationBinding(plan.publication, plan.catalogue);
  assertExactApprovedCatalogue(plan.catalogue);
  assertSnapshotShape(plan.previous);
  assertSnapshotShape(plan.expected);
  assertSnapshotState(plan.previous);
  assertSnapshotState(plan.expected);
  const inspection = inspectBehaviourFrameworkV2Catalogue(plan.catalogue);
  const operation = exactSnapshotMatch(plan.previous) ? 'NoChange' : 'Install';
  const expectedSequence = isEmptySnapshot(plan.previous) ? 1 : (plan.previous.publication?.sequence || 0) + 1;
  if (!inspection.valid || plan.catalogue.status !== 'Published'
    || plan.executionLock !== BEHAVIOUR_FRAMEWORK_V2_EXECUTION_LOCK || plan.environment !== 'LocalSynthetic'
    || plan.bindingKey !== plan.previous.bindingKey || plan.bindingKey !== plan.expected.bindingKey
    || plan.planKey !== planKeyFor(plan.bindingKey, plan.catalogue, plan.publication)
    || plan.operation !== operation
    || !exactProtectedEqual(plan.schemas, BEHAVIOUR_FRAMEWORK_V2_SHAREPOINT_SCHEMAS)
    || plan.expected.environment !== 'LocalSynthetic'
    || plan.expected.schemaVersion !== plan.catalogue.schemaVersion
    || plan.expected.catalogueVersion !== plan.catalogue.catalogueVersion
    || plan.expected.revision !== plan.catalogue.revision
    || plan.expected.sourceSha256 !== plan.publication.sourceSha256
    || plan.publication.sequence !== expectedSequence
    || !exactProtectedEqual(plan.expected.roleLevels, plan.catalogue.roleLevels)
    || !exactProtectedEqual(plan.expected.rows, plan.catalogue.rows)
    || !exactProtectedEqual(plan.expected.legacyRows, plan.previous.legacyRows)
    || !exactProtectedEqual(plan.expected.publication, plan.publication)) {
    throw new Error(inspection.issues.join(' ') || 'Generated synthetic plan integrity check failed.');
  }
};

const issuePublicationCapability = (
  authority: IBehaviourFrameworkV2TestPlatformAuthority
): BehaviourFrameworkV2PublicationCapability => {
  const actorEmail = authority.getAuthenticatedEmail().trim().toLowerCase();
  const occurredAtValue = authority.getUtcNow();
  let occurredAt = '';
  try {
    if (Object.getPrototypeOf(occurredAtValue) !== Date.prototype) throw new Error('Invalid clock value.');
    occurredAt = Date.prototype.toISOString.call(occurredAtValue);
  } catch {
    throw new Error('The trusted publication clock must provide a canonical UTC instant.');
  }
  if (!ACTOR_PATTERN.test(actorEmail) || actorEmail !== actorEmail.trim() || actorEmail !== actorEmail.toLowerCase()) {
    throw new Error('The trusted authenticated platform context did not provide a canonical actor email.');
  }
  const capability = Object.freeze(Object.create(null)) as BehaviourFrameworkV2PublicationCapability;
  issuedPublicationCapabilities.set(capability, Object.freeze({ actorEmail, occurredAt }));
  return capability;
};

/** Test-only composition seam. Production capability issuance is deliberately unavailable. */
export const createBehaviourFrameworkV2TestPublicationTrustAdapter = (
  authority: IBehaviourFrameworkV2TestPlatformAuthority
): Readonly<IBehaviourFrameworkV2TestPublicationTrustAdapter> => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Production publication capability issuance is unavailable without a platform-owned authenticated context.');
  }
  return Object.freeze({
    issue: (): BehaviourFrameworkV2PublicationCapability => issuePublicationCapability(authority)
  });
};

const consumePublicationCapability = (
  capability: BehaviourFrameworkV2PublicationCapability
): Readonly<ITrustedPublicationAuthority> => {
  if (!capability || typeof capability !== 'object' || !issuedPublicationCapabilities.has(capability)
    || consumedPublicationCapabilities.has(capability)) {
    throw new Error('Planning requires one unused non-forgeable trusted-adapter publication capability.');
  }
  const authority = issuedPublicationCapabilities.get(capability);
  consumedPublicationCapabilities.add(capability);
  issuedPublicationCapabilities.delete(capability);
  if (!authority) throw new Error('Trusted publication capability authority is unavailable.');
  return authority;
};

export const createEmptyBehaviourFrameworkV2TenantSnapshot = (
  bindingKey: string,
  legacyRows: ReadonlyArray<Readonly<Record<string, unknown>>> = []
): Readonly<IBehaviourFrameworkV2TenantSnapshot> => {
  if (!bindingKey.trim()) throw new Error('An exact synthetic binding key is required.');
  const snapshot = snapshotPlainOwnData({
    bindingKey: bindingKey.trim(), environment: 'LocalSynthetic' as const, roleLevels: [], rows: [], legacyRows
  }, 'emptySnapshot');
  issuedStates.add(snapshot);
  return snapshot;
};

export const planBehaviourFrameworkV2Provisioning = (
  current: IBehaviourFrameworkV2TenantSnapshot,
  capability: BehaviourFrameworkV2PublicationCapability
): Readonly<IBehaviourFrameworkV2ProvisioningPlan> => {
  const authority = consumePublicationCapability(capability);
  if (!current || typeof current !== 'object' || !issuedStates.has(current)) {
    throw new Error('Planning requires the exact module-issued trusted synthetic state.');
  }
  const currentSnapshot = snapshotPlainOwnData(current, 'current');
  assertSnapshotShape(currentSnapshot);
  assertSnapshotState(currentSnapshot);
  if (!isEmptySnapshot(currentSnapshot) && !exactSnapshotMatch(currentSnapshot)) {
    throw new Error('Foreign or unapproved prior catalogue state is not eligible for the fixed v1 package.');
  }
  const sequence = isEmptySnapshot(currentSnapshot) ? 1 : (currentSnapshot.publication?.sequence || 0) + 1;
  const publicationSnapshot = snapshotPlainOwnData({
    sequence,
    catalogueKey: APPROVED_CATALOGUE_ANCHOR.catalogueKey,
    catalogueVersion: APPROVED_CATALOGUE_ANCHOR.catalogueVersion,
    revision: APPROVED_CATALOGUE_ANCHOR.revision,
    schemaVersion: APPROVED_CATALOGUE_ANCHOR.schemaVersion,
    sourcePath: APPROVED_SOURCE_PATH,
    sourceSha256: APPROVED_SOURCE_SHA256,
    contentSha256: APPROVED_ANCHOR.contentSha256,
    contentCanonicalUtf8ByteLength: APPROVED_ANCHOR.contentCanonicalUtf8ByteLength,
    rowCount: APPROVED_CATALOGUE_ANCHOR.rows.length,
    headlineCount: APPROVED_CATALOGUE_ANCHOR.headlineBehaviours.length,
    roleLevelCount: APPROVED_CATALOGUE_ANCHOR.roleLevels.length,
    actorEmail: authority.actorEmail,
    occurredAt: authority.occurredAt,
    result: 'Published' as const
  }, 'trustedPublication');
  assertPublicationBinding(publicationSnapshot, APPROVED_CATALOGUE_ANCHOR);
  const operation = exactSnapshotMatch(currentSnapshot) ? 'NoChange' : 'Install';
  const expected = Object.freeze({
    bindingKey: currentSnapshot.bindingKey,
    environment: 'LocalSynthetic' as const,
    schemaVersion: APPROVED_CATALOGUE_ANCHOR.schemaVersion,
    catalogueVersion: APPROVED_CATALOGUE_ANCHOR.catalogueVersion,
    revision: APPROVED_CATALOGUE_ANCHOR.revision,
    sourceSha256: publicationSnapshot.sourceSha256,
    roleLevels: APPROVED_CATALOGUE_ANCHOR.roleLevels,
    rows: APPROVED_CATALOGUE_ANCHOR.rows,
    legacyRows: currentSnapshot.legacyRows,
    publication: publicationSnapshot
  });
  const plan = Object.freeze({
    planKey: planKeyFor(currentSnapshot.bindingKey, APPROVED_CATALOGUE_ANCHOR, publicationSnapshot),
    bindingKey: currentSnapshot.bindingKey,
    environment: 'LocalSynthetic' as const,
    executionLock: BEHAVIOUR_FRAMEWORK_V2_EXECUTION_LOCK,
    operation,
    catalogue: APPROVED_CATALOGUE_ANCHOR,
    publication: publicationSnapshot,
    schemas: snapshotPlainOwnData(BEHAVIOUR_FRAMEWORK_V2_SHAREPOINT_SCHEMAS, 'schemas'),
    previous: currentSnapshot,
    expected
  });
  assertPlanIntegrity(plan);
  issuedPlans.add(plan);
  issuedStates.add(currentSnapshot);
  issuedStates.add(expected);
  return plan;
};

/** Applies only to a supplied in-memory synthetic snapshot. No SharePoint transport exists here. */
export const applyBehaviourFrameworkV2SyntheticPlan = (
  current: IBehaviourFrameworkV2TenantSnapshot,
  plan: IBehaviourFrameworkV2ProvisioningPlan
): Readonly<IBehaviourFrameworkV2TenantSnapshot> => {
  if (!plan || typeof plan !== 'object' || !issuedPlans.has(plan)) {
    throw new Error('Synthetic execution requires the exact generated plan object.');
  }
  const currentSnapshot = snapshotPlainOwnData(current, 'current');
  const planSnapshot = snapshotPlainOwnData(plan, 'plan');
  assertSnapshotShape(currentSnapshot);
  assertPlanIntegrity(planSnapshot);
  if (!exactProtectedEqual(currentSnapshot, planSnapshot.previous)) {
    throw new Error('Synthetic plan ownership or immutable pre-state does not match.');
  }
  issuedStates.add(planSnapshot.expected);
  return planSnapshot.expected;
};

export const rollbackBehaviourFrameworkV2SyntheticPlan = (
  current: IBehaviourFrameworkV2TenantSnapshot,
  plan: IBehaviourFrameworkV2ProvisioningPlan
): Readonly<IBehaviourFrameworkV2TenantSnapshot> => {
  if (!plan || typeof plan !== 'object' || !issuedPlans.has(plan)) {
    throw new Error('Rollback requires the exact generated plan object.');
  }
  const currentSnapshot = snapshotPlainOwnData(current, 'current');
  const planSnapshot = snapshotPlainOwnData(plan, 'plan');
  assertSnapshotShape(currentSnapshot);
  assertPlanIntegrity(planSnapshot);
  if (!exactProtectedEqual(currentSnapshot, planSnapshot.expected)) {
    throw new Error('Rollback requires the exact applied synthetic plan state.');
  }
  issuedStates.add(planSnapshot.previous);
  return planSnapshot.previous;
};

export const inspectBehaviourFrameworkV2TenantReadback = (
  plan: IBehaviourFrameworkV2ProvisioningPlan,
  readback: IBehaviourFrameworkV2TenantSnapshot
): ReadonlyArray<string> => {
  if (!plan || typeof plan !== 'object' || !issuedPlans.has(plan)) {
    return Object.freeze(['Readback requires the exact generated plan object.']);
  }
  let planSnapshot: Readonly<IBehaviourFrameworkV2ProvisioningPlan>;
  let readbackSnapshot: Readonly<IBehaviourFrameworkV2TenantSnapshot>;
  try {
    planSnapshot = snapshotPlainOwnData(plan, 'readbackPlan');
    assertPlanIntegrity(planSnapshot);
  } catch {
    return Object.freeze(['Readback generated-plan integrity is invalid.']);
  }
  try {
    readbackSnapshot = snapshotPlainOwnData(readback, 'readback');
    assertSnapshotShape(readbackSnapshot);
    assertSnapshotState(readbackSnapshot);
  } catch (error) {
    if (error instanceof Error && error.message.indexOf('accessor') >= 0) throw error;
    return Object.freeze(['Readback protected shape is invalid.']);
  }
  const issues: string[] = [];
  if (readbackSnapshot.environment !== 'LocalSynthetic' || readbackSnapshot.bindingKey !== planSnapshot.bindingKey) issues.push('Readback binding identity differs.');
  if (readbackSnapshot.schemaVersion !== planSnapshot.expected.schemaVersion) issues.push('Readback schema version differs.');
  if (readbackSnapshot.catalogueVersion !== planSnapshot.expected.catalogueVersion
    || readbackSnapshot.revision !== planSnapshot.expected.revision) issues.push('Readback catalogue version differs.');
  if (readbackSnapshot.sourceSha256 !== planSnapshot.expected.sourceSha256) issues.push('Readback source hash differs.');
  if (!exactProtectedEqual(readbackSnapshot.roleLevels, planSnapshot.expected.roleLevels)) issues.push('Readback governed role metadata differs.');
  if (!exactProtectedEqual(readbackSnapshot.rows, planSnapshot.expected.rows)) issues.push('Readback catalogue rows differ.');
  if (!exactProtectedEqual(readbackSnapshot.legacyRows, planSnapshot.expected.legacyRows)) issues.push('Readback changed protected legacy rows.');
  if (!exactProtectedEqual(readbackSnapshot.publication, planSnapshot.expected.publication)) issues.push('Readback publication evidence differs.');
  return Object.freeze(issues);
};

export const mapBehaviourFrameworkV2SharePointRows = (
  plan: IBehaviourFrameworkV2ProvisioningPlan
// eslint-disable-next-line @rushstack/no-new-null -- null is the SharePoint REST clear-value contract.
): ReadonlyArray<Readonly<Record<string, string | number | null>>> => {
  if (!plan || typeof plan !== 'object' || !issuedPlans.has(plan)) {
    throw new Error('SharePoint row mapping requires the exact module-issued plan object.');
  }
  const planSnapshot = snapshotPlainOwnData(plan, 'sharePointPlan');
  assertPlanIntegrity(planSnapshot);
  return Object.freeze(planSnapshot.catalogue.rows.map(row => Object.freeze({
    TargetKey: row.targetKey,
    CatalogueVersion: planSnapshot.catalogue.catalogueVersion,
    ContentSha256: planSnapshot.publication.contentSha256,
    ContentCanonicalUtf8ByteLength: planSnapshot.publication.contentCanonicalUtf8ByteLength,
    BehaviourKey: row.behaviourKey,
    RoleLevelCode: row.roleLevelCode,
    FocusArea: row.focusArea,
    SuggestedTarget: row.suggestedTarget,
    SuggestedMeasure: row.suggestedMeasure,
    SuggestedUnit: row.suggestedUnit,
    SuggestedEvidence: row.suggestedEvidence,
    EffectiveStatus: row.status,
    EffectiveFrom: row.effectiveFrom,
    EffectiveTo: row.effectiveTo || null,
    SortOrder: row.sortOrder
  })));
};
