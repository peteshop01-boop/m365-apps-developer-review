export const SITE = 'https://kcf-test.invalid/sites/first-save';
export const clone = value => JSON.parse(JSON.stringify(value));
const response = (status, body = {}) => ({ status, ok:status >= 200 && status < 300,
  json:async () => clone(body), text:async () => JSON.stringify(body) });
export class FictionalStore {
  constructor(seed) { this.seed=clone(seed); this.reset(); }
  reset() { this.header=clone(this.seed.header); this.draft=clone(this.seed.draft); this.requests=[]; this.mode='success'; this.version=1; }
  client(actor) { return { get:async url => this.get(actor,url), post:async (url,_configuration,options) => this.post(actor,url,options) }; }
  address(url) {
    const parsed = new URL(url), match=parsed.pathname.match(/getbytitle\('([^']+)'\)\/items(?:\((\d+)\))?$/);
    if (parsed.origin !== new URL(SITE).origin || !parsed.pathname.startsWith('/sites/first-save/_api/web/lists/') || !match)
      throw new Error('LOCAL fixture refuses unspecified endpoint; no network fallback');
    return {parsed,title:match[1],item:match[2] ? Number(match[2]) : undefined};
  }
  filtered(row,filter) {
    const terms=Array.from(filter.matchAll(/([A-Za-z]+) eq (?:'([^']*)'|(\d+)|(true|false))/g));
    if (!terms.length) throw new Error('LOCAL fixture requires a declared filter');
    return terms.every(term => { const expected=term[2] ?? (term[3] !== undefined ? Number(term[3]) : term[4] === 'true');
      return typeof row[term[1]] === 'boolean' && typeof expected === 'number' ? Number(row[term[1]]) === expected : row[term[1]] === expected; });
  }
  projection(row,select) {
    const result=row['@odata.etag'] ? {'@odata.etag':row['@odata.etag']} : {};
    for (const field of select.split(',')) {
      if (field.startsWith('Editor/')) result.Editor=clone(row.Editor);
      else if (row[field] !== undefined) result[field]=clone(row[field]);
    }
    return result;
  }
  get(actor,url) {
    const {parsed,title,item}=this.address(url), select=parsed.searchParams.get('$select') || '',filter=parsed.searchParams.get('$filter') || '';
    let status=200,body;
    const own=actor.email === this.seed.people[0].email;
    if (title === 'KCFKPI_People') {
      const rows=this.seed.people.map(person => ({Id:person.id,UniqueId:`10000000-0000-4000-8000-${String(person.id).padStart(12,'0')}`,
        PersonKey:person.personKey,Email:person.email,Active:person.active}));
      body={value:rows.filter(row => this.filtered(row,filter)).map(row => this.projection(row,select))};
    } else if (title === 'KCFKPI_Workplans') body={value:own && this.filtered(this.header,filter) ? [this.projection(this.header,select)] : []};
    else if (title === 'KCFKPI_WorkplanItems') {
      if (select !== 'Id,WorkplanKey') {status=400;body={error:'Rich item schema not installed in this local simulation'};}
      else body={value:[]};
    } else if (title === 'KCFKPI_Audit') body={value:[]};
    else if (title === 'KCFKPI_WorkplanDrafts' && item === 17) {
      if (!own || this.mode === 'denyReadback' && this.requests.some(row => row.method === 'POST')) {status=403;body={error:'Declared fictional own-item read denied'};}
      else body=this.projection(this.draft,select);
    } else throw new Error('LOCAL fixture list/item not declared');
    this.requests.push({method:'GET',actor:actor.email,url,status}); return response(status,body);
  }
  async post(actor,url,options) {
    const {title,item}=this.address(url),body=JSON.parse(options.body);
    if (title !== 'KCFKPI_WorkplanDrafts' || item !== 17 || Object.keys(body).sort().join(',') !== 'ClientSaveID,ClientSavedAt,DraftPayloadJSON,DraftPayloadSHA256'
      || options.headers['X-HTTP-Method'] !== 'MERGE' || Object.values(body).some(value => typeof value !== 'string'))
      throw new Error('LOCAL fixture accepts only the protected four-field Draft MERGE');
    let status=204;
    if (actor.email !== this.seed.people[0].email || this.mode === 'deny') status=403;
    else if (this.mode === 'conflict' || options.headers['IF-MATCH'] !== this.draft['@odata.etag']) status=412;
    else {
      Object.assign(this.draft,clone(body)); this.draft['@odata.etag']=`"draft-${++this.version}"`; this.draft.Modified=new Date().toISOString();
      if (this.mode === 'commitThen500') status=500;
    }
    this.requests.push({method:'POST',actor:actor.email,url,status,body:clone(body),headers:clone(options.headers)});
    return response(status);
  }
}
export const CATALOGUE=[{kpiId:'HISTORIC-KPI',kpiVersionKey:'HISTORIC-KPI|v1',targetVersionKey:'HISTORIC-TARGET|v1',
  wording:'Fictional service delivery: complete agreed items',pillar:'Local fictional delivery',workstream:'Fictional operations',
  scoringDirection:'HigherIsBetter',metricType:'Count',unitLabel:'items',yearEndTargetValue:100,q1TargetValue:25,q2TargetValue:25,q3TargetValue:25,q4TargetValue:25}];
export const BEHAVIOURS=[{behaviourId:'BHV-01',behaviourVersionKey:'BHV-01|v1',title:'Fictional collaboration',
  description:'Work with colleagues and explain progress clearly.',assessmentGuidance:'Declared local illustration only',defaultWorkplanWeight:100,displayOrder:1}];
// This is the declared readonly lab adapter. Protected private bytes are still read by the shipped V3 gateway/controller.
export function dataService(store,actor) {
  const fail=async () => {throw new Error('LOCAL fixture: this service surface is held');};
  const reads={
    getPersonByEmail:async email => clone(store.seed.people.find(person => person.email === email) ?? null) ?? undefined,
    getProductionConfig:async () => clone(store.seed.config),
    getReferenceCounts:async () => ({activeKpis:CATALOGUE.length,approvedAnnualTargets:CATALOGUE.length,publishedBehaviours:BEHAVIOURS.length}),
    getWorkplanStatus:async personKey => personKey === store.header.PersonKey && actor.personKey === personKey ? store.header.State : 'NotStarted',
    getCoreKpiCatalogue:async () => clone(CATALOGUE),getPublishedBehaviours:async () => clone(BEHAVIOURS),
    getBehaviourObjectiveLibrary:async () => [], getCoreWorkplanItems:async () => [],getPersonalWorkplanItems:async () => [],getBehaviourWorkplanItems:async () => [],
    getDirectReports:async manager => manager.personKey === store.seed.people[1].personKey ? [clone(store.seed.people[0])] : [],
    getManagerReviewContexts:async () => [],getManagerQuarterReviewContexts:async () => [],getQuarterTimingConfig:fail,
    getEmployeeWorkplanV2:async (person,year) => {
      if (person.email !== actor.email || !person.active || !person.appRoles.includes('Employee')) throw new Error('LOCAL actor mismatch');
      const url=`${SITE}/_api/web/lists/getbytitle('KCFKPI_Workplans')/items?$select=${Object.keys(store.header).filter(k => k !== '@odata.etag').join(',')}&$filter=${encodeURIComponent(`PersonKey eq '${person.personKey}' and PerformanceYear eq ${year}`)}`;
      const reply=await store.client(actor).get(url),row=(await reply.json()).value[0]; if (!row) return undefined;
      const map={Id:'id',WorkplanKey:'workplanKey',PersonKey:'personKey',EmployeeDisplayName:'employeeDisplayName',EmployeeEmail:'employeeEmail',
        PerformanceYear:'performanceYear',ManagerPersonKey:'managerPersonKey',ManagerDisplayName:'managerDisplayName',ManagerEmail:'managerEmail',State:'state',
        AccessState:'accessState',TransitionStatus:'transitionStatus',CoreCategoryWeight:'coreCategoryWeight',PersonalCategoryWeight:'personalCategoryWeight',
        BehaviourCategoryWeight:'behaviourCategoryWeight',CoreWeightingMode:'coreWeightingMode',WorkplanVersion:'workplanVersion',RowVersionToken:'rowVersionToken'};
      const workplan={etag:row['@odata.etag']}; for (const [native,domain] of Object.entries(map)) workplan[domain]=row[native];
      return {workplan,coreItems:[],personalItems:[],behaviourItems:[],audits:[]};
    }
  };
  return new Proxy(reads,{get:(target,name) => Object.hasOwn(target,name) ? target[name] : fail});
}
