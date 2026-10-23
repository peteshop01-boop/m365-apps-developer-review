'use strict';
// Actual compiled caller channel/store against the SAME ACL model accepted by
// the emitted writer. No network, credential, provisioning or native QA credit.
const test=require('node:test'),assert=require('node:assert/strict');
const {MachineTenant}=require('./actor-writer-machine-fixture.cjs');
const {SITE}=require('./build-flow.cjs');
const {StandardStoreIO}=require('../lib-commonjs/processor/StandardStoreTransport');
const {SharePointStandardStore}=require('../lib-commonjs/processor/SharePointStandardStore');
const {SharePointRequestChannel}=require('../lib-commonjs/processor/SharePointRequestChannel');
function caller(f,actor){
  const denied=[];
  const io=new StandardStoreIO({send:async plan=>{
    assert.equal(plan.method,'GET','entry discovery never writes');
    const u=new URL(plan.url);
    if(u.pathname===new URL(SITE).pathname+'/_api/web/currentuser')return f.response(plan,200,{Id:actor,IsSiteAdmin:false});
    const m=/lists\(guid'([^']+)'\)\/items(?:\((\d+)\))?(\/File\/\$value)?$/.exec(u.pathname);assert(m,'qualified list GET only');
    const name=Object.keys(f.schemas.lists).find(n=>f.schemas.lists[n]===m[1]);assert(name);
    if(m[2]){
      const raw=f.rawGet(actor,name,Number(m[2]));
      if(raw.status!==200){denied.push(name);return f.response(plan,raw.status,{});}
      if(m[3]){assert.equal(name,'requests');return f.response(plan,200,undefined,f.files.get(raw.body.File.ServerRelativeUrl));}
      return f.response(plan,200,f.project(raw.body,u));
    }
    let rows=f.tables[name].filter(r=>f.rawGet(actor,name,r.Id).status===200);
    const filter=u.searchParams.get('$filter'),person=/^D01UserId eq ([1-9]\d*)$/.exec(filter||'');
    const draft=/^ClaimantRecordId eq ([1-9]\d*) and ClaimMonth eq '(20\d{2}-\d{2})' and SubmissionStatus eq 'Draft'$/.exec(filter||'');
    const history=/^D01ActorId eq ([1-9]\d*) and ParentId eq ([1-9]\d*)$/.exec(filter||'');
    const author=/^AuthorId eq ([1-9]\d*)$/.exec(filter||'');
    if(name==='people'&&person)rows=rows.filter(r=>r.D01UserId===Number(person[1]));
    else if(name==='claims'&&draft)rows=rows.filter(r=>r.ClaimantRecordId===Number(draft[1])&&r.ClaimMonth===draft[2]&&r.SubmissionStatus==='Draft');
    else if(name==='operations'&&history)rows=rows.filter(r=>r.D01ActorId===Number(history[1])&&r.ParentId===Number(history[2]));
    else if(name==='requests'&&author)rows=rows.filter(r=>r.AuthorId===Number(author[1]));
    else if(filter)throw Error('UNMODELLED_CALLER_FILTER');
    return f.response(plan,200,{value:rows.slice(0,Number(u.searchParams.get('$top'))).map(r=>f.project(r,u))});
  }});
  return {denied,channel:new SharePointRequestChannel(io,new SharePointStandardStore(io,f.schemas),f.p.roots.requests)};
}
for(const actor of [11,12])test(`writer-admitted private references remain usable by ordinary employee ${actor}`,async()=>{
  const f=new MachineTenant();assert.equal((await f.runAdmission()).code,'D01_ADMISSION_ONLY_HELD');
  const c=caller(f,actor),entry=await c.channel.readSignedInEntryContext('2026-10');
  assert.equal(entry.state,'Ready',JSON.stringify({denied:c.denied,entry}));
  assert.equal(entry.context.parentId,90+actor);assert.equal(entry.context.nominals.length,195);
  assert.equal(f.rawGet(actor===11?12:11,'claims',90+actor).status,403);assert.equal(f.writes.length,0);
});
async function refused(f){
  const r=await f.runAdmission();assert.notEqual(r.code,'D01_ADMISSION_ONLY_HELD');assert.equal(f.writes.length,0);
  assert(!f.admissionCalls.some(c=>c.name==='Incoming_Binary'),'refuse before privileged request bytes');
}
test('missing native reference membership refuses before privileged bytes',async()=>{
  const f=new MachineTenant();f.groups.get(24).delete(11);await refused(f);
});
for(const name of ['months','nominals'])test(`absent ${name} read grant refuses before bytes`,async()=>{
  const f=new MachineTenant();for(const p of [f.p,f.nativePolicy])p.rootAcl[name]=p.rootAcl[name].filter(v=>v.id!==24);await refused(f);
});
for(const name of ['requests','operations','results','audit','expenses','claims','people'])test(`reference reader cannot gain raw root read on ${name}`,async()=>{
  const f=new MachineTenant();for(const p of [f.p,f.nativePolicy])p.rootAcl[name].push({id:24,type:8,roles:[structuredClone(p.employeeRead)]});await refused(f);
});
for(const fault of ['write','extraRole','processorAlias'])test(`reference grant ${fault} is not accepted`,async()=>{
  const f=new MachineTenant();for(const p of [f.p,f.nativePolicy])for(const n of ['months','nominals']){
    const reader=p.rootAcl[n].find(v=>v.id===24);
    if(fault==='write')reader.roles=[structuredClone(p.employeeRequest)];
    if(fault==='extraRole')reader.roles.push({id:1073741825,high:'48',low:'134287360'});
    if(fault==='processorAlias')reader.id=99;
  }await refused(f);
});
test('direct read grants bind the actual Author without group membership',async()=>{
  const f=new MachineTenant();f.groups.get(24).delete(11);
  for(const p of [f.p,f.nativePolicy])for(const n of ['months','nominals']){const reader=p.rootAcl[n].find(v=>v.id===24);reader.id=11;reader.type=1;}
  assert.equal((await f.runAdmission()).code,'D01_ADMISSION_ONLY_HELD');assert.equal((await caller(f,11).channel.readSignedInEntryContext('2026-10')).state,'Ready');
  assert.equal(f.rawGet(12,'claims',101).status,403);assert.equal(f.rawGet(12,'people',21).status,403);assert.equal(f.writes.length,0);
});
test('reference group membership removed before Save cannot cross a financial boundary',async()=>{
  const f=new MachineTenant();f.writerHooks.Nominals=x=>x.groups.get(24).delete(11);
  const r=await f.runWriter();assert.equal(r.outputs.Storage_Verified,undefined);assert.equal(f.writes.length,0);
});
