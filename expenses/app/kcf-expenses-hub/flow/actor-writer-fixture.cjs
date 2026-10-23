'use strict';
// Executes the emitted WDL itself against the existing deterministic Standard
// HTTP fixture. No TS processor invocation, network, credential or tenant.
const assert=require('node:assert/strict');
const {AdmissionTenant}=require('./actor-admission-fixture.cjs');
const {buildActorProcessorFlow,SITE}=require('./build-flow.cjs');
const {Harness}=require('./wdl-harness.cjs');
class WriterTenant extends AdmissionTenant {
  constructor(){super();this.writerCalls=[];this.writerHooks={};this.writerTail=Promise.resolve();}
  async writerTransport(input,name){
    assert.equal(input.parameters.dataset,SITE);this.writerCalls.push({name,input:structuredClone(input)});
    if(this.writerHooks[name])await this.writerHooks[name](this);
    const p=input.parameters,url=p['parameters/uri'];
    if(input.host.operationId==='GetFileContentByPath'||p['parameters/method']==='GET'&&!url.endsWith('/$value'))return this.admissionTransport(input,name);
    assert.equal(input.host.operationId,'HttpRequest');
    const body=p['parameters/body'];
    const result=await this.send({method:p['parameters/method'],url:SITE+'/'+url,headers:p['parameters/headers'],retry:'none',
      ...(body===undefined?{}:{body:Buffer.isBuffer(body)?new Uint8Array(body):typeof body==='string'?JSON.parse(body):body})});
    if(result.status<200||result.status>=300)throw Error('FAKE_NATIVE_HTTP_'+result.status);
    const response=new Response(result.body),data=url.endsWith('/$value')?{'$content-type':'application/octet-stream','$content':Buffer.from(await response.arrayBuffer()).toString('base64')}:await response.json();
    return {body:data,headers:{ETag:result.etag}};
  }
  async runWriter(requestId=501){
    const previous=this.writerTail;let release;this.writerTail=new Promise(r=>release=r);await previous;
    try{const h=new Harness(buildActorProcessorFlow(),structuredClone(this.admissionBindings),this.writerTransport.bind(this));
      const result=await h.run({ID:requestId});return {...result,errors:h.errors,visited:h.visited};
    }finally{release();}
  }
}
module.exports={WriterTenant};
