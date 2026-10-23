'use strict';
// Actual TS processor/store + deterministic fake Standard SharePoint transport.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {ScopedTenant,storeSchema,policy,receipts,command}=require('./actor-scoped-fixture.cjs');
const lib=process.env.KCF_ACTOR_SCOPE_LIB||path.resolve(__dirname,'../lib-commonjs');
const {ActorScopedProcessorIO,processActorScopedExpense}=require(path.join(lib,'processor/ActorScopedProcessor'));
const {StandardStoreIO}=require(path.join(lib,'processor/StandardStoreTransport'));
ScopedTenant.prototype.io=function(){return new StandardStoreIO({send:this.send.bind(this)});};
ScopedTenant.prototype.runScoped=function(id=501){return processActorScopedExpense(this.io(),this.schemas,this.p,id);};
test('actual scoped processor saves PDF directly in private folders; duplicate cold session retains same ID/bytes',async()=>{
  const f=new ScopedTenant(),saved=await f.runScoped();assert.equal(saved.state,'StorageVerified',JSON.stringify({saved,calls:f.boundaryCalls.slice(-3)}));
  assert.equal(saved.tenantWriteAllowed,false);assert.deepEqual(Buffer.from(await ActorScopedProcessorIO.open(f.io(),f.schemas,f.p,501).then(io=>io.store().readReceipt(saved.record))),receipts.pdf);
  const count=f.creates.length;assert.deepEqual(await f.runScoped(),saved);assert.equal(f.creates.length,count);assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.claims[0].ExpenseTotal,22.34);
  assert(f.creates.every(c=>c.n==='audit'?c.folder===f.p.roots.audit:c.folder.endsWith('/11')));
  assert(!f.boundaryCalls.some(c=>c.method==='POST'&&/\/items(?:\?|$)/.test(c.url)));
});
test('same shared bindings process two ordinary employees with reciprocal fake raw denial and separate identical operation text',async()=>{
  const f=new ScopedTenant(),b=f.add(12,'jpg'),a=await f.runScoped(),other=await f.runScoped(b);assert.equal(a.state,'StorageVerified');assert.equal(other.state,'StorageVerified');assert.notEqual(a.record.line.id,other.record.line.id);
  for(const [actor,result,request]of[[11,a,501],[12,other,b]]){
    assert.equal(f.rawGet(actor,'expenses',result.record.line.id).status,200);assert.equal(f.rawGet(actor===11?12:11,'expenses',result.record.line.id).status,403);
    assert.equal(f.rawGet(actor===11?12:11,'expenses',result.record.line.id,true).status,403);assert.equal(f.rawGet(actor===11?12:11,'requests',request).status,403);
    const key=actor+':test-operation-0001';for(const n of['operations','results']){const row=f.tables[n].find(r=>r.OperationKey===key);assert(row);assert.equal(f.rawGet(actor,n,row.Id).status,200);assert.equal(f.rawGet(actor===11?12:11,n,row.Id).status,403);}
    assert.equal((await f.runScoped(request)).record.line.id,result.record.line.id);
  }
});
for(const [flag,n]of[['rootInherits','claims'],['foldersDisabled','expenses'],['rootMismatch','requests'],['extraRootRole','operations'],['extraFolderRole','results'],['changedFolderMask','expenses'],['aclPaged','people'],['folderSubstitution','requests'],['folderInherits','requests']])test(`unqualified ${flag}/${n} never returns verified`,async()=>{
  const f=new ScopedTenant();f.scopeFlags[flag]=n;const r=await f.runScoped();assert.notEqual(r.state,'StorageVerified');assert.equal(f.tables.expenses.length,0);
});
test('missing and duplicate protected roster or forged active flag refuse all writes',async()=>{
  for(const mutation of[f=>f.tables.people.splice(0,1),f=>f.tables.people.push({...f.tables.people[0],Id:25}),f=>f.tables.people[0].D01Active=1,f=>delete f.tables.people[0].D01PrivateScopes]){
    const f=new ScopedTenant();mutation(f);assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.writes.length,0);
  }
});
test('missing registry/configuration never falls back to root-level legacy writes',async()=>{
  for(const mutate of[f=>delete f.p.registryField,f=>delete f.p.fields.expenses,f=>f.p.processorRoles.expenses.low=String(33554432+7),f=>f.p.rootAcl.expenses.push({id:77,type:1,roles:[f.p.employeeRead]})]){
    const f=new ScopedTenant();mutate(f);assert.equal((await f.runScoped()).state,'Held');assert.equal(f.writes.length,0);
  }
});
for(const kind of['none','jpg','png'])test(`existing processor preserves ${kind} receipt/reason through cold scoped reopen`,async()=>{
  const f=new ScopedTenant();f.tables.requests=[];f.files.clear();f.put(501,command(kind),11);const saved=await f.runScoped();assert.equal(saved.state,'StorageVerified');
  const cold=await ActorScopedProcessorIO.open(f.io(),f.schemas,f.p,501),again=await cold.store().readLine(saved.record.line.id);assert.deepEqual(again,saved.record);
  if(kind==='none')assert.equal(again.receipt.reason,'Synthetic missing receipt explanation');else assert.deepEqual(Buffer.from(await cold.store().readReceipt(again)),receipts[kind]);
});
for(const n of['operations','expenses','results','audit'])test(`lost ${n} create acknowledgement resumes without second item`,async()=>{
  const f=new ScopedTenant();f.scopeFlags.lostAck=n;assert.notEqual((await f.runScoped()).state,'StorageVerified');const result=await f.runScoped();assert.equal(result.state,'StorageVerified');assert.equal(f.tables[n].length,1);assert.equal(f.tables.expenses.length,1);
});
for(const flag of['fieldError','misleadingId','rootCreated'])test(`HTTP200 with ${flag} is not verified`,async()=>{
  const f=new ScopedTenant();f.scopeFlags[flag]='expenses';assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.results.length,0);
});
test('ordinary admin and processor identity are not accepted as the request actor',async()=>{
  for(const actor of[11,99]){const f=new ScopedTenant();if(actor===11)f.scopeFlags.actorAdmin=11;else f.tables.requests[0].AuthorId=99;assert.equal((await f.runScoped()).state,'Held');assert.equal(f.writes.length,0);}
});
test('completed historical replay does not select a new Draft or require closed claim to become editable',async()=>{
  const f=new ScopedTenant(),saved=await f.runScoped();assert.equal(saved.state,'StorageVerified');f.tables.claims[0].SubmissionStatus='Submitted';f.tables.months[0].MonthStatus='Closed';const count=f.creates.length;assert.deepEqual(await f.runScoped(),saved);assert.equal(f.creates.length,count);
});

