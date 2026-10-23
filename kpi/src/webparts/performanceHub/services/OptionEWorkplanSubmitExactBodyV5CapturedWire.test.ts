import { TextDecoder, TextEncoder } from 'node:util';
import { createHash } from 'node:crypto';
import type { IAnnualWorkplan } from '../models/ProductionModels';
import type { IDeliveryPublicationManagerObservations, IDeliveryPublicationNativeCoordinates,
  IGlobalDeliveryPublicationProposal, IManagerDeliveryPublicationProposal } from '../models/GovernedDeliveryPublicationV1Models';
import { ADMIN_OVERALL_DELIVERY_CONFIG_KEYS, type IAdminOverallDeliveryConfigurationContract } from './AdminConfigDomain';
import type { IDeliveryWeightOverrideRequest, IGovernedDeliveryWeightConfigurationContract } from './CategoryWeightingPolicy';
import { buildGlobalDeliveryPublicationProposal, buildManagerDeliveryPublicationProposal, selectEffectiveDeliveryPublication } from './GovernedDeliveryPublicationV1';
import {
  EXACT_BODY_V5, V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT, V5_OPERATION_CONTRACT,
  V5_DELIVERY_READER_CONTRACT, V5_TAXONOMY_READER_CONTRACT, type V5Request, type V5ReferenceSet,
  type V5Authority, type V5Admission, type V5Snapshot, type V5Receipt, type V5JournalOperation, type V5TaxonomyReferenceRow
} from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import type { V4ReferenceRow } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { OPTION_E_DRAFT_V2_SCHEMA_VERSION, type IOptionEWorkplanDraftV2Aggregate } from '../models/OptionEWorkplanDraftV2Models';
import { canonicaliseOptionEDraftV2, parseCanonicalOptionEDraftV2 } from './OptionEWorkplanDraftV2Wire';
import { v4Canonical, parseV4Draft, decodeV4Utf8, BufferByteLength } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { v5Canonical, v5IdentityKey, parseV5Request, parseV5ReferenceSet,
  parseV5Admission, parseV5JournalOperation, parseV5Snapshot, parseV5Receipt } from './OptionEWorkplanSubmitExactBodyV5Wire';
Object.assign(globalThis, { TextDecoder, TextEncoder });

// Synthetic full U1 proposal fixtures retained from the frozen U1 regression.
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
const operationFixture = (): V5JournalOperation => {
  const admission = admissionFixture();
  const { etag, ...after } = admission.authority.control;
  return { contract: V5_OPERATION_CONTRACT, admission, checkpoint: 'Validated', etag, outcome: 'Running',
    controlReadback: admission.authority.control, controlIntent: { before: admission.authority.control, after } };
};
const snapshotFixture = (manager = false, minimal = false): V5Snapshot => {
  const admission = admissionFixture(manager, minimal);
  return { contract: EXACT_BODY_V5.storage, key: admission.key, admission, body: admission.authority.draft.body };
};
const receiptFixture = (manager = false, minimal = false): V5Receipt => {
  const snapshot = snapshotFixture(manager, minimal);
  return { contract: EXACT_BODY_V5.receipt, key: snapshot.key, snapshot, nativeCreated: '2026-10-03T10:03:01.000Z' };
};
import { V5_CAPTURE_ENCODING, V5_CHECKPOINTS } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import { validateV4References } from './OptionEWorkplanSubmitExactBodyV4';
import {
  encodeV5CapturedAdmission, parseV5CapturedAdmission, encodeV5CapturedJournalOperation, parseV5CapturedJournalOperation,
  encodeV5CapturedSnapshot, parseV5CapturedSnapshot, encodeV5CapturedReceipt, parseV5CapturedReceipt
} from './OptionEWorkplanSubmitExactBodyV5CapturedWire';

