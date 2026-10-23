/** Build-time Product storage/SharePoint action generation. No native requests run here. */
export const phases = ['Validated','ControlClaimed','SnapshotWritten','AuditWritten','ControlPointed','AclVerified','Completed'];
export const referenceFields = {
  Kpi:{kpiId:'KPIID',kpiVersionKey:'KPIVersionKey',active:'DERIVE DefinitionStatus == Active AND IsCurrent == true'},
  Target:{targetVersionKey:'TargetVersionKey',kpiId:'KPIID',performanceYear:'PerformanceYear',status:'TargetStatus',role:'HELD A009 employee-authored native Draft mixed-source admission',annual:'HELD A009 employee-authored native Draft mixed-source admission',q1:'HELD A009 employee-authored native Draft mixed-source admission',q2:'HELD A009 employee-authored native Draft mixed-source admission',q3:'HELD A009 employee-authored native Draft mixed-source admission',q4:'HELD A009 employee-authored native Draft mixed-source admission'},
  Framework:{frameworkVersion:'FrameworkVersion',published:'Published',immutable:'Immutable'},
  Assignment:{personKey:'PersonKey',frameworkVersion:'FrameworkVersion',roleTier:'RoleTier',roleLevelCode:'DERIVE protected RoleTier bijection',active:'Active'},
  Value:{frameworkValueKey:'FrameworkValueKey',frameworkVersion:'FrameworkVersion',valueId:'ValueID',governedOrder:'DERIVE BHV-01..05 order',roleTier:'JOIN protected Assignment.RoleTier',descriptorKey:'DERIVE FrameworkVersion|protected RoleTier|ValueID'},
  Prompt:{promptKey:'BehaviourObjectiveKey',behaviourKey:'BehaviourKey',roleTier:'DERIVE native RoleLevelCode bijection; JOIN assignment',active:'Active'},
  Catalogue:{catalogueId:'HELD selected ADM catalogue.catalogueKey',catalogueVersion:'HELD selected ADM catalogue.catalogueVersion',catalogueRevision:'HELD selected ADM catalogue.revision',catalogueEtag:'HELD protected historical selection provenance',catalogueContentSha256:'HELD selected ADM version.contentSha256',approvalReference:'HELD ADM ApprovalReference',published:'HELD selected ADM catalogue.status == Published',immutable:'HELD complete existing codec/history/authority validation',asOfDate:'HELD protected governed selection asOfDate',effectiveFrom:'HELD selected ADM catalogue.effectiveFrom',effectiveTo:'HELD selected ADM catalogue.effectiveTo'},
  Headline:{behaviourKey:'HELD selected ADM headline.behaviourKey',headlineTitle:'HELD selected ADM headline.title',governedOrder:'HELD selected ADM headline.sortOrder'},
  Focus:{behaviourKey:'HELD selected ADM row.behaviourKey',focusKey:'HELD selected ADM row.focusKey',focusTitle:'HELD selected ADM row.focusArea',roleLevelCode:'HELD selected ADM row.roleLevelCode',status:'HELD selected ADM row.status',effectiveFrom:'HELD selected ADM row.effectiveFrom',effectiveTo:'HELD selected ADM row.effectiveTo'},
  BehaviourTarget:{behaviourKey:'HELD selected ADM row.behaviourKey',focusKey:'HELD selected ADM row.focusKey',focusTitle:'HELD selected ADM row.focusArea',roleLevelCode:'HELD selected ADM row.roleLevelCode',status:'HELD selected ADM row.status',effectiveFrom:'HELD selected ADM row.effectiveFrom',effectiveTo:'HELD selected ADM row.effectiveTo',targetKey:'HELD selected ADM row.targetKey',selectedWording:'HELD selected ADM row.suggestedTarget'}
};
const field = (name,type,extra={})=>({internalName:name,type,required:true,...extra});
const uniqueKey = field('CommandKey','Text',{maxLength:255,indexed:true,enforceUniqueValues:true});
export const storageProposal = {
  contract:'kcf.kpi.option-e.storage.v4',status:'PROPOSED_NOT_PROVISIONED',preserveLegacy:true,chunking:false,
  wireMaxUtf8Bytes:56000,
  // Documents retain complete bodies. They do not reinterpret a multiline field's capacity.
  documentMaxBytes:1048576,
  historicalCaptureProducerMapping:{
    status:'SOURCE_MAPPING_ONLY_NATIVE_PRODUCER_VERSION_READBACK_NOT_ADMITTED',
    producer:'Existing independently admitted trusted selection/capture producer; no new flow, publisher, resource or Submit-time capture',
    contract:'kcf.option-e.historical-selection-origin/v4',
    originalDraftReadbackContract:'kcf.option-e.original-saved-draft-readback/v4',
    authority:'Native authenticated admitted producer and immutable capture author/rights, never request labels, evidence strings or caller dates',
    tuple:['person','workplan','year','draft itemId','draft native version','draft native ETag','catalogueId','catalogueVersion','catalogueRevision','catalogueContentSha256','original selection body'],
    requiredReads:['Exact protected original saved Draft metadata/content and readback at the selection origin','Complete original catalogue all26 fields/native coordinates and genuine existing publisher/hash/counts readback','Independent explicitly governed historical asOfDate and trusted native capture Created'],
    projection:{draftOrigin:'Original itemId/ETag/version/author/full canonical saved body',draftOriginalReadback:'Full original native site/web/list/item/version/ETag, authorId, createdAt and exact complete body; native version access/readback must be separately admitted',selectedCatalogueBody:'Full original selected catalogue JSON, including retired wording and original effective dates',selectedTargetKeys:'Ordered original saved Catalogue selections, unique and exactly reconciled with the unchanged annual target snapshots'},
    persistence:['Existing protected capture document, immutable for the exact tuple; supported native SharePoint file create overwrite=false','Exact UTF8/base64 content readback plus complete unique nonpaginated metadata readback before/after content','Native author/Created/version/exact quoted ETag, producer principal and tuple/body readback admission','Consumer retains the entire original protected capture raw body and native origin in the existing admission journal'],
    historicalDraftDifference:'Later editable Draft may have different core/body/version/ETag. Its fixed annual governed selection snapshot must match the original. Same native saved-version tuple requires complete current/original body equality; earlier versions require admitted original-version readback, never a current-tag substitution.',
    hold:['Missing legacy original capture','Missing/multiple/crossed tuple or selected snapshots','Unadmitted original saved-version access/producer/readback/immutability/unique tuple facts','Missing governed historical date','Complete journal beyond1MiB or original codec beyond576000 bytes'],
    execution:'Native producer installation/version lookup/write/readback/rights/parity NOT_EXECUTED. No historical backfill, invented date/ETag, new clock policy or processor activation.'
  },
  encoding:{name:'UTF-8',bom:false,fatalDecodeRequired:true,readback:'Exact octets plus complete decoded text'},
  roots:{
    Request:{title:'KCFKPI_V4SubmitRequests',kind:'GenericDocumentLibrary',body:'Whole original canonical request .json',employee:'Append/read own; no edit/delete after creation',manager:'None'},
    Draft:{title:'KCFKPI_WorkplanDrafts',kind:'GenericList',status:'EXISTING_LIST_ROW_ORIGIN_UNBOUND_NATIVE_SCHEMA_RIGHTS_VERSION_HASH_READBACK_NOT_ADMITTED',body:'Existing complete DraftPayloadJSON and genuine DraftPayloadSHA256; preserve full raw row and actual Author/Created/Modified/version/quoted ETag before/after. No file copy, file origin or fabricated $content. Schema identity derives only from validated closed payload.',employee:'Existing private Save unchanged; native effective edit/freeze/read rights separately admitted',manager:'None; actual denial separately admitted',provision:false},
    Admission:{title:'KCFKPI_V4Admissions',kind:'GenericDocumentLibrary',body:'Host journal {key,origins,control,eventAt,domain}; domain is the unchanged closed V4Admission. Complete original request/native origin bodies, IDs/ETags/versions and raw control remain separate from domain. eventAt is one processor clock observation, never a caller date or historical catalogue asOf.',immutable:true},
    Snapshot:{title:'KCFKPI_V4Snapshots',kind:'GenericDocumentLibrary',body:'Closed protected V4Snapshot: domain admission + complete draft + reference body. Raw complete native origins retained independently in admission journal.',immutable:true},
    Receipt:{title:'KCFKPI_V4Receipts',kind:'GenericDocumentLibrary',body:'Closed V4Receipt creation body: domain admission + complete snapshot. nativeCreated is projected only from native readback Created; native Author/version/ETag coordinates and unchanged admission +/-300000ms relationship are required before completion.',immutable:true},
    History:{title:'KCFKPI_V4History',kind:'GenericDocumentLibrary',body:'Whole immutable before/intent/after readbacks for every effect',immutable:true},
    Operation:{title:'KCFKPI_V4Operations',kind:'GenericList',fields:[uniqueKey,field('WorkplanKey','Text'),field('PersonKey','Text'),field('PerformanceYear','Number'),field('ClientCommand','Text'),field('AdmissionName','Text',{maxLength:255}),field('Checkpoint','Choice',{choices:phases}),field('Outcome','Choice',{choices:['Running','Completed','RecoveryHold']}),field('HoldReason','Note',{maxLength:2048,required:false})],journalBinding:'AdmissionName is exact trusted UUID-admission.json, checked on every readback. Control before/intent/readback documents use the same UUID and declared checkpoint suffixes, are read in full and compared with exact native Control/CAS; no fictitious FileID fields.'},
    Control:{title:'KCFKPI_V4Workplans',kind:'GenericList',fields:[field('WorkplanKey','Text',{indexed:true,enforceUniqueValues:true}),field('PersonKey','Text'),field('PerformanceYear','Number'),field('DraftItemID','Number'),field('ManagerPersonKey','Text'),field('HierarchyEpoch','Number'),field('AclEpoch','Number'),field('State','Choice',{choices:['Draft','ChangesRequested','Submitted']}),field('TransitionStatus','Choice',{choices:['Ready','Submitting','AclPending']}),field('ActiveCommand','Text',{required:false}),field('CurrentSnapshotKey','Text',{required:false})]}
  },
  documentMetadata:[],
  documentTupleBinding:'No custom document tuple columns are required or populated by Files/add. Request retains the original person/year/workplan/command; Admission journal and closed Snapshot/Receipt retain and exactly read back that complete request/authority tuple. Operation AdmissionName and each immutable History UUID/checkpoint filename bind full before/intent/after control bodies to that admission. Draft native item/author/version/ETag/body is independently joined through protected Control person/year/workplan/draftId. Unique CommandKey is required only on Operation; document uniqueness is overwrite=false filename plus exact complete body readback.',
  nativeMetadata:['Id','UniqueId','AuthorId','Created','Modified','OData__UIVersionString','@odata.etag','HasUniqueRoleAssignments','File/ServerRelativeUrl'],
  privateDraftNativeMetadata:['Id','AuthorId','Created','Modified','OData__UIVersionString','@odata.etag','DraftPayloadJSON','DraftPayloadSHA256'],
  privateDraftOriginAdmission:'Existing GenericList KCFKPI_WorkplanDrafts exact list GUID and independently admitted tenant/site/web/content connection route, schema, rights, actual native version/author/Created/Modified readback and genuine Save hash validation for the exact item/version/ETag/digest. Both full raw rows and canonical payload survive in the journal; no Draft file/body/SchemaVersion column is assumed. Missing original version/readback/event/date remains HOLD.',
  uniqueness:'Operation uses native unique CommandKey. Documents use overwrite=false trusted UUID/stage filename with exact complete-body/tuple readback, and no required custom metadata columns. A duplicate/timeout is resolved by exact complete readback; no replace or blind retry.',
  mutableCas:'Operation and Control use exact nonwildcard native ETag; preserve declared own intent before effect and append complete journal before/after. 412/timeout stays held unless full intent/readback corresponds.',
  documentName:'Trusted command UUID plus fixed stage suffix; never caller path or PersonKey. Command tuple retains complete original person/year/command. Unsupported >255 key fails held, never truncated.',
  immutableEnforcement:'Content principal Add+View only; no Edit/Delete. Recovery FullControl is privileged; actual native rights/immutability/employee denial must be independently admitted.',
  rolePlan:{Read:['ViewListItems','OpenItems'],AppendOnly:['AddListItems','ViewListItems','OpenItems'],MutatorNoDelete:['AddListItems','EditListItems','ViewListItems','OpenItems'],AclReconciler:['ManagePermissions','ViewListItems','OpenItems'],FullControl:['FullMask']},
  privateRoots:['Request','Draft','Admission','Receipt','History'],
  exactAcl:'All role-assignment rows, principal IDs and role bindings must match; HasUniqueRoleAssignments=true, no pagination or unexpected principal/role is accepted. Draft excludes assigned Manager.',
  referenceMapping:{state:'PROPOSED_NATIVE_NOT_ADMITTED',fields:referenceFields,completeProtectedBodiesRequired:true,catalogueDate:'Protected governed AsOfDate; preserve selected provenance/history. No Submit-now replacement.',annualTarget:'Protected Target/BehaviourTarget snapshot remains fixed for performance year.'}
};

