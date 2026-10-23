import type {
  IAnnualSubmissionReadiness,
  IAnnualWorkplan,
  IProductionPerson,
  WorkplanAuditEventType
} from './ProductionModels';
import type {
  IQuarterReview,
  IQuarterReviewItem,
  IQuarterSubmissionReadiness,
  QuarterReviewAuditEventType,
  QuarterKey,
  RagStatus,
  RecoveryRoute
} from './QuarterlyModels';

export type ManagerAttentionCode =
  | 'OverdueManagerReview'
  | 'WaitingManagerReview'
  | 'WaitingSubmission'
  | 'RedPerformance'
  | 'AmberPerformance'
  | 'ActiveEscalation'
  | 'ActiveReforecast'
  | 'OverdueRecovery'
  | 'IncompleteSubmission';

export type ManagerQueueKind = 'AnnualWorkplan' | 'QuarterReview';
export type ManagerExperienceState = 'Ready' | 'NoDirectReports' | 'NotAuthorised';
export type ManagerSubmissionKind = 'Submitted' | 'Resubmitted' | 'Reopened' | 'Unknown';

export interface IManagerAttentionFlag {
  code: ManagerAttentionCode;
  label: string;
  sortRank: number;
  sourceKey: string;
  quarter?: QuarterKey;
  kpiId?: string;
  dueDate?: string;
  rag?: RagStatus;
  route?: RecoveryRoute;
}

export interface IManagerQueueEntry {
  key: string;
  kind: ManagerQueueKind;
  employeePersonKey: string;
  employeeDisplayName: string;
  employeeEmail: string;
  subjectKey: string;
  performanceYear: number;
  quarter?: QuarterKey;
  submittedAt?: string;
  reviewDeadline?: string;
  overdue?: boolean;
  incomplete: boolean;
  status: string;
  reviewTypeLabel: string;
  submissionKind: ManagerSubmissionKind;
  openReviewTargetKey: string;
  attentionFlags: IManagerAttentionFlag[];
  sortRank: number;
}

export interface IManagerTeamRow {
  personKey: string;
  displayName: string;
  email: string;
  team?: string;
  jobRole?: string;
  annualWorkplan?: IAnnualWorkplan;
  latestQuarterReview?: IQuarterReview;
  workplanStatus: IAnnualWorkplan['state'] | 'NotStarted';
  currentQuarterStatus: IQuarterReview['state'] | 'NotStarted';
  coreKpiCount?: number;
  personalKpiCount?: number;
  worstRag?: RagStatus;
  amberRedInterventionCount: number;
  outstandingEmployeeAction: boolean;
  outstandingManagerAction: boolean;
  reviewDeadline?: string;
  overdue?: boolean;
  attentionFlags: IManagerAttentionFlag[];
  sortRank: number;
  pendingReviewCount: number;
}

export interface IManagerEmployeeDrillThrough {
  employee: IProductionPerson;
  annualWorkplans: IAnnualWorkplan[];
  quarterReviews: IQuarterReview[];
  quarterReviewItems: IQuarterReviewItem[];
  queueEntries: IManagerQueueEntry[];
  attentionFlags: IManagerAttentionFlag[];
}

export interface IManagerExperience {
  state: ManagerExperienceState;
  manager?: IProductionPerson;
  directReports: IProductionPerson[];
  teamRows: IManagerTeamRow[];
  reviewQueue: IManagerQueueEntry[];
  emptyTitle?: string;
  emptyMessage?: string;
}

export interface IManagerDeadline {
  kind: ManagerQueueKind;
  subjectKey: string;
  deadline: string;
}

export interface IManagerExperienceInput {
  authenticatedPerson?: IProductionPerson;
  people: IProductionPerson[];
  workplans: IAnnualWorkplan[];
  quarterReviews: IQuarterReview[];
  quarterReviewItems: IQuarterReviewItem[];
  annualReadinessByWorkplanKey?: { [workplanKey: string]: IAnnualSubmissionReadiness | undefined };
  activeCoreCountByWorkplanKey?: { [workplanKey: string]: number | undefined };
  activePersonalCountByWorkplanKey?: { [workplanKey: string]: number | undefined };
  quarterReadinessByReviewKey?: { [quarterReviewKey: string]: IQuarterSubmissionReadiness | undefined };
  lastAnnualEventTypeByWorkplanKey?: { [workplanKey: string]: WorkplanAuditEventType | undefined };
  lastQuarterEventTypeByReviewKey?: { [quarterReviewKey: string]: QuarterReviewAuditEventType | undefined };
  managerDeadlines?: IManagerDeadline[];
  currentQuarter?: QuarterKey;
  nowIso: string;
}
