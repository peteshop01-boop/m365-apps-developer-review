import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { TextDecoder, TextEncoder } from 'node:util';
import { loadOptionEWorkplanSubmittedHistoryV5 } from '../services/OptionEWorkplanSubmittedHistoryV5Loader';
import { OptionEWorkplanSubmittedHistoryV5View } from './OptionEWorkplanSubmittedHistoryV5View';
Object.assign(globalThis, { TextDecoder, TextEncoder });
it.each(['annual', 'quarter', 'reporting'] as const)('renders captured %s values and explicit source limitations', async journey => {
  const result = await loadOptionEWorkplanSubmittedHistoryV5({ workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 }, {
    readCapture: async () => ({ encoding: 'captured-native-request/v1', kind: 'snapshot', canonicalBody:
      readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-manager-r3-snapshot.json', 'utf8') }) });
  expect(result.status).toBe('DECODED_SOURCE_ONLY');
  const html = renderToStaticMarkup(<OptionEWorkplanSubmittedHistoryV5View result={result} journey={journey} quarter="Q2" />);
  expect(html).toContain('Core 80%'); expect(html).toContain('IMPACT 20%'); expect(html).toContain('Annual Target');
  expect(html).toContain('Current / Actual'); expect(html).toContain('outside Delivery arithmetic');
  expect(html).toContain('operational reporting eligibility have not been established');
  expect(html).toContain('synthetic-audit-1'); expect(html).not.toContain('<button'); expect(html).not.toContain('<input');
});
it('renders HOLD without historical data', () => {
  const html = renderToStaticMarkup(<OptionEWorkplanSubmittedHistoryV5View journey="annual" result={{ status: 'HOLD', reason: 'Unbound' }} />);
  expect(html).toContain('HOLD'); expect(html).toContain('Unbound'); expect(html).not.toContain('<table');
  expect(html).toContain('Restore the governed history read');
});
it.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('displays captured definitions and immutable raw text for %s', async quarter => {
  const result = await loadOptionEWorkplanSubmittedHistoryV5({ workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 }, {
    readCapture: async () => ({ encoding: 'captured-native-request/v1', kind: 'snapshot', canonicalBody:
      readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-manager-r3-snapshot.json', 'utf8') }) });
  if (result.status !== 'DECODED_SOURCE_ONLY') throw new Error('Expected captured source');
  const before = JSON.stringify(result);
  for (const journey of ['annual', 'quarter', 'reporting'] as const) {
    const html = renderToStaticMarkup(<OptionEWorkplanSubmittedHistoryV5View result={result} journey={journey} quarter={quarter} />);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const text = doc.body.textContent || '';
    const draft = result.projection.history.draft;
    expect(text).toContain(draft.behaviours.frameworkVersion);
    expect(text).toContain(draft.behaviours.roleTier);
    for (const row of draft.core.entries) {
      expect(text).toContain(row.targetVersionKey); expect(text).toContain(row.contributionMethod);
      expect(text).toContain(`Weight ${row.weightPercent}%`);
    }
    for (const row of draft.impact) expect(text).toContain(`Measure ${row.measure}`);
    for (const row of draft.behaviours.entries) {
      expect(text).toContain(row.descriptorKey); expect(text).toContain(row.commitment);
      expect(text).toContain(row.periodCommitments[quarter]);
    }
    const extension = draft.behaviours.governedExtension;
    if (extension) {
      expect(text).toContain(extension.authority.catalogueContentSha256);
      for (const headline of extension.headlines) for (const selection of headline.selections) {
        expect(text).toContain(selection.selectedWording); expect(text).toContain(selection.howWillWeKnow);
      }
    } else expect(text).toContain('Captured governed Behaviour extensionNot captured');
    for (const [key, body] of Object.entries(result.projection.history.raw))
      expect(doc.querySelector(`[aria-label="Raw captured ${key}"] pre`)?.textContent).toBe(body);
    expect(doc.querySelector('details summary')?.textContent).toBe('Captured provenance and full raw history');
    expect(doc.querySelector('[aria-label="Captured annual commitments"]')?.getAttribute('tabindex')).toBe('0');
    expect(text).toContain('DECODED_SOURCE_ONLY');
    expect(text).toContain('Approved quarter Actuals, evidence, manager commentary and final year-end outcome are unavailable');
    expect(doc.querySelector('a')).toBeNull();
  }
  expect(JSON.stringify(result)).toBe(before);
});
it('keeps an absent captured governed extension explicit', async () => {
  const result = await loadOptionEWorkplanSubmittedHistoryV5({ workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 }, {
    readCapture: async () => ({ encoding: 'captured-native-request/v1', kind: 'snapshot', canonicalBody:
      readFileSync('tests/fixtures/captured-history/PM86-TECH-A002/complete-manager-r3-snapshot.json', 'utf8') }) });
  if (result.status !== 'DECODED_SOURCE_ONLY') throw new Error('Expected captured source');
  const draft = { ...result.projection.annual, behaviours: { ...result.projection.annual.behaviours, governedExtension: undefined } };
  const reference = { ...result, projection: { ...result.projection, annual: draft } };
  const html = renderToStaticMarkup(<OptionEWorkplanSubmittedHistoryV5View result={reference} journey="annual" />);
  expect(html).toContain('Captured governed Behaviour extension</h4><p>Not captured</p>');
  expect(html).toContain('Approval and operational reporting eligibility have not been established');
});
