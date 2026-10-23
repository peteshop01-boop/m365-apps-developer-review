/* eslint-disable @rushstack/no-new-null -- null is the explicit unbound/absent receipt state */
/* eslint-disable require-atomic-updates -- each receipt is invocation-local and execution is deliberately serial */
import { canonicaliseC2b, hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';
import { BEHAVIOUR_V2_RATING_OPTIONS } from '../BehaviourFrameworkV2Policy';
import { assertKcfAutomationTenantTarget, type ITenantTargetEvidence } from './TenantTargetClassification';
import { immutableTenantInput } from './ImmutableTenantInput';

export type TenantFieldType = 'Text' | 'Note' | 'Boolean' | 'Date' | 'Choice' | 'Number';

export interface ITenantFieldDefinition {
  internalName: string;
  type: TenantFieldType;
  required: boolean;
  indexed: boolean;
  unique: boolean;
  maxLength?: number;
  defaultValue?: boolean;
  dateOnly?: boolean;
  utcNormalisedInput?: boolean;
  choices?: readonly string[];
  fillInChoice?: boolean;
  plainText?: boolean;
  appendOnly?: boolean;
  versionHistory?: boolean;
  decimals?: number;
  minimum?: number;
  maximum?: number;
}

export interface ITenantListDefinition {
  purpose: string;
  title: string;
  schemaRevision: string;
  createIfMissing: boolean;
  description?: string;
  stableKey: string;
  baseTemplate: 100;
  titleRequired: false;
  majorVersioningEnabled: true;
  foldersEnabled: false;
  fields: readonly ITenantFieldDefinition[];
  /** Existing canonical key fields that are validated but never provisioned by this packet. */
  requiredExistingFields?: readonly ITenantFieldDefinition[];
  /** Reject every additional custom/Product field. Used by the governed 16-field catalogue. */
  exactCustomFieldSet?: boolean;
  permissionCapability?: 'PrivateProcessorOnly';
}

export interface IBehaviourV2TenantSchema {
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v1';
  schemaRevision: 'kcf-behaviour-v2-tenant-1';
  operationPolicy: {
    modeDefault: 'DryRun';
    applyRequiresExplicitEnable: true;
    addOnly: true;
    overwriteAllowed: false;
    deleteAllowed: false;
    stableKeyImport: true;
    exactReadbackRequired: true;
  };
  lists: readonly ITenantListDefinition[];
}

export interface ITenantFieldObservation extends ITenantFieldDefinition {}

export interface ITenantRowObservation {
  itemId: number;
  etag: string;
  version: string;
  fields: Readonly<Record<string, unknown>>;
}

export interface ITenantListObservation {
  purpose: string;
  title: string;
  listId: string;
  schemaRevision: string;
  baseTemplate: number;
  titleRequired: boolean;
  majorVersioningEnabled: boolean;
  foldersEnabled: boolean;
  fields: readonly ITenantFieldObservation[];
  rows: readonly ITenantRowObservation[];
  pagingComplete: boolean;
  permissionCapability?: 'PrivateProcessorOnly' | 'Inherited' | 'Unknown';
}

export interface ITenantProvisioningSnapshot {
  targetEvidence: ITenantTargetEvidence;
  bindings: readonly ITenantProvisioningListBinding[];
  lists: readonly ITenantListObservation[];
  productionReferenceObserved: boolean;
  activeOldFlowObserved: boolean;
}

export interface ITenantProvisioningListBinding {
  purpose: string;
  title: string;
  listId: string | null;
  schemaRevision: string;
}

export interface IBehaviourV2ProductDataPacket {
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v1';
  approvalReference: string | null;
  dateBoundaryRule: string | null;
  frameworkSets: readonly Readonly<Record<string, unknown>>[];
  frameworkValues: readonly Readonly<Record<string, unknown>>[];
  personAssignments: readonly Readonly<Record<string, unknown>>[];
  behaviourObjectiveLibrary: readonly Readonly<Record<string, unknown>>[];
  peopleBindings: readonly Readonly<Record<string, unknown>>[];
  historicEvidence: readonly Readonly<Record<string, unknown>>[];
  roleLevelBindings: readonly Readonly<Record<string, unknown>>[];
  principalBindings: readonly Readonly<Record<string, unknown>>[];
  positiveActors: readonly string[];
  negativeActors: readonly string[];
  fixtureRange: string | null;
  fixtureAuthorityReference: string | null;
  catalogueBinding: {
    frameworkVersion: string;
    canonicalDigestSha256: string;
  } | null;
}

export interface IBehaviourV2RoleLevelAuthority {
  authorityReference: string;
  roleLevelNames: Readonly<{ L1: string; L2: string; L3: string }>;
  schemaAuthority: {
    authorityReference: string;
    schemaSha256: string;
    listInventorySha256: string;
  };
  productAuthority: {
    authorityReference: string | null;
    productDataSha256: string;
    frameworkVersion: string | null;
    catalogueDigestSha256: string | null;
    fixtureRange: string | null;
    actorPrincipalMapSha256: string;
    historicEvidenceReferences: readonly string[];
  };
}

export type TenantProvisioningOperation = {
  sequence: number;
  kind: 'AddList';
  purpose: string;
  listTitle: string;
  expectedBefore: 'Absent';
  definitionSha256: string;
} | {
  sequence: number;
  kind: 'SetPrivateListAcl';
  purpose: string;
  listTitle: string;
  listId: string | null;
  expectedBefore: 'Inherited';
  definitionSha256: string;
} | {
  sequence: number;
  kind: 'AddField';
  purpose: string;
  listTitle: string;
  listId: string | null;
  field: string;
  expectedBefore: 'Absent';
  definitionSha256: string;
} | {
  sequence: number;
  kind: 'InsertRow';
  purpose: string;
  listTitle: string;
  listId: string;
  keyField: string;
  stableKey: string;
  expectedBefore: 'Absent';
  rowSha256: string;
};

export interface ITenantProvisioningPlan {
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v1';
  mode: 'DryRun' | 'Apply';
  deploymentClassification: 'NonProduction';
  platformEnvironmentType: 'Default';
  targetEvidenceSha256: string;
  schemaSha256: string;
  productDataSha256: string;
  roleLevelAuthoritySha256: string | null;
  beforeStateSha256: string;
  operations: readonly TenantProvisioningOperation[];
  noOpAssets: readonly string[];
  planSha256: string;
}

export interface ITenantOperationConfirmation {
  sequence: number;
  kind: TenantProvisioningOperation['kind'];
  operationSha256: string;
  providerReference: string;
  readbackSha256: string;
  created: true;
  outcome: 'Confirmed' | 'ReplayConfirmed';
}

export interface ITenantRollbackEntry {
  reverseSequence: number;
  operationSequence: number;
  operationSha256: string;
  kind: 'RecycleCreatedList' | 'RecycleCreatedRow' | 'LeaveAddOnlyField' | 'RestorePrivateListAcl';
  providerReference: string;
  protectedPreExistingAsset: boolean;
  requiresExplicitRollbackAuthority: true;
}

export interface ITenantProvisioningReceipt {
  contractVersion: 'kcf.kpi.wib12.tenant-layer.v1';
  receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1';
  revision: number;
  previousReceiptSha256: string | null;
  receiptSha256: string;
  mode: 'DryRun' | 'Apply';
  applyExplicitlyEnabled: boolean;
  receiptKey: string;
  status: 'InProgress' | 'Completed' | 'BlockedOff';
  stopCode: string | null;
  unknownOperation: { sequence: number; kind: TenantProvisioningOperation['kind'];
    purpose: string; safeCode: string; recoveryOutcome: 'Applied' | 'PartiallyApplied' | 'NotApplied' | 'StillUnknown' | null;
    providerReference: string | null; readbackSha256: string | null } | null;
  pendingOperation: { sequence: number; kind: TenantProvisioningOperation['kind']; purpose: string } | null;
  startedAt: string;
  completedAt: string;
  planSha256: string;
  plan: ITenantProvisioningPlan;
  beforeStateSha256: string;
  afterStateSha256: string | null;
  confirmations: readonly ITenantOperationConfirmation[];
  rollback: {
    requiredFirstAction: 'TurnNewFlowOff';
    flowMustRemainOff: true;
    entries: readonly ITenantRollbackEntry[];
    ambiguityOutcome: 'BLOCKED_OFF';
  };
}

export interface ITenantProvisioningReceiptAuthority {
  contractVersion: 'kcf.kpi.wib12.receipt-authority.v1';
  authorityReference: string;
  receiptListId: string;
  receiptListTitle: string;
  schemaRevision: string;
  baseTemplate: 100;
  majorVersioningEnabled: true;
  foldersEnabled: false;
  keyField: string;
  seriesKeyField: 'ReceiptKey';
  chunkPrefix: 'ReceiptChunk';
  chunkCount: 16;
  maximumCodeUnits: 960000;
  fieldInventory: readonly Readonly<Pick<ITenantFieldObservation,
    'internalName' | 'type' | 'required' | 'indexed' | 'unique' | 'maxLength' | 'plainText' | 'appendOnly' |
    'versionHistory' | 'choices' | 'fillInChoice' | 'decimals' | 'minimum' | 'maximum'>>[];
  fieldInventorySha256: string;
  writerPrincipalKey: string;
  writerPrincipalId: number;
}

export interface ITenantAuthenticatedReceiptRevisionEvidence {
  revision: number;
  receiptSha256: string;
  itemId: number;
  itemVersion: string;
  etag: string;
  authorPrincipalId: number;
  editorPrincipalId: number;
}

export interface ITenantAuthenticatedReceiptChain {
  receiptListId: string;
  receiptListTitle: string;
  schemaRevision: string;
  fieldInventorySha256: string;
  writerPrincipalKey: string;
  writerPrincipalId: number;
  itemId: number;
  itemVersion: string;
  etag: string;
  revisionEvidence: readonly ITenantAuthenticatedReceiptRevisionEvidence[];
  revisions: readonly ITenantProvisioningReceipt[];
}

export type TenantProvisioningMutationResult = {
  outcome: 'Confirmed';
  providerReference: string;
  listId?: string;
  readbackSha256: string;
} | {
  outcome: 'Unknown';
  safeCode: 'TIMEOUT_UNKNOWN' | 'PROVIDER_UNKNOWN' | 'CONNECTION_INTERRUPTED' | 'RACE_COLLISION';
};

export type TenantProvisioningRecoveryResult = {
  outcome: 'Applied';
  providerReference: string;
  listId?: string;
  readbackSha256: string;
} | {
  outcome: 'PartiallyApplied';
  providerReference: string;
  readbackSha256: string;
  safeCode: string;
} | {
  outcome: 'NotApplied';
} | {
  outcome: 'StillUnknown';
  safeCode: string;
};

export interface IBehaviourV2TenantProvisioningClient {
  observe(): Promise<ITenantProvisioningSnapshot>;
  addList(definition: ITenantListDefinition): Promise<TenantProvisioningMutationResult>;
  reconcilePrivateListAcl(listId: string, definition: ITenantListDefinition): Promise<TenantProvisioningMutationResult>;
  addField(listId: string, definition: ITenantFieldDefinition): Promise<TenantProvisioningMutationResult>;
  insertRow(listId: string, stableKeyField: string, row: Readonly<Record<string, unknown>>):
    Promise<TenantProvisioningMutationResult>;
  recoverOperation(operation: TenantProvisioningOperation, definition: ITenantListDefinition,
    row?: Readonly<Record<string, unknown>>): Promise<TenantProvisioningRecoveryResult>;
  persistReceipt(receipt: ITenantProvisioningReceipt): Promise<{ providerReference: string; readbackSha256: string }>;
  readReceiptChain(receiptKey: string): Promise<ITenantAuthenticatedReceiptChain | undefined>;
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const nonBlank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const normalGuid = (value: string): string => value.replace(/[{}]/g, '').trim().toLowerCase();
const fail = (code: string, detail: string): never => { throw new Error(`${code}: ${detail}`); };

const exactSet = (left: readonly string[] | undefined, right: readonly string[] | undefined): boolean => {
  const a = [...(left || [])].sort();
  const b = [...(right || [])].sort();
  return canonicaliseC2b(a) === canonicaliseC2b(b);
};

function fieldMismatches(expected: ITenantFieldDefinition, actual: ITenantFieldObservation): string[] {
  const mismatches: string[] = [];
  const equal = (key: keyof ITenantFieldDefinition): void => {
    if ((expected[key] ?? null) !== (actual[key] ?? null)) mismatches.push(String(key));
  };
  ['type', 'required', 'indexed', 'unique', 'maxLength', 'defaultValue', 'dateOnly', 'utcNormalisedInput',
    'fillInChoice', 'plainText', 'appendOnly', 'versionHistory', 'decimals', 'minimum', 'maximum']
    .forEach(key => equal(key as keyof ITenantFieldDefinition));
  if (!exactSet(expected.choices, actual.choices)) mismatches.push('choices');
  return mismatches;
}

function assertSchema(schema: IBehaviourV2TenantSchema): void {
  if (schema.contractVersion !== 'kcf.kpi.wib12.tenant-layer.v1'
    || schema.schemaRevision !== 'kcf-behaviour-v2-tenant-1'
    || schema.operationPolicy.modeDefault !== 'DryRun' || !schema.operationPolicy.applyRequiresExplicitEnable
    || !schema.operationPolicy.addOnly || schema.operationPolicy.overwriteAllowed || schema.operationPolicy.deleteAllowed
    || !schema.operationPolicy.stableKeyImport || !schema.operationPolicy.exactReadbackRequired) {
    fail('TENANT_SCHEMA_POLICY_INVALID', 'The tenant schema must remain deterministic, add-only and disabled by default.');
  }
  const purposes = schema.lists.map(list => list.purpose);
  const titles = schema.lists.map(list => list.title);
  if (new Set(purposes).size !== purposes.length || new Set(titles).size !== titles.length)
    fail('TENANT_SCHEMA_DUPLICATE_LIST', 'List purposes and titles must be unique.');
  for (const list of schema.lists) {
    if (list.baseTemplate !== 100 || list.titleRequired || !list.majorVersioningEnabled || list.foldersEnabled)
      fail('TENANT_SCHEMA_LIST_SETTINGS', `${list.title} does not use the reviewed list settings.`);
    const isolated = list.purpose === 'ControlCases' || list.purpose === 'TenantProvisioningReceipts';
    if (isolated !== (list.permissionCapability === 'PrivateProcessorOnly'))
      fail('TENANT_SCHEMA_PERMISSION_CAPABILITY_INVALID', `${list.title} has no exact processor-private permission contract.`);
    const fields = [...list.fields, ...(list.requiredExistingFields || [])].map(field => field.internalName);
    if (!nonBlank(list.schemaRevision) || !nonBlank(list.stableKey) || new Set(fields).size !== fields.length
      || list.createIfMissing && (list.requiredExistingFields?.length || 0) > 0
      || !list.createIfMissing && !fields.includes(list.stableKey))
      fail('TENANT_SCHEMA_FIELD_DUPLICATE', `${list.title} has a missing stable key or duplicate field.`);
    if (list.purpose === 'BehaviourObjectiveLibrary'
      && (!list.exactCustomFieldSet || list.fields.length !== 16)) {
      fail('TENANT_CATALOGUE_SCHEMA_INVALID', 'The governed catalogue must remain the exact reviewed 16-field contract.');
    }
  }
}

function assertIndependentAuthorities(schema: IBehaviourV2TenantSchema, packet: IBehaviourV2ProductDataPacket,
  authority?: IBehaviourV2RoleLevelAuthority): IBehaviourV2RoleLevelAuthority {
  const governed = authority || fail('TENANT_INDEPENDENT_AUTHORITY_ABSENT',
    'Separate immutable schema and Product authorities are required, including for an empty packet.');
  const frameworkVersion = packet.frameworkSets.length ? String(packet.frameworkSets[0].FrameworkVersion || '') : null;
  const catalogueDigest = packet.catalogueBinding?.canonicalDigestSha256 || null;
  const principalMap = packet.principalBindings.map(row => ({ personKey: row.personKey,
    assignmentKey: row.assignmentKey, principalKey: row.principalKey, category: row.category })).sort((left, right) =>
    String(left.personKey).localeCompare(String(right.personKey)));
  const historyReferences = packet.historicEvidence.map(row => String(row.reference || '')).sort();
  if (!nonBlank(governed.authorityReference) || !governed.schemaAuthority || !governed.productAuthority
    || !nonBlank(governed.schemaAuthority.authorityReference)
    || governed.schemaAuthority.schemaSha256.toUpperCase() !== hashC2bCanonical(schema)
    || governed.schemaAuthority.listInventorySha256.toUpperCase() !== hashC2bCanonical(schema.lists)
    || governed.productAuthority.authorityReference !== packet.approvalReference
    || governed.productAuthority.productDataSha256.toUpperCase() !== hashC2bCanonical(packet)
    || governed.productAuthority.frameworkVersion !== frameworkVersion
    || governed.productAuthority.catalogueDigestSha256 !== catalogueDigest
    || governed.productAuthority.fixtureRange !== packet.fixtureRange
    || governed.productAuthority.actorPrincipalMapSha256.toUpperCase() !== hashC2bCanonical(principalMap)
    || canonicaliseC2b([...governed.productAuthority.historicEvidenceReferences].sort())
      !== canonicaliseC2b(historyReferences)) {
    fail('TENANT_INDEPENDENT_AUTHORITY_MISMATCH',
      'Schema inventory or Product framework/catalogue/fixture/actor/history identity is outside authority.');
  }
  return governed;
}

function dataRowsForPurpose(packet: IBehaviourV2ProductDataPacket, purpose: string): readonly Readonly<Record<string, unknown>>[] {
  if (purpose === 'BehaviourFrameworkSets') return packet.frameworkSets;
  if (purpose === 'BehaviourFrameworkValues') return packet.frameworkValues;
  if (purpose === 'PersonBehaviourAssignments') return packet.personAssignments;
  if (purpose === 'BehaviourObjectiveLibrary') return packet.behaviourObjectiveLibrary;
  if (purpose === 'People') return packet.peopleBindings;
  return [];
}

function exactRow(row: Readonly<Record<string, unknown>>, fields: readonly string[], code: string): void {
  const keys = Object.keys(row).sort();
  const expected = [...fields].sort();
  if (canonicaliseC2b(keys) !== canonicaliseC2b(expected))
    fail(code, `Expected only ${expected.join(', ')}.`);
}

function requiredText(value: unknown, code: string): string {
  if (!nonBlank(value)) fail(code, 'A required text value is absent.');
  return String(value).trim();
}

function dateOnly(value: unknown, optional: boolean, code: string): string | null {
  if ((value === null || value === undefined || value === '') && optional) return null;
  const result = requiredText(value, code);
  const parts = result.split('-').map(Number);
  const parsed = DATE_ONLY.test(result) ? new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])) : null;
  if (!parsed || parsed.getUTCFullYear() !== parts[0] || parsed.getUTCMonth() !== parts[1] - 1
    || parsed.getUTCDate() !== parts[2])
    fail(code, `${result} is not an exact UTC-normalised date-only value.`);
  return result;
}

