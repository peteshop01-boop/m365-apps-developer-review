import * as React from 'react';
import { nominalMaster } from '../../../data/nominals';
import { formatMoney, formatUkDate, searchNominals } from '../../../domain/expenseRules';
import type { ExpenseEntryAdapter, EntryAdmission, IExpenseEntryDraft } from '../../../services/persistence/ExpenseEntryAdapter';
import type { IStoredExpense, PersistenceResult } from '../../../services/persistence/PersistenceContract';
import { MAX_EXPENSE_TEXT_CHARS } from '../../../services/persistence/PersistenceValidation';
import { ReceiptCapture } from './ReceiptCapture';
import type { INewReceiptValue } from './ReceiptCapture';
import { ReceiptLinePreview } from './ReceiptLinePreview';
import styles from './KcfExpensesHub.module.scss';

const initial: IExpenseEntryDraft = { date: '', supplier: '', description: '', nominalCode: '', amount: '', notes: '', receipt: { kind: 'none', reason: '' } };
const outcomeText = (r: PersistenceResult): string => r.state === 'ReadbackVerified'
  ? `Readback verified for expense ${r.record.line.id}. Server line and receipt bytes checked; tenant security and UAT are not certified.`
  : r.state === 'Pending' ? 'Save outcome pending. Your form and receipt are retained and locked. Check the same operation; do not create another expense.'
    : r.state === 'Held' ? 'TEST Save held. No qualified tenant writer or parent context is available. Your form is retained.'
      : 'Save or readback rejected. No success is claimed. Your form and selected receipt are retained; an attempted operation can only be checked again.';

/** Separate from demo DTOs/services. Runtime receives the held factory; source
 * tests inject a fake trusted processor. A UI flag cannot enable the writer. */
