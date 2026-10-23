import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import type { IQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';
import type { IAnnualWorkplan, ICoreKpiCatalogueItem, IProductionConfig, IProductionPerson } from '../models/ProductionModels';
import QuarterlyReviewPage from './QuarterlyReviewPage';

const employee = { personKey: 'synthetic-employee-key', displayName: 'Alex Example', email: 'alex@example.invalid', active: true } as IProductionPerson;
const manager = { personKey: 'synthetic-manager-key', displayName: 'Morgan Example', email: 'morgan@example.invalid', active: true } as IProductionPerson;
const lifecycle = { performanceYearNumber: 2027, quarterKey: 'Q1', quarterName: 'Q1', status: 'Open', isCurrentQuarter: true, isOpenForProgressUpdates: true } as IQuarterReviewContext['lifecycle'];
const workplan = { workplanKey: 'synthetic-workplan', personKey: employee.personKey, performanceYear: 2027, state: 'Approved', transitionStatus: 'Ready' } as IAnnualWorkplan;
const config = { performanceYearNumber: 2027, rag: { greenThreshold: 90, amberThreshold: 50 } } as IProductionConfig;
const coreCatalogue = [{ kpiId: 'CORE-SYNTHETIC', kpiVersionKey: 'CORE-SYNTHETIC|v1',
  targetVersionKey: 'CORE-SYNTHETIC|target-v1', wording: 'Synthetic delivery', metricType: 'Number',
  scoringDirection: 'HigherIsBetter', unitLabel: 'cases', q1TargetValue: 10 }] as ICoreKpiCatalogueItem[];
const item = (ownerPersonKey?: string): IQuarterReviewItem => ({
  quarterReviewItemKey: 'synthetic-item', quarterReviewKey: 'synthetic-workplan|Q1', workplanKey: workplan.workplanKey, personKey: employee.personKey,
  performanceYear: 2027, quarter: 'Q1', workplanItemKey: 'synthetic-workplan-item', itemType: 'CoreGold', kpiId: coreCatalogue[0].kpiId, kpiVersionKey: coreCatalogue[0].kpiVersionKey, targetVersionKey: coreCatalogue[0].targetVersionKey, quarterTargetValue: 10, quarterEndForecastValue: 10,
  wording: 'Synthetic delivery', calculatedRag: 'Amber', metricType: 'Number', scoringDirection: 'HigherIsBetter',
  evidenceCount: 0, locked: false, employeeActualValue: 2, statusUpdate: 'Recovery planned.',
  recovery: { route: 'Recover', action: 'Complete recovery.', ownerPersonKey, status: 'Active',
    dueDate: '2027-03-01', nextReviewDate: '2027-02-01', expectedReturnToGreenDate: '2027-03-01' }
} as IQuarterReviewItem);
const context = (ownerPersonKey?: string): IQuarterReviewContext => ({
  lifecycle, review: { quarterReviewKey: 'synthetic-workplan|Q1', workplanKey: workplan.workplanKey, personKey: employee.personKey,
    employeeEmail: employee.email, performanceYear: 2027, quarter: 'Q1', state: 'Draft',
    accessState: 'EmployeeEdit', transitionStatus: 'Ready' } as IQuarterReviewContext['review'],
  employee, manager, coreCatalogue, behaviours: [], items: [item(ownerPersonKey)], progressLedgers: [], evidence: [],
  readiness: { ready: false, blockers: [], warnings: [], coreComplete: 0, personalComplete: 0, behavioursComplete: 0 },
  dataFoundationReady: true, messages: []
});

describe('UX-007 Quarterly Recovery owner', () => {
  let host: HTMLDivElement;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); });

  const mount = (reviewContext: IQuarterReviewContext, onSaveItem = jest.fn()): void => {
    act(() => { ReactDOM.render(<QuarterlyReviewPage workplan={workplan} config={config} lifecycles={[reviewContext.lifecycle]}
      selectedQuarter="Q1" context={reviewContext} loading={false} saving={false}
      onSelectQuarter={async () => undefined} onPrepare={async () => undefined} onSaveItem={onSaveItem}
      onAddProgress={async () => undefined} onSubmit={async () => undefined} />, host); });
  };

  it('shows governed names and retains the selected person key through save and readback', () => {
    const save = jest.fn(async () => undefined);
    mount(context(), save);
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Recovery owner"]')!;
    expect(Array.from(select.options).map(option => option.textContent)).toEqual([
      'Select a recovery owner', 'Alex Example (you)', 'Morgan Example (manager)'
    ]);
    act(() => { select.value = manager.personKey; select.dispatchEvent(new Event('change', { bubbles: true })); });
    const saveButton = Array.from(host.querySelectorAll('button')).find(button => button.textContent === 'Save update');
    expect(saveButton).toBeDefined();
    act(() => { saveButton!.click(); });
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ recovery: expect.objectContaining({ ownerPersonKey: manager.personKey }) }));
    mount(context(manager.personKey), save);
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Recovery owner"]')?.selectedOptions[0].textContent).toBe('Morgan Example (manager)');
    expect(host.textContent).not.toMatch(/PersonKey|synthetic-manager-key|synthetic-employee-key/);
  });

  it('keeps the Recovery save disabled when the quarter is finalising', () => {
    const save = jest.fn(async () => undefined);
    mount({ ...context(), lifecycle: { ...lifecycle, status: 'Finalising', isCurrentQuarter: false,
      isOpenForProgressUpdates: false } }, save);
    const saveButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent === 'Save update');
    expect(saveButton?.disabled).toBe(true);
    act(() => { saveButton?.click(); });
    expect(save).not.toHaveBeenCalled();
  });

  it('shows a readable missing-owner blocker without exposing the key', () => {
    mount(context());
    expect(host.textContent).toContain('Select a recovery owner.');
    expect(host.textContent).not.toMatch(/PersonKey|synthetic-employee-key|synthetic-manager-key/);
  });

  it('keeps an unavailable saved key until the employee explicitly chooses a current owner', () => {
    const save = jest.fn(async () => undefined);
    mount(context('synthetic-stale-key'), save);
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="Recovery owner"]')!;
    expect(select.value).toBe('synthetic-stale-key');
    expect(select.selectedOptions[0].textContent).toContain('Previously assigned owner unavailable');
    expect(host.textContent).not.toMatch(/PersonKey|synthetic-stale-key/);
    act(() => { select.value = employee.personKey; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="Recovery owner"]')?.value).toBe(employee.personKey);
  });
});
