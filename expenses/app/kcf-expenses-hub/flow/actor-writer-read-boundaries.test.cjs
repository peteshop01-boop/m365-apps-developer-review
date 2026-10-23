'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {buildActorProcessorFlow}=require('./actor-writer.cjs');
const {MachineTenant}=require('./actor-writer-machine-fixture.cjs');
const key=(name,phase)=>phase+'_'+crypto.createHash('sha256').update(name).digest('hex').slice(0,10);
function flatten(actions,out={}){for(const [name,a]of Object.entries(actions)){assert(!out[name],name);out[name]=a;if(a.actions)flatten(a.actions,out);if(a.else)flatten(a.else.actions,out);}return out;}
test('ordinary policy reads retain target proofs without duplicating global identity checks',()=>{
  const a=flatten(buildActorProcessorFlow().properties.definition.actions.Process.actions);
  for(const [name,resource]of [['Month','months'],['Nominals','nominals'],['Lines_Before','expenses']])for(const phase of ['Pre','Post']){
    const prefix=key(name,phase);
    assert.deepEqual(JSON.parse(a[prefix+'_Roots'].foreach.slice(7,-2)),[resource]);
    assert.equal(a[prefix+'_User'],undefined);assert.equal(a[prefix+'_Processor'],undefined);
    assert(a[prefix+'_Root_ACL_Complete']);
  }
});
test('all request content connector operations receive explicit full pre/post checkpoints',()=>{
  const a=flatten(buildActorProcessorFlow().properties.definition.actions.Process.actions);
  const bytes=Object.entries(a).filter(([,v])=>v.inputs?.host?.operationId==='GetFileContentByPath');
  assert(bytes.length>=4);
  for(const [name]of bytes)for(const phase of ['BytesPre','BytesPost']){
    const prefix=key(name,phase);
    assert(a[prefix+'_Same_Registry'],name+' '+phase);assert(a[prefix+'_Identity']);assert(a[prefix+'_Same_Processor']);
    assert.deepEqual(JSON.parse(a[prefix+'_Roots'].foreach.slice(7,-2)),['requests','people']);
  }
});
test('every financial mutation retains full fresh identity and registry checkpoints',()=>{
  const a=flatten(buildActorProcessorFlow().properties.definition.actions.Process.actions);
  const writes=Object.entries(a).filter(([,v])=>v.inputs?.host?.operationId==='HttpRequest'&&v.inputs.parameters['parameters/method']==='POST');
  assert.equal(writes.length,14);
  for(const [name]of writes)for(const phase of ['Pre','Post']){
    const prefix=key(name,phase);
    assert(a[prefix+'_Same_Registry'],name+' '+phase);assert(a[prefix+'_Identity']);assert(a[prefix+'_Same_Processor']);
  }
});
for(const [name,resource]of [['Month','months'],['Nominals','nominals']])test(`mid-read ${resource} sharing change refuses before any financial write`,async()=>{
  const f=new MachineTenant();f.writerHooks[name]=x=>{x.scopeFlags.extraRootRole=resource;};
  const r=await f.runWriter();assert.equal(r.outputs.Storage_Verified,undefined);assert.equal(f.writes.length,0);assert.equal(f.tables.expenses.length,0);
});
for(const fault of ['inactive','registry','processor'])test(`mid-policy-read ${fault} change cannot cross the next financial write`,async()=>{
  const f=new MachineTenant();f.writerHooks.Nominals=x=>{
    if(fault==='inactive')x.tables.people.find(p=>p.D01UserId===11).D01Active=false;
    if(fault==='registry')x.tables.people.find(p=>p.D01UserId===11).D01PrivateScopes='{}';
    if(fault==='processor')x.scopeFlags.processorId=98;
  };
  const r=await f.runWriter();assert.equal(r.outputs.Storage_Verified,undefined);assert.equal(f.writes.length,0);assert.equal(f.tables.expenses.length,0);
});
test('initial request byte read cannot run under a newly changed processor identity',async()=>{
  const f=new MachineTenant();f.writerHooks.Registry_Field=x=>{x.scopeFlags.processorId=98;};
  const r=await f.runWriter();assert.equal(r.outputs.Storage_Verified,undefined);assert.equal(f.writes.length,0);
  assert.equal(f.writerCalls.some(c=>c.name==='Incoming_Binary'),false);
});
