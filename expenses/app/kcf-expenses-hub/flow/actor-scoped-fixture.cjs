'use strict';
// The actual TS processor/store/scoped Standard REST adapter, not the emitted
// WDL or a native tenant. Reuses existing fixture data, metadata and CAS engine.
const assert=require('node:assert/strict');
const {FakeSharePoint,command,bindings,receipts}=require('./fake-sharepoint.cjs');
const {schema:fixtureFields}=require('./private-fixture.cjs');
const {SITE}=require('./build-flow.cjs');
const clone=v=>structuredClone(v), names=['requests','operations','results','audit','expenses','claims','people','months','nominals'];
const sensitive=['requests','operations','results','expenses','claims','people'];
const ids=Object.fromEntries(names.map(n=>[n,bindings[n]]));
const storeSchema={lists:ids,expense:{reason:'D01NoReceiptReason',originator:'D01Originator',requestId:'D01RequestId',canonicalOperation:'D01OperationKey',receiptManifest:'D01ReceiptManifest',receiptRequiredForFile:true,receiptRequiredForNoReceipt:false},fingerprint:'D01Fingerprint',reservation:'D01Reservation',checkpoint:'D01Checkpoint',personUser:'D01UserId',personActive:'D01Active',personActiveValue:true,nominalEligible:'D01Eligible',nominalEligibleValue:1};
const uuid=(a,n)=>`20000000-0000-4000-8000-${String(a*100+n).padStart(12,'0')}`;
function policy(){
  const processorRoles=Object.fromEntries(names.map((n,i)=>[n,{id:200+i,high:'1073741824',low:String(65536+131072+32+64+67108864+134217728+(n==='claims'?5:['expenses','operations'].includes(n)?7:['results','audit'].includes(n)?3:1))}]));
  const recovery={id:3,type:8,roles:[{id:1073741829,high:'2147483647',low:'4294967295'}]},employeeRead={id:101,high:'0',low:'196609'},employeeRequest={id:102,high:'0',low:'196611'};
  const roots=Object.fromEntries(names.map(n=>[n,`/sites/REVIEW-TEST-SITE/${n==='requests'?'':'Lists/'}KCFEXP_TEST102_D01_111111111111_${n}`]));
  const rootAcl=Object.fromEntries(names.map(n=>[n,[clone(recovery),{id:99,type:1,roles:[clone(processorRoles[n])]},...(sensitive.includes(n)?[11,12,13].map(id=>({id,type:1,roles:[{id:1073741825,high:'48',low:'134287360'}]})):n==='audit'?[]:[{id:24,type:8,roles:[clone(employeeRead)]}])]]));
  const fields=Object.fromEntries(['operations','results','audit','expenses'].map(n=>[n,Object.fromEntries(fixtureFields()[n].map(f=>[f.name==='ClaimSubmissionRef'?'ClaimSubmissionRefId':f.name,{name:f.name,kind:f.type==='Currency'?'Number':f.type==='DateTime'?'Date':f.type,empty:!f.required}]))]));
  // Current store creates an explicit null optional ResultId and uses Text
  // RecordJson/receipt manifests; no inferred native field/default is supplied.
  return {processorId:99,recovery,roots,rootAcl,processorRoles,employeeRead,employeeRequest,registryField:'D01PrivateScopes',fields};
}
class ScopedTenant extends FakeSharePoint {
  constructor(){
    super();this.p=policy();this.nativePolicy=clone(this.p);this.schemas=clone(storeSchema);this.boundaryCalls=[];this.creates=[];this.scopeHooks={};this.scopeFlags={};this.scopeItems=new Map();
    this.bindings.requestRoot=this.p.roots.requests;this.tables.requests=[];this.files.clear();
    this.groups=new Map([[3,new Set([98])],[24,new Set([11,12,13])]]);
    this.uniqueItemAcl=new Map();
    this.tables.people=[];this.tables.claims=[];
    for(const [i,actor] of [11,12,13].entries()){
      const registry=Object.fromEntries(sensitive.map((n,j)=>[n,{id:7000+actor*10+j,uniqueId:uuid(actor,j)}]));
      this.tables.people.push({Id:21+i,D01UserId:actor,D01Active:true,D01PrivateScopes:JSON.stringify(registry),'odata.etag':'"1"'});
      this.tables.claims.push({Id:101+i,ClaimantRecordId:21+i,ClaimMonthRecordId:31,ClaimMonth:'2026-10',SubmissionStatus:'Draft',ExpenseTotal:10,MileageTotal:2,OverallTotal:12,SubmissionVersion:1,D01Reservation:'',D01Checkpoint:'','odata.etag':'"1"'});
    }
    for(const n of names)for(const r of this.tables[n])this.assign(n,r,n==='people'?r.D01UserId:n==='claims'?11+r.Id-101:undefined);
    this.put(501,command('pdf'),11);
  }
  registry(actor){return JSON.parse(this.tables.people.find(r=>r.D01UserId===actor).D01PrivateScopes);}
  assign(n,row,actor){
    const folder=sensitive.includes(n)?this.p.roots[n]+'/'+actor:this.p.roots[n];
    Object.assign(row,{HasUniqueRoleAssignments:false,FileSystemObjectType:0,FileDirRef:folder,FileRef:folder+'/'+(n==='requests'?row.File.Name:row.Id+'_.000')});
    if(n==='requests')row.File.ServerRelativeUrl=row.FileRef;
    this.scopeItems.set(n+':'+row.Id,{actor,folder});
  }
  put(id,payload,actor){super.putRequest(id,payload,actor);const r=this.tables.requests.at(-1);r.File.UniqueId=uuid(actor,id);this.assign('requests',r,actor);}
  add(actor=12,kind='jpg',operation='test-operation-0001'){
    const payload=command(kind);payload.command.parentId=90+actor;payload.command.operationId=operation;const id=501+this.tables.requests.length;this.put(id,payload,actor);return id;
  }
  response(plan,status,data,bytes){return {status,url:plan.url,redirected:false,etag:data?.['odata.etag'],body:new ReadableStream({start(c){const b=bytes||Buffer.from(JSON.stringify(data??{}));for(let i=0;i<b.length;i+=8192)c.enqueue(new Uint8Array(b.subarray(i,i+8192)));c.close();}})};}
  roleRows(principals){return {value:principals.map(p=>({Member:{Id:p.id,PrincipalType:p.type},RoleDefinitionBindings:p.roles.map(r=>({Id:r.id,BasePermissions:{High:r.high,Low:r.low}}))}))};}
  principals(n,folderActor){
    let actual;
    if(folderActor!==undefined){
      if(this.scopeFlags.folderInherits===n)return this.principals(n);
      actual=[clone(this.nativePolicy.recovery),{id:99,type:1,roles:[clone(this.nativePolicy.processorRoles[n])]},{id:folderActor,type:1,roles:[clone(n==='requests'?this.nativePolicy.employeeRequest:this.nativePolicy.employeeRead)]}];
      if(this.scopeFlags.extraFolderRole===n)actual.push({id:88,type:1,roles:[clone(this.nativePolicy.employeeRead)]});
      if(this.scopeFlags.changedFolderMask===n)actual[1].roles[0].low=String(Number(actual[1].roles[0].low)|33554432);
    }else{
      actual=clone(this.nativePolicy.rootAcl[n]);if(this.scopeFlags.extraRootRole===n)actual.push({id:88,type:1,roles:[clone(this.nativePolicy.employeeRead)]});
    }
    return actual;
  }
  async send(plan){
    this.boundaryCalls.push(clone(plan));if(this.scopeHooks.before)await this.scopeHooks.before(this,plan);
    const relative=decodeURI(plan.url.slice(SITE.length+1)),u=new URL(plan.url);
    if(relative.startsWith('_api/web/currentuser'))return this.response(plan,200,{Id:this.scopeFlags.processorId??99,IsSiteAdmin:!!this.scopeFlags.processorAdmin});
    const user=/siteusers\/getbyid\((\d+)\)/.exec(relative);
    if(user)return this.response(plan,200,{Id:Number(user[1]),PrincipalType:1,IsSiteAdmin:this.scopeFlags.actorAdmin===Number(user[1])});
    if(relative.startsWith('_api/web/GetFolderByServerRelativePath')){
      const route=decodeURIComponent(u.pathname),folder=/decodedurl='([^']+)'/.exec(route)?.[1];
      const n=names.find(n=>folder?.startsWith(this.p.roots[n]+'/')),actor=Number(folder?.split('/').at(-1));
      if(!n||!this.tables.people.some(r=>r.D01UserId===actor))return this.response(plan,404);
      const r=this.registry(actor)[n];return this.response(plan,200,{UniqueId:this.scopeFlags.folderSubstitution===n?uuid(88,1):r.uniqueId,ServerRelativeUrl:folder,ListItemAllFields:{Id:r.id,HasUniqueRoleAssignments:this.scopeFlags.folderInherits!==n,FileSystemObjectType:1}});
    }
    const match=/lists\(guid'([^']+)'\)(.*)$/.exec(decodeURIComponent(u.pathname));assert(match,'unexpected endpoint '+plan.url);
    const n=names.find(n=>ids[n]===match[1]),tail=match[2];assert(n);
    if(!tail)return this.response(plan,200,{Id:ids[n],HasUniqueRoleAssignments:this.scopeFlags.rootInherits!==n,EnableVersioning:true,EnableAttachments:true,EnableFolderCreation:this.scopeFlags.foldersDisabled!==n,RootFolder:{ServerRelativeUrl:this.scopeFlags.rootMismatch===n?this.p.roots[n]+'-wrong':this.p.roots[n]}});
    if(tail.endsWith('/roleassignments')){
      let actual;
      const folderItem=/\/items\((\d+)\)/.exec(tail);
      if(folderItem){const pair=this.tables.people.map(r=>({actor:r.D01UserId,folder:this.registry(r.D01UserId)[n]})).find(x=>x.folder?.id===Number(folderItem[1]));assert(pair);actual=this.principals(n,pair.actor);}
      else actual=this.principals(n);
      const value=this.roleRows(actual);if(this.scopeFlags.aclPaged===n)value['@odata.nextLink']='blocked';
      if((this.scopeFlags.expandedRootAclPaged&&!folderItem)||(this.scopeFlags.expandedFolderAclPaged&&folderItem))value.value[0]['RoleDefinitionBindings@odata.nextLink']='blocked';
      return this.response(plan,200,value);
    }
    if(tail==='/fields'){
      const declared=fixtureFields()[n].map(f=>({InternalName:f.name,TypeAsString:f.type,Required:f.required,ReadOnlyField:false,Hidden:false,EnforceUniqueValues:!!f.unique,RichText:false,AppendOnly:false}));
      if(n==='people')declared.push({InternalName:'D01PrivateScopes',TypeAsString:'Note',Required:false,ReadOnlyField:false,RichText:false,AppendOnly:false});
      if(this.scopeFlags.indexRemoved===n)for(const f of declared)f.EnforceUniqueValues=false;
      if(n==='expenses'&&this.scopeFlags.categoryRequired)declared.push({InternalName:'ExpenseCategory',TypeAsString:'Text',Required:true,ReadOnlyField:false});
      let values=declared;const filter=u.searchParams.get('$filter');if(filter){const keys=[...filter.matchAll(/InternalName eq '([^']+)'/g)].map(m=>m[1]);values=values.filter(f=>keys.includes(f.InternalName));}
      return this.response(plan,200,{value:values});
    }
    if(tail==='/AddValidateUpdateItemUsingPath'){
      const b=plan.body,folder=new URL(b.listItemCreateInfo.FolderPath.DecodedUrl).pathname;
      assert.equal(b.listItemCreateInfo.UnderlyingObjectType,0);assert.equal(b.bNewDocumentUpdate,false);
      assert(n==='audit'?folder===this.p.roots[n]:this.tables.people.some(r=>folder===this.p.roots[n]+'/'+r.D01UserId));
      const mapping=this.p.fields[n],data={};
      for(const f of b.formValues){const [key,kind]=Object.entries(mapping).find(([,v])=>v.name===f.FieldName)||[];assert(key,'field must be explicitly mapped');data[key]=f.FieldValue===''?null:kind.kind==='Number'||kind.kind==='Lookup'?Number(f.FieldValue):kind.kind==='Boolean'?f.FieldValue==='1':f.FieldValue;}
      const key=n==='expenses'?'D01OperationKey':'OperationKey';
      if(this.tables[n].some(r=>r[key]===data[key]))return this.response(plan,409);
      const r=await super.transport({host:{operationId:'HttpRequest'},parameters:{dataset:SITE,'parameters/method':'POST','parameters/uri':`_api/web/lists(guid'${ids[n]}')/items`,'parameters/body':JSON.stringify(data),'parameters/headers':plan.headers}},'Scoped_Create_'+n);
      const created=this.tables[n].find(item=>item.Id===r.body.Id),actor=n==='audit'?data.D01ActorId:Number(folder.split('/').at(-1));assert(created);this.assign(n,created,actor);
      if(this.scopeFlags.rootCreated===n){created.FileDirRef=this.p.roots[n];created.FileRef=this.p.roots[n]+'/'+created.Id+'_.000';this.scopeItems.set(n+':'+created.Id,{folder:this.p.roots[n]});}
      this.creates.push({n,id:created.Id,folder,method:'AddValidateUpdateItemUsingPath'});
      if(this.scopeFlags.lostAck===n){delete this.scopeFlags.lostAck;throw Error('PRIVATE_LOST_ACK');}
      const values=[...b.formValues.map(f=>({...f,HasException:false,ErrorMessage:null,ItemId:0})),{FieldName:'Id',FieldValue:String(created.Id),HasException:false,ErrorMessage:null,ItemId:0}];
      if(this.scopeFlags.fieldError===n)values[0].HasException=true;
      if(this.scopeFlags.misleadingId===n)values.at(-1).FieldValue='9999';
      return this.response(plan,200,{value:values});
    }
    const item=/^\/items(?:\((\d+)\))?(.*)$/.exec(tail);assert(item);
    const itemId=item[1]?Number(item[1]):undefined;
    if(item[2]==='/File/$value'){const row=this.tables.requests.find(r=>r.Id===itemId);return this.response(plan,row?200:404,undefined,row&&this.files.get(row.File.ServerRelativeUrl));}
    if(plan.method==='GET'&&!itemId&&n==='claims'){
      const f=/^ClaimantRecordId eq (\d+) and ClaimMonth eq '(20\d{2}-\d{2})' and SubmissionStatus eq 'Draft'$/.exec(u.searchParams.get('$filter'));assert(f);
      const values=this.tables.claims.filter(r=>r.ClaimantRecordId===Number(f[1])&&r.ClaimMonth===f[2]&&r.SubmissionStatus==='Draft');return this.response(plan,200,{value:values});
    }
    const body=plan.body instanceof Uint8Array?Buffer.from(plan.body):plan.body===undefined?undefined:JSON.stringify(plan.body);
    const result=await super.transport({host:{operationId:'HttpRequest'},parameters:{dataset:SITE,'parameters/method':plan.method,'parameters/uri':relative,'parameters/body':body,'parameters/headers':plan.headers}},'Scoped_'+plan.method+'_'+n);
    if(item[2].endsWith('/$value'))return this.response(plan,200,undefined,Buffer.from(result.body.$content,'base64'));
    return this.response(plan,plan.method==='POST'&&!item[2]?204:plan.method==='POST'?201:200,result.body);
  }
  rawGet(actor,n,id,receipt=false){
    // ACL inheritance, not the business D01ActorId, decides fake raw access.
    const scope=this.scopeItems.get(n+':'+id),row=this.tables[n].find(r=>r.Id===id);
    if(!scope||!row)return {status:404};
    const inherited=scope.folder===this.p.roots[n]?this.principals(n)
      :scope.folder===this.p.roots[n]+'/'+scope.actor?this.principals(n,scope.actor):[];
    const acl=row.HasUniqueRoleAssignments?this.uniqueItemAcl.get(n+':'+id)||[]:inherited;
    const allowed=acl.some(p=>(p.type===1?p.id===actor:this.groups.get(p.id)?.has(actor))&&p.roles.some(r=>(BigInt(r.low)&1n)===1n));
    if(!allowed)return {status:403};
    if(receipt&&!this.attachments.get(id)?.size)return {status:404};
    return {status:200,body:receipt?Buffer.from(this.attachments.get(id).values().next().value):clone(row)};
  }
}


module.exports={ScopedTenant,storeSchema,policy,receipts,command};
