import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createAdminPeopleUatState } from '../services/AdminPeopleUat';
import { createAdminTeamsUatState } from '../services/AdminTeamsUat';
import {
  ADMIN_OVERALL_DELIVERY_CONFIG_KEYS,
  type IAdminConfigSourceRecord
} from '../services/AdminConfigDomain';
import { buildKpiDataQualityQueue } from '../services/KpiDataQuality';
import AdminFoundationPage from './AdminFoundationPage';
import { buildAdminUatConfig } from './AdminFoundationUatHarness';

const configRecords = (): IAdminConfigSourceRecord[] => {
  const legacy = buildAdminUatConfig().map((record, index) => ({
    ...record,
    id: index + 1,
    etag: `"${index + 1}"`,
    environment: 'Production',
    changeReference: `CFG-${index + 1}`
  }));
  return legacy.concat([
    {
      id: legacy.length + 1,
      etag: `"${legacy.length + 1}"`,
      key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight,
      valueType: 'Number',
      numberValue: 70,
      environment: 'Production',
      active: true,
      changeReference: 'CFG-OVERALL-CORE',
      modifiedAt: '2026-08-21T09:00:00.000Z',
      modifiedBy: 'config.owner@example.invalid'
    },
    {
      id: legacy.length + 2,
      etag: `"${legacy.length + 2}"`,
      key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight,
      valueType: 'Number',
      numberValue: 30,
      environment: 'Production',
      active: true,
      changeReference: 'CFG-OVERALL-IMPACT',
      modifiedAt: '2026-08-21T09:00:00.000Z',
      modifiedBy: 'config.owner@example.invalid'
    }
  ]);
};

const renderPage = (container: HTMLDivElement, performanceYear: number): void => {
  act(() => {
    ReactDOM.render(<AdminFoundationPage
      peopleState={createAdminPeopleUatState([])}
      teamsState={createAdminTeamsUatState([])}
      behaviourLibrary={[]}
      configRecords={configRecords()}
      configShellBoundary={{ environment: 'Production', performanceYear }}
      kpiDataQualityQueue={buildKpiDataQualityQueue([])}
      localUat={false}
      productionIdentity="Synthetic Admin"
      actorEmail="admin@example.invalid"
    />, container);
  });
};

const openConfig = (container: HTMLElement): void => {
  const button = Array.from(container.querySelectorAll('button'))
    .find(candidate => candidate.textContent?.includes('Config'));
  if (!button) throw new Error('Missing Config navigation button.');
  act(() => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

describe('Admin Foundation typed Config shell', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(container); });
    container.remove();
  });

  it('renders exact environment/year/version/state/provenance only after the typed boundary passes', () => {
    renderPage(container, 2027);
    openConfig(container);

    expect(container.textContent).toContain('Typed shell locked · Production · 2027 · 22 versioned records');
    const yearArticle = Array.from(container.querySelectorAll('article'))
      .find(article => article.textContent?.includes('PerformanceYear.Current'));
    expect((yearArticle?.querySelector('input') as HTMLInputElement | null)?.value).toBe('2026/27');
    expect(container.textContent).toContain('Version "1" · Active · CFG-1');
    expect(container.textContent).toContain('Core 70% · Impact 30% · Behaviours excluded · total 100%');
    expect(container.textContent).toContain('poor-Core masking guard remains a required downstream governed rule');
    expect(container.textContent).toContain('does not send notifications or calculate Overall Delivery');
  });

  it('fails closed and withholds typed values when the expected year mismatches', () => {
    renderPage(container, 2026);
    openConfig(container);

    expect(container.textContent).toContain('PerformanceYear mismatch: expected 2026, found 2027');
    expect(container.querySelectorAll('article')).toHaveLength(0);
    expect(container.textContent).not.toContain('CFG-1');
  });
});
