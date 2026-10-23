import type {
  IBehaviourHeadline,
  ICoreReportingFeed,
  IReportingCompleteness,
  IReportingProvenance,
  IReportingViewsDataset
} from '../models/ReportingModels';
import {
  calculateBehaviourHeadlines,
  getNextReportingView,
  getReportingLayoutContract,
  normaliseReportingViewState,
  selectBehaviourPersonOptions,
  selectBehaviourHeadlines,
  selectCoreReportingRows,
  selectImpactReportingRows,
  validateReportingDataset
} from './ReportingViewModels';
import {
  behaviourHeadlineReferences,
  buildBehaviourAssessmentInput,
  buildDeliveryResultContract,
  buildReportingGovernanceConfiguration,
  buildReportingProvenance,
  businessContributionAreaReferences,
  strategicPillarReference
} from '../test/ReportingDecisionFixtures';

const provenance: IReportingProvenance = buildReportingProvenance();

const completeness: IReportingCompleteness = {
  expected: 5,
  reportable: 1,
  notSubmitted: 1,
  awaitingApproval: 1,
  notRated: 1,
  missingData: 1,
  freshnessLabel: 'Cut 21 September 2026 at 23:30 BST'
};

const coreFeed = (title: string): ICoreReportingFeed => ({
  title,
  completeness,
  provenance,
  rows: [
    { rowKey: 'ROW-3', title: 'Third', owner: 'Charlie', submissionState: 'AwaitingApproval', rag: 'NotRated', resultDisplay: 'Awaiting approval', provenanceRef: 'SRC-3', scope: { person: 'Person C', team: 'South', manager: 'Manager B', period: '2026 Q2' } },
    { rowKey: 'ROW-1', title: 'First', owner: 'Alice', submissionState: 'Reportable', rag: 'Green', resultDisplay: 'Approved result', provenanceRef: 'SRC-1', scope: { person: 'Person A', team: 'North', manager: 'Manager A', period: '2026 Q2' } },
    { rowKey: 'ROW-2', title: 'Second', owner: 'Bob', submissionState: 'NotSubmitted', rag: 'NotRated', resultDisplay: 'Not submitted', provenanceRef: 'SRC-2', scope: { person: 'Person B', team: 'North', manager: 'Manager A', period: '2026 Q2' } },
    { rowKey: 'ROW-4', title: 'Fourth', owner: 'Dana', submissionState: 'NotRated', rag: 'NotRated', resultDisplay: 'Not rated', provenanceRef: 'SRC-4', scope: { team: 'South', period: '2026 Q2' } },
    { rowKey: 'ROW-5', title: 'Fifth', owner: 'Erin', submissionState: 'MissingData', rag: 'NotRated', resultDisplay: 'Missing data', provenanceRef: 'SRC-5', scope: { team: 'South', period: '2026 Q2' } }
  ]
});

const dataset = (): IReportingViewsDataset => ({
  performanceYear: '2026/27',
  deliverySummary: buildDeliveryResultContract(),
  governance: buildReportingGovernanceConfiguration(),
  core: {
    executive: coreFeed('Executive view'),
    pillar: coreFeed('Pillar view'),
    portfolio: coreFeed('Portfolio view'),
    kpiDetail: coreFeed('KPI detail view')
  },
  impact: {
    title: 'Impact view', completeness, provenance,
    rows: [
      { impactKey: 'IMP-2', title: 'Community reach', owner: 'Impact B', submissionState: 'NotSubmitted', progressDisplay: 'Not submitted', resultDisplay: 'Not submitted', contributionDisplay: 'Not submitted', provenanceRef: 'IMPACT-2', businessContributionArea: { ...businessContributionAreaReferences[1] }, scope: { team: 'South', manager: 'Manager B', period: '2026 Q2' } },
      { impactKey: 'IMP-1', title: 'Participation', owner: 'Impact A', submissionState: 'Reportable', progressDisplay: 'On plan', resultDisplay: 'Approved result', contributionDisplay: 'Approved contribution', provenanceRef: 'IMPACT-1', businessContributionArea: { ...businessContributionAreaReferences[0] }, pillar: { ...strategicPillarReference }, scope: { team: 'North', manager: 'Manager A', period: '2026 Q2' } }
    ]
  },
  behaviour: {
    title: 'Behaviour profile', completeness, provenance,
    ...buildBehaviourAssessmentInput(behaviourHeadlineReferences.map((_, index) => ({
      team: index < 3 ? 'North' : 'South', manager: index < 3 ? 'Manager A' : 'Manager B'
    }))),
    headlines: behaviourHeadlineReferences.map((reference, index) => ({
      behaviourKey: reference.id,
      title: reference.title,
      submissionState: index === 0 ? 'AwaitingApproval' : 'Reportable',
      distributions: [
        { classification: 'Developing', count: 1, display: '1 person' },
        { classification: 'Effective', count: 3, display: '3 people' },
        { classification: 'Exceptional', count: 1, display: '1 person' }
      ],
      movementDisplay: 'No approved comparison',
      provenanceRef: `BEHAVIOUR-${index + 1}`,
      scope: { team: index < 3 ? 'North' : 'South', manager: index < 3 ? 'Manager A' : 'Manager B', period: '2026 Q2' },
      headlineReference: { ...reference }
    }))
  }
});

