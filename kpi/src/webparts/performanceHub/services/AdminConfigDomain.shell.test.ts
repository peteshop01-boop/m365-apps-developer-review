import {
  ADMIN_CONFIG_DEFINITIONS,
  ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY,
  ADMIN_OVERALL_DELIVERY_CONFIG_KEYS,
  buildAdminConfigMaintenancePlan,
  buildAdminTypedConfigShell,
  readAdminConfigTypedValue,
  writeAdminConfigTypedValue,
  type AdminConfigTypedValue,
  type IAdminConfigMaintenanceContext,
  type IAdminConfigStableIdentity,
  type IAdminConfigSourceRecord
} from './AdminConfigDomain';
import { CONFIG_KEYS } from './ProductionConfigMapper';

const valueFor = (key: string): string | number | boolean => {
  if (key === CONFIG_KEYS.performanceYear) return '2025/26';
  if (key === CONFIG_KEYS.performanceYearStart) return '2025-11-01T00:00:00.000Z';
  if (key === CONFIG_KEYS.performanceYearEnd) return '2026-10-31T00:00:00.000Z';
  if (key === CONFIG_KEYS.q1) return 'Nov-Jan';
  if (key === CONFIG_KEYS.q2) return 'Feb-Apr';
  if (key === CONFIG_KEYS.q3) return 'May-Jul';
  if (key === CONFIG_KEYS.q4) return 'Aug-Oct';
  if (key === CONFIG_KEYS.greenThreshold) return 85;
  if (key === CONFIG_KEYS.amberThreshold) return 45;
  if (key === ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY) return true;
  if (key === CONFIG_KEYS.coreWeight) return 70;
  if (key === CONFIG_KEYS.personalWeight) return 20;
  if (key === CONFIG_KEYS.behaviourWeight) return 10;
  if (key === CONFIG_KEYS.aggregationMethods) return JSON.stringify(['DirectMetric', 'Additive']);
  if (key === CONFIG_KEYS.retentionStatus) return 'CONTROL review pending';
  if (key === CONFIG_KEYS.quarterEarlyReviewReminderDays) return 30;
  if (key === CONFIG_KEYS.quarterPreparationReminderDays) return 14;
  if (key === CONFIG_KEYS.quarterFinalReminderDays) return 7;
  if (key === CONFIG_KEYS.employeeSubmissionDaysAfterQuarter) return 7;
  if (key === CONFIG_KEYS.managerReviewDaysAfterSubmissionDeadline) return 7;
  throw new Error(`Missing synthetic value for ${key}`);
};

const records = (): IAdminConfigSourceRecord[] => {
  const legacy = ADMIN_CONFIG_DEFINITIONS.map((definition, index) => {
    const value = valueFor(definition.key);
    return {
      id: index + 1,
      etag: `"${index + 1}"`,
      key: definition.key,
      valueType: definition.valueType,
      textValue: definition.valueType === 'Text' ? String(value) : undefined,
      numberValue: definition.valueType === 'Number' ? Number(value) : undefined,
      booleanValue: definition.valueType === 'Boolean' ? Boolean(value) : undefined,
      dateValue: definition.valueType === 'Date' ? String(value) : undefined,
      jsonValue: definition.valueType === 'JSON' ? String(value) : undefined,
      environment: 'Production',
      active: true,
      changeReference: `CFG-${index + 1}`,
      modifiedAt: '2026-08-20T09:00:00.000Z',
      modifiedBy: 'config.owner@example.invalid'
    } as IAdminConfigSourceRecord;
  });
  return legacy.concat([
    {
      id: legacy.length + 1, etag: '"overall-core-v1"',
      key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight, valueType: 'Number', numberValue: 70,
      environment: 'Production', active: true, changeReference: 'CFG-OVERALL-CORE',
      modifiedAt: '2026-09-20T08:00:00.000Z', modifiedBy: 'config.owner@example.invalid'
    },
    {
      id: legacy.length + 2, etag: '"overall-impact-v1"',
      key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight, valueType: 'Number', numberValue: 30,
      environment: 'Production', active: true, changeReference: 'CFG-OVERALL-IMPACT',
      modifiedAt: '2026-09-20T08:01:00.000Z', modifiedBy: 'config.owner@example.invalid'
    }
  ]);
};

