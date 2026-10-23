import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { TestProfile, TestBinding, TrustedCommandSource, ModelHeader, SafeBusinessRow, AuthorisationState, TestStatus } from '../models/TestPilotContracts';
import { IConfigRecord, ICoreKpiCatalogueItem, IBehaviourSummary } from '../models/ProductionModels';
import { mapProductionConfig, mapQuarterTimingConfig } from './ProductionConfigMapper';
import { EMPLOYEE_V2_APPROVED_BEHAVIOURS } from './EmployeeWorkplanV2ApprovedBehaviours';
import { coreNaturalKey as existingCoreKey } from './CoreWorkplanValidation';
import { parseProfile, parseBinding, bindingReady, saveReady, verifyStatus, safeRejectedStatus, parseBusinessRow, validateCommandEnvelope,
  coreNaturalKey, workplanKey, LEAN_COMMANDS, LEAN_DEFAULTS, commandAllowed } from './TestRuntimeBindings';
const load = <T>(name: string): T => JSON.parse(readFileSync(`data/test-pilot/${name}.json`, 'utf8')) as T;
interface Fixture { source: TrustedCommandSource; header: ModelHeader; rows: SafeBusinessRow[]; request: Record<string, unknown>; negativePatches: {name: string; patch: Record<string, unknown>}[]; }
const f = load<Fixture>('command-fixtures');
const profiles = load<TestProfile[]>('profiles'), state = load<AuthorisationState>('authorisation');
const binding = load<{binding: TestBinding}>('installation').binding;
// Historical source GUIDs for local syntax fixtures only, not a tested installed binding.
const lineage = load<{historical035Lineage: {id: string}[]}>('installation').historical035Lineage.filter(l => l.id !== f.source.listId);
const localBound: TestBinding = { ...binding, profileListId: lineage[0].id, statusListId: lineage[1].id, commandListId: f.source.listId,
  workplansListId: lineage[2].id, workplanItemsListId: lineage[3].id };
const envelope = (value = f.request, first = f.source, second = f.source, p: TestProfile = profiles[9], h: ModelHeader | null = f.header): boolean =>
  validateCommandEnvelope(value, first, second, localBound, localBound, p, state, 1, h, ['LOCAL-KPI-01']);
const snapshot = () => { const h: ModelHeader = { ...f.header, etag: '"3"', rowVersionToken: 2, correlation: 'LOCAL-CORR-01' }; return { before: h, after: { ...h }, pages: [f.rows], complete: true }; };
const accepted = (): TestStatus => ({ ...safeRejectedStatus(f.source, '2026-09-08T09:30:00Z')!, StatusKey: `${f.source.listId}:900001:1.0:SAVED`, Outcome: 'Accepted', EventCode: 'SAVED', SafeMessage: 'Saved.', SubjectKey: f.source.subjectKey,
  WorkplanKey: f.source.workplanKey, WorkplanVersion: 1, RowVersionToken: 2, ResultKeysJSON: JSON.stringify(f.source.resultKeys) });
