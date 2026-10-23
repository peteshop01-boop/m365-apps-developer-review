/* eslint-disable @rushstack/pair-react-dom-render-unmount -- the shared afterEach unmounts every mounted harness. */
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import type { IAnnualWorkplan, ICoreKpiCatalogueItem, ICoreWorkplanItem } from '../models/ProductionModels';
import type { IIntegratedKpi } from '../services/IntegratedReferenceData';
import CoreWorkplanPage from './CoreWorkplanPage';
import { CoreBuilder, type ICoreChoice } from './IntegratedPerformanceHub';

const workplan = (state: IAnnualWorkplan['state'] = 'Draft'): IAnnualWorkplan => ({
  id: 1, etag: '"1"', workplanKey: 'employee|2027', personKey: 'employee',
  employeeDisplayName: 'Synthetic Employee', employeeEmail: 'employee@example.invalid', performanceYear: 2027,
  managerPersonKey: 'manager', managerDisplayName: 'Synthetic Manager', managerEmail: 'manager@example.invalid',
  state, accessState: state === 'Draft' || state === 'ChangesRequested' ? 'EmployeeEdit' : 'ReadOnly', transitionStatus: 'Ready',
  coreCategoryWeight: 70, personalCategoryWeight: 20, behaviourCategoryWeight: 10, rowVersionToken: 1
});

const kpi = (index: number): ICoreKpiCatalogueItem => {
  const id = `CORE-${String(index).padStart(3, '0')}`;
  return {
    kpiId: id, kpiVersionKey: `${id}|v01`, targetVersionKey: `${id}|2027|v01`,
    wording: `Synthetic governed KPI ${index}`, pillar: `Pillar ${Math.ceil(index / 25)}`,
    workstream: `Workstream ${Math.ceil(index / 10)}`, metricType: 'Number', unitLabel: 'outcomes',
    scoringDirection: 'HigherIsBetter', yearEndTarget: `${index * 10} annual`,
    q1Target: `${index} Q1`, q2Target: `${index * 2} Q2`, q3Target: `${index * 3} Q3`, q4Target: `${index * 4} Q4`
  };
};

const selected = (source: ICoreKpiCatalogueItem): ICoreWorkplanItem => ({
  id: 1, etag: '"1"', workplanItemKey: `item-${source.kpiId}`,
  naturalKey: `employee|2027|CoreGold|${source.kpiId}`, workplanKey: 'employee|2027',
  personKey: 'employee', performanceYear: 2027, kpiId: source.kpiId,
  kpiVersionKey: source.kpiVersionKey, targetVersionKey: source.targetVersionKey,
  coreWorkplanWeight: 100, employeeKpiRole: 'Contributor', displayOrder: 1, activeInWorkplan: true
});

const integratedKpi = (index: number): IIntegratedKpi => ({
  kpiId: `INT-${String(index).padStart(3, '0')}`, wording: `Integrated KPI ${index}`,
  pillarCode: 'S01', pillar: 'SO1 – Participation', workstream: 'Schools', unit: 'participants',
  annualTarget: index * 100, quarterTargets: [
    { quarter: 'Q1', value: index * 10 }, { quarter: 'Q2', value: index * 20 },
    { quarter: 'Q3', value: index * 30 }, { quarter: 'Q4', value: index * 40 }
  ], memberships: []
});

