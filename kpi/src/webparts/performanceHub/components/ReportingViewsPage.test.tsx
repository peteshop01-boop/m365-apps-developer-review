import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import type { ICoreReportingFeed, IReportingCompleteness, IReportingProvenance, IReportingViewsDataset, ReportingView } from '../models/ReportingModels';
import {
  behaviourHeadlineReferences,
  buildBehaviourAssessmentInput,
  buildDeliveryResultContract,
  buildReportingGovernanceConfiguration,
  buildReportingProvenance,
  businessContributionAreaReferences,
  strategicPillarReference
} from '../test/ReportingDecisionFixtures';
import ReportingViewsPage, { reconcileBehaviourPeriodFilters } from './ReportingViewsPage';
import { defaultReportingViewState, selectBehaviourHeadlines } from '../services/ReportingViewModels';

const provenance: IReportingProvenance = buildReportingProvenance('controlled/source.json');

const completeness: IReportingCompleteness = {
  expected: 2,
  reportable: 1,
  notSubmitted: 0,
  awaitingApproval: 1,
  notRated: 0,
  missingData: 0,
  freshnessLabel: 'Cut at 23:30 BST'
};

const feed = (title: string): ICoreReportingFeed => ({
  title,
  provenance,
  completeness,
  rows: [
    {
      rowKey: `${title}-1`, kpiId: 'KPI-001', title: 'Youth participation', owner: 'Core owner',
      submissionState: 'Reportable', rag: 'Green', resultDisplay: '84 approved', targetDisplay: '80', latestApprovedAt: '2026-09-20T10:00:00.000Z', provenanceRef: 'CORE-001',
      scope: { person: 'Synthetic Person A', team: 'North', manager: 'Synthetic Manager', period: '2026 Q2' },
      portfolio: { id: 'PORT-01', versionKey: 'PORT-01-V2', title: 'Participation portfolio', lifecycleState: 'Published' },
      strategicOutcome: { id: 'SO-01', versionKey: 'SO-01-V3', title: 'More people playing cricket', lifecycleState: 'Published' },
      classification: { id: 'CLASS-01', versionKey: 'CLASS-01-V1', title: 'Approved classification', lifecycleState: 'Published' }
    },
    {
      rowKey: `${title}-2`, kpiId: 'KPI-002', title: 'Club capability', owner: 'Core owner',
      submissionState: 'AwaitingApproval', rag: 'NotRated', resultDisplay: 'Awaiting approval', provenanceRef: 'CORE-002',
      scope: { person: 'Synthetic Person B', team: 'North', manager: 'Synthetic Manager', period: '2026 Q2' }
    }
  ]
});

const fixture = (): IReportingViewsDataset => ({
  performanceYear: '2026/27',
  deliverySummary: buildDeliveryResultContract(),
  governance: buildReportingGovernanceConfiguration(),
  core: {
    executive: feed('Executive decision view'),
    pillar: feed('Pillar decision view'),
    portfolio: feed('Portfolio decision view'),
    kpiDetail: feed('KPI detail decision view')
  },
  impact: {
    title: 'Impact decision view', provenance, completeness,
    rows: [{
      impactKey: 'IMP-001', title: 'Community programme reach', owner: 'Impact owner', submissionState: 'AwaitingApproval',
      progressDisplay: 'Draft progress', resultDisplay: 'Awaiting approval', contributionDisplay: 'Awaiting approval', provenanceRef: 'IMPACT-001',
      businessContributionArea: { ...businessContributionAreaReferences[0] },
      pillar: { ...strategicPillarReference },
      scope: { person: 'Synthetic Person A', team: 'North', manager: 'Synthetic Manager', period: '2026 Q2' }
    }]
  },
  behaviour: {
    title: 'Behaviour headline view', provenance, completeness,
    ...buildBehaviourAssessmentInput(behaviourHeadlineReferences.map(() => ({ team: 'North', manager: 'Synthetic Manager' }))),
    headlines: behaviourHeadlineReferences.map((reference, index) => ({
      behaviourKey: reference.id,
      title: reference.title,
      submissionState: 'Reportable',
      distributions: [
        { classification: 'Developing', count: 1, display: '1 person' },
        { classification: 'Effective', count: 7, display: '7 people' },
        { classification: 'Exceptional', count: 2, display: '2 people' }
      ],
      movementDisplay: 'No approved comparison',
      provenanceRef: `BEH-SRC-${index + 1}`,
      scope: { team: 'North', manager: 'Synthetic Manager', period: '2026 Q2' },
      headlineReference: { ...reference }
    }))
  }
});

