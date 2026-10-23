'use strict';
// Deterministic HTTP-level fixture for the generated WDL, not tenant evidence.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {Harness}=require('./wdl-harness.cjs');
const {buildFlow,SITE}=require('./build-flow.cjs');
const clone=v=>structuredClone(v);
const names=['requests','operations','results','audit','expenses','claims','people','months','nominals'];
const bindings=Object.fromEntries(names.map((n,i)=>[n,`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`]));
Object.assign(bindings,{fixtureActorId:11,processorActorId:99,fixtureParentId:101,requestRoot:'/sites/REVIEW-TEST-SITE/D01Requests'});
bindings.acl=Object.fromEntries(names.map(n=>[n,[{principalId:11,roleId:101,high:'0',low:n==='requests'?'3':'1'},{principalId:99,roleId:102,high:'0',low:['expenses','operations'].includes(n)?'7':n==='claims'?'5':['results','audit'].includes(n)?'3':'1'}]]));
const receipts={jpg:Buffer.from([255,216,255,224,0,16,74,70,73,70,0,1,255,217]),png:Buffer.from('89504e470d0a1a0a0000000d49484452','hex'),pdf:Buffer.from('%PDF-1.4\nsynthetic test only\n%%EOF')};
function command(kind='none') {
  const bytes=receipts[kind];
  return {schema:1,clientFingerprint:'a'.repeat(64),command:{operationId:'test-operation-0001',parentId:101,parentEtag:'"1"',date:'21-10-2026',supplier:'Synthetic supplier',description:'Fixture only',nominalCode:'00010',amount:'12.34',notes:'No real claim',receipt:bytes?{kind:'file',fileName:'receipt.'+kind,mediaType:kind==='jpg'?'image/jpeg':kind==='png'?'image/png':'application/pdf',bytes:bytes.toString('base64'),sha256:crypto.createHash('sha256').update(bytes).digest('hex')}:{kind:'none',reason:'Synthetic missing receipt explanation'}}};
}
class FakeSharePoint {
  constructor(payload=command()) {
    this.bindings=clone(bindings);this.calls=[];this.writes=[];this.failAfter=new Set();this.hooks={};this.flags={};
    this.flags.nativeSystemFields=true;
    this.runTail=Promise.resolve();this.runActive=false;this.runWaiting=0;this.afterRun=undefined;
    this.tables=Object.fromEntries(names.map(n=>[n,[]]));this.files=new Map();this.attachments=new Map();
    this.tables.claims=[{Id:101,ClaimantRecordId:21,ClaimMonthRecordId:31,ClaimMonth:'2026-10',SubmissionStatus:'Draft',ExpenseTotal:10, MileageTotal:2,OverallTotal:12,SubmissionVersion:1,D01Reservation:'',D01Checkpoint:'','odata.etag':'"1"'}];
    this.tables.people=[{Id:21,D01UserId:11,D01Active:true,'odata.etag':'"1"'}];
    this.tables.months=[{Id:31,ClaimMonth:'2026-10',MonthStatus:'Open','odata.etag':'"1"'}];
    this.tables.nominals=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../design/data/nominals_approved_195.json'),'utf8')).nominals.map((n,i)=>({Id:i+1,field_1:n.code,field_2:n.description,D01Eligible:1}));
    this.tables.claims[0].HasUniqueRoleAssignments=false;this.putRequest(501,payload);
  }
  putRequest(id,payload,actor=11){const bytes=Buffer.from(JSON.stringify(payload));const file={UniqueId:`request-${id}`,Length:String(bytes.length),ETag:'"1"',Name:payload.command.operationId+'.json',ServerRelativeUrl:`${this.bindings.requestRoot}/${actor}/${payload.command.operationId}.json`};this.tables.requests.push({Id:id,AuthorId:actor,EditorId:actor,HasUniqueRoleAssignments:false,OData__UIVersionString:'1.0',File:file,'odata.etag':'"1"'});this.files.set(file.ServerRelativeUrl,bytes);}
  async run(id=501){
    const definition=buildFlow();
    const execute=async()=>{const h=new Harness(definition,this.bindings,this.transport.bind(this));const result=await h.run({ID:id});const r={...result,errors:h.errors,visited:h.visited};if(this.afterRun)await this.afterRun(r);return r;};
    // Model the declared native trigger scheduler, not a storage-side JS lock.
    // Microsoft runtime/resubmit behaviour must separately be proved in TEST.
    if(definition.properties.definition.triggers.Request_File_Created.runtimeConfiguration?.concurrency?.runs!==1)return execute();
    if(this.runWaiting+(this.runActive?1:0)>=12)return {state:'NotStarted',code:'TRIGGER_QUEUE_FULL',outputs:{},errors:[],visited:[]};
    const predecessor=this.runTail;let release;this.runTail=new Promise(resolve=>release=resolve);
    this.runWaiting++;await predecessor;this.runWaiting--;this.runActive=true;
    try{return await execute();}finally{this.runActive=false;release();}
  }
  bump(row){row['odata.etag']='"'+(Number(row['odata.etag'].replaceAll('"',''))+1)+'"';}
  project(row,url){const s=url.searchParams.get('$select');return s?Object.fromEntries(Object.entries(row).filter(([k])=>s.split(',').some(n=>n==='*'||n===k||n.startsWith(k+'/'))||k==='odata.etag')):clone(row);}
  async transport(input,name){
    if(input.parameters.dataset!==SITE)throw Error('WRONG_SITE');
    this.calls.push({name,operation:input.host.operationId,parameters:clone(input.parameters)});
    if(this.hooks[name])await this.hooks[name](this);
    let output;
    if(input.host.operationId==='GetFileContentByPath') {const bytes=this.files.get(input.parameters.path);if(!bytes)throw Error('404');output={body:{'$content-type':'application/octet-stream','$content':bytes.toString('base64')}};}
    else {
      if(input.host.operationId!=='HttpRequest')throw Error('UNEXPECTED_CONNECTOR');
      const p=input.parameters,method=p['parameters/method'],relative=p['parameters/uri'];
      if(relative.startsWith('_api/web/currentuser'))return {body:{Id:this.flags.processorId??99}};
      if(relative.startsWith('_api/web/GetFolderByServerRelativeUrl'))return {body:{HasUniqueRoleAssignments:!!this.flags.sharedFolder}};
      const url=new URL(relative,'https://fixture.invalid/'),m=/lists\(guid'([^']+)'\)(.*)/.exec(url.pathname);if(!m)throw Error('UNEXPECTED_URI '+relative);
      const list=names.find(n=>this.bindings[n]===m[1]);if(!list)throw Error('WRONG_LIST');const suffix=m[2];
      if(method==='GET'&&!suffix)output={body:{Id:this.bindings[list],HasUniqueRoleAssignments:!this.flags.inherited,EnableVersioning:true,EnableAttachments:true,RootFolder:{ServerRelativeUrl:list==='requests'?this.bindings.requestRoot:`/sites/REVIEW-TEST-SITE/${list}`}}};
      else if(suffix==='/roleassignments'){const roles=clone(this.bindings.acl[list]);if(this.flags.extraRole)roles.push({principalId:12,roleId:101,high:'0',low:'1'});if(this.flags.changedRole)roles[0].low='7';output={body:{value:roles.map(r=>({Member:{Id:r.principalId,PrincipalType:this.flags.group?8:1},RoleDefinitionBindings:[{Id:r.roleId,BasePermissions:{High:r.high,Low:r.low}}]}))}};}
      else if(suffix.startsWith('/fields/getbyinternalnameortitle'))output={body:{Required:true,EnforceUniqueValues:!this.flags.nonunique}};
      else if(suffix==='/fields'&&['operations','results','audit'].includes(list))output={body:{value:[{InternalName:'OperationKey',TypeAsString:'Text',Required:true,ReadOnlyField:false,EnforceUniqueValues:!this.flags.nonunique},{InternalName:'D01ActorId',TypeAsString:this.flags.badActorField===list?'Lookup':'Number',Required:true,ReadOnlyField:this.flags.badActorField===list,EnforceUniqueValues:false}]}};
      else if(suffix==='/fields')output={body:{value:[{InternalName:'ExpenseCategory',TypeAsString:'Text',Hidden:false,Required:!!this.flags.category,ReadOnlyField:false,EnforceUniqueValues:false},
        ...[['D01NoReceiptReason','Note',false,false],['D01Originator','Number',true,false],['D01RequestId','Number',true,false],['D01OperationKey','Text',true,true],['D01Fingerprint','Text',true,false],['D01ReceiptManifest','Note',false,false]]
          .filter(([n])=>n!==this.flags.missingField).map(([InternalName,TypeAsString,Required,EnforceUniqueValues])=>({InternalName,TypeAsString,Required,EnforceUniqueValues,ReadOnlyField:false,Hidden:false}))]}};
      else {
        const item=/^\/items(?:\((\d+)\))?(.*)$/.exec(suffix);if(!item)throw Error('UNEXPECTED_PATH '+suffix);
        const id=item[1]?Number(item[1]):undefined,row=this.tables[list].find(r=>r.Id===id),tail=item[2];
        if(tail.startsWith('/AttachmentFiles')){
          if(!row)throw Error('404');const files=this.attachments.get(id)||new Map();
          const fn=/(?:FileName=|getByFileName\()'([^']+)'/.exec(tail);const filename=fn?decodeURIComponent(fn[1]):undefined;
          if(method==='POST'){if(!Buffer.isBuffer(p['parameters/body']))throw Error('BINARY_REQUIRED');if(files.has(filename))throw Error('409');files.set(filename,Buffer.from(p['parameters/body']));this.attachments.set(id,files);this.bump(row);this.writes.push({name,list,id});output={body:{}};}
          else if(tail.endsWith('/$value')){if(!files.has(filename))throw Error('404');output={body:{'$content-type':'application/octet-stream','$content':files.get(filename).toString('base64')}};}
          else output={body:{value:[...files.keys()].map(FileName=>({FileName}))}};
        } else if(method==='GET'){
          if(id){if(!row)throw Error('404');output={body:this.project(row,url)};}
          else {let rows=this.tables[list];const f=url.searchParams.get('$filter');if(f){const match=/^(OperationKey|D01OperationKey) eq '([^']+)'$/.exec(f),actor=/^D01UserId eq ([1-9][0-9]*)$/.exec(f);if(match)rows=rows.filter(r=>r[match[1]]===match[2]);else if(actor&&list==='people')rows=rows.filter(r=>r.D01UserId===Number(actor[1]));else throw Error('UNSAFE_FILTER');}output={body:{value:rows.slice(0,Number(url.searchParams.get('$top')||10000)).map(r=>this.project(r,url)),...(this.flags.nextLink&&list==='nominals'?{'odata.nextLink':'blocked'}:{})}};}
        } else if(method==='POST'){
          const data=JSON.parse(p['parameters/body']);
          // Fresh native metadata: OriginatorId is a hidden read-only Lookup,
          // not an available custom Number field (21 October 2026).
          if(this.flags.nativeSystemFields && Object.keys(data).some(k=>/^OriginatorId$/i.test(k)))throw Error('READ_ONLY_SYSTEM_FIELD');
          // Match captured native Text capacity conservatively in UTF-16 units.
          if(list==='expenses' && ['Supplier','ExpenseDescription'].some(k=>typeof data[k]==='string' && data[k].length>255))throw Error('TEXT_FIELD_CAPACITY');
          if(id){if(!row)throw Error('404');if(p['parameters/headers']['X-HTTP-Method']!=='MERGE'||p['parameters/headers']['IF-MATCH']!==row['odata.etag'])throw Error('412');Object.assign(row,data);this.bump(row);output={body:{}};}
          else {const key=list==='expenses'?'D01OperationKey':'OperationKey';if(this.tables[list].some(r=>r[key]===data[key]))throw Error('409');const fresh={Id:1000+this.tables[list].length,...data,HasUniqueRoleAssignments:false,AuthorId:99,Created:'2026-10-21T14:00:00Z','odata.etag':'"1"'};this.tables[list].push(fresh);output={body:clone(fresh)};}
          this.writes.push({name,list,id});
        } else throw Error('UNEXPECTED_METHOD');
      }
    }
    if(this.failAfter.delete(name))throw Error('SIMULATED_LOST_ACK');return clone(output);
  }
}
module.exports={FakeSharePoint,command,receipts,bindings};
