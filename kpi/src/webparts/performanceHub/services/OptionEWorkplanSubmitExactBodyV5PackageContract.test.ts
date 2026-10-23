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
import { measureV5Capacity, validateV5SourceDomainBinding, v5InstalledReadiness, V5_EXECUTION_DECLARATION,
  createV5CapturedDomainStore } from './OptionEWorkplanSubmitExactBodyV5PackageContract';
import type { V5CapturedBytePort } from '../models/OptionEWorkplanSubmitExactBodyV5ExecutionModels';
import { encodeV5CapturedAdmission, parseV5CapturedAdmission, encodeV5CapturedSnapshot, parseV5CapturedSnapshot,
  encodeV5CapturedReceipt, parseV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
describe('V5 source package and actual captured capacity', () => {
  const binding = { kind: 'domain-test', capability: EXACT_BODY_V5, protectedOrigin: true, principals: { content: 301, acl: 302, recovery: 303 } };
  test('default disabled unbound readiness and explicit synthetic binding', () => {
    expect(V5_EXECUTION_DECLARATION.state).toBe('Disabled'); expect(V5_EXECUTION_DECLARATION.binding).toBe('Unbound');
    expect(v5InstalledReadiness(binding)).toBe('NOT_ADMITTED'); expect(v5InstalledReadiness(undefined)).toBe('NOT_ADMITTED');
    expect(() => validateV5SourceDomainBinding(binding)).not.toThrow();
    expect(() => validateV5SourceDomainBinding({ ...binding, kind: 'native' })).toThrow();
    expect(() => createV5CapturedDomainStore({ binding } as unknown as V5CapturedBytePort)).toThrow('IncompleteSyntheticBytePort');
  });
  test.each([['global', false, false, true, 39054, 45789, 46190], ['manager', true, false, true, 43869, 50604, 51005],
    ['prior-global-full', false, false, false, 15953, 18789, 19190], ['prior-global-minimal', false, true, false, 14590, 16283, 16684],
    ['prior-manager-full', true, false, false, 20768, 23604, 24005], ['prior-manager-minimal', true, true, false, 19405, 21098, 21499]] as const)(
    '%s retains all historical bytes and measures all frames before effects', (_name, manager, minimal, complete, admissionBytes, snapshotBytes, receiptBytes) => {
      const receipt = complete ? completeReceiptFixture(manager) : receiptFixture(manager, minimal), a = receipt.snapshot.admission;
      const sizes = measureV5Capacity(a, '"operation-1"');
      expect(sizes.admission).toBe(admissionBytes); expect(sizes.snapshot).toBe(snapshotBytes); expect(sizes.receipt).toBe(receiptBytes);
      expect(Object.values(sizes).every(value => value <= 56000)).toBe(true);
      expect(parseV5CapturedAdmission(encodeV5CapturedAdmission(a))).toEqual(a);
      expect(parseV5CapturedSnapshot(encodeV5CapturedSnapshot(receipt.snapshot))).toEqual(receipt.snapshot);
      expect(parseV5CapturedReceipt(encodeV5CapturedReceipt(receipt))).toEqual(receipt);
    });
  test('later actual ETag capacity is checked through the complete journal codec', () => {
    const a = completeReceiptFixture(true).snapshot.admission;
    expect(() => measureV5Capacity(a, `"${'x'.repeat(16000)}"`)).toThrow();
    expect(a.authority.references.rows).toHaveLength(48);
  });
});
