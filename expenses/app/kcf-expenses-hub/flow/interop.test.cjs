'use strict';
// Integration of the REAL compiled application service/channel/store with the
// emitted native WDL graph. HTTP transport alone is fake. No tenant connection.
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {FakeSharePoint,command,receipts,bindings}=require('./fake-sharepoint.cjs');
const {SITE}=require('./build-flow.cjs');
const {StandardStoreIO}=require('../lib-commonjs/processor/StandardStoreTransport');
const {SharePointStandardStore}=require('../lib-commonjs/processor/SharePointStandardStore');
const {SharePointRequestChannel,composeBrowserRequestChannel}=require('../lib-commonjs/processor/SharePointRequestChannel');
const {RequestLedgerExpensePort}=require('../lib-commonjs/services/persistence/RequestLedgerExpensePort');
const {ExpensePersistenceService}=require('../lib-commonjs/services/persistence/ExpensePersistenceService');
const digest=async b=>crypto.createHash('sha256').update(b).digest('hex');
const schema={lists:Object.fromEntries(Object.entries(bindings).filter(([k])=>['requests','operations','results','audit','expenses','claims','people','months','nominals'].includes(k))),expense:{reason:'D01NoReceiptReason',originator:'D01Originator',requestId:'D01RequestId',canonicalOperation:'D01OperationKey',receiptManifest:'D01ReceiptManifest',receiptRequiredForFile:true,receiptRequiredForNoReceipt:false},fingerprint:'D01Fingerprint',reservation:'D01Reservation',checkpoint:'D01Checkpoint',personUser:'D01UserId',personActive:'D01Active',personActiveValue:true,nominalEligible:'D01Eligible',nominalEligibleValue:1};
class IntegratedFixture extends FakeSharePoint {
  constructor(){super();this.tables.requests=[];this.files.clear();this.flowRuns=[];this.rawDenied=0;this.deferProcessor=false;}
  async transport(input,name){const r=await super.transport(input,name);if(name==='Create_Expense'){this.tables.expenses.at(-1).ExpenseDate+='T00:00:00Z';}if(name==='Create_Operation')this.tables.operations.at(-1).ResultId=null;return r;}
  response(plan,status,data={},bytes){return {status,url:plan.url,redirected:false,etag:data?.['odata.etag'],body:new ReadableStream({start(c){const b=bytes||Buffer.from(JSON.stringify(data));for(let i=0;i<b.length;i+=8192)c.enqueue(new Uint8Array(b.slice(i,i+8192)));c.close();}})};}
  caller(actor=11){return {send:async plan=>{
    if(plan.url===SITE+'/_api/web/currentuser?$select=Id')return this.response(plan,200,{Id:actor});
    if(plan.url===SITE+'/_api/web/currentuser?$select=Id,IsSiteAdmin')return this.response(plan,200,{Id:actor,IsSiteAdmin:false});
    if(actor!==11){this.rawDenied++;return this.response(plan,403);}
    if(plan.method==='POST'&&plan.url.includes('/Files/AddUsingPath')){
      const decoded=decodeURIComponent(plan.url);if(!decoded.includes(`decodedurl='${bindings.requestRoot}/${actor}'`)||!decoded.includes('overwrite=false'))return this.response(plan,403);
      const payload=JSON.parse(new TextDecoder().decode(plan.body));if(this.tables.requests.some(r=>r.File.Name===payload.command.operationId+'.json'))return this.response(plan,409);
      const id=501+this.tables.requests.length;this.putRequest(id,payload,actor);this.tables.requests.at(-1).File.UniqueId=`10000000-0000-4000-8000-${String(id).padStart(12,'0')}`;
      if(!this.deferProcessor)this.flowRuns.push(await this.run(id));return this.response(plan,201,{});
    }
    if(plan.method!=='GET')return this.response(plan,403);
    const u=new URL(plan.url),m=/lists\(guid'([^']+)'\)\/items(?:\((\d+)\))?/.exec(u.pathname);if(!m)return this.response(plan,403);
    const list=Object.keys(schema.lists).find(k=>schema.lists[k]===m[1]),id=Number(m[2]);if(!list)return this.response(plan,403);
    if(list==='requests'&&u.pathname.endsWith('/File/$value')){const row=this.tables.requests.find(r=>r.Id===id);return row?this.response(plan,200,{},this.files.get(row.File.ServerRelativeUrl)):this.response(plan,404);}
    const history=/^D01ActorId eq (\d+) and ParentId eq (\d+)$/.exec(u.searchParams.get('$filter')||'');
    if(history){const values=this.tables[list].filter(r=>r.D01ActorId===Number(history[1])&&r.ParentId===Number(history[2])).map(r=>this.project(r,u));return this.response(plan,200,{value:values});}
    const author=/^AuthorId eq (\d+)$/.exec(u.searchParams.get('$filter')||'');
    if(list==='requests'&&author){const values=this.tables.requests.filter(r=>r.AuthorId===Number(author[1])).slice(0,Number(u.searchParams.get('$top'))).map(r=>this.project(r,u));return this.response(plan,200,{value:values});}
    const response=await super.transport({host:{operationId:'HttpRequest'},parameters:{dataset:SITE,'parameters/method':'GET','parameters/uri':plan.url.slice(SITE.length+1),'parameters/headers':plan.headers}},'Caller_Read');
    if(u.pathname.endsWith('/$value'))return this.response(plan,200,{},Buffer.from(response.body.$content,'base64'));
    return this.response(plan,200,response.body);
  }};}
  service(actor=11){const io=new StandardStoreIO(this.caller(actor));const channel=new SharePointRequestChannel(io,new SharePointStandardStore(io,schema),bindings.requestRoot);return new ExpensePersistenceService(new RequestLedgerExpensePort(channel,digest),digest);}
}
function input(kind){const c=command(kind).command;return {...c,receipt:c.receipt.kind==='none'?c.receipt:{kind:'file',fileName:c.receipt.fileName,mediaType:c.receipt.mediaType,bytes:new Uint8Array(receipts[kind])}};}
for(const kind of ['none','jpg','png','pdf'])test(`compiled app→native WDL→cold actual store readback: ${kind}`,async()=>{const f=new IntegratedFixture(),c=input(kind);const saved=await f.service().save(c);assert.equal(saved.state,'ReadbackVerified',JSON.stringify({saved,runs:f.flowRuns.map(r=>({state:r.state,code:r.code,errors:r.errors}))}));const id=saved.record.line.id;assert.equal((await f.service().reopen(101,id)).state,'ReadbackVerified');assert.equal((await f.service().recoverPrevious(101)).state,'ReadbackVerified');assert.equal((await f.service().save(c)).state,'ReadbackVerified');assert.equal(f.tables.requests.length,1);assert.equal(f.tables.expenses.length,1);assert.equal(saved.tenantWriteAllowed,false);if(kind!=='none'){const opened=await f.service().openReceipt(101,id);assert.equal(opened.state,'ReceiptBytesVerified');assert.deepEqual(Buffer.from(opened.bytes),receipts[kind]);}});
test('compiled service and raw fake caller both deny unrelated ordinary actor',async()=>{const f=new IntegratedFixture();const saved=await f.service().save(input('pdf'));assert.equal(saved.state,'ReadbackVerified');assert.equal((await f.service(12).reopen(101,saved.record.line.id)).state,'Rejected');assert.equal((await f.service(12).openReceipt(101,saved.record.line.id)).state,'Unavailable');for(const list of ['requests','expenses','operations','results','audit']){const r=await f.caller(12).send({method:'GET',url:`${SITE}/_api/web/lists(guid'${bindings[list]}')/items(1000)`,headers:{},retry:'none'});assert.equal(r.status,403);}assert(f.rawDenied>=7);});
test('compiled form service retains Pending after flow interruption, same operation resolves after native re-drive',async()=>{const f=new IntegratedFixture();f.failAfter.add('Attach_Receipt');const c=input('png');assert.equal((await f.service().save(c)).state,'Pending');await f.run(501);assert.equal((await f.service().checkSave(c)).state,'ReadbackVerified');assert.equal(f.tables.requests.length,1);assert.equal(f.tables.expenses.length,1);});
test('compiled app reads native null rejected result after stale-parent flow rejection',async()=>{const f=new IntegratedFixture();f.bump(f.tables.claims[0]);for(const action of ['Rejected_Result_After','Existing_Rejected_Result'])f.hooks[action]=x=>{for(const r of x.tables.results)if(r.State==='Rejected')r.RecordJson=null;};const c=input('none');const r=await f.service().save(c);assert.equal(r.state,'Rejected',JSON.stringify({r,flow:f.flowRuns[0]?.errors}));assert.equal(f.tables.expenses.length,0);assert.equal(f.tables.results[0].RecordJson,null);assert.equal((await f.service().checkSave(c)).state,'Rejected');});
test('R7 compiled app and WDL preserve255 UTF16 units, receipt bytes and cold identity',async()=>{
  const f=new IntegratedFixture(),c=input('pdf');c.supplier='\u{1f600}'.repeat(127)+'x';c.description='e\u0301'.repeat(127)+'x';c.notes='n'.repeat(2000);
  const saved=await f.service().save(c);assert.equal(saved.state,'ReadbackVerified');
  assert.equal(saved.record.line.supplier,c.supplier);assert.equal(saved.record.line.description,c.description);
  assert.deepEqual(await f.service().reopen(101,saved.record.line.id),saved);
  assert.deepEqual(await f.service().recoverPrevious(101),saved);
  assert.deepEqual(Buffer.from((await f.service().openReceipt(101,saved.record.line.id)).bytes),receipts.pdf);
});
test('R7 compiled app rejects256 before request upload or native flow invocation',async()=>{
  for(const name of ['supplier','description']){const f=new IntegratedFixture(),c=input('png');c[name]='x'.repeat(256);
    assert.equal((await f.service().save(c)).state,'Rejected');assert.equal(f.tables.requests.length,0);assert.equal(f.flowRuns.length,0);assert.equal(f.writes.length,0);}
});

