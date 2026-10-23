import type {
  IKpiDataQualityQueue,
  KpiDataQualityIssueCode,
  KpiDataQualityPriority,
  KpiDataQualityStatus
} from './KpiDataQuality';
import type {
  IAdminHierarchyIssue,
  IAdminHierarchyTopLevelResolution
} from '../models/AdminFoundationModels';
import type {
  IAdminKpiControlledRemediationCommand,
  IAdminKpiControlledRemediationPatch,
  IAdminKpiDefinitionIdentity
} from './AdminKpiMasterDomain';
import {
  ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE,
  adminKpiIssueTypeForCode,
  type AdminControlledKpiIssueType
} from './AdminControlledVocabulary';

export type AdminDataQualityIssueType = AdminControlledKpiIssueType;

export type AdminDataQualityScope = 'KPI' | 'People' | 'Teams' | 'Reporting' | 'Weighting';

export interface IAdminDataQualityIssue {
  issueKey: string;
  priority: KpiDataQualityPriority;
  issueType: AdminDataQualityIssueType;
  scope: AdminDataQualityScope;
  title: string;
  detail: string;
  recommendedResolution: string;
  status: KpiDataQualityStatus;
  sourceReference: string;
  sourceIssueCode?: KpiDataQualityIssueCode;
  kpiId?: string;
  /** Retained KPI source version, absent for operational domains. */
  kpiVersionKey?: string;
  personKey?: string;
  teamKey?: string;
  pillar?: string;
  workstream?: string;
  owner: string;
}

export interface IAdminDataQualityFilters {
  priorities?: readonly KpiDataQualityPriority[];
  pillars?: readonly string[];
  workstreams?: readonly string[];
  owners?: readonly string[];
  issueTypes?: readonly AdminDataQualityIssueType[];
}

export interface IAdminDataQualityFilterOptions {
  priorities: KpiDataQualityPriority[];
  pillars: string[];
  workstreams: string[];
  owners: string[];
  issueTypes: AdminDataQualityIssueType[];
}

export interface IAdminAttentionSummaryItem {
  key: 'DataQualityP1' | 'DataQualityP2' | 'DataQualityP3' | 'ManagerRelationships' | 'TeamConfiguration' | 'ReportingReadiness' | 'OrganisationalWeighting';
  label: string;
  count: number;
  priority?: KpiDataQualityPriority;
  destination: 'DataQuality';
  requiresAttention: boolean;
}

export interface IAdminDataQualityAttentionSummary {
  totalIssues: number;
  priorityCounts: Record<KpiDataQualityPriority, number>;
  issueTypeCounts: Record<AdminDataQualityIssueType, number>;
  affectedKpiCount: number;
  affectedPersonCount: number;
  affectedTeamCount: number;
  requiresAttention: boolean;
  /** Required language for Admin UI: issue priority must never be presented as employee performance. */
  priorityMeaning: 'P1/P2/P3 are issue-priority labels only; they are not employee performance ratings.';
  items: IAdminAttentionSummaryItem[];
}

export interface IAdminDataQualityView {
  allIssues: IAdminDataQualityIssue[];
  filteredIssues: IAdminDataQualityIssue[];
  filters: IAdminDataQualityFilters;
  filterOptions: IAdminDataQualityFilterOptions;
  attention: IAdminDataQualityAttentionSummary;
}

export interface IAdminDataQualityPersonInput {
  personKey: string;
  displayName: string;
  email: string;
  managerPersonKey?: string;
  managerEmail?: string;
  teamKey?: string;
  active: boolean;
}

export interface IAdminHierarchyDataQualityContext {
  topLevel: IAdminHierarchyTopLevelResolution;
  issues: readonly IAdminHierarchyIssue[];
}

export interface IAdminDataQualityTeamInput {
  teamKey: string;
  teamName: string;
  teamLeadPersonKey?: string;
  active: boolean;
}

export interface IAdminReportingReadinessInput {
  checkKey: string;
  label: string;
  ready: boolean;
  detail: string;
  recommendedResolution: string;
  sourceReference: string;
  priority?: KpiDataQualityPriority;
  pillar?: string;
  workstream?: string;
  owner?: string;
}

