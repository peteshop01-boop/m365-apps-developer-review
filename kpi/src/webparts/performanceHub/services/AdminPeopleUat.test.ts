import type { IProductionPerson } from '../models/ProductionModels';
import type { IAdminTeamRecord, IAdminPeopleUatState } from '../models/AdminFoundationModels';
import * as PeopleUatApi from './AdminPeopleUat';
import {
  ADMIN_PEOPLE_CURRENT_RECORD_COUNT,
  ADMIN_PEOPLE_READ_PATH,
  addPersonSafeUat,
  changePersonManagerSafeUat,
  changePersonTeamSafeUat,
  createAdminPeopleUatState,
  editPersonSafeUat,
  inspectAdminPeopleReadPath,
  setPersonActiveSafeUat
} from './AdminPeopleUat';

const context = {
  actorEmail: 'admin.uat@example.invalid',
  occurredAt: '2026-08-21T12:00:00.000Z'
};

const makePeople = (count: number = ADMIN_PEOPLE_CURRENT_RECORD_COUNT): IProductionPerson[] => {
  const people: IProductionPerson[] = [];
  for (let index = 1; index <= count; index += 1) {
    const padded = index < 10 ? `0${index}` : `${index}`;
    people.push({
      id: index,
      personKey: `PERSON-${padded}`,
      displayName: `Synthetic Person ${padded}`,
      email: `person.${padded}@example.invalid`,
      managerPersonKey: index === 1 ? undefined : 'PERSON-01',
      managerEmail: index === 1 ? undefined : 'person.01@example.invalid',
      team: index % 2 ? 'TEAM-A' : 'TEAM-B',
      jobRole: index === 1 ? 'Synthetic lead' : 'Synthetic employee',
      appRoles: index === 1 ? ['Senior Manager Admin'] : ['Employee'],
      active: true
    });
  }
  return people;
};

const teams: IAdminTeamRecord[] = [
  { id: 1, teamKey: 'TEAM-A', teamName: 'Synthetic Alpha', teamLeadPersonKey: 'PERSON-01', active: true, sortOrder: 10 },
  { id: 2, teamKey: 'TEAM-B', teamName: 'Synthetic Beta', active: true, sortOrder: 20 },
  { id: 3, teamKey: 'TEAM-C', teamName: 'Synthetic Inactive', active: false, sortOrder: 30 }
];

