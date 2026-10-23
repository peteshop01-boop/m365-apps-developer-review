/** @jest-environment jsdom */
/* eslint-disable @rushstack/pair-react-dom-render-unmount */

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import * as ReactDOMServer from 'react-dom/server';
import { act, Simulate } from 'react-dom/test-utils';
import { getAdminFoundationEntitlement } from '../services/AdminFoundationEntitlement';
import { createAdminPeopleUatState } from '../services/AdminPeopleUat';
import { createAdminTeamsUatState } from '../services/AdminTeamsUat';
import { buildKpiDataQualityQueue } from '../services/KpiDataQuality';
import BehaviourObjectiveLibraryAdminPage from './BehaviourObjectiveLibraryAdminPage';
import AdminFoundationPage from './AdminFoundationPage';
import ProductionNavigation from './ProductionNavigation';
import AdminFoundationUatHarness, {
  buildAdminUatBehaviourLibrary,
  buildAdminUatConfig,
  buildAdminUatPeople
} from './AdminFoundationUatHarness';

const clickButton = (container: HTMLElement, label: string): void => {
  const button = Array.from(container.querySelectorAll('button'))
    .filter(candidate => (candidate.textContent || '').indexOf(label) >= 0)[0];
  if (!button) throw new Error(`Button containing "${label}" was not rendered.`);
  act(() => Simulate.click(button));
};

const mountAdminUat = (container: HTMLElement): void => {
  act(() => {
    ReactDOM.render(React.createElement(AdminFoundationUatHarness, {
      productionIdentity: 'Synthetic Person 02 · person003@example.invalid'
    }), container);
  });
};

