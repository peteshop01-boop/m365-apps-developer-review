import { mapBehaviourCatalogueRow, type IBehaviourCatalogueSourceRow } from './BehaviourLibraryCatalogue';
import {
  BEHAVIOUR_FRAMEWORK_V2_COMMITMENT_PROMPT,
  BEHAVIOUR_FRAMEWORK_V2_EVIDENCE_PROMPT,
  BEHAVIOUR_FRAMEWORK_V2_MANAGER_STATUSES,
  BEHAVIOUR_FRAMEWORK_V2_RATINGS,
  BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS,
  BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY,
  buildBehaviourFrameworkV2Readback,
  createBehaviourFrameworkV2Catalogue,
  createOwnBehaviourFrameworkV2Target,
  getBehaviourFrameworkV2Choices,
  inspectBehaviourFrameworkV2Assessments,
  inspectBehaviourFrameworkV2Catalogue,
  inspectBehaviourFrameworkV2Evidence,
  inspectBehaviourFrameworkV2Reviews,
  inspectBehaviourFrameworkV2Selections,
  recordBehaviourFrameworkV2ManagerReview,
  selectBehaviourFrameworkV2Target
} from './BehaviourFrameworkV2';
import type {
  IBehaviourFocusQuarterEvidence,
  IBehaviourFocusTargetSelection,
  IBehaviourFrameworkV2Catalogue,
  IBehaviourHeadlineQuarterAssessment,
  IBehaviourManagerReviewEvent
} from './BehaviourFrameworkV2';
import { BEHAVIOUR_KEYS } from '../models/BehaviourWorkplanModels';
import {
  APPROVED_BEHAVIOUR_V1_INSTRUCTION_SHA256,
  APPROVED_BEHAVIOUR_V1_SOURCE_ROWS
} from '../testing/BehaviourFrameworkV1ApprovedData';

const metadata = { catalogueVersion: 'KCF-BHV-PD03-2026.09-v1', revision: 1, status: 'Published' as const, effectiveFrom: '2026-11-01' };
const catalogue = (): IBehaviourFrameworkV2Catalogue => createBehaviourFrameworkV2Catalogue(APPROVED_BEHAVIOUR_V1_SOURCE_ROWS, metadata);
const authored = { commitment: 'I will complete the agreed synthetic commitment.', howWillWeKnow: 'A dated record and colleague feedback show progress.' };

