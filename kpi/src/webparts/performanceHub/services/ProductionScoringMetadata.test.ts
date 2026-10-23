import {
  parseProductionScoringMetadata,
  PRODUCTION_SCORING_METADATA_SCHEMA,
  serialiseProductionScoringMetadata
} from './ProductionScoringMetadata';

describe('production scoring metadata', () => {
  it('fails closed for blank, malformed and wrong-schema metadata', () => {
    expect(parseProductionScoringMetadata(undefined, 'KPI-1', 'KPI-1|v01')).toEqual({ issues: [] });
    expect(parseProductionScoringMetadata('{bad', 'KPI-1', 'KPI-1|v01').issues).toEqual(['SCORING_METADATA_INVALID_JSON']);
    expect(parseProductionScoringMetadata('{"schemaVersion":"other"}', 'KPI-1', 'KPI-1|v01').issues).toEqual(['SCORING_METADATA_INVALID_SCHEMA']);
  });

  it('resolves only approved and auditable exact-version policy helpers', () => {
    const result = parseProductionScoringMetadata(serialiseProductionScoringMetadata({
      schemaVersion: PRODUCTION_SCORING_METADATA_SCHEMA,
      status: 'Approved',
      approvalReference: 'CONTROL-001',
      source: 'GOLD row 1',
      percentageSourceScale: 'Fraction',
      baselineValue: 10,
      greenThreshold: 92,
      amberThreshold: 55,
      scoreMinimum: 0,
      scoreMaximum: 10,
      targetScore: 9.5,
      scoreDirection: 'HigherIsBetter',
      rangeMinimum: 9.4,
      rangeMaximum: 9.6,
      amberToleranceBelow: 0.2,
      amberToleranceAbove: 0.2,
      milestoneVersion: 'v02'
    }), 'KPI-1', 'KPI-1|v01');
    expect(result.issues).toEqual([]);
    expect(result.kpiThresholdOverride).toMatchObject({ kpiId: 'KPI-1', kpiVersionKey: 'KPI-1|v01', greenThreshold: 92, amberThreshold: 55 });
    expect(result.approvedScorePolicy?.targetScore).toBe(9.5);
    expect(result.approvedTargetRangePolicy?.amberToleranceBelow).toBe(0.2);
    expect(result.percentageSourceScale).toBe('Fraction');
    expect(result.milestoneVersion).toBe('v02');
  });

  it('preserves incomplete source evidence without making it authoritative', () => {
    const result = parseProductionScoringMetadata(JSON.stringify({
      schemaVersion: PRODUCTION_SCORING_METADATA_SCHEMA,
      status: 'Incomplete',
      source: 'GOLD B4:AE4',
      percentageSourceScale: 'Fraction',
      baselineValue: 12,
      milestoneVersion: 'map-draft',
      scoreMaximum: 10,
      targetScore: 9.5
    }), 'SO1-002', 'SO1-002|v01');
    expect(result.approvedScorePolicy).toBeUndefined();
    expect(result.issues).toEqual(['SCORE_POLICY_INCOMPLETE', 'SCORING_METADATA_INCOMPLETE']);
    expect(result.percentageSourceScale).toBeUndefined();
    expect(result.baselineValue).toBeUndefined();
    expect(result.milestoneVersion).toBeUndefined();
    expect(result.metadata?.percentageSourceScale).toBe('Fraction');
    expect(result.metadata?.baselineValue).toBe(12);
    expect(result.metadata?.milestoneVersion).toBe('map-draft');
    expect(result.metadata?.scoreMaximum).toBe(10);
  });

  it('does not expose scale or baseline as authoritative when Approved status lacks its audit reference', () => {
    const result = parseProductionScoringMetadata(JSON.stringify({
      schemaVersion: PRODUCTION_SCORING_METADATA_SCHEMA,
      status: 'Approved',
      source: 'Controlled test source',
      percentageSourceScale: 'Whole',
      baselineValue: 20
    }), 'TEST-LOWER', 'TEST-LOWER|v01');
    expect(result.issues).toEqual(['SCORING_METADATA_APPROVAL_REFERENCE_MISSING']);
    expect(result.percentageSourceScale).toBeUndefined();
    expect(result.baselineValue).toBeUndefined();
    expect(result.metadata).toEqual(expect.objectContaining({ percentageSourceScale: 'Whole', baselineValue: 20 }));
  });

  it('parses an approved TargetRange Score direction with its complete controlled metadata', () => {
    const result = parseProductionScoringMetadata(JSON.stringify({
      schemaVersion: PRODUCTION_SCORING_METADATA_SCHEMA,
      status: 'Approved',
      approvalReference: 'CONTROL-SCORE-RANGE-001',
      source: 'Controlled Score range semantics',
      scoreMinimum: 0,
      scoreMaximum: 10,
      targetScore: 9.5,
      scoreDirection: 'TargetRange',
      rangeMinimum: 9.4,
      rangeMaximum: 9.6,
      amberToleranceBelow: 0.2,
      amberToleranceAbove: 0.1
    }), 'SCORE-RANGE', 'SCORE-RANGE|v01');
    expect(result.issues).toEqual([]);
    expect(result.approvedScorePolicy).toEqual(expect.objectContaining({
      targetScore: 9.5,
      scoringDirection: 'TargetRange'
    }));
    expect(result.approvedTargetRangePolicy).toEqual(expect.objectContaining({
      rangeMinimum: 9.4,
      rangeMaximum: 9.6,
      amberToleranceBelow: 0.2,
      amberToleranceAbove: 0.1
    }));
  });
});
