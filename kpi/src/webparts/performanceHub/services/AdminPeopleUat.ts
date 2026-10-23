import type { IProductionPerson } from '../models/ProductionModels';
import type {
  IAdminPeopleReadPathResult,
  IAdminPeopleUatState,
  IAdminPersonDraft,
  IAdminPersonEdit,
  IAdminTeamRecord,
  AdminUatAction,
  IAdminUatContext
} from '../models/AdminFoundationModels';

export const ADMIN_PEOPLE_CURRENT_RECORD_COUNT = 24;

export const ADMIN_PEOPLE_READ_PATH = {
  listTitle: 'KCFKPI_People' as const,
  expectedCurrentRecordCount: ADMIN_PEOPLE_CURRENT_RECORD_COUNT,
  requiredFields: [
    'Id', 'PersonKey', 'Title', 'Email', 'ManagerPersonKey', 'ManagerEmail',
    'Team', 'JobRole', 'AppRoles', 'Active'
  ] as readonly string[],
  operation: 'ReadOnly' as const
};

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();

const clonePerson = (person: IProductionPerson): IProductionPerson => ({
  ...person,
  appRoles: person.appRoles.slice()
});

const cleanRoles = (roles: readonly string[] | undefined): string[] => {
  const result: string[] = [];
  (roles || []).forEach(role => {
    const value = clean(role);
    if (value && result.map(normalise).indexOf(normalise(value)) < 0) result.push(value);
  });
  return result;
};

const assertContext = (context: IAdminUatContext): void => {
  if (!clean(context.actorEmail) || !clean(context.occurredAt)) {
    throw new Error('Safe Admin UAT mutations require an actor email and timestamp.');
  }
};

const assertSafeState = (state: IAdminPeopleUatState): void => {
  if (state.mode !== 'SafeLocalUat' || state.persistence !== 'BrowserMemoryOnly') {
    throw new Error('People Admin mutation was blocked outside the safe local UAT boundary.');
  }
};

const findPerson = (records: readonly IProductionPerson[], personKey: string): IProductionPerson | undefined => {
  const wanted = normalise(personKey);
  return records.filter(record => normalise(record.personKey) === wanted)[0];
};

const requirePerson = (records: readonly IProductionPerson[], personKey: string): IProductionPerson => {
  const person = findPerson(records, personKey);
  if (!person) throw new Error(`PersonKey ${clean(personKey) || '(blank)'} was not found in safe Admin UAT.`);
  return person;
};

const requireUniqueIdentity = (
  records: readonly IProductionPerson[],
  personKey: string,
  email: string,
  excludingPersonKey?: string
): void => {
  const key = normalise(personKey);
  const mail = normalise(email);
  if (!key || !mail || clean(email).indexOf('@') < 1) {
    throw new Error('PersonKey and a valid professional email are required.');
  }
  records.forEach(record => {
    if (excludingPersonKey && normalise(record.personKey) === normalise(excludingPersonKey)) return;
    if (normalise(record.personKey) === key) throw new Error(`PersonKey ${clean(personKey)} already exists.`);
    if (normalise(record.email) === mail) throw new Error(`Email ${clean(email)} already exists.`);
  });
};

const requireActiveManager = (
  records: readonly IProductionPerson[],
  managerPersonKey: string | undefined
): IProductionPerson | undefined => {
  const key = clean(managerPersonKey);
  if (!key) return undefined;
  const manager = requirePerson(records, key);
  if (!manager.active) throw new Error(`Manager ${manager.personKey} is inactive.`);
  return manager;
};

const requireActiveTeam = (
  teams: readonly IAdminTeamRecord[],
  teamKey: string | undefined
): IAdminTeamRecord | undefined => {
  const key = clean(teamKey);
  if (!key) return undefined;
  const team = teams.filter(candidate => normalise(candidate.teamKey) === normalise(key))[0];
  if (!team) throw new Error(`TeamKey ${key} was not found in safe Admin UAT.`);
  if (!team.active) throw new Error(`Team ${team.teamKey} is inactive.`);
  return team;
};

const nextId = (records: readonly IProductionPerson[]): number => {
  let maximum = 0;
  records.forEach(record => { if (record.id > maximum) maximum = record.id; });
  return maximum + 1;
};

