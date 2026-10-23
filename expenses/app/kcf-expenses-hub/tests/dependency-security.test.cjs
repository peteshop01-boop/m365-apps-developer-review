'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const qs = require('qs');

test('Build-tool query parser retains ordinary scalar/array round trips', () => {
  const original = { labels: ['demo-a', 'demo-b'], count: '2' };
  assert.deepEqual(qs.parse(qs.stringify(original)), original);
});
test('Untrusted constructor/isBuffer keys round-trip without a non-callable crash', () => {
  const parsed = qs.parse('filter[constructor][isBuffer]=not-a-function', { plainObjects: true });
  assert.doesNotThrow(() => qs.stringify(parsed));
});