function assertHistoricEvidence(rows: readonly Readonly<Record<string, unknown>>[], context: {
  frameworkVersion: string; approvalReference: string; catalogueDigestSha256: string;
  assignments: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  principals: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
}): void {
  if (!rows.length) fail('TENANT_HISTORIC_EVIDENCE_ABSENT', 'Historic proof or an explicit blocked statement is required.');
  for (const row of rows) {
    const status = row.status;
    if (status === 'Blocked') {
      exactRow(row, ['status', 'reference', 'reason', 'frameworkVersion', 'approvalReference'],
        'TENANT_HISTORIC_EVIDENCE_INVALID');
      requiredText(row.reference, 'TENANT_HISTORIC_EVIDENCE_INVALID');
      requiredText(row.reason, 'TENANT_HISTORIC_EVIDENCE_INVALID');
      if (row.frameworkVersion !== context.frameworkVersion || row.approvalReference !== context.approvalReference)
        fail('TENANT_HISTORIC_EVIDENCE_INVALID', 'Blocked historic evidence is crossed from its approved framework.');
    } else if (status === 'Proven') {
      exactRow(row, ['status', 'reference', 'workplanKey', 'quarterReviewKey', 'itemKey', 'storedSnapshotsSha256',
        'frameworkVersion', 'personKey', 'assignmentKey', 'principalKey', 'catalogueDigestSha256'],
        'TENANT_HISTORIC_EVIDENCE_INVALID');
      ['reference', 'workplanKey', 'quarterReviewKey', 'itemKey', 'personKey', 'assignmentKey', 'principalKey']
        .forEach(field => requiredText(row[field], 'TENANT_HISTORIC_EVIDENCE_INVALID'));
      if (!SHA256.test(requiredText(row.storedSnapshotsSha256, 'TENANT_HISTORIC_EVIDENCE_INVALID')))
        fail('TENANT_HISTORIC_EVIDENCE_INVALID', 'The stored historic snapshot digest is not exact.');
      const assignment = context.assignments.get(String(row.personKey));
      const principal = context.principals.get(String(row.personKey));
      if (!assignment || !principal || row.assignmentKey !== assignment.AssignmentKey
        || row.principalKey !== principal.principalKey || row.frameworkVersion !== context.frameworkVersion
        || row.catalogueDigestSha256 !== context.catalogueDigestSha256) {
        fail('TENANT_HISTORIC_EVIDENCE_INVALID', 'Historic proof is crossed from People, assignment, principal or catalogue identity.');
      }
    } else fail('TENANT_HISTORIC_EVIDENCE_INVALID', 'Historic status must be Proven or Blocked.');
  }
}

