// Developer DOM check of existing frozen R32 loose AMD bytes, not an installed/shipped-package or browser QA claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {webcrypto} from 'node:crypto';
import {sha256} from './start-local-package-host.mjs';
const repoRoot=process.env.KCF_PREVIEW_REPO_ROOT;
if (!repoRoot) throw new Error('Explicit frozen KCF_PREVIEW_REPO_ROOT required');
const require=createRequire(path.resolve(repoRoot,'package.json')),{JSDOM}=require('jsdom');
const tooling=path.dirname(fileURLToPath(import.meta.url));
const wait=ms => new Promise(resolve => setTimeout(resolve,ms));
async function until(predicate,label) {for(let i=0;i<150;i++){if(predicate())return;await wait(20);}throw new Error(`Developer DOM wait failed: ${label}`);}
test('existing frozen loose AMD mounts actual six routes and disposes actor state (Developer DOM only)',async () => {
  const manifest=JSON.parse(fs.readFileSync(path.join(repoRoot,'dist/fdda2947-ce80-4419-abe4-2f51bb7e0423.manifest.json'),'utf8'));
  const resources=manifest.loaderConfig.scriptResources,moduleId=`${manifest.id}_${manifest.version}`;
  const entryBytes=fs.readFileSync(path.join(repoRoot,'dist',resources[manifest.loaderConfig.entryModuleId].path));
  const entryUrl='/assets/'+resources[manifest.loaderConfig.entryModuleId].path,stringsUrl='/assets/'+resources.PerformanceHubWebPartStrings.path;
  const seedText=fs.readFileSync(path.join(tooling,'fixture-seed.json'),'utf8');
  const dom=new JSDOM(fs.readFileSync(path.join(tooling,'index.html'),'utf8').replace(/<script[^>]*><\/script>/g,''),{url:'http://127.0.0.1:4488/package-host/',runScripts:'outside-only',pretendToBeVisual:true});
  const win=dom.window;
  try {
    Object.defineProperty(win,'crypto',{value:webcrypto});win.TextEncoder=TextEncoder;
    // Execute the actual portable fixture source in the same DOM realm as the AMD app, as a browser would.
    win.eval(fs.readFileSync(path.join(tooling,'fixture.mjs'),'utf8').replaceAll('export ','')+'\nwindow.FictionalStore=FictionalStore;window.dataService=dataService;');
    win.eval('const ActualFixtureStore=window.FictionalStore;window.FictionalStore=class extends ActualFixtureStore {constructor(seed){super(seed);window.__DEVELOPER_FIXTURE_STORE__=this;}};');
    win.eval(fs.readFileSync(path.join(repoRoot,'node_modules/react/umd/react.production.min.js'),'utf8'));
    win.eval(fs.readFileSync(path.join(repoRoot,'node_modules/react-dom/umd/react-dom.production.min.js'),'utf8'));
    const modules={react:win.React,'react-dom':win.ReactDOM};let loading;
    win.define=(id,dependencies,factory) => {
      if (typeof id !== 'string') {factory=dependencies;dependencies=id;id=loading;}
      const exported={};
      modules[id]=factory(...dependencies.map(name => {if(name==='exports')return exported;if (!Object.hasOwn(modules,name)) throw new Error(`AMD dependency absent: ${name}`);return modules[name];})) ?? exported;
    };win.define.amd={};
    win.requirejs=(ids,resolve,reject) => {try {
      for(const id of ids) if(!Object.hasOwn(modules,id)) {
        loading=id;
        if(id===moduleId){loading='PerformanceHubWebPartStrings';win.eval(fs.readFileSync(path.join(repoRoot,'dist',resources.PerformanceHubWebPartStrings.path),'utf8'));loading=id;win.eval(entryBytes.toString('utf8'));}
        else throw new Error(`Undeclared AMD request ${id}`);
      }
      resolve(...ids.map(id => modules[id]));
    }catch(error){reject(error);}};
    win.requirejs.config=() => {};
    win.fetch=async url => {
      if (!['/package-host/config.json','/package-host/fixture-seed.json'].includes(url)) throw new Error('Undeclared DOM transport request');
      return {ok:true,json:async () => win.JSON.parse(url.endsWith('fixture-seed.json') ? seedText : JSON.stringify({moduleId,entry:{url:entryUrl},strings:{url:stringsUrl},
        scope:'Existing frozen loose AMD Developer check; actual supplied package smoke pending',entrySha256:sha256(entryBytes)}))};
    };
    win.eval(fs.readFileSync(path.join(tooling,'host.mjs'),'utf8').replace(/^import[^\n]+\n/,''));
    const root=win.document.getElementById('package-root'),error=win.document.getElementById('host-error');
    try {await until(() => root.textContent.includes('Build My Workplan') || error.textContent,'actual root mounted');}
    catch(cause) {console.log(JSON.stringify({rootText:root.textContent,hostError:error.textContent,lifetime:win.document.getElementById('lifetime').textContent,lab:!!win.__KCF_PACKAGE_HOST_LAB__,modules:Object.keys(modules)}));throw cause;}
    assert.equal(error.textContent,'');
    const clickRoute=async screen => {win.document.querySelector(`[data-screen="${screen}"]`).click();await until(() => !win.document.querySelector('[data-screen]').disabled,'route done');assert.equal(error.textContent,'');};
    await clickRoute('employeeLanding');assert.match(root.textContent,/Employee/);
    await clickRoute('CoreBuilder');assert.match(root.textContent,/Choose Core KPIs/);
    assert.match(win.document.getElementById('retained-limit').textContent,/SCOPED CATALOGUE MISMATCH/);
    await clickRoute('ImpactBuilder');assert.match(root.textContent,/A normal weighted employee outcome/);
    const button=text => {const found=Array.from(root.querySelectorAll('button')).find(row => row.textContent.trim()===text && !row.disabled);if(!found)throw new Error('Actual Root button unavailable: '+text);return found;};
    button('Edit').click();await until(() => root.querySelector('textarea'),'actual IMPACT edit field');
    loading='developer-test-utils';win.eval(fs.readFileSync(path.join(repoRoot,'node_modules/react-dom/umd/react-dom-test-utils.production.min.js'),'utf8'));
    const utils=modules['developer-test-utils'] || win.ReactTestUtils;
    const input=root.querySelector('textarea');input.value='£ locally committed through actual Root';utils.Simulate.change(input);
    await clickRoute('BehaviourBuilder');assert.match(root.textContent,/Behaviours/);
    await clickRoute('SavedSummary');assert.match(root.textContent,/Save Draft/);
    button('Save Draft').click();await until(() => root.querySelector('[data-option-e-save-status="Saved"]'),'actual matching Save readback');
    const expected=JSON.parse(JSON.parse(seedText).draft.DraftPayloadJSON);expected.impact[0].wording='£ locally committed through actual Root';
    const memory=win.__DEVELOPER_FIXTURE_STORE__;
    assert.deepEqual(JSON.parse(memory.draft.DraftPayloadJSON),expected);assert.equal(memory.draft.DraftPayloadSHA256,sha256(Buffer.from(memory.draft.DraftPayloadJSON)));
    assert.equal(memory.requests.filter(row => row.method==='POST').length,1);
    win.document.getElementById('close').click();await until(() => !root.textContent,'actual unmount');
    win.document.getElementById('reopen').click();await until(() => root.textContent.includes('Build My Workplan'),'fresh actual root');
    await clickRoute('ImpactBuilder');assert.match(root.textContent,/£ locally committed through actual Root/);
    await clickRoute('ManagerScreen');assert.match(root.textContent,/My Team/);assert.doesNotMatch(root.textContent,/£ locally committed through actual Root/);
    const actor=win.document.getElementById('actor');actor.value='2';actor.dispatchEvent(new win.Event('change',{bubbles:true}));
    await until(() => root.textContent.includes('Fictional Other Employee') && !actor.disabled,'other actor fresh root');assert.doesNotMatch(root.textContent,/£ locally committed through actual Root/);
    console.log(JSON.stringify({developerLooseAmdEntrySha256:sha256(entryBytes),moduleId,sixRoutes:'actual Root navigation checked in jsdom',shippedPackageSmoke:'PENDING'}));
  }finally {win.close();}
});
