import { buildMasterDataWarnings, findReadBackMismatches } from './MasterDataValidationService';
import { evaluateReadiness } from './ReadinessService';
import type { IProductionConfig, IProductionPerson } from '../models/ProductionModels';

const employee: IProductionPerson = {
  id: 1,
  personKey: 'employee-key',
  displayName: 'Synthetic Person 02',
  email: 'person003@example.invalid',
  managerPersonKey: 'manager-key',
  managerEmail: 'person002@example.invalid',
  appRoles: ['Employee'],
  active: true
};

const config: IProductionConfig = {
  performanceYear: '2025/26',
  performanceYearStart: '2025-11-01T00:00:00Z',
  performanceYearEnd: '2026-10-31T00:00:00Z',
  performanceYearNumber: 2026,
  quarters: { q1: 'Nov-Jan', q2: 'Feb-Apr', q3: 'May-Jul', q4: 'Aug-Oct' },
  weights: { core: 70, personal: 20, behaviours: 10 },
  rag: { greenThreshold: 90, amberThreshold: 50 },
  aggregationMethods: ['DirectMetric'],
  retentionStatus: 'TBC'
};

describe('KPI master-data validation', () => {
  it('classifies the R4 unresolved GOLD conditions as warnings, not Workplan blockers', () => {
    const warnings = buildMasterDataWarnings({
      unknownOwnerCodes: 1,
      tbcScoringDirections: 68,
      unresolvedUnitLabels: 85,
      missingQ1Targets: 7,
      missingQ2Targets: 5,
      organisationalWeightingAssigned: false
    });
    const readiness = evaluateReadiness({
      employee,
      manager: { ...employee, id: 2, personKey: 'manager-key', displayName: 'Synthetic Person 01',
        email: employee.managerEmail || '', managerPersonKey: undefined, managerEmail: undefined, appRoles: ['Manager'] },
      config,
      counts: { activeKpis: 109, approvedAnnualTargets: 109, publishedBehaviours: 5 },
      dataQualityWarnings: warnings
    });

    expect(warnings).toContain('1 KPI owner code requires CONTROL resolution.');
    expect(warnings).toContain('68 KPI scoring directions remain TBC.');
    expect(readiness.ready).toBe(true);
    expect(readiness.blockers).toEqual([]);
    expect(readiness.warnings).toEqual(warnings);
  });

  it('accepts an exact owner/read-back mapping and identifies a changed field', () => {
    const expected = [{ key: 'SO4-066', values: {
      OwnerSourceCode: 'JH', AccountableOwnerPersonKey: null, AccountableOwnerEmail: null,
      DataQualityFlags: 'Classification review required; Unknown owner code — CONTROL review'
    } }];

    expect(findReadBackMismatches(expected, expected)).toEqual([]);
    expect(findReadBackMismatches(expected, [{
      key: 'SO4-066', values: { ...expected[0].values, AccountableOwnerEmail: 'synthetic.user@example.invalid' }
    }])).toEqual(['SO4-066.AccountableOwnerEmail: value mismatch']);
  });
});
