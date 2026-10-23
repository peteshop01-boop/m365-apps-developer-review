/* eslint-disable @rushstack/no-new-null -- null is the exact unused-chunk and annual-quarter value */
import { EMPLOYEE_V2_PHYSICAL_ASSETS } from '../EmployeeWorkplanV2PhysicalSchema';
import type { C2bListPurpose, C2bTerminalReceipt } from '../TestPilotCommandAdmissionC2b';
import { canonicaliseC2b, hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import type { IC2bNativePlanningObservations, IC2bNativeReceiptProvenance,
  IC2bNativeSourceObservation } from '../EmployeeWorkplanV2C2bNativeAdapter';

export type C2bConvergedListPurpose = C2bListPurpose | 'BehaviourFrameworkSets' | 'BehaviourFrameworkValues'
  | 'PersonBehaviourAssignments' | 'BehaviourObjectiveLibrary' | 'BehaviourFocusCatalogue'
  | 'BehaviourCataloguePublications' | 'ControlCases' | 'TenantProvisioningReceipts';
export const C2B_CONVERGED_TITLES: Readonly<Record<C2bConvergedListPurpose, string>> = Object.freeze({
  People: 'KCFKPI_TEST_People', EmployeeCommands: 'KCFKPI_TEST_EmployeeCommands',
  ManagerCommands: 'KCFKPI_TEST_ManagerCommands', CommandJournal: 'KCFKPI_TEST_CommandJournal',
  CommandEffects: 'KCFKPI_TEST_CommandEffects', CommandReceipts: 'KCFKPI_TEST_CommandReceipts',
  Workplans: 'KCFKPI_TEST_Workplans', WorkplanItems: 'KCFKPI_TEST_WorkplanItems', Audit: 'KCFKPI_TEST_Audit',
  BehaviourFrameworkSets: 'KCFKPI_BehaviourFrameworkSets', BehaviourFrameworkValues: 'KCFKPI_BehaviourFrameworkValues',
  PersonBehaviourAssignments: 'KCFKPI_PersonBehaviourAssignments',
  BehaviourObjectiveLibrary: 'KCFKPI_BehaviourObjectiveLibrary', ControlCases: 'KCFKPI_TEST_ControlCases',
  BehaviourFocusCatalogue: 'KCFKPI_BehaviourFocusCatalogue',
  BehaviourCataloguePublications: 'KCFKPI_BehaviourCataloguePublications',
  TenantProvisioningReceipts: 'KCFKPI_TEST_TenantProvisioningReceipts'
});
export const C2B_TEST_EXTENSION_TITLES = Object.freeze({ QuarterReviews: 'KCFKPI_TEST_QuarterReviews',
  QuarterReviewItems: 'KCFKPI_TEST_QuarterReviewItems' });
export const C2B_TERMINAL_RECEIPT_STORAGE_VERSION = 'kcf.kpi.c2b.terminal-receipt.storage.v1' as const;
export const C2B_CONTROL_CASE_SCHEMA_REVISION = 'c2b-control-case-v1' as const;
export const C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION = 'kcf-wib12-provisioning-receipt-v1' as const;
export const C2B_PROVISIONING_RECEIPT_SCHEMA_REVISION_V2 = 'kcf-wib12-provisioning-receipt-v2' as const;
export const C2B_BEHAVIOUR_FOCUS_SCHEMA_REVISION = 'kcf-behaviour-focus-c2b-v1' as const;
export const C2B_ANNUAL_SELECTION_SCHEMA_REVISION = 'c2b-annual-v3' as const;

// Nullable storage preserves historical rows; trusted annual admission still requires raw metadata and CAS tokens.
type AnnualStorageField = Readonly<{ internalName: string; type: 'Text' | 'Number';
  required: false; indexed: false; unique: false; maxLength?: number;
  decimals?: number; minimum?: number; maximum?: number }>;
export const C2B_ANNUAL_HEADER_FIELDS: readonly AnnualStorageField[] = Object.freeze([
  Object.freeze({ internalName: 'BehaviourContractVersion', type: 'Text', required: false,
    maxLength: 255, indexed: false, unique: false }),
  Object.freeze({ internalName: 'SchemaRevision', type: 'Text', required: false,
    maxLength: 255, indexed: false, unique: false })
]);
export const C2B_ITEM_CONCURRENCY_FIELDS: readonly AnnualStorageField[] = Object.freeze([
  Object.freeze({ internalName: 'RowVersionToken', type: 'Number', required: false,
    decimals: 0, minimum: 1, maximum: Number.MAX_SAFE_INTEGER, indexed: false, unique: false })
]);

type FocusField = Readonly<{ internalName: string; type: 'Text' | 'Note' | 'Number' | 'DateTime';
  required: boolean; indexed: boolean; unique: boolean }>;
const focusField = (internalName: string, type: FocusField['type'], indexed = false,
  required = true, unique = false): FocusField => Object.freeze({ internalName, type, required, indexed, unique });
export const C2B_BEHAVIOUR_FOCUS_ROW_FIELDS: readonly FocusField[] = Object.freeze([
  focusField('CatalogueRowKey', 'Text', true, true, true),
  focusField('CatalogueKey', 'Text', true), focusField('CatalogueVersion', 'Text', true),
  focusField('Revision', 'Number', true), focusField('TargetKey', 'Text', true),
  focusField('BehaviourKey', 'Text', true), focusField('RoleLevelCode', 'Text', true),
  focusField('FocusKey', 'Text', true), focusField('EffectiveStatus', 'Text', true),
  focusField('ContentSha256', 'Text', false), focusField('ContentCanonicalUtf8ByteLength', 'Number'),
  focusField('SortOrder', 'Number'), focusField('FocusArea', 'Note'),
  focusField('SuggestedTarget', 'Note'), focusField('SuggestedMeasure', 'Note'),
  focusField('SuggestedEvidence', 'Note'), focusField('SuggestedUnit', 'Text'),
  focusField('EffectiveFrom', 'DateTime', true), focusField('EffectiveTo', 'DateTime', true, false)
]);
export const C2B_BEHAVIOUR_PUBLICATION_FIELDS: readonly FocusField[] = Object.freeze([
  focusField('PublicationKey', 'Text', true, true, true),
  focusField('CatalogueKey', 'Text', true), focusField('CatalogueVersion', 'Text', true),
  focusField('Revision', 'Number', true), focusField('Sequence', 'Number', true),
  focusField('SchemaVersion', 'Text'), focusField('ApprovalReference', 'Text'),
  focusField('SourcePath', 'Text'), focusField('SourceSha256', 'Text'),
  focusField('SourceRowsCanonicalSha256', 'Text'), focusField('ContentSha256', 'Text'),
  focusField('GeneratedRowsJsonSha256', 'Text'),
  focusField('Result', 'Text', true), focusField('ActorPrincipalKey', 'Text'),
  focusField('ActorEmail', 'Text'), focusField('RowCount', 'Number'),
  focusField('ContentCanonicalUtf8ByteLength', 'Number'), focusField('ActorPrincipalId', 'Number'),
  focusField('EffectiveFrom', 'DateTime', true), focusField('EffectiveTo', 'DateTime', true, false),
  focusField('OccurredAt', 'DateTime'), focusField('PreviousPublicationSha256', 'Text', false, false),
  focusField('RetiresPublicationKey', 'Text', false, false)
]);
export const C2B_BEHAVIOUR_SELECTION_ITEM_FIELDS: readonly FocusField[] = Object.freeze([
  focusField('BehaviourV2SelectionSnapshotsJSON', 'Note'),
  focusField('BehaviourV2SelectionSnapshotsSHA256', 'Text'),
  focusField('BehaviourV2SelectionSnapshotsUtf8ByteLength', 'Number')
]);
export const C2B_PHYSICAL_CHUNK_CODE_UNITS = 60000;
export const C2B_TERMINAL_RECEIPT_CHUNK_COUNT = 8;
export const C2B_PROVISIONING_RECEIPT_CHUNK_COUNT = 16;
const SHA256 = /^[0-9A-F]{64}$/; const nonBlank = (v: unknown): v is string => typeof v === 'string' && !!v.trim();
const fail = (code: string, detail: string): never => { throw new Error(`${code}: ${detail}`); };

export interface IC2bChunkedPhysicalState { stateSha256: string; stateLength: number; chunkCount: number;
  fields: Readonly<Record<string, string | null>>; }
export function encodeC2bPhysicalChunks(value: unknown, prefix: string, maximumChunks: number): IC2bChunkedPhysicalState {
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(prefix) || !Number.isSafeInteger(maximumChunks) || maximumChunks < 1)
    return fail('C2B_PHYSICAL_CHUNK_CONTRACT_INVALID', prefix);
  const canonical = canonicaliseC2b(value); const chunks: string[] = [];
  for (let offset = 0; offset < canonical.length;) {
    let end = Math.min(offset + C2B_PHYSICAL_CHUNK_CODE_UNITS, canonical.length);
    const last = canonical.charCodeAt(end - 1);
    if (end < canonical.length && last >= 0xd800 && last <= 0xdbff) end -= 1;
    chunks.push(canonical.slice(offset, end)); offset = end;
  }
  if (!chunks.length) chunks.push('');
  if (chunks.length > maximumChunks) return fail('C2B_PHYSICAL_CAPACITY_EXCEEDED', prefix);
  const fields: Record<string, string | null> = {};
  for (let i = 0; i < maximumChunks; i += 1)
    fields[`${prefix}${String(i + 1).padStart(2, '0')}`] = chunks[i] === undefined ? null : chunks[i];
  return Object.freeze({ stateSha256: hashC2bCanonical(value), stateLength: canonical.length,
    chunkCount: chunks.length, fields: Object.freeze(fields) });
}
export function decodeC2bPhysicalChunks(row: Readonly<Record<string, unknown>>, prefix: string, countField: string,
  lengthField: string, shaField: string | null, maximumChunks: number): unknown {
  const count = row[countField]; const length = row[lengthField]; const sha = shaField ? row[shaField] : undefined;
  if (!Number.isSafeInteger(count) || Number(count) < 1 || Number(count) > maximumChunks
    || !Number.isSafeInteger(length) || Number(length) < 2
    || (shaField !== null && (!nonBlank(sha) || !SHA256.test(sha.toUpperCase()))))
    return fail('C2B_PHYSICAL_CHUNK_METADATA_INVALID', prefix);
  const chunks: string[] = [];
  for (let i = 0; i < maximumChunks; i += 1) {
    const v = row[`${prefix}${String(i + 1).padStart(2, '0')}`];
    if (i < Number(count)) { if (typeof v !== 'string' || !v.length) return fail('C2B_PHYSICAL_CHUNK_MISSING', prefix); chunks.push(v); }
    else if (v !== null && v !== undefined && v !== '') return fail('C2B_PHYSICAL_EXTRA_CHUNK', prefix);
  }
  const canonical = chunks.join(''); if (canonical.length !== Number(length)) return fail('C2B_PHYSICAL_LENGTH_MISMATCH', prefix);
  let parsed: unknown; try { parsed = JSON.parse(canonical) as unknown; } catch { return fail('C2B_PHYSICAL_JSON_INVALID', prefix); }
  if (canonicaliseC2b(parsed) !== canonical || (shaField !== null && hashC2bCanonical(parsed) !== String(sha).toUpperCase()))
    return fail('C2B_PHYSICAL_DIGEST_MISMATCH', prefix);
  return parsed;
}
const fieldsFor = (title: string): readonly string[] => Object.freeze([...(EMPLOYEE_V2_PHYSICAL_ASSETS
  .find(asset => asset.listTitle === title)?.fieldsUsed || fail('C2B_DIRECT_FIELD_CONTRACT_MISSING', title))]);
