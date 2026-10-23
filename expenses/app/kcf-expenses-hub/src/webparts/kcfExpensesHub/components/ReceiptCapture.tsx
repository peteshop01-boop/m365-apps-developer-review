import * as React from 'react';
import styles from './ReceiptCapture.module.scss';
import { validateReceiptFile, validateReceiptValue } from './receiptValidation';
import type { INewReceiptValue } from './receiptValidation';
export type { INewReceiptValue } from './receiptValidation';

export interface ReceiptCaptureProps {
  value: INewReceiptValue;
  onChange: (value: INewReceiptValue) => void;
  idPrefix: string;
  bindingKey: string;
  active: boolean;
  disabled?: boolean;
  onPendingChange?: (pending: boolean) => void;
}

/** Local-only receipt selection. The integrating parent owns Files in memory.
 * This component never uploads or claims receipt persistence/authorisation. */
export function ReceiptCapture({ value, onChange, idPrefix, bindingKey, active, disabled = false, onPendingChange }: ReceiptCaptureProps): React.ReactElement {
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [hasCamera, setHasCamera] = React.useState(false);
  const [stream, setStream] = React.useState<MediaStream | undefined>();
  const [cameraSelection, setCameraSelection] = React.useState<{ file: File; key: string } | undefined>();
  const [preview, setPreview] = React.useState<{ url: string; file: File; key: string } | undefined>();
  const [viewer, setViewer] = React.useState(false);
  const [cameraPending, setCameraPending] = React.useState(false);
  const picker = React.useRef<HTMLInputElement>(null);
  const mobilePicker = React.useRef<HTMLInputElement>(null);
  const video = React.useRef<HTMLVideoElement>(null);
  const dialog = React.useRef<HTMLDivElement>(null);
  const streamRef = React.useRef<MediaStream | undefined>();
  const streamBinding = React.useRef<string | undefined>();
  const generation = React.useRef(0);
  const mounted = React.useRef(false);
  const context = React.useRef({ bindingKey, active, disabled });
  context.current = { bindingKey, active, disabled };
  const cameraFile = cameraSelection?.key === bindingKey ? cameraSelection.file : undefined;
  const selectedFile = cameraFile || (value.kind === 'file' ? value.file : undefined);
  const previewUrl = preview?.file === selectedFile && preview?.key === bindingKey ? preview.url : '';
  const isPdf = selectedFile?.type === 'application/pdf';
  const mobile = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const validContext = (token: number, key: string): boolean => mounted.current && token === generation.current && context.current.bindingKey === key && context.current.active && !context.current.disabled;
  const releaseStream = (): void => { streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = undefined; streamBinding.current = undefined; };
  const stopCamera = (): void => {
    generation.current += 1; releaseStream(); setStream(undefined); setCameraPending(false); setBusy(false);
    onPendingChange?.(false);
  };

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current += 1; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = undefined; };
  }, []);
  React.useEffect(() => {
    onPendingChange?.(active && (busy || cameraPending || !!stream || !!cameraFile));
    return () => { onPendingChange?.(false); };
  }, [onPendingChange, active, busy, cameraPending, stream, cameraFile]);
  React.useEffect(() => {
    generation.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = undefined;
    setStream(undefined); setCameraPending(false); setCameraSelection(undefined); setBusy(false); setViewer(false); setError('');
  }, [bindingKey, active, disabled]);
  React.useEffect(() => {
    let current = true;
    setHasCamera(false);
    if (active && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof navigator.mediaDevices?.enumerateDevices === 'function') {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        if (current) setHasCamera(devices.some(device => device.kind === 'videoinput'));
      }).catch(() => { if (current) setHasCamera(false); });
    }
    return () => { current = false; };
  }, [active, bindingKey]);
  React.useEffect(() => {
    if (!selectedFile || !active) { setPreview(undefined); return undefined; }
    let url = '';
    try { url = URL.createObjectURL(selectedFile); setPreview({ url, file: selectedFile, key: bindingKey }); }
    catch { setPreview(undefined); setError('Preview is unavailable. The selected filename is shown below.'); }
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [selectedFile, active, bindingKey]);
  React.useEffect(() => {
    if (stream && streamBinding.current === bindingKey && video.current) {
      const token = generation.current; const key = bindingKey;
      video.current.srcObject = stream;
      video.current.muted = true;
      const play = video.current.play();
      if (play) play.catch(() => {
        if (mounted.current && token === generation.current && key === context.current.bindingKey && context.current.active) setError('Camera preview could not start. Cancel and use Choose photo/PDF.');
      });
    }
  }, [stream, bindingKey]);
  React.useEffect(() => {
    if (!viewer) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [viewer]);

  async function chooseFile(file: File): Promise<void> {
    stopCamera(); setCameraSelection(undefined); setViewer(false); setError('');
    const token = generation.current; const key = bindingKey;
    setBusy(true); onPendingChange?.(true);
    let result: string | undefined;
    try { result = await validateReceiptFile(file); } catch { result = 'This file could not be checked. Choose another photo or PDF.'; }
    if (!validContext(token, key)) return;
    setBusy(false);
    if (result) setError(result);
    else onChange({ kind: 'file', file });
  }
  function selectInput(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) chooseFile(file).catch(() => setError('Could not select this receipt. Try Choose photo/PDF.'));
  }
  async function startCamera(): Promise<void> {
    stopCamera(); setCameraSelection(undefined); setViewer(false); setError('');
    const token = generation.current; const key = bindingKey;
    if (!navigator.mediaDevices?.getUserMedia) { setError('Camera is unavailable in this browser. Use Choose photo/PDF.'); return; }
    setCameraPending(true); onPendingChange?.(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!validContext(token, key)) { media.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = media; streamBinding.current = key; setStream(media); setCameraPending(false);
    } catch {
      if (validContext(token, key)) { setCameraPending(false); setHasCamera(false); setError('Camera permission was denied or the camera is unavailable. Use Choose photo/PDF, or allow camera access in browser settings.'); }
    }
  }
  function capture(): void {
    const frame = video.current;
    if (!frame?.videoWidth || !frame.videoHeight) { setError('Wait until the camera picture appears, then Capture.'); return; }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 2048 / Math.max(frame.videoWidth, frame.videoHeight));
    canvas.width = Math.round(frame.videoWidth * scale); canvas.height = Math.round(frame.videoHeight * scale);
    const drawing = canvas.getContext('2d');
    if (!drawing) { setError('Photo capture is unavailable. Use Choose photo/PDF.'); return; }
    drawing.drawImage(frame, 0, 0, canvas.width, canvas.height);
    const token = generation.current; const key = bindingKey;
    setBusy(true); onPendingChange?.(true);
    canvas.toBlob(blob => {
      if (!validContext(token, key)) return;
      setBusy(false);
      if (!blob) { setError('Could not capture a photo. Try again or Choose photo/PDF.'); return; }
      releaseStream(); setStream(undefined);
      setCameraSelection({ file: new File([blob], 'receipt-camera.jpg', { type: 'image/jpeg' }), key });
    }, 'image/jpeg', .9);
  }
  function cancelCamera(): void { stopCamera(); setCameraSelection(undefined); setError(''); }
  function openNativeCapture(): void {
    stopCamera(); setCameraSelection(undefined);
    if (!mobile) setError('Take photo opens your browser photo chooser. If no camera option appears, choose a saved photo; Use camera is shown when a webcam is detected.');
    mobilePicker.current?.click();
  }
  function closeViewer(): void { setViewer(false); }
  function viewerKeys(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeViewer(); return; }
    if (event.key === 'Tab') {
      const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button, a[href], iframe') || []);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  const reasonError = value.kind === 'no-receipt' ? validateReceiptValue(value) : undefined;
  if (!active) return <div hidden />;
  return <section className={styles.receipt} aria-labelledby={`${idPrefix}-receipt-title`}>
    <h3 className={styles.title} id={`${idPrefix}-receipt-title`}>Receipt</h3>
    <p className={styles.demo}>DEMO — selected receipt is NOT yet saved to SharePoint</p>
    <div className={styles.actions}>
      <button type="button" className={styles.button} disabled={disabled || busy} onClick={openNativeCapture}>Take photo</button>
      <button type="button" className={styles.button} disabled={disabled || busy} onClick={() => { stopCamera(); setCameraSelection(undefined); picker.current?.click(); }}>Choose photo/PDF</button>
      <button type="button" className={styles.button} disabled={disabled} aria-pressed={value.kind === 'no-receipt'} onClick={() => { stopCamera(); setCameraSelection(undefined); setViewer(false); setError(''); onChange({ kind: 'no-receipt', reason: '' }); }}>No receipt available</button>
      {!mobile && hasCamera && <button type="button" className={`${styles.button} ${styles.primary}`} disabled={disabled || cameraPending || busy} onClick={() => { startCamera().catch(() => setError('Camera is unavailable. Use Choose photo/PDF.')); }}>Use camera</button>}
    </div>
    <input ref={mobilePicker} className={styles.hidden} type="file" accept="image/jpeg,image/png,image/heic,image/heif" capture="environment" disabled={disabled} onChange={selectInput} aria-label="Take receipt photo" />
    <input ref={picker} className={styles.hidden} type="file" accept="image/jpeg,image/png,image/heic,image/heif,application/pdf,.jpg,.jpeg,.png,.heic,.heif,.pdf" disabled={disabled} onChange={selectInput} aria-label="Choose receipt photo or PDF" />
    <p className={styles.hint}>JPEG, PNG or PDF, maximum 10 MiB. HEIC requires this browser to decode it. Mobile Take photo requests the rear camera when supported. Client checks are limited; trusted backend scanning remains required before real Save.</p>
    {!mobile && !hasCamera && <p className={styles.hint}>No usable webcam detected. Choose a saved photo or PDF instead.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {busy && <p role="status">Checking receipt…</p>}
    {cameraPending && <div className={styles.camera}><p role="status">Waiting for browser camera permission…</p><button type="button" className={styles.button} onClick={cancelCamera}>Cancel camera</button></div>}
    {stream && streamBinding.current === bindingKey && <div className={styles.camera}>
      <video ref={video} className={styles.video} autoPlay playsInline aria-label="Receipt camera preview" />
      <p className={styles.hint}>Frame the receipt so the date and amount are readable.</p>
      <div className={styles.actions}><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy || disabled} onClick={capture}>Capture</button><button type="button" className={styles.button} onClick={cancelCamera}>Cancel camera</button></div>
    </div>}
    {selectedFile && <div className={styles.preview}>
      {previewUrl && !isPdf && <button type="button" className={styles.button} onClick={() => setViewer(true)} aria-label="Enlarge receipt photo"><img src={previewUrl} className={styles.thumbnail} alt="Selected receipt preview" onError={() => setError('The browser could not preview this photo. Choose a readable JPEG or PNG.')} /></button>}
      <p className={styles.filename}>{isPdf ? 'PDF receipt: ' : 'Selected photo: '}{selectedFile.name} · {(selectedFile.size / 1024).toFixed(0)} KiB</p>
      {isPdf && previewUrl && <button type="button" className={styles.button} onClick={() => setViewer(true)}>View PDF</button>}
      {cameraFile && <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy || disabled} onClick={() => { chooseFile(cameraFile).catch(() => setError('Could not accept this photo.')); }}>Use this photo</button>
        <button type="button" className={styles.button} disabled={busy || disabled} onClick={() => { startCamera().catch(() => setError('Camera unavailable. Use Choose photo/PDF.')); }}>Retake</button>
        <button type="button" className={styles.button} onClick={cancelCamera}>Cancel photo</button>
      </div>}
    </div>}
    {value.kind === 'no-receipt' && <label className={styles.field} htmlFor={`${idPrefix}-no-receipt`}>Why is no receipt available? <span>(required)</span>
      <textarea id={`${idPrefix}-no-receipt`} data-field="receipt" className={styles.reason} value={value.reason} required disabled={disabled} maxLength={2000} aria-invalid={!!reasonError} aria-describedby={reasonError ? `${idPrefix}-reason-error` : undefined} onChange={event => onChange({ kind: 'no-receipt', reason: event.currentTarget.value })} />
      {reasonError && <span className={styles.error} id={`${idPrefix}-reason-error`}>{reasonError}</span>}
    </label>}
    {value.kind === 'none' && <p className={styles.hint}>No receipt selected. Choose a receipt or give a written no-receipt reason before saving a demo line.</p>}
    {viewer && previewUrl && <div className={styles.overlay} onKeyDown={viewerKeys}>
      <div ref={dialog} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={`${idPrefix}-viewer-title`} tabIndex={-1}>
        <button type="button" className={styles.button} onClick={closeViewer}>Close receipt preview</button>
        <h3 id={`${idPrefix}-viewer-title`} className={styles.filename}>{selectedFile?.name}</h3>
        {isPdf ? <><p className={styles.hint}>PDF preview stays sandboxed. If your browser cannot display it, keep the selected filename or choose a readable photo instead. This demo does not open receipt files outside the sandbox.</p><iframe className={styles.pdf} src={previewUrl} title="Selected receipt PDF" sandbox="" /></> : <img className={styles.largeImage} src={previewUrl} alt="Enlarged selected receipt" />}
      </div>
    </div>}
  </section>;
}
