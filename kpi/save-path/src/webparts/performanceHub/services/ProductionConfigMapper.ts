import type { IConfigRecord, IProductionConfig } from '../models/ProductionModels';
import type { IQuarterTimingConfig } from '../models/GovernanceModels';

export const CONFIG_KEYS = {
  performanceYear: 'PerformanceYear.Current',
  performanceYearStart: 'PerformanceYear.Start',
  performanceYearEnd: 'PerformanceYear.End',
  q1: 'Period.Q1',
  q2: 'Period.Q2',
  q3: 'Period.Q3',
  q4: 'Period.Q4',
  coreWeight: 'Workplan.Weight.Core',
  personalWeight: 'Workplan.Weight.LocalPersonal',
  behaviourWeight: 'Workplan.Weight.Behaviours',
  greenThreshold: 'RAG.GreenThresholdPct',
  amberThreshold: 'RAG.AmberThresholdPct',
  aggregationMethods: 'Aggregation.PermittedMethods',
  retentionStatus: 'Retention.PolicyStatus',
  quarterEarlyReviewReminderDays: 'QuarterEarlyReviewReminderDays',
  quarterPreparationReminderDays: 'QuarterPreparationReminderDays',
  quarterFinalReminderDays: 'QuarterFinalReminderDays',
  employeeSubmissionDaysAfterQuarter: 'EmployeeSubmissionDaysAfterQuarter',
  managerReviewDaysAfterSubmissionDeadline: 'ManagerReviewDaysAfterSubmissionDeadline'
} as const;

const indexConfig = (records: IConfigRecord[]): Map<string, IConfigRecord> => {
  const byKey = new Map<string, IConfigRecord>();
  records.filter(record => record.active).forEach(record => {
    if (byKey.has(record.key)) {
      throw new Error(`Production Config contains more than one active ${record.key} record.`);
    }
    byKey.set(record.key, record);
  });
  return byKey;
};

const requireRecord = (records: Map<string, IConfigRecord>, key: string, expectedType: IConfigRecord['valueType']): IConfigRecord => {
  const record = records.get(key);
  if (!record) throw new Error(`Production Config is missing ${key}.`);
  if (record.valueType !== expectedType) throw new Error(`Production Config ${key} must use ${expectedType}.`);
  return record;
};

const readText = (records: Map<string, IConfigRecord>, key: string): string => {
  const value = requireRecord(records, key, 'Text').textValue?.trim();
  if (!value) throw new Error(`Production Config ${key} has no text value.`);
  return value;
};

const readNumber = (records: Map<string, IConfigRecord>, key: string): number => {
  const value = requireRecord(records, key, 'Number').numberValue;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Production Config ${key} has no valid number.`);
  return value;
};

const readDate = (records: Map<string, IConfigRecord>, key: string): string => {
  const value = requireRecord(records, key, 'Date').dateValue;
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(`Production Config ${key} has no valid date.`);
  return value;
};

const readStringArray = (records: Map<string, IConfigRecord>, key: string): string[] => {
  const raw = requireRecord(records, key, 'JSON').jsonValue;
  if (!raw) throw new Error(`Production Config ${key} has no JSON value.`);
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(`Production Config ${key} contains invalid JSON.`);
  }
  if (!Array.isArray(value) || !value.length || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw new Error(`Production Config ${key} must contain a non-empty string array.`);
  }
  return value.map(item => String(item));
};

export const mapProductionConfig = (records: IConfigRecord[]): IProductionConfig => {
  const byKey = indexConfig(records);
  const start = readDate(byKey, CONFIG_KEYS.performanceYearStart);
  const end = readDate(byKey, CONFIG_KEYS.performanceYearEnd);
  if (Date.parse(start) >= Date.parse(end)) throw new Error('The configured Performance Year start must be before its end.');

  return {
    performanceYear: readText(byKey, CONFIG_KEYS.performanceYear),
    performanceYearStart: start,
    performanceYearEnd: end,
    performanceYearNumber: new Date(end).getUTCFullYear(),
    quarters: {
      q1: readText(byKey, CONFIG_KEYS.q1),
      q2: readText(byKey, CONFIG_KEYS.q2),
      q3: readText(byKey, CONFIG_KEYS.q3),
      q4: readText(byKey, CONFIG_KEYS.q4)
    },
    weights: {
      core: readNumber(byKey, CONFIG_KEYS.coreWeight),
      personal: readNumber(byKey, CONFIG_KEYS.personalWeight),
      behaviours: readNumber(byKey, CONFIG_KEYS.behaviourWeight)
    },
    rag: {
      greenThreshold: readNumber(byKey, CONFIG_KEYS.greenThreshold),
      amberThreshold: readNumber(byKey, CONFIG_KEYS.amberThreshold)
    },
    aggregationMethods: readStringArray(byKey, CONFIG_KEYS.aggregationMethods),
    retentionStatus: readText(byKey, CONFIG_KEYS.retentionStatus)
  };
};

export const mapQuarterTimingConfig = (records: IConfigRecord[]): IQuarterTimingConfig => {
  const byKey = indexConfig(records);
  return {
    earlyReviewReminderDays: readNumber(byKey, CONFIG_KEYS.quarterEarlyReviewReminderDays),
    preparationReminderDays: readNumber(byKey, CONFIG_KEYS.quarterPreparationReminderDays),
    finalReminderDays: readNumber(byKey, CONFIG_KEYS.quarterFinalReminderDays),
    employeeSubmissionDays: readNumber(byKey, CONFIG_KEYS.employeeSubmissionDaysAfterQuarter),
    managerReviewDays: readNumber(byKey, CONFIG_KEYS.managerReviewDaysAfterSubmissionDeadline)
  };
};
