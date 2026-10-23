'use strict';
// Local test interpreter for the emitted WDL, NOT a Power Automate runtime or
// tenant acceptance. Executes the JSON graph itself, never the TS processor.
const assert=require('node:assert/strict');
const Ajv=require('ajv');
class End extends Error { constructor(status,code){super(code||status);this.status=status;this.code=code;} }
function parse(source) {
  let i=source.startsWith('@')?1:0;
  const space=()=>{while(/\s/.test(source[i]||'') && i<source.length)i++;};
  function value(){space();let n;
    if(source[i]==="'"){i++;let s='';while(i<source.length){if(source[i]==="'"){i++;if(source[i]==="'"){s+="'";i++;continue;}break;}s+=source[i++];}n={literal:s};}
    else if(/[0-9-]/.test(source[i])){const m=/^-?\d+(?:\.\d+)?/.exec(source.slice(i));i+=m[0].length;n={literal:Number(m[0])};}
    else {const m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i));if(!m)throw Error('WDL_PARSE '+source.slice(i,i+35));i+=m[0].length;space();
      if(source[i]==='('){i++;const args=[];space();while(source[i]!==')'){args.push(value());space();if(source[i]===','){i++;continue;}if(source[i]!==')')throw Error('WDL_ARGUMENT '+source.slice(i));}i++;n={call:m[0],args};}
      else if(['true','false','null'].includes(m[0]))n={literal:JSON.parse(m[0])};else throw Error('WDL_SYMBOL '+m[0]);
    }
    space();while(source[i]==='?'||source[i]==='['){if(source[i]==='?')i++;if(source[i++]!=='[')throw Error('WDL_PROPERTY');const k=value();if(source[i++]!==']')throw Error('WDL_PROPERTY_END');n={get:n,key:k};space();}return n;
  }
  const result=value();space();if(i!==source.length)throw Error('WDL_TRAILING '+source.slice(i));return result;
}
const equal=require('node:util').isDeepStrictEqual;
// Microsoft explicitly documents equals(true,1) => true. This targeted native
// counterexample must not be hidden by Node's strict type equality. Other WDL
// coercions still require native qualification; this is not a full runtime.
const wdlEquals=(a,b)=>equal(a,b)||(a===true&&b===1)||(a===1&&b===true);
const unique=a=>a.filter((v,i)=>a.findIndex(w=>equal(v,w))===i);
const text=x=>x===null||x===undefined?'':typeof x==='string'?x:JSON.stringify(x);
function evaluate(tree,ctx) {
  if(Object.hasOwn(tree,'literal'))return tree.literal;
  if(tree.get)return evaluate(tree.get,ctx)?.[evaluate(tree.key,ctx)]??null;
  const name=tree.call;
  if(name==='if')return evaluate(tree.args[evaluate(tree.args[0],ctx)?1:2],ctx);
  const a=tree.args.map(v=>evaluate(v,ctx));
  const f={parameters:k=>ctx.parameters[k],outputs:k=>ctx.outputs[k]??null,body:k=>ctx.outputs[k]?.body??null,variables:k=>ctx.variables[k],triggerBody:()=>ctx.trigger,item:()=>ctx.item,items:k=>{if(!Object.hasOwn(ctx.items||{},k))throw Error('LOOP_ITEM_SCOPE');return ctx.items[k];},
    equals:wdlEquals,and:(...x)=>x.every(Boolean),or:(...x)=>x.some(Boolean),not:x=>!x,length:x=>x.length,empty:x=>x===null||x===undefined||x===''||x.length===0,
    createArray:(...x)=>x,union:(a,b)=>unique(a.concat(b)),intersection:(a,b)=>unique(a.filter(v=>b.some(w=>equal(v,w)))),toLower:x=>x.toLowerCase(),
    // Only the documented, explicitly in-range ACL projection subset is used.
    // This interpreter is not a native/runtime or general coercion oracle.
    take:(x,n)=>{if(!(Array.isArray(x)||typeof x==='string')||!Number.isInteger(n)||n<1||n>x.length)throw Error('ONLY_IN_RANGE_TAKE_MODELLED');return x.slice(0,n);},
    join:(x,separator)=>{if(!Array.isArray(x)||x.some(v=>typeof v!=='string')||typeof separator!=='string')throw Error('ONLY_STRING_JOIN_MODELLED');return x.join(separator);},
    greater:(a,b)=>a>b,greaterOrEquals:(a,b)=>a>=b,less:(a,b)=>a<b,lessOrEquals:(a,b)=>a<=b,startsWith:(s,p)=>s.toLowerCase().startsWith(p.toLowerCase()),endsWith:(s,p)=>s.toLowerCase().endsWith(p.toLowerCase()),
    int:x=>{if(!/^-?\d+$/.test(String(x)))throw Error('NATIVE_INT');return Number(x);},float:x=>new Number(x),concat:(...x)=>x.join(''),string:text,
    // Preserve explicit WDL float type through division; integer-only div
    // truncates. Boxed numbers never enter the fake transport after division.
    sub:(a,b)=>a-b,add:(a,b)=>a+b,mul:(a,b)=>a*b,div:(a,b)=>a instanceof Number||b instanceof Number?a/b:Math.trunc(a/b),mod:(a,b)=>a%b,
    base64:x=>Buffer.isBuffer(x)?x.toString('base64'):Buffer.from(x,'utf8').toString('base64'),base64ToBinary:x=>Buffer.from(x,'base64'),base64ToString:x=>Buffer.from(x,'base64').toString('utf8'),
    json:JSON.parse,substring:(s,start,len)=>{if(start+len>s.length)throw Error('SUBSTRING_BOUNDS');return s.slice(start,start+len);},trim:x=>x.trim(),first:x=>x[0],last:x=>x[x.length-1],split:(s,d)=>s.split(d),
    contains:(a,b)=>typeof a==='string'||Array.isArray(a)?a.includes(b):Object.hasOwn(a,b),coalesce:(...x)=>x.find(v=>v!==null&&v!==undefined),uriComponent:encodeURIComponent,
    removeProperty:(o,k)=>Object.fromEntries(Object.entries(o).filter(([n])=>n!==k)),setProperty:(o,k,v)=>({...o,[k]:v}),formatNumber:(n,p)=>n.toFixed((p.split('.')[1]||'').length),
    ticks:s=>{const n=Date.parse(s);if(!Number.isFinite(n))throw Error('INVALID_TIMESTAMP');return BigInt(n)*10000n+621355968000000000n;},
    formatDateTime:(s,format)=>{const d=new Date(s);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error('INVALID_DATE');return format==='dd-MM-yyyy'?s.split('-').reverse().join('-'):d.toISOString();}
  };
  if(!f[name])throw Error('UNSUPPORTED_WDL_FUNCTION '+name);return f[name](...a);
}
function resolve(v,ctx){if(typeof v==='string'&&v.startsWith('@'))return evaluate(parse(v),ctx);if(Array.isArray(v))return v.map(x=>resolve(x,ctx));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x,ctx)]));return v;}
class Harness {
  constructor(flow,bindings,transport,options={}){this.flow=flow;this.transport=transport;this.foreachLimits=options.foreachLimits||{};this.ctx={parameters:{Bindings:bindings,$authentication:{}},outputs:{},variables:{},trigger:{}};this.visited=[];this.errors=[];this.ajv=new Ajv({allErrors:true,strict:false});}
  async run(trigger){this.ctx.trigger=trigger;try{await this.actions(this.flow.properties.definition.actions);return {state:'Succeeded',outputs:this.ctx.outputs};}catch(e){return {state:e instanceof End?e.status:'Failed',code:e.code||e.message,outputs:this.ctx.outputs};}}
  async actions(actions){const states={};let failed=false;
    for(const [name,a] of Object.entries(actions)){
      if(!Object.entries(a.runAfter||{}).every(([p,status])=>status.includes(states[p]))){states[name]='Skipped';continue;}
      this.visited.push(name);
      try{
        const input=()=>resolve(a.inputs,this.ctx);let output;
        switch(a.type){
          case 'Compose':output=input();break;
          case 'ParseJson':{const v=input();if(!this.ajv.validate(v.schema,v.content))throw Error('PARSE_JSON_SCHEMA');output={body:v.content};break;}
          case 'InitializeVariable':for(const v of input().variables)this.ctx.variables[v.name]=v.value;output={};break;
          case 'SetVariable':{const v=input();this.ctx.variables[v.name]=v.value;output={};break;}
          case 'If':await this.actions(resolve(a.expression,this.ctx)?a.actions:a.else.actions);output={};break;
          case 'Switch':{
            const value=resolve(a.expression,this.ctx),selected=Object.values(a.cases).find(c=>equal(c.case,value));
            await this.actions(selected?selected.actions:a.default.actions);output={};break;
          }
          case 'Until':{
            if(!Number.isInteger(a.limit?.count)||a.limit.count<1||a.limit.count>5000||a.operationOptions!=='FailWhenLimitsReached')throw Error('BOUNDED_UNTIL_REQUIRED');
            let complete=false;
            for(let iteration=0;iteration<a.limit.count;iteration++){
              try{await this.actions(a.actions);}catch(e){if(e instanceof End)throw e;}
              if(resolve(a.expression,this.ctx)){complete=true;break;}
            }
            if(!complete)throw Error('UNTIL_LIMIT');output={};break;
          }
          case 'Scope':await this.actions(a.actions);output={};break;
          case 'Terminate':{const v=input();throw new End(v.runStatus,v.runError?.code);}
          case 'Select':{const from=resolve(a.inputs.from,this.ctx);output={body:from.map(item=>resolve(a.inputs.select,{...this.ctx,item}))};break;}
          case 'Query':{const from=resolve(a.inputs.from,this.ctx);output={body:from.filter(item=>resolve(a.inputs.where,{...this.ctx,item}))};break;}
          case 'Foreach':{
            if(a.runtimeConfiguration?.concurrency?.repetitions!==1)throw Error('ONLY_SEQUENTIAL_FOREACH_MODELLED');
            const cap=this.foreachLimits[name]??200;if(!Number.isInteger(cap)||cap<1||cap>5000)throw Error('INVALID_FOREACH_MODEL_BOUND');
            const values=resolve(a.foreach,this.ctx);if(!Array.isArray(values)||values.length>cap)throw Error('BOUNDED_FOREACH_REQUIRED');
            const previous=this.ctx.items;let iterationFailed=false;
            try{for(const item of values){this.ctx.items={...previous,[name]:item};try{await this.actions(a.actions);}catch(e){if(e instanceof End)throw e;iterationFailed=true;}}}
            finally{this.ctx.items=previous;}
            if(iterationFailed)throw Error('FOREACH_FAILED');output={};break;
          }
          case 'OpenApiConnection':output=await this.transport(input(),name);break;
          default:throw Error('UNSUPPORTED_ACTION '+a.type);
        }
        this.ctx.outputs[name]=output;states[name]='Succeeded';
      }catch(e){if(e instanceof End)throw e;states[name]='Failed';this.errors.push({name,error:e.message});failed=true;}
    }
    if(failed)throw Error('SCOPE_FAILED');
  }
}
function validateGraph(flow){let count=0,depth=0;const names=new Set(),refs=[];const expressionLengths=[];
  function walk(a,d){depth=Math.max(depth,d);for(const [name,node]of Object.entries(a)){assert(name.length<=80);assert(!names.has(name),'duplicate name '+name);names.add(name);count++;
    for(const p of Object.keys(node.runAfter||{}))assert(Object.hasOwn(a,p),'cross-scope runAfter '+p);
    if(node.type==='OpenApiConnection'){assert.equal(node.inputs.host.apiId,'/providers/Microsoft.PowerApps/apis/shared_sharepointonline');assert.equal(node.inputs.retryPolicy.type,'none');assert.deepEqual(node.runtimeConfiguration.secureData.properties,['inputs','outputs']);}
    function strings(v){if(typeof v==='string'&&v.startsWith('@')){parse(v);expressionLengths.push(v.length);for(const m of v.matchAll(/(?:body|outputs)\('([^']+)'\)/g))refs.push(m[1]);}else if(v&&typeof v==='object')Object.values(v).forEach(strings);}
    strings(node.inputs);if(node.expression)strings(node.expression);if(node.foreach)strings(node.foreach);
    if(node.actions)walk(node.actions,d+1);if(node.else)walk(node.else.actions,d+1);
    if(node.type==='Until'){assert(Number.isInteger(node.limit?.count)&&node.limit.count>0&&node.limit.count<=5000);assert.equal(node.operationOptions,'FailWhenLimitsReached');}
    if(node.type==='Switch'){assert(Object.keys(node.cases).length<=25);const values=Object.values(node.cases).map(c=>c.case);assert.equal(new Set(values).size,values.length);for(const branch of Object.values(node.cases))walk(branch.actions,d+1);walk(node.default.actions,d+1);}
  }}walk(flow.properties.definition.actions,1);for(const r of refs)assert(names.has(r),'missing action '+r);assert(count<=500,'actions '+count);assert(depth<=8);assert(Math.max(...expressionLengths)<=8192);return {actions:count,depth,maxExpression:Math.max(...expressionLengths)};
}
module.exports={Harness,validateGraph,parse,evaluate,resolve};
