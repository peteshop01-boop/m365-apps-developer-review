jest.mock('@microsoft/sp-http', () => ({ SPHttpClient: { configurations: { v1: {} } } }));
import { createTestCoreRequest, createTestWorkplanDraftRequest, tokenFromTrustedCanonical, validateTestWire } from './TestPilotCommandWire';
import { serializeEmployeeV2Command } from './EmployeeWorkplanV2CommandTransport';
import { KCF_KPI_036_TEST_LIST_BINDINGS } from './EmployeeWorkplanV2ListBindings';
import type { IEmployeeCoreContributionInputV2 } from '../models/EmployeeWorkplanV2PersistenceModels';
const command = 'fb1f6035-236e-434c-ae05-a78003badd47';
const input = (): IEmployeeCoreContributionInputV2 => ({ kpiId: 'K1', role: 'Contributor', contributionMethod: 'AdditiveDirect',
  annualTargetValue: -1.25, annualTargetText: 'é/é 🏏', quarterTargets: ['Q1','Q2','Q3','Q4'].map(quarter => ({ quarter: quarter as 'Q1', targetValue: -0.25 })), displayOrder: 0, activeInWorkplan: true });
const build = (token: unknown) => createTestCoreRequest(command, 'EMP.1', token as string, '"h4"', { presence: 'Present', etag: '"i2"' }, input());
const serialize = (request: ReturnType<typeof build>) => JSON.parse(serializeEmployeeV2Command(request, KCF_KPI_036_TEST_LIST_BINDINGS, '2026-09-09T01:00:00Z'));
describe('M145 actual text-token producers and shared serializer', () => {
  it('Create uses exact absent/zero/not-applicable/empty body and omits the numeric outer token', () => {
    const r = createTestWorkplanDraftRequest(command, 'EMP.1'), o = serialize(r);
    expect(o).not.toHaveProperty('ExpectedRowVersionToken'); expect(o).not.toHaveProperty('ExpectedETag');
    expect(JSON.parse(o.PayloadJSON)).toEqual(r.payload);
    expect(r.payload.expected).toEqual({ header: { presence: 'Absent', token: '0', etag: null }, item: { presence: 'NotApplicable' } });
    expect(r.payload.payload).toEqual({});
  });
  it('preserves separate opaque tags and full Unicode/fractional Core fields without mutating input', () => {
    const p = input(), before = JSON.stringify(p); const r = createTestCoreRequest(command, 'EMP.1', '4', '"h4"', { presence: 'Present', etag: '"i2"' }, p);
    const o = serialize(r); expect(o.ExpectedETag).toBe('"h4"'); expect(o).not.toHaveProperty('ExpectedRowVersionToken');
    expect(JSON.parse(o.PayloadJSON).payload).toEqual(p); expect(JSON.stringify(p)).toBe(before);
    p.quarterTargets[0].targetValue = 999; expect((r.payload.payload as IEmployeeCoreContributionInputV2).quarterTargets[0].targetValue).toBe(-0.25);
  });
  it.each([4, 4.0000000000000001, null, '', '04', '+4', '-4', '4.0', '4e0', '4.0000000000000001', ' 4', '4\n', '４', '0', '9007199254740990', '9007199254740991', '9007199254740992'])('rejects untrusted token %p through the factory', token => { expect(() => build(token)).toThrow(); });
  it('admits the highest safe +2 epoch and decodes escaped digits without raw canonicalisation', () => {
    expect(build('9007199254740989').payload.expected.header.token).toBe('9007199254740989');
    expect(tokenFromTrustedCanonical(9007199254740989)).toBe('9007199254740989');
    const w = build('4').payload; expect(validateTestWire(JSON.parse(JSON.stringify(w).replace('"token":"4"', '"token":"\\u0034"'))).expected.header.token).toBe('4');
    expect(() => tokenFromTrustedCanonical(9007199254740990)).toThrow(); expect(() => tokenFromTrustedCanonical(4.5)).toThrow();
  });
  it('rejects legacy wire, unknown fields, invalid Core policy and item shapes', () => {
    const w = build('4').payload;
    expect(() => validateTestWire({ ...w, schemaVersion: 'kcf.kpi.test-command.v1' })).toThrow();
    expect(() => validateTestWire({ ...w, hidden: true })).toThrow();
    expect(() => validateTestWire({ ...w, expected: { ...w.expected, item: { presence: 'Absent', etag: '"h4"' } } })).toThrow();
    expect(() => createTestCoreRequest(command, 'EMP.1', '4', '*', { presence: 'Absent' }, input())).toThrow();
    expect(() => createTestCoreRequest(command, 'EMP.1', '4', '"h4"', { presence: 'Absent' }, { ...input(), annualTargetValue: Infinity })).toThrow();
  });
});


it('retains long Core text, inactive conditional policy and all five contribution methods', () => {
  const base = { ...input(), annualTargetText: '🏏'.repeat(600), governanceReference: 'g'.repeat(2000), denominatorUnit: 'u'.repeat(600),
    denominatorRuleReference: 'rule', denominatorSourceReference: 'source', denominatorNumerator: -1.25, denominatorValue: 2,
    sharedTargetRule: 'ApprovedApportionment' as const, sharedApportionmentPercent: 100 };
  for (const contributionMethod of ['AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight'] as const) {
    const p = { ...base, role: 'AccountableOwner' as const, contributionMethod,
      quarterTargets: base.quarterTargets.map(q => ({ ...q, commitment: 'Deliver', successDefinition: 's'.repeat(2000) })) };
    const result = createTestCoreRequest(command, 'EMP.1', '4', 'opaque', { presence: 'Absent' }, p);
    expect(JSON.parse(serialize(result).PayloadJSON).payload).toEqual(p);
  }
  const inactive = { ...input(), activeInWorkplan: false, annualTargetValue: undefined, quarterTargets: input().quarterTargets.map(q => ({ quarter: q.quarter })) };
  expect(() => createTestCoreRequest(command, 'EMP.1', '4', 'opaque', { presence: 'Absent' }, inactive)).not.toThrow();
});
