/** Ordinary stable synthetic list-row origins only. No network or native proof. */
import {createHash} from 'node:crypto';
import {NativeMemory,canonical} from './native-memory.mjs';
import {a009Native} from './A009-native-memory.mjs';
import {privateDraftSourceBinding} from '../Tools/PrivateDraftListOriginV4.mjs';
export async function privateDraftListMemory({target=false,historical=false,laterEditableDraft=false}={}){
  const n=target||historical?await a009Native({core:target,catalogue:historical,successor:false}):new NativeMemory();
  const tenantId='094ae5f7-ea13-44c9-a9b1-6863e144bf53',siteId='9ab38c6d-b9f7-4c6e-a3c4-39b10fe18818',webId='a43afb76-f56b-4016-a860-8b8039ace574';
  Object.assign(n.parameters.binding,{tenantId,siteId,webId});
  // Independent stable fixture's actual original native coordinates. The saved
  // original body/version/author/date remain intact when later current edits exist.
  if(historical){n.capture.draftOriginalReadback.native.siteId=siteId;n.capture.draftOriginalReadback.native.webId=webId;n.capture.catalogueNativeOrigin.siteId=siteId;n.capture.catalogueNativeOrigin.webId=webId;n.capture.originalCataloguePublisherReadback.native.siteId=siteId;n.capture.originalCataloguePublisherReadback.native.webId=webId;const publisher=JSON.parse(n.files.get('/test/upstream/publisher.json'));publisher.native.siteId=siteId;publisher.native.webId=webId;n.files.set('/test/upstream/publisher.json',JSON.stringify(publisher));n.files.set('/test/upstream/capture.json',JSON.stringify(n.capture));}
  const row=n.lists.get(n.listIds.Draft)[0];delete row.FileRef;delete row.File;delete row.SchemaVersion;n.files.delete(n.paths.Draft+'/draft.json');delete n.parameters.rootPaths.Draft;
  if(laterEditableDraft){n.draft.behaviours.entries[0].commitment='Later ordinary editable commitment';row.OData__UIVersionString='2.0';row['@odata.etag']='"2"';n.request.source.version='2.0';n.request.source.etag='"2"';}
  const body=canonical(n.draft),hash=createHash('sha256').update(body,'utf8').digest('hex').toUpperCase();
  Object.assign(row,{DraftPayloadJSON:body,DraftPayloadSHA256:hash,ClientSaveID:'ad92b216-0ee3-4c5d-a610-7f1edb7bd166',ClientSavedAt:n.clock||'2026-10-02T02:00:00.000Z',ExtraRetainedNativeField:'ordinary complete raw row'});
  n.request.source.body=body;n.files.set(n.paths.Request+'/request.json',canonical(n.request));
  n.parameters.binding.privateDraftSource={...structuredClone(privateDraftSourceBinding),state:'SYNTHETIC_FIXTURE_ONLY',admitted:true,tenantId,siteId,webId,siteUrl:n.parameters.siteUrl,listId:n.listIds.Draft,nativeRowSchemaAndRightsAdmission:true,nativeVersionAuthorReadbackAdmission:true,genuineHashReadback:{admitted:true,itemId:row.Id,etag:row['@odata.etag'],version:row.OData__UIVersionString,sha256:hash}};
  n.parameters.binding.historicalSelection&&(n.parameters.binding.historicalSelection.originalDraftReadbackAdmission=true);
  n.draftListCalls=[];const native=n.http.bind(n);n.http=async(p,name,e)=>{if(name==='Current_Draft'||name==='Current_DraftReadback')n.draftListCalls.push({name,method:p['parameters/method'],uri:p['parameters/uri']});return native(p,name,e);};
  return n;
}
