import {
  BEHAVIOUR_FRAMEWORK_V2_VERSION,
  BEHAVIOUR_V2_VALUE_IDS,
  type BehaviourV2Rating,
  type BehaviourV2ValueId
} from '../models/BehaviourFrameworkV2Models';
import type {
  IQuarterEvidenceReference,
  IQuarterReview,
  IQuarterReviewItem,
  QuarterKey
} from '../models/QuarterlyModels';
import { BEHAVIOUR_V2_RATING_OPTIONS } from './BehaviourFrameworkV2Policy';
import {
  buildQuarterPerformanceReadProjection,
  type IQuarterPerformanceReadSource
} from './QuarterPerformanceReadProjection';
import { calculateCapturedQuarterOverallDelivery, snapshotOverallDeliveryWeightConfiguration } from './QuarterOverallDelivery';
import { calculatePerformance } from './PerformanceScoring';
import { buildCapturedQuarterDeliveryView } from './ReportingViewModels';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CapturedQuarterDeliverySummary } from '../components/ReportingViewsPage';

const reviewFor = (personKey: string, quarter: QuarterKey): IQuarterReview => ({
  id: 1,
  etag: '"3"',
  quarterReviewKey: `${personKey}|2026|${quarter}`,
  workplanKey: `${personKey}|2026`,
  personKey,
  employeeDisplayName: personKey,
  employeeEmail: `${personKey}@example.invalid`,
  performanceYear: 2026,
  quarter,
  managerPersonKey: 'manager',
  managerDisplayName: 'Manager',
  managerEmail: 'manager@example.invalid',
  coreCategoryWeightSnapshot: 70,
  personalCategoryWeightSnapshot: 30,
  state: 'Locked',
  accessState: 'ReadOnly',
  transitionStatus: 'Ready',
  managerDecisionComment: `Manager commentary for ${personKey} ${quarter}.`,
  approvedAt: '2026-08-05T10:00:00.000Z',
  lockedAt: '2026-08-05T10:01:00.000Z',
  rowVersionToken: 5
});

const baseItem = (
  review: IQuarterReview,
  workplanItemKey: string,
  itemType: IQuarterReviewItem['itemType']
): IQuarterReviewItem => ({
  id: 1,
  etag: '"2"',
  quarterReviewItemKey: `${review.quarterReviewKey}|${workplanItemKey}`,
  quarterReviewKey: review.quarterReviewKey,
  workplanItemKey,
  workplanKey: review.workplanKey,
  personKey: review.personKey,
  performanceYear: review.performanceYear,
  quarter: review.quarter,
  itemType,
  wording: workplanItemKey,
  calculatedRag: itemType === 'Behaviour' ? 'NotRated' : 'Green',
  evidenceCount: 0,
  managerApproved: true,
  locked: true
});

const coreItem = (review: IQuarterReview): IQuarterReviewItem => ({
  ...baseItem(review, 'core-1', 'CoreGold'),
  reportingStream: 'CoreGold',
  kpiId: 'SO1-001',
  wording: 'Synthetic Core result',
  quarterTargetValue: 100,
  employeeActualValue: 90,
  progressPct: 90,
  scoredProgressPct: 90,
  finalApprovedRag: 'Green',
  contributionWeightSnapshot: 100,
  workplanItemWeightSnapshot: 100
});

const impactItem = (review: IQuarterReview): IQuarterReviewItem => ({
  ...baseItem(review, 'impact-1', 'LocalPersonal'),
  reportingStream: 'Impact',
  wording: 'Synthetic Impact result',
  itemDescription: 'Improve a controlled outcome.',
  measure: 'Completed cases',
  unitLabel: 'cases',
  metricType: 'Count',
  scoringDirection: 'HigherIsBetter',
  yearEndTargetValueSnapshot: 40,
  quarterTargetValue: 10,
  employeeActualValue: 8,
  progressPct: 80,
  scoredProgressPct: 80,
  calculatedRag: 'Amber',
  finalApprovedRag: 'Amber',
  statusUpdate: 'Eight cases delivered.',
  evidenceCount: 1,
  workplanItemWeightSnapshot: 100,
  managerComment: 'Continue the agreed action.',
  managerOverride: {
    rag: 'Amber', reason: 'Evidence confirms current position.', actorPersonKey: 'manager',
    actorEmail: 'manager@example.invalid', overriddenAt: '2026-08-04T10:00:00.000Z'
  },
  impactAnnualDefinitionSnapshot: Object.freeze({
    sourceWorkplanItemKey: 'impact-1', wording: 'Synthetic Impact result', intendedOutcome: 'Improve a controlled outcome.',
    measure: 'Completed cases', unitLabel: 'cases', metricType: 'Count', scoringDirection: 'HigherIsBetter',
    yearEndTargetValue: 40, quarterTargetValue: 10, workplanItemWeight: 100,
    classification: Object.freeze({
      businessContributionArea: Object.freeze({ key: 'area-1', label: 'Synthetic area', source: 'TEST-GOVERNED' })
    })
  })
});

const ratingFor = (personKey: string, quarter: QuarterKey, index: number, lane: 'employee' | 'manager' | 'final'): BehaviourV2Rating => {
  const offset = personKey === 'bob' ? 1 : quarter === 'Q2' ? 2 : 0;
  const laneOffset = lane === 'employee' ? 0 : lane === 'manager' ? 1 : 2;
  return ((index + offset + laneOffset) % 3 + 1) as BehaviourV2Rating;
};

const behaviourItem = (
  review: IQuarterReview,
  valueId: BehaviourV2ValueId,
  index: number
): IQuarterReviewItem => ({
  ...baseItem(review, `behaviour-${index + 1}`, 'Behaviour'),
  reportingStream: 'Behaviour',
  wording: `Synthetic headline ${index + 1}`,
  behaviourId: valueId,
  behaviourVersionKey: BEHAVIOUR_FRAMEWORK_V2_VERSION,
  quarterTargetText: `${review.quarter} stored commitment ${index + 1}`,
  behaviourSnapshotV2: Object.freeze({
    frameworkVersion: BEHAVIOUR_FRAMEWORK_V2_VERSION,
    valueId,
    valueTitle: `Synthetic headline ${index + 1}`,
    corporateValue: `Synthetic corporate value ${index + 1}`,
    roleTier: 'IC_OFFICER',
    descriptor: `Synthetic descriptor ${index + 1}`,
    cadence: 'Quarterly',
    periodKeys: Object.freeze(['Q1', 'Q2', 'Q3', 'Q4'] as const),
    ratingOptions: BEHAVIOUR_V2_RATING_OPTIONS,
    period: review.quarter
  }),
  employeeBehaviourEvidenceV2: `Employee evidence ${review.personKey} ${review.quarter} ${index + 1}`,
  employeeBehaviourAssessmentV2: ratingFor(review.personKey, review.quarter, index, 'employee'),
  managerBehaviourEvidenceV2: `Manager evidence ${review.personKey} ${review.quarter} ${index + 1}`,
  managerBehaviourAssessmentV2: ratingFor(review.personKey, review.quarter, index, 'manager'),
  finalBehaviourEvidenceV2: `Final evidence ${review.personKey} ${review.quarter} ${index + 1}`,
  finalBehaviourAssessmentV2: ratingFor(review.personKey, review.quarter, index, 'final'),
  evidenceCount: 1
});

