'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FakeSharePoint,command}=require('./fake-sharepoint.cjs');
const {buildFlow}=require('./build-flow.cjs');
for(const kind of ['none','jpg','png','pdf'])test(`R6 native read-only OriginatorId: ${kind} completes using dedicated D01ActorId`,async()=>{
  const f=new FakeSharePoint(command(kind));f.flags.nativeSystemFields=true;
  const result=await f.run();assert.equal(result.outputs.Storage_Verified?.state,'StorageVerified',JSON.stringify(result.errors));
  for(const name of ['operations','results','audit'])assert.equal(f.tables[name][0].D01ActorId,11);
  const writes=f.writes.length;assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,writes);
});
test('R6 emitted connector bodies/selects/filters never use system OriginatorId',()=>{
  assert(!/\bOriginatorId\b/.test(JSON.stringify(buildFlow())));
});
for(const list of ['operations','results','audit'])test(`R6 ${list} dedicated actor metadata must be writable Number before writes`,async()=>{
  const f=new FakeSharePoint();f.flags.badActorField=list;
  const r=await f.run();assert.notEqual(r.outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,0);
});
for(const change of ['missing','readOnly','unique','optional','paged','duplicate'])test(`R6 incomplete/unsafe actor field contract ${change} is held before writes`,async()=>{
  const f=new FakeSharePoint(),transport=f.transport.bind(f);
  f.transport=async(input,name)=>{const r=await transport(input,name);if(name==='Key_operations'){
    const actor=r.body.value[1];
    if(change==='missing')actor.InternalName='OriginatorId';
    if(change==='readOnly')actor.ReadOnlyField=true;
    if(change==='unique')actor.EnforceUniqueValues=true;
    if(change==='optional')actor.Required=false;
    if(change==='paged')r.body['@odata.nextLink']='unread';
    if(change==='duplicate')r.body.value=[actor,actor];
  }return r;};
  assert.notEqual((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,0);
});
test('R6 field response order does not change exact metadata validation',async()=>{
  const f=new FakeSharePoint(),transport=f.transport.bind(f);
  f.transport=async(input,name)=>{const r=await transport(input,name);if(/^Key_/.test(name))r.body.value.reverse();return r;};
  assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');
});
for(const list of ['operations','results','audit'])test(`R6 ${list} native system lookup cannot substitute for tampered dedicated actor`,async()=>{
  const f=new FakeSharePoint();assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');
  for(const name of ['operations','results','audit'])f.tables[name][0].OriginatorId=11;
  f.tables[list][0].D01ActorId=12;const writes=f.writes.length;
  assert.notEqual((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,writes);
});
