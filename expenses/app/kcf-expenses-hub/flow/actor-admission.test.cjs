'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildActorAdmissionFlow}=require('./build-flow.cjs');
const {AdmissionTenant}=require('./actor-admission-fixture.cjs');
const {validateGraph}=require('./wdl-harness.cjs');
function noWrite(f,r){assert.equal(f.writes.length,0);assert(f.admissionCalls.every(c=>c.input.host.operationId==='GetFileContentByPath'||c.input.parameters['parameters/method']==='GET'));assert.equal(r.outputs.Storage_Verified,undefined);}
function admitted(r){assert.equal(r.code,'D01_ADMISSION_ONLY_HELD',JSON.stringify({code:r.code,errors:r.errors,last:r.visited.slice(-7)}));}
test('existing emitter exposes an executable actor admission candidate with no fixed actor/parent',()=>{
  assert.equal(typeof buildActorAdmissionFlow,'function');
  const text=JSON.stringify(buildActorAdmissionFlow());
  assert(!text.includes('fixtureActorId'));assert(!text.includes('fixtureParentId'));
});

test('one pinned requests library trigger covers every staff folder without a folder filter',()=>{
  const trigger=buildActorAdmissionFlow().properties.definition.triggers.Request_File_Created;
  assert.equal(trigger.inputs.host.operationId,'GetOnNewFileItems');
  assert.equal(trigger.inputs.parameters.dataset,'https://example.invalid/sites/REVIEW-TEST-SITE');
  assert.equal(trigger.inputs.parameters.table,"@parameters('Bindings')?['requests']");
  assert.equal(Object.hasOwn(trigger.inputs.parameters,'folderPath'),false);
  assert.deepEqual(trigger.runtimeConfiguration.concurrency,{runs:1});
  assert.equal(trigger.splitOn,"@triggerOutputs()?['body/value']");
});
test('same D01 solution assembly is Off/unbound and deliberately admission-only',()=>{
  const {actorAdmissionSolutionFiles,workflowId,filename}=require('./build-solution.cjs'),files=actorAdmissionSolutionFiles();
  assert(files['Other/Solution.xml'].includes('<Version>0.1.0.9</Version>'));assert(files['Other/Solution.xml'].includes(workflowId));
  assert(files['Workflows/'+filename+'.data.xml'].includes('<StateCode>0</StateCode>'));
  assert.deepEqual(JSON.parse(files['Workflows/'+filename]).properties.definition.parameters.Bindings.defaultValue,{});
  assert(validateGraph(buildActorAdmissionFlow()).actions<500);
  function inspect(actions){for(const a of Object.values(actions)){if(a.type==='OpenApiConnection')assert(a.inputs.host.operationId==='GetFileContentByPath'||a.inputs.parameters['parameters/method']==='GET');if(a.actions)inspect(a.actions);if(a.else)inspect(a.else.actions);}}
  inspect(buildActorAdmissionFlow().properties.definition.actions);
});
for(const actor of [11,12,13])test(`native employee ${actor} uses shared bindings and own derived Draft; never writes`,async()=>{
  const f=new AdmissionTenant(),id=actor===11?501:f.add(actor,'jpg'),r=await f.runAdmission(id);admitted(r);noWrite(f,r);
  assert.equal(r.outputs.Actor,actor);assert.equal(r.outputs.Own_Parent.Id,90+actor);
  const content=f.admissionCalls.findIndex(c=>c.name==='Incoming_Binary'),folder=f.admissionCalls.findIndex(c=>c.name==='Initial_Folder_ACL'&&c.input.parameters['parameters/uri'].includes(f.schemas.lists.requests));
  assert(content>folder&&folder>=0);assert.equal(f.tables.expenses.length,0);assert.equal(f.tables.operations.length,0);
});
const held=async(f,id=501)=>{const r=await f.runAdmission(id);assert.notEqual(r.code,'D01_ADMISSION_ONLY_HELD');noWrite(f,r);return r;};
for(const trigger of ['501',true,0,-1,2147483648,null])test(`trigger ${JSON.stringify(trigger)} cannot supply a request identity`,async()=>{await held(new AdmissionTenant(),trigger);});
for(const flag of ['processorAdmin','processorId','actorAdmin','recoveryMember','groupsPaged','richRegistry'])test(`native identity/field ${flag} fails without writes`,async()=>{
  const f=new AdmissionTenant();if(flag==='processorId')f.scopeFlags.processorId=98;else if(flag==='actorAdmin')f.scopeFlags.actorAdmin=11;else if(['processorAdmin'].includes(flag))f.scopeFlags[flag]=true;else f.admissionFlags[flag]=true;await held(f);
});
for(const author of [99,3,'11',true])test(`native Author ${JSON.stringify(author)} is not an ordinary request Author`,async()=>{const f=new AdmissionTenant();f.tables.requests[0].AuthorId=author;await held(f);});
for(const active of [false,1,'true',null])test(`roster active ${JSON.stringify(active)} is not literal active`,async()=>{const f=new AdmissionTenant();f.tables.people[0].D01Active=active;await held(f);});
for(const active of [false,true])test(`duplicate roster ${active} is ambiguous including inactive`,async()=>{const f=new AdmissionTenant();f.tables.people.push({...f.tables.people[0],Id:77,D01Active:active});await held(f);});
for(const registry of ['{}','not-json',JSON.stringify({requests:{id:1,uniqueId:'not-guid'}})])test(`malformed protected registry ${registry.slice(0,20)} fails before payload`,async()=>{
  const f=new AdmissionTenant();f.tables.people[0].D01PrivateScopes=registry;await held(f);assert(!f.admissionCalls.some(c=>c.name==='Incoming_Binary'));
});
for(const target of ['rootInherits','rootMismatch','foldersDisabled','folderInherits','folderSubstitution','extraRootRole','extraFolderRole','changedFolderMask','aclPaged'])test(`private ${target} fails before consuming payload`,async()=>{
  const f=new AdmissionTenant();f.scopeFlags[target]='requests';await held(f);assert(!f.admissionCalls.some(c=>c.name==='Incoming_Binary'));
});
for(const flag of ['expandedRootAclPaged','expandedFolderAclPaged'])test(`nested ACL continuation ${flag} is not hidden`,async()=>{const f=new AdmissionTenant();f.scopeFlags[flag]=true;await held(f);});
for(const part of ['roster','request','draft'])test(`${part} native item cannot substitute a unique sharing exception`,async()=>{
  const f=new AdmissionTenant(),row=part==='roster'?f.tables.people[0]:part==='request'?f.tables.requests[0]:f.tables.claims[0];row.HasUniqueRoleAssignments=true;await held(f);
});
for(const change of ['wrongParent','wrongEtag','bodyActor','wrongMonth','duplicateDraft','closedMonth','wrongPerson'])test(`derived Draft rejects ${change}, never reading a command-selected parent`,async()=>{
  const f=new AdmissionTenant();
  if(change==='wrongParent'||change==='wrongEtag'||change==='bodyActor'||change==='wrongMonth'){
    const payload=JSON.parse(f.files.get(f.tables.requests[0].File.ServerRelativeUrl));
    if(change==='wrongParent')payload.command.parentId=102;if(change==='wrongEtag')payload.command.parentEtag='"88"';if(change==='bodyActor')payload.command.actorId=12;if(change==='wrongMonth')payload.command.date='01-11-2026';
    f.tables.requests=[];f.files.clear();f.put(501,payload,11);
  }
  if(change==='duplicateDraft')f.tables.claims.push({...f.tables.claims[0],Id:77});
  if(change==='closedMonth')f.tables.months[0].MonthStatus='Closed';if(change==='wrongPerson')f.tables.claims[0].ClaimantRecordId=22;
  await held(f);assert(!f.admissionCalls.some(c=>/\/items\(102\)/.test(c.input.parameters['parameters/uri']||'')&&c.input.parameters['parameters/uri'].includes(f.schemas.lists.claims)));
});
for(const change of ['request','registry','folder','root','groups','user','draft','month','registryField'])test(`changed ${change} after payload is held by final readback`,async()=>{
  const f=new AdmissionTenant();f.admissionHooks.Final_Roster=x=>{
    if(change==='request')x.tables.requests[0].EditorId=12;
    if(change==='registry'){const r=JSON.parse(x.tables.people[0].D01PrivateScopes);r.requests.id++;x.tables.people[0].D01PrivateScopes=JSON.stringify(r);}
    if(change==='folder')x.scopeFlags.extraFolderRole='expenses';if(change==='root')x.scopeFlags.extraRootRole='audit';
    if(change==='groups')x.admissionFlags.recoveryMember=true;if(change==='user')x.scopeFlags.actorAdmin=11;
    if(change==='draft')x.bump(x.tables.claims[0]);if(change==='month')x.tables.months[0].MonthStatus='Closed';if(change==='registryField')x.admissionFlags.richRegistry=true;
  };await held(f);assert(f.admissionCalls.some(c=>c.name==='Incoming_Binary'));
});
test('role order and multi-role recovery remain exact sets rather than incidental ordering',async()=>{
  const f=new AdmissionTenant(),limited={id:1073741825,high:'48',low:'134287360'};
  f.p.recovery.roles.push(limited);f.nativePolicy.recovery.roles.push(structuredClone(limited));
  for(const map of [f.p.rootAcl,f.nativePolicy.rootAcl])for(const rows of Object.values(map))rows.find(p=>p.id===3).roles.push(structuredClone(limited));
  const send=f.send.bind(f);f.send=async plan=>{const r=await send(plan);if(plan.url.includes('/roleassignments')){const b=await new Response(r.body).json();for(const row of b.value)row.RoleDefinitionBindings.reverse();return f.response(plan,200,b);}return r;};
  const r=await f.runAdmission();admitted(r);noWrite(f,r);
});
for(const elevated of ['processor','employee','rootExtra'])test(`internally consistent elevated ${elevated} policy cannot qualify itself`,async()=>{
  const f=new AdmissionTenant();
  if(elevated==='processor'){f.p.processorRoles.expenses.low=String(Number(f.p.processorRoles.expenses.low)|33554432);f.nativePolicy.processorRoles.expenses=structuredClone(f.p.processorRoles.expenses);}
  if(elevated==='employee'){f.p.employeeRead.low='196615';f.nativePolicy.employeeRead.low='196615';}
  if(elevated==='rootExtra'){const p={id:88,type:1,roles:[structuredClone(f.p.employeeRead)]};f.p.rootAcl.expenses.push(p);f.nativePolicy.rootAcl.expenses.push(structuredClone(p));}
  await held(f);assert(!f.admissionCalls.some(c=>c.name==='Incoming_Binary'));
});
test('legacy financial graph remains byte-identical after extracting metadata-only helpers',()=>{
  const crypto=require('node:crypto');
  // Exact generated graph at parent f20fdce, not an environment/scratch input.
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(require('./build-flow.cjs').buildFlow())).digest('hex'),'7891e3417a86eda155a0dfb31f797fe6fcab548fa7b672cd98b96a5d8d2eccfd');
});
for(const fault of ['duplicatePrincipal','duplicateRole','roleNumberWord','roleBooleanId','rootNumericUnique','folderNumericUnique','requestMissingEtag','requestBadGuid','requestHugeLength','wrongEditor'])test(`native malformed ${fault} does not gain authority`,async()=>{
  const f=new AdmissionTenant(),send=f.send.bind(f);
  if(fault==='requestMissingEtag')delete f.tables.requests[0]['odata.etag'];if(fault==='requestBadGuid')f.tables.requests[0].File.UniqueId='forged';
  if(fault==='requestHugeLength')f.tables.requests[0].File.Length='99999999';if(fault==='wrongEditor')f.tables.requests[0].EditorId=12;
  f.send=async plan=>{const r=await send(plan),b=await new Response(r.body).json();
    if(plan.url.includes('/roleassignments')){
      if(fault==='duplicatePrincipal')b.value.push(structuredClone(b.value[0]));if(fault==='duplicateRole')b.value[0].RoleDefinitionBindings.push(structuredClone(b.value[0].RoleDefinitionBindings[0]));
      if(fault==='roleNumberWord')b.value[0].RoleDefinitionBindings[0].BasePermissions.Low=1;if(fault==='roleBooleanId')b.value[0].RoleDefinitionBindings[0].Id=true;
    }
    if(fault==='rootNumericUnique'&&b.RootFolder)b.HasUniqueRoleAssignments=1;
    if(fault==='folderNumericUnique'&&b.ListItemAllFields)b.ListItemAllFields.HasUniqueRoleAssignments=1;
    return { ...f.response(plan,200,b),etag:fault==='requestMissingEtag'&&b.File?undefined:r.etag };
  };await held(f);assert(!f.admissionCalls.some(c=>c.name==='Incoming_Binary'));
});
test('protected onboarding can admit another ordinary actor without a new app/list/build or fixed parent',async()=>{
  const f=new AdmissionTenant(),person=f.tables.people[2],claim=f.tables.claims[2];person.D01UserId=35;claim.Id=735;
  // Protected onboarding includes native reference-reader membership. This
  // changes fixture ACL state, not app code or the expected admission result.
  f.groups.get(24).delete(13);f.groups.get(24).add(35);
  f.assign('people',person,35);f.assign('claims',claim,35);
  const limited={id:35,type:1,roles:[{id:1073741825,high:'48',low:'134287360'}]};
  for(const n of ['requests','operations','results','expenses','claims','people']){f.p.rootAcl[n].push(structuredClone(limited));f.nativePolicy.rootAcl[n].push(structuredClone(limited));}
  const payload=JSON.parse(f.files.get(f.tables.requests[0].File.ServerRelativeUrl));payload.command.parentId=735;f.put(900,payload,35);
  const r=await f.runAdmission(900);admitted(r);noWrite(f,r);assert.equal(r.outputs.Actor,35);assert.equal(r.outputs.Own_Parent.Id,735);
});
for(const mismatch of ['nestedUrl','differentUrl','contradictoryFileRef'])test(`P2 native ${mismatch} is refused before any privileged content read`,async()=>{
  const f=new AdmissionTenant(),row=f.tables.requests[0],bytes=f.files.get(row.File.ServerRelativeUrl);
  if(mismatch==='contradictoryFileRef')row.FileRef=f.p.roots.requests+'/11/different-operation-file.json';
  else{row.File.ServerRelativeUrl=f.p.roots.requests+'/11/'+(mismatch==='nestedUrl'?'unqualified/':'different-')+row.File.Name;f.files.set(row.File.ServerRelativeUrl,bytes);}
  await held(f);assert(!f.admissionCalls.some(c=>c.name==='Incoming_Binary'));
});
