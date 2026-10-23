/* eslint-disable @rushstack/pair-react-dom-render-unmount -- the shared host is unmounted in afterEach */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import {
  AdminView,
  auditIntegratedRenderedLayout,
  CoreBuilder,
  IntegratedComponentFrame,
  IntegratedExperienceStatePanel,
  IntegratedManagerScreenGuidance,
  IntegratedScreenGuidance,
  ReportingView,
  ResponsiveTableRegion,
  type IIntegratedData,
  type IntegratedExperienceState
} from './IntegratedPerformanceHub';

const emptyData: IIntegratedData = {
  kpis: [], people: [], directReports: [], teams: [], configs: [], objectives: [], annualReviews: [],
  quarterReviews: [], quarterLifecycles: [], warnings: []
};

describe('BT10 cross-cutting rendered guidance and state behaviour', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    host.remove();
  });

  it.each([
    ['loading', 'Loading data', 'Wait for the check to finish.', 'status'],
    ['empty', 'Nothing here yet', 'Create the first item.', 'status'],
    ['denied', 'Access not verified', 'Ask the data owner to check your role.', 'alert'],
    ['failed', 'Read failed', 'Reload once, then contact support.', 'alert']
  ] as Array<[IntegratedExperienceState, string, string, string]>)('renders %s as a distinct state with a named next step', (state, title, nextStep, role) => {
    act(() => { ReactDOM.render(<IntegratedExperienceStatePanel state={state} title={title} message="State-specific detail." nextStep={nextStep} />, host); });
    const panel = host.querySelector(`[data-experience-state="${state}"]`) as HTMLElement;
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe(role);
    expect(panel.getAttribute('aria-busy')).toBe(state === 'loading' ? 'true' : null);
    expect(panel.textContent).toContain(title);
    expect(panel.textContent).toContain(`Next step: ${nextStep}`);
  });

  it('moves from an actionable empty state to a failed state when the retry fails', () => {
    const Harness: React.FC = () => {
      const [state, setState] = React.useState<IntegratedExperienceState>('empty');
      return <IntegratedExperienceStatePanel state={state}
        title={state === 'empty' ? 'No reviews available' : 'Review refresh failed'}
        message={state === 'empty' ? 'No submitted review is waiting.' : 'The submitted-review read did not complete.'}
        nextStep={state === 'empty' ? 'Retry after the employee submits.' : 'Contact KPI support before making a decision.'}
        actionLabel={state === 'empty' ? 'Retry review list' : undefined}
        onAction={state === 'empty' ? () => setState('failed') : undefined} />;
    };
    act(() => { ReactDOM.render(<Harness />, host); });
    expect(host.querySelector('[data-experience-state="empty"]')).not.toBeNull();
    act(() => Simulate.click(host.querySelector('button') as HTMLButtonElement));
    expect(host.querySelector('[data-experience-state="failed"]')).not.toBeNull();
    expect(host.textContent).toContain('Contact KPI support before making a decision.');
  });

  it('renders purpose, actions, fields, governed terminology and next step in keyboard-reachable help', () => {
    act(() => { ReactDOM.render(<IntegratedScreenGuidance
      purpose="Prepare the annual Workplan."
      actions={['Choose current commitments.', 'Check readiness.']}
      fields={['Core — strategic priorities.', 'Impact — measurable role contribution.', 'Behaviours — how you work.', 'Overall Delivery — combined result.']}
      next="Save the Draft, then submit when ready."
      defaultOpen
    />, host); });
    const details = host.querySelector('details[data-contextual-help="true"]') as HTMLDetailsElement;
    const summary = details.querySelector('summary') as HTMLElement;
    expect(details.open).toBe(true);
    expect(summary.tabIndex).toBe(0);
    expect(summary.getAttribute('aria-label')).toContain('purpose, actions, fields and next step');
    ['What this page is for', 'What you should do', 'Important fields', 'What happens next',
      'Core — strategic priorities.', 'Impact — measurable role contribution.', 'Behaviours — how you work.',
      'Overall Delivery — combined result.', 'Save the Draft, then submit when ready.']
      .forEach(text => expect(details.textContent).toContain(text));
  });

  it('renders guidance and explicit empty/readiness states for employee, manager, Admin and reporting screens', () => {
    act(() => { ReactDOM.render(<CoreBuilder kpis={[]} selections={[]} onChange={() => undefined} />, host); });
    expect(host.textContent).toContain('Choose the current Core KPIs');
    expect(host.querySelector('[data-experience-state="empty"]')?.textContent).toContain('No matching Core KPIs');

    act(() => { ReactDOM.render(<IntegratedManagerScreenGuidance tab="Reviews Awaiting Me" />, host); });
    expect(host.textContent).toContain('submitted annual and quarterly reviews');
    expect(host.textContent).toContain('Overall Delivery');

    act(() => { ReactDOM.render(<AdminView tab="People" data={emptyData} />, host); });
    expect(host.textContent).toContain('governed People records');
    expect(host.querySelector('[data-experience-state="empty"]')?.textContent).toContain('People unavailable');

    act(() => { ReactDOM.render(<ReportingView tab="Reporting Readiness" data={emptyData} />, host); });
    expect(host.textContent).toContain('catalogue, targets, reporting memberships and Official Actuals');
    expect(host.textContent).toContain('NOT READY');
    expect(host.textContent).not.toContain('READYREADY');
  });
});

