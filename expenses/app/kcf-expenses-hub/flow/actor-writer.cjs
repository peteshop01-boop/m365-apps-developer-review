'use strict';
// Build-time composition of the EXISTING financial state machine with native
// actor/private-folder WDL. No JS hosting, tenant connection or activation.
const {buildFlow,buildActorAdmissionFlow,nativeWdl:n}=require('./build-flow.cjs');
const {writerProof:p,actorContext}=require('./actor-admission.cjs');
const {schema:fixtureSchema}=require('./private-fixture.cjs');
const {graph,B,O,D,ex,eq,all,uri,itemUri,SECURE,id,str,obj,http}=n;
const own={type:'object',additionalProperties:true};
const childFields=['Id','FileDirRef','FileRef','FileSystemObjectType','HasUniqueRoleAssignments'];
const writable=['operations','results','audit','expenses'];
const crypto=require('node:crypto');
const guardKey=(name,phase)=>phase+'_'+crypto.createHash('sha256').update(name).digest('hex').slice(0,10);
const fieldMap=Object.fromEntries(writable.map(name=>[name,Object.fromEntries(fixtureSchema()[name].map(f=>[f.name==='ClaimSubmissionRef'?'ClaimSubmissionRefId':f.name,{name:f.name,type:f.type,required:f.required}]))]));
const base='https://example.invalid';
const selectFields=name=>[...childFields,...(['operations','results','audit'].includes(name)?['D01ActorId','ParentId','AuthorId']:name==='expenses'?['D01Originator','ClaimSubmissionRefId','AuthorId']:name==='people'?['D01UserId']:name==='claims'?['ClaimantRecordId']:[])];
function writerFieldContract(g){
  n.fieldContract(g);
  const known=JSON.stringify(Object.values(fieldMap.expenses).map(f=>f.name.toLowerCase()));
  g.add('Unknown_Required_Expense_Fields',{type:'Query',inputs:{from:ex(D('Expense_Field_Contract')+"?['value']"),where:ex(all(eq("item()?['Required']",'true'),eq("item()?['ReadOnlyField']",'false'),`not(contains(json('${known}'),toLower(item()?['InternalName'])))`))},runtimeConfiguration:SECURE});
  p.assertion(g,'No_Unknown_Required_Expense_Field',`empty(${D('Unknown_Required_Expense_Fields')})`);
}
function nativeChild(name,itemId){
  const path=p.folders.includes(name)?p.folder(name):p.root(name);
  const properties={Id:{...id,...(itemId?{enum:[ex(itemId)]}:{})},FileDirRef:{type:'string',enum:[ex(path)]},
    FileRef:{type:'string',pattern:ex(`concat('^',${path},'/(?!\\.{1,2}$)[A-Za-z0-9_. -]+$')`)},
    FileSystemObjectType:{type:'integer',enum:[0]},HasUniqueRoleAssignments:{type:'boolean',enum:[false]}};
  if(['operations','results','audit'].includes(name))Object.assign(properties,{D01ActorId:{...id,enum:[ex(O('Actor'))]},ParentId:{...id,enum:[ex(O('Command')+"?['parentId']")]},AuthorId:{...id,enum:[ex(B('processorActorId'))]}});
  if(name==='expenses')Object.assign(properties,{D01Originator:{...id,enum:[ex(O('Actor'))]},ClaimSubmissionRefId:{...id,enum:[ex(O('Command')+"?['parentId']")]},AuthorId:{...id,enum:[ex(B('processorActorId'))]}});
  if(name==='people')properties.D01UserId={...id,enum:[ex(O('Actor'))]};
  if(name==='claims')properties.ClaimantRecordId={...id,enum:[ex(O('Initial_Roster_Person')+"?['Id']")]};
  if(name==='operations')Object.assign(properties,{State:{type:'string',enum:['Pending','Completed','Rejected']},RequestId:id,OperationKey:{type:'string',enum:[ex(O('Operation_Key'))]}});
  if(name==='requests')Object.assign(properties,{AuthorId:{...id,enum:[ex(O('Actor'))]},EditorId:{...id,enum:[ex(O('Actor'))]},OData__UIVersionString:{type:'string',enum:['1.0']},
    File:{...own,required:['Name','ServerRelativeUrl','UniqueId','Length','ETag'],properties:{Name:str(85,'^[A-Za-z0-9-]{16,80}\\.json$'),ServerRelativeUrl:str(255),UniqueId:n.guid,Length:str(8,'^[1-9][0-9]{0,7}$'),ETag:str(200,'^"[^"\\r\\n]+"$')}}});
  return {...own,required:Object.keys(properties),properties};
}
function childRead(g,label,name,feed=false,itemId){
  const schema=feed?{...own,required:['value'],properties:{value:{type:'array',maxItems:200,items:nativeChild(name)}}}:nativeChild(name,itemId);
  p.parse(g,label+'_Private_Child',ex(D(label)),schema);
  if(name==='requests'){
    // Before privileged bytes, native FileRef/Name/URL must be one exact child.
    p.assertion(g,label+'_Exact_File',all(eq(D(label)+"?['AuthorId']",O('Actor')),eq(D(label)+"?['EditorId']",O('Actor')),
      eq(D(label)+"?['FileRef']",D(label)+"?['File']?['ServerRelativeUrl']"),eq(D(label)+"?['FileRef']",`concat(${p.folder('requests')},'/',${D(label)}?['File']?['Name'])`)));
  }
}
function addSelectedParent(g){
  const fields=selectFields('operations').join(',');
  g.get('Writer_Initial_Ledger',`concat('_api/web/lists(guid''',${B('operations')},''')/items?$select=*,${fields}&$filter=OperationKey eq ''',${O('Operation_Key')},'''&$top=2')`);
  childRead(g,'Writer_Initial_Ledger','operations',true);
  p.assertion(g,'Writer_Ledger_Complete',all(p.complete(D('Writer_Initial_Ledger')),`lessOrEquals(length(${D('Writer_Initial_Ledger')}?['value']),1)`));
  const found=`first(${D('Writer_Initial_Ledger')}?['value'])`;
  const historical=graph(),fresh=graph();
  p.parse(historical,'Historical_Ledger_Types',ex(found),{...own,required:['State','ParentId','RequestId','OperationKey'],properties:{State:{type:'string',enum:['Completed','Rejected']},ParentId:id,RequestId:id,OperationKey:{type:'string',enum:[ex(O('Operation_Key'))]}}});
  historical.set('Historical_Parent_ID','selectedParent',ex(found+"?['ParentId']"));
  fresh.get('Writer_Own_Drafts',`concat('_api/web/lists(guid''',${B('claims')},''')/items?$select=*,${selectFields('claims').join(',')}&$filter=ClaimantRecordId eq ',string(${O('Initial_Roster_Person')}?['Id']),' and ClaimMonth eq ''',substring(${O('Date_ISO')},0,7),''' and SubmissionStatus eq ''Draft''&$top=2')`);
  childRead(fresh,'Writer_Own_Drafts','claims',true);
  p.assertion(fresh,'Writer_One_Draft',all(p.complete(D('Writer_Own_Drafts')),eq(`length(${D('Writer_Own_Drafts')}?['value'])`,'1')));
  fresh.set('Writer_Draft_ID','selectedParent',ex(`first(${D('Writer_Own_Drafts')}?['value'])?['Id']`));
  g.branch('Writer_Historical',`or(equals(${found}?['State'],'Completed'),equals(${found}?['State'],'Rejected'))`,historical.actions,fresh.actions);
  g.get('Writer_Selected_Parent',itemUri('claims',"variables('selectedParent')",'?$select=*,'+selectFields('claims').join(',')));
  childRead(g,'Writer_Selected_Parent','claims',false,"variables('selectedParent')");
  p.assertion(g,'Writer_Selected_Binding',all(eq(D('Writer_Selected_Parent')+"?['Id']",O('Command')+"?['parentId']"),eq(D('Writer_Selected_Parent')+"?['ClaimMonth']",`substring(${O('Date_ISO')},0,7)`)));
  p.assertion(g,'Fresh_Original_Parent_Version',`or(not(empty(${D('Writer_Initial_Ledger')}?['value'])),equals(coalesce(${D('Writer_Selected_Parent')}?['odata.etag'],${D('Writer_Selected_Parent')}?['@odata.etag']),${O('Command')}?['parentEtag']))`);
}
function checkpoint(g,label,resources=p.names){
  const roster=graph();
  p.roster(roster,label);p.assertion(roster,label+'_Same_Registry',eq(`string(${O(label+'_Roster_Person')})`,`string(${O('Initial_Roster_Person')})`));
  proofStage(g,label+'_Roster_Stage',roster);
  p.roots(g,label,resources);p.privateFolders(g,label,resources.filter(n=>p.folders.includes(n)));
  // Native user/admin and recovery membership may not change after bootstrap.
  g.get(label+'_User',`concat('_api/web/siteusers/getbyid(',string(${O('Actor')}),')?$select=Id,PrincipalType,IsSiteAdmin')`);
  g.get(label+'_Groups',`concat('_api/web/siteusers/getbyid(',string(${O('Actor')}),')/groups?$select=Id,PrincipalType&$top=201')`);
  p.assertion(g,label+'_Identity',all(eq(`string(${D(label+'_User')})`,`string(${D('Native_User')})`),eq(`string(${D(label+'_Groups')})`,`string(${D('Native_User_Groups')})`)));
  g.get(label+'_Field',uri('people',"/fields/getbyinternalnameortitle('D01PrivateScopes')?$select=InternalName,TypeAsString,ReadOnlyField,RichText,AppendOnly"));
  p.assertion(g,label+'_Same_Field',eq(`string(${D(label+'_Field')})`,`string(${D('Registry_Field')})`));
  g.get(label+'_Processor',"'_api/web/currentuser?$select=Id,IsSiteAdmin'");
  p.assertion(g,label+'_Same_Processor',eq(`string(${D(label+'_Processor')})`,`string(${D('Processor_Identity')})`));
}
function proofStage(g,name,source){
  // Fixed read-only source block; no request plan, cached decision, write or
  // binary read. The fusion pass normalises exact failed guards in order.
  for(const a of Object.values(source.actions)){
    if(['ParseJson','Compose','Select','Query'].includes(a.type))continue;
    if(a.type==='OpenApiConnection'&&a.inputs.host.operationId==='HttpRequest'&&a.inputs.parameters['parameters/method']==='GET')continue;
    if(compactGuard(a))continue;
    throw Error('UNQUALIFIED_READONLY_PROOF_STAGE '+name);
  }
  g.add(name,{type:'Scope',actions:source.actions,runtimeConfiguration:SECURE});
}
function resourceProof(g,label,name){
  // A read still proves its actual native target, complete ACL and private
  // folder before/after consuming it. Global identity/roster/registry proof is
  // executed afresh at writes, privileged bytes and terminal boundaries.
  // No Boolean permission result or old root/folder snapshot is reused here.
  p.roots(g,label,[name]);
  if(p.folders.includes(name))p.privateFolders(g,label,[name]);
}
function requestBytes(g,name,action){
  // GetFileContentByPath is not HttpRequest GET /$value. Include the initial
  // actor-context copy as well as canonical/recovery/terminal byte reads.
  checkpoint(g,guardKey(name,'BytesPre'),['requests','people']);
  g.add(name,action);
  checkpoint(g,guardKey(name,'BytesPost'),['requests','people']);
}
function createInFolder(g,label,name,expectedBody){
  const mapping=fieldMap[name];if(!mapping)throw Error('UNQUALIFIED_CREATE_RESOURCE');
  const expected=O(expectedBody),values=Object.keys(g.actions[expectedBody].inputs).map(key=>{
    const f=mapping[key];if(!f||/^(Author|Editor|Created|Modified|ExpenseCategory|Id$)/i.test(f.name))throw Error('UNMAPPED_CREATE_FIELD '+name+'.'+key);
    return {FieldName:f.name,FieldValue:ex(f.type==='Boolean'?`if(${expected}?['${key}'],'1','0')`:`string(${expected}?['${key}'])`)};
  });
  g.compose(label+'_Form_Values',values);
  const dest=name==='audit'?p.root(name):p.folder(name);
  g.compose(label+'_Path_Body',{listItemCreateInfo:{FolderPath:{DecodedUrl:ex(`concat('${base}',${dest})`)},UnderlyingObjectType:0},formValues:ex(O(label+'_Form_Values')),bNewDocumentUpdate:false});
  g.add(label,http('POST',uri(name,'/AddValidateUpdateItemUsingPath'),ex(`string(${O(label+'_Path_Body')})`)));
  const ack={...own,required:['FieldName','FieldValue','HasException','ErrorMessage','ItemId'],properties:{FieldName:{type:'string'},FieldValue:{type:'string'},HasException:{type:'boolean',enum:[false]},ErrorMessage:{enum:[null,'']},ItemId:{type:'integer',minimum:0,maximum:2147483647}}};
  p.parse(g,label+'_ACK_Types',ex(D(label)),{...own,required:['value'],properties:{value:{type:'array',minItems:values.length+1,maxItems:values.length+1,items:ack}}});
  g.add(label+'_ACK_ID',{type:'Query',inputs:{from:ex(D(label)+"?['value']"),where:"@equals(item()?['FieldName'],'Id')"},runtimeConfiguration:SECURE});
  p.parse(g,label+'_ACK_ID_Types',ex(D(label+'_ACK_ID')),{type:'array',minItems:1,maxItems:1,items:{...ack,properties:{...ack.properties,FieldValue:str(10,'^[1-9][0-9]{0,9}$')}}});
  const created=`int(first(${D(label+'_ACK_ID')})?['FieldValue'])`;
  g.add(label+'_ACK_Fields',{type:'Select',inputs:{from:ex(D(label)+"?['value']"),select:{FieldName:"@item()?['FieldName']",FieldValue:"@item()?['FieldValue']"}},runtimeConfiguration:SECURE});
  g.add(label+'_ACK_Wrong_Item',{type:'Query',inputs:{from:ex(D(label)+"?['value']"),where:ex(all(`not(equals(item()?['ItemId'],0))`,`not(equals(item()?['ItemId'],${created}))`))},runtimeConfiguration:SECURE});
  p.assertion(g,label+'_ACK_Bound',all(p.complete(D(label)),`lessOrEquals(${created},2147483647)`,eq(`length(intersection(${D(label+'_ACK_Fields')},${O(label+'_Form_Values')}))`,String(values.length)),`empty(${D(label+'_ACK_Wrong_Item')})`));
  g.get(label+'_Native',itemUri(name,created,'?$select=*,'+selectFields(name).join(',')));
  const checks=Object.keys(g.actions[expectedBody].inputs).map(key=>{
    const f=mapping[key],actual=D(label+'_Native')+`?['${key}']`,want=expected+`?['${key}']`;
    if(f.type==='DateTime')return eq(`substring(${actual},0,10)`,want);
    if(!f.required&&f.type==='Note')return eq(`coalesce(${actual},'')`,`coalesce(${want},'')`);
    return eq(actual,want);
  });p.assertion(g,label+'_Native_Fields',all(eq(D(label+'_Native')+"?['Id']",created),...checks));
}
function compactGuard(a){
  if(a.type!=='If'||Object.keys(a.actions).length||Object.values(a.else?.actions||{}).length!==1)return null;
  const stop=Object.values(a.else.actions)[0];if(stop.type!=='Terminate'||stop.inputs.runStatus!=='Failed')return null;
  return {type:'ParseJson',inputs:{content:{valid:a.expression},schema:obj({valid:{type:'boolean',enum:[true]}})},runtimeConfiguration:SECURE};
}
function resource(a){return /parameters\('Bindings'\)\?\['(requests|operations|results|audit|expenses|claims|people|months|nominals)'\]/.exec(a.inputs?.parameters?.['parameters/uri']||'')?.[1];}
function rewrite(v){
  if(typeof v==='string'){
    // Namespace only the three colliding source action identifiers. Actor/root
    // substitution is supplied explicitly by readRequest, never string-patched.
    for(const name of ['Initial_Roster','Initial_Roster_Types','Initial_Roster_Bound'])for(const fn of ['body','outputs'])v=v.replaceAll(`${fn}('${name}')`,`${fn}('Financial_${name}')`);
    return v;
  }
  if(Array.isArray(v))return v.map(rewrite);return v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rewrite(x)])):v;
}
function scopedGraph(){
  const rawGraph=graph(),g={actions:rawGraph.actions};
  function proof(label,name){checkpoint(rawGraph,label,[...new Set([name,'people'])]);}
  function itemProof(label,name,address){
    const m=/\/items\(',string\((.*)\),'\)/.exec(address||'');
    if(!m)throw Error('UNQUALIFIED_NATIVE_ITEM_ADDRESS '+label);
    const point=label+'_Item';rawGraph.get(point,itemUri(name,m[1],'?$select=*,'+selectFields(name).join(',')));childRead(rawGraph,point,name,false,m[1]);
  }
  function schemaProof(label){
    const q=graph();writerFieldContract(q);
    // The source field predicates are reused exactly, with names localised per
    // write boundary; schema removal cannot gain a publication window.
    const map=Object.fromEntries(Object.keys(q.actions).map(k=>[k,label+'_'+k]));
    const rename=v=>typeof v==='string'?v.replace(/\b(body|outputs)\('([^']+)'\)/g,(all,fn,k)=>map[k]?`${fn}('${map[k]}')`:all):Array.isArray(v)?v.map(rename):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rename(x)])):v;
    for(const [name,a]of Object.entries(q.actions)){const v=rename(structuredClone(a));delete v.runAfter;rawGraph.add(map[name],compactGuard(v)||v);}
  }
  g.add=(original,raw)=>{
    const name=original.startsWith('Initial_Roster')?original.replace('Initial_Roster','Financial_Initial_Roster'):original;
    const a=rewrite(structuredClone(raw));delete a.runAfter;
    const compact=compactGuard(a);if(compact)return rawGraph.add(name,compact);
    if(a.type!=='OpenApiConnection'){
      if(name==='Storage_Verified')terminal(g,rawGraph);
      if(name==='Existing_Reject_Needs_Clear'||name==='Acquire_Rejection')rejectedAbsence(g,rawGraph,guardKey(name,'NoLine'));
      if(name==='Existing_Rejected_Outcome'||name==='Rejected_Outcome')rejectedTerminal(g,rawGraph,name==='Existing_Rejected_Outcome'?'Recover_End':'Reject_End');
      return rawGraph.add(name,a);
    }
    if(a.inputs.host.operationId==='GetFileContentByPath'){
      requestBytes(rawGraph,name,a);return name;
    }
    const n=resource(a),params=a.inputs.parameters,method=params['parameters/method'],address=params['parameters/uri'];
    if(method==='POST'&&n&&address.endsWith("/items')")){
      proof(guardKey(name,'Pre'),n);schemaProof(guardKey(name,'Schema'));
      if(!params['parameters/body']||typeof params['parameters/body']!=='object')throw Error('MISSING_NATIVE_CREATE_BODY '+name);
      const bodyName=name+'_Body';g.compose(bodyName,params['parameters/body']);
      createInFolder(g,name,n,bodyName);return name;
    }
    if(n&&method==='POST'&&address.endsWith("/AddValidateUpdateItemUsingPath')")){
      rawGraph.add(name,a);proof(guardKey(name,'Post'),n);schemaProof(guardKey(name,'AfterSchema'));return name;
    }
    if(n&&(method==='POST'||method==='GET'&&address.endsWith('/$value'))){
      const before=guardKey(name,'Pre'),after=guardKey(name,'Post');
      proof(before,n);itemProof(before,n,address);if(method==='POST')schemaProof(guardKey(name,'Schema'));
      rawGraph.add(name,a);proof(after,n);itemProof(after,n,address);if(method==='POST')schemaProof(guardKey(name,'AfterSchema'));return name;
    }
    if(method==='GET'&&n&&address.includes('/items')&&!address.includes('/AttachmentFiles')){
      resourceProof(rawGraph,guardKey(name,'Pre'),n);
      const fields=selectFields(n).join(',');
      params['parameters/uri']=address.includes('?$select=')?address.replace('?$select=','?$select='+fields+','):address.replace('/items?$filter','/items?$select='+fields+'&$filter');
      const item=/\/items\(',string\((.*)\),'\)/.exec(address);
      if(address.includes('/items(')&&!item)throw Error('UNQUALIFIED_NATIVE_READ_ADDRESS '+name);
      rawGraph.add(name,a);childRead(g,name,n,!item,item?.[1]);resourceProof(rawGraph,guardKey(name,'Post'),n);return name;
    }
    if(n&&method==='GET'){
      const before=guardKey(name,'Pre'),after=guardKey(name,'Post');resourceProof(rawGraph,before,n);
      if(address.includes('/AttachmentFiles'))itemProof(before,n,address);
      rawGraph.add(name,a);resourceProof(rawGraph,after,n);if(address.includes('/AttachmentFiles'))itemProof(after,n,address);return name;
    }
    return rawGraph.add(name,a);
  };
  g.compose=(name,inputs)=>g.add(name,{type:'Compose',inputs,runtimeConfiguration:SECURE});
  g.get=(name,address)=>g.add(name,http('GET',address));
  g.guard=(name,expression,code=name.toUpperCase())=>g.add(name,{type:'If',expression:ex(expression),actions:{},else:{actions:{[name+'_Hold']:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code,message:code}},runAfter:{}}}}});
  g.branch=(name,expression,yes,no={})=>g.add(name,{type:'If',expression:ex(expression),actions:yes,else:{actions:no}});
  g.set=(name,variable,value)=>g.add(name,{type:'SetVariable',inputs:{name:variable,value},runtimeConfiguration:SECURE});
  g.fork=()=>scopedGraph();
  g.readRequest=(prefix,requestId)=>{
    const select=n.requestMetadataSelect.replace('Id,AuthorId','Id,FileDirRef,FileRef,FileSystemObjectType,AuthorId');
    g.get(prefix+'_Before',itemUri('requests',requestId,select));
    n.metadataContent(g,prefix,requestId,O('Actor'),select,p.root('requests'));
  };
  return g;
}
function terminal(g,raw){
  // Reread actual terminal records after release; earlier private snapshots or
  // output objects cannot alone authorise StorageVerified.
  g.readRequest('Last_Canonical',O('Ledger')+"?['RequestId']");
  p.assertion(raw,'Last_Sealed_Bytes',eq(D('Last_Canonical_Binary')+"?['$content']",D('Incoming_Binary')+"?['$content']"));
  for(const [label,source]of [['Last_Expense','Final_Line'],['Last_Ledger','Ledger_Verified'],['Last_Result','Result_Verified'],['Last_Audit','Terminal_Audit'],['Last_Parent','Released_Parent']]){
    const plan=structuredClone(g.actions[source]);delete plan.runAfter;g.add(label,plan);
    p.assertion(raw,label+'_Unchanged',eq(`string(${D(label)})`,`string(${D(source)})`));
  }
  const receipt=O('Command')+"?['receipt']",yes=g.fork(),no=g.fork();
  yes.get('Last_Receipt',`concat('_api/web/lists(guid''',${B('expenses')},''')/items(',string(${O('Line')}?['Id']),')/AttachmentFiles/getByFileName(''',uriComponent(${receipt}?['fileName']),''')/$value')`);
  p.assertion(yes,'Last_Exact_Bytes',eq(D('Last_Receipt')+"?['$content']",receipt+"?['bytes']"));
  no.get('Last_No_Receipt',itemUri('expenses',O('Line')+"?['Id']",'/AttachmentFiles?$select=FileName&$top=2'));
  p.assertion(no,'Last_Absent_Receipt',all(p.complete(D('Last_No_Receipt')),`empty(${D('Last_No_Receipt')}?['value'])`));
  g.branch('Last_Receipt_Binding',eq(receipt+"?['kind']","'file'"),yes.actions,no.actions);
  checkpoint(raw,'Last_Scope');
}
function rejectedAbsence(g,raw,label){
  g.get(label,`concat('_api/web/lists(guid''',${B('expenses')},''')/items?$filter=D01OperationKey eq ''',${O('Operation_Key')},'''&$top=2')`);
  p.assertion(raw,label+'_Empty',all(p.complete(D(label)),`empty(${D(label)}?['value'])`));
}
function rejectedTerminal(g,raw,label){
  // Rejected is a real terminal answer too. Do not publish it from an old
  // result snapshot, clear a reservation over a partial expense, or skip the
  // fresh release/canonical/ledger/result/private-scope proof.
  g.readRequest(label+'_Canonical',O('Ledger')+"?['RequestId']");
  p.assertion(raw,label+'_Same_Request',eq(D(label+'_Canonical_Binary')+"?['$content']",D('Incoming_Binary')+"?['$content']"));
  g.get(label+'_Ledger',itemUri('operations',O('Ledger')+"?['Id']",'?$select=*'));
  p.parse(raw,label+'_Ledger_Bound',ex(D(label+'_Ledger')),{...own,required:['State','ResultId','RequestId','OperationKey'],properties:{State:{type:'string',enum:['Rejected']},ResultId:id,
    RequestId:{...id,enum:[ex(O('Ledger')+"?['RequestId']")]},OperationKey:{type:'string',enum:[ex(O('Operation_Key'))]}}});
  g.get(label+'_Result',itemUri('results',D(label+'_Ledger')+"?['ResultId']",'?$select=*'));
  p.parse(raw,label+'_Result_Bound',ex(D(label+'_Result')),{...own,required:['State','RequestId','OperationKey','RecordJson'],properties:{State:{type:'string',enum:['Rejected']},
    RequestId:{...id,enum:[ex(O('Ledger')+"?['RequestId']")]},OperationKey:{type:'string',enum:[ex(O('Operation_Key'))]},RecordJson:{enum:['',null]}}});
  rejectedAbsence(g,raw,label+'_No_Line');
  g.get(label+'_Parent',itemUri('claims',O('Command')+"?['parentId']",'?$select=*'));
  p.assertion(raw,label+'_Released',all(`empty(${D(label+'_Parent')}?['D01Reservation'])`,eq(D(label+'_Parent')+"?['ClaimMonth']",`substring(${O('Date_ISO')},0,7)`)));
  checkpoint(raw,label+'_Scope');
}
function buildActorProcessorFlow(){
  const context=actorContext(),flow=context.flow,prefix=context.g.actions,g=graph();
  for(const [name,a]of Object.entries(prefix)){
    const v=compactGuard(a)||structuredClone(a);delete v.runAfter;
    if(v.inputs?.host?.operationId==='GetFileContentByPath')requestBytes(g,name,v);else g.add(name,v);
  }
  g.compose('Operation_Key',ex(`concat(string(${O('Actor')}),':',${O('Command')}?['operationId'])`));
  addSelectedParent(g);
  // Reuse rather than copy/reimplement the accepted field, money, idempotency,
  // reservation, audit, terminal and receipt state machine.
  const financial=scopedGraph();writerFieldContract(financial);n.financialActions(financial);
  for(const [name,a]of Object.entries(financial.actions)){const v=structuredClone(a);delete v.runAfter;g.add(name,v);}
  flow.properties.definition.actions.Initialise.inputs.variables.push({name:'selectedParent',type:'integer',value:0});
  flow.properties.definition.actions.Process.actions=g.actions;
  return flow;
}
module.exports={buildActorProcessorFlow};