export interface IAdminOperationalDataQualityInput {
  people?: readonly IAdminDataQualityPersonInput[];
  teams?: readonly IAdminDataQualityTeamInput[];
  reportingChecks?: readonly IAdminReportingReadinessInput[];
  hierarchy?: IAdminHierarchyDataQualityContext;
}

export interface IAdminKpiRemediationRequest {
  actionKey: string;
  resolutionEvidenceReference: string;
  expectedDefinition: IAdminKpiDefinitionIdentity;
  patch: IAdminKpiControlledRemediationPatch;
}

const ISSUE_TYPE_ORDER: readonly AdminDataQualityIssueType[] = [
  'ScoringMetadata',
  'TargetConfiguration',
  'OwnerResolution',
  'OrganisationalWeighting',
  'ManagerRelationship',
  'TeamConfiguration',
  'ReportingReadiness'
];

const normalise = (value?: string): string => (value || '').trim().toLowerCase();
const keyPart = (value?: string): string => normalise(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'unassigned';

const titleForKpiIssue = (code: KpiDataQualityIssueCode, kpiId: string): string => {
  if (code === 'UNKNOWN_OWNER_CODE') return `${kpiId}: unresolved owner`;
  if (code === 'MISSING_TARGET' || code === 'MISSING_HISTORIC_TARGET') return `${kpiId}: target configuration`;
  if (code === 'MISSING_ORGANISATIONAL_WEIGHT') return `${kpiId}: organisational weighting`;
  if (code === 'MISSING_UNIT_LABEL') return `${kpiId}: reporting metadata`;
  return `${kpiId}: scoring metadata`;
};

/** Projects the existing KPI Data Quality queue without changing, sorting or annotating its source rows. */
export const projectKpiDataQualityIssues = (queue: IKpiDataQualityQueue): IAdminDataQualityIssue[] => {
  const projected: IAdminDataQualityIssue[] = [];
  queue.rows.forEach(row => row.issues.forEach(issue => {
    projected.push({
      issueKey: `KPI|${row.kpiId}|${issue.code}`,
      priority: issue.priority,
      issueType: adminKpiIssueTypeForCode(issue.code),
      scope: issue.code === 'MISSING_ORGANISATIONAL_WEIGHT' ? 'Weighting' : 'KPI',
      title: titleForKpiIssue(issue.code, row.kpiId),
      detail: issue.detail,
      recommendedResolution: issue.recommendedResolution,
      status: issue.status,
      sourceReference: issue.sourceReference,
      sourceIssueCode: issue.code,
      kpiId: row.kpiId,
      ...(issue.code !== 'MISSING_ORGANISATIONAL_WEIGHT' && row.kpiVersionKey !== undefined
        ? { kpiVersionKey: row.kpiVersionKey } : {}),
      pillar: row.pillar,
      workstream: row.workstream,
      owner: row.ownerCode || 'TBC'
    });
  }));
  queue.systemIssues.forEach(issue => {
    projected.push({
      issueKey: `Weighting|${keyPart(issue.pillar)}|${keyPart(issue.workstream)}`,
      priority: issue.priority,
      issueType: 'OrganisationalWeighting',
      scope: 'Weighting',
      title: `${issue.workstream || 'Unconfigured workstream'}: organisational weighting`,
      detail: issue.issue,
      recommendedResolution: issue.recommendedResolution,
      status: issue.status,
      sourceReference: issue.sourceReference,
      pillar: issue.pillar,
      workstream: issue.workstream,
      owner: 'CONTROL'
    });
  });
  return projected;
};

const managerIssue = (
  person: IAdminDataQualityPersonInput,
  detail: string,
  resolution: string
): IAdminDataQualityIssue => ({
  issueKey: `Manager|${keyPart(person.personKey)}|${keyPart(detail)}`,
  priority: 'P1',
  issueType: 'ManagerRelationship',
  scope: 'People',
  title: `${person.displayName || person.personKey}: manager relationship`,
  detail,
  recommendedResolution: resolution,
  status: 'SourceDataRequired',
  sourceReference: 'KCFKPI_People manager relationship',
  personKey: person.personKey,
  owner: person.personKey || 'TBC'
});

const resolveTopLevel = (
  people: readonly IAdminDataQualityPersonInput[],
  hierarchy?: IAdminHierarchyDataQualityContext
): IAdminHierarchyTopLevelResolution => {
  if (hierarchy) return hierarchy.topLevel;
  const activePersonKeys = people
    .filter(person => person.active && !normalise(person.managerPersonKey) && !normalise(person.managerEmail))
    .map(person => person.personKey);
  return {
    status: activePersonKeys.length === 1 ? 'Resolved' : activePersonKeys.length > 1 ? 'Ambiguous' : 'Missing',
    activePersonKeys
  };
};

const deriveManagerCycleKeys = (people: readonly IAdminDataQualityPersonInput[]): { [personKey: string]: boolean } => {
  const byKey: { [personKey: string]: IAdminDataQualityPersonInput } = {};
  people.filter(person => person.active).forEach(person => { byKey[normalise(person.personKey)] = person; });
  const cycleKeys: { [personKey: string]: boolean } = {};
  Object.keys(byKey).forEach(startKey => {
    const path: string[] = [];
    const positions: { [personKey: string]: number } = {};
    let cursor = startKey;
    while (cursor && byKey[cursor]) {
      if (positions[cursor] !== undefined) {
        for (let index = positions[cursor]; index < path.length; index += 1) cycleKeys[path[index]] = true;
        return;
      }
      positions[cursor] = path.length;
      path.push(cursor);
      cursor = normalise(byKey[cursor].managerPersonKey);
    }
  });
  return cycleKeys;
};

const buildManagerRelationshipIssues = (
  people: readonly IAdminDataQualityPersonInput[],
  hierarchy?: IAdminHierarchyDataQualityContext
): IAdminDataQualityIssue[] => {
  const issues: IAdminDataQualityIssue[] = [];
  const activePeople = people.filter(person => person.active);
  const topLevel = resolveTopLevel(activePeople, hierarchy);
  const resolvedTopLevelKey = topLevel.status === 'Resolved' ? normalise(topLevel.activePersonKeys[0]) : '';
  const cycleKeys = hierarchy
    ? hierarchy.issues.filter(issue => issue.issueType === 'ManagerCycle').reduce((result, issue) => {
      result[normalise(issue.personKey)] = true;
      return result;
    }, {} as { [personKey: string]: boolean })
    : deriveManagerCycleKeys(activePeople);
  activePeople.forEach(person => {
    const managerKey = normalise(person.managerPersonKey);
    const managerEmail = normalise(person.managerEmail);
    if (!managerKey && !managerEmail) {
      if (normalise(person.personKey) === resolvedTopLevelKey) return;
      issues.push(managerIssue(
        person,
        topLevel.status === 'Ambiguous'
          ? `${topLevel.activePersonKeys.length} active People records have no manager reference, so the top-level lead is ambiguous.`
          : 'No ManagerPersonKey or ManagerEmail is configured and no unique active top-level lead can be resolved.',
        'Resolve the People hierarchy so exactly one active record is the authoritative top-level lead; assign an active manager to every other Person.'
      ));
      return;
    }
    if (managerKey === normalise(person.personKey) || (managerEmail && managerEmail === normalise(person.email))) {
      issues.push(managerIssue(person, 'The People record resolves itself as manager.', 'Assign a different authoritative active manager.'));
      return;
    }
    if (cycleKeys[normalise(person.personKey)]) {
      issues.push(managerIssue(person, 'The Person is part of a ManagerPersonKey reporting cycle.', 'Break the cycle by assigning an authoritative active manager outside the cycle.'));
      return;
    }
    const keyMatches = managerKey ? activePeople.filter(candidate => normalise(candidate.personKey) === managerKey) : [];
    const emailMatches = managerEmail ? activePeople.filter(candidate => normalise(candidate.email) === managerEmail) : [];
    if (managerKey && keyMatches.length !== 1) {
      issues.push(managerIssue(person, `ManagerPersonKey resolves to ${keyMatches.length} active People records.`, 'Correct the manager key so it resolves to exactly one active Person.'));
      return;
    }
    if (managerEmail && emailMatches.length !== 1) {
      issues.push(managerIssue(person, `ManagerEmail resolves to ${emailMatches.length} active People records.`, 'Correct the manager email so it resolves to exactly one active Person.'));
      return;
    }
    if (keyMatches.length === 1 && emailMatches.length === 1 && keyMatches[0].personKey !== emailMatches[0].personKey) {
      issues.push(managerIssue(person, 'ManagerPersonKey and ManagerEmail resolve to different active People records.', 'Align both manager references to the same authoritative Person.'));
    }
  });
  return issues;
};

const teamIssue = (
  issueKey: string,
  title: string,
  detail: string,
  recommendedResolution: string,
  teamKey?: string,
  personKey?: string,
  owner: string = 'Unassigned'
): IAdminDataQualityIssue => ({
  issueKey,
  priority: 'P2',
  issueType: 'TeamConfiguration',
  scope: 'Teams',
  title,
  detail,
  recommendedResolution,
  status: 'SourceDataRequired',
  sourceReference: 'KCFKPI_Teams / KCFKPI_People TeamKey',
  teamKey,
  personKey,
  owner
});

const buildTeamConfigurationIssues = (
  people: readonly IAdminDataQualityPersonInput[],
  teams: readonly IAdminDataQualityTeamInput[]
): IAdminDataQualityIssue[] => {
  const issues: IAdminDataQualityIssue[] = [];
  const activePeople = people.filter(person => person.active);
  const activeTeams = teams.filter(team => team.active);
  if (!activeTeams.length) {
    issues.push(teamIssue(
      'Team|not-configured',
      'Teams not configured',
      'There are no active Team records. Reporting hierarchy remains separate and must not be treated as Team membership.',
      'Create approved Team records without inventing names, then assign People through TeamKey.'
    ));
  }
  activeTeams.forEach(team => {
    const leadKey = normalise(team.teamLeadPersonKey);
    if (!leadKey) {
      issues.push(teamIssue(
        `Team|${keyPart(team.teamKey)}|missing-lead`,
        `${team.teamName || team.teamKey}: Team Lead not configured`,
        'The active Team has no TeamLeadPersonKey.',
        'Assign one authoritative active Person as Team Lead.',
        team.teamKey
      ));
      return;
    }
    const leads = activePeople.filter(person => normalise(person.personKey) === leadKey);
    if (leads.length !== 1) {
      issues.push(teamIssue(
        `Team|${keyPart(team.teamKey)}|invalid-lead`,
        `${team.teamName || team.teamKey}: Team Lead unresolved`,
        `TeamLeadPersonKey resolves to ${leads.length} active People records.`,
        'Assign a Team Lead key that resolves to exactly one active Person.',
        team.teamKey,
        undefined,
        team.teamLeadPersonKey || 'Unassigned'
      ));
    }
  });
  activePeople.filter(person => Boolean(person.teamKey)).forEach(person => {
    const matches = activeTeams.filter(team => normalise(team.teamKey) === normalise(person.teamKey));
    if (matches.length !== 1) {
      issues.push(teamIssue(
        `TeamAssignment|${keyPart(person.personKey)}|${keyPart(person.teamKey)}`,
        `${person.displayName || person.personKey}: Team assignment unresolved`,
        `TeamKey resolves to ${matches.length} active Team records.`,
        'Assign a TeamKey that resolves to exactly one active Team, or clear the unapproved assignment.',
        person.teamKey,
        person.personKey,
        person.personKey
      ));
    }
  });
  return issues;
};

const buildReportingReadinessIssues = (checks: readonly IAdminReportingReadinessInput[]): IAdminDataQualityIssue[] =>
  checks.filter(check => !check.ready).map(check => ({
    issueKey: `Reporting|${keyPart(check.checkKey)}`,
    priority: check.priority || 'P2',
    issueType: 'ReportingReadiness' as const,
    scope: 'Reporting' as const,
    title: check.label,
    detail: check.detail,
    recommendedResolution: check.recommendedResolution,
    status: 'ControlDecisionRequired' as const,
    sourceReference: check.sourceReference,
    pillar: check.pillar,
    workstream: check.workstream,
    owner: check.owner || 'Unassigned'
  }));

/** Builds cross-domain Admin issues from read-only People, Team and reporting snapshots. */
export const buildOperationalAdminDataQualityIssues = (
  input: IAdminOperationalDataQualityInput
): IAdminDataQualityIssue[] => {
  const people = input.people || [];
  return (input.people ? buildManagerRelationshipIssues(people, input.hierarchy) : [])
    .concat(input.teams ? buildTeamConfigurationIssues(people, input.teams) : [])
    .concat(buildReportingReadinessIssues(input.reportingChecks || []));
};

const sameKpiDefinitionIdentity = (
  left: IAdminKpiDefinitionIdentity,
  right: IAdminKpiDefinitionIdentity
): boolean => left.recordId === right.recordId
  && normalise(left.kpiId) === normalise(right.kpiId)
  && normalise(left.kpiVersionKey) === normalise(right.kpiVersionKey)
  && left.state === right.state;

// The version-bearing producer must admit the unchanged consumer's four own data fields.
const captureVersionedExpectedDefinition = (value: unknown): IAdminKpiDefinitionIdentity | undefined => {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return undefined;
  const keys = ['recordId', 'kpiId', 'kpiVersionKey', 'state'];
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const names = Object.getOwnPropertyNames(descriptors);
  if (Object.getOwnPropertySymbols(value).length || names.length !== keys.length
    || names.some(name => keys.indexOf(name) < 0)) return undefined;
  if (!keys.every(key => {
    const descriptor = descriptors[key];
    return descriptor && descriptor.enumerable === true
      && Object.prototype.hasOwnProperty.call(descriptor, 'value')
      && typeof descriptor.value === (key === 'recordId' ? 'number' : 'string');
  })) return undefined;
  return Object.freeze({
    recordId: descriptors.recordId.value,
    kpiId: descriptors.kpiId.value,
    kpiVersionKey: descriptors.kpiVersionKey.value,
    state: descriptors.state.value
  });
};

/**
 * Produces an attributable command only when a source KPI issue is bound to one exact known
 * KPI version/state. Target/weight and cross-domain issues remain fail-closed in their owners.
 */
export const buildAdminKpiControlledRemediationCommand = (
  issue: IAdminDataQualityIssue,
  definitions: readonly IAdminKpiDefinitionIdentity[],
  request: IAdminKpiRemediationRequest
): IAdminKpiControlledRemediationCommand => {
  if (!issue || issue.scope !== 'KPI' || !issue.kpiId || !issue.sourceIssueCode) {
    throw new Error('Controlled KPI remediation requires a source KPI issue with explicit issue identity.');
  }
  if (issue.issueType !== adminKpiIssueTypeForCode(issue.sourceIssueCode)
    || issue.issueKey !== `KPI|${issue.kpiId}|${issue.sourceIssueCode}`) {
    throw new Error('Controlled KPI remediation was blocked because the source issue identity is inconsistent.');
  }
  if (!normalise(issue.sourceReference)
    || !normalise(issue.status)
    || !normalise(request?.actionKey)
    || !normalise(request?.resolutionEvidenceReference)) {
    throw new Error('Controlled KPI remediation requires action, issue status, source and resolution evidence provenance.');
  }
  const versioned = issue.kpiVersionKey !== undefined;
  const expectedDefinition = versioned
    ? captureVersionedExpectedDefinition(request.expectedDefinition)
    : request.expectedDefinition;
  if (versioned && !expectedDefinition) {
    throw new Error('Versioned KPI remediation requires an exact four-field expected definition identity.');
  }
  if (!expectedDefinition
    || normalise(expectedDefinition.kpiId) !== normalise(issue.kpiId)) {
    throw new Error('Controlled KPI remediation target does not match the source KPI issue.');
  }
  // Retained source versions bind opaque KPIMaster keys exactly. Undefined retains the legacy path.
  if (versioned) {
    const expected = expectedDefinition;
    if (typeof issue.kpiVersionKey !== 'string' || !issue.kpiVersionKey.trim()
      || issue.kpiVersionKey !== issue.kpiVersionKey.trim() || issue.kpiId !== issue.kpiId.trim()
      || expected.kpiId !== issue.kpiId || expected.kpiVersionKey !== issue.kpiVersionKey) {
      throw new Error('Versioned KPI remediation requires the exact source KPI/version target.');
    }
    const versionTargets = definitions.filter(definition => definition.kpiId === issue.kpiId
      && definition.kpiVersionKey === issue.kpiVersionKey);
    if (versionTargets.length !== 1 || !Number.isSafeInteger(versionTargets[0].recordId)
      || versionTargets[0].recordId < 1
      || (versionTargets[0].state !== 'Active' && versionTargets[0].state !== 'Inactive')
      || expected.recordId !== versionTargets[0].recordId || expected.state !== versionTargets[0].state) {
      throw new Error('Controlled KPI remediation requires exactly one known matching KPI version/state identity. Versioned targets must have one exact valid snapshot record/state.');
    }
  }
  const exactDefinitions = definitions.filter(definition => (
    sameKpiDefinitionIdentity(definition, expectedDefinition)
  ));
  if (exactDefinitions.length !== 1) {
    throw new Error('Controlled KPI remediation requires exactly one known matching KPI version/state identity.');
  }

  const patchFields = request.patch ? Object.keys(request.patch) : [];
  const allowedFields = ADMIN_KPI_REMEDIATION_FIELDS_BY_ISSUE_TYPE[issue.issueType];
  if (!allowedFields || !patchFields.length) {
    throw new Error('This Data Quality issue is not remediable through a KPI Master field patch.');
  }
  if (patchFields.some(field => allowedFields.indexOf(field) < 0)) {
    throw new Error('Controlled KPI remediation patch contains a field outside this issue type boundary.');
  }

  return {
    actionKey: request.actionKey.trim(),
    issueKey: issue.issueKey,
    issueType: issue.issueType,
    sourceIssueCode: issue.sourceIssueCode,
    issueKpiId: issue.kpiId,
    issueStatus: issue.status,
    issueSourceReference: issue.sourceReference.trim(),
    resolutionEvidenceReference: request.resolutionEvidenceReference.trim(),
    expectedDefinition: versioned ? {
      recordId: expectedDefinition.recordId,
      kpiId: expectedDefinition.kpiId,
      kpiVersionKey: expectedDefinition.kpiVersionKey,
      state: expectedDefinition.state
    } : { ...request.expectedDefinition },
    patch: request.patch.scoringMetadataIssues
      ? { ...request.patch, scoringMetadataIssues: request.patch.scoringMetadataIssues.slice() }
      : { ...request.patch }
  };
};

const selected = <T extends string>(value: string | undefined, values: readonly T[] | undefined): boolean => {
  if (!values || !values.length) return true;
  const normalisedValue = normalise(value);
  return values.some(candidate => normalise(candidate) === normalisedValue);
};

export const filterAdminDataQualityIssues = (
  issues: readonly IAdminDataQualityIssue[],
  filters: IAdminDataQualityFilters = {}
): IAdminDataQualityIssue[] => issues.filter(issue =>
  selected(issue.priority, filters.priorities)
  && selected(issue.pillar, filters.pillars)
  && selected(issue.workstream, filters.workstreams)
  && selected(issue.owner, filters.owners)
  && selected(issue.issueType, filters.issueTypes)
);

const distinctSorted = (values: Array<string | undefined>): string[] => values
  .filter((value): value is string => Boolean(value && value.trim()))
  .filter((value, index, source) => source.findIndex(candidate => normalise(candidate) === normalise(value)) === index)
  .sort((left, right) => left.localeCompare(right));

export const buildAdminDataQualityFilterOptions = (
  issues: readonly IAdminDataQualityIssue[]
): IAdminDataQualityFilterOptions => ({
  priorities: (['P1', 'P2', 'P3'] as KpiDataQualityPriority[]).filter(priority => issues.some(issue => issue.priority === priority)),
  pillars: distinctSorted(issues.map(issue => issue.pillar)),
  workstreams: distinctSorted(issues.map(issue => issue.workstream)),
  owners: distinctSorted(issues.map(issue => issue.owner)),
  issueTypes: ISSUE_TYPE_ORDER.filter(issueType => issues.some(issue => issue.issueType === issueType))
});

const emptyPriorityCounts = (): Record<KpiDataQualityPriority, number> => ({ P1: 0, P2: 0, P3: 0 });
const emptyIssueTypeCounts = (): Record<AdminDataQualityIssueType, number> => ({
  ScoringMetadata: 0,
  TargetConfiguration: 0,
  OwnerResolution: 0,
  OrganisationalWeighting: 0,
  ManagerRelationship: 0,
  TeamConfiguration: 0,
  ReportingReadiness: 0
});

export const buildAdminDataQualityAttentionSummary = (
  issues: readonly IAdminDataQualityIssue[]
): IAdminDataQualityAttentionSummary => {
  const priorityCounts = emptyPriorityCounts();
  const issueTypeCounts = emptyIssueTypeCounts();
  issues.forEach(issue => {
    priorityCounts[issue.priority] += 1;
    issueTypeCounts[issue.issueType] += 1;
  });
  const item = (
    key: IAdminAttentionSummaryItem['key'],
    label: string,
    count: number,
    priority?: KpiDataQualityPriority
  ): IAdminAttentionSummaryItem => ({ key, label, count, priority, destination: 'DataQuality', requiresAttention: count > 0 });
  return {
    totalIssues: issues.length,
    priorityCounts,
    issueTypeCounts,
    affectedKpiCount: distinctSorted(issues.map(issue => issue.kpiId)).length,
    affectedPersonCount: distinctSorted(issues.map(issue => issue.personKey)).length,
    affectedTeamCount: distinctSorted(issues.map(issue => issue.teamKey)).length,
    requiresAttention: issues.length > 0,
    priorityMeaning: 'P1/P2/P3 are issue-priority labels only; they are not employee performance ratings.',
    items: [
      item('DataQualityP1', 'P1 Data Quality issues', priorityCounts.P1, 'P1'),
      item('DataQualityP2', 'P2 Data Quality issues', priorityCounts.P2, 'P2'),
      item('DataQualityP3', 'P3 Data Quality issues', priorityCounts.P3, 'P3'),
      item('ManagerRelationships', 'Manager relationship issues', issueTypeCounts.ManagerRelationship),
      item('TeamConfiguration', 'Team configuration issues', issueTypeCounts.TeamConfiguration),
      item('ReportingReadiness', 'Reporting readiness issues', issueTypeCounts.ReportingReadiness),
      item('OrganisationalWeighting', 'Organisational weight issues', issueTypeCounts.OrganisationalWeighting)
    ]
  };
};

export const buildAdminDataQualityView = (
  kpiQueue: IKpiDataQualityQueue,
  operationalIssues: readonly IAdminDataQualityIssue[] = [],
  filters: IAdminDataQualityFilters = {}
): IAdminDataQualityView => {
  const allIssues = projectKpiDataQualityIssues(kpiQueue).concat(operationalIssues.map(issue => ({ ...issue })));
  return {
    allIssues,
    filteredIssues: filterAdminDataQualityIssues(allIssues, filters),
    filters: {
      priorities: filters.priorities?.slice(),
      pillars: filters.pillars?.slice(),
      workstreams: filters.workstreams?.slice(),
      owners: filters.owners?.slice(),
      issueTypes: filters.issueTypes?.slice()
    },
    filterOptions: buildAdminDataQualityFilterOptions(allIssues),
    attention: buildAdminDataQualityAttentionSummary(allIssues)
  };
};
