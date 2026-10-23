import {
  ORGANISATIONAL_WEIGHTS_INITIAL_ROWS,
  PRODUCTION_POLICY_LISTS,
  organisationalWeightGroupKey,
  organisationalWeightRecordKey,
  productionPolicyFieldSchemaXml,
  validateMilestoneStageRecords,
  validateOrganisationalWeightRecords,
  validateProductionPolicySchemaReadback,
  type IOrganisationalWeightRecord
} from './ProductionPolicyStructures';
import type { IMilestoneStageRecord } from './ScoringPolicy';

describe('production policy structures', () => {
  it('defines exact production Milestone and organisational-weight lists without default data', () => {
    expect(PRODUCTION_POLICY_LISTS.map(list => list.title)).toEqual([
      'KCFKPI_MilestoneStages',
      'KCFKPI_OrganisationalWeights'
    ]);
    const milestone = PRODUCTION_POLICY_LISTS[0];
    expect(milestone.fields.map(field => field.internalName)).toEqual(expect.arrayContaining([
      'PerformanceYear', 'KPIID', 'StageKey', 'StageName', 'SortOrder', 'CompletionPercent', 'Active',
      'ApprovalStatus', 'EffectiveFrom', 'EffectiveTo', 'Version', 'Source', 'ApprovalReference'
    ]));
    const weights = PRODUCTION_POLICY_LISTS[1];
    expect(weights.fields.find(field => field.internalName === 'WeightLevel')?.choices).toEqual([
      'KPIWithinWorkstream', 'WorkstreamWithinPillar', 'PillarWithinBoard'
    ]);
    expect(ORGANISATIONAL_WEIGHTS_INITIAL_ROWS).toEqual([]);
  });

  it('emits fixed SharePoint XML with unique natural-key protection', () => {
    const key = PRODUCTION_POLICY_LISTS[0].fields[0];
    const xml = productionPolicyFieldSchemaXml(key);
    expect(xml).toContain('Name="MilestoneStageKey"');
    expect(xml).toContain('Indexed="TRUE"');
    expect(xml).toContain('EnforceUniqueValues="TRUE"');
  });

  it('validates exact field read-back and reports drift', () => {
    const definition = PRODUCTION_POLICY_LISTS[0];
    const good = definition.fields.map(field => ({
      internalName: field.internalName,
      type: field.type === 'DateOnly' ? 'DateTime' : field.type,
      required: field.required,
      indexed: field.indexed,
      enforceUniqueValues: Boolean(field.enforceUniqueValues),
      choices: field.choices ?? []
    }));
    expect(validateProductionPolicySchemaReadback(definition, good)).toEqual({ missingFields: [], mismatches: [] });
    const drift = good.filter(field => field.internalName !== 'Source');
    drift[0] = { ...drift[0], indexed: false };
    const result = validateProductionPolicySchemaReadback(definition, drift);
    expect(result.missingFields).toEqual(['Source']);
    expect(result.mismatches).toContain('MilestoneStageKey: Indexed false, expected true.');
  });

  it('accepts only explicit ordered Milestone stages ending at 100%', () => {
    const base: Omit<IMilestoneStageRecord, 'stageKey' | 'stageName' | 'sortOrder' | 'completionPercent'> = {
      performanceYear: '2025/26', kpiId: 'TEST-001', kpiVersionKey: 'TEST-001|v01', active: true,
      approvalStatus: 'Approved', effectiveFrom: '2026-04-01', version: 'v01', source: 'CONTROL test',
      approvalReference: 'KCF-KPI-015E'
    };
    const valid: IMilestoneStageRecord[] = [
      { ...base, stageKey: 'START', stageName: 'Started', sortOrder: 1, completionPercent: 0 },
      { ...base, stageKey: 'DONE', stageName: 'Complete', sortOrder: 2, completionPercent: 100 }
    ];
    expect(validateMilestoneStageRecords(valid)).toEqual({ valid: true, errors: [] });
    expect(validateMilestoneStageRecords([{ ...valid[0], completionPercent: 50 }, { ...valid[1], completionPercent: 90 }]).valid).toBe(false);
    expect(validateMilestoneStageRecords([
      { ...valid[0], completionPercent: 50 },
      { ...valid[1], completionPercent: 50 },
      { ...valid[1], stageKey: 'DONE-2', stageName: 'Complete two', sortOrder: 3, completionPercent: 100 }
    ]).valid).toBe(true);
    expect(validateMilestoneStageRecords([valid[0], { ...valid[1], sortOrder: 1 }]).valid).toBe(false);
  });

  it('keeps blank organisational weights unpublished and validates approved groups at 100%', () => {
    const base = {
      performanceYear: 2026, weightLevel: 'KPIWithinWorkstream' as const, parentKey: 'WS-01', active: true,
      approvalStatus: 'Approved' as const, effectiveFrom: '2026-04-01', version: 'v01',
      approvalReference: 'CONTROL-001', source: 'CONTROL', historicSnapshotLocked: false
    };
    const weight = (
      childKey: string,
      weightPercent?: number,
      publishedSnapshotKey?: string
    ): IOrganisationalWeightRecord => ({
      ...base,
      childKey,
      weightPercent,
      publishedSnapshotKey,
      weightGroupKey: organisationalWeightGroupKey(base),
      organisationalWeightKey: organisationalWeightRecordKey({ ...base, childKey })
    });
    expect(validateOrganisationalWeightRecords([]).valid).toBe(false);
    expect(validateOrganisationalWeightRecords([
      weight('KPI-1'),
      weight('KPI-2', 100)
    ]).valid).toBe(false);
    expect(validateOrganisationalWeightRecords([
      weight('KPI-1', 40),
      weight('KPI-2', 60)
    ])).toEqual({ valid: true, errors: [] });
    expect(validateOrganisationalWeightRecords([
      weight('KPI-1', 100, 'PUB-1')
    ]).valid).toBe(false);
  });
});
