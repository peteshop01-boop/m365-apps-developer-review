import * as React from 'react';
import type { ICurrentClaim, INominal } from '../../../domain/contracts';
import type { IMileageApi, IMileageDraft, IMileageLine, MileageErrors } from '../../../domain/mileage';
import { calculateMileage, demoProgrammes, mileageTotal, validateMileage } from '../../../domain/mileage';
import type { IDemoHomePreference } from '../../../domain/homePreference';
import { normaliseDemoPostcode } from '../../../domain/homePreference';
import { formatMoney, formatUkDate, searchNominals } from '../../../domain/expenseRules';
import styles from './KcfExpensesHub.module.scss';

interface IProps {
  api: IMileageApi; claim: ICurrentClaim; nominals: ReadonlyArray<INominal>;
  lines: ReadonlyArray<IMileageLine>; idPrefix: string; onSaved: () => Promise<void>;
  homePreference?: IDemoHomePreference; onOpenProfile?: () => void;
}
function blank(month: string): IMileageDraft {
  return { date: formatUkDate(`${month}-13`), programme: 'CTS Schools', nominalCode: '20600',
    from: '', to: '', returnJourney: false, outwardMiles: '', returnMiles: '', purpose: '' };
}
export function MileageScreen({ api, claim, nominals, lines, idPrefix, onSaved, homePreference, onOpenProfile }: IProps): React.ReactElement {
  const [draft, setDraft] = React.useState<IMileageDraft>(() => blank(claim.month));
  const [editing, setEditing] = React.useState<IMileageLine | undefined>();
  const [query, setQuery] = React.useState('');
  const [errors, setErrors] = React.useState<MileageErrors>({});
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('Manual demonstration only. No Maps calls or live rate.');
  const [failure, setFailure] = React.useState('');
  const lock = React.useRef(false);
  const sequence = React.useRef(0);
  const operation = React.useRef<string | undefined>();
  const baseline = React.useRef<IMileageDraft>(blank(claim.month));
  const form = React.useRef<HTMLFormElement>(null);
  const firstInput = React.useRef<HTMLInputElement>(null);
  const id = (field: string): string => `${idPrefix}-mileage-${field}`;
  const amount = calculateMileage(draft, 45);
  const chosen = nominals.find(item => item.code === draft.nominalCode);
  const matches = searchNominals(nominals, query);
  const choices = chosen && !matches.some(item => item.code === chosen.code) ? [chosen, ...matches] : matches;
  const editable = claim.status === 'Draft';
  const homePostcode = homePreference?.useHome === true ? normaliseDemoPostcode(homePreference.postcode) : undefined;

  function change<K extends keyof IMileageDraft>(key: K, value: IMileageDraft[K]): void {
    operation.current = undefined; setFailure(''); setErrors(previous => ({ ...previous, [key]: undefined }));
    setDraft(previous => ({ ...previous, [key]: value }));
  }
  function reset(): void {
    if (lock.current) return;
    const next = blank(claim.month); setDraft(next); baseline.current = next;
    setEditing(undefined); setErrors({}); setFailure(''); setQuery(''); operation.current = undefined;
    setMessage('Unsaved form cleared. Existing demo journeys are unchanged.'); firstInput.current?.focus();
  }
  function useHome(): void {
    if (!homePostcode || busy || !editable) return;
    change('from', homePostcode);
    setMessage('Fictional home postcode copied into Start. Save demo journey is a separate, in-memory action.');
    form.current?.querySelector<HTMLInputElement>('[data-mileage="from"]')?.focus();
  }
  function discardAllowed(): boolean {
    return JSON.stringify(draft) === JSON.stringify(baseline.current) || window.confirm('Discard unsaved demo journey changes?');
  }
  function edit(line: IMileageLine): void {
    if (lock.current || !discardAllowed()) return;
    const next: IMileageDraft = { date: formatUkDate(line.dateIso), programme: line.programme, nominalCode: line.nominalCode,
      from: line.from, to: line.to, returnJourney: line.returnJourney, outwardMiles: line.outwardMiles,
      returnMiles: line.returnMiles, purpose: line.purpose };
    setEditing(line); setDraft(next); baseline.current = next; operation.current = undefined;
    setErrors({}); setFailure(''); setQuery(''); setMessage('Editing this demo journey. Cancel keeps its saved values.');
    firstInput.current?.focus();
  }
  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); if (lock.current || !editable) return;
    const invalid = validateMileage(draft, nominals, claim.month); setErrors(invalid);
    const field = Object.keys(invalid)[0];
    if (field) { form.current?.querySelector<HTMLElement>(`[data-mileage="${field}"]`)?.focus(); return; }
    lock.current = true; setBusy(true); setFailure('');
    if (!operation.current) operation.current = `${idPrefix}-journey-${++sequence.current}`;
    try {
      await api.save({ claimId: claim.id, operationId: operation.current, draft, existingId: editing?.id, expectedVersion: editing?.version });
      await onSaved(); complete();
    } catch (error) { setFailure(error instanceof Error ? error.message : 'Demo save failed; form retained.'); }
    finally { release(); }
  }
  function complete(): void {
    const next = blank(claim.month); setDraft(next); baseline.current = next; setEditing(undefined); setQuery(''); operation.current = undefined;
    setMessage('Journey saved in memory only. Reload resets it; no SharePoint record was created.');
  }
  function release(): void { lock.current = false; setBusy(false); }
  function input(key: 'date' | 'from' | 'to' | 'outwardMiles' | 'returnMiles' | 'purpose', label: string, numeric = false): React.ReactElement {
    return <div className={`${styles.field} ${['from', 'to', 'purpose'].includes(key) ? styles.fullWidth : ''}`}>
      <label htmlFor={id(key)}>{label} *</label>
      <input ref={key === 'date' ? firstInput : undefined} id={id(key)} data-mileage={key} value={draft[key]} inputMode={numeric ? 'decimal' : undefined}
        onChange={event => change(key, event.target.value)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? id(`${key}-error`) : undefined} required />
      {errors[key] && <span className={styles.fieldError} id={id(`${key}-error`)}>{errors[key]}</span>}
    </div>;
  }
  return <div className={styles.expenseWorkspace}>
    <section className={styles.expenseListPanel} aria-label="Demo mileage list">
      <div className={styles.panelHeading}><h2>Journey history <span className={styles.count}>{lines.length}</span></h2>
        <button className={styles.addButton} type="button" disabled={busy || !editable} onClick={() => { if (discardAllowed()) reset(); }}>Add journey</button></div>
      <p className={styles.panelIntro}>Newest first · manual synthetic journeys</p>
      <ul className={styles.expenseList} tabIndex={0} aria-label="Demo journey history">{lines.map(line => <li key={line.id}><button type="button" disabled={busy || !editable}
        className={`${styles.expenseCard} ${editing?.id === line.id ? styles.selectedCard : ''}`} onClick={() => edit(line)} aria-label={`Edit journey ${line.from} to ${line.to}`}>
        <span className={styles.cardTop}><span className={styles.cardDate}>{formatUkDate(line.dateIso)}</span><strong>{formatMoney(line.amountPence)}</strong></span>
        <strong className={styles.cardSupplier}>{line.from} → {line.to}</strong>
        <span>{line.returnJourney ? 'Return' : 'One-way'} · {line.payableMiles} whole miles · {line.ratePence}p demo rate</span>
        <span className={styles.cardNominal}>{line.nominalCode} · {line.nominalDescription}</span><span>{line.purpose}</span>
      </button></li>)}{!lines.length && <li className={styles.emptyState}>Add a manual example to see it in Review Claim.</li>}</ul>
      <footer className={styles.listTotal}><span>Mileage total</span><strong>{formatMoney(mileageTotal(lines))}</strong></footer>
    </section>
    <section className={styles.editorPanel} aria-label="Demo mileage editor">
      <div className={styles.editorHeading}><h2>{editing ? 'Edit journey' : 'Add journey'}</h2><span className={styles.demoBadge}>DEMO</span></div>
      <form ref={form} className={styles.expenseForm} noValidate onSubmit={event => { save(event).catch(error => setFailure(String(error))); }}>
        <div className={styles.formScroll}><p className={styles.formNote}>October 2026 · synthetic locations only. Fixed 45p rate is illustrative, not an approved policy. No geocoding or routing.</p>
          <fieldset className={styles.fieldset} disabled={busy || !editable}><legend className={styles.srOnly}>Manual journey details</legend><div className={styles.formGrid}>
            {input('date', 'Date (dd-mm-yyyy)')}
            <div className={styles.field}><label htmlFor={id('programme')}>Programme *</label><select id={id('programme')} data-mileage="programme" value={draft.programme} onChange={event => {
              const next = demoProgrammes.find(item => item.name === event.target.value); if (next) { change('programme', next.name); change('nominalCode', next.code); }
            }}>{demoProgrammes.map(item => <option key={item.name}>{item.name}</option>)}</select></div>
            <div className={`${styles.field} ${styles.fullWidth}`}><label htmlFor={id('search')}>Search travel reference</label><input id={id('search')} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Code, description or LT" />
              <label htmlFor={id('nominalCode')}>Nominal *</label><select id={id('nominalCode')} data-mileage="nominalCode" value={draft.nominalCode} onChange={event => change('nominalCode', event.target.value)} aria-invalid={!!errors.nominalCode} aria-describedby={errors.nominalCode ? id('nominalCode-error') : undefined}>
                <option value="">Choose a nominal</option>{choices.map(item => <option key={item.code} value={item.code}>{item.code} — {item.description}{item.travel ? '' : ' (non-travel reference)'}</option>)}</select>
              <small>All 195 references displayed; this demo accepts active travel references only. Live eligibility is unverified.</small>{errors.nominalCode && <span className={styles.fieldError} id={id('nominalCode-error')}>{errors.nominalCode}</span>}</div>
            <div className={`${styles.field} ${styles.fullWidth}`}>
              <div className={styles.radioRow}><button type="button" className={styles.secondaryButton} disabled={!homePostcode} onClick={useHome} aria-describedby={id('home-note')}>Use home · DEMO</button>{onOpenProfile && <button type="button" className={styles.secondaryButton} onClick={onOpenProfile}>Open Profile</button>}</div>
              <small id={id('home-note')}>{homePostcode ? `Fictional preference: ${homePostcode}. Choose Use home to replace Start; other details stay as entered.` : 'Enter Start yourself, or keep a fictional postcode and enable Use home in Profile. No address lookup or routing.'}</small>
            </div>
            {input('from', 'Start')}{input('to', 'Destination')}
            <fieldset className={`${styles.receiptChoice} ${styles.fullWidth}`}><legend>Journey type</legend><div className={styles.radioRow}>
              <label><input type="radio" name={id('type')} checked={!draft.returnJourney} onChange={() => change('returnJourney', false)} />One-way</label>
              <label><input type="radio" name={id('type')} checked={draft.returnJourney} onChange={() => change('returnJourney', true)} />Return</label></div></fieldset>
            {input('outwardMiles', 'Outward miles', true)}{draft.returnJourney && input('returnMiles', 'Reverse miles', true)}{input('purpose', 'Purpose')}
          </div></fieldset>
          <div className={styles.calculation}><strong>{amount ? `${amount.miles} whole miles · ${formatMoney(amount.pence)}` : 'Enter miles to preview the total'}</strong><span>Sum both legs, round once, apply 45p demo rate.</span></div>
          {failure && <p className={styles.saveError} role="alert">{failure}</p>}<p className={styles.saveStatus} role="status">{message}</p>
        </div><footer className={styles.formActions}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={reset}>Cancel journey</button><button type="submit" className={styles.primaryButton} disabled={busy || !editable}>{busy ? 'Saving demo…' : 'Save demo journey'}</button></footer>
      </form>
    </section>
  </div>;
}
