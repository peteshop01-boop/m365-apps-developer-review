import type {
  DeliveryFreshnessState,
  DeliveryGuardDisposition,
  IBehaviourReportingFeed,
  IGovernedDeliveryResultContract,
  IGovernedTaxonomyReference,
  ICoreReportingFeed,
  IReportingCompleteness,
  IReportingGovernanceConfiguration,
  IReportingProvenance,
  IReportingScope,
  IReportingViewsDataset
} from '../models/ReportingModels';
import { APPROVED_BEHAVIOUR_CATALOGUE_SHA256 } from '../services/ReportingGovernance';

export const reportingSnapshotKey = 'SYNTHETIC-SNAPSHOT-2026-Q2-001';

export const buildReportingProvenance = (sourceReference = 'synthetic/approved-reporting-feed.json'): IReportingProvenance => ({
  reportRunId: 'RUN-2026-Q2-001',
  modelVersion: 'governed-model-v1',
  sourceReference,
  cutTimestamp: '2026-09-21T22:30:00.000Z',
  snapshotKey: reportingSnapshotKey
});

const taxonomyReference = (id: string, title: string, versionKey = `${id}-V1`): IGovernedTaxonomyReference => ({
  id,
  versionKey,
  title,
  lifecycleState: 'Published',
  effectiveFrom: '2026-04-01T00:00:00.000Z'
});

const approvedBusinessContributionAreaTitles = [
  'Programme Delivery & Service Quality',
  'Operations',
  'Funding & Income Generation',
  'Partnerships & Stakeholders',
  'Media & Communications',
  'Impact, Insight & Reporting',
  'Social Value & Community Impact',
  'People & Culture',
  'Finance, Commercial & Governance',
  'Digital, Data & Innovation',
  'Events & Projects',
  'EDI & Inclusion',
  'Other / Cross-Foundation'
];

export const businessContributionAreaReferences = approvedBusinessContributionAreaTitles.map((title, index) =>
  taxonomyReference(`BCA-${index + 1 < 10 ? '0' : ''}${index + 1}`, title)
);

export const behaviourHeadlineReferences = [
  taxonomyReference('BEH-001', 'WE TAKE RESPONSIBILITY', 'BEH-001-V1'),
  taxonomyReference('BEH-002', 'WE UNITE AS ONE CLUB', 'BEH-002-V1'),
  taxonomyReference('BEH-003', 'WE BUILD THE NEXT CHAPTER', 'BEH-003-V1'),
  taxonomyReference('BEH-004', 'WE RESPECT THE GAME & EACH OTHER', 'BEH-004-V1'),
  taxonomyReference('BEH-005', 'WE WORK & PLAY WITH ENERGY', 'BEH-005-V1')
];

/** Local synthetic inputs only; no tenant source or selection is asserted. */
export const buildBehaviourAssessmentInput = (scopes: IReportingScope[] = behaviourHeadlineReferences.map(() => ({
  team: 'Synthetic Team', manager: 'Synthetic Manager'
}))): Pick<IBehaviourReportingFeed, 'selectedPeriodKey' | 'periods' | 'assessments'> => ({
  selectedPeriodKey: '2026 Q2',
  periods: [
    { periodKey: '2026 Q1', comparisonSeriesKey: 'Quarterly', order: 1, complete: false, provenanceRef: 'SYNTHETIC-PERIOD-Q1' },
    { periodKey: '2026 Q2', comparisonSeriesKey: 'Quarterly', order: 2, complete: true, provenanceRef: 'SYNTHETIC-PERIOD-Q2' }
  ],
  assessments: behaviourHeadlineReferences.flatMap((reference, index) =>
    (['Developing', 'Effective', 'Exceptional'] as const).map((classification, personIndex) => ({
      assessmentId: `SYNTHETIC-${reference.id}-${personIndex + 1}-V1`,
      personKey: `SYNTHETIC-PERSON-${personIndex + 1}`,
      behaviourKey: reference.id,
      periodKey: '2026 Q2',
      version: 1,
      recordedAt: '2026-09-20T10:00:00.000Z',
      state: 'ManagerApproved' as const,
      classification,
      provenanceRef: `SYNTHETIC-${reference.id}-${personIndex + 1}`,
      scope: { ...scopes[index], person: `Synthetic Person ${personIndex + 1}`, period: '2026 Q2' }
    }))
  )
});