describe('R01 strict TEST profile / binding / envelope / safe status', () => {
  it('validates all 24 unique synthetic profiles and mapped Save readiness', () => {
    expect(new Set(profiles.map(p => p.ProfileKey)).size).toBe(24);
    profiles.forEach((p, i) => { expect(parseProfile(p)).toEqual(p); expect(saveReady(p, state, p.PersonKey, 1)).toBe(i !== 0); expect(p.Email.endsWith('@example.invalid')).toBe(true); });
  });
  it.each([
    ['unknown', { role: 'SLT' }], ['wrongKey', { ProfileKey: 'other@example.invalid:2027' }], ['mixedEmail', { Email: 'Actor10@example.invalid' }],
    ['wrongYear', { PerformanceYear: 2026 }], ['nonBoolean', { Active: 'true' }], ['zeroRevision', { MappingRevision: 0 }],
    ['unknownSchema', { SchemaVersion: 'v9' }], ['selfManager', { ManagerPersonKey: profiles[9].PersonKey }]
  ] as [string, Record<string, unknown>][])('rejects profile %s', (_name, patch) => expect(() => parseProfile({ ...profiles[9], ...patch })).toThrow());
  it('rejects missing required fields, forged active manager, cross actor and stale authorisation', () => {
    for (const name of ['PersonKey', 'Email', 'Active', 'MappingRevision']) { const p = { ...profiles[9] } as unknown as Record<string, unknown>; delete p[name]; expect(() => parseProfile(p)).toThrow(); }
    expect(saveReady({ ...profiles[9], ManagerEmail: 'actor03@example.invalid' }, state, profiles[9].PersonKey, 1)).toBe(false);
    expect(saveReady(profiles[9], state, profiles[8].PersonKey, 1)).toBe(false);
    expect(saveReady(profiles[9], state, profiles[9].PersonKey, 2)).toBe(false);
    expect(saveReady({ ...profiles[9], Active: false }, state, profiles[9].PersonKey, 1)).toBe(false);
  });
  it('null unprovisioned binding is valid metadata but never ready; wrong IDs/environment/unknown rejected', () => {
    expect(parseBinding(binding)).toEqual(binding); expect(bindingReady(binding, binding)).toBe(false); expect(bindingReady(localBound, localBound)).toBe(true);
    expect(bindingReady({ ...localBound, profileListId: localBound.statusListId }, localBound)).toBe(false);
    for (const p of [{ environment: 'LIVE' }, { roles: ['AppAdmin'] }, { performanceYear: 2026 }, { profileListId: 'LOCAL-LIST' }]) expect(() => parseBinding({ ...binding, ...p })).toThrow();
  });
  it('allows exactly create and upsert/deactivate, with fixed defaults and no additional mutation command', () => {
    expect(LEAN_COMMANDS).toEqual(['CreateWorkplanDraft', 'UpsertCoreContributionV2']);
    expect(LEAN_DEFAULTS).toEqual({ year: 2027, core: 70, personal: 20, behaviours: 10, coreWeighting: 'Equal', overrides: false });
    for (const c of ['SubmitWorkplan', 'ApproveWorkplan', 'QuarterProgress', 'AdminRoleChange', undefined]) expect(commandAllowed(c)).toBe(false);
    expect(envelope()).toBe(true); expect(envelope({ ...f.request, payload: { referenceKey: 'LOCAL-KPI-01', activeInWorkplan: false, target: 40 } })).toBe(true);
    const source: TrustedCommandSource = { ...f.source, commandType: 'CreateWorkplanDraft', subjectType: 'Workplan', subjectKey: f.source.workplanKey, resultKeys: [f.source.workplanKey!] };
    const request = { ...f.request, commandType: 'CreateWorkplanDraft', expectedETag: null, payload: {} };
    expect(envelope(request, source, source, profiles[9], null)).toBe(true); expect(envelope(request, source, source)).toBe(false);
  });
  it.each(f.negativePatches)('rejects $name envelope before effects', ({ patch }) => expect(envelope({ ...f.request, ...patch })).toBe(false));
  it('rejects source races, reference drift, missing manager, unsupported Custom and override payload', () => {
    for (const p of [{ etag: '"2"' }, { version: '2.0' }, { actorKey: 'LOCAL-P09' }, { actorEmail: 'actor09@example.invalid' }, { itemId: 42 }]) expect(envelope(f.request, f.source, { ...f.source, ...p })).toBe(false);
    for (const p of [{ referenceKey: 'OTHER' }, { coreWeighting: 'Custom' }, { categoryWeightOverride: 100 }, { activeInWorkplan: 'false' }]) expect(envelope({ ...f.request, payload: { ...(f.request.payload as object), ...p } })).toBe(false);
    expect(envelope(f.request, f.source, f.source, profiles[0])).toBe(false);
  });
  it('unknown/forged subject rejection has no reflected subject, keys or private fields; unmapped actor has no public status', () => {
    const forged = { ...f.source, subjectKey: 'OTHER-PRIVATE-KEY', workplanKey: 'OTHER-PRIVATE-WORKPLAN', resultKeys: ['OTHER-PRIVATE-RESULT'] };
    const s = safeRejectedStatus(forged, '2026-09-08T09:30:00Z'); expect(verifyStatus(s, forged)).toBe(true);
    expect(JSON.stringify(s)).not.toContain('OTHER-PRIVATE'); expect(s?.PersonKey).toBe(f.source.actorKey); expect(safeRejectedStatus(undefined, '2026-09-08T09:30:00Z')).toBeUndefined();
    expect(verifyStatus({ ...s, SubjectKey: forged.subjectKey }, forged)).toBe(false);
  });
  it('Accepted requires matching complete stable canonical readback', () => {
    expect(verifyStatus(accepted(), f.source)).toBe(false); expect(verifyStatus(accepted(), f.source, snapshot(), f.rows)).toBe(true);
    expect(verifyStatus(accepted(), f.source, { ...snapshot(), complete: false }, f.rows)).toBe(false);
    expect(verifyStatus(accepted(), f.source, snapshot(), [])).toBe(false);
  });
  it.each([
    ['SourceListId', '5a1757c8-8a30-4507-ad0c-248b94524a78'], ['SourceItemId', 900003], ['SourceItemVersion', '2.0'], ['SourceItemETag', '"2"'],
    ['ActorPersonKey', 'LOCAL-P09'], ['ActorEmail', 'actor09@example.invalid'], ['PersonKey', 'LOCAL-P09'], ['CommandKey', 'OTHER'], ['CommandType', 'CreateWorkplanDraft'],
    ['PerformanceYear', 2026], ['SubjectKey', 'OTHER'], ['WorkplanKey', 'OTHER'], ['ResultKeysJSON', '["OTHER"]'], ['RowVersionToken', 3], ['WorkplanVersion', 2],
    ['EventCode', 'DEBUG'], ['SafeMessage', 'raw failure from private flow'], ['EventAt', 'not UTC'], ['ContributionAuditReference', 'private'], ['PayloadDigest', 'private'],
    ['ProcessorEmail', 'private@example.invalid'], ['BeforeAfterJSON', '{}'], ['FlowUrl', 'https://example.invalid/private'], ['EffectiveRole', 'SLT']
  ] as [string, unknown][])('rejects substituted or private status %s', (field, value) => expect(verifyStatus({ ...accepted(), [field]: value }, f.source, snapshot(), f.rows)).toBe(false));
  it('strict full-row safe contract rejects audit linkage and unknown physical/private fields', () => {
    expect(parseBusinessRow(f.rows[0])).toEqual(f.rows[0]);
    for (const field of ['ContributionAuditReference', 'AuditKey', 'ProcessorEmail', 'AttachmentUrl', 'RoleMembership', 'BeforeAfterJSON']) expect(() => parseBusinessRow({ ...f.rows[0], [field]: 'private' })).toThrow();
    expect(coreNaturalKey(workplanKey('LOCAL-P10'), 'LOCAL-KPI-01')).toBe(existingCoreKey('LOCAL-P10|2027', 'LOCAL-KPI-01'));
  });
});
describe('R03 concrete reference and physical-schema fixture dependencies', () => {
  it('uses existing config semantics: 2027 ends October, quarters Nov-Jan through Aug-Oct, weights 70/20/10', () => {
    const r = load<{config: IConfigRecord[]}>('references'), c = mapProductionConfig(r.config);
    expect(c.performanceYearNumber).toBe(2027); expect(c.performanceYearStart).toBe('2026-11-01'); expect(c.performanceYearEnd).toBe('2027-10-31');
    expect(c.quarters).toEqual({q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct'}); expect(c.weights).toEqual({ core: 70, personal: 20, behaviours: 10 });
    expect(mapQuarterTimingConfig(r.config).employeeSubmissionDays).toBe(7); expect(() => mapProductionConfig(r.config.filter(x => x.key !== 'PerformanceYear.Current'))).toThrow();
  });
  it('contains one numeric KPI, coherent approved annual and four quarter targets, five fixed Published behaviours; no optional references', () => {
    const r = load<{ kpis: ICoreKpiCatalogueItem[]; annualTargets: {annual: number; Q1: number; Q2: number; Q3: number; Q4: number; kpiVersionKey: string; targetVersionKey: string; approvalStatus: string}[];
      behaviours: (IBehaviourSummary & {lifecycleStatus: string})[]; behaviourLibrary: unknown[]; kpiStages: unknown[] }>('references');
    expect(r.kpis).toHaveLength(1); expect(r.annualTargets).toHaveLength(1); const t = r.annualTargets[0], kpi = r.kpis[0];
    expect(t.approvalStatus).toBe('Approved'); expect(t.kpiVersionKey).toBe(kpi.kpiVersionKey); expect(t.targetVersionKey).toBe(kpi.targetVersionKey);
    expect(t.annual).toBe(t.Q1 + t.Q2 + t.Q3 + t.Q4); expect(kpi.yearEndTargetValue).toBe(t.annual);
    expect([kpi.q1TargetValue, kpi.q2TargetValue, kpi.q3TargetValue, kpi.q4TargetValue]).toEqual([t.Q1, t.Q2, t.Q3, t.Q4]);
    expect(kpi.metricType).toBe('Number'); expect(kpi.approvedMilestonePolicy).toBeUndefined();
    expect(r.behaviours.map(b => [b.behaviourId, b.title])).toEqual(EMPLOYEE_V2_APPROVED_BEHAVIOURS.map(b => [b.behaviourId, b.title]));
    expect(r.behaviours.every(b => b.lifecycleStatus === 'Published')).toBe(true); expect(r.behaviours.reduce((sum, b) => sum + b.defaultWorkplanWeight, 0)).toBe(100);
    expect(r.behaviourLibrary).toEqual([]); expect(r.kpiStages).toEqual([]);
  });
  it('preserves 035 unique constraints, choice vocabularies and both Behaviour physical fields', () => {
    const s = load<{ lists: {title: string; fields: {internalName: string; displayName: string; unique: boolean; indexed: boolean; type: string; choices: string[]}[]}[] }>('physical-035-mappings');
    const h = s.lists.find(l => l.title.endsWith('_Workplans'))!, i = s.lists.find(l => l.title.endsWith('_WorkplanItems'))!;
    for (const [list, key] of [[h, 'WorkplanKey'], [i, 'WorkplanItemKey'], [i, 'WorkplanItemNaturalKey']] as const) expect(list.fields.find(f => f.internalName === key)).toMatchObject({unique: true, indexed: true});
    expect(h.fields.find(f => f.internalName === 'TransitionStatus')?.choices).toEqual(['Ready', 'InProgress', 'Failed']);
    expect(h.fields.find(f => f.internalName === 'AccessState')?.choices).toEqual(['EmployeeEdit', 'ManagerDecision', 'ReadOnly', 'RecoveryHold']);
    expect(i.fields.find(f => f.displayName === 'BehaviourSelectedSuggestionKeysJson')).toMatchObject({internalName: 'BehaviourSelectedSuggestionKeysJ', type: 'Note'});
    expect(i.fields.find(f => f.internalName === 'BehaviourCustomObjective')?.type).toBe('Note');
    expect(s.lists.some(l => l.fields.some(f => f.internalName === 'PublicationState'))).toBe(false);
  });
  it('fixture manifest verifies every payload hash, count and 30 scenario IDs', () => {
    const m = load<{files: {file: string; bytes: number; sha256: string}[]; counts: Record<string, number>}>('manifest');
    for (const p of m.files) { const bytes = readFileSync(`data/test-pilot/${p.file}`); expect(bytes.length).toBe(p.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(p.sha256); }
    expect(m.counts.profiles).toBe(profiles.length); expect(m.counts.roleScenarioGroups).toBe(30);
    expect(load<{cases: {id: string}[]}>('role-scenarios').cases.map(c => c.id)).toEqual(Array.from({length: 30}, (_, i) => `C1-ROLE-${String(i + 1).padStart(2, '0')}`));
  });
});
