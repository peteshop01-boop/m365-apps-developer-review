import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {compileCanonical,nativeSchema,byteLength,inventory,promoteReadonly,exactText} from './canonical-wdl.mjs';
import {storageProposal,httpRequest,casFragment,fileCreateFragment,aclReadFragment} from './storage-native.mjs';
import {hostMachine,hostVariables} from './host-machine.mjs';
import {privateDraftSourceBinding} from './PrivateDraftListOriginV4.mjs';
import {sourceDependencies} from './reference-projections.mjs';
const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(folder,'..','..');
const require=createRequire(process.env.KCF_V4_TOOLCHAIN_PACKAGE || 'C:/KCF/KPI/kcf-performance-hub-pm75-optione-exactbody-v4-r2/package.json');
const ts=require('typescript');
const sourceFolder=path.join(root,'src/webparts/performanceHub');
const cache=new Map();
/** Bounded Product consolidation: retain every pure boolean guard as an AND
 * conjunct plus its original evidence metadata. Never merge typed decoders,
 * referenced guard outputs, effects, branches or nonsequential dependencies.
 */
function consolidateBooleanGuards(actions){
  const referenced=new Set();
  const scan=x=>{if(typeof x==='string')for(const m of x.matchAll(/(?:body|outputs)\('([^']+)'\)/g))referenced.add(m[1]);else if(Array.isArray(x))x.forEach(scan);else if(x&&typeof x==='object')Object.entries(x).filter(([k])=>k!=='runAfter'&&k!=='schema').forEach(([,v])=>scan(v));};scan(actions);
  const replacements=new Map();
  function visit(branch){let previous;
    for(const [name,action]of Object.entries(branch)){
      if(action.actions)visit(action.actions);if(action.else)visit(action.else.actions);if(action.cases)Object.values(action.cases).forEach(c=>visit(c.actions));if(action.default)visit(action.default.actions);
      const boolean=a=>a?.type==='ParseJson'&&a.inputs.schema.type==='boolean'&&a.inputs.schema.enum?.length===1&&a.inputs.schema.enum[0]===true&&typeof a.inputs.content==='string'&&a.inputs.content.startsWith('@');
      const prior=branch[previous],deps=Object.entries(action.runAfter||{}),condition=boolean(prior)&&boolean(action)?`@and(${prior.inputs.content.slice(1)},${action.inputs.content.slice(1)})`:'';
      if(previous&&boolean(prior)&&boolean(action)&&!referenced.has(name)&&deps.length===1&&deps[0][0]===previous&&JSON.stringify(deps[0][1])==='["Succeeded"]'&&condition.length<=7900){
        const original=(n,a)=>({name:n,condition:a.inputs.content,reason:a.metadata?.guardReason});
        prior.metadata={...prior.metadata,consolidation:'PURE_SEQUENTIAL_GUARDS_ALL_PRESERVED',originalGuards:[...(prior.metadata?.originalGuards||[original(previous,prior)]),original(name,action)]};prior.inputs.content=condition;delete branch[name];replacements.set(name,previous);
      }else previous=name;
    }
  }visit(actions);
  function rebind(branch){for(const action of Object.values(branch)){if(action.runAfter)action.runAfter=Object.fromEntries(Object.entries(action.runAfter).map(([n,status])=>[replacements.get(n)||n,status]));if(action.actions)rebind(action.actions);if(action.else)rebind(action.else.actions);if(action.cases)Object.values(action.cases).forEach(c=>rebind(c.actions));if(action.default)rebind(action.default.actions);}}rebind(actions);
  return actions;
}
function flattenPureScopes(actions){
  const referenced=new Set(),unsafeDependency=new Set();
  const scan=x=>{if(typeof x==='string')for(const m of x.matchAll(/(?:body|outputs)\('([^']+)'\)/g))referenced.add(m[1]);else if(Array.isArray(x))x.forEach(scan);else if(x&&typeof x==='object'){for(const[n,s]of Object.entries(x.runAfter||{}))if(JSON.stringify(s)!=='["Succeeded"]')unsafeDependency.add(n);Object.entries(x).filter(([k])=>k!=='schema').forEach(([,v])=>scan(v));}};scan(actions);
  const replacements=new Map();
  const onlySucceeded=branch=>Object.values(branch).every(a=>Object.values(a.runAfter||{}).every(s=>JSON.stringify(s)==='["Succeeded"]')&&(!a.actions||onlySucceeded(a.actions))&&(!a.else||onlySucceeded(a.else.actions))&&(!a.cases||Object.values(a.cases).every(c=>onlySucceeded(c.actions)))&&(!a.default||onlySucceeded(a.default.actions)));
  function visit(branch){const result={};for(const[name,a]of Object.entries(branch)){if(a.actions)a.actions=visit(a.actions);if(a.else)a.else.actions=visit(a.else.actions);if(a.cases)Object.values(a.cases).forEach(c=>c.actions=visit(c.actions));if(a.default)a.default.actions=visit(a.default.actions);const names=Object.keys(a.actions||{});if(a.type==='Scope'&&names.length&&!referenced.has(name)&&!unsafeDependency.has(name)&&onlySucceeded(a.actions)){a.actions[names[0]].runAfter=a.runAfter;Object.assign(result,a.actions);replacements.set(name,names.at(-1));}else result[name]=a;}return result;}const result=visit(actions);
  const terminal=n=>{while(replacements.has(n))n=replacements.get(n);return n;};
  function rebind(branch){for(const a of Object.values(branch)){if(a.runAfter)a.runAfter=Object.fromEntries(Object.entries(a.runAfter).map(([n,s])=>[terminal(n),s]));if(a.actions)rebind(a.actions);if(a.else)rebind(a.else.actions);if(a.cases)Object.values(a.cases).forEach(c=>rebind(c.actions));if(a.default)rebind(a.default.actions);}}rebind(result);return result;
}
export function load(file) {
  file=path.resolve(file);
  if(!file.startsWith(sourceFolder+path.sep)) throw Error('Protected source boundary');
  if(cache.has(file)) return cache.get(file);
  const exports={}; cache.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2019}}).outputText;
  vm.runInThisContext(`(function(exports,require){${code}\n})`,{filename:file})(exports,name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name));
  return exports;
}
export function build() {
  const wire=load(path.join(sourceFolder,'services/OptionEWorkplanSubmitExactBodyV4Wire.ts'));
  const request=compileCanonical(wire.V4_WIRE_SCHEMA,"body('Parse_Request')",'RequestWire');
  const draft=compileCanonical(wire.V4_DRAFT_SCHEMA,"items('Current_CanonicalDrafts')?['parsed']",'DraftWire');
  const machine=hostMachine(wire.V4_WIRE_SCHEMA,wire.V4_DRAFT_SCHEMA,draft);
  let actions={}; let previous;
  const add=(name,a)=>{a.runAfter=previous?{[previous]:['Succeeded']}:{};actions[name]=a;previous=name;};
  add('Fail_Closed_Binding',{type:'If',expression:"@and(equals(parameters('binding')?['nativeAdmission'],true),equals(parameters('binding')?['hostParityAdmission'],true),equals(parameters('binding')?['storageAdmission'],true),not(empty(parameters('siteUrl'))),not(empty(parameters('requestListId'))))",actions:{},else:{actions:{Binding_Hold:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'NOT_ADMITTED',message:'Protected native binding/storage/host parity not admitted'}},runAfter:{}}}}});
  const uri="@concat('/_api/web/lists(guid''',parameters('requestListId'),''')/items(',string(triggerBody()?['ID']),')?$select=Id,AuthorId,Created,OData__UIVersionString,File/ServerRelativeUrl&$expand=File')";
  add('Read_Request_Metadata_A',httpRequest('content','GET',uri));
  add('Read_Request_Content_A',httpRequest('content','GET',"@concat('/_api/web/GetFileByServerRelativeUrl(''',replace(body('Read_Request_Metadata_A')?['File']?['ServerRelativeUrl'],'''',''''''),''')/$value')"));
  add('Read_Request_Metadata_B',httpRequest('content','GET',uri));
  add('Read_Request_Content_B',httpRequest('content','GET',"@concat('/_api/web/GetFileByServerRelativeUrl(''',replace(body('Read_Request_Metadata_B')?['File']?['ServerRelativeUrl'],'''',''''''),''')/$value')"));
  add('Require_Complete_Stable_Origin',{type:'If',expression:"@and(equals(body('Read_Request_Metadata_A'),body('Read_Request_Metadata_B')),equals(body('Read_Request_Content_A'),body('Read_Request_Content_B')),not(empty(body('Read_Request_Metadata_A')?['@odata.etag'])),not(equals(body('Read_Request_Metadata_A')?['@odata.etag'],'*')),not(empty(body('Read_Request_Content_A')?['$content'])))",actions:{},else:{actions:{Request_Origin_Hold:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'RequestOriginHold',message:'Missing native content/metadata or unstable origin'}},runAfter:{}}}}});
  add('Decode_Request',{type:'Compose',inputs:"@base64ToString(body('Read_Request_Content_A')?['$content'])"});
  add('Require_Utf8_And_Bound',{type:'If',expression:`@and(equals(base64(outputs('Decode_Request')),body('Read_Request_Content_A')?['$content']),lessOrEquals(${byteLength("outputs('Decode_Request')")},56000))`,actions:{},else:{actions:{Wire_Bound_Hold:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'WireEncodingOrBound',message:'UTF8 roundtrip or 56000 byte no-chunk bound rejected'}},runAfter:{}}}}});
  add('Parse_Request',{type:'ParseJson',inputs:{content:"@outputs('Decode_Request')",schema:nativeSchema(wire.V4_WIRE_SCHEMA)}});
  add('Reconstruct_Request',{type:'Scope',actions:request.actions});
  add('Require_Exact_Request',{type:'If',expression:`@${exactText(request.value,"outputs('Decode_Request')")}`,actions:{},else:{actions:{Canonical_Request_Hold:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'CanonicalRequestMismatch',message:'Complete reconstructed request differs from native text'}},runAfter:{}}}}});
  add('Parse_Draft',{type:'ParseJson',inputs:{content:"@body('Parse_Request')?['source']?['body']",schema:nativeSchema(wire.V4_DRAFT_SCHEMA)}});
  const firstMachine=Object.keys(machine.actions)[0];machine.actions[firstMachine].runAfter={[previous]:['Succeeded']};Object.assign(actions,machine.actions);
  const promoted=promoteReadonly(actions,[...request.variables,...draft.variables,...machine.variables,...hostVariables],['Origins','NativeAssignment','ProtectedWorkplan','ProtectedTargetBody','DecodedADM','SelectedVersion','SelectedCatalogue','CatalogueProvenance','LogicalCatalogueRow','ReferenceClock','CommandKey','CommandUuid','Operation','Control','Checkpoint','ControlIntent','ControlReadback','NextJournal','NextCheckpoint','NextEffect','Snapshot','Receipt']);
  actions=flattenPureScopes(consolidateBooleanGuards(promoted.actions));
  const initializers={};let initializerPrevious;
  for(const variable of promoted.variables){const name=`Initialise_${variable.name}`;initializers[name]={type:'InitializeVariable',inputs:{variables:[variable]},runAfter:initializerPrevious?{[initializerPrevious]:['Succeeded']}: {}};initializerPrevious=name;}
  const firstAction=Object.keys(actions)[0];actions[firstAction].runAfter={[initializerPrevious]:['Succeeded']};actions={...initializers,...actions};
  const info=inventory(actions);
  if(info.missingActions.length||info.missingVariables.length||info.unsupportedFunctions.length) throw Error(JSON.stringify(info));
  const binding={state:'Unbound',enabled:false,activated:false,nativeAdmission:false,hostParityAdmission:false,storageAdmission:false,environmentId:null,tenantId:null,siteUrl:null,siteId:null,webId:null,requestListId:null,privateDraftSource:privateDraftSourceBinding,cataloguePublisher:{admitted:false,listId:null,itemId:null,producerPrincipal:null},historicalSelection:{admitted:false,listId:null,itemId:null,producerPrincipal:null,originalDraftReadbackAdmission:false},supplementalGovernance:{admitted:false,listId:null},rootListIds:Object.fromEntries(Object.keys(storageProposal.roots).map(k=>[k,null])),rootPaths:Object.fromEntries(Object.keys(storageProposal.roots).filter(k=>storageProposal.roots[k].kind==='GenericDocumentLibrary').map(k=>[k,null])),peopleListId:null,protectedWorkplanListId:null,catalogueStoreListId:null,catalogueStoreItemId:null,referenceListIds:Object.fromEntries(['Kpi','Target','Framework','Assignment','Value','Prompt'].map(k=>[k,null])),principalIds:{content:null,acl:null,recovery:null},roleIds:{Read:null,AppendOnly:null,MutatorNoDelete:null,AclReconciler:null,FullControl:null},installedReady:'NOT_ADMITTED',nativeMappings:'UNKNOWN',sourceDependencies};
  const parameters={$connections:{type:'Object',defaultValue:{}},siteUrl:{type:'String',defaultValue:''},requestListId:{type:'String',defaultValue:''},binding:{type:'Object',defaultValue:binding},listIds:{type:'Object',defaultValue:binding.rootListIds},rootPaths:{type:'Object',defaultValue:binding.rootPaths},peopleListId:{type:'String',defaultValue:''},protectedWorkplanListId:{type:'String',defaultValue:''},catalogueStoreListId:{type:'String',defaultValue:''},catalogueStoreItemId:{type:'Int',defaultValue:0},referenceListIds:{type:'Object',defaultValue:binding.referenceListIds},principalIds:{type:'Object',defaultValue:binding.principalIds},roleIds:{type:'Object',defaultValue:binding.roleIds}};
  const definition={name:'KCFKPIOptionESubmitV4StandardHost',properties:{state:'Off',enabled:false,activated:false,implementationStatus:'BOUNDED_PM79_EXISTING_PRIVATE_DRAFT_LIST_ORIGIN_SOURCE_ONLY_NATIVE_ADMISSION_HELD',connectionReferences:{content:{apiId:'/providers/Microsoft.PowerApps/apis/shared_sharepointonline',connectionId:null},acl:{apiId:'/providers/Microsoft.PowerApps/apis/shared_sharepointonline',connectionId:null}},definition:{$schema:'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',contentVersion:'4.0.0.0',parameters,triggers:{Request_Created:{type:'OpenApiConnection',inputs:{host:{apiId:'/providers/Microsoft.PowerApps/apis/shared_sharepointonline',connectionName:'content',operationId:'GetOnNewFileItems'},parameters:{dataset:"@parameters('siteUrl')",table:"@parameters('requestListId')"}},recurrence:{frequency:'Minute',interval:1},splitOn:'@triggerOutputs()?[\'body/value\']'}},actions,outputs:{}}}};
  const fragments={purpose:'Integration primitives only; not the complete host',cas:casFragment('Control',"@variables('ProtectedControlUri')","@variables('ExactControlETag')","@variables('CompletePlannedControl')"),immutable:fileCreateFragment('Admission',"parameters('rootPaths')?['Admission']","concat(variables('CommandUuid'),'-admission.json')","variables('CompleteAdmission')"),acl:aclReadFragment('PrivateDraft',"variables('ProtectedDraftUri')")};
  return {definition,binding,storage:storageProposal,fragments,inventory:{...info,status:'SOURCE_STRUCTURE_ONLY',hostParity:'NOT_EXECUTED',sourceDependencies,nativeUnadmitted:['Protected native connection/environment/schema/role/rights/ACL denial/unique/immutability admission','Hosted numeric/scalar/date/Unicode/UTF8/wire parity','Actual native installation and TEST execution']}};
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex').toUpperCase();
function crc32(bytes) {let c=0xffffffff;for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
/** Deterministic STORE ZIP; fixed timestamp, no machine path or platform compression variance. */
export function zip(files) {
  const local=[],central=[];let offset=0;
  for(const [name,value] of Object.entries(files).sort(([a],[b])=>a.localeCompare(b))) {
    const n=Buffer.from(name),body=Buffer.from(value),crc=crc32(body),h=Buffer.alloc(30),c=Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(0x21,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(body.length,18);h.writeUInt32LE(body.length,22);h.writeUInt16LE(n.length,26);
    c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(0x21,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(body.length,20);c.writeUInt32LE(body.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    local.push(h,n,body);central.push(c,n);offset+=h.length+n.length+body.length;
  }
  const cb=Buffer.concat(central),e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(Object.keys(files).length,8);e.writeUInt16LE(Object.keys(files).length,10);e.writeUInt32LE(cb.length,12);e.writeUInt32LE(offset,16);return Buffer.concat([...local,cb,e]);
}
export function generate(check=false) {
  const result=build();
  const bodies=Object.fromEntries([['standard-host.disabled.definition.json',result.definition],['standard-host.binding.template.json',result.binding],['v4-storage-native-map.proposal.json',result.storage],['standard-host.native.fragments.json',result.fragments],['standard-host.action-inventory.json',result.inventory]].map(([n,v])=>[n,Buffer.from(JSON.stringify(v,null,2)+'\n')]));
  bodies['standard-host.disabled.source.zip']=zip(bodies);
  const sources=['Tools/build-standard-host.mjs','Tools/canonical-wdl.mjs','Tools/storage-native.mjs','Tools/host-machine.mjs','Tools/reference-projections.mjs','Tools/domain-projection.mjs','Tools/PersonTargetAdmissionV4.mjs','Tools/CatalogueExactBodyReaderV4.mjs','Tools/HistoricalSelectionProvenanceV4.mjs','Tools/PrivateDraftListOriginV4.mjs'];
  const protectedInputs=['src/webparts/performanceHub/services/OptionEWorkplanSubmitExactBodyV4Wire.ts','src/webparts/performanceHub/models/OptionEWorkplanSubmitExactBodyV4Models.ts','src/webparts/performanceHub/models/OptionEWorkplanDraftModels.ts','src/webparts/performanceHub/services/OptionEWorkplanSubmitExactBodyV4.ts','src/webparts/performanceHub/services/OptionEWorkplanSubmitExactBodyV4PackageContract.ts','src/webparts/performanceHub/services/OptionEDraftSharePointGateway.ts','src/webparts/performanceHub/services/OptionEProtectedDraftGateway.ts','src/webparts/performanceHub/services/OptionEWorkplanListBindings.ts'];
  bodies['standard-host.manifest.json']=Buffer.from(JSON.stringify({implementationStatus:'BOUNDED_PM79_EXISTING_PRIVATE_DRAFT_LIST_ORIGIN_SOURCE_ONLY_NATIVE_ADMISSION_HELD',enabled:false,installedReady:'NOT_ADMITTED',sourceDependencies,sourceInventory:sources.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(folder,p)))})),protectedInputs:protectedInputs.map(p=>({path:p,sha256:sha(fs.readFileSync(path.join(root,p)))})),files:Object.entries(bodies).map(([p,b])=>({path:p,sha256:sha(b)}))},null,2)+'\n');
  for(const [name,bytes] of Object.entries(bodies)) {const target=path.join(folder,name);if(check){if(!fs.existsSync(target)||!fs.readFileSync(target).equals(bytes))throw Error(`Generation drift ${name}`);}else fs.writeFileSync(target,bytes);}
  return {files:Object.keys(bodies),actionCount:result.inventory.actionCount,implementationStatus:'BOUNDED_PM79_EXISTING_PRIVATE_DRAFT_LIST_ORIGIN_SOURCE_ONLY_NATIVE_ADMISSION_HELD',installedReady:'NOT_ADMITTED'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) console.log(JSON.stringify(generate(process.argv.includes('--check'))));