export const strategicPillarReference = taxonomyReference('PILLAR-01', 'Synthetic Strategic Pillar');

export const buildReportingGovernanceConfiguration = (): IReportingGovernanceConfiguration => ({
  configurationReference: {
    id: 'REPORTING-CONFIG-2026',
    versionKey: 'REPORTING-CONFIG-2026-V1',
    title: 'Synthetic governed reporting configuration',
    lifecycleState: 'Published'
  },
  businessContributionAreas: {
    defaultReferences: businessContributionAreaReferences.map(reference => ({ ...reference })),
    history: [
      ...businessContributionAreaReferences.map(reference => ({ ...reference })),
      { ...businessContributionAreaReferences[0], versionKey: 'BCA-01-V0', title: 'Historic synthetic label', lifecycleState: 'Retired', effectiveFrom: '2025-04-01T00:00:00.000Z', retiredAt: '2026-03-31T23:59:59.000Z' }
    ]
  },
  strategicPillars: { history: [{ ...strategicPillarReference }] },
  behaviourCatalogue: {
    catalogueId: 'KCF-KPI-Sponsor-BEH-V1-001',
    versionKey: 'BEH-CATALOGUE-V1',
    lifecycleState: 'SponsorApproved',
    effectiveFrom: '2026-09-21T00:00:00.000Z',
    contentSha256: APPROVED_BEHAVIOUR_CATALOGUE_SHA256,
    detailedTargetCount: 75,
    headlineReferences: behaviourHeadlineReferences.map(reference => ({ ...reference }))
  }
});

export interface IDeliveryFixtureOptions {
  coreWeight?: number;
  impactWeight?: number;
  isDefaultWeighting?: boolean;
  freshnessState?: DeliveryFreshnessState;
  guardDisposition?: DeliveryGuardDisposition;
  overallState?: 'Reportable' | 'NotRated' | 'MissingData';
}

export const buildDeliveryResultContract = (options: IDeliveryFixtureOptions = {}): IGovernedDeliveryResultContract => ({
  contractId: 'OVERALL-DELIVERY-2026-Q2',
  contractVersion: 'DELIVERY-CONTRACT-V1',
  snapshotKey: reportingSnapshotKey,
  freshnessState: options.freshnessState || 'Current',
  weightingConfiguration: {
    id: 'DELIVERY-WEIGHTS-2026',
    versionKey: options.isDefaultWeighting === false ? 'DELIVERY-WEIGHTS-2026-V2' : 'DELIVERY-WEIGHTS-2026-V1',
    title: 'Governed Core and Impact weighting',
    lifecycleState: 'Published'
  },
  isDefaultWeighting: options.isDefaultWeighting !== false,
  core: {
    domain: 'Core',
    state: 'Reportable',
    resultDisplay: '72.0',
    configuredWeightPercent: options.coreWeight ?? 70,
    weightedContributionDisplay: '50.4 supplied',
    sourceResultRef: 'GOVERNED-CORE-RESULT-001'
  },
  impact: {
    domain: 'Impact',
    state: 'Reportable',
    resultDisplay: '88.0',
    configuredWeightPercent: options.impactWeight ?? 30,
    weightedContributionDisplay: '26.4 supplied',
    sourceResultRef: 'GOVERNED-IMPACT-RESULT-001'
  },
  overall: {
    state: options.overallState || 'Reportable',
    resultDisplay: options.overallState === 'NotRated' ? 'Not rated' : options.overallState === 'MissingData' ? 'Missing' : '76.8 supplied',
    classificationDisplay: options.overallState && options.overallState !== 'Reportable' ? 'No classification' : 'Supplied governed classification',
    sourceResultRef: 'GOVERNED-OVERALL-RESULT-001'
  },
  poorCoreMaskingGuard: {
    disposition: options.guardDisposition || 'Applied',
    display: options.guardDisposition === 'Blocked' ? 'Guard evaluation unavailable; result must not be presented.' : 'Governed engine confirmed the poor-Core masking guard disposition.',
    policyReference: 'KCF-KPI-Sponsor-PD-01'
  },
  provenance: buildReportingProvenance('synthetic/governed-delivery-result.json')
});

