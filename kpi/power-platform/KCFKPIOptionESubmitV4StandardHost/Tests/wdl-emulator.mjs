/** Focused developer emulator for this generated WDL only. Never hosted parity evidence. */
import assert from 'node:assert/strict';
import {isDeepStrictEqual} from 'node:util';
const expressionCache=new Map();
export function parseExpression(text) {
  if(expressionCache.has(text))return expressionCache.get(text);
  let i=text.startsWith('@')?1:0;
  const ws=()=>{while(/\s/.test(text[i]||'')&&i<text.length)i++;};
  function value() {
    ws();let node;
    if(text[i]==="'") {i++;let s='';while(i<text.length){if(text[i]==="'"){if(text[i+1]==="'"){s+="'";i+=2;continue;}i++;break;}s+=text[i++];}node={literal:s};}
    else if(/[-\d]/.test(text[i]||'')){const m=/^-?\d+(?:\.\d+)?/.exec(text.slice(i));if(!m)throw Error('number');i+=m[0].length;node={literal:Number(m[0])};}
    else {const m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));if(!m)throw Error(`Expression token at ${i}: ${text.slice(i,i+70)}`);i+=m[0].length;const name=m[0];if(name==='null'||name==='true'||name==='false')node={literal:name==='null'?null:name==='true'};else {ws();if(text[i++]!=='(')throw Error('function opening');const args=[];ws();if(text[i]!==')'){do{args.push(value());ws();if(text[i]!==',')break;i++;}while(i<text.length);}if(text[i++]!==')')throw Error(`function closing at ${i}: ${text.slice(i-30,i+30)}`);node={name,args};}}
    ws();while(text[i]==='['||text.slice(i,i+2)==='?['){if(text[i]==='?')i++;i++;const key=value();ws();if(text[i++]!==']')throw Error('property closing');node={base:node,key};ws();}return node;
  }
  const node=value();ws();if(i!==text.length)throw Error(`Expression trailing at ${i}: ${text.slice(i)}`);expressionCache.set(text,node);return node;
}
const stringify=v=>v===null||v===undefined?'':typeof v==='string'?v:JSON.stringify(v);
const deep=isDeepStrictEqual;
const eq=(a,b)=>deep(a,b)||((typeof a==='boolean'&&typeof b==='number')||(typeof b==='boolean'&&typeof a==='number'))&&Number(a)===Number(b);
export class WdlEmulator {
  constructor({parameters={},trigger={},http,clock='2026-10-02T02:00:00.000Z'}={}){this.variables={};this.outputs={};this.statuses={};this.items={};this.parameters=parameters;this.trigger=trigger;this.http=http;this.clock=clock;this.effects=[];this.actionRuns=[];this.failure=undefined;this.failures=[];}
  eval(node) {
    if(Object.hasOwn(node,'literal'))return node.literal;
    if(node.base)return this.eval(node.base)?.[this.eval(node.key)]??null;
    if(node.name==='if')return this.eval(node.args[0])?this.eval(node.args[1]):this.eval(node.args[2]);
    const a=node.args.map(x=>this.eval(x)),[v,w]=a;
    switch(node.name){
      case 'concat':return a.map(stringify).join('');case 'string':return stringify(v);case 'json':return JSON.parse(v);
      case 'replace':return String(v).split(w).join(a[2]);case 'decodeUriComponent':return decodeURIComponent(v);case 'uriComponent':return encodeURIComponent(v);
      case 'variables':return this.variables[v];case 'parameters':return this.parameters[v];case 'outputs':return this.outputs[v];case 'body':return this.outputs[v]?.body??this.outputs[v];case 'items':return this.items[v];case 'item':return this.currentItem;
      case 'triggerBody':return this.trigger;case 'triggerOutputs':return {body:this.trigger};
      case 'createArray':return a;case 'equals':return eq(v,w);case 'contains':return Array.isArray(v)?v.some(x=>deep(x,w)):v&&typeof v==='object'?Object.hasOwn(v,w):String(v).includes(w);
      case 'and':return a.every(Boolean);case 'or':return a.some(Boolean);case 'not':return !v;case 'empty':return v===null||v===undefined||typeof v==='object'?v==null||Object.keys(v).length===0:v.length===0;
      case 'length':return v.length;case 'join':return v.join(w);case 'first':return v[0];case 'coalesce':return a.find(x=>x!==null&&x!==undefined)??null;
      case 'sub':return v-w;case 'add':return v+w;case 'mul':return v*w;case 'div':return Number.isInteger(v)&&Number.isInteger(w)?Math.trunc(v/w):v/w;case 'mod':return v%w;case 'int':{const n=Number(v);if(!Number.isInteger(n))throw Error('int');return n;}
      case 'less':return v<w;case 'lessOrEquals':return v<=w;case 'greater':return v>w;case 'greaterOrEquals':return v>=w;
      case 'base64':return Buffer.from(stringify(v),'utf8').toString('base64');case 'base64ToString':return new TextDecoder('utf-8',{fatal:true}).decode(Buffer.from(v,'base64'));
      case 'endsWith':return String(v).toLowerCase().endsWith(String(w).toLowerCase());case 'substring':return String(v).slice(w,a[2]===undefined?undefined:w+a[2]);case 'trim':return v.trim();case 'toLower':return v.toLowerCase();
      case 'union':return a.flat().filter((x,i,all)=>all.findIndex(y=>deep(x,y))===i);case 'addProperty':case 'setProperty':return {...v,[w]:a[2]};case 'removeProperty':{const o={...v};delete o[w];return o;}
      case 'utcNow':return this.clock;case 'formatDateTime':{const d=new Date(v);if(!Number.isFinite(d.getTime()))throw Error('date');return w==='yyyy-MM-dd'?d.toISOString().slice(0,10):d.toISOString();}case 'ticks':return Date.parse(v)*10000+621355968000000000;
      default:throw Error(`Emulator function not implemented ${node.name}`);
    }
  }
  resolve(v){if(typeof v==='string'&&v.startsWith('@'))return this.eval(parseExpression(v));if(Array.isArray(v))return v.map(x=>this.resolve(x));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,this.resolve(x)]));return v;}
  async run(actions){
    for(const [name,a]of Object.entries(actions)){
      const ready=Object.entries(a.runAfter||{}).every(([key,allowed])=>allowed.includes(this.statuses[key]||'Skipped'));
      if(!ready){this.statuses[name]='Skipped';continue;}
      this.actionRuns.push(name);
      try {
        const input=a.inputs===undefined||['Select','Query'].includes(a.type)?undefined:a.type==='ParseJson'?{content:this.resolve(a.inputs.content),schema:a.inputs.schema}:this.resolve(a.inputs);
        switch(a.type){
          case 'InitializeVariable':for(const v of input.variables)this.variables[v.name]=structuredClone(v.value);break;
          case 'SetVariable':this.variables[input.name]=structuredClone(input.value);break;
          case 'AppendToArrayVariable':this.variables[input.name].push(structuredClone(input.value));break;
          case 'IncrementVariable':this.variables[input.name]+=input.value;break;
          case 'Compose':this.outputs[name]=input;break;
          case 'ParseJson':{const value=typeof input.content==='string'?JSON.parse(input.content):input.content;validateSchema(value,input.schema);this.outputs[name]=value;break;}
          case 'Scope':if(!await this.run(a.actions))throw Error('Scope failed');break;
          case 'If':if(!await this.run(this.resolve(a.expression)?a.actions:a.else?.actions||{}))throw Error('If branch failed');break;
          case 'Switch':{const value=this.resolve(a.expression),branch=Object.values(a.cases).find(x=>x.case===value)||a.default;if(branch&&!await this.run(branch.actions))throw Error('Switch failed');break;}
          case 'Foreach':for(const value of this.resolve(a.foreach)){this.items[name]=value;if(!await this.run(a.actions))throw Error('Foreach failed');}delete this.items[name];break;
          // Microsoft Until considers the last iteration's failures. An earlier
          // failed iteration continues, allowing exact native readback recovery.
          // https://learn.microsoft.com/en-us/azure/logic-apps/logic-apps-control-flow-loops#until-loop-considerations
          case 'Until':{let count=0,lastSucceeded;do{lastSucceeded=await this.run(a.actions);count++;}while(!this.resolve(a.expression)&&count<a.limit.count);if(!lastSucceeded)throw Error('Until last iteration failed');if(!this.resolve(a.expression)&&a.operationOptions==='FailWhenLimitsReached')throw Error('Until count');break;}
          case 'Select':{const result=[];for(const value of this.resolve(a.inputs.from)){this.currentItem=value;result.push(this.resolve(a.inputs.select));}this.outputs[name]=result;break;}
          case 'Query':{const result=[];for(const value of this.resolve(a.inputs.from)){this.currentItem=value;if(this.resolve(a.inputs.where))result.push(value);}this.outputs[name]=result;break;}
          case 'OpenApiConnection':{if(!this.http)throw Error('No synthetic HTTP port');const result=await this.http(input.parameters,name,this);this.outputs[name]=result;if(result.statusCode>=400)throw Error(`HTTP ${result.statusCode}`);if(input.parameters['parameters/method']!=='GET')this.effects.push({name,input:input.parameters});break;}
          case 'Terminate':this.terminal=input.runStatus;this.terminalError=input.runError;this.statuses[name]='Succeeded';return input.runStatus==='Succeeded';
          default:throw Error(`Emulator action ${a.type}`);
        }
        this.statuses[name]='Succeeded';
      }catch(error){if(error.code==='SYNTHETIC_PROCESS_STOP')throw error;this.statuses[name]='Failed';this.outputs[name]??={error:String(error)};this.failure={name,error:String(error),guardReason:a.metadata?.guardReason};this.failures.push(this.failure);}
    }
    return Object.keys(actions).every(n=>this.statuses[n]!=='Failed');
  }
}
export function validateSchema(v,s){
  if(s.not){let valid=true;try{validateSchema(v,s.not);}catch{valid=false;}assert(!valid);}
  if(s.anyOf){const discriminated=v&&typeof v==='object'&&s.anyOf.every(x=>x.properties?.kind?.enum),choices=discriminated?s.anyOf.filter(x=>x.properties.kind.enum.includes(v.kind)):s.anyOf;if(!choices.some(x=>{try{validateSchema(v,x);return true;}catch{return false;}}))throw Error('schema anyOf');return;}
  if(s.type==='object'){assert(v&&typeof v==='object'&&!Array.isArray(v));for(const k of s.required||[])assert(Object.hasOwn(v,k));if(s.additionalProperties===false)for(const k of Object.keys(v))assert(Object.hasOwn(s.properties,k));for(const[k,x]of Object.entries(v))if(s.properties?.[k])validateSchema(x,s.properties[k]);}
  else if(s.type==='null'){assert.equal(v,null);}
  else if(s.type==='array'){assert(Array.isArray(v));for(const x of v)validateSchema(x,s.items);}
  else if(s.type==='integer'||s.type==='number'){assert(typeof v==='number'&&Number.isFinite(v));if(s.type==='integer')assert(Number.isInteger(v));if(s.minimum!==undefined)assert(v>=s.minimum);if(s.maximum!==undefined)assert(v<=s.maximum);}
  else assert.equal(typeof v,s.type);
  if(s.enum)assert(s.enum.some(x=>deep(x,v)));if(s.const!==undefined)assert(deep(s.const,v));if(s.pattern)assert(new RegExp(s.pattern).test(v));
}
