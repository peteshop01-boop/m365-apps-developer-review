import * as React from 'react';
import type { IMyTeamPageProps } from './PageContracts';
import { formatMoney } from '../../../domain/expenseRules';
import styles from './TeamManager.module.scss';

export function MyTeamScreen({ claims, idPrefix, onOpen }: IMyTeamPageProps): React.ReactElement {
  const [search, setSearch] = React.useState('');
  const [month, setMonth] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const months = Array.from(new Set(claims.map(claim => claim.month))).sort().reverse();
  const monthClaims = claims.filter(claim => month === 'all' || claim.month === month);
  const visible = monthClaims.filter(claim => (status === 'all' || claim.status === status) &&
    `${claim.employeeName} ${claim.managerName}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice().sort((a, b) => a.employeeName.localeCompare(b.employeeName) || b.month.localeCompare(a.month));
  return <section className={styles.workspace} aria-label="My Team synthetic roster">
    <div className={styles.notice}><strong>DEMO / NO SHAREPOINT SAVE</strong><span>Synthetic colleagues only. These filters grant no team access or account role.</span></div>
    <div className={styles.toolbar}><h2>My Team</h2><div className={styles.filters}>
      <label htmlFor={`${idPrefix}-team-search`}>Find colleague<input id={`${idPrefix}-team-search`} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name or manager" /></label>
      <label htmlFor={`${idPrefix}-team-month`}>Claim month<select id={`${idPrefix}-team-month`} value={month} onChange={event => setMonth(event.target.value)}><option value="all">All demo months</option>{months.map(value => <option key={value} value={value}>{value.slice(5, 7)}-{value.slice(0, 4)}</option>)}</select></label>
      <label htmlFor={`${idPrefix}-team-status`}>Claim status<select id={`${idPrefix}-team-status`} value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{(['Draft', 'Submitted', 'Approved', 'Needs Changes'] as const).map(value => <option key={value}>{value}</option>)}</select></label>
    </div><div className={styles.counts} aria-label="Counts in selected demo month">{(['Draft', 'Submitted', 'Approved', 'Needs Changes'] as const).map(value => <div key={value}><strong>{monthClaims.filter(claim => claim.status === value).length}</strong><span>{value}</span></div>)}</div></div>
    <div className={styles.roster} aria-label="Synthetic team claims">
      {visible.map(claim => {
        const expenses = claim.lines.filter(line => line.kind === 'Expense').reduce((sum, line) => sum + line.amountPence, 0);
        const mileage = claim.lines.filter(line => line.kind === 'Mileage').reduce((sum, line) => sum + line.amountPence, 0);
        return <article className={styles.claimCard} key={claim.id}><div className={styles.cardHeading}><div><h3>{claim.employeeName}</h3><p>Manager: {claim.managerName}</p></div><span className={styles.status}>{claim.status}</span></div><p>Claim month {claim.month.slice(5, 7)}-{claim.month.slice(0, 4)} · {claim.lines.length} demo lines</p><dl className={styles.totals}><div><dt>Expenses</dt><dd>{formatMoney(expenses)}</dd></div><div><dt>Mileage</dt><dd>{formatMoney(mileage)}</dd></div><div><dt>Grand Total</dt><dd>{formatMoney(expenses + mileage)}</dd></div></dl>{claim.selfApproval && <p className={styles.warning}>Self-approval exception · Finance {claim.financeAcknowledged ? 'acknowledged in demo' : 'acknowledgement pending'}</p>}<button type="button" className={styles.primary} onClick={() => onOpen(claim.id)} aria-label={`Review demo claim for ${claim.employeeName}`}>Open demo review</button></article>;
      })}
      {!visible.length && <p className={styles.empty} role="status">No synthetic colleagues match these filters. Try another month or search.</p>}
    </div>
  </section>;
}
