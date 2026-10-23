import { readFileSync } from 'fs';
import { TextDecoder, TextEncoder } from 'node:util';
import { loadOptionEWorkplanSubmittedHistoryV5 } from './OptionEWorkplanSubmittedHistoryV5Loader';
Object.assign(globalThis, { TextDecoder, TextEncoder });
describe('captured history read projection', () => {
  it.each(['global', 'manager'])('keeps %s captured annual, quarterly and Reporting identical without current clock/config', async name => {
    const canonicalBody = readFileSync(`tests/fixtures/captured-history/PM86-TECH-A002/complete-${name}-r3-receipt.json`, 'utf8');
    const read = (): ReturnType<typeof loadOptionEWorkplanSubmittedHistoryV5> => loadOptionEWorkplanSubmittedHistoryV5(
      { workplan: 'WP-SYNTHETIC-2026', person: 'employee', year: 2026 },
      { readCapture: async () => ({ encoding: 'captured-native-request/v1', kind: 'receipt', canonicalBody }) });
    const before = await read();
    const clock = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      const after = await read(); expect(after).toEqual(before);
      if (after.status !== 'DECODED_SOURCE_ONLY') throw new Error(after.reason);
      const p = after.projection;
      expect(p.annual).toBe(p.quarterly); expect(p.annual).toBe(p.reporting); expect(p.annual).toBe(p.history.draft);
      expect(p.classifications).toBe(p.history.impactClassifications);
      expect(p.deliveryWeights).toBe(p.history.overallDeliveryWeightConfiguration);
      expect(p.operationalEligibility).toBe('NOT_ASSESSED'); expect(p.behavioursExcludedFromDeliveryArithmetic).toBe(true);
      expect(Object.isFrozen(p)).toBe(true);
      expect(p).not.toHaveProperty('actuals'); expect(p).not.toHaveProperty('approved'); expect(p).not.toHaveProperty('gold');
      expect(p.history.deliveryPublication.scope.kind).toBe(name === 'manager' ? 'WorkplanOverride' : 'GlobalDefault');
    } finally { clock.mockRestore(); }
  });
});
