import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { MyTeamScreen } from './MyTeamScreen';
import { ManagerReviewScreen } from './ManagerReviewScreen';
import type { IDemoStaffClaim } from './PageContracts';
import type { IDemoDecision } from '../../../domain/demoReview';

const claim: IDemoStaffClaim = {
  id: 'synthetic-claim-a', employeeName: 'Synthetic colleague A', managerName: 'Synthetic manager', month: '2026-10',
  status: 'Submitted', selfApproval: false, financeAcknowledged: false,
  lines: [
    { id: 'expense-a', kind: 'Expense', dateIso: '2026-10-03', title: 'Synthetic stationery', detail: 'Synthetic no-receipt reason: illustration only.', nominalCode: '20600', amountPence: 1234, version: 1 },
    { id: 'expense-b', kind: 'Expense', dateIso: '2026-10-05', title: 'Synthetic equipment', detail: 'Synthetic filename, no uploaded receipt.', nominalCode: '20600', amountPence: 500, version: 1 },
    { id: 'mileage-a', kind: 'Mileage', dateIso: '2026-10-04', title: 'Synthetic Return journey', detail: 'Return · 10 whole miles · illustrative manual mileage.', nominalCode: '20600', amountPence: 450, version: 1 }
  ]
};

describe('Team / Manager clickable synthetic pages', () => {
  let host: HTMLDivElement;
  function renderPage(page: React.ReactElement): void { ReactDom.render(page, host); }
  function button(text: string): HTMLButtonElement {
    const result = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.includes(text));
    if (!result) throw new Error(`Missing button: ${text}`);
    return result;
  }
  function click(text: string): void { act(() => { Simulate.click(button(text)); }); }
  function change(selector: string, value: string): void {
    const control = host.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
    if (!control) throw new Error(`Missing control: ${selector}`);
    act(() => { control.value = value; Simulate.change(control); });
  }
  function Harness({ initialClaim = claim, initialDecisions = [] }: { initialClaim?: IDemoStaffClaim; initialDecisions?: ReadonlyArray<IDemoDecision> }): React.ReactElement {
    const [current, setCurrent] = React.useState(initialClaim);
    const [decisions, setDecisions] = React.useState(initialDecisions);
    return <ManagerReviewScreen claim={current} decisions={decisions} idPrefix="manager-test" onDecision={value => setDecisions(previous => [...previous, value])} onSelfApproval={enabled => setCurrent(previous => ({ ...previous, selfApproval: enabled }))} />;
  }
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); });
  afterEach(() => { act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); });

  it('filters the roster and opens the exact synthetic claim ID with three separate totals', () => {
    const onOpen = jest.fn();
    act(() => { renderPage(<MyTeamScreen claims={[claim, { ...claim, id: 'synthetic-b', employeeName: 'Synthetic colleague B', status: 'Draft', month: '2026-09' }]} idPrefix="team-test" onOpen={onOpen} />); });
    change('#team-test-team-month', '2026-10');
    expect(host.textContent).not.toContain('Synthetic colleague B');
    expect(host.textContent).toContain('£17.34');
    expect(host.textContent).toContain('£4.50');
    expect(host.textContent).toContain('£21.84');
    click('Open demo review');
    expect(onOpen).toHaveBeenCalledWith('synthetic-claim-a');
    change('#team-test-team-search', 'no such synthetic colleague');
    expect(host.textContent).toContain('No synthetic colleagues match');
    expect(host.querySelector('article')).toBeNull();
    expect(host.textContent).toContain('DEMO / NO SHAREPOINT SAVE');
  });
  it('refuses an empty query and keeps completion blocked', () => {
    const onDecision = jest.fn();
    act(() => { renderPage(<ManagerReviewScreen claim={claim} decisions={[]} idPrefix="manager-test" onDecision={onDecision} onSelfApproval={jest.fn()} />); });
    click('Query demo line');
    expect(onDecision).not.toHaveBeenCalled();
    expect(host.textContent).toContain('A written query reason is required.');
    expect(button('Complete demo review').disabled).toBe(true);
  });
  it('queries one line without removing another approval and holds whole-claim completion', () => {
    act(() => { renderPage(<Harness />); });
    click('Approve demo line');
    click('Synthetic equipment');
    change('#manager-test-manager-query', 'Explain this synthetic purchase.');
    click('Query demo line');
    const lines = host.querySelector('section[aria-label="Synthetic review lines"]');
    expect(lines?.textContent).toContain('Approved');
    expect(lines?.textContent).toContain('Queried');
    expect(host.textContent).toContain('Explain this synthetic purchase.');
    expect(button('Complete demo review').disabled).toBe(true);
    click('Mileage');
    expect(host.textContent).toContain('Return · 10 whole miles');
    expect(host.textContent).toContain('04-10-2026');
  });
  it('completes only when every current line version is approved', () => {
    const approvals: IDemoDecision[] = claim.lines.map(line => ({ lineId: line.id, version: line.version, status: 'Approved', reason: '', actor: 'Synthetic manager', at: '2026-10-13T12:00:00Z' }));
    act(() => { renderPage(<Harness initialDecisions={approvals} />); });
    expect(button('Complete demo review').disabled).toBe(false);
    click('Complete demo review');
    expect(host.textContent).toContain('No claim status, payment or server record changed. UNSAVED.');
    act(() => { renderPage(<ManagerReviewScreen claim={{ ...claim, lines: claim.lines.map(line => line.id === 'expense-a' ? { ...line, version: 2 } : line) }} decisions={approvals} idPrefix="manager-test" onDecision={jest.fn()} onSelfApproval={jest.fn()} />); });
    expect(button('Complete demo review').disabled).toBe(true);
  });
  it('requires a written self-approval reason and Finance acknowledgement before completion', () => {
    const onSelfApproval = jest.fn();
    const approvals: IDemoDecision[] = claim.lines.map(line => ({ lineId: line.id, version: 1, status: 'Approved', reason: '', actor: 'Synthetic manager', at: '2026-10-13T12:00:00Z' }));
    act(() => { renderPage(<ManagerReviewScreen claim={claim} decisions={approvals} idPrefix="manager-test" onDecision={jest.fn()} onSelfApproval={onSelfApproval} />); });
    click('Flag demo self-approval exception');
    expect(onSelfApproval).not.toHaveBeenCalled();
    change('#manager-test-exception-reason', 'Synthetic exceptional cover illustration.');
    click('Flag demo self-approval exception');
    expect(onSelfApproval).toHaveBeenCalledWith(true);
    act(() => { renderPage(<ManagerReviewScreen claim={{ ...claim, selfApproval: true }} decisions={approvals} idPrefix="manager-test" onDecision={jest.fn()} onSelfApproval={onSelfApproval} />); });
    expect(button('Complete demo review').disabled).toBe(true);
    expect(host.textContent).toContain('acknowledgement pending');
    act(() => { renderPage(<ManagerReviewScreen claim={{ ...claim, selfApproval: true, financeAcknowledged: true }} decisions={approvals} idPrefix="manager-test" onDecision={jest.fn()} onSelfApproval={onSelfApproval} />); });
    expect(button('Complete demo review').disabled).toBe(false);
  });
  it('refuses incomplete alternate-manager context instead of granting authority', () => {
    const onDecision = jest.fn();
    act(() => { renderPage(<ManagerReviewScreen claim={claim} decisions={[]} idPrefix="manager-test" onDecision={onDecision} onSelfApproval={jest.fn()} />); });
    const checkbox = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!checkbox) throw new Error('Missing alternate simulation control');
    act(() => { checkbox.checked = true; Simulate.change(checkbox); });
    click('Approve demo line');
    expect(onDecision).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Enter a delegation reason and valid start/end dates');
    change('#manager-test-delegation-reason', 'Synthetic leave cover');
    change('#manager-test-delegation-from', '13-10-2026');
    change('#manager-test-delegation-until', '12-10-2026');
    click('Approve demo line');
    expect(onDecision).not.toHaveBeenCalled();
    change('#manager-test-delegation-until', '14-10-2026');
    click('Approve demo line');
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('acting as synthetic alternate');
    expect(host.textContent).toContain('No actual delegated identity or expiry is enforced');
  });
});
