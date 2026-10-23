export const BEHAVIOUR_KEYS = ['BHV-01', 'BHV-02', 'BHV-03', 'BHV-04', 'BHV-05'] as const;

export type BehaviourKey = typeof BEHAVIOUR_KEYS[number];
export type BehaviourRating = 1 | 2 | 3 | 4;
export type BehaviourObjectiveSource = 'Library' | 'Custom';
export type BehaviourRag = 'Green' | 'Amber' | 'Red' | 'NotRated';
export type BehaviourRoleLevelCode = 'L1' | 'L2' | 'L3';

/**
 * Admin-maintainable source record for KCFKPI_BehaviourObjectiveLibrary.
 * The initial records live in a provisioning seed module, never in React.
 */
export interface IBehaviourObjectiveLibraryRecord {
  id?: number;
  etag?: string;
  behaviourObjectiveKey: string;
  behaviourKey: BehaviourKey;
  roleLevelCode?: BehaviourRoleLevelCode;
  objectiveTitle: string;
  objectiveDescription: string;
  suggestedMeasure: string;
  suggestedUnit: string;
  suggestedEvidence: string;
  active: boolean;
  sortOrder: number;
  effectiveFrom?: string;
  effectiveTo?: string;
}

/** New role catalogue records require a matching exact stable key and level. */
export interface IRoleBehaviourObjectiveLibraryRecord extends IBehaviourObjectiveLibraryRecord {
  roleLevelCode: BehaviourRoleLevelCode;
}

export interface IBehaviourQuarterTargets {
  q1Target: string;
  q2Target: string;
  q3Target: string;
  q4Target: string;
}

/**
 * Annual Workplan copy of either a library suggestion or an employee-created
 * objective. Library content is copied so an approved Workplan remains stable
 * if an administrator later updates the suggestion.
 */
export interface ISelectedBehaviourObjective {
  behaviourKey: BehaviourKey;
  source: BehaviourObjectiveSource;
  sourceObjectiveKey?: string;
  /** Stable keys for every selected controlled suggestion. Legacy rows fall back to sourceObjectiveKey. */
  selectedSuggestionKeys?: string[];
  /** Employee-authored wording may be stored alongside controlled suggestions. */
  customObjective?: string;
  objectiveTitle: string;
  objectiveDescription: string;
  measure: string;
  unit: string;
  evidenceDefinition: string;
  quarterTargets: IBehaviourQuarterTargets;
  targetRating?: BehaviourRating;
  behaviourWeight: number;
  activeInWorkplan: boolean;
}

/**
 * Employee, manager and final ratings are deliberately separate fields. A
 * manager assessment must never silently replace the employee self-rating.
 */
export interface IBehaviourQuarterAssessment {
  behaviourKey: BehaviourKey;
  targetRating: BehaviourRating;
  employeeSelfRating?: BehaviourRating;
  employeeEvidence?: string;
  employeeCommentary?: string;
  managerRating?: BehaviourRating;
  managerEvidence?: string;
  managerCommentary?: string;
  finalRating?: BehaviourRating;
  finalCommentary?: string;
}

export interface IBehaviourRatingDisplay {
  value?: BehaviourRating;
  label?: string;
}

export interface IBehaviourAssessmentView {
  target: IBehaviourRatingDisplay;
  employee: IBehaviourRatingDisplay;
  manager: IBehaviourRatingDisplay;
  final: IBehaviourRatingDisplay;
  rag: BehaviourRag;
  rawNormalisedScore?: number;
  scoredContribution?: number;
}

/** Product-approved role labels used by the governed annual commitment shell. */
export const GOVERNED_BEHAVIOUR_ROLE_LEVELS = Object.freeze([
  'Individual Contributor / Coach',
  'Manager',
  'Senior Manager / Leader'
] as const);

export const GOVERNED_BEHAVIOUR_RATINGS = Object.freeze(['Developing', 'Effective', 'Exceptional'] as const);
export const GOVERNED_BEHAVIOUR_MANAGER_DISPOSITIONS = Object.freeze(['AGREED', 'CHANGES REQUESTED'] as const);

export type GovernedBehaviourRoleLevel = typeof GOVERNED_BEHAVIOUR_ROLE_LEVELS[number];
export type GovernedBehaviourHeadlineRating = typeof GOVERNED_BEHAVIOUR_RATINGS[number];
export type GovernedBehaviourManagerDisposition = typeof GOVERNED_BEHAVIOUR_MANAGER_DISPOSITIONS[number];
export type GovernedBehaviourCommitmentSource = 'GovernedTarget' | 'OwnTarget';
export type GovernedBehaviourWorkplanState = 'Draft' | 'ChangesRequested' | 'Submitted';

export interface IGovernedBehaviourCatalogueAuthority {
  catalogueId: string;
  version: string;
  etag: string;
  approvalReference: 'KCF-KPI-Sponsor-BEH-V1-001';
  contentSha256: string;
  effectiveFrom: string;
  publishedAt: string;
  publishedBy: string;
  changeReference: string;
}