export const C2B_DIRECT_PHYSICAL_FIELDS = Object.freeze({ Workplans: fieldsFor('KCFKPI_Workplans'),
  WorkplanItems: fieldsFor('KCFKPI_WorkplanItems'), Audit: fieldsFor('KCFKPI_Audit') });
export const C2B_DIRECT_KEY_FIELDS = Object.freeze({ Workplans: 'WorkplanKey',
  WorkplanItems: 'WorkplanItemNaturalKey', Audit: 'AuditKey' });
export function assertC2bDirectPhysicalFields(purpose: keyof typeof C2B_DIRECT_PHYSICAL_FIELDS,
  fields: Readonly<Record<string, unknown>>): void {
  const allowed = new Set(C2B_DIRECT_PHYSICAL_FIELDS[purpose]); const keys = Object.keys(fields || {});
  if (!keys.length || keys.some(key => !allowed.has(key) || /delete|remove|wildcard/i.test(key)))
    return fail('C2B_DIRECT_FIELD_OUT_OF_CONTRACT', purpose);
}
export interface IC2bTerminalReceiptStorageEnvelope { contractVersion: typeof C2B_TERMINAL_RECEIPT_STORAGE_VERSION;
  receipt: C2bTerminalReceipt; source: IC2bNativeReceiptProvenance['source'];
  command: IC2bNativeReceiptProvenance['command']; actor: IC2bNativeReceiptProvenance['actor'];
  processor: IC2bNativeReceiptProvenance['processor']; }
