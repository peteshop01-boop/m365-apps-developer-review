import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Developer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const evidence = process.env.KCF_PACKAGE_HOST_EVIDENCE || 'C:/KCF/KPI/_CONTROL/EVIDENCE/PM50-A003';
fs.mkdirSync(evidence, { recursive: true });
const port = Number(process.env.KCF_PACKAGE_HOST_PORT || 4472);
const origin = `http://127.0.0.1:${port}`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex').toUpperCase();
const report = { status: 'FAIL', at: new Date().toISOString(), checks: [], errors: [], requests: [], nonLoopback: [], screenshots: [] };
const check = (name, pass, detail) => report.checks.push({ name, pass: Boolean(pass), ...(detail === undefined ? {} : { detail }) });
const server = spawn(process.execPath, [path.join(root, 'scripts/start-package-host-qa.mjs')], { cwd: root,
  env: { ...process.env, KCF_PACKAGE_HOST_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let startup = '', stderr = '';
server.stdout.on('data', chunk => { startup += chunk.toString(); });
server.stderr.on('data', chunk => { stderr += chunk.toString(); });
let context;
try {
  const deadline = Date.now() + 15000;
  while (!startup.includes('packageSha256') && Date.now() < deadline && server.exitCode === null) await new Promise(resolve => setTimeout(resolve, 100));
  if (!startup.includes('packageSha256')) throw new Error(`Host startup failed: ${stderr || startup}`);
  const config = await (await fetch(`${origin}/package-host/config.json`)).json();
  report.package = config;
  check('package SHA local readback', sha256(fs.readFileSync(path.join(root, 'sharepoint/solution/kcf-performance-hub.sppkg'))) === config.packageSha256);
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--no-first-run',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
  context = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(); report.requests.push({ url: request.url(), method: request.method() });
    if (!request.url().startsWith(`${origin}/`) || request.method() !== 'GET') {
      report.nonLoopback.push(request.url()); await route.abort('blockedbyclient'); return;
    }
    await route.continue();
  });
  for (const role of ['board', 'admin', 'employee', 'invalid', 'duplicate', 'inactive']) {
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(`${role}: ${error}`));
    page.on('response', response => { if (response.status() >= 400) report.errors.push(`${role}: ${response.status()} ${response.url()}`); });
    let browserAssetResponse;
    const browserImages = new Map();
    page.on('response', response => { if (response.url() === `${origin}${config.entry.url}`) browserAssetResponse = response; });
    page.on('response', response => { for (const image of config.images) if (response.url() === `${origin}${image.url}`) browserImages.set(image.url, response); });
    const response = await page.goto(`${origin}/package-host/?role=${role}&fixture=valid`, { waitUntil: 'networkidle' });
    if (response?.status() !== 200) throw new Error(`${role} page status ${response?.status()}`);
    await page.waitForFunction(() => Boolean(window.__KCF_PACKAGE_HOST_RESULT__) || Boolean(document.getElementById('host-error').textContent), { timeout: 20000 });
    const runtime = await page.evaluate(() => window.__KCF_PACKAGE_HOST_RESULT__);
    check(`${role} packaged AMD render`, runtime?.rendered && runtime.moduleId === config.moduleId, runtime);
    const labSurface = await page.evaluate(() => ({ input: Object.keys(window.__KCF_PACKAGE_HOST_LAB__).sort(),
      service: Object.keys(window.__KCF_PACKAGE_HOST_LAB__.dataService).sort() }));
    check(`${role} lab input has no capability or navigation override`,
      JSON.stringify(labSurface.input) === JSON.stringify(['adminReportingDataService', 'dataService', 'reportingDataset', 'syntheticReadOnly'])
      && !labSurface.service.some(key => /capabilit|area|nav|component|createElement/i.test(key)), labSurface);
    if (!browserAssetResponse) throw new Error(`${role} browser did not request package entry`);
    const responseHash = sha256(await browserAssetResponse.body());
    check(`${role} browser-requested ZIP JS bytes`, responseHash === config.entry.sha256, responseHash);
    for (const image of config.images) {
      const response = browserImages.get(image.url);
      check(`${role} packaged image ${image.url}`, response && sha256(await response.body()) === image.sha256);
    }
    const resourceTiming = await page.evaluate(url => performance.getEntriesByType('resource').some(entry => entry.name === url), runtime.entryUrl);
    check(`${role} browser resource timing`, resourceTiming, runtime.entryUrl);
    const writeDenied = await page.evaluate(async () => {
      try { await window.__KCF_PACKAGE_HOST_LAB__.dataService.saveEmployeeWorkplanDraftV2(); return false; }
      catch { return true; }
    });
    check(`${role} lab service write denied`, writeDenied);
    const nav = page.locator('aside[aria-label="Performance Hub navigation"]');
    const reporting = await nav.getByText('Reporting', { exact: true }).count();
    check(`${role} Reporting guard`, role === 'board' || role === 'admin' ? reporting > 0 : reporting === 0, reporting);
    if (!['board', 'admin'].includes(role)) {
      await page.evaluate(() => { history.pushState({}, '', '?role=board#/reporting'); });
      check(`${role} Reporting remains denied after URL mutation`, await nav.getByText('Reporting', { exact: true }).count() === 0);
    }
    if (role === 'board') {
      await page.getByRole('button', { name: 'Performance reporting views' }).click();
      check('valid B04 synthetic label', (await page.locator('main').innerText()).includes('SYNTHETIC LOCAL DEMONSTRATION'));
      await page.screenshot({ path: path.join(evidence, 'board-desktop.png'), fullPage: true }); report.screenshots.push('board-desktop.png');
      await page.setViewportSize({ width: 390, height: 844 });
      const menu = page.getByRole('button', { name: 'Open navigation' });
      await menu.click();
      check('phone menu opens', await menu.getAttribute('aria-expanded') === 'true');
      await page.keyboard.press('Escape');
      check('phone Escape closes and returns focus', await menu.getAttribute('aria-expanded') === 'false' && await menu.evaluate(element => document.activeElement === element));
      await menu.click();
      await page.getByRole('button', { name: 'Reporting Readiness' }).click();
      check('phone navigation closes with focus target', await menu.getAttribute('aria-expanded') === 'false' && await menu.evaluate(element => document.activeElement === element));
      check('phone no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(evidence, 'board-phone.png'), fullPage: true }); report.screenshots.push('board-phone.png');
      await page.setViewportSize({ width: 768, height: 1024 });
      check('tablet no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    if (role === 'admin' || role === 'employee') {
      await page.screenshot({ path: path.join(evidence, `${role}-desktop.png`), fullPage: true }); report.screenshots.push(`${role}-desktop.png`);
      await page.setViewportSize({ width: 390, height: 844 });
      check(`${role} phone no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(evidence, `${role}-phone.png`), fullPage: true }); report.screenshots.push(`${role}-phone.png`);
    }
    await page.close();
  }
  const malformed = await context.newPage();
  await malformed.goto(`${origin}/package-host/?role=board&fixture=malformed`, { waitUntil: 'networkidle' });
  await malformed.waitForFunction(() => Boolean(window.__KCF_PACKAGE_HOST_RESULT__));
  await malformed.getByRole('button', { name: 'Performance reporting views' }).click();
  const malformedText = await malformed.locator('main').innerText();
  check('malformed B04 unavailable only', malformedText.includes('Reporting data is not connected') && !malformedText.includes('SYNTHETIC LOCAL DEMONSTRATION'));
  await malformed.close();
  const blockedWrite = await fetch(`${origin}/package-host/`, { method: 'POST' });
  check('HTTP write denied', blockedWrite.status === 405, blockedWrite.status);
  const wrongPath = await fetch(`${origin}/package-host/extra`);
  check('non-host path denied', wrongPath.status === 404, wrongPath.status);
  const blockedHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${origin}/package-host/`, { headers: { Host: 'example.invalid' } }, response => {
      response.resume(); response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject); request.end();
  });
  check('wrong Host denied', blockedHostStatus === 403, blockedHostStatus);
  check('no non-loopback browser requests', report.nonLoopback.length === 0, report.nonLoopback);
  await browser.close(); context = undefined;
} catch (error) { report.errors.push(String(error.stack || error)); }
finally {
  if (context) await context.browser().close().catch(() => undefined);
  server.kill('SIGTERM');
  await new Promise(resolve => { if (server.exitCode !== null) resolve(); else { server.once('exit', resolve); setTimeout(resolve, 5000); } });
  report.status = report.errors.length === 0 && report.checks.every(item => item.pass) ? 'PASS' : 'FAIL';
  fs.writeFileSync(path.join(evidence, 'package-host-smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, failed: report.checks.filter(item => !item.pass), errors: report.errors }));
  if (report.status !== 'PASS') process.exitCode = 1;
}
