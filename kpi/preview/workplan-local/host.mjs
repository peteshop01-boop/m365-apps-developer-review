import {FictionalStore,dataService} from './fixture.mjs';
async function boot() {
const byId=id => document.getElementById(id);
const hash=async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),byte => byte.toString(16).padStart(2,'0')).join('').toUpperCase();
const json=async url => {const response=await fetch(url);if (!response.ok) throw new Error(`Local static input unavailable: ${response.status}`);return response.json();};
const config=await json('/package-host/config.json'),seed=await json('/package-host/fixture-seed.json');
if (await hash(seed.draft.DraftPayloadJSON) !== seed.draft.DraftPayloadSHA256) throw new Error('Declared retained Draft SHA mismatch');
byId('provenance').textContent=JSON.stringify({scope:'LOCAL / NOT INSTALLED',package:config,fixture:seed.provenance,fixtureSourceCommit:seed.sourceCommit,initialDraftSha256:seed.draft.DraftPayloadSHA256},null,2);
const store=new FictionalStore(seed);
let actorIndex=0,part,WebPart,reactDom,busy=false,generation=0;
const held=async () => {throw new Error('NATIVE SPHttpClient is disabled in LOCAL package host');};
function BaseClientSideWebPart() {
  this.domElement=byId('package-root');this.properties={description:'LOCAL / NOT INSTALLED'};
  const actor=store.seed.people[actorIndex];
  this.context={spHttpClient:{get:held,post:held},pageContext:{web:{absoluteUrl:location.origin},user:{email:actor.email,displayName:actor.displayName}}};
}
define('@microsoft/sp-core-library',[],() => ({Version:{parse:value => value}}));
define('@microsoft/sp-property-pane',[],() => ({PropertyPaneTextField:() => ({})}));
define('@microsoft/sp-webpart-base',[],() => ({BaseClientSideWebPart}));
define('@microsoft/sp-http',[],() => ({SPHttpClient:{configurations:{v1:{}}}}));
requirejs.config({paths:{react:'/vendor/react','react-dom':'/vendor/react-dom',PerformanceHubWebPartStrings:config.strings.url.slice(0,-3),[config.moduleId]:config.entry.url.slice(0,-3)}});
const amd=ids => new Promise((resolve,reject) => requirejs(ids,(...values) => resolve(values),reject));
function status() {
  byId('fixture-status').textContent=`Fictional memory: ${store.draft['@odata.etag']} · ${store.requests.filter(row => row.method === 'POST').length} protected MERGE dispatch(es) · ${store.mode}`;
}
function close() {
  generation++;
  if (part) {if (typeof part.onDispose === 'function') part.onDispose();else reactDom.unmountComponentAtNode(byId('package-root'));part=undefined;}
  delete window.__KCF_PACKAGE_HOST_LAB__;
  byId('package-root').replaceChildren();
  byId('lifetime').textContent='App closed and unmounted. Fictional committed Draft memory retained; unsaved component state discarded. Reopen creates a fresh WebPart/controller.';
  status();
}
async function open() {
  if (part) return;
  const actor=store.seed.people[actorIndex],token=++generation;
  window.__KCF_PACKAGE_HOST_LAB__={syntheticReadOnly:true,dataService:dataService(store,actor),
    adminReportingDataService:{getAdminReportingControlSnapshot:held},privateDraftTransport:store.client(actor)};
  const next=new WebPart();await next.onInit();
  if (token !== generation) return;
  part=next;part.render();
  byId('lifetime').textContent=`Fresh app opened as ${actor.displayName}. Latest permitted fictional Draft is read through the shipped gateway/controller. Manager approvals, Start, Submit, Quarter and administration stay held.`;
  status();
}
const delay=ms => new Promise(resolve => setTimeout(resolve,ms));
async function click(text) {
  for (let attempt=0;attempt<100;attempt++) {
    const button=Array.from(byId('package-root').querySelectorAll('button')).find(row => row.textContent.trim() === text && !row.disabled);
    if (button) {button.click();await delay(80);return;}
    await delay(50);
  }
  throw new Error(`Actual package control unavailable: ${text}. The route was not forced.`);
}
const routes={employeeLanding:['Employee'],CoreBuilder:['Build My Workplan','Core KPIs'],ImpactBuilder:['Build My Workplan','IMPACT KPIs'],
  BehaviourBuilder:['Build My Workplan','Behaviours'],SavedSummary:['Build My Workplan','Review & Weight'],ManagerScreen:['My Team']};
async function route(screen) {
  if (!Object.hasOwn(routes,screen)) throw new Error('Unknown local journey route');
  if (screen === 'ManagerScreen' && actorIndex !== 1) {close();actorIndex=1;byId('actor').value='1';}
  else if (screen !== 'ManagerScreen' && actorIndex === 1) {close();actorIndex=0;byId('actor').value='0';}
  await open();for (const step of routes[screen]) await click(step);
  if (screen === 'CoreBuilder' && !byId('package-root').textContent.includes('Fictional service delivery'))
    byId('retained-limit').textContent='SCOPED CATALOGUE MISMATCH: the shipped Core Builder displays its embedded current catalogue, not the finite fictional lab catalogue. The retained HISTORIC-KPI has no displayed current card. Its exact private Draft bytes remain preserved; this preview does not claim full Core editor qualification.';
  const url=new URL(location.href);url.searchParams.set('screen',screen);url.searchParams.set('actor',String(actorIndex));history.replaceState({},'',url);
  byId('lifetime').textContent+=` Current requested journey: ${screen}. Saved summary reflects the actual app status; a loaded Draft alone is not a new Save confirmation.`;
}
async function action(work) {
  if (busy) return;busy=true;byId('host-error').textContent='';
  document.querySelectorAll('#lab-banner button,#lab-banner select').forEach(control => {control.disabled=true;});
  try {await work();}catch(error) {byId('host-error').textContent=String(error.message || error);}
  finally {busy=false;document.querySelectorAll('#lab-banner button,#lab-banner select').forEach(control => {control.disabled=false;});status();}
}
try {
  [WebPart,reactDom]=await amd([config.moduleId,'react-dom']);WebPart=WebPart.default || WebPart;
  byId('close').onclick=() => action(async () => close());
  byId('reopen').onclick=() => action(open);
  byId('reset').onclick=() => action(async () => {close();store.reset();byId('outcome').value='success';await open();});
  byId('actor').onchange=event => action(async () => {close();actorIndex=Number(event.target.value);await open();});
  byId('outcome').onchange=event => {store.mode=event.target.value;status();};
  document.querySelectorAll('[data-screen]').forEach(button => {button.onclick=() => action(() => route(button.dataset.screen));});
  const params=new URLSearchParams(location.search),selected=params.get('actor');
  if (selected !== null) {if (!['0','1','2'].includes(selected)) throw new Error('Unknown fictional actor');actorIndex=Number(selected);byId('actor').value=selected;}
  await action(async () => {await open();if (params.has('screen')) await route(params.get('screen'));});
  setInterval(status,500);
  window.__KCF_PACKAGE_HOST_RESULT__={moduleId:config.moduleId,packageSha256:config.packageSha256,scope:'LOCAL / NOT INSTALLED'};
}catch(error) {byId('host-error').textContent=String(error.message || error);}
}
boot().catch(error => {document.getElementById('host-error').textContent=String(error.message || error);});