test('third newly approved employee uses identical shared bindings without a per-person build',async()=>{
  const f=new ScopedTenant(),request=f.add(13,'png');const saved=await f.runScoped(request);assert.equal(saved.state,'StorageVerified');assert.equal(saved.record.line.parentId,103);assert(f.creates.filter(c=>c.n!=='audit').every(c=>c.folder.endsWith('/13')));
});
test('a returned request from another native Author or wrong parent is refused before any write',async()=>{
  for(const mutate of[f=>f.tables.requests[0].AuthorId=12,f=>{const row=f.tables.requests[0];const p=JSON.parse(f.files.get(row.File.ServerRelativeUrl));p.command.parentId=102;const bytes=Buffer.from(JSON.stringify(p));f.files.set(row.File.ServerRelativeUrl,bytes);row.File.Length=String(bytes.length);}]){
    const f=new ScopedTenant();mutate(f);assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.writes.length,0);
  }
});
test('permissions changed after expense creation prevent attachment/terminal success without creating a replacement',async()=>{
  const f=new ScopedTenant();f.scopeHooks.before=(x,plan)=>{if(x.creates.some(c=>c.n==='expenses'))x.scopeFlags.extraFolderRole='expenses';};
  assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.tables.expenses.length,1);assert.equal(f.attachments.size,0);assert.equal(f.tables.results.length,0);
  delete f.scopeHooks.before;delete f.scopeFlags.extraFolderRole;assert.equal((await f.runScoped()).state,'StorageVerified');assert.equal(f.tables.expenses.length,1);
});
test('registry changed after ledger creation is unresolved and never grants another folder',async()=>{
  const f=new ScopedTenant();let changed=false;f.scopeHooks.before=(x)=>{if(!changed&&x.creates.some(c=>c.n==='operations')){changed=true;const r=x.tables.people[0],map=JSON.parse(r.D01PrivateScopes);map.expenses.uniqueId='b9dd02e1-ad9a-4129-a4f4-253428358848';r.D01PrivateScopes=JSON.stringify(map);}};
  assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.tables.expenses.length,0);assert.equal(f.tables.results.length,0);
});
test('inert policy is copied: later caller mutation neither enables a root fallback nor changes the private destination',async()=>{
  const f=new ScopedTenant(),scoped=await ActorScopedProcessorIO.open(f.io(),f.schemas,f.p,501);f.p.processorId=11;f.p.roots.expenses='/sites/REVIEW-TEST-SITE/Lists/another';
  // Existing capability rejects changed native scope instead of accepting a
  // mutable caller policy. It never falls back to old root-level publication.
  await assert.rejects(()=>scoped.store().findLine('11:test-operation-0001'));assert.equal(f.writes.length,0);
});
for(const n of['operations','results','audit','expenses'])test(`native unique ${n} index required before any write`,async()=>{
  const f=new ScopedTenant();f.scopeFlags.indexRemoved=n;assert.equal((await f.runScoped()).state,'Held');assert.equal(f.writes.length,0);
});
test('a required native Category is held without synthesising a field/default',async()=>{
  const f=new ScopedTenant();f.scopeFlags.categoryRequired=true;assert.equal((await f.runScoped()).state,'Held');assert.equal(f.writes.length,0);
});
for(const n of['operations','expenses','results','audit'])test(`cold ${n} recovery requires genuine processor Author`,async()=>{
  const f=new ScopedTenant();assert.equal((await f.runScoped()).state,'StorageVerified');f.tables[n][0].AuthorId=88;
  assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.tables.expenses.length,1);
});
test('lost expense acknowledgement with substituted native Author is unresolved, never recovery success',async()=>{
  const f=new ScopedTenant();f.scopeFlags.lostAck='expenses';assert.equal((await f.runScoped()).state,'Pending');f.tables.expenses[0].AuthorId=88;
  assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.tables.expenses.length,1);
});
test('final expense child sharing change after ledger completion and parent release is not verified',async()=>{
  const f=new ScopedTenant();f.scopeHooks.before=x=>{if(x.tables.operations[0]?.State==='Completed'&&x.tables.claims[0].D01Reservation==='')x.tables.expenses[0].HasUniqueRoleAssignments=true;};
  assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.tables.expenses.length,1);
});
for(const where of['root','folder'])test(`expanded ${where} ACL continuation is not silently accepted`,async()=>{
  const f=new ScopedTenant(),send=f.send.bind(f);f.send=async plan=>{const r=await send(plan);if(plan.url.includes('/roleassignments')&&(where==='folder')===plan.url.includes('/items(')){
    const b=JSON.parse(await new Response(r.body).text());b.value[0]['RoleDefinitionBindings@odata.nextLink']='blocked';return f.response(plan,200,b);
  }return r;};
  assert.equal((await f.runScoped()).state,'Held');assert.equal(f.writes.length,0);
});
test('simultaneous A/B same operation token preserves each native returned ID and separate parent/bytes',async()=>{
  const f=new ScopedTenant(),b=f.add(12,'jpg'),[a,other]=await Promise.all([f.runScoped(),f.runScoped(b)]);
  assert.equal(a.state,'StorageVerified');assert.equal(other.state,'StorageVerified');assert.notEqual(a.record.line.id,other.record.line.id);
  assert.equal(f.tables.expenses.length,2);assert.equal(f.tables.operations.length,2);
  assert.equal(f.rawGet(11,'expenses',other.record.line.id).status,403);assert.equal(f.rawGet(12,'expenses',a.record.line.id).status,403);
  assert.deepEqual(Buffer.from(await ActorScopedProcessorIO.open(f.io(),f.schemas,f.p,501).then(io=>io.store().readReceipt(a.record))),receipts.pdf);
  assert.deepEqual(Buffer.from(await ActorScopedProcessorIO.open(f.io(),f.schemas,f.p,b).then(io=>io.store().readReceipt(other.record))),receipts.jpg);
});
test('cold audit requires native Created stamp as well as processor Author and exact event linkage',async()=>{
  const f=new ScopedTenant();assert.equal((await f.runScoped()).state,'StorageVerified');f.tables.audit[0].Created='not-a-native-timestamp';assert.notEqual((await f.runScoped()).state,'StorageVerified');assert.equal(f.tables.expenses.length,1);
});
test('rejected operation cold replay rechecks result child Author and never creates a financial line',async()=>{
  const f=new ScopedTenant();f.scopeFlags.lostAck='operations';assert.equal((await f.runScoped()).state,'Pending');f.bump(f.tables.claims[0]);
  assert.equal((await f.runScoped()).state,'Rejected');assert.equal(f.tables.expenses.length,0);f.tables.results[0].AuthorId=88;
  assert.notEqual((await f.runScoped()).state,'Rejected');assert.equal(f.tables.expenses.length,0);
});
test('fake raw privacy evaluates the same inherited ACL masks, not business actor values or an unconditional denial',async()=>{
  const f=new ScopedTenant(),saved=await f.runScoped();assert.equal(saved.state,'StorageVerified');const row=f.tables.expenses[0];
  assert.equal(f.rawGet(11,'expenses',row.Id).status,200);assert.equal(f.rawGet(12,'expenses',row.Id).status,403);assert.equal(f.rawGet(88,'expenses',row.Id).status,403);assert.equal(f.rawGet(98,'expenses',row.Id).status,200,'qualified recovery group retains access');
  row.D01Originator=12;assert.equal(f.rawGet(12,'expenses',row.Id).status,403);assert.equal(f.rawGet(11,'expenses',row.Id).status,200);row.D01Originator=11;
  f.scopeFlags.extraFolderRole='expenses';assert.equal(f.rawGet(88,'expenses',row.Id).status,200,'bad actual Read grant must expose the fake row rather than fake a denial');
  assert.notEqual((await f.runScoped()).state,'StorageVerified');
  delete f.scopeFlags.extraFolderRole;row.HasUniqueRoleAssignments=true;assert.equal(f.rawGet(11,'expenses',row.Id).status,403,'unqualified unique scope has no invented inherited grant');
  f.uniqueItemAcl.set('expenses:'+row.Id,[{id:12,type:1,roles:[f.nativePolicy.employeeRead]}]);
  assert.equal(f.rawGet(12,'expenses',row.Id).status,200);assert.notEqual((await f.runScoped()).state,'StorageVerified');
});

test('private-root audit inherits its physical root ACL, never an invented claimant folder',async()=>{
  const f=new ScopedTenant();assert.equal((await f.runScoped()).state,'StorageVerified');const row=f.tables.audit[0];
  assert.equal(row.FileDirRef,f.p.roots.audit);assert.equal(f.rawGet(11,'audit',row.Id).status,403);assert.equal(f.rawGet(88,'audit',row.Id).status,403);
  assert.equal(f.rawGet(98,'audit',row.Id).status,200);assert.equal(f.rawGet(99,'audit',row.Id).status,200);
});
test('an extra actual private-root Read grant is visible to fake raw access and blocks verified replay',async()=>{
  const f=new ScopedTenant();assert.equal((await f.runScoped()).state,'StorageVerified');const id=f.tables.audit[0].Id;
  f.scopeFlags.extraRootRole='audit';assert.equal(f.rawGet(88,'audit',id).status,200);assert.notEqual((await f.runScoped()).state,'StorageVerified');
});
module.exports={ScopedTenant,storeSchema,policy};
