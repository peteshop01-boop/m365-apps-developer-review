import * as React from 'react';
import type { IProfilePageProps } from './PageContracts';
import type { IDemoHomePreference } from '../../../domain/homePreference';
import { normaliseDemoPostcode } from '../../../domain/homePreference';
import styles from './SupportPages.module.scss';

export function ProfileScreen({ idPrefix, onHomePreferenceChange }: IProfilePageProps): React.ReactElement {
  const [postcode, setPostcode] = React.useState('');
  const [useHome, setUseHome] = React.useState(true);
  const [preference, setPreference] = React.useState<IDemoHomePreference>();
  const [message, setMessage] = React.useState('No profile record is loaded. Use fictional details only.');
  const [error, setError] = React.useState('');
  function keepPreference(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = normaliseDemoPostcode(postcode);
    if (!value) {
      setError('Enter a fictional postcode in UK format, for example ZZ1 1ZZ. This checks format only.');
      return;
    }
    const next = { postcode: value, useHome };
    setError(''); setPostcode(value); setPreference(next); onHomePreferenceChange?.(next);
    setMessage('DEMO preference retained for this session. Use home on Mileage copies it only when you choose. NO SHAREPOINT SAVE.');
  }
  return <section className={styles.page} aria-labelledby={`${idPrefix}-profile-heading`}>
    <div className={styles.banner}><strong>PROFILE DEMO / UNSAVED</strong><span>NO SHAREPOINT SAVE · synthetic details only</span></div>
    <div className={styles.twoColumns}>
      <article className={styles.card}><p className={styles.eyebrow}>YOUR LOCAL PREFERENCES</p><h2 id={`${idPrefix}-profile-heading`}>A familiar starting point</h2><p>Keep a fictional postcode to make Use home available on Mileage. Journeys keep their current start until you choose that action.</p>
        <form onSubmit={keepPreference} noValidate>
          <label className={styles.field} htmlFor={`${idPrefix}-profile-postcode`}>Fictional home postcode<input id={`${idPrefix}-profile-postcode`} value={postcode} maxLength={10} placeholder="ZZ1 1ZZ" autoComplete="off" aria-invalid={!!error} aria-describedby={`${idPrefix}-postcode-note${error ? ` ${idPrefix}-postcode-error` : ''}`} onChange={event => { setPostcode(event.target.value); setError(''); }} /></label>
          <p className={styles.hint} id={`${idPrefix}-postcode-note`}>Format preview only. No address lookup, routing or paid service is used.</p>
          <label className={styles.checkbox}><input type="checkbox" checked={useHome} onChange={event => setUseHome(event.target.checked)} />Enable Use home on Mileage (demo)</label>
          {error && <p className={styles.error} role="alert" id={`${idPrefix}-postcode-error`}>{error}</p>}
          <div className={styles.actions}><button type="submit">Keep demo preference</button><button type="button" className={styles.secondary} onClick={() => { setPostcode(preference?.postcode || ''); setUseHome(preference?.useHome ?? true); setError(''); setMessage('Unretained edits cancelled. No profile record changed.'); }}>Cancel edits</button><button type="button" className={styles.secondary} onClick={() => { setPreference(undefined); onHomePreferenceChange?.(undefined); setPostcode(''); setUseHome(true); setError(''); setMessage('Local demo preference cleared. Existing journeys are unchanged. No profile record changed.'); }}>Clear demo preference</button></div>
        </form><p role="status" className={styles.status}>{message}</p>
      </article>
      <aside className={`${styles.card} ${styles.tinted}`}><h3>Preference preview</h3><dl className={styles.details}><dt>Claimant</dt><dd>Synthetic claimant</dd><dt>Home postcode</dt><dd>{preference?.postcode || 'Not set'}</dd><dt>Home start</dt><dd>{preference ? preference.useHome ? 'Preferred · demo only' : 'Choose per journey · demo only' : 'Not retained'}</dd><dt>Persistence</dt><dd>Memory only · reload resets this page</dd></dl><h3>Privacy and permissions</h3><p>Do not enter a real home address or employee details. Roles and home-postcode access need authenticated backend checks before this becomes a working profile.</p><span className={styles.pill}>No identity or role authority connected</span></aside>
    </div>
  </section>;
}
