/* eslint-disable @rushstack/pair-react-dom-render-unmount -- each mounted host is unmounted in afterEach/finally */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { IManagerWorkplanReviewContext } from '../models/ProductionModels';
import EmployeePerformancePanel from './EmployeePerformancePanel';
import CoreKpiCatalogueRow from './CoreKpiCatalogueRow';
import ManagerReviewPage from './ManagerReviewPage';
import { PerformanceConceptGuide } from './PerformancePresentation';
import {
  auditIntegratedRenderedLayout,
  IntegratedComponentFrame,
  PersonalBuilder,
  type IPersonalChoice
} from './IntegratedPerformanceHub';

const forbiddenPresentationTerms = [
  'HigherIsBetter', 'LowerIsBetter', 'TargetRange', 'LocalPersonal', 'CoreGold', 'PersonKey',
  'ACL', 'Employee V2', 'readback', 'Metric type', 'Scoring direction', 'Percentage scale',
  'Owner PersonKey', 'raw ·', '% scored', 'Personal KPIs', 'Personal performance', 'Overall performance'
];

const managerContext = {
  workplan: {
    workplanKey: 'synthetic|2027', state: 'Submitted', accessState: 'ManagerDecision', transitionStatus: 'Ready',
    performanceYear: 2027, coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10,
    categoryWeightReason: 'Role contribution agreed.', submittedAt: '2026-09-01T09:00:00Z'
  },
  employee: { personKey: 'employee', displayName: 'Synthetic Employee', email: 'employee@example.invalid' },
  manager: { personKey: 'manager', displayName: 'Synthetic Manager', email: 'manager@example.invalid' },
  coreCatalogue: [{ kpiId: 'SO1-001', wording: 'Increase participation' }],
  coreItems: [{ naturalKey: 'internal-core-key', kpiId: 'SO1-001', activeInWorkplan: true, coreWorkplanWeight: 70, employeeKpiRole: 'AccountableOwner' }],
  personalItems: [{
    naturalKey: 'internal-impact-key', activeInWorkplan: true, wording: 'Reduce waiting time', description: 'Improve response time.',
    measure: 'Working days', measureType: 'Days', scoringDirection: 'LowerIsBetter', percentageSourceScale: 'Whole',
    baselineValue: 12, yearEndTargetValue: 7, q1TargetValue: 11, q2TargetValue: 10, q3TargetValue: 8, q4TargetValue: 7,
    unitLabel: 'days', personalItemWeight: 100
  }],
  behaviours: [], behaviourItems: [], readiness: { ready: true, blockers: [] }, auditEvents: []
} as unknown as IManagerWorkplanReviewContext;

