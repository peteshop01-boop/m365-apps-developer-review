/* eslint-disable @rushstack/pair-react-dom-render-unmount -- mounted host is unmounted in afterEach */
jest.mock('@microsoft/sp-core-library', () => ({
  Guid: { newGuid: (): { toString(): string } => ({ toString: () => 'slice-03-guid' }) }
}));

import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import type { IAnnualWorkplan, IBehaviourWorkplanItem, ICoreWorkplanItem, IPersonalWorkplanItem } from '../models/ProductionModels';
import type { IImpactClassificationConfiguration } from '../services/PersonalWorkplanPolicy';
import PersonalWorkplanPage from './PersonalWorkplanPage';

const configuration: IImpactClassificationConfiguration = {
  strategicPillars: [{ key: 'pillar-synthetic', label: 'Synthetic pillar', source: 'TEST-GOVERNED', sourceReference: 'pillar-v1' }],
  businessContributionAreas: [{ key: 'area-synthetic', label: 'Synthetic area', source: 'TEST-GOVERNED', sourceReference: 'area-v1' }]
};

const workplan = (state: IAnnualWorkplan['state'] = 'Draft'): IAnnualWorkplan => ({
  id: 1, etag: 'header-v1', workplanKey: 'employee|2027', personKey: 'employee', employeeDisplayName: 'Synthetic Employee',
  employeeEmail: 'synthetic@example.invalid', performanceYear: 2027, managerPersonKey: 'manager', managerDisplayName: 'Synthetic Manager',
  managerEmail: 'manager@example.invalid', state, accessState: state === 'Draft' ? 'EmployeeEdit' : 'ReadOnly',
  transitionStatus: state === 'Draft' ? 'Ready' : 'Complete', coreCategoryWeight: 70, personalCategoryWeight: 30,
  behaviourCategoryWeight: 0, rowVersionToken: 1
});

const impact = (index = 1, weight = 100): IPersonalWorkplanItem => ({
  id: index, etag: `impact-v${index}`, workplanItemKey: `impact-${index}`,
  naturalKey: `employee|2027|LocalPersonal|impact-${index}`, workplanKey: 'employee|2027', personKey: 'employee',
  performanceYear: 2027, wording: `Synthetic Impact ${index}`, description: `Synthetic intended outcome ${index}`,
  measure: `Synthetic success evidence ${index}`, measureType: 'Count', scoringDirection: 'HigherIsBetter', unitLabel: 'records',
  yearEndTargetValue: 40, q1TargetValue: 10, q2TargetValue: 20, q3TargetValue: 30, q4TargetValue: 40,
  personalItemWeight: weight, displayOrder: index, activeInWorkplan: true,
  impactClassification: {
    strategicPillar: { ...configuration.strategicPillars[0] },
    businessContributionArea: { ...configuration.businessContributionAreas[0] }
  }
});