export function httpRequest(connection,method,uri,body,etag) {
  if(!['content','acl','recovery'].includes(connection)) throw Error('Unknown connection role');
  const headers = {Accept:'application/json;odata=nometadata'};
  if(body!==undefined) headers['Content-Type']='application/json; charset=utf-8';
  if(etag!==undefined) {
    if(typeof etag !=='string' || etag==='*' || etag==='"*"') throw Error('Exact ETag required');
    headers['IF-MATCH']=etag;
  }
  return {type:'OpenApiConnection',inputs:{host:{apiId:'/providers/Microsoft.PowerApps/apis/shared_sharepointonline',connectionName:connection,operationId:'HttpRequest'},parameters:{dataset:"@parameters('siteUrl')",'parameters/method':method,'parameters/uri':uri,'parameters/headers':headers,...(body===undefined?{}:{'parameters/body':body})},retryPolicy:{type:'none'}},runAfter:{}};
}

/** Every CAS fragment contains real producers and explicit uncertain readback. */
export function casFragment(prefix,uri,beforeEtag,plannedBody) {
  return {
    [`${prefix}_Intent`]:{type:'Compose',inputs:{beforeEtag,plannedBody},runAfter:{}},
    [`${prefix}_CAS`]:{...httpRequest('content','POST',uri,plannedBody,beforeEtag),inputs:{...httpRequest('content','POST',uri,plannedBody,beforeEtag).inputs,parameters:{...httpRequest('content','POST',uri,plannedBody,beforeEtag).inputs.parameters,'parameters/headers':{Accept:'application/json;odata=nometadata','Content-Type':'application/json; charset=utf-8','IF-MATCH':beforeEtag,'X-HTTP-Method':'MERGE'}}},runAfter:{[`${prefix}_Intent`]:['Succeeded']}},
    [`${prefix}_Readback`]:{...httpRequest('content','GET',uri),runAfter:{[`${prefix}_CAS`]:['Succeeded','Failed','TimedOut']}},
    [`${prefix}_Uncertain`]:{type:'Compose',inputs:`@not(equals(outputs('${prefix}_CAS')?['statusCode'],204))`,runAfter:{[`${prefix}_Readback`]:['Succeeded']}}
  };
}

