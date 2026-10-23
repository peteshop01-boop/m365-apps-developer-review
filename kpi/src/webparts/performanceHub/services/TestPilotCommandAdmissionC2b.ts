/* eslint-disable @rushstack/no-new-null -- null is the fail-closed external binding/state representation */
/**
 * A008 C2b repair. Pure tenant-neutral contracts and state transitions only.
 * This module has no connector, HTTP, tenant, deployment or activation capability.
 */

import { isEmployeeV2StableCommandKey } from './EmployeeWorkplanV2PersistencePolicy';
import {
  assessSec006ControlCaseConsumption,
  type ISec006ControlCase,
  type ISec006ControlCaseConsumption
} from './sec006/Sec006ControlCaseStore';

export const C2B_CONTRACT_VERSION = 'kcf.kpi.c2b.foundation.v2' as const;
export const C2B_SCHEMA_REVISION = 'c2b-annual-v2' as const;

export type C2bListPurpose =
  | 'People' | 'EmployeeCommands' | 'ManagerCommands' | 'CommandJournal' | 'CommandEffects'
  | 'CommandReceipts' | 'Workplans' | 'WorkplanItems' | 'Audit';

export type C2bPermissionCapability =
  | 'PrivateProcessorOnly' | 'CommandSubmitterCreateOnly'
  | 'EmployeeContainerInheritance' | 'ProcessorOwnedReceiptActorRead';

export interface C2bListBinding {
  purpose: C2bListPurpose;
  listId: string | null;
  schemaRevision: string | null;
}
export interface C2bBindingConfiguration {
  contractVersion: typeof C2B_CONTRACT_VERSION;
  enabled: boolean;
  environmentKind: 'NonProduction';
  environmentId: string | null;
  siteUrl: string | null;
  siteCollectionId: string | null;
  webId: string | null;
  connectionReference: string | null;
  lists: readonly C2bListBinding[];
}
export interface C2bObservedListCapability extends C2bListBinding {
  indexedFields: string[];
  uniqueFields: string[];
  versioningEnabled: boolean;
  foldersEnabled: boolean;
  permissionCapability: C2bPermissionCapability;
}
export interface C2bObservedComposition {
  environmentKind: 'NonProduction' | 'Production';
  environmentId: string | null;
  siteUrl: string | null;
  siteCollectionId: string | null;
  webId: string | null;
  connectionReference: string | null;
  lists: C2bObservedListCapability[];
}
export interface C2bListCapabilityRequirement {
  purpose: C2bListPurpose;
  indexedFields: readonly string[];
  uniqueFields: readonly string[];
  versioningEnabled: true;
  foldersEnabled: boolean;
  permissionCapability: C2bPermissionCapability;
}

export const C2B_LIST_CAPABILITY_REQUIREMENTS: readonly C2bListCapabilityRequirement[] = Object.freeze([
  { purpose: 'People', indexedFields: ['PersonKey', 'Email', 'ManagerPersonKey', 'Active'], uniqueFields: ['PersonKey', 'Email'], versioningEnabled: true, foldersEnabled: false, permissionCapability: 'PrivateProcessorOnly' },
  { purpose: 'EmployeeCommands', indexedFields: ['CommandKey', 'PersonKey', 'Created'], uniqueFields: ['CommandKey'], versioningEnabled: true, foldersEnabled: false, permissionCapability: 'CommandSubmitterCreateOnly' },
  { purpose: 'ManagerCommands', indexedFields: ['CommandKey', 'PersonKey', 'Created'], uniqueFields: ['CommandKey'], versioningEnabled: true, foldersEnabled: false, permissionCapability: 'CommandSubmitterCreateOnly' },
  { purpose: 'CommandJournal', indexedFields: ['CommandKey', 'State', 'LeaseExpiresAt'], uniqueFields: ['CommandKey'], versioningEnabled: true, foldersEnabled: false, permissionCapability: 'PrivateProcessorOnly' },
  { purpose: 'CommandEffects', indexedFields: ['EffectKey', 'CommandKey', 'Sequence', 'Disposition'], uniqueFields: ['EffectKey'], versioningEnabled: true, foldersEnabled: false, permissionCapability: 'PrivateProcessorOnly' },
  { purpose: 'CommandReceipts', indexedFields: ['ReceiptKey', 'CommandKey', 'PersonKey'], uniqueFields: ['ReceiptKey', 'CommandKey'], versioningEnabled: true, foldersEnabled: false, permissionCapability: 'ProcessorOwnedReceiptActorRead' },
  { purpose: 'Workplans', indexedFields: ['WorkplanKey', 'PersonKey', 'PerformanceYear'], uniqueFields: ['WorkplanKey'], versioningEnabled: true, foldersEnabled: true, permissionCapability: 'EmployeeContainerInheritance' },
  { purpose: 'WorkplanItems', indexedFields: ['WorkplanItemKey', 'WorkplanItemNaturalKey', 'WorkplanKey'], uniqueFields: ['WorkplanItemKey', 'WorkplanItemNaturalKey'], versioningEnabled: true, foldersEnabled: true, permissionCapability: 'EmployeeContainerInheritance' },
  { purpose: 'Audit', indexedFields: ['AuditKey', 'SubjectKey', 'EventAt'], uniqueFields: ['AuditKey'], versioningEnabled: true, foldersEnabled: false, permissionCapability: 'PrivateProcessorOnly' }
]);

export const C2B_DISABLED_BINDINGS: Readonly<C2bBindingConfiguration> = Object.freeze({
  contractVersion: C2B_CONTRACT_VERSION, enabled: false, environmentKind: 'NonProduction',
  environmentId: null, siteUrl: null, siteCollectionId: null, webId: null, connectionReference: null,
  lists: Object.freeze(C2B_LIST_CAPABILITY_REQUIREMENTS.map(requirement => Object.freeze({
    purpose: requirement.purpose, listId: null, schemaRevision: null
  })))
});

export type C2bPreflightResult = {
  ready: true; code: 'C2B_PREFLIGHT_READY'; configuration: C2bBindingConfiguration; observed: C2bObservedComposition;
} | {
  ready: false;
  code: 'C2B_DISABLED' | 'C2B_UNBOUND' | 'C2B_BINDING_MISMATCH' | 'C2B_SCHEMA_MISMATCH' | 'C2B_CAPABILITY_MISMATCH';
  reasons: string[];
};

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const exactKeys = (value: object, keys: readonly string[]): boolean => {
  const current = Object.keys(value);
  return current.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
};
const normalGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const normalSiteUrl = (value: string): string | null => {
  if (!nonBlank(value)) return null;
  let parsed: URL;
  try { parsed = new URL(value.trim()); } catch { return null; }
  if (parsed.protocol.toLowerCase() !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash)
    return null;
  const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
  return `https://${parsed.host.toLowerCase()}${path}`;
};
const sameSet = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && new Set(left).size === left.length
  && new Set(right).size === right.length && left.every(value => right.includes(value));
const fail = (message: string): never => { throw new Error(message); };
const parseTime = (value: string): number => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return fail('C2b transition rejected: invalid timestamp.');
  return parsed;
};

function canonicalValue(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return fail('C2b canonical representation rejected a non-finite number.');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map(item => canonicalValue(item));
  if (value && typeof value === 'object' && Object.prototype.toString.call(value) === '[object Object]') {
    const result: Record<string, unknown> = {};
    Object.keys(value as Record<string, unknown>).sort().forEach(key => {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) return fail('C2b canonical representation rejected undefined data.');
      result[key] = canonicalValue(child);
    });
    return result;
  }
  return fail('C2b canonical representation accepts JSON values only.');
}
export const canonicaliseC2b = (value: unknown): string => JSON.stringify(canonicalValue(value));
export const cloneC2b = <T>(value: T): T => JSON.parse(canonicaliseC2b(value)) as T;

