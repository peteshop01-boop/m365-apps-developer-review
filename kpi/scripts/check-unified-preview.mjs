import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Developer/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const evidence = process.env.KCF_UNIFIED_PREVIEW_EVIDENCE || 'C:/KCF/KPI/_CONTROL/EVIDENCE/PM41-A008';
fs.mkdirSync(evidence, { recursive: true });
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const report = { url: process.env.KCF_UNIFIED_PREVIEW_URL || 'http://127.0.0.1:4462/', at: new Date().toISOString(), checks: [], requests: [], nonLoopback: [], errors: [], screenshots: [] };
const context = await chromium.launchPersistentContext(path.join(evidence, 'browser-profile'), {
  headless: true, executablePath: chrome, viewport: { width: 1366, height: 900 }, serviceWorkers: 'block', acceptDownloads: false,
  args: ['--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']
});
await context.route('**/*', async route => {
  const url = route.request().url(); report.requests.push(url);
  if (/^https?:/.test(url) && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    report.nonLoopback.push(url); await route.abort('blockedbyclient');
  } else await route.continue();
});
const page = context.pages()[0] || await context.newPage();
page.on('pageerror', error => report.errors.push(String(error)));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
const check = async (name, condition) => report.checks.push({ name, pass: Boolean(await condition()) });
try {
  await page.goto(report.url, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Synthetic Employee' }).first().waitFor({ timeout: 20000 });
  await check('Full integrated component mounted', async () => await page.locator('[data-candidate="KCF-KPI-026-R3-RENDERED-DEFECT-REPAIR"]').count() === 1);
  await check('16 requested sections visible', async () => await page.locator('#section-navigation button').count() === 16);
  await page.waitForFunction(() => [...document.querySelectorAll('#integrated-root button')].some(button => button.textContent.trim() === 'Start My Workplan' && button.disabled));
  await check('Start disabled on Home', async () => await page.getByRole('button', { name: 'Start My Workplan' }).first().isDisabled());
  await check('Start click and keyboard activation blocked', async () => await page.evaluate(() => {
    const button = [...document.querySelectorAll('#integrated-root button')].find(item => item.textContent.trim() === 'Start My Workplan');
    return button && !button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })) &&
      !button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  }));
  for (const label of ['Core KPIs', 'Impact KPIs', 'Behaviours', 'Review & Weight', 'Manager Draft / Review', 'Administration', 'KPI Master']) {
    await page.locator('#section-navigation button').filter({ hasText: label }).first().click();
    await check(`${label} integrated route`, async () => (await page.locator('#section-status').innerText()).includes('integrated local surface'));
    if (label === 'Core KPIs') {
      await check('Core is session only', async () => (await page.locator('#integrated-root').innerText()).includes('Session-only planning'));
      await check('Start disabled in builder', async () => await page.getByRole('button', { name: 'Start My Workplan' }).first().isDisabled());
      await page.locator('#integrated-root button').filter({ hasText: /^Add$/ }).first().click();
      await check('Start remains disabled after Core session edit', async () => await page.getByRole('button', { name: 'Start My Workplan' }).first().isDisabled());
      await check('Core edit remains session only', async () => (await page.locator('#integrated-root').innerText()).includes('Session changes'));
    }
    if (label === 'Review & Weight') await check('Native Save Draft disabled', async () => await page.locator('#integrated-root button').filter({ hasText: /^Save Draft$/ }).first().isDisabled());
    if (label === 'KPI Master') {
      await check('KPI Master catalogue label', async () => (await page.locator('#section-status').innerText()).includes('Read-only synthetic catalogue'));
      await check('KPI Master has 109 rows', async () => await page.locator('#integrated-root tbody tr').count() === 109);
    }
  }
  for (const label of ['Save Draft / reopen', 'Review / Submit', 'Manager History', 'Quarterly Performance', 'Reporting / KPI GOLD / Dashboard', 'Year-End / Rollover']) {
    await page.locator('#section-navigation button').filter({ hasText: label }).first().click();
    await check(`${label} honest unavailable`, async () => await page.locator('#unavailable h2').innerText() === 'NOT YET INTEGRATED' && (await page.locator('#unavailable-reason').innerText()).length > 30);
  }
  await page.locator('#back-home').click();
  await page.screenshot({ path: path.join(evidence, 'desktop.png'), fullPage: true }); report.screenshots.push('desktop.png');
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of ['Core KPIs', 'Review & Weight', 'KPI Master']) {
    await page.locator('#section-navigation button').filter({ hasText: label }).first().click();
    await check(`Phone ${label} integrated route`, async () => (await page.locator('#section-status').innerText()).includes('integrated local surface'));
  }
  await check('Phone Save Draft disabled', async () => {
    await page.locator('#section-navigation button').filter({ hasText: 'Review & Weight' }).first().click();
    return await page.locator('#integrated-root button').filter({ hasText: /^Save Draft$/ }).first().isDisabled();
  });
  await page.screenshot({ path: path.join(evidence, 'phone.png'), fullPage: true }); report.screenshots.push('phone.png');
  await check('Phone directory reachable without page horizontal overflow', async () => await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await check('No misleading save wording', async () => !/Partial save|command\(s\) were confirmed|Saved Draft loaded|Reload the canonical Workplan/.test(await page.locator('#integrated-root').innerText()));
  await check('No non-loopback requests', async () => report.nonLoopback.length === 0);
  await check('No page or console errors', async () => report.errors.length === 0);
} catch (error) { report.errors.push(String(error)); }
finally { await context.close(); report.status = report.checks.every(item => item.pass) && report.errors.length === 0 ? 'PASS' : 'FAIL';
  fs.writeFileSync(path.join(evidence, 'render-check.json'), JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify({ status: report.status, checks: report.checks, errors: report.errors, nonLoopback: report.nonLoopback }));
if (report.status !== 'PASS') process.exitCode = 1;