describe('BT-04 Sponsor-approved Behaviour Catalogue v1', () => {
  it('binds the recorded instruction identity and exact 5/25/75 approved content shape', () => {
    const result = catalogue();
    expect(APPROVED_BEHAVIOUR_V1_INSTRUCTION_SHA256).toBe('74F2AE0A7FDB33B72419CBF8897EEF0B45B23978583ABBF27DBF66581F504E8F');
    expect(inspectBehaviourFrameworkV2Catalogue(result)).toEqual({ valid: true, issues: [] });
    expect(result.rows).toHaveLength(75);
    expect(new Set(result.rows.map(row => row.focusKey)).size).toBe(25);
    expect(new Set(result.rows.map(row => row.suggestedTarget)).size).toBe(75);
    expect(result.headlineBehaviours.map(row => row.title)).toEqual([
      'WE TAKE RESPONSIBILITY', 'WE UNITE AS ONE CLUB', 'WE BUILD THE NEXT CHAPTER',
      'WE RESPECT THE GAME & EACH OTHER', 'WE WORK & PLAY WITH ENERGY'
    ]);
    expect(result.rows.find(row => row.targetKey === 'BHV-01-L1-01')?.suggestedTarget)
      .toBe('Deliver what I agree and flag problems early rather than letting deadlines slip.');
    expect(result.rows.find(row => row.targetKey === 'BHV-05-L3-05')?.suggestedTarget)
      .toBe('Create conditions in which teams can sustain strong performance without relying on burnout.');
    expect(result.rows.every(row => row.suggestedMeasure === BEHAVIOUR_FRAMEWORK_V2_COMMITMENT_PROMPT
      && row.suggestedUnit === 'MY COMMITMENT' && row.suggestedEvidence === BEHAVIOUR_FRAMEWORK_V2_EVIDENCE_PROMPT)).toBe(true);
    expect(APPROVED_BEHAVIOUR_V1_SOURCE_ROWS.map(mapBehaviourCatalogueRow)).toHaveLength(75);
    expect(result.headlineBehaviours.map(row => row.behaviourKey)).toEqual(BEHAVIOUR_KEYS);
    expect(result.roleLevels).toEqual(BEHAVIOUR_FRAMEWORK_V2_ROLE_LEVELS);
    expect(result.ratingScale).toEqual(['Developing', 'Effective', 'Exceptional']);
    expect(result.selectionGuidance).toEqual({ recommendedMinimum: 3, recommendedMaximum: 5, hardMaximum: null });
  });

  it.each(['L1', 'L2', 'L3'] as const)('filters exactly 25 approved examples by governed %s role and effective date', role => {
    const result = catalogue();
    expect(getBehaviourFrameworkV2Choices(result, role, undefined, new Date('2026-10-31'))).toHaveLength(0);
    const eligible = getBehaviourFrameworkV2Choices(result, role, undefined, new Date('2026-11-01'));
    expect(eligible).toHaveLength(25);
    expect(eligible.every(row => row.roleLevelCode === role)).toBe(true);
    BEHAVIOUR_KEYS.forEach(key => expect(getBehaviourFrameworkV2Choices(result, role, key, new Date('2026-11-01'))).toHaveLength(5));
  });

  it.each([
    ['version', (value: IBehaviourFrameworkV2Catalogue) => ({ ...value, catalogueVersion: 'latest' })],
    ['duplicate', (value: IBehaviourFrameworkV2Catalogue) => ({ ...value, rows: [...value.rows, value.rows[0]] })],
    ['key', (value: IBehaviourFrameworkV2Catalogue) => ({ ...value, rows: [{ ...value.rows[0], targetKey: 'BHV-02-L1-01' }, ...value.rows.slice(1)] })],
    ['focus key', (value: IBehaviourFrameworkV2Catalogue) => ({ ...value, rows: [{ ...value.rows[0], focusKey: 'BHV-02-FOCUS-01' }, ...value.rows.slice(1)] })],
    ['role authority', (value: IBehaviourFrameworkV2Catalogue) => ({ ...value, roleLevels: value.roleLevels.map(row => row.code === 'L1' ? { ...row, name: 'Caller supplied' } : row) })],
    ['rating', (value: IBehaviourFrameworkV2Catalogue) => ({ ...value, ratingScale: ['Developing', 'Effective', 'Meets expectations'] as never })],
    ['date', (value: IBehaviourFrameworkV2Catalogue) => ({ ...value, effectiveFrom: '2026-02-31' })]
  ])('fails closed for malformed %s data', (_label, mutate) => {
    const changed = mutate(catalogue());
    expect(inspectBehaviourFrameworkV2Catalogue(changed).valid).toBe(false);
    expect(() => getBehaviourFrameworkV2Choices(changed, 'L1', undefined, new Date('2026-11-01'))).toThrow();
  });

  it('rejects conflicting headline identities from configurable data', () => {
    const rows = APPROVED_BEHAVIOUR_V1_SOURCE_ROWS.map(row => ({ ...row })) as IBehaviourCatalogueSourceRow[];
    rows[1].BehaviourTitle = 'Conflicting title';
    expect(() => createBehaviourFrameworkV2Catalogue(rows, metadata)).toThrow(/Conflicting headline/);
  });
});

