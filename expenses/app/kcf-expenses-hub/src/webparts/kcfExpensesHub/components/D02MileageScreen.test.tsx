import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { D02MileageScreen } from './D02MileageScreen';
import { KcfExpensesHub } from './KcfExpensesHub';
import { MockExpensesService } from '../../../services/MockExpensesService';
import { nominalMaster } from '../../../data/nominals';
import { createHeldMileageEntry } from '../../../services/persistence/MileageEntryAdapter';
import type { MileageEntryAdapter } from '../../../services/persistence/MileageEntryAdapter';
import { FakeMileageProcessor, mileageDraft } from '../../../services/persistence/MileageEntryFixtures.testSupport';

describe('D02 manual form source integration only', () => {
  let root: HTMLDivElement;
  beforeEach(() => { root = document.createElement('div'); document.body.appendChild(root); });
  afterEach(() => { act(() => { ReactDom.unmountComponentAtNode(root); }); root.remove(); });
  async function render(adapter: MileageEntryAdapter): Promise<void> {
    await act(async () => { ReactDom.render(<D02MileageScreen adapter={adapter} idPrefix="synthetic" />, root); });
  }
  function button(label: string): HTMLButtonElement {
    const b = Array.from(root.querySelectorAll('button')).find(n => n.textContent === label); if (!b) throw new Error('Missing button ' + label); return b;
  }
  async function fill(): Promise<void> {
    const d = mileageDraft();
    for (const key of ['date', 'programme', 'nominalCode', 'from', 'to', 'returnJourney', 'outwardMiles', 'returnMiles', 'purpose'] as const) {
      await act(async () => {
        const n = root.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-d02="${key}"]`)!;
        n.value = key === 'returnJourney' ? 'return' : String(d[key]); Simulate.change(n);
      });
    }
  }
  it('Held runtime cannot submit and makes no success claim', async () => {
    await render(createHeldMileageEntry()); expect(button('Submit manual Mileage').disabled).toBe(true);
    expect(root.textContent).toContain('Mileage Save held'); expect(root.textContent).not.toContain('readback verified');
  });
  it('pending retains exact form and operation, locks submit and checks without resubmit', async () => {
    const t = new FakeMileageProcessor(); t.ambiguous = true; const a = t.adapter(); await render(a); await fill();
    await act(async () => { Simulate.submit(root.querySelector('form')!); });
    expect(root.textContent).toContain('Outcome pending'); expect(button('Submit manual Mileage').disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[data-d02="purpose"]')!.value).toBe(mileageDraft().purpose);
    const op = a.currentOperationId; await act(async () => { Simulate.click(button('Check same Mileage operation')); });
    expect(a.currentOperationId).toBe(op); expect(t.submissions).toBe(1); expect(root.textContent).not.toContain('readback verified');
  });
  it('invalid form retains fields without submission', async () => {
    const t = new FakeMileageProcessor(); await render(t.adapter()); await fill();
    await act(async () => { const n = root.querySelector<HTMLInputElement>('[data-d02="date"]')!; n.value = '01-11-2026'; Simulate.change(n); });
    await act(async () => { Simulate.submit(root.querySelector('form')!); });
    expect(t.submissions).toBe(0); expect(root.textContent).toContain('No success claimed');
    expect(root.querySelector<HTMLInputElement>('[data-d02="from"]')!.value).toBe('Synthetic A');
  });
  it('same instance Close and Reopen displays bound ID, separate legs and variable rate', async () => {
    const t = new FakeMileageProcessor(); await render(t.adapter()); await fill();
    await act(async () => { Simulate.submit(root.querySelector('form')!); });
    expect(root.textContent).toContain('Mileage 801 readback verified'); expect(root.textContent).toContain('£1.48');
    await act(async () => { Simulate.click(button('Close Mileage details')); });
    await act(async () => { Simulate.click(button('Reopen same Mileage')); });
    expect(root.textContent).toContain('Mileage 801 readback verified'); expect(t.submissions).toBe(1);
    expect(root.querySelector<HTMLInputElement>('[data-d02="returnMiles"]')!.value).toBe('6.30');
  });
  it('cold component can reopen existing ID without a new form save', async () => {
    const t = new FakeMileageProcessor(); await t.adapter().save(mileageDraft()); await render(t.adapter());
    await act(async () => { Simulate.click(button('Reopen Mileage 801')); });
    expect(root.textContent).toContain('Mileage 801 readback verified'); expect(t.submissions).toBe(1);
    const detail = root.querySelector('[aria-label="Verified Mileage details"]')!.textContent;
    for (const key of ['date', 'from', 'to', 'purpose', 'outwardMiles', 'returnMiles'] as const) expect(detail).toContain(mileageDraft()[key]);
    expect(detail).toContain('Return');
    expect(button('Submit manual Mileage').disabled).toBe(true); expect(button('Check same Mileage operation').disabled).toBe(true);
  });
  it('reopened details do not overwrite entered form and rejection cannot unlock a saved line for duplicate creation', async () => {
    const t = new FakeMileageProcessor(); await t.adapter().save(mileageDraft()); const a = t.adapter(); await render(a); await fill();
    await act(async () => { const input = root.querySelector<HTMLInputElement>('[data-d02="purpose"]')!; input.value = 'Retained unsaved purpose'; Simulate.change(input); });
    await act(async () => { Simulate.click(button('Reopen Mileage 801')); });
    expect(root.querySelector<HTMLInputElement>('[data-d02="purpose"]')!.value).toBe('Retained unsaved purpose');
    (t.record as unknown as { requestId: number }).requestId = 999;
    await act(async () => { Simulate.click(button('Reopen same Mileage')); });
    expect(root.textContent).toContain('No success claimed'); expect(button('Submit manual Mileage').disabled).toBe(true);
    expect(root.querySelector<HTMLInputElement>('[data-d02="purpose"]')!.value).toBe('Retained unsaved purpose'); expect(t.submissions).toBe(1);
  });
  it('app actually references the immutable held candidate while demo remains separate', async () => {
    await act(async () => { ReactDom.render(<KcfExpensesHub service={new MockExpensesService(nominalMaster)} instanceId="synthetic" />, root); });
    await act(async () => { Simulate.click(button('Open D02 Mileage Save candidate (held)')); });
    expect(root.textContent).toContain('Mileage Save held'); expect(button('Submit manual Mileage').disabled).toBe(true);
    expect(root.textContent).toContain('Save demo journey');
  });
});