export function createC2bTerminalReceiptStorageEnvelope(receipt: C2bTerminalReceipt,
  p: IC2bNativeReceiptProvenance): IC2bTerminalReceiptStorageEnvelope {
  const expectedRole: IC2bNativeReceiptProvenance['actor']['effectiveRole'] =
    p.admittedSource.envelope.binding.commandType === 'CreateWorkplanAmendmentV2' ? 'SystemAdmin'
      : p.admittedSource.route === 'Manager' ? 'Manager' : 'Employee';
  const expectedActorSource = expectedRole === 'Employee' ? 'Employee' : expectedRole === 'Manager' ? 'Manager' : 'Admin';
  const actorAccess = receipt?.actorAccess;
  const allowed = Array.isArray(actorAccess?.allowedPrincipals) ? actorAccess.allowedPrincipals : [];
  const actorGrants = allowed.filter(grant => grant.permission === 'Read' && grant.source === expectedActorSource);
  const processorGrants = allowed.filter(grant => grant.permission === 'FullControl' && grant.source === 'Processor');
  if (!receipt || receipt.receiptKey !== receipt.commandKey || p.source.listId !== p.admittedSource.source.listId
    || p.source.itemId !== p.admittedSource.source.itemId || p.source.itemVersion !== p.admittedSource.source.itemVersion
    || p.source.sourceETag !== p.admittedSource.sourceETag
    || p.command.commandType !== p.admittedSource.envelope.binding.commandType
    || p.command.subjectType !== p.admittedSource.envelope.binding.subjectType
    || p.command.subjectKey !== p.admittedSource.envelope.binding.subjectKey
    || p.command.personKey !== p.admittedSource.envelope.binding.personKey
    || p.command.performanceYear !== p.admittedSource.envelope.binding.performanceYear || p.command.quarter !== null
    || expectedRole !== p.actor.effectiveRole || p.admittedSource.route === 'Employee' && expectedRole !== 'Employee'
    || p.admittedSource.route === 'Manager' && expectedRole === 'Employee'
    || p.actor.email.trim().toLowerCase() !== p.admittedSource.authorEmail.trim().toLowerCase()
    || !actorAccess || actorAccess.receiptKey !== receipt.receiptKey || actorAccess.breaksInheritance !== true
    || !Array.isArray(actorAccess.revokedPrincipalKeys) || actorAccess.revokedPrincipalKeys.length !== 0 || allowed.length !== 2
    || actorGrants.length !== 1 || actorGrants[0].principalKey !== p.actor.personKey
    || processorGrants.length !== 1 || processorGrants[0].principalKey !== p.processor.principalKey
    || expectedRole === 'Employee' && p.actor.personKey !== p.command.personKey
    || expectedRole !== 'Employee' && p.actor.personKey === p.command.personKey
    || !nonBlank(p.processor.email) || !nonBlank(p.processor.principalKey) || !nonBlank(p.processor.flowRunReference)
    || p.processor.flowRunReference !== receipt.processorReference
    || p.processor.completedAt !== receipt.completedAt || !Number.isFinite(Date.parse(p.processor.completedAt)))
    return fail('C2B_TERMINAL_RECEIPT_PROVENANCE_INVALID', receipt?.receiptKey || 'absent');
  return Object.freeze({ contractVersion: C2B_TERMINAL_RECEIPT_STORAGE_VERSION,
    receipt: JSON.parse(canonicaliseC2b(receipt)) as C2bTerminalReceipt, source: { ...p.source },
    command: { ...p.command }, actor: { ...p.actor }, processor: { ...p.processor } });
}
const REQUIRED = ['employee', 'manager', 'actor', 'configuration', 'allItems', 'currentAcls', 'controlCases'] as const;
const OPTIONAL = ['header', 'currentItem', 'readiness', 'behaviourV2', 'catalogueItem', 'allocatedItemKey'] as const;
export function assertStableC2bPlanningProjection(first: IC2bNativePlanningObservations,
  second: IC2bNativePlanningObservations, source: IC2bNativeSourceObservation): IC2bNativePlanningObservations {
  const validate = (v: IC2bNativePlanningObservations): void => {
    const keys = Object.keys(v as unknown as Record<string, unknown>); const allowed = new Set<string>([...REQUIRED, ...OPTIONAL]);
    if (REQUIRED.some(k => !Object.prototype.hasOwnProperty.call(v, k)) || keys.some(k => !allowed.has(k))
      || !Array.isArray(v.allItems) || !Array.isArray(v.currentAcls) || !Array.isArray(v.controlCases))
      return fail('C2B_PLANNING_PROJECTION_SHAPE_INVALID', 'keys');
    const b = source.envelope.binding;
    if (v.employee.personKey !== b.personKey || v.configuration.performanceYear !== b.performanceYear
      || v.actor.email.trim().toLowerCase() !== source.authorEmail.trim().toLowerCase()
      || v.employee.managerPersonKey !== v.manager.personKey
      || (v.employee.managerEmail || '').trim().toLowerCase() !== v.manager.email.trim().toLowerCase())
      return fail('C2B_PLANNING_PROJECTION_CROSSED', 'identity');
    const itemKeys = v.allItems.map(i => i.workplanItemNaturalKey);
    if (new Set(itemKeys).size !== itemKeys.length || canonicaliseC2b(itemKeys) !== canonicaliseC2b([...itemKeys].sort())
      || v.allItems.some(i => i.personKey !== b.personKey || i.performanceYear !== b.performanceYear
        || i.workplanKey !== b.workplanKey || !nonBlank(i.etag) || i.etag === '*'))
      return fail('C2B_PLANNING_ITEMS_INVALID', 'complete set');
    if (b.commandType === 'CreateWorkplanAmendmentV2') {
      const ref = (source.envelope.payload as { controlReference?: unknown }).controlReference;
      if (!nonBlank(ref) || v.controlCases.length !== 1 || v.controlCases[0].controlCaseKey !== ref)
        return fail('C2B_PLANNING_CONTROL_CASE_INVALID', 'route');
    } else if (v.controlCases.length) return fail('C2B_PLANNING_CONTROL_CASE_CROSSED', 'route');
    if (source.envelope.expected.item.presence === 'Absent') {
      if (v.allocatedItemKey !== b.subjectKey || v.allItems.some(i => i.workplanItemNaturalKey === b.subjectKey))
        return fail('C2B_PLANNING_ALLOCATED_KEY_INVALID', b.subjectKey);
    } else if (v.allocatedItemKey !== undefined) return fail('C2B_PLANNING_ALLOCATED_KEY_CROSSED', b.subjectKey);
    if (v.currentItem && !v.allItems.some(i => canonicaliseC2b(i) === canonicaliseC2b(v.currentItem)))
      return fail('C2B_PLANNING_CURRENT_ITEM_INVALID', b.subjectKey);
    if (v.behaviourV2 && (v.behaviourV2.framework.values.length !== 5
      || v.behaviourV2.assignment.personKey !== b.personKey
      || (v.configuration.schemaRevision === 'c2b-annual-v3'
        ? !v.behaviourV2.focusCatalogue?.complete
          || v.behaviourV2.focusCatalogue.rowCount !== v.behaviourV2.focusCatalogue.rows.length
        : v.behaviourV2.catalogue?.records.length !== 75))) {
      return fail('C2B_PLANNING_BEHAVIOUR_INCOMPLETE', b.personKey);
    }
  };
  validate(first); validate(second);
  if (canonicaliseC2b(first) !== canonicaliseC2b(second)) return fail('C2B_PLANNING_TOCTOU', 'projection changed');
  return JSON.parse(canonicaliseC2b(first)) as IC2bNativePlanningObservations;
}
