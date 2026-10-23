/* eslint-disable @typescript-eslint/explicit-function-return-type, @rushstack/no-new-null -- compact synthetic client helpers */
jest.mock('./TenantTargetClassification', () => ({
  ...jest.requireActual('./TenantTargetClassification'),
  assertKcfAutomationTenantTarget: () => ({
    deploymentClassification: 'NonProduction', platformEnvironmentType: 'Default',
    evidenceSha256: 'A'.repeat(64), authorityReference: 'KCF-KPI-Sponsor-M013'
  })
}));

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BEHAVIOUR_V2_RATING_OPTIONS } from '../BehaviourFrameworkV2Policy';
import { hashC2bCanonical } from '../TestPilotCommandAdmissionC2b';

import {
  executeBehaviourV2TenantProvisioning,
  planBehaviourV2TenantProvisioning,
  type IBehaviourV2ProductDataPacket,
  type IBehaviourV2RoleLevelAuthority,
  type IBehaviourV2TenantProvisioningClient,
  type IBehaviourV2TenantSchema,
  type ITenantFieldDefinition,
  type ITenantAuthenticatedReceiptChain,
  type ITenantListDefinition,
  type ITenantListObservation,
  type ITenantProvisioningPlan,
  type ITenantProvisioningReceiptAuthority,
  type ITenantProvisioningReceipt,
  type ITenantProvisioningSnapshot,
  type TenantProvisioningOperation,
  type TenantProvisioningRecoveryResult
} from './BehaviourV2TenantProvisioner';
import type { ITenantTargetEvidence } from './TenantTargetClassification';

const tenantRoot = resolve('power-platform', 'KCFKPIEmployeeTESTProcessor', 'TenantLayer');
const schema = JSON.parse(readFileSync(resolve(tenantRoot, 'Schema', 'behaviour-v2-sharepoint-schema.json'), 'utf8')) as IBehaviourV2TenantSchema;
const emptyData = JSON.parse(readFileSync(resolve(tenantRoot, 'Data', 'product-data.template.json'), 'utf8')) as IBehaviourV2ProductDataPacket;

const targetEvidence: ITenantTargetEvidence = {
  platformEnvironmentType: 'Default', environmentId: 'synthetic', siteUrl: 'synthetic',
  siteCollectionId: 'synthetic', rootWebId: 'synthetic', appCatalogueScope: 'SiteCollection',
  authorityReference: 'KCF-KPI-Sponsor-M013', testOnlyBindings: true, productionExcluded: true
};
const id = (index: number): string => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const observedList = (definition: ITenantListDefinition, index: number): ITenantListObservation => ({
  purpose: definition.purpose, title: definition.title, listId: id(index), schemaRevision: definition.schemaRevision,
  baseTemplate: definition.baseTemplate,
  titleRequired: definition.titleRequired, majorVersioningEnabled: definition.majorVersioningEnabled,
  foldersEnabled: definition.foldersEnabled, fields: [...definition.fields, ...(definition.requiredExistingFields || [])]
    .map(field => ({ ...field })),
  rows: [], pagingComplete: true,
  ...(definition.permissionCapability ? { permissionCapability: 'PrivateProcessorOnly' as const } : {})
});
const snapshot = (includeAddable: boolean): ITenantProvisioningSnapshot => ({
  targetEvidence, productionReferenceObserved: false, activeOldFlowObserved: false,
  bindings: schema.lists.map((list, index) => ({ purpose: list.purpose, title: list.title,
    listId: includeAddable || !list.createIfMissing ? id(index + 1) : null, schemaRevision: list.schemaRevision })),
  lists: schema.lists.filter(list => includeAddable || !list.createIfMissing)
    .map(list => observedList(list, schema.lists.indexOf(list) + 1))
});
const receiptDefinition = schema.lists.find(list => list.purpose === 'TenantProvisioningReceipts')!;
const receiptListId = id(schema.lists.indexOf(receiptDefinition) + 1);
const receiptFieldInventory = [...receiptDefinition.fields].sort((left, right) =>
  left.internalName.localeCompare(right.internalName));
const receiptFieldInventorySha256 = hashC2bCanonical(receiptFieldInventory);

