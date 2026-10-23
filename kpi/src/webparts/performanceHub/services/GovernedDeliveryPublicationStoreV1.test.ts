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

import { GovernedDeliveryPublicationStoreV1 } from './GovernedDeliveryPublicationStoreV1';
import type {
  DeliveryPublicationCommand, IDeliveryPublicationProtectedBinding, IDeliveryPublicationProtectedPorts,
  IDeliveryPublicationProtectedSources, IDeliveryPublicationStoreIntent, IDeliveryPublicationStoreReadback
} from '../models/GovernedDeliveryPublicationStoreV1Models';
import { v4Canonical } from './OptionEWorkplanSubmitExactBodyV4Wire';

const managerCommand = (): DeliveryPublicationCommand => ({key:'synthetic-audit-1', kind:'WorkplanOverride',
  year:2026, workplan:'WP-SYNTHETIC-2026', person:'employee', proposed:{core:80.25,impact:19.75}, reason:request().reason});
const globalCommand = (): DeliveryPublicationCommand => ({key:'global-command-1',kind:'GlobalDefault',year:2026});
const protectedBinding = (manager = true): IDeliveryPublicationProtectedBinding => ({
  admitted:true, admissionReference:'synthetic-admission', sourcePreconditionContract:'synthetic-native-conditional-create',
  immutableCreate:true, appendOnlyIntent:true,
  publication:{...native(900),version:manager?'manager-1':'global-1',etag:manager?'"manager-1"':'"global-1"'},
  producerPrincipal:501,publisherIdentity:'publisher@example.invalid',configListId:'5269ebee-565a-4093-a666-00c98cfc5f68',
  workplanListId:native(44).listId,peopleListId:native(5,true).listId
});
const protectedSources = (manager = true): IDeliveryPublicationProtectedSources => ({
  config:source(),configNative:{
    core:{...native(101),listId:protectedBinding().configListId,etag:'"core-1"'},
    impact:{...native(102),listId:protectedBinding().configListId,etag:'"impact-1"'}},
  globalPayload:payload(),publicationPayload:manager?managerPayload(80.25,19.75):payload(),
  ...(manager?{manager:observations(),approvalEventAt:request().eventAt,existingAuditKeys:[]}: {})
});
class SyntheticPorts implements IDeliveryPublicationProtectedPorts {
  public binding: IDeliveryPublicationProtectedBinding | undefined;
  public sources: IDeliveryPublicationProtectedSources | undefined;
  public intent: Readonly<IDeliveryPublicationStoreIntent> | undefined;
  public published: Readonly<IDeliveryPublicationStoreReadback> | undefined;
  public creates=0; public intentCreates=0; public reads=0;
  public failIntentAfter=false; public failPublishAfter=false; public failPublishBefore=false;
  public constructor(manager=true) {this.binding=protectedBinding(manager);this.sources=protectedSources(manager);}
  public async readBinding(): Promise<IDeliveryPublicationProtectedBinding | undefined> {return this.binding;}
  public async readSources(): Promise<IDeliveryPublicationProtectedSources | undefined> {this.reads++;return this.sources;}
  public async readIntent(): Promise<Readonly<IDeliveryPublicationStoreIntent> | undefined> {return this.intent;}
  public async createIntentIfAbsent(value: Readonly<IDeliveryPublicationStoreIntent>): Promise<void> {
    this.intentCreates++; if(this.intent) throw new Error('create-only conflict'); this.intent=copy(value);
    if(this.failIntentAfter) throw new Error('uncertain intent write');
  }
  public async readPublication(): Promise<Readonly<IDeliveryPublicationStoreReadback> | undefined> {return this.published;}
  public async createPublicationIfSourcesCurrent(value: Readonly<IDeliveryPublicationStoreIntent>): Promise<void> {
    this.creates++;
    if(this.failPublishBefore || !this.sources || v4Canonical(this.sources)!==v4Canonical(value.sources)) throw new Error('native source precondition');
    if(this.published) throw new Error('create-only conflict');
    this.published={commandKey:value.command.key,native:copy(value.binding.publication),authorId:value.binding.producerPrincipal,
      createdAt:value.sources.publicationPayload.authority.publishedAt,rawBody:value.rawBody,
      sourcePreconditionContract:value.binding.sourcePreconditionContract,sourcePreconditions:copy(value.sources)};
    if(this.failPublishAfter) throw new Error('uncertain publication write');
  }
}
describe('protected Delivery store source adapter, synthetic ports only',()=>{
  it('is OFF by default',async()=>{await expect(new GovernedDeliveryPublicationStoreV1().publish(globalCommand())).rejects.toThrow('OFF');});
  it('publishes exact default 70/30 with complete protected readback',async()=>{
    const ports=new SyntheticPorts(false),result=await new GovernedDeliveryPublicationStoreV1(ports).publish(globalCommand());
    expect(result.publication).toEqual(global());expect(result.publication.contract).toBe(DELIVERY_PUBLICATION_V1);
    expect(result.readback.rawBody).toBe(v4Canonical(global()));expect(result.readback.native).toEqual(protectedBinding(false).publication);
    expect(result.evidence).toBe('SOURCE_PORT_READBACK_ONLY');expect(ports.creates).toBe(1);expect(Object.isFrozen(result)).toBe(true);
  });
  it('obtains assigned Manager observations internally, preserving decimal override and embedded full audit',async()=>{
    const ports=new SyntheticPorts(),result=await new GovernedDeliveryPublicationStoreV1(ports).publish(managerCommand());
    const expected=buildManagerDeliveryPublicationProposal(global(),observations(),request(80.25,19.75),managerPayload(80.25,19.75));
    expect(result.publication).toEqual(expected);expect(result.publication.payload.defaultWeights).toEqual({core:70,impact:30});
    expect(selectEffectiveDeliveryPublication(global(),expected,workplan())).toEqual(expected);
    expect(override().payload.activeWeights).toEqual({core:80,impact:20});
    expect(JSON.parse(result.readback.rawBody)).toEqual(expected);
  });
  it('retains a completed exact retry without reading changed current configuration',async()=>{
    const ports=new SyntheticPorts(),store=new GovernedDeliveryPublicationStoreV1(ports),first=await store.publish(managerCommand()),reads=ports.reads;
    ports.sources=undefined; const retry=await store.publish(managerCommand());
    expect(retry).toEqual(first);expect(ports.creates).toBe(1);expect(ports.reads).toBe(reads);
  });
  it('reconciles uncertainty only from exact immutable readback',async()=>{
    const ports=new SyntheticPorts();ports.failIntentAfter=true;ports.failPublishAfter=true;
    const result=await new GovernedDeliveryPublicationStoreV1(ports).publish(managerCommand());
    expect(result.readback.rawBody).toBe(ports.intent?.rawBody);expect(ports.creates).toBe(1);
  });
  it('keeps absent uncertain publication held and resumes the same stored intent',async()=>{
    const ports=new SyntheticPorts(),store=new GovernedDeliveryPublicationStoreV1(ports);ports.failPublishBefore=true;
    await expect(store.publish(managerCommand())).rejects.toThrow('outcome unproved');const intent=copy(ports.intent);
    ports.failPublishBefore=false;await store.publish(managerCommand());expect(ports.intent).toEqual(intent);expect(ports.intentCreates).toBe(1);
  });
  it('holds changed sources on a pending retry without substituting a new current intent',async()=>{
    const ports=new SyntheticPorts(),store=new GovernedDeliveryPublicationStoreV1(ports);ports.failPublishBefore=true;
    await expect(store.publish(managerCommand())).rejects.toThrow();const intent=copy(ports.intent);
    ports.sources!.configNative={...ports.sources!.configNative,core:{...ports.sources!.configNative.core,version:'later'}};
    await expect(store.publish(managerCommand())).rejects.toThrow('changed before');expect(ports.intent).toEqual(intent);expect(ports.creates).toBe(1);
  });
  it('holds changed request under the same replay key',async()=>{
    const ports=new SyntheticPorts(),store=new GovernedDeliveryPublicationStoreV1(ports);await store.publish(managerCommand());
    await expect(store.publish({...managerCommand(),kind:'WorkplanOverride',workplan:'WP-SYNTHETIC-2026',person:'employee',proposed:{core:80,impact:20},reason:'changed'})).rejects.toThrow('Replay identity');
    expect(ports.creates).toBe(1);
  });
  it.each([
    ['missing binding',(p:SyntheticPorts)=>{p.binding=undefined;}],
    ['missing admission',(p:SyntheticPorts)=>{p.binding!.sourcePreconditionContract='';}],
    ['missing source',(p:SyntheticPorts)=>{p.sources=undefined;}],
    ['crossed Config ETag',(p:SyntheticPorts)=>{p.sources!.configNative={...p.sources!.configNative,core:{...p.sources!.configNative.core,etag:'"other"'}};}],
    ['crossed People list',(p:SyntheticPorts)=>{p.binding!.peopleListId=p.binding!.configListId;}],
    ['wrong subject',(p:SyntheticPorts)=>{p.sources!.manager={...observations(),subjectSource:{...observations().subjectSource,value:{...observations().subjectSource.value,personKey:'other'}}};}],
    ['wrong Manager',(p:SyntheticPorts)=>{p.sources!.manager={...observations(),actorSource:{...observations().actorSource,value:{...observations().actorSource.value,personKey:'other'}}};}],
    ['stale Workplan ETag',(p:SyntheticPorts)=>{p.sources!.manager={...observations(),workplanSource:{...observations().workplanSource,native:{...native(44),etag:'"old"'}}};}],
    ['immutable Workplan',(p:SyntheticPorts)=>{p.sources!.manager={...observations(),workplanSource:{...observations().workplanSource,value:{...workplan(),state:'Submitted'}}};}],
    ['missing audit observations',(p:SyntheticPorts)=>{delete p.sources!.existingAuditKeys;}],
    ['replayed approval',(p:SyntheticPorts)=>{p.sources!.existingAuditKeys=['synthetic-audit-1'];}],
    ['wrong publisher',(p:SyntheticPorts)=>{p.binding!.publisherIdentity='other@example.invalid';}],
    ['wrong publication version',(p:SyntheticPorts)=>{p.binding!.publication={...p.binding!.publication,version:'other'};}],
    ['unexpected source property',(p:SyntheticPorts)=>{Object.assign(p.sources!,{approved:true});}]
  ] as Array<[string,(p:SyntheticPorts)=>void]>)('holds %s before creating an intent',async(_label,change)=>{
    const ports=new SyntheticPorts();change(ports);
    await expect(new GovernedDeliveryPublicationStoreV1(ports).publish(managerCommand())).rejects.toThrow();expect(ports.intentCreates).toBe(0);expect(ports.creates).toBe(0);
  });
  it.each([
    ['body',(r:IDeliveryPublicationStoreReadback)=>{r.rawBody+=' ';}],
    ['producer',(r:IDeliveryPublicationStoreReadback)=>{r.authorId++;}],
    ['native version',(r:IDeliveryPublicationStoreReadback)=>{r.native={...r.native,version:'other'};}],
    ['native ETag',(r:IDeliveryPublicationStoreReadback)=>{r.native={...r.native,etag:'"other"'};}],
    ['native Created',(r:IDeliveryPublicationStoreReadback)=>{r.createdAt='2026-10-03T11:00:00.000Z';}],
    ['replay key',(r:IDeliveryPublicationStoreReadback)=>{r.commandKey='other';}],
    ['source preconditions',(r:IDeliveryPublicationStoreReadback)=>{r.sourcePreconditions={...r.sourcePreconditions,approvalEventAt:'2026-10-03T11:00:00.000Z'};}],
    ['native contract',(r:IDeliveryPublicationStoreReadback)=>{r.sourcePreconditionContract='other';}],
    ['audit',(r:IDeliveryPublicationStoreReadback)=>{const body=JSON.parse(r.rawBody);body.provenance.approval.audit.reason='changed';r.rawBody=v4Canonical(body); }]
  ] as Array<[string,(r:IDeliveryPublicationStoreReadback)=>void]>)('holds changed protected readback %s',async(_label,change)=>{
    const ports=new SyntheticPorts(),store=new GovernedDeliveryPublicationStoreV1(ports);await store.publish(managerCommand());
    const bad=copy(ports.published!);change(bad);ports.published=bad;await expect(store.publish(managerCommand())).rejects.toThrow();expect(ports.creates).toBe(1);
  });
  it('holds source change between stable observation reads',async()=>{
    const ports=new SyntheticPorts();ports.readSources=async()=>{ports.reads++;const result=copy(ports.sources!);if(ports.reads===2)result.approvalEventAt='2026-10-03T10:00:01.000Z';return result;};
    await expect(new GovernedDeliveryPublicationStoreV1(ports).publish(managerCommand())).rejects.toThrow('changed during');expect(ports.creates).toBe(0);
  });
  it('holds a native precondition race at publication without claiming successful publication',async()=>{
    const ports=new SyntheticPorts();const create=ports.createPublicationIfSourcesCurrent.bind(ports);
    ports.createPublicationIfSourcesCurrent=async intent=>{ports.sources={...ports.sources!,approvalEventAt:'2026-10-03T10:00:01.000Z'};return create(intent);};
    await expect(new GovernedDeliveryPublicationStoreV1(ports).publish(managerCommand())).rejects.toThrow('outcome unproved');expect(ports.published).toBeUndefined();
  });
  it('rejects caller approval assertions and capabilities',async()=>{
    const ports=new SyntheticPorts();await expect(new GovernedDeliveryPublicationStoreV1(ports).publish(Object.assign(managerCommand(),{approved:true}))).rejects.toThrow();expect(ports.reads).toBe(0);
  });
});
