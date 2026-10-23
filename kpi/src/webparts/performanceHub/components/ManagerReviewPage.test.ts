import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type { IManagerWorkplanReviewContext } from '../models/ProductionModels';
import ManagerReviewPage from './ManagerReviewPage';

const context: IManagerWorkplanReviewContext = {
  workplan: {
    id: 1,
    etag: '"3"',
    workplanKey: 'Synthetic User|2026',
    personKey: 'Synthetic User',
    employeeDisplayName: 'Synthetic Person 02',
    employeeEmail: 'person003@example.invalid',
    performanceYear: 2026,
    managerPersonKey: 'SyntheticUser',
    managerDisplayName: 'Synthetic Person 01',
    managerEmail: 'person002@example.invalid',
    state: 'Submitted',
    accessState: 'ManagerDecision',
    transitionStatus: 'Ready',
    coreCategoryWeight: 70,
    personalCategoryWeight: 20,
    behaviourCategoryWeight: 10,
    categoryWeightReason: 'Role-specific balance agreed for this submission.',
    submittedAt: '2026-08-20T09:30:00Z',
    rowVersionToken: 3
  },
  employee: {
    id: 1,
    personKey: 'Synthetic User',
    displayName: 'Synthetic Person 02',
    email: 'person003@example.invalid',
    managerPersonKey: 'SyntheticUser',
    managerEmail: 'person002@example.invalid',
    appRoles: ['Employee'],
    active: true
  },
  manager: {
    id: 2,
    personKey: 'SyntheticUser',
    displayName: 'Synthetic Person 01',
    email: 'person002@example.invalid',
    appRoles: ['Manager'],
    active: true
  },
  coreCatalogue: [],
  coreItems: [],
  personalItems: [{
    id: 10,
    etag: '"2"',
    workplanItemKey: 'personal-1',
    naturalKey: 'Synthetic User|2026|LocalPersonal|personal-1',
    workplanKey: 'Synthetic User|2026',
    personKey: 'Synthetic User',
    performanceYear: 2026,
    wording: 'Grow programme reach',
    description: 'Increase regular participant reach across priority projects.',
    measure: 'Regular participants',
    measureType: 'Count',
    scoringDirection: 'HigherIsBetter',
    percentageSourceScale: 'Whole',
    baselineValue: 100,
    yearEndTargetValue: 180,
    q1TargetValue: 120,
    q2TargetValue: 140,
    q3TargetValue: 160,
    q4TargetValue: 180,
    unitLabel: 'participants',
    personalItemWeight: 100,
    displayOrder: 1,
    activeInWorkplan: true
  }],
  behaviours: [{
    behaviourId: 'BHV-01',
    behaviourVersionKey: 'BHV-01|v01',
    title: 'We are stronger together',
    description: 'Work openly across teams and organisational boundaries.',
    assessmentGuidance: 'Use observable evidence.',
    defaultWorkplanWeight: 20,
    displayOrder: 1
  }],
  behaviourItems: [{
    id: 20,
    etag: '"2"',
    workplanItemKey: 'behaviour-1',
    naturalKey: 'Synthetic User|2026|Behaviour|BHV-01',
    workplanKey: 'Synthetic User|2026',
    personKey: 'Synthetic User',
    performanceYear: 2026,
    behaviourId: 'BHV-01',
    behaviourVersionKey: 'BHV-01|v01',
    objectiveSource: 'Library',
    sourceObjectiveKey: 'BHV-01-01',
    objectiveTitle: 'Cross-team delivery rhythm',
    objectiveDescription: 'Establish an observable monthly planning rhythm with delivery partners.',
    measure: 'Joint planning sessions',
    unit: 'sessions',
    evidenceDefinition: 'Meeting notes and agreed action logs.',
    q1TargetText: 'Agree partners and meeting cadence.',
    q2TargetText: 'Run three joint planning sessions.',
    q3TargetText: 'Close at least 80% of agreed actions.',
    q4TargetText: 'Review and improve the delivery rhythm.',
    q1TargetRating: 2,
    q2TargetRating: 3,
    q3TargetRating: 3,
    q4TargetRating: 4,
    behaviourItemWeight: 20,
    displayOrder: 1,
    activeInWorkplan: true
  }],
  readiness: { ready: true, core: 'complete', personal: 'complete', behaviours: 'complete', blockers: [] },
  auditEvents: []
};

const render = (renderContext: IManagerWorkplanReviewContext = context): string => ReactDOMServer.renderToStaticMarkup(React.createElement(ManagerReviewPage, {
  contexts: [renderContext],
  quarterContexts: [],
  saving: false,
  onRequestChanges: async () => undefined,
  onApproveAndLock: async () => undefined,
  onRequestQuarterChanges: async () => undefined,
  onApproveAndLockQuarter: async () => undefined,
  onOverrideQuarterRag: async () => undefined,
  onAssessQuarterBehaviour: async () => undefined
}));

