'use strict';
require('./verify-toolchain.cjs');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),out=fs.mkdtempSync(path.join(os.tmpdir(),'kcf-actor-scopes-'));
const options={target:ts.ScriptTarget.ES5,module:ts.ModuleKind.CommonJS,lib:['lib.es2017.d.ts','lib.dom.d.ts'],strict:true,noImplicitReturns:true,skipLibCheck:true,types:[],rootDir:path.join(root,'src'),outDir:out};
const program=ts.createProgram([path.join(root,'src/processor/ActorScopedProcessor.ts')],options);
const diagnostics=ts.getPreEmitDiagnostics(program);
if(diagnostics.length){process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:x=>x,getCurrentDirectory:()=>root,getNewLine:()=> '\n'}));process.exitCode=1;}
else {
  const emitted=program.emit();if(emitted.emitSkipped)throw Error('STRICT_EMIT_FAILED');
  console.log('Strict processor source compilation PASS; fresh output '+out+'; no native build/package/tenant credit.');
  const r=cp.spawnSync(process.execPath,['--test',path.join(root,'flow/actor-scoped-store.test.cjs')],{cwd:root,env:{...process.env,KCF_ACTOR_SCOPE_LIB:out},stdio:'inherit'});
  process.exitCode=r.status??1;
}
