import * as React from 'react';
import styles from './PerformanceHub.module.scss';

export interface IContextualHelpProps {
  purpose: string;
  actions: string[];
  fields: string[];
  next: string;
  scoringNote?: string;
  heading?: string;
  className?: string;
  defaultOpen?: boolean;
}

const ContextualHelp: React.FC<IContextualHelpProps> = ({
  purpose, actions, fields, next, scoringNote, heading = 'How this works', className, defaultOpen = false
}) => (
  <details className={`${styles.contextHelp}${className ? ` ${className}` : ''}`} open={defaultOpen || undefined} data-contextual-help="true">
    <summary aria-label={`${heading}: guidance on purpose, actions, fields and next step`}><span aria-hidden="true">ⓘ </span>{heading}</summary>
    <div className={styles.contextHelpBody} role="group" aria-label={`${heading} guidance`}>
      <div><strong>What this page is for</strong><p>{purpose}</p></div>
      <div><strong>What you should do</strong><ul>{actions.map(action => <li key={action}>{action}</li>)}</ul></div>
      <div><strong>Important fields</strong><ul>{fields.map(field => <li key={field}>{field}</li>)}</ul></div>
      <div><strong>What happens next</strong><p>{next}</p>{scoringNote && <p><strong>How results are described: </strong>{scoringNote}</p>}</div>
    </div>
  </details>
);

export default ContextualHelp;
