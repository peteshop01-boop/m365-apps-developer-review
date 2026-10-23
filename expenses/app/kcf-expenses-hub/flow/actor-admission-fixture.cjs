'use strict';
// Test-only Standard HTTP server, reusing stored item/ACL/bytes fixtures. Runs
// the emitted WDL through Harness; it never invokes the TS processor/store.
const assert=require('node:assert/strict');
const {ScopedTenant}=require('./actor-scoped-fixture.cjs');
const {Harness}=require('./wdl-harness.cjs');
const {buildActorAdmissionFlow,SITE}=require('./build-flow.cjs');
class AdmissionTenant extends ScopedTenant {
  constructor(){
    super();this.admissionCalls=[];this.admissionHooks={};this.admissionFlags={};
    // Use the SAME reference-only ACL/membership model as the TS store fixture.
    // Synthetic group24 is not a native group or authority to grant access.
    this.admissionBindings={...Object.fromEntries(Object.entries(this.schemas.lists)),processorActorId:99,
      roots:this.p.roots,recovery:this.p.recovery,processorRoles:this.p.processorRoles,employeeRead:this.p.employeeRead,employeeRequest:this.p.employeeRequest,rootAcl:this.p.rootAcl,registryField:'D01PrivateScopes'};
  }
  async admissionTransport(input,name){
    assert.equal(input.parameters.dataset,SITE);this.admissionCalls.push({name,input:structuredClone(input)});
    if(this.admissionHooks[name])await this.admissionHooks[name](this);
    const p=input.parameters,relative=p['parameters/uri'];
    if(input.host.operationId==='GetFileContentByPath'){
      const bytes=this.files.get(p.path);assert(bytes);return {body:{'$content-type':'application/octet-stream','$content':bytes.toString('base64')}};
    }
    assert.equal(input.host.operationId,'HttpRequest');assert.equal(p['parameters/method'],'GET','read-only admission must never issue a mutation');
    if(relative.includes('/groups?')){
      const actor=Number(/getbyid\((\d+)\)/.exec(relative)?.[1]);
      const groups=[...this.groups].filter(([,members])=>members.has(actor)).map(([Id])=>({Id,PrincipalType:8}));
      return {body:{value:this.admissionFlags.recoveryMember?[...groups,{Id:3,PrincipalType:8}]:groups,...(this.admissionFlags.groupsPaged?{'@odata.nextLink':'blocked'}:{})}};
    }
    if(relative.includes('/fields/getbyinternalnameortitle'))return {body:{InternalName:'D01PrivateScopes',TypeAsString:'Note',ReadOnlyField:false,RichText:!!this.admissionFlags.richRegistry,AppendOnly:false}};
    const r=await this.send({method:'GET',url:SITE+'/'+relative,headers:p['parameters/headers'],retry:'none'});
    if(r.status!==200)throw Error('FAKE_NATIVE_NOT_FOUND');
    return {body:await new Response(r.body).json(),headers:{ETag:r.etag}};
  }
  async runAdmission(requestId=501,bindings=this.admissionBindings){
    const h=new Harness(buildActorAdmissionFlow(),structuredClone(bindings),this.admissionTransport.bind(this)),r=await h.run({ID:requestId});
    return {...r,errors:h.errors,visited:h.visited};
  }
}
module.exports={AdmissionTenant};
