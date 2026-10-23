import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { HomeScreen } from './HomeScreen';
import { ReviewClaimScreen } from './ReviewClaimScreen';
import type { ICurrentClaim, IExpenseLine } from '../../../domain/contracts';
import type { IMileageLine } from '../../../domain/mileage';

// Native React control evidence only. The Heft rig mocks CSS; these tests
// do not certify desktop/physical-phone rendering or SharePoint persistence.
describe('Home and Review Claim synthetic controls', () => {
  let host: HTMLDivElement;
  function renderPage(page: React.ReactElement): void { ReactDom.render(page, host); }
  const claim: ICurrentClaim = { id: 'synthetic-month', month: '2026-10', status: 'Draft', ownerId: 'synthetic-owner', mileageTotalPence: 0 };
  function element<T extends Element>(selector: string): T {
    const result = host.querySelector<T>(selector);
    if (!result) throw new Error(`Missing Lane A control: ${selector}`);
    return result;
  }
  function click(text: string): void {
    const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.includes(text));
    if (!button) throw new Error(`Missing Lane A button: ${text}`);
    act(() => { Simulate.click(button); });
  }
  function change(selector: string, value: string): void {
    const control = element<HTMLSelectElement>(selector);
    act(() => { control.value = value; Simulate.change(control); });
  }
  function expense(id: string, dateIso: string, receipt: IExpenseLine['receipt'], sequence: number): IExpenseLine {
    return { id, dateIso, receipt, sequence, claimId: claim.id, nominalCode: '20600', nominalDescription: 'Approved nominal description', supplier: `Synthetic seller ${id}`, description: 'Synthetic expense', amountPence: 1234, notes: 'Fictional notes', version: 1 };
  }
  function journey(id: string, dateIso: string, sequence: number): IMileageLine {
    return { id, dateIso, sequence, claimId: claim.id, nominalCode: '20600', nominalDescription: 'Approved travel description', date: '01-10-2026', programme: 'CTS Schools', from: 'Synthetic start', to: 'Synthetic destination', returnJourney: true, outwardMiles: '3.25', returnMiles: '3.75', purpose: 'Synthetic visit', payableMiles: 7, ratePence: 45, amountPence: 315, version: 1 };
  }
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); });

  it('routes all three primary Home actions and uses passed current totals/status', () => {
    const navigate = jest.fn();
    act(() => { renderPage(<HomeScreen claim={claim} expenses={1234} mileage={315} idPrefix="lane-a" navigate={navigate} />); });
    const summary = element<HTMLElement>('[aria-label="Current demo claim totals"]');
    expect(summary.textContent).toContain('£12.34'); expect(summary.textContent).toContain('£3.15'); expect(summary.textContent).toContain('£15.49');
    expect(host.textContent).toContain('October 2026'); expect(host.textContent).toContain('Draft · demo'); expect(host.textContent).toContain('10-11-2026');
    click('Add Expense'); click('Add Mileage'); click('Review Claim');
    expect(navigate.mock.calls.map(call => call[0])).toEqual(['expenses', 'mileage', 'review']);
    expect(host.textContent).toContain('DEMO / UNSAVED'); expect(host.textContent).toContain('No SharePoint Save');
  });
  it('maps November and December correctly across financial-year/deadline boundaries', () => {
    act(() => { renderPage(<HomeScreen claim={{ ...claim, month: '2026-11' }} expenses={0} mileage={0} idPrefix="boundary" navigate={jest.fn()} />); });
    expect(element<HTMLSelectElement>('#boundary-fiscal-year').value).toBe('2026');
    expect(element<HTMLSelectElement>('#boundary-claim-month').options).toHaveLength(1);
    expect(host.textContent).toContain('10-12-2026');
    act(() => { renderPage(<HomeScreen claim={{ ...claim, month: '2026-12' }} expenses={0} mileage={0} idPrefix="boundary" navigate={jest.fn()} />); });
    expect(host.textContent).toContain('10-01-2027');
  });
  it('previous-year/month selection is clickable, truthful and leaves current totals intact', () => {
    const navigate = jest.fn();
    act(() => { renderPage(<HomeScreen claim={claim} expenses={1000} mileage={200} idPrefix="history" navigate={navigate} />); });
    change('#history-fiscal-year', '2024');
    const selector = element<HTMLSelectElement>('#history-claim-month');
    expect(selector.options[0].value).toBe('2024-11'); expect(selector.options[11].value).toBe('2025-10');
    change('#history-claim-month', '2025-10'); click('Inspect previous demo claim');
    expect(element<HTMLElement>('[role="status"]').textContent).toContain('No record was opened or changed');
    expect(host.textContent).toContain('No historical SharePoint record is loaded'); expect(navigate).not.toHaveBeenCalled();
    expect(element<HTMLElement>('[aria-label="Current demo claim totals"]').textContent).toContain('£12.00');
    change('#history-fiscal-year', '2025'); click('Open current Review Claim'); expect(navigate).toHaveBeenCalledWith('review');
  });
  it('orders expenses and journeys oldest first without changing source arrays and sums exact totals', () => {
    const expenses = [expense('new', '2026-10-20', { kind: 'no-receipt', reason: 'Synthetic reason' }, 3), expense('old-tie', '2026-10-01', { kind: 'no-receipt', reason: 'Synthetic reason' }, 2), expense('old', '2026-10-01', { kind: 'no-receipt', reason: 'Synthetic reason' }, 1)];
    const journeys = [journey('new', '2026-10-20', 2), journey('old', '2026-10-01', 1)];
    act(() => { renderPage(<ReviewClaimScreen expenses={expenses} journeys={journeys} idPrefix="review" />); });
    expect(Array.from(host.querySelectorAll('[data-expense-id]')).map(item => item.getAttribute('data-expense-id'))).toEqual(['old', 'old-tie', 'new']);
    expect(Array.from(host.querySelectorAll('[data-journey-id]')).map(item => item.getAttribute('data-journey-id'))).toEqual(['old', 'new']);
    expect(expenses[0].id).toBe('new'); expect(journeys[0].id).toBe('new');
    const grand = element<HTMLElement>('[aria-label="Review grand total"]'); expect(grand.textContent).toBe('Grand total£43.32');
    expect(grand.children).toHaveLength(2); expect(grand.querySelector('button')).toBeNull();
    expect(host.textContent).toContain('01-10-2026'); expect(host.textContent).toContain('20-10-2026'); expect(host.textContent).toContain('Return');
    click('Check demo claim'); expect(element<HTMLElement>('[role="status"]').textContent).toContain('nothing was submitted or saved to SharePoint');
  });
  it('keeps no-receipt reason visible and toggles filename-only metadata without pretending to open a file', () => {
    const expenses = [expense('reason', '2026-10-01', { kind: 'no-receipt', reason: 'Synthetic lost receipt' }, 1), expense('file', '2026-10-02', { kind: 'demo-receipt', fileName: 'synthetic.pdf' }, 2)];
    act(() => { renderPage(<ReviewClaimScreen expenses={expenses} journeys={[]} idPrefix="receipts" />); });
    expect(host.textContent).toContain('No receipt · reason: Synthetic lost receipt');
    const metadata = element<HTMLElement>('#receipts-receipt-file'); expect(metadata.hidden).toBe(true);
    click('Receipt metadata'); expect(metadata.hidden).toBe(false); expect(metadata.textContent).toContain('No attachment was uploaded, opened or persisted');
    expect(element<HTMLButtonElement>('[aria-controls="receipts-receipt-file"]').getAttribute('aria-expanded')).toBe('true');
    click('Receipt metadata'); expect(metadata.hidden).toBe(true);
  });
  it('detects missing no-receipt reasons instead of presenting a clean demo check', () => {
    act(() => { renderPage(<ReviewClaimScreen expenses={[expense('invalid', '2026-10-01', { kind: 'no-receipt', reason: ' ' }, 1)]} journeys={[]} idPrefix="invalid" />); });
    click('Check demo claim'); expect(element<HTMLElement>('[role="status"]').textContent).toContain('reason is missing');
  });
  it('shows empty states and a truthful non-submitting check action', () => {
    act(() => { renderPage(<ReviewClaimScreen expenses={[]} journeys={[]} idPrefix="empty" />); });
    expect(host.textContent).toContain('No demo expenses yet'); expect(host.textContent).toContain('No demo mileage yet');
    click('Check demo claim'); expect(element<HTMLElement>('[role="status"]').textContent).toContain('Add a demo expense or mileage journey');
    expect(element<HTMLElement>('[aria-label="Review grand total"]').textContent).toBe('Grand total£0.00');
  });
});
