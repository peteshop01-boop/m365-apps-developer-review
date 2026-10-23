'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FakeSharePoint,command}=require('./fake-sharepoint.cjs');
const held=r=>assert.notEqual(r.outputs.Storage_Verified?.state,'StorageVerified');

for(const active of [1,'true','1',null])test(`roster active must be native Boolean, not ${JSON.stringify(active)}`,async()=>{
  const f=new FakeSharePoint();f.tables.people[0].D01Active=active;
  held(await f.run());assert.equal(f.writes.length,0);
});
for(const active of [true,false])test(`ambiguous actor roster including ${active?'active':'inactive'} duplicate holds before writes`,async()=>{
  const f=new FakeSharePoint();f.tables.people.push({...f.tables.people[0],Id:22,D01Active:active});
  held(await f.run());assert.equal(f.writes.length,0);
});
for(const phase of ['Before_Create','Before_Attachment','Before_Commit'])test(`duplicate roster introduced at ${phase} cannot finish`,async()=>{
  const f=new FakeSharePoint(command('jpg'));
  f.hooks[phase+'_Person']=x=>{x.tables.people.push({...x.tables.people[0],Id:22});};
  held(await f.run());assert.equal(f.tables.results.length,0);assert.equal(f.tables.claims[0].OverallTotal,12);
  if(phase==='Before_Create')assert.equal(f.tables.expenses.length,0);
  if(phase==='Before_Attachment')assert.equal(f.attachments.size,0);
});
test('same existing processor still saves and reopens exact PDF with one authoritative roster row',async()=>{
  const f=new FakeSharePoint(command('pdf'));assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');
  const before=JSON.stringify(f.tables);assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');assert.equal(JSON.stringify(f.tables),before);
});
for(const phase of ['Initial','Before_Create','Before_Attachment','Before_Commit'])for(const fault of ['paged','empty','wrongId','wrongActor','inactive','numericActive'])test(`${phase} native roster ${fault} fails closed`,async()=>{
  const f=new FakeSharePoint(command('jpg')),send=f.transport.bind(f);
  f.transport=async(input,name)=>{const r=await send(input,name);if(name===phase+'_Roster'){
    if(fault==='paged')r.body['@odata.nextLink']='unread';
    if(fault==='empty')r.body.value=[];
    if(fault==='wrongId')r.body.value[0].Id=22;
    if(fault==='wrongActor')r.body.value[0].D01UserId=12;
    if(fault==='inactive')r.body.value[0].D01Active=false;
    if(fault==='numericActive')r.body.value[0].D01Active=1;
  }return r;};
  held(await f.run());assert.equal(f.tables.results.length,0);assert.equal(f.tables.claims[0].OverallTotal,12);
  if(phase==='Initial')assert.equal(f.writes.length,0);
});
for(const field of ['Id','D01UserId'])for(const value of ['11',true,0,2147483648])test(`native roster ${field} rejects ${JSON.stringify(value)}`,async()=>{
  const f=new FakeSharePoint(),send=f.transport.bind(f);
  f.transport=async(input,name)=>{const r=await send(input,name);if(name==='Initial_Roster')r.body.value[0][field]=value;return r;};
  held(await f.run());assert.equal(f.writes.length,0);
});
const lineFields=['ExpenseLineKey','ClaimSubmissionRefId','Supplier','ExpenseDescription','NominalCode','NominalDescription','GrossAmount','ClaimantNotes','ReceiptRequired','IsVoided','LineValidationStatus','D01Originator','D01RequestId','D01OperationKey','D01Fingerprint','D01NoReceiptReason','D01ReceiptManifest'];
for(const name of lineFields)test(`compacted line guard retains ${name} binding`,async()=>{
  const f=new FakeSharePoint(command('jpg'));assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');
  const row=f.tables.expenses[0],writes=f.writes.length;
  row[name]=typeof row[name]==='number'?row[name]+1:typeof row[name]==='boolean'?!row[name]:'tampered';
  held(await f.run());assert.equal(f.writes.length,writes);
});
test('unrelated roster identities neither select a different actor nor require per-person flow configuration',async()=>{
  const f=new FakeSharePoint();for(let i=12;i<40;i++)f.tables.people.push({Id:i+100,D01UserId:i,D01Active:true});
  assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');
  assert.equal(f.tables.operations[0].D01ActorId,11);
});
