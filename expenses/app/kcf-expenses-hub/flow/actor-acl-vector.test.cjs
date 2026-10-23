'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildActorAdmissionFlow}=require('./actor-admission.cjs');
const {AdmissionTenant}=require('./actor-admission-fixture.cjs');
const {parse,evaluate}=require('./wdl-harness.cjs');
const clone=v=>structuredClone(v);
function allActions(actions,out=[]){for(const [name,a]of Object.entries(actions)){out.push([name,a]);if(a.actions)allActions(a.actions,out);if(a.else)allActions(a.else.actions,out);}return out;}
test('ACL validation uses data operations rather than a native action loop per principal',()=>{
  const a=allActions(buildActorAdmissionFlow().properties.definition.actions);
  assert(!a.some(([name,v])=>name.endsWith('_ACL_Each')&&v.type==='Foreach'));
});
test('adding twenty-four admitted Limited Access principals does not multiply native action executions',async()=>{
  const small=new AdmissionTenant(),large=new AdmissionTenant();
  for(const n of Object.keys(large.p.rootAcl))for(let id=100;id<124;id++){
    const row={id,type:1,roles:[{id:1073741825,high:'48',low:'134287360'}]};
    large.p.rootAcl[n].push(clone(row));large.nativePolicy.rootAcl[n].push(clone(row));
  }
  const a=await small.runAdmission(),b=await large.runAdmission();
  assert.equal(a.code,'D01_ADMISSION_ONLY_HELD');assert.equal(b.code,'D01_ADMISSION_ONLY_HELD');
  assert.equal(a.visited.length,b.visited.length);assert.equal(small.writes.length+large.writes.length,0);
});
test('the local take/join models cover only the documented collection operations used by ACL projection',()=>{
  const run=s=>evaluate(parse(s),{});
  assert.deepEqual(run('@take(createArray(1),1)'),[1]);
  assert.deepEqual(run('@take(createArray(1,2,3),2)'),[1,2]);
  assert.equal(run("@join(createArray('a','b'),',')"),'a,b');
  assert.throws(()=>run('@take(createArray(1),2)'),/ONLY_IN_RANGE_TAKE_MODELLED/);
});
test('ACL role ordering remains set-based with recovery Full Control and Limited Access',async()=>{
  const f=new AdmissionTenant(),limited={id:1073741825,high:'48',low:'134287360'};
  f.p.recovery.roles.push(clone(limited));f.nativePolicy.recovery.roles.push(clone(limited));
  for(const map of [f.p.rootAcl,f.nativePolicy.rootAcl])for(const rows of Object.values(map))rows.find(p=>p.id===3).roles.push(clone(limited));
  const send=f.send.bind(f);f.send=async plan=>{const r=await send(plan);if(!plan.url.includes('/roleassignments'))return r;const body=await new Response(r.body).json();body.value.reverse();body.value.forEach(row=>row.RoleDefinitionBindings.reverse());return f.response(plan,200,body);};
  assert.equal((await f.runAdmission()).code,'D01_ADMISSION_ONLY_HELD');assert.equal(f.writes.length,0);
});
for(const fault of ['memberType','duplicateNativeId','duplicateExpectedId','duplicateRoleWithExtras','wrongMask','zeroRoles','fourRoles',
  'RoleDefinitionBindings@odata.nextLink','RoleDefinitionBindings@odata.__next','RoleDefinitionBindings__next'])test(`ACL projection refuses ${fault} before privileged request bytes`,async()=>{
  const f=new AdmissionTenant(),send=f.send.bind(f);
  if(fault==='duplicateExpectedId')for(const rows of Object.values(f.p.rootAcl))rows.push({...clone(rows[0]),type:1});
  f.send=async plan=>{
    const r=await send(plan);if(!plan.url.includes('/roleassignments'))return r;
    const body=await new Response(r.body).json(),row=body.value.find(v=>v.Member.Id===99);
    if(fault==='memberType')row.Member.PrincipalType=8;
    if(fault==='duplicateNativeId')body.value.push({...clone(row),unused:'does not make identity unique'});
    if(fault==='duplicateRoleWithExtras')row.RoleDefinitionBindings.push({...clone(row.RoleDefinitionBindings[0]),unused:'extra'});
    if(fault==='wrongMask')row.RoleDefinitionBindings[0].BasePermissions.Low='196609';
    if(fault==='zeroRoles')row.RoleDefinitionBindings=[];
    if(fault==='fourRoles')row.RoleDefinitionBindings=Array.from({length:4},()=>clone(row.RoleDefinitionBindings[0]));
    if(fault.startsWith('RoleDefinitionBindings'))row[fault]=null;
    return f.response(plan,200,body);
  };
  const r=await f.runAdmission();assert.notEqual(r.code,'D01_ADMISSION_ONLY_HELD');assert.equal(f.writes.length,0);
  assert.equal(f.admissionCalls.some(c=>c.name==='Incoming_Binary'),false);
});