/** Immutable create fragment. No overwrite; conflicts and uncertain effects read back. */
export function fileCreateFragment(prefix,rootExpression,nameExpression,textExpression) {
  const folder = `concat('/_api/web/GetFolderByServerRelativeUrl(''',replace(${rootExpression},'''',''''''),''')/Files/add(url=''',${nameExpression},''',overwrite=false)')`;
  const file = `concat('/_api/web/GetFileByServerRelativeUrl(''',replace(concat(${rootExpression},'/',${nameExpression}),'''',''''''),''')/$value')`;
  const create = httpRequest('content','POST',`@${folder}`,`@${textExpression}`);
  create.inputs.parameters['parameters/headers']['Content-Type']='application/octet-stream';
  return {
    [`${prefix}_Create`]:create,
    [`${prefix}_Readback`]:{...httpRequest('content','GET',`@${file}`),runAfter:{[`${prefix}_Create`]:['Succeeded','Failed','TimedOut']}},
    [`${prefix}_ExactReadback`]:{type:'If',expression:`@equals(base64(string(body('${prefix}_Readback'))),base64(${textExpression}))`,actions:{},else:{actions:{[`${prefix}_Hold`]:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'RecoveryHold',message:'Immutable body response conflict or uncertain readback'}},runAfter:{}}}},runAfter:{[`${prefix}_Readback`]:['Succeeded']}}
  };
}

