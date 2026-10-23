'use strict';
// Emits native Power Automate WDL. This generator is a build tool; no JavaScript
// executes in the cloud flow. Only built-in actions + Standard SharePoint calls.
const fs = require('node:fs');
const path = require('node:path');
const SITE = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const API = '/providers/Microsoft.PowerApps/apis/shared_sharepointonline';
const SECURE = { secureData: { properties: ['inputs', 'outputs'] } };
const MAX = 10485760, ENVELOPE = 4 * Math.ceil(MAX / 3) + 65536;
const str = (maxLength, pattern) => ({ type: 'string', maxLength, ...(pattern ? { pattern } : {}) });
const id = { type: 'integer', minimum: 1, maximum: 2147483647 };
const obj = properties => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const file = obj({ kind: { type: 'string', enum: ['file'] }, fileName: str(120, '^[A-Za-z0-9_ ()-]+\\.(?:[pP][nN][gG]|[jJ][pP][eE]?[gG]|[pP][dD][fF])$'),
  mediaType: { type: 'string', enum: ['image/png', 'image/jpeg', 'application/pdf'] }, bytes: str(4 * Math.ceil(MAX / 3), '^[A-Za-z0-9+/]+={0,2}$'), sha256: str(64, '^[a-f0-9]{64}$') });
const none = obj({ kind: { type: 'string', enum: ['none'] }, reason: { ...str(2000), minLength: 1 } });
const requestSchema = obj({ schema: { type: 'integer', enum: [1] }, clientFingerprint: str(64, '^[a-f0-9]{64}$'), command: obj({
  operationId: { ...str(80, '^[A-Za-z0-9-]{16,80}$'), minLength: 16 }, parentId: id,
  parentEtag: str(200, '^"[^"\\r\\n]+"$'), date: str(10, '^\\d{2}-\\d{2}-\\d{4}$'),
  supplier: { ...str(255), minLength: 1 }, description: { ...str(255), minLength: 1 }, nominalCode: str(5, '^\\d{5}$'),
  amount: str(20, '^\\d+(\\.\\d{1,2})?$'), notes: str(2000), receipt: { oneOf: [file, none] }
}) });
const guid = str(36, '^[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$');
const listNames=['requests','operations','results','audit','expenses','claims','people','months','nominals'];
const aclRow=obj({principalId:id,roleId:id,high:str(10,'^\\d{1,10}$'),low:str(10,'^\\d{1,10}$')});
const bindingSchema = obj({ requests: guid, operations: guid, results: guid, audit: guid, expenses: guid, claims: guid, people: guid, months: guid, nominals: guid,
  fixtureActorId: id, processorActorId: id, fixtureParentId: id, requestRoot: str(200, '^/sites/REVIEW-TEST-SITE/[A-Za-z0-9_-]+$'),
  // Exact independently qualified direct-user role snapshots, not a Boolean
  // permission override. Groups, extra roles and changed masks fail closed.
  acl:obj(Object.fromEntries(listNames.map(n=>[n,{type:'array',minItems:2,maxItems:2,uniqueItems:true,items:aclRow}]))) });
const B = n => `parameters('Bindings')?['${n}']`;
const O = n => `outputs('${n}')`, D = n => `body('${n}')`, V = n => `variables('${n}')`;
const ex = s => '@' + s;
const field = (s, n) => `${s}?['${n}']`;
const eq = (a,b) => `equals(${a},${b})`;
const all = (...s) => `and(${s.join(',')})`;
const etag = n => `coalesce(${D(n)}?['odata.etag'],${D(n)}?['@odata.etag'],outputs('${n}')?['headers']?['ETag'])`;
const uri = (list, suffix = '') => `concat('_api/web/lists(guid''',${B(list)},''')${suffix.replace(/'/g,"''")}')`;
const itemUri = (list, itemId, suffix='') => `concat('_api/web/lists(guid''',${B(list)},''')/items(',string(${itemId}),')${suffix.replace(/'/g,"''")}')`;
const privateItemUri = (list,itemId) => itemUri(list,itemId,'?$select=*,HasUniqueRoleAssignments');
const stop = code => ({ type: 'Terminate', inputs: { runStatus: 'Failed', runError: { code, message: code } }, runAfter: {} });
function connector(operationId, parameters) { return { type: 'OpenApiConnection', inputs: { host: { apiId: API, connectionName: 'shared_sharepointonline', operationId },
  parameters: { dataset: SITE, ...parameters }, retryPolicy: { type: 'none' }, authentication: "@parameters('$authentication')" }, runtimeConfiguration: SECURE }; }
function http(method, relative, body, headers={}) { return connector('HttpRequest', { 'parameters/method': method, 'parameters/uri': ex(relative),
  'parameters/headers': { Accept: 'application/json;odata=nometadata', 'Content-Type': 'application/json;odata=nometadata', ...headers }, ...(body === undefined ? {} : { 'parameters/body': body }) }); }
