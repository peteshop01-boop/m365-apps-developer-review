import * as React from 'react';
import type { IProductionPerson } from '../models/ProductionModels';
import { getAdminFoundationEntitlement } from '../services/AdminFoundationEntitlement';
import { getAdminPeopleMutationAdmission } from '../services/AdminPeopleMutationAdmission';
import styles from './AdminPeopleManagementView.module.scss';

export interface IAdminPeopleManagementViewProps {
  records: readonly IProductionPerson[];
  readAvailable: boolean;
  actorRoles?: readonly string[];
}

/** Authorised read records stay read-only; only the selection key is component state. */
const AdminPeopleManagementView: React.FC<IAdminPeopleManagementViewProps> = ({ records, readAvailable, actorRoles }) => {
  const [selectedKey, setSelectedKey] = React.useState('');
  const detailRef = React.useRef<HTMLHeadingElement>(null);
  const entitled = getAdminFoundationEntitlement(actorRoles).entitled;
  const available = entitled && readAvailable;
  const selected = available ? records.find(person => person.personKey === selectedKey) : undefined;
  const add = getAdminPeopleMutationAdmission('Add');
  const deactivate = getAdminPeopleMutationAdmission('Deactivate');
  React.useEffect(() => { if (selected) detailRef.current?.focus(); }, [selectedKey, selected]);
  if (!entitled) return <div data-experience-state="empty" role="status"><h3>People unavailable</h3><p>People records are unavailable to this role.</p></div>;
  return <div className={styles.people}>
    <p id="people-update-availability">{add.message}</p>
    <button type="button" disabled={!add.enabled} aria-describedby="people-update-availability">Add Person</button>
    {!available ? <div data-experience-state="empty" role="status"><h3>People unavailable</h3><p>People records could not be loaded. Reload after the governed read is restored.</p></div>
      : !records.length ? <div data-experience-state="empty" role="status"><h3>No People records returned</h3><p>The authorised read returned no People records.</p></div>
      : <div className={styles.layout}>
        <div><h3>Choose a Person</h3><ul className={styles.records}>{records.map(person => <li key={person.personKey}>
          <button type="button" aria-pressed={selectedKey === person.personKey} onClick={() => setSelectedKey(person.personKey)}>
            <strong>{person.displayName}</strong><span>{person.active ? 'Active' : 'Inactive'}</span>
          </button>
        </li>)}</ul></div>
        <section aria-label="Person details" className={styles.detail}>
          {selected ? <><h3 tabIndex={-1} ref={detailRef}>{selected.displayName}</h3>
            <dl><dt>PersonKey</dt><dd>{selected.personKey}</dd><dt>Sign-in email</dt><dd>{selected.email}</dd>
              <dt>Status</dt><dd>{selected.active ? 'Active' : 'Inactive'}</dd><dt>Job role</dt><dd>{selected.jobRole || 'Not recorded'}</dd>
              <dt>Team</dt><dd>{selected.team || 'Not recorded'}</dd><dt>Manager</dt>
              <dd>{records.find(person => person.personKey === selected.managerPersonKey)?.displayName || selected.managerEmail || 'Not recorded'}</dd></dl>
            <p>Records and history are retained. PersonKey identifies this record and cannot be changed here.</p>
          </> : <p role="status">{selectedKey ? 'The selected Person is no longer available. Choose a current record.' : 'Choose a Person to inspect their details.'}</p>}
          <button type="button" disabled={!deactivate.enabled} aria-describedby="people-update-availability">Deactivate Person</button>
        </section>
      </div>}
  </div>;
};

export default AdminPeopleManagementView;
