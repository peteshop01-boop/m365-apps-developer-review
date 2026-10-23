import * as React from 'react';
import type { IManagerReviewPageProps } from './PageContracts';
import type { IDemoDecision } from '../../../domain/demoReview';
import { decideDemoLine, effectiveDecision, reviewReadiness } from '../../../domain/demoReview';
import { formatMoney, formatUkDate, parseUkDate } from '../../../domain/expenseRules';
import styles from './TeamManager.module.scss';

export function ManagerReviewScreen({ claim, decisions, idPrefix, onDecision, onSelfApproval }: IManagerReviewPageProps): React.ReactElement {
  const [tab, setTab] = React.useState<'Expense' | 'Mileage'>('Expense');
  const [selection, setSelection] = React.useState({ claimId: '', lineId: '', reason: '' });
  const [message, setMessage] = React.useState('Select a line to try a synthetic review decision.');
  const [alternate, setAlternate] = React.useState(false);
  const [delegationReason, setDelegationReason] = React.useState('');
  const [from, setFrom] = React.useState('');
  const [until, setUntil] = React.useState('');
  const [exception, setException] = React.useState({ claimId: '', reason: '' });
  const [audit, setAudit] = React.useState<ReadonlyArray<{ claimId: string; text: string }>>([]);
  const lines = claim.lines.filter(line => line.kind === tab).slice().sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.id.localeCompare(b.id));
  const current = lines.find(line => selection.claimId === claim.id && line.id === selection.lineId) || lines[0];
  const reason = current && selection.claimId === claim.id && current.id === selection.lineId ? selection.reason : '';
  const exceptionReason = exception.claimId === claim.id ? exception.reason : '';
  const readiness = reviewReadiness(claim.lines, decisions);
  const financeHeld = claim.selfApproval && !claim.financeAcknowledged;
  const complete = readiness.complete && !financeHeld;
  function record(text: string): void {
    setAudit(previous => [...previous, { claimId: claim.id, text }]);
    setMessage(text);
  }
  function decide(status: IDemoDecision['status']): void {
    if (!current) return;
    try {
      const decision = decideDemoLine(current, status, reason, new Date().toISOString());
      if (alternate) {
        const start = parseUkDate(from); const end = parseUkDate(until);
        if (!delegationReason.trim() || !start || !end || end < start) throw new Error('Enter a delegation reason and valid start/end dates as dd-mm-yyyy. End must follow start.');
      }
      onDecision(decision);
      record(`${formatUkDate(decision.at.slice(0, 10))} ${decision.at.slice(11, 19)} UTC: ${current.title}, version ${current.version}, ${status.toLowerCase()} by Synthetic manager${alternate ? ` acting as synthetic alternate for ${claim.managerName}; illustration dates ${from} to ${until}; reason: ${delegationReason.trim()}` : ''}. ${decision.reason || 'No query reason needed.'} UNSAVED.`);
      setSelection({ claimId: claim.id, lineId: current.id, reason: '' });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Demo decision could not be recorded.'); }
  }
  function flagException(): void {
    if (!claim.selfApproval && !exceptionReason.trim()) { setMessage('Write a reason before flagging the self-approval exception.'); return; }
    onSelfApproval(!claim.selfApproval);
    record(`Synthetic self-approval exception ${claim.selfApproval ? 'removed' : `flagged: ${exceptionReason.trim()}`}. Finance must separately acknowledge a flagged exception. UNSAVED.`);
  }
  return <section className={styles.workspace} aria-label="Manager Review synthetic claim">
    <div className={styles.notice}><strong>DEMO / NO SHAREPOINT SAVE</strong><span>Caller-selected simulation only. No real approval, delegation, payment or account permission is granted.</span></div>
    <div className={styles.toolbar}><h2>Manager Review · {claim.employeeName}</h2><p>Manager: {claim.managerName} · {claim.month.slice(5, 7)}-{claim.month.slice(0, 4)} · {claim.status}</p><div className={styles.counts} aria-label="Line review counts"><div><strong>{readiness.approved}</strong><span>Approved demo lines</span></div><div><strong>{readiness.queried}</strong><span>Queried demo lines</span></div><div><strong>{readiness.pending}</strong><span>Awaiting review</span></div></div><div className={styles.tabs} role="group" aria-label="Manager review line type">{(['Expense', 'Mileage'] as const).map(kind => <button key={kind} type="button" className={tab === kind ? styles.primary : styles.secondary} aria-pressed={tab === kind} onClick={() => { setTab(kind); setSelection({ claimId: '', lineId: '', reason: '' }); }}>{kind === 'Expense' ? 'Expenses' : 'Mileage'}</button>)}</div></div>
    <div className={styles.reviewColumns}><section className={styles.lineList} aria-label="Synthetic review lines">{lines.map(line => <button type="button" className={styles.line} key={line.id} aria-pressed={current?.id === line.id} onClick={() => setSelection({ claimId: claim.id, lineId: line.id, reason: '' })}><strong>{line.title}</strong><span>{formatUkDate(line.dateIso)} · {formatMoney(line.amountPence)}</span><span>{effectiveDecision(line, decisions)?.status || 'Awaiting review'}</span></button>)}{!lines.length && <p className={styles.empty}>No {tab.toLowerCase()} lines in this synthetic claim.</p>}</section>
      <section className={styles.detail} aria-label="Selected demo line">{current ? <><h3>{current.title}</h3><p>{formatUkDate(current.dateIso)} · {formatMoney(current.amountPence)}</p><p>{current.detail}</p><p>Nominal {current.nominalCode} · line version {current.version}</p><p><strong>{effectiveDecision(current, decisions)?.status || 'Awaiting review'}</strong></p><label htmlFor={`${idPrefix}-manager-query`}>Written query reason<textarea id={`${idPrefix}-manager-query`} rows={3} value={reason} onChange={event => setSelection({ claimId: claim.id, lineId: current.id, reason: event.target.value })} /></label><div className={styles.actions}><button type="button" className={styles.primary} onClick={() => decide('Approved')}>Approve demo line</button><button type="button" className={styles.secondary} onClick={() => decide('Queried')}>Query demo line</button></div></> : <p>Select a line.</p>}
        <details className={styles.simulation}><summary>Alternate manager simulation</summary><label className={styles.checkbox}><input type="checkbox" checked={alternate} onChange={event => setAlternate(event.target.checked)} />Use synthetic alternate manager</label><p>No actual delegated identity or expiry is enforced here. Illustration dates are not access authority.</p><label htmlFor={`${idPrefix}-delegation-reason`}>Delegation reason<input id={`${idPrefix}-delegation-reason`} value={delegationReason} onChange={event => setDelegationReason(event.target.value)} /></label><div className={styles.datePair}><label htmlFor={`${idPrefix}-delegation-from`}>From (dd-mm-yyyy)<input id={`${idPrefix}-delegation-from`} placeholder="dd-mm-yyyy" value={from} onChange={event => setFrom(event.target.value)} /></label><label htmlFor={`${idPrefix}-delegation-until`}>Until (dd-mm-yyyy)<input id={`${idPrefix}-delegation-until`} placeholder="dd-mm-yyyy" value={until} onChange={event => setUntil(event.target.value)} /></label></div></details>
        <details className={styles.simulation}><summary>Self-approval exception simulation</summary><p>No live self-approval is available. This flag holds demo completion until Finance acknowledges it.</p><label htmlFor={`${idPrefix}-exception-reason`}>Written exception reason<textarea id={`${idPrefix}-exception-reason`} value={exceptionReason} rows={2} onChange={event => setException({ claimId: claim.id, reason: event.target.value })} /></label><button type="button" className={styles.secondary} onClick={flagException}>{claim.selfApproval ? 'Remove demo self-approval flag' : 'Flag demo self-approval exception'}</button></details>
        {claim.selfApproval && <p className={styles.warning}>Self-approval exception: Finance {claim.financeAcknowledged ? 'acknowledged in this demo' : 'acknowledgement pending — completion held'}.</p>}
        <p role="status" className={styles.feedback}>{message}</p><button type="button" className={styles.primary} disabled={!complete} onClick={() => record('Demo review complete in memory. No claim status, payment or server record changed. UNSAVED.')}>Complete demo review</button><p className={styles.note}>Every line must be approved. A query retains other approvals and holds completion and payroll. A changed line version needs a new decision.</p>
        <details className={styles.simulation}><summary>Local illustration audit</summary><p>No durable server audit exists. Decisions reset when the app reloads.</p><ul>{audit.filter(entry => entry.claimId === claim.id).map((entry, index) => <li key={index}>{entry.text}</li>)}</ul></details>
      </section></div>
  </section>;
}