describe('Reporting view models', () => {
  describe.each(['Developing', 'Effective', 'Exceptional'])('%s historical distribution count precision', classification => {
    it.each([Number.MAX_SAFE_INTEGER + 1, 1e30])('rejects unsafe distribution count %s', count => {
      const value = dataset(); value.behaviour.headlines[0].distributions.find(item => item.classification === classification)!.count = count;
      expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('distribution counts')]));
    });
  });
  it.each([0, Number.MAX_SAFE_INTEGER])('retains valid individual historical counts %s without replacing generated categorical results', count => {
    const value = dataset(); value.behaviour.headlines[0].distributions[0].count = count;
    const before = JSON.stringify(value); const generated = calculateBehaviourHeadlines(value);
    expect(validateReportingDataset(value)).toEqual([]);
    expect(calculateBehaviourHeadlines(value)).toEqual(generated);
    expect(JSON.stringify(value)).toBe(before);
  });
  describe.each(['executive', 'pillar', 'portfolio', 'kpiDetail', 'impact', 'behaviour'] as const)(
    '%s reporting feed title validation', view => {
      it.each([' ', undefined, {}, Object.create(null)])('rejects malformed title %s without throwing diagnostics', title => {
        const value = dataset(); const target = view === 'impact' || view === 'behaviour' ? value[view] : value.core[view];
        Object.assign(target, { title });
        expect(() => validateReportingDataset(value)).not.toThrow();
        expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('reporting feed title')]));
      });
    });
  it('retains valid feed title text exactly without rewriting source', () => {
    const value = dataset(); value.core.executive.title = ' Preserved Executive label ';
    value.impact.title = 'Historical Impact label'; value.behaviour.title = 'Categorical Behaviour label';
    const before = JSON.stringify(value);
    expect(validateReportingDataset(value)).toEqual([]);
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each([
    ['Core', 'null-prototype'], ['Core', 'throwing'], ['Core', 'coercible'], ['Core', 'invalid-text'],
    ['Impact', 'null-prototype'], ['Impact', 'throwing'], ['Impact', 'coercible'], ['Impact', 'invalid-text']
  ])('rejects malformed %s latest-approved timestamp %s without coercion', (domain, kind) => {
    const value = dataset(); const row = domain === 'Core' ? value.core.executive.rows[0] : value.impact.rows[0];
    const valueOf = jest.fn(() => { if (kind === 'throwing') throw new Error('Synthetic coercion must not run'); return 0; });
    const latestApprovedAt = kind === 'invalid-text' ? 'not a timestamp' : kind === 'null-prototype' ? Object.create(null) : { valueOf };
    Object.assign(row, { latestApprovedAt });
    expect(() => validateReportingDataset(value)).not.toThrow();
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('latest-approved timestamp')]));
    expect(valueOf).not.toHaveBeenCalled();
  });
  it.each([undefined, '', '2026-09-20T10:00:00.000Z', '2026-09-20T11:00:00.000+01:00'])(
    'retains optional or parseable textual latest-approved timestamps %s', latestApprovedAt => {
      const value = dataset(); Object.assign(value.core.executive.rows[0], { latestApprovedAt });
      Object.assign(value.impact.rows[0], { latestApprovedAt });
      const before = JSON.stringify(value);
      expect(validateReportingDataset(value)).toEqual([]);
      expect(JSON.stringify(value)).toBe(before);
    });
  describe.each([
    ['Core', 'portfolio'], ['Core', 'strategicOutcome'], ['Core', 'classification'], ['Impact', 'strategicOutcome']
  ])('%s optional %s reference validation', (domain, reference) => {
    it.each(['id', 'versionKey', 'title', 'lifecycleState'])('rejects malformed reference text %s', field => {
      const value = dataset(); const row = domain === 'Core' ? value.core.executive.rows[0] : value.impact.rows[0];
      Object.assign(row, { [reference]: { id: 'HISTORIC-01', versionKey: 'HISTORIC-V1', title: 'Historical label', lifecycleState: 'Retired', [field]: {} } });
      expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('optional reporting reference')]));
    });
    it.each([null, []])('rejects malformed optional reference container %s', invalid => {
      const value = dataset(); const row = domain === 'Core' ? value.core.executive.rows[0] : value.impact.rows[0];
      Object.assign(row, { [reference]: invalid });
      expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('optional reporting reference')]));
    });
  });
  it.each([undefined, { id: 'HISTORIC-01', versionKey: 'HISTORIC-V1', title: 'Historical label', lifecycleState: 'Retired' }])(
    'retains absent or structurally valid historical optional references without rewriting %s', reference => {
      const value = dataset(); Object.assign(value.core.executive.rows[0], { portfolio: reference, strategicOutcome: reference, classification: reference });
      Object.assign(value.impact.rows[0], { strategicOutcome: reference });
      const before = JSON.stringify(value);
      expect(validateReportingDataset(value)).toEqual([]);
      expect(JSON.stringify(value)).toBe(before);
    });
  it.each([
    ['executive', 'null-prototype'], ['executive', 'throwing'], ['executive', 'coercible'],
    ['impact', 'null-prototype'], ['impact', 'throwing'], ['impact', 'coercible']
  ])('rejects %s %s cut input without running coercion code', (view, kind) => {
    const value = dataset();
    const toString = jest.fn(() => { if (kind === 'throwing') throw new Error('Synthetic coercion must not execute'); return provenance.cutTimestamp; });
    const cutTimestamp = kind === 'null-prototype' ? Object.create(null) : { toString };
    const target = view === 'impact' ? value.impact : value.core.executive;
    target.provenance = Object.assign({}, provenance, { cutTimestamp });
    expect(() => validateReportingDataset(value)).not.toThrow();
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('complete provenance')]));
    expect(toString).not.toHaveBeenCalled();
  });
  it.each(['2026-09-21T23:30:00.000Z', '2026-09-22T00:30:00.000+01:00'])(
    'retains parseable textual governed cuts %s without changing source', cutTimestamp => {
      const value = dataset(); const shared = { ...provenance, cutTimestamp };
      [value.core.executive, value.core.pillar, value.core.portfolio, value.core.kpiDetail, value.impact, value.behaviour]
        .forEach(feed => { feed.provenance = shared; });
      value.deliverySummary!.provenance = shared;
      const before = JSON.stringify(value);
      expect(validateReportingDataset(value)).toEqual([]);
      expect(JSON.stringify(value)).toBe(before);
    });
  it.each([
    ['reportRunId', 'blank'], ['reportRunId', 'object'], ['reportRunId', 'null-prototype'],
    ['modelVersion', 'blank'], ['modelVersion', 'object'], ['modelVersion', 'null-prototype'],
    ['sourceReference', 'blank'], ['sourceReference', 'object'], ['sourceReference', 'null-prototype'],
    ['snapshotKey', 'blank'], ['snapshotKey', 'object'], ['snapshotKey', 'null-prototype']
  ])('rejects malformed shared provenance identifier %s %s even when all snapshot identities match', (field, kind) => {
        const invalid = kind === 'blank' ? ' ' : kind === 'object' ? {} : Object.create(null);
        const value = dataset(); const shared = Object.assign({}, provenance, { [field]: invalid });
        [value.core.executive, value.core.pillar, value.core.portfolio, value.core.kpiDetail, value.impact, value.behaviour]
          .forEach(feed => { feed.provenance = shared; });
        value.deliverySummary!.provenance = shared;
        if (field === 'snapshotKey') Object.assign(value.deliverySummary!, { snapshotKey: invalid });
        expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('complete provenance')]));
    });
  it('retains distinct valid textual source references on one governed report snapshot without rewriting them', () => {
    const value = dataset();
    value.impact.provenance = { ...provenance, sourceReference: 'Synthetic Impact source with spaces' };
    const before = JSON.stringify(value);
    expect(validateReportingDataset(value)).toEqual([]);
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each(['title', 'owner', 'resultDisplay', 'provenanceRef', 'subtitle', 'targetDisplay', 'kpiId', 'pillar'])(
    'rejects malformed Core row text %s before sorting/search/rendering', field => {
      const value = dataset(); Object.assign(value.core.executive.rows[0], { [field]: {} });
      expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('row identity, text or state')]));
    });
  it.each(['impactKey', 'title', 'owner', 'progressDisplay', 'resultDisplay', 'contributionDisplay', 'provenanceRef'])(
    'rejects malformed Impact row text %s before sorting/search/rendering', field => {
      const value = dataset(); Object.assign(value.impact.rows[0], { [field]: {} });
      expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('row identity, text or state')]));
    });
  it.each(['', 'Unexpected'])('rejects unknown Core and Impact submission states %s', submissionState => {
    const value = dataset(); Object.assign(value.core.executive.rows[0], { submissionState });
    Object.assign(value.impact.rows[0], { submissionState });
    expect(validateReportingDataset(value).filter(issue => issue.includes('row identity, text or state'))).toHaveLength(2);
  });
  it.each(['', 'Unexpected'])('rejects unknown Core RAG %s', rag => {
    const value = dataset(); Object.assign(value.core.executive.rows[1], { rag });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('row identity, text or state')]));
  });
  it('rejects duplicate Impact stable keys', () => {
    const value = dataset(); value.impact.rows[1].impactKey = value.impact.rows[0].impactKey;
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('duplicate Impact impactKey')]));
  });
  it('retains empty textual displays, optional text omissions and all defined states without rewriting source', () => {
    const value = dataset(); value.core.executive.rows[0].resultDisplay = '';
    value.impact.rows[0].progressDisplay = ''; value.impact.rows[0].resultDisplay = ''; value.impact.rows[0].contributionDisplay = '';
    const before = JSON.stringify(value);
    expect(validateReportingDataset(value)).toEqual([]);
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each(['person', 'team', 'manager', 'period'])('rejects malformed optional Impact scope %s', field => {
    const value = dataset(); Object.assign(value.impact.rows[0].scope!, { [field]: {} });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('filter scope')]));
  });
  it.each(['person', 'team', 'manager'])('rejects malformed optional Core scope %s', field => {
    const value = dataset(); Object.assign(value.core.executive.rows[0].scope!, { [field]: {} });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('filter scope')]));
  });
  it.each([null, [], 42])('rejects malformed Impact scope container %s', scope => {
    const value = dataset(); Object.assign(value.impact.rows[0], { scope });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('filter scope')]));
  });
  it.each([undefined, {}, { person: '', team: '', period: '2026 Q1' }])('retains optional Impact scope and independent valid period filters %s', scope => {
    const value = dataset(); Object.assign(value.impact.rows[0], { scope });
    const before = JSON.stringify(value);
    expect(validateReportingDataset(value)).toEqual([]);
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each(['', undefined, {}])('rejects absent or malformed reporting year %s', performanceYear => {
    const value = dataset(); Object.assign(value, { performanceYear });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('performance year')]));
  });
  it.each(['', undefined, {}])('rejects absent or malformed reporting freshness label %s', freshnessLabel => {
    const value = dataset(); value.impact.completeness = Object.assign({}, completeness, { freshnessLabel });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('freshness label')]));
  });
  it.each([0, Number.MAX_SAFE_INTEGER])('retains exact valid completeness totals at %s', expected => {
    const value = dataset(); value.core.executive.completeness = { expected, reportable: expected,
      notSubmitted: 0, awaitingApproval: 0, notRated: 0, missingData: 0, freshnessLabel: 'Synthetic governed cut' };
    const before = JSON.stringify(value);
    expect(validateReportingDataset(value)).toEqual([]);
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each(['expected', 'reportable', 'notSubmitted', 'awaitingApproval', 'notRated', 'missingData'] as const)(
    'rejects unsafe completeness %s even when rounded totals match', field => {
      const value = dataset();
      const unsafe = Number.MAX_SAFE_INTEGER + 1;
      const counts: IReportingCompleteness = { expected: unsafe, reportable: 0, notSubmitted: 0,
        awaitingApproval: 0, notRated: 0, missingData: 0, freshnessLabel: 'Synthetic governed cut' };
      counts[field === 'expected' ? 'reportable' : field] = unsafe;
      value.core.executive.completeness = counts;
      expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('completeness counts')]));
    });
  it.each(['2026-09-21T22:30:00.000Z', '2026-09-21T23:30:00.000+01:00'])(
    'retains assessments exactly at the configured cut %s without rewriting source history', cutTimestamp => {
      const value = dataset();
      value.behaviour.provenance = { ...value.behaviour.provenance, cutTimestamp };
      value.behaviour.assessments[0].recordedAt = '2026-09-21T22:30:00.000Z';
      const before = JSON.stringify(value);
      expect(calculateBehaviourHeadlines(value)).toHaveLength(5);
      expect(() => selectBehaviourPersonOptions(value)).not.toThrow();
      expect(JSON.stringify(value)).toBe(before);
    });
  it.each(['', 'not-a-date', undefined, null])('rejects an invalid governed Behaviour cut %s before selecting future records', cutTimestamp => {
    const value = dataset();
    value.behaviour.provenance = Object.assign({}, value.behaviour.provenance, { cutTimestamp });
    value.behaviour.assessments[0].recordedAt = '2040-01-01T00:00:00.000Z';
    expect(() => calculateBehaviourHeadlines(value)).toThrow();
    expect(() => selectBehaviourPersonOptions(value)).toThrow();
  });
  it('retains a safe maximum Behaviour version and original source history', () => {
    const value = dataset(); value.behaviour.assessments[0].version = Number.MAX_SAFE_INTEGER;
    const before = JSON.stringify(value);
    expect(() => calculateBehaviourHeadlines(value)).not.toThrow();
    expect(JSON.stringify(value)).toBe(before);
  });
  it('retains safe negative comparison ordering without inventing a minimum order', () => {
    const value = dataset(); value.behaviour.periods[0].order = Number.MIN_SAFE_INTEGER;
    const before = JSON.stringify(value);
    expect(() => calculateBehaviourHeadlines(value)).not.toThrow();
    expect(JSON.stringify(value)).toBe(before);
  });
  it.each([Number.MAX_SAFE_INTEGER + 1, 1e30])('rejects unsafe Behaviour assessment version %s', version => {
    const value = dataset(); value.behaviour.assessments[0].version = version;
    expect(() => calculateBehaviourHeadlines(value)).toThrow();
    expect(() => selectBehaviourPersonOptions(value)).toThrow();
  });
  it.each([Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1, 1e30, -1e30])(
    'rejects unsafe Behaviour comparison order %s', order => {
      const value = dataset(); value.behaviour.periods[0].order = order;
      expect(() => calculateBehaviourHeadlines(value)).toThrow();
      expect(() => selectBehaviourPersonOptions(value)).toThrow();
    });
  it.each([
    ['absent', undefined], ['null', null], ['array', []], ['scalar', 'invalid']
  ])('rejects an %s Behaviour catalogue with a governance issue and no throw', (_name, catalogue) => {
    const value = dataset();
    (value.governance as unknown as { behaviourCatalogue: unknown }).behaviourCatalogue = catalogue;
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([
      expect.stringContaining('governed Behaviour catalogue is absent or malformed')
    ]));
  });

  it.each([
    ['missing distributions', data => { delete (data.behaviour.headlines[0] as unknown as Record<string, unknown>).distributions; }],
    ['null distributions', data => { (data.behaviour.headlines[0] as unknown as Record<string, unknown>).distributions = null; }],
    ['object distributions', data => { (data.behaviour.headlines[0] as unknown as Record<string, unknown>).distributions = {}; }],
    ['empty distributions', data => { data.behaviour.headlines[0].distributions = []; }],
    ['null distribution item', data => { data.behaviour.headlines[0].distributions[0] = null as never; }],
    ['scalar distribution item', data => { data.behaviour.headlines[0].distributions[0] = 'bad' as never; }],
    ['duplicate classification', data => { data.behaviour.headlines[0].distributions[0].classification = 'Effective'; }],
    ['missing classification', data => { delete (data.behaviour.headlines[0].distributions[0] as unknown as Record<string, unknown>).classification; }],
    ['negative count', data => { data.behaviour.headlines[0].distributions[0].count = -1; }],
    ['fractional count', data => { data.behaviour.headlines[0].distributions[0].count = 1.5; }],
    ['non-numeric count', data => { data.behaviour.headlines[0].distributions[0].count = '1' as never; }],
    ['non-text display', data => { data.behaviour.headlines[0].distributions[0].display = {} as never; }],
    ['non-finite movement', data => { data.behaviour.headlines[0].distributions[0].movementPercentagePoints = Infinity; }],
    ['malformed headline reference', data => { data.behaviour.headlines[0].headlineReference = null as never; }],
    ['malformed catalogue array', data => { (data.governance!.behaviourCatalogue as unknown as Record<string, unknown>).headlineReferences = {}; }],
    ['malformed catalogue member', data => { data.governance!.behaviourCatalogue.headlineReferences[0] = null as never; }],
    ['null period', data => { data.behaviour.periods[0] = null as never; }],
    ['null assessment', data => { data.behaviour.assessments[0] = null as never; }]
  ] as Array<[string, (data: IReportingViewsDataset) => void]>)('rejects malformed Behaviour %s without throwing', (_name, mutate) => {
    const value = dataset();
    mutate(value);
    expect(validateReportingDataset(value).length).toBeGreaterThan(0);
  });

  it('accepts distinct Core keys within each feed for the selected governed period', () => {
    expect(validateReportingDataset(dataset())).toEqual([]);
  });

  it.each(['executive', 'pillar', 'portfolio', 'kpiDetail'] as const)('rejects missing and repeated Core keys in %s', feedName => {
    const value = dataset();
    const feed = value.core[feedName];
    feed.rows.push({ ...feed.rows[0] });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('duplicate Core rowKey')]));
    feed.rows.pop();
    feed.rows[0].rowKey = '  ';
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('stable rowKey')]));
  });

  it.each(['executive', 'pillar', 'portfolio', 'kpiDetail'] as const)('rejects absent and cross-period Core scope in %s', feedName => {
    const value = dataset();
    const feed = value.core[feedName];
    feed.rows[0].scope = undefined;
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('invalid or inconsistent report period')]));
    feed.rows[0].scope = { period: '2024 Q1' };
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('invalid or inconsistent report period')]));
  });

  it.each(['core', 'feed', 'rows', 'provenance', 'completeness'] as const)('fails closed without throwing on malformed %s structure', caseName => {
    const value = dataset();
    if (caseName === 'core') (value as unknown as { core?: unknown }).core = undefined;
    if (caseName === 'feed') (value.core as unknown as { executive?: unknown }).executive = undefined;
    if (caseName === 'rows') (value.core.executive as unknown as { rows?: unknown }).rows = undefined;
    if (caseName === 'provenance') (value.core.executive as unknown as { provenance?: unknown }).provenance = undefined;
    if (caseName === 'completeness') (value.core.executive as unknown as { completeness?: unknown }).completeness = undefined;
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('absent or malformed')]));
  });

  it('preserves every non-reportable Core state instead of promoting it to reportable or green', () => {
    const selected = selectCoreReportingRows(dataset().core.executive);
    expect(selected.map(row => [row.rowKey, row.submissionState, row.rag])).toEqual([
      ['ROW-1', 'Reportable', 'Green'],
      ['ROW-2', 'NotSubmitted', 'NotRated'],
      ['ROW-3', 'AwaitingApproval', 'NotRated'],
      ['ROW-4', 'NotRated', 'NotRated'],
      ['ROW-5', 'MissingData', 'NotRated']
    ]);
  });

  it('applies only governed filter and sort values and fails closed to stable defaults', () => {
    const selected = selectCoreReportingRows(dataset().core.executive, { submissionState: 'NotSubmitted', sort: 'Title', search: 'second' });
    expect(selected.map(row => row.rowKey)).toEqual(['ROW-2']);
    expect(normaliseReportingViewState({ submissionState: 'invalid' as never, sort: 'invalid' as never, search: 42 as never })).toEqual({
      search: '', submissionState: 'All', sort: 'StableKey', person: '', team: '', manager: '', period: '', contributionAreaId: ''
    });
  });

  it('applies person, team, manager and period scope filters without deriving new scope', () => {
    const selected = selectCoreReportingRows(dataset().core.executive, { person: 'Person A', team: 'North', manager: 'Manager A', period: '2026 Q2' });
    expect(selected.map(row => row.rowKey)).toEqual(['ROW-1']);
    expect(selectCoreReportingRows(dataset().core.executive, { person: 'Unknown person' })).toEqual([]);
  });

  it('keeps Impact rows in their separate feed and exposes optional governed references as optional', () => {
    const value = dataset();
    expect(selectCoreReportingRows(value.core.executive).some(row => row.rowKey.startsWith('IMP-'))).toBe(false);
    expect(selectImpactReportingRows(value, { search: 'participation' })).toHaveLength(1);
    expect(selectImpactReportingRows(value, { team: 'North', contributionAreaId: 'BCA-01' }).map(row => row.impactKey)).toEqual(['IMP-1']);
    expect(selectImpactReportingRows(value).find(row => row.impactKey === 'IMP-2')?.pillar).toBeUndefined();
  });

  it('keeps the Behaviour boundary at five classification profiles without a numeric score or RAG', () => {
    const selected = selectBehaviourHeadlines(dataset());
    expect(selected).toHaveLength(5);
    expect(selected.every(row => !Object.prototype.hasOwnProperty.call(row, 'rag') && !Object.prototype.hasOwnProperty.call(row, 'score'))).toBe(true);
    expect(selected[0].distributions.map(item => item.classification)).toEqual(['Developing', 'Effective', 'Exceptional']);
    expect(selectBehaviourHeadlines(dataset(), { manager: 'Manager B' })).toHaveLength(2);
  });

  it('retains a mixed-scope headline for the selected eligible team and manager population', () => {
    const value = dataset();
    const south = value.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.classification === 'Exceptional')!;
    south.state = 'Final';
    south.scope = { ...south.scope, team: 'South', manager: 'Manager B' };
    const byTeam = selectBehaviourHeadlines(value, { team: 'South' });
    expect(byTeam.map(row => row.behaviourKey)).toContain('BEH-001');
    expect(byTeam.find(row => row.behaviourKey === 'BEH-001')?.distributions.map(item => item.display)).toEqual([
      '0 (0.0%)', '0 (0.0%)', '1 (100.0%)'
    ]);
    const byManager = selectBehaviourHeadlines(value, { manager: 'Manager B' });
    expect(byManager.map(row => row.behaviourKey)).toContain('BEH-001');
    expect(byManager.find(row => row.behaviourKey === 'BEH-001')?.distributions.map(item => item.count)).toEqual([0, 0, 1]);
    expect(selectBehaviourHeadlines(value, { team: 'South', manager: 'Manager A' }).map(row => row.behaviourKey)).not.toContain('BEH-001');
    value.behaviour.periods[0].complete = true;
    value.behaviour.assessments.push({
      ...south, assessmentId: 'PRIOR-SOUTH', periodKey: '2026 Q1', classification: 'Developing',
      scope: { ...south.scope, period: '2026 Q1' }
    });
    expect(selectBehaviourHeadlines(value, { team: 'South' }).find(row => row.behaviourKey === 'BEH-001')?.movementDisplay).toContain('Exceptional +100.0 pp');
    value.behaviour.periods[0].complete = false;
    expect(selectBehaviourHeadlines(value, { team: 'South' }).find(row => row.behaviourKey === 'BEH-001')?.movementDisplay).toBe('No comparable prior period');
  });

  it('uses stable person keys when two eligible people share one display name', () => {
    const value = dataset();
    const first = value.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-1')!;
    const second = value.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-2')!;
    first.scope = { ...first.scope, person: second.scope!.person };
    const options = selectBehaviourPersonOptions(value);
    expect(options.filter(option => option.label.startsWith('Synthetic Person 2'))).toEqual([
      { value: 'SYNTHETIC-PERSON-1', label: 'Synthetic Person 2 (SYNTHETIC-PERSON-1)' },
      { value: 'SYNTHETIC-PERSON-2', label: 'Synthetic Person 2 (SYNTHETIC-PERSON-2)' }
    ]);
    const selected = (person: string): IBehaviourHeadline | undefined =>
      selectBehaviourHeadlines(value, { person }).find(row => row.behaviourKey === 'BEH-001');
    expect(selected(first.personKey)?.distributions.map(item => item.count)).toEqual([1, 0, 0]);
    expect(selected(second.personKey)?.distributions.map(item => item.count)).toEqual([0, 1, 0]);
    expect(selected('Synthetic Person 2')).toBeUndefined();
    second.scope = { ...second.scope, team: 'South', manager: 'Manager B' };
    expect(selectBehaviourHeadlines(value, { person: second.personKey, team: 'South', manager: 'Manager B' })
      .find(row => row.behaviourKey === 'BEH-001')?.distributions.map(item => item.count)).toEqual([0, 1, 0]);
    expect(selectBehaviourHeadlines(value, { person: first.personKey, team: 'South', manager: 'Manager B' })
      .find(row => row.behaviourKey === 'BEH-001')).toBeUndefined();
    value.behaviour.periods[0].complete = true;
    value.behaviour.assessments.push({
      ...second, assessmentId: 'PRIOR-SECOND-PERSON', periodKey: '2026 Q1', classification: 'Developing',
      scope: { ...second.scope, period: '2026 Q1' }
    });
    expect(selected(second.personKey)?.movementDisplay).toContain('Effective +100.0 pp');
  });

  it('keeps only the latest eligible person label and rejects a conflicting source identity', () => {
    const value = dataset();
    const first = value.behaviour.assessments.find(record => record.behaviourKey === 'BEH-001' && record.personKey === 'SYNTHETIC-PERSON-1')!;
    first.scope = { ...first.scope, person: 'Superseded name' };
    value.behaviour.assessments.push({ ...first, assessmentId: 'LATEST-PERSON-1', version: 2, state: 'Final', scope: { ...first.scope, person: 'Current name' } });
    value.behaviour.assessments.push({ ...first, assessmentId: 'DRAFT-GHOST', personKey: 'GHOST-KEY', version: 1, state: 'Draft', scope: { ...first.scope, person: 'Ghost name' } });
    const options = selectBehaviourPersonOptions(value);
    expect(options.find(option => option.value === first.personKey)?.label).toBe('Current name');
    expect(options.some(option => option.label === 'Superseded name' || option.value === 'GHOST-KEY')).toBe(false);
    value.behaviour.assessments.push({ ...first, personKey: 'CONFLICTING-KEY', scope: { ...first.scope, person: 'Other person' } });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('conflicting source records')]));
  });

  it('uses the latest eligible final or manager-approved version and excludes drafts, unapproved, unrated and repeated source IDs', () => {
    const value = dataset();
    const first = value.behaviour.assessments[0];
    value.behaviour.assessments.push(
      { ...first, assessmentId: 'FINAL-V2', version: 2, state: 'Final', classification: 'Effective' },
      { ...first, assessmentId: 'DRAFT-V3', version: 3, state: 'Draft', classification: 'Exceptional' },
      { ...first, assessmentId: 'UNAPPROVED-V3', version: 3, state: 'AwaitingApproval', classification: 'Exceptional' },
      { ...first, assessmentId: 'UNRATED-V4', version: 4, state: 'ManagerApproved', classification: undefined },
      { ...first }
    );
    const headline = selectBehaviourHeadlines(value)[0];
    expect(headline.distributions.map(item => [item.count, item.display])).toEqual([
      [0, '0 (0.0%)'], [2, '2 (66.7%)'], [1, '1 (33.3%)']
    ]);
    expect(headline.submissionState).toBe('Reportable');
  });

  it('fails closed on tied latest versions or a conflicting assessment ID', () => {
    const value = dataset();
    const first = value.behaviour.assessments[0];
    value.behaviour.assessments.push({ ...first, assessmentId: 'TIED-OTHER-SOURCE' });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('Ambiguous latest eligible')]));
    expect(() => selectBehaviourHeadlines(value)).toThrow('Ambiguous latest eligible');
    value.behaviour.assessments.pop();
    value.behaviour.assessments.push({ ...first, classification: 'Effective' });
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('conflicting source records')]));
  });

  it('uses timestamp within a version, version before timestamp, and filters only the selected source', () => {
    const value = dataset();
    const first = value.behaviour.assessments[0];
    value.behaviour.assessments.push({ ...first, assessmentId: 'LATER-V1', recordedAt: '2026-09-20T11:00:00.000Z', classification: 'Effective' });
    expect(selectBehaviourHeadlines(value)[0].distributions.map(item => item.count)).toEqual([0, 2, 1]);
    value.behaviour.assessments.push({
      ...first, assessmentId: 'FINAL-V2', version: 2, recordedAt: '2026-09-19T11:00:00.000Z',
      classification: 'Exceptional', scope: { ...first.scope, team: 'South' }
    });
    expect(selectBehaviourHeadlines(value)[0].distributions.map(item => item.count)).toEqual([0, 1, 2]);
    expect(selectBehaviourHeadlines(value, { team: 'North' })[0].distributions.map(item => item.count)).toEqual([0, 1, 1]);
  });

  it('keeps a zero eligible denominator and an incomplete current period explicit', () => {
    const value = dataset();
    value.behaviour.assessments = value.behaviour.assessments.filter(record => record.behaviourKey !== 'BEH-001');
    const empty = selectBehaviourHeadlines(value)[0];
    expect(empty.submissionState).toBe('NotRated');
    expect(empty.distributions.every(item => item.percentage === undefined && item.display === '0 (No eligible assessed records)')).toBe(true);
    expect(empty.movementDisplay).toBe('No comparable prior period');
    value.behaviour.periods[1].complete = false;
    const incomplete = selectBehaviourHeadlines(value)[0];
    expect(incomplete.submissionState).toBe('MissingData');
    expect(incomplete.distributions.every(item => item.display === 'Current period incomplete')).toBe(true);
    expect(incomplete.movementDisplay).toBe('Current period incomplete');
  });

  it('compares eligible percentages with the immediately preceding complete period as signed percentage points', () => {
    const value = dataset();
    value.behaviour.periods[0].complete = true;
    const current = value.behaviour.assessments.filter(record => record.behaviourKey === 'BEH-001');
    value.behaviour.assessments.push(...current.map((record, index) => ({
      ...record,
      assessmentId: `PRIOR-${index}`,
      periodKey: '2026 Q1',
      classification: index === 1 ? 'Developing' as const : record.classification,
      scope: { ...record.scope, period: '2026 Q1' }
    })));
    const headline = selectBehaviourHeadlines(value)[0];
    expect(headline.distributions.map(item => item.display)).toEqual(['1 (33.3%)', '1 (33.3%)', '1 (33.3%)']);
    expect(headline.distributions.map(item => item.movementPercentagePoints?.toFixed(1))).toEqual(['-33.3', '33.3', '0.0']);
    expect(headline.movementDisplay).toContain('Developing -33.3 pp');
    expect(headline.movementDisplay).toContain('Effective +33.3 pp');
  });

  it('never skips an incomplete immediate prior period or fabricates a comparison when it is absent', () => {
    const value = dataset();
    value.behaviour.periods.unshift({ periodKey: '2025 Q4', comparisonSeriesKey: 'Quarterly', order: 0, complete: true, provenanceRef: 'OLDER-COMPLETE' });
    value.behaviour.assessments.push(...value.behaviour.assessments.filter(record => record.behaviourKey === 'BEH-001').map((record, index) => ({
      ...record, assessmentId: `OLDER-${index}`, periodKey: '2025 Q4', scope: { ...record.scope, period: '2025 Q4' }
    })));
    expect(selectBehaviourHeadlines(value)[0].movementDisplay).toBe('No comparable prior period');
    expect(selectBehaviourHeadlines(value)[0].distributions.every(item => item.movementPercentagePoints === undefined)).toBe(true);
    value.behaviour.periods = value.behaviour.periods.filter(period => period.periodKey === '2026 Q2');
    value.behaviour.assessments = value.behaviour.assessments.filter(record => record.periodKey === '2026 Q2');
    expect(selectBehaviourHeadlines(value)[0].movementDisplay).toBe('No comparable prior period');
  });

  it('rejects missing assessment provenance and ambiguous ordered periods', () => {
    const value = dataset();
    value.behaviour.assessments[0].provenanceRef = '';
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('provenance is invalid')]));
    value.behaviour.assessments[0].provenanceRef = 'RESTORED';
    value.behaviour.periods[0].order = 2;
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([expect.stringContaining('period identity, provenance or order is ambiguous')]));
  });

  it('applies person and period filters to the assessment population without changing Delivery inputs', () => {
    const value = dataset();
    const delivery = JSON.stringify(value.deliverySummary);
    const selected = selectBehaviourHeadlines(value, { person: 'SYNTHETIC-PERSON-1', team: 'North', period: '2026 Q2' });
    expect(selected).toHaveLength(3);
    expect(selected.every(headline => headline.distributions.reduce((sum, item) => sum + item.count, 0) === 1)).toBe(true);
    expect(JSON.stringify(value.deliverySummary)).toBe(delivery);
  });

  it('rejects incomplete provenance and an incomplete five-headline Behaviour feed', () => {
    const value = dataset();
    value.core.executive.provenance = { ...provenance, cutTimestamp: 'not-a-date' };
    value.behaviour.headlines = value.behaviour.headlines.slice(0, 4);
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([
      expect.stringContaining('valid cut timestamp'),
      expect.stringContaining('exactly five')
    ]));
  });

  it('fails closed on inconsistent completeness or a non-reportable Core RAG', () => {
    const value = dataset();
    value.core.executive.completeness = { ...completeness, expected: 6 };
    value.core.pillar.rows[2] = { ...value.core.pillar.rows[2], rag: 'Green' };
    expect(validateReportingDataset(value)).toEqual(expect.arrayContaining([
      expect.stringContaining('must total the expected count'),
      expect.stringContaining('cannot present a RAG while NotSubmitted')
    ]));
  });

  it('defines deterministic desktop, tablet and phone layout contracts', () => {
    expect(getReportingLayoutContract(1440)).toEqual({ mode: 'desktop', tabColumns: 6, summaryColumns: 6, contentColumns: 2 });
    expect(getReportingLayoutContract(900)).toEqual({ mode: 'tablet', tabColumns: 3, summaryColumns: 3, contentColumns: 1 });
    expect(getReportingLayoutContract(390)).toEqual({ mode: 'phone', tabColumns: 1, summaryColumns: 1, contentColumns: 1 });
    expect(() => getReportingLayoutContract(0)).toThrow('positive finite');
  });

  it('supports arrow, Home and End keyboard transitions with wrap-around', () => {
    expect(getNextReportingView('executive', 'ArrowLeft')).toBe('behaviour');
    expect(getNextReportingView('portfolio', 'ArrowRight')).toBe('kpiDetail');
    expect(getNextReportingView('impact', 'Home')).toBe('executive');
    expect(getNextReportingView('pillar', 'End')).toBe('behaviour');
    expect(getNextReportingView('pillar', 'Enter')).toBe('pillar');
  });
});
