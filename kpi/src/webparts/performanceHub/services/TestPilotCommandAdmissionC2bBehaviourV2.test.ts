import {
  BEHAVIOUR_FRAMEWORK_V2_VERSION,
  BEHAVIOUR_V2_ROLE_TIERS,
  BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourV2RoleTier,
  type IBehaviourFrameworkV2PublishedSet,
  type IBehaviourLibraryV2Record,
  type IBehaviourPersonAssignmentV2
} from '../models/BehaviourFrameworkV2Models';
import type { IEmployeeBehaviourCommitmentInputV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import { decodeBehaviourSelectionSnapshotsV2 } from './BehaviourSelectionSnapshotsV2';
import { immutableTenantInput } from './tenant/ImmutableTenantInput';
import type { C2bAclImage, C2bCommandPlan, C2bListAclImage } from './TestPilotCommandAdmissionC2b';
import {
  planUpsertBehaviourCommitmentC2b,
  planSubmitWorkplanC2b,
  type C2bTrustedAnnualConfiguration,
  type C2bTrustedAnnualItem,
  type C2bTrustedBehaviourV2Observations,
  type C2bTrustedPerson,
  type C2bTrustedWorkplanHeader
} from './TestPilotCommandAdmissionC2bHandlers';

const processedAt = '2026-09-12T18:00:00Z';
const employee: C2bTrustedPerson = {
  personKey: 'PERSON-001', email: 'employee@example.invalid', displayName: 'Synthetic Employee', active: true,
  roles: ['Employee'], managerPersonKey: 'PERSON-002', managerEmail: 'manager@example.invalid'
};
const manager: C2bTrustedPerson = {
  personKey: 'PERSON-002', email: 'manager@example.invalid', displayName: 'Synthetic Manager', active: true,
  roles: ['Employee', 'Manager'], managerPersonKey: null, managerEmail: null
};
const configuration: C2bTrustedAnnualConfiguration = {
  schemaRevision: 'c2b-annual-v2', performanceYear: 2027,
  behaviourContractVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  initialState: 'Draft', initialAccessState: 'EmployeeEdit', initialTransitionStatus: 'Ready',
  processorPrincipalKey: 'PROCESSOR-001', adminPrincipalKeys: ['ADMIN-001']
};
const header = (): C2bTrustedWorkplanHeader => {
  const fields = {
    WorkplanKey: 'PERSON-001|2027', PersonKey: employee.personKey,
    EmployeeDisplayName: employee.displayName, EmployeeEmail: employee.email,
    ManagerPersonKey: manager.personKey, ManagerDisplayName: manager.displayName,
    ManagerEmail: manager.email, PerformanceYear: 2027, State: 'Draft', AccessState: 'EmployeeEdit',
    TransitionStatus: 'Ready', WorkplanVersion: 1, RowVersionToken: 5
  };
  return { workplanKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
    etag: '"header-5"', rowVersionToken: 5, state: 'Draft', accessState: 'EmployeeEdit',
    transitionStatus: 'Ready', fields };
};
const currentAcl = (): C2bAclImage => ({
  containerKey: employee.personKey, breaksInheritanceAtContainer: true, canonicalChildrenInherit: true,
  allowedPrincipals: [{ principalKey: 'LEGACY-READERS', permission: 'Read', source: 'Admin' }],
  revokedPrincipalKeys: []
});
const acls = (): { current: C2bListAclImage[] } => ({ current: [
  { listPurpose: 'Workplans', acl: currentAcl() }, { listPurpose: 'WorkplanItems', acl: currentAcl() }
] });
const framework = (): IBehaviourFrameworkV2PublishedSet => ({
  frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, published: true, immutable: true,
  ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS.map(option => ({ ...option })),
  values: BEHAVIOUR_V2_VALUE_IDS.map((valueId, index) => ({
    frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, valueId,
    title: `Synthetic Value ${index + 1}`, corporateValue: `Synthetic corporate value ${index + 1}`,
    descriptors: Object.fromEntries(BEHAVIOUR_V2_ROLE_TIERS.map(tier => [tier,
      `SYNTHETIC TEST ONLY ${valueId} ${tier}`])) as Record<BehaviourV2RoleTier, string>
  }))
});
const assignment = (): IBehaviourPersonAssignmentV2 => ({
  personKey: employee.personKey, frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  roleTier: 'IC_OFFICER', cadence: 'Quarterly', periodKeys: ['Q1', 'Q2', 'Q3', 'Q4']
});
const catalogueRecord = (overrides: Partial<IBehaviourLibraryV2Record> = {}): IBehaviourLibraryV2Record => ({
  behaviourObjectiveKey: 'BHV-01-L1-01', behaviourKey: 'BHV-01',
  frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION, roleTier: 'IC_OFFICER', sourceRoleLevelCode: 'L1',
  published: true, productionSafe: true, synthetic: false,
  objectiveTitle: 'Synthetic trusted suggestion', objectiveDescription: 'Synthetic trusted description',
  suggestedMeasure: 'Synthetic measure', suggestedUnit: 'Synthetic unit', suggestedEvidence: 'Synthetic evidence',
  active: true, sortOrder: 1, effectiveFrom: '2026-01-01', ...overrides
});
const trusted = (records: readonly IBehaviourLibraryV2Record[] = [catalogueRecord()]): C2bTrustedBehaviourV2Observations => ({
  framework: framework(), assignment: assignment(), catalogue: {
    complete: true, frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    applicableDate: '2026-09-12', records
  }
});
const payload = (): IEmployeeBehaviourCommitmentInputV2 => ({
  behaviourId: 'BHV-01', selectedSuggestionKeys: ['BHV-01-L1-01'],
  commitment: 'Synthetic annual commitment', periodCommitments: [
    { period: 'Q1', commitment: 'Synthetic Q1 commitment' },
    { period: 'Q2', commitment: 'Synthetic Q2 commitment' },
    { period: 'Q3', commitment: 'Synthetic Q3 commitment' },
    { period: 'Q4', commitment: 'Synthetic Q4 commitment' }
  ], displayOrder: 1, activeInWorkplan: true
});
const command = (payloadValue: unknown = payload()): unknown => ({
  commandKey: 'c9cd877f-a626-4219-a264-1fdac6886e61', commandType: 'UpsertBehaviourCommitmentV2',
  personKey: employee.personKey, performanceYear: 2027, payload: payloadValue
});

const plan = (payloadValue: unknown = payload(), trustedValue = trusted(),
  current?: C2bTrustedAnnualItem): C2bCommandPlan =>
  planUpsertBehaviourCommitmentC2b(command(payloadValue), employee.email, employee, manager, configuration,
    header(), current, current ? [current] : [], processedAt, acls(), trustedValue,
    current ? { workplanItemKey: current.workplanItemKey }
      : { workplanItemKey: 'BEHAVIOUR-V2-ITEM-001' });

const focusConfig: C2bTrustedAnnualConfiguration = { ...configuration, schemaRevision: 'c2b-annual-v3',
  behaviourCataloguePin: { catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS',
    catalogueVersion: 'SYNTHETIC-V3', revision: 1, contentSha256: 'A'.repeat(64),
    contentCanonicalUtf8ByteLength: 123, sourceSha256: 'B'.repeat(64),
    sourceRowsCanonicalSha256: 'A'.repeat(64), generatedRowsJsonSha256: 'C'.repeat(64),
    approvalReference: 'SYNTHETIC-APPROVAL', sourcePath: 'synthetic.fixture', rowCount: 1 } };
const focusTrusted = (overrides: Record<string, unknown> = {}): C2bTrustedBehaviourV2Observations => ({
  framework: framework(), assignment: assignment(), focusCatalogue: {
    complete: true, applicableDate: '2026-09-12', catalogueKey: 'KCF-KCCC-BEHAVIOUR-FOCUS',
    catalogueVersion: 'SYNTHETIC-V3', revision: 1, contentSha256: 'A'.repeat(64),
    publicationKey: 'SYNTHETIC-V3|1|1', publicationSha256: 'D'.repeat(64),
    publicationImageSha256: 'E'.repeat(64), rowsImageSha256: 'F'.repeat(64),
    sourceSha256: 'B'.repeat(64), sourceRowsCanonicalSha256: 'A'.repeat(64),
    approvalReference: 'SYNTHETIC-APPROVAL', rowCount: 1,
    rows: [{ targetKey: 'BHV-01-L1-01', behaviourKey: 'BHV-01', roleLevelCode: 'L1',
      focusKey: 'BHV-01-FOCUS-01', focusArea: 'Trusted focus',
      suggestedTarget: 'Exact approved example', effectiveStatus: 'Published',
      effectiveFrom: '2026-01-01', contentSha256: 'A'.repeat(64) }],
    ...overrides
  }
});
const focusPayload = (): IEmployeeBehaviourCommitmentInputV2 => ({ ...payload(),
  selections: [
    { source: 'Catalogue', selectionKey: 'BHV-01-L1-01', commitment: 'I will show up',
      howWillWeKnow: 'Colleagues can see it' },
    { source: 'Own', selectionKey: 'BHV-01-OWN-ABC123', commitment: 'My own action',
      howWillWeKnow: 'A visible result' }
  ]
});
const focusPlan = (requested: IEmployeeBehaviourCommitmentInputV2 = focusPayload(),
  observed: C2bTrustedBehaviourV2Observations = focusTrusted(), current?: C2bTrustedAnnualItem): C2bCommandPlan =>
  planUpsertBehaviourCommitmentC2b(command(requested), employee.email, employee, manager,
    focusConfig, header(), current, current ? [current] : [], processedAt, acls(), observed,
    current ? { workplanItemKey: current.workplanItemKey } : { workplanItemKey: 'BEHAVIOUR-V2-ITEM-001' });

describe('governed focus v3 admission and immutable snapshots', () => {
  it('snapshots exact trusted wording/version and separate employee text without numeric fields', () => {
    const effect = focusPlan().effects.find(item => item.kind === 'CanonicalUpsert')!;
    const fields = effect.desiredFields;
    const decoded = decodeBehaviourSelectionSnapshotsV2(
      String(fields.BehaviourV2SelectionSnapshotsJSON), String(fields.BehaviourV2SelectionSnapshotsSHA256),
      Number(fields.BehaviourV2SelectionSnapshotsUtf8ByteLength));
    expect(decoded.selections).toEqual([
      expect.objectContaining({ source: 'Catalogue', selectedExampleText: 'Exact approved example',
        catalogueVersion: 'SYNTHETIC-V3', focusKey: 'BHV-01-FOCUS-01',
        commitment: 'I will show up', howWillWeKnow: 'Colleagues can see it' }),
      expect.objectContaining({ source: 'Own', commitment: 'My own action', howWillWeKnow: 'A visible result' })
    ]);
    expect(JSON.parse(String(fields.BehaviourV2SelectedSuggestionKeysJSON))).toEqual(['BHV-01-L1-01']);
    expect(fields).not.toHaveProperty('BehaviourItemWeight');
    expect(fields).not.toHaveProperty('Q1BehaviourTargetRating');
  });
  it.each([
    ['crossed role', { rows: [{ ...focusTrusted().focusCatalogue!.rows[0], roleLevelCode: 'L2' }] }],
    ['future effective', { rows: [{ ...focusTrusted().focusCatalogue!.rows[0], effectiveFrom: '2026-11-01' }] }],
    ['retired new row', { rows: [{ ...focusTrusted().focusCatalogue!.rows[0], effectiveStatus: 'Retired' }] }],
    ['crossed publication version', { catalogueVersion: 'OTHER' }],
    ['incomplete row set', { rowCount: 2 }]
  ])('rejects %s before a plan exists', (_label, change) => {
    expect(() => focusPlan(focusPayload(), focusTrusted(change))).toThrow();
  });
  it.each([
    ['missing JSON', 'BehaviourV2SelectionSnapshotsJSON', undefined],
    ['missing digest', 'BehaviourV2SelectionSnapshotsSHA256', undefined],
    ['missing byte length', 'BehaviourV2SelectionSnapshotsUtf8ByteLength', undefined],
    ['malformed JSON', 'BehaviourV2SelectionSnapshotsJSON', '{'],
    ['different digest', 'BehaviourV2SelectionSnapshotsSHA256', '0'.repeat(64)],
    ['different byte length', 'BehaviourV2SelectionSnapshotsUtf8ByteLength', 1],
    ['fractional byte length', 'BehaviourV2SelectionSnapshotsUtf8ByteLength', 1.5]
  ])('requires valid complete stored companions for active v03: %s', (_label, name, value) => {
    const first = focusPlan().effects.find(item => item.kind === 'CanonicalUpsert')!.desiredFields;
    const fields = { ...first, WorkplanItemKey: 'BEHAVIOUR-V2-ITEM-001', RowVersionToken: 1,
      [String(name)]: value };
    const current: C2bTrustedAnnualItem = { workplanItemKey: 'BEHAVIOUR-V2-ITEM-001',
      workplanItemNaturalKey: String(first.WorkplanItemNaturalKey), workplanKey: 'PERSON-001|2027',
      personKey: employee.personKey, performanceYear: 2027, itemType: 'Behaviour', activeInWorkplan: true,
      etag: '"behaviour-1"', rowVersionToken: 1, fields };
    expect(() => focusPlan(focusPayload(), focusTrusted(), current)).toThrow();
    expect(current.fields).toEqual(fields);
  });

  it('keeps stored wording after a catalogue edit and blocks pre-extension v02 writes', () => {
    const first = focusPlan().effects.find(item => item.kind === 'CanonicalUpsert')!.desiredFields;
    const current: C2bTrustedAnnualItem = {
      workplanItemKey: 'BEHAVIOUR-V2-ITEM-001',
      workplanItemNaturalKey: String(first.WorkplanItemNaturalKey), workplanKey: 'PERSON-001|2027',
      personKey: employee.personKey, performanceYear: 2027, itemType: 'Behaviour',
      activeInWorkplan: true, etag: '"behaviour-1"', rowVersionToken: 1,
      fields: { ...first, WorkplanItemKey: 'BEHAVIOUR-V2-ITEM-001', RowVersionToken: 1 }
    };
    const changed = focusTrusted({ rows: [{ ...focusTrusted().focusCatalogue!.rows[0],
      suggestedTarget: 'Edited later' }] });
    const next = focusPlan({ ...focusPayload(), selections: focusPayload().selections!.map(row => ({
      ...row, commitment: `${row.commitment} again` })) }, changed, current);
    const stored = next.effects.find(item => item.kind === 'CanonicalUpsert')!.desiredFields;
    expect(String(stored.BehaviourV2SelectionSnapshotsJSON)).toContain('Exact approved example');
    expect(String(stored.BehaviourV2SelectionSnapshotsJSON)).not.toContain('Edited later');
    const legacy = { ...current, fields: { ...current.fields } as Record<string, unknown> };
    delete legacy.fields.BehaviourV2SelectionSnapshotsJSON;
    delete legacy.fields.BehaviourV2SelectionSnapshotsSHA256;
    delete legacy.fields.BehaviourV2SelectionSnapshotsUtf8ByteLength;
    expect(() => focusPlan(focusPayload(), focusTrusted(), legacy)).toThrow(/pre-extension historical item is read-only/);
  });
});

const currentWithStoredKeys = (storedJson: unknown): C2bTrustedAnnualItem => {
  const fields: Record<string, unknown> = {
    ...plan().effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields,
    BehaviourV2SelectedSuggestionKeysJSON: storedJson };
  if (storedJson === undefined) delete fields.BehaviourV2SelectedSuggestionKeysJSON;
  return {
    workplanItemKey: String(fields.WorkplanItemKey),
    workplanItemNaturalKey: String(fields.WorkplanItemNaturalKey), workplanKey: 'PERSON-001|2027',
    personKey: employee.personKey, performanceYear: 2027, itemType: 'Behaviour', activeInWorkplan: true,
    etag: '"behaviour-1"', rowVersionToken: 1, fields
  };
};

describe('KCCC Behaviour v02 C2b trusted planner', () => {
  it('writes versioned headline planning levels and preserves an explicit Target on later edits', () => {
    const requested = { ...payload(), planningLevels: { contractVersion: 'BHV-LEVELS|v01' as const,
      currentLevel: 'Developing' as const, targetLevel: 'Exceptional' as const,
      targetJustification: 'Agreed full-year stretch target' } };
    const created = plan(requested);
    const fields = created.effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields;
    expect(fields).toMatchObject({ BehaviourPlanningContractVersion: 'BHV-LEVELS|v01',
      BehaviourCurrentLevelV2: 'Developing', BehaviourTargetLevelV2: 'Exceptional',
      BehaviourTargetLevelReasonV2: 'Agreed full-year stretch target' });
    const current: C2bTrustedAnnualItem = {
      workplanItemKey: String(fields.WorkplanItemKey), workplanItemNaturalKey: String(fields.WorkplanItemNaturalKey),
      workplanKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
      itemType: 'Behaviour', activeInWorkplan: true, etag: '"behaviour-1"', rowVersionToken: 1, fields
    };
    const updated = plan({ ...payload(), commitment: 'Updated annual wording' }, trusted(), current);
    expect(updated.effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields.BehaviourTargetLevelV2)
      .toBe('Exceptional');
  });

  it('rejects forged numeric, below-Current and unjustified Target levels before annual effects', () => {
    for (const planningLevels of [
      { contractVersion: 'BHV-LEVELS|v01', currentLevel: 2, targetLevel: 'Exceptional' },
      { contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Effective', targetLevel: 'Developing' },
      { contractVersion: 'BHV-LEVELS|v01', currentLevel: 'Exceptional', targetLevel: 'Exceptional' }
    ]) expect(() => plan({ ...payload(), planningLevels })).toThrow();
  });
  it('derives protected version/tier/descriptor/labels from trusted observations and plans receipt last', () => {
    const result = plan();
    const write = result.effects.find(effect => effect.kind === 'CanonicalUpsert')!;
    expect(write.desiredFields).toMatchObject({
      BehaviourFrameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      BehaviourID: 'BHV-01', BehaviourRoleTierSnapshot: 'IC_OFFICER',
      BehaviourDescriptorSnapshot: 'SYNTHETIC TEST ONLY BHV-01 IC_OFFICER',
      BehaviourCadenceSnapshot: 'Quarterly', BehaviourCommitmentV2: 'Synthetic annual commitment',
      ActiveInWorkplan: true
    });
    expect(JSON.parse(String(write.desiredFields.BehaviourRatingLabelsSnapshotJSON)))
      .toEqual(BEHAVIOUR_V2_RATING_OPTIONS);
    expect(Object.keys(write.desiredFields)).not.toEqual(expect.arrayContaining([
      'BehaviourItemWeight', 'Q1BehaviourTargetRating', 'Average', 'CalculatedRAG', 'PeerScore'
    ]));
    expect(result.effects.slice(-2).map(effect => effect.kind)).toEqual(['ReceiptCreate', 'ReceiptGrant']);
  });

  it('admits only a trusted current L1 suggestion and persists the validated set deterministically sorted', () => {
    const second = catalogueRecord({ behaviourObjectiveKey: 'BHV-01-L1-02', sortOrder: 2 });
    const result = plan({ ...payload(), selectedSuggestionKeys: ['BHV-01-L1-02', 'BHV-01-L1-01'] },
      trusted([catalogueRecord(), second]));
    const write = result.effects.find(effect => effect.kind === 'CanonicalUpsert')!;
    expect(write.desiredFields.BehaviourV2SelectedSuggestionKeysJSON)
      .toBe('["BHV-01-L1-01","BHV-01-L1-02"]');
  });

  it.each([
    ['new L2', 'BHV-01-L2-01', catalogueRecord({ behaviourObjectiveKey: 'BHV-01-L2-01',
      roleTier: 'PEOPLE_MANAGER', sourceRoleLevelCode: 'L2' })],
    ['new L3', 'BHV-01-L3-05', catalogueRecord({ behaviourObjectiveKey: 'BHV-01-L3-05',
      roleTier: 'SENIOR_LEADER', sourceRoleLevelCode: 'L3', sortOrder: 5 })],
    ['legacy v01', 'BHV-01-OBJ-01', catalogueRecord()],
    ['cross-Value', 'BHV-02-L1-01', catalogueRecord({ behaviourObjectiveKey: 'BHV-02-L1-01', behaviourKey: 'BHV-02' })]
  ])('rejects %s suggestion keys before producing a plan', (_label, key, record) => {
    expect(() => plan({ ...payload(), selectedSuggestionKeys: [key] }, trusted([record])))
      .toThrow(/approved|legacy|crossed Value|unavailable|untrusted/);
  });

  it.each([
    ['incomplete', { ...trusted().catalogue, complete: false }],
    ['wrong version', { ...trusted().catalogue, frameworkVersion: 'KCCC-BEHAVIOUR|v03' }],
    ['invalid date', { ...trusted().catalogue, applicableDate: '2026-02-30' }],
    ['stale date', { ...trusted().catalogue, applicableDate: '2026-09-11' }],
    ['non-array records', { ...trusted().catalogue, records: {} }],
    ['unknown envelope field', { ...trusted().catalogue, unknown: true }]
  ])('rejects a %s trusted catalogue envelope', (_label, catalogue) => {
    expect(() => plan(payload(), { ...trusted(), catalogue } as unknown as C2bTrustedBehaviourV2Observations))
      .toThrow(/catalogue version or applicable date|missing or malformed/);
  });

  it('rejects an omitted trusted catalogue observation', () => {
    const withoutCatalogue = trusted() as Partial<C2bTrustedBehaviourV2Observations>;
    delete withoutCatalogue.catalogue;
    expect(() => plan(payload(), withoutCatalogue as unknown as C2bTrustedBehaviourV2Observations))
      .toThrow(/catalogue observation is missing/);
  });

  it.each([
    ['cross-version', { frameworkVersion: 'KCCC-BEHAVIOUR|v03' }],
    ['invalid mapped tier', { roleTier: 'SENIOR_LEADER' }],
    ['invalid mapped key', { behaviourObjectiveKey: 'BHV-01-L2-01' }],
    ['invalid date', { effectiveFrom: '2026-02-30' }],
    ['missing required field', { objectiveTitle: undefined }],
    ['unknown field', { unknownField: 'forged' }]
  ])('rejects a %s trusted catalogue record', (_label, changes) => {
    const record = { ...catalogueRecord(), ...changes } as unknown as IBehaviourLibraryV2Record;
    expect(() => plan(payload(), trusted([record]))).toThrow(/record is malformed or crossed/);
  });

  it('rejects both byte-equivalent and conflicting duplicate stable-key observations', () => {
    const first = catalogueRecord();
    expect(() => plan(payload(), trusted([first, { ...first }])))
      .toThrow(/duplicated or conflicting/);
    expect(() => plan(payload(), trusted([first, { ...first, objectiveTitle: 'Conflicting trusted wording' }])))
      .toThrow(/duplicated or conflicting/);
  });

  it.each([
    ['unpublished', { published: false }],
    ['non-production-safe', { productionSafe: false }],
    ['synthetic', { synthetic: true }],
    ['inactive', { active: false }],
    ['not-yet-effective', { effectiveFrom: '2026-09-13' }],
    ['expired', { effectiveTo: '2026-09-11' }]
  ])('rejects a newly requested %s catalogue key', (_label, changes) => {
    expect(() => plan(payload(), trusted([catalogueRecord(changes as Partial<IBehaviourLibraryV2Record>)])))
      .toThrow(/unavailable or untrusted/);
  });

  it('rejects a newly requested key that is absent from the complete catalogue observation', () => {
    expect(() => plan({ ...payload(), selectedSuggestionKeys: ['BHV-01-L1-02'] }, trusted()))
      .toThrow(/unavailable or untrusted/);
  });

  it.each([
    ['missing', undefined],
    ['malformed JSON', '{'],
    ['non-array JSON', '{}'],
    ['non-string entry', '["BHV-01-L1-01",7]'],
    ['duplicate entry', '["BHV-01-L1-01","BHV-01-L1-01"]'],
    ['cross-Value entry', '["BHV-02-L1-01"]'],
    ['legacy entry', '["BHV-01-OBJ-01"]']
  ])('rejects %s canonical stored-key JSON without repairing it', (_label, storedJson) => {
    expect(() => plan(payload(), trusted(), currentWithStoredKeys(storedJson)))
      .toThrow(/canonical stored suggestion/);
  });

  it.each([
    ['wrong-tier', 'BHV-01-L2-01', catalogueRecord({ behaviourObjectiveKey: 'BHV-01-L2-01',
      roleTier: 'PEOPLE_MANAGER', sourceRoleLevelCode: 'L2' })],
    ['unpublished', 'BHV-01-L1-02', catalogueRecord({ behaviourObjectiveKey: 'BHV-01-L1-02',
      sortOrder: 2, published: false })],
    ['expired', 'BHV-01-L1-03', catalogueRecord({ behaviourObjectiveKey: 'BHV-01-L1-03',
      sortOrder: 3, effectiveTo: '2026-09-11' })],
    ['removed', 'BHV-01-L1-04', undefined]
  ])('retains an identical historic %s key only when already stored', (_label, historicKey, historicRecord) => {
    const records = [catalogueRecord(), ...(historicRecord ? [historicRecord] : [])];
    const current = currentWithStoredKeys(JSON.stringify([historicKey]));
    const result = plan({ ...payload(), selectedSuggestionKeys: [historicKey, 'BHV-01-L1-01'] },
      trusted(records), current);
    const write = result.effects.find(effect => effect.kind === 'CanonicalUpsert')!;
    expect(JSON.parse(String(write.desiredFields.BehaviourV2SelectedSuggestionKeysJSON)))
      .toEqual(['BHV-01-L1-01', historicKey].sort());
  });

  it('rejects a different unavailable key and permits omission to remove the stored unavailable key', () => {
    const current = currentWithStoredKeys('["BHV-01-L2-01"]');
    expect(() => plan({ ...payload(), selectedSuggestionKeys: ['BHV-01-L3-01'] }, trusted(), current))
      .toThrow(/unavailable or untrusted/);
    const removed = plan(payload(), trusted(), current);
    expect(removed.effects.find(effect => effect.kind === 'CanonicalUpsert')!
      .desiredFields.BehaviourV2SelectedSuggestionKeysJSON).toBe('["BHV-01-L1-01"]');
  });

  it.each(['frameworkVersion', 'roleTier', 'descriptorSnapshot', 'targetRating', 'behaviourItemWeight',
    'average', 'peerScore', 'normalisedScore', 'unknownField'])(
    'rejects forged or unknown client field %s before producing any effect plan', field => {
      expect(() => plan({ ...payload(), [field]: field === 'targetRating' ? 4 : 'forged' }))
        .toThrow(/Protected|unknown|PROTECTED_FIELD/);
    }
  );

  it('fails closed for missing tier descriptors, crossed assignment and cadence mismatch', () => {
    const missing = trusted();
    missing.framework.values[0].descriptors = {
      IC_OFFICER: 'Synthetic', PEOPLE_MANAGER: 'Synthetic'
    } as Record<BehaviourV2RoleTier, string>;
    expect(() => plan(payload(), missing)).toThrow(/SET_INVALID/);
    const crossed = trusted(); crossed.assignment.personKey = 'OTHER-PERSON';
    expect(() => plan(payload(), crossed)).toThrow(/crossed/);
    expect(() => plan({ ...payload(), periodCommitments: [
      { period: 'H1', commitment: 'Synthetic H1' }, { period: 'H2', commitment: 'Synthetic H2' }
    ] })).toThrow(/assigned cadence/);
  });

  it('preserves an immutable stored snapshot and rejects changed second-master wording', () => {
    const created = plan();
    const fields = created.effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields;
    const current: C2bTrustedAnnualItem = {
      workplanItemKey: String(fields.WorkplanItemKey),
      workplanItemNaturalKey: String(fields.WorkplanItemNaturalKey), workplanKey: 'PERSON-001|2027',
      personKey: employee.personKey, performanceYear: 2027, itemType: 'Behaviour', activeInWorkplan: true,
      etag: '"behaviour-1"', rowVersionToken: 1, fields
    };
    const updated = plan({ ...payload(), commitment: 'Updated employee commitment' }, trusted(), current);
    const next = updated.effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields;
    expect(next.BehaviourDescriptorSnapshot).toBe(fields.BehaviourDescriptorSnapshot);
    expect(next.BehaviourCommitmentV2).toBe('Updated employee commitment');
    const changed = trusted();
    (changed.framework.values[0].descriptors as Record<BehaviourV2RoleTier, string>).IC_OFFICER = 'Changed wording';
    expect(() => plan(payload(), changed, current)).toThrow(/immutable stored snapshot/);
    const invalid = trusted();
    invalid.framework.values[0].descriptors = {
      IC_OFFICER: 'Synthetic', PEOPLE_MANAGER: 'Synthetic'
    } as Record<BehaviourV2RoleTier, string>;
    expect(() => plan({ ...payload(), activeInWorkplan: false }, invalid, current)).toThrow(/SET_INVALID/);
    expect(() => plan({ ...payload(), activeInWorkplan: false }, trusted(), {
      ...current, fields: { ...current.fields, BehaviourItemWeight: 20 }
    })).toThrow(/scoring content/);
  });

  it('preserves original rating snapshot bytes through canonical-key-order creates and historical updates', () => {
    const original = plan();
    const fields = original.effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields;
    expect(fields.BehaviourRatingLabelsSnapshotJSON).toBe(JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS));
    const canonical = immutableTenantInput(trusted());
    expect(Object.keys(canonical.framework.ratingOptions[0])).toEqual(['displayLabel', 'label', 'value']);
    expect(plan(payload(), canonical)).toEqual(original);
    const current: C2bTrustedAnnualItem = {
      workplanItemKey: String(fields.WorkplanItemKey), workplanItemNaturalKey: String(fields.WorkplanItemNaturalKey),
      workplanKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
      itemType: 'Behaviour', activeInWorkplan: true, etag: '"behaviour-1"', rowVersionToken: 1, fields
    };
    expect(plan(payload(), canonical, current)).toEqual(plan(payload(), trusted(), current));
    expect(current.fields.BehaviourRatingLabelsSnapshotJSON).toBe(JSON.stringify(BEHAVIOUR_V2_RATING_OPTIONS));
  });

  it.each(['value', 'label', 'displayLabel', 'array-order', 'stored-key-order'])(
    'continues to reject rating snapshot %s tampering without rewriting stored bytes', attack => {
      const fields = plan().effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields;
      const storedFields = { ...fields };
      const current: C2bTrustedAnnualItem = {
        workplanItemKey: String(fields.WorkplanItemKey), workplanItemNaturalKey: String(fields.WorkplanItemNaturalKey),
        workplanKey: 'PERSON-001|2027', personKey: employee.personKey, performanceYear: 2027,
        itemType: 'Behaviour', activeInWorkplan: true, etag: '"behaviour-1"', rowVersionToken: 1, fields: storedFields
      };
      const options = BEHAVIOUR_V2_RATING_OPTIONS.map(option => ({ ...option }));
      if (attack === 'array-order') options.reverse();
      else if (attack === 'stored-key-order') {
        storedFields.BehaviourRatingLabelsSnapshotJSON = JSON.stringify(immutableTenantInput(options));
      } else (options[0] as unknown as Record<string, unknown>)[attack] = attack === 'value' ? 99 : 'changed';
      if (attack !== 'stored-key-order') storedFields.BehaviourRatingLabelsSnapshotJSON = JSON.stringify(options);
      const stored = current.fields.BehaviourRatingLabelsSnapshotJSON;
      expect(() => plan(payload(), immutableTenantInput(trusted()), current)).toThrow(/immutable stored snapshot/);
      expect(current.fields.BehaviourRatingLabelsSnapshotJSON).toBe(stored);
    });

  it('fails closed before a submission plan when v02 has no complete trusted readiness', () => {
    const fields = plan().effects.find(effect => effect.kind === 'CanonicalUpsert')!.desiredFields;
    const current: C2bTrustedAnnualItem = {
      workplanItemKey: String(fields.WorkplanItemKey),
      workplanItemNaturalKey: String(fields.WorkplanItemNaturalKey), workplanKey: 'PERSON-001|2027',
      personKey: employee.personKey, performanceYear: 2027, itemType: 'Behaviour', activeInWorkplan: true,
      etag: '"behaviour-1"', rowVersionToken: 1, fields
    };
    expect(() => planSubmitWorkplanC2b(JSON.stringify({ commandKey: '0e3a07af-a542-48cf-a1af-95e114fc6f44',
      commandType: 'SubmitWorkplan', personKey: employee.personKey, performanceYear: 2027, payload: {} }),
    employee.email, employee, manager, configuration, header(), [current], {
      complete: true, blockerCodes: [], pagingComplete: true,
      behaviourContractVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
      sourceHeaderSha256: 'not-used-before-v02-stop', sourceItemsSha256: 'not-used-before-v02-stop'
    }, processedAt, acls())).toThrow(/readiness/);
  });
});
