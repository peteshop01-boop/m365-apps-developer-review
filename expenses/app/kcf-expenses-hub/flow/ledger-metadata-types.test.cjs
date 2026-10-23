'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FakeSharePoint}=require('./fake-sharepoint.cjs');

// Native WDL equals(true,1) is true. Every independent metadata feed must pass
// an actual JSON type check before it can authorise the first storage write.
for(const list of ['operations','results','audit'])for(const [name,property]of [
  ['OperationKey','Required'],['OperationKey','EnforceUniqueValues'],['D01ActorId','Required']
])test(`R10 ${list} ${name}.${property}=1 cannot authorise any write`,async()=>{
  const f=new FakeSharePoint(),send=f.transport.bind(f);
  f.transport=async(input,action)=>{const r=await send(input,action);if(action==='Key_'+list)r.body.value.find(x=>x.InternalName===name)[property]=1;return r;};
  const r=await f.run();assert.notEqual(r.outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,0);
});