describe('KCF-KPI-018 annual manager Workplan review detail', () => {
  it('shows the submitted planning decision and complete Impact definition without implementation fields', () => {
    const html = render();
    expect(html).toContain('70% Core · 20% Impact · 10% Behaviours');
    expect(html).toContain('Category weighting reason');
    expect(html).toContain('Role-specific balance agreed for this submission.');
    expect(html).toContain('Grow programme reach');
    expect(html).toContain('Increase regular participant reach across priority projects.');
    expect(html).toContain('Regular participants');
    expect(html).toContain('How progress is measured');
    expect(html).toContain('How delivery is assessed');
    expect(html).toContain('Progress increases as the result rises');
    expect(html).toContain('Starting point');
    expect(html).toContain('100 participants');
    expect(html).toContain('180 participants');
    expect(html).toContain('120 participants');
    expect(html).toContain('160 participants');
    expect(html).toContain('100% planning weight');
    ['Metric type', 'Scoring direction', 'Percentage scale', 'HigherIsBetter', 'LocalPersonal', 'PersonKey', 'ACL']
      .forEach(value => expect(html).not.toContain(value));
  });

  it('shows the full Behaviour assignment read-only while retaining controlled manager actions', () => {
    const savedContext: IManagerWorkplanReviewContext = { ...context,
      personalItems: context.personalItems.map(item => ({ ...item, impactClassification: {
        strategicPillar: { key: 'historical-pillar', label: 'Saved historical pillar', source: 'SYNTHETIC-GOVERNED' },
        businessContributionArea: { key: 'historical-area', label: 'Saved historical area', source: 'SYNTHETIC-GOVERNED' }
      } })) };
    const before = JSON.stringify(savedContext);
    const html = render(savedContext);
    expect(html).toContain('Behaviour commitment');
    expect(html).toContain('We are stronger together');
    expect(html).toContain('Work openly across teams and organisational boundaries.');
    expect(html).toContain('Cross-team delivery rhythm');
    expect(html).toContain('Establish an observable monthly planning rhythm with delivery partners.');
    expect(html).toContain('Joint planning sessions');
    expect(html).toContain('Meeting notes and agreed action logs.');
    expect(html).toContain('Agree partners and meeting cadence.');
    expect(html).toContain('Review and improve the delivery rhythm.');
    expect(html).toContain('Target rating: Developing');
    expect(html).toContain('Target rating: Exceeds expectations');
    expect(html).toContain('20% planning weight');
    expect(html).not.toContain('Behaviour banner · BHV-01');
    expect(html).not.toContain('Objective source');

    const reviewStart = html.indexOf('Workplan planning weights');
    const decisionStart = html.indexOf('Manager decision');
    const submittedContent = html.slice(reviewStart, decisionStart);
    expect(reviewStart).toBeGreaterThan(-1);
    expect(decisionStart).toBeGreaterThan(reviewStart);
    expect(submittedContent).not.toContain('<input');
    expect(submittedContent).not.toContain('<textarea');
    const view = document.createElement('div');
    view.innerHTML = html;
    const behaviour = view.querySelector('section[aria-label="Read-only Behaviour assignments"]');
    expect(behaviour).not.toBeNull();
    expect(behaviour!.querySelectorAll('input,textarea,select')).toHaveLength(0);
    const readonlyView = document.createElement('div');
    readonlyView.innerHTML = submittedContent;
    const taxonomy = Array.from(readonlyView.querySelectorAll<HTMLSelectElement>('select'));
    expect(taxonomy).toHaveLength(2);
    expect(taxonomy.every(control => control.disabled)).toBe(true);
    expect(readonlyView.querySelectorAll('select:not([disabled])')).toHaveLength(0);
    expect(taxonomy.map(control => control.selectedOptions[0].textContent)).toEqual([
      'Saved historical pillar · saved version', 'Saved historical area · saved version'
    ]);
    expect(JSON.stringify(savedContext)).toBe(before);
    expect(html).toContain('Change request reason');
    expect(html).toContain('Request Changes');
    expect(html).toContain('Approve Workplan');
    expect(html).not.toContain('Approve and Lock');
  });

  it('renders locked history and controlled correction provenance without exposing normal edit actions', () => {
    const html = render({
      ...context,
      workplan: {
        ...context.workplan,
        state: 'Locked', accessState: 'ReadOnly', transitionCorrelationKey: 'approval-1',
        approvedAt: '2026-09-19T10:00:00Z', approvedByEmail: context.manager.email,
        lockedAt: '2026-09-19T10:00:01Z', lockedByEmail: context.manager.email
      },
      auditEvents: [{
        id: 1, auditKey: 'approval-1:amendment', eventType: 'WorkplanChangesRequested',
        subjectKey: context.workplan.workplanKey, performanceYear: context.workplan.performanceYear,
        actorEmail: 'person014@example.invalid', actorRole: 'SystemAdmin', eventAt: '2026-09-20T09:15:00Z',
        reason: 'Correct the approved selection.', correlationKey: 'amendment-1', source: 'SPFx',
        sourceReference: 'CONTROL-AWP-023', success: true
      }]
    });
    expect(html).toContain('Controlled correction opened');
    expect(html).toContain('Correct the approved selection.');
    expect(html).toContain('original approval and lock history is retained');
    expect(html).toContain('controlled reasoned amendment route');
    expect(html).not.toContain('Request Changes');
    expect(html).not.toContain('Approve Workplan');
  });
});