// Same ordinary complete synthetic population as the sealed A008 preflight, with every legacy kind.
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
const journalFor = (value: V5Receipt): V5JournalOperation => {
  const admission = value.snapshot.admission, { etag, ...after } = admission.authority.control;
  return { ...operationFixture(), admission, etag: '"operation-1"', controlReadback: copy(admission.authority.control),
    controlIntent: { before: { ...after, etag }, after: { ...after, transition: 'Submitting', command: admission.key } } };
};
const hash = (value: string): string => createHash('sha256').update(value).digest('hex').toUpperCase();
const cases = [
  { name: 'complete-global', full: true, manager: false, minimal: false, admission: 39054, journal: 40101, snapshot: 45789, receipt: 46190,
    originalSha: '835B2BAF6150763DD8D78DF95C7C0333631AB8A63C8013B10B2E06C9E097C7AA' },
  { name: 'complete-manager', full: true, manager: true, minimal: false, admission: 43869, journal: 44916, snapshot: 50604, receipt: 51005,
    originalSha: 'A85C50DE91C241B5E564EF52722361865543ED3E166A0238E487841D6C5B1F88' },
  { name: 'prior-global-full', full: false, manager: false, minimal: false, admission: 15953, snapshot: 18789, receipt: 19190,
    originalSha: 'AC2BE14572C92EDA425F855F57C40E722FEE63AE4318E25FF21DD6AE94EB49AB' },
  { name: 'prior-global-minimal', full: false, manager: false, minimal: true, admission: 14590, snapshot: 16283, receipt: 16684,
    originalSha: '2540AB5C9A13803537994F2E9518B1953E28C97CEE7ACC26788269308C7AC333' },
  { name: 'prior-manager-full', full: false, manager: true, minimal: false, admission: 20768, snapshot: 23604, receipt: 24005,
    originalSha: '5C934EFEB44DCCFB8409B1E9DFD5E564C3FA09FB6EAA7DA09E5055AB294EC8DA' },
  { name: 'prior-manager-minimal', full: false, manager: true, minimal: true, admission: 19405, snapshot: 21098, receipt: 21499,
    originalSha: 'F2ABCFE4E9BFE2A0183D0B9E120879203E91C0D98048A442FA87B956F6D48AD7' }
];
type FrameName = 'admission' | 'journal' | 'snapshot' | 'receipt';
const frames: { name: FrameName; select: (v: V5Receipt) => unknown; encode: (v: unknown) => string;
  parse: (body: string) => unknown; oldParse: (body: string) => unknown }[] = [
  { name: 'admission', select: v => v.snapshot.admission, encode: v => encodeV5CapturedAdmission(v as V5Admission),
    parse: parseV5CapturedAdmission, oldParse: parseV5Admission },
  { name: 'journal', select: journalFor, encode: v => encodeV5CapturedJournalOperation(v as V5JournalOperation),
    parse: parseV5CapturedJournalOperation, oldParse: parseV5JournalOperation },
  { name: 'snapshot', select: v => v.snapshot, encode: v => encodeV5CapturedSnapshot(v as V5Snapshot),
    parse: parseV5CapturedSnapshot, oldParse: parseV5Snapshot },
  { name: 'receipt', select: v => v, encode: v => encodeV5CapturedReceipt(v as V5Receipt),
    parse: parseV5CapturedReceipt, oldParse: parseV5Receipt }
];
type RecordValue = Record<string, unknown>;
const capturedAdmission = (frame: RecordValue, name: FrameName): RecordValue => name === 'admission' ? frame
  : name === 'receipt' ? (frame.snapshot as RecordValue).admission as RecordValue : frame.admission as RecordValue;