class MemoryProvisioningClient implements IBehaviourV2TenantProvisioningClient {
  public readonly calls: string[] = [];
  public readonly receipts: string[] = [];
  public readonly insertedRows: Array<{ purpose: string; row: Readonly<Record<string, unknown>> }> = [];
  public mutateOnObserve: { count: number; apply: () => void } | null = null;
  public unknownOnCall: number | null = null;
  public raceOnObserve: number | null = null;
  public failReceiptAtConfirmationCount: number | null = null;
  public receiptFailuresRemaining = 0;
  public partialRecoveryForSequence: number | null = null;
  public receiptChainMutation: ((chain: ITenantAuthenticatedReceiptChain) => void) | null = null;
  private readonly storedReceiptRevisions = new Map<string, ITenantProvisioningReceipt[]>();
  private readonly lists: ITenantListObservation[];
  private readonly bindings: ITenantProvisioningSnapshot['bindings'];
  private observeCount = 0;
  public constructor(initial: ITenantProvisioningSnapshot) {
    this.lists = initial.lists.map(list => ({ ...list, fields: list.fields.map(field => ({ ...field })),
      rows: list.rows.map(row => ({ ...row, fields: { ...row.fields } })) }));
    this.bindings = initial.bindings.map(binding => ({ ...binding }));
  }
  public observe() {
    this.observeCount += 1;
    if (this.mutateOnObserve?.count === this.observeCount) {
      this.mutateOnObserve.apply();
      this.mutateOnObserve = null;
    }
    if (this.raceOnObserve === this.observeCount) {
      const definition = schema.lists.find(list => list.createIfMissing && !this.lists.some(item => item.purpose === list.purpose));
      if (definition) {
        const listId = id(this.lists.length + 20);
        this.lists.push(observedList(definition, this.lists.length + 20));
        const binding = this.bindings.find(item => item.purpose === definition.purpose)!;
        (binding as { listId: string | null }).listId = listId;
      }
    }
    return Promise.resolve({ targetEvidence, productionReferenceObserved: false,
      activeOldFlowObserved: false, bindings: this.bindings, lists: this.lists });
  }
  public addList(definition: ITenantListDefinition) {
    const listId = id(this.lists.length + 10);
    this.calls.push(`AddList:${definition.title}`);
    this.lists.push({ purpose: definition.purpose, title: definition.title, listId,
      schemaRevision: definition.schemaRevision, baseTemplate: 100, titleRequired: false,
      majorVersioningEnabled: true, foldersEnabled: false, fields: [], rows: [], pagingComplete: true,
      ...(definition.permissionCapability ? { permissionCapability: 'Inherited' as const } : {}) });
    (this.bindings.find(item => item.purpose === definition.purpose)! as { listId: string | null }).listId = listId;
    if (this.unknownOnCall === this.calls.length) return Promise.resolve({ outcome: 'Unknown' as const,
      safeCode: 'TIMEOUT_UNKNOWN' as const });
    return Promise.resolve({ outcome: 'Confirmed' as const, providerReference: `list:${listId}`, listId,
      readbackSha256: hashC2bCanonical(this.lists[this.lists.length - 1]) });
  }
  public reconcilePrivateListAcl(listId: string, definition: ITenantListDefinition) {
    this.calls.push(`SetPrivateListAcl:${listId}`);
    const list = this.lists.find(item => item.listId === listId && item.purpose === definition.purpose)!;
    (list as { permissionCapability?: 'PrivateProcessorOnly' | 'Inherited' | 'Unknown' }).permissionCapability =
      'PrivateProcessorOnly';
    if (this.unknownOnCall === this.calls.length) return Promise.resolve({ outcome: 'Unknown' as const,
      safeCode: 'TIMEOUT_UNKNOWN' as const });
    return Promise.resolve({ outcome: 'Confirmed' as const, providerReference: `list:${listId}:acl`,
      readbackSha256: hashC2bCanonical({ permissionCapability: list.permissionCapability }) });
  }
  public addField(listId: string, definition: ITenantFieldDefinition) {
    this.calls.push(`AddField:${listId}:${definition.internalName}`);
    const list = this.lists.find(item => item.listId === listId)!;
    (list.fields as ITenantFieldDefinition[]).push({ ...definition });
    if (this.unknownOnCall === this.calls.length) return Promise.resolve({ outcome: 'Unknown' as const,
      safeCode: 'TIMEOUT_UNKNOWN' as const });
    return Promise.resolve({ outcome: 'Confirmed' as const,
      providerReference: `list:${listId}:field:${definition.internalName}`, readbackSha256: hashC2bCanonical(definition) });
  }
  public insertRow(listId: string, stableKeyField: string, row: Readonly<Record<string, unknown>>) {
    this.calls.push(`InsertRow:${listId}:${String(row[stableKeyField])}`);
    const list = this.lists.find(item => item.listId === listId)!;
    this.insertedRows.push({ purpose: list.purpose, row: { ...row } });
    (list.rows as Array<{ itemId: number; etag: string; version: string; fields: Readonly<Record<string, unknown>> }>).push({
      itemId: list.rows.length + 1, etag: `"${list.rows.length + 1}"`, version: '1.0', fields: { ...row }
    });
    if (this.unknownOnCall === this.calls.length) return Promise.resolve({ outcome: 'Unknown' as const,
      safeCode: 'TIMEOUT_UNKNOWN' as const });
    return Promise.resolve({ outcome: 'Confirmed' as const,
      providerReference: `list:${listId}:item:${list.rows.length}`, readbackSha256: hashC2bCanonical(row) });
  }
  public recoverOperation(operation: TenantProvisioningOperation, definition: ITenantListDefinition,
    row?: Readonly<Record<string, unknown>>): Promise<TenantProvisioningRecoveryResult> {
    if (this.partialRecoveryForSequence === operation.sequence) return Promise.resolve({
      outcome: 'PartiallyApplied', providerReference: `partial:${operation.sequence}`,
      readbackSha256: 'F'.repeat(64), safeCode: 'TENANT_RECOVERY_SYNTHETIC_PARTIAL'
    });
    const list = this.lists.find(item => item.purpose === operation.purpose);
    if (operation.kind === 'AddList') {
      return Promise.resolve(list ? { outcome: 'Applied', providerReference: `list:${list.listId}`,
        listId: list.listId, readbackSha256: hashC2bCanonical(list) } : { outcome: 'NotApplied' });
    }
    if (!list) return Promise.resolve({ outcome: 'StillUnknown', safeCode: 'TENANT_RECOVERY_LIST_ID_ABSENT' });
    if (operation.kind === 'SetPrivateListAcl') {
      return Promise.resolve(list.permissionCapability === 'PrivateProcessorOnly'
        ? { outcome: 'Applied', providerReference: `list:${list.listId}:acl`,
          readbackSha256: hashC2bCanonical({ permissionCapability: list.permissionCapability }) }
        : list.permissionCapability === 'Inherited' ? { outcome: 'NotApplied' }
          : { outcome: 'PartiallyApplied', providerReference: `list:${list.listId}:acl`,
            readbackSha256: hashC2bCanonical({ permissionCapability: list.permissionCapability }),
            safeCode: 'TENANT_RECOVERY_PRIVATE_LIST_ACL_AMBIGUOUS' });
    }
    if (operation.kind === 'AddField') {
      const field = list.fields.find(item => item.internalName === operation.field);
      if (!field) return Promise.resolve({ outcome: 'NotApplied' });
      const expected = definition.fields.find(item => item.internalName === operation.field)!;
      return Promise.resolve(hashC2bCanonical(field) === hashC2bCanonical(expected)
        ? { outcome: 'Applied', providerReference: `list:${list.listId}:field:${operation.field}`,
          readbackSha256: hashC2bCanonical(field) }
        : { outcome: 'PartiallyApplied', providerReference: `list:${list.listId}:field:${operation.field}`,
          readbackSha256: hashC2bCanonical(field), safeCode: 'TENANT_RECOVERY_FIELD_CONFLICT' });
    }
    const matches = list.rows.filter(item => item.fields[operation.keyField] === operation.stableKey);
    if (!matches.length) return Promise.resolve({ outcome: 'NotApplied' });
    const comparable = Object.keys(row || {}).reduce<Record<string, unknown>>((result, key) => {
      result[key] = matches[0].fields[key]; return result;
    }, {});
    return Promise.resolve(matches.length === 1 && hashC2bCanonical(comparable) === hashC2bCanonical(row)
      ? { outcome: 'Applied', providerReference: `list:${list.listId}:item:${matches[0].itemId}`,
        readbackSha256: hashC2bCanonical(comparable) }
      : { outcome: 'PartiallyApplied', providerReference: `list:${list.listId}:item:${matches[0].itemId}`,
        readbackSha256: hashC2bCanonical(comparable), safeCode: 'TENANT_RECOVERY_ROW_CONFLICT' });
  }
  public persistReceipt(receipt: ITenantProvisioningReceipt) {
    if (this.failReceiptAtConfirmationCount === receipt.confirmations.length && this.receiptFailuresRemaining > 0) {
      this.receiptFailuresRemaining -= 1; return Promise.reject(new Error('TENANT_RECEIPT_DURABILITY_UNKNOWN'));
    }
    const value = `${receipt.status}:${receipt.confirmations.length}`; this.receipts.push(value);
    const revisions = this.storedReceiptRevisions.get(receipt.receiptKey) || [];
    revisions.push(JSON.parse(JSON.stringify(receipt)) as ITenantProvisioningReceipt);
    this.storedReceiptRevisions.set(receipt.receiptKey, revisions);
    return Promise.resolve({ providerReference: `receipt:${this.receipts.length}`, readbackSha256: hashC2bCanonical(receipt) });
  }
  public seedReceiptChain(receiptKey: string, revisions: readonly ITenantProvisioningReceipt[]): void {
    this.storedReceiptRevisions.set(receiptKey,
      revisions.map(receipt => JSON.parse(JSON.stringify(receipt)) as ITenantProvisioningReceipt));
  }
  public readReceiptChain(receiptKey: string) {
    const revisions = this.storedReceiptRevisions.get(receiptKey);
    if (!revisions) return Promise.resolve(undefined);
    const chain = { receiptListId, receiptListTitle: 'KCFKPI_TEST_TenantProvisioningReceipts',
      schemaRevision: 'kcf-wib12-provisioning-receipt-v1', fieldInventorySha256: receiptFieldInventorySha256,
      writerPrincipalKey: 'PROCESSOR', writerPrincipalId: 101, itemId: revisions.length + 16,
      itemVersion: '1.0', etag: `"receipt-${revisions.length}"`, revisionEvidence: revisions.map((receipt, index) => ({
        revision: receipt.revision, receiptSha256: receipt.receiptSha256, itemId: index + 17,
        itemVersion: '1.0', etag: `"receipt-${index + 1}"`, authorPrincipalId: 101, editorPrincipalId: 101
      })), revisions };
    this.receiptChainMutation?.(chain);
    return Promise.resolve(chain);
  }
}

