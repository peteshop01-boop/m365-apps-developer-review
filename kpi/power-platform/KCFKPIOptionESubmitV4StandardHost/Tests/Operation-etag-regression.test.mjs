/** A007 developer retest of actual generated Operation response boundary. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from '../Tools/build-standard-host.mjs';
import {NativeMemory} from './native-memory.mjs';
import {WdlEmulator} from './wdl-emulator.mjs';
const actions=build().definition.properties.definition.actions,records=[];
async function run(n,patch){const e=new WdlEmulator({parameters:n.parameters,trigger:{ID:1},http:async(p,name,em)=>{const result=await n.http(p,name,em);return patch?patch(p,name,result):result;}});await e.run(actions);return e;}
const summary=(n,e)=>({terminal:e.terminal||'FAILED_WITHOUT_TERMINAL_LABEL',terminalError:e.terminalError,failures:e.failures,writes:n.writes.length,controlState:n.control.State});
async function test(name,fn){const detail={},start=performance.now();try{await fn(detail);records.push({name,result:'PASS',ms:performance.now()-start,...detail});}catch(error){records.push({name,result:'FAIL',error:String(error),ms:performance.now()-start,...detail});}}
for(const [label,change]of [['valid quoted',r=>{}],['missing',r=>delete r['@odata.etag']],['blank',r=>r['@odata.etag']=''],['quoted wildcard',r=>r['@odata.etag']='"*"'],['unquoted',r=>r['@odata.etag']='1']])await test(`Completed generated replay Operation ETag ${label}`,async detail=>{
  const n=new NativeMemory(),first=await run(n);assert.equal(first.terminal,'Succeeded');const before=n.writes.length,actual=structuredClone(n.lists.get(n.listIds.Operation)[0]);
  const replay=await run(n,(p,name,result)=>{if(p['parameters/method']==='GET'&&p['parameters/uri'].includes(n.listIds.Operation)&&result.body?.value)for(const row of result.body.value)change(row);return result;});detail.execution=summary(n,replay);assert.equal(n.writes.length,before);assert.deepEqual(n.lists.get(n.listIds.Operation)[0],actual);
  if(label==='valid quoted')assert.equal(replay.terminal,'Succeeded');else assert.notEqual(replay.terminal,'Succeeded');
});
const output={classification:'DEVELOPER_GENERATED_RESPONSE_ONLY_NO_NATIVE_MUTATION_OR_SECURITY_CLOSURE',tests:records.length,passed:records.filter(r=>r.result==='PASS').length,failed:records.filter(r=>r.result==='FAIL').length,records};
fs.writeFileSync(process.env.KCF_A007_ETAG_RESULT,JSON.stringify(output,null,2)+'\n');console.log(JSON.stringify({tests:output.tests,passed:output.passed,failed:output.failed,failures:records.filter(r=>r.result==='FAIL').map(r=>r.name)}));if(output.failed)process.exitCode=1;
