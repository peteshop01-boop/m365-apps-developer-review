'use strict';
// SOURCE-ONLY lowering of the reviewed, expanded writer. The instruction table
// is generated from source, never from a request, list, binding or HTTP result.
// No arbitrary-expression evaluator or generic request-supplied HTTP action.
const crypto=require('node:crypto');
const {nativeWdl:n}=require('./build-flow.cjs');
const {SECURE}=n;
const STATE='d01MachineState',PC='d01MachinePC',INS='d01MachineInstruction',VALUE='d01MachineValue',NEXT='d01MachineNext';
function lowerActorWriter(flow){
  const result=structuredClone(flow),process=result.properties.definition.actions.Process;
  const instructions=[],templates=[],byHash=new Map(),traceNames=[],referenced=new Set(['Storage_Verified','Existing_Rejected_Outcome','Rejected_Outcome']);
  function references(value){if(typeof value==='string'&&value.startsWith('@'))for(const match of value.matchAll(/\b(?:body|outputs)\('([^']+)'\)/g))referenced.add(match[1]);else if(value&&typeof value==='object')for(const child of Object.values(value))references(child);}
  references(process.actions);
  // Atomic Scope/Foreach children execute locally, and are never captured in
  // the machine's outer state. Reject any future source consumer escaping that
  // boundary instead of silently replacing its output with a missing value.
  const owners=new Map();
  function qualify(actions,atomic){
    let previous;
    for(const [name,a]of Object.entries(actions)){
      const after=Object.entries(a.runAfter||{});
      if(after.length!==Number(Boolean(previous))||after.some(([key,status])=>key!==previous||JSON.stringify(status)!=='["Succeeded"]'))throw Error('MACHINE_NONSEQUENTIAL_SOURCE '+name);
      if(owners.has(name))throw Error('MACHINE_DUPLICATE_SOURCE_ACTION '+name);
      owners.set(name,atomic||name);
      if(atomic&&a.type==='Terminate')throw Error('MACHINE_NESTED_TERMINATE '+name);
      const childOwner=atomic||(['Scope','Foreach'].includes(a.type)?name:undefined);
      if(a.actions)qualify(a.actions,childOwner);
      if(a.else?.actions)qualify(a.else.actions,childOwner);
      previous=name;
    }
  }
  qualify(process.actions);
  function template(sourceName,source){
    const local=new Map(),refs=[];
    function names(name,a){local.set(name,'LOCAL_'+local.size);for(const [k,v]of Object.entries(a.actions||{}))names(k,v);for(const [k,v]of Object.entries(a.else?.actions||{}))names(k,v);}
    names(sourceName,source);
    function expression(value){
      if(/\b(?:body|outputs|actions|result)\s*\((?!')/.test(value)||/\b(?:body|outputs)\s+\(/.test(value)||/\b(?:actions|result)\s*\(/.test(value))throw Error('MACHINE_UNSUPPORTED_ACTION_REFERENCE');
      return value.replace(/\b(body|outputs)\('([^']+)'\)/g,(_,fn,name)=>{
        if(local.has(name))return `${fn}('${local.get(name)}')`;
        let slot=refs.indexOf(name);if(slot<0){slot=refs.length;refs.push(name);}
        const read=`variables('${STATE}')?[variables('${INS}')?['refs']?[${slot}]]`;
        return fn==='body'?read+"?['body']":read;
      }).replace(/\bitems\('([^']+)'\)/g,(_,name)=>{
        if(!local.has(name))throw Error('MACHINE_EXTERNAL_LOOP_REFERENCE '+name);
        return `items('${local.get(name)}')`;
      });
    }
    function rewrite(v){
      if(typeof v==='string')return v.startsWith('@')?expression(v):v;
      if(Array.isArray(v))return v.map(rewrite);
      if(!v||typeof v!=='object')return v;
      const out={};for(const [key,value]of Object.entries(v)){
        if(key==='runAfter')out[key]=Object.fromEntries(Object.entries(value).map(([k,x])=>{if(!local.has(k))throw Error('MACHINE_EXTERNAL_DEPENDENCY');return [local.get(k),x];}));
        else if(key==='actions')out[key]=Object.fromEntries(Object.entries(value).map(([k,x])=>[local.get(k),rewrite(x)]));
        else out[key]=rewrite(value);
      }return out;
    }
    const raw=structuredClone(source);delete raw.runAfter;
    const normalized=rewrite(raw),key=crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    let index=byHash.get(key);if(index===undefined){index=templates.length;templates.push(normalized);byHash.set(key,index);}
    return {template:index,refs,sourceNames:[...local.keys()]};
  }
  function compile(actions,next){
    let entry=next;
    for(const [name,source]of Object.entries(actions).reverse()){
      // Existing generator emits sequential success dependencies. Reject a
      // future parallel/recovery graph rather than silently changing semantics.
      const keys=Object.keys(actions),position=keys.indexOf(name),expected=position?keys[position-1]:null;
      const after=Object.entries(source.runAfter||{});
      if(after.length!==Number(Boolean(expected))||after.some(([key,status])=>key!==expected||JSON.stringify(status)!=='["Succeeded"]'))throw Error('MACHINE_NONSEQUENTIAL_SOURCE '+name);
      let node=source,branch={};
      if(source.type==='Foreach'){
        const literal=/^@json\('([^']+)'\)$/.exec(source.foreach);
        if(!literal)throw Error('MACHINE_NONLITERAL_OUTER_LOOP '+name);
        const resources=JSON.parse(literal[1]);
        if(!Array.isArray(resources)||!resources.length||resources.length>9||new Set(resources).size!==resources.length||resources.some(x=>!['requests','operations','results','audit','expenses','claims','people','months','nominals'].includes(x)))throw Error('MACHINE_UNQUALIFIED_RESOURCE_LOOP');
        branch.resources=resources;node={...source,foreach:`@variables('${INS}')?['resources']`};
      }
      if(source.type==='If'){
        const yes=compile(source.actions,entry),no=compile(source.else?.actions||{},entry);
        branch={yes,no};
        // These are source-fixed next addresses, not Boolean permission flags.
        node={type:'If',expression:source.expression,
          actions:{Yes:{type:'SetVariable',inputs:{name:NEXT,value:`@variables('${INS}')?['yes']`},runAfter:{}}},
          else:{actions:{No:{type:'SetVariable',inputs:{name:NEXT,value:`@variables('${INS}')?['no']`},runAfter:{}}}}};
      }
      if(source.type==='Terminate'){
        if(source.inputs.runStatus==='Succeeded'){
          node={type:'Compose',inputs:{},runtimeConfiguration:SECURE};entry=-1;
        }else{
        if(source.inputs.runStatus!=='Failed')throw Error('MACHINE_UNSUPPORTED_TERMINATION');
        // Native Terminate is forbidden inside Until. ParseJson failure retains
        // fail-closed scope propagation; the source step key identifies it.
        node={type:'ParseJson',inputs:{content:false,schema:{type:'boolean',enum:[true]}},runtimeConfiguration:SECURE};
        }
      }
      const {sourceNames,...lowered}=template(name,node),address=instructions.length;
      const store=referenced.has(name);
      instructions.push({key:name,...lowered,...branch,store,next:entry});entry=address;
      traceNames.push(sourceNames);
    }
    return entry;
  }
  const entry=compile(process.actions,-1);
  for(const step of instructions)for(const ref of step.refs){
    if(owners.has(ref)&&owners.get(ref)!==ref)throw Error('MACHINE_UNEXPORTED_ACTION_REFERENCE '+ref);
  }
  if(instructions.length>5000)throw Error('MACHINE_NATIVE_ITERATION_LIMIT');
  for(const [index,step]of instructions.entries())for(const name of ['next','yes','no']){
    if(step[name]!==undefined&&(!Number.isInteger(step[name])||step[name]<-1||step[name]>=index))throw Error('MACHINE_NONFORWARD_ADDRESS');
  }
  // Numeric addresses strictly decrease. Retire each captured value only after
  // its last possible source consumer, including skipped-branch intervals.
  // This prevents repeated canonical/receipt snapshots accumulating forever.
  const lastUse=new Map(['Storage_Verified','Existing_Rejected_Outcome','Rejected_Outcome'].map(k=>[k,-1])),predecessors=new Map();
  instructions.forEach((step,index)=>{
    for(const ref of step.refs)lastUse.set(ref,Math.min(lastUse.get(ref)??index,index));
    for(const edge of ['next','yes','no'])if(step[edge]>=0)predecessors.set(step[edge],Math.max(predecessors.get(step[edge])??-1,index));
  });
  predecessors.set(entry,instructions.length);
  instructions.forEach((step,index)=>{
    const before=predecessors.get(index)??index;
    step.drop=[...lastUse].filter(([,end])=>end>=index&&end<before).map(([key])=>key);
  });
  // Canonical local names become globally unique native action names only
  // after deduplication. All refs internal to a Foreach stay iteration-local.
  function materialize(v,prefix){
    if(typeof v==='string')return v.replace(/\b(body|outputs|items)\('(LOCAL_\d+)'\)/g,(_,fn,key)=>`${fn}('${prefix}_${key}')`);
    if(Array.isArray(v))return v.map(x=>materialize(x,prefix));
    if(!v||typeof v!=='object')return v;
    return Object.fromEntries(Object.entries(v).map(([k,x])=>[
      k,
      k==='actions'||k==='runAfter'?Object.fromEntries(Object.entries(x).map(([name,a])=>[prefix+'_'+name,materialize(a,prefix)])):materialize(x,prefix)
    ]));
  }
  const failure=name=>({[name]:{type:'ParseJson',inputs:{content:false,schema:{type:'boolean',enum:[true]}},runtimeConfiguration:SECURE,runAfter:{}}});
  const groups={};templates.forEach((raw,index)=>{
    const group=Math.floor(index/25),prefix='D01T'+index,actionName=prefix+'_LOCAL_0';
    const action=materialize(raw,prefix);action.runAfter={};
    const save=prefix+'_Value';
    // Only the action in THIS selected case supplies the fresh step output.
    // Never consult a skipped/previous-iteration action's outputs.
    const value=raw.type==='If'?{}:`@outputs('${actionName}')`;
    const capture=instructions.some(step=>step.template===index&&step.store);
    const actions={[actionName]:action,...(capture?{[save]:{type:'SetVariable',inputs:{name:VALUE,value:{value}},runtimeConfiguration:SECURE,runAfter:{[actionName]:['Succeeded']}}}:{})};
    (groups[group]??={})['Case_'+index]={case:index,actions};
  });
  if(Object.keys(groups).length>25)throw Error('MACHINE_TOO_MANY_TEMPLATE_GROUPS '+templates.length);
  const dispatch={type:'Switch',expression:`@div(variables('${INS}')?['template'],25)`,cases:Object.fromEntries(Object.entries(groups).map(([key,cases])=>['Group_'+key,{case:Number(key),actions:{['D01Group_'+key]:{type:'Switch',expression:`@variables('${INS}')?['template']`,cases,default:{actions:failure('D01UnknownTemplate_'+key)},runAfter:{}}}}])),default:{actions:failure('D01UnknownGroup')},runAfter:{D01Instruction:['Succeeded']}};
  const updates={
      D01UpdatedState:{type:'Compose',inputs:`@if(variables('${INS}')?['store'],setProperty(variables('${STATE}'),variables('${INS}')?['key'],variables('${VALUE}')?['value']),variables('${STATE}'))`,runtimeConfiguration:SECURE,runAfter:{}},
      D01StoreState:{type:'SetVariable',inputs:{name:STATE,value:"@outputs('D01UpdatedState')"},runtimeConfiguration:SECURE,runAfter:{D01UpdatedState:['Succeeded']}},
      // A skipped source branch never produced its output slots. Do not issue
      // retirement writes for those absent values at a join.
      D01LiveRetire:{type:'Query',inputs:{from:`@variables('${INS}')?['drop']`,where:`@contains(variables('${STATE}'),item())`},runtimeConfiguration:SECURE,runAfter:{D01StoreState:['Succeeded']}},
      D01Retire:{type:'Foreach',foreach:"@body('D01LiveRetire')",actions:{
        D01Retired:{type:'Compose',inputs:`@removeProperty(variables('${STATE}'),items('D01Retire'))`,runtimeConfiguration:SECURE,runAfter:{}},
        D01SaveRetired:{type:'SetVariable',inputs:{name:STATE,value:"@outputs('D01Retired')"},runtimeConfiguration:SECURE,runAfter:{D01Retired:['Succeeded']}}
      },runtimeConfiguration:{...SECURE,concurrency:{repetitions:1}},runAfter:{D01LiveRetire:['Succeeded']}}
  };
  const step={
      D01Instruction:{type:'SetVariable',inputs:{name:INS,value:`@outputs('D01Program')?[variables('${PC}')]`},runtimeConfiguration:SECURE,runAfter:{}},
      D01Dispatch:dispatch,
      D01Update:{type:'If',expression:`@or(variables('${INS}')?['store'],not(empty(variables('${INS}')?['drop'])))`,actions:updates,else:{actions:{}},runtimeConfiguration:SECURE,runAfter:{D01Dispatch:['Succeeded']}},
      // Only source branches use NEXT, and the selected case writes it in THIS
      // iteration. Ordinary steps use their immutable direct successor.
      D01Advance:{type:'SetVariable',inputs:{name:PC,value:`@if(contains(variables('${INS}'),'yes'),variables('${NEXT}'),variables('${INS}')?['next'])`},runtimeConfiguration:SECURE,runAfter:{D01Update:['Succeeded']}}
  };
  const actions={
    D01Program:{type:'Compose',inputs:instructions,runtimeConfiguration:SECURE,runAfter:{}},
    D01Machine:{type:'Until',expression:`@less(variables('${PC}'),0)`,limit:{count:5000,timeout:'PT1H'},operationOptions:'FailWhenLimitsReached',actions:{
      D01Step:{type:'Scope',actions:step,runAfter:{}},
      // An Until can repeat a failed iteration. Set a terminal failure address
      // on ANY failed step so a lost POST acknowledgement is never retried.
      D01StopFailed:{type:'SetVariable',inputs:{name:PC,value:-2},runtimeConfiguration:SECURE,runAfter:{D01Step:['Failed','TimedOut']}}
    },runAfter:{D01Program:['Succeeded']}},
    D01Completed:{type:'ParseJson',inputs:{content:`@variables('${PC}')`,schema:{type:'integer',enum:[-1]}},runtimeConfiguration:SECURE,runAfter:{D01Machine:['Succeeded']}},
    D01MachineResult:{type:'Compose',inputs:`@variables('${STATE}')`,runtimeConfiguration:SECURE,runAfter:{D01Completed:['Succeeded']}}
  };
  if(result.properties.definition.actions.Initialise.inputs.variables.some(v=>[STATE,PC,INS,VALUE,NEXT].includes(v.name)))throw Error('MACHINE_VARIABLE_COLLISION');
  result.properties.definition.actions.Initialise.inputs.variables.push(
    {name:STATE,type:'object',value:{}},{name:PC,type:'integer',value:entry},{name:INS,type:'object',value:{}},{name:VALUE,type:'object',value:{}},{name:NEXT,type:'integer',value:-1});
  process.actions=actions;
  return {flow:result,instructions:instructions.length,templates:templates.length,entry,traceNames};
}
function buildActorWriterMachine(){
  const fused=require('./actor-writer-proof-fusion.cjs').fuseActorWriter(require('./actor-writer.cjs').buildActorProcessorFlow());
  return {...lowerActorWriter(fused.flow),fusion:fused.audit};
}
module.exports={lowerActorWriter,buildActorWriterMachine};