function assertProductData(
  packet: IBehaviourV2ProductDataPacket,
  roleLevelAuthority?: IBehaviourV2RoleLevelAuthority
): void {
  if (packet.contractVersion !== 'kcf.kpi.wib12.tenant-layer.v1')
    fail('TENANT_PRODUCT_PACKET_VERSION', 'The Product-data contract version is not exact.');
  const allRows = [packet.frameworkSets, packet.frameworkValues, packet.personAssignments,
    packet.behaviourObjectiveLibrary, packet.peopleBindings].flat();
  if (!allRows.length) {
    if (packet.approvalReference !== null || packet.dateBoundaryRule !== null || packet.catalogueBinding !== null
      || packet.historicEvidence.length || packet.positiveActors.length || packet.negativeActors.length
      || packet.roleLevelBindings.length || packet.principalBindings.length
      || packet.fixtureRange !== null || packet.fixtureAuthorityReference !== null) {
      fail('TENANT_EMPTY_PRODUCT_PACKET_MIXED', 'The empty template may not carry partial Product authority or fixtures.');
    }
    return;
  }
  if (!nonBlank(packet.approvalReference) || !nonBlank(packet.dateBoundaryRule))
    fail('TENANT_PRODUCT_APPROVAL_ABSENT', 'Non-empty Product data requires approval and date-boundary references.');
  if (packet.frameworkSets.length !== 1) fail('TENANT_FRAMEWORK_ENVELOPE_INVALID', 'Exactly one framework row is required.');
  const framework = packet.frameworkSets[0];
  exactRow(framework, ['FrameworkVersion', 'Published', 'Immutable', 'Current', 'ProductionSafe', 'Synthetic',
    'EffectiveFrom', 'EffectiveTo', 'RatingLabelsJSON', 'ApprovalReference'], 'TENANT_FRAMEWORK_FIELDS_INVALID');
  const frameworkVersion = requiredText(framework.FrameworkVersion, 'TENANT_FRAMEWORK_ENVELOPE_INVALID');
  const effectiveFrom = dateOnly(framework.EffectiveFrom, false, 'TENANT_FRAMEWORK_DATE_INVALID')!;
  const effectiveTo = dateOnly(framework.EffectiveTo, true, 'TENANT_FRAMEWORK_DATE_INVALID');
  let ratingLabels: unknown;
  try { ratingLabels = JSON.parse(requiredText(framework.RatingLabelsJSON, 'TENANT_FRAMEWORK_RATINGS_INVALID')) as unknown; }
  catch { fail('TENANT_FRAMEWORK_RATINGS_INVALID', 'RatingLabelsJSON is not valid JSON.'); }
  if (framework.Published !== true || framework.Immutable !== true || framework.Current !== true
    || framework.ProductionSafe !== true || framework.Synthetic !== false
    || framework.ApprovalReference !== packet.approvalReference
    || effectiveTo !== null && effectiveTo < effectiveFrom
    || canonicaliseC2b(ratingLabels) !== canonicaliseC2b(BEHAVIOUR_V2_RATING_OPTIONS)) {
    fail('TENANT_FRAMEWORK_ENVELOPE_INVALID', 'The bounded positive packet requires one approved current non-synthetic framework.');
  }
  if (packet.frameworkValues.length !== 5)
    fail('TENANT_FRAMEWORK_VALUE_COUNT', 'Exactly five framework Value rows are required.');
  const valueIds = packet.frameworkValues.map(row => {
    exactRow(row, ['FrameworkValueKey', 'FrameworkVersion', 'ValueID', 'ValueTitle', 'CorporateValue',
      'ICOfficerDescriptor', 'PeopleManagerDescriptor', 'SeniorLeaderDescriptor'], 'TENANT_FRAMEWORK_VALUE_FIELDS');
    const valueId = requiredText(row.ValueID, 'TENANT_FRAMEWORK_VALUE_KEYS');
    if (row.FrameworkVersion !== frameworkVersion || row.FrameworkValueKey !== `${frameworkVersion}|${valueId}`)
      fail('TENANT_FRAMEWORK_VALUE_COMPOSITE_KEY', 'Framework Value composite identity is crossed.');
    ['ValueTitle', 'CorporateValue', 'ICOfficerDescriptor', 'PeopleManagerDescriptor', 'SeniorLeaderDescriptor']
      .forEach(field => requiredText(row[field], 'TENANT_FRAMEWORK_VALUE_FIELDS'));
    return valueId;
  });
  if (new Set(valueIds).size !== 5 || ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'].some(id => !valueIds.includes(id)))
    fail('TENANT_FRAMEWORK_VALUE_KEYS', 'Framework Value IDs must be exactly BHV-01 through BHV-05.');
  if (!packet.personAssignments.length || !packet.peopleBindings.length)
    fail('TENANT_ASSIGNMENT_ABSENT', 'At least one exact tested-person assignment and People binding is required.');
  const activeAssignments = new Map<string, Readonly<Record<string, unknown>>>();
  const assignmentKeys = new Set<string>();
  for (const row of packet.personAssignments) {
    exactRow(row, ['AssignmentKey', 'PersonKey', 'FrameworkVersion', 'RoleTier', 'Cadence', 'PeriodKeysJSON', 'Active'],
      'TENANT_ASSIGNMENT_FIELDS_INVALID');
    const personKey = requiredText(row.PersonKey, 'TENANT_ASSIGNMENT_INVALID');
    if (row.AssignmentKey !== `${personKey}|${frameworkVersion}` || row.FrameworkVersion !== frameworkVersion
      || !['IC_OFFICER', 'PEOPLE_MANAGER', 'SENIOR_LEADER'].includes(String(row.RoleTier))
      || !['Quarterly', 'TwiceYearly'].includes(String(row.Cadence)) || typeof row.Active !== 'boolean') {
      fail('TENANT_ASSIGNMENT_INVALID', 'Assignment key, framework, tier, cadence or Active state is invalid.');
    }
    let periods: unknown;
    try { periods = JSON.parse(requiredText(row.PeriodKeysJSON, 'TENANT_ASSIGNMENT_PERIODS_INVALID')) as unknown; }
    catch { fail('TENANT_ASSIGNMENT_PERIODS_INVALID', 'PeriodKeysJSON is not valid JSON.'); }
    const expectedPeriods = row.Cadence === 'Quarterly' ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['H1', 'H2'];
    if (canonicaliseC2b(periods) !== canonicaliseC2b(expectedPeriods) || assignmentKeys.has(String(row.AssignmentKey)))
      fail('TENANT_ASSIGNMENT_PERIODS_INVALID', 'Assignment periods or stable-key uniqueness is invalid.');
    assignmentKeys.add(String(row.AssignmentKey));
    if (row.Active === true) {
      if (activeAssignments.has(personKey)) fail('TENANT_ASSIGNMENT_ACTIVE_DUPLICATE', `${personKey} has multiple active assignments.`);
      activeAssignments.set(personKey, row);
    }
  }
  const peopleKeys = new Set<string>();
  for (const row of packet.peopleBindings) {
    exactRow(row, ['PersonKey', 'BehaviourFrameworkVersionV2', 'BehaviourRoleTierV2', 'BehaviourCadenceV2'],
      'TENANT_PEOPLE_BINDING_FIELDS_INVALID');
    const personKey = requiredText(row.PersonKey, 'TENANT_PEOPLE_BINDING_INVALID');
    const assignment = activeAssignments.get(personKey);
    if (!assignment || peopleKeys.has(personKey) || row.BehaviourFrameworkVersionV2 !== frameworkVersion
      || row.BehaviourRoleTierV2 !== assignment.RoleTier || row.BehaviourCadenceV2 !== assignment.Cadence) {
      fail('TENANT_PEOPLE_BINDING_INVALID', 'People binding does not exactly match one active assignment.');
    }
    peopleKeys.add(personKey);
  }
  if (peopleKeys.size !== activeAssignments.size)
    fail('TENANT_PEOPLE_BINDING_INVALID', 'Every active assignment must have one exact People binding.');
  const roleTierByCode: Readonly<Record<string, string>> = Object.freeze({
    L1: 'IC_OFFICER', L2: 'PEOPLE_MANAGER', L3: 'SENIOR_LEADER'
  });
  const governedAuthority = roleLevelAuthority || fail('TENANT_ROLE_LEVEL_AUTHORITY_INVALID',
    'Non-empty Product data requires one independent exact governed L1/L2/L3 name authority.');
  const governedRoleLevelNames = governedAuthority.roleLevelNames;
  if (governedAuthority.authorityReference !== packet.approvalReference
    || canonicaliseC2b(Object.keys(governedRoleLevelNames).sort())
      !== canonicaliseC2b(['L1', 'L2', 'L3'])
    || Object.values(governedRoleLevelNames).some(name => !nonBlank(name))
    || new Set(Object.values(governedRoleLevelNames)).size !== 3) {
    fail('TENANT_ROLE_LEVEL_AUTHORITY_INVALID',
      'Non-empty Product data requires one independent exact governed L1/L2/L3 name authority.');
  }
  if (packet.roleLevelBindings.length !== 3)
    fail('TENANT_ROLE_LEVEL_BINDING_INVALID', 'Exactly three approved role-level identities are required.');
  const roleLevels = new Map<string, Readonly<Record<string, unknown>>>();
  for (const row of packet.roleLevelBindings) {
    exactRow(row, ['sourceRoleLevelCode', 'roleTier', 'roleLevelName', 'approvalReference'],
      'TENANT_ROLE_LEVEL_BINDING_INVALID');
    const code = requiredText(row.sourceRoleLevelCode, 'TENANT_ROLE_LEVEL_BINDING_INVALID');
    if (roleLevels.has(code) || row.roleTier !== roleTierByCode[code]
      || row.roleLevelName !== governedRoleLevelNames[code as 'L1' | 'L2' | 'L3']
      || row.approvalReference !== packet.approvalReference) {
      fail('TENANT_ROLE_LEVEL_BINDING_INVALID', 'Role code, tier, canonical name or approval identity is crossed.');
    }
    roleLevels.set(code, row);
  }
  if (Object.keys(roleTierByCode).some(code => !roleLevels.has(code))
    || new Set(Array.from(roleLevels.values()).map(row => row.roleLevelName)).size !== 3) {
    fail('TENANT_ROLE_LEVEL_BINDING_INVALID', 'Canonical role-level identities must be complete and unique.');
  }
  if (packet.behaviourObjectiveLibrary.length !== 75)
    fail('TENANT_CATALOGUE_COUNT', 'The approved catalogue must contain exactly 75 rows.');
  const distribution = new Map<string, number[]>();
  const catalogueKeys = packet.behaviourObjectiveLibrary.map(row => {
    exactRow(row, ['BehaviourObjectiveKey', 'BehaviourKey', 'BehaviourTitle', 'CorporateValue', 'RoleLevelName',
      'DropdownLabel', 'ObjectiveTitle', 'SuggestedUnit', 'RoleLevelCode', 'ObjectiveDescription', 'SuggestedMeasure',
      'SuggestedEvidence', 'Active', 'SortOrder', 'EffectiveFrom', 'EffectiveTo'], 'TENANT_CATALOGUE_FIELDS_INVALID');
    const behaviourKey = requiredText(row.BehaviourKey, 'TENANT_CATALOGUE_ROW_INVALID');
    const role = requiredText(row.RoleLevelCode, 'TENANT_CATALOGUE_ROW_INVALID');
    const roleLevel = roleLevels.get(role);
    const value = packet.frameworkValues.find(candidate => candidate.ValueID === behaviourKey)!;
    const order = row.SortOrder;
    if (!valueIds.includes(behaviourKey) || !roleLevel || row.RoleLevelName !== roleLevel.roleLevelName
      || !Number.isInteger(order) || (order as number) < 1 || (order as number) > 5
      || row.BehaviourObjectiveKey !== `${behaviourKey}-${role}-${String(order).padStart(2, '0')}`
      || row.BehaviourTitle !== value.ValueTitle || row.CorporateValue !== value.CorporateValue
      || row.DropdownLabel !== `[${row.RoleLevelName}] ${row.ObjectiveTitle}` || typeof row.Active !== 'boolean') {
      fail('TENANT_CATALOGUE_ROW_INVALID', 'Catalogue composite key, Value, tier, order or Active flag is invalid.');
    }
    ['BehaviourTitle', 'CorporateValue', 'RoleLevelName', 'DropdownLabel', 'ObjectiveTitle', 'SuggestedUnit',
      'ObjectiveDescription', 'SuggestedMeasure', 'SuggestedEvidence']
      .forEach(field => requiredText(row[field], 'TENANT_CATALOGUE_ROW_INVALID'));
    const rowFrom = dateOnly(row.EffectiveFrom, false, 'TENANT_CATALOGUE_DATE_INVALID')!;
    const rowTo = dateOnly(row.EffectiveTo, true, 'TENANT_CATALOGUE_DATE_INVALID');
    if (rowFrom > effectiveFrom || rowTo !== null && (rowTo < rowFrom || rowTo < effectiveFrom))
      fail('TENANT_CATALOGUE_DATE_INVALID', 'The framework effective date must be inside every catalogue range.');
    const group = `${behaviourKey}|${role}`;
    distribution.set(group, [...(distribution.get(group) || []), order as number]);
    return row.BehaviourObjectiveKey;
  });
  if (catalogueKeys.some(key => !nonBlank(key)) || new Set(catalogueKeys).size !== 75)
    fail('TENANT_CATALOGUE_KEYS', 'The approved catalogue requires 75 unique non-blank stable keys.');
  if (distribution.size !== 15 || Array.from(distribution.values()).some(orders =>
    canonicaliseC2b([...orders].sort()) !== canonicaliseC2b([1, 2, 3, 4, 5]))) {
    fail('TENANT_CATALOGUE_DISTRIBUTION', 'Catalogue must contain sort orders 1..5 for every Value/tier pair.');
  }
  const digest = hashC2bCanonical(packet.behaviourObjectiveLibrary);
  if (!packet.catalogueBinding || packet.catalogueBinding.frameworkVersion !== frameworkVersion
    || !SHA256.test(packet.catalogueBinding.canonicalDigestSha256)
    || packet.catalogueBinding.canonicalDigestSha256.toUpperCase() !== digest) {
    fail('TENANT_CATALOGUE_BINDING_INVALID', 'Catalogue framework and canonical digest are not exact.');
  }
  const principals = new Map<string, Readonly<Record<string, unknown>>>();
  const principalKeys = new Set<string>();
  for (const row of packet.principalBindings) {
    exactRow(row, ['personKey', 'assignmentKey', 'principalKey', 'category', 'approvalReference'],
      'TENANT_PRINCIPAL_BINDING_INVALID');
    const personKey = requiredText(row.personKey, 'TENANT_PRINCIPAL_BINDING_INVALID');
    const assignment = activeAssignments.get(personKey);
    if (!assignment || !peopleKeys.has(personKey) || principals.has(personKey)
      || row.assignmentKey !== assignment.AssignmentKey || !nonBlank(row.principalKey)
      || principalKeys.has(String(row.principalKey))
      || !['Positive', 'Negative'].includes(String(row.category))
      || row.approvalReference !== packet.approvalReference) {
      fail('TENANT_PRINCIPAL_BINDING_INVALID', 'Principal identity is crossed from People, assignment or approval.');
    }
    principalKeys.add(String(row.principalKey));
    principals.set(personKey, row);
  }
  if (!packet.positiveActors.length || !packet.negativeActors.length || !nonBlank(packet.fixtureRange)
    || packet.fixtureAuthorityReference !== packet.approvalReference
    || [...packet.positiveActors, ...packet.negativeActors].some(actor => !nonBlank(actor))
    || new Set(packet.positiveActors).size !== packet.positiveActors.length
    || new Set(packet.negativeActors).size !== packet.negativeActors.length
    || packet.positiveActors.some(actor => packet.negativeActors.includes(actor))
    || packet.positiveActors.some(actor => principals.get(actor)?.category !== 'Positive')
    || packet.negativeActors.some(actor => principals.get(actor)?.category !== 'Negative')
    || principals.size !== packet.positiveActors.length + packet.negativeActors.length) {
    fail('TENANT_ACTOR_FIXTURE_INVALID', 'Positive/negative actors and fixture range must be attributable, unique and disjoint.');
  }
  assertHistoricEvidence(packet.historicEvidence, { frameworkVersion,
    approvalReference: packet.approvalReference as string, catalogueDigestSha256: digest,
    assignments: activeAssignments, principals });
}

function comparableExisting(row: ITenantRowObservation, expected: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return Object.keys(expected).reduce<Record<string, unknown>>((result, key) => {
    result[key] = row.fields[key];
    return result;
  }, {});
}

export function planBehaviourV2TenantProvisioning(
  schema: IBehaviourV2TenantSchema,
  productData: IBehaviourV2ProductDataPacket,
  snapshot: ITenantProvisioningSnapshot,
  mode: 'DryRun' | 'Apply' = 'DryRun',
  roleLevelAuthority?: IBehaviourV2RoleLevelAuthority
): ITenantProvisioningPlan {
  const immutableSchema = immutableTenantInput(schema);
  const immutableProductData = immutableTenantInput(productData);
  const immutableSnapshot = immutableTenantInput(snapshot);
  const immutableAuthority = roleLevelAuthority ? immutableTenantInput(roleLevelAuthority) : undefined;
  assertIndependentAuthorities(immutableSchema, immutableProductData, immutableAuthority);
  assertSchema(immutableSchema);
  assertProductData(immutableProductData, immutableAuthority);
  const classification = assertKcfAutomationTenantTarget(immutableSnapshot.targetEvidence);
  if (immutableSnapshot.productionReferenceObserved) fail('TENANT_PRODUCTION_REFERENCE', 'A Production reference was observed.');
  if (immutableSnapshot.activeOldFlowObserved) fail('TENANT_OLD_FLOW_ACTIVE', 'An old processor flow is active.');
  if (immutableSnapshot.lists.some(list => !list.pagingComplete))
    fail('TENANT_INCOMPLETE_PAGE', 'Every list and stable-key read must be completely paged.');
  if (immutableSnapshot.bindings.length !== immutableSchema.lists.length
    || new Set(immutableSnapshot.bindings.map(binding => binding.purpose)).size !== immutableSchema.lists.length) {
    fail('TENANT_LIST_BINDING_INCOMPLETE', 'Every provisioning purpose requires one exact binding receipt.');
  }
  const observedIds = immutableSnapshot.lists.map(list => normalGuid(list.listId));
  if (observedIds.some(id => !GUID.test(id)) || new Set(observedIds).size !== observedIds.length)
    fail('TENANT_LIST_GUID_INVALID', 'Observed list GUIDs must be valid and unique.');
  const operations: TenantProvisioningOperation[] = [];
  const noOpAssets: string[] = [];
  type OperationInput = TenantProvisioningOperation extends infer T
    ? T extends { sequence: number } ? Omit<T, 'sequence'> : never : never;
  const queue = (operation: OperationInput): void => {
    operations.push({ ...operation, sequence: operations.length + 1 } as TenantProvisioningOperation);
  };
  for (const definition of immutableSchema.lists) {
    const foundBinding = immutableSnapshot.bindings.find(item => item.purpose === definition.purpose);
    if (!foundBinding) fail('TENANT_LIST_BINDING_INVALID', `${definition.purpose} has no binding receipt.`);
    const binding = foundBinding as ITenantProvisioningListBinding;
    if (binding.title !== definition.title || binding.schemaRevision !== definition.schemaRevision
      || binding.listId !== null && !GUID.test(normalGuid(binding.listId))) {
      fail('TENANT_LIST_BINDING_INVALID', `${definition.purpose} has no exact title/GUID/schema binding.`);
    }
    const matches = immutableSnapshot.lists.filter(list => list.purpose === definition.purpose);
    if (matches.length > 1) fail('TENANT_LIST_DUPLICATE', `${definition.title} is duplicated.`);
    const observed = matches[0];
    if (!observed) {
      if (!definition.createIfMissing) fail('TENANT_REQUIRED_LIST_ABSENT', `${definition.title} must already exist.`);
      if (binding.listId !== null) fail('TENANT_BOUND_LIST_ABSENT', `${definition.title} bound GUID was not discovered.`);
      queue({ kind: 'AddList', purpose: definition.purpose, listTitle: definition.title,
        expectedBefore: 'Absent', definitionSha256: hashC2bCanonical(definition) });
      if (definition.permissionCapability === 'PrivateProcessorOnly') queue({ kind: 'SetPrivateListAcl',
        purpose: definition.purpose, listTitle: definition.title, listId: null, expectedBefore: 'Inherited',
        definitionSha256: hashC2bCanonical({ purpose: definition.purpose, title: definition.title,
          permissionCapability: definition.permissionCapability }) });
      definition.fields.forEach(field => queue({ kind: 'AddField', purpose: definition.purpose,
        listTitle: definition.title, listId: null, field: field.internalName, expectedBefore: 'Absent',
        definitionSha256: hashC2bCanonical(field) }));
    } else {
      if (observed.title !== definition.title || observed.schemaRevision !== binding.schemaRevision
        || binding.listId === null || normalGuid(observed.listId) !== normalGuid(binding.listId)) {
        fail('TENANT_LIST_IDENTITY_CONFLICT', `${definition.title} does not match its exact purpose/title/GUID/schema receipt.`);
      }
      if (observed.baseTemplate !== definition.baseTemplate || observed.titleRequired !== definition.titleRequired
        || observed.majorVersioningEnabled !== definition.majorVersioningEnabled
        || observed.foldersEnabled !== definition.foldersEnabled) {
        fail('TENANT_LIST_SCHEMA_CONFLICT', `${definition.title} settings conflict with the reviewed add-only schema.`);
      }
      if (definition.permissionCapability === 'PrivateProcessorOnly') {
        if (observed.permissionCapability === 'Inherited') queue({ kind: 'SetPrivateListAcl',
          purpose: definition.purpose, listTitle: definition.title, listId: observed.listId,
          expectedBefore: 'Inherited', definitionSha256: hashC2bCanonical({ purpose: definition.purpose,
            title: definition.title, permissionCapability: definition.permissionCapability }) });
        else if (observed.permissionCapability !== 'PrivateProcessorOnly')
          fail('TENANT_PRIVATE_LIST_ACL_UNKNOWN', `${definition.title} permission readback is absent or ambiguous.`);
      } else if (observed.permissionCapability !== undefined)
        fail('TENANT_UNEXPECTED_PERMISSION_CAPABILITY', definition.title);
      for (const field of definition.fields) {
        const current = observed.fields.filter(candidate => candidate.internalName === field.internalName);
        if (current.length > 1) fail('TENANT_FIELD_DUPLICATE', `${definition.title}.${field.internalName} is duplicated.`);
        if (!current.length) queue({ kind: 'AddField', purpose: definition.purpose, listTitle: definition.title,
          listId: observed.listId, field: field.internalName, expectedBefore: 'Absent',
          definitionSha256: hashC2bCanonical(field) });
        else {
          const mismatches = fieldMismatches(field, current[0]);
          if (mismatches.length) fail('TENANT_FIELD_SCHEMA_CONFLICT',
            `${definition.title}.${field.internalName} conflicts on ${mismatches.join(', ')}.`);
          noOpAssets.push(`${definition.title}.${field.internalName}`);
        }
      }
      for (const field of definition.requiredExistingFields || []) {
        const current = observed.fields.filter(candidate => candidate.internalName === field.internalName);
        if (current.length !== 1) fail('TENANT_STABLE_KEY_SCHEMA_CONFLICT',
          `${definition.title}.${field.internalName} is absent or duplicated.`);
        const mismatches = fieldMismatches(field, current[0]);
        if (mismatches.length) fail('TENANT_STABLE_KEY_SCHEMA_CONFLICT',
          `${definition.title}.${field.internalName} conflicts on ${mismatches.join(', ')}.`);
      }
      if (definition.exactCustomFieldSet) {
        const expectedFields = definition.fields.map(field => field.internalName).sort();
        const actualFields = observed.fields.map(field => field.internalName).sort();
        if (canonicaliseC2b(expectedFields) !== canonicaliseC2b(actualFields))
          fail('TENANT_UNEXPECTED_PRODUCT_FIELD', `${definition.title} has an unreviewed Product field.`);
      }
      noOpAssets.push(definition.title);
    }
    const rows = dataRowsForPurpose(immutableProductData, definition.purpose);
    if (!rows.length) continue;
    if (!observed) fail('TENANT_ROW_DEFERRED_UNTIL_LIST_READBACK',
      `${definition.title} row import requires a post-create discovery/readback pass.`);
    const requestedKeys = rows.map(row => row[definition.stableKey]);
    if (requestedKeys.some(key => !nonBlank(key)) || new Set(requestedKeys).size !== requestedKeys.length)
      fail('TENANT_PRODUCT_KEY_INVALID', `${definition.title} Product stable keys are missing or duplicated.`);
    for (const row of rows) {
      const key = String(row[definition.stableKey]);
      const existing = observed.rows.filter(candidate => candidate.fields[definition.stableKey] === key);
      if (existing.length > 1) fail('TENANT_EXISTING_KEY_DUPLICATE', `${definition.title}.${key} is duplicated.`);
      if (!existing.length) queue({ kind: 'InsertRow', purpose: definition.purpose, listTitle: definition.title,
        listId: observed.listId, keyField: definition.stableKey, stableKey: key, expectedBefore: 'Absent',
        rowSha256: hashC2bCanonical(row) });
      else if (canonicaliseC2b(comparableExisting(existing[0], row)) !== canonicaliseC2b(row))
        fail('TENANT_NO_OVERWRITE_CONFLICT', `${definition.title}.${key} exists with different content.`);
      else noOpAssets.push(`${definition.title}[${key}]`);
    }
  }
  const unsigned = {
    contractVersion: 'kcf.kpi.wib12.tenant-layer.v1' as const, mode,
    deploymentClassification: classification.deploymentClassification,
    platformEnvironmentType: classification.platformEnvironmentType,
    targetEvidenceSha256: classification.evidenceSha256,
    schemaSha256: hashC2bCanonical(immutableSchema), productDataSha256: hashC2bCanonical(immutableProductData),
    roleLevelAuthoritySha256: immutableAuthority ? hashC2bCanonical(immutableAuthority) : null,
    beforeStateSha256: hashC2bCanonical(immutableSnapshot), operations, noOpAssets: [...noOpAssets].sort()
  };
  return immutableTenantInput({ ...unsigned, planSha256: hashC2bCanonical(unsigned) });
}

const operationSha256 = (operation: TenantProvisioningOperation): string => hashC2bCanonical(operation);
const receiptUnsigned = (receipt: ITenantProvisioningReceipt): Record<string, unknown> =>
  Object.keys(receipt).filter(key => key !== 'receiptSha256').reduce<Record<string, unknown>>((result, key) => {
    result[key] = receipt[key as keyof ITenantProvisioningReceipt]; return result;
  }, {});

function sealNextReceiptRevision(receipt: ITenantProvisioningReceipt): void {
  const previous = receipt.revision > 0 ? receipt.receiptSha256 : null;
  receipt.revision += 1;
  receipt.previousReceiptSha256 = previous;
  receipt.receiptSha256 = hashC2bCanonical(receiptUnsigned(receipt));
}

const expectedReceiptKeys = ['afterStateSha256', 'applyExplicitlyEnabled', 'beforeStateSha256', 'completedAt',
  'confirmations', 'contractVersion', 'mode', 'pendingOperation', 'plan', 'planSha256', 'previousReceiptSha256',
  'receiptKey', 'receiptSchemaVersion', 'receiptSha256', 'revision', 'rollback', 'startedAt', 'status', 'stopCode',
  'unknownOperation'].sort();
const expectedPlanKeys = ['beforeStateSha256', 'contractVersion', 'deploymentClassification', 'mode', 'noOpAssets',
  'operations', 'planSha256', 'platformEnvironmentType', 'productDataSha256', 'roleLevelAuthoritySha256',
  'schemaSha256', 'targetEvidenceSha256'].sort();
const permittedReceiptStatuses: readonly unknown[] = ['InProgress', 'Completed', 'BlockedOff'];
const rollbackKind = (operation: TenantProvisioningOperation): ITenantRollbackEntry['kind'] =>
  operation.kind === 'AddList' ? 'RecycleCreatedList'
    : operation.kind === 'SetPrivateListAcl' ? 'RestorePrivateListAcl'
    : operation.kind === 'AddField' ? 'LeaveAddOnlyField' : 'RecycleCreatedRow';

function assertReceiptRevisionSemantics(receipt: ITenantProvisioningReceipt, receiptKey: string): void {
  const unsignedPlan = Object.keys(receipt.plan || {}).filter(key => key !== 'planSha256')
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = receipt.plan[key as keyof ITenantProvisioningPlan]; return result;
    }, {});
  if (canonicaliseC2b(Object.keys(receipt).sort()) !== canonicaliseC2b(expectedReceiptKeys)
    || canonicaliseC2b(Object.keys(receipt.plan || {}).sort()) !== canonicaliseC2b(expectedPlanKeys)
    || receipt.contractVersion !== 'kcf.kpi.wib12.tenant-layer.v1'
    || receipt.receiptSchemaVersion !== 'kcf.kpi.wib12.provisioning-receipt.v1'
    || receipt.receiptKey !== receiptKey || receipt.receiptKey !== `tenant-provision|${receipt.planSha256}`
    || receipt.planSha256 !== receipt.plan.planSha256
    || receipt.plan.contractVersion !== receipt.contractVersion || receipt.plan.mode !== receipt.mode
    || receipt.plan.deploymentClassification !== 'NonProduction' || receipt.plan.platformEnvironmentType !== 'Default'
    || receipt.beforeStateSha256 !== receipt.plan.beforeStateSha256
    || !SHA256.test(receipt.planSha256) || !SHA256.test(receipt.plan.schemaSha256)
    || !SHA256.test(receipt.plan.productDataSha256) || !SHA256.test(receipt.plan.targetEvidenceSha256)
    || !SHA256.test(receipt.plan.roleLevelAuthoritySha256 || '')
    || hashC2bCanonical(unsignedPlan) !== receipt.plan.planSha256
    || !permittedReceiptStatuses.includes(receipt.status)
    || receipt.mode === 'Apply' && receipt.applyExplicitlyEnabled !== true
    || receipt.mode === 'DryRun' && receipt.applyExplicitlyEnabled !== false
    || !nonBlank(receipt.startedAt) || !nonBlank(receipt.completedAt)
    || receipt.status === 'InProgress' && (receipt.stopCode !== null || receipt.unknownOperation !== null)
    || receipt.status === 'Completed' && (receipt.stopCode !== null || receipt.pendingOperation !== null
      || receipt.unknownOperation !== null || !SHA256.test(receipt.afterStateSha256 || ''))
    || receipt.status === 'BlockedOff' && !nonBlank(receipt.stopCode)) {
    fail('TENANT_RECEIPT_SEMANTIC_INVALID', 'A receipt revision violates its exact plan, authority or status contract.');
  }
  if (canonicaliseC2b(Object.keys(receipt.rollback || {}).sort())
    !== canonicaliseC2b(['ambiguityOutcome', 'entries', 'flowMustRemainOff', 'requiredFirstAction'].sort()))
    fail('TENANT_RECEIPT_ROLLBACK_INVALID', 'Rollback policy fields are not exact.');
  receipt.plan.operations.forEach((operation, index) => {
    const operationKeys = operation.kind === 'AddList'
      ? ['definitionSha256', 'expectedBefore', 'kind', 'listTitle', 'purpose', 'sequence']
      : operation.kind === 'AddField'
        ? ['definitionSha256', 'expectedBefore', 'field', 'kind', 'listId', 'listTitle', 'purpose', 'sequence']
        : operation.kind === 'SetPrivateListAcl'
          ? ['definitionSha256', 'expectedBefore', 'kind', 'listId', 'listTitle', 'purpose', 'sequence']
        : ['expectedBefore', 'keyField', 'kind', 'listId', 'listTitle', 'purpose', 'rowSha256', 'sequence', 'stableKey'];
    if (canonicaliseC2b(Object.keys(operation).sort()) !== canonicaliseC2b(operationKeys.sort())
      || operation.sequence !== index + 1 || !nonBlank(operation.purpose) || !nonBlank(operation.listTitle)
      || operation.expectedBefore !== (operation.kind === 'SetPrivateListAcl' ? 'Inherited' : 'Absent')
      || operation.kind === 'AddList' && !SHA256.test(operation.definitionSha256)
      || operation.kind === 'AddField' && (!nonBlank(operation.field)
        || operation.listId !== null && !GUID.test(normalGuid(operation.listId))
        || !SHA256.test(operation.definitionSha256))
      || operation.kind === 'SetPrivateListAcl' && (operation.listId !== null && !GUID.test(normalGuid(operation.listId))
        || !SHA256.test(operation.definitionSha256))
      || operation.kind === 'InsertRow' && (!GUID.test(normalGuid(operation.listId))
        || !nonBlank(operation.keyField) || !nonBlank(operation.stableKey) || !SHA256.test(operation.rowSha256)))
      fail('TENANT_RECEIPT_PLAN_INVALID', 'Plan operations are not exact, gapless and digest-bound.');
  });
  receipt.confirmations.forEach((confirmation, index) => {
    const operation = receipt.plan.operations[index];
    if (canonicaliseC2b(Object.keys(confirmation).sort()) !== canonicaliseC2b([
      'created', 'kind', 'operationSha256', 'outcome', 'providerReference', 'readbackSha256', 'sequence'
    ].sort()) || !operation || confirmation.sequence !== operation.sequence || confirmation.kind !== operation.kind
      || confirmation.operationSha256 !== operationSha256(operation) || !nonBlank(confirmation.providerReference)
      || !SHA256.test(confirmation.readbackSha256) || confirmation.created !== true
      || !['Confirmed', 'ReplayConfirmed'].includes(confirmation.outcome)) {
      fail('TENANT_RECEIPT_CONFIRMATION_PREFIX_INVALID', 'Confirmations are not the exact ordered plan prefix.');
    }
  });
  const protectedReferences = new Map<number, string>(receipt.confirmations
    .map(item => [item.sequence, item.providerReference] as const));
  if (receipt.unknownOperation?.recoveryOutcome === 'PartiallyApplied'
    && receipt.unknownOperation.providerReference) {
    protectedReferences.set(receipt.unknownOperation.sequence, receipt.unknownOperation.providerReference);
  }
  const rollbackSequences = receipt.rollback.entries.map(entry => entry.operationSequence).sort((a, b) => a - b);
  const protectedSequences = Array.from(protectedReferences.keys()).sort((a, b) => a - b);
  if (receipt.rollback.requiredFirstAction !== 'TurnNewFlowOff' || receipt.rollback.flowMustRemainOff !== true
    || receipt.rollback.ambiguityOutcome !== 'BLOCKED_OFF'
    || canonicaliseC2b(rollbackSequences) !== canonicaliseC2b(protectedSequences)
    || receipt.rollback.entries.some((entry, index) => {
      const operation = receipt.plan.operations[entry.operationSequence - 1];
      return canonicaliseC2b(Object.keys(entry).sort()) !== canonicaliseC2b([
        'kind', 'operationSequence', 'operationSha256', 'protectedPreExistingAsset', 'providerReference',
        'requiresExplicitRollbackAuthority', 'reverseSequence'
      ].sort()) || !operation || entry.reverseSequence !== index + 1 || entry.requiresExplicitRollbackAuthority !== true
        || entry.providerReference !== protectedReferences.get(entry.operationSequence)
        || entry.operationSha256 !== operationSha256(operation) || entry.kind !== rollbackKind(operation)
        || entry.protectedPreExistingAsset !== (operation.kind === 'AddField' && operation.listId !== null);
    })) {
    fail('TENANT_RECEIPT_ROLLBACK_INVALID', 'Rollback history is not the exact one-to-one inverse with invariant Off policy.');
  }
  const nextSequence = receipt.confirmations.length + 1;
  for (const pending of [receipt.pendingOperation, receipt.unknownOperation].filter(Boolean)) {
    const value = pending!;
    const appliedUnknownSequence = receipt.unknownOperation?.recoveryOutcome === 'Applied'
      ? receipt.unknownOperation.sequence : null;
    const expectedSequence = value.sequence === appliedUnknownSequence ? receipt.confirmations.length : nextSequence;
    const expectedPendingKeys = pending === receipt.pendingOperation ? ['kind', 'purpose', 'sequence'] : [
      'kind', 'providerReference', 'purpose', 'readbackSha256', 'recoveryOutcome', 'safeCode', 'sequence'
    ];
    if (canonicaliseC2b(Object.keys(value).sort()) !== canonicaliseC2b(expectedPendingKeys.sort())
      || value.sequence !== expectedSequence || receipt.plan.operations[value.sequence - 1]?.kind !== value.kind
      || receipt.plan.operations[value.sequence - 1]?.purpose !== value.purpose) {
      fail('TENANT_RECEIPT_PENDING_INVALID', 'Pending state is not the next exact plan operation.');
    }
  }
  if (receipt.unknownOperation) {
    const unknown = receipt.unknownOperation;
    const applied = ['Applied', 'PartiallyApplied'].includes(unknown.recoveryOutcome || '');
    if (!nonBlank(unknown.safeCode) || applied && (!nonBlank(unknown.providerReference)
      || !SHA256.test(unknown.readbackSha256 || '')) || !applied
      && (unknown.providerReference !== null || unknown.readbackSha256 !== null))
      fail('TENANT_RECEIPT_PENDING_INVALID', 'Unknown-operation recovery evidence is incomplete or crossed.');
  }
  if (receipt.pendingOperation && receipt.unknownOperation
    && (receipt.pendingOperation.sequence !== receipt.unknownOperation.sequence
      || receipt.pendingOperation.kind !== receipt.unknownOperation.kind
      || receipt.pendingOperation.purpose !== receipt.unknownOperation.purpose)) {
    fail('TENANT_RECEIPT_PENDING_INVALID', 'Pending and unknown evidence crosses operation identity.');
  }
  if (receipt.mode === 'DryRun' && (receipt.status !== 'Completed' || receipt.confirmations.length > 0
    || receipt.rollback.entries.length > 0 || receipt.pendingOperation !== null || receipt.unknownOperation !== null)
    || receipt.mode === 'Apply' && receipt.status === 'Completed'
      && receipt.confirmations.length !== receipt.plan.operations.length) {
    fail('TENANT_RECEIPT_SEMANTIC_INVALID', 'Receipt status is inconsistent with its operation history.');
  }
}

