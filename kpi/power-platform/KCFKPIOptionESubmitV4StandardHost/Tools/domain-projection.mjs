/** Additive native journal projection into the unchanged protected v4 domain.
 * Raw native records remain separate in the host journal, never extra domain keys.
 * This is a build-time WDL emitter, not a production JS adapter.
 */
const text={type:'string',minLength:1};
const coordinate={type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const etag={...text,pattern:'^"[^"\\r\\n]+"$',not:{enum:['"*"']}};
const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const person=object({key:text,principal:coordinate,active:{type:'boolean',enum:[true]},version:text,manager:text},['key','principal','active','version']);
const control=object({workplan:text,person:text,year:{type:'integer',minimum:2000,maximum:9999},draftId:coordinate,manager:text,hierarchyEpoch:coordinate,aclEpoch:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER},etag,state:{type:'string',enum:['Draft','ChangesRequested','Submitted']},transition:{type:'string',enum:['Ready','Submitting','AclPending']},command:text,snapshot:text},['workplan','person','year','draftId','manager','hierarchyEpoch','aclEpoch','etag','state','transition']);
export function admissionSchema(wire,referenceSet){
  return object({key:text,authority:object({request:object({itemId:coordinate,etag,version:text,createdBy:coordinate,body:text,query:wire}),draft:wire.properties.source,references:referenceSet,actor:person,manager:person,control}),eventAt:{type:'string',format:'date-time'}});
}
export function receiptProjectionSchema(wire,referenceSet){
  const admission=admissionSchema(wire,referenceSet),snapshot=object({key:text,admission,body:text,referencesBody:text});
  return {anyOf:[object({}),object({domain:object({key:text,admission,snapshot,nativeCreated:{type:'string',format:'date-time'}}),native:{type:'object',required:['Id','Created','AuthorId','OData__UIVersionString','@odata.etag'],properties:{Id:coordinate,Created:{type:'string',format:'date-time'},AuthorId:coordinate,OData__UIVersionString:text,'@odata.etag':etag}}})]};
}
const record=fields=>Object.entries(fields).reduce((tail,[key,value])=>`addProperty(${tail},'${key}',${value})`,"json('{}')");
const read=(base,key)=>`${base}?['${key}']`;
export function domainAuthority(origins,rawControl){
  const r=read(origins,'request'),d=read(origins,'draft'),a=read(origins,'actor'),m=read(origins,'manager');
  const personProjection=p=>{
    const base=record({key:read(p,'PersonKey'),principal:read(p,'PrincipalID'),active:read(p,'Active'),version:read(p,'OData__UIVersionString')});
    return `if(empty(${read(p,'ManagerPersonKey')}),${base},addProperty(${base},'manager',${read(p,'ManagerPersonKey')}))`;
  };
  let c=record(Object.fromEntries(Object.entries({workplan:'WorkplanKey',person:'PersonKey',year:'PerformanceYear',draftId:'DraftItemID',manager:'ManagerPersonKey',hierarchyEpoch:'HierarchyEpoch',aclEpoch:'AclEpoch',etag:'@odata.etag',state:'State',transition:'TransitionStatus'}).map(([key,native])=>[key,read(rawControl,native)])));
  for(const [key,native]of [['command','ActiveCommand'],['snapshot','CurrentSnapshotKey']])c=`if(empty(${read(rawControl,native)}),${c},addProperty(${c},'${key}',${read(rawControl,native)}))`;
  return {
    request:{itemId:'@'+read(r,'Id'),etag:'@'+read(r,'@odata.etag'),version:'@'+read(r,'OData__UIVersionString'),createdBy:'@'+read(r,'AuthorId'),body:'@'+read(origins,'requestBody'),query:`@json(${read(origins,'requestBody')})`},
    draft:{itemId:'@'+read(d,'Id'),etag:'@'+read(d,'@odata.etag'),version:'@'+read(d,'OData__UIVersionString'),schema:`@json(${read(origins,'draftBody')})?['schemaVersion']`,body:'@'+read(origins,'draftBody')},
    references:`@json(json(${read(origins,'requestBody')})?['referenceBody'])`,actor:'@'+personProjection(a),manager:'@'+personProjection(m),control:'@'+c
  };
}
