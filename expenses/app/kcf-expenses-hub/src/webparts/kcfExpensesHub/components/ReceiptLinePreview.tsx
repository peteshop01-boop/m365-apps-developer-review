import * as React from 'react';
import { validateReceiptFile } from './receiptValidation';
import styles from './ReceiptLinePreview.module.scss';

export interface IReceiptLinePreviewProps {
  file?: File;
  fileName?: string;
  supplier: string;
  bindingKey: string;
  active: boolean;
  provenance?: 'demo' | 'readback';
}

interface ICheckedReceipt {
  file: File;
  key: string;
  url?: string;
  error?: string;
}

let nextViewerId = 0;

/** In-memory demo only. Never fetches, uploads, downloads or opens raw blob links. */
export function ReceiptLinePreview({ file, fileName, supplier, bindingKey, active, provenance = 'demo' }: IReceiptLinePreviewProps): React.ReactElement {
  const [checked, setChecked] = React.useState<ICheckedReceipt | undefined>();
  const [viewer, setViewer] = React.useState<{ file: File; key: string } | undefined>();
  const [viewerId] = React.useState(() => `receipt-line-preview-${++nextViewerId}`);
  const context = React.useRef({ file, bindingKey, active });
  const dialog = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  context.current = { file, bindingKey, active };
  // These render guards intentionally run before effects: changed line/File or
  // navigation must never show the previous receipt for even one commit.
  const current = active && file && checked && checked.file === file && checked.key === bindingKey ? checked : undefined;
  const ready = !!current?.url && !current.error;
  const viewerOpen = ready && !!viewer && viewer.file === file && viewer.key === bindingKey;
  const isPdf = file?.type === 'application/pdf';
  const name = file?.name || fileName;

  React.useEffect(() => {
    let cancelled = false;
    let ownedUrl: string | undefined;
    setChecked(undefined); setViewer(undefined);
    if (!active || !file) return undefined;
    const selected = file; const key = bindingKey;
    const isCurrent = (): boolean => !cancelled && context.current.active && context.current.file === selected && context.current.bindingKey === key;
    async function checkAndPreview(): Promise<void> {
      try {
        const error = await validateReceiptFile(selected);
        if (!isCurrent()) return;
        if (error) { setChecked({ file: selected, key, error }); return; }
        ownedUrl = URL.createObjectURL(selected);
        if (!isCurrent()) { URL.revokeObjectURL(ownedUrl); ownedUrl = undefined; return; }
        setChecked({ file: selected, key, url: ownedUrl });
      } catch {
        if (isCurrent()) setChecked({ file: selected, key, error: 'This local receipt cannot be previewed. Choose a readable JPEG, PNG or simple PDF in Expenses.' });
      }
    }
    checkAndPreview().catch(() => undefined);
    return () => { cancelled = true; if (ownedUrl) URL.revokeObjectURL(ownedUrl); };
  }, [file, bindingKey, active]);

  React.useEffect(() => {
    if (!viewerOpen) return undefined;
    const prior = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      if (prior?.isConnected) prior.focus();
      else if (trigger.current?.isConnected) trigger.current.focus();
    };
  }, [viewerOpen]);

  function keyboard(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setViewer(undefined); }
    else if (event.key === 'Tab') {
      // PDF iframe is kept out of the tab sequence; the local viewer has a
      // single Close control so both forward/reverse Tab stay in the dialog.
      event.preventDefault(); dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    }
  }
  function imageFailed(): void {
    if (current && context.current.active && context.current.file === current.file && context.current.bindingKey === current.key) {
      setViewer(undefined);
      setChecked({ file: current.file, key: current.key, error: 'This browser cannot display the photo. Choose another JPEG or PNG in Expenses.' });
    }
  }

  if (!active) return <div hidden />;
  return <section className={styles.receipt} aria-label={`${provenance === 'demo' ? 'Local demo' : 'Verified byte readback'} receipt for ${supplier}`}>
    <p className={styles.demo} aria-label={provenance === 'demo' ? 'DEMO — receipt is NOT saved to SharePoint' : 'Receipt byte readback; tenant acceptance remains open'}>{provenance === 'demo' ? 'DEMO / UNSAVED' : 'BYTE READBACK / TEST NOT ACCEPTED'}</p>
    {name && <p id={`${viewerId}-filename`} className={file ? styles.srOnly : styles.name}>{name}</p>}
    {!file && <p className={styles.guidance}>{provenance === 'readback' ? 'No verified receipt bytes available. A filename alone is not a persisted receipt preview.' : fileName ? 'Demo reference only — no local file to preview' : 'No local receipt file to preview. Choose a photo or PDF in Expenses.'}</p>}
    {file && !current && <p className={styles.guidance} role="status">Checking local receipt for {supplier}…</p>}
    {current?.error && <p className={styles.error} role="alert">{current.error}</p>}
    {ready && file && <button ref={trigger} type="button" className={styles.previewButton} aria-describedby={`${viewerId}-filename`} aria-label={isPdf ? `View local PDF receipt for ${supplier}` : `Enlarge local receipt photo for ${supplier}`} onClick={() => setViewer({ file, key: bindingKey })}>
      {isPdf ? <span className={styles.pdfIcon} aria-hidden="true">PDF</span> : <img className={styles.thumbnail} src={current?.url} alt={`Local receipt photo for ${supplier}`} onError={imageFailed} />}
      <span>{isPdf ? 'View PDF' : 'Enlarge photo'}</span>
    </button>}
    {viewerOpen && <div className={styles.overlay} onKeyDown={keyboard}>
      <div ref={dialog} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby={viewerId} tabIndex={-1}>
        <button type="button" className={styles.closeButton} onClick={() => setViewer(undefined)}>Close receipt preview</button>
        <h3 id={viewerId} className={styles.heading}>Receipt for {supplier}</h3>
        <p className={styles.demo}>{provenance === 'demo' ? 'DEMO — local memory only; NOT saved to SharePoint' : 'Verified byte readback; server authorisation and TEST acceptance remain separate gates.'}</p>
        <p className={styles.name}>{name}</p>
        {isPdf ? <>
          <p className={styles.guidance}>This PDF is contained in a sandboxed viewer. If it stays blank or your browser cannot display it, close this preview and choose a JPEG or PNG in Expenses. No download or external opening is provided.</p>
          <iframe className={styles.pdfFrame} src={current?.url} title={`Local PDF receipt for ${supplier}`} sandbox="" tabIndex={-1} />
        </> : <img className={styles.largeImage} src={current?.url} alt={`Enlarged local receipt photo for ${supplier}`} onError={imageFailed} />}
      </div>
    </div>}
  </section>;
}
