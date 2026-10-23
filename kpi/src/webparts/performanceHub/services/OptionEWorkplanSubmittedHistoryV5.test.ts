import { TextDecoder, TextEncoder } from 'node:util';
import { createHash } from 'node:crypto';
import type { IAnnualWorkplan, IImpactClassification } from '../models/ProductionModels';
import type { IQuarterImpactClassificationSnapshot, IOverallDeliveryWeightConfiguration } from '../models/QuarterlyModels';
import type { IDeliveryPublicationManagerObservations, IDeliveryPublicationNativeCoordinates,
  IGlobalDeliveryPublicationProposal, IManagerDeliveryPublicationProposal } from '../models/GovernedDeliveryPublicationV1Models';
import { ADMIN_OVERALL_DELIVERY_CONFIG_KEYS, type IAdminOverallDeliveryConfigurationContract } from './AdminConfigDomain';
import type { IDeliveryWeightOverrideRequest, IGovernedDeliveryWeightConfigurationContract } from './CategoryWeightingPolicy';
import * as weightingPolicy from './CategoryWeightingPolicy';
import { buildGlobalDeliveryPublicationProposal, buildManagerDeliveryPublicationProposal } from './GovernedDeliveryPublicationV1';
import { EXACT_BODY_V5, V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT,
  V5_DELIVERY_READER_CONTRACT, V5_TAXONOMY_READER_CONTRACT, type V5Request, type V5ReferenceSet,
  type V5Authority, type V5Admission, type V5Receipt, type V5Snapshot } from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import { OPTION_E_DRAFT_V2_SCHEMA_VERSION, type IOptionEWorkplanDraftV2Aggregate } from '../models/OptionEWorkplanDraftV2Models';
import { canonicaliseOptionEDraftV2, parseCanonicalOptionEDraftV2 } from './OptionEWorkplanDraftV2Wire';
import { v5Canonical, v5IdentityKey, parseV5ReferenceSet } from './OptionEWorkplanSubmitExactBodyV5Wire';
import { decodeOptionEWorkplanSubmittedHistoryV5, decodeOptionEWorkplanSubmittedCapturedHistoryV5 } from './OptionEWorkplanSubmittedHistoryV5';
import { V5_SUBMITTED_HISTORY_LOADER_BINDING, type IV5HistoricalTaxonomyPublication,
  type IV5SubmittedHistory, type IV5CapturedHistoryCapture } from '../models/OptionEWorkplanSubmittedHistoryV5Models';
import type { V4ReferenceRow } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { v4Canonical, BufferByteLength } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { encodeV5CapturedReceipt, encodeV5CapturedSnapshot } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
Object.assign(globalThis, { TextDecoder, TextEncoder });