function assertReceiptRevisionTransition(previous: ITenantProvisioningReceipt,
  current: ITenantProvisioningReceipt): void {
  const statusTransitionAllowed = previous.status === 'InProgress'
    || previous.status === 'BlockedOff' && (current.status === 'BlockedOff'
      || current.status === 'InProgress' && (previous.pendingOperation !== null || previous.unknownOperation !== null)
      || current.status === 'Completed' && previous.confirmations.length === previous.plan.operations.length
        && previous.pendingOperation === null && previous.unknownOperation === null);
  if (!statusTransitionAllowed)
    fail('TENANT_RECEIPT_REVISION_TRANSITION_INVALID', 'Receipt status transition is not permitted.');
  if (previous.confirmations.length > current.confirmations.length
    || previous.confirmations.some((confirmation, index) =>
      canonicaliseC2b(confirmation) !== canonicaliseC2b(current.confirmations[index])))
    fail('TENANT_RECEIPT_REVISION_TRANSITION_INVALID', 'Confirmed operation history regressed or changed.');
  const currentRollback = new Map(current.rollback.entries.map(entry => [entry.operationSequence, entry] as const));
  if (previous.rollback.entries.some(entry => {
    const currentEntry = currentRollback.get(entry.operationSequence);
    if (!currentEntry) return true;
    const withoutReverse = (value: ITenantRollbackEntry): Record<string, unknown> => Object.keys(value)
      .filter(key => key !== 'reverseSequence').reduce<Record<string, unknown>>((result, key) => {
        result[key] = value[key as keyof ITenantRollbackEntry]; return result;
      }, {});
    return canonicaliseC2b(withoutReverse(entry)) !== canonicaliseC2b(withoutReverse(currentEntry));
  })) fail('TENANT_RECEIPT_REVISION_TRANSITION_INVALID', 'Rollback history regressed or changed.');
}

