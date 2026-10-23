import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type {
  IAnnualWorkplan,
  IBehaviourSummary,
  IBehaviourWorkplanItem,
  IProductionConfig,
  IProductionOverview,
  IProductionPerson
} from '../models/ProductionModels';
import type { IQuarterLifecycle, IQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import OverviewPage from './OverviewPage';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';
import QuarterlyReviewPage from './QuarterlyReviewPage';

const employee: IProductionPerson = {
  id: 1, personKey: 'employee', displayName: 'Employee', email: 'employee@example.test',
  managerPersonKey: 'manager', managerEmail: 'manager@example.test', appRoles: ['Employee'], active: true
};
const manager: IProductionPerson = {
  id: 2, personKey: 'manager', displayName: 'Manager', email: 'manager@example.test', appRoles: ['Manager'], active: true
};
const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'employee|2026', personKey: employee.personKey,
  employeeDisplayName: employee.displayName, employeeEmail: employee.email, performanceYear: 2026,
  managerPersonKey: manager.personKey, managerDisplayName: manager.displayName, managerEmail: manager.email,
  state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready', submittedAt: '2026-08-20T12:00:00Z',
  submittedByEmail: employee.email, coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10,
  rowVersionToken: 1
};
const config: IProductionConfig = {
  performanceYear: '2025/26', performanceYearStart: '2025-11-01T00:00:00Z', performanceYearEnd: '2026-10-31T23:59:59Z',
  performanceYearNumber: 2026, quarters: { q1: 'Nov–Jan', q2: 'Feb–Apr', q3: 'May–Jul', q4: 'Aug–Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 }, rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: ['DirectMetric'], retentionStatus: 'TBC'
};
const definitions: IBehaviourSummary[] = Array.from({ length: 5 }, (_, index) => ({
  behaviourId: `BHV-0${index + 1}`, behaviourVersionKey: `BHV-0${index + 1}|v01`, title: `Behaviour ${index + 1}`,
  description: 'Controlled Behaviour definition', assessmentGuidance: 'Prompt1: One\nPrompt2: Two\nPrompt3: Three\nPrompt4: Four\nPrompt5: Five',
  defaultWorkplanWeight: 20, displayOrder: index + 1
}));
const annualItems: IBehaviourWorkplanItem[] = definitions.map((definition, index) => ({
  id: index + 1, etag: '"1"', workplanItemKey: `behaviour-${index + 1}`,
  naturalKey: `${workplan.workplanKey}|Behaviour|${definition.behaviourId}`, workplanKey: workplan.workplanKey,
  personKey: employee.personKey, performanceYear: 2026, behaviourId: definition.behaviourId,
  behaviourVersionKey: definition.behaviourVersionKey, behaviourItemWeight: 20, displayOrder: index + 1,
  activeInWorkplan: true
}));
const quarterItems: IQuarterReviewItem[] = annualItems.map((item, index) => ({
  id: index + 1, etag: '"1"', quarterReviewItemKey: `review|${item.behaviourId}`,
  quarterReviewKey: 'employee|2026|Q4', workplanItemKey: item.workplanItemKey, workplanKey: workplan.workplanKey,
  personKey: employee.personKey, performanceYear: 2026, quarter: 'Q4', itemType: 'Behaviour', wording: `Behaviour ${index + 1}`,
  calculatedRag: 'NotRated', evidenceCount: 0, behaviourId: item.behaviourId,
  behaviourVersionKey: item.behaviourVersionKey, managerApproved: false, locked: false
}));
const lifecycle: IQuarterLifecycle = {
  performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q4', quarterName: 'Q4 · Aug–Oct',
  quarterStart: '2026-08-01', quarterEnd: '2026-10-31', isCurrentQuarter: true, isOpenForProgressUpdates: true,
  employeeSubmissionDeadline: '2026-11-07', managerReviewDeadline: '2026-11-14',
  reminderMilestones: { earlyReview: '2026-10-01', preparation: '2026-10-17', final: '2026-10-24' }, status: 'Open', priorQuarter: 'Q3'
};

describe('legacy Submitted Behaviour compatibility presentation', () => {
  it('shows one candid compatibility treatment on Overview without claiming completion', () => {
    const overview: IProductionOverview = {
      employee, manager, config, workplanStatus: 'Submitted',
      readiness: { ready: true, checks: [], blockers: [], warnings: [], nextAction: 'Review the Workplan.' }, loadMessages: []
    };
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(OverviewPage, {
      overview, fallbackDisplayName: employee.displayName, currentUserEmail: employee.email, workplan,
      coreCatalogue: [], coreItems: [], personalItems: [], behaviours: definitions, behaviourItems: annualItems,
      workplanDataState: 'available', submitting: false, storageAclStatus: 'InheritedDependency', onSubmit: async () => undefined
    }));
    expect(html).toContain('5 of 5 headings assigned · 0 of 5 current objectives complete');
    expect(html).toContain('Submitted legacy framework · update required');
    expect(html).not.toContain('5 of 5 headings · 100% allocated');
  });

  it('replaces the raw annual validation wall with the controlled manager route', () => {
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(BehaviourWorkplanPage, {
      workplan, behaviours: definitions, library: [], items: annualItems, saving: false, onSave: async () => undefined
    }));
    expect(html).toContain('does not contain the complete current Behaviour objectives and Q1–Q4 targets');
    expect(html).toContain('Only the genuinely authenticated assigned manager may use Request Changes');
    expect(html).toContain('<option selected="" value="">Choose a target rating…</option>');
    expect(html).not.toContain('<option selected="" value="3">3 — Meets expectations</option>');
    expect(html).not.toContain('library selection needs its source objective key');
    expect(html).not.toContain('needs an objective.');
  });

  it('allows genuine Q1–Q4 targets to complete the Request Changes correction path without inventing a legacy target', () => {
    const corrected = annualItems.map(item => ({
      ...item,
      objectiveSource: 'Custom' as const,
      objectiveTitle: 'Controlled objective',
      objectiveDescription: 'Controlled description',
      measure: 'Observable delivery',
      unit: 'commitments',
      evidenceDefinition: 'Quarterly evidence',
      q1TargetText: 'Q1 commitment', q2TargetText: 'Q2 commitment',
      q3TargetText: 'Q3 commitment', q4TargetText: 'Q4 commitment',
      q1TargetRating: 3 as const, q2TargetRating: 3 as const,
      q3TargetRating: 3 as const, q4TargetRating: 3 as const
    }));
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(BehaviourWorkplanPage, {
      workplan: { ...workplan, state: 'ChangesRequested', accessState: 'EmployeeEdit' },
      behaviours: definitions, library: [], items: corrected, saving: false, onSave: async () => undefined
    }));
    expect(html).toMatch(/<button[^>]*>Save Behaviour Draft<\/button>/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Save Behaviour Draft<\/button>/);
  });

  it('states the same compatibility blocker on Quarterly Review while leaving item inputs empty', () => {
    const context: IQuarterReviewContext = {
      lifecycle,
      review: {
        id: 1, etag: '"1"', quarterReviewKey: 'employee|2026|Q4', workplanKey: workplan.workplanKey,
        personKey: employee.personKey, employeeDisplayName: employee.displayName, employeeEmail: employee.email,
        performanceYear: 2026, quarter: 'Q4', managerPersonKey: manager.personKey, managerDisplayName: manager.displayName,
        managerEmail: manager.email, state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready', rowVersionToken: 1
      },
      employee, manager, coreCatalogue: [], behaviours: definitions, items: quarterItems, progressLedgers: [], evidence: [],
      readiness: { ready: false, blockers: [], warnings: [], coreComplete: 0, personalComplete: 0, behavioursComplete: 0 },
      dataFoundationReady: true, messages: []
    };
    const html = ReactDOMServer.renderToStaticMarkup(React.createElement(QuarterlyReviewPage, {
      workplan, config, lifecycles: [lifecycle], selectedQuarter: 'Q4', context, loading: false, saving: false,
      onSelectQuarter: async () => undefined, onPrepare: async () => undefined, onSaveItem: async () => undefined,
      onAddProgress: async () => undefined, onSubmit: async () => undefined
    }));
    expect(html).toContain('Quarterly Behaviour readiness remains blocked');
    expect(html).toContain('No missing target or assessment has been inferred');
    expect(html).toContain('Only the genuinely authenticated assigned manager may use Request Changes');
    expect(html).toContain('Not configured — missing from legacy Workplan');
  });
});
