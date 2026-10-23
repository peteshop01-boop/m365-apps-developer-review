import * as React from 'react';
import type { IImpactHelpContent } from '../services/ImpactFieldHelpContent';
import styles from './IntegratedPerformanceHub.module.scss';

export const ImpactFieldHelp: React.FC<{ id: string; label: string; content: IImpactHelpContent }> = ({ id, label, content }) => {
  const [open, setOpen] = React.useState(false);
  const button = React.useRef<HTMLButtonElement>(null);
  const region = React.useRef<HTMLDivElement>(null);
  const close = (): void => { setOpen(false); button.current?.focus(); };
  React.useEffect(() => {
    if (!open) return undefined;
    // Escape belongs to this field/help, never to another editor or application.
    const parent = region.current?.parentElement;
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); button.current?.focus(); }
    };
    parent?.addEventListener('keydown', keydown);
    return () => parent?.removeEventListener('keydown', keydown);
  }, [open]);
  return <div className={styles.impactHelp} ref={region}>
    <button ref={button} type="button" aria-expanded={open} aria-controls={id} aria-label={`Help: ${label}`} onClick={() => { if (open) close(); else setOpen(true); }}>Help</button>
    {open && <section id={id} role="region" aria-label={`${label} help`} className={styles.impactHelpBody}>
      <p>{content.purpose}</p><p><strong>Example: </strong>{content.example}</p><p><strong>Avoid: </strong>{content.mistake}</p>
      {content.templates && <ul>{content.templates.map(template => <li key={template}>{template}</li>)}</ul>}
      <button type="button" onClick={close} aria-label={`Close help: ${label}`}>Close</button>
    </section>}
  </div>;
};
