'use strict';
// Build-time, connector-free proof fusion. Does not cache an admission result,
// alter a connector, accept a runtime plan or remove a schema/predicate.
const {nativeWdl:{SECURE}}=require('./build-flow.cjs');
const MAX_GROUP=8;
function fuseActorWriter(flow){
  const result=structuredClone(flow),referenced=new Set(['Storage_Verified','Existing_Rejected_Outcome','Rejected_Outcome']);
  const audit={normalisedFailureGuards:[],groups:[],originalParseJson:0},originalGroups=new Map();
  function refs(v){
    if(typeof v==='string'&&v.startsWith('@')){
      if(/\b(?:body|outputs|actions|result)\((?!')/.test(v))throw Error('FUSION_DYNAMIC_ACTION_REFERENCE');
      for(const match of v.matchAll(/\b(?:body|outputs|actions|result)\('([^']+)'\)/g))referenced.add(match[1]);
    }else if(v&&typeof v==='object')Object.values(v).forEach(refs);
  }refs(result);
  function anchored(v){return Boolean(v&&typeof v==='object'&&(Object.keys(v).some(k=>['$ref','$id','$schema','definitions'].includes(k))||Object.values(v).some(anchored)));}
  function eligible(name,a){
    return !referenced.has(name)&&a.type==='ParseJson'&&a.inputs&&a.inputs.schema&&typeof a.inputs.schema==='object'&&
      !anchored(a.inputs.schema)&&JSON.stringify(a.runtimeConfiguration)===JSON.stringify(SECURE)&&
      Object.keys(a).every(k=>['type','inputs','runtimeConfiguration','runAfter'].includes(k))&&
      Object.keys(a.inputs).every(k=>['content','schema'].includes(k));
  }
  function transform(actions,insideLoop=false){
    const entries=Object.entries(actions),normal=[];
    entries.forEach(([name,raw],index)=>{
      const expected=index?entries[index-1][0]:null,after=Object.entries(raw.runAfter||{});
      if(after.length!==Number(Boolean(expected))||after.some(([k,v])=>k!==expected||JSON.stringify(v)!=='["Succeeded"]'))throw Error('FUSION_NONSEQUENTIAL_SOURCE '+name);
      let a=raw;
      const failed=raw.type==='If'&&Object.keys(raw.actions||{}).length===0&&Object.values(raw.else?.actions||{});
      if(!referenced.has(name)&&typeof raw.expression==='string'&&failed&&failed.length===1&&failed[0].type==='Terminate'&&failed[0].inputs?.runStatus==='Failed'&&Object.keys(failed[0].runAfter||{}).length===0&&Object.keys(raw).every(k=>['type','expression','actions','else','runAfter','runtimeConfiguration'].includes(k))&&Object.keys(raw.else).every(k=>k==='actions')&&Object.keys(failed[0]).every(k=>['type','inputs','runAfter','runtimeConfiguration'].includes(k))&&(!raw.runtimeConfiguration||JSON.stringify(raw.runtimeConfiguration)===JSON.stringify(SECURE))){
        a={type:'ParseJson',inputs:{content:{valid:raw.expression},schema:{type:'object',additionalProperties:false,required:['valid'],properties:{valid:{type:'boolean',enum:[true]}}}},runtimeConfiguration:SECURE,runAfter:raw.runAfter};
        audit.normalisedFailureGuards.push({name,expression:raw.expression,failed:structuredClone(failed[0])});
      }else{
        if(raw.type==='ParseJson')audit.originalParseJson++;
        if(raw.actions)a={...a,actions:transform(raw.actions,insideLoop||raw.type==='Foreach')};
        if(raw.else)a={...a,else:{...raw.else,actions:transform(raw.else.actions,insideLoop)}};
      }
      normal.push([name,a]);
    });
    const out={};let pending=[];
    function flush(){
      if(!pending.length)return;
      if(pending.length===1){const [name,a]=pending[0];out[name]=a;pending=[];return;}
      const name=pending[pending.length-1][0],before=pending[0][1].runAfter;
      const children={};let previous;
      pending.forEach(([,a],i)=>{const key=name+'_F'+i;children[key]={...a,runAfter:previous?{[previous]:['Succeeded']}:{} };previous=key;});
      // Preserve native ParseJson actions in sequence. A wrapper schema would
      // eagerly evaluate later predicates BEFORE an earlier size/type failure.
      // The Scope saves dispatch/capture overhead without that semantic change.
      out[name]={type:'Scope',actions:children,runtimeConfiguration:SECURE,runAfter:before};
      originalGroups.set(name,structuredClone(pending));
      audit.groups.push({name,mode:'ordered-native-scope',source:pending.map(([key,a],i)=>({name:key,child:name+'_F'+i,inputs:structuredClone(a.inputs)}))});pending=[];
    }
    for(const [name,a]of normal){
      if(!insideLoop&&eligible(name,a)){pending.push([name,a]);if(pending.length===MAX_GROUP)flush();}
      else{flush();out[name]=a;}
    }flush();
    // A following action depended on the last source guard, whose name remains.
    // Assert exact sequential success dependencies after every merge.
    let previous;for(const [name,a]of Object.entries(out)){
      const expected=previous?{[previous]:['Succeeded']}:{};
      if(JSON.stringify(a.runAfter||{})!==JSON.stringify(expected))throw Error('FUSION_BROKEN_DEPENDENCY '+name);
      previous=name;
    }
    return out;
  }
  result.properties.definition.actions.Process.actions=transform(result.properties.definition.actions.Process.actions);
  // Group only recurrent proof shapes. Grouping one-off pairs saves runtime
  // scaffolding but unnecessarily duplicates native definition templates.
  function signature(group){
    const refs=[],local=new Map([[group.name,'ROOT']]);group.source.forEach((p,i)=>local.set(p.child,'I'+i));
    function visit(v){
      if(typeof v==='string')return v.replace(/\b(body|outputs|items)\('([^']+)'\)/g,(_,fn,name)=>{
        if(local.has(name))return `${fn}('${local.get(name)}')`;
        let i=refs.indexOf(name);if(i<0){i=refs.length;refs.push(name);}return `${fn}('E${i}')`;
      });
      if(Array.isArray(v))return v.map(visit);
      if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)]));return v;
    }
    return JSON.stringify(group.source.map(x=>visit(x.inputs)));
  }
  const frequencies=new Map();audit.groups.forEach(g=>{g.signature=signature(g);frequencies.set(g.signature,(frequencies.get(g.signature)||0)+1);});
  const selected=new Set();audit.groups.forEach(g=>{g.frequency=frequencies.get(g.signature);g.selected=g.frequency>=8;if(g.selected)selected.add(g.name);delete g.signature;});
  function choose(actions){
    const out={};for(const [name,a]of Object.entries(actions)){
      if(originalGroups.has(name)&&!selected.has(name)){for(const [key,value]of originalGroups.get(name))out[key]=value;continue;}
      const copy={...a};if(copy.actions)copy.actions=choose(copy.actions);if(copy.else)copy.else={...copy.else,actions:choose(copy.else.actions)};out[name]=copy;
    }return out;
  }
  result.properties.definition.actions.Process.actions=choose(result.properties.definition.actions.Process.actions);
  audit.selectedGroups=selected.size;
  return {flow:result,audit};
}
module.exports={fuseActorWriter};