// Real public Fetch Response/streams and compiled browser transport; only the
// authenticated HTTP endpoint + cloud runtime remain the deterministic fixture.
// No cookie, digest, schema, ACL or native tenant acceptance is implied.
function browserService(f,actor=11,options={}){
  const calls=[],digests=[];
  const platform={currentUrl:()=>SITE+'/SitePages/Synthetic.aspx',webAbsoluteUrl:()=>SITE,
    fetchDigest:async web=>{digests.push(web);return 'synthetic-fixture-digest';},
    fetch:async(url,init)=>{
      calls.push({url,method:init.method});
      let raw;
      if(url===SITE+'/_api/web/currentuser?$select=Id,IsSiteAdmin')raw=f.response({url},200,{Id:actor,IsSiteAdmin:options.admin===true});
      else raw=await f.caller(actor).send({url,method:init.method,headers:init.headers,retry:'none',...(init.body?{body:new Uint8Array(init.body)}:{})});
      if(init.method==='POST'&&options.loseAcknowledgement){await raw.body.cancel();throw Error('PRIVATE_SYNTHETIC_LOST_ACK');}
      const r=new Response(raw.body,{status:raw.status,headers:raw.etag?{ETag:raw.etag}:{}});
      Object.defineProperty(r,'url',{value:new URL(raw.url).href});return r;
    }};
  const bound={requestRoot:bindings.requestRoot,requestListId:schema.lists.requests,expenseListId:schema.lists.expenses,
    readListIds:Object.entries(schema.lists).filter(([name])=>name!=='audit').map(([,id])=>id)};
  const channel=composeBrowserRequestChannel(platform,bound,schema);
  return {service:new ExpensePersistenceService(new RequestLedgerExpensePort(channel,digest),digest),calls,digests,channel};
}
for(const kind of ['none','jpg','png','pdf'])test(`native browser transport→emitted WDL→cold same ID/bytes: ${kind}`,async()=>{
  const f=new IntegratedFixture(),h=browserService(f),c=input(kind),saved=await h.service.save(c);
  assert.equal(saved.state,'ReadbackVerified',JSON.stringify({saved,calls:h.calls,runs:f.flowRuns.map(r=>r.errors)}));
  const cold=browserService(f);assert.deepEqual(await cold.service.reopen(101,saved.record.line.id),saved);
  assert.equal((await cold.service.recoverPrevious(101)).state,'ReadbackVerified');
  assert.deepEqual(await cold.service.save(c),saved);assert.equal(cold.calls.filter(c=>c.method==='POST').length,0);
  assert.equal(h.calls.filter(c=>c.method==='POST').length,1);assert.deepEqual(h.digests,[SITE]);
  assert.equal(f.tables.requests.length,1);assert.equal(f.tables.expenses.length,1);assert.equal(saved.tenantWriteAllowed,false);
  if(kind!=='none')assert.deepEqual(Buffer.from((await cold.service.openReceipt(101,saved.record.line.id)).bytes),receipts[kind]);
});
test('native browser transport unrelated identity cannot reopen fixture or raw receipt',async()=>{
  const f=new IntegratedFixture(),saved=await browserService(f).service.save(input('pdf'));assert.equal(saved.state,'ReadbackVerified');
  const other=browserService(f,12);assert.equal((await other.service.reopen(101,saved.record.line.id)).state,'Rejected');
  assert.equal((await other.service.openReceipt(101,saved.record.line.id)).state,'Unavailable');
  assert.equal(other.calls.filter(c=>c.method==='POST').length,0);assert.equal(other.digests.length,0);assert(f.rawDenied>=2);
});
test('native browser transport admin cannot obtain digest or upload synthetic request',async()=>{
  const f=new IntegratedFixture(),h=browserService(f,11,{admin:true});assert.equal((await h.service.save(input('jpg'))).state,'Pending');
  assert.equal(h.digests.length,0);assert.equal(h.calls.filter(c=>c.method==='POST').length,0);assert.equal(f.tables.requests.length,0);assert.equal(f.flowRuns.length,0);
});
test('native lost upload acknowledgement reconciles by immutable ledger without another POST',async()=>{
  const f=new IntegratedFixture(),h=browserService(f,11,{loseAcknowledgement:true}),saved=await h.service.save(input('png'));
  assert.equal(saved.state,'ReadbackVerified');assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.requests.length,1);
  assert.equal((await browserService(f).service.reopen(101,saved.record.line.id)).state,'ReadbackVerified');
});
test('native interrupted processor stays Pending until same sealed request is redriven',async()=>{
  const f=new IntegratedFixture();f.failAfter.add('Attach_Receipt');const h=browserService(f),c=input('pdf');
  assert.equal((await h.service.save(c)).state,'Pending');assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
  await f.run(501);assert.equal((await h.service.checkSave(c)).state,'ReadbackVerified');
  assert.equal(h.calls.filter(c=>c.method==='POST').length,1);assert.equal(f.tables.requests.length,1);assert.equal(f.tables.expenses.length,1);
});

