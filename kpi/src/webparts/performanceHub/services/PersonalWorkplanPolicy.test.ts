import type { IPersonalWorkplanItem } from '../models/ProductionModels';
import type { QuarterKey } from '../models/QuarterlyModels';
import {
  calculatePersonalQuarterResult,
  entersOrganisationalGoldOutput,
  personalQuarterTarget,
  prepareImpactSectionSave,
  resolveGovernedImpactTaxonomy,
  selectGovernedImpactClassification,
  validateImpactSection,
  validatePersonalKpiDefinition,
  type IImpactClassificationConfiguration,
  type IGovernedImpactTaxonomyContract
} from './PersonalWorkplanPolicy';

const classification: IImpactClassificationConfiguration = {
  strategicPillars: [{ key: 'pillar-synthetic', label: 'Synthetic pillar', source: 'TEST-GOVERNED', sourceReference: 'pillar-v1' }],
  businessContributionAreas: [{ key: 'area-synthetic', label: 'Synthetic area', source: 'TEST-GOVERNED', sourceReference: 'area-v1' }]
};

const approvedBusinessContributionAreas = [
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
] as const;

const governedTaxonomy = (): IGovernedImpactTaxonomyContract => ({
  schema: 'KCF.ImpactTaxonomy', immutable: true, published: true,
  authority: {
    taxonomyId: 'KCF-IMPACT-TAXONOMY', version: 'PD02-V1', etag: '"taxonomy-v1"',
    approvalReference: 'KCF-KPI-Sponsor-PD-02', contentSha256: 'B'.repeat(64),
    effectiveFrom: '2026-09-21', publishedAt: '2026-09-21T09:00:00.000Z',
    publishedBy: 'sponsor@example.invalid', changeReference: 'KCF-KPI-Sponsor-PD-02'
  },
  strategicPillars: [{
    key: 'pillar-synthetic', label: 'Synthetic strategic pillar', source: 'PD02-GOVERNED',
    sourceReference: 'pillar-v1', active: true, approved: true, effectiveFrom: '2026-09-21'
  }],
  businessContributionAreas: approvedBusinessContributionAreas.map((label, index) => ({
    key: `BCA-${String(index + 1).padStart(2, '0')}`, label, source: 'PD02-GOVERNED',
    sourceReference: 'bca-v1', active: true, approved: true, effectiveFrom: '2026-09-21'
  }))
});

const personal = (patch: Partial<IPersonalWorkplanItem> = {}): IPersonalWorkplanItem => ({
  id: -1,
  etag: 'LOCAL',
  workplanItemKey: 'personal-1',
  naturalKey: 'workplan|LocalPersonal|personal-1',
  workplanKey: 'workplan',
  personKey: 'person',
  performanceYear: 2026,
  wording: 'Deliver a controlled Personal objective',
  description: 'Role-specific outcome for the performance year.',
  measure: 'Completed deliverables',
  measureType: 'Count',
  scoringDirection: 'HigherIsBetter',
  yearEndTargetValue: 8,
  q1TargetValue: 2,
  q2TargetValue: 4,
  q3TargetValue: 6,
  q4TargetValue: 8,
  unitLabel: 'deliverables',
  personalItemWeight: 100,
  displayOrder: 1,
  activeInWorkplan: true,
  ...patch
});

