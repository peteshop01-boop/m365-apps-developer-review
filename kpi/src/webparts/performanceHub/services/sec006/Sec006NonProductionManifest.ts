import {
  EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES,
  EMPLOYEE_V2_MANAGER_COMMAND_TYPES
} from '../EmployeeWorkplanV2PhysicalSchema';

export const SEC006_CONTRACT_VERSION = 'KCF-KPI-SEC-006-1.0' as const;
export const SEC006_DECISION_SHA = '1c914990de76db47f508ae9815c8334760eeb5f0' as const;
export const SEC006_UNIFIED_PARENT_SHA = '60eb20ea5354704ba740909da2489f1242fd004f' as const;
export const KCF_PRODUCTION_SITE = 'https://example.invalid/sites/REVIEW-TEST-SITE' as const;

export type Sec006FieldType =
  | 'Boolean'
  | 'Choice'
  | 'DateOnly'
  | 'DateTimeUTC'
  | 'NotePlainText'
  | 'Number'
  | 'NumberInteger'
  | 'Text';

export interface ISec006CanonicalField {
  listTitle: 'KCFKPI_Workplans' | 'KCFKPI_WorkplanItems' | 'KCFKPI_QuarterReviewItems';
  internalName: string;
  type: Sec006FieldType;
  choices?: readonly string[];
  defaultValue?: string | number | boolean;
  minimum?: number;
  minimumExclusive?: number;
  maximum?: number;
  requiredForNewV2Rows?: boolean;
  authority: 'EmployeeProposalAutomationWrite' | 'ManagerDecisionAutomationWrite' | 'AutomationDerived' | 'AutomationOnly';
}

const workplanFields: readonly ISec006CanonicalField[] = [
  { listTitle: 'KCFKPI_Workplans', internalName: 'CoreWeightingMode', type: 'Choice', choices: ['Equal', 'Custom'], defaultValue: 'Equal', requiredForNewV2Rows: true, authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_Workplans', internalName: 'WorkplanVersion', type: 'NumberInteger', defaultValue: 1, requiredForNewV2Rows: true, authority: 'AutomationOnly' }
];

const workplanItemFields: readonly ISec006CanonicalField[] = [
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'ContributionMethod', type: 'Choice', choices: ['AdditiveDirect', 'SharedTarget', 'WeightedDenominator', 'AccountableOwner', 'CompletionOversight'], authority: 'EmployeeProposalAutomationWrite' },
  ...(['Q1SuccessDefinition', 'Q2SuccessDefinition', 'Q3SuccessDefinition', 'Q4SuccessDefinition'] as const)
    .map(internalName => ({ listTitle: 'KCFKPI_WorkplanItems' as const, internalName, type: 'NotePlainText' as const, authority: 'EmployeeProposalAutomationWrite' as const })),
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'SharedTargetRule', type: 'Choice', choices: ['VisibleOnly', 'ApprovedApportionment'], authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'SharedApportionmentPercent', type: 'Number', minimum: 0, maximum: 100, authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'ContributionGovernanceReference', type: 'Text', authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'DenominatorNumerator', type: 'Number', authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'DenominatorValue', type: 'Number', minimumExclusive: 0, authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'DenominatorUnit', type: 'Text', authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'DenominatorRuleReference', type: 'Text', authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'DenominatorSourceReference', type: 'Text', authority: 'EmployeeProposalAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'DirectContributionEligible', type: 'Boolean', defaultValue: false, authority: 'AutomationDerived' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'ContributionApprovalState', type: 'Choice', choices: ['Draft', 'Pending', 'Approved', 'Retired'], defaultValue: 'Draft', authority: 'ManagerDecisionAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'AdditiveApproved', type: 'Boolean', defaultValue: false, authority: 'ManagerDecisionAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'NonOverlapRequired', type: 'Boolean', defaultValue: false, authority: 'AutomationDerived' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'NonOverlapApproved', type: 'Boolean', defaultValue: false, authority: 'ManagerDecisionAutomationWrite' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'ContributionEffectiveFrom', type: 'DateOnly', authority: 'AutomationOnly' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'ContributionEffectiveTo', type: 'DateOnly', authority: 'AutomationOnly' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'ContributionApprovalReference', type: 'Text', authority: 'AutomationOnly' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'ContributionApprovedAt', type: 'DateTimeUTC', authority: 'AutomationOnly' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'ContributionAuditReference', type: 'Text', authority: 'AutomationOnly' },
  { listTitle: 'KCFKPI_WorkplanItems', internalName: 'WorkplanVersion', type: 'NumberInteger', defaultValue: 1, requiredForNewV2Rows: true, authority: 'AutomationOnly' }
];

