import * as React from 'react';
import type { ICurrentClaim, IExpenseDraft, IExpenseLine, IExpensesService, INominal } from '../../../domain/contracts';
import { formatMoney, formatUkDate, newestFirst, searchNominals, totalPence, validateExpense } from '../../../domain/expenseRules';
import type { ExpenseErrors, ExpenseField } from '../../../domain/expenseRules';
import { Icon } from './Icon';
import { ReceiptCapture } from './ReceiptCapture';
import { ReceiptLinePreview } from './ReceiptLinePreview';
import type { INewReceiptValue } from './ReceiptCapture';
import { validateReceiptFile, validateReceiptValue } from './receiptValidation';
import styles from './KcfExpensesHub.module.scss';

interface IExpensesScreenProps {
  service: IExpensesService;
  claim: ICurrentClaim;
  nominals: ReadonlyArray<INominal>;
  lines: ReadonlyArray<IExpenseLine>;
  idPrefix: string;
  onSaved: () => Promise<void>;
  active?: boolean;
}

function emptyDraft(month: string): IExpenseDraft {
  return { nominalCode: '', date: formatUkDate(`${month}-11`), supplier: '', description: '', amount: '',
    receipt: { kind: 'no-receipt', reason: '' }, notes: '' };
}

function lineToDraft(line: IExpenseLine): IExpenseDraft {
  return { nominalCode: line.nominalCode, date: formatUkDate(line.dateIso), supplier: line.supplier,
    description: line.description, amount: (line.amountPence / 100).toFixed(2), receipt: { ...line.receipt }, notes: line.notes };
}

