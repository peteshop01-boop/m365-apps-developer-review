import * as React from 'react';
import type { IMileageDraft } from '../../../domain/mileage';
import type { MileageEntryAdapter, MileageAdmission, MileageOutcome, IStoredMileage } from '../../../services/persistence/MileageEntryAdapter';
import { nominalMaster } from '../../../data/nominals';
import { formatMoney } from '../../../domain/expenseRules';
import styles from './KcfExpensesHub.module.scss';

const initial: IMileageDraft = { date: '', programme: '', nominalCode: '', from: '', to: '', returnJourney: false, outwardMiles: '', returnMiles: '', purpose: '' };
function outcomeText(r: MileageOutcome): string {
  if (r.state === 'ReadbackVerified') return `Mileage ${r.record.id} readback verified at the supplied processor boundary. Tenant security and UAT remain unproved.`;
  if (r.state === 'Pending') return 'Outcome pending. Details retained and locked; check the same operation, do not submit a replacement.';
  if (r.state === 'Held') return 'Mileage Save held. No qualified writer/context is available; details retained.';
  return 'Mileage rejected or readback mismatched. No success claimed; details retained.';
}
/** Separate candidate form; never receives mock claim IDs, fixed demo rates or
 * demo programme policy. Runtime adapter is always held. */
