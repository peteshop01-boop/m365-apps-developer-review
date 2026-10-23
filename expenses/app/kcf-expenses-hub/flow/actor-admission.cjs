'use strict';
// Executable WDL admission increment for the SAME D01 processor, not a JS
// runtime/hosting service. Every path ends Held; no financial graph fallthrough.
const {buildFlow,nativeWdl:n}=require('./build-flow.cjs');
const {graph,B,O,D,ex,eq,all,uri,itemUri,SECURE,metadataContent,id,str,obj,guid}=n;
const names=['requests','operations','results','audit','expenses','claims','people','months','nominals'];
const folders=['requests','operations','results','expenses','claims','people'];
const limited={id:1073741825,high:'48',low:'134287360'};
const full={id:1073741829,high:'2147483647',low:'4294967295'};
const processorLow=name=>String(65536+131072+32+64+67108864+134217728+(name==='claims'?5:['expenses','operations'].includes(name)?7:['results','audit'].includes(name)?3:1));
const role=obj({id,high:str(10,'^(0|[1-9][0-9]{0,9})$'),low:str(10,'^(0|[1-9][0-9]{0,9})$')});
const roleArray={type:'array',minItems:1,maxItems:3,uniqueItems:true,items:role};
const principal=obj({id,type:{type:'integer',enum:[1,8]},roles:roleArray});
const employee=mask=>obj({id,high:{type:'string',enum:['0']},low:{type:'string',enum:[0,32,4096,4128].map(extra=>String(65536+131072+mask+extra))}});
const bindingSchema=obj({...Object.fromEntries(names.map(name=>[name,guid])),processorActorId:id,
  roots:obj(Object.fromEntries(names.map(name=>[name,str(200,`^/sites/REVIEW-TEST-SITE/${name==='requests'?'':'Lists/'}KCFEXP_TEST102_D01_[a-f0-9]{12}_${name}$`)]))),
  recovery:obj({id,type:{type:'integer',enum:[8]},roles:{type:'array',enum:[[full],[full,limited],[limited,full]]}}),
  processorRoles:obj(Object.fromEntries(names.map(name=>[name,obj({id,high:{type:'string',enum:['1073741824']},low:{type:'string',enum:[processorLow(name)]}})]))),
  employeeRead:employee(1),employeeRequest:employee(3),
  rootAcl:obj(Object.fromEntries(names.map(name=>[name,{type:'array',minItems:2,maxItems:200,uniqueItems:true,items:principal}]))),
  registryField:{type:'string',enum:['D01PrivateScopes']}});
