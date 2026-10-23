import type { IProductionPerson } from '../models/ProductionModels';
import type {
  IAdminHierarchyIssue,
  IAdminHierarchyNode,
  IAdminHierarchyResult
} from '../models/AdminFoundationModels';

interface IMutableHierarchyNode {
  person: IProductionPerson;
  children: IMutableHierarchyNode[];
}

const clean = (value: string | undefined): string => (value || '').trim();
const normalise = (value: string | undefined): string => clean(value).toLowerCase();

const clonePerson = (person: IProductionPerson): IProductionPerson => ({
  ...person,
  appRoles: person.appRoles.slice()
});

const compareNodes = (left: IMutableHierarchyNode, right: IMutableHierarchyNode): number => {
  const byName = left.person.displayName.localeCompare(right.person.displayName);
  return byName || left.person.personKey.localeCompare(right.person.personKey);
};

const sortTree = (node: IMutableHierarchyNode): void => {
  node.children.sort(compareNodes);
  node.children.forEach(sortTree);
};

const identifyCycleKeys = (
  nodesByKey: { [normalisedPersonKey: string]: IMutableHierarchyNode },
  selfManagerKeys: { [normalisedPersonKey: string]: boolean }
): { [normalisedPersonKey: string]: boolean } => {
  const cycleKeys: { [normalisedPersonKey: string]: boolean } = {};
  Object.keys(nodesByKey).forEach(startKey => {
    const path: string[] = [];
    const position: { [normalisedPersonKey: string]: number } = {};
    let cursor = startKey;
    while (cursor && nodesByKey[cursor] && !selfManagerKeys[cursor]) {
      if (position[cursor] !== undefined) {
        for (let index = position[cursor]; index < path.length; index += 1) cycleKeys[path[index]] = true;
        break;
      }
      position[cursor] = path.length;
      path.push(cursor);
      cursor = normalise(nodesByKey[cursor].person.managerPersonKey);
    }
  });
  return cycleKeys;
};

export const buildAdminHierarchy = (
  people: readonly IProductionPerson[],
  expandedPersonKeys: readonly string[] = [],
  includeInactive: boolean = true
): IAdminHierarchyResult => {
  const selected = people.filter(person => includeInactive || person.active).map(clonePerson);
  const nodesByKey: { [normalisedPersonKey: string]: IMutableHierarchyNode } = {};
  const expanded: { [normalisedPersonKey: string]: boolean } = {};
  const selfManagerKeys: { [normalisedPersonKey: string]: boolean } = {};
  const issues: IAdminHierarchyIssue[] = [];

  expandedPersonKeys.forEach(personKey => { if (normalise(personKey)) expanded[normalise(personKey)] = true; });
  selected.forEach(person => {
    const key = normalise(person.personKey);
    if (!key) throw new Error('Hierarchy cannot render a Person record without PersonKey.');
    if (nodesByKey[key]) throw new Error(`Hierarchy cannot render duplicate PersonKey ${person.personKey}.`);
    nodesByKey[key] = { person, children: [] };
    if (normalise(person.managerPersonKey) === key) selfManagerKeys[key] = true;
  });

  const cycleKeys = identifyCycleKeys(nodesByKey, selfManagerKeys);
  const roots: IMutableHierarchyNode[] = [];
  const activeTopLevelPersonKeys = selected
    .filter(person => person.active && !normalise(person.managerPersonKey) && !normalise(person.managerEmail))
    .map(person => person.personKey);
  const topLevelStatus = activeTopLevelPersonKeys.length === 1
    ? 'Resolved' as const
    : activeTopLevelPersonKeys.length > 1
      ? 'Ambiguous' as const
      : 'Missing' as const;

  if (topLevelStatus === 'Ambiguous') {
    activeTopLevelPersonKeys.forEach(personKey => issues.push({
      personKey,
      issueType: 'AmbiguousTopLevel',
      message: `${activeTopLevelPersonKeys.length} active People records have no manager reference; exactly one authoritative top-level lead is required.`
    }));
  }

  selected.forEach(person => {
    const key = normalise(person.personKey);
    const managerKey = normalise(person.managerPersonKey);
    const node = nodesByKey[key];
    if (selfManagerKeys[key]) {
      roots.push(node);
      issues.push({
        personKey: person.personKey,
        issueType: 'SelfManager',
        message: `PersonKey ${person.personKey} cannot report to itself.`
      });
      return;
    }
    if (cycleKeys[key]) {
      roots.push(node);
      issues.push({
        personKey: person.personKey,
        issueType: 'ManagerCycle',
        message: `PersonKey ${person.personKey} is part of a reporting cycle.`
      });
      return;
    }
    if (!managerKey) {
      roots.push(node);
      return;
    }
    const manager = nodesByKey[managerKey];
    if (!manager) {
      roots.push(node);
      issues.push({
        personKey: person.personKey,
        issueType: 'MissingManager',
        message: `ManagerPersonKey ${clean(person.managerPersonKey)} could not be resolved for ${person.personKey}.`
      });
      return;
    }
    manager.children.push(node);
  });

  roots.sort(compareNodes);
  roots.forEach(sortTree);
  let maximumDepth = 0;

  const project = (node: IMutableHierarchyNode, depth: number): IAdminHierarchyNode => {
    if (depth > maximumDepth) maximumDepth = depth;
    const children = node.children.map(child => project(child, depth + 1));
    let descendantCount = 0;
    children.forEach(child => { descendantCount += child.employeeCount; });
    return {
      person: clonePerson(node.person),
      depth,
      directReportCount: children.length,
      descendantCount,
      employeeCount: descendantCount + 1,
      isExpanded: Boolean(expanded[normalise(node.person.personKey)]),
      children
    };
  };

  const projectedRoots = roots.map(root => project(root, 0));
  const activeEmployeeCount = selected.filter(person => person.active).length;
  return {
    roots: projectedRoots,
    totalEmployeeCount: selected.length,
    activeEmployeeCount,
    inactiveEmployeeCount: selected.length - activeEmployeeCount,
    maximumDepth,
    topLevel: {
      status: topLevelStatus,
      activePersonKeys: activeTopLevelPersonKeys.slice()
    },
    issues
  };
};

export const toggleAdminHierarchyExpansion = (
  expandedPersonKeys: readonly string[],
  personKey: string
): readonly string[] => {
  const wanted = normalise(personKey);
  if (!wanted) return expandedPersonKeys.slice();
  const isExpanded = expandedPersonKeys.some(key => normalise(key) === wanted);
  if (isExpanded) return expandedPersonKeys.filter(key => normalise(key) !== wanted);
  return expandedPersonKeys.concat([clean(personKey)]);
};

export const flattenVisibleAdminHierarchy = (
  roots: readonly IAdminHierarchyNode[]
): readonly IAdminHierarchyNode[] => {
  const visible: IAdminHierarchyNode[] = [];
  const visit = (node: IAdminHierarchyNode): void => {
    visible.push(node);
    if (node.isExpanded) node.children.forEach(visit);
  };
  roots.forEach(visit);
  return visible;
};
