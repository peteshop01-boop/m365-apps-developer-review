import { TextDecoder, TextEncoder } from 'node:util';
import type { IAnnualWorkplan } from '../models/ProductionModels';
import type { IDeliveryPublicationManagerObservations, IDeliveryPublicationNativeCoordinates,
  IGlobalDeliveryPublicationProposal, IManagerDeliveryPublicationProposal } from '../models/GovernedDeliveryPublicationV1Models';
import { ADMIN_OVERALL_DELIVERY_CONFIG_KEYS, type IAdminOverallDeliveryConfigurationContract } from './AdminConfigDomain';
import type { IDeliveryWeightOverrideRequest, IGovernedDeliveryWeightConfigurationContract } from './CategoryWeightingPolicy';
import { buildGlobalDeliveryPublicationProposal, buildManagerDeliveryPublicationProposal } from './GovernedDeliveryPublicationV1';
import { EXACT_BODY_V5, V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT,
  V5_DELIVERY_READER_CONTRACT, V5_TAXONOMY_READER_CONTRACT, type V5Request, type V5ReferenceSet,
  type V5Authority, type V5Admission, type V5Snapshot, type V5Receipt } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { V4ReferenceRow } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { OPTION_E_DRAFT_V2_SCHEMA_VERSION, type IOptionEWorkplanDraftV2Aggregate } from '../models/OptionEWorkplanDraftV2Models';
import { canonicaliseOptionEDraftV2, parseCanonicalOptionEDraftV2 } from './OptionEWorkplanDraftV2Wire';
import { v4Canonical } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { v5Canonical, v5IdentityKey, parseV5ReferenceSet } from './OptionEWorkplanSubmitExactBodyV5Wire';
Object.assign(globalThis, { TextDecoder, TextEncoder });
// Original six synthetic histories; complete global/Manager fixtures retain all 48 rows.
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const source = (core = 70, impact = 30): IAdminOverallDeliveryConfigurationContract => ({
  schema: 'KCF.OverallDelivery.Configuration', schemaVersion: 1, sourceList: 'KCFKPI_Config',
  environment: 'TEST-SYNTHETIC', performanceYear: 2026, versionToken: '101@"core-1"|102@"impact-1"',
  weights: { core, impact, total: 100 }, includedCategories: ['Core', 'Impact'], excludedCategories: ['Behaviours'],
  behavioursExcludedFromDeliveryArithmetic: true, poorCoreMaskingGuard: 'RequiredDownstreamGovernedRule',
  poorCoreThresholdConfiguredHere: false, tenantMutationExecuted: false,
  authority: {
    core: { identity: { itemId: 101, key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight, environment: 'TEST-SYNTHETIC', etag: '"core-1"', state: 'Active' },
      provenance: { modifiedAt: '2026-10-03T08:00:00.000Z', modifiedBy: 'admin@example.invalid', changeReference: 'synthetic-core-change' } },
    impact: { identity: { itemId: 102, key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight, environment: 'TEST-SYNTHETIC', etag: '"impact-1"', state: 'Active' },
      provenance: { modifiedAt: '2026-10-03T08:01:00.000Z', modifiedBy: 'admin@example.invalid', changeReference: 'synthetic-impact-change' } }
  }
});
const payload = (core = 70, impact = 30, version = 'global-1', at = '2026-10-03T09:00:00.000Z'): IGovernedDeliveryWeightConfigurationContract => ({
  schema: 'KCF.DeliveryWeightConfiguration', immutable: true, published: true,
  authority: { configurationId: `synthetic-publication-${version}`, version, etag: `"${version}"`,
    approvalReference: 'KCF-KPI-Sponsor-PD-01', contentSha256: 'A'.repeat(64), effectiveFrom: '2026-10-03',
    publishedAt: at, publishedBy: 'publisher@example.invalid', changeReference: `synthetic-${version}` },
  defaultWeights: { core: 70, impact: 30 }, activeWeights: { core, impact }
});
const global = (): Readonly<IGlobalDeliveryPublicationProposal> => buildGlobalDeliveryPublicationProposal(source(), payload());
const native = (itemId: number, people = false): IDeliveryPublicationNativeCoordinates => ({
  siteId: 'fb1f6035-236e-434c-ae05-a78003badd47', webId: 'cbf5edb8-5d3b-46a5-a5ea-4564fa3ff43c',
  listId: people ? 'cb02da80-d986-4034-a832-41d7b04e56ff' : 'cd90f5d6-e067-45db-ab58-2cdc57ea4cb4',
  itemId, version: '3.0', etag: '"3"'
});
const workplan = (): IAnnualWorkplan => ({
  id: 44, etag: '"3"', workplanKey: 'WP-SYNTHETIC-2026', personKey: 'employee',
  employeeDisplayName: 'Synthetic Employee', employeeEmail: 'employee@example.invalid', performanceYear: 2026,
  managerPersonKey: 'manager', managerEmail: 'manager@example.invalid', state: 'Draft', accessState: 'Editable',
  transitionStatus: 'Ready', coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10,
  rowVersionToken: 7
});
const observations = (): IDeliveryPublicationManagerObservations => ({
  workplanSource: { native: native(44), value: workplan() },
  actorSource: { native: native(5, true), value: { personKey: 'manager', email: 'manager@example.invalid', appRoles: ['Manager'], active: true } },
  subjectSource: { native: native(6, true), value: { personKey: 'employee', managerPersonKey: 'manager', managerEmail: 'manager@example.invalid' } }
});
const request = (core = 80, impact = 20): IDeliveryWeightOverrideRequest => ({
  auditKey: 'synthetic-audit-1', existingAuditKeys: [], current: { core: 70, impact: 30 }, proposed: { core, impact },
  reason: 'Approved balance for the synthetic Workplan', subjectPersonKey: 'employee', actorEmail: 'manager@example.invalid',
  actorRole: 'Manager', actorPersonKey: 'manager', assignedManagerPersonKey: 'manager',
  eventAt: '2026-10-03T10:00:00.000Z', sourceVersion: 7, state: 'Draft'
});
const managerPayload = (core = 80, impact = 20): IGovernedDeliveryWeightConfigurationContract =>
  payload(core, impact, 'manager-1', '2026-10-03T10:01:00.000Z');
