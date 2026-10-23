import { TextDecoder, TextEncoder } from 'node:util';
import { createHash } from 'node:crypto';
import type { IAnnualWorkplan } from '../models/ProductionModels';
import type { IDeliveryPublicationManagerObservations, IDeliveryPublicationNativeCoordinates,
  IGlobalDeliveryPublicationProposal, IManagerDeliveryPublicationProposal } from '../models/GovernedDeliveryPublicationV1Models';
import { ADMIN_OVERALL_DELIVERY_CONFIG_KEYS, type IAdminOverallDeliveryConfigurationContract } from './AdminConfigDomain';
import type { IDeliveryWeightOverrideRequest, IGovernedDeliveryWeightConfigurationContract } from './CategoryWeightingPolicy';
import { buildGlobalDeliveryPublicationProposal, buildManagerDeliveryPublicationProposal } from './GovernedDeliveryPublicationV1';
import {
  EXACT_BODY_V5, V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT, V5_OPERATION_CONTRACT,
  V5_DELIVERY_READER_CONTRACT, V5_TAXONOMY_READER_CONTRACT, type V5Request, type V5ReferenceSet,
  type V5Authority, type V5Admission, type V5Snapshot, type V5Receipt, type V5JournalOperation, type V5TaxonomyReferenceRow
} from '../models/OptionEWorkplanSubmitExactBodyV5Models';
import { EXACT_BODY_V4 } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { OPTION_E_DRAFT_V2_SCHEMA_VERSION, type IOptionEWorkplanDraftV2Aggregate } from '../models/OptionEWorkplanDraftV2Models';
import { canonicaliseOptionEDraftV2, DRAFT_V2_SCHEMA } from './OptionEWorkplanDraftV2Wire';
import { V4_DRAFT_SCHEMA, V4_WIRE_SCHEMA, v4Canonical, parseV4Request, decodeV4Utf8, BufferByteLength } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { V5_WIRE_SCHEMA, V5_REFERENCE_SCHEMA, v5Canonical, v5IdentityKey, parseV5Request, parseV5ReferenceSet,
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
const frames: { name: string; fixture: () => object; parse: (text: string) => unknown }[] = [
  { name: 'request', fixture: requestFixture, parse: parseV5Request }, { name: 'references', fixture: referencesFixture, parse: parseV5ReferenceSet },
  { name: 'admission', fixture: admissionFixture, parse: parseV5Admission }, { name: 'journal', fixture: operationFixture, parse: parseV5JournalOperation },
  { name: 'snapshot', fixture: snapshotFixture, parse: parseV5Snapshot },
  { name: 'receipt', fixture: receiptFixture, parse: parseV5Receipt }
];
const hash = (value: unknown): string => createHash('sha256').update(v4Canonical(value)).digest('hex');

describe('V5 source contracts and structural parsers', () => {
  test.each(frames)('roundtrips complete $name without creating trust markers', ({ fixture, parse }) => {
    const value = fixture(), body = v5Canonical(value);
    expect(parse(body)).toEqual(value);
    expect(decodeV4Utf8(new TextEncoder().encode(body))).toBe(body);
    expect(parse(body)).not.toHaveProperty('trusted');
    expect(parse(body)).not.toHaveProperty('verified');
    expect(parse(body)).not.toHaveProperty('protectedOrigin');
  });
  test.each(frames)('rejects extra and missing required roots in $name', ({ name, fixture, parse }) => {
    expect(() => parse(v5Canonical({ ...fixture(), unexpected: true }))).toThrow();
    for (const key of Object.keys(fixture())) {
      if (name === 'journal' && key === 'controlIntent') continue;
      const value = fixture() as Record<string, unknown>; delete value[key];
      expect(() => parse(v5Canonical(value))).toThrow();
    }
  });
  test.each(frames)('rejects noncanonical/duplicate/trailing/BOM $name frames', ({ fixture, parse }) => {
    const body = v5Canonical(fixture());
    for (const text of [' ' + body, body + '\n', '\ufeff' + body, body.slice(0, -1), '{"extra":1,"extra":1,' + body.slice(1)]) {
      expect(() => parse(text)).toThrow();
    }
  });
  test.each([false, true])('retains complete raw PD publication and native metadata with Manager override=%s', manager => {
    const value = referencesFixture(manager), before = JSON.stringify(value), body = v5Canonical(value);
    const result = parseV5ReferenceSet(body);
    expect(result).toEqual(value); expect(JSON.stringify(value)).toBe(before);
    for (const item of result.rows) {
      expect(item.body).toBe(value.rows.find(row => row.kind === item.kind)!.body);
      if ('nativeMetadataBody' in item) expect(item.nativeMetadataBody).toContain('\n');
    }
    expect(JSON.parse(result.rows[0].body).provenance).toEqual(JSON.parse(value.rows[0].body).provenance);
    expect(result.rows[0].body).not.toBe(v4Canonical(JSON.parse(result.rows[0].body)));
  });
  test('preserves taxonomy publication pins separately from document version and ETag', () => {
    const result = parseV5ReferenceSet(v5Canonical(referencesFixture()));
    const taxonomy = result.rows[1] as V5TaxonomyReferenceRow;
    expect(JSON.parse(taxonomy.body).payload.authority.version).toBe('taxonomy-1');
    expect(taxonomy.native.version).toBe('native-7');
    expect(JSON.parse(taxonomy.body).payload.authority.etag).toBe('"taxonomy-pin-1"');
    expect(taxonomy.native.etag).toBe('"native-7"');
  });
  test.each(['DeliveryConfiguration', 'ImpactTaxonomy'])('requires exactly one %s row', kind => {
    const absent = referencesFixture(); absent.rows = absent.rows.filter(row => row.kind !== kind);
    expect(() => parseV5ReferenceSet(v5Canonical(absent))).toThrow();
    const duplicate = referencesFixture(); duplicate.rows.push(copy(duplicate.rows.find(row => row.kind === kind)!));
    expect(() => parseV5ReferenceSet(v5Canonical(duplicate))).toThrow();
  });
  test.each(['Kpi', 'Target', 'Framework', 'Assignment', 'Value', 'Prompt', 'Catalogue', 'Headline', 'Focus', 'BehaviourTarget'])('retains legacy %s closed row structure; body semantics remain later admission', kind => {
    const refs = referencesFixture();
    const item = { kind, key: 'legacy|key', itemId: 90, etag: '"r1"', version: '1', body: '{}' };
    refs.rows.push(item as V5ReferenceSet['rows'][number]);
    expect(parseV5ReferenceSet(v5Canonical(refs)).rows[2]).toEqual(item);
    refs.rows.push(copy(refs.rows[2])); expect(() => parseV5ReferenceSet(v5Canonical(refs))).toThrow();
  });
  test.each(['readerContract', 'key', 'itemId', 'etag', 'version'])('rejects mixed/crossed new row %s', field => {
    for (let index = 0; index < 2; index++) {
      const refs = referencesFixture();
      const item = refs.rows[index] as unknown as Record<string, unknown>;
      item[field] = field === 'itemId' ? 900 : field === 'etag' ? '"crossed"' : field === 'readerContract' ? 'BehaviourReader' : 'crossed';
      expect(() => parseV5ReferenceSet(v5Canonical(refs))).toThrow();
    }
  });
  test.each(['contract', 'purposeApproval'])('rejects crossed publication %s', field => {
    for (let index = 0; index < 2; index++) {
      const refs = referencesFixture(); const publication = JSON.parse(refs.rows[index].body);
      publication[field] = 'legacy-behaviour-purpose'; refs.rows[index].body = JSON.stringify(publication);
      expect(() => parseV5ReferenceSet(v5Canonical(refs))).toThrow();
    }
  });
  test.each(['scope', 'payload', 'provenance'])('rejects missing full Delivery %s', field => {
    const refs = referencesFixture(); const publication = JSON.parse(refs.rows[0].body);
    delete publication[field]; refs.rows[0].body = JSON.stringify(publication);
    expect(() => parseV5ReferenceSet(v5Canonical(refs))).toThrow();
  });
  test.each(['workplan', 'person', 'year'])('rejects crossed Manager publication scope %s', field => {
    const refs = referencesFixture(true); const publication = JSON.parse(refs.rows[0].body);
    publication.scope[field] = field === 'year' ? 2025 : 'crossed'; refs.rows[0].body = JSON.stringify(publication);
    expect(() => parseV5ReferenceSet(v5Canonical(refs))).toThrow();
  });
  test.each(['contract', 'admitted', 'approved', 'manager', 'weights'])('rejects extra new row/native keys %s', key => {
    for (const inner of [false, true]) {
      const refs = referencesFixture(); const item = refs.rows[1] as V5TaxonomyReferenceRow;
      ((inner ? item.native : item) as unknown as Record<string, unknown>)[key] = true;
      expect(() => parseV5ReferenceSet(v5Canonical(refs))).toThrow();
    }
  });
  test.each(['protocol', 'integrity', 'wire', 'storage', 'receipt'])('rejects crossed capability %s', field => {
    const request = requestFixture(); request.capability = { ...request.capability, [field]: 'old' } as typeof EXACT_BODY_V5;
    expect(() => parseV5Request(v5Canonical(request))).toThrow();
    expect(() => v5IdentityKey(request)).toThrow();
  });
  test('rejects V4 request/source/reference shapes without changing old admission', () => {
    const request = requestFixture();
    expect(() => parseV4Request(v5Canonical(request))).toThrow();
    expect(() => parseV5Request(v5Canonical({ ...request, capability: EXACT_BODY_V4 }))).toThrow();
    expect(() => parseV5Request(v5Canonical({ ...request, source: { ...request.source, schema: 'kcf.workplan-draft/v1' } }))).toThrow();
    const refs = referencesFixture(); const { contract, ...oldRefs } = refs;
    expect(contract).toBe(V5_REFERENCE_CONTRACT);
    expect(() => parseV5ReferenceSet(v5Canonical(oldRefs))).toThrow();
  });
  test('versioned key retains changed same-command requests and separates V4', () => {
    const request = requestFixture(), key = v5IdentityKey(request);
    for (const version of [...Object.values(EXACT_BODY_V5), V5_REFERENCE_CONTRACT, V5_AUTHORITY_CONTRACT, V5_ADMISSION_CONTRACT, V5_OPERATION_CONTRACT]) expect(key).toContain(version);
    expect(key).not.toBe(`${request.person}|${request.year}|${request.command}`);
    const changed = copy(request); const draft = draftFixture(); draft.impact[0].success = 'changed'; changed.source.body = canonicaliseOptionEDraftV2(draft);
    expect(v5IdentityKey(changed)).toBe(key);
    expect(v5Canonical(changed)).not.toBe(v5Canonical(request));
    expect(v5IdentityKey({ ...request, command: 'cbf5edb8-5d3b-46a5-a5ea-4564fa3ff43c' })).not.toBe(key);
  });
  test.each(['', ' ', 'employee|2026'])('rejects invalid identity person %p', person => {
    const value = { ...requestFixture(), person };
    expect(() => parseV5Request(v5Canonical(value))).toThrow(); expect(() => v5IdentityKey(value)).toThrow();
  });
  test('allows existing compound Workplan keys which are not replay-key components', () => {
    const value = { ...requestFixture(), workplan: 'employee|2026' };
    expect(parseV5Request(v5Canonical(value)).workplan).toBe('employee|2026');
  });
  test.each(['admission', 'journal', 'snapshot', 'receipt'])('rejects crossed/missing stored tag in %s', name => {
    const frame = frames.find(item => item.name === name)!;
    const value = frame.fixture() as Record<string, unknown>; value.contract = EXACT_BODY_V4.storage;
    expect(() => frame.parse(v5Canonical(value))).toThrow();
  });
  test.each(['contract', 'request', 'draft', 'references', 'actor', 'manager', 'control', 'workplan'])('rejects missing authority %s', field => {
    const value = admissionFixture(); delete (value.authority as unknown as Record<string, unknown>)[field];
    expect(() => parseV5Admission(v5Canonical(value))).toThrow();
  });
  test('checks exact admission/native request/source/observed Workplan consistency', () => {
    const mutations: ((value: V5Admission) => void)[] = [
      value => { value.key += '|other'; }, value => { value.authority.contract = 'old' as typeof V5_AUTHORITY_CONTRACT; },
      value => { value.authority.request.query.source.version = 'changed'; }, value => { value.authority.draft.version = 'changed'; },
      value => { value.authority.references.asOf = '2026-10-03T10:04:00.000Z'; },
      value => { value.authority.workplan.native = { ...value.authority.workplan.native, itemId: 999 }; },
      value => { value.authority.workplan.native = { ...value.authority.workplan.native, etag: '"changed"' }; },
      value => { (value.authority.workplan.value as IAnnualWorkplan).personKey = 'changed'; },
      value => { value.eventAt = 'yesterday'; }, value => { value.authority.control.person = 'changed'; }
    ];
    for (const mutate of mutations) { const value = copy(admissionFixture()); mutate(value); expect(() => parseV5Admission(v5Canonical(value))).toThrow(); }
  });
  test('requires snapshots to preserve exact historical admitted bodies', () => {
    const snap = snapshotFixture(); snap.body = snap.body.replace('Evidence', 'Changed');
    expect(() => parseV5Snapshot(v5Canonical(snap))).toThrow();
    const refs = snapshotFixture(); refs.admission.authority.request.query.referenceBody += ' ';
    expect(() => parseV5Snapshot(v5Canonical(refs))).toThrow();
  });
  test.each([
    { name: 'global/full', manager: false, minimal: false, bytes: 38592, originalBytes: 81667,
      originalSha256: '0d4c59659fd10ea9c3b9c89b9883ebc05a61264f90ce8d3ec88c32fb01bd0d19' },
    { name: 'global/minimal', manager: false, minimal: true, bytes: 33800, originalBytes: 73226,
      originalSha256: '6696e82079769bf179144ec946d32bd8ee717a0597e45a45b32fdfc509d07799' },
    { name: 'Manager/full', manager: true, minimal: false, bytes: 49757, originalBytes: 107500,
      originalSha256: '07abf5aa641b39ed77f0ec1e409ddba27d9358fd029e3e2bfdf7d7d0534ef69d' },
    { name: 'Manager/minimal', manager: true, minimal: true, bytes: 44965, originalBytes: 99059,
      originalSha256: '275ca7b35a63a04a70e90d9374ee16938c01517498da7addc8b3dfa21f0288b5' }
  ])('r2 complete $name receipt fits losslessly and exactly reconstructs the sealed r1 failure', item => {
    const value = receiptFixture(item.manager, item.minimal), before = copy(value), body = v5Canonical(value);
    const result = parseV5Receipt(body), captured = result.snapshot.admission;
    expect(BufferByteLength(body)).toBe(item.bytes);
    expect(result).toEqual(before); expect(value).toEqual(before);
    expect(parseV5Snapshot(v5Canonical(result.snapshot))).toEqual(before.snapshot);
    expect(parseV5Admission(v5Canonical(captured))).toEqual(before.snapshot.admission);
    const referenceBody = captured.authority.request.query.referenceBody;
    expect(parseV5ReferenceSet(referenceBody)).toEqual(before.snapshot.admission.authority.references);
    expect(result.snapshot.body).toBe(before.snapshot.body);
    expect(captured.authority.request.body).toBe(before.snapshot.admission.authority.request.body);
    expect(referenceBody).toBe(before.snapshot.admission.authority.request.query.referenceBody);
    captured.authority.references.rows.forEach((row, index) => {
      const original = before.snapshot.admission.authority.references.rows[index];
      expect(row.body).toBe(original.body);
      expect(row.body).not.toBe(v4Canonical(JSON.parse(row.body)));
      if ('nativeMetadataBody' in row && 'nativeMetadataBody' in original) {
        expect(row.nativeMetadataBody).toBe(original.nativeMetadataBody);
        expect(row.nativeMetadataBody).toContain('\n'); expect(row.nativeMetadataBody).toContain('😀 e\u0301');
        expect(row.native).toEqual(original.native);
      }
    });
    if (item.manager) {
      const publication = JSON.parse(captured.authority.references.rows[0].body) as IManagerDeliveryPublicationProposal;
      expect(publication.provenance).toEqual(override().provenance);
      expect(publication.provenance.baseline.payload.activeWeights).toEqual({ core: 70, impact: 30 });
      expect(publication.payload.activeWeights).toEqual({ core: 80, impact: 20 });
    }
    // These hashes are the untouched A013 global and A014 Manager historical evidence, not r2-generated expectations.
    const original = { ...result, admission: captured, snapshot: { ...result.snapshot, referencesBody: referenceBody } };
    expect(BufferByteLength(v4Canonical(original))).toBe(item.originalBytes);
    expect(hash(original)).toBe(item.originalSha256);
    expect(() => v5Canonical(original)).toThrow('ExactBodyV5WireInvalid');
    expect(() => parseV5Receipt(v4Canonical(original))).toThrow('ExactBodyV5WireInvalid');
  });
  test('r2 closed receipt and nested snapshot reject removed r1 members without a size-limit shortcut', () => {
    const receipt = receiptFixture();
    const oldReceipt = { ...receipt, admission: {} };
    expect(BufferByteLength(v5Canonical(oldReceipt))).toBeLessThan(56000);
    expect(() => parseV5Receipt(v5Canonical(oldReceipt))).toThrow();
    const oldSnapshot = { ...receipt.snapshot, referencesBody: receipt.snapshot.admission.authority.request.query.referenceBody };
    expect(() => parseV5Snapshot(v5Canonical(oldSnapshot))).toThrow();
    expect(() => parseV5Receipt(v5Canonical({ ...receipt, snapshot: oldSnapshot }))).toThrow();
  });
  test.each(['snapshot', 'admission'])('receipt enforces required and extra keys inside %s', level => {
    const select = (value: V5Receipt): Record<string, unknown> =>
      (level === 'snapshot' ? value.snapshot : value.snapshot.admission) as unknown as Record<string, unknown>;
    const extra = receiptFixture(); select(extra).unexpected = true;
    expect(() => parseV5Receipt(v5Canonical(extra))).toThrow();
    for (const key of Object.keys(select(receiptFixture()))) {
      const value = receiptFixture(); delete select(value)[key];
      expect(() => parseV5Receipt(v5Canonical(value))).toThrow();
    }
  });
  test.each(['receipt', 'snapshot', 'admission'])('receipt rejects crossed %s key', level => {
    const value = receiptFixture();
    (level === 'receipt' ? value : level === 'snapshot' ? value.snapshot : value.snapshot.admission).key += '|other';
    expect(() => parseV5Receipt(v5Canonical(value))).toThrow();
  });
  test.each(['snapshot', 'admission'])('receipt rejects crossed nested %s contract', level => {
    const value = receiptFixture();
    const nested = (level === 'snapshot' ? value.snapshot : value.snapshot.admission) as unknown as Record<string, unknown>;
    nested.contract = 'legacy'; expect(() => parseV5Receipt(v5Canonical(value))).toThrow();
  });
  test.each(['protocol', 'integrity', 'wire', 'storage', 'receipt'])('receipt enforces nested admission capability %s', field => {
    const value = receiptFixture();
    value.snapshot.admission.capability = { ...EXACT_BODY_V5, [field]: 'legacy' } as typeof EXACT_BODY_V5;
    expect(() => parseV5Receipt(v5Canonical(value))).toThrow();
  });
  test.each(['2026-10-03', '2026-10-03T10:03:01Z', '2026-10-03T11:03:01.000+01:00',
    '2026-02-30T10:03:01.000Z', '2026-10-03T24:03:01.000Z', '', 'yesterday'])('receipt refuses non-exact UTC nativeCreated %p', nativeCreated => {
    expect(() => parseV5Receipt(v5Canonical({ ...receiptFixture(), nativeCreated }))).toThrow();
  });
  test('receipt checks full captured authority and historical body consistency through snapshot admission', () => {
    const mutations: ((value: V5Receipt) => void)[] = [
      value => { value.snapshot.body += ' '; },
      value => { value.snapshot.admission.authority.draft.body += ' '; },
      value => { value.snapshot.admission.authority.request.body += ' '; },
      value => { value.snapshot.admission.authority.request.query.source.version = 'changed'; },
      value => { value.snapshot.admission.authority.request.query.source.schema = 'kcf.workplan-draft/v1' as typeof OPTION_E_DRAFT_V2_SCHEMA_VERSION; },
      value => { value.snapshot.admission.authority.request.query.referenceBody += ' '; },
      value => { value.snapshot.admission.authority.references.rows[0].body += ' '; },
      value => { value.snapshot.admission.authority.references.rows[0].version = 'changed'; },
      value => { value.snapshot.admission.authority.references.rows[0].etag = '"changed"'; },
      value => { value.snapshot.admission.authority.references.rows[0].itemId = 999; },
      value => { value.snapshot.admission.authority.workplan.native = { ...value.snapshot.admission.authority.workplan.native, itemId: 999 }; },
      value => { value.snapshot.admission.authority.contract = 'old' as typeof V5_AUTHORITY_CONTRACT; }
    ];
    for (const mutate of mutations) {
      const value = copy(receiptFixture(true)); mutate(value);
      expect(() => parseV5Receipt(v5Canonical(value))).toThrow();
    }
  });
  test.each(['snapshot', 'receipt'])('complete %s accepts exactly 56000 UTF8 bytes and refuses 56001 without truncation', name => {
    const receipt = receiptFixture(true);
    const frame = name === 'snapshot' ? receipt.snapshot : receipt;
    const parse = name === 'snapshot' ? parseV5Snapshot : parseV5Receipt;
    const headroom = 56000 - BufferByteLength(v4Canonical(frame));
    receipt.snapshot.admission.authority.actor.version += 'é'.repeat(Math.floor(headroom / 2)) + 'x'.repeat(headroom % 2);
    const exact = v5Canonical(frame);
    expect(BufferByteLength(exact)).toBe(56000); expect(parse(exact)).toEqual(frame);
    receipt.snapshot.admission.authority.actor.version += 'x';
    expect(BufferByteLength(v4Canonical(frame))).toBe(56001);
    expect(() => v5Canonical(frame)).toThrow(); expect(() => parse(v4Canonical(frame))).toThrow();
  });
  test('self-consistent changed admission keeps the replay key and requires later full-admission executor comparison', () => {
    const original = receiptFixture(), changed = copy(original), draft = draftFixture();
    draft.impact[0].success = 'Updated synthetic evidence';
    const body = canonicaliseOptionEDraftV2(draft), authority = changed.snapshot.admission.authority;
    changed.snapshot.body = body; authority.draft.body = body; authority.request.query.source.body = body;
    authority.request.body = v5Canonical(authority.request.query);
    expect(parseV5Receipt(v5Canonical(changed))).toEqual(changed);
    expect(changed.key).toBe(original.key);
    expect(v5Canonical(changed.snapshot.admission)).not.toBe(v5Canonical(original.snapshot.admission));
  });
  test('checks journal checkpoint/ETag and exact CAS before/after/control identity shapes', () => {
    const mutations: ((value: V5JournalOperation) => void)[] = [value => { value.etag = '*'; },
      value => { value.checkpoint = 'unknown' as V5JournalOperation['checkpoint']; }, value => { value.controlReadback.person = 'other'; },
      value => { (value.controlIntent!.after as Record<string, unknown>).etag = '"invalid-after"'; },
      value => { value.controlIntent!.before.etag = 'W/"weak"'; }, value => { value.controlIntent!.after.workplan = 'other'; }
    ];
    for (const mutate of mutations) { const value = copy(operationFixture()); mutate(value); expect(() => parseV5JournalOperation(v5Canonical(value))).toThrow(); }
  });
  test('accepts omitted optional journal controlIntent and holdReason', () => {
    const value = operationFixture(); delete value.controlIntent;
    expect(parseV5JournalOperation(v5Canonical(value))).toEqual(value);
  });
  test.each([-0, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined, '\ud800'])('strict canonical helper rejects unsupported %p', value => {
    expect(() => v5Canonical({ value })).toThrow();
  });
  test('strict helper retains valid Unicode, depth and byte bounds', () => {
    expect(v5Canonical({ value: '😀é e\u0301' })).toBe(v4Canonical({ value: '😀é e\u0301' }));
    expect(BufferByteLength(v5Canonical('x'.repeat(55998)))).toBe(56000);
    expect(() => v5Canonical('x'.repeat(55999))).toThrow();
    expect(() => parseV5Request('['.repeat(66) + '0' + ']'.repeat(66))).toThrow();
    for (const bytes of [[0xef, 0xbb, 0xbf, 0x7b, 0x7d], [0xc0, 0xaf], [0xed, 0xa0, 0x80], [0xf0, 0x9f], [0xff]]) {
      expect(() => parseV5Request(decodeV4Utf8(Uint8Array.from(bytes)))).toThrow();
    }
  });
  test('rejects oversized complete frames instead of truncating raw metadata', () => {
    const refs = referencesFixture(); (refs.rows[1] as V5TaxonomyReferenceRow).nativeMetadataBody = JSON.stringify({ retained: 'x'.repeat(56000) });
    expect(() => v5Canonical(refs)).toThrow(); expect(() => parseV5ReferenceSet(v4Canonical(refs))).toThrow();
  });
  test('retains legacy closed schemas, fixture bytes and separates new schemas', () => {
    expect(hash(V4_DRAFT_SCHEMA)).toBe('9f854a7d2f8ba56c05fe7858f7c44050b61580475421b726840712ed52f19b51');
    expect(hash(V4_WIRE_SCHEMA)).toBe('a6710629c9a20e17691651463570aec1d82d742e92ac5e5dc44aa77b1da42a93');
    expect(hash(DRAFT_V2_SCHEMA)).toBe('287336b87852d500b59a7a8f4379a2eebc00e1475decbce314a65614c9377e66');
    expect(hash(V5_WIRE_SCHEMA)).not.toBe(hash(V4_WIRE_SCHEMA));
    expect(V5_REFERENCE_SCHEMA).not.toHaveProperty('trusted');
  });
});
