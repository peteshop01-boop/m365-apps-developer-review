import type { ConfigValueType, IConfigRecord } from '../models/ProductionModels';
import { CONFIG_KEYS } from './ProductionConfigMapper';
import type { IOverallDeliveryWeightConfiguration } from '../models/QuarterlyModels';

export type AdminConfigCategory =
  | 'PerformanceYear'
  | 'QuarterDeadlines'
  | 'RagThresholds'
  | 'WorkplanDefaultsGuardrails'
  | 'OverallDelivery'
  | 'ReminderMetadata';

export type AdminConfigValidationCode =
  | 'MissingRequiredKey'
  | 'DuplicateActiveKey'
  | 'UnsupportedKey'
  | 'TypeMismatch'
  | 'InvalidValue'
  | 'CrossFieldGuardrail';

export interface IAdminConfigSourceRecord extends IConfigRecord {
  /** Existing physical Config environment boundary. */
  environment?: string;
  /** Exact SharePoint item ETag used as the stable version precondition. */
  etag?: string;
  /** Existing physical change-provenance field. */
  changeReference?: string;
  modifiedAt?: string;
  modifiedBy?: string;
}

export type AdminConfigPhysicalState = 'Active' | 'Inactive';

export type AdminConfigTypedValue =
  | Readonly<{ valueType: 'Text'; value: string }>
  | Readonly<{ valueType: 'Number'; value: number }>
  | Readonly<{ valueType: 'Boolean'; value: boolean }>
  | Readonly<{ valueType: 'Date'; value: string }>
  | Readonly<{ valueType: 'JSON'; value: readonly string[] }>;

export interface IAdminConfigStableIdentity {
  itemId: number;
  key: string;
  environment: string;
  etag: string;
  state: AdminConfigPhysicalState;
}

export interface IAdminTypedConfigShellRecord {
  identity: Readonly<IAdminConfigStableIdentity>;
  value: AdminConfigTypedValue;
  provenance: Readonly<{
    modifiedAt: string;
    modifiedBy: string;
    changeReference: string;
  }>;
}

export interface IAdminTypedConfigShell {
  mode: 'DecisionIndependent';
  sourceList: 'KCFKPI_Config';
  environment: string;
  performanceYear: number;
  records: readonly IAdminTypedConfigShellRecord[];
  overallDelivery: IAdminOverallDeliveryConfigurationContract;
  scoringInterpretationApplied: false;
  tenantMutationExecuted: false;
}

export const ADMIN_OVERALL_DELIVERY_CONFIG_KEYS = Object.freeze({
  coreWeight: 'OverallDelivery.Weight.Core',
  impactWeight: 'OverallDelivery.Weight.Impact'
} as const);

export const ADMIN_OVERALL_DELIVERY_DEFAULT_WEIGHTS = Object.freeze({
  core: 70,
  impact: 30
} as const);

export interface IAdminOverallDeliveryAuthorityExpectation {
  environment: string;
  performanceYear: number;
  versionToken: string;
  coreProvenance: Readonly<{ modifiedAt: string; modifiedBy: string; changeReference: string }>;
  impactProvenance: Readonly<{ modifiedAt: string; modifiedBy: string; changeReference: string }>;
}

export interface IAdminOverallDeliveryConfigurationContract {
  schema: 'KCF.OverallDelivery.Configuration';
  schemaVersion: 1;
  sourceList: 'KCFKPI_Config';
  environment: string;
  performanceYear: number;
  versionToken: string;
  weights: Readonly<{ core: number; impact: number; total: 100 }>;
  includedCategories: readonly ['Core', 'Impact'];
  excludedCategories: readonly ['Behaviours'];
  behavioursExcludedFromDeliveryArithmetic: true;
  poorCoreMaskingGuard: 'RequiredDownstreamGovernedRule';
  poorCoreThresholdConfiguredHere: false;
  authority: Readonly<{
    core: Readonly<{
      identity: Readonly<IAdminConfigStableIdentity>;
      provenance: Readonly<{ modifiedAt: string; modifiedBy: string; changeReference: string }>;
    }>;
    impact: Readonly<{
      identity: Readonly<IAdminConfigStableIdentity>;
      provenance: Readonly<{ modifiedAt: string; modifiedBy: string; changeReference: string }>;
    }>;
  }>;
  tenantMutationExecuted: false;
}

export interface IAdminConfigMaintenanceContext {
  expectedEnvironment: string;
  expectedPerformanceYear: number;
  targetPerformanceYear?: number;
  actorEmail: string;
  occurredAt: string;
  changeReference: string;
}

export interface IAdminConfigMaintenanceRequest {
  expectedIdentity: IAdminConfigStableIdentity;
  value: AdminConfigTypedValue;
}

export interface IAdminConfigMaintenancePlan {
  mode: 'BrowserMemoryCandidate';
  sourceList: 'KCFKPI_Config';
  environment: string;
  expectedPerformanceYear: number;
  targetPerformanceYear: number;
  expectedEtags: readonly string[];
  replacements: readonly IAdminConfigSourceRecord[];
  candidate: readonly IAdminConfigSourceRecord[];
  attribution: Readonly<{ actorEmail: string; occurredAt: string; changeReference: string }>;
  scoringInterpretationApplied: false;
  tenantMutationExecuted: false;
}

export interface IAdminConfigDefinition {
  key: string;
  category: AdminConfigCategory;
  plainEnglishName: string;
  description: string;
  valueType: ConfigValueType;
  required: boolean;
  /** Reminder settings are configuration metadata only. This slice never sends a notification. */
  reminderMetadataOnly?: boolean;
  /** Approved initial value used only when a governed record is provisioned through a separately authorised route. */
  defaultNumberValue?: number;
}

export interface IAdminConfigValidationIssue {
  code: AdminConfigValidationCode;
  key: string;
  message: string;
}

export interface IAdminConfigValidationResult {
  valid: boolean;
  issues: IAdminConfigValidationIssue[];
}

export type AdminConfigItemState = 'Valid' | 'Invalid' | 'Missing';

export interface IAdminConfigItem {
  definition: IAdminConfigDefinition;
  record?: IAdminConfigSourceRecord;
  currentValue: string;
  state: AdminConfigItemState;
  issues: IAdminConfigValidationIssue[];
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
}

export interface IAdminConfigCategoryGroup {
  category: AdminConfigCategory;
  title: string;
  items: IAdminConfigItem[];
  attentionCount: number;
}

export interface IAdminConfigAttentionSummary {
  requiresAttention: boolean;
  totalProblems: number;
  missingRequiredKeys: string[];
  invalidKeys: string[];
  unsupportedKeys: string[];
  headline: string;
}