describe('BT-02 Annual Workplan slice 03 mounted Impact contract', () => {
  let host: HTMLDivElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    act(() => { ReactDOM.unmountComponentAtNode(host); });
    host.remove();
    jest.clearAllMocks();
  });

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(host.querySelectorAll('button')).find(candidate => candidate.textContent?.trim() === label);
    if (!found) throw new Error(`Missing button: ${label}`);
    return found;
  };

  const field = (label: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
    const found = Array.from(host.querySelectorAll('label')).find(candidate => candidate.textContent?.includes(label))
      ?.control as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | undefined;
    if (!found || (found.tagName !== 'INPUT' && found.tagName !== 'TEXTAREA' && found.tagName !== 'SELECT')) throw new Error(`Missing field: ${label}`);
    return found;
  };

  it('saves, summarizes, reopens and re-edits every annual Impact field without mutating Core or Behaviour sentinels', async () => {
    const original = Object.freeze(impact());
    const core = Object.freeze([{ kpiId: 'CORE-SYNTHETIC', coreWorkplanWeight: 100 }] as unknown as ICoreWorkplanItem[]);
    const behaviours = Object.freeze([{ behaviourId: 'BHV-SYNTHETIC' }] as unknown as IBehaviourWorkplanItem[]);
    let saved: IPersonalWorkplanItem[] = [];
    const onSave = jest.fn(async (items: IPersonalWorkplanItem[]): Promise<void> => { saved = items; });

    act(() => { ReactDOM.render(<PersonalWorkplanPage workplan={workplan()} items={[original]} saving={false}
      classificationConfiguration={configuration} onSave={onSave} />, host); });
    expect(host.textContent).toContain('Core remains the governed strategy section');
    expect(host.textContent).toContain('Synthetic intended outcome 1');
    expect(host.textContent).toContain('Synthetic success evidence 1');
    expect(host.textContent).toContain('Synthetic pillar · Synthetic area');

    act(() => button('Re-edit').click());
    const outcome = field('Intended outcome');
    act(() => { outcome.value = 'Changed synthetic outcome'; Simulate.change(outcome); });
    const help = host.querySelector('[aria-label="Help: Intended outcome"]') as HTMLButtonElement;
    act(() => help.click());
    expect(host.textContent).toContain('Describe the result or change');
    expect(onSave).not.toHaveBeenCalled();
    act(() => button('Close').click());

    await act(async () => { button('Save Draft').click(); await Promise.resolve(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toEqual({ ...original, description: 'Changed synthetic outcome' });
    expect(saved[0]).not.toBe(original);
    expect(saved[0].impactClassification).not.toBe(original.impactClassification);
    expect(core).toEqual([{ kpiId: 'CORE-SYNTHETIC', coreWorkplanWeight: 100 }]);
    expect(behaviours).toEqual([{ behaviourId: 'BHV-SYNTHETIC' }]);
    expect(host.querySelector('[aria-label="Impact KPI 1 summary"]')?.textContent).toContain('Changed synthetic outcome');

    act(() => { ReactDOM.render(<PersonalWorkplanPage workplan={workplan()} items={saved} saving={false}
      classificationConfiguration={configuration} onSave={onSave} />, host); });
    act(() => button('Re-edit').click());
    expect(field('Impact KPI title').value).toBe('Synthetic Impact 1');
    expect(field('Intended outcome').value).toBe('Changed synthetic outcome');
    expect(field('Measure / success criterion').value).toBe('Synthetic success evidence 1');
    expect(field('Unit').value).toBe('records');
    expect(field('Annual Target — number').value).toBe('40');
    expect(field('Q1 Target — number').value).toBe('10');
    expect(field('Q4 Target — number').value).toBe('40');
    expect(field('Strategic Pillar').value).toBe('pillar-synthetic');
    expect(field('Business Contribution Area').value).toBe('area-synthetic');
    expect(field('Impact KPI weight').value).toBe('100');
  });

  it.each([1366, 390])('keeps the mounted edit/save/submit controls reachable at representative %ipx width', async width => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    host.style.width = `${width}px`;
    const onSubmit = jest.fn(async (): Promise<void> => undefined);
    act(() => { ReactDOM.render(<PersonalWorkplanPage workplan={workplan()} items={[impact()]} saving={false}
      classificationConfiguration={configuration} onSave={async () => undefined} onSubmit={onSubmit} />, host); });
    act(() => button('Re-edit').click());
    ['Impact KPI title', 'Intended outcome', 'Measure / success criterion', 'Unit', 'Annual Target — number',
      'Q1 Target — number', 'Q2 Target — number', 'Q3 Target — number', 'Q4 Target — number',
      'Strategic Pillar', 'Business Contribution Area', 'Impact KPI weight'].forEach(label => expect(field(label).disabled).toBe(false));
    expect(button('Save Draft').disabled).toBe(false);
    expect(button('Submit Workplan').disabled).toBe(false);
    await act(async () => { button('Submit Workplan').click(); await Promise.resolve(); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('enforces the five-active boundary and locks all mutations after Submit', () => {
    const five = Array.from({ length: 5 }, (_unused, index) => impact(index + 1, 20));
    const onSave = jest.fn(async (): Promise<void> => undefined);
    const onSubmit = jest.fn(async (): Promise<void> => undefined);
    act(() => { ReactDOM.render(<PersonalWorkplanPage workplan={workplan()} items={five} saving={false}
      classificationConfiguration={configuration} onSave={onSave} onSubmit={onSubmit} />, host); });
    expect(button('Add Impact KPI').disabled).toBe(true);
    expect(host.textContent).toContain('5 / 5');

    act(() => { ReactDOM.render(<PersonalWorkplanPage workplan={workplan('Submitted')} items={five} saving={false}
      classificationConfiguration={configuration} onSave={onSave} onSubmit={onSubmit} />, host); });
    expect(host.textContent).toContain('Submitted Workplan is read-only');
    expect(Array.from(host.querySelectorAll('button')).some(candidate => candidate.textContent === 'Re-edit')).toBe(false);
    expect(Array.from(host.querySelectorAll('button')).some(candidate => candidate.textContent === 'Save Draft')).toBe(false);
    expect(Array.from(host.querySelectorAll('button')).some(candidate => candidate.textContent === 'Submit Workplan')).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
