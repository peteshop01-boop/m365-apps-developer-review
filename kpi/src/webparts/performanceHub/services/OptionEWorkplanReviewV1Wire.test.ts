import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { TextEncoder } from 'util';
import type { ReviewCommandV1 } from '../models/OptionEWorkplanReviewV1Models';
import { encodeReviewCommandV1, parseReviewCommandV1, encodeReviewApprovedV1, parseReviewApprovedV1,
  encodeReviewReceiptV1, parseReviewReceiptV1, encodeReviewJournalV1, parseReviewJournalV1 } from './OptionEWorkplanReviewV1Wire';
const goldens: { goldens: { name: string; body: string; utf8Bytes: number; sha256: string }[] } = JSON.parse(readFileSync(
  'temp/test-fixtures/review/normal-goldens.json', 'utf8'));
Object.assign(globalThis, { TextEncoder });
describe('fixed review frame ordinary golden bytes', () => {
  test('command', () => { const g = goldens.goldens[0]; expect(encodeReviewCommandV1(parseReviewCommandV1(g.body))).toBe(g.body); });
  test('approved', () => { const g = goldens.goldens[1]; expect(encodeReviewApprovedV1(parseReviewApprovedV1(g.body))).toBe(g.body); });
  test('receipt', () => { const g = goldens.goldens[2]; expect(encodeReviewReceiptV1(parseReviewReceiptV1(g.body))).toBe(g.body); });
  test('journal', () => { const g = goldens.goldens[3]; expect(encodeReviewJournalV1(parseReviewJournalV1(g.body))).toBe(g.body); });
  test.each(goldens.goldens)('$name standard UTF8 SHA256', g => {
    expect(Buffer.byteLength(g.body, 'utf8')).toBe(g.utf8Bytes);
    expect(createHash('sha256').update(g.body, 'utf8').digest('hex').toUpperCase()).toBe(g.sha256);
  });
});
test('exact56000 UTF8 body is admitted; one byte over is held; reason text remains exact', () => {
  const initial: ReviewCommandV1 = { ...parseReviewCommandV1(goldens.goldens[0].body), command: 'RequestChanges', reason: '  Café reason  ' };
  const remaining = 56000 - Buffer.byteLength(encodeReviewCommandV1(initial), 'utf8');
  const exact = { ...initial, reason: initial.reason! + 'x'.repeat(remaining) };
  const body = encodeReviewCommandV1(exact); expect(Buffer.byteLength(body, 'utf8')).toBe(56000);
  expect(parseReviewCommandV1(body).reason).toBe(exact.reason);
  expect(() => encodeReviewCommandV1({ ...exact, reason: exact.reason + 'x' })).toThrow('ReviewFrameCapacity');
});
test.each(['command', 'approved', 'receipt', 'journal'])('%s rejects ordinary unknown/missing/version/nested fields', name => {
  const golden = goldens.goldens.find(g => g.name === name)!;
  const parse = name === 'command' ? parseReviewCommandV1 : name === 'approved' ? parseReviewApprovedV1 : name === 'receipt' ? parseReviewReceiptV1 : parseReviewJournalV1;
  const unknown = { ...JSON.parse(golden.body), extra: 'unsupported' }; expect(() => parse(JSON.stringify(unknown))).toThrow();
  const missing = JSON.parse(golden.body); delete missing.schemaVersion; expect(() => parse(JSON.stringify(missing))).toThrow();
  expect(() => parse(JSON.stringify({ ...JSON.parse(golden.body), schemaVersion: 'unsupported/v2' }))).toThrow();
  if (name !== 'command') { const nested = JSON.parse(golden.body); nested.sourceCapture.native.extra = 'unsupported'; expect(() => parse(JSON.stringify(nested))).toThrow(); }
});
test('command parser preserves content while encoder sorts raw differing property order', () => {
  const v = JSON.parse(goldens.goldens[0].body); const raw = JSON.stringify(Object.fromEntries(Object.entries(v).reverse()), undefined, 2);
  expect(raw).not.toBe(goldens.goldens[0].body); expect(encodeReviewCommandV1(parseReviewCommandV1(raw))).toBe(goldens.goldens[0].body);
});
test('receipt excludes nativeCreatedAt and ApproveLock reason; numeric ordinal is mandatory', () => {
  const receipt = JSON.parse(goldens.goldens[2].body); receipt.receipt.nativeCreatedAt = '2026-10-11T03:00:00.000Z';
  expect(() => parseReviewReceiptV1(JSON.stringify(receipt))).toThrow();
  expect(() => parseReviewCommandV1(JSON.stringify({ ...JSON.parse(goldens.goldens[0].body), reason: 'extra' }))).toThrow();
  const approved = JSON.parse(goldens.goldens[1].body); approved.ordinalSource.value = '2'; expect(() => parseReviewApprovedV1(JSON.stringify(approved))).toThrow();
});
