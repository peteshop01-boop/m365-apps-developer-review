import type { IAnnualWorkplan } from '../models/ProductionModels';
import type {
  IDeliveryPublicationManagerObservations, IDeliveryPublicationNativeCoordinates,
  IGlobalDeliveryPublicationProposal, IManagerDeliveryPublicationProposal
} from '../models/GovernedDeliveryPublicationV1Models';
import { DELIVERY_PUBLICATION_V1 } from '../models/GovernedDeliveryPublicationV1Models';
import { ADMIN_OVERALL_DELIVERY_CONFIG_KEYS, type IAdminOverallDeliveryConfigurationContract } from './AdminConfigDomain';
import type { IDeliveryWeightOverrideRequest, IGovernedDeliveryWeightConfigurationContract } from './CategoryWeightingPolicy';
import {
  buildGlobalDeliveryPublicationProposal, buildManagerDeliveryPublicationProposal, selectEffectiveDeliveryPublication
} from './GovernedDeliveryPublicationV1';

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

describe('governed Delivery publication proposals: source policy only', () => {
  it('retains exact closed 70/30 global source and independent publisher observations in a frozen copy', () => {
    const config = source(); const publication = payload();
    const result = buildGlobalDeliveryPublicationProposal(config, publication);
    expect(result).toEqual({ contract: DELIVERY_PUBLICATION_V1, purposeApproval: 'KCF-KPI-PM83-D001',
      scope: { kind: 'GlobalDefault', year: 2026 }, payload: publication, provenance: { configSource: config } });
    expect(Object.isFrozen(result)).toBe(true); expect(Object.isFrozen(result.provenance.configSource.authority.core.identity)).toBe(true);
    expect(result.provenance.configSource).not.toBe(config); expect(result.payload).not.toBe(publication);
    expect(result.payload.authority.version).not.toBe(config.versionToken);
    expect(result).not.toHaveProperty('protectedOrigin'); expect(result).not.toHaveProperty('capability');
    expect(selectEffectiveDeliveryPublication(result, undefined, workplan())).toEqual(result);
  });

  it.each([[80, 20], [80.25, 19.75]])('approves exact Manager %s/%s and retains the full existing audit', (core, impact) => {
    const observed = observations(); const prior = copy(observed);
    const result = buildManagerDeliveryPublicationProposal(global(), observed, request(core, impact), managerPayload(core, impact));
    expect(result.payload.activeWeights).toEqual({ core, impact });
    expect(result.payload.defaultWeights).toEqual({ core: 70, impact: 30 });
    expect(result.provenance.approval).toEqual({ actorPersonKey: 'manager', subjectPersonKey: 'employee', assignedManagerPersonKey: 'manager',
      audit: { auditKey: 'synthetic-audit-1', eventType: 'DeliveryWeightOverrideApproved', actorEmail: 'manager@example.invalid', actorRole: 'Manager',
        eventAt: '2026-10-03T10:00:00.000Z', reason: request().reason, sourceVersion: 7, resultingState: 'Draft',
        before: { core: 70, impact: 30 }, after: { core, impact } } });
    expect(observed).toEqual(prior); expect(Object.isFrozen(result.provenance.approval.audit.after)).toBe(true);
    expect(selectEffectiveDeliveryPublication(global(), result, workplan())).toEqual(result);
  });

  it('keeps an exact Workplan override ahead of a later valid global update', () => {
    const later = buildGlobalDeliveryPublicationProposal(source(60, 40), payload(60, 40, 'global-2', '2026-10-03T11:00:00.000Z'));
    const manager = override();
    expect(selectEffectiveDeliveryPublication(later, manager, workplan())).toEqual(manager);
    expect(selectEffectiveDeliveryPublication(later, undefined, workplan()).payload.activeWeights).toEqual({ core: 60, impact: 40 });
  });

  it('accepts ChangesRequested and reconciles observed Workplan current weights without rounding', () => {
    const observed = observations(); const wp = { ...observed.workplanSource.value, state: 'ChangesRequested' as const,
      overallDeliveryWeightConfiguration: { configurationKey: 'previous-observed', configurationVersion: '2',
        coreWeight: 75.25, impactWeight: 24.75, sourceReference: 'KCF-KPI-Sponsor-PD-01' as const } };
    observed.workplanSource = { ...observed.workplanSource, value: wp };
    const req = { ...request(), state: 'ChangesRequested' as const, current: { core: 75.25, impact: 24.75 } };
    const result = buildManagerDeliveryPublicationProposal(global(), observed, req, managerPayload());
    expect(result.provenance.approval.audit.before).toEqual(req.current);
    expect(selectEffectiveDeliveryPublication(global(), result, wp)).toEqual(result);
  });

  it.each(['Submitted', 'Approved', 'Locked', 'Archived'] as const)('holds immutable/already captured lifecycle state %s', state => {
    const observed = observations(); observed.workplanSource = { ...observed.workplanSource, value: { ...workplan(), state } };
    expect(() => buildManagerDeliveryPublicationProposal(global(), observed, { ...request(), state }, managerPayload())).toThrow();
    expect(() => selectEffectiveDeliveryPublication(global(), undefined, { ...workplan(), state })).toThrow();
  });

  it.each([
    ['wrong subject', (o: IDeliveryPublicationManagerObservations) => { o.subjectSource = { ...o.subjectSource, value: { ...o.subjectSource.value, personKey: 'other' } }; }],
    ['wrong year', (o: IDeliveryPublicationManagerObservations) => { o.workplanSource = { ...o.workplanSource, value: { ...workplan(), performanceYear: 2027 } }; }],
    ['wrong assigned Manager', (o: IDeliveryPublicationManagerObservations) => { o.workplanSource = { ...o.workplanSource, value: { ...workplan(), managerPersonKey: 'other' } }; }],
    ['wrong Manager email', (o: IDeliveryPublicationManagerObservations) => { o.subjectSource = { ...o.subjectSource, value: { ...o.subjectSource.value, managerEmail: 'other@example.invalid' } }; }],
    ['inactive actor', (o: IDeliveryPublicationManagerObservations) => { o.actorSource = { ...o.actorSource, value: { ...o.actorSource.value, active: false } }; }],
    ['Admin-only actor', (o: IDeliveryPublicationManagerObservations) => { o.actorSource = { ...o.actorSource, value: { ...o.actorSource.value, appRoles: ['SystemAdmin'] } }; }],
    ['self approval', (o: IDeliveryPublicationManagerObservations) => { o.actorSource = { ...o.actorSource, value: { ...o.actorSource.value, personKey: 'employee' } }; }],
    ['stale native row', (o: IDeliveryPublicationManagerObservations) => { o.workplanSource = { ...o.workplanSource, native: { ...o.workplanSource.native, etag: '"old"' } }; }],
    ['in-flight transition', (o: IDeliveryPublicationManagerObservations) => { o.workplanSource = { ...o.workplanSource, value: { ...workplan(), transitionStatus: 'Submitting' } }; }],
    ['wildcard source ETag', (o: IDeliveryPublicationManagerObservations) => { o.actorSource = { ...o.actorSource, native: { ...o.actorSource.native, etag: '*' } }; }]
  ] as Array<[string, (o: IDeliveryPublicationManagerObservations) => void]>)('holds %s', (_label, change) => {
    const observed = observations(); change(observed);
    expect(() => buildManagerDeliveryPublicationProposal(global(), observed, request(), managerPayload())).toThrow();
  });

  it.each([
    { reason: '' }, { existingAuditKeys: ['synthetic-audit-1'] }, { sourceVersion: 6 }, { state: 'ChangesRequested' as const },
    { current: { core: 60, impact: 40 } }, { actorEmail: 'other@example.invalid' }, { actorPersonKey: 'other' },
    { subjectPersonKey: 'other' }, { proposed: { core: 80.001, impact: 19.999 } }
  ])('holds unreconciled request %j', change => {
    expect(() => buildManagerDeliveryPublicationProposal(global(), observations(), { ...request(), ...change }, managerPayload())).toThrow();
  });

  it.each([
    ['changed scope', (p: IManagerDeliveryPublicationProposal) => { p.scope = { ...p.scope, workplan: 'other' }; }],
    ['changed year', (p: IManagerDeliveryPublicationProposal) => { p.scope = { ...p.scope, year: 2027 }; }],
    ['audit/value disagreement', (p: IManagerDeliveryPublicationProposal) => { p.payload = { ...p.payload, activeWeights: { core: 90, impact: 10 } }; }],
    ['audit identity disagreement', (p: IManagerDeliveryPublicationProposal) => { p.provenance = { ...p.provenance, approval: { ...p.provenance.approval, actorPersonKey: 'other' } }; }],
    ['wrong purpose', (p: IManagerDeliveryPublicationProposal) => { (p as unknown as Record<string, unknown>).purposeApproval = 'other'; }],
    ['extra root key', (p: IManagerDeliveryPublicationProposal) => { Object.assign(p, { protectedOrigin: true }); }],
    ['extra audit key', (p: IManagerDeliveryPublicationProposal) => { Object.assign(p.provenance.approval.audit, { accepted: true }); }],
    ['wildcard publisher ETag', (p: IManagerDeliveryPublicationProposal) => { Object.assign(p.payload.authority, { etag: '*' }); }]
  ] as Array<[string, (p: IManagerDeliveryPublicationProposal) => void]>)('never falls back for supplied invalid override: %s', (_label, change) => {
    const altered = copy(override()); change(altered);
    expect(() => selectEffectiveDeliveryPublication(global(), altered, workplan())).toThrow();
  });

  it.each([{ etag: '"4"' }, { rowVersionToken: 8 }, { workplanKey: 'other' }, { managerEmail: 'new@example.invalid' }])('holds stale exact Workplan %j', change => {
    expect(() => selectEffectiveDeliveryPublication(global(), override(), { ...workplan(), ...change })).toThrow();
  });

  it('holds missing global even with a valid override, missing nested observations and incomplete envelopes', () => {
    expect(() => selectEffectiveDeliveryPublication(undefined, override(), workplan())).toThrow(/HOLD/);
    const incomplete = copy(override()); delete (incomplete.provenance as unknown as Record<string, unknown>).actorSource;
    expect(() => selectEffectiveDeliveryPublication(global(), incomplete, workplan())).toThrow();
    const incompleteGlobal = copy(global()); delete (incompleteGlobal.payload.authority as unknown as Record<string, unknown>).publishedBy;
    expect(() => selectEffectiveDeliveryPublication(incompleteGlobal, undefined, workplan())).toThrow();
  });

  it.each([
    ['non-default metadata', (s: IAdminOverallDeliveryConfigurationContract, p: IGovernedDeliveryWeightConfigurationContract) => { p.defaultWeights = { core: 60, impact: 40 }; }],
    ['mismatched active weights', (_s: IAdminOverallDeliveryConfigurationContract, p: IGovernedDeliveryWeightConfigurationContract) => { p.activeWeights = { core: 60, impact: 40 }; }],
    ['stale config version', (s: IAdminOverallDeliveryConfigurationContract) => { s.versionToken = 'old'; }],
    ['extra config key', (s: IAdminOverallDeliveryConfigurationContract) => { Object.assign(s, { authorityClaim: true }); }],
    ['wildcard config ETag', (s: IAdminOverallDeliveryConfigurationContract) => { Object.assign(s.authority.core.identity, { etag: '*' }); }],
    ['missing provenance', (s: IAdminOverallDeliveryConfigurationContract) => { Object.assign(s.authority.impact.provenance, { changeReference: '' }); }],
    ['wrong environment', (s: IAdminOverallDeliveryConfigurationContract) => { Object.assign(s.authority.impact.identity, { environment: 'other' }); }]
  ] as Array<[string, (s: IAdminOverallDeliveryConfigurationContract, p: IGovernedDeliveryWeightConfigurationContract) => void]>)('holds global %s', (_label, change) => {
    const s = source(); const p = payload(); change(s, p);
    expect(() => buildGlobalDeliveryPublicationProposal(s, p)).toThrow();
  });
});
