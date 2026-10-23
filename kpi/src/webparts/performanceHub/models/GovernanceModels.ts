export type EmployeeKpiRole =
  | 'AccountableOwner'
  | 'DeliveryLead'
  | 'Contributor'
  | 'Oversight'
  | 'EvidenceProvider';

export type WorkplanLifecycleState =
  | 'Draft'
  | 'Submitted'
  | 'ChangesRequested'
  | 'ManagerApproved'
  | 'Locked'
  | 'Archived';

export interface IWorkplanCategoryWeights {
  core: number;
  personal: number;
  behaviours: number;
}

export interface IWeightedItem {
  key: string;
  weight: number;
}

export interface IWorkplanWeightingInput {
  categoryWeights: IWorkplanCategoryWeights;
  categoryOverrideReason?: string;
  categoryOverrideApproved: boolean;
  coreItems: IWeightedItem[];
  personalItems: IWeightedItem[];
  behaviourItems: IWeightedItem[];
  state: WorkplanLifecycleState;
  weightsChanged: boolean;
  reopenAuthorised: boolean;
}

export interface IValidationResult {
  valid: boolean;
  errors: string[];
}

export interface IQuarterTimingConfig {
  earlyReviewReminderDays: number;
  preparationReminderDays: number;
  finalReminderDays: number;
  employeeSubmissionDays: number;
  managerReviewDays: number;
}

export interface IQuarterLifecycleDates {
  earlyReviewReminder: string;
  preparationReminder: string;
  finalReminder: string;
  quarterEnd: string;
  employeeSubmissionDeadline: string;
  managerReviewDeadline: string;
  nextQuarterOpens: string;
}

export interface IOrganisationalWeight {
  key: string;
  parentKey: string;
  performanceYear: number;
  weight?: number;
  approvalStatus: 'Draft' | 'Approved' | 'Superseded';
}

export interface IManagerResolutionPerson {
  personKey: string;
  email: string;
  managerPersonKey?: string;
  managerEmail?: string;
  teamKey?: string;
  isTeamLead?: boolean;
  active: boolean;
}
