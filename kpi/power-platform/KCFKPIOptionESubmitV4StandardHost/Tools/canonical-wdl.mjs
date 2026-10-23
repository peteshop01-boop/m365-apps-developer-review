/** Build-time only. Emits supported WDL actions; no JavaScript runs in the flow. */
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const expression = value => `@${value}`;
/** A JSON scalar array's first token distinguishes string/number without equals coercion.
 * This uses documented scalar JSON rendering only as a type marker, never as the wire serializer. */
export const isStringScalar = value => `contains(substring(string(createArray(${value},${value})),1,1),decodeUriComponent('%22'))`;
export const exactText = (left,right) => `and(equals(length(${left}),length(${right})),contains(${left},${right}))`;
export const exactRecord = (left,right) => exactText(`string(${left})`,`string(${right})`);
export const documentedFunctions = new Set(['concat','replace','decodeUriComponent','string','contains','if','join','variables','items','item','body','outputs','base64','base64ToString','length','sub','div','mul','endsWith','and','or','equals','lessOrEquals','not','empty','first','int','uriComponent','coalesce','add','utcNow','formatDateTime','json','parameters','triggerBody','triggerOutputs','createArray','indexOf','greater','greaterOrEquals','less','union','trim','mod','substring','toLower','ticks','addProperty','removeProperty','setProperty']);

/** Fixed escape sequence, rather than string(object), for every JSON string scalar. */
export function quotedString(value) {
  let text = `replace(replace(${value},decodeUriComponent('%5C'),concat(decodeUriComponent('%5C'),decodeUriComponent('%5C'))),decodeUriComponent('%22'),concat(decodeUriComponent('%5C'),decodeUriComponent('%22')))`;
  for (let code = 0; code < 32; code++) {
    const short = {8:'b',9:'t',10:'n',12:'f',13:'r'}[code];
    const suffix = short || `u${code.toString(16).padStart(4,'0')}`;
    text = `replace(${text},decodeUriComponent('%${code.toString(16).padStart(2,'0')}'),concat(decodeUriComponent('%5C'),${literal(suffix)}))`;
  }
  return `concat(decodeUriComponent('%22'),${text},decodeUriComponent('%22'))`;
}

/** Base64 length is an octet bound. It does not substitute a native fatal UTF8 readback. */
export function byteLength(text) {
  const encoded = `base64(${text})`;
  return `sub(div(mul(length(${encoded}),3),4),if(endsWith(${encoded},'=='),2,if(endsWith(${encoded},'='),1,0)))`;
}

/**
 * Emits serial nested loops with separately initialised buffers, preserving array order.
 * Full reconstruction equality detects extra/duplicate keys and noncanonical escaping.
 * ParseJSON is solely the typed decoder. Numeric/Unicode host parity needs admission.
 */
