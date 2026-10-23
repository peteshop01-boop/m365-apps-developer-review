/* eslint-disable @rushstack/pair-react-dom-render-unmount -- afterEach unmounts every host */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import BehaviourLibrarySelector from './BehaviourLibrarySelector';
import { BEHAVIOUR_ROLE_LEVEL_LIBRARY_SEED as seed } from '../services/provisioning/BehaviourRoleLevelLibrarySeed';
import { mapBehaviourCatalogueRow } from '../services/BehaviourLibraryCatalogue';
import { BEHAVIOUR_KEYS } from '../models/BehaviourWorkplanModels';

describe('BHVLIB R03 mounted shared selector', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });
  it.each(BEHAVIOUR_KEYS)('mounts %s with ordered groups and exact five labels per group', behaviourKey => {
    act(() => { ReactDOM.render(React.createElement(BehaviourLibrarySelector, { behaviourKey,
      library: seed.map(mapBehaviourCatalogueRow), selectedKeys: [], asOf: new Date('2026-11-01'), onToggle: () => undefined }), host); });
    expect(Array.from(host.querySelectorAll('[data-role-level] legend')).map(el => el.textContent)).toEqual(['L1 Colleague', 'L2 People manager', 'L3 Senior leader']);
    expect(host.querySelectorAll('input')).toHaveLength(15);
    expect(Array.from(host.querySelectorAll('label span')).map(el => el.textContent)).toEqual(seed.filter(row => row.BehaviourKey === behaviourKey).map(row => row.DropdownLabel));
    Array.from(host.querySelectorAll('[data-role-level]')).forEach(el => expect(el.querySelectorAll('input')).toHaveLength(5));
  });
  it.each(seed)('binds the actual selection guidance for $BehaviourObjectiveKey', row => {
    let selectedKeys: string[] = [];
    const render = (): void => { ReactDOM.render(React.createElement(BehaviourLibrarySelector, {
      behaviourKey: row.BehaviourKey, library: seed.map(mapBehaviourCatalogueRow), selectedKeys,
      asOf: new Date('2026-11-01'), onToggle: key => { selectedKeys = [key]; render(); }
    }), host); };
    act(render);
    act(() => Simulate.change(host.querySelector(`[data-behaviour-suggestion="${row.BehaviourObjectiveKey}"]`) as HTMLInputElement));
    const details = host.querySelector(`[data-selected-guidance="${row.BehaviourObjectiveKey}"]`) as HTMLElement;
    expect(Array.from(details.querySelectorAll('dd')).map(el => el.textContent)).toEqual([row.ObjectiveDescription, row.SuggestedMeasure, row.SuggestedUnit, row.SuggestedEvidence]);
  });
});
