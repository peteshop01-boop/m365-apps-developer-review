import { canonicaliseOptionEDraft, type IOptionEWorkplanDraftAggregate } from '../models/OptionEWorkplanDraftModels';
import type { IOptionEAuthoritativeReferenceReadback } from '../models/OptionEWorkplanSubmitModels';
import { EXACT_BODY_V4, V4_CHECKPOINTS, type V4Authority, type V4Admission, type V4Control,
  type V4Checkpoint, type V4Snapshot, type V4Receipt, type V4AclReadback, type V4ReferenceRow, type V4ReferenceSet } from '../models/OptionEWorkplanSubmitExactBodyV4Models';
import { v4Canonical, parseV4Request } from './OptionEWorkplanSubmitExactBodyV4Wire';
import { OptionEWorkplanSubmitExactBodyV4, v4AclPlan, type V4JournalStore as V4Store, type V4JournalOperation as V4Operation } from './OptionEWorkplanSubmitExactBodyV4';
const aggregate = (): IOptionEWorkplanDraftAggregate => ({
  schemaVersion: 'kcf.workplan-draft/v1',
  core: {
    weightingMode: 'Equal',
    entries: [{
      coreId: 'CORE-1', kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v1', targetVersionKey: 'KPI-1|2027|v1',
      role: 'Owner', contributionMethod: 'AdditiveDirect', weightPercent: 100,
      annual: { value: 10, success: 'Annual' }, q1: { value: 1 }, q2: { value: 2 },
      q3: { value: 3 }, q4: { value: 4 }
    }]
  },
  impact: [{
    impactId: 'IMPACT-1', wording: 'Improve service', measure: 'Cases', unit: 'count',
    annual: 10, q1: 1, q2: 2, q3: 3, q4: 4, success: 'Delivered'
  }],
  behaviours: {
    frameworkVersion: 'KCCC-BEHAVIOUR|v02', roleTier: 'IC_OFFICER',
    entries: Array.from({ length: 5 }, (_, index) => {
      const valueId = `BHV-0${index + 1}` as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
      return {
        valueId,
        descriptorKey: `KCCC-BEHAVIOUR|v02|IC_OFFICER|${valueId}`,
        guidancePromptKeys: Array.from({ length: 5 }, (__, promptIndex) => `${valueId}|L1|${promptIndex + 1}`),
        selectedPromptKeys: [`${valueId}|L1|1`], commitment: `Commitment ${index + 1}`,
        periodCommitments: { Q1: '', Q2: '', Q3: '', Q4: '' }
      };
    }),
    governedExtension: {
      schemaVersion: 'kcf.option-e.behaviours/v02',
      authority: { catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS',
        catalogueVersion: 'KCF-BHV-PD03-2026.09-v2', catalogueRevision: 7,
        catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
        approvalReference: 'KCF-KPI-Sponsor-BEH-V02-001' },
      roleLevelCode: 'L1',
      headlines: Array.from({ length: 5 }, (_, index) => {
        const behaviourKey = `BHV-0${index + 1}` as 'BHV-01' | 'BHV-02' | 'BHV-03' | 'BHV-04' | 'BHV-05';
        return { behaviourKey, headlineTitle: `Headline ${index + 1}`, selections: [{
          selectionKey: index === 0 ? `${behaviourKey}-L1-01` : `${behaviourKey}-OWN-ABCDEF`,
          source: index === 0 ? 'Catalogue' as const : 'Own' as const, behaviourKey,
          headlineTitle: `Headline ${index + 1}`, focusKey: `${behaviourKey}-FOCUS-01`, focusTitle: `Focus ${index + 1}`,
          roleLevelCode: 'L1' as const,
          ...(index === 0 ? { targetKey: `${behaviourKey}-L1-01` } : {}),
          selectedWording: index === 0 ? 'Approved target 1' : `Commitment ${index + 1}`,
          catalogueId: 'KCF-KCCC-BEHAVIOUR-FOCUS', catalogueVersion: 'KCF-BHV-PD03-2026.09-v2',
          catalogueRevision: 7, catalogueEtag: '"catalogue-7"', catalogueContentSha256: 'A'.repeat(64),
          myCommitment: `Commitment ${index + 1}`, howWillWeKnow: `Evidence ${index + 1}`
        }] };
      }),
      immutableSelectionSnapshots: true, legacyTargetRatingWeightFieldsWritten: false,
      deliveryArithmeticAffected: false
    }
  }
});
const referenceReadback = (
  personKey: string,
  performanceYear: number
): IOptionEAuthoritativeReferenceReadback => {
  const payload = aggregate();
  const extension = payload.behaviours.governedExtension!;
  const snapshots = extension.headlines.flatMap(headline => headline.selections);
  return ({
  coreKpis: payload.core.entries.map(entry => ({
    kpiId: entry.kpiId, kpiVersionKey: entry.kpiVersionKey, active: true
  })),
  coreTargets: payload.core.entries.map(entry => ({
    targetVersionKey: entry.targetVersionKey, kpiId: entry.kpiId, performanceYear, status: 'Approved'
  })),
  frameworkSets: [{ frameworkVersion: payload.behaviours.frameworkVersion, published: true, immutable: true }],
  behaviourValues: payload.behaviours.entries.map((entry, index) => ({
    frameworkValueKey: `${payload.behaviours.frameworkVersion}|${entry.valueId}`,
    frameworkVersion: payload.behaviours.frameworkVersion, valueId: entry.valueId,
    governedOrder: index + 1, roleTier: payload.behaviours.roleTier, descriptorKey: entry.descriptorKey
  })),
  personAssignments: [{
    personKey, frameworkVersion: payload.behaviours.frameworkVersion,
    roleTier: payload.behaviours.roleTier, roleLevelCode: extension.roleLevelCode, active: true
  }],
  prompts: payload.behaviours.entries.flatMap(entry => entry.guidancePromptKeys.map(promptKey => ({
    promptKey, behaviourKey: entry.valueId, roleTier: payload.behaviours.roleTier, active: true
  }))),
  governedBehaviourAuthority: { ...extension.authority, published: true, immutable: true,
    asOfDate: '2026-09-18', effectiveFrom: '2026-09-01' },
  governedBehaviourHeadlines: extension.headlines.map((headline, index) => ({
    behaviourKey: headline.behaviourKey, headlineTitle: headline.headlineTitle, governedOrder: index + 1
  })),
  governedBehaviourFocuses: snapshots.map(snapshot => ({
    behaviourKey: snapshot.behaviourKey, focusKey: snapshot.focusKey, focusTitle: snapshot.focusTitle,
    roleLevelCode: snapshot.roleLevelCode, status: 'Published' as const, effectiveFrom: '2026-09-01'
  })),
  governedBehaviourTargets: snapshots.filter(snapshot => snapshot.source === 'Catalogue').map(snapshot => ({
    behaviourKey: snapshot.behaviourKey, focusKey: snapshot.focusKey, focusTitle: snapshot.focusTitle,
    roleLevelCode: snapshot.roleLevelCode, status: 'Published' as const, effectiveFrom: '2026-09-01',
    targetKey: snapshot.targetKey!, selectedWording: snapshot.selectedWording
  }))
});
};
const clone = <T>(v:T):T => JSON.parse(v4Canonical(v)) as T;
const key = 'EMP-001|2027|fb1f6035-236e-434c-ae05-a78003badd47';
function authority(): V4Authority {
  const payload=aggregate(), refs=referenceReadback('EMP-001',2027);
  const mapping: [V4ReferenceRow['kind'], unknown[]][] = [
    ['Kpi',[...refs.coreKpis]],['Target',refs.coreTargets.map((t,i)=>({...t,role:payload.core.entries[i].role,annual:payload.core.entries[i].annual,q1:payload.core.entries[i].q1,q2:payload.core.entries[i].q2,q3:payload.core.entries[i].q3,q4:payload.core.entries[i].q4}))],
    ['Framework',[...refs.frameworkSets]],['Assignment',[...refs.personAssignments]],['Value',[...refs.behaviourValues]],['Prompt',[...refs.prompts]],
    ['Catalogue',[refs.governedBehaviourAuthority]],['Headline',[...refs.governedBehaviourHeadlines!]],['Focus',[...refs.governedBehaviourFocuses!]],['BehaviourTarget',[...refs.governedBehaviourTargets!]]
  ];
  let id=100;
  const references:V4ReferenceSet={asOf:'2026-09-18T03:00:00.000Z',rows:mapping.flatMap(([kind,bodies])=>bodies.map((body,index)=>({kind,key:`${kind}-${index}`,itemId:++id,etag:'"r1"',version:'1',body:v4Canonical(body)})))};
  const draft={itemId:41,etag:'"d1"',version:'1',schema:'kcf.workplan-draft/v1' as const,body:canonicaliseOptionEDraft(payload)};
  const query={capability:EXACT_BODY_V4,action:'Submit' as const,command:'fb1f6035-236e-434c-ae05-a78003badd47',person:'EMP-001',year:2027,workplan:'EMP-001|2027',source:draft,referenceBody:v4Canonical(references)};
  return {request:{itemId:42,etag:'"r1"',version:'1',createdBy:201,body:v4Canonical(query),query},draft,references,
    actor:{key:'EMP-001',principal:201,active:true,manager:'MGR-001',version:'1'},manager:{key:'MGR-001',principal:202,active:true,version:'1'},
    control:{workplan:'EMP-001|2027',person:'EMP-001',year:2027,draftId:41,manager:'MGR-001',hierarchyEpoch:4,aclEpoch:4,etag:'"c1"',state:'Draft',transition:'Ready'}};
}
class MemoryV4 implements V4Store {
  public binding:V4Store['binding']={kind:'domain-test',capability:EXACT_BODY_V4,protectedOrigin:true,principals:{content:301,acl:302,recovery:303}};
  public a=authority(); public op?:V4Operation; public snapshot?:V4Snapshot; public receipt?:V4Receipt; public acl?:V4AclReadback;
  public writes:string[]=[]; public lost=new Set<string>(); public omit=new Set<string>(); public reads=0; public mutate?: (a:V4Authority,n:number)=>void; public rev=2;
  public now():string{return '2026-09-18T03:00:00.000Z';}
  private finish(name:string):void {this.writes.push(name);if(this.lost.delete(name))throw Error('LostResponse');}
  public async readAuthority():Promise<V4Authority>{const a=clone(this.a);this.mutate?.(a,++this.reads);return a;}
  public async readOperation():Promise<V4Operation|undefined>{return this.op&&clone(this.op);}
  public async createOperation(admission:V4Admission):Promise<V4Operation>{if(this.op)throw Error('UniqueConflict');if(!this.omit.has('Validated'))this.op={admission:clone(admission),controlReadback:clone(admission.authority.control),checkpoint:'Validated',outcome:'Running',etag:`"o${this.rev++}"`};this.finish('Validated');return clone(this.op!);}
  public async advance(_key:string,etag:string,checkpoint:V4Checkpoint,controlReadback:V4Control):Promise<V4Operation>{if(this.op?.etag!==etag)throw Error('412');if(!this.omit.has(checkpoint))this.op={admission:this.op.admission,controlReadback:clone(controlReadback),checkpoint,outcome:checkpoint==='Completed'?'Completed':'Running',etag:`"o${this.rev++}"`};this.finish(checkpoint);return clone(this.op);}
  public async prepareControl(_key:string,etag:string,intent:NonNullable<V4Operation['controlIntent']>):Promise<void>{if(this.op?.etag!==etag)throw Error('412');this.op={...this.op,controlIntent:clone(intent),etag:`"o${this.rev++}"`};this.finish('ControlIntent');}
  public async hold(_key:string,etag:string,reason:string):Promise<void>{if(this.op?.etag!==etag)throw Error('412');this.op={...this.op,outcome:'RecoveryHold',holdReason:reason,etag:'"hold"'};}
  public async readControl():Promise<V4Control>{return clone(this.a.control);}
  public async casControl(_key:string,etag:string,next:Omit<V4Control,'etag'>):Promise<V4Control>{if(this.a.control.etag!==etag)throw Error('412');if(!this.omit.has('Control'))this.a.control={...clone(next),etag:`"c${this.rev++}"`};this.finish('Control');return clone(this.a.control);}
  public async readSnapshot():Promise<V4Snapshot|undefined>{return this.snapshot&&clone(this.snapshot);}
  public async createSnapshot(s:V4Snapshot):Promise<void>{if(this.snapshot)throw Error('ImmutableUnique');if(!this.omit.has('Snapshot'))this.snapshot=clone(s);this.finish('Snapshot');}
  public async readReceipt():Promise<V4Receipt|undefined>{return this.receipt&&clone(this.receipt);}
  public async createReceipt(r:Omit<V4Receipt,'nativeCreated'>):Promise<void>{if(this.receipt)throw Error('ImmutableUnique');if(!this.omit.has('Receipt'))this.receipt={...clone(r),nativeCreated:this.now()};this.finish('Receipt');}
  public async expectedAcl(a:V4Admission):Promise<V4AclReadback>{return v4AclPlan(a,this.binding.principals);}
  public async readAcl():Promise<V4AclReadback|undefined>{return this.acl&&clone(this.acl);}
  public async applyAcl(a:V4Admission):Promise<void>{if(!this.omit.has('Acl'))this.acl=await this.expectedAcl(a);this.finish('Acl');}
}
const run=(s:MemoryV4):Promise<import('../models/OptionEWorkplanSubmitExactBodyV4Models').V4Result>=>new OptionEWorkplanSubmitExactBodyV4(s).submit(key);
describe('v4 complete-body processor',()=>{
  test('complete durable receipt, no digest dependency and exact replay with no new effects',async()=>{
    const s=new MemoryV4();const first=await run(s);expect(first.outcome).toBe('Completed');const count=s.writes.length;
    expect(await run(s)).toEqual(first);expect(s.writes).toHaveLength(count);expect(s.snapshot?.admission.authority.request.body).toBe(s.a.request.body);
  });
  test.each(V4_CHECKPOINTS)('lost response after %s resumes through durable checkpoint',async cp=>{
    const s=new MemoryV4();let fired=false;const p=new OptionEWorkplanSubmitExactBodyV4(s,c=>{if(c===cp&&!fired){fired=true;throw Error('LostCallerResponse');}});
    expect((await p.submit(key)).outcome).toBe('RecoveryHold');const snap=clone(s.snapshot||null),r=clone(s.receipt||null);
    expect((await run(s)).outcome).toBe('Completed');if(snap)expect(s.snapshot).toEqual(snap);if(r)expect(s.receipt).toEqual(r);
  });
  test.each(['Validated','Control','Snapshot','Receipt','Acl',...V4_CHECKPOINTS.slice(1)])('uncertain %s write resolves only exact readback',async effect=>{const s=new MemoryV4();s.lost.add(effect);expect((await run(s)).outcome).toBe('Completed');});
  test.each(['Snapshot','Receipt','Control','Acl'])('partial %s effect stays RecoveryHold',async effect=>{const s=new MemoryV4();s.omit.add(effect);expect((await run(s)).outcome).toBe('RecoveryHold');expect(s.op?.checkpoint).not.toBe('Completed');});
  test.each(['action','person','year','workplan','command','referenceBody','source.etag','source.version','source.itemId','source.schema','source.body'])('changed request %s collides/rejects',async field=>{
    const s=new MemoryV4();expect((await run(s)).outcome).toBe('Completed');
    const q=s.a.request.query as unknown as Record<string,unknown>;const parts=field.split('.');const obj=parts.length===2?q.source as Record<string,unknown>:q;const k=parts[parts.length-1];obj[k]=typeof obj[k]==='number'?(obj[k] as number)+1:`${obj[k]}changed`;
    s.a.request.body=v4Canonical(q);expect((await run(s)).outcome).not.toBe('Completed');
  });
  test.each(['request','draft','references'])('between-read %s drift rejected without effects',async field=>{
    const s=new MemoryV4();s.mutate=(a,n)=>{if(n===2){if(field==='request')a.request.version='2';else if(field==='draft')a.draft.version='2';else a.references.rows[0].version='2';}};
    expect((await run(s)).outcome).toBe('Rejected');expect(s.writes).toHaveLength(0);
  });
  test.each(['actor','manager','epoch','createdBy','reference','source','requestEtag','query'])('untrusted/drifted %s rejected',async field=>{
    const s=new MemoryV4();if(field==='actor')s.a.actor.key='OTHER';if(field==='manager')s.a.manager.key='OTHER';if(field==='epoch')s.a.control.hierarchyEpoch=0;
    if(field==='createdBy')s.a.request.createdBy=999;if(field==='reference')s.a.references.rows[0].body='{}';if(field==='source')s.a.draft.body='{}';if(field==='requestEtag')s.a.request.etag='*';if(field==='query')s.a.request.query.year++;
    expect((await run(s)).outcome).toBe('Rejected');expect(s.writes).toHaveLength(0);
  });
  test.each(['manager','epoch','reference','requestVersion','actorVersion'])('post-admission %s drift holds recovery',async field=>{
    const s=new MemoryV4();await new OptionEWorkplanSubmitExactBodyV4(s,c=>{if(c==='SnapshotWritten')throw Error('lost');}).submit(key);
    if(field==='manager')s.a.control.manager='OTHER';if(field==='epoch')s.a.control.hierarchyEpoch++;if(field==='reference')s.a.references.rows[0].version='2';if(field==='requestVersion')s.a.request.version='2';if(field==='actorVersion')s.a.actor.version='2';
    expect((await run(s)).outcome).not.toBe('Completed');
  });
  test('concurrent same command has exactly one unique admission/snapshot/receipt',async()=>{const s=new MemoryV4();await Promise.all([run(s),run(s)]);expect(s.writes.filter(n=>n==='Validated')).toHaveLength(1);expect(s.writes.filter(n=>n==='Snapshot')).toHaveLength(1);expect(s.writes.filter(n=>n==='Receipt')).toHaveLength(1);expect((await run(s)).outcome).toBe('Completed');});
  test('competing command cannot win the same exact control version',async()=>{const s=new MemoryV4();await new OptionEWorkplanSubmitExactBodyV4(s,c=>{if(c==='ControlClaimed')throw Error('lost');}).submit(key);s.op=undefined;s.a.request.query.command='cbf5edb8-5d3b-46a5-a5ea-4564fa3ff43c';s.a.request.body=v4Canonical(s.a.request.query);const k='EMP-001|2027|cbf5edb8-5d3b-46a5-a5ea-4564fa3ff43c';expect((await new OptionEWorkplanSubmitExactBodyV4(s).submit(k)).outcome).toBe('Rejected');});
  test.each(['snapshot','receipt','acl'])('tampered immutable %s cannot replay complete',async field=>{const s=new MemoryV4();await run(s);if(field==='snapshot')s.snapshot!.body+=' ';if(field==='receipt')s.receipt!.nativeCreated='bad';if(field==='acl')s.acl!.targets[0].grants.push({principal:999,role:'FullControl'});expect((await run(s)).outcome).toBe('RecoveryHold');});
  test.each(['v3','unknown','missing','chunks'])('rejects %s protocol/chunk envelope',async mode=>{const s=new MemoryV4();const q=s.a.request.query as unknown as Record<string,unknown>;if(mode==='missing')delete q.capability;else if(mode==='chunks')q.chunks=[];else q.capability={...EXACT_BODY_V4,protocol:mode};s.a.request.body=v4Canonical(q);expect((await run(s)).outcome).toBe('Rejected');});
  test('native cannot bind to Required-SHA v3 storage or absent host parity',async()=>{const s=new MemoryV4();s.binding.kind='native';expect((await run(s)).outcome).toBe('Rejected');expect(s.writes).toHaveLength(0);});
  test('source/query/body mismatch, unsafe clock, stale control and full reference target mismatch',async()=>{
    for(const field of ['clock','etag','target']){const s=new MemoryV4();if(field==='clock')s.now=()=> 'clientclock';if(field==='etag')s.a.control.etag='*';if(field==='target'){const row=s.a.references.rows.find(r=>r.kind==='Target')!;const b=JSON.parse(row.body);b.annual={value:999};row.body=v4Canonical(b);s.a.request.query.referenceBody=v4Canonical(s.a.references);s.a.request.body=v4Canonical(s.a.request.query);}expect((await run(s)).outcome).toBe('Rejected');expect(s.writes).toHaveLength(0);}
  });
  test('wire source Draft scalar type cannot be coerced',()=>{const a=authority();const q=clone(a.request.query);(q as unknown as Record<string,unknown>).year='2027';expect(()=>parseV4Request(v4Canonical(q))).toThrow();});
});
describe('A009 epoch/full phase-control and native binding repairs',()=>{
  test('ahead hierarchy4/ACL5 is rejected before operation or product effects',async()=>{const s=new MemoryV4();s.a.control.aclEpoch=5;expect((await run(s)).outcome).toBe('Rejected');expect(s.writes).toHaveLength(0);});
  test('lower valid ACL epoch advances only through own exact completion plan',async()=>{const s=new MemoryV4();s.a.control.aclEpoch=2;expect((await run(s)).outcome).toBe('Completed');expect(s.a.control.aclEpoch).toBe(4);expect(s.op?.controlReadback).toEqual(s.a.control);});
  test('authority-only ACL drift is held before current control CAS/snapshot/receipt',async()=>{const s=new MemoryV4();s.mutate=(a,n)=>{if(n>=3)a.control.aclEpoch=3;};expect((await run(s)).outcome).toBe('RecoveryHold');expect(s.writes.filter(w=>['Control','Snapshot','Receipt','Acl'].includes(w))).toHaveLength(0);});
  test.each(V4_CHECKPOINTS.flatMap(cp=>['aclEpoch','hierarchyEpoch','etag','draftId','person','year','workplan','manager','state','transition','command','snapshot'].map(field=>[cp,field] as const)))('%s detects complete %s drift before next effect',async(cp,field)=>{
    const s=new MemoryV4();let changed=false;let writesAtDrift=0;
    const result=await new OptionEWorkplanSubmitExactBodyV4(s,c=>{if(c===cp&&!changed){changed=true;writesAtDrift=s.writes.length;const obj=s.a.control as unknown as Record<string,unknown>;obj[field]=typeof obj[field]==='number'?(obj[field] as number)+1:'Foreign';}}).submit(key);
    expect(result.outcome).toBe('RecoveryHold');expect(s.writes).toHaveLength(writesAtDrift);expect(s.op?.outcome).toBe('RecoveryHold');
  });
  test('actual ControlClaimed valid-relation ACL drift stops Snapshot and Receipt',async()=>{const s=new MemoryV4();const result=await new OptionEWorkplanSubmitExactBodyV4(s,c=>{if(c==='ControlClaimed')s.a.control.aclEpoch=3;}).submit(key);expect(result.outcome).toBe('RecoveryHold');expect(s.snapshot).toBeUndefined();expect(s.receipt).toBeUndefined();});
  test('actual ControlClaimed ahead-relation ACL drift stops Snapshot and Receipt',async()=>{const s=new MemoryV4();const result=await new OptionEWorkplanSubmitExactBodyV4(s,c=>{if(c==='ControlClaimed')s.a.control.aclEpoch=5;}).submit(key);expect(result.outcome).toBe('RecoveryHold');expect(s.snapshot).toBeUndefined();expect(s.receipt).toBeUndefined();});
  test.each(['Validated','AuditWritten','AclVerified'] as const)('durable %s CAS intent resolves response lost before checkpoint advance',async phase=>{
    const s=new MemoryV4();const original=s.advance.bind(s);const next=phase==='Validated'?'ControlClaimed':phase==='AuditWritten'?'ControlPointed':'Completed';let lost=true;
    s.advance=async(k,e,cp,ctrl)=>{if(cp===next&&lost){lost=false;throw Error('lost before journal advance');}return original(k,e,cp,ctrl);};
    expect((await run(s)).outcome).toBe('RecoveryHold');expect(s.op?.controlIntent).toBeDefined();const snap=clone(s.snapshot||null),receipt=clone(s.receipt||null);
    expect((await run(s)).outcome).toBe('Completed');expect(s.op?.controlIntent).toBeUndefined();if(snap)expect(s.snapshot).toEqual(snap);if(receipt)expect(s.receipt).toEqual(receipt);
  });
  test('uncertain prepare intent is read back exactly before CAS',async()=>{const s=new MemoryV4();s.lost.add('ControlIntent');expect((await run(s)).outcome).toBe('Completed');});
  test('forged intent cannot whitelist foreign ACL/control state',async()=>{const s=new MemoryV4();await new OptionEWorkplanSubmitExactBodyV4(s,c=>{if(c==='Validated')throw Error('lost');}).submit(key);s.op!.controlIntent={before:clone(s.a.control),after:{...s.a.control,aclEpoch:3} as V4Control};s.a.control.aclEpoch=3;expect((await run(s)).outcome).toBe('RecoveryHold');expect(s.snapshot).toBeUndefined();});
  test('divergent actual readControl retains no authority-readback mask',async()=>{const s=new MemoryV4();s.readControl=async()=>({...clone(s.a.control),aclEpoch:3});expect((await run(s)).outcome).toBe('RecoveryHold');expect(s.writes.filter(w=>['Control','Snapshot','Receipt','Acl'].includes(w))).toHaveLength(0);});
  test.each([42,[],{},true,false,null,undefined,'','x'])('native evidence %p never grants domain effects or installed admission',async evidence=>{
    const s=new MemoryV4();s.binding.kind='native';const b=s.binding as unknown as Record<string,unknown>;b.storageEvidence=evidence;b.hostParityEvidence=evidence;
    expect((await run(s)).outcome).toBe('Rejected');expect(s.writes).toHaveLength(0);
  });
  test.each(['unknown','protectedOrigin','capability','principals','missingKind'])('closed SourceDomain binding rejects %s before effects',async field=>{const s=new MemoryV4();const b=s.binding as unknown as Record<string,unknown>;if(field==='unknown')b.extra=true;else if(field==='protectedOrigin')b.protectedOrigin=false;else if(field==='capability')b.capability={...EXACT_BODY_V4,protocol:'kcf.kpi.option-e.submit.v3'};else if(field==='principals')b.principals={content:301,acl:302,recovery:'303'};else delete b.kind;expect((await run(s)).outcome).toBe('Rejected');expect(s.writes).toHaveLength(0);});
});