for(const kind of ['none','jpg','png','pdf'])test(`cold context sees uploaded request before WDL starts, then same ID/bytes: ${kind}`,async()=>{
  const f=new IntegratedFixture(),h=browserService(f),initial=await h.channel.readEntryContext(101,11);
  assert.equal(initial.state,'Ready');assert.equal(initial.context.creationClearance,'Clear');
  f.deferProcessor=true;const c=input(kind);assert.equal((await h.service.save(c)).state,'Pending');
  assert.equal(f.flowRuns.length,0);assert.equal(f.tables.operations.length,0);assert.equal(f.tables.requests.length,1);
  const cold=browserService(f),pending=await cold.channel.readEntryContext(101,11);
  assert.equal(pending.state,'Ready');assert.equal(pending.context.creationClearance,'Unresolved');
  assert.equal((await cold.service.recoverPrevious(101)).state,'Pending');assert.equal(cold.calls.filter(x=>x.method==='POST').length,0);
  await f.run(501);const saved=await cold.service.recoverPrevious(101);assert.equal(saved.state,'ReadbackVerified');
  const next=browserService(f),after=await next.channel.readEntryContext(101,11);
  assert.equal(after.state,'Ready');assert.equal(after.context.creationClearance,'Clear');assert.deepEqual(after.context.existingExpenseIds,[saved.record.line.id]);
  assert.deepEqual(await next.service.reopen(101,saved.record.line.id),saved);
  if(kind!=='none')assert.deepEqual(Buffer.from((await next.service.openReceipt(101,saved.record.line.id)).bytes),receipts[kind]);
  assert.equal(f.tables.requests.length,1);assert.equal(f.tables.expenses.length,1);
  assert.equal((await browserService(f,12).channel.readEntryContext(101,11)).state,'Held');
});
test('native cold context cannot return an old success over a new unallocated request',async()=>{
  const f=new IntegratedFixture(),h=browserService(f);assert.equal((await h.service.save(input('png'))).state,'ReadbackVerified');
  const admitted=await h.channel.readEntryContext(101,11);assert.equal(admitted.state,'Ready');
  const c={...input('pdf'),operationId:'test-operation-second-0002',parentEtag:admitted.context.parentEtag};
  f.deferProcessor=true;assert.equal((await h.service.save(c)).state,'Pending');
  const cold=browserService(f),context=await cold.channel.readEntryContext(101,11);
  assert.equal(context.state,'Ready');assert.equal(context.context.creationClearance,'Unresolved');
  assert.equal(context.context.existingExpenseIds.length,1);assert.equal((await cold.service.recoverPrevious(101)).state,'Pending');
  assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.requests.length,2);assert.equal(cold.calls.filter(x=>x.method==='POST').length,0);
});

