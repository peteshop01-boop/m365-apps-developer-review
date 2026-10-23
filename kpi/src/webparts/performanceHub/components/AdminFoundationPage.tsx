import * as React from 'react';
import type { IProductionPerson } from '../models/ProductionModels';
import type {
  IAdminPeopleUatState,
  IAdminPersonDraft,
  IAdminTeamsUatState,
  IAdminTeamDraft
} from '../models/AdminFoundationModels';
import type { IBehaviourObjectiveLibraryRecord } from '../models/BehaviourWorkplanModels';
import type { IKpiDataQualityQueue } from '../services/KpiDataQuality';
import {
  addPersonSafeUat,
  changePersonManagerSafeUat,
  changePersonTeamSafeUat,
  editPersonSafeUat,
  inspectAdminPeopleReadPath,
  setPersonActiveSafeUat
} from '../services/AdminPeopleUat';
import {
  addTeamSafeUat,
  editTeamSafeUat,
  getAdminTeamsSummary,
  listAdminTeams,
  setTeamActiveSafeUat
} from '../services/AdminTeamsUat';
import { buildAdminHierarchy, flattenVisibleAdminHierarchy, toggleAdminHierarchyExpansion } from '../services/AdminHierarchy';
import type {
  IAdminConfigCategoryGroup,
  IAdminConfigSourceRecord,
  IAdminTypedConfigShell
} from '../services/AdminConfigDomain';
import {
  buildAdminConfigView,
  buildAdminTypedConfigShell,
  formatAdminConfigValue,
  validateAdminConfigGroupReplacements
} from '../services/AdminConfigDomain';
import type {
  IAdminDataQualityFilters,
  IAdminDataQualityIssue,
  IAdminReportingReadinessInput
} from '../services/AdminDataQualityDomain';
import { buildAdminDataQualityView, buildOperationalAdminDataQualityIssues } from '../services/AdminDataQualityDomain';
import type {
  AdminControlledEventQuarter,
  IAdminEventHistoryFilters,
  IAdminEventHistoryView
} from '../services/AdminEventHistoryDomain';
import { filterAuthorisedAdminEventHistoryView } from '../services/AdminEventHistoryDomain';
import type { IBehaviourCatalogueAdministrationGateway } from '../services/BehaviourCatalogueAdministration';
import AdminFoundationBehaviourCatalogue from './AdminFoundationPage.behaviourCatalogue';
import BehaviourObjectiveLibraryAdminPage from './BehaviourObjectiveLibraryAdminPage';
import styles from './AdminFoundationPage.module.scss';

export type AdminFoundationArea = 'home' | 'people' | 'hierarchy' | 'teams' | 'behaviourLibrary' | 'config' | 'dataQuality' | 'eventHistory';

export interface IAdminFoundationEventHistoryInput {
  view: IAdminEventHistoryView;
}

export interface IAdminFoundationPageProps {
  peopleState: IAdminPeopleUatState;
  teamsState: IAdminTeamsUatState;
  behaviourLibrary: readonly IBehaviourObjectiveLibraryRecord[];
  configRecords: readonly IAdminConfigSourceRecord[];
  configShellBoundary?: Readonly<{ environment: string; performanceYear: number }>;
  kpiDataQualityQueue: IKpiDataQualityQueue;
  reportingChecks?: readonly IAdminReportingReadinessInput[];
  eventHistory?: IAdminFoundationEventHistoryInput;
  behaviourCatalogueAdministration?: IBehaviourCatalogueAdministrationGateway;
  localUat: boolean;
  productionIdentity: string;
  actorEmail: string;
  loadMessage?: string;
  onPeopleChange?(state: IAdminPeopleUatState): void;
  onTeamsChange?(state: IAdminTeamsUatState): void;
  onBehaviourLibraryChange?(records: IBehaviourObjectiveLibraryRecord[]): void;
  onConfigChange?(records: IAdminConfigSourceRecord[]): void;
}

const foundationAreas: readonly { key: AdminFoundationArea; label: string; description: string }[] = [
  { key: 'home', label: 'Admin Home', description: 'Attention and destinations' },
  { key: 'people', label: 'People', description: 'Identity, manager and Team' },
  { key: 'hierarchy', label: 'Hierarchy', description: 'Dynamic reporting lines' },
  { key: 'teams', label: 'Teams', description: 'Separate Team dimension' },
  { key: 'behaviourLibrary', label: 'Behaviour Library', description: 'Objective choices' },
  { key: 'config', label: 'Config', description: 'Typed settings' },
  { key: 'dataQuality', label: 'Data Quality', description: 'Actionable issue queues' }
];

const eventHistoryArea = {
  key: 'eventHistory' as AdminFoundationArea,
  label: 'Event History',
  description: 'Read-only controlled events'
};

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();
const mutationContext = (actorEmail: string): { actorEmail: string; occurredAt: string } => ({
  actorEmail,
  occurredAt: new Date().toISOString()
});

const emptyPersonDraft = (): IAdminPersonDraft => ({
  personKey: '', displayName: '', email: '', managerPersonKey: undefined,
  teamKey: undefined, jobRole: '', appRoles: ['Employee'], active: true
});

