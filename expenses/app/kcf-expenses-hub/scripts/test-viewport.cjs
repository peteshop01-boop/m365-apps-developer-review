'use strict';
// Developer browser evidence against compiled native React modules, never TEST/UAT.
// Use an existing Playwright installation and browser; no dependency/lockfile changes.
const { chromium } = require(process.env.KCF_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../../../docs/evidence/D03_S03_B_VIEWPORT', process.env.KCF_VIEWPORT_PHASE || 'after');
fs.mkdirSync(output, { recursive: true });
const routes = ['Home / My Claims', 'Expenses', 'Mileage', 'Review Claim', 'My Team', 'Manager Review', 'Finance', 'Nominal Directory', 'Help', 'Profile', 'Admin'];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.KCF_BROWSER, headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  const keyboard = [];
  try {
    for (const [width, height, offset] of [[1366, 768, 96], [1920, 1080, 96], [390, 844, 72], [1366, 768, 180], [1366, 768, 700], [1366, 768, 768], [1366, 768, 900], [1920, 1080, 1100]]) {
      await page.setViewportSize({ width, height });
      await page.goto('http://127.0.0.1:4322');
      await page.locator('[data-route="expenses"] form').waitFor();
      await page.locator('#preview-context').evaluate((el, value) => { el.style.height = `${value}px`; }, offset);
      for (const route of routes) {
        if (width <= 700) await page.getByRole('button', { name: 'More', exact: true }).click();
        await page.getByRole('navigation', { name: 'Expenses Hub navigation' }).getByRole('button', { name: route, exact: !['My Team', 'Manager Review', 'Finance', 'Admin'].includes(route) }).click();
        await page.waitForTimeout(80);
        const measurement = await page.evaluate(() => {
          const view = document.querySelector('[data-route]:not([hidden])');
          const shell = document.querySelector('#app > div');
          const rect = shell.getBoundingClientRect();
          const scrolls = [...view.querySelectorAll('*'), view].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 1).map(el => ({ tag: el.tagName, className: el.className, height: el.clientHeight, scrollHeight: el.scrollHeight }));
          return { route: view.dataset.route, heading: document.querySelector('h1').textContent, focusOnHeading: document.activeElement === document.querySelector('h1'), pageWidth: document.documentElement.scrollWidth, pageHeight: document.documentElement.scrollHeight, shellHeight: rect.height, shellTop: rect.top, shellBottom: rect.bottom, scrolls };
        });
        results.push({ width, height, offset, ...measurement });
        assert.equal(measurement.focusOnHeading, true);
        assert.ok(measurement.pageWidth <= width + 1, `Horizontal overflow: ${route}`);
        if (process.env.KCF_VIEWPORT_PHASE !== 'before' && width > 700) {
          assert.ok(measurement.shellHeight >= 560, `Collapsed shell: ${route}/${offset}`);
          if (height - offset - 8 >= 560) {
            assert.ok(measurement.pageHeight <= height + 1, `Page overflow: ${route} at ${width}/${offset}`);
            assert.ok(measurement.shellBottom <= height + 1);
          }
          if (route === 'Expenses' || route === 'Mileage') {
            const save = page.locator('[data-route]:not([hidden])').getByRole('button', { name: route === 'Expenses' ? 'Save demo expense' : 'Save demo journey', exact: true });
            if (height - offset - 8 < 560) await save.focus();
            const box = await save.boundingBox();
            assert.ok(box && box.y >= 0 && box.y + box.height <= height, `Save footer clipped: ${route}`);
          }
        }
        if (['Expenses', 'Mileage', 'Finance', 'Review Claim', 'Profile'].includes(route)) await page.screenshot({ path: path.join(output, `${width}-${height}-${offset}-${measurement.route}.png`), fullPage: true });
      }
    }
    if (process.env.KCF_VIEWPORT_PHASE !== 'before') {
      for (const [width, height] of [[1366, 768], [390, 844]]) {
        await page.setViewportSize({ width, height });
        await page.goto('http://127.0.0.1:4322');
        await page.locator('[data-route="expenses"] form').waitFor();
        for (const route of ['Expenses', 'Mileage']) {
          if (width <= 700) await page.getByRole('button', { name: 'More', exact: true }).click();
          await page.getByRole('navigation', { name: 'Expenses Hub navigation' }).getByRole('button', { name: route, exact: true }).click();
          let count = 0;
          for (let i = 0; i < 80; i++) {
            await page.keyboard.press('Tab');
            const focus = await page.evaluate(() => {
              const el = document.activeElement;
              if (!el.closest('[data-route]:not([hidden])')) return null;
              const r = el.getBoundingClientRect();
              const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
              const field = el.matches('input, select, textarea, button');
              return { label: el.getAttribute('aria-label') || el.textContent?.slice(0, 50) || el.id, field, rect: { top: r.top, bottom: r.bottom, height: r.height }, hit: hit?.tagName + '.' + hit?.className, visible: field ? r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && !!hit && (hit === el || el.contains(hit)) : r.bottom > 0 && r.top < innerHeight };
            });
            if (!focus) break;
            keyboard.push({ width, route, ...focus });
            if (!focus.visible) await page.screenshot({ path: path.join(output, 'keyboard-obscured.png') });
            assert.ok(focus.visible, `Keyboard focus obscured: ${width} ${route} ${focus.label}`);
            count++;
          }
          assert.ok(count > 5, `Editor keyboard traversal missing: ${route}`);
        }
        if (width <= 700) {
          await page.getByRole('button', { name: 'More', exact: true }).click();
          await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Close navigation');
          await page.keyboard.press('Escape');
          assert.equal(await page.getByRole('button', { name: 'More', exact: true }).evaluate(el => el === document.activeElement), true);
          await page.screenshot({ path: path.join(output, 'phone-keyboard-navigation.png') });
        } else {
          await page.getByRole('navigation', { name: 'Expenses Hub navigation' }).getByRole('button', { name: 'Finance', exact: false }).click();
          await page.getByRole('button', { name: 'Payroll preview', exact: true }).click();
          await page.getByRole('region', { name: 'Illustrative payroll preview' }).scrollIntoViewIfNeeded();
          assert.ok(await page.getByRole('table').isVisible());
          assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1));
          await page.screenshot({ path: path.join(output, 'laptop-payroll-preview.png') });
        }
      }
    }
    // Exhaust every paged record on phone: no lost rows or nested scroll traps.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:4322');
    await page.locator('[data-route="expenses"] form').waitFor();
    const mobile = [];
    for (const [route, region, next, selector, expected] of [
      ['Nominal Directory', 'Nominal reference directory', 'Next references', 'li > strong', 195],
      ['Finance', 'Alphabetical synthetic staff queue', 'Next staff', 'button[aria-pressed] > strong:first-child', 24]
    ]) {
      await page.getByRole('button', { name: 'More', exact: true }).click();
      await page.getByRole('navigation', { name: 'Expenses Hub navigation' }).getByRole('button', { name: route, exact: route !== 'Finance' }).click();
      const area = page.getByRole('region', { name: region });
      const seen = new Set(); let pages = 0; let maxPageHeight = 0;
      while (true) {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Paged phone horizontal overflow');
        const values = await area.locator(selector).allTextContents();
        values.forEach(value => { assert.ok(!seen.has(value), 'Duplicate paged record'); seen.add(value); });
        const button = area.getByRole('button', { name: next, exact: true }).last();
        const focusButton = await button.isDisabled() ? area.getByRole('button', { name: route === 'Finance' ? 'Previous staff' : 'Previous references', exact: true }).last() : button;
        await focusButton.focus();
        assert.ok(await focusButton.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight && (hit === el || el.contains(hit)); }), 'Paging focus obscured');
        maxPageHeight = Math.max(maxPageHeight, await page.evaluate(() => document.documentElement.scrollHeight));
        pages++;
        if (await button.isDisabled()) break;
        await button.press('Enter');
      }
      assert.equal(seen.size, expected);
      const nested = await area.evaluate(el => [el, ...el.querySelectorAll('*')].filter(item => /auto|scroll/.test(getComputedStyle(item).overflowY) && item.scrollHeight > item.clientHeight + 1).length);
      assert.equal(nested, 0, 'Phone nested vertical scroll');
      if (route === 'Finance') {
        await area.locator('button[aria-pressed]').last().click();
        const correction = page.getByRole('button', { name: /^Preview chaser text/ });
        await correction.focus();
        assert.ok(await correction.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight && hit === el; }));
      }
      mobile.push({ route, pages, reachableRecords: seen.size, maxPageHeight, nestedVerticalScrolls: nested, pageHeight: await page.evaluate(() => document.documentElement.scrollHeight) });
      await page.screenshot({ path: path.join(output, 'phone-paged-' + (route === 'Finance' ? 'finance' : 'directory') + '.png'), fullPage: true });
    }
    fs.writeFileSync(path.join(output, 'mobile-reachability.json'), JSON.stringify(mobile, null, 2));
    assert.deepEqual(errors, []);
  } finally {
    fs.writeFileSync(path.join(output, 'routes.json'), JSON.stringify({ results, keyboard, errors }, null, 2));
    await browser.close();
  }
  console.log(`PASS: ${results.length} route/viewport/host-offset checks; no horizontal overflow or page errors. Desktop vertical assertions ${process.env.KCF_VIEWPORT_PHASE === 'before' ? 'disabled for audit' : 'passed'}.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
