import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) =>
  index % 2 ? pairs : [...pairs, [item.replace(/^--/, ''), all[index + 1]]], []));
assert.equal(args.host, '127.0.0.1');
assert.equal(args.port, '4394');
const evidence = path.resolve(args.evidence || '');
assert.equal(evidence.toLowerCase(), 'c:\\kcf\\kpi\\_control\\evidence\\pm24-a004\\bt04\\behaviour-v1-delta');
fs.mkdirSync(evidence, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kcf-bt04-render-'));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'kcf-bt04-profile-'));
const require = createRequire(path.join(root, 'package.json'));
const webpack = require('webpack');
const { chromium } = require('C:/Users/Developer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
assert(fs.existsSync(chrome), 'Authorised local Chrome executable is missing.');
assert(fs.existsSync(path.join(root, 'lib/webparts/performanceHub/testing/BehaviourFrameworkV2LocalHarness.js')), 'Compiled BT-04 harness is missing.');

const report = {
  action: 'KCF-KPI-PM24-A004',
  scope: 'BT-04 Sponsor-approved Behaviour v1 local rendered developer validation',
  startedAt: new Date().toISOString(),
  root,
  evidence,
  browser: undefined,
  checks: [],
  viewports: [],
  requests: [],
  blockedRequests: [],
  errors: [],
  status: 'RUNNING'
};
const check = (name, actual, expected) => {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  report.checks.push({ name, pass, actual, expected });
  assert(pass, `${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`);
};
const writeJson = (name, value) => fs.writeFileSync(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
let context;
let page;
const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${args.host}:${args.port}`);
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BT-04 local synthetic render</title></head><body style="margin:0"><div id="root"></div><script src="/harness.js"></script></body></html>');
    return;
  }
  const file = path.resolve(temp, `.${decodeURIComponent(url.pathname)}`);
  if (!file.startsWith(`${temp}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    response.writeHead(404); response.end(); return;
  }
  response.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'application/octet-stream');
  response.end(fs.readFileSync(file));
});