/** Read the complete ACL. Readback does not grant privileges or infer admission. */
export function aclReadFragment(prefix,itemUri) {
  return {
    [`${prefix}_Inheritance`]:httpRequest('acl','GET',`@concat(${itemUri},'?$select=Id,HasUniqueRoleAssignments')`),
    [`${prefix}_Roles`]:{...httpRequest('acl','GET',`@concat(${itemUri},'/roleassignments?$select=PrincipalId,RoleDefinitionBindings/Id&$expand=RoleDefinitionBindings')`),runAfter:{[`${prefix}_Inheritance`]:['Succeeded']}},
    [`${prefix}_NoInheritedOrPagedAcl`]:{type:'If',expression:`@and(equals(body('${prefix}_Inheritance')?['HasUniqueRoleAssignments'],true),not(contains(body('${prefix}_Roles'),'odata.nextLink')),not(contains(body('${prefix}_Roles'),'@odata.nextLink')))`,actions:{},else:{actions:{[`${prefix}_Hold`]:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'AclReadbackIncomplete',message:'Inherited or incomplete native role readback'}},runAfter:{}}}},runAfter:{[`${prefix}_Roles`]:['Succeeded']}}
  };
}

/** Developer-side state reducer mirrors durable decisions, never native execution. */
export function recoveryDecision({checkpoint,before,after,current,etagBefore,etagCurrent,intentPersisted,effectResponse}) {
  if(!phases.includes(checkpoint)) return 'RecoveryHold';
  if(!/^"[^"\r\n]+"$/.test(etagBefore || '') || etagBefore==='"*"' || !/^"[^"\r\n]+"$/.test(etagCurrent || '') || etagCurrent==='"*"') return 'RecoveryHold';
  const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  if(eq(current,before) && etagCurrent===etagBefore) return effectResponse==='notAttempted' && intentPersisted ? 'CASOnce' : 'RecoveryHold';
  if(intentPersisted && etagCurrent!==etagBefore && eq(current,after)) return 'ReconciledOwnCAS';
  return 'RecoveryHold';
}
