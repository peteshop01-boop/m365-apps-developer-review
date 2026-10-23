import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type { IManagerQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import ManagerQuarterReviewPanel from './ManagerQuarterReviewPanel';

const impact: IQuarterReviewItem = {
  id: 2, etag: '"1"', quarterReviewItemKey: 'employee|2026|Q3|impact-1', quarterReviewKey: 'employee|2026|Q3',
  workplanItemKey: 'impact-1', workplanKey: 'employee|2026', personKey: 'employee', performanceYear: 2026,
  quarter: 'Q3', itemType: 'LocalPersonal', reportingStream: 'Impact', wording: 'Improve synthetic delivery',
  itemDescription: 'Reduce controlled waiting time', measure: 'Completed cases', unitLabel: 'cases',
  metricType: 'Count', scoringDirection: 'HigherIsBetter', yearEndTargetValueSnapshot: 40, quarterTargetValue: 10,
  employeeActualValue: 10, progressPct: 100, scoredProgressPct: 100, calculatedRag: 'Green',
  statusUpdate: 'Ten synthetic cases completed.', evidenceCount: 1, workplanItemWeightSnapshot: 100,
  managerApproved: false, locked: false, impactAnnualDefinitionSnapshot: Object.freeze({
    sourceWorkplanItemKey: 'impact-1', wording: 'Improve synthetic delivery', intendedOutcome: 'Reduce controlled waiting time',
    measure: 'Completed cases', unitLabel: 'cases', metricType: 'Count', scoringDirection: 'HigherIsBetter',
    yearEndTargetValue: 40, quarterTargetValue: 10, workplanItemWeight: 100,
    classification: Object.freeze({
      strategicPillar: Object.freeze({ key: 'pillar-1', label: 'Synthetic pillar', source: 'TEST-GOVERNED' }),
      businessContributionArea: Object.freeze({ key: 'area-1', label: 'Synthetic area', source: 'TEST-GOVERNED' })
    })
  })
};
const context: IManagerQuarterReviewContext = {
  lifecycle: {
    performanceYear: '2025/26', performanceYearNumber: 2026, quarterKey: 'Q3', quarterName: 'Q3',
    quarterStart: '2026-05-01', quarterEnd: '2026-07-31', isCurrentQuarter: false, isOpenForProgressUpdates: false,
    employeeSubmissionDeadline: '2026-08-07', managerReviewDeadline: '2026-08-14',
    reminderMilestones: { earlyReview: '2026-07-01', preparation: '2026-07-17', final: '2026-07-24' },
    status: 'AwaitingManagerReview', priorQuarter: 'Q2', nextQuarter: 'Q4'
  },
  review: {
    id: 1, etag: '"2"', quarterReviewKey: 'employee|2026|Q3', workplanKey: 'employee|2026', personKey: 'employee',
    employeeDisplayName: 'Employee', employeeEmail: 'person012@example.invalid', performanceYear: 2026, quarter: 'Q3',
    managerPersonKey: 'manager', managerDisplayName: 'Manager', managerEmail: 'person013@example.invalid',
    state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready', rowVersionToken: 2
  },
  employee: { id: 1, personKey: 'employee', displayName: 'Employee', email: 'person012@example.invalid', appRoles: ['Employee'], active: true },
  manager: { id: 2, personKey: 'manager', displayName: 'Manager', email: 'person013@example.invalid', appRoles: ['Employee'], active: true },
  items: [impact], evidence: [{
    evidenceKey: 'evidence-1', kind: 'Link', personKey: 'employee', workplanKey: 'employee|2026',
    workplanItemKey: 'impact-1', quarterReviewKey: 'employee|2026|Q3', quarterReviewItemKey: impact.quarterReviewItemKey,
    performanceYear: 2026, quarter: 'Q3', description: 'Synthetic evidence', status: 'Submitted'
  }], readiness: { ready: true, blockers: [], warnings: [], coreComplete: 0, personalComplete: 1, behavioursComplete: 0 },
  dataFoundationReady: true, messages: []
};

describe('ManagerQuarterReviewPanel Impact view', () => {
  it('renders submitted Impact independently with immutable classification and employee evidence', () => {
    const html = ReactDOMServer.renderToStaticMarkup(<ManagerQuarterReviewPanel contexts={[context]} saving={false}
      onRequestChanges={async () => undefined} onApproveAndLock={async () => undefined}
      onOverrideRag={async () => undefined} onAssessBehaviour={async () => undefined} />);
    expect(html).toContain('Impact KPI results');
    expect(html).toContain('Impact remains separate from organisational Core/GOLD reporting');
    expect(html).toContain('Synthetic area');
    expect(html).toContain('Synthetic pillar');
    expect(html).toContain('Ten synthetic cases completed');
    expect(html).toContain('Evidence</span><strong>1');
  });
});

it('PM124 disables quarterly manager mutations without presenting an in-flight save',()=> {
 const html=ReactDOMServer.renderToStaticMarkup(<ManagerQuarterReviewPanel nativeWritesHeld contexts={[context]} saving={false} onRequestChanges={async()=>undefined} onApproveAndLock={async()=>undefined} onOverrideRag={async()=>undefined} onAssessBehaviour={async()=>undefined}/>);
 const host=document.createElement('div');host.innerHTML=html;
 expect(host.textContent).toContain('Ten synthetic cases completed'); expect(host.textContent).not.toContain('Processing');
 expect(Array.from(host.querySelectorAll<HTMLButtonElement>('button')).every(button=>button.disabled)).toBe(true);
});