function assertAuthenticatedReceiptChain(chain: ITenantAuthenticatedReceiptChain,
  authority: ITenantProvisioningReceiptAuthority, receiptKey: string): ITenantProvisioningReceipt {
  if (authority.contractVersion !== 'kcf.kpi.wib12.receipt-authority.v1'
    || !nonBlank(authority.authorityReference) || !GUID.test(normalGuid(authority.receiptListId))
    || !nonBlank(authority.receiptListTitle) || !nonBlank(authority.schemaRevision)
    || authority.baseTemplate !== 100 || authority.majorVersioningEnabled !== true || authority.foldersEnabled !== false
    || authority.keyField !== 'ReceiptRevisionKey' || authority.seriesKeyField !== 'ReceiptKey'
    || authority.chunkPrefix !== 'ReceiptChunk' || authority.chunkCount !== 16
    || authority.maximumCodeUnits !== 960000 || !Array.isArray(authority.fieldInventory)
    || !authority.fieldInventory.length || !SHA256.test(authority.fieldInventorySha256)
    || authority.fieldInventorySha256.toUpperCase() !== hashC2bCanonical(authority.fieldInventory)
    || !nonBlank(authority.writerPrincipalKey) || !Number.isSafeInteger(authority.writerPrincipalId)
    || authority.writerPrincipalId < 1
    || normalGuid(chain.receiptListId) !== normalGuid(authority.receiptListId)
    || chain.receiptListTitle !== authority.receiptListTitle || chain.schemaRevision !== authority.schemaRevision
    || chain.fieldInventorySha256.toUpperCase() !== authority.fieldInventorySha256.toUpperCase()
    || chain.writerPrincipalKey !== authority.writerPrincipalKey || chain.writerPrincipalId !== authority.writerPrincipalId
    || !Number.isSafeInteger(chain.itemId) || chain.itemId < 1
    || !nonBlank(chain.itemVersion) || !nonBlank(chain.etag) || !Array.isArray(chain.revisions)
    || !chain.revisions.length || !Array.isArray(chain.revisionEvidence)
    || chain.revisionEvidence.length !== chain.revisions.length) {
    fail('TENANT_RECEIPT_AUTHORITY_MISMATCH', 'Receipt list, writer, item, version, ETag or schema is not authenticated.');
  }
  let previous: string | null = null;
  let invariantPlan: string | undefined;
  let invariantPolicy: string | undefined;
  let priorRevision: ITenantProvisioningReceipt | undefined;
  chain.revisions.forEach((revision, index) => {
    const evidence = chain.revisionEvidence[index];
    if (revision.revision !== index + 1
      || revision.previousReceiptSha256 !== previous || !SHA256.test(revision.receiptSha256)
      || hashC2bCanonical(receiptUnsigned(revision)) !== revision.receiptSha256
      || evidence.revision !== revision.revision || evidence.receiptSha256 !== revision.receiptSha256
      || !Number.isSafeInteger(evidence.itemId) || evidence.itemId < 1 || !nonBlank(evidence.itemVersion)
      || !nonBlank(evidence.etag) || evidence.authorPrincipalId !== authority.writerPrincipalId
      || evidence.editorPrincipalId !== authority.writerPrincipalId) {
      fail('TENANT_RECEIPT_CHAIN_INVALID', 'Receipt revisions are not exact, gapless and digest-chained.');
    }
    assertReceiptRevisionSemantics(revision, receiptKey);
    if (index === 0 && (revision.mode === 'Apply' && revision.status !== 'InProgress'
      || revision.mode === 'DryRun' && revision.status !== 'Completed')) {
      fail('TENANT_RECEIPT_REVISION_TRANSITION_INVALID', 'Initial receipt status is not permitted for its mode.');
    }
    const planIdentity = canonicaliseC2b(revision.plan);
    const policyIdentity = canonicaliseC2b({ contractVersion: revision.contractVersion,
      receiptSchemaVersion: revision.receiptSchemaVersion, mode: revision.mode,
      applyExplicitlyEnabled: revision.applyExplicitlyEnabled, receiptKey: revision.receiptKey,
      startedAt: revision.startedAt, planSha256: revision.planSha256,
      beforeStateSha256: revision.beforeStateSha256, rollbackPolicy: {
        requiredFirstAction: revision.rollback.requiredFirstAction,
        flowMustRemainOff: revision.rollback.flowMustRemainOff,
        ambiguityOutcome: revision.rollback.ambiguityOutcome
      } });
    invariantPlan ??= planIdentity;
    invariantPolicy ??= policyIdentity;
    if (planIdentity !== invariantPlan || policyIdentity !== invariantPolicy)
      fail('TENANT_RECEIPT_REVISION_INVARIANT_MISMATCH', 'Plan, authority or Off policy changed within the receipt chain.');
    if (priorRevision) assertReceiptRevisionTransition(priorRevision, revision);
    priorRevision = revision;
    previous = revision.receiptSha256;
  });
  const receipt = chain.revisions[chain.revisions.length - 1];
  const latestEvidence = chain.revisionEvidence[chain.revisionEvidence.length - 1];
  if (chain.itemId !== latestEvidence.itemId || chain.itemVersion !== latestEvidence.itemVersion
    || chain.etag !== latestEvidence.etag)
    fail('TENANT_RECEIPT_AUTHORITY_MISMATCH', 'Latest receipt item evidence is not internally consistent.');
  return immutableTenantInput(receipt);
}

