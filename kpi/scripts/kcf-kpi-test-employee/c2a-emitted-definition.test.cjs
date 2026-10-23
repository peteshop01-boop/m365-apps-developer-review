/** Focused developer checks of actual emitted admission actions; NOT native semantic proof. */
'use strict';
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict'), vm=require('node:vm');
const {pathToFileURL}=require('node:url'), {execFileSync}=require('node:child_process');
const crypto=require('node:crypto'), Ajv=require('ajv'), ts=require('typescript');
const root=path.resolve(__dirname,'../..'), evidence=path.resolve(process.argv[2]||'');
const evidenceRoot=path.resolve('C:/KCF/KPI/_CONTROL/02_QA/KCF-KPI-DELIVERY-ADVANCE-002/M179/BUILD_TEXT_BOUNDARY');
const relativeEvidence=path.relative(evidenceRoot,evidence);
const compositionOnly=process.argv[3]==='--composition-only';
const textBoundaryOnly=process.argv[3]==='--text-boundary-only';
if(process.argv.length!==(compositionOnly||textBoundaryOnly?4:3)||relativeEvidence.startsWith('..')||path.isAbsolute(relativeEvidence)||fs.realpathSync(evidence).toLowerCase()!==evidence.toLowerCase())throw Error('Fresh evidence folder inside exact M179 location required.');
const outputPath=path.join(root,'power-platform/KCFKPIEmployeeTESTProcessor/Definitions/C2a.disabled.definition.json');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex').toUpperCase();
const write=(name,data)=>{const bytes=Buffer.from(JSON.stringify(data,null,2)+'\n');const p=path.join(evidence,name);fs.writeFileSync(p,bytes,{flag:'wx'});return {path:p,bytes:bytes.length,sha256:sha(bytes)};};
const results=[], artifacts=[], traces=[], inventories=[], loaded=[]; let api;
function check(id,fn){try{fn();results.push({id,status:'PASS'});}catch(e){results.push({id,status:'FAIL',error:e.stack});throw e;}}
// TypeScript source modules are executed unchanged after transpilation in memory. No service is instantiated.
const modules=new Map();
function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file).exports;
 const source=fs.readFileSync(file,'utf8'),m={exports:{}}; modules.set(file,m);loaded.push({path:file,sha256:sha(Buffer.from(source))});
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const req=name=>{if(name==='@microsoft/sp-http') return {SPHttpClient:class {constructor(){throw Error('Network service forbidden');} static configurations={v1:{}};}};if(!name.startsWith('.'))throw Error('Unexpected dependency '+name);return load(path.resolve(path.dirname(file),name+'.ts'));};
 vm.runInThisContext('(function(require,module,exports){'+compiled+'\n})',{filename:file})(req,m,m.exports);return m.exports;
}
// Small recursive WDL expression reader. No eval/rewrite into JS; unknown reached operator is fatal.
function parse(code){let i=0;function ws(){while(/\s/.test(code[i]||'')&&i<code.length)i++;}function atom(){ws();let n;
 if(code[i]==="'"){i++;let value='';while(i<code.length){if(code[i]==="'"){if(code[i+1]==="'"){value+="'";i+=2;}else{i++;break;}}else value+=code[i++];}n={literal:value};}
 else {const m=/^(?:-?\d+(?:\.\d+)?(?:e[+-]?\d+)?|[A-Za-z_][A-Za-z_0-9]*)/i.exec(code.slice(i));if(!m)throw Error('Bad expression '+code.slice(i));i+=m[0].length;ws();
 if(code[i]==='('){i++;const args=[];ws();if(code[i]!==')'){while(true){args.push(atom());ws();if(code[i]!==',')break;i++;}}if(code[i++]!==')')throw Error('Missing close '+code);n={fn:m[0],args};}
 else if(['true','false','null'].includes(m[0]))n={literal:JSON.parse(m[0])};else if(/^-?\d/.test(m[0]))n={literal:Number(m[0])};else throw Error('Bare name '+m[0]);}
 ws();while(code.slice(i,i+2)==='?['){i+=2;const key=atom();ws();if(code[i++]!==']')throw Error('Missing field close');n={base:n,key};ws();}return n;}
 const n=atom();if(i!==code.length)throw Error('Trailing expression '+code.slice(i));return n;}