const context = (patch: Partial<IAdminConfigMaintenanceContext> = {}): IAdminConfigMaintenanceContext => ({
  expectedEnvironment: 'Production',
  expectedPerformanceYear: 2026,
  actorEmail: 'admin@example.invalid',
  occurredAt: '2026-09-20T02:10:00.000Z',
  changeReference: 'KCF-KPI-PM21-A003',
  ...patch
});

const identityFor = (
  source: readonly IAdminConfigSourceRecord[],
  key: string
): Readonly<IAdminConfigStableIdentity> => (
  buildAdminTypedConfigShell(source, 'Production', 2026).records
    .filter(record => record.identity.key === key)[0].identity
);

describe('Admin Config decision-independent typed shell', () => {
  it('round-trips every supported physical value type without changing identity or provenance', () => {
    records().forEach(record => {
      const typed = readAdminConfigTypedValue(record);
      const written = writeAdminConfigTypedValue(record, typed);
      expect(readAdminConfigTypedValue(written)).toEqual(typed);
      expect(written).toEqual(record);
      expect(written).not.toBe(record);
    });
  });

  it('exposes exact environment, year, item, ETag, state and attributable provenance', () => {
    const shell = buildAdminTypedConfigShell(records(), 'Production', 2026);
    expect(shell).toEqual(expect.objectContaining({
      mode: 'DecisionIndependent',
      sourceList: 'KCFKPI_Config',
      environment: 'Production',
      performanceYear: 2026,
      scoringInterpretationApplied: false,
      tenantMutationExecuted: false
    }));
    expect(shell.records).toHaveLength(ADMIN_CONFIG_DEFINITIONS.length + 2);
    expect(shell.overallDelivery).toEqual(expect.objectContaining({
      environment: 'Production',
      performanceYear: 2026,
      weights: { core: 70, impact: 30, total: 100 },
      includedCategories: ['Core', 'Impact'],
      excludedCategories: ['Behaviours'],
      behavioursExcludedFromDeliveryArithmetic: true,
      poorCoreMaskingGuard: 'RequiredDownstreamGovernedRule',
      poorCoreThresholdConfiguredHere: false
    }));
    expect(shell.records[0]).toEqual(expect.objectContaining({
      identity: expect.objectContaining({ environment: 'Production', etag: expect.any(String), state: 'Active' }),
      provenance: expect.objectContaining({
        modifiedAt: '2026-08-20T09:00:00.000Z',
        modifiedBy: 'config.owner@example.invalid',
        changeReference: expect.stringMatching(/^CFG-/)
      })
    }));
    expect(Object.isFrozen(shell)).toBe(true);
    expect(Object.isFrozen(shell.records)).toBe(true);
    expect(Object.isFrozen(shell.records[0].identity)).toBe(true);
  });

  it('builds an attributable feature-flag candidate only from the exact active ETag identity', () => {
    const source = records();
    const expectedIdentity = identityFor(source, ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY);
    const plan = buildAdminConfigMaintenancePlan(source, context(), [{
      expectedIdentity,
      value: { valueType: 'Boolean', value: false }
    }]);

    expect(plan).toEqual(expect.objectContaining({
      mode: 'BrowserMemoryCandidate',
      environment: 'Production',
      expectedPerformanceYear: 2026,
      targetPerformanceYear: 2026,
      expectedEtags: [expectedIdentity.etag],
      attribution: {
        actorEmail: 'admin@example.invalid',
        occurredAt: '2026-09-20T02:10:00.000Z',
        changeReference: 'KCF-KPI-PM21-A003'
      },
      scoringInterpretationApplied: false,
      tenantMutationExecuted: false
    }));
    expect(source.filter(record => record.key === ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY)[0].booleanValue).toBe(true);
    expect(plan.candidate.filter(record => record.key === ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY)[0])
      .toEqual(expect.objectContaining({
        booleanValue: false,
        modifiedBy: 'admin@example.invalid',
        changeReference: 'KCF-KPI-PM21-A003'
      }));
    expect(Object.isFrozen(plan.candidate)).toBe(true);
  });

  it('stages the performance-year label/start/end atomically against old identities and exact target year', () => {
    const source = records();
    const requests: Array<{ key: string; value: AdminConfigTypedValue }> = [
      { key: CONFIG_KEYS.performanceYear, value: { valueType: 'Text', value: '2026/27' } },
      { key: CONFIG_KEYS.performanceYearStart, value: { valueType: 'Date', value: '2026-11-01T00:00:00.000Z' } },
      { key: CONFIG_KEYS.performanceYearEnd, value: { valueType: 'Date', value: '2027-10-31T00:00:00.000Z' } }
    ];
    const plan = buildAdminConfigMaintenancePlan(source, context({ targetPerformanceYear: 2027 }), requests.map(request => ({
      expectedIdentity: identityFor(source, request.key),
      value: request.value
    })));

    expect(plan.targetPerformanceYear).toBe(2027);
    expect(buildAdminTypedConfigShell(plan.candidate, 'Production', 2027).performanceYear).toBe(2027);
  });

  it('fails closed on identity/version/state, environment and performance-year drift', () => {
    const source = records();
    const flagIdentity = identityFor(source, ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY);
    expect(() => buildAdminConfigMaintenancePlan(source, context(), [{
      expectedIdentity: { ...flagIdentity, etag: '"stale"' },
      value: { valueType: 'Boolean', value: false }
    }])).toThrow(/changed after it was loaded/);
    expect(() => buildAdminConfigMaintenancePlan(source, context(), [{
      expectedIdentity: { ...flagIdentity, state: 'Inactive' },
      value: { valueType: 'Boolean', value: false }
    }])).toThrow(/changed after it was loaded/);

    const wrongEnvironment = source.map((record, index) => index === 0 ? { ...record, environment: 'TEST' } : record);
    expect(() => buildAdminTypedConfigShell(wrongEnvironment, 'Production', 2026)).toThrow(/Environment mismatch/);
    expect(() => buildAdminTypedConfigShell(source, 'Production', 2025)).toThrow(/PerformanceYear mismatch/);
  });

  it('rejects invalid deadline and feature-flag types before producing a candidate', () => {
    const source = records();
    const deadline = source.filter(record => record.key === CONFIG_KEYS.employeeSubmissionDaysAfterQuarter)[0];
    const flag = source.filter(record => record.key === ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY)[0];
    expect(() => buildAdminTypedConfigShell(source.map(record => record === deadline
      ? { ...record, numberValue: 0 } : record), 'Production', 2026)).toThrow(/positive whole number/);
    expect(() => buildAdminConfigMaintenancePlan(source, context(), [{
      expectedIdentity: identityFor(source, flag.key),
      value: { valueType: 'Text', value: 'false' }
    }])).toThrow(/does not match Boolean/);
  });

  it('rejects governed weighting sets that do not total exactly 100', () => {
    const source = records().map(record => record.key === CONFIG_KEYS.coreWeight
      ? { ...record, numberValue: 75 } : record);
    expect(() => buildAdminTypedConfigShell(source, 'Production', 2026)).toThrow(/total exactly 100%/);
  });

  it('accepts bounded ordered thresholds without applying fixed scoring interpretation', () => {
    const source = records().map(record => record.key === CONFIG_KEYS.greenThreshold
      ? { ...record, numberValue: 82 }
      : record.key === CONFIG_KEYS.amberThreshold ? { ...record, numberValue: 41 } : record);
    const shell = buildAdminTypedConfigShell(source, 'Production', 2026);
    expect(shell.scoringInterpretationApplied).toBe(false);
    expect(shell.records.filter(record => record.identity.key === CONFIG_KEYS.greenThreshold)[0].value)
      .toEqual({ valueType: 'Number', value: 82 });
    expect(shell.records.filter(record => record.identity.key === CONFIG_KEYS.amberThreshold)[0].value)
      .toEqual({ valueType: 'Number', value: 41 });

    const inverted = source.map(record => record.key === CONFIG_KEYS.amberThreshold
      ? { ...record, numberValue: 82 } : record);
    expect(() => buildAdminTypedConfigShell(inverted, 'Production', 2026)).toThrow(/lower than Green/);
  });

  it('requires complete existing SharePoint update and ChangeReference provenance', () => {
    const source = records();
    source[0] = { ...source[0], changeReference: undefined };
    expect(() => buildAdminTypedConfigShell(source, 'Production', 2026)).toThrow(/requires attributable/);
    expect(() => buildAdminConfigMaintenancePlan(records(), context({ actorEmail: ' ' }), [{
      expectedIdentity: identityFor(records(), ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY),
      value: { valueType: 'Boolean', value: false }
    }])).toThrow(/requires attributable actor/);
  });
});
