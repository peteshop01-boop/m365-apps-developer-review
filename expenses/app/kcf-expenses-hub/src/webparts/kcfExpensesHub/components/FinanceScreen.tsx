import * as React from 'react';
import type { IDemoStaffClaim, IFinancePageProps } from './PageContracts';
import { reviewReadiness } from '../../../domain/demoReview';
import { formatMoney, formatUkDate, searchNominals } from '../../../domain/expenseRules';
import styles from './Finance.module.scss';

interface ICorrection { claimId: string; lineId: string; oldCode: string; oldName: string; newCode: string; newName: string; reason: string; actor: string; at: string; }
const payrollHeaders = ['Claim reference', 'Synthetic employee', 'Synthetic manager', 'Claim month', 'Financial year', 'Claim status', 'Expenses GBP', 'Mileage GBP', 'Total GBP', 'Approved lines', 'Queried lines', 'Pending lines', 'Self-approval flag', 'Finance acknowledgement', 'Nominal corrections', 'Demo readiness'];
function demoTime(iso: string): string { return `${formatUkDate(iso.slice(0, 10))} ${iso.slice(11, 19)} UTC (browser clock)`; }
function fiscalYear(month: string): string { const year = Number(month.slice(0, 4)); const start = Number(month.slice(5, 7)) >= 11 ? year : year - 1; return `${start}–${String(start + 1).slice(-2)}`; }
function totals(claim: IDemoStaffClaim): { expenses: number; mileage: number; grand: number } {
  const expenses = claim.lines.filter(line => line.kind === 'Expense').reduce((sum, line) => sum + line.amountPence, 0);
  const mileage = claim.lines.filter(line => line.kind === 'Mileage').reduce((sum, line) => sum + line.amountPence, 0);
  return { expenses, mileage, grand: expenses + mileage };
}