export interface IAdminConfigView {
  groups: IAdminConfigCategoryGroup[];
  validation: IAdminConfigValidationResult;
  attention: IAdminConfigAttentionSummary;
  /** Unsupported keys remain visible to Admin but cannot be edited through the supported form. */
  unsupportedRecords: IAdminConfigSourceRecord[];
  notificationsEnabled: false;
}

export interface IAdminConfigGroupReplacementResult {
  category: AdminConfigCategory;
  candidate: IAdminConfigSourceRecord[];
  /** Validation scoped to the staged group; unrelated pre-existing issues do not deadlock remediation. */
  result: IAdminConfigValidationResult;
  /** Full post-change health remains available for the attention summary and subsequent remediation. */
  fullResult: IAdminConfigValidationResult;
}

export const ADMIN_CONFIG_CATEGORY_ORDER: readonly AdminConfigCategory[] = [
  'PerformanceYear',
  'QuarterDeadlines',
  'RagThresholds',
  'WorkplanDefaultsGuardrails',
  'ReminderMetadata'
];

const categoryTitles: Record<AdminConfigCategory, string> = {
  PerformanceYear: 'Performance Year',
  QuarterDeadlines: 'Quarters and deadlines',
  RagThresholds: 'RAG thresholds',
  WorkplanDefaultsGuardrails: 'Workplan defaults and guardrails',
  OverallDelivery: 'Overall Delivery configuration',
  ReminderMetadata: 'Reminder configuration'
};

/** Existing production Config key retained as a typed Admin setting. */
export const ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY = 'RAG.InvalidIsUnassessed';

export const ADMIN_CONFIG_DEFINITIONS: readonly IAdminConfigDefinition[] = [
  { key: CONFIG_KEYS.performanceYear, category: 'PerformanceYear', plainEnglishName: 'Current performance year', description: 'The active KCF performance year label in YYYY/YY form.', valueType: 'Text', required: true },
  { key: CONFIG_KEYS.performanceYearStart, category: 'PerformanceYear', plainEnglishName: 'Performance year starts', description: 'UTC date on which the active performance year begins.', valueType: 'Date', required: true },
  { key: CONFIG_KEYS.performanceYearEnd, category: 'PerformanceYear', plainEnglishName: 'Performance year ends', description: 'UTC date on which the active performance year ends.', valueType: 'Date', required: true },

  { key: CONFIG_KEYS.q1, category: 'QuarterDeadlines', plainEnglishName: 'Quarter 1 label', description: 'Plain-English period label shown for Quarter 1.', valueType: 'Text', required: true },
  { key: CONFIG_KEYS.q2, category: 'QuarterDeadlines', plainEnglishName: 'Quarter 2 label', description: 'Plain-English period label shown for Quarter 2.', valueType: 'Text', required: true },
  { key: CONFIG_KEYS.q3, category: 'QuarterDeadlines', plainEnglishName: 'Quarter 3 label', description: 'Plain-English period label shown for Quarter 3.', valueType: 'Text', required: true },
  { key: CONFIG_KEYS.q4, category: 'QuarterDeadlines', plainEnglishName: 'Quarter 4 label', description: 'Plain-English period label shown for Quarter 4.', valueType: 'Text', required: true },
  { key: CONFIG_KEYS.employeeSubmissionDaysAfterQuarter, category: 'QuarterDeadlines', plainEnglishName: 'Employee submission window', description: 'Positive whole calendar days after quarter end allowed for employee submission.', valueType: 'Number', required: true },
  { key: CONFIG_KEYS.managerReviewDaysAfterSubmissionDeadline, category: 'QuarterDeadlines', plainEnglishName: 'Manager review window', description: 'Positive whole calendar days after the employee deadline allowed for manager review.', valueType: 'Number', required: true },

  { key: CONFIG_KEYS.greenThreshold, category: 'RagThresholds', plainEnglishName: 'Green threshold', description: 'Configured percentage boundary; scoring interpretation remains outside this Admin shell.', valueType: 'Number', required: true },
  { key: CONFIG_KEYS.amberThreshold, category: 'RagThresholds', plainEnglishName: 'Amber threshold', description: 'Configured percentage boundary below the Green threshold; scoring interpretation remains outside this Admin shell.', valueType: 'Number', required: true },
  { key: ADMIN_CONFIG_RAG_INVALID_IS_UNASSESSED_KEY, category: 'RagThresholds', plainEnglishName: 'Invalid results are unassessed', description: 'Controls whether invalid scoring inputs remain unassessed instead of being assigned a performance RAG.', valueType: 'Boolean', required: true },

  { key: CONFIG_KEYS.coreWeight, category: 'WorkplanDefaultsGuardrails', plainEnglishName: 'Default Core weight', description: 'Default Core Strategy category percentage; allowed range is 60% to 90%.', valueType: 'Number', required: true },
  { key: CONFIG_KEYS.personalWeight, category: 'WorkplanDefaultsGuardrails', plainEnglishName: 'Default Personal weight', description: 'Default Local/Personal category percentage; allowed range is 0% to 30%.', valueType: 'Number', required: true },
  { key: CONFIG_KEYS.behaviourWeight, category: 'WorkplanDefaultsGuardrails', plainEnglishName: 'Default Behaviour weight', description: 'Default Behaviour category percentage; allowed range is 10% to 20%.', valueType: 'Number', required: true },
  { key: CONFIG_KEYS.aggregationMethods, category: 'WorkplanDefaultsGuardrails', plainEnglishName: 'Permitted aggregation methods', description: 'Controlled list of supported KPI aggregation methods.', valueType: 'JSON', required: true },
  { key: CONFIG_KEYS.retentionStatus, category: 'WorkplanDefaultsGuardrails', plainEnglishName: 'Retention policy status', description: 'Governance status only; it does not change retention automatically.', valueType: 'Text', required: true },

  { key: CONFIG_KEYS.quarterEarlyReviewReminderDays, category: 'ReminderMetadata', plainEnglishName: 'Early review reminder offset', description: 'Positive whole calendar days before quarter end for the early reminder milestone.', valueType: 'Number', required: true, reminderMetadataOnly: true },
  { key: CONFIG_KEYS.quarterPreparationReminderDays, category: 'ReminderMetadata', plainEnglishName: 'Preparation reminder offset', description: 'Positive whole calendar days before quarter end for the preparation milestone.', valueType: 'Number', required: true, reminderMetadataOnly: true },
  { key: CONFIG_KEYS.quarterFinalReminderDays, category: 'ReminderMetadata', plainEnglishName: 'Final reminder offset', description: 'Positive whole calendar days before quarter end for the final milestone.', valueType: 'Number', required: true, reminderMetadataOnly: true }
];

