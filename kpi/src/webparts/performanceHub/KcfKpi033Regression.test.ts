/** @jest-environment jsdom */

import { BEHAVIOUR_OBJECTIVE_LIBRARY_SEED } from './services/provisioning/BehaviourObjectiveLibrarySeed';
import {
  choosePrimaryBehaviourSuggestion,
  getEmployeeBehaviourSuggestions,
  normaliseEmployeeBehaviourSelection
} from './services/EmployeeBehaviourSelection';
import { EMPLOYEE_V2_BEHAVIOUR_SELECTION_ADDITIVE_FIELDS } from './services/EmployeeWorkplanV2PhysicalSchema';

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;
const previewSource = readFileSync(resolve('.', 'preview', 'preview.js'), 'utf8');
const previewCss = readFileSync(resolve('.', 'preview', 'preview.css'), 'utf8');

const PILLARS = [
  'SO1 – Inspire children and young people through cricket',
  'SO2 – Develop and enhance our facilities',
  'SO3 – Inspire, train & reward our cricket workforce',
  'SO4 – Transform women’s and girls’ Cricket',
  'SO5 – Advance cricket in our most diverse and urban area (SE London)',
  'SO6 – Sustain a thriving, participant centred club and league network',
  'SO7 – Deliver innovative and impactful community projects for everyone'
];

interface IPreviewApi {
  state: {
    core: Map<string, { [key: string]: unknown }>;
    pillars: string[];
    workstreams: string[];
    behaviours: Array<{
      id: string;
      selectedSuggestionKeys: string[];
      customObjective: string;
      q1: string; q2: string; q3: string; q4: string;
      targetRating: number;
      weight: number;
    }>;
  };
}

const catalogue = Array.from({ length: 109 }, (_unused, index) => {
  const pillar = PILLARS[index % PILLARS.length];
  return {
    id: index === 0 ? 'SO1-001' : `KPI-${index + 1 < 10 ? '00' : index + 1 < 100 ? '0' : ''}${index + 1}`,
    wording: index === 0 ? 'Increase participation in school cricket' : `Controlled KPI ${index + 1}`,
    pillar,
    workstream: index % 2 === 0 ? 'Shared delivery' : `Workstream ${index % PILLARS.length + 1}`,
    unit: 'People', annualTarget: 125, quarters: [25, 50, 75, 100]
  };
});

const click = (selector: string): void => {
  const control = document.querySelector<HTMLElement>(selector);
  if (!control) throw new Error(`Missing control ${selector}`);
  control.click();
};

const enter = (selector: string, value: string, eventName: 'input' | 'change' = 'input'): void => {
  const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  if (!control) throw new Error(`Missing input ${selector}`);
  control.value = value;
  control.dispatchEvent(new Event(eventName, { bubbles: true }));
};

