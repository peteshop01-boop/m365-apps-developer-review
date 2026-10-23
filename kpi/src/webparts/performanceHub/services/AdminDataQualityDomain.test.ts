import type { ICoreKpiCatalogueItem, IProductionPerson } from '../models/ProductionModels';
import { buildKpiDataQualityQueue } from './KpiDataQuality';
import { buildAdminHierarchy } from './AdminHierarchy';
import type { IAdminKpiDefinitionIdentity } from './AdminKpiMasterDomain';
import {
  buildAdminDataQualityAttentionSummary,
  buildAdminDataQualityFilterOptions,
  buildAdminDataQualityView,
  buildAdminKpiControlledRemediationCommand,
  buildOperationalAdminDataQualityIssues,
  filterAdminDataQualityIssues,
  projectKpiDataQualityIssues,
  type IAdminDataQualityIssue
} from './AdminDataQualityDomain';

const kpi = (overrides: Partial<ICoreKpiCatalogueItem> = {}): ICoreKpiCatalogueItem => ({
  kpiId: 'SO1-001',
  kpiVersionKey: 'SO1-001|2026|v01',
  targetVersionKey: 'SO1-001|2026|target-v01',
  wording: 'Synthetic participation KPI',
  pillar: 'Participation',
  workstream: 'Schools',
  scoringDirection: 'TBC',
  metricType: 'Count',
  unitLabel: 'programmes',
  ownerSourceCode: 'PH',
  yearEndTargetValue: 200,
  q1TargetValue: 50,
  q2TargetValue: 100,
  q3TargetValue: 150,
  q4TargetValue: 200,
  ...overrides
});

const operationalIssue = (overrides: Partial<IAdminDataQualityIssue> = {}): IAdminDataQualityIssue => ({
  issueKey: 'Reporting|readiness',
  priority: 'P2',
  issueType: 'ReportingReadiness',
  scope: 'Reporting',
  title: 'Reporting source not ready',
  detail: 'Reporting Map is not configured.',
  recommendedResolution: 'Complete the future Reporting Map slice.',
  status: 'ControlDecisionRequired',
  sourceReference: 'Reporting readiness check',
  pillar: 'Performance',
  workstream: 'Insight',
  owner: 'CONTROL',
  ...overrides
});

