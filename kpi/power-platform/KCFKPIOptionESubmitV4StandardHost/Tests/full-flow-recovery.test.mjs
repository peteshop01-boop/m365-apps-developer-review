/** Bounded developer recovery/integration cases on the ACTUAL generated graph.
 * Synthetic native store and process interruption, never hosted or independent evidence.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build,load} from '../Tools/build-standard-host.mjs';
import {phases,storageProposal} from '../Tools/storage-native.mjs';
import {WdlEmulator} from './wdl-emulator.mjs';
import {NativeMemory} from './native-memory.mjs';
import {a009Native} from './A009-native-memory.mjs';
const makeNative=async()=>process.env.KCF_A009_RECOVERY?await a009Native():new NativeMemory();
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const domain=load(path.join(root,'src/webparts/performanceHub/services/OptionEWorkplanSubmitExactBodyV4.ts'));
const wire=load(path.join(root,'src/webparts/performanceHub/services/OptionEWorkplanSubmitExactBodyV4Wire.ts'));
const actions=build().definition.properties.definition.actions,records=[];
const operation=n=>n.lists.get(n.listIds.Operation)[0];
const doc=(n,kind)=>JSON.parse(n.files.get(n.paths[kind]+'/'+n.request.command+'-'+kind.toLowerCase()+'.json'));
const meta=(n,kind)=>n.lists.get(n.listIds[kind])?.[0];
const summary=(n,e)=>({terminal:e.terminal||'INTERRUPTED',error:e.terminalError,failures:e.failures,control:{state:n.control.State,transition:n.control.TransitionStatus,etag:n.control['@odata.etag']},operation:operation(n)&&{checkpoint:operation(n).Checkpoint,outcome:operation(n).Outcome,etag:operation(n)['@odata.etag']},schemaFailures:n.schemaFailures,writes:n.writes.length,nativeCalls:e.calls});
async function run(n,hook){const e=new WdlEmulator({parameters:n.parameters,trigger:{ID:1},clock:n.clock,http:async(p,name,em)=>{e.calls++;return hook?hook(p,name,em,()=>n.http(p,name,em)):n.http(p,name,em);}});e.calls=0;try{await e.run(actions);}catch(error){if(error.code!=='SYNTHETIC_PROCESS_STOP')throw error;}return e;}
async function test(name,fn){const started=performance.now(),detail={};try{await fn(detail);records.push({name,result:'PASS',ms:performance.now()-started,...detail});}catch(error){records.push({name,result:'FAIL',error:String(error),stack:error.stack,ms:performance.now()-started,...detail});}}
function completed(n,e){assert.equal(e.terminal,'Succeeded',JSON.stringify(summary(n,e)));assert.equal(operation(n).Checkpoint,'Completed');assert.equal(operation(n).Outcome,'Completed');assert.deepEqual(n.schemaFailures,[]);}
function held(n,e){assert.equal(e.terminal,'Failed');assert.notEqual(operation(n)?.Outcome,'Completed');}
function stopped(){const error=Error('Synthetic process stopped at persisted native boundary');error.code='SYNTHETIC_PROCESS_STOP';throw error;}
await test('Schema-constrained complete flow and unchanged protected domain admission oracle',async detail=>{
  const n=await makeNative(),e=await run(n);detail.execution=summary(n,e);completed(n,e);
  const journal=doc(n,'Admission'),snapshot=doc(n,'Snapshot'),receipt=e.outputs.Run_ReceiptProjection.domain;
  assert.deepEqual(Object.keys(journal.domain).sort(),['authority','eventAt','key']);
  assert.deepEqual(Object.keys(journal.domain.authority).sort(),['actor','control','draft','manager','references','request']);
  assert.deepEqual(snapshot,{key:journal.key,admission:journal.domain,body:journal.origins.draftBody,referencesBody:n.request.referenceBody});
  assert.deepEqual(receipt,{key:journal.key,admission:journal.domain,snapshot,nativeCreated:meta(n,'Receipt').Created});
  assert.deepEqual(e.outputs.Run_ReceiptProjection.native,meta(n,'Receipt'));
  assert.deepEqual(journal.origins.request,n.lists.get(n.listIds.Request)[0]);if(!process.env.KCF_A009_RECOVERY)assert.deepEqual(journal.origins.references.map(r=>r.native),[...n.lists.get(n.refIds.Framework),n.assignment,...n.values,...n.prompts]);
  assert.deepEqual(journal.domain.authority.references,JSON.parse(n.request.referenceBody));
  domain.validateV4References(journal.domain.authority.references,wire.parseV4Draft(journal.domain.authority.draft.body),'P',2026);
  let oracleAdmission;const service=new domain.OptionEWorkplanSubmitExactBodyV4({binding:{kind:'domain-test',capability:n.request.capability,protectedOrigin:true,principals:n.principals},readAuthority:async()=>journal.domain.authority,readOperation:async()=>undefined,now:()=>journal.eventAt,createOperation:async a=>{oracleAdmission=a;throw Error('Oracle intentionally stops after protected validation');}});
  await service.submit(journal.key);assert.deepEqual(oracleAdmission,journal.domain);
  const currentControl={...journal.domain.authority.control,state:'Submitted',transition:'Ready',aclEpoch:journal.domain.authority.control.hierarchyEpoch,snapshot:journal.key,etag:n.control['@odata.etag']};
  const completedOperation={admission:journal.domain,checkpoint:'Completed',outcome:'Completed',etag:operation(n)['@odata.etag'],controlReadback:currentControl};
  const acl=domain.v4AclPlan(journal.domain,n.principals);
  const domainStore={binding:{kind:'domain-test',capability:n.request.capability,protectedOrigin:true,principals:n.principals},readAuthority:async()=>({...journal.domain.authority,control:currentControl}),readOperation:async()=>completedOperation,readControl:async()=>currentControl,readSnapshot:async()=>snapshot,readReceipt:async()=>receipt,expectedAcl:async()=>acl,readAcl:async()=>acl};
  const domainCompleted=await new domain.OptionEWorkplanSubmitExactBodyV4(domainStore).submit(journal.key);
  assert.equal(domainCompleted.outcome,'Completed',JSON.stringify(domainCompleted));assert.deepEqual(domainCompleted.receipt,receipt);
  const wrongDateStore={...domainStore,readReceipt:async()=>({...receipt,nativeCreated:new Date(Date.parse(n.clock||'2026-10-02T02:00:00.000Z')+300001).toISOString()}),hold:async()=>{}};
  assert.equal((await new domain.OptionEWorkplanSubmitExactBodyV4(wrongDateStore).submit(journal.key)).outcome,'RecoveryHold');
  const before=n.writes.length,replay=await run(n);detail.replay=summary(n,replay);completed(n,replay);assert.equal(n.writes.length,before);
});
for(const checkpoint of phases) {
  await test(`Process-stop and fresh full-flow replay at ${checkpoint}`,async detail=>{
    const n=await makeNative();let hit=false;const first=await run(n,async(p,name,e,next)=>{const result=await next();if(!hit&&result.statusCode<400&&p['parameters/method']==='POST'&&p['parameters/body']?.Checkpoint===checkpoint){hit=true;stopped();}return result;});
    detail.interrupted=summary(n,first);assert(hit);assert.equal(operation(n).Checkpoint,checkpoint);const replay=await run(n);detail.replay=summary(n,replay);completed(n,replay);
  });
  await test(`Lost successful response reconciles exact native operation ${checkpoint}`,async detail=>{
    const n=await makeNative();let hit=false;const e=await run(n,async(p,name,em,next)=>{const result=await next();if(!hit&&result.statusCode<400&&p['parameters/method']==='POST'&&p['parameters/body']?.Checkpoint===checkpoint){hit=true;return {statusCode:504,body:{error:'synthetic lost response after persisted operation'}};}return result;});
    detail.execution=summary(n,e);assert(hit);completed(n,e);assert(e.failures.some(f=>f.error.includes('HTTP 504')));
  });
}
for(const kind of ['Admission','Snapshot','Receipt']) {
  await test(`Process-stop after ${kind} native write recovers without duplicate body`,async detail=>{
    const n=await makeNative();let hit=false;const first=await run(n,async(p,name,e,next)=>{const result=await next();if(!hit&&result.statusCode<400&&name.includes('Effect_Create'+kind+'_')&&name.endsWith('_Write')){hit=true;stopped();}return result;});detail.interrupted=summary(n,first);assert(hit);
    const original=structuredClone(doc(n,kind)),replay=await run(n);detail.replay=summary(n,replay);completed(n,replay);assert.deepEqual(doc(n,kind),original);assert.equal(n.lists.get(n.listIds[kind]).length,1);
  });
  await test(`Lost ${kind} file response reconciles exact immutable/native readback`,async detail=>{
    const n=await makeNative();let hit=false;const e=await run(n,async(p,name,em,next)=>{const result=await next();if(!hit&&result.statusCode<400&&name.includes('Effect_Create'+kind+'_')&&name.endsWith('_Write')){hit=true;return {statusCode:504,body:{error:'synthetic lost persisted file response'}};}return result;});detail.execution=summary(n,e);assert(hit);completed(n,e);assert.equal(n.lists.get(n.listIds[kind]).length,1);
  });
  await test(`Unapplied uncertain ${kind} write holds before dependent effects and fresh replay recovers`,async detail=>{
    const n=await makeNative();let hit=false;const first=await run(n,async(p,name,e,next)=>{if(!hit&&name.includes('Effect_Create'+kind+'_')&&name.endsWith('_Write')){hit=true;return {statusCode:504,body:{error:'synthetic uncertain file was not persisted'}};}return next();});detail.first=summary(n,first);assert(hit);assert.equal(first.terminal,'Failed');assert.equal(n.lists.get(n.listIds[kind])?.length||0,0);if(kind==='Admission'){assert.equal(operation(n),undefined);assert.equal(n.control.State,'Draft');}else held(n,first);const replay=await run(n);detail.replay=summary(n,replay);completed(n,replay);
  });
}
for(const checkpoint of ['Validated','AuditWritten','AclVerified']) {
  await test(`Exact ETag 412 foreign CAS holds at ${checkpoint}`,async detail=>{
    const n=await makeNative();let hit=false;const e=await run(n,async(p,name,em,next)=>{if(!hit&&name==='Effect_CASControlValid_Control_CAS'&&operation(n)?.Checkpoint===checkpoint){hit=true;n.control['@odata.etag']='"999"';n.control.OData__UIVersionString='999.0';n.control.ManagerPersonKey='FOREIGN';}return next();});detail.execution=summary(n,e);assert(hit);held(n,e);assert(e.failures.some(f=>f.error.includes('HTTP 412')));assert.equal(n.control.ManagerPersonKey,'FOREIGN');
  });
  await test(`Lost Control CAS response reconciles persisted intent at ${checkpoint}`,async detail=>{
    const n=await makeNative();let hit=false;const e=await run(n,async(p,name,em,next)=>{const result=await next();if(!hit&&name==='Effect_CASControlValid_Control_CAS'&&operation(n)?.Checkpoint===checkpoint&&result.statusCode<400){hit=true;return {statusCode:504,body:{error:'synthetic lost successful CAS'}};}return result;});detail.execution=summary(n,e);assert(hit);completed(n,e);
  });
  await test(`Unapplied uncertain Control CAS holds then authorised fresh replay at ${checkpoint}`,async detail=>{
    const n=await makeNative();let hit=false;const first=await run(n,async(p,name,e,next)=>{if(!hit&&name==='Effect_CASControlValid_Control_CAS'&&operation(n)?.Checkpoint===checkpoint){hit=true;return {statusCode:504,body:{error:'synthetic no write / unknown response'}};}return next();});detail.first=summary(n,first);assert(hit);held(n,first);const replay=await run(n);detail.replay=summary(n,replay);completed(n,replay);
  });
}
await test('Two concurrent same-command generated flows retain one exact journal/snapshot/receipt',async detail=>{
  const n=await makeNative(),[a,b]=await Promise.all([run(n),run(n)]);detail.executions=[summary(n,a),summary(n,b)];assert.equal(n.lists.get(n.listIds.Operation).length,1);for(const kind of ['Admission','Snapshot','Receipt'])assert.equal(n.lists.get(n.listIds[kind]).length,1);assert([a,b].some(e=>e.terminal==='Succeeded'));const replay=await run(n);detail.replay=summary(n,replay);completed(n,replay);
});
await test('Persisted Operation with missing Admission never recreates source authority',async detail=>{const n=await makeNative();let hit=false;await run(n,async(p,name,e,next)=>{const result=await next();if(!hit&&name==='Effect_CreateOperation_Write'&&result.statusCode<400){hit=true;stopped();}return result;});assert(hit);n.files.delete(n.paths.Admission+'/'+n.request.command+'-admission.json');n.lists.set(n.listIds.Admission,[]);const before=n.writes.length,e=await run(n);detail.execution=summary(n,e);held(n,e);assert.equal(n.control.State,'Draft');assert.equal(n.files.has(n.paths.Admission+'/'+n.request.command+'-admission.json'),false);assert.equal(n.writes.slice(before).filter(w=>w.kind==='file').length,0);});
for(const [label,alter]of [
  ['wrong Author',r=>r.AuthorId=999],['missing version',r=>delete r.OData__UIVersionString],['missing ETag',r=>delete r['@odata.etag']],['wildcard ETag',r=>r['@odata.etag']='"*"'],['unquoted ETag',r=>r['@odata.etag']='1'],['caller-like date beyond admission window',r=>r.Created='2027-01-01T02:00:00.001Z'],['invalid date',r=>r.Created='not-a-date']
])await test(`Receipt full-flow native origin ${label} holds before Completed`,async detail=>{const n=await makeNative();let hit=false;const e=await run(n,async(p,name,em,next)=>{const result=await next();if(!hit&&name==='Effect_CreateReceipt_Receipt_Write'&&result.statusCode<400){hit=true;alter(meta(n,'Receipt'));}return result;});detail.execution=summary(n,e);assert(hit);held(n,e);});
await test('Receipt metadata changes across content double read holds',async detail=>{const n=await makeNative();let hit=false;const e=await run(n,async(p,name,em,next)=>{if(!hit&&name==='Run_Receipt_Metadata_B'&&meta(n,'Receipt')){hit=true;meta(n,'Receipt')['@odata.etag']='"2"';meta(n,'Receipt').OData__UIVersionString='2.0';}return next();});detail.execution=summary(n,e);assert(hit);held(n,e);});
for(const delta of [-300000,300000])await test(`Receipt unchanged-domain native Created window boundary ${delta}ms`,async detail=>{const n=await makeNative();let hit=false;const e=await run(n,async(p,name,em,next)=>{const result=await next();if(!hit&&name==='Effect_CreateReceipt_Receipt_Write'&&result.statusCode<400){hit=true;meta(n,'Receipt').Created=new Date(Date.parse(n.clock||'2026-10-02T02:00:00.000Z')+delta).toISOString();}return result;});detail.execution=summary(n,e);assert(hit);completed(n,e);});
for(const [label,mutate]of [['extra domain key',j=>j.domain.extra='caller'],['forged domain actor',j=>j.domain.authority.actor.principal=999],['forged original reference body',j=>j.domain.authority.references.rows[0].body='{}'],['crossed event time',j=>j.domain.eventAt='2026-10-02T02:01:00.000Z']])await test(`Admission ${label} holds on full-flow recovery`,async detail=>{const n=await makeNative();let hit=false;await run(n,async(p,name,e,next)=>{const result=await next();if(!hit&&name==='Effect_CreateOperation_Write'&&result.statusCode<400){hit=true;stopped();}return result;});assert(hit);const key=n.paths.Admission+'/'+n.request.command+'-admission.json',j=JSON.parse(n.files.get(key));mutate(j);n.files.set(key,JSON.stringify(j));const e=await run(n);detail.execution=summary(n,e);held(n,e);assert.equal(n.control.State,'Draft');});
await test('Operation schema fixture rejects unknown/missing-required fields independently of graph',async detail=>{const n=await makeNative(),p={'parameters/method':'POST','parameters/uri':n.rootUri(n.listIds.Operation)+'/items','parameters/headers':{},'parameters/body':{CommandKey:'x',Unknown:'y'}};const response=await n.http(p,'schema-negative',{});assert.equal(response.statusCode,400);assert(n.schemaFailures[0].problems.includes('undeclared:Unknown'));assert(n.schemaFailures[0].problems.includes('missing:AdmissionName'));detail.schemaFields=storageProposal.roots.Operation.fields.map(f=>({name:f.internalName,required:f.required}));});
await test('Required document metadata regression rejects actual byte-only create before canonical effects',async detail=>{const required=['CommandKey','WorkplanKey','PersonKey','PerformanceYear','ClientCommand'].map(internalName=>({internalName,required:true})),n=new NativeMemory({documentMetadataSchema:required}),e=await run(n);detail.execution=summary(n,e);assert.equal(e.terminal,'Failed');assert.equal(n.control.State,'Draft');assert.equal(operation(n),undefined);assert.equal(n.files.has(n.paths.Admission+'/'+n.request.command+'-admission.json'),false);assert.deepEqual(n.schemaFailures[0].problems,required.map(f=>'missing:'+f.internalName));assert.deepEqual(storageProposal.documentMetadata,[]);assert(storageProposal.documentTupleBinding.includes('complete request/authority tuple'));});
const output={classification:'DEVELOPER_ACTUAL_GENERATED_FLOW_SYNTHETIC_NOT_MICROSOFT_OR_INDEPENDENT',tests:records.length,passed:records.filter(r=>r.result==='PASS').length,failed:records.filter(r=>r.result==='FAIL').length,records,fixture:process.env.KCF_A009_RECOVERY?'A009_FULL_NATIVE_CATALOGUE_PERSON_TARGET_CAPTURE_ORIGINS':'FOUNDATION_NATIVE',notExecuted:['Microsoft hosted/native schema/rights/MIME/UTF8/status/parity','real TEST/Sponsor UAT/release/Production']};
fs.writeFileSync(process.env.KCF_A002_RECOVERY_RESULT||path.join(here,'full-flow-results.json'),JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({tests:output.tests,passed:output.passed,failed:output.failed,failures:records.filter(r=>r.result==='FAIL').map(r=>({name:r.name,error:r.error}))}));if(output.failed)process.exitCode=1;
