'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FakeSharePoint}=require('./fake-sharepoint.cjs');
const {evaluate,parse}=require('./wdl-harness.cjs');
test('R9 interpreter retains documented native equals(true,1) equivalence',()=>{
  assert.equal(evaluate(parse('@equals(true,1)'),{}),true);
});
for(const [name,property,value] of [
  ['D01Originator','Required',1],['D01RequestId','Required',1],['D01OperationKey','Required',1],['D01Fingerprint','Required',1],['D01OperationKey','EnforceUniqueValues',1],
  ['D01NoReceiptReason','Required',0],['D01NoReceiptReason','ReadOnlyField',0],['D01ReceiptManifest','EnforceUniqueValues',0],
  ['D01Fingerprint','Hidden',0]
])test(`R9 typed metadata rejects ${name}.${property}=${value} before any write`,async()=>{
  const f=new FakeSharePoint(),send=f.transport.bind(f);
  f.transport=async(input,action)=>{const r=await send(input,action);if(action==='Expense_Field_Contract')r.body.value.find(x=>x.InternalName===name)[property]=value;return r;};
  const r=await f.run();assert.notEqual(r.outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,0);
});