export async function executeBehaviourV2TenantProvisioning(
  client: IBehaviourV2TenantProvisioningClient,
  schema: IBehaviourV2TenantSchema,
  productData: IBehaviourV2ProductDataPacket,
  options: { mode?: 'DryRun' | 'Apply'; explicitlyEnableApply?: boolean; now?: () => string;
    resumeReceiptKey?: string; receiptAuthority?: ITenantProvisioningReceiptAuthority;
    roleLevelAuthority?: IBehaviourV2RoleLevelAuthority } = {}
): Promise<{ plan: ITenantProvisioningPlan; receipt: ITenantProvisioningReceipt }> {
  const immutableSchema = immutableTenantInput(schema);
  const immutableProductData = immutableTenantInput(productData);
  const immutableAuthority = options.roleLevelAuthority ? immutableTenantInput(options.roleLevelAuthority) : undefined;
  const mode = options.mode || 'DryRun';
  const explicitlyEnableApply = options.explicitlyEnableApply === true;
  const now = options.now || (() => new Date().toISOString());
  const startedAt = now();
  const before = immutableTenantInput(await client.observe());
  const currentPlan = planBehaviourV2TenantProvisioning(immutableSchema, immutableProductData, before, mode,
    immutableAuthority);
  if (mode === 'Apply' && !explicitlyEnableApply)
    fail('TENANT_APPLY_DISABLED', 'Apply requires a separate explicit enable flag.');
  let prior: ITenantProvisioningReceipt | undefined;
  if (options.resumeReceiptKey) {
    if (!nonBlank(options.resumeReceiptKey) || !options.receiptAuthority)
      fail('TENANT_RECEIPT_LOOKUP_AUTHORITY_ABSENT', 'Resume requires an exact key and independent receipt authority.');
    try {
      const chain = await client.readReceiptChain(options.resumeReceiptKey);
      if (!chain) fail('TENANT_RECEIPT_LOOKUP_ABSENT', 'No authenticated receipt exists for the exact key.');
      prior = assertAuthenticatedReceiptChain(immutableTenantInput(chain as ITenantAuthenticatedReceiptChain),
        immutableTenantInput(options.receiptAuthority as ITenantProvisioningReceiptAuthority), options.resumeReceiptKey);
    } catch (caught) {
      const stopCode = caught instanceof Error ? caught.message.split(':')[0] : 'TENANT_RECEIPT_CHAIN_INVALID';
      const blocked: ITenantProvisioningReceipt = {
        contractVersion: 'kcf.kpi.wib12.tenant-layer.v1',
        receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1', revision: 0,
        previousReceiptSha256: null, receiptSha256: '0'.repeat(64), mode,
        applyExplicitlyEnabled: explicitlyEnableApply,
        receiptKey: `tenant-provision|${currentPlan.planSha256}`, status: 'BlockedOff', stopCode,
        unknownOperation: null, pendingOperation: null, startedAt, completedAt: now(),
        planSha256: currentPlan.planSha256, plan: currentPlan, beforeStateSha256: currentPlan.beforeStateSha256,
        afterStateSha256: hashC2bCanonical(before), confirmations: [], rollback: {
          requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true, entries: [], ambiguityOutcome: 'BLOCKED_OFF'
        }
      };
      sealNextReceiptRevision(blocked);
      return { plan: currentPlan, receipt: immutableTenantInput(blocked) };
    }
  } else if (options.receiptAuthority) {
    fail('TENANT_RECEIPT_LOOKUP_KEY_ABSENT', 'Receipt authority cannot select a caller-supplied body.');
  }
  let plan = currentPlan;
  let confirmations: ITenantOperationConfirmation[] = [];
  let rollback: ITenantRollbackEntry[] = [];
  let receipt: ITenantProvisioningReceipt;
  if (prior) {
    const unsignedPriorPlan = Object.keys(prior.plan).filter(key => key !== 'planSha256')
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = prior.plan[key as keyof ITenantProvisioningPlan]; return result;
      }, {});
    if (prior.receiptKey !== `tenant-provision|${prior.planSha256}` || prior.planSha256 !== prior.plan.planSha256
      || hashC2bCanonical(unsignedPriorPlan) !== prior.plan.planSha256 || prior.mode !== mode
      || prior.plan.schemaSha256 !== currentPlan.schemaSha256
      || prior.plan.productDataSha256 !== currentPlan.productDataSha256
      || prior.plan.roleLevelAuthoritySha256 !== currentPlan.roleLevelAuthoritySha256
      || prior.plan.targetEvidenceSha256 !== currentPlan.targetEvidenceSha256
      || prior.plan.deploymentClassification !== currentPlan.deploymentClassification
      || prior.plan.platformEnvironmentType !== currentPlan.platformEnvironmentType) {
      fail('TENANT_RECEIPT_REPLAY_MISMATCH', 'A replay receipt must bind the exact same plan and mode.');
    }
    plan = prior.plan;
    confirmations = prior.confirmations.map(item => ({ ...item }));
    rollback = prior.rollback.entries.map(item => ({ ...item }));
    receipt = { ...prior, applyExplicitlyEnabled: explicitlyEnableApply, confirmations,
      rollback: { ...prior.rollback, entries: rollback } };
    if (prior.status === 'Completed') {
      const replayAfter = immutableTenantInput(await client.observe());
      const replayPlan = planBehaviourV2TenantProvisioning(immutableSchema, immutableProductData, replayAfter, 'DryRun',
        immutableAuthority);
      if (replayPlan.operations.length) fail('TENANT_RECEIPT_REPLAY_STATE_MISMATCH', 'Completed receipt does not match current state.');
      return { plan, receipt: prior };
    }
    if (mode !== 'Apply') fail('TENANT_RECEIPT_REPLAY_BLOCKED', 'Only an exact Apply receipt can be recovered.');
  } else {
    receipt = {
      contractVersion: 'kcf.kpi.wib12.tenant-layer.v1',
      receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1', revision: 0,
      previousReceiptSha256: null, receiptSha256: '0'.repeat(64),
      mode, applyExplicitlyEnabled: explicitlyEnableApply,
      receiptKey: `tenant-provision|${plan.planSha256}`, status: mode === 'DryRun' ? 'Completed' : 'InProgress',
      stopCode: null, unknownOperation: null, pendingOperation: null, startedAt, completedAt: now(),
      planSha256: plan.planSha256, plan, beforeStateSha256: plan.beforeStateSha256,
      afterStateSha256: mode === 'DryRun' ? hashC2bCanonical(before) : null, confirmations,
      rollback: { requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true, entries: rollback,
        ambiguityOutcome: 'BLOCKED_OFF' }
    };
    if (mode === 'DryRun') sealNextReceiptRevision(receipt);
  }

  const definitionFor = (operation: TenantProvisioningOperation): ITenantListDefinition =>
    immutableSchema.lists.find(list => list.purpose === operation.purpose)
      || fail('TENANT_OPERATION_PURPOSE_UNKNOWN', operation.purpose);
  const rowFor = (operation: TenantProvisioningOperation): Readonly<Record<string, unknown>> | undefined =>
    operation.kind === 'InsertRow' ? dataRowsForPurpose(immutableProductData, operation.purpose)
      .find(row => row[operation.keyField] === operation.stableKey) : undefined;
  const addRecovered = (operation: TenantProvisioningOperation, recovered: {
    providerReference: string; readbackSha256: string }, outcome: ITenantOperationConfirmation['outcome']): void => {
    if (!confirmations.some(item => item.sequence === operation.sequence)) confirmations.push({
      sequence: operation.sequence, kind: operation.kind, operationSha256: operationSha256(operation),
      providerReference: recovered.providerReference,
      readbackSha256: recovered.readbackSha256, created: true, outcome
    });
    if (!rollback.some(item => item.providerReference === recovered.providerReference)) {
      rollback.unshift({ reverseSequence: 0, operationSequence: operation.sequence,
        operationSha256: operationSha256(operation), kind: rollbackKind(operation),
      providerReference: recovered.providerReference,
      protectedPreExistingAsset: operation.kind === 'AddField' || operation.kind === 'SetPrivateListAcl'
        ? operation.listId !== null : false,
      requiresExplicitRollbackAuthority: true });
      rollback.forEach((entry, index) => { entry.reverseSequence = index + 1; });
    }
  };
  const addRollback = (operation: TenantProvisioningOperation, recovered: {
    providerReference: string; readbackSha256: string }): void => {
    if (rollback.some(item => item.providerReference === recovered.providerReference)) return;
    rollback.unshift({ reverseSequence: 0, operationSequence: operation.sequence,
      operationSha256: operationSha256(operation), kind: rollbackKind(operation),
    providerReference: recovered.providerReference,
    protectedPreExistingAsset: operation.kind === 'AddField' || operation.kind === 'SetPrivateListAcl'
      ? operation.listId !== null : false,
    requiresExplicitRollbackAuthority: true });
    rollback.forEach((entry, index) => { entry.reverseSequence = index + 1; });
  };
  const recover = async (operation: TenantProvisioningOperation): Promise<TenantProvisioningRecoveryResult> => {
    try { return await client.recoverOperation(operation, definitionFor(operation), rowFor(operation)); }
    catch (caught) { return { outcome: 'StillUnknown', safeCode: caught instanceof Error
      ? caught.message.split(':')[0] : 'TENANT_OPERATION_RECOVERY_FAILED' }; }
  };
  const persistOrBlock = async (operation?: TenantProvisioningOperation): Promise<boolean> => {
    sealNextReceiptRevision(receipt);
    try {
      const persisted = await client.persistReceipt(immutableTenantInput(receipt));
      if (persisted.readbackSha256 !== hashC2bCanonical(receipt))
        throw new Error('TENANT_RECEIPT_READBACK_DIGEST_MISMATCH');
      return true;
    }
    catch {
      const confirmed = operation && confirmations.find(item => item.sequence === operation.sequence);
      receipt.status = 'BlockedOff'; receipt.stopCode = 'TENANT_RECEIPT_DURABILITY_UNKNOWN';
      receipt.completedAt = now();
      if (operation) receipt.unknownOperation = { sequence: operation.sequence, kind: operation.kind,
        purpose: operation.purpose, safeCode: 'TENANT_RECEIPT_DURABILITY_UNKNOWN',
        recoveryOutcome: confirmed ? 'Applied' : null, providerReference: confirmed?.providerReference || null,
        readbackSha256: confirmed?.readbackSha256 || null };
      return false;
    }
  };

  if (prior) {
    for (const confirmation of prior.confirmations) {
      const operation = plan.operations[confirmation.sequence - 1];
      const recovered = await recover(operation);
      if (recovered.outcome !== 'Applied' || recovered.providerReference !== confirmation.providerReference) {
        receipt.status = 'BlockedOff'; receipt.stopCode = 'TENANT_RECEIPT_CURRENT_STATE_MISMATCH';
        receipt.completedAt = now(); receipt.unknownOperation = { sequence: operation.sequence, kind: operation.kind,
          purpose: operation.purpose, safeCode: receipt.stopCode, recoveryOutcome: recovered.outcome,
          providerReference: recovered.outcome === 'Applied' || recovered.outcome === 'PartiallyApplied'
            ? recovered.providerReference : null,
          readbackSha256: recovered.outcome === 'Applied' || recovered.outcome === 'PartiallyApplied'
            ? recovered.readbackSha256 : null };
        sealNextReceiptRevision(receipt);
        return { plan, receipt };
      }
    }
  }

  if (mode === 'Apply') {
    if (prior?.pendingOperation || prior?.unknownOperation) {
      const identity = prior.pendingOperation || prior.unknownOperation!;
      const pending = plan.operations.find(operation => operation.sequence === identity.sequence
        && operation.kind === identity.kind && operation.purpose === identity.purpose);
      if (!pending) fail('TENANT_RECEIPT_RECOVERY_OPERATION_MISMATCH', 'The pending operation is not in the receipted plan.');
      const exactPending = pending as TenantProvisioningOperation;
      const recovered = await recover(exactPending);
      if (recovered.outcome === 'StillUnknown') {
        receipt.status = 'BlockedOff'; receipt.stopCode = recovered.safeCode;
        receipt.unknownOperation = { sequence: exactPending.sequence, kind: exactPending.kind, purpose: exactPending.purpose,
          safeCode: recovered.safeCode, recoveryOutcome: 'StillUnknown', providerReference: null, readbackSha256: null };
        receipt.completedAt = now(); await persistOrBlock(exactPending); return { plan, receipt };
      }
      if (recovered.outcome === 'PartiallyApplied') {
        addRollback(exactPending, recovered); receipt.status = 'BlockedOff'; receipt.stopCode = recovered.safeCode;
        receipt.unknownOperation = { sequence: exactPending.sequence, kind: exactPending.kind, purpose: exactPending.purpose,
          safeCode: recovered.safeCode, recoveryOutcome: 'PartiallyApplied',
          providerReference: recovered.providerReference, readbackSha256: recovered.readbackSha256 };
        receipt.completedAt = now(); await persistOrBlock(exactPending); return { plan, receipt };
      }
      if (recovered.outcome === 'Applied') addRecovered(exactPending, recovered, 'ReplayConfirmed');
      receipt.pendingOperation = null; receipt.unknownOperation = null; receipt.status = 'InProgress'; receipt.stopCode = null;
      receipt.completedAt = now();
      if (!await persistOrBlock(exactPending)) return { plan, receipt };
    } else if (!prior && !await persistOrBlock()) return { plan, receipt };

    for (const operation of plan.operations) {
      if (confirmations.some(item => item.sequence === operation.sequence)) continue;
      const current = immutableTenantInput(await client.observe());
      const currentPlan = planBehaviourV2TenantProvisioning(immutableSchema, immutableProductData, current, 'DryRun',
        immutableAuthority);
      const sameOperation = currentPlan.operations.find(candidate => candidate.kind === operation.kind
        && candidate.purpose === operation.purpose
        && (candidate.kind !== 'AddField' || operation.kind !== 'AddField' || candidate.field === operation.field)
        && (candidate.kind !== 'InsertRow' || operation.kind !== 'InsertRow'
          || candidate.stableKey === operation.stableKey)
        && (candidate.kind === 'InsertRow' && operation.kind === 'InsertRow'
          ? candidate.rowSha256 === operation.rowSha256
          : candidate.kind !== 'InsertRow' && operation.kind !== 'InsertRow'
            && candidate.definitionSha256 === operation.definitionSha256));
      if (!sameOperation) {
        receipt.status = 'BlockedOff'; receipt.stopCode = 'TENANT_OPERATION_RACE_COLLISION'; receipt.completedAt = now();
        receipt.afterStateSha256 = hashC2bCanonical(current); receipt.unknownOperation = {
          sequence: operation.sequence, kind: operation.kind, purpose: operation.purpose,
          safeCode: receipt.stopCode, recoveryOutcome: 'NotApplied', providerReference: null, readbackSha256: null };
        await persistOrBlock(operation); return { plan, receipt };
      }
      receipt.pendingOperation = { sequence: operation.sequence, kind: operation.kind, purpose: operation.purpose };
      receipt.completedAt = now();
      if (!await persistOrBlock(operation)) return { plan, receipt };
      const definition = definitionFor(sameOperation);
      const row = rowFor(sameOperation);
      const executionInputMatchesReceipt = sameOperation.kind === 'AddList' && operation.kind === 'AddList'
        ? hashC2bCanonical(definition) === operation.definitionSha256
        : sameOperation.kind === 'SetPrivateListAcl' && operation.kind === 'SetPrivateListAcl'
          ? hashC2bCanonical({ purpose: definition.purpose, title: definition.title,
            permissionCapability: definition.permissionCapability }) === operation.definitionSha256
        : sameOperation.kind === 'AddField' && operation.kind === 'AddField'
          ? hashC2bCanonical(definition.fields.find(item => item.internalName === sameOperation.field))
            === operation.definitionSha256
          : sameOperation.kind === 'InsertRow' && operation.kind === 'InsertRow' && row !== undefined
            && hashC2bCanonical(row) === operation.rowSha256;
      if (!executionInputMatchesReceipt) {
        receipt.status = 'BlockedOff'; receipt.stopCode = 'TENANT_OPERATION_INPUT_DIGEST_MISMATCH';
        receipt.completedAt = now(); receipt.unknownOperation = { sequence: operation.sequence, kind: operation.kind,
          purpose: operation.purpose, safeCode: receipt.stopCode, recoveryOutcome: 'NotApplied',
          providerReference: null, readbackSha256: null };
        await persistOrBlock(operation); return { plan, receipt };
      }
      let mutation: TenantProvisioningMutationResult;
      try {
        if (sameOperation.kind === 'AddList') {
          mutation = await client.addList(definition);
        } else if (sameOperation.kind === 'SetPrivateListAcl') {
          const listId = sameOperation.listId || fail('TENANT_CREATED_LIST_ID_ABSENT',
            `${sameOperation.listTitle} was not re-discovered by exact GUID.`);
          mutation = await client.reconcilePrivateListAcl(listId, definition);
        } else if (sameOperation.kind === 'AddField') {
          const field = definition.fields.find(item => item.internalName === sameOperation.field)!;
          const listId = sameOperation.listId || fail('TENANT_CREATED_LIST_ID_ABSENT',
            `${sameOperation.listTitle} was not re-discovered by exact GUID.`);
          mutation = await client.addField(listId, field);
        } else {
          mutation = await client.insertRow(sameOperation.listId, sameOperation.keyField, row!);
        }
      } catch (caught) {
        mutation = { outcome: 'Unknown', safeCode: caught instanceof Error && /network|fetch|connection|abort/i.test(caught.message)
          ? 'CONNECTION_INTERRUPTED' : 'PROVIDER_UNKNOWN' };
      }
      if (mutation.outcome === 'Unknown') {
        const recovered = await recover(operation);
        receipt.status = 'BlockedOff'; receipt.stopCode = `TENANT_OPERATION_${mutation.safeCode}`;
        receipt.unknownOperation = { sequence: operation.sequence, kind: operation.kind,
          purpose: operation.purpose, safeCode: mutation.safeCode, recoveryOutcome: recovered.outcome,
          providerReference: recovered.outcome === 'Applied' || recovered.outcome === 'PartiallyApplied'
            ? recovered.providerReference : null,
          readbackSha256: recovered.outcome === 'Applied' || recovered.outcome === 'PartiallyApplied'
            ? recovered.readbackSha256 : null };
        if (recovered.outcome === 'Applied') addRecovered(operation, recovered, 'ReplayConfirmed');
        if (recovered.outcome === 'PartiallyApplied') addRollback(operation, recovered);
        receipt.completedAt = now();
        const unknownAfter = await client.observe(); receipt.afterStateSha256 = hashC2bCanonical(unknownAfter);
        await persistOrBlock(operation); return { plan, receipt };
      }
      addRecovered(operation, mutation, 'Confirmed');
      receipt.pendingOperation = null;
      receipt.completedAt = now();
      if (!await persistOrBlock(operation)) return { plan, receipt };
    }
  }
  const after = mode === 'Apply' ? immutableTenantInput(await client.observe()) : before;
  if (mode === 'Apply') {
    const postPlan = planBehaviourV2TenantProvisioning(immutableSchema, immutableProductData, after, 'DryRun',
      immutableAuthority);
    if (postPlan.operations.length) {
      receipt.status = 'BlockedOff'; receipt.stopCode = 'TENANT_AFTER_READBACK_INCOMPLETE';
      receipt.afterStateSha256 = hashC2bCanonical(after); receipt.completedAt = now();
      await persistOrBlock(); return { plan, receipt };
    }
    receipt.status = 'Completed'; receipt.pendingOperation = null; receipt.completedAt = now();
    receipt.afterStateSha256 = hashC2bCanonical(after);
    await persistOrBlock();
  }
  return { plan, receipt };
}