describe('KCF-KPI-033 signed-off Core and Behaviour restoration', () => {
  it.each(['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const)(
    'exposes exactly the approved OBJ-01 to OBJ-05 set for %s and preserves OBJ-06 in source',
    behaviourKey => {
      const displayed = getEmployeeBehaviourSuggestions(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED, behaviourKey);
      expect(displayed).toHaveLength(5);
      expect(displayed.map(item => item.behaviourObjectiveKey)).toEqual(
        [1, 2, 3, 4, 5].map(index => `${behaviourKey}-OBJ-0${index}`)
      );
      expect(BEHAVIOUR_OBJECTIVE_LIBRARY_SEED.some(item => item.behaviourObjectiveKey === `${behaviourKey}-OBJ-06`)).toBe(true);
    }
  );

  it('does not expose a library record whose stable objective key belongs to another heading', () => {
    const crossHeadingRecord = {
      ...BEHAVIOUR_OBJECTIVE_LIBRARY_SEED[0],
      behaviourKey: 'BHV-01' as const,
      behaviourObjectiveKey: 'BHV-02-OBJ-01',
      sortOrder: 0
    };
    const displayed = getEmployeeBehaviourSuggestions(
      [crossHeadingRecord, ...BEHAVIOUR_OBJECTIVE_LIBRARY_SEED],
      'BHV-01'
    );
    expect(displayed.map(item => item.behaviourObjectiveKey)).not.toContain('BHV-02-OBJ-01');
  });

  it('retains multiple stable keys, rejects cross-heading/OBJ-06 keys and preserves the primary key', () => {
    const selected = ['BHV-01-OBJ-01', 'BHV-01-OBJ-03'];
    expect(normaliseEmployeeBehaviourSelection(selected, BEHAVIOUR_OBJECTIVE_LIBRARY_SEED, 'BHV-01')).toEqual(selected);
    expect(normaliseEmployeeBehaviourSelection([...selected, 'BHV-01-OBJ-06', 'BHV-02-OBJ-01'], BEHAVIOUR_OBJECTIVE_LIBRARY_SEED, 'BHV-01')).toEqual(selected);
    expect(choosePrimaryBehaviourSuggestion(selected, 'BHV-01-OBJ-03')).toBe('BHV-01-OBJ-03');
    expect(choosePrimaryBehaviourSuggestion(['BHV-01-OBJ-01'], 'BHV-01-OBJ-03')).toBe('BHV-01-OBJ-01');
  });

  it('defines the exact additive SharePoint contract without provisioning it', () => {
    expect(EMPLOYEE_V2_BEHAVIOUR_SELECTION_ADDITIVE_FIELDS).toEqual([
      'BehaviourSelectedSuggestionKeysJson', 'BehaviourCustomObjective'
    ]);
  });

  it('mounts seven composable Core controls and the complete 5 by 5 Behaviour editor', async () => {
    document.body.innerHTML = '<main id="preview-main" tabindex="-1"></main>';
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn().mockResolvedValue({ ok: true, json: async () => catalogue })
    });
    window.eval(previewSource);
    await new Promise(resolve => setTimeout(resolve, 0));
    const api = (window as unknown as { KcfKpiWorkplanPreview: IPreviewApi }).KcfKpiWorkplanPreview;

    click('[data-nav="build"]');
    expect(document.querySelectorAll('[data-pillar-filter]')).toHaveLength(7);
    expect(Array.from(document.querySelectorAll('[data-pillar-filter]')).map(item => item.textContent)).toEqual(
      expect.arrayContaining(['S01Inspire children and young people through cricket', 'S07Deliver innovative and impactful community projects for everyone'])
    );

    const pillarButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-pillar-filter]'));
    pillarButtons[0].click();
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-pillar-filter]'))[1].click();
    expect(api.state.pillars).toHaveLength(2);
    expect(document.querySelectorAll('[data-pillar-filter][aria-pressed="true"]')).toHaveLength(2);
    const visibleWorkstreams = Array.from(document.querySelectorAll<HTMLInputElement>('[data-workstream-filter]'));
    expect(visibleWorkstreams.length).toBeGreaterThan(1);
    expect(visibleWorkstreams.every(input => input.dataset.workstreamFilter?.startsWith(PILLARS[0])
      || input.dataset.workstreamFilter?.startsWith(PILLARS[1]))).toBe(true);
    visibleWorkstreams[0].click();
    Array.from(document.querySelectorAll<HTMLInputElement>('[data-workstream-filter]'))[1].click();
    expect(api.state.workstreams).toHaveLength(2);

    click('[data-show-all]');
    click('[data-add="SO1-001"]');
    expect(api.state.core.size).toBe(1);
    Array.from(document.querySelectorAll<HTMLButtonElement>('[data-pillar-filter]'))[2].click();
    expect(api.state.core.size).toBe(1);
    expect(document.querySelector('[data-selected-kpi="SO1-001"]')).not.toBeNull();
    enter('#catalogue-search', 'Controlled KPI 4');
    expect(document.querySelectorAll('.catalogue-grid [data-kpi-id]').length).toBeGreaterThan(0);
    click('[data-clear-filters]');
    expect(api.state.pillars).toHaveLength(0);
    expect(api.state.workstreams).toHaveLength(0);

    click('[data-workplan-step="behaviours"]');
    expect(document.querySelectorAll('article[data-behaviour-id]')).toHaveLength(5);
    expect(document.querySelectorAll('[data-behaviour-suggestion]')).toHaveLength(25);
    expect(document.querySelector('[data-behaviour-suggestion$="OBJ-06"]')).toBeNull();
    click('[data-use-behaviour-examples]');
    click('[data-behaviour-suggestion="BHV-01-OBJ-02"]');
    enter('[data-behaviour-field="customObjective"][data-behaviour-id="BHV-01"]', 'Help another team deliver an agreed outcome');
    enter('[data-behaviour-field="targetRating"][data-behaviour-id="BHV-01"]', '4');
    const restored = api.state.behaviours.find(item => item.id === 'BHV-01');
    expect(restored?.selectedSuggestionKeys).toEqual(['BHV-01-OBJ-01', 'BHV-01-OBJ-02']);
    expect(restored?.customObjective).toBe('Help another team deliver an agreed outcome');
    expect(restored?.targetRating).toBe(4);
    expect(restored?.q1).toBe('Q1 preview commitment 1');
    expect(restored?.q4).toBe('Q4 preview commitment 1');
    expect(api.state.behaviours.every(item => item.weight === 20)).toBe(true);
  });

  it('keeps the responsive, no-overflow, 44px-control and visible-focus contracts', () => {
    expect(previewCss).toContain('overflow-x: hidden');
    expect(previewCss).toContain('min-height: 44px');
    expect(previewCss).toContain(':focus-visible');
    expect(previewCss).toContain('@media (max-width: 720px)');
    expect(previewCss).toContain('@media (max-width: 390px)');
    expect(previewCss).toContain('@media (max-width: 320px)');
  });
});
