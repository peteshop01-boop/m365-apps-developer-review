jest.mock('./QuarterlyReviewPage', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('./PersonalWorkplanPage', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('./WorkplanStatusPanel', () => ({ __esModule: true, default: () => null }));
jest.mock('./CategoryWeightingPanel', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('./CoreWorkplanPage', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('./BehaviourWorkplanPage', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('./BehaviourObjectiveLibraryAdminPage', () => ({ __esModule: true, default: jest.fn(() => null) }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import LocalWorkplanUatHarness from './LocalWorkplanUatHarness';
import QuarterlyReviewPage, { type IQuarterlyReviewPageProps } from './QuarterlyReviewPage';
import PersonalWorkplanPage, { type IPersonalWorkplanPageProps } from './PersonalWorkplanPage';
import CategoryWeightingPanel from './CategoryWeightingPanel';
import CoreWorkplanPage from './CoreWorkplanPage';
import BehaviourWorkplanPage from './BehaviourWorkplanPage';
import BehaviourObjectiveLibraryAdminPage from './BehaviourObjectiveLibraryAdminPage';
import type { ICoreKpiCatalogueItem, ICoreWorkplanItem, IPersonalWorkplanItem, IProductionPerson } from '../models/ProductionModels';
import type { IProgressEntry, IQuarterReviewContext, IQuarterReviewItem } from '../models/QuarterlyModels';

const quarterProps = (): IQuarterlyReviewPageProps => {
  const calls = (QuarterlyReviewPage as jest.Mock).mock.calls;
  if (!calls.length) throw new Error('Quarter route not mounted.');
  return calls[calls.length - 1][0] as IQuarterlyReviewPageProps;
};
const personalProps = (): IPersonalWorkplanPageProps => {
  const calls = (PersonalWorkplanPage as jest.Mock).mock.calls;
  if (!calls.length) throw new Error('Personal route not mounted.');
  return calls[calls.length - 1][0] as IPersonalWorkplanPageProps;
};
const currentContext = (): IQuarterReviewContext & { manager: IProductionPerson } => {
  const context = quarterProps().context;
  if (!context || !context.manager) throw new Error('Expected prepared synthetic context and manager.');
  return context as IQuarterReviewContext & { manager: IProductionPerson };
};
const lastChildProps = <T,>(component: unknown): T => {
  const calls = (component as jest.Mock).mock.calls;
  if (!calls.length) throw new Error('Expected mounted local child.');
  return calls[calls.length - 1][0] as T;
};
const navigate = (host: HTMLDivElement, label: string): void => {
  const button = Array.from(host.querySelectorAll('button')).find(row => row.textContent === label);
  if (!button) throw new Error('Missing navigation ' + label);
  act(() => { button.click(); });
};
const rerenderParticipants = (host: HTMLDivElement, employee?: IProductionPerson, manager?: IProductionPerson): void => {
  act(() => { ReactDOM.render(<LocalWorkplanUatHarness catalogue={[]} behaviours={[]} behaviourLibrary={[]}
    employee={employee} manager={manager} />, host); });
};
const definition = (index: number, target = 100): IPersonalWorkplanItem => {
  const workplan = personalProps().workplan;
  return { id: -10 - index, etag: 'LOCAL-UAT', workplanItemKey: 'personal-' + index,
    naturalKey: workplan.workplanKey + '|LocalPersonal|personal-' + index, workplanKey: workplan.workplanKey,
    personKey: workplan.personKey, performanceYear: workplan.performanceYear, wording: 'Synthetic KPI ' + index,
    description: 'Controlled browser-memory definition', measure: 'Completed outcomes', measureType: 'Count',
    scoringDirection: 'HigherIsBetter', unitLabel: 'outcomes', yearEndTargetValue: target,
    q1TargetValue: target, q2TargetValue: target, q3TargetValue: target, q4TargetValue: target,
    personalItemWeight: 50, displayOrder: index, activeInWorkplan: true };
};
const incoming = (item: IQuarterReviewItem): IQuarterReviewItem => ({ ...item, employeeActualValue: 100, statusUpdate: 'Synthetic complete Actual' });
const progress = (context: IQuarterReviewContext, day: string): IProgressEntry => {
  const item = context.items[0];
  return { entryKey: item.quarterReviewItemKey + '|' + day, quarterReviewKey: item.quarterReviewKey,
    quarterReviewItemKey: item.quarterReviewItemKey, quarter: item.quarter, date: day, note: 'Synthetic note ' + day,
    actorPersonKey: context.employee.personKey, actorEmail: context.employee.email, updatedAt: day + 'T09:00:00Z',
    evidenceLink: 'https://example.invalid/evidence/' + day };
};
const withHarness = async (assertions: (host: HTMLDivElement) => Promise<void>): Promise<void> => {
  const host = document.createElement('div'); document.body.appendChild(host);
  try {
    act(() => { ReactDOM.render(<LocalWorkplanUatHarness catalogue={[]} behaviours={[]} behaviourLibrary={[]} />, host); });
    navigate(host, 'Impact KPIs');
    await act(async () => { await personalProps().onSave([definition(1), definition(2)]); });
    navigate(host, 'Quarterly Review');
    await assertions(host);
  } finally {
    act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks();
  }
};

const coreCatalogue = (): ICoreKpiCatalogueItem[] => [{ kpiId: 'CORE-001', kpiVersionKey: 'CORE-001|v1',
  targetVersionKey: 'CORE-001|t1', wording: 'Synthetic Core', pillar: 'Synthetic pillar', workstream: 'Synthetic stream',
  metricType: 'Count', scoringDirection: 'HigherIsBetter', unitLabel: 'outcomes', yearEndTargetValue: 100,
  q1TargetValue: 20, q2TargetValue: 40, q3TargetValue: 60, q4TargetValue: 80 }];
const renderCoreCatalogue = (host: HTMLDivElement): void => {
  act(() => { ReactDOM.render(<LocalWorkplanUatHarness catalogue={coreCatalogue()} behaviours={[]} behaviourLibrary={[]} />, host); });
};
const coreProps = (): React.ComponentProps<typeof CoreWorkplanPage> => lastChildProps(CoreWorkplanPage);
const coreRow = (): ICoreWorkplanItem => {
  const workplan = coreProps().workplan;
  return { id: -41, etag: 'LOCAL-UAT', workplanItemKey: 'core-1', naturalKey: workplan.workplanKey + '|CoreGold|CORE-001',
    workplanKey: workplan.workplanKey, personKey: workplan.personKey, performanceYear: workplan.performanceYear,
    kpiId: 'CORE-001', kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|t1', coreWorkplanWeight: 100,
    displayOrder: 1, activeInWorkplan: true };
};
const currentCoreItem = (): IQuarterReviewItem => {
  const item = currentContext().items.find(row => row.itemType === 'CoreGold');
  if (!item) throw new Error('Expected captured Core quarter item.');
  return item;
};
const addCoreSource = async (host: HTMLDivElement): Promise<void> => {
  renderCoreCatalogue(host); navigate(host, 'Core KPIs');
  await act(async () => { await coreProps().onSave([coreRow()]); });
  navigate(host, 'Quarterly Review');
};

describe('PM128 actual local Core and Impact quarter integration', () => {
  it('retains attributed Core evidence when saving its Actual', async () => {
    await withHarness(async host => {
      await addCoreSource(host); const context = currentContext(); const item = currentCoreItem(); const props = quarterProps();
      await act(async () => { await props.onAddProgress(item, progress(context, '2026-01-10'));
        await props.onSaveItem({ ...item, employeeActualValue: 20, statusUpdate: 'Recorded Core result' }); });
      expect(currentCoreItem().evidenceCount).toBe(1);
      expect(currentContext().evidence[0].kpiId).toBe('CORE-001');
      expect(currentContext().progressLedgers[0].kpiId).toBe('CORE-001');
      expect(currentCoreItem().calculatedRag).toBe('Green');
    });
  });
  it.each(['core-first', 'impact-first'])('composes queued annual stream setup %s', async order => {
    await withHarness(async host => {
      renderCoreCatalogue(host); navigate(host, 'Core KPIs'); const core = coreProps(); const row = coreRow();
      navigate(host, 'Impact KPIs'); const impact = personalProps();
      const changed = impact.items.map(item => ({ ...item, q1TargetValue: 200 }));
      await act(async () => {
        if (order === 'core-first') { await core.onSave([row]); await impact.onSave(changed); }
        else { await impact.onSave(changed); await core.onSave([row]); }
      });
      navigate(host, 'Quarterly Review');
      expect(currentCoreItem().quarterTargetValue).toBe(20);
      expect(currentContext().items.filter(item => item.itemType === 'LocalPersonal').map(item => item.quarterTargetValue)).toEqual([200, 200]);
    });
  });
  it('rejects obsolete quarter callbacks after Core source setup', async () => {
    await withHarness(async host => {
      const previous = quarterProps(); const context = currentContext();
      await addCoreSource(host); const current = currentContext();
      await act(async () => { await expect(previous.onSaveItem(incoming(context.items[0]))).rejects.toThrow(/changed/); });
      expect(currentContext()).toBe(current);
    });
  });
  it.each([['Q1', 20], ['Q2', 40], ['Q3', 60], ['Q4', 80]] as const)('shows %s captured Core target %s alongside Impact', async (quarter, target) => {
    await withHarness(async host => {
      await addCoreSource(host);
      await act(async () => { await quarterProps().onSelectQuarter(quarter); });
      expect(currentCoreItem().quarterTargetValue).toBe(target);
      expect(currentContext().items.filter(row => row.itemType === 'LocalPersonal')).toHaveLength(2);
    });
  });
  it('saves Core Actual and Forecast while retaining Impact and evidence', async () => {
    await withHarness(async host => {
      await addCoreSource(host); const context = currentContext(); const core = currentCoreItem(); const props = quarterProps();
      const impact = context.items.find(row => row.itemType === 'LocalPersonal');
      if (!impact) throw new Error('Expected Impact item.');
      await act(async () => { await props.onSaveItem(incoming(impact)); await props.onSaveItem({ ...core,
        employeeActualValue: 20, quarterEndForecastValue: 30, statusUpdate: 'Synthetic Core result' }); });
      expect(currentCoreItem()).toEqual(expect.objectContaining({ progressPct: 100, calculatedRag: 'Green', quarterEndForecastValue: 30 }));
      expect(currentContext().items.find(row => row.quarterReviewItemKey === impact.quarterReviewItemKey)?.employeeActualValue).toBe(100);
    });
  });
  it('preserves Core quarter work on identical annual Core Save', async () => {
    await withHarness(async host => {
      await addCoreSource(host); const item = currentCoreItem();
      await act(async () => { await quarterProps().onSaveItem({ ...item, employeeActualValue: 20, statusUpdate: 'Recorded Core' }); });
      const saved = currentContext(); navigate(host, 'Core KPIs');
      await act(async () => { await coreProps().onSave(coreProps().items.map(row => ({ ...row }))); });
      navigate(host, 'Quarterly Review'); expect(currentContext()).toBe(saved);
    });
  });
  it('withholds destructive Core assignment change after Impact work', async () => {
    await withHarness(async host => {
      renderCoreCatalogue(host); const original = currentContext();
      await act(async () => { await quarterProps().onSaveItem(incoming(original.items[0])); });
      const saved = currentContext(); navigate(host, 'Core KPIs'); let rejected = false;
      await act(async () => { await coreProps().onSave([coreRow()]).catch(() => { rejected = true; }); });
      expect(rejected).toBe(true); expect(coreProps().items).toEqual([]);
      navigate(host, 'Quarterly Review'); expect(currentContext()).toBe(saved);
    });
  });
  it('preserves Core inputs when changing empty Impact setup', async () => {
    await withHarness(async host => {
      await addCoreSource(host); navigate(host, 'Impact KPIs');
      await act(async () => { await personalProps().onSave(personalProps().items.map(row => ({ ...row, q1TargetValue: 200 }))); });
      navigate(host, 'Quarterly Review'); expect(currentCoreItem().quarterTargetValue).toBe(20);
      expect(currentContext().items.filter(row => row.itemType === 'LocalPersonal').map(row => row.quarterTargetValue)).toEqual([200, 200]);
    });
  });
  it('rejects invalid Core versions atomically', async () => {
    await withHarness(async host => {
      renderCoreCatalogue(host); const existing = currentContext(); navigate(host, 'Core KPIs');
      await act(async () => { await expect(coreProps().onSave([{ ...coreRow(), targetVersionKey: 'wrong' }])).rejects.toThrow(/version/); });
      expect(coreProps().items).toEqual([]); navigate(host, 'Quarterly Review'); expect(currentContext()).toBe(existing);
    });
  });
});

describe('PM128 real local harness quarter callback composition', () => {
  it.each(['core', 'behaviour', 'category-save', 'category-change', 'category-reason', 'category-approval',
    'library', 'prepare', 'submit', 'select'])('withholds retained %s route for changed participants', async route => {
    await withHarness(async host => {
      const quarterly = quarterProps(); const context = currentContext();
      let mutation: () => void | Promise<void>;
      if (route === 'core') {
        navigate(host, 'Core KPIs');
        const props = lastChildProps<React.ComponentProps<typeof CoreWorkplanPage>>(CoreWorkplanPage);
        mutation = () => props.onSave([]);
      } else if (route === 'behaviour') {
        navigate(host, 'Behaviours');
        const props = lastChildProps<React.ComponentProps<typeof BehaviourWorkplanPage>>(BehaviourWorkplanPage);
        mutation = () => props.onSave([]);
      } else if (route === 'library') {
        navigate(host, 'Admin library');
        const props = lastChildProps<React.ComponentProps<typeof BehaviourObjectiveLibraryAdminPage>>(BehaviourObjectiveLibraryAdminPage);
        const onChange = props.onChange;
        if (!onChange) throw new Error('Expected local library mutation callback.');
        mutation = () => onChange([]);
      } else if (route.indexOf('category-') === 0) {
        navigate(host, 'UAT Overview');
        const props = lastChildProps<React.ComponentProps<typeof CategoryWeightingPanel>>(CategoryWeightingPanel);
        const { onSave, onChange, onReasonChange, onApprovalChange } = props;
        if (!onSave || !onChange || !onReasonChange || !onApprovalChange) throw new Error('Expected all supplied local weighting callbacks.');
        mutation = route === 'category-save' ? () => onSave() : route === 'category-change'
          ? () => onChange({ core: 70, personal: 20, behaviours: 10 }) : route === 'category-reason'
            ? () => onReasonChange('Changed') : () => onApprovalChange(true);
      } else mutation = route === 'prepare' ? () => quarterly.onPrepare() : route === 'submit'
        ? () => quarterly.onSubmit() : () => quarterly.onSelectQuarter('Q2');
      rerenderParticipants(host, { ...context.employee, personKey: 'other' }, context.manager);
      let rejected = false;
      await act(async () => { try { await mutation(); } catch { rejected = true; } });
      expect(rejected).toBe(true);
      rerenderParticipants(host);
      navigate(host, 'Quarterly Review');
      expect(currentContext()).toBe(context);
    });
  });
  it.each(['employee-person', 'employee-email', 'employee-active', 'employee-manager', 'employee-role',
    'manager-person', 'manager-email', 'manager-active', 'manager-role'])('suspends display and retained callbacks for %s change', async boundary => {
    await withHarness(async host => {
      const prior = quarterProps(); const context = currentContext();
      await act(async () => { await prior.onSaveItem(incoming(context.items[0])); });
      const saved = currentContext(); const employee = { ...context.employee }; const manager = { ...context.manager };
      if (boundary === 'employee-person') employee.personKey = 'other-person';
      if (boundary === 'employee-email') employee.email = 'other@example.invalid';
      if (boundary === 'employee-active') employee.active = false;
      if (boundary === 'employee-manager') employee.managerPersonKey = 'other-manager';
      if (boundary === 'employee-role') employee.appRoles = ['Employee', 'Admin'];
      if (boundary === 'manager-person') manager.personKey = 'other-manager';
      if (boundary === 'manager-email') manager.email = 'other-manager@example.invalid';
      if (boundary === 'manager-active') manager.active = false;
      if (boundary === 'manager-role') manager.appRoles = ['Manager', 'Admin'];
      rerenderParticipants(host, employee, manager);
      expect(host.querySelector('nav')).toBeNull();
      expect(host.textContent).toContain('participants changed');
      let rejected = false;
      await act(async () => { await prior.onSaveItem(incoming(context.items[1])).catch(() => { rejected = true; }); });
      expect(rejected).toBe(true);
      rerenderParticipants(host);
      expect(currentContext()).toBe(saved);
    });
  });
  it.each(['save', 'progress', 'annual'])('rejects retained %s mutation after participant replacement', async route => {
    await withHarness(async host => {
      const previous = quarterProps(); const context = currentContext();
      navigate(host, 'Impact KPIs'); const annual = personalProps(); navigate(host, 'Quarterly Review');
      rerenderParticipants(host, { ...context.employee, personKey: 'other', email: 'other@example.invalid' }, context.manager);
      let rejected = false;
      await act(async () => {
        const mutation = route === 'annual' ? annual.onSave(annual.items)
          : route === 'save' ? previous.onSaveItem(incoming(context.items[0]))
          : previous.onAddProgress(context.items[0], progress(context, '2026-01-10'));
        await mutation.catch(() => { rejected = true; });
      });
      expect(rejected).toBe(true);
      rerenderParticipants(host);
      expect(currentContext()).toBe(context);
    });
  });
  it('preserves same-binding metadata and email-case refreshes', async () => {
    await withHarness(async host => {
      const previous = quarterProps(); const context = currentContext();
      rerenderParticipants(host, { ...context.employee, displayName: 'Updated display name', email: context.employee.email.toUpperCase() },
        { ...context.manager, displayName: 'Updated manager name', email: context.manager.email.toUpperCase() });
      expect(host.querySelector('nav')).not.toBeNull();
      expect(currentContext()).toBe(context);
      await act(async () => { await previous.onSaveItem(incoming(context.items[0])); });
      expect(currentContext().items[0].employeeActualValue).toBe(100);
    });
  });
  it('rejects nonfinite annual source without changing definitions or contexts', async () => {
    await withHarness(async host => {
      const existing = currentContext(); navigate(host, 'Impact KPIs');
      const original = personalProps().items;
      await act(async () => { await expect(personalProps().onSave(original.map(item => ({ ...item, q1TargetValue: NaN }))))
        .rejects.toThrow(/finite/); });
      expect(personalProps().items).toBe(original);
      navigate(host, 'Quarterly Review'); expect(currentContext()).toBe(existing);
    });
  });
  it('withholds definition changes when recorded work belongs to a different quarter', async () => {
    await withHarness(async host => {
      await act(async () => { await quarterProps().onSelectQuarter('Q4'); });
      await act(async () => { await quarterProps().onSaveItem(incoming(currentContext().items[0])); });
      const fourth = currentContext();
      await act(async () => { await quarterProps().onSelectQuarter('Q1'); });
      navigate(host, 'Impact KPIs');
      await act(async () => { await expect(personalProps().onSave(personalProps().items.map(item => ({ ...item, q1TargetValue: 200 }))))
        .rejects.toThrow(/preserved/); });
      navigate(host, 'Quarterly Review');
      await act(async () => { await quarterProps().onSelectQuarter('Q4'); });
      expect(currentContext()).toBe(fourth);
    });
  });
  it.each(['actual', 'progress', 'both'])('retains %s quarter work after unchanged annual Save', async mode => {
    await withHarness(async host => {
      const props = quarterProps(); const context = currentContext();
      await act(async () => {
        if (mode !== 'progress') await props.onSaveItem(incoming(context.items[0]));
        if (mode !== 'actual') await props.onAddProgress(context.items[0], progress(context, '2026-01-10'));
      });
      const savedQuarter = currentContext();
      navigate(host, 'Impact KPIs');
      await act(async () => { await personalProps().onSave(personalProps().items.map(item => ({ ...item }))); });
      navigate(host, 'Quarterly Review');
      expect(currentContext()).toBe(savedQuarter);
      expect(currentContext().items).toBe(savedQuarter.items);
      expect(currentContext().progressLedgers).toBe(savedQuarter.progressLedgers);
      expect(currentContext().evidence).toBe(savedQuarter.evidence);
    });
  });
  it('keeps a retained quarter callback valid across unchanged annual Save', async () => {
    await withHarness(async host => {
      const previous = quarterProps(); const context = currentContext();
      navigate(host, 'Impact KPIs');
      await act(async () => { await personalProps().onSave(personalProps().items); });
      navigate(host, 'Quarterly Review');
      await act(async () => { await previous.onSaveItem(incoming(context.items[0])); });
      expect(currentContext().items[0].employeeActualValue).toBe(100);
    });
  });
  it.each(['actual', 'progress', 'notes', 'forecast', 'zero'])('withholds destructive annual refresh with existing %s', async mode => {
    await withHarness(async host => {
      const props = quarterProps(); const context = currentContext(); const item = context.items[0];
      await act(async () => {
        if (mode === 'progress') await props.onAddProgress(item, progress(context, '2026-01-10'));
        else await props.onSaveItem({ ...item, statusUpdate: 'Recorded quarter work',
          employeeActualValue: mode === 'actual' ? 100 : mode === 'zero' ? 0 : undefined,
          quarterEndForecastValue: mode === 'forecast' ? 100 : undefined,
          recovery: mode === 'zero' ? { route: 'Recover', action: 'Controlled recovery', ownerPersonKey: context.employee.personKey,
            dueDate: '2026-01-20', nextReviewDate: '2026-01-15', status: 'Active', expectedReturnToGreenDate: '2026-01-25' } : undefined });
      });
      const savedQuarter = currentContext();
      navigate(host, 'Impact KPIs'); const originalDefinitions = personalProps().items;
      let rejected = false;
      await act(async () => { await personalProps().onSave(originalDefinitions.map(row => ({ ...row, q1TargetValue: 200 })))
        .catch(() => { rejected = true; }); });
      expect(rejected).toBe(true);
      expect(personalProps().items).toBe(originalDefinitions);
      navigate(host, 'Quarterly Review');
      expect(currentContext()).toBe(savedQuarter);
    });
  });
  it('preserves all quarter contexts on an unchanged annual Save', async () => {
    await withHarness(async host => {
      const saved: IQuarterReviewContext[] = [];
      for (const quarter of ['Q1', 'Q2', 'Q3', 'Q4'] as const) {
        await act(async () => { await quarterProps().onSelectQuarter(quarter); });
        await act(async () => { await quarterProps().onSaveItem(incoming(currentContext().items[0])); });
        saved.push(currentContext());
      }
      navigate(host, 'Impact KPIs');
      await act(async () => { await personalProps().onSave(personalProps().items); });
      navigate(host, 'Quarterly Review');
      for (let index = 0; index < saved.length; index += 1) {
        const quarter = saved[index].lifecycle.quarterKey;
        await act(async () => { await quarterProps().onSelectQuarter(quarter); });
        expect(currentContext()).toBe(saved[index]);
      }
    });
  });
  it.each(['save', 'progress'])('returns %s validation failure without replacing the last good context', async route => {
    await withHarness(async () => {
      const props = quarterProps(); const context = currentContext();
      await act(async () => { await props.onSaveItem(incoming(context.items[0])); });
      const lastGood = currentContext(); let rejected = false;
      await act(async () => {
        const attempted = route === 'save' ? props.onSaveItem({ ...incoming(context.items[1]), employeeActualValue: NaN })
          : props.onAddProgress(context.items[0], { ...progress(context, '2026-01-10'), note: '' });
        await attempted.catch(() => { rejected = true; });
      });
      expect(rejected).toBe(true);
      expect(currentContext()).toBe(lastGood);
      await act(async () => { await props.onSaveItem(incoming(context.items[1])); });
      expect(currentContext().items.map(item => item.employeeActualValue)).toEqual([100, 100]);
    });
  });
  it.each(['save', 'progress'])('rejects retained %s callbacks after unmount', async route => {
    let previous: IQuarterlyReviewPageProps | undefined;
    let context: IQuarterReviewContext | undefined;
    await withHarness(async () => { previous = quarterProps(); context = currentContext(); });
    if (!previous || !context) throw new Error('Expected captured context.');
    await expect(route === 'save' ? previous.onSaveItem(incoming(context.items[0]))
      : previous.onAddProgress(context.items[0], progress(context, '2026-01-10'))).rejects.toThrow();
  });
  it('retains both item saves queued from one rendered context', async () => {
    await withHarness(async () => {
      const props = quarterProps(); const context = currentContext();
      await act(async () => { await Promise.all(context.items.map(item => props.onSaveItem(incoming(item)))); });
      expect(currentContext().items.map(item => item.employeeActualValue)).toEqual([100, 100]);
    });
  });
  it('retains two distinct progress dates queued from one rendered context', async () => {
    await withHarness(async () => {
      const props = quarterProps(); const context = currentContext();
      await act(async () => { await Promise.all(['2026-01-10', '2026-01-11'].map(day => props.onAddProgress(context.items[0], progress(context, day)))); });
      expect(currentContext().progressLedgers[0].entries.map(entry => entry.date)).toEqual(['2026-01-10', '2026-01-11']);
      expect(currentContext().evidence).toHaveLength(2);
    });
  });
  it.each(['save-first', 'progress-first'])('composes mixed updates %s', order => {
    return withHarness(async () => {
      const props = quarterProps(); const context = currentContext(); const item = context.items[0];
      await act(async () => {
        if (order === 'save-first') { await props.onSaveItem(incoming(item)); await props.onAddProgress(item, progress(context, '2026-01-10')); }
        else { await props.onAddProgress(item, progress(context, '2026-01-10')); await props.onSaveItem(incoming(item)); }
      });
      expect(currentContext().items[0].employeeActualValue).toBe(100);
      expect(currentContext().items[0].evidenceCount).toBe(1);
      expect(currentContext().progressLedgers[0].entries).toHaveLength(1);
    });
  });
  it.each(['save', 'progress'])('rejects obsolete %s callbacks after annual definitions refresh', route => {
    return withHarness(async host => {
      const previous = quarterProps(); const context = currentContext();
      navigate(host, 'Impact KPIs');
      await act(async () => { await personalProps().onSave([definition(1, 200), definition(2, 200)]); });
      navigate(host, 'Quarterly Review');
      let rejected = false;
      await act(async () => {
        await (route === 'save' ? previous.onSaveItem(incoming(context.items[0]))
          : previous.onAddProgress(context.items[0], progress(context, '2026-01-10'))).catch(() => { rejected = true; });
      });
      expect(rejected).toBe(true);
      expect(currentContext().items[0].quarterTargetValue).toBe(200);
      expect(currentContext().items[0].employeeActualValue).toBeUndefined();
      expect(currentContext().progressLedgers).toEqual([]);
    });
  });
  it('preserves a completed other-quarter context across another update', async () => {
    await withHarness(async () => {
      const first = quarterProps(); const context = currentContext();
      await act(async () => { await first.onSaveItem(incoming(context.items[0])); });
      const firstSaved = currentContext();
      await act(async () => { await quarterProps().onSelectQuarter('Q2'); });
      const second = quarterProps();
      await act(async () => { await second.onSaveItem(incoming(currentContext().items[1])); });
      await act(async () => { await quarterProps().onSelectQuarter('Q1'); });
      expect(currentContext()).toBe(firstSaved);
    });
  });
  it('allows a valid callback after a metadata-only render', async () => {
    await withHarness(async host => {
      const earlier = quarterProps(); const context = currentContext();
      navigate(host, 'UAT Overview'); navigate(host, 'Quarterly Review');
      await act(async () => { await earlier.onSaveItem(incoming(context.items[0])); });
      expect(currentContext().items[0].employeeActualValue).toBe(100);
    });
  });
});