describe('KCF-KPI-020A People Admin pure safe-UAT domain', () => {
  it('defines and validates the current 24-record KCFKPI_People read path', () => {
    const result = inspectAdminPeopleReadPath(makePeople());

    expect(ADMIN_PEOPLE_READ_PATH).toEqual({
      listTitle: 'KCFKPI_People',
      expectedCurrentRecordCount: 24,
      requiredFields: ['Id', 'PersonKey', 'Title', 'Email', 'ManagerPersonKey', 'ManagerEmail', 'Team', 'JobRole', 'AppRoles', 'Active'],
      operation: 'ReadOnly'
    });
    expect(result).toMatchObject({
      sourceList: 'KCFKPI_People',
      expectedCurrentRecordCount: 24,
      recordCount: 24,
      activeCount: 24,
      inactiveCount: 0,
      matchesCurrentRecordCount: true,
      valid: true
    });
    expect(result.issues).toEqual([]);
  });

  it('reports count drift and duplicate physical identities without changing the read records', () => {
    const records = makePeople(23);
    records[22] = { ...records[22], personKey: records[0].personKey, email: records[0].email };
    const before = JSON.stringify(records);

    const result = inspectAdminPeopleReadPath(records);

    expect(result.matchesCurrentRecordCount).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues.join(' ')).toContain('record-count drift: read 23; the signed baseline is 24');
    expect(result.issues.join(' ')).toContain('duplicate PersonKey');
    expect(result.issues.join(' ')).toContain('duplicate email');
    expect(JSON.stringify(records)).toBe(before);
  });

  it('does not confirm a structurally well-formed roster when its count drifts from the signed baseline', () => {
    const result = inspectAdminPeopleReadPath(makePeople(23));

    expect(result.matchesCurrentRecordCount).toBe(false);
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      'People record-count drift: read 23; the signed baseline is 24.'
    ]);
  });

  it('adds, edits, deactivates and reactivates only browser-memory Person copies', () => {
    const source = makePeople();
    const before = JSON.stringify(source);
    let state = createAdminPeopleUatState(source);

    state = addPersonSafeUat(state, {
      personKey: 'PERSON-UAT',
      displayName: 'Synthetic UAT Person',
      email: 'person.uat@example.invalid',
      managerPersonKey: 'PERSON-01',
      teamKey: 'TEAM-A',
      jobRole: 'Synthetic UAT role',
      appRoles: ['Employee']
    }, teams, context);
    state = editPersonSafeUat(state, 'PERSON-UAT', {
      displayName: 'Edited Synthetic UAT Person',
      email: 'person.uat.edited@example.invalid',
      jobRole: 'Edited synthetic role',
      appRoles: ['Employee', 'Manager']
    }, context);
    state = setPersonActiveSafeUat(state, 'PERSON-UAT', false, context);
    state = setPersonActiveSafeUat(state, 'PERSON-UAT', true, context);

    const saved = state.records.filter(person => person.personKey === 'PERSON-UAT')[0];
    expect(saved).toMatchObject({
      id: 25,
      displayName: 'Edited Synthetic UAT Person',
      email: 'person.uat.edited@example.invalid',
      managerPersonKey: 'PERSON-01',
      managerEmail: 'person.01@example.invalid',
      team: 'TEAM-A',
      jobRole: 'Edited synthetic role',
      appRoles: ['Employee', 'Manager'],
      active: true
    });
    expect(state).toMatchObject({
      mode: 'SafeLocalUat',
      sourceList: 'KCFKPI_People',
      persistence: 'BrowserMemoryOnly'
    });
    expect(state.audit.map(event => event.action)).toEqual([
      'PersonAdded', 'PersonEdited', 'PersonDeactivated', 'PersonReactivated'
    ]);
    expect(state.audit[0]).toMatchObject({
      entityType: 'Person',
      recordKey: 'PERSON-UAT',
      actorEmail: context.actorEmail,
      occurredAt: context.occurredAt
    });
    expect(JSON.stringify(source)).toBe(before);
  });

  it('changes Manager and Team independently and synchronises the denormalised manager email', () => {
    let state = createAdminPeopleUatState(makePeople());

    state = changePersonManagerSafeUat(state, 'PERSON-03', 'PERSON-02', context);
    state = changePersonTeamSafeUat(state, 'PERSON-03', 'TEAM-B', teams, context);
    const changed = state.records.filter(person => person.personKey === 'PERSON-03')[0];

    expect(changed.managerPersonKey).toBe('PERSON-02');
    expect(changed.managerEmail).toBe('person.02@example.invalid');
    expect(changed.team).toBe('TEAM-B');
    expect(state.audit.map(event => event.action)).toEqual(['PersonManagerChanged', 'PersonTeamChanged']);

    const unchanged = changePersonTeamSafeUat(state, 'PERSON-03', 'TEAM-B', teams, context);
    expect(unchanged).toBe(state);
    expect(unchanged.audit).toHaveLength(2);
  });

  it('prevents self/cyclic managers and inactive or unknown Team assignment', () => {
    let state = createAdminPeopleUatState(makePeople());
    state = changePersonManagerSafeUat(state, 'PERSON-03', 'PERSON-02', context);

    expect(() => changePersonManagerSafeUat(state, 'PERSON-02', 'PERSON-03', context)).toThrow('reporting cycle');
    expect(() => changePersonManagerSafeUat(state, 'PERSON-02', 'PERSON-02', context)).toThrow('reporting cycle');
    expect(() => changePersonTeamSafeUat(state, 'PERSON-02', 'TEAM-C', teams, context)).toThrow('inactive');
    expect(() => changePersonTeamSafeUat(state, 'PERSON-02', 'TEAM-UNKNOWN', teams, context)).toThrow('was not found');
  });

  it('uses deactivate rather than exposing a Person delete operation', () => {
    expect(Object.keys(PeopleUatApi).filter(key => key.toLowerCase().indexOf('delete') >= 0)).toEqual([]);
  });

  it('blocks a forged non-local persistence boundary', () => {
    const safe = createAdminPeopleUatState(makePeople());
    const forged = { ...safe, persistence: 'SharePoint' } as unknown as IAdminPeopleUatState;

    expect(() => setPersonActiveSafeUat(forged, 'PERSON-02', false, context)).toThrow('safe local UAT boundary');
  });
});
