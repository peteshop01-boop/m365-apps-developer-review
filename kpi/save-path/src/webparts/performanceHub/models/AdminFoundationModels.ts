import type { IProductionPerson } from './ProductionModels';

export type AdminUatEntityType = 'Person' | 'Team';

export type AdminUatAction =
  | 'PersonAdded'
  | 'PersonEdited'
  | 'PersonDeactivated'
  | 'PersonReactivated'
  | 'PersonManagerChanged'
  | 'PersonTeamChanged'
  | 'TeamAdded'
  | 'TeamEdited'
  | 'TeamDeactivated'
  | 'TeamReactivated';

export interface IAdminUatContext {
  actorEmail: string;
  occurredAt: string;
}

export interface IAdminUatAuditEvent {
  sequence: number;
  entityType: AdminUatEntityType;
  recordKey: string;
  action: AdminUatAction;
  actorEmail: string;
  occurredAt: string;
  change: string;
}

export interface IAdminPeopleUatState {
  mode: 'SafeLocalUat';
  sourceList: 'DEMOAPP_People';
  persistence: 'BrowserMemoryOnly';
  records: readonly IProductionPerson[];
  audit: readonly IAdminUatAuditEvent[];
}

export interface IAdminPersonDraft {
  personKey: string;
  displayName: string;
  email: string;
  managerPersonKey?: string;
  teamKey?: string;
  jobRole?: string;
  appRoles?: readonly string[];
  active?: boolean;
}

export interface IAdminPersonEdit {
  displayName?: string;
  email?: string;
  jobRole?: string;
  appRoles?: readonly string[];
}

export interface IAdminPeopleReadPathResult {
  sourceList: 'DEMOAPP_People';
  expectedCurrentRecordCount: number;
  recordCount: number;
  activeCount: number;
  inactiveCount: number;
  matchesCurrentRecordCount: boolean;
  valid: boolean;
  issues: readonly string[];
}

export interface IAdminTeamRecord {
  id: number;
  teamKey: string;
  teamName: string;
  teamLeadPersonKey?: string;
  active: boolean;
  sortOrder: number;
}

export interface IAdminTeamDraft {
  teamKey: string;
  teamName: string;
  teamLeadPersonKey?: string;
  active?: boolean;
  sortOrder: number;
}

export interface IAdminTeamEdit {
  teamName?: string;
  teamLeadPersonKey?: string;
  clearTeamLead?: boolean;
  sortOrder?: number;
}

export interface IAdminTeamsUatState {
  mode: 'SafeLocalUat';
  sourceList: 'DEMOAPP_Teams';
  persistence: 'BrowserMemoryOnly';
  configurationState: 'Unconfigured' | 'Configured';
  records: readonly IAdminTeamRecord[];
  audit: readonly IAdminUatAuditEvent[];
}

export interface IAdminTeamsSummary {
  configurationState: 'Unconfigured' | 'Configured';
  message: 'Teams not configured' | 'Teams configured';
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
}

export interface IAdminHierarchyNode {
  person: IProductionPerson;
  depth: number;
  directReportCount: number;
  descendantCount: number;
  employeeCount: number;
  isExpanded: boolean;
  children: readonly IAdminHierarchyNode[];
}

export interface IAdminHierarchyIssue {
  personKey: string;
  issueType: 'MissingManager' | 'SelfManager' | 'ManagerCycle' | 'AmbiguousTopLevel';
  message: string;
}

export interface IAdminHierarchyTopLevelResolution {
  status: 'Resolved' | 'Ambiguous' | 'Missing';
  activePersonKeys: readonly string[];
}

export interface IAdminHierarchyResult {
  roots: readonly IAdminHierarchyNode[];
  totalEmployeeCount: number;
  activeEmployeeCount: number;
  inactiveEmployeeCount: number;
  maximumDepth: number;
  topLevel: IAdminHierarchyTopLevelResolution;
  issues: readonly IAdminHierarchyIssue[];
}