const override = (): Readonly<IManagerDeliveryPublicationProposal> =>
  buildManagerDeliveryPublicationProposal(global(), observations(), request(), managerPayload());


const draftFixture = (): IOptionEWorkplanDraftV2Aggregate => ({
  schemaVersion: OPTION_E_DRAFT_V2_SCHEMA_VERSION,
  core: { weightingMode: 'Equal', entries: [{ coreId: 'CORE-1', kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2026|v1',
    role: 'Owner', contributionMethod: 'AdditiveDirect', weightPercent: 100, annual: { value: '10', success: 'Annual' },
    q1: { value: 1 }, q2: { value: 2 }, q3: { value: 3 }, q4: { value: 4 } }] },
  impact: [{ impactId: 'IMPACT-1', wording: 'Synthetic improvement', measure: 'Cases', unit: 'count', success: 'Evidence',
    annual: 10, q1: 1, q2: 2, q3: 3, q4: 4, classificationSelection: { businessContributionAreaKey: 'BCA-01',
      taxonomyPin: { taxonomyId: 'PD02', version: 'taxonomy-1', etag: '"taxonomy-pin-1"', contentSha256: 'B'.repeat(64) } } }],
  behaviours: { frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: Array.from({ length: 5 }, (_, index) => {
      const valueId = `BHV-0${index + 1}` as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
      return { valueId, descriptorKey: `${valueId}|descriptor`, guidancePromptKeys: Array.from({ length: 5 }, (__, n) => `${valueId}|${n}`),
        selectedPromptKeys: [], commitment: 'Synthetic commitment', periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '' } };
    }) }
});
// Separate A013 minimal diagnostic; the complete full-draft fixture above remains the primary positive case.
const minimalDraftFixture = (): IOptionEWorkplanDraftV2Aggregate => {
  const value = draftFixture();
  value.core.entries = []; value.impact = []; value.behaviours.roleTier = 'R';
  value.behaviours.entries.forEach(entry => {
    entry.descriptorKey = 'd'; entry.guidancePromptKeys = ['1', '2', '3', '4', '5']; entry.commitment = '';
  });
  return value;
};
const taxonomyFixture = (): object => ({
  contract: 'kcf.option-e.impact-taxonomy-publication/v1', purposeApproval: 'KCF-KPI-PM83-D001',
  payload: { schema: 'KCF.ImpactTaxonomy', immutable: true, published: true,
    authority: { taxonomyId: 'PD02', version: 'taxonomy-1', etag: '"taxonomy-pin-1"', approvalReference: 'KCF-KPI-Sponsor-PD-02',
      contentSha256: 'B'.repeat(64), effectiveFrom: '2026-10-03', publishedAt: '2026-10-03T09:00:00.000Z',
      publishedBy: 'publisher@example.invalid', changeReference: 'synthetic-taxonomy' },
    strategicPillars: [{ key: 'PILLAR-1', label: 'Synthetic pillar', source: 'PD02', sourceReference: 'source-1', active: true, approved: true, effectiveFrom: '2026-10-03' }],
    businessContributionAreas: ['Programme Delivery & Service Quality', 'Operations', 'Funding & Income Generation',
      'Partnerships & Stakeholders', 'Media & Communications', 'Impact, Insight & Reporting', 'Social Value & Community Impact',
      'People & Culture', 'Finance, Commercial & Governance', 'Digital, Data & Innovation', 'Events & Projects', 'EDI & Inclusion',
      'Other / Cross-Foundation'].map((label, i) => ({ key: `BCA-${String(i + 1).padStart(2, '0')}`, label, source: 'PD02',
      active: true, approved: true, effectiveFrom: '2026-10-03' })) },
  provenance: { sourceReference: 'KCF-KPI-Sponsor-PD-02', publisherPrincipal: 901 }
});
const referencesFixture = (manager = false): V5ReferenceSet => {
  const delivery = manager ? override() : global();
  const doc = { ...native(501), version: delivery.payload.authority.version, etag: delivery.payload.authority.etag };
  const taxonomyNative = { ...native(502), version: 'native-7', etag: '"native-7"' };
  const metadata = (coordinates: typeof doc): string => JSON.stringify({ Id: coordinates.itemId, AuthorId: 901,
    OData__UIVersionString: coordinates.version, '@odata.etag': coordinates.etag, Created: '2026-10-03T09:00:00.000Z',
    HasUniqueRoleAssignments: true, additionalObservedField: 'retain 😀 e\u0301' }, undefined, 1);
  return { contract: V5_REFERENCE_CONTRACT, asOf: '2026-10-03T10:02:00.000Z', rows: [
    { kind: 'DeliveryConfiguration', key: delivery.payload.authority.configurationId, itemId: doc.itemId, version: doc.version, etag: doc.etag,
      readerContract: V5_DELIVERY_READER_CONTRACT, native: doc, nativeMetadataBody: metadata(doc), body: JSON.stringify(delivery) },
    { kind: 'ImpactTaxonomy', key: 'PD02', itemId: taxonomyNative.itemId, version: taxonomyNative.version, etag: taxonomyNative.etag,
      readerContract: V5_TAXONOMY_READER_CONTRACT, native: taxonomyNative, nativeMetadataBody: metadata(taxonomyNative), body: JSON.stringify(taxonomyFixture()) }
  ] };
};
const requestFixture = (manager = false, minimal = false): V5Request => ({ capability: EXACT_BODY_V5, action: 'Submit', command: 'fb1f6035-236e-434c-ae05-a78003badd47',
  person: 'employee', year: 2026, workplan: 'WP-SYNTHETIC-2026',
  source: { itemId: 41, etag: '"draft-1"', version: '1', schema: OPTION_E_DRAFT_V2_SCHEMA_VERSION,
    body: canonicaliseOptionEDraftV2(minimal ? minimalDraftFixture() : draftFixture()) },
  referenceBody: v5Canonical(referencesFixture(manager)) });