const evidenceFor = (review: IQuarterReview, item: IQuarterReviewItem): IQuarterEvidenceReference => ({
  evidenceKey: `${item.quarterReviewItemKey}|evidence`,
  kind: 'Link',
  personKey: review.personKey,
  workplanKey: review.workplanKey,
  workplanItemKey: item.workplanItemKey,
  quarterReviewKey: review.quarterReviewKey,
  quarterReviewItemKey: item.quarterReviewItemKey,
  performanceYear: review.performanceYear,
  quarter: review.quarter,
  description: `Evidence for ${item.workplanItemKey}`,
  url: 'https://example.invalid/evidence',
  status: 'Locked'
});

const sourceFor = (personKey: string, quarter: QuarterKey): IQuarterPerformanceReadSource => {
  const review = reviewFor(personKey, quarter);
  const impact = impactItem(review);
  const behaviours = BEHAVIOUR_V2_VALUE_IDS.map((valueId, index) => behaviourItem(review, valueId, index));
  const items = [coreItem(review), impact, ...behaviours];
  const evidence = [evidenceFor(review, impact), ...behaviours.map(item => evidenceFor(review, item))];
  return { review, items, evidence };
};

describe('PM82 captured Core Impact source composition', () => {
  const weightedSource = (coreWeight = 60, impactWeight = 40, coreActual = 90, quarter: QuarterKey = 'Q1', personKey = 'alice'): IQuarterPerformanceReadSource => {
    const source = sourceFor(personKey, quarter);
    source.review.overallDeliveryWeightConfigurationSnapshot = {
      configurationKey: 'SYNTH-CONFIG-2026', configurationVersion: 'SYNTH-V1', coreWeight, impactWeight,
      sourceReference: 'KCF-KPI-Sponsor-PD-01'
    };
    source.items.filter(item => item.itemType !== 'Behaviour').forEach(item => {
      item.metricType = 'Count'; item.scoringDirection = 'HigherIsBetter';
      if (item.itemType === 'CoreGold') item.employeeActualValue = coreActual;
      const scored = calculatePerformance({ metricType: item.metricType, scoringDirection: item.scoringDirection,
        targetValue: item.quarterTargetValue, actualValue: item.employeeActualValue });
      item.calculationRuleVersion = scored.calculationVersion; item.progressPct = scored.rawProgressPct;
      item.scoredProgressPct = scored.scoredProgressPct; item.calculatedRag = scored.calculatedRag;
      item.finalApprovedRag = scored.calculatedRag;
    });
    return source;
  };
  it('shows checked Locked read-only review status', () => {
    const source = weightedSource(); const state = 'Locked';
    const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(view.sourceIdentity).toMatchObject({ state, accessState: 'ReadOnly' });
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain(`<dt>Review status</dt><dd>${state} · Read only</dd>`);
  });
  it('retains the existing aggregation hold for an Approved review that is not yet Locked', () => {
    const source = weightedSource(); source.review.state = 'Approved';
    const view = buildCapturedQuarterDeliveryView(source);
    expect(view.state).toBe('Unavailable');
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('role="status"'); expect(html).not.toContain('<dt>Review status</dt>');
    expect(html).not.toContain('Included result sources:'); expect(html).not.toContain('data-delivery-domain="overall"');
  });
  it('retains checked final status when the original review changes back to editing', () => {
    const source = weightedSource(); const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    source.review.state = 'Draft'; source.review.accessState = 'EmployeeEdit';
    expect(view.sourceIdentity).toMatchObject({ state: 'Locked', accessState: 'ReadOnly' });
    expect(Object.isFrozen(view.sourceIdentity)).toBe(true); expect(view.result.overallScore).toBe(86);
    expect(buildCapturedQuarterDeliveryView(source).state).toBe('Unavailable');
  });
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as QuarterKey[])('counts only included Core and Impact result sources for %s', quarter => {
    const source = weightedSource(60, 40, 90, quarter); const before = JSON.stringify(source);
    const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    ([['core', view.result.core!], ['impact', view.result.impact!]] as const).forEach(([domain, stream]) => {
      expect(stream.sourceResultKeys).toHaveLength(1);
      expect(host.querySelector(`[data-delivery-domain="${domain}"]`)!.textContent)
        .toContain(`Included result sources: ${stream.sourceResultKeys.length}`);
    });
    expect(host.querySelector('[data-delivery-domain="overall"]')!.textContent).not.toContain('Included result sources');
    expect(JSON.stringify(source)).toBe(before);
  });
  it('counts multiple governed Core inputs separately from Impact and Behaviour inputs', () => {
    const source = weightedSource(); const first = source.items.find(item => item.itemType === 'CoreGold')!;
    first.contributionWeightSnapshot = 50; first.workplanItemWeightSnapshot = 50;
    source.items.push({ ...first, id: 2, workplanItemKey: 'core-2',
      quarterReviewItemKey: `${source.review.quarterReviewKey}|core-2`, kpiId: 'SO1-002', wording: 'Second synthetic Core result' });
    const before = JSON.stringify(source); const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(view.result.core!.sourceResultKeys).toHaveLength(2); expect(view.result.impact!.sourceResultKeys).toHaveLength(1);
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(host.querySelector('[data-delivery-domain="core"]')!.textContent).toContain('Included result sources: 2');
    expect(host.querySelector('[data-delivery-domain="impact"]')!.textContent).toContain('Included result sources: 1');
    expect(host.querySelectorAll('[data-provenance-domain="core"] li')).toHaveLength(2);
    expect(view.result.overallScore).toBe(86); expect(JSON.stringify(source)).toBe(before);
  });
  it.each(['Draft', 'editing', 'missing weights'])('withholds final status and source counts for unavailable %s input', kind => {
    const source = weightedSource();
    if (kind === 'Draft') source.review.state = 'Draft';
    else if (kind === 'editing') source.review.accessState = 'EmployeeEdit';
    else source.review.overallDeliveryWeightConfigurationSnapshot = undefined;
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('role="status"'); expect(html).not.toContain('<dt>Review status</dt>');
    expect(html).not.toContain('Included result sources:');
  });
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as QuarterKey[])('identifies checked %s source year and review version alongside Delivery', quarter => {
    const source = weightedSource(60, 40, 90, quarter); const before = JSON.stringify(source);
    const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(view.sourceIdentity).toEqual({ performanceYear: 2026, quarter, quarterReviewKey: `alice|2026|${quarter}`, rowVersionToken: 5,
      approvedAt: '2026-08-05T10:00:00.000Z', lockedAt: '2026-08-05T10:01:00.000Z', state: 'Locked', accessState: 'ReadOnly' });
    expect(JSON.stringify(source)).toBe(before);
  });
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as QuarterKey[])('renders selected %s period and checked source identity', quarter => {
    const source = weightedSource(60, 40, 90, quarter);
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('<dt>Reporting period</dt><dd>2026 · ' + quarter + '</dd>');
    expect(html).toContain('<dt>Review source</dt><dd>alice|2026|' + quarter + '</dd>');
    expect(html).toContain('<dt>Review version</dt><dd>5</dd>');
    expect(html).toContain('data-delivery-domain="overall"');
  });
  it('detaches and freezes checked identity while retaining the calculated result after source mutation', () => {
    const source = weightedSource(); const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(Object.isFrozen(view.sourceIdentity)).toBe(true);
    source.review.performanceYear = 2027; source.review.quarter = 'Q4'; source.review.quarterReviewKey = 'mutated'; source.review.rowVersionToken = 6;
    expect(view.sourceIdentity).toEqual({ performanceYear: 2026, quarter: 'Q1', quarterReviewKey: 'alice|2026|Q1', rowVersionToken: 5,
      approvedAt: '2026-08-05T10:00:00.000Z', lockedAt: '2026-08-05T10:01:00.000Z', state: 'Locked', accessState: 'ReadOnly' });
    expect(view.result.overallScore).toBe(86);
  });
  it.each(['Draft', 'malformed'])('withholds source identity from unavailable %s Delivery', kind => {
    const source = weightedSource();
    if (kind === 'Draft') source.review.state = 'Draft'; else Object.assign(source, { review: null });
    const view = buildCapturedQuarterDeliveryView(source);
    expect(view.state).toBe('Unavailable'); expect(Object.prototype.hasOwnProperty.call(view, 'sourceIdentity')).toBe(false);
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('role="status"'); expect(html).not.toContain('<dt>Reporting period</dt>');
    expect(html).not.toContain('data-delivery-domain="overall"');
  });
  it('retains valid captured source fields explicitly set to undefined', () => {
    const source = weightedSource();
    source.review.managerDecisionComment = undefined;
    const view = buildCapturedQuarterDeliveryView(source);
    expect(view.state).toBe('Ready');
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(view.result.overallScore).toBe(86);
    expect(view.result.weights.configurationVersion).toBe('SYNTH-V1');
  });
  describe.each(['approvedAt', 'lockedAt'])('%s captured review history', field => {
    it.each(['not a timestamp', {}, 42, null])('withholds malformed optional history timestamp %s', invalid => {
      const source = weightedSource(); Object.assign(source.review, { [field]: invalid });
      const view = buildCapturedQuarterDeliveryView(source);
      expect(view.state).toBe('Unavailable');
      const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
      expect(html).toContain('role="status"'); expect(html).not.toContain('data-delivery-domain="overall"');
    });
  });
  it('detaches recorded approval and lock timestamps without rewriting the captured source', () => {
    const source = weightedSource(); const before = JSON.stringify(source);
    const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(view.sourceIdentity).toMatchObject({ approvedAt: '2026-08-05T10:00:00.000Z', lockedAt: '2026-08-05T10:01:00.000Z' });
    expect(JSON.stringify(source)).toBe(before);
    source.review.approvedAt = '2026-08-06T10:00:00.000Z'; source.review.lockedAt = undefined;
    expect(view.sourceIdentity).toMatchObject({ approvedAt: '2026-08-05T10:00:00.000Z', lockedAt: '2026-08-05T10:01:00.000Z' });
    expect(Object.isFrozen(view.sourceIdentity)).toBe(true); expect(view.result.overallScore).toBe(86);
  });
  it('renders recorded approval and lock times using the existing UK timestamp formatter', () => {
    const source = weightedSource(); const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    const expected = ['2026-08-05T10:00:00.000Z', '2026-08-05T10:01:00.000Z'].map(value => new Date(value).toLocaleString('en-GB', { timeZone: 'Europe/London' }));
    ['Approval recorded', 'Lock recorded'].forEach((label, index) => {
      const term = Array.from(host.querySelectorAll('dt')).find(item => item.textContent === label)!;
      expect(term).toBeDefined(); expect(term.nextElementSibling!.textContent).toBe(expected[index]);
    });
  });
  it.each([undefined, ''])('preserves unavailable optional approval/lock history %s', timestamp => {
    const source = weightedSource(); source.review.approvedAt = timestamp; source.review.lockedAt = timestamp;
    const view = buildCapturedQuarterDeliveryView(source); expect(view.state).toBe('Ready');
    const host = document.createElement('div'); host.innerHTML = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    for (const label of ['Approval recorded', 'Lock recorded']) {
      const term = Array.from(host.querySelectorAll('dt')).find(item => item.textContent === label)!;
      expect(term).toBeDefined(); expect(term.nextElementSibling!.textContent).toBe('Not available');
    }
    expect(host.querySelector('[data-delivery-domain="overall"]')).not.toBeNull();
  });
  it('retains equivalent textual offset history without inventing approval/lock ordering policy', () => {
    const source = weightedSource(); source.review.approvedAt = '2026-08-05T11:00:00.000+01:00'; source.review.lockedAt = '2026-08-05T10:00:00.000+01:00';
    const view = buildCapturedQuarterDeliveryView(source);
    expect(view.state).toBe('Ready');
  });
  it.each(['approvedAt', 'lockedAt'])('rejects history %s accessors without calling them', field => {
    const source = weightedSource(); const getter = jest.fn(() => '2026-08-05T10:00:00.000Z');
    Object.defineProperty(source.review, field, { enumerable: true, configurable: true, get: getter });
    expect(buildCapturedQuarterDeliveryView(source).state).toBe('Unavailable');
    expect(getter).not.toHaveBeenCalled();
  });
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as QuarterKey[])('renders exact calculation provenance and source lists for %s', quarter => {
    const source = weightedSource(60, 40, 90, quarter); const before = JSON.stringify(source);
    const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    const details = host.querySelector('details')!;
    expect(details).not.toBeNull(); expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('Calculation provenance');
    expect(details.querySelector('[data-projection-identity]')!.textContent).toBe(view.result.projectionIdentity);
    for (const [domain, stream] of [['core', view.result.core!], ['impact', view.result.impact!]] as const) {
      const block = details.querySelector(`[data-provenance-domain="${domain}"]`)!;
      expect(Array.from(block.querySelectorAll('li')).map(item => item.textContent)).toEqual(stream.sourceResultKeys);
      expect(block.textContent).toContain(stream.scoreCalculationVersion);
      expect(block.textContent).toContain(stream.aggregationCalculationVersion);
    }
    expect(details.querySelector('[data-provenance-domain="behaviour"]')).toBeNull();
    expect(JSON.stringify(source)).toBe(before);
  });
  it('escapes synthetic source references while keeping exact readable provenance text', () => {
    const source = weightedSource(60, 40, 90, 'Q1', 'synthetic<b>&quoted');
    const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    const host = document.createElement('div'); host.innerHTML = html;
    expect(host.querySelector('b')).toBeNull();
    const keys = Array.from(host.querySelectorAll('details li')).map(item => item.textContent);
    expect(keys).toEqual([...view.result.core!.sourceResultKeys, ...view.result.impact!.sourceResultKeys]);
    expect(keys.length).toBeGreaterThan(0);
    expect(html).toContain('&lt;b&gt;&amp;quoted');
  });
  it('renders changed historical configuration provenance without changing the earlier source', () => {
    const earlier = weightedSource(); const later = weightedSource(70, 30);
    later.review.overallDeliveryWeightConfigurationSnapshot = { ...later.review.overallDeliveryWeightConfigurationSnapshot!, configurationVersion: 'SYNTH-V2' };
    const first = buildCapturedQuarterDeliveryView(earlier); const second = buildCapturedQuarterDeliveryView(later);
    if (first.state !== 'Ready' || second.state !== 'Ready') throw new Error('Expected checked sources');
    expect(second.result.projectionIdentity).not.toBe(first.result.projectionIdentity);
    const host = document.createElement('div'); host.innerHTML = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source: later }));
    expect(host.querySelector('[data-projection-identity]')!.textContent).toBe(second.result.projectionIdentity);
    expect(host.textContent).toContain('SYNTH-V2');
    expect(first.result.overallScore).toBe(86); expect(second.result.overallScore).toBe(87);
    expect(earlier.review.overallDeliveryWeightConfigurationSnapshot!.configurationVersion).toBe('SYNTH-V1');
  });
  it.each(['Draft', 'missing configuration'])('withholds calculation provenance for unavailable %s source', kind => {
    const source = weightedSource();
    if (kind === 'Draft') source.review.state = 'Draft'; else source.review.overallDeliveryWeightConfigurationSnapshot = undefined;
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('role="status"'); expect(html).not.toContain('Calculation provenance');
    expect(html).not.toContain('data-projection-identity'); expect(html).not.toContain('data-provenance-domain');
  });
  it.each([
    ['configured', 60, 40, 90, 54, 32, 86],
    ['default', 70, 30, 90, 63, 24, 87],
    ['poor Core', 70, 30, 10, 7, 24, 31],
    ['zero Core weight', 0, 100, 90, 0, 80, 80],
    ['zero Impact weight', 100, 0, 90, 90, 0, 90],
    ['fractional weights', 67.5, 32.5, 90, 60.75, 26, 86.75]
  ])('renders checked stream classifications and contributions for %s', (_label, coreWeight, impactWeight, actual, coreContribution, impactContribution, overall) => {
    const source = weightedSource(coreWeight as number, impactWeight as number, actual as number);
    const before = JSON.stringify(source); const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(view.result.core!.weightedContribution).toBe(coreContribution);
    expect(view.result.impact!.weightedContribution).toBe(impactContribution);
    expect(view.result.overallScore).toBe(overall);
    const host = document.createElement('div');
    host.innerHTML = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    for (const [domain, result] of [['core', view.result.core!], ['impact', view.result.impact!]] as const) {
      const article = host.querySelector(`[data-delivery-domain="${domain}"]`)!;
      expect(article.textContent).toContain(`Classification: ${result.authoritativeRag}`);
      expect(article.textContent).toContain(`Weighted contribution: ${result.weightedContribution}`);
      expect(article.querySelector('[data-rag]')!.getAttribute('data-rag')).toBe(result.authoritativeRag);
    }
    const overallArticle = host.querySelector('[data-delivery-domain="overall"]')!;
    expect(overallArticle.textContent).toContain('Score only; no Overall Delivery band');
    expect(overallArticle.querySelector('[data-rag]')).toBeNull();
    expect(host.textContent).toContain('Reporting period2026 · Q1');
    expect(JSON.stringify(source)).toBe(before);
  });
  it('preserves poor-Core protection and withheld exceptional outcome while displaying the governed streams', () => {
    const source = weightedSource(70, 30, 10); const view = buildCapturedQuarterDeliveryView(source);
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(view.result.coreProtectionApplied).toBe(true); expect(view.result.exceptionalOutcomePermitted).toBe(false);
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('Poor Core protection applies.');
    expect(html).toContain('Behaviours remain separate and are excluded from Delivery arithmetic.');
  });
  it.each(['Draft', 'missing weights'])('withholds stream classification and contribution for unavailable %s input', kind => {
    const source = weightedSource();
    if (kind === 'Draft') source.review.state = 'Draft'; else source.review.overallDeliveryWeightConfigurationSnapshot = undefined;
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('role="status"'); expect(html).not.toContain('Classification:');
    expect(html).not.toContain('Weighted contribution:'); expect(html).not.toContain('data-rag=');
  });
  it.each(['review', 'overallDeliveryWeightConfigurationSnapshot', 'transitionStatus', 'performanceYear'])(
    'does not invoke the captured source %s accessor while rendering Delivery', field => {
      const source = weightedSource();
      const target = field === 'review' ? source : source.review;
      const original = (target as unknown as Record<string, unknown>)[field];
      const getter = jest.fn(() => original);
      Object.defineProperty(target, field, { enumerable: true, configurable: true, get: getter });
      expect(buildCapturedQuarterDeliveryView(source).state).toBe('Unavailable');
      expect(getter).not.toHaveBeenCalled();
      expect(() => renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }))).not.toThrow();
      expect(getter).not.toHaveBeenCalled();
    });
  it.each([undefined, null])('renders an unavailable status for a malformed captured review %s', review => {
    const source = weightedSource(); Object.assign(source, { review });
    expect(() => buildCapturedQuarterDeliveryView(source)).not.toThrow();
    expect(buildCapturedQuarterDeliveryView(source).state).toBe('Unavailable');
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('role="status"');
    expect(html).not.toContain('data-delivery-domain="overall"');
  });
  it.each([
    ['in-progress transition', { transitionStatus: 'InProgress' }],
    ['failed transition', { transitionStatus: 'Failed' }],
    ['unknown transition', { transitionStatus: 'Unsupported' }],
    ['absent transition', { transitionStatus: undefined }],
    ['employee edit access', { accessState: 'EmployeeEdit' }],
    ['manager decision access', { accessState: 'ManagerDecision' }],
    ['recovery hold access', { accessState: 'RecoveryHold' }]
  ])('withholds final Delivery for %s without rendering an Overall score', (_label, patch) => {
    const source = weightedSource(); Object.assign(source.review, patch);
    expect(buildCapturedQuarterDeliveryView(source).state).toBe('Unavailable');
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).not.toContain('data-delivery-domain="overall"');
    expect(html).not.toContain('86');
  });
  it('uses captured configurable weights and renders Core, Impact and Overall together without a band', () => {
    const source = weightedSource();
    const view = buildCapturedQuarterDeliveryView(source);
    expect(view.state).toBe('Ready');
    if (view.state !== 'Ready') throw new Error(view.message);
    expect(view.result.core?.score).toBe(90); expect(view.result.impact?.score).toBe(80);
    expect(view.result.overallScore).toBe(86);
    const html = renderToStaticMarkup(React.createElement(CapturedQuarterDeliverySummary, { source }));
    expect(html).toContain('60% configured weight'); expect(html).toContain('40% configured weight');
    expect(html).toContain('data-delivery-domain="core"'); expect(html).toContain('data-delivery-domain="impact"');
    expect(html).toContain('data-delivery-domain="overall"'); expect(html).toContain('no Overall Delivery band');
    expect(html).toContain('Behaviours remain separate'); expect(html).toContain('SYNTH-V1');
  });
  it('preserves PD-04 poor-Core protection and excludes every Behaviour rating from arithmetic', () => {
    const source = weightedSource(70, 30, 10);
    const first = buildCapturedQuarterDeliveryView(source);
    if (first.state !== 'Ready') throw new Error(first.message);
    expect(first.result.overallScore).toBe(31); expect(first.result.coreProtectionState).toBe('Poor');
    expect(first.result.exceptionalOutcomePermitted).toBe(false);
    source.items.filter(item => item.itemType === 'Behaviour').forEach(item => { item.finalBehaviourAssessmentV2 = 3; });
    const changed = buildCapturedQuarterDeliveryView(source);
    if (changed.state !== 'Ready') throw new Error(changed.message);
    expect(changed.result.overallScore).toBe(first.result.overallScore);
  });
  it('retains historical weights and changes projection identity for a changed configuration version', () => {
    const source = weightedSource();
    const projected = buildQuarterPerformanceReadProjection(2026, [source]);
    source.review.overallDeliveryWeightConfigurationSnapshot = { ...source.review.overallDeliveryWeightConfigurationSnapshot!,
      configurationVersion: 'SYNTH-V2', coreWeight: 70, impactWeight: 30 };
    const later = buildQuarterPerformanceReadProjection(2026, [source]);
    expect(later.projectionIdentity).not.toBe(projected.projectionIdentity);
    expect(calculateCapturedQuarterOverallDelivery(projected).weights.configurationVersion).toBe('SYNTH-V1');
    expect(calculateCapturedQuarterOverallDelivery(projected).overallScore).toBe(86);
    expect(calculateCapturedQuarterOverallDelivery(later).overallScore).toBe(87);
  });
  it('does not default missing native configuration, accept totals other than 100, or mix historical versions', () => {
    expect(buildCapturedQuarterDeliveryView(sourceFor('alice', 'Q1')).state).toBe('Unavailable');
    expect(buildCapturedQuarterDeliveryView(weightedSource(70, 20)).state).toBe('Unavailable');
    expect(() => snapshotOverallDeliveryWeightConfiguration(weightedSource(70, 20).review.overallDeliveryWeightConfigurationSnapshot!)).toThrow(/100/);
    const a = weightedSource(); const b = weightedSource(70, 30);
    b.review.quarterReviewKey = 'bob|2026|Q1'; b.review.workplanKey = 'bob|2026'; b.review.personKey = 'bob';
    // A separate complete source carries the second configuration; no copied review identity is trusted.
    const other = sourceFor('bob', 'Q1'); other.review.overallDeliveryWeightConfigurationSnapshot = b.review.overallDeliveryWeightConfigurationSnapshot;
    const projection = buildQuarterPerformanceReadProjection(2026, [a, other]);
    expect(() => calculateCapturedQuarterOverallDelivery(projection)).toThrow(/different captured configurations/);
  });
  it('retains taxonomy identity/version through reporting and keeps annual Target distinct from quarterly Actual', () => {
    const source = weightedSource(); const item = source.items.find(row => row.itemType === 'LocalPersonal')!;
    const classification = { businessContributionArea: { key: 'area-1', label: 'Original governed area', source: 'TEST-GOVERNED',
      taxonomyId: 'SYNTH-PD02', taxonomyVersion: 'v1', taxonomyEtag: '"1"', taxonomyApprovalReference: 'KCF-KPI-Sponsor-PD-02' as const } };
    item.impactAnnualDefinitionSnapshot = { ...item.impactAnnualDefinitionSnapshot!, classification };
    const projected = buildQuarterPerformanceReadProjection(2026, [source]);
    classification.businessContributionArea.label = 'Renamed future area'; classification.businessContributionArea.taxonomyVersion = 'v2';
    const retained = projected.impact.results[0].item;
    expect(retained.impactAnnualDefinitionSnapshot?.classification?.businessContributionArea).toMatchObject({
      label: 'Original governed area', taxonomyId: 'SYNTH-PD02', taxonomyVersion: 'v1', taxonomyEtag: '"1"' });
    expect(retained.impactAnnualDefinitionSnapshot?.yearEndTargetValue).toBe(40);
    expect(retained.quarterTargetValue).toBe(10); expect(retained.employeeActualValue).toBe(8);
  });
});