export function D02MileageScreen({ adapter, idPrefix }: { adapter: MileageEntryAdapter; idPrefix: string }): React.ReactElement {
  const [admission, setAdmission] = React.useState<MileageAdmission>();
  const [draft, setDraft] = React.useState<IMileageDraft>(initial);
  const [message, setMessage] = React.useState('Checking Mileage admission. Nothing submitted.');
  const [busy, setBusy] = React.useState(false);
  const [locked, setLocked] = React.useState(adapter.hasAttempt);
  const [closed, setClosed] = React.useState(false);
  const [record, setRecord] = React.useState<IStoredMileage>();
  const working = React.useRef(false), mounted = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    adapter.load().then(a => { if (mounted.current) { setAdmission(a); setMessage(a.state === 'Held' ? 'Mileage Save held. First real Expense and the Mileage schema, rate and security gates remain open.' : 'Supplied processor context loaded. No Mileage submitted.'); } })
      .catch(() => { if (mounted.current) setMessage('Mileage context unavailable. Nothing submitted.'); });
    return () => { mounted.current = false; };
  }, [adapter]);
  const context = admission?.state === 'Ready' ? admission.context : undefined;
  const canCreate = !!context && context.creationClearance === 'Clear';
  const programme = context?.programmes.find(p => p.key === draft.programme);
  const id = (name: string): string => `${idPrefix}-d02-${name}`;
  function change<K extends keyof IMileageDraft>(key: K, value: IMileageDraft[K]): void {
    if (!working.current && !locked) setDraft(old => ({ ...old, [key]: value }));
  }
  function setWorking(value: boolean): void {
    // A synchronous single-flight lock; only its owning run can release it.
    working.current = value;
    if (mounted.current) setBusy(value);
  }
  async function run(action: () => Promise<MileageOutcome>): Promise<void> {
    if (working.current) return;
    setWorking(true);
    try {
      const r = await action();
      if (mounted.current) {
        setMessage(outcomeText(r)); setLocked(previous => previous || adapter.hasAttempt || r.state === 'ReadbackVerified');
        setRecord(r.state === 'ReadbackVerified' ? r.record : undefined); setClosed(false);
      }
    } catch { if (mounted.current) { setMessage('Mileage outcome unavailable. Details retained; check the same operation.'); setLocked(previous => previous || adapter.hasAttempt); } }
    finally { setWorking(false); }
  }
  function field(key: 'date' | 'from' | 'to' | 'outwardMiles' | 'returnMiles' | 'purpose', label: string): React.ReactElement {
    return <div className={styles.field}><label htmlFor={id(key)}>{label} *</label><input id={id(key)} data-d02={key} value={draft[key]} required
      inputMode={key.includes('Miles') ? 'decimal' : undefined} onChange={e => change(key, e.target.value)} /></div>;
  }
  return <section className={styles.editorPanel} aria-label="D02 Mileage Save candidate">
    <div className={styles.editorHeading}><h2>Manual Mileage Save candidate</h2><span className={styles.demoBadge}>LIVE SAVE HELD</span></div>
    <p className={styles.formNote}>Source integration only. No Maps calls, default rate or demo claim identifiers. An authorised processor must enforce actor, parent, month, programme and rate.</p>
    <form className={styles.expenseForm} noValidate onSubmit={e => { e.preventDefault(); run(() => adapter.save(draft)).catch(() => undefined); }}>
      <div className={styles.formScroll} hidden={closed}><fieldset className={styles.fieldset} hidden={!!record} disabled={busy || locked || !canCreate}><legend>Manual journey details</legend><div className={styles.formGrid}>
        {field('date', 'Date (dd-mm-yyyy)')}
        <div className={styles.field}><label htmlFor={id('programme')}>Programme *</label><select id={id('programme')} data-d02="programme" value={draft.programme} onChange={e => { change('programme', e.target.value); change('nominalCode', ''); }}>
          <option value="">Choose an admitted programme</option>{context?.programmes.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}</select></div>
        <div className={styles.field}><label htmlFor={id('nominalCode')}>Nominal *</label><select id={id('nominalCode')} data-d02="nominalCode" value={draft.nominalCode} onChange={e => change('nominalCode', e.target.value)}>
          <option value="">Choose an admitted travel nominal</option>{nominalMaster.filter(n => programme?.nominalCodes.includes(n.code)).map(n => <option key={n.code} value={n.code}>{n.code} — {n.description}</option>)}</select></div>
        {field('from', 'Start')}{field('to', 'Destination')}
        <div className={styles.field}><label htmlFor={id('returnJourney')}>Journey type</label><select id={id('returnJourney')} data-d02="returnJourney" value={draft.returnJourney ? 'return' : 'one-way'} onChange={e => change('returnJourney', e.target.value === 'return')}><option value="one-way">One-way</option><option value="return">Return</option></select></div>
        {field('outwardMiles', 'Outward miles')}{(draft.returnJourney || draft.returnMiles !== '') && field('returnMiles', 'Reverse miles')}{field('purpose', 'Purpose')}
      </div></fieldset>
      {record && <dl aria-label="Verified Mileage details">
        <dt>Date</dt><dd>{record.command.draft.date}</dd><dt>Start</dt><dd>{record.command.draft.from}</dd><dt>Destination</dt><dd>{record.command.draft.to}</dd>
        <dt>Purpose</dt><dd>{record.command.draft.purpose}</dd><dt>Journey type</dt><dd>{record.command.draft.returnJourney ? 'Return' : 'One-way'}</dd>
        <dt>Outward miles</dt><dd>{record.command.draft.outwardMiles}</dd><dt>Reverse miles</dt><dd>{record.command.draft.returnMiles || 'Not applicable'}</dd>
        <dt>Programme</dt><dd>{record.programmeName}</dd><dt>Nominal</dt><dd>{record.command.draft.nominalCode} — {record.nominalDescription}</dd>
        <dt>Rate version</dt><dd>{record.rate.snapshotVersion}</dd><dt>Request ID</dt><dd>{record.requestId}</dd>
      </dl>}
      <p className={styles.formNote}>Whole miles are rounded once after adding the separate legs. The admitted central rate is then applied and GBP rounded to 2 decimals. Reverse miles must be empty for one-way journeys; entered values are never silently discarded.</p></div>
      <p role="status" className={styles.saveStatus}>{message}</p>
      {record && <p>SharePoint ID candidate {record.id} · {record.wholeMiles} whole miles · {formatMoney(record.amountPence)} · rate £{record.rate.ratePerMileGbp}/mile · {record.command.draft.returnJourney ? 'Return' : 'One-way'}</p>}
      <footer className={styles.formActions}>
        <button type="submit" disabled={busy || locked || !canCreate || closed}>Submit manual Mileage</button>
        <button type="button" disabled={busy || !adapter.hasAttempt} onClick={() => { run(() => adapter.checkSave()).catch(() => undefined); }}>Check same Mileage operation</button>
        <button type="button" disabled={busy || !context} onClick={() => { run(() => adapter.checkPreviousSave()).catch(() => undefined); }}>Check previous Mileage Save</button>
        {record && <><button type="button" disabled={busy} onClick={() => setClosed(true)}>Close Mileage details</button><button type="button" disabled={busy} onClick={() => { run(() => adapter.reopen(record.id)).catch(() => undefined); }}>Reopen same Mileage</button></>}
      </footer>
      {context?.existingIds.map(lineId => <button type="button" key={lineId} disabled={busy} onClick={() => { run(() => adapter.reopen(lineId)).catch(() => undefined); }}>Reopen Mileage {lineId}</button>)}
    </form>
  </section>;
}