test('native rejected later operation cannot cold-recover an older success but explicit ID remains readable',async()=>{
  const f=new IntegratedFixture(),h=browserService(f),first=await h.service.save(input('pdf'));
  assert.equal(first.state,'ReadbackVerified');const context=await h.channel.readEntryContext(101,11);
  assert.equal(context.state,'Ready');const next={...input('none'),operationId:'test-rejected-second-0002',parentEtag:context.context.parentEtag};
  f.failAfter.add('Create_Operation');assert.equal((await h.service.save(next)).state,'Pending');
  f.bump(f.tables.claims[0]);await f.run(502);
  assert.deepEqual(f.tables.operations.map(r=>r.State).sort(),['Completed','Rejected']);
  const cold=browserService(f),admission=await cold.channel.readEntryContext(101,11);
  assert.equal(admission.state,'Ready');assert.equal(admission.context.creationClearance,'Unresolved');
  assert.equal((await cold.service.recoverPrevious(101)).state,'Pending');
  assert.deepEqual(await cold.service.reopen(101,first.record.line.id),first);
  assert.deepEqual(Buffer.from((await cold.service.openReceipt(101,first.record.line.id)).bytes),receipts.pdf);
  assert.equal(f.tables.requests.length,2);assert.equal(f.tables.expenses.length,1);assert.equal(cold.calls.filter(x=>x.method==='POST').length,0);
});