export function compileCanonical(schema, input, prefix = 'Wire') {
  let counter = 0;
  const variables = [],buffers=new Map();
  const bufferAt=depth=>{
    const name=`${prefix}_Depth${depth}_parts`;
    if(!buffers.has(depth)){buffers.set(depth,name);variables.push({name,type:'array',value:[]});}
    return name;
  };
  function compile(s, read,depth=0) {
    const actions = {};
    let previous;
    const append = (name, action) => { action.runAfter = previous ? {[previous]:['Succeeded']} : {}; actions[name] = action; previous = name; };
    const id = `${prefix}_${++counter}`;
    if (s.type === 'array') {
      const buffer = bufferAt(depth);
      append(`${id}_Reset`, {type:'SetVariable',inputs:{name:buffer,value:[]}});
      const loop = `${id}_Each`;
      const child = compile(s.items,`items('${loop}')`,depth+1);
      const childNames = Object.keys(child.actions);
      const appendName = `${id}_Append`;
      child.actions[appendName] = {type:'AppendToArrayVariable',inputs:{name:buffer,value:expression(child.value)},runAfter:childNames.length ? {[childNames.at(-1)]:['Succeeded']} : {}};
      append(loop,{type:'Foreach',foreach:expression(read),actions:child.actions,runtimeConfiguration:{concurrency:{repetitions:1}}});
      return {actions,value:`concat('[',join(variables('${buffer}'),','),']')`};
    }
    if (s.type === 'object') {
      const constantKeys=Object.keys(s.properties).sort();
      if(s.additionalProperties===false&&constantKeys.every(k=>(s.required||[]).includes(k)&&Object.hasOwn(s.properties[k],'const'))){return {actions,value:literal(JSON.stringify(Object.fromEntries(constantKeys.map(k=>[k,s.properties[k].const]))))};}
      // Small closed scalar objects use one bounded pure expression, preserving
      // the same escaper, typed discriminator, sorted keys and optional presence.
      const keys=Object.keys(s.properties).sort();
      if(keys.length<=2&&Object.values(s.properties).every(v=>['string','number','integer','boolean'].includes(v.type)||v.anyOf)) {
        const present=k=>(s.required||[]).includes(k)?'true':`contains(${read},${literal(k)})`;
        const parts=keys.map((key,index)=>{
          const value=compile(s.properties[key],`${read}?[${literal(key)}]`,depth+1).value;
          const comma=index?`if(or(${keys.slice(0,index).map(present).join(',')}),',','')`:"''";
          return `if(${present(key)},concat(${comma},${literal(JSON.stringify(key)+':')},${value}),'')`;
        });
        const inline=`concat('{',${parts.join(',')}${parts.length?',':''}'}')`;
        if(inline.length<=7600)return {actions,value:inline};
      }
      const buffer = bufferAt(depth);
      append(`${id}_Reset`,{type:'SetVariable',inputs:{name:buffer,value:[]}});
      const scalarFields=Object.values(s.properties).every(v=>['string','number','integer','boolean'].includes(v.type)||v.anyOf);
      if(scalarFields) {
        const loop=`${id}_Fields`;
        const field=`items('${loop}')`,value=`${read}?[${field}?['key']]`;
        const escaped=quotedString(`string(${value})`);
        const encoded=`if(or(equals(${field}?['type'],'string'),and(equals(${field}?['type'],'scalar'),${isStringScalar(value)})),${escaped},string(${value}))`;
        const appendAction={type:'AppendToArrayVariable',inputs:{name:buffer,value:expression(`concat('"',${field}?['key'],'":',${encoded})`)},runAfter:{}};
        const descriptors=Object.keys(s.properties).sort().map(key=>({key,type:s.properties[key].anyOf?'scalar':s.properties[key].type,required:(s.required||[]).includes(key)}));
        const child=descriptors.every(v=>v.required)?{[`${id}_Append`]:appendAction}:{[`${id}_Present`]:{type:'If',expression:expression(`or(${field}?['required'],contains(${read},${field}?['key']))`),actions:{[`${id}_Append`]:appendAction},else:{actions:{}},runAfter:{}}};
        append(loop,{type:'Foreach',foreach:expression(`json(${literal(JSON.stringify(descriptors))})`),actions:child,runtimeConfiguration:{concurrency:{repetitions:1}}});
        return {actions,value:`concat('{',join(variables('${buffer}'),','),'}')`};
      }
      for (const key of Object.keys(s.properties).sort()) {
        const fieldId = `${prefix}_${++counter}`;
        const child = compile(s.properties[key],`${read}?[${literal(key)}]`,depth+1);
        const childNames = Object.keys(child.actions);
        child.actions[`${fieldId}_Append`] = {type:'AppendToArrayVariable',inputs:{name:buffer,value:expression(`concat(${literal(JSON.stringify(key)+':')},${child.value})`)},runAfter:childNames.length ? {[childNames.at(-1)]:['Succeeded']} : {}};
        if ((s.required || []).includes(key)) {
          for (const [name, action] of Object.entries(child.actions)) append(name,action);
        }
        else append(`${fieldId}_Optional`,{type:'If',expression:expression(`contains(${read},${literal(key)})`),actions:child.actions,else:{actions:{}}});
      }
      return {actions,value:`concat('{',join(variables('${buffer}'),','),'}')`};
    }
    if (s.type === 'string') return {actions,value:quotedString(read)};
    if (s.anyOf && s.anyOf.length === 2 && s.anyOf.some(v=>v.type==='string') && s.anyOf.some(v=>v.type==='number')) {
      // ParseJSON has limited the scalar to string/number. Exact typed equality to
      // its string conversion selects only the string branch. Hosted parity must
      // explicitly prove this discrimination; no loosely typed coercion is allowed.
      return {actions,value:`if(${isStringScalar(read)},${quotedString(`string(${read})`)},string(${read}))`};
    }
    if (['number','integer','boolean'].includes(s.type)) return {actions,value:`string(${read})`};
    throw Error(`Unsupported canonical schema ${JSON.stringify(s)}`);
  }
  const result = compile(schema,input);
  return {...result,variables};
}