describe('V5 explicit captured native request codec r3', () => {
  test.each(cases)('all complete $name frames reconstruct original logical bytes with every captured string', item => {
    const receipt = item.full ? completeReceiptFixture(item.manager) : receiptFixture(item.manager, item.minimal);
    const before = v4Canonical(receipt), admission = receipt.snapshot.admission, a = admission.authority;
    expect(hash(before)).toBe(item.originalSha);
    frames.forEach(frame => {
      const logical = frame.select(receipt), body = frame.encode(logical), expanded = frame.parse(body);
      expect(v4Canonical(expanded)).toBe(v4Canonical(logical));
      expect(BufferByteLength(body)).toBeLessThanOrEqual(56000);
      const expectedBytes = item[frame.name]; if (expectedBytes !== undefined) expect(BufferByteLength(body)).toBe(expectedBytes);
      expect(() => frame.oldParse(body)).toThrow(); expect(() => frame.parse(v4Canonical(logical))).toThrow();
      if (!item.full) expect(frame.oldParse(v4Canonical(logical))).toEqual(logical);
    });
    const decoded = parseV5CapturedReceipt(encodeV5CapturedReceipt(receipt));
    const restored = decoded.snapshot.admission.authority;
    expect(restored.request.body).toBe(a.request.body); expect(restored.draft).toEqual(a.draft);
    expect(restored.request.query.referenceBody).toBe(a.request.query.referenceBody);
    expect(parseV5Request(restored.request.body)).toEqual(a.request.query);
    expect(parseV5ReferenceSet(restored.request.query.referenceBody)).toEqual(a.references);
    expect(restored.references.rows).toHaveLength(item.full ? 48 : 2);
    restored.references.rows.forEach((row, index) => {
      expect(hash(row.body)).toBe(hash(a.references.rows[index].body));
      if ('nativeMetadataBody' in row) {
        const original = a.references.rows[index] as V5TaxonomyReferenceRow;
        expect(hash(row.nativeMetadataBody)).toBe(hash(original.nativeMetadataBody)); expect(row.native).toEqual(original.native);
      }
    });
    expect(v4Canonical(receipt)).toBe(before);
    if (item.full) { expect(BufferByteLength(before)).toBeGreaterThan(56000); expect(() => v5Canonical(decoded)).toThrow(); }
  });
  test.each([false, true])('complete positive legacy/publication semantics, Manager=%s', manager => {
    const value = completeReceiptFixture(manager), a = value.snapshot.admission.authority;
    const draft = parseCanonicalOptionEDraftV2(a.draft.body);
    const legacy = parseV4Draft(v4Canonical({ schemaVersion: 'kcf.workplan-draft/v1', core: draft.core,
      impact: draft.impact.map(entry => Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'classificationSelection'))),
      behaviours: draft.behaviours }));
    const rows = a.references.rows.filter(r => r.kind !== 'DeliveryConfiguration' && r.kind !== 'ImpactTaxonomy') as V4ReferenceRow[];
    expect(new Set(rows.map(r => r.kind)).size).toBe(10); expect(rows).toHaveLength(46);
    expect(() => validateV4References({ asOf: a.references.asOf, rows }, legacy, a.actor.key, a.control.year)).not.toThrow();
    const publication = JSON.parse(a.references.rows.find(r => r.kind === 'DeliveryConfiguration')!.body) as
      IGlobalDeliveryPublicationProposal | IManagerDeliveryPublicationProposal;
    const selected = publication.scope.kind === 'WorkplanOverride'
      ? selectEffectiveDeliveryPublication((publication as IManagerDeliveryPublicationProposal).provenance.baseline,
        publication as IManagerDeliveryPublicationProposal, a.workplan.value)
      : selectEffectiveDeliveryPublication(publication as IGlobalDeliveryPublicationProposal, undefined, a.workplan.value);
    expect(selected).toEqual(publication); expect(selected.payload.activeWeights).toEqual(manager ? { core: 80, impact: 20 } : { core: 70, impact: 30 });
  });
  test.each(frames)('$name refuses inconsistent observed query, Draft or references before factoring', frame => {
    const mutations: ((a: V5Authority) => void)[] = [a => { a.request.query.source.version = 'changed'; },
      a => { a.draft.version = 'changed'; }, a => { a.references.rows[0].version = 'changed'; },
      a => { (a as unknown as RecordValue).extra = true; }, a => { (a.request as unknown as RecordValue).extra = true; }];
    mutations.forEach(mutate => {
      const receipt = copy(completeReceiptFixture(true)); mutate(receipt.snapshot.admission.authority);
      expect(() => frame.encode(frame.select(receipt))).toThrow();
    });
  });
  test.each(frames)('$name requires exact marker and refuses mixed or incomplete compact shapes', frame => {
    const original = JSON.parse(frame.encode(frame.select(completeReceiptFixture()))) as RecordValue;
    const mutateAndRefuse = (mutate: (root: RecordValue, admission: RecordValue) => void): void => {
      const value = copy(original); mutate(value, capturedAdmission(value, frame.name));
      expect(() => frame.parse(v4Canonical(value))).toThrow();
    };
    mutateAndRefuse((_, a) => { delete a.encoding; });
    mutateAndRefuse((_, a) => { a.encoding = 'unknown'; });
    mutateAndRefuse((_, a) => { (a.authority as RecordValue).draft = {}; });
    mutateAndRefuse((_, a) => { (a.authority as RecordValue).references = {}; });
    mutateAndRefuse((_, a) => { ((a.authority as RecordValue).request as RecordValue).query = {}; });
    mutateAndRefuse((root) => { root.extra = true; });
    Object.keys(original).filter(key => key !== 'controlIntent' && key !== 'holdReason')
      .forEach(key => mutateAndRefuse(root => { delete root[key]; }));
    expect(capturedAdmission(original, frame.name).encoding).toBe(V5_CAPTURE_ENCODING);
  });
  test.each(frames)('$name preserves exact capability, key, UTC and ordinary authority mismatch refusal', frame => {
    const mutations: ((v: V5Receipt) => void)[] = [v => { v.snapshot.admission.key += '|changed'; },
      v => { v.snapshot.admission.eventAt = '2026-10-03T10:03:00Z'; },
      v => { v.snapshot.admission.capability = { ...v.snapshot.admission.capability, protocol: 'old' as typeof EXACT_BODY_V5.protocol }; },
      v => { v.snapshot.admission.authority.workplan.native = { ...v.snapshot.admission.authority.workplan.native, itemId: 999 }; },
      v => { v.snapshot.admission.authority.control.person = 'changed'; }];
    mutations.forEach(mutate => { const value = completeReceiptFixture(); mutate(value); expect(() => frame.encode(frame.select(value))).toThrow(); });
    const compact = JSON.parse(frame.encode(frame.select(completeReceiptFixture()))) as RecordValue;
    capturedAdmission(compact, frame.name).eventAt = '2026-02-30T10:03:00.000Z';
    expect(() => frame.parse(v4Canonical(compact))).toThrow();
  });
  test.each(frames)('$name applies 56000/56001 limit to actual persisted UTF8 bytes', frame => {
    const receipt = completeReceiptFixture(true), view = frame.select(receipt), initial = frame.encode(view);
    const headroom = 56000 - BufferByteLength(initial);
    receipt.snapshot.admission.authority.actor.version += 'é'.repeat(Math.floor(headroom / 2)) + 'x'.repeat(headroom % 2);
    // journalFor returns an outer copy sharing the complete admission, preserving the same intended frame.
    const body = frame.encode(view); expect(BufferByteLength(body)).toBe(56000); expect(frame.parse(body)).toEqual(view);
    const oversized = JSON.parse(body) as RecordValue;
    const actor = (capturedAdmission(oversized, frame.name).authority as RecordValue).actor as RecordValue;
    actor.version = `${actor.version as string}x`;
    expect(BufferByteLength(v4Canonical(oversized))).toBe(56001); expect(() => frame.parse(v4Canonical(oversized))).toThrow();
    receipt.snapshot.admission.authority.actor.version += 'x'; expect(() => frame.encode(view)).toThrow();
  });
  test.each(V5_CHECKPOINTS)('durable-intent journal codec preserves checkpoint %s and RecoveryHold without executing it', checkpoint => {
    const value = journalFor(completeReceiptFixture(true)); value.checkpoint = checkpoint;
    value.outcome = checkpoint === 'Completed' ? 'Completed' : 'Running';
    const bytes = encodeV5CapturedJournalOperation(value); expect(parseV5CapturedJournalOperation(bytes)).toEqual(value);
    value.outcome = 'RecoveryHold'; value.holdReason = 'Synthetic uncertain response';
    expect(parseV5CapturedJournalOperation(encodeV5CapturedJournalOperation(value))).toEqual(value);
    delete value.controlIntent; delete value.holdReason;
    expect(parseV5CapturedJournalOperation(encodeV5CapturedJournalOperation(value))).toEqual(value);
  });
  test('journal ETag, before/after intent and complete control coordinates remain exact', () => {
    const mutations: ((v: V5JournalOperation) => void)[] = [v => { v.etag = '*'; },
      v => { v.controlIntent!.before.etag = 'W/"weak"'; }, v => { v.controlIntent!.after.workplan = 'other'; },
      v => { (v.controlIntent!.after as RecordValue).etag = '"forbidden"'; }, v => { v.controlReadback.person = 'other'; }];
    mutations.forEach(mutate => { const value = journalFor(completeReceiptFixture()); mutate(value); expect(() => encodeV5CapturedJournalOperation(value)).toThrow(); });
  });
  test('snapshot raw body, receipt keys and exact nativeCreated are still required', () => {
    const value = completeReceiptFixture(); value.snapshot.body += ' ';
    expect(() => encodeV5CapturedSnapshot(value.snapshot)).toThrow(); expect(() => encodeV5CapturedReceipt(value)).toThrow();
    const receipt = completeReceiptFixture(); receipt.key += '|changed'; expect(() => encodeV5CapturedReceipt(receipt)).toThrow();
    receipt.key = receipt.snapshot.key; receipt.nativeCreated = '2026-10-03'; expect(() => encodeV5CapturedReceipt(receipt)).toThrow();
  });
  test.each(frames)('$name retains strict canonical, Unicode, depth, scalar and UTF8 refusal', frame => {
    const receipt = completeReceiptFixture(), body = frame.encode(frame.select(receipt));
    [' ' + body, body + '\n', '\ufeff' + body, body.slice(0, -1), '['.repeat(66) + '0' + ']'.repeat(66)].forEach(text => {
      expect(() => frame.parse(text)).toThrow();
    });
    receipt.snapshot.admission.authority.actor.version = '\ud800'; expect(() => frame.encode(frame.select(receipt))).toThrow();
    for (const bytes of [[0xef, 0xbb, 0xbf, 0x7b, 0x7d], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f], [0xff]]) {
      expect(() => frame.parse(decodeV4Utf8(Uint8Array.from(bytes)))).toThrow();
    }
    const numeric = completeReceiptFixture(); numeric.snapshot.admission.authority.control.aclEpoch = -0;
    expect(() => frame.encode(frame.select(numeric))).toThrow();
  });
});
