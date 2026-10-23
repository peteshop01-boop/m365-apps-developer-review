/* eslint-disable @rushstack/pair-react-dom-render-unmount -- each mounted host is unmounted in afterEach/finally below */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import {
  auditIntegratedRenderedLayout,
  CoreBuilder,
  IntegratedComponentFrame,
  resolveIntegratedComponentLayout,
  ReviewWeights,
  type ICoreChoice
} from './IntegratedPerformanceHub';
import type { IIntegratedKpi } from '../services/IntegratedReferenceData';

const realKpi: IIntegratedKpi = {
  kpiId: 'SO1-001', wording: 'Increase participation in cricket', pillarCode: 'S01',
  pillar: 'SO1 Participation', workstream: 'Schools', unit: 'schools', annualTarget: 200,
  quarterTargets: [{ quarter: 'Q1', value: 50 }, { quarter: 'Q2', value: 50 },
    { quarter: 'Q3', value: 50 }, { quarter: 'Q4', value: 50 }], memberships: []
};

const buttonContaining = (host: HTMLElement, label: string): HTMLButtonElement => {
  const button = Array.from(host.querySelectorAll('button'))
    .find(candidate => (candidate.textContent || '').trim() === label) as HTMLButtonElement | undefined;
  if (!button) throw new Error(`Button "${label}" was not rendered.`);
  return button;
};

const controlFor = (host: HTMLElement, label: string): HTMLInputElement => {
  const wrapper = Array.from(host.querySelectorAll('label'))
    .find(candidate => (candidate.textContent || '').indexOf(label) >= 0);
  const control = wrapper?.querySelector('input') as HTMLInputElement | null;
  if (!control) throw new Error(`Input "${label}" was not rendered.`);
  return control;
};

describe('KCF-KPI-026-R3 focused mounted Core Draft behaviour', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    host.remove();
  });

  it('performs Add → selected → Edit readback → Remove → available in the mounted component', () => {
    const Wrapper: React.FC = () => {
      const [selections, setSelections] = React.useState<ICoreChoice[]>([]);
      const [changed, setChanged] = React.useState(false);
      return <CoreBuilder kpis={[realKpi]} selections={selections} canonicalDraftAvailable sessionChanged={changed}
        onChange={next => { setSelections(next); setChanged(true); }} />;
    };
    act(() => { ReactDOM.render(<Wrapper />, host); });

    expect(host.textContent).toContain('1 available');
    expect(host.textContent).toContain('Selected 0 of 109');
    const add = host.querySelector('button[aria-label="Add SO1-001 to Workplan"]') as HTMLButtonElement;
    expect(add).toBeDefined();
    act(() => Simulate.click(add));

    expect(host.textContent).toContain('0 available');
    expect(host.textContent).toContain('Selected 1 of 109');
    expect(host.textContent).toContain('Unsaved session changes');
    expect(host.querySelector('[aria-label="Available Core KPI catalogue"] article[data-kpi-id="SO1-001"]')).toBeNull();
    expect(host.querySelector('aside article[data-kpi-id="SO1-001"]')).not.toBeNull();

    act(() => Simulate.click(buttonContaining(host, 'Edit')));
    act(() => Simulate.click(buttonContaining(host, 'I DELIVER THIS')));
    const annual = controlFor(host, 'My annual contribution');
    annual.value = '125';
    act(() => Simulate.change(annual));
    expect(controlFor(host, 'My annual contribution').value).toBe('125');

    act(() => Simulate.click(buttonContaining(host, 'Done editing (not saved)')));
    expect(host.querySelector('aside article[data-kpi-id="SO1-001"]')?.textContent).toContain('I deliver this');
    act(() => Simulate.click(buttonContaining(host, 'Edit')));
    expect(controlFor(host, 'My annual contribution').value).toBe('125');

    act(() => Simulate.click(buttonContaining(host, 'Remove from Workplan')));
    expect(host.textContent).toContain('1 available');
    expect(host.textContent).toContain('Selected 0 of 109');
    expect(host.querySelector('button[aria-label="Add SO1-001 to Workplan"]')).not.toBeNull();
  });

  it('labels session-only changes truthfully and keeps Save and Submit disabled without canonical persistence', () => {
    const SessionWrapper: React.FC = () => {
      const [selections, setSelections] = React.useState<ICoreChoice[]>([]);
      return <CoreBuilder kpis={[realKpi]} selections={selections} sessionChanged={selections.length > 0} onChange={setSelections} />;
    };
    act(() => { ReactDOM.render(<SessionWrapper />, host); });
    const add = host.querySelector('button[aria-label="Add SO1-001 to Workplan"]') as HTMLButtonElement;
    act(() => Simulate.click(add));
    expect(host.textContent).toContain('Session only — not saved');

    act(() => {
      ReactDOM.render(<ReviewWeights core={[]} personal={[]} behaviours={[]} onCore={() => undefined}
        onPersonal={() => undefined} onBehaviours={() => undefined} saving={false} message=""
        onSave={async () => undefined} onSubmit={async () => undefined} />, host);
    });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Saving is unavailable');
    expect(buttonContaining(host, 'Save Draft').disabled).toBe(true);
    expect(buttonContaining(host, 'Submit Workplan').disabled).toBe(true);
  });
});