function graph() {
  const actions = {}; let last;
  const add = (name,a,after=last) => {
    if (actions[name]) throw Error('DUPLICATE_ACTION');
    const payload=a.inputs?.parameters?.['parameters/body'];
    if(a.inputs?.host?.operationId==='HttpRequest' && payload && typeof payload==='object') {
      add(name+'_Body',{type:'Compose',inputs:payload,runtimeConfiguration:SECURE},after); after=name+'_Body';
      a={...a,inputs:{...a.inputs,parameters:{...a.inputs.parameters,'parameters/body':ex(`string(outputs('${after}'))`)}}};
    }
    actions[name] = { ...a, runAfter: after ? { [after]: ['Succeeded'] } : {} }; last=name; return name;
  };
  const compose = (name,value) => add(name,{ type:'Compose',inputs:value,runtimeConfiguration:SECURE });
  const guard = (name,expr,code=name.toUpperCase()) => add(name,{type:'If',expression:ex(expr),actions:{},else:{actions:{[name+'_Hold']:stop(code)}}});
  const branch = (name,expr,yes,no={}) => add(name,{type:'If',expression:ex(expr),actions:yes,else:{actions:no}});
  const get = (name,relative) => add(name,http('GET',relative));
  const set = (name,variable,value) => add(name,{type:'SetVariable',inputs:{name:variable,value},runtimeConfiguration:SECURE});
  return {actions,add,compose,guard,branch,get,set,fork:()=>graph()};
}
function validFeed(g,name,cap) { g.guard(name+'_Complete',all(`not(contains(${D(name)},'odata.nextLink'))`,`not(contains(${D(name)},'@odata.nextLink'))`, `less(length(${D(name)}?['value']),${cap})`)); }
function unique(g,name,list,keyExpr) { g.get(name,`concat('_api/web/lists(guid''',${B(list)},''')/items?$select=*,HasUniqueRoleAssignments&$filter=OperationKey eq ''',${keyExpr},'''&$top=2')`); validFeed(g,name,2); }
function createOnce(g,prefix,list,expected,keyExpr,creationAllowed='true') {
  unique(g,prefix+'_Before',list,keyExpr);
  const make=g.fork(); make.add(prefix+'_POST',http('POST',uri(list,'/items'),expected));
  g.branch(prefix+'_IfAbsent',all(`empty(${D(prefix+'_Before')}?['value'])`,creationAllowed),make.actions);
  // A timeout/409 never triggers a blind retry. A later protected run reconciles.
  unique(g,prefix+'_After',list,keyExpr); g.guard(prefix+'_One',eq(`length(${D(prefix+'_After')}?['value'])`,'1'));
  g.compose(prefix+'_Row',ex(`first(${D(prefix+'_After')}?['value'])`));
  g.guard(prefix+'_Bindings',all(eq(O(prefix+'_Row')+"?['HasUniqueRoleAssignments']",'false'),eq(O(prefix+'_Row')+"?['AuthorId']",B('processorActorId')),...Object.entries(expected).filter(([name])=>name!=='Title').map(([name,value])=>eq(name==='RecordJson'&&expected.State==='Rejected'&&value===''?`coalesce(${O(prefix+'_Row')}?['RecordJson'],'')`:`${O(prefix+'_Row')}?['${name}']`,typeof value==='string'&&value.startsWith('@')?value.slice(1):JSON.stringify(value).replace(/^"(.*)"$/,"'$1'")))));
}
const requestMetadataSelect='?$select=Id,AuthorId,EditorId,HasUniqueRoleAssignments,OData__UIVersionString,File/UniqueId,File/Length,File/ETag,File/Name,File/ServerRelativeUrl&$expand=File';
function metadataContent(g,prefix,requestId,actor=B('fixtureActorId'),select=requestMetadataSelect,requestRoot=B('requestRoot')) {
  const b=D(prefix+'_Before'), f=b+"?['File']";
  g.guard(prefix+'_SizeAndActor',all(eq(b+"?['Id']",requestId),eq(b+"?['AuthorId']",actor),eq(b+"?['EditorId']",b+"?['AuthorId']"),eq(b+"?['HasUniqueRoleAssignments']",'false'),eq(b+"?['OData__UIVersionString']","'1.0'"),
    `greater(int(${f}?['Length']),0)`,`lessOrEquals(int(${f}?['Length']),${ENVELOPE})`, `startsWith(${f}?['ServerRelativeUrl'],concat(${requestRoot},'/',string(${b}?['AuthorId']),'/'))`));
  g.add(prefix+'_Binary',connector('GetFileContentByPath',{path:ex(f+"?['ServerRelativeUrl']"),inferContentType:false}));
  const binary=D(prefix+'_Binary')+"?['$content']";
  g.guard(prefix+'_BinaryShape',all(eq(D(prefix+'_Binary')+"?['$content-type']","'application/octet-stream'"),`lessOrEquals(length(${binary}),${4*Math.ceil(ENVELOPE/3)})`));
  g.compose(prefix+'_ByteCount',ex(`sub(div(mul(length(${binary}),3),4),if(endsWith(${binary},'=='),2,if(endsWith(${binary},'='),1,0)))`));
  g.guard(prefix+'_ActualLength',all(eq(O(prefix+'_ByteCount'),`int(${f}?['Length'])`),eq(`base64(base64ToBinary(${binary}))`,binary)));
  g.get(prefix+'_After',itemUri('requests',requestId,select));
  g.guard(prefix+'_Unchanged',all(eq(etag(prefix+'_Before'),etag(prefix+'_After')),eq(`string(${b})`,`string(${D(prefix+'_After')})`)));
  g.add(prefix+'_Parse',{type:'ParseJson',inputs:{content:ex(`json(base64ToString(${binary}))`),schema:requestSchema},runtimeConfiguration:SECURE});
  g.guard(prefix+'_Filename',all(eq(f+"?['Name']",`concat(${D(prefix+'_Parse')}?['command']?['operationId'],'.json')`),eq(f+"?['ServerRelativeUrl']",`concat(${requestRoot},'/',string(${b}?['AuthorId']),'/',${D(prefix+'_Parse')}?['command']?['operationId'],'.json')`)));
}
function metadata(g,prefix,requestId) {
  if(g.readRequest)return g.readRequest(prefix,requestId);
  g.get(prefix+'_Before',itemUri('requests',requestId,requestMetadataSelect));
  metadataContent(g,prefix,requestId);
}
function cas(g,name,list,itemId,token,body) {
  g.guard(name+'_StrongETag',all(`not(empty(${token}))`,`startsWith(${token},'"')`,`endsWith(${token},'"')`,`not(equals(${token},'""'))`));
  g.add(name,http('POST',itemUri(list,itemId),body,{'IF-MATCH':ex(token),'X-HTTP-Method':'MERGE'}));
}
const parentSelect='?$select=Id,HasUniqueRoleAssignments,ClaimantRecordId,ClaimMonthRecordId,ClaimMonth,SubmissionStatus,ExpenseTotal,MileageTotal,OverallTotal,SubmissionVersion,D01Reservation,D01Checkpoint';
function parent(g,name) { g.get(name,itemUri('claims',O('Command')+"?['parentId']",parentSelect)); }
function authoritativeRoster(g,prefix,p,person) {
  // The server-stamped request Author, never a command actor, selects the roster.
  // Count every matching row, including inactive rows: ambiguous identity holds.
  const name=prefix+'_Roster';
  g.get(name,`concat('_api/web/lists(guid''',${B('people')},''')/items?$select=Id,D01UserId,D01Active&$filter=D01UserId eq ',string(${O('Actor')}),'&$top=2')`);
  const row={type:'object',required:['Id','D01UserId','D01Active'],additionalProperties:true,properties:{Id:id,D01UserId:id,D01Active:{type:'boolean'}}};
  g.add(prefix+'_Roster_Types',{type:'ParseJson',inputs:{content:{actor:ex(O('Actor')),parentPerson:ex(D(p)+"?['ClaimantRecordId']"),person:ex(D(person)),feed:ex(D(name))},schema:{type:'object',required:['actor','parentPerson','person','feed'],additionalProperties:false,properties:{actor:id,parentPerson:id,person:row,feed:{type:'object',required:['value'],additionalProperties:true,properties:{value:{type:'array',minItems:1,maxItems:1,items:row}}}}}},runtimeConfiguration:SECURE});
  const found=`first(${D(name)}?['value'])`;
  g.guard(prefix+'_Roster_Bound',all(`not(contains(${D(name)},'odata.nextLink'))`,`not(contains(${D(name)},'@odata.nextLink'))`,eq(found+"?['Id']",D(p)+"?['ClaimantRecordId']"),eq(found+"?['Id']",D(person)+"?['Id']"),eq(found+"?['D01UserId']",O('Actor')),eq(D(person)+"?['D01UserId']",O('Actor')),eq(found+"?['D01Active']",'true'),eq(D(person)+"?['D01Active']",'true')));
}
function policyRecheck(g,prefix,p) {
  g.get(prefix+'_Person',itemUri('people',D(p)+"?['ClaimantRecordId']",'?$select=Id,D01UserId,D01Active'));
  g.get(prefix+'_Month',itemUri('months',D(p)+"?['ClaimMonthRecordId']",'?$select=Id,ClaimMonth,MonthStatus'));
  authoritativeRoster(g,prefix,p,prefix+'_Person');
  g.guard(prefix+'_Policy',all(eq(D(p)+"?['HasUniqueRoleAssignments']",'false'),eq(D(prefix+'_Person')+"?['D01UserId']",O('Actor')),eq(D(prefix+'_Person')+"?['D01Active']",'true'),eq(D(p)+"?['SubmissionStatus']","'Draft'"),eq(D(p)+"?['ClaimMonth']",D(prefix+'_Month')+"?['ClaimMonth']"),eq(D(prefix+'_Month')+"?['MonthStatus']","'Open'"),eq(`substring(${O('Date_ISO')},0,7)`,D(prefix+'_Month')+"?['ClaimMonth']")));
}
const commonLedger = () => ({OperationKey:ex(O('Operation_Key')),RequestId:ex(O('Ledger')+"?['RequestId']"),D01ActorId:ex(O('Actor')),ParentId:ex(O('Command')+"?['parentId']")});
function rejectStale(g) {
  parent(g,'Parent_Rejection');
  const r=g.fork(), acquire=g.fork();
  acquire.compose('Rejecting_Reservation',{mode:'Rejecting',key:ex(O('Operation_Key')),originalEtag:ex(O('Command')+"?['parentEtag']")});
  cas(acquire,'Reserve_Rejection','claims',O('Command')+"?['parentId']",etag('Parent_Rejection'),{D01Reservation:ex(`string(${O('Rejecting_Reservation')})`)});
  r.branch('Acquire_Rejection',`empty(${D('Parent_Rejection')}?['D01Reservation'])`,acquire.actions);
  parent(r,'Parent_Rejecting');
  r.guard('Rejecting_Custody',all(eq(`json(${D('Parent_Rejecting')}?['D01Reservation'])?['key']`,O('Operation_Key')),eq(`json(${D('Parent_Rejecting')}?['D01Reservation'])?['mode']`,"'Rejecting'"),eq(`json(${D('Parent_Rejecting')}?['D01Reservation'])?['originalEtag']`,O('Command')+"?['parentEtag']")));
  r.get('Rejection_Line_Check',`concat('_api/web/lists(guid''',${B('expenses')},''')/items?$filter=D01OperationKey eq ''',${O('Operation_Key')},'''&$top=2')`); validFeed(r,'Rejection_Line_Check',2); r.guard('No_Partial_Line',`empty(${D('Rejection_Line_Check')}?['value'])`);
  r.get('Rejection_Ledger',privateItemUri('operations',O('Ledger')+"?['Id']"));
  r.guard('Rejection_Pending_Identity',all(eq(D('Rejection_Ledger')+"?['HasUniqueRoleAssignments']",'false'),eq(D('Rejection_Ledger')+"?['State']","'Pending'"),eq(D('Rejection_Ledger')+"?['RequestId']",O('Ledger')+"?['RequestId']"),eq(D('Rejection_Ledger')+"?['OperationKey']",O('Operation_Key'))));
  createOnce(r,'Rejected_Result','results',{Title:ex(O('Operation_Key')),...commonLedger(),State:'Rejected',RecordJson:''},O('Operation_Key'));
  cas(r,'Reject_Ledger','operations',O('Ledger')+"?['Id']",etag('Rejection_Ledger'),{State:'Rejected',ResultId:ex(O('Rejected_Result_Row')+"?['Id']")});
  r.get('Rejected_Ledger_Readback',privateItemUri('operations',O('Ledger')+"?['Id']"));
  r.guard('Rejected_Terminal_Readback',all(eq(D('Rejected_Ledger_Readback')+"?['HasUniqueRoleAssignments']",'false'),eq(D('Rejected_Ledger_Readback')+"?['State']","'Rejected'"),eq(D('Rejected_Ledger_Readback')+"?['ResultId']",O('Rejected_Result_Row')+"?['Id']"),eq(D('Rejected_Ledger_Readback')+"?['OperationKey']",O('Operation_Key')),eq(D('Rejected_Ledger_Readback')+"?['RequestId']",O('Ledger')+"?['RequestId']")));
  // Re-drive after the terminal write closes any lost release acknowledgement.
  cas(r,'Release_Rejection','claims',O('Command')+"?['parentId']",etag('Parent_Rejecting'),{D01Reservation:''});
  parent(r,'Rejection_Released'); r.guard('Rejection_Release_Readback',`empty(${D('Rejection_Released')}?['D01Reservation'])`);
  r.compose('Rejected_Outcome',{state:'Rejected'}); r.add('End_Rejected',{type:'Terminate',inputs:{runStatus:'Succeeded'}});
  const reservation=`json(if(empty(${D('Parent_Rejection')}?['D01Reservation']),'{}',${D('Parent_Rejection')}?['D01Reservation']))`;
  g.branch('If_Stale_Unwritten',all(eq(O('Ledger')+"?['State']","'Pending'"),`or(and(empty(${D('Parent_Rejection')}?['D01Reservation']),not(equals(${etag('Parent_Rejection')},${O('Command')}?['parentEtag']))),and(equals(${reservation}?['key'],${O('Operation_Key')}),equals(${reservation}?['mode'],'Rejecting')))`),r.actions);
}
function recoverRejected(g) {
  const r=g.fork(); r.get('Existing_Rejected_Result',privateItemUri('results',O('Ledger')+"?['ResultId']"));
  r.guard('Existing_Rejection_Binding',all(eq(D('Existing_Rejected_Result')+"?['HasUniqueRoleAssignments']",'false'),eq(D('Existing_Rejected_Result')+"?['AuthorId']",B('processorActorId')),...Object.entries({...commonLedger(),State:'Rejected',RecordJson:''}).map(([k,v])=>eq(k==='RecordJson'?`coalesce(${D('Existing_Rejected_Result')}?['RecordJson'],'')`:D('Existing_Rejected_Result')+`?['${k}']`,v.startsWith('@')?v.slice(1):`'${v}'`))));
  parent(r,'Existing_Reject_Parent'); const clear=g.fork();
  clear.guard('Existing_Reject_Only_Own',all(eq(`json(${D('Existing_Reject_Parent')}?['D01Reservation'])?['key']`,O('Operation_Key')),eq(`json(${D('Existing_Reject_Parent')}?['D01Reservation'])?['mode']`,"'Rejecting'")));
  cas(clear,'Existing_Reject_Clear','claims',O('Command')+"?['parentId']",etag('Existing_Reject_Parent'),{D01Reservation:''});
  r.branch('Existing_Reject_Needs_Clear',`not(empty(${D('Existing_Reject_Parent')}?['D01Reservation']))`,clear.actions);
  parent(r,'Existing_Reject_Released'); r.guard('Existing_Reject_Verified',`empty(${D('Existing_Reject_Released')}?['D01Reservation'])`);
  r.compose('Existing_Rejected_Outcome',{state:'Rejected'}); r.add('End_Existing_Rejected',{type:'Terminate',inputs:{runStatus:'Succeeded'}});
  g.branch('If_Already_Rejected',eq(O('Ledger')+"?['State']","'Rejected'"),r.actions);
}
const lineSelect='Id,HasUniqueRoleAssignments,ExpenseLineKey,ClaimSubmissionRefId,ExpenseDate,Supplier,ExpenseDescription,NominalCode,NominalDescription,GrossAmount,ClaimantNotes,IsVoided,ReceiptRequired,LineValidationStatus,D01Originator,D01RequestId,D01OperationKey,D01Fingerprint,D01NoReceiptReason,D01ReceiptManifest';
function heldBindingSchema() { return bindingSchema; }

