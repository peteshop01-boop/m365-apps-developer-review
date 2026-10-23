import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {FictionalStore,dataService,SITE,clone} from './fixture.mjs';
import {sha256,extractPackage,staticServer,start} from './start-local-package-host.mjs';
const repoRoot=process.env.KCF_PREVIEW_REPO_ROOT;
if (!repoRoot) throw new Error('Explicit KCF_PREVIEW_REPO_ROOT required');
const require=createRequire(path.resolve(repoRoot,'package.json')),JSZip=require('jszip');
const compiled=relative => require(path.join(path.resolve(repoRoot),'lib-commonjs/webparts/performanceHub',relative));
const {OptionEDraftSaveController}=compiled('components/OptionEDraftSaveController.js');
const {OptionEDraftSharePointGateway}=compiled('services/OptionEDraftSharePointGateway.js');
const {OptionEProtectedDraftGateway}=compiled('services/OptionEProtectedDraftGateway.js');
const {OPTION_E_WORKPLAN_LIST_BINDINGS:bindings}=compiled('services/OptionEWorkplanListBindings.js');
const {canonicaliseOptionEPartialDraftV3}=compiled('services/OptionEWorkplanDraftV3Wire.js');
const directory=path.dirname(fileURLToPath(import.meta.url));
const seed=JSON.parse(fs.readFileSync(path.join(directory,'fixture-seed.json'),'utf8'));
const controller=(store,actor=seed.people[0]) => {
  const client=store.client(actor),leaf=new OptionEDraftSharePointGateway(client,SITE,bindings,{},undefined,'kcf.workplan-draft/v3');
  return new OptionEDraftSaveController(new OptionEProtectedDraftGateway(client,SITE,actor.email,bindings,{},leaf,'kcf.workplan-draft/v3'),randomUUID,() => new Date(),'kcf.workplan-draft/v3');
};
async function edit(store,wording='Local changed wording') {
  const actual=controller(store);await actual.open({performanceYear:2026});const body=actual.snapshot.buffer;
  body.impact[0].wording=wording;actual.replaceBuffer(body);return actual;
}
test('retained seed has actual fixed codec bytes/SHA and preserves opaque zero/unset/pairs/history',() => {
  const body=JSON.parse(seed.draft.DraftPayloadJSON);
  assert.equal(canonicaliseOptionEPartialDraftV3(body),seed.draft.DraftPayloadJSON);assert.equal(sha256(Buffer.from(seed.draft.DraftPayloadJSON)),seed.draft.DraftPayloadSHA256);
  assert.equal(body.impact[0].targets.annual.numericValue,0);assert.equal(Object.hasOwn(body.impact[0].targets.q1,'value'),false);
  assert.equal(body.impact[1].activeInWorkplan,false);assert.equal(body.core.entries[0].sharedApportionmentPercent,0);
  assert.deepEqual(body.behaviours.entries[0].guidancePromptKeys,['PROMPT-B','PROMPT-A']);assert.equal(body.employeeNotes.categoryWeightReason,'Retained private reason');
});
test('actual compiled protected gateway/controller Save retains full bytes except edited wording and dispatches once',async () => {
  const store=new FictionalStore(seed),actual=await edit(store);await actual.save();
  const expected=JSON.parse(seed.draft.DraftPayloadJSON);expected.impact[0].wording='Local changed wording';
  assert.deepEqual(JSON.parse(store.draft.DraftPayloadJSON),expected);assert.equal(actual.snapshot.status,'Saved');
  assert.equal(store.requests.filter(row => row.method === 'POST').length,1);assert.equal(store.draft.DraftPayloadSHA256,sha256(Buffer.from(store.draft.DraftPayloadJSON)));
  assert.match(store.draft.ClientSaveID,/^[0-9a-f-]{36}$/i);assert.ok(Date.parse(store.draft.ClientSavedAt));
});
test('fresh controller reopens latest committed fixture instead of former component buffer',async () => {
  const store=new FictionalStore(seed),actual=await edit(store,'Latest committed wording');await actual.save();
  const reopened=controller(store);await reopened.open({performanceYear:2026});
  assert.equal(reopened.snapshot.buffer.impact[0].wording,'Latest committed wording');assert.equal(reopened.snapshot.canonical.etag,store.draft['@odata.etag']);
});
for (const index of [1,2]) test(`fictional actor ${index} receives no former employee private Draft`,async () => {
  const store=new FictionalStore(seed),actual=controller(store,seed.people[index]);
  await assert.rejects(actual.open({performanceYear:2026}),error => error.code === 'CONTROL_MISSING');
  assert.equal(actual.snapshot.buffer,undefined);assert.equal(store.requests.filter(row => row.url.includes("getbytitle('KCFKPI_WorkplanDrafts')")).length,0);
  assert.equal(await dataService(store,seed.people[index]).getEmployeeWorkplanV2(seed.people[index],2026),undefined);
});
for (const mode of ['deny','conflict']) test(`${mode} retains editor and cannot confirm Saved`,async () => {
  const store=new FictionalStore(seed),actual=await edit(store);store.mode=mode;await actual.save();
  assert.notEqual(actual.snapshot.status,'Saved');assert.equal(actual.snapshot.buffer.impact[0].wording,'Local changed wording');
  assert.equal(store.draft.DraftPayloadJSON,seed.draft.DraftPayloadJSON);assert.equal(store.requests.filter(row => row.method === 'POST').length,1);
});
test('committed response loss is confirmed only through actual matching persisted readback',async () => {
  const store=new FictionalStore(seed),actual=await edit(store);store.mode='commitThen500';await actual.save();
  assert.equal(actual.snapshot.status,'Saved');assert.equal(store.requests.filter(row => row.method === 'POST').length,1);
});
test('committed readback denial holds uncertainty and retains editing without a blind repeat',async () => {
  const store=new FictionalStore(seed),actual=await edit(store);store.mode='denyReadback';await actual.save();
  assert.notEqual(actual.snapshot.status,'Saved');assert.equal(actual.snapshot.buffer.impact[0].wording,'Local changed wording');
  assert.equal(store.requests.filter(row => row.method === 'POST').length,1);assert.equal(JSON.parse(store.draft.DraftPayloadJSON).impact[0].wording,'Local changed wording');
});
test('readonly lab adapter observes current header and holds unrelated service mutations',async () => {
  const store=new FictionalStore(seed),service=dataService(store,seed.people[0]);store.header.RowVersionToken=2;store.header['@odata.etag']='"control-2"';
  const read=await service.getEmployeeWorkplanV2(seed.people[0],2026);assert.equal(read.workplan.rowVersionToken,2);assert.equal(read.workplan.etag,'"control-2"');
  await assert.rejects(service.approveWorkplan(),/held/);await assert.rejects(service.getOrCreateDraftWorkplan(),/held/);await assert.rejects(service.saveQuarterReviewItem(),/held/);
});
test('fixture has no transport fallback and refuses other origins or non-four-field writes',async () => {
  const store=new FictionalStore(seed),client=store.client(seed.people[0]);
  await assert.rejects(client.get('https://another-fixture.invalid/_api/web/lists/'),/no network fallback/);
  await assert.rejects(client.post(`${SITE}/_api/web/lists/getbytitle('KCFKPI_WorkplanDrafts')/items(17)`,{},
    {headers:{'X-HTTP-Method':'MERGE'},body:'{"Unrelated":"field"}'}),/four-field/);assert.equal(store.requests.length,0);
});
const moduleId='33333333-3333-4333-8333-333333333333_1.0.0';
async function testArchive() {
  // Ordinary test ZIP only; never reported as a shipped package smoke.
  const zip=new JSZip(),manifest={id:moduleId.split('_')[0],version:'1.0.0',componentType:'WebPart',loaderConfig:{entryModuleId:'entry',internalModuleBaseUrls:['HTTPS://SPCLIENTSIDEASSETLIBRARY/'],scriptResources:{entry:{type:'path',path:'entry.js'},PerformanceHubWebPartStrings:{type:'path',path:'strings.js'}}}};
  zip.file('AppManifest.xml','<App SharePointMinVersion="16.0.0.0" Version="1.0.0.0"/>');zip.file('fixture/WebPart_one.xml',`<WebPart ComponentManifest="${JSON.stringify(manifest).replaceAll('"','&quot;')}"/>`);
  zip.file('ClientSideAssets/entry.js',`define("${moduleId}",[],function(){return {};});`);zip.file('ClientSideAssets/strings.js','define([],function(){return {};});');
  return zip.generateAsync({type:'nodebuffer'});
}
test('test archive extraction verifies actual SHA/manifest/AMD identity and refuses mismatching expected SHA',async () => {
  const bytes=await testArchive(),extracted=await extractPackage(bytes,JSZip,sha256(bytes));
  assert.equal(extracted.info.appVersion,'1.0.0.0');assert.equal(extracted.info.moduleId,moduleId);assert.equal(extracted.info.entry.sha256,sha256(extracted.entry.bytes));
  await assert.rejects(extractPackage(bytes,JSZip,'0'.repeat(64)),/SHA-256/);
});
test('GET-only loopback server serves exact local assets/CSP and rejects POST',async () => {
  const port=4489,server=staticServer(new Map([['/package-host/',[Buffer.from('LOCAL / NOT INSTALLED'),'text/html']]]),port);
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  try {const reply=await fetch(`http://127.0.0.1:${port}/package-host/`);assert.equal(reply.status,200);assert.match(reply.headers.get('content-security-policy'),/connect-src 'self'/);
    assert.equal(await reply.text(),'LOCAL / NOT INSTALLED');assert.equal((await fetch(`http://127.0.0.1:${port}/package-host/`,{method:'POST'})).status,405);
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing`)).status,404);assert.equal(server.address().address,'127.0.0.1');
  }finally {await new Promise(resolve => server.close(resolve));}
});
test('portable startup requires explicit package/source identity and has no private default path',async () => {
  await assert.rejects(start({}),/Explicit/);const source=fs.readFileSync(path.join(directory,'start-local-package-host.mjs'),'utf8');assert.doesNotMatch(source,/C:[/\\]/);
});