const registrySchema=obj(Object.fromEntries(folders.map(name=>[name,obj({id,uniqueId:guid})])));
const root=name=>`${B('roots')}?['${name}']`;
const folder=name=>`concat(${root(name)},'/',string(${O('Actor')}))`;
const dynamic=(collection,key)=>`${B(collection)}?[${key}]`;
const dynamicUri=(key,suffix)=>`concat('_api/web/lists(guid''',parameters('Bindings')?[${key}],''')${suffix.replace(/'/g,"''")}')`;
const dynamicItemUri=(key,item,suffix)=>`concat('_api/web/lists(guid''',parameters('Bindings')?[${key}],''')/items(',string(${item}),')${suffix.replace(/'/g,"''")}')`;
const each=(g,name,values,body)=>g.add(name,{type:'Foreach',foreach:ex(`json('${JSON.stringify(values)}')`),actions:body.actions,runtimeConfiguration:{...SECURE,concurrency:{repetitions:1}}});
const own={type:'object',additionalProperties:true};
const nativeRole={...own,required:['Id','BasePermissions'],properties:{Id:id,BasePermissions:{...own,required:['High','Low'],properties:{High:role.properties.high,Low:role.properties.low}}}};
const nativeAssignment={...own,required:['Member','RoleDefinitionBindings'],properties:{Member:{...own,required:['Id','PrincipalType'],properties:{Id:id,PrincipalType:{type:'integer',enum:[1,8]}}},RoleDefinitionBindings:{type:'array',minItems:1,maxItems:3,items:nativeRole}}};
const feed=items=>({...own,required:['value'],properties:{value:{type:'array',maxItems:200,items}}});
const parse=(g,name,content,schema)=>g.add(name,{type:'ParseJson',inputs:{content,schema},runtimeConfiguration:SECURE});
const complete=value=>all(...['odata.nextLink','@odata.nextLink','__next'].map(key=>`not(contains(${value},'${key}'))`));
function assertion(g,name,condition) {
  // ParseJson failure propagates out of Foreach. Terminate is not placed inside
  // a loop, and no mutable variable is used as a permission override.
  parse(g,name,{valid:ex(condition)},obj({valid:{type:'boolean',enum:[true]}}));
}
function acl(g,prefix,address,expected,processorProfile,rootScope,referenceScope='false') {
  g.get(prefix,address);parse(g,prefix+'_Types',ex(D(prefix)),feed(nativeAssignment));
  g.add(prefix+'_Ids',{type:'Select',inputs:{from:ex(D(prefix)+"?['value']"),select:ex("item()?['Member']?['Id']")},runtimeConfiguration:SECURE});
  g.add(prefix+'_Expected_Ids',{type:'Select',inputs:{from:ex(expected),select:ex("item()?['id']")},runtimeConfiguration:SECURE});
  // Typed positive IDs, BOTH uniqueness checks and exact ID equality must pass
  // before building or indexing the data map. No overwritten duplicate keys.
  assertion(g,prefix+'_Complete',all(complete(D(prefix)),eq(`length(${D(prefix)}?['value'])`,`length(${expected})`),
    eq(`length(union(${D(prefix+'_Ids')},${D(prefix+'_Ids')}))`,`length(${D(prefix+'_Ids')})`),
    eq(`length(union(${D(prefix+'_Expected_Ids')},${D(prefix+'_Expected_Ids')}))`,`length(${D(prefix+'_Expected_Ids')})`),
    eq(`length(intersection(${D(prefix+'_Ids')},${D(prefix+'_Expected_Ids')}))`,`length(${D(prefix+'_Ids')})`),
    `contains(${D(prefix+'_Ids')},${B('recovery')}?['id'])`,`contains(${D(prefix+'_Ids')},${B('processorActorId')})`));
  g.add(prefix+'_Expected_Entries',{type:'Select',inputs:{from:ex(expected),select:ex(`concat('"',string(item()?['id']),'":',string(item()))`)},runtimeConfiguration:SECURE});
  g.compose(prefix+'_Expected_Map',ex(`json(concat('{',join(${D(prefix+'_Expected_Entries')},','),'}'))`));
  // Native role arrays were typed/capped at1..3 above. First/last and an
  // in-range take avoid missing-index access and eager conditional hazards.
  const native="item()?['RoleDefinitionBindings']";
  const positions=[`first(${native})`,`last(take(${native},if(greater(length(${native}),1),2,1)))`,`last(${native})`];
  const projected=positions.map(r=>({id:ex(r+"?['Id']"),high:ex(r+"?['BasePermissions']?['High']"),low:ex(r+"?['BasePermissions']?['Low']")}));
  g.add(prefix+'_Rows',{type:'Select',inputs:{from:ex(D(prefix)+"?['value']"),select:{id:ex("item()?['Member']?['Id']"),type:ex("item()?['Member']?['PrincipalType']"),
    roleCount:ex(`length(${native})`),roles:projected,
    complete:ex(all(...['RoleDefinitionBindings@odata.nextLink','RoleDefinitionBindings@odata.__next','RoleDefinitionBindings__next'].map(key=>`not(contains(item(),'${key}'))`))) }},runtimeConfiguration:SECURE});
  const e=O(prefix+'_Expected_Map')+"?[string(item()?['id'])]",roles="take(item()?['roles'],item()?['roleCount'])",r=`first(${roles})`;
  const rolesMatch=all(eq("item()?['type']",e+"?['type']"),eq(`length(${roles})`,`length(${e}?['roles'])`),
    eq(`length(intersection(${roles},${e}?['roles']))`,`length(${roles})`),
    eq(`length(union(${roles},${roles}))`,`length(${roles})`));
  const referenceReader=all(referenceScope,`not(equals(${e}?['id'],${B('processorActorId')}))`,`not(equals(${e}?['id'],${B('recovery')}?['id']))`,eq(`length(${e}?['roles'])`,'1'),eq(r,B('employeeRead')));
  const profile=rootScope?`or(${all(eq(e+"?['id']",B('recovery')+"?['id']"),eq(e+"?['type']",'8'),eq(`length(intersection(${e}?['roles'],${B('recovery')}?['roles']))`,`length(${B('recovery')}?['roles'])`),eq(`length(${e}?['roles'])`,`length(${B('recovery')}?['roles'])`))},${all(eq(e+"?['id']",B('processorActorId')),eq(e+"?['type']",'1'),eq(`length(${e}?['roles'])`,'1'),eq(r,processorProfile))},${all(eq(e+"?['type']",'1'),`not(equals(${e}?['id'],${B('processorActorId')}))`,`not(equals(${e}?['id'],${B('recovery')}?['id']))`,eq(`length(${e}?['roles'])`,'1'),eq(r+"?['id']",'1073741825'),eq(r+"?['high']","'48'"),eq(r+"?['low']","'134287360'"))},${referenceReader})`:'true';
  g.add(prefix+'_Mismatch',{type:'Query',inputs:{from:ex(D(prefix+'_Rows')),where:ex(`not(${all(rolesMatch,profile,eq("item()?['complete']",'true'))})`)},runtimeConfiguration:SECURE});
  assertion(g,prefix+'_Match',`empty(${D(prefix+'_Mismatch')})`);
}
function roots(g,phase,resources=names) {
  const inner=graph(),loop=phase+'_Roots',key=`items('${loop}')`,p=phase+'_Root';
  inner.get(p,dynamicUri(key,'?$select=Id,HasUniqueRoleAssignments,EnableVersioning,EnableAttachments,EnableFolderCreation,RootFolder/ServerRelativeUrl&$expand=RootFolder'));
  parse(inner,p+'_Types',ex(D(p)),{...own,required:['Id','HasUniqueRoleAssignments','EnableVersioning','EnableAttachments','EnableFolderCreation','RootFolder'],properties:{Id:guid,HasUniqueRoleAssignments:{type:'boolean'},EnableVersioning:{type:'boolean'},EnableAttachments:{type:'boolean'},EnableFolderCreation:{type:'boolean'},RootFolder:{...own,required:['ServerRelativeUrl'],properties:{ServerRelativeUrl:str(200)}}}});
  assertion(inner,p+'_Bound',all(eq(`toLower(${D(p)}?['Id'])`,`toLower(parameters('Bindings')?[${key}])`),eq(D(p)+"?['HasUniqueRoleAssignments']",'true'),eq(D(p)+"?['EnableVersioning']",'true'),eq(D(p)+"?['RootFolder']?['ServerRelativeUrl']",dynamic('roots',key)),
    `or(not(contains(json('${JSON.stringify(folders)}'),${key})),equals(${D(p)}?['EnableFolderCreation'],true))`,
    `or(not(equals(${key},'expenses')),equals(${D(p)}?['EnableAttachments'],true))`));
  acl(inner,p+'_ACL',dynamicUri(key,'/roleassignments?$select=Member/Id,Member/PrincipalType,RoleDefinitionBindings/Id,RoleDefinitionBindings/BasePermissions&$expand=Member,RoleDefinitionBindings&$top=201'),dynamic('rootAcl',key),dynamic('processorRoles',key),true,`or(equals(${key},'months'),equals(${key},'nominals'))`);
  each(g,loop,resources,inner);
}
const personProperties={Id:id,D01UserId:id,D01Active:{type:'boolean'},D01PrivateScopes:str(4096),HasUniqueRoleAssignments:{type:'boolean'},FileSystemObjectType:{type:'integer',enum:[0]},FileDirRef:str(220),FileRef:str(255)};
function roster(g,phase) {
  const p=phase+'_Roster';
  g.get(p,`concat('_api/web/lists(guid''',${B('people')},''')/items?$select=Id,D01UserId,D01Active,D01PrivateScopes,HasUniqueRoleAssignments,FileSystemObjectType,FileDirRef,FileRef&$filter=D01UserId eq ',string(${O('Actor')}),'&$top=2')`);
  parse(g,p+'_Types',ex(D(p)),feed({...own,required:Object.keys(personProperties),properties:personProperties}));
  g.guard(p+'_One',all(complete(D(p)),eq(`length(${D(p)}?['value'])`,'1')));
  g.compose(p+'_Person',ex(`first(${D(p)}?['value'])`));
  const r=O(p+'_Person');g.guard(p+'_Active',all(eq(r+"?['D01UserId']",O('Actor')),eq(r+"?['D01Active']",'true')));
  parse(g,p+'_Registry',ex(`json(${r}?['D01PrivateScopes'])`),registrySchema);
}
function child(g,prefix,value,name) {
  g.guard(prefix+'_Ancestry',all(eq(value+"?['HasUniqueRoleAssignments']",'false'),eq(value+"?['FileSystemObjectType']",'0'),eq(value+"?['FileDirRef']",folder(name)),
    `not(empty(last(split(${value}?['FileRef'],'/'))))`,eq(value+"?['FileRef']",`concat(${folder(name)},'/',last(split(${value}?['FileRef'],'/')))`)));
}
function privateFolders(g,phase,resources=folders) {
  const inner=graph(),loop=phase+'_Folders',key=`items('${loop}')`,p=phase+'_Folder',reg=D('Initial_Roster_Registry')+`?[${key}]`,path=`concat(${dynamic('roots',key)},'/',string(${O('Actor')}))`;
  inner.get(p,`concat('_api/web/GetFolderByServerRelativePath(decodedurl=''',${path},''')?$select=UniqueId,ServerRelativeUrl,ListItemAllFields/Id,ListItemAllFields/HasUniqueRoleAssignments,ListItemAllFields/FileSystemObjectType&$expand=ListItemAllFields')`);
  parse(inner,p+'_Types',ex(D(p)),{...own,required:['UniqueId','ServerRelativeUrl','ListItemAllFields'],properties:{UniqueId:guid,ServerRelativeUrl:str(220),ListItemAllFields:{...own,required:['Id','HasUniqueRoleAssignments','FileSystemObjectType'],properties:{Id:id,HasUniqueRoleAssignments:{type:'boolean'},FileSystemObjectType:{type:'integer',enum:[1]}}}}});
  assertion(inner,p+'_Bound',all(eq(`toLower(${D(p)}?['UniqueId'])`,`toLower(${reg}?['uniqueId'])`),eq(D(p)+"?['ServerRelativeUrl']",path),eq(D(p)+"?['ListItemAllFields']?['Id']",reg+"?['id']"),eq(D(p)+"?['ListItemAllFields']?['HasUniqueRoleAssignments']",'true')));
  inner.compose(p+'_Expected',[ex(B('recovery')),{id:ex(B('processorActorId')),type:1,roles:[ex(dynamic('processorRoles',key))]},{id:ex(O('Actor')),type:1,roles:[ex(`if(equals(${key},'requests'),${B('employeeRequest')},${B('employeeRead')})`)]}]);
  acl(inner,p+'_ACL',dynamicItemUri(key,reg+"?['id']",'/roleassignments?$select=Member/Id,Member/PrincipalType,RoleDefinitionBindings/Id,RoleDefinitionBindings/BasePermissions&$expand=Member,RoleDefinitionBindings&$top=4'),O(p+'_Expected'),dynamic('processorRoles',key),false);
  each(g,loop,resources,inner);
}
function actorContext() {
  // Reuse the existing D01 connection, trigger, failure envelope and request
  // parser. Only its process graph and build-time binding contract differ.
  const flow=buildFlow(),definition=flow.properties.definition,g=graph();
  definition.parameters.Bindings.defaultValue={};
  // The properties-only trigger monitors the pinned dedicated library. An
  // omitted optional folderPath means the whole library, including onboarding
  // folders, without a claimant-specific trigger or assumed subfolder filter.
  // Native Author/roster/private-folder proof still gates every content read.
  delete definition.triggers.Request_File_Created.inputs.parameters.folderPath;
  parse(g,'Validate_Bindings',ex("parameters('Bindings')"),bindingSchema);
  g.guard('Distinct_List_Bindings',eq(`length(union(createArray(${names.map(name=>`toLower(${B(name)})`).join(',')}),createArray(${names.map(name=>`toLower(${B(name)})`).join(',')})))`,'9'));
  g.guard('Recovery_Separate',`not(equals(${B('recovery')}?['id'],${B('processorActorId')}))`);
  g.get('Processor_Identity',"'_api/web/currentuser?$select=Id,IsSiteAdmin'");
  parse(g,'Processor_Types',ex(D('Processor_Identity')),{...own,required:['Id','IsSiteAdmin'],properties:{Id:id,IsSiteAdmin:{type:'boolean',enum:[false]}}});
  g.guard('Dedicated_Processor',eq(D('Processor_Identity')+"?['Id']",B('processorActorId')));
  roots(g,'Initial');
  parse(g,'Trigger_ID',{id:ex("triggerBody()?['ID']")},obj({id}));g.compose('Request_ID',ex(D('Trigger_ID')+"?['id']"));
  const select=n.requestMetadataSelect.replace('Id,AuthorId','Id,FileDirRef,FileRef,FileSystemObjectType,AuthorId');
  g.get('Incoming_Before',itemUri('requests',O('Request_ID'),select));
  parse(g,'Native_Request_Types',ex(D('Incoming_Before')),{...own,required:['Id','AuthorId','EditorId','HasUniqueRoleAssignments','FileDirRef','FileRef','FileSystemObjectType','OData__UIVersionString','File'],properties:{Id:id,AuthorId:id,EditorId:id,HasUniqueRoleAssignments:{type:'boolean'},FileDirRef:str(220),FileRef:str(255),FileSystemObjectType:{type:'integer',enum:[0]},OData__UIVersionString:{type:'string',enum:['1.0']},File:{...own,required:['UniqueId','Length','ETag','Name','ServerRelativeUrl'],properties:{UniqueId:guid,Length:str(8,'^[1-9][0-9]{0,7}$'),ETag:str(200,'^"[^"\\r\\n]+"$'),Name:str(85,'^[A-Za-z0-9-]{16,80}\\.json$'),ServerRelativeUrl:str(255)}}}});
  const requestEtag=`coalesce(${D('Incoming_Before')}?['odata.etag'],${D('Incoming_Before')}?['@odata.etag'],${O('Incoming_Before')}?['headers']?['ETag'])`;
  g.guard('Request_Metadata_Bound',all(eq(D('Incoming_Before')+"?['Id']",O('Request_ID')),`not(empty(${requestEtag}))`,`startsWith(${requestEtag},'"')`,`endsWith(${requestEtag},'"')`,`not(equals(${requestEtag},'""'))`));
  g.compose('Actor',ex(D('Incoming_Before')+"?['AuthorId']"));
  g.guard('Ordinary_Actor',all(`not(equals(${O('Actor')},${B('processorActorId')}))`,`not(equals(${O('Actor')},${B('recovery')}?['id']))`));
  g.get('Native_User',`concat('_api/web/siteusers/getbyid(',string(${O('Actor')}),')?$select=Id,PrincipalType,IsSiteAdmin')`);
  parse(g,'Native_User_Types',ex(D('Native_User')),{...own,required:['Id','PrincipalType','IsSiteAdmin'],properties:{Id:id,PrincipalType:{type:'integer',enum:[1]},IsSiteAdmin:{type:'boolean',enum:[false]}}});
  g.guard('Same_Native_User',eq(D('Native_User')+"?['Id']",O('Actor')));
  g.get('Native_User_Groups',`concat('_api/web/siteusers/getbyid(',string(${O('Actor')}),')/groups?$select=Id,PrincipalType&$top=201')`);
  parse(g,'Native_User_Group_Types',ex(D('Native_User_Groups')),feed({...own,required:['Id','PrincipalType'],properties:{Id:id,PrincipalType:{type:'integer',enum:[8]}}}));
  g.add('Recovery_Memberships',{type:'Query',inputs:{from:ex(D('Native_User_Groups')+"?['value']"),where:ex(eq("item()?['Id']",B('recovery')+"?['id']"))},runtimeConfiguration:SECURE});
  g.guard('No_Recovery_Membership',all(complete(D('Native_User_Groups')),`empty(${D('Recovery_Memberships')})`));
  g.add('Reference_Group_IDs',{type:'Select',inputs:{from:ex(D('Native_User_Groups')+"?['value']"),select:"@item()?['Id']"},runtimeConfiguration:SECURE});
  g.guard('Unique_Native_Groups',eq(`length(union(${D('Reference_Group_IDs')},${D('Reference_Group_IDs')}))`,`length(${D('Reference_Group_IDs')})`));
  // Only the fixed non-financial reference roots may carry a read grant. The
  // actual native Author must possess it directly or via typed native groups;
  // a deployment-owned snapshot alone cannot manufacture membership.
  for(const name of ['months','nominals']){
    const reader=`item()?['roles']`;
    g.add('Reference_Readers_'+name,{type:'Query',inputs:{from:ex(B('rootAcl')+`?['${name}']`),where:ex(all(eq(`length(${reader})`,'1'),eq(`first(${reader})`,B('employeeRead')),
      `not(equals(item()?['id'],${B('processorActorId')}))`,`not(equals(item()?['id'],${B('recovery')}?['id']))`,
      `or(and(equals(item()?['type'],1),equals(item()?['id'],${O('Actor')})),and(equals(item()?['type'],8),contains(${D('Reference_Group_IDs')},item()?['id'])))`))},runtimeConfiguration:SECURE});
    g.guard('Reference_Readable_'+name,`not(empty(${D('Reference_Readers_'+name)}))`);
  }
  g.get('Registry_Field',uri('people',"/fields/getbyinternalnameortitle('D01PrivateScopes')?$select=InternalName,TypeAsString,ReadOnlyField,RichText,AppendOnly"));
  parse(g,'Registry_Field_Types',ex(D('Registry_Field')),{...own,required:['InternalName','TypeAsString','ReadOnlyField','RichText','AppendOnly'],properties:{InternalName:{type:'string',enum:['D01PrivateScopes']},TypeAsString:{type:'string',enum:['Note']},ReadOnlyField:{type:'boolean',enum:[false]},RichText:{type:'boolean',enum:[false]},AppendOnly:{type:'boolean',enum:[false]}}});
  roster(g,'Initial');privateFolders(g,'Initial');
  child(g,'Roster_Child',O('Initial_Roster_Person'),'people');child(g,'Request_Child',D('Incoming_Before'),'requests');
  // A privileged content read must use the exact child already proved above,
  // never merely another URL with the same prefix. The later body operationId
  // check still binds this native filename to the immutable request payload.
  g.guard('Request_File_Bound',all(eq(D('Incoming_Before')+"?['FileRef']",D('Incoming_Before')+"?['File']?['ServerRelativeUrl']"),
    eq(D('Incoming_Before')+"?['File']?['ServerRelativeUrl']",`concat(${folder('requests')},'/',${D('Incoming_Before')}?['File']?['Name'])`)));
  metadataContent(g,'Incoming',O('Request_ID'),O('Actor'),select,root('requests'));
  g.compose('Command',ex(D('Incoming_Parse')+"?['command']"));
  g.compose('Date_ISO',ex(`concat(substring(${O('Command')}?['date'],6,4),'-',substring(${O('Command')}?['date'],3,2),'-',substring(${O('Command')}?['date'],0,2))`));
  g.guard('Native_Date',eq(`formatDateTime(${O('Date_ISO')},'dd-MM-yyyy')`,O('Command')+"?['date']"));
  return {flow,g,select};
}
function buildActorAdmissionFlow() {
  const {flow,g,select}=actorContext(),definition=flow.properties.definition;
  g.get('Own_Drafts',`concat('_api/web/lists(guid''',${B('claims')},''')/items?$select=*,HasUniqueRoleAssignments,FileDirRef,FileRef,FileSystemObjectType&$filter=ClaimantRecordId eq ',string(${O('Initial_Roster_Person')}?['Id']),' and ClaimMonth eq ''',substring(${O('Date_ISO')},0,7),''' and SubmissionStatus eq ''Draft''&$top=2')`);
  const parent={...own,required:['Id','ClaimantRecordId','ClaimMonthRecordId','ClaimMonth','SubmissionStatus','HasUniqueRoleAssignments','FileDirRef','FileRef','FileSystemObjectType'],properties:{Id:id,ClaimantRecordId:id,ClaimMonthRecordId:id,ClaimMonth:str(7,'^20[0-9]{2}-(0[1-9]|1[0-2])$'),SubmissionStatus:{type:'string',enum:['Draft']},HasUniqueRoleAssignments:{type:'boolean'},FileDirRef:str(220),FileRef:str(255),FileSystemObjectType:{type:'integer',enum:[0]}}};
  parse(g,'Own_Draft_Types',ex(D('Own_Drafts')),feed(parent));
  g.guard('One_Own_Draft',all(complete(D('Own_Drafts')),eq(`length(${D('Own_Drafts')}?['value'])`,'1')));g.compose('Own_Parent',ex(`first(${D('Own_Drafts')}?['value'])`));
  const p=O('Own_Parent'),token=`coalesce(${p}?['odata.etag'],${p}?['@odata.etag'])`;
  child(g,'Parent_Child',p,'claims');
  g.guard('Bound_Parent',all(eq(p+"?['ClaimantRecordId']",O('Initial_Roster_Person')+"?['Id']"),eq(p+"?['ClaimMonth']",`substring(${O('Date_ISO')},0,7)`),eq(p+"?['Id']",O('Command')+"?['parentId']"),eq(token,O('Command')+"?['parentEtag']"),`not(empty(${token}))`,`startsWith(${token},'"')`,`endsWith(${token},'"')`,`not(equals(${token},'""'))`));
  g.get('Own_Month',itemUri('months',p+"?['ClaimMonthRecordId']",'?$select=Id,ClaimMonth,MonthStatus,HasUniqueRoleAssignments'));
  parse(g,'Own_Month_Types',ex(D('Own_Month')),{...own,required:['Id','ClaimMonth','MonthStatus','HasUniqueRoleAssignments'],properties:{Id:id,ClaimMonth:parent.properties.ClaimMonth,MonthStatus:{type:'string',enum:['Open']},HasUniqueRoleAssignments:{type:'boolean',enum:[false]}}});
  g.guard('Bound_Month',all(eq(D('Own_Month')+"?['Id']",p+"?['ClaimMonthRecordId']"),eq(D('Own_Month')+"?['ClaimMonth']",p+"?['ClaimMonth']")));
  // Revalidate the metadata actually consumed during admission. This is not
  // historical replay/financial authority and cannot release a reservation.
  roster(g,'Final');g.guard('Roster_Unchanged',eq(`string(${O('Final_Roster_Person')})`,`string(${O('Initial_Roster_Person')})`));
  roots(g,'Final');privateFolders(g,'Final');
  g.get('Final_Request_Metadata',itemUri('requests',O('Request_ID'),select));g.guard('Final_Request_Unchanged',eq(`string(${D('Final_Request_Metadata')})`,`string(${D('Incoming_Before')})`));
  for(const [label,original,address] of [
    ['User','Native_User',`concat('_api/web/siteusers/getbyid(',string(${O('Actor')}),')?$select=Id,PrincipalType,IsSiteAdmin')`],
    ['Groups','Native_User_Groups',`concat('_api/web/siteusers/getbyid(',string(${O('Actor')}),')/groups?$select=Id,PrincipalType&$top=201')`],
    ['Registry_Field','Registry_Field',uri('people',"/fields/getbyinternalnameortitle('D01PrivateScopes')?$select=InternalName,TypeAsString,ReadOnlyField,RichText,AppendOnly")],
    ['Drafts','Own_Drafts',`concat('_api/web/lists(guid''',${B('claims')},''')/items?$select=*,HasUniqueRoleAssignments,FileDirRef,FileRef,FileSystemObjectType&$filter=ClaimantRecordId eq ',string(${O('Initial_Roster_Person')}?['Id']),' and ClaimMonth eq ''',substring(${O('Date_ISO')},0,7),''' and SubmissionStatus eq ''Draft''&$top=2')`],
    ['Month','Own_Month',itemUri('months',p+"?['ClaimMonthRecordId']",'?$select=Id,ClaimMonth,MonthStatus,HasUniqueRoleAssignments')]]){
    g.get('Final_'+label,address);g.guard('Final_'+label+'_Unchanged',eq(`string(${D('Final_'+label)})`,`string(${D(original)})`));
  }
  g.add('Admission_Held',{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'D01_ADMISSION_ONLY_HELD',message:'Private storage writer and runtime qualification remain held.'}},runtimeConfiguration:SECURE});
  definition.actions.Process.actions=g.actions;
  return flow;
}
module.exports={buildActorAdmissionFlow,actorContext,bindingSchema,registrySchema,
  writerProof:{roots,privateFolders,roster,child,parse,assertion,complete,root,folder,names,folders}};