// Synthetic full U1 proposal fixtures retained from the frozen U1 regression.

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
const override = (): Readonly<IManagerDeliveryPublicationProposal> => {
  const observed = observations(), approved = request();
  return { contract: 'kcf.option-e.delivery-publication/v1', purposeApproval: 'KCF-KPI-PM83-D001',
    scope: { kind: 'WorkplanOverride', workplan: observed.workplanSource.value.workplanKey, person: 'employee', year: 2026 },
    payload: managerPayload(), provenance: { baseline: global(), ...observed,
      approval: { actorPersonKey: 'manager', subjectPersonKey: 'employee', assignedManagerPersonKey: 'manager',
        audit: { auditKey: approved.auditKey, eventType: 'DeliveryWeightOverrideApproved', actorEmail: approved.actorEmail,
          actorRole: 'Manager', eventAt: approved.eventAt, reason: approved.reason, sourceVersion: approved.sourceVersion,
          resultingState: approved.state, before: approved.current, after: approved.proposed } } } };
};


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
const taxonomyFixture = (): IV5HistoricalTaxonomyPublication => ({
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
const receiptFixture = (manager = false, minimal = false): V5Receipt => {
  const admission = admissionFixture(manager, minimal);
  const snapshot = { contract: EXACT_BODY_V5.storage, key: admission.key, admission, body: admission.authority.draft.body };
  return { contract: EXACT_BODY_V5.receipt, key: snapshot.key, snapshot, nativeCreated: '2026-10-03T10:03:01.000Z' };
};
const expected = { workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 };
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const decode = (receipt: V5Receipt): IV5SubmittedHistory => {
  const result = decodeOptionEWorkplanSubmittedHistoryV5({ kind: 'receipt', canonicalBody: v5Canonical(receipt) }, expected);
  expect(result.status).toBe('DECODED_SOURCE_ONLY');
  if (result.status === 'HOLD') throw new Error(result.reason);
  return result.history;
};
// Refresh only the redundant r2 observations after an ordinary captured-input change.
const refresh = (receipt: V5Receipt): void => {
  const authority = receipt.snapshot.admission.authority;
  authority.request.query.referenceBody = v5Canonical(authority.references);
  authority.request.query.source = authority.draft;
  authority.request.body = v5Canonical(authority.request.query);
  receipt.snapshot.body = authority.draft.body;
};
const changePublication = <T extends object>(receipt: V5Receipt, kind: 'DeliveryConfiguration' | 'ImpactTaxonomy', change: (value: T) => void): void => {
  const row = receipt.snapshot.admission.authority.references.rows.find(item => item.kind === kind)!;
  const publication = JSON.parse(row.body) as T; change(publication); row.body = JSON.stringify(publication);
  refresh(receipt);
};
const hold = (receipt: V5Receipt): void => {
  expect(decodeOptionEWorkplanSubmittedHistoryV5({ kind: 'receipt', canonicalBody: v5Canonical(receipt) }, expected))
    .toEqual({ status: 'HOLD', reason: 'InvalidHistoricalCapture' });
};

describe('pure V5 submitted historical source mapper', () => {
  test.each([[false, false], [false, true], [true, false], [true, true]])(
    'retains complete capture, full raw values and compatible decoded shapes (Manager %s, minimal %s)', (manager, minimal) => {
      const receipt = receiptFixture(manager, minimal), before = v5Canonical(receipt), history = decode(receipt);
      const authority = receipt.snapshot.admission.authority, rows = authority.references.rows;
      expect(v5Canonical(receipt)).toBe(before);
      expect(history.capture.canonicalBody).toBe(before);
      expect(history.snapshot).toEqual(receipt.snapshot);
      expect(history.receipt).toEqual(receipt);
      const retained = [authority.request.body, authority.request.query.referenceBody, receipt.snapshot.body,
        rows[0].body, rows[1].body, 'nativeMetadataBody' in rows[0] ? rows[0].nativeMetadataBody : '',
        'nativeMetadataBody' in rows[1] ? rows[1].nativeMetadataBody : ''];
      expect(Object.values(history.raw)).toEqual(retained);
      expect(Object.values(history.raw).map(hash)).toEqual(retained.map(hash));
      expect(history.draft).toEqual(JSON.parse(receipt.snapshot.body));
      expect(history.impactClassifications).toHaveLength(minimal ? 0 : 1);
      const annualWeights: IAnnualWorkplan['overallDeliveryWeightConfiguration'] = history.overallDeliveryWeightConfiguration;
      const quarterWeights: IOverallDeliveryWeightConfiguration = history.overallDeliveryWeightConfiguration;
      expect(annualWeights).toEqual(quarterWeights);
      expect(quarterWeights).toEqual({ configurationKey: `synthetic-publication-${manager ? 'manager-1' : 'global-1'}`,
        configurationVersion: manager ? 'manager-1' : 'global-1', coreWeight: manager ? 80 : 70,
        impactWeight: manager ? 20 : 30, sourceReference: 'KCF-KPI-Sponsor-PD-01' });
      if (!minimal) {
        const annualClassification: IImpactClassification = history.impactClassifications[0].classification;
        const quarterClassification: IQuarterImpactClassificationSnapshot = annualClassification;
        expect(quarterClassification.businessContributionArea).toEqual({ key: 'BCA-01',
          label: 'Programme Delivery & Service Quality', source: 'PD02', taxonomyId: 'PD02', taxonomyVersion: 'taxonomy-1',
          taxonomyEtag: '"taxonomy-pin-1"', taxonomyApprovalReference: 'KCF-KPI-Sponsor-PD-02' });
        expect(quarterClassification.strategicPillar).toBeUndefined();
        expect(history.draft.core.entries).toHaveLength(1);
        expect(history.draft.behaviours.entries).toHaveLength(5);
      }
      expect(Object.isFrozen(history.snapshot.admission.authority)).toBe(true);
      expect(Object.isFrozen(history.draft.impact)).toBe(true);
      ['protectedOrigin', 'trusted', 'approvalCapability', 'nativeReady'].forEach(key => expect(history).not.toHaveProperty(key));
      const snapshotResult = decodeOptionEWorkplanSubmittedHistoryV5({ kind: 'snapshot', canonicalBody: v5Canonical(receipt.snapshot) }, expected);
      expect(snapshotResult.status).toBe('DECODED_SOURCE_ONLY');
      if (snapshotResult.status === 'DECODED_SOURCE_ONLY') {
        expect(snapshotResult.history.receipt).toBeUndefined();
        expect(snapshotResult.history.raw).toEqual(history.raw);
      }
    });

  test('uses exact captured optional Pillar and raw labels, keeping unrelated later configuration out of history', () => {
    const receipt = receiptFixture(true), authority = receipt.snapshot.admission.authority;
    const draft = JSON.parse(authority.draft.body) as IOptionEWorkplanDraftV2Aggregate;
    draft.impact[0].classificationSelection.strategicPillarKey = 'PILLAR-1';
    authority.draft.body = canonicaliseOptionEDraftV2(draft);
    changePublication(receipt, 'ImpactTaxonomy', (publication: IV5HistoricalTaxonomyPublication) => {
      publication.payload.strategicPillars = [{ ...publication.payload.strategicPillars[0], label: ' Historical pillar 😀 e\u0301 ' }];
    });
    const before = decode(receipt);
    const unrelatedCurrentConfig = { weights: { core: 60, impact: 40 }, label: 'Today’s label', year: 2030 };
    unrelatedCurrentConfig.weights.core = 90; unrelatedCurrentConfig.label = 'Another current label';
    const after = decode(receipt);
    expect(after).toEqual(before);
    expect(after.impactClassifications[0].classification.strategicPillar?.label).toBe(' Historical pillar 😀 e\u0301 ');
    expect(after.overallDeliveryWeightConfiguration.coreWeight).toBe(80);
    expect(after.raw.taxonomyBody).toContain(' Historical pillar 😀 e\u0301 ');
  });

  test.each(['workplan', 'person', 'year'] as const)('HOLD for a different expected %s', key => {
    const coordinates = { ...expected, [key]: key === 'year' ? 2027 : 'different' };
    expect(decodeOptionEWorkplanSubmittedHistoryV5({ kind: 'receipt', canonicalBody: v5Canonical(receiptFixture()) }, coordinates).status).toBe('HOLD');
  });
  test('missing capture and future loader remain HOLD without invoking a loader', () => {
    expect(decodeOptionEWorkplanSubmittedHistoryV5(undefined, expected)).toEqual({ status: 'HOLD', reason: 'MissingCapture' });
    expect(V5_SUBMITTED_HISTORY_LOADER_BINDING).toEqual({ state: 'UNBOUND', status: 'HOLD', loader: undefined });
    expect(decodeOptionEWorkplanSubmittedHistoryV5({ kind: 'receipt', canonicalBody: '{}' }, expected).status).toBe('HOLD');
  });
  test('decodes Manager history without creating or invoking an approval capability', () => {
    const bind = jest.spyOn(weightingPolicy, 'bindAuthoritativeDeliveryWeightOverrideCapability');
    const approve = jest.spyOn(weightingPolicy, 'approveDeliveryWeightOverride');
    try { decode(receiptFixture(true)); expect(bind).not.toHaveBeenCalled(); expect(approve).not.toHaveBeenCalled(); }
    finally { bind.mockRestore(); approve.mockRestore(); }
  });
  test('historical resolution is independent of the current clock', () => {
    const receipt = receiptFixture(true), historical = decode(receipt);
    jest.useFakeTimers(); jest.setSystemTime(new Date('2035-01-01T00:00:00.000Z'));
    try { expect(decode(receipt)).toEqual(historical); } finally { jest.useRealTimers(); }
  });
  test('global capture cannot replace a Workplan override whose publication is missing', () => {
    const receipt = receiptFixture();
    receipt.snapshot.admission.authority.workplan.value = { ...receipt.snapshot.admission.authority.workplan.value,
      overallDeliveryWeightConfiguration: { configurationKey: 'captured-earlier-override', configurationVersion: 'override-7',
        coreWeight: 80, impactWeight: 20, sourceReference: 'KCF-KPI-Sponsor-PD-01' } };
    hold(receipt);
  });
  test('matching complete global Workplan configuration is preserved', () => {
    const receipt = receiptFixture();
    receipt.snapshot.admission.authority.workplan.value = { ...receipt.snapshot.admission.authority.workplan.value,
      overallDeliveryWeightConfiguration: { configurationKey: 'synthetic-publication-global-1', configurationVersion: 'global-1',
        coreWeight: 70, impactWeight: 30, sourceReference: 'KCF-KPI-Sponsor-PD-01' } };
    expect(decode(receipt).snapshot).toEqual(receipt.snapshot);
  });

  test.each(['taxonomyId', 'version', 'etag', 'contentSha256'] as const)('HOLD for changed captured taxonomy pin %s', key => {
    const receipt = receiptFixture(), authority = receipt.snapshot.admission.authority;
    const draft = JSON.parse(authority.draft.body) as IOptionEWorkplanDraftV2Aggregate;
    draft.impact[0].classificationSelection.taxonomyPin[key] = key === 'contentSha256' ? 'C'.repeat(64) : key === 'etag' ? '"other"' : 'other';
    authority.draft.body = canonicaliseOptionEDraftV2(draft); refresh(receipt); hold(receipt);
  });
  test.each(['businessContributionAreaKey', 'strategicPillarKey'] as const)('HOLD for absent captured %s member', key => {
    const receipt = receiptFixture(), authority = receipt.snapshot.admission.authority;
    const draft = JSON.parse(authority.draft.body) as IOptionEWorkplanDraftV2Aggregate;
    draft.impact[0].classificationSelection[key] = 'not-in-publication';
    authority.draft.body = canonicaliseOptionEDraftV2(draft); refresh(receipt); hold(receipt);
  });
  const taxonomyChanges: Array<[string, (publication: IV5HistoricalTaxonomyPublication) => void]> = [
    ['unpublished at capture', p => { p.payload.authority.publishedAt = '2026-10-04T09:00:00.000Z'; }],
    ['not yet effective', p => { p.payload.authority.effectiveFrom = '2026-10-04'; }],
    ['invalid calendar date', p => { p.payload.authority.effectiveFrom = '2026-02-30'; }],
    ['retired member', p => { p.payload.businessContributionAreas = p.payload.businessContributionAreas.map((option, i) =>
      i === 0 ? { ...option, effectiveTo: '2026-10-03' } : option); }],
    ['missing member', p => { p.payload.businessContributionAreas = p.payload.businessContributionAreas.slice(1); }]
  ];
  test.each(taxonomyChanges)('HOLD for taxonomy %s', (_name, change) => {
    const receipt = receiptFixture(); changePublication(receipt, 'ImpactTaxonomy', change); hold(receipt);
  });
  type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };
  const managerChanges: Array<[string, (publication: Mutable<IManagerDeliveryPublicationProposal>) => void]> = [
    ['missing reason', p => { p.provenance.approval.audit.reason = ''; }],
    ['different before weights', p => { p.provenance.approval.audit.before.core = 60; p.provenance.approval.audit.before.impact = 40; }],
    ['different after weights', p => { p.provenance.approval.audit.after.core = 75; p.provenance.approval.audit.after.impact = 25; }],
    ['different source version', p => { p.provenance.approval.audit.sourceVersion++; }],
    ['later audit date', p => { p.provenance.approval.audit.eventAt = '2026-10-04T10:00:00.000Z'; }],
    ['different approving Manager', p => { (p.provenance.approval as { actorPersonKey: string }).actorPersonKey = 'other-manager'; }],
    ['different Workplan observation', p => { (p.provenance.workplanSource.value as IAnnualWorkplan).rowVersionToken++; }],
    ['changed baseline', p => { (p.provenance.baseline.scope as { year: number }).year = 2027; }]
  ];
  test.each(managerChanges)('HOLD for Manager history %s', (_name, change) => {
    const receipt = receiptFixture(true); changePublication(receipt, 'DeliveryConfiguration', change); hold(receipt);
  });
  test.each(['Id', 'OData__UIVersionString', '@odata.etag'])('HOLD for crossed captured native metadata %s', key => {
    const receipt = receiptFixture(), row = receipt.snapshot.admission.authority.references.rows[0];
    if ('nativeMetadataBody' in row) {
      const metadata = JSON.parse(row.nativeMetadataBody); metadata[key] = key === 'Id' ? 99 : 'other';
      row.nativeMetadataBody = JSON.stringify(metadata);
    }
    refresh(receipt); hold(receipt);
  });
  test('HOLD when the historical publication is absent; no default fallback', () => {
    const receipt = receiptFixture(); receipt.snapshot.admission.authority.references.rows.pop(); refresh(receipt); hold(receipt);
  });
});

// Unchanged frozen codec constructors, privately scoped to retain all six original histories.
const capturedFixtures = (() => {
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

return { receiptFixture, completeReceiptFixture, cases };
})();
const capturedInput = (receipt: V5Receipt, kind: 'receipt' | 'snapshot' = 'receipt'): IV5CapturedHistoryCapture => ({
  kind, encoding: 'captured-native-request/v1',
  canonicalBody: kind === 'receipt' ? encodeV5CapturedReceipt(receipt) : encodeV5CapturedSnapshot(receipt.snapshot)
});
const capturedHistory = (capture: IV5CapturedHistoryCapture): Readonly<IV5SubmittedHistory> => {
  const result = decodeOptionEWorkplanSubmittedCapturedHistoryV5(capture, expected);
  if (result.status !== 'DECODED_SOURCE_ONLY') throw new Error(result.reason);
  return result.history;
};
describe('explicit captured-r3 historical adapter', () => {
  test.each(capturedFixtures.cases.flatMap(value => (['receipt', 'snapshot'] as const).map(kind => ({ ...value, kind }))))(
    '$name $kind keeps original frame, seven raw strings and complete logical history', value => {
      const original = value.full ? capturedFixtures.completeReceiptFixture(value.manager)
        : capturedFixtures.receiptFixture(value.manager, value.minimal);
      const before = v4Canonical(original), capture = capturedInput(original, value.kind), captureBefore = v4Canonical(capture);
      expect(hash(before).toUpperCase()).toBe(value.originalSha);
      expect(BufferByteLength(capture.canonicalBody)).toBe(value[value.kind]);
      const history = capturedHistory(capture), a = original.snapshot.admission.authority;
      expect(history.capture).toEqual(capture); expect(history.capture.canonicalBody).toBe(capture.canonicalBody);
      expect(history.snapshot).toEqual(original.snapshot);
      expect(history.receipt).toEqual(value.kind === 'receipt' ? original : undefined);
      const delivery = a.references.rows.find(row => row.kind === 'DeliveryConfiguration')!;
      const taxonomy = a.references.rows.find(row => row.kind === 'ImpactTaxonomy')!;
      const raw = { requestBody: a.request.body, referenceBody: a.request.query.referenceBody, draftBody: original.snapshot.body,
        deliveryBody: delivery.body, taxonomyBody: taxonomy.body,
        deliveryNativeMetadataBody: 'nativeMetadataBody' in delivery ? delivery.nativeMetadataBody : '',
        taxonomyNativeMetadataBody: 'nativeMetadataBody' in taxonomy ? taxonomy.nativeMetadataBody : '' };
      expect(history.raw).toEqual(raw); expect(Object.keys(history.raw)).toHaveLength(7);
      expect(Object.values(history.raw).map(hash)).toEqual(Object.values(raw).map(hash));
      expect(history.snapshot.admission.authority.references.rows).toEqual(a.references.rows);
      expect(history.snapshot.admission.authority.references.rows.map(row => hash(row.body))).toEqual(a.references.rows.map(row => hash(row.body)));
      expect(a.references.rows).toHaveLength(value.full ? 48 : 2);
      if (value.full) {
        expect(new Set(a.references.rows.map(row => row.kind)).size).toBe(12);
        expect(BufferByteLength(before)).toBeGreaterThan(56000);
      }
      expect(history.snapshot.admission.authority.workplan).toEqual(a.workplan);
      expect(history.deliveryPublication).toEqual(JSON.parse(delivery.body));
      expect(history.taxonomyPublication).toEqual(JSON.parse(taxonomy.body));
      expect(history.overallDeliveryWeightConfiguration.coreWeight).toBe(value.manager ? 80 : 70);
      expect(history.overallDeliveryWeightConfiguration.impactWeight).toBe(value.manager ? 20 : 30);
      if (value.manager) {
        const proposal = history.deliveryPublication as IManagerDeliveryPublicationProposal;
        expect(proposal.provenance.baseline).toEqual(JSON.parse(delivery.body).provenance.baseline);
        expect(proposal.provenance.approval).toEqual(JSON.parse(delivery.body).provenance.approval);
        expect(proposal.provenance.actorSource).toEqual(JSON.parse(delivery.body).provenance.actorSource);
        expect(proposal.provenance.subjectSource).toEqual(JSON.parse(delivery.body).provenance.subjectSource);
      }
      expect(history.draft).toEqual(JSON.parse(original.snapshot.body));
      expect(Object.isFrozen(history)).toBe(true); expect(Object.isFrozen(history.snapshot.admission.authority.references.rows)).toBe(true);
      expect(Object.isFrozen(history.capture)).toBe(true); expect(Object.isFrozen(history.raw)).toBe(true);
      expect(v4Canonical(original)).toBe(before); expect(v4Canonical(capture)).toBe(captureBefore);
      ['protectedOrigin', 'trusted', 'approvalCapability', 'nativeReady'].forEach(key => expect(history).not.toHaveProperty(key));
    });
  test.each(capturedFixtures.cases.filter(value => !value.full))('$name keeps both explicit r2 entry points unchanged', value => {
    const receipt = capturedFixtures.receiptFixture(value.manager, value.minimal);
    for (const kind of ['receipt', 'snapshot'] as const) {
      const capture = { kind, canonicalBody: v5Canonical(kind === 'receipt' ? receipt : receipt.snapshot) };
      const result = decodeOptionEWorkplanSubmittedHistoryV5(capture, expected);
      expect(result.status).toBe('DECODED_SOURCE_ONLY');
      if (result.status === 'DECODED_SOURCE_ONLY') {
        expect(result.history.capture).toEqual(capture); expect(result.history.capture).not.toHaveProperty('encoding');
        expect(result.history.snapshot).toEqual(receipt.snapshot);
      }
    }
  });
  test('explicit routes reject mismatched encoding and input shapes', () => {
    const receipt = capturedFixtures.receiptFixture(), capture = capturedInput(receipt);
    expect(decodeOptionEWorkplanSubmittedHistoryV5(capture, expected).status).toBe('HOLD');
    expect(decodeOptionEWorkplanSubmittedHistoryV5({ kind: 'receipt', canonicalBody: capture.canonicalBody }, expected).status).toBe('HOLD');
    expect(decodeOptionEWorkplanSubmittedCapturedHistoryV5({ ...capture, canonicalBody: v5Canonical(receipt) }, expected).status).toBe('HOLD');
    expect(decodeOptionEWorkplanSubmittedCapturedHistoryV5({ ...capture, kind: 'snapshot' }, expected).status).toBe('HOLD');
    expect(decodeOptionEWorkplanSubmittedCapturedHistoryV5({ ...capture, encoding: 'other' } as unknown as IV5CapturedHistoryCapture, expected).status).toBe('HOLD');
    expect(decodeOptionEWorkplanSubmittedCapturedHistoryV5({ kind: 'receipt', canonicalBody: capture.canonicalBody } as IV5CapturedHistoryCapture, expected).status).toBe('HOLD');
  });
  test.each(['workplan', 'person', 'year'] as const)('captured history with conflicting expected %s remains HOLD', coordinate => {
    const capture = capturedInput(capturedFixtures.completeReceiptFixture(true));
    expect(decodeOptionEWorkplanSubmittedCapturedHistoryV5(capture, { ...expected, [coordinate]: coordinate === 'year' ? 2027 : 'different' }).status).toBe('HOLD');
  });
  test('missing captured history leaves the future loader unbound', () => {
    expect(decodeOptionEWorkplanSubmittedCapturedHistoryV5(undefined, expected)).toEqual({ status: 'HOLD', reason: 'MissingCapture' });
    expect(decodeOptionEWorkplanSubmittedCapturedHistoryV5({ kind: 'receipt', encoding: 'captured-native-request/v1', canonicalBody: '{}' }, expected).status).toBe('HOLD');
    expect(V5_SUBMITTED_HISTORY_LOADER_BINDING).toEqual({ state: 'UNBOUND', status: 'HOLD', loader: undefined });
  });
  test('captured Manager history never binds or invokes approval capability', () => {
    const capture = capturedInput(capturedFixtures.completeReceiptFixture(true));
    const bind = jest.spyOn(weightingPolicy, 'bindAuthoritativeDeliveryWeightOverrideCapability');
    const approve = jest.spyOn(weightingPolicy, 'approveDeliveryWeightOverride');
    try { capturedHistory(capture); expect(bind).not.toHaveBeenCalled(); expect(approve).not.toHaveBeenCalled(); }
    finally { bind.mockRestore(); approve.mockRestore(); }
  });
  test('captured optional Pillar and original labels survive unrelated current values and clock', () => {
    const receipt = capturedFixtures.completeReceiptFixture(true), a = receipt.snapshot.admission.authority;
    const draft = parseCanonicalOptionEDraftV2(a.draft.body); draft.impact[0].classificationSelection.strategicPillarKey = 'PILLAR-1';
    a.draft.body = canonicaliseOptionEDraftV2(draft);
    changePublication(receipt, 'ImpactTaxonomy', (publication: IV5HistoricalTaxonomyPublication) => {
      publication.payload.strategicPillars = [{ ...publication.payload.strategicPillars[0], label: ' Captured pillar 😀 e\u0301 ' }];
    });
    const capture = capturedInput(receipt), before = capturedHistory(capture);
    const unrelated = { weights: { core: 10, impact: 90 }, label: 'Current label' }; unrelated.weights.core = 60;
    jest.useFakeTimers(); jest.setSystemTime(new Date('2035-01-01T00:00:00.000Z'));
    try {
      const after = capturedHistory(capture); expect(after).toEqual(before);
      expect(after.impactClassifications[0].classification.strategicPillar?.label).toBe(' Captured pillar 😀 e\u0301 ');
      expect(after.overallDeliveryWeightConfiguration.coreWeight).toBe(80);
    } finally { jest.useRealTimers(); }
  });
});