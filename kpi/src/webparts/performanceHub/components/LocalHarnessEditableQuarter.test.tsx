jest.mock('./PersonalWorkplanPage', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('./WorkplanStatusPanel', () => ({ __esModule: true, default: () => null }));
jest.mock('./CategoryWeightingPanel', () => ({ __esModule: true, default: () => null }));
jest.mock('./CoreWorkplanPage', () => ({ __esModule: true, default: jest.fn(() => null) }));
jest.mock('./BehaviourWorkplanPage', () => ({ __esModule: true, default: () => null }));
jest.mock('./BehaviourObjectiveLibraryAdminPage', () => ({ __esModule: true, default: () => null }));
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import LocalWorkplanUatHarness from './LocalWorkplanUatHarness';
import PersonalWorkplanPage from './PersonalWorkplanPage';
import CoreWorkplanPage from './CoreWorkplanPage';
import type { ICoreKpiCatalogueItem, ICoreWorkplanItem, IPersonalWorkplanItem } from '../models/ProductionModels';
import type { QuarterKey } from '../models/QuarterlyModels';

const catalogue: ICoreKpiCatalogueItem[] = [{ kpiId: 'CORE-001', kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|t1',
  wording: 'Synthetic Core', pillar: 'Synthetic pillar', workstream: 'Synthetic stream', metricType: 'Count',
  scoringDirection: 'HigherIsBetter', unitLabel: 'outcomes', yearEndTargetValue: 100,
  q1TargetValue: 20, q2TargetValue: 40, q3TargetValue: 60, q4TargetValue: 80 }];
const propsOf = <T,>(component: unknown): T => {
  const calls = (component as jest.Mock).mock.calls;
  if (!calls.length) throw new Error('Synthetic annual child not mounted.');
  return calls[calls.length - 1][0] as T;
};
const button = (root: ParentNode, text: string): HTMLButtonElement => {
  const found = Array.from(root.querySelectorAll('button')).find(node => node.textContent === text);
  if (!found) throw new Error('Missing button ' + text);
  return found;
};
const field = (root: ParentNode, text: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement => {
  const label = Array.from(root.querySelectorAll('label')).find(node => node.querySelector('span')?.textContent === text);
  const found = label?.querySelector('input, textarea, select');
  if (!found) throw new Error('Missing field ' + text);
  return found as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
};
const change = (node: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void => {
  act(() => { node.value = value; Simulate.change(node); });
};
const selectQuarter = async (host: HTMLDivElement, quarter: QuarterKey): Promise<void> => {
  await act(async () => { const node = field(host, 'Quarter'); node.value = quarter; Simulate.change(node); });
};
const itemCard = (host: HTMLDivElement, wording: string): HTMLDetailsElement => {
  const card = Array.from(host.querySelectorAll('details')).find(node => node.querySelector('summary')?.textContent?.includes(wording));
  if (!card) throw new Error('Missing rendered KPI ' + wording);
  return card;
};
const withHarness = async (run: (host: HTMLDivElement) => Promise<void>): Promise<void> => {
  const host = document.createElement('div'); document.body.appendChild(host);
  try {
    act(() => { ReactDOM.render(<LocalWorkplanUatHarness catalogue={catalogue} behaviours={[]} behaviourLibrary={[]} />, host); });
    act(() => { button(host, 'Core KPIs').click(); });
    const core = propsOf<React.ComponentProps<typeof CoreWorkplanPage>>(CoreWorkplanPage);
    const w = core.workplan;
    const coreItem: ICoreWorkplanItem = { id: -41, etag: 'LOCAL-UAT', workplanItemKey: 'core-1',
      naturalKey: w.workplanKey + '|CoreGold|CORE-001', workplanKey: w.workplanKey, personKey: w.personKey,
      performanceYear: w.performanceYear, kpiId: 'CORE-001', kpiVersionKey: 'CORE-001|v1', targetVersionKey: 'CORE-001|t1',
      coreWorkplanWeight: 100, displayOrder: 1, activeInWorkplan: true };
    await act(async () => { await core.onSave([coreItem]); });
    act(() => { button(host, 'Impact KPIs').click(); });
    const impact = propsOf<React.ComponentProps<typeof PersonalWorkplanPage>>(PersonalWorkplanPage);
    const personal: IPersonalWorkplanItem = { id: -11, etag: 'LOCAL-UAT', workplanItemKey: 'personal-1',
      naturalKey: w.workplanKey + '|LocalPersonal|personal-1', workplanKey: w.workplanKey, personKey: w.personKey,
      performanceYear: w.performanceYear, wording: 'Synthetic Impact', description: 'Synthetic outcome', measure: 'Completed',
      measureType: 'Count', scoringDirection: 'HigherIsBetter', unitLabel: 'outcomes', yearEndTargetValue: 100,
      q1TargetValue: 100, q2TargetValue: 100, q3TargetValue: 100, q4TargetValue: 100,
      personalItemWeight: 100, displayOrder: 1, activeInWorkplan: true };
    await act(async () => { await impact.onSave([personal]); });
    act(() => { button(host, 'Quarterly Review').click(); });
    await run(host);
  } finally {
    act(() => { ReactDOM.unmountComponentAtNode(host); }); host.remove(); jest.clearAllMocks();
  }
};

describe('PM128 real local QuarterlyReviewPage editing', () => {
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as QuarterKey[])('edits and saves both streams in explicitly simulated %s', async quarter => {
    await withHarness(async host => {
      await selectQuarter(host, quarter);
      for (const wording of ['Synthetic Core', 'Synthetic Impact']) {
        const card = itemCard(host, wording);
        expect(field(card, 'Current Actual').disabled).toBe(false);
        expect(button(card, 'Save update').disabled).toBe(false);
        const actual = wording === 'Synthetic Core' ? String(20 * Number(quarter.slice(1))) : '100';
        change(field(card, 'Current Actual'), actual);
        change(field(card, 'Quarter-end forecast (number)'), '120');
        change(field(card, 'Status Update / Notes'), 'Recorded ' + quarter + ' ' + wording);
        await act(async () => { button(card, 'Save update').click(); });
        expect(host.textContent).toContain(quarter + ' KPI update saved');
        expect(field(itemCard(host, wording), 'Current Actual').value).toBe(actual);
        expect(field(itemCard(host, wording), 'Quarter-end forecast (number)').value).toBe('120');
        expect(itemCard(host, wording).querySelector('[data-rag]')?.getAttribute('data-rag')).toBe('Green');
      }
    });
  });
  it('retains saved Q1 values and commentary while editing an independent Q2', async () => {
    await withHarness(async host => {
      const card = itemCard(host, 'Synthetic Impact');
      expect(field(card, 'Current Actual').disabled).toBe(false);
      change(field(card, 'Current Actual'), '100'); change(field(card, 'Status Update / Notes'), 'Q1 outcome');
      await act(async () => { button(card, 'Save update').click(); });
      await selectQuarter(host, 'Q2');
      expect(field(itemCard(host, 'Synthetic Impact'), 'Current Actual').value).toBe('');
      await selectQuarter(host, 'Q1');
      expect(field(itemCard(host, 'Synthetic Impact'), 'Current Actual').value).toBe('100');
      expect(field(itemCard(host, 'Synthetic Impact'), 'Status Update / Notes').value).toBe('Q1 outcome');
    });
  });
  it('adds and retains actual rendered Core progress and safe evidence link', async () => {
    await withHarness(async host => {
      const card = itemCard(host, 'Synthetic Core');
      expect(field(card, 'Progress note').disabled).toBe(false);
      const date = card.querySelector('input[type="date"]') as HTMLInputElement;
      act(() => { date.value = '2026-01-10'; Simulate.input(date); });
      change(field(card, 'Progress note'), 'Synthetic Core progress');
      change(field(card, 'Optional evidence link'), 'https://example.invalid/core-evidence');
      expect(button(card, 'Add progress note').disabled).toBe(false);
      await act(async () => { button(card, 'Add progress note').click(); });
      expect(itemCard(host, 'Synthetic Core').textContent).toContain('Synthetic Core progress');
      const link = itemCard(host, 'Synthetic Core').querySelector('a');
      expect(link?.getAttribute('href')).toBe('https://example.invalid/core-evidence');
      await selectQuarter(host, 'Q2'); await selectQuarter(host, 'Q1');
      expect(itemCard(host, 'Synthetic Core').textContent).toContain('Synthetic Core progress');
    });
  });
  it('identifies the selected quarter as a synthetic open-current simulation', async () => {
    await withHarness(async host => {
      expect(host.textContent).toContain('Q1 is simulated as open and current');
      await selectQuarter(host, 'Q4'); expect(host.textContent).toContain('Q4 is simulated as open and current');
      expect(host.textContent).toContain('NO LIVE CHANGES');
    });
  });
});