describe('QuarterPerformanceReadProjection', () => {
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('preserves %s history at the governed TwiceYearly Behaviour period', quarter => {
    const source = sourceFor('alice', quarter);
    const period = quarter === 'Q1' || quarter === 'Q2' ? 'H1' : 'H2';
    source.items.filter(item => item.itemType === 'Behaviour').forEach(item => {
      item.behaviourSnapshotV2 = { ...item.behaviourSnapshotV2!, cadence: 'TwiceYearly',
        period, periodKeys: ['H1', 'H2'] };
    });
    const projection = buildQuarterPerformanceReadProjection(2026, [source]);
    expect(projection.behaviourObservations).toHaveLength(5);
    expect(projection.behaviourObservations.every(observation => observation.period === period)).toBe(true);
    expect(projection.impact.results[0].quarter).toBe(quarter);
  });
  it.each([
    ['Q1', 'Quarterly', 'Q2'], ['Q2', 'Quarterly', 'Q1'],
    ['Q3', 'Quarterly', 'Q4'], ['Q4', 'Quarterly', 'Q3'],
    ['Q1', 'TwiceYearly', 'H2'], ['Q2', 'TwiceYearly', 'H2'],
    ['Q3', 'TwiceYearly', 'H1'], ['Q4', 'TwiceYearly', 'H1']
  ] as const)('rejects %s history crossed into %s Behaviour period %s', (quarter, cadence, period) => {
    const source = sourceFor('alice', quarter);
    source.items.filter(item => item.itemType === 'Behaviour').forEach(item => {
      item.behaviourSnapshotV2 = { ...item.behaviourSnapshotV2!, cadence, period,
        periodKeys: cadence === 'Quarterly' ? ['Q1', 'Q2', 'Q3', 'Q4'] : ['H1', 'H2'] };
    });
    expect(() => buildQuarterPerformanceReadProjection(2026, [source])).toThrow();
  });
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('retains a valid supplied Workplan key and %s history', quarter => {
    const source = sourceFor('alice', quarter);
    const workplanKey = `SYNTH-WORKPLAN-${quarter}`;
    const quarterReviewKey = `${workplanKey}|${quarter}`;
    Object.assign(source.review, { workplanKey, quarterReviewKey, rowVersionToken: Number.MAX_SAFE_INTEGER });
    source.items.forEach(item => Object.assign(item, { workplanKey, quarterReviewKey,
      quarterReviewItemKey: `${quarterReviewKey}|${item.workplanItemKey}` }));
    source.evidence.forEach(reference => Object.assign(reference, { workplanKey, quarterReviewKey,
      quarterReviewItemKey: `${quarterReviewKey}|${reference.workplanItemKey}` }));
    const projection = buildQuarterPerformanceReadProjection(2026, [source]);
    expect(projection.core.results[0].quarterReviewKey).toBe(quarterReviewKey);
    expect(projection.impact.results[0].item.workplanKey).toBe(workplanKey);
    expect(projection.impact.results[0].quarter).toBe(quarter);
  });
  it.each([
    ['unsupported quarter', { quarter: 'Q5' }],
    ['absent quarter', { quarter: undefined }],
    ['crossed review key', { quarterReviewKey: 'bob|2026|Q1' }],
    ['blank review key', { quarterReviewKey: '' }],
    ['blank Workplan key', { workplanKey: ' ' }],
    ['blank person key', { personKey: ' ' }],
    ['zero stored version', { rowVersionToken: 0 }],
    ['negative stored version', { rowVersionToken: -1 }],
    ['fractional stored version', { rowVersionToken: 1.5 }],
    ['unsafe stored version', { rowVersionToken: Number.MAX_SAFE_INTEGER + 1 }],
    ['unsafe year', { performanceYear: Number.MAX_SAFE_INTEGER + 1 }]
  ])('rejects %s before issuing a quarter read projection', (_label, patch) => {
    const source = sourceFor('alice', 'Q1');
    Object.assign(source.review, patch);
    // Rebind child rows to the supplied header: matching children alone must
    // not turn an invalid stored review identity into an issued projection.
    source.items.forEach(item => Object.assign(item, {
      quarterReviewKey: source.review.quarterReviewKey,
      quarterReviewItemKey: `${source.review.quarterReviewKey}|${item.workplanItemKey}`,
      workplanKey: source.review.workplanKey, personKey: source.review.personKey,
      performanceYear: source.review.performanceYear, quarter: source.review.quarter
    }));
    source.evidence.forEach(reference => Object.assign(reference, {
      quarterReviewKey: source.review.quarterReviewKey,
      quarterReviewItemKey: `${source.review.quarterReviewKey}|${reference.workplanItemKey}`,
      workplanKey: source.review.workplanKey, personKey: source.review.personKey,
      performanceYear: source.review.performanceYear, quarter: source.review.quarter
    }));
    expect(() => buildQuarterPerformanceReadProjection(source.review.performanceYear, [source])).toThrow();
  });
  it('keeps Core, Impact and Behaviour structurally separate with exact D/E/E cardinalities', () => {
    const aliceQ1 = sourceFor('alice', 'Q1');
    const bobQ1 = sourceFor('bob', 'Q1');
    bobQ1.items[2] = { ...bobQ1.items[2], employeeBehaviourAssessmentV2: undefined };
    const aliceQ2 = sourceFor('alice', 'Q2');
    const projection = buildQuarterPerformanceReadProjection(2026, [aliceQ1, bobQ1, aliceQ2]);

    expect(projection.core).toEqual(expect.objectContaining({ stream: 'CoreGold' }));
    expect(projection.impact).toEqual(expect.objectContaining({ stream: 'Impact' }));
    expect(projection.core.results).toHaveLength(3);
    expect(projection.impact.results).toHaveLength(3);
    expect(projection.core.results[0].categoryWeightSnapshot).toBe(70);
    expect(projection.impact.results[0].categoryWeightSnapshot).toBe(30);
    expect(projection.core.results[0].item.scoredProgressPct).toBe(90);
    expect(projection.impact.results[0].item.scoredProgressPct).toBe(80);
    expect(projection.impact.results[0].supportingEvidence).toHaveLength(1);
    expect(projection).not.toHaveProperty('overallDelivery');
    expect(projection).not.toHaveProperty('impactEffect');

    expect(projection.behaviourObservations).toHaveLength(15);
    expect(projection.behaviourObservations[0]).not.toHaveProperty('calculatedRag');
    expect(projection.behaviourObservations[0]).not.toHaveProperty('employeeBehaviourAssessmentV2');
    expect(projection.behaviourDistributions).toHaveLength(10);
    const q1Bhv1 = projection.behaviourDistributions.find(row => row.period === 'Q1' && row.headlineId === 'BHV-01')!;
    expect(q1Bhv1.employee).toEqual({ Developing: 1, Effective: 0, Exceptional: 0, unassessed: 1, total: 2 });
    expect(q1Bhv1.manager).toEqual({ Developing: 0, Effective: 1, Exceptional: 1, unassessed: 0, total: 2 });
    expect(q1Bhv1.final).toEqual({ Developing: 1, Effective: 0, Exceptional: 1, unassessed: 0, total: 2 });
    expect(q1Bhv1).not.toHaveProperty('average');
    expect(q1Bhv1).not.toHaveProperty('rag');
    projection.behaviourDistributions.forEach(row => {
      expect(row.employee.Developing + row.employee.Effective + row.employee.Exceptional + row.employee.unassessed)
        .toBe(row.employee.total);
    });
  });

  it('produces a deterministic immutable identity covering exact Core, Impact, Behaviour and manager content', () => {
    const first = buildQuarterPerformanceReadProjection(2026, [sourceFor('alice', 'Q1')]);
    const repeated = buildQuarterPerformanceReadProjection(2026, [sourceFor('alice', 'Q1')]);
    expect(first.projectionIdentity).toMatch(/^[A-F0-9]{64}$/);
    expect(repeated.projectionIdentity).toBe(first.projectionIdentity);
    expect(first.managerCompositionInputs[0].projectionIdentity).toBe(first.projectionIdentity);

    const changedCore = sourceFor('alice', 'Q1');
    changedCore.items[0] = { ...changedCore.items[0], employeeActualValue: 99, scoredProgressPct: 99 };
    expect(buildQuarterPerformanceReadProjection(2026, [changedCore]).projectionIdentity)
      .not.toBe(first.projectionIdentity);

    const changedImpactEvidence = sourceFor('alice', 'Q1');
    changedImpactEvidence.evidence[0] = { ...changedImpactEvidence.evidence[0], description: 'Different Impact evidence.' };
    expect(buildQuarterPerformanceReadProjection(2026, [changedImpactEvidence]).projectionIdentity)
      .not.toBe(first.projectionIdentity);

    const changedBehaviour = sourceFor('alice', 'Q1');
    changedBehaviour.items[2] = {
      ...changedBehaviour.items[2],
      finalBehaviourAssessmentV2: 1,
      finalBehaviourEvidenceV2: 'Different final Behaviour evidence.'
    };
    expect(buildQuarterPerformanceReadProjection(2026, [changedBehaviour]).projectionIdentity)
      .not.toBe(first.projectionIdentity);

    const changedManager = sourceFor('alice', 'Q1');
    changedManager.review.managerDecisionComment = 'Different manager commentary.';
    expect(buildQuarterPerformanceReadProjection(2026, [changedManager]).projectionIdentity)
      .not.toBe(first.projectionIdentity);
  });

  it('emits label-only period movement inputs and preserves history/evidence/manager inputs immutably', () => {
    const aliceQ1 = sourceFor('alice', 'Q1');
    const aliceQ2 = sourceFor('alice', 'Q2');
    const selectedCommitment = {
      selectionKey: 'alice|2026|selection-1',
      catalogueIdentity: {
        decisionReference: 'KCF-KPI-Sponsor-BEH-V1-001' as const,
        catalogueVersion: '2026.1',
        contentHash: 'a'.repeat(64),
        sourceReference: 'synthetic-catalogue.json',
        effectiveFrom: '2026-04-01T00:00:00.000Z'
      },
      headlineId: 'BHV-01' as const,
      roleTier: 'IC_OFFICER' as const,
      focusAreaKey: 'focus-1',
      focusAreaTitle: 'Synthetic focus',
      selectionPath: 'OwnTarget' as const,
      targetTextSnapshot: 'Synthetic stored target',
      myCommitment: 'My measurable commitment',
      howWillWeKnow: 'Observable evidence'
    };
    aliceQ1.items[2] = { ...aliceQ1.items[2], behaviourCommitmentSnapshotsV1: [selectedCommitment] };
    const projection = buildQuarterPerformanceReadProjection(2026, [aliceQ1, aliceQ2]);
    expect(projection.behaviourMovementInputs).toHaveLength(15);
    expect(projection.behaviourMovementInputs.find(input => input.headlineId === 'BHV-01' && input.lane === 'Employee'))
      .toEqual(expect.objectContaining({
        fromPeriod: 'Q1', toPeriod: 'Q2', fromRating: 'Developing', toRating: 'Exceptional'
      }));
    projection.behaviourMovementInputs.forEach(input => {
      expect(input).not.toHaveProperty('delta');
      expect(input).not.toHaveProperty('score');
    });
    expect(projection.behaviourObservations[0].supportingEvidence).toHaveLength(1);
    expect(projection.behaviourObservations[0].selectedCommitments![0].myCommitment).toBe('My measurable commitment');
    expect(projection.managerCompositionInputs[0]).toEqual(expect.objectContaining({
      managerCommentary: 'Manager commentary for alice Q1.'
    }));
    expect(projection.managerCompositionInputs[0].itemActions[0]).toEqual(expect.objectContaining({
      managerComment: 'Continue the agreed action.', managerOverride: expect.objectContaining({ rag: 'Amber' })
    }));

    aliceQ1.review.managerDecisionComment = 'Mutated after projection';
    aliceQ1.items[1].statusUpdate = 'Mutated after projection';
    aliceQ1.evidence[0].description = 'Mutated after projection';
    selectedCommitment.myCommitment = 'Mutated after projection';
    expect(projection.managerCompositionInputs[0].managerCommentary).toBe('Manager commentary for alice Q1.');
    expect(projection.impact.results[0].item.statusUpdate).toBe('Eight cases delivered.');
    expect(projection.impact.results[0].supportingEvidence[0].description).toBe('Evidence for impact-1');
    expect(projection.behaviourObservations[0].selectedCommitments![0].myCommitment).toBe('My measurable commitment');
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.behaviourDistributions[0].employee)).toBe(true);
  });

  it('fails closed on crossed streams, incomplete identities, Behaviour arithmetic, invalid ratings and evidence', () => {
    const crossedCore = sourceFor('alice', 'Q1');
    crossedCore.items[0] = { ...crossedCore.items[0], reportingStream: 'Impact' };
    expect(() => buildQuarterPerformanceReadProjection(2026, [crossedCore])).toThrow(/Core result is crossed/);

    const missingHeadline = sourceFor('alice', 'Q1');
    missingHeadline.items = missingHeadline.items.filter(item => item.behaviourId !== 'BHV-05');
    missingHeadline.evidence = missingHeadline.evidence.filter(item => item.workplanItemKey !== 'behaviour-5');
    expect(() => buildQuarterPerformanceReadProjection(2026, [missingHeadline])).toThrow(/exactly the five approved/);

    const arithmetic = sourceFor('alice', 'Q1');
    arithmetic.items[2] = { ...arithmetic.items[2], calculatedRag: 'Green', progressPct: 100 };
    expect(() => buildQuarterPerformanceReadProjection(2026, [arithmetic])).toThrow(/rejects RAG, weight, score/);

    const invalidRating = sourceFor('alice', 'Q1');
    invalidRating.items[2] = { ...invalidRating.items[2], managerBehaviourAssessmentV2: 4 as unknown as BehaviourV2Rating };
    expect(() => buildQuarterPerformanceReadProjection(2026, [invalidRating])).toThrow(/Developing, Effective or Exceptional/);

    const unapprovedIdentity = sourceFor('alice', 'Q1');
    unapprovedIdentity.items[2] = {
      ...unapprovedIdentity.items[2],
      behaviourId: 'BHV-99',
      behaviourSnapshotV2: { ...unapprovedIdentity.items[2].behaviourSnapshotV2!, valueId: 'BHV-99' as BehaviourV2ValueId }
    };
    expect(() => buildQuarterPerformanceReadProjection(2026, [unapprovedIdentity])).toThrow(/exactly the five approved/);

    const crossedEvidence = sourceFor('alice', 'Q1');
    crossedEvidence.evidence[0] = { ...crossedEvidence.evidence[0], personKey: 'other' };
    expect(() => buildQuarterPerformanceReadProjection(2026, [crossedEvidence])).toThrow(/evidence is crossed/);

    const missingImpactSnapshot = sourceFor('alice', 'Q1');
    missingImpactSnapshot.items[1] = { ...missingImpactSnapshot.items[1], impactAnnualDefinitionSnapshot: undefined };
    expect(() => buildQuarterPerformanceReadProjection(2026, [missingImpactSnapshot])).toThrow(/annual definition\/classification snapshot/);
  });
});


