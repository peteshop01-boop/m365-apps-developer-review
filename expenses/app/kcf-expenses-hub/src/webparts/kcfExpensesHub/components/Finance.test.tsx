import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { FinanceScreen } from './FinanceScreen';
import type { IDemoStaffClaim, IFinancePageProps } from './PageContracts';
import { nominalMaster } from '../../../data/nominals';

// Actual React interactions with synthetic fixtures. No CSS/viewport/tenant acceptance.
describe('Finance clickable demo safeguards', () => {
  let host: HTMLDivElement;
  let acknowledgement: jest.Mock;
  let props: IFinancePageProps;
  const first = nominalMaster[0]; const second = nominalMaster[1]; const third = nominalMaster[2];
  const amy: IDemoStaffClaim = { id: 'claim-a', employeeName: 'Synthetic Amy', managerName: 'Synthetic lead', month: '2026-10', status: 'Submitted', selfApproval: true, financeAcknowledged: false,
    lines: [{ id: 'amy-expense', kind: 'Expense', dateIso: '2026-10-01', title: 'Synthetic supplies', detail: 'Fictional expense; no receipt body', nominalCode: first.code, amountPence: 1250, version: 1 }, { id: 'amy-mileage', kind: 'Mileage', dateIso: '2026-10-02', title: 'Synthetic journey', detail: 'Manual fictional journey', nominalCode: first.code, amountPence: 450, version: 1 }] };
  const zed: IDemoStaffClaim = { id: 'claim-z', employeeName: 'Synthetic Zed', managerName: 'Synthetic lead', month: '2026-11', status: 'Draft', selfApproval: false, financeAcknowledged: false, lines: [{ ...amy.lines[0], id: 'zed-expense', dateIso: '2026-11-01', amountPence: 100 }] };
  function render(): void { act(() => { ReactDom.render(<FinanceScreen {...props} />, host); }); }
  function control<T extends Element>(selector: string): T { const found = host.querySelector<T>(selector); if (!found) throw new Error(`Missing control ${selector}`); return found; }
  function change(id: string, value: string): void { const item = control<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`#finance-${id}`); act(() => { item.value = value; Simulate.change(item); }); }
  function click(text: string): void { const item = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes(text)); if (!item) throw new Error(`Missing button ${text}`); act(() => { Simulate.click(item); }); }
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); acknowledgement = jest.fn(); props = { claims: [zed, amy], decisions: [], nominals: nominalMaster, idPrefix: 'finance', onFinanceAcknowledgement: acknowledgement }; render(); });
  afterEach(() => { act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); });

  it('sorts synthetic staff, computes three totals and filters Nov–Oct fiscal years', () => {
    const queue = control<HTMLElement>('[aria-label="Alphabetical synthetic staff queue"]');
    expect(queue.querySelector('button[aria-pressed]')?.textContent).toContain('Synthetic Amy');
    expect(queue.textContent).toContain('Expenses £12.50 · Mileage £4.50'); expect(queue.textContent).toContain('Total £17.00');
    change('finance-year', '2026–27'); expect(queue.textContent).toContain('Synthetic Zed'); expect(queue.textContent).not.toContain('Synthetic Amy');
    change('finance-month', '2026-10'); expect(queue.textContent).toContain('No synthetic claims match');
  });
  it('pages every staff record and resets paging when filters change', () => {
    props = { ...props, claims: Array.from({ length: 24 }, (_, i) => ({ ...amy, id: 'paged-' + i, employeeName: 'Synthetic ' + String(i).padStart(2, '0') })) }; render();
    const seen: string[] = [];
    for (let page = 0; page < 6; page++) {
      const cards = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'));
      expect(cards).toHaveLength(4);
      seen.push(...cards.map(card => card.querySelector('strong')?.textContent || ''));
      if (page < 5) click('Next staff');
    }
    expect(new Set(seen).size).toBe(24);
    change('finance-search', 'Synthetic 00');
    expect(host.querySelectorAll('button[aria-pressed]')).toHaveLength(1);
    expect(host.textContent).toContain('Page 1 of 1');
  });
  it('shows all 195 nominal choices and LT search without a Category input', () => {
    expect(control<HTMLSelectElement>('#finance-finance-nominal').options).toHaveLength(196);
    change('finance-nominal-search', 'LT'); expect(control<HTMLSelectElement>('#finance-finance-nominal').textContent).toContain('40600');
    expect(Array.from(host.querySelectorAll('label')).some(label => label.textContent?.includes('Category'))).toBe(false);
  });
  it('rejects invalid references, same reference and blank correction reason without audit', () => {
    change('finance-nominal', 'invalid-code'); change('finance-reason', 'A reason'); click('Record demo correction');
    expect(host.textContent).toContain('No change applied'); expect(host.textContent).toContain('Local nominal audit (0)');
    change('finance-nominal', first.code); click('Record demo correction'); expect(host.textContent).toContain('Local nominal audit (0)');
    change('finance-nominal', second.code); change('finance-reason', '   '); click('Record demo correction'); expect(host.textContent).toContain('Local nominal audit (0)');
  });
  it('retains old/new code and names, reason and synthetic actor through successive local corrections', () => {
    change('finance-nominal', second.code); change('finance-reason', 'First synthetic correction'); click('Record demo correction');
    change('finance-nominal', third.code); change('finance-reason', 'Second synthetic correction'); click('Record demo correction');
    expect(host.textContent).toContain('Local nominal audit (2)');
    expect(host.textContent).toContain(`${first.code} — ${first.description} → ${second.code} — ${second.description}`);
    expect(host.textContent).toContain(`${second.code} — ${second.description} → ${third.code} — ${third.description}`);
    expect(host.textContent).toContain('Synthetic Finance actor'); expect(host.textContent).toContain('Second synthetic correction');
    change('finance-line', 'amy-mileage'); expect(host.textContent).toContain('Local nominal audit (0)');
    change('finance-line', 'amy-expense'); expect(host.textContent).toContain('Local nominal audit (2)');
    expect(amy.lines[0].nominalCode).toBe(first.code); expect(amy.lines[0].amountPence).toBe(1250);
  });
  it('requires a written exception reason and never treats caller-visible acceptance as authority', () => {
    click('Accept exception in demo'); expect(acknowledgement).not.toHaveBeenCalled(); expect(host.textContent).toContain('Enter a written Finance exception reason');
    change('finance-exception-reason', 'Synthetic recorded exception'); click('Accept exception in demo'); expect(acknowledgement).toHaveBeenCalledWith('claim-a', true);
    expect(host.textContent).toContain('No approval, authority or payment is created');
    change('finance-exception-reason', 'Synthetic withdrawal'); click('Withdraw demo acceptance'); expect(acknowledgement).toHaveBeenLastCalledWith('claim-a', false);
  });
  it('blocks pending/query lines and self-approval without Finance acceptance in the illustrative payroll preview', () => {
    click('Payroll preview'); expect(host.querySelectorAll('thead th')).toHaveLength(16); expect(host.textContent).toContain('ILLUSTRATIVE HEADER CONTRACT'); expect(host.textContent).toContain('Blocked: pending or queried lines');
    props = { ...props, decisions: amy.lines.map(line => ({ lineId: line.id, version: line.version, status: 'Approved' as const, reason: '', actor: 'Synthetic manager' as const, at: '2026-10-13T00:00:00Z' })) }; render();
    expect(control<HTMLElement>('[aria-label="Synthetic Finance claim detail"]').textContent).toContain('Blocked: Finance exception acceptance');
    props = { ...props, claims: [zed, { ...amy, financeAcknowledged: true }] }; render(); expect(host.textContent).toContain('Demo checks complete; export unavailable');
    props = { ...props, decisions: props.decisions.map((decision, index) => index === 0 ? { ...decision, status: 'Queried' as const, reason: 'Synthetic query' } : decision) }; render();
    expect(control<HTMLElement>('[aria-label="Synthetic Finance claim detail"]').textContent).toContain('Blocked: pending or queried lines');
  });
  it('offers receipt limitation and chaser text without download, sending or persistence affordances', () => {
    click('Preview chaser text'); expect(host.textContent).toContain('TEXT PREVIEW ONLY'); expect(host.textContent).toContain('Receipt metadata and bodies are not provided');
    expect(host.textContent).toContain('DEMO / UNSAVED — NO SHAREPOINT SAVE'); expect(host.querySelector('a[download]')).toBeNull();
  });
});