describe('KCF-KPI-026-R3 focused mounted component-width and containment behaviour', () => {
  it('switches from a 785px SharePoint component to 390px and 320px modes through ResizeObserver', () => {
    const original = globalThis.ResizeObserver;
    let callback: ResizeObserverCallback | undefined;
    class TestResizeObserver {
      public constructor(next: ResizeObserverCallback) { callback = next; }
      public observe(): void { /* mounted contract */ }
      public unobserve(): void { /* mounted contract */ }
      public disconnect(): void { /* mounted contract */ }
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: TestResizeObserver });
    const host = document.createElement('div');
    document.body.appendChild(host);
    try {
      act(() => { ReactDOM.render(<IntegratedComponentFrame><button type="button">Probe</button></IntegratedComponentFrame>, host); });
      const frame = (): HTMLElement => host.querySelector('[data-component-layout]') as HTMLElement;
      const resize = (width: number): void => act(() => callback?.([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
      resize(785);
      expect(frame().dataset.componentLayout).toBe('compact');
      resize(390);
      expect(frame().dataset.componentLayout).toBe('phone');
      resize(320);
      expect(frame().dataset.componentLayout).toBe('small-phone');
      expect(resolveIntegratedComponentLayout(1280)).toBe('wide');
    } finally {
      act(() => { ReactDOM.unmountComponentAtNode(host); });
      host.remove();
      Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, writable: true, value: original });
    }
  });

  it('audits zero horizontal overflow and 44px interactive targets from rendered DOM measurements', () => {
    const root = document.createElement('div');
    const button = document.createElement('button');
    const input = document.createElement('input');
    root.append(button, input);
    Object.defineProperty(root, 'clientWidth', { configurable: true, value: 320 });
    Object.defineProperty(root, 'scrollWidth', { configurable: true, value: 320 });
    jest.spyOn(button, 'getBoundingClientRect').mockReturnValue({ width: 44, height: 44 } as DOMRect);
    const inputRect = jest.spyOn(input, 'getBoundingClientRect').mockReturnValue({ width: 120, height: 44 } as DOMRect);
    expect(auditIntegratedRenderedLayout(root)).toEqual({
      clientWidth: 320, scrollWidth: 320, horizontalOverflow: 0, interactiveTargets: 2, undersizedTargets: 0
    });

    Object.defineProperty(root, 'scrollWidth', { configurable: true, value: 345 });
    inputRect.mockReturnValue({ width: 20, height: 20 } as DOMRect);
    expect(auditIntegratedRenderedLayout(root)).toMatchObject({ horizontalOverflow: 25, undersizedTargets: 1 });
  });
});
