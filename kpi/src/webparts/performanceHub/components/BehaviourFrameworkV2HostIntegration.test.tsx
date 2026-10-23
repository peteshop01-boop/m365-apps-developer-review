import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';
import {
  behaviourFrameworkV2TestCatalogue,
  createBehaviourFrameworkV2TestAssessments,
  createBehaviourFrameworkV2TestEvidence,
  createBehaviourFrameworkV2TestReviews,
  createBehaviourFrameworkV2TestSelections
} from '../testing/BehaviourFrameworkV2TestData';
import { initialLocalItems, localDefinitions, localLibrary, localWorkplan } from '../testing/BehaviourLibraryLocalHarness';

describe('BT-04 production Behaviour host package route', () => {
  it('renders the V2 contract through the existing host without mutating or exposing legacy numeric controls', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const items = initialLocalItems();
    const before = JSON.stringify(items);
    act(() => { ReactDOM.render(React.createElement(BehaviourWorkplanPage, {
      workplan: localWorkplan, behaviours: localDefinitions, library: localLibrary, items, saving: false,
      behaviourFrameworkV2: {
        catalogue: behaviourFrameworkV2TestCatalogue, roleLevelCode: 'L2', audience: 'Manager', view: 'QuarterlyManager',
        selections: createBehaviourFrameworkV2TestSelections(), reviews: createBehaviourFrameworkV2TestReviews(),
        evidence: createBehaviourFrameworkV2TestEvidence(),
        assessments: createBehaviourFrameworkV2TestAssessments(), quarter: 'Q1', asOf: new Date('2026-11-01')
      },
      onSave: async () => undefined
    }), host); });
    expect(host.querySelector('[data-behaviour-framework-v2="QuarterlyManager"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-headline-behaviour]')).toHaveLength(5);
    expect(host.querySelectorAll('[data-selected-target]')).toHaveLength(4);
    expect(host.textContent).toContain('Developing');
    expect(host.textContent).toContain('Effective');
    expect(host.textContent).toContain('Exceptional');
    expect(host.textContent).not.toContain('rating target from 1 to 4');
    expect(host.textContent).not.toContain('Behaviour weight %');
    expect(host.textContent).not.toContain('Delivery arithmetic');
    expect(JSON.stringify(items)).toBe(before);
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    host.remove();
  });
});
