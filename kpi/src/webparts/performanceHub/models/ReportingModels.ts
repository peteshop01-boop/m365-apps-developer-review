export type ReportingView = 'executive' | 'pillar' | 'portfolio' | 'kpiDetail' | 'impact' | 'behaviour';

export type ReportingSubmissionState = 'Reportable' | 'NotSubmitted' | 'AwaitingApproval' | 'NotRated' | 'MissingData';
export type ReportingRag = 'Red' | 'Amber' | 'Green' | 'NotRated';

export interface IGovernedReportingReference {
  id: string;
  versionKey: string;
  title: string;
  lifecycleState: string;
}

export interface IReportingProvenance {
  reportRunId: string;
  modelVersion: string;
  sourceReference: string;
  cutTimestamp: string;
  snapshotKey: string;
}

export interface IReportingCompleteness {
  expected: number;
  reportable: number;
  notSubmitted: number;
  awaitingApproval: number;
  notRated: number;
  missingData: number;
  freshnessLabel: string;
}

export interface IReportingScope {
  person?: string;
  team?: string;
  manager?: string;
  period?: string;
}

export interface ICoreReportingRow {
  rowKey: string;
  title: string;
  subtitle?: string;
  owner: string;
  submissionState: ReportingSubmissionState;
  rag: ReportingRag;
  resultDisplay: string;
  targetDisplay?: string;
  latestApprovedAt?: string;
  kpiId?: string;
  pillar?: string;
  portfolio?: IGovernedReportingReference;
  strategicOutcome?: IGovernedReportingReference;
  classification?: IGovernedReportingReference;
  provenanceRef: string;
  scope?: IReportingScope;
}

export interface ICoreReportingFeed {
  title: string;
  rows: ICoreReportingRow[];
  completeness: IReportingCompleteness;
  provenance: IReportingProvenance;
}

export interface IImpactReportingRow {
  impactKey: string;
  title: string;
  owner: string;
  submissionState: ReportingSubmissionState;
  progressDisplay: string;
  resultDisplay: string;
  contributionDisplay: string;
  businessContributionArea?: IGovernedReportingReference;
  pillar?: IGovernedReportingReference;
  strategicOutcome?: IGovernedReportingReference;
  latestApprovedAt?: string;
  provenanceRef: string;
  scope?: IReportingScope;
}

export interface IImpactReportingFeed {
  title: string;
  rows: IImpactReportingRow[];
  completeness: IReportingCompleteness;
  provenance: IReportingProvenance;
}

export type DeliveryGuardDisposition = 'Applied' | 'NotTriggered' | 'Blocked' | 'NotEvaluated';
export type DeliveryFreshnessState = 'Current' | 'Stale';

export interface IGovernedDeliveryComponentResult {
  domain: 'Core' | 'Impact';
  state: 'Reportable' | 'NotRated' | 'MissingData';
  resultDisplay: string;
  configuredWeightPercent: number;
  weightedContributionDisplay: string;
  sourceResultRef: string;
}

export interface IGovernedOverallDeliveryResult {
  state: 'Reportable' | 'NotRated' | 'MissingData';
  resultDisplay: string;
  classificationDisplay: string;
  sourceResultRef: string;
}

export interface IGovernedDeliveryResultContract {
  contractId: string;
  contractVersion: string;
  snapshotKey: string;
  freshnessState: DeliveryFreshnessState;
  weightingConfiguration: IGovernedReportingReference;
  isDefaultWeighting: boolean;
  core: IGovernedDeliveryComponentResult;
  impact: IGovernedDeliveryComponentResult;
  overall: IGovernedOverallDeliveryResult;
  poorCoreMaskingGuard: {
    disposition: DeliveryGuardDisposition;
    display: string;
    policyReference: string;
  };
  provenance: IReportingProvenance;
}

export interface IGovernedTaxonomyReference extends IGovernedReportingReference {
  effectiveFrom: string;
  retiredAt?: string;
  supersedesVersionKey?: string;
}

export interface IGovernedBehaviourCatalogueReference {
  catalogueId: string;
  versionKey: string;
  lifecycleState: string;
  effectiveFrom: string;
  contentSha256: string;
  detailedTargetCount: number;
  headlineReferences: IGovernedTaxonomyReference[];
}

export interface IReportingGovernanceConfiguration {
  configurationReference: IGovernedReportingReference;
  businessContributionAreas: {
    defaultReferences: IGovernedTaxonomyReference[];
    history: IGovernedTaxonomyReference[];
  };
  strategicPillars: {
    history: IGovernedTaxonomyReference[];
  };
  behaviourCatalogue: IGovernedBehaviourCatalogueReference;
}

export type BehaviourClassification = 'Developing' | 'Effective' | 'Exceptional';

export interface IBehaviourDistribution {
  classification: BehaviourClassification;
  count: number;
  display: string;
  percentage?: number;
  movementPercentagePoints?: number;
}

export type BehaviourAssessmentState = 'Draft' | 'AwaitingApproval' | 'Final' | 'ManagerApproved';

/** Synthetic, source-identifiable input. No operational assessment binding is implied. */
export interface IBehaviourAssessment {
  assessmentId: string;
  personKey: string;
  behaviourKey: string;
  periodKey: string;
  version: number;
  recordedAt: string;
  state: BehaviourAssessmentState;
  classification?: BehaviourClassification;
  provenanceRef: string;
  scope?: IReportingScope;
}

export interface IBehaviourReportingPeriod {
  periodKey: string;
  comparisonSeriesKey: string;
  order: number;
  complete: boolean;
  provenanceRef: string;
}

export interface IBehaviourHeadline {
  behaviourKey: string;
  title: string;
  submissionState: ReportingSubmissionState;
  distributions: IBehaviourDistribution[];
  movementDisplay: string;
  provenanceRef: string;
  scope?: IReportingScope;
  headlineReference: IGovernedTaxonomyReference;
}

export interface IBehaviourReportingFeed {
  title: string;
  headlines: IBehaviourHeadline[];
  selectedPeriodKey: string;
  periods: IBehaviourReportingPeriod[];
  assessments: IBehaviourAssessment[];
  completeness: IReportingCompleteness;
  provenance: IReportingProvenance;
}

export interface IReportingViewsDataset {
  performanceYear: string;
  deliverySummary?: IGovernedDeliveryResultContract;
  governance?: IReportingGovernanceConfiguration;
  core: {
    executive: ICoreReportingFeed;
    pillar: ICoreReportingFeed;
    portfolio: ICoreReportingFeed;
    kpiDetail: ICoreReportingFeed;
  };
  impact: IImpactReportingFeed;
  behaviour: IBehaviourReportingFeed;
}

export type ReportingFilterState = ReportingSubmissionState | 'All';
export type ReportingSort = 'Title' | 'Owner' | 'SubmissionState' | 'StableKey';

export interface IReportingViewState {
  search: string;
  submissionState: ReportingFilterState;
  sort: ReportingSort;
  person: string;
  team: string;
  manager: string;
  period: string;
  contributionAreaId: string;
}