describe('KCF-KPI-020A Admin Foundation integration', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('renders the actual Admin Home, all bounded destinations and attention summary', () => {
    mountAdminUat(container);

    expect(container.textContent).toContain('Admin Foundation');
    expect(container.textContent).toContain('SAFE ADMIN UAT');
    expect(container.textContent).toContain('Browser memory only · no SharePoint writes');
    ['Admin Home', 'People', 'Hierarchy', 'Teams', 'Behaviour Library', 'Config', 'Data Quality']
      .forEach(label => expect(container.textContent).toContain(label));
    expect(container.textContent).toContain('What needs Admin attention?');
    expect(container.textContent).toContain('24');
    expect(container.textContent).toContain('30');
    expect(container.textContent).toContain('Teams not configured');
    expect(container.textContent).toContain('Separate controlled area:');
    expect(container.textContent).toContain('use Reporting Control for organisational weighting');
  });

  it('excludes Administration from ordinary employee navigation and exposes it only through the existing Admin role hook', () => {
    const ordinary = getAdminFoundationEntitlement(['Employee']);
    const admin = getAdminFoundationEntitlement(['Employee', 'Senior Manager Admin']);
    expect(ordinary).toEqual({
      entitled: false,
      showAdminNavigation: false,
      authorisationSource: 'ExistingApplicationRoleHook'
    });
    expect(admin.showAdminNavigation).toBe(true);

    const renderNavigation = (showAdmin: boolean): string => ReactDOMServer.renderToStaticMarkup(
      React.createElement(ProductionNavigation, {
        activeSection: 'overview',
        showManager: false,
        showRecovery: false,
        showAdmin,
        showDataQuality: false,
        showBehaviourAdmin: false,
        onChange: () => undefined
      })
    );
    expect(renderNavigation(false)).not.toContain('Administration');
    expect(renderNavigation(false)).not.toContain('Reporting Control');
    expect(renderNavigation(true)).toContain('Administration');
    expect(renderNavigation(true)).toContain('Reporting Control');
  });

  it('renders the controlled 24-People read path and usable People controls', () => {
    expect(buildAdminUatPeople()).toHaveLength(24);
    mountAdminUat(container);
    clickButton(container, 'People');

    expect(container.textContent).toContain('People Admin');
    expect(container.textContent).toContain('24-record read path confirmed');
    expect(container.textContent).toContain('23 active');
    expect(container.textContent).toContain('1 inactive');
    const personCards = Array.from(container.querySelectorAll('button'))
      .filter(button => /Synthetic Person \d{2}/.test(button.textContent || ''));
    expect(personCards).toHaveLength(24);
    ['Search People', 'Add Person', 'Manager', 'Team'].forEach(label => expect(container.textContent).toContain(label));
  });

  it('shows count drift and never confirms the signed 24-record read path for a well-formed 23-record roster', () => {
    const driftedPeople = buildAdminUatPeople().slice(0, 23);
    act(() => {
      ReactDOM.render(React.createElement(AdminFoundationPage, {
        peopleState: createAdminPeopleUatState(driftedPeople),
        teamsState: createAdminTeamsUatState([]),
        behaviourLibrary: buildAdminUatBehaviourLibrary(),
        configRecords: buildAdminUatConfig(),
        kpiDataQualityQueue: buildKpiDataQualityQueue([]),
        localUat: false,
        productionIdentity: 'Synthetic Admin',
        actorEmail: 'synthetic.admin@example.invalid'
      }), container);
    });

    expect(container.textContent).toContain('record-count drift: read 23; the signed baseline is 24');
    expect(container.textContent).not.toContain('24-record read path confirmed');
    clickButton(container, 'People');
    expect(container.textContent).toContain('record-count drift: read 23; the signed baseline is 24');
    expect(container.textContent).not.toContain('24-record read path confirmed');
  });

  it('shows the People-derived unique top-level resolution without an injected identity prop', () => {
    mountAdminUat(container);
    clickButton(container, 'Hierarchy');

    expect(container.textContent).toContain('One active top-level lead resolved');
    expect(container.textContent).toContain('0 relationship issues');
  });

  it('shows the legitimate empty Teams state without inventing a Team name', () => {
    mountAdminUat(container);
    clickButton(container, 'Teams');

    expect(container.textContent).toContain('Teams Admin');
    expect(container.textContent).toContain('Teams not configured');
    expect(container.textContent).toContain('No final KCF Team names have been invented');
    ['TeamKey', 'Team name', 'Team Lead', 'Sort order', 'Add Team']
      .forEach(label => expect(container.textContent).toContain(label));
  });

  it('preserves all 30 Behaviour fixtures while providing banner and text search', () => {
    const library = buildAdminUatBehaviourLibrary();
    const before = JSON.stringify(library);
    const onChange = jest.fn();
    act(() => {
      ReactDOM.render(React.createElement(BehaviourObjectiveLibraryAdminPage, {
        records: library,
        localUat: true,
        onChange
      }), container);
    });

    expect(library).toHaveLength(30);
    expect(container.textContent).toContain('30 active across all Behaviours');
    expect(container.textContent).toContain('6 objectives shown');
    expect(container.textContent).toContain('Behaviour banner');
    const search = container.querySelector('input[type="search"]') as HTMLInputElement;
    expect(search).not.toBeNull();
    search.value = 'objective 2';
    act(() => Simulate.change(search));
    expect(container.textContent).toContain('1 objective shown');
    expect(onChange).not.toHaveBeenCalled();
    expect(JSON.stringify(library)).toBe(before);
  });

  it('performs every Behaviour Library Admin operation in browser memory without losing the 30 seeded records', async () => {
    const originalKeys = buildAdminUatBehaviourLibrary().map(record => record.behaviourObjectiveKey);
    const findArticle = (key: string): HTMLElement => {
      const article = Array.from(container.querySelectorAll('article'))
        .filter(candidate => (candidate.textContent || '').indexOf(key) >= 0)[0] as HTMLElement;
      if (!article) throw new Error(`Behaviour objective ${key} was not rendered.`);
      return article;
    };
    const buttonIn = (article: HTMLElement, label: string): HTMLButtonElement => {
      const button = Array.from(article.querySelectorAll('button'))
        .filter(candidate => (candidate.textContent || '').trim() === label)[0];
      if (!button) throw new Error(`Behaviour action ${label} was not rendered.`);
      return button;
    };
    const controlIn = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      article: HTMLElement,
      label: string,
      selector: string
    ): T => {
      const labelled = Array.from(article.querySelectorAll('label'))
        .filter(candidate => candidate.querySelector('span')?.textContent === label)[0];
      const control = labelled?.querySelector(selector) as T;
      if (!control) throw new Error(`Behaviour field ${label} was not rendered.`);
      return control;
    };

    mountAdminUat(container);
      clickButton(container, 'Behaviour Library');
      expect(container.textContent).toContain('30 active across all Behaviours');

      const objectiveKey = 'BHV-01-SYN-01';
      let article = findArticle(objectiveKey);
      const title = controlIn<HTMLInputElement>(article, 'Objective title', 'input');
      title.value = 'Edited synthetic objective in Admin UAT';
      act(() => Simulate.change(title));
      article = findArticle(objectiveKey);
      await act(async () => {
        Simulate.click(buttonIn(article, 'Save objective'));
        await Promise.resolve();
      });
      expect(controlIn<HTMLInputElement>(findArticle(objectiveKey), 'Objective title', 'input').value)
        .toBe('Edited synthetic objective in Admin UAT');
      expect(container.textContent).toContain('Objective saved in browser memory only.');

      await act(async () => {
        Simulate.click(buttonIn(findArticle(objectiveKey), 'Deactivate'));
        await Promise.resolve();
      });
      expect(findArticle(objectiveKey).textContent).toContain('Inactive');
      expect(container.textContent).toContain('29 active across all Behaviours');
      await act(async () => {
        Simulate.click(buttonIn(findArticle(objectiveKey), 'Reactivate'));
        await Promise.resolve();
      });
      expect(findArticle(objectiveKey).textContent).toContain('Active');
      expect(container.textContent).toContain('30 active across all Behaviours');

      await act(async () => {
        Simulate.click(buttonIn(findArticle(objectiveKey), 'Move down'));
        await Promise.resolve();
      });
      const visibleKeysAfterReorder = Array.from(container.querySelectorAll('article'))
        .map(candidate => candidate.querySelector('div span')?.textContent);
      expect(visibleKeysAfterReorder.slice(0, 2)).toEqual(['BHV-01-SYN-02', objectiveKey]);
      expect(container.textContent).toContain('Order changed in browser memory only.');

      const banner = controlIn<HTMLSelectElement>(findArticle(objectiveKey), 'Behaviour', 'select');
      banner.value = 'BHV-02';
      act(() => Simulate.change(banner));
      expect(findArticle(objectiveKey)).toBeDefined();
      await act(async () => {
        Simulate.click(buttonIn(findArticle(objectiveKey), 'Save objective'));
        await Promise.resolve();
      });
      expect(controlIn<HTMLSelectElement>(findArticle(objectiveKey), 'Behaviour', 'select').value).toBe('BHV-02');
      expect(container.textContent).toContain('30 active across all Behaviours');

      clickButton(container, 'Add objective');
      expect(container.textContent).toContain('31 active across all Behaviours');
      const addedArticle = Array.from(container.querySelectorAll('article'))
        .filter(candidate => (candidate.textContent || '').indexOf('BHV-02-LOCAL-') >= 0)[0] as HTMLElement;
      expect(addedArticle).toBeDefined();
      await act(async () => {
        Simulate.click(buttonIn(addedArticle, 'Save objective'));
        await Promise.resolve();
      });
      expect(container.textContent).toContain('The Behaviour objective key, title, description, measure, unit and evidence guidance are required.');
      expect(container.textContent).toContain('31 active across all Behaviours');
      const populate = (label: string, value: string, selector: 'input' | 'textarea' = 'input'): void => {
        const control = controlIn<HTMLInputElement | HTMLTextAreaElement>(addedArticle, label, selector);
        control.value = value;
        act(() => Simulate.change(control));
      };
      populate('Objective title', 'Synthetic local objective');
      populate('Description', 'Synthetic browser-memory-only description.', 'textarea');
      populate('Suggested measure', 'Synthetic evidence check.', 'textarea');
      populate('Suggested unit', 'local test');
      populate('Suggested evidence', 'Synthetic browser-memory-only evidence.', 'textarea');
      await act(async () => {
        Simulate.click(buttonIn(findArticle((addedArticle.querySelector('div span') as HTMLElement).textContent || ''), 'Save objective'));
        await Promise.resolve();
      });
      expect(container.textContent).toContain('Objective saved in browser memory only.');

      const bannerFilterLabel = Array.from(container.querySelectorAll('label'))
        .filter(label => label.querySelector('span')?.textContent === 'Behaviour banner')[0];
      const bannerFilter = bannerFilterLabel.querySelector('select') as HTMLSelectElement;
      const retainedKeys: string[] = [];
      ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'].forEach(key => {
        bannerFilter.value = key;
        act(() => Simulate.change(bannerFilter));
        Array.from(container.querySelectorAll('article')).forEach(candidate => {
          const renderedKey = candidate.querySelector('div span')?.textContent;
          if (renderedKey) retainedKeys.push(renderedKey);
        });
      });
      expect(new Set(retainedKeys).size).toBe(31);
      originalKeys.forEach(key => expect(retainedKeys).toContain(key));
  });

  it('renders all supported typed Config categories and practical Data Quality filters', () => {
    const uatConfig = buildAdminUatConfig();
    expect(uatConfig.length).toBeGreaterThan(0);
    expect(uatConfig.filter(record => record.key === 'RAG.InvalidIsUnassessed')).toEqual([
      expect.objectContaining({ valueType: 'Boolean', booleanValue: true })
    ]);
    mountAdminUat(container);
    clickButton(container, 'Config');
    ['Performance Year', 'Quarters and deadlines', 'RAG thresholds', 'Workplan defaults and guardrails', 'Reminder configuration']
      .forEach(label => expect(container.textContent).toContain(label));
    expect(container.textContent).toContain('Supported typed values only');
    expect(container.textContent).toContain('does not send notifications');
    expect(container.textContent).toContain('Invalid results are unassessed');
    expect(container.textContent).toContain('Stage related values, then validate and save this group together.');
    expect(Array.from(container.querySelectorAll('button'))
      .filter(button => button.textContent === 'Validate and save group')).toHaveLength(5);

    clickButton(container, 'Data Quality');
    ['Priority', 'Pillar', 'Workstream', 'Owner', 'Issue type', 'Clear filters']
      .forEach(label => expect(container.textContent).toContain(label));
    expect(container.textContent).toContain('issue-priority labels only; they are not employee performance ratings');

    const priorityLabel = Array.from(container.querySelectorAll('label'))
      .filter(label => label.querySelector('span')?.textContent === 'Priority')[0];
    const priority = priorityLabel?.querySelector('select') as HTMLSelectElement;
    expect(priority).not.toBeNull();
    const before = Number((container.textContent || '').match(/(\d+) shown/)?.[1]);
    priority.value = 'P1';
    act(() => Simulate.change(priority));
    const after = Number((container.textContent || '').match(/(\d+) shown/)?.[1]);
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThan(before);
  });

});
