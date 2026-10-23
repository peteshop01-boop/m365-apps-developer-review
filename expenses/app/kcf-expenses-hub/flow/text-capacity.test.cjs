'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {FakeSharePoint,command}=require('./fake-sharepoint.cjs');
const {buildFlow}=require('./build-flow.cjs');
const {Harness}=require('./wdl-harness.cjs');
for(const name of ['supplier','description'])test(`R7 native ${name} over255 holds before any write`,async()=>{
  const c=command('pdf');c.command[name]='x'.repeat(256);const f=new FakeSharePoint(c);
  assert.notEqual((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,0);
});
for(const [label,value,accepted] of [
  ['ASCII255','x'.repeat(255),true],['ASCII256','x'.repeat(256),false],
  ['supplementary255','\u{1f600}'.repeat(127)+'x',true],['supplementary256','\u{1f600}'.repeat(128),false],
  ['combining255','e\u0301'.repeat(127)+'x',true],['combining256','e\u0301'.repeat(128),false]
])test(`R7 WDL ${label}: preserve exact text and long reason/notes or zero writes`,async()=>{
  const c=command();Object.assign(c.command,{supplier:value,description:value,notes:'n'.repeat(2000)});c.command.receipt.reason='r'.repeat(2000);
  const f=new FakeSharePoint(c),r=await f.run();
  if(accepted){assert.equal(r.outputs.Storage_Verified?.state,'StorageVerified',JSON.stringify(r.errors));
    assert.equal(f.tables.expenses[0].Supplier,value);assert.equal(f.tables.expenses[0].ExpenseDescription,value);
    assert.equal(f.tables.expenses[0].ClaimantNotes,c.command.notes);assert.equal(f.tables.expenses[0].D01NoReceiptReason,c.command.receipt.reason);
    const writes=f.writes.length;assert.equal((await f.run()).outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,writes);
  }else{assert.notEqual(r.outputs.Storage_Verified?.state,'StorageVerified');assert.equal(f.writes.length,0);}
});
test('R7 explicit server guard rejects256 even if JSON Schema uses a different counting unit',async()=>{
  const c=command('jpg');c.command.supplier='\u{1f600}'.repeat(128);const f=new FakeSharePoint(c);
  const flow=buildFlow();function loosen(actions){for(const a of Object.values(actions)){if(a.type==='ParseJson' && a.inputs.schema?.properties?.command){a.inputs.schema.properties.command.properties.supplier.maxLength=2000;}if(a.actions)loosen(a.actions);if(a.else?.actions)loosen(a.else.actions);}}loosen(flow.properties.definition.actions);
  const h=new Harness(flow,f.bindings,f.transport.bind(f));const r=await h.run({ID:501});
  assert.notEqual(r.outputs.Storage_Verified?.state,'StorageVerified');assert(h.visited.includes('Valid_Date_And_Text'));assert.equal(f.writes.length,0);
});
