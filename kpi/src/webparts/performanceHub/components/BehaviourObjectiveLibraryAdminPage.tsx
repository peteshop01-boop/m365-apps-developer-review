import * as React from 'react';
import type { BehaviourKey, IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import { BEHAVIOUR_KEYS } from '../models/BehaviourWorkplanModels';
import { validateBehaviourObjectiveLibraryRecord } from '../services/BehaviourWorkplanPolicy';
import styles from './PerformanceHub.module.scss';

export interface IBehaviourObjectiveLibraryAdminPageProps {
  records: ReadonlyArray<IBehaviourObjectiveLibraryRecord>;
  disabled?: boolean;
  localUat?: boolean;
  onChange?(records: IBehaviourObjectiveLibraryRecord[]): void;
  onSaveRecord?(record: IBehaviourObjectiveLibraryRecord): Promise<IBehaviourObjectiveLibraryRecord | void>;
  onSetActive?(record: IBehaviourObjectiveLibraryRecord, active: boolean): Promise<void>;
  onReorder?(records: IBehaviourObjectiveLibraryRecord[]): Promise<void>;
  makeKey?(behaviourKey: BehaviourKey): string;
}

const newRecord = (
  behaviourKey: BehaviourKey,
  records: ReadonlyArray<IBehaviourObjectiveLibraryRecord>,
  makeKey?: (key: BehaviourKey) => string
): IBehaviourObjectiveLibraryRecord => ({
  behaviourObjectiveKey: makeKey?.(behaviourKey) || `${behaviourKey}-LOCAL-${Date.now()}`,
  behaviourKey,
  objectiveTitle: '',
  objectiveDescription: '',
  suggestedMeasure: '',
  suggestedUnit: '',
  suggestedEvidence: '',
  active: true,
  sortOrder: Math.max(0, ...records.filter(item => item.behaviourKey === behaviourKey).map(item => item.sortOrder)) + 10,
  effectiveFrom: new Date().toISOString().slice(0, 10),
  effectiveTo: undefined
});

const BehaviourObjectiveLibraryAdminPage: React.FC<IBehaviourObjectiveLibraryAdminPageProps> = ({ records, disabled, localUat, onChange, onSaveRecord, onSetActive, onReorder, makeKey }) => {
  const [behaviourFilter, setBehaviourFilter] = React.useState<BehaviourKey>('BHV-01');
  const [search, setSearch] = React.useState('');
  const [draftRecords, setDraftRecords] = React.useState<IBehaviourObjectiveLibraryRecord[]>(() => records.map(record => ({ ...record })));
  const [busyKey, setBusyKey] = React.useState<string>();
  const [status, setStatus] = React.useState('Edit a draft, then use its explicit Save action.');
  React.useEffect(() => setDraftRecords(records.map(record => ({ ...record }))), [records]);
  const searchValue = search.trim().toLowerCase();
  const filtered = draftRecords.filter(item => item.behaviourKey === behaviourFilter
    && (!searchValue || [
      item.behaviourObjectiveKey, item.objectiveTitle, item.objectiveDescription,
      item.suggestedMeasure, item.suggestedUnit, item.suggestedEvidence
    ].some(value => (value || '').toLowerCase().indexOf(searchValue) >= 0)))
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const update = (key: string, patch: Partial<IBehaviourObjectiveLibraryRecord>): void => {
    setDraftRecords(current => current.map(record => record.behaviourObjectiveKey === key ? { ...record, ...patch } : record));
  };

  const commit = async (next: IBehaviourObjectiveLibraryRecord[], message: string): Promise<void> => {
    setDraftRecords(next);
    onChange?.(next);
    setStatus(message);
  };

  const save = async (record: IBehaviourObjectiveLibraryRecord): Promise<void> => {
    const errors = validateBehaviourObjectiveLibraryRecord(record);
    if (errors.length > 0) {
      setStatus(errors[0]);
      return;
    }
    setBusyKey(record.behaviourObjectiveKey);
    try {
      const saved = await onSaveRecord?.(record);
      const resolved = saved || record;
      await commit(draftRecords.map(item => item.behaviourObjectiveKey === record.behaviourObjectiveKey ? resolved : item), localUat ? 'Objective saved in browser memory only.' : 'Objective saved and verified.');
    } catch {
      setStatus('The objective could not be saved. Reload its current value and try again.');
    } finally {
      setBusyKey(undefined);
    }
  };

  const move = async (key: string, direction: -1 | 1): Promise<void> => {
    const ordered = filtered.slice();
    const index = ordered.findIndex(record => record.behaviourObjectiveKey === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const first = ordered[index];
    const second = ordered[target];
    const next = draftRecords.map(record => record.behaviourObjectiveKey === first.behaviourObjectiveKey
      ? { ...record, sortOrder: second.sortOrder }
      : record.behaviourObjectiveKey === second.behaviourObjectiveKey
        ? { ...record, sortOrder: first.sortOrder }
        : record);
    setBusyKey(key);
    try {
      await onReorder?.(next);
      await commit(next, localUat ? 'Order changed in browser memory only.' : 'Objective order saved.');
    } catch {
      setStatus('The new objective order could not be saved.');
    } finally {
      setBusyKey(undefined);
    }
  };

  const setActive = async (record: IBehaviourObjectiveLibraryRecord): Promise<void> => {
    const active = !record.active;
    setBusyKey(record.behaviourObjectiveKey);
    try {
      await onSetActive?.(record, active);
      await commit(draftRecords.map(item => item.behaviourObjectiveKey === record.behaviourObjectiveKey ? { ...item, active } : item), localUat ? `${active ? 'Reactivated' : 'Deactivated'} in browser memory only.` : `${active ? 'Reactivated' : 'Deactivated'} and verified.`);
    } catch {
      setStatus(`The objective could not be ${active ? 'reactivated' : 'deactivated'}.`);
    } finally {
      setBusyKey(undefined);
    }
  };

  const add = (): void => setDraftRecords(current => [...current, newRecord(behaviourFilter, current, makeKey)]);

  return <section className={styles.personalPage} aria-labelledby="behaviour-library-admin-heading">
    <div className={styles.coreHeader}>
      <div><span className={styles.sectionLabel}>Administration</span><h2 id="behaviour-library-admin-heading">Behaviour Objective Library</h2><p>Add, edit, reorder and deactivate suggested objectives. Employees still customise a copied Workplan value; Admin edits never rewrite approved Workplans.</p></div>
      <button type="button" className={styles.saveButton} disabled={disabled} onClick={add}>Add objective</button>
    </div>
    {localUat && <div className={styles.uatBanner}><strong>LOCAL ADMIN UAT · NO SHAREPOINT WRITES</strong><span>Changes are held only in browser memory and disappear on reload.</span></div>}
    <div className={styles.uatControls}>
      <label><span>Behaviour banner</span><select value={behaviourFilter} onChange={event => setBehaviourFilter(event.target.value as BehaviourKey)}>{BEHAVIOUR_KEYS.map(key => <option key={key}>{key}</option>)}</select></label>
      <label><span>Search objectives</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, description, measure or evidence" /></label>
      <span>{filtered.length} objective{filtered.length === 1 ? '' : 's'} shown · {draftRecords.filter(item => item.active).length} active across all Behaviours · {status}</span>
    </div>
    <div className={styles.personalList}>{filtered.map((record, index) => <article className={styles.personalItem} key={record.behaviourObjectiveKey}>
      <div className={styles.personalItemHeader}><span>{record.behaviourObjectiveKey}</span><span>{record.active ? 'Active' : 'Inactive'}</span></div>
      <div className={styles.personalForm}>
        <label><span>Behaviour</span><select disabled={disabled} value={record.behaviourKey} onChange={event => {
          const nextBehaviour = event.target.value as BehaviourKey;
          update(record.behaviourObjectiveKey, { behaviourKey: nextBehaviour });
          setBehaviourFilter(nextBehaviour);
        }}>{BEHAVIOUR_KEYS.map(key => <option key={key}>{key}</option>)}</select></label>
        <label><span>Objective title</span><input type="text" disabled={disabled} value={record.objectiveTitle} onChange={event => update(record.behaviourObjectiveKey, { objectiveTitle: event.target.value })} /></label>
        <label><span>Description</span><textarea rows={3} disabled={disabled} value={record.objectiveDescription} onChange={event => update(record.behaviourObjectiveKey, { objectiveDescription: event.target.value })} /></label>
        <label><span>Suggested measure</span><textarea rows={3} disabled={disabled} value={record.suggestedMeasure} onChange={event => update(record.behaviourObjectiveKey, { suggestedMeasure: event.target.value })} /></label>
        <label><span>Suggested unit</span><input type="text" disabled={disabled} value={record.suggestedUnit} onChange={event => update(record.behaviourObjectiveKey, { suggestedUnit: event.target.value })} /></label>
        <label><span>Suggested evidence</span><textarea rows={3} disabled={disabled} value={record.suggestedEvidence} onChange={event => update(record.behaviourObjectiveKey, { suggestedEvidence: event.target.value })} /></label>
        <label><span>Effective from</span><input type="date" disabled={disabled} value={record.effectiveFrom || ''} onChange={event => update(record.behaviourObjectiveKey, { effectiveFrom: event.target.value || undefined })} /></label>
        <label><span>Effective to</span><input type="date" disabled={disabled} value={record.effectiveTo || ''} onChange={event => update(record.behaviourObjectiveKey, { effectiveTo: event.target.value || undefined })} /></label>
        <label><span>Sort order</span><input type="number" disabled={disabled} value={record.sortOrder} onChange={event => update(record.behaviourObjectiveKey, { sortOrder: Number(event.target.value) })} /></label>
      </div>
      <div className={styles.headerActions}>
        <button type="button" className={styles.saveButton} disabled={disabled || Boolean(busyKey)} onClick={() => save(record).catch(() => undefined)}>{busyKey === record.behaviourObjectiveKey ? 'Saving…' : 'Save objective'}</button>
        <button type="button" className={styles.secondaryButton} disabled={disabled || Boolean(busyKey) || index === 0} onClick={() => move(record.behaviourObjectiveKey, -1).catch(() => undefined)}>Move up</button>
        <button type="button" className={styles.secondaryButton} disabled={disabled || Boolean(busyKey) || index === filtered.length - 1} onClick={() => move(record.behaviourObjectiveKey, 1).catch(() => undefined)}>Move down</button>
        <button type="button" className={record.active ? styles.removeButton : styles.saveButton} disabled={disabled || Boolean(busyKey)} onClick={() => setActive(record).catch(() => undefined)}>{record.active ? 'Deactivate' : 'Reactivate'}</button>
      </div>
    </article>)}</div>
  </section>;
};

export default BehaviourObjectiveLibraryAdminPage;
