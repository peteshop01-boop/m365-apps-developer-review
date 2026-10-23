import type { BehaviourKey, IBehaviourObjectiveLibraryRecord } from './BehaviourWorkplanModels';

export const BEHAVIOUR_FRAMEWORK_V2_VERSION = 'DEMO-BEHAVIOUR|v02' as const;
export const BEHAVIOUR_V2_VALUE_IDS = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const;
export const BEHAVIOUR_V2_ROLE_TIERS = ['IC_OFFICER', 'PEOPLE_MANAGER', 'SENIOR_LEADER'] as const;
export const BEHAVIOUR_V2_QUARTERLY_PERIODS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
export const BEHAVIOUR_V2_TWICE_YEARLY_PERIODS = ['H1', 'H2'] as const;

export type BehaviourFrameworkV2Version = typeof BEHAVIOUR_FRAMEWORK_V2_VERSION;
export type BehaviourV2ValueId = typeof BEHAVIOUR_V2_VALUE_IDS[number] & BehaviourKey;
export type BehaviourV2RoleTier = typeof BEHAVIOUR_V2_ROLE_TIERS[number];
export type BehaviourV2Cadence = 'Quarterly' | 'TwiceYearly';
export type BehaviourV2Period = typeof BEHAVIOUR_V2_QUARTERLY_PERIODS[number]
  | typeof BEHAVIOUR_V2_TWICE_YEARLY_PERIODS[number];
export type BehaviourV2Rating = 1 | 2 | 3;
export type BehaviourV2RatingLabel = 'Developing' | 'Effective' | 'Exceptional';
/** Categorical planning is distinct from the numeric v02 assessment scale. */
export const BEHAVIOUR_PLANNING_LEVELS_VERSION = 'BHV-LEVELS|v01' as const;
export interface IBehaviourPlanningLevelsV1 {
  contractVersion: typeof BEHAVIOUR_PLANNING_LEVELS_VERSION;
  currentLevel?: BehaviourV2RatingLabel;
  targetLevel?: BehaviourV2RatingLabel;
  targetJustification?: string;
}
export type BehaviourLibraryV2SourceRoleLevel = 'L1' | 'L2' | 'L3';

/** Exact sixteen-column local source shape. Source-only labels never become governed descriptors. */
export interface IBehaviourLibraryV2SourceRow {
  BehaviourObjectiveKey: string;
  BehaviourKey: BehaviourKey;
  BehaviourTitle: string;
  CorporateValue: string;
  RoleLevelCode: BehaviourLibraryV2SourceRoleLevel;
  RoleLevelName: string;
  DropdownLabel: string;
  ObjectiveTitle: string;
  ObjectiveDescription: string;
  SuggestedMeasure: string;
  SuggestedUnit: string;
  SuggestedEvidence: string;
  Active: boolean;
  SortOrder: number;
  EffectiveFrom: string;
  // eslint-disable-next-line @rushstack/no-new-null -- null preserves the synthetic sixteen-column blank cell.
  EffectiveTo: string | null;
}

export interface IBehaviourLibraryV2SourceCatalogue {
  frameworkVersion: string;
  published: boolean;
  productionSafe: boolean;
  synthetic: boolean;
  records: readonly IBehaviourLibraryV2SourceRow[];
}

/** Suggestion-only local record. It cannot supply governed Value or descriptor snapshots. */
export interface IBehaviourLibraryV2Record extends IBehaviourObjectiveLibraryRecord {
  frameworkVersion: BehaviourFrameworkV2Version;
  roleTier: BehaviourV2RoleTier;
  sourceRoleLevelCode: BehaviourLibraryV2SourceRoleLevel;
  published: boolean;
  productionSafe: boolean;
  synthetic: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface IBehaviourV2RatingOption {
  value: BehaviourV2Rating;
  label: BehaviourV2RatingLabel;
  displayLabel: string;
}

export interface IBehaviourFrameworkV2ValueDefinition {
  frameworkVersion: BehaviourFrameworkV2Version;
  valueId: BehaviourV2ValueId;
  title: string;
  corporateValue: string;
  descriptors: Readonly<Record<BehaviourV2RoleTier, string>>;
}

export interface IBehaviourFrameworkV2PublishedSet {
  frameworkVersion: BehaviourFrameworkV2Version;
  published: true;
  immutable: true;
  ratingOptions: readonly IBehaviourV2RatingOption[];
  values: readonly IBehaviourFrameworkV2ValueDefinition[];
}

export interface IBehaviourPersonAssignmentV2 {
  personKey: string;
  frameworkVersion: BehaviourFrameworkV2Version;
  roleTier: BehaviourV2RoleTier;
  cadence: BehaviourV2Cadence;
  periodKeys: readonly BehaviourV2Period[];
}

export interface IBehaviourPeriodCommitmentV2 {
  period: BehaviourV2Period;
  commitment: string;
}

/** Client-owned annual v02 content. Governed identity and wording are deliberately absent. */
export interface IBehaviourCommitmentClientContentV2 {
  valueId: BehaviourV2ValueId;
  selectedSuggestionKeys: readonly string[];
  commitment: string;
  periodCommitments: readonly IBehaviourPeriodCommitmentV2[];
}

/** Immutable governed copy stored with an annual Behaviour item. */
export interface IBehaviourAnnualSnapshotV2 {
  frameworkVersion: BehaviourFrameworkV2Version;
  valueId: BehaviourV2ValueId;
  valueTitle: string;
  corporateValue: string;
  roleTier: BehaviourV2RoleTier;
  descriptor: string;
  cadence: BehaviourV2Cadence;
  periodKeys: readonly BehaviourV2Period[];
  ratingOptions: readonly IBehaviourV2RatingOption[];
}

/** Immutable governed copy stored with each review-period item. */
export interface IBehaviourPeriodSnapshotV2 extends IBehaviourAnnualSnapshotV2 {
  period: BehaviourV2Period;
}

/** Separate evidence and assessment ownership; undefined means not assessed. */
export interface IBehaviourPeriodAssessmentV2 {
  employeeEvidence?: string;
  employeeAssessment?: BehaviourV2Rating;
  managerEvidence?: string;
  managerAssessment?: BehaviourV2Rating;
  finalEvidence?: string;
  finalAssessment?: BehaviourV2Rating;
}

export type BehaviourAssessmentOwnerV2 = 'Employee' | 'Manager' | 'Final';

export interface IBehaviourAssessmentPatchV2 {
  employeeEvidence?: string;
  employeeAssessment?: BehaviourV2Rating;
  managerEvidence?: string;
  managerAssessment?: BehaviourV2Rating;
  finalEvidence?: string;
  finalAssessment?: BehaviourV2Rating;
}