export const ADMIN_OVERALL_DELIVERY_CONFIG_DEFINITIONS: readonly IAdminConfigDefinition[] = Object.freeze([
  Object.freeze({
    key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight,
    category: 'OverallDelivery' as const,
    plainEnglishName: 'Overall Delivery Core weight',
    description: 'Governed percentage applied to Core by the separate Overall Delivery calculation. Behaviours are excluded.',
    valueType: 'Number' as const,
    required: true,
    defaultNumberValue: ADMIN_OVERALL_DELIVERY_DEFAULT_WEIGHTS.core
  }),
  Object.freeze({
    key: ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight,
    category: 'OverallDelivery' as const,
    plainEnglishName: 'Overall Delivery Impact weight',
    description: 'Governed percentage applied to Impact by the separate Overall Delivery calculation. Behaviours are excluded.',
    valueType: 'Number' as const,
    required: true,
    defaultNumberValue: ADMIN_OVERALL_DELIVERY_DEFAULT_WEIGHTS.impact
  })
]);

const allConfigDefinitions: readonly IAdminConfigDefinition[] = Object.freeze([
  ...ADMIN_CONFIG_DEFINITIONS,
  ...ADMIN_OVERALL_DELIVERY_CONFIG_DEFINITIONS
]);

const supportedAggregationMethods: readonly string[] = [
  'DirectMetric', 'Additive', 'WeightedContribution', 'Composite', 'Milestone', 'AccountableOwner'
];

const clean = (value: string | undefined): string => (value || '').trim();

const adminConfigRecordFields = new Set<string>([
  'id', 'etag', 'key', 'valueType', 'textValue', 'numberValue', 'booleanValue', 'dateValue', 'jsonValue',
  'environment', 'active', 'changeReference', 'modifiedAt', 'modifiedBy'
]);

