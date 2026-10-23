/** @jest-environment jsdom */

jest.mock('@microsoft/sp-webpart-base', () => ({
  BaseClientSideWebPart: class {
    public context: unknown;
  }
}));
jest.mock('@microsoft/sp-core-library', () => ({
  Version: { parse: (value: string): string => value }
}));
jest.mock('@microsoft/sp-http', () => ({
  SPHttpClient: { configurations: { v1: {} } }
}));
jest.mock('react-dom', () => ({ ...jest.requireActual('react-dom'), render: jest.fn() }));
jest.mock('@microsoft/sp-property-pane', () => ({
  PropertyPaneTextField: (): object => ({})
}));
jest.mock('PerformanceHubWebPartStrings', () => ({
  PropertyPaneDescription: 'test', BasicGroupName: 'test', DescriptionFieldLabel: 'test'
}), { virtual: true });
jest.mock('./services/SharePointProductionDataService', () => ({
  __esModule: true,
  default: class {}
}));

import PerformanceHubWebPart from './PerformanceHubWebPart';
import * as ReactDom from 'react-dom';
import IntegratedPerformanceHub from './components/IntegratedPerformanceHub';

declare function require(name: string): {
  readFileSync(path: string, encoding: string): string;
  resolve(...parts: string[]): string;
};

const readFileSync = require('fs').readFileSync;
const resolve = require('path').resolve;

interface IPreviewApi {
  state: {
    core: Map<string, { [key: string]: unknown }>;
    personal: Array<{ id: string; title: string; [key: string]: unknown }>;
    behaviours: Array<{ id: string; selectedSuggestionKeys: string[]; customObjective: string; [key: string]: unknown }>;
  };
  readinessBlockers(): string[];
  render(): void;
}

const KCF_AUTOMATION = 'https://example.invalid/sites/REVIEW-TEST-SITE';
const previewSource = readFileSync(resolve('.', 'preview', 'preview.js'), 'utf8');
const previewCss = readFileSync(resolve('.', 'preview', 'preview.css'), 'utf8');
const previewIndex = readFileSync(resolve('.', 'preview', 'index.html'), 'utf8');
const packageConfig = readFileSync(resolve('.', 'config', 'config.json'), 'utf8');

const integratedRoute = (
  path: string = '/',
  site: string = KCF_AUTOMATION,
  email: string = 'preview.employee@example.invalid'
): boolean => {
  window.history.replaceState({}, '', path);
  const render = ReactDom.render as unknown as jest.Mock;
  render.mockClear();
  const webPart = new PerformanceHubWebPart();
  Object.defineProperty(webPart, 'context', {
    configurable: true,
    value: {
      pageContext: {
        web: { absoluteUrl: site },
        user: { email, displayName: 'Preview employee' }
      }
    }
  });
  Object.defineProperty(webPart, 'domElement', { value: document.createElement('div') });
  webPart.render();
  return (render.mock.calls[0][0] as { type: unknown }).type === IntegratedPerformanceHub;
};

describe('KCF-KPI-031 red gate', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('selects IntegratedPerformanceHub for the ordinary no-debug installed route', () => {
    expect(integratedRoute()).toBe(true);
  });

  it('renders the integrated app from the installed web part entry', () => {
    const render = ReactDom.render as unknown as jest.Mock;
    render.mockClear();
    const webPart = new PerformanceHubWebPart();
    Object.defineProperty(webPart, 'context', { value: {
      pageContext: { user: { email: 'employee@example.invalid', displayName: 'Employee' } }
    } });
    Object.defineProperty(webPart, 'domElement', { value: document.createElement('div') });
    webPart.render();
    expect(render).toHaveBeenCalledTimes(1);
    expect((render.mock.calls[0][0] as { type: unknown }).type).toBe(IntegratedPerformanceHub);
  });

  it('exposes Personal KPIs in the standalone preview', () => {
    expect(previewSource).toContain('data-workplan-step="personal"');
  });

  it('exposes Behaviours in the standalone preview', () => {
    expect(previewSource).toContain('data-workplan-step="behaviours"');
  });

  it('exposes Review & Weight in the standalone preview', () => {
    expect(previewSource).toContain('data-workplan-step="review"');
  });
});