describe('Admin Data Quality domain', () => {
  it('projects existing KPI issues read-only with owner, Pillar, Workstream and stable issue types', () => {
    const queue = buildKpiDataQualityQueue([kpi()]);
    const sourceSnapshot = JSON.stringify(queue);
    const issues = projectKpiDataQualityIssues(queue);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        issueKey: 'KPI|SO1-001|TBC_SCORING_DIRECTION',
        priority: 'P1',
        issueType: 'ScoringMetadata',
        pillar: 'Participation',
        workstream: 'Schools',
        owner: 'PH'
      }),
      expect.objectContaining({
        issueKey: 'KPI|SO1-001|MISSING_ORGANISATIONAL_WEIGHT',
        priority: 'P3',
        issueType: 'OrganisationalWeighting',
        scope: 'Weighting'
      })
    ]));
    expect(JSON.stringify(queue)).toBe(sourceSnapshot);
  });

  it('represents unresolved owner, missing target and reporting metadata as separate issue types', () => {
    const queue = buildKpiDataQualityQueue([kpi({
      yearEndTargetValue: undefined,
      q1TargetValue: undefined,
      q2TargetValue: undefined,
      q3TargetValue: undefined,
      q4TargetValue: undefined,
      unitLabel: 'TBC',
      dataQualityFlags: 'Unknown owner code'
    })]);
    const types = projectKpiDataQualityIssues(queue).map(issue => issue.issueType);
    expect(types).toEqual(expect.arrayContaining(['OwnerResolution', 'TargetConfiguration', 'ReportingReadiness']));
  });

  it('builds an attributable owner remediation command bound to one exact KPI version/state', () => {
    const issues = projectKpiDataQualityIssues(buildKpiDataQualityQueue([kpi({
      dataQualityFlags: 'Unknown owner code'
    })]));
    const issue = issues.filter(candidate => candidate.sourceIssueCode === 'UNKNOWN_OWNER_CODE')[0];
    const definition: IAdminKpiDefinitionIdentity = {
      recordId: 17,
      kpiId: 'SO1-001',
      kpiVersionKey: 'SO1-001|2026|v01',
      state: 'Active'
    };
    const issueSnapshot = JSON.stringify(issue);

    const command = buildAdminKpiControlledRemediationCommand(issue, [definition], {
      actionKey: 'ADM-003-OWNER-001',
      resolutionEvidenceReference: 'EVIDENCE/approved-owner-row-17.json',
      expectedDefinition: definition,
      patch: { owner: 'approved.owner@example.invalid' }
    });

    expect(command).toEqual({
      actionKey: 'ADM-003-OWNER-001',
      issueKey: 'KPI|SO1-001|UNKNOWN_OWNER_CODE',
      issueType: 'OwnerResolution',
      sourceIssueCode: 'UNKNOWN_OWNER_CODE',
      issueKpiId: 'SO1-001',
      issueStatus: issue.status,
      issueSourceReference: issue.sourceReference,
      resolutionEvidenceReference: 'EVIDENCE/approved-owner-row-17.json',
      expectedDefinition: definition,
      patch: { owner: 'approved.owner@example.invalid' }
    });
    expect(JSON.stringify(issue)).toBe(issueSnapshot);
  });

  it('fails remediation closed on source drift, version/state mismatch and out-of-bound fields', () => {
    const definitions: IAdminKpiDefinitionIdentity[] = [{
      recordId: 17,
      kpiId: 'SO1-001',
      kpiVersionKey: 'SO1-001|2026|v01',
      state: 'Active'
    }];
    const queue = buildKpiDataQualityQueue([kpi({
      dataQualityFlags: 'Unknown owner code',
      scoringDirection: 'TBC'
    })]);
    const ownerIssue = projectKpiDataQualityIssues(queue)
      .filter(candidate => candidate.sourceIssueCode === 'UNKNOWN_OWNER_CODE')[0];
    const request = {
      actionKey: 'ADM-003-OWNER-002',
      resolutionEvidenceReference: 'EVIDENCE/approved-owner-row-18.json',
      expectedDefinition: definitions[0],
      patch: { owner: 'approved.owner@example.invalid' }
    };

    expect(() => buildAdminKpiControlledRemediationCommand(
      { ...ownerIssue, issueKey: 'KPI|SO1-001|MISSING_TARGET' }, definitions, request
    )).toThrow('source issue identity is inconsistent');
    expect(() => buildAdminKpiControlledRemediationCommand(ownerIssue, definitions, {
      ...request,
      expectedDefinition: { ...definitions[0], state: 'Inactive' }
    })).toThrow('exactly one known matching KPI version/state identity');
    expect(() => buildAdminKpiControlledRemediationCommand(ownerIssue, definitions, {
      ...request,
      patch: { unit: 'people' }
    })).toThrow('outside this issue type boundary');
    expect(() => buildAdminKpiControlledRemediationCommand(ownerIssue, definitions, {
      ...request,
      resolutionEvidenceReference: ''
    })).toThrow('resolution evidence provenance');

    const targetIssue = projectKpiDataQualityIssues(buildKpiDataQualityQueue([kpi({
      yearEndTargetValue: undefined,
      q1TargetValue: undefined,
      q2TargetValue: undefined,
      q3TargetValue: undefined,
      q4TargetValue: undefined
    })])).filter(candidate => candidate.issueType === 'TargetConfiguration')[0];
    expect(() => buildAdminKpiControlledRemediationCommand(targetIssue, definitions, request))
      .toThrow('not remediable through a KPI Master field patch');
    expect(() => buildAdminKpiControlledRemediationCommand(operationalIssue(), definitions, request))
      .toThrow('source KPI issue with explicit issue identity');
  });

  it('represents workstream-level organisational weight issues from the existing system queue', () => {
    const queue = buildKpiDataQualityQueue([kpi({ kpiWeightWithinWorkstream: 100 })], {
      workstreamWeights: [{ pillar: 'Participation', workstream: 'Schools', performanceYear: 2026 }]
    });
    const weight = projectKpiDataQualityIssues(queue).filter(issue => issue.issueKey.indexOf('Weighting|') === 0)[0];
    expect(weight).toEqual(expect.objectContaining({
      priority: 'P3', issueType: 'OrganisationalWeighting', pillar: 'Participation', workstream: 'Schools', owner: 'CONTROL'
    }));
  });

  it('finds broken manager relationships while resolving one genuine active top-level lead from People data', () => {
    const issues = buildOperationalAdminDataQualityIssues({
      people: [
        { personKey: 'lead', displayName: 'Top Lead', email: 'lead@example.invalid', active: true },
        { personKey: 'valid', displayName: 'Valid Employee', email: 'valid@example.invalid', managerPersonKey: 'lead', managerEmail: 'lead@example.invalid', active: true },
        { personKey: 'broken', displayName: 'Broken Manager', email: 'broken@example.invalid', managerPersonKey: 'inactive', active: true },
        { personKey: 'inactive', displayName: 'Inactive Manager', email: 'inactive@example.invalid', active: false }
      ],
      teams: []
    });
    const managerIssues = issues.filter(issue => issue.issueType === 'ManagerRelationship');
    expect(managerIssues.map(issue => issue.personKey)).toEqual(['broken']);
    expect(managerIssues.every(issue => issue.priority === 'P1')).toBe(true);
    expect(managerIssues.some(issue => issue.personKey === 'lead')).toBe(false);
    expect(managerIssues.some(issue => issue.personKey === 'valid')).toBe(false);
  });

  it('reports ambiguous active top-level candidates instead of relying on an omitted synthetic identity prop', () => {
    const people = [
      { personKey: 'root-a', displayName: 'Root A', email: 'root.a@example.invalid', active: true },
      { personKey: 'root-b', displayName: 'Root B', email: 'root.b@example.invalid', active: true },
      { personKey: 'report', displayName: 'Report', email: 'report@example.invalid', managerPersonKey: 'root-a', managerEmail: 'root.a@example.invalid', active: true }
    ];
    const hierarchyPeople: IProductionPerson[] = people.map((person, index) => ({
      id: index + 1,
      ...person,
      appRoles: ['Employee']
    }));
    const hierarchy = buildAdminHierarchy(hierarchyPeople);
    const issues = buildOperationalAdminDataQualityIssues({ people, hierarchy });
    const managerIssues = issues.filter(issue => issue.issueType === 'ManagerRelationship');

    expect(hierarchy.topLevel).toEqual({ status: 'Ambiguous', activePersonKeys: ['root-a', 'root-b'] });
    expect(managerIssues.map(issue => issue.personKey)).toEqual(['root-a', 'root-b']);
    expect(managerIssues.every(issue => issue.detail.indexOf('top-level lead is ambiguous') >= 0)).toBe(true);
    expect(managerIssues.some(issue => issue.personKey === 'report')).toBe(false);
  });

  it('projects ManagerPersonKey cycles from hierarchy context into P1 manager relationship issues', () => {
    const people = [
      { personKey: 'root', displayName: 'Root', email: 'root@example.invalid', active: true },
      { personKey: 'cycle-a', displayName: 'Cycle A', email: 'cycle.a@example.invalid', managerPersonKey: 'cycle-b', managerEmail: 'cycle.b@example.invalid', active: true },
      { personKey: 'cycle-b', displayName: 'Cycle B', email: 'cycle.b@example.invalid', managerPersonKey: 'cycle-a', managerEmail: 'cycle.a@example.invalid', active: true }
    ];
    const hierarchyPeople: IProductionPerson[] = people.map((person, index) => ({
      id: index + 1,
      ...person,
      appRoles: ['Employee']
    }));
    const hierarchy = buildAdminHierarchy(hierarchyPeople);
    const managerIssues = buildOperationalAdminDataQualityIssues({ people, hierarchy })
      .filter(issue => issue.issueType === 'ManagerRelationship');

    expect(hierarchy.issues.filter(issue => issue.issueType === 'ManagerCycle')).toHaveLength(2);
    expect(managerIssues.map(issue => issue.personKey)).toEqual(['cycle-a', 'cycle-b']);
    expect(managerIssues.every(issue => issue.priority === 'P1' && issue.detail.indexOf('reporting cycle') >= 0)).toBe(true);
    expect(managerIssues.some(issue => issue.personKey === 'root')).toBe(false);
  });

  it('represents Teams unconfigured, missing lead and invalid membership without deriving Teams from hierarchy', () => {
    const people = [
      { personKey: 'lead', displayName: 'Lead', email: 'lead@example.invalid', active: true },
      { personKey: 'member', displayName: 'Member', email: 'member@example.invalid', managerPersonKey: 'lead', managerEmail: 'lead@example.invalid', teamKey: 'missing-team', active: true }
    ];
    const empty = buildOperationalAdminDataQualityIssues({ people, teams: [] });
    expect(empty).toEqual(expect.arrayContaining([
      expect.objectContaining({ issueKey: 'Team|not-configured', issueType: 'TeamConfiguration' }),
      expect.objectContaining({ personKey: 'member', teamKey: 'missing-team', issueType: 'TeamConfiguration' })
    ]));

    const configured = buildOperationalAdminDataQualityIssues({
      people,
      teams: [{ teamKey: 'configured-team', teamName: 'Configured source Team', active: true }]
    });
    expect(configured).toEqual(expect.arrayContaining([
      expect.objectContaining({ teamKey: 'configured-team', title: expect.stringContaining('Team Lead not configured') }),
      expect.objectContaining({ personKey: 'member', teamKey: 'missing-team' })
    ]));
  });

  it('represents failed reporting readiness checks but excludes ready checks', () => {
    const issues = buildOperationalAdminDataQualityIssues({
      reportingChecks: [
        { checkKey: 'ready', label: 'Ready', ready: true, detail: 'Ready', recommendedResolution: 'None', sourceReference: 'Test' },
        { checkKey: 'map', label: 'Reporting Map unavailable', ready: false, detail: 'No approved map.', recommendedResolution: 'Complete the next controlled slice.', sourceReference: 'Reporting readiness' }
      ]
    });
    expect(issues).toEqual([
      expect.objectContaining({ issueKey: 'Reporting|map', issueType: 'ReportingReadiness' })
    ]);
  });

  it('filters by Priority, Pillar, Workstream, Owner and Issue type with AND semantics', () => {
    const issues: IAdminDataQualityIssue[] = [
      operationalIssue({ issueKey: 'one', priority: 'P1', pillar: 'Participation', workstream: 'Schools', owner: 'PH', issueType: 'OwnerResolution' }),
      operationalIssue({ issueKey: 'two', priority: 'P2', pillar: 'Participation', workstream: 'Schools', owner: 'PH', issueType: 'ReportingReadiness' }),
      operationalIssue({ issueKey: 'three', priority: 'P2', pillar: 'Performance', workstream: 'Insight', owner: 'CONTROL', issueType: 'ReportingReadiness' })
    ];
    expect(filterAdminDataQualityIssues(issues, {
      priorities: ['P2'],
      pillars: ['participation'],
      workstreams: ['SCHOOLS'],
      owners: ['ph'],
      issueTypes: ['ReportingReadiness']
    }).map(issue => issue.issueKey)).toEqual(['two']);
    expect(filterAdminDataQualityIssues(issues, {})).toEqual(issues);
  });

  it('builds stable filter options and an explicit issue-priority attention summary', () => {
    const issues: IAdminDataQualityIssue[] = [
      operationalIssue({ issueKey: 'one', priority: 'P1', issueType: 'ManagerRelationship', personKey: 'p1', owner: 'P1' }),
      operationalIssue({ issueKey: 'two', priority: 'P2', issueType: 'TeamConfiguration', teamKey: 't1', owner: 'P2' }),
      operationalIssue({ issueKey: 'three', priority: 'P3', issueType: 'OrganisationalWeighting', kpiId: 'KPI-1', owner: 'CONTROL' })
    ];
    expect(buildAdminDataQualityFilterOptions(issues)).toEqual(expect.objectContaining({
      priorities: ['P1', 'P2', 'P3'],
      issueTypes: ['OrganisationalWeighting', 'ManagerRelationship', 'TeamConfiguration']
    }));
    const summary = buildAdminDataQualityAttentionSummary(issues);
    expect(summary).toEqual(expect.objectContaining({
      totalIssues: 3,
      priorityCounts: { P1: 1, P2: 1, P3: 1 },
      affectedKpiCount: 1,
      affectedPersonCount: 1,
      affectedTeamCount: 1,
      requiresAttention: true,
      priorityMeaning: 'P1/P2/P3 are issue-priority labels only; they are not employee performance ratings.'
    }));
    expect(summary.items.filter(item => item.key === 'ManagerRelationships')[0].count).toBe(1);
  });

  it('builds a complete view while retaining source issues and filter state immutably', () => {
    const queue = buildKpiDataQualityQueue([kpi()]);
    const extra = [operationalIssue()];
    const filters = { priorities: ['P2' as const], owners: ['CONTROL'] };
    const view = buildAdminDataQualityView(queue, extra, filters);
    expect(view.allIssues.length).toBeGreaterThan(view.filteredIssues.length);
    expect(view.filteredIssues).toEqual([expect.objectContaining({ issueKey: 'Reporting|readiness' })]);
    expect(view.filters.priorities).not.toBe(filters.priorities);
    expect(extra[0]).toEqual(operationalIssue());
    expect(view.attention.totalIssues).toBe(view.allIssues.length);
  });
});

