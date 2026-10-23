import * as React from 'react';
import type { IReviewClaimPageProps } from './PageContracts';
import { formatMoney, formatUkDate, totalPence } from '../../../domain/expenseRules';
import { mileageTotal } from '../../../domain/mileage';
import styles from './HomeReview.module.scss';

export function ReviewClaimScreen({ expenses, journeys, idPrefix, claimMonth }: IReviewClaimPageProps): React.ReactElement {
  const [message, setMessage] = React.useState('Review every synthetic line before any future submission.');
  const [receiptId, setReceiptId] = React.useState<string | undefined>();
  const expenseTotal = totalPence(expenses);
  const travelTotal = mileageTotal(journeys);
  const [year, month] = claimMonth ? claimMonth.split('-').map(Number) : [];
  const due = month ? `10-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-${month === 12 ? year + 1 : year}` : undefined;
  const orderedExpenses = expenses.slice().sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.sequence - b.sequence || a.id.localeCompare(b.id));
  const orderedJourneys = journeys.slice().sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.sequence - b.sequence || a.id.localeCompare(b.id));

  function checkDemo(): void {
    if (!expenses.length && !journeys.length) {
      setMessage('Add a demo expense or mileage journey before checking this claim.');
    } else if (expenses.some(line => line.receipt.kind === 'no-receipt' && !line.receipt.reason.trim())) {
      setMessage('Demo check: a no-receipt reason is missing. Correct that expense before continuing.');
    } else {
      setMessage(`Demo check: ${expenses.length} expense line(s) and ${journeys.length} mileage line(s), total ${formatMoney(expenseTotal + travelTotal)}. This is not server validation; nothing was submitted or saved to SharePoint.`);
    }
  }

  return <section className={styles.reviewWorkspace} aria-labelledby={`${idPrefix}-review-title`}>
    <div className={styles.notice}><strong>DEMO / UNSAVED</strong><span>No SharePoint Save or submission. Receipt names are metadata only.</span></div>
    <div className={styles.reviewToolbar}>
      <div><h2 id={`${idPrefix}-review-title`}>Claim details</h2><p>Oldest first within each list · dates dd-mm-yyyy</p>{due && <p>Demo due date {due} · authoritative configuration not connected</p>}</div>
      <button type="button" className={styles.secondaryButton} onClick={checkDemo}>Check demo claim</button>
      <p className={styles.feedback} role="status">{message}</p>
    </div>
    <div className={styles.reviewColumns}>
      <section className={styles.expensePanel} aria-labelledby={`${idPrefix}-review-expenses`}>
        <div className={styles.panelHeader}><h3 id={`${idPrefix}-review-expenses`}>Expenses</h3><strong>{formatMoney(expenseTotal)}</strong></div>
        <ul className={styles.lineList} aria-label="Expenses oldest first" tabIndex={0}>
          {orderedExpenses.map(line => <li key={line.id} data-expense-id={line.id}>
            <div className={styles.lineHeading}><strong>{line.supplier}</strong><strong>{formatMoney(line.amountPence)}</strong></div>
            <p className={styles.lineMeta}>{formatUkDate(line.dateIso)} · {line.nominalCode}</p>
            <p>{line.nominalDescription}</p><p>{line.description}</p>
            {line.receipt.kind === 'no-receipt' ? <p className={styles.receiptReason}><strong>No receipt · reason:</strong> {line.receipt.reason || 'Missing reason'}</p>
              : <><button type="button" className={styles.receiptButton} aria-expanded={receiptId === line.id} aria-controls={`${idPrefix}-receipt-${line.id}`} onClick={() => setReceiptId(receiptId === line.id ? undefined : line.id)}>Receipt metadata: {line.receipt.fileName}</button>
                <p id={`${idPrefix}-receipt-${line.id}`} hidden={receiptId !== line.id}>DEMO filename only: {line.receipt.fileName}. No attachment was uploaded, opened or persisted.</p></>}
            {line.notes && <p className={styles.smallText}><strong>Notes:</strong> {line.notes}</p>}
          </li>)}
          {!expenses.length && <li className={styles.empty}>No demo expenses yet. Add a fictional line from Expenses.</li>}
        </ul>
      </section>
      <section className={styles.mileagePanel} aria-labelledby={`${idPrefix}-review-mileage`}>
        <div className={styles.panelHeader}><h3 id={`${idPrefix}-review-mileage`}>Mileage</h3><strong>{formatMoney(travelTotal)}</strong></div>
        <ul className={styles.lineList} aria-label="Mileage oldest first" tabIndex={0}>
          {orderedJourneys.map(line => <li key={line.id} data-journey-id={line.id}>
            <div className={styles.lineHeading}><strong>{line.from} → {line.to}</strong><strong>{formatMoney(line.amountPence)}</strong></div>
            <p className={styles.lineMeta}>{formatUkDate(line.dateIso)} · <strong>{line.returnJourney ? 'Return' : 'One-way'}</strong></p>
            <p>{line.programme} · {line.nominalCode} · {line.nominalDescription}</p>
            <p>Outward {line.outwardMiles} miles{line.returnJourney ? ` · reverse ${line.returnMiles} miles` : ''}</p>
            <p>{line.payableMiles} whole miles × {line.ratePence}p illustrative rate</p><p>{line.purpose}</p>
          </li>)}
          {!journeys.length && <li className={styles.empty}>No demo mileage yet. Add a manual journey from Mileage.</li>}
        </ul>
      </section>
      <aside className={styles.grandTotalBox} aria-label="Review grand total"><span>Grand total</span><strong>{formatMoney(expenseTotal + travelTotal)}</strong></aside>
    </div>
  </section>;
}
