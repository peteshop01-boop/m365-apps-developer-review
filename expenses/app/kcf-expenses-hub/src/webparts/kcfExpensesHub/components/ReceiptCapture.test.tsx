import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { ReceiptCapture } from './ReceiptCapture';
import type { INewReceiptValue } from './ReceiptCapture';
import * as receiptPolicy from './receiptValidation';

// jsdom verifies controls/lifecycles only, not a physical camera or native picker.
describe('ReceiptCapture synthetic controls', () => {
  let host: HTMLDivElement;
  let change: jest.Mock;
  let acquire: jest.Mock;
  let enumerate: jest.Mock;
  let revoke: jest.Mock;
  let pending: jest.Mock;
  let originalImage: typeof Image;
  const photo = (): File => new File([new Uint8Array([255, 216, 255, 224, 1, 2])], 'synthetic.jpg', { type: 'image/jpeg' });
  const media = (): { stream: MediaStream; stop: jest.Mock } => {
    const stop = jest.fn(); return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
  };
  function button(label: string): HTMLButtonElement {
    const found = Array.from(host.querySelectorAll('button')).find(item => item.textContent === label);
    if (!found) throw new Error(`Missing receipt button: ${label}`); return found;
  }
  function renderPage(value: INewReceiptValue, key: string, active: boolean): void {
    ReactDom.render(<ReceiptCapture value={value} onChange={change} onPendingChange={pending} idPrefix="receipt-test" bindingKey={key} active={active} />, host);
  }
  function unmountPage(): void { ReactDom.unmountComponentAtNode(host); }
  async function render(value: INewReceiptValue = { kind: 'none' }, key = 'line-a', active = true): Promise<void> {
    await act(async () => { renderPage(value, key, active); });
  }
  async function click(label: string): Promise<void> { await act(async () => { Simulate.click(button(label)); }); }
  async function select(file: File, waitForValidation = true): Promise<void> {
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Choose receipt photo or PDF"]');
    if (!input) throw new Error('Missing file input');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    act(() => { Simulate.change(input); });
    if (waitForValidation) await settledSelection();
  }
  async function settledSelection(): Promise<void> {
    await act(async () => {
      await new Promise<void>((resolve, reject) => {
        const observer = new MutationObserver(check);
        const timeout = setTimeout(() => { observer.disconnect(); reject(new Error('Receipt selection did not settle')); }, 2000);
        function check(): void {
          if (!host.querySelector('[role="status"]')) { clearTimeout(timeout); observer.disconnect(); resolve(); }
        }
        observer.observe(host, { childList: true, subtree: true }); check();
      });
    });
  }
  beforeEach(() => {
    host = document.createElement('div'); document.body.appendChild(host);
    change = jest.fn(); pending = jest.fn(); acquire = jest.fn(); enumerate = jest.fn(async () => [{ kind: 'videoinput' }]); revoke = jest.fn();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: acquire, enumerateDevices: enumerate } });
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn(() => ({ matches: false })) });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: jest.fn(() => 'blob:synthetic-receipt') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    originalImage = window.Image;
    window.Image = jest.fn(() => {
      const image = document.createElement('img');
      Object.defineProperty(image, 'naturalWidth', { value: 10 }); Object.defineProperty(image, 'naturalHeight', { value: 10 });
      Object.defineProperty(image, 'src', { get: () => 'blob:synthetic-receipt', set: () => { Promise.resolve().then(() => image.dispatchEvent(new Event('load'))).catch(() => undefined); } });
      return image;
    }) as unknown as typeof Image;
    jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });
  afterEach(() => { act(unmountPage); host.remove(); window.Image = originalImage; jest.restoreAllMocks(); });

  it('shows three initial actions, capture environment and truthful unsaved notice without requesting permission', async () => {
    await render(); button('Take photo'); button('Choose photo/PDF'); button('No receipt available'); button('Use camera');
    expect(host.textContent).toContain('NOT yet saved to SharePoint');
    expect(host.querySelector('input[capture]')?.getAttribute('capture')).toBe('environment');
    expect(acquire).not.toHaveBeenCalled();
  });
  it('hides webcam action when absent; photo/PDF chooser remains available', async () => {
    enumerate.mockResolvedValue([]); await render();
    expect(host.textContent).not.toContain('Use camera'); button('Choose photo/PDF');
    expect(host.textContent).toContain('No usable webcam');
  });
  it('handles permission denial and keeps fallback, without a fake enabled webcam action', async () => {
    acquire.mockRejectedValue(new Error('NotAllowedError')); await render(); await click('Use camera');
    expect(host.textContent).toContain('permission was denied');
    expect(host.textContent).not.toContain('Use camera'); button('Choose photo/PDF');
  });
  it('selects a validated File and rejects unsupported files without changing the receipt', async () => {
    await render(); const file = photo(); await select(file);
    expect(change).toHaveBeenCalledWith({ kind: 'file', file });
    change.mockClear(); await select(new File(['<script/>'], 'bad.jpg', { type: 'image/jpeg' }));
    expect(host.textContent).toContain('does not contain a JPEG'); expect(change).not.toHaveBeenCalled();
  });
  it('waits for delayed real validation before checking the failed selection', async () => {
    const validate = receiptPolicy.validateReceiptFile;
    jest.spyOn(receiptPolicy, 'validateReceiptFile').mockImplementation(async file => {
      await new Promise(resolve => setTimeout(resolve, 80)); return validate(file);
    });
    await render(); await select(new File(['synthetic-not-jpeg'], 'bad.jpg', { type: 'image/jpeg' }));
    expect(host.textContent).toContain('does not contain a JPEG'); expect(change).not.toHaveBeenCalled();
  });
  it('requires written No Receipt reason and reports the controlled reason', async () => {
    await render(); await click('No receipt available'); expect(change).toHaveBeenCalledWith({ kind: 'no-receipt', reason: '' });
    await render({ kind: 'no-receipt', reason: '' });
    const reason = host.querySelector('textarea'); if (!reason) throw new Error('Missing reason');
    expect(reason.required).toBe(true); expect(reason.getAttribute('aria-invalid')).toBe('true');
    act(() => { reason.value = 'Synthetic missing receipt'; Simulate.change(reason); });
    expect(change).toHaveBeenCalledWith({ kind: 'no-receipt', reason: 'Synthetic missing receipt' });
  });
  it('stops tracks on Cancel, replacement and unmount', async () => {
    const first = media(); acquire.mockResolvedValue(first.stream); await render(); await click('Use camera'); await click('Cancel camera'); expect(first.stop).toHaveBeenCalled();
    const second = media(); acquire.mockResolvedValue(second.stream); await click('Use camera'); await click('No receipt available'); expect(second.stop).toHaveBeenCalled();
    const third = media(); acquire.mockResolvedValue(third.stream); await click('Use camera');
    act(unmountPage); expect(third.stop).toHaveBeenCalled();
  });
  it.each(['navigation', 'binding'])('stops late permission completion after %s and never leaks to another line', async mode => {
    let resolveMedia: ((value: MediaStream) => void) | undefined;
    acquire.mockImplementation(() => new Promise<MediaStream>(resolve => { resolveMedia = resolve; }));
    await render(); await click('Use camera');
    await render({ kind: 'none' }, mode === 'binding' ? 'line-b' : 'line-a', mode !== 'navigation');
    const late = media(); await act(async () => { resolveMedia?.(late.stream); });
    expect(late.stop).toHaveBeenCalled(); expect(host.querySelector('video')).toBeNull(); expect(change).not.toHaveBeenCalled();
  });
  it('stops an established stream on navigation and binding change', async () => {
    const first = media(); acquire.mockResolvedValue(first.stream); await render(); await click('Use camera');
    await render({ kind: 'none' }, 'line-a', false); expect(first.stop).toHaveBeenCalled();
    const second = media(); acquire.mockResolvedValue(second.stream); await render(); await click('Use camera');
    await render({ kind: 'none' }, 'line-b'); expect(second.stop).toHaveBeenCalled();
  });
  it('cancels a pending permission request, disposing a late stream', async () => {
    let resolveMedia: ((value: MediaStream) => void) | undefined;
    acquire.mockImplementation(() => new Promise<MediaStream>(resolve => { resolveMedia = resolve; }));
    await render(); await click('Use camera'); expect(pending).toHaveBeenLastCalledWith(true); await click('Cancel camera'); expect(pending).toHaveBeenLastCalledWith(false);
    const late = media(); await act(async () => { resolveMedia?.(late.stream); }); expect(late.stop).toHaveBeenCalled();
  });
  it('frames, captures, stops tracks, accepts a checked photo and supports Retake/Cancel', async () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: jest.fn() } as unknown as CanvasRenderingContext2D);
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => callback(new Blob([new Uint8Array([255, 216, 255, 224])], { type: 'image/jpeg' })));
    const first = media(); acquire.mockResolvedValue(first.stream); await render(); await click('Use camera');
    const video = host.querySelector('video'); if (!video) throw new Error('Missing camera frame');
    Object.defineProperty(video, 'videoWidth', { value: 2000 }); Object.defineProperty(video, 'videoHeight', { value: 1200 });
    await click('Capture'); expect(first.stop).toHaveBeenCalled(); button('Retake'); button('Cancel photo');
    act(() => { Simulate.click(button('Use this photo')); }); await settledSelection();
    expect(change.mock.calls[0][0].kind).toBe('file'); expect(change.mock.calls[0][0].file.name).toBe('receipt-camera.jpg');
    acquire.mockResolvedValue(media().stream); await click('Use camera'); await click('Cancel camera'); expect(host.querySelector('video')).toBeNull();
  });
  it('does not attach a delayed canvas result to a different line', async () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: jest.fn() } as unknown as CanvasRenderingContext2D);
    let finish: BlobCallback | undefined;
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => { finish = callback; });
    const live = media(); acquire.mockResolvedValue(live.stream); await render(); await click('Use camera');
    const video = host.querySelector('video'); if (!video) throw new Error('Missing camera frame');
    Object.defineProperty(video, 'videoWidth', { value: 1000 }); Object.defineProperty(video, 'videoHeight', { value: 800 });
    await click('Capture'); await render({ kind: 'none' }, 'line-b');
    act(() => { finish?.(new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' })); });
    expect(live.stop).toHaveBeenCalled(); expect(change).not.toHaveBeenCalled(); expect(host.textContent).not.toContain('receipt-camera.jpg');
  });
  it('does not commit file validation after the controlled line changes', async () => {
    let reader: FileReader | undefined;
    jest.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (this: FileReader) { reader = this; });
    await render(); await select(photo(), false); expect(pending).toHaveBeenLastCalledWith(true); await render({ kind: 'none' }, 'line-b'); expect(pending).toHaveBeenLastCalledWith(false);
    if (!reader) throw new Error('Missing reader');
    Object.defineProperty(reader, 'result', { value: new Uint8Array([255, 216, 255]).buffer });
    await act(async () => { reader?.dispatchEvent(new Event('load')); });
    expect(change).not.toHaveBeenCalled();
  });
  it('revokes object URLs on replacement/navigation and returns focus after Escape in the viewer', async () => {
    const file = photo(); await render({ kind: 'file', file });
    const enlarge = host.querySelector<HTMLButtonElement>('[aria-label="Enlarge receipt photo"]');
    if (!enlarge) throw new Error('Missing enlarge');
    enlarge.focus(); act(() => { Simulate.click(enlarge); }); expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => { Simulate.keyDown(button('Close receipt preview'), { key: 'Escape' }); });
    expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(document.activeElement).toBe(enlarge);
    await render({ kind: 'file', file: photo() }); expect(revoke).toHaveBeenCalled();
    revoke.mockClear(); await render({ kind: 'file', file }, 'line-a', false); expect(revoke).toHaveBeenCalled();
  });
  it('keeps arbitrary selected PDFs sandboxed with a filename fallback and no raw new-tab link', async () => {
    const file = new File(['%PDF-1.4\n%%EOF'], 'synthetic.pdf', { type: 'application/pdf' });
    await render({ kind: 'file', file }); await click('View PDF');
    expect(host.querySelector('iframe')?.getAttribute('sandbox')).toBe('');
    expect(host.querySelector('a')).toBeNull();
    expect(host.textContent).toContain('keep the selected filename');
    expect(host.querySelector('img')).toBeNull();
  });
});
