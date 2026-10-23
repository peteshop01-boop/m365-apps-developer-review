import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { ReceiptLinePreview } from './ReceiptLinePreview';
import type { IReceiptLinePreviewProps } from './ReceiptLinePreview';
import * as receiptPolicy from './receiptValidation';

// Synthetic jsdom controls and lifecycle checks only. Real viewport, phone,
// browser PDF rendering, trusted backend scanning and persistence are unproved.
describe('Local expense-line receipt preview', () => {
  let host: HTMLDivElement;
  let createUrl: jest.Mock;
  let revokeUrl: jest.Mock;
  let originalImage: typeof Image;
  const photo = (name = 'synthetic-a.jpg'): File => new File([new Uint8Array([255, 216, 255, 224, 1])], name, { type: 'image/jpeg' });
  const pdf = (): File => new File(['%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF'], 'synthetic.pdf', { type: 'application/pdf' });
  function props(file?: File, bindingKey = 'line-a', active = true): IReceiptLinePreviewProps {
    return { file, supplier: bindingKey === 'line-a' ? 'Synthetic supplier A' : 'Synthetic supplier B', bindingKey, active };
  }
  function renderPage(value: IReceiptLinePreviewProps, committed?: () => void): void {
    ReactDom.render(<ReceiptLinePreview {...value} />, host, committed);
  }
  function unmountPage(): void { ReactDom.unmountComponentAtNode(host); }
  async function render(value: IReceiptLinePreviewProps, waitForValidation = true): Promise<void> {
    // Commit the changed props and flush effect cleanup before looking for a
    // settled DOM; otherwise the preceding receipt's ready state can win.
    act(() => { renderPage(value); });
    await act(async () => {
      if (!waitForValidation || !value.active || !value.file) return;
      // FileReader completion is asynchronous and can exceed20ms under native
      // parallel Jest load. Wait for the actual ready/error transition, without
      // changing receipt validation, failure assertions or production code.
      await new Promise<void>((resolve, reject) => {
        const observer = new MutationObserver(check);
        const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Receipt validation did not settle')); }, 2000);
        function check(): void {
          if (!host.querySelector('[role="status"]')) { clearTimeout(timeout); observer.disconnect(); resolve(); }
        }
        observer.observe(host, { childList: true, subtree: true }); check();
      });
    });
  }
  function trigger(): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>('button');
    if (!button) throw new Error('Missing receipt preview button'); return button;
  }
  function open(): void { act(() => { Simulate.click(trigger()); }); }
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    let sequence = 0;
    createUrl = jest.fn(() => `blob:synthetic-preview-${++sequence}`); revokeUrl = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
    originalImage = window.Image;
    window.Image = jest.fn(() => {
      const image = document.createElement('img'); let source = '';
      Object.defineProperty(image, 'naturalWidth', { value: 10 }); Object.defineProperty(image, 'naturalHeight', { value: 10 });
      Object.defineProperty(image, 'src', { get: () => source, set: (value: string) => {
        source = value; Promise.resolve().then(() => image.dispatchEvent(new Event('load'))).catch(() => undefined);
      } });
      return image;
    }) as unknown as typeof Image;
  });
  afterEach(() => { act(unmountPage); host.remove(); window.Image = originalImage; jest.restoreAllMocks(); });

  it('screens the correct File, shows its thumbnail and supplier-specific image alternative', async () => {
    const file = photo(); const check = jest.spyOn(receiptPolicy, 'validateReceiptFile');
    await render(props(file)); expect(check).toHaveBeenCalledWith(file);
    expect(host.textContent).toContain('DEMO / UNSAVED');
    expect(host.querySelector('p[aria-label]')?.getAttribute('aria-label')).toContain('NOT saved to SharePoint');
    expect(host.textContent).toContain('synthetic-a.jpg');
    const filenameId = trigger().getAttribute('aria-describedby');
    expect(filenameId && host.querySelector(`[id="${filenameId}"]`)?.textContent).toBe('synthetic-a.jpg');
    const image = host.querySelector('img');
    expect(image?.getAttribute('alt')).toBe('Local receipt photo for Synthetic supplier A');
    expect(image?.getAttribute('src')).toBe(createUrl.mock.results[createUrl.mock.results.length - 1].value);
    expect(trigger().getAttribute('aria-label')).toContain('Synthetic supplier A');
  });
  it('shows metadata-only reference truthfully with no enabled preview or object URL', async () => {
    await render({ ...props(), fileName: 'synthetic-reference.pdf' });
    expect(host.textContent).toContain('Demo reference only — no local file to preview');
    expect(host.querySelector('button')).toBeNull(); expect(host.querySelector('iframe')).toBeNull(); expect(createUrl).not.toHaveBeenCalled();
  });
  it('handles a line without receipt metadata using Choose guidance', async () => {
    await render(props()); expect(host.textContent).toContain('Choose a photo or PDF in Expenses'); expect(host.querySelector('button')).toBeNull();
  });
  it('fails closed on an unsupported/spoofed file and exposes an accessible error', async () => {
    await render(props(new File(['<script>synthetic</script>'], 'bad.jpg', { type: 'image/jpeg' })));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('does not contain a JPEG');
    expect(host.querySelector('button')).toBeNull(); expect(host.querySelector('img')).toBeNull(); expect(createUrl).not.toHaveBeenCalled();
  });
  it('waits for a genuinely delayed validation failure instead of assuming20ms completion', async () => {
    const validate = receiptPolicy.validateReceiptFile;
    jest.spyOn(receiptPolicy, 'validateReceiptFile').mockImplementation(async file => {
      await new Promise(resolve => setTimeout(resolve, 80)); return validate(file);
    });
    await render(props(new File(['synthetic-not-jpeg'], 'bad.jpg', { type: 'image/jpeg' })));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('does not contain a JPEG');
    expect(host.querySelector('button')).toBeNull(); expect(createUrl).not.toHaveBeenCalled();
  });
  it('contains PDF in an empty sandbox, with filename/photo fallback and no raw blob links/download', async () => {
    await render(props(pdf())); expect(host.textContent).toContain('PDF'); open();
    const frame = host.querySelector('iframe'); expect(frame?.getAttribute('sandbox')).toBe(''); expect(frame?.getAttribute('tabindex')).toBe('-1');
    expect(frame?.getAttribute('title')).toContain('Synthetic supplier A');
    expect(host.textContent).toContain('choose a JPEG or PNG');
    expect(host.querySelector('a')).toBeNull(); expect(host.querySelector('[download]')).toBeNull(); expect(host.querySelector('[target]')).toBeNull();
  });
  it('enlarges the image, traps Tab/Escape and restores thumbnail focus', async () => {
    await render(props(photo())); const thumbnail = trigger(); thumbnail.focus(); open();
    const dialog = host.querySelector('[role="dialog"]'); expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(host.querySelector('img[alt^="Enlarged"]')).not.toBeNull();
    const close = dialog?.querySelector('button'); if (!close) throw new Error('Missing Close control');
    expect(document.activeElement).toBe(close);
    act(() => { Simulate.keyDown(close, { key: 'Tab' }); }); expect(document.activeElement).toBe(close);
    act(() => { Simulate.keyDown(close, { key: 'Tab', shiftKey: true }); }); expect(document.activeElement).toBe(close);
    act(() => { Simulate.keyDown(close, { key: 'Escape' }); });
    expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(thumbnail);
  });
  it('has no one-commit wrong-line image/modal leak on File or binding changes', async () => {
    const first = photo(); await render(props(first)); open();
    act(() => {
      renderPage(props(first, 'line-b'), () => {
        expect(host.querySelector('img')).toBeNull(); expect(host.querySelector('[role="dialog"]')).toBeNull();
        expect(host.textContent).toContain('Synthetic supplier B');
      });
    });
    await render(props(first, 'line-b'));
    act(() => {
      renderPage(props(photo('synthetic-b.jpg'), 'line-b'), () => {
        expect(host.querySelector('img')).toBeNull(); expect(host.textContent).toContain('synthetic-b.jpg');
      });
    });
  });
  it('revokes the owned URL on replacement, binding changes, navigation and unmount', async () => {
    const first = photo(); await render(props(first)); const firstUrl = host.querySelector('img')?.getAttribute('src');
    const second = photo('synthetic-b.jpg'); await render(props(second)); expect(revokeUrl).toHaveBeenCalledWith(firstUrl);
    const secondUrl = host.querySelector('img')?.getAttribute('src'); await render(props(second, 'line-b')); expect(revokeUrl).toHaveBeenCalledWith(secondUrl);
    const lineBUrl = host.querySelector('img')?.getAttribute('src'); await render(props(second, 'line-b', false)); expect(revokeUrl).toHaveBeenCalledWith(lineBUrl); expect(host.querySelector('img')).toBeNull();
    await render(props(second)); const finalUrl = host.querySelector('img')?.getAttribute('src'); act(unmountPage); expect(revokeUrl).toHaveBeenCalledWith(finalUrl);
  });
  it('hides an open preview synchronously on navigation before effects', async () => {
    const file = photo(); await render(props(file)); open();
    act(() => { renderPage(props(file, 'line-a', false), () => { expect(host.querySelector('img')).toBeNull(); expect(host.querySelector('[role="dialog"]')).toBeNull(); }); });
  });
  it.each(['binding', 'file', 'inactive', 'unmount'])('discards late validation after %s without creating a preview URL', async mode => {
    let finish: ((result: string | undefined) => void) | undefined;
    jest.spyOn(receiptPolicy, 'validateReceiptFile').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const first = photo(); await render(props(first), false);
    if (mode === 'unmount') act(unmountPage);
    else {
      // Replace validator so only the original outstanding validation resolves
      // later; the new context remains independently pending.
      jest.spyOn(receiptPolicy, 'validateReceiptFile').mockImplementation(() => new Promise(() => undefined));
      await render(props(mode === 'file' ? photo('synthetic-b.jpg') : first, mode === 'binding' ? 'line-b' : 'line-a', mode !== 'inactive'), false);
    }
    await act(async () => { finish?.(undefined); });
    expect(createUrl).not.toHaveBeenCalled(); expect(host.querySelector('img')).toBeNull(); expect(host.querySelector('iframe')).toBeNull();
  });
  it('catches validator failure and never enables a fake preview', async () => {
    jest.spyOn(receiptPolicy, 'validateReceiptFile').mockRejectedValue(new Error('Synthetic decode failed'));
    await render(props(photo())); expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(host.querySelector('button')).toBeNull(); expect(createUrl).not.toHaveBeenCalled();
  });
});
