'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FakeSharePoint,command}=require('./fake-sharepoint.cjs');
// Synthetic qualified field definitions only, never a claim about TEST102.
const fields=()=>[
  {InternalName:'ExpenseCategory',TypeAsString:'Text',Required:false,ReadOnlyField:false,Hidden:false,EnforceUniqueValues:false},
  ...[['D01NoReceiptReason','Note',false,false],['D01Originator','Number',true,false],['D01RequestId','Number',true,false],
    ['D01OperationKey','Text',true,true],['D01Fingerprint','Text',true,false],['D01ReceiptManifest','Note',false,false]]
    .map(([InternalName,TypeAsString,Required,EnforceUniqueValues])=>({InternalName,TypeAsString,Required,ReadOnlyField:false,Hidden:false,EnforceUniqueValues}))
];
function fixture(mutate,kind='none'){const f=new FakeSharePoint(command(kind)),send=f.transport.bind(f);f.transport=async(input,name)=>{
  const r=await send(input,name);if(name==='Expense_Field_Contract'){
    r.body={value:fields()};mutate(r.body);
    // Model the actual REST filter, which must not hide a required Category.
    if(new URL(input.parameters['parameters/uri'],'https://synthetic.invalid/').searchParams.get('$filter')==='Hidden eq false')r.body.value=r.body.value.filter(x=>x.Hidden===false);
  }return r;
};return f;}
const held=async f=>{const r=await f.run();assert.notEqual(r.outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,0);};
test('R8 required hidden Category is visible to preflight and holds with zero writes',async()=>held(fixture(b=>Object.assign(b.value[0],{Hidden:true,Required:true}))));
test('R8 Category unknown required metadata fails closed',async()=>held(fixture(b=>delete b.value[0].Required)));
for(const [name,type] of [['D01NoReceiptReason','Text'],['D01Originator','Lookup'],['D01RequestId','Text'],['D01OperationKey','Note'],['D01Fingerprint','Number'],['D01ReceiptManifest','Text']])
  test(`R8 wrong ${name} type ${type} is held before ledger creation`,async()=>held(fixture(b=>b.value.find(x=>x.InternalName===name).TypeAsString=type)));
for(const key of ['odata.nextLink','@odata.nextLink'])test(`R8 unread metadata page ${key} holds`,async()=>held(fixture(b=>b[key]='unread')));
test('R8 over-cap field feed holds without paging',async()=>held(fixture(b=>{while(b.value.length<201)b.value.push({InternalName:'Extra'+b.value.length,Required:false,Hidden:false});})));
test('R8 duplicate named field cannot be hidden by its invalid attributes',async()=>held(fixture(b=>b.value.push({...b.value[1],ReadOnlyField:true}))));
for(const name of ['D01Originator','D01RequestId','D01OperationKey','D01Fingerprint'])test(`R8 ${name} must be required`,async()=>held(fixture(b=>b.value.find(x=>x.InternalName===name).Required=false)));
for(const name of ['D01NoReceiptReason','D01ReceiptManifest'])test(`R8 ${name} must allow the other receipt branch`,async()=>held(fixture(b=>b.value.find(x=>x.InternalName===name).Required=true)));
test('R8 actor value must not be a unique column across expenses',async()=>held(fixture(b=>b.value.find(x=>x.InternalName==='D01Originator').EnforceUniqueValues=true)));
test('R8 optional Category and shuffled qualified fields permit the synthetic request',async()=>{
  const f=fixture(b=>b.value.reverse());assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');
});
test('R8 valid hidden custom fields and absent Category permit PDF branch',async()=>{
  const f=fixture(b=>{b.value=b.value.slice(1).map(x=>({...x,Hidden:true}));},'pdf');
  assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.attachments.size,1);
});
test('R8 complete200field boundary is accepted',async()=>{
  const f=fixture(b=>{while(b.value.length<200)b.value.push({InternalName:'Extra'+b.value.length,TypeAsString:'Text',Required:false,ReadOnlyField:false,Hidden:false,EnforceUniqueValues:false});});
  assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');
});
for(const required of [null,'false',0])test(`R8 malformed Category Required ${JSON.stringify(required)} holds`,async()=>held(fixture(b=>b.value[0].Required=required)));
test('R8 case variant of hidden required Category also holds',async()=>held(fixture(b=>Object.assign(b.value[0],{InternalName:'expensecategory',Hidden:true,Required:true}))));
test('R8 missing custom field holds',async()=>held(fixture(b=>b.value=b.value.filter(x=>x.InternalName!=='D01RequestId'))));
test('R8 read-only reason holds',async()=>held(fixture(b=>b.value.find(x=>x.InternalName==='D01NoReceiptReason').ReadOnlyField=true)));
test('R8 malformed/null field collection holds',async()=>held(fixture(b=>b.value=null)));
test('R8 captured21October TEST102 metadata remains HELD (offline replay, no tenant write)',async()=>{
  const actual=require('../../../docs/evidence/D01_NATIVE_FLOW_20261021/r8-captured-expense-fields.json');
  await held(fixture(b=>b.value=structuredClone(actual)));
});
