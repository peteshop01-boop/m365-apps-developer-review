'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fuseActorWriter}=require('./actor-writer-proof-fusion.cjs');
const {buildFlow,nativeWdl:n}=require('./build-flow.cjs');
const {Harness}=require('./wdl-harness.cjs');
function source(badExpression=false){
  const g=n.graph();for(let i=0;i<8;i++){
    g.get('Read'+i,"'_api/web/currentuser'");
    g.add('Typed'+i,{type:'ParseJson',inputs:{content:"@body('Read"+i+"')",schema:{type:'object',required:['Id'],properties:{Id:{type:'integer',minimum:1,maximum:200}}}},runtimeConfiguration:n.SECURE});
    g.guard('Valid'+i,badExpression?"equals(substring('x',0,999),'x')":"greater(body('Read"+i+"')?['Id'],0)");
  }
  g.add('Publish',n.http('POST',"'_api/web/test-only-never-tenant'",'{}'));
  const f=buildFlow();f.properties.definition.actions.Process.actions=g.actions;return f;
}
function calls(flow){const out=[];function walk(a){for(const [name,v]of Object.entries(a)){if(v.type==='OpenApiConnection')out.push([name,v]);if(v.actions)walk(v.actions);if(v.else)walk(v.else.actions);}}walk(flow.properties.definition.actions.Process.actions);return out;}
test('recurrent proof units preserve exact native schemas, predicates and connector order',()=>{
  const before=source(),after=fuseActorWriter(before);
  assert.equal(after.audit.selectedGroups,8);assert.equal(after.audit.normalisedFailureGuards.length,8);
  assert.deepEqual(calls(after.flow),calls(before));
  for(const group of after.audit.groups){
    const scope=after.flow.properties.definition.actions.Process.actions[group.name];assert.equal(scope.type,'Scope');
    group.source.forEach(p=>assert.deepEqual(scope.actions[p.child].inputs,p.inputs));
  }
});
test('native type failure still stops before a later expensive predicate or POST',async()=>{
  const before=source(true),after=fuseActorWriter(before).flow;
  for(const f of [before,after]){
    let posts=0;const h=new Harness(f,{},async input=>{if(input.parameters['parameters/method']==='POST')posts++;return {body:{Id:'wrong-type'}};});
    const r=await h.run({});assert.equal(r.state,'Failed');assert.equal(r.code,'D01_PENDING');assert.equal(posts,0);
    assert(h.errors.some(e=>e.error==='PARSE_JSON_SCHEMA'));assert(!h.errors.some(e=>e.error==='SUBSTRING_BOUNDS'));
  }
});
test('eager wrapper is a rejected counterexample, not the production optimiser',async()=>{
  const f=source(true),actions=f.properties.definition.actions.Process.actions;
  actions.Valid0={type:'ParseJson',inputs:{content:{typed:"@body('Read0')",later:"@equals(substring('x',0,999),'x')"},schema:{type:'object'}},runAfter:{Read0:['Succeeded']}};
  delete actions.Typed0;
  const h=new Harness(f,{},async()=>({body:{Id:'wrong-type'}}));await h.run({});
  assert(h.errors.some(e=>e.error==='SUBSTRING_BOUNDS'),'counterexample must expose premature evaluation');
});
test('a valid recurrent proof executes each connector once and one publication',async()=>{
  const f=fuseActorWriter(source()).flow;let gets=0,posts=0;
  const h=new Harness(f,{},async input=>{if(input.parameters['parameters/method']==='POST')posts++;else gets++;return {body:{Id:1}};});
  const r=await h.run({});assert.equal(r.state,'Succeeded');assert.equal(gets,8);assert.equal(posts,1);
});
test('referenced parser outputs and anchored schemas are not grouped away',()=>{
  const f=source(),a=f.properties.definition.actions.Process.actions;
  a.Typed0.inputs.schema.definitions={id:{type:'integer'}};a.Typed0.inputs.schema.properties.Id={$ref:'#/definitions/id'};
  // A later real output consumer prevents the parser being treated as unused.
  a.Publish.inputs.parameters['parameters/body']="@string(body('Typed1'))";
  const fused=fuseActorWriter(f);assert.equal(fused.flow.properties.definition.actions.Process.actions.Typed0.type,'ParseJson');
  assert.equal(fused.flow.properties.definition.actions.Process.actions.Typed1.type,'ParseJson');
});
test('unknown dynamic action references and parallel source dependencies fail closed',()=>{
  const f=source();f.properties.definition.outputs={unsafe:{type:'string',value:"@outputs(variables('key'))"}};
  assert.throws(()=>fuseActorWriter(f),/FUSION_DYNAMIC_ACTION_REFERENCE/);
  const parallel=source();parallel.properties.definition.actions.Process.actions.Read1.runAfter={};
  assert.throws(()=>fuseActorWriter(parallel),/FUSION_NONSEQUENTIAL_SOURCE/);
});