export interface IGovernedBehaviourTargetDefinition {
  targetKey: string;
  behaviourKey: BehaviourKey;
  focusKey: string;
  roleLevel: GovernedBehaviourRoleLevel;
  wording: string;
  sortOrder: 1 | 2 | 3 | 4 | 5;
  active: boolean;
  approved: boolean;
  effectiveFrom: string;
  effectiveTo?: string;
}

export interface IGovernedBehaviourFocusDefinition {
  focusKey: string;
  behaviourKey: BehaviourKey;
  title: string;
  sortOrder: 1 | 2 | 3 | 4 | 5;
  targets: readonly IGovernedBehaviourTargetDefinition[];
}

export interface IGovernedBehaviourHeadlineDefinition {
  behaviourKey: BehaviourKey;
  title: string;
  sortOrder: 1 | 2 | 3 | 4 | 5;
  active: boolean;
  approved: boolean;
  focuses: readonly IGovernedBehaviourFocusDefinition[];
}

/** Supplied by the separate governed catalogue workstream; detailed Product wording is never embedded in UI logic. */
export interface IGovernedBehaviourCatalogueContract {
  schema: 'KCF.GovernedBehaviourCatalogue';
  immutable: true;
  published: true;
  productionSafe: true;
  authority: IGovernedBehaviourCatalogueAuthority;
  headlines: readonly IGovernedBehaviourHeadlineDefinition[];
  ratingOptions: readonly GovernedBehaviourHeadlineRating[];
}

export interface IGovernedBehaviourCatalogueExpectation extends IGovernedBehaviourCatalogueAuthority {}

export interface IGovernedBehaviourCommitmentDraft {
  commitmentKey: string;
  source: GovernedBehaviourCommitmentSource;
  behaviourKey: BehaviourKey;
  focusKey: string;
  roleLevel: GovernedBehaviourRoleLevel;
  targetKey?: string;
  ownTarget?: string;
  catalogueVersion: string;
  catalogueEtag: string;
  myCommitment: string;
  howWillWeKnow: string;
}

export interface IGovernedBehaviourSelectionSnapshot {
  commitmentKey: string;
  source: GovernedBehaviourCommitmentSource;
  behaviourKey: BehaviourKey;
  headlineTitle: string;
  focusKey: string;
  focusTitle: string;
  roleLevel: GovernedBehaviourRoleLevel;
  targetKey: string;
  targetWording: string;
  catalogueId: string;
  catalogueVersion: string;
  catalogueEtag: string;
  approvalReference: 'KCF-KPI-Sponsor-BEH-V1-001';
  contentSha256: string;
  myCommitment: string;
  howWillWeKnow: string;
}

export interface IGovernedBehaviourCommandContext {
  action: 'Save' | 'Submit';
  workplanKey: string;
  expectedWorkplanVersion: string;
  currentWorkplanVersion: string;
  state: GovernedBehaviourWorkplanState;
  roleLevel: GovernedBehaviourRoleLevel;
  actorEmail: string;
  occurredAt: string;
  changeReference: string;
}

export interface IGovernedBehaviourCommitmentCommand {
  mode: 'BrowserMemoryCommand';
  action: 'Save' | 'Submit';
  workplanKey: string;
  expectedWorkplanVersion: string;
  sourceState: 'Draft' | 'ChangesRequested';
  catalogueAuthority: Readonly<IGovernedBehaviourCatalogueAuthority>;
  roleLevel: GovernedBehaviourRoleLevel;
  commitments: readonly Readonly<IGovernedBehaviourSelectionSnapshot>[];
  guidance: Readonly<{ normalMinimum: 3; normalMaximum: 5 }>;
  behavioursExcludedFromDeliveryArithmetic: true;
  perTargetScoreProduced: false;
  behaviourRagProduced: false;
  tenantMutationExecuted: false;
  attribution: Readonly<{ actorEmail: string; occurredAt: string; changeReference: string }>;
}

export interface IGovernedBehaviourManagerReviewInput {
  auditKey: string;
  expectedWorkplanVersion: string;
  managerEmail: string;
  occurredAt: string;
  changeReference: string;
  disposition: GovernedBehaviourManagerDisposition;
  commentary?: string;
}

export interface IGovernedBehaviourManagerReviewEntry extends IGovernedBehaviourManagerReviewInput {
  sequence: number;
}

export interface IGovernedBehaviourHeadlineRatingInput {
  behaviourKey: BehaviourKey;
  rating: GovernedBehaviourHeadlineRating;
}

export interface IGovernedBehaviourHeadlineRatingSet {
  ratings: readonly Readonly<IGovernedBehaviourHeadlineRatingInput>[];
  perTargetScoreProduced: false;
  behaviourRagProduced: false;
  deliveryContributionProduced: false;
}

export interface IGovernedBehaviourSelectionView {
  behaviourKey: BehaviourKey;
  headlineTitle: string;
  focuses: readonly Readonly<{
    focusKey: string;
    focusTitle: string;
    targets: readonly Readonly<{
      targetKey: string;
      wording: string;
      selected: boolean;
      historicallySelected: boolean;
      selectable: boolean;
    }>[];
  }>[];
}