const appendAudit = (
  state: IAdminPeopleUatState,
  action: AdminUatAction,
  personKey: string,
  change: string,
  context: IAdminUatContext,
  records: readonly IProductionPerson[]
): IAdminPeopleUatState => ({
  ...state,
  records,
  audit: state.audit.concat([{
    sequence: state.audit.length + 1,
    entityType: 'Person',
    recordKey: personKey,
    action,
    actorEmail: clean(context.actorEmail),
    occurredAt: clean(context.occurredAt),
    change
  }])
});

const replacePerson = (
  records: readonly IProductionPerson[],
  personKey: string,
  replacement: IProductionPerson
): IProductionPerson[] => records.map(record => (
  normalise(record.personKey) === normalise(personKey) ? clonePerson(replacement) : clonePerson(record)
));

const assertNoManagerCycle = (
  records: readonly IProductionPerson[],
  personKey: string,
  proposedManagerPersonKey: string | undefined
): void => {
  let cursor = clean(proposedManagerPersonKey);
  const visited: { [normalisedPersonKey: string]: boolean } = {};
  while (cursor) {
    if (normalise(cursor) === normalise(personKey)) {
      throw new Error('Manager change would create a reporting cycle.');
    }
    if (visited[normalise(cursor)]) throw new Error('The existing reporting chain contains a cycle.');
    visited[normalise(cursor)] = true;
    const manager = findPerson(records, cursor);
    if (!manager) return;
    cursor = clean(manager.managerPersonKey);
  }
};

export const inspectAdminPeopleReadPath = (
  records: readonly IProductionPerson[],
  expectedCurrentRecordCount: number = ADMIN_PEOPLE_CURRENT_RECORD_COUNT
): IAdminPeopleReadPathResult => {
  const issues: string[] = [];
  const seenKeys: { [normalisedPersonKey: string]: boolean } = {};
  const seenEmails: { [normalisedEmail: string]: boolean } = {};
  let activeCount = 0;

  if (records.length !== expectedCurrentRecordCount) {
    issues.push(`People record-count drift: read ${records.length}; the signed baseline is ${expectedCurrentRecordCount}.`);
  }

  records.forEach((record, index) => {
    const key = normalise(record.personKey);
    const email = normalise(record.email);
    if (!key) issues.push(`People row ${index + 1} has no PersonKey.`);
    else if (seenKeys[key]) issues.push(`People contains duplicate PersonKey ${record.personKey}.`);
    else seenKeys[key] = true;
    if (!clean(record.displayName)) issues.push(`People row ${index + 1} has no display name.`);
    if (!email || clean(record.email).indexOf('@') < 1) issues.push(`People row ${index + 1} has no valid email.`);
    else if (seenEmails[email]) issues.push(`People contains duplicate email ${record.email}.`);
    else seenEmails[email] = true;
    if (!Array.isArray(record.appRoles)) issues.push(`People row ${index + 1} has invalid application-role metadata.`);
    if (typeof record.active !== 'boolean') issues.push(`People row ${index + 1} has no valid Active value.`);
    if (record.active) activeCount += 1;
  });

  return {
    sourceList: 'KCFKPI_People',
    expectedCurrentRecordCount,
    recordCount: records.length,
    activeCount,
    inactiveCount: records.length - activeCount,
    matchesCurrentRecordCount: records.length === expectedCurrentRecordCount,
    valid: issues.length === 0,
    issues
  };
};

export const createAdminPeopleUatState = (
  productionReadRecords: readonly IProductionPerson[]
): IAdminPeopleUatState => ({
  mode: 'SafeLocalUat',
  sourceList: 'KCFKPI_People',
  persistence: 'BrowserMemoryOnly',
  records: productionReadRecords.map(clonePerson),
  audit: []
});

export const addPersonSafeUat = (
  state: IAdminPeopleUatState,
  draft: IAdminPersonDraft,
  teams: readonly IAdminTeamRecord[],
  context: IAdminUatContext
): IAdminPeopleUatState => {
  assertSafeState(state);
  assertContext(context);
  requireUniqueIdentity(state.records, draft.personKey, draft.email);
  if (!clean(draft.displayName)) throw new Error('Display name is required.');
  const manager = requireActiveManager(state.records, draft.managerPersonKey);
  const team = requireActiveTeam(teams, draft.teamKey);
  const person: IProductionPerson = {
    id: nextId(state.records),
    personKey: clean(draft.personKey),
    displayName: clean(draft.displayName),
    email: clean(draft.email),
    managerPersonKey: manager?.personKey,
    managerEmail: manager?.email,
    team: team?.teamKey,
    jobRole: clean(draft.jobRole) || undefined,
    appRoles: cleanRoles(draft.appRoles),
    active: draft.active !== false
  };
  return appendAudit(
    state,
    'PersonAdded',
    person.personKey,
    `Added ${person.displayName} as ${person.active ? 'Active' : 'Inactive'}.`,
    context,
    state.records.map(clonePerson).concat([person])
  );
};