describe('BT-02 Annual Workplan slice 01', () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    host.remove();
  });

  const mount = (catalogue: ICoreKpiCatalogueItem[], items: ICoreWorkplanItem[], plan = workplan()): void => {
    act(() => {
      ReactDOM.render(<CoreWorkplanPage catalogue={catalogue} workplan={plan} items={items}
        saving={false} onSave={async () => undefined} />, host);
    });
  };

  const button = (label: string): HTMLButtonElement => {
    const match = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(candidate => candidate.textContent?.trim() === label);
    if (!match) throw new Error(`Expected button ${label}.`);
    return match;
  };

  it('renders identity, year, manager, state, readiness and Core section completion', () => {
    const source = kpi(1);
    mount([source], [selected(source)]);
    const text = host.textContent || '';
    ['Synthetic Employee', 'employee@example.invalid', '2027', 'Synthetic Manager', 'manager@example.invalid',
      'Draft', 'Ready', 'Core section completion', 'Complete', 'Selected 1 of 109', 'Measure', 'Number']
      .forEach(value => expect(text).toContain(value));
  });

  it('collapses and reopens the selected summary without losing editable state or governed targets', () => {
    const source = kpi(7);
    mount([source], [selected(source)]);
    const weight = host.querySelector<HTMLInputElement>(`[aria-label="${source.kpiId} Core Workplan Weight"]`);
    if (!weight) throw new Error('Expected selected KPI weight input.');
    act(() => { weight.value = '65'; Simulate.change(weight); });
    expect(host.textContent).toContain('70 annual');
    expect(host.textContent).toContain('7 Q1');
    expect(host.textContent).toContain('28 Q4');
    act(() => { button('Collapse selected summary').click(); });
    expect(host.querySelector('#selected-core-content')).toBeNull();
    act(() => { button('Reopen selected summary').click(); });
    expect(host.querySelector<HTMLInputElement>(`[aria-label="${source.kpiId} Core Workplan Weight"]`)?.value).toBe('65');
    expect(host.textContent).toContain('70 annual');
    expect(host.textContent).toContain('7 Q1');
    expect(host.textContent).toContain('28 Q4');
  });

  it('adds every one of the 109 approved current KPIs with no artificial cap', () => {
    const catalogue = Array.from({ length: 109 }, (_, index) => kpi(index + 1));
    mount(catalogue, []);
    for (let index = 0; index < catalogue.length; index += 1) {
      act(() => { button('Add').click(); });
    }
    expect(host.textContent).toContain('Selected 109 of 109');
    expect(Array.from(host.querySelectorAll('button')).filter(candidate => candidate.textContent?.trim() === 'Add')).toHaveLength(0);
    expect(Array.from(host.querySelectorAll('button')).filter(candidate => candidate.textContent?.trim() === 'Remove')).toHaveLength(109);
  });

  it('permits add/remove only while editable and rejects locked-state mutation', () => {
    const source = kpi(1);
    mount([source], []);
    act(() => { button('Add').click(); });
    expect(host.textContent).toContain('Selected 1 of 109');
    act(() => { button('Remove').click(); });
    expect(host.textContent).toContain('Selected 0 of 109');

    const second = kpi(2);
    mount([source, second], [selected(source)], workplan('Locked'));
    const add = button('Add');
    expect(add.disabled).toBe(true);
    const remove = button('Remove');
    expect(remove.disabled).toBe(true);
    act(() => { add.click(); });
    act(() => { remove.click(); });
    expect(host.textContent).toContain('Selected 1 of 109');
  });

  it.each([1366, 390])('keeps the complete journey reachable at a representative %ipx viewport', width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    const source = kpi(1);
    mount([source], [selected(source)]);
    expect(button('Collapse selected summary').getAttribute('aria-expanded')).toBe('true');
    expect(button('Save Draft').disabled).toBe(false);
    expect(host.querySelector(`input[aria-label="${source.kpiId} Core Workplan Weight"]`)).not.toBeNull();
    expect(button('Remove').disabled).toBe(false);
  });

  it('keeps the integrated selected summary targets visible and edit values stable across close/reopen', () => {
    const source = integratedKpi(1);
    const Harness: React.FC = () => {
      const [choices, setChoices] = React.useState<ICoreChoice[]>([{ kpiId: source.kpiId, weight: 100, annualContribution: '75' }]);
      return <CoreBuilder kpis={[source]} selections={choices} onChange={setChoices} />;
    };
    act(() => { ReactDOM.render(<Harness />, host); });
    expect(host.textContent).toContain('Selected 1 of 109');
    ['Measure', 'participants', 'Annual target', '100 participants', 'Q1', '10 participants', 'Q4', '40 participants']
      .forEach(value => expect(host.textContent).toContain(value));
    act(() => { button('Edit').click(); });
    const annual = Array.from(host.querySelectorAll('label')).find(label => label.textContent?.includes('My annual contribution'))
      ?.querySelector('input');
    if (!annual) throw new Error('Expected integrated annual contribution input.');
    act(() => { annual.value = '91'; Simulate.change(annual); });
    act(() => { button('Done editing (not saved)').click(); });
    expect(host.querySelector('[aria-label="Edit INT-001"]')).toBeNull();
    expect(host.textContent).toContain('100 participants');
    act(() => { button('Edit').click(); });
    expect(Array.from(host.querySelectorAll('label')).find(label => label.textContent?.includes('My annual contribution'))
      ?.querySelector('input')?.value).toBe('91');
  });

  it('adds beyond the removed 40-item integrated cap', () => {
    const sources = Array.from({ length: 41 }, (_, index) => integratedKpi(index + 1));
    const Harness: React.FC = () => {
      const [choices, setChoices] = React.useState<ICoreChoice[]>(sources.slice(0, 40)
        .map((source, index) => ({ kpiId: source.kpiId, weight: index === 0 ? 100 : 0 })));
      return <CoreBuilder kpis={sources} selections={choices} onChange={setChoices} />;
    };
    act(() => { ReactDOM.render(<Harness />, host); });
    const add = host.querySelector<HTMLButtonElement>('[aria-label="Add INT-041 to Workplan"]');
    if (!add) throw new Error('Expected the 41st integrated catalogue Add control.');
    expect(add.disabled).toBe(false);
    act(() => { add.click(); });
    expect(host.textContent).toContain('Selected 41 of 109');
  });
});