describe('BT10 responsive reachability and table treatment', () => {
  it('keeps manager guidance present while moving from desktop to phone component widths', () => {
    const original = globalThis.ResizeObserver;
    let callback: ResizeObserverCallback | undefined;
    class TestResizeObserver {
      public constructor(next: ResizeObserverCallback) { callback = next; }
      public observe(): void { /* rendered component contract */ }
      public unobserve(): void { /* rendered component contract */ }
      public disconnect(): void { /* rendered component contract */ }
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: TestResizeObserver });
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      act(() => { ReactDOM.render(<IntegratedComponentFrame><IntegratedManagerScreenGuidance tab="My Team" /></IntegratedComponentFrame>, host); });
      const frame = host.querySelector('[data-component-layout]') as HTMLElement;
      const resize = (width: number): void => act(() => callback?.([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
      resize(1280);
      expect(frame.dataset.componentLayout).toBe('wide');
      expect(frame.textContent).toContain('Review direct-report Workplan');
      resize(390);
      expect(frame.dataset.componentLayout).toBe('phone');
      expect(frame.textContent).toContain('What happens next');
    } finally {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      host.remove();
      Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: original });
    }
  });

  it('uses a named, keyboard-focusable local table scroller and measurable 44px action target', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      act(() => { ReactDOM.render(<div><ResponsiveTableRegion label="Admin KPI table"><table><tbody><tr><td>SO1-001</td></tr></tbody></table></ResponsiveTableRegion>
        <IntegratedExperienceStatePanel state="empty" title="No rows" message="No approved rows." nextStep="Retry later."
          actionLabel="Retry" onAction={() => undefined} /></div>, host); });
      const region = host.querySelector('[role="region"]') as HTMLElement;
      const action = host.querySelector('button') as HTMLButtonElement;
      expect(region.getAttribute('aria-label')).toBe('Admin KPI table');
      expect(region.tabIndex).toBe(0);
      expect(region.textContent).toContain('swipe within this table');
      Object.defineProperty(host, 'clientWidth', { configurable: true, value: 390 });
      Object.defineProperty(host, 'scrollWidth', { configurable: true, value: 390 });
      jest.spyOn(action, 'getBoundingClientRect').mockReturnValue({ width: 48, height: 48 } as DOMRect);
      expect(auditIntegratedRenderedLayout(host)).toMatchObject({ horizontalOverflow: 0, interactiveTargets: 1, undersizedTargets: 0 });
    } finally {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      host.remove();
    }
  });
});
