import {
  ADMIN_CONFIG_DEFINITIONS,
  ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY,
  ADMIN_OVERALL_DELIVERY_CONFIG_KEYS,
  ADMIN_OVERALL_DELIVERY_DEFAULT_WEIGHTS,
  buildAdminConfigMaintenancePlan,
  buildAdminConfigView,
  buildAdminOverallDeliveryConfigurationContract,
  readOverallDeliveryWeightConfiguration,
  buildAdminTypedConfigShell,
  validateAdminConfigSet,
  type IAdminConfigMaintenanceContext,
  type IAdminConfigSourceRecord,
  type IAdminOverallDeliveryAuthorityExpectation
} from './AdminConfigDomain';
import { CONFIG_KEYS } from './ProductionConfigMapper';

const legacyValue = (key: string): string | number | boolean => {
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

const legacyRecords = (): IAdminConfigSourceRecord[] => ADMIN_CONFIG_DEFINITIONS.map((definition, index) => {
  const value = legacyValue(definition.key);
  return {
    id: index + 1,
    etag: `"legacy-${index + 1}"`,
    key: definition.key,
    valueType: definition.valueType,
    textValue: definition.valueType === 'Text' ? String(value) : undefined,
    numberValue: definition.valueType === 'Number' ? Number(value) : undefined,
    booleanValue: definition.valueType === 'Boolean' ? Boolean(value) : undefined,
    dateValue: definition.valueType === 'Date' ? String(value) : undefined,
    jsonValue: definition.valueType === 'JSON' ? String(value) : undefined,
    environment: 'Production',
    active: true,
    changeReference: `LEGACY-${index + 1}`,
    modifiedAt: '2026-08-20T09:00:00.000Z',
    modifiedBy: 'config.owner@example.invalid'
  };
});

const governedRecords = (core = 70, impact = 30): IAdminConfigSourceRecord[] => legacyRecords().concat([
  {
    id: 101, etag: '"core-v1"', key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight,
    valueType: 'Number', numberValue: core, environment: 'Production', active: true,
    changeReference: 'PD-01-CORE', modifiedAt: '2026-09-20T08:00:00.000Z',
    modifiedBy: 'config.owner@example.invalid'
  },
  {
    id: 102, etag: '"impact-v1"', key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight,
    valueType: 'Number', numberValue: impact, environment: 'Production', active: true,
    changeReference: 'PD-01-IMPACT', modifiedAt: '2026-09-20T08:01:00.000Z',
    modifiedBy: 'config.owner@example.invalid'
  }
]);

const expectationFor = (records: readonly IAdminConfigSourceRecord[]): IAdminOverallDeliveryAuthorityExpectation => {
  const contract = buildAdminOverallDeliveryConfigurationContract(records, 'Production', 2026);
  return {
    environment: contract.environment,
    performanceYear: contract.performanceYear,
    versionToken: contract.versionToken,
    coreProvenance: contract.authority.core.provenance,
    impactProvenance: contract.authority.impact.provenance
  };
};

const maintenanceContext: IAdminConfigMaintenanceContext = {
  expectedEnvironment: 'Production', expectedPerformanceYear: 2026,
  actorEmail: 'admin@example.invalid', occurredAt: '2026-09-22T16:50:00.000Z',
  changeReference: 'KCF-KPI-PM28-A004'
};

describe('PM82 existing Config to Delivery consumer', () => {
  it.each([[70, 30], [60, 40]])('reads active %s/%s weights with the exact governed version', (core, impact) => {
    const records = governedRecords(core, impact);
    const authority = expectationFor(records);
    const result = readOverallDeliveryWeightConfiguration(records, 'Production', 2026, authority);
    expect(result).toEqual({ configurationKey: 'KCFKPI_Config|Production|2026', configurationVersion: authority.versionToken,
      coreWeight: core, impactWeight: impact, sourceReference: 'KCF-KPI-Sponsor-PD-01' });
    expect(Object.isFrozen(result)).toBe(true); expect(result).not.toHaveProperty('behaviourWeight');
  });
  it('keeps missing, wrong-boundary and invalid-total configuration unavailable', () => {
    expect(() => readOverallDeliveryWeightConfiguration([], 'Production', 2026)).toThrow();
    expect(() => readOverallDeliveryWeightConfiguration(governedRecords(), 'TEST', 2026)).toThrow();
    expect(() => readOverallDeliveryWeightConfiguration(governedRecords(70, 20), 'Production', 2026)).toThrow();
  });
});

describe('governed Overall Delivery Admin configuration', () => {
  it('publishes the approved 70/30 defaults only through exact governed records', () => {
    expect(ADMIN_OVERALL_DELIVERY_DEFAULT_WEIGHTS).toEqual({ core: 70, impact: 30 });
    const contract = buildAdminOverallDeliveryConfigurationContract(governedRecords(), 'Production', 2026);
    expect(contract.weights).toEqual({ core: 70, impact: 30, total: 100 });
    expect(contract.includedCategories).toEqual(['Core', 'Impact']);
    expect(contract.excludedCategories).toEqual(['Behaviours']);
    expect(contract.behavioursExcludedFromDeliveryArithmetic).toBe(true);
    expect(contract.poorCoreMaskingGuard).toBe('RequiredDownstreamGovernedRule');
    expect(contract.poorCoreThresholdConfiguredHere).toBe(false);
    expect(contract.authority.core.identity).toEqual(expect.objectContaining({
      itemId: 101, key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight,
      environment: 'Production', etag: '"core-v1"', state: 'Active'
    }));
    expect(Object.isFrozen(contract)).toBe(true);
    expect(Object.isFrozen(contract.weights)).toBe(true);
    expect(Object.isFrozen(contract.authority)).toBe(true);
  });

  it.each([[80, 20], [55, 45], [0, 100], [100, 0]])(
    'accepts custom whole-number Core %s / Impact %s configuration totalling 100',
    (core, impact) => {
      expect(buildAdminOverallDeliveryConfigurationContract(
        governedRecords(core, impact), 'Production', 2026
      ).weights).toEqual({ core, impact, total: 100 });
    }
  );

  it('rejects non-numeric, NaN, fractional, out-of-range, missing and incorrect-total inputs', () => {
    const mutate = (key: string, patch: Partial<IAdminConfigSourceRecord>): IAdminConfigSourceRecord[] =>
      governedRecords().map(record => record.key === key ? { ...record, ...patch } : record);
    expect(() => buildAdminTypedConfigShell(mutate(ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight, {
      valueType: 'Text', numberValue: undefined, textValue: '70'
    }), 'Production', 2026)).toThrow(/must use Number/);
    expect(() => buildAdminTypedConfigShell(mutate(ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight, {
      numberValue: Number.NaN
    }), 'Production', 2026)).toThrow(/finite number/);
    expect(() => buildAdminTypedConfigShell(mutate(ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight, {
      numberValue: 70.5
    }), 'Production', 2026)).toThrow(/whole-number percentage/);
    expect(() => buildAdminTypedConfigShell(mutate(ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight, {
      numberValue: 101
    }), 'Production', 2026)).toThrow(/between 0 and 100/);
    expect(() => buildAdminTypedConfigShell(governedRecords(70, 29), 'Production', 2026)).toThrow(/total exactly 100/);
    expect(() => buildAdminTypedConfigShell(governedRecords().filter(record =>
      record.key !== ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight), 'Production', 2026)).toThrow(/Impact weight is not configured/);
  });

  it('fails closed on mismatched environment, year, version and provenance expectations', () => {
    const source = governedRecords();
    const expected = expectationFor(source);
    expect(() => buildAdminOverallDeliveryConfigurationContract(source, 'TEST', 2026)).toThrow(/Environment mismatch/);
    expect(() => buildAdminOverallDeliveryConfigurationContract(source, 'Production', 2025)).toThrow(/PerformanceYear mismatch/);
    expect(() => buildAdminOverallDeliveryConfigurationContract(source, 'Production', 2026, {
      ...expected, versionToken: 'stale-version'
    })).toThrow(/authority, version or provenance changed/);
    expect(() => buildAdminOverallDeliveryConfigurationContract(source, 'Production', 2026, {
      ...expected, coreProvenance: { ...expected.coreProvenance, changeReference: 'STALE' }
    })).toThrow(/authority, version or provenance changed/);
  });

  it('uses optimistic concurrency for atomic custom weights and rejects stale and replayed requests', () => {
    const source = governedRecords();
    const shell = buildAdminTypedConfigShell(source, 'Production', 2026);
    const coreIdentity = shell.overallDelivery.authority.core.identity;
    const impactIdentity = shell.overallDelivery.authority.impact.identity;
    const plan = buildAdminConfigMaintenancePlan(source, maintenanceContext, [
      { expectedIdentity: coreIdentity, value: { valueType: 'Number', value: 60 } },
      { expectedIdentity: impactIdentity, value: { valueType: 'Number', value: 40 } }
    ]);
    expect(buildAdminOverallDeliveryConfigurationContract(plan.candidate, 'Production', 2026).weights)
      .toEqual({ core: 60, impact: 40, total: 100 });
    expect(source.filter(record => record.key === ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight)[0].numberValue).toBe(70);
    expect(() => buildAdminConfigMaintenancePlan(source, maintenanceContext, [{
      expectedIdentity: { ...coreIdentity, etag: '"stale"' }, value: { valueType: 'Number', value: 60 }
    }])).toThrow(/changed after it was loaded/);
    expect(() => buildAdminConfigMaintenancePlan(plan.candidate, maintenanceContext, [
      { expectedIdentity: coreIdentity, value: { valueType: 'Number', value: 60 } },
      { expectedIdentity: impactIdentity, value: { valueType: 'Number', value: 40 } }
    ])).toThrow(/must change the typed value/);
  });

  it('rejects accessor records without executing getters and fails closed on malformed Proxy arrays', () => {
    const source = governedRecords();
    const coreIndex = source.findIndex(record => record.key === ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight);
    let getterReads = 0;
    const accessor = { ...source[coreIndex] } as IAdminConfigSourceRecord;
    Object.defineProperty(accessor, 'numberValue', {
      enumerable: true,
      get: () => { getterReads += 1; return 70; }
    });
    source[coreIndex] = accessor;
    expect(() => buildAdminTypedConfigShell(source, 'Production', 2026)).toThrow(/own data property/);
    expect(getterReads).toBe(0);

    const stable = governedRecords();
    let getReads = 0;
    const proxy = new Proxy(stable, {
      get: (target, property, receiver) => {
        getReads += 1;
        return Reflect.get(target, property, receiver);
      },
      ownKeys: target => Reflect.ownKeys(target).concat('unexpected')
    });
    expect(() => buildAdminTypedConfigShell(proxy, 'Production', 2026)).toThrow(/unsupported own field/);
    expect(getReads).toBe(0);

    const expected = expectationFor(governedRecords());
    let authorityReads = 0;
    Object.defineProperty(expected, 'versionToken', {
      enumerable: true,
      get: () => { authorityReads += 1; return 'forged'; }
    });
    expect(() => buildAdminOverallDeliveryConfigurationContract(
      governedRecords(), 'Production', 2026, expected
    )).toThrow(/enumerable own data property/);
    expect(authorityReads).toBe(0);
  });

  it('keeps legacy Workplan defaults compatible and excludes Behaviour changes from the new contract', () => {
    const legacy = legacyRecords();
    expect(validateAdminConfigSet(legacy)).toEqual({ valid: true, issues: [] });
    expect(buildAdminConfigView(legacy).groups).toHaveLength(5);
    const first = buildAdminOverallDeliveryConfigurationContract(governedRecords(), 'Production', 2026);
    const changedLegacy = governedRecords().map(record => record.key === CONFIG_KEYS.personalWeight
      ? { ...record, numberValue: 10 }
      : record.key === CONFIG_KEYS.behaviourWeight ? { ...record, numberValue: 20 } : record);
    const second = buildAdminOverallDeliveryConfigurationContract(changedLegacy, 'Production', 2026);
    expect(second.weights).toEqual(first.weights);
    expect(second.versionToken).toBe(first.versionToken);
    expect(second.excludedCategories).toEqual(['Behaviours']);
  });
});
