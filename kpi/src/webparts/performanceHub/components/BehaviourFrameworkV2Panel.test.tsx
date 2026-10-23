import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import BehaviourFrameworkV2Panel from './BehaviourFrameworkV2Panel';
import {
  behaviourFrameworkV2TestCatalogue as catalogue,
  createBehaviourFrameworkV2TestAssessments,
  createBehaviourFrameworkV2TestEvidence,
  createBehaviourFrameworkV2TestReviews,
  createBehaviourFrameworkV2TestSelections
} from '../testing/BehaviourFrameworkV2TestData';
import type { BehaviourFrameworkV2Rating } from '../services/BehaviourFrameworkV2';

describe('BT-04 Sponsor-approved Behaviour v1 mounted employee/manager surfaces', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });

  const mount = (overrides: Partial<React.ComponentProps<typeof BehaviourFrameworkV2Panel>> = {}): void => {
    const props: React.ComponentProps<typeof BehaviourFrameworkV2Panel> = {
      catalogue, roleLevelCode: 'L2', audience: 'Employee', view: 'Draft',
      selections: createBehaviourFrameworkV2TestSelections(), reviews: createBehaviourFrameworkV2TestReviews(),
      evidence: createBehaviourFrameworkV2TestEvidence(), assessments: createBehaviourFrameworkV2TestAssessments(),
      quarter: 'Q1', asOf: new Date('2026-11-01'), onToggleCatalogueTarget: () => undefined,
      onCommitmentChange: () => undefined, ...overrides
    };
    ReactDOM.render(React.createElement(BehaviourFrameworkV2Panel, props), host);
  };

  it('renders the exact five headlines and only the 25 governed Manager examples/prompts', () => {
    act(() => mount());
    expect(Array.from(host.querySelectorAll('[data-headline-behaviour] h3')).map(node => node.textContent)).toEqual([
      'WE TAKE RESPONSIBILITY', 'WE UNITE AS ONE CLUB', 'WE BUILD THE NEXT CHAPTER',
      'WE RESPECT THE GAME & EACH OTHER', 'WE WORK & PLAY WITH ENERGY'
    ]);
    expect(host.querySelectorAll('[data-focus-choice]')).toHaveLength(25);
    expect(Array.from(host.querySelectorAll('[data-focus-choice]')).every(node => node.getAttribute('data-focus-choice')?.includes('-L2-'))).toBe(true);
    expect(host.textContent).toContain('Manager focus areas and approved examples / prompts');
    expect(host.textContent).toContain('examples/prompts, not mandatory targets');
    expect(host.textContent).toContain('Normally about 3–5 overall. This is guidance, not a hard cap.');
    expect(host.textContent).toContain('Make ownership clear across my team and follow through on agreed actions.');
  });

  it('supports approved-example and own-commitment paths with exact required labels and prompts', () => {
    const changes: Array<[string, string, string]> = [];
    const own: Array<[string, string, string]> = [];
    act(() => mount({
      onCommitmentChange: (key, field, value) => changes.push([key, field, value]),
      onAddOwnTarget: (behaviourKey, focusKey, focusTitle) => own.push([behaviourKey, focusKey, focusTitle])
    }));
    const ownButton = host.querySelector('[data-add-own-target="BHV-01-FOCUS-01"]') as HTMLButtonElement;
    expect(ownButton.textContent).toContain('WRITE MY OWN BEHAVIOUR COMMITMENT FOR');
    act(() => ownButton.click());
    expect(own).toEqual([['BHV-01', 'BHV-01-FOCUS-01', 'OWN COMMITMENTS']]);
    expect(host.textContent).toContain('MY COMMITMENT');
    expect(host.textContent).toContain('What will you actually do in your role to demonstrate this Behaviour?');
    expect(host.textContent).toContain('HOW WILL WE KNOW?');
    expect(host.textContent).toContain('What would you, your manager or colleagues expect to see if you are making progress?');
    const commitment = host.querySelector('[data-commitment-input="BHV-01-L2-01"]') as HTMLTextAreaElement;
    commitment.value = 'Changed exact commitment';
    act(() => Simulate.change(commitment));
    const evidence = host.querySelector('[data-how-will-we-know-input="BHV-01-L2-01"]') as HTMLTextAreaElement;
    evidence.value = 'Changed observable progress';
    act(() => Simulate.change(evidence));
    expect(changes).toEqual([
      ['BHV-01-L2-01', 'commitment', 'Changed exact commitment'],
      ['BHV-01-L2-01', 'howWillWeKnow', 'Changed observable progress']
    ]);
  });

  it('reads exact selected example, authored fields, version and manager history in Draft/review/history', () => {
    const selections = createBehaviourFrameworkV2TestSelections();
    const reviews = createBehaviourFrameworkV2TestReviews();
    const before = JSON.stringify({ selections, reviews });
    (['Draft', 'Review', 'History'] as const).forEach(view => {
      act(() => mount({ view, audience: view === 'Draft' ? 'Employee' : 'Manager', selections, reviews,
        onManagerReview: view === 'Review' ? () => undefined : undefined }));
      expect(host.querySelectorAll('[data-selected-target]')).toHaveLength(4);
      expect(host.querySelector('[data-selected-target="BHV-01-L2-01"]')?.textContent)
        .toContain('Make ownership clear across my team and follow through on agreed actions.');
      expect(host.querySelector('[data-selected-target="BHV-01-L2-01"]')?.textContent).toContain(selections[0].commitment);
      expect(host.querySelector('[data-selected-target="BHV-01-L2-01"]')?.textContent).toContain(selections[0].howWillWeKnow);
      expect(host.querySelector('[data-selected-target="BHV-04-OWN-SYNTH01"]')?.getAttribute('data-target-source')).toBe('Own');
      expect(host.querySelectorAll('[data-selected-target="BHV-01-L2-01"] [data-review-status]')).toHaveLength(2);
      expect(host.querySelector('[data-selected-target="BHV-01-L2-01"]')?.textContent).toContain('CHANGES REQUESTED');
      expect(host.querySelector('[data-selected-target="BHV-01-L2-01"]')?.textContent).toContain('AGREED');
    });
    expect(JSON.stringify({ selections, reviews })).toBe(before);
  });

  it('records only exact AGREED or CHANGES REQUESTED manager actions and requires a change comment', () => {
    const decisions: Array<[string, string, string]> = [];
    act(() => mount({ view: 'Review', audience: 'Manager', onManagerReview: (key, status, comment) => decisions.push([key, status, comment]) }));
    const area = host.querySelector('[data-selected-target="BHV-01-L2-01"]') as HTMLElement;
    const comment = area.querySelector('[data-manager-review-comment]') as HTMLTextAreaElement;
    const requested = Array.from(area.querySelectorAll('button')).find(candidate => candidate.textContent === 'CHANGES REQUESTED') as HTMLButtonElement;
    expect(requested.disabled).toBe(true);
    act(() => (Array.from(area.querySelectorAll('button')).find(candidate => candidate.textContent === 'AGREED') as HTMLButtonElement).click());
    comment.value = 'Make the observable progress clearer.';
    act(() => Simulate.change(comment));
    expect(requested.disabled).toBe(false);
    act(() => requested.click());
    expect(decisions).toEqual([
      ['BHV-01-L2-01', 'AGREED', ''],
      ['BHV-01-L2-01', 'CHANGES REQUESTED', 'Make the observable progress clearer.']
    ]);
  });

  it('uses interactive Draft examples and read-only manager review examples', () => {
    const toggled: string[] = [];
    act(() => mount({ onToggleCatalogueTarget: key => toggled.push(key) }));
    act(() => Simulate.change(host.querySelector('[data-focus-choice="BHV-01-L2-02"]') as HTMLInputElement));
    expect(toggled).toEqual(['BHV-01-L2-02']);
    act(() => mount({ view: 'Review', audience: 'Manager' }));
    expect((host.querySelector('[data-focus-choice="BHV-01-L2-02"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('binds quarterly evidence and only named D/E/E ratings at headline level', () => {
    const evidenceChanges: string[] = [];
    const ratingChanges: Array<[string, string, BehaviourFrameworkV2Rating | undefined]> = [];
    act(() => mount({ view: 'QuarterlyEmployee', onEvidenceChange: (_key, value) => evidenceChanges.push(value),
      onAssessmentChange: (key, field, rating) => ratingChanges.push([key, field, rating]) }));
    const employeeRating = host.querySelector('[data-headline-assessment="BHV-01"] [data-rating-field="employeeRating"]') as HTMLSelectElement;
    expect(Array.from(employeeRating.options).map(option => option.textContent)).toEqual(['Not assessed', 'Developing', 'Effective', 'Exceptional']);
    expect(host.querySelector('[data-selected-target] [data-rating-field]')).toBeNull();
    expect((host.querySelector('[data-headline-assessment="BHV-01"] [data-rating-field="managerRating"]') as HTMLSelectElement).disabled).toBe(true);
    employeeRating.value = 'Developing';
    act(() => Simulate.change(employeeRating));
    const evidenceInput = host.querySelector('[data-evidence-input="BHV-01-L2-01"]') as HTMLTextAreaElement;
    evidenceInput.value = 'Updated exact evidence';
    act(() => Simulate.change(evidenceInput));
    expect(ratingChanges).toContainEqual(['BHV-01', 'employeeRating', 'Developing']);
    expect(evidenceChanges).toContain('Updated exact evidence');
  });

  it.each([[1366, 768], [390, 844]])('mounts complete readable commitments at %ipx by %ipx', (width, height) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    act(() => mount({ view: 'History', audience: 'Manager' }));
    expect(host.querySelector('[data-behaviour-framework-v2="History"]')).not.toBeNull();
    expect(host.querySelectorAll('[data-headline-behaviour]')).toHaveLength(5);
    expect(host.querySelectorAll('[data-selected-target]')).toHaveLength(4);
    expect(host.textContent).not.toMatch(/undefined|null|NaN/);
  });
});