const render = (view: ReportingView, data: IReportingViewsDataset = fixture(), disconnected = false): string =>
  ReactDOMServer.renderToStaticMarkup(<ReportingViewsPage dataset={disconnected ? undefined : data} initialView={view} />);

describe('ReportingViewsPage rendered contract', () => {
  it.each(['executive', 'impact', 'behaviour'] as const)('renders an error for unsafe Behaviour distribution metadata in %s view', view => {
    const data = fixture(); data.behaviour.headlines[0].distributions[0].count = Number.MAX_SAFE_INTEGER + 1;
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
    expect(html).not.toContain('data-delivery-domain="overall"');
  });
  it.each(['executive', 'impact', 'behaviour'] as const)('renders an error for malformed %s feed title even when another field is invalid', view => {
    const data = fixture(); const target = view === 'executive' ? data.core.executive : data[view];
    Object.assign(target, { title: Object.create(null) });
    target.completeness = Object.assign({}, completeness, { freshnessLabel: {} });
    expect(() => render(view, data)).not.toThrow();
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
  });
  it.each(['executive', 'impact'] as const)('renders an error without coercing malformed %s latest-approved timestamps', view => {
    const data = fixture(); const row = view === 'impact' ? data.impact.rows[0] : data.core.executive.rows[0];
    Object.assign(row, { latestApprovedAt: Object.create(null) });
    expect(() => render(view, data)).not.toThrow();
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
  });
  it.each([
    ['executive', 'portfolio'], ['executive', 'strategicOutcome'], ['executive', 'classification'], ['impact', 'strategicOutcome']
  ] as const)('renders a recoverable error for malformed %s optional reference %s', (view, reference) => {
    const data = fixture(); const row = view === 'impact' ? data.impact.rows[0] : data.core.executive.rows[0];
    Object.assign(row, { [reference]: { id: 'HISTORIC-01', versionKey: 'HISTORIC-V1', title: {}, lifecycleState: 'Retired' } });
    expect(() => render(view, data)).not.toThrow();
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
  });
  it.each(['executive', 'impact'] as const)('renders an error without coercing malformed %s cut metadata', view => {
    const data = fixture(); const target = view === 'impact' ? data.impact : data.core.executive;
    target.provenance = Object.assign({}, provenance, { cutTimestamp: Object.create(null) });
    expect(() => render(view, data)).not.toThrow();
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
  });
  it.each([
    ['executive', 'reportRunId'], ['executive', 'modelVersion'], ['impact', 'sourceReference'],
    ['impact', 'snapshotKey'], ['behaviour', 'reportRunId'], ['behaviour', 'sourceReference']
  ] as const)('renders a recoverable error for malformed shared %s provenance %s', (view, field) => {
    const data = fixture(); const invalid = {}; const shared = Object.assign({}, provenance, { [field]: invalid });
    [data.core.executive, data.core.pillar, data.core.portfolio, data.core.kpiDetail, data.impact, data.behaviour]
      .forEach(feed => { feed.provenance = shared; });
    data.deliverySummary!.provenance = shared;
    if (field === 'snapshotKey') Object.assign(data.deliverySummary!, { snapshotKey: invalid });
    expect(() => render(view, data)).not.toThrow();
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
    expect(html).not.toContain('data-delivery-domain="overall"');
  });
  it.each([
    ['executive', 'title'], ['executive', 'owner'], ['executive', 'resultDisplay'], ['executive', 'provenanceRef'],
    ['impact', 'impactKey'], ['impact', 'title'], ['impact', 'progressDisplay'], ['impact', 'resultDisplay'], ['impact', 'contributionDisplay']
  ] as const)('renders a recoverable error for malformed %s row field %s', (view, field) => {
    const data = fixture(); const row = view === 'impact' ? data.impact.rows[0] : data.core.executive.rows[0];
    Object.assign(row, { [field]: {} });
    expect(() => render(view, data)).not.toThrow();
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
  });
  it.each([
    ['executive', 'person'], ['executive', 'team'], ['executive', 'manager'],
    ['impact', 'person'], ['impact', 'team'], ['impact', 'manager'], ['impact', 'period']
  ] as const)('renders a recoverable error for malformed %s filter scope %s', (view, field) => {
    const data = fixture();
    const row = view === 'impact' ? data.impact.rows[0] : data.core.executive.rows[0];
    Object.assign(row.scope!, { [field]: {} });
    expect(() => render(view, data)).not.toThrow();
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
  });
  it.each([
    ['executive', 'year', ''], ['executive', 'year', Object.create(null)],
    ['impact', 'freshness', undefined], ['impact', 'freshness', {}],
    ['behaviour', 'freshness', ' '], ['behaviour', 'freshness', {}]
  ] as const)('renders a recoverable error for %s %s metadata', (view, field, invalid) => {
    const data = fixture();
    if (field === 'year') Object.assign(data, { performanceYear: invalid });
    else {
      const target = view === 'impact' ? data.impact : data.behaviour;
      target.completeness = Object.assign({}, completeness, { freshnessLabel: invalid });
    }
    expect(() => render(view, data)).not.toThrow();
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
    expect(html).not.toContain('data-delivery-domain="overall"');
  });
  it.each(['executive', 'impact', 'behaviour'] as const)('fails closed on unsafe %s completeness counts', view => {
    const data = fixture();
    const target = view === 'executive' ? data.core.executive : data[view];
    target.completeness = { expected: Number.MAX_SAFE_INTEGER + 1, reportable: Number.MAX_SAFE_INTEGER + 1,
      notSubmitted: 0, awaitingApproval: 0, notRated: 0, missingData: 0, freshnessLabel: 'Synthetic governed cut' };
    const html = render(view, data);
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('aria-label="Completeness and freshness"');
    expect(html).not.toContain('data-delivery-domain="overall"');
  });
  it('keeps rendered select values and applied Q1 predicates aligned after Q2 choices', () => {
    const data = fixture();
    const q1 = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-1')!;
    data.behaviour.periods[0].complete = true;
    data.behaviour.assessments.push({ ...q1, assessmentId: 'Q1-RENDERED', periodKey: '2026 Q1', scope: { ...q1.scope, period: '2026 Q1' } });
    const q2South = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-2')!;
    q2South.scope = { ...q2South.scope, team: 'South', manager: 'Manager South' };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const select = (name: string): HTMLSelectElement => {
      const label = Array.from(host.querySelectorAll('label')).find(item => item.querySelector('span')?.textContent === name);
      return label!.querySelector('select')!;
    };
    const choose = (name: string, value: string): void => act(() => {
      const control = select(name);
      control.value = value;
      Simulate.change(control);
    });
    try {
      act(() => { ReactDOM.render(<ReportingViewsPage dataset={data} initialView="behaviour" />, host); });
      choose('Person', 'SYNTHETIC-PERSON-2');
      choose('Manager', 'Manager South');
      expect(host.querySelectorAll('[data-reporting-domain="behaviour"]')).toHaveLength(1);
      choose('Period', '2026 Q1');
      expect(select('Person').value).toBe('');
      expect(select('Manager').value).toBe('');
      expect(select('Period').value).toBe('2026 Q1');
      expect(host.querySelectorAll('[data-reporting-domain="behaviour"]')).toHaveLength(5);
      expect(host.textContent).toContain('1 (100.0%)');
      expect(host.querySelector('[data-delivery-domain="overall"]')).toBeNull();
    } finally {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      host.remove();
    }
  });

  it('clears hidden Person and Manager selections on a period switch and matches direct Q1', () => {
    const data = fixture();
    const q1 = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-1')!;
    data.behaviour.periods[0].complete = true;
    data.behaviour.assessments.push({ ...q1, assessmentId: 'Q1-PERSON-1', periodKey: '2026 Q1', scope: { ...q1.scope, period: '2026 Q1' } });
    const q2South = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-2')!;
    q2South.scope = { ...q2South.scope, team: 'South', manager: 'Manager South' };
    const selected = { ...defaultReportingViewState, period: '2026 Q2', person: 'SYNTHETIC-PERSON-2', manager: 'Manager South' };
    expect(selectBehaviourHeadlines(data, { ...selected, period: '2026 Q1' })).toHaveLength(0);
    const switched = reconcileBehaviourPeriodFilters(data, selected, '2026 Q1');
    expect(switched).toEqual({ ...defaultReportingViewState, period: '2026 Q1' });
    expect(selectBehaviourHeadlines(data, switched)).toEqual(selectBehaviourHeadlines(data, { ...defaultReportingViewState, period: '2026 Q1' }));
    expect(selectBehaviourHeadlines(data, switched)).toHaveLength(5);
    expect(selectBehaviourHeadlines(data, switched)[0].distributions.map(item => item.display)).toEqual(['1 (100.0%)', '0 (0.0%)', '0 (0.0%)']);
  });

  it('clears absent Team while retaining available Person and Manager across periods', () => {
    const data = fixture();
    const q2 = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-2')!;
    const q1 = { ...q2, assessmentId: 'Q1-PERSON-2', periodKey: '2026 Q1', scope: { ...q2.scope, team: 'North', period: '2026 Q1' } };
    data.behaviour.assessments.push(q1);
    q2.scope = { ...q2.scope, team: 'South' };
    const selected = { ...defaultReportingViewState, period: '2026 Q2', person: q2.personKey, team: 'South', manager: 'Synthetic Manager' };
    const switched = reconcileBehaviourPeriodFilters(data, selected, '2026 Q1');
    expect(switched).toMatchObject({ person: q2.personKey, team: '', manager: 'Synthetic Manager', period: '2026 Q1' });
    expect(selectBehaviourHeadlines(data, switched)).toHaveLength(1);
    expect(reconcileBehaviourPeriodFilters(data, switched, '2026 Q2')).toMatchObject({ person: q2.personKey, team: '', manager: 'Synthetic Manager' });
  });

  it('uses latest eligible stable-key records for period options, excluding draft and superseded scopes', () => {
    const data = fixture();
    const q2 = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-1')!;
    data.behaviour.assessments.push({ ...q2, assessmentId: 'Q1-OLD', periodKey: '2026 Q1', scope: { ...q2.scope, team: 'Old', manager: 'Old Manager', period: '2026 Q1' } });
    data.behaviour.assessments.push({ ...q2, assessmentId: 'Q1-LATEST', periodKey: '2026 Q1', version: 2, scope: { ...q2.scope, person: '<img src=x onerror=alert(1)>', team: 'North', manager: 'North Manager', period: '2026 Q1' } });
    data.behaviour.assessments.push({ ...q2, assessmentId: 'Q1-DRAFT', personKey: 'DRAFT-PERSON', periodKey: '2026 Q1', state: 'Draft', scope: { ...q2.scope, person: 'Draft', team: 'Ghost', manager: 'Ghost Manager', period: '2026 Q1' } });
    const selected = { ...defaultReportingViewState, period: '2026 Q2', person: q2.personKey, team: 'Old', manager: 'Ghost Manager' };
    expect(reconcileBehaviourPeriodFilters(data, selected, '2026 Q1')).toMatchObject({ person: q2.personKey, team: '', manager: '' });
    expect(reconcileBehaviourPeriodFilters(data, { ...selected, person: 'DRAFT-PERSON' }, '2026 Q1').person).toBe('');
    expect(render('behaviour', data)).not.toContain('<img src=x');
  });
  it('renders six semantic keyboard tabs and one labelled tab panel', () => {
    const html = render('executive');
    expect((html.match(/role="tab"/g) || [])).toHaveLength(6);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('aria-controls="reporting-panel-executive"');
    expect(html).toContain('aria-labelledby="reporting-tab-executive"');
  });

  it.each([
    ['executive', 'Executive decision view'],
    ['pillar', 'Pillar decision view'],
    ['portfolio', 'Portfolio decision view'],
    ['kpiDetail', 'KPI detail decision view']
  ] as Array<[ReportingView, string]>)('renders the %s Core feed without changing supplied result/state', (view, heading) => {
    const html = render(view);
    expect(html).toContain(heading);
    expect(html).toContain('84 approved');
    expect(html).toContain('Awaiting approval');
    expect(html).toContain('data-rag="NotRated"');
    expect(html).toContain('No approved result is presented for this row');
  });

  it('renders supplied Core, Impact and Overall Delivery results, default weights and poor-Core guard separately', () => {
    const html = render('executive');
    expect(html).toContain('Overall Delivery summary');
    expect(html).toContain('data-delivery-domain="core"');
    expect(html).toContain('data-delivery-domain="impact"');
    expect(html).toContain('data-delivery-domain="overall"');
    expect(html).toContain('70% configured weight');
    expect(html).toContain('30% configured weight');
    expect(html).toContain('76.8 supplied');
    expect(html).toContain('data-guard-disposition="Applied"');
    expect(html).toContain('KCF-KPI-Sponsor-PD-01');
    expect(html).toContain('Behaviours are displayed separately and are excluded from Overall Delivery arithmetic');
  });

  it('renders an authorised alternative supplied weighting without recalculating the result', () => {
    const data = fixture();
    data.deliverySummary = buildDeliveryResultContract({ coreWeight: 60, impactWeight: 40, isDefaultWeighting: false });
    const html = render('executive', data);
    expect(html).toContain('60% configured weight');
    expect(html).toContain('40% configured weight');
    expect(html).toContain('authorised alternative');
    expect(html).toContain('76.8 supplied');
  });

  it.each([
    ['missing', (data: IReportingViewsDataset) => { data.deliverySummary = undefined; }],
    ['stale', (data: IReportingViewsDataset) => { data.deliverySummary = buildDeliveryResultContract({ freshnessState: 'Stale' }); }],
    ['NotRated', (data: IReportingViewsDataset) => { data.deliverySummary = buildDeliveryResultContract({ overallState: 'NotRated' }); }]
  ] as Array<[string, (data: IReportingViewsDataset) => void]>)('fails the rendered feed closed for a %s governed Delivery result', (_case, mutate) => {
    const data = fixture();
    mutate(data);
    const html = render('executive', data);
    expect(html).toContain('The reporting feed failed closed');
    expect(html).not.toContain('data-delivery-domain="overall"');
    expect(html).not.toContain('84 approved');
  });

  it('renders KPI governed references as versioned read-only facts', () => {
    const html = render('kpiDetail');
    expect(html).toContain('More people playing cricket');
    expect(html).toContain('SO-01-V3');
    expect(html).toContain('Approved classification');
    expect(html).toContain('CLASS-01-V1');
  });

  it('renders the separate Impact owner, progress, result, contribution and BCA boundary without Core RAG', () => {
    const html = render('impact');
    expect(html).toContain('data-reporting-domain="impact"');
    expect(html).toContain('Impact owner');
    expect(html).toContain('Draft progress');
    expect(html).toContain('Contribution');
    expect(html).toContain('Programme Delivery &amp; Service Quality');
    expect(html).not.toContain('data-reporting-domain="core"');
    expect(html).not.toContain('data-rag=');
    expect(html).toContain('13 governed Business Contribution Areas');
    expect(html).toContain('Strategic Pillar remains optional');
  });

  it('renders five separate Behaviour classification profiles without Core/Impact arithmetic fields', () => {
    const html = render('behaviour');
    expect((html.match(/data-reporting-domain="behaviour"/g) || [])).toHaveLength(5);
    expect(html).toContain('Developing');
    expect(html).toContain('Effective');
    expect(html).toContain('Exceptional');
    expect(html).toContain('Behaviour is kept outside Core and Impact arithmetic');
    expect(html).not.toContain('data-rag=');
    expect(html).toContain('75 detailed target references');
    expect(html).toContain('74F2AE0A7FDB33B72419CBF8897EEF0B45B23978583ABBF27DBF66581F504E8F');
  });

  it('renders calculated one-decimal eligible percentages and exact absent-prior state without an indicator', () => {
    const html = render('behaviour');
    expect(html).toContain('1 (33.3%)');
    expect((html.match(/No comparable prior period/g) || [])).toHaveLength(5);
    expect(html).not.toContain('data-movement-indicator');
    expect(html).not.toContain('No approved comparison');
  });

  it('offers only eligible selected-period Behaviour populations in the mixed-scope filters', () => {
    const data = fixture();
    const south = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.classification === 'Exceptional')!;
    south.state = 'Final';
    south.scope = { ...south.scope, team: 'South', manager: 'Manager B' };
    data.behaviour.assessments.push({
      ...south, assessmentId: 'DRAFT-OTHER-PERSON', personKey: 'DRAFT-PERSON', state: 'Draft',
      scope: { ...south.scope, person: 'Draft Person', team: 'Ghost', manager: 'Ghost Manager' }
    });
    const html = render('behaviour', data);
    expect(html).toContain('<option value="South">South</option>');
    expect(html).toContain('<option value="Manager B">Manager B</option>');
    expect(html).not.toContain('<option value="Ghost">Ghost</option>');
    expect(html).not.toContain('<option value="Ghost Manager">Ghost Manager</option>');
    expect(html).not.toContain('DRAFT-PERSON');
    expect(html).not.toContain('Draft Person');
    expect((html.match(/data-reporting-domain="behaviour"/g) || [])).toHaveLength(5);
    expect(html).not.toContain('data-delivery-domain="overall"');
  });

  it('renders separate stable-key Person options for duplicate and hostile display labels', () => {
    const data = fixture();
    const first = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-1')!;
    const second = data.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-2')!;
    first.scope = { ...first.scope, person: second.scope!.person };
    let html = render('behaviour', data);
    expect(html).toContain('<option value="SYNTHETIC-PERSON-1">Synthetic Person 2 (SYNTHETIC-PERSON-1)</option>');
    expect(html).toContain('<option value="SYNTHETIC-PERSON-2">Synthetic Person 2 (SYNTHETIC-PERSON-2)</option>');
    first.scope = { ...first.scope, person: '<img src=x onerror=alert(1)>' };
    html = render('behaviour', data);
    expect(html).toContain('<option value="SYNTHETIC-PERSON-1">&lt;img src=x onerror=alert(1)&gt;</option>');
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('data-delivery-domain="overall"');
  });

  it('renders signed percentage-point movement only for a complete immediate prior period', () => {
    const data = fixture();
    data.behaviour.periods[0].complete = true;
    const current = data.behaviour.assessments.filter(record => record.behaviourKey === 'BEH-001');
    data.behaviour.assessments.push(...current.map((record, index) => ({
      ...record,
      assessmentId: `PRIOR-${index}`,
      periodKey: '2026 Q1',
      classification: index === 1 ? 'Developing' as const : record.classification,
      scope: { ...record.scope, period: '2026 Q1' }
    })));
    const html = render('behaviour', data);
    expect(html).toContain('Developing -33.3 pp');
    expect(html).toContain('Effective +33.3 pp');
    expect(html).toContain('data-movement-indicator="true"');
    expect(html).not.toContain('data-delivery-domain="overall"');
  });

  it('renders governed person, team, manager, period and Impact contribution-area filters', () => {
    const coreHtml = render('executive');
    expect(coreHtml).toContain('>Person</span>');
    expect(coreHtml).toContain('>Team</span>');
    expect(coreHtml).toContain('>Manager</span>');
    expect(coreHtml).toContain('>Period</span>');
    const impactHtml = render('impact');
    expect(impactHtml).toContain('>Contribution area</span>');
    expect(impactHtml).toContain('Programme Delivery &amp; Service Quality');
  });

  it('renders provenance, completeness, freshness and the source cut timestamp', () => {
    const html = render('executive');
    expect(html).toContain('Completeness and freshness');
    expect(html).toContain('Not submitted');
    expect(html).toContain('Awaiting approval');
    expect(html).toContain('RUN-2026-Q2-001');
    expect(html).toContain('governed-model-v1');
    expect(html).toContain('controlled/source.json');
    expect(html).toContain('Cut timestamp');
  });

  it('fails transparently when a production reporting feed is not connected', () => {
    const html = render('executive', fixture(), true);
    expect(html).toContain('Reporting data is not connected');
    expect(html).toContain('No placeholder result, status, classification or timestamp has been invented');
    expect(html).not.toContain('data-rag="Green"');
  });

  it('fails closed before rendering rows when provenance is invalid', () => {
    const data = fixture();
    data.core.executive.provenance = { ...provenance, cutTimestamp: 'invalid' };
    const html = render('executive', data);
    expect(html).toContain('The reporting feed failed closed');
    expect(html).toContain('valid cut timestamp');
    expect(html).not.toContain('84 approved');
  });

  it('renders the failed-closed alert for missing Core and every selected Core shell', () => {
    const missingCore = fixture();
    (missingCore as unknown as Record<string, unknown>).core = undefined;
    const missingCoreHtml = render('executive', missingCore);
    expect(missingCoreHtml).toContain('The reporting feed failed closed');
    expect(missingCoreHtml).toContain('Core reporting feeds are absent or malformed');
    expect(missingCoreHtml).not.toContain('84 approved');

    (['executive', 'pillar', 'portfolio', 'kpiDetail'] as const).forEach(view => {
      const data = fixture();
      (data.core as unknown as Record<string, unknown>)[view] = undefined;
      const html = render(view, data);
      expect(html).toContain('role="alert"');
      expect(html).toContain('The reporting feed failed closed');
      expect(html).not.toContain('84 approved');
    });
  });

  it('renders the alert for malformed rows, provenance and completeness and for an invalid present feed', () => {
    (['rows', 'provenance', 'completeness'] as const).forEach(field => {
      const data = fixture();
      (data.core.executive as unknown as Record<string, unknown>)[field] = field === 'rows' ? {} : [];
      const html = render('executive', data);
      expect(html).toContain('role="alert"');
      expect(html).toContain('The reporting feed failed closed');
      expect(html).not.toContain('84 approved');
    });

    const data = fixture();
    data.core.executive.rows[0].rowKey = '';
    const html = render('executive', data);
    expect(html).toContain('role="alert"');
    expect(html).toContain('stable rowKey');
    expect(html).not.toContain('84 approved');
  });

  it('renders the alert when Impact or Behaviour shells are malformed', () => {
    (['impact', 'behaviour'] as const).forEach(view => {
      const data = fixture();
      (data as unknown as Record<string, unknown>)[view] = undefined;
      const html = render(view, data);
      expect(html).toContain('role="alert"');
      expect(html).toContain('The reporting feed failed closed');
      expect(html).not.toContain('84 approved');
    });
  });
  it.each(['missing distributions', 'null member', 'bad headline reference', 'bad catalogue member', 'absent catalogue', 'null catalogue', 'array catalogue', 'scalar catalogue'])('fails closed on Behaviour %s', caseName => {
    const data = fixture();
    if (caseName === 'missing distributions') delete (data.behaviour.headlines[0] as unknown as Record<string, unknown>).distributions;
    if (caseName === 'null member') data.behaviour.headlines[0].distributions[0] = null as never;
    if (caseName === 'bad headline reference') data.behaviour.headlines[0].headlineReference = null as never;
    if (caseName === 'bad catalogue member') data.governance!.behaviourCatalogue.headlineReferences[0] = null as never;
    if (caseName === 'absent catalogue') delete (data.governance as unknown as Record<string, unknown>).behaviourCatalogue;
    if (caseName === 'null catalogue') (data.governance as unknown as Record<string, unknown>).behaviourCatalogue = null;
    if (caseName === 'array catalogue') (data.governance as unknown as Record<string, unknown>).behaviourCatalogue = [];
    if (caseName === 'scalar catalogue') (data.governance as unknown as Record<string, unknown>).behaviourCatalogue = 'invalid';
    const html = render('behaviour', data);
    expect(html).toContain('role="alert"');
    expect(html).toContain('The reporting feed failed closed');
    expect(html).not.toContain('data-behaviour-key=');
    expect(html).not.toContain('84 approved');
  });
});