const decisionCompleteness: IReportingCompleteness = {
  expected: 1,
  reportable: 1,
  notSubmitted: 0,
  awaitingApproval: 0,
  notRated: 0,
  missingData: 0,
  freshnessLabel: 'Synthetic current cut'
};

const decisionCoreFeed = (title: string): ICoreReportingFeed => ({
  title,
  completeness: decisionCompleteness,
  provenance: buildReportingProvenance(`synthetic/${title.toLowerCase().replace(/ /g, '-')}.json`),
  rows: [{
    rowKey: `${title}-ROW-001`,
    kpiId: 'CORE-001',
    title: 'Synthetic governed Core result',
    owner: 'Synthetic Core owner',
    submissionState: 'Reportable',
    rag: 'Green',
    resultDisplay: '72 supplied',
    provenanceRef: 'GOVERNED-CORE-RESULT-001',
    scope: { team: 'Synthetic Team', manager: 'Synthetic Manager', period: '2026 Q2' }
  }]
});

export const buildDecisionReportingDataset = (): IReportingViewsDataset => ({
  performanceYear: '2026/27',
  deliverySummary: buildDeliveryResultContract(),
  governance: buildReportingGovernanceConfiguration(),
  core: {
    executive: decisionCoreFeed('Executive'),
    pillar: decisionCoreFeed('Pillar'),
    portfolio: decisionCoreFeed('Portfolio'),
    kpiDetail: decisionCoreFeed('KPI detail')
  },
  impact: {
    title: 'Impact',
    completeness: decisionCompleteness,
    provenance: buildReportingProvenance('synthetic/impact.json'),
    rows: [{
      impactKey: 'IMPACT-001',
      title: 'Synthetic governed Impact result',
      owner: 'Synthetic Impact owner',
      submissionState: 'Reportable',
      progressDisplay: 'On plan',
      resultDisplay: '88 supplied',
      contributionDisplay: '26.4 supplied',
      businessContributionArea: { ...businessContributionAreaReferences[0] },
      pillar: { ...strategicPillarReference },
      provenanceRef: 'GOVERNED-IMPACT-RESULT-001',
      scope: { team: 'Synthetic Team', manager: 'Synthetic Manager', period: '2026 Q2' }
    }]
  },
  behaviour: {
    title: 'Behaviours',
    ...buildBehaviourAssessmentInput(),
    completeness: { ...decisionCompleteness, expected: 5, reportable: 5 },
    provenance: buildReportingProvenance('synthetic/behaviour.json'),
    headlines: behaviourHeadlineReferences.map(reference => ({
      behaviourKey: reference.id,
      title: reference.title,
      headlineReference: { ...reference },
      submissionState: 'Reportable',
      distributions: [
        { classification: 'Developing', count: 1, display: '1 person' },
        { classification: 'Effective', count: 2, display: '2 people' },
        { classification: 'Exceptional', count: 1, display: '1 person' }
      ],
      movementDisplay: 'No approved comparison',
      provenanceRef: `GOVERNED-${reference.id}`,
      scope: { team: 'Synthetic Team', manager: 'Synthetic Manager', period: '2026 Q2' }
    }))
  }
});