const governedRoleLevelNames = {
  L1: 'Synthetic IC / Officer', L2: 'Synthetic People Manager', L3: 'Synthetic Senior Leader'
} as const;
const roleLevelAuthority = (data: IBehaviourV2ProductDataPacket = emptyData): IBehaviourV2RoleLevelAuthority => ({
  authorityReference: 'SYNTHETIC-UNIT-TEST', roleLevelNames: { ...governedRoleLevelNames },
  schemaAuthority: { authorityReference: 'SYNTHETIC-SCHEMA-AUTHORITY', schemaSha256: hashC2bCanonical(schema),
    listInventorySha256: hashC2bCanonical(schema.lists) },
  productAuthority: { authorityReference: data.approvalReference, productDataSha256: hashC2bCanonical(data),
    frameworkVersion: data.frameworkSets.length ? String(data.frameworkSets[0].FrameworkVersion) : null,
    catalogueDigestSha256: data.catalogueBinding?.canonicalDigestSha256 || null, fixtureRange: data.fixtureRange,
    actorPrincipalMapSha256: hashC2bCanonical(data.principalBindings.map(row => ({ personKey: row.personKey,
      assignmentKey: row.assignmentKey, principalKey: row.principalKey, category: row.category }))
      .sort((left, right) => String(left.personKey).localeCompare(String(right.personKey)))),
    historicEvidenceReferences: data.historicEvidence.map(row => String(row.reference || '')).sort() }
});
const receiptAuthority: ITenantProvisioningReceiptAuthority = {
  contractVersion: 'kcf.kpi.wib12.receipt-authority.v1', authorityReference: 'SYNTHETIC-RECEIPT-AUTHORITY',
  receiptListId, receiptListTitle: 'KCFKPI_TEST_TenantProvisioningReceipts',
  schemaRevision: 'kcf-wib12-provisioning-receipt-v1',
  baseTemplate: 100, majorVersioningEnabled: true, foldersEnabled: false,
  keyField: 'ReceiptRevisionKey', seriesKeyField: 'ReceiptKey', chunkPrefix: 'ReceiptChunk',
  chunkCount: 16, maximumCodeUnits: 960000, fieldInventory: receiptFieldInventory,
  fieldInventorySha256: receiptFieldInventorySha256,
  writerPrincipalKey: 'PROCESSOR', writerPrincipalId: 101
};

const resumableReceipt = (sourcePlan: ITenantProvisioningPlan): ITenantProvisioningReceipt => {
  const plan = JSON.parse(JSON.stringify(sourcePlan)) as ITenantProvisioningPlan;
  const unsignedPlan = Object.keys(plan).filter(key => key !== 'planSha256').reduce<Record<string, unknown>>((result, key) => {
    result[key] = plan[key as keyof ITenantProvisioningPlan]; return result;
  }, {});
  plan.planSha256 = hashC2bCanonical(unsignedPlan);
  const receipt: ITenantProvisioningReceipt = {
    contractVersion: 'kcf.kpi.wib12.tenant-layer.v1',
    receiptSchemaVersion: 'kcf.kpi.wib12.provisioning-receipt.v1', revision: 1,
    previousReceiptSha256: null, receiptSha256: '0'.repeat(64), mode: 'Apply', applyExplicitlyEnabled: true,
    receiptKey: `tenant-provision|${plan.planSha256}`, status: 'InProgress', stopCode: null,
    unknownOperation: null, pendingOperation: null, startedAt: '2026-09-13T18:45:00Z', completedAt: '2026-09-13T18:45:00Z',
    planSha256: plan.planSha256, plan, beforeStateSha256: plan.beforeStateSha256, afterStateSha256: null,
    confirmations: [], rollback: { requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true,
      entries: [], ambiguityOutcome: 'BLOCKED_OFF' }
  };
  const unsignedReceipt = Object.keys(receipt).filter(key => key !== 'receiptSha256')
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = receipt[key as keyof ITenantProvisioningReceipt]; return result;
    }, {});
  receipt.receiptSha256 = hashC2bCanonical(unsignedReceipt);
  return receipt;
};
const resealReceipt = (receipt: ITenantProvisioningReceipt): void => {
  const unsignedReceipt = Object.keys(receipt).filter(key => key !== 'receiptSha256')
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = receipt[key as keyof ITenantProvisioningReceipt]; return result;
    }, {});
  receipt.receiptSha256 = hashC2bCanonical(unsignedReceipt);
};
const confirmFirstOperation = (receipt: ITenantProvisioningReceipt, providerReference: string,
  readbackSha256: string): void => {
  const operation = receipt.plan.operations[0];
  receipt.confirmations = [{ sequence: operation.sequence, kind: operation.kind,
    operationSha256: hashC2bCanonical(operation), providerReference, readbackSha256,
    created: true, outcome: 'Confirmed' }];
  receipt.rollback.entries = [{ reverseSequence: 1, operationSequence: operation.sequence,
    operationSha256: hashC2bCanonical(operation), kind: operation.kind === 'AddList' ? 'RecycleCreatedList'
      : operation.kind === 'SetPrivateListAcl' ? 'RestorePrivateListAcl'
        : operation.kind === 'AddField' ? 'LeaveAddOnlyField' : 'RecycleCreatedRow',
    providerReference, protectedPreExistingAsset: (operation.kind === 'AddField'
      || operation.kind === 'SetPrivateListAcl') && operation.listId !== null,
    requiresExplicitRollbackAuthority: true }];
  resealReceipt(receipt);
};

