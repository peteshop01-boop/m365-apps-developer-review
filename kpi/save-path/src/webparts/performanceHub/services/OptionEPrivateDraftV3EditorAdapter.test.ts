import { createHash } from 'node:crypto';
import type { IOptionEWorkplanDraftV3Aggregate } from '../models/OptionEWorkplanDraftV3Models';
import type { IEmployeeWorkplanReadbackV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
import type { IIntegratedImpactDefinitionView } from './IntegratedImpactDraftMapping';
import { PrivateDraftV3EditorSession, readPrivateDraftV3Editor, type IPrivateDraftV3ReadContext } from './OptionEPrivateDraftV3EditorAdapter';
import { canonicaliseOptionEPartialDraftV3 } from './OptionEWorkplanDraftV3Wire';
// Expected baseline bodies issued before codec/editor implementation. Never generated from the implementation under test.
const rich: IOptionEWorkplanDraftV3Aggregate = {"behaviours":{"entries":[{"cadenceClaim":"TwiceYearly","commitment":"","descriptorKey":"historic-descriptor","guidancePromptKeys":["PROMPT-B","PROMPT-A"],"periodCommitments":{"H1":"Retained H1","H2":"","Q1":"","Q2":"","Q3":"","Q4":""},"planningLevels":{"contractVersion":"BHV-LEVELS|v01","currentLevel":"Developing","targetJustification":"","targetLevel":"Effective"},"selectedPromptKeys":["PROMPT-A"],"valueId":"BHV-01"}],"frameworkVersion":"DEMO-BEHAVIOUR|v02","roleTier":""},"core":{"entries":[{"activeInWorkplan":true,"contributionMethod":"SharedTarget","coreId":"SYNTHETIC-CORE-1","denominatorNumerator":0,"denominatorRuleReference":"rule-old","denominatorSourceReference":"source-old","denominatorUnit":"items","denominatorValue":0,"displayOrder":2,"governanceReference":"synthetic-historical-rule","kpiId":"SYNTHETIC-KPI-1","kpiVersionKey":"SYNTHETIC-KPI-1|v1","nativeQuarterOrder":["Q3","Q1"],"nativeRole":"Contributor","role":"Delivery","sharedApportionmentPercent":0,"sharedTargetRule":"ApprovedApportionment","targetVersionKey":"SYNTHETIC-TARGET|v1","targets":{"annual":{"editorText":"","kind":"NativePair","numericValue":0,"success":"","textValue":"zero recorded separately"},"q1":{"kind":"Scalar"},"q2":{"kind":"Scalar"},"q3":{"commitment":"historical commitment","kind":"NativePair","numericValue":0,"successDefinition":"independent criterion","textValue":""},"q4":{"kind":"Scalar"}},"weightPercent":0}],"weightingMode":"Custom"},"impact":[{"activeInWorkplan":false,"baselineValue":0,"classification":{"businessContributionArea":{"key":"SYNTHETIC-BCA-OLD","label":"Historical label","source":"Historical configuration"},"state":"RetainedUnresolved"},"description":"Historical intended outcome","displayOrder":3,"editorDefinition":{"intendedOutcome":"Unfinished changed outcome","measure":"Number / Quantity","success":"Historic integrated success text","successCriterion":""},"impactId":"SYNTHETIC-IMPACT-NEW","measure":"Independent historical success criterion","measureType":"Other","personalItemWeight":0,"scoringDirection":"TBC","targets":{"annual":{"editorText":"unfinished","kind":"NativePair","numericValue":0,"textValue":"0"},"q1":{"kind":"Scalar"},"q2":{"kind":"Scalar"},"q3":{"kind":"Scalar"},"q4":{"kind":"Scalar"}},"unitLabel":"","wording":"£ retained result"}],"referenceClaims":{"overallDelivery":{"configurationKey":"SYNTHETIC-CONFIG","configurationVersion":"v-old","coreWeight":70,"impactWeight":30,"sourceReference":"DEMO-APP-PETE-PD-01"}},"schemaVersion":"demo.workplan-draft/v3"};
const pinned: IOptionEWorkplanDraftV3Aggregate = {"behaviours":{"entries":[],"frameworkVersion":"DEMO-BEHAVIOUR|v02","governedExtension":{"authority":{"approvalReference":"DEMO-APP-PETE-BEH-V02-001","catalogueContentSha256":"2C2DB0BADEE605C0AD4D7ABE7CB262F70F822526BA6C4F14A451396D6FA57775","catalogueEtag":"\"old-1\"","catalogueId":"SYNTHETIC-BEHAVIOUR-CATALOGUE","catalogueRevision":1,"catalogueVersion":"v-old"},"deliveryArithmeticAffected":false,"headlines":[{"behaviourKey":"BHV-01","headlineTitle":"Historical headline 1","selections":[]},{"behaviourKey":"BHV-02","headlineTitle":"Historical headline 2","selections":[]},{"behaviourKey":"BHV-03","headlineTitle":"Historical headline 3","selections":[{"behaviourKey":"BHV-03","catalogueContentSha256":"2C2DB0BADEE605C0AD4D7ABE7CB262F70F822526BA6C4F14A451396D6FA57775","catalogueEtag":"\"old-1\"","catalogueId":"SYNTHETIC-BEHAVIOUR-CATALOGUE","catalogueRevision":1,"catalogueVersion":"v-old","focusKey":"BHV-03-FOCUS-01","focusTitle":"Historical focus","headlineTitle":"Historical headline 3","howWillWeKnow":"","myCommitment":"","roleLevelCode":"L1","selectedWording":"Retained employee-selected wording","selectionKey":"BHV-03-OWN-SYNTHETIC","source":"Own"}]},{"behaviourKey":"BHV-04","headlineTitle":"Historical headline 4","selections":[]},{"behaviourKey":"BHV-05","headlineTitle":"Historical headline 5","selections":[]}],"immutableSelectionSnapshots":true,"legacyTargetRatingWeightFieldsWritten":false,"roleLevelCode":"L1","schemaVersion":"demo.option-e.behaviours/v02"},"roleTier":""},"core":{"entries":[],"weightingMode":"Equal"},"impact":[{"classification":{"businessContributionArea":{"key":"SYNTHETIC-BCA-OLD","label":"Historical label","source":"Synthetic published fixture","taxonomyApprovalReference":"DEMO-APP-PETE-PD-02","taxonomyEtag":"\"old-1\"","taxonomyId":"SYNTHETIC-TAXONOMY","taxonomyVersion":"v-old"},"state":"Pinned","taxonomyPin":{"contentSha256":"6948828BDD3D0C811C1E67B73A85E171EAAEFFCEF17D3A7F806D4901A487F634","etag":"\"old-1\"","taxonomyId":"SYNTHETIC-TAXONOMY","version":"v-old"}},"editorDefinition":{"intendedOutcome":"","measure":"","success":"","successCriterion":""},"impactId":"SYNTHETIC-IMPACT-NEW","measure":"","targets":{"annual":{"kind":"Scalar"},"q1":{"kind":"Scalar"},"q2":{"kind":"Scalar"},"q3":{"kind":"Scalar"},"q4":{"kind":"Scalar"}},"unitLabel":"","wording":""}],"schemaVersion":"demo.workplan-draft/v3"};
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value)) as T;
const context=(body:IOptionEWorkplanDraftV3Aggregate):IPrivateDraftV3ReadContext=>{
 const payloadJson=canonicaliseOptionEPartialDraftV3(body),payloadSha256=createHash('sha256').update(payloadJson,'utf8').digest('hex').toUpperCase();
 const binding={peopleItemId:1,peopleUniqueId:'6C48236E-4055-4967-81CB-B77E4123431F',email:'employee@demo-test.invalid',personKey:'FICTION-EMPLOYEE',
  workplanItemId:9,workplanUniqueId:'26B2B96D-BE69-4D01-859B-423879EFF765',workplanEtag:'"control-1"',workplanKey:'FICTION-EMPLOYEE|2026',performanceYear:2026,
  draftItemId:17,draftSchemaVersion:'demo.workplan-draft/v3' as const,state:'Draft' as const,transitionStatus:'Ready' as const,pendingRequestKey:'' as const,rowVersionToken:1};
 const readback:IEmployeeWorkplanReadbackV2={workplan:{id:9,etag:'"control-1"',workplanKey:binding.workplanKey,personKey:binding.personKey,
  employeeDisplayName:'Fictional Employee',employeeEmail:binding.email,performanceYear:2026,state:'Draft',accessState:'EmployeeEdit',transitionStatus:'Ready',
  coreCategoryWeight:70,personalCategoryWeight:30,behaviourCategoryWeight:0,coreWeightingMode:'Equal',workplanVersion:1,rowVersionToken:1},coreItems:[],personalItems:[],behaviourItems:[],audits:[]};
 return {canonical:{itemId:17,etag:'"draft-1"',aggregate:clone(body),payloadJson,payloadSha256,binding},readback,catalogue:[],loadKey:{}};
};
const activeRich=():IOptionEWorkplanDraftV3Aggregate=>{const body=clone(rich);body.impact[0].activeInWorkplan=true;return body;};
describe('V3 retained baseline and explicit editor presence',()=>{
 test('retained content has no saved provenance without an explicit canonical source',()=>{
  const body=activeRich();expect(readPrivateDraftV3Editor(body).personal[0]).not.toHaveProperty('savedDefinition');
  expect(readPrivateDraftV3Editor(body,{canonical:body}).personal[0].savedDefinition).toEqual({
   description:body.impact[0].description,measure:body.impact[0].measure,scoringDirection:body.impact[0].scoringDirection});
 });
 test('canonical definitions match logical IDs while an older retained buffer and its new entry remain fully editable',()=>{
  const retained=activeRich(),canonical=clone(retained);
  retained.impact[0].wording='Unsaved retained wording';retained.impact[0].targets.q1.editorText='Unsaved Q1';
  retained.impact.push({...clone(retained.impact[0]),impactId:'NEW-UNSAVED',wording:'New unsaved item',description:'Unsaved description'});
  canonical.impact[0].description='  Current canonical evidence\nKeep spacing  ';canonical.impact[0].measure='Current canonical criterion';canonical.impact[0].scoringDirection='LowerIsBetter';
  canonical.impact.unshift({...clone(canonical.impact[0]),impactId:'OTHER-CANONICAL',description:'Other definition must not leak'});
  const session=new PrivateDraftV3EditorSession(context(canonical),retained),view=session.view;
  expect(view.personal[0].wording).toBe('Unsaved retained wording');expect(view.personal[0].q1).toBe('Unsaved Q1');
  expect(view.personal[0].savedDefinition).toEqual({description:'  Current canonical evidence\nKeep spacing  ',measure:'Current canonical criterion',scoringDirection:'LowerIsBetter'});
  expect(view.personal[1]).not.toHaveProperty('savedDefinition');expect(view.personal[1]).not.toHaveProperty('original');
  expect(session.update(view)).toEqual(retained);expect(session.context.canonical.aggregate).toEqual(canonical);
  view.personal[1].wording='Still editable new intent';const expected=clone(retained);expected.impact[1].wording='Still editable new intent';
  expect(session.update(view)).toEqual(expected);expect(session.context.canonical.aggregate).toEqual(canonical);
 });
 test('blank canonical measure stays blank when the retained editor selects Percentage without saving',()=>{
  const canonical=clone(pinned),retained=clone(canonical);retained.impact[0].editorDefinition.measure='Percentage';
  const session=new PrivateDraftV3EditorSession(context(canonical),retained),view=session.view;
  expect(view.personal[0].measure).toBe('Percentage');expect(view.personal[0].savedDefinition).toEqual({measure:''});
  expect(session.update(view)).toEqual(retained);expect(session.context.canonical.aggregate).toEqual(canonical);
 });
 test.each(['  Earlier evidence\nRetain exact spacing  ', '', undefined])('readonly definition projects actual description presence %p without native identity',description=>{
  const body=activeRich();if(description===undefined)delete body.impact[0].description;else body.impact[0].description=description;
  const session=new PrivateDraftV3EditorSession(context(body)),item=session.view.personal[0];
  expect(item.savedDefinition).toEqual({measure:'Independent historical success criterion',scoringDirection:'TBC',
   ...(description===undefined?{}:{description})});
  expect(item).not.toHaveProperty('original');expect(item.savedDefinition).not.toHaveProperty('id');
  expect(item.savedDefinition).not.toHaveProperty('etag');expect(item.savedDefinition).not.toHaveProperty('naturalKey');
  expect(session.update(session.view)).toEqual(body);
 });
 test('absent saved direction is not replaced with a guessed calculation setting',()=>{
  const body=activeRich();delete body.impact[0].scoringDirection;
  const session=new PrivateDraftV3EditorSession(context(body));expect(session.view.personal[0].savedDefinition).not.toHaveProperty('scoringDirection');
  expect(session.update(session.view)).toEqual(body);
 });
 test('view-only definition changes cannot enter retained or newly created V3 entries',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;
  const display: Readonly<IIntegratedImpactDefinitionView>={description:'Display-only injected text',measure:'Display-only measure',scoringDirection:'HigherIsBetter'};
  Object.assign(view.personal[0],{savedDefinition:display});view.personal[0].wording='Permitted wording edit';
  view.personal.push({key:'FICTION-DISPLAY',wording:'New statement',measure:'Number / Quantity',unit:'',annual:'',q1:'',q2:'',q3:'',q4:'',success:'',weight:0,savedDefinition:display});
  const result=session.update(view),expected=clone(body);expected.impact[0].wording='Permitted wording edit';
  expect(result.impact[0]).toEqual(expected.impact[0]);expect(result.core).toEqual(body.core);expect(result.behaviours).toEqual(body.behaviours);
  expect(result.impact[1]).not.toHaveProperty('savedDefinition');expect(result.impact[1]).not.toHaveProperty('description');
  expect(result.impact[1]).not.toHaveProperty('scoringDirection');expect(result.impact[1].measure).toBe('Number / Quantity');
  expect(session.context.canonical.aggregate).toEqual(body);
 });
 test('unsaved target edits survive Remove/Add while untouched empty slots retain absent editorText',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),edited=session.view;
  edited.core[0].q1='Unsaved pending target';session.update(edited);const removed=session.view;removed.core=[];session.update(removed);
  const restored=session.view;restored.core=[session.createCoreChoice(body.core.entries[0].kpiId)];
  const expected=clone(body);expected.core.entries[0].targets.q1.editorText='Unsaved pending target';
  expect(session.update(restored)).toEqual(expected);expect(expected.core.entries[0].targets.q2).not.toHaveProperty('editorText');
 });
 test('a reselected Core choice already carries its logical identity and retained fields before any field event',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),original=session.view.core[0],removed=session.view;
  removed.core=[];session.update(removed);expect(session.createCoreChoice(original.kpiId)).toEqual(original);
 });
 test('a field event whose logical ID and KPI key belong to different rows holds instead of touching either',()=>{
  const body=activeRich(),a=body.core.entries[0];body.core.entries.push({...clone(a),coreId:'SECOND-CORE',kpiId:'SECOND-KPI'});
  const session=new PrivateDraftV3EditorSession(context(body));session.markCoreField(a.coreId,'SECOND-KPI','role');
  expect(()=>session.update(session.view)).toThrow(/matched to the loaded Workplan/);expect(session.context.canonical.aggregate).toEqual(body);
 });
 test('an ordinary Support edit uses the sealed Support alias family and retains unrelated fields',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;view.core[0].role='Support';
  const expected=clone(body);expected.core.entries[0].role='Support';expected.core.entries[0].nativeRole='Oversight';
  expect(session.update(view)).toEqual(expected);
 });
 test.each([
  ['Delivery','Contributor'],['Support','EvidenceProvider'],['Support','Oversight']
 ] as const)('an explicit unchanged %s role preserves the stored %s alias', (role,alias)=>{
  const body=activeRich();body.core.entries[0].role=role;body.core.entries[0].nativeRole=alias;
  const session=new PrivateDraftV3EditorSession(context(body));session.markField('core',body.core.entries[0].coreId,'role');
  expect(session.update(session.view)).toEqual(body);
 });
 test.each([true,false])('Core UI removal/reselection restores the stable saved entry, coreIdMatchesKpi=%s', equalId => {
  const body=activeRich(); if(equalId)body.core.entries[0].coreId=body.core.entries[0].kpiId;
  const session=new PrivateDraftV3EditorSession(context(body)),without=session.view; without.core=[];
  expect(session.update(without).core.entries[0].activeInWorkplan).toBe(false);
  const reselected=session.view; reselected.core=[{kpiId:body.core.entries[0].kpiId,weight:100}];
  const expected=clone(body); expected.core.entries[0].weightPercent=100;
  expect(session.update(reselected)).toEqual(expected);
 });
 test('new Core Add/Remove/Add keeps one stable logical identity and uses actual catalogue version keys',()=>{
  const body=clone(pinned),c=context(body); c.catalogue=[{kpiId:'NEW-KPI',kpiVersionKey:'NEW-KPI|v2',targetVersionKey:'NEW-TARGET|v3',
   wording:'Declared current KPI',pillar:'Declared pillar',workstream:'Declared workstream',scoringDirection:'HigherIsBetter',unitLabel:'items'}];
  const session=new PrivateDraftV3EditorSession(c),next=session.view; next.core=[{kpiId:'NEW-KPI',weight:100}];
  const first=session.update(next),removed=session.view; removed.core=[];session.update(removed);
  const added=session.view;added.core=[{kpiId:'NEW-KPI',weight:100}];const final=session.update(added);
  expect(final.core).toEqual(first.core);expect(final.core.entries).toHaveLength(1);
  expect(final.core.entries[0].kpiVersionKey).toBe('NEW-KPI|v2');expect(final.core.entries[0].targetVersionKey).toBe('NEW-TARGET|v3');
 });
 test('repeated removal/reselection followed by final removal keeps only that saved row inactive',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),row=session.view.core[0];
  const dropped=session.view;dropped.core=[];session.update(dropped);
  const restored=session.view;restored.core=[row];session.update(restored);
  const final=session.view;final.core=[];const expected=clone(body);expected.core.entries[0].activeInWorkplan=false;
  expect(session.update(final)).toEqual(expected);
 });
 test('creating Core for an inactive historic KPI does not reuse or activate the old retained ID',()=>{
  const body=activeRich();body.core.entries[0].activeInWorkplan=false;body.core.entries[0].coreId=body.core.entries[0].kpiId;
  const c=context(body);c.catalogue=[{kpiId:body.core.entries[0].kpiId,kpiVersionKey:'CURRENT|v2',targetVersionKey:'CURRENT-TARGET|v2',
   wording:'Current synthetic definition',pillar:'Declared',workstream:'Declared',scoringDirection:'HigherIsBetter',unitLabel:'items'}];
  const session=new PrivateDraftV3EditorSession(c),added=session.view;added.core=[{kpiId:body.core.entries[0].kpiId,weight:100}];
  const result=session.update(added);expect(result.core.entries[0]).toEqual(body.core.entries[0]);expect(result.core.entries).toHaveLength(2);
  expect(result.core.entries[1].coreId).not.toBe(body.core.entries[0].coreId);expect(result.core.entries[1].kpiVersionKey).toBe('CURRENT|v2');
 });
 test('same-display zero input after identity resolution changes only the resolved Core weight presence',()=>{
  const body=activeRich();delete body.core.entries[0].weightPercent;
  const session=new PrivateDraftV3EditorSession(context(body)),without=session.view;without.core=[];session.update(without);
  const restored=session.view;restored.core=[{kpiId:body.core.entries[0].kpiId,weight:0}];session.update(restored);
  session.markField('core',session.view.core[0].optionEDraftCoreId!,'weight'); const result=session.update(restored);
  const expected=clone(body);expected.core.entries[0].weightPercent=0;expect(result).toEqual(expected);
 });
 test.each([['rich',rich],['pinned',pinned]] as const)('noop overlay keeps every %s field and optional-key presence exact',(_name,body)=>{
  const session=new PrivateDraftV3EditorSession(context(body));expect(session.update(session.view)).toEqual(body);
 });
 test('wording only preserves distinct description/measure/outcome/criterion, rawtargets, pins and all other sections',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;view.personal[0].wording='Changed wording';
  const expected=clone(body);expected.impact[0].wording='Changed wording';expect(session.update(view)).toEqual(expected);
 });
 test('untouched unset weight remains absent despite displayed0',()=>{
  const body=activeRich();delete body.impact[0].personalItemWeight;
  const session=new PrivateDraftV3EditorSession(context(body));expect(session.view.personal[0].weight).toBe(0);
  expect(session.update(session.view).impact[0]).not.toHaveProperty('personalItemWeight');
 });
 test('untouched stored0 remains explicit',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body));expect(session.update(session.view).impact[0]).toHaveProperty('personalItemWeight',0);
 });
 test('explicit same-display0 event distinguishes an edited value from unset',()=>{
  const body=activeRich();delete body.impact[0].personalItemWeight;
  const session=new PrivateDraftV3EditorSession(context(body));session.markField('impact',body.impact[0].impactId,'weight');
  expect(session.update(session.view).impact[0]).toHaveProperty('personalItemWeight',0);
 });
 test('changed target text is editorText and never destroys native numeric/text pairs',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;view.personal[0].annual='001% pending';
  const result=session.update(view);expect(result.impact[0].targets.annual).toEqual({...body.impact[0].targets.annual,editorText:'001% pending'});
 });
 test('untouched aliases/shared0/denominator0/quarterorder retain exact source, not projected UI assumptions',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;view.personal[0].wording='An ordinary other edit';
  expect(session.update(view).core).toEqual(body.core);
 });
 test('Core target edit retains rules/native-role/quarterorder and raw slot',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;view.core[0].annualContribution='unparsed 01';
  const expected=clone(body.core);expected.entries[0].targets.annual.editorText='unparsed 01';expect(session.update(view).core).toEqual(expected);
 });
 test('unseen inactive rows survive visible editing without being treated as removal',()=>{
  const body=clone(rich),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;expect(view.personal).toHaveLength(0);
  view.core[0].q1='pending';expect(session.update(view).impact).toEqual(body.impact);
 });
 test('explicit visible removal changes activity only and retains all original payload',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;view.personal=[];
  const expected=clone(body);expected.impact[0].activeInWorkplan=false;expect(session.update(view)).toEqual(expected);
 });
 test('new IMPACT stores actual100 planning weight and unfinished/unclassified text',()=>{
  const body=clone(rich),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;
  view.personal=[{key:'FICTION-NEW',wording:'',measure:'Number / Quantity',unit:'',annual:'',q1:'',q2:'',q3:'',q4:'',success:'',weight:100}];
  const result=session.update(view);expect(result.impact[0]).toEqual(body.impact[0]);expect(result.impact[1].personalItemWeight).toBe(100);
  expect(result.impact[1].classification).toEqual({state:'Unselected'});expect(result.impact[1].wording).toBe('');
 });
 test('repeated overlays keep previously touched values and original unrelated data',()=>{
  const body=activeRich(),session=new PrivateDraftV3EditorSession(context(body)),view=session.view;view.personal[0].wording='first';session.update(view);
  view.personal[0].annual='second';const result=session.update(view);expect(result.impact[0].wording).toBe('first');expect(result.impact[0].targets.annual.editorText).toBe('second');
  expect(result.impact[0].description).toBe(body.impact[0].description);
 });
 test('read-only context disagreement never creates a usable editor baseline',()=>{
  const c=context(rich);c.readback.workplan.rowVersionToken=2;expect(()=>new PrivateDraftV3EditorSession(c)).toThrow(/context/);
 });
 test('retained unverified buffer stays separate from the actual canonical/read-only context',()=>{
  const c=context(activeRich()),buffer=clone(c.canonical.aggregate);buffer.impact[0].wording='pending';
  const session=new PrivateDraftV3EditorSession(c,buffer);expect(session.context.canonical.aggregate).toEqual(c.canonical.aggregate);
  expect(session.update(session.view).impact[0].wording).toBe('pending');
 });
});