describe('Personal Workplan policy', () => {
  describe.each(['target', 'score'] as const)('%s period admission', operation => {
    it.each([undefined, null, '', 'Q5', 'q4'])('rejects unsupported runtime quarter %s instead of selecting Q4', value => {
      const quarter = value as QuarterKey;
      expect(() => operation === 'target' ? personalQuarterTarget(personal(), quarter)
        : calculatePersonalQuarterResult(personal(), quarter, 8, undefined, { greenThreshold: 90, amberThreshold: 50 })).toThrow(/quarter/);
    });
  });
  it.each(['Q1', 'Q2', 'Q3', 'Q4'] as const)('retains typed zero and explicit empty text for %s', quarter => {
    const item = personal(); const prefix = quarter.toLowerCase();
    Object.assign(item, { [`${prefix}TargetValue`]: 0, [`${prefix}TargetText`]: '' });
    expect(personalQuarterTarget(item, quarter)).toEqual({ value: 0, text: '' });
  });
  it('requires the full annual and Q1-Q4 definition', () => {
    expect(validatePersonalKpiDefinition(personal()).valid).toBe(true);
    const invalid = validatePersonalKpiDefinition(personal({ description: '', q3TargetValue: undefined }));
    expect(invalid.errors).toEqual(expect.arrayContaining(['Description / objective is required.', 'Q3 Target is required.']));
  });

  it('requires a baseline for Lower Is Better and a scale for Percentage', () => {
    expect(validatePersonalKpiDefinition(personal({ scoringDirection: 'LowerIsBetter' })).errors.join(' ')).toMatch(/Baseline/);
    expect(validatePersonalKpiDefinition(personal({ measureType: 'Percentage' })).errors.join(' ')).toMatch(/Fraction or Whole/);
  });

  it('scores a Personal quarter without entering organisational GOLD', () => {
    const result = calculatePersonalQuarterResult(personal(), 'Q2', 3, undefined, { greenThreshold: 90, amberThreshold: 50 });
    expect(result).toMatchObject({ rateable: true, rawProgressPct: 75, calculatedRag: 'Amber' });
    expect(entersOrganisationalGoldOutput('CoreGold')).toBe(true);
    expect(entersOrganisationalGoldOutput('LocalPersonal')).toBe(false);
    expect(entersOrganisationalGoldOutput('Behaviour')).toBe(false);
  });

  it('enforces five active Impact items and exact 100% only when the optional section is used', () => {
    expect(validateImpactSection([])).toMatchObject({ valid: true, activeCount: 0, weightTotal: 0 });
    const five = Array.from({ length: 5 }, (_unused, index) => personal({
      id: index + 1,
      workplanItemKey: `impact-${index + 1}`,
      naturalKey: `workplan|LocalPersonal|impact-${index + 1}`,
      personalItemWeight: 20,
      displayOrder: index + 1
    }));
    expect(validateImpactSection(five)).toMatchObject({ valid: true, activeCount: 5, weightTotal: 100 });
    expect(validateImpactSection([...five, personal({
      workplanItemKey: 'impact-inactive', naturalKey: 'workplan|LocalPersonal|impact-inactive', activeInWorkplan: false
    })])).toMatchObject({ valid: true, activeCount: 5, weightTotal: 100 });
    expect(validateImpactSection([...five, personal({ workplanItemKey: 'impact-6', naturalKey: 'workplan|LocalPersonal|impact-6' })]).errors.join(' ')).toMatch(/maximum of 5/);
    expect(validateImpactSection(five.map((item, index) => ({ ...item, personalItemWeight: index === 0 ? 19 : 20 }))).errors.join(' ')).toMatch(/exactly 100%/);
    expect(validateImpactSection(five.map((item, index) => ({ ...item, personalItemWeight: index === 0 ? 21 : 20 }))).errors.join(' ')).toMatch(/exactly 100%/);
  });

  it('accepts only exact governed classification snapshots and preserves their provenance immutably', () => {
    const withArea = selectGovernedImpactClassification(undefined, 'businessContributionArea', 'area-synthetic', classification);
    const complete = selectGovernedImpactClassification(withArea, 'strategicPillar', 'pillar-synthetic', classification);
    const item = Object.freeze(personal({ impactClassification: Object.freeze({
      strategicPillar: Object.freeze(complete.strategicPillar as NonNullable<typeof complete.strategicPillar>),
      businessContributionArea: Object.freeze(complete.businessContributionArea as NonNullable<typeof complete.businessContributionArea>)
    }) }));
    expect(validateImpactSection([item], classification).valid).toBe(true);
    const saved = prepareImpactSectionSave([item], classification);
    expect(saved).toEqual([item]);
    expect(saved[0]).not.toBe(item);
    expect(saved[0].impactClassification).not.toBe(item.impactClassification);
    expect(() => selectGovernedImpactClassification(undefined, 'businessContributionArea', 'invented', classification)).toThrow(/governed/);
    expect(validateImpactSection([{ ...item, impactClassification: {
      ...item.impactClassification,
      businessContributionArea: { key: 'area-synthetic', label: 'Invented label', source: 'TEST-GOVERNED', sourceReference: 'area-v1' }
    } }], classification).errors.join(' ')).toMatch(/governed Business Contribution Area/);
    expect(validateImpactSection([item], {
      ...classification,
      businessContributionAreas: [classification.businessContributionAreas[0], classification.businessContributionAreas[0]]
    }).errors.join(' ')).toMatch(/configuration is invalid/);
  });

  it('resolves the exact 13-value PD-02 taxonomy and preserves key, label and version through save/readback', () => {
    const source = governedTaxonomy();
    const configured = resolveGovernedImpactTaxonomy(
      source, source.authority, new Date('2026-09-22T12:00:00.000Z')
    );
    expect(configured.businessContributionAreas.map(option => option.label))
      .toEqual(approvedBusinessContributionAreas);
    const withArea = selectGovernedImpactClassification(
      undefined, 'businessContributionArea', 'BCA-01', configured
    );
    const complete = selectGovernedImpactClassification(
      withArea, 'strategicPillar', 'pillar-synthetic', configured
    );
    const item = personal({ impactClassification: complete });
    const saved = prepareImpactSectionSave([item], configured);
    expect(saved[0].impactClassification?.businessContributionArea).toEqual(expect.objectContaining({
      key: 'BCA-01', label: 'Programme Delivery & Service Quality', taxonomyId: 'KCF-IMPACT-TAXONOMY',
      taxonomyVersion: 'PD02-V1', taxonomyEtag: '"taxonomy-v1"',
      taxonomyApprovalReference: 'KCF-KPI-Sponsor-PD-02'
    }));
    expect(Object.isFrozen(configured)).toBe(true);
    expect(Object.isFrozen(saved[0].impactClassification)).toBe(true);
  });

  it('fails closed on invented, duplicate, stale, retired and mismatched governed taxonomy data', () => {
    const source = governedTaxonomy();
    const asOf = new Date('2026-09-22T12:00:00.000Z');
    expect(() => resolveGovernedImpactTaxonomy({
      ...source, businessContributionAreas: source.businessContributionAreas.slice(0, 12)
    }, source.authority, asOf)).toThrow(/exactly 13/);
    expect(() => resolveGovernedImpactTaxonomy({
      ...source,
      businessContributionAreas: source.businessContributionAreas.map((option, index) =>
        index === 12 ? { ...option, key: source.businessContributionAreas[0].key } : option)
    }, source.authority, asOf)).toThrow(/duplicate/);
    expect(() => resolveGovernedImpactTaxonomy(source, {
      ...source.authority, etag: '"stale"'
    }, asOf)).toThrow(/changed after it was loaded/);
    expect(() => resolveGovernedImpactTaxonomy({
      ...source,
      businessContributionAreas: source.businessContributionAreas.map((option, index) =>
        index === 0 ? { ...option, active: false } : option)
    }, source.authority, asOf)).toThrow(/retired/);
    const configured = resolveGovernedImpactTaxonomy(source, source.authority, asOf);
    const selected = selectGovernedImpactClassification(undefined, 'businessContributionArea', 'BCA-01', configured);
    expect(validateImpactSection([personal({ impactClassification: {
      businessContributionArea: { ...selected.businessContributionArea!, taxonomyVersion: 'STALE' }
    } })], configured).errors.join(' ')).toMatch(/governed Business Contribution Area/);
    expect(() => selectGovernedImpactClassification(undefined, 'businessContributionArea', 'invented', configured))
      .toThrow(/governed/);
  });
});
