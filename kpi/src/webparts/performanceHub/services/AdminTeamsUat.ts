import type { IProductionPerson } from '../models/ProductionModels';
import type {
  IAdminTeamDraft,
  IAdminTeamEdit,
  IAdminTeamRecord,
  IAdminTeamsSummary,
  IAdminTeamsUatState,
  AdminUatAction,
  IAdminUatContext
} from '../models/AdminFoundationModels';

export const ADMIN_TEAMS_SCHEMA_CONTRACT = {
  listTitle: 'KCFKPI_Teams' as const,
  fields: ['TeamKey', 'TeamName', 'TeamLeadPersonKey', 'Active', 'SortOrder'] as readonly string[],
  teamNames: 'AdminConfigured' as const,
  membershipSource: 'KCFKPI_People.Team' as const
};

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();

const cloneTeam = (team: IAdminTeamRecord): IAdminTeamRecord => ({ ...team });

const assertContext = (context: IAdminUatContext): void => {
  if (!clean(context.actorEmail) || !clean(context.occurredAt)) {
    throw new Error('Safe Admin UAT mutations require an actor email and timestamp.');
  }
};

const assertSafeState = (state: IAdminTeamsUatState): void => {
  if (state.mode !== 'SafeLocalUat' || state.persistence !== 'BrowserMemoryOnly') {
    throw new Error('Teams Admin mutation was blocked outside the safe local UAT boundary.');
  }
};

const assertSortOrder = (sortOrder: number): void => {
  if (!isFinite(sortOrder) || sortOrder < 0 || Math.floor(sortOrder) !== sortOrder) {
    throw new Error('Team SortOrder must be a non-negative whole number.');
  }
};

const findTeam = (records: readonly IAdminTeamRecord[], teamKey: string): IAdminTeamRecord | undefined => {
  const wanted = normalise(teamKey);
  return records.filter(team => normalise(team.teamKey) === wanted)[0];
};

const requireTeam = (records: readonly IAdminTeamRecord[], teamKey: string): IAdminTeamRecord => {
  const team = findTeam(records, teamKey);
  if (!team) throw new Error(`TeamKey ${clean(teamKey) || '(blank)'} was not found in safe Admin UAT.`);
  return team;
};

const requireActiveLead = (
  people: readonly IProductionPerson[],
  personKey: string | undefined
): IProductionPerson | undefined => {
  const key = clean(personKey);
  if (!key) return undefined;
  const lead = people.filter(person => normalise(person.personKey) === normalise(key))[0];
  if (!lead) throw new Error(`Team Lead PersonKey ${key} was not found.`);
  if (!lead.active) throw new Error(`Team Lead ${lead.personKey} is inactive.`);
  return lead;
};

const requireUniqueTeam = (
  records: readonly IAdminTeamRecord[],
  teamKey: string,
  teamName: string,
  excludingTeamKey?: string
): void => {
  if (!clean(teamKey) || !clean(teamName)) throw new Error('TeamKey and TeamName are required.');
  records.forEach(team => {
    if (excludingTeamKey && normalise(team.teamKey) === normalise(excludingTeamKey)) return;
    if (normalise(team.teamKey) === normalise(teamKey)) throw new Error(`TeamKey ${clean(teamKey)} already exists.`);
    if (normalise(team.teamName) === normalise(teamName)) throw new Error(`TeamName ${clean(teamName)} already exists.`);
  });
};

const nextId = (records: readonly IAdminTeamRecord[]): number => {
  let maximum = 0;
  records.forEach(record => { if (record.id > maximum) maximum = record.id; });
  return maximum + 1;
};

const configurationState = (records: readonly IAdminTeamRecord[]): 'Unconfigured' | 'Configured' => (
  records.length ? 'Configured' : 'Unconfigured'
);

const replaceTeam = (
  records: readonly IAdminTeamRecord[],
  teamKey: string,
  replacement: IAdminTeamRecord
): IAdminTeamRecord[] => records.map(team => (
  normalise(team.teamKey) === normalise(teamKey) ? cloneTeam(replacement) : cloneTeam(team)
));

const appendAudit = (
  state: IAdminTeamsUatState,
  action: AdminUatAction,
  teamKey: string,
  change: string,
  context: IAdminUatContext,
  records: readonly IAdminTeamRecord[]
): IAdminTeamsUatState => ({
  ...state,
  configurationState: configurationState(records),
  records,
  audit: state.audit.concat([{
    sequence: state.audit.length + 1,
    entityType: 'Team',
    recordKey: teamKey,
    action,
    actorEmail: clean(context.actorEmail),
    occurredAt: clean(context.occurredAt),
    change
  }])
});