const authorityFixture = (manager = false, minimal = false): V5Authority => {
  const query = requestFixture(manager, minimal);
  return { contract: V5_AUTHORITY_CONTRACT, request: { itemId: 42, etag: '"request-1"', version: '1', createdBy: 201,
    body: v5Canonical(query), query }, draft: query.source, references: parseV5ReferenceSet(query.referenceBody),
    actor: { key: 'employee', principal: 201, active: true, version: '1', manager: 'manager' },
    manager: { key: 'manager', principal: 202, active: true, version: '1' },
    control: { workplan: query.workplan, person: query.person, year: query.year, draftId: 41, manager: 'manager', hierarchyEpoch: 4, aclEpoch: 4,
      etag: '"control-1"', state: 'Draft', transition: 'Ready' }, workplan: { native: native(44), value: workplan() } };
};
const admissionFixture = (manager = false, minimal = false): V5Admission => {
  const authority = authorityFixture(manager, minimal);
  return { contract: V5_ADMISSION_CONTRACT, capability: EXACT_BODY_V5, key: v5IdentityKey(authority.request.query), authority, eventAt: '2026-10-03T10:03:00.000Z' };
};
const snapshotFixture = (manager = false, minimal = false): V5Snapshot => {
  const admission = admissionFixture(manager, minimal);
  return { contract: EXACT_BODY_V5.storage, key: admission.key, admission, body: admission.authority.draft.body };
};
const receiptFixture = (manager = false, minimal = false): V5Receipt => {
  const snapshot = snapshotFixture(manager, minimal);
  return { contract: EXACT_BODY_V5.receipt, key: snapshot.key, snapshot, nativeCreated: '2026-10-03T10:03:01.000Z' };
};
const completeReceiptFixture = (manager = false): V5Receipt => {
  const value = receiptFixture(manager), a = value.snapshot.admission.authority, q = a.request.query;
  const draft = parseCanonicalOptionEDraftV2(a.draft.body);
  const authority = { catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'KCF-BHV-PD03-2026.09-v2',
    catalogueRevision: 7, catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
    approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' as const };
  draft.behaviours.governedExtension = {
    schemaVersion: 'kcf.option-e.behaviours/v02', authority, roleLevelCode: 'L1',
    headlines: draft.behaviours.entries.map((entry, index) => ({ behaviourKey: entry.valueId,
      headlineTitle: `Headline ${index + 1}`, selections: [{
        selectionKey: index === 0 ? `${entry.valueId}-L1-01` : `${entry.valueId}-OWN-ABCDEF`,
        source: index === 0 ? 'Catalogue' as const : 'Own' as const, behaviourKey: entry.valueId,
        headlineTitle: `Headline ${index + 1}`, focusKey: `${entry.valueId}-FOCUS-01`, focusTitle: `Focus ${index + 1}`,
        roleLevelCode: 'L1' as const, ...(index === 0 ? { targetKey: `${entry.valueId}-L1-01` } : {}),
        selectedWording: index === 0 ? 'Approved target 1' : entry.commitment,
        catalogueId: authority.catalogueId, catalogueVersion: authority.catalogueVersion,
        catalogueRevision: authority.catalogueRevision, catalogueEtag: authority.catalogueEtag,
        catalogueContentSha256: authority.catalogueContentSha256,
        myCommitment: entry.commitment, howWillWeKnow: `Evidence ${index + 1}`
      }] })),
    immutableSelectionSnapshots: true, legacyTargetRatingWeightFieldsWritten: false, deliveryArithmeticAffected: false
  };
  const extension = draft.behaviours.governedExtension, selections = extension.headlines.flatMap(h => h.selections);
  const mapping: [V4ReferenceRow['kind'], unknown[]][] = [
    ['Kpi', draft.core.entries.map(e => ({ kpiId: e.kpiId, kpiVersionKey: e.kpiVersionKey, active: true }))],
    ['Target', draft.core.entries.map(e => ({ targetVersionKey: e.targetVersionKey, kpiId: e.kpiId, performanceYear: q.year,
      status: 'Approved', role: e.role, annual: e.annual, q1: e.q1, q2: e.q2, q3: e.q3, q4: e.q4 }))],
    ['Framework', [{ frameworkVersion: draft.behaviours.frameworkVersion, published: true, immutable: true }]],
    ['Assignment', [{ personKey: q.person, frameworkVersion: draft.behaviours.frameworkVersion,
      roleTier: draft.behaviours.roleTier, roleLevelCode: extension.roleLevelCode, active: true }]],
    ['Value', draft.behaviours.entries.map((e, i) => ({ frameworkValueKey: `${draft.behaviours.frameworkVersion}|${e.valueId}`,
      frameworkVersion: draft.behaviours.frameworkVersion, valueId: e.valueId, governedOrder: i + 1,
      roleTier: draft.behaviours.roleTier, descriptorKey: e.descriptorKey }))],
    ['Prompt', draft.behaviours.entries.flatMap(e => e.guidancePromptKeys.map(promptKey => ({ promptKey,
      behaviourKey: e.valueId, roleTier: draft.behaviours.roleTier, active: true })))],
    ['Catalogue', [{ ...extension.authority, published: true, immutable: true,
      asOfDate: value.snapshot.admission.eventAt.slice(0, 10), effectiveFrom: '2026-09-01' }]],
    ['Headline', extension.headlines.map((h, i) => ({ behaviourKey: h.behaviourKey, headlineTitle: h.headlineTitle, governedOrder: i + 1 }))],
    ['Focus', selections.map(s => ({ behaviourKey: s.behaviourKey, focusKey: s.focusKey, focusTitle: s.focusTitle,
      roleLevelCode: s.roleLevelCode, status: 'Published', effectiveFrom: '2026-09-01' }))],
    ['BehaviourTarget', selections.filter(s => s.source === 'Catalogue').map(s => ({ behaviourKey: s.behaviourKey,
      focusKey: s.focusKey, focusTitle: s.focusTitle, roleLevelCode: s.roleLevelCode, status: 'Published',
      effectiveFrom: '2026-09-01', targetKey: s.targetKey!, selectedWording: s.selectedWording }))]
  ];
  let id = 100;
  const rows: V4ReferenceRow[] = mapping.flatMap(([kind, bodies]) => bodies.map((body, index) => ({ kind,
    key: `${kind}-${index}`, itemId: ++id, etag: '"r1"', version: '1', body: v4Canonical(body) })));
  a.references = { contract: V5_REFERENCE_CONTRACT, asOf: value.snapshot.admission.eventAt, rows: [...rows, ...a.references.rows] };
  a.draft.body = canonicaliseOptionEDraftV2(draft); q.source = copy(a.draft);
  q.referenceBody = v5Canonical(a.references); a.request.body = v5Canonical(q); value.snapshot.body = a.draft.body;
  return value;
};
import type { V5CapturedBytePort } from '../models/OptionEWorkplanSubmitExactBodyV5ExecutionModels';
import { type V5JournalOperation } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { V4Control, V4AclReadback } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { encodeV5CapturedJournalOperation, parseV5CapturedJournalOperation, parseV5CapturedAdmission,
  encodeV5CapturedSnapshot, parseV5CapturedSnapshot, encodeV5CapturedReceipt, parseV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { v5AclPlan } from './OptionEWorkplanSubmitExactBodyV5';
class SyntheticBytes implements V5CapturedBytePort {
  public binding = { kind: 'domain-test' as const, capability: EXACT_BODY_V5, protectedOrigin: true,
    principals: { content: 301, acl: 302, recovery: 303 } };
  public control: V4Control;
  public operation?: string;
  public snapshot?: string;
  public receipt?: string;
  public acl?: V4AclReadback;
  public operationVersion = 0;
  public controlVersion = 1;
  public effects: string[] = [];
  public encodedWrites: string[] = [];
  public uncertain = new Set<string>();
  public unavailable = new Set<string>();
  public clock = '2026-10-03T10:03:00.000Z';
  public nativeCreated = '2026-10-03T10:03:01.000Z';
  public nowCalls = 0;
  public longNextEtag = false;
  public constructor(public authority = completeReceiptFixture().snapshot.admission.authority) { this.control = copy(authority.control); }
  public async readAuthority(): Promise<V5Authority> { return copy({ ...this.authority, control: this.control }); }
  public async nextOperationEtag(): Promise<string> { return this.longNextEtag ? `"${'x'.repeat(20000)}"` : `"operation-${this.operationVersion + 1}"`; }
  public async readOperation(): Promise<string | undefined> { return this.operation; }
  private before(name: string): void { if (this.unavailable.has(name)) throw new Error(`Unavailable:${name}`); }
  private after(name: string, body?: string): void {
    this.effects.push(name); if (body) this.encodedWrites.push(body);
    if (this.uncertain.has(name)) throw new Error(`Uncertain:${name}`);
  }
  public async createOperation(admissionBody: string, body: string): Promise<void> {
    this.before('create'); const admission = parseV5CapturedAdmission(admissionBody), operation = parseV5CapturedJournalOperation(body);
    if (this.operation || v4Canonical(admission) !== v4Canonical(operation.admission) || operation.etag !== await this.nextOperationEtag()) throw new Error('CreateConflict');
    this.operation = encodeV5CapturedJournalOperation(operation); this.operationVersion++; this.after('create', body);
  }
  public async replaceOperation(key: string, exactEtag: string, body: string): Promise<void> {
    this.before('journal'); const before = this.op(), next = parseV5CapturedJournalOperation(body);
    if (before.etag !== exactEtag || next.etag !== await this.nextOperationEtag() || next.admission.key !== key) throw new Error('ExactETagConflict');
    if (v4Canonical(next.admission) !== v4Canonical(before.admission)) throw new Error('AdmissionChanged');
    this.operation = encodeV5CapturedJournalOperation(next); this.operationVersion++; this.after('journal', body);
  }
  public async readControl(): Promise<V4Control> { return copy(this.control); }
  public async casControl(key: string, etag: string, next: Omit<V4Control, 'etag'>): Promise<V4Control> {
    this.before('cas');
    const operation = this.op();
    if (key !== this.control.workplan || etag !== this.control.etag || !operation.controlIntent
      || v4Canonical(operation.controlIntent) !== v4Canonical({ before: this.control, after: next })) throw new Error('ExactControlIntentConflict');
    this.control = { ...copy(next), etag: `"control-${++this.controlVersion}"` }; this.after('cas'); return copy(this.control);
  }
  public async readSnapshot(): Promise<string | undefined> { return this.snapshot; }
  public async createSnapshot(body: string): Promise<void> {
    this.before('snapshot'); if (this.snapshot) throw new Error('SnapshotExists');
    this.snapshot = encodeV5CapturedSnapshot(parseV5CapturedSnapshot(body)); this.after('snapshot', body);
  }
  public async readReceipt(): Promise<string | undefined> { return this.receipt; }
  public async createReceipt(snapshotBody: string): Promise<void> {
    this.before('receipt'); if (this.receipt) throw new Error('ReceiptExists');
    const snapshot = parseV5CapturedSnapshot(snapshotBody);
    const body = encodeV5CapturedReceipt({ contract: EXACT_BODY_V5.receipt, key: snapshot.key, snapshot, nativeCreated: this.nativeCreated });
    parseV5CapturedReceipt(body); this.receipt = body; this.after('receipt', body);
  }
  public async expectedAcl(a: V5Admission): Promise<V4AclReadback> { return v5AclPlan(a, this.binding.principals); }
  public async readAcl(): Promise<V4AclReadback | undefined> { return copy(this.acl || null) || undefined; }
  public async applyAcl(a: V5Admission): Promise<void> { this.before('acl'); this.acl = v5AclPlan(a, this.binding.principals); this.after('acl'); }
  public now(): string { this.nowCalls++; return this.clock; }
  public op(): V5JournalOperation { return parseV5CapturedJournalOperation(this.operation!); }
}

import type { V5ClientPorts, V5ClientSource, V5SavedDraftEvidence } from '../models/OptionEWorkplanSubmitExactBodyV5ClientModels';
import { OptionEWorkplanSubmitExactBodyV5Client } from './OptionEWorkplanSubmitExactBodyV5Client';
import { dispatchV5SyntheticHost } from './OptionEWorkplanSubmitExactBodyV5HostContract';
class ClientBytes extends SyntheticBytes implements V5ClientPorts {
  public recorded?: V5Authority['request'];
  public requestCreates = 0;
  public loseRequest = false;
  public async readCurrentSource(): Promise<V5ClientSource> {
    const a = await this.readAuthority();
    return { contract: a.contract, draft: a.draft, references: a.references, actor: a.actor, manager: a.manager,
      control: a.control, workplan: a.workplan };
  }
  public async readSyntheticRequestProposal(query: V5Request): Promise<V5Authority['request']> {
    return { ...copy(this.authority.request), query: copy(query), body: v5Canonical(query) };
  }
  public async createImmutableRequest(request: V5Authority['request']): Promise<void> {
    this.requestCreates++;
    if (this.recorded) throw new Error('ImmutableRequestExists');
    if (this.loseRequest) throw new Error('RequestUnavailable');
    this.recorded = copy(request); this.authority.request = copy(request);
    if (this.uncertain.has('request')) throw new Error('RequestResponseLost');
  }
  public async readImmutableRequest(): Promise<V5Authority['request'] | undefined> { return this.recorded ? copy(this.recorded) : undefined; }
  public saved(): V5SavedDraftEvidence {
    const q = this.authority.request.query;
    return { schema: 'kcf.workplan-draft/v2', status: 'Saved', privateDraft: true, staleBuffer: false,
      requiresCanonicalReopen: false, person: q.person, year: q.year, workplan: q.workplan,
      source: copy(q.source), canonicalReopenBody: q.source.body, currentBufferBody: q.source.body };
  }
}
const makeClient = (p: ClientBytes): OptionEWorkplanSubmitExactBodyV5Client =>
  new OptionEWorkplanSubmitExactBodyV5Client(p, () => p.authority.request.query.command);
const completeClient = async (manager = false): Promise<{ p: ClientBytes; client: OptionEWorkplanSubmitExactBodyV5Client }> => {
  const p = new ClientBytes(completeReceiptFixture(manager).snapshot.admission.authority), client = makeClient(p);
  expect((await client.submit(p.saved())).phase).toBe('Processing');
  expect((await dispatchV5SyntheticHost(client.retainedAdmissionBody()!, p, true)).outcome).toBe('Completed');
  expect((await client.refresh()).phase).toBe('Submitted');
  return { p, client };
};
describe('V5 source client recording and captured status', () => {
  test.each([false, true])('complete global/Manager 48-row source path and retained raw history manager=%s', async manager => {
    const { p, client } = await completeClient(manager), admission = parseV5CapturedAdmission(client.retainedAdmissionBody()!);
    const original = completeReceiptFixture(manager).snapshot.admission.authority;
    expect(admission.authority.references.rows).toHaveLength(48);
    expect(admission.authority.request.body).toBe(original.request.body);
    expect(admission.authority.request.query.referenceBody).toBe(original.request.query.referenceBody);
    expect(admission.authority.draft.body).toBe(original.draft.body);
    expect(admission.authority.workplan).toEqual(original.workplan);
    expect(p.acl!.targets).toHaveLength(4); expect(client.installedAvailable()).toBe(false);
    expect(new TextEncoder().encode(p.receipt!).length).toBeLessThanOrEqual(56000);
    const effects = copy(p.effects), captured = p.operation, originalEvent = admission.eventAt;
    p.clock = '2030-01-01T00:00:00.000Z';
    expect((await dispatchV5SyntheticHost(client.retainedAdmissionBody()!, p, true)).outcome).toBe('Completed');
    expect((await client.submit(p.saved())).phase).toBe('Submitted');
    expect(p.effects).toEqual(effects); expect(p.operation).toBe(captured); expect(p.requestCreates).toBe(1);
    expect(parseV5CapturedAdmission(client.retainedAdmissionBody()!).eventAt).toBe(originalEvent);
  });
  test('single pending intent and uncertain create recover by readback without duplicate', async () => {
    const p = new ClientBytes(); p.uncertain.add('request'); let ids = 0;
    const client = new OptionEWorkplanSubmitExactBodyV5Client(p, () => { ids++; return p.authority.request.query.command; });
    const first = client.submit(p.saved()), second = client.submit(p.saved()); expect(first).toBe(second);
    expect((await first).phase).toBe('Processing'); await client.submit(p.saved());
    expect(ids).toBe(1); expect(p.requestCreates).toBe(1);
  });
  test('unresolved create retains original command on refresh and repeated submit', async () => {
    const p = new ClientBytes(); p.loseRequest = true; let ids = 0;
    const client = new OptionEWorkplanSubmitExactBodyV5Client(p, () => { ids++; return p.authority.request.query.command; });
    expect((await client.submit(p.saved())).phase).toBe('HOLD'); const retained = client.retainedAdmissionBody();
    Object.assign(p, { loseRequest: false }); expect((await client.submit(p.saved())).phase).toBe('HOLD');
    expect((await client.refresh()).phase).toBe('HOLD'); expect(client.retainedAdmissionBody()).toBe(retained);
    expect(ids).toBe(1); expect(p.requestCreates).toBe(1); expect(p.effects).toHaveLength(0);
  });
  test.each(['Unsaved', 'private', 'stale', 'reopen', 'buffer', 'coordinate'])('missing/current private V2 evidence refuses %s before effects', async field => {
    const p = new ClientBytes(), saved = p.saved();
    if (field === 'Unsaved') saved.status = 'Unsaved';
    if (field === 'private') saved.privateDraft = false;
    if (field === 'stale') saved.staleBuffer = true;
    if (field === 'reopen') saved.requiresCanonicalReopen = true;
    if (field === 'buffer') saved.currentBufferBody += ' ';
    if (field === 'coordinate') saved.source.version = '2';
    expect((await makeClient(p).submit(saved)).phase).toBe('HOLD'); expect(p.requestCreates).toBe(0);
  });
  test('missing/native bindings refuse before request effects', async () => {
    const p = new ClientBytes();
    expect((await new OptionEWorkplanSubmitExactBodyV5Client().submit(p.saved())).phase).toBe('HOLD');
    Object.assign(p.binding, { kind: 'native', storageEvidence: 'unproved', hostParityEvidence: 'unproved', sourceEvidence: 'unproved' });
    expect((await makeClient(p).submit(p.saved())).phase).toBe('HOLD'); expect(p.requestCreates).toBe(0);
  });
  test('stable complete authority required before request creation', async () => {
    const p = new ClientBytes(); let reads = 0;
    const original = p.readCurrentSource.bind(p);
    p.readCurrentSource = async () => { const source = await original(); source.actor.version = String(++reads); return source; };
    expect((await makeClient(p).submit(p.saved())).phase).toBe('HOLD'); expect(p.requestCreates).toBe(0);
  });
  test.each(['operation', 'snapshot', 'receipt', 'acl', 'control', 'request', 'event', 'operation-etag', 'created'])('incomplete/conflicting Completed %s is HOLD', async field => {
    const { p, client } = await completeClient();
    if (field === 'operation') p.operation = undefined;
    if (field === 'snapshot') p.snapshot = undefined;
    if (field === 'receipt') p.receipt = undefined;
    if (field === 'acl') p.acl!.targets.pop();
    if (field === 'control') p.control.etag = '"drift"';
    if (field === 'request') p.recorded!.version = '2';
    if (field === 'event') { const op = p.op(); op.admission.eventAt = '2026-10-03T10:04:00.000Z'; p.operation = encodeV5CapturedJournalOperation(op); }
    if (field === 'operation-etag') { const op = JSON.parse(p.operation!); op.etag = ''; p.operation = v5Canonical(op); }
    if (field === 'created') { const receipt = parseV5CapturedReceipt(p.receipt!); receipt.nativeCreated = '2026-10-03T11:00:00.000Z'; p.receipt = encodeV5CapturedReceipt(receipt); }
    expect((await client.refresh()).phase).toBe('HOLD'); expect(p.requestCreates).toBe(1);
  });
  test('changing second status observation holds without effects', async () => {
    const { p, client } = await completeClient(), effects = copy(p.effects); let reads = 0;
    p.readOperation = async () => { const op = p.op(); op.etag = `"read-${++reads}"`; return encodeV5CapturedJournalOperation(op); };
    expect((await client.refresh()).phase).toBe('HOLD'); expect(p.effects).toEqual(effects);
  });
  test('oversized complete history refuses before request creation; cap unchanged', async () => {
    const p = new ClientBytes();
    p.authority.workplan = { ...p.authority.workplan, value: { ...p.authority.workplan.value, employeeDisplayName: 'x'.repeat(56000) } };
    expect((await makeClient(p).submit(p.saved())).phase).toBe('HOLD'); expect(p.requestCreates).toBe(0);
  });
});
