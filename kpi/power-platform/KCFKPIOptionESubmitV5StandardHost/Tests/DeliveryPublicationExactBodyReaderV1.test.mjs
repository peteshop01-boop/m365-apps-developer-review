import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {WdlEmulator} from '../../KCFKPIOptionESubmitV4StandardHost/Tests/wdl-emulator.mjs';
import {httpRequest} from '../../KCFKPIOptionESubmitV4StandardHost/Tools/storage-native.mjs';
import {inventory, documentedFunctions} from '../../KCFKPIOptionESubmitV4StandardHost/Tools/canonical-wdl.mjs';
import {emitDeliveryPublicationReader, DELIVERY_PUBLICATION_EXACT_BODY_READER_V1} from '../Tools/DeliveryPublicationExactBodyReaderV1.mjs';
const require=createRequire(import.meta.url);
const {buildGlobalDeliveryPublicationProposal,buildManagerDeliveryPublicationProposal}=require('../../../lib-commonjs/webparts/performanceHub/services/GovernedDeliveryPublicationV1.js');
const {v4Canonical}=require('../../../lib-commonjs/webparts/performanceHub/services/OptionEWorkplanSubmitExactBodyV4Wire.js');
const clone=value=>structuredClone(value);
const siteId='fb1f6035-236e-434c-ae05-a78003badd47',webId='cbf5edb8-5d3b-46a5-a5ea-4564fa3ff43c';
const peopleListId='cb02da80-d986-4034-a832-41d7b04e56ff',workplanListId='cd90f5d6-e067-45db-ab58-2cdc57ea4cb4';
const coordinate=(itemId,listId=workplanListId)=>({siteId,webId,listId,itemId,version:'3.0',etag:'"3"'});
const payload=(core=70,impact=30,version='global-1',publishedAt='2026-10-03T09:00:00.000Z')=>({schema:'KCF.DeliveryWeightConfiguration',immutable:true,published:true,
  authority:{configurationId:'synthetic-'+version,version,etag:`"${version}"`,approvalReference:'KCF-KPI-Sponsor-PD-01',contentSha256:'A'.repeat(64),
    effectiveFrom:'2026-10-03',publishedAt,publishedBy:'publisher@example.invalid',changeReference:'synthetic-'+version},
  defaultWeights:{core:70,impact:30},activeWeights:{core,impact}});
