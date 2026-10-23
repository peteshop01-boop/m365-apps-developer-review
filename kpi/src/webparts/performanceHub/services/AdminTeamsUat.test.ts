import type { IProductionPerson } from '../models/ProductionModels';
import type { IAdminTeamsUatState } from '../models/AdminFoundationModels';
import * as TeamsUatApi from './AdminTeamsUat';
import {
  ADMIN_TEAMS_SCHEMA_CONTRACT,
  addTeamSafeUat,
  createAdminTeamsUatState,
  editTeamSafeUat,
  getAdminTeamsSummary,
  getTeamMembershipCount,
  listAdminTeams,
  setTeamActiveSafeUat
} from './AdminTeamsUat';

const context = {
  actorEmail: 'admin.uat@example.invalid',
  occurredAt: '2026-08-21T12:30:00.000Z'
};

const people: IProductionPerson[] = [
  {
    id: 1,
    personKey: 'LEAD-A',
    displayName: 'Synthetic Lead',
    email: 'lead.a@example.invalid',
    team: 'TEAM-B',
    appRoles: ['Employee'],
    active: true
  },
  {
    id: 2,
    personKey: 'MEMBER-A',
    displayName: 'Synthetic Member',
    email: 'member.a@example.invalid',
    team: 'TEAM-B',
    appRoles: ['Employee'],
    active: false
  }
];

describe('KCF-KPI-020A Teams Admin pure safe-UAT domain', () => {
  it('represents the legitimate empty production state as unconfigured without inventing Team names', () => {
    const state = createAdminTeamsUatState();

    expect(state.records).toEqual([]);
    expect(getAdminTeamsSummary(state)).toEqual({
      configurationState: 'Unconfigured',
      message: 'Teams not configured',
      totalCount: 0,
      activeCount: 0,
      inactiveCount: 0
    });
    expect(ADMIN_TEAMS_SCHEMA_CONTRACT).toEqual({
      listTitle: 'KCFKPI_Teams',
      fields: ['TeamKey', 'TeamName', 'TeamLeadPersonKey', 'Active', 'SortOrder'],
      teamNames: 'AdminConfigured',
      membershipSource: 'KCFKPI_People.Team'
    });
  });

  it('adds, edits, deactivates and reactivates a Team only in browser memory', () => {
    const source: never[] = [];
    let state = createAdminTeamsUatState(source);

    state = addTeamSafeUat(state, {
      teamKey: 'TEAM-UAT',
      teamName: 'Synthetic UAT Team',
      teamLeadPersonKey: 'LEAD-A',
      active: true,
      sortOrder: 20
    }, people, context);
    state = editTeamSafeUat(state, 'TEAM-UAT', {
      teamName: 'Edited Synthetic UAT Team',
      clearTeamLead: true,
      sortOrder: 10
    }, people, context);
    state = setTeamActiveSafeUat(state, 'TEAM-UAT', false, context);
    state = setTeamActiveSafeUat(state, 'TEAM-UAT', true, context);

    expect(state.records).toEqual([{
      id: 1,
      teamKey: 'TEAM-UAT',
      teamName: 'Edited Synthetic UAT Team',
      teamLeadPersonKey: undefined,
      active: true,
      sortOrder: 10
    }]);
    expect(state).toMatchObject({
      mode: 'SafeLocalUat',
      sourceList: 'KCFKPI_Teams',
      persistence: 'BrowserMemoryOnly',
      configurationState: 'Configured'
    });
    expect(state.audit.map(event => event.action)).toEqual([
      'TeamAdded', 'TeamEdited', 'TeamDeactivated', 'TeamReactivated'
    ]);
    expect(source).toEqual([]);
  });

  it('validates Team Lead, stable identity, display name and SortOrder', () => {
    let state = createAdminTeamsUatState();
    state = addTeamSafeUat(state, {
      teamKey: 'TEAM-A',
      teamName: 'Synthetic Alpha',
      sortOrder: 1
    }, people, context);

    expect(() => addTeamSafeUat(state, {
      teamKey: 'TEAM-A',
      teamName: 'Different name',
      sortOrder: 2
    }, people, context)).toThrow('already exists');
    expect(() => addTeamSafeUat(state, {
      teamKey: 'TEAM-B',
      teamName: 'Synthetic Alpha',
      sortOrder: 2
    }, people, context)).toThrow('already exists');
    expect(() => addTeamSafeUat(state, {
      teamKey: 'TEAM-C',
      teamName: 'Invalid lead',
      teamLeadPersonKey: 'UNKNOWN',
      sortOrder: 3
    }, people, context)).toThrow('was not found');
    expect(() => editTeamSafeUat(state, 'TEAM-A', { sortOrder: -1 }, people, context)).toThrow('non-negative whole number');
  });

  it('sorts for display and derives membership only from People.Team', () => {
    let state = createAdminTeamsUatState();
    state = addTeamSafeUat(state, { teamKey: 'TEAM-B', teamName: 'Second by sort', sortOrder: 20 }, people, context);
    state = addTeamSafeUat(state, { teamKey: 'TEAM-A', teamName: 'First by sort', sortOrder: 10 }, people, context);

    expect(listAdminTeams(state).map(team => team.teamKey)).toEqual(['TEAM-A', 'TEAM-B']);
    expect(getTeamMembershipCount(people, 'TEAM-B')).toBe(2);
    expect(getTeamMembershipCount(people, 'TEAM-B', true)).toBe(1);
    expect(getTeamMembershipCount(people, 'TEAM-A')).toBe(0);
  });

  it('uses deactivate rather than exposing a Team delete operation', () => {
    expect(Object.keys(TeamsUatApi).filter(key => key.toLowerCase().indexOf('delete') >= 0)).toEqual([]);
  });

  it('blocks a forged production persistence boundary', () => {
    const safe = createAdminTeamsUatState();
    const forged = { ...safe, persistence: 'SharePoint' } as unknown as IAdminTeamsUatState;

    expect(() => addTeamSafeUat(forged, {
      teamKey: 'TEAM-UAT',
      teamName: 'Synthetic UAT Team',
      sortOrder: 1
    }, people, context)).toThrow('safe local UAT boundary');
  });
});