describe('annual planning read projection provenance', () => {
  const annualSource = (): IQuarterPerformanceReadSource => {
    const source = sourceFor('alice', 'Q1');
    source.review.workplanApprovalCorrelationKey = 'annual-approval-1';
    source.items = source.items.map(item => item.itemType !== 'Behaviour' ? item : ({
      ...item, behaviourAnnualCurrentLevelV2: 'Developing', behaviourAnnualTargetLevelV2: 'Effective',
      behaviourAnnualTargetJustificationV2: 'Approved annual development plan.',
      behaviourAnnualTargetSourceWorkplanItemKeyV2: item.workplanItemKey,
      behaviourAnnualTargetSourceEtagV2: '"annual-1"', behaviourAnnualTargetSourceWorkplanVersionV2: 1,
      behaviourAnnualTargetSourceApprovalKeyV2: 'annual-approval-1'
    }));
    return source;
  };
  it('detaches seven validated annual fields and includes provenance in projection identity', () => {
    const source = annualSource();
    const projection = buildQuarterPerformanceReadProjection(2026, [source]);
    expect(projection.behaviourObservations).toHaveLength(5);
    expect(projection.behaviourObservations[0]).toEqual(expect.objectContaining({
      behaviourAnnualCurrentLevelV2: 'Developing', behaviourAnnualTargetLevelV2: 'Effective',
      behaviourAnnualTargetJustificationV2: 'Approved annual development plan.',
      behaviourAnnualTargetSourceEtagV2: '"annual-1"', behaviourAnnualTargetSourceWorkplanVersionV2: 1,
      behaviourAnnualTargetSourceApprovalKeyV2: 'annual-approval-1'
    }));
    source.items = source.items.map(item => item.itemType !== 'Behaviour' ? item : ({ ...item,
      behaviourAnnualTargetSourceEtagV2: '"annual-2"', behaviourAnnualTargetSourceWorkplanVersionV2: 2 }));
    const changed = buildQuarterPerformanceReadProjection(2026, [source]);
    expect(changed.projectionIdentity).not.toBe(projection.projectionIdentity);
    expect(projection.behaviourObservations[0].behaviourAnnualTargetSourceEtagV2).toBe('"annual-1"');
    expect(Object.isFrozen(projection.behaviourObservations[0])).toBe(true);
  });
  it('keeps historical Target unavailable even when the annual Current baseline is present', () => {
    const source = sourceFor('alice', 'Q1');
    source.items = source.items.map(item => item.itemType !== 'Behaviour' ? item : ({ ...item,
      behaviourAnnualCurrentLevelV2: 'Developing' }));
    const projection = buildQuarterPerformanceReadProjection(2026, [source]);
    expect(projection.behaviourObservations.every(row => row.behaviourAnnualTargetLevelV2 === undefined
      && row.behaviourAnnualTargetSourceApprovalKeyV2 === undefined)).toBe(true);
  });
  it.each([
    { behaviourAnnualTargetLevelV2: undefined },
    { behaviourAnnualTargetSourceEtagV2: '*' },
    { behaviourAnnualTargetSourceWorkplanVersionV2: 0 },
    { behaviourAnnualTargetSourceWorkplanItemKeyV2: 'other-item' },
    { behaviourAnnualTargetSourceApprovalKeyV2: 'other-approval' },
    { behaviourAnnualCurrentLevelV2: 'Unknown' }
  ])('rejects incomplete or mismatched annual metadata %j', amendment => {
    const source = annualSource();
    source.items = source.items.map(item => item.itemType !== 'Behaviour' ? item : ({ ...item, ...amendment } as IQuarterReviewItem));
    expect(() => buildQuarterPerformanceReadProjection(2026, [source])).toThrow();
  });
});