const asts=new Map();
class Runtime {
 constructor(){this.values={};this.trace=[];this.vars={};this.item=null;this.loops={};this.ops=new Set();this.parseRaw=0;}
 expr(code){if(!asts.has(code))asts.set(code,parse(code));return this.eval(asts.get(code));}
 eval(n){if(Object.hasOwn(n,'literal'))return n.literal;if(n.base){const x=this.eval(n.base);return x?.[this.eval(n.key)]??null;}
 const name=n.fn;this.ops.add(name);if(name==='if')return this.eval(n.args[this.eval(n.args[0])?1:2]);
 const a=n.args.map(x=>this.eval(x));switch(name){case 'body':case 'outputs':if(!Object.hasOwn(this.values,a[0]))throw Error('Unresolved reached reference '+a[0]);return this.values[a[0]];
 case 'variables':return this.vars[a[0]];case 'item':return this.item;case 'items':return this.loops[a[0]];
 case 'equals':return JSON.stringify(a[0])===JSON.stringify(a[1]);case 'and':return a.every(x=>x===true);case 'or':return a.some(x=>x===true);case 'not':return !a[0];
 case 'length':return a[0].length;case 'empty':return a[0]==null||a[0]===''||Array.isArray(a[0])&&a[0].length===0||typeof a[0]==='object'&&Object.keys(a[0]).length===0;
 case 'replace':assert.equal(typeof a[0],'string');return a[0].split(a[1]).join(a[2]);case 'startsWith':return a[0].startsWith(a[1]);case 'substring':return a[0].substring(a[1],a[2]===undefined?undefined:a[1]+a[2]);
 case 'contains':return typeof a[0]==='string'||Array.isArray(a[0])?a[0].includes(a[1]):Object.hasOwn(a[0],a[1]);case 'concat':return a.join('');case 'toLower':return a[0].toLowerCase();case 'trim':return a[0].trim();case 'first':return a[0][0]??null;
 case 'less':case 'lessOrEquals':case 'greater': assert.equal(typeof a[0],typeof a[1],'No local cross-type comparison coercion');return name==='less'?a[0]<a[1]:name==='lessOrEquals'?a[0]<=a[1]:a[0]>a[1];
 case 'ticks':assert.ok(Number.isFinite(Date.parse(a[0])),'Invalid source date');return Date.parse(a[0]);case 'int':assert.equal(typeof a[0],'string');assert.match(a[0],/^(0|[1-9][0-9]*)$/);assert.ok(Number.isSafeInteger(Number(a[0])));return Number(a[0]);case 'string':return String(a[0]);default:throw Error('UNKNOWN OPERATOR '+name);}}
 value(x){if(typeof x==='string')return x.startsWith('@')?this.expr(x.slice(1)):x;if(Array.isArray(x))return x.map(v=>this.value(v));if(x&&typeof x==='object')return Object.fromEntries(Object.entries(x).map(([k,v])=>[k,this.value(v)]));return x;}
 run(actions){const succeeded=new Set();for(const [name,a]of Object.entries(actions)){for(const predecessor of Object.keys(a.runAfter||{}))assert.ok(succeeded.has(predecessor),'Invalid local runAfter '+name);
 this.trace.push(name);try{switch(a.type){case 'ParseJson':{let content=this.value(a.inputs.content);if(typeof content==='string'){content=JSON.parse(content);if(name==='Parse_Admission')this.parseRaw++;}const validate=new Ajv({allErrors:true,coerceTypes:false,useDefaults:false,removeAdditional:false}).compile(a.inputs.schema);if(!validate(content))throw new Error('SCHEMA '+JSON.stringify(validate.errors));this.values[name]=content;break;}
 case 'Compose':this.values[name]=this.value(a.inputs);break;case 'If':this.run(this.value(a.expression)?a.actions:a.else.actions);break;
 case 'Query':{const previous=this.item;this.values[name]=this.value(a.inputs.from).filter(item=>{this.item=item;return this.expr(a.inputs.where.slice(1));});this.item=previous;break;}
 case 'Foreach':{const previous=this.item;for(const item of this.value(a.foreach)){this.item=item;this.loops[name]=item;this.run(a.actions);}this.item=previous;break;}
 case 'InitializeVariable':for(const v of a.inputs.variables)this.vars[v.name]=v.value;break;
 case 'Terminate':return {stopped:name};default:throw Error('UNKNOWN ACTION '+a.type);}
 succeeded.add(name);}catch(e){e.action=e.action||name;throw e;}}
 return {admission:this.values.Admission_Evidence};}
}
function inventory(product){const actions=product.properties.definition.actions,entries=[],names=new Set(),errors=[];
 function walk(group,depth){for(const [name,a]of Object.entries(group)){if(names.has(name))errors.push('duplicate '+name);names.add(name);entries.push({name,type:a.type,depth});for(const p of Object.keys(a.runAfter||{}))if(!Object.hasOwn(group,p))errors.push('runAfter '+p);if(a.actions)walk(a.actions,depth+1);if(a.else)walk(a.else.actions,depth+1);}}walk(actions,1);
 const strings=[];function walkValues(x){if(typeof x==='string'&&x.startsWith('@'))strings.push(x);else if(x&&typeof x==='object')Object.values(x).forEach(walkValues);}walkValues(product);
 for(const s of strings)for(const m of s.matchAll(/(?:body|outputs|items)\('([^']+)'\)/g))if(!names.has(m[1]))errors.push('reference '+m[1]);
 const result={count:entries.length,maxDepth:Math.max(...entries.map(x=>x.depth)),maxExpressionLength:Math.max(...strings.map(x=>x.length)),errors,entries,limitation:'Reference existence/local dependency checks, not native scope validation'};
 assert.deepEqual(errors,[]);assert.ok(result.count<=api.LIMITS.actions,'Action limit '+result.count);assert.ok(result.maxDepth<=api.LIMITS.nesting);assert.ok(result.maxExpressionLength<=api.LIMITS.expression);return result;
}
let factories,serialize;
const person='employee-1',cmd='cbfdcb28-41a2-4344-aa49-9deadbf379e0',key=person+'|2027',coreKey=key+'|CoreGold|KPI001';
const baseCore=()=>({kpiId:'KPI001',role:'DeliveryLead',contributionMethod:'AdditiveDirect',annualTargetValue:12,quarterTargets:['Q1','Q2','Q3','Q4'].map(quarter=>({quarter,targetValue:3})),displayOrder:0,activeInWorkplan:true});
function fixture(kind='present',input=baseCore(),token='4'){
 const request=kind==='create'?factories.createTestWorkplanDraftRequest(cmd,person):factories.createTestCoreRequest(cmd,person,token,'header-tag',{presence:kind==='present'?'Present':'Absent',...(kind==='present'?{etag:'item-tag'}:{})},input);
 const posted=JSON.parse(serialize(request,{clientVersion:'LOCAL-M153'},'2026-09-09T00:00:00Z'));
 const source={...posted,ID:77,Author:{Email:'employee@example.invalid'},Editor:{Email:'employee@example.invalid'},'{VersionNumber}':'1.0','@odata.etag':'source-tag',Created:'2026-09-09T00:00:00Z',Modified:'2026-09-09T00:00:00Z'};
 const headers=kind==='create'?[]:[{WorkplanKey:key,PersonKey:person,PerformanceYear:2027,WorkplanVersion:1,State:'Draft',TransitionStatus:'Ready',AccessState:'EmployeeEdit',RowVersionToken:Number(token),__metadata:{etag:'header-tag'},CoreCategoryWeight:70,PersonalCategoryWeight:20,BehaviourCategoryWeight:10,CoreWeightingMode:'Equal'}];
 const rows=kind==='present'?[{Id:88,WorkplanKey:key,PersonKey:person,PerformanceYear:2027,WorkplanVersion:1,WorkplanItemKey:coreKey,WorkplanItemNaturalKey:coreKey,__metadata:{etag:'item-tag'},RetainedFullField:'before'}]:[];
 return {context:{actorKey:person,actorEmail:'employee@example.invalid',year:2027,sourceId:77,sourceVersion:'1.0',sourceETag:'source-tag',reference:{kpiId:'KPI001'}},sourceA:source,sourceB:structuredClone(source),headers,rows};
}
function mutateWire(f,fn){const w=JSON.parse(f.sourceA.PayloadJSON);fn(w);f.sourceA.PayloadJSON=JSON.stringify(w);f.sourceB=structuredClone(f.sourceA);return f;}
function caseCheck(id,kind,change,expected,stopBeforeInt=false){if(compositionOnly&&!['CREATE','PRESENT','ABSENT'].includes(id))return;check(id,()=>{
 const f=change(fixture(kind)), fixtureArtifact=write('fixture-'+id+'.json',f);artifacts.push(fixtureArtifact);
 const proof=api.buildAdmissionProofDefinition(f), proofArtifact=write('proof-'+id+'.json',proof);artifacts.push(proofArtifact);
 const rt=new Runtime();let out,error;try{out=rt.run(proof.properties.definition.actions);}catch(e){error={action:e.action,message:e.message};}
 const trace={id,expected,actual:error?'REJECT':'ADMIT',error,actions:rt.trace,operators:[...rt.ops],rawParseCount:rt.parseRaw,fixture:fixtureArtifact,proof:proofArtifact};traces.push(trace);
 if(error&&/UNKNOWN|Unresolved reached|Invalid local/.test(error.message))throw Error(error.message);
 assert.equal(trace.actual,expected,JSON.stringify(error));if(stopBeforeInt)assert.equal(rt.trace.includes('Admitted_Token'),false);
 if(expected==='ADMIT'){assert.equal(rt.parseRaw,1);assert.equal(out.admission.rawPayload,f.sourceA.PayloadJSON);assert.deepEqual(out.admission.source.outer,f.sourceA);assert.deepEqual(out.admission.admittedWire.payload,JSON.parse(f.sourceA.PayloadJSON).payload);assert.deepEqual(out.admission.beforeRows,f.rows);}
 });}
async function main(){api=await import(pathToFileURL(path.join(__dirname,'c2a-definition.mjs')).href);
 if(textBoundaryOnly)return textBoundaryMain();
 const bytes=fs.readFileSync(outputPath,'utf8'), product=JSON.parse(bytes), flow=product.properties.definition.actions.Canonical_Process.actions;
 check('GENERATOR_PARITY',()=>assert.equal(bytes,JSON.stringify(api.buildC2aDefinition(),null,2)+'\n'));
 check('CANONICAL_GRAPH_BUDGETS',()=>inventories.push(inventory(product)));
 check('CANONICAL_NON_BYPASS',()=>{assert.deepEqual(product.properties.definition.triggers,{});assert.deepEqual(product.properties.connectionReferences,{});assert.equal(flow.C2B_Context.inputs.content,null);assert.deepEqual(product.properties.definition.actions.Canonical_Process.runAfter,{C2B_Absent_Stop:['Succeeded']});assert.throws(()=>api.buildC2aDefinition({enabled:true}));assert.equal(new Runtime().run(product.properties.definition.actions).stopped,'C2B_Absent_Stop');});
 check('ADMISSION_SCHEMA_NO_PATTERNS',()=>assert.equal(/"(?:pattern|patternProperties)"/.test(JSON.stringify(api.ADMISSION_SCHEMA)),false));
 check('SINGLE_RAW_AUTHORITY_PARSE',()=>{assert.equal(Object.values(flow).filter(a=>a.type==='ParseJson'&&String(a.inputs.content).includes("['rawPayload']")).length,1);assert.equal(JSON.stringify(flow.Source_A_Snapshot).includes('@json('),false);assert.ok(Object.keys(flow).indexOf('Source_Observations_Match')<Object.keys(flow).indexOf('Parse_Admission'));});
 check('ACTUAL_FACTORY_SERIALIZER_LOAD',()=>{factories=load(path.join(root,'src/webparts/performanceHub/services/TestPilotCommandWire.ts'));serialize=load(path.join(root,'src/webparts/performanceHub/services/EmployeeWorkplanV2CommandTransport.ts')).serializeEmployeeV2Command;assert.equal(typeof serialize,'function');});
 for(const kind of ['create','present','absent'])caseCheck(kind.toUpperCase(),kind,f=>f,'ADMIT');
 check('PROOF_SHARED_GRAPH_NO_EFFECT',()=>{const proof=api.buildAdmissionProofDefinition(fixture()), pa=proof.properties.definition.actions;inventories.push(inventory(proof));assert.ok(Object.keys(pa).every(n=>!n.startsWith('C2B_')),'Synthetic proof must not substitute missing C2b adapters');assert.deepEqual(pa.Admission_Context.inputs,"@body('Proof_Context')");assert.deepEqual(flow.Admission_Context.inputs,"@body('C2B_Context')");assert.deepEqual(proof.properties.definition.triggers,{});assert.deepEqual(proof.properties.connectionReferences,{});assert.ok(inventories[1].entries.every(a=>['ParseJson','Compose','If','Query','Foreach'].includes(a.type)));for(const name of ['Source_A_Snapshot','Source_B_Snapshot','Source_Observations_Match','Validate_Source','Immutable_Source','Source_Created_Ticks','Parse_Admission','Token_Digits','Token_Canonical','Token_Safe_Range','Token_Operation_Range','Admitted_Token','Token_Roundtrip','Command_GUID','Wire_Binding','Outer_Binding','Admission_Command','Admitted_Envelope']){const {runAfter:x,...left}=pa[name],{runAfter:y,...right}=flow[name];assert.deepEqual(left,right);}for(const name of Object.keys(pa).slice(Object.keys(pa).indexOf('Admission_Header_Count'))){const {runAfter:x,...left}=pa[name],{runAfter:y,...right}=flow[name];assert.deepEqual(left,JSON.parse(JSON.stringify(right).replaceAll("variables('Headers')","body('Proof_Headers')").replaceAll("variables('Before')","body('Proof_Rows')")));}});
 for(const [id,value]of [['NUMERIC',4],['FRACTION','4.0000000000000001'],['LEADING_ZERO','04'],['NEGATIVE','-1'],['EXPONENT','4e0'],['SPACE',' 4'],['FULLWIDTH','４'],['EMPTY',''],['NULL',null],['LONG','10000000000000000'],['MAX_EXHAUSTED','9007199254740990'],['UNSAFE','9007199254740992'],['UPDATE_ZERO','0']])caseCheck('TOKEN_'+id,'present',f=>mutateWire(f,w=>w.expected.header.token=value),'REJECT',true);
 caseCheck('MAX_ADMITTED','present',()=>fixture('present',baseCore(),'9007199254740989'),'ADMIT');
 caseCheck('CREATE_NONZERO','create',f=>mutateWire(f,w=>w.expected.header.token='1'),'REJECT',true);
 caseCheck('ESCAPED_DIGIT','present',f=>{f.sourceA.PayloadJSON=f.sourceA.PayloadJSON.replace('"token":"4"','"token":"\\u0034"');f.sourceB=structuredClone(f.sourceA);return f;},'ADMIT');
 for(const [id,change]of [
 ['HEADER_TAG',f=>mutateWire(f,w=>w.expected.header.etag='wrong')],['ITEM_TAG',f=>mutateWire(f,w=>w.expected.item.etag='header-tag')],['WILDCARD_HEADER',f=>mutateWire(f,w=>w.expected.header.etag='*')],['WILDCARD_ITEM',f=>mutateWire(f,w=>w.expected.item.etag='*')],
 ['ABSENT_WITH_ROW',f=>mutateWire(f,w=>w.expected.item={presence:'Absent'})],['PRESENT_WITHOUT_ROW',f=>{f.rows=[];return f;}],['HEADER_COLLISION',f=>{f.headers.push(structuredClone(f.headers[0]));return f;}],['ITEM_COLLISION',f=>{f.rows.push(structuredClone(f.rows[0]));return f;}],['KEY_COLLISION',f=>{f.rows[0].WorkplanItemNaturalKey+='other';return mutateWire(f,w=>w.expected.item={presence:'Absent'});}],['ITEM_OWNER',f=>{f.rows[0].PersonKey='other';return f;}],
 ['RAW_SECOND',f=>{f.sourceB.PayloadJSON+=' ';return f;}],['OUTER_SECOND',f=>{f.sourceB.ClientVersion='changed';return f;}],['SOURCE_VERSION',f=>{f.sourceA['{VersionNumber}']='2.0';f.sourceB=structuredClone(f.sourceA);return f;}],['SOURCE_DATE',f=>{f.sourceA.Created='bad';f.sourceA.Modified='bad';f.sourceB=structuredClone(f.sourceA);return f;}],['SOURCE_AUTHOR',f=>{f.sourceA.Author.Email='other@example.invalid';f.sourceB=structuredClone(f.sourceA);return f;}],
 ['OUTER_ACTOR',f=>{f.sourceA.PersonKey='other';f.sourceB=structuredClone(f.sourceA);return f;}],['NUMERIC_OUTER',f=>{f.sourceA.ExpectedRowVersionToken=4;f.sourceB=structuredClone(f.sourceA);return f;}],['OUTER_QUARTER',f=>{f.sourceA.Quarter='Q1';f.sourceB=structuredClone(f.sourceA);return f;}],['CORRELATION',f=>{f.sourceA.ClientCorrelationKey='other';f.sourceB=structuredClone(f.sourceA);return f;}],
 ['UNKNOWN_WIRE',f=>mutateWire(f,w=>w.extra=true)],['MISSING_WIRE',f=>mutateWire(f,w=>delete w.expected)],['OLD_NUMERIC_ENVELOPE',f=>{f.sourceA.PayloadJSON='{"expectedHeaderToken":4}';f.sourceB=structuredClone(f.sourceA);return f;}],['UNKNOWN_CORE',f=>mutateWire(f,w=>w.payload.grant='attacker')],['UNKNOWN_QUARTER',f=>mutateWire(f,w=>w.payload.quarterTargets[0].extra=true)],['MISSING_CORE',f=>mutateWire(f,w=>delete w.payload.role)],['DUPLICATE_QUARTER',f=>mutateWire(f,w=>w.payload.quarterTargets[0].quarter='Q2')],['MISSING_TARGET',f=>mutateWire(f,w=>delete w.payload.quarterTargets[0].targetValue)],['NUMBER_TYPE',f=>mutateWire(f,w=>w.payload.annualTargetValue='12')],['BAD_GUID',f=>mutateWire(f,w=>w.binding.commandKey='f8014c71-e2ba-4dd6-a175-b230991449c5')],['CROSS_SUBJECT',f=>mutateWire(f,w=>w.binding.subjectKey+='other')],['WRONG_YEAR',f=>mutateWire(f,w=>w.binding.performanceYear=2028)],['BAD_PERSON_CHAR',f=>mutateWire(f,w=>w.binding.personKey='employee 1')],['BAD_KPI_CHAR',f=>mutateWire(f,w=>w.payload.kpiId='KPI 1')],['NEG_DISPLAY',f=>mutateWire(f,w=>w.payload.displayOrder=-1)],['FRACTION_DISPLAY',f=>mutateWire(f,w=>w.payload.displayOrder=1.5)],['LONG_QUARTER',f=>mutateWire(f,w=>w.payload.quarterTargets[0].commitment='x'.repeat(256))]
 ])caseCheck(id,'present',change,'REJECT',id==='RAW_SECOND'||id==='OUTER_SECOND');
 caseCheck('OVERFLOW','present',f=>{f.sourceA.PayloadJSON=f.sourceA.PayloadJSON.replace('"annualTargetValue":12','"annualTargetValue":1e400');f.sourceB=structuredClone(f.sourceA);return f;},'REJECT');
 caseCheck('FULL_TEXT_NEGATIVE_FRACTION','present',()=>{const p=baseCore();p.annualTargetValue=-1.25;p.annualTargetText='e\u0301😀'.repeat(500);p.governanceReference='源'.repeat(500);p.displayOrder=1e20;p.quarterTargets[0]={...p.quarterTargets[0],targetValue:-0.125,targetText:'detail A',commitment:'detail B',successDefinition:'🎯'.repeat(500)};return fixture('present',p);},'ADMIT');
 for(const method of ['SharedTarget','WeightedDenominator','AccountableOwner','CompletionOversight']){
 const input=()=>{const p=baseCore();p.contributionMethod=method;p.role=method==='AccountableOwner'?'AccountableOwner':'DeliveryLead';p.annualTargetText='work';p.sharedTargetRule='ApprovedApportionment';p.sharedApportionmentPercent=12.5;p.governanceReference='ref';p.denominatorNumerator=-0.25;p.denominatorValue=2;p.denominatorUnit='ratio';p.denominatorRuleReference='rule';p.denominatorSourceReference='source';p.quarterTargets.forEach(q=>{q.commitment='Do';q.successDefinition='Done';});return p;};
 caseCheck('METHOD_'+method,'present',()=>fixture('present',input()),'ADMIT');
 caseCheck('METHOD_INVALID_'+method,'present',()=>mutateWire(fixture('present',input()),w=>{if(method==='SharedTarget')w.payload.sharedApportionmentPercent=0;else if(method==='WeightedDenominator')w.payload.denominatorValue=0;else if(method==='AccountableOwner')w.payload.role='Contributor';else w.payload.quarterTargets[0].commitment=' \t\n';}),'REJECT');
 caseCheck('INACTIVE_'+method,'present',()=>{const p=baseCore();p.activeInWorkplan=false;p.contributionMethod=method;delete p.annualTargetValue;p.quarterTargets=p.quarterTargets.map(q=>({quarter:q.quarter}));return fixture('present',p);},'ADMIT');}
 check('UNKNOWN_OPERATOR_FATAL',()=>assert.throws(()=>new Runtime().expr("notAnOperator('x')"),/UNKNOWN OPERATOR/));
 check('CLI_PROOF_EXACT_PARITY',()=>{const target=path.join(evidence,'cli-proof.json');const log=execFileSync(process.execPath,[path.join(__dirname,'build-c2a-definition.mjs'),'--proof',path.join(evidence,'fixture-PRESENT.json'),target],{encoding:'utf8',cwd:root});artifacts.push({path:target,bytes:fs.statSync(target).size,sha256:sha(fs.readFileSync(target))});assert.equal(fs.readFileSync(target,'utf8'),fs.readFileSync(path.join(evidence,'proof-PRESENT.json'),'utf8'));artifacts.push(write('cli-proof-command.json',{argv:[process.execPath,'build-c2a-definition.mjs','--proof','fixture-PRESENT.json',target],exit:0,stdout:log}));});
}
main().catch(e=>{process.exitCode=1;console.error(e.stack);}).finally(()=>{artifacts.push(write('03_FOCUSED_RESULT.json',{suite:textBoundaryOnly?'M179 targeted text boundary':'M153 emitted admission chain',results,counts:{PASS:results.filter(x=>x.status==='PASS').length,FAIL:results.filter(x=>x.status==='FAIL').length},traces,inventories,loadedSource:loaded,limitations:['Local WDL subset uses JS equality/trim/string ordering/JSON and AJV; native equivalence NOT_EXECUTED.','No connector, C2b, journal, canonical writes, grants, app entry or independent gate exercised.'],firstHardStop:results.find(x=>x.status==='FAIL')||null}));write('04_FIXTURE_PROOF_INDEX.json',{parentGeneratorSha256:sha(fs.readFileSync(path.join(__dirname,'c2a-definition.mjs'))),canonicalDefinitionSha256:sha(fs.readFileSync(outputPath)),artifacts,fixtures:traces.map(t=>({id:t.id,expected:t.expected,localActual:t.actual,fixture:t.fixture,proof:t.proof})),nativeExecuted:false});console.log(JSON.stringify({results,counts:{PASS:results.filter(x=>x.status==='PASS').length,FAIL:results.filter(x=>x.status==='FAIL').length}}));});
function textBoundaryMain(){
 const baselineRoot='C:/KCF/KPI/kcf-performance-hub-integrated-advance002-m153-admission-emitter';
 const current=JSON.parse(fs.readFileSync(outputPath,'utf8'));
 const baseline=JSON.parse(fs.readFileSync(path.join(baselineRoot,'power-platform/KCFKPIEmployeeTESTProcessor/Definitions/C2a.disabled.definition.json'),'utf8'));
 const oracleBytes=fs.readFileSync(path.join(evidence,'01_EXPECTED_TEXT_CASES.json'));
 const oracle=JSON.parse(oracleBytes);
 check('TEXT_ORACLE_AND_UNCHANGED_EVALUATOR',()=>{
  assert.equal(oracle.cases.length,17);
  const mine=fs.readFileSync(__filename,'utf8'),old=fs.readFileSync(path.join(baselineRoot,'scripts/kcf-kpi-test-employee/c2a-emitted-definition.test.cjs'),'utf8');
  const interpreter=s=>s.slice(s.indexOf('function parse(code)'),s.indexOf('function inventory(product)'));
  assert.equal(interpreter(mine),interpreter(old),'Do not alter correlated evaluator to manufacture length agreement');
  artifacts.push(write('text-oracle-provenance.json',{path:path.join(evidence,'01_EXPECTED_TEXT_CASES.json'),sha256:sha(oracleBytes),interpreterSha256:sha(Buffer.from(interpreter(mine))),interpreterUnchanged:true,oracle:oracle.oracle}));
 });
 check('TEXT_GENERATOR_PARITY',()=>assert.equal(fs.readFileSync(outputPath,'utf8'),JSON.stringify(api.buildC2aDefinition(),null,2)+'\n'));
 check('TEXT_EXACT_SEVEN_ACTION_DELTA',()=>{
  const prior=structuredClone(current),flow=prior.properties.definition.actions.Canonical_Process.actions,upsert=flow.Admission_Command.else.actions;
  const guard=upsert.Admission_Quarter_Text_Lengths;
  assert.equal(guard.type,'Foreach');assert.equal(guard.operationOptions,'Sequential');
  assert.deepEqual(guard.runAfter,{Admission_Core_Payload:['Succeeded']});
  assert.equal(guard.foreach,"@body('Parse_Admission')?['payload']?['quarterTargets']");
  assert.deepEqual(upsert.Admission_Core_Binding.runAfter,{Admission_Quarter_Text_Lengths:['Succeeded']});
  assert.equal(Object.hasOwn(upsert.Admission_Active_Core.actions,'Admission_Quarter_Text_Lengths'),false);
  for(const field of ['targetText','commitment']){
   const supplied=guard.actions['Admission_Has_'+field];
   assert.equal(supplied.expression,"@contains(item(),'"+field+"')");assert.deepEqual(supplied.else.actions,{});
   const requirement=supplied.actions['Admission_'+field+'_UTF16'];
   assert.equal(requirement.expression,"@lessOrEquals(length(item()?['"+field+"']),255)");
   assert.equal(requirement.else.actions['Admission_'+field+'_UTF16_Reject'].inputs.content,null);
  }
  delete upsert.Admission_Quarter_Text_Lengths;upsert.Admission_Core_Binding.runAfter={Admission_Core_Payload:['Succeeded']};
  assert.deepEqual(prior,baseline,'Only seven planned action definitions and following dependency may change');
  artifacts.push(write('text-exact-delta.json',{baselineSha256:sha(fs.readFileSync(path.join(baselineRoot,'power-platform/KCFKPIEmployeeTESTProcessor/Definitions/C2a.disabled.definition.json'))),currentSha256:sha(fs.readFileSync(outputPath)),onlyDeclaredSevenActions:true,guard}));
 });
 factories=load(path.join(root,'src/webparts/performanceHub/services/TestPilotCommandWire.ts'));
 serialize=load(path.join(root,'src/webparts/performanceHub/services/EmployeeWorkplanV2CommandTransport.ts')).serializeEmployeeV2Command;
 check('TEXT_GRAPH_LIMITS_AND_NO_EFFECTS',()=>{
  const proof=api.buildAdmissionProofDefinition(fixture('present'));
  const ci=inventory(current),pi=inventory(proof);inventories.push(ci,pi);
  assert.equal(ci.count,462);assert.equal(pi.count,126);
  assert.deepEqual(proof.properties.definition.actions.Admission_Command.else.actions.Admission_Quarter_Text_Lengths,current.properties.definition.actions.Canonical_Process.actions.Admission_Command.else.actions.Admission_Quarter_Text_Lengths);
  assert.equal(new Runtime().run(current.properties.definition.actions).stopped,'C2B_Absent_Stop');
  assert.deepEqual(current.properties.definition.triggers,{});assert.deepEqual(current.properties.connectionReferences,{});
  assert.deepEqual(current.properties.definition.actions.Canonical_Process.runAfter,{C2B_Absent_Stop:['Succeeded']});
  assert.throws(()=>api.buildC2aDefinition({enabled:true}));
  assert.deepEqual(proof.properties.definition.triggers,{});assert.deepEqual(proof.properties.connectionReferences,{});
  assert.ok(pi.entries.every(a=>['ParseJson','Compose','If','Query','Foreach'].includes(a.type)&&!a.name.startsWith('C2B_')));
 });
 for(const c of oracle.cases)check(c.id,()=>{
  const payload=baseCore();
  payload.quarterTargets.forEach(q=>{q.targetText='separate target';q.commitment='separate commitment';});
  if(c.field){payload.quarterTargets[c.quarterIndex??0][c.field]=c.value;}
  if(c.inactive)payload.activeInWorkplan=false;
  if(c.special==='absent')payload.quarterTargets.forEach(q=>{delete q.targetText;delete q.commitment;});
  if(c.special==='empty'){payload.activeInWorkplan=false;payload.quarterTargets.forEach(q=>{q.targetText='';q.commitment='';});}
  if(c.special==='uncapped'){payload.annualTargetText='\u{1F3CF}'.repeat(200);payload.quarterTargets.forEach(q=>q.successDefinition='\u{1F3CF}'.repeat(200));}
  let f,factoryError;try{f=fixture(c.itemState,payload);}catch(e){factoryError=e.message;}
  assert.equal(Boolean(factoryError),c.expected==='REJECT','Actual unchanged factory outcome must match independent expectation');
  if(factoryError){f=fixture(c.itemState);mutateWire(f,w=>{w.payload=payload;});}
  assert.deepEqual(f.sourceA,f.sourceB);
  const fixtureRecord=write('text-fixture-'+c.id+'.json',f),proof=api.buildAdmissionProofDefinition(f),proofRecord=write('text-proof-'+c.id+'.json',proof);artifacts.push(fixtureRecord,proofRecord);
  const rt=new Runtime();let result,error;
  try{result=rt.run(proof.properties.definition.actions);}catch(e){error={action:e.action,message:e.message};}
  const t={id:c.id,expected:c.expected,actual:error?'REJECT':'ADMIT',factoryRejected:Boolean(factoryError),factoryError,expectedUnits:c.expectedUnits,oracleCase:c,rawParseCount:rt.parseRaw,error,actions:rt.trace,fixture:fixtureRecord,proof:proofRecord};traces.push(t);
  if(error&&/UNKNOWN|Unresolved|Invalid local/.test(error.message))throw Error(error.message);
  assert.equal(t.actual,c.expected,JSON.stringify(error));assert.equal(rt.parseRaw,1);
  if(c.expected==='REJECT'){assert.equal(error.action,c.expectedStop);assert.equal(rt.trace.includes('Admitted_Envelope'),false);assert.equal(rt.trace.includes('Admission_Evidence'),false);}
  else {assert.deepEqual(result.admission.admittedWire.payload,payload);assert.equal(result.admission.rawPayload,f.sourceA.PayloadJSON);assert.deepEqual(result.admission.source.outer,f.sourceA);assert.deepEqual(result.admission.beforeRows,f.rows);}
 });
 check('TEXT_CLI_PROOF_PARITY',()=>{
  const file=path.join(evidence,'text-fixture-targetText_ASTRAL255.json'),target=path.join(evidence,'text-cli-proof.json');
  const argv=[path.join(__dirname,'build-c2a-definition.mjs'),'--proof',file,target];
  const output=execFileSync(process.execPath,argv,{cwd:root,encoding:'utf8'});
  assert.equal(fs.readFileSync(target,'utf8'),fs.readFileSync(path.join(evidence,'text-proof-targetText_ASTRAL255.json'),'utf8'));
  artifacts.push({path:target,bytes:fs.statSync(target).size,sha256:sha(fs.readFileSync(target))});
  artifacts.push(write('text-cli-command.json',{argv:[process.execPath,...argv],exit:0,stdout:output}));
 });
}
