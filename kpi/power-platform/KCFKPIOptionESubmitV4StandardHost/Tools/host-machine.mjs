/** Source-only Standard WDL processor emitter. All operations are native SharePoint actions. */
import {httpRequest,referenceFields,phases} from './storage-native.mjs';
import {quotedString,compileCanonical,nativeSchema,byteLength,isStringScalar,exactText,exactRecord} from './canonical-wdl.mjs';
import {projectionValues,tierLevelExpression,levelTierExpression,valueOrderExpression} from './reference-projections.mjs';
import {domainAuthority,admissionSchema,receiptProjectionSchema} from './domain-projection.mjs';
import {emitPersonTargetAdmission} from './PersonTargetAdmissionV4.mjs';
import {emitCatalogueReader} from './CatalogueExactBodyReaderV4.mjs';
import {emitHistoricalSelectionOrigin} from './HistoricalSelectionProvenanceV4.mjs';
import {emitPrivateDraftListOrigin,privateDraftNativeRowSchema,privateDraftPhysicalOriginSchema} from './PrivateDraftListOriginV4.mjs';
const q=s=>`'${s.replaceAll("'","''")}'`;
const expr=s=>`@${s}`;
const exactNativeEtag=value=>`and(${isStringScalar(value)},greaterOrEquals(length(string(${value})),3),equals(substring(string(${value}),0,1),'"'),endsWith(string(${value}),'"'),not(equals(${value},'"*"')),not(contains(substring(string(${value}),1,if(greaterOrEquals(length(string(${value})),2),sub(length(string(${value})),2),0)),'"')),not(contains(string(${value}),decodeUriComponent('%0A'))),not(contains(string(${value}),decodeUriComponent('%0D'))))`;
const obj=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const text={type:'string'},number={type:'number'},boolean={type:'boolean'};
export const referenceSetSchema=obj({asOf:{type:'string',format:'date-time'},rows:{type:'array',items:obj({kind:{type:'string',enum:Object.keys(referenceFields)},key:{type:'string',minLength:1},itemId:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},etag:text,version:text,body:text})}});
export const hostVariables=[
  ['CatalogueIndex','integer',0],
  ['Origins','object',{}],['AdmittedOrigins','object',{}],['NativeReferences','array',[]],['NativeAssignment','object',{}],['ProtectedWorkplan','object',{}],['ProtectedTargetBody','object',{}],['DecodedADM','object',{}],['SelectedVersion','object',{}],['SelectedCatalogue','object',{}],['CatalogueProvenance','object',{}],['LogicalCatalogueRow','object',{}],['ReferenceClock','string',''],['NativeFieldMap','object',{}],['FieldText','string',''],['ReferenceParts','array',[]],
  ['Admission','object',{}],['CommandKey','string',''],['CommandUuid','string',''],['Checkpoint','string',''],['Operation','object',{}],['Control','object',{}],
  ['PlannedControl','object',{}],['NextEffect','string',''],['ControlIntent','object',{}],['ExpectedAcl','array',[]],['ActualAcl','array',[]],['AclTargets','array',[]],
  ['Snapshot','object',{}],['Receipt','object',{}],['AttemptedEffects','array',[]],['Finished','boolean',false],['HoldReason','string',''],['InitialReadDone','boolean',false],['DoubleReadReady','boolean',false],['InitialControl','object',{}],['SemanticsDone','boolean',false],['NextCheckpoint','string',''],['ControlReadback','object',{}],['NextJournal','object',{}],['ReferenceGroups','object',{}],['Index','integer',0],['WeightCents','integer',0],['SeenCore','array',[]],['SeenKpi','array',[]],['SeenImpact','array',[]],['SeenPrompt','array',[]],['SeenSelection','array',[]],['SeenFocus','array',[]],['SeenTarget','array',[]],['SelectionCount','integer',0]
].map(([name,type,value])=>({name,type,value}));

class Chain {
  constructor(prefix='') {this.prefix=prefix;this.actions={};this.previous=undefined;}
  add(name,a,status=['Succeeded']) {const n=this.prefix+name;a.runAfter=this.previous?{[this.previous]:status}:{};this.actions[n]=a;this.previous=n;return n;}
  set(name,value) {return this.add(`Set_${name}`,{type:'SetVariable',inputs:{name,value}});}
  guard(name,condition,reason=name) {return this.add(name,{type:'ParseJson',inputs:{content:expr(condition),schema:{type:'boolean',enum:[true]}},metadata:{guardReason:reason}});}
  http(name,connection,method,uri,body,etag,status) {return this.add(name,httpRequest(connection,method,uri,body,etag),status);}
}
const body=n=>`body('${n}')`;
const nativeRoot=k=>`parameters('listIds')?[${q(k)}]`;
function itemUri(kind,id) {return `concat('/_api/web/lists(guid''',${nativeRoot(kind)},''')/items(',string(${id}),')')`;}
function fileUri(kind,name,value=false) {return `concat('/_api/web/GetFileByServerRelativeUrl(''',replace(concat(parameters('rootPaths')?[${q(kind)}],'/',${name}),'''',''''''),''')${value?'/$value':'?$expand=ListItemAllFields'}')`;}
const fileText=n=>`base64ToString(body('${n}')?['$content'])`;
function decodeRequired(chain,name,read) {chain.guard(name,`and(equals(outputs('${read}')?['statusCode'],200),contains(${body(read)},'$content'),equals(base64(${fileText(read)}),${body(read)}?['$content']))`,'NativeUtf8ReadbackIncomplete');}
function readDoc(chain,kind,nameExpr,tag,allowMissing=false) {
  // Enumerate by the fixed native file name first. A legitimate absent document
  // never generates a failed HTTP action inside the durable effect loop.
  const meta=chain.http(`${tag}_Metadata`,'content','GET',expr(`concat('/_api/web/lists(guid''',parameters('listIds')?[${q(kind)}],''')/items?$filter=FileLeafRef eq ''',${nameExpr},'''&$top=2')`));
  const n=chain.prefix+`${tag}_Content`;
  chain.add(`${tag}_IfPresent`,{type:'If',expression:expr(`equals(length(body('${meta}')?['value']),1)`),actions:{[n]:httpRequest('content','GET',expr(fileUri(kind,nameExpr,true)))},else:{actions:{}}});
  const absent=`equals(length(body('${meta}')?['value']),0)`;
  const decoded=`if(${absent},'',${fileText(n)})`;
  const complete=`and(lessOrEquals(length(body('${meta}')?['value']),1),not(contains(body('${meta}'),'@odata.nextLink')),not(contains(body('${meta}'),'odata.nextLink')),if(${absent},${allowMissing?'true':'false'},and(equals(outputs('${n}')?['statusCode'],200),equals(base64(${decoded}),body('${n}')?['$content']),equals(first(body('${meta}')?['value'])?['AuthorId'],parameters('principalIds')?['content']))))`;
  (chain.documentPredicates??=[]).push(complete);
  return {read:n,text:decoded,absent,meta};
}
function writeDoc(chain,kind,nameExpr,textExpr,tag) {
  chain.guard(`${tag}_Capacity`,`lessOrEquals(${byteLength(textExpr)},1048576)`,'WholeDocumentCapacityHold');
  const uri=`concat('/_api/web/GetFolderByServerRelativeUrl(''',replace(parameters('rootPaths')?[${q(kind)}],'''',''''''),''')/Files/add(url=''',${nameExpr},''',overwrite=false)')`;
  const a=httpRequest('content','POST',expr(uri),expr(textExpr));a.inputs.parameters['parameters/headers']['Content-Type']='application/octet-stream';
  const write=chain.add(`${tag}_Write`,a);
  const read=chain.http(`${tag}_Readback`,'content','GET',expr(fileUri(kind,nameExpr,true)),undefined,undefined,['Succeeded','Failed','TimedOut']);
  chain.guard(`${tag}_Exact`, `and(equals(outputs('${read}')?['statusCode'],200),equals(body('${read}')?['$content'],base64(${textExpr})))`,'ImmutableCollisionOrUncertain');
  return write;
}