describe('BT-04 commitment selection, manager review and readback', () => {
  const controlled = (key: string): IBehaviourFocusTargetSelection =>
    selectBehaviourFrameworkV2Target(catalogue(), 'L1', key, new Date('2026-11-01'), authored);
  const own = (): IBehaviourFocusTargetSelection => createOwnBehaviourFrameworkV2Target({
    selectionKey: 'BHV-05-OWN-ABC123', behaviourKey: 'BHV-05', roleLevelCode: 'L1',
    commitment: 'I will deliver three documented improvements by quarter end.',
    howWillWeKnow: 'Before/after records and owner confirmation show each improvement was used.'
  });

  it('snapshots the exact approved example/version and keeps the own-commitment path distinct', () => {
    const selected = controlled('BHV-01-L1-01');
    const source = catalogue().rows.find(row => row.targetKey === selected.targetKey);
    expect(selected).toEqual(expect.objectContaining({
      selectionKey: 'BHV-01-L1-01', source: 'Catalogue', catalogueVersion: metadata.catalogueVersion,
      focusArea: source?.focusArea, selectedExampleText: source?.suggestedTarget, ...authored
    }));
    expect(own()).toEqual(expect.objectContaining({ source: 'Own', catalogueVersion: 'OWN', focusArea: 'MY COMMITMENT' }));
    expect(own().selectedExampleText).toBeUndefined();
    expect(own().targetKey).toBeUndefined();
    expect(selected).not.toHaveProperty('weight');
    expect(selected).not.toHaveProperty('targetRating');
  });

  it('requires MY COMMITMENT and HOW WILL WE KNOW for catalogue and own paths', () => {
    const incomplete = selectBehaviourFrameworkV2Target(catalogue(), 'L1', 'BHV-01-L1-01', new Date('2026-11-01'));
    expect(inspectBehaviourFrameworkV2Selections([incomplete]).issues.join(' ')).toMatch(/MY COMMITMENT.*HOW WILL WE KNOW/);
    expect(() => createOwnBehaviourFrameworkV2Target({
      selectionKey: 'BHV-05-OWN-ABC123', behaviourKey: 'BHV-05', roleLevelCode: 'L1', commitment: '', howWillWeKnow: ''
    })).toThrow(/MY COMMITMENT/);
    expect(() => selectBehaviourFrameworkV2Target(catalogue(), 'L1', 'BHV-01-L2-01', new Date('2026-11-01'), authored))
      .toThrow(/not an effective choice/);
    expect(inspectBehaviourFrameworkV2Selections([controlled('BHV-01-L1-01'), own()]).valid).toBe(true);
  });

  it('recommends about 3–5 overall but never creates a hard cap', () => {
    const rows = ['BHV-01-L1-01', 'BHV-02-L1-01', 'BHV-03-L1-01', 'BHV-04-L1-01', 'BHV-05-L1-01', 'BHV-05-L1-02'];
    expect(inspectBehaviourFrameworkV2Selections(rows.slice(0, 2).map(controlled))).toEqual(expect.objectContaining({ valid: true, guidance: 'BelowGuidance' }));
    expect(inspectBehaviourFrameworkV2Selections(rows.slice(0, 4).map(controlled))).toEqual(expect.objectContaining({ valid: true, guidance: 'WithinGuidance' }));
    expect(inspectBehaviourFrameworkV2Selections(rows.map(controlled))).toEqual(expect.objectContaining({ valid: true, selectedCount: 6, guidance: 'AboveGuidance' }));
  });

  it('records exact AGREED / CHANGES REQUESTED audit history and rejects malformed review state', () => {
    const selections = [controlled('BHV-01-L1-01'), own()];
    const changed = recordBehaviourFrameworkV2ManagerReview([], selections, {
      reviewKey: 'REVIEW-1', selectionKey: selections[0].selectionKey, status: 'CHANGES REQUESTED',
      comment: 'Make the evidence observable.', actorEmail: 'manager@example.invalid', occurredAt: '2026-10-01T09:00:00.000Z'
    });
    const agreed = recordBehaviourFrameworkV2ManagerReview(changed, selections, {
      reviewKey: 'REVIEW-2', selectionKey: selections[0].selectionKey, status: 'AGREED',
      comment: 'Revised wording agreed.', actorEmail: 'manager@example.invalid', occurredAt: '2026-10-02T09:00:00.000Z'
    });
    expect(agreed.map(row => [row.sequence, row.status])).toEqual([[1, 'CHANGES REQUESTED'], [2, 'AGREED']]);
    expect(BEHAVIOUR_FRAMEWORK_V2_MANAGER_STATUSES).toEqual(['AGREED', 'CHANGES REQUESTED']);
    expect(inspectBehaviourFrameworkV2Reviews(agreed as IBehaviourManagerReviewEvent[], selections)).toEqual([]);
    expect(() => recordBehaviourFrameworkV2ManagerReview([], selections, {
      reviewKey: 'REVIEW-X', selectionKey: selections[0].selectionKey, status: 'CHANGES REQUESTED',
      comment: '', actorEmail: 'manager@example.invalid', occurredAt: '2026-10-01T09:00:00.000Z'
    })).toThrow(/comment/);
  });

  it('binds evidence to selections and D/E/E ratings only to headline Behaviours', () => {
    const selections = [controlled('BHV-01-L1-01'), own()];
    const evidence: IBehaviourFocusQuarterEvidence[] = [{ evidenceKey: 'EV-1', selectionKey: selections[0].selectionKey,
      behaviourKey: 'BHV-01', quarter: 'Q1', evidenceText: 'Two synthetic examples.',
      recordedAt: '2026-12-01T09:00:00.000Z', recordedBy: 'employee@example.invalid' }];
    const assessments: IBehaviourHeadlineQuarterAssessment[] = [{ assessmentKey: 'AS-1', behaviourKey: 'BHV-01', quarter: 'Q1',
      employeeRating: 'Developing', managerRating: 'Effective', finalRating: 'Exceptional' }];
    expect(inspectBehaviourFrameworkV2Evidence(evidence, selections)).toEqual([]);
    expect(inspectBehaviourFrameworkV2Assessments(assessments)).toEqual([]);
    expect(inspectBehaviourFrameworkV2Assessments([{ ...assessments[0], finalRating: 'Meets expectations' as never }])).not.toEqual([]);
    expect(BEHAVIOUR_FRAMEWORK_V2_RATINGS).toEqual(['Developing', 'Effective', 'Exceptional']);
  });

  it('creates immutable Draft/review/history readback without changing caller input', () => {
    const selections = [controlled('BHV-01-L1-01'), own()];
    const reviews = recordBehaviourFrameworkV2ManagerReview([], selections, {
      reviewKey: 'REVIEW-1', selectionKey: selections[0].selectionKey, status: 'AGREED', comment: 'Agreed.',
      actorEmail: 'manager@example.invalid', occurredAt: '2026-10-02T09:00:00.000Z'
    });
    const before = JSON.stringify({ selections, reviews });
    const views = (['Draft', 'Review', 'History'] as const).map(view => buildBehaviourFrameworkV2Readback({
      view, catalogueKey: BEHAVIOUR_FRAMEWORK_V2_CATALOGUE_KEY, catalogueVersion: metadata.catalogueVersion,
      selections, reviews: reviews as IBehaviourManagerReviewEvent[]
    }));
    expect(views.map(row => JSON.stringify(row.selections))).toEqual([JSON.stringify(selections), JSON.stringify(selections), JSON.stringify(selections)]);
    expect(views.map(row => JSON.stringify(row.reviews))).toEqual([JSON.stringify(reviews), JSON.stringify(reviews), JSON.stringify(reviews)]);
    expect(views.every(row => Object.isFrozen(row) && Object.isFrozen(row.selections[0]) && Object.isFrozen(row.reviews[0]))).toBe(true);
    expect(JSON.stringify({ selections, reviews })).toBe(before);
  });
});