const emptyTeamDraft = (): IAdminTeamDraft => ({
  teamKey: '', teamName: '', teamLeadPersonKey: undefined, active: true, sortOrder: 10
});

const rolesText = (person: IProductionPerson): string => person.appRoles.join(', ');

const AdminFoundationPage: React.FC<IAdminFoundationPageProps> = props => {
  const {
    peopleState, teamsState, behaviourLibrary, configRecords, configShellBoundary, kpiDataQualityQueue,
    reportingChecks = [], eventHistory, behaviourCatalogueAdministration, localUat, productionIdentity,
    actorEmail, loadMessage, onPeopleChange, onTeamsChange,
    onBehaviourLibraryChange, onConfigChange
  } = props;
  const [area, setArea] = React.useState<AdminFoundationArea>('home');
  const [status, setStatus] = React.useState('Choose an Admin destination.');
  const [personSearch, setPersonSearch] = React.useState('');
  const [selectedPersonKey, setSelectedPersonKey] = React.useState('');
  const [personDraft, setPersonDraft] = React.useState<IAdminPersonDraft>(() => emptyPersonDraft());
  const [personEdit, setPersonEdit] = React.useState({ displayName: '', email: '', jobRole: '', appRoles: '' });
  const [teamDraft, setTeamDraft] = React.useState<IAdminTeamDraft>(() => emptyTeamDraft());
  const [selectedTeamKey, setSelectedTeamKey] = React.useState('');
  const [teamEdit, setTeamEdit] = React.useState({ teamName: '', teamLeadPersonKey: '', sortOrder: '10' });
  const [expandedKeys, setExpandedKeys] = React.useState<readonly string[]>([]);
  const [configDrafts, setConfigDrafts] = React.useState<{ [key: string]: string }>({});
  const [dqFilters, setDqFilters] = React.useState<IAdminDataQualityFilters>({});
  const [historyFilters, setHistoryFilters] = React.useState<IAdminEventHistoryFilters>({});

  const teams = listAdminTeams(teamsState);
  const teamSummary = getAdminTeamsSummary(teamsState);
  const peopleRead = inspectAdminPeopleReadPath(peopleState.records);
  const hierarchy = buildAdminHierarchy(peopleState.records, expandedKeys, true);
  const visibleHierarchy = flattenVisibleAdminHierarchy(hierarchy.roots);
  const configView = buildAdminConfigView(configRecords);
  let configShell: IAdminTypedConfigShell | undefined;
  let configShellIssue = '';
  if (configShellBoundary) {
    try {
      configShell = buildAdminTypedConfigShell(
        configRecords,
        configShellBoundary.environment,
        configShellBoundary.performanceYear
      );
    } catch (error) {
      configShellIssue = error instanceof Error ? error.message : 'Admin Config typed shell was blocked.';
    }
  }
  const operationalIssues = buildOperationalAdminDataQualityIssues({
    people: peopleState.records.map(person => ({
      personKey: person.personKey,
      displayName: person.displayName,
      email: person.email,
      managerPersonKey: person.managerPersonKey,
      managerEmail: person.managerEmail,
      teamKey: person.team,
      active: person.active
    })),
    teams: teams.map(team => ({ ...team })),
    reportingChecks,
    hierarchy: {
      topLevel: hierarchy.topLevel,
      issues: hierarchy.issues
    }
  });
  const dqView = buildAdminDataQualityView(kpiDataQualityQueue, operationalIssues, dqFilters);
  let historyView: IAdminEventHistoryView | undefined;
  let historyIssue = '';
  if (eventHistory) {
    try {
      historyView = filterAuthorisedAdminEventHistoryView(eventHistory.view, historyFilters);
    } catch (error) {
      historyIssue = error instanceof Error ? error.message : 'Admin event history was blocked.';
    }
  }
  const areas = eventHistory ? foundationAreas.concat([eventHistoryArea]) : foundationAreas;
  const selectedPerson = peopleState.records.filter(person => person.personKey === selectedPersonKey)[0];
  const selectedTeam = teams.filter(team => team.teamKey === selectedTeamKey)[0];
  const mutationDisabled = !localUat;

  React.useEffect(() => {
    if (!selectedPerson) return;
    setPersonEdit({
      displayName: selectedPerson.displayName,
      email: selectedPerson.email,
      jobRole: selectedPerson.jobRole || '',
      appRoles: rolesText(selectedPerson)
    });
  }, [selectedPersonKey, selectedPerson?.displayName, selectedPerson?.email, selectedPerson?.jobRole, selectedPerson?.appRoles.join('|')]);

  React.useEffect(() => {
    if (!selectedTeam) return;
    setTeamEdit({
      teamName: selectedTeam.teamName,
      teamLeadPersonKey: selectedTeam.teamLeadPersonKey || '',
      sortOrder: String(selectedTeam.sortOrder)
    });
  }, [selectedTeamKey, selectedTeam?.teamName, selectedTeam?.teamLeadPersonKey, selectedTeam?.sortOrder]);

  React.useEffect(() => {
    const next: { [key: string]: string } = {};
    configView.groups.forEach(group => group.items.forEach(item => {
      next[item.definition.key] = item.record ? formatAdminConfigValue(item.record) : '';
    }));
    setConfigDrafts(next);
  }, [configRecords]);

  const run = (action: () => void, success: string): void => {
    try {
      action();
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The Admin action was blocked.');
    }
  };

  const filteredPeople = peopleState.records.filter(person => {
    const needle = normalise(personSearch);
    return !needle || [person.displayName, person.email, person.personKey, person.team, person.jobRole]
      .some(value => normalise(value).indexOf(needle) >= 0);
  });

  const addPerson = (): void => run(() => {
    if (!onPeopleChange) throw new Error('People changes are not enabled in this view.');
    const next = addPersonSafeUat(peopleState, personDraft, teams, mutationContext(actorEmail));
    onPeopleChange(next);
    setSelectedPersonKey(clean(personDraft.personKey));
    setPersonDraft(emptyPersonDraft());
  }, 'Person added in browser memory only.');

  const savePerson = (): void => run(() => {
    if (!selectedPerson || !onPeopleChange) throw new Error('Choose a Person before saving.');
    onPeopleChange(editPersonSafeUat(peopleState, selectedPerson.personKey, {
      displayName: personEdit.displayName,
      email: personEdit.email,
      jobRole: personEdit.jobRole,
      appRoles: personEdit.appRoles.split(',').map(value => value.trim()).filter(Boolean)
    }, mutationContext(actorEmail)));
  }, 'Person details saved in browser memory only.');

  const setPersonActive = (): void => run(() => {
    if (!selectedPerson || !onPeopleChange) throw new Error('Choose a Person first.');
    onPeopleChange(setPersonActiveSafeUat(peopleState, selectedPerson.personKey, !selectedPerson.active, mutationContext(actorEmail)));
  }, `${selectedPerson?.active ? 'Person deactivated' : 'Person reactivated'} in browser memory only.`);

  const changeManager = (managerPersonKey: string): void => run(() => {
    if (!selectedPerson || !onPeopleChange) throw new Error('Choose a Person first.');
    onPeopleChange(changePersonManagerSafeUat(peopleState, selectedPerson.personKey, managerPersonKey || undefined, mutationContext(actorEmail)));
  }, 'Manager changed in browser memory only.');

  const changeTeam = (teamKey: string): void => run(() => {
    if (!selectedPerson || !onPeopleChange) throw new Error('Choose a Person first.');
    onPeopleChange(changePersonTeamSafeUat(peopleState, selectedPerson.personKey, teamKey || undefined, teams, mutationContext(actorEmail)));
  }, 'Team assignment changed in browser memory only.');

  const addTeam = (): void => run(() => {
    if (!onTeamsChange) throw new Error('Team changes are not enabled in this view.');
    const next = addTeamSafeUat(teamsState, teamDraft, peopleState.records, mutationContext(actorEmail));
    onTeamsChange(next);
    setSelectedTeamKey(clean(teamDraft.teamKey));
    setTeamDraft(emptyTeamDraft());
  }, 'Team added in browser memory only.');

  const saveTeam = (): void => run(() => {
    if (!selectedTeam || !onTeamsChange) throw new Error('Choose a Team before saving.');
    onTeamsChange(editTeamSafeUat(teamsState, selectedTeam.teamKey, {
      teamName: teamEdit.teamName,
      teamLeadPersonKey: teamEdit.teamLeadPersonKey || undefined,
      clearTeamLead: !teamEdit.teamLeadPersonKey,
      sortOrder: Number(teamEdit.sortOrder)
    }, peopleState.records, mutationContext(actorEmail)));
  }, 'Team saved in browser memory only.');

  const setTeamActive = (): void => run(() => {
    if (!selectedTeam || !onTeamsChange) throw new Error('Choose a Team first.');
    onTeamsChange(setTeamActiveSafeUat(teamsState, selectedTeam.teamKey, !selectedTeam.active, mutationContext(actorEmail)));
  }, `${selectedTeam?.active ? 'Team deactivated' : 'Team reactivated'} in browser memory only.`);

  const saveConfigGroup = (group: IAdminConfigCategoryGroup): void => run(() => {
    if (!onConfigChange) throw new Error('Config changes are not enabled in this view.');
    const replacements = group.items.map((item, index): IAdminConfigSourceRecord => {
      const value = configDrafts[item.definition.key] || '';
      const booleanValue = normalise(value) === 'true' ? true : normalise(value) === 'false' ? false : undefined;
      return {
        ...(item.record || {}),
        id: item.record?.id || -(configRecords.length + index + 1),
        key: item.definition.key,
        valueType: item.definition.valueType,
        active: true,
        textValue: item.definition.valueType === 'Text' ? value : undefined,
        numberValue: item.definition.valueType === 'Number' && clean(value) ? Number(value) : undefined,
        booleanValue: item.definition.valueType === 'Boolean' ? booleanValue : undefined,
        dateValue: item.definition.valueType === 'Date' ? value : undefined,
        jsonValue: item.definition.valueType === 'JSON' ? value : undefined,
        modifiedAt: new Date().toISOString(),
        modifiedBy: actorEmail
      };
    });
    const checked = validateAdminConfigGroupReplacements(configRecords, group.category, replacements);
    if (!checked.result.valid) throw new Error(checked.result.issues.map(issue => issue.message).join(' '));
    onConfigChange(checked.candidate);
  }, `${group.title} saved atomically in browser memory only.`);

  const setSingleFilter = <K extends keyof IAdminDataQualityFilters>(key: K, value: string): void => {
    setDqFilters(current => ({ ...current, [key]: value ? [value] : undefined }));
  };

  const renderHome = (): React.ReactElement => {
    const inactivePeople = peopleState.records.filter(person => !person.active).length;
    const peopleReadConfirmed = peopleRead.valid && peopleRead.matchesCurrentRecordCount;
    const cards = [
      { area: 'people' as AdminFoundationArea, label: 'People records', value: peopleState.records.length, note: peopleReadConfirmed ? `${inactivePeople} inactive · signed ${peopleRead.expectedCurrentRecordCount}-record read path confirmed` : `${inactivePeople} inactive · ${peopleRead.issues[0] || 'read path not confirmed'}` },
      { area: 'hierarchy' as AdminFoundationArea, label: 'Manager relationship issues', value: hierarchy.issues.length, note: `${hierarchy.totalEmployeeCount} people across ${hierarchy.maximumDepth + 1} level${hierarchy.maximumDepth === 0 ? '' : 's'}` },
      { area: 'teams' as AdminFoundationArea, label: 'Teams', value: teamSummary.totalCount, note: teamSummary.message },
      { area: 'behaviourLibrary' as AdminFoundationArea, label: 'Behaviour objectives', value: behaviourLibrary.length, note: `${behaviourLibrary.filter(record => record.active).length} active` },
      { area: 'config' as AdminFoundationArea, label: 'Config problems', value: configView.attention.totalProblems, note: configView.attention.headline },
      { area: 'dataQuality' as AdminFoundationArea, label: 'Data Quality issues', value: dqView.attention.totalIssues, note: dqView.attention.priorityMeaning }
    ];
    if (historyView) cards.push({
      area: 'eventHistory',
      label: 'Controlled events',
      value: historyView.allEvents.length,
      note: 'Read-only attributable KCFKPI_Audit history'
    });
    return <section aria-labelledby="admin-home-heading">
      <header className={styles.sectionHeader}><span>Administration</span><h2 id="admin-home-heading">What needs Admin attention?</h2><p>Open a controlled foundation destination. Organisational weighting, Reporting Maps, outputs and publication readiness now live in the separate Reporting Control section.</p></header>
      <div className={styles.attentionGrid}>{cards.map(card => <button type="button" key={card.area} onClick={() => setArea(card.area)}>
        <span>{card.label}</span><strong>{card.value}</strong><small>{card.note}</small>
      </button>)}</div>
      <div className={styles.futureNote}><strong>Separate controlled area:</strong> use Reporting Control for organisational weighting, mappings, outputs and read-only Audit.</div>
    </section>;
  };

  const renderPeople = (): React.ReactElement => <section aria-labelledby="admin-people-heading">
    <header className={styles.sectionHeader}><span>KCFKPI_People</span><h2 id="admin-people-heading">People Admin</h2><p>Leavers are deactivated, not deleted. Manager and Team relationships remain separate.</p></header>
    <div className={styles.statStrip}><span><strong>{peopleState.records.length}</strong> records</span><span><strong>{peopleState.records.filter(person => person.active).length}</strong> active</span><span><strong>{peopleState.records.filter(person => !person.active).length}</strong> inactive</span><span className={peopleRead.valid && peopleRead.matchesCurrentRecordCount ? styles.good : styles.warning}>{peopleRead.valid && peopleRead.matchesCurrentRecordCount ? `${peopleRead.expectedCurrentRecordCount}-record read path confirmed` : peopleRead.issues.join(' ')}</span></div>
    <div className={styles.twoColumn}>
      <div className={styles.listPanel}>
        <label className={styles.field}><span>Search People</span><input value={personSearch} onChange={event => setPersonSearch(event.target.value)} placeholder="Name, email, role or Team" /></label>
        <div className={styles.cardList}>{filteredPeople.map(person => <button type="button" className={selectedPersonKey === person.personKey ? styles.selectedCard : styles.selectCard} key={person.personKey} onClick={() => setSelectedPersonKey(person.personKey)}>
          <strong>{person.displayName}</strong><span>{person.email}</span><small>{person.jobRole || 'Role not configured'} · {person.team || 'No Team'} · {person.active ? 'Active' : 'Inactive'}</small>
        </button>)}</div>
      </div>
      <div className={styles.detailPanel}>
        {selectedPerson ? <>
          <h3>Edit {selectedPerson.displayName}</h3>
          <div className={styles.formGrid}>
            <label className={styles.field}><span>Name</span><input disabled={mutationDisabled} value={personEdit.displayName} onChange={event => setPersonEdit(current => ({ ...current, displayName: event.target.value }))} /></label>
            <label className={styles.field}><span>Email</span><input disabled={mutationDisabled} value={personEdit.email} onChange={event => setPersonEdit(current => ({ ...current, email: event.target.value }))} /></label>
            <label className={styles.field}><span>Job role</span><input disabled={mutationDisabled} value={personEdit.jobRole} onChange={event => setPersonEdit(current => ({ ...current, jobRole: event.target.value }))} /></label>
            <label className={styles.field}><span>Application roles</span><input disabled={mutationDisabled} value={personEdit.appRoles} onChange={event => setPersonEdit(current => ({ ...current, appRoles: event.target.value }))} /></label>
            <label className={styles.field}><span>Manager</span><select disabled={mutationDisabled} value={selectedPerson.managerPersonKey || ''} onChange={event => changeManager(event.target.value)}><option value="">No manager / top-level pending validation</option>{peopleState.records.filter(person => person.active && person.personKey !== selectedPerson.personKey).map(person => <option key={person.personKey} value={person.personKey}>{person.displayName}</option>)}</select></label>
            <label className={styles.field}><span>Team</span><select disabled={mutationDisabled} value={selectedPerson.team || ''} onChange={event => changeTeam(event.target.value)}><option value="">No Team</option>{teams.filter(team => team.active).map(team => <option key={team.teamKey} value={team.teamKey}>{team.teamName}</option>)}</select></label>
          </div>
          <div className={styles.actions}><button type="button" disabled={mutationDisabled} onClick={savePerson}>Save details</button><button type="button" disabled={mutationDisabled} className={styles.secondary} onClick={setPersonActive}>{selectedPerson.active ? 'Deactivate' : 'Reactivate'}</button></div>
        </> : <p>Choose a Person to inspect or edit.</p>}
        <details className={styles.addPanel}><summary>Add Person</summary><div className={styles.formGrid}>
          <label className={styles.field}><span>PersonKey</span><input disabled={mutationDisabled} value={personDraft.personKey} onChange={event => setPersonDraft(current => ({ ...current, personKey: event.target.value }))} /></label>
          <label className={styles.field}><span>Name</span><input disabled={mutationDisabled} value={personDraft.displayName} onChange={event => setPersonDraft(current => ({ ...current, displayName: event.target.value }))} /></label>
          <label className={styles.field}><span>Email</span><input disabled={mutationDisabled} value={personDraft.email} onChange={event => setPersonDraft(current => ({ ...current, email: event.target.value }))} /></label>
          <label className={styles.field}><span>Job role</span><input disabled={mutationDisabled} value={personDraft.jobRole || ''} onChange={event => setPersonDraft(current => ({ ...current, jobRole: event.target.value }))} /></label>
          <label className={styles.field}><span>Manager</span><select disabled={mutationDisabled} value={personDraft.managerPersonKey || ''} onChange={event => setPersonDraft(current => ({ ...current, managerPersonKey: event.target.value || undefined }))}><option value="">No manager</option>{peopleState.records.filter(person => person.active).map(person => <option key={person.personKey} value={person.personKey}>{person.displayName}</option>)}</select></label>
          <label className={styles.field}><span>Team</span><select disabled={mutationDisabled} value={personDraft.teamKey || ''} onChange={event => setPersonDraft(current => ({ ...current, teamKey: event.target.value || undefined }))}><option value="">No Team</option>{teams.filter(team => team.active).map(team => <option key={team.teamKey} value={team.teamKey}>{team.teamName}</option>)}</select></label>
        </div><button type="button" disabled={mutationDisabled} onClick={addPerson}>Add Person</button></details>
      </div>
    </div>
  </section>;

  const renderHierarchy = (): React.ReactElement => <section aria-labelledby="admin-hierarchy-heading">
    <header className={styles.sectionHeader}><span>Derived from People.ManagerPersonKey</span><h2 id="admin-hierarchy-heading">Reporting hierarchy</h2><p>No KCF names or Teams are inferred. Expand a manager to follow deeper reporting lines.</p></header>
    <div className={styles.statStrip}><span><strong>{hierarchy.totalEmployeeCount}</strong> employees</span><span><strong>{hierarchy.roots.length}</strong> top-level rows</span><span className={hierarchy.topLevel.status === 'Resolved' ? styles.good : styles.warning}>{hierarchy.topLevel.status === 'Resolved' ? 'One active top-level lead resolved' : `${hierarchy.topLevel.activePersonKeys.length} active top-level candidates · ${hierarchy.topLevel.status}`}</span><span><strong>{hierarchy.maximumDepth + 1}</strong> levels</span><span className={hierarchy.issues.length ? styles.warning : styles.good}>{hierarchy.issues.length} relationship issues</span></div>
    <div className={styles.hierarchyList}>{visibleHierarchy.map(node => <div key={node.person.personKey} style={{ paddingLeft: `${node.depth * 22 + 12}px` }}>
      <button type="button" disabled={!node.directReportCount} onClick={() => setExpandedKeys(toggleAdminHierarchyExpansion(expandedKeys, node.person.personKey))}>{node.directReportCount ? (node.isExpanded ? '−' : '+') : '·'}</button>
      <span><strong>{node.person.displayName}</strong><small>{node.person.jobRole || 'Role not configured'} · {node.directReportCount} direct / {node.descendantCount} total reports</small></span>
      <em>{node.person.active ? 'Active' : 'Inactive'}</em>
    </div>)}</div>
    {hierarchy.issues.length > 0 && <div className={styles.issueBox}><h3>Relationship issues</h3>{hierarchy.issues.map(issue => <p key={`${issue.personKey}-${issue.issueType}`}><strong>{issue.issueType}</strong> · {issue.message}</p>)}</div>}
  </section>;

  const renderTeams = (): React.ReactElement => <section aria-labelledby="admin-teams-heading">
    <header className={styles.sectionHeader}><span>KCFKPI_Teams</span><h2 id="admin-teams-heading">Teams Admin</h2><p>Teams are an independent dimension. People membership uses TeamKey; reporting lines are not treated as Team membership.</p></header>
    {teamSummary.configurationState === 'Unconfigured' && <div className={styles.emptyState}><strong>Teams not configured</strong><span>No final KCF Team names have been invented. Add only approved Teams.</span></div>}
    <div className={styles.twoColumn}>
      <div className={styles.listPanel}><div className={styles.cardList}>{teams.map(team => <button type="button" className={selectedTeamKey === team.teamKey ? styles.selectedCard : styles.selectCard} key={team.teamKey} onClick={() => setSelectedTeamKey(team.teamKey)}><strong>{team.teamName}</strong><span>{team.teamKey}</span><small>{team.active ? 'Active' : 'Inactive'} · sort {team.sortOrder} · lead {team.teamLeadPersonKey || 'not configured'}</small></button>)}</div></div>
      <div className={styles.detailPanel}>{selectedTeam ? <>
        <h3>Edit {selectedTeam.teamName}</h3><div className={styles.formGrid}>
          <label className={styles.field}><span>Team name</span><input disabled={mutationDisabled} value={teamEdit.teamName} onChange={event => setTeamEdit(current => ({ ...current, teamName: event.target.value }))} /></label>
          <label className={styles.field}><span>Team Lead</span><select disabled={mutationDisabled} value={teamEdit.teamLeadPersonKey} onChange={event => setTeamEdit(current => ({ ...current, teamLeadPersonKey: event.target.value }))}><option value="">No Team Lead</option>{peopleState.records.filter(person => person.active).map(person => <option key={person.personKey} value={person.personKey}>{person.displayName}</option>)}</select></label>
          <label className={styles.field}><span>Sort order</span><input type="number" disabled={mutationDisabled} value={teamEdit.sortOrder} onChange={event => setTeamEdit(current => ({ ...current, sortOrder: event.target.value }))} /></label>
        </div><div className={styles.actions}><button type="button" disabled={mutationDisabled} onClick={saveTeam}>Save Team</button><button type="button" disabled={mutationDisabled} className={styles.secondary} onClick={setTeamActive}>{selectedTeam.active ? 'Deactivate' : 'Reactivate'}</button></div>
      </> : <p>Choose a Team to inspect or edit.</p>}
      <details className={styles.addPanel} open={teams.length === 0}><summary>Add approved Team</summary><div className={styles.formGrid}>
        <label className={styles.field}><span>TeamKey</span><input disabled={mutationDisabled} value={teamDraft.teamKey} onChange={event => setTeamDraft(current => ({ ...current, teamKey: event.target.value }))} /></label>
        <label className={styles.field}><span>Team name</span><input disabled={mutationDisabled} value={teamDraft.teamName} onChange={event => setTeamDraft(current => ({ ...current, teamName: event.target.value }))} /></label>
        <label className={styles.field}><span>Team Lead</span><select disabled={mutationDisabled} value={teamDraft.teamLeadPersonKey || ''} onChange={event => setTeamDraft(current => ({ ...current, teamLeadPersonKey: event.target.value || undefined }))}><option value="">No Team Lead</option>{peopleState.records.filter(person => person.active).map(person => <option key={person.personKey} value={person.personKey}>{person.displayName}</option>)}</select></label>
        <label className={styles.field}><span>Sort order</span><input type="number" disabled={mutationDisabled} value={teamDraft.sortOrder} onChange={event => setTeamDraft(current => ({ ...current, sortOrder: Number(event.target.value) }))} /></label>
      </div><button type="button" disabled={mutationDisabled} onClick={addTeam}>Add Team</button></details></div>
    </div>
  </section>;

  const renderConfig = (): React.ReactElement => {
    if (configShellBoundary && !configShell) return <section aria-labelledby="admin-config-heading">
      <header className={styles.sectionHeader}><span>KCFKPI_Config</span><h2 id="admin-config-heading">Config Admin</h2><p>Typed configuration remains hidden until its exact environment, year, identity, version and provenance boundary is valid.</p></header>
      <div className={styles.issueBox} role="alert"><p>{configShellIssue}</p></div>
    </section>;
    return <section aria-labelledby="admin-config-heading">
    <header className={styles.sectionHeader}><span>KCFKPI_Config</span><h2 id="admin-config-heading">Config Admin</h2><p>Supported typed values only. Reminder settings are metadata; this page does not send notifications or calculate Overall Delivery.</p></header>
    <div className={styles.statStrip}><span className={configView.validation.valid ? styles.good : styles.warning}>{configView.attention.headline}</span><span><strong>{configView.groups.length}</strong> categories</span><span><strong>{configView.unsupportedRecords.length}</strong> unsupported keys shown read-only</span>{configShell && <span className={styles.good}>Typed shell locked · {configShell.environment} · {configShell.performanceYear} · {configShell.records.length} versioned records</span>}</div>
    {configShell && <div className={styles.good} role="status"><strong>Governed Overall Delivery contract</strong><span>Core {configShell.overallDelivery.weights.core}% · Impact {configShell.overallDelivery.weights.impact}% · Behaviours excluded · total {configShell.overallDelivery.weights.total}%</span><small>Version {configShell.overallDelivery.versionToken}. The poor-Core masking guard remains a required downstream governed rule; no threshold or calculation is defined here.</small></div>}
    <div className={styles.configGroups}>{configView.groups.map(group => <section key={group.category}><h3>{group.title}<span>{group.attentionCount} issue{group.attentionCount === 1 ? '' : 's'}</span></h3><div className={styles.configGroupActions}><span>Stage related values, then validate and save this group together.</span><button type="button" disabled={mutationDisabled} onClick={() => saveConfigGroup(group)}>Validate and save group</button></div>{group.items.map(item => <article key={item.definition.key}>
      <div><strong>{item.definition.plainEnglishName}</strong><code>{item.definition.key}</code><p>{item.definition.description}</p></div>
      <label className={styles.field}><span>{item.definition.valueType} value</span>{item.definition.valueType === 'Boolean' ? <select disabled={mutationDisabled} value={configDrafts[item.definition.key] || ''} onChange={event => setConfigDrafts(current => ({ ...current, [item.definition.key]: event.target.value }))}><option value="">Choose value</option><option value="true">true</option><option value="false">false</option></select> : <input type={item.definition.valueType === 'Number' ? 'number' : item.definition.valueType === 'Date' ? 'date' : 'text'} disabled={mutationDisabled} value={configDrafts[item.definition.key] || ''} onChange={event => setConfigDrafts(current => ({ ...current, [item.definition.key]: event.target.value }))} />}</label>
      <div><span className={item.state === 'Valid' ? styles.good : styles.warning}>{item.state}</span><small>{item.lastUpdatedAt ? `Updated ${item.lastUpdatedAt} by ${item.lastUpdatedBy || 'unknown actor'}` : 'Update metadata not available'}</small>{item.record?.etag && <small>Version {item.record.etag} · {item.record.active ? 'Active' : 'Inactive'} · {item.record.changeReference || 'Change reference unavailable'}</small>}</div>
    </article>)}</section>)}</div>
  </section>;
  };

  const renderDataQuality = (): React.ReactElement => {
    const filter = <K extends keyof IAdminDataQualityFilters>(label: string, key: K, values: readonly string[]): React.ReactElement => <label className={styles.field}><span>{label}</span><select value={(dqFilters[key] && dqFilters[key]![0]) || ''} onChange={event => setSingleFilter(key, event.target.value)}><option value="">All</option>{values.map(value => <option key={value}>{value}</option>)}</select></label>;
    return <section aria-labelledby="admin-data-quality-heading">
      <header className={styles.sectionHeader}><span>Administration control</span><h2 id="admin-data-quality-heading">Data Quality</h2><p>{dqView.attention.priorityMeaning}</p></header>
      <div className={styles.filterGrid}>
        {filter('Priority', 'priorities', dqView.filterOptions.priorities)}
        {filter('Pillar', 'pillars', dqView.filterOptions.pillars)}
        {filter('Workstream', 'workstreams', dqView.filterOptions.workstreams)}
        {filter('Owner', 'owners', dqView.filterOptions.owners)}
        {filter('Issue type', 'issueTypes', dqView.filterOptions.issueTypes)}
        <button type="button" className={styles.secondary} onClick={() => setDqFilters({})}>Clear filters</button>
      </div>
      <div className={styles.statStrip}><span><strong>{dqView.filteredIssues.length}</strong> shown</span><span><strong>{dqView.attention.priorityCounts.P1}</strong> P1</span><span><strong>{dqView.attention.priorityCounts.P2}</strong> P2</span><span><strong>{dqView.attention.priorityCounts.P3}</strong> P3</span></div>
      <div className={styles.issueList}>{dqView.filteredIssues.map((issue: IAdminDataQualityIssue) => <article key={issue.issueKey}>
        <header><strong>{issue.title}</strong><span>{issue.priority} · {issue.issueType}</span></header><p>{issue.detail}</p><dl><div><dt>Scope</dt><dd>{issue.scope}</dd></div><div><dt>Owner</dt><dd>{issue.owner}</dd></div><div><dt>Pillar / Workstream</dt><dd>{issue.pillar || '—'} / {issue.workstream || '—'}</dd></div><div><dt>Status</dt><dd>{issue.status}</dd></div></dl><small>{issue.recommendedResolution} Source: {issue.sourceReference}</small>
      </article>)}</div>
    </section>;
  };

  const renderEventHistory = (): React.ReactElement => {
    if (!historyView) return <section aria-labelledby="admin-event-history-heading">
      <header className={styles.sectionHeader}><span>KCFKPI_Audit</span><h2 id="admin-event-history-heading">Controlled event history</h2><p>Append-only history is available only through the existing Admin application-role hook.</p></header>
      <div className={styles.issueBox} role="alert"><p>{historyIssue || 'No authorised bounded event-history input is available.'}</p></div>
    </section>;

    const setHistoryStrings = (
      key: 'actors' | 'states' | 'statuses',
      value: string
    ): void => setHistoryFilters(current => ({ ...current, [key]: value ? [value] : undefined }));
    const setHistoryYear = (value: string): void => setHistoryFilters(current => ({
      ...current,
      performanceYears: value ? [Number(value)] : undefined
    }));
    const setHistoryQuarter = (value: string): void => setHistoryFilters(current => ({
      ...current,
      quarters: value ? [value as AdminControlledEventQuarter] : undefined
    }));
    const selected = (key: keyof IAdminEventHistoryFilters): string => String(historyFilters[key]?.[0] || '');

    return <section aria-labelledby="admin-event-history-heading">
      <header className={styles.sectionHeader}><span>KCFKPI_Audit</span><h2 id="admin-event-history-heading">Controlled event history</h2><p>Attributable append-only events are shown read-only. Stable AuditKey identity and newest-first ordering are preserved.</p></header>
      <div className={styles.filterGrid}>
        <label className={styles.field}><span>Actor</span><select aria-label="Event history actor" value={selected('actors')} onChange={event => setHistoryStrings('actors', event.currentTarget.value)}><option value="">All</option>{historyView.filterOptions.actors.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.field}><span>State</span><select aria-label="Event history state" value={selected('states')} onChange={event => setHistoryStrings('states', event.currentTarget.value)}><option value="">All</option>{historyView.filterOptions.states.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.field}><span>Status</span><select aria-label="Event history status" value={selected('statuses')} onChange={event => setHistoryStrings('statuses', event.currentTarget.value)}><option value="">All</option>{historyView.filterOptions.statuses.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.field}><span>Performance year</span><select aria-label="Event history performance year" value={selected('performanceYears')} onChange={event => setHistoryYear(event.currentTarget.value)}><option value="">All</option>{historyView.filterOptions.performanceYears.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className={styles.field}><span>Quarter</span><select aria-label="Event history quarter" value={selected('quarters')} onChange={event => setHistoryQuarter(event.currentTarget.value)}><option value="">All</option>{historyView.filterOptions.quarters.map(value => <option key={value}>{value}</option>)}</select></label>
        <button type="button" className={styles.secondary} onClick={() => setHistoryFilters({})}>Clear history filters</button>
      </div>
      <div className={styles.statStrip}><span><strong>{historyView.filteredEvents.length}</strong> shown</span><span><strong>{historyView.allEvents.length}</strong> total</span><span>Read-only · edit/delete unavailable</span></div>
      <div className={styles.issueList}>{historyView.filteredEvents.map(record => <article key={record.auditKey}>
        <header><strong>{record.eventType}</strong><span>{record.auditKey}</span></header>
        <p>{record.subjectKey}</p>
        <dl><div><dt>Actor</dt><dd>{record.actorEmail}</dd></div><div><dt>State / status</dt><dd>{record.state || '—'} / {record.status || '—'}</dd></div><div><dt>Period</dt><dd>{record.performanceYear} · {record.quarter || 'No quarter'}</dd></div><div><dt>Occurred</dt><dd>{record.eventAt}</dd></div></dl>
        <small>{record.actorRole} · {record.source} · {record.sourceReference || record.correlationKey}</small>
      </article>)}</div>
      {historyView.filteredEvents.length === 0 && <div className={styles.emptyState}><strong>No matching controlled events</strong><span>Clear or change the bounded read-only filters.</span></div>}
    </section>;
  };

  const renderArea = (): React.ReactElement => {
    if (area === 'people') return renderPeople();
    if (area === 'hierarchy') return renderHierarchy();
    if (area === 'teams') return renderTeams();
    if (area === 'behaviourLibrary') return localUat && !behaviourCatalogueAdministration
      ? <BehaviourObjectiveLibraryAdminPage records={behaviourLibrary} disabled={mutationDisabled}
        localUat={localUat} onChange={onBehaviourLibraryChange} />
      : <AdminFoundationBehaviourCatalogue gateway={behaviourCatalogueAdministration} />;
    if (area === 'config') return renderConfig();
    if (area === 'dataQuality') return renderDataQuality();
    if (area === 'eventHistory') return renderEventHistory();
    return renderHome();
  };

  return <section className={styles.adminShell} aria-label="KCF Performance Hub Administration">
    <header className={styles.adminHeader}><div><span>Release D · Administration</span><h1>Admin Foundation</h1><p>People, hierarchy, Teams, Behaviour Library, Config and Data Quality.</p></div><div><strong>{localUat ? 'SAFE ADMIN UAT' : 'ADMIN READ VIEW'}</strong><span>{localUat ? 'Browser memory only · no SharePoint writes' : 'Application-role gated · storage ACL dependency remains'}</span></div></header>
    <div className={styles.identityBar}><span>Production identity (display only in UAT): <strong>{productionIdentity}</strong></span><span>Acting identity: <strong>{actorEmail}</strong></span></div>
    {loadMessage && <div className={styles.warningBanner}>{loadMessage}</div>}
    <nav className={styles.adminNav} aria-label="Admin destinations">{areas.map(item => <button type="button" key={item.key} aria-current={area === item.key ? 'page' : undefined} className={area === item.key ? styles.activeNav : ''} onClick={() => setArea(item.key)}><strong>{item.label}</strong><small>{item.description}</small></button>)}</nav>
    <div className={styles.statusBar} role="status">{status}</div>
    <main className={styles.adminContent}>{renderArea()}</main>
  </section>;
};

export default AdminFoundationPage;
