// BUILD-M009: capture-only continuation; retained functional verify phase is not rerun.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const webpack = require('webpack');
const { chromium } = require('C:/Users/Developer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, i, all) => i % 2 ? pairs : [...pairs, [item.replace(/^--/, ''), all[i + 1]]], []));
assert.equal(args.host, '127.0.0.1'); assert.equal(args.port, '4351'); assert.equal(args['as-of'], '2026-11-01');
const evidence = path.resolve(args.evidence);
assert.equal(evidence.toLowerCase(), 'c:\\kcf\\kpi\\_control\\02_qa\\kcf-kpi-bhvlib-001\\build_continuation_m009');
const temp = path.join(root, 'temp/bhvlib-001-m009-render');
const profile = path.join(root, 'temp/bhvlib-001-m009-profile');
assert(!fs.existsSync(profile), 'A NEW dedicated profile is required; existing profiles are never reused.');
assert(!fs.existsSync(temp), 'Continuation render path must be new.');
assert(['preflight', 'capture', 'verify'].includes(args.phase), 'Explicit preflight or verify phase required');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const initial = JSON.parse(fs.readFileSync(path.join(evidence, '01_INITIAL_IDENTITY_AND_PRESERVATION.json'), 'utf8'));
const previous = initial.starting_identity;
const git = (...argv) => execFileSync('git', ['-C', root, '--no-optional-locks', ...argv], { encoding: 'utf8', windowsHide: true });
assert.equal(root.toLowerCase(), 'c:/kcf/kpi/kcf-performance-hub-integrated-bhvlib-001-local'.replaceAll('/', path.sep));
assert.equal(git('branch', '--show-current').trim(), previous.branch);
assert.equal(git('rev-parse', 'HEAD').trim(), previous.head);
assert.equal(git('rev-parse', 'HEAD^').trim(), previous.parent);
assert.equal(git('rev-parse', 'HEAD^{tree}').trim(), previous.tree);
assert.equal(git('status', '--porcelain=v1', '--untracked-files=all'), previous.porcelain);
const allowed = ['scripts/kcf-kpi-bhvlib-001-local-checks.mjs', 'docs/KCF-KPI-BHVLIB-001_LOCAL_DELIVERY.md'];
const sourceHashes = Object.fromEntries(previous.changed_paths.map(file => [file, hash(path.join(root, file))]));
for (const [file, expected] of Object.entries(previous.source_hashes)) if (!allowed.includes(file)) assert.equal(sourceHashes[file], expected, file);
assert.equal(fs.realpathSync(path.join(root, 'node_modules')).toLowerCase(), 'c:\\kcf\\kpi\\kcf-performance-hub\\node_modules');
for (const file of ['lib/webparts/performanceHub/testing/BehaviourLibraryLocalHarness.js',
  'lib/webparts/performanceHub/components/IntegratedPerformanceHub.js',
  'lib/webparts/performanceHub/components/BehaviourLibrarySelector.module.scss.css']) assert(fs.existsSync(path.join(root, file)), file);
const fixtureText = fs.readFileSync(path.join(root, 'lib/webparts/performanceHub/testing/BehaviourLibraryLocalHarness.js'), 'utf8');
for (const name of ['integratedConfig', 'integratedTiming', 'getIntegratedDiagnostics', 'workplanVersion']) assert(fixtureText.includes(name), name);
for (const [file, expected] of Object.entries(initial.compiled_assets)) assert.equal(hash(path.join(root, file)), expected, `emitted ${file}`);
const snapshotFile = 'C:/KCF/KPI/_CONTROL/02_QA/KCF-KPI-BHVLIB-001/BUILD_CONTINUATION_M005/13_INTEGRATED_REMOUNT.json';
const captureSnapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8')).before;
assert.equal(captureSnapshot.items.length, 5);
assert(Number.isInteger(captureSnapshot.saves));
assert.deepEqual(captureSnapshot.items.map(row => row.behaviourId), ['BHV-01','BHV-02','BHV-03','BHV-04','BHV-05']);
assert.deepEqual(captureSnapshot.items[0].selectedSuggestionKeys, ['BHV-01-L3-02','BHV-01-L1-01']);
assert.equal(captureSnapshot.items[0].customObjective, 'Integrated hybrid commitment');
for (const row of captureSnapshot.items) {
  assert.equal(row.workplanKey, 'BHVLIB-001|synthetic|2026'); assert.equal(row.performanceYear, 2026);
  assert.equal(row.targetRating, 3); assert.equal(row.activeInWorkplan, true);
}
const positioningPreflight = [
  { name:'recorded failure', documentTop:809.59375, safeTop:88, expected:720 },
  { name:'exact integer', documentTop:810, safeTop:88, expected:721 },
  { name:'fractional', documentTop:810.25, safeTop:88.125, expected:721 },
  { name:'top document clamp', documentTop:0, safeTop:88, expected:0 }
].map(sample => {
  const rawTarget = sample.documentTop - sample.safeTop - 1;
  const requestedScrollY = Math.max(0, Math.floor(rawTarget));
  assert(Number.isFinite(requestedScrollY) && Number.isInteger(requestedScrollY) && requestedScrollY>=0);
  assert.equal(requestedScrollY,sample.expected,sample.name);
  const predictedTargetTop=sample.documentTop-requestedScrollY;
  const predictedClearance=predictedTargetTop-(sample.safeTop-10);
  if(sample.name==='recorded failure') { assert.equal(predictedTargetTop,89.59375); assert.equal(predictedClearance,11.59375); }
  return {...sample,rawTarget,floor:Math.floor(rawTarget),reserve:1,requestedScrollY,predictedTargetTop,predictedClearance,
    topDocumentClamp:rawTarget<0,acceptance:'Arithmetic only; captured geometry remains authoritative.'};
});
const preflight = { positioningPreflight, phase: args.phase, status: 'PASS', sourceHashes, root, evidence, temp, profile,
  compiledFiles: Object.keys(initial.compiled_assets).length, snapshotHash: hash(snapshotFile), freshPaths: true, dependencies: 'existing read-only junction', noBindOrBrowser: true, checkedAt: new Date().toISOString() };
if (args.phase === 'preflight') {
  fs.writeFileSync(path.join(evidence, '02_PREFLIGHT.json'), JSON.stringify(preflight, null, 2), { flag: 'wx' });
  process.stdout.write(JSON.stringify(preflight) + '\n');
  process.exit(0);
}
const priorPreflight = JSON.parse(fs.readFileSync(path.join(evidence, '02_PREFLIGHT.json'), 'utf8'));
assert.deepEqual(priorPreflight.sourceHashes, sourceHashes, 'source unchanged since preflight');
for (const name of ['root', 'evidence', 'temp', 'profile', 'snapshotHash']) assert.equal(priorPreflight[name], preflight[name]);
fs.mkdirSync(temp, { recursive: true });
const payload = JSON.parse(fs.readFileSync(path.join(root, 'data/KCF_BHVLIB_001_INSTALL_SEED.json'), 'utf8'));
const report = { started: new Date().toISOString(), status: 'RUNNING', syntheticAsOf: args['as-of'], host: args.host, port: 4351,
  checks: [], viewports: [], requests: [], errors: [], blockedRequests: [], leaseReleased: false, profile, browser: '' };
const write = (name, value) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); report.checks.push({ name, expected, actual, status: 'PASS' }); };
let context;
let page;
// Only original viewport captures, ordinary document scrolling and read-only geometry/hit tests.
const captureCoverage = async () => {
  const inspect = async () => page.evaluate(() => {
    const selector = document.querySelector('[data-behaviour-library="BHV-01"]');
    const candidate = document.querySelector('[data-candidate]');
    const headerMatches = document.querySelectorAll('[data-candidate] > header');
    const header = headerMatches[0];
    const host = document.getElementById('root');
    const article = selector.closest('article');
    const rect = el => { const r = el.getBoundingClientRect(); return { left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height }; };
    const identify = el => el ? { tag:el.tagName, id:el.id, className:typeof el.className === 'string' ? el.className : '', text:(el.textContent || '').trim().slice(0,100) } : null;
    const overlays = [...document.querySelectorAll('*')].filter(el => ['sticky','fixed'].includes(getComputedStyle(el).position))
      .filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height)
      .map(el => ({ element:el, identity:identify(el), rect:rect(el), position:getComputedStyle(el).position, zIndex:getComputedStyle(el).zIndex }));
    const nestedScroll = [];
    for (let el=selector.parentElement; el && el!==document.body; el=el.parentElement) {
      const css=getComputedStyle(el);
      if (/(auto|scroll)/.test(css.overflowY) && el.scrollHeight>el.clientHeight+1) nestedScroll.push({identity:identify(el), rect:rect(el), scrollTop:el.scrollTop, scrollHeight:el.scrollHeight, clientHeight:el.clientHeight});
    }
    const headerRect=rect(header), sr=rect(selector);
    const clearance=10, safeTop=Math.max(0,headerRect.bottom)+clearance, safeBottom=innerHeight-clearance;
    const intersects=(a,b)=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
    const hitRect=(el, region) => {
      const insetX=Math.min(3,region.width/4), insetY=Math.min(3,region.height/4);
      const points=[];
      for(const x of [region.left+insetX,(region.left+region.right)/2,region.right-insetX])
        for(const y of [region.top+insetY,(region.top+region.bottom)/2,region.bottom-insetY]) {
          const stack=document.elementsFromPoint(x,y), top=stack[0];
          const related=!!top && (el===top || el.contains(top) || (top.tagName==='LABEL' && top.contains(el)));
          points.push({x,y,related,hit:identify(top),ancestry:stack.slice(0,6).map(identify)});
        }
      const blockedBy=overlays.filter(o=>!o.element.contains(el) && !el.contains(o.element) && intersects(region,o.rect)).map(o=>o.identity);
      return {points,blockedBy,pass:points.every(p=>p.related) && blockedBy.length===0};
    };
    const entries=[];
    const add=(id,el,kind='complete')=>{ if(el) entries.push({id,el,kind}); };
    add('selector-heading',selector.querySelector('fieldset > legend'));
    for(const group of selector.querySelectorAll('[data-role-level]')) {
      add(`legend-${group.getAttribute('data-role-level')}`,group.querySelector('legend'));
      for(const label of group.querySelectorAll('label')) {
        const input=label.querySelector('input'), key=input.getAttribute('data-behaviour-suggestion');
        add(`label-${key}`,label); add(`checkbox-${key}`,input);
      }
    }
    for(const label of selector.querySelectorAll('[data-legacy-choices] label')) {
      const input=label.querySelector('input'), key=input.getAttribute('data-behaviour-suggestion');
      add(`label-${key}`,label); add(`checkbox-${key}`,input);
    }
    add('generic-legend',selector.querySelector('[data-legacy-choices] > legend'));
    add('copied-wording',selector.querySelector('[data-copied-content]'),'continuous');
    for(const el of selector.querySelectorAll('[data-selected-guidance]')) add(`guidance-${el.getAttribute('data-selected-guidance')}`,el,'continuous');
    add('additional-wording',article.querySelector('[data-behaviour-custom="BHV-01"]').closest('label'));
    add('additional-wording-control',article.querySelector('[data-behaviour-custom="BHV-01"]'));
    add('target-rating',article.querySelector('[data-behaviour-rating="BHV-01"]').closest('label'));
    add('target-rating-control',article.querySelector('[data-behaviour-rating="BHV-01"]'));
    add('editor-open-close',article.querySelector('header button'));
    const targets=entries.map(({id,el,kind})=>{
      const r=rect(el), full=r.left>=0 && r.right<=innerWidth && r.top>=safeTop && r.bottom<=safeBottom;
      const clipped={left:r.left,right:r.right,top:Math.max(r.top,safeTop),bottom:Math.min(r.bottom,safeBottom),width:r.width};
      clipped.height=clipped.bottom-clipped.top;
      const visible=clipped.height>0 && clipped.left>=0 && clipped.right<=innerWidth;
      const hit=(full || (kind==='continuous' && visible)) ? hitRect(el,full?r:clipped) : null;
      // Actual text line rectangles, not one centre point of a potentially multiline label.
      const textRects=[]; const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
      while(walker.nextNode()) if(walker.currentNode.textContent.trim()) {
        const range=document.createRange(); range.selectNodeContents(walker.currentNode);
        for(const line of range.getClientRects()) if(line.width && line.height) {
          const region={left:line.left,right:line.right,top:line.top,bottom:line.bottom,width:line.width,height:line.height};
          if(full) textRects.push({rect:region,hit:hitRect(el,region)});
        }
      }
      return {id,kind,text:(el.textContent || '').trim(),rect:r,contentTop:r.top-sr.top,contentBottom:r.bottom-sr.top,full,visible,
        visibleContent:visible?[clipped.top-sr.top,clipped.bottom-sr.top]:null,hit,textRects,
        credited:!!hit?.pass && textRects.every(line=>line.hit.pass)};
    });
    const visibleSelector={left:sr.left,right:sr.right,top:Math.max(sr.top,safeTop),bottom:Math.min(sr.bottom,safeBottom),width:sr.width};
    visibleSelector.height=visibleSelector.bottom-visibleSelector.top;
    const selectorHit=visibleSelector.height>0?hitRect(selector,visibleSelector):null;
    const labels=[...selector.querySelectorAll('label')].map(rect);
    return {viewport:{width:innerWidth,height:innerHeight,devicePixelRatio,visualScale:visualViewport?.scale},scroll:{x:scrollX,y:scrollY,element:document.scrollingElement.tagName},
      documentWidth:document.documentElement.scrollWidth,documentHeight:document.scrollingElement.scrollHeight,
      host:{rect:rect(host),clientWidth:host.clientWidth,scrollWidth:host.scrollWidth},candidate:{rect:rect(candidate),clientWidth:candidate.clientWidth,scrollWidth:candidate.scrollWidth},
      selector:{rect:sr,clientWidth:selector.clientWidth,scrollWidth:selector.scrollWidth,documentTop:sr.top+scrollY},
      header:{count:headerMatches.length,identity:identify(header),rect:headerRect,position:getComputedStyle(header).position,top:getComputedStyle(header).top,zIndex:getComputedStyle(header).zIndex},
      overlays:overlays.map(({element,...o})=>o),nestedScroll,clearance,safeTop,safeBottom,targets,
      visibleSelectorInterval:selectorHit?.pass?[visibleSelector.top-sr.top,visibleSelector.bottom-sr.top]:null,selectorHit,
      labelsOverlap:labels.some((label,i)=>i>0 && label.top<labels[i-1].bottom-1),labelsClipped:labels.some(label=>label.left<sr.left-1 || label.right>sr.right+1)};
  });
  const union = intervals => {
    const sorted=intervals.filter(Boolean).sort((a,b)=>a[0]-b[0]), merged=[];
    for(const pair of sorted) { const last=merged.at(-1); if(last && pair[0]<=last[1]+0.5) last[1]=Math.max(last[1],pair[1]); else merged.push([...pair]); }
    return merged;
  };
  report.captureDevices=[];
  for(const [width,height] of [[1366,768],[768,1024],[390,844]]) {
    await page.setViewportSize({width,height});
    const device={width,height,frames:[],coverage:null,status:'RUNNING'}; report.captureDevices.push(device);
    const base=await inspect();
    check(`${width} unique sticky header`,[base.header.count,base.header.position,base.header.top,base.header.zIndex],[1,'sticky','0px','20']);
    check(`${width} document owns scroll`,base.nestedScroll.length,0);
    check(`${width} normal device scale`,[base.viewport.devicePixelRatio,base.viewport.visualScale],[1,1]);
    const frame = async (documentTop,reason) => {
      const before=await inspect();
      const rawTarget = documentTop - before.safeTop - 1;
      const requestedScrollY = Math.max(0, Math.floor(rawTarget));
      await page.evaluate(y=>window.scrollTo({top:y,left:0,behavior:'instant'}),requestedScrollY);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const g=await inspect();
      g.positioning = { documentTop, rawTarget, floor: Math.floor(rawTarget), reserve: 1, requestedScrollY,
        actualScrollY: g.scroll.y, beforeHeader: before.header.rect, afterHeader: g.header.rect,
        beforeSafeTop: before.safeTop, afterSafeTop: g.safeTop, afterSafeBottom: g.safeBottom,
        predictedTargetTop: documentTop-requestedScrollY, achievedTargetTop: documentTop-g.scroll.y,
        achievedClearance: documentTop-g.scroll.y-g.header.rect.bottom,
        maximumScrollY: Math.max(0,g.documentHeight-g.viewport.height),
        browserBottomClamp: requestedScrollY>Math.max(0,g.documentHeight-g.viewport.height),
        requestedApplied: requestedScrollY===g.scroll.y,
        geometryChanged: before.selector.documentTop!==g.selector.documentTop || JSON.stringify(before.header.rect)!==JSON.stringify(g.header.rect),
        acceptance: 'Existing measured full-region, text, hit, occlusion and continuous coverage checks only; no clamp or positioning auto-pass.' };
      const filename=`capture-${width}-${String(device.frames.length+1).padStart(2,'0')}.png`;
      await page.screenshot({path:path.join(evidence,filename),fullPage:false});
      device.frames.push({filename,reason,geometry:g});
      write(filename.replace('.png','.json'),g);
      check(`${filename} horizontal containment`,g.documentWidth<=width && g.host.scrollWidth<=g.host.clientWidth+1 && g.candidate.scrollWidth<=g.candidate.clientWidth+1
        && g.selector.rect.left>=0 && g.selector.rect.right<=width && g.selector.scrollWidth<=g.selector.clientWidth+1 && !g.labelsOverlap && !g.labelsClipped,true);
      check(`${filename} credited hits unoccluded`,g.targets.filter(t=>t.full || (t.kind==='continuous' && t.visible)).every(t=>t.credited),true);
      if(g.visibleSelectorInterval) check(`${filename} selector visible interval hit`,g.selectorHit.pass,true);
      return g;
    };
    const step=height-base.header.rect.height-20-100;
    assert(step>0);
    for(let offset=0;offset<base.selector.rect.height;offset+=step) await frame(base.selector.documentTop+offset,'ordered continuous selector coverage');
    // Ordinary extra positions give every full label/control at least one wholly readable frame.
    for(const target of base.targets.filter(t=>t.kind==='complete')) {
      if(!device.frames.some(f=>f.geometry.targets.some(t=>t.id===target.id && t.full && t.credited))) {
        await frame(base.selector.documentTop+target.contentTop,`complete named region ${target.id}`);
        check(`${width} ${target.id} reachable`,device.frames.some(f=>f.geometry.targets.some(t=>t.id===target.id && t.full && t.credited)),true);
      }
    }
    const intervals=union(device.frames.map(f=>f.geometry.visibleSelectorInterval));
    check(`${width} complete continuous selector coverage`,intervals.length===1 && intervals[0][0]<=0.5 && intervals[0][1]>=base.selector.rect.height-0.5,true);
    const named=base.targets.map(target=>({id:target.id,kind:target.kind,content:[target.contentTop,target.contentBottom],
      frames:device.frames.filter(f=>f.geometry.targets.some(t=>t.id===target.id && t.credited && (target.kind==='continuous'||t.full))).map(f=>f.filename),
      intervals:union(device.frames.flatMap(f=>f.geometry.targets.filter(t=>t.id===target.id && t.credited).map(t=>t.visibleContent)))}));
    for(const target of named) check(`${width} named coverage ${target.id}`,target.frames.length>0 && (target.kind!=='continuous'
      || (target.intervals.length===1 && target.intervals[0][0]<=target.content[0]+0.5 && target.intervals[0][1]>=target.content[1]-0.5)),true);
    device.coverage={selectorHeight:base.selector.rect.height,intervals,named}; device.status='GEOMETRY_PASS_MANUAL_INSPECTION_PENDING';
    write(`COVERAGE-${width}.json`,device);
    report.viewports.push({surface:'integrated',width,height,status:'GEOMETRY_PASS_MANUAL_PENDING',screenshots:device.frames.map(f=>f.filename)});
  }
  write('12_COVERAGE_INDEX.json',{devices:report.captureDevices.map(d=>({width:d.width,height:d.height,status:d.status,coverage:d.coverage,frames:d.frames.map(f=>({filename:f.filename,reason:f.reason,interval:f.geometry.visibleSelectorInterval}))})),manualVisual:'PENDING'});
};
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4351');
  if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local synthetic Behaviour Library</title><body style="margin:0"><div id="root"></div><script src="/harness.js"></script></body></html>'); return; }
  const file = path.resolve(temp, '.' + decodeURIComponent(url.pathname));
  if (!file.startsWith(temp + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : file.endsWith('.png') ? 'image/png' : 'application/octet-stream');
  response.end(fs.readFileSync(file));
});
try {
  // Binding is the vacancy check: EADDRINUSE stops without connecting to or disturbing another listener.
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(4351, '127.0.0.1', resolve); });
  write('10_RUNTIME_LEASE_START.json', { time: new Date().toISOString(), pid: process.pid, port: 4351, host: '127.0.0.1', status: 'EXCLUSIVE_BOUND', profile });
  fs.appendFileSync('C:/KCF/KPI/_CONTROL/01_ACTIVE_ACTIONS/KCF-KPI-BHVLIB-001_LOCAL_BEHAVIOUR_LIBRARY.md', `\nBUILD-M009 local runtime lease ACTIVE ${new Date().toISOString()}: exclusive 127.0.0.1:4351 binding, PID ${process.pid}; fresh headless profile only. No 4341 probe.\n`);
  const entry = path.join(temp, 'entry.js');
  fs.writeFileSync(entry, `import * as harness from ${JSON.stringify(path.join(root, 'lib/webparts/performanceHub/testing/BehaviourLibraryLocalHarness.js').replaceAll('\\', '/'))};\nwindow.localHarness=harness;\nharness.mountLocalHarness(document.getElementById('root'),'integrated','2026-11-01',${JSON.stringify(args.phase === 'capture' ? JSON.stringify(captureSnapshot) : undefined)});\n`);
  const compiler = webpack({ mode: 'development', context: root, entry, devtool: false, cache: false,
    output: { path: temp, filename: 'harness.js', publicPath: '/' },
    resolve: { extensions: ['.js', '.json'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    plugins: [new webpack.NormalModuleReplacementPlugin(/\.module\.scss$/, resource => { resource.request += '.css'; })],
    module: { rules: [{ test: /\.scss\.css$/, use: [{ loader: require.resolve('@microsoft/sp-css-loader'), options: {
      production: false, generateCssClassName: (name, file, content) => `${name}_${createHash('sha256').update(path.basename(file) + content).digest('hex').slice(0, 8)}`
    } }] },
      { test: /\.(png|jpg|svg|woff2?|ttf|eot)$/, type: 'asset/resource' }] }
  });
  const stats = await new Promise((resolve, reject) => compiler.run((error, value) => error ? reject(error) : resolve(value)));
  await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
  const statsData = stats.toJson({ all: false, errors: true, warnings: true, modules: true });
  write('11_HARNESS_WEBPACK.json', statsData);
  assert(!stats.hasErrors(), JSON.stringify(statsData.errors));
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  report.installedBrowserVersion = execFileSync('powershell.exe', ['-NoProfile', '-Command', "(Get-Item -LiteralPath 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe').VersionInfo.ProductVersion"], { windowsHide: true, encoding: 'utf8' }).trim();
  context = await chromium.launchPersistentContext(profile, { headless: true, executablePath: chrome, chromiumSandbox: true, acceptDownloads: false,
    viewport: { width: 1366, height: 768 }, serviceWorkers: 'block',
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--no-first-run', '--no-default-browser-check',
      '--disable-domain-reliability', '--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
  report.browser = context.browser()?.version() || report.installedBrowserVersion;
  await context.route('**/*', async route => {
    const url = route.request().url(); report.requests.push(url);
    if (/^https?:/.test(url) && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) { report.blockedRequests.push(url); await route.abort('blockedbyclient'); }
    else await route.continue();
  });
  page = context.pages()[0] || await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('requestfailed', request => report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto('http://127.0.0.1:4351/', { waitUntil: 'networkidle' });

  const mount = async (surface, snapshot) => { await page.evaluate(({ surface, snapshot }) => window.localHarness.mountLocalHarness(document.getElementById('root'), surface, '2026-11-01', snapshot), { surface, snapshot }); };
  const openIntegrated = async () => {
    await page.getByRole('navigation', { name: 'Employee Workplan journey' }).getByRole('button', { name: 'Build My Workplan', exact: true }).click();
    await page.getByRole('button', { name: 'Behaviours', exact: true }).click();
    await page.getByRole('button', { name: 'Choose & configure', exact: true }).first().click();
  };
  const verifyBehaviour = async key => {
    const selector = page.locator(`[data-behaviour-library="${key}"]`);
    check(`${key} groups`, await selector.locator('[data-role-level] > legend').allTextContents(), ['L1 Colleague', 'L2 People manager', 'L3 Senior leader']);
    check(`${key} role labels`, await selector.locator('[data-role-level] label span').allTextContents(), payload.filter(row => row.BehaviourKey === key).map(row => row.DropdownLabel));
    for (const role of ['L1', 'L2', 'L3']) check(`${key}/${role} count`, await selector.locator(`[data-role-level="${role}"] input`).count(), 5);
    for (const row of payload.filter(record => record.BehaviourKey === key)) {
      const input = selector.locator(`[data-behaviour-suggestion="${row.BehaviourObjectiveKey}"]`);
      await input.check();
      check(`${row.BehaviourObjectiveKey} selected guidance`, await selector.locator(`[data-selected-guidance="${row.BehaviourObjectiveKey}"] dd`).allTextContents(), [row.ObjectiveDescription, row.SuggestedMeasure, row.SuggestedUnit, row.SuggestedEvidence]);
      await input.uncheck();
    }
  };
  report.reusedEvidence = { annualM002: { path: 'C:/KCF/KPI/_CONTROL/02_QA/KCF-KPI-BHVLIB-001/BUILD/14_LOCAL_RENDERED_REPORT.json', checks: 104 },
    annualM004: { path: 'C:/KCF/KPI/_CONTROL/02_QA/KCF-KPI-BHVLIB-001/BUILD_CONTINUATION_M003/14_LOCAL_RENDERED_REPORT.json', checks: 22 },
    basis: 'Annual component/CSS and fixture values preserved; fresh run covers integrated surface only.' };
  const ready = async label => {
    await page.getByRole('heading', { name: 'Synthetic Employee', exact: true }).waitFor();
    check(`${label} loading finished`, await page.locator('[aria-busy="true"]').count(), 0);
    const body = await page.locator('body').innerText();
    check(`${label} no load fallback/warning`, /Some live information is not available|reference-data refresh failed|No Workplan has been started/.test(body), false);
    const diagnostic = await page.evaluate(() => window.localHarness.getIntegratedDiagnostics());
    check(`${label} ready employee manager config`, diagnostic.readiness.ready, true);
    const read = diagnostic.calls.find(call => call.method === 'getEmployeeWorkplanV2');
    check(`${label} actual host requested canonical employee/year`, read?.args, ['synthetic', 2026]);
    check(`${label} canonical local Draft identity`, [read.result.workplan.workplanKey, read.result.workplan.state, read.result.workplan.workplanVersion], ['BHVLIB-001|synthetic|2026', 'Draft', 1]);
    check(`${label} loaded five items`, read.result.behaviourItems.length, 5);
    const library = diagnostic.calls.find(call => call.method === 'getBehaviourObjectiveLibrary').result;
    check(`${label} service returned 75 role records`, library.filter(row => row.roleLevelCode).length, 75);
    check(`${label} overview Draft rendered`, await page.getByText('Draft', { exact: true }).count(), 1);
    write(`${label}_READINESS.json`, { diagnostic, renderedText: body, status: 'PASS' });
  };
  const capture = async surface => {
    for (const [width, height] of [[1366, 768], [768, 1024], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-behaviour-library="BHV-01"]').scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const root = document.getElementById('root');
        const selectors = [...document.querySelectorAll('[data-behaviour-library]')];
        return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
          host: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth }, selectors: selectors.map(el => {
            const rect = el.getBoundingClientRect(); const labels = [...el.querySelectorAll('label')].map(label => { const r = label.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width }; });
            return { key: el.getAttribute('data-behaviour-library'), left: rect.left, right: rect.right, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth, labels,
              overlappingLabels: labels.some((label, i) => i > 0 && label.top < labels[i - 1].bottom - 1),
              clippedLabels: labels.some(label => label.left < rect.left - 1 || label.right > rect.right + 1) };
          }) };
      });
      check(`${surface} ${width} document overflow`, geometry.documentWidth <= width, true);
      check(`${surface} ${width} selector containment`, geometry.selectors.every(el => el.left >= -1 && el.right <= width + 1 && el.scrollWidth <= el.clientWidth + 1 && !el.overlappingLabels && !el.clippedLabels), true);
      const screenshot = `${surface}-${width}x${height}.png`;
      await page.screenshot({ path: path.join(evidence, screenshot), fullPage: false });
      await page.locator('[data-behaviour-library="BHV-01"]').screenshot({ path: path.join(evidence, `${surface}-${width}-selector.png`) });
      report.viewports.push({ surface, width, height, screenshot, geometry, status: 'PASS' });
    }
  };
  if (args.phase === 'capture') {
    await ready('CAPTURE'); await openIntegrated();
    check('capture exact selected keys', await page.locator('[data-role-level] input:checked').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-behaviour-suggestion')).sort()), ['BHV-01-L1-01', 'BHV-01-L3-02']);
    check('capture custom text', await page.locator('[data-behaviour-custom="BHV-01"]').inputValue(), 'Integrated hybrid commitment');
    check('capture target three', await page.locator('[data-behaviour-rating="BHV-01"]').inputValue(), '3');
    await captureCoverage();
  } else {
  await ready('INITIAL');
  await openIntegrated();
  check('integrated existing five commitments restored', await page.getByText('5 of 5 configured', { exact: true }).count(), 1);
  for (let i = 1; i <= 5; i++) {
    if (i > 1) { await page.getByRole('button', { name: 'Save changes for this session', exact: true }).click(); await page.getByRole('button', { name: 'Choose & configure', exact: true }).nth(i - 1).click(); }
    await verifyBehaviour(`BHV-0${i}`);
  }
  await page.getByRole('button', { name: 'Save changes for this session', exact: true }).click();
  await page.getByRole('button', { name: 'Choose & configure', exact: true }).first().focus();
  await page.keyboard.press('Enter');
  check('Enter opens integrated editor', await page.locator('[data-behaviour-library="BHV-01"]').count(), 1);
  await page.getByRole('button', { name: 'Save changes for this session', exact: true }).focus();
  await page.keyboard.press('Enter');
  check('collapse restores focus on same header button', await page.evaluate(() => document.activeElement?.textContent), 'Choose & configure');
  await page.keyboard.press('Enter');
  // Enter opens the native editor; real Tab/Space/Shift+Tab demonstrate focus movement and no trap.
  let reached = false;
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate(() => document.activeElement?.getAttribute('data-behaviour-suggestion') === 'BHV-01-L1-01')) { reached = true; break; }
  }
  check('integrated Tab reaches first role checkbox', reached, true);
  await page.keyboard.press('Space');
  check('integrated Space toggles first role checkbox', await page.locator('[data-behaviour-suggestion="BHV-01-L1-01"]').isChecked(), true);
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
  check('integrated ShiftTab returns to first checkbox', await page.evaluate(() => document.activeElement?.getAttribute('data-behaviour-suggestion')), 'BHV-01-L1-01');
  check('integrated native focus visible', await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
  await page.locator('[data-behaviour-suggestion="BHV-01-L3-02"]').check();
  await page.locator('[data-behaviour-suggestion="BHV-01-L1-01"]').uncheck();
  const fallback = payload.find(row => row.BehaviourObjectiveKey === 'BHV-01-L3-02');
  check('integrated deselection fallback detail', (await page.locator('[data-copied-content]').innerText()).includes(fallback.ObjectiveDescription), true);
  await page.locator('[data-behaviour-suggestion="BHV-01-L1-01"]').check();
  await page.locator('[data-behaviour-custom="BHV-01"]').fill('Integrated hybrid commitment');
  check('seniority preserves target three', await page.locator('[data-behaviour-rating="BHV-01"]').inputValue(), '3');
  await page.getByRole('button', { name: 'Review & Weight', exact: true }).click();
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await page.getByText('Draft saved and confirmed.', { exact: true }).waitFor();
  let snapshot = await page.evaluate(() => window.localHarness.getLocalSnapshot());
  const integratedSaved = JSON.parse(snapshot);
  check('integrated adapter receives role keys', integratedSaved.items[0].selectedSuggestionKeys, ['BHV-01-L3-02', 'BHV-01-L1-01']);
  check('integrated saved primary fallback', integratedSaved.items[0].sourceObjectiveKey, 'BHV-01-L3-02');
  await mount('integrated', snapshot); await ready('REMOUNT'); await openIntegrated();
  check('integrated remount retains both selections', await page.locator('[data-role-level] input:checked').count(), 2);
  check('integrated remount custom wording', await page.locator('[data-behaviour-custom="BHV-01"]').inputValue(), 'Integrated hybrid commitment');
  await page.getByRole('button', { name: 'Review & Weight', exact: true }).click();
  await page.getByRole('button', { name: 'Save Draft', exact: true }).click();
  await page.getByText('Draft saved and confirmed.', { exact: true }).waitFor();
  const integratedRemounted = JSON.parse(await page.evaluate(() => window.localHarness.getLocalSnapshot()));
  check('integrated serialised reconstruction full persisted item equality', integratedRemounted.items, integratedSaved.items);
  write('13_INTEGRATED_REMOUNT.json', { diagnostics: await page.evaluate(() => window.localHarness.getIntegratedDiagnostics()), before: integratedSaved, after: integratedRemounted, status: 'PASS', SharePointPersistence: 'NOT_ASSESSED' });
  await page.getByRole('button', { name: 'Behaviours', exact: true }).click();
  await page.getByRole('button', { name: 'Choose & configure', exact: true }).first().click();
  await capture('integrated');
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.getByRole('button', { name: 'Core KPIs', exact: true }).click();
  const pillarButtons = page.locator('[data-pillar]');
  check('seven existing Pillar filters', await pillarButtons.count(), 7);
  await pillarButtons.first().click(); await pillarButtons.nth(1).click();
  check('multiple Pillar selections', await page.locator('[data-pillar][aria-pressed="true"]').count(), 2);
  const workstreams = page.locator('[data-workstream-key]');
  assert(await workstreams.count() > 1);
  await workstreams.first().check(); await workstreams.nth(1).check();
  check('multiple Workstream selections', await page.locator('[data-workstream-key]:checked').count(), 2);
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  check('Pillar clear', await page.locator('[data-pillar][aria-pressed="true"]').count(), 0);
  check('Workstream clear', await page.locator('[data-workstream-key]:checked').count(), 0);
  check('Core catalogue remains mounted', await page.getByRole('region', { name: 'Available Core KPI catalogue' }).count(), 1);
  }
  check('no nonloopback request attempted', report.blockedRequests.length, 0);
  check('no browser execution errors', report.errors.length, 0);
  await page.evaluate(() => window.localHarness.unmountLocalHarness(document.getElementById('root')));
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL'; report.failure = String(error.stack || error); process.exitCode = 1;
  if (page && !page.isClosed()) {
    write('FAILURE_DOM.json', { url: page.url(), html: await page.content(), accessibleSnapshot: await page.locator('body').ariaSnapshot() });
    await page.screenshot({ path: path.join(evidence, 'FAILURE_VIEWPORT.png'), fullPage: false });
  }
} finally {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  report.leaseReleased = true; report.finished = new Date().toISOString();
  write('14_LOCAL_RENDERED_REPORT.json', report);
  fs.appendFileSync('C:/KCF/KPI/_CONTROL/01_ACTIVE_ACTIONS/KCF-KPI-BHVLIB-001_LOCAL_BEHAVIOUR_LIBRARY.md', `\nBUILD-M009 local runtime/browser lease RELEASED ${report.finished}; result ${report.status}. Only owned processes closed. See BUILD_CONTINUATION_M009/14_LOCAL_RENDERED_REPORT.json.\n`);
  process.stdout.write(JSON.stringify({ status: report.status, checks: report.checks.length, viewports: report.viewports.length, failure: report.failure, leaseReleased: report.leaseReleased }) + '\n');
}