export function ExpensesScreen({ service, claim, nominals, lines, idPrefix, onSaved, active = true }: IExpensesScreenProps): React.ReactElement {
  const [draft, setDraft] = React.useState<IExpenseDraft>(() => emptyDraft(claim.month));
  const [editing, setEditing] = React.useState<IExpenseLine | undefined>(undefined);
  const [query, setQuery] = React.useState('');
  const [errors, setErrors] = React.useState<ExpenseErrors>({});
  const [message, setMessage] = React.useState('Choose an expense to edit, or add a synthetic example.');
  const [saveError, setSaveError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [receiptValue, setReceiptValue] = React.useState<INewReceiptValue>({ kind: 'no-receipt', reason: '' });
  const [receiptPending, setReceiptPending] = React.useState(false);
  const receiptPendingRef = React.useRef(false);
  // Real File objects never enter the service, a persisted store or a transport.
  // Per-line memory survives local navigation/edit and disappears on page reload.
  const receiptFiles = React.useRef(new Map<string, File>());
  const receiptBaseline = React.useRef<INewReceiptValue>(receiptValue);
  const [editorGeneration, setEditorGeneration] = React.useState(0);
  const saving = React.useRef(false);
  const sequence = React.useRef(0);
  const operationId = React.useRef<string | undefined>(undefined);
  const baseline = React.useRef<IExpenseDraft>(emptyDraft(claim.month));
  const formRef = React.useRef<HTMLFormElement>(null);
  const supplierRef = React.useRef<HTMLInputElement>(null);
  const sorted = newestFirst(lines);
  const matches = searchNominals(nominals, query);
  const chosen = nominals.find(nominal => nominal.code === draft.nominalCode);
  const choices = chosen && !matches.some(nominal => nominal.code === chosen.code) ? [chosen, ...matches] : matches;
  const editable = claim.status === 'Draft';

  const fieldId = (field: string): string => `${idPrefix}-${field}`;
  const pendingChange = React.useCallback((pending: boolean): void => { receiptPendingRef.current = pending; setReceiptPending(pending); }, []);
  function changeReceipt(value: INewReceiptValue): void {
    setReceiptValue(value);
    change('receipt', value.kind === 'file' ? { kind: 'demo-receipt', fileName: value.file.name }
      : { kind: 'no-receipt', reason: value.kind === 'no-receipt' ? value.reason : '' });
  }
  function dirty(): boolean { return JSON.stringify(draft) !== JSON.stringify(baseline.current) || receiptValue !== receiptBaseline.current; }
  function resetReceipt(value: INewReceiptValue): void { setReceiptValue(value); receiptBaseline.current = value; setEditorGeneration(previous => previous + 1); }
  function change<K extends keyof IExpenseDraft>(field: K, value: IExpenseDraft[K]): void {
    operationId.current = undefined;
    setDraft(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: undefined }));
    setSaveError('');
  }

  function reset(): void {
    if (saving.current) return;
    setEditing(undefined); setDraft(emptyDraft(claim.month)); setQuery(''); setErrors({}); setSaveError('');
    baseline.current = emptyDraft(claim.month);
    resetReceipt({ kind: 'no-receipt', reason: '' });
    operationId.current = undefined;
    setMessage('New synthetic expense. Nothing is saved until you choose Save demo expense.');
    supplierRef.current?.focus();
  }

  function edit(line: IExpenseLine): void {
    if (saving.current) return;
    if (dirty() && !window.confirm('Discard the unsaved demo form changes?')) return;
    setEditing(line); setDraft(lineToDraft(line)); setQuery(''); setErrors({}); setSaveError('');
    baseline.current = lineToDraft(line);
    const file = receiptFiles.current.get(line.id);
    resetReceipt(file ? { kind: 'file', file } : line.receipt.kind === 'no-receipt' ? { ...line.receipt } : { kind: 'none' });
    operationId.current = undefined;
    setMessage(`Editing ${line.supplier}. Cancel keeps the original demo line.`);
    supplierRef.current?.focus();
  }

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving.current || receiptPendingRef.current || !editable || !active) return;
    const nextErrors = validateExpense(draft, nominals, claim.month);
    const receiptError = validateReceiptValue(receiptValue);
    if (receiptError) nextErrors.receipt = receiptError;
    setErrors(nextErrors);
    const invalid = Object.keys(nextErrors)[0];
    if (invalid) {
      setMessage('Check the highlighted fields. No demo changes were saved.');
      formRef.current?.querySelector<HTMLElement>(`[data-field="${invalid}"]`)?.focus();
      return;
    }
    saving.current = true; setBusy(true); setSaveError('');
    if (!operationId.current) operationId.current = `${idPrefix}-mock-${++sequence.current}`;
    try {
      if (receiptValue.kind === 'file') {
        const fileError = await validateReceiptFile(receiptValue.file);
        if (fileError) throw new Error(fileError);
      }
      const result = await service.expenseLines.save({ claimId: claim.id, operationId: operationId.current,
        draft, existingId: editing?.id, expectedVersion: editing?.version });
      if (receiptValue.kind === 'file') receiptFiles.current.set(result.id, receiptValue.file);
      else receiptFiles.current.delete(result.id);
      // Refresh failure is visible; the same operation ID makes a subsequent retry harmless.
      await onSaved();
      completeSave();
      setMessage(`${result.supplier} saved in this demo session only. Reloading the page resets the mock.`);
      supplierRef.current?.focus();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'The demo save failed. Your form has been kept.');
    } finally { releaseSave(); }
  }

  // Synchronous transitions of the single-flight editor. While save awaits, edit/reset
  // refuse input and fields are disabled; failed refresh retains the retry operation ID.
  function completeSave(): void {
    setEditing(undefined); setDraft(emptyDraft(claim.month)); setQuery('');
    operationId.current = undefined; baseline.current = emptyDraft(claim.month);
    resetReceipt({ kind: 'no-receipt', reason: '' });
  }
  function releaseSave(): void { saving.current = false; setBusy(false); }

  function errorText(field: ExpenseField): React.ReactNode {
    return errors[field] ? <span className={styles.fieldError} id={fieldId(`${field}-error`)}>{errors[field]}</span> : undefined;
  }

  function describedBy(field: ExpenseField): string | undefined {
    return errors[field] ? fieldId(`${field}-error`) : undefined;
  }

  return <div className={styles.expenseWorkspace}>
    <section className={styles.expenseListPanel} aria-label="Demo expense list">
      <div className={styles.panelHeading}>
        <div><span className={styles.eyebrow}>YOUR DEMO CLAIM</span><h2>Expense history <span className={styles.count}>{lines.length}</span></h2></div>
        <button type="button" className={styles.addButton} onClick={() => { if (!dirty() || window.confirm('Discard the unsaved demo form changes?')) reset(); }} disabled={busy || !editable}><Icon name="plus" /><span>Add expense</span></button>
      </div>
      <p className={styles.panelIntro}>Newest first · synthetic examples only</p>
      <ul className={styles.expenseList} tabIndex={0} aria-label="Demo expense history">
        {sorted.map(line => <li key={line.id}>
          <div className={`${styles.expenseCard} ${line.receipt.kind === 'demo-receipt' ? styles.expenseCardWithReceipt : ''} ${editing?.id === line.id ? styles.selectedCard : ''}`}>
          <button type="button" className={styles.expenseDetails} onClick={() => edit(line)} disabled={busy || !editable} aria-label={`Edit ${line.supplier}, ${formatUkDate(line.dateIso)}, ${formatMoney(line.amountPence)}`} aria-pressed={editing?.id === line.id}>
            <span className={styles.cardTop}><span className={styles.cardDate}>{formatUkDate(line.dateIso)}</span><strong>{formatMoney(line.amountPence)}</strong></span>
            <strong className={styles.cardSupplier}>{line.supplier}</strong>
            <span className={styles.cardNominal}>{line.nominalCode} · {line.nominalDescription}</span>
            <span className={styles.cardBottom}><span>{line.receipt.kind === 'no-receipt' ? 'No receipt · reason recorded' : `Demo reference · ${line.receipt.fileName}`}</span><Icon name="arrow" /></span>
          </button>
          {line.receipt.kind === 'demo-receipt' && <ReceiptLinePreview file={receiptFiles.current.get(line.id)} fileName={line.receipt.fileName}
            supplier={line.supplier} bindingKey={`${claim.id}:${line.id}:${line.version}`} active={active} />}
          </div>
        </li>)}
        {!lines.length && <li className={styles.emptyState}>No demo expenses yet. Add your first synthetic example.</li>}
      </ul>
      <footer className={styles.listTotal}><span>Expenses total</span><strong>{formatMoney(totalPence(lines))}</strong></footer>
    </section>

    <section className={styles.editorPanel} aria-label={editing ? 'Edit demo expense' : 'Add demo expense'}>
      <div className={styles.editorHeading}><div><span className={styles.eyebrow}>IN-MEMORY DEMO</span><h2>{editing ? 'Edit expense' : 'Add expense'}</h2></div><span className={styles.draftBadge}>Draft</span></div>
      <form ref={formRef} className={styles.expenseForm} onSubmit={event => { save(event).catch(error => setSaveError(String(error))); }} noValidate>
        <div className={styles.formScroll} tabIndex={0} role="group" aria-label="Expense editor fields">
          <p className={styles.formNote}>October 2026 · Use synthetic details. All fields marked * are required.</p>
          {!editable && <p role="alert">This demo claim is read-only.</p>}
          <fieldset disabled={busy || !editable} className={styles.fieldset}>
            <legend className={styles.srOnly}>Expense details</legend>
            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label htmlFor={fieldId('date')}>Date *</label>
                <input id={fieldId('date')} data-field="date" value={draft.date} onChange={event => change('date', event.target.value)} placeholder="dd-mm-yyyy" inputMode="numeric" maxLength={10} aria-invalid={!!errors.date} aria-describedby={describedBy('date')} required />
                {errorText('date')}
              </div>
              <div className={styles.field}>
                <label htmlFor={fieldId('amount')}>Amount (£) *</label>
                <input id={fieldId('amount')} data-field="amount" inputMode="decimal" value={draft.amount} onChange={event => change('amount', event.target.value)} placeholder="0.00" aria-invalid={!!errors.amount} aria-describedby={describedBy('amount')} required />
                {errorText('amount')}
              </div>
              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label htmlFor={fieldId('supplier')}>Supplier *</label>
                <input ref={supplierRef} id={fieldId('supplier')} data-field="supplier" value={draft.supplier} onChange={event => change('supplier', event.target.value)} placeholder="e.g. Demo ticket desk" aria-invalid={!!errors.supplier} aria-describedby={describedBy('supplier')} required />
                {errorText('supplier')}
              </div>
              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label htmlFor={fieldId('nominal-search')}>Search nominal code or description</label>
                <input id={fieldId('nominal-search')} type="search" placeholder="Code, name or LT" value={query} onChange={event => setQuery(event.target.value)} aria-describedby={fieldId('nominal-hint')} />
                <label htmlFor={fieldId('nominalCode')}>Nominal *</label>
                <select id={fieldId('nominalCode')} data-field="nominalCode" value={draft.nominalCode} onChange={event => change('nominalCode', event.target.value)} aria-invalid={!!errors.nominalCode} aria-describedby={[fieldId('nominal-hint'), describedBy('nominalCode')].filter(Boolean).join(' ')} required>
                  <option value="">Choose an exact code and description</option>
                  {choices.map(nominal => <option key={nominal.code} value={nominal.code}>{nominal.code} — {nominal.description}</option>)}
                </select>
                {chosen && <span className={styles.selectedNominal}>{chosen.code} — {chosen.description}</span>}
                <small id={fieldId('nominal-hint')}>{matches.length} of {nominals.length} reference codes. Select a result; typed search text is not a selection.</small>
                {errorText('nominalCode')}
              </div>
              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label htmlFor={fieldId('description')}>Expense description *</label>
                <input id={fieldId('description')} data-field="description" value={draft.description} onChange={event => change('description', event.target.value)} placeholder="What was the expense for?" aria-invalid={!!errors.description} aria-describedby={describedBy('description')} required />
                {errorText('description')}
              </div>
              <div className={styles.fullWidth}>
                <ReceiptCapture value={receiptValue} onChange={changeReceipt} idPrefix={idPrefix} bindingKey={`${claim.id}:${editing?.id || 'new'}:${editorGeneration}`} active={active} disabled={busy || !editable} onPendingChange={pendingChange} />
                {errorText('receipt')}
              </div>
              <div className={`${styles.field} ${styles.fullWidth}`}>
                <label htmlFor={fieldId('notes')}>Notes <small>optional</small></label>
                <textarea id={fieldId('notes')} rows={2} value={draft.notes} onChange={event => change('notes', event.target.value)} placeholder="Any useful context" />
              </div>
            </div>
          </fieldset>
          {saveError && <p className={styles.saveError} role="alert">{saveError}</p>}
          <p className={styles.saveStatus} role="status" aria-live="polite">{message}</p>
        </div>
        <footer className={styles.formActions}>
          <button type="button" className={styles.secondaryButton} onClick={reset} disabled={busy}>Cancel</button>
          <button type="submit" className={styles.primaryButton} disabled={busy || receiptPending || !editable}>{busy ? 'Saving demo…' : 'Save demo expense'}<Icon name="arrow" /></button>
        </footer>
      </form>
    </section>
  </div>;
}