/** Session-only illustration: no role enforcement, SharePoint writes or payroll export. */
export function FinanceScreen({ claims, decisions, nominals, idPrefix, onFinanceAcknowledgement }: IFinancePageProps): React.ReactElement {
  const [queuePage, setQueuePage] = React.useState(0);
  const [search, setSearch] = React.useState(''); const [month, setMonth] = React.useState('all'); const [year, setYear] = React.useState('all');
  const [claimId, setClaimId] = React.useState(''); const [lineId, setLineId] = React.useState('');
  const [nominalQuery, setNominalQuery] = React.useState(''); const [newCode, setNewCode] = React.useState(''); const [reason, setReason] = React.useState('');
  const [acceptanceReason, setAcceptanceReason] = React.useState(''); const [audit, setAudit] = React.useState<ReadonlyArray<ICorrection>>([]);
  const [exceptionAudit, setExceptionAudit] = React.useState<ReadonlyArray<string>>([]);
  const [preview, setPreview] = React.useState(false); const [chaser, setChaser] = React.useState(false);
  const [message, setMessage] = React.useState('Demo workspace ready. Changes remain unsaved and reset on reload.'); const [error, setError] = React.useState(false);
  const months = Array.from(new Set(claims.map(claim => claim.month))).sort().reverse();
  const years = Array.from(new Set(claims.map(claim => fiscalYear(claim.month)))).sort().reverse();
  const visible = claims.filter(claim => (month === 'all' || claim.month === month) && (year === 'all' || fiscalYear(claim.month) === year) && `${claim.employeeName} ${claim.managerName}`.toLowerCase().includes(search.trim().toLowerCase())).slice().sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const queuePageCount = Math.max(1, Math.ceil(visible.length / 4));
  const currentQueuePage = Math.min(queuePage, queuePageCount - 1);
  const pagingRoot = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    const focused = document.activeElement as HTMLElement | null;
    // Paging can move the retained focused button beneath the sticky phone bar.
    if (focused && pagingRoot.current?.contains(focused) && focused.closest('[role="group"]')) {
      focused.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
  }, [currentQueuePage]);
  function paging(): React.ReactElement {
    return <div className={styles.paging} role="group" aria-label="Staff queue pages">
      <button type="button" disabled={currentQueuePage === 0} onClick={() => setQueuePage(currentQueuePage - 1)}>Previous staff</button>
      <span role="status">Page {currentQueuePage + 1} of {queuePageCount}</span>
      <button type="button" disabled={currentQueuePage + 1 >= queuePageCount} onClick={() => setQueuePage(currentQueuePage + 1)}>Next staff</button>
    </div>;
  }
  const claim = visible.find(item => item.id === claimId) || visible[0]; const line = claim?.lines.find(item => item.id === lineId) || claim?.lines[0];
  const corrections = claim && line ? audit.filter(item => item.claimId === claim.id && item.lineId === line.id) : [];
  const latest = corrections[corrections.length - 1]; const currentCode = latest?.newCode || line?.nominalCode || '';
  const currentName = latest?.newName || nominals.find(item => item.code === currentCode)?.description || 'Reference name unavailable';
  const count = (status: IDemoStaffClaim['status']): number => visible.filter(item => item.status === status).length;
  const value = (status: IDemoStaffClaim['status']): number => visible.filter(item => item.status === status).reduce((sum, item) => sum + totals(item).grand, 0);
  const readiness = claim ? reviewReadiness(claim.lines, decisions) : undefined;
  function notify(text: string, failed: boolean = false): void { setMessage(text); setError(failed); }
  function openClaim(id: string): void { setClaimId(id); setLineId(''); setNewCode(''); setReason(''); setAcceptanceReason(''); setChaser(false); }
  function changeLine(id: string): void { setLineId(id); setNewCode(''); setReason(''); }
  function correct(): void {
    if (!claim || !line) return;
    const replacement = nominals.find(item => item.code === newCode);
    if (!replacement || replacement.code === currentCode || !reason.trim()) { notify('Choose a different exact nominal and enter a written correction reason. No change applied.', true); return; }
    setAudit(previous => [...previous, { claimId: claim.id, lineId: line.id, oldCode: currentCode, oldName: currentName, newCode: replacement.code, newName: replacement.description, reason: reason.trim(), actor: 'Synthetic Finance actor', at: new Date().toISOString() }]);
    setNewCode(''); setReason(''); notify('Nominal correction recorded in local demo history only. Amount and SharePoint record unchanged. Posting eligibility is unverified.');
  }
  function acknowledge(accepted: boolean): void {
    if (!claim || !claim.selfApproval) return;
    if (!acceptanceReason.trim()) { notify('Enter a written Finance exception reason before changing the demo acknowledgement.', true); return; }
    onFinanceAcknowledgement(claim.id, accepted);
    setExceptionAudit(previous => [...previous, `${claim.employeeName}: ${accepted ? 'accepted' : 'withdrawn'} · ${acceptanceReason.trim()} · Synthetic Finance actor · ${demoTime(new Date().toISOString())}`]);
    setAcceptanceReason(''); notify('Finance exception acknowledgement changed in the demo only. No approval, authority or payment is created.');
  }
  function readinessText(item: IDemoStaffClaim): string {
    const result = reviewReadiness(item.lines, decisions);
    if (!result.complete) return 'Blocked: pending or queried lines';
    if (item.selfApproval && !item.financeAcknowledged) return 'Blocked: Finance exception acceptance';
    return 'Demo checks complete; export unavailable';
  }
  return <section className={`${styles.workspace} ${preview ? styles.previewOpen : ''}`} aria-label="Finance demo workspace">
    <div className={styles.banner}><strong>DEMO / UNSAVED — NO SHAREPOINT SAVE</strong><span>Synthetic colleagues only. Visible Finance controls grant no permissions. No payroll file or chaser is sent.</span></div>
    <div className={styles.filters}><label htmlFor={`${idPrefix}-finance-search`}>Employee / manager<input id={`${idPrefix}-finance-search`} type="search" value={search} onChange={event => { setSearch(event.target.value); setQueuePage(0); }} placeholder="Search synthetic colleagues" /></label>
      <label htmlFor={`${idPrefix}-finance-month`}>Claim month<select id={`${idPrefix}-finance-month`} value={month} onChange={event => { setMonth(event.target.value); setQueuePage(0); }}><option value="all">All months</option>{months.map(item => <option key={item} value={item}>{item.slice(5, 7)}-{item.slice(0, 4)}</option>)}</select></label>
      <label htmlFor={`${idPrefix}-finance-year`}>Financial year (Nov–Oct)<select id={`${idPrefix}-finance-year`} value={year} onChange={event => { setYear(event.target.value); setQueuePage(0); }}><option value="all">All financial years</option>{years.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
      <button type="button" onClick={() => setPreview(previous => !previous)} aria-expanded={preview}>{preview ? 'Close payroll preview' : 'Payroll preview'}</button></div>
    <div className={styles.summary}>{(['Draft', 'Submitted', 'Approved', 'Needs Changes'] as const).map(status => <div key={status}><span>{status}</span><strong>{count(status)} · {formatMoney(value(status))}</strong></div>)}</div>
    <div className={styles.columns}><section ref={pagingRoot} className={styles.queue} aria-label="Alphabetical synthetic staff queue"><h2>Staff queue <span>{visible.length} claims</span></h2>
      {!visible.length && <p>No synthetic claims match these filters.</p>}
      {paging()}
      {visible.slice(currentQueuePage * 4, (currentQueuePage + 1) * 4).map(item => { const sum = totals(item); return <button type="button" className={`${styles.claimCard} ${claim?.id === item.id ? styles.selected : ''}`} key={item.id} aria-pressed={claim?.id === item.id} onClick={() => openClaim(item.id)}><strong>{item.employeeName}</strong><span>{item.managerName} · {item.month.slice(5, 7)}-{item.month.slice(0, 4)}</span><span className={styles.status}>{item.status}{item.selfApproval ? ' · Self-approval exception' : ''}</span><span>Expenses {formatMoney(sum.expenses)} · Mileage {formatMoney(sum.mileage)}</span><strong>Total {formatMoney(sum.grand)}</strong></button>; })}
      {paging()}
    </section><section className={styles.detail} aria-label="Synthetic Finance claim detail">
      {claim ? <><h2>{claim.employeeName}</h2><p>{claim.managerName} · {claim.status} · FY {fiscalYear(claim.month)}</p><p className={styles.readiness}>{readinessText(claim)}</p><p>Line review: {readiness?.approved} approved · {readiness?.queried} queried · {readiness?.pending} pending (demo).</p>
        <label htmlFor={`${idPrefix}-finance-line`}>Claim line<select id={`${idPrefix}-finance-line`} value={line?.id || ''} onChange={event => changeLine(event.target.value)}>{claim.lines.map(item => <option key={item.id} value={item.id}>{item.kind} · {item.title}</option>)}</select></label>
        {line ? <><p><strong>{line.kind} · {formatUkDate(line.dateIso)}</strong></p><h3>{line.title}</h3><p>{line.detail}</p><p className={styles.amount}>{formatMoney(line.amountPence)}</p><p>Nominal <strong>{currentCode} — {currentName}</strong>{latest && <span className={styles.changed}> · CHANGED IN DEMO</span>}</p>
          <details className={styles.receipt}><summary>Receipt / journey detail</summary><p>{line.kind === 'Expense' ? 'Receipt metadata and bodies are not provided by this synthetic claim contract. No real receipt is available to open.' : 'Journey detail is the synthetic description above. No routing service has been called.'}</p></details>
          <fieldset className={styles.correction}><legend>Correct nominal · local demo only</legend><label htmlFor={`${idPrefix}-finance-nominal-search`}>Search code, description or LT<input id={`${idPrefix}-finance-nominal-search`} type="search" value={nominalQuery} onChange={event => setNominalQuery(event.target.value)} /></label>
            <label htmlFor={`${idPrefix}-finance-nominal`}>New nominal<select id={`${idPrefix}-finance-nominal`} value={newCode} onChange={event => setNewCode(event.target.value)}><option value="">Choose exact reference</option>{searchNominals(nominals, nominalQuery).map(item => <option key={item.code} value={item.code}>{item.code} — {item.description}</option>)}</select></label>
            <label htmlFor={`${idPrefix}-finance-reason`}>Written correction reason<textarea id={`${idPrefix}-finance-reason`} rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label><button type="button" onClick={correct}>Record demo correction</button></fieldset>
          <details className={styles.history} open={corrections.length > 0}><summary>Local nominal audit ({corrections.length})</summary>{!corrections.length && <p>No demo corrections for this line.</p>}{corrections.map((item, index) => <div key={`${item.at}-${index}`}><strong>{item.oldCode} — {item.oldName} → {item.newCode} — {item.newName}</strong><p>{item.reason}</p><p>{item.actor} · {demoTime(item.at)} · session only</p></div>)}</details></> : <p>No line detail in this synthetic claim.</p>}
        {claim.selfApproval && <fieldset className={styles.exception}><legend>Self-approval · Finance exception</legend><p>{claim.financeAcknowledged ? 'Finance acceptance flag set in demo.' : 'Acceptance missing: payroll readiness is blocked.'} This is not trusted authorisation.</p><label htmlFor={`${idPrefix}-finance-exception-reason`}>Finance exception reason<textarea id={`${idPrefix}-finance-exception-reason`} rows={2} value={acceptanceReason} onChange={event => setAcceptanceReason(event.target.value)} /></label><div className={styles.actions}><button type="button" onClick={() => acknowledge(true)}>Accept exception in demo</button><button type="button" onClick={() => acknowledge(false)}>Withdraw demo acceptance</button></div></fieldset>}
        <button type="button" className={styles.secondary} onClick={() => setChaser(previous => !previous)} aria-expanded={chaser}>Preview chaser text · no SEND</button>{chaser && <div className={styles.chaser}><strong>TEXT PREVIEW ONLY — no recipient or SEND operation</strong><p>Please review your synthetic {claim.month.slice(5, 7)}-{claim.month.slice(0, 4)} claim. Current demo status: {claim.status}.</p></div>}
        {!!exceptionAudit.length && <details className={styles.history}><summary>Local Finance exception audit</summary>{exceptionAudit.map((item, index) => <p key={index}>{item}</p>)}</details>}
      </> : <p>Choose a synthetic claim to inspect its lines.</p>}
    </section></div>
    {preview && <section className={styles.payroll} aria-label="Illustrative payroll preview"><h2>16-column payroll preview</h2><p className={styles.banner}><strong>ILLUSTRATIVE HEADER CONTRACT — awaiting Finance approval. PREVIEW ONLY; no file/export/payment.</strong></p><p>Only filtered synthetic claims appear. Demo readiness never releases payroll. Amount adjustments are unavailable pending approved policy.</p><div className={styles.tableScroll} tabIndex={0} aria-label="Scrollable illustrative payroll table"><table><caption>Unapproved example columns — not the production payroll contract</caption><thead><tr>{payrollHeaders.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{visible.map(item => { const sum = totals(item); const result = reviewReadiness(item.lines, decisions); const row = [item.id, item.employeeName, item.managerName, `${item.month.slice(5, 7)}-${item.month.slice(0, 4)}`, fiscalYear(item.month), item.status, formatMoney(sum.expenses), formatMoney(sum.mileage), formatMoney(sum.grand), result.approved, result.queried, result.pending, item.selfApproval ? 'Yes' : 'No', item.financeAcknowledged ? 'Demo accepted' : 'Not accepted', audit.filter(entry => entry.claimId === item.id).length, readinessText(item)]; return <tr key={item.id}>{row.map((cell, index) => <td key={index} data-label={payrollHeaders[index]}>{cell}</td>)}</tr>; })}</tbody></table></div></section>}
    <p className={error ? styles.error : styles.notice} role="status" aria-live="polite">{message}</p>
  </section>;
}
