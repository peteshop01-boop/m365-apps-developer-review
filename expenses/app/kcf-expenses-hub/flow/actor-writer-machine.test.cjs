'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildActorProcessorMachineFlow:buildActorProcessorFlow}=require('./build-flow.cjs');
const {validateGraph}=require('./wdl-harness.cjs');
const {MachineTenant:WriterTenant}=require('./actor-writer-machine-fixture.cjs');
test('existing emitter composes the protected financial writer without fixed actor/parent bindings',()=>{
  assert.equal(typeof buildActorProcessorFlow,'function');
  const flow=buildActorProcessorFlow(),text=JSON.stringify(flow);
  assert(!text.includes('fixtureActorId'));assert(!text.includes('fixtureParentId'));
  assert(!text.includes('D01_ADMISSION_ONLY_HELD'));
  assert(validateGraph(flow).actions<=500);
});
for(const kind of ['none','jpg','png','pdf'])test(`emitted private writer stores exact ${kind} and recovers same operation without duplicate`,async()=>{
  const f=new WriterTenant();f.tables.requests=[];f.files.clear();
  const {command,receipts}=require('./fake-sharepoint.cjs');f.put(501,command(kind),11);
  const first=await f.runWriter();assert.equal(first.state,'Succeeded',JSON.stringify({code:first.code,errors:first.errors,last:first.visited.slice(-8)}));
  assert.equal(first.outputs.Storage_Verified.state,'StorageVerified');
  const line=f.tables.expenses[0];assert(line);assert.equal(f.tables.expenses.length,1);assert.equal(line.D01Originator,11);
  assert.equal(line.FileDirRef,f.p.roots.expenses+'/11');assert.equal(f.creates.every(c=>c.n==='audit'?c.folder===f.p.roots.audit:c.folder.endsWith('/11')),true);
  assert.equal(f.tables.claims[0].ExpenseTotal,22.34);assert.equal(f.tables.claims[0].OverallTotal,24.34);
  if(kind!=='none')assert.deepEqual(f.rawGet(11,'expenses',line.Id,true).body,receipts[kind]);else assert.equal(line.D01NoReceiptReason,command(kind).command.receipt.reason);
  const second=await f.runWriter();assert.equal(second.state,'Succeeded',JSON.stringify({code:second.code,errors:second.errors}));
  assert.equal(second.outputs.Storage_Verified.expenseId,line.Id);assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.claims[0].ExpenseTotal,22.34);
});

