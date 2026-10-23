'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildFlow,nativeWdl:n}=require('./build-flow.cjs');
const {lowerActorWriter,buildActorWriterMachine}=require('./actor-writer-machine.cjs');
const {Harness,validateGraph}=require('./wdl-harness.cjs');
function fixture(actions){const flow=buildFlow();flow.properties.definition.actions.Process.actions=actions;return lowerActorWriter(flow);}
test('actual complete writer fits unchanged native limits including every switch case',()=>{
  const compiled=buildActorWriterMachine(),actual=validateGraph(compiled.flow);
  assert.equal(actual.actions,489);assert.equal(actual.depth,8);assert(actual.maxExpression<=8192);
  assert.equal(compiled.instructions,1859);assert(compiled.instructions<=5000);
  const steps=compiled.flow.properties.definition.actions.Process.actions.D01Program.inputs;
  for(const [i,step]of steps.entries())for(const edge of ['next','yes','no'])if(step[edge]!==undefined)assert(step[edge]===-1||step[edge]<i);
  assert.equal(compiled.flow.properties.definition.parameters.Bindings.defaultValue.fixtureActorId,undefined);
});
test('shared native action captures fresh outputs in distinct source slots',async()=>{
  const g=n.graph();g.get('First',"'_api/web/currentuser'");g.get('Second',"'_api/web/currentuser'");
  g.compose('Storage_Verified',{first:"@body('First')?['Id']",second:"@body('Second')?['Id']"});
  const x=fixture(g.actions);let calls=0;const h=new Harness(x.flow,{},async()=>({body:{Id:++calls}}));
  const result=await h.run({});assert.equal(result.state,'Succeeded');
  assert.deepEqual(h.ctx.variables.d01MachineState.Storage_Verified,{first:1,second:2});assert.equal(calls,2);
  const steps=x.flow.properties.definition.actions.Process.actions.D01Program.inputs;
  assert.equal(steps.find(s=>s.key==='First').template,steps.find(s=>s.key==='Second').template);
  assert.equal(h.ctx.variables.d01MachineState.First,undefined);assert.equal(h.ctx.variables.d01MachineState.Second,undefined);
});
test('a lost POST acknowledgement stops the Until after one attempt without publication',async()=>{
  const g=n.graph();g.add('One_POST',n.http('POST',"'_api/web/never-called-tenant'",'{}'));g.compose('Storage_Verified',{state:'StorageVerified'});
  const x=fixture(g.actions);let calls=0;const h=new Harness(x.flow,{},async()=>{calls++;throw Error('SYNTHETIC_LOST_ACK');});
  const result=await h.run({});assert.equal(result.state,'Failed');assert.equal(result.code,'D01_PENDING');assert.equal(calls,1);
  assert.equal(h.ctx.variables.d01MachinePC,-2);assert.equal(h.ctx.variables.d01MachineState.Storage_Verified,undefined);
});
test('skipped branch output never inherits a preceding shared-template result',async()=>{
  const g=n.graph(),no=n.graph();g.compose('Prior',{secret:'old'});no.compose('Skipped',{secret:'wrong'});
  g.branch('Choose','true',{},no.actions);g.compose('Storage_Verified',{value:"@outputs('Skipped')"});
  const x=fixture(g.actions),h=new Harness(x.flow,{},async()=>{throw Error('UNEXPECTED_HTTP');});const r=await h.run({});
  assert.equal(r.state,'Succeeded');assert.deepEqual(h.ctx.variables.d01MachineState.Storage_Verified,{value:null});
});
test('rejected early successful termination skips the remaining financial branch',async()=>{
  const g=n.graph(),yes=n.graph();yes.compose('Rejected_Outcome',{state:'Rejected'});yes.add('End_Rejected',{type:'Terminate',inputs:{runStatus:'Succeeded'}});
  g.branch('Reject','true',yes.actions);g.add('Must_Not_POST',n.http('POST',"'_api/web/never-called-tenant'",'{}'));
  const x=fixture(g.actions),h=new Harness(x.flow,{},async()=>{throw Error('UNEXPECTED_POST');});const r=await h.run({});
  assert.equal(r.state,'Succeeded');assert.deepEqual(h.ctx.variables.d01MachineState.Rejected_Outcome,{state:'Rejected'});
});
test('nonsequential source and reserved variable collision fail during generation',()=>{
  const g=n.graph();g.compose('A',1);g.compose('B',2);g.actions.B.runAfter={};assert.throws(()=>fixture(g.actions),/MACHINE_NONSEQUENTIAL_SOURCE/);
  const f=buildFlow();f.properties.definition.actions.Process.actions={};f.properties.definition.actions.Initialise.inputs.variables.push({name:'d01MachinePC',type:'integer',value:5});
  assert.throws(()=>lowerActorWriter(f),/MACHINE_VARIABLE_COLLISION/);
});
test('consecutive branches do not reuse the previous branch destination',async()=>{
  const g=n.graph(),a=n.graph(),b=n.graph(),c=n.graph(),d=n.graph();
  a.compose('FirstYes','wrong');b.compose('FirstNo',1);c.compose('SecondYes',2);d.compose('SecondNo','wrong');
  g.branch('FirstChoose','false',a.actions,b.actions);g.branch('SecondChoose','true',c.actions,d.actions);
  g.compose('Storage_Verified',{first:"@outputs('FirstNo')",second:"@outputs('SecondYes')",a:"@outputs('FirstYes')",b:"@outputs('SecondNo')"});
  const x=fixture(g.actions),h=new Harness(x.flow,{},async()=>{throw Error('UNEXPECTED_IO');});const r=await h.run({});
  assert.equal(r.state,'Succeeded');assert.deepEqual(h.ctx.variables.d01MachineState.Storage_Verified,{first:1,second:2,a:null,b:null});
});
test('a skipped proof branch does not retire one hundred never-produced values',async()=>{
  const g=n.graph(),yes=n.graph();for(let i=0;i<100;i++)yes.compose('Never'+i,i);
  yes.compose('NeverConsumer',Array.from({length:100},(_,i)=>"@outputs('Never"+i+"')"));
  g.branch('ChooseSkip','false',yes.actions);g.compose('Storage_Verified',{state:'StorageVerified'});
  const x=fixture(g.actions),h=new Harness(x.flow,{},async()=>{throw Error('UNEXPECTED_IO');});const r=await h.run({});
  assert.equal(r.state,'Succeeded');assert.equal(h.visited.filter(n=>n==='D01SaveRetired').length,0);
  assert.deepEqual(h.ctx.variables.d01MachineState,{Storage_Verified:{state:'StorageVerified'}});
});