export const createAdminTeamsUatState = (
  productionReadRecords: readonly IAdminTeamRecord[] = []
): IAdminTeamsUatState => ({
  mode: 'SafeLocalUat',
  sourceList: 'KCFKPI_Teams',
  persistence: 'BrowserMemoryOnly',
  configurationState: configurationState(productionReadRecords),
  records: productionReadRecords.map(cloneTeam),
  audit: []
});

export const getAdminTeamsSummary = (state: IAdminTeamsUatState): IAdminTeamsSummary => {
  const activeCount = state.records.filter(team => team.active).length;
  return {
    configurationState: state.configurationState,
    message: state.configurationState === 'Unconfigured' ? 'Teams not configured' : 'Teams configured',
    totalCount: state.records.length,
    activeCount,
    inactiveCount: state.records.length - activeCount
  };
};

export const listAdminTeams = (state: IAdminTeamsUatState): readonly IAdminTeamRecord[] => (
  state.records.map(cloneTeam).sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    const byName = left.teamName.localeCompare(right.teamName);
    return byName || left.teamKey.localeCompare(right.teamKey);
  })
);

export const getTeamMembershipCount = (
  people: readonly IProductionPerson[],
  teamKey: string,
  activePeopleOnly: boolean = false
): number => people.filter(person => (
  normalise(person.team) === normalise(teamKey) && (!activePeopleOnly || person.active)
)).length;

export const addTeamSafeUat = (
  state: IAdminTeamsUatState,
  draft: IAdminTeamDraft,
  people: readonly IProductionPerson[],
  context: IAdminUatContext
): IAdminTeamsUatState => {
  assertSafeState(state);
  assertContext(context);
  requireUniqueTeam(state.records, draft.teamKey, draft.teamName);
  assertSortOrder(draft.sortOrder);
  const lead = requireActiveLead(people, draft.teamLeadPersonKey);
  const team: IAdminTeamRecord = {
    id: nextId(state.records),
    teamKey: clean(draft.teamKey),
    teamName: clean(draft.teamName),
    teamLeadPersonKey: lead?.personKey,
    active: draft.active !== false,
    sortOrder: draft.sortOrder
  };
  return appendAudit(
    state,
    'TeamAdded',
    team.teamKey,
    `Added ${team.teamName} as ${team.active ? 'Active' : 'Inactive'}.`,
    context,
    state.records.map(cloneTeam).concat([team])
  );
};

export const editTeamSafeUat = (
  state: IAdminTeamsUatState,
  teamKey: string,
  patch: IAdminTeamEdit,
  people: readonly IProductionPerson[],
  context: IAdminUatContext
): IAdminTeamsUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requireTeam(state.records, teamKey);
  if (patch.clearTeamLead && patch.teamLeadPersonKey) {
    throw new Error('Choose either a replacement Team Lead or Clear Team Lead, not both.');
  }
  const teamName = patch.teamName === undefined ? current.teamName : clean(patch.teamName);
  const sortOrder = patch.sortOrder === undefined ? current.sortOrder : patch.sortOrder;
  requireUniqueTeam(state.records, current.teamKey, teamName, current.teamKey);
  assertSortOrder(sortOrder);
  let leadPersonKey = current.teamLeadPersonKey;
  if (patch.clearTeamLead) leadPersonKey = undefined;
  else if (patch.teamLeadPersonKey !== undefined) leadPersonKey = requireActiveLead(people, patch.teamLeadPersonKey)?.personKey;
  const next: IAdminTeamRecord = {
    ...cloneTeam(current),
    teamName,
    teamLeadPersonKey: leadPersonKey,
    sortOrder
  };
  const changedFields: string[] = [];
  if (next.teamName !== current.teamName) changedFields.push('TeamName');
  if (normalise(next.teamLeadPersonKey) !== normalise(current.teamLeadPersonKey)) changedFields.push('TeamLeadPersonKey');
  if (next.sortOrder !== current.sortOrder) changedFields.push('SortOrder');
  if (!changedFields.length) return state;
  return appendAudit(
    state,
    'TeamEdited',
    current.teamKey,
    `Changed ${changedFields.join(', ')}.`,
    context,
    replaceTeam(state.records, current.teamKey, next)
  );
};

export const setTeamActiveSafeUat = (
  state: IAdminTeamsUatState,
  teamKey: string,
  active: boolean,
  context: IAdminUatContext
): IAdminTeamsUatState => {
  assertSafeState(state);
  assertContext(context);
  const current = requireTeam(state.records, teamKey);
  if (current.active === active) return state;
  const next = { ...cloneTeam(current), active };
  return appendAudit(
    state,
    active ? 'TeamReactivated' : 'TeamDeactivated',
    current.teamKey,
    `Active changed from ${current.active} to ${active}.`,
    context,
    replaceTeam(state.records, current.teamKey, next)
  );
};
