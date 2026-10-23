'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('src/webparts/kcfExpensesHub/components/KcfExpensesHub.module.scss', 'utf8');
const tokens = Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(m => [m[1], m[2]]));
function luminance(hex) {
  const parts = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return parts[0] * .2126 + parts[1] * .7152 + parts[2] * .0722;
}
function contrast(a, b) { const x = luminance(a); const y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
test('Core small-text colour pairs exceed WCAG AA 4.5:1 (static calculation only)', () => {
  const pairs = [['white', 'navy'], ['white', 'slate'], ['white', 'blue'], ['white', 'error'], ['ink', 'paper'], ['muted', 'paper'], ['muted', 'mist'], ['error', 'paper']];
  for (const [text, background] of pairs) assert.ok(contrast(tokens[text], tokens[background]) >= 4.5, `${text}/${background}`);
  assert.ok(contrast('#d2e4f5', '#304c65') >= 4.5, 'dark-card supporting text');
  assert.ok(contrast('#513f14', '#fff2ce') >= 4.5, 'demo notice');
  assert.ok(contrast(tokens.error, '#fff2ce') >= 4.5, 'red synthetic-demo notice label');
  assert.ok(contrast('#53697e', '#ffffff') >= 4.5, 'input placeholder');
});
test('Focus-ring colours provide 3:1 contrast on their relevant surfaces (static calculation)', () => {
  assert.ok(contrast(tokens.focus, tokens.navy) >= 3);
  assert.ok(contrast(tokens.navy, tokens.paper) >= 3);
});