export function D01ExpenseScreen({ adapter, idPrefix, active }: { adapter: ExpenseEntryAdapter; idPrefix: string; active: boolean }): React.ReactElement {
  const [admission, setAdmission] = React.useState<EntryAdmission>();
  const [draft, setDraft] = React.useState<IExpenseEntryDraft>(initial);
  const [receipt, setReceipt] = React.useState<INewReceiptValue>({ kind: 'no-receipt', reason: '' });
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [locked, setLocked] = React.useState(adapter.hasAttempt);
  const [closed, setClosed] = React.useState(false);
  const [message, setMessage] = React.useState('Checking TEST admission. Nothing has been submitted.');
  const [record, setRecord] = React.useState<IStoredExpense>();
  const [receiptFile, setReceiptFile] = React.useState<File>();
  const [receiptMessage, setReceiptMessage] = React.useState('');
  const formRef = React.useRef<HTMLFormElement>(null);
  const working = React.useRef(false);
  const capturePending = React.useRef(false);
  const [captureBusy, setCaptureBusy] = React.useState(false);
  const mounted = React.useRef(false);
  const pendingChange = React.useCallback((value: boolean): void => { capturePending.current = value; setCaptureBusy(value); }, []);
  React.useEffect(() => {
    mounted.current = true;
    adapter.load().then(value => {
      if (!mounted.current) return;
      setAdmission(value);
      setMessage(value.state === 'Ready' ? 'Form connected to the supplied processor boundary. No expense has been submitted.' : 'TEST Save held. No qualified tenant writer or parent context is available.');
    }).catch(() => { if (mounted.current) setMessage('TEST context unavailable. Nothing has been submitted.'); });
    return () => { mounted.current = false; };
  }, [adapter]);
  const ready = admission?.state === 'Ready';
  const context = admission?.state === 'Ready' ? admission.context : undefined;
  const canCreate = ready && context?.creationClearance === 'Clear';
  const nominals = context?.nominals || nominalMaster;
  const matches = searchNominals(nominals, query);
  const selected = nominals.find(n => n.code === draft.nominalCode);
  const choices = selected && !matches.some(n => n.code === selected.code) ? [selected, ...matches] : matches;
  const field = (name: string): string => `${idPrefix}-d01-${name}`;
  function setWorking(value: boolean): void {
    // Synchronous single-flight lock; only its owning run releases it.
    working.current = value;
    if (mounted.current) setBusy(value);
  }
  function change(name: keyof Omit<IExpenseEntryDraft, 'receipt'>, value: string): void {
    if (!working.current && !locked) setDraft(previous => ({ ...previous, [name]: value }));
  }
  function changeReceipt(value: INewReceiptValue): void {
    if (working.current || locked) return;
    setReceipt(value);
    setDraft(previous => ({ ...previous, receipt: value.kind === 'file' ? { kind: 'file', file: value.file }
      : { kind: 'none', reason: value.kind === 'no-receipt' ? value.reason : '' } }));
  }
  async function applyResult(result: PersistenceResult): Promise<void> {
    if (!mounted.current) return;
    setMessage(outcomeText(result)); setLocked(adapter.hasAttempt); setReceiptFile(undefined); setReceiptMessage('');
    setRecord(result.state === 'ReadbackVerified' ? result.record : undefined);
    if (result.state === 'ReadbackVerified' && result.record.receipt.kind === 'file') {
      const verified = await adapter.openReceipt(result.record.line.id);
      if (!mounted.current) return;
      if (verified.state === 'ReceiptBytesVerified' && verified.expenseId === result.record.line.id && verified.bytes.byteLength > 0) {
        setReceiptFile(new File([new Uint8Array(verified.bytes)], verified.fileName, { type: verified.mediaType }));
      } else setReceiptMessage('Receipt readback unavailable. No cached or selected file is substituted for persisted bytes.');
    }
  }
  async function run(action: () => Promise<PersistenceResult>): Promise<void> {
    if (working.current || !active) return;
    setWorking(true); setReceiptFile(undefined);
    try { await applyResult(await action()); }
    catch { if (mounted.current) { setRecord(undefined); setMessage('Result unavailable. Your form and receipt are retained. No success is claimed.'); setLocked(adapter.hasAttempt); } }
    finally { setWorking(false); }
  }
  function save(event: React.FormEvent): void {
    event.preventDefault();
    if (!canCreate || working.current || locked || capturePending.current || !active) return;
    if (!formRef.current?.checkValidity()) { setMessage('Complete the required fields. Nothing submitted.'); formRef.current?.querySelector<HTMLElement>(':invalid')?.focus(); return; }
    const overlong = (['supplier', 'description'] as const).find(name => draft[name].length > MAX_EXPENSE_TEXT_CHARS);
    if (overlong) {
      setMessage(`${overlong === 'supplier' ? 'Supplier' : 'Expense description'} allows up to ${MAX_EXPENSE_TEXT_CHARS} characters. Your text and receipt are retained. Nothing submitted.`);
      formRef.current?.querySelector<HTMLElement>(`#${field(overlong)}`)?.focus();
      return;
    }
    run(() => adapter.save(draft)).catch(() => undefined);
  }

  return <div className={styles.expenseWorkspace} aria-label="D01 TEST expense boundary">
    <section className={styles.expenseListPanel} aria-label="TEST readback">
      <div className={styles.panelHeading}><h2>TEST readback</h2></div>
      <div className={styles.formScroll}>
        <p>Production-intended source candidate. No tenant activation or business acceptance.</p>
        {!ready && <p role="alert">HELD / UNSAVED — no authenticated parent, authoritative nominal policy or qualified writer. Demo claim IDs are never used here.</p>}
        {context && <p>Parent {context.parentId} · {context.month} · authoritative context required on every server operation.</p>}
        {context?.creationClearance === 'Unresolved' && <p role="alert">A prior save is unresolved. New creation is held until the protected ledger is reconciled; closing the browser does not authorise a duplicate.</p>}
        {admission?.state === 'Held' && <ul>{admission.gates.map(gate => <li key={gate}>{gate}</li>)}</ul>}
        {context?.existingExpenseIds.map(id => <button key={id} type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { run(() => adapter.reopen(id)).catch(() => undefined); }}>Reopen expense {id}</button>)}
        {record && <article aria-label={`Verified readback expense ${record.line.id}`}>
          <h3>{record.line.supplier} · {formatMoney(record.line.amountPence)}</h3>
          <p>Record {record.line.id} · {formatUkDate(record.line.dateIso)} · {record.line.nominalCode} — {record.line.nominalDescription}</p>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { run(() => adapter.reopen(record.line.id)).catch(() => undefined); }}>Reopen same expense</button>
          {record.receipt.kind === 'none' ? <p>No receipt: {record.receipt.reason}</p> : <ReceiptLinePreview file={receiptFile} fileName={record.receipt.fileName} supplier={record.line.supplier}
            bindingKey={`${record.line.parentId}:${record.line.id}:${record.etag}:${record.receipt.sha256}`} active={active && !busy} provenance="readback" />}
        </article>}
        {receiptMessage && <p role="alert">{receiptMessage}</p>}
      </div>
    </section>
    <section className={styles.editorPanel} aria-label="D01 Add Expense">
      <div className={styles.editorHeading}><h2>Add TEST expense</h2><span className={styles.draftBadge}>{ready ? 'SOURCE CANDIDATE' : 'HELD'}</span></div>
      <form ref={formRef} className={styles.expenseForm} onSubmit={save} noValidate hidden={closed} style={closed ? { display: 'none' } : undefined}>
        <div className={styles.formScroll} tabIndex={0} role="group" aria-label="TEST expense fields">
          <p>Fields and files stay after failure. Closing this editor retains them in this page; a browser reload discards unsent fields. Pending operations require server reconciliation.</p>
          <fieldset className={styles.fieldset} disabled={!ready || busy || locked}>
            <legend className={styles.srOnly}>TEST expense details</legend>
            <div className={styles.formGrid}>
              {(['date', 'supplier', 'description', 'amount'] as const).map(name => <div className={styles.field} key={name}>
                <label htmlFor={field(name)}>{name === 'date' ? 'Date (dd-mm-yyyy)' : name === 'amount' ? 'Amount (£)' : name === 'supplier' ? 'Supplier' : 'Expense description'} *</label>
                <input id={field(name)} value={draft[name]} onChange={e => change(name, e.target.value)} required inputMode={name === 'amount' ? 'decimal' : undefined}
                  aria-describedby={name === 'supplier' || name === 'description' ? field(`${name}-limit`) : undefined} />
                {(name === 'supplier' || name === 'description') && <small id={field(`${name}-limit`)}>Up to {MAX_EXPENSE_TEXT_CHARS} characters. Some symbols use two characters of storage.</small>}
              </div>)}
              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label htmlFor={field('search')}>Search nominal code or description</label><input id={field('search')} type="search" value={query} onChange={e => setQuery(e.target.value)} />
                <label htmlFor={field('nominal')}>Nominal *</label><select id={field('nominal')} value={draft.nominalCode} required onChange={e => change('nominalCode', e.target.value)}>
                  <option value="">Select an exact code and description</option>
                  {choices.map(n => <option key={n.code} value={n.code} disabled={!!context && !context.eligibleNominalCodes.includes(n.code)}>{n.code} — {n.description}</option>)}
                </select><small>{nominals.length} reference codes. Tenant equality and posting eligibility must be qualified.</small>
              </div>
              <div className={styles.fullWidth}><ReceiptCapture value={receipt} onChange={changeReceipt} idPrefix={`${idPrefix}-d01`} bindingKey={`${idPrefix}-d01-new`} active={active && !closed} disabled={!ready || busy || locked} onPendingChange={pendingChange} /></div>
              <div className={`${styles.field} ${styles.fullWidth}`}><label htmlFor={field('notes')}>Notes (optional)</label><textarea id={field('notes')} value={draft.notes} onChange={e => change('notes', e.target.value)} /></div>
            </div>
          </fieldset>
        </div>
        <footer className={styles.formActions}>
          <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => setClosed(true)}>Close editor — retain form</button>
          <button type="submit" className={styles.primaryButton} disabled={!canCreate || busy || locked || captureBusy}>Save TEST expense</button>
        </footer>
      </form>
      {closed && <button type="button" className={styles.secondaryButton} onClick={() => setClosed(false)}>Return to retained form</button>}
      <p className={styles.saveStatus} role="status" aria-live="polite">{busy ? 'Checking the retained operation…' : message}</p>
      {locked && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { run(() => adapter.checkSave()).catch(() => undefined); }}>Check same save operation</button>}
      {!locked && context?.creationClearance === 'Unresolved' && <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => { run(() => adapter.checkPreviousSave()).catch(() => undefined); }}>Check previous save</button>}
    </section>
  </div>;
}