try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(Number(args.port), args.host, resolve); });
  const entry = path.join(temp, 'entry.js');
  const harnessPath = path.join(root, 'lib/webparts/performanceHub/testing/BehaviourFrameworkV2LocalHarness.js').replaceAll('\\', '/');
  fs.writeFileSync(entry, `import * as harness from ${JSON.stringify(harnessPath)};\nwindow.bt04=harness;\nharness.mountBehaviourFrameworkV2Harness(document.getElementById('root'),'Draft');\n`, 'utf8');
  const compiler = webpack({
    mode: 'production', context: root, entry, devtool: false, cache: false,
    output: { path: temp, filename: 'harness.js', publicPath: '/' },
    resolve: { extensions: ['.js', '.json'], modules: [path.join(root, 'node_modules'), 'node_modules'] },
    plugins: [new webpack.NormalModuleReplacementPlugin(/\.module\.scss$/, resource => { resource.request += '.css'; })],
    module: { rules: [{ test: /\.scss\.css$/, use: [{ loader: require.resolve('@microsoft/sp-css-loader'), options: {
      production: true,
      generateCssClassName: (name, file, content) => `${name}_${createHash('sha256').update(path.basename(file) + content).digest('hex').slice(0, 8)}`
    } }] }] }
  });
  const stats = await new Promise((resolve, reject) => compiler.run((error, value) => error ? reject(error) : resolve(value)));
  await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
  const statsData = stats.toJson({ all: false, errors: true, warnings: true, assets: true });
  writeJson('render-webpack.json', statsData);
  assert(!stats.hasErrors(), JSON.stringify(statsData.errors));

  context = await chromium.launchPersistentContext(profile, {
    headless: true, executablePath: chrome, chromiumSandbox: true, acceptDownloads: false,
    viewport: { width: 1366, height: 768 }, serviceWorkers: 'block',
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions',
      '--no-first-run', '--no-default-browser-check', '--disable-domain-reliability',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']
  });
  report.browser = context.browser()?.version();
  await context.route('**/*', async route => {
    const url = route.request().url(); report.requests.push(url);
    if (/^https?:/.test(url) && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
      report.blockedRequests.push(url); await route.abort('blockedbyclient');
    } else await route.continue();
  });
  page = context.pages()[0] || await context.newPage();
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  page.on('requestfailed', request => report.errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.goto(`http://${args.host}:${args.port}/`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Behaviour commitments', exact: true }).waitFor();

  check('five headline Behaviours', await page.locator('[data-headline-behaviour]').count(), 5);
  check('role-filtered Manager choices', await page.locator('[data-focus-choice]').count(), 25);
  check('no wrong-tier choice', await page.locator('[data-focus-choice]:not([data-focus-choice*="-L2-"])').count(), 0);
  check('exact first headline', await page.locator('[data-headline-behaviour="BHV-01"] h3').innerText(), 'WE TAKE RESPONSIBILITY');
  check('exact fifth headline', await page.locator('[data-headline-behaviour="BHV-05"] h3').innerText(), 'WE WORK & PLAY WITH ENERGY');
  check('approved example terminology', (await page.locator('body').innerText()).includes('examples/prompts, not mandatory targets'), true);
  check('four initial selections', await page.locator('[data-selected-target]').count(), 4);
  check('own target visibly distinct', await page.locator('[data-selected-target="BHV-04-OWN-SYNTH01"]').getAttribute('data-target-source'), 'Own');
  check('guidance not hard cap', await page.locator('[data-selection-guidance]').innerText(), '4 selected\nNormally about 3–5 overall. This is guidance, not a hard cap.');

  await page.locator('[data-focus-choice="BHV-05-L2-01"]').check();
  await page.locator('[data-commitment-input="BHV-05-L2-01"]').fill('I will set a constructive tone in every weekly team meeting.');
  await page.locator('[data-how-will-we-know-input="BHV-05-L2-01"]').fill('Meeting notes and team feedback show realistic actions and constructive language.');
  check('Draft toggle adds fifth exact key', await page.evaluate(() => window.bt04.getBehaviourFrameworkV2HarnessState().selections.map(row => row.selectionKey)),
    ['BHV-01-L2-01', 'BHV-02-L2-02', 'BHV-03-L2-03', 'BHV-04-OWN-SYNTH01', 'BHV-05-L2-01']);
  check('required MY COMMITMENT state transition', await page.evaluate(() => window.bt04.getBehaviourFrameworkV2HarnessState().selections.find(row => row.selectionKey === 'BHV-05-L2-01').commitment),
    'I will set a constructive tone in every weekly team meeting.');
  check('required HOW WILL WE KNOW state transition', await page.evaluate(() => window.bt04.getBehaviourFrameworkV2HarnessState().selections.find(row => row.selectionKey === 'BHV-05-L2-01').howWillWeKnow),
    'Meeting notes and team feedback show realistic actions and constructive language.');

  await page.getByRole('button', { name: 'Review', exact: true }).click();
  check('manager Review disables all choices', await page.locator('[data-focus-choice]:not(:disabled)').count(), 0);
  check('review exact approved-example readback', await page.locator('[data-selected-target="BHV-01-L2-01"] [data-readback="example"]').innerText(),
    'Selected example: Make ownership clear across my team and follow through on agreed actions.');
  check('review exact commitment readback', await page.locator('[data-selected-target="BHV-01-L2-01"] [data-readback="commitment"]').innerText(),
    'I will make ownership clear across my team and follow through weekly.');
  const reviewCard = page.locator('[data-selected-target="BHV-02-L2-02"]');
  await reviewCard.locator('[data-manager-review-comment]').fill('Make the progress evidence observable to colleagues.');
  await reviewCard.getByRole('button', { name: 'CHANGES REQUESTED', exact: true }).click();
  check('manager CHANGES REQUESTED audit transition', await page.evaluate(() => window.bt04.getBehaviourFrameworkV2HarnessState().reviews.at(-1).status), 'CHANGES REQUESTED');
  await page.getByRole('button', { name: 'History', exact: true }).click();
  check('history keeps own exact commitment', await page.locator('[data-selected-target="BHV-04-OWN-SYNTH01"] [data-readback="commitment"]').innerText(),
    'I will complete four agreed coaching observations by quarter end.');
  check('history keeps manager review status', await page.locator('[data-selected-target="BHV-02-L2-02"] [data-review-status="CHANGES REQUESTED"]').count(), 1);

  await page.getByRole('button', { name: 'QuarterlyEmployee', exact: true }).click();
  const employeeOptions = await page.locator('[data-headline-assessment="BHV-01"] [data-rating-field="employeeRating"] option').allTextContents();
  check('employee rating options exact D/E/E', employeeOptions, ['Not assessed', 'Developing', 'Effective', 'Exceptional']);
  await page.locator('[data-evidence-input="BHV-01-L2-01"]').fill('Synthetic updated quarterly evidence.');
  await page.locator('[data-headline-assessment="BHV-01"] [data-rating-field="employeeRating"]').selectOption('Exceptional');
  const employeeState = await page.evaluate(() => window.bt04.getBehaviourFrameworkV2HarnessState());
  check('employee evidence state transition', employeeState.evidence.find(row => row.selectionKey === 'BHV-01-L2-01').evidenceText,
    'Synthetic updated quarterly evidence.');
  check('employee named rating state transition', employeeState.assessments.find(row => row.behaviourKey === 'BHV-01').employeeRating, 'Exceptional');

  await page.getByRole('button', { name: 'QuarterlyManager', exact: true }).click();
  check('manager evidence read-only', await page.locator('[data-evidence-input="BHV-01-L2-01"]').getAttribute('readonly'), '');
  await page.locator('[data-headline-assessment="BHV-01"] [data-rating-field="managerRating"]').selectOption('Developing');
  await page.locator('[data-headline-assessment="BHV-01"] [data-rating-field="finalRating"]').selectOption('Effective');
  const managerState = await page.evaluate(() => window.bt04.getBehaviourFrameworkV2HarnessState());
  check('manager named rating state transition', managerState.assessments.find(row => row.behaviourKey === 'BHV-01').managerRating, 'Developing');
  check('final named rating state transition', managerState.assessments.find(row => row.behaviourKey === 'BHV-01').finalRating, 'Effective');

  for (const [width, height] of [[1366, 768], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const view of ['Draft', 'Review', 'History', 'QuarterlyEmployee', 'QuarterlyManager']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await page.locator('[data-headline-behaviour="BHV-01"]').scrollIntoViewIfNeeded();
      const geometry = await page.evaluate(() => {
        const rootElement = document.getElementById('root');
        const cards = [...document.querySelectorAll('[data-headline-behaviour], [data-selected-target]')].map(element => {
          const rect = element.getBoundingClientRect();
          return { key: element.getAttribute('data-headline-behaviour') || element.getAttribute('data-selected-target'),
            left: rect.left, right: rect.right, width: rect.width, scrollWidth: element.scrollWidth, clientWidth: element.clientWidth };
        });
        return { viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
          rootWidth: rootElement.clientWidth, rootScrollWidth: rootElement.scrollWidth, cards };
      });
      check(`${view} ${width}px document containment`, geometry.documentWidth <= width, true);
      check(`${view} ${width}px card containment`, geometry.cards.every(card => card.left >= -1 && card.right <= width + 1
        && card.scrollWidth <= card.clientWidth + 1), true);
      const screenshot = `${view.toLowerCase()}-${width}x${height}.png`;
      await page.screenshot({ path: path.join(evidence, screenshot), fullPage: true });
      report.viewports.push({ view, width, height, screenshot, geometry, status: 'PASS' });
    }
  }
  check('no non-loopback requests', report.blockedRequests.length, 0);
  check('no browser errors', report.errors.length, 0);
  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.failure = String(error.stack || error);
  process.exitCode = 1;
  if (page && !page.isClosed()) {
    writeJson('render-failure-dom.json', { url: page.url(), html: await page.content() });
    await page.screenshot({ path: path.join(evidence, 'render-failure.png'), fullPage: true });
  }
} finally {
  if (context) await context.close();
  await new Promise(resolve => server.close(resolve));
  report.finishedAt = new Date().toISOString();
  writeJson('render-report.json', report);
  const safeTempRoot = `${path.resolve(os.tmpdir())}${path.sep}`.toLowerCase();
  for (const folder of [temp, profile]) {
    assert(`${path.resolve(folder)}${path.sep}`.toLowerCase().startsWith(safeTempRoot), 'Temporary cleanup path escaped OS temp.');
    fs.rmSync(folder, { recursive: true, force: true });
  }
  process.stdout.write(JSON.stringify({ status: report.status, checks: report.checks.length,
    viewports: report.viewports.length, errors: report.errors.length, failure: report.failure }) + '\n');
}
