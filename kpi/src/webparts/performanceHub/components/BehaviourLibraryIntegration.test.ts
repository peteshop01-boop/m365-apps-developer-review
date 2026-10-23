/* eslint-disable @rushstack/pair-react-dom-render-unmount -- afterEach unmounts every host */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';
import { BehaviourBuilder, type IBehaviourChoice } from './IntegratedPerformanceHub';
import { initialLocalItems, localDefinitions, localLibrary, localWorkplan, mountLocalHarness, getIntegratedDiagnostics, integratedConfig, integratedTiming } from '../testing/BehaviourLibraryLocalHarness';
import { validateQuarterTiming } from '../services/GovernanceValidation';
import { buildQuarterLifecycle } from '../services/QuarterLifecycle';
import type { IBehaviourWorkplanItem } from '../models/ProductionModels';

describe('BHVLIB R03 actual host integration and copied history', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  const toggle = (key: string): void => act(() => Simulate.change(host.querySelector(`[data-behaviour-suggestion="${key}"]`) as HTMLInputElement));
  it('loads the FULL integrated harness through typed lifecycle/overview/readback contracts before exposing all 75 role choices', async () => {
    expect(validateQuarterTiming(integratedTiming)).toEqual({ valid: true, errors: [] });
    const quarters = buildQuarterLifecycle(integratedConfig, integratedTiming, '2026-06-15');
    expect(quarters.map(row => [row.quarterStart, row.quarterEnd])).toEqual([
      ['2025-11-01', '2026-01-31'], ['2026-02-01', '2026-04-30'], ['2026-05-01', '2026-07-31'], ['2026-08-01', '2026-10-31']
    ]);
    await act(async () => {
      const loaded = new Promise<void>(resolve => {
        const observer = new MutationObserver(() => {
          if (host.querySelector('h1')?.textContent === 'Synthetic Employee' && !host.querySelector('[aria-busy="true"]')) {
            observer.disconnect(); resolve();
          }
        });
        observer.observe(host, { subtree: true, childList: true, attributes: true });
      });
      mountLocalHarness(host, 'integrated', '2026-11-01');
      await loaded;
    });
    expect(host.textContent).not.toMatch(/Some live information is not available|reference-data refresh failed|No Workplan has been started/);
    const diagnostics = getIntegratedDiagnostics();
    expect(diagnostics.readiness.ready).toBe(true);
    expect(diagnostics.readback.workplan).toEqual(expect.objectContaining({ workplanKey: localWorkplan.workplanKey, state: 'Draft', workplanVersion: 1 }));
    expect(diagnostics.readback.behaviourItems).toHaveLength(5);
    expect(diagnostics.calls.find(call => call.method === 'getEmployeeWorkplanV2')?.args).toEqual(['synthetic', 2026]);
    expect(diagnostics.calls.filter(call => call.method === 'getPersonByEmail').map(call => call.args[0])).toEqual(['employee@example.invalid', 'manager@example.invalid']);
    const clickButton = (label: string): void => act(() => Simulate.click(Array.from(host.querySelectorAll('button')).find(button => button.textContent === label) as HTMLButtonElement));
    clickButton('Build My Workplan');
    expect(host.textContent).toContain('Your saved Draft is loaded');
    clickButton('Behaviours');
    const keys: string[] = [];
    for (let index = 0; index < 5; index++) {
      act(() => Simulate.click(Array.from(host.querySelectorAll('button')).filter(button => button.textContent === 'Choose & configure')[index]));
      const selector = host.querySelector(`[data-behaviour-library="BHV-0${index + 1}"]`) as HTMLElement;
      expect(Array.from(selector.querySelectorAll('[data-role-level] > legend')).map(node => node.textContent)).toEqual(['L1 Colleague', 'L2 People manager', 'L3 Senior leader']);
      keys.push(...Array.from(selector.querySelectorAll('[data-role-level] input')).map(node => node.getAttribute('data-behaviour-suggestion') || ''));
      clickButton('Done editing (not saved)');
    }
    expect(keys).toEqual(localLibrary.filter(row => row.roleLevelCode).map(row => row.behaviourObjectiveKey));
    expect(new Set(keys).size).toBe(75);
  });
  it('saves hybrid keys/custom/copied fields, unmounts and reconstructs a serialised local snapshot', async () => {
    let saved: IBehaviourWorkplanItem[] = [];
    const mount = (items: IBehaviourWorkplanItem[]): void => { ReactDOM.render(React.createElement(BehaviourWorkplanPage, {
      workplan: localWorkplan, behaviours: localDefinitions, library: localLibrary, items, saving: false, localUat: true,
      behaviourLibraryAsOf: new Date('2026-11-01'), onSave: async next => { saved = JSON.parse(JSON.stringify(next)) as IBehaviourWorkplanItem[]; }
    }), host); };
    act(() => mount(initialLocalItems()));
    toggle('BHV-01-L1-01'); toggle('BHV-01-L3-02'); toggle('BHV-01-L1-01');
    await act(async () => { Simulate.click(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Save locally') as HTMLButtonElement); });
    expect(saved[0].selectedSuggestionKeys).toEqual(['BHV-01-L3-02']);
    expect(saved[0].sourceObjectiveKey).toBe('BHV-01-L3-02');
    expect(saved[0].customObjective).toBe('Synthetic commitment 1');
    expect(saved[0].objectiveDescription).toBe(localLibrary.find(row => row.behaviourObjectiveKey === 'BHV-01-L3-02')?.objectiveDescription);
    const snapshot = JSON.stringify(saved);
    act(() => { ReactDOM.unmountComponentAtNode(host); mount(JSON.parse(snapshot) as IBehaviourWorkplanItem[]); });
    expect((host.querySelector('[data-behaviour-suggestion="BHV-01-L3-02"]') as HTMLInputElement).checked).toBe(true);
    await act(async () => { Simulate.click(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Save locally') as HTMLButtonElement); });
    expect(JSON.stringify(saved)).toBe(snapshot);
    toggle('BHV-01-L3-02');
    await act(async () => { Simulate.click(Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Save locally') as HTMLButtonElement); });
    expect(saved[0].selectedSuggestionKeys).toEqual([]);
    expect(saved[0].objectiveSource).toBe('Custom');
  });
  it.each(['Submitted', 'Locked'] as const)('retains copied generic wording in %s without inventing a role', state => {
    const items = initialLocalItems();
    items[0] = { ...items[0], objectiveSource: 'Library', selectedSuggestionKeys: ['BHV-01-OBJ-01'], sourceObjectiveKey: 'BHV-01-OBJ-01',
      objectiveTitle: 'Historical title', objectiveDescription: 'Historical description', measure: 'Historical measure', unit: 'Historical unit', evidenceDefinition: 'Historical evidence' };
    const before = JSON.stringify(items);
    act(() => { ReactDOM.render(React.createElement(BehaviourWorkplanPage, { workplan: { ...localWorkplan, state }, behaviours: localDefinitions,
      library: localLibrary, items, saving: false, behaviourLibraryAsOf: new Date('2026-11-01'), onSave: async () => undefined }), host); });
    const retained = host.querySelector('[data-copied-content]') as HTMLElement;
    expect(retained.textContent).toContain('Historical titleHistorical descriptionHistorical measureHistorical unitHistorical evidence');
    expect(retained.textContent).not.toMatch(/L1|L2|L3|Colleague|Senior leader/);
    expect((host.querySelector('[data-behaviour-suggestion="BHV-01-OBJ-01"]') as HTMLInputElement).disabled).toBe(true);
    expect(JSON.stringify(items)).toBe(before);
  });
  it('uses the same selector in the integrated builder and preserves primary choice and rating', () => {
    let choices: IBehaviourChoice[] = localDefinitions.map(row => ({ behaviourId: row.behaviourId, selectedSuggestionKeys: [], commitment: 'My custom commitment', customObjective: 'My custom commitment', q1: 'Q1', q2: 'Q2', q3: 'Q3', q4: 'Q4', h1: 'H1', h2: 'H2', targetRating: 3, weight: 20 }));
    const render = (): void => { ReactDOM.render(React.createElement(BehaviourBuilder, { choices, objectives: localLibrary,
      behaviourLibraryAsOf: new Date('2026-11-01'), onChange: next => { choices = next; render(); } }), host); };
    act(render);
    act(() => Simulate.click(host.querySelector('button') as HTMLButtonElement));
    toggle('BHV-01-L2-01'); toggle('BHV-01-L3-03');
    expect(choices[0].primarySuggestionKey).toBe('BHV-01-L2-01');
    expect(choices[0].customObjective).toBe('My custom commitment');
    toggle('BHV-01-L2-01');
    expect(choices[0].primarySuggestionKey).toBe('BHV-01-L3-03');
    expect(choices[0].targetRating).toBe(3);
    expect(choices[0].measure).toBe(localLibrary.find(row => row.behaviourObjectiveKey === 'BHV-01-L3-03')?.suggestedMeasure);
  });
});