test('two ordinary actors use one writer and each fake raw expense/file/request/result denies the other',async()=>{
  const f=new WriterTenant(),secondId=f.add(12,'jpg');
  const results=await Promise.all([f.runWriter(),f.runWriter(secondId)]);
  assert(results.every(r=>r.state==='Succeeded'),JSON.stringify(results.map(r=>({code:r.code,errors:r.errors}))));
  assert.equal(f.tables.expenses.length,2);assert.equal(f.tables.claims[0].ExpenseTotal,22.34);assert.equal(f.tables.claims[1].ExpenseTotal,22.34);
  for(const [actor,other]of [[11,12],[12,11]]){
    const expense=f.tables.expenses.find(r=>r.D01Originator===actor),result=f.tables.results.find(r=>r.D01ActorId===actor),request=f.tables.requests.find(r=>r.AuthorId===actor);
    for(const [name,id,file]of [['expenses',expense.Id,false],['expenses',expense.Id,true],['requests',request.Id,false],['results',result.Id,false]]){
      assert.equal(f.rawGet(actor,name,id,file).status,200);assert.equal(f.rawGet(other,name,id,file).status,403);
    }
  }
});
test('completed canonical replay retains historical parent after closure and a replacement Draft',async()=>{
  const f=new WriterTenant(),first=await f.runWriter();assert.equal(first.state,'Succeeded',JSON.stringify(first.errors));
  const original=f.tables.claims[0];original.SubmissionStatus='Submitted';f.bump(original);
  const next={...original,Id:901,SubmissionStatus:'Draft',ExpenseTotal:0,MileageTotal:0,OverallTotal:0,D01Checkpoint:''};f.tables.claims.push(next);f.assign('claims',next,11);
  const writes=f.writes.length,replay=await f.runWriter();assert.equal(replay.state,'Succeeded',JSON.stringify({code:replay.code,errors:replay.errors}));
  assert.equal(replay.outputs.Storage_Verified.expenseId,first.outputs.Storage_Verified.expenseId);assert.equal(f.writes.length,writes);assert.equal(f.tables.expenses.length,1);assert.equal(next.ExpenseTotal,0);
});
test('changed expense folder grants before financial creation prevent financial data publication',async()=>{
  const f=new WriterTenant();f.writerHooks.Writer_Selected_Parent=x=>{x.scopeFlags.extraFolderRole='expenses';};
  const r=await f.runWriter();assert.equal(r.outputs.Storage_Verified,undefined);assert.equal(f.tables.expenses.length,0);
});
test('late sharing exception after release cannot return StorageVerified from stale snapshots',async()=>{
  const f=new WriterTenant();f.writerHooks.Released_Parent=x=>{x.tables.expenses[0].HasUniqueRoleAssignments=true;};
  const r=await f.runWriter();assert.equal(r.outputs.Storage_Verified,undefined);
});
for(const fault of ['reason','actor','parent','etag','nominal','category'])test(`writer refuses ${fault} before any durable publication`,async()=>{
  const f=new WriterTenant(),{command}=require('./fake-sharepoint.cjs'),payload=command('none');
  if(fault==='reason')payload.command.receipt.reason='  ';if(fault==='actor')payload.command.actorId=12;
  if(fault==='parent')payload.command.parentId=102;if(fault==='etag')payload.command.parentEtag='"77"';if(fault==='nominal')payload.command.nominalCode='99999';
  if(fault==='category')f.scopeFlags.categoryRequired=true;
  f.tables.requests=[];f.files.clear();f.put(501,payload,11);
  const r=await f.runWriter();assert.equal(r.outputs.Storage_Verified,undefined);assert.equal(f.writes.length,0);assert.equal(f.tables.expenses.length,0);
});
for(const [flag,resource]of [['fieldError','operations'],['misleadingId','operations'],['lostAck','operations'],['lostAck','expenses']])test(`native ${flag} at ${resource} stays Pending and reconciles the same operation once`,async()=>{
  const f=new WriterTenant();f.scopeFlags[flag]=resource;
  const failed=await f.runWriter();assert.equal(failed.outputs.Storage_Verified,undefined);assert.equal(failed.code,'D01_PENDING');
  delete f.scopeFlags[flag];const retry=await f.runWriter();assert.equal(retry.state,'Succeeded',JSON.stringify({code:retry.code,errors:retry.errors}));
  assert.equal(f.tables.operations.length,1);assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.claims[0].ExpenseTotal,22.34);assert.equal(f.tables.results.length,1);
});
test('protected onboarding of actor35 and parent735 needs no employee-specific code or container',async()=>{
  const f=new WriterTenant(),person=f.tables.people[2],claim=f.tables.claims[2];person.D01UserId=35;claim.Id=735;
  // Protected reference-reader onboarding is required; no runtime auto-grant.
  f.groups.get(24).delete(13);f.groups.get(24).add(35);
  f.assign('people',person,35);f.assign('claims',claim,35);
  const limited={id:35,type:1,roles:[{id:1073741825,high:'48',low:'134287360'}]};
  for(const n of ['requests','operations','results','expenses','claims','people']){f.p.rootAcl[n].push(structuredClone(limited));f.nativePolicy.rootAcl[n].push(structuredClone(limited));}
  const {command}=require('./fake-sharepoint.cjs'),payload=command('png');payload.command.parentId=735;f.put(900,payload,35);
  const r=await f.runWriter(900);assert.equal(r.state,'Succeeded',JSON.stringify({code:r.code,errors:r.errors}));
  assert.equal(f.tables.expenses[0].D01Originator,35);assert.equal(f.tables.expenses[0].ClaimSubmissionRefId,735);assert.equal(f.creates[0].folder,f.p.roots.operations+'/35');
});
test('a newly required unknown native expense field cannot receive a hidden default or publish a ledger',async()=>{
  const f=new WriterTenant(),send=f.send.bind(f);f.send=async plan=>{
    const r=await send(plan);if(plan.url.includes(f.schemas.lists.expenses)&&new URL(plan.url).pathname.endsWith('/fields')){
      const body=await new Response(r.body).json();body.value.push({InternalName:'UnknownRequired',TypeAsString:'Text',Required:true,ReadOnlyField:false,Hidden:true,EnforceUniqueValues:false});return f.response(plan,200,body);
    }return r;
  };
  const r=await f.runWriter();assert.equal(r.outputs.Storage_Verified,undefined);assert.equal(f.writes.length,0);
});
function rejectedFixture(partial=false){
  const f=new WriterTenant(),common={OperationKey:'11:test-operation-0001',RequestId:501,D01ActorId:11,ParentId:101,AuthorId:99,'odata.etag':'"1"'};
  const ledger={Id:1000,...common,State:'Rejected',ResultId:1001},result={Id:1001,...common,State:'Rejected',RecordJson:''};
  f.tables.operations.push(ledger);f.assign('operations',ledger,11);f.tables.results.push(result);f.assign('results',result,11);
  if(partial){const line={Id:2000,D01OperationKey:common.OperationKey,D01Originator:11,D01RequestId:501,ClaimSubmissionRefId:101,AuthorId:99,'odata.etag':'"1"'};f.tables.expenses.push(line);f.assign('expenses',line,11);}
  return f;
}
test('AW-R1-SEC-01 valid rejected history still returns its same read-only outcome',async()=>{
  const f=rejectedFixture(),r=await f.runWriter();assert.equal(r.state,'Succeeded',JSON.stringify(r.errors));assert.deepEqual(r.outputs.Existing_Rejected_Outcome,{state:'Rejected'});assert.equal(f.writes.length,0);
});
test('AW-R1-SEC-01 rejected history with a partial expense refuses outcome before clearing reservation',async()=>{
  const f=rejectedFixture(true);f.tables.claims[0].D01Reservation=JSON.stringify({mode:'Rejecting',key:'11:test-operation-0001',originalEtag:'"1"'});
  const r=await f.runWriter();assert.equal(r.outputs.Existing_Rejected_Outcome,undefined);assert.equal(r.code,'D01_PENDING');assert.equal(f.writes.length,0);assert.notEqual(f.tables.claims[0].D01Reservation,'');
});
for(const change of ['line','resultSharing','canonicalBytes','ledgerRequest'])test(`AW-R1-SEC-01 rejected terminal rereads ${change} after release`,async()=>{
  const f=rejectedFixture();f.writerHooks.Existing_Reject_Released=x=>{
    if(change==='line'){const row={Id:2000,D01OperationKey:'11:test-operation-0001',D01Originator:11,D01RequestId:501,ClaimSubmissionRefId:101,AuthorId:99,'odata.etag':'"1"'};x.tables.expenses.push(row);x.assign('expenses',row,11);}
    if(change==='resultSharing')x.tables.results[0].HasUniqueRoleAssignments=true;
    if(change==='canonicalBytes'){const path=x.tables.requests[0].File.ServerRelativeUrl,bytes=Buffer.from(x.files.get(path));bytes[0]=91;x.files.set(path,bytes);}
    if(change==='ledgerRequest')x.tables.operations[0].RequestId=999;
  };
  const r=await f.runWriter();assert.equal(r.outputs.Existing_Rejected_Outcome,undefined);assert.equal(r.code,'D01_PENDING');assert.equal(f.writes.length,0);
});
test('AW-R1-SEC-01 pending stale operation rejects once, releases safely and replays after closure',async()=>{
  const f=new WriterTenant(),row={Id:1000,OperationKey:'11:test-operation-0001',RequestId:501,D01ActorId:11,ParentId:101,AuthorId:99,State:'Pending',ResultId:null,'odata.etag':'"1"'};
  f.tables.operations.push(row);f.assign('operations',row,11);f.bump(f.tables.claims[0]);
  const rejected=await f.runWriter();assert.equal(rejected.state,'Succeeded',JSON.stringify({code:rejected.code,errors:rejected.errors}));assert.deepEqual(rejected.outputs.Rejected_Outcome,{state:'Rejected'});
  assert.equal(f.tables.expenses.length,0);assert.equal(f.tables.claims[0].ExpenseTotal,10);assert.equal(f.tables.claims[0].D01Reservation,'');assert.equal(f.tables.operations[0].State,'Rejected');assert.equal(f.tables.results.length,1);
  f.tables.claims[0].SubmissionStatus='Submitted';f.tables.months[0].MonthStatus='Closed';const writes=f.writes.length;
  const replay=await f.runWriter();assert.equal(replay.state,'Succeeded',JSON.stringify({code:replay.code,errors:replay.errors}));assert.deepEqual(replay.outputs.Existing_Rejected_Outcome,{state:'Rejected'});assert.equal(f.writes.length,writes);
});
test('AW-R1-SEC-01 rejected replay preserves another operation reservation',async()=>{
  const f=rejectedFixture(),reservation=JSON.stringify({mode:'Creating',key:'11:another-operation-0002',originalEtag:'"9"'});f.tables.claims[0].D01Reservation=reservation;
  const r=await f.runWriter();assert.equal(r.outputs.Existing_Rejected_Outcome,undefined);assert.equal(f.writes.length,0);assert.equal(f.tables.claims[0].D01Reservation,reservation);
});


