import * as React from 'react';
import * as ReactDOMServer from 'react-dom/server';
import type { IAnnualWorkplan, ICoreKpiCatalogueItem, ICoreWorkplanItem } from '../models/ProductionModels';
import CoreWorkplanPage from './CoreWorkplanPage';

const workplan: IAnnualWorkplan = {
  id: 1, etag: '"1"', workplanKey: 'person|2026', personKey: 'person', employeeDisplayName: 'Synthetic Person 02',
  employeeEmail: 'person003@example.invalid', performanceYear: 2026, managerDisplayName: 'Synthetic Person 01',
  managerEmail: 'person002@example.invalid', state: 'Draft', accessState: 'EmployeeEdit', transitionStatus: 'Ready',
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
};

const catalogue: ICoreKpiCatalogueItem[] = [
  { kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01', wording: 'Selected participation KPI', pillar: 'Participation', workstream: 'Schools', scoringDirection: 'HigherIsBetter', unitLabel: 'programmes' },
  { kpiId: 'SO2-001', kpiVersionKey: 'SO2-001|v01', targetVersionKey: 'SO2-001|2026|v01', wording: 'Available club KPI', pillar: 'Clubs', workstream: 'Club Development', scoringDirection: 'HigherIsBetter', unitLabel: 'clubs' }
];

const selected: ICoreWorkplanItem = {
  id: 1, etag: '"1"', workplanItemKey: 'selected-item', naturalKey: 'person|2026|CoreGold|SO1-001',
  workplanKey: workplan.workplanKey, personKey: workplan.personKey, performanceYear: 2026, kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|v01', targetVersionKey: 'SO1-001|2026|v01', coreWorkplanWeight: 100,
  employeeKpiRole: 'Contributor', displayOrder: 1, activeInWorkplan: true
};

describe('Core Workplan catalogue filter UI', () => {
  const render = (): string => ReactDOMServer.renderToStaticMarkup(React.createElement(CoreWorkplanPage, {
    catalogue, workplan, items: [selected], saving: false, onSave: async () => undefined
  }));

  it('keeps selected KPIs in a dedicated area outside the filterable catalogue', () => {
    const markup = render();
    const selectedStart = markup.indexOf('Selected Core summary');
    const catalogueStart = markup.indexOf('Available KPI catalogue');
    expect(selectedStart).toBeGreaterThan(-1);
    expect(catalogueStart).toBeGreaterThan(selectedStart);
    expect(markup.slice(selectedStart, catalogueStart)).toContain('SO1-001');
    expect(markup.slice(catalogueStart)).not.toContain('SO1-001');
    expect(markup.slice(catalogueStart)).toContain('SO2-001');
  });

  it('provides compact, collapsible and touch-friendly semantic filter controls for phone use', () => {
    const markup = render();
    expect(markup).toContain('aria-controls="core-filter-options"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('View preference only');
    expect(markup).toContain('Clear filters');
    expect(markup).toContain('Show all');
    expect((markup.match(/type="checkbox"/g) || []).length).toBeGreaterThanOrEqual(4);
  });
});