function publication(manager=true,core=80.25,impact=19.75){
  const config={schema:'KCF.OverallDelivery.Configuration',schemaVersion:1,sourceList:'KCFKPI_Config',environment:'TEST-SYNTHETIC',performanceYear:2026,
    versionToken:'101@"core-1"|102@"impact-1"',weights:{core:70,impact:30,total:100},includedCategories:['Core','Impact'],excludedCategories:['Behaviours'],
    behavioursExcludedFromDeliveryArithmetic:true,poorCoreMaskingGuard:'RequiredDownstreamGovernedRule',poorCoreThresholdConfiguredHere:false,tenantMutationExecuted:false,
    authority:Object.fromEntries(['core','impact'].map((category,i)=>[category,{identity:{itemId:101+i,key:'OverallDelivery.Weight.'+(i?'Impact':'Core'),
      environment:'TEST-SYNTHETIC',etag:`"${category}-1"`,state:'Active'},provenance:{modifiedAt:'2026-10-03T08:00:00.000Z',modifiedBy:'admin@example.invalid',changeReference:'synthetic'}}]))};
  const global=buildGlobalDeliveryPublicationProposal(config,payload());if(!manager)return global;
  const wp={id:44,etag:'"3"',workplanKey:'WP-SYNTHETIC-2026',personKey:'employee',employeeDisplayName:'Synthetic Employee',employeeEmail:'employee@example.invalid',
    performanceYear:2026,managerPersonKey:'manager',managerEmail:'manager@example.invalid',state:'Draft',accessState:'Editable',transitionStatus:'Ready',
    coreCategoryWeight:70,personalCategoryWeight:20,behaviourCategoryWeight:10,rowVersionToken:7};
  const observations={workplanSource:{native:coordinate(44),value:wp},actorSource:{native:coordinate(5,peopleListId),
    value:{personKey:'manager',email:'manager@example.invalid',appRoles:['Manager'],active:true}},subjectSource:{native:coordinate(6,peopleListId),
    value:{personKey:'employee',managerPersonKey:'manager',managerEmail:'manager@example.invalid'}}};
  return buildManagerDeliveryPublicationProposal(global,observations,{auditKey:'synthetic-audit-1',existingAuditKeys:[],current:{core:70,impact:30},proposed:{core,impact},
    reason:'Synthetic change',subjectPersonKey:'employee',actorEmail:'manager@example.invalid',actorRole:'Manager',actorPersonKey:'manager',assignedManagerPersonKey:'manager',
    eventAt:'2026-10-03T10:00:00.000Z',sourceVersion:7,state:'Draft'},payload(core,impact,'manager-1','2026-10-03T10:01:00.000Z'));
}
class Chain {
  constructor(prefix=''){this.prefix=prefix;this.actions={};this.previous=undefined;}
  add(name,action){const key=this.prefix+name;action.runAfter=this.previous?{[this.previous]:['Succeeded']}:{};this.actions[key]=action;this.previous=key;return key;}
  guard(name,expression,reason){return this.add(name,{type:'ParseJson',inputs:{content:'@'+expression,schema:{type:'boolean',enum:[true]}},metadata:{guardReason:reason}});}
  http(name,connection,method,uri){return this.add(name,httpRequest(connection,method,uri));}
}
const chain=new Chain('Test_'),reader=emitDeliveryPublicationReader(chain);
const actions={Init:{type:'InitializeVariable',inputs:{variables:reader.variables},runAfter:{}},...chain.actions};
function fixture(manager=true,core=80.25,impact=19.75){
  const body=clone(publication(manager,core,impact)),a=body.payload.authority;
  const binding={siteId,webId,deliveryPublication:{admitted:true,admissionReference:'synthetic-native-admission',immutable:true,siteId,webId,
    listId:'5269ebee-565a-4093-a666-00c98cfc5f68',itemId:900,version:a.version,etag:a.etag,producerPrincipal:501,
    expectedAuthority:clone(a),expectedScope:clone(body.scope),workplanListId,peopleListId}};
  const native={Id:900,AuthorId:501,Created:a.publishedAt,OData__UIVersionString:a.version,'@odata.etag':a.etag,FileRef:'/synthetic/publication.json'};
  return {body,binding,native};
}
async function execute(f){
  let nativeReads=0;
  const machine=new WdlEmulator({parameters:{binding:f.binding},http:request=>{
    const uri=request['parameters/uri'];
    if(uri.endsWith('/$value'))return {statusCode:200,body:{$content:f.encoded??Buffer.from(f.raw??v4Canonical(f.body),'utf8').toString('base64')}};
    nativeReads++;return {statusCode:200,body:{value:[clone(nativeReads===2&&f.secondNative?f.secondNative:f.native)],...(f.page?{'@odata.nextLink':'more'}:{})}};
  }});
  const ok=await machine.run(actions);return {ok,machine,result:machine.resolve('@'+reader.result),nativeReads};
}
test('source emitter uses existing supported WDL helpers and no Behaviour decoder/hash expression',()=>{
  const report=inventory(actions);for(const name of report.functions)assert(documentedFunctions.has(name),name);
  const source=JSON.stringify(actions);assert(!source.includes('sha256('));assert(!source.includes('catalogue-publisher-readback/v4'));
  assert(!source.includes('triggerBody('));assert(reader.variables.length>0);
});
for(const [label,manager,core,impact] of [['default',false,70,30],['Manager',true,80,20],['decimal Manager',true,80.25,19.75],['decimal floating point',true,80.01,19.99]]){
  test(`reads ${label} full protected U1 body and retains exact origin`,async()=>{
    const f=fixture(manager,core,impact),r=await execute(f);assert.equal(r.ok,true,JSON.stringify(r.machine.failures));
    assert.equal(r.result.contract,DELIVERY_PUBLICATION_EXACT_BODY_READER_V1);assert.equal(r.result.rawBody,v4Canonical(f.body));
    assert.deepEqual(r.result.publication,f.body);assert.deepEqual(r.result.nativeMetadata,f.native);assert.equal(r.nativeReads,2);
    assert.deepEqual(r.result.native,{siteId,webId,listId:f.binding.deliveryPublication.listId,itemId:900,version:f.native.OData__UIVersionString,etag:f.native['@odata.etag']});
  });
}
for(const [label,change] of [
  ['unbound',f=>{delete f.binding.deliveryPublication;}],['not admitted',f=>{f.binding.deliveryPublication.admitted=false;}],
  ['wrong site',f=>{f.binding.siteId=webId;}],['wrong producer',f=>{f.native.AuthorId=999;}],
  ['wrong native version',f=>{f.native.OData__UIVersionString='other';}],['wrong native ETag',f=>{f.native['@odata.etag']='"other"';}],
  ['wildcard ETag',f=>{f.native['@odata.etag']='"*"';}],['changed native read',f=>{f.secondNative={...f.native,AuthorId:999};}],
  ['paged metadata',f=>{f.page=true;}],['wrong native Created',f=>{f.native.Created='2026-10-03T11:00:00.000Z';}],
  ['wrong PD-01 authority',f=>{f.binding.deliveryPublication.expectedAuthority.configurationId='other';}],
  ['wrong expected Workplan',f=>{f.binding.deliveryPublication.expectedScope.workplan='other';}],
  ['wrong discriminator',f=>{f.body.contract='kcf.option-e.catalogue-publisher-readback/v4';}],
  ['wrong approval purpose',f=>{f.body.purposeApproval='other';}],['missing complete audit',f=>{delete f.body.provenance.approval.audit;}],
  ['extra root key',f=>{f.body.protectedOrigin=true;}],['extra nested key',f=>{f.body.provenance.actorSource.value.approved=true;}],
  ['default changed',f=>{f.body.payload.defaultWeights={core:60,impact:40};}],
  ['invalid decimal precision',f=>{f.body.payload.activeWeights={core:80.001,impact:19.999};}],
  ['baseline invalid source version',f=>{f.body.provenance.baseline.provenance.configSource.versionToken='other';}],
  ['Config future modification',f=>{f.body.provenance.baseline.provenance.configSource.authority.core.provenance.modifiedAt='2026-10-04T08:00:00.000Z';}],
  ['wrong Workplan',f=>{f.body.scope.workplan='other';}],['wrong year',f=>{f.body.provenance.workplanSource.value.performanceYear=2027;}],
  ['wrong Manager',f=>{f.body.provenance.actorSource.value.personKey='other';}],
  ['wrong Manager email',f=>{f.body.provenance.subjectSource.value.managerEmail='other@example.invalid';}],
  ['self approval',f=>{f.body.provenance.actorSource.value.email='employee@example.invalid';}],
  ['inactive Manager',f=>{f.body.provenance.actorSource.value.active=false;}],
  ['Admin role',f=>{f.body.provenance.actorSource.value.appRoles=['SystemAdmin'];}],
  ['duplicated roles',f=>{f.body.provenance.actorSource.value.appRoles=['Manager','Manager'];}],
  ['unknown role',f=>{f.body.provenance.actorSource.value.appRoles=['Manager','Invented'];}],
  ['stale Workplan native ETag',f=>{f.body.provenance.workplanSource.native.etag='"old"';}],
  ['crossed People list',f=>{f.body.provenance.actorSource.native.listId=workplanListId;}],
  ['crossed People item',f=>{f.body.provenance.actorSource.native.itemId=6;}],
  ['immutable Workplan',f=>{f.body.provenance.workplanSource.value.state='Submitted';}],
  ['audit wrong before',f=>{f.body.provenance.approval.audit.before={core:60,impact:40};}],
  ['audit wrong after',f=>{f.body.provenance.approval.audit.after={core:80,impact:20};}],
  ['audit wrong version',f=>{f.body.provenance.approval.audit.sourceVersion=6;}],
  ['audit wrong actor',f=>{f.body.provenance.approval.audit.actorEmail='other@example.invalid';}],
  ['audit blank reason',f=>{f.body.provenance.approval.audit.reason=' ';}],
  ['audit future',f=>{f.body.provenance.approval.audit.eventAt='2026-10-04T10:00:00.000Z';}],
  ['noncanonical whitespace',f=>{f.raw=v4Canonical(f.body)+' ';}],
  ['duplicate key',f=>{f.raw=v4Canonical(f.body).replace('"contract":','"contract":"ignored","contract":');}],
  ['alternate escaping',f=>{f.raw=v4Canonical(f.body).replace('Synthetic change','Synthetic\\u0020change');}],
  ['invalid UTF8',f=>{f.encoded=Buffer.from([0xc3,0x28]).toString('base64');}],
  ['byte order mark',f=>{f.raw='\uFEFF'+v4Canonical(f.body);}]
])test(`holds ${label}`,async()=>{const f=fixture();change(f);const r=await execute(f);assert.equal(r.ok,false);assert.equal(r.result,undefined);});
test('retains optional Workplan current decimal values and ChangesRequested provenance',async()=>{
  const f=fixture();f.body.provenance.workplanSource.value.state='ChangesRequested';f.body.provenance.approval.audit.resultingState='ChangesRequested';
  f.body.provenance.workplanSource.value.overallDeliveryWeightConfiguration={configurationKey:'prior',configurationVersion:'prior-v1',coreWeight:75.25,impactWeight:24.75,sourceReference:'KCF-KPI-Sponsor-PD-01'};
  f.body.provenance.approval.audit.before={core:75.25,impact:24.75};const r=await execute(f);assert.equal(r.ok,true,JSON.stringify(r.machine.failures));assert.deepEqual(r.result.publication,f.body);
});