describe('BT10 UX-007 mounted presentation boundary', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    host.remove();
  });

  it('distinguishes employee weights, delivery scores and Behaviour ratings without leaking implementation fields', () => {
    const impact: IPersonalChoice = {
      key: 'impact-1', wording: 'Reduce waiting time', measure: 'Number / Quantity', unit: 'days', annual: '7',
      q1: '11', q2: '10', q3: '8', q4: '7', success: '', weight: 100,
      original: {
        id: 1, etag: 'internal-etag', workplanItemKey: 'internal-item-key', naturalKey: 'internal-natural-key',
        workplanKey: 'internal-workplan-key', personKey: 'internal-person-key', performanceYear: 2027,
        wording: 'Reduce waiting time', description: 'Improve response time.', measure: 'Working days',
        measureType: 'Days', scoringDirection: 'LowerIsBetter', baselineValue: 12, yearEndTargetValue: 7,
        q1TargetValue: 11, q2TargetValue: 10, q3TargetValue: 8, q4TargetValue: 7,
        unitLabel: 'days', personalItemWeight: 100, displayOrder: 1, activeInWorkplan: true
      }
    };
    act(() => { ReactDOM.render(<div>
      <EmployeePerformancePanel summary={{
        core: { key: 'core', label: 'Core performance', state: 'Rated', rag: 'Green', progressPct: 92, explanation: 'Current result uses employee Core Workplan weights.' },
        personal: { key: 'personal', label: 'Personal performance', state: 'Rated', rag: 'Amber', progressPct: 78, explanation: 'Personal item weights are applied.' },
        behaviours: { key: 'behaviours', label: 'Behaviour performance', state: 'Rated', rag: 'Green', progressPct: 100, explanation: 'Final Behaviour assessment is available.' },
        overall: { key: 'overall', label: 'Overall performance', state: 'Rated', rag: 'Green', progressPct: 88, explanation: 'Overall performance is available.' }
      }} />
      <CoreKpiCatalogueRow kpi={{
        kpiId: 'SO1-001', kpiVersionKey: 'internal-version', targetVersionKey: 'internal-target-version', wording: 'Increase participation',
        pillar: 'Participation', workstream: 'Schools', accountableOwnerEmail: 'owner@example.invalid', unitLabel: 'people',
        scoringDirection: 'HigherIsBetter'
      }} selected={{ coreWorkplanWeight: 100, employeeKpiRole: 'AccountableOwner', activeInWorkplan: true } as never}
        editable saving={false} canAdd={false} onAdd={() => undefined} onUpdate={() => undefined} />
      <PersonalBuilder items={[impact]} onChange={() => undefined} />
    </div>, host); });

    expect(host.textContent).toContain('Core and Impact weighting');
    expect(host.textContent).toContain('Overall Delivery score');
    expect(host.textContent).toContain('Behaviour ratings');
    expect(host.textContent).toContain('Progress increases as the result rises');
    expect(host.textContent).toContain('Progress increases as the result falls');
    expect(host.textContent).toContain('Core item planning weight');
    forbiddenPresentationTerms.forEach(value => expect(host.textContent).not.toContain(value));
  });

  it('renders the manager review with business labels and keeps internal contract values out of visible text', () => {
    act(() => { ReactDOM.render(<ManagerReviewPage contexts={[managerContext]} quarterContexts={[]} saving={false}
      onRequestChanges={async () => undefined} onApproveAndLock={async () => undefined}
      onRequestQuarterChanges={async () => undefined} onApproveAndLockQuarter={async () => undefined}
      onOverrideQuarterRag={async () => undefined} onAssessQuarterBehaviour={async () => undefined} />, host); });

    expect(host.textContent).toContain('70% Core · 20% Impact · 10% Behaviours');
    expect(host.textContent).toContain('Owns this Core KPI');
    expect(host.textContent).toContain('Impact KPI 1');
    expect(host.textContent).toContain('How delivery is assessed');
    expect(host.textContent).toContain('Progress increases as the result falls');
    expect(host.textContent).toContain('Behaviour ratings');
    forbiddenPresentationTerms.forEach(value => expect(host.textContent).not.toContain(value));
  });
});

describe('BT10 UX-007 desktop and phone presentation reachability', () => {
  it('retains differentiated guidance at desktop and phone widths with no measured app-level overflow or undersized action', () => {
    const original = globalThis.ResizeObserver;
    let callback: ResizeObserverCallback | undefined;
    class TestResizeObserver {
      public constructor(next: ResizeObserverCallback) { callback = next; }
      public observe(): void { /* mounted width contract */ }
      public unobserve(): void { /* mounted width contract */ }
      public disconnect(): void { /* mounted width contract */ }
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: TestResizeObserver });
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      act(() => { ReactDOM.render(<IntegratedComponentFrame><PerformanceConceptGuide audience="manager" /><button type="button">Open review</button></IntegratedComponentFrame>, host); });
      const frame = host.querySelector('[data-component-layout]') as HTMLElement;
      const button = host.querySelector('button') as HTMLButtonElement;
      const resize = (width: number): void => act(() => callback?.([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
      resize(1280);
      expect(frame.dataset.componentLayout).toBe('wide');
      resize(390);
      expect(frame.dataset.componentLayout).toBe('phone');
      expect(frame.textContent).toContain('Core and Impact weighting');
      expect(frame.textContent).toContain('Overall Delivery score');
      expect(frame.textContent).toContain('Behaviour ratings');
      Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 390 });
      Object.defineProperty(frame, 'scrollWidth', { configurable: true, value: 390 });
      jest.spyOn(button, 'getBoundingClientRect').mockReturnValue({ width: 46, height: 46 } as DOMRect);
      expect(auditIntegratedRenderedLayout(frame)).toMatchObject({ horizontalOverflow: 0, interactiveTargets: 1, undersizedTargets: 0 });
    } finally {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      host.remove();
      Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: original });
    }
  });
});