/** Captures one descriptor-safe Config record without evaluating supplied accessors. */
const snapshotAdminConfigRecord = (value: unknown, label: string): IAdminConfigSourceRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain Config record.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must use a plain or null prototype.`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || !adminConfigRecordFields.has(key))) {
    throw new Error(`${label} contains an unsupported own field or symbol.`);
  }
  const snapshot: { [key: string]: unknown } = Object.create(null) as { [key: string]: unknown };
  keys.forEach(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new Error(`${label}.${String(key)} must be an enumerable own data property.`);
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false
    });
  });
  ['id', 'key', 'valueType', 'active'].forEach(field => {
    if (!Object.prototype.hasOwnProperty.call(snapshot, field)) throw new Error(`${label} requires own ${field}.`);
  });
  return Object.freeze(snapshot) as unknown as IAdminConfigSourceRecord;
};

/** Captures the supplied array and every record exactly once before validation or disclosure. */
const snapshotAdminConfigRecords = (records: readonly IAdminConfigSourceRecord[]): readonly IAdminConfigSourceRecord[] => {
  if (!Array.isArray(records)) throw new Error('Admin Config typed shell requires a record array.');
  const keys = Reflect.ownKeys(records);
  if (keys.some(key => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)))) {
    throw new Error('Admin Config record array contains an unsupported own field or symbol.');
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(records, 'length');
  const length = lengthDescriptor && Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
    ? lengthDescriptor.value
    : undefined;
  if (!Number.isSafeInteger(length) || length < 0) throw new Error('Admin Config record array has an invalid length descriptor.');
  const snapshots: IAdminConfigSourceRecord[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(records, String(index));
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new Error(`Admin Config record array index ${index} must be an enumerable own data property.`);
    }
    snapshots.push(snapshotAdminConfigRecord(descriptor.value, `Admin Config record ${index}`));
  }
  if (keys.filter(key => key !== 'length').length !== length) {
    throw new Error('Admin Config record array must be dense and contain no extra indices.');
  }
  return Object.freeze(snapshots);
};

const snapshotExactOwnData = (
  value: unknown,
  label: string,
  fields: readonly string[]
): Readonly<{ [key: string]: unknown }> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a plain object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(`${label} must use a plain or null prototype.`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some(key => typeof key !== 'string' || fields.indexOf(key) < 0)) {
    throw new Error(`${label} must contain only its exact own fields.`);
  }
  const snapshot: { [key: string]: unknown } = Object.create(null) as { [key: string]: unknown };
  fields.forEach(field => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new Error(`${label}.${field} must be an enumerable own data property.`);
    }
    Object.defineProperty(snapshot, field, {
      value: descriptor.value,
      enumerable: true,
      writable: false,
      configurable: false
    });
  });
  return Object.freeze(snapshot);
};

const snapshotOverallDeliveryAuthorityExpectation = (
  value: IAdminOverallDeliveryAuthorityExpectation
): IAdminOverallDeliveryAuthorityExpectation => {
  const snapshot = snapshotExactOwnData(value, 'Overall Delivery authority expectation', [
    'environment', 'performanceYear', 'versionToken', 'coreProvenance', 'impactProvenance'
  ]);
  const provenanceFields = ['modifiedAt', 'modifiedBy', 'changeReference'] as const;
  return Object.freeze({
    environment: snapshot.environment as string,
    performanceYear: snapshot.performanceYear as number,
    versionToken: snapshot.versionToken as string,
    coreProvenance: snapshotExactOwnData(
      snapshot.coreProvenance,
      'Overall Delivery Core provenance expectation',
      provenanceFields
    ) as unknown as IAdminOverallDeliveryAuthorityExpectation['coreProvenance'],
    impactProvenance: snapshotExactOwnData(
      snapshot.impactProvenance,
      'Overall Delivery Impact provenance expectation',
      provenanceFields
    ) as unknown as IAdminOverallDeliveryAuthorityExpectation['impactProvenance']
  });
};

const definitionByKey = (): Map<string, IAdminConfigDefinition> => {
  const result = new Map<string, IAdminConfigDefinition>();
  allConfigDefinitions.forEach(definition => result.set(definition.key, definition));
  return result;
};

const valueFields: ReadonlyArray<keyof Pick<IConfigRecord, 'textValue' | 'numberValue' | 'booleanValue' | 'dateValue' | 'jsonValue'>> = [
  'textValue', 'numberValue', 'booleanValue', 'dateValue', 'jsonValue'
];

const expectedValueField = (valueType: ConfigValueType): typeof valueFields[number] => {
  if (valueType === 'Text') return 'textValue';
  if (valueType === 'Number') return 'numberValue';
  if (valueType === 'Boolean') return 'booleanValue';
  if (valueType === 'Date') return 'dateValue';
  return 'jsonValue';
};

const pushIssue = (
  issues: IAdminConfigValidationIssue[],
  code: AdminConfigValidationCode,
  key: string,
  message: string
): void => {
  issues.push({ code, key, message });
};

const activeRecordsByKey = (records: readonly IAdminConfigSourceRecord[]): Map<string, IAdminConfigSourceRecord[]> => {
  const result = new Map<string, IAdminConfigSourceRecord[]>();
  records.filter(record => record.active).forEach(record => {
    const current = result.get(record.key) || [];
    result.set(record.key, current.concat([record]));
  });
  return result;
};

const supportedDateValue = (value?: string): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value)) return false;
  const datePart = value.slice(0, 10);
  const parts = datePart.split('-').map(part => Number(part));
  const calendarDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return calendarDate.toISOString().slice(0, 10) === datePart && !Number.isNaN(Date.parse(value));
};

const validateRecordValue = (
  record: IAdminConfigSourceRecord,
  definition: IAdminConfigDefinition,
  issues: IAdminConfigValidationIssue[]
): void => {
  if (record.valueType !== definition.valueType) {
    pushIssue(issues, 'TypeMismatch', record.key, `${record.key} must use ${definition.valueType}, not ${record.valueType}.`);
    return;
  }
  const expectedField = expectedValueField(definition.valueType);
  const populatedFields = valueFields.filter(field => record[field] !== undefined);
  if (populatedFields.length !== 1 || populatedFields[0] !== expectedField) {
    pushIssue(issues, 'InvalidValue', record.key, `${record.key} must populate only ${expectedField}.`);
    return;
  }

  if (definition.valueType === 'Text') {
    if (!record.textValue || !record.textValue.trim()) {
      pushIssue(issues, 'InvalidValue', record.key, `${record.key} requires a non-blank text value.`);
    } else if (record.key === CONFIG_KEYS.performanceYear && !/^\d{4}\/\d{2}$/.test(record.textValue.trim())) {
      pushIssue(issues, 'InvalidValue', record.key, `${record.key} must use YYYY/YY, for example 2025/26.`);
    }
    return;
  }
  if (definition.valueType === 'Date') {
    if (!supportedDateValue(record.dateValue)) {
      pushIssue(issues, 'InvalidValue', record.key, `${record.key} requires an unambiguous ISO timestamp or YYYY-MM-DD date.`);
    }
    return;
  }
  if (definition.valueType === 'Number') {
    const value = record.numberValue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      pushIssue(issues, 'InvalidValue', record.key, `${record.key} requires a finite number.`);
      return;
    }
    const integerKeys: readonly string[] = [
      CONFIG_KEYS.employeeSubmissionDaysAfterQuarter,
      CONFIG_KEYS.managerReviewDaysAfterSubmissionDeadline,
      CONFIG_KEYS.quarterEarlyReviewReminderDays,
      CONFIG_KEYS.quarterPreparationReminderDays,
      CONFIG_KEYS.quarterFinalReminderDays,
      ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight,
      ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight
    ];
    const positiveIntegerKeys = integerKeys.filter(key => key !== ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight
      && key !== ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight);
    if (positiveIntegerKeys.indexOf(record.key) >= 0 && (!Number.isInteger(value) || value <= 0)) {
      pushIssue(issues, 'InvalidValue', record.key, `${record.key} must be a positive whole number of calendar days.`);
    }
    if (([ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight, ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight] as readonly string[])
      .indexOf(record.key) >= 0 && !Number.isInteger(value)) {
      pushIssue(issues, 'InvalidValue', record.key, `${record.key} must be a whole-number percentage.`);
    }
    const percentKeys: readonly string[] = [
      CONFIG_KEYS.coreWeight, CONFIG_KEYS.personalWeight, CONFIG_KEYS.behaviourWeight,
      CONFIG_KEYS.greenThreshold, CONFIG_KEYS.amberThreshold,
      ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight,
      ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight
    ];
    if (percentKeys.indexOf(record.key) >= 0 && (value < 0 || value > 100)) {
      pushIssue(issues, 'InvalidValue', record.key, `${record.key} must be between 0 and 100.`);
    }
    return;
  }
  if (definition.valueType === 'Boolean') return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(record.jsonValue || '');
  } catch {
    pushIssue(issues, 'InvalidValue', record.key, `${record.key} requires valid JSON.`);
    return;
  }
  if (!Array.isArray(parsed) || !parsed.length || parsed.some(value => typeof value !== 'string' || !value.trim())) {
    pushIssue(issues, 'InvalidValue', record.key, `${record.key} must contain a non-empty array of strings.`);
    return;
  }
  const values = parsed.map(value => String(value));
  if (new Set(values).size !== values.length || values.some(value => supportedAggregationMethods.indexOf(value) < 0)) {
    pushIssue(issues, 'InvalidValue', record.key, `${record.key} contains duplicate or unsupported aggregation methods.`);
  }
};

/** Reads exactly one typed physical value without applying any calculation or scoring meaning. */
export const readAdminConfigTypedValue = (record: IAdminConfigSourceRecord): AdminConfigTypedValue => {
  const definition = definitionByKey().get(record.key);
  if (!definition) throw new Error(`Admin Config key ${record.key} is not supported by the typed shell.`);
  const issues: IAdminConfigValidationIssue[] = [];
  validateRecordValue(record, definition, issues);
  if (issues.length) throw new Error(issues.map(issue => issue.message).join(' '));
  if (record.valueType === 'Text') return Object.freeze({ valueType: 'Text', value: record.textValue! });
  if (record.valueType === 'Number') return Object.freeze({ valueType: 'Number', value: record.numberValue! });
  if (record.valueType === 'Boolean') return Object.freeze({ valueType: 'Boolean', value: record.booleanValue! });
  if (record.valueType === 'Date') return Object.freeze({ valueType: 'Date', value: record.dateValue! });
  const parsed = JSON.parse(record.jsonValue!) as string[];
  return Object.freeze({ valueType: 'JSON', value: Object.freeze(parsed.slice()) });
};

/** Writes a typed value back to the existing five physical value slots and validates the round-trip. */
export const writeAdminConfigTypedValue = (
  record: IAdminConfigSourceRecord,
  typedValue: AdminConfigTypedValue
): IAdminConfigSourceRecord => {
  if (!typedValue || typedValue.valueType !== record.valueType) {
    throw new Error(`Admin Config ${record.key} typed value does not match ${record.valueType}.`);
  }
  const replacement: IAdminConfigSourceRecord = {
    ...record,
    textValue: typedValue.valueType === 'Text' ? typedValue.value : undefined,
    numberValue: typedValue.valueType === 'Number' ? typedValue.value : undefined,
    booleanValue: typedValue.valueType === 'Boolean' ? typedValue.value : undefined,
    dateValue: typedValue.valueType === 'Date' ? typedValue.value : undefined,
    jsonValue: typedValue.valueType === 'JSON' ? JSON.stringify(typedValue.value) : undefined
  };
  readAdminConfigTypedValue(replacement);
  return replacement;
};

const recordNumber = (active: Map<string, IAdminConfigSourceRecord[]>, key: string): number | undefined => {
  const records = active.get(key);
  return records && records.length === 1 ? records[0].numberValue : undefined;
};

const recordText = (active: Map<string, IAdminConfigSourceRecord[]>, key: string): string | undefined => {
  const records = active.get(key);
  return records && records.length === 1 ? records[0].textValue : undefined;
};

const recordDate = (active: Map<string, IAdminConfigSourceRecord[]>, key: string): string | undefined => {
  const records = active.get(key);
  return records && records.length === 1 ? records[0].dateValue : undefined;
};

const validateCrossFieldGuardrails = (
  active: Map<string, IAdminConfigSourceRecord[]>,
  issues: IAdminConfigValidationIssue[]
): void => {
  const start = recordDate(active, CONFIG_KEYS.performanceYearStart);
  const end = recordDate(active, CONFIG_KEYS.performanceYearEnd);
  if (start && end && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end)) && Date.parse(start) >= Date.parse(end)) {
    pushIssue(issues, 'CrossFieldGuardrail', CONFIG_KEYS.performanceYearEnd, 'Performance Year start must be before its end.');
  }
  const label = recordText(active, CONFIG_KEYS.performanceYear);
  if (label && start && end && !Number.isNaN(Date.parse(start)) && !Number.isNaN(Date.parse(end))) {
    const startYear = new Date(start).getUTCFullYear();
    const endYear = new Date(end).getUTCFullYear();
    const expectedLabel = `${startYear}/${String(endYear).slice(-2)}`;
    if (label.trim() !== expectedLabel) {
      pushIssue(issues, 'CrossFieldGuardrail', CONFIG_KEYS.performanceYear, `Performance Year label must match the configured dates (${expectedLabel}).`);
    }
  }

  const quarterLabels = [CONFIG_KEYS.q1, CONFIG_KEYS.q2, CONFIG_KEYS.q3, CONFIG_KEYS.q4]
    .map(key => recordText(active, key)?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
  if (quarterLabels.length === 4 && new Set(quarterLabels).size !== 4) {
    pushIssue(issues, 'CrossFieldGuardrail', 'Period.Q1-Q4', 'Quarter labels must be distinct.');
  }

  const green = recordNumber(active, CONFIG_KEYS.greenThreshold);
  const amber = recordNumber(active, CONFIG_KEYS.amberThreshold);
  if (green !== undefined && amber !== undefined && amber >= green) {
    pushIssue(issues, 'CrossFieldGuardrail', CONFIG_KEYS.amberThreshold, 'Amber threshold must be lower than Green threshold. The Admin shell does not calculate or interpret scoring results.');
  }

  const core = recordNumber(active, CONFIG_KEYS.coreWeight);
  const personal = recordNumber(active, CONFIG_KEYS.personalWeight);
  const behaviours = recordNumber(active, CONFIG_KEYS.behaviourWeight);
  if (core !== undefined && (core < 60 || core > 90)) {
    pushIssue(issues, 'CrossFieldGuardrail', CONFIG_KEYS.coreWeight, 'Default Core weight must be from 60% to 90%.');
  }
  if (personal !== undefined && (personal < 0 || personal > 30)) {
    pushIssue(issues, 'CrossFieldGuardrail', CONFIG_KEYS.personalWeight, 'Default Personal weight must be from 0% to 30%.');
  }
  if (behaviours !== undefined && (behaviours < 10 || behaviours > 20)) {
    pushIssue(issues, 'CrossFieldGuardrail', CONFIG_KEYS.behaviourWeight, 'Default Behaviour weight must be from 10% to 20%.');
  }
  if (core !== undefined && personal !== undefined && behaviours !== undefined && core + personal + behaviours !== 100) {
    pushIssue(issues, 'CrossFieldGuardrail', 'Workplan.Weight', 'Core, Personal and Behaviour defaults must total exactly 100%.');
  }

  const overallCore = recordNumber(active, ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight);
  const overallImpact = recordNumber(active, ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight);
  if (overallCore !== undefined && overallImpact !== undefined && overallCore + overallImpact !== 100) {
    pushIssue(issues, 'CrossFieldGuardrail', 'OverallDelivery.Weight', 'Overall Delivery Core and Impact weights must total exactly 100%.');
  }

  const early = recordNumber(active, CONFIG_KEYS.quarterEarlyReviewReminderDays);
  const preparation = recordNumber(active, CONFIG_KEYS.quarterPreparationReminderDays);
  const final = recordNumber(active, CONFIG_KEYS.quarterFinalReminderDays);
  if (early !== undefined && preparation !== undefined && final !== undefined && !(early > preparation && preparation > final)) {
    pushIssue(issues, 'CrossFieldGuardrail', 'QuarterReminderDays', 'Reminder offsets must run in early, preparation and final order.');
  }
};

export const getAdminConfigDefinition = (key: string): IAdminConfigDefinition | undefined =>
  allConfigDefinitions.filter(definition => definition.key === key)[0];

export const formatAdminConfigValue = (record: IAdminConfigSourceRecord | undefined): string => {
  if (!record) return 'Not configured';
  if (record.valueType === 'Text') return record.textValue || '';
  if (record.valueType === 'Number') return typeof record.numberValue === 'number' ? String(record.numberValue) : '';
  if (record.valueType === 'Boolean') return typeof record.booleanValue === 'boolean' ? String(record.booleanValue) : '';
  if (record.valueType === 'Date') return supportedDateValue(record.dateValue) ? record.dateValue.slice(0, 10) : '';
  return record.jsonValue || '';
};

export const validateAdminConfigSet = (records: readonly IAdminConfigSourceRecord[]): IAdminConfigValidationResult => {
  const issues: IAdminConfigValidationIssue[] = [];
  const definitions = definitionByKey();
  const active = activeRecordsByKey(records);

  records.filter(record => !definitions.has(record.key)).forEach(record => {
    pushIssue(issues, 'UnsupportedKey', record.key, `${record.key} is not supported by this Admin form and cannot be edited here.`);
  });
  const overallDeliveryPresent = records.some(record => record.key === ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight
    || record.key === ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight);
  const requiredDefinitions = overallDeliveryPresent ? allConfigDefinitions : ADMIN_CONFIG_DEFINITIONS;
  requiredDefinitions.forEach(definition => {
    const matches = active.get(definition.key) || [];
    if (definition.required && matches.length === 0) {
      pushIssue(issues, 'MissingRequiredKey', definition.key, `${definition.plainEnglishName} is not configured.`);
    }
    if (matches.length > 1) {
      pushIssue(issues, 'DuplicateActiveKey', definition.key, `${definition.key} has more than one active record.`);
      return;
    }
    if (matches.length === 1) validateRecordValue(matches[0], definition, issues);
  });
  validateCrossFieldGuardrails(active, issues);
  return { valid: issues.length === 0, issues };
};

const configIdentity = (record: IAdminConfigSourceRecord): Readonly<IAdminConfigStableIdentity> => {
  if (!Number.isSafeInteger(record.id) || record.id < 1) {
    throw new Error(`Admin Config ${record.key} requires a positive physical item ID.`);
  }
  const environment = clean(record.environment);
  const etag = clean(record.etag);
  if (!environment) throw new Error(`Admin Config ${record.key} requires an explicit Environment.`);
  if (!etag || etag === '*') throw new Error(`Admin Config ${record.key} requires an exact non-wildcard ETag version.`);
  return Object.freeze({
    itemId: record.id,
    key: record.key,
    environment,
    etag,
    state: record.active ? 'Active' : 'Inactive'
  });
};

const assertProvenance = (record: IAdminConfigSourceRecord): Readonly<{
  modifiedAt: string;
  modifiedBy: string;
  changeReference: string;
}> => {
  const modifiedAt = clean(record.modifiedAt);
  const modifiedBy = clean(record.modifiedBy);
  const changeReference = clean(record.changeReference);
  if (!modifiedAt || Number.isNaN(Date.parse(modifiedAt)) || !modifiedBy || !changeReference) {
    throw new Error(`Admin Config ${record.key} requires attributable Modified, Editor and ChangeReference provenance.`);
  }
  return Object.freeze({ modifiedAt, modifiedBy, changeReference });
};

const exactYear = (value: number, field: string): number => {
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    throw new Error(`Admin Config ${field} must be an exact year from 2000 to 2100.`);
  }
  return value;
};

const sameProvenance = (
  actual: Readonly<{ modifiedAt: string; modifiedBy: string; changeReference: string }>,
  expected: Readonly<{ modifiedAt: string; modifiedBy: string; changeReference: string }>
): boolean => actual.modifiedAt === expected.modifiedAt
  && actual.modifiedBy === expected.modifiedBy
  && actual.changeReference === expected.changeReference;

const buildOverallDeliveryContract = (
  shellRecords: readonly IAdminTypedConfigShellRecord[],
  environment: string,
  performanceYear: number,
  expectedAuthority?: IAdminOverallDeliveryAuthorityExpectation
): IAdminOverallDeliveryConfigurationContract => {
  const resolve = (key: string): IAdminTypedConfigShellRecord => {
    const matches = shellRecords.filter(record => record.identity.state === 'Active' && record.identity.key === key);
    if (matches.length !== 1) throw new Error(`Overall Delivery configuration requires one active ${key} record.`);
    if (matches[0].value.valueType !== 'Number') throw new Error(`Overall Delivery configuration ${key} must be numeric.`);
    return matches[0];
  };
  const core = resolve(ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight);
  const impact = resolve(ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight);
  const coreWeight = core.value.valueType === 'Number' ? core.value.value : Number.NaN;
  const impactWeight = impact.value.valueType === 'Number' ? impact.value.value : Number.NaN;
  if (!Number.isInteger(coreWeight) || !Number.isInteger(impactWeight)
    || coreWeight < 0 || coreWeight > 100 || impactWeight < 0 || impactWeight > 100
    || coreWeight + impactWeight !== 100) {
    throw new Error('Overall Delivery Core and Impact weights must be whole-number percentages from 0 to 100 totalling exactly 100%.');
  }
  const versionToken = `${core.identity.itemId}@${core.identity.etag}|${impact.identity.itemId}@${impact.identity.etag}`;
  const contract: IAdminOverallDeliveryConfigurationContract = Object.freeze({
    schema: 'KCF.OverallDelivery.Configuration' as const,
    schemaVersion: 1 as const,
    sourceList: 'KCFKPI_Config' as const,
    environment,
    performanceYear,
    versionToken,
    weights: Object.freeze({ core: coreWeight, impact: impactWeight, total: 100 as const }),
    includedCategories: Object.freeze(['Core', 'Impact'] as ['Core', 'Impact']),
    excludedCategories: Object.freeze(['Behaviours'] as ['Behaviours']),
    behavioursExcludedFromDeliveryArithmetic: true as const,
    poorCoreMaskingGuard: 'RequiredDownstreamGovernedRule' as const,
    poorCoreThresholdConfiguredHere: false as const,
    authority: Object.freeze({
      core: Object.freeze({ identity: core.identity, provenance: core.provenance }),
      impact: Object.freeze({ identity: impact.identity, provenance: impact.provenance })
    }),
    tenantMutationExecuted: false as const
  });
  const authorityExpectation = expectedAuthority
    ? snapshotOverallDeliveryAuthorityExpectation(expectedAuthority)
    : undefined;
  if (authorityExpectation && (
    clean(authorityExpectation.environment) !== contract.environment
    || exactYear(authorityExpectation.performanceYear, 'expected Overall Delivery PerformanceYear') !== contract.performanceYear
    || clean(authorityExpectation.versionToken) !== contract.versionToken
    || !sameProvenance(contract.authority.core.provenance, authorityExpectation.coreProvenance)
    || !sameProvenance(contract.authority.impact.provenance, authorityExpectation.impactProvenance)
  )) {
    throw new Error('Overall Delivery configuration authority, version or provenance changed after it was loaded.');
  }
  return contract;
};

/**
 * Establishes the fail-closed typed shell over existing Config rows. Environment, year,
 * identity, state, version and provenance are checked before any value is disclosed.
 */
export const buildAdminTypedConfigShell = (
  records: readonly IAdminConfigSourceRecord[],
  expectedEnvironment: string,
  expectedPerformanceYear: number,
  expectedOverallDeliveryAuthority?: IAdminOverallDeliveryAuthorityExpectation
): IAdminTypedConfigShell => {
  const safeRecords = snapshotAdminConfigRecords(records);
  const environment = clean(expectedEnvironment);
  if (!environment) throw new Error('Admin Config typed shell requires an exact expected Environment.');
  const year = exactYear(expectedPerformanceYear, 'expected PerformanceYear');
  const validation = validateAdminConfigSet(safeRecords);
  if (!validation.valid) throw new Error(`Admin Config typed shell validation failed. ${validation.issues.map(issue => issue.message).join(' ')}`);

  const end = safeRecords.filter(record => record.active && record.key === CONFIG_KEYS.performanceYearEnd);
  if (end.length !== 1 || !end[0].dateValue) throw new Error('Admin Config typed shell could not resolve one active PerformanceYear.End.');
  const actualYear = new Date(end[0].dateValue).getUTCFullYear();
  if (actualYear !== year) {
    throw new Error(`Admin Config PerformanceYear mismatch: expected ${year}, found ${actualYear}.`);
  }

  const shellRecords = safeRecords.map(record => {
    const identity = configIdentity(record);
    if (identity.environment !== environment) {
      throw new Error(`Admin Config ${record.key} Environment mismatch: expected ${environment}, found ${identity.environment}.`);
    }
    return Object.freeze({
      identity,
      value: readAdminConfigTypedValue(record),
      provenance: assertProvenance(record)
    });
  }).sort((left, right) => left.identity.key.localeCompare(right.identity.key)
    || left.identity.itemId - right.identity.itemId);
  const frozenShellRecords = Object.freeze(shellRecords);
  const overallDelivery = buildOverallDeliveryContract(
    frozenShellRecords,
    environment,
    actualYear,
    expectedOverallDeliveryAuthority
  );

  return Object.freeze({
    mode: 'DecisionIndependent' as const,
    sourceList: 'KCFKPI_Config' as const,
    environment,
    performanceYear: actualYear,
    records: frozenShellRecords,
    overallDelivery,
    scoringInterpretationApplied: false as const,
    tenantMutationExecuted: false as const
  });
};

export const buildAdminOverallDeliveryConfigurationContract = (
  records: readonly IAdminConfigSourceRecord[],
  expectedEnvironment: string,
  expectedPerformanceYear: number,
  expectedAuthority?: IAdminOverallDeliveryAuthorityExpectation
): IAdminOverallDeliveryConfigurationContract => buildAdminTypedConfigShell(
  records,
  expectedEnvironment,
  expectedPerformanceYear,
  expectedAuthority
).overallDelivery;

/** Consumer adapter over the existing governed Config reader; no alternative weight policy or issuer. */
export const readOverallDeliveryWeightConfiguration = (
  records: readonly IAdminConfigSourceRecord[],
  expectedEnvironment: string,
  expectedPerformanceYear: number,
  expectedAuthority?: IAdminOverallDeliveryAuthorityExpectation
): Readonly<IOverallDeliveryWeightConfiguration> => {
  const contract = buildAdminOverallDeliveryConfigurationContract(records, expectedEnvironment, expectedPerformanceYear, expectedAuthority);
  return Object.freeze({
    configurationKey: `${contract.sourceList}|${contract.environment}|${contract.performanceYear}`,
    configurationVersion: contract.versionToken,
    coreWeight: contract.weights.core,
    impactWeight: contract.weights.impact,
    sourceReference: 'KCF-KPI-Sponsor-PD-01' as const
  });
};

const sameIdentity = (actual: IAdminConfigStableIdentity, expected: IAdminConfigStableIdentity): boolean => (
  actual.itemId === expected.itemId
  && actual.key === expected.key
  && actual.environment === expected.environment
  && actual.etag === expected.etag
  && actual.state === expected.state
);

/**
 * Builds an immutable browser-memory candidate only after exact optimistic-concurrency checks.
 * It never writes to SharePoint and never interprets threshold values as scoring outcomes.
 */
export const buildAdminConfigMaintenancePlan = (
  records: readonly IAdminConfigSourceRecord[],
  context: IAdminConfigMaintenanceContext,
  requests: readonly IAdminConfigMaintenanceRequest[]
): IAdminConfigMaintenancePlan => {
  const safeRecords = snapshotAdminConfigRecords(records);
  const expectedEnvironment = clean(context.expectedEnvironment);
  const expectedYear = exactYear(context.expectedPerformanceYear, 'expected PerformanceYear');
  const targetYear = exactYear(context.targetPerformanceYear ?? expectedYear, 'target PerformanceYear');
  const actorEmail = clean(context.actorEmail);
  const occurredAt = clean(context.occurredAt);
  const changeReference = clean(context.changeReference);
  if (!actorEmail || !occurredAt || Number.isNaN(Date.parse(occurredAt)) || !changeReference) {
    throw new Error('Admin Config maintenance requires attributable actor, occurrence time and ChangeReference provenance.');
  }
  buildAdminTypedConfigShell(safeRecords, expectedEnvironment, expectedYear);
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new Error('Admin Config maintenance requires at least one typed replacement.');
  }
  const requestKeys = requests.map(request => `${request.expectedIdentity.itemId}|${request.expectedIdentity.key}`);
  if (new Set(requestKeys).size !== requestKeys.length) {
    throw new Error('Admin Config maintenance contains a duplicate stable identity.');
  }

  const replacements: IAdminConfigSourceRecord[] = [];
  requests.forEach(request => {
    const matches = safeRecords.filter(record => record.id === request.expectedIdentity.itemId
      && record.key === request.expectedIdentity.key);
    if (matches.length !== 1) throw new Error('Admin Config maintenance could not resolve one exact physical identity.');
    const current = matches[0];
    const actualIdentity = configIdentity(current);
    if (!sameIdentity(actualIdentity, request.expectedIdentity)) {
      throw new Error(`Admin Config ${current.key} identity, version, state or Environment changed after it was loaded.`);
    }
    if (actualIdentity.state !== 'Active') throw new Error(`Admin Config ${current.key} is not Active.`);
    const currentValue = readAdminConfigTypedValue(current);
    if (JSON.stringify(currentValue) === JSON.stringify(request.value)) {
      throw new Error(`Admin Config ${current.key} maintenance must change the typed value.`);
    }
    replacements.push({
      ...writeAdminConfigTypedValue(current, request.value),
      modifiedAt: occurredAt,
      modifiedBy: actorEmail,
      changeReference
    });
  });

  const byIdentity = new Map(replacements.map(record => [`${record.id}|${record.key}`, record]));
  const candidate = safeRecords.map(record => ({
    ...(byIdentity.get(`${record.id}|${record.key}`) || record)
  }));
  buildAdminTypedConfigShell(candidate, expectedEnvironment, targetYear);
  const frozenReplacements = Object.freeze(replacements.map(record => Object.freeze({ ...record })));
  const frozenCandidate = Object.freeze(candidate.map(record => Object.freeze({ ...record })));
  return Object.freeze({
    mode: 'BrowserMemoryCandidate' as const,
    sourceList: 'KCFKPI_Config' as const,
    environment: expectedEnvironment,
    expectedPerformanceYear: expectedYear,
    targetPerformanceYear: targetYear,
    expectedEtags: Object.freeze(replacements.map(record => record.etag!)),
    replacements: frozenReplacements,
    candidate: frozenCandidate,
    attribution: Object.freeze({ actorEmail, occurredAt, changeReference }),
    scoringInterpretationApplied: false as const,
    tenantMutationExecuted: false as const
  });
};

const issueBelongsToCategory = (
  issue: IAdminConfigValidationIssue,
  category: AdminConfigCategory
): boolean => {
  const definition = getAdminConfigDefinition(issue.key);
  if (definition) return definition.category === category;
  if (issue.key === 'Workplan.Weight') return category === 'WorkplanDefaultsGuardrails';
  if (issue.key === 'OverallDelivery.Weight') return category === 'OverallDelivery';
  if (issue.key === 'QuarterReminderDays') return category === 'ReminderMetadata';
  if (issue.key === 'Period.Q1-Q4') return category === 'QuarterDeadlines';
  return false;
};

/**
 * Applies related Config drafts as one immutable candidate and validates only that group for the save gate.
 * The complete result is still returned so unrelated issues remain visible, but do not block a valid repair.
 */
export const validateAdminConfigGroupReplacements = (
  records: readonly IAdminConfigSourceRecord[],
  category: AdminConfigCategory,
  replacements: readonly IAdminConfigSourceRecord[]
): IAdminConfigGroupReplacementResult => {
  const preflightIssues: IAdminConfigValidationIssue[] = [];
  if (!replacements.length) {
    pushIssue(preflightIssues, 'InvalidValue', category, `No ${categoryTitles[category]} values were supplied.`);
  }
  const replacementKeys = replacements.map(replacement => replacement.key);
  if (new Set(replacementKeys).size !== replacementKeys.length) {
    pushIssue(preflightIssues, 'DuplicateActiveKey', category, `${categoryTitles[category]} contains duplicate replacement keys.`);
  }
  replacements.forEach(replacement => {
    const definition = getAdminConfigDefinition(replacement.key);
    if (!definition) {
      pushIssue(preflightIssues, 'UnsupportedKey', replacement.key, `${replacement.key} is not supported by this Admin form and cannot be edited here.`);
    } else if (definition.category !== category) {
      pushIssue(preflightIssues, 'InvalidValue', replacement.key, `${replacement.key} does not belong to the ${categoryTitles[category]} group.`);
    }
  });
  if (preflightIssues.length) {
    const result = { valid: false, issues: preflightIssues };
    return { category, candidate: records.slice(), result, fullResult: validateAdminConfigSet(records) };
  }

  const replacementKeySet = new Set(replacementKeys);
  const candidate = records
    .filter(record => !(record.active && replacementKeySet.has(record.key)))
    .concat(replacements.map(replacement => ({ ...replacement })));
  const fullResult = validateAdminConfigSet(candidate);
  const groupIssues = fullResult.issues.filter(issue => issueBelongsToCategory(issue, category));
  return {
    category,
    candidate,
    result: { valid: groupIssues.length === 0, issues: groupIssues },
    fullResult
  };
};

/**
 * Pure edit guard used before any adapter attempts a write. It returns a new candidate set and never mutates the input.
 * Unknown keys, type changes and any cross-field corruption are rejected.
 */
export const validateAdminConfigReplacement = (
  records: readonly IAdminConfigSourceRecord[],
  replacement: IAdminConfigSourceRecord
): { candidate: IAdminConfigSourceRecord[]; result: IAdminConfigValidationResult } => {
  const definition = getAdminConfigDefinition(replacement.key);
  if (!definition) {
    const issue: IAdminConfigValidationIssue = {
      code: 'UnsupportedKey',
      key: replacement.key,
      message: `${replacement.key} is not supported by this Admin form and cannot be edited here.`
    };
    return { candidate: records.slice(), result: { valid: false, issues: [issue] } };
  }
  const checked = validateAdminConfigGroupReplacements(records, definition.category, [replacement]);
  return { candidate: checked.candidate, result: checked.result };
};

export const buildAdminConfigView = (records: readonly IAdminConfigSourceRecord[]): IAdminConfigView => {
  const validation = validateAdminConfigSet(records);
  const active = activeRecordsByKey(records);
  const overallDeliveryPresent = records.some(record => record.key === ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.coreWeight
    || record.key === ADMIN_OVERALL_DELIVERY_CONFIG_KEYS.impactWeight);
  const categories: readonly AdminConfigCategory[] = overallDeliveryPresent
    ? [...ADMIN_CONFIG_CATEGORY_ORDER, 'OverallDelivery']
    : ADMIN_CONFIG_CATEGORY_ORDER;
  const definitions = overallDeliveryPresent ? allConfigDefinitions : ADMIN_CONFIG_DEFINITIONS;
  const groups = categories.map(category => {
    const items = definitions.filter(definition => definition.category === category).map(definition => {
      const matches = active.get(definition.key) || [];
      const record = matches.length === 1 ? matches[0] : undefined;
      const issues = validation.issues.filter(issue => issue.key === definition.key
        || (definition.category === 'WorkplanDefaultsGuardrails' && issue.key === 'Workplan.Weight')
        || (definition.category === 'OverallDelivery' && issue.key === 'OverallDelivery.Weight')
        || (definition.category === 'ReminderMetadata' && issue.key === 'QuarterReminderDays')
        || (definition.category === 'QuarterDeadlines' && issue.key === 'Period.Q1-Q4'));
      const state: AdminConfigItemState = matches.length === 0 ? 'Missing' : issues.length ? 'Invalid' : 'Valid';
      return {
        definition,
        record,
        currentValue: formatAdminConfigValue(record),
        state,
        issues,
        lastUpdatedAt: record?.modifiedAt,
        lastUpdatedBy: record?.modifiedBy
      };
    });
    return {
      category,
      title: categoryTitles[category],
      items,
      attentionCount: items.filter(item => item.state !== 'Valid').length
    };
  });
  const unsupportedRecords = records.filter(record => !getAdminConfigDefinition(record.key));
  const missingRequiredKeys = validation.issues
    .filter(issue => issue.code === 'MissingRequiredKey').map(issue => issue.key);
  const invalidKeys = validation.issues
    .filter(issue => issue.code !== 'MissingRequiredKey' && issue.code !== 'UnsupportedKey')
    .map(issue => issue.key)
    .filter((key, index, keys) => keys.indexOf(key) === index);
  const unsupportedKeys = unsupportedRecords.map(record => record.key)
    .filter((key, index, keys) => keys.indexOf(key) === index);
  const totalProblems = missingRequiredKeys.length + invalidKeys.length + unsupportedKeys.length;
  return {
    groups,
    validation,
    attention: {
      requiresAttention: totalProblems > 0,
      totalProblems,
      missingRequiredKeys,
      invalidKeys,
      unsupportedKeys,
      headline: totalProblems ? `${totalProblems} Config item${totalProblems === 1 ? '' : 's'} need Admin attention.` : 'Config is complete and valid.'
    },
    unsupportedRecords,
    notificationsEnabled: false
  };
};
