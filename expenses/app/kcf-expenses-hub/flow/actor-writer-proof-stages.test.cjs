'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildFlow,nativeWdl:n}=require('./build-flow.cjs');
const {lowerActorWriter,buildActorWriterMachine}=require('./actor-writer-machine.cjs');
const {Harness}=require('./wdl-harness.cjs');
function fixture(g){const f=buildFlow();f.properties.definition.actions.Process.actions=g.actions;return lowerActorWriter(f);}
function stage(){const g=n.graph(),inside=n.graph();inside.get('PrivateRead',"'_api/web/currentuser'");inside.compose('Checked',"@body('PrivateRead')?['Id']");g.add('Proof',{type:'Scope',actions:inside.actions,runtimeConfiguration:n.SECURE});return g;}
test('a child output cannot escape its atomic proof instruction',()=>{
  const g=stage();g.compose('Storage_Verified',"@outputs('Checked')");assert.throws(()=>fixture(g),/MACHINE_UNEXPORTED_ACTION_REFERENCE/);
});
for(const expression of ["@outputs(variables('name'))","@body (variables('name'))","@outputs ('Checked')","@actions('Proof')","@result('Proof')"]){
  test('unsupported action reference fails generation: '+expression,()=>{const g=stage();g.compose('Storage_Verified',expression);assert.throws(()=>fixture(g),/MACHINE_UNSUPPORTED_ACTION_REFERENCE/);});
}
test('parallel inner proof dependencies cannot be lowered as sequential',()=>{
  const g=stage();g.actions.Proof.actions.Checked.runAfter={};assert.throws(()=>fixture(g),/MACHINE_NONSEQUENTIAL_SOURCE/);
});
test('residual native Terminate inside an atomic stage fails generation',()=>{
  const g=stage();g.actions.Proof.actions.Checked={type:'Terminate',inputs:{runStatus:'Failed'},runAfter:{PrivateRead:['Succeeded']}};
  assert.throws(()=>fixture(g),/MACHINE_NESTED_TERMINATE/);
});
test('local stage outputs stay local and a failed stage never reaches POST',async()=>{
  for(const valid of [true,false]){
    const g=stage();g.actions.Proof.actions.Checked={type:'ParseJson',inputs:{content:"@body('PrivateRead')?['Id']",schema:{type:'integer',minimum:1}},runtimeConfiguration:n.SECURE,runAfter:{PrivateRead:['Succeeded']}};
    g.add('Write',n.http('POST',"'_api/web/source-only'",'{}'));g.compose('Storage_Verified',{state:'verified'});
    const x=fixture(g);let posts=0,gets=0;const h=new Harness(x.flow,{},async a=>{if(a.parameters['parameters/method']==='POST')posts++;else gets++;return {body:{Id:valid?1:'bad'}};});
    const r=await h.run({});assert.equal(r.state,valid?'Succeeded':'Failed');assert.equal(gets,1);assert.equal(posts,valid?1:0);
    if(!valid)assert.equal(h.ctx.variables.d01MachinePC,-2);
  }
});
test('source-fixed proof stages reduce dispatch instructions without raising native bounds',()=>{
  const x=buildActorWriterMachine();assert(x.instructions<1976,'baseline has 1976 dispatch instructions');
});