const approvedSyntheticData = (): IBehaviourV2ProductDataPacket => {
  const roleNames: Readonly<Record<string, string>> = governedRoleLevelNames;
  const rows = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'].flatMap(valueId =>
    ['L1', 'L2', 'L3'].flatMap(tier => [1, 2, 3, 4, 5].map(order => ({
      BehaviourObjectiveKey: `${valueId}-${tier}-${String(order).padStart(2, '0')}`,
      BehaviourKey: valueId, BehaviourTitle: `Synthetic ${valueId}`, CorporateValue: `Synthetic ${valueId}`,
      RoleLevelName: roleNames[tier], DropdownLabel: `[${roleNames[tier]}] Synthetic ${order}`, ObjectiveTitle: `Synthetic ${order}`,
      SuggestedUnit: 'Synthetic unit', RoleLevelCode: tier, ObjectiveDescription: 'Synthetic description',
      SuggestedMeasure: 'Synthetic measure', SuggestedEvidence: 'Synthetic evidence', Active: true, SortOrder: order,
      EffectiveFrom: '2026-01-01', EffectiveTo: null
    }))));
  return {
    contractVersion: 'kcf.kpi.wib12.tenant-layer.v1', approvalReference: 'SYNTHETIC-UNIT-TEST',
    dateBoundaryRule: 'UTC date-only inclusive',
    frameworkSets: [{ FrameworkVersion: 'SYNTHETIC-V2', Published: true, Immutable: true, Current: true,
      ProductionSafe: true, Synthetic: false, EffectiveFrom: '2026-01-01', EffectiveTo: null,
      RatingLabelsJSON: JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS), ApprovalReference: 'SYNTHETIC-UNIT-TEST' }],
    frameworkValues: ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'].map(valueId => ({
      FrameworkValueKey: `SYNTHETIC-V2|${valueId}`, FrameworkVersion: 'SYNTHETIC-V2', ValueID: valueId,
      ValueTitle: `Synthetic ${valueId}`, CorporateValue: `Synthetic ${valueId}`,
      ICOfficerDescriptor: 'Synthetic IC', PeopleManagerDescriptor: 'Synthetic manager',
      SeniorLeaderDescriptor: 'Synthetic leader'
    })),
    personAssignments: [{ AssignmentKey: 'P-001|SYNTHETIC-V2', PersonKey: 'P-001',
      FrameworkVersion: 'SYNTHETIC-V2', RoleTier: 'IC_OFFICER', Cadence: 'Quarterly',
      PeriodKeysJSON: JSON.stringify(['Q1', 'Q2', 'Q3', 'Q4']), Active: true },
    { AssignmentKey: 'P-NEG|SYNTHETIC-V2', PersonKey: 'P-NEG',
      FrameworkVersion: 'SYNTHETIC-V2', RoleTier: 'PEOPLE_MANAGER', Cadence: 'TwiceYearly',
      PeriodKeysJSON: JSON.stringify(['H1', 'H2']), Active: true }],
    behaviourObjectiveLibrary: rows,
    peopleBindings: [{ PersonKey: 'P-001', BehaviourFrameworkVersionV2: 'SYNTHETIC-V2',
      BehaviourRoleTierV2: 'IC_OFFICER', BehaviourCadenceV2: 'Quarterly' },
    { PersonKey: 'P-NEG', BehaviourFrameworkVersionV2: 'SYNTHETIC-V2',
      BehaviourRoleTierV2: 'PEOPLE_MANAGER', BehaviourCadenceV2: 'TwiceYearly' }],
    roleLevelBindings: [
      { sourceRoleLevelCode: 'L1', roleTier: 'IC_OFFICER', roleLevelName: roleNames.L1,
        approvalReference: 'SYNTHETIC-UNIT-TEST' },
      { sourceRoleLevelCode: 'L2', roleTier: 'PEOPLE_MANAGER', roleLevelName: roleNames.L2,
        approvalReference: 'SYNTHETIC-UNIT-TEST' },
      { sourceRoleLevelCode: 'L3', roleTier: 'SENIOR_LEADER', roleLevelName: roleNames.L3,
        approvalReference: 'SYNTHETIC-UNIT-TEST' }
    ],
    principalBindings: [
      { personKey: 'P-001', assignmentKey: 'P-001|SYNTHETIC-V2', principalKey: 'PRINCIPAL-POSITIVE',
        category: 'Positive', approvalReference: 'SYNTHETIC-UNIT-TEST' },
      { personKey: 'P-NEG', assignmentKey: 'P-NEG|SYNTHETIC-V2', principalKey: 'PRINCIPAL-NEGATIVE',
        category: 'Negative', approvalReference: 'SYNTHETIC-UNIT-TEST' }
    ],
    historicEvidence: [{ status: 'Blocked', reference: 'SYNTHETIC-HISTORIC', reason: 'No fixture in unit test.',
      frameworkVersion: 'SYNTHETIC-V2', approvalReference: 'SYNTHETIC-UNIT-TEST' }],
    positiveActors: ['P-001'], negativeActors: ['P-NEG'], fixtureRange: 'SYNTHETIC',
    fixtureAuthorityReference: 'SYNTHETIC-UNIT-TEST',
    catalogueBinding: { frameworkVersion: 'SYNTHETIC-V2', canonicalDigestSha256: hashC2bCanonical(rows) }
  };
};

