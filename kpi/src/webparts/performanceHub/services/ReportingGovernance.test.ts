import {
  APPROVED_BEHAVIOUR_CATALOGUE_SHA256,
  APPROVED_BEHAVIOUR_TARGET_COUNT,
  APPROVED_BUSINESS_CONTRIBUTION_AREA_COUNT,
  validateReportingGovernance
} from './ReportingGovernance';
import {
  buildDecisionReportingDataset,
  buildDeliveryResultContract,
  buildReportingGovernanceConfiguration
} from '../test/ReportingDecisionFixtures';

describe('Approved reporting decision governance', () => {
  it('accepts the supplied governed default Core 70 / Impact 30 result without calculating it again', () => {
    const dataset = buildDecisionReportingDataset();
    expect(validateReportingGovernance(dataset)).toEqual([]);
    expect(dataset.deliverySummary?.core.configuredWeightPercent).toBe(70);
    expect(dataset.deliverySummary?.impact.configuredWeightPercent).toBe(30);
    expect(dataset.deliverySummary?.overall.resultDisplay).toBe('76.8 supplied');
  });

  it('accepts an authorised alternative weighting when it totals 100 and remains explicitly non-default', () => {
    const dataset = buildDecisionReportingDataset();
    dataset.deliverySummary = buildDeliveryResultContract({ coreWeight: 60, impactWeight: 40, isDefaultWeighting: false });
    expect(validateReportingGovernance(dataset)).toEqual([]);
    expect(dataset.deliverySummary.core.weightedContributionDisplay).toBe('50.4 supplied');
  });

  it('fails closed for invalid weights, stale result, missing result/config and NotRated Overall Delivery', () => {
    const invalidWeight = buildDecisionReportingDataset();
    invalidWeight.deliverySummary = buildDeliveryResultContract({ coreWeight: 65, impactWeight: 30, isDefaultWeighting: false });
    expect(validateReportingGovernance(invalidWeight)).toEqual(expect.arrayContaining([expect.stringContaining('total exactly 100%')]));

    const stale = buildDecisionReportingDataset();
    stale.deliverySummary = buildDeliveryResultContract({ freshnessState: 'Stale' });
    expect(validateReportingGovernance(stale)).toEqual(expect.arrayContaining([expect.stringContaining('is stale')]));

    const missing = buildDecisionReportingDataset();
    missing.deliverySummary = undefined;
    missing.governance = undefined;
    expect(validateReportingGovernance(missing)).toEqual(expect.arrayContaining([
      expect.stringContaining('result contract is absent'),
      expect.stringContaining('configuration is absent')
    ]));

    const notRated = buildDecisionReportingDataset();
    notRated.deliverySummary = buildDeliveryResultContract({ overallState: 'NotRated' });
    expect(validateReportingGovernance(notRated)).toEqual(expect.arrayContaining([expect.stringContaining('NotRated or missing')]));
  });

  it('fails closed for mismatched snapshot provenance or an unresolved poor-Core guard', () => {
    const mismatch = buildDecisionReportingDataset();
    if (mismatch.deliverySummary) mismatch.deliverySummary.provenance = { ...mismatch.deliverySummary.provenance, snapshotKey: 'OTHER-SNAPSHOT' };
    expect(validateReportingGovernance(mismatch)).toEqual(expect.arrayContaining([expect.stringContaining('snapshot does not match')]));

    const guardBlocked = buildDecisionReportingDataset();
    guardBlocked.deliverySummary = buildDeliveryResultContract({ guardDisposition: 'Blocked' });
    expect(validateReportingGovernance(guardBlocked)).toEqual(expect.arrayContaining([expect.stringContaining('poor-Core masking guard')]));
  });

  it('rejects any Behaviour field injected into Delivery arithmetic', () => {
    const dataset = buildDecisionReportingDataset();
    Object.assign(dataset.deliverySummary || {}, { behaviourWeightPercent: 10, behaviourScore: 99 });
    expect(validateReportingGovernance(dataset)).toEqual(expect.arrayContaining([expect.stringContaining('Behaviour data cannot enter')]));
  });

  it('requires exactly 13 versioned BCA defaults retained in history while Strategic Pillar remains optional', () => {
    const dataset = buildDecisionReportingDataset();
    expect(dataset.governance?.businessContributionAreas.defaultReferences).toHaveLength(APPROVED_BUSINESS_CONTRIBUTION_AREA_COUNT);
    if (dataset.impact.rows[0]) dataset.impact.rows[0] = { ...dataset.impact.rows[0], pillar: undefined };
    expect(validateReportingGovernance(dataset)).toEqual([]);

    const shortTaxonomy = buildDecisionReportingDataset();
    if (shortTaxonomy.governance) shortTaxonomy.governance.businessContributionAreas.defaultReferences = shortTaxonomy.governance.businessContributionAreas.defaultReferences.slice(0, 12);
    expect(validateReportingGovernance(shortTaxonomy)).toEqual(expect.arrayContaining([expect.stringContaining('exactly 13 values')]));

    const missingHistory = buildDecisionReportingDataset();
    if (missingHistory.governance) missingHistory.governance.businessContributionAreas.history = missingHistory.governance.businessContributionAreas.history.filter(reference => reference.id !== 'BCA-01');
    expect(validateReportingGovernance(missingHistory)).toEqual(expect.arrayContaining([expect.stringContaining('retained in governed history')]));
  });

  it('binds each Impact classification and optional Pillar to an exact governed historic version', () => {
    const invalidBca = buildDecisionReportingDataset();
    invalidBca.impact.rows[0].businessContributionArea = { ...invalidBca.impact.rows[0].businessContributionArea!, versionKey: 'UNAPPROVED' };
    expect(validateReportingGovernance(invalidBca)).toEqual(expect.arrayContaining([expect.stringContaining('exact governed historic version')]));

    const invalidPillar = buildDecisionReportingDataset();
    invalidPillar.impact.rows[0].pillar = { ...invalidPillar.impact.rows[0].pillar!, versionKey: 'UNAPPROVED' };
    expect(validateReportingGovernance(invalidPillar)).toEqual(expect.arrayContaining([expect.stringContaining('optional Strategic Pillar')]));
  });

  it('requires the approved Behaviour catalogue hash, 75-target reference and five exact headline identities', () => {
    const dataset = buildDecisionReportingDataset();
    expect(dataset.governance?.behaviourCatalogue.contentSha256).toBe(APPROVED_BEHAVIOUR_CATALOGUE_SHA256);
    expect(dataset.governance?.behaviourCatalogue.detailedTargetCount).toBe(APPROVED_BEHAVIOUR_TARGET_COUNT);
    expect(validateReportingGovernance(dataset)).toEqual([]);

    const wrongCatalogue = buildDecisionReportingDataset();
    if (wrongCatalogue.governance) wrongCatalogue.governance.behaviourCatalogue = { ...wrongCatalogue.governance.behaviourCatalogue, contentSha256: 'UNAPPROVED', detailedTargetCount: 74 };
    expect(validateReportingGovernance(wrongCatalogue)).toEqual(expect.arrayContaining([expect.stringContaining('Sponsor-approved v1 hash and 75-target count')]));

    const wrongHeadline = buildDecisionReportingDataset();
    wrongHeadline.behaviour.headlines[0] = { ...wrongHeadline.behaviour.headlines[0], title: 'Invented headline' };
    expect(validateReportingGovernance(wrongHeadline)).toEqual(expect.arrayContaining([expect.stringContaining('governed Behaviour catalogue version')]));
  });

  it.each([
    ['absent', undefined], ['null', null], ['array', []], ['scalar', 'invalid']
  ])('rejects an %s Behaviour catalogue with a specific issue and no throw', (_name, catalogue) => {
    const dataset = buildDecisionReportingDataset();
    (dataset.governance as unknown as { behaviourCatalogue: unknown }).behaviourCatalogue = catalogue;
    expect(validateReportingGovernance(dataset)).toEqual(expect.arrayContaining([
      expect.stringContaining('governed Behaviour catalogue is absent or malformed')
    ]));
  });

  it.each([
    ['missing', undefined], ['null', null], ['object', {}], ['scalar', 'invalid'],
    ['null member', [null]], ['array member', [[]]], ['scalar member', ['invalid']]
  ])('rejects %s governed Behaviour headline references without throwing', (_name, references) => {
    const dataset = buildDecisionReportingDataset();
    (dataset.governance!.behaviourCatalogue as unknown as { headlineReferences: unknown }).headlineReferences = references;
    expect(validateReportingGovernance(dataset)).toEqual(expect.arrayContaining([
      expect.stringContaining('governed Behaviour headline references are absent or malformed')
    ]));
  });

  it('accepts five valid governed Behaviour headline references', () => {
    expect(validateReportingGovernance(buildDecisionReportingDataset())).toEqual([]);
  });

  it.each([
    ['null dataset', 'dataset', null], ['array dataset', 'dataset', []],
    ['scalar dataset', 'dataset', 'invalid'],
    ['null Delivery', 'deliverySummary', null], ['array Delivery', 'deliverySummary', []],
    ['null governance', 'governance', null], ['array governance', 'governance', []],
    ['Delivery provenance', 'deliverySummary.provenance', null],
    ['Delivery Core component', 'deliverySummary.core', []],
    ['Delivery Impact component', 'deliverySummary.impact', null],
    ['Delivery Overall component', 'deliverySummary.overall', null],
    ['Delivery masking guard', 'deliverySummary.poorCoreMaskingGuard', null],
    ['Core container', 'core', null], ['Core executive feed', 'core.executive', null],
    ['Core pillar feed', 'core.pillar', []], ['Core portfolio feed', 'core.portfolio', null],
    ['Core KPI detail feed', 'core.kpiDetail', null],
    ['Core executive provenance', 'core.executive.provenance', null],
    ['Core pillar provenance', 'core.pillar.provenance', []],
    ['Core portfolio provenance', 'core.portfolio.provenance', null],
    ['Core KPI detail provenance', 'core.kpiDetail.provenance', null],
    ['Impact feed', 'impact', null], ['Impact provenance', 'impact.provenance', null],
    ['Behaviour feed', 'behaviour', null], ['Behaviour provenance', 'behaviour.provenance', null],
    ['BCA container', 'governance.businessContributionAreas', null],
    ['BCA defaults missing', 'governance.businessContributionAreas.defaultReferences', undefined],
    ['BCA defaults null', 'governance.businessContributionAreas.defaultReferences', null],
    ['BCA default member', 'governance.businessContributionAreas.defaultReferences.0', null],
    ['BCA history missing', 'governance.businessContributionAreas.history', undefined],
    ['BCA history null', 'governance.businessContributionAreas.history', null],
    ['BCA history member', 'governance.businessContributionAreas.history.0', []],
    ['Strategic Pillars container', 'governance.strategicPillars', null],
    ['Strategic Pillar history', 'governance.strategicPillars.history', null],
    ['Strategic Pillar history member', 'governance.strategicPillars.history.0', null],
    ['Impact rows missing', 'impact.rows', undefined], ['Impact rows null', 'impact.rows', null],
    ['Impact row member', 'impact.rows.0', null],
    ['Impact area reference', 'impact.rows.0.businessContributionArea', []],
    ['Impact pillar reference', 'impact.rows.0.pillar', null],
    ['Behaviour headlines missing', 'behaviour.headlines', undefined],
    ['Behaviour headlines null', 'behaviour.headlines', null],
    ['Behaviour headlines scalar', 'behaviour.headlines', 'invalid'],
    ['Behaviour headline member', 'behaviour.headlines.0', null],
    ['Behaviour headline reference missing', 'behaviour.headlines.0.headlineReference', undefined],
    ['Behaviour headline reference null', 'behaviour.headlines.0.headlineReference', null],
    ['Behaviour headline reference array', 'behaviour.headlines.0.headlineReference', []],
    ['Behaviour headline reference scalar', 'behaviour.headlines.0.headlineReference', 'invalid']
  ])('returns a controlled issue for %s', (_name, path, replacement) => {
    let dataset: unknown = buildDecisionReportingDataset();
    if (path === 'dataset') {
      dataset = replacement;
    } else {
      const segments = path.split('.');
      let target = dataset as Record<string, unknown>;
      for (const segment of segments.slice(0, -1)) target = target[segment] as Record<string, unknown>;
      target[segments[segments.length - 1]] = replacement;
    }
    const issues = validateReportingGovernance(dataset as ReturnType<typeof buildDecisionReportingDataset>);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.every(issue => typeof issue === 'string' && issue.trim().length > 0)).toBe(true);
  });

  it('keeps governed configuration as versioned input rather than an embedded calculation table', () => {
    const governance = buildReportingGovernanceConfiguration();
    expect(governance.configurationReference.versionKey).toBe('REPORTING-CONFIG-2026-V1');
    expect(governance.businessContributionAreas.defaultReferences.every(reference => Boolean(reference.id && reference.versionKey && reference.effectiveFrom))).toBe(true);
    expect(governance.businessContributionAreas.history.some(reference => reference.lifecycleState === 'Retired')).toBe(true);
  });
});
