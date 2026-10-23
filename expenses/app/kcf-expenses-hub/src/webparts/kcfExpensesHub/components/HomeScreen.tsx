import * as React from 'react';
import type { IHomePageProps } from './PageContracts';
import { formatMoney } from '../../../domain/expenseRules';
import styles from './HomeReview.module.scss';

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthLabel(month: string): string {
  const [year, number] = month.split('-');
  return `${monthNames[Number(number) - 1]} ${year}`;
}

function fiscalStart(month: string): number {
  const [year, number] = month.split('-').map(Number);
  return number >= 11 ? year : year - 1;
}

function monthsForYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => {
    const number = ((index + 10) % 12) + 1;
    return `${number >= 11 ? year : year + 1}-${String(number).padStart(2, '0')}`;
  });
}

function dueDate(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return `10-${String(number === 12 ? 1 : number + 1).padStart(2, '0')}-${number === 12 ? year + 1 : year}`;
}

export function HomeScreen({ claim, expenses, mileage, idPrefix, navigate }: IHomePageProps): React.ReactElement {
  const currentYear = fiscalStart(claim.month);
  const [year, setYear] = React.useState(currentYear);
  const [selectedMonth, setSelectedMonth] = React.useState(claim.month);
  const [message, setMessage] = React.useState('Choose a month to explore synthetic claim history.');
  const selectedIsCurrent = selectedMonth === claim.month;
  // Historical amounts/statuses are labelled illustrative fixtures, never fetched records.
  const selectedExpense = selectedIsCurrent ? expenses : 2450;
  const selectedMileage = selectedIsCurrent ? mileage : 1350;
  const selectedStatus = selectedIsCurrent ? claim.status : 'Submitted';

  return <section className={styles.homeWorkspace} aria-labelledby={`${idPrefix}-home-title`}>
    <div className={styles.notice}><strong>DEMO / UNSAVED</strong><span>No SharePoint Save. Use fictional details only; reload clears this session.</span></div>
    <div className={styles.homeColumns}>
      <section className={styles.currentCard} aria-labelledby={`${idPrefix}-home-title`}>
        <p className={styles.eyebrow}>YOUR CURRENT DEMO CLAIM</p>
        <h2 id={`${idPrefix}-home-title`}>{monthLabel(claim.month)}</h2>
        <div className={styles.metaRow}><span className={styles.statusBadge}>{claim.status} · demo</span><span>Illustrative due date {dueDate(claim.month)}</span></div>
        <p>Add expenses and manual journeys, then review your month. These actions open the working demo pages.</p>
        <div className={styles.summary} aria-label="Current demo claim totals">
          <div><span>Expenses</span><strong>{formatMoney(expenses)}</strong></div>
          <div><span>Mileage</span><strong>{formatMoney(mileage)}</strong></div>
          <div className={styles.summaryGrand}><span>Grand total</span><strong>{formatMoney(expenses + mileage)}</strong></div>
        </div>
        <div className={styles.primaryActions}>
          <button type="button" className={styles.primaryButton} onClick={() => navigate('expenses')}>Add Expense <span aria-hidden="true">→</span></button>
          <button type="button" className={styles.secondaryButton} onClick={() => navigate('mileage')}>Add Mileage <span aria-hidden="true">→</span></button>
          <button type="button" className={styles.secondaryButton} onClick={() => navigate('review')}>Review Claim <span aria-hidden="true">→</span></button>
        </div>
        <p className={styles.smallText}>Deadline rule: 10th of the following month. Authoritative month configuration and submission are not connected.</p>
      </section>
      <section className={styles.historyCard} aria-labelledby={`${idPrefix}-history-title`}>
        <p className={styles.eyebrow}>MY CLAIMS</p><h2 id={`${idPrefix}-history-title`}>Current &amp; previous months</h2>
        <div className={styles.selectorRow}>
          <div><label htmlFor={`${idPrefix}-fiscal-year`}>Financial year · Nov–Oct</label>
            <select id={`${idPrefix}-fiscal-year`} value={year} onChange={event => {
              const next = Number(event.target.value); setYear(next);
              setSelectedMonth(next === currentYear ? claim.month : `${next}-11`);
              setMessage('Financial year selected. Previous-month figures are synthetic examples only.');
            }}>{[currentYear, currentYear - 1].map(value => <option key={value} value={value}>Nov {value} – Oct {value + 1}</option>)}</select>
          </div>
          <div><label htmlFor={`${idPrefix}-claim-month`}>Claim month</label>
            <select id={`${idPrefix}-claim-month`} value={selectedMonth} onChange={event => {
              setSelectedMonth(event.target.value); setMessage('Month selected. Your current demo claim has not changed.');
            }}>{monthsForYear(year).filter(month => month <= claim.month).map(month => <option key={month} value={month}>{monthLabel(month)}{month === claim.month ? ' · current' : ''}</option>)}</select>
          </div>
        </div>
        <div className={styles.historyPreview}>
          <div className={styles.metaRow}><h3>{monthLabel(selectedMonth)}</h3><span className={styles.statusBadge}>{selectedStatus} · demo</span></div>
          <p>{selectedIsCurrent ? 'Live totals from this in-memory demo session.' : 'Illustrative previous claim. No historical SharePoint record is loaded.'}</p>
          <dl className={styles.historyTotals}><div><dt>Expenses</dt><dd>{formatMoney(selectedExpense)}</dd></div><div><dt>Mileage</dt><dd>{formatMoney(selectedMileage)}</dd></div><div><dt>Grand total</dt><dd>{formatMoney(selectedExpense + selectedMileage)}</dd></div></dl>
          {selectedIsCurrent ? <button type="button" className={styles.secondaryButton} onClick={() => navigate('review')}>Open current Review Claim</button>
            : <button type="button" className={styles.secondaryButton} onClick={() => setMessage(`DEMO preview: ${monthLabel(selectedMonth)} is an illustrative Submitted claim of ${formatMoney(selectedExpense + selectedMileage)}. No record was opened or changed.`)}>Inspect previous demo claim</button>}
        </div>
        <p className={styles.feedback} role="status">{message}</p>
      </section>
    </div>
  </section>;
}
