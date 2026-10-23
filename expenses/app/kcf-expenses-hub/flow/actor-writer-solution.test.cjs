'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {actorWriterSolutionFiles,solutionFiles,actorAdmissionSolutionFiles,workflowId,filename}=require('./build-solution.cjs');
const {buildActorWriterMachine}=require('./actor-writer-machine.cjs');
const {validateGraph}=require('./wdl-harness.cjs');
test('writer assembly carries the exact current multiuser machine in the existing OFF workflow',()=>{
  const files=actorWriterSolutionFiles(),flow=JSON.parse(files['Workflows/'+filename]);
  assert.equal(Object.keys(files).length,4);
  assert.deepEqual(flow,buildActorWriterMachine().flow);
  assert.deepEqual(flow.properties.definition.parameters.Bindings.defaultValue,{});
  assert.equal(validateGraph(flow).actions,489);
  const descriptor=files['Workflows/'+filename+'.data.xml'];
  assert(descriptor.includes(workflowId));
  assert(descriptor.includes('<StateCode>0</StateCode><StatusCode>1</StatusCode>'));
  assert(descriptor.includes('<IntroducedVersion>0.1.0.10</IntroducedVersion>'));
  assert(files['Other/Solution.xml'].includes('<Version>0.1.0.10</Version>'));
  assert.equal(Object.keys(flow.properties.connectionReferences).join(','),'shared_sharepointonline');
  assert(!JSON.stringify(flow).includes('fixtureActorId'));
  assert(!JSON.stringify(flow).includes('fixtureParentId'));
  assert(!JSON.stringify(files).includes('shared_office365'));
  assert(!JSON.stringify(files).includes('shared_http'));
});
test('writer assembly does not replace legacy or admission-only versions',()=>{
  const before=solutionFiles(),admission=actorAdmissionSolutionFiles();
  actorWriterSolutionFiles();
  assert.deepEqual(solutionFiles(),before);
  assert.deepEqual(actorAdmissionSolutionFiles(),admission);
  assert(before['Other/Solution.xml'].includes('<Version>0.1.0.7</Version>'));
  assert(admission['Other/Solution.xml'].includes('<Version>0.1.0.9</Version>'));
});
function cli(args,exists=false){
  const writes=[],dirs=[],messages=[],mod={exports:{}};
  const fakeFs={mkdirSync(dir,options){dirs.push(dir);if(exists&&dir.endsWith('solution-actor-writer')&&!options){const e=Error('EEXIST');e.code='EEXIST';throw e;}},writeFileSync(file,data,options){writes.push({file,data,options});}};
  const sandbox={require:Object.assign(name=>name==='node:fs'?fakeFs:require(name),{main:mod}),module:mod,__dirname,process:{argv:['node','build-solution.cjs',...args]},console:{log:message=>messages.push(message)}};
  try{vm.runInNewContext(fs.readFileSync(path.join(__dirname,'build-solution.cjs'),'utf8'),sandbox);return {writes,dirs,messages};}
  catch(error){return {writes,dirs,messages,error};}
}
test('writer CLI creates an exclusive local assembly and refuses an existing candidate',()=>{
  const result=cli(['--actor-writer']);assert.equal(result.error,undefined);
  assert.equal(result.writes.length,4);
  for(const write of result.writes){assert.equal(write.options.flag,'wx');assert(write.file.includes('solution-actor-writer'));}
  assert.match(result.messages.join(' '),/OFF\/unbound.*NOT TEST ready.*No tenant action/);
  const refused=cli(['--actor-writer'],true);assert.equal(refused.error.code,'EEXIST');assert.equal(refused.writes.length,0);
});
test('writer CLI rejects caller-supplied bindings, activation and extra arguments before writing',()=>{
  for(const args of [['--actor-writer','--enable'],['--actor-writer','bindings.json'],['--actor-writer','--actor-admission']]){
    const refused=cli(args);assert.match(refused.error.message,/UNKNOWN_SOURCE_ASSEMBLY_MODE/);assert.equal(refused.writes.length,0);assert.equal(refused.dirs.length,0);
  }
});