describe('KCF-KPI-031 package-entry and preview requirements', () => {
  afterEach(() => window.history.replaceState({}, '', '/'));

  it('keeps the installed entry on the integrated app even with former local debug flags', () => {
    const Sponsor = 'person003@example.invalid';
    const paths = [
      `/?${new URLSearchParams({ kcfKpi018Uat: 'true', debug: 'true', debugManifestsFile: 'https://localhost:4321/temp/build/manifests.js' })}`,
      `/?${new URLSearchParams({ kcfKpi020AdminUat: 'true', debug: 'true', debugManifestsFile: 'https://localhost:4323/temp/build/manifests.js' })}`,
      `/?${new URLSearchParams({ kcfKpi020bAdminUat: 'true', debug: 'true', debugManifestsFile: 'https://localhost:4326/temp/build/manifests.js' })}`,
      `/?${new URLSearchParams({ kcfKpi025CoverageUat: 'true', debug: 'true', debugManifestsFile: 'https://localhost:4321/temp/build/manifests.js?kcf-kpi-025=1' })}`,
      `/?${new URLSearchParams({ kcfKpi025BusinessUat: 'true', kcfKpi025R2: 'KCF-KPI-025-R2-Sponsor-BUSINESS-UAT-4329', debug: 'true', debugManifestsFile: 'https://localhost:4329/temp/build/manifests.js' })}`
    ];
    paths.forEach(path => expect(integratedRoute(path, KCF_AUTOMATION, Sponsor)).toBe(true));
    expect(integratedRoute('/?debug=true&kcfKpi020AdminUat=true', KCF_AUTOMATION, Sponsor)).toBe(true);
  });

  it('retains the exact preview truth wording and isolates preview assets from the production bundle entry', () => {
    const truth = 'LOCAL PREVIEW — SESSION ONLY — NOT CONNECTED TO SHAREPOINT — NO REAL DATA SAVED';
    expect(previewIndex).toContain(truth);
    expect(previewSource).toContain(truth);
    expect(packageConfig).toContain('./lib/webparts/performanceHub/PerformanceHubWebPart.js');
    expect(packageConfig).not.toContain('preview/');
    expect(packageConfig).not.toContain('preview.js');
  });

  it('defines all five fixed KCF Behaviours, the maximum-five rule and default category weighting', () => {
    ['Work as One Team', 'Improve and Move Forward', 'Show Respect and Listen',
      'Bring Energy and Commitment', 'Own It and Put It Right'].forEach(label => expect(previewSource).toContain(label));
    expect(previewSource).toContain('state.personal.length >= 5');
    expect(previewSource).toContain("category: { core: 70, personal: 20, behaviours: 10 }");
    expect(previewSource).toContain("category = { core: 90, personal: 0, behaviours: 10 }");
  });

  it('defines containment, minimum target and keyboard-visible focus contracts for every required viewport', () => {
    expect(previewCss).toContain('overflow-x: hidden');
    expect(previewCss).toContain('overflow-x: clip');
    expect(previewCss).toContain('min-height: 45px');
    expect(previewCss).toContain(':focus-visible');
    expect(previewCss).toContain('--focus-gold: #9a6f00');
    expect(previewCss).toContain('outline: 3px solid var(--focus-gold)');
    expect(previewCss).toContain('@media (max-width: 1050px)');
    expect(previewCss).toContain('@media (max-width: 720px)');
    expect(previewCss).toContain('@media (max-width: 390px)');
    expect(previewCss).toContain('@media (max-width: 320px)');
  });

  it('mounts the complete four-step session journey with positive, negative and zero-Personal readiness', async () => {
    const catalogue = Array.from({ length: 109 }, (_unused, index) => ({
      id: index === 0 ? 'SO1-001' : `KPI-${index + 1 < 10 ? '00' : index + 1 < 100 ? '0' : ''}${index + 1}`,
      wording: index === 0 ? 'Increase participation in school cricket' : `Controlled KPI ${index + 1}`,
      pillar: 'Cricket', workstream: 'Participation', unit: 'People', annualTarget: 125, quarters: [25, 50, 75, 100]
    }));
    document.body.innerHTML = `<div class="preview-notice">LOCAL PREVIEW — SESSION ONLY — NOT CONNECTED TO SHAREPOINT — NO REAL DATA SAVED</div><nav><button data-nav="employee">Employee</button><button data-nav="build">Build My Workplan</button><button data-nav="workplan">My Workplan</button></nav><main id="preview-main" tabindex="-1"></main>`;
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: jest.fn().mockResolvedValue({ ok: true, json: async () => catalogue })
    });
    window.eval(previewSource);
    await new Promise(resolve => setTimeout(resolve, 0));

    const click = (selector: string): void => {
      const button = document.querySelector<HTMLButtonElement>(selector);
      if (!button) throw new Error(`Missing preview button ${selector}`);
      button.click();
    };
    const enter = (selector: string, value: string, eventName: 'input' | 'change' = 'input'): void => {
      const control = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
      if (!control) throw new Error(`Missing preview control ${selector}`);
      control.value = value;
      control.dispatchEvent(new Event(eventName, { bubbles: true }));
    };
    const api = (window as unknown as { KcfKpiWorkplanPreview: IPreviewApi }).KcfKpiWorkplanPreview;

    click('[data-nav="build"]');
    ['core', 'personal', 'behaviours', 'review'].forEach(step => {
      click(`[data-workplan-step="${step}"]`);
      expect(document.querySelector(`[data-preview-section="${step}"]`)).not.toBeNull();
    });

    click('[data-workplan-step="core"]');
    expect(document.querySelector('[data-count="available"]')?.textContent).toContain('109');
    click('[data-add="SO1-001"]');
    expect(document.querySelector('[data-count="available"]')?.textContent).toContain('108');
    click('[data-role="Delivery"]');
    [['annual', '125'], ['q1', '25'], ['q2', '50'], ['q3', '75'], ['q4', '100']].forEach(([key, value]) => enter(`[data-contribution="${key}"]`, value));
    click('[data-save-session="SO1-001"]');
    expect(api.state.core.size).toBe(1);

    click('[data-workplan-step="personal"]');
    for (let index = 0; index < 5; index += 1) click('[data-add-personal]');
    expect(api.state.personal).toHaveLength(5);
    expect(document.querySelector<HTMLButtonElement>('[data-add-personal]')?.disabled).toBe(true);
    ['PERS-05', 'PERS-04', 'PERS-03', 'PERS-02'].forEach(id => {
      if (!document.querySelector(`[data-personal-remove="${id}"]`)) click(`[data-personal-edit="${id}"]`);
      click(`[data-personal-remove="${id}"]`);
    });
    click('[data-personal-edit="PERS-01"]');
    enter('[data-personal-field="title"]', 'Grow school partnerships');
    enter('[data-personal-field="measure"]', 'Active school partnerships');
    enter('[data-personal-field="unit"]', 'Schools');
    enter('[data-personal-field="success"]', 'Twenty schools actively engaged');
    [['annual', '20'], ['q1', '5'], ['q2', '10'], ['q3', '15'], ['q4', '20']].forEach(([key, value]) => enter(`[data-personal-period="${key}"]`, value));
    click('[data-personal-save="PERS-01"]');

    click('[data-workplan-step="behaviours"]');
    expect(document.querySelectorAll('[data-behaviour-id^="BHV-"]')).not.toHaveLength(0);
    click('[data-use-behaviour-examples]');
    click('[data-behaviour-mode="custom"][data-behaviour-id="BHV-02"]');
    enter('[data-behaviour-field="customObjective"][data-behaviour-id="BHV-02"]', 'Create a better quarterly feedback loop');
    expect(api.state.behaviours.every(item => item.selectedSuggestionKeys.length === 1)).toBe(true);
    expect(api.state.behaviours.find(item => item.id === 'BHV-02')?.customObjective).toBe('Create a better quarterly feedback loop');
    expect(api.state.behaviours.every(item => Number(item.weight) === 20)).toBe(true);

    click('[data-workplan-step="review"]');
    enter('[data-category="core"]', '60');
    click('[data-check-readiness]');
    expect(document.querySelector('[data-preview-ready="false"]')?.textContent).toContain('total exactly 100%');
    click('[data-default-weights]');
    expect(document.querySelector('[data-preview-ready="true"]')?.textContent).toContain('Ready for preview review');

    click('[data-nav="workplan"]');
    expect(document.body.textContent).toContain('Increase participation in school cricket');
    expect(document.body.textContent).toContain('Grow school partnerships');
    expect(document.body.textContent).toContain('Create a better quarterly feedback loop');
    expect(document.body.textContent).toContain('70% Core');
    click('[data-personal-edit="PERS-01"]');
    enter('[data-personal-field="title"]', 'Grow school partnerships — amended');
    click('[data-personal-save="PERS-01"]');
    click('[data-nav="workplan"]');
    expect(document.body.textContent).toContain('Grow school partnerships — amended');

    click('[data-personal-remove="PERS-01"]');
    click('[data-workplan-step="review"]');
    click('[data-zero-personal]');
    expect(document.querySelector('[data-preview-ready="false"]')?.textContent).toContain('Record why');
    enter('[data-zero-personal-reason]', 'Role is fully represented by controlled Core KPIs.');
    click('[data-check-readiness]');
    expect(api.readinessBlockers()).toHaveLength(0);
    expect(document.querySelector('[data-preview-ready="true"]')).not.toBeNull();

    click('[data-nav="workplan"]');
    click('[data-remove="SO1-001"]');
    expect(api.state.core.size).toBe(0);
    click('[data-workplan-step="core"]');
    expect(document.querySelector('[data-count="available"]')?.textContent).toContain('109');
    const focusTarget = document.querySelector<HTMLButtonElement>('[data-workplan-step="personal"]');
    focusTarget?.focus();
    expect(document.activeElement).toBe(focusTarget);
  });
});
