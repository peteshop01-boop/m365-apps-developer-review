/** C2a generated Power Automate actions. Node only generates JSON; C2b is NOT implemented. */
export const LIMITS = { actions: 500, nesting: 8, pages: 60, rows: 5000, expression: 8192 };
const text = { type: 'string', minLength: 1, maxLength: 255, pattern: '^[^\\s][^\\u0000-\\u001f\\u007f]*$' };
const key = { type: 'string', minLength: 1, maxLength: 255, pattern: '^[A-Za-z0-9_.|-]+$' };
const etag = { ...text, pattern: '^(?!\\*$)(?!\\s)(?!.*\\s$)[^\\u0000-\\u001f\\u007f]+$' };
const integer = { type: 'integer', minimum: 0, maximum: 9007199254740991 };
const number = { type: 'number' };
const object = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required, additionalProperties: false });
const array = (items, maxItems = LIMITS.rows) => ({ type: 'array', items, maxItems });
const nullable = schema => ({ anyOf: [schema, { type: 'null' }] });
const quarter = object({ quarter: { enum: ['Q1', 'Q2', 'Q3', 'Q4'] }, targetValue: number, targetText: { type: 'string', maxLength: 255 }, commitment: { type: 'string', maxLength: 255 }, successDefinition: { type: 'string' } }, ['quarter']);
export const UPSERT_SCHEMA = object({ kpiId: key, role: { enum: ['AccountableOwner', 'DeliveryLead', 'Contributor', 'Oversight', 'EvidenceProvider'] }, contributionMethod: { enum: ['AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight'] }, quarterTargets: { ...array(quarter, 4), minItems: 4 }, displayOrder: integer, activeInWorkplan: { type: 'boolean' }, annualTargetValue: number, annualTargetText: { type: 'string' }, sharedTargetRule: { enum: ['VisibleOnly', 'ApprovedApportionment'] }, sharedApportionmentPercent: { type: 'number', minimum: 0, maximum: 100 }, governanceReference: { type: 'string' }, denominatorNumerator: number, denominatorValue: number, denominatorUnit: { type: 'string' }, denominatorRuleReference: { type: 'string' }, denominatorSourceReference: { type: 'string' } }, ['kpiId', 'role', 'contributionMethod', 'quarterTargets', 'displayOrder', 'activeInWorkplan']);
const envelope = object({ commandKey: key, commandType: { enum: ['CreateWorkplanDraft', 'UpsertCoreContributionV2'] }, personKey: key, performanceYear: { enum: [2027] }, workplanKey: key, subjectType: { enum: ['Workplan', 'WorkplanItem'] }, subjectKey: key, expectedHeaderETag: nullable(etag), expectedHeaderToken: integer, expectedItemETag: nullable(etag), payload: { type: 'object' } });
const actor = object({ key, email: text, active: { type: 'boolean' }, roles: array({ enum: ['Employee', 'Manager', 'SLT', 'AppAdmin'] }, 4), manager: nullable(key) });
const context = object({ environment: { enum: ['TEST'] }, year: { enum: [2027] }, site: text, commandList: key, headerList: key, itemList: key, sourceId: { ...integer, minimum: 1 }, sourceVersion: text, sourceETag: etag, actorKey: key, actorEmail: text, managerKey: key, managerEmail: text, mappingValid: { enum: [true] }, revision: { ...integer, minimum: 1 }, phase: { enum: ['Active'] }, epoch: key, actors: array(actor), reference: object({ kpiId: key, kpiVersion: key, targetVersion: key, year: { enum: [2027] }, active: { enum: [true] }, published: { enum: [true] }, unit: { type: 'string' } }), headerEntityType: text, itemEntityType: text });
const source = object({ id: { ...integer, minimum: 1 }, author: text, editor: text, version: text, etag, created: text, modified: text, envelope });
const grant = object({ reader: key, key, kind: { enum: ['Grant', 'StatusGrant'] } });
const b = n => `body('${n}')`, o = n => `outputs('${n}')`, v = n => `variables('${n}')`, f = (x, k) => `${x}?['${k}']`, c = k => f(b('C2B_Context'), k), e = k => f(o('Admitted_Envelope'), k), p = k => f(v('Payload'), k), quote = s => `'${s.replace(/'/g, "''")}'`;
const equal = (x, y) => `equals(${x},${y})`, and = (...xs) => xs.length > 1 ? `and(${xs.join(',')})` : xs[0] || 'equals(true,true)';
let names;
class Graph {
  constructor() { this.actions = {}; this.previous = null; }
  add(name, action) { if (names.has(name)) throw Error(`Duplicate action ${name}`); names.add(name); this.actions[name] = { ...action, runAfter: this.previous ? { [this.previous]: ['Succeeded'] } : {} }; this.previous = name; return name; }
  compose(name, inputs) { this.add(name, { type: 'Compose', inputs }); }
  set(name, variable, value) { this.add(name, { type: 'SetVariable', inputs: { name: variable, value } }); }
  append(name, variable, value) { this.add(name, { type: 'AppendToArrayVariable', inputs: { name: variable, value } }); }
  parse(name, content, schema) { this.add(name, { type: 'ParseJson', inputs: { content, schema } }); }
  require(name, expression) { const no = new Graph(); no.parse(name + '_Reject', null, { type: 'object' }); this.branch(name, expression, new Graph(), no); }
  branch(name, expression, yes, no) { this.add(name, { type: 'If', expression: '@' + expression, actions: yes.actions, else: { actions: no.actions } }); }
  each(name, collection, graph) { this.add(name, { type: 'Foreach', foreach: '@' + collection, operationOptions: 'Sequential', actions: graph.actions }); }
  query(name, from, where) { this.add(name, { type: 'Query', inputs: { from: '@' + from, where: '@' + where } }); }
}
// Missing dependencies are failing Parse JSON actions, never synthetic receipts or caller-controlled flags.
const boundary = (g, name, schema) => g.parse(name, null, schema);
const listUri = (list, suffix = '/items') => `concat('_api/web/lists(guid''',${c(list)},''')${suffix}')`;
function request(g, name, method, uri, body, tag) {
  g.add(name, { type: 'OpenApiConnection', inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connectionName: 'shared_sharepointonline', operationId: 'HttpRequest' }, parameters: { dataset: '@' + c('site'), 'parameters/method': method, 'parameters/uri': '@' + uri, 'parameters/headers': { Accept: 'application/json;odata=verbose', 'Content-Type': 'application/json;odata=verbose', ...(tag ? { 'If-Match': '@' + tag, 'X-HTTP-Method': 'MERGE' } : {}) }, ...(body ? { 'parameters/body': '@string(' + body + ')' } : {}) }, retryPolicy: { type: 'none' }, authentication: "@parameters('$authentication')" } });
}
function sourceRead(g, prefix) {
  g.add(prefix, { type: 'OpenApiConnection', inputs: { host: { apiId: '/providers/Microsoft.PowerApps/apis/shared_sharepointonline', connectionName: 'shared_sharepointonline', operationId: 'GetItem' }, parameters: { dataset: '@' + c('site'), table: '@' + c('commandList'), id: '@' + c('sourceId') }, retryPolicy: { type: 'none' }, authentication: "@parameters('$authentication')" } });
  sourceSnapshot(g, prefix);
}
// Both representations call these same builders. Fixtures never replace a C2b boundary.
function sourceSnapshot(g, prefix) {
  g.compose(prefix + '_Snapshot', { id: '@' + f(b(prefix), 'ID'), author: '@' + f(f(b(prefix), 'Author'), 'Email'), editor: '@' + f(f(b(prefix), 'Editor'), 'Email'), version: '@' + f(b(prefix), '{VersionNumber}'), etag: '@' + f(b(prefix), '@odata.etag'), created: '@' + f(b(prefix), 'Created'), modified: '@' + f(b(prefix), 'Modified'), rawPayload: '@' + f(b(prefix), 'PayloadJSON'), outer: '@' + b(prefix) });
}
const plainString = { type: 'string' }, opaque = { type: 'string', minLength: 1 };
const asciiKey = { type: 'string', minLength: 1, maxLength: 255 };
const finiteNumber = { type: 'number', minimum: -Number.MAX_VALUE, maximum: Number.MAX_VALUE };
// Retain every Core field. No new text cap, NFC rule or safe-integer restriction on displayOrder.
const coreSchema = JSON.parse(JSON.stringify(UPSERT_SCHEMA));
coreSchema.properties.kpiId = asciiKey;
coreSchema.properties.displayOrder = { type: 'integer', minimum: 0, maximum: Number.MAX_VALUE };
for (const k of ['annualTargetValue', 'denominatorNumerator', 'denominatorValue']) coreSchema.properties[k] = finiteNumber;
coreSchema.properties.quarterTargets.items.properties.targetValue = finiteNumber;
const bindingSchema = object({ commandKey: { type: 'string', minLength: 36, maxLength: 36 }, commandType: { enum: ['CreateWorkplanDraft', 'UpsertCoreContributionV2'] }, subjectType: { enum: ['Workplan', 'WorkplanItem'] }, subjectKey: asciiKey, personKey: asciiKey, performanceYear: { enum: [2027] }, workplanKey: asciiKey });
const headerSchema = object({ presence: { enum: ['Absent', 'Present'] }, token: { type: 'string', minLength: 1, maxLength: 16 }, etag: nullable(opaque) });
const itemSchema = { oneOf: [object({ presence: { enum: ['Absent', 'NotApplicable'] } }), object({ presence: { enum: ['Present'] }, etag: opaque })] };
export const ADMISSION_SCHEMA = object({ schemaVersion: { enum: ['kcf.kpi.test-command.v2'] }, binding: bindingSchema, expected: object({ header: headerSchema, item: itemSchema }), payload: { type: 'object' } });
const capturedSourceSchema = object({ id: { ...integer, minimum: 1 }, author: opaque, editor: opaque, version: opaque, etag: opaque, created: opaque, modified: opaque, rawPayload: plainString, outer: { type: 'object' } });
const ac = k => f(o('Admission_Context'), k);
const wire = k => f(b('Parse_Admission'), k), wb = k => f(wire('binding'), k), wh = k => f(f(wire('expected'), 'header'), k), wi = k => f(f(wire('expected'), 'item'), k), wp = k => f(wire('payload'), k);
const residue = (value, alphabet) => [...alphabet].reduce((s, ch) => `replace(${s},${quote(ch)},'')`, value);
const present = value => `not(empty(trim(${value})))`;
function admission(g) {
  g.require('Source_Observations_Match', equal(o('Source_A_Snapshot'), o('Source_B_Snapshot')));
  g.parse('Validate_Source', '@' + o('Source_A_Snapshot'), capturedSourceSchema);
  const s = k => f(b('Validate_Source'), k), outer = k => f(s('outer'), k);
  g.require('Immutable_Source', and(equal(s('id'), ac('sourceId')), equal(s('version'), ac('sourceVersion')), equal(s('etag'), ac('sourceETag')), equal(s('author'), ac('actorEmail')), equal(s('editor'), ac('actorEmail')), equal(s('created'), s('modified')), equal(s('version'), "'1.0'"), `not(equals(${s('etag')},'*'))`, `not(equals(${s('id')},6))`));
  g.compose('Source_Created_Ticks', '@ticks(' + s('created') + ')');
  // Sole authority parse: no json(PayloadJSON), numeric fallback, coercion or second parser.
  g.parse('Parse_Admission', '@' + s('rawPayload'), ADMISSION_SCHEMA);
  g.require('Token_Digits', equal(residue(wh('token'), '0123456789'), "''"));
  g.require('Token_Canonical', `or(equals(${wh('token')},'0'),not(startsWith(${wh('token')},'0')))`);
  // Equal-length ASCII digits are compared lexically BEFORE int. Native equivalence is unproven.
  g.require('Token_Safe_Range', `or(less(length(${wh('token')}),16),lessOrEquals(${wh('token')},'9007199254740991'))`);
  g.require('Token_Operation_Range', `if(equals(${wb('commandType')},'CreateWorkplanDraft'),equals(${wh('token')},'0'),and(not(equals(${wh('token')},'0')),or(less(length(${wh('token')}),16),lessOrEquals(${wh('token')},'9007199254740989'))))`);
  g.compose('Admitted_Token', '@int(' + wh('token') + ')');
  g.require('Token_Roundtrip', equal(`string(${o('Admitted_Token')})`, wh('token')));
  const cmd = wb('commandKey');
  g.require('Command_GUID', and(...[8,13,18,23].map(i => equal(`substring(${cmd},${i},1)`, "'-'")), equal(residue(`replace(${cmd},'-','')`, '0123456789abcdef'), "''"), equal(`length(replace(${cmd},'-',''))`, '32'), `contains('12345',substring(${cmd},14,1))`, `contains('89ab',substring(${cmd},19,1))`));
  g.require('Wire_Binding', and(equal(residue(wb('personKey'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.@-'), "''"), equal(wb('personKey'), ac('actorKey')), equal(wb('workplanKey'), `concat(${ac('actorKey')},'|2027')`), equal(wb('performanceYear'), ac('year')), equal(`toLower(${ac('actorEmail')})`, ac('actorEmail'))));
  g.require('Outer_Binding', and(...[['CommandKey','commandKey'],['CommandType','commandType'],['SubjectType','subjectType'],['SubjectKey','subjectKey'],['PersonKey','personKey'],['PerformanceYear','performanceYear']].map(([a,z]) => equal(outer(a), wb(z))), equal(outer('ExpectedRowVersionToken'), 'null'), equal(outer('Quarter'), 'null'), equal(outer('ClientCorrelationKey'), wb('commandKey')), equal(outer('ExpectedETag'), wh('etag'))));
  const create = new Graph(); create.parse('Admission_Create_Payload', '@' + wire('payload'), object({}));
  create.require('Admission_Create_Binding', and(equal(wb('subjectType'), "'Workplan'"), equal(wb('subjectKey'), wb('workplanKey')), equal(wh('presence'), "'Absent'"), equal(wh('etag'), 'null'), equal(wi('presence'), "'NotApplicable'")));
  const upsert = new Graph(); upsert.parse('Admission_Core_Payload', '@' + wire('payload'), coreSchema);
  // Producer caps both optional fields in UTF-16 code units, including inactive Core.
  // M193 establishes length/retained-schema behaviour for the selected well-formed cases.
  const textLengths = new Graph();
  for (const field of ['targetText', 'commitment']) {
    const supplied = new Graph();
    supplied.require('Admission_' + field + '_UTF16', `lessOrEquals(length(item()?['${field}']),255)`);
    textLengths.branch('Admission_Has_' + field, `contains(item(),'${field}')`, supplied, new Graph());
  }
  upsert.each('Admission_Quarter_Text_Lengths', wp('quarterTargets'), textLengths);
  upsert.require('Admission_Core_Binding', and(equal(wb('subjectType'), "'WorkplanItem'"), equal(wb('subjectKey'), `concat(${wb('workplanKey')},'|CoreGold|',${wp('kpiId')})`), equal(residue(wp('kpiId'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_.|-'), "''"), equal(wh('presence'), "'Present'"), `not(equals(${wh('etag')},null))`, `not(equals(${wh('etag')},'*'))`, `or(equals(${wi('presence')},'Absent'),and(equals(${wi('presence')},'Present'),not(equals(${wi('etag')},'*'))))`));
  const quarters = ['Q1','Q2','Q3','Q4'];
  for (const q of quarters) { upsert.query('Admission_' + q, wp('quarterTargets'), equal(f('item()', 'quarter'), quote(q))); upsert.require('Admission_' + q + '_Once', equal(`length(${b('Admission_' + q)})`, '1')); }
  const active = new Graph();
  const method = (name, fields, checks) => { const branch = new Graph(); branch.require('Admission_' + name + '_Fields', and(...fields.map(k => `contains(${wire('payload')},'${k}')`))); branch.require('Admission_' + name + '_Values', and(...checks)); active.branch('Admission_' + name, equal(wp('contributionMethod'), quote(name)), branch, new Graph()); };
  method('AdditiveDirect', ['annualTargetValue'], quarters.map(q => `contains(first(${b('Admission_' + q)}),'targetValue')`));
  method('CompletionOversight', [], quarters.flatMap(q => ['commitment','successDefinition'].map(k => `contains(first(${b('Admission_' + q)}),'${k}')`)));
  const oversight = new Graph(); oversight.require('Admission_Oversight_Text', and(...quarters.flatMap(q => ['commitment','successDefinition'].map(k => present(`first(${b('Admission_' + q)})?['${k}']`))))); active.branch('Admission_Oversight_Presence', equal(wp('contributionMethod'), "'CompletionOversight'"), oversight, new Graph());
  method('SharedTarget', ['annualTargetText','sharedTargetRule','governanceReference'], [present(wp('annualTargetText')), present(wp('governanceReference'))]);
  const apport = new Graph(); apport.require('Admission_Apportionment_Present', `contains(${wire('payload')},'sharedApportionmentPercent')`); apport.require('Admission_Apportionment_Positive', `greater(${wp('sharedApportionmentPercent')},0)`); active.branch('Admission_Apportionment', and(equal(wp('contributionMethod'), "'SharedTarget'"), equal(wp('sharedTargetRule'), "'ApprovedApportionment'")), apport, new Graph());
  method('WeightedDenominator', ['annualTargetText','denominatorNumerator','denominatorValue','denominatorUnit','denominatorRuleReference','denominatorSourceReference'], [...['annualTargetText','denominatorUnit','denominatorRuleReference','denominatorSourceReference'].map(k => present(wp(k))), `greater(${wp('denominatorValue')},0)`]);
  method('AccountableOwner', ['annualTargetText'], [equal(wp('role'), "'AccountableOwner'"), present(wp('annualTargetText'))]);
  upsert.branch('Admission_Active_Core', equal(wp('activeInWorkplan'), 'true'), active, new Graph());
  g.branch('Admission_Command', equal(wb('commandType'), "'CreateWorkplanDraft'"), create, upsert);
  g.compose('Admitted_Envelope', { ...Object.fromEntries(['commandKey','commandType','personKey','performanceYear','workplanKey','subjectType','subjectKey'].map(k => [k,'@'+wb(k)])), expectedHeaderETag: '@'+wh('etag'), expectedHeaderToken: '@'+o('Admitted_Token'), expectedItemETag: '@'+wi('etag'), payload: '@'+wire('payload') });
}
// Shared second admission stage follows real observations in the canonical graph.
function admissionExpectations(g, headers, rows) {
  g.require('Admission_Header_Count', `lessOrEquals(length(${headers}),1)`);
  const each = new Graph(), row = "items('Admission_Rows_Loop')";
  each.require('Admission_Row_Owner', and(equal(f(row,'WorkplanKey'),wb('workplanKey')),equal(f(row,'PersonKey'),wb('personKey')),equal(f(row,'PerformanceYear'),'2027'),equal(f(row,'WorkplanVersion'),'1')));
  for (const field of ['Id','WorkplanItemKey','WorkplanItemNaturalKey']) { each.query('Admission_Unique_'+field,rows,equal(f('item()',field),f(row,field))); each.require('Admission_One_'+field,equal(`length(${b('Admission_Unique_'+field)})`,'1')); }
  g.each('Admission_Rows_Loop',rows,each);
  const create = new Graph(); create.require('Admission_Create_Empty', and(equal(`length(${headers})`, '0'), equal(`length(${rows})`, '0')));
  const upsert = new Graph(); upsert.require('Admission_Header_Present', equal(`length(${headers})`, '1'));
  const h = `first(${headers})`;
  upsert.require('Admission_Header_Match', and(...[['WorkplanKey',wb('workplanKey')],['PersonKey',wb('personKey')],['PerformanceYear','2027'],['WorkplanVersion','1'],['State',"'Draft'"],['TransitionStatus',"'Ready'"],['AccessState',"'EmployeeEdit'"],['RowVersionToken',o('Admitted_Token')],['CoreCategoryWeight','70'],['PersonalCategoryWeight','20'],['BehaviourCategoryWeight','10'],['CoreWeightingMode',"'Equal'"]].map(([k,val]) => equal(f(h,k),val)), equal(f(f(h,'__metadata'),'etag'),wh('etag')), equal(wp('kpiId'), f(ac('reference'),'kpiId'))));
  upsert.query('Admission_Item_Matches', rows, equal(f('item()','WorkplanItemNaturalKey'),wb('subjectKey')));
  const matches=b('Admission_Item_Matches');
  upsert.query('Admission_Item_Key_Matches',rows,equal(f('item()','WorkplanItemKey'),wb('subjectKey')));
  upsert.require('Admission_Item_Key_Collision',equal(`length(${b('Admission_Item_Key_Matches')})`,`length(${matches})`));
  const existing=new Graph(); existing.require('Admission_Item_One', equal(`length(${matches})`,'1')); existing.require('Admission_Item_Match',and(equal(f(`first(${matches})`,'WorkplanItemKey'),wb('subjectKey')),equal(f(f(`first(${matches})`,'__metadata'),'etag'),wi('etag'))));
  const absent=new Graph(); absent.require('Admission_Item_Absent',equal(`length(${matches})`,'0'));
  upsert.branch('Admission_Item_State',equal(wi('presence'),"'Present'"),existing,absent);
  g.branch('Admission_Observed_Command',equal(wb('commandType'),"'CreateWorkplanDraft'"),create,upsert);
  g.compose('Admission_Evidence', { wireVersion:'kcf.kpi.test-command.v2', policyVersion:'kcf.kpi.test-admission.v2', source:'@'+b('Validate_Source'), rawPayload:'@'+f(b('Validate_Source'),'rawPayload'), admittedTokenText:'@'+wh('token'), admittedExpected:'@'+wire('expected'), admittedWire:'@'+b('Parse_Admission'), beforeHeader:'@'+headers, beforeRows:'@'+rows });
}
export function buildAdmissionProofDefinition(fixture) {
  if (!fixture || Object.keys(fixture).sort().join(',') !== 'context,headers,rows,sourceA,sourceB') throw Error('Exact synthetic fixture required.');
  names=new Set(); const g=new Graph();
  // Fixture constants are Parse JSON object content, not expression-interpolated Compose inputs.
  for (const [name,value] of [['Proof_Context',fixture.context],['Source_A',fixture.sourceA],['Source_B',fixture.sourceB],['Proof_Headers',fixture.headers],['Proof_Rows',fixture.rows]]) g.parse(name, JSON.stringify(value), {type: Array.isArray(value)?'array':'object'});
  g.compose('Admission_Context', '@'+b('Proof_Context'));
  sourceSnapshot(g,'Source_A'); sourceSnapshot(g,'Source_B'); admission(g); admissionExpectations(g,b('Proof_Headers'),b('Proof_Rows'));
  return {properties:{connectionReferences:{},definition:{$schema:'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#',contentVersion:'0.0.2.2',triggers:{},actions:g.actions,outputs:{}}}};
}
function pages(g, prefix, list, target) {
  g.set(prefix + '_Reset', target, []); g.set(prefix + '_Seen', 'Seen', []);
  g.set(prefix + '_First', 'Next', `@concat(${listUri(list)},'?$top=500&$filter=',uriComponent(concat('WorkplanKey eq ''',${v('WorkplanKey')},'''')))`);
  const loop = new Graph(); loop.require(prefix + '_NewCursor', `not(contains(${v('Seen')},${v('Next')}))`); loop.append(prefix + '_Remember', 'Seen', '@' + v('Next'));
  request(loop, prefix + '_GET', 'GET', v('Next'));
  loop.parse(prefix + '_Page', '@' + f(b(prefix + '_GET'), 'd'), object({ results: array({ type: 'object' }), __next: text }, ['results']));
  const collect = new Graph(); collect.append(prefix + '_Append', target, '@item()'); loop.each(prefix + '_Each', f(b(prefix + '_Page'), 'results'), collect);
  loop.require(prefix + '_RowLimit', `lessOrEquals(length(${v(target)}),${LIMITS.rows})`);
  loop.compose(prefix + '_RawNext', `@coalesce(${f(b(prefix + '_Page'), '__next')},'')`);
  loop.require(prefix + '_NextScope', `or(empty(${o(prefix + '_RawNext')}),startsWith(${o(prefix + '_RawNext')},concat(${c('site')},'/',${listUri(list)},'?')))`);
  loop.set(prefix + '_Next', 'Next', `@if(empty(${o(prefix + '_RawNext')}),'',substring(${o(prefix + '_RawNext')},add(length(${c('site')}),1)))`);
  g.add(prefix + '_Until', { type: 'Until', expression: `@empty(${v('Next')})`, limit: { count: LIMITS.pages, timeout: 'PT10M' }, actions: loop.actions }); g.require(prefix + '_Complete', `empty(${v('Next')})`);
}
function compareRows(g, prefix, expected, actual) {
  g.require(prefix + '_Count', equal(`length(${expected})`, `length(${actual})`));
  const rows = new Graph(); rows.query(prefix + '_Match', actual, equal(f('item()', 'WorkplanItemKey'), f(`items('${prefix}_Rows')`, 'WorkplanItemKey'))); rows.require(prefix + '_One', equal(`length(${b(prefix + '_Match')})`, '1'));
  const fields = new Graph(); fields.require(prefix + '_Field', and(equal(`contains(items('${prefix}_Rows'),item())`, `contains(first(${b(prefix + '_Match')}),item())`), equal(`items('${prefix}_Rows')?[item()]`, `first(${b(prefix + '_Match')})?[item()]`)));
  rows.each(prefix + '_Fields', o('Physical_Item_Fields'), fields); g.each(prefix + '_Rows', expected, rows);
}
function validateRows(g, prefix, rows) {
  g.set(prefix + '_KeysReset', 'Keys', []); g.set(prefix + '_NaturalReset', 'Natural', []);
  const loop = new Graph(); loop.require(prefix + '_Owner', and(equal(f('item()', 'PersonKey'), c('actorKey')), equal(f('item()', 'WorkplanKey'), v('WorkplanKey')), equal(f('item()', 'PerformanceYear'), '2027'), equal(f('item()', 'WorkplanVersion'), '1'), `empty(item()?['ContributionAuditReference'])`));
  loop.require(prefix + '_Unique', and(`not(contains(${v('Keys')},item()?['WorkplanItemKey']))`, `not(contains(${v('Natural')},item()?['WorkplanItemNaturalKey']))`)); loop.append(prefix + '_Key', 'Keys', "@item()?['WorkplanItemKey']"); loop.append(prefix + '_Natural', 'Natural', "@item()?['WorkplanItemNaturalKey']"); g.each(prefix + '_Loop', rows, loop);
}
function grants(g, prefix, collection) {
  const loop = new Graph(); loop.query(prefix + '_Reader', c('actors'), and(equal(f('item()', 'key'), f(`items('${prefix}_Loop')`, 'reader')), equal(f('item()', 'active'), 'true'))); loop.require(prefix + '_One', equal(`length(${b(prefix + '_Reader')})`, '1'));
  loop.query(prefix + '_Resource', v('Intended'), equal(f('item()', 'WorkplanItemKey'), f(`items('${prefix}_Loop')`, 'key'))); loop.require(prefix + '_ResourceKnown', `or(equals(items('${prefix}_Loop')?['key'],${v('WorkplanKey')}),equals(length(${b(prefix + '_Resource')}),1))`);
  const reader = `first(${b(prefix + '_Reader')})`;
  loop.require(prefix + '_Authorised', `if(equals(items('${prefix}_Loop')?['kind'],'StatusGrant'),equals(${f(reader, 'key')},${c('actorKey')}),or(equals(${f(reader, 'key')},${c('actorKey')}),and(contains(${f(reader, 'roles')},'Manager'),equals(${f(reader, 'key')},${c('managerKey')})),contains(${f(reader, 'roles')},'SLT')))`); g.each(prefix + '_Loop', collection, loop);
}
function effect(g, prefix, body, uri, tag) {
  g.compose(prefix + '_Request', { uri: '@' + uri, body: '@' + body, etag: '@' + tag });
  boundary(g, prefix + '_Reserve', object({ epoch: key, operationId: key, disposition: { enum: ['Issued'] }, request: { type: 'object' }, revision: integer }));
  g.require(prefix + '_Reserved', and(equal(f(b(prefix + '_Reserve'), 'epoch'), c('epoch')), equal(f(b(prefix + '_Reserve'), 'request'), o(prefix + '_Request')), equal(f(b(prefix + '_Reserve'), 'revision'), c('revision'))));
  boundary(g, prefix + '_Current', context); g.require(prefix + '_ContextStable', equal(b(prefix + '_Current'), b('C2B_Context')));
  const create = new Graph(); request(create, prefix + '_Create', 'POST', uri, body); const patch = new Graph(); patch.parse(prefix + '_ETag', '@' + tag, etag); request(patch, prefix + '_Patch', 'POST', uri, body, tag);
  create.set(prefix + '_CreateResult', 'EffectResponse', '@outputs(' + quote(prefix + '_Create') + ')'); patch.set(prefix + '_PatchResult', 'EffectResponse', '@outputs(' + quote(prefix + '_Patch') + ')'); g.branch(prefix + '_Absent', equal(tag, 'null'), create, patch);
  g.require(prefix + '_ResponseDefinitive', `or(equals(${v('EffectResponse')}?['statusCode'],200),equals(${v('EffectResponse')}?['statusCode'],201),equals(${v('EffectResponse')}?['statusCode'],204))`);
  boundary(g, prefix + '_Confirm', object({ epoch: key, operationId: key, disposition: { enum: ['Confirmed'] }, responseReference: text })); g.require(prefix + '_Confirmed', and(equal(f(b(prefix + '_Confirm'), 'epoch'), c('epoch')), equal(f(b(prefix + '_Confirm'), 'operationId'), f(b(prefix + '_Reserve'), 'operationId'))));
}

export function buildC2aDefinition(options = {}) {
  if (Object.keys(options).length) throw Error('Enabled or test adapter composition is not implemented.'); names = new Set();
  const root = new Graph(); root.add('Initialise_Internal', { type: 'InitializeVariable', inputs: { variables: [['Payload', 'object', {}], ['WorkplanKey', 'string', ''], ['Header', 'object', {}], ['Headers', 'array', []], ['Before', 'array', []], ['Intended', 'array', []], ['Next', 'string', ''], ['Seen', 'array', []], ['Keys', 'array', []], ['Natural', 'array', []], ['Patch', 'object', {}], ['ItemKey', 'string', ''], ['Item', 'object', {}], ['Readback', 'array', []], ['EffectResponse', 'object', {}], ['EqualWeight', 'float', 0]].map(([name, type, value]) => ({ name, type, value })) } });
  root.add('C2B_Absent_Stop', { type: 'Terminate', inputs: { runStatus: 'Failed', runError: { code: 'C2B_NOT_IMPLEMENTED', message: 'Trusted context, journal, grants and status adapters are absent. No processing allowed.' } } });
  const flow = new Graph(); boundary(flow, 'C2B_Context', context); flow.compose('Admission_Context', '@'+b('C2B_Context'));
  flow.require('Immutable_Binding', and(equal(c('site'), "'https://example.invalid/sites/REVIEW-TEST-SITE'"), equal(c('commandList'), "'3e05ec37-95ce-4a30-a56c-ff2437bf9bed'"), equal(c('headerList'), "'47210791-25f1-416e-ab24-832c8b6448ec'"), equal(c('itemList'), "'98f2a280-46a7-40b5-a37d-db97b02fc826'")));
  sourceRead(flow, 'Source_A'); sourceRead(flow, 'Source_B'); admission(flow);
  flow.set('Workplan_Key', 'WorkplanKey', '@concat(' + c('actorKey') + ",'|2027')"); flow.require('Envelope_Actor', and(equal(e('personKey'), c('actorKey')), equal(e('workplanKey'), v('WorkplanKey')), equal(`toLower(${c('actorEmail')})`, c('actorEmail'))));
  flow.query('Actor_Lookup', c('actors'), and(equal(f('item()', 'key'), c('actorKey')), equal(f('item()', 'email'), c('actorEmail')), equal(f('item()', 'active'), 'true'))); flow.query('Manager_Lookup', c('actors'), and(equal(f('item()', 'key'), c('managerKey')), equal(f('item()', 'email'), c('managerEmail')), equal(f('item()', 'active'), 'true'))); flow.require('Unique_Actor_Manager', and(equal(`length(${b('Actor_Lookup')})`, '1'), equal(`length(${b('Manager_Lookup')})`, '1'))); flow.require('Role_And_Edge', and(`contains(first(${b('Actor_Lookup')})?['roles'],'Employee')`, `contains(first(${b('Manager_Lookup')})?['roles'],'Manager')`, equal(`first(${b('Actor_Lookup')})?['manager']`, c('managerKey'))));
  boundary(flow, 'C2B_Predecessor', object({ state: { enum: ['Clear', 'Terminal', 'Held'] }, pendingEffects: integer, epoch: key })); flow.require('Predecessor_Clear', and(equal(f(b('C2B_Predecessor'), 'state'), "'Clear'"), equal(f(b('C2B_Predecessor'), 'pendingEffects'), '0')));
  flow.compose('Physical_Item_Fields', PHYSICAL_ITEM_FIELDS);
  pages(flow, 'Planning_Headers', 'headerList', 'Headers'); flow.require('Header_Unique', `lessOrEquals(length(${v('Headers')}),1)`); const found = new Graph(); found.set('Use_Header', 'Header', '@first(' + v('Headers') + ')'); flow.branch('Header_Exists', equal(`length(${v('Headers')})`, '1'), found, new Graph()); pages(flow, 'Planning_Items', 'itemList', 'Before'); validateRows(flow, 'Before', v('Before')); admissionExpectations(flow, v('Headers'), v('Before'));
  const create = new Graph(); create.parse('Create_Payload', '@' + e('payload'), object({})); create.require('Create_Preconditions', and(equal(`length(${v('Headers')})`, '0'), equal(`length(${v('Before')})`, '0'), equal(e('subjectType'), "'Workplan'"), equal(e('subjectKey'), v('WorkplanKey')), equal(e('expectedHeaderToken'), '0'), equal(e('expectedHeaderETag'), 'null'), equal(e('expectedItemETag'), 'null')));
  const upsert = new Graph(); upsert.parse('Upsert_Payload', '@' + e('payload'), coreSchema); upsert.set('Use_Payload', 'Payload', '@' + b('Upsert_Payload'));
  upsert.require('Upsert_Header', and(equal(`length(${v('Headers')})`, '1'), equal(f(v('Header'), 'State'), "'Draft'"), equal(f(v('Header'), 'TransitionStatus'), "'Ready'"), equal(f(v('Header'), 'AccessState'), "'EmployeeEdit'"), equal(f(v('Header'), 'PersonKey'), c('actorKey')), equal(f(v('Header'), 'PerformanceYear'), '2027'), equal(f(v('Header'), 'WorkplanVersion'), '1'), equal(f(v('Header'), 'RowVersionToken'), e('expectedHeaderToken')), equal(f(f(v('Header'), '__metadata'), 'etag'), e('expectedHeaderETag')), equal(f(v('Header'), 'CoreCategoryWeight'), '70'), equal(f(v('Header'), 'PersonalCategoryWeight'), '20'), equal(f(v('Header'), 'BehaviourCategoryWeight'), '10'), equal(f(v('Header'), 'CoreWeightingMode'), "'Equal'")));
  upsert.require('Reference_Match', equal(p('kpiId'), f(c('reference'), 'kpiId')));
  for (const q of ['Q1', 'Q2', 'Q3', 'Q4']) { upsert.query('Quarter_' + q, p('quarterTargets'), equal(f('item()', 'quarter'), quote(q))); upsert.require(q + '_Once', equal(`length(${b('Quarter_' + q)})`, '1')); }
  const qs = ['Q1', 'Q2', 'Q3', 'Q4'];
  upsert.compose('Natural_Key', `@concat(${v('WorkplanKey')},'|CoreGold|',${p('kpiId')})`); upsert.query('Existing_Core', v('Before'), equal(f('item()', 'WorkplanItemNaturalKey'), o('Natural_Key'))); upsert.require('Unique_Core', `lessOrEquals(length(${b('Existing_Core')}),1)`);
  upsert.set('Core_Key', 'ItemKey', `@if(equals(length(${b('Existing_Core')}),1),first(${b('Existing_Core')})?['WorkplanItemKey'],${o('Natural_Key')})`); upsert.require('Item_Expected', and(equal(e('subjectType'), "'WorkplanItem'"), equal(e('subjectKey'), v('ItemKey')), `if(equals(length(${b('Existing_Core')}),1),equals(${e('expectedItemETag')},first(${b('Existing_Core')})?['__metadata']?['etag']),equals(${e('expectedItemETag')},null))`));
  const patch = { KPIID: '@' + p('kpiId'), KPIVersionKey: '@' + f(c('reference'), 'kpiVersion'), TargetVersionKey: '@' + f(c('reference'), 'targetVersion'), EmployeeKpiRole: '@' + p('role'), ContributionMethod: '@' + p('contributionMethod'), YearEndTargetValue: '@' + p('annualTargetValue'), YearEndTargetText: '@' + p('annualTargetText'), DisplayOrder: '@' + p('displayOrder'), ActiveInWorkplan: '@' + p('activeInWorkplan'), UnitLabel: '@' + f(c('reference'), 'unit') };
  for (const [name, field] of [['sharedTargetRule','SharedTargetRule'],['sharedApportionmentPercent','SharedApportionmentPercent'],['governanceReference','ContributionGovernanceReference'],['denominatorNumerator','DenominatorNumerator'],['denominatorValue','DenominatorValue'],['denominatorUnit','DenominatorUnit'],['denominatorRuleReference','DenominatorRuleReference'],['denominatorSourceReference','DenominatorSourceReference']]) patch[field] = '@' + p(name);
  for (const q of qs) { patch[q + 'TargetValue'] = `@first(${b('Quarter_' + q)})?['targetValue']`; patch[q + 'TargetText'] = `@coalesce(first(${b('Quarter_' + q)})?['targetText'],first(${b('Quarter_' + q)})?['commitment'])`; patch[q + 'SuccessDefinition'] = `@first(${b('Quarter_' + q)})?['successDefinition']`; }
  upsert.compose('Contribution_Patch', patch); upsert.compose('New_Core', { WorkplanItemKey: '@' + v('ItemKey'), WorkplanItemNaturalKey: '@' + o('Natural_Key'), WorkplanKey: '@' + v('WorkplanKey'), PersonKey: '@' + c('actorKey'), PerformanceYear: 2027, WorkplanVersion: 1, ItemType: 'CoreGold', ContributionApprovalState: 'Draft', AdditiveApproved: false, NonOverlapApproved: false, DirectContributionEligible: false, ContributionAuditReference: null });
  upsert.set('Next_Core', 'Item', `@union(if(equals(length(${b('Existing_Core')}),1),first(${b('Existing_Core')}),${o('New_Core')}),${o('Contribution_Patch')})`); upsert.query('Other_Rows', v('Before'), `not(equals(item()?['WorkplanItemKey'],${v('ItemKey')}))`); upsert.set('Other_Intended', 'Intended', '@' + b('Other_Rows')); upsert.append('Add_Core', 'Intended', '@' + v('Item')); upsert.query('Active_Core', v('Intended'), "and(equals(item()?['ItemType'],'CoreGold'),equals(item()?['ActiveInWorkplan'],true))");
  const positive = new Graph(); positive.set('Positive_Equal', 'EqualWeight', `@div(float('100'),length(${b('Active_Core')}))`); const zero = new Graph(); zero.set('Zero_Equal', 'EqualWeight', 0); upsert.branch('Equal_Count', `greater(length(${b('Active_Core')}),0)`, positive, zero);
  upsert.add('Apply_Equal', { type: 'Select', inputs: { from: '@' + v('Intended'), select: `@if(equals(item()?['ItemType'],'CoreGold'),setProperty(item(),'CoreWorkplanWeight',if(item()?['ActiveInWorkplan'],${v('EqualWeight')},0)),item())` } }); upsert.set('Weighted_Intended', 'Intended', '@' + b('Apply_Equal'));
  flow.branch('Dispatch', equal(e('commandType'), "'CreateWorkplanDraft'"), create, upsert);
  boundary(flow, 'C2B_Grant_Intents', array(grant)); grants(flow, 'Planned_Grant', b('C2B_Grant_Intents'));
  flow.compose('Claim_Body', { __metadata: { type: '@' + c('headerEntityType') }, WorkplanKey: '@' + v('WorkplanKey'), PersonKey: '@' + c('actorKey'), EmployeeEmail: '@' + c('actorEmail'), ManagerPersonKey: '@' + c('managerKey'), ManagerEmail: '@' + c('managerEmail'), PerformanceYear: 2027, State: 'Draft', CoreCategoryWeight: 70, PersonalCategoryWeight: 20, BehaviourCategoryWeight: 10, CoreWeightingMode: 'Equal', WorkplanVersion: 1, RowVersionToken: '@add(' + e('expectedHeaderToken') + ',1)', TransitionStatus: 'InProgress', TransitionCorrelationKey: '@' + c('epoch'), AccessState: 'EmployeeEdit' });
  flow.compose('Complete_Intent', { admission: '@' + o('Admission_Evidence'), source: '@' + b('Validate_Source'), epoch: '@' + c('epoch'), beforeHeader: '@' + v('Header'), beforeRows: '@' + v('Before'), intendedRows: '@' + v('Intended'), claim: '@' + o('Claim_Body'), grants: '@' + b('C2B_Grant_Intents'), finalise: { TransitionStatus: 'Ready', AccessState: 'EmployeeEdit', RowVersionToken: '@add(' + e('expectedHeaderToken') + ',2)', etagDependency: 'THIS_CONFIRMED_CLAIM' } });
  boundary(flow, 'C2B_Durable_Plan', object({ epoch: key, intent: { type: 'object' }, reference: text })); flow.require('Intent_Persisted', and(equal(f(b('C2B_Durable_Plan'), 'epoch'), c('epoch')), equal(f(b('C2B_Durable_Plan'), 'intent'), o('Complete_Intent'))));
  effect(flow, 'Claim', o('Claim_Body'), `if(empty(${v('Header')}),${listUri('headerList')},concat(${listUri('headerList','/items(')},string(${v('Header')}?['Id']),')'))`, `if(empty(${v('Header')}),null,${v('Header')}?['__metadata']?['etag'])`);
  pages(flow, 'Claim_Read', 'headerList', 'Headers'); flow.require('Claim_One', equal(`length(${v('Headers')})`, '1')); flow.set('Claim_Header', 'Header', '@first(' + v('Headers') + ')'); flow.require('Claim_Epoch', and(equal(f(v('Header'), 'TransitionCorrelationKey'), c('epoch')), equal(f(v('Header'), 'TransitionStatus'), "'InProgress'"), equal(f(v('Header'), 'RowVersionToken'), `add(${e('expectedHeaderToken')},1)`)));
  const writes = new Graph(); writes.query('Write_Existing', v('Before'), equal(f('item()', 'WorkplanItemKey'), "items('Canonical_Rows')?['WorkplanItemKey']")); const core = new Graph(); core.compose('Canonical_Body', "@setProperty(removeProperty(removeProperty(items('Canonical_Rows'),'Id'),'__metadata'),'__metadata',json(concat('{\"type\":\"',body('C2B_Context')?['itemEntityType'],'\"}')))");
  effect(core, 'Canonical', o('Canonical_Body'), `if(equals(length(${b('Write_Existing')}),0),${listUri('itemList')},concat(${listUri('itemList','/items(')},string(first(${b('Write_Existing')})?['Id']),')'))`, `if(equals(length(${b('Write_Existing')}),0),null,first(${b('Write_Existing')})?['__metadata']?['etag'])`); writes.branch('Write_Core_Only', "equals(items('Canonical_Rows')?['ItemType'],'CoreGold')", core, new Graph()); flow.each('Canonical_Rows', v('Intended'), writes);
  boundary(flow, 'C2B_Grants_Confirmed', object({ epoch: key, revision: integer, grants: array(grant), pendingEffects: integer, reference: text })); flow.require('Grants_Confirmed', and(equal(f(b('C2B_Grants_Confirmed'), 'epoch'), c('epoch')), equal(f(b('C2B_Grants_Confirmed'), 'revision'), c('revision')), equal(f(b('C2B_Grants_Confirmed'), 'grants'), b('C2B_Grant_Intents')), equal(f(b('C2B_Grants_Confirmed'), 'pendingEffects'), '0'))); grants(flow, 'Confirmed_Grant', f(b('C2B_Grants_Confirmed'), 'grants'));
  pages(flow, 'Canonical_Readback', 'itemList', 'Readback'); validateRows(flow, 'Readback', v('Readback')); compareRows(flow, 'Canonical_Compare', v('Intended'), v('Readback'));
  boundary(flow, 'C2B_Completion', object({ epoch: key, pendingEffects: integer, intentReference: text, grantReference: text, noPendingContinuation: { enum: [true] } })); flow.require('Completion_Confirmed', and(equal(f(b('C2B_Completion'), 'epoch'), c('epoch')), equal(f(b('C2B_Completion'), 'pendingEffects'), '0'), equal(f(b('C2B_Completion'), 'intentReference'), f(b('C2B_Durable_Plan'), 'reference')), equal(f(b('C2B_Completion'), 'grantReference'), f(b('C2B_Grants_Confirmed'), 'reference')))); flow.compose('Finalise_Body', { __metadata: { type: '@' + c('headerEntityType') }, TransitionStatus: 'Ready', AccessState: 'EmployeeEdit', TransitionCorrelationKey: '@' + c('epoch'), RowVersionToken: '@add(' + e('expectedHeaderToken') + ',2)' }); effect(flow, 'Finalise', o('Finalise_Body'), `concat(${listUri('headerList','/items(')},string(${v('Header')}?['Id']),')')`, `${v('Header')}?['__metadata']?['etag']`);
  pages(flow, 'Stable_H1', 'headerList', 'Headers'); flow.require('Stable_H1_One', equal(`length(${v('Headers')})`, '1')); flow.compose('Stable_First', '@first(' + v('Headers') + ')'); pages(flow, 'Stable_Rows', 'itemList', 'Readback'); compareRows(flow, 'Stable_Compare', v('Intended'), v('Readback')); pages(flow, 'Stable_H2', 'headerList', 'Headers'); flow.require('Stable_H2_One', equal(`length(${v('Headers')})`, '1')); flow.require('Stable_Epoch', and(equal(o('Stable_First'), `first(${v('Headers')})`), equal(f(o('Stable_First'), 'TransitionStatus'), "'Ready'"), equal(f(o('Stable_First'), 'AccessState'), "'EmployeeEdit'"), equal(f(o('Stable_First'), 'TransitionCorrelationKey'), c('epoch')), equal(`first(${v('Headers')})?['TransitionCorrelationKey']`, c('epoch')), equal(f(o('Stable_First'), 'RowVersionToken'), `add(${e('expectedHeaderToken')},2)`)));
  boundary(flow, 'C2B_Status', object({ epoch: key, actorKey: key, state: { enum: ['Terminal'] }, pendingEffects: integer })); flow.require('Status_Confirmed', and(equal(f(b('C2B_Status'), 'epoch'), c('epoch')), equal(f(b('C2B_Status'), 'actorKey'), c('actorKey')), equal(f(b('C2B_Status'), 'pendingEffects'), '0')));
  root.add('Canonical_Process', { type: 'Scope', actions: flow.actions }); const held = new Graph(); boundary(held, 'C2B_Preserve_Held', object({ preserved: { enum: [true] } })); root.add('Catch_Preserve', { type: 'Scope', actions: held.actions }); root.actions.Catch_Preserve.runAfter = { Canonical_Process: ['Failed', 'TimedOut'] };
  return { properties: { connectionReferences: {}, definition: { $schema: 'https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#', contentVersion: '0.0.2.2', parameters: { $authentication: { type: 'SecureObject', defaultValue: {} }, $connections: { type: 'Object', defaultValue: {} } }, triggers: {}, actions: root.actions, outputs: {} } } };
}
// Exact035 physical business fields are embedded below; not runtime-discovered or supplied by clients.
const PHYSICAL_ITEM_FIELDS = ["ActiveInWorkplan", "AddedAt", "AddedByEmail", "AdditiveApproved", "BehaviourCustomObjective", "BehaviourEvidenceDefinition", "BehaviourID", "BehaviourItemWeight", "BehaviourMeasure", "BehaviourObjectiveDescription", "BehaviourObjectiveKey", "BehaviourObjectiveSource", "BehaviourObjectiveTitle", "BehaviourSelectedSuggestionKeysJ", "BehaviourVersionKey", "ContributionApprovalReference", "ContributionApprovalState", "ContributionApprovedAt", "ContributionAuditReference", "ContributionEffectiveFrom", "ContributionEffectiveTo", "ContributionGovernanceReference", "ContributionMethod", "ContributionWeight", "CoreWorkplanWeight", "DenominatorNumerator", "DenominatorRuleReference", "DenominatorSourceReference", "DenominatorUnit", "DenominatorValue", "DirectContributionEligible", "DisplayOrder", "EmployeeKpiRole", "ItemType", "KPIID", "KPIVersionKey", "LocalBaselineValue", "LocalKPIDescription", "LocalKPIWording", "LocalMeasure", "LocalMetricType", "LocalPercentageScale", "LocalScoringDirection", "NonOverlapApproved", "NonOverlapRequired", "PerformanceYear", "PersonalItemWeight", "PersonKey", "Q1BehaviourTargetRating", "Q1SuccessDefinition", "Q1TargetText", "Q1TargetValue", "Q2BehaviourTargetRating", "Q2SuccessDefinition", "Q2TargetText", "Q2TargetValue", "Q3BehaviourTargetRating", "Q3SuccessDefinition", "Q3TargetText", "Q3TargetValue", "Q4BehaviourTargetRating", "Q4SuccessDefinition", "Q4TargetText", "Q4TargetValue", "SharedApportionmentPercent", "SharedTargetRule", "TargetVersionKey", "TestRunKey", "Title", "UnitLabel", "WorkplanItemKey", "WorkplanItemNaturalKey", "WorkplanKey", "WorkplanVersion", "YearEndTargetText", "YearEndTargetValue"];
