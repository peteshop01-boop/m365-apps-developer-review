import { calculateMileage, validateMileage } from './mileage';
import type { IMileageDraft } from './mileage';
import { MockMileageService } from '../services/MockMileageService';
import { DEMO_CLAIM } from '../services/MockExpensesService';
import { nominalMaster } from '../data/nominals';
import { isDemoTestSite } from './demoHost';
import { decideDemoLine, reviewReadiness } from './demoReview';

const draft: IMileageDraft = { date: '13-10-2026', programme: 'CTS Schools', nominalCode: '20600',
  from: 'Demo start', to: 'Demo ground', returnJourney: true, outwardMiles: '10.24', returnMiles: '10.25', purpose: 'Fictional visit' };
describe('Manual synthetic mileage and deployment boundary', () => {
  it('sums both legs before rounding once and multiplying an integer rate', () => {
    expect(calculateMileage(draft, 45)).toEqual({ miles: 20, pence: 900 });
    expect(calculateMileage({ ...draft, returnMiles: '10.26' }, 45)).toEqual({ miles: 21, pence: 945 });
    expect(calculateMileage({ ...draft, returnJourney: false, returnMiles: '999' }, 45)).toEqual({ miles: 10, pence: 450 });
  });
  it('refuses invalid distances, month, nominal and missing independent reverse leg', () => {
    expect(calculateMileage({ ...draft, outwardMiles: '-1' }, 45)).toBeUndefined();
    expect(calculateMileage({ ...draft, outwardMiles: '1.234' }, 45)).toBeUndefined();
    expect(calculateMileage({ ...draft, outwardMiles: '0.1', returnMiles: '0.1' }, 45)).toBeUndefined();
    expect(validateMileage({ ...draft, date: '01-11-2026', nominalCode: 'bad', returnMiles: '' }, nominalMaster, '2026-10')).toMatchObject({ date: expect.any(String), nominalCode: expect.any(String), returnMiles: expect.any(String) });
  });
  it('makes repeated commands harmless and refuses operation payload reuse', async () => {
    const api = new MockMileageService(nominalMaster, DEMO_CLAIM);
    const command = { claimId: DEMO_CLAIM.id, operationId: 'test-1', draft };
    const saved = await api.save(command);
    expect(await api.save(command)).toEqual(saved);
    expect(await api.list(DEMO_CLAIM.id)).toHaveLength(1);
    await expect(api.save({ ...command, draft: { ...draft, purpose: 'Different' } })).rejects.toThrow('different data');
  });
  it('preserves ID on edit, refuses stale versions and outside-claim access', async () => {
    const api = new MockMileageService(nominalMaster, DEMO_CLAIM);
    const line = await api.save({ claimId: DEMO_CLAIM.id, operationId: 'first', draft });
    const update = { claimId: DEMO_CLAIM.id, operationId: 'edit', draft: { ...draft, outwardMiles: '12' }, existingId: line.id, expectedVersion: line.version };
    expect((await api.save(update)).id).toBe(line.id);
    await expect(api.save({ ...update, operationId: 'stale' })).rejects.toThrow('changed');
    await expect(api.list('unrelated')).rejects.toThrow('Unknown');
  });
  it('never accepts demo edits to submitted claims', async () => {
    const api = new MockMileageService(nominalMaster, { ...DEMO_CLAIM, status: 'Submitted' });
    await expect(api.save({ claimId: DEMO_CLAIM.id, operationId: 'locked', draft })).rejects.toThrow('draft');
  });
  it('limits SharePoint host to exact HTTPS Automation site without lookalikes or PROD', () => {
    expect(isDemoTestSite('https://example.invalid/sites/REVIEW-TEST-SITE/')).toBe(true);
    for (const value of ['http://example.invalid/sites/REVIEW-TEST-SITE', 'https://example.invalid/sites/REVIEW-PROD-SITE', 'https://example.invalid.evil.example/sites/REVIEW-TEST-SITE', 'https://example.invalid/sites/REVIEW-TEST-SITE/subsite', 'bad']) expect(isDemoTestSite(value)).toBe(false);
  });
  it('keeps unaffected approvals, requires a query reason and expires changed-line decisions', () => {
    const line = { id: 'one', kind: 'Expense' as const, dateIso: '2026-10-13', title: 'Demo', detail: '', nominalCode: '20600', amountPence: 100, version: 1 };
    const other = { ...line, id: 'two' };
    expect(() => decideDemoLine(line, 'Queried', ' ', '2026-10-13')).toThrow('reason');
    const decisions = [decideDemoLine(line, 'Approved', '', '2026-10-13'), decideDemoLine(other, 'Queried', 'Clarify', '2026-10-13')];
    expect(reviewReadiness([line, other], decisions)).toEqual({ approved: 1, queried: 1, pending: 0, complete: false });
    expect(reviewReadiness([{ ...line, version: 2 }], decisions).pending).toBe(1);
  });
});
