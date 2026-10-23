import type { IPersonalWorkplanItem } from '../models/ProductionModels';
import { readImpactDraft, projectImpactDraft, retainImpactInput, impactTargetEditReason } from './IntegratedImpactDraftMapping';
import { validateEmployeePersonalItemInputV2 } from './EmployeeWorkplanV2PersistencePolicy';

const fixture = (patch: Partial<IPersonalWorkplanItem> = {}): IPersonalWorkplanItem => ({
  id: 21, etag: 'v1', workplanItemKey: 'p1', naturalKey: 'employee|2027|LocalPersonal|p1', workplanKey: 'employee|2027', personKey: 'employee', performanceYear: 2027,
  wording: 'Reduce waiting time', description: 'Old exact success\nEvidence retained', measure: 'Waiting days', measureType: 'Days', scoringDirection: 'LowerIsBetter', baselineValue: 100,
  unitLabel: 'days', yearEndTargetValue: 80, q1TargetValue: 95, q2TargetValue: 90, q3TargetValue: 85, q4TargetValue: 80, personalItemWeight: 100, displayOrder: 0, activeInWorkplan: true, ...patch
});
describe('IMPACT existing command mapping', () => {
  test.each(['Count', 'Number', 'Percentage', 'Currency', 'Rate', 'Days', 'Score', 'Milestone', 'TextStatus', 'Other', undefined] as const)('preserves all metadata for %s without mutating inputs', measureType => {
    const item = Object.freeze(fixture({ measureType, percentageSourceScale: 'Fraction', q1TargetValue: 0, q2TargetText: 'also retained', personalItemWeight: undefined }));
    const draft = Object.freeze(readImpactDraft(item)); Object.freeze(draft.original);
    const input = projectImpactDraft(draft, item, 99);
    expect(input).toEqual(retainImpactInput(item));
    expect(readImpactDraft({ ...item, ...input })).toEqual(draft);
    expect(input).not.toHaveProperty('original'); expect(input).not.toHaveProperty('id'); expect(item.etag).toBe('v1');
  });
  test.each(['HigherIsBetter', 'LowerIsBetter', 'TargetRange', 'Milestone', 'TBC', undefined] as const)('retains direction %s for a wording-only edit', scoringDirection => {
    const item = Object.freeze(fixture({ scoringDirection })); const draft = Object.freeze({ ...readImpactDraft(item), wording: 'Changed wording' });
    expect(projectImpactDraft(draft, item, 9)).toEqual({ ...retainImpactInput(item), wording: 'Changed wording' });
  });
  test('preserves absent values distinctly from zero and empty description', () => {
    const item = Object.freeze(fixture({ q1TargetValue: undefined, q2TargetValue: 0, description: undefined, baselineValue: undefined, personalItemWeight: undefined }));
    expect(projectImpactDraft(readImpactDraft(item), item, 3)).toEqual(retainImpactInput(item));
  });
  test('changes only a requested target, retaining baseline, scale, direction and summary', () => {
    const item = Object.freeze(fixture({ measureType: 'Percentage', percentageSourceScale: 'Fraction', q1TargetValue: 0.5 }));
    expect(projectImpactDraft({ ...readImpactDraft(item), q1: '0.4' }, item, 5)).toEqual({ ...retainImpactInput(item), q1TargetValue: 0.4, q1TargetText: undefined });
  });
  test('round-trips explicit outcome, success criterion and local classification without leaking provenance into the tenant command', () => {
    const item = Object.freeze(fixture({
      description: 'Synthetic intended outcome', measure: 'Synthetic evidence count',
      impactClassification: Object.freeze({
        strategicPillar: Object.freeze({ key: 'p1', label: 'Synthetic pillar', source: 'TEST', sourceReference: 'p-v1' }),
        businessContributionArea: Object.freeze({ key: 'a1', label: 'Synthetic area', source: 'TEST', sourceReference: 'a-v1' })
      })
    }));
    const draft = readImpactDraft(item);
    expect(draft).toMatchObject({
      intendedOutcome: 'Synthetic intended outcome', successCriterion: 'Synthetic evidence count',
      classification: item.impactClassification
    });
    const command = projectImpactDraft({ ...draft, intendedOutcome: 'Changed outcome', successCriterion: 'Changed evidence' }, item, 1);
    expect(command).toMatchObject({ description: 'Changed outcome', measure: 'Changed evidence' });
    expect(command).not.toHaveProperty('classification');
    expect(command).not.toHaveProperty('impactClassification');
    expect(item.description).toBe('Synthetic intended outcome');
  });
  test('retains unsupported targets while allowing description/wording edits; blocks only target conversion', () => {
    const item = fixture({ measureType: 'Other', yearEndTargetText: 'Special' }); const draft = readImpactDraft(item);
    expect(impactTargetEditReason(draft)).toBeDefined();
    expect(projectImpactDraft({ ...draft, success: 'Exact new evidence' }, item, 1).description).toBe('Exact new evidence');
    expect(() => projectImpactDraft({ ...draft, annual: '3' }, item, 1)).toThrow(/cannot safely convert/);
    expect(() => projectImpactDraft({ ...draft, measure: 'Percentage' }, item, 1)).toThrow(/complete definition editor/);
  });
  test('deactivation changes only active flag, including legacy metadata/identities outside payload', () => {
    const item = Object.freeze(fixture()); expect(retainImpactInput(item, false)).toEqual({ ...retainImpactInput(item), activeInWorkplan: false });
    expect(item.activeInWorkplan).toBe(true);
  });
  test('rejects stale identity, missing record and an existing-key collision', () => {
    const item = fixture(); const draft = readImpactDraft(item);
    expect(() => projectImpactDraft(draft, { ...item, etag: 'v2' }, 1)).toThrow(/identity changed/);
    expect(() => projectImpactDraft(draft, undefined, 1)).toThrow(/identity changed/);
    expect(() => projectImpactDraft({ ...draft, original: undefined }, item, 1)).toThrow(/already belongs/);
  });
  test('new numeric and milestone commands use only accepted keys and retain zero', () => {
    const base = { ...readImpactDraft(fixture()), original: undefined, annual: '0', q1: '0', q2: '1', q3: '2', q4: '3' };
    const input = projectImpactDraft(base, undefined, 1); expect(input.yearEndTargetValue).toBe(0); expect(() => validateEmployeePersonalItemInputV2(input)).not.toThrow();
    const milestone = projectImpactDraft({ ...base, measure: 'Milestone / Completion', annual: 'Approved', q1: 'Draft' }, undefined, 1);
    expect(milestone.yearEndTargetText).toBe('Approved'); expect(milestone.scoringDirection).toBe('Milestone');
    expect(() => validateEmployeePersonalItemInputV2(milestone)).not.toThrow();
    expect(() => projectImpactDraft({ ...base, q1: 'not a number' }, undefined, 1)).toThrow(/finite numeric/);
  });
});