const quarterItemFields: readonly ISec006CanonicalField[] = [
  { listTitle: 'KCFKPI_QuarterReviewItems', internalName: 'ContextMitigation', type: 'NotePlainText', authority: 'EmployeeProposalAutomationWrite' }
];

export const SEC006_CANONICAL_ADDITIVE_FIELDS: readonly ISec006CanonicalField[] = [
  ...workplanFields,
  ...workplanItemFields,
  ...quarterItemFields
];

export const SEC006_RECEIPT_FIELDS = [
  'ReceiptKey', 'SourceListId', 'SourceItemId', 'SourceItemVersion',
  'CommandKey', 'CommandType', 'SubjectType', 'SubjectKey', 'PersonKey',
  'PerformanceYear', 'Quarter', 'AuthenticatedActorEmail',
  'AuthenticatedActorPersonKey', 'EffectiveRole', 'ProcessedByEmail',
  'ProcessedAt', 'Outcome', 'ValidationCode', 'Message',
  'ProcessedPayloadSHA256', 'ResultKeysJSON', 'AuditKeysJSON',
  'CorrelationKey', 'FlowRunReference'
] as const;

export const SEC006_CONTROL_LISTS = [
  {
    listTitle: 'KCFKPI_EmployeeCommands',
    commandChoices: EMPLOYEE_V2_EMPLOYEE_COMMAND_TYPES,
    versioning: true,
    folders: true,
    humanDeleteAllowed: false
  },
  {
    listTitle: 'KCFKPI_ManagerCommands',
    commandChoices: EMPLOYEE_V2_MANAGER_COMMAND_TYPES,
    versioning: true,
    folders: true,
    humanDeleteAllowed: false
  },
  {
    listTitle: 'KCFKPI_CommandReceipts',
    fields: SEC006_RECEIPT_FIELDS,
    versioning: true,
    folders: true,
    uniqueFields: ['ReceiptKey'] as const,
    indexedNonUniqueFields: ['CommandKey', 'SubjectKey', 'PersonKey', 'PerformanceYear', 'ProcessedAt'] as const,
    humanWriteAllowed: false,
    outcomeChoices: ['Accepted', 'Rejected', 'Duplicate', 'Failed', 'RecoveryHold'] as const
  }
] as const;

export const SEC006_AUDIT_CHOICE_EXTENSIONS = {
  SubjectType: ['WorkplanItem', 'QuarterReviewItem', 'Command'],
  EventType: [
    'WorkplanDraftUpdated', 'CoreContributionUpserted', 'PersonalItemUpserted',
    'BehaviourCommitmentUpserted', 'CoreWeightingSet', 'ZeroPersonalProposed',
    'ZeroPersonalApproved', 'ZeroPersonalRejected', 'WorkplanSubmitted',
    'WorkplanResubmitted', 'WorkplanChangesRequested', 'WorkplanApproved',
    'WorkplanAmendmentCreated', 'QuarterReviewDraftUpdated', 'EvidenceRegistered',
    'QuarterReviewSubmitted', 'ManagerOverrideApplied', 'ContributionApprovalChanged',
    'CommandRejected', 'CommandFailed', 'RecoveryHoldEntered'
  ]
} as const;

export interface ISec006TargetEvidence {
  siteUrl: string;
  automationEnvironmentId: string;
  classification: 'NonProduction' | 'Production' | 'Unknown';
  isolationApprovalReference: string;
  isolationApprovedBy: string;
  dedicatedSiteCollection: boolean;
}

