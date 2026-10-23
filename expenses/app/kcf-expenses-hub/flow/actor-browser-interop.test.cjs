'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {ActorBrowserTenant}=require('./actor-browser-interop-fixture.cjs');
const {command,receipts}=require('./fake-sharepoint.cjs');
function input(kind,context){const c=command(kind).command;return {...c,parentId:context.parentId,parentEtag:context.parentEtag,
  receipt:kind==='none'?c.receipt:{kind:'file',fileName:c.receipt.fileName,mediaType:c.receipt.mediaType,bytes:new Uint8Array(receipts[kind])}};}
for(const [actor,kind]of [[11,'pdf'],[12,'jpg'],[13,'none'],[11,'png']])test(`real compiled caller→emitted actor writer→cold same-ID readback ${actor}/${kind}`,async()=>{
  const f=new ActorBrowserTenant(),h=f.browser(actor),entry=await h.entry.load();assert.equal(entry.state,'Ready');assert.equal(entry.context.creationClearance,'Clear');
  const c=input(kind,entry.context),saved=await h.service.save(c);
  assert.equal(saved.state,'ReadbackVerified',JSON.stringify({saved,runs:f.flowRuns.map(r=>({code:r.code,errors:r.errors})),calls:h.calls.slice(-5)}));
  const id=saved.record.line.id,cold=f.browser(actor),again=await cold.entry.load();assert.equal(again.state,'Ready');assert(again.context.existingExpenseIds.includes(id));
  assert.deepEqual(await cold.entry.reopen(id),saved);assert.deepEqual(await cold.service.save(c),saved);
  assert.equal(cold.calls.filter(c=>c.method==='POST').length,0);assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.requests.length,1);
  if(kind!=='none'){const opened=await cold.entry.openReceipt(id);assert.equal(opened.state,'ReceiptBytesVerified');assert.deepEqual(Buffer.from(opened.bytes),receipts[kind]);}
});
function draft(){const c=command('none').command;return {date:c.date,supplier:c.supplier,description:c.description,nominalCode:c.nominalCode,amount:c.amount,notes:c.notes,receipt:c.receipt};}
test('actual form adapter duplicate clicks create one request/line and cold reopen the same reason',async()=>{
  const f=new ActorBrowserTenant(),h=f.browser(11),d=draft(),before=structuredClone(d),a=h.entry.save(d),b=h.entry.save(d);
  assert.equal(a,b);const saved=await a;assert.equal(saved.state,'ReadbackVerified');assert.deepEqual(d,before);
  assert.equal(f.tables.requests.length,1);assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.claims[0].ExpenseTotal,22.34);
  const cold=f.browser(11);assert.deepEqual(await cold.entry.reopen(saved.record.line.id),saved);assert.equal(cold.calls.filter(c=>c.method==='POST').length,0);
});
test('invalid reason keeps the entered form correctable without upload or attempt',async()=>{
  const f=new ActorBrowserTenant(),h=f.browser(11),d=draft();d.receipt={kind:'none',reason:'  '};const before=structuredClone(d);
  assert.equal((await h.entry.save(d)).state,'Rejected');assert.deepEqual(d,before);assert.equal(h.entry.hasAttempt,false);assert.equal(f.tables.requests.length,0);
  assert.equal((await h.entry.save({...d,receipt:draft().receipt})).state,'ReadbackVerified');assert.equal(f.tables.requests.length,1);
});
test('pending form stays on one immutable operation, then fresh app recovers same server record',async()=>{
  const f=new ActorBrowserTenant();f.deferProcessor=true;const h=f.browser(11),d=draft();
  assert.equal((await h.entry.save(d)).state,'Pending');const op=h.entry.currentOperationId;assert(op);assert.equal(h.entry.hasAttempt,true);
  assert.equal((await h.entry.save({...d,supplier:'Must not replace submitted supplier'})).state,'Pending');assert.equal(h.entry.currentOperationId,op);
  assert.equal(f.tables.requests.length,1);assert.equal(f.flowRuns.length,0);
  assert.equal((await f.runWriter(501)).state,'Succeeded');const saved=await h.entry.checkSave();assert.equal(saved.state,'ReadbackVerified');assert.equal(saved.record.line.supplier,d.supplier);
  const cold=f.browser(11);assert.deepEqual(await cold.entry.checkPreviousSave(),saved);assert.deepEqual(await cold.entry.reopen(saved.record.line.id),saved);
  assert.equal(f.tables.expenses.length,1);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
});
test('lost upload acknowledgement reconciles server proof without resending',async()=>{
  const f=new ActorBrowserTenant(),h=f.browser(12,{loseAcknowledgement:true}),entry=await h.entry.load(),c=input('png',entry.context);
  const saved=await h.service.save(c);assert.equal(saved.state,'ReadbackVerified');assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
  assert.equal(f.tables.requests.length,1);assert.equal(f.tables.expenses.length,1);assert.deepEqual(await f.browser(12).service.reopen(102,saved.record.line.id),saved);
});
test('two employees share one writer but reciprocal raw expense/file/request/result reads are denied by the ACL model',async()=>{
  const f=new ActorBrowserTenant(),saved=[];
  for(const [actor,kind]of [[11,'pdf'],[12,'jpg']]){
    const h=f.browser(actor),entry=await h.entry.load(),c=input(kind,entry.context),r=await h.service.save(c);assert.equal(r.state,'ReadbackVerified');saved.push({actor,kind,r});
    const cold=f.browser(actor);assert.deepEqual(await cold.entry.reopen(r.record.line.id),r);assert.deepEqual(Buffer.from((await cold.entry.openReceipt(r.record.line.id)).bytes),receipts[kind]);
  }
  assert.notEqual(saved[0].r.record.line.id,saved[1].r.record.line.id);assert.equal(f.tables.expenses.length,2);
  for(const {actor,kind,r}of saved){
    const other=actor===11?12:11,request=f.tables.requests.find(v=>v.AuthorId===actor),result=f.tables.results.find(v=>v.D01ActorId===actor);
    const root=name=>require('./build-flow.cjs').SITE+"/_api/web/lists(guid'"+f.schemas.lists[name]+"')/items";
    for(const url of [root('expenses')+'('+r.record.line.id+')',root('expenses')+'('+r.record.line.id+")/AttachmentFiles/getByFileName('receipt."+kind+"')/$value",root('requests')+'('+request.Id+')',root('requests')+'('+request.Id+')/File/$value',root('results')+'('+result.Id+')']){
      const denied=await f.caller({url,method:'GET',headers:{}},other);assert.equal(denied.status,403);await denied.body.cancel();
    }
    const wrong=f.browser(other);assert.equal((await wrong.service.reopen(90+actor,r.record.line.id)).state,'Rejected');
    assert.equal((await wrong.service.openReceipt(90+actor,r.record.line.id)).state,'Unavailable');
  }
});
test('QA-BROWSER-INTEROP-001 failed create cannot normalise a pre-existing unrelated row',async()=>{
  const f=new ActorBrowserTenant(),row={Id:7001,ExpenseDate:'2026-09-30',D01OperationKey:'12:unrelated-operation-0001'};
  f.tables.expenses.push(row);const before=structuredClone(row);
  const url=require('./build-flow.cjs').SITE+"/_api/web/lists(guid'"+f.schemas.lists.expenses+"')/AddValidateUpdateItemUsingPath";
  await assert.rejects(()=>f.send({method:'POST',url,headers:{},body:{}}));
  assert.deepEqual(row,before);assert.equal(f.creates.length,0);assert.equal(f.writes.length,0);
});
test('committed expense with lost ACK keeps native-model date and reconciles exact bytes once',async()=>{
  const f=new ActorBrowserTenant();f.scopeFlags.lostAck='expenses';const h=f.browser(11),entry=await h.entry.load(),c=input('pdf',entry.context);
  assert.equal((await h.service.save(c)).state,'Pending');assert.equal(f.tables.expenses.length,1);assert.equal(f.tables.expenses[0].ExpenseDate,'2026-10-21T00:00:00Z');
  assert.equal((await f.runWriter(501)).state,'Succeeded');const saved=await h.service.checkSave(c);assert.equal(saved.state,'ReadbackVerified');
  assert.deepEqual(Buffer.from((await f.browser(11).service.openReceipt(101,saved.record.line.id)).bytes),receipts.pdf);
  assert.equal(f.tables.expenses.length,1);assert.equal(h.calls.filter(c=>c.method==='POST').length,1);
});