describe('NOT013 version retention in Admin projection', () => {
  it('retains KPI versions only and leaves queue, source facts and operational domains untouched', () => {
    const queue = buildKpiDataQualityQueue([kpi()]);
    const before = JSON.stringify(queue);
    const projected = projectKpiDataQualityIssues(queue);
    expect(projected.find(row => row.scope === 'KPI')?.kpiVersionKey).toBe('SO1-001|2026|v01');
    expect(projected.find(row => row.scope === 'Weighting')?.kpiVersionKey).toBe(undefined);
    expect(JSON.stringify(queue)).toBe(before);
    const changed = projectKpiDataQualityIssues(buildKpiDataQualityQueue([kpi({ kpiVersionKey: 'SYNTHETIC:next-version' })]));
    const withoutVersion = (value: unknown): string => JSON.stringify(value, (key, item) => key === 'kpiVersionKey' ? undefined : item);
    expect(withoutVersion(projected)).toBe(withoutVersion(changed));
    expect(buildAdminDataQualityView(queue, [operationalIssue()]).allIssues.find(row => row.scope === 'Reporting')?.kpiVersionKey).toBe(undefined);
  });
});

describe('A029 version-bearing controlled command guard', () => {
  const definition = (): IAdminKpiDefinitionIdentity => ({ recordId: 17, kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|2026|v01', state: 'Active' });
  const source = () => projectKpiDataQualityIssues(buildKpiDataQualityQueue([kpi()])).find(row => row.scope === 'KPI')!;
  const request = (expectedDefinition = definition()) => ({ actionKey: 'SYNTHETIC:A029', resolutionEvidenceReference: 'SYNTHETIC:reference', expectedDefinition, patch: { direction: 'HigherIsBetter' } });
  it('emits exactly four captured scalar fields from a frozen ordinary versioned identity', () => {
    const expected = Object.freeze(definition());
    const command = buildAdminKpiControlledRemediationCommand(source(), [definition()], request(expected));
    expect(Object.keys(command.expectedDefinition).sort()).toEqual(['kpiId', 'kpiVersionKey', 'recordId', 'state']);
    expect(command.expectedDefinition).toEqual(expected);
    expect(command.expectedDefinition === expected).toBe(false);
  });
  it('isolates the emitted versioned identity from later ordinary input and output edits', () => {
    const expected = definition();
    const before = { ...expected };
    const command = buildAdminKpiControlledRemediationCommand(source(), [definition()], request(expected));
    expected.recordId = 18;
    expected.kpiId = 'SYNTHETIC:later-input';
    expected.kpiVersionKey = 'SYNTHETIC:later-version';
    expected.state = 'Inactive';
    expect(command.expectedDefinition).toEqual(before);
    command.expectedDefinition.recordId = 19;
    expect(expected.recordId).toBe(18);
  });
  it('retains the original undefined legacy identity copy including ordinary extra metadata', () => {
    const legacy = { ...source(), kpiVersionKey: undefined };
    const expected = { ...definition(), kpiId: 'so1-001', kpiVersionKey: ' so1-001|2026|v01 ', note: 'SYNTHETIC:legacy-metadata' };
    const command = buildAdminKpiControlledRemediationCommand(legacy, [definition()], request(expected));
    expect(command.expectedDefinition).toEqual(expected);
    expect(command.expectedDefinition === expected).toBe(false);
  });
  it('rejects malformed version-bearing expected identities through the actual public builder', () => {
    const extra = { ...definition(), unexpectedOwnedField: 'SYNTHETIC_ONLY' };
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [definition()], request(extra))).toThrow();
    const hidden = definition(); Object.defineProperty(hidden, 'state', { value: 'Active', enumerable: false });
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [definition()], request(hidden))).toThrow();
    const symbol = definition(); Object.defineProperty(symbol, Symbol('SYNTHETIC'), { value: 1 });
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [definition()], request(symbol))).toThrow();
    let reads = 0; const accessor = definition();
    Object.defineProperty(accessor, 'kpiId', { enumerable: true, get: () => { reads++; return 'SO1-001'; } });
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [definition()], request(accessor))).toThrow();
    expect(reads).toBe(0);
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [definition()], request(Object.assign(Object.create(null), definition())))).toThrow();
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [definition()], request(Object.assign(Object.create({}), definition())))).toThrow();
  });
  it('rejects coherent padded raw versions without assigning a normalised replacement', () => {
    [' SO1-001|2026|v01 ', '\tSO1-001|2026|v01', 'SO1-001|2026|v01\n', ' '].forEach(version => {
      const issue = { ...source(), kpiVersionKey: version }; const target = { ...definition(), kpiVersionKey: version };
      const before = JSON.stringify([issue, target]);
      expect(() => buildAdminKpiControlledRemediationCommand(issue, [target], request(target))).toThrow();
      expect(JSON.stringify([issue, target])).toBe(before);
    });
    const version = 'opaque-Ω😀-vZ'; const issue = { ...source(), kpiVersionKey: version };
    const target = { ...definition(), kpiVersionKey: version };
    expect(buildAdminKpiControlledRemediationCommand(issue, [target], request(target)).expectedDefinition.kpiVersionKey).toBe(version);
  });
  it('binds the exact versioned source and rejects raw invalid source versions', () => {
    expect(buildAdminKpiControlledRemediationCommand(source(), [definition()], request()).expectedDefinition).toEqual(definition());
    ['', ' ', null, 3].forEach(version => {
      expect(() => buildAdminKpiControlledRemediationCommand({ ...source(), kpiVersionKey: version as string }, [definition()], request())).toThrow();
    });
  });
  it('rejects version aliases, invalid records/states and snapshot ambiguity in the actual public builder', () => {
    ['SO1-001|2027|v01', 'so1-001|2026|v01', ' SO1-001|2026|v01 '].forEach(version => {
      const target = { ...definition(), kpiVersionKey: version };
      expect(() => buildAdminKpiControlledRemediationCommand(source(), [target], request(target))).toThrow();
    });
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [definition(), { ...definition(), recordId: 18 }], request())).toThrow();
    const invalid = { ...definition(), recordId: 0 };
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [invalid], request(invalid))).toThrow();
    const state = { ...definition(), state: undefined as unknown as IAdminKpiDefinitionIdentity['state'] };
    expect(() => buildAdminKpiControlledRemediationCommand(source(), [state], request(state))).toThrow();
  });
  it('preserves absent/undefined legacy normalisation and all existing provenance/route boundaries', () => {
    const legacy = { ...source() }; delete legacy.kpiVersionKey;
    const expected = { ...definition(), kpiId: 'so1-001', kpiVersionKey: ' so1-001|2026|v01 ' };
    const result = buildAdminKpiControlledRemediationCommand(legacy, [definition()], request(expected));
    expect(result.expectedDefinition).toEqual(expected);
    expect(buildAdminKpiControlledRemediationCommand({ ...legacy, kpiVersionKey: undefined }, [definition()], request(expected))).toEqual(result);
    expect(() => buildAdminKpiControlledRemediationCommand(legacy, [definition()], { ...request(), actionKey: '' })).toThrow();
    expect(() => buildAdminKpiControlledRemediationCommand(legacy, [definition()], { ...request(), patch: { owner: 'bad-route' } })).toThrow();
    ['People', 'Teams', 'Weighting', 'Reporting'].forEach(scope => {
      expect(() => buildAdminKpiControlledRemediationCommand({ ...legacy, scope: scope as IAdminDataQualityIssue['scope'] }, [definition()], request())).toThrow();
    });
  });
});
