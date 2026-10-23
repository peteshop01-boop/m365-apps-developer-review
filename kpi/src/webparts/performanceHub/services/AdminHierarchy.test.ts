import type { IProductionPerson } from '../models/ProductionModels';
import {
  buildAdminHierarchy,
  flattenVisibleAdminHierarchy,
  toggleAdminHierarchyExpansion
} from './AdminHierarchy';

const person = (
  id: number,
  personKey: string,
  displayName: string,
  managerPersonKey?: string,
  active: boolean = true,
  team?: string
): IProductionPerson => ({
  id,
  personKey,
  displayName,
  email: `${personKey.toLowerCase()}@example.invalid`,
  managerPersonKey,
  managerEmail: managerPersonKey ? `${managerPersonKey.toLowerCase()}@example.invalid` : undefined,
  team,
  appRoles: ['Employee'],
  active
});

describe('KCF-KPI-020A dynamic People reporting hierarchy', () => {
  it('renders arbitrary depth with direct-report, descendant and total employee counts', () => {
    const people = [
      person(1, 'ROOT-X', 'Synthetic Root'),
      person(2, 'LEVEL-1', 'Synthetic Level One', 'ROOT-X'),
      person(3, 'LEVEL-2', 'Synthetic Level Two', 'LEVEL-1'),
      person(4, 'LEVEL-3', 'Synthetic Level Three', 'LEVEL-2'),
      person(5, 'LEVEL-4', 'Synthetic Level Four', 'LEVEL-3')
    ];

    const result = buildAdminHierarchy(people, ['ROOT-X', 'LEVEL-1']);

    expect(result).toMatchObject({
      totalEmployeeCount: 5,
      activeEmployeeCount: 5,
      inactiveEmployeeCount: 0,
      maximumDepth: 4,
      issues: []
    });
    expect(result.topLevel).toEqual({ status: 'Resolved', activePersonKeys: ['ROOT-X'] });
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]).toMatchObject({
      depth: 0,
      directReportCount: 1,
      descendantCount: 4,
      employeeCount: 5,
      isExpanded: true
    });
    expect(result.roots[0].children[0]).toMatchObject({
      depth: 1,
      directReportCount: 1,
      descendantCount: 3,
      employeeCount: 4,
      isExpanded: true
    });
    expect(result.roots[0].children[0].children[0].children[0].children[0].person.personKey).toBe('LEVEL-4');
    expect(flattenVisibleAdminHierarchy(result.roots).map(node => node.person.personKey)).toEqual([
      'ROOT-X', 'LEVEL-1', 'LEVEL-2'
    ]);
  });

  it('supports expand/collapse as view state without changing reporting relationships', () => {
    const people = [person(1, 'A', 'Alpha'), person(2, 'B', 'Beta', 'A')];
    const expanded = toggleAdminHierarchyExpansion([], 'A');
    const opened = buildAdminHierarchy(people, expanded);
    const collapsedKeys = toggleAdminHierarchyExpansion(expanded, 'a');
    const closed = buildAdminHierarchy(people, collapsedKeys);

    expect(opened.roots[0].isExpanded).toBe(true);
    expect(flattenVisibleAdminHierarchy(opened.roots)).toHaveLength(2);
    expect(closed.roots[0].isExpanded).toBe(false);
    expect(flattenVisibleAdminHierarchy(closed.roots)).toHaveLength(1);
    expect(closed.roots[0].children[0].person.personKey).toBe('B');
  });

  it('does not infer reporting hierarchy from Team membership', () => {
    const people = [
      person(1, 'LEAD-X', 'Lead X', undefined, true, 'SHARED-TEAM'),
      person(2, 'PEER-Y', 'Peer Y', undefined, true, 'SHARED-TEAM'),
      person(3, 'REPORT-Z', 'Report Z', 'LEAD-X', true, 'DIFFERENT-TEAM')
    ];

    const result = buildAdminHierarchy(people);

    expect(result.roots.map(node => node.person.personKey)).toEqual(['LEAD-X', 'PEER-Y']);
    expect(result.roots[0].children.map(node => node.person.personKey)).toEqual(['REPORT-Z']);
    expect(result.topLevel).toEqual({ status: 'Ambiguous', activePersonKeys: ['LEAD-X', 'PEER-Y'] });
    expect(result.issues.filter(issue => issue.issueType === 'AmbiguousTopLevel')).toHaveLength(2);
  });

  it('resolves a unique active top-level lead from People manager data without a hard-coded identity', () => {
    const result = buildAdminHierarchy([
      person(1, 'ORGANISATION-ROOT', 'Supplied Root'),
      person(2, 'NESTED-MANAGER', 'Supplied Manager', 'ORGANISATION-ROOT'),
      person(3, 'EMPLOYEE', 'Supplied Employee', 'NESTED-MANAGER')
    ]);

    expect(result.topLevel).toEqual({ status: 'Resolved', activePersonKeys: ['ORGANISATION-ROOT'] });
    expect(result.issues).toEqual([]);
  });

  it('reports missing, self and cyclic manager relationships without recursion failure', () => {
    const people = [
      person(1, 'CYCLE-A', 'Cycle A', 'CYCLE-B'),
      person(2, 'CYCLE-B', 'Cycle B', 'CYCLE-A'),
      person(3, 'MISSING-A', 'Missing Manager', 'NOT-PRESENT'),
      person(4, 'SELF-A', 'Self Manager', 'SELF-A'),
      person(5, 'CHILD-A', 'Child of Cycle Root', 'CYCLE-A')
    ];

    const result = buildAdminHierarchy(people);

    expect(result.totalEmployeeCount).toBe(5);
    expect(result.roots.map(node => node.person.personKey)).toEqual(['CYCLE-A', 'CYCLE-B', 'MISSING-A', 'SELF-A']);
    expect(result.roots[0].children.map(node => node.person.personKey)).toEqual(['CHILD-A']);
    expect(result.issues.filter(issue => issue.issueType === 'ManagerCycle')).toHaveLength(2);
    expect(result.issues.filter(issue => issue.issueType === 'MissingManager')).toHaveLength(1);
    expect(result.issues.filter(issue => issue.issueType === 'SelfManager')).toHaveLength(1);
  });

  it('can exclude inactive People while retaining accurate counts and flagging excluded managers', () => {
    const people = [
      person(1, 'INACTIVE-LEAD', 'Inactive Lead', undefined, false),
      person(2, 'ACTIVE-REPORT', 'Active Report', 'INACTIVE-LEAD', true)
    ];

    const all = buildAdminHierarchy(people);
    const activeOnly = buildAdminHierarchy(people, [], false);

    expect(all).toMatchObject({ totalEmployeeCount: 2, activeEmployeeCount: 1, inactiveEmployeeCount: 1 });
    expect(activeOnly).toMatchObject({ totalEmployeeCount: 1, activeEmployeeCount: 1, inactiveEmployeeCount: 0 });
    expect(activeOnly.issues[0]).toMatchObject({ personKey: 'ACTIVE-REPORT', issueType: 'MissingManager' });
  });

  it('projects only names supplied by the current People records', () => {
    const result = buildAdminHierarchy([
      person(1, 'ORBIT-1', 'Orbit One'),
      person(2, 'ORBIT-2', 'Orbit Two', 'ORBIT-1')
    ], ['ORBIT-1']);
    const names = flattenVisibleAdminHierarchy(result.roots).map(node => node.person.displayName);

    expect(names).toEqual(['Orbit One', 'Orbit Two']);
  });
});
