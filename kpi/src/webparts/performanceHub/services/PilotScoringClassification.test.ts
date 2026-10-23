import {
  PILOT_SCORING_CLASSIFICATIONS,
  resolvePilotScoringClassification,
  type PilotScoringKpiId
} from './PilotScoringClassification';

describe('PilotScoringClassification', () => {
  it('records the four controlled pilot cases with source, rationale and explicit status', () => {
    expect(Object.keys(PILOT_SCORING_CLASSIFICATIONS).sort()).toEqual(['SO1-001', 'SO1-002', 'SO1-016', 'SO2-026']);
    Object.keys(PILOT_SCORING_CLASSIFICATIONS).forEach(key => {
      const pilot = PILOT_SCORING_CLASSIFICATIONS[key as PilotScoringKpiId];
      expect(pilot.source.authority).toBe('KPI GOLD Performance V6');
      expect(pilot.source.wording).toBeTruthy();
      expect(pilot.rationale).toBeTruthy();
      expect(['PilotApproved', 'RequiresControlDecision']).toContain(pilot.status);
    });
  });

  it('overlays only the approved SO1-001 fields and preserves every source value', () => {
    const nestedSource = { q4TargetValue: 200, statusUpdate: 'Retain this value.' };
    const source = {
      kpiId: 'SO1-001',
      kpiVersionKey: 'SO1-001|v01',
      aggregationMethod: 'DirectMetric',
      scoringDirection: 'TBC',
      metricType: 'Number',
      unitLabel: 'TBC',
      wording: '200 Primary School Programmes delivered annually.',
      q4TargetValue: 200,
      nestedSource
    };

    const resolved = resolvePilotScoringClassification(source);

    expect(resolved).not.toBe(source);
    expect(resolved).toEqual({
      ...source,
      aggregationMethod: 'DirectMetric',
      scoringDirection: 'HigherIsBetter',
      metricType: 'Count',
      unitLabel: 'programmes'
    });
    expect(resolved.nestedSource).toBe(nestedSource);
    expect(source).toEqual(expect.objectContaining({ scoringDirection: 'TBC', metricType: 'Number', unitLabel: 'TBC' }));
  });

  it('keeps the approved percentage source scale and milestone source forms unchanged', () => {
    expect(PILOT_SCORING_CLASSIFICATIONS['SO1-016']).toEqual(expect.objectContaining({
      status: 'PilotApproved',
      classification: expect.objectContaining({
        metricType: 'Percentage', scoringDirection: 'HigherIsBetter', unitLabel: '%', percentageSourceScale: 'Fraction'
      })
    }));
    expect(PILOT_SCORING_CLASSIFICATIONS['SO1-016'].source.targets.q4.value).toBe(0.28);
    expect(PILOT_SCORING_CLASSIFICATIONS['SO2-026'].source.targets).toEqual(expect.objectContaining({
      yearEnd: expect.objectContaining({ kind: 'text', value: 'November 2026 Revision' }),
      q2: expect.objectContaining({ kind: 'number', value: 0.25, numberFormat: '0%' })
    }));
  });

  it('propagates the accepted SO1-016 fractional scale only for the exact approved version', () => {
    const accepted = resolvePilotScoringClassification({
      kpiId: 'SO1-016', kpiVersionKey: 'SO1-016|v01', aggregationMethod: 'DirectMetric',
      scoringDirection: 'HigherIsBetter', metricType: 'Percentage', unitLabel: '%'
    });
    const otherVersion = resolvePilotScoringClassification({
      kpiId: 'SO1-016', kpiVersionKey: 'SO1-016|v02', aggregationMethod: 'DirectMetric',
      scoringDirection: 'HigherIsBetter', metricType: 'Percentage', unitLabel: '%'
    });
    expect(accepted.percentageSourceScale).toBe('Fraction');
    expect(otherVersion.percentageSourceScale).toBeUndefined();
  });

  it('does not overlay an unresolved TBC classification', () => {
    const source = {
      kpiId: 'SO1-002',
      kpiVersionKey: 'SO1-002|v01',
      aggregationMethod: 'DirectMetric',
      scoringDirection: 'TBC',
      metricType: 'Number',
      unitLabel: 'TBC',
      yearEndTargetValue: 9.5
    };

    const resolved = resolvePilotScoringClassification(source);

    expect(PILOT_SCORING_CLASSIFICATIONS['SO1-002'].status).toBe('RequiresControlDecision');
    expect(resolved).toBe(source);
    expect(resolved).toEqual(source);
  });

  it('does not alter records outside the explicit pilot map', () => {
    const source = {
      kpiId: 'SO9-999',
      kpiVersionKey: 'SO9-999|v01',
      aggregationMethod: 'Additive',
      scoringDirection: 'LowerIsBetter',
      metricType: 'Days',
      unitLabel: 'days',
      target: 10
    };

    expect(resolvePilotScoringClassification(source)).toBe(source);
  });

  it('does not apply a pilot classification to a different KPI definition version', () => {
    const source = {
      kpiId: 'SO1-001',
      kpiVersionKey: 'SO1-001|v02',
      aggregationMethod: 'Composite',
      scoringDirection: 'TBC',
      metricType: 'Other',
      unitLabel: 'TBC'
    };

    expect(resolvePilotScoringClassification(source)).toBe(source);
  });
});
