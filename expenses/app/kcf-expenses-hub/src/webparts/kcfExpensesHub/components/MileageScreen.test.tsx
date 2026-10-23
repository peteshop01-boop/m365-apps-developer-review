import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { MileageScreen } from './MileageScreen';
import { MockMileageService } from '../../../services/MockMileageService';
import { DEMO_CLAIM } from '../../../services/MockExpensesService';
import { nominalMaster } from '../../../data/nominals';
import type { IMileageLine } from '../../../domain/mileage';

describe('Manual Mileage actual React controls, synthetic only', () => {
  let host: HTMLDivElement; let api: MockMileageService; let lines: ReadonlyArray<IMileageLine>;
  async function refresh(): Promise<void> { lines = await api.list(DEMO_CLAIM.id); render(); }
  function render(): void { ReactDom.render(<MileageScreen api={api} claim={DEMO_CLAIM} nominals={nominalMaster} lines={lines} idPrefix="journey-test" onSaved={refresh} />, host); }
  function element<T extends Element>(selector: string): T { const result = host.querySelector<T>(selector); if (!result) throw new Error(`Missing ${selector}`); return result; }
  function change(selector: string, value: string): void { const item = element<HTMLInputElement | HTMLSelectElement>(selector); act(() => { item.value = value; Simulate.change(item); }); }
  function valid(): void { change('[data-mileage="from"]', 'Demo start'); change('[data-mileage="to"]', 'Demo ground'); change('[data-mileage="outwardMiles"]', '12.5'); change('[data-mileage="purpose"]', 'Fictional visit'); }
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); api = new MockMileageService(nominalMaster, DEMO_CLAIM); lines = []; act(render); });
  afterEach(() => { act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); jest.restoreAllMocks(); });
  it('focuses invalid start and creates nothing on invalid submit', async () => {
    await act(async () => { Simulate.submit(element<HTMLFormElement>('form')); });
    expect(document.activeElement).toBe(element('[data-mileage="from"]')); expect(await api.list(DEMO_CLAIM.id)).toHaveLength(0);
  });
  it('requires separate reverse miles, saves once and displays whole miles/total', async () => {
    valid(); act(() => { Simulate.change(element<HTMLInputElement>('input[type="radio"]:not(:checked)')); });
    await act(async () => { Simulate.submit(element<HTMLFormElement>('form')); });
    expect(host.textContent).toContain('reverse leg separately'); expect(await api.list(DEMO_CLAIM.id)).toHaveLength(0);
    change('[data-mileage="returnMiles"]', '12'); const spy = jest.spyOn(api, 'save');
    await act(async () => { const form = element<HTMLFormElement>('form'); Simulate.submit(form); Simulate.submit(form); });
    expect(spy).toHaveBeenCalledTimes(1); expect(lines).toHaveLength(1); expect(lines[0].payableMiles).toBe(25); expect(host.textContent).toContain('£11.25');
  });
  it('edits the same ID and Cancel journey abandons unsaved changes', async () => {
    valid(); await act(async () => { Simulate.submit(element<HTMLFormElement>('form')); }); const before = lines[0];
    act(() => { Simulate.click(element<HTMLButtonElement>('button[aria-label^="Edit journey"]')); }); change('[data-mileage="outwardMiles"]', '20');
    await act(async () => { Simulate.submit(element<HTMLFormElement>('form')); }); expect(lines[0].id).toBe(before.id); expect(lines[0].amountPence).toBe(900);
    act(() => { Simulate.click(element<HTMLButtonElement>('button[aria-label^="Edit journey"]')); }); change('[data-mileage="outwardMiles"]', '99');
    const cancel = Array.from(host.querySelectorAll('button')).find(item => item.textContent === 'Cancel journey');
    act(() => { Simulate.click(cancel as HTMLButtonElement); }); expect((await api.list(DEMO_CLAIM.id))[0].amountPence).toBe(900);
  });
});
