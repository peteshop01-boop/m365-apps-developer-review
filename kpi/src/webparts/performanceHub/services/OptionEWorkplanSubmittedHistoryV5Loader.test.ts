import { readFileSync } from 'fs';
import { TextDecoder, TextEncoder } from 'node:util';
import { loadOptionEWorkplanSubmittedHistoryV5 } from './OptionEWorkplanSubmittedHistoryV5Loader';
import type { IV5SubmittedHistoryLoader } from '../models/OptionEWorkplanSubmittedHistoryV5Models';
import { parseV5CapturedReceipt } from './OptionEWorkplanSubmitExactBodyV5CapturedWire';
import { v4Canonical } from './OptionEWorkplanSubmitExactBodyV4Wire';
Object.assign(globalThis, { TextDecoder, TextEncoder });
const coordinates = { workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 };
const histories = ['complete-global', 'complete-manager', 'prior-global-full', 'prior-global-minimal', 'prior-manager-full', 'prior-manager-minimal'];
const bytes = (name: string, kind: string): string => readFileSync(`tests/fixtures/captured-history/PM86-TECH-A002/${name}-r3-${kind}.json`, 'utf8');

describe('captured history async loader', () => {
  it.each(histories.flatMap(name => (['snapshot', 'receipt'] as const).map(kind => ({ name, kind }))))(
    'loads exact $name $kind and retains all raw history', async ({ name, kind }) => {
      const canonicalBody = bytes(name, kind), original = parseV5CapturedReceipt(bytes(name, 'receipt'));
      const port = { readCapture: jest.fn(async (_expected: Readonly<typeof coordinates>) => ({ encoding: 'captured-native-request/v1' as const, kind, canonicalBody })) };
      const result = await loadOptionEWorkplanSubmittedHistoryV5(coordinates, port);
      expect(port.readCapture).toHaveBeenCalledWith(coordinates);
      expect(Object.isFrozen(port.readCapture.mock.calls[0][0])).toBe(true);
      expect(result.status).toBe('DECODED_SOURCE_ONLY');
      if (result.status !== 'DECODED_SOURCE_ONLY') throw new Error(result.reason);
      const h = result.projection.history, a = original.snapshot.admission.authority;
      expect(h.capture.canonicalBody).toBe(canonicalBody);
      expect(h.snapshot).toEqual(original.snapshot);
      expect(h.receipt).toEqual(kind === 'receipt' ? original : undefined);
      expect(h.raw.requestBody).toBe(a.request.body);
      expect(h.raw.referenceBody).toBe(a.request.query.referenceBody);
      expect(h.raw.draftBody).toBe(a.draft.body);
      for (const row of a.references.rows) {
        if (row.kind === 'DeliveryConfiguration') { expect(h.raw.deliveryBody).toBe(row.body); expect(h.raw.deliveryNativeMetadataBody).toBe(row.nativeMetadataBody); }
        if (row.kind === 'ImpactTaxonomy') { expect(h.raw.taxonomyBody).toBe(row.body); expect(h.raw.taxonomyNativeMetadataBody).toBe(row.nativeMetadataBody); }
      }
      if (name.startsWith('complete')) expect(h.snapshot.admission.authority.references.rows).toHaveLength(48);
      expect(result.projection.deliveryWeights.coreWeight).toBe(name.includes('manager') ? 80 : 70);
      expect(Object.isFrozen(h.draft)).toBe(true);
    });
  it.each(['global-full', 'global-minimal', 'manager-full', 'manager-minimal'].flatMap(name =>
    (['snapshot', 'receipt'] as const).map(kind => ({ name, kind }))))('retains explicit r2 $name $kind', async ({ name, kind }) => {
      const receipt = readFileSync(`tests/fixtures/captured-history/PM84-BUILD-A003/${name}-r2-receipt.json`, 'utf8');
      const canonicalBody = kind === 'receipt' ? receipt : v4Canonical(JSON.parse(receipt).snapshot);
      const result = await loadOptionEWorkplanSubmittedHistoryV5(coordinates, { readCapture: async () => ({ kind, canonicalBody }) });
      expect(result.status).toBe('DECODED_SOURCE_ONLY');
      if (result.status === 'DECODED_SOURCE_ONLY') expect(result.projection.history.capture.canonicalBody).toBe(canonicalBody);
    });
  it('holds absent bindings/captures, read failures and conflicting coordinates', async () => {
    await expect(loadOptionEWorkplanSubmittedHistoryV5(coordinates)).resolves.toEqual({ status: 'HOLD', reason: 'Unbound' });
    await expect(loadOptionEWorkplanSubmittedHistoryV5(coordinates, { readCapture: async () => undefined })).resolves.toEqual({ status: 'HOLD', reason: 'MissingCapture' });
    await expect(loadOptionEWorkplanSubmittedHistoryV5(coordinates, { readCapture: async () => { throw new Error('offline'); } })).resolves.toEqual({ status: 'HOLD', reason: 'ReadUnavailable' });
    const port = { readCapture: async () => ({ encoding: 'captured-native-request/v1' as const, kind: 'receipt' as const, canonicalBody: bytes('complete-global', 'receipt') }) };
    await expect(loadOptionEWorkplanSubmittedHistoryV5({ ...coordinates, person: 'other' }, port)).resolves.toEqual({ status: 'HOLD', reason: 'InvalidHistoricalCapture' });
  });
  it('never infers encoding or accepts unknown envelopes', async () => {
    for (const envelope of [
      { kind: 'receipt', canonicalBody: bytes('complete-global', 'receipt') },
      { kind: 'receipt', canonicalBody: bytes('complete-global', 'receipt'), encoding: 'unknown' },
      { kind: 'receipt', canonicalBody: bytes('complete-global', 'receipt'), encoding: 'captured-native-request/v1', extra: true }
    ]) {
      const port = { readCapture: async () => envelope } as IV5SubmittedHistoryLoader;
      expect((await loadOptionEWorkplanSubmittedHistoryV5(coordinates, port)).status).toBe('HOLD');
    }
  });
});
