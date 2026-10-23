import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type {
  IAnnualWorkplan,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  ICoreKpiCatalogueItem,
  ICoreWorkplanItem,
  IProductionOverview
} from '../models/ProductionModels';
import OverviewPage from './OverviewPage';
import { WorkplanSectionUnavailable } from './WorkplanDataUnavailable';

const overview: IProductionOverview = {
  employee: {
    id: 1,
    personKey: 'person-1',
    displayName: 'Synthetic Person 02',
    email: 'person003@example.invalid',
    managerEmail: 'person002@example.invalid',
    appRoles: ['Employee'],
    active: true
  },
  config: {
    performanceYear: '2025/26',
    performanceYearStart: '2025-11-01',
    performanceYearEnd: '2026-10-31',
    performanceYearNumber: 2026,
    quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' },
    weights: { core: 70, personal: 20, behaviours: 10 },
    rag: { greenThreshold: 90, amberThreshold: 50 },
    aggregationMethods: ['DirectMetric'],
    retentionStatus: 'Controlled dependency'
  },
  counts: { activeKpis: 109, approvedAnnualTargets: 109, publishedBehaviours: 5 },
  workplanStatus: 'Submitted',
  readiness: { ready: true, checks: [], blockers: [], warnings: [], nextAction: 'Review the submitted Workplan.' },
  loadMessages: []
};

const workplan: IAnnualWorkplan = {
  id: 1,
  etag: '"3"',
  workplanKey: 'person-1|2026',
  personKey: 'person-1',
  employeeDisplayName: 'Synthetic Person 02',
  employeeEmail: 'person003@example.invalid',
  performanceYear: 2026,
  state: 'Submitted',
  accessState: 'ManagerDecision',
  transitionStatus: 'Ready',
  coreCategoryWeight: 70,
  personalCategoryWeight: 20,
  behaviourCategoryWeight: 10,
  submittedAt: '2026-08-19T22:44:39Z',
  submittedByEmail: 'person003@example.invalid',
  rowVersionToken: 3
};

const catalogue: ICoreKpiCatalogueItem[] = [{
  kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|v01',
  targetVersionKey: 'SO1-001|2026|v01',
  wording: 'Programmes delivered',
  pillar: 'Pillar 1',
  workstream: 'Participation',
  scoringDirection: 'HigherIsBetter',
  unitLabel: 'programmes'
}];

const coreItems: ICoreWorkplanItem[] = [{
  id: 1,
  etag: '"4"',
  workplanItemKey: 'core-1',
  naturalKey: 'person-1|2026|CoreGold|SO1-001',
  workplanKey: 'person-1|2026',
  personKey: 'person-1',
  performanceYear: 2026,
  kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|v01',
  targetVersionKey: 'SO1-001|2026|v01',
  coreWorkplanWeight: 100,
  employeeKpiRole: 'Contributor',
  displayOrder: 1,
  activeInWorkplan: true
}];

const behaviours: IBehaviourSummary[] = Array.from({ length: 5 }, (_, index) => ({
  behaviourId: `BHV-0${index + 1}`,
  behaviourVersionKey: `BHV-0${index + 1}|v01`,
  title: `Behaviour ${index + 1}`,
  description: `Controlled behaviour ${index + 1}`,
  defaultWorkplanWeight: 20,
  displayOrder: index + 1
}));

const behaviourItems: IBehaviourWorkplanItem[] = behaviours.map((behaviour, index) => ({
  id: index + 3,
  etag: '"3"',
  workplanItemKey: `behaviour-${index + 1}`,
  naturalKey: `person-1|2026|Behaviour|${behaviour.behaviourId}`,
  workplanKey: 'person-1|2026',
  personKey: 'person-1',
  performanceYear: 2026,
  behaviourId: behaviour.behaviourId,
  behaviourVersionKey: behaviour.behaviourVersionKey,
  behaviourItemWeight: 20,
  displayOrder: index + 1,
  activeInWorkplan: true
}));

const renderOverview = (props: Partial<React.ComponentProps<typeof OverviewPage>> = {}): string => ReactDOMServer.renderToStaticMarkup(
  React.createElement(OverviewPage, {
    overview,
    fallbackDisplayName: 'Synthetic Person 02',
    currentUserEmail: 'person003@example.invalid',
    coreCatalogue: [],
    coreItems: [],
    personalItems: [],
    behaviours: [],
    behaviourItems: [],
    workplanDataState: 'unavailable',
    submitting: false,
    storageAclStatus: 'InheritedDependency',
    onSubmit: async () => undefined,
    ...props
  })
);

describe('Workplan unavailable UI', () => {
  it('replaces plausible zero progress counters with an explicit support state after a failed read', () => {
    const markup = renderOverview({ workplanDataMessage: 'The Annual Workplan could not be loaded safely.' });

    expect(markup).toContain('Workplan data unavailable');
    expect(markup).toContain('The Annual Workplan could not be loaded safely.');
    expect(markup).toContain('person003@example.invalid');
    expect(markup).toContain('2025/26');
    expect(markup).not.toContain('Header status');
    expect(markup).not.toContain('Foundational readiness');
    expect(markup).not.toContain('Core KPIs selected');
    expect(markup).not.toContain('Behaviours assigned');
    expect(markup).not.toContain('Cross-section validation');
  });

  it('keeps verified production counts on the successful-load path', () => {
    const markup = renderOverview({
      workplan,
      coreCatalogue: catalogue,
      coreItems,
      behaviours,
      behaviourItems,
      workplanDataState: 'available'
    });

    expect(markup).toContain('<strong>1</strong><span>Core KPIs selected</span>');
    expect(markup).toContain('<strong>100%</strong><span>Core planning weight</span>');
    expect(markup).toContain('<strong>5 / 5</strong><span>Behaviours assigned</span>');
    expect(markup).not.toContain('Workplan data unavailable');
  });

  it('renders a controlled support state instead of a blank section page', () => {
    const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(WorkplanSectionUnavailable, {
      state: 'unavailable',
      overview,
      currentUserEmail: 'person003@example.invalid',
      sectionName: 'Core Strategy KPIs',
      description: 'Verified Core data is required.'
    }));

    expect(markup).toContain('Core Strategy KPIs');
    expect(markup).toContain('Workplan data unavailable');
    expect(markup).toContain('Workplan support details');
    expect(markup).toContain('No Workplan values or actions are shown until the current data is confirmed.');
  });
});