function fieldContract(g) {
  // Hidden is presentation metadata, never permission or optionality. Read the
  // complete bounded field feed; no hidden required Category can be omitted.
  g.get('Expense_Field_Contract',uri('expenses',"/fields?$select=InternalName,TypeAsString,Required,ReadOnlyField,Hidden,EnforceUniqueValues&$top=201"));
  for(const list of ['operations','results','audit']) {
    g.get('Key_'+list,uri(list,"/fields?$select=InternalName,TypeAsString,Required,ReadOnlyField,EnforceUniqueValues&$filter=InternalName eq 'OperationKey' or InternalName eq 'D01ActorId'&$top=3"));
  }
  // Native equals(true,1) is true: equality is NOT a type check. Require actual
  // JSON Boolean/string metadata across ALL four feeds before any Query/write.
  // One combined parser retains the action budget and raw pagination guards.
  const fieldProperties={InternalName:{...str(255),minLength:1},TypeAsString:{...str(100),minLength:1},Required:{type:'boolean'},ReadOnlyField:{type:'boolean'},EnforceUniqueValues:{type:'boolean'}};
  const fieldFeed=(includeHidden,minItems,maxItems)=>{const properties=includeHidden?{...fieldProperties,Hidden:{type:'boolean'}}:fieldProperties;return {
    type:'object',required:['value'],additionalProperties:true,properties:{value:{type:'array',minItems,maxItems,items:{type:'object',required:Object.keys(properties),additionalProperties:true,properties}}}
  };};
  g.add('Validate_Field_Metadata_Types',{type:'ParseJson',inputs:{content:{expenses:ex(D('Expense_Field_Contract')),operations:ex(D('Key_operations')),results:ex(D('Key_results')),audit:ex(D('Key_audit'))},schema:{
    type:'object',required:['expenses','operations','results','audit'],additionalProperties:false,
    properties:{expenses:fieldFeed(true,1,200),operations:fieldFeed(false,2,2),results:fieldFeed(false,2,2),audit:fieldFeed(false,2,2)}
  }},runtimeConfiguration:SECURE});
  g.add('Required_Category',{type:'Query',inputs:{from:ex(D('Expense_Field_Contract')+"?['value']"),where:"@and(equals(toLower(item()?['InternalName']),'expensecategory'),not(equals(item()?['Required'],false)))"},runtimeConfiguration:SECURE});
  g.guard('No_Hidden_Category',all(`empty(${D('Required_Category')})`,`lessOrEquals(length(${D('Expense_Field_Contract')}?['value']),200)`,
    `not(contains(${D('Expense_Field_Contract')},'odata.nextLink'))`,`not(contains(${D('Expense_Field_Contract')},'@odata.nextLink'))`));
  const expenseFields=[['D01NoReceiptReason','Note',false,false],['D01Originator','Number',true,false],['D01RequestId','Number',true,false],
    ['D01OperationKey','Text',true,true],['D01Fingerprint','Text',true,false],['D01ReceiptManifest','Note',false,false]];
  for(const [name,type,required,unique] of expenseFields) {
    // Count ALL same-name rows before checking attributes; an invalid duplicate
    // must not disappear from the cardinality check. Other fixture schema gates
    // (plain notes, lengths, lookup targets) still require native qualification.
    g.add('Field_'+name,{type:'Query',inputs:{from:ex(D('Expense_Field_Contract')+"?['value']"),where:ex(eq("toLower(item()?['InternalName'])",`'${name.toLowerCase()}'`))},runtimeConfiguration:SECURE});
    const row=`first(${D('Field_'+name)})`;
    g.guard('Has_'+name,all(eq(`length(${D('Field_'+name)})`,'1'),eq(row+"?['InternalName']",`'${name}'`),eq(row+"?['TypeAsString']",`'${type}'`),
      eq(row+"?['Required']",String(required)),eq(row+"?['ReadOnlyField']",'false'),eq(row+"?['EnforceUniqueValues']",String(unique))));
  }
  for(const list of ['operations','results','audit']) {
    // Both physical fields must exist and be writable with exact types. The
    // native hidden OriginatorId Lookup is never an actor-field substitute.
    const rows=D('Key_'+list)+"?['value']", a=`first(${rows})`, b=`last(${rows})`;
    const keyField=r=>all(eq(r+"?['InternalName']","'OperationKey'"),eq(r+"?['TypeAsString']","'Text'"),eq(r+"?['Required']",'true'),eq(r+"?['ReadOnlyField']",'false'),eq(r+"?['EnforceUniqueValues']",'true'));
    const actorField=r=>all(eq(r+"?['InternalName']","'D01ActorId'"),eq(r+"?['TypeAsString']","'Number'"),eq(r+"?['Required']",'true'),eq(r+"?['ReadOnlyField']",'false'),eq(r+"?['EnforceUniqueValues']",'false'));
    g.guard('Unique_'+list,all(eq(`length(${rows})`,'2'),`not(contains(${D('Key_'+list)},'odata.nextLink'))`,`not(contains(${D('Key_'+list)},'@odata.nextLink'))`,`or(${all(keyField(a),actorField(b))},${all(keyField(b),actorField(a))})`));
  }
}
function financialActions(g) {
  // JSON Schema may count Unicode code points. Keep an explicit runtime length
  // guard as well. Native WDL/SharePoint Unicode parity remains a TEST gate.
  g.guard('Valid_Date_And_Text',all(eq(`formatDateTime(${O('Date_ISO')},'dd-MM-yyyy')`,O('Command')+"?['date']"),`greater(length(trim(${O('Command')}?['supplier'])),0)`,`greater(length(trim(${O('Command')}?['description'])),0)`,
    `lessOrEquals(length(${O('Command')}?['supplier']),255)`,`lessOrEquals(length(${O('Command')}?['description']),255)`));
  g.compose('Amount_Pence',ex(`int(concat(first(split(${O('Command')}?['amount'],'.')),substring(concat(if(contains(${O('Command')}?['amount'],'.'),last(split(${O('Command')}?['amount'],'.')),''),'00'),0,2)))`));
  g.guard('Amount_Bound',all(`greater(${O('Amount_Pence')},0)`,`lessOrEquals(${O('Amount_Pence')},9007199254740991)`));
  const receipt=O('Command')+"?['receipt']", base=receipt+"?['bytes']";
  const fileBranch=g.fork();
  fileBranch.compose('Receipt_Size',ex(`sub(div(mul(length(${base}),3),4),if(endsWith(${base},'=='),2,if(endsWith(${base},'='),1,0)))`));
  fileBranch.guard('Receipt_Actual_Bounds',all(`greater(${O('Receipt_Size')},0)`,`greaterOrEquals(length(${base}),12)`,`lessOrEquals(${O('Receipt_Size')},${MAX})`,eq(`base64(base64ToBinary(${base}))`,base)));
  // Native startsWith is case-insensitive; Base64 is not. contains on an
  // exact-length prefix is case-sensitive. The preceding guard bounds every
  // eager substring branch, including signatures for a different MIME type.
  fileBranch.guard('Receipt_Type_Signature',`or(and(equals(${receipt}?['mediaType'],'image/png'),endsWith(toLower(${receipt}?['fileName']),'.png'),contains(substring(${base},0,10),'iVBORw0KGg'),contains('opqr',substring(${base},10,1))),and(equals(${receipt}?['mediaType'],'image/jpeg'),or(endsWith(toLower(${receipt}?['fileName']),'.jpg'),endsWith(toLower(${receipt}?['fileName']),'.jpeg')),contains(substring(${base},0,4),'/9j/')),and(equals(${receipt}?['mediaType'],'application/pdf'),endsWith(toLower(${receipt}?['fileName']),'.pdf'),contains(substring(${base},0,6),'JVBERi'),contains('0123',substring(${base},6,1))))`);
  fileBranch.set('Set_Receipt_Size','receiptSize',ex(O('Receipt_Size')));
  const noBranch=g.fork(); noBranch.guard('Receipt_Reason',`greater(length(trim(${receipt}?['reason'])),0)`);
  g.branch('Validate_Receipt',eq(receipt+"?['kind']","'file'"),fileBranch.actions,noBranch.actions);
  // Native variables bridge mutually exclusive branches. No variable is a trust flag.
  g.compose('Receipt_Manifest',{fileName:ex(receipt+"?['fileName']"),mediaType:ex(receipt+"?['mediaType']"),size:ex(V('receiptSize')),clientSha256:ex(receipt+"?['sha256']")});
  parent(g,'Parent_Initial');
  g.guard('Parent_Inherits_Private_ACL',eq(D('Parent_Initial')+"?['HasUniqueRoleAssignments']",'false'));
  const initialMoney=['ExpenseTotal','MileageTotal','OverallTotal'];
  g.guard('Initial_Parent_Money',all(...initialMoney.flatMap(n=>{const value=D('Parent_Initial')+`?['${n}']`,pence=`int(formatNumber(mul(${value},100),'0','en-GB'))`;return [`greaterOrEquals(${pence},0)`,`lessOrEquals(${pence},9007199254740991)`,eq(`div(float(${pence}),100)`,value)];})));
  g.get('Person',itemUri('people',D('Parent_Initial')+"?['ClaimantRecordId']",'?$select=Id,D01UserId,D01Active'));
  g.get('Month',itemUri('months',D('Parent_Initial')+"?['ClaimMonthRecordId']",'?$select=Id,ClaimMonth,MonthStatus'));
  authoritativeRoster(g,'Initial','Parent_Initial','Person');
  g.guard('Server_Owner_Month',all(eq(D('Person')+"?['D01UserId']",O('Actor')),eq(D('Person')+"?['D01Active']",'true'),eq(D('Parent_Initial')+"?['ClaimMonth']",D('Month')+"?['ClaimMonth']"),eq(`substring(${O('Date_ISO')},0,7)`,D('Month')+"?['ClaimMonth']")));
  g.get('Nominals',uri('nominals','/items?$select=Id,field_1,field_2,D01Eligible&$top=196')); validFeed(g,'Nominals',196);
  const master=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../../design/data/nominals_approved_195.json'),'utf8')).nominals.map(n=>({code:n.code,description:n.description}));
  g.compose('Approved_Nominals',master);
  g.add('Actual_Nominals',{type:'Select',inputs:{from:ex(D('Nominals')+"?['value']"),select:{code:"@item()?['field_1']",description:"@item()?['field_2']"}},runtimeConfiguration:SECURE});
  g.guard('Exact_195',all(eq(`length(${D('Actual_Nominals')})`,'195'),eq(`length(intersection(${D('Actual_Nominals')},${O('Approved_Nominals')}))`,'195')));
  g.add('Selected_Nominal',{type:'Query',inputs:{from:ex(D('Nominals')+"?['value']"),where:ex(eq("item()?['field_1']",O('Command')+"?['nominalCode']"))},runtimeConfiguration:SECURE});
  g.guard('One_Nominal',eq(`length(${D('Selected_Nominal')})`,'1'));
  unique(g,'Ledger_Initial','operations',O('Operation_Key'));
  const fresh=g.fork();
  fresh.guard('Fresh_Policy',all(eq(D('Parent_Initial')+"?['SubmissionStatus']","'Draft'"),eq(D('Month')+"?['MonthStatus']","'Open'"),eq(`first(${D('Selected_Nominal')})?['D01Eligible']`,'1')));
  fresh.get('Orphan_Lines',`concat('_api/web/lists(guid''',${B('expenses')},''')/items?$filter=D01OperationKey eq ''',${O('Operation_Key')},'''&$top=2')`); validFeed(fresh,'Orphan_Lines',2); fresh.guard('No_Orphan',`empty(${D('Orphan_Lines')}?['value'])`);
  fresh.add('Create_Operation',http('POST',uri('operations','/items'),{Title:ex(O('Operation_Key')),OperationKey:ex(O('Operation_Key')),RequestId:ex(O('Request_ID')),D01ActorId:ex(O('Actor')),ParentId:ex(O('Command')+"?['parentId']"),State:'Pending'}));
  g.branch('If_New_Operation',`empty(${D('Ledger_Initial')}?['value'])`,fresh.actions);
  unique(g,'Ledger_Current','operations',O('Operation_Key')); g.guard('One_Operation',eq(`length(${D('Ledger_Current')}?['value'])`,'1'));
  g.compose('Ledger',ex(`first(${D('Ledger_Current')}?['value'])`));
  g.guard('Ledger_Identity',all(eq(O('Ledger')+"?['HasUniqueRoleAssignments']",'false'),eq(O('Ledger')+"?['AuthorId']",B('processorActorId')),eq(O('Ledger')+"?['OperationKey']",O('Operation_Key')),eq(O('Ledger')+"?['D01ActorId']",O('Actor')),eq(O('Ledger')+"?['ParentId']",O('Command')+"?['parentId']"),`greater(${O('Ledger')}?['RequestId'],0)`));
  metadata(g,'Canonical',O('Ledger')+"?['RequestId']");
  g.guard('Same_Original_Request',all(eq(D('Canonical_Before')+"?['AuthorId']",O('Actor')),eq(D('Canonical_Binary')+"?['$content']",D('Incoming_Binary')+"?['$content']")));
  recoverRejected(g); rejectStale(g);
  // Complete work is recoverable even after closure. New/partial work needs Draft/Open.
  const pending=g.fork();
  pending.guard('Pending_Policy',all(eq(O('Ledger')+"?['State']","'Pending'"),eq(D('Parent_Initial')+"?['SubmissionStatus']","'Draft'"),eq(D('Month')+"?['MonthStatus']","'Open'"),eq(`first(${D('Selected_Nominal')})?['D01Eligible']`,'1')));
  parent(pending,'Parent_Lock');
  const acquire=g.fork(); acquire.guard('Original_Parent_Version',eq(etag('Parent_Lock'),O('Command')+"?['parentEtag']"));
  acquire.compose('New_Reservation',{mode:'Creating',key:ex(O('Operation_Key')),originalEtag:ex(O('Command')+"?['parentEtag']")});
  cas(acquire,'Reserve_Parent','claims',O('Command')+"?['parentId']",etag('Parent_Lock'),{D01Reservation:ex(`string(${O('New_Reservation')})`)});
  pending.branch('Acquire_Custody',`empty(${D('Parent_Lock')}?['D01Reservation'])`,acquire.actions);
  parent(pending,'Parent_Owned');
  pending.guard('Creating_Custody',all(eq(`json(${D('Parent_Owned')}?['D01Reservation'])?['key']`,O('Operation_Key')),eq(`json(${D('Parent_Owned')}?['D01Reservation'])?['mode']`,"'Creating'"),eq(`json(${D('Parent_Owned')}?['D01Reservation'])?['originalEtag']`,O('Command')+"?['parentEtag']")));
  policyRecheck(pending,'Before_Create','Parent_Owned');
  pending.get('Lines_Before',`concat('_api/web/lists(guid''',${B('expenses')},''')/items?$filter=D01OperationKey eq ''',${O('Operation_Key')},'''&$top=2')`); validFeed(pending,'Lines_Before',2);
  const lineBody={ Title:ex(`concat('D01-',string(${O('Actor')}),'-',${O('Command')}?['operationId'])`),ExpenseLineKey:ex(`concat('D01-',string(${O('Actor')}),'-',${O('Command')}?['operationId'])`),
    ClaimSubmissionRefId:ex(O('Command')+"?['parentId']"),ExpenseDate:ex(O('Date_ISO')),Supplier:ex(O('Command')+"?['supplier']"),ExpenseDescription:ex(O('Command')+"?['description']"),NominalCode:ex(O('Command')+"?['nominalCode']"),NominalDescription:ex(`first(${D('Selected_Nominal')})?['field_2']`),
    GrossAmount:ex(`div(float(${O('Amount_Pence')}),100)`),ClaimantNotes:ex(O('Command')+"?['notes']"),ReceiptRequired:ex(eq(receipt+"?['kind']","'file'")),IsVoided:false,LineValidationStatus:'Not Checked',
    D01Originator:ex(O('Actor')),D01RequestId:ex(O('Ledger')+"?['RequestId']"),D01OperationKey:ex(O('Operation_Key')),D01Fingerprint:ex(D('Incoming_Parse')+"?['clientFingerprint']"),D01NoReceiptReason:ex(`if(equals(${receipt}?['kind'],'none'),${receipt}?['reason'],null)`),
    D01ReceiptManifest:ex(`if(equals(${receipt}?['kind'],'file'),string(outputs('Receipt_Manifest')),null)`) };
  // A harmless object with nullable fields exists for both branches; no zero-byte file.
  const addLine=g.fork(); addLine.add('Create_Expense',http('POST',uri('expenses','/items'),lineBody)); pending.branch('If_Line_Absent',`empty(${D('Lines_Before')}?['value'])`,addLine.actions);
  g.branch('If_Not_Completed',`not(equals(${O('Ledger')}?['State'],'Completed'))`,pending.actions);
  g.get('Lines_After',`concat('_api/web/lists(guid''',${B('expenses')},''')/items?$select=${lineSelect}&$filter=D01OperationKey eq ''',${O('Operation_Key')},'''&$top=2')`); validFeed(g,'Lines_After',2); g.guard('One_Line',eq(`length(${D('Lines_After')}?['value'])`,'1'));
  g.compose('Line',ex(`first(${D('Lines_After')}?['value'])`));
  g.guard('Line_Inherits_Private_ACL',eq(O('Line')+"?['HasUniqueRoleAssignments']",'false'));
  const lineChecks=[];
  for(const [n,v] of Object.entries(lineBody)) {
    if (['Title','ExpenseDate'].includes(n)) continue;
    const value=typeof v==='string'&&v.startsWith('@')?v.slice(1):JSON.stringify(v).replace(/^"(.*)"$/,"'$1'");
    lineChecks.push(eq(n==='ClaimantNotes'?`coalesce(${O('Line')}?['${n}'],'')`:O('Line')+`?['${n}']`,value));
  }
  // Same adjacent predicates over an already read/typed line, one native guard.
  // Reclaims platform action headroom without skipping any financial binding.
  g.guard('Verify_Line_Fields',all(...lineChecks));
  g.guard('Verify_Line_Date',eq(`substring(${O('Line')}?['ExpenseDate'],0,10)`,O('Date_ISO')));
  g.get('Attachments',itemUri('expenses',O('Line')+"?['Id']",'/AttachmentFiles?$select=FileName&$top=2')); validFeed(g,'Attachments',2);
  const attach=g.fork(), addAttach=g.fork();
  addAttach.guard('Only_Pending_Attachment',eq(O('Ledger')+"?['State']","'Pending'"));
  parent(addAttach,'Parent_Attachment');
  addAttach.guard('Attachment_Custody',all(eq(`json(${D('Parent_Attachment')}?['D01Reservation'])?['key']`,O('Operation_Key')),eq(`json(${D('Parent_Attachment')}?['D01Reservation'])?['mode']`,"'Creating'")));
  policyRecheck(addAttach,'Before_Attachment','Parent_Attachment');
  addAttach.add('Attach_Receipt',http('POST',`concat('_api/web/lists(guid''',${B('expenses')},''')/items(',string(${O('Line')}?['Id']),')/AttachmentFiles/add(FileName=''',uriComponent(${receipt}?['fileName']),''')')`,ex(`base64ToBinary(${base})`),{'Content-Type':'application/octet-stream'}));
  attach.branch('If_Receipt_Absent',`empty(${D('Attachments')}?['value'])`,addAttach.actions);
  attach.get('Receipt_Names',itemUri('expenses',O('Line')+"?['Id']",'/AttachmentFiles?$select=FileName&$top=2')); validFeed(attach,'Receipt_Names',2);
  attach.guard('Receipt_Name_Linkage',all(eq(`length(${D('Receipt_Names')}?['value'])`,'1'),eq(`first(${D('Receipt_Names')}?['value'])?['FileName']`,receipt+"?['fileName']")));
  attach.add('Read_Receipt',http('GET',`concat('_api/web/lists(guid''',${B('expenses')},''')/items(',string(${O('Line')}?['Id']),')/AttachmentFiles/getByFileName(''',uriComponent(${receipt}?['fileName']),''')/$value')`,undefined,{Accept:'application/octet-stream'}));
  attach.guard('Exact_Receipt_Bytes',eq(D('Read_Receipt')+"?['$content']",base));
  const absent=g.fork(); absent.guard('No_Unexpected_Attachment',`empty(${D('Attachments')}?['value'])`);
  g.branch('Readback_Receipt',eq(receipt+"?['kind']","'file'"),attach.actions,absent.actions);
  g.get('Final_Line',itemUri('expenses',O('Line')+"?['Id']",'?$select='+lineSelect));
  g.guard('Line_Unchanged_After_Attachment',eq(`string(removeProperty(removeProperty(${D('Final_Line')},'odata.etag'),'@odata.etag'))`,`string(removeProperty(removeProperty(${O('Line')},'odata.etag'),'@odata.etag'))`));
  const storedFile={kind:'file',expenseId:ex(O('Line')+"?['Id']"),fileName:ex(receipt+"?['fileName']"),mediaType:ex(receipt+"?['mediaType']"),size:ex(V('receiptSize')),sha256:ex(receipt+"?['sha256']"),storage:{kind:'list-attachment'}};
  g.compose('Stored_File',storedFile); g.compose('Stored_None',{kind:'none',reason:ex(receipt+"?['reason']")});
  g.compose('Record',{operationId:ex(O('Command')+"?['operationId']"),requestFingerprint:ex(D('Incoming_Parse')+"?['clientFingerprint']"),etag:ex(etag('Final_Line')),
    line:{id:ex(O('Line')+"?['Id']"),parentId:ex(O('Command')+"?['parentId']"),expenseLineKey:ex(O('Line')+"?['ExpenseLineKey']"),dateIso:ex(O('Date_ISO')),supplier:ex(O('Command')+"?['supplier']"),description:ex(O('Command')+"?['description']"),nominalCode:ex(O('Command')+"?['nominalCode']"),nominalDescription:ex(O('Line')+"?['NominalDescription']"),amountPence:ex(O('Amount_Pence')),notes:ex(O('Command')+"?['notes']"),isVoided:false},receipt:ex(`if(equals(${receipt}?['kind'],'file'),outputs('Stored_File'),outputs('Stored_None'))`)});
  const finish=g.fork();
  const common=commonLedger();
  parent(finish,'Parent_Commit');
  finish.guard('Commit_Custody',all(eq(`json(${D('Parent_Commit')}?['D01Reservation'])?['key']`,O('Operation_Key')),eq(`json(${D('Parent_Commit')}?['D01Reservation'])?['mode']`,"'Creating'"),eq(D('Parent_Commit')+"?['SubmissionStatus']","'Draft'")));
  policyRecheck(finish,'Before_Commit','Parent_Commit');
  // If money was already committed, this audit necessarily existed. Recovery
  // may only validate it, never replace missing evidence after a lost ACK.
  createOnce(finish,'Audit','audit',{Title:ex(O('Operation_Key')),...common,ExpenseId:ex(O('Line')+"?['Id']"),RecordJson:ex(`string(${O('Record')})`),Event:'ExpenseCreated'},O('Operation_Key'),`not(equals(${D('Parent_Commit')}?['D01Checkpoint'],${O('Operation_Key')}))`);
  finish.guard('Audit_Server_Stamp',all(`greater(${O('Audit_Row')}?['AuthorId'],0)`,`not(empty(${O('Audit_Row')}?['Created']))`));
  const totals=g.fork();
  totals.compose('Old_Expense_Pence',ex(`int(formatNumber(mul(${D('Parent_Commit')}?['ExpenseTotal'],100),'0','en-GB'))`));
  totals.compose('Old_Mileage_Pence',ex(`int(formatNumber(mul(${D('Parent_Commit')}?['MileageTotal'],100),'0','en-GB'))`));
  totals.compose('Old_Total_Pence',ex(`int(formatNumber(mul(${D('Parent_Commit')}?['OverallTotal'],100),'0','en-GB'))`));
  totals.guard('Exact_Parent_Pence',all(...[['Expense','ExpenseTotal'],['Mileage','MileageTotal'],['Total','OverallTotal']].map(([a,b])=>eq(`div(float(outputs('Old_${a}_Pence')),100)`,D('Parent_Commit')+`?['${b}']`)),eq(`add(${O('Old_Expense_Pence')},${O('Old_Mileage_Pence')})`,O('Old_Total_Pence')),
    ...['Expense','Mileage','Total'].flatMap(n=>[`greaterOrEquals(outputs('Old_${n}_Pence'),0)`,`lessOrEquals(outputs('Old_${n}_Pence'),9007199254740991)`]),
    `greaterOrEquals(${D('Parent_Commit')}?['SubmissionVersion'],0)`,`less(${D('Parent_Commit')}?['SubmissionVersion'],9007199254740991)`,eq(`int(${D('Parent_Commit')}?['SubmissionVersion'])`,D('Parent_Commit')+"?['SubmissionVersion']"),`lessOrEquals(add(${O('Old_Total_Pence')},${O('Amount_Pence')}),9007199254740991)`));
  cas(totals,'Commit_Parent','claims',O('Command')+"?['parentId']",etag('Parent_Commit'),{ExpenseTotal:ex(`div(float(add(${O('Old_Expense_Pence')},${O('Amount_Pence')})),100)`),OverallTotal:ex(`div(float(add(${O('Old_Total_Pence')},${O('Amount_Pence')})),100)`),SubmissionVersion:ex(`add(${D('Parent_Commit')}?['SubmissionVersion'],1)`),D01Checkpoint:ex(O('Operation_Key'))});
  finish.branch('If_Not_Applied',`not(equals(${D('Parent_Commit')}?['D01Checkpoint'],${O('Operation_Key')}))`,totals.actions);
  parent(finish,'Parent_Applied'); finish.guard('Checkpoint_Readback',eq(D('Parent_Applied')+"?['D01Checkpoint']",O('Operation_Key')));
  createOnce(finish,'Result','results',{Title:ex(O('Operation_Key')),...common,State:'Completed',RecordJson:ex(`string(${O('Record')})`)},O('Operation_Key'));
  finish.get('Ledger_To_Complete',privateItemUri('operations',O('Ledger')+"?['Id']"));
  const terminal=g.fork(); cas(terminal,'Complete_Ledger','operations',O('Ledger')+"?['Id']",etag('Ledger_To_Complete'),{State:'Completed',ResultId:ex(O('Result_Row')+"?['Id']")});
  finish.branch('If_Pending_Ledger',all(eq(D('Ledger_To_Complete')+"?['State']","'Pending'"),eq(D('Ledger_To_Complete')+"?['HasUniqueRoleAssignments']",'false'),eq(D('Ledger_To_Complete')+"?['OperationKey']",O('Operation_Key')),eq(D('Ledger_To_Complete')+"?['D01ActorId']",O('Actor')),eq(D('Ledger_To_Complete')+"?['ParentId']",O('Command')+"?['parentId']"),eq(D('Ledger_To_Complete')+"?['RequestId']",O('Ledger')+"?['RequestId']")),terminal.actions);
  g.branch('If_Needs_Completion',eq(O('Ledger')+"?['State']","'Pending'"),finish.actions);
  // Completed replays must re-read the existing immutable audit. No create or
  // replacement is allowed here, even if the audit was deleted or shared.
  unique(g,'Terminal_Audit','audit',O('Operation_Key'));
  g.guard('Terminal_Audit_One',eq(`length(${D('Terminal_Audit')}?['value'])`,'1'));
  g.compose('Terminal_Audit_Row',ex(`first(${D('Terminal_Audit')}?['value'])`));
  const a=O('Terminal_Audit_Row');
  g.guard('Terminal_Audit_Bindings',all(eq(a+"?['HasUniqueRoleAssignments']",'false'),eq(a+"?['AuthorId']",B('processorActorId')),
    ...Object.entries({...common,ExpenseId:ex(O('Line')+"?['Id']"),RecordJson:ex(`string(${O('Record')})`),Event:'ExpenseCreated'}).map(([k,v])=>eq(a+`?['${k}']`,v.startsWith('@')?v.slice(1):`'${v}'`)),
    `not(empty(${a}?['Created']))`,`greater(ticks(${a}?['Created']),0)`));
  g.get('Ledger_Verified',privateItemUri('operations',O('Ledger')+"?['Id']"));
  g.guard('Terminal_Ledger',all(eq(D('Ledger_Verified')+"?['HasUniqueRoleAssignments']",'false'),eq(D('Ledger_Verified')+"?['State']","'Completed'"),eq(D('Ledger_Verified')+"?['OperationKey']",O('Operation_Key')),eq(D('Ledger_Verified')+"?['D01ActorId']",O('Actor')),eq(D('Ledger_Verified')+"?['ParentId']",O('Command')+"?['parentId']"),eq(D('Ledger_Verified')+"?['RequestId']",O('Ledger')+"?['RequestId']")));
  g.get('Result_Verified',privateItemUri('results',D('Ledger_Verified')+"?['ResultId']"));
  g.guard('Terminal_Result',all(eq(D('Result_Verified')+"?['HasUniqueRoleAssignments']",'false'),eq(D('Result_Verified')+"?['AuthorId']",B('processorActorId')),eq(D('Result_Verified')+"?['OperationKey']",O('Operation_Key')),eq(D('Result_Verified')+"?['RequestId']",O('Ledger')+"?['RequestId']"),eq(D('Result_Verified')+"?['D01ActorId']",O('Actor')),eq(D('Result_Verified')+"?['ParentId']",O('Command')+"?['parentId']"),eq(D('Result_Verified')+"?['State']","'Completed'"),eq(D('Result_Verified')+"?['RecordJson']",`string(${O('Record')})`)));
  parent(g,'Parent_Release'); const release=g.fork();
  release.guard('Only_Own_Creating_Release',eq(`json(${D('Parent_Release')}?['D01Reservation'])?['mode']`,"'Creating'"));
  cas(release,'Release_Parent','claims',O('Command')+"?['parentId']",etag('Parent_Release'),{D01Reservation:''});
  g.branch('If_Own_Reservation',`and(not(empty(${D('Parent_Release')}?['D01Reservation'])),equals(json(if(empty(${D('Parent_Release')}?['D01Reservation']),'{}',${D('Parent_Release')}?['D01Reservation']))?['key'],${O('Operation_Key')}))`,release.actions);
  parent(g,'Released_Parent'); g.guard('Release_Readback',`not(equals(json(if(empty(${D('Released_Parent')}?['D01Reservation']),'{}',${D('Released_Parent')}?['D01Reservation']))?['key'],${O('Operation_Key')}))`);
  g.compose('Storage_Verified',{state:'StorageVerified',operationKey:ex(O('Operation_Key')),expenseId:ex(O('Line')+"?['Id']")});
}
function buildFlow() {
  const g=graph();
  g.add('Validate_Bindings',{type:'ParseJson',inputs:{content:ex("parameters('Bindings')"),schema:bindingSchema},runtimeConfiguration:SECURE});
  g.guard('Distinct_List_Bindings',eq(`length(union(createArray(${Object.keys(bindingSchema.properties).slice(0,9).map(n=>`toLower(${B(n)})`).join(',')}),createArray(${Object.keys(bindingSchema.properties).slice(0,9).map(n=>`toLower(${B(n)})`).join(',')})))`,'9'));
  g.get('Processor_Identity',"'_api/web/currentuser?$select=Id'");
  g.guard('Dedicated_Processor',all(eq(D('Processor_Identity')+"?['Id']",B('processorActorId')),`not(equals(${B('fixtureActorId')},${B('processorActorId')}))`));
  for(const list of Object.keys(bindingSchema.properties).slice(0,9)) {
    g.get('Schema_'+list,uri(list,'?$select=Id,HasUniqueRoleAssignments,EnableVersioning,EnableAttachments,RootFolder/ServerRelativeUrl&$expand=RootFolder'));
    g.guard('Private_'+list,all(eq(`toLower(${D('Schema_'+list)}?['Id'])`,`toLower(${B(list)})`),eq(D('Schema_'+list)+"?['HasUniqueRoleAssignments']",'true'),eq(D('Schema_'+list)+"?['EnableVersioning']",'true'),...(list==='expenses'?[eq(D('Schema_'+list)+"?['EnableAttachments']",'true')]:[])));
    g.get('ACL_'+list,uri(list,'/roleassignments?$select=Member/Id,Member/PrincipalType,RoleDefinitionBindings/Id,RoleDefinitionBindings/BasePermissions&$expand=Member,RoleDefinitionBindings&$top=3'));
    validFeed(g,'ACL_'+list,3);
    const low="int(first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low'])";
    const processorMask=['expenses','operations'].includes(list)?7:list==='claims'?5:['results','audit'].includes(list)?3:1;
    g.add('ACL_Users_'+list,{type:'Query',inputs:{from:ex(D('ACL_'+list)+"?['value']"),where:ex(all(eq("item()?['Member']?['PrincipalType']",'1'),`or(equals(item()?['Member']?['Id'],${B('fixtureActorId')}),equals(item()?['Member']?['Id'],${B('processorActorId')}))`,eq("length(item()?['RoleDefinitionBindings'])",'1'),eq(`mod(${low},8)`,`if(equals(item()?['Member']?['Id'],${B('fixtureActorId')}),${list==='requests'?3:1},${processorMask})`),`less(mod(${low},16),8)`,`less(mod(${low},256),128)`,`less(mod(${low},4096),2048)`,`less(mod(${low},67108864),33554432)`,`less(mod(${low},2147483648),1073741824)`))},runtimeConfiguration:SECURE});
    g.guard('ACL_Two_Users_'+list,all(eq(`length(${D('ACL_'+list)}?['value'])`,'2'),eq(`length(${D('ACL_Users_'+list)})`,'2')));
    g.add('ACL_Snapshot_'+list,{type:'Select',inputs:{from:ex(D('ACL_Users_'+list)),select:{principalId:"@item()?['Member']?['Id']",roleId:"@first(item()?['RoleDefinitionBindings'])?['Id']",high:"@first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['High']",low:"@first(item()?['RoleDefinitionBindings'])?['BasePermissions']?['Low']"}},runtimeConfiguration:SECURE});
    g.guard('ACL_Exact_'+list,eq(`length(intersection(${D('ACL_Snapshot_'+list)},${B('acl')}?['${list}']))`,'2'));
  }
  // Actor folder must inherit the already exact private library ACL; a folder
  // sharing exception cannot silently widen raw request/receipt access.
  g.get('Request_Folder_ACL',`concat('_api/web/GetFolderByServerRelativeUrl(''',${B('requestRoot')},'/',string(${B('fixtureActorId')}),''')/ListItemAllFields?$select=HasUniqueRoleAssignments')`);
  g.guard('Request_Folder_Inherits',eq(D('Request_Folder_ACL')+"?['HasUniqueRoleAssignments']",'false'));
  g.guard('Request_Library_Path',eq(D('Schema_requests')+"?['RootFolder']?['ServerRelativeUrl']",B('requestRoot')));
  fieldContract(g);
  g.compose('Request_ID',ex("int(triggerBody()?['ID'])")); g.guard('Request_ID_Positive',`greater(${O('Request_ID')},0)`);
  metadata(g,'Incoming',O('Request_ID'));
  g.compose('Command',ex(D('Incoming_Parse')+"?['command']"));
  g.compose('Actor',ex(D('Incoming_Before')+"?['AuthorId']"));
  g.compose('Operation_Key',ex(`concat(string(${O('Actor')}),':',${O('Command')}?['operationId'])`));
  g.guard('Fixture_Parent',eq(O('Command')+"?['parentId']",B('fixtureParentId')));
  g.compose('Date_ISO',ex(`concat(substring(${O('Command')}?['date'],6,4),'-',substring(${O('Command')}?['date'],3,2),'-',substring(${O('Command')}?['date'],0,2))`));
  financialActions(g);
  const definition={$schema:'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',contentVersion:'1.0.0.0',parameters:{
    $authentication:{defaultValue:{},type:'SecureObject'},$connections:{defaultValue:{},type:'Object'},Bindings:{defaultValue:{},type:'Object'}},
    triggers:{Request_File_Created:{type:'OpenApiConnection',recurrence:{frequency:'Minute',interval:1},splitOn:"@triggerOutputs()?['body/value']",inputs:{host:{apiId:API,connectionName:'shared_sharepointonline',operationId:'GetOnNewFileItems'},parameters:{dataset:SITE,table:ex(B('requests')),folderPath:ex(`concat(${B('requestRoot')},'/',string(${B('fixtureActorId')}))`)},authentication:"@parameters('$authentication')"},runtimeConfiguration:{...SECURE,concurrency:{runs:1}}}},
    actions:{Initialise:{type:'InitializeVariable',inputs:{variables:[{name:'receiptSize',type:'integer',value:0}]},runAfter:{},runtimeConfiguration:SECURE},Process:{type:'Scope',actions:g.actions,runAfter:{Initialise:['Succeeded']}},Pending:{type:'Terminate',inputs:{runStatus:'Failed',runError:{code:'D01_PENDING',message:'Outcome unconfirmed. Reconcile the same sealed request; never submit a new operation.'}},runAfter:{Process:['Failed','TimedOut']}}},outputs:{}};
  return {properties:{connectionReferences:{shared_sharepointonline:{api:{name:'shared_sharepointonline'},connection:{connectionReferenceLogicalName:'kcf_D01SharePoint'},runtimeSource:'embedded'}},definition,templateName:null},schemaVersion:'1.0.0.0'};
}
if (require.main===module) {
  const output=path.join(__dirname,'D01ExpenseProcessor.json');
  fs.writeFileSync(output,JSON.stringify(buildFlow(),null,2)+'\n');
  fs.writeFileSync(path.join(__dirname,'bindings.schema.json'),JSON.stringify(heldBindingSchema(),null,2)+'\n');
  console.log('Native WDL source generated. Not imported, bound, enabled, tenant-tested or release-ready.');
}
function buildActorAdmissionFlow() { return require('./actor-admission.cjs').buildActorAdmissionFlow(); }
function buildActorProcessorFlow() { return require('./actor-writer.cjs').buildActorProcessorFlow(); }
function buildActorProcessorMachineFlow() { return require('./actor-writer-machine.cjs').buildActorWriterMachine().flow; }
module.exports={buildFlow,buildActorAdmissionFlow,buildActorProcessorFlow,buildActorProcessorMachineFlow,requestSchema,bindingSchema,SITE,
  nativeWdl:{graph,B,O,D,ex,eq,all,uri,itemUri,SECURE,metadataContent,requestMetadataSelect,id,str,obj,guid,http,etag,fieldContract,financialActions}};
