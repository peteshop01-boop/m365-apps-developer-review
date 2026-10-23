import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type { IAnnualWorkplan, IBehaviourSummary, IBehaviourWorkplanItem, IProductionOverview } from '../models/ProductionModels';
import type { IEmployeePerformanceSummary } from '../services/EmployeePerformanceSummary';
import BehavioursPage from './BehavioursPage';
import CategoryWeightingPanel from './CategoryWeightingPanel';
import EmployeePerformancePanel from './EmployeePerformancePanel';
import OverviewPage from './OverviewPage';

const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'person|2026', personKey: 'person', employeeDisplayName: 'Synthetic Person 02',
  employeeEmail: 'person003@example.invalid', performanceYear: 2026, managerDisplayName: 'Synthetic Person 01',
  managerEmail: 'person002@example.invalid', state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready',
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, submittedAt: '2026-08-20T12:00:00Z',
  submittedByEmail: 'person003@example.invalid', rowVersionToken: 1
};

const overview: IProductionOverview = {
  employee: { id: 1, personKey: 'person', displayName: 'Synthetic Person 02', email: 'person003@example.invalid', managerEmail: 'person002@example.invalid', appRoles: ['Employee'], active: true },
  manager: { id: 2, personKey: 'manager', displayName: 'Synthetic Person 01', email: 'person002@example.invalid', appRoles: ['Employee'], active: true },
  config: {
    performanceYear: '2025/26', performanceYearStart: '2025-11-01', performanceYearEnd: '2026-10-31', performanceYearNumber: 2026,
    quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' }, weights: { core: 70, personal: 20, behaviours: 10 },
    rag: { greenThreshold: 90, amberThreshold: 50 }, aggregationMethods: ['DirectMetric'], retentionStatus: 'Controlled'
  },
  counts: { activeKpis: 109, approvedAnnualTargets: 109, publishedBehaviours: 5 }, workplanStatus: 'Submitted',
  readiness: { ready: true, checks: [], blockers: [], warnings: [], nextAction: 'Review.' }, loadMessages: []
};

const guidance = (value: string): string => `Corporate Value: ${value}\nObservable prompts:\n1. Prompt one.\n2. Prompt two.\n3. Prompt three.\n4. Prompt four.\n5. Prompt five.\nRating options: Meets expectations; Developing.`;
const headings = ['Work as One Team', 'Improve and Move Forward', 'Show Respect and Listen', 'Bring Energy and Commitment', 'Own It and Put It Right'];
const behaviours: IBehaviourSummary[] = headings.map((title, index) => ({
  behaviourId: `BHV-0${index + 1}`, behaviourVersionKey: `BHV-0${index + 1}|v01`, title,
  description: `${title} signed description.`, assessmentGuidance: guidance(`Value ${index + 1}`), defaultWorkplanWeight: 20, displayOrder: index + 1
}));
const behaviourItems: IBehaviourWorkplanItem[] = behaviours.map((behaviour, index) => ({
  id: index + 1, etag: '"1"', workplanItemKey: `behaviour-${index + 1}`, naturalKey: `person|2026|Behaviour|${behaviour.behaviourId}`,
  workplanKey: workplan.workplanKey, personKey: workplan.personKey, performanceYear: 2026, behaviourId: behaviour.behaviourId,
  behaviourVersionKey: behaviour.behaviourVersionKey, behaviourItemWeight: 20, displayOrder: index + 1, activeInWorkplan: true
}));

describe('KCF-KPI-017 employee Workplan UX', () => {
  it('presents employee status without exposing implementation readiness fields', () => {
    const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(OverviewPage, {
      overview, fallbackDisplayName: 'Synthetic Person 02', currentUserEmail: 'person003@example.invalid', workplan,
      coreCatalogue: [], coreItems: [], personalItems: [], behaviours, behaviourItems, quarterItems: [],
      workplanDataState: 'available', submitting: false, storageAclStatus: 'InheritedDependency', onSubmit: async () => undefined
    }));
    expect(markup).toContain('My Workplan status');
    expect(markup).not.toContain('Technical information for Admin / Support');
    expect(markup).not.toContain('system prerequisites');
    expect(markup).not.toContain('ACL');
    expect(markup).not.toContain('>Aggregation<');
    expect(markup).not.toContain('>Retention<');
    expect(markup).not.toContain('>Unlock<');
    expect(markup).not.toContain('Verify submission');
  });

  it('distinguishes category weights from performance and exposes only controlled local override inputs', () => {
    const readOnly = ReactDOMServer.renderToStaticMarkup(React.createElement(CategoryWeightingPanel, { weights: { core: 70, personal: 20, behaviours: 10 }, workplanState: 'Submitted' }));
    expect(readOnly).toContain('planning weights, not delivery scores');
    expect(readOnly).toContain('Core and Impact weighting');
    expect(readOnly).toContain('Overall Delivery score');
    expect(readOnly).toContain('Behaviour ratings');
    expect(readOnly).not.toContain('Personal KPIs');
    expect(readOnly).not.toContain('<input');
    const local = ReactDOMServer.renderToStaticMarkup(React.createElement(CategoryWeightingPanel, { weights: { core: 60, personal: 30, behaviours: 10 }, workplanState: 'Draft', editable: true, localUat: true }));
    expect(local).toContain('Required reason');
    expect(local).toContain('Simulate manager/Admin approval locally');
  });

  it('shows all five signed Behaviour headings with exactly five prompts and no numeric RAG', () => {
    const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(BehavioursPage, {
      workplan, behaviours, items: behaviourItems, saving: false, onAssign: async () => undefined, onRemove: async () => undefined
    }));
    headings.forEach(heading => expect(markup).toContain(heading));
    const promptLists = markup.match(/<ol[^>]*>[\s\S]*?<\/ol>/g) || [];
    expect(promptLists).toHaveLength(5);
    expect(promptLists.reduce((count, list) => count + (list.match(/<li>/g) || []).length, 0)).toBe(25);
    expect(markup).toContain('No numeric Behaviour-to-RAG conversion is currently approved.');
  });

  it('leaves Behaviour and Overall results explicitly unresolved', () => {
    const summary: IEmployeePerformanceSummary = {
      core: { key: 'core', label: 'Core performance', state: 'NotRated', rag: 'NotRated', explanation: 'No rated result.' },
      personal: { key: 'personal', label: 'Personal performance', state: 'NotRated', rag: 'NotRated', explanation: 'No rated result.' },
      behaviours: { key: 'behaviours', label: 'Behaviours', state: 'NotRated', rag: 'NotRated', explanation: 'Assessment pending.' },
      overall: { key: 'overall', label: 'Overall performance', state: 'NotAvailable', explanation: 'Policy is not approved.' }
    };
    const markup = ReactDOMServer.renderToStaticMarkup(React.createElement(EmployeePerformancePanel, { summary }));
    expect(markup).toContain('Impact delivery score');
    expect(markup).toContain('Overall Delivery score');
    expect(markup).toContain('Behaviour ratings');
    expect(markup).not.toContain('Personal performance');
    expect(markup).not.toContain('Overall performance');
    expect(markup).toContain('Not rated');
    expect(markup).toContain('Not yet available');
    expect(markup).not.toContain('Green');
  });
});
