/** Existing private Save list-row reader. WDL emission only; never a file adapter.
 * Native route/schema/rights/version and genuine exact SHA readback admissions
 * must be supplied independently. This reader never manufactures a digest.
 */
import {exactText,byteLength} from './canonical-wdl.mjs';
export const PRIVATE_DRAFT_LIST_ORIGIN_CONTRACT='kcf.option-e.private-draft-list-origin/v4';
export const privateDraftSourceBinding={
  contract:PRIVATE_DRAFT_LIST_ORIGIN_CONTRACT,state:'UNBOUND',admitted:false,
  existingListTitle:'KCFKPI_WorkplanDrafts',tenantId:null,siteId:null,webId:null,siteUrl:null,listId:null,
  nativeRowSchemaAndRightsAdmission:false,nativeVersionAuthorReadbackAdmission:false,
  genuineHashReadback:{admitted:false,itemId:null,etag:null,version:null,sha256:null},
  historicalSource:'Original saved version/date/creator/readback remains separately admitted; no current metadata backfill'
};
const text={type:'string',minLength:1},coordinate={type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER};
const guid={...text,pattern:'^[A-Fa-f0-9]{8}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{4}-[A-Fa-f0-9]{12}$'};
export const privateDraftNativeRowSchema={type:'object',required:['Id','AuthorId','Created','Modified','OData__UIVersionString','@odata.etag','DraftPayloadJSON','DraftPayloadSHA256'],properties:{Id:coordinate,AuthorId:coordinate,Created:{...text,format:'date-time'},Modified:{...text,format:'date-time'},OData__UIVersionString:text,'@odata.etag':{...text,pattern:'^"[^"\\r\\n]+"$',not:{enum:['"*"']}},DraftPayloadJSON:text,DraftPayloadSHA256:{...text,pattern:'^[A-Fa-f0-9]{64}$'}}};
export const privateDraftPhysicalOriginSchema={type:'object',required:['contract','sourceKind','tenantId','siteId','webId','listId','itemId','version','etag','authorId','createdAt','modifiedAt','payloadSha256'],properties:{contract:{type:'string',enum:[PRIVATE_DRAFT_LIST_ORIGIN_CONTRACT]},sourceKind:{type:'string',enum:['EXISTING_LIST_ROW']},tenantId:guid,siteId:guid,webId:guid,listId:guid,itemId:coordinate,version:text,etag:privateDraftNativeRowSchema.properties['@odata.etag'],authorId:coordinate,createdAt:{...text,format:'date-time'},modifiedAt:{...text,format:'date-time'},payloadSha256:privateDraftNativeRowSchema.properties.DraftPayloadSHA256}};
export function emitPrivateDraftListOrigin(chain){
  const ex=s=>'@'+s,route="parameters('binding')?['privateDraftSource']";
  const uri="concat('/_api/web/lists(guid''',parameters('listIds')?['Draft'],''')/items(',string(body('Parse_Request')?['source']?['itemId']),')')";
  const read=chain.http('Draft','content','GET',ex(uri)),native=`body('${read}')`,payload=`${native}?['DraftPayloadJSON']`;
  const physicalOrigin={contract:PRIVATE_DRAFT_LIST_ORIGIN_CONTRACT,sourceKind:'EXISTING_LIST_ROW',...Object.fromEntries(['tenantId','siteId','webId','listId'].map(k=>[k,ex(`${route}?['${k}']`)])),itemId:ex(`${native}?['Id']`),version:ex(`${native}?['OData__UIVersionString']`),etag:ex(`${native}?['@odata.etag']`),authorId:ex(`${native}?['AuthorId']`),createdAt:ex(`${native}?['Created']`),modifiedAt:ex(`${native}?['Modified']`),payloadSha256:ex(`${native}?['DraftPayloadSHA256']`)};
  // Read B after the protected People/Workplan/Control/reference joins; retain
  // both whole native rows. All native/schema failures share the authority latch.
  function readback(){
    const after=chain.http('DraftReadback','content','GET',ex(uri)),hash=`${route}?['genuineHashReadback']`;
    chain.guard('DraftListOrigin',`and(equals(outputs('${read}')?['statusCode'],200),equals(outputs('${after}')?['statusCode'],200),${exactText(`string(${native})`,`string(body('${after}'))`)},equals(${route}?['contract'],'${PRIVATE_DRAFT_LIST_ORIGIN_CONTRACT}'),equals(${route}?['admitted'],true),equals(${route}?['nativeRowSchemaAndRightsAdmission'],true),equals(${route}?['nativeVersionAuthorReadbackAdmission'],true),equals(${route}?['existingListTitle'],'KCFKPI_WorkplanDrafts'),${exactText(`${route}?['siteUrl']`,"parameters('siteUrl')")},equals(${route}?['siteId'],parameters('binding')?['siteId']),equals(${route}?['webId'],parameters('binding')?['webId']),equals(${route}?['tenantId'],parameters('binding')?['tenantId']),equals(${route}?['listId'],parameters('listIds')?['Draft']),equals(${hash}?['admitted'],true),equals(${hash}?['itemId'],${native}?['Id']),equals(${hash}?['etag'],${native}?['@odata.etag']),equals(${hash}?['version'],${native}?['OData__UIVersionString']),${exactText(`toLower(${hash}?['sha256'])`,`toLower(${native}?['DraftPayloadSHA256'])`)},lessOrEquals(${byteLength(payload)},56000),lessOrEquals(${byteLength(`string(${native})`)},1048576))`,'ExistingPrivateDraftListOriginOrGenuineHashReadbackNotAdmitted');
    return after;
  }
  return{read,native,payload,physicalOrigin,readback};
}