/** WDL's supported JSON schema vocabulary uses enum instead of a const shortcut. */
export function nativeSchema(schema) {
  if (Array.isArray(schema)) return schema.map(nativeSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(Object.entries(schema).map(([key,value]) => key === 'const' ? ['enum',[value]] : [key,nativeSchema(value)]));
}

/** Replace immutable temporaries by their unique real producer; state/loop buffers stay variables. */
export function promoteReadonly(actions,variables,allowedNames) {
  const setters=new Map(),otherWrites=new Set();
  const walk=items=>{for(const [name,a] of Object.entries(items)) {
    if(a.type==='SetVariable'){const key=a.inputs.name;setters.set(key,[...(setters.get(key)||[]),{name,action:a}]);}
    if(['AppendToArrayVariable','IncrementVariable','DecrementVariable','AppendToStringVariable'].includes(a.type)) otherWrites.add(a.inputs.name);
    if(a.actions)walk(a.actions);if(a.else?.actions)walk(a.else.actions);if(a.cases)Object.values(a.cases).forEach(v=>walk(v.actions));if(a.default?.actions)walk(a.default.actions);
  }};walk(actions);
  const aliases=new Map();
  for(const name of allowedNames){const found=setters.get(name)||[];if(found.length===1&&!otherWrites.has(name)){aliases.set(name,found[0].name);const a=found[0].action;a.type='Compose';a.inputs=a.inputs.value;}}
  const replace=value=>{
    if(typeof value==='string')for(const [key,name]of aliases){const original=variables.find(v=>v.name===key)?.value;const fallback=original&&typeof original==='object'?`json(${literal(JSON.stringify(original))})`:typeof original==='string'?literal(original):JSON.stringify(original);value=value.replaceAll(`variables('${key}')`,`coalesce(outputs('${name}'),${fallback})`);}
    else if(Array.isArray(value))value=value.map(replace);
    else if(value&&typeof value==='object')value=Object.fromEntries(Object.entries(value).map(([key,v])=>[key,replace(v)]));
    return value;
  };
  return {actions:replace(actions),variables:variables.filter(v=>!aliases.has(v.name)),aliases:Object.fromEntries(aliases)};
}

export function inventory(actions) {
  const names = new Set(), refs = new Set(), functions = new Set(), variableReads = new Set(), variables = new Set();
  const visit = (items) => {
    for (const [name,a] of Object.entries(items)) {
      if(names.has(name)) throw Error(`Repeated action name ${name}`); names.add(name);
      if(a.type === 'InitializeVariable') for(const v of a.inputs.variables) variables.add(v.name);
      for(const k of Object.keys(a.runAfter || {})) refs.add(k);
      const stringScan = value => {
        if(typeof value === 'string' && value.startsWith('@')) {
          for(const m of value.matchAll(/\b(?:body|outputs|items)\('([^']+)'\)/g)) refs.add(m[1]);
          for(const m of value.matchAll(/variables\('([^']+)'\)/g)) variableReads.add(m[1]);
          // Discard quoted literals before finding function calls.
          const withoutLiterals = value.replace(/'(?:''|[^'])*'/g,"''");
          for(const m of withoutLiterals.matchAll(/\b([a-zA-Z][a-zA-Z0-9]*)\(/g)) functions.add(m[1]);
        } else if(Array.isArray(value)) value.forEach(stringScan);
        else if(value && typeof value==='object') Object.values(value).forEach(stringScan);
      };
      const own = {...a}; delete own.actions; delete own.else; stringScan(own);
      if(a.actions) visit(a.actions); if(a.else?.actions) visit(a.else.actions);
      if(a.cases) for(const entry of Object.values(a.cases)) visit(entry.actions);
      if(a.default?.actions) visit(a.default.actions);
    }
  };
  visit(actions);
  const missingActions = [...refs].filter(v=>!names.has(v));
  const missingVariables = [...variableReads].filter(v=>!variables.has(v));
  const unsupportedFunctions = [...functions].filter(v=>!documentedFunctions.has(v));
  return {actionCount:names.size,actionNames:[...names],functions:[...functions].sort(),missingActions,missingVariables,unsupportedFunctions};
}