function utf8(value: string): number[] {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + low - 0xdc00;
        index += 1;
      }
    }
    if (code <= 0x7f) bytes.push(code);
    else if (code <= 0x7ff) bytes.push(0xc0 | code >>> 6, 0x80 | code & 0x3f);
    else if (code <= 0xffff) bytes.push(0xe0 | code >>> 12, 0x80 | code >>> 6 & 0x3f, 0x80 | code & 0x3f);
    else bytes.push(0xf0 | code >>> 18, 0x80 | code >>> 12 & 0x3f, 0x80 | code >>> 6 & 0x3f, 0x80 | code & 0x3f);
  }
  return bytes;
}
const rotateRight = (value: number, count: number): number => value >>> count | value << 32 - count;
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
function sha256Text(value: string): string {
  const bytes = utf8(value);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push(high >>> shift & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push(low >>> shift & 0xff);
  const state = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const start = offset + i * 4;
      words[i] = (bytes[start] << 24 | bytes[start + 1] << 16 | bytes[start + 2] << 8 | bytes[start + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotateRight(words[i - 15], 7) ^ rotateRight(words[i - 15], 18) ^ words[i - 15] >>> 3;
      const s1 = rotateRight(words[i - 2], 17) ^ rotateRight(words[i - 2], 19) ^ words[i - 2] >>> 10;
      words[i] = (words[i - 16] + s0 + words[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = e & f ^ ~e & g;
      const temp1 = (h + s1 + choose + SHA256_K[i] + words[i]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = a & b ^ a & c ^ b & c;
      const temp2 = (s0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0; state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0; state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0; state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0; state[7] = (state[7] + h) >>> 0;
  }
  return state.map(word => word.toString(16).padStart(8, '0')).join('').toUpperCase();
}
export const hashC2bCanonical = (value: unknown): string => sha256Text(canonicaliseC2b(value));
export const c2bUtf8ByteLength = (value: string): number => utf8(value).length;
/** Hash exact UTF-8 text when a reviewed source contract fixes JSON property and row order. */
export const hashC2bUtf8Text = (value: string): string => sha256Text(value);

export function preflightC2bComposition(configuration: C2bBindingConfiguration,
  observed?: C2bObservedComposition): C2bPreflightResult {
  if (configuration.contractVersion !== C2B_CONTRACT_VERSION || !configuration.enabled)
    return { ready: false, code: 'C2B_DISABLED', reasons: ['The C2b composition is disabled.'] };
  const configuredSiteUrl = normalSiteUrl(configuration.siteUrl || '');
  const configuredSiteCollectionId = normalGuid(configuration.siteCollectionId || '');
  const configuredWebId = normalGuid(configuration.webId || '');
  const missing = [configuration.environmentId, configuration.siteUrl, configuration.siteCollectionId,
    configuration.webId, configuration.connectionReference]
    .some(value => !nonBlank(value));
  const purposes = configuration.lists.map(list => list.purpose);
  const configuredListIds = configuration.lists.map(list => normalGuid(list.listId || ''));
  if (missing || !configuredSiteUrl || !GUID.test(configuredSiteCollectionId) || !GUID.test(configuredWebId)
    || configuredSiteCollectionId === configuredWebId
    || configuration.lists.length !== C2B_LIST_CAPABILITY_REQUIREMENTS.length
    || new Set(purposes).size !== purposes.length || new Set(configuredListIds).size !== configuredListIds.length
    || C2B_LIST_CAPABILITY_REQUIREMENTS.some(requirement => !purposes.includes(requirement.purpose))
    || configuration.lists.some(list => !nonBlank(list.listId) || !GUID.test(normalGuid(list.listId!))
      || list.schemaRevision !== C2B_SCHEMA_REVISION)) {
    return { ready: false, code: 'C2B_UNBOUND', reasons: ['Every non-production environment, site URL, site-collection GUID, web GUID, connection reference, list GUID and schema revision must be configured.'] };
  }
  if (!observed || observed.environmentKind !== 'NonProduction')
    return { ready: false, code: 'C2B_UNBOUND', reasons: ['Independent non-production composition observations are required.'] };
  const observedSiteUrl = normalSiteUrl(observed.siteUrl || '');
  const observedSiteCollectionId = normalGuid(observed.siteCollectionId || '');
  const observedWebId = normalGuid(observed.webId || '');
  if (!observedSiteUrl || !GUID.test(observedSiteCollectionId) || !GUID.test(observedWebId)
    || observedSiteCollectionId === observedWebId) {
    return { ready: false, code: 'C2B_UNBOUND', reasons: ['Independent site URL, site-collection GUID and web GUID observations are required.'] };
  }
  if (observed.environmentId !== configuration.environmentId || observedSiteUrl !== configuredSiteUrl
    || observedSiteCollectionId !== configuredSiteCollectionId || observedWebId !== configuredWebId
    || observed.connectionReference !== configuration.connectionReference) {
    return { ready: false, code: 'C2B_BINDING_MISMATCH', reasons: ['Observed environment, site URL, site-collection GUID, web GUID or connection reference does not match configuration.'] };
  }
  const schemaReasons: string[] = [];
  const capabilityReasons: string[] = [];
  for (const requirement of C2B_LIST_CAPABILITY_REQUIREMENTS) {
    const configured = configuration.lists.find(list => list.purpose === requirement.purpose)!;
    const current = observed.lists.filter(list => list.purpose === requirement.purpose);
    if (current.length !== 1 || normalGuid(current[0].listId || '') !== normalGuid(configured.listId || '')) {
      schemaReasons.push(`${requirement.purpose}: list identity is missing, duplicated or mismatched.`);
      continue;
    }
    if (current[0].schemaRevision !== configured.schemaRevision) schemaReasons.push(`${requirement.purpose}: schema revision does not match.`);
    if (!sameSet(current[0].indexedFields, requirement.indexedFields)
      || !sameSet(current[0].uniqueFields, requirement.uniqueFields)
      || current[0].versioningEnabled !== requirement.versioningEnabled
      || current[0].foldersEnabled !== requirement.foldersEnabled
      || current[0].permissionCapability !== requirement.permissionCapability) {
      capabilityReasons.push(`${requirement.purpose}: indexes, uniqueness, versioning, employee-container inheritance or permission capability does not match.`);
    }
  }
  if (schemaReasons.length) return { ready: false, code: 'C2B_SCHEMA_MISMATCH', reasons: schemaReasons };
  if (capabilityReasons.length) return { ready: false, code: 'C2B_CAPABILITY_MISMATCH', reasons: capabilityReasons };
  return { ready: true, code: 'C2B_PREFLIGHT_READY', configuration: cloneC2b(configuration), observed: cloneC2b(observed) };
}

export const C2B_ANNUAL_COMMAND_ALLOW_LIST = Object.freeze([
  'CreateWorkplanDraft', 'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2', 'UpsertPersonalItemV2',
  'UpsertBehaviourCommitmentV2', 'SetCoreWeightingV2', 'SubmitWorkplan', 'RequestWorkplanChanges',
  'ApproveAndLockWorkplan', 'CreateWorkplanAmendmentV2'
] as const);
export type C2bCommandType = typeof C2B_ANNUAL_COMMAND_ALLOW_LIST[number];
export const C2B_IMPLEMENTED_ANNUAL_PLANNERS = Object.freeze([
  'CreateWorkplanDraft', 'UpdateWorkplanDraftV2', 'UpsertCoreContributionV2', 'UpsertPersonalItemV2',
  'UpsertBehaviourCommitmentV2', 'SetCoreWeightingV2', 'SubmitWorkplan', 'RequestWorkplanChanges', 'ApproveAndLockWorkplan',
  'CreateWorkplanAmendmentV2'
] as const);
export type C2bImplementedCommandType = typeof C2B_IMPLEMENTED_ANNUAL_PLANNERS[number];
export const C2B_DEFERRED_ANNUAL_HANDLERS = Object.freeze([] as const);

export type C2bEffectKind = 'ControlCaseConsume' | 'Claim' | 'CanonicalUpsert' | 'Grant' | 'Revoke' | 'Finalise' | 'AuditAppend'
  | 'StableRead' | 'ReceiptCreate' | 'ReceiptGrant';
export type C2bEffectTarget = C2bListPurpose | 'AuthoritativeControlCase';
export type C2bEffectDisposition = 'Planned' | 'Issued' | 'Confirmed' | 'Unknown' | 'Held';
export interface C2bPrincipalGrant {
  principalKey: string;
  permission: 'Read' | 'FullControl';
  source: 'Processor' | 'Employee' | 'Manager' | 'Admin';
}
export interface C2bAclImage {
  containerKey: string;
  breaksInheritanceAtContainer: true;
  canonicalChildrenInherit: true;
  allowedPrincipals: readonly C2bPrincipalGrant[];
  revokedPrincipalKeys: readonly string[];
}
export type C2bSecuredListPurpose = 'Workplans' | 'WorkplanItems';
export interface C2bListAclImage {
  listPurpose: C2bSecuredListPurpose;
  acl: C2bAclImage;
}
export interface C2bCanonicalEntityImage { naturalKey: string; fields: Readonly<Record<string, unknown>>; }
export interface C2bIntendedImage {
  header: C2bCanonicalEntityImage;
  items: readonly C2bCanonicalEntityImage[];
  acls: readonly C2bListAclImage[];
}
export interface C2bEffectPlan {
  sequence: number;
  effectKey: string;
  kind: C2bEffectKind;
  target: C2bEffectTarget;
  naturalKey: string;
  expectedETag: string | null;
  expectedETagFromEffectKey: string | null;
  expectedRowVersionToken: number | null;
  beforeFields: Readonly<Record<string, unknown>> | null;
  beforeSha256: string;
  desiredFields: Readonly<Record<string, unknown>>;
  desiredSha256: string;
  effectSha256: string;
}
export interface C2bCommandPlan {
  contractVersion: typeof C2B_CONTRACT_VERSION;
  commandKey: string;
  commandType: C2bImplementedCommandType;
  personKey: string;
  actorPersonKey: string;
  effectiveRole: 'Employee' | 'Manager' | 'SystemAdmin';
  subjectKey: string;
  performanceYear: number;
  payloadCanonical: string;
  payloadSha256: string;
  intendedImage: C2bIntendedImage;
  intendedImageSha256: string;
  effects: readonly C2bEffectPlan[];
  planSha256: string;
}
export interface C2bEffectConfirmation {
  providerReference: string;
  naturalKey: string;
  requestETag: string | null;
  observedETag: string | null;
  observedRowVersionToken: number | null;
  readback: Readonly<Record<string, unknown>>;
}
export interface C2bCommandEffect extends C2bEffectPlan {
  disposition: C2bEffectDisposition;
  confirmation: C2bEffectConfirmation | null;
  confirmationSha256: string | null;
}
export interface C2bCanonicalEntityReadback extends C2bCanonicalEntityImage { etag: string; rowVersionToken: number; }
export interface C2bCanonicalObservation {
  header: C2bCanonicalEntityReadback;
  items: C2bCanonicalEntityReadback[];
  acls: C2bListAclImage[];
  pagination: { complete: boolean; pageCount: number; totalCount: number; nextLink: null; affectedNaturalKeys: string[] };
  auditKeys: string[];
  effectEvidenceSha256: string[];
  processorEpoch: number;
}
export interface C2bStableReadProof { first: C2bCanonicalObservation; second: C2bCanonicalObservation; }
export interface C2bConfirmedStableRead extends C2bStableReadProof { readbackSha256: string; }
export interface C2bReceiptActorAccess {
  receiptKey: string;
  breaksInheritance: true;
  allowedPrincipals: readonly C2bPrincipalGrant[];
  revokedPrincipalKeys: readonly string[];
}
export interface C2bTerminalReceipt {
  receiptKey: string;
  commandKey: string;
  outcome: 'Accepted' | 'Duplicate';
  planSha256: string;
  payloadSha256: string;
  canonicalSha256: string;
  resultKeys: string[];
  auditKeys: string[];
  actorAccess: C2bReceiptActorAccess;
  processorReference: string;
  completedAt: string;
}
export interface C2bOutcomeAudit {
  auditKey: string;
  commandKey: string;
  outcome: 'Accepted' | 'Rejected' | 'Collision' | 'Held' | 'Recovery';
  payloadSha256: string;
  planSha256: string | null;
  effectKey: string | null;
  safeCode: string;
  safeReason: string;
  success: boolean;
  recordedAt: string;
  evidenceSha256: string;
}
export interface C2bFailureReceipt {
  receiptKey: string;
  commandKey: string;
  outcome: 'Rejected';
  payloadSha256: string;
  validationCode: string;
  safeMessage: string;
  completedAt: string;
  auditKey: string;
}
export interface C2bPostFinaliseHoldProof {
  providerReference: string;
  naturalKey: string;
  requestETag: string;
  observedETag: string;
  observedRowVersionToken: number;
  processorEpoch: number;
  beforeFields: Readonly<Record<string, unknown>>;
  readback: Readonly<Record<string, unknown>>;
}
export interface C2bRecoveryHoldEvidence {
  effectKey: string;
  failureOutcome: 'DefinitiveFailure' | 'Unknown';
  owner: string;
  leaseEpoch: number;
  safeCode: string;
  safeReason: string;
  proof: C2bPostFinaliseHoldProof;
  evidenceSha256: string;
}
export interface C2bCommandJournal {
  journalVersion: number;
  plan: C2bCommandPlan;
  state: 'Planned' | 'Leased' | 'Claimed' | 'Applying' | 'Finalising' | 'Ready' | 'Held' | 'Terminal';
  leaseOwner: string | null;
  leaseEpoch: number;
  leaseExpiresAt: string | null;
  effects: C2bCommandEffect[];
  stableRead: C2bConfirmedStableRead | null;
  receipt: C2bTerminalReceipt | null;
  recoveryHold: C2bRecoveryHoldEvidence | null;
  outcomeAudits: C2bOutcomeAudit[];
}
export type C2bAdmissionResult =
  | { status: 'Created'; journal: C2bCommandJournal }
  | { status: 'Replay'; journal: C2bCommandJournal }
  | { status: 'Collision'; journal: C2bCommandJournal; audit: C2bOutcomeAudit; receipt: C2bFailureReceipt };

function normaliseAcl(value: C2bAclImage): C2bAclImage {
  if (!nonBlank(value.containerKey) || value.breaksInheritanceAtContainer !== true || value.canonicalChildrenInherit !== true)
    return fail('C2b ACL rejected: employee-container inheritance is incomplete.');
  const principals = value.allowedPrincipals.map(principal => {
    if (!nonBlank(principal.principalKey) || !['Read', 'FullControl'].includes(principal.permission)
      || !['Processor', 'Employee', 'Manager', 'Admin'].includes(principal.source))
      return fail('C2b ACL rejected: an allowed principal is invalid.');
    return cloneC2b(principal);
  }).sort((left, right) => left.principalKey.localeCompare(right.principalKey));
  const principalKeys = principals.map(principal => principal.principalKey);
  const revoked = [...value.revokedPrincipalKeys].sort();
  if (new Set(principalKeys).size !== principalKeys.length || new Set(revoked).size !== revoked.length
    || revoked.some(key => !nonBlank(key) || principalKeys.includes(key)))
    return fail('C2b ACL rejected: allowed and revoked principals must be exact, unique and disjoint.');
  return { containerKey: value.containerKey, breaksInheritanceAtContainer: true, canonicalChildrenInherit: true,
    allowedPrincipals: principals, revokedPrincipalKeys: revoked };
}
export function normaliseC2bIntendedImage(value: C2bIntendedImage): C2bIntendedImage {
  if (!nonBlank(value.header.naturalKey) || !value.header.fields || Array.isArray(value.header.fields))
    return fail('C2b intended image rejected: header is incomplete.');
  const items = value.items.map(item => {
    if (!nonBlank(item.naturalKey) || !item.fields || Array.isArray(item.fields))
      return fail('C2b intended image rejected: an item is incomplete.');
    return cloneC2b(item);
  }).sort((left, right) => left.naturalKey.localeCompare(right.naturalKey));
  if (new Set(items.map(item => item.naturalKey)).size !== items.length)
    return fail('C2b intended image rejected: affected item keys are duplicated.');
  if (!Array.isArray(value.acls) || value.acls.length < 1)
    return fail('C2b intended image rejected: per-list ACL evidence is missing.');
  const acls = value.acls.map(valueAcl => {
    if (!['Workplans', 'WorkplanItems'].includes(valueAcl.listPurpose))
      return fail('C2b intended image rejected: an ACL list purpose is invalid.');
    return { listPurpose: valueAcl.listPurpose, acl: normaliseAcl(valueAcl.acl) };
  }).sort((left, right) => left.listPurpose.localeCompare(right.listPurpose));
  if (new Set(acls.map(valueAcl => valueAcl.listPurpose)).size !== acls.length)
    return fail('C2b intended image rejected: per-list ACL evidence is duplicated.');
  return { header: cloneC2b(value.header), items, acls };
}
export function createC2bEffectPlan(input: Omit<C2bEffectPlan, 'beforeSha256' | 'desiredSha256' | 'effectSha256'>): C2bEffectPlan {
  const base = cloneC2b(input);
  const beforeSha256 = hashC2bCanonical(base.beforeFields);
  const desiredSha256 = hashC2bCanonical(base.desiredFields);
  const effectSha256 = hashC2bCanonical({ ...base, beforeSha256, desiredSha256 });
  return { ...base, beforeSha256, desiredSha256, effectSha256 };
}
export function createC2bCommandPlan(input: {
  commandKey: string; commandType: C2bImplementedCommandType; personKey: string; subjectKey: string;
  actorPersonKey?: string; effectiveRole?: 'Employee' | 'Manager' | 'SystemAdmin';
  performanceYear: number; payload: unknown; intendedImage: C2bIntendedImage; effects: readonly C2bEffectPlan[];
}): C2bCommandPlan {
  const payloadCanonical = canonicaliseC2b(input.payload);
  const intendedImage = normaliseC2bIntendedImage(input.intendedImage);
  const withoutHash: Omit<C2bCommandPlan, 'planSha256'> = {
    contractVersion: C2B_CONTRACT_VERSION, commandKey: input.commandKey, commandType: input.commandType,
    personKey: input.personKey, actorPersonKey: input.actorPersonKey || input.personKey,
    effectiveRole: input.effectiveRole || 'Employee', subjectKey: input.subjectKey, performanceYear: input.performanceYear,
    payloadCanonical, payloadSha256: sha256Text(payloadCanonical), intendedImage,
    intendedImageSha256: hashC2bCanonical(intendedImage), effects: input.effects.map(effect => cloneC2b(effect))
  };
  return { ...withoutHash, planSha256: hashC2bCanonical(withoutHash) };
}
function effectHashInput(effect: C2bEffectPlan): unknown {
  const withoutEffectHash = { ...effect } as Partial<C2bEffectPlan>;
  delete withoutEffectHash.effectSha256;
  return withoutEffectHash;
}

const CONTROL_CASE_CONSUMPTION_KEYS = [
  'operation', 'controlCaseKey', 'controlReference', 'authorisedAction', 'subjectKey', 'workplanKey',
  'workplanVersion', 'expectedETag', 'expectedRowVersionToken', 'expectedStorageETag',
  'expectedStorageRowVersionToken', 'trustedUtc', 'consumedAtUtc', 'consumedCommandKey',
  'consumedSourceListId', 'consumedSourceItemId', 'consumedSourceItemVersion'
] as const;

function controlCaseConsumption(effect: C2bEffectPlan): ISec006ControlCaseConsumption {
  const desired = effect.desiredFields as Record<string, unknown>;
  const keys = Object.keys(desired);
  if (keys.length !== CONTROL_CASE_CONSUMPTION_KEYS.length
    || CONTROL_CASE_CONSUMPTION_KEYS.some(key => !Object.prototype.hasOwnProperty.call(desired, key))
    || desired.operation !== 'CompareAndSwapConsume') {
    return fail('C2b plan rejected: authoritative CONTROL-case consumption is not exact and immutable.');
  }
  const consumption = { ...desired };
  delete consumption.operation;
  return consumption as unknown as ISec006ControlCaseConsumption;
}

export function assertValidC2bPlan(plan: C2bCommandPlan): void {
  const planKeys = ['contractVersion', 'commandKey', 'commandType', 'personKey', 'actorPersonKey', 'effectiveRole',
    'subjectKey', 'performanceYear', 'payloadCanonical', 'payloadSha256', 'intendedImage', 'intendedImageSha256',
    'effects', 'planSha256'];
  const effectKeys = ['sequence', 'effectKey', 'kind', 'target', 'naturalKey', 'expectedETag',
    'expectedETagFromEffectKey', 'expectedRowVersionToken', 'beforeFields', 'beforeSha256', 'desiredFields',
    'desiredSha256', 'effectSha256'];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !exactKeys(plan, planKeys)
    || !Array.isArray(plan.effects) || plan.effects.some(effect => !effect || typeof effect !== 'object'
      || Array.isArray(effect) || !exactKeys(effect, effectKeys)))
    return fail('C2b plan rejected: exact immutable plan/effect shape is required.');
  if (plan.contractVersion !== C2B_CONTRACT_VERSION || !isEmployeeV2StableCommandKey(plan.commandKey) || !nonBlank(plan.personKey)
    || !nonBlank(plan.actorPersonKey) || !['Employee', 'Manager', 'SystemAdmin'].includes(plan.effectiveRole)
    || !nonBlank(plan.subjectKey) || !Number.isInteger(plan.performanceYear) || plan.performanceYear < 2000
    || !C2B_IMPLEMENTED_ANNUAL_PLANNERS.includes(plan.commandType)
    || !SHA256.test(plan.payloadSha256) || !SHA256.test(plan.intendedImageSha256) || !SHA256.test(plan.planSha256)
    || plan.effects.length < 8) return fail('C2b plan rejected: incomplete or invalid immutable identity.');
  const expectedRole: C2bCommandPlan['effectiveRole'] = plan.commandType === 'RequestWorkplanChanges'
    || plan.commandType === 'ApproveAndLockWorkplan' ? 'Manager'
    : plan.commandType === 'CreateWorkplanAmendmentV2' ? 'SystemAdmin' : 'Employee';
  if (plan.effectiveRole !== expectedRole || expectedRole === 'Employee' && plan.actorPersonKey !== plan.personKey
    || expectedRole !== 'Employee' && plan.actorPersonKey === plan.personKey)
    return fail('C2b plan rejected: command type is not bound to the exact processor-derived actor role.');
  let parsedPayload: unknown;
  try { parsedPayload = JSON.parse(plan.payloadCanonical) as unknown; }
  catch { return fail('C2b plan rejected: payload canonical form is invalid.'); }
  if (canonicaliseC2b(parsedPayload) !== plan.payloadCanonical || sha256Text(plan.payloadCanonical) !== plan.payloadSha256
    || hashC2bCanonical(normaliseC2bIntendedImage(plan.intendedImage)) !== plan.intendedImageSha256)
    return fail('C2b plan rejected: payload or intended-image hash does not reconcile.');
  const keys = new Set<string>();
  plan.effects.forEach((effect, index) => {
    if (effect.sequence !== index + 1 || !nonBlank(effect.effectKey) || keys.has(effect.effectKey)
      || !nonBlank(effect.naturalKey) || effect.desiredFields === null || Array.isArray(effect.desiredFields)
      || typeof effect.desiredFields !== 'object') return fail('C2b plan rejected: effects must be unique, immutable and strictly ordered.');
    keys.add(effect.effectKey);
    if ((effect.expectedRowVersionToken !== null && (!Number.isSafeInteger(effect.expectedRowVersionToken) || effect.expectedRowVersionToken < 0))
      || (effect.expectedETag !== null && (!nonBlank(effect.expectedETag) || effect.expectedETag === '*')))
      return fail('C2b plan rejected: invalid ETag/CAS expectation.');
    if (effect.expectedETag !== null && effect.expectedETagFromEffectKey !== null)
      return fail('C2b plan rejected: direct and effect-derived ETag expectations are mutually exclusive.');
    if ((effect.desiredFields as { operation?: unknown }).operation === 'Delete')
      return fail('C2b plan rejected: canonical deletion is prohibited.');
    if (effect.beforeSha256 !== hashC2bCanonical(effect.beforeFields)
      || effect.desiredSha256 !== hashC2bCanonical(effect.desiredFields)
      || effect.effectSha256 !== hashC2bCanonical(effectHashInput(effect)))
      return fail('C2b plan rejected: an internally computed effect hash is mismatched or replayed.');
  });
  const one = (kind: C2bEffectKind): C2bEffectPlan => {
    const matches = plan.effects.filter(effect => effect.kind === kind);
    if (matches.length !== 1) return fail(`C2b plan rejected: exactly one ${kind} effect is required.`);
    return matches[0];
  };
  const claim = one('Claim'); const finalise = one('Finalise');
  const stable = one('StableRead'); const receiptCreate = one('ReceiptCreate'); const receiptGrant = one('ReceiptGrant');
  const controlCaseEffects = plan.effects.filter(effect => effect.kind === 'ControlCaseConsume');
  const grants = plan.effects.filter(effect => effect.kind === 'Grant');
  const revokes = plan.effects.filter(effect => effect.kind === 'Revoke');
  const affectedSecuredLists: C2bSecuredListPurpose[] = ['Workplans'];
  if (plan.effects.some(effect => effect.kind === 'CanonicalUpsert' && effect.target === 'WorkplanItems'))
    affectedSecuredLists.push('WorkplanItems');
  const intendedAclLists = plan.intendedImage.acls.map(valueAcl => valueAcl.listPurpose);
  const kinds = plan.effects.map(effect => effect.kind);
  if (kinds[0] !== (plan.commandType === 'CreateWorkplanAmendmentV2' ? 'ControlCaseConsume' : 'Claim')
    || plan.commandType === 'CreateWorkplanAmendmentV2' && claim.sequence !== 2
    || !kinds.includes('Grant') || receiptGrant.sequence !== plan.effects.length
    || receiptCreate.sequence !== receiptGrant.sequence - 1 || stable.sequence >= receiptCreate.sequence
    || finalise.sequence >= stable.sequence || grants.length !== affectedSecuredLists.length
    || revokes.length !== affectedSecuredLists.length || !sameSet(intendedAclLists, affectedSecuredLists)
    || !sameSet(grants.map(effect => effect.target), affectedSecuredLists)
    || !sameSet(revokes.map(effect => effect.target), affectedSecuredLists)
    || Math.max(...grants.map(effect => effect.sequence)) >= Math.min(...revokes.map(effect => effect.sequence))
    || revokes.some(effect => effect.sequence >= finalise.sequence)
    || plan.effects.filter(effect => effect.kind === 'AuditAppend').length < 1
    || plan.effects.filter(effect => effect.kind === 'AuditAppend').some(effect => effect.sequence >= stable.sequence))
    return fail('C2b plan rejected: Claim, grant/revoke, Finalise, stable proof and receipt-last ordering is incomplete.');
  if (plan.commandType === 'CreateWorkplanAmendmentV2') {
    if (controlCaseEffects.length !== 1) {
      return fail('C2b plan rejected: amendment requires one authoritative CONTROL-case consumption.');
    }
    const controlCaseEffect = controlCaseEffects[0];
    const observedCase = controlCaseEffect.beforeFields as unknown as ISec006ControlCase | null;
    const consumption = controlCaseConsumption(controlCaseEffect);
    const amendmentPayload = parsedPayload as { controlReference?: unknown };
    if (!observedCase || controlCaseEffect.target !== 'AuthoritativeControlCase'
      || controlCaseEffect.naturalKey !== observedCase.controlCaseKey
      || !nonBlank(observedCase.storageETag) || observedCase.storageETag === '*'
      || !Number.isSafeInteger(observedCase.storageRowVersionToken) || observedCase.storageRowVersionToken < 1
      || controlCaseEffect.expectedETag !== observedCase.storageETag
      || controlCaseEffect.expectedRowVersionToken !== observedCase.storageRowVersionToken
      || consumption.controlCaseKey !== observedCase.controlCaseKey
      || consumption.controlReference !== amendmentPayload.controlReference
      || consumption.authorisedAction !== plan.commandType
      || consumption.subjectKey !== plan.subjectKey || consumption.workplanKey !== plan.subjectKey
      || consumption.workplanVersion !== observedCase.workplanVersion
      || consumption.expectedETag !== claim.expectedETag
      || consumption.expectedRowVersionToken !== claim.expectedRowVersionToken
      || consumption.expectedStorageETag !== controlCaseEffect.expectedETag
      || consumption.expectedStorageRowVersionToken !== controlCaseEffect.expectedRowVersionToken
      || consumption.consumedCommandKey !== plan.commandKey
      || !isEmployeeV2StableCommandKey(consumption.consumedSourceListId)
      || !Number.isSafeInteger(consumption.consumedSourceItemId) || consumption.consumedSourceItemId < 1
      || !nonBlank(consumption.consumedSourceItemVersion)
      || consumption.consumedAtUtc !== consumption.trustedUtc
      || assessSec006ControlCaseConsumption(observedCase, consumption) !== undefined) {
      return fail('C2b plan rejected: authoritative CONTROL-case action, subject, version, validity or CAS binding is invalid.');
    }
  } else if (controlCaseEffects.length !== 0) {
    return fail('C2b plan rejected: CONTROL-case consumption is restricted to the amendment action.');
  }
  const claimFields = claim.desiredFields as Record<string, unknown>;
  const finalFields = finalise.desiredFields as Record<string, unknown>;
  const expected = claim.expectedRowVersionToken || 0;
  const aclPrincipalImage = plan.intendedImage.acls[0].acl.allowedPrincipals;
  const processorPrincipals = aclPrincipalImage.filter(principal => principal.source === 'Processor');
  if (processorPrincipals.length !== 1)
    return fail('C2b plan rejected: exact processor principal is missing from the canonical ACL image.');
  const actorSource: C2bPrincipalGrant['source'] = plan.effectiveRole === 'Employee' ? 'Employee'
    : plan.effectiveRole === 'Manager' ? 'Manager' : 'Admin';
  const expectedReceiptActorAccess: C2bReceiptActorAccess = { receiptKey: plan.commandKey, breaksInheritance: true,
    allowedPrincipals: [
      { principalKey: plan.actorPersonKey, permission: 'Read', source: actorSource },
      processorPrincipals[0]
    ], revokedPrincipalKeys: [] };
  const plannedReceiptActorAccess = (receiptGrant.desiredFields as { actorAccess?: unknown }).actorAccess;
  if (claimFields.AccessState !== 'RecoveryHold' || claimFields.TransitionStatus !== 'InProgress'
    || claimFields.RowVersionToken !== expected + 1 || finalFields.AccessState === 'RecoveryHold'
    || finalFields.TransitionStatus !== 'Ready' || finalFields.RowVersionToken !== expected + 2
    || finalise.expectedRowVersionToken !== expected + 1 || finalise.expectedETagFromEffectKey !== claim.effectKey
    || hashC2bCanonical(finalFields) !== hashC2bCanonical(plan.intendedImage.header.fields)
    || stable.expectedRowVersionToken !== finalFields.RowVersionToken
    || (stable.desiredFields as Record<string, unknown>).intendedImageSha256 !== plan.intendedImageSha256
    || plan.intendedImage.acls.some(valueAcl => valueAcl.acl.containerKey !== plan.personKey
      || canonicaliseC2b(valueAcl.acl.allowedPrincipals) !== canonicaliseC2b(aclPrincipalImage)
      || revokes.filter(effect => effect.target === valueAcl.listPurpose).length !== 1
      || grants.filter(effect => effect.target === valueAcl.listPurpose).length !== 1
      || revokes.find(effect => effect.target === valueAcl.listPurpose)!.naturalKey !== valueAcl.acl.containerKey
      || grants.find(effect => effect.target === valueAcl.listPurpose)!.naturalKey !== valueAcl.acl.containerKey
      || hashC2bCanonical(revokes.find(effect => effect.target === valueAcl.listPurpose)!.desiredFields)
        !== hashC2bCanonical(valueAcl.acl))
    || receiptCreate.target !== 'CommandReceipts' || receiptCreate.naturalKey !== plan.commandKey
    || canonicaliseC2b(receiptCreate.desiredFields) !== canonicaliseC2b({
      operation: 'CreateAfterStableRead', commandKey: plan.commandKey, outcome: 'Accepted'
    })
    || receiptGrant.target !== 'CommandReceipts' || receiptGrant.naturalKey !== plan.commandKey
    || receiptGrant.expectedETagFromEffectKey !== receiptCreate.effectKey
    || canonicaliseC2b(plannedReceiptActorAccess) !== canonicaliseC2b(expectedReceiptActorAccess))
    return fail('C2b plan rejected: RecoveryHold claim or expected+2 final business image is incomplete.');
  const withoutHash = { ...plan } as Partial<C2bCommandPlan>;
  delete withoutHash.planSha256;
  if (hashC2bCanonical(withoutHash) !== plan.planSha256)
    return fail('C2b plan rejected: internally computed plan hash does not reconcile.');
}

function audit(input: Omit<C2bOutcomeAudit, 'evidenceSha256'>): C2bOutcomeAudit {
  if (!nonBlank(input.auditKey) || !nonBlank(input.commandKey) || !nonBlank(input.safeCode)
    || !nonBlank(input.safeReason) || !Number.isFinite(Date.parse(input.recordedAt)) || !SHA256.test(input.payloadSha256)
    || input.planSha256 !== null && !SHA256.test(input.planSha256))
    return fail('C2b outcome audit rejected: durable failure/outcome evidence is incomplete.');
  return { ...cloneC2b(input), evidenceSha256: hashC2bCanonical(input) };
}
export function createC2bRejectedOutcome(identity: {
  commandKey: string; commandType: C2bCommandType; personKey: string; subjectKey: string; performanceYear: number;
}, payload: unknown, validationCode: string, safeMessage: string, recordedAt: string): { audit: C2bOutcomeAudit; receipt: C2bFailureReceipt } {
  if (!C2B_ANNUAL_COMMAND_ALLOW_LIST.includes(identity.commandType) || !isEmployeeV2StableCommandKey(identity.commandKey)
    || !nonBlank(identity.personKey) || !nonBlank(identity.subjectKey) || !Number.isInteger(identity.performanceYear)
    || !nonBlank(validationCode) || !nonBlank(safeMessage) || !Number.isFinite(Date.parse(recordedAt)))
    return fail('C2b rejection evidence rejected: command identity, code and safe message are required.');
  const payloadSha256 = hashC2bCanonical(payload);
  const outcomeAudit = audit({ auditKey: `${identity.commandKey}|Rejected`, commandKey: identity.commandKey,
    outcome: 'Rejected', payloadSha256, planSha256: null, effectKey: null, safeCode: validationCode,
    safeReason: safeMessage, success: false, recordedAt });
  return { audit: outcomeAudit, receipt: { receiptKey: `${identity.commandKey}|Rejected`, commandKey: identity.commandKey,
    outcome: 'Rejected', payloadSha256, validationCode, safeMessage, completedAt: recordedAt, auditKey: outcomeAudit.auditKey } };
}
function newJournal(plan: C2bCommandPlan): C2bCommandJournal {
  assertValidC2bPlan(plan);
  return { journalVersion: 1, plan: cloneC2b(plan), state: 'Planned', leaseOwner: null, leaseEpoch: 0,
    leaseExpiresAt: null, effects: plan.effects.map(effect => ({ ...cloneC2b(effect), disposition: 'Planned',
      confirmation: null, confirmationSha256: null })), stableRead: null, receipt: null, recoveryHold: null,
    outcomeAudits: [] };
}
export function admitC2bPlan(existing: C2bCommandJournal | undefined, plan: C2bCommandPlan,
  recordedAt: string): C2bAdmissionResult {
  assertValidC2bPlan(plan);
  if (!Number.isFinite(Date.parse(recordedAt))) return fail('C2b admission rejected: recorded time is invalid.');
  if (!existing) return { status: 'Created', journal: newJournal(plan) };
  assertValidC2bJournal(existing);
  if (existing.plan.commandKey !== plan.commandKey) return fail('C2b admission rejected: existing journal identity differs.');
  if (existing.plan.planSha256 !== plan.planSha256 || existing.plan.payloadSha256 !== plan.payloadSha256
    || canonicaliseC2b(existing.plan) !== canonicaliseC2b(plan)) {
    const collisionAudit = audit({ auditKey: `${plan.commandKey}|Collision|${plan.planSha256.slice(0, 12)}`,
      commandKey: plan.commandKey, outcome: 'Collision', payloadSha256: plan.payloadSha256,
      planSha256: plan.planSha256, effectKey: null, safeCode: 'COMMAND_KEY_COLLISION',
      safeReason: 'CommandKey was replayed with a different immutable payload or plan.', success: false, recordedAt });
    return { status: 'Collision', journal: cloneC2b(existing), audit: collisionAudit,
      receipt: { receiptKey: `${plan.commandKey}|Rejected|Collision`, commandKey: plan.commandKey, outcome: 'Rejected',
        payloadSha256: plan.payloadSha256, validationCode: 'COMMAND_KEY_COLLISION',
        safeMessage: collisionAudit.safeReason, completedAt: recordedAt, auditKey: collisionAudit.auditKey } };
  }
  return { status: 'Replay', journal: cloneC2b(existing) };
}
function cas(journal: C2bCommandJournal, expectedJournalVersion: number): C2bCommandJournal {
  assertValidC2bJournal(journal);
  if (journal.journalVersion !== expectedJournalVersion) return fail('C2b CAS rejected: stale journal version.');
  return cloneC2b(journal);
}
function assertEpochOwner(journal: C2bCommandJournal, owner: string, epoch: number): void {
  if (!nonBlank(owner) || journal.leaseOwner !== owner || journal.leaseEpoch !== epoch)
    return fail('C2b lease rejected: owner or epoch is stale.');
}
function assertLease(journal: C2bCommandJournal, owner: string, epoch: number, now: string): void {
  assertEpochOwner(journal, owner, epoch);
  if (!journal.leaseExpiresAt || parseTime(journal.leaseExpiresAt) <= parseTime(now))
    return fail('C2b lease rejected: owner, epoch or expiry is stale.');
}
export function acquireC2bLease(journal: C2bCommandJournal, owner: string, now: string, expiresAt: string,
  expectedJournalVersion: number): C2bCommandJournal {
  const next = cas(journal, expectedJournalVersion);
  if (!nonBlank(owner) || parseTime(expiresAt) <= parseTime(now) || next.state === 'Held' || next.state === 'Terminal')
    return fail('C2b lease rejected: journal is not safely leasable.');
  const leaseActive = next.leaseOwner && next.leaseExpiresAt && parseTime(next.leaseExpiresAt) > parseTime(now);
  if (leaseActive && next.leaseOwner !== owner) return fail('C2b lease rejected: another owner holds the live epoch.');
  if (!leaseActive && next.effects.some(effect => effect.disposition === 'Issued' || effect.disposition === 'Unknown')) {
    const inFlight = next.effects.find(effect => effect.disposition === 'Issued' || effect.disposition === 'Unknown')!;
    const finalise = next.effects.find(effect => effect.kind === 'Finalise');
    if (finalise?.disposition === 'Confirmed' && inFlight.sequence > finalise.sequence)
      return fail('C2b lease rejected: expired post-Finalise work requires exact CAS/epoch-bound RecoveryHold proof.');
    next.effects.forEach(effect => { if (effect.disposition === 'Issued' || effect.disposition === 'Unknown') effect.disposition = 'Held'; });
    const held = next.effects.find(effect => effect.disposition === 'Held')!;
    next.outcomeAudits.push(audit({ auditKey: `${next.plan.commandKey}|Held|LeaseExpired|${next.journalVersion}`,
      commandKey: next.plan.commandKey, outcome: 'Held', payloadSha256: next.plan.payloadSha256,
      planSha256: next.plan.planSha256, effectKey: held.effectKey, safeCode: 'LEASE_EXPIRED_IN_FLIGHT',
      safeReason: 'An in-flight effect lost its lease and requires exact recovery evidence.', success: false, recordedAt: now }));
    next.state = 'Held'; next.leaseOwner = null; next.leaseExpiresAt = null; next.journalVersion += 1;
    return next;
  }
  next.leaseOwner = owner; next.leaseEpoch += 1; next.leaseExpiresAt = expiresAt; next.state = 'Leased';
  next.journalVersion += 1;
  return next;
}
export function issueNextC2bEffect(journal: C2bCommandJournal, effectKey: string, owner: string, epoch: number,
  now: string, expectedJournalVersion: number): C2bCommandJournal {
  const next = cas(journal, expectedJournalVersion);
  assertLease(next, owner, epoch, now);
  if (next.state === 'Held' || next.state === 'Terminal' || next.effects.some(effect => effect.disposition === 'Issued'))
    return fail('C2b issue rejected: journal has an unresolved effect.');
  const current = next.effects.find(effect => effect.disposition !== 'Confirmed');
  if (!current || current.effectKey !== effectKey || current.disposition !== 'Planned')
    return fail('C2b issue rejected: effects must execute exactly once in plan order.');
  if ((current.kind === 'ReceiptCreate' || current.kind === 'ReceiptGrant') && !next.stableRead)
    return fail('C2b issue rejected: receipt effects require post-finalise stable canonical proof.');
  current.disposition = 'Issued';
  next.state = current.kind === 'Finalise' ? 'Finalising'
    : current.kind === 'StableRead' || current.kind === 'ReceiptCreate' || current.kind === 'ReceiptGrant' ? 'Ready' : 'Applying';
  next.journalVersion += 1;
  return next;
}
function receiptActorAccess(journal: C2bCommandJournal): C2bReceiptActorAccess {
  const receiptGrant = journal.effects.find(candidate => candidate.kind === 'ReceiptGrant');
  const actorAccess = receiptGrant && (receiptGrant.desiredFields as { actorAccess?: unknown }).actorAccess;
  if (!actorAccess || typeof actorAccess !== 'object' || Array.isArray(actorAccess))
    return fail('C2b receipt rejected: immutable actor access is missing from the plan.');
  return cloneC2b(actorAccess) as C2bReceiptActorAccess;
}
function validateTerminalReceipt(journal: C2bCommandJournal, receiptValue: unknown,
  receiptKey: string, expectedCanonicalSha256 = journal.stableRead?.readbackSha256): C2bTerminalReceipt {
  if (!receiptValue || typeof receiptValue !== 'object' || Array.isArray(receiptValue))
    return fail('C2b receipt rejected: exact full immutable receipt readback is missing.');
  const receipt = receiptValue as C2bTerminalReceipt;
  const exactKeys = ['receiptKey', 'commandKey', 'outcome', 'planSha256', 'payloadSha256', 'canonicalSha256',
    'resultKeys', 'auditKeys', 'actorAccess', 'processorReference', 'completedAt'];
  const auditKeys = journal.effects.filter(candidate => candidate.kind === 'AuditAppend')
    .map(candidate => candidate.confirmation?.naturalKey || '');
  const resultKeys = [journal.plan.subjectKey, ...journal.plan.intendedImage.items.map(item => item.naturalKey)].sort();
  const expectedActorAccess = receiptActorAccess(journal);
  if (Object.keys(receipt).length !== exactKeys.length || exactKeys.some(key => !Object.prototype.hasOwnProperty.call(receipt, key))
    || receipt.outcome !== 'Accepted' || receipt.commandKey !== journal.plan.commandKey || receipt.receiptKey !== receiptKey
    || receipt.planSha256 !== journal.plan.planSha256 || receipt.payloadSha256 !== journal.plan.payloadSha256
    || !expectedCanonicalSha256 || receipt.canonicalSha256 !== expectedCanonicalSha256
    || !Array.isArray(receipt.resultKeys) || !sameSet(receipt.resultKeys, resultKeys)
    || !Array.isArray(receipt.auditKeys) || !sameSet(receipt.auditKeys, auditKeys)
    || canonicaliseC2b(receipt.actorAccess) !== canonicaliseC2b(expectedActorAccess)
    || !nonBlank(receipt.processorReference) || !Number.isFinite(Date.parse(receipt.completedAt)))
    return fail('C2b receipt rejected: exact full immutable receipt content is missing or mismatched.');
  return cloneC2b(receipt);
}
function confirmedCreatedReceipt(journal: C2bCommandJournal): C2bTerminalReceipt {
  const receiptCreate = journal.effects.find(candidate => candidate.kind === 'ReceiptCreate');
  const readback = receiptCreate?.confirmation?.readback as { operation?: unknown; receipt?: unknown } | undefined;
  if (!receiptCreate || receiptCreate.disposition !== 'Confirmed' || readback?.operation !== 'CreateAfterStableRead')
    return fail('C2b receipt rejected: confirmed ReceiptCreate readback is missing.');
  return validateTerminalReceipt(journal, readback.receipt, receiptCreate.naturalKey);
}
const JOURNAL_KEYS = ['journalVersion', 'plan', 'state', 'leaseOwner', 'leaseEpoch', 'leaseExpiresAt',
  'effects', 'stableRead', 'receipt', 'recoveryHold', 'outcomeAudits'] as const;
const JOURNAL_EFFECT_KEYS = ['sequence', 'effectKey', 'kind', 'target', 'naturalKey', 'expectedETag',
  'expectedETagFromEffectKey', 'expectedRowVersionToken', 'beforeFields', 'beforeSha256', 'desiredFields',
  'desiredSha256', 'effectSha256', 'disposition', 'confirmation', 'confirmationSha256'] as const;
const CONFIRMATION_KEYS = ['providerReference', 'naturalKey', 'requestETag', 'observedETag',
  'observedRowVersionToken', 'readback'] as const;
const AUDIT_KEYS = ['auditKey', 'commandKey', 'outcome', 'payloadSha256', 'planSha256', 'effectKey', 'safeCode',
  'safeReason', 'success', 'recordedAt', 'evidenceSha256'] as const;

function assertValidC2bOutcomeAudit(journal: C2bCommandJournal, value: C2bOutcomeAudit): void {
  const base = { ...value } as Partial<C2bOutcomeAudit>;
  delete base.evidenceSha256;
  if (!value || typeof value !== 'object' || Array.isArray(value) || !exactKeys(value, AUDIT_KEYS)
    || !nonBlank(value.auditKey) || value.commandKey !== journal.plan.commandKey
    || !['Accepted', 'Rejected', 'Collision', 'Held', 'Recovery'].includes(value.outcome)
    || value.payloadSha256 !== journal.plan.payloadSha256
    || value.planSha256 !== null && value.planSha256 !== journal.plan.planSha256
    || value.effectKey !== null && !journal.effects.some(effect => effect.effectKey === value.effectKey)
    || !nonBlank(value.safeCode) || !nonBlank(value.safeReason) || typeof value.success !== 'boolean'
    || !Number.isFinite(Date.parse(value.recordedAt)) || value.evidenceSha256 !== hashC2bCanonical(base))
    return fail('C2b journal rejected: outcome audit identity or immutable evidence is invalid.');
}

export function assertValidC2bEffectForPlan(journal: C2bCommandJournal, effect: C2bCommandEffect): void {
  assertValidC2bPlan(journal.plan);
  const planned = journal.plan.effects.find(candidate => candidate.effectKey === effect.effectKey);
  const plan = { ...effect } as Partial<C2bCommandEffect>;
  delete plan.disposition; delete plan.confirmation; delete plan.confirmationSha256;
  if (!effect || typeof effect !== 'object' || Array.isArray(effect) || !exactKeys(effect, JOURNAL_EFFECT_KEYS)
    || !planned || canonicaliseC2b(plan) !== canonicaliseC2b(planned)
    || !['Planned', 'Issued', 'Confirmed', 'Unknown', 'Held'].includes(effect.disposition))
    return fail('C2b journal rejected: effect state is not bound to the exact immutable plan.');
  if (effect.disposition !== 'Confirmed') {
    if (effect.confirmation !== null || effect.confirmationSha256 !== null)
      return fail('C2b journal rejected: an unconfirmed effect contains confirmation evidence.');
    return;
  }
  if (!effect.confirmation || !exactKeys(effect.confirmation, CONFIRMATION_KEYS)
    || effect.confirmationSha256 !== hashC2bCanonical(effect.confirmation))
    return fail('C2b journal rejected: confirmed effect evidence is incomplete or mismatched.');
  const heldEffect = journal.recoveryHold
    ? journal.effects.find(candidate => candidate.effectKey === journal.recoveryHold!.effectKey) : undefined;
  const preservedReceiptCreate = journal.state === 'Held' && effect.kind === 'ReceiptCreate'
    && heldEffect?.kind === 'ReceiptGrant' && heldEffect.sequence > effect.sequence && journal.stableRead === null;
  if (preservedReceiptCreate) {
    const readback = effect.confirmation.readback as { operation?: unknown; receipt?: unknown };
    if (!nonBlank(effect.confirmation.providerReference) || effect.confirmation.naturalKey !== effect.naturalKey
      || effect.confirmation.requestETag !== effect.expectedETag || !nonBlank(effect.confirmation.observedETag)
      || effect.confirmation.observedRowVersionToken !== null || readback.operation !== 'CreateAfterStableRead')
      return fail('C2b journal rejected: preserved ReceiptCreate recovery evidence is incomplete.');
    validateTerminalReceipt(journal, readback.receipt, effect.naturalKey, journal.plan.intendedImageSha256);
  } else if (effect.confirmationSha256 !== confirmationHash(journal, effect, effect.confirmation)) {
    return fail('C2b journal rejected: confirmed effect evidence is logically mismatched.');
  }
}

export function assertValidC2bJournal(journal: C2bCommandJournal): void {
  if (!journal || typeof journal !== 'object' || Array.isArray(journal) || !exactKeys(journal, JOURNAL_KEYS))
    return fail('C2b journal rejected: exact journal shape is required.');
  assertValidC2bPlan(journal.plan);
  if (!Number.isSafeInteger(journal.journalVersion) || journal.journalVersion < 1
    || !Number.isSafeInteger(journal.leaseEpoch) || journal.leaseEpoch < 0 || journal.leaseEpoch >= journal.journalVersion
    || !Array.isArray(journal.effects) || journal.effects.length !== journal.plan.effects.length
    || !Array.isArray(journal.outcomeAudits))
    return fail('C2b journal rejected: version, epoch or effect cardinality is invalid.');
  journal.effects.forEach((effect, index) => {
    if (effect.sequence !== index + 1) return fail('C2b journal rejected: effect state order differs from the plan.');
    assertValidC2bEffectForPlan(journal, effect);
  });

  const leasedState = ['Leased', 'Claimed', 'Applying', 'Finalising', 'Ready'].includes(journal.state);
  const leasePresent = journal.leaseOwner !== null || journal.leaseExpiresAt !== null;
  if (leasePresent !== leasedState || leasedState && (!nonBlank(journal.leaseOwner)
    || !journal.leaseExpiresAt || !Number.isFinite(Date.parse(journal.leaseExpiresAt)) || journal.leaseEpoch < 1))
    return fail('C2b journal rejected: lease owner, epoch, expiry or state is inconsistent.');
  const issued = journal.effects.filter(effect => effect.disposition === 'Issued');
  const unresolved = journal.effects.filter(effect => effect.disposition === 'Unknown' || effect.disposition === 'Held');
  if (issued.length > 1 || unresolved.length > 1 || issued.length > 0 && unresolved.length > 0)
    return fail('C2b journal rejected: more than one effect is in flight or unresolved.');
  if (journal.state === 'Held') {
    if (unresolved.length !== 1 || issued.length || leasePresent)
      return fail('C2b journal rejected: Held requires one unresolved effect and no live lease.');
  } else if (unresolved.length) return fail('C2b journal rejected: unresolved effects require Held state.');
  if (journal.state === 'Planned' && (leasePresent || issued.length)
    || journal.state === 'Leased' && issued.length
    || journal.state === 'Claimed' && (issued.length
      || journal.effects.filter(effect => effect.kind === 'Claim' && effect.disposition === 'Confirmed').length !== 1)
    || journal.state === 'Applying' && (issued.length !== 1
      || ['Finalise', 'StableRead', 'ReceiptCreate', 'ReceiptGrant'].includes(issued[0].kind))
    || journal.state === 'Finalising' && (issued.length !== 1 || issued[0].kind !== 'Finalise')
    || journal.state === 'Ready' && (issued.length > 1 || issued.length === 1
      && !['StableRead', 'ReceiptCreate', 'ReceiptGrant'].includes(issued[0].kind)
      || journal.effects.filter(effect => effect.kind === 'Finalise' && effect.disposition === 'Confirmed').length !== 1))
    return fail('C2b journal rejected: logical state and effect dispositions are inconsistent.');

  const stable = journal.effects.find(effect => effect.kind === 'StableRead')!;
  if (journal.stableRead !== null) {
    const keys = ['first', 'second', 'readbackSha256'];
    if (stable.disposition !== 'Confirmed' || !exactKeys(journal.stableRead, keys)
      || canonicaliseC2b(journal.stableRead.first) !== canonicaliseC2b(journal.stableRead.second)
      || stableObservation(journal, stable, journal.stableRead.first) !== journal.stableRead.readbackSha256
      || stableObservation(journal, stable, journal.stableRead.second) !== journal.stableRead.readbackSha256)
      return fail('C2b journal rejected: stable-read proof is incomplete or mismatched.');
  } else if (stable.disposition === 'Confirmed') {
    return fail('C2b journal rejected: confirmed StableRead evidence is absent.');
  }

  if (journal.recoveryHold !== null) {
    const hold = journal.recoveryHold;
    const holdKeys = ['effectKey', 'failureOutcome', 'owner', 'leaseEpoch', 'safeCode', 'safeReason', 'proof',
      'evidenceSha256'];
    const proofKeys = ['providerReference', 'naturalKey', 'requestETag', 'observedETag',
      'observedRowVersionToken', 'processorEpoch', 'beforeFields', 'readback'];
    const evidence = { ...hold } as Partial<C2bRecoveryHoldEvidence>;
    delete evidence.evidenceSha256;
    const held = journal.effects.find(effect => effect.effectKey === hold.effectKey);
    const finalise = journal.effects.find(effect => effect.kind === 'Finalise');
    const finalToken = journal.plan.intendedImage.header.fields.RowVersionToken;
    if (journal.state !== 'Held' || !exactKeys(hold, holdKeys) || !exactKeys(hold.proof, proofKeys)
      || !held || !['Unknown', 'Held'].includes(held.disposition) || !finalise
      || finalise.disposition !== 'Confirmed' || held.sequence <= finalise.sequence
      || !nonBlank(hold.owner) || hold.leaseEpoch !== journal.leaseEpoch || hold.proof.processorEpoch !== hold.leaseEpoch
      || !['DefinitiveFailure', 'Unknown'].includes(hold.failureOutcome) || !nonBlank(hold.safeCode)
      || !nonBlank(hold.safeReason) || hold.evidenceSha256 !== hashC2bCanonical(evidence)
      || !nonBlank(hold.proof.providerReference) || hold.proof.naturalKey !== journal.plan.subjectKey
      || hold.proof.requestETag !== finalise.confirmation?.observedETag || !nonBlank(hold.proof.observedETag)
      || hold.proof.observedETag === '*' || !Number.isSafeInteger(finalToken)
      || hold.proof.observedRowVersionToken !== finalToken
      || hashC2bCanonical(hold.proof.beforeFields) !== hashC2bCanonical(journal.plan.intendedImage.header.fields)
      || hashC2bCanonical(hold.proof.readback) !== hashC2bCanonical(expectedPostFinaliseHoldFields(journal)))
      return fail('C2b journal rejected: RecoveryHold evidence is incomplete or mismatched.');
  }
  journal.outcomeAudits.forEach(value => assertValidC2bOutcomeAudit(journal, value));
  if (new Set(journal.outcomeAudits.map(value => value.auditKey)).size !== journal.outcomeAudits.length)
    return fail('C2b journal rejected: outcome audit keys are duplicated.');

  if (journal.state === 'Terminal') {
    if (leasePresent || issued.length || unresolved.length || journal.effects.some(effect => effect.disposition !== 'Confirmed')
      || !journal.stableRead || !journal.receipt || journal.recoveryHold !== null
      || canonicaliseC2b(validateTerminalReceipt(journal, journal.receipt, journal.plan.commandKey))
        !== canonicaliseC2b(journal.receipt))
      return fail('C2b journal rejected: Terminal receipt, stable proof or confirmed effects are incomplete.');
  } else if (journal.receipt !== null) return fail('C2b journal rejected: a terminal receipt exists before Terminal state.');
}

function confirmationHash(journal: C2bCommandJournal, effect: C2bEffectPlan, proof: C2bEffectConfirmation): string {
  const source = effect.expectedETagFromEffectKey === null ? undefined
    : journal.effects.find(candidate => candidate.effectKey === effect.expectedETagFromEffectKey);
  const expectedRequestETag = source ? source.confirmation?.observedETag : effect.expectedETag;
  if (!nonBlank(proof.providerReference) || proof.naturalKey !== effect.naturalKey
    || proof.requestETag !== expectedRequestETag
    || proof.observedETag !== null && (!nonBlank(proof.observedETag) || proof.observedETag === '*')
    || proof.observedRowVersionToken !== null && (!Number.isSafeInteger(proof.observedRowVersionToken) || proof.observedRowVersionToken < 0))
    return fail('C2b effect confirmation rejected: exact effect-specific readback evidence is missing or mismatched.');
  if (effect.kind === 'ReceiptCreate') {
    const readback = proof.readback as { operation?: unknown; receipt?: unknown };
    if (readback.operation !== 'CreateAfterStableRead' || !nonBlank(proof.observedETag)
      || proof.observedRowVersionToken !== null)
      return fail('C2b effect confirmation rejected: exact ReceiptCreate item readback is missing.');
    validateTerminalReceipt(journal, readback.receipt, effect.naturalKey);
  } else if (effect.kind === 'ReceiptGrant') {
    const receipt = confirmedCreatedReceipt(journal);
    const expectedReadback = { operation: 'GrantReceiptRead', receiptKey: receipt.receiptKey,
      receiptSha256: hashC2bCanonical(receipt), actorAccess: receipt.actorAccess };
    if (!nonBlank(proof.observedETag) || proof.observedRowVersionToken !== null
      || canonicaliseC2b(proof.readback) !== canonicaliseC2b(expectedReadback))
      return fail('C2b effect confirmation rejected: ReceiptGrant is not bound to the created receipt and actor access.');
  } else if (effect.kind === 'ControlCaseConsume') {
    const before = effect.beforeFields as unknown as ISec006ControlCase | null;
    const consumption = controlCaseConsumption(effect);
    const expectedReadback = before && {
      ...before,
      active: false,
      storageETag: proof.observedETag,
      storageRowVersionToken: consumption.expectedStorageRowVersionToken + 1,
      consumedAtUtc: consumption.consumedAtUtc,
      consumedCommandKey: consumption.consumedCommandKey,
      consumedSourceListId: consumption.consumedSourceListId,
      consumedSourceItemId: consumption.consumedSourceItemId,
      consumedSourceItemVersion: consumption.consumedSourceItemVersion
    };
    if (!before || !nonBlank(proof.observedETag)
      || proof.observedRowVersionToken !== consumption.expectedStorageRowVersionToken + 1
      || canonicaliseC2b(proof.readback) !== canonicaliseC2b(expectedReadback)) {
      return fail('C2b effect confirmation rejected: authoritative CONTROL-case CAS readback is incomplete or mismatched.');
    }
  } else if (hashC2bCanonical(proof.readback) !== effect.desiredSha256) {
    return fail('C2b effect confirmation rejected: exact effect-specific readback evidence is missing or mismatched.');
  }
  if (['Claim', 'CanonicalUpsert', 'Finalise'].includes(effect.kind)) {
    const desiredToken = (effect.desiredFields as Record<string, unknown>).RowVersionToken;
    if (!nonBlank(proof.observedETag) || !Number.isSafeInteger(proof.observedRowVersionToken)
      || typeof desiredToken === 'number' && proof.observedRowVersionToken !== desiredToken)
      return fail('C2b effect confirmation rejected: canonical ETag/token evidence is incomplete.');
  }
  return hashC2bCanonical(proof);
}
export function settleC2bEffect(journal: C2bCommandJournal, effectKey: string,
  settlement: { outcome: 'Confirmed'; proof: C2bEffectConfirmation } | { outcome: 'Unknown'; safeCode: string },
  owner: string, epoch: number, now: string, expectedJournalVersion: number): C2bCommandJournal {
  const next = cas(journal, expectedJournalVersion);
  assertLease(next, owner, epoch, now);
  const effect = next.effects.find(candidate => candidate.effectKey === effectKey);
  if (!effect || effect.disposition !== 'Issued' || effect.kind === 'StableRead' || effect.kind === 'ReceiptGrant')
    return fail('C2b settlement rejected: effect is not an issued effect handled by this transition.');
  if (settlement.outcome === 'Confirmed') {
    effect.confirmationSha256 = confirmationHash(next, effect, settlement.proof);
    effect.confirmation = cloneC2b(settlement.proof); effect.disposition = 'Confirmed';
    next.state = effect.kind === 'Claim' ? 'Claimed' : effect.kind === 'Finalise' ? 'Ready' : 'Leased';
  } else {
    if (!nonBlank(settlement.safeCode)) return fail('C2b settlement rejected: Unknown requires a safe failure code.');
    const finalise = next.effects.find(candidate => candidate.kind === 'Finalise');
    if (finalise?.disposition === 'Confirmed' && effect.sequence > finalise.sequence)
      return fail('C2b settlement rejected: a post-Finalise failure requires exact CAS/epoch-bound RecoveryHold proof.');
    effect.disposition = 'Unknown'; next.state = 'Held'; next.leaseOwner = null; next.leaseExpiresAt = null;
    next.outcomeAudits.push(audit({ auditKey: `${next.plan.commandKey}|Held|${effect.sequence}|${next.journalVersion}`,
      commandKey: next.plan.commandKey, outcome: 'Held', payloadSha256: next.plan.payloadSha256,
      planSha256: next.plan.planSha256, effectKey: effect.effectKey, safeCode: settlement.safeCode,
      safeReason: 'Effect acknowledgement is unknown; canonical state remains RecoveryHold until reconciled.',
      success: false, recordedAt: now }));
  }
  next.journalVersion += 1;
  return next;
}

function expectedPostFinaliseHoldFields(journal: C2bCommandJournal): Readonly<Record<string, unknown>> {
  return { ...cloneC2b(journal.plan.intendedImage.header.fields), AccessState: 'RecoveryHold',
    TransitionStatus: 'Held', TransitionCorrelationKey: journal.plan.commandKey };
}
export function holdC2bPostFinaliseEffect(journal: C2bCommandJournal, effectKey: string,
  failure: { outcome: 'DefinitiveFailure' | 'Unknown'; safeCode: string; safeReason: string },
  proof: C2bPostFinaliseHoldProof, owner: string, epoch: number, now: string,
  expectedJournalVersion: number): C2bCommandJournal {
  const next = cas(journal, expectedJournalVersion);
  assertEpochOwner(next, owner, epoch);
  parseTime(now);
  const effect = next.effects.find(candidate => candidate.effectKey === effectKey);
  const finalise = next.effects.find(candidate => candidate.kind === 'Finalise');
  const finaliseETag = finalise?.confirmation?.observedETag;
  const finalToken = next.plan.intendedImage.header.fields.RowVersionToken;
  const heldFields = expectedPostFinaliseHoldFields(next);
  if (!effect || effect.disposition !== 'Issued' || !finalise || finalise.disposition !== 'Confirmed'
    || effect.sequence <= finalise.sequence || !['AuditAppend', 'StableRead', 'ReceiptCreate', 'ReceiptGrant'].includes(effect.kind)
    || !nonBlank(failure.safeCode) || !nonBlank(failure.safeReason) || !nonBlank(finaliseETag)
    || !nonBlank(proof.providerReference) || proof.naturalKey !== next.plan.subjectKey
    || proof.requestETag !== finaliseETag || !nonBlank(proof.observedETag) || proof.observedETag === '*'
    || proof.processorEpoch !== epoch || !Number.isSafeInteger(finalToken)
    || proof.observedRowVersionToken !== finalToken
    || hashC2bCanonical(proof.beforeFields) !== hashC2bCanonical(next.plan.intendedImage.header.fields)
    || hashC2bCanonical(proof.readback) !== hashC2bCanonical(heldFields))
    return fail('C2b post-Finalise hold rejected: exact CAS, epoch, before image and RecoveryHold readback are required.');
  effect.disposition = failure.outcome === 'Unknown' ? 'Unknown' : 'Held';
  const stableEffect = next.effects.find(candidate => candidate.kind === 'StableRead');
  if (stableEffect && effect.sequence > stableEffect.sequence) {
    stableEffect.disposition = 'Planned'; stableEffect.confirmation = null; stableEffect.confirmationSha256 = null;
  }
  const evidenceBase: Omit<C2bRecoveryHoldEvidence, 'evidenceSha256'> = {
    effectKey: effect.effectKey, failureOutcome: failure.outcome, owner, leaseEpoch: epoch,
    safeCode: failure.safeCode, safeReason: failure.safeReason, proof: cloneC2b(proof)
  };
  next.recoveryHold = { ...evidenceBase, evidenceSha256: hashC2bCanonical(evidenceBase) };
  next.stableRead = null; next.state = 'Held'; next.leaseOwner = null; next.leaseExpiresAt = null;
  next.outcomeAudits.push(audit({ auditKey: `${next.plan.commandKey}|Held|PostFinalise|${effect.sequence}|${next.journalVersion}`,
    commandKey: next.plan.commandKey, outcome: 'Held', payloadSha256: next.plan.payloadSha256,
    planSha256: next.plan.planSha256, effectKey: effect.effectKey, safeCode: failure.safeCode,
    safeReason: failure.safeReason, success: false, recordedAt: now }));
  next.journalVersion += 1;
  return next;
}

function normaliseObservationImage(observation: C2bCanonicalObservation): C2bIntendedImage {
  return normaliseC2bIntendedImage({ header: { naturalKey: observation.header.naturalKey, fields: observation.header.fields },
    items: observation.items.map(item => ({ naturalKey: item.naturalKey, fields: item.fields })), acls: observation.acls });
}
function stableObservation(journal: C2bCommandJournal, effect: C2bCommandEffect,
  observation: C2bCanonicalObservation): string {
  const image = normaliseObservationImage(observation);
  const expectedItemKeys = journal.plan.intendedImage.items.map(item => item.naturalKey).sort();
  const observedItemKeys = image.items.map(item => item.naturalKey);
  const prior = journal.effects.filter(candidate => candidate.sequence < effect.sequence);
  const expectedEvidence = prior.map(candidate => candidate.confirmationSha256);
  const expectedAudits = prior.filter(candidate => candidate.kind === 'AuditAppend')
    .map(candidate => candidate.confirmation?.naturalKey || '');
  if (!observation.pagination.complete || observation.pagination.nextLink !== null
    || !Number.isInteger(observation.pagination.pageCount) || observation.pagination.pageCount < 1
    || observation.pagination.totalCount !== image.items.length
    || !sameSet(observation.pagination.affectedNaturalKeys, expectedItemKeys) || !sameSet(observedItemKeys, expectedItemKeys)
    || observation.header.naturalKey !== journal.plan.subjectKey || !nonBlank(observation.header.etag)
    || observation.header.etag === '*' || observation.header.rowVersionToken !== effect.expectedRowVersionToken
    || observation.processorEpoch !== journal.leaseEpoch || expectedEvidence.some(value => value === null)
    || !sameSet(observation.effectEvidenceSha256, expectedEvidence as string[])
    || !sameSet(observation.auditKeys, expectedAudits)
    || hashC2bCanonical(image) !== journal.plan.intendedImageSha256)
    return fail('C2b stable read rejected: complete intended image, paging, grants, audit or effect evidence is mismatched.');
  return hashC2bCanonical(image);
}
export function confirmC2bStableRead(journal: C2bCommandJournal, effectKey: string, proof: C2bStableReadProof,
  owner: string, epoch: number, now: string, expectedJournalVersion: number): C2bCommandJournal {
  const next = cas(journal, expectedJournalVersion);
  assertLease(next, owner, epoch, now);
  const effect = next.effects.find(candidate => candidate.effectKey === effectKey);
  if (!effect || effect.disposition !== 'Issued' || effect.kind !== 'StableRead'
    || next.effects.filter(candidate => candidate.sequence < effect.sequence).some(candidate => candidate.disposition !== 'Confirmed')
    || canonicaliseC2b(proof.first) !== canonicaliseC2b(proof.second)
    || proof.first.header.etag !== proof.second.header.etag
    || proof.first.header.rowVersionToken !== proof.second.header.rowVersionToken)
    return fail('C2b stable read rejected: post-finalise H1/rows/H2 proof is incomplete or unstable.');
  const firstHash = stableObservation(next, effect, proof.first);
  const secondHash = stableObservation(next, effect, proof.second);
  if (firstHash !== secondHash) return fail('C2b stable read rejected: readback hashes changed.');
  const confirmation: C2bEffectConfirmation = { providerReference: firstHash, naturalKey: effect.naturalKey,
    requestETag: null,
    observedETag: proof.second.header.etag, observedRowVersionToken: proof.second.header.rowVersionToken,
    readback: cloneC2b(effect.desiredFields) };
  effect.disposition = 'Confirmed'; effect.confirmation = confirmation;
  effect.confirmationSha256 = hashC2bCanonical(confirmation);
  next.stableRead = { first: cloneC2b(proof.first), second: cloneC2b(proof.second), readbackSha256: firstHash };
  next.state = 'Ready'; next.journalVersion += 1;
  return next;
}
export function completeC2bReceipt(journal: C2bCommandJournal, effectKey: string, receipt: C2bTerminalReceipt,
  receiptAccessProof: C2bEffectConfirmation, owner: string, epoch: number, now: string,
  expectedJournalVersion: number): C2bCommandJournal {
  const next = cas(journal, expectedJournalVersion);
  assertLease(next, owner, epoch, now);
  const effect = next.effects.find(candidate => candidate.effectKey === effectKey);
  const receiptCreate = next.effects.find(candidate => candidate.kind === 'ReceiptCreate');
  if (!effect || effect.kind !== 'ReceiptGrant' || effect.disposition !== 'Issued' || !next.stableRead
    || !receiptCreate || receiptCreate.disposition !== 'Confirmed'
    || next.effects.filter(candidate => candidate.sequence < effect.sequence).some(candidate => candidate.disposition !== 'Confirmed'))
    return fail('C2b receipt rejected: terminal result, stable proof, receipt ordering or audit evidence is incomplete.');
  const createdReceipt = confirmedCreatedReceipt(next);
  if (canonicaliseC2b(receipt) !== canonicaliseC2b(createdReceipt))
    return fail('C2b receipt rejected: terminal receipt differs from the confirmed immutable ReceiptCreate readback.');
  effect.confirmationSha256 = confirmationHash(next, effect, receiptAccessProof);
  effect.confirmation = cloneC2b(receiptAccessProof); effect.disposition = 'Confirmed';
  next.receipt = createdReceipt; next.state = 'Terminal'; next.leaseOwner = null; next.leaseExpiresAt = null;
  next.outcomeAudits.push(audit({ auditKey: `${next.plan.commandKey}|Accepted`, commandKey: next.plan.commandKey,
    outcome: 'Accepted', payloadSha256: next.plan.payloadSha256, planSha256: next.plan.planSha256,
    effectKey: effect.effectKey, safeCode: 'ACCEPTED', safeReason: 'Final image, ACLs, receipt and actor access reconciled.',
    success: true, recordedAt: now }));
  next.journalVersion += 1;
  return next;
}
export interface C2bRecoveryProof {
  outcome: 'Confirmed' | 'NotApplied';
  providerReference: string;
  naturalKey: string;
  requestETag: string | null;
  observedETag: string | null;
  observedRowVersionToken: number | null;
  readback: Readonly<Record<string, unknown>> | null;
}
export interface C2bPostFinaliseRecoveryProof {
  providerReference: string;
  naturalKey: string;
  requestETag: string;
  observedETag: string;
  observedRowVersionToken: number;
  processorEpoch: number;
  beforeFields: Readonly<Record<string, unknown>>;
  readback: Readonly<Record<string, unknown>>;
}
function assertNotAppliedRecovery(journal: C2bCommandJournal, effect: C2bCommandEffect,
  proof: C2bRecoveryProof): void {
  const source = effect.expectedETagFromEffectKey === null ? undefined
    : journal.effects.find(candidate => candidate.effectKey === effect.expectedETagFromEffectKey);
  const expectedRequestETag = source ? source.confirmation?.observedETag : effect.expectedETag;
  if (hashC2bCanonical(proof.readback) !== effect.beforeSha256 || proof.requestETag !== expectedRequestETag
    || proof.observedETag !== expectedRequestETag || proof.observedRowVersionToken !== effect.expectedRowVersionToken)
    return fail('C2b recovery rejected: NotApplied does not match the exact before image/Claim-derived ETag/token.');
}
export function recoverC2bEffect(journal: C2bCommandJournal, effectKey: string, proof: C2bRecoveryProof,
  recordedAt: string, expectedJournalVersion: number): C2bCommandJournal {
  const next = cas(journal, expectedJournalVersion);
  const effect = next.effects.find(candidate => candidate.effectKey === effectKey);
  if (next.state !== 'Held' || next.recoveryHold !== null || !effect || !['Unknown', 'Held'].includes(effect.disposition)
    || !nonBlank(proof.providerReference) || proof.naturalKey !== effect.naturalKey
    || !Number.isFinite(Date.parse(recordedAt)))
    return fail('C2b recovery rejected: independent effect outcome proof is incomplete.');
  if (proof.outcome === 'Confirmed') {
    if (proof.readback === null) return fail('C2b recovery rejected: Confirmed requires exact effect readback.');
    const confirmation: C2bEffectConfirmation = { providerReference: proof.providerReference,
      naturalKey: proof.naturalKey, requestETag: proof.requestETag, observedETag: proof.observedETag,
      observedRowVersionToken: proof.observedRowVersionToken, readback: proof.readback };
    effect.confirmationSha256 = confirmationHash(next, effect, confirmation);
    effect.confirmation = cloneC2b(confirmation); effect.disposition = 'Confirmed';
  } else {
    assertNotAppliedRecovery(next, effect, proof);
    effect.disposition = 'Planned'; effect.confirmation = null; effect.confirmationSha256 = null;
  }
  next.outcomeAudits.push(audit({ auditKey: `${next.plan.commandKey}|Recovery|${effect.sequence}|${next.journalVersion}`,
    commandKey: next.plan.commandKey, outcome: 'Recovery', payloadSha256: next.plan.payloadSha256,
    planSha256: next.plan.planSha256, effectKey: effect.effectKey,
    safeCode: proof.outcome === 'Confirmed' ? 'RECOVERY_CONFIRMED_EXACT' : 'RECOVERY_NOT_APPLIED_EXACT',
    safeReason: 'Held effect was reconciled against its immutable before/desired image.', success: true, recordedAt }));
  next.state = 'Planned'; next.leaseOwner = null; next.leaseExpiresAt = null; next.journalVersion += 1;
  return next;
}

export function recoverC2bPostFinaliseEffect(journal: C2bCommandJournal, effectKey: string,
  effectProof: C2bRecoveryProof & { outcome: 'NotApplied' }, restoreProof: C2bPostFinaliseRecoveryProof,
  owner: string, epoch: number, recordedAt: string, expectedJournalVersion: number): C2bCommandJournal {
  const next = cas(journal, expectedJournalVersion);
  const effect = next.effects.find(candidate => candidate.effectKey === effectKey);
  const hold = next.recoveryHold;
  const expectedHeldFields = expectedPostFinaliseHoldFields(next);
  const finalToken = next.plan.intendedImage.header.fields.RowVersionToken;
  if (next.state !== 'Held' || !effect || !hold || hold.effectKey !== effect.effectKey
    || !['Unknown', 'Held'].includes(effect.disposition) || hold.owner !== owner || hold.leaseEpoch !== epoch
    || hold.evidenceSha256 !== hashC2bCanonical({ effectKey: hold.effectKey, failureOutcome: hold.failureOutcome,
      owner: hold.owner, leaseEpoch: hold.leaseEpoch, safeCode: hold.safeCode, safeReason: hold.safeReason, proof: hold.proof })
    || !nonBlank(effectProof.providerReference) || effectProof.naturalKey !== effect.naturalKey
    || !Number.isFinite(Date.parse(recordedAt)))
    return fail('C2b post-Finalise recovery rejected: exact held effect, owner, epoch and evidence are required.');
  assertNotAppliedRecovery(next, effect, effectProof);
  if (!nonBlank(restoreProof.providerReference) || restoreProof.naturalKey !== next.plan.subjectKey
    || restoreProof.requestETag !== hold.proof.observedETag || !nonBlank(restoreProof.observedETag)
    || restoreProof.observedETag === '*' || restoreProof.processorEpoch !== epoch
    || !Number.isSafeInteger(finalToken) || restoreProof.observedRowVersionToken !== finalToken
    || hashC2bCanonical(restoreProof.beforeFields) !== hashC2bCanonical(expectedHeldFields)
    || hashC2bCanonical(restoreProof.readback) !== hashC2bCanonical(next.plan.intendedImage.header.fields))
    return fail('C2b post-Finalise recovery rejected: exact CAS/epoch-bound Ready restoration readback is required.');
  const stable = next.effects.find(candidate => candidate.kind === 'StableRead');
  next.effects.filter(candidate => candidate.sequence === effect.sequence
    || stable && candidate.sequence >= stable.sequence && candidate.sequence < effect.sequence)
    .forEach(candidate => {
      candidate.disposition = 'Planned'; candidate.confirmation = null; candidate.confirmationSha256 = null;
    });
  next.stableRead = null; next.recoveryHold = null; next.state = 'Planned';
  next.leaseOwner = null; next.leaseExpiresAt = null;
  next.outcomeAudits.push(audit({ auditKey: `${next.plan.commandKey}|Recovery|PostFinalise|${effect.sequence}|${next.journalVersion}`,
    commandKey: next.plan.commandKey, outcome: 'Recovery', payloadSha256: next.plan.payloadSha256,
    planSha256: next.plan.planSha256, effectKey: effect.effectKey, safeCode: 'POST_FINALISE_NOT_APPLIED_RESTORED',
    safeReason: 'Held post-Finalise effect and canonical Ready restoration matched exact CAS, epoch and readback evidence.',
    success: true, recordedAt }));
  next.journalVersion += 1;
  return next;
}
