import * as React from 'react';
import type { IBehaviourFrameworkV2Catalogue } from '../services/BehaviourFrameworkV2';
import {
  BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT,
  createDisabledBehaviourCatalogueAdministrationGateway,
  type BehaviourCatalogueAdminMutationAction,
  type IBehaviourCatalogueAdministrationGateway,
  type IBehaviourCatalogueAdminReadModel
} from '../services/BehaviourCatalogueAdministration';
import styles from './AdminFoundationPage.module.scss';

export interface IAdminFoundationBehaviourCatalogueProps {
  gateway?: IBehaviourCatalogueAdministrationGateway;
  makeIdempotencyKey?(): string;
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const disabledGateway = createDisabledBehaviourCatalogueAdministrationGateway();

const AdminFoundationBehaviourCatalogue: React.FC<IAdminFoundationBehaviourCatalogueProps> = ({
  gateway = disabledGateway,
  makeIdempotencyKey = () => `${Date.now().toString(16).padStart(8, '0').slice(-8)}-0000-4000-8000-${Math.random()
    .toString(16).slice(2, 14).padEnd(12, '0')}`
}) => {
  const [loaded, setLoaded] = React.useState<{ gateway: IBehaviourCatalogueAdministrationGateway;
    value: IBehaviourCatalogueAdminReadModel }>();
  // Gateway replacement must hide old privileged data in the same render.
  const readback = loaded?.gateway === gateway ? loaded.value : undefined;
  const currentGateway = React.useRef(gateway);
  currentGateway.current = gateway;
  const generation = React.useRef(0);
  const mounted = React.useRef(false);
  const [status, setStatus] = React.useState('Loading canonical catalogue…');
  const [busy, setBusy] = React.useState(false);
  const [action, setAction] = React.useState<BehaviourCatalogueAdminMutationAction>('PublishSuccessor');
  const [nextVersion, setNextVersion] = React.useState('');
  const [effectiveFrom, setEffectiveFrom] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [targetKey, setTargetKey] = React.useState('');
  const [focusArea, setFocusArea] = React.useState('');
  const [suggestedTarget, setSuggestedTarget] = React.useState('');
  const [rowStatus, setRowStatus] = React.useState<'Published' | 'Retired'>('Published');

  const load = React.useCallback(async (): Promise<void> => {
    const request = ++generation.current;
    const current = (): boolean => mounted.current && currentGateway.current === gateway && generation.current === request;
    try {
      const result = await gateway.read();
      if (!current()) return;
      setLoaded({ gateway, value: result });
      setStatus(result.state === 'Available' ? 'Canonical catalogue loaded.' : result.reason);
    } catch {
      if (!current()) return;
      const reason = 'Behaviour catalogue administration is unavailable.';
      setLoaded({ gateway, value: { state: 'Unavailable', reason } });
      setStatus(reason);
    }
  }, [gateway]);

  React.useEffect(() => {
    mounted.current = true;
    setLoaded(undefined); setBusy(false); setReason(''); setNextVersion('');
    setAction('PublishSuccessor'); setTargetKey(''); setStatus('Loading canonical catalogue…');
    load().catch(() => undefined);
    return () => { mounted.current = false; generation.current += 1; };
  }, [load]);

  const available = readback?.state === 'Available' ? readback : undefined;
  const currentRow = available?.currentCatalogue.rows.find(row => row.targetKey === targetKey);
  React.useEffect(() => {
    if (!available) return;
    const selected = available.currentCatalogue.rows.find(row => row.targetKey === targetKey)
      || available.currentCatalogue.rows[0];
    if (!selected) return;
    setTargetKey(selected.targetKey);
    setFocusArea(selected.focusArea);
    setSuggestedTarget(selected.suggestedTarget);
    setRowStatus(selected.status);
    setEffectiveFrom(available.currentCatalogue.effectiveFrom);
  }, [available?.currentVersionKey, gateway]);

  const selectRow = (key: string): void => {
    if (!available) return;
    const selected = available.currentCatalogue.rows.find(row => row.targetKey === key);
    if (!selected) return;
    setTargetKey(selected.targetKey);
    setFocusArea(selected.focusArea);
    setSuggestedTarget(selected.suggestedTarget);
    setRowStatus(selected.status);
  };

  const publish = async (): Promise<void> => {
    if (!available || !currentRow) return;
    const candidate = clone(available.currentCatalogue) as IBehaviourFrameworkV2Catalogue;
    candidate.catalogueVersion = nextVersion.trim();
    candidate.revision = available.currentCatalogue.revision + 1;
    candidate.effectiveFrom = effectiveFrom;
    candidate.rows = candidate.rows.map(row => row.targetKey === currentRow.targetKey ? {
      ...row, focusArea: focusArea.trim(), suggestedTarget: suggestedTarget.trim(), status: rowStatus
    } : row);
    const request = generation.current;
    const current = (): boolean => mounted.current && currentGateway.current === gateway && generation.current === request;
    setBusy(true);
    try {
      const result = await gateway.publish({ contract: BEHAVIOUR_CATALOGUE_ADMIN_CONTRACT,
        idempotencyKey: makeIdempotencyKey(), action, expectedEtag: available.etag,
        expectedRowVersion: available.rowVersion, expectedCurrentVersionKey: available.currentVersionKey,
        reason, candidate });
      if (!current()) return;
      setStatus(result.message);
      if (result.outcome === 'Confirmed' || result.outcome === 'ConfirmedReplay') {
        setReason(''); setNextVersion(''); await load();
        if (mounted.current && currentGateway.current === gateway && generation.current === request + 1) setBusy(false);
      }
    } catch { if (current()) setStatus('The catalogue publication result is uncertain. Reload canonical state before retrying.'); }
    finally { if (current()) setBusy(false); }
  };

  if (!readback) return <section aria-labelledby="behaviour-catalogue-admin-heading">
    <h2 id="behaviour-catalogue-admin-heading">Governed Behaviour catalogue administration</h2>
    <p role="status">Loading canonical catalogue…</p>
  </section>;
  if (readback.state !== 'Available') return <section aria-labelledby="behaviour-catalogue-admin-heading"
    data-behaviour-catalogue-admin-state={readback.state}>
    <header className={styles.sectionHeader}><span>ADM-005</span>
      <h2 id="behaviour-catalogue-admin-heading">Governed Behaviour catalogue administration</h2></header>
    <div className={styles.issueBox} role="alert"><p>{readback.reason}</p></div>
  </section>;

  const catalogue = readback.currentCatalogue;
  return <section aria-labelledby="behaviour-catalogue-admin-heading" data-behaviour-catalogue-admin-state="Available">
    <header className={styles.sectionHeader}><span>ADM-005 · canonical versioned control</span>
      <h2 id="behaviour-catalogue-admin-heading">Governed Behaviour catalogue administration</h2>
      <p>Prepare a successor version with a mandatory reason. Published history and stored Workplan snapshots are never rewritten.</p></header>
    <div className={styles.statStrip} data-canonical-catalogue-version={readback.currentVersionKey}>
      <span><strong>{catalogue.catalogueVersion}</strong> current</span>
      <span><strong>{catalogue.rows.length}</strong> governed examples</span>
      <span><strong>{catalogue.rows.filter(row => row.status === 'Published').length}</strong> published</span>
      <span>Guidance {catalogue.selectionGuidance.recommendedMinimum}–{catalogue.selectionGuidance.recommendedMaximum}; no hard cap</span>
    </div>
    <ol aria-label="Sponsor-controlled Behaviour headlines">{catalogue.headlineBehaviours.map(headline =>
      <li key={headline.behaviourKey} data-headline-key={headline.behaviourKey}>{headline.title}</li>)}</ol>
    <p data-rating-domain={catalogue.ratingScale.join('|')}>Headline labels: {catalogue.ratingScale.join(', ')}. Catalogue targets have no numeric score or weight.</p>

    <div className={styles.filterGrid}>
      <label className={styles.field}><span>Governed target</span><select aria-label="Governed target" value={targetKey}
        onChange={event => selectRow(event.currentTarget.value)}>{catalogue.rows.map(row =>
          <option key={row.targetKey} value={row.targetKey}>{row.targetKey} · {row.focusArea}</option>)}</select></label>
      <label className={styles.field}><span>Action</span><select aria-label="Catalogue action" value={action}
        onChange={event => setAction(event.currentTarget.value as BehaviourCatalogueAdminMutationAction)}>
        <option value="PublishSuccessor">Publish successor</option><option value="Retire">Retire target</option>
        <option value="Reactivate">Reactivate target</option><option value="Correct">Correct through successor</option>
      </select></label>
      <label className={styles.field}><span>Successor version</span><input aria-label="Successor version"
        value={nextVersion} onChange={event => setNextVersion(event.currentTarget.value)}
        placeholder="KCF-BHV-PD03-2026.10-v2" /></label>
      <label className={styles.field}><span>Effective from</span><input aria-label="Successor effective from" type="date"
        value={effectiveFrom} onChange={event => setEffectiveFrom(event.currentTarget.value)} /></label>
      <label className={styles.field}><span>Focus title</span><input aria-label="Focus title" value={focusArea}
        onChange={event => setFocusArea(event.currentTarget.value)} /></label>
      <label className={styles.field}><span>Approved example wording</span><textarea aria-label="Approved example wording"
        value={suggestedTarget} onChange={event => setSuggestedTarget(event.currentTarget.value)} /></label>
      <label className={styles.field}><span>Target status</span><select aria-label="Target status" value={rowStatus}
        onChange={event => setRowStatus(event.currentTarget.value as 'Published' | 'Retired')}>
        <option value="Published">Published</option><option value="Retired">Retired</option></select></label>
      <label className={styles.field}><span>Mandatory reason</span><textarea aria-label="Mandatory reason" value={reason}
        onChange={event => setReason(event.currentTarget.value)} /></label>
      <button type="button" disabled={busy || !nextVersion.trim() || !reason.trim()}
        onClick={() => publish().catch(() => undefined)}>{busy ? 'Publishing…' : 'Publish governed successor'}</button>
      <button type="button" className={styles.secondary} disabled={busy}
        onClick={() => load().catch(() => undefined)}>Reload canonical catalogue</button>
    </div>
    <div className={styles.statusBar} role="status">{status}</div>
    <section aria-labelledby="catalogue-version-history-heading"><h3 id="catalogue-version-history-heading">Immutable version history</h3>
      <ol>{readback.versions.map(version => <li key={version.versionKey} data-catalogue-history-version={version.versionKey}>
        <strong>{version.versionKey}</strong> · {version.action} · {version.createdByEmail} · {version.createdAt}
        <span> · {version.reason}</span></li>)}</ol></section>
    <section aria-labelledby="catalogue-event-history-heading"><h3 id="catalogue-event-history-heading">Append-only catalogue events</h3>
      <ol>{readback.events.map(event => <li key={event.auditKey} data-catalogue-audit-key={event.auditKey}>
        <strong>{event.sequence}. {event.action}</strong> · {event.actorEmail} · {event.changeReference}
        <span> · {event.before?.catalogueVersion || 'Baseline'} → {event.after.catalogueVersion}</span></li>)}</ol></section>
  </section>;
};

export default AdminFoundationBehaviourCatalogue;
