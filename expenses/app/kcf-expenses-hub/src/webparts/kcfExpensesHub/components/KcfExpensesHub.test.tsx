import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { KcfExpensesHub } from './KcfExpensesHub';
import { MockExpensesService, DEMO_CLAIM } from '../../../services/MockExpensesService';
import { nominalMaster } from '../../../data/nominals';
import type { IExpensesService, ISaveExpenseCommand } from '../../../domain/contracts';

// Actual React controls + actual mock service in jsdom. CSS is mocked by the
// official Heft Jest rig; these tests confer no viewport/phone/SharePoint credit.
describe('Native Expenses React controls (in-memory demo)', () => {
  let host: HTMLDivElement;
  let service: MockExpensesService;

  function renderHub(adapter: IExpensesService, onCommit?: () => void): void {
    ReactDom.render(<KcfExpensesHub service={adapter} instanceId="ui-test" logoUrl="derived-crest.png" />, host, onCommit);
  }

  function element<T extends Element>(selector: string): T {
    const found = host.querySelector<T>(selector);
    if (!found) throw new Error(`Missing test control: ${selector}`);
    return found;
  }
  function button(text: string): HTMLButtonElement {
    const found = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent?.indexOf(text) !== -1);
    if (!found) throw new Error(`Missing test button: ${text}`);
    return found;
  }
  function change(selector: string, value: string): void {
    const control = element<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
    act(() => { control.value = value; Simulate.change(control); });
  }
  function validForm(): void {
    change('[data-field="supplier"]', 'Synthetic UI seller');
    change('[data-field="nominalCode"]', '20600');
    change('[data-field="description"]', 'Synthetic UI journey');
    change('[data-field="amount"]', '12.34');
    change('[data-field="receipt"]', 'Synthetic UI example without receipt');
  }
  async function submit(): Promise<void> {
    await act(async () => { Simulate.submit(element<HTMLFormElement>('form')); });
  }
  async function choosePdfAndSave(supplier: string, name: string): Promise<void> {
    validForm(); change('[data-field="supplier"]', supplier);
    const input = element<HTMLInputElement>('input[aria-label="Choose receipt photo or PDF"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['%PDF-1.4\n%%EOF'], name, { type: 'application/pdf' })] });
    await act(async () => { Simulate.change(input); });
    for (let attempts = 0; attempts < 50 && button('Save demo expense').disabled; attempts++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    }
    expect(button('Save demo expense').disabled).toBe(false);
    await submit();
    const selector = `button[aria-label="View local PDF receipt for ${supplier}"]`;
    for (let attempts = 0; attempts < 50 && !host.querySelector(selector); attempts++) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    }
    expect(host.querySelector(selector)).not.toBeNull();
  }
  beforeEach(async () => {
    host = document.createElement('div'); document.body.appendChild(host);
    service = new MockExpensesService(nominalMaster, DEMO_CLAIM, false);
    await act(async () => { renderHub(service); });
  });
  afterEach(() => {
    act(() => { ReactDom.unmountComponentAtNode(host); }); host.remove(); jest.restoreAllMocks();
  });

  it('retains a usable shell below the fold and responds to changed host position', () => {
    const shell = element<HTMLDivElement>('div[style]');
    const rect = jest.spyOn(shell, 'getBoundingClientRect');
    const oldHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
    try {
      for (const top of [700, 768, 900]) {
        rect.mockReturnValue({ top } as DOMRect);
        act(() => { window.dispatchEvent(new Event('resize')); });
        expect(shell.style.getPropertyValue('--viewport-space')).toBe('560px');
      }
      rect.mockReturnValue({ top: 96 } as DOMRect);
      act(() => { window.dispatchEvent(new Event('resize')); });
      expect(shell.style.getPropertyValue('--viewport-space')).toBe('664px');
    } finally { Object.defineProperty(window, 'innerHeight', { configurable: true, value: oldHeight }); }
  });
  it('renders 195 exact nominal options, searchable LT alias, and the supplied crest', () => {
    expect(element<HTMLImageElement>('header img').getAttribute('src')).toBe('derived-crest.png');
    expect(element<HTMLSelectElement>('[data-field="nominalCode"]').options.length).toBe(196);
    change('input[type="search"]', 'LT');
    expect(element<HTMLSelectElement>('[data-field="nominalCode"]').textContent).toContain('40600');
    expect(host.textContent).toContain('Synthetic demo');
  });
  it('invalid Save focuses the first invalid field and creates no line', async () => {
    await submit();
    expect(await service.expenseLines.list(DEMO_CLAIM.id)).toHaveLength(0);
    expect(element<HTMLInputElement>('[data-field="nominalCode"]').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(element<HTMLSelectElement>('[data-field="nominalCode"]'));
  });
  it('adds through the actual form and displays exact total; editing retains ID/count', async () => {
    validForm(); await submit();
    const added = await service.expenseLines.list(DEMO_CLAIM.id);
    expect(added).toHaveLength(1); expect(added[0].amountPence).toBe(1234);
    expect(host.textContent).toContain('£12.34');
    act(() => { Simulate.click(element<HTMLButtonElement>('button[aria-label^="Edit Synthetic"]')); });
    change('[data-field="amount"]', '10.10'); await submit();
    const edited = await service.expenseLines.list(DEMO_CLAIM.id);
    expect(edited).toHaveLength(1); expect(edited[0].id).toBe(added[0].id);
    expect(edited[0].amountPence).toBe(1010); expect(host.textContent).toContain('£10.10');
  });
  it('Cancel abandons unsaved edits without mutating the mock line', async () => {
    validForm(); await submit();
    const before = await service.expenseLines.list(DEMO_CLAIM.id);
    act(() => { Simulate.click(element<HTMLButtonElement>('button[aria-label^="Edit Synthetic"]')); });
    change('[data-field="amount"]', '99.99');
    act(() => { Simulate.click(button('Cancel')); });
    expect(await service.expenseLines.list(DEMO_CLAIM.id)).toEqual(before);
    expect(element<HTMLInputElement>('[data-field="amount"]').value).toBe('');
  });
  it('guards two synchronous submits with one Save command', async () => {
    const save = jest.spyOn(service.expenseLines, 'save');
    validForm();
    await act(async () => { const form = element<HTMLFormElement>('form'); Simulate.submit(form); Simulate.submit(form); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(await service.expenseLines.list(DEMO_CLAIM.id)).toHaveLength(1);
  });
  it('preserves unsaved form values across placeholder navigation without a Save', () => {
    const save = jest.spyOn(service.expenseLines, 'save');
    validForm();
    act(() => { Simulate.click(button('Help')); });
    expect(element<HTMLElement>('[hidden] form').querySelector<HTMLInputElement>('[data-field="amount"]')?.value).toBe('12.34');
    act(() => { Simulate.click(button('Expenses')); });
    expect(element<HTMLInputElement>('[data-field="supplier"]').value).toBe('Synthetic UI seller');
    expect(save).not.toHaveBeenCalled();
  });
  it('returns keyboard focus to More when the navigation overlay closes with Escape', () => {
    const more = button('More');
    act(() => { Simulate.click(more); });
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const navigation = element<HTMLElement>('nav[aria-label="Expenses Hub navigation"]');
    expect(navigation.contains(document.activeElement)).toBe(true);
    act(() => { Simulate.keyDown(navigation, { key: 'Escape' }); });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
  });
  it('keeps the form and operation ID after refresh failure; retry adds no duplicate', async () => {
    const list = jest.spyOn(service.expenseLines, 'list');
    const save = jest.spyOn(service.expenseLines, 'save');
    list.mockRejectedValueOnce(new Error('Synthetic refresh failure'));
    validForm(); await submit();
    expect(host.textContent).toContain('Synthetic refresh failure');
    expect(element<HTMLInputElement>('[data-field="amount"]').value).toBe('12.34');
    const firstCommand: ISaveExpenseCommand = save.mock.calls[0][0];
    await submit();
    expect(save.mock.calls[1][0].operationId).toBe(firstCommand.operationId);
    expect(await service.expenseLines.list(DEMO_CLAIM.id)).toHaveLength(1);
  });
  it('keeps a selected PDF only in memory, reopens its preview and Cancel retains the line', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:synthetic-integration') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    validForm();
    const originalSave = service.expenseLines.save.bind(service.expenseLines);
    let saveCompleted: (() => void) | undefined;
    const completion = new Promise<void>(resolve => { saveCompleted = resolve; });
    jest.spyOn(service.expenseLines, 'save').mockImplementation(async command => {
      const result = await originalSave(command); saveCompleted?.(); return result;
    });
    const file = new File(['%PDF-1.4\n%%EOF'], 'synthetic-receipt.pdf', { type: 'application/pdf' });
    const input = element<HTMLInputElement>('input[aria-label="Choose receipt photo or PDF"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await act(async () => { Simulate.change(input); await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(host.textContent).toContain('NOT yet saved to SharePoint');
    await act(async () => { Simulate.submit(element<HTMLFormElement>('form')); await completion; });
    const saved = await service.expenseLines.list(DEMO_CLAIM.id);
    expect(saved).toHaveLength(1);
    expect(saved[0].receipt).toEqual({ kind: 'demo-receipt', fileName: file.name });
    expect(JSON.stringify(saved)).not.toContain('%PDF');
    act(() => { Simulate.click(element<HTMLButtonElement>('button[aria-label^="Edit Synthetic"]')); });
    expect(host.textContent).toContain(file.name);
    act(() => { Simulate.click(button('View PDF')); });
    expect(element<HTMLIFrameElement>('iframe').getAttribute('sandbox')).toBe('');
    act(() => { Simulate.click(button('Close receipt preview')); Simulate.click(button('No receipt available')); });
    change('[data-field="receipt"]', 'Synthetic replacement reason');
    act(() => { Simulate.click(button('Cancel')); });
    expect(await service.expenseLines.list(DEMO_CLAIM.id)).toEqual(saved);
    act(() => { Simulate.click(element<HTMLButtonElement>('button[aria-label^="Edit Synthetic"]')); });
    expect(host.textContent).toContain(file.name);
    expect((service as IExpensesService).receipts).toBeUndefined();
  });
  it('blocks synchronous Save while a newly chosen file is validating', async () => {
    validForm();
    const save = jest.spyOn(service.expenseLines, 'save');
    let reader: FileReader | undefined;
    jest.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) { reader = this; });
    const input = element<HTMLInputElement>('input[aria-label="Choose receipt photo or PDF"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['%PDF-1.4\n%%EOF'], 'pending.pdf', { type: 'application/pdf' })] });
    await act(async () => { Simulate.change(input); Simulate.submit(element<HTMLFormElement>('form')); });
    expect(reader).toBeDefined(); expect(save).not.toHaveBeenCalled();
    expect(button('Save demo expense').disabled).toBe(true);
    act(() => { Simulate.click(button('Cancel')); });
    expect(save).not.toHaveBeenCalled();
  });
  it('opens the saved local line PDF from its own separate button without a nested control or new Save', async () => {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:synthetic-line') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    const save = jest.spyOn(service.expenseLines, 'save');
    await choosePdfAndSave('Synthetic UI seller', 'synthetic-line-a.pdf');
    const preview = element<HTMLButtonElement>('button[aria-label="View local PDF receipt for Synthetic UI seller"]');
    expect(preview.parentElement?.closest('button')).toBeNull();
    act(() => { Simulate.click(preview); });
    const dialog = element<HTMLElement>('[role="dialog"]');
    expect(dialog.textContent).toContain('synthetic-line-a.pdf');
    expect(dialog.querySelector('iframe')?.getAttribute('sandbox')).toBe('');
    expect(dialog.querySelector('a')).toBeNull();
    act(() => { Simulate.keyDown(dialog, { key: 'Escape' }); });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(save).toHaveBeenCalledTimes(1); expect(await service.expenseLines.list(DEMO_CLAIM.id)).toHaveLength(1);
  });
  it('keeps two saved local Files on their exact lines and closes their viewers on navigation', async () => {
    let sequence = 0;
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => `blob:synthetic-line-${++sequence}`) });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
    const save = jest.spyOn(service.expenseLines, 'save');
    await choosePdfAndSave('Synthetic UI seller', 'synthetic-line-a.pdf');
    await choosePdfAndSave('Second synthetic UI seller', 'synthetic-line-b.pdf');
    const first = element<HTMLElement>('section[aria-label="Local demo receipt for Synthetic UI seller"]');
    const second = element<HTMLElement>('section[aria-label="Local demo receipt for Second synthetic UI seller"]');
    expect(first.textContent).toContain('synthetic-line-a.pdf'); expect(first.textContent).not.toContain('synthetic-line-b.pdf');
    expect(second.textContent).toContain('synthetic-line-b.pdf'); expect(second.textContent).not.toContain('synthetic-line-a.pdf');
    act(() => { Simulate.click(element<HTMLButtonElement>('button[aria-label="View local PDF receipt for Second synthetic UI seller"]')); });
    expect(element<HTMLElement>('[role="dialog"]').textContent).toContain('synthetic-line-b.pdf');
    act(() => { Simulate.click(button('Help')); });
    expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(host.querySelector('iframe')).toBeNull();
    expect(save).toHaveBeenCalledTimes(2); expect(await service.expenseLines.list(DEMO_CLAIM.id)).toHaveLength(2);
  });
  it('stops a mocked webcam when the actual app navigates away from Expenses', async () => {
    const stop = jest.fn();
    const acquire = jest.fn(async () => ({ getTracks: () => [{ stop }] } as unknown as MediaStream));
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { enumerateDevices: jest.fn(async () => [{ kind: 'videoinput' }]), getUserMedia: acquire } });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => ({ matches: false })) });
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    act(() => { Simulate.click(button('Help')); });
    await act(async () => { Simulate.click(button('Expenses')); });
    expect(acquire).not.toHaveBeenCalled();
    await act(async () => { Simulate.click(button('Use camera')); });
    expect(host.querySelector('video')).not.toBeNull();
    act(() => { Simulate.click(button('Help')); });
    expect(stop).toHaveBeenCalled(); expect(host.querySelector('video')).toBeNull();
    expect(await service.expenseLines.list(DEMO_CLAIM.id)).toHaveLength(0);
  });
  it('refuses a non-mock adapter synchronously after a previously loaded mock claim', () => {
    const unsafeService: IExpensesService = {
      mode: 'sharepoint-test',
      nominals: { getAll: jest.fn(async () => nominalMaster) },
      currentClaim: { get: jest.fn(async () => DEMO_CLAIM) },
      expenseLines: { list: jest.fn(async () => []), save: jest.fn(async () => { throw new Error('Unexpected adapter call'); }) }
    };
    act(() => {
      renderHub(unsafeService, () => {
        // Assert at commit, before passive effects; act may batch the render.
        // An old claim must not expose controls with the new transport.
        expect(host.querySelector('form')).toBeNull();
      });
    });
    expect(host.textContent).toContain('only supports the synthetic demo adapter');
    expect(unsafeService.nominals.getAll).not.toHaveBeenCalled();
    expect(unsafeService.currentClaim.get).not.toHaveBeenCalled();
    expect(unsafeService.expenseLines.save).not.toHaveBeenCalled();
  });
});
