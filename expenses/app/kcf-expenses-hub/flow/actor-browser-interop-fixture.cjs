'use strict';
// Test-only HTTP boundary. Real compiled caller/service and emitted WDL run on
// either side; native SharePoint, authentication and scheduling remain unproved.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {MachineTenant}=require('./actor-writer-machine-fixture.cjs');
const {SITE}=require('./build-flow.cjs');
const {composeBrowserRequestChannel,createStaffExpenseEntry}=require('../lib-commonjs/processor/SharePointRequestChannel');
const {createImmutableRequestFile}=require('../lib-commonjs/processor/SharePointStandardPlans');
const {ExpensePersistenceService}=require('../lib-commonjs/services/persistence/ExpensePersistenceService');
const {RequestLedgerExpensePort}=require('../lib-commonjs/services/persistence/RequestLedgerExpensePort');
const digest=async b=>crypto.createHash('sha256').update(b).digest('hex');
class ActorBrowserTenant extends MachineTenant {
  constructor(){super();this.tables.requests=[];this.files.clear();this.browserCalls=[];this.flowRuns=[];this.deferProcessor=false;}
  async send(plan){
    const start=this.creates.length;
    const create=plan.method==='POST'&&plan.url.includes(this.schemas.lists.expenses)&&plan.url.endsWith('/AddValidateUpdateItemUsingPath');
    const key=create?plan.body?.formValues?.find(f=>f.FieldName==='D01OperationKey')?.FieldValue:undefined;
    const folder=create?plan.body?.listItemCreateInfo?.FolderPath?.DecodedUrl:undefined;
    try{return await super.send(plan);}finally{
    // Same canonical DateTime read representation as the existing interop
    // fixture. Native timezone/field formats still require tenant qualification.
    if(create&&typeof key==='string'&&typeof folder==='string'){
      const events=this.creates.slice(start).filter(e=>e.n==='expenses'&&new URL(folder).pathname===e.folder);
      const rows=events.map(e=>this.tables.expenses.find(r=>r.Id===e.id&&r.D01OperationKey===key)).filter(Boolean);
      if(rows.length>1)throw Error('AMBIGUOUS_MODEL_CREATE');
      const row=rows[0];if(row&&/^\d{4}-\d{2}-\d{2}$/.test(row.ExpenseDate))row.ExpenseDate+='T00:00:00Z';
    }
    }
  }
  async caller(plan,actor){
    this.browserCalls.push({actor,method:plan.method,url:plan.url});const u=new URL(plan.url);
    if(u.pathname===new URL(SITE).pathname+'/_api/web/currentuser')return this.response(plan,200,{Id:actor,IsSiteAdmin:false});
    if(plan.method==='POST'){
      const bytes=Buffer.from(plan.body),wire=JSON.parse(bytes.toString('utf8'));
      const expected=new URL(createImmutableRequestFile(this.p.roots.requests+'/'+actor,wire.command.operationId,new Uint8Array(bytes)).url).href;
      const member=this.tables.people.find(r=>r.D01UserId===actor),acl=member&&this.principals('requests',actor);
      const create=acl?.some(p=>p.type===1&&p.id===actor&&p.roles.some(r=>(BigInt(r.low)&2n)===2n));
      if(plan.url!==expected||!create||plan.headers['X-RequestDigest']!=='synthetic-fixture-digest')return this.response(plan,403,{});
      if(this.tables.requests.some(r=>r.File.ServerRelativeUrl===this.p.roots.requests+'/'+actor+'/'+wire.command.operationId+'.json'))return this.response(plan,409,{});
      const id=501+this.tables.requests.length;this.put(id,wire,actor);
      const row=this.tables.requests.at(-1);this.files.set(row.File.ServerRelativeUrl,Buffer.from(bytes));row.File.Length=String(bytes.length);
      if(!this.deferProcessor)this.flowRuns.push(await this.runWriter(id));
      return this.response(plan,201,{});
    }
    assert.equal(plan.method,'GET','caller never edits financial data');
    const m=/lists\(guid'([^']+)'\)\/items(?:\((\d+)\))?(.*)$/.exec(u.pathname);assert(m,'unmodelled caller destination');
    const name=Object.keys(this.schemas.lists).find(n=>this.schemas.lists[n]===m[1]);assert(name);const tail=m[3];
    if(m[2]){
      const id=Number(m[2]),raw=this.rawGet(actor,name,id);
      if(raw.status!==200)return this.response(plan,raw.status,{});
      if(tail==='/File/$value'){assert.equal(name,'requests');return this.response(plan,200,undefined,this.files.get(raw.body.File.ServerRelativeUrl));}
      if(tail.startsWith('/AttachmentFiles')){
        assert.equal(name,'expenses');const files=this.attachments.get(id)||new Map();
        if(tail==='/AttachmentFiles')return this.response(plan,200,{value:[...files.keys()].map(FileName=>({FileName}))});
        const file=/^\/AttachmentFiles\/getByFileName\('([^']+)'\)\/\$value$/.exec(tail);assert(file,'read-only attachment route');
        const bytes=files.get(decodeURIComponent(file[1]));return this.response(plan,bytes?200:404,undefined,bytes);
      }
      assert.equal(tail,'');return this.response(plan,200,this.project(raw.body,u));
    }
    assert.equal(tail,'');let rows=this.tables[name].filter(r=>this.rawGet(actor,name,r.Id).status===200);
    const filter=u.searchParams.get('$filter'),person=/^D01UserId eq ([1-9]\d*)$/.exec(filter||'');
    const draft=/^ClaimantRecordId eq ([1-9]\d*) and ClaimMonth eq '(20\d{2}-\d{2})' and SubmissionStatus eq 'Draft'$/.exec(filter||'');
    const history=/^D01ActorId eq ([1-9]\d*) and ParentId eq ([1-9]\d*)$/.exec(filter||'');
    const author=/^AuthorId eq ([1-9]\d*)$/.exec(filter||''),key=/^(OperationKey|D01OperationKey) eq '([^']+)'$/.exec(filter||'');
    if(name==='people'&&person)rows=rows.filter(r=>r.D01UserId===Number(person[1]));
    else if(name==='claims'&&draft)rows=rows.filter(r=>r.ClaimantRecordId===Number(draft[1])&&r.ClaimMonth===draft[2]&&r.SubmissionStatus==='Draft');
    else if(name==='operations'&&history)rows=rows.filter(r=>r.D01ActorId===Number(history[1])&&r.ParentId===Number(history[2]));
    else if(name==='requests'&&author)rows=rows.filter(r=>r.AuthorId===Number(author[1]));
    else if(key)rows=rows.filter(r=>r[key[1]]===key[2]);
    else if(filter)throw Error('UNMODELLED_CALLER_FILTER');
    return this.response(plan,200,{value:rows.slice(0,Number(u.searchParams.get('$top'))).map(r=>this.project(r,u))});
  }
  browser(actor,options={}){
    const calls=[],platform={currentUrl:()=>SITE+'/SitePages/Synthetic.aspx',webAbsoluteUrl:()=>SITE,
      fetchDigest:async()=> 'synthetic-fixture-digest',fetch:async(url,init)=>{
        assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');calls.push({url,method:init.method});
        const raw=await this.caller({url,method:init.method,headers:init.headers,...(init.body?{body:new Uint8Array(init.body)}:{})},actor);
        if(init.method==='POST'&&options.loseAcknowledgement){await raw.body.cancel();throw Error('SYNTHETIC_LOST_ACK');}
        const r=new Response(raw.body,{status:raw.status,headers:raw.etag?{ETag:raw.etag}:{}});Object.defineProperty(r,'url',{value:new URL(raw.url).href});return r;
      }};
    const binding={requestRoot:this.p.roots.requests,requestListId:this.schemas.lists.requests,expenseListId:this.schemas.lists.expenses,
      readListIds:Object.entries(this.schemas.lists).filter(([name])=>name!=='audit').map(([,id])=>id)};
    const channel=composeBrowserRequestChannel(platform,binding,this.schemas);
    return {channel,calls,entry:createStaffExpenseEntry(channel,()=> '2026-10',digest),
      service:new ExpensePersistenceService(new RequestLedgerExpensePort(channel,digest),digest)};
  }
}
module.exports={ActorBrowserTenant};
