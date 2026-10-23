import * as React from 'react';
import type { INominal } from '../../../domain/contracts';
import { searchNominals } from '../../../domain/expenseRules';
import styles from './KcfExpensesHub.module.scss';

export function NominalsScreen({ nominals, idPrefix }: { nominals: ReadonlyArray<INominal>; idPrefix: string }): React.ReactElement {
  const [query, setQuery] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [message, setMessage] = React.useState('Search or copy an approved reference. Current tenant equality is unverified.');
  const matches = searchNominals(nominals, query);
  const pageCount = Math.max(1, Math.ceil(matches.length / 10));
  const currentPage = Math.min(page, pageCount - 1);
  const pagingRoot = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    // Paging can move the retained focused button beneath the sticky phone bar.
    if (focused && pagingRoot.current?.contains(focused) && focused.closest('[role="group"]')) {
      focused.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [currentPage]);
  function paging(): React.ReactElement {
    return <div className={styles.paging} role="group" aria-label="Reference pages">
      <button type="button" className={styles.secondaryButton} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous references</button>
      <span role="status">Page {currentPage + 1} of {pageCount}</span>
      <button type="button" className={styles.secondaryButton} disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next references</button>
    </div>;
  }
  async function copy(nominal: INominal): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable. Select the code and description to copy manually.');
      await navigator.clipboard.writeText(`${nominal.code} — ${nominal.description}`);
      setMessage(`Copied reference ${nominal.code}. No SharePoint operation.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Copy failed. Select the text manually.'); }
  }
  return <section ref={pagingRoot} className={styles.directory} aria-label="Nominal reference directory">
    <div className={styles.directoryHeader}>
      <p>All 195 approved reference codes. Reimbursement eligibility and current TEST content await verification.</p>
      <label htmlFor={`${idPrefix}-directory-search`}>Search code, description or alias</label>
      <input id={`${idPrefix}-directory-search`} type="search" placeholder="Try 20600, Schools or LT" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
      <p role="status">{matches.length} of {nominals.length} reference codes</p>
      <p aria-live="polite">{message}</p>
    </div>
    {paging()}
    <ul className={styles.directoryList} tabIndex={0} aria-label="Approved nominal references">
      {matches.slice(currentPage * 10, (currentPage + 1) * 10).map(nominal => <li key={nominal.code}><strong>{nominal.code}</strong><span>{nominal.description}</span>{nominal.travel && <small>Travel reference</small>}<button type="button" className={styles.secondaryButton} aria-label={`Copy nominal ${nominal.code}`} onClick={() => { copy(nominal).catch(error => setMessage(String(error))); }}>Copy reference</button></li>)}
      {!matches.length && <li>No matching reference codes. Try a shorter search.</li>}
    </ul>
    {paging()}
  </section>;
}
