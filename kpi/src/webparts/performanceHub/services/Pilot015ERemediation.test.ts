import {
  assertPilotIdentityUnchanged,
  KCF_KPI_015E_PILOT,
  validatePilot015EPlan
} from './Pilot015ERemediation';

describe('KCF-KPI-015E bounded remediation pilot', () => {
  it('contains exactly the approved representative maximum-12 set', () => {
    expect(KCF_KPI_015E_PILOT).toHaveLength(12);
    expect(KCF_KPI_015E_PILOT.map(record => record.kpiId)).toEqual([
      'SO1-001', 'SO1-016', 'SO2-026', 'SO1-002', 'SO2-027', 'SO3-042',
      'SO4-066', 'SO3-035', 'SO1-003', 'SO2-032', 'SO1-006', 'S07-105'
    ]);
    expect(validatePilot015EPlan(KCF_KPI_015E_PILOT)).toEqual([]);
  });

  it('applies changes to seven rows and leaves unresolved meaning untouched', () => {
    expect(KCF_KPI_015E_PILOT.filter(record => record.livePatch)).toHaveLength(7);
    expect(KCF_KPI_015E_PILOT.find(record => record.kpiId === 'SO2-026')?.livePatch).toBeUndefined();
    expect(KCF_KPI_015E_PILOT.find(record => record.kpiId === 'SO2-027')?.livePatch).toBeUndefined();
    expect(KCF_KPI_015E_PILOT.find(record => record.kpiId === 'SO3-042')?.livePatch).toBeUndefined();
    expect(KCF_KPI_015E_PILOT.find(record => record.kpiId === 'SO4-066')?.livePatch).toBeUndefined();
    expect(KCF_KPI_015E_PILOT.find(record => record.kpiId === 'SO1-006')?.livePatch).toBeUndefined();
  });

  it('rejects forbidden fields and detects protected identity drift', () => {
    const invalid = [{
      ...KCF_KPI_015E_PILOT[0],
      livePatch: { KPIWording: 'changed' }
    }] as never;
    expect(validatePilot015EPlan(invalid)).toContain('SO1-001 attempts the forbidden field KPIWording.');
    const snapshot = {
      kpiId: 'SO1-001', kpiVersionKey: 'SO1-001|v01', wording: 'Original', pillar: 'P1', workstream: 'W1',
      ownerSourceCode: 'PH', accountableOwnerEmail: 'owner@example.test', targetVersionKey: 'SO1-001|2026|v01'
    };
    expect(() => assertPilotIdentityUnchanged(snapshot, { ...snapshot, wording: 'Changed' })).toThrow('wording');
    expect(() => assertPilotIdentityUnchanged(snapshot, { ...snapshot })).not.toThrow();
  });
});