export const editPersonSafeUat = (
  state: IAdminPeopleUatState,
  personKey: string,
  patch: IAdminPersonEdit,
  context: IAdminUatContext
): IAdminPeopleUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requirePerson(state.records, personKey);
  const displayName = patch.displayName === undefined ? current.displayName : clean(patch.displayName);
  const email = patch.email === undefined ? current.email : clean(patch.email);
  if (!displayName) throw new Error('Display name is required.');
  requireUniqueIdentity(state.records, current.personKey, email, current.personKey);
  const next: IProductionPerson = {
    ...current,
    displayName,
    email,
    jobRole: patch.jobRole === undefined ? current.jobRole : clean(patch.jobRole) || undefined,
    appRoles: patch.appRoles === undefined ? current.appRoles.slice() : cleanRoles(patch.appRoles)
  };
  const changedFields: string[] = [];
  if (next.displayName !== current.displayName) changedFields.push('Name');
  if (normalise(next.email) !== normalise(current.email)) changedFields.push('Email');
  if (clean(next.jobRole) !== clean(current.jobRole)) changedFields.push('JobRole');
  if (next.appRoles.join('|') !== current.appRoles.join('|')) changedFields.push('AppRoles');
  if (!changedFields.length) return state;

  let records = replacePerson(state.records, current.personKey, next);
  if (normalise(next.email) !== normalise(current.email)) {
    records = records.map(record => normalise(record.managerPersonKey) === normalise(current.personKey)
      ? { ...clonePerson(record), managerEmail: next.email }
      : clonePerson(record));
  }
  return appendAudit(
    state,
    'PersonEdited',
    current.personKey,
    `Changed ${changedFields.join(', ')}.`,
    context,
    records
  );
};

export const setPersonActiveSafeUat = (
  state: IAdminPeopleUatState,
  personKey: string,
  active: boolean,
  context: IAdminUatContext
): IAdminPeopleUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requirePerson(state.records, personKey);
  if (current.active === active) return state;
  const next = { ...clonePerson(current), active };
  return appendAudit(
    state,
    active ? 'PersonReactivated' : 'PersonDeactivated',
    current.personKey,
    `Active changed from ${current.active} to ${active}.`,
    context,
    replacePerson(state.records, current.personKey, next)
  );
};

export const changePersonManagerSafeUat = (
  state: IAdminPeopleUatState,
  personKey: string,
  managerPersonKey: string | undefined,
  context: IAdminUatContext
): IAdminPeopleUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requirePerson(state.records, personKey);
  const manager = requireActiveManager(state.records, managerPersonKey);
  assertNoManagerCycle(state.records, current.personKey, manager?.personKey);
  if (normalise(current.managerPersonKey) === normalise(manager?.personKey)) return state;
  const next: IProductionPerson = {
    ...clonePerson(current),
    managerPersonKey: manager?.personKey,
    managerEmail: manager?.email
  };
  return appendAudit(
    state,
    'PersonManagerChanged',
    current.personKey,
    `Manager changed from ${clean(current.managerPersonKey) || '(none)'} to ${manager?.personKey || '(none)'}.`,
    context,
    replacePerson(state.records, current.personKey, next)
  );
};

export const changePersonTeamSafeUat = (
  state: IAdminPeopleUatState,
  personKey: string,
  teamKey: string | undefined,
  teams: readonly IAdminTeamRecord[],
  context: IAdminUatContext
): IAdminPeopleUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requirePerson(state.records, personKey);
  const team = requireActiveTeam(teams, teamKey);
  if (normalise(current.team) === normalise(team?.teamKey)) return state;
  const next: IProductionPerson = { ...clonePerson(current), team: team?.teamKey };
  return appendAudit(
    state,
    'PersonTeamChanged',
    current.personKey,
    `Team changed from ${clean(current.team) || '(none)'} to ${team?.teamKey || '(none)'}.`,
    context,
    replacePerson(state.records, current.personKey, next)
  );
};