describe('WI-B12 deterministic add-only tenant provisioner', () => {
  it('plans the five missing governed lists and their exact 73 fields without writing in DryRun', async () => {
    const client = new MemoryProvisioningClient(snapshot(false));
    const { plan, receipt } = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { now: () => '2026-09-13T18:45:00Z', roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(plan.operations.filter(operation => operation.kind === 'AddList')).toHaveLength(5);
    expect(plan.operations.filter(operation => operation.kind === 'AddField')).toHaveLength(73);
    expect(plan.operations.filter(operation => operation.kind === 'SetPrivateListAcl')).toHaveLength(2);
    expect(plan.operations).toHaveLength(80);
    expect(client.calls).toEqual([]);
    expect(receipt).toMatchObject({ mode: 'DryRun', status: 'Completed', applyExplicitlyEnabled: false, confirmations: [],
      rollback: { requiredFirstAction: 'TurnNewFlowOff', flowMustRemainOff: true, ambiguityOutcome: 'BLOCKED_OFF' } });
  });

  it('keeps Apply disabled until a separate explicit enable is present', async () => {
    const client = new MemoryProvisioningClient(snapshot(false));
    await expect(executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', roleLevelAuthority: roleLevelAuthority(emptyData) }))
      .rejects.toThrow(/TENANT_APPLY_DISABLED/);
    expect(client.calls).toEqual([]);
  });

  it('applies add-only operations, performs complete after-readback and produces rollback receipts', async () => {
    const client = new MemoryProvisioningClient(snapshot(false));
    const { plan, receipt } = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, now: () => '2026-09-13T18:45:00Z',
        roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(client.calls).toHaveLength(plan.operations.length);
    expect(receipt.confirmations).toHaveLength(plan.operations.length);
    expect(receipt.afterStateSha256).toMatch(/^[0-9A-F]{64}$/);
    expect(receipt.rollback.entries[0].reverseSequence).toBe(1);
    expect(receipt.rollback.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'RecycleCreatedList', requiresExplicitRollbackAuthority: true }),
      expect.objectContaining({ kind: 'LeaveAddOnlyField', requiresExplicitRollbackAuthority: true })
    ]));
  });

  it('treats exact existing schema and byte-equivalent stable-key rows as no-ops', () => {
    const complete = snapshot(true);
    const data = approvedSyntheticData();
    for (const definition of schema.lists) {
      const rows = definition.purpose === 'BehaviourFrameworkSets' ? data.frameworkSets
        : definition.purpose === 'BehaviourFrameworkValues' ? data.frameworkValues
          : definition.purpose === 'PersonBehaviourAssignments' ? data.personAssignments
            : definition.purpose === 'BehaviourObjectiveLibrary' ? data.behaviourObjectiveLibrary
              : definition.purpose === 'People' ? data.peopleBindings : [];
      const list = complete.lists.find(item => item.title === definition.title)!;
      (list.rows as Array<{ itemId: number; etag: string; version: string; fields: Readonly<Record<string, unknown>> }>).push(
        ...rows.map((row, index) => ({ itemId: index + 1, etag: `"${index + 1}"`, version: '1.0', fields: { ...row } }))
      );
    }
    const plan = planBehaviourV2TenantProvisioning(schema, data, complete, 'DryRun', roleLevelAuthority(data));
    expect(plan.operations).toEqual([]);
    expect(plan.noOpAssets.some(asset => asset.includes('BHV-01-L1-01'))).toBe(true);
  });

  it('stops on a differing same-key row, schema coercion, incomplete paging or Production reference', () => {
    const data = approvedSyntheticData();
    const conflict = snapshot(true);
    const library = conflict.lists.find(list => list.title === 'KCFKPI_BehaviourObjectiveLibrary')!;
    (library.rows as Array<{ itemId: number; etag: string; version: string; fields: Readonly<Record<string, unknown>> }>).push({
      itemId: 1, etag: '"1"', version: '1.0', fields: { ...data.behaviourObjectiveLibrary[0], ObjectiveTitle: 'DIFFERENT' }
    });
    expect(() => planBehaviourV2TenantProvisioning(schema, data, conflict, 'DryRun', roleLevelAuthority(data)))
      .toThrow(/TENANT_NO_OVERWRITE_CONFLICT/);

    const coerced = snapshot(true);
    const field = coerced.lists[0].fields[0] as ITenantFieldDefinition;
    field.type = 'Note';
    expect(() => planBehaviourV2TenantProvisioning(schema, emptyData, coerced, 'DryRun', roleLevelAuthority(emptyData)))
      .toThrow(/TENANT_FIELD_SCHEMA_CONFLICT/);

    const incomplete = snapshot(true); (incomplete.lists[0] as { pagingComplete: boolean }).pagingComplete = false;
    expect(() => planBehaviourV2TenantProvisioning(schema, emptyData, incomplete, 'DryRun', roleLevelAuthority(emptyData)))
      .toThrow(/TENANT_INCOMPLETE_PAGE/);

    const production = snapshot(true); production.productionReferenceObserved = true;
    expect(() => planBehaviourV2TenantProvisioning(schema, emptyData, production, 'DryRun', roleLevelAuthority(emptyData)))
      .toThrow(/TENANT_PRODUCTION_REFERENCE/);
  });

  it.each([
    ['partial framework', (data: IBehaviourV2ProductDataPacket) => { delete (data.frameworkSets[0] as Record<string, unknown>).Immutable; }],
    ['crossed composite key', (data: IBehaviourV2ProductDataPacket) => {
      (data.frameworkValues[0] as Record<string, unknown>).FrameworkValueKey = 'CROSSED'; }],
    ['malformed periods', (data: IBehaviourV2ProductDataPacket) => {
      (data.personAssignments[0] as Record<string, unknown>).PeriodKeysJSON = JSON.stringify(['Q1']); }],
    ['catalogue distribution collision', (data: IBehaviourV2ProductDataPacket) => {
      (data.behaviourObjectiveLibrary[1] as Record<string, unknown>).SortOrder = 1;
      (data.behaviourObjectiveLibrary[1] as Record<string, unknown>).BehaviourObjectiveKey = 'BHV-01-L1-01'; }],
    ['wrong catalogue digest', (data: IBehaviourV2ProductDataPacket) => {
      data.catalogueBinding!.canonicalDigestSha256 = '0'.repeat(64); }],
    ['missing negative actor', (data: IBehaviourV2ProductDataPacket) => {
      (data as { negativeActors: readonly string[] }).negativeActors = []; }],
    ['impossible calendar date', (data: IBehaviourV2ProductDataPacket) => {
      (data.frameworkSets[0] as Record<string, unknown>).EffectiveFrom = '2026-02-31'; }],
    ['invalid non-leap date', (data: IBehaviourV2ProductDataPacket) => {
      (data.frameworkSets[0] as Record<string, unknown>).EffectiveFrom = '2026-02-29'; }],
    ['crossed canonical role name', (data: IBehaviourV2ProductDataPacket) => {
      (data.behaviourObjectiveLibrary[0] as Record<string, unknown>).RoleLevelName = 'Synthetic Senior Leader'; }],
    ['arbitrary actor without principal identity', (data: IBehaviourV2ProductDataPacket) => {
      (data as { positiveActors: readonly string[] }).positiveActors = ['ARBITRARY']; }],
    ['crossed historic framework', (data: IBehaviourV2ProductDataPacket) => {
      (data.historicEvidence[0] as Record<string, unknown>).frameworkVersion = 'CROSSED'; }],
    ['crossed proven historic principal', (data: IBehaviourV2ProductDataPacket) => {
      data.historicEvidence = [{ status: 'Proven', reference: 'SYNTHETIC-PROOF',
        workplanKey: 'P-001|2026', quarterReviewKey: 'P-001|2026|Q1', itemKey: 'ITEM-1',
        storedSnapshotsSha256: 'A'.repeat(64), frameworkVersion: 'SYNTHETIC-V2', personKey: 'P-001',
        assignmentKey: 'P-001|SYNTHETIC-V2', principalKey: 'CROSSED',
        catalogueDigestSha256: data.catalogueBinding!.canonicalDigestSha256 }]; }]
  ])('rejects %s before any plan/write', (_label, mutate) => {
    const data = approvedSyntheticData(); mutate(data);
    expect(() => planBehaviourV2TenantProvisioning(schema, data, snapshot(true), 'DryRun', roleLevelAuthority(data)))
      .toThrow(/TENANT_/);
  });

  it('rejects a caller-consistent L1 display-name substitution against independent governed authority', () => {
    const data = approvedSyntheticData();
    const l1Binding = data.roleLevelBindings.find(row => row.sourceRoleLevelCode === 'L1') as Record<string, unknown>;
    l1Binding.roleLevelName = 'Injected Alternate Name';
    data.behaviourObjectiveLibrary.filter(row => row.RoleLevelCode === 'L1').forEach(row => {
      (row as Record<string, unknown>).RoleLevelName = 'Injected Alternate Name';
      (row as Record<string, unknown>).DropdownLabel = `[Injected Alternate Name] ${String(row.ObjectiveTitle)}`;
    });
    data.catalogueBinding!.canonicalDigestSha256 = hashC2bCanonical(data.behaviourObjectiveLibrary);
    expect(() => planBehaviourV2TenantProvisioning(schema, data, snapshot(true), 'DryRun', roleLevelAuthority(data)))
      .toThrow(/TENANT_ROLE_LEVEL_BINDING_INVALID/);
  });

  it('rejects added schema inventory, self-consistent Product replacement and cross-class principal collision', () => {
    const expandedSchema = JSON.parse(JSON.stringify(schema)) as IBehaviourV2TenantSchema;
    (expandedSchema.lists as ITenantListDefinition[]).push({ ...expandedSchema.lists[0],
      purpose: 'InjectedUnreviewedList', title: 'InjectedUnreviewedList' });
    expect(() => planBehaviourV2TenantProvisioning(expandedSchema, emptyData, snapshot(true), 'DryRun',
      roleLevelAuthority(emptyData))).toThrow(/TENANT_INDEPENDENT_AUTHORITY_MISMATCH/);

    const replacedProduct = approvedSyntheticData();
    const independentAuthority = roleLevelAuthority(replacedProduct);
    replacedProduct.approvalReference = 'INJECTED-SELF-CONSISTENT-PACKET';
    expect(() => planBehaviourV2TenantProvisioning(schema, replacedProduct, snapshot(true), 'DryRun',
      independentAuthority)).toThrow(/TENANT_INDEPENDENT_AUTHORITY_MISMATCH/);

    const crossedPrincipals = approvedSyntheticData();
    (crossedPrincipals.principalBindings[1] as Record<string, unknown>).principalKey = 'PRINCIPAL-POSITIVE';
    expect(() => planBehaviourV2TenantProvisioning(schema, crossedPrincipals, snapshot(true), 'DryRun',
      roleLevelAuthority(crossedPrincipals))).toThrow(/TENANT_PRINCIPAL_BINDING_INVALID/);
  });

  it('executes only immutable receipted schema, Product and role-authority bytes after caller mutation', async () => {
    const data = approvedSyntheticData();
    const schemaInput = JSON.parse(JSON.stringify(schema)) as IBehaviourV2TenantSchema;
    const authority = roleLevelAuthority(data);
    const client = new MemoryProvisioningClient(snapshot(true));
    client.mutateOnObserve = { count: 2, apply: () => {
      const l1Binding = data.roleLevelBindings.find(row => row.sourceRoleLevelCode === 'L1') as Record<string, unknown>;
      l1Binding.roleLevelName = 'Injected Alternate Name';
      data.behaviourObjectiveLibrary.filter(row => row.RoleLevelCode === 'L1').forEach(row => {
        (row as Record<string, unknown>).RoleLevelName = 'Injected Alternate Name';
        (row as Record<string, unknown>).DropdownLabel = `[Injected Alternate Name] ${String(row.ObjectiveTitle)}`;
      });
      data.catalogueBinding!.canonicalDigestSha256 = hashC2bCanonical(data.behaviourObjectiveLibrary);
      (schemaInput.lists[0].fields[0] as { required: boolean }).required = false;
      (authority.roleLevelNames as { L1: string }).L1 = 'Injected Alternate Name';
    } };

    const { plan, receipt } = await executeBehaviourV2TenantProvisioning(client, schemaInput, data, {
      mode: 'Apply', explicitlyEnableApply: true, roleLevelAuthority: authority
    });
    const operation = plan.operations.find(item => item.kind === 'InsertRow'
      && item.purpose === 'BehaviourObjectiveLibrary' && item.stableKey === 'BHV-01-L1-01');
    const written = client.insertedRows.find(item => item.purpose === 'BehaviourObjectiveLibrary'
      && item.row.BehaviourObjectiveKey === 'BHV-01-L1-01')!.row;
    expect(receipt.status).toBe('Completed');
    expect(operation?.kind === 'InsertRow' ? operation.rowSha256 : null).toBe(hashC2bCanonical(written));
    expect(written.RoleLevelName).toBe(governedRoleLevelNames.L1);
    expect(plan.productDataSha256).not.toBe(hashC2bCanonical(data));
    expect(plan.schemaSha256).not.toBe(hashC2bCanonical(schemaInput));
    expect(plan.roleLevelAuthoritySha256).not.toBe(hashC2bCanonical(authority));
  });

  it.each(['definitionSha256', 'rowSha256'] as const)(
    'rejects a self-consistent receipted plan with a substituted %s before mutation', async digestKind => {
      const data = digestKind === 'rowSha256' ? approvedSyntheticData() : emptyData;
      const authority = roleLevelAuthority(data);
      const initial = snapshot(digestKind === 'rowSha256');
      const plan = planBehaviourV2TenantProvisioning(schema, data, initial, 'Apply', authority);
      const receipt = resumableReceipt(plan);
      const operation = receipt.plan.operations.find(item => digestKind in item)!;
      (operation as unknown as Record<string, unknown>)[digestKind] = 'F'.repeat(64);
      const unsignedPlan = Object.keys(receipt.plan).filter(key => key !== 'planSha256')
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = receipt.plan[key as keyof ITenantProvisioningPlan]; return result;
        }, {});
      receipt.plan.planSha256 = hashC2bCanonical(unsignedPlan);
      receipt.planSha256 = receipt.plan.planSha256;
      receipt.receiptKey = `tenant-provision|${receipt.planSha256}`;
      const unsignedReceipt = Object.keys(receipt).filter(key => key !== 'receiptSha256')
        .reduce<Record<string, unknown>>((result, key) => {
          result[key] = receipt[key as keyof ITenantProvisioningReceipt]; return result;
        }, {});
      receipt.receiptSha256 = hashC2bCanonical(unsignedReceipt);
      const client = new MemoryProvisioningClient(initial);
      client.seedReceiptChain(receipt.receiptKey, [receipt]);

      const result = await executeBehaviourV2TenantProvisioning(client, schema, data, {
        mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: receipt.receiptKey,
        receiptAuthority, roleLevelAuthority: authority
      });
      expect(result.receipt).toMatchObject({ status: 'BlockedOff', stopCode: 'TENANT_OPERATION_RACE_COLLISION',
        unknownOperation: { recoveryOutcome: 'NotApplied' } });
      expect(client.calls).toEqual([]);
    }
  );

  it.each<[string, (receipt: ITenantProvisioningReceipt) => void, RegExp]>([
    ['forged body', receipt => { receipt.stopCode = 'FORGED-WITHOUT-RESEAL'; }, /TENANT_RECEIPT_CHAIN_INVALID/],
    ['duplicate confirmation', receipt => {
      confirmFirstOperation(receipt, 'list:synthetic:first', 'A'.repeat(64));
      receipt.confirmations = [...receipt.confirmations, { ...receipt.confirmations[0] }]; resealReceipt(receipt);
    }, /TENANT_RECEIPT_CONFIRMATION_PREFIX_INVALID/],
    ['gapped revision', receipt => {
      receipt.revision = 2; receipt.previousReceiptSha256 = 'A'.repeat(64); resealReceipt(receipt);
    }, /TENANT_RECEIPT_CHAIN_INVALID/],
    ['crossed confirmation', receipt => {
      confirmFirstOperation(receipt, 'list:synthetic:first', 'A'.repeat(64));
      (receipt.confirmations[0] as { operationSha256: string }).operationSha256 = 'F'.repeat(64);
      resealReceipt(receipt);
    }, /TENANT_RECEIPT_CONFIRMATION_PREFIX_INVALID/],
    ['false-Off rollback', receipt => {
      (receipt.rollback as { flowMustRemainOff: boolean }).flowMustRemainOff = false; resealReceipt(receipt);
    }, /TENANT_RECEIPT_ROLLBACK_INVALID/],
    ['InProgress receipt carrying unknown-operation evidence', receipt => {
      const operation = receipt.plan.operations[0];
      receipt.unknownOperation = { sequence: operation.sequence, kind: operation.kind, purpose: operation.purpose,
        safeCode: 'SYNTHETIC_UNKNOWN', recoveryOutcome: 'NotApplied', providerReference: null, readbackSha256: null };
      resealReceipt(receipt);
    }, /TENANT_RECEIPT_SEMANTIC_INVALID/],
    ['Completed receipt with an incomplete confirmation and rollback prefix', receipt => {
      confirmFirstOperation(receipt, 'list:synthetic:first', 'A'.repeat(64));
      receipt.status = 'Completed'; receipt.afterStateSha256 = 'B'.repeat(64); resealReceipt(receipt);
    }, /TENANT_RECEIPT_SEMANTIC_INVALID/],
    ['Completed receipt carrying a pending operation', receipt => {
      const operation = receipt.plan.operations[0];
      receipt.status = 'Completed'; receipt.afterStateSha256 = 'B'.repeat(64);
      receipt.pendingOperation = { sequence: operation.sequence, kind: operation.kind, purpose: operation.purpose };
      resealReceipt(receipt);
    }, /TENANT_RECEIPT_SEMANTIC_INVALID/]
  ])('returns BlockedOff with zero mutation for a %s receipt attack', async (_label, attack, stopCode) => {
    const initial = snapshot(false); const dataAuthority = roleLevelAuthority(emptyData);
    const plan = planBehaviourV2TenantProvisioning(schema, emptyData, initial, 'Apply', dataAuthority);
    const receipt = resumableReceipt(plan); attack(receipt);
    const client = new MemoryProvisioningClient(initial); client.seedReceiptChain(receipt.receiptKey, [receipt]);
    const result = await executeBehaviourV2TenantProvisioning(client, schema, emptyData, {
      mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: receipt.receiptKey,
      receiptAuthority, roleLevelAuthority: dataAuthority
    });
    expect(result.receipt).toMatchObject({ status: 'BlockedOff', stopCode: expect.stringMatching(stopCode) });
    expect(result.receipt.rollback.flowMustRemainOff).toBe(true);
    expect(client.calls).toEqual([]);
    expect(client.receipts).toEqual([]);
  });

  it.each<[string, (receipt: ITenantProvisioningReceipt) => void, string]>([
    ['false-Off policy', receipt => {
      (receipt.rollback as { flowMustRemainOff: boolean }).flowMustRemainOff = false;
    }, 'TENANT_RECEIPT_ROLLBACK_INVALID'],
    ['substituted authority digest', receipt => {
      (receipt.plan as { roleLevelAuthoritySha256: string | null }).roleLevelAuthoritySha256 = 'F'.repeat(64);
    }, 'TENANT_RECEIPT_SEMANTIC_INVALID'],
    ['invalid pending operation', receipt => {
      const operation = receipt.plan.operations[1];
      receipt.pendingOperation = { sequence: operation.sequence, kind: operation.kind, purpose: operation.purpose };
    }, 'TENANT_RECEIPT_PENDING_INVALID'],
    ['confirmation history regression', receipt => {
      confirmFirstOperation(receipt, 'list:synthetic:first', 'A'.repeat(64));
    }, 'TENANT_RECEIPT_REVISION_TRANSITION_INVALID'],
    ['PoisonedStatus receipt status', receipt => {
      (receipt as unknown as { status: unknown }).status = 'PoisonedStatus';
    }, 'TENANT_RECEIPT_SEMANTIC_INVALID'],
    ['case-variant receipt status', receipt => {
      (receipt as unknown as { status: unknown }).status = 'inprogress';
    }, 'TENANT_RECEIPT_SEMANTIC_INVALID'],
    ['empty receipt status', receipt => {
      (receipt as unknown as { status: unknown }).status = '';
    }, 'TENANT_RECEIPT_SEMANTIC_INVALID'],
    ['null receipt status', receipt => {
      (receipt as unknown as { status: unknown }).status = null;
    }, 'TENANT_RECEIPT_SEMANTIC_INVALID']
  ])('rejects an invalid earlier %s revision followed by a valid-looking final revision', async (_label, attack, stopCode) => {
    const initial = snapshot(false); const dataAuthority = roleLevelAuthority(emptyData);
    const plan = planBehaviourV2TenantProvisioning(schema, emptyData, initial, 'Apply', dataAuthority);
    const earlier = resumableReceipt(plan); attack(earlier); resealReceipt(earlier);
    const final = resumableReceipt(plan); final.revision = 2; final.previousReceiptSha256 = earlier.receiptSha256;
    resealReceipt(final);
    const client = new MemoryProvisioningClient(initial);
    client.seedReceiptChain(final.receiptKey, [earlier, final]);
    const result = await executeBehaviourV2TenantProvisioning(client, schema, emptyData, {
      mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: final.receiptKey,
      receiptAuthority, roleLevelAuthority: dataAuthority
    });
    expect(result.receipt).toMatchObject({ status: 'BlockedOff', stopCode });
    expect(result.receipt.rollback.flowMustRemainOff).toBe(true);
    expect(client.calls).toEqual([]);
    expect(client.receipts).toEqual([]);
  });

  it.each(['InProgress', 'BlockedOff'] as const)(
    'rejects terminal Completed status followed by %s with zero mutation', async finalStatus => {
      const initial = snapshot(true); const dataAuthority = roleLevelAuthority(emptyData);
      const plan = planBehaviourV2TenantProvisioning(schema, emptyData, initial, 'Apply', dataAuthority);
      expect(plan.operations).toEqual([]);
      const earlier = resumableReceipt(plan);
      earlier.status = 'Completed'; earlier.afterStateSha256 = hashC2bCanonical(initial); resealReceipt(earlier);
      const final = resumableReceipt(plan); final.revision = 2; final.previousReceiptSha256 = earlier.receiptSha256;
      final.status = finalStatus;
      if (finalStatus === 'BlockedOff') final.stopCode = 'SYNTHETIC_BLOCKED_OFF';
      resealReceipt(final);
      const client = new MemoryProvisioningClient(initial);
      client.seedReceiptChain(final.receiptKey, [earlier, final]);
      const result = await executeBehaviourV2TenantProvisioning(client, schema, emptyData, {
        mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: final.receiptKey,
        receiptAuthority, roleLevelAuthority: dataAuthority
      });
      expect(result.receipt).toMatchObject({ status: 'BlockedOff',
        stopCode: 'TENANT_RECEIPT_REVISION_TRANSITION_INVALID' });
      expect(client.calls).toEqual([]);
      expect(client.receipts).toEqual([]);
    }
  );

  it.each<[string, (chain: ITenantAuthenticatedReceiptChain) => void]>([
    ['list', chain => { (chain as { receiptListId: string }).receiptListId = id(99); }],
    ['schema', chain => { (chain as { fieldInventorySha256: string }).fieldInventorySha256 = 'F'.repeat(64); }],
    ['writer', chain => {
      (chain.revisionEvidence[0] as { editorPrincipalId: number }).editorPrincipalId = 999;
    }]
  ])('returns BlockedOff with zero mutation for substituted provider %s evidence', async (_label, mutate) => {
    const initial = snapshot(false); const dataAuthority = roleLevelAuthority(emptyData);
    const plan = planBehaviourV2TenantProvisioning(schema, emptyData, initial, 'Apply', dataAuthority);
    const receipt = resumableReceipt(plan); const client = new MemoryProvisioningClient(initial);
    client.seedReceiptChain(receipt.receiptKey, [receipt]); client.receiptChainMutation = mutate;
    const result = await executeBehaviourV2TenantProvisioning(client, schema, emptyData, {
      mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: receipt.receiptKey,
      receiptAuthority, roleLevelAuthority: dataAuthority
    });
    expect(result.receipt).toMatchObject({ status: 'BlockedOff', stopCode: expect.stringMatching(/^TENANT_RECEIPT_/) });
    expect(result.receipt.rollback.flowMustRemainOff).toBe(true);
    expect(client.calls).toEqual([]);
    expect(client.receipts).toEqual([]);
  });

  it('blocks a validly chained confirmation whose current state is wrong, without a later mutation', async () => {
    const initial = snapshot(false); const dataAuthority = roleLevelAuthority(emptyData);
    const plan = planBehaviourV2TenantProvisioning(schema, emptyData, initial, 'Apply', dataAuthority);
    const receipt = resumableReceipt(plan);
    confirmFirstOperation(receipt, 'list:missing-confirmed-object', 'A'.repeat(64));
    const client = new MemoryProvisioningClient(initial); client.seedReceiptChain(receipt.receiptKey, [receipt]);
    const result = await executeBehaviourV2TenantProvisioning(client, schema, emptyData, {
      mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: receipt.receiptKey,
      receiptAuthority, roleLevelAuthority: dataAuthority
    });
    expect(result.receipt).toMatchObject({ status: 'BlockedOff',
      stopCode: 'TENANT_RECEIPT_CURRENT_STATE_MISMATCH', unknownOperation: { recoveryOutcome: 'NotApplied' } });
    expect(client.calls).toEqual([]);
  });

  it('resumes a valid chain at only the next exact operation', async () => {
    const initial = snapshot(false); const dataAuthority = roleLevelAuthority(emptyData);
    const plan = planBehaviourV2TenantProvisioning(schema, emptyData, initial, 'Apply', dataAuthority);
    const receipt = resumableReceipt(plan); const firstOperation = plan.operations[0];
    const client = new MemoryProvisioningClient(initial);
    const created = await client.addList(schema.lists.find(list => list.purpose === firstOperation.purpose)!);
    if (created.outcome !== 'Confirmed') throw new Error('SYNTHETIC_FIRST_OPERATION_NOT_CONFIRMED');
    confirmFirstOperation(receipt, created.providerReference, created.readbackSha256);
    client.calls.splice(0); client.seedReceiptChain(receipt.receiptKey, [receipt]);
    const result = await executeBehaviourV2TenantProvisioning(client, schema, emptyData, {
      mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: receipt.receiptKey,
      receiptAuthority, roleLevelAuthority: dataAuthority
    });
    expect(result.receipt).toMatchObject({ status: 'Completed', stopCode: null });
    expect(result.receipt.confirmations).toHaveLength(plan.operations.length);
    expect(result.receipt.confirmations[0]).toMatchObject({ sequence: 1, providerReference: created.providerReference });
    expect(client.calls[0]).toMatch(/^AddField:/);
    const firstDefinition = schema.lists.find(list => list.purpose === firstOperation.purpose)!;
    expect(client.calls).not.toContain(`AddList:${firstDefinition.title}`);
  });

  it('durably returns BLOCKED_OFF with the exact unknown operation after timeout-after-commit', async () => {
    const client = new MemoryProvisioningClient(snapshot(false)); client.unknownOnCall = 1;
    const { receipt } = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, now: () => '2026-09-13T18:45:00Z',
        roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(receipt).toMatchObject({ status: 'BlockedOff', stopCode: 'TENANT_OPERATION_TIMEOUT_UNKNOWN',
      unknownOperation: { sequence: 1, kind: 'AddList', safeCode: 'TIMEOUT_UNKNOWN',
        recoveryOutcome: 'Applied', providerReference: expect.stringMatching(/^list:/) },
      confirmations: [{ sequence: 1, outcome: 'ReplayConfirmed' }],
      rollback: { entries: [{ kind: 'RecycleCreatedList', providerReference: expect.stringMatching(/^list:/) }] } });
    expect(client.receipts).toEqual(['InProgress:0', 'InProgress:0', 'BlockedOff:1']);
  });

  it('preserves confirmed partial rollback evidence when a later operation becomes unknown', async () => {
    const client = new MemoryProvisioningClient(snapshot(false)); client.unknownOnCall = 2;
    const { receipt } = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(receipt).toMatchObject({ status: 'BlockedOff', confirmations: [
      { sequence: 1, outcome: 'Confirmed' }, { sequence: 2, outcome: 'ReplayConfirmed' }],
    unknownOperation: { sequence: 2, recoveryOutcome: 'Applied' }, rollback: { entries: [
      { reverseSequence: 1, kind: 'LeaveAddOnlyField' },
      { reverseSequence: 2, kind: 'RecycleCreatedList', protectedPreExistingAsset: false }] } });
  });

  it('recovers a timeout-after-commit on each private-list ACL operation without actor exposure or lockout', async () => {
    for (const purpose of ['ControlCases', 'TenantProvisioningReceipts']) {
      const initial = snapshot(false);
      const plan = planBehaviourV2TenantProvisioning(schema, emptyData, initial, 'Apply', roleLevelAuthority(emptyData));
      const operation = plan.operations.find(candidate => candidate.kind === 'SetPrivateListAcl'
        && candidate.purpose === purpose)!;
      const client = new MemoryProvisioningClient(initial); client.unknownOnCall = operation.sequence;
      const { receipt } = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
        { mode: 'Apply', explicitlyEnableApply: true, roleLevelAuthority: roleLevelAuthority(emptyData) });
      expect(receipt).toMatchObject({ status: 'BlockedOff', unknownOperation: {
        sequence: operation.sequence, kind: 'SetPrivateListAcl', recoveryOutcome: 'Applied' },
      rollback: { entries: expect.arrayContaining([expect.objectContaining({ kind: 'RestorePrivateListAcl',
        protectedPreExistingAsset: false })]) } });
    }
  });

  it('returns exact rollback identity without confirmation for a partially applied mutation', async () => {
    const client = new MemoryProvisioningClient(snapshot(false));
    client.unknownOnCall = 1; client.partialRecoveryForSequence = 1;
    const { receipt } = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(receipt).toMatchObject({ status: 'BlockedOff', confirmations: [],
      unknownOperation: { sequence: 1, recoveryOutcome: 'PartiallyApplied',
        providerReference: 'partial:1', readbackSha256: 'F'.repeat(64) },
      rollback: { entries: [{ kind: 'RecycleCreatedList', providerReference: 'partial:1' }] } });
  });

  it('recovers an exact partial receipt and safely completes the remaining plan', async () => {
    const client = new MemoryProvisioningClient(snapshot(false)); client.unknownOnCall = 1;
    const partial = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, now: () => '2026-09-13T18:45:00Z',
        roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(client.receipts.slice(0, 3)).toEqual(['InProgress:0', 'InProgress:0', 'BlockedOff:1']);
    client.unknownOnCall = null;
    const resumed = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: partial.receipt.receiptKey, receiptAuthority,
        now: () => '2026-09-13T18:45:00Z', roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(resumed.plan.planSha256).toBe(partial.plan.planSha256);
    expect(resumed.receipt).toMatchObject({ status: 'Completed', stopCode: null, pendingOperation: null,
      unknownOperation: null });
    expect(resumed.receipt.confirmations).toHaveLength(partial.plan.operations.length);
    expect(client.receipts[3]).toBe('InProgress:1');
    expect(client.receipts[client.receipts.length - 1]).toBe(`Completed:${partial.plan.operations.length}`);
  });

  it('returns the in-memory rollback identity when receipt persistence fails after commit', async () => {
    const client = new MemoryProvisioningClient(snapshot(false));
    client.failReceiptAtConfirmationCount = 1; client.receiptFailuresRemaining = 2;
    const { receipt } = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, now: () => '2026-09-13T18:45:00Z',
        roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(receipt).toMatchObject({ status: 'BlockedOff', stopCode: 'TENANT_RECEIPT_DURABILITY_UNKNOWN',
      confirmations: [{ sequence: 1, outcome: 'Confirmed', providerReference: expect.stringMatching(/^list:/) }],
      unknownOperation: { sequence: 1, recoveryOutcome: 'Applied',
        providerReference: expect.stringMatching(/^list:/) },
      rollback: { entries: [{ kind: 'RecycleCreatedList', providerReference: expect.stringMatching(/^list:/) }] } });
  });

  it('blocks an intervening race after per-operation rediscovery without another mutation', async () => {
    const client = new MemoryProvisioningClient(snapshot(false)); client.raceOnObserve = 2;
    const { receipt } = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(receipt).toMatchObject({ status: 'BlockedOff', stopCode: 'TENANT_OPERATION_RACE_COLLISION' });
    expect(client.calls).toEqual([]);
  });

  it('replays an exact completed zero-operation receipt without writing or duplicating a receipt', async () => {
    const client = new MemoryProvisioningClient(snapshot(true));
    const first = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, now: () => '2026-09-13T18:45:00Z',
        roleLevelAuthority: roleLevelAuthority(emptyData) });
    const writes = client.receipts.length;
    const replay = await executeBehaviourV2TenantProvisioning(client, schema, emptyData,
      { mode: 'Apply', explicitlyEnableApply: true, resumeReceiptKey: first.receipt.receiptKey, receiptAuthority,
        now: () => '2026-09-13T18:45:00Z', roleLevelAuthority: roleLevelAuthority(emptyData) });
    expect(replay.receipt).not.toBe(first.receipt);
    expect(replay.receipt).toStrictEqual(first.receipt);
    expect(client.calls).toEqual([]);
    expect(client.receipts).toHaveLength(writes);
  });

  it('rejects wrong GUID binding, schema revision, stable-key contract and seventeenth catalogue field', () => {
    const wrongGuid = snapshot(true);
    (wrongGuid.bindings[0] as { listId: string | null }).listId = id(99);
    expect(() => planBehaviourV2TenantProvisioning(schema, emptyData, wrongGuid, 'DryRun', roleLevelAuthority(emptyData)))
      .toThrow(/TENANT_LIST_IDENTITY_CONFLICT/);
    const wrongRevision = snapshot(true);
    (wrongRevision.lists[0] as { schemaRevision: string }).schemaRevision = 'wrong';
    expect(() => planBehaviourV2TenantProvisioning(schema, emptyData, wrongRevision, 'DryRun', roleLevelAuthority(emptyData)))
      .toThrow(/TENANT_LIST_IDENTITY_CONFLICT/);
    const stableKey = snapshot(true);
    const people = stableKey.lists.find(list => list.purpose === 'People')!;
    (people.fields.find(field => field.internalName === 'PersonKey') as ITenantFieldDefinition).unique = false;
    expect(() => planBehaviourV2TenantProvisioning(schema, emptyData, stableKey, 'DryRun', roleLevelAuthority(emptyData)))
      .toThrow(/TENANT_STABLE_KEY_SCHEMA_CONFLICT/);
    const extra = snapshot(true);
    const catalogue = extra.lists.find(list => list.purpose === 'BehaviourObjectiveLibrary')!;
    (catalogue.fields as ITenantFieldDefinition[]).push({ ...(catalogue.fields[0] as ITenantFieldDefinition),
      internalName: 'UnreviewedProductField' });
    expect(() => planBehaviourV2TenantProvisioning(schema, emptyData, extra, 'DryRun', roleLevelAuthority(emptyData)))
      .toThrow(/TENANT_UNEXPECTED_PRODUCT_FIELD/);
  });
});