/** Full selected native record maps and all system coordinates are retained. */
export function loadOrigins(prefix,draftSchema,draftCanonical) {
  const c=new Chain(prefix);c.set('NativeReferences',[]);
  const request=c.http('Request','content','GET',expr(itemUri('Request',"triggerBody()?['ID']")));
  const requestContent=c.http('RequestContent','content','GET',expr(`concat('/_api/web/GetFileByServerRelativeUrl(''',replace(${body(request)}?['FileRef'],'''',''''''),''')/$value')`));
  decodeRequired(c,'RequestEncoding',requestContent);
  const draftOrigin=emitPrivateDraftListOrigin(c),draft=draftOrigin.read;
  const actor=c.http('Actor','content','GET',expr(`concat('/_api/web/lists(guid''',parameters('peopleListId'),''')/items?$filter=PrincipalID eq ',string(${body(request)}?['AuthorId']),'&$top=2')`));
  c.guard('ActorUnique',`and(equals(length(${body(actor)}?['value']),1),not(contains(${body(actor)},'@odata.nextLink')),not(contains(${body(actor)},'odata.nextLink')))`,'ProtectedActorCardinality');
  const manager=c.http('Manager','content','GET',expr(`concat('/_api/web/lists(guid''',parameters('peopleListId'),''')/items?$filter=PersonKey eq ''',uriComponent(replace(first(${body(actor)}?['value'])?['ManagerPersonKey'],'''','''''')),'''&$top=2')`));
  c.guard('ManagerUnique',`and(equals(length(${body(manager)}?['value']),1),not(contains(${body(manager)},'@odata.nextLink')),not(contains(${body(manager)},'odata.nextLink')))`,'ProtectedManagerCardinality');
  const control=c.http('Control','content','GET',expr(`concat('/_api/web/lists(guid''',parameters('listIds')?['Control'],''')/items?$filter=WorkplanKey eq ''',uriComponent(replace(body('Parse_Request')?['workplan'],'''','''''')),'''&$top=2')`));
  c.guard('ControlUnique',`and(equals(length(${body(control)}?['value']),1),not(contains(${body(control)},'@odata.nextLink')),not(contains(${body(control)},'odata.nextLink')))`,'ProtectedControlCardinality');
  const assignment=c.http('Assignment','content','GET',expr(`concat('/_api/web/lists(guid''',parameters('referenceListIds')?['Assignment'],''')/items?$filter=PersonKey eq ''',uriComponent(replace(first(body('${actor}')?['value'])?['PersonKey'],'''','''''')),''' and FrameworkVersion eq ''',uriComponent(replace(body('Parse_Draft')?['behaviours']?['frameworkVersion'],'''','''''')),''' and Active eq 1&$top=2')`));
  c.guard('AssignmentUnique',`and(equals(length(body('${assignment}')?['value']),1),not(contains(body('${assignment}'),'@odata.nextLink')),not(contains(body('${assignment}'),'odata.nextLink')),contains(createArray('IC_OFFICER','PEOPLE_MANAGER','SENIOR_LEADER'),first(body('${assignment}')?['value'])?['RoleTier']))`,'ProtectedAssignmentMissingOrAmbiguous');
  c.set('NativeAssignment',expr(`first(body('${assignment}')?['value'])`));
  const workplan=c.http('ProtectedWorkplan','content','GET',expr(`concat('/_api/web/lists(guid''',parameters('protectedWorkplanListId'),''')/items?$filter=WorkplanKey eq ''',uriComponent(replace(body('Parse_Request')?['workplan'],'''','''''')),''' and PersonKey eq ''',uriComponent(replace(first(body('${actor}')?['value'])?['PersonKey'],'''','''''')),''' and PerformanceYear eq ',string(body('Parse_Request')?['year']),'&$top=2')`));
  c.guard('ProtectedWorkplanUnique',`and(equals(length(body('${workplan}')?['value']),1),not(contains(body('${workplan}'),'@odata.nextLink')),not(contains(body('${workplan}'),'odata.nextLink')))`,'ProtectedWorkplanContextMissing');
  c.set('ProtectedWorkplan',expr(`first(body('${workplan}')?['value'])`));
  c.set('ReferenceClock',expr(`formatDateTime(body('${draft}')?['Modified'],'yyyy-MM-ddTHH:mm:ss.fffZ')`));
  const catalogueReader=new Chain(prefix+'Catalogue_');
  const catalogueOrigin=emitCatalogueReader(catalogueReader);
  const historicalOrigin=emitHistoricalSelectionOrigin(catalogueReader,catalogueOrigin,draftSchema);
  catalogueReader.add('ReadbackOrigin',{type:'Compose',inputs:catalogueOrigin});
  catalogueReader.add('HistoricalOrigin',{type:'Compose',inputs:historicalOrigin});
  c.add('CatalogueReader',{type:'If',expression:"@contains(body('Parse_Draft')?['behaviours'],'governedExtension')",actions:catalogueReader.actions,else:{actions:{}}});
  // One existing serializer validates BOTH the immutable Submit Draft and the
  // captured original saved Draft. Serial execution preserves all full-wire
  // canonical/presence/escaping guards without duplicating the action graph.
  const draftActions=structuredClone(draftCanonical.actions),draftNames=Object.keys(draftActions),draftLoop=prefix+'CanonicalDrafts',candidate=`items('${draftLoop}')`;
  draftActions[prefix+'RequireExactDraft']={type:'ParseJson',inputs:{content:expr(`and(${exactText(draftCanonical.value,`${candidate}?['raw']`)},lessOrEquals(${byteLength(`${candidate}?['raw']`)},56000))`),schema:{type:'boolean',enum:[true]}},metadata:{guardReason:'OriginalAndCurrentClosedDraftCanonicalMismatch'},runAfter:{[draftNames.at(-1)]:['Succeeded']}};
  c.add('CanonicalDrafts',{type:'Foreach',foreach:[{parsed:"@body('Parse_Draft')",raw:"@body('Parse_Request')?['source']?['body']"},{parsed:"@if(contains(body('Parse_Draft')?['behaviours'],'governedExtension'),json(variables('CatalogueProvenance')?['draftOrigin']?['body']),body('Parse_Draft'))",raw:"@if(contains(body('Parse_Draft')?['behaviours'],'governedExtension'),variables('CatalogueProvenance')?['draftOrigin']?['body'],body('Parse_Request')?['source']?['body'])"}],actions:draftActions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  const loopName=prefix+'References';
  const rc=new Chain(prefix+'Ref_');
  const logicalKind=`contains(createArray('Catalogue','Headline','Focus','BehaviourTarget'),items('${loopName}')?['kind'])`;
  const refList=`if(${logicalKind},parameters('catalogueStoreListId'),parameters('referenceListIds')?[items('${loopName}')?['kind']])`;
  const refNative=rc.http('Native','content','GET',expr(`concat('/_api/web/lists(guid''',${refList},''')/items(',string(items('${loopName}')?['itemId']),')')`));
  const refNativeB=rc.http('NativeB','content','GET',expr(`concat('/_api/web/lists(guid''',${refList},''')/items(',string(items('${loopName}')?['itemId']),')')`));
  rc.guard('Stable',`and(equals(${body(refNative)},${body(refNativeB)}),equals(${body(refNative)}?['Id'],items('${loopName}')?['itemId']),if(${logicalKind},and(equals(${body(refNative)},outputs('${prefix}Catalogue_ReadbackOrigin')?['native']),equals(items('${loopName}')?['etag'],variables('CatalogueProvenance')?['catalogueNativeOrigin']?['etag']),equals(items('${loopName}')?['version'],variables('CatalogueProvenance')?['catalogueNativeOrigin']?['version'])),and(equals(${body(refNative)}?['@odata.etag'],items('${loopName}')?['etag']),equals(${body(refNative)}?['OData__UIVersionString'],items('${loopName}')?['version']))))`,'ProtectedReferenceOriginMismatch');
  const cases={};
  const boolKeys=new Set(['active','published','immutable']);
  const numberKeys=new Set(['performanceYear','catalogueRevision','governedOrder']);
  const adm=new Chain(prefix+'ADM_');
  const logical=new Chain(prefix+'Logical_');
  const requested=logical.add('RequestedBody',{type:'Compose',inputs:expr(`json(items('${loopName}')?['body'])`)});
  const selectedRows=logical.add('SelectedRows',{type:'Query',inputs:{from:expr(`if(equals(items('${loopName}')?['kind'],'Headline'),variables('SelectedCatalogue')?['headlineBehaviours'],variables('SelectedCatalogue')?['rows'])`),where:expr(`if(equals(items('${loopName}')?['kind'],'Headline'),equals(item()?['behaviourKey'],outputs('${requested}')?['behaviourKey']),if(equals(items('${loopName}')?['kind'],'BehaviourTarget'),equals(item()?['targetKey'],outputs('${requested}')?['targetKey']),and(equals(item()?['behaviourKey'],outputs('${requested}')?['behaviourKey']),equals(item()?['focusKey'],outputs('${requested}')?['focusKey']),equals(item()?['roleLevelCode'],outputs('${requested}')?['roleLevelCode']))))`)}});
  logical.guard('SelectedScope',`if(equals(items('${loopName}')?['kind'],'Focus'),greater(length(body('${selectedRows}')),0),equals(length(body('${selectedRows}')),1))`,'CatalogueLogicalScopeMismatch');
  logical.set('LogicalCatalogueRow',expr(`first(body('${selectedRows}'))`));
  adm.add('LogicalProjection',{type:'If',expression:expr(`not(equals(items('${loopName}')?['kind'],'Catalogue'))`),actions:logical.actions,else:{actions:{}}});
  rc.add('ADM',{type:'If',expression:expr(logicalKind),actions:adm.actions,else:{actions:{}}});
  const bodyCases=[];
  for(const [kind,fields] of Object.entries(referenceFields)) {
    const cc=new Chain(prefix+'Ref_'+kind+'_');
    const properties=Object.fromEntries(Object.keys(fields).map(k=>[k,boolKeys.has(k)?boolean:numberKeys.has(k)?{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}:['annual','q1','q2','q3','q4'].includes(k)?obj({success:text,value:{anyOf:[text,number]}},[]):k.endsWith('From')||k.endsWith('To')||k==='asOfDate'?{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'}:text]));
    bodyCases.push(obj({kind:{type:'string',enum:[kind]},body:obj(properties,Object.keys(fields).filter(k=>k!=='effectiveTo'))}));
    if(kind==='Target') {
      const origin=emitPersonTargetAdmission(cc,{nativeTarget:refNative,draftText:draftOrigin.payload,draftNative:body(draft),draftPhysicalOrigin:draftOrigin.physicalOrigin,referenceLoop:loopName});
      cc.add('MixedOrigin',{type:'Compose',inputs:origin});
    }
    const keyField={Kpi:'KPIVersionKey',Target:'TargetVersionKey',Framework:'FrameworkVersion',Assignment:'PersonKey',Value:'FrameworkValueKey',Prompt:'BehaviourObjectiveKey',Catalogue:'CatalogueVersion',Headline:'BehaviourKey',Focus:'FocusKey',BehaviourTarget:'TargetKey'}[kind];
    const values=projectionValues(kind,body(refNative),"variables('NativeAssignment')");
    cc.set('NativeFieldMap',{keyField,fields:Object.keys(fields).sort().map(key=>({key,value:expr(values[key]),type:boolKeys.has(key)||numberKeys.has(key)?'scalar':['annual','q1','q2','q3','q4'].includes(key)?'json':'string',optional:key==='effectiveTo',present:expr(key==='effectiveTo'?`contains(variables('${kind==='Catalogue'?'SelectedCatalogue':'LogicalCatalogueRow'}'),'effectiveTo')`:'true')}))});
    cases[prefix+'Case_'+kind]={case:kind,actions:cc.actions};
  }
  rc.add('ClosedBodySchema',{type:'ParseJson',inputs:{content:{kind:expr(`items('${loopName}')?['kind']`),body:expr(`json(items('${loopName}')?['body'])`)},schema:{anyOf:bodyCases}}});
  rc.guard('ProtectedJoins',`and(if(equals(items('${loopName}')?['kind'],'Assignment'),equals(body('${refNative}'),variables('NativeAssignment')),true),if(equals(items('${loopName}')?['kind'],'Value'),and(equals(body('${refNative}')?['FrameworkVersion'],variables('NativeAssignment')?['FrameworkVersion']),equals(body('${refNative}')?['FrameworkValueKey'],concat(body('${refNative}')?['FrameworkVersion'],'|',body('${refNative}')?['ValueID'])),greater(${valueOrderExpression(`body('${refNative}')?['ValueID']`)},0),not(empty(trim(body('${refNative}')?[if(equals(variables('NativeAssignment')?['RoleTier'],'IC_OFFICER'),'ICOfficerDescriptor',if(equals(variables('NativeAssignment')?['RoleTier'],'PEOPLE_MANAGER'),'PeopleManagerDescriptor','SeniorLeaderDescriptor'))])))),true),if(equals(items('${loopName}')?['kind'],'Prompt'),equals(${levelTierExpression(`body('${refNative}')?['RoleLevelCode']`)},variables('NativeAssignment')?['RoleTier']),true))`,'ProtectedAssignmentValuePromptJoinMismatch');
  rc.add('MapBody',{type:'Switch',expression:expr(`items('${loopName}')?['kind']`),cases,default:{actions:{[prefix+'UnknownReferenceKind']:{type:'SetVariable',inputs:{name:'HoldReason',value:'UnknownReferenceKind'},runAfter:{}}}}});
  rc.set('ReferenceParts',[]);
  const fieldLoop=prefix+'Ref_Fields',fc=new Chain(prefix+'Ref_Field_'),fieldRead=`items('${fieldLoop}')?['value']`;
  const valueString=quotedString(`string(${fieldRead})`);
  const jsonValue=new Chain(prefix+'Ref_Json_');
  const success=quotedString(`string(${fieldRead}?['success'])`),scalar=quotedString(`string(${fieldRead}?['value'])`);
  jsonValue.set('FieldText',expr(`concat('{',if(contains(${fieldRead},'success'),concat('"success":',${success}),''),if(contains(${fieldRead},'value'),concat(if(contains(${fieldRead},'success'),',',''),'"value":',if(${isStringScalar(`${fieldRead}?['value']`)},${scalar},string(${fieldRead}?['value']))),''),'}')`));
  fc.add('Encode',{type:'Switch',expression:expr(`items('${fieldLoop}')?['type']`),cases:{[prefix+'Ref_Json']:{case:'json',actions:jsonValue.actions},[prefix+'Ref_Scalar']:{case:'scalar',actions:{[prefix+'Ref_ScalarValue']:{type:'SetVariable',inputs:{name:'FieldText',value:expr(`string(${fieldRead})`)},runAfter:{}}}}},default:{actions:{[prefix+'Ref_StringValue']:{type:'SetVariable',inputs:{name:'FieldText',value:expr(valueString)},runAfter:{}}}}});
  fc.add('Append',{type:'If',expression:expr(`items('${fieldLoop}')?['present']`),actions:{[prefix+'Ref_AppendField']:{type:'AppendToArrayVariable',inputs:{name:'ReferenceParts',value:expr(`concat('"',items('${fieldLoop}')?['key'],'":',variables('FieldText'))`)},runAfter:{}}},else:{actions:{}}});
  rc.add('Fields',{type:'Foreach',foreach:"@variables('NativeFieldMap')?['fields']",actions:fc.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  rc.guard('BodyExact',`equals(concat('{',join(variables('ReferenceParts'),','),'}'),items('${loopName}')?['body'])`,'ProtectedReferenceCompleteBodyMismatch');
  const unique=new Chain(prefix+'Unique_');
  const uq=unique.http('ScopeUnique','content','GET',expr(`concat('/_api/web/lists(guid''',parameters('referenceListIds')?[items('${loopName}')?['kind']],''')/items?$filter=',variables('NativeFieldMap')?['keyField'],' eq ''',uriComponent(replace(string(body('${refNative}')?[variables('NativeFieldMap')?['keyField']]),'''','''''')),'''&$top=2')`));
  unique.guard('ScopeUniqueCheck',`and(equals(length(${body(uq)}?['value']),1),equals(first(${body(uq)}?['value'])?['Id'],items('${loopName}')?['itemId']),equals(first(${body(uq)}?['value'])?['@odata.etag'],items('${loopName}')?['etag']),not(contains(${body(uq)},'@odata.nextLink')),not(contains(${body(uq)},'odata.nextLink')))`,'ProtectedReferenceScopeCardinality');
  rc.add('NativeScope',{type:'If',expression:expr(`not(${logicalKind})`),actions:unique.actions,else:{actions:{}}});
  rc.add('Append',{type:'AppendToArrayVariable',inputs:{name:'NativeReferences',value:{row:expr(`items('${loopName}')`),native:expr(`if(${logicalKind},addProperty(addProperty(addProperty(addProperty(json('{}'),'nativeOrigin','CatalogueExactBodyReaderV4'),'itemId',body('${refNative}')?['Id']),'etag',body('${refNative}')?['@odata.etag']),'version',body('${refNative}')?['OData__UIVersionString']),body('${refNative}'))`),personTargetAdmission:expr(`if(equals(items('${loopName}')?['kind'],'Target'),outputs('${prefix}Ref_Target_MixedOrigin'),json('{}'))`)}}});
  c.add('References',{type:'Foreach',foreach:"@body('Parse_References')?['rows']",actions:rc.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  const draftReadback=draftOrigin.readback();
  c.set('Control',expr(`first(${body(control)}?['value'])`));
  c.set('Origins',{request:expr(body(request)),requestBody:expr(fileText(requestContent)),draft:expr(body(draft)),draftBody:expr(draftOrigin.payload),draftPhysicalOrigin:draftOrigin.physicalOrigin,draftReadback:expr(body(draftReadback)),actor:expr(`first(${body(actor)}?['value'])`),manager:expr(`first(${body(manager)}?['value'])`),assignment:"@variables('NativeAssignment')",protectedWorkplan:"@variables('ProtectedWorkplan')",references:"@variables('NativeReferences')",referenceAsOf:"@variables('ReferenceClock')",catalogueReadback:expr(`if(contains(body('Parse_Draft')?['behaviours'],'governedExtension'),outputs('${prefix}Catalogue_ReadbackOrigin'),json('{}'))`),historicalSelectionOrigin:expr(`if(contains(body('Parse_Draft')?['behaviours'],'governedExtension'),outputs('${prefix}Catalogue_HistoricalOrigin'),json('{}'))`)});
  const etag={type:'string',pattern:'^"[^"\\r\\n]+"$',not:{enum:['"*"']}},coordinate={type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER};
  const carrier=properties=>({type:'object',required:Object.keys(properties),properties});
  const person=carrier({Id:coordinate,PersonKey:text,PrincipalID:coordinate,Active:{type:'boolean',enum:[true]},OData__UIVersionString:text,'@odata.etag':etag});
  c.add('TypedNativeAuthority',{type:'ParseJson',inputs:{content:{origins:"@variables('Origins')",control:"@variables('Control')"},schema:carrier({origins:carrier({request:carrier({Id:coordinate,AuthorId:coordinate,OData__UIVersionString:text,'@odata.etag':etag}),draft:privateDraftNativeRowSchema,draftPhysicalOrigin:privateDraftPhysicalOriginSchema,draftReadback:privateDraftNativeRowSchema,actor:person,manager:person}),control:carrier({Id:coordinate,WorkplanKey:text,PersonKey:text,PerformanceYear:{type:'integer',minimum:2000,maximum:9999},DraftItemID:coordinate,ManagerPersonKey:text,HierarchyEpoch:coordinate,AclEpoch:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},State:{type:'string',enum:['Draft','ChangesRequested','Submitted']},TransitionStatus:{type:'string',enum:['Ready','Submitting','AclPending']},OData__UIVersionString:text,'@odata.etag':etag})})}});
  c.guard('Tuple',`and(${exactText("variables('Origins')?['requestBody']","outputs('Decode_Request')")},${exactText("variables('Origins')?['draftBody']","body('Parse_Request')?['source']?['body']")},equals(variables('Origins')?['draft']?['Id'],body('Parse_Request')?['source']?['itemId']),equals(variables('Origins')?['draft']?['@odata.etag'],body('Parse_Request')?['source']?['etag']),equals(variables('Origins')?['draft']?['OData__UIVersionString'],body('Parse_Request')?['source']?['version']),equals(variables('Origins')?['draft']?['AuthorId'],variables('Origins')?['actor']?['PrincipalID']),equals(variables('Origins')?['actor']?['PrincipalID'],variables('Origins')?['request']?['AuthorId']),equals(variables('Origins')?['actor']?['PersonKey'],body('Parse_Request')?['person']),equals(variables('Origins')?['actor']?['ManagerPersonKey'],variables('Origins')?['manager']?['PersonKey']),not(equals(variables('Origins')?['actor']?['PrincipalID'],variables('Origins')?['manager']?['PrincipalID'])),equals(variables('Control')?['ManagerPersonKey'],variables('Origins')?['manager']?['PersonKey']),equals(variables('Control')?['PersonKey'],body('Parse_Request')?['person']),equals(variables('Control')?['PerformanceYear'],body('Parse_Request')?['year']),equals(variables('Control')?['DraftItemID'],body('Parse_Request')?['source']?['itemId']),equals(variables('ReferenceClock'),body('Parse_References')?['asOf']),lessOrEquals(variables('Control')?['AclEpoch'],variables('Control')?['HierarchyEpoch']))`,'ProtectedAuthorityTupleMismatch');
  return c.actions;
}

/** Product semantic validation mirrors the closed Draft/reference contract, not a caller claim. */
function semanticValidation() {
  const c=new Chain('Semantic_');
  const decoded=c.add('Decoded',{type:'Select',inputs:{from:"@body('Parse_References')?['rows']",select:{kind:'@item()?[\'kind\']',key:'@item()?[\'key\']',value:'@json(item()?[\'body\'])'}}});
  const query=(chain,name,predicate)=>chain.add(name,{type:'Query',inputs:{from:expr(body(decoded)),where:expr(predicate)}});
  const kind=k=>`equals(item()?['kind'],${q(k)})`;
  const all={};for(const k of Object.keys(referenceFields))all[k]='Semantic_Group_'+k;
  c.set('ReferenceGroups',{});
  const groupLoop='Semantic_GroupKinds',groups=new Chain('Semantic_Group_');
  const members=groups.add('Members',{type:'Query',inputs:{from:expr(body(decoded)),where:expr(`equals(item()?['kind'],items('${groupLoop}'))`)}});
  const updated=groups.add('Updated',{type:'Compose',inputs:expr(`addProperty(variables('ReferenceGroups'),items('${groupLoop}'),body('${members}'))`)});
  groups.set('ReferenceGroups',expr(`outputs('${updated}')`));
  c.add('GroupKinds',{type:'Foreach',foreach:expr(`json(${q(JSON.stringify(Object.keys(referenceFields)))})`),actions:groups.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  c.guard('Cardinality',`and(equals(length(body('${all.Kpi}')),length(body('Parse_Draft')?['core']?['entries'])),equals(length(body('${all.Target}')),length(body('Parse_Draft')?['core']?['entries'])),equals(length(body('${all.Framework}')),1),equals(length(body('${all.Assignment}')),1),equals(length(body('${all.Value}')),5),equals(length(body('${all.Catalogue}')),if(contains(body('Parse_Draft')?['behaviours'],'governedExtension'),1,0)))`,'ReferenceSetCardinality');
  c.guard('FrameworkAssignment',`and(equals(first(body('${all.Framework}'))?['value']?['frameworkVersion'],body('Parse_Draft')?['behaviours']?['frameworkVersion']),equals(first(body('${all.Framework}'))?['value']?['published'],true),equals(first(body('${all.Framework}'))?['value']?['immutable'],true),equals(first(body('${all.Assignment}'))?['value']?['personKey'],body('Parse_Request')?['person']),equals(first(body('${all.Assignment}'))?['value']?['frameworkVersion'],body('Parse_Draft')?['behaviours']?['frameworkVersion']),equals(first(body('${all.Assignment}'))?['value']?['roleTier'],body('Parse_Draft')?['behaviours']?['roleTier']),equals(first(body('${all.Assignment}'))?['value']?['active'],true))`,'ProtectedFrameworkAssignmentMismatch');
  const coreLoop='Semantic_Core',core=new Chain('Semantic_CoreItem_');
  const entry=`items('${coreLoop}')`;
  const kpi=core.add('Kpi',{type:'Query',inputs:{from:expr(body(all.Kpi)),where:expr(`and(equals(item()?['value']?['kpiId'],${entry}?['kpiId']),equals(item()?['value']?['kpiVersionKey'],${entry}?['kpiVersionKey']),equals(item()?['value']?['active'],true))`)}});
  const target=core.add('Target',{type:'Query',inputs:{from:expr(body(all.Target)),where:expr(`and(equals(item()?['value']?['targetVersionKey'],${entry}?['targetVersionKey']),equals(item()?['value']?['kpiId'],${entry}?['kpiId']),equals(item()?['value']?['performanceYear'],body('Parse_Request')?['year']),equals(item()?['value']?['status'],'Approved'))`)}});
  core.guard('KeysWeight',`and(not(empty(trim(${entry}?['coreId']))),not(empty(trim(${entry}?['kpiId']))),not(empty(trim(${entry}?['kpiVersionKey']))),not(empty(trim(${entry}?['targetVersionKey']))),not(contains(variables('SeenCore'),${entry}?['coreId'])),not(contains(variables('SeenKpi'),${entry}?['kpiId'])),greaterOrEquals(${entry}?['weightPercent'],0),equals(mul(${entry}?['weightPercent'],100),int(string(mul(${entry}?['weightPercent'],100)))))`,'CoreIdentityOrWeightMismatch');
  core.guard('ProtectedTarget',`and(equals(length(body('${kpi}')),1),equals(length(body('${target}')),1),${['role','annual','q1','q2','q3','q4'].map(k=>`equals(first(body('${target}'))?['value']?[${q(k)}],${entry}?[${q(k)}])`).join(',')})`,'ProtectedTargetBodyMismatch');
  core.add('AppendCore',{type:'AppendToArrayVariable',inputs:{name:'SeenCore',value:expr(`${entry}?['coreId']`)}});
  core.add('AppendKpi',{type:'AppendToArrayVariable',inputs:{name:'SeenKpi',value:expr(`${entry}?['kpiId']`)}});
  core.add('AddWeight',{type:'IncrementVariable',inputs:{name:'WeightCents',value:expr(`int(string(mul(${entry}?['weightPercent'],100)))`)}});
  core.guard('EqualWeights',`or(not(equals(body('Parse_Draft')?['core']?['weightingMode'],'Equal')),equals(${entry}?['weightPercent'],add(div(100,length(body('Parse_Draft')?['core']?['entries'])),if(less(variables('Index'),mod(100,length(body('Parse_Draft')?['core']?['entries']))),1,0))))`,'EqualCoreAllocationMismatch');
  core.add('Increment',{type:'IncrementVariable',inputs:{name:'Index',value:1}});
  c.add('Core',{type:'Foreach',foreach:"@body('Parse_Draft')?['core']?['entries']",actions:core.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  c.guard('WeightTotal',"or(equals(length(body('Parse_Draft')?['core']?['entries']),0),equals(variables('WeightCents'),10000))",'CoreWeightTotalMismatch');
  const iloop='Semantic_Impact',ic=new Chain('Semantic_ImpactItem_');
  ic.guard('Identity',`and(not(empty(trim(items('${iloop}')?['impactId']))),not(empty(trim(items('${iloop}')?['wording']))),not(empty(trim(items('${iloop}')?['measure']))),not(contains(variables('SeenImpact'),items('${iloop}')?['impactId'])))`,'ImpactIdentityMismatch');
  ic.add('Append',{type:'AppendToArrayVariable',inputs:{name:'SeenImpact',value:expr(`items('${iloop}')?['impactId']`)}});
  c.add('Impact',{type:'Foreach',foreach:"@body('Parse_Draft')?['impact']",actions:ic.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  c.set('Index',0);
  c.guard('FiveValues',"and(equals(length(body('Parse_Draft')?['behaviours']?['entries']),5),not(empty(trim(body('Parse_Draft')?['behaviours']?['roleTier']))))",'BehaviourValueCount');
  const bloop='Semantic_Behaviours',bc=new Chain('Semantic_BehaviourItem_'),b=`items('${bloop}')`;
  const val=bc.add('Value',{type:'Query',inputs:{from:expr(body(all.Value)),where:expr(`and(equals(item()?['value']?['frameworkValueKey'],concat(body('Parse_Draft')?['behaviours']?['frameworkVersion'],'|',${b}?['valueId'])),equals(item()?['value']?['frameworkVersion'],body('Parse_Draft')?['behaviours']?['frameworkVersion']),equals(item()?['value']?['valueId'],${b}?['valueId']),equals(item()?['value']?['roleTier'],body('Parse_Draft')?['behaviours']?['roleTier']),equals(item()?['value']?['descriptorKey'],${b}?['descriptorKey']),equals(item()?['value']?['governedOrder'],add(variables('Index'),1)))`)}});
  bc.guard('GovernedValue',`and(equals(${b}?['valueId'],concat('BHV-0',string(add(variables('Index'),1)))),not(empty(trim(${b}?['descriptorKey']))),equals(length(body('${val}')),1),equals(length(${b}?['guidancePromptKeys']),5),equals(length(union(${b}?['guidancePromptKeys'],${b}?['guidancePromptKeys'])),5),equals(length(union(${b}?['selectedPromptKeys'],${b}?['selectedPromptKeys'])),length(${b}?['selectedPromptKeys'])))`,'ProtectedBehaviourValueMismatch');
  const selectedLoop='Semantic_BehaviourItem_SelectedPrompts',selected=new Chain('Semantic_SelectedPrompt_');
  selected.guard('Member',`contains(${b}?['guidancePromptKeys'],items('${selectedLoop}'))`,'SelectedPromptOutsideGuidance');
  bc.add('SelectedPrompts',{type:'Foreach',foreach:expr(`${b}?['selectedPromptKeys']`),actions:selected.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  const promptsLoop='Semantic_BehaviourItem_GuidancePrompts',pc=new Chain('Semantic_Prompt_');
  const pp=pc.add('Reference',{type:'Query',inputs:{from:expr(body(all.Prompt)),where:expr(`and(equals(item()?['value']?['promptKey'],items('${promptsLoop}')),equals(item()?['value']?['behaviourKey'],${b}?['valueId']),equals(item()?['value']?['roleTier'],body('Parse_Draft')?['behaviours']?['roleTier']),equals(item()?['value']?['active'],true))`)}});
  pc.guard('Unique',`and(not(empty(trim(items('${promptsLoop}')))),not(contains(variables('SeenPrompt'),items('${promptsLoop}'))),equals(length(body('${pp}')),1))`,'ProtectedPromptMismatch');
  pc.add('Append',{type:'AppendToArrayVariable',inputs:{name:'SeenPrompt',value:expr(`items('${promptsLoop}')`)}});
  bc.add('GuidancePrompts',{type:'Foreach',foreach:expr(`${b}?['guidancePromptKeys']`),actions:pc.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  bc.add('Increment',{type:'IncrementVariable',inputs:{name:'Index',value:1}});
  c.add('Behaviours',{type:'Foreach',foreach:"@body('Parse_Draft')?['behaviours']?['entries']",actions:bc.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  c.guard('PromptCardinality',`equals(length(body('${all.Prompt}')),length(variables('SeenPrompt')))`,'PromptScopeCardinality');
  const ext=new Chain('Semantic_Ext_');
  const e="body('Parse_Draft')?['behaviours']?['governedExtension']",catalogue=`first(body('${all.Catalogue}'))?['value']`;
  const effective=ref=>`and(equals(formatDateTime(concat(${ref}?['effectiveFrom'],'T00:00:00Z'),'yyyy-MM-dd'),${ref}?['effectiveFrom']),lessOrEquals(ticks(concat(${ref}?['effectiveFrom'],'T00:00:00Z')),ticks(concat(${catalogue}?['asOfDate'],'T00:00:00Z'))),if(contains(${ref},'effectiveTo'),and(equals(formatDateTime(concat(${ref}?['effectiveTo'],'T00:00:00Z'),'yyyy-MM-dd'),${ref}?['effectiveTo']),greaterOrEquals(ticks(concat(${ref}?['effectiveTo'],'T00:00:00Z')),ticks(concat(${catalogue}?['asOfDate'],'T00:00:00Z')))),true))`;
  ext.guard('Catalogue',`and(${['catalogueId','catalogueVersion','catalogueRevision','catalogueEtag','catalogueContentSha256','approvalReference'].map(k=>`equals(${catalogue}?[${q(k)}],${e}?['authority']?[${q(k)}])`).join(',')},equals(${catalogue}?['published'],true),equals(${catalogue}?['immutable'],true),equals(formatDateTime(concat(${catalogue}?['asOfDate'],'T00:00:00Z'),'yyyy-MM-dd'),${catalogue}?['asOfDate']),${effective(catalogue)},equals(first(body('${all.Assignment}'))?['value']?['roleLevelCode'],${e}?['roleLevelCode']),equals(length(${e}?['headlines']),5),equals(length(body('${all.Headline}')),5))`,'GovernedCatalogueMismatch');
  ext.set('Index',0);
  const hloop='Semantic_Ext_Headlines',hc=new Chain('Semantic_Headline_'),headline=`items('${hloop}')`;
  const head=hc.add('Reference',{type:'Query',inputs:{from:expr(body(all.Headline)),where:expr(`and(equals(item()?['value']?['behaviourKey'],${headline}?['behaviourKey']),equals(item()?['value']?['headlineTitle'],${headline}?['headlineTitle']),equals(item()?['value']?['governedOrder'],add(variables('Index'),1)))`)}});
  hc.guard('Identity',`and(equals(${headline}?['behaviourKey'],concat('BHV-0',string(add(variables('Index'),1)))),not(empty(trim(${headline}?['headlineTitle']))),equals(length(body('${head}')),1))`,'GovernedHeadlineMismatch');
  const sloop='Semantic_Headline_Selections',s=`items('${sloop}')`,sel=new Chain('Semantic_Selection_');
  const focus=sel.add('Focus',{type:'Query',inputs:{from:expr(body(all.Focus)),where:expr(`and(equals(item()?['value']?['behaviourKey'],${s}?['behaviourKey']),equals(item()?['value']?['focusKey'],${s}?['focusKey']),equals(item()?['value']?['focusTitle'],${s}?['focusTitle']),equals(item()?['value']?['roleLevelCode'],${s}?['roleLevelCode']),equals(item()?['value']?['status'],'Published'),${effective("item()?['value']")})`)}});
  const targetS=sel.add('Target',{type:'Query',inputs:{from:expr(body(all.BehaviourTarget)),where:expr(`and(equals(item()?['value']?['targetKey'],${s}?['targetKey']),equals(item()?['value']?['targetKey'],${s}?['selectionKey']),equals(item()?['value']?['behaviourKey'],${s}?['behaviourKey']),equals(item()?['value']?['focusKey'],${s}?['focusKey']),equals(item()?['value']?['focusTitle'],${s}?['focusTitle']),equals(item()?['value']?['roleLevelCode'],${s}?['roleLevelCode']),equals(item()?['value']?['selectedWording'],${s}?['selectedWording']),equals(item()?['value']?['status'],'Published'),${effective("item()?['value']")})`)}});
  sel.guard('Correspondence',`and(not(contains(variables('SeenSelection'),${s}?['selectionKey'])),equals(${s}?['behaviourKey'],${headline}?['behaviourKey']),equals(${s}?['headlineTitle'],${headline}?['headlineTitle']),equals(${s}?['roleLevelCode'],${e}?['roleLevelCode']),${['catalogueId','catalogueVersion','catalogueRevision','catalogueEtag','catalogueContentSha256'].map(k=>`equals(${s}?[${q(k)}],${e}?['authority']?[${q(k)}])`).join(',')},not(empty(trim(${s}?['focusKey']))),not(empty(trim(${s}?['focusTitle']))),not(empty(trim(${s}?['selectedWording']))),not(empty(trim(${s}?['myCommitment']))),not(empty(trim(${s}?['howWillWeKnow']))),equals(length(body('${focus}')),1),if(equals(${s}?['source'],'Own'),and(not(contains(${s},'targetKey')),equals(${s}?['selectedWording'],${s}?['myCommitment'])),and(equals(${s}?['targetKey'],${s}?['selectionKey']),contains(variables('CatalogueProvenance')?['selectedTargetKeys'],${s}?['targetKey']),equals(length(body('${targetS}')),1))))`,'GovernedSelectionMismatch');
  sel.add('AppendSelection',{type:'AppendToArrayVariable',inputs:{name:'SeenSelection',value:expr(`${s}?['selectionKey']`)}});
  sel.add('AppendFocus',{type:'AppendToArrayVariable',inputs:{name:'SeenFocus',value:expr(`${s}?['focusKey']`)}});
  sel.add('AppendTarget',{type:'If',expression:expr(`equals(${s}?['source'],'Catalogue')`),actions:{Semantic_AppendSelectedTarget:{type:'AppendToArrayVariable',inputs:{name:'SeenTarget',value:expr(`${s}?['targetKey']`)},runAfter:{}}},else:{actions:{}}});
  sel.add('Increment',{type:'IncrementVariable',inputs:{name:'SelectionCount',value:1}});
  hc.add('Selections',{type:'Foreach',foreach:expr(`${headline}?['selections']`),actions:sel.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  hc.add('Increment',{type:'IncrementVariable',inputs:{name:'Index',value:1}});
  ext.add('Headlines',{type:'Foreach',foreach:expr(`${e}?['headlines']`),actions:hc.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  ext.guard('Scope',`and(greaterOrEquals(variables('SelectionCount'),3),lessOrEquals(variables('SelectionCount'),5),equals(length(body('${all.Focus}')),length(union(variables('SeenFocus'),variables('SeenFocus')))),equals(length(body('${all.BehaviourTarget}')),length(union(variables('SeenTarget'),variables('SeenTarget')))),${exactText(`string(variables('SeenTarget'))`,`string(variables('CatalogueProvenance')?['selectedTargetKeys'])`)})`,'GovernedSelectionScopeMismatch');
  c.add('Extension',{type:'If',expression:expr(`contains(body('Parse_Draft')?['behaviours'],'governedExtension')`),actions:ext.actions,else:{actions:{Semantic_NoExtensionScope:{type:'If',expression:expr(`and(equals(length(body('${all.Headline}')),0),equals(length(body('${all.Focus}')),0),equals(length(body('${all.BehaviourTarget}')),0))`),actions:{},else:{actions:{Semantic_NoExtensionHold:{type:'SetVariable',inputs:{name:'HoldReason',value:'UnexpectedGovernedReferenceScope'},runAfter:{}}}},runAfter:{}}}}});
  const replace=v=>{if(typeof v==='string'){for(const k of Object.keys(referenceFields))v=v.replaceAll(`body('Semantic_Group_${k}')`,`variables('ReferenceGroups')?['${k}']`);return v;}if(Array.isArray(v))return v.map(replace);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,replace(x)]));return v;};
  return replace(c.actions);
}

function businessControl(c) {
  return Object.fromEntries(['WorkplanKey','PersonKey','PerformanceYear','DraftItemID','ManagerPersonKey','HierarchyEpoch','AclEpoch','State','TransitionStatus','ActiveCommand','CurrentSnapshotKey'].map(k=>[k,expr(`${c}?[${q(k)}]`)]));
}
function nativeCas(chain,kind,id,expected,bodyValue,tag) {
  chain.guard(`${tag}_ETag`,exactNativeEtag(expected),'NonExactETag');
  const a=httpRequest('content','POST',expr(itemUri(kind,id)),bodyValue,expr(expected));a.inputs.parameters['parameters/headers']['X-HTTP-Method']='MERGE';
  chain.add(`${tag}_CAS`,a);
  const read=chain.http(`${tag}_Readback`,'content','GET',expr(itemUri(kind,id)),undefined,undefined,['Succeeded','Failed','TimedOut']);
  chain.guard(`${tag}_NativeReadback`,`equals(outputs('${read}')?['statusCode'],200)`,'CASReadbackUncertain');return read;
}
function terminateHold(chain) {chain.add('TerminateHold',{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'RecoveryHold',message:"@variables('HoldReason')"}}});}

/** Full role readback and one native delta per shared processor iteration. */
function aclReader(prefix) {
  const c=new Chain(prefix);c.set('ActualAcl',[]);
  const lc=new Chain(prefix+'Target_'),loop=prefix+'Targets';
  const inherits=lc.http('Inheritance','acl','GET',expr(`concat(items('${loop}')?['uri'],'?$select=Id,HasUniqueRoleAssignments')`));
  const roles=lc.http('Roles','acl','GET',expr(`concat(items('${loop}')?['uri'],'/roleassignments?$select=PrincipalId,RoleDefinitionBindings/Id&$expand=RoleDefinitionBindings')`));
  lc.guard('Complete',`and(equals(outputs('${inherits}')?['statusCode'],200),equals(outputs('${roles}')?['statusCode'],200),not(contains(body('${roles}'),'@odata.nextLink')),not(contains(body('${roles}'),'odata.nextLink')))`,'AclIncomplete');
  lc.add('AppendInheritance',{type:'AppendToArrayVariable',inputs:{name:'ActualAcl',value:{target:expr(`items('${loop}')?['key']`),uri:expr(`items('${loop}')?['uri']`),inherited:expr(`not(body('${inherits}')?['HasUniqueRoleAssignments'])`),principal:0,role:0,signature:expr(`concat(items('${loop}')?['key'],'|inheritance')`)}}});
  const grants=prefix+'Target_Grants',bindings=prefix+'Bindings';
  lc.add('Grants',{type:'Foreach',foreach:expr(`body('${roles}')?['value']`),runtimeConfiguration:{concurrency:{repetitions:1}},actions:{[bindings]:{type:'Foreach',foreach:expr(`items('${grants}')?['RoleDefinitionBindings']`),runtimeConfiguration:{concurrency:{repetitions:1}},actions:{[prefix+'AppendGrant']:{type:'AppendToArrayVariable',inputs:{name:'ActualAcl',value:{target:expr(`items('${loop}')?['key']`),uri:expr(`items('${loop}')?['uri']`),inherited:false,principal:expr(`items('${grants}')?['PrincipalId']`),role:expr(`items('${bindings}')?['Id']`),signature:expr(`concat(items('${loop}')?['key'],'|',string(items('${grants}')?['PrincipalId']),'|',string(items('${bindings}')?['Id']))`)}},runAfter:{}}},runAfter:{}}}});
  c.add('Targets',{type:'Foreach',foreach:"@variables('AclTargets')",actions:lc.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  return c.actions;
}

function buildAclTargets() {
  const c=new Chain('Targets_');c.set('ExpectedAcl',[]);
  const items=[['Request',"variables('Origins')?['request']?['Id']"],['Draft',"variables('Origins')?['draft']?['Id']"],['Control',"variables('Control')?['Id']"],['Operation',"variables('Operation')?['Id']"],['Snapshot',"if(equals(length(body('Run_Snapshot_Metadata')?['value']),1),first(body('Run_Snapshot_Metadata')?['value'])?['Id'],0)"],['Receipt',"if(equals(length(body('Run_Receipt_Metadata')?['value']),1),first(body('Run_Receipt_Metadata')?['value'])?['Id'],0)"]];
  const candidates=items.map(([kind,id])=>({key:kind,nativeId:expr(`coalesce(${id},0)`),uri:expr(itemUri(kind,`coalesce(${id},0)`))}));
  for(const kind of ['Admission','Snapshot','Receipt','History'])candidates.push({key:kind+'Root',nativeId:1,uri:expr(`concat('/_api/web/lists(guid''',parameters('listIds')?[${q(kind)}],''')')`)});
  const all=c.add('Candidates',{type:'Compose',inputs:candidates});
  const valid=c.add('Valid',{type:'Query',inputs:{from:expr(`outputs('${all}')`),where:"@greater(item()?['nativeId'],0)"}});
  c.set('AclTargets',expr(body(valid)));
  const targetLoop='Targets_Expected',tc=new Chain('Targets_ExpectedItem_');
  const key=`items('${targetLoop}')?['key']`;
  const immutable=`or(endsWith(${key},'Root'),equals(${key},'Snapshot'),equals(${key},'Receipt'))`;
  const appendGrant=(tag,principal,role)=>tc.add(tag,{type:'AppendToArrayVariable',inputs:{name:'ExpectedAcl',value:{target:expr(key),principal:expr(principal),role:expr(role),signature:expr(`concat(${key},'|',string(${principal}),'|',string(${role}))`)}}});
  appendGrant('Content',"parameters('principalIds')?['content']",`if(${immutable},parameters('roleIds')?['AppendOnly'],if(equals(${key},'Request'),parameters('roleIds')?['Read'],parameters('roleIds')?['MutatorNoDelete']))`);
  appendGrant('Acl',"parameters('principalIds')?['acl']","parameters('roleIds')?['AclReconciler']");
  appendGrant('Recovery',"parameters('principalIds')?['recovery']","parameters('roleIds')?['FullControl']");
  const visibility=new Chain('Targets_Visibility_');
  visibility.add('Actor',{type:'AppendToArrayVariable',inputs:{name:'ExpectedAcl',value:{target:expr(key),principal:"@variables('Origins')?['actor']?['PrincipalID']",role:expr(`if(and(equals(${key},'Draft'),not(contains(createArray('ControlPointed','AclVerified','Completed'),variables('Checkpoint')))),parameters('roleIds')?['MutatorNoDelete'],parameters('roleIds')?['Read'])`),signature:expr(`concat(${key},'|',string(variables('Origins')?['actor']?['PrincipalID']),'|',string(if(and(equals(${key},'Draft'),not(contains(createArray('ControlPointed','AclVerified','Completed'),variables('Checkpoint')))),parameters('roleIds')?['MutatorNoDelete'],parameters('roleIds')?['Read'])))`)}}});
  const manager={type:'AppendToArrayVariable',inputs:{name:'ExpectedAcl',value:{target:expr(key),principal:"@variables('Origins')?['manager']?['PrincipalID']",role:"@parameters('roleIds')?['Read']",signature:expr(`concat(${key},'|',string(variables('Origins')?['manager']?['PrincipalID']),'|',string(parameters('roleIds')?['Read']))`)}}};
  visibility.add('Manager',{type:'If',expression:expr(`not(contains(createArray('Draft','Request','Receipt'),${key}))`),actions:{Targets_AddManagerGrant:{...manager,runAfter:{}}},else:{actions:{}}});
  tc.add('Visibility',{type:'If',expression:expr(`not(endsWith(${key},'Root'))`),actions:visibility.actions,else:{actions:{}}});
  c.add('Expected',{type:'Foreach',foreach:"@variables('AclTargets')",actions:tc.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  return c.actions;
}

function processorIteration(wireSchema,draftSchema,draftCanonical) {
  const c=new Chain('Run_');
  const authorityActions=loadOrigins('Current_',draftSchema,draftCanonical),canonicalDrafts=authorityActions.Current_CanonicalDrafts;
  delete authorityActions.Current_CanonicalDrafts;
  const canonicalPredecessor=Object.keys(canonicalDrafts.runAfter)[0];
  for(const action of Object.values(authorityActions))if(action.runAfter?.Current_CanonicalDrafts){action.runAfter={[canonicalPredecessor]:action.runAfter.Current_CanonicalDrafts};}
  c.add('Authority',{type:'Scope',actions:authorityActions});
  canonicalDrafts.runAfter={[c.previous]:['Succeeded']};c.actions.Current_CanonicalDrafts=canonicalDrafts;c.previous='Current_CanonicalDrafts';
  // The serial full current/original canonical validation shares the authority
  // failure latch. Skipped canonical validation means its authority read failed.
  c.add('AuthorityFailure',{type:'SetVariable',inputs:{name:'HoldReason',value:'NativeAuthorityReadOrTOCTOUGuardFailure'}},['Failed','TimedOut','Skipped']);
  c.actions[c.previous].runAfter.Run_Authority=['Succeeded','Failed','TimedOut','Skipped'];
  const initialFirst=new Chain('Initial_First_');
  initialFirst.set('AdmittedOrigins',"@variables('Origins')");initialFirst.set('InitialControl',"@variables('Control')");initialFirst.set('InitialReadDone',true);
  const initialSecond=new Chain('Initial_Second_');
  initialSecond.guard('CompleteStable',"and(equals(variables('Origins'),variables('AdmittedOrigins')),equals(variables('Control'),variables('InitialControl')))",'AuthorityDoubleReadMismatch');
  initialSecond.set('DoubleReadReady',true);
  c.add('InitialDoubleRead',{type:'If',expression:"@not(variables('DoubleReadReady'))",actions:{Run_FirstOrSecond:{type:'If',expression:"@variables('InitialReadDone')",actions:initialSecond.actions,else:{actions:initialFirst.actions},runAfter:{}}},else:{actions:{}}},['Succeeded','Skipped']);
  const semantics=new Chain('Initial_Semantics_');semantics.add('Validate',{type:'Scope',actions:semanticValidation()});semantics.set('SemanticsDone',true);
  c.add('SemanticAdmission',{type:'If',expression:"@not(variables('SemanticsDone'))",actions:semantics.actions,else:{actions:{}}});
  c.guard('DistinctPrincipals',"and(greater(parameters('principalIds')?['content'],0),greater(parameters('principalIds')?['acl'],0),greater(parameters('principalIds')?['recovery'],0),equals(length(union(createArray(parameters('principalIds')?['content'],parameters('principalIds')?['acl'],parameters('principalIds')?['recovery'],variables('Origins')?['actor']?['PrincipalID'],variables('Origins')?['manager']?['PrincipalID']),createArray(parameters('principalIds')?['content'],parameters('principalIds')?['acl'],parameters('principalIds')?['recovery'],variables('Origins')?['actor']?['PrincipalID'],variables('Origins')?['manager']?['PrincipalID']))),5))",'PrincipalRoleCollision');
  const opQuery=`concat('/_api/web/lists(guid''',parameters('listIds')?['Operation'],''')/items?$filter=CommandKey eq ''',uriComponent(replace(variables('CommandKey'),'''','''''')),'''&$top=2')`;
  const op=c.http('Operation','content','GET',expr(opQuery));
  c.guard('OperationCardinality',`and(lessOrEquals(length(body('${op}')?['value']),1),not(contains(body('${op}'),'@odata.nextLink')),not(contains(body('${op}'),'odata.nextLink')))`,'OperationCardinality');
  c.set('Operation',expr(`if(equals(length(body('${op}')?['value']),0),json('{}'),first(body('${op}')?['value']))`));
  c.set('Checkpoint',"@coalesce(variables('Operation')?['Checkpoint'],'Validated')");
  const operationEtag=exactNativeEtag("variables('Operation')?['@odata.etag']");
  c.add('LatchOperationOrigin',{type:'SetVariable',inputs:{name:'HoldReason',value:expr(`if(or(empty(variables('Operation')),${operationEtag}),variables('HoldReason'),'OperationNativeExactETagMissingOrMalformed')`)}});
  c.guard('OperationIdentity',"or(empty(variables('Operation')),and(equals(variables('Operation')?['CommandKey'],variables('CommandKey')),equals(variables('Operation')?['AdmissionName'],concat(variables('CommandUuid'),'-admission.json')),equals(variables('Operation')?['PersonKey'],body('Parse_Request')?['person']),equals(variables('Operation')?['PerformanceYear'],body('Parse_Request')?['year']),equals(variables('Operation')?['ClientCommand'],variables('CommandUuid')),equals(variables('Operation')?['WorkplanKey'],body('Parse_Request')?['workplan']),contains(createArray('Validated','ControlClaimed','SnapshotWritten','AuditWritten','ControlPointed','AclVerified','Completed'),variables('Checkpoint')),contains(createArray('Running','Completed','RecoveryHold'),variables('Operation')?['Outcome']),equals(variables('Operation')?['AuthorId'],parameters('principalIds')?['content'])))",'OperationCollisionOrMalformed');
  const originalDoc=readDoc(c,'Admission',"concat(variables('CommandUuid'),'-admission.json')",'Admission',true);
  const readAdmission=new Chain('Run_OriginalAdmission_');
  readAdmission.guard('Immutable',`or(empty(variables('Admission')),equals(json(${originalDoc.text}),variables('Admission')))`,'AdmissionImmutableReadback');
  readAdmission.set('Admission',expr(`json(${originalDoc.text})`));
  const closedDomain=admissionSchema(wireSchema,referenceSetSchema);
  readAdmission.add('DomainSchema',{type:'ParseJson',inputs:{content:{domain:"@variables('Admission')?['domain']",nativeProjection:domainAuthority("variables('Admission')?['origins']","variables('Admission')?['control']")},schema:nativeSchema(obj({domain:closedDomain,nativeProjection:closedDomain.properties.authority}))}});
  readAdmission.guard('FullOrigin',"and(equals(variables('Admission')?['key'],variables('CommandKey')),equals(variables('Admission')?['origins'],variables('Origins')),equals(variables('Admission')?['domain']?['key'],variables('CommandKey')),equals(variables('Admission')?['domain']?['authority'],body('Run_OriginalAdmission_DomainSchema')?['nativeProjection']),equals(variables('Admission')?['domain']?['eventAt'],variables('Admission')?['eventAt']),not(empty(formatDateTime(variables('Admission')?['eventAt'],'yyyy-MM-ddTHH:mm:ss.fffZ'))))",'AdmissionOriginCollision');
  c.add('ReadOriginalAdmission',{type:'If',expression:expr(`not(${originalDoc.absent})`),actions:readAdmission.actions,else:{actions:{}}});
  c.guard('AuthorityStable',`and(equals(variables('Origins'),variables('AdmittedOrigins')),or(not(${originalDoc.absent}),empty(variables('Admission'))),or(empty(variables('Operation')),not(${originalDoc.absent})))`,'AuthorityDriftOrAdmissionNotPersisted');
  const next=phases.slice(0,-1).reduceRight((tail,phase,i)=>`if(equals(variables('Checkpoint'),${q(phase)}),${q(phases[i+1])},${tail})`,"'Completed'");
  c.set('NextCheckpoint',expr(next));
  const currentJournal=readDoc(c,'History',"concat(variables('CommandUuid'),'-',variables('Checkpoint'),'-control.json')",'CurrentJournal',true);
  c.set('ControlReadback',expr(`if(equals(variables('Checkpoint'),'Validated'),variables('Admission')?['control'],if(${currentJournal.absent},json('{}'),json(${currentJournal.text})))`));
  const intentDoc=readDoc(c,'History',"concat(variables('CommandUuid'),'-',variables('Checkpoint'),'-intent.json')",'Intent',true);
  c.set('ControlIntent',expr(`if(${intentDoc.absent},json('{}'),json(${intentDoc.text}))`));
  const nextJournal=readDoc(c,'History',"concat(variables('CommandUuid'),'-',variables('NextCheckpoint'),'-control.json')",'NextJournal',true);
  c.set('NextJournal',expr(`if(${nextJournal.absent},json('{}'),json(${nextJournal.text}))`));
  const b=businessControl("variables('Admission')?['control']");
  const claimed={...b,TransitionStatus:'Submitting',ActiveCommand:"@variables('CommandKey')"};
  const pointed={...claimed,State:'Submitted',TransitionStatus:'AclPending',CurrentSnapshotKey:"@variables('CommandKey')"};
  const completed={...pointed,TransitionStatus:'Ready',AclEpoch:"@variables('Admission')?['control']?['HierarchyEpoch']",ActiveCommand:null};
  c.add('ExpectedPhase',{type:'Compose',inputs:{original:b,claimed,pointed,completed}});
  c.set('PlannedControl',"@if(equals(variables('Checkpoint'),'Validated'),outputs('Run_ExpectedPhase')?['claimed'],if(equals(variables('Checkpoint'),'AuditWritten'),outputs('Run_ExpectedPhase')?['pointed'],if(equals(variables('Checkpoint'),'AclVerified'),outputs('Run_ExpectedPhase')?['completed'],json('{}'))))");
  const ownPlan=Object.entries(b).map(([k])=>`equals(variables('Control')?[${q(k)}],variables('ControlIntent')?['after']?[${q(k)}])`).join(',');
  const phase=`if(equals(variables('Checkpoint'),'Validated'),outputs('Run_ExpectedPhase')?['original'],if(contains(createArray('ControlClaimed','SnapshotWritten','AuditWritten'),variables('Checkpoint')),outputs('Run_ExpectedPhase')?['claimed'],if(contains(createArray('ControlPointed','AclVerified'),variables('Checkpoint')),outputs('Run_ExpectedPhase')?['pointed'],outputs('Run_ExpectedPhase')?['completed'])))`;
  c.guard('JournalPhase',`or(empty(variables('Admission')),and(${Object.keys(b).map(k=>`equals(variables('ControlReadback')?[${q(k)}],${phase}?[${q(k)}])`).join(',')},equals(variables('ControlReadback')?['Id'],variables('Admission')?['control']?['Id']),equals(variables('ControlReadback')?['Created'],variables('Admission')?['control']?['Created']),equals(variables('ControlReadback')?['AuthorId'],variables('Admission')?['control']?['AuthorId']),not(empty(variables('ControlReadback')?['@odata.etag']))))`,'CheckpointControlJournalMismatch');
  c.guard('ExactPhaseControl',`or(empty(variables('Admission')),equals(variables('Control'),variables('ControlReadback')),and(not(empty(variables('ControlIntent'))),equals(variables('ControlIntent')?['key'],variables('CommandKey')),equals(variables('ControlIntent')?['checkpoint'],variables('Checkpoint')),equals(variables('ControlIntent')?['before'],variables('ControlReadback')),equals(variables('ControlIntent')?['after'],variables('PlannedControl')),not(equals(variables('Control')?['@odata.etag'],variables('ControlReadback')?['@odata.etag'])),equals(variables('Control')?['Id'],variables('ControlReadback')?['Id']),equals(variables('Control')?['AuthorId'],variables('ControlReadback')?['AuthorId']),equals(variables('Control')?['Created'],variables('ControlReadback')?['Created']),${ownPlan}))`,'PhaseControlOrForeignCASDrift');
  c.set('Snapshot',{key:"@variables('CommandKey')",admission:"@variables('Admission')?['domain']",body:"@variables('Admission')?['domain']?['authority']?['draft']?['body']",referencesBody:"@body('Parse_Request')?['referenceBody']"});
  c.set('Receipt',{key:"@variables('CommandKey')",admission:"@variables('Admission')?['domain']",snapshot:"@variables('Snapshot')"});
  const snapshot=readDoc(c,'Snapshot',"concat(variables('CommandUuid'),'-snapshot.json')",'Snapshot',true);
  const receipt=readDoc(c,'Receipt',"concat(variables('CommandUuid'),'-receipt.json')",'Receipt',true);
  const receiptMetadataB=c.http('Receipt_Metadata_B','content','GET',expr(`concat('/_api/web/lists(guid''',parameters('listIds')?['Receipt'],''')/items?$filter=FileLeafRef eq ''',concat(variables('CommandUuid'),'-receipt.json'),'''&$top=2')`));
  const receiptNative=`first(body('${receipt.meta}')?['value'])`;
  const receiptCoordinates=`and(equals(body('${receipt.meta}'),body('${receiptMetadataB}')),greater(${receiptNative}?['Id'],0),equals(${receiptNative}?['AuthorId'],parameters('principalIds')?['content']),not(empty(${receiptNative}?['OData__UIVersionString'])),not(empty(${receiptNative}?['@odata.etag'])),not(equals(${receiptNative}?['@odata.etag'],'*')),not(equals(${receiptNative}?['@odata.etag'],'"*"')),greaterOrEquals(sub(ticks(${receiptNative}?['Created']),ticks(variables('Admission')?['domain']?['eventAt'])),-3000000000),lessOrEquals(sub(ticks(${receiptNative}?['Created']),ticks(variables('Admission')?['domain']?['eventAt'])),3000000000))`;
  c.add('ReceiptProjection',{type:'ParseJson',inputs:{content:expr(`if(${receipt.absent},json('{}'),addProperty(addProperty(json('{}'),'domain',addProperty(json(${receipt.text}),'nativeCreated',${receiptNative}?['Created'])),'native',${receiptNative}))`),schema:nativeSchema(receiptProjectionSchema(wireSchema,referenceSetSchema))}});
  c.guard('ImmutableEffects',`and(${c.documentPredicates.join(',')},if(${snapshot.absent},true,equals(json(${snapshot.text}),variables('Snapshot'))),if(${receipt.absent},true,and(equals(json(${receipt.text}),variables('Receipt')),${receiptCoordinates})))`,'CompleteDocumentReadbackOrImmutableCollision');
  // Schema/origin/complete readback rejection is persistent, separate from the
  // later effect-response recovery path. Preserve any earlier authority HOLD.
  c.add('LatchReceiptOrigin',{type:'SetVariable',inputs:{name:'HoldReason',value:"@if(empty(variables('HoldReason')),'ReceiptNativeOriginSchemaOrCompleteReadbackFailure',variables('HoldReason'))"}},['Failed','TimedOut','Skipped']);
  c.add('AclTargets',{type:'Scope',actions:buildAclTargets()},['Succeeded','Skipped']);
  c.add('AclReadback',{type:'Scope',actions:aclReader('Acl_')});
  const inherited=c.add('Inherited',{type:'Query',inputs:{from:"@variables('ActualAcl')",where:"@equals(item()?['inherited'],true)"}});
  // Compare stable native principal/role signatures, never arbitrary evidence labels.
  const expectSig=c.add('ExpectedSignatures',{type:'Select',inputs:{from:"@variables('ExpectedAcl')",select:"@item()?['signature']"}});
  const actualSig=c.add('ActualSignatures',{type:'Select',inputs:{from:"@variables('ActualAcl')",select:"@item()?['signature']"}});
  const extrasExact=c.add('ExtraExact',{type:'Query',inputs:{from:"@variables('ActualAcl')",where:expr(`and(greater(item()?['principal'],0),not(contains(body('${expectSig}'),item()?['signature'])))`)}});
  const missing=c.add('MissingRoles',{type:'Query',inputs:{from:"@variables('ExpectedAcl')",where:expr(`not(contains(body('${actualSig}'),item()?['signature']))`)}});
  c.guard('AclUniqueComplete',`equals(length(union(body('${actualSig}'),body('${actualSig}'))),length(body('${actualSig}')))`,'DuplicateNativeAclRows');
  const exactAcl=`and(equals(length(body('${inherited}')),0),equals(length(body('${extrasExact}')),0),equals(length(body('${missing}')),0))`;
  const blocking=c.add('BlockingAcl',{type:'Query',inputs:{from:expr(`union(body('${inherited}'),body('${extrasExact}'),body('${missing}'))`),where:"@or(endsWith(item()?['target'],'Root'),and(not(equals(variables('Checkpoint'),'ControlPointed')),not(contains(createArray('Operation','Snapshot','Receipt'),item()?['target']))))"}});
  c.guard('AclBeforeEffects',`equals(length(body('${blocking}')),0)`,'PreEffectAclMismatch');
  const desiredCurrent=Object.keys(b).map(k=>`equals(variables('Control')?[${q(k)}],variables('PlannedControl')?[${q(k)}])`).join(',');
  const controlPhase="contains(createArray('Validated','AuditWritten','AclVerified'),variables('Checkpoint'))";
  const planner=`if(not(variables('DoubleReadReady')),'WaitDoubleRead',if(empty(variables('Admission')),'CreateAdmission',if(empty(variables('Operation')),'CreateOperation',if(equals(variables('Checkpoint'),'Completed'),if(equals(variables('Operation')?['Outcome'],'Completed'),'Complete','AdvanceOperation'),if(${controlPhase},if(empty(variables('ControlIntent')),'WriteIntent',if(not(and(${desiredCurrent})),'CASControl',if(empty(variables('NextJournal')),'WriteJournal','AdvanceOperation'))),if(equals(variables('Checkpoint'),'ControlClaimed'),if(${snapshot.absent},'CreateSnapshot',if(empty(variables('NextJournal')),'WriteJournal','AdvanceOperation')),if(equals(variables('Checkpoint'),'SnapshotWritten'),if(${receipt.absent},'CreateReceipt',if(empty(variables('NextJournal')),'WriteJournal','AdvanceOperation')),if(equals(variables('Checkpoint'),'ControlPointed'),if(not(${exactAcl}),'AclDelta',if(empty(variables('NextJournal')),'WriteJournal','AdvanceOperation')),'Invalid'))))))))`;
  c.set('NextEffect',expr(`if(not(${exactAcl}),'AclDelta',${planner})`));
  const attempt="concat(variables('Checkpoint'),'|',variables('NextEffect'),if(equals(variables('NextEffect'),'AclDelta'),concat('|',base64(string(variables('ActualAcl')))),''))";
  c.guard('NoRepeatedUncertainEffect',`not(contains(variables('AttemptedEffects'),${attempt}))`,'UncertainEffectHeldAfterExactReadback');
  const valid=new Chain('Run_Valid_');
  valid.add('RecordAttempt',{type:'AppendToArrayVariable',inputs:{name:'AttemptedEffects',value:expr(attempt)}});
  const effectCases={};
  const addCase=(name,chain)=>effectCases['Effect_'+name]={case:name,actions:chain.actions};
  const wait=new Chain('Effect_Wait_');addCase('WaitDoubleRead',wait);
  const admission=new Chain('Effect_CreateAdmission_');
  admission.guard('InitialState',"and(or(equals(variables('Control')?['State'],'Draft'),equals(variables('Control')?['State'],'ChangesRequested')),equals(variables('Control')?['TransitionStatus'],'Ready'),empty(variables('Control')?['ActiveCommand']),empty(variables('Control')?['CurrentSnapshotKey']))",'StateNotSubmittable');
  admission.add('EventAt',{type:'Compose',inputs:"@formatDateTime(utcNow(),'yyyy-MM-ddTHH:mm:ss.fffZ')"});
  admission.set('Admission',{key:"@variables('CommandKey')",origins:"@variables('AdmittedOrigins')",control:"@variables('Control')",eventAt:"@outputs('Effect_CreateAdmission_EventAt')",domain:{key:"@variables('CommandKey')",authority:domainAuthority("variables('AdmittedOrigins')","variables('Control')"),eventAt:"@outputs('Effect_CreateAdmission_EventAt')"}});
  writeDoc(admission,'Admission',"concat(variables('CommandUuid'),'-admission.json')","string(variables('Admission'))",'Admission');addCase('CreateAdmission',admission);
  const createOp=new Chain('Effect_CreateOperation_');
  const opPost=createOp.http('Write','content','POST',expr(`concat('/_api/web/lists(guid''',parameters('listIds')?['Operation'],''')/items')`),{CommandKey:"@variables('CommandKey')",PersonKey:"@body('Parse_Request')?['person']",PerformanceYear:"@body('Parse_Request')?['year']",ClientCommand:"@variables('CommandUuid')",WorkplanKey:"@body('Parse_Request')?['workplan']",AdmissionName:"@concat(variables('CommandUuid'),'-admission.json')",Checkpoint:'Validated',Outcome:'Running'});
  const opRead=createOp.http('Readback','content','GET',expr(opQuery),undefined,undefined,['Succeeded','Failed','TimedOut']);
  createOp.guard('Readback',`and(equals(length(body('${opRead}')?['value']),1),equals(first(body('${opRead}')?['value'])?['CommandKey'],variables('CommandKey')),equals(first(body('${opRead}')?['value'])?['AdmissionName'],concat(variables('CommandUuid'),'-admission.json')),equals(first(body('${opRead}')?['value'])?['Checkpoint'],'Validated'))`,'UniqueOperationUncertainOrCollision');addCase('CreateOperation',createOp);
  const intent=new Chain('Effect_WriteIntent_');
  writeDoc(intent,'History',"concat(variables('CommandUuid'),'-',variables('Checkpoint'),'-intent.json')","string(addProperty(addProperty(addProperty(addProperty(json('{}'),'key',variables('CommandKey')),'checkpoint',variables('Checkpoint')),'before',variables('ControlReadback')),'after',variables('PlannedControl')))",'Intent');addCase('WriteIntent',intent);
  const cas=new Chain('Effect_CASControl_');
  cas.guard('ExactBefore',"equals(variables('Control'),variables('ControlIntent')?['before'])",'CASBeforeDrift');
  const cv=new Chain('Effect_CASControlValid_');
  const cr=nativeCas(cv,'Control',"variables('Control')?['Id']","variables('Control')?['@odata.etag']","@variables('PlannedControl')",'Control');
  cv.guard('PlannedReadback',`and(not(equals(body('${cr}')?['@odata.etag'],variables('Control')?['@odata.etag'])),${Object.keys(b).map(k=>`equals(body('${cr}')?[${q(k)}],variables('PlannedControl')?[${q(k)}])`).join(',')})`,'OwnCASUncertainOrConflict');
  cas.add('IfValid',{type:'If',expression:"@empty(variables('HoldReason'))",actions:cv.actions,else:{actions:{}}});addCase('CASControl',cas);
  const journal=new Chain('Effect_WriteJournal_');writeDoc(journal,'History',"concat(variables('CommandUuid'),'-',variables('NextCheckpoint'),'-control.json')","string(variables('Control'))",'ControlReadback');addCase('WriteJournal',journal);
  const advance=new Chain('Effect_AdvanceOperation_');advance.guard('Journal',"equals(variables('NextJournal'),variables('Control'))",'CheckpointJournalDrift');
  const advValid=new Chain('Effect_AdvanceValid_');
  const ar=nativeCas(advValid,'Operation',"variables('Operation')?['Id']","variables('Operation')?['@odata.etag']",{Checkpoint:"@variables('NextCheckpoint')",Outcome:"@if(equals(variables('NextCheckpoint'),'Completed'),'Completed','Running')",HoldReason:null},'Checkpoint');
  advValid.guard('Readback',`and(equals(body('${ar}')?['Checkpoint'],variables('NextCheckpoint')),equals(body('${ar}')?['Outcome'],if(equals(variables('NextCheckpoint'),'Completed'),'Completed','Running')),equals(body('${ar}')?['CommandKey'],variables('CommandKey')),equals(body('${ar}')?['AdmissionName'],variables('Operation')?['AdmissionName']))`,'CheckpointCASUncertain');
  advance.add('IfValid',{type:'If',expression:"@empty(variables('HoldReason'))",actions:advValid.actions,else:{actions:{}}});addCase('AdvanceOperation',advance);
  const snap=new Chain('Effect_CreateSnapshot_');writeDoc(snap,'Snapshot',"concat(variables('CommandUuid'),'-snapshot.json')","string(variables('Snapshot'))",'Snapshot');addCase('CreateSnapshot',snap);
  const rec=new Chain('Effect_CreateReceipt_');writeDoc(rec,'Receipt',"concat(variables('CommandUuid'),'-receipt.json')","string(variables('Receipt'))",'Receipt');addCase('CreateReceipt',rec);
  const acl=new Chain('Effect_AclDelta_');
  const roots=acl.add('ImmutableRoots',{type:'Query',inputs:{from:expr(body(inherited)),where:"@endsWith(item()?['target'],'Root')"}});
  acl.guard('NoRootMutation',`equals(length(body('${roots}')),0)`,'PrivateRootAclRequiresSeparateAdmission');
  const aclValid=new Chain('Effect_AclDeltaValid_');
  const chooseUri=aclValid.add('Choose',{type:'Compose',inputs:expr(`if(greater(length(body('${inherited}')),0),first(body('${inherited}')),if(greater(length(body('${extrasExact}')),0),first(body('${extrasExact}')),first(body('${missing}'))))`)});
  const target=aclValid.add('Target',{type:'Query',inputs:{from:"@variables('AclTargets')",where:expr(`equals(item()?['key'],outputs('${chooseUri}')?['target'])`)}});
  const mutationUri=`concat(first(body('${target}'))?['uri'],if(greater(length(body('${inherited}')),0),'/breakroleinheritance(copyRoleAssignments=false,clearSubscopes=false)',if(greater(length(body('${extrasExact}')),0),concat('/roleassignments/removeroleassignment(principalid=',string(outputs('${chooseUri}')?['principal']),',roledefid=',string(outputs('${chooseUri}')?['role']),')'),concat('/roleassignments/addroleassignment(principalid=',string(outputs('${chooseUri}')?['principal']),',roledefid=',string(outputs('${chooseUri}')?['role']),')'))))`;
  const mutate=aclValid.http('Mutation','acl','POST',expr(mutationUri));
  aclValid.add('ReadbackRequired',{type:'Compose',inputs:expr(`outputs('${mutate}')?['statusCode']`)},['Succeeded','Failed','TimedOut']);
  // Next iteration re-reads the entire ACL before a further effect. No local success
  // response is an ACL proof. Clear the attempt only after that exact readback.
  acl.add('IfValid',{type:'If',expression:"@empty(variables('HoldReason'))",actions:aclValid.actions,else:{actions:{}}});addCase('AclDelta',acl);
  const complete=new Chain('Effect_Complete_');
  complete.guard('ImmutableCompletion',`and(${operationEtag},not(${snapshot.absent}),not(${receipt.absent}),equals(json(${snapshot.text}),variables('Snapshot')),equals(json(${receipt.text}),variables('Receipt')),${receiptCoordinates},${exactAcl},equals(variables('Control')?['State'],'Submitted'),equals(variables('Control')?['TransitionStatus'],'Ready'),equals(variables('Control')?['CurrentSnapshotKey'],variables('CommandKey')),empty(variables('Control')?['ActiveCommand']),equals(variables('Control')?['AclEpoch'],variables('Admission')?['control']?['HierarchyEpoch']),equals(variables('Operation')?['Outcome'],'Completed'))`,'CompletionReadbackDrift');
  complete.add('Finish',{type:'SetVariable',inputs:{name:'Finished',value:true}});addCase('Complete',complete);
  valid.add('Effect',{type:'Switch',expression:"@variables('NextEffect')",cases:effectCases,default:{actions:{Effect_Unsupported:{type:'SetVariable',inputs:{name:'HoldReason',value:'UnsupportedEffectState'},runAfter:{}}}}});
  valid.add('CapacityFailure',{type:'SetVariable',inputs:{name:'HoldReason',value:expr(`if(or(${['Admission','Snapshot','Receipt','Control'].map(name=>`greater(${byteLength(`string(variables('${name}'))`)},1048576)`).join(',')}),'WholeDocumentCapacityHold',variables('HoldReason'))`)}},['Succeeded','Failed','TimedOut']);
  c.add('OnlyValid',{type:'If',expression:"@empty(variables('HoldReason'))",actions:valid.actions,else:{actions:{}}});
  return c.actions;
}

export function hostMachine(wireSchema,draftSchema,draftCanonical) {
  const c=new Chain('Host_');
  c.add('ParseReferences',{type:'ParseJson',inputs:{content:"@body('Parse_Request')?['referenceBody']",schema:nativeSchema(referenceSetSchema)}});
  // Alias has a fixed name so producer references remain closed across reused scopes.
  c.actions.Parse_References=c.actions[c.previous];delete c.actions[c.previous];c.previous='Parse_References';
  const refs=compileCanonical(referenceSetSchema,"body('Parse_References')",'ReferenceWire');
  c.add('ReferenceWire',{type:'Scope',actions:refs.actions});
  c.guard('ReferenceWireExact',exactText(refs.value,"body('Parse_Request')?['referenceBody']"),'ReferenceWireMismatch');
  c.set('CommandKey',"@concat(body('Parse_Request')?['person'],'|',string(body('Parse_Request')?['year']),'|',body('Parse_Request')?['command'])");
  c.set('CommandUuid',"@body('Parse_Request')?['command']");
  c.guard('NativeKeyBound',"lessOrEquals(length(variables('CommandKey')),255)",'NativeUniqueKeyCapacityHold');
  const connections=new Chain('Connection_');
  for(const role of ['content','acl']) {
    const n=connections.http(role,'content'===role?'content':'acl','GET','/_api/web/currentuser?$select=Id');
    connections.guard(role+'_Identity',`equals(body('${n}')?['Id'],parameters('principalIds')?[${q(role)}])`,'ProtectedConnectionIdentityMismatch');
  }
  c.add('Connections',{type:'Scope',actions:connections.actions});
  const roleLoop='Host_RoleDefinitions',roleChecks=new Chain('NativeRole_');
  const role=roleChecks.http('Read','content','GET',expr(`concat('/_api/web/roledefinitions/getbyid(',string(items('${roleLoop}')?['id']),')?$select=Id,BasePermissions')`));
  roleChecks.guard('ExactMask',`and(equals(body('${role}')?['Id'],items('${roleLoop}')?['id']),equals(string(body('${role}')?['BasePermissions']?['High']),items('${roleLoop}')?['high']),equals(string(body('${role}')?['BasePermissions']?['Low']),items('${roleLoop}')?['low']))`,'NativeLeastPrivilegeRoleMaskMismatch');
  const roleMasks={Read:['0','33'],AppendOnly:['0','35'],MutatorNoDelete:['0','39'],AclReconciler:['0','33554465'],FullControl:['2147483647','4294967295']};
  c.add('RoleDefinitions',{type:'Foreach',foreach:Object.entries(roleMasks).map(([key,[high,low]])=>({id:expr(`parameters('roleIds')?[${q(key)}]`),high,low})),actions:roleChecks.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  const schemaLoop='Host_StorageSchemas',sc=new Chain('Schema_');
  const nativeField=sc.http('CommandKey','content','GET',expr(`concat('/_api/web/lists(guid''',items('${schemaLoop}')?['id'],''')/fields/getbyinternalnameortitle(''CommandKey'')?$select=InternalName,EnforceUniqueValues,Indexed,MaxLength')`));
  sc.guard('UniqueNative',`and(equals(body('${nativeField}')?['InternalName'],'CommandKey'),equals(body('${nativeField}')?['EnforceUniqueValues'],true),equals(body('${nativeField}')?['Indexed'],true),equals(body('${nativeField}')?['MaxLength'],255))`,'NativeUniqueStorageNotAdmitted');
  c.add('StorageSchemas',{type:'Foreach',foreach:"@createArray(addProperty(json('{}'),'id',parameters('listIds')?['Operation']))",actions:sc.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
  c.add('Processor',{type:'Until',expression:"@or(variables('Finished'),not(empty(variables('HoldReason'))))",limit:{count:100,timeout:'PT30M'},actions:processorIteration(wireSchema,draftSchema,draftCanonical)});
  c.add('CaptureFailure',{type:'If',expression:"@and(not(variables('Finished')),empty(variables('HoldReason')))",actions:{Host_SetNativeFailure:{type:'SetVariable',inputs:{name:'HoldReason',value:'NativeGuardOrEffectFailure'},runAfter:{}}},else:{actions:{}}},['Succeeded','Failed','TimedOut']);
  const hold=new Chain('Host_Hold_');
  const holdRead=hold.http('ReadOperation','content','GET',expr(`concat('/_api/web/lists(guid''',parameters('listIds')?['Operation'],''')/items?$filter=CommandKey eq ''',uriComponent(replace(variables('CommandKey'),'''','''''')),'''&$top=2')`));
  const h=new Chain('Host_HoldPersist_');
  const held=nativeCas(h,'Operation',`first(body('${holdRead}')?['value'])?['Id']`,`first(body('${holdRead}')?['value'])?['@odata.etag']`,{Outcome:'RecoveryHold',HoldReason:"@variables('HoldReason')"},'Operation');
  h.guard('Readback',`and(equals(body('${held}')?['Outcome'],'RecoveryHold'),equals(body('${held}')?['HoldReason'],variables('HoldReason')))`,'HoldReadbackUncertain');
  hold.add('IfOperation',{type:'If',expression:expr(`equals(length(body('${holdRead}')?['value']),1)`),actions:h.actions,else:{actions:{}}});terminateHold(hold);
  c.add('Outcome',{type:'If',expression:"@empty(variables('HoldReason'))",actions:{Host_Completed:{type:'Terminate',inputs:{runStatus:'Succeeded'},runAfter:{}}},else:{actions:hold.actions}});
  return {actions:c.actions,variables:refs.variables};
}
