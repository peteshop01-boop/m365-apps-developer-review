import type { EmployeeV2CommandType, EmployeeV2SubjectType } from '../../models/EmployeeWorkplanV2PersistenceModels';
import {
  EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES,
  EMPLOYEE_V2_MANAGER_COMMAND_TYPES
} from '../EmployeeWorkplanV2PhysicalSchema';

export type Sec006GovernedPartition = 'annual' | 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type Sec006GovernedResourceType =
  | 'KCFKPI_Workplans'
  | 'KCFKPI_WorkplanItems'
  | 'KCFKPI_QuarterReviews'
  | 'KCFKPI_QuarterReviewItems'
  | 'KCFKPI_Evidence';

export interface ISec006GovernedResourceIdentity {
  personKey: string;
  performanceYear: number;
  partition: Sec006GovernedPartition;
  resourceType: Sec006GovernedResourceType;
  resourceKey: string;
  subjectType: EmployeeV2SubjectType;
  subjectKey: string;
}

const commandsBySubject: Readonly<Record<EmployeeV2SubjectType, readonly EmployeeV2CommandType[]>> = {
  Workplan: [
    'CreateWorkplanDraft', 'UpdateWorkplanDraft', 'UpdateWorkplanDraftV2', 'SetCoreWeightingV2',
    'SubmitWorkplan', 'RequestWorkplanChanges', 'ApproveAndLockWorkplan', 'CreateWorkplanAmendmentV2'
  ],
  WorkplanItem: [
    'UpsertWorkplanItem', 'DeactivateWorkplanItem', 'UpsertCoreContributionV2',
    'UpsertPersonalItemV2', 'UpsertBehaviourCommitmentV2'
  ],
  QuarterReview: [
    'CreateQuarterDraft', 'SubmitQuarterReview', 'RequestQuarterChanges', 'SetQuarterManagerReview',
    'SetQuarterRAGOverride', 'DecideReforecast', 'ApproveAndLockQuarter'
  ],
  QuarterReviewItem: ['UpdateQuarterItem', 'UpdateQuarterItemV2', 'SaveProgressEntry'],
  Evidence: ['RegisterEvidence']
};

export type Sec006GovernedCommandSource = 'KCFKPI_EmployeeCommands' | 'KCFKPI_ManagerCommands';
export type Sec006GovernedCommandRole = 'Employee' | 'Manager' | 'DelegatedManager' | 'SystemAdmin';

export interface ISec006GovernedCommandClassification {
  commandType: EmployeeV2CommandType;
  subjectType: EmployeeV2SubjectType;
  sourceListTitle: Sec006GovernedCommandSource;
  authorisedRoles: readonly Sec006GovernedCommandRole[];
  delegatedManagerAllowed: boolean;
}

const employeeCommandAuthority = new Set<EmployeeV2CommandType>(EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES);
const managerCommandAuthority = new Set<EmployeeV2CommandType>(EMPLOYEE_V2_MANAGER_COMMAND_TYPES);

/**
 * Single governed command authority used by both processor routing and ACL
 * generation. A command must belong to exactly one physical command root and
 * to the supplied canonical subject type. CONTROL amendment remains a
 * SystemAdmin-only ManagerCommands action and can never be delegated.
 */
export const resolveSec006GovernedCommand = (
  commandType: EmployeeV2CommandType,
  subjectType: EmployeeV2SubjectType
): ISec006GovernedCommandClassification | undefined => {
  if (commandsBySubject[subjectType].indexOf(commandType) < 0) return undefined;
  const employeeOwned = employeeCommandAuthority.has(commandType);
  const managerOwned = managerCommandAuthority.has(commandType);
  if (employeeOwned === managerOwned) return undefined;
  if (employeeOwned) return {
    commandType,
    subjectType,
    sourceListTitle: 'KCFKPI_EmployeeCommands',
    authorisedRoles: ['Employee'],
    delegatedManagerAllowed: false
  };
  const systemAdminOnly = commandType === 'CreateWorkplanAmendmentV2';
  return {
    commandType,
    subjectType,
    sourceListTitle: 'KCFKPI_ManagerCommands',
    authorisedRoles: systemAdminOnly ? ['SystemAdmin'] : ['Manager', 'DelegatedManager'],
    delegatedManagerAllowed: !systemAdminOnly
  };
};

export const isSec006CommandAllowedForSubject = (
  commandType: EmployeeV2CommandType,
  subjectType: EmployeeV2SubjectType
): boolean => Boolean(resolveSec006GovernedCommand(commandType, subjectType));

export const isSec006CommandAllowedForSource = (
  commandType: EmployeeV2CommandType,
  subjectType: EmployeeV2SubjectType,
  sourceListTitle: Sec006GovernedCommandSource
): boolean => resolveSec006GovernedCommand(commandType, subjectType)?.sourceListTitle === sourceListTitle;

export const isSec006DelegatedManagerCommand = (
  commandType: EmployeeV2CommandType,
  subjectType: EmployeeV2SubjectType
): boolean => resolveSec006GovernedCommand(commandType, subjectType)?.delegatedManagerAllowed === true;

const quarterFromSubjectKey = (subjectKey: string): Sec006GovernedPartition | undefined => {
  const quarter = subjectKey.split('|').find(value => /^Q[1-4]$/.test(value));
  return quarter as Sec006GovernedPartition | undefined;
};

export const resolveSec006GovernedResource = (
  subjectType: EmployeeV2SubjectType,
  subjectKey: string,
  personKey: string,
  performanceYear: number
): ISec006GovernedResourceIdentity | undefined => {
  const segments = subjectKey.split('|');
  if (!personKey.trim() || !Number.isInteger(performanceYear)
    || segments.indexOf(personKey) < 0 || segments.indexOf(String(performanceYear)) < 0) return undefined;
  const quarter = quarterFromSubjectKey(subjectKey);
  const expected: Readonly<Record<EmployeeV2SubjectType, {
    prefix: string; resourceType: Sec006GovernedResourceType; quarterRequired: boolean;
  }>> = {
    Workplan: { prefix: 'WP', resourceType: 'KCFKPI_Workplans', quarterRequired: false },
    WorkplanItem: { prefix: 'WPI', resourceType: 'KCFKPI_WorkplanItems', quarterRequired: false },
    QuarterReview: { prefix: 'QR', resourceType: 'KCFKPI_QuarterReviews', quarterRequired: true },
    QuarterReviewItem: { prefix: 'QRI', resourceType: 'KCFKPI_QuarterReviewItems', quarterRequired: true },
    Evidence: { prefix: 'EVID', resourceType: 'KCFKPI_Evidence', quarterRequired: false }
  };
  const contract = expected[subjectType];
  if (segments[0] !== contract.prefix || (contract.quarterRequired && !quarter)
    || (!contract.quarterRequired && subjectType !== 'Evidence' && quarter)) return undefined;
  return {
    personKey,
    performanceYear,
    partition: quarter || 'annual',
    resourceType: contract.resourceType,
    resourceKey: subjectKey,
    subjectType,
    subjectKey
  };
};