export const validateSec006NonProductionTarget = (target?: ISec006TargetEvidence): string[] => {
  if (!target) return ['NON_PRODUCTION_TARGET_NOT_IDENTIFIED'];
  const errors: string[] = [];
  const site = target.siteUrl.trim().replace(/\/$/, '').toLowerCase();
  if (site === KCF_PRODUCTION_SITE.toLowerCase()) errors.push('PRODUCTION_SITE_FORBIDDEN');
  if (target.classification !== 'NonProduction') errors.push('TARGET_NOT_CLASSIFIED_NON_PRODUCTION');
  if (!target.dedicatedSiteCollection) errors.push('DEDICATED_SITE_COLLECTION_NOT_PROVED');
  if (!target.automationEnvironmentId.trim()) errors.push('AUTOMATION_ENVIRONMENT_NOT_IDENTIFIED');
  if (!target.isolationApprovalReference.trim() || !target.isolationApprovedBy.trim()) errors.push('ISOLATION_APPROVAL_NOT_PROVED');
  if (!/^https:\/\/samplefoundation\.sharepoint\.com\/sites\/[a-z0-9_-]+$/i.test(site)) errors.push('TARGET_URL_NOT_GOVERNED_TENANT_SITE');
  return errors;
};

export interface ISec006RuntimeOwners {
  automationIdentity?: string;
  backupOwner?: string;
  controlReference?: string;
}

export const validateSec006RuntimeOwners = (owners: ISec006RuntimeOwners): string[] => {
  const errors: string[] = [];
  if (!owners.automationIdentity?.trim()) errors.push('AUTOMATION_IDENTITY_NOT_NAMED');
  if (!owners.backupOwner?.trim()) errors.push('AUTOMATION_BACKUP_OWNER_NOT_NAMED');
  if (!owners.controlReference?.trim()) errors.push('AUTOMATION_OWNERSHIP_CONTROL_REFERENCE_MISSING');
  const combined = `${owners.automationIdentity || ''}|${owners.backupOwner || ''}`.toLowerCase();
  if (combined.includes('person003')) errors.push('PETER_IDENTITY_FORBIDDEN');
  return errors;
};

export const SEC006_DISABLED_AUTOMATION_PROCESSORS = [
  { name: 'KCF KPI Employee Command Processor', sourceList: 'KCFKPI_EmployeeCommands', enabled: false, identity: 'IT_CONTROL_REQUIRED', backupOwner: 'IT_CONTROL_REQUIRED' },
  { name: 'KCF KPI Manager Command Processor', sourceList: 'KCFKPI_ManagerCommands', enabled: false, identity: 'IT_CONTROL_REQUIRED', backupOwner: 'IT_CONTROL_REQUIRED' },
  { name: 'KCF KPI ACL Reconciler', sourceList: 'KCFKPI_People/KCFKPI_Delegations', enabled: false, identity: 'IT_CONTROL_REQUIRED', backupOwner: 'IT_CONTROL_REQUIRED' },
  { name: 'KCF KPI RPT-005 Projection Publisher', sourceList: 'canonical private roots', enabled: false, identity: 'IT_CONTROL_REQUIRED', backupOwner: 'IT_CONTROL_REQUIRED' }
] as const;

export const SEC006_UAT_IDENTITY_SLOTS = [
  { id: 'E1', role: 'Employee', credentialsSupplied: false },
  { id: 'E2', role: 'Employee', credentialsSupplied: false },
  { id: 'M1', role: 'Manager', credentialsSupplied: false },
  { id: 'M2', role: 'Manager', credentialsSupplied: false },
  { id: 'D1', role: 'DelegatedManager', credentialsSupplied: false },
  { id: 'BA1', role: 'BusinessAdmin', credentialsSupplied: false },
  {
    id: 'SA1', role: 'SystemAdmin', credentialsSupplied: false,
    siteCollectionAdministratorPermitted: false, canonicalWritePermitted: false
  },
  {
    id: 'A1', role: 'Automation', credentialsSupplied: false,
    interactiveSignInPermitted: false, businessDecisionAuthority: false
  }
] as const;
